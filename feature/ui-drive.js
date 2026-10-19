/*
 * RE-TEMPO · ui-drive (user MOD layer)
 * ---------------------------------------------------------------------------
 * Lets an agent drive the Tempo UI on the user's screen: open Settings, switch
 * the main section, open a canvas / doc / issue / agent / chat, open a URL in
 * a Browser tab, point at an element, show a short note. This mod is the
 * channel and the executor; ui-beam.js (a separate mod) draws the "someone is
 * using the UI" animation from the events below.
 *
 * Protocol: one command = an action and its arguments.
 *   open settings [section]          Settings route; section = a label of the
 *                                    Settings menu (Preferences, Chat, ...)
 *   go chat|design|docs|issues|agents|settings
 *   open canvas <name>
 *   open doc <title|id>
 *   open issue <key|number|title|id> e.g. TEM-12, #12
 *   open agent <name|id>
 *   open chat <title>
 *   open url <http(s)://...>         Browser tab in the center (chat route)
 *   focus <css selector|data-testid> scrolls to it, highlights it, focuses it
 *   highlight <selector> [ms]        scroll + highlight (300..10000 ms)
 *   toast <text>                     short note (max 200 chars, plain text)
 *   split left|right                 active tab into a split pane (pane-dock)
 *   run <id>                         RUN_ACTIONS only: toggle-left-panel,
 *                                    toggle-right-panel, toggle-split,
 *                                    focus-composer (or any registered id)
 *   screenshot [--canvas | --selector <css>] [--out /abs/file.png]
 *                                    window capture, cropped to the canvas or
 *                                    the element; PNG written through the fs
 *                                    bridge, else returned as a dataURL
 *   list                             the registered actions with their params
 *   <registered id> name=value ...   any action in window.__RE_TEMPO_ACTIONS__
 *                                    (positional words fill params in order,
 *                                    --name value works too)
 * Syntax inside an assistant message:
 *   - a line `@tempo-ui <action> <args>`: at the start of the line (at most 3
 *     spaces of indent), outside any other code fence. Inline code and
 *     indented code never match, so a command can be mentioned in backticks;
 *   - a fenced block whose info string is tempo-ui, holding JSON
 *     {"action": "open canvas", "args": {"name": "Home"}} (or an array of
 *     them, max 10; "args" may be a string; "open_settings" style names are
 *     accepted), or plain command lines.
 * The CLI (bin/tempo-ui) takes the same words: `tempo-ui open settings`.
 * help() returns the text to paste into a project's CLAUDE.md / AGENTS.md;
 * `tempo-ui --instructions` prints the same text.
 *
 * Command sources:
 *   (a) Chats: window.__chatSessionStoreDebug, the app's debug handle of the
 *       chat session store (bg-tasks and canvas-comment-agent read it too):
 *       getAllStateKeys() + getMessages(key), polled every 500 ms with an
 *       identity check per key (the store replaces the array on change).
 *       Only role "assistant" messages; only messages newer than this page
 *       load (timestamp >= load - 3 s; no timestamp: not present at the first
 *       poll). While a message streams, only finished lines and closed fences
 *       count. Each command runs once: `<message id>#<n-th command>` is kept
 *       in localStorage "rtd.uiDrive.seen" (last 300), plus a guard against
 *       the same command from the same chat within 5 s.
 *   (b) CLI: bin/tempo-ui appends {id, ts, action, args, cwd, raw, agent} to
 *       ~/.tempo/ui-commands.jsonl. Read through the app's preload fs bridge
 *       (electronAPI.fs.stat + readFile, the calls usage-bar uses), polled
 *       every 700 ms, re-read only when stat changes. RE-TEMPO runs with an
 *       isolated HOME, so both the app's HOME (electronAPI.workspaces.
 *       getHomeDir) and the real home folder are read; override with
 *       localStorage "rtd.uiDrive.file" = absolute path. A line older than
 *       15 s when first read is dropped (no replay after a restart). Natives
 *       arrive validated as {action, args}; other ids as {argv}, resolved
 *       against the registry when they run. The reply goes to
 *       ui-replies.jsonl in the same folder (last 30 lines, rewritten with
 *       electronAPI.fs.writeFile): {id, status, reason, via, action, args,
 *       at, result?, dataUrl?}; only the newest reply keeps a dataUrl. The
 *       CLI waits for it, prints it and writes screenshot files.
 *   (c) window.__RE_TEMPO_UI_DRIVE__.run("open settings") (console, tests).
 *
 * Execution, one command at a time (FIFO):
 *   1. Validate: action allowlist (PLANS), http(s) only for URLs, selector
 *      length and syntax, run ids from RUN_ACTIONS. Nothing is ever eval'd.
 *      Refused commands get a short toast and a log entry. Rate limit: 8
 *      commands per 10 s.
 *   2. window event "rtud:action", detail = {id, action, args, label, source
 *      ("chat" | "cli" | "api"), sourceRect, targetEl, targetRect, status:
 *      "pending"}. sourceRect = the rendered command line in its chat, else
 *      that chat's last message, else the visible chat view, else null.
 *      targetEl = the control the action stands for (Settings gear, route
 *      button, sidebar row, the focus target, the note toast) or null;
 *      targetRect = its rect (split: the half of the center panel).
 *   3. If window.__RE_TEMPO_UI_BEAM__.play exists: awaits it (same detail,
 *      the beam shares one promise per id), at most 1.2 s. Screen changes
 *      (route, tab, split) meanwhile show a toast with "Deny".
 *   4. Run through the app's own navigation: project-sidebar's open.* when
 *      present, else the workspaces store (setActiveNavRoute,
 *      selectWorkspaceChat, openBrowserTab, openDesignTab), the rail buttons,
 *      the Settings menu buttons' own click, pane-dock's split().
 *   5. "rtud:done", detail = {id, action, args, label, status: "done" |
 *      "failed" | "denied", reason, via, resultEl, resultRect}. The toast
 *      turns into "Undo" (back to the previous route / workspace / tab;
 *      split: pane-dock undo) and "Always allow" (localStorage
 *      "rtd.uiDrive.allow" = "always": no more toasts for screen changes)
 *      until 4 s after it appeared (hover pauses it).
 * list and screenshot are quiet: no events, no beam, no toast (a capture
 * must not show them; html.rtud-capturing also hides ui-beam's overlay).
 *
 * Action registry: window.__RE_TEMPO_ACTIONS__ = { register(id, spec) ->
 *   unregister fn | false, unregister(id), has(id), get(id), list(),
 *   run(id, args) -> Promise<{status, reason, via, result}> }. The allowlist
 *   is this registry: the natives above plus what mods register.
 *   spec = { label: string | (args) => string, description?, params:
 *     [{name, type: "string"|"number"|"boolean"|"json", required?, enum?,
 *     default?, description?}], run: async (args, {source, who, id}) =>
 *     JSON result (throw or return {ok:false, reason} to fail), target?:
 *     (args) => Element | rect (where the beam lands), kind?, risk?: "safe"
 *     (runs at once) | "caution" (default: Deny while the beam flies, then
 *     "Always allow") | "destructive" (runs only after an explicit Allow
 *     within 10 s; never always-allowed), validate?: (args) => error | null,
 *     undo?: async (args, {result}) => bool, owner? }.
 *   Ids: a letter first, no spaces (spaces are the natives'), e.g. ui.click.
 *   Events: "rtd:actions-ready" {registry} once, "rtd:actions-changed"
 *   {id, op}. A mod loaded earlier pushes [id, spec] into
 *   window.__RE_TEMPO_ACTIONS_PENDING__ (an array); it is drained here and
 *   later pushes register at once. Other mods' registrations survive a
 *   re-injection of this mod.
 *   Adapters registered here for canvas-browser (its API:
 *   window.__RE_TEMPO_CANVAS_BROWSER__.create / navigate):
 *   canvas.browser.create {url, x?, y?, w?, h?} -> {id, url, x, y, w, h}
 *   (undo removes the frame), canvas.browser.navigate {id?, url} (default:
 *   the selected or only frame; undo goes back). http(s) only.
 *
 * In the transcript, a `@tempo-ui` line that ran gets data-rtud-cmd =
 * status on its paragraph (styled as a quiet chip by ui-drive.css).
 *
 * Off: localStorage "rtd.uiDrive" = "off": nothing runs. Commands are still
 * consumed and refused ("ui-drive is off", logged, the CLI gets the refusal),
 * so turning it back on never replays what arrived meanwhile.
 * Only the top-level window without an opener reads the sources (no popouts,
 * no iframes), so a command never runs twice.
 * Workspaces store: found like project-sidebar / pane-dock find it (zustand
 * getState in the deps of useSyncExternalStoreWithSelector), read only.
 * Public API: window.__RE_TEMPO_UI_DRIVE__ = { help(), run(cmd), parse(text),
 *   log(), state(), setEnabled(bool), setAlwaysAllow(bool), actions,
 *   runActions, registry, dispose() }; run() resolves the log entry plus
 *   result (and dataUrl for a screenshot).
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  const prev = window.__RE_TEMPO_UI_DRIVE__;
  if (prev && typeof prev.dispose === "function") {
    try {
      prev.dispose();
    } catch (_) {}
  }

  // ---------------------------------------------------------------- config
  const CFG = window.__RE_TEMPO_UI_DRIVE_CONFIG__ || {}; // test hook only
  const SELF_SRC = (document.currentScript && document.currentScript.src) || "";
  const FLAG_KEY = "rtd.uiDrive"; // "off" = disabled
  const ALLOW_KEY = "rtd.uiDrive.allow"; // "always" = no confirmation toast
  const SEEN_KEY = "rtd.uiDrive.seen";
  const FILE_KEY = "rtd.uiDrive.file";
  const POLL_MS = CFG.pollMs || 500;
  const FILE_POLL_MS = CFG.filePollMs || 700;
  const BEAM_MAX_MS = 1200;
  const TOAST_MS = 4000;
  const NOTE_MS = 5000;
  const LOG_MAX = 50;
  const SEEN_MAX = 300;
  const REPLY_MAX = 30;
  const REPLY_RESULT_MAX = 512 * 1024;
  const LOG_RESULT_MAX = 4000;
  const ASK_MS = CFG.askMs || 10000; // destructive: time to click Allow
  const FULL = Symbol("rtud.full");
  const FRESH_MS = 3000;
  const CLI_FRESH_MS = 15000;
  const REPEAT_MS = 5000;
  const RATE_WINDOW_MS = 10000;
  const RATE_MAX = 8;
  const START = Date.now();
  const IS_MAIN = window.top === window && !window.opener;
  const RAIL = '[data-testid="workspace-navbar"]';
  const UI_ATTR = "data-rtud-ui";
  const POPOVER = typeof HTMLElement !== "undefined" && "popover" in HTMLElement.prototype;
  const ID_RE = /^[a-z0-9]{20,}$/i;
  // Claude's asterisk, the same path ui-beam draws.
  const GLYPH =
    '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M14.6 2.2h2.7l-.2 9.1 4.2-8 2.4 1.4-4.8 7.8 7.8-4.8 1.4 2.4-8.1 4.5 9.2-.3v2.8l-9.1-.2 8 4.2-1.4 2.4-7.8-4.8 4.8 7.8-2.4 1.4-4.4-8.1.3 9.2h-2.8l.2-9.1-4.2 8-2.4-1.4 4.8-7.8-7.8 4.8-1.4-2.4 8.1-4.4-9.2.3v-2.8l9.1.2-8-4.2 1.4-2.4 7.8 4.8-4.8-7.8 2.4-1.4 4.4 8.1z"/></svg>';

  // Kept identical to INSTRUCTIONS in bin/tempo-ui (<CLI> = that script's path).
  const INSTRUCTIONS = `## Tempo UI control

You can drive the user's Tempo window: open a screen, take them somewhere,
point at something on it, or look at it. Do it when the user asks to see or
open something, or when showing the result clearly helps. Use one or two
commands per answer and say in words what you opened. The user sees an
animation and can Deny or Undo screen changes; never repeat a command the user
denied.

Two ways, same command words:
- Shell (preferred when you can run commands):
    tempo-ui open settings
  If tempo-ui is not on PATH:
    node "<CLI>" open settings
  It prints the result (done, denied, refused, failed, and any data the action
  returns) and exits 0 when the command ran or is queued.
- In your reply, on a line of its own (not indented, not in a code block):
    @tempo-ui open canvas Home
  or a fenced block whose language is tempo-ui, with JSON:
    \`\`\`tempo-ui
    {"action": "open doc", "args": {"title": "Launch plan"}}
    \`\`\`
  The line runs as soon as it appears. To mention a command without running
  it, wrap it in backticks.

Commands:
  open settings [section]            Settings; section = a Settings menu label
                                     (Preferences, Chat, Billing, Providers...)
  go chat|design|docs|issues|agents  switch the main section
  open canvas <name>
  open doc <title>
  open issue <key|number|title>      e.g. TEM-12 or #12
  open agent <name>
  open chat <title>
  open url <https://...>             Browser tab in the center (http/https only)
  focus <css selector|data-testid>   scroll to an element and highlight it
  highlight <css selector|data-testid> [ms]
  toast <text>                       short note on screen (max 200 characters)
  split left|right                   move the active tab into a split pane
  run <action>                       toggle-left-panel, toggle-right-panel,
                                     toggle-split, focus-composer
  screenshot [--canvas | --selector <css>] --out <file.png>
                                     capture the window, the canvas or one
                                     element to a PNG you can then read (shell)
  list                               every action the window knows, with its
                                     parameters; other mods register more
  <action id> name=value ...         run any listed action, e.g.
                                     tempo-ui canvas.browser.create url=https://example.com

Only listed actions run: no scripts, no file:, javascript: or data: URLs.
Actions marked destructive wait for the user's explicit Allow.
`;

  // --------------------------------------------------------------- helpers
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const lsGet = (k) => {
    try {
      return localStorage.getItem(k);
    } catch (_) {
      return null;
    }
  };
  const lsSet = (k, v) => {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch (_) {}
  };
  const enabled = () => lsGet(FLAG_KEY) !== "off";
  const alwaysAllow = () => lsGet(ALLOW_KEY) === "always";
  const norm = (s) =>
    String(s == null ? "" : s)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const quote = (s) => `“${clip(String(s), 60)}”`;
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const reduced = () => {
    try {
      return matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  };
  const toMs = (v) => {
    if (v == null || v === "") return null;
    if (typeof v === "number") return isFinite(v) ? (v > 1e11 ? v : v * 1000) : null;
    const t = Date.parse(v);
    return isNaN(t) ? null : t;
  };
  async function waitFor(fn, ms = 2000, step = 50) {
    const end = performance.now() + ms;
    for (;;) {
      let v = null;
      try {
        v = fn();
      } catch (_) {}
      if (v) return v;
      if (performance.now() > end) return null;
      await sleep(step);
    }
  }
  const withTimeout = (p, ms) => Promise.race([Promise.resolve(p), sleep(ms).then(() => null)]);
  const makeRect = (x, y, w, h) => ({ x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h });
  function rectOf(el) {
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    return makeRect(r.left, r.top, r.width, r.height);
  }
  function visible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  }
  function fullyVisible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
  }
  const ours = (el) => !!(el && el.closest && el.closest(`[${UI_ATTR}]`));
  function firstVisible(selectors) {
    for (const s of [].concat(selectors)) {
      let list;
      try {
        list = document.querySelectorAll(s);
      } catch (_) {
        continue;
      }
      for (const el of list) if (!ours(el) && visible(el)) return el;
    }
    return null;
  }
  // 4 exact, 3 prefix, 2 word start, 1 substring.
  function score(text, q) {
    const t = norm(text);
    if (!t || !q) return 0;
    if (t === q) return 4;
    if (t.startsWith(q)) return 3;
    if (new RegExp(`(^|[^a-z0-9])${escRe(q)}`).test(t)) return 2;
    return t.includes(q) ? 1 : 0;
  }
  function bestMatch(items, getText, q, min = 1) {
    let best = null;
    let bs = 0;
    for (const it of items) {
      const s = score(getText(it), q);
      if (s > bs) {
        bs = s;
        best = it;
      }
    }
    return bs >= min ? best : null;
  }
  const fire = (type, detail) => {
    try {
      window.dispatchEvent(new CustomEvent(type, { detail }));
    } catch (_) {}
  };
  const ok = (via, el) => ({ ok: true, via, el: el || null });
  const fail = (reason, via) => ({ ok: false, reason, via: via || null });

  // ------------------------------------------------------- workspaces store
  // Same mechanism as project-sidebar / pane-dock: zustand leaves getState in
  // the deps of useSyncExternalStoreWithSelector's useMemo; only pure `()=>x`
  // getters are called.
  const S = { ws: null };
  const GETTER_RE = /^\(\)=>[A-Za-z$_][\w$]*$/;
  const tried = new WeakSet();
  function checkFiber(f) {
    let h = f.memoizedState;
    if (!h || typeof h !== "object" || !("next" in h)) return;
    for (let i = 0; h && i < 400; i++, h = h.next) {
      const m = h.memoizedState;
      const d = Array.isArray(m) && m.length === 2 ? m[1] : null;
      if (!Array.isArray(d) || d.length !== 4 || typeof d[0] !== "function" || typeof d[2] !== "function") continue;
      const gs = d[0];
      if (tried.has(gs)) continue;
      tried.add(gs);
      if (!GETTER_RE.test(Function.prototype.toString.call(gs))) continue;
      let st;
      try {
        st = gs();
      } catch (_) {
        continue;
      }
      if (st && typeof st === "object" && Array.isArray(st.workspaces) && typeof st.setActiveNavRoute === "function") {
        S.ws = gs;
        return;
      }
    }
  }
  const fiberOf = (n) => {
    const k = n && Object.keys(n).find((x) => x.startsWith("__reactFiber$"));
    return k ? n[k] : null;
  };
  let scan = null;
  let lastScanEnd = -1e9;
  // 1) walk up from the rail; 2) a full tree scan, time-sliced (8 ms per tick).
  function discover() {
    if (S.ws) return true;
    for (let f = fiberOf(document.querySelector(RAIL)), up = 0; f && up < 600 && !S.ws; f = f.return, up++) checkFiber(f);
    if (S.ws) return true;
    if (!scan) {
      if (performance.now() - lastScanEnd < 2000) return false;
      const root = document.getElementById("root");
      const key = root && Object.keys(root).find((k) => k.startsWith("__reactContainer$"));
      if (!key) return false;
      scan = { stack: [root[key]], seen: new Set() };
    }
    const deadline = performance.now() + 8;
    while (scan.stack.length && performance.now() < deadline && !S.ws) {
      const f = scan.stack.pop();
      if (!f || scan.seen.has(f)) continue;
      scan.seen.add(f);
      checkFiber(f);
      if (f.child) scan.stack.push(f.child);
      if (f.sibling) scan.stack.push(f.sibling);
    }
    if (S.ws || !scan.stack.length) {
      scan = null;
      lastScanEnd = performance.now();
    }
    return !!S.ws;
  }
  const W = () => {
    if (!S.ws) discover();
    try {
      return S.ws ? S.ws() : null;
    } catch (_) {
      return null;
    }
  };
  const psApi = () => {
    const p = window.__RE_TEMPO_PROJECT_SIDEBAR__;
    return p && p.open && typeof p.model === "function" && p.enabled !== false ? p : null;
  };
  function psModel() {
    const p = psApi();
    if (!p) return null;
    try {
      return p.model();
    } catch (_) {
      return null;
    }
  }

  // ------------------------------------------------------------ navigation
  // The rail button's own click; the store setter as the fallback (Settings
  // has no route button: the app's own F3() calls setActiveNavRoute too).
  function goRoute(route) {
    const st = W();
    if (st && st.activeNavRoute === route) return "already";
    if (route !== "settings") {
      const btn = document.querySelector(`[data-testid="workspace-navbar-${route}-button"]`);
      if (btn) {
        btn.click();
        const now = W();
        if (!now || now.activeNavRoute === route) return "rail-click";
      }
    }
    if (st && typeof st.setActiveNavRoute === "function") {
      st.setActiveNavRoute(route);
      return "store.setActiveNavRoute";
    }
    const rm = window.__RE_TEMPO_RAIL_MENU__;
    if (route === "settings" && rm && typeof rm.run === "function") {
      rm.run("settings");
      return "rail-menu.run";
    }
    return null;
  }
  function route(r) {
    const p = psApi();
    if (p && typeof p.open.route === "function") {
      try {
        const via = p.open.route(r);
        if (via && via !== "none") return `project-sidebar.${via}`;
      } catch (_) {}
    }
    return goRoute(r);
  }
  function viewNow() {
    const st = W();
    if (!st) return null;
    const td = window.__tempoDocs;
    return {
      route: st.activeNavRoute || null,
      ws: st.selectedWorkspaceId || null,
      tab: st.activeCenterTabId || null,
      doc: td && td.selectedDocId ? td.selectedDocId : null,
    };
  }
  async function restoreView(v) {
    if (!v) return false;
    let st = W();
    if (!st) return false;
    if (v.ws && st.selectedWorkspaceId !== v.ws) {
      const fn = typeof st.switchToWorkspace === "function" ? st.switchToWorkspace : st.selectWorkspace;
      if (typeof fn === "function") await Promise.resolve(fn(v.ws)).catch(() => {});
    }
    st = W();
    if (v.route && st && st.activeNavRoute !== v.route) goRoute(v.route);
    st = W();
    if (v.tab && st && st.activeCenterTabId !== v.tab && Array.isArray(st.centerTabs) && st.centerTabs.some((t) => t && t.id === v.tab) && typeof st.setActiveCenterTab === "function") {
      st.setActiveCenterTab(v.tab);
    }
    const td = window.__tempoDocs;
    if (v.route === "docs" && td && typeof td.selectDoc === "function" && td.selectedDocId !== v.doc) td.selectDoc(v.doc);
    return true;
  }

  // ------------------------------------------------------------ app targets
  const gearEl = () => firstVisible([`${RAIL} button[aria-label="Settings"]`, 'button[aria-label="Settings"]', '[aria-label="Settings"]']);
  function routeEl(r) {
    if (r === "settings") return gearEl();
    return firstVisible([`[data-testid="workspace-navbar-${r}-button"]`]);
  }
  // The Settings menu (no testids: anchored on its "Personal" group, as
  // voice-input and the QA harness do).
  function settingsNav() {
    const prefs = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent.trim() === "Preferences" && b.parentElement && b.parentElement.firstElementChild && b.parentElement.firstElementChild.textContent.trim() === "Personal"
    );
    if (!prefs) return null;
    return prefs.closest(".w-60") || (prefs.parentElement && prefs.parentElement.parentElement) || prefs.parentElement;
  }
  function settingsNavButton(section) {
    const nav = settingsNav();
    if (!nav) return null;
    return bestMatch(Array.from(nav.querySelectorAll("button")), (b) => b.textContent, norm(section), 3);
  }
  function sidebarRow(kind, text) {
    const rows = Array.from(document.querySelectorAll(`.rtps-row[data-kind="${kind}"]`)).filter(visible);
    return bestMatch(rows, (r) => r.textContent, norm(text), 2);
  }
  const ROW_SEL = 'button, a[href], [role="treeitem"], [role="option"], [role="row"], [role="button"], [role="link"], li';
  function findByText(scopes, text) {
    const q = norm(text);
    if (!q) return null;
    const items = [];
    for (const s of scopes) {
      let roots;
      try {
        roots = document.querySelectorAll(s);
      } catch (_) {
        continue;
      }
      for (const root of roots) {
        if (root.matches(ROW_SEL) && visible(root) && !ours(root)) items.push(root);
        for (const el of root.querySelectorAll(ROW_SEL)) if (!ours(el) && visible(el)) items.push(el);
      }
    }
    return bestMatch(items, (el) => el.textContent, q, 3);
  }
  function composerEl() {
    return firstVisible(['.chat-view .ProseMirror[contenteditable="true"]', '.chat-view [contenteditable="true"]']);
  }
  function centerRect(side) {
    const c = document.querySelector('[data-tempo-workspace-panel="center"]');
    if (!c || !visible(c)) return null;
    const r = c.getBoundingClientRect();
    if (!side) return makeRect(r.left, r.top, r.width, r.height);
    const w = r.width / 2;
    return makeRect(side === "left" ? r.left : r.left + w, r.top, w, r.height);
  }
  // A selector, or a bare word as data-testid first (then tag/selector, then
  // aria-label). Visible matches win; our own UI never matches.
  function resolveEl(sel) {
    const s = String(sel || "").trim();
    if (!s) return null;
    const bare = /^[\w:.-]+$/.test(s);
    const tries = [];
    if (bare) tries.push(`[data-testid="${CSS.escape(s)}"]`);
    tries.push(s);
    if (bare) tries.push(`[aria-label="${CSS.escape(s)}"]`);
    let fallback = null;
    for (const t of tries) {
      let list;
      try {
        list = document.querySelectorAll(t);
      } catch (_) {
        continue;
      }
      for (const el of list) {
        if (ours(el)) continue;
        if (visible(el)) return el;
        if (!fallback && el.getClientRects().length) fallback = el;
      }
    }
    return fallback;
  }
  async function settleScroll(el, max = 600) {
    const end = performance.now() + max;
    let last = null;
    let still = 0;
    while (performance.now() < end) {
      await new Promise((r) => requestAnimationFrame(r));
      const t = el.getBoundingClientRect().top;
      if (last != null && Math.abs(t - last) < 0.5) {
        if (++still >= 2) return;
      } else still = 0;
      last = t;
    }
  }
  async function bringIntoView(el) {
    if (!el || fullyVisible(el)) return;
    try {
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: reduced() ? "auto" : "smooth" });
    } catch (_) {
      el.scrollIntoView();
    }
    await settleScroll(el);
  }

  // ------------------------------------------------------------ app lookups
  function modelItems(field) {
    const model = psModel();
    const out = [];
    if (!model) return out;
    const projects = (model.projects || []).slice().sort((a, b) => (b.hasSelected ? 1 : 0) - (a.hasSelected ? 1 : 0));
    for (const p of projects) {
      for (const b of p.branches || []) for (const x of b[field] || []) out.push(x);
      for (const x of p[field] || []) out.push(x);
    }
    const org = model.org || {};
    for (const x of org[field] || []) out.push(x);
    if (field === "docs" && org.docKids instanceof Map) for (const arr of org.docKids.values()) for (const x of arr || []) out.push(x);
    const seen = new Set();
    return out.filter((x) => {
      if (!x) return false;
      const k = x._id || x.path || x.id;
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  async function findCanvas(name) {
    const q = norm(name);
    const fromPs = modelItems("canvases");
    let hit = bestMatch(fromPs, (c) => c.name, q);
    if (hit) return { src: "project-sidebar", c: hit, name: hit.name };
    const cq = window.__RE_TEMPO_CANVAS_QUICK__;
    if (cq && typeof cq.load === "function" && typeof cq.open === "function") {
      const d = await withTimeout(cq.load(), 3000).catch(() => null);
      hit = bestMatch((d && d.items) || [], (it) => it.canvasName || it.name, q);
      if (hit) return { src: "canvas-quick", it: hit, name: hit.canvasName || hit.name };
    }
    const st = W();
    const srd = window.__sourceRepoDataStoreDebug;
    const rows = [];
    if (st && srd && typeof srd.getLocalOverlay === "function") {
      for (const p of st.projects || []) {
        let ov = [];
        try {
          ov = srd.getLocalOverlay(p.id) || [];
        } catch (_) {}
        for (const o of ov) if (o && o.path && o.workingTreeStatus !== "deleted") rows.push({ name: o.name || o.path.split("/").pop(), path: o.path, projectId: p.id });
      }
    }
    hit = bestMatch(rows, (r) => r.name, q);
    return hit ? { src: "store", row: hit, name: hit.name } : null;
  }
  function issueQuery(s) {
    const m = /^(?:[A-Za-z][A-Za-z0-9]*-|#)?(\d+)$/.exec(String(s).trim());
    return m ? Number(m[1]) : null;
  }
  function chatCandidates() {
    const st = W();
    if (!st) return [];
    const out = [];
    const wss = (st.workspaces || []).filter((w) => w && !w.isArchived);
    wss.sort((a, b) => (b.id === st.selectedWorkspaceId ? 1 : 0) - (a.id === st.selectedWorkspaceId ? 1 : 0));
    for (const w of wss) {
      const tabs = Array.isArray(w.centerTabs) ? w.centerTabs : w.id === st.selectedWorkspaceId && Array.isArray(st.centerTabs) ? st.centerTabs : [];
      for (const t of tabs) {
        if (!t || t.type !== "chat" || t.isArchived === true) continue;
        out.push({ wsId: w.id, id: t.id, name: (typeof t.name === "string" && t.name.trim()) || "New Chat", sessionId: t.sessionId || null, provider: t.provider || null });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- parser
  const ROUTES = ["chat", "design", "docs", "issues", "agents", "settings"];
  const ROUTE_ALIAS = { chats: "chat", canvas: "design", canvases: "design", doc: "docs", prd: "docs", issue: "issues", agent: "agents", setting: "settings", preferences: "settings" };
  const ROUTE_LABEL = { chat: "Chat", design: "Design", docs: "Docs", issues: "Issues", agents: "Agents", settings: "Settings" };
  const OPEN_ALIAS = { preferences: "settings", setting: "settings", canvases: "canvas", docs: "doc", prd: "doc", issues: "issue", agents: "agent", chats: "chat", link: "url", page: "url", browser: "url" };
  const ARG_KEY = { "open settings": "section", go: "route", "open canvas": "name", "open doc": "title", "open issue": "query", "open agent": "name", "open chat": "title", "open url": "url", focus: "selector", highlight: "selector", toast: "text", split: "side", run: "id" };
  const ALIAS_KEYS = ["name", "title", "id", "target", "query", "value", "section", "route", "url", "selector", "text", "side"];
  const unquote = (s) => {
    const t = String(s == null ? "" : s).trim();
    const m = /^(["'“‘`])([\s\S]*)(["'”’`])$/.exec(t);
    return m ? m[2].trim() : t;
  };
  function argsFrom(action, rest) {
    const r = String(rest == null ? "" : rest).trim();
    if (action === "highlight") {
      const mm = /^([\s\S]*?)\s+(\d{2,6})\s*(?:ms)?$/.exec(r);
      return mm ? { selector: unquote(mm[1]), ms: Number(mm[2]) } : { selector: unquote(r) };
    }
    const key = ARG_KEY[action];
    if (!key) return r ? { text: r } : {};
    if (action === "open settings" && !r) return {};
    return { [key]: unquote(r) };
  }
  const NATIVE_VERBS = new Set(["open", "go", "focus", "highlight", "toast", "split", "run", "screenshot", "list"]);
  // Shell-like words: "double" and 'single' quotes group, \" escapes inside "".
  function tokenize(s) {
    const out = [];
    let cur = null;
    let q = null;
    const str = String(s == null ? "" : s);
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (q) {
        if (c === q) q = null;
        else if (c === "\\" && q === '"' && i + 1 < str.length) cur += str[++i];
        else cur += c;
        continue;
      }
      if (c === '"' || c === "'") {
        q = c;
        if (cur === null) cur = "";
        continue;
      }
      if (/\s/.test(c)) {
        if (cur !== null) out.push(cur);
        cur = null;
        continue;
      }
      cur = (cur || "") + c;
    }
    if (cur !== null) out.push(cur);
    return out;
  }
  // Words -> args of a registered action: name=value, --name value, --flag
  // (boolean params), then positionals in declared order; the last free string
  // param takes the rest. Without declared params: any name=value, rest in "_".
  function parseArgs(params, tokens) {
    const list = Array.isArray(params) ? params : [];
    const byName = new Map(list.map((p) => [p.name.toLowerCase(), p]));
    const out = {};
    const pos = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      let m = /^--([A-Za-z_][\w-]*)(?:=([\s\S]*))?$/.exec(t);
      if (m) {
        const p = byName.get(m[1].toLowerCase());
        const name = p ? p.name : list.length ? null : m[1];
        if (!name) return { error: `unknown option --${m[1]}` };
        if (m[2] != null) out[name] = m[2];
        else if (p && p.type === "boolean") out[name] = true;
        else if (i + 1 < tokens.length) out[name] = tokens[++i];
        else return { error: `--${m[1]} needs a value` };
        continue;
      }
      m = /^([A-Za-z_][\w-]*)=([\s\S]*)$/.exec(t);
      const p = m && byName.get(m[1].toLowerCase());
      const name = m ? (p ? p.name : list.length ? null : m[1]) : null;
      if (name) {
        out[name] = m[2];
        continue;
      }
      pos.push(t);
    }
    const free = list.filter((p) => !(p.name in out));
    for (let k = 0; k < free.length && pos.length; k++) {
      const p = free[k];
      out[p.name] = k === free.length - 1 && (!p.type || p.type === "string") ? pos.splice(0).join(" ") : pos.shift();
    }
    if (pos.length) {
      if (list.length) return { error: `too many arguments: ${pos.join(" ")}` };
      out._ = pos.join(" ");
    }
    return { args: out };
  }
  function screenshotArgs(tokens) {
    const a = { target: "window" };
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const kv = /^(?:--)?(target|selector|out)=([\s\S]*)$/i.exec(t);
      if (kv) {
        a[kv[1].toLowerCase()] = kv[2];
        if (kv[1].toLowerCase() === "selector") a.target = "selector";
      } else if (t === "--canvas" || t === "canvas") a.target = "canvas";
      else if (t === "--window" || t === "window") a.target = "window";
      else if (t === "--selector" || t === "selector") {
        a.target = "selector";
        a.selector = tokens[++i];
      } else if (t === "--out" || t === "-o") a.out = tokens[++i];
      else if (a.target === "selector" && a.selector == null) a.selector = t;
      else return { error: `unknown screenshot option ${quote(t)} (--canvas, --selector <css>, --out <file.png>)` };
    }
    return { args: a };
  }
  // "open settings chat" -> {action: "open settings", args: {section: "chat"}}
  function fromWords(text) {
    const s = String(text == null ? "" : text)
      .trim()
      .replace(/^@tempo-ui\s+/i, "");
    if (!s) return { error: "empty command" };
    const m = /^(\S+)(?:\s+([\s\S]*))?$/.exec(s);
    const verb = m[1].toLowerCase().replace(/[_.:]+/g, " ").trim();
    const rest = (m[2] || "").trim();
    if (verb.includes(" ")) return fromWords(`${verb} ${rest}`); // "open_settings chat"
    if (verb === "list") return { action: "list", args: {} };
    if (verb === "screenshot") {
      const r = screenshotArgs(tokenize(rest));
      return r.error ? r : { action: "screenshot", args: r.args };
    }
    if (verb === "open") {
      const k = /^(\S+)(?:\s+([\s\S]*))?$/.exec(rest);
      if (!k) return { error: "open what? (settings, canvas, doc, issue, agent, chat, url)" };
      if (/^[a-z][a-z0-9+.-]*:/i.test(k[1]) && !/^(settings|canvas|doc|issue|agent|chat|url):?$/i.test(k[1])) return { action: "open url", args: { url: unquote(rest) } };
      let kind = k[1].toLowerCase();
      kind = OPEN_ALIAS[kind] || kind;
      const action = `open ${kind}`;
      return { action, args: argsFrom(action, k[2] || "") };
    }
    return { action: verb, args: argsFrom(verb, rest) };
  }
  // A command line (or the CLI's argv). Native verbs keep their free-text
  // arguments ("open canvas Home page") and also take name=value; any other
  // first word is a registered action id, resolved when the command runs.
  function parseLine(text, argv) {
    const raw = String(text == null ? "" : text)
      .trim()
      .replace(/^@tempo-ui\s+/i, "");
    const tokens = Array.isArray(argv) ? argv.map((x) => String(x)) : tokenize(raw);
    if (!tokens.length) return { error: "empty command" };
    const verb = tokens[0].toLowerCase().replace(/[_:].*$/, "");
    if (!NATIVE_VERBS.has(verb)) return { unresolved: tokens };
    if (verb === "list") return { action: "list", args: {} };
    if (verb === "screenshot") {
      const r = screenshotArgs(tokens.slice(1));
      return r.error ? r : { action: "screenshot", args: r.args };
    }
    if (verb === "run" && tokens.length > 1 && !RUN_ACTIONS[tokens[1].toLowerCase()]) return { unresolved: tokens.slice(1) };
    const cmd = fromWords(Array.isArray(argv) ? tokens.join(" ") : raw);
    if (cmd.error) return cmd;
    const params = NATIVE_PARAMS[cmd.action];
    const at = tokens.findIndex((t) => /^[A-Za-z_][\w-]*=/.test(t));
    if (params && at > 0) {
      const rest = tokens.slice(at);
      if (rest.every((t) => params.some((p) => t.toLowerCase().startsWith(`${p.name.toLowerCase()}=`)))) {
        const r = parseArgs(params, rest);
        if (!r.error) cmd.args = r.args;
      }
    }
    return cmd;
  }
  function resolveTokens(tokens) {
    const e = REG.get(String(tokens[0] || "").toLowerCase());
    if (!e || e.native) return { error: `${quote(tokens[0] || "")} is not a registered action (tempo-ui list shows them)` };
    const r = parseArgs(e.spec.params, tokens.slice(1));
    return r.error ? { action: e.id, error: r.error } : { action: e.id, args: r.args };
  }
  function fromObject(o) {
    if (!o || typeof o !== "object" || Array.isArray(o)) return { error: "a command must be an object {action, args}" };
    const rawAction = (typeof o.action === "string" ? o.action : typeof o.command === "string" ? o.command : "").trim().replace(/^@tempo-ui\s+/i, "");
    const args = o.args;
    const reg = REG.get(rawAction.toLowerCase());
    if (reg && !reg.native) {
      if (args == null) return { action: reg.id, args: {} };
      if (typeof args === "string" || typeof args === "number" || Array.isArray(args)) {
        const r = parseArgs(reg.spec.params, Array.isArray(args) ? args.map(String) : tokenize(String(args)));
        return r.error ? { action: reg.id, error: r.error } : { action: reg.id, args: r.args };
      }
      return typeof args === "object" ? { action: reg.id, args: Object.assign({}, args) } : { error: "args must be a string or an object" };
    }
    let action = rawAction.replace(/[_.:]+/g, " ").replace(/\s+/g, " ").trim();
    if (!action) return { error: "missing action" };
    if (!NATIVE_VERBS.has(action.split(" ")[0].toLowerCase())) return { error: `${quote(rawAction)} is not a registered action (tempo-ui list shows them)` };
    if (action.toLowerCase() === "open" && args && typeof args === "object" && !Array.isArray(args)) {
      const kind = args.kind || args.type || args.what;
      if (typeof kind === "string") action = `open ${kind}`;
    }
    const parsed = fromWords(action);
    if (parsed.error || args == null) return parsed;
    if (typeof args === "string" || typeof args === "number") return { action: parsed.action, args: argsFrom(parsed.action, String(args)) };
    if (Array.isArray(args)) return { action: parsed.action, args: argsFrom(parsed.action, args.map(String).join(" ")) };
    if (typeof args !== "object") return { error: "args must be a string or an object" };
    const out = Object.assign({}, parsed.args);
    for (const [k, v] of Object.entries(args)) if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
    const key = ARG_KEY[parsed.action];
    if (key && (out[key] == null || out[key] === "")) {
      for (const k of ALIAS_KEYS) {
        if (k !== key && out[k] != null && out[k] !== "") {
          out[key] = out[k];
          break;
        }
      }
    }
    return { action: parsed.action, args: out };
  }
  function parseInput(input) {
    if (input && typeof input === "object") return fromObject(input);
    const s = String(input == null ? "" : input).trim();
    if (/^[{[]/.test(s)) {
      try {
        const j = JSON.parse(s);
        return fromObject(Array.isArray(j) ? j[0] : j);
      } catch (_) {
        return { error: "invalid JSON" };
      }
    }
    return parseLine(s);
  }
  // Commands of one message, in order. While it streams (final = false) only
  // finished lines and closed fences count, so ordinals never move.
  function extract(text, final) {
    const out = [];
    let body = String(text == null ? "" : text).replace(/\r\n?/g, "\n");
    if (!final) {
      const cut = body.lastIndexOf("\n");
      body = cut < 0 ? "" : body.slice(0, cut);
    }
    const lines = body ? body.split("\n") : [];
    let fence = null;
    const push = (raw, cmd, block) => out.push({ n: out.length, raw, cmd, block });
    const pushBlock = (src) => {
      const t = src.trim();
      if (!t) return;
      if (!/^[{[]/.test(t)) {
        for (const l of t.split("\n").map((x) => x.trim()).filter(Boolean)) push(l, parseLine(l), true);
        return;
      }
      let j;
      try {
        j = JSON.parse(t);
      } catch (_) {
        push(t, { error: "invalid JSON in a tempo-ui block" }, true);
        return;
      }
      for (const o of (Array.isArray(j) ? j : [j]).slice(0, 10)) push(JSON.stringify(o), fromObject(o), true);
    };
    for (const line of lines) {
      const fm = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/.exec(line);
      if (fence) {
        if (fm && fm[1][0] === fence.marker[0] && fm[1].length >= fence.marker.length && !fm[2]) {
          if (fence.lang === "tempo-ui") pushBlock(fence.buf.join("\n"));
          fence = null;
        } else fence.buf.push(line);
        continue;
      }
      if (fm) {
        fence = { marker: fm[1], lang: (fm[2] || "").toLowerCase(), buf: [] };
        continue;
      }
      const lm = /^ {0,3}@tempo-ui\s+(\S[\s\S]*?)\s*$/i.exec(line);
      if (lm) push(`@tempo-ui ${lm[1]}`, parseLine(lm[1]), false);
    }
    return out;
  }

  // ----------------------------------------------------------------- plans
  const L = (ing, ed, verb) => ({ ing, ed, verb });
  const needArg = (key, what) => (a) => {
    const v = a[key] == null ? "" : String(a[key]).trim();
    if (!v) return `missing ${what || key}`;
    if (v.length > 200) return `${what || key} too long`;
    a[key] = v;
    return null;
  };
  function checkSelector(a) {
    a.selector = String(a.selector == null ? "" : a.selector).trim();
    if (!a.selector) return "missing selector";
    if (a.selector.length > 300) return "selector too long";
    if (!/^[\w:.-]+$/.test(a.selector)) {
      try {
        document.createDocumentFragment().querySelector(a.selector);
      } catch (_) {
        return "invalid CSS selector";
      }
    }
    if (a.ms != null) {
      const n = Number(a.ms);
      a.ms = isFinite(n) ? Math.min(10000, Math.max(300, Math.round(n))) : 1600;
    }
    return null;
  }
  function safeUrl(raw) {
    let s = String(raw == null ? "" : raw).trim();
    if (!s) return { error: "missing url" };
    if (s.length > 2048) return { error: "url too long" };
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && /^[\w.-]+(:\d+)?(\/|\?|#|$)/.test(s)) s = (/^(localhost|127\.0\.0\.1)(:|\/|$)/.test(s) ? "http://" : "https://") + s;
    let u;
    try {
      u = new URL(s);
    } catch (_) {
      return { error: "not a valid URL" };
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return { error: `only http(s) URLs can be opened (got ${u.protocol})` };
    if (u.username || u.password) return { error: "URLs with credentials are refused" };
    return { url: u.href, host: u.host };
  }
  const shortSel = (s) => clip(String(s), 40);

  const RUN_ACTIONS = {
    "toggle-left-panel": {
      label: L("Toggling the left panel", "toggled the left panel", "toggle the left panel"),
      target: () => firstVisible('button[aria-label="Toggle left panel"]'),
      run() {
        const b = document.querySelector('button[aria-label="Toggle left panel"]');
        if (!b) return fail("no left panel toggle");
        b.click();
        return ok("button.click", b);
      },
    },
    "toggle-right-panel": {
      label: L("Toggling the right panel", "toggled the right panel", "toggle the right panel"),
      target: () => firstVisible('button[aria-label="Toggle right panel"]'),
      run() {
        const b = document.querySelector('button[aria-label="Toggle right panel"]');
        if (!b) return fail("no right panel toggle");
        b.click();
        return ok("button.click", b);
      },
    },
    "toggle-split": {
      label: L("Toggling split view", "toggled split view", "toggle split view"),
      target: () => firstVisible('[aria-label="Open in split view"]'),
      run() {
        const st = W();
        if (!st || typeof st.toggleSplitPanelMode !== "function") return fail("split view is not reachable");
        st.toggleSplitPanelMode();
        return ok("store.toggleSplitPanelMode");
      },
    },
    "focus-composer": {
      label: L("Focusing the chat input", "focused the chat input", "focus the chat input"),
      target: () => composerEl(),
      run() {
        const el = composerEl();
        if (!el) return fail("no chat input on screen");
        el.focus();
        return ok("focus", el);
      },
    },
  };

  const PLANS = {
    "open settings": {
      confirm: true,
      check(a) {
        if (a.section == null) return null;
        a.section = String(a.section).trim();
        if (!a.section) delete a.section;
        else if (a.section.length > 60) return "section name too long";
        return null;
      },
      label: (a) => (a.section ? L(`Opening Settings › ${a.section}`, `opened Settings › ${a.section}`, `open Settings › ${a.section}`) : L("Opening Settings", "opened Settings", "open Settings")),
      target: (a) => (a.section && settingsNavButton(a.section)) || gearEl(),
      async run(a) {
        const via = route("settings");
        if (!via) return fail("Settings is not reachable");
        const nav = await waitFor(settingsNav, 2500);
        if (!a.section) return ok(via, nav);
        if (!nav) return fail("Settings opened, but its menu did not show up", via);
        const btn = await waitFor(() => settingsNavButton(a.section), 800);
        if (!btn) return fail(`Settings has no section ${quote(a.section)}`, via);
        btn.click();
        return ok(`${via}+menu-click`, btn);
      },
    },
    go: {
      confirm: true,
      check(a) {
        let r = norm(a.route);
        r = ROUTE_ALIAS[r] || r;
        if (!ROUTES.includes(r)) return `unknown section ${quote(a.route || "")} (chat, design, docs, issues, agents, settings)`;
        a.route = r;
        return null;
      },
      label: (a) => L(`Going to ${ROUTE_LABEL[a.route]}`, `switched to ${ROUTE_LABEL[a.route]}`, `go to ${ROUTE_LABEL[a.route]}`),
      target: (a) => routeEl(a.route),
      run(a) {
        const via = route(a.route);
        return via ? ok(via) : fail(`${ROUTE_LABEL[a.route]} is not reachable`);
      },
    },
    "open canvas": {
      confirm: true,
      check: needArg("name", "canvas name"),
      label: (a) => L(`Opening canvas ${quote(a.name)}`, `opened canvas ${quote(a.name)}`, `open canvas ${quote(a.name)}`),
      target: (a) => sidebarRow("canvas", a.name) || routeEl("design"),
      async run(a) {
        const hit = await findCanvas(a.name);
        if (!hit) return fail(`no canvas named ${quote(a.name)}`);
        if (hit.src === "project-sidebar") {
          const via = await psApi().open.canvas(hit.c);
          return via && via !== "route-only" && via !== "no-workspace" ? ok(`project-sidebar.${via}`) : fail(`could not open ${quote(hit.name)} (${via})`, "project-sidebar");
        }
        if (hit.src === "canvas-quick") {
          const cq = window.__RE_TEMPO_CANVAS_QUICK__;
          const done = await cq.open(hit.it);
          return done ? ok(`canvas-quick.${(cq.state && cq.state.openedVia) || "open"}`) : fail(`could not open ${quote(hit.name)}`, "canvas-quick");
        }
        const st = W();
        if (!st || typeof st.openDesignTab !== "function") return fail("the design tabs are not reachable");
        route("design");
        const ws = (st.workspaces || []).filter((w) => w && w.projectId === hit.row.projectId && !w.isArchived);
        const w = ws.find((x) => x.id === st.selectedWorkspaceId) || ws.find((x) => x.mode === "local") || ws[0];
        if (w && st.selectedWorkspaceId !== w.id && typeof st.selectWorkspace === "function") st.selectWorkspace(w.id);
        W().openDesignTab(hit.row.name, hit.row.path);
        return ok("store.openDesignTab");
      },
    },
    "open doc": {
      confirm: true,
      check: needArg("title", "doc title"),
      label: (a) => L(`Opening doc ${quote(a.title)}`, `opened doc ${quote(a.title)}`, `open doc ${quote(a.title)}`),
      target: (a) => sidebarRow("doc", a.title) || routeEl("docs"),
      async run(a) {
        const items = modelItems("docs");
        const hit = items.find((d) => d._id === a.title) || bestMatch(items, (d) => d.title || "Untitled", norm(a.title));
        if (hit) {
          const via = await psApi().open.doc(hit);
          return via && via !== "route-only" ? ok(`project-sidebar.${via}`) : fail(`could not open ${quote(hit.title || a.title)}`, "project-sidebar");
        }
        const r = route("docs");
        if (ID_RE.test(a.title)) {
          const via = await waitFor(() => {
            const s = W();
            if (s && typeof s.openDocCallback === "function") {
              s.openDocCallback(a.title);
              return "store.openDocCallback";
            }
            const td = window.__tempoDocs;
            if (td && typeof td.selectDoc === "function") {
              td.selectDoc(a.title);
              return "__tempoDocs.selectDoc";
            }
            return null;
          }, 4000);
          return via ? ok(via) : fail("the docs view did not load", r);
        }
        const row = await waitFor(() => findByText(['[data-testid="docs-view-sidebar"]', '.rtps-row[data-kind="doc"]'], a.title), 3000);
        if (!row) return fail(`no doc titled ${quote(a.title)}`, r);
        row.click();
        return ok("docs-list-click", row);
      },
    },
    "open issue": {
      confirm: true,
      check: needArg("query", "issue"),
      label: (a) => L(`Opening issue ${quote(a.query)}`, `opened issue ${quote(a.query)}`, `open issue ${quote(a.query)}`),
      target: (a) => sidebarRow("issue", a.query) || routeEl("issues"),
      async run(a) {
        const items = modelItems("issues");
        const num = issueQuery(a.query);
        const hit =
          items.find((i) => String(i._id) === a.query) ||
          (num != null ? items.find((i) => Number(i.number) === num) : null) ||
          bestMatch(items, (i) => i.title || "", norm(a.query));
        if (hit) {
          const via = await psApi().open.issue(hit);
          return via && via !== "route-only" ? ok(`project-sidebar.${via}`) : fail(`could not open ${quote(hit.title || a.query)}`, "project-sidebar");
        }
        const r = route("issues");
        if (ID_RE.test(a.query)) {
          const via = await waitFor(() => {
            const s = W();
            if (s && typeof s.openIssueCallback === "function") {
              s.openIssueCallback(a.query);
              return "store.openIssueCallback";
            }
            const ti = window.__tempoIssues;
            if (ti && typeof ti.selectIssue === "function") {
              ti.selectIssue(a.query);
              return "__tempoIssues.selectIssue";
            }
            return null;
          }, 4000);
          return via ? ok(via) : fail("the issues view did not load", r);
        }
        const row = await waitFor(() => findByText(['[data-testid="issues-sidebar"]', '[data-tempo-workspace-panel="center"]', '.rtps-row[data-kind="issue"]'], a.query), 3000);
        if (!row) return fail(`no issue matching ${quote(a.query)}`, r);
        row.click();
        return ok("issues-list-click", row);
      },
    },
    "open agent": {
      confirm: true,
      check: needArg("name", "agent name"),
      label: (a) => L(`Opening agent ${quote(a.name)}`, `opened agent ${quote(a.name)}`, `open agent ${quote(a.name)}`),
      target: (a) => sidebarRow("agent", a.name) || routeEl("agents"),
      async run(a) {
        const items = modelItems("agents");
        const hit = items.find((x) => String(x._id) === a.name) || bestMatch(items, (x) => x.name || "", norm(a.name));
        if (hit) {
          const via = await psApi().open.agent(hit);
          return via && via !== "route-only" ? ok(`project-sidebar.${via}`) : fail(`could not open ${quote(hit.name || a.name)}`, "project-sidebar");
        }
        const r = route("agents");
        const row = await waitFor(() => {
          const rows = Array.from(document.querySelectorAll('[data-testid^="agent-list-row-"]')).filter(visible);
          return bestMatch(rows, (el) => el.textContent, norm(a.name), 3) || findByText(['.rtps-row[data-kind="agent"]'], a.name);
        }, 3000);
        if (!row) return fail(`no agent named ${quote(a.name)}`, r);
        row.click();
        return ok("agents-list-click", row);
      },
    },
    "open chat": {
      confirm: true,
      check: needArg("title", "chat title"),
      label: (a) => L(`Opening chat ${quote(a.title)}`, `opened chat ${quote(a.title)}`, `open chat ${quote(a.title)}`),
      target: (a) => sidebarRow("chat", a.title) || routeEl("chat"),
      async run(a) {
        const hit = bestMatch(chatCandidates(), (c) => c.name, norm(a.title));
        if (!hit) return fail(`no chat titled ${quote(a.title)}`);
        const p = psApi();
        if (p && typeof p.open.chat === "function") {
          const via = await p.open.chat(hit.wsId, hit.id);
          return ok(`project-sidebar.${via}`);
        }
        goRoute("chat");
        const st = W();
        if (st && typeof st.selectWorkspaceChat === "function") {
          st.selectWorkspaceChat(hit.wsId, hit.id);
          return ok("store.selectWorkspaceChat");
        }
        return fail("chat selection is not reachable");
      },
    },
    "open url": {
      confirm: true,
      check(a) {
        const r = safeUrl(a.url);
        if (r.error) return r.error;
        a.url = r.url;
        return null;
      },
      label(a) {
        let host = a.url;
        try {
          host = new URL(a.url).host;
        } catch (_) {}
        return L(`Opening ${host}`, `opened ${host} in a Browser tab`, `open ${host}`);
      },
      targetRect: () => centerRect(),
      async run(a) {
        const st = W();
        if (!st || typeof st.openBrowserTab !== "function") return fail("the Browser tab is not reachable (workspaces store not found)");
        const r = goRoute("chat");
        W().openBrowserTab(a.url);
        const el = await waitFor(() => firstVisible('[data-testid="browser-tab-host"]'), 1200);
        return ok(r === "already" ? "store.openBrowserTab" : `${r}+store.openBrowserTab`, el);
      },
    },
    focus: {
      confirm: false,
      check: checkSelector,
      label: (a) => L(`Pointing at ${shortSel(a.selector)}`, `pointed at ${shortSel(a.selector)}`, `find ${shortSel(a.selector)}`),
      async prepare(a) {
        const el = resolveEl(a.selector);
        await bringIntoView(el);
        return { el };
      },
      target: (a, prep) => (prep && prep.el) || null,
      run(a, prep) {
        const el = prep && prep.el && prep.el.isConnected ? prep.el : resolveEl(a.selector);
        if (!el) return fail(`nothing on screen matches ${shortSel(a.selector)}`);
        if (!fullyVisible(el)) el.scrollIntoView({ block: "center", inline: "nearest" });
        showHighlight(el, a.ms || 1600);
        if (el.matches('a[href], button, input, textarea, select, [tabindex], [contenteditable="true"]')) {
          try {
            el.focus({ preventScroll: true, focusVisible: false }); // our ring, not a second native one
          } catch (_) {}
        }
        return ok("scrollIntoView+highlight", el);
      },
    },
    highlight: {
      confirm: false,
      check: checkSelector,
      label: (a) => L(`Pointing at ${shortSel(a.selector)}`, `highlighted ${shortSel(a.selector)}`, `find ${shortSel(a.selector)}`),
      async prepare(a) {
        const el = resolveEl(a.selector);
        await bringIntoView(el);
        return { el };
      },
      target: (a, prep) => (prep && prep.el) || null,
      run(a, prep) {
        const el = prep && prep.el && prep.el.isConnected ? prep.el : resolveEl(a.selector);
        if (!el) return fail(`nothing on screen matches ${shortSel(a.selector)}`);
        showHighlight(el, a.ms || 1600);
        return ok("highlight", el);
      },
    },
    toast: {
      confirm: false,
      check(a) {
        a.text = String(a.text == null ? "" : a.text)
          .replace(/[\u0000-\u001f\u007f]+/g, " ")
          .trim();
        if (!a.text) return "toast needs a text";
        a.text = clip(a.text, 200);
        return null;
      },
      label: () => L("Leaving a note", "left a note", "show a note"),
      prepare(a, ctx) {
        const t = makeToast("note");
        t.text(`${ctx.who}: ${a.text}`);
        t.buttons([{ act: "dismiss", label: "Dismiss", fn: () => t.close() }]);
        t.life(NOTE_MS);
        return { toast: t };
      },
      target: (a, prep) => (prep && prep.toast && prep.toast.el) || null,
      run: (a, prep) => ok("toast", prep && prep.toast && prep.toast.el),
    },
    split: {
      confirm: true,
      check(a) {
        a.side = norm(a.side || "right");
        return a.side === "left" || a.side === "right" ? null : 'split takes "left" or "right"';
      },
      label: (a) => L(`Splitting to the ${a.side}`, `moved the tab to a ${a.side} pane`, `split to the ${a.side}`),
      targetRect: (a) => centerRect(a.side),
      run(a) {
        const pd = window.__RE_TEMPO_PANE_DOCK__;
        if (!pd || typeof pd.split !== "function") return fail("split needs the pane-dock mod");
        const st = W();
        const tab = st && st.activeCenterTabId;
        if (!tab) return fail("no active tab to split");
        const r = pd.split(tab, a.side);
        return r === false ? fail("pane-dock refused the split", "pane-dock.split") : ok("pane-dock.split");
      },
      undo() {
        const pd = window.__RE_TEMPO_PANE_DOCK__;
        return !!(pd && typeof pd.undo === "function" && pd.undo());
      },
    },
    run: {
      confirm: false,
      check(a) {
        a.id = norm(a.id).replace(/\s+/g, "-");
        return RUN_ACTIONS[a.id] ? null : `run ${quote(a.id || "")} is not in the allowlist (${Object.keys(RUN_ACTIONS).join(", ")})`;
      },
      label: (a) => RUN_ACTIONS[a.id].label,
      target: (a) => (RUN_ACTIONS[a.id].target ? RUN_ACTIONS[a.id].target() : null),
      run: (a) => RUN_ACTIONS[a.id].run(),
    },
  };

  // ------------------------------------------------------------ screenshot
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  // The bug report dialog's capture of the app window (as canvas-comment-agent
  // uses it), cropped to the canvas / element on screen. Our own overlays and
  // ui-beam's hide while it runs (html.rtud-capturing).
  async function capture(a) {
    const bridge = window.bugReportBridge;
    if (!bridge || typeof bridge.captureAppScreenshot !== "function") return fail("window capture is not available (bugReportBridge.captureAppScreenshot)");
    let el = null;
    if (a.target === "canvas") {
      el = firstVisible(["[data-canvas-root]"]);
      if (!el) return fail("no design canvas on screen");
    } else if (a.target === "selector") {
      el = resolveEl(a.selector);
      if (!el) return fail(`nothing on screen matches ${shortSel(a.selector)}`);
      await bringIntoView(el);
    }
    const html = document.documentElement;
    html.classList.add("rtud-capturing");
    let res = null;
    let vw = innerWidth;
    let box = null;
    try {
      await nextFrame();
      await nextFrame();
      vw = innerWidth;
      if (el) {
        const r = el.getBoundingClientRect();
        const l = Math.max(0, r.left);
        const t = Math.max(0, r.top);
        const w = Math.min(innerWidth, r.right) - l;
        const h = Math.min(innerHeight, r.bottom) - t;
        if (w < 1 || h < 1) return fail("the element is not on screen");
        box = { l, t, w, h };
      }
      res = await Promise.race([bridge.captureAppScreenshot(), sleep(8000).then(() => "timeout")]);
    } catch (e) {
      res = { ok: false, error: String((e && e.message) || e) };
    } finally {
      html.classList.remove("rtud-capturing");
    }
    if (res === "timeout") return fail("the capture timed out");
    if (!res || res.ok === false || typeof res.dataUrl !== "string") return fail(`the capture failed${res && res.error ? `: ${res.error}` : ""}`);
    const img = new Image();
    img.src = res.dataUrl;
    await img.decode();
    if (!box && /^data:image\/png/i.test(res.dataUrl)) return { dataUrl: res.dataUrl, width: img.naturalWidth, height: img.naturalHeight, el: null };
    const k = img.naturalWidth / vw; // device px per CSS px of the capture
    const b = box || { l: 0, t: 0, w: vw, h: img.naturalHeight / k };
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(b.w * k));
    cv.height = Math.max(1, Math.round(b.h * k));
    cv.getContext("2d").drawImage(img, b.l * k, b.t * k, b.w * k, b.h * k, 0, 0, cv.width, cv.height);
    return { dataUrl: cv.toDataURL("image/png"), width: cv.width, height: cv.height, el };
  }
  // PNG through the preload bridge (writeBinaryFile takes base64, as the
  // canvas source editor calls it); the size is checked with stat. False =
  // not written (the reply then carries the dataURL and the CLI writes it).
  async function writePng(p, dataUrl) {
    const f = fsApi();
    if (!f || typeof f.writeBinaryFile !== "function") return false;
    const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    try {
      const r = await f.writeBinaryFile(p, b64);
      if (r && r.success === false) return false;
    } catch (_) {
      return false;
    }
    if (typeof f.stat !== "function") return true;
    const st = await call(f.stat, p);
    const size = st && typeof st.size === "number" ? st.size : null;
    const expect = Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
    return size == null || Math.abs(size - expect) <= 2;
  }
  PLANS.screenshot = {
    quiet: true,
    confirm: false,
    check(a) {
      a.target = norm(a.target || (a.selector ? "selector" : "window"));
      if (!["window", "canvas", "selector"].includes(a.target)) return "screenshot target must be window, canvas or selector";
      if (a.target === "selector") {
        const e = checkSelector(a);
        if (e) return e;
      } else delete a.selector;
      if (a.out != null && String(a.out).trim()) {
        a.out = String(a.out).trim();
        if (!a.out.startsWith("/")) return "out must be an absolute path (the CLI resolves it)";
        if (!/\.png$/i.test(a.out)) return "out must end with .png";
        if (/(^|\/)\.\.(\/|$)/.test(a.out)) return 'out must not contain ".."';
      } else delete a.out;
      return null;
    },
    label: (a) => L(`Taking a screenshot (${a.target})`, "took a screenshot", "take a screenshot"),
    async run(a) {
      const cap = await capture(a);
      if (cap.ok === false) return cap;
      const result = { target: a.target, width: cap.width, height: cap.height, out: a.out || null, written: false };
      if (a.out) result.written = await writePng(a.out, cap.dataUrl);
      return { ok: true, via: "bugReportBridge.captureAppScreenshot", el: cap.el, result, reply: result.written ? null : { dataUrl: cap.dataUrl }, dataUrl: cap.dataUrl };
    },
  };
  PLANS.list = {
    quiet: true,
    confirm: false,
    check: () => null,
    label: () => L("Listing actions", "listed the actions", "list the actions"),
    run: () => ({ ok: true, via: "registry", result: registryList() }),
  };

  // -------------------------------------------------------------- registry
  // window.__RE_TEMPO_ACTIONS__: every action the protocol can run. The native
  // ones above are listed here; other mods add theirs with register(). The
  // allowlist is exactly this registry.
  const NATIVE_PARAMS = {
    "open settings": [{ name: "section", type: "string", description: "a Settings menu label (Preferences, Chat, Billing, Providers...)" }],
    go: [{ name: "route", type: "string", required: true, enum: ["chat", "design", "docs", "issues", "agents", "settings"] }],
    "open canvas": [{ name: "name", type: "string", required: true }],
    "open doc": [{ name: "title", type: "string", required: true, description: "title or id" }],
    "open issue": [{ name: "query", type: "string", required: true, description: "key (TEM-12), number (#12), title or id" }],
    "open agent": [{ name: "name", type: "string", required: true }],
    "open chat": [{ name: "title", type: "string", required: true }],
    "open url": [{ name: "url", type: "string", required: true, description: "http(s) only" }],
    focus: [{ name: "selector", type: "string", required: true, description: "CSS selector or data-testid" }],
    highlight: [
      { name: "selector", type: "string", required: true, description: "CSS selector or data-testid" },
      { name: "ms", type: "number", description: "300..10000, default 1600" },
    ],
    toast: [{ name: "text", type: "string", required: true, description: "max 200 characters" }],
    split: [{ name: "side", type: "string", enum: ["left", "right"] }],
    run: [{ name: "id", type: "string", required: true, enum: Object.keys(RUN_ACTIONS) }],
    screenshot: [
      { name: "target", type: "string", enum: ["window", "canvas", "selector"] },
      { name: "selector", type: "string" },
      { name: "out", type: "string", description: "absolute .png path" },
    ],
    list: [],
  };
  const NATIVE_INFO = {
    "open settings": "Open Settings, optionally on one section",
    go: "Switch the main section",
    "open canvas": "Open a canvas by name",
    "open doc": "Open a doc",
    "open issue": "Open an issue",
    "open agent": "Open an agent",
    "open chat": "Open a chat by title",
    "open url": "Open a web page in a Browser tab in the center",
    focus: "Scroll to an element, highlight and focus it",
    highlight: "Scroll to an element and highlight it",
    toast: "Show a short note on screen",
    split: "Move the active tab into a split pane (pane-dock)",
    run: "Toggle a panel, split view or focus the chat input",
    screenshot: "Capture the window, the canvas or one element to a PNG",
    list: "List the registered actions",
  };
  const RISKS = ["safe", "caution", "destructive"];
  const ID_OK = /^[A-Za-z][\w.:-]{0,63}$/;
  const REG = new Map(); // lowercase id -> { id, native, owner, spec, plan }
  for (const id of Object.keys(PLANS)) {
    const plan = PLANS[id];
    REG.set(id, { id, native: true, owner: "ui-drive", plan, spec: { label: NATIVE_INFO[id] || id, params: NATIVE_PARAMS[id] || [], risk: plan.confirm ? "caution" : "safe", kind: "ui" } });
  }
  function normParams(params) {
    if (params == null) return null;
    if (!Array.isArray(params)) throw new Error("params must be an array of {name, type, required}");
    return params.map((p) => {
      const q = typeof p === "string" ? { name: p } : Object.assign({}, p);
      if (!q || !/^[A-Za-z_][\w-]*$/.test(String(q.name || ""))) throw new Error(`bad param name ${JSON.stringify(q && q.name)}`);
      q.type = ["string", "number", "boolean", "json"].includes(q.type) ? q.type : q.type === "object" || q.type === "array" ? "json" : "string";
      q.required = !!q.required;
      return q;
    });
  }
  function checkParams(params, a) {
    if (!params) return null;
    const out = {};
    for (const p of params) {
      let v = a[p.name];
      if (v === undefined || v === null || v === "") {
        if (p.required) return `missing ${p.name}`;
        if (p.default !== undefined) out[p.name] = p.default;
        continue;
      }
      if (p.type === "number") {
        const n = typeof v === "number" ? v : Number(v);
        if (!isFinite(n)) return `${p.name} must be a number`;
        v = n;
      } else if (p.type === "boolean") {
        if (typeof v !== "boolean") {
          const s = String(v).toLowerCase();
          if (["true", "1", "yes", "on"].includes(s)) v = true;
          else if (["false", "0", "no", "off"].includes(s)) v = false;
          else return `${p.name} must be true or false`;
        }
      } else if (p.type === "json") {
        if (typeof v === "string") {
          try {
            v = JSON.parse(v);
          } catch (_) {
            return `${p.name} must be JSON`;
          }
        }
      } else {
        v = String(v);
        if (v.length > 4000) return `${p.name} too long`;
      }
      if (Array.isArray(p.enum) && p.enum.length && !p.enum.includes(v)) return `${p.name} must be one of ${p.enum.join(", ")}`;
      out[p.name] = v;
    }
    for (const k of Object.keys(a)) delete a[k];
    Object.assign(a, out);
    return null;
  }
  const labelText = (s, a) => {
    let t = s.label;
    if (typeof t === "function") {
      try {
        t = t(a || {});
      } catch (_) {
        t = null;
      }
    }
    return clip(String(t || "").trim(), 90);
  };
  // A registered (non-native) action as a plan for the executor.
  function genericPlan(e) {
    const s = e.spec;
    return {
      generic: true,
      confirm: s.risk !== "safe",
      destructive: s.risk === "destructive",
      check(a) {
        const err = checkParams(s.params, a);
        if (err) return err;
        if (typeof s.validate === "function") {
          try {
            const v = s.validate(a);
            if (v) return String(v);
          } catch (x) {
            return String((x && x.message) || x);
          }
        }
        return null;
      },
      label(a) {
        const t = labelText(s, a) || e.id;
        const lc = t.charAt(0).toLowerCase() + t.slice(1);
        return L(t, `${lc} · done`, lc);
      },
      target(a) {
        if (typeof s.target !== "function") return null;
        const t = s.target(a);
        return t instanceof Element ? t : null;
      },
      targetRect(a) {
        if (typeof s.target !== "function") return null;
        const t = s.target(a);
        return t && !(t instanceof Element) && typeof t.width === "number" ? makeRect(t.x != null ? t.x : t.left, t.y != null ? t.y : t.top, t.width, t.height) : null;
      },
      async run(a, prep, ctx) {
        const r = await s.run(a, { source: ctx.source.kind, who: ctx.who, id: ctx.id });
        if (r && typeof r === "object" && r.ok === false) return fail(String(r.reason || r.error || "failed"), e.id);
        return { ok: true, via: e.id, el: r instanceof Element ? r : null, result: r instanceof Element ? null : r === undefined ? null : r };
      },
      undo: typeof s.undo === "function" ? (a, c) => s.undo(a, { result: c.res && c.res.result }) : null,
    };
  }
  function planOf(action) {
    const e = action != null ? REG.get(String(action).toLowerCase()) : null;
    if (!e) return null;
    if (e.native) return PLANS[e.id] || null;
    if (!e.plan) e.plan = genericPlan(e);
    return e.plan;
  }
  function describe(e) {
    const s = e.spec;
    return {
      id: e.id,
      label: labelText(s, {}) || e.id,
      description: typeof s.description === "string" ? s.description : null,
      params: (s.params || []).map((p) => {
        const o = { name: p.name, type: p.type || "string", required: !!p.required };
        if (p.enum) o.enum = p.enum.slice();
        if (p.default !== undefined) o.default = p.default;
        if (p.description) o.description = String(p.description);
        return o;
      }),
      risk: s.risk,
      kind: s.kind || null,
      owner: e.owner,
      native: !!e.native,
    };
  }
  function registryList() {
    const all = Array.from(REG.values()).map(describe);
    return all.sort((a, b) => (b.native ? 1 : 0) - (a.native ? 1 : 0) || (a.native ? 0 : a.id.localeCompare(b.id)));
  }
  function register(id, spec) {
    try {
      if (typeof id !== "string" || !ID_OK.test(id)) throw new Error("id must be 1-64 characters, a letter first, no spaces (e.g. ui.click)");
      const key = id.toLowerCase();
      const cur = REG.get(key);
      if ((cur && cur.native) || NATIVE_VERBS.has(key)) throw new Error(`"${id}" is a native action`);
      if (!spec || typeof spec.run !== "function") throw new Error("spec.run must be a function");
      const s = Object.assign({}, spec);
      s.params = normParams(s.params);
      if (typeof s.target === "string" && !s.kind) s.kind = s.target;
      s.risk = RISKS.includes(s.risk) ? s.risk : "caution";
      REG.set(key, { id, native: false, owner: String(s.owner || "mod"), spec: s, plan: null, raw: spec });
      fire("rtd:actions-changed", { id, op: "register" });
      return () => unregister(id);
    } catch (e) {
      try {
        console.warn("[ui-drive] register", id, e.message);
      } catch (_) {}
      return false;
    }
  }
  function unregister(id) {
    const key = String(id || "").toLowerCase();
    const e = REG.get(key);
    if (!e || e.native) return false;
    REG.delete(key);
    fire("rtd:actions-changed", { id: e.id, op: "unregister" });
    return true;
  }

  // canvas-browser adapters (feature/canvas-browser.js exposes create() and
  // navigate() on window.__RE_TEMPO_CANVAS_BROWSER__; its own address field
  // also takes file:// and search words, these take http(s) only).
  const cbApi = () => {
    const c = window.__RE_TEMPO_CANVAS_BROWSER__;
    return c && typeof c.create === "function" && c.enabled !== false ? c : null;
  };
  const cbFrameEl = (id) => (id ? document.querySelector(`.rtbf-frame[data-rtbf-id="${CSS.escape(String(id))}"]`) : null);
  function cbPick(id) {
    const c = cbApi();
    if (!c) return null;
    const frames = (typeof c.frames === "function" && c.frames()) || [];
    if (id) return frames.find((f) => String(f.id) === String(id)) || null;
    return frames.find((f) => f.selected) || (frames.length === 1 ? frames[0] : null);
  }
  const hostOf = (u) => {
    try {
      return new URL(u).host;
    } catch (_) {
      return String(u || "");
    }
  };
  const urlCheck = (a) => {
    const r = safeUrl(a.url);
    if (r.error) return r.error;
    a.url = r.url;
    return null;
  };
  register("canvas.browser.create", {
    owner: "ui-drive (canvas-browser adapter)",
    label: (a) => (a.url ? `Opening ${hostOf(a.url)} on the canvas` : "Adding a browser frame to the canvas"),
    description: "Live web page frame on the open design canvas (canvas-browser mod). x, y, w, h in canvas units; without x/y it lands in the middle of the view.",
    params: [
      { name: "url", type: "string", required: true, description: "http(s) only" },
      { name: "x", type: "number" },
      { name: "y", type: "number" },
      { name: "w", type: "number" },
      { name: "h", type: "number" },
    ],
    risk: "caution",
    kind: "canvas",
    validate: urlCheck,
    target: () => firstVisible(["[data-canvas-root]"]),
    run(a) {
      const c = cbApi();
      if (!c) throw new Error("the canvas-browser mod is not loaded or is off");
      const id = c.create({ url: a.url, x: a.x, y: a.y, w: a.w, h: a.h, focus: false });
      if (!id) throw new Error("no design canvas on screen");
      const f = cbPick(id) || { id };
      return { id: f.id, url: f.url || a.url, x: f.x, y: f.y, w: f.w, h: f.h };
    },
    undo(a, { result }) {
      const c = cbApi();
      return !!(c && result && result.id && typeof c.remove === "function" && c.remove(result.id, false));
    },
  });
  register("canvas.browser.navigate", {
    owner: "ui-drive (canvas-browser adapter)",
    label: (a) => `Loading ${hostOf(a.url)} in a canvas browser frame`,
    description: "Load a URL in a browser frame on the canvas: id from canvas.browser.create (default: the selected frame, or the only one).",
    params: [
      { name: "url", type: "string", required: true, description: "http(s) only" },
      { name: "id", type: "string", description: "frame id (default: the selected or only frame)" },
    ],
    risk: "caution",
    kind: "canvas",
    validate(a) {
      // "navigate <id> <url>" also works
      if (a.id && /^[a-z]+:\/\//i.test(a.id) && !/^[a-z]+:\/\//i.test(a.url)) [a.id, a.url] = [a.url, a.id];
      return urlCheck(a);
    },
    target: (a) => {
      const f = cbPick(a.id);
      return f ? cbFrameEl(f.id) : null;
    },
    run(a) {
      const c = cbApi();
      if (!c || typeof c.navigate !== "function") throw new Error("the canvas-browser mod is not loaded or is off");
      const f = cbPick(a.id);
      if (!f) throw new Error(a.id ? `no browser frame ${quote(a.id)} on this canvas` : "no browser frame selected");
      if (!c.navigate(f.id, a.url)) throw new Error("canvas-browser refused the URL");
      return { id: f.id, url: a.url, previous: f.url || null };
    },
    undo(a, { result }) {
      const c = cbApi();
      return !!(c && result && result.previous && c.navigate(result.id, result.previous));
    },
  });

  function validate(cmd) {
    if (!cmd) return "empty command";
    if (cmd.unresolved) {
      const r = resolveTokens(cmd.unresolved);
      delete cmd.unresolved;
      Object.assign(cmd, r);
    }
    if (cmd.error) return cmd.error;
    if (cmd.action === "run" && cmd.args && cmd.args.id && !RUN_ACTIONS[norm(cmd.args.id).replace(/\s+/g, "-")]) {
      const e = REG.get(String(cmd.args.id).toLowerCase());
      if (e && !e.native) {
        const rest = Object.assign({}, cmd.args);
        delete rest.id;
        cmd.action = e.id;
        cmd.args = rest;
      }
    }
    const plan = planOf(cmd.action);
    if (!plan) return `${quote(cmd.action)} is not a registered action (tempo-ui list shows them)`;
    cmd.args = cmd.args && typeof cmd.args === "object" ? cmd.args : {};
    return plan.check ? plan.check(cmd.args) : null;
  }
  const cmdKey = (cmd) => `${cmd.action}|${JSON.stringify(Object.keys(cmd.args || {}).sort().map((k) => [k, cmd.args[k]]))}`;

  // ---------------------------------------------------------------- toasts
  let toastHost = null;
  function host() {
    if (toastHost && toastHost.isConnected) return toastHost;
    toastHost = document.createElement("div");
    toastHost.className = "rtud-toasts";
    toastHost.setAttribute(UI_ATTR, "");
    if (POPOVER) toastHost.popover = "manual";
    (document.body || document.documentElement).append(toastHost);
    return toastHost;
  }
  // Top layer, above any dialog opened since (re-showing moves it to the top).
  function raise(el) {
    if (!POPOVER) return;
    try {
      if (el.matches(":popover-open")) el.hidePopover();
      el.showPopover();
    } catch (_) {}
  }
  function makeToast(kind) {
    const h = host();
    const el = document.createElement("div");
    el.className = "rtud-toast";
    el.dataset.kind = kind;
    el.setAttribute("role", kind === "refused" || kind === "failed" ? "alert" : "status");
    el.innerHTML = `<span class="rtud-toast-glyph">${GLYPH}</span><span class="rtud-toast-text"></span><span class="rtud-toast-actions"></span><span class="rtud-toast-bar" aria-hidden="true"></span>`;
    h.append(el);
    while (h.children.length > 3) h.firstElementChild.remove();
    raise(h);
    requestAnimationFrame(() => el.setAttribute("data-show", ""));
    const bar = el.querySelector(".rtud-toast-bar");
    const t = {
      el,
      timer: 0,
      end: 0,
      left: 0,
      closed: false,
      text(s) {
        const n = el.querySelector(".rtud-toast-text");
        n.textContent = s;
        el.title = s;
      },
      buttons(list) {
        const box = el.querySelector(".rtud-toast-actions");
        box.textContent = "";
        for (const b of list) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "rtud-btn";
          btn.dataset.act = b.act;
          if (b.primary) btn.dataset.primary = "";
          btn.textContent = b.label;
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            b.fn();
          });
          box.append(btn);
        }
      },
      life(ms) {
        clearTimeout(t.timer);
        t.end = Date.now() + ms;
        bar.style.animation = "none";
        void bar.offsetWidth;
        bar.style.animation = "";
        bar.style.animationDuration = `${ms}ms`;
        if (!el.matches(":hover")) t.timer = setTimeout(t.close, ms);
        else t.left = ms;
      },
      remaining: () => Math.max(0, t.end - Date.now()),
      close() {
        if (t.closed) return;
        t.closed = true;
        clearTimeout(t.timer);
        el.removeAttribute("data-show");
        setTimeout(() => {
          el.remove();
          if (toastHost && !toastHost.children.length) {
            try {
              if (POPOVER && toastHost.matches(":popover-open")) toastHost.hidePopover();
            } catch (_) {}
          }
        }, 180);
      },
    };
    el.addEventListener("mouseenter", () => {
      if (t.closed) return;
      clearTimeout(t.timer);
      t.left = t.remaining();
    });
    el.addEventListener("mouseleave", () => {
      if (t.closed) return;
      const ms = Math.max(1200, t.left);
      t.end = Date.now() + ms;
      t.timer = setTimeout(t.close, ms);
    });
    return t;
  }
  function noteToast(kind, text, ms = 3000) {
    try {
      const t = makeToast(kind);
      t.text(text);
      t.life(ms);
      return t;
    } catch (_) {
      return null;
    }
  }

  // ------------------------------------------------------------- highlight
  const highlights = new Set();
  function clearHighlights() {
    for (const h of highlights) {
      cancelAnimationFrame(h.raf);
      h.el.remove();
    }
    highlights.clear();
  }
  function showHighlight(target, ms) {
    clearHighlights();
    const el = document.createElement("div");
    el.className = "rtud-hl";
    el.setAttribute(UI_ATTR, "");
    el.setAttribute("aria-hidden", "true");
    if (POPOVER) el.popover = "manual";
    const radius = parseFloat(getComputedStyle(target).borderTopLeftRadius) || 6;
    el.style.setProperty("--rtud-radius", `${radius + 4}px`);
    (document.body || document.documentElement).append(el);
    raise(el);
    const h = { el, raf: 0, target };
    highlights.add(h);
    const end = performance.now() + ms;
    const place = () => {
      if (!el.isConnected) return;
      const r = target.isConnected ? target.getBoundingClientRect() : null;
      if (!r || performance.now() > end) {
        el.dataset.out = "";
        setTimeout(() => {
          el.remove();
          highlights.delete(h);
        }, 320);
        return;
      }
      el.style.left = `${r.left - 4}px`;
      el.style.top = `${r.top - 4}px`;
      el.style.width = `${r.width + 8}px`;
      el.style.height = `${r.height + 8}px`;
      h.raf = requestAnimationFrame(place);
    };
    place();
    return el;
  }

  // ------------------------------------------------------- source location
  function chatViewFor(key) {
    const ss = window.__chatSessionStoreDebug;
    for (const v of document.querySelectorAll(".chat-view[data-chat-session-id]")) {
      const k = v.getAttribute("data-chat-session-id");
      let same = k === key;
      if (!same && ss && typeof ss.resolveKey === "function") {
        try {
          same = ss.resolveKey(k) === ss.resolveKey(key);
        } catch (_) {}
      }
      if (same && visible(v)) return v;
    }
    return null;
  }
  function lastItem(v) {
    const items = Array.from(v.querySelectorAll('[data-testid="virtuoso-item-list"] > [data-index], [data-index]')).filter(visible);
    return items.length ? items[items.length - 1] : null;
  }
  const transcriptOf = (v) => v.querySelector('[data-testid="virtuoso-item-list"]') || v.querySelector(".message-list") || v;
  function commandEl(v, source) {
    const root = transcriptOf(v);
    const pick = (list, test) => {
      let found = null;
      for (const el of list) if (!el.closest('[contenteditable="true"], .ProseMirror') && test(norm(el.textContent))) found = el;
      return found;
    };
    if (source.block) {
      const a = norm(source.action || "");
      const snake = a.replace(/ /g, "_");
      return pick(root.querySelectorAll("pre"), (t) => t.includes(a) || t.includes(snake));
    }
    const needle = norm(source.raw);
    return pick(root.querySelectorAll("p, li"), (t) => t.startsWith("@tempo-ui") && (t === needle || t.startsWith(needle)));
  }
  function sourceOf(source, action) {
    if (source.kind === "chat") {
      const v = chatViewFor(source.sessionKey);
      if (v) {
        const el = commandEl(v, Object.assign({ action }, source));
        if (el && visible(el)) return { rect: rectOf(el), el: source.block ? null : el };
        const last = lastItem(v);
        return { rect: rectOf(last || v), el: null };
      }
      return null;
    }
    const v = Array.from(document.querySelectorAll(".chat-view")).find(visible);
    if (!v) return null;
    const last = lastItem(v);
    return { rect: rectOf(last || v), el: null };
  }
  function whoFor(source) {
    if (source.agent === "codex") return "Codex";
    if (source.kind === "chat" && source.sessionKey) {
      const c = chatCandidates().find((x) => x.sessionId === source.sessionKey);
      if (c && /codex|openai/i.test(String(c.provider || ""))) return "Codex";
    }
    return "Claude";
  }

  // --------------------------------------------------- transcript chips
  const chipStatus = new Map(); // norm(line) -> status of its last run
  function setChip(raw, status) {
    chipStatus.set(norm(raw), status);
    if (chipStatus.size > 100) chipStatus.delete(chipStatus.keys().next().value);
  }
  function markChips() {
    if (!chipStatus.size) return;
    for (const v of document.querySelectorAll(".chat-view")) {
      if (!visible(v)) continue;
      for (const p of transcriptOf(v).querySelectorAll("p, li")) {
        const t = p.textContent;
        if (!t || t.length > 400 || t.trimStart().slice(0, 9).toLowerCase() !== "@tempo-ui") continue;
        if (p.closest('[contenteditable="true"], .ProseMirror')) continue;
        const st = chipStatus.get(norm(t));
        if (st && p.getAttribute("data-rtud-cmd") !== st) p.setAttribute("data-rtud-cmd", st);
      }
    }
  }

  // ------------------------------------------------------------- executor
  const logArr = [];
  const recent = []; // execution times, for the rate limit
  const lastBySig = new Map();
  let seq = 0;
  const queue = [];
  let busy = false;
  function pushLog(e) {
    logArr.push(e);
    if (logArr.length > LOG_MAX) logArr.shift();
  }
  function enqueue(cmd, source) {
    return new Promise((res) => {
      queue.push({ cmd, source, res });
      pump();
    });
  }
  async function pump() {
    if (busy) return;
    busy = true;
    try {
      while (queue.length) {
        const job = queue.shift();
        let entry;
        try {
          entry = await execute(job.cmd, job.source);
        } catch (e) {
          entry = { status: "failed", reason: String((e && e.message) || e) };
        }
        const out = Object.assign({}, entry, entry && entry.args ? { args: Object.assign({}, entry.args) } : null);
        const full = entry && entry[FULL];
        if (full && full.result !== undefined) out.result = full.result;
        if (full && full.dataUrl) out.dataUrl = full.dataUrl;
        job.res(out);
      }
    } finally {
      busy = false;
    }
  }
  const beamApi = () => {
    const b = window.__RE_TEMPO_UI_BEAM__;
    return b && typeof b.play === "function" ? b : null;
  };
  function capJson(v, max) {
    let s;
    try {
      s = JSON.stringify(v);
    } catch (_) {
      return { unserializable: true };
    }
    if (s === undefined) return null;
    return s.length <= max ? JSON.parse(s) : { truncated: true, bytes: s.length, preview: s.slice(0, 2000) };
  }
  const lcFirst = (t) => t.charAt(0).toLowerCase() + t.slice(1);

  async function execute(cmd, source) {
    const id = `rtud-${START.toString(36)}-${(++seq).toString(36)}`;
    const entry = {
      id,
      at: Date.now(),
      source: source.kind,
      action: (cmd && cmd.action) || null,
      args: cmd && cmd.args ? Object.assign({}, cmd.args) : null,
      raw: source.raw ? clip(String(source.raw), 300) : null,
      status: "pending",
      reason: null,
      via: null,
      ms: 0,
    };
    if (source.cliId) entry.cliId = source.cliId;
    if (source.sessionKey) entry.session = source.sessionKey;
    pushLog(entry);
    const t0 = performance.now();
    const finish = (status, reason, via, full) => {
      entry.status = status;
      entry.reason = reason || null;
      entry.via = via || null;
      entry.ms = Math.round(performance.now() - t0);
      if (cmd && cmd.action) entry.action = cmd.action;
      entry.args = cmd && cmd.args ? Object.assign({}, cmd.args) : entry.args;
      if (full) {
        Object.defineProperty(entry, FULL, { value: full, enumerable: false });
        if (full.result !== undefined && full.result !== null) entry.result = capJson(full.result, LOG_RESULT_MAX);
      }
      if (source.kind === "chat" && !source.block && source.raw) setChip(source.raw, status);
      if (source.kind === "cli") writeReply(source, entry, full);
      return entry;
    };
    if (!enabled()) return finish("refused", 'ui-drive is off (localStorage "rtd.uiDrive" = "off")');
    const who = whoFor(source);
    const err = validate(cmd);
    if (err) {
      noteToast("refused", `Blocked a UI command from ${who}: ${err}`);
      return finish("refused", err);
    }
    const plan = planOf(cmd.action);
    const quiet = !!plan.quiet;
    const now = Date.now();
    while (recent.length && now - recent[0] > RATE_WINDOW_MS) recent.shift();
    if (!quiet && recent.length >= RATE_MAX) {
      noteToast("refused", `Blocked a UI command from ${who}: too many in a row`);
      return finish("refused", `rate limit: more than ${RATE_MAX} commands in ${RATE_WINDOW_MS / 1000} s`);
    }
    const sig = `${source.sessionKey || source.kind}|${cmdKey(cmd)}`;
    if (source.kind === "chat" && now - (lastBySig.get(sig) || 0) < REPEAT_MS) return finish("skipped", "the same command from the same chat ran less than 5 s ago");
    lastBySig.set(sig, now);
    if (!quiet) recent.push(now);
    entry.args = Object.assign({}, cmd.args);

    const a = cmd.args;
    const label = plan.label(a);
    const ctx = { who, source, id };
    const fullOf = (res) => ({ result: res.result, reply: res.reply || null, dataUrl: res.dataUrl || null });
    // list / screenshot: no events, no beam, no toast (a capture must not show them)
    if (quiet) {
      let res;
      try {
        res = await plan.run(a, null, ctx);
      } catch (e) {
        res = fail(String((e && e.message) || e));
      }
      res = res || fail("no result");
      return finish(res.ok ? "done" : "failed", res.reason, res.via, fullOf(res));
    }

    let prep = null;
    try {
      prep = plan.prepare ? await plan.prepare(a, ctx) : null;
    } catch (_) {}
    let targetEl = null;
    try {
      targetEl = plan.target ? plan.target(a, prep, ctx) || null : null;
    } catch (_) {}
    let targetRect = targetEl ? rectOf(targetEl) : null;
    if (!targetRect && plan.targetRect) {
      try {
        targetRect = plan.targetRect(a) || null;
      } catch (_) {}
    }
    const src = sourceOf(source, cmd.action);
    if (src && src.el && !source.block) src.el.setAttribute("data-rtud-cmd", "pending");
    if (source.kind === "chat" && !source.block && source.raw) setChip(source.raw, "pending");
    const risk = plan.destructive ? "destructive" : plan.confirm ? "caution" : "safe";
    const detail = { id, action: cmd.action, args: Object.assign({}, a), label: label.ing, risk, source: source.kind, sourceRect: src ? src.rect : null, targetEl, targetRect, status: "pending" };
    fire("rtud:action", detail);

    let denied = false;
    let approved = false;
    let onDecide = null;
    const decideP = new Promise((r) => (onDecide = r));
    let toast = null;
    if (plan.destructive) {
      // never auto-approved: an explicit Allow within ASK_MS, else denied
      toast = makeToast("ask");
      toast.text(`${who} asks: ${label.ing}`);
      toast.buttons([
        {
          act: "allow",
          label: "Allow",
          primary: true,
          fn: () => {
            approved = true;
            onDecide();
          },
        },
        {
          act: "deny",
          label: "Deny",
          fn: () => {
            denied = true;
            onDecide();
          },
        },
      ]);
      toast.life(ASK_MS);
    } else if (plan.confirm && !alwaysAllow()) {
      toast = makeToast("confirm");
      toast.text(plan.generic ? `${who} · ${label.ing}` : `${who} is ${lcFirst(label.ing)}`);
      toast.buttons([
        {
          act: "deny",
          label: "Deny",
          fn: () => {
            denied = true;
            onDecide();
          },
        },
      ]);
      toast.life(TOAST_MS);
    }
    const beam = beamApi();
    const beamP = beam
      ? Promise.race([
          (async () => {
            try {
              await beam.play(detail);
            } catch (_) {}
          })(),
          sleep(BEAM_MAX_MS),
        ])
      : Promise.resolve();
    let denyReason = "denied by the user";
    if (plan.destructive) {
      await Promise.race([decideP, sleep(ASK_MS)]);
      if (!approved && !denied) {
        denied = true;
        denyReason = `not approved within ${ASK_MS / 1000} s`;
      }
      if (approved) await beamP;
    } else await Promise.race([beamP, decideP]);
    if (denied) {
      try {
        if (beam && typeof beam.cancel === "function") beam.cancel();
      } catch (_) {}
      fire("rtud:done", { id, action: cmd.action, args: Object.assign({}, a), label: label.ing, status: "denied", reason: denyReason, via: null, resultEl: null, resultRect: null });
      if (toast) toast.close();
      if (src && src.el) src.el.setAttribute("data-rtud-cmd", "denied");
      return finish("denied", denyReason);
    }

    const before = viewNow();
    let res;
    try {
      res = await plan.run(a, prep, ctx);
    } catch (e) {
      res = fail(String((e && e.message) || e));
    }
    res = res || fail("no result");
    const status = res.ok ? "done" : "failed";
    fire("rtud:done", { id, action: cmd.action, args: Object.assign({}, a), label: label.ing, status, reason: res.reason || null, via: res.via || null, resultEl: res.el || null, resultRect: res.el ? rectOf(res.el) : null, result: res.result === undefined ? null : res.result });
    if (src && src.el && !source.block) src.el.setAttribute("data-rtud-cmd", status);

    if (toast && toast.closed) {
      // the action outlived the confirmation toast: a fresh one for the result
      toast = makeToast("confirm");
      toast.life(TOAST_MS);
    }
    const failText = plan.generic ? `${who} · ${label.ing} · failed: ${res.reason}` : `${who} couldn't ${label.verb}: ${res.reason}`;
    if (toast) {
      if (!res.ok) {
        toast.el.dataset.kind = "failed";
        toast.text(failText);
        toast.buttons([]);
        if (toast.remaining() < 2500) toast.life(2500);
      } else {
        toast.el.dataset.kind = "done";
        toast.text(plan.generic ? `${who} · ${label.ed}` : `${who} ${label.ed}`);
        const btns = [];
        if (plan.undo || !plan.generic) {
          btns.push({
            act: "undo",
            label: "Undo",
            primary: true,
            fn: async () => {
              toast.close();
              let back = false;
              try {
                back = plan.undo ? await plan.undo(a, { before, res, prep }) : await restoreView(before);
              } catch (_) {}
              entry.status = "undone";
              entry.reason = back ? "undone by the user" : "undo failed";
              if (source.kind === "chat" && !source.block && source.raw) setChip(source.raw, "undone");
            },
          });
        }
        if (!plan.destructive) {
          btns.push({
            act: "always",
            label: "Always allow",
            fn: () => {
              lsSet(ALLOW_KEY, "always");
              toast.close();
            },
          });
        }
        toast.buttons(btns);
        if (toast.remaining() < 1500) toast.life(1500);
      }
    } else if (!res.ok) {
      noteToast("failed", failText);
    }
    return finish(status, res.reason, res.via, fullOf(res));
  }

  // ------------------------------------------------------- seen (dedupe)
  const seen = new Set();
  try {
    const arr = JSON.parse(lsGet(SEEN_KEY) || "[]");
    if (Array.isArray(arr)) for (const k of arr.slice(-SEEN_MAX)) seen.add(String(k));
  } catch (_) {}
  let seenTimer = 0;
  function markSeen(k) {
    seen.add(k);
    while (seen.size > SEEN_MAX) seen.delete(seen.values().next().value);
    clearTimeout(seenTimer);
    seenTimer = setTimeout(() => lsSet(SEEN_KEY, JSON.stringify(Array.from(seen))), 200);
  }
  // Claimed synchronously in localStorage too, so a reload never replays it.
  function claim(k) {
    if (seen.has(k)) return false;
    markSeen(k);
    lsSet(SEEN_KEY, JSON.stringify(Array.from(seen)));
    return true;
  }

  // --------------------------------------------------- source (a): chats
  const lastArr = new Map();
  const bootIds = new Set();
  let booted = false;
  function textOf(m) {
    if (!m) return "";
    if (typeof m.content === "string") return m.content;
    if (!Array.isArray(m.content)) return "";
    return m.content
      .filter((p) => p && p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("\n");
  }
  function sessionKeys(ss) {
    try {
      if (typeof ss.getAllStateKeys === "function") return Array.from(ss.getAllStateKeys() || []);
      if (ss.states instanceof Map) return Array.from(ss.states.keys());
    } catch (_) {}
    return [];
  }
  function pollChats() {
    const ss = window.__chatSessionStoreDebug;
    if (!ss || typeof ss.getMessages !== "function") return;
    for (const key of sessionKeys(ss)) {
      let msgs;
      try {
        msgs = ss.getMessages(key);
      } catch (_) {
        continue;
      }
      if (!Array.isArray(msgs) || lastArr.get(key) === msgs) continue;
      lastArr.set(key, msgs);
      for (const m of msgs) scanMessage(key, m);
    }
    booted = true;
  }
  function scanMessage(key, m) {
    if (!m || m.role !== "assistant" || m.isCompactSummary) return;
    const id = m.id != null ? String(m.id) : null;
    if (!booted && id) bootIds.add(id);
    const text = textOf(m);
    if (!text || text.indexOf("tempo-ui") < 0) return;
    const ts = toMs(m.timestamp);
    const fresh = ts != null ? ts >= START - FRESH_MS : booted && !!id && !bootIds.has(id);
    if (!fresh) return;
    const mid = id || `${key}@${ts}`;
    for (const c of extract(text, m.isStreaming !== true)) {
      if (!claim(`${mid}#${c.n}`)) continue;
      enqueue(c.cmd, { kind: "chat", sessionKey: key, messageId: mid, raw: c.raw, block: c.block });
    }
  }

  // ----------------------------------------------------- source (b): CLI
  const cli = { bridge: null, paths: null, sig: new Map(), reads: 0, consumed: 0, lastError: null, replies: new Map(), writing: Promise.resolve() };
  const fsApi = () => (window.electronAPI && window.electronAPI.fs) || null;
  const unwrap = (r) => (r && typeof r === "object" && "success" in r ? (r.success ? r.data : null) : r);
  async function call(fn, ...args) {
    try {
      return unwrap(await fn(...args));
    } catch (e) {
      cli.lastError = String((e && e.message) || e);
      return null;
    }
  }
  async function cliPaths() {
    const o = (lsGet(FILE_KEY) || "").trim();
    if (o) return [o];
    const out = [];
    const ws = window.electronAPI && window.electronAPI.workspaces;
    let home = ws && typeof ws.getHomeDir === "function" ? await call(ws.getHomeDir) : null;
    if (typeof home === "string" && home) {
      home = home.replace(/\/+$/, "");
      const m = /^\/Users\/[^/]+/.exec(home);
      if (m && m[0] !== home) out.push(`${m[0]}/.tempo/ui-commands.jsonl`);
      out.push(`${home}/.tempo/ui-commands.jsonl`);
    }
    return Array.from(new Set(out));
  }
  let cliBusy = false;
  async function pollCli() {
    if (cliBusy) return;
    const f = fsApi();
    if (!f || typeof f.readFile !== "function") {
      cli.bridge = "none";
      return;
    }
    cliBusy = true;
    try {
      cli.bridge = typeof f.stat === "function" ? "electronAPI.fs.stat+readFile" : "electronAPI.fs.readFile";
      if (!cli.paths) cli.paths = await cliPaths();
      for (const p of cli.paths) {
        let sig = null;
        if (typeof f.stat === "function") {
          const st = await call(f.stat, p);
          if (!st) {
            cli.sig.set(p, null);
            continue;
          }
          sig = JSON.stringify(st);
          if (cli.sig.get(p) === sig) continue;
        }
        const text = await call(f.readFile, p);
        if (typeof text !== "string") continue;
        cli.reads++;
        cli.sig.set(p, sig);
        consumeCli(p, text);
      }
    } finally {
      cliBusy = false;
    }
  }
  function consumeCli(file, text) {
    for (const line of text.split("\n").slice(-200)) {
      if (!line.trim()) continue;
      let j;
      try {
        j = JSON.parse(line);
      } catch (_) {
        continue;
      }
      if (!j || typeof j.id !== "string" || !j.id) continue;
      if (seen.has(`cli:${j.id}`)) continue;
      const ts = toMs(j.ts);
      if (ts == null || Date.now() - ts > CLI_FRESH_MS) {
        markSeen(`cli:${j.id}`);
        continue;
      }
      if (!claim(`cli:${j.id}`)) continue;
      cli.consumed++;
      // natives come validated as {action, args}; anything else as argv,
      // resolved against the registry when it runs
      const cmd = j.action ? fromObject({ action: j.action, args: j.args }) : Array.isArray(j.argv) ? parseLine(null, j.argv) : { error: "empty command" };
      enqueue(cmd, { kind: "cli", file, cliId: j.id, cwd: typeof j.cwd === "string" ? j.cwd : null, agent: typeof j.agent === "string" ? j.agent : null, raw: typeof j.raw === "string" ? j.raw : `${j.action || ""}` });
    }
  }
  // ui-replies.jsonl next to the command file: the last REPLY_MAX replies,
  // one JSON per line {id, status, reason, via, action, args, at, result?,
  // dataUrl?}. Only the newest reply keeps its dataUrl (screenshots).
  function writeReply(source, entry, full) {
    const f = fsApi();
    if (!f || typeof f.writeFile !== "function" || !source.file) return;
    const replyPath = source.file.replace(/[^/]*$/, "ui-replies.jsonl");
    const list = cli.replies.get(replyPath) || [];
    const rec = { id: source.cliId, status: entry.status, reason: entry.reason, via: entry.via, action: entry.action, args: entry.args, at: Date.now() };
    if (full && full.result !== undefined && full.result !== null) rec.result = capJson(full.result, REPLY_RESULT_MAX);
    if (full && full.reply && full.reply.dataUrl) {
      for (const r of list) delete r.dataUrl;
      rec.dataUrl = full.reply.dataUrl;
    }
    list.push(rec);
    while (list.length > REPLY_MAX) list.shift();
    cli.replies.set(replyPath, list);
    const body = `${list.map((r) => JSON.stringify(r)).join("\n")}\n`;
    cli.writing = cli.writing.then(() => call(f.writeFile, replyPath, body)).catch(() => {});
  }

  // ------------------------------------------------------------------ CSS
  let cssLink = null;
  function ensureCss() {
    if (document.querySelector('link[rel="stylesheet"][href*="ui-drive.css"]')) return;
    if (!SELF_SRC || !/\.js(\?|#|$)/.test(SELF_SRC)) return;
    cssLink = document.createElement("link");
    cssLink.rel = "stylesheet";
    cssLink.href = SELF_SRC.replace(/\.js(?=\?|#|$)/, ".css");
    cssLink.setAttribute("data-rtud-css", "");
    (document.head || document.documentElement).appendChild(cssLink);
  }

  // ------------------------------------------------------------- lifecycle
  function cliPath() {
    try {
      const u = new URL("bin/tempo-ui", SELF_SRC);
      if (u.protocol === "file:") return decodeURIComponent(u.pathname);
    } catch (_) {}
    return null;
  }
  const instructions = () => INSTRUCTIONS.replace(/<CLI>/g, cliPath() || "<repo>/feature/bin/tempo-ui");

  let ticks = 0;
  function tick() {
    if (!S.ws && enabled()) discover();
    try {
      pollChats();
    } catch (_) {}
    if (++ticks % 2 === 0) {
      try {
        markChips();
      } catch (_) {}
    }
  }
  let timer = 0;
  let fileTimer = 0;
  function start() {
    ensureCss();
    if (!IS_MAIN) return;
    timer = setInterval(tick, POLL_MS);
    fileTimer = setInterval(() => pollCli().catch(() => {}), FILE_POLL_MS);
    tick();
    pollCli().catch(() => {});
  }
  function dispose() {
    clearInterval(timer);
    clearInterval(fileTimer);
    clearTimeout(seenTimer);
    lsSet(SEEN_KEY, JSON.stringify(Array.from(seen)));
    clearHighlights();
    if (toastHost) toastHost.remove();
    toastHost = null;
    for (const el of document.querySelectorAll("[data-rtud-cmd]")) el.removeAttribute("data-rtud-cmd");
    if (cssLink) cssLink.remove();
    cssLink = null;
    // other mods' registrations survive a re-injection of this mod
    const keep = Array.from(REG.values())
      .filter((e) => !e.native && !/^ui-drive/.test(e.owner))
      .map((e) => [e.id, e.raw]);
    window.__RE_TEMPO_ACTIONS_PENDING__ = keep;
    if (window.__RE_TEMPO_ACTIONS__ === registry) delete window.__RE_TEMPO_ACTIONS__;
    if (window.__RE_TEMPO_UI_DRIVE__ === api) delete window.__RE_TEMPO_UI_DRIVE__;
  }

  // window.__RE_TEMPO_ACTIONS__ (see "registry" above for the spec shape).
  const registry = {
    version: 1,
    register,
    unregister,
    has: (id) => REG.has(String(id || "").toLowerCase()),
    get: (id) => {
      const e = REG.get(String(id || "").toLowerCase());
      return e ? describe(e) : null;
    },
    list: () => registryList(),
    // Same pipeline as chat / CLI commands (events, beam, toasts); resolves
    // {status, reason, via, result, dataUrl?}. Do not await it inside your own
    // run(): commands run one at a time.
    run: (id, args) => enqueue(fromObject({ action: String(id || ""), args: args == null ? {} : args }), { kind: "api", raw: `${id}` }),
  };

  const api = {
    version: 1,
    help: () => instructions(),
    // run("open settings") | run("@tempo-ui go design") | run({action, args})
    run: (input) => enqueue(parseInput(input), { kind: "api", raw: typeof input === "string" ? input : JSON.stringify(input) }),
    // Commands found in a message text, validated (nothing runs).
    parse(text, final = true) {
      return extract(text, final).map((c) => {
        const cmd = Object.assign({}, c.cmd, c.cmd.args ? { args: Object.assign({}, c.cmd.args) } : null);
        const error = validate(cmd);
        return { raw: c.raw, block: c.block, action: cmd.action || null, args: cmd.args || null, error: error || null };
      });
    },
    log: () => logArr.map((e) => Object.assign({}, e, { args: e.args ? Object.assign({}, e.args) : null })),
    state: () => ({
      enabled: enabled(),
      main: IS_MAIN,
      store: !!S.ws,
      beam: !!beamApi(),
      projectSidebar: !!psApi(),
      sessions: lastArr.size,
      busy,
      queue: queue.length,
      seen: seen.size,
      alwaysAllow: alwaysAllow(),
      cli: { bridge: cli.bridge, paths: cli.paths ? cli.paths.slice() : null, reads: cli.reads, consumed: cli.consumed, lastError: cli.lastError },
    }),
    setEnabled(on) {
      lsSet(FLAG_KEY, on ? null : "off");
      return enabled();
    },
    setAlwaysAllow(on) {
      lsSet(ALLOW_KEY, on ? "always" : null);
      return alwaysAllow();
    },
    get actions() {
      return Array.from(REG.values()).map((e) => e.id);
    },
    runActions: Object.keys(RUN_ACTIONS),
    registry,
    dispose,
  };
  window.__RE_TEMPO_UI_DRIVE__ = api;
  window.__RE_TEMPO_ACTIONS__ = registry;
  // Registrations made before this mod loaded: [[id, spec], ...]. Later pushes
  // register at once.
  const pendingRegs = window.__RE_TEMPO_ACTIONS_PENDING__;
  if (Array.isArray(pendingRegs)) for (const it of pendingRegs.splice(0)) if (Array.isArray(it)) register(it[0], it[1]);
  window.__RE_TEMPO_ACTIONS_PENDING__ = {
    push(...items) {
      for (const it of items) if (Array.isArray(it)) register(it[0], it[1]);
      return 0;
    },
  };
  fire("rtd:actions-ready", { registry });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
