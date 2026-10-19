/*
 * RE-TEMPO · usage-bar (user mod layer)
 * ---------------------------------------------------------------------------
 * Plan usage (not the context window, which the composer ring already shows),
 * Orca style, from the left rail:
 *   1. two rings just above the bug button (Claude on top, then GPT, a 1px
 *      separator, then the bug): fill = % used of each provider's shortest window,
 *      from the top and clockwise like a progress bar; centre = compact time to
 *      reset ("3h", "5d", "28m"); aria-label carries the details. A provider
 *      without a reading keeps an empty ring with "–". The whole group highlights
 *      on hover;
 *   2. hover (150 ms in, 200 ms out) or click on the group: "Usage" popover,
 *      opening upwards, always anchored to the group, with ↻ and "Updated … ago".
 *      Per provider, up to 3 windows (shortest first) with a thin bar and
 *      "22% · 35m"; account and source are in the provider row's title. A click
 *      pins it; click again, Escape or a click outside closes it.
 *   Host: when the DOM has a rendered [data-rtu-rings-host] (the project sidebar
 *   footer), the rings give way there to one compact Orca line ("Used ✱
 *   22%·3h12m ⊛ 0%·6d5h ↻", same popover on hover) and leave the rail; it follows
 *   hosts that appear, go, hide or are re-created, and falls back to the rail.
 *
 * Sources (local files only; the mod never reads a credential):
 *   - Claude: ~/.local/state/claude-usage/<account>.json, written by the user's
 *     statusline (~/.local/bin/claude-usage-statusline) from Claude Code's
 *     rate_limits; plus oauth-usage.json, written by bin/claude-usage-oauth.mjs
 *     (get_usage through the installed claude CLI), which adds the per-model
 *     weekly limits (model_scoped, e.g. Fable).
 *   - Codex: last "rate_limits" line (token_count event) of the rollouts in
 *     ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl. Windows primary/secondary.
 * Read through the bridges the app already exposes: electronAPI.fs.*.
 *
 * Accounts shown: the one logged into the installed `claude` CLI (matched via
 * get_usage), plus statusline accounts with a reading from the last 24 h that
 * still covers an open window; Codex when its last reading covers an open window.
 *
 * HOME: RE-TEMPO runs with an isolated HOME (~/RE-TEMPO/_home), so the real home
 * is the home-folder prefix of the app's HOME. Override: localStorage
 * "re-tempo.usage.home" (e.g. "/path/to/home").
 *
 * Reads every 5 min, on ↻ and when the popover opens with data older than
 * 1 min. No data: "—". Introspection: window.__RE_TEMPO_USAGE__.
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (window.__RE_TEMPO_USAGE__) return; // injected twice

  const REFRESH_MS = 5 * 60 * 1000;
  const TICK_MS = 30 * 1000; // only recomputes countdowns, no disk reads
  const REREAD_ON_OPEN_MS = 60 * 1000; // popover open: re-read if older
  const RECENT_MS = 24 * 60 * 60 * 1000; // statusline account counts as current
  const WARN_PCT = 80;
  const CRIT_PCT = 95;
  const CODEX_DAY_DIRS = 7; // day folders scanned, newest first
  const CODEX_FILES = 3; // most recent rollouts (by mtime) that are read
  const HOME_KEY = "re-tempo.usage.home";

  const api = () => window.electronAPI;
  // accounts: [{key, provider, title, account, email, source, updatedAt, cliLogin,
  //             oauthAt, reached, windows:[{id,label,pct,resetAt,placeholder}]}]
  const state = { accounts: [], loaded: false, lastRefreshAt: 0, refreshing: false, homes: [], oauthAt: null };

  // ---------------------------------------------------------------- utilities
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
  const toMs = (v) => {
    if (v == null) return null;
    if (typeof v === "number") return v > 1e11 ? v : v * 1000;
    const t = Date.parse(v);
    return isNaN(t) ? null : t;
  };
  const unwrap = (r) => (r && r.success ? r.data : null);

  async function call(fn, ...args) {
    try {
      return unwrap(await fn(...args));
    } catch (_) {
      return null;
    }
  }
  const readDir = (p) => call(api().fs.readDir, p);
  const readFile = (p) => call(api().fs.readFile, p);
  const stat = (p) => call(api().fs.stat, p);

  function fmtLeft(ms) {
    const mins = Math.floor(Math.max(ms, 0) / 60000);
    if (mins < 1) return "<1m";
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
  }

  // Compact time to reset for the ring centre: "5d", "3h", "28m".
  // Ring label: days and hours round UP when there is a remainder (2h22m -> "3h",
  // 4d12h -> "5d"); minutes only below one hour.
  function fmtShort(ms) {
    const mins = Math.floor(Math.max(ms, 0) / 60000);
    if (mins < 1) return "<1m";
    if (mins >= 1440) return `${Math.ceil(mins / 1440)}d`;
    if (mins >= 60) return `${Math.ceil(mins / 60)}h`;
    return `${mins}m`;
  }

  function fmtAgo(ms) {
    if (ms == null) return "unknown";
    const s = Math.max(0, Date.now() - ms);
    if (s < 60000) return "just now";
    return `${fmtLeft(s)} ago`;
  }

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const level = (pct) => (pct == null ? "" : pct >= CRIT_PCT ? "crit" : pct >= WARN_PCT ? "warn" : "");

  // A window as shown now: an expired one counts as 0% (it already reset); a
  // window with neither % nor reset is dropped.
  function live(w) {
    if (!w) return null;
    const expired = w.resetAt != null && w.resetAt <= Date.now();
    if (expired) return { ...w, pct: 0, expired: true };
    if (w.pct == null) return null;
    return { ...w, expired: false };
  }
  const liveWindows = (acc) => acc.windows.map(live).filter(Boolean);
  const leftText = (w) => (w.expired || w.resetAt == null ? "" : fmtLeft(w.resetAt - Date.now()));
  const hasOpenWindow = (acc) => acc.windows.some((w) => !w.placeholder && w.resetAt != null && w.resetAt > Date.now());

  // The shortest window the data has (Claude five_hour, the hours one of Codex),
  // as shown now; the weekly one only when no shorter window exists. A window
  // that already reset shows 0% without a countdown.
  function shortest(acc) {
    const ws = acc.windows.filter((w) => !w.placeholder && (w.pct != null || w.resetAt != null));
    ws.sort((a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity));
    return ws.length ? live(ws[0]) : null;
  }

  // The tightest window: highest %, ties broken by the nearest reset.
  function headline(acc) {
    let best = null;
    for (const w of liveWindows(acc)) {
      if (
        !best ||
        w.pct > best.pct ||
        (w.pct === best.pct && (w.resetAt || Infinity) < (best.resetAt || Infinity))
      )
        best = w;
    }
    return best;
  }

  // ---------------------------------------------------------------- real HOME
  async function resolveHomes() {
    const out = [];
    try {
      const o = (localStorage.getItem(HOME_KEY) || "").trim();
      if (o) out.push(o.replace(/\/+$/, ""));
    } catch (_) {
      /* storage unavailable */
    }
    const home = await call(api().workspaces.getHomeDir);
    if (home) {
      const m = /^\/Users\/[^/]+/.exec(home);
      if (m && m[0] !== home) out.push(m[0]);
      out.push(home.replace(/\/+$/, ""));
    }
    return [...new Set(out)];
  }

  // ---------------------------------------------------------------- Claude
  const CLAUDE_RANK = { five_hour: 0, seven_day: 1 };
  // Buckets Claude Code itself never shows as a window (the CLI's tt() returns null).
  const CLAUDE_HIDDEN = new Set(["seven_day_oauth_apps", "seven_day_cowork", "seven_day_overage_included", "seven_day_omelette"]);
  // Per-model window always listed in the panel ("—" without data). The statusline
  // never receives it; it comes from get_usage (bin/claude-usage-oauth.mjs).
  const CLAUDE_ALWAYS = ["Fable"];
  const OAUTH_FILE = "oauth-usage.json"; // written by the helper, not a statusline account
  const SAME_WINDOW_MS = 5 * 60 * 1000; // same reset time = same account

  function claudeLabel(key) {
    if (key === "five_hour") return "Session";
    if (key === "seven_day") return "Weekly";
    const m = /^seven_day_(.+)$/.exec(key);
    return cap((m ? m[1] : key).replace(/_/g, " "));
  }

  const sortWindows = (ws) => ws.sort((a, b) => (CLAUDE_RANK[a.id] ?? 2) - (CLAUDE_RANK[b.id] ?? 2));

  function withAlways(windows) {
    if (!windows.length) return windows;
    for (const name of CLAUDE_ALWAYS) {
      if (!windows.some((w) => w.label.toLowerCase() === name.toLowerCase()))
        windows.push({ id: `model:${name}`, label: name, pct: null, resetAt: null, placeholder: true });
    }
    return windows;
  }

  // Windows of one file: keys with used_percentage (five_hour, seven_day,
  // seven_day_<model>) and the model_scoped array ([{model|display_name,
  // percent|utilization|used_percentage, resets_at}]).
  function claudeWindows(d) {
    const windows = [];
    for (const [k, v] of Object.entries(d)) {
      if (CLAUDE_HIDDEN.has(k)) continue;
      if (!v || typeof v !== "object" || Array.isArray(v) || !("used_percentage" in v || "utilization" in v)) continue;
      windows.push({ id: k, label: claudeLabel(k), minutes: k === "five_hour" ? 300 : 10080, pct: num(v.used_percentage ?? v.utilization), resetAt: toMs(v.resets_at) });
    }
    for (const m of Array.isArray(d.model_scoped) ? d.model_scoped : []) {
      const name = m && (m.model || m.display_name);
      if (typeof name !== "string" || windows.some((w) => w.label.toLowerCase() === name.toLowerCase())) continue;
      windows.push({ id: `model:${name}`, label: name, minutes: 10080, pct: num(m.percent ?? m.used_percentage ?? m.utilization), resetAt: toMs(m.resets_at) });
    }
    return sortWindows(windows);
  }

  // get_usage belongs to the account logged into the CLI. It joins the statusline
  // account with the same Session (or Weekly) reset; without a match it becomes
  // an account of its own. The plan label comes from get_usage, never a file name.
  function mergeOauth(accounts, o) {
    const ow = claudeWindows(o);
    if (!ow.length) return;
    const oAt = toMs(o.updated_at);
    const email = (o.account && o.account.email) || null;
    const plan = (o.account && o.account.subscription_type) || null;
    const near = (id, acc) => {
      const a = acc.windows.find((w) => w.id === id);
      const b = ow.find((w) => w.id === id);
      return a && b && a.resetAt != null && b.resetAt != null && Math.abs(a.resetAt - b.resetAt) <= SAME_WINDOW_MS;
    };
    const target = accounts.find((a) => near("five_hour", a)) || accounts.find((a) => near("seven_day", a));
    if (!target) {
      accounts.push({ key: "claude:cli", provider: "claude", title: "Claude", account: plan, plan, email, source: "get_usage", updatedAt: oAt, oauthAt: oAt, cliLogin: true, windows: ow });
      return;
    }
    const newer = (oAt || 0) > (target.updatedAt || 0);
    const byLabel = new Map(target.windows.map((w) => [w.label.toLowerCase(), w]));
    for (const w of ow) if (newer || !byLabel.has(w.label.toLowerCase())) byLabel.set(w.label.toLowerCase(), w);
    target.windows = sortWindows([...byLabel.values()]);
    target.source = `${target.source} + get_usage`;
    target.account = plan;
    target.plan = target.plan || plan; // the statusline's tier (max20x) beats get_usage's "Claude Max"
    target.email = email;
    target.oauthAt = oAt;
    target.cliLogin = true;
    if (newer) target.updatedAt = oAt;
  }

  // Only real accounts: the CLI login, or a recent statusline reading that still
  // covers an open window (an old file of an account no longer in use is hidden).
  const isCurrentClaude = (acc) => acc.cliLogin || (Date.now() - (acc.updatedAt || 0) <= RECENT_MS && hasOpenWindow(acc));

  async function loadClaude(homes) {
    for (const home of homes) {
      const dir = `${home}/.local/state/claude-usage`;
      const entries = await readDir(dir);
      if (!entries) continue;
      const files = entries.filter((e) => e.isFile && /^[^.].*\.json$/.test(e.name) && e.name !== "chained-statusline.json");
      const accounts = [];
      let oauth = null;
      for (const f of files) {
        const text = await readFile(f.path);
        if (!text) continue;
        let d;
        try {
          d = JSON.parse(text);
        } catch (_) {
          continue;
        }
        if (!d || typeof d !== "object") continue;
        if (f.name === OAUTH_FILE) {
          oauth = d;
          continue;
        }
        const windows = claudeWindows(d);
        if (!windows.length) continue;
        accounts.push({
          key: `claude:${f.name}`,
          provider: "claude",
          title: "Claude",
          account: null,
          plan: typeof d.account === "string" ? d.account : null, // statusline file: "max20x", "max5x"
          source: typeof d.source === "string" ? d.source : "statusline",
          updatedAt: toMs(d.updated_at),
          windows,
        });
      }
      state.oauthAt = oauth ? toMs(oauth.updated_at) : null;
      if (oauth) mergeOauth(accounts, oauth);
      const shown = accounts.filter(isCurrentClaude);
      for (const a of shown) a.windows = withAlways(a.windows);
      if (!shown.length) continue;
      shown.sort((a, b) => (b.cliLogin ? 1 : 0) - (a.cliLogin ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
      return shown;
    }
    return [];
  }

  // ---------------------------------------------------------------- get_usage helper
  // Runs bin/claude-usage-oauth.mjs in the app's pty (terminalBridge) with the real
  // HOME and the user's interactive login shell (zsh -il: their PATH, node and
  // claude come from .zshrc). One run at a time; the helper also holds its own lock.
  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || "";
  const OAUTH_STALE_MS = 5 * 60 * 1000; // when the popover opens
  const OAUTH_EVERY_MS = 15 * 60 * 1000; // while the app is open
  const OAUTH_TIMEOUT_MS = 60 * 1000;
  const oauthRun = { running: false, lastRunAt: 0, last: null };

  function helperPath() {
    try {
      return SCRIPT_SRC ? decodeURIComponent(new URL("bin/claude-usage-oauth.mjs", SCRIPT_SRC).pathname) : null;
    } catch (_) {
      return null;
    }
  }

  function runOauth() {
    const tb = window.terminalBridge;
    const file = helperPath();
    const home = state.homes[0];
    if (oauthRun.running || !tb || !tb.create || !file || !home) return;
    oauthRun.running = true;
    oauthRun.lastRunAt = Date.now();
    markBusy();
    const id = `re-tempo-usage-${crypto.randomUUID()}`;
    const dec = new TextDecoder();
    let out = "";
    let done = false;
    let offData = null;
    let offExit = null;
    const finish = (res) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { offData && offData(); } catch (_) {}
      try { offExit && offExit(); } catch (_) {}
      Promise.resolve(tb.dispose && tb.dispose(id)).catch(() => {});
      oauthRun.running = false;
      oauthRun.last = res;
      const reread = () => (state.refreshing ? setTimeout(reread, 300) : refresh());
      reread();
    };
    const timer = setTimeout(() => finish({ ok: false, error: "timeout" }), OAUTH_TIMEOUT_MS);
    offData = tb.onData(id, (d) => {
      const s = typeof d === "string" ? d : dec.decode(d, { stream: true });
      try { tb.ack && tb.ack(id, d.byteLength ?? d.length); } catch (_) {}
      out = (out + s).slice(-8000);
    });
    offExit = tb.onExit(id, (code) =>
      setTimeout(() => {
        const m = /RTU:(\{[^\r\n]*\})/.exec(out);
        let res = { ok: false, code };
        if (m) try { res = JSON.parse(m[1]); } catch (_) {}
        finish(res);
      }, 60)
    );
    const q = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
    Promise.resolve(
      tb.create({ id, shell: "/usr/bin/env", args: [`HOME=${home}`, "/bin/zsh", "-ilc", `exec node ${q(file)}`], size: { cols: 1000, rows: 20 } })
    ).catch((e) => finish({ ok: false, error: String((e && e.message) || e) }));
  }

  const oauthStale = (ms) => !state.oauthAt || Date.now() - state.oauthAt > ms;

  // ---------------------------------------------------------------- Codex
  const codexCache = new Map(); // path -> {mtime, hit}

  function codexLabel(minutes) {
    if (minutes === 300) return "Session";
    if (minutes === 10080) return "Weekly";
    if (!minutes) return "Window";
    return minutes % 1440 === 0 ? `${minutes / 1440}-day` : `${Math.round(minutes / 60)}-hour`;
  }

  async function codexDayDirs(root) {
    const days = [];
    const byNameDesc = (list) =>
      (list || []).filter((e) => e.isDirectory && /^\d+$/.test(e.name)).sort((a, b) => (a.name < b.name ? 1 : -1));
    for (const y of byNameDesc(await readDir(root))) {
      for (const m of byNameDesc(await readDir(y.path))) {
        for (const d of byNameDesc(await readDir(m.path))) {
          days.push(d.path);
          if (days.length >= CODEX_DAY_DIRS) return days;
        }
      }
    }
    return days;
  }

  // Last usable rate_limits line of a rollout (read from the end).
  function lastRateLimits(text) {
    const lines = text.split("\n");
    let fallback = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line.includes('"rate_limits"')) continue;
      let d;
      try {
        d = JSON.parse(line);
      } catch (_) {
        continue;
      }
      const rl = d && d.payload && d.payload.rate_limits;
      if (!rl || (!rl.primary && !rl.secondary)) continue;
      const hit = { rl, at: toMs(d.timestamp) };
      if (!rl.limit_id || rl.limit_id === "codex") return hit;
      if (!fallback) fallback = hit;
    }
    return fallback;
  }

  function codexWindow(id, w, at) {
    if (!w) return null;
    let resetAt = toMs(w.resets_at);
    if (resetAt == null && num(w.resets_in_seconds) != null && at != null) resetAt = at + w.resets_in_seconds * 1000;
    return { id, label: codexLabel(num(w.window_minutes)), minutes: num(w.window_minutes), pct: num(w.used_percent), resetAt };
  }

  async function loadCodex(homes) {
    for (const home of homes) {
      const days = await codexDayDirs(`${home}/.codex/sessions`);
      if (!days.length) continue;
      const files = [];
      for (const day of days) {
        for (const e of (await readDir(day)) || []) {
          if (e.isFile && /^rollout-.*\.jsonl$/.test(e.name)) files.push(e.path);
        }
      }
      const stats = await Promise.all(files.map(async (p) => ({ p, s: await stat(p) })));
      const recent = stats
        .filter((x) => x.s)
        .map((x) => ({ p: x.p, mtime: toMs(x.s.mtime) || 0 }))
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, CODEX_FILES);
      let best = null;
      for (const f of recent) {
        let c = codexCache.get(f.p);
        if (!c || c.mtime !== f.mtime) {
          const text = await readFile(f.p);
          c = { mtime: f.mtime, hit: text ? lastRateLimits(text) : null };
          codexCache.set(f.p, c);
        }
        if (c.hit && (!best || (c.hit.at || 0) > (best.at || 0))) best = c.hit;
      }
      if (!best) continue;
      const { rl, at } = best;
      const acc = {
        key: "codex",
        provider: "codex",
        title: "Codex",
        account: rl.plan_type ? `${rl.plan_type} plan` : null,
        plan: rl.plan_type || null,
        source: "last Codex session",
        updatedAt: at,
        reached: rl.rate_limit_reached_type || null,
        windows: [codexWindow("primary", rl.primary, at), codexWindow("secondary", rl.secondary, at)].filter(Boolean),
      };
      // a reading whose windows have all reset no longer describes a live account
      return hasOpenWindow(acc) ? [acc] : [];
    }
    return [];
  }

  // ---------------------------------------------------------------- icons
  // Logos (lobehub icons, MIT; the same ones Orca uses), viewBox 0 0 24 24.
  // currentColor: they take the text color of each level (white logos).
  const LOGOS = {
    claude:
      '<path fill="currentColor" fill-rule="nonzero" d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"/>',
    codex:
      '<path fill="currentColor" fill-rule="evenodd" d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z"/>',
  };
  const svg = (inner, size) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">${inner}</svg>`;
  const ICON_REFRESH =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 ' +
    '4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>';
  const ICON_CHEVRON =
    '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4l4 4-4 4"/></svg>';

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function logo(provider, size) {
    const s = el("span", `rtu-logo rtu-logo-${provider}`);
    s.innerHTML = svg(LOGOS[provider], size);
    return s;
  }

  const firstOf = (provider) => state.accounts.find((a) => a.provider === provider) || null;

  // ---------------------------------------------------------------- rail rings
  // In the rail, mounted just before the bug button inside its container (the
  // flex column that sits above the settings icon), so it follows the native
  // icon spacing; a [data-rtu-rings-host] takes precedence (see mountRails).
  const BUG_BTN = '[data-testid="bug-report-button"]';
  const RING_R = 11.5; // viewBox 26 inside a 30px button (2px padding), stroke 3
  const mounted = new Set(); // every mounted group: rail rings or host line

  function buildRing(provider) {
    const b = el("button", `rtu-ring rtu-ring-${provider}`);
    b.type = "button";
    b.setAttribute("aria-haspopup", "dialog");
    b.setAttribute("aria-expanded", "false");
    b.dataset.provider = provider;
    b.innerHTML =
      '<svg viewBox="0 0 26 26" width="26" height="26" aria-hidden="true" focusable="false">' +
      `<circle class="rtu-ring-track" cx="13" cy="13" r="${RING_R}" fill="none" pathLength="100"/>` +
      `<circle class="rtu-ring-arc" cx="13" cy="13" r="${RING_R}" fill="none" pathLength="100" stroke-linecap="round" transform="rotate(-90 13 13)"/>` +
      "</svg>";
    b.append(el("span", "rtu-ring-text"));
    b.addEventListener("click", (e) => groupClick(b.parentElement, e));
    return b;
  }

  // Click on a group (a ring, or the host line): pins a popover opened by hover,
  // opens and pins a closed one, closes a pinned one.
  function groupClick(box, e) {
    clearTimeout(ringT);
    if (pop.el && pop.anchor === box && !ringPinned) {
      ringPinned = true; // opened by hover: the click pins it
      markActive(box);
      return;
    }
    ringPinned = false;
    if (!(pop.el && pop.anchor === box)) ringPinned = true; // opened by this click: stays until closed
    togglePop(box, e.detail === 0);
    markActive(ringPinned && pop.anchor === box ? box : null);
  }

  function markActive(box) {
    for (const g of document.querySelectorAll("[data-re-tempo-usage][data-pinned]")) g.removeAttribute("data-pinned");
    if (box) box.setAttribute("data-pinned", "");
  }

  const RING_HOVER_IN_MS = 150;
  const RING_HOVER_OUT_MS = 200;
  let ringT = 0;
  let ringPinned = false; // a click keeps the popover open when the pointer leaves
  const hovered = (n) => !!n && n.isConnected && n.matches(":hover");

  function ringHover(box, enter) {
    clearTimeout(ringT);
    if (enter) {
      if (pop.el && pop.anchor) return; // already open (here or from the footer)
      ringPinned = false;
      ringT = setTimeout(() => {
        if (hovered(box) && !(pop.el && pop.anchor)) togglePop(box, false);
      }, RING_HOVER_IN_MS);
      return;
    }
    const tryClose = () => {
      if (!pop.el || pop.anchor !== box || ringPinned) return;
      if (hovered(box) || hovered(pop.el)) {
        ringT = setTimeout(tryClose, RING_HOVER_OUT_MS);
        return;
      }
      closePop();
    };
    ringT = setTimeout(tryClose, RING_HOVER_OUT_MS);
  }

  // The popover also arms the close timer when the pointer leaves it.
  function watchPopHover() {
    if (!pop.el || pop.el.dataset.rtuHover) return;
    pop.el.dataset.rtuHover = "1";
    pop.el.addEventListener("pointerleave", () => pop.anchor && mounted.has(pop.anchor) && ringHover(pop.anchor, false));
  }

  function buildRail() {
    const box = el("div", "rtu-rings");
    box.setAttribute("data-re-tempo-usage", "");
    box.append(buildRing("claude"), buildRing("codex")); // Claude on top, GPT below
    // One popover position for both rings: anchored to the whole block, opened
    // on hover (short delay in, longer out so the pointer can reach the popover).
    box.addEventListener("pointerenter", () => ringHover(box, true));
    box.addEventListener("pointerleave", () => ringHover(box, false));
    return box;
  }

  // Fill = % used, from the top and clockwise like a progress bar;
  // centre = compact time to reset of the shortest window; details in the tooltip.
  function fillRing(b, acc, name) {
    const w = acc && shortest(acc);
    const used = w ? Math.min(100, Math.max(0, w.pct)) : null;
    const left = used == null ? 0 : 100 - used;
    b.querySelector(".rtu-ring-arc").style.strokeDasharray = `${used || 0} ${100 - (used || 0)}`;
    b.querySelector(".rtu-ring-text").textContent = w && !w.expired && w.resetAt != null ? fmtShort(w.resetAt - Date.now()) : "–";
    b.dataset.hasData = w ? "1" : "";
    b.dataset.level = level(used);
    b.dataset.used = used == null ? "" : String(Math.round(used));
    b.dataset.left = used == null ? "" : String(Math.round(left));
    const reset = w ? leftText(w) : "";
    const tip = w
      ? `${name} · ${Math.round(used)}% used (${Math.round(left)}% left) · ${w.label || "window"}${w.expired ? " (already reset)" : reset ? ` · resets in ${reset}` : ""}`
      : `${name} · no usage reading yet (${acc ? "no open window" : "nothing found in the local usage files"})`;
    b.setAttribute("aria-label", tip);
  }

  function renderRail(box) {
    fillRing(box.querySelector(".rtu-ring-codex"), firstOf("codex"), "GPT (Codex)");
    fillRing(box.querySelector(".rtu-ring-claude"), firstOf("claude"), "Claude");
  }

  // ---------------------------------------------------------------- host line
  // Inside a host (the project sidebar footer) the rings give way to one compact
  // line, Orca style: "Used  ✱ 22%·3h12m  ⊛ 0%·6d5h  ↻". Per provider, the
  // shortest window's % and time to reset; one line, never cut with "…": when
  // it does not fit, the "Used" label goes first, then the times (data-fit,
  // measured on every render and on every host resize). The whole line anchors
  // the popover, with the rings' hover and click rules.
  function refreshButton() {
    const btn = el("button", "rtu-refresh");
    btn.type = "button";
    btn.setAttribute("aria-label", "Refresh usage");
    btn.title = "Refresh usage";
    btn.innerHTML = ICON_REFRESH;
    btn.addEventListener("click", () => {
      refresh();
      runOauth();
    });
    return btn;
  }

  function lineSeg(provider) {
    const s = el("span", `rtu-seg rtu-seg-${provider}`);
    s.append(logo(provider, 14), el("span", "rtu-pct"), el("span", "rtu-left"));
    return s;
  }

  function buildLine() {
    const box = el("div", "rtu-line");
    box.setAttribute("data-re-tempo-usage", "");
    const open = el("button", "rtu-line-open");
    open.type = "button";
    open.setAttribute("aria-haspopup", "dialog");
    open.append(el("span", "rtu-line-label", "Used"), lineSeg("claude"), lineSeg("codex"));
    open.addEventListener("click", (e) => groupClick(box, e));
    box.append(open, refreshButton());
    box.addEventListener("pointerenter", () => ringHover(box, true));
    box.addEventListener("pointerleave", () => ringHover(box, false));
    if (typeof ResizeObserver === "function") {
      let raf = 0;
      const ro = new ResizeObserver(() => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (box.isConnected) fitLine(box);
        });
      });
      ro.observe(box);
      for (const k of open.children) ro.observe(k); // child widths change when fonts load
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => box.isConnected && fitLine(box));
    }
    return box;
  }

  function fillSeg(s, acc, name) {
    const w = acc && shortest(acc);
    const left = w ? leftText(w) : "";
    s.querySelector(".rtu-pct").textContent = w ? `${Math.round(w.pct)}%` : "–";
    const lf = s.querySelector(".rtu-left");
    lf.dataset.full = left.replace(/ /g, ""); // "3h12m"; fitLine may shorten it to "3h"
    lf.textContent = lf.dataset.full;
    s.dataset.hasData = w ? "1" : "";
    s.dataset.level = level(w ? w.pct : null);
    return w ? `${name} ${Math.round(w.pct)}% used${left ? `, resets in ${left}` : ""}` : `${name} no reading`;
  }

  function renderLine(box) {
    const said = [
      fillSeg(box.querySelector(".rtu-seg-claude"), firstOf("claude"), "Claude"),
      fillSeg(box.querySelector(".rtu-seg-codex"), firstOf("codex"), "Codex"),
    ];
    box.querySelector(".rtu-line-open").setAttribute("aria-label", `Plan usage: ${said.join("; ")}`);
    box.classList.toggle("rtu-busy", state.refreshing || oauthRun.running);
    fitLine(box);
  }

  // Always starts from the full times ("4h12m", "6d5h") and shortens one step at
  // a time only on real overflow measured in the DOM (scrollWidth > clientWidth
  // of the row): full -> first unit only ("4h") -> percentages only. It expands
  // again when there is room, with 2px of hysteresis so it never flickers. The
  // "Used" label is mandatory and never dropped; the last step clips rather than
  // ellipsize. Re-run by a ResizeObserver on the line (see buildLine).
  const FIT_STEPS = ["", "short", "no-time"];
  const FIT_HYST = 2;
  const FIT_GAP = 8;
  function applyFit(box, step) {
    box.dataset.fit = step;
    for (const n of box.querySelectorAll(".rtu-left")) {
      const full = n.dataset.full || "";
      n.textContent = step === "short" ? (full.match(/^\d+[a-z]+/i) || [full])[0] : full;
    }
  }
  function fitLine(box) {
    const open = box.querySelector(".rtu-line-open");
    const btn = box.querySelector(".rtu-refresh");
    const avail = box.clientWidth - (btn ? btn.offsetWidth : 0);
    if (!open || !box.clientWidth) return;
    const cur = Math.max(0, FIT_STEPS.indexOf(box.dataset.fit || ""));
    for (let i = 0; i < FIT_STEPS.length; i++) {
      applyFit(box, FIT_STEPS[i]);
      // wider than the current step needs 8px of spare room to be chosen
      const slack = i < cur ? FIT_HYST : 0;
      // natural width of the row (children are flex:none) + fixed 12px gaps must fit
      // beside the refresh button; never shorten while the natural sum fits
      const kids = [...open.children];
      const need = kids.reduce((w, k) => w + k.getBoundingClientRect().width, 0) + FIT_GAP * (kids.length - 1);
      if (need + slack <= avail || i === FIT_STEPS.length - 1) return;
    }
  }

  const renderGroup = (box) => (box.dataset.place === "host" ? renderLine(box) : renderRail(box));

  // ↻ spins on the popover and on every host line while a read or get_usage runs.
  function markBusy() {
    const busy = state.refreshing || oauthRun.running;
    if (pop.el) pop.el.classList.toggle("rtu-busy", busy);
    for (const box of mounted) if (box.dataset.place === "host") box.classList.toggle("rtu-busy", busy);
  }

  // ---------------------------------------------------------------- mount: host or rail
  // A [data-rtu-rings-host] anywhere in the DOM (the project sidebar footer) takes
  // the group: one compact line per host (see buildLine), without the rail
  // separator, and the rail rings go away. Without a host the group sits in the native
  // rail, above the bug button. Hosts can appear, go or be re-created at any
  // time: the body observer (boot) remounts, debounced. A host that is
  // disconnected or not rendered (display:none on it or an ancestor) counts as
  // absent; a ResizeObserver on every host catches that, since hiding a host
  // changes no DOM node the body observer sees.
  const HOST_SEL = "[data-rtu-rings-host]";
  const isSep = (n) => !!n && n.classList.contains("rtu-rails-sep");
  const usableHost = (h) => h.isConnected && (h.offsetParent !== null || h.getClientRects().length > 0);
  const watchedHosts = new Set();
  let hostRO = null;

  function watchHosts(all) {
    if (!hostRO && typeof ResizeObserver === "function") hostRO = new ResizeObserver(() => scheduleMount());
    if (!hostRO) return;
    for (const h of watchedHosts) {
      if (h.isConnected) continue;
      hostRO.unobserve(h);
      watchedHosts.delete(h);
    }
    for (const h of all) {
      if (watchedHosts.has(h)) continue;
      hostRO.observe(h);
      watchedHosts.add(h);
    }
  }

  // Rail group still in place: group, separator, bug button, in that order.
  function railIntact(box) {
    const sep = box.nextElementSibling;
    return isSep(sep) && !!sep.nextElementSibling && sep.nextElementSibling.matches(BUG_BTN);
  }

  function dropBox(box) {
    const sep = box.nextElementSibling;
    if (box.dataset.place === "rail" && isSep(sep)) sep.remove();
    box.remove();
    mounted.delete(box);
  }

  function addBox(parent, before, place) {
    const box = place === "host" ? buildLine() : buildRail();
    box.dataset.place = place;
    parent.insertBefore(box, before);
    mounted.add(box);
    renderGroup(box);
    return box;
  }

  function mountRails() {
    const all = [...document.querySelectorAll(HOST_SEL)];
    watchHosts(all);
    const hosts = all.filter(usableHost);
    const anchored = pop.anchor && mounted.has(pop.anchor) ? pop.anchor : null;
    let lost = null; // the popover's group, when it goes in this pass
    for (const box of [...mounted]) {
      const parent = box.parentElement;
      const ok =
        box.isConnected &&
        (hosts.length ? box.dataset.place === "host" && hosts.includes(parent) : box.dataset.place === "rail" && railIntact(box));
      if (ok) continue;
      if (box === anchored) lost = box;
      dropBox(box);
    }
    const added = [];
    if (hosts.length) {
      for (const sep of document.querySelectorAll(".rtu-rails-sep")) sep.remove(); // orphans too
      for (const host of hosts) {
        if (![...host.children].some((c) => mounted.has(c))) added.push(addBox(host, null, "host"));
      }
    } else {
      for (const bug of document.querySelectorAll(BUG_BTN)) {
        const parent = bug.parentElement;
        if (!parent) continue;
        const prev = bug.previousElementSibling;
        if (isSep(prev) && mounted.has(prev.previousElementSibling)) continue;
        if (isSep(prev)) prev.remove(); // orphan separator: its group went away
        added.push(addBox(parent, bug, "rail"));
        const sep = el("div", "rtu-rails-sep");
        sep.setAttribute("data-re-tempo-usage", "");
        parent.insertBefore(sep, bug);
      }
    }
    if (lost) reanchor(lost, added);
  }

  // The popover's group was replaced (the host footer re-rendered): follow the
  // new group in the same kind of place, pinned state included; otherwise close.
  function reanchor(lost, added) {
    const next = added.find((b) => b.dataset.place === lost.dataset.place);
    if (!next || !pop.el) return closePop();
    pop.anchor = next;
    next.setAttribute("aria-expanded", "true");
    if (lost.hasAttribute("data-pinned")) next.setAttribute("data-pinned", "");
    placePop();
  }

  // ---------------------------------------------------------------- level 2: popover
  const pop = { el: null, anchor: null };

  function buildPop() {
    const p = el("div", "rtu-pop");
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-label", "Usage");
    p.setAttribute("data-re-tempo-usage", "");
    const head = el("div", "rtu-pop-head");
    head.append(el("span", "rtu-pop-title", "Usage"), el("span", "rtu-pop-upd"), refreshButton());
    p.append(head, el("div", "rtu-pop-list"));
    p.addEventListener("keydown", onPopKey);
    return p;
  }

  const MAX_WINDOWS = 3;
  const PLAN_NAMES = { max20x: "20x", max5x: "5x", pro: "Pro", team: "Team", enterprise: "Enterprise", prolite: "Pro Lite", plus: "Plus", free: "Free", max: "Max", claudemax: "Max" };
  // Readable plan for the provider row; nothing when the reading has no plan.
  function planLabel(acc) {
    const raw = String(acc.plan || "").trim();
    if (!raw) return "";
    return PLAN_NAMES[raw.toLowerCase().replace(/[^a-z0-9]/g, "")] || cap(raw.toLowerCase().replace(/[_-]+/g, " "));
  }

  // One block per provider: a header row (logo, name, plan) and up to 3
  // windows, shortest first: label, 3px bar, "22% · 35m". Everything the old
  // side panel showed (account, source, limit reached) lives in a title.
  function renderPop() {
    if (!pop.el) return;
    pop.el.classList.toggle("rtu-busy", state.refreshing || oauthRun.running);
    const stamps = state.accounts.map((a) => a.updatedAt).filter((t) => t != null);
    pop.el.querySelector(".rtu-pop-upd").textContent = stamps.length ? `Updated ${fmtAgo(Math.max(...stamps))}` : "";
    const list = pop.el.querySelector(".rtu-pop-list");
    list.textContent = "";
    if (!state.accounts.length) {
      list.append(el("div", "rtu-empty", state.loaded ? "No usage data found" : "Loading…"));
    }
    for (const acc of state.accounts) {
      const block = el("div", "rtu-prov");
      block.dataset.provider = acc.provider;
      const head = el("div", "rtu-prov-head");
      head.title = [acc.email, acc.account, acc.source, acc.reached ? `limit reached: ${acc.reached}` : ""].filter(Boolean).join(" · ");
      head.append(logo(acc.provider, 14), el("span", "rtu-prov-name", acc.title), el("span", "rtu-prov-plan", planLabel(acc)));
      block.append(head);
      const wins = liveWindows(acc)
        .sort((x, y) => (x.minutes ?? Infinity) - (y.minutes ?? Infinity))
        .slice(0, MAX_WINDOWS);
      if (!wins.length) block.append(el("div", "rtu-nodata", "no recent reading"));
      for (const w of wins) {
        const row = el("div", "rtu-win");
        row.dataset.level = level(w.pct);
        const bar = el("div", "rtu-bar");
        bar.setAttribute("role", "meter");
        bar.setAttribute("aria-label", `${acc.title} ${w.label} usage`);
        bar.setAttribute("aria-valuemin", "0");
        bar.setAttribute("aria-valuemax", "100");
        bar.setAttribute("aria-valuenow", String(Math.round(w.pct)));
        const fill = el("span", "rtu-bar-fill");
        fill.style.width = `${Math.min(100, Math.max(0, w.pct))}%`;
        bar.append(fill);
        const left = leftText(w);
        row.append(el("span", "rtu-win-label", w.label), bar, el("span", "rtu-win-val", `${Math.round(w.pct)}%${left ? ` · ${left.replace(/ /g, "")}` : ""}`));
        row.title = `${w.label}: ${Math.round(w.pct)}% used${w.expired ? ", already reset" : left ? `, resets in ${left}` : ""}`;
        block.append(row);
      }
      list.append(block);
    }
    placePop();
  }

  function placePop() {
    if (!pop.el || !pop.anchor) return;
    const a = pop.anchor.getBoundingClientRect();
    const w = pop.el.offsetWidth;
    const h = pop.el.offsetHeight;
    // Above the group with left edges aligned, so it grows to the right of a
    // rail or sidebar-footer anchor; below when there is no room above; always
    // clamped inside the viewport (8px margin).
    const left = Math.min(Math.max(8, a.left), window.innerWidth - w - 8);
    const above = a.top - h - 6 >= 8;
    const top = Math.max(8, Math.min(above ? a.top - h - 6 : a.bottom + 6, window.innerHeight - h - 8));
    pop.el.style.left = `${Math.round(left)}px`;
    pop.el.style.top = `${Math.round(top)}px`;
  }

  function togglePop(anchor, viaKeyboard) {
    if (pop.el && pop.anchor === anchor) return closePop();
    closePop();
    pop.anchor = anchor;
    pop.el = pop.el || buildPop();
    document.body.append(pop.el);
    anchor.setAttribute("aria-expanded", "true");
    renderPop();
    watchPopHover();
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onEsc, true);
    window.addEventListener("resize", placeAll);
    if (viaKeyboard) {
      const first = pop.el.querySelector(".rtu-refresh");
      if (first) first.focus();
    }
    if (Date.now() - state.lastRefreshAt > REREAD_ON_OPEN_MS) refresh();
    if (oauthStale(OAUTH_STALE_MS)) runOauth();
  }

  function closePop() {
    markActive(null);
    if (pop.anchor) pop.anchor.setAttribute("aria-expanded", "false");
    if (pop.el) pop.el.remove();
    pop.anchor = null;
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("keydown", onEsc, true);
    window.removeEventListener("resize", placeAll);
  }

  function onOutside(e) {
    const t = e.target;
    if (pop.el && pop.el.contains(t)) return;
    if (pop.anchor && pop.anchor.contains(t)) return;
    closePop();
  }

  // Another layer opened on top of the popover (an app dialog or menu, another
  // mod's panel) owns that Escape: let it close first, the popover stays.
  const OTHER_LAYER = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [cmdk-root]';

  function onEsc(e) {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    const t = e.target && e.target.closest ? e.target : null;
    const layer = t && t.closest(OTHER_LAYER);
    if (layer && pop.el && !pop.el.contains(layer)) return;
    e.stopPropagation();
    const back = pop.anchor;
    closePop();
    if (back && back.focus) back.focus();
  }

  function onPopKey(e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...pop.el.querySelectorAll(".rtu-refresh")];
    const i = items.indexOf(document.activeElement);
    const next = items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }

  function placeAll() {
    placePop();
  }

  // ---------------------------------------------------------------- render and cycle
  function render() {
    for (const box of mounted) if (box.isConnected) renderGroup(box);
    if (pop.el && pop.el.isConnected) renderPop();
  }

  async function refresh() {
    if (state.refreshing) return;
    if (!api() || !api().fs || !api().workspaces) {
      state.loaded = true;
      render();
      return;
    }
    state.refreshing = true;
    markBusy();
    const started = Date.now();
    try {
      state.homes = await resolveHomes();
      const [claude, codex] = await Promise.all([
        loadClaude(state.homes).catch(() => []),
        loadCodex(state.homes).catch(() => []),
      ]);
      state.accounts = [...claude, ...codex];
      state.loaded = true;
      state.lastRefreshAt = Date.now();
    } finally {
      // minimum ↻ spin so a click gets visible feedback
      await new Promise((r) => setTimeout(r, Math.max(0, 400 - (Date.now() - started))));
      state.refreshing = false;
      render();
    }
  }

  let mountScheduled = false;
  function scheduleMount() {
    if (mountScheduled) return;
    mountScheduled = true;
    setTimeout(() => {
      mountScheduled = false;
      mountRails();
      for (const box of mounted) if (box.dataset.place === "host" && box.isConnected) fitLine(box);
    }, 50);
  }

  function boot() {
    window.__RE_TEMPO_USAGE__ = {
      state,
      refresh,
      headline,
      liveWindows,
      runOauth,
      oauthRun,
      // every [data-rtu-rings-host] in the DOM, whether it counts (connected and
      // rendered), and its mounted group (null when absent or not mounted yet)
      hosts: () =>
        [...document.querySelectorAll(HOST_SEL)].map((host) => ({
          host,
          usable: usableHost(host),
          group: [...host.children].find((c) => mounted.has(c)) || null,
        })),
      // every mounted group: "host" (the compact line) or "rail" (the rings)
      groups: () => [...mounted].map((group) => ({ place: group.dataset.place, group, connected: group.isConnected })),
    };
    try {
      new MutationObserver(scheduleMount).observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-rtu-rings-host"],
      });
    } catch (_) {
      /* no observer: only mounts what already exists */
    }
    mountRails();
    refresh();
    // timers pause while the tab is hidden; on return, one refresh and a render
    const every = (fn, ms) => setInterval(() => { if (!document.hidden) fn(); }, ms);
    every(refresh, REFRESH_MS);
    every(() => {
      if (oauthStale(OAUTH_EVERY_MS - 60 * 1000)) runOauth();
    }, OAUTH_EVERY_MS);
    every(render, TICK_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      render();
      refresh();
    });
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
