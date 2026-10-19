/*
 * RE-TEMPO · canvas-quick (user MOD layer)
 * ---------------------------------------------------------------------------
 * Quick access to canvases without going through the "Open" modal:
 *   1) in the "+" menu, hovering "Open ›" opens a submenu with the ~8 recent
 *      canvases and "Search all…" (which opens the original modal). Clicking
 *      "Open" still opens the modal.
 *   2) left rail: visual order and Ctrl+N hints/shortcuts that follow it.
 *   3) canvas switcher on the floating "Canvas page" pill of a canvas tab
 *      (top left of the canvas, shown while its left panel is collapsed): the
 *      name and a small chevron open a menu with one "Canvases" list: the
 *      canvases of the current workspace that are open in tabs (a dot; the
 *      current one checked), then the other recent canvases of its project,
 *      then "Open…" (the original modal) and "New canvas". Only canvases that
 *      can actually open are listed: a tab whose folder is not a canvas of this
 *      workspace (another project's path, deleted, never resolved) is left out.
 *      Picking a canvas open in a tab brings that tab forward; any other one
 *      opens in a tab of its own, beside this one (the app's own open, as in
 *      1; another branch's goes through its branch picker). Several canvases
 *      stay open side by side (tab-close pins every canvas tab).
 *   4) every canvas (Design route, chat tabs, docked panes), pen.dev
 *      pattern for the panel toggles:
 *      - left panel (pages / layers): one round 40px button floating at the
 *        top left of the canvas, outside any pill, next to the panel's edge;
 *        the native toggles of the "Canvas page" pill and of the panel header
 *        are hidden (see "left panel toggle in the canvas");
 *      - right sidebar: the toggle leaves the title bar and the zoom/Share
 *        toolbar: at the end of the panel's tab row while it is open, a
 *        floating pill (canvas name + toggle) under the zoom/Share toolbar
 *        while it is closed. A mirror that clicks the hidden native toggle
 *        (see "right sidebar toggle in the canvas").
 *   5) the canvas "Pop out canvas" button (four-arrow icon) is hidden (CSS).
 *   6) switcher rows: a "⋯" on hover/highlight opens Open in new tab, Rename…
 *      (inline) and Delete… (confirmation), through the app's own Design
 *      view canvas handlers (see "canvas row actions").
 *   7) the same "+" menu lists "New canvas" first and drops the "New " from
 *      the other labels: New canvas, Chat, Doc, Issue, Terminal, Browser (see
 *      "+" menu: order and labels). The app's own nodes are moved and
 *      relabelled in place, nothing is cloned or hidden, so keyboard and
 *      actions stay the app's.
 *   8) "New canvas" (the "+" item: click, Enter, the app's ⇧C; the switcher's;
 *      a pane-dock pane's "+") creates a canvas with the app's own New Canvas,
 *      in a new tab beside the open ones, and notes the folder it made (see
 *      "+" New canvas).
 *   9) a canvas made by New canvas that was never edited is deleted with the
 *      app's own canvas delete once no tab of any chat has it open, with a
 *      toast; no other canvas is ever deleted. localStorage
 *      "rtd.canvasEmptyCleanup" = "off" turns it off (see "empty canvas
 *      cleanup").
 *
 * Data (read-only), the same the Open modal builds (the app's Rq hook):
 *   - local overlay of the app's source-repo store, exposed by the bundle
 *     itself as window.__sourceRepoDataStoreDebug (getLocalOverlay /
 *     projectInfo / getWorktreeBranches);
 *   - Convex queries sourceRepo:getProjectCanvases and
 *     sourceRepo:getCanvasesForBranches, through the already signed-in
 *     ConvexReactClient;
 *   - selected workspace and projects: the live workspaces store (same probe
 *     as the switcher), else electronAPI.persist "tempo-workspaces" (the
 *     persisted copy can lag behind a workspace switch);
 *   - "edited": the app's lastModifiedAt, otherwise the mtime of
 *     index.canvas.tsx (electronAPI.fs.stat); "opened": localStorage
 *     tempo:design-tab:recent:*.
 * Merge and dedupe match the modal's (by canvasPath, preferring the current
 * branch, skipping "deleted").
 *
 * Opening: the same onOpenCanvas the modal receives (a useCallback on an
 * ancestor of the tab bar). If it is not found, opens the modal hidden and
 * clicks the item. The pill switcher swaps its own tab through the store's
 * tab actions (see "show here" below); the empty canvas cleanup deletes
 * through the app's own canvas delete; no other mutations of its own.
 * Introspection: window.__RE_TEMPO_CANVAS_QUICK__ (state, load(), open(),
 * newCanvas(), cleanup.*).
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (window.__RE_TEMPO_CANVAS_QUICK__) return; // double injection

  const ADD_BTN = '[data-testid="center-panel-add-tab-button"]';
  const MENU = '[data-testid="new-tab-panel"]';
  const OPEN_ITEM = '[data-testid="new-tab-action-open"]';
  const SUB_MAX = 8;
  const CANVAS_ENTRY = "/index.canvas.tsx";
  const RECENT_PREFIX = "tempo:design-tab:recent:";
  const CONVEX_FN = Symbol.for("functionName");
  const QUERY_TIMEOUT_MS = 4000;

  const CANVAS_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="1.5"></rect><rect x="4" y="4" width="3.5" height="3.5" rx="0.5"></rect><rect x="8.5" y="4" width="3.5" height="3.5" rx="0.5"></rect><rect x="4" y="8.5" width="3.5" height="3.5" rx="0.5"></rect><rect x="8.5" y="8.5" width="3.5" height="3.5" rx="0.5"></rect></svg>';
  const SEARCH_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>';
  const CHEVRON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>';
  // lucide ellipsis, square-arrow-out-up-right, pencil, trash-2
  const ELLIPSIS_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>';
  const NEW_TAB_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"></path><path d="m21 3-9 9"></path><path d="M15 3h6v6"></path></svg>';
  const PENCIL_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"></path><path d="m15 5 4 4"></path></svg>';
  const TRASH_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line></svg>';
  const CHECK_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';

  // lucide plus
  const PLUS_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>';

  const state = {
    data: null, // last load() result published for the current workspace + branch
    cache: new Map(), // "workspaceId::branch" -> last load() result of that context
    inflight: new Map(), // "workspaceId::branch" -> its in-flight load() promise
    loading: null, // the latest in-flight promise (any context)
    lastError: null,
    openedVia: null, // "app-callback" | "hidden-modal"
    // pill switcher: "in-place" | "in-place-pane" (shown in this tab) | "current";
    // fallbacks: "tab-click" | "store" | "tab-select" | "app-callback" | "hidden-modal"
    switchedVia: null,
  };

  // ------------------------------------------------------------------ helpers
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const icon = (svg, cls) => {
    const s = el("span", cls);
    s.innerHTML = svg; // constant SVG, never user data
    return s;
  };
  const withTimeout = (p, ms) =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

  function ago(ms) {
    if (!ms) return "";
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
    return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  const short = (ms) => ago(ms).replace(" ago", "").replace("just now", "now");

  // ----------------------------------------------------- React tree (read-only)
  const fiberOf = (node) => {
    if (!node) return null;
    const k = Object.keys(node).find((x) => x.startsWith("__reactFiber$"));
    return k ? node[k] : null;
  };

  // Tab bar ancestor (the bundle's Jma component): newTabActions + menu state.
  function tabBarProps() {
    let f = fiberOf(document.querySelector(ADD_BTN));
    for (let i = 0; f && i < 80; i++, f = f.return) {
      const p = f.memoizedProps;
      if (p && p.newTabActions && p.tabs) return p;
    }
    return null;
  }

  // The onOpenCanvas the app passes to the Open modal: a 1-argument useCallback
  // that opens the canvas tab or, on another branch, the app's branch picker.
  function findAppOpenCanvas() {
    let f = fiberOf(document.querySelector(ADD_BTN));
    for (let d = 0; f && d < 120; d++, f = f.return) {
      let h = f.memoizedState;
      if (!h || typeof h !== "object" || !("next" in h)) continue;
      for (let i = 0; h && i < 1500; i++, h = h.next) {
        const s = h.memoizedState;
        if (!Array.isArray(s) || s.length !== 2 || typeof s[0] !== "function" || !Array.isArray(s[1])) continue;
        const fn = s[0];
        if (fn.length !== 1) continue;
        const src = Function.prototype.toString.call(fn);
        if (src.includes("originatingWorkspaceId") && src.includes("canvasName") && !src.includes("throw")) return fn;
      }
    }
    return null;
  }

  let _client = null;
  function findConvexClient() {
    if (_client) return _client;
    const root = document.getElementById("root");
    const k = root && Object.keys(root).find((x) => x.startsWith("__reactContainer$"));
    if (!k) return null;
    const ok = (o) => o && typeof o === "object" && typeof o.query === "function" && typeof o.watchQuery === "function";
    const seen = new Set();
    const stack = [root[k]];
    const deadline = Date.now() + 1000;
    while (stack.length && Date.now() < deadline) {
      const f = stack.pop();
      if (!f || seen.has(f)) continue;
      seen.add(f);
      const p = f.memoizedProps;
      if (p && typeof p === "object") {
        if (ok(p.client)) return (_client = p.client);
        if (ok(p.value)) return (_client = p.value);
      }
      if (f.child) stack.push(f.child);
      if (f.sibling) stack.push(f.sibling);
    }
    return null;
  }
  async function convexQuery(name, args) {
    const c = findConvexClient();
    if (!c) return null;
    return withTimeout(c.query({ [CONVEX_FN]: name }, args), QUERY_TIMEOUT_MS);
  }

  // -------------------------------------------------------------------- data
  const srd = () => window.__sourceRepoDataStoreDebug || null;

  async function readWorkspaces() {
    const api = window.electronAPI && window.electronAPI.persist;
    if (!api || typeof api.getItem !== "function") return null;
    const raw = await api.getItem("tempo-workspaces");
    if (!raw) return null;
    try {
      return JSON.parse(raw).state || null;
    } catch (_) {
      return null;
    }
  }

  function orgProjectIdFor(projectId) {
    const s = srd();
    if (!s || !(s.projectInfo instanceof Map)) return null;
    for (const v of s.projectInfo.values()) {
      const r = v && v.ref;
      if (!r) continue;
      if (r.projectId === projectId || (r.aliasProjectIds || []).includes(projectId)) return r.orgProjectId || null;
    }
    return null;
  }

  function recencyByName(ids) {
    const out = new Map();
    for (const id of ids) {
      if (!id) continue;
      let obj = null;
      try {
        obj = JSON.parse(localStorage.getItem(RECENT_PREFIX + id) || "null");
      } catch (_) {}
      if (!obj || typeof obj !== "object") continue;
      for (const [name, v] of Object.entries(obj)) {
        const ts = typeof v === "number" ? v : Math.max(0, ...Object.values(v || {}).filter((x) => typeof x === "number"));
        if (ts > (out.get(name) || 0)) out.set(name, ts);
      }
    }
    return out;
  }

  // load() context: the selected workspace and its worktree branch (a checkout
  // in the same worktree is another index). "none": no workspace selected.
  const selectedWs = (st) => (st && (st.workspaces || []).find((w) => w && w.id === st.selectedWorkspaceId)) || null;
  const branchOf = (ws) => (ws && ws.repo && ((ws.repo.currentBranch || "").trim() || ws.repo.baseBranch)) || null;
  const ctxKey = (ws) => (ws ? `${ws.id}::${branchOf(ws) || ""}` : "none");
  const dataKey = (d) => (d && d.workspace && d.workspace.id ? `${d.workspace.id}::${d.workspace.branch || ""}` : "none");
  // "?" without the live store (doLoad then reads the persisted copy)
  function currentKey() {
    const st = wsState();
    return st ? ctxKey(selectedWs(st)) : "?";
  }

  async function doLoad(live) {
    const st = live || (await readWorkspaces());
    const ws = selectedWs(st);
    if (!ws || !ws.projectId) return { status: "no-workspace", items: [], workspace: ws ? { id: ws.id, path: ws.path, branch: branchOf(ws) } : null };
    let projects = st.projects;
    if (!Array.isArray(projects)) projects = ((await readWorkspaces()) || {}).projects || [];
    const project = projects.find((p) => p.id === ws.projectId) || null;
    const branch = branchOf(ws);
    const store = srd();

    // 1) Convex rows (remote index), like the app's Kpr/qpr
    const rows = [];
    const seen = new Set();
    const push = (b, path, name, diffStatus) => {
      const key = `${b}::${path}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ projectId: ws.projectId, canvasPath: path, canvasName: name, branch: b, lastModifiedAt: null, diffStatus, isLocalOnly: false });
    };
    const orgProjectId = orgProjectIdFor(ws.projectId);
    if (orgProjectId) {
      const worktreeBranches = store ? Array.from(store.getWorktreeBranches(ws.projectId) || []).sort() : [];
      const [proj, byBranch] = await Promise.all([
        convexQuery("sourceRepo:getProjectCanvases", { orgProjectId }).catch(() => null),
        worktreeBranches.length
          ? convexQuery("sourceRepo:getCanvasesForBranches", { orgProjectId, branches: worktreeBranches }).catch(() => null)
          : null,
      ]);
      for (const c of (proj && proj.canvases) || []) push(c.branch, c.path, c.name, c.diffStatus);
      for (const b of (byBranch && byBranch.branches) || []) for (const c of b.canvases || []) push(b.branch, c.path, c.name, c.diffStatus);
    }

    // 2) local overlay (worktree scan), like the app's $pr
    const overlay = (store && store.getLocalOverlay(ws.projectId)) || [];
    const byKey = new Map(overlay.map((o) => [`${o.branch}::${o.path}`, o]));
    const merged = [];
    const used = new Set();
    for (const r of rows) {
      const key = `${r.branch}::${r.canvasPath}`;
      const o = byKey.get(key);
      used.add(key);
      merged.push(o && o.workingTreeStatus ? { ...r, diffStatus: o.workingTreeStatus, lastModifiedAt: o.lastModifiedAt ?? r.lastModifiedAt } : r);
    }
    for (const [key, o] of byKey) {
      if (used.has(key)) continue;
      merged.push({ projectId: ws.projectId, canvasPath: o.path, canvasName: o.name, branch: o.branch, lastModifiedAt: o.lastModifiedAt, diffStatus: o.workingTreeStatus || "unchanged", isLocalOnly: true });
    }

    // 3) dedupe by canvasPath, like the Open modal; "gone": deleted in this
    // worktree (current branch), for the switcher's open-tab check
    const pick = new Map();
    const gone = new Set();
    for (const c of merged) {
      if (c.diffStatus === "deleted") {
        if (c.branch === branch) gone.add(c.canvasPath);
        continue;
      }
      const prev = pick.get(c.canvasPath);
      if (!prev || (c.branch === branch && prev.branch !== branch) || (prev.branch !== branch && (c.lastModifiedAt || 0) > (prev.lastModifiedAt || 0))) {
        pick.set(c.canvasPath, c);
      }
    }
    const items = Array.from(pick.values());

    // 4) when: edited (app or file mtime in the worktree) and opened (app recency)
    const fs = window.electronAPI && window.electronAPI.fs;
    await Promise.all(
      items.map(async (c) => {
        c.editedAt = c.lastModifiedAt ? Date.parse(c.lastModifiedAt) || Number(c.lastModifiedAt) || 0 : 0;
        if (!c.editedAt && ws.path && c.branch === branch && fs && typeof fs.stat === "function") {
          try {
            const r = await fs.stat(`${ws.path}/${c.canvasPath}${CANVAS_ENTRY}`);
            if (r && r.success && r.data && r.data.mtime) c.editedAt = Date.parse(r.data.mtime) || 0;
          } catch (_) {}
        }
      })
    );
    const opened = recencyByName([ws.id, ws.projectId]);
    for (const c of items) {
      c.openedAt = opened.get(c.canvasName) || 0;
      c.recentAt = Math.max(c.editedAt || 0, c.openedAt || 0);
    }
    items.sort((a, b) => b.recentAt - a.recentAt || a.canvasName.localeCompare(b.canvasName));

    return {
      status: "ready",
      loadedAt: Date.now(),
      workspace: { id: ws.id, path: ws.path, branch },
      project: { id: ws.projectId, name: (project && project.name) || "" },
      orgProjectId,
      items,
      gone: Array.from(gone),
    };
  }

  // One load per context at a time, cached per context. A result is published
  // (state.data) only while its context is still the current one: one that
  // went stale while loading (another workspace selected, a checkout) stays in
  // the cache only, and the current context is loaded instead, so callers
  // waiting on load() redraw with the context they show.
  const CACHE_MAX = 8;
  function load(retried) {
    const st = wsState();
    const key = st ? ctxKey(selectedWs(st)) : "?";
    const running = state.inflight.get(key);
    if (running) return running;
    const p = doLoad(st)
      .then((d) => {
        const k = dataKey(d);
        state.cache.delete(k);
        state.cache.set(k, d);
        while (state.cache.size > CACHE_MAX) state.cache.delete(state.cache.keys().next().value);
        const now = currentKey();
        if (now === "?" || now === k) {
          state.data = d;
          state.lastError = null;
          return d;
        }
        return retried ? state.cache.get(now) || d : load(true);
      })
      .catch((e) => {
        state.lastError = String((e && e.message) || e);
        return state.cache.get(key) || { status: "error", items: [] };
      })
      .finally(() => {
        if (state.inflight.get(key) === p) state.inflight.delete(key);
        if (state.loading === p) state.loading = null;
      });
    state.inflight.set(key, p);
    state.loading = p;
    return p;
  }

  // -------------------------------------------------------------------- open
  async function openCanvas(c) {
    const ref = { projectId: c.projectId, canvasName: c.canvasName, canvasPath: c.canvasPath, branch: c.branch };
    const fn = findAppOpenCanvas();
    if (fn) {
      state.openedVia = "app-callback";
      fn(ref);
      return true;
    }
    state.openedVia = "hidden-modal";
    return openViaHiddenModal(c.canvasName);
  }

  // Fallback: open the Open modal hidden and click the canvas item (the app's own onSelect).
  async function openViaHiddenModal(name) {
    const p = tabBarProps();
    const openFile = p && p.newTabActions && p.newTabActions.onOpenFile;
    if (typeof openFile !== "function") return false;
    document.documentElement.setAttribute("data-rcq-hide-open-modal", "");
    try {
      openFile();
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const sec = Array.from(document.querySelectorAll('[data-testid="open-modal-section"]')).find(
          (s) => s.firstElementChild && s.firstElementChild.textContent === "Canvases"
        );
        const item = sec && Array.from(sec.querySelectorAll('[data-testid="open-modal-item"]')).find((b) => b.textContent === name);
        if (item) {
          item.click();
          return true;
        }
      }
      return false; // not found: the modal shows up again and the user picks there
    } finally {
      setTimeout(() => document.documentElement.removeAttribute("data-rcq-hide-open-modal"), 300);
    }
  }

  function searchAll() {
    const p = tabBarProps();
    const fn = p && p.newTabActions && p.newTabActions.onOpenFile;
    if (typeof fn === "function") fn();
  }

  function closePlusMenu() {
    const p = tabBarProps();
    if (p && p.newTabMenuOpen && typeof p.onNewTabMenuOpenChange === "function") p.onNewTabMenuOpenChange(false);
  }

  function choose(c) {
    closeSub();
    closePlusMenu();
    openCanvas(c);
  }

  // ------------------------------------------------------- "Open" submenu
  // Keyboard navigation is virtual (focus stays on the app's "Open" item, so
  // its menu does not close): the trigger says it controls the submenu
  // (aria-haspopup / aria-expanded / aria-controls) and points at the
  // highlighted row (aria-activedescendant, on the trigger, which holds focus,
  // and on the submenu); every row has an id.
  const SUB_ID = "rcq-open-submenu";
  const sub = { node: null, item: null, active: -1, rows: [], hideT: 0 };

  function closeSub() {
    clearTimeout(sub.hideT);
    if (sub.node) sub.node.remove();
    sub.node = null;
    sub.active = -1;
    if (sub.item) {
      sub.item.removeAttribute("data-rcq-sub-open");
      sub.item.setAttribute("aria-expanded", "false");
      sub.item.removeAttribute("aria-controls");
      sub.item.removeAttribute("aria-activedescendant");
    }
  }

  function scheduleCloseSub() {
    clearTimeout(sub.hideT);
    sub.hideT = setTimeout(closeSub, 300);
  }

  function renderSub() {
    if (!sub.node) return;
    const box = sub.node;
    box.textContent = "";
    box.append(el("div", "rcq-sub-label", "Recent canvases"));
    const d = currentData();
    const items = d && d.status === "ready" ? d.items.slice(0, SUB_MAX) : [];
    sub.rows = items.map((c) => () => choose(c));
    if (!d) box.append(el("div", "rcq-sub-empty", "Loading…"));
    else if (!items.length) box.append(el("div", "rcq-sub-empty", d.status === "no-workspace" ? "No project open" : "No canvases yet"));
    items.forEach((c, i) => {
      const row = el("div", "rcq-sub-item");
      row.setAttribute("role", "menuitem");
      row.dataset.testid = "rcq-sub-item";
      row.append(icon(CANVAS_SVG, "rcq-ico rcq-ico-canvas"), el("span", "rcq-sub-name", c.canvasName));
      const when = short(c.recentAt);
      if (when) row.append(el("span", "rcq-sub-when", when));
      bindSubRow(row, i, sub.rows[i]);
      box.append(row);
    });
    box.append(el("div", "rcq-sub-sep"));
    const all = el("div", "rcq-sub-item");
    all.setAttribute("role", "menuitem");
    all.dataset.testid = "rcq-sub-search-all";
    all.append(icon(SEARCH_SVG, "rcq-ico"), el("span", "rcq-sub-name", "Search all…"));
    const allFn = () => {
      closeSub();
      closePlusMenu();
      searchAll();
    };
    sub.rows.push(allFn);
    bindSubRow(all, sub.rows.length - 1, allFn);
    box.append(all);
    paintSubActive();
  }

  function bindSubRow(row, i, fn) {
    row.id = `${SUB_ID}-item-${i}`;
    row.addEventListener("mouseenter", () => {
      sub.active = i;
      paintSubActive();
    });
    // pointerdown: acts before any menu "outside click"
    row.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
  }

  function paintSubActive() {
    if (!sub.node) return;
    let id = null;
    sub.node.querySelectorAll(".rcq-sub-item").forEach((n, i) => {
      if (i === sub.active) {
        n.setAttribute("data-active", "");
        id = n.id;
      } else n.removeAttribute("data-active");
    });
    for (const n of [sub.node, sub.item]) {
      if (!n) continue;
      if (id) n.setAttribute("aria-activedescendant", id);
      else n.removeAttribute("aria-activedescendant");
    }
  }

  function placeSub() {
    const menu = sub.item && sub.item.closest(MENU);
    const host = menu && menu.parentElement;
    if (!host || !sub.node) return;
    const hr = host.getBoundingClientRect();
    const mr = menu.getBoundingClientRect();
    const ir = sub.item.getBoundingClientRect();
    const w = sub.node.offsetWidth || 240;
    let left = mr.right - hr.left + 4;
    if (hr.left + left + w > window.innerWidth - 8) left = mr.left - hr.left - w - 4;
    const h = sub.node.offsetHeight || 0;
    let top = ir.top - hr.top - 8; // first row level with the item (8px padding)
    const maxTop = window.innerHeight - 8 - hr.top - h;
    if (top > maxTop) top = Math.max(-hr.top + 8, maxTop);
    sub.node.style.left = `${Math.round(left)}px`;
    sub.node.style.top = `${Math.round(top)}px`;
  }

  function openSub(item) {
    clearTimeout(sub.hideT);
    if (sub.node && sub.item === item && sub.node.isConnected) return;
    closeSub();
    const menu = item.closest(MENU);
    const host = menu && menu.parentElement;
    if (!host) return;
    sub.item = item;
    item.setAttribute("data-rcq-sub-open", "");
    item.setAttribute("aria-expanded", "true");
    item.setAttribute("aria-controls", SUB_ID);
    const box = el("div", "rcq-sub");
    box.id = SUB_ID;
    box.setAttribute("role", "menu");
    box.setAttribute("aria-label", "Recent canvases");
    box.dataset.testid = "rcq-open-submenu";
    box.addEventListener("mouseenter", () => clearTimeout(sub.hideT));
    box.addEventListener("mouseleave", scheduleCloseSub);
    sub.node = box;
    host.append(box);
    renderSub();
    placeSub();
    load().then(() => {
      if (sub.node === box) {
        renderSub();
        placeSub();
      }
    });
  }

  // ---------------------------------------------- "+" menu: order and labels
  // The user (2026-10-18): the canvas item first, and no "New " in front of
  // the other names; (2026-10-19) that item reads "New canvas". The app renders the six creation items as keyed children of ONE
  // role="group" (chat, canvas, prd, issue, terminal, browser; the disabled
  // canvas variant keeps the test id), React-managed nodes. So nothing is
  // cloned, hidden or re-created: the same nodes are moved with insertBefore
  // inside their own group, and only the value of the label's text node is
  // rewritten. React never moves unchanged keyed children and rewrites a text
  // node only when its string changes, so a re-render leaves this alone; a
  // remount (the canvas item switching between its enabled and disabled
  // variants) puts the node back at its fiber position and the next mutation
  // callback sets it right again, in the same microtask as React's commit,
  // before paint. Base UI walks the items in DOM order for the arrow keys, so
  // the keyboard follows the new order (checked live). Idempotent: nothing is
  // touched when order and labels are already right. Open and its separator
  // are not touched.
  const PLUS_ORDER = ["canvas", "chat", "prd", "issue", "terminal", "browser"].map((k) => `new-tab-action-${k}`);
  const PLUS_NEW_PREFIX = /^New\s+(?=\S)/;
  const PLUS_CANVAS_LABEL = "New canvas";

  function decorateMenu(menu) {
    const items = PLUS_ORDER.map((id) => menu.querySelector(`[data-testid="${id}"]`)).filter(Boolean);
    if (!items.length) return;
    for (const it of items)
      for (const n of it.childNodes) {
        if (n.nodeType !== 3 || !n.nodeValue.trim()) continue;
        const want = it.dataset.testid === "new-tab-action-canvas" ? PLUS_CANVAS_LABEL : n.nodeValue.replace(PLUS_NEW_PREFIX, "");
        if (n.nodeValue !== want) n.nodeValue = want;
      }
    const parent = items[0].parentElement;
    if (!parent || items.some((it) => it.parentElement !== parent)) return;
    // Everything the group holds after the last of these items stays after them.
    const last = items.reduce((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? b : a));
    const tail = last.nextSibling;
    const focused = document.activeElement;
    let moved = false;
    for (let i = items.length - 1; i >= 0; i--) {
      const ref = i === items.length - 1 ? tail : items[i + 1];
      if (items[i].nextSibling === ref) continue;
      parent.insertBefore(items[i], ref);
      moved = true;
    }
    // Moving a node drops its focus; give it back to the item that had it.
    if (moved && focused && focused !== document.activeElement && items.includes(focused)) focused.focus({ preventScroll: true });
  }

  function wireMenu(menu) {
    if (menu.__rcqWired) return;
    menu.__rcqWired = true;
    load(); // warm the cache for hover
    const item = menu.querySelector(OPEN_ITEM);
    if (!item) return;
    item.setAttribute("aria-haspopup", "menu");
    item.setAttribute("aria-expanded", "false");
    item.addEventListener("mouseenter", () => openSub(item));
    item.addEventListener("mouseleave", scheduleCloseSub);
    // the other items close the submenu, like a native submenu
    menu.addEventListener("mouseover", (e) => {
      const it = e.target.closest('[role="menuitem"]');
      if (it && it !== item) closeSub();
    });
  }

  // ------------------------------------------- canvas name pill: switcher
  // The floating toolbar the app draws at the top left of an inline canvas tab
  // while its left panel is collapsed (bundle: role="toolbar" aria-label="Canvas
  // page", no data-testid; children: span.truncate with the page name, then,
  // unless hidden, the "Open left sidebar" button). The name span has no handler
  // of its own (no rename there), so both the name and a chevron injected right
  // after it open the switcher; the sidebar button is left untouched. Only pills
  // of chat-route canvas tabs get it: the center panel ([data-center-panel-pane])
  // and pane-dock's panes ([data-rtd-panel]). The Design route draws the same
  // pill but has its own canvas tree and tabs.
  const PILL = '[role="toolbar"][aria-label="Canvas page"]';
  const PILL_SCOPE = "[data-center-panel-pane], [data-rtd-panel]";
  const PILL_NAME = ":scope > span.truncate";
  const CHEVRON_CLS = "rcq-pill-chevron";
  const SWITCH_ID = "rcq-canvas-switcher";
  const SWITCH_RECENT_MAX = 8;

  // Workspaces store (zustand `$`), read through a selector hook of any
  // ancestor that uses it (the inline canvas, the center panel). Same probe as
  // tab-close.js: useMemo [[getSelection, …], [getState, getServerState,
  // selector, isEqual]] followed by useSyncExternalStore on getSelection.
  const isHook = (h) => !!h && typeof h === "object" && "memoizedState" in h && "next" in h;
  const looksLikeWs = (s) =>
    !!s &&
    typeof s === "object" &&
    Array.isArray(s.workspaces) &&
    Array.isArray(s.centerTabs) &&
    typeof s.setActiveCenterTab === "function" &&
    typeof s.openCanvasTab === "function";

  function storeGetters(f) {
    const out = [];
    let h = f && f.memoizedState;
    for (let i = 0; isHook(h) && i < 400; i++, h = h.next) {
      const ms = h.memoizedState;
      if (
        !Array.isArray(ms) ||
        ms.length !== 2 ||
        !Array.isArray(ms[0]) ||
        typeof ms[0][0] !== "function" ||
        !Array.isArray(ms[1]) ||
        ms[1].length !== 4 ||
        typeof ms[1][0] !== "function"
      )
        continue;
      const sync = h.next;
      if (sync && sync.queue && sync.queue.getSnapshot === ms[0][0]) out.push(ms[1][0]);
    }
    return out;
  }

  // The app's popout "transferred tabs" store (tabs, activeByPopup,
  // moveToPopup, reorder, attach), which pane-dock's panes are made of.
  const looksLikePq = (s) =>
    !!s &&
    typeof s === "object" &&
    Array.isArray(s.tabs) &&
    !!s.activeByPopup &&
    typeof s.activeByPopup === "object" &&
    typeof s.moveToPopup === "function" &&
    typeof s.reorder === "function" &&
    typeof s.attach === "function";

  // A store's live state through the getState of a selector hook found walking
  // up from `from`, the center panel or the "+" button. The getter is cached.
  const _getters = { ws: null, pq: null };
  function findStore(key, test, from) {
    const read = (g) => {
      try {
        const s = g();
        return test(s) ? s : null;
      } catch (_) {
        return null;
      }
    };
    if (_getters[key]) {
      const s = read(_getters[key]);
      if (s) return s;
      _getters[key] = null;
    }
    const tried = new Set();
    for (const n of [from, document.querySelector('[data-testid="center-panel"]'), document.querySelector(ADD_BTN)]) {
      let f = fiberOf(n);
      for (let i = 0; f && i < 300; i++, f = f.return) {
        for (const g of storeGetters(f)) {
          if (tried.has(g)) continue;
          tried.add(g);
          const s = read(g);
          if (s) {
            _getters[key] = g;
            return s;
          }
        }
      }
    }
    return null;
  }
  const wsState = (from) => findStore("ws", looksLikeWs, from);
  const pqState = (from) => findStore("pq", looksLikePq, from);

  const normPath = (p) => String(p || "").replace(/^\.?\/+/, "").replace(/\/+$/, "");
  // Tab paths are resolved by the app (openCanvasTab), canvasPath comes from the
  // index: equal, or one is a suffix of the other on a "/" boundary.
  function samePath(a, b) {
    a = normPath(a);
    b = normPath(b);
    if (!a || !b) return false;
    return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
  }
  const baseName = (p) => normPath(p).split("/").pop() || "";

  // Where a pill's fiber walk starts: the pill's own fiber, or, for a pill
  // drawn outside React (canvas-chrome's file pill: a "Canvas page" toolbar
  // made with createElement in the canvas's top layer, no fiber), a node the
  // app rendered in the same canvas shell: the top toolbar row (its fiber holds
  // panelApi / pageName, its ancestors the inline canvas), else the canvas
  // root, else the shell. Never another canvas's: the shell is the pill's own.
  function pillFiber(pill) {
    const own = fiberOf(pill);
    if (own) return own;
    const shell = pill.closest(CANVAS_SHELL);
    if (!shell) return null;
    for (const n of [topRow(shell), shell.querySelector("[data-canvas-root]"), shell]) {
      const f = n && n !== pill && !pill.contains(n) ? fiberOf(n) : null;
      if (f) return f;
    }
    return null;
  }

  // The pill's own canvas: the inline canvas ancestor's pageFolderPath and
  // workspacePath props.
  function pillCanvas(pill) {
    const nameEl = pill.querySelector(PILL_NAME);
    const name = nameEl ? nameEl.textContent.trim() : "";
    let f = pillFiber(pill);
    for (let i = 0; f && i < 200; i++, f = f.return) {
      const p = f.memoizedProps;
      if (p && typeof p.pageFolderPath === "string" && typeof p.workspacePath === "string")
        return { name, path: p.pageFolderPath, wsPath: p.workspacePath };
    }
    return { name, path: null, wsPath: null };
  }

  // The workspace a pill's canvas belongs to. Center tabs live per workspace
  // (the selected one's in st.centerTabs, the others' in workspaces[].centerTabs;
  // tabs carry no projectId), so the switcher is scoped to this workspace,
  // which also pins the project. A pill of another workspace (a Design canvas
  // docked by pane-dock) only gets its own entry and "Open…": the selected
  // workspace's tabs and index are not its own. A workspacePath that matches no
  // workspace (path format) counts as the selected one.
  function pillScope(st, cur) {
    if (!st) return { ws: null, selected: true };
    const sel = st.workspaces.find((w) => w && w.id === st.selectedWorkspaceId) || null;
    const same = (w) => !!w && !!w.path && normPath(w.path) === normPath(cur.wsPath);
    if (!cur.wsPath || !sel || same(sel)) return { ws: sel, selected: true };
    const other = st.workspaces.find(same);
    return other ? { ws: other, selected: false } : { ws: sel, selected: true };
  }

  // Canvas folders on disk in the selected workspace: folders holding an
  // index.canvas.tsx in the store's file list (allFiles, the list openCanvasTab
  // resolves tab paths against). null while it is not loaded for that workspace.
  let _dirsSrc = null;
  let _dirs = null;
  function workspaceCanvasDirs(st, ws) {
    if (!st || !ws || st.allFilesLoadedWorkspaceId !== ws.id || !Array.isArray(st.allFiles) || !st.allFiles.length) return null;
    if (_dirsSrc !== st.allFiles) {
      const root = normPath(ws.path);
      const dirs = new Set();
      for (const f of st.allFiles) {
        let p = normPath(f && (typeof f === "string" ? f : f.path));
        if (root && p.startsWith(`${root}/`)) p = p.slice(root.length + 1);
        if (p.endsWith(CANVAS_ENTRY)) dirs.add(p.slice(0, -CANVAS_ENTRY.length));
      }
      _dirsSrc = st.allFiles;
      _dirs = dirs.size ? dirs : null;
    }
    return _dirs;
  }

  // The last load() of this workspace at its current branch (null until one
  // finished: a switch or a checkout never shows another context's rows).
  function dataFor(ws) {
    if (!ws) return state.data;
    const k = ctxKey(ws);
    return state.cache.get(k) || (state.data && dataKey(state.data) === k ? state.data : null);
  }
  // The selected workspace's (the "+" submenu, the store fallbacks); without
  // the live store, the last published one.
  function currentData() {
    const st = wsState();
    if (!st) return state.data;
    const ws = selectedWs(st);
    return ws ? dataFor(ws) : state.cache.get("none") || null;
  }

  // Fallback without the store: the raw tabs of the center's tab bars, and
  // each bar's own onTabSelect (what a click on the tab calls).
  const barSelect = new Map(); // tab id -> onTabSelect
  function barTabs() {
    const out = [];
    barSelect.clear();
    for (const btn of document.querySelectorAll('[data-testid^="center-panel-add-tab-button"]')) {
      let f = fiberOf(btn);
      for (let i = 0; f && i < 80; i++, f = f.return) {
        const p = f.memoizedProps;
        if (p && Array.isArray(p.panelTabs) && typeof p.onTabSelect === "function") {
          for (const t of p.panelTabs) if (t && t.id) barSelect.set(t.id, p.onTabSelect);
          out.push(...p.panelTabs);
          break;
        }
      }
    }
    return out;
  }

  // Canvas tabs of the selected workspace (every chat's), one per canvas:
  // the active tab wins, then the one owned by the active chat.
  function openCanvasTabs(st) {
    const out = [];
    for (const t of st ? st.centerTabs : barTabs()) {
      if (!t || t.type !== "canvas" || !t.pageFolderPath) continue;
      const i = out.findIndex((o) => samePath(o.pageFolderPath, t.pageFolderPath));
      if (i < 0) out.push(t);
      else if (st && out[i].id !== st.activeCenterTabId && (t.id === st.activeCenterTabId || t.ownerChatTabId === st.activeChatTabId)) out[i] = t;
    }
    return out;
  }

  // Menu model. Open tabs: the canvas tabs of the pill's workspace whose folder
  // is a canvas there, i.e. what a click can actually show: on disk in the
  // workspace's file list, or, besides that or while the list is not loaded,
  // in the project's index (the Open modal's rows, without "deleted" ones and
  // without those deleted in this worktree). A tab that cannot be checked yet
  // stays out while the index loads. The current canvas is always listed.
  // Recents: the project's index minus the current and the listed tabs.
  function switchModel(pill) {
    const cur = pillCanvas(pill);
    const st = wsState(pill);
    const scope = pillScope(st, cur);
    const isCur = (path, name) => (cur.path ? samePath(path, cur.path) : !!name && name === cur.name);
    const d = scope.selected ? dataFor(scope.ws) : null;
    const status = !scope.selected ? "other-workspace" : d ? d.status : "loading";
    const ready = !!d && d.status === "ready";
    const dirs = scope.selected ? workspaceCanvasDirs(st, scope.ws) : null;
    const gone = ready ? d.gone || [] : [];
    const branch = ready && d.workspace ? d.workspace.branch : null;
    const inIndex = (p, here) =>
      ready &&
      !gone.some((g) => samePath(g, p)) &&
      d.items.some((c) => samePath(c.canvasPath, p) && (!here || (!!branch && c.branch === branch)));
    const openable = (p) => {
      if (dirs) return dirs.has(normPath(p)) || Array.from(dirs).some((x) => samePath(x, p)) || inIndex(p, true);
      if (ready) return inIndex(p, false);
      return null; // unknown: hidden while loading, kept when the index failed
    };
    const open = [];
    const left = [];
    for (const t of scope.selected ? openCanvasTabs(st) : []) {
      const current = isCur(t.pageFolderPath, t.pageName);
      const ok = current || openable(t.pageFolderPath);
      if (ok === false || (ok === null && status === "loading")) {
        left.push(t.pageFolderPath);
        continue;
      }
      open.push({ tab: t, name: t.pageName || baseName(t.pageFolderPath), current });
    }
    if (!open.some((o) => o.current) && cur.name) open.unshift({ tab: null, name: cur.name, current: true });
    // one row per canvas: a canvas open in a tab is listed once, with its dot
    const recents = ready
      ? d.items
          .filter((c) => !isCur(c.canvasPath, c.canvasName) && !open.some((o) => o.tab && samePath(o.tab.pageFolderPath, c.canvasPath)))
          .slice(0, SWITCH_RECENT_MAX)
      : [];
    return {
      cur,
      open,
      recents,
      branch,
      status,
      project: (d && d.project && d.project.name) || "",
      store: !!st,
      workspaceId: scope.ws ? scope.ws.id : null,
      check: dirs ? "files" : ready ? "index" : "none",
      left,
    };
  }

  // A tab on screen is clicked (the app's own onClick: center, split side or a
  // pane-dock pane, exactly as a user click); one hidden under another chat goes
  // through setActiveCenterTab, which also switches to its owner chat.
  function activateTab(t, pill) {
    const dom = Array.from(document.querySelectorAll(`[role="tab"][data-tab-id="${CSS.escape(t.id)}"]`)).find(
      (n) => n.getClientRects().length > 0
    );
    if (dom) {
      state.switchedVia = "tab-click";
      dom.click();
      return true;
    }
    const st = wsState(pill);
    if (st && st.centerTabs.some((x) => x.id === t.id)) {
      state.switchedVia = "store";
      st.setActiveCenterTab(t.id);
      return true;
    }
    const sel = barSelect.get(t.id);
    if (sel) {
      state.switchedVia = "tab-select";
      sel(t.id);
      return true;
    }
    // last resort: openCanvasTab focuses an existing tab for the same folder
    const d = currentData();
    if (!d || d.status !== "ready") return false;
    const ok = openCanvas({ projectId: d.project.id, canvasName: t.pageName, canvasPath: t.pageFolderPath, branch: d.workspace.branch });
    state.switchedVia = state.openedVia;
    return ok;
  }

  // ----------------------------------------- switcher: the pill's own tab
  // The tab a pill belongs to and where it sits, for "Open in new tab" (the
  // row "⋯" menu), which adds a canvas tab right after it: built the way
  // openCanvasTab builds one (same owner chat, pin state and split side), its
  // folder resolved like openCanvasTab resolves it (Jfr), added with the
  // store's applyRemoteTabOp("open") and moved next to the pill's tab. When
  // the id is taken (the same canvas in another tab or pane), the new tab gets
  // the suffix the app gives its own duplicates (`-split-right-N`).
  const PANE_POPUP = "rtd-dock-"; // pane-dock: popup name = prefix + data-rtd-panel

  // The tab a pill belongs to, live in the selected workspace's center tabs:
  // the `activeTab` prop the tab content renderer (xua) gets, in the center
  // sides and in the popout renderer pane-dock's panes use. In a pane it must
  // be one of that pane's descriptors (else the pane's active one); in the
  // center, without it, the store's active tab of that side.
  function pillTab(pill, st) {
    if (!st) return null;
    const cur = pillCanvas(pill);
    const live = (id) => (id && st.centerTabs.find((t) => t && t.id === id && t.type === "canvas")) || null;
    const fits = (t) => (t && (!cur.path || samePath(t.pageFolderPath, cur.path)) ? t : null);
    let found = null;
    let f = pillFiber(pill);
    for (let i = 0; f && i < 300; i++, f = f.return) {
      const t = f.memoizedProps && f.memoizedProps.activeTab;
      if (t && typeof t === "object" && t.type === "canvas" && typeof t.id === "string") {
        found = t;
        break;
      }
    }
    const pane = pill.closest("[data-rtd-panel]");
    if (pane) {
      const pq = pqState(pill);
      if (!pq) return null;
      const name = PANE_POPUP + pane.getAttribute("data-rtd-panel");
      const mine = pq.tabs.filter((d) => d && d.popup && d.popup.name === name && d.kind === "center" && d.tab);
      const desc = (found && mine.find((d) => d.tab.id === found.id)) || mine.find((d) => d.id === pq.activeByPopup[name]);
      return desc ? fits(live(desc.tab.id)) : null;
    }
    if (found) return fits(live(found.id));
    const sideEl = pill.closest("[data-center-panel-side]");
    const side = sideEl && sideEl.getAttribute("data-center-panel-side");
    const split = st.splitPanelMode && (side === "left" || side === "right");
    return fits(live(split ? st[`${side}PanelActiveTabId`] : st.activeCenterTabId));
  }

  // The pane-dock pane holding that tab: its popup, the tab's descriptor and
  // its index among the pane's tabs. null outside a pane; {missing} when the
  // pane cannot be read (then nothing is touched).
  function paneOf(pill, tab) {
    const pane = pill.closest("[data-rtd-panel]");
    if (!pane) return null;
    const pq = pqState(pill);
    if (!pq) return { missing: true };
    const name = PANE_POPUP + pane.getAttribute("data-rtd-panel");
    const mine = pq.tabs.filter((d) => d && d.popup && d.popup.name === name);
    const desc = mine.find((d) => d.kind === "center" && d.tab && d.tab.id === tab.id);
    return desc ? { popup: desc.popup, desc, index: mine.indexOf(desc) } : { missing: true };
  }

  // openCanvasTab's folder resolution (the bundle's Jfr): relative to the
  // workspace, matched against the canvas folders of its file list (folders
  // with an index.canvas.tsx under a designs/ folder), by the part after
  // "designs/" when that is unique, else normalized; a tempo/designs/ folder
  // is accepted even when the list does not have it yet. null = refused.
  const DESIGNS = "designs/";
  const trimSlashes = (s) => String(s || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  const afterDesigns = (s) => {
    const i = s.indexOf(DESIGNS);
    return i < 0 ? null : s.slice(i + DESIGNS.length);
  };
  function resolveCanvasPath(raw, st, ws) {
    let p = String(raw || "");
    const root = ws && ws.path ? ws.path.replace(/\/+$/, "") : "";
    const rel = (x) => (root && x.startsWith("/") ? (x === root ? "" : x.startsWith(`${root}/`) ? x.slice(root.length + 1).replace(/^\/+/, "") : x) : x);
    p = rel(p);
    const dirs = [];
    for (const f of (st && st.allFiles) || []) {
      const n = trimSlashes(f && (typeof f === "string" ? f : f.path));
      if (n.endsWith(CANVAS_ENTRY) && (n.includes(`/${DESIGNS}`) || n.startsWith(DESIGNS))) {
        const dir = n.slice(0, -CANVAS_ENTRY.length);
        if (!dirs.includes(dir)) dirs.push(dir);
      }
    }
    let n = trimSlashes(p);
    if (/\.canvas\.tsx$/i.test(n)) n = trimSlashes(n.replace(/\/[^/]*\.canvas\.tsx$/i, ""));
    let o = n;
    if (!dirs.includes(n)) {
      const tail = afterDesigns(n);
      const same = tail ? dirs.filter((x) => afterDesigns(x) === tail) : [];
      if (same.length === 1) o = same[0];
    }
    let s = o;
    if (!dirs.includes(o)) {
      s = rel(o).replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/{2,}/g, "/").replace(/\/+$/, "");
      s = s.replace(/\/index\.canvas\.tsx$/i, "");
      if (s === "designs" || s.startsWith(DESIGNS)) s = `tempo/${s}`;
    }
    return dirs.includes(s) || (s.startsWith(`tempo/${DESIGNS}`) && s.length > 14) ? s : null;
  }

  // openCanvasTab's id for that folder under that chat, or the app's duplicate
  // suffix when a tab (center or pane) already has it.
  function freeTabId(st, pq, owner, path) {
    const used = new Set(st.centerTabs.map((t) => t && t.id));
    for (const d of (pq && pq.tabs) || []) if (d && d.kind === "center" && d.tab) used.add(d.tab.id);
    const base = `canvas-${owner}-${path}`;
    if (!used.has(base)) return base;
    let n = 1;
    while (used.has(`${base}-split-right-${n}`)) n++;
    return `${base}-split-right-${n}`;
  }

  const sw = { node: null, pill: null, model: null, rows: [], active: -1, keyboard: false, moved: false, prevFocus: null, typed: "", typedT: 0, more: null, renaming: null, dirty: false };

  // Index warm-up when a pill gets its chevron, so the first open already has
  // the project's rows (tabs that cannot be checked stay out while it loads).
  const WARM_MS = 30000;
  function warm() {
    const k = currentKey();
    const d = k === "?" ? state.data : currentData();
    if (state.inflight.has(k) || (d && d.loadedAt && Date.now() - d.loadedAt < WARM_MS)) return;
    load();
  }
  // Keyboard open: the first item that is not the current canvas.
  function firstOther() {
    sw.active = Math.max(0, sw.rows.findIndex((r) => r.row.getAttribute("aria-checked") !== "true"));
    paintSwitch();
  }

  function makeChevron() {
    const b = el("button", CHEVRON_CLS);
    b.type = "button";
    b.dataset.testid = "rcq-canvas-switch-button";
    b.setAttribute("aria-label", "Switch canvas");
    b.setAttribute("aria-haspopup", "menu");
    b.setAttribute("aria-controls", SWITCH_ID);
    b.setAttribute("aria-expanded", "false");
    b.append(icon(CHEVRON_SVG, "rcq-ico"));
    return b;
  }

  // Idempotent per tick: exactly one chevron right after the name span. A
  // React re-render that drops or moves it gets it back on the next tick.
  function ensureChevron(pill) {
    const name = pill.querySelector(PILL_NAME);
    const all = pill.querySelectorAll(`:scope > .${CHEVRON_CLS}`);
    for (let i = 1; i < all.length; i++) all[i].remove();
    if (!name) {
      if (all[0]) all[0].remove();
      if (pill.hasAttribute("data-rcq-switch")) pill.removeAttribute("data-rcq-switch");
      return;
    }
    if (!all[0]) warm();
    const b = all[0] || makeChevron();
    if (b.previousElementSibling !== name) name.after(b);
    const exp = sw.pill === pill && !!sw.node ? "true" : "false";
    if (b.getAttribute("aria-expanded") !== exp) b.setAttribute("aria-expanded", exp);
    if (!pill.hasAttribute("data-rcq-switch")) pill.setAttribute("data-rcq-switch", "");
  }

  function stripChevron(pill) {
    pill.querySelectorAll(`:scope > .${CHEVRON_CLS}`).forEach((n) => n.remove());
    if (pill.hasAttribute("data-rcq-switch")) pill.removeAttribute("data-rcq-switch");
  }

  function syncPills() {
    for (const pill of document.querySelectorAll(PILL)) {
      if (pill.closest(PILL_SCOPE)) ensureChevron(pill);
      else stripChevron(pill);
    }
    if (sw.node && (!sw.pill || !sw.pill.isConnected || !sw.pill.closest(PILL_SCOPE) || !sw.pill.getClientRects().length)) closeSwitch();
  }

  // The trigger is the name span or the chevron of an in-scope pill.
  function triggerPill(target) {
    const t = target instanceof Element ? target : null;
    const hit = t && (t.closest(`.${CHEVRON_CLS}`) || t.closest(`[data-rcq-switch] > span.truncate`));
    const pill = hit && hit.closest(PILL);
    return pill && pill.closest(PILL_SCOPE) ? pill : null;
  }

  function addRow(box, { cls, testid, role, label, iconSvg, iconCls, when, checked, open, run, canvas }) {
    const i = sw.rows.length;
    const row = el("div", `rcq-sub-item${cls ? ` ${cls}` : ""}`);
    row.id = `${SWITCH_ID}-item-${i}`;
    row.setAttribute("role", role || "menuitem");
    if (checked != null) row.setAttribute("aria-checked", checked ? "true" : "false");
    row.dataset.testid = testid;
    row.append(icon(iconSvg, iconCls), el("span", "rcq-sub-name", label));
    if (when) row.append(el("span", "rcq-sub-when", when));
    if (checked) row.append(icon(CHECK_SVG, "rcq-ico rcq-sub-check"));
    else if (open) {
      // open in a tab (here or elsewhere): a tertiary dot where the check goes
      row.setAttribute("data-open", "");
      const dot = el("span", "rcq-sub-dot");
      dot.setAttribute("aria-hidden", "true");
      row.append(dot);
    }
    // canvas rows: the "⋯" actions button over the right slot (see "canvas
    // row actions"); shown while the row is hovered / highlighted
    let more = null;
    if (canvas) {
      row.setAttribute("data-canvas", "");
      more = el("button", "rcq-sub-more");
      more.type = "button";
      more.tabIndex = -1;
      more.dataset.testid = "rcq-canvas-more-button";
      more.setAttribute("aria-label", `More actions for ${label}`);
      more.setAttribute("aria-haspopup", "menu");
      more.setAttribute("aria-expanded", "false");
      more.setAttribute("aria-controls", MORE_ID);
      more.append(icon(ELLIPSIS_SVG, "rcq-ico"));
      more.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (sw.more && sw.more.index === i) closeMore(true);
        else openMore(i, e.detail === 0);
      });
      row.append(more);
    }
    row.addEventListener("mouseenter", () => {
      if (sw.renaming) return;
      sw.active = i;
      sw.moved = true;
      paintSwitch();
    });
    row.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (sw.renaming && sw.renaming.index === i) return;
      run();
    });
    // identity across redraws: the canvas folder, else the item kind + label
    const key = canvas && canvas.path ? `c:${normPath(canvas.path)}` : `${testid}:${label}`;
    sw.rows.push({ row, run, label, key, canvas: canvas || null, more });
    box.append(row);
  }

  function renderSwitch() {
    const box = sw.node;
    if (!box || !sw.pill) return;
    const m = switchModel(sw.pill);
    sw.model = m;
    const keep = sw.rows[sw.active] && sw.rows[sw.active].key;
    // a redraw (load() finishing) while a row's "⋯" holds focus (Tab) hands
    // that focus to the same canvas's new "⋯", so Enter still opens its
    // actions; focus anywhere else in the menu stays on the menu
    const a = document.activeElement;
    const hadFocus = !!a && box.contains(a);
    const onMore = sw.rows.find((x) => x.more && x.more === a);
    const focusKey = onMore ? onMore.key : null;
    box.textContent = "";
    sw.rows = [];
    // one "Canvases" list (open ones with a dot, the current one checked, then
    // the project's recents), drawn only with rows; a separator before "Open…"
    // only after it
    const sep = () => box.childElementCount && box.append(el("div", "rcq-sub-sep"));
    if (m.open.length || m.recents.length || m.status === "loading") box.append(el("div", "rcq-sub-label", "Canvases"));
    for (const o of m.open) {
      addRow(box, {
        cls: o.current ? "rcq-switch-current" : "",
        testid: o.current ? "rcq-switch-open-current" : "rcq-switch-open",
        role: "menuitemradio",
        label: o.name,
        iconSvg: CANVAS_SVG,
        iconCls: "rcq-ico rcq-ico-canvas",
        checked: o.current,
        open: !o.current,
        run: () => pickOpen(o),
        canvas: (o.tab ? o.tab.pageFolderPath : m.cur.path) ? { name: o.name, path: o.tab ? o.tab.pageFolderPath : m.cur.path, resolved: true } : null,
      });
    }
    if (m.status === "loading") box.append(el("div", "rcq-sub-empty", "Loading…"));
    for (const c of m.recents) {
      addRow(box, {
        testid: "rcq-switch-recent",
        role: "menuitemradio",
        label: c.canvasName,
        iconSvg: CANVAS_SVG,
        iconCls: "rcq-ico rcq-ico-canvas",
        when: short(c.recentAt),
        checked: false,
        run: () => pickRecent(c),
        canvas: { name: c.canvasName, path: c.canvasPath, resolved: false, ref: c },
      });
    }
    sep();
    // New canvas (as the "+" one: the app's own create, noted as made here),
    // offered for the selected workspace only
    const acts = m.status === "other-workspace" ? null : appNewTabActions();
    if (acts && typeof acts.onNewCanvas === "function" && !acts.newCanvasDisabledReason)
      addRow(box, { testid: "rcq-switch-new", label: "New canvas", iconSvg: PLUS_SVG, iconCls: "rcq-ico", run: pickNew });
    addRow(box, { testid: "rcq-switch-open-modal", label: "Open…", iconSvg: SEARCH_SVG, iconCls: "rcq-ico", run: pickModal });
    const again = keep ? sw.rows.findIndex((r) => r.key === keep) : -1;
    if (again >= 0) sw.active = again;
    else if (sw.active >= sw.rows.length) sw.active = sw.rows.length - 1;
    const back = focusKey ? sw.rows.findIndex((r) => r.key === focusKey && r.more) : -1;
    if (back >= 0) sw.active = back;
    paintSwitch();
    if (back >= 0) sw.rows[back].more.focus({ preventScroll: true });
    else if (hadFocus && !box.contains(document.activeElement)) box.focus({ preventScroll: true });
  }

  function paintSwitch() {
    if (!sw.node) return;
    sw.rows.forEach((r, i) => {
      if (i === sw.active) r.row.setAttribute("data-active", "");
      else r.row.removeAttribute("data-active");
    });
    const a = sw.rows[sw.active];
    if (a) {
      sw.node.setAttribute("aria-activedescendant", a.row.id);
      a.row.scrollIntoView({ block: "nearest" });
    } else sw.node.removeAttribute("aria-activedescendant");
  }

  // Under the pill; above it when the menu does not fit below and there is
  // more room above (a low pane-dock pane). Its height never exceeds the room
  // on that side (it scrolls), so no row ends up off screen.
  const SWITCH_GAP = 6;
  const SWITCH_EDGE = 12;
  function placeSwitch() {
    if (!sw.node || !sw.pill) return;
    const r = sw.pill.getBoundingClientRect();
    const box = sw.node;
    box.style.maxHeight = "";
    const w = box.offsetWidth || 260;
    const natural = box.scrollHeight + (box.offsetHeight - box.clientHeight); // rows + borders
    const below = Math.max(0, window.innerHeight - r.bottom - SWITCH_GAP - SWITCH_EDGE);
    const above = Math.max(0, r.top - SWITCH_GAP - SWITCH_EDGE);
    const up = natural > below && above > below;
    const room = Math.floor(up ? above : below);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const top = up ? r.top - SWITCH_GAP - Math.min(natural, room) : r.bottom + SWITCH_GAP;
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
    // max-height counts the content box: the padding and borders come off the room
    const cs = getComputedStyle(box);
    const chrome =
      cs.boxSizing === "border-box"
        ? 0
        : (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    box.style.maxHeight = `${Math.max(0, Math.floor(room - chrome))}px`;
    box.setAttribute("data-side", up ? "top" : "bottom");
  }

  // A canvas open in a tab (any chat, pane or split side): that tab comes
  // forward.
  function pickOpen(o) {
    const pill = sw.pill;
    closeSwitch(false);
    if (!o.tab || o.current) {
      state.switchedVia = "current";
      return;
    }
    activateTab(o.tab, pill);
  }
  // Any other canvas opens in a tab of its own, like the "+" submenu (another
  // branch's through the app's branch picker).
  function pickRecent(c) {
    closeSwitch(false);
    openCanvas(c).then(() => (state.switchedVia = state.openedVia));
  }
  function pickModal() {
    closeSwitch(false);
    searchAll();
  }
  function pickNew() {
    closeSwitch(false);
    newCanvas().then((r) => (state.switchedVia = r.via === "create" ? "new-canvas" : null));
  }

  function openSwitch(pill, viaKeyboard) {
    if (sw.node && sw.pill === pill) return closeSwitch(true);
    closeSwitch(false);
    closeSub();
    sw.pill = pill;
    sw.keyboard = !!viaKeyboard;
    sw.moved = false;
    sw.prevFocus = document.activeElement;
    sw.active = -1;
    const box = el("div", "rcq-sub rcq-switch");
    box.id = SWITCH_ID;
    box.tabIndex = -1;
    box.dataset.testid = "rcq-canvas-switcher";
    box.setAttribute("role", "menu");
    box.setAttribute("aria-label", "Switch canvas");
    // keep the canvas underneath from seeing presses, wheel and context menu
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "dblclick", "wheel", "contextmenu"]) {
      box.addEventListener(t, (e) => e.stopPropagation());
    }
    sw.node = box;
    document.body.append(box);
    pill.setAttribute("data-rcq-switch-open", "");
    renderSwitch();
    if (sw.keyboard) firstOther();
    placeSwitch();
    syncPills(); // aria-expanded
    try {
      box.focus({ preventScroll: true });
    } catch (_) {}
    window.addEventListener("blur", onSwitchBlur);
    window.addEventListener("resize", onSwitchBlur);
    document.addEventListener("focusin", onSwitchFocusIn, true);
    load().then(() => {
      if (sw.node === box) {
        if (sw.more || sw.renaming) {
          sw.dirty = true; // redrawn when the actions menu / rename ends
          return;
        }
        renderSwitch();
        if (sw.keyboard && !sw.moved) firstOther(); // rows that were still loading
        placeSwitch();
      }
    });
  }

  function closeSwitch(restoreFocus) {
    const box = sw.node;
    if (!box) return;
    closeMore(false);
    cancelRename(false);
    sw.dirty = false;
    const hadFocus = box.contains(document.activeElement);
    box.remove();
    sw.node = null;
    sw.model = null;
    sw.rows = [];
    sw.active = -1;
    window.removeEventListener("blur", onSwitchBlur);
    window.removeEventListener("resize", onSwitchBlur);
    document.removeEventListener("focusin", onSwitchFocusIn, true);
    const pill = sw.pill;
    sw.pill = null;
    if (pill) {
      pill.removeAttribute("data-rcq-switch-open");
      const b = pill.querySelector(`:scope > .${CHEVRON_CLS}`);
      if (b) b.setAttribute("aria-expanded", "false");
      if (restoreFocus && hadFocus) {
        const back = sw.keyboard && b ? b : sw.prevFocus;
        if (back && back.isConnected && typeof back.focus === "function") back.focus({ preventScroll: true });
      }
    }
    sw.prevFocus = null;
  }

  // focus leaving the window (a click inside the canvas iframe) or a resize
  function onSwitchBlur() {
    closeSwitch(false);
  }
  // The open menus: the switcher (its rows, "⋯" buttons and rename field) and
  // the row actions menu.
  const inSwitchMenus = (n) => n instanceof Node && ((!!sw.node && sw.node.contains(n)) || (!!sw.more && sw.more.node.contains(n)));
  // focus moving to anything else (an app shortcut focusing the sidebar
  // search, a click that focuses a field) closes the menu: its keys are
  // captured only while it has focus
  function onSwitchFocusIn(e) {
    if (sw.node && !inSwitchMenus(e.target) && !(cf.node && cf.node.contains(e.target))) closeSwitch(false);
  }

  // Document capture: the trigger's presses never reach the canvas, and a
  // press anywhere outside the open menu closes it.
  function onDocPointerDown(e) {
    const pill = triggerPill(e.target);
    if (pill) {
      e.preventDefault(); // no text selection on the name, no focus jump
      e.stopPropagation();
      return;
    }
    const inMore = !!sw.more && sw.more.node.contains(e.target);
    if (sw.node && !sw.node.contains(e.target) && !inMore) closeSwitch(false);
    else if (sw.more && !inMore && !(sw.more.anchor && sw.more.anchor.contains(e.target))) closeMore(false);
  }
  function onDocClick(e) {
    const pill = triggerPill(e.target);
    if (!pill) return;
    e.preventDefault();
    e.stopPropagation();
    openSwitch(pill, e.detail === 0); // detail 0: Enter/Space on the chevron
  }

  // Window capture (via onKey): while the menu is open every plain key is ours,
  // so arrows/Backspace never reach the canvas selection underneath.
  function onSwitchKey(e) {
    if (!sw.node) {
      const a = document.activeElement;
      if (e.key === "ArrowDown" && a && a.classList && a.classList.contains(CHEVRON_CLS)) {
        const pill = a.closest(PILL);
        if (pill) {
          e.preventDefault();
          e.stopImmediatePropagation();
          openSwitch(pill, true);
          return true;
        }
      }
      return false;
    }
    // keys are ours only while focus is in the menus: focus that moved
    // elsewhere closes them and the key goes there; focus dropped to <body>
    // (the node that had it was redrawn) comes back to the menu
    const f = document.activeElement;
    if (!inSwitchMenus(f)) {
      if (f && f !== document.body && f !== document.documentElement) {
        closeSwitch(false);
        return false;
      }
      try {
        (sw.more ? sw.more.node : sw.node).focus({ preventScroll: true });
      } catch (_) {}
    }
    if (sw.renaming) return onRenameKey(e);
    if (e.metaKey || e.ctrlKey) return false; // app shortcuts keep working
    if (sw.more) return onMoreKey(e);
    // the highlighted row's "⋯" can hold real focus (Tab): it opens its menu
    const a = document.activeElement;
    const onMore = !!a && !!a.classList && a.classList.contains("rcq-sub-more") && sw.node.contains(a);
    if (onMore) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        e.stopImmediatePropagation();
        openMore(sw.active, true);
        return true;
      }
      if (e.key === "Escape" || (e.key === "Tab" && e.shiftKey)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        sw.node.focus({ preventScroll: true });
        return true;
      }
      if (e.key === "ArrowUp" || e.key === "Home" || e.key === "End") sw.node.focus({ preventScroll: true });
    }
    const n = sw.rows.length;
    const move = (i) => {
      sw.active = n ? (i + n) % n : -1;
      sw.moved = true;
      paintSwitch();
    };
    switch (e.key) {
      case "ArrowDown":
        move(sw.active < 0 ? 0 : sw.active + 1);
        break;
      case "ArrowUp":
        move(sw.active < 0 ? n - 1 : sw.active - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(n - 1);
        break;
      case "Enter":
      case " ":
        if (sw.rows[sw.active]) sw.rows[sw.active].run();
        break;
      case "ArrowRight":
      case "ContextMenu":
        if (sw.rows[sw.active] && sw.rows[sw.active].canvas) openMore(sw.active, true);
        break;
      case "F10":
        if (e.shiftKey && sw.rows[sw.active] && sw.rows[sw.active].canvas) openMore(sw.active, true);
        break;
      case "Escape":
        closeSwitch(true);
        break;
      case "Tab":
        if (!e.shiftKey && !onMore && sw.rows[sw.active] && sw.rows[sw.active].more) {
          sw.rows[sw.active].more.focus({ preventScroll: true });
          break;
        }
        closeSwitch(true);
        return true; // let focus move on
      default:
        if (e.key.length === 1 && !e.altKey) {
          // type-ahead on the item names
          clearTimeout(sw.typedT);
          sw.typed += e.key.toLowerCase();
          sw.typedT = setTimeout(() => (sw.typed = ""), 600);
          for (let k = 1; k <= n; k++) {
            const i = (Math.max(sw.active, 0) + (sw.typed.length > 1 ? k - 1 : k)) % n;
            if (sw.rows[i].label.toLowerCase().startsWith(sw.typed)) {
              move(i);
              break;
            }
          }
        }
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    return true;
  }

  // ------------------------------------------ switcher: canvas row actions
  // Each canvas row shows a "⋯" button while it is hovered or highlighted
  // (absolute, over the row's right slot, which only turns invisible: nothing
  // moves). It opens a small menu: Open in new tab, Rename… (inline in the
  // row) and Delete… (confirmation dialog).
  // Rename and Delete are the app's own (a canvas is a folder; there is no
  // canvas mutation in Convex, the index follows the files):
  //   1) the Design view's canvas tree handlers (the onCanvasPageMove /
  //      onCanvasDelete of its left canvas tree), when the Design route was
  //      opened in this session (the view mounts on first visit);
  //   2) otherwise the Files panel's own rename / delete of the always mounted
  //      workspaces page (service.renameFile / deleteFile, open tabs renamed
  //      through renameOpenFileTabs -> renameOpenCanvasTabs, lists
  //      refreshed), followed on a rename by the step the Design view adds:
  //      the canvas page config's pageName, through the app's service.
  // Both are found as useCallbacks in the CURRENT fiber tree by their source,
  // act on the selected workspace, toast their own errors. Nothing here
  // writes to disk or to Convex by itself. A canvas of another workspace, or a
  // recent of another branch (not in this worktree), keeps both items
  // disabled, with the reason written in the menu. The app has no
  // undo / trash for files, so Delete asks first; it has no "duplicate canvas"
  // action, so there is no Duplicate.
  // Open in new tab: a new center tab with that canvas right after this one
  // (the store's tab ops, like the switcher's "show here"), else the app's
  // own open (another branch, a pane-dock pane).
  const MORE_ID = "rcq-canvas-more";
  const CONFIRM_ID = "rcq-canvas-confirm";
  const OTHER_WS = "Rename and Delete work on canvases of the selected workspace only";
  const OTHER_BRANCH = "Rename and Delete work on canvases of this worktree's branch only";
  const NO_ACTIONS = "The app's canvas file actions were not found";
  const cf = { node: null, back: null, busy: false };

  function reactRoot() {
    for (const n of [document.getElementById("root"), ...document.body.children]) {
      if (!n) continue;
      const k = Object.keys(n).find((x) => x.startsWith("__reactContainer$"));
      const f = k && n[k];
      if (f) return f.stateNode && f.stateNode.current ? f.stateNode.current : f;
    }
    return null;
  }

  const cbOf = (h) => {
    const s = h.memoizedState;
    return Array.isArray(s) && s.length === 2 && typeof s[0] === "function" && Array.isArray(s[1]) ? s[0] : null;
  };
  const srcOf = (fn) => Function.prototype.toString.call(fn);

  // One walk down the CURRENT fiber tree (so never a stale alternate's
  // closures): the Design view's rename / delete callbacks and the workspaces
  // page's Files rename / delete callback.
  function appCanvasActions() {
    const out = { design: null, files: null };
    const root = reactRoot();
    if (!root) return out;
    const stack = [root];
    for (let n = 0; stack.length && n < 400000 && !(out.design && out.files); n++) {
      const f = stack.pop();
      const p = f.memoizedProps;
      if (p && typeof p === "object" && isHook(f.memoizedState)) {
        if (!out.design && typeof p.onRightPanelNavReady === "function" && typeof p.onNavigateToChat === "function" && !p.detachedCanvas) {
          let rename = null;
          let del = null;
          for (let h = f.memoizedState, i = 0; h && i < 4000; i++, h = h.next) {
            const fn = cbOf(h);
            if (!fn) continue;
            const src = srcOf(fn);
            if (!del && src.includes("DesignView.handleCanvasDelete")) del = fn;
            else if (!rename && src.includes("renameOpenCanvasTabs") && src.includes("applyOptimisticAllFilesMutation") && !src.includes("handleCanvasReplace"))
              rename = fn;
          }
          if (rename && del) out.design = { rename, del };
        } else if (!out.files && "processMemoryTrackerAvailable" in p) {
          for (let h = f.memoizedState, i = 0; h && i < 6000; i++, h = h.next) {
            const fn = cbOf(h);
            if (!fn) continue;
            const src = srcOf(fn);
            if (src.includes(".renameFile(") && src.includes(".deleteFile(") && src.includes("Failed to rename") && src.includes("Failed to delete")) {
              out.files = fn;
              break;
            }
          }
        }
      }
      if (f.sibling) stack.push(f.sibling);
      if (f.child) stack.push(f.child);
    }
    return out;
  }

  function liveWs(pill) {
    return wsState(pill && pill.isConnected ? pill : undefined);
  }

  // A recent of another branch (the index has every worktree branch's): its
  // folder is not in this worktree, so a rename / delete here would miss it.
  const otherBranch = (c, m) => !!c && !c.resolved && !!c.ref && (c.ref.branch || null) !== ((m && m.branch) || null);

  // {rename(from, to, name), del(paths) -> failed paths, via, origin, why}
  // for the canvas row `c`. origin: the workspace the action is offered for
  // (id, path, load() key, service), read here, before any await, and the
  // only one the follow-up steps use (page config, tab cleanup, index patch),
  // whatever gets selected while the app's handler runs. The app's handlers
  // act on the selected workspace, so a call is refused once it is another.
  function canvasActions(pill, model, c) {
    const st = liveWs(pill);
    if (!st || !model || !model.workspaceId || model.workspaceId !== st.selectedWorkspaceId) return { why: OTHER_WS };
    if (otherBranch(c, model)) return { why: OTHER_BRANCH };
    const ws = selectedWs(st);
    if (!ws) return { why: OTHER_WS };
    const origin = { id: ws.id, path: ws.path || "", key: ctxKey(ws), service: st.service || null };
    const still = () => {
      const s = liveWs(pill);
      return !!s && s.selectedWorkspaceId === origin.id;
    };
    const changed = () => new Error("the selected workspace changed");
    const a = appCanvasActions();
    if (a.design) {
      const d = a.design;
      return {
        via: "design-view",
        origin,
        rename: async (from, to) => {
          if (!still()) throw changed();
          return d.rename(from, to);
        },
        del: async (paths) => (still() ? d.del(paths) : paths),
      };
    }
    if (a.files) {
      const files = a.files;
      const svc = origin.service;
      return {
        via: "files-panel",
        origin,
        rename: async (from, to, name) => {
          if (!still()) throw changed();
          if (!(await files({ kind: "rename", oldPath: from, newPath: to }))) throw new Error("rename failed");
          // the Design view's rename also renames the canvas in its page
          // config: the origin workspace's, through its service
          if (!origin.path || !svc || typeof svc.readPageConfig !== "function" || typeof svc.writePageConfig !== "function") return;
          try {
            const cfg = await svc.readPageConfig(origin.path, to);
            if (cfg && typeof cfg === "object") await svc.writePageConfig(origin.path, to, { ...cfg, pageName: name });
          } catch (_) {}
        },
        del: async (paths) => {
          if (!still()) return paths;
          return (await files({ kind: "delete", items: paths.map((path) => ({ path, isFolder: true })) })) ? [] : paths;
        },
      };
    }
    return { why: NO_ACTIONS };
  }

  // A row's folder in the app's tab path format (tabs are already resolved;
  // index paths go through openCanvasTab's resolution).
  function rowPath(c, pill) {
    if (c.resolved) return c.path ? normPath(c.path) : null;
    const st = liveWs(pill);
    const ws = st && st.workspaces.find((w) => w && w.id === st.selectedWorkspaceId);
    return st && ws ? resolveCanvasPath(c.path, st, ws) : null;
  }

  // ---- the "⋯" menu
  function openMore(i, viaKeyboard) {
    const r = sw.rows[i];
    if (!r || !r.canvas || !sw.node) return;
    closeMore(false);
    cancelRename(false);
    sw.active = i;
    paintSwitch();
    const acts = canvasActions(sw.pill, sw.model, r.canvas);
    const box = el("div", "rcq-sub rcq-more");
    box.id = MORE_ID;
    box.tabIndex = -1;
    box.dataset.testid = "rcq-canvas-more";
    box.setAttribute("role", "menu");
    box.setAttribute("aria-label", `Actions for ${r.canvas.name}`);
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "dblclick", "wheel", "contextmenu"]) {
      box.addEventListener(t, (e) => e.stopPropagation());
    }
    const m = { node: box, index: i, rows: [], active: -1, anchor: r.more };
    const item = (label, svg, testid, run, opt) => {
      const k = m.rows.length;
      const row = el("div", `rcq-sub-item${opt && opt.danger ? " rcq-sub-danger" : ""}`);
      row.id = `${MORE_ID}-item-${k}`;
      row.dataset.testid = testid;
      row.setAttribute("role", "menuitem");
      const off = !!(opt && opt.disabled);
      if (off) {
        row.setAttribute("aria-disabled", "true");
        row.title = opt.why || "";
      }
      row.append(icon(svg, "rcq-ico"), el("span", "rcq-sub-name", label));
      row.addEventListener("mouseenter", () => {
        m.active = off ? -1 : k;
        paintMore();
      });
      row.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!off) run();
      });
      m.rows.push({ row, run, disabled: off });
      box.append(row);
    };
    const c = r.canvas;
    item("Open in new tab", NEW_TAB_SVG, "rcq-more-open-tab", () => moreOpenTab(c));
    item("Rename…", PENCIL_SVG, "rcq-more-rename", () => startRename(i), { disabled: !acts.rename, why: acts.why });
    box.append(el("div", "rcq-sub-sep"));
    item("Delete…", TRASH_SVG, "rcq-more-delete", () => askDelete(c), { disabled: !acts.del, why: acts.why, danger: true });
    if (!acts.rename || !acts.del) {
      // the reason in words, not only a tooltip
      const note = el("div", "rcq-more-note", acts.why);
      note.dataset.testid = "rcq-more-note";
      box.append(note);
      box.setAttribute("aria-describedby", (note.id = `${MORE_ID}-note`));
    }
    sw.more = m;
    if (r.more) r.more.setAttribute("aria-expanded", "true");
    r.row.setAttribute("data-more-open", "");
    document.body.append(box);
    if (viaKeyboard) m.active = m.rows.findIndex((x) => !x.disabled);
    placeMore();
    paintMore();
    try {
      box.focus({ preventScroll: true });
    } catch (_) {}
  }

  function closeMore(back) {
    const m = sw.more;
    if (!m) return;
    sw.more = null;
    m.node.remove();
    const r = sw.rows[m.index];
    if (r) {
      if (r.more) r.more.setAttribute("aria-expanded", "false");
      r.row.removeAttribute("data-more-open");
    }
    if (back && sw.node) {
      sw.node.focus({ preventScroll: true });
      if (sw.dirty && !sw.renaming) {
        sw.dirty = false;
        renderSwitch();
      }
    }
  }

  function paintMore() {
    const m = sw.more;
    if (!m) return;
    m.rows.forEach((r, k) => {
      if (k === m.active) r.row.setAttribute("data-active", "");
      else r.row.removeAttribute("data-active");
    });
    const a = m.rows[m.active];
    if (a) m.node.setAttribute("aria-activedescendant", a.row.id);
    else m.node.removeAttribute("aria-activedescendant");
  }

  // right of the switcher, first item level with the row; flipped left when
  // there is no room
  function placeMore() {
    const m = sw.more;
    if (!m || !sw.node) return;
    const row = sw.rows[m.index] && sw.rows[m.index].row;
    if (!row) return;
    const a = row.getBoundingClientRect();
    const b = sw.node.getBoundingClientRect();
    const w = m.node.offsetWidth || 200;
    const h = m.node.offsetHeight || 120;
    let left = b.right + 4;
    if (left + w > window.innerWidth - 8) left = Math.max(8, b.left - w - 4);
    const top = Math.max(8, Math.min(a.top - 8, window.innerHeight - h - 8)); // 8px padding
    m.node.style.left = `${Math.round(left)}px`;
    m.node.style.top = `${Math.round(top)}px`;
  }

  function onMoreKey(e) {
    const m = sw.more;
    const ok = m.rows.map((r, k) => (r.disabled ? -1 : k)).filter((k) => k >= 0);
    const step = (d) => {
      if (!ok.length) return;
      const k = ok.indexOf(m.active);
      m.active = ok[k < 0 ? (d > 0 ? 0 : ok.length - 1) : (k + d + ok.length) % ok.length];
      paintMore();
    };
    switch (e.key) {
      case "ArrowDown":
        step(1);
        break;
      case "ArrowUp":
        step(-1);
        break;
      case "Home":
        m.active = ok.length ? ok[0] : -1;
        paintMore();
        break;
      case "End":
        m.active = ok.length ? ok[ok.length - 1] : -1;
        paintMore();
        break;
      case "Enter":
      case " ": {
        const r = m.rows[m.active];
        if (r && !r.disabled) r.run();
        break;
      }
      case "Escape":
      case "ArrowLeft":
      case "Tab":
        closeMore(true); // only the actions menu; the switcher stays
        break;
      default:
        break;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    return true;
  }

  // ---- Open in new tab
  function openNewTab(pill, target) {
    const now = () => wsState(pill);
    const st = now();
    if (!st || typeof st.applyRemoteTabOp !== "function" || typeof st.setActiveCenterTab !== "function") return null;
    const ws = st.workspaces.find((w) => w && w.id === st.selectedWorkspaceId);
    if (!ws || ws.hostMachineId != null) return null;
    const cur = pillTab(pill, st);
    if (!cur || paneOf(pill, cur)) return null; // a pane-dock pane: the app's own open
    const path = target.resolved ? normPath(target.path) : resolveCanvasPath(target.path, st, ws);
    if (!path) return null;
    const owner = cur.ownerChatTabId != null ? cur.ownerChatTabId : st.activeChatTabId;
    const id = freeTabId(st, null, owner, path);
    const next = { ...cur, id, pageName: target.name || baseName(path), pageFolderPath: path };
    delete next.splitPanelCloneOf;
    st.applyRemoteTabOp(ws.id, { kind: "open", tab: next });
    const tabs = now().centerTabs;
    const from = tabs.findIndex((t) => t && t.id === id);
    if (from < 0) return null; // the store did not take it
    const at = tabs.findIndex((t) => t && t.id === cur.id);
    const to = at < 0 ? from : from > at ? at + 1 : at;
    if (to !== from && typeof now().reorderTabs === "function") now().reorderTabs(from, to);
    now().setActiveCenterTab(id);
    return "new-tab";
  }

  function moreOpenTab(c) {
    const pill = sw.pill;
    const m = sw.model;
    closeSwitch(false);
    const here = c.resolved || (!!m && !!m.branch && !!c.ref && c.ref.branch === m.branch);
    const r = pill && here ? openNewTab(pill, c) : null;
    if (r) {
      state.switchedVia = r;
      return;
    }
    const st = liveWs(pill);
    const ws = st && m && st.workspaces.find((w) => w && w.id === m.workspaceId);
    const ref = c.ref || { projectId: ws ? ws.projectId : null, canvasName: c.name, canvasPath: c.path, branch: m ? m.branch : null };
    openCanvas(ref).then(() => (state.switchedVia = state.openedVia));
  }

  // ---- Rename (inline)
  // the app's own name rules (its canvas tree's validation)
  function nameError(n) {
    if (n === "." || n === "..") return `"${n}" isn't a valid name`;
    if (n.includes("/") || n.includes("\\")) return 'A name can’t contain "/" or "\\"';
    return null;
  }

  function canvasExists(pill, path) {
    const st = liveWs(pill);
    const ws = st && st.workspaces.find((w) => w && w.id === st.selectedWorkspaceId);
    const dirs = st && ws ? workspaceCanvasDirs(st, ws) : null;
    if (dirs && Array.from(dirs).some((x) => samePath(x, path))) return true;
    const m = sw.model;
    return !!m && (m.open.some((o) => o.tab && samePath(o.tab.pageFolderPath, path)) || m.recents.some((c) => samePath(c.canvasPath, path)));
  }

  function startRename(i) {
    closeMore(false);
    const r = sw.rows[i];
    if (!r || !r.canvas || !sw.node) return;
    cancelRename(false);
    const nameEl = r.row.querySelector(".rcq-sub-name");
    if (!nameEl) return;
    const input = el("input", "rcq-sub-rename");
    input.type = "text";
    input.value = r.canvas.name;
    input.spellcheck = false;
    input.autocomplete = "off";
    input.dataset.testid = "rcq-canvas-rename-input";
    input.setAttribute("aria-label", `Rename ${r.canvas.name}`);
    for (const t of ["pointerdown", "mousedown", "click", "dblclick"]) input.addEventListener(t, (e) => e.stopPropagation());
    nameEl.replaceWith(input);
    r.row.setAttribute("data-renaming", "");
    sw.renaming = { index: i, input, nameEl, busy: false };
    sw.active = i;
    paintSwitch();
    input.addEventListener("blur", () => {
      const rn = sw.renaming;
      if (rn && rn.input === input && !rn.busy) cancelRename(false);
    });
    input.focus({ preventScroll: true });
    input.select();
  }

  function cancelRename(refocus) {
    const rn = sw.renaming;
    if (!rn) return;
    sw.renaming = null;
    if (rn.input.isConnected) rn.input.replaceWith(rn.nameEl);
    const r = sw.rows[rn.index];
    if (r) {
      r.row.removeAttribute("data-renaming");
      const er = r.row.querySelector(".rcq-sub-error");
      if (er) er.remove();
    }
    if (refocus && sw.node) {
      sw.node.focus({ preventScroll: true });
      if (sw.dirty && !sw.more) {
        sw.dirty = false;
        renderSwitch();
      }
    }
  }

  function renameError(rn, msg) {
    const r = sw.rows[rn.index];
    if (!r) return;
    let er = r.row.querySelector(".rcq-sub-error");
    if (!er) {
      er = el("div", "rcq-sub-error");
      er.dataset.testid = "rcq-canvas-rename-error";
      er.setAttribute("role", "alert");
      r.row.append(er);
    }
    er.textContent = msg;
    rn.input.setAttribute("aria-invalid", "true");
    rn.input.focus({ preventScroll: true });
  }

  // the index rows follow at once (the app's own index catches up later), in
  // the action's own context only (`key`: its workspace + branch)
  function indexOf(key) {
    const out = [];
    for (const d of [state.cache.get(key), state.data && dataKey(state.data) === key ? state.data : null]) {
      if (d && Array.isArray(d.items) && !out.includes(d)) out.push(d);
    }
    return out;
  }
  function patchIndex(from, to, name, key) {
    const tail = normPath(from).split("/").slice(-1)[0];
    for (const d of indexOf(key)) {
      for (const c of d.items) {
        if (!samePath(c.canvasPath, from)) continue;
        const p = normPath(c.canvasPath);
        c.canvasPath = p.endsWith(tail) ? `${p.slice(0, -tail.length)}${name}` : to;
        c.canvasName = name;
      }
    }
  }
  function patchIndexRemove(path, key) {
    for (const d of indexOf(key)) {
      d.items = d.items.filter((c) => !samePath(c.canvasPath, path));
      d.gone = [...(d.gone || []), path];
    }
  }

  async function commitRename() {
    const rn = sw.renaming;
    if (!rn || rn.busy) return;
    const r = sw.rows[rn.index];
    const next = rn.input.value.trim();
    if (!r || !next || next === r.canvas.name) return cancelRename(true);
    const bad = nameError(next);
    if (bad) return renameError(rn, bad);
    const pill = sw.pill;
    const from = rowPath(r.canvas, pill);
    if (!from) return renameError(rn, "Couldn't find this canvas's folder");
    const parent = from.split("/").slice(0, -1).join("/");
    const to = parent ? `${parent}/${next}` : next;
    if (canvasExists(pill, to)) return renameError(rn, `"${next}" already exists`);
    const acts = canvasActions(pill, sw.model, r.canvas);
    if (!acts.rename) return renameError(rn, acts.why);
    rn.busy = true;
    rn.input.disabled = true;
    try {
      await acts.rename(from, to, next);
    } catch (_) {
      if (sw.renaming !== rn) return;
      rn.busy = false;
      rn.input.disabled = false;
      return renameError(rn, `Couldn't rename to "${next}"`);
    }
    state.lastAction = { kind: "rename", from, to, via: acts.via, workspaceId: acts.origin.id };
    patchIndex(from, to, next, acts.origin.key);
    if (sw.renaming !== rn) return;
    sw.renaming = null;
    sw.dirty = false;
    if (!sw.node) return;
    renderSwitch();
    const k = sw.rows.findIndex((x) => x.label === next);
    if (k >= 0) {
      sw.active = k;
      paintSwitch();
    }
    sw.node.focus({ preventScroll: true });
  }

  // keys while renaming: Enter / Esc are ours; typing reaches the field (its
  // default action) and never the app (no canvas shortcut, no Backspace delete)
  function onRenameKey(e) {
    // an IME composition owns its keys (Enter picks a candidate, Esc drops
    // it): they reach the field only, nothing is committed or cancelled
    if (e.isComposing || e.keyCode === 229) {
      e.stopImmediatePropagation();
      return true;
    }
    if (e.metaKey || e.ctrlKey) {
      if (!/^[azxcvy]$/i.test(e.key)) return false; // other app shortcuts keep working
      e.stopImmediatePropagation();
      return true;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelRename(true);
    } else if (e.key === "Tab") e.preventDefault();
    e.stopImmediatePropagation();
    return true;
  }

  // ---- Delete (confirmation)
  function askDelete(c) {
    const pill = sw.pill;
    const model = sw.model;
    const back = pill && pill.querySelector(`:scope > .${CHEVRON_CLS}`);
    closeSwitch(false);
    openConfirm({
      title: `Delete ${c.name}?`,
      body: "This removes the canvas folder.",
      confirm: "Delete",
      busyLabel: "Deleting…",
      back,
      run: () => doDelete(c, pill, model),
    });
  }

  async function doDelete(c, pill, model) {
    const acts = canvasActions(pill, model, c);
    const path = acts.del ? rowPath(c, pill) : null;
    if (!acts.del || !path) return false;
    const origin = acts.origin;
    let failed;
    try {
      failed = await acts.del([path]);
    } catch (_) {
      failed = [path];
    }
    if (!Array.isArray(failed) || failed.length) return false; // the app's own toast says why
    state.lastAction = { kind: "delete", path, via: acts.via, workspaceId: origin.id };
    // the origin workspace's center tabs still showing it close, like the
    // Design view closes its own tabs of a deleted canvas: the app's tab op
    // takes the workspace (the selected one's centerTabs or, once another is
    // selected, its own workspaces[].centerTabs); other workspaces' tabs with
    // the same folder are not this canvas
    const st = liveWs(pill);
    if (st && typeof st.applyRemoteTabOp === "function") {
      const w = st.workspaces.find((x) => x && x.id === origin.id);
      const tabs = st.selectedWorkspaceId === origin.id ? st.centerTabs : w && w.centerTabs;
      for (const t of (tabs || []).slice()) {
        if (t && t.type === "canvas" && samePath(t.pageFolderPath, path)) (liveWs(pill) || st).applyRemoteTabOp(origin.id, { kind: "close", tabId: t.id });
      }
    }
    patchIndexRemove(path, origin.key);
    return true;
  }

  function openConfirm({ title, body, confirm, busyLabel, back, run }) {
    closeConfirm(false);
    const scrim = el("div", "rcq-confirm-scrim");
    scrim.dataset.testid = "rcq-canvas-confirm";
    const box = el("div", "rcq-confirm");
    box.id = CONFIRM_ID;
    box.setAttribute("role", "alertdialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", `${CONFIRM_ID}-title`);
    box.setAttribute("aria-describedby", `${CONFIRM_ID}-body`);
    const h = el("div", "rcq-confirm-title", title);
    h.id = `${CONFIRM_ID}-title`;
    const p = el("div", "rcq-confirm-body", body);
    p.id = `${CONFIRM_ID}-body`;
    const cancel = el("button", "rcq-btn rcq-btn-ghost", "Cancel");
    cancel.type = "button";
    cancel.dataset.testid = "rcq-confirm-cancel";
    const ok = el("button", "rcq-btn rcq-btn-critical", confirm);
    ok.type = "button";
    ok.dataset.testid = "rcq-confirm-ok";
    const foot = el("div", "rcq-confirm-foot");
    foot.append(cancel, ok);
    box.append(h, p, foot);
    scrim.append(box);
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick", "wheel", "contextmenu"]) {
      scrim.addEventListener(t, (e) => e.stopPropagation());
    }
    scrim.addEventListener("mousedown", (e) => {
      if (e.target === scrim && !cf.busy) closeConfirm(true);
    });
    cancel.addEventListener("click", () => {
      if (!cf.busy) closeConfirm(true);
    });
    ok.addEventListener("click", async () => {
      if (cf.busy) return;
      cf.busy = true;
      ok.disabled = true;
      cancel.disabled = true;
      ok.textContent = busyLabel || confirm;
      try {
        await run();
      } finally {
        cf.busy = false;
        closeConfirm(true);
      }
    });
    cf.node = scrim;
    cf.back = back || null;
    document.body.append(scrim);
    cancel.focus({ preventScroll: true }); // like the app's dialog: Cancel first
  }

  function closeConfirm(restore) {
    if (!cf.node) return;
    cf.node.remove();
    cf.node = null;
    const b = cf.back;
    cf.back = null;
    if (restore && b && b.isConnected) b.focus({ preventScroll: true });
  }

  // window capture (via onKey): Esc cancels, Tab stays inside, Enter/Space
  // activate the focused button (default action); nothing reaches the app
  function onConfirmKey(e) {
    if (!cf.node) return false;
    if (e.metaKey || e.ctrlKey) return false;
    if (e.key === "Escape") {
      e.preventDefault();
      if (!cf.busy) closeConfirm(true);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const btns = Array.from(cf.node.querySelectorAll("button:not(:disabled)"));
      if (btns.length) {
        const k = btns.indexOf(document.activeElement);
        btns[(k + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus({ preventScroll: true });
      }
    }
    e.stopImmediatePropagation();
    return true;
  }

  // ------------------------------------------------------ "+" New canvas
  // The user (2026-10-19): "I have to be able to open multiple canvases". The
  // "+" menu's New canvas (a click, Enter on it, or ⇧C, the app's own menu
  // shortcut: the panel's onKeyDownCapture calls newTabActions.onNewCanvas)
  // runs the app's own New Canvas (onNewCanvas: a new untitled-N folder,
  // opened in a new tab; tab-close pins it, so it opens beside the other
  // canvases) and notes the folder it made, so that the empty canvas cleanup
  // may delete it later, and no other canvas. The events are caught in the
  // capture phase (window for keys, document for clicks), before React's root
  // listener, so the app's handler runs once, from here; the menu closes
  // through its tab bar's own onNewTabMenuOpenChange. A disabled item
  // (newCanvasDisabledReason) is left to the app.
  const PLUS_CANVAS = '[data-testid="new-tab-action-canvas"]';
  const ADD_BTNS = '[data-testid^="center-panel-add-tab-button"]';
  const CLAIM_MS = 60000;
  const NEW_WAIT_MS = 15000;
  const NEW_OPEN_MS = 2500;
  const claimed = new Map(); // canvas folder -> until (ms): just opened / created, never cleaned up meanwhile

  function claim(p) {
    if (p) claimed.set(normPath(p), Date.now() + CLAIM_MS);
  }
  function isClaimed(p) {
    const now = Date.now();
    for (const [k, until] of claimed) {
      if (until < now) claimed.delete(k);
      else if (samePath(k, p)) return true;
    }
    return false;
  }

  function plusCanvasItem(target) {
    const t = target instanceof Element ? target : null;
    const it = t && t.closest(PLUS_CANVAS);
    if (!it || !it.closest(MENU)) return null;
    return it.hasAttribute("data-disabled") || it.getAttribute("aria-disabled") === "true" ? null : it;
  }

  // The app's "+" actions (the center tab bar's), for its own create.
  function appNewTabActions() {
    const p = tabBarProps();
    return (p && p.newTabActions) || null;
  }

  // The app's own "New Canvas" (a new untitled-N canvas in a new tab).
  function createCanvasNow() {
    const a = appNewTabActions();
    if (!a || typeof a.onNewCanvas !== "function" || a.newCanvasDisabledReason) return false;
    a.onNewCanvas();
    return true;
  }

  // Every open "+" menu closes through its tab bar's own onOpenChange; a menu
  // still up on the next frame (another tab bar variant) gets an Escape.
  function closePlusMenus() {
    for (const btn of document.querySelectorAll(ADD_BTNS)) {
      let f = fiberOf(btn);
      for (let i = 0; f && i < 80; i++, f = f.return) {
        const p = f.memoizedProps;
        if (p && p.newTabActions && "newTabMenuOpen" in p) {
          if (p.newTabMenuOpen && typeof p.onNewTabMenuOpenChange === "function") p.onNewTabMenuOpenChange(false);
          break;
        }
      }
    }
    requestAnimationFrame(() => {
      const m = document.querySelector(MENU);
      if (m && m.getClientRects().length)
        m.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
    });
  }

  // The folders under the workspace's canvas roots on disk (null: unreadable).
  async function canvasFolders(ws, roots) {
    const fs = window.electronAPI && window.electronAPI.fs;
    if (!ws || !ws.path || !fs || typeof fs.readDir !== "function") return null;
    const out = new Set();
    for (const r of roots) {
      try {
        const l = await fs.readDir(`${ws.path.replace(/\/+$/, "")}/${r}`);
        if (l && l.success && Array.isArray(l.data)) for (const e of l.data) if (e && e.name && e.name !== ".DS_Store" && e.isFile !== true) out.add(`${r}/${e.name}`);
      } catch (_) {}
    }
    return out;
  }

  // New canvas: the app's New Canvas, then the folder of the canvas tab it
  // opened (a tab that was not there, on a folder that was not a canvas) is
  // noted as made here. The app can make the folder and still refuse to open
  // it (its folder path is the real one, e.g. /private/tmp/…, while the
  // workspace's is a symlink, /tmp/…: openCanvasTab finds no such folder in
  // the workspace): a new folder with no tab after NEW_OPEN_MS is opened here,
  // with the folder relative to the workspace, the way the app meant to.
  // Resolves to { via: "create" | "none", path }.
  async function newCanvas() {
    const st = wsState();
    const ws = st ? selectedWs(st) : null;
    const before = new Set(((st && st.centerTabs) || []).filter((t) => t && t.type === "canvas").map((t) => t.id));
    const dirs = st && ws ? Array.from(workspaceCanvasDirs(st, ws) || []) : [];
    const roots = Array.from(new Set(dirs.map((d) => normPath(d).split("/").slice(0, -1).join("/")).filter(Boolean).concat(["tempo/designs/canvases"])));
    const foldersBefore = await canvasFolders(ws, roots);
    if (!createCanvasNow()) return (state.created = { via: "none", path: null, at: Date.now() });
    const until = Date.now() + NEW_WAIT_MS;
    let seenFolder = null;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 200));
      const st2 = wsState();
      const ws2 = st2 ? selectedWs(st2) : null;
      if (!ws2 || !ws || ws2.id !== ws.id) break;
      const t = (st2.centerTabs || []).find((x) => x && x.type === "canvas" && !before.has(x.id) && !dirs.some((d) => samePath(d, x.pageFolderPath)));
      if (t) {
        claim(t.pageFolderPath);
        await noteMade(ws2, t.pageFolderPath);
        return (state.created = { via: "create", path: normPath(t.pageFolderPath), opened: seenFolder ? "here" : "app", at: Date.now() });
      }
      if (!foldersBefore) continue;
      if (!seenFolder) {
        const now = await canvasFolders(ws2, roots);
        const fresh = now ? Array.from(now).find((f) => !foldersBefore.has(f)) : null;
        if (fresh) seenFolder = { path: fresh, at: Date.now() };
      } else if (Date.now() - seenFolder.at > NEW_OPEN_MS && typeof st2.openCanvasTab === "function") {
        try {
          const f = await window.electronAPI.sourceEditor.readSourceFileIfExists(ws2.path, `${seenFolder.path}${CANVAS_ENTRY}`);
          if (f) st2.openCanvasTab(baseName(seenFolder.path), seenFolder.path, true);
        } catch (_) {}
        seenFolder.at = Infinity; // once
      }
    }
    return (state.created = { via: "create", path: null, at: Date.now() });
  }

  function onPlusCanvasClick(e) {
    if (!plusCanvasItem(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    closePlusMenus();
    newCanvas();
  }

  // window capture (via onKey): ⇧C anywhere in the open "+" menu (or on its
  // trigger), and Enter / Space on the highlighted Canvas item. A held key
  // repeats nothing (the app ignores repeats too).
  function onPlusCanvasKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    const menu = document.querySelector(MENU);
    const item = menu && menu.querySelector(PLUS_CANVAS);
    if (!item || !plusCanvasItem(item)) return false;
    const t = e.target instanceof Element ? e.target : null;
    if (!t || !(menu.contains(t) || t.getAttribute("aria-expanded") === "true")) return false;
    const shortcut = e.shiftKey && (e.key === "C" || e.key === "c");
    const press = !e.shiftKey && (e.key === "Enter" || e.key === " ") && item.hasAttribute("data-highlighted");
    if (!shortcut && !press) return false;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return true;
    closePlusMenus();
    newCanvas();
    return true;
  }

  // ------------------------------------------------ empty canvas cleanup
  // The user (2026-10-18): a canvas that ends up empty can be deleted, it is
  // no longer part of the work; (2026-10-19) only one made by New canvas and
  // never edited, never a canvas that already existed. Candidates are only
  // the folders New canvas made (newCanvas notes them with the file's mtime,
  // per workspace path, in localStorage MADE_KEY); any other canvas is never
  // looked at. A candidate is deleted once it is no longer in use, with the
  // app's own canvas delete (the one behind the switcher's Delete…, see
  // "canvas row actions"; never a delete of our own):
  //   - when it leaves use: its last tab closed, or its tab shows another
  //     canvas (the switcher): checked 2 s later;
  //   - a sweep of the selected workspace's canvases (8 s after start, on a
  //     workspace switch, then every 5 min), which also needs the file to be
  //     untouched for 2 min (an agent that just created a canvas has not
  //     written it yet).
  // Never edited means all of this; anything else, or anything that cannot be
  // read, keeps the canvas (and a canvas that was edited stops being a
  // candidate for good):
  //   - index.canvas.tsx has the mtime it had when New canvas made it;
  //   - its folder holds only index.canvas.tsx (.DS_Store aside);
  //   - that file is the app's new-canvas scaffold (createPage writes
  //     `import { Canvas } from "tempo-sdk/canvas"; export default function
  //     XCanvas() { return <Canvas name="…" backgroundColor="…" />; }`),
  //     whitespace aside: a self-closing <Canvas> with only those two string
  //     props, so no storyboard of any kind, and nothing else in the file
  //     (no canvas-nodes block: browser, shader, note or image frames);
  //   - no localStorage entry of the canvas mods names its folder (frames,
  //     notes or effects not in the file yet, comment-agent tasks);
  //   - no comment thread on it (comments:listThreadsForCanvas, the query the
  //     canvas's comment layer uses) when the project has a cloud index; a
  //     failed query keeps it.
  // In use (never deleted): a tab on its folder in any workspace on the same
  // folder (center tabs, Design tabs, pane-dock / popout tabs), a canvas on
  // screen, or one "+" Canvas is opening (until its tab shows, at most 60 s).
  // Only the selected workspace's canvases (the app's delete acts on it), in
  // its own worktree, under its canvases folder (the paths openCanvasTab
  // accepts). Each deletion shows a toast "Deleted empty canvas <name>" and
  // logs name and path (console.info). Off: localStorage
  // "rtd.canvasEmptyCleanup" = "off" (checked live).
  const CLEANUP_FLAG = "rtd.canvasEmptyCleanup";
  const USE_POLL_MS = 1500;
  const LEAVE_DELAY_MS = 2000;
  const SWEEP_START_MS = 8000;
  const SWEEP_EVERY_MS = 5 * 60000;
  const SWEEP_MIN_AGE_MS = 2 * 60000;
  const SCAFFOLD_RE =
    /^\s*import\s*\{\s*Canvas\s*,?\s*\}\s*from\s*(["'])tempo-sdk\/canvas\1\s*;?\s*export\s+default\s+function\s+[A-Za-z_$][\w$]*\s*\(\s*\)\s*\{\s*return\s*\(?\s*<Canvas((?:\s+[A-Za-z]+\s*=\s*(?:"[^"]*"|'[^']*'|\{\s*(?:"[^"]*"|'[^']*')\s*\}))*)\s*\/>\s*\)?\s*;?\s*\}\s*$/;
  const SCAFFOLD_PROPS = ["name", "backgroundColor"];
  const MADE_KEY = "rtd.canvasQuick.made.v1"; // "<workspace path>::<folder>" -> { at, mtime }
  const cu = { prev: new Map(), timers: new Map(), busy: new Set(), lastSweep: new Map(), sweeping: null, deleted: [], last: null, startedAt: Date.now(), poll: 0 };

  const cleanupOn = () => {
    try {
      return localStorage.getItem(CLEANUP_FLAG) !== "off";
    } catch (_) {
      return true;
    }
  };

  const madeKey = (ws, p) => `${normPath(ws.path)}::${normPath(p)}`;
  function madeAll() {
    try {
      const v = JSON.parse(localStorage.getItem(MADE_KEY) || "{}");
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch (_) {
      return {};
    }
  }
  function madeSave(m) {
    try {
      if (Object.keys(m).length) localStorage.setItem(MADE_KEY, JSON.stringify(m));
      else localStorage.removeItem(MADE_KEY);
    } catch (_) {}
  }
  const madeEntry = (ws, p) => madeAll()[madeKey(ws, p)] || null;
  function forgetMade(ws, p) {
    const m = madeAll();
    if (!(madeKey(ws, p) in m)) return;
    delete m[madeKey(ws, p)];
    madeSave(m);
  }
  // A folder New canvas just made, with its file's mtime (null when it cannot
  // be read: such a canvas is never deleted).
  async function noteMade(ws, path) {
    let mtime = null;
    try {
      const f = await window.electronAPI.sourceEditor.readSourceFileIfExists(ws.path, `${normPath(path)}${CANVAS_ENTRY}`);
      if (f && isScaffold(f.content) && Number(f.mtime)) mtime = Number(f.mtime);
    } catch (_) {}
    const m = madeAll();
    m[madeKey(ws, path)] = { at: Date.now(), mtime };
    madeSave(m);
  }

  function isScaffold(src) {
    const m = SCAFFOLD_RE.exec(String(src == null ? "" : src).replace(/^﻿/, ""));
    if (!m) return false;
    const props = Array.from(m[2].matchAll(/([A-Za-z]+)\s*=/g), (x) => x[1]);
    return props.every((p) => SCAFFOLD_PROPS.includes(p)) && new Set(props).size === props.length;
  }

  // `p` inside `s` as a whole folder (not untitled inside untitled-2).
  function mentions(s, p) {
    for (let i = s.indexOf(p); i >= 0; i = s.indexOf(p, i + 1)) {
      const after = s.charAt(i + p.length);
      if (!/[A-Za-z0-9_-]/.test(after)) return true;
    }
    return false;
  }

  // localStorage entries of the canvas mods about this folder (null: unreadable)
  function localTraces(path) {
    const p = normPath(path);
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !/^rtd\.(canvas|commentAgent)/.test(k) || k === CLEANUP_FLAG || k === MADE_KEY) continue;
        const v = localStorage.getItem(k);
        if (!v || v === "null" || v === "[]" || v === "{}") continue;
        if (mentions(k, p) || (k.startsWith("rtd.commentAgent") && mentions(v, p))) out.push(k);
      }
    } catch (_) {
      return null;
    }
    return out;
  }

  // Comment threads on this canvas in the project's cloud index. A project
  // without one (local only) cannot have comments.
  async function commentThreads(ws, path, d) {
    const orgProjectId = (d && d.orgProjectId) || orgProjectIdFor(ws.projectId);
    if (!orgProjectId) return 0;
    try {
      const threads = await convexQuery("comments:listThreadsForCanvas", { orgProjectId, branch: branchOf(ws), contentPath: path });
      return Array.isArray(threads) ? threads.length : null;
    } catch (_) {
      return null;
    }
  }

  // {empty: true, content, mtime} | {empty: false, why}
  async function emptyCheck(ws, path, d) {
    const api = window.electronAPI || {};
    const se = api.sourceEditor;
    const fs = api.fs;
    if (!ws || !ws.path || !se || typeof se.readSourceFileIfExists !== "function" || !fs || typeof fs.readDir !== "function")
      return { empty: false, why: "no-file-api" };
    const rel = normPath(path);
    if (!rel) return { empty: false, why: "no-path" };
    let list;
    try {
      list = await fs.readDir(`${ws.path.replace(/\/+$/, "")}/${rel}`);
    } catch (_) {
      list = null;
    }
    if (!list || !list.success || !Array.isArray(list.data)) return { empty: false, why: "folder-unreadable" };
    const entries = list.data.filter((x) => x && x.name !== ".DS_Store");
    if (entries.length !== 1 || entries[0].name !== "index.canvas.tsx" || entries[0].isFile === false) return { empty: false, why: "other-files" };
    let file;
    try {
      file = await se.readSourceFileIfExists(ws.path, `${rel}${CANVAS_ENTRY}`);
    } catch (_) {
      file = null;
    }
    if (!file || typeof file.content !== "string") return { empty: false, why: "file-unreadable" };
    if (!isScaffold(file.content)) return { empty: false, why: "has-content" };
    const lt = localTraces(rel);
    if (lt === null) return { empty: false, why: "local-data-unreadable" };
    if (lt.length) return { empty: false, why: "local-data", keys: lt };
    const n = await commentThreads(ws, rel, d);
    if (n === null) return { empty: false, why: "comments-unknown" };
    if (n > 0) return { empty: false, why: "comments" };
    return { empty: true, content: file.content, mtime: Number(file.mtime) || 0 };
  }

  // Canvas folders in use for the workspace `ws`: tabs of every workspace on
  // the same folder (center, Design, pane-dock / popout), canvases on screen.
  function canvasesInUse(st, ws) {
    const out = [];
    const add = (p) => {
      const n = normPath(p);
      if (n) out.push(n);
    };
    const designPath = (t) => t && (t.pageFolderPath || (typeof t.id === "string" && t.id.startsWith("design-canvas-") ? t.id.slice(14) : null));
    const same = (w) => !!w && (w.id === ws.id || (!!w.path && !!ws.path && normPath(w.path) === normPath(ws.path)));
    for (const t of st.centerTabs || []) if (t && t.type === "canvas") add(t.pageFolderPath);
    for (const t of st.designTabs || []) add(designPath(t));
    for (const w of st.workspaces || []) {
      if (!same(w)) continue;
      // the selected workspace's own entry is a snapshot: its live tabs are st's
      if (w.id !== st.selectedWorkspaceId) for (const t of w.centerTabs || []) if (t && t.type === "canvas") add(t.pageFolderPath);
      for (const t of w.designTabs || []) add(designPath(t));
    }
    const pq = pqState();
    for (const dsc of (pq && pq.tabs) || []) if (dsc && dsc.tab && dsc.tab.pageFolderPath) add(dsc.tab.pageFolderPath);
    for (const n of document.querySelectorAll("[data-canvas-root], [data-canvas-shell]")) {
      let f = fiberOf(n);
      for (let i = 0; f && i < 200; i++, f = f.return) {
        const p = f.memoizedProps;
        if (p && typeof p.pageFolderPath === "string") {
          add(p.pageFolderPath);
          break;
        }
      }
    }
    return out;
  }
  const inUse = (st, ws, path) => canvasesInUse(st, ws).some((p) => samePath(p, path));

  // Deletes the folder with the app's own canvas delete. true when it is gone.
  async function appDeleteCanvas(ws, path) {
    const a = appCanvasActions();
    let via = null;
    let ok = false;
    try {
      if (a.design) {
        via = "design-view";
        const failed = await a.design.del([path]);
        ok = Array.isArray(failed) && !failed.length;
      } else if (a.files) {
        via = "files-panel";
        ok = !!(await a.files({ kind: "delete", items: [{ path, isFolder: true }] }));
      }
    } catch (_) {
      ok = false;
    }
    if (!via) return { ok: false, via: null };
    let gone = false;
    try {
      gone = !(await window.electronAPI.sourceEditor.readSourceFileIfExists(ws.path, `${path}${CANVAS_ENTRY}`));
    } catch (_) {}
    return { ok: ok && gone, via };
  }

  function toast(text) {
    let host = document.querySelector(".rcq-toasts");
    if (!host) {
      host = el("div", "rcq-toasts");
      host.setAttribute("role", "status");
      host.setAttribute("aria-live", "polite");
      document.body.append(host);
    }
    const t = el("div", "rcq-toast", text);
    t.dataset.testid = "rcq-toast";
    host.append(t);
    while (host.childElementCount > 3) host.firstElementChild.remove();
    setTimeout(() => {
      t.classList.add("rcq-toast-out");
      setTimeout(() => {
        t.remove();
        if (!host.childElementCount) host.remove();
      }, 200);
    }, 3500);
  }

  // One canvas: deleted when New canvas made it, it was never edited and it is
  // not in use; else why not.
  async function tryDelete(wsId, path, reason, minAge) {
    const key = normPath(path);
    const res = { path: key, reason };
    if (!cleanupOn()) return { ...res, skipped: "off" };
    if (cu.busy.has(key)) return { ...res, skipped: "busy" };
    const st = wsState();
    const ws = st && selectedWs(st);
    if (!ws || ws.id !== wsId) return { ...res, skipped: "other-workspace" };
    if (ws.hostMachineId != null) return { ...res, skipped: "remote-workspace" };
    const made = madeEntry(ws, key);
    if (!made) return { ...res, skipped: "not-made-here" };
    if (!resolveCanvasPath(key, st, ws)) {
      // gone (deleted elsewhere, renamed): forgotten; a new folder the app's file
      // list does not show yet stays a candidate
      let there = true;
      try {
        there = !!(await window.electronAPI.sourceEditor.readSourceFileIfExists(ws.path, `${key}${CANVAS_ENTRY}`));
      } catch (_) {}
      if (!there) forgetMade(ws, key);
      return { ...res, skipped: "not-a-canvas-folder" };
    }
    if (made.mtime == null) return { ...res, skipped: "mtime-unknown" };
    if (inUse(st, ws, key)) return { ...res, skipped: "in-use" };
    if (isClaimed(key)) return { ...res, skipped: "just-opened" };
    cu.busy.add(key);
    try {
      const d = dataFor(ws);
      const chk = await emptyCheck(ws, key, d);
      if (!chk.empty) {
        if (["other-files", "has-content", "local-data", "comments"].includes(chk.why)) forgetMade(ws, key); // edited: kept for good
        return { ...res, skipped: chk.why };
      }
      if (chk.mtime !== made.mtime) {
        forgetMade(ws, key);
        return { ...res, skipped: "edited" };
      }
      if (minAge && Date.now() - chk.mtime < minAge) return { ...res, skipped: "recently-edited" };
      // last look right before the delete: same workspace, still unused, file unchanged
      const st2 = wsState();
      const ws2 = st2 && selectedWs(st2);
      if (!cleanupOn() || !ws2 || ws2.id !== wsId || inUse(st2, ws2, key) || isClaimed(key)) return { ...res, skipped: "changed" };
      let again = null;
      try {
        again = await window.electronAPI.sourceEditor.readSourceFileIfExists(ws2.path, `${key}${CANVAS_ENTRY}`);
      } catch (_) {}
      if (!again || again.content !== chk.content || Number(again.mtime) !== chk.mtime) return { ...res, skipped: "changed" };
      const item = d && Array.isArray(d.items) ? d.items.find((c) => samePath(c.canvasPath, key)) : null;
      const name = (item && item.canvasName) || baseName(key);
      const del = await appDeleteCanvas(ws2, key);
      if (!del.ok) {
        console.warn("[canvas-quick] empty canvas not deleted", { name, path: key, via: del.via });
        return { ...res, skipped: del.via ? "delete-failed" : "no-app-delete" };
      }
      forgetMade(ws2, key);
      patchIndexRemove(key, ctxKey(ws2));
      const entry = { name, path: key, workspace: ws2.path, via: del.via, reason, at: Date.now() };
      cu.deleted.push(entry);
      console.info(`[canvas-quick] Deleted empty canvas ${name} (${key}) in ${ws2.path}`, entry);
      toast(`Deleted empty canvas ${name}`);
      if (sw.node) renderSwitch();
      return { ...res, deleted: true, name, via: del.via };
    } finally {
      cu.busy.delete(key);
    }
  }

  function scheduleLeft(wsId, path) {
    const k = `${wsId}::${normPath(path)}`;
    clearTimeout(cu.timers.get(k));
    cu.timers.set(
      k,
      setTimeout(() => {
        cu.timers.delete(k);
        tryDelete(wsId, path, "left-use").then((r) => (cu.last = r));
      }, LEAVE_DELAY_MS)
    );
  }

  // The selected workspace's canvases made by New canvas, one at a time.
  function sweep() {
    if (cu.sweeping) return cu.sweeping;
    const st = wsState();
    const ws = st && selectedWs(st);
    if (!ws || !cleanupOn()) return Promise.resolve([]);
    cu.lastSweep.set(ws.id, Date.now());
    cu.sweeping = (async () => {
      const st2 = wsState();
      const ws2 = st2 && selectedWs(st2);
      if (!ws2 || ws2.id !== ws.id) return [];
      const pre = `${normPath(ws2.path)}::`;
      const paths = Object.keys(madeAll())
        .filter((k) => k.startsWith(pre))
        .map((k) => k.slice(pre.length));
      const out = [];
      for (const p of paths) out.push(await tryDelete(ws2.id, p, "sweep", SWEEP_MIN_AGE_MS));
      cu.lastSweepResult = out;
      return out;
    })().finally(() => {
      cu.sweeping = null;
    });
    return cu.sweeping;
  }

  function watchUse() {
    if (!cleanupOn()) {
      cu.prev.clear();
      return;
    }
    const st = wsState();
    const ws = st && selectedWs(st);
    if (!ws) return;
    const now = canvasesInUse(st, ws);
    // a claim only bridges "open requested" -> "tab on screen"
    for (const k of Array.from(claimed.keys())) if (now.some((x) => samePath(x, k))) claimed.delete(k);
    const prev = cu.prev.get(ws.id);
    cu.prev.set(ws.id, now);
    if (prev) for (const p of prev) if (!now.some((x) => samePath(x, p))) scheduleLeft(ws.id, p);
    const last = cu.lastSweep.get(ws.id);
    if (Date.now() - cu.startedAt >= SWEEP_START_MS && (!last || Date.now() - last >= SWEEP_EVERY_MS)) sweep();
  }

  function startCleanup() {
    if (cu.poll) return;
    cu.poll = setInterval(() => {
      try {
        watchUse();
      } catch (e) {
        console.warn("[canvas-quick] cleanup watch failed", e);
      }
    }, USE_POLL_MS);
  }

  // ------------------------------------------------- left rail: visual order
  // canvas-quick.css reorders the rail with flex `order` (chat, design, docs,
  // issues, agents) without moving React nodes. These helpers make Ctrl+1…9,
  // the Ctrl-held number hints and Tab follow that visual order. The app's own
  // Ctrl+N listener (window, bubble) maps by its item array, so ours runs in the
  // capture phase, stops the event and clicks the visual Nth button: the same
  // action as a mouse click, and only one navigation.
  const RAIL = '[data-testid="workspace-navbar"]';
  const RAIL_ITEMS = ["chat", "docs", "design", "issues", "agents"]
    .map((id) => `[data-testid="workspace-navbar-${id}-button"]`)
    .join(",");

  // Rail buttons in visual order: computed `order` first, then DOM order.
  function railButtons() {
    const rail = document.querySelector(RAIL);
    if (!rail) return [];
    return Array.from(rail.querySelectorAll(RAIL_ITEMS))
      .map((b, i) => ({ b, i, o: parseInt(getComputedStyle(b).order, 10) || 0 }))
      .sort((x, y) => x.o - y.o || x.i - y.i)
      .map((x) => x.b);
  }

  // Number hints: rewrite the hint's existing text node in place (no node is
  // added or removed), so React keeps owning it.
  function syncRailHints() {
    railButtons().forEach((b, i) => {
      const want = i < 9 ? String(i + 1) : "";
      for (const h of b.querySelectorAll('div[aria-hidden="true"]')) {
        const t = h.firstChild;
        if (!t || t.nodeType !== 3 || h.childNodes.length !== 1 || !/^\d$/.test(t.nodeValue)) continue;
        if (t.nodeValue !== want) t.nodeValue = want;
      }
    });
  }

  // Ctrl+N (same modifier rules as the app) and Tab/Shift+Tab inside the rail.
  function onRailKey(e) {
    if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const list = railButtons();
      const i = list.indexOf(document.activeElement);
      if (i < 0) return false;
      const next = list[i + (e.shiftKey ? -1 : 1)];
      if (!next) return false; // leaving the group: the default order is already right
      e.preventDefault();
      e.stopImmediatePropagation();
      next.focus();
      return true;
    }
    if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > 9) return false;
    const target = railButtons()[n - 1];
    if (!target) return false;
    e.preventDefault();
    e.stopImmediatePropagation();
    target.click();
    return true;
  }

  // keyboard: → on the highlighted "Open" opens the submenu; ↑↓ Enter ← Esc
  // navigate it. Focus stays in the app's menu (virtual navigation), so the
  // menu does not close.
  function onKey(e) {
    if (onConfirmKey(e)) return;
    if (onSwitchKey(e)) return;
    if (onRailKey(e)) return;
    if (onPlusCanvasKey(e)) return;
    const menu = document.querySelector(MENU);
    if (!menu) return;
    const item = menu.querySelector(OPEN_ITEM);
    if (!sub.node) {
      if (e.key === "ArrowRight" && item && item.hasAttribute("data-highlighted")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openSub(item);
        sub.active = 0;
        paintSubActive();
      }
      return;
    }
    const n = sub.rows.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopImmediatePropagation();
      sub.active = sub.active < 0 ? 0 : (sub.active + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
      paintSubActive();
    } else if (e.key === "Enter" && sub.active >= 0 && sub.rows[sub.active]) {
      e.preventDefault();
      e.stopImmediatePropagation();
      sub.rows[sub.active]();
    } else if (e.key === "ArrowLeft" || e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeSub();
    }
  }

  // ----------------------------------------- right sidebar toggle in the canvas
  // pen.dev pattern, for every visible canvas (Design route, chat canvas tabs,
  // pane-dock panes). The right-sidebar toggle lives neither in the window
  // title bar nor in the zoom/Share toolbar:
  //   - panel open: at the right end of the panel's tab row (Design / Chat /
  //     Artifacts / Comments), right under the zoom/Share header;
  //   - panel closed: a floating pill right under the "Canvas controls"
  //     toolbar, right-aligned: the canvas name (unless the canvas's own name
  //     pill is on screen), then the toggle.
  // The mirror button clicks the canvas's native toggle, which stays hidden:
  //   - Design route main canvas: the title-bar rail ([data-testid=
  //     "right-panel-rail"], "Open / Collapse right sidebar"), hidden while
  //     html[data-rcq-rail-moved] is set and only when it holds those labels;
  //   - embedded / docked canvases: their own "Open right sidebar" (zoom
  //     toolbar) and "Collapse right panel" (panel header), hidden while the
  //     shell carries data-rcq-rail-shell.
  // No host found: no attribute, so the native toggles stay visible (never a
  // canvas without a toggle).
  const NATIVE_RAIL = '[data-testid="right-panel-rail"]';
  const OPEN_LABEL = "Open right sidebar";
  const CLOSE_LABEL = "Collapse right sidebar";
  const RAIL_TOGGLE = `button[aria-label="${OPEN_LABEL}"], button[aria-label="${CLOSE_LABEL}"]`;
  const CANVAS_SHELL = "[data-canvas-shell]";
  const CANVAS_CONTROLS = '[role="toolbar"][aria-label="Canvas controls"]';
  const CANVAS_RIGHT_PANEL = '[data-testid="canvas-right-panel"]';
  const RAIL_ID = "rcq-right-rail";
  const RAIL_ATTR = "data-rcq-rail-moved";
  const SHELL_ATTR = "data-rcq-rail-shell";
  const RAIL_BTN = "rcq-rail-btn";
  const OWN_OPEN = `button[aria-label="${OPEN_LABEL}"]:not(.${RAIL_BTN})`;
  const OWN_CLOSE = 'button[aria-label="Collapse right panel"]';
  const railSig = new WeakMap(); // mirror node -> last rendered state
  let railRefocus = null;

  function titleRailToggle() {
    const box = document.querySelector(NATIVE_RAIL);
    return box ? box.querySelector(RAIL_TOGGLE) : null;
  }

  // One canvas shell: open = its right panel is mounted (the app renders it
  // only while open); the native toggle (its own, else the title-bar rail's);
  // the host of the mirror (the panel's tab row, or the zoom/Share toolbar
  // that anchors the pill).
  function shellState(shell) {
    const panel = shell.querySelector(CANVAS_RIGHT_PANEL);
    const bar = panel ? null : shell.querySelector(CANVAS_CONTROLS);
    if (!panel && !bar) return null;
    const own = panel ? panel.querySelector(`.h-11 ${OWN_CLOSE}`) : bar.querySelector(OWN_OPEN);
    const toggle = own || titleRailToggle();
    if (!toggle) return null;
    let host = bar;
    if (panel) {
      const list = panel.querySelector('[role="tablist"]');
      host = list && list.closest(".min-h-11");
      if (!host || !panel.contains(host)) return null;
    }
    return { open: !!panel, toggle, viaTitle: !own, host, bar, shell };
  }

  // The canvas name for the pill: the floating toolbar's own component props
  // (the bundle's canvas top toolbar receives pageName next to panelApi). Left
  // out while the canvas's own "Canvas page" pill (top left, the name) is on
  // screen, so the name never shows twice: the pill is then just the toggle.
  function pageNameShown(shell) {
    // any visible one: the app's pill, or canvas-chrome's file pill (the app's
    // is then hidden)
    return Array.from(shell.querySelectorAll(PILL)).some((p) => p.getClientRects().length > 0 && !!p.querySelector(PILL_NAME));
  }
  function canvasName(bar) {
    let f = fiberOf(bar);
    for (let i = 0; f && i < 12; i++, f = f.return) {
      const p = f.memoizedProps;
      if (p && p.panelApi && typeof p.pageName === "string") return p.pageName.trim();
    }
    return "";
  }

  // Rebuilt only when its state changes (open, name, native icon).
  function renderRail(node, st) {
    const name = st.open || pageNameShown(st.shell) ? "" : canvasName(st.bar);
    const svg = st.toggle.querySelector("svg");
    const sig = `${st.open}|${name}|${svg ? svg.outerHTML : ""}`;
    if (railSig.get(node) === sig && node.childElementCount) return;
    railSig.set(node, sig);
    const label = st.open ? CLOSE_LABEL : OPEN_LABEL;
    const kids = [];
    if (name) {
      const s = el("span", "rcq-rail-name", name);
      s.title = name;
      kids.push(s);
    }
    const b = el("button", RAIL_BTN);
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.setAttribute("aria-pressed", String(st.open));
    b.dataset.rcqTip = label;
    if (svg) b.append(svg.cloneNode(true));
    kids.push(b);
    node.classList.toggle("rcq-rail-pill", !st.open);
    node.replaceChildren(...kids);
  }

  function onRailClick(e) {
    const b = e.target instanceof Element ? e.target.closest(`.${RAIL_BTN}`) : null;
    if (!b) return;
    e.stopPropagation(); // the native toggle's click is the one React sees
    const shell = b.closest(CANVAS_SHELL);
    const st = shell && shellState(shell);
    if (!st) return;
    railRefocus = { shell, open: st.open, at: Date.now(), had: document.activeElement === b };
    st.toggle.click();
  }

  // Idempotent per tick: exactly one mirror per visible canvas, last child of
  // its host. React re-renders that drop it (the panel unmounts on close, the
  // toolbar on open) get it back in the new host on the next tick.
  function syncRail() {
    const keep = new Set();
    let viaTitle = false;
    for (const shell of document.querySelectorAll(CANVAS_SHELL)) {
      const st = shell.getClientRects().length ? shellState(shell) : null;
      if (!st) {
        if (shell.hasAttribute(SHELL_ATTR)) shell.removeAttribute(SHELL_ATTR);
        continue;
      }
      let node = shell.querySelector(`[data-testid="${RAIL_ID}"]`);
      if (!node) {
        node = el("div", "rcq-rail");
        node.dataset.testid = RAIL_ID;
        node.setAttribute("role", "group");
        node.setAttribute("aria-label", "Right sidebar");
        node.addEventListener("click", onRailClick);
      }
      renderRail(node, st);
      if (node.parentElement !== st.host || st.host.lastElementChild !== node) st.host.append(node);
      keep.add(node);
      if (!shell.hasAttribute(SHELL_ATTR)) shell.setAttribute(SHELL_ATTR, "");
      if (st.viaTitle) viaTitle = true;
      // keyboard: the toggle keeps focus across open/close (it changes host)
      const rf = railRefocus;
      if (rf && rf.shell === shell && rf.open !== st.open) {
        railRefocus = null;
        const a = document.activeElement;
        if (rf.had && Date.now() - rf.at < 1500 && (!a || a === document.body)) node.querySelector(`.${RAIL_BTN}`).focus({ preventScroll: true });
      }
    }
    for (const n of document.querySelectorAll(`[data-testid="${RAIL_ID}"]`)) if (!keep.has(n)) n.remove();
    const root = document.documentElement;
    if (viaTitle !== root.hasAttribute(RAIL_ATTR)) root.toggleAttribute(RAIL_ATTR, viaTitle);
    if (railRefocus && Date.now() - railRefocus.at > 1500) railRefocus = null;
  }

  // ------------------------------------------ left panel toggle in the canvas
  // pen.dev pattern: the canvas's left panel (pages / layers, [data-testid=
  // "canvas-design-sidebar"]) gets one round 40px button floating at the top
  // left of the canvas view, outside any pill: right of the panel's edge
  // while it is open, at the canvas's left edge while it is closed (the
  // "Canvas page" pill then shifts to its right, CSS). Every visible canvas
  // with a left panel gets exactly one: Design route, chat canvas tabs,
  // pane-dock panes. It lives in the canvas top toolbar's own layer (absolute,
  // top of the canvas view, pointer-events: none), so it follows the panel's
  // edge and width with no measuring.
  // Click: the canvas's own panelApi.toggleLeftPanel (props of the top toolbar
  // component, the callback its native buttons call), else a native left
  // toggle of that shell. While the shell carries data-rcq-ltog-shell, the
  // in-canvas natives are hidden (CSS): "Open left sidebar" (Canvas page
  // pill), "Collapse left panel" (panel header), "Hide sidebar" (Layers
  // header). The title bar's "Toggle left panel" stays: off the Design route
  // it is the app sidebar's toggle. No toolbar layer or no way to toggle: no
  // button, no attribute, natives kept.
  // With canvas-chrome (pen.dev layout) the panel is its floating card: the
  // same button, still toggling the native panel (so the card), heads the
  // tool rail column right of the card (canvas-chrome.css places it).
  const LEFT_PANEL = '[data-testid="canvas-design-sidebar"]';
  const LTOG_ID = "rcq-left-toggle";
  const LTOG_CLS = "rcq-ltog";
  const LTOG_ATTR = "data-rcq-ltog-shell";
  const LTOG_LABEL = "Toggle layers";
  const LTOG_NATIVE = ["Open left sidebar", "Collapse left panel", "Hide sidebar"].map((l) => `button[aria-label="${l}"]`).join(", ");
  // no shortcut in the tooltip: the app's Cmd/Ctrl+\ toggles both panels, not this one
  const PANEL_LEFT_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-icon="panel-left"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>';
  const ltogOf = new WeakMap(); // shell -> its button (kept across re-renders)
  let ltogRefocus = null;

  function panelApiOf(row) {
    let f = fiberOf(row);
    for (let i = 0; f && i < 4; i++, f = f.return) {
      const api = f.memoizedProps && f.memoizedProps.panelApi;
      if (api && typeof api.toggleLeftPanel === "function") return api;
    }
    return null;
  }

  // The canvas top toolbar's row (two slots: the "Canvas page" pill or an
  // empty div, the "Canvas controls" toolbar or an empty div), whose parent is
  // its absolute layer. Found through a pill when one is on screen, else
  // through the toolbar component's props (both panels open: two empty slots).
  function topRow(shell) {
    // canvas-chrome's file pill is a "Canvas page" toolbar too, but it lives
    // in the layer, not in the row
    const known = shell.querySelector(`${PILL}:not([data-rcc-file]), ${CANVAS_CONTROLS}`);
    if (known) return known.parentElement;
    for (const n of shell.querySelectorAll(".pointer-events-none.absolute > div")) if (panelApiOf(n)) return n;
    return null;
  }

  // open = the panel takes width (collapsed, the app leaves a w-0 box).
  function leftState(shell) {
    const side = shell.querySelector(LEFT_PANEL);
    if (!side) return null;
    const row = topRow(shell);
    const layer = row && row.parentElement;
    if (!layer || layer === shell || !shell.contains(layer)) return null;
    const api = panelApiOf(row);
    const native = api ? null : shell.querySelector(LTOG_NATIVE);
    if (!api && !native) return null;
    return { open: side.getBoundingClientRect().width > 1, layer, api, native };
  }

  function makeLeftToggle() {
    const b = el("button", LTOG_CLS);
    b.type = "button";
    b.dataset.testid = LTOG_ID;
    b.setAttribute("aria-label", LTOG_LABEL);
    b.dataset.rcqTip = LTOG_LABEL;
    b.innerHTML = PANEL_LEFT_SVG;
    b.addEventListener("click", onLeftToggleClick);
    // the canvas view's own handlers never see presses on the button
    for (const t of ["pointerdown", "mousedown", "dblclick"]) b.addEventListener(t, (e) => e.stopPropagation());
    return b;
  }

  function onLeftToggleClick(e) {
    const b = e.currentTarget;
    e.stopPropagation();
    const shell = b.closest(CANVAS_SHELL);
    const st = shell && leftState(shell);
    if (!st) return;
    b.classList.remove("rcq-ltog-pop");
    void b.offsetWidth; // restart the press animation
    b.classList.add("rcq-ltog-pop");
    ltogRefocus = document.activeElement === b ? { b, at: Date.now() } : null;
    if (st.api) st.api.toggleLeftPanel();
    else st.native.click();
  }

  // Idempotent per tick: one button per visible canvas with a left panel, in
  // its toolbar layer; aria-pressed follows the panel.
  function syncLeftToggle() {
    const keep = new Set();
    for (const shell of document.querySelectorAll(CANVAS_SHELL)) {
      const st = shell.getClientRects().length ? leftState(shell) : null;
      if (!st) {
        if (shell.hasAttribute(LTOG_ATTR)) shell.removeAttribute(LTOG_ATTR);
        continue;
      }
      let b = ltogOf.get(shell);
      if (!b) ltogOf.set(shell, (b = makeLeftToggle()));
      if (b.parentElement !== st.layer) st.layer.append(b);
      const pressed = String(st.open);
      if (b.getAttribute("aria-pressed") !== pressed) b.setAttribute("aria-pressed", pressed);
      keep.add(b);
      if (!shell.hasAttribute(LTOG_ATTR)) shell.setAttribute(LTOG_ATTR, "");
      // keyboard: a re-render that dropped the layer took the focus with it
      const rf = ltogRefocus;
      if (rf && rf.b === b) {
        const a = document.activeElement;
        if (a !== b && (!a || a === document.body) && Date.now() - rf.at < 1500) b.focus({ preventScroll: true });
      }
    }
    for (const n of document.querySelectorAll(`[data-testid="${LTOG_ID}"]`)) if (!keep.has(n)) n.remove();
    if (ltogRefocus && Date.now() - ltogRefocus.at > 1500) ltogRefocus = null;
  }

  // -------------------------------------------------------------------- mount
  let scheduled = false;
  function tick() {
    scheduled = false;
    syncRailHints();
    syncPills();
    syncRail();
    syncLeftToggle();
    const menu = document.querySelector(MENU);
    if (menu) {
      decorateMenu(menu);
      wireMenu(menu);
    } else if (sub.node) closeSub();
  }
  const mo = new MutationObserver((records) => {
    // "+" menu order and labels: now (microtask after React's commit, before
    // paint), not on the next frame, so the app's order is never on screen.
    if (records.some((r) => r.addedNodes.length)) {
      const menu = document.querySelector(MENU);
      if (menu) decorateMenu(menu);
    }
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(tick);
  });

  function init() {
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("mousedown", onDocMouseDown, true);
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("click", onPlusCanvasClick, true);
    startCleanup();
    tick();
  }

  // compatibility mousedown from the trigger: same isolation as pointerdown
  function onDocMouseDown(e) {
    if (triggerPill(e.target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  window.__RE_TEMPO_CANVAS_QUICK__ = {
    state,
    load,
    open: openCanvas,
    newCanvas,
    cleanup: {
      state: cu,
      made: madeAll,
      enabled: cleanupOn,
      sweep,
      check: (path) => {
        const st = wsState();
        const ws = st && selectedWs(st);
        return ws ? tryDelete(ws.id, path, "manual") : Promise.resolve({ skipped: "no-workspace" });
      },
      emptyCheck: (path) => {
        const st = wsState();
        const ws = st && selectedWs(st);
        return emptyCheck(ws, path, ws ? dataFor(ws) : null);
      },
      inUse: () => {
        const st = wsState();
        const ws = st && selectedWs(st);
        return st && ws ? canvasesInUse(st, ws) : [];
      },
      isScaffold,
    },
    openViaHiddenModal,
    findAppOpenCanvas,
    railButtons,
    rightRail: {
      sync: syncRail,
      shellState,
    },
    leftToggle: {
      sync: syncLeftToggle,
      leftState,
    },
    switcher: {
      PILL,
      get node() {
        return sw.node;
      },
      get pill() {
        return sw.pill;
      },
      open: (pill) => {
        const all = Array.from(document.querySelectorAll(PILL)).filter((x) => x.closest(PILL_SCOPE));
        const p = pill || all.find((x) => x.getClientRects().length > 0) || all[0];
        if (p) openSwitch(p, false);
        return !!p;
      },
      close: () => closeSwitch(false),
      model: (pill) => {
        const p = pill || sw.pill || document.querySelector(`${PILL_SCOPE} ${PILL}`);
        return p ? switchModel(p) : null;
      },
      sync: syncPills,
      wsState,
      pqState,
      pillTab: (pill) => pillTab(pill, wsState(pill)),
      resolveCanvasPath: (raw) => {
        const st = wsState();
        return resolveCanvasPath(raw, st, st && st.workspaces.find((w) => w && w.id === st.selectedWorkspaceId));
      },
      appCanvasActions,
      openMore: (i) => openMore(i, false),
    },
  };

  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init, { once: true });
})();
