/*
 * RE-TEMPO · title-crumb (user MOD layer)
 * ---------------------------------------------------------------------------
 * Turns the branch title centered in the window header into a full breadcrumb:
 *
 *     [branch icon] owner / project / branch   [+8905]
 *
 * e.g. "main" -> "jdoe/seed-tracker/main", "jdoe/mango" -> "jdoe/seed-tracker/mango".
 *
 * The native element (mapped in the bundle, index-*.js, components Dya/Oya)
 *   [data-testid="app-header-branch-status"]   div.flex.items-center.gap-1.5.text-[13px]
 *     button[data-testid="app-header-branch-copy"]   tooltip trigger, aria-label
 *         "Copy branch name"; a click copies the branch (the icon turns into a
 *         check for 1.2 s)
 *       svg                                    git-branch icon (check while copied)
 *       span.text-text-primary                 THE TITLE TEXT (the branch name)
 *     diff badge (mono, filled)                "+N" text-success, "-M" text-critical
 *     span.sr-only[aria-live]                  "Branch name copied to clipboard"
 *   It is the shell header's centerContent (WorkspacesPage -> header): it sits in
 *   an absolutely positioned, centered overlay (absolute inset-0 justify-center),
 *   so it never takes layout space from the left/right header groups.
 *
 * What the text is: the shell computes it with XLa({activeRoute, currentBranch,
 * designHomeHeaderBranch}). currentBranch = the SELECTED workspace's
 * repo.currentBranch.trim() || repo.baseBranch (kept in sync with git through
 * getWorktreeBranch). On the design route it is the design home's header branch;
 * there is no title on issues/docs, for an archived workspace, or on agents unless
 * the agent center is open.
 * "jdoe/mango" is the literal git branch of the "mango" worktree: Tempo names the
 * branches of the local worktrees it creates "<git username>/<worktree name>"
 * (git worktree list: ".../seed-tracker/mango [jdoe/mango]"). It is not built
 * from the remote.
 * The "+8905" badge: total line additions (and deletions, when there are any) over
 * the workspace's changed files, uncommitted by default, or against the target
 * branch when the Changes panel is in "vs target" mode.
 *
 * Breadcrumb data (selected workspace -> its project):
 *   - workspaces store (zustand getState found in the hook deps of the header's
 *     ancestors, the same mechanism as project-sidebar / pane-dock), else the
 *     persisted state electronAPI.persist "tempo-workspaces";
 *   - project = project.name (the name in the sidebar);
 *   - owner = the remote's owner (github.com/<owner>/<repo>, any host): the
 *     project's repos[0].sourceUrl (the app backfills it from git), else
 *     electronAPI.workspaces.getRemoteUrl(path) (cached 60 s);
 *   - branch = the native text. When it starts with "<owner>/", that prefix is not
 *     repeated. With no remote, the prefix is used as the owner only when it is
 *     the git username (electronAPI.workspaces.getGitUsername, cached) or, while
 *     that is unknown, when the rest equals the worktree folder name (Tempo's own
 *     naming). Otherwise: "project/branch".
 *
 * DOM: the native nodes are never replaced. A span.rttc-crumb is inserted right
 * after the native text span inside the copy button, and the native span is
 * hidden (display:none). Icon, tooltip, copy click and badge keep working where
 * they were. Reapplied by a MutationObserver on the header plus a 250 ms tick,
 * idempotent (one crumb per header, orphans and duplicates removed).
 * Width: the crumb is limited to the free space between the left and right
 * header groups (centered), so it never covers or pushes the bar. When it does not
 * fit, segments are cut with an ellipsis in the middle ("seed…cker"): project
 * first, then owner, then branch.
 * Click on the project segment: the project-sidebar mod's
 * open.project(projectId), the same as clicking the project row (design home
 * with that project). Without that mod the segment is plain text.
 *
 * On/off: localStorage "rtd.titleCrumb" = "off" (or setEnabled(false)).
 * Introspection: window.__RE_TEMPO_TITLE_CRUMB__ (parts, text, info(), apply()).
 * Styles: title-crumb.css next to this file (loaded by index.html; injected from
 * this script's URL when the <link> is missing).
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (window.__RE_TEMPO_TITLE_CRUMB__) return; // double injection

  // ---------------------------------------------------------------- config
  const FLAG_KEY = "rtd.titleCrumb"; // "off" = native title
  const TICK_MS = 250;
  const REMOTE_TTL_MS = 60000;
  const USER_TTL_MS = 30 * 60000;
  const PERSIST_TTL_MS = 3000;
  const EDGE_GAP = 12; // px kept free next to the left/right header groups
  const MIN_WIDTH = 48;
  // Shrink stages [segment, chars kept around the ellipsis]: context (project)
  // gives way first, but every segment keeps a readable piece before any of them
  // goes to its hard minimum.
  const SHRINK_STAGES = [
    ["project", 12],
    ["branch", 16],
    ["project", 6],
    ["branch", 10],
    ["owner", 3],
    ["project", 4],
    ["branch", 6],
  ];
  const SEL = {
    status: '[data-testid="app-header-branch-status"]',
    copy: '[data-testid="app-header-branch-copy"]',
  };
  const CRUMB = "rttc-crumb";
  const NATIVE_ATTR = "data-rttc-native";
  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || "";

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

  function ensureCss() {
    if (!SCRIPT_SRC || document.querySelector('link[href*="title-crumb.css"]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.setAttribute("data-rar-css", "");
    l.href = SCRIPT_SRC.replace(/\.js(\?.*)?$/, ".css");
    (document.head || document.documentElement).appendChild(l);
  }

  // ------------------------------------------------------------- app store
  // zustand leaves getState in the deps of useSyncExternalStoreWithSelector's
  // useMemo; only pure `()=>x` getters are called (as project-sidebar does).
  const S = { ws: null };
  const GETTER_RE = /^\(\)=>[A-Za-z$_][\w$]*$/;
  const tried = new WeakSet();

  function checkFiber(f) {
    let h = f.memoizedState;
    if (!h || typeof h !== "object" || !("next" in h)) return;
    for (let i = 0; h && i < 400 && !S.ws; i++, h = h.next) {
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
      if (st && typeof st === "object" && Array.isArray(st.workspaces) && typeof st.setActiveNavRoute === "function") S.ws = gs;
    }
  }

  const fiberOf = (n) => {
    const k = n && Object.keys(n).find((x) => x.startsWith("__reactFiber$"));
    return k ? n[k] : null;
  };

  // 1) walk up from the header title (the shell reads the store); 2) otherwise a
  //    full tree scan, time-sliced and resumed across ticks.
  let scan = null;
  let lastScanEnd = -1e9;
  function discover(anchor) {
    if (S.ws) return true;
    for (let f = fiberOf(anchor), up = 0; f && up < 600 && !S.ws; f = f.return, up++) checkFiber(f);
    if (S.ws) return true;
    if (!scan) {
      if (performance.now() - lastScanEnd < 2000) return false;
      const root = document.getElementById("root");
      const key = root && Object.keys(root).find((k) => k.startsWith("__reactContainer$"));
      if (!key) return false;
      scan = { stack: [root[key]], seen: new Set() };
    }
    const deadline = performance.now() + 6;
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

  function storeState() {
    if (!S.ws) return null;
    try {
      const st = S.ws();
      if (st && Array.isArray(st.workspaces)) return st;
    } catch (_) {}
    S.ws = null; // stale getter: look again
    return null;
  }

  // Fallback while the store is not found: the persisted workspaces state.
  const P = { at: -1e9, state: null, pending: false };
  function persistState() {
    const api = window.electronAPI && window.electronAPI.persist;
    if (!api || typeof api.getItem !== "function") return null;
    if (!P.pending && Date.now() - P.at > PERSIST_TTL_MS) {
      P.pending = true;
      Promise.resolve()
        .then(() => api.getItem("tempo-workspaces"))
        .then(
          (raw) => {
            try {
              P.state = raw ? JSON.parse(raw).state || null : null;
            } catch (_) {
              P.state = null;
            }
          },
          () => {}
        )
        .then(() => {
          P.pending = false;
          P.at = Date.now();
          schedule();
        });
    }
    return P.state;
  }

  // ------------------------------------------------- git data (read-only IPC)
  const remoteCache = new Map(); // path -> { value, at, pending }
  const userCache = new Map();
  function cachedIpc(cache, ttl, name, path) {
    if (!path) return null;
    const api = window.electronAPI && window.electronAPI.workspaces;
    if (!api || typeof api[name] !== "function") return null;
    let e = cache.get(path);
    if (!e) cache.set(path, (e = { value: undefined, at: 0, pending: false }));
    if (!e.pending && (e.value === undefined || Date.now() - e.at > ttl)) {
      e.pending = true;
      Promise.resolve()
        .then(() => api[name](path))
        .then(
          (r) => {
            const d = r && typeof r === "object" ? (r.success ? r.data : null) : r;
            e.value = typeof d === "string" && d.trim() ? d.trim() : null;
          },
          () => {
            e.value = null;
          }
        )
        .then(() => {
          e.pending = false;
          e.at = Date.now();
          schedule();
        });
    }
    return e.value; // undefined while the first answer is pending
  }

  // git@host:owner/repo.git, ssh://git@host/owner/repo.git, https://host/owner/repo
  function parseRemote(url) {
    if (!url || typeof url !== "string") return null;
    const s = url.trim();
    let m = /^[\w.-]+@([^:/\s]+):(.+)$/.exec(s);
    if (!m) m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/\s]*@)?([^/:\s]+)(?::\d+)?\/(.+)$/i.exec(s);
    if (!m) return null;
    const segs = m[2]
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "")
      .replace(/\.git$/i, "")
      .split("/")
      .filter(Boolean);
    if (segs.length < 2) return null;
    return { host: m[1].toLowerCase(), owner: segs.slice(0, -1).join("/"), repo: segs[segs.length - 1] };
  }

  // ------------------------------------------------------------ breadcrumb
  const branchLabel = (w) => (w && w.repo && ((w.repo.currentBranch || "").trim() || w.repo.baseBranch)) || null;
  const folderOf = (p) => (typeof p === "string" ? p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || null : null);
  const same = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();

  function resolveContext(text) {
    const st = storeState() || persistState();
    if (!st) return null;
    const wss = Array.isArray(st.workspaces) ? st.workspaces : [];
    const projects = Array.isArray(st.projects) ? st.projects : [];
    const sel = wss.find((w) => w && w.id === st.selectedWorkspaceId) || null;
    let ws = sel;
    // The design home can title another branch than the selected workspace's.
    if (!ws || branchLabel(ws) !== text) {
      const c = wss.filter((w) => w && !w.isArchived && branchLabel(w) === text);
      ws = (sel && c.find((w) => w.projectId === sel.projectId)) || (c.length === 1 ? c[0] : null) || sel;
    }
    if (!ws) return null;
    const project = projects.find((p) => p && p.id === ws.projectId) || null;
    return { ws, project, via: S.ws ? "store" : "persist" };
  }

  function computeParts(text) {
    const ctx = resolveContext(text);
    if (!ctx) return null;
    const { ws, project } = ctx;
    const repo0 = project && Array.isArray(project.repos) ? project.repos[0] || null : null;
    const gitPath = ws.path || (repo0 && repo0.path) || null;
    let remoteUrl = (repo0 && repo0.sourceUrl) || null;
    let remoteVia = remoteUrl ? "store" : null;
    if (!remoteUrl) {
      remoteUrl = cachedIpc(remoteCache, REMOTE_TTL_MS, "getRemoteUrl", gitPath) || null;
      if (remoteUrl) remoteVia = "ipc";
    }
    const remote = parseRemote(remoteUrl);
    const name =
      (project && typeof project.name === "string" && project.name.trim()) ||
      (repo0 && repo0.name) ||
      (ws.repo && ws.repo.repoName) ||
      (remote && remote.repo) ||
      null;
    if (!name) return null;

    let owner = remote ? remote.owner : null;
    let ownerVia = owner ? "remote" : null;
    let branch = text;
    const cut = text.indexOf("/");
    if (cut > 0 && cut < text.length - 1) {
      const head = text.slice(0, cut);
      const tail = text.slice(cut + 1);
      if (owner) {
        if (same(head, owner)) branch = tail; // "jdoe/mango" + owner jdoe: no repeat
      } else {
        const user = cachedIpc(userCache, USER_TTL_MS, "getGitUsername", gitPath);
        const hoist = user ? same(head, user) : ws.mode === "worktree" && folderOf(ws.path) === tail;
        if (hoist) {
          owner = head;
          branch = tail;
          ownerVia = user ? "git-user" : "worktree-prefix";
        }
      }
    }
    return {
      owner,
      project: name,
      projectId: project ? project.id : null,
      branch,
      native: text,
      ownerVia,
      remoteVia,
      via: ctx.via,
      workspaceId: ws.id,
    };
  }

  const toList = (p) => (p ? [p.owner, p.project, p.branch].filter(Boolean) : []);

  // ------------------------------------------------------------- project click
  function projectOpener() {
    const ps = window.__RE_TEMPO_PROJECT_SIDEBAR__;
    return ps && ps.open && typeof ps.open.project === "function" ? (id) => ps.open.project(id) : null;
  }
  let lastClick = null;
  function onCrumbClick(e) {
    const seg = e.target && e.target.closest ? e.target.closest(".rttc-link") : null;
    if (!seg) return; // owner/branch: the native copy click
    const open = projectOpener();
    if (!open) return;
    e.preventDefault();
    e.stopPropagation(); // keeps the button's copy handler out
    lastClick = { projectId: seg.dataset.projectId, at: Date.now() };
    try {
      Promise.resolve(open(seg.dataset.projectId)).catch(() => {});
    } catch (_) {}
  }

  // ------------------------------------------------------------------- DOM
  const meta = new WeakMap(); // crumb -> { sig, fitKey }

  function nativeSpanOf(btn) {
    for (const c of btn.children) if (c.tagName === "SPAN" && !c.classList.contains(CRUMB)) return c;
    return null;
  }

  function createCrumb() {
    const el = document.createElement("span");
    el.className = CRUMB;
    el.addEventListener("click", onCrumbClick);
    meta.set(el, { sig: "", fitKey: "" });
    return el;
  }

  function renderCrumb(el, p, link) {
    el.textContent = "";
    let first = true;
    const add = (kind, text) => {
      if (!first) {
        const s = document.createElement("span");
        s.className = "rttc-sep";
        s.setAttribute("aria-hidden", "true");
        s.textContent = "/";
        el.appendChild(s);
      }
      first = false;
      const x = document.createElement("span");
      x.className = "rttc-seg rttc-" + kind;
      x.dataset.kind = kind;
      x.dataset.full = text;
      x.textContent = text;
      el.appendChild(x);
      return x;
    };
    if (p.owner) add("owner", p.owner);
    const proj = add("project", p.project);
    add("branch", p.branch);
    if (link) {
      proj.classList.add("rttc-link");
      proj.dataset.projectId = p.projectId;
    }
  }

  // Free width around the header center: the overlay is centered, so the crumb
  // may use twice the distance to the closer of the left/right groups.
  function maxCrumbWidth(status, crumb) {
    const header = status.closest("header");
    if (!header) return Infinity;
    const overlay = Array.from(header.children).find((c) => c.contains(status)) || header;
    const or = overlay.getBoundingClientRect();
    if (!or.width) return Infinity;
    const cx = or.left + or.width / 2;
    let left = or.left;
    let right = or.right;
    const visit = (el, depth) => {
      if (el.contains(status)) return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      if (r.left < cx && r.right > cx) {
        if (depth < 3) for (const c of el.children) visit(c, depth + 1);
        return;
      }
      if (r.right <= cx) left = Math.max(left, r.right);
      else right = Math.min(right, r.left);
    };
    for (const c of header.children) if (c !== overlay) visit(c, 0);
    const half = Math.min(cx - left, right - cx) - EDGE_GAP;
    const other = status.getBoundingClientRect().width - crumb.getBoundingClientRect().width;
    return Math.max(MIN_WIDTH, Math.floor(2 * half - other));
  }

  function middle(s, k) {
    const ch = Array.from(s);
    if (ch.length <= k) return s;
    const head = Math.ceil(k / 2);
    const tail = k - head;
    return ch.slice(0, head).join("") + "…" + (tail ? ch.slice(-tail).join("") : "");
  }

  function fit(status, crumb) {
    const m = meta.get(crumb);
    const max = maxCrumbWidth(status, crumb);
    const key = m.sig + "|" + max;
    if (m.fitKey === key && crumb.scrollWidth <= max + 1) return;
    m.fitKey = key;
    const segs = {};
    for (const s of crumb.querySelectorAll(".rttc-seg")) {
      segs[s.dataset.kind] = s;
      if (s.textContent !== s.dataset.full) s.textContent = s.dataset.full;
    }
    crumb.classList.remove("rttc-squeeze");
    crumb.removeAttribute("data-truncated");
    crumb.style.maxWidth = Number.isFinite(max) ? max + "px" : "";
    const fits = () => crumb.scrollWidth <= max;
    if (!Number.isFinite(max) || fits()) return;
    crumb.setAttribute("data-truncated", "");
    const kept = {}; // segment -> chars currently kept
    for (const [kind, min] of SHRINK_STAGES) {
      const el = segs[kind];
      if (!el) continue;
      const full = el.dataset.full;
      const cur = kept[kind] != null ? kept[kind] : Array.from(full).length;
      if (cur <= min + 1) continue;
      let lo = min;
      let hi = cur - 1;
      let best = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        el.textContent = middle(full, mid);
        if (fits()) {
          best = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      kept[kind] = best >= 0 ? best : min;
      el.textContent = middle(full, kept[kind]);
      if (best >= 0) return;
    }
    if (!fits()) crumb.classList.add("rttc-squeeze"); // last resort: CSS clip
  }

  function hideNative(nat) {
    if (!nat.hasAttribute(NATIVE_ATTR)) nat.setAttribute(NATIVE_ATTR, "");
    if (nat.style.display !== "none") nat.style.display = "none";
  }
  function showNative(nat) {
    if (!nat.hasAttribute(NATIVE_ATTR)) return;
    nat.removeAttribute(NATIVE_ATTR);
    nat.style.display = "";
  }

  function teardown() {
    for (const c of document.querySelectorAll("." + CRUMB)) c.remove();
    for (const x of document.querySelectorAll("[" + NATIVE_ATTR + "]")) showNative(x);
    last = { parts: null, at: Date.now(), headers: 0 };
  }

  // ----------------------------------------------------------------- apply
  let last = { parts: null, at: 0, headers: 0 };
  let applies = 0;
  let errors = 0;

  function applyOnce() {
    if (!enabled()) {
      teardown();
      return 0;
    }
    ensureCss();
    const statuses = document.querySelectorAll(SEL.status);
    const keep = new Set();
    let first = null;
    for (const status of statuses) {
      const btn = status.querySelector(SEL.copy);
      const nat = btn && nativeSpanOf(btn);
      if (!nat) continue;
      if (!S.ws) discover(status);
      const text = (nat.textContent || "").trim();
      const p = text ? computeParts(text) : null;
      let crumb = btn.querySelector(":scope > ." + CRUMB);
      if (!p) {
        if (crumb) crumb.remove();
        showNative(nat);
        continue;
      }
      if (!crumb || !meta.has(crumb)) {
        if (crumb) crumb.remove();
        crumb = createCrumb();
      }
      if (crumb.parentNode !== btn || crumb.previousSibling !== nat) btn.insertBefore(crumb, nat.nextSibling);
      const link = !!(p.projectId && projectOpener());
      const sig = [p.owner || "", p.project, p.branch, link ? p.projectId : ""].join("\u0001");
      const m = meta.get(crumb);
      if (m.sig !== sig) {
        renderCrumb(crumb, p, link);
        m.sig = sig;
        m.fitKey = "";
      }
      hideNative(nat);
      fit(status, crumb);
      keep.add(crumb);
      if (!first) first = p;
      observe(status);
    }
    // one crumb per header: drop orphans and duplicates, give hidden text back
    for (const c of document.querySelectorAll("." + CRUMB)) if (!keep.has(c)) c.remove();
    for (const x of document.querySelectorAll("[" + NATIVE_ATTR + "]")) {
      const b = x.parentElement;
      if (!b || !b.querySelector(":scope > ." + CRUMB)) showNative(x);
    }
    last = { parts: first, at: Date.now(), headers: keep.size };
    applies++;
    return keep.size;
  }

  function apply() {
    scheduled = false;
    try {
      return applyOnce();
    } catch (e) {
      errors++;
      try {
        teardown(); // never leave the title hidden
      } catch (_) {}
      if (errors <= 3) console.warn("[title-crumb]", e);
      return 0;
    }
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(apply, 0); // not rAF: it stalls in background windows
  }

  // Header observer: instant reapply on React updates (text, remount, icon swap).
  const observed = new WeakSet();
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      const t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (t && t.closest && t.closest("." + CRUMB)) continue; // our own writes
      schedule();
      return;
    }
  });
  function observe(status) {
    const host = status.closest("header") || status.parentElement;
    if (!host || observed.has(host)) return;
    observed.add(host);
    mo.observe(host, { childList: true, subtree: true, characterData: true });
  }

  // ------------------------------------------------------------ debug API
  window.__RE_TEMPO_TITLE_CRUMB__ = {
    get parts() {
      return toList(last.parts);
    },
    get text() {
      return toList(last.parts).join("/");
    },
    get enabled() {
      return enabled();
    },
    setEnabled(v) {
      lsSet(FLAG_KEY, v ? null : "off");
      return apply();
    },
    apply: () => apply(),
    info: () => ({
      enabled: enabled(),
      store: !!S.ws,
      headers: last.headers,
      parts: last.parts ? { ...last.parts } : null,
      projectClick: !!projectOpener(),
      lastClick,
      applies,
      errors,
      remotes: Array.from(remoteCache, ([k, v]) => [k, v.value]),
      gitUsers: Array.from(userCache, ([k, v]) => [k, v.value]),
    }),
  };

  function boot() {
    ensureCss();
    apply();
    setInterval(apply, TICK_MS);
    window.addEventListener("resize", schedule);
    window.addEventListener("storage", (e) => {
      if (e.key === FLAG_KEY) schedule();
    });
  }
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot, { once: true });
})();
