/*
 * RE-TEMPO · project-sidebar (user MOD layer)
 * ---------------------------------------------------------------------------
 * One project-oriented sidebar in place of the left rail and the five route
 * sidebars (chat, docs, design, issues, agents):
 *
 *   Search · Issues board · Agents · Docs
 *   PROJECTS
 *   ▾ Project                      click: its canvases (design home, that project)
 *       Branches > branch > tabs   what that workspace has open (chats,
 *                                  canvases, terminals, docs...), the same
 *                                  rows whatever branch you are on (openOf);
 *                                  click: that tab (chat route)
 *       Canvases                   click: opens the canvas (design route)
 *       Docs / Issues / Agents     linked to the project (Convex artifact links)
 *   ORGANIZATION                   docs, issues and agents with no project link
 *
 * Every click runs the app's own navigation, never a re-implementation:
 *   - routes: the hidden rail button (same click), else setActiveNavRoute;
 *   - chat: selectWorkspaceChat(ws, chat), branch: switchToWorkspace(ws);
 *   - project: design route + the canvas sidebar's onSelectionChange({kind:"all",
 *     projectId}) (the same call as clicking the project row there);
 *   - canvas: the design home's onOpenCanvas(name, path, ws), else the store's
 *     selectWorkspace + openDesignTab (what the design tab bar does);
 *   - doc / issue: route + the store's openDocCallback / openIssueCallback (the
 *     app's own helpers), else window.__tempoDocs / __tempoIssues;
 *   - agent: __AGENTS_ROUTE_STORE__.openAgent(id) + agents route;
 *   - ⌘-click on a doc, issue or agent opens it as a tab beside the chat.
 * Layout: rail | this sidebar | workspace. The rail keeps its footer (usage,
 * bug report, help, settings, avatar); only its five route buttons hide. The
 * native route sidebars (chat, agents, docs, issues, design home) are hidden
 * with display:none by default, so they stay mounted and keep working; opt out
 * with localStorage "rtd.projectSidebar.hideNative" = "off".
 *
 * Data: the workspaces store (zustand getState found in hook deps, as pane-dock
 * does), window.__sourceRepoDataStoreDebug (local canvases, project ->
 * orgProjectId) and read-only Convex queries through the app's logged-in client:
 * docs:getDocsTree, artifact_links:getLinksForDoc, issues:getBoard,
 * issues:getIssues, artifact_links:getBranchIssueLinksForOrg,
 * agents:listAgentsInOrg, sourceRepo:getProjectCanvases. No mutation is called.
 *
 * Collapse: follows the app's "Toggle left panel" button (title bar) and ⌘B.
 * Always on: the only sidebar (no switch, no other modes; an old "off" flag
 * or "prev" skin is cleared on boot). ⌘⇧E (Ctrl+Shift+E) focuses its search.
 * Introspection: window.__RE_TEMPO_PROJECT_SIDEBAR__.
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (window.__RE_TEMPO_PROJECT_SIDEBAR__) return; // double injection

  // ------------------------------------------------------------------ boot
  // The native rail and left panel used to show until the first tick placed
  // this sidebar (~200 ms after the shell, on the 300 ms poll): they flashed on
  // every launch. Now the layout this sidebar ends with holds from the first
  // frame: this script runs while index.html is parsed, before the app renders,
  // and puts html.rtps-boot (CSS: the rail out of the shell's grid, the
  // workspace pushed by the sidebar's width; rtps-boot-collapsed when it was
  // collapsed last time: no push) and html.rtps-boot-native (the native route
  // sidebars hidden, unless opted out). The first tick that decides the layout
  // hands over to the regular classes in the same frame and drops them. A push
  // the layout refuses drops them at once; no store, no shell or a signed-out
  // screen drops them after BOOT_MS: the native layout comes back.
  const BOOT_KEY = "rtd.projectSidebar.boot"; // the last decided state: "placed" | "collapsed"
  const BOOT_MS = 8000;
  const BOOT_CLASSES = ["rtps-boot", "rtps-boot-collapsed", "rtps-boot-native"];
  let booting = false;
  let bootEnd = null; // { why, at } once the boot classes are gone
  (() => {
    let last = null;
    let keepNative = false;
    try {
      last = localStorage.getItem(BOOT_KEY);
      keepNative = localStorage.getItem("rtd.projectSidebar.hideNative") === "off";
    } catch (_) {}
    const cl = document.documentElement.classList;
    cl.add(last === "collapsed" ? "rtps-boot-collapsed" : "rtps-boot");
    if (!keepNative) cl.add("rtps-boot-native");
    booting = true;
    setTimeout(() => endBoot("timeout"), BOOT_MS);
  })();
  function endBoot(why) {
    if (!booting) return;
    booting = false;
    bootEnd = { why, at: Math.round(performance.now()) };
    for (const c of BOOT_CLASSES) document.documentElement.classList.remove(c);
  }

  // ---------------------------------------------------------------- config
  const FLAG_KEY = "rtd.projectSidebar"; // "off" = native layout
  const EXP_KEY = "rtd.projectSidebar.expanded.v2";
  const ORG_KEY = "tempo:activeOrgId";
  const ORDER_PREFIX = "tempo:project-order:v1:";
  const WIDTH = 264;
  const POLL_MS = 300;
  const OVERLAY_MS = 2000;
  const REMOTE_TTL_MS = 60000;
  const DOC_LINK_TTL_MS = 10 * 60000;
  const DOC_LINK_MAX = 150;
  const LINK_CONCURRENCY = 6;
  const CONVEX_FN = Symbol.for("functionName");
  const QUERY_TIMEOUT_MS = 6000;
  const HIDDEN = "data-rtps-hidden";
  const RAIL_ATTR = "data-rtps-rail"; // legacy marker, only removed
  const PUSH_ATTR = "data-rtps-push";
  const HIDE_NATIVE_KEY = "rtd.projectSidebar.hideNative"; // "off" keeps the route sidebars
  const RAIL = '[data-testid="workspace-navbar"]';
  // Native route sidebars (mapped in the bundle): chat and agents render theirs
  // in the shell's left panel (only those two routes show it); docs, issues and
  // the design home keep theirs inside the center. The canvas editor's own panel
  // (canvas-design-sidebar: pages, layers, files, assets) is a tool, not a route
  // sidebar, and stays.
  const SEL = {
    leftPanel: '[data-tempo-workspace-panel="left"]',
    native: ['[data-testid="docs-view-sidebar"]', '[data-testid="issues-sidebar"]', '[data-testid="canvas-sidebar"]'],
    home: '[data-testid="canvas-homepage"]',
    canvasSidebar: '[data-testid="canvas-sidebar"]',
    designBar: '[data-testid="design-view-tab-bar"]',
    projectRow: '[data-testid="project-sidebar-item"]',
  };
  const IS_MAC = /Mac/i.test(navigator.platform || navigator.userAgent || "");

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
  // Only this sidebar exists (no switch, no other modes): an old "off" flag or
  // "prev" skin is cleared on boot (migrateModes); enabled() stays for callers.
  const enabled = () => true;

  // ------------------------------------------------------------- app stores
  // Same mechanism as pane-dock: zustand leaves getState in the deps of
  // useSyncExternalStoreWithSelector's useMemo; only pure `()=>x` getters are called.
  const S = { ws: null, client: null, phase: null, pq: null };
  const GETTER_RE = /^\(\)=>[A-Za-z$_][\w$]*$/;
  const tried = new WeakSet();
  const isClient = (o) => !!o && typeof o === "object" && typeof o.query === "function" && typeof o.watchQuery === "function";

  function checkFiber(f) {
    const p = f.memoizedProps;
    if (!S.client && p && typeof p === "object") {
      if (isClient(p.client)) S.client = p.client;
      else if (isClient(p.value)) S.client = p.value;
    }
    if (S.ws && S.phase && S.pq) return;
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
      if (!st || typeof st !== "object") continue;
      if (!S.ws && Array.isArray(st.workspaces) && typeof st.setActiveNavRoute === "function") S.ws = gs;
      else if (!S.phase && st.phaseStateByKey && typeof st.phaseStateByKey === "object") S.phase = gs;
      else if (!S.pq && typeof st.moveToPopup === "function" && "activeByPopup" in st) S.pq = gs;
    }
  }

  const fiberOf = (n) => {
    const k = n && Object.keys(n).find((x) => x.startsWith("__reactFiber$"));
    return k ? n[k] : null;
  };
  // Props of the closest fiber (walking up from a DOM node) that passes `test`.
  function propsUp(node, test, max = 30) {
    for (let f = fiberOf(node), i = 0; f && i < max; f = f.return, i++) {
      const p = f.memoizedProps;
      if (p && typeof p === "object" && test(p)) return p;
    }
    return null;
  }

  // 1) walk up from the rail (the shell component reads the store); 2) otherwise a
  //    full tree scan, time-sliced and resumed across ticks (also finds the client).
  // The chat phase store and the popout store are only subscribed while some
  // chat view / popout is mounted, so a missing one is looked up again every 10 s.
  let scan = null;
  let lastScanEnd = -1e9;
  const allFound = () => !!(S.ws && S.client && S.phase && S.pq);
  function discover() {
    if (allFound()) return true;
    if (!S.ws) {
      for (let f = fiberOf(document.querySelector(RAIL)), up = 0; f && up < 600 && !S.ws; f = f.return, up++) checkFiber(f);
    }
    if (allFound()) return true;
    if (!scan) {
      if (performance.now() - lastScanEnd < (S.ws && S.client ? 10000 : 2000)) return !!S.ws;
      const root = document.getElementById("root");
      const key = root && Object.keys(root).find((k) => k.startsWith("__reactContainer$"));
      if (!key) return !!S.ws;
      scan = { stack: [root[key]], seen: new Set() };
    }
    const deadline = performance.now() + 8;
    while (scan.stack.length && performance.now() < deadline && !allFound()) {
      const f = scan.stack.pop();
      if (!f || scan.seen.has(f)) continue;
      scan.seen.add(f);
      checkFiber(f);
      if (f.child) scan.stack.push(f.child);
      if (f.sibling) scan.stack.push(f.sibling);
    }
    if (allFound() || !scan.stack.length) {
      scan = null;
      lastScanEnd = performance.now();
    }
    return !!S.ws;
  }
  const W = () => {
    try {
      return S.ws ? S.ws() : null;
    } catch (_) {
      return null;
    }
  };
  const agentsStore = () => {
    const s = window.__AGENTS_ROUTE_STORE__;
    try {
      return s && typeof s.getState === "function" ? s.getState() : null;
    } catch (_) {
      return null;
    }
  };
  const srd = () => window.__sourceRepoDataStoreDebug || null;
  const phases = () => {
    try {
      return (S.phase && S.phase().phaseStateByKey) || null;
    } catch (_) {
      return null;
    }
  };
  const popoutTabs = () => {
    try {
      return (S.pq && S.pq().tabs) || null;
    } catch (_) {
      return null;
    }
  };

  let cliHidden = new Set(); // chat ids in CLI mode (see readCli)
  let cliAt = -1e9;

  // ------------------------------------------------------------ remote data
  const withTimeout = (p, ms) =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  const queryLog = [];
  function query(name, args) {
    if (!S.client) return Promise.reject(new Error("no-client"));
    queryLog.push(name);
    if (queryLog.length > 200) queryLog.shift();
    return withTimeout(Promise.resolve(S.client.query({ [CONVEX_FN]: name }, args)), QUERY_TIMEOUT_MS);
  }
  const listOf = (r, ...keys) => {
    if (Array.isArray(r)) return r;
    for (const k of keys) if (r && Array.isArray(r[k])) return r[k];
    return [];
  };
  function deepCollect(o, key, out = [], depth = 0) {
    if (!o || typeof o !== "object" || depth > 6) return out;
    if (Array.isArray(o)) {
      for (const x of o) deepCollect(x, key, out, depth + 1);
      return out;
    }
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (k === key && (typeof v === "string" || typeof v === "number")) out.push(String(v));
      else if (v && typeof v === "object") deepCollect(v, key, out, depth + 1);
    }
    return out;
  }
  async function pool(items, n, fn) {
    let i = 0;
    const run = async () => {
      while (i < items.length) await fn(items[i++]);
    };
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
  }

  function activeOrgId() {
    const a = window.__tempoIssues && window.__tempoIssues.organizationId;
    if (a) return a;
    const b = window.__tempoDocs && window.__tempoDocs.organizationId;
    if (b) return b;
    const raw = lsGet(ORG_KEY);
    if (!raw) return null;
    try {
      const j = JSON.parse(raw);
      if (typeof j === "string") return j;
      if (j && j.state && j.state.activeOrgId) return j.state.activeOrgId;
      if (j && j.activeOrgId) return j.activeOrgId;
      return null;
    } catch (_) {
      return raw;
    }
  }

  function orgProjectIdFor(p) {
    if (p && p.orgProjectId) return p.orgProjectId;
    const s = srd();
    if (!s || !(s.projectInfo instanceof Map)) return null;
    const direct = s.projectInfo.get(p.id);
    if (direct && direct.ref && direct.ref.orgProjectId) return direct.ref.orgProjectId;
    for (const v of s.projectInfo.values()) {
      const r = v && v.ref;
      if (r && (r.projectId === p.id || (r.aliasProjectIds || []).includes(p.id))) return r.orgProjectId || null;
    }
    return null;
  }

  const R = {
    orgId: null,
    at: 0,
    loading: null,
    version: 0,
    errors: {},
    status: { docs: "idle", docLinks: "idle", issues: "idle", agents: "idle" },
    docs: [],
    docOpids: new Map(), // docId -> { opids:Set, at }
    board: null,
    issues: [],
    issueOpids: new Map(), // issueId -> Map(orgProjectId -> branchName)
    agents: [],
    canvases: new Map(), // orgProjectId -> { at, rows }
  };
  const bump = () => {
    R.version++;
    schedule();
  };

  async function loadDocs(org) {
    try {
      if (!R.docs.length) R.status.docs = "loading";
      const r = await query("docs:getDocsTree", { organizationId: org });
      R.docs = listOf(r, "tree", "docs").filter((d) => d && d._id);
      R.status.docs = "ready";
      bump();
      const now = Date.now();
      const need = R.docs
        .filter((d) => {
          const c = R.docOpids.get(d._id);
          return !c || now - c.at > DOC_LINK_TTL_MS;
        })
        .slice(0, DOC_LINK_MAX);
      if (need.length && R.status.docLinks !== "ready") R.status.docLinks = "loading";
      await pool(need, LINK_CONCURRENCY, async (d) => {
        try {
          const links = await query("artifact_links:getLinksForDoc", { docId: d._id });
          // per link: its project(s) and, when it points at a branch, that branch
          const items = listOf(links, "links", "page");
          const opids = new Set();
          const branches = new Map(); // orgProjectId -> Set(branchName)
          for (const l of items.length ? items : [links]) {
            const br = deepCollect(l, "branchName")[0] || null;
            for (const op of deepCollect(l, "orgProjectId")) {
              opids.add(op);
              if (br) (branches.get(op) || branches.set(op, new Set()).get(op)).add(br);
            }
          }
          R.docOpids.set(d._id, { opids, branches, at: Date.now() });
        } catch (e) {
          R.errors.docLinks = String((e && e.message) || e);
          R.docOpids.set(d._id, { opids: new Set(), at: Date.now() - DOC_LINK_TTL_MS + 60000 });
        }
      });
      R.status.docLinks = "ready";
    } catch (e) {
      R.status.docs = "error";
      R.errors.docs = String((e && e.message) || e);
    }
  }

  async function loadIssues(org) {
    try {
      if (!R.issues.length) R.status.issues = "loading";
      // getBoard is the read query; getOrCreateBoard (a mutation) is never called.
      const board = await query("issues:getBoard", { organizationId: org });
      if (!board || !board._id) {
        R.board = null;
        R.issues = [];
        R.status.issues = "empty";
        return;
      }
      const r = await query("issues:getIssues", { organizationId: org, boardId: board._id });
      R.board = board;
      R.issues = listOf(r, "issues", "page").filter((i) => i && i._id);
      R.status.issues = "ready";
      try {
        const links = await query("artifact_links:getBranchIssueLinksForOrg", { orgId: org });
        const map = new Map();
        for (const l of listOf(links, "links", "page")) {
          const ops = deepCollect(l, "orgProjectId");
          const branch = deepCollect(l, "branchName")[0] || null;
          for (const id of deepCollect(l, "issueId")) {
            const e = map.get(id) || new Map();
            for (const op of ops) if (!e.has(op)) e.set(op, branch);
            map.set(id, e);
          }
        }
        R.issueOpids = map;
      } catch (e) {
        R.errors.issueLinks = String((e && e.message) || e);
      }
    } catch (e) {
      R.status.issues = "error";
      R.errors.issues = String((e && e.message) || e);
    }
  }

  async function loadAgents(org) {
    try {
      if (!R.agents.length) R.status.agents = "loading";
      let r;
      try {
        r = await query("agents:listAgentsInOrg", { organizationId: org });
      } catch (_) {
        r = await query("agents:listMyAgents", { organizationId: org });
      }
      R.agents = listOf(r, "agents", "page").filter((a) => a && a._id);
      R.status.agents = "ready";
    } catch (e) {
      R.status.agents = "error";
      R.errors.agents = String((e && e.message) || e);
    }
  }

  async function loadCanvases() {
    const st = W();
    const now = Date.now();
    const ops = (st && st.projects ? st.projects : []).map(orgProjectIdFor).filter(Boolean);
    await pool(
      ops.filter((op) => {
        const c = R.canvases.get(op);
        return !c || now - c.at > REMOTE_TTL_MS;
      }),
      3,
      async (op) => {
        try {
          const r = await query("sourceRepo:getProjectCanvases", { orgProjectId: op });
          R.canvases.set(op, { at: Date.now(), rows: listOf(r, "canvases") });
        } catch (_) {
          R.canvases.set(op, { at: Date.now(), rows: (R.canvases.get(op) || {}).rows || [] });
        }
      }
    );
  }

  function loadRemote(force) {
    if (R.loading) return R.loading;
    const org = activeOrgId();
    if (!S.client || !org) return Promise.resolve(false);
    if (!force && R.orgId === org && Date.now() - R.at < REMOTE_TTL_MS) return Promise.resolve(false);
    if (R.orgId !== org) {
      R.docs = [];
      R.docOpids = new Map();
      R.issues = [];
      R.issueOpids = new Map();
      R.agents = [];
      R.canvases = new Map();
      R.status = { docs: "idle", docLinks: "idle", issues: "idle", agents: "idle" };
    }
    R.orgId = org;
    R.loading = (async () => {
      await Promise.allSettled([
        loadDocs(org).then(bump),
        loadIssues(org).then(bump),
        loadAgents(org).then(bump),
        loadCanvases().then(bump),
      ]);
      R.at = Date.now();
      return true;
    })().finally(() => {
      R.loading = null;
      bump();
    });
    return R.loading;
  }

  // ------------------------------------------------------------------ model
  const branchLabel = (w) => (w.repo && ((w.repo.currentBranch || "").trim() || w.repo.baseBranch)) || w.name || "workspace";
  const ISSUE_DONE = /^(done|completed|complete|closed|canceled|cancelled|archived|duplicate)$/i;

  function projectOrder() {
    const org = activeOrgId();
    for (const k of [ORDER_PREFIX + (org || "private"), ORDER_PREFIX + "private"]) {
      try {
        const v = JSON.parse(lsGet(k) || "null");
        const arr = Array.isArray(v) ? v : v && Array.isArray(v.order) ? v.order : null;
        if (arr) return arr;
      } catch (_) {}
    }
    return [];
  }

  // Chat status, as the native list decides it: isChatInProgress (its spinner),
  // then the phase store / isAwaitingResponse (needs you), unread, done, draft.
  function chatStatus(st, wsId, t, ph) {
    let busy = false;
    try {
      busy = typeof st.isChatInProgress === "function" && st.isChatInProgress(wsId, t.id) === true;
    } catch (_) {}
    const p = ph && ph[`${wsId}|${t.id}`];
    if (!busy && p && (p.phase === "submitting" || p.phase === "streaming")) busy = true;
    if (busy) return "running";
    if (t.isAwaitingResponse === true || (p && (p.hasPendingAsyncQuestion === true || (p.phase === "waiting_for_input" && p.waitingReason !== "plan"))))
      return "waiting";
    if (t.turnInterrupted && t.turnInterrupted.superseded !== true) return "interrupted";
    return t.sessionId ? "done" : "new";
  }

  // ------------------------------------------------------------------ view
  // The tab bar on screen showing a tab of the selected workspace (its own id in
  // the center and the native split, "chat:<ws>:<id>" / "center:<ws>:<id>" in a
  // pane-dock pane), for the on-screen flash only; null when none shows it.
  function barShowing(ws, id) {
    const st = W();
    if (!st || st.selectedWorkspaceId !== ws || st.activeNavRoute !== "chat") return null;
    const ids = [String(id), `chat:${ws}:${id}`, `center:${ws}:${id}`];
    for (const bar of document.querySelectorAll("[data-tab-bar]")) {
      if (bar.closest('[class*="content-visibility:hidden"],[data-rtps-hidden],[data-rtps-root]')) continue;
      for (const x of ids) {
        const t = bar.querySelector(`[data-tab-id="${CSS.escape(x)}"]`);
        if (t && t.getClientRects().length) return bar;
      }
    }
    return null;
  }
  // The native split ("Open in split view"): the center (bundle: CenterPanel)
  // lays out two sides in a PanelGroup "center-panel-split-group", each a
  // [data-center-panel-pane="left" | "right"] with its own tab bar and view
  // (store: splitPanelMode, left/rightPanelActiveTabId, setPanelActiveTab(side,
  // id), tabs with splitPanelSide). Without the split the right side is still
  // there, collapsed to 0. The side an element is in, while both sides are on
  // screen: { name: "left" | "right", el }; else null.
  function splitSideOf(node) {
    const side = node && node.closest ? node.closest("[data-center-panel-pane]") : null;
    if (!side || side.closest(".rtd-panel")) return null;
    const name = side.getAttribute("data-center-panel-pane");
    if (name !== "left" && name !== "right") return null;
    const host = side.parentElement && (side.parentElement.closest('[data-testid="center-panel"]') || side.parentElement.closest("[data-panel-group], [data-group]"));
    const other = host && host.querySelector(`[data-center-panel-pane="${name === "left" ? "right" : "left"}"]`);
    if (!other) return null;
    const a = side.getBoundingClientRect();
    const o = other.getBoundingClientRect();
    return a.width > 2 && a.height > 2 && o.width > 2 && o.height > 2 ? { name, el: side } : null;
  }
  // Chats moved to a popout window or a pane-dock pane: pq entries
  // {kind:"chat", workspaceId, chatTabId, popup: Window}; popup.name tells which.
  function popoutMap() {
    const m = new Map();
    for (const t of popoutTabs() || []) {
      if (!t || t.kind !== "chat" || !t.workspaceId || !t.chatTabId || !t.popup) continue;
      let name = "";
      try {
        name = String(typeof t.popup === "string" ? t.popup : t.popup.name || "");
      } catch (_) {}
      m.set(`${t.workspaceId}|${t.chatTabId}`, { id: t.id, popup: t.popup, dock: name.startsWith("rtd-dock-") });
    }
    return m;
  }

  // CLI mode is React state of the center component: useState(map of chat id ->
  // bool) in the hook run [state, state, cb([]), cb([]), state(null)], in the
  // component that reads pendingOpenCliRequest from __chatUiStateStoreDebug.
  const isHookObj = (h) => !!h && typeof h === "object" && "memoizedState" in h && "queue" in h && "next" in h;
  const isPlain = (o) => !!o && typeof o === "object" && Object.getPrototypeOf(o) === Object.prototype;
  function probeCli(f) {
    const h3 = window.__chatUiStateStoreDebug;
    const get = h3 && typeof h3.getState === "function" ? h3.getState : null;
    if (!get) return null;
    let reads = false;
    for (let h = f.memoizedState, i = 0; isHookObj(h) && i < 400 && !reads; i++, h = h.next) {
      const ms = h.memoizedState;
      if (Array.isArray(ms) && ms.length === 2 && Array.isArray(ms[1]) && ms[1].length === 4 && ms[1][0] === get && typeof ms[1][2] === "function") {
        try {
          reads = Function.prototype.toString.call(ms[1][2]).includes("pendingOpenCliRequest");
        } catch (_) {}
      }
    }
    if (!reads) return null;
    const isState = (h) => isHookObj(h) && h.queue && typeof h.queue.dispatch === "function" && "lastRenderedState" in h.queue;
    const isCb0 = (h) => isHookObj(h) && Array.isArray(h.memoizedState) && h.memoizedState.length === 2 && typeof h.memoizedState[0] === "function" && Array.isArray(h.memoizedState[1]) && h.memoizedState[1].length === 0;
    for (let h = f.memoizedState, i = 0; isHookObj(h) && i < 400; i++, h = h.next) {
      const b = h.next;
      const c = b && b.next;
      const d = c && c.next;
      const e = d && d.next;
      if (!isState(h) || !isState(b) || !isCb0(c) || !isCb0(d) || !isState(e)) continue;
      if (!isPlain(h.memoizedState) || !isPlain(b.memoizedState) || e.memoizedState !== null) continue;
      if (!Object.values(h.memoizedState).every((v) => typeof v === "boolean")) continue;
      return h.queue;
    }
    return null;
  }
  let cliQueue = null;
  function readCli() {
    if (!cliQueue) {
      for (let f = fiberOf(document.querySelector('[data-testid="center-panel"]')), i = 0; f && i < 120 && !cliQueue; f = f.return, i++) cliQueue = probeCli(f);
    }
    const v = cliQueue && cliQueue.lastRenderedState;
    cliHidden = new Set(isPlain(v) ? Object.keys(v).filter((k) => v[k] === true) : []);
    return Array.from(cliHidden).sort().join(",");
  }

  function chatWhere(t) {
    return cliHidden.has(String(t.id)) ? ["CLI"] : [];
  }
  const chatAt = (t) => (typeof t.createdAt === "number" ? t.createdAt : Number(t.createdAt) || 0);
  // Composer drafts the app keeps per chat ("<workspaceId>-<chatTabId>" -> text).
  function inputDrafts() {
    const d = window.__CHAT_INPUT_DRAFTS_STORE__;
    try {
      const v = d && typeof d.getState === "function" ? d.getState().chatInputDrafts : null;
      return v && typeof v === "object" ? v : null;
    } catch (_) {
      return null;
    }
  }
  // Identity: a chat with a session shows its title; a draft shows what is typed
  // in its composer; an empty draft is "New Chat" + "draft" + its creation time.
  function chatInfo(st, ws, t, ph, drafts) {
    const raw = drafts && drafts[`${ws.id}-${t.id}`];
    const draftText = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
    const title = (typeof t.name === "string" && t.name.trim()) || "New Chat";
    const isDraft = !t.sessionId;
    return {
      id: t.id,
      name: isDraft && draftText && title === "New Chat" ? `“${draftText.slice(0, 80)}”` : title,
      draft: isDraft,
      draftText,
      empty: isDraft && !draftText && title === "New Chat",
      created: chatAt(t),
      unread: t.isUnread === true,
      at: t.sessionId ? chatAt(t) : 0, // drafts show their creation clock instead
      provider: t.provider || null,
      model: t.model || null,
      status: chatStatus(st, ws.id, t, ph),
      where: chatWhere(t),
      owner: t.ownerChatTabId || null,
    };
  }

  // Every chat of the workspace, from workspaces[].centerTabs like the native
  // list: one flat list. A chat never sits inside another chat: a secondary
  // chat (ownerChatTabId) is a sibling of its owner, sorted by the same rule
  // (order, else time); c.owner still names its owner for navigation/archive.
  // The sort is total so mixing chats with and without an order stays stable:
  // ordered chats first by order, then the rest newest first; ties keep the
  // app's own centerTabs order.
  function chatsOf(st, w, ph, drafts) {
    const tabs = w.id === st.selectedWorkspaceId && Array.isArray(st.centerTabs) ? st.centerTabs : Array.isArray(w.centerTabs) ? w.centerTabs : []; // the selected one: the live list
    const live = tabs.filter((t) => t && t.type === "chat" && t.isArchived !== true);
    const hasOrder = (t) => typeof t.order === "number" && isFinite(t.order);
    const out = live
      .slice()
      .sort((a, b) => (hasOrder(b) ? 1 : 0) - (hasOrder(a) ? 1 : 0) || (hasOrder(a) ? a.order - b.order : chatAt(b) - chatAt(a)))
      .map((t) => chatInfo(st, w, t, ph, drafts));
    // Chats that could look alike: the same title twice in a branch gets a
    // number by creation (#1 = oldest; full time in the tooltip); drafts, which
    // have no session time, show their creation time, the shortest stamp that
    // tells them apart (14:05, 14:05:32 where two share a minute, the day when
    // they span days).
    const byName = new Map();
    const draftsAll = [];
    for (const c of out) {
      if (c.draft) draftsAll.push(c);
      else (byName.get(c.name) || byName.set(c.name, []).get(c.name)).push(c);
    }
    for (const group of byName.values()) if (group.length > 1) for (const c of group) c.dup = true;
    if (draftsAll.length) {
      const days = new Set(draftsAll.map((c) => new Date(c.created).toDateString())).size > 1;
      const mins = draftsAll.map((c) => stamp(c.created, false, days));
      draftsAll.forEach((c, i) => {
        c.stamp = mins.indexOf(mins[i]) !== mins.lastIndexOf(mins[i]) && !days ? stamp(c.created, true, false) : mins[i];
      });
    }
    return out;
  }

  // The tabs the dock keeps hidden in a worktree (the comment agent's background
  // chats and the tabs they own: in no deck, never listed): its hiddenTabs(ws);
  // without it, the same rule read from the comment agent's tasks.
  function dockHiddenTabs(wsId) {
    const out = new Set();
    const D = decksApi();
    try {
      if (D && typeof D.hiddenTabs === "function") {
        for (const id of D.hiddenTabs(wsId) || []) if (id != null) out.add(String(id));
        return out;
      }
    } catch (_) {}
    try {
      const A = window.__RE_TEMPO_COMMENT_AGENT__;
      for (const t of (A && typeof A.tasks === "function" && A.tasks()) || []) if (t && t.chatId != null && (!t.workspaceId || t.workspaceId === wsId)) out.add(String(t.chatId));
    } catch (_) {}
    return out;
  }
  // Chats whose tab was closed (tab-close keeps the chat and hides its tab,
  // window.__RE_TEMPO_TAB_CLOSE__.hiddenIn): not open, so not listed. Nothing is
  // archived or deleted: opening the chat by another path (openChatItem reveals
  // its tab) brings it back.
  function closedIds(wsId) {
    try {
      const tc = window.__RE_TEMPO_TAB_CLOSE__;
      const ids = tc && typeof tc.hiddenIn === "function" ? tc.hiddenIn(wsId) : null;
      return new Set((Array.isArray(ids) ? ids : []).map(String));
    } catch (_) {
      return new Set();
    }
  }
  function closedSig() {
    try {
      const tc = window.__RE_TEMPO_TAB_CLOSE__;
      const h = tc && typeof tc.state === "function" ? tc.state().hidden : null;
      return Array.isArray(h) ? h.map((e) => `${e.ws}|${e.tab}`).join(",") : "";
    } catch (_) {
      return "";
    }
  }
  // The label the app's tab bar gives a center tab (bundle Qma).
  function tabTitle(t) {
    const s = (v) => (typeof v === "string" && v.trim() ? v : "");
    switch (t.type) {
      case "chat":
        return s(t.name) || "Chat";
      case "diff":
        return `${s(t.fileName)} (Working Tree)`;
      case "canvas":
        return s(t.pageName) || "Canvas";
      case "file":
        return s(t.fileName) || "File";
      case "prd":
        return s(t.displayTitle) || s(t.fileName).replace(/\.md$/i, "") || "Doc";
      case "mcp":
        return "MCP Servers";
      case "terminal":
        return s(t.title) || "Terminal";
      case "browser":
        return s(t.title) || "Browser";
      case "issue":
        return s(t.issueTitle) || "Issue";
      case "agent":
        return s(t.agentName) || "Agent";
      default:
        return s(t.title) || s(t.name) || s(t.type) || "Tab";
    }
  }

  // The app's own infrastructure terminals, the ones it neither saves nor
  // restores (bundle: ephemeral, "Tempobook", "Canvas devserver"): the output of
  // the server a canvas needs, opened by the app for that canvas, not by you.
  // Listed only once you bring one forward (its tab in front of its bar, or moved
  // into a pane, a split side or a window), and from then on until it closes
  // (this session). The server keeps running either way; the canvas shows its
  // own error and retry when it stops.
  const INFRA_TITLES = new Set(["Tempobook", "Canvas devserver"]);
  const isInfra = (t) => t.type === "terminal" && (t.ephemeral === true || INFRA_TITLES.has(t.title));
  const infraShown = new Map(); // ws id -> ids of its infrastructure terminals brought forward

  // ------------------------------------------------------------- open tabs
  // What a branch card lists: the tabs its workspace has open, nothing else, read
  // from the stores the same way for every workspace (the one you are on or
  // not), so a card never changes with the branch you are on and lists each tab
  // once (by id). Open is what the app shows (bundle CenterPanel, its bar list):
  // the workspace's active primary chat, then the tabs that chat owns and the
  // ones no chat owns, in the store's order (in the native split, the chat and
  // its own tabs, per side). The other primary chats are the chat history, not
  // tabs: they are not listed. Plus each pane-dock pane's tabs and each popout
  // window's tab (a tab in a pane or a window leaves the center's list). With
  // several pane-dock decks each deck lists its own tabs from its own center
  // chat and panes (its stored arrangement while it is not on screen). Never
  // listed: archived chats, a chat whose tab was closed (tab-close; the tabs it
  // owns stay while they are open), the dock's hidden tabs (the comment agent's
  // background chats), the app's infrastructure terminals (isInfra) until you
  // bring one forward. No DOM read and nothing saved: a reload lists the same
  // and brings nothing back.
  // -> [{ deck (the dock's, or null), active, items: [{ kind: "chat" | "panel",
  //      id, visible (in front of its bar), pane, where, chat | type + title }] }]
  function openOf(st, w, chats) {
    const sel = w.id === st.selectedWorkspaceId;
    const src = sel ? st : w;
    const all = (sel && Array.isArray(st.centerTabs) ? st.centerTabs : Array.isArray(w.centerTabs) ? w.centerTabs : []).filter((t) => t && t.id != null && !(t.type === "chat" && t.isArchived === true));
    const byId = new Map(all.map((t) => [String(t.id), t]));
    const chatById = new Map(chats.map((c) => [String(c.id), c]));
    const left = new Set([...closedIds(w.id), ...dockHiddenTabs(w.id)]);
    const isPrimary = (t) => !!t && t.type === "chat" && !t.ownerChatTabId;
    const infra = infraShown.get(String(w.id)) || new Set();
    for (const id of infra) if (!byId.has(id)) infra.delete(id);
    const D = decksApi();
    let decks = [];
    try {
      decks = D ? (D.list(w.id) || []).filter((d) => d && d.id != null) : [];
    } catch (_) {
      decks = [];
    }
    const layouts = decks.some((d) => Array.isArray(d.layout));
    // the popout store: this workspace's tabs in a window (and in dock panes when
    // the dock gives no layout); none of them is in the center
    const moved = new Set();
    const wins = [];
    const pq = S.pq ? (() => { try { return S.pq(); } catch (_) { return null; } })() : null;
    for (const e of (pq && pq.tabs) || []) {
      const m = /^(?:chat|center):([^:]+):(.+)$/.exec(String((e && e.id) || ""));
      if (!m || m[1] !== String(w.id)) continue;
      moved.add(m[2]);
      let name = "";
      try {
        name = String(typeof e.popup === "string" ? e.popup : (e.popup && e.popup.name) || "");
      } catch (_) {}
      const dock = name.startsWith("rtd-dock-");
      if (dock && layouts) continue;
      wins.push({ id: m[2], pane: dock ? name : `win:${name}`, front: !!pq.activeByPopup && pq.activeByPopup[name] === e.id, where: [dock ? "pane" : "window"] });
    }
    const seen = new Set();
    const out = [];
    for (const d of decks.length ? decks : [null]) {
      const active = !d || d.active === true || decks.length === 1;
      const own = d && decks.length > 1 ? new Set((d.tabs || []).map(String)) : null; // several decks: this deck's tabs only
      const items = [];
      const add = (raw, pane, front, where) => {
        const id = String(raw);
        const t = byId.get(id);
        if (!t || seen.has(id) || left.has(id) || (own && !own.has(id))) return;
        if (isInfra(t)) {
          if (!front && !where.length && !infra.has(id)) return;
          infra.add(id);
        }
        seen.add(id);
        const c = chatById.get(id);
        const it = c
          ? { kind: "chat", id, visible: front, pane, where, chat: Object.assign({}, c, { where: where.concat(c.where) }) }
          : { kind: "panel", id, visible: front, pane, where, type: t.type || "tab", title: tabTitle(t) };
        items.push(asAgentItem(it) || it);
      };
      const layout = d && Array.isArray(d.layout) ? d.layout : null;
      const inPanes = new Set();
      if (layout) for (const l of layout) if (l && l.pane !== "main") for (const id of l.tabs || []) inPanes.add(String(id));
      const center = () => {
        let chat = active ? src.activeChatTabId : d.chat;
        chat = chat != null && isPrimary(byId.get(String(chat))) ? String(chat) : null;
        if (!chat && active && !own) {
          const p = all.find(isPrimary); // the app's own pick when the active chat is gone
          chat = p ? String(p.id) : null;
        }
        if (!chat) return;
        const split = active && src.splitPanelMode === true;
        const group = [byId.get(chat)].concat(all.filter((t) => !isPrimary(t) && (t.ownerChatTabId ? String(t.ownerChatTabId) === chat : !split)));
        const ids = group.map((t) => String(t.id)).filter((id) => !moved.has(id) && !inPanes.has(id));
        if (split) {
          for (const side of ["left", "right"]) {
            const mine = ids.filter((id) => (byId.get(id).splitPanelSide === "right" ? "right" : "left") === side);
            const want = src[`${side}PanelActiveTabId`];
            const front = want != null && mine.includes(String(want)) ? String(want) : mine[0];
            for (const id of mine) add(id, `main:${side}`, id === front, side === "right" ? ["split"] : []);
          }
          return;
        }
        const want = active ? src.activeCenterTabId : d.center;
        const front = want != null && ids.includes(String(want)) ? String(want) : chat;
        for (const id of ids) add(id, "main", id === front, []);
      };
      if (!layout) center();
      else
        for (const l of layout) {
          if (!l) continue;
          if (l.pane === "main") center();
          else for (const id of l.tabs || []) add(id, l.pane, String(id) === String(l.active), ["pane"]);
        }
      if (active) for (const x of wins) add(x.id, x.pane, x.front, x.where);
      out.push({ deck: d, active, items });
    }
    if (infra.size) infraShown.set(String(w.id), infra);
    else infraShown.delete(String(w.id));
    // the same label twice in a card: numbered in list order
    const label = (it) => (it.kind === "chat" ? it.chat.name : it.title);
    const count = new Map();
    for (const g of out) for (const it of g.items) count.set(label(it), (count.get(label(it)) || 0) + 1);
    const nth = new Map();
    for (const g of out)
      for (const it of g.items) {
        const l = label(it);
        if (count.get(l) < 2) continue;
        nth.set(l, (nth.get(l) || 0) + 1);
        if (it.kind === "chat") it.chat.name = `${l} #${nth.get(l)}`;
        else it.title = `${l} #${nth.get(l)}`;
      }
    return out;
  }
  // A terminal running an agent CLI (Claude Code, Codex) is listed as an agent,
  // like Orca does. Where the signal lives (renderer bundle, read only): the app
  // never subscribes to xterm's onTitleChange, so the OSC title Claude Code sets
  // ("✳ <task>") is not in any store, and there is no foreground-process field;
  // the xterm instances sit in a module-private map. What is reachable:
  //   1. the tab's title, when it carries the CLI's marker ("✳ <task>", "Codex");
  //   2. the terminal's screen: xterm uses its DOM renderer (no webgl / canvas
  //      addon), the container is [data-terminal-id="<tab id>"], so the visible
  //      rows (.xterm-rows) can be read: "Claude Code v…" / "Welcome to Claude
  //      Code", "OpenAI Codex"; "(esc to interrupt)" means it is working.
  // A positive read is kept per terminal (the banner scrolls away); running /
  // done is read again whenever the screen is visible.
  const termAgents = new Map(); // tab id -> { provider, running, title, since }
  let agentSig = "";
  let agentSigAt = 0;
  // the terminals on screen, read at most once a second: their agent state joins
  // the render signature (a CLI starting / finishing work redraws its row)
  function readAgentSig() {
    if (performance.now() - agentSigAt < 1000) return;
    agentSigAt = performance.now();
    const parts = [];
    for (const el of document.querySelectorAll("[data-terminal-id]")) {
      const id = el.getAttribute("data-terminal-id");
      if (!id || !el.querySelector(".xterm-rows")) continue;
      const a = termAgent(id, null);
      if (a) parts.push(`${id}:${a.provider}:${a.running ? 1 : 0}:${a.title}`);
    }
    agentSig = parts.join("|");
  }
  const CLI_MARK = /^[✳✶✻✽✢]\s*(.*)$/u;
  function agentFromTitle(title) {
    const t = String(title || "").trim();
    const m = CLI_MARK.exec(t);
    if (m) {
      const task = m[1].trim();
      const idle = !task || /^claude code$/i.test(task);
      return { provider: "claude", running: !idle, title: idle ? "Claude Code" : task };
    }
    if (/^codex\b/i.test(t)) return { provider: "codex", running: false, title: "Codex" };
    return null;
  }
  function readTermLines(id) {
    let rows = null;
    try {
      rows = document.querySelector(`[data-terminal-id="${CSS.escape(String(id))}"] .xterm-rows`);
    } catch (_) {}
    if (!rows || !rows.children.length) return null;
    return Array.from(rows.children, (r) => r.textContent || "");
  }
  function agentFromScreen(lines) {
    const text = lines.join("\n");
    const working = /esc to interrupt/i.test(text);
    if (/Claude Code v\d|Welcome to Claude Code/i.test(text)) {
      let task = null;
      for (const l of lines) {
        const m = /^\s*[✳✶✻✽✢·*]\s+(\S.*?)\s*(?:…|\.\.\.)?\s*\(.*esc to interrupt/i.exec(l);
        if (m) task = m[1].replace(/[….]+$/, "").trim();
      }
      return { provider: "claude", running: working, title: task || "Claude Code" };
    }
    if (/OpenAI Codex|codex\s+v?\d+\.\d/i.test(text)) return { provider: "codex", running: working, title: "Codex" };
    return null;
  }
  function termAgent(id, title) {
    const key = String(id);
    const prev = termAgents.get(key) || null;
    let det = agentFromTitle(title);
    const lines = det ? null : readTermLines(key);
    if (!det && lines) det = agentFromScreen(lines);
    if (det) {
      const next = { ...det, since: prev ? prev.since : Date.now() };
      termAgents.set(key, next);
      return next;
    }
    // the screen is visible but shows no CLI marker now: keep the agent, idle
    if (prev && lines && prev.running) termAgents.set(key, { ...prev, running: false });
    return termAgents.get(key) || null;
  }
  // a terminal tab item -> an agent item (kind "chat", counted with the sessions);
  // the raw tab stays in .panel (recorded as such, activated as a terminal)
  function asAgentItem(it) {
    if (!it || it.kind !== "panel" || tabKind(it.type) !== "terminal") return null;
    const a = termAgent(it.id, it.title);
    if (!a) return null;
    return {
      kind: "chat",
      visible: it.visible,
      pane: it.pane,
      agent: a,
      panel: it,
      chat: { id: String(it.id), name: a.title, status: a.running ? "running" : "done", provider: a.provider, model: null, cli: true, where: it.where || [], created: a.since, at: a.since, draftText: "", draft: false, unread: false },
    };
  }
  // The app's own relative time (v2t): d, h, m or "now".
  function ago(ms) {
    if (!ms) return "";
    const t = Date.now() - ms;
    const m = Math.floor(t / 6e4);
    const h = Math.floor(t / 36e5);
    const d = Math.floor(t / 864e5);
    return d > 0 ? `${d}d` : h > 0 ? `${h}h` : m > 0 ? `${m}m` : "now";
  }
  // creation stamp for same-title chats: time of day (with seconds when two
  // share a minute), the day only when they were created on different days
  function stamp(ms, seconds, withDay) {
    if (!ms) return "";
    const d = new Date(ms);
    if (withDay) return d.toLocaleDateString([], { month: "short", day: "numeric" });
    const o = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
    if (seconds) o.second = "2-digit";
    return d.toLocaleTimeString([], o);
  }

  function canvasesOf(p, op, wss) {
    const rows = [];
    const s = srd();
    let overlay = [];
    try {
      overlay = (s && typeof s.getLocalOverlay === "function" && s.getLocalOverlay(p.id)) || [];
    } catch (_) {}
    for (const o of overlay) if (o && o.path && o.workingTreeStatus !== "deleted") rows.push({ name: o.name, path: o.path, branch: o.branch, at: Number(o.lastModifiedAt) || 0 });
    const remote = op && R.canvases.get(op);
    if (remote) for (const c of remote.rows) if (c && c.path && c.diffStatus !== "deleted") rows.push({ name: c.name, path: c.path, branch: c.branch, at: 0 });
    const main = wss.find((w) => w.mode === "local") || wss[0];
    const mainBranch = main ? branchLabel(main) : null;
    const pick = new Map();
    for (const c of rows) {
      const prev = pick.get(c.path);
      if (!prev || (c.branch === mainBranch && prev.branch !== mainBranch) || (prev.branch !== mainBranch && c.at > prev.at)) pick.set(c.path, c);
    }
    return Array.from(pick.values())
      .map((c) => {
        const w = wss.find((x) => branchLabel(x) === c.branch) || main;
        return { ...c, name: c.name || c.path.split("/").pop(), wsId: w ? w.id : null, offMain: !!(c.branch && mainBranch && c.branch !== mainBranch) };
      })
      .sort((a, b) => b.at - a.at || a.name.localeCompare(b.name));
  }

  function issueKey(i) {
    const prefix = (R.board && R.board.prefix) || "";
    return i.number != null ? `${prefix ? prefix + "-" : "#"}${i.number}` : "";
  }

  // The tree's projects in its order (the rail lists the same): the native
  // order, each with its open workspaces (primary first); a project whose open
  // workspaces all belong to another org is left out.
  function projectList(st) {
    const org = activeOrgId();
    const order = projectOrder();
    const projects = (st.projects || []).slice().sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      if (ia !== ib) return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
      if (typeof a.order === "number" && typeof b.order === "number") return a.order - b.order;
      return (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);
    });
    const live = (st.workspaces || []).filter(
      (w) => w && !w.isArchived && w.agentId == null && !(org && w.organizationId && w.organizationId !== org)
    );
    const list = [];
    // a stable order: primary checkout, pinned, then by creation (the store's
    // order breaks ties); never by activity (updatedAt moves on every click,
    // and a card jumping up would push the whole tree under the pointer)
    const at = new Map((st.workspaces || []).map((w, i) => [w, i]));
    for (const p of projects) {
      const wss = live
        .filter((w) => w.projectId === p.id)
        .sort((a, b) => (a.mode === "local" ? 0 : 1) - (b.mode === "local" ? 0 : 1) || (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0) || (at.get(a) || 0) - (at.get(b) || 0));
      if (!wss.length && (st.workspaces || []).some((w) => w && w.projectId === p.id && !w.isArchived && w.agentId == null)) continue;
      list.push({ p, wss });
    }
    return { projects, list };
  }

  function buildModel() {
    const st = W();
    if (!st) return null;
    const { projects, list } = projectList(st);
    const opOf = new Map(projects.map((p) => [p.id, orgProjectIdFor(p)]));
    const knownOps = new Set(Array.from(opOf.values()).filter(Boolean));
    const docsByOp = new Map();
    const orgDocs = [];
    const linksReady = R.status.docLinks === "ready";
    for (const d of R.docs) {
      const ops = Array.from((R.docOpids.get(d._id) || {}).opids || []).filter((x) => knownOps.has(x));
      for (const op of ops) (docsByOp.get(op) || docsByOp.set(op, []).get(op)).push(d);
      if (!ops.length && linksReady) orgDocs.push(d);
    }
    const sortIssues = (a, b) =>
      (ISSUE_DONE.test(a.status || "") ? 1 : 0) - (ISSUE_DONE.test(b.status || "") ? 1 : 0) || (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0);
    const issuesByOp = new Map();
    const orgIssues = [];
    for (const i of R.issues) {
      const links = R.issueOpids.get(String(i._id));
      const ops = links ? Array.from(links.keys()).filter((x) => knownOps.has(x)) : [];
      for (const op of ops) (issuesByOp.get(op) || issuesByOp.set(op, []).get(op)).push({ ...i, branchName: links.get(op) });
      if (!ops.length) orgIssues.push(i);
    }
    const agentsByOp = new Map();
    const orgAgents = [];
    for (const a of R.agents) {
      if (a.orgProjectId && knownOps.has(a.orgProjectId)) (agentsByOp.get(a.orgProjectId) || agentsByOp.set(a.orgProjectId, []).get(a.orgProjectId)).push(a);
      else orgAgents.push(a);
    }
    const sel = st.selectedWorkspaceId;
    const ph = phases();
    const drafts = inputDrafts();
    const out = [];
    for (const { p, wss } of list) {
      const op = opOf.get(p.id);
      const branches = wss.map((w) => {
          const chats = chatsOf(st, w, ph, drafts);
          return {
            id: w.id,
            label: branchLabel(w),
            name: (typeof w.name === "string" && w.name.trim()) || branchLabel(w),
            local: w.mode === "local",
            path: w.path || "",
            base: (w.repo && w.repo.baseBranch) || "",
            ready: !w.status || w.status === "ready",
            busy: chats.some((c) => c.status === "running"),
            add: (w.repo && w.repo.additions) || 0,
            del: (w.repo && w.repo.deletions) || 0,
            chats,
            open: openOf(st, w, chats),
            canvases: [],
            docs: [],
            issues: [],
          };
        });
      const canvases = canvasesOf(p, op, wss);
      const docs = (op && docsByOp.get(op)) || [];
      const issues = ((op && issuesByOp.get(op)) || []).sort(sortIssues);
      // One screen per branch: a canvas, doc or issue lands in the card of its
      // branch; one with no branch (or a branch with no card) in the primary card.
      const primary = branches.find((b) => b.local) || branches[0] || null;
      const cardOf = (name) => (name && branches.find((b) => b.label === name)) || primary;
      if (primary) {
        for (const c of canvases) (branches.find((b) => b.id === c.wsId) || primary).canvases.push(c);
        for (const d of docs) {
          const brs = ((R.docOpids.get(d._id) || {}).branches || new Map()).get(op);
          const names = brs ? Array.from(brs) : [];
          const cards = new Set(names.map(cardOf).filter(Boolean));
          if (!cards.size) cards.add(primary);
          for (const b of cards) b.docs.push(d);
        }
        for (const i of issues) cardOf(i.branchName).issues.push(i);
      }
      out.push({
        id: p.id,
        name: p.name || p.folderName || "Untitled project",
        color: p.color,
        image: projImage(p),
        orgProjectId: op,
        hasSelected: wss.some((w) => w.id === sel),
        branches,
        // project-level lists stay for a project with no branch open
        canvases: primary ? [] : canvases,
        docs: primary ? [] : docs,
        issues: primary ? [] : issues,
        agents: (op && agentsByOp.get(op)) || [],
      });
    }
    const docKids = new Map();
    for (const d of R.docs) if (d.parentId) (docKids.get(d.parentId) || docKids.set(d.parentId, []).get(d.parentId)).push(d);
    const orgDocIds = new Set(orgDocs.map((d) => d._id));
    const byOrder = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0);
    return {
      projects: out,
      org: {
        // unlinked docs: roots whose parent is not unlinked too, nested below
        docs: orgDocs.filter((d) => !d.parentId || !orgDocIds.has(d.parentId)).sort(byOrder),
        docKids,
        issues: orgIssues.sort(sortIssues),
        agents: orgAgents,
      },
    };
  }

  // ------------------------------------------------------------- navigation
  const navLog = [];
  function logNav(kind, id, via) {
    navLog.push({ at: Date.now(), kind, id, via });
    if (navLog.length > 50) navLog.shift();
    return via;
  }
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

  // Same click as the rail button; the store setter is the fallback.
  function goRoute(route) {
    const st = W();
    if (st && st.activeNavRoute === route) return "already";
    const btn = document.querySelector(`[data-testid="workspace-navbar-${route}-button"]`);
    if (btn) {
      btn.click();
      const now = W();
      if (!now || now.activeNavRoute === route) return "rail-click";
    }
    if (st && typeof st.setActiveNavRoute === "function") {
      st.setActiveNavRoute(route);
      return "store";
    }
    return "none";
  }

  // A chat opened on purpose from a row: if tab-close hid its tab (the empty
  // chat under an empty center, or a chat closed while its tabs stayed open),
  // the tab shows again. Selecting the app's active chat changes nothing in the
  // store, so the tab-close mod is told directly.
  function revealTab(id) {
    try {
      const tc = window.__RE_TEMPO_TAB_CLOSE__;
      if (tc && typeof tc.reveal === "function" && id != null) tc.reveal(String(id));
    } catch (_) {}
  }

  function openChat(wsId, chatId) {
    revealTab(chatId);
    goRoute("chat");
    const st = W();
    if (st && typeof st.selectWorkspaceChat === "function") {
      st.selectWorkspaceChat(wsId, chatId);
      return logNav("chat", chatId, "selectWorkspaceChat");
    }
    if (st && typeof st.selectWorkspace === "function") st.selectWorkspace(wsId);
    if (st && typeof st.selectChatTab === "function") st.selectChatTab(chatId);
    return logNav("chat", chatId, "selectWorkspace+selectChatTab");
  }

  function openBranch(wsId) {
    goRoute("chat");
    const st = W();
    if (!st || st.selectedWorkspaceId === wsId) return logNav("branch", wsId, "already");
    const fn = typeof st.switchToWorkspace === "function" ? st.switchToWorkspace : st.selectWorkspace;
    if (typeof fn === "function") {
      Promise.resolve(fn(wsId)).catch(() => {});
      return logNav("branch", wsId, typeof st.switchToWorkspace === "function" ? "switchToWorkspace" : "selectWorkspace");
    }
    return logNav("branch", wsId, "none");
  }

  // A row of a tab on a side of the native split: that side's own tab select (the
  // store's setPanelActiveTab(side, id), what a click on that side's tab bar
  // does), so the tab comes forward on its side and the split stays. False when
  // it does not apply (another workspace, the split closed meanwhile, a tab the
  // store does not know): the row's usual action then.
  function openSplitTab(wsId, side, id) {
    const st = W();
    if (!st || st.selectedWorkspaceId !== wsId || st.splitPanelMode !== true || typeof st.setPanelActiveTab !== "function") return false;
    if (!(Array.isArray(st.centerTabs) ? st.centerTabs : []).some((t) => t && String(t.id) === String(id))) return false;
    goRoute("chat");
    try {
      W().setPanelActiveTab(side, String(id));
    } catch (_) {
      return false;
    }
    return logNav("split", id, `setPanelActiveTab:${side}`);
  }

  // A chat row: a chat living in a popout window or a pane-dock pane is selected
  // there (pq.select, plus focus for a native popout), once its workspace is the
  // selected one; every other chat, primary or secondary, goes through
  // selectWorkspaceChat, which also handles another workspace, the owner of a
  // secondary chat and the split side.
  async function openChatItem(wsId, c) {
    const kind = c.owner ? "subchat" : "chat";
    revealTab(c.id);
    goRoute("chat");
    const inPq = () => popoutMap().get(`${wsId}|${c.id}`) || null;
    if (S.pq && ((c.where || []).some((x) => x === "pane" || x === "window") || inPq())) {
      if (!(await showWorkspace(wsId))) return logNav(kind, c.id, "workspace switch failed");
      const win = await waitFor(inPq, 1500, 50);
      if (win) {
        try {
          S.pq().select(win.popup, win.id);
          if (!win.dock && win.popup && typeof win.popup.focus === "function") win.popup.focus();
          return logNav(kind, c.id, win.dock ? "pq.select:pane" : "pq.select:window");
        } catch (_) {}
      }
    }
    const st = W();
    if (st && typeof st.selectWorkspaceChat === "function") {
      st.selectWorkspaceChat(wsId, c.id);
      return logNav(kind, c.id, "selectWorkspaceChat");
    }
    if (st && typeof st.selectWorkspace === "function" && st.selectedWorkspaceId !== wsId) st.selectWorkspace(wsId);
    const now = W();
    if (now && typeof now.setActiveCenterTab === "function") now.setActiveCenterTab(c.id);
    return logNav(kind, c.id, "setActiveCenterTab");
  }

  // The tab (or pane) a sidebar row stands for, flashed on screen: an overlay of
  // our own (fixed, pointer-events none), ~600ms; hover gives a softer, steady
  // one while the pointer is on the row. It sits on the target's visual box (the
  // dock's pane, the side of the native split the tab is in, or the rounded
  // wrapper of the center), 1px inside its edge, with the corner radii that box
  // shows (--rtps-flash-tl/tr/br/bl; 0 where a corner is square), and follows it
  // frame by frame (scroll, resize) while on screen.
  const hasRadius = (e) => {
    const cs = getComputedStyle(e);
    return parseFloat(cs.borderTopLeftRadius) > 0 || parseFloat(cs.borderTopRightRadius) > 0 || parseFloat(cs.borderBottomRightRadius) > 0 || parseFloat(cs.borderBottomLeftRadius) > 0;
  };
  function flashTarget(ws, id) {
    const bar = barShowing(ws, id);
    if (!bar) return null;
    const pane = bar.closest(".rtd-panel");
    if (pane) return pane;
    // the native split: the side the tab is in, not the whole center
    const side = splitSideOf(bar);
    if (side) return side.el;
    const center = bar.closest('[data-testid="center-panel"]') || bar.closest("[data-panel]");
    for (let e = bar.parentElement, i = 0; e && i < 8; e = e.parentElement, i++) {
      if (hasRadius(e)) return e;
      if (e === center) break;
    }
    return center || bar.parentElement;
  }
  const FLASH_CORNERS = [["tl", "borderTopLeftRadius"], ["tr", "borderTopRightRadius"], ["br", "borderBottomRightRadius"], ["bl", "borderBottomLeftRadius"]];
  // The radius each corner of the target shows: its own; a square corner of its
  // own sitting in the corner of a clipping ancestor (overflow not visible; within
  // 2px, its border) shows that ancestor's radius there, less the offset. A split
  // side or a dock pane has none of its own: the workspace frame (overflow: clip,
  // rounded top-left) rounds the one in its corner; the inner corners stay square.
  // Read in the same frame as the rect (r).
  function flashRadii(target, r) {
    const cs = getComputedStyle(target);
    const out = FLASH_CORNERS.map(([, prop]) => parseFloat(cs[prop]) || 0);
    const open = out.map((v) => !(v > 0));
    for (let e = target.parentElement, i = 0; e && i < 12 && open.some(Boolean); e = e.parentElement, i++) {
      const a = e.getBoundingClientRect();
      const ecs = getComputedStyle(e);
      const clips = ecs.overflowX !== "visible" || ecs.overflowY !== "visible";
      FLASH_CORNERS.forEach(([k, prop], j) => {
        if (!open[j]) return;
        const dx = Math.abs(k[1] === "l" ? r.left - a.left : a.right - r.right);
        const dy = Math.abs(k[0] === "t" ? r.top - a.top : a.bottom - r.bottom);
        if (dx > 2 || dy > 2) return void (open[j] = false); // away from that corner: square
        const rad = parseFloat(ecs[prop]) || 0;
        if (clips && rad > 0) {
          out[j] = Math.max(0, rad - Math.max(dx, dy));
          open[j] = false;
        }
      });
    }
    return out;
  }
  function placeFlash(el, target) {
    const r = target.getBoundingClientRect();
    if (!(r.width > 2 && r.height > 2)) return false;
    const st = el.style;
    const set = (k, v) => {
      if (st.getPropertyValue(k) !== v) st.setProperty(k, v);
    };
    set("left", `${Math.round(r.left) + 1}px`);
    set("top", `${Math.round(r.top) + 1}px`);
    set("width", `${Math.round(r.width) - 2}px`);
    set("height", `${Math.round(r.height) - 2}px`);
    const rad = flashRadii(target, r);
    FLASH_CORNERS.forEach(([k], j) => set(`--rtps-flash-${k}`, `${Math.round(rad[j] * 100) / 100}px`));
    return true;
  }
  // keep a flash on its target while both are on screen
  function followFlash(el, target) {
    const step = () => {
      if (!el.isConnected || !target.isConnected) return;
      placeFlash(el, target);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  let hoverFlash = null;
  function flashOnScreen(ws, id, soft) {
    const run = () => {
      const target = flashTarget(ws, id);
      if (soft) {
        if (!target) return clearHoverFlash();
        const fresh = !hoverFlash;
        if (fresh) {
          hoverFlash = document.createElement("div");
          hoverFlash.className = "rtps-flash rtps-flash-soft";
        }
        if (!placeFlash(hoverFlash, target)) return clearHoverFlash();
        if (fresh) document.body.appendChild(hoverFlash);
        hoverFlash.__target = target;
        if (fresh) {
          // the hover flash follows whatever row is hovered now, until it is cleared
          const el = hoverFlash;
          const step = () => {
            if (hoverFlash !== el || !el.isConnected) return;
            if (el.__target && el.__target.isConnected) placeFlash(el, el.__target);
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
        return;
      }
      if (!target) return;
      const el = document.createElement("div");
      el.className = "rtps-flash";
      if (!placeFlash(el, target)) return;
      document.body.appendChild(el);
      followFlash(el, target);
      setTimeout(() => el.remove(), 700);
    };
    // after the click has brought the tab forward and the app has painted
    if (soft) run();
    else requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(run, 60)));
  }
  function clearHoverFlash() {
    if (hoverFlash) {
      hoverFlash.remove();
      hoverFlash = null;
    }
  }

  // Card tools (Orca): a new terminal in that branch (the store's
  // openTerminalTab, after switching to it) and its files (the title bar's own
  // "Files" button, same click).
  async function branchTool(wsId, kind) {
    goRoute("chat");
    let st = W();
    if (st && st.selectedWorkspaceId !== wsId) {
      const fn = typeof st.switchToWorkspace === "function" ? st.switchToWorkspace : st.selectWorkspace;
      if (typeof fn === "function") await Promise.resolve(fn(wsId)).catch(() => {});
      await waitFor(() => W() && W().selectedWorkspaceId === wsId, 2500);
      st = W();
    }
    if (kind === "terminal") {
      if (st && typeof st.openTerminalTab === "function") {
        st.openTerminalTab();
        return logNav("terminal", wsId, "openTerminalTab");
      }
      if (st && typeof st.openTerminalTabInWorkspace === "function") {
        st.openTerminalTabInWorkspace(wsId);
        return logNav("terminal", wsId, "openTerminalTabInWorkspace");
      }
      return logNav("terminal", wsId, "none");
    }
    const btn = await waitFor(() => document.querySelector('button[aria-label="Files"]'), 1500);
    if (btn) {
      btn.click();
      return logNav("files", wsId, "files-button");
    }
    return logNav("files", wsId, "none");
  }

  // A tab row (terminal, canvas, browser, file...): its workspace first (when it
  // is another one), then its pane / popout through the popout store, else the
  // center tab through setActiveCenterTab.
  async function openPanel(wsId, it) {
    goRoute("chat");
    const st = W();
    if (st && st.selectedWorkspaceId !== wsId && !(await showWorkspace(wsId))) return logNav("panel", it.id, "workspace switch failed");
    if (S.pq && (it.where || []).some((w) => w === "pane" || w === "window")) {
      const e = await waitFor(() => ((S.pq() || {}).tabs || []).find((t) => t && String(t.id).endsWith(`:${wsId}:${it.id}`)), 1500, 50);
      if (e) {
        try {
          S.pq().select(e.popup, e.id);
          if (it.where.includes("window") && e.popup && typeof e.popup.focus === "function") e.popup.focus();
          return logNav("panel", it.id, "pq.select");
        } catch (_) {}
      }
    }
    const now = W();
    if (now && typeof now.setActiveCenterTab === "function") {
      now.setActiveCenterTab(it.id);
      return logNav("panel", it.id, "setActiveCenterTab");
    }
    return logNav("panel", it.id, "none");
  }

  // New chat in a workspace: what the native sidebar's "New chat" runs,
  // switchToWorkspace(ws) then the store's createChatTab() (a primary chat with
  // the chat defaults); createChatTabInWorkspace(ws) if the switch did not land.
  // The center "+" menu's New Chat (a secondary chat of the active one) is only
  // the last resort.
  async function newChatIn(wsId) {
    goRoute("chat");
    let st = W();
    wsId = wsId || (st && st.selectedWorkspaceId) || null;
    if (!st || !wsId) {
      toast("Open a branch first, then add a chat");
      return logNav("newchat", wsId, "none");
    }
    if (st.selectedWorkspaceId !== wsId) {
      const fn = typeof st.switchToWorkspace === "function" ? st.switchToWorkspace : st.selectWorkspace;
      if (typeof fn === "function") {
        try {
          const r = fn(wsId);
          if (r && typeof r.catch === "function") r.catch(() => {});
        } catch (_) {}
      }
      await waitFor(() => W() && W().selectedWorkspaceId === wsId, 2500);
      st = W();
    }
    if (st && st.selectedWorkspaceId === wsId && typeof st.createChatTab === "function") {
      st.createChatTab();
      return logNav("newchat", wsId, "createChatTab");
    }
    if (st && typeof st.createChatTabInWorkspace === "function") {
      st.createChatTabInWorkspace(wsId);
      return logNav("newchat", wsId, "createChatTabInWorkspace");
    }
    const act = await waitFor(() => {
      const btn = document.querySelector('[data-testid="center-panel-add-tab-button"]');
      const p = btn && propsUp(btn, (x) => !!x.newTabActions && typeof x.newTabActions === "object", 80);
      const a = p && p.newTabActions;
      if (!a) return null;
      if (typeof a.onNewChat === "function") return a.onNewChat;
      const it = Array.isArray(a) ? a.find((x) => x && x.key === "chat" && typeof x.onClick === "function") : null;
      return it ? it.onClick : null;
    }, 2500);
    if (act) {
      act();
      return logNav("newchat", wsId, "newTabActions.onNewChat");
    }
    toast("Open a branch first, then add a chat");
    return logNav("newchat", wsId, "none");
  }

  // Add project: the app's folder dialog + openFolder (the "Open folder" intent).
  async function addProject() {
    const st = W();
    const svc = st && st.service;
    if (!svc || typeof svc.openFolderDialog !== "function" || typeof st.openFolder !== "function") {
      toast("Add a project from Home");
      return logNav("project-add", null, "none");
    }
    let r = null;
    try {
      r = await svc.openFolderDialog();
    } catch (_) {}
    const path = typeof r === "string" ? r : r && (r.data || r.path || (Array.isArray(r.filePaths) && r.filePaths[0]));
    if (typeof path !== "string" || !path || (r && (r.canceled || r.success === false))) return logNav("project-add", null, "canceled");
    goRoute("chat");
    await Promise.resolve(W().openFolder(path)).catch(() => {});
    return logNav("project-add", String(path), "openFolder");
  }

  // Worktrees (Orca's "+" on a project): the app's own store actions.
  //   new branch: createLocalWorktree(projectId[, name]), what the native
  //     project "+" runs (it names the branch itself when no name is given);
  //   existing branch: createWorkspace(projectId, name, Map(repoId -> branch),
  //     "create_workspace", true) (useDirectBranch: check that branch out in
  //     the new worktree, the same call as opening a shared branch link);
  //   a branch that already has a card: switch to it.
  // The app selects the new workspace itself (foreground activation).
  function projectRepo(projectId) {
    const st = W();
    const p = st && (st.projects || []).find((x) => x.id === projectId);
    const repo = p && Array.isArray(p.repos) ? p.repos[0] : null;
    const main = st && (st.workspaces || []).find((w) => w && w.projectId === projectId && w.mode === "local" && !w.isArchived);
    return { p, repo, main, path: (repo && repo.path) || (main && main.path) || "" };
  }
  async function listProjectBranches(projectId) {
    const st = W();
    const { path } = projectRepo(projectId);
    if (!st || !st.service || typeof st.service.listBranches !== "function" || !path) return null;
    try {
      const r = await withTimeout(Promise.resolve(st.service.listBranches(path, { fetch: false })), QUERY_TIMEOUT_MS);
      const local = (r && Array.isArray(r.local) ? r.local : []).filter((b) => typeof b === "string" && b && b !== "HEAD");
      const remote = (r && Array.isArray(r.remote) ? r.remote : [])
        .filter((b) => typeof b === "string" && !/(^|\/)HEAD$/.test(b))
        .map((b) => b.replace(/^[^/]+\//, ""))
        .filter((b) => b && !local.includes(b));
      return { local, remote: Array.from(new Set(remote)) };
    } catch (_) {
      return null;
    }
  }
  async function createWorktree(projectId, branch, existing) {
    const st = W();
    if (!st) return logNav("worktree", branch, "none");
    goRoute("chat");
    const { repo } = projectRepo(projectId);
    toast(existing ? `Opening ${branch} in a new worktree…` : `Creating a worktree${branch ? " for " + branch : ""}…`);
    try {
      let ws = null;
      let via = "none";
      if (existing && typeof st.createWorkspace === "function" && repo && repo.id) {
        ws = await st.createWorkspace(projectId, branch, new Map([[repo.id, branch]]), "create_workspace", true);
        via = "createWorkspace:direct";
      } else if (typeof st.createLocalWorktree === "function") {
        ws = await st.createLocalWorktree(projectId, branch || undefined);
        via = "createLocalWorktree";
      }
      const id = ws && (ws.id || ws.workspaceId);
      const now = W();
      if (id && now && now.selectedWorkspaceId !== id && typeof now.switchToWorkspace === "function") await Promise.resolve(now.switchToWorkspace(id)).catch(() => {});
      if (id) toast(`Worktree ready${branch ? ": " + branch : ""}`);
      return logNav("worktree", branch || id, via);
    } catch (e) {
      toast(`Could not create the worktree: ${String((e && e.message) || e).slice(0, 120)}`);
      return logNav("worktree", branch, "error");
    }
  }

  // Design home of one project: the canvas sidebar's onSelectionChange, i.e. the
  // same call as clicking the project row there. The selected workspace (and so
  // the chat) does not change.
  async function openProject(projectId) {
    goRoute("design");
    await waitFor(() => document.querySelector(SEL.home) || document.querySelector(SEL.designBar), 2500);
    if (!document.querySelector(SEL.home)) {
      const bar = document.querySelector(SEL.designBar);
      const bp = bar && propsUp(bar, (p) => typeof p.onHome === "function" && "homeActive" in p, 20);
      if (bp) {
        bp.onHome();
        await waitFor(() => document.querySelector(SEL.home), 2000);
      }
    }
    const side = await waitFor(() => document.querySelector(SEL.canvasSidebar), 1500);
    const sp = side && propsUp(side, (p) => typeof p.onSelectionChange === "function", 12);
    if (sp) {
      sp.onSelectionChange({ kind: "all", projectId });
      return logNav("project", projectId, "onSelectionChange");
    }
    for (const row of document.querySelectorAll(SEL.projectRow)) {
      for (let f = fiberOf(row), i = 0; f && i < 4; f = f.return, i++) {
        if (f.key === projectId) {
          (row.querySelector("button,[role=treeitem],[role=button]") || row).click();
          return logNav("project", projectId, "row-click");
        }
      }
    }
    return logNav("project", projectId, "route-only");
  }

  async function openCanvas(c) {
    if (!c.wsId) return logNav("canvas", c.path, "no-workspace");
    goRoute("design");
    await waitFor(() => document.querySelector(SEL.home) || document.querySelector(SEL.designBar), 2500);
    const home = document.querySelector(SEL.home);
    const hp = home && propsUp(home, (p) => typeof p.onOpenCanvas === "function" && "browseRequest" in p, 40);
    if (hp) {
      hp.onOpenCanvas(c.name, c.path, c.wsId);
      return logNav("canvas", c.path, "home.onOpenCanvas");
    }
    const st = W();
    if (st && typeof st.openDesignTab === "function") {
      if (st.selectedWorkspaceId !== c.wsId && typeof st.selectWorkspace === "function") st.selectWorkspace(c.wsId);
      st.openDesignTab(c.name, c.path);
      return logNav("canvas", c.path, "store.openDesignTab");
    }
    return logNav("canvas", c.path, "route-only");
  }

  async function openDoc(d, asTab) {
    const st = W();
    const title = d.title || "Untitled";
    if (asTab && st && typeof st.openDocTab === "function") {
      goRoute("chat");
      st.openDocTab(`convex://docs/${d._id}`, title, "chat", { displayTitle: title });
      return logNav("doc", d._id, "openDocTab");
    }
    goRoute("docs");
    const via = await waitFor(() => {
      const s = W();
      if (s && typeof s.openDocCallback === "function") {
        s.openDocCallback(d._id);
        return "openDocCallback";
      }
      const td = window.__tempoDocs;
      if (td && typeof td.selectDoc === "function") {
        td.selectDoc(d._id);
        return "__tempoDocs.selectDoc";
      }
      return null;
    }, 5000);
    return logNav("doc", d._id, via || "route-only");
  }

  async function openIssue(i, asTab) {
    const st = W();
    if (asTab && st && typeof st.openIssueTab === "function") {
      goRoute("chat");
      st.openIssueTab(i._id, i.title);
      return logNav("issue", i._id, "openIssueTab");
    }
    goRoute("issues");
    const via = await waitFor(() => {
      const s = W();
      if (s && typeof s.openIssueCallback === "function") {
        s.openIssueCallback(i._id);
        return "openIssueCallback";
      }
      const ti = window.__tempoIssues;
      if (ti && typeof ti.selectIssue === "function") {
        ti.selectIssue(i._id);
        return "__tempoIssues.selectIssue";
      }
      return null;
    }, 5000);
    return logNav("issue", i._id, via || "route-only");
  }

  function openAgent(a, asTab) {
    const st = W();
    if (asTab && st && typeof st.openAgentTab === "function") {
      goRoute("chat");
      st.openAgentTab(a._id, a.name);
      return logNav("agent", a._id, "openAgentTab");
    }
    const ag = agentsStore();
    if (ag && typeof ag.openAgent === "function") {
      ag.openAgent(a._id);
      goRoute("agents");
      return logNav("agent", a._id, "openAgent");
    }
    goRoute("agents");
    const row = document.querySelector(`[data-testid="agent-list-row-${CSS.escape(String(a._id))}"]`);
    if (row) {
      row.click();
      return logNav("agent", a._id, "row-click");
    }
    return logNav("agent", a._id, "route-only");
  }

  // ------------------------------------------------------------------ icons
  const ICON = {
    chev: '<path d="m9 6 6 6-6 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    board: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16M15 4v16"/>',
    agent: '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V5M9 13h.01M15 13h.01"/><circle cx="12" cy="4" r="1"/>',
    docs: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10M18 9a6 6 0 0 1-6 6H6"/>',
    local: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9h14v-9"/>',
    chat: '<path d="M20 12a7.5 7.5 0 0 1-11.2 6.5L4 20l1.4-4.4A7.5 7.5 0 1 1 20 12z"/>',
    canvas: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/>',
    issue: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    layout: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.7-4.4L4 8"/><path d="M4 4v4h4M4 13a8 8 0 0 0 14.7 4.4L20 16"/><path d="M20 20v-4h-4"/>',
    collapse: '<path d="m7 15 5-5 5 5"/>',
    org: '<path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-5h6v5"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    folderPlus: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"/><path d="M12 10.5v5M9.5 13h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    terminal: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m7.5 9.5 3 2.5-3 2.5M12.5 15h4"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/>',
    archive: '<rect x="3.5" y="4.5" width="17" height="4" rx="1"/><path d="M5 8.5v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9M10 12.5h4"/>',
    plug: '<path d="M9 3v4.5M15 3v4.5M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0zM12 16v5"/>',
    page: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  };
  // The app's icon set (lucide-react: class "lucide lucide-<name>", 24 grid,
  // stroke 2): the Orca-style markup uses these, never home-made glyphs.
  const LUCIDE = {
    "check-circle-2": '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    "loader-circle": '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
    dot: '<circle cx="12.1" cy="12.1" r="1"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    "sliders-horizontal": '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    "folder-plus": '<path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    "folder-open": '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
    pin: '<line x1="12" x2="12" y1="17" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>',
    "git-branch": '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
    "circle-dot": '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>',
    "arrow-up": '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    "arrow-down": '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    "app-window": '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 4v4"/><path d="M2 8h20"/><path d="M6 4v4"/>',
    "trash-2": '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
    "square-terminal": '<path d="m7 11 2-2-2-2"/><path d="M11 13h4"/><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>',
    frame: '<line x1="22" x2="2" y1="6" y2="6"/><line x1="22" x2="2" y1="18" y2="18"/><line x1="6" x2="6" y1="2" y2="22"/><line x1="18" x2="18" y1="2" y2="22"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    "message-square": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    "panel-left": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
    "panel-left-dashed": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 14v1"/><path d="M9 19v2"/><path d="M9 3v2"/><path d="M9 9v1"/>',
    "messages-square": '<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>',
    "layout-template": '<rect width="18" height="7" x="3" y="3" rx="1"/><rect width="9" height="7" x="3" y="14" rx="1"/><rect width="5" height="7" x="16" y="14" rx="1"/>',
    "layout-list": '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><path d="M14 4h7"/><path d="M14 9h7"/><path d="M14 15h7"/><path d="M14 20h7"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  };
  const luc = (name, cls = "rtps-ic") =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-${name} ${cls}" aria-hidden="true">${LUCIDE[name] || ""}</svg>`;
  // a tab kind's lucide icon (canvas, terminal, browser, file, anything else)
  const LUC_TAB = { canvas: "frame", terminal: "square-terminal", globe: "globe", docs: "file", layout: "file" };
  // One icon per kind of tab, the same in the rows, the worktree subtitle and the
  // folded deck's pill: canvas = lucide frame (#), terminal = square-terminal (a
  // terminal in a box), browser = globe, file = file. The wrapper says the kind
  // (data-type="canvas|terminal|globe|docs") for the CSS to color it.
  const TAB_KINDS = new Set(["canvas", "terminal", "globe", "docs"]);
  const tabKind = (type) => {
    const k = PANEL_ICON[type] || (/term/i.test(type) ? "terminal" : /browser|web/i.test(type) ? "globe" : /canvas|design/i.test(type) ? "canvas" : /doc|file/i.test(type) ? "docs" : "tab");
    return TAB_KINDS.has(k) ? k : k === "issue" || k === "agent" ? k : "tab";
  };
  // the icon alone (an issue / agent tab keeps its own glyph)
  const tabGlyph = (kind) => (TAB_KINDS.has(kind) || kind === "tab" ? luc(LUC_TAB[kind] || "file") : svg(kind));
  const tabIconHtml = (type, cls, extra = "") => {
    const k = tabKind(type);
    return `<span class="${cls}" data-type="${k}"${extra}>${tabGlyph(k)}</span>`;
  };
  const STATE_ICON = { done: "check-circle-2", running: "loader-circle", unread: "dot" };
  const svg = (name, cls = "rtps-ic") =>
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ""}</svg>`;

  const PALETTE = ["var(--lavender-400, #a78bfa)", "var(--salmon-600, #e8775f)", "var(--mustard-600, #d9a521)", "var(--blueberry-700, #4f7cf0)", "var(--kiwi-700, #5aa35a)"];
  function hashColor(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return PALETTE[Math.abs(h) % PALETTE.length];
  }
  const cssColor = (c, seed) => (typeof c === "string" && /^(#|rgb|hsl|oklch|var\()/i.test(c.trim()) ? c : hashColor(seed || ""));
  function statusTone(s) {
    const v = String(s || "").toLowerCase();
    if (ISSUE_DONE.test(v)) return "done";
    if (/progress|started|doing|review|active/.test(v)) return "doing";
    return "todo";
  }

  // ------------------------------------------------------------------- tree
  // Expansion state: key -> boolean, persisted. Defaults per kind in isOpen().
  let EXP = new Map();
  try {
    EXP = new Map(Object.entries(JSON.parse(lsGet(EXP_KEY) || "{}")));
  } catch (_) {}
  let expVersion = 0;
  function saveExp() {
    expVersion++;
    const o = {};
    for (const [k, v] of EXP) o[k] = v;
    lsSet(EXP_KEY, JSON.stringify(o));
  }
  const isOpen = (key, dflt) => (EXP.has(key) ? !!EXP.get(key) : dflt);
  function setOpen(key, v) {
    EXP.set(key, !!v);
    saveExp();
    render(true);
  }

  let search = "";
  let lastModel = null;
  let actions = new Map(); // row key -> { activate(e), toggle() }

  function node(o) {
    return Object.assign({ children: [], depth: 0 }, o);
  }

  function buildNodes(model, ctx) {
    const nodes = [];
    // The project and branch you work in open once and stay open (until you
    // collapse them), so switching workspaces never folds the one you left.
    let reveal = false;
    for (const p of model.projects) {
      if (!p.hasSelected) continue;
      for (const k of [`p:${p.id}`, `b:${ctx.ws}`]) {
        if (!EXP.has(k)) {
          EXP.set(k, true);
          reveal = true;
        }
      }
    }
    if (reveal) saveExp();
    for (const p of model.projects) {
      const pk = `p:${p.id}`;
      const pn = node({
        key: pk,
        kind: "project",
        label: p.name,
        color: cssColor(p.color, p.name),
        dflt: true,
        active: ctx.route === "design" && ctx.designProject === p.id,
        projectId: p.id,
        image: p.image,
        title: p.name,
        // Orca: a click on the project folds / unfolds it (its design home stays on open.project)
        activate: () => setOpen(pk, !isOpen(pk, true)),
      });
      // one card per branch/worktree (Orca): status dot, branch, "primary", path
      for (const b of p.branches) {
        const card = node({
          key: `w:${b.id}`,
          kind: "card",
          label: b.label,
          ws: b,
          alwaysOpen: true,
          active: ctx.route === "chat" && b.id === ctx.ws,
          current: b.id === ctx.ws,
          title: `${b.name !== b.label ? b.label + " · " : ""}${b.local ? "Primary checkout" : "Worktree"}${b.path ? " · " + b.path : ""}`,
          // a click on the header (or its subtitle) selects that worktree, the
          // app's own way (switchToWorkspace); on the current one it does nothing
          activate: () => (b.id === ctx.ws ? logNav("branch", b.id, "current") : openBranch(b.id)),
        });
        try {
          pushOpen(card, b, ctx);
        // the card is its head + its decks (pages); no other lists (canvases,
        // docs, issues stay reachable from the top shortcuts and Organization)
        } catch (err) {
          noteRenderError(card.key, err);
          card.children.length = 0;
          card.children.push(node({ key: `e:${b.id}:err`, kind: "empty", disabled: true, label: "Could not list this branch" }));
        }
        pn.children.push(card);
      }
      if (!p.branches.length) pn.children.push(node({ key: `e:${p.id}:branches`, kind: "empty", label: "No branches open yet" }));
      if (F.canvases && p.canvases.length) {
        const cg = group(`g:${p.id}:canvases`, "Canvases", p.canvases.length);
        for (const c of p.canvases) cg.children.push(canvasNode(p, c, ctx, true));
        pn.children.push(cg);
      }
      pushRemoteGroups(pn, `g:${p.id}`, p.docs, p.issues, p.agents, ctx, false);
      nodes.push(pn);
    }
    const o = model.org;
    if (false && F.org && (o.docs.length || o.issues.length || o.agents.length || R.status.docLinks === "loading")) { // Organization: not a project, not listed
      const on = node({ key: "org", kind: "org", label: "Organization", dflt: true, title: "Not linked to a project" });
      pushRemoteGroups(on, "og", o.docs, o.issues, o.agents, ctx, true, o.docKids);
      nodes.push(on);
    }
    return nodes;
  }

  function canvasNode(p, c, ctx, showBranch) {
    return node({
      key: `v:${p.id}:${c.path}`,
      kind: "canvas",
      label: c.name,
      icon: "canvas",
      meta: showBranch && c.offMain ? String(c.branch).split("/").pop() : "",
      title: c.branch ? `On ${c.branch}` : undefined,
      active: ctx.route === "design" && ctx.designTab === `design-canvas-${c.path}`,
      activate: () => openCanvas(c),
    });
  }
  function issueNode(i, base, ctx) {
    return node({
      key: `i:${base}:${i._id}`,
      kind: "issue",
      label: i.title || "Untitled issue",
      meta: issueKey(i),
      tone: statusTone(i.status),
      active: ctx.route === "issues" && (ctx.issue === i._id || ctx.issue === issueKey(i)),
      title: `${i.status || "open"}${i.branchName ? " · " + i.branchName : ""} · ⌘-click: open as a tab`,
      activate: (e) => openIssue(i, !!(e && (e.metaKey || e.ctrlKey))),
    });
  }
  function group(key, label, count) {
    return node({ key, kind: "group", label, count, dflt: true });
  }

  const STATUS_TITLE = { running: "Working…", waiting: "Needs your input", done: "Done", interrupted: "Interrupted", new: "Not started" };
  // ------------------------------------------------------------- decks
  // A deck is a page with its own arrangement of panes in the workspace; the
  // pane-dock owns them (window.__RE_TEMPO_DECKS__, "rtd:decks-changed").
  // No API: the card shows "Deck 01 · N on screen" only.
  const decksApi = () => {
    const d = window.__RE_TEMPO_DECKS__;
    return d && typeof d.list === "function" && typeof d.switchTo === "function" ? d : null;
  };
  function deckInfo(wsId) {
    const D = decksApi();
    if (!D) return null;
    try {
      // the dock's own order (it renumbers its default names when decks move), so
      // the tree, "Move up / down" and the dock's indices agree
      const list = (D.list(wsId) || []).filter((d) => d && d.id != null);
      if (!list.length) return null;
      const cur = (typeof D.current === "function" && D.current(wsId)) || list.find((d) => d.active) || list[0];
      const curId = cur && typeof cur === "object" ? cur.id : cur;
      return { list, current: list.find((d) => d.id === curId) || list[0] };
    } catch (_) {
      return null;
    }
  }
  // the other decks: compact rows (their summary), then "+ New deck"
  // Every deck of the branch is a sibling block in the card: the active one
  // (lighter, accent bar, filled marker) holds what is on screen, the others are
  // collapsed headers with their summary; same inset, same width, never nested.
  // A deck shows its number only ("Deck 02" -> "02"); a renamed deck, its name.
  const deckLabel = (name) => {
    const m = /^Deck\s+(\d+)$/i.exec(String(name || "").trim());
    return m ? String(Number(m[1])).padStart(2, "0") : String(name || "");
  };
  // Deck expansion is its own state, not a side effect of which deck is active,
  // so a click never folds a deck you are looking at:
  //   - the current branch's active deck keeps the legacy key v:<ws> (default
  //     open; its "N on screen" header / pill as before);
  //   - every other deck (inactive ones, and all decks of a branch you are not
  //     on) has vd:<ws>:<deck> (default closed: the compact deck row).
  // When a deck stops being the current branch's active one its open state
  // moves into vd (an expanded deck stays expanded, showing the rows it last
  // had on screen); when it becomes it again, vd moves back into v and is
  // dropped. A deck that becomes active without a click here (the dock's own
  // switch, "+") still opens, as before. The user folds any deck by its chevron.
  const deckKey = (d) => (d && d.id != null ? String(d.id) : "only");
  const vdKey = (wsId, k) => `vd:${wsId}:${k}`;
  const shownActive = new Map(); // ws -> key of the deck that was its current active one at the last render ("" = branch not current)
  // An older build kept a per-deck record of rows here, which listed tabs long
  // gone after a reload: dropped.
  lsSet("rtd.projectSidebar.deckRows.v1", null);
  function syncDeckOpen(b, dk, current) {
    const vk = `v:${b.id}`;
    const cur = current ? (dk ? deckKey(dk.current) : "only") : "";
    const prev = shownActive.get(b.id);
    shownActive.set(b.id, cur);
    let changed = false;
    if (prev && prev !== cur && !EXP.has(vdKey(b.id, prev))) {
      EXP.set(vdKey(b.id, prev), isOpen(vk, true));
      changed = true;
    }
    if (cur) {
      const k = vdKey(b.id, cur);
      if (EXP.has(k)) {
        EXP.set(vk, !!EXP.get(k));
        EXP.delete(k);
        changed = true;
      } else if (prev && prev !== cur && EXP.get(vk) !== false) {
        // activation never expands: a deck that becomes active (a click, the dock,
        // "+") keeps its own state, folded unless it was opened by its chevron
        EXP.set(vk, false);
        changed = true;
      }
    }
    // decks that no longer exist drop their state
    if (dk) {
      const ids = new Set(dk.list.map(deckKey));
      const pre = `vd:${b.id}:`;
      for (const key of Array.from(EXP.keys()))
        if (key.startsWith(pre) && !ids.has(key.slice(pre.length))) {
          EXP.delete(key);
          changed = true;
        }
    }
    if (changed) saveExp();
  }
  // Before a switch from a click: each deck keeps what it shows now and the
  // clicked one ends open. Returns an undo for a switch that did not happen.
  function holdDecks(wsId, targetId) {
    const dk = deckInfo(wsId);
    if (!dk) return () => {};
    const st = W();
    const current = !!st && st.selectedWorkspaceId === wsId;
    const ak = vdKey(wsId, deckKey(dk.current));
    const tk = vdKey(wsId, String(targetId));
    const before = [ak, tk].map((k) => [k, EXP.has(k) ? EXP.get(k) : undefined]);
    if (!EXP.has(ak)) EXP.set(ak, current ? isOpen(`v:${wsId}`, true) : false);
    // the target keeps its own open / folded state (selecting never expands)
    saveExp();
    return () => {
      for (const [k, v] of before) v === undefined ? EXP.delete(k) : EXP.set(k, v);
      saveExp();
    };
  }
  // Rows of the same pane (one tab bar) sit together, in that bar's order: each
  // row says its pane (data-pane) and its place in that run of rows
  // (data-pane-pos: only | first | middle | last); the CSS draws the link.
  function markPanes(nodes) {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!n.pane) continue;
      const prev = i > 0 && nodes[i - 1].pane === n.pane;
      const next = i < nodes.length - 1 && nodes[i + 1].pane === n.pane;
      n.panePos = !prev && !next ? "only" : !prev ? "first" : !next ? "last" : "middle";
    }
    return nodes;
  }
  // A branch card lists what its workspace has open (openOf): the same rows
  // whatever branch you are on. One deck: its rows straight under the branch.
  // Several: one block per deck (a deck with nothing open is left out, except
  // the workspace's current deck). The deck on screen of the branch you are on
  // is open by default; the others are folded pills (the chevron unfolds one, a
  // click switches to that deck).
  function pushOpen(card, b, ctx) {
    const here = b.id === ctx.ws;
    const dk = deckInfo(b.id);
    syncDeckOpen(b, dk, here);
    const groups = b.open.length > 1 ? b.open.filter((g) => g.active || g.items.length) : b.open;
    for (const g of groups) {
      const d = g.deck;
      const k = deckKey(d);
      const front = here && g.active; // the deck on screen
      const deck = d && dk ? { id: d.id, ws: b.id, name: deckLabel(d.name) || "Deck", count: dk.list.length } : null;
      const rows = markPanes(g.items.map((it) => openNode(b, it, ctx, g)));
      const empty = () => node({ key: `e:${b.id}:${k}:open`, kind: "empty", disabled: true, label: "Nothing open" });
      if (groups.length === 1) {
        const block = node({ key: `dkb:${b.id}:${k}`, kind: "deckblock", alwaysOpen: true, deckActive: front, deckOpen: true, deckSingle: true });
        block.children.push(...(rows.length ? rows : [empty()]));
        card.children.push(block);
        continue;
      }
      const vk = front ? `v:${b.id}` : vdKey(b.id, k);
      const open = isOpen(vk, front);
      const go = () => (d && d.id != null ? deckSwitch(b.id, d.id) : openBranch(b.id));
      const name = deck ? deck.name : null;
      const block = node({ key: `dkb:${b.id}:${k}`, kind: "deckblock", alwaysOpen: true, deckActive: front, deckOpen: open });
      if (open) {
        const head = node({ key: `b:${b.id}:${k}`, kind: "chats", label: `${rows.length} open`, deckName: name, deck, deckActive: front, count: rows.length, alwaysOpen: true, deckExpanded: true, title: front ? "Collapse · double-click to rename" : "Switch to this deck · double-click to rename", activate: front ? () => setOpen(vk, false) : go, onToggle: () => setOpen(vk, false) });
        head.children.push(...(rows.length ? rows : [empty()]));
        block.children.push(head);
      } else
        block.children.push(node({ key: `deck:${b.id}:${k}`, kind: "pill", label: name || "Deck", deckName: name, deck, deckActive: front, items: g.items, deckExpanded: false, title: front ? "Expand · double-click to rename" : "Switch to this deck · double-click to rename", activate: front ? () => setOpen(vk, true) : go, onToggle: () => setOpen(vk, true) }));
      card.children.push(block);
    }
  }
  // One open tab as a row. A click brings it forward where it is (in another
  // branch, after switching to it) and flashes it; a row of a deck that is not
  // on screen switches to that deck, then opens the tab through its live row.
  function openNode(b, it, ctx, g) {
    const n = it.agent ? agentNode(b, it, ctx) : it.kind === "chat" ? chatNode(b, it.chat, ctx) : panelNode(b, it, ctx);
    const id = String(it.id);
    n.behind = it.visible === false; // behind another tab of its bar
    n.visible = it.visible !== false;
    n.active = false; // every row is an open tab: none reads as "selected"
    n.pane = it.pane || null;
    n.viewRef = { ws: b.id, id };
    const go = n.activate;
    if (g.active) {
      // a tab of a native split side comes forward on that side (the split stays)
      const side = it.pane === "main:left" ? "left" : it.pane === "main:right" ? "right" : null;
      n.activate = async (e) => {
        const r = (side && openSplitTab(b.id, side, id)) || (await go(e));
        flashOnScreen(b.id, id, false);
        return r;
      };
      return n;
    }
    const key = n.key;
    n.title = `${n.title || ""}\nIn deck ${deckLabel(g.deck.name) || g.deck.id} · a click switches to it`;
    n.activate = async (e) => {
      await deckSwitch(b.id, g.deck.id);
      const a = await waitFor(() => {
        const row = treeEl && treeEl.querySelector(`.rtps-deckblock[data-active] .rtps-row[data-key="${CSS.escape(key)}"]`);
        const x = row && actions.get(key);
        return x && x.activate ? x : null;
      }, 2500, 100);
      if (a) return a.activate(e);
      return logNav("deck-item", id, "deck switched; the tab was not on screen in time");
    };
    return n;
  }
  let decksVersion = 0;
  function deckCall(fn, ...args) {
    const D = decksApi();
    if (!D || typeof D[fn] !== "function") return null;
    try {
      return D[fn](...args);
    } catch (e) {
      toast(`Deck: ${String((e && e.message) || e).slice(0, 100)}`);
      return null;
    }
  }
  async function deckSwitch(wsId, id) {
    goRoute("chat");
    const st = W();
    if (st && st.selectedWorkspaceId !== wsId) {
      // arriving on another branch: its decks keep what they show, the clicked one opens
      holdDecks(wsId, id);
      const fn = typeof st.switchToWorkspace === "function" ? st.switchToWorkspace : st.selectWorkspace;
      if (typeof fn === "function") await Promise.resolve(fn(wsId)).catch(() => {});
      await waitFor(() => W() && W().selectedWorkspaceId === wsId, 2500);
    }
    // the deck you leave keeps its open/closed look; the clicked deck opens
    const undo = holdDecks(wsId, id);
    const ok = await Promise.resolve(deckCall("switchTo", wsId, id));
    if (ok === false || ok == null) undo();
    decksVersion++;
    schedule();
    return logNav("deck", id, "decks.switchTo");
  }
  // the card's "+": a new deck in that branch (switching to it first)
  async function deckCreateIn(wsId) {
    const st = W();
    if (st && st.selectedWorkspaceId !== wsId) {
      const fn = typeof st.switchToWorkspace === "function" ? st.switchToWorkspace : st.selectWorkspace;
      if (typeof fn === "function") await Promise.resolve(fn(wsId)).catch(() => {});
      await waitFor(() => W() && W().selectedWorkspaceId === wsId, 2500);
    }
    return deckCreate(wsId);
  }
  async function deckCreate(wsId) {
    goRoute("chat");
    holdDecks(wsId, null); // the deck you leave keeps its open/closed look
    const d = await Promise.resolve(deckCall("create", wsId, { activate: true }));
    const id = d && typeof d === "object" ? d.id : d;
    const info = deckInfo(wsId);
    if (id != null && info && info.current.id !== id) await Promise.resolve(deckCall("switchTo", wsId, id));
    if (EXP.get(`v:${wsId}`) === false) {
      EXP.set(`v:${wsId}`, true);
      saveExp();
    }
    decksVersion++;
    schedule();
    return logNav("deck-create", id, "decks.create");
  }

  const PANEL_ICON = { terminal: "terminal", browser: "globe", canvas: "canvas", design: "canvas", doc: "docs", issue: "issue", agent: "agent" };
  function panelNode(b, it, ctx) {
    const icon = PANEL_ICON[it.type] || (/term/i.test(it.type) ? "terminal" : /browser|web/i.test(it.type) ? "globe" : /canvas|design/i.test(it.type) ? "canvas" : /doc/i.test(it.type) ? "docs" : "layout");
    return node({
      key: `t:${b.id}:${it.id}`,
      kind: "panel",
      label: it.title,
      icon,
      tabType: it.type,
      where: it.where,
      active: ctx.route === "chat" && b.id === ctx.ws && ctx.centerTab === it.id,
      title: `${it.type}${it.where.length ? " · in " + it.where.join(", ") : ""}`,
      activate: () => openPanel(b.id, it),
    });
  }

  // A terminal running an agent CLI: a session row (status, provider, "title -
  // Claude CLI"), keyed and activated as the terminal tab it is.
  function agentNode(b, it, ctx) {
    const n = chatNode(b, it.chat, ctx);
    n.key = `t:${b.id}:${it.panel.id}`;
    n.title = `${PROVIDER_NAME[it.agent.provider] || "Claude"} CLI in ${it.panel.title || "a terminal"}`;
    n.activate = () => openPanel(b.id, it.panel);
    return n;
  }
  // Every chat, primary or secondary, is a plain "chat" row with no children.
  // A secondary is active when it is the center tab; its owner is active only
  // while none of its secondaries is the center tab.
  function chatNode(b, c, ctx) {
    const sid = (x) => (x == null ? "" : String(x));
    const ownsCenter = (b.chats || []).some((k) => k.owner != null && sid(k.owner) === sid(c.id) && sid(k.id) === sid(ctx.centerTab));
    const active = ctx.route === "chat" && b.id === ctx.ws && (c.owner ? sid(ctx.centerTab) === sid(c.id) : ctx.chat === c.id && !ownsCenter);
    return node({
      key: `c:${b.id}:${c.id}`,
      kind: "chat",
      label: c.name,
      chat: c,
      alwaysOpen: true,
      active,
      attn: c.status === "running" || c.status === "waiting" || c.unread,
      title: `${c.draftText ? c.draftText.slice(0, 200) + "\n" : ""}${STATUS_TITLE[c.status] || ""}${c.provider ? " · " + c.provider : ""}${c.model ? " " + c.model : ""}${c.where.length ? " · in " + c.where.join(", ") : ""}${c.created ? " · created " + new Date(c.created).toLocaleString() : ""}`,
      activate: () => openChatItem(b.id, c),
    });
  }

  function docNode(d, ctx, kids, prefix) {
    const n = node({
      key: `${prefix}:${d._id}`,
      kind: "doc",
      label: d.title || "Untitled",
      emoji: typeof d.icon === "string" && d.icon.length <= 4 ? d.icon : "",
      icon: "docs",
      dflt: false,
      active: ctx.route === "docs" && ctx.doc === d._id,
      title: "⌘-click: open as a tab next to the chat",
      activate: (e) => openDoc(d, !!(e && (e.metaKey || e.ctrlKey))),
    });
    const ch = kids ? kids.get(d._id) : null;
    if (ch) for (const c of ch.slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))) n.children.push(docNode(c, ctx, kids, prefix));
    return n;
  }

  // Which projects had linked docs at the last complete load (localStorage),
  // read once; written only when a value changes.
  const DOCS_SEEN_KEY = "rtd.projectSidebar.docsSeen";
  let docsSeenMap = null;
  function docsSeen(base, had) {
    if (!docsSeenMap) {
      try {
        docsSeenMap = JSON.parse(lsGet(DOCS_SEEN_KEY) || "{}") || {};
      } catch (_) {
        docsSeenMap = {};
      }
    }
    if (had === undefined) return docsSeenMap[base] === 1;
    const v = had ? 1 : 0;
    if (docsSeenMap[base] !== v) {
      docsSeenMap[base] = v;
      lsSet(DOCS_SEEN_KEY, JSON.stringify(docsSeenMap));
    }
    return had;
  }
  function pushRemoteGroups(parent, base, docs, issues, agents, ctx, isOrg, docKids) {
    if (!F.docs) docs = [];
    if (!F.issues) issues = [];
    else if (!F.doneIssues) issues = issues.filter((i) => !ISSUE_DONE.test(i.status || ""));
    if (!F.agents) agents = [];
    if (docs.length) {
      const g = group(`${base}:docs`, "Docs", docs.length);
      for (const d of docs) g.children.push(docNode(d, ctx, isOrg ? docKids : null, `d:${base}`));
      parent.children.push(g);
    } else if (F.docs && (R.status.docs === "loading" || R.status.docLinks === "loading")) {
      // the placeholder holds the row the Docs group will take, so only where
      // docs are expected (this project had some last time): one that turns
      // out to have none would leave and pull everything below it up
      if ((isOrg || R.docs.length) && docsSeen(base)) parent.children.push(node({ key: `${base}:docs:l`, kind: "empty", label: "Linking docs…" }));
    }
    if (F.docs && R.status.docs === "ready" && R.status.docLinks !== "loading") docsSeen(base, docs.length > 0);
    if (issues.length) {
      const g = group(`${base}:issues`, "Issues", issues.length);
      for (const i of issues) g.children.push(issueNode(i, base, ctx));
      parent.children.push(g);
    }
    if (agents.length) {
      const g = group(`${base}:agents`, "Agents", agents.length);
      for (const a of agents)
        g.children.push(
          node({
            key: `a:${base}:${a._id}`,
            kind: "agent",
            label: a.name || "Agent",
            icon: "agent",
            color: cssColor(a.color, a.name || a._id),
            meta: a.enabled === false ? "paused" : "",
            active: ctx.route === "agents" && ctx.agent === a._id,
            title: "⌘-click: open as a tab",
            activate: (e) => openAgent(a, !!(e && (e.metaKey || e.ctrlKey))),
          })
        );
      parent.children.push(g);
    }
  }

  // ---------------------------------------------------------------- filters
  const FILTER_KEY = "rtd.projectSidebar.filters";
  // The filters menu is gone (the head keeps only "Add project"): every list
  // shows. A filter saved by an older build could hide a list with no way to
  // turn it back on, so a saved one that differs is reset to "all" on load.
  const F = { canvases: true, docs: true, issues: true, agents: true, doneIssues: true, org: true };
  resetSavedFilters();
  function resetSavedFilters() {
    try {
      const saved = JSON.parse(lsGet(FILTER_KEY) || "null");
      if (saved && typeof saved === "object" && Object.keys(F).some((k) => k in saved && saved[k] !== F[k])) lsSet(FILTER_KEY, JSON.stringify(F));
    } catch (_) {}
  }
  let attention = false; // only chats that are running, need you or are unread (debug API setAttention; no bell any more)
  let filterVersion = 0;
  function setFilter(k, v) {
    F[k] = !!v;
    lsSet(FILTER_KEY, JSON.stringify(F));
    filterVersion++;
    render(true);
  }

  // Search / bell: a node shows when it or a descendant matches; ancestors open.
  function filterNodes(nodes, pred) {
    const out = [];
    for (const n of nodes) {
      const self = pred(n);
      const kids = filterNodes(n.children, pred);
      if (self || kids.length) out.push(Object.assign({}, n, { children: kids.length ? kids : self && n.kind !== "chat" ? [] : n.children, forceOpen: kids.length > 0 }));
    }
    return out;
  }
  const LEAFY = new Set(["group", "chats", "section", "drafts", "empty", "more", "pill", "deck", "newdeck"]);
  function nodeText(n) {
    const b = n.ws;
    return `${n.label} ${n.meta || ""} ${b ? b.path + " " + b.base : ""}`.toLowerCase();
  }

  // Rows are emitted as DOM; a branch card wraps its rows (a chat never wraps
  // another chat). aria-level carries the logical depth for the keyboard.
  function emit(nodes, depth, level, container, filtering) {
    for (const n of nodes) {
      n.depth = depth;
      n.level = level;
      const expandable = n.children.length > 0 && !n.alwaysOpen;
      const open = !!n.alwaysOpen || (expandable && (filtering ? !!n.forceOpen : !!n.pin || isOpen(n.key, n.dflt)));
      n.expandable = expandable;
      n.open = open;
      let host = container;
      if (n.kind === "deckblock") {
        const blk = document.createElement("div");
        blk.className = "rtps-deckblock";
        blk.dataset.pkey = n.key;
        if (n.deckActive) blk.dataset.active = "";
        if (n.deckOpen) blk.dataset.open = "";
        if (n.deckSingle) blk.dataset.single = ""; // the worktree's only deck: rows, no header
        container.appendChild(blk);
        emit(n.children, depth, level, blk, filtering);
        continue;
      }
      if (n.kind === "card") {
        host = document.createElement("div");
        host.className = "rtps-card";
        host.dataset.pkey = `card:${n.key}`;
        host.style.setProperty("--d", String(depth));
        if (n.active) host.dataset.active = "";
        if (n.current) host.dataset.current = "";
        // a worktree the dock just created enters (class while it plays, see dropNew)
        if (typeof dropNew === "object") dropNew.decorateCard(host, n);
        container.appendChild(host);
      }
      host.appendChild(rowEl(n)); // a worktree is one line: no subtitle, no tab kind icons
      register(n, filtering);
      if (!open || !n.children.length) continue;
      const childDepth = n.kind === "card" ? 0 : n.kind === "chats" || n.kind === "section" ? depth : depth + 1;
      let kidHost = host;
      if (n.kind === "project") {
        // the project's branches sit in its container, tied to it by a guide line
        kidHost = document.createElement("div");
        kidHost.className = "rtps-projkids";
        kidHost.dataset.pkey = `pk:${n.key}`;
        host.appendChild(kidHost);
      }
      emit(n.children, childDepth, level + 1, kidHost, filtering);
    }
  }
  function register(n, filtering) {
    const toggle = typeof n.onToggle === "function" ? n.onToggle : n.expandable && !filtering ? () => setOpen(n.key, !n.open) : null;
    actions.set(n.key, {
      activate: n.activate || (n.kind === "group" || n.kind === "chats" || n.kind === "section" || n.kind === "drafts" || n.kind === "org" ? toggle : null),
      toggle,
      newDeck: n.kind === "card" ? () => deckCreateIn(n.ws.id) : null,
      terminal: n.kind === "card" ? () => branchTool(n.ws.id, "terminal") : null,
      files: n.kind === "card" ? () => branchTool(n.ws.id, "files") : null,
      newWorktree: n.kind === "project" ? () => openBranchMenu(n.projectId) : null,
    });
  }

  const PROVIDER_ICON = {
    claude: '<path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6 6 18"/>',
    codex: '<path d="M12 3.2 19.6 7.6v8.8L12 20.8l-7.6-4.4V7.6z"/><path d="m9 10 2.5 2L9 14m4.5 0H16"/>',
    openai: '<path d="M12 3.2 19.6 7.6v8.8L12 20.8l-7.6-4.4V7.6z"/>',
    cursor: '<path d="M4.5 7.5 12 3.5l7.5 4v9l-7.5 4-7.5-4z"/><path d="M4.5 7.5 12 12l7.5-4.5M12 12v8.5"/>',
  };
  const providerKey = (p, m) => {
    const v = `${p || ""} ${m || ""}`.toLowerCase();
    if (/claude|anthropic|opus|sonnet|haiku|fable|mythos/.test(v)) return "claude";
    if (/codex/.test(v)) return "codex";
    if (/openai|gpt|\bo\d/.test(v)) return "openai";
    if (/cursor/.test(v)) return "cursor";
    return null;
  };
  const icon = (paths, cls) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

  function rowEl(n) {
    try {
      return rowElInner(n);
    } catch (err) {
      noteRenderError(n.key, err);
      const el = document.createElement("div");
      el.className = `rtps-row rtps-${n.kind === "card" ? "cardhead" : n.kind}`;
      el.setAttribute("role", n.kind === "card" ? "presentation" : "treeitem");
      if (n.kind !== "card") el.setAttribute("tabindex", "-1");
      el.dataset.key = n.key;
      el.dataset.kind = n.kind;
      el.dataset.renderError = "";
      el.innerHTML = `<span class="rtps-label">${escapeHtml(n.label != null ? n.label : n.key)}</span>`;
      return el;
    }
  }
  function rowElInner(n) {
    const el = document.createElement("div");
    el.className = `rtps-row rtps-${n.kind === "card" ? "cardhead" : n.kind}`;
    // the worktree header is a button (switch to that worktree, Tab / Enter /
    // Space) outside the tree's roving tabindex; every other row is a treeitem
    const head = n.kind === "card";
    if (head) {
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.setAttribute("aria-label", `Switch to ${n.ws && n.ws.name ? n.ws.name : n.label}`);
      if (n.current) el.setAttribute("aria-current", "true");
    } else {
      el.setAttribute("role", "treeitem");
      el.setAttribute("tabindex", "-1");
      el.setAttribute("aria-level", String((n.level || 0) + 1));
    }
    el.dataset.key = n.key;
    el.dataset.kind = n.kind;
    if (n.behind) el.dataset.behind = "";
    // a tab row: in front of its pane (true) or hidden behind another tab of it (false)
    if (typeof n.visible === "boolean") el.dataset.visible = String(n.visible);
    if (n.viewRef) {
      el.dataset.viewWs = n.viewRef.ws;
      el.dataset.viewId = n.viewRef.id;
    }
    if (n.deck) {
      el.dataset.deckId = n.deck.id;
      el.dataset.deckWs = n.deck.ws;
      el.dataset.deckName = n.deck.name;
      el.dataset.deckCount = String(n.deck.count || 1);
    }
    el.style.setProperty("--d", String(n.depth || 0));
    if (n.expandable) el.setAttribute("aria-expanded", n.open ? "true" : "false");
    // a deck's open / folded state for the keyboard (← →); not aria-expanded, whose CSS turns chevrons
    else if (typeof n.deckExpanded === "boolean") el.dataset.deckExpanded = n.deckExpanded ? "true" : "false";
    if (n.active && !head) el.setAttribute("aria-selected", "true");
    if (n.current) el.dataset.current = "";
    if (n.pane) {
      el.dataset.pane = n.pane;
      if (n.panePos) el.dataset.panePos = n.panePos;
    }
    if (n.title) el.title = n.title;
    const chev = n.expandable ? `<span class="rtps-chev" data-chev>${svg("chev")}</span>` : `<span class="rtps-chev rtps-chev-none"></span>`;
    const label = `<span class="rtps-label">${escapeHtml(n.label)}</span>`;
    if (n.kind === "more" || n.kind === "empty") {
      if (n.disabled) el.dataset.disabled = "";
      if (n.disabled && !n.link) {
        el.innerHTML = `<span class="rtps-label">${escapeHtml(n.label)}</span>`;
        return el;
      }
      if (n.link) {
        el.classList.add("rtps-linkrow");
        el.innerHTML = `<span class="rtps-label">${escapeHtml(n.label)} · <span class="rtps-link">${escapeHtml(n.link)}</span></span>`;
        return el;
      }
      el.innerHTML = `<span class="rtps-chev rtps-chev-none"></span>${label}`;
      return el;
    }
    if (n.kind === "card") {
      const b = n.ws;
      // a dot (running > ready > unavailable), the name, "primary", the "+". Green
      // for every worktree that is there (its checkout ready, primary or not),
      // pulsing while a session runs; gray only when it is not (not ready yet,
      // failed or gone). "primary" stays the chip's job.
      const state = b.busy ? "running" : b.ready === false ? "unavailable" : "ready";
      const mark = `<span class="rtps-dot" data-state="${state}" title="${state === "running" ? "A session is running" : state === "ready" ? (b.local ? "Ready · primary checkout" : "Ready · worktree") : "Not available"}"></span>`;
      el.innerHTML =
        `<span class="rtps-card-text">` +
        // one line for every worktree (dot, name, chip, "+"): a branch other than the name is the name's tooltip
        `<span class="rtps-card-title">${mark}<span class="rtps-label"${b.label && String(b.label).trim() !== String(b.name).trim() ? ` title="${escapeHtml(b.label)}"` : ""}>${escapeHtml(b.name)}</span>${b.local ? '<span class="rtps-badge">primary</span>' : ""}` +
        (decksApi() && typeof decksApi().create === "function"
          ? `<button type="button" class="rtps-row-btn rtps-row-btn-on" data-row-act="newDeck" title="New deck" aria-label="New deck in ${escapeHtml(b.label)}">${luc("plus")}</button>`
          : "") +
        `</span>` +
        `</span>`;
      return el;
    }
    if (n.kind === "chat") {
      const c = n.chat;
      const pk = providerKey(c.provider, c.model);
      // one grid for every pane row: [status 16][type icon 16][title][meta]
      const lead = "";
      el.dataset.status = c.status;
      if (c.draft) el.dataset.draft = c.empty ? "empty" : "text";
      // Orca: [status][provider icon] title ........ time (" CLI" after a terminal agent's title)
      const state = chatState(c);
      el.innerHTML =
        lead +
        `<span class="rtps-status" data-state="${state}" title="${STATE_TITLE[state]}">${luc(STATE_ICON[state])}</span>` +
        (pk ? `<span class="rtps-provic" data-provider="${pk}">${icon(PROVIDER_ICON[pk], "rtps-ic")}</span>` : `<span class="rtps-provic">${luc("message-square")}</span>`) +
        // the provider's icon says who it is: no " - Claude"; a CLI session in a terminal says " CLI"
        `<span class="rtps-label"><span class="rtps-title">${escapeHtml(n.label)}</span>${c.cli ? '<span class="rtps-prov rtps-cli"> CLI</span>' : ""}</span>` +
        `<span class="rtps-time">${escapeHtml(ago(c.at || c.created))}</span>`;
      return el;
    }
    const projBtn =
      n.kind === "project"
        ? `<button type="button" class="rtps-row-btn rtps-row-btn-on" data-row-act="newWorktree" title="New worktree from a branch" aria-label="New worktree from a branch" aria-haspopup="dialog" aria-expanded="${bmOpenFor() === n.projectId ? "true" : "false"}" tabindex="-1"${typeof dropNew === "object" ? dropNew.btnAttrs(n.projectId) : ""}>${luc("plus")}</button>`
        : "";
    let lead = "";
    if (n.kind === "project") lead = projAvatar(n.label, n.color, "rtps-proj-avatar", n.image);
    else if (n.kind === "org") lead = svg("org");
    else if (n.kind === "issue") lead = `<span class="rtps-status" data-tone="${n.tone}"></span>`;
    else if (n.kind === "agent") lead = `<span class="rtps-agent-tile" style="--c:${n.color}">${svg("agent")}</span>`;
    else if (n.emoji) lead = `<span class="rtps-emoji">${escapeHtml(n.emoji)}</span>`;
    else if (n.icon) lead = svg(n.icon);
    const count = n.kind === "group" || n.kind === "chats" || n.kind === "section" ? `<span class="rtps-count">${n.count}</span>` : "";
    const meta = n.meta ? `<span class="rtps-meta">${escapeHtml(n.meta)}</span>` : "";
    const dot = n.unread ? `<span class="rtps-dot" aria-label="unread"></span>` : "";
    if (n.kind === "chats") {
      // Orca: the open deck's pill: its number, "N agents", ⌄
      const num = n.deckName ? `<span class="rtps-label"><span class="rtps-deck-num rtps-deck-name">${escapeHtml(n.deckName)}</span></span>` : "";
      el.innerHTML = `${num}<span class="rtps-deck-count">${n.count} ${n.count === 1 ? "agent" : "agents"}</span><span class="rtps-chev rtps-chev-end rtps-chev-open" data-chev title="Collapse">${luc("chevron-down")}</span>`; // lucide chevron-down as is (no rotation)
      return el;
    }
    if (n.kind === "section") {
      el.innerHTML = `${label}<span class="rtps-count">${n.count}</span>${n.expandable ? `<span class="rtps-chev rtps-chev-sec" data-chev>${svg("chev")}</span>` : ""}`;
      return el;
    }
    if (n.kind === "pill") {
      // Orca: a folded deck: its number, then one group per state (check +
      // provider + "+N", running ring + provider...), ›
      if (n.deckActive) el.dataset.on = "";
      const num = n.deckName != null ? `<span class="rtps-label"><span class="rtps-deck-num rtps-deck-name">${escapeHtml(n.deckName)}</span></span>` : "";
      el.innerHTML = `${num}<span class="rtps-pillbox" aria-label="${escapeHtml(n.label)}">${pillStateGroups(n.items || [])}</span><span class="rtps-chev rtps-chev-end rtps-chev-right" data-chev title="Expand">${luc("chevron-right")}</span>`;
      return el;
    }
    if (n.kind === "newdeck") {
      el.innerHTML = `${svg("plus")}<span class="rtps-label">${escapeHtml(n.label)}</span>`;
      return el;
    }
    if (n.kind === "panel") {
      el.innerHTML = `${tabIconHtml(n.tabType, "rtps-ico")}${label}${meta}`; // where: in the tooltip
      return el;
    }
    el.innerHTML = `${n.kind === "project" ? "" : chev}${lead}${label}${count}${meta}${dot}${projBtn}`;
    return el;
  }
  // Orca's states for a session row and a folded deck's groups
  const STATE_TITLE = { done: "Done", running: "Working…", unread: "Needs you / unread" };
  const PROVIDER_NAME = { claude: "Claude", codex: "Codex", openai: "OpenAI", cursor: "Cursor" };
  const chatState = (c) => (c.status === "running" ? "running" : c.status === "waiting" || c.unread ? "unread" : "done");
  // A folded deck's pill, at most 3 groups: by priority running, unread, done
  // (state icon + the first session's provider + "+N" for the others), then
  // the deck's other tabs (up to 2 kind icons + "+N"). If that is still more
  // than 3, done and unread fold into one "+N". An empty deck says "Empty".
  // Groups are split by .rtps-pillsep.
  function pillStateGroups(items) {
    if (!items.length) return '<span class="rtps-pill-empty">Empty</span>';
    const by = {};
    for (const state of ["running", "unread", "done"]) by[state] = items.filter((it) => it.kind === "chat" && chatState(it.chat) === state);
    const tabs = items.filter((it) => it.kind !== "chat");
    const chatGroup = (state) => {
      const list = by[state];
      const pk = providerKey(list[0].chat.provider, list[0].chat.model);
      const prov = pk ? `<span class="rtps-provic" data-provider="${pk}">${icon(PROVIDER_ICON[pk], "rtps-ic")}</span>` : `<span class="rtps-provic">${luc("message-square")}</span>`;
      return `<span class="rtps-pillgroup" data-state="${state}" title="${escapeHtml(list.map((it) => it.chat.name).join("\n"))}">${luc(STATE_ICON[state])}${prov}${list.length > 1 ? `<span class="rtps-pillmore">+${list.length - 1}</span>` : ""}</span>`;
    };
    const groups = [];
    const states = ["running", "unread", "done"].filter((st) => by[st].length);
    const total = states.length + (tabs.length ? 1 : 0);
    if (total > 3) {
      // running keeps its own group; unread + done fold into one count
      groups.push(chatGroup("running"));
      const rest = by.unread.concat(by.done);
      groups.push(`<span class="rtps-pillgroup" data-state="more" title="${escapeHtml(rest.map((it) => it.chat.name).join("\n"))}"><span class="rtps-pillmore">+${rest.length}</span></span>`);
    } else for (const st of states) groups.push(chatGroup(st));
    if (tabs.length) {
      const kinds = [];
      for (const it of tabs) {
        const k = tabKind(it.type);
        if (!kinds.includes(k)) kinds.push(k);
      }
      const shown = kinds.slice(0, 2);
      const more = tabs.length - shown.length;
      groups.push(`<span class="rtps-pillgroup" data-state="tabs" title="${escapeHtml(tabs.map((it) => it.title).join("\n"))}">${shown.map((k) => `<span class="rtps-tabic" data-type="${k}">${tabGlyph(k)}</span>`).join("")}${more > 0 ? `<span class="rtps-pillmore">+${more}</span>` : ""}</span>`);
    }
    return groups.join('<span class="rtps-pillsep"></span>');
  }
  // a project's own image when the store has one (a URL), else the initial
  function projImage(p) {
    for (const v of [p.iconUrl, p.imageUrl, p.avatarUrl, p.logoUrl, p.icon, p.image]) if (typeof v === "string" && /^(https?:|data:image\/|file:|blob:|\/)/.test(v)) return v;
    return null;
  }
  // a project's avatar: its initial on its color (the tree row and the rail)
  function projAvatar(name, color, cls = "rtps-proj", image = null) {
    if (image) return `<span class="${cls}" style="--c:${color}"><img src="${escapeHtml(image)}" alt="" draggable="false"></span>`;
    return `<span class="${cls}" style="--c:${color}">${escapeHtml((String(name || "").trim()[0] || "?").toUpperCase())}</span>`;
  }
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ------------------------------------------------------------------ chrome
  let root = null;
  let treeEl = null;
  let searchEl = null;
  let toastT = 0;

  function mount() {
    if (root && document.body.contains(root)) return;
    root = document.createElement("aside");
    root.id = "rtd-project-sidebar";
    root.className = "rtps rtd-project-sidebar";
    root.setAttribute("data-rtps-root", "");
    root.setAttribute("aria-label", "Projects");
    root.innerHTML = `
      <div class="rtps-top">
        <label class="rtps-search">${svg("search")}<input type="search" spellcheck="false" placeholder="Search projects, chats, docs…" aria-label="Search the sidebar"></label>
      </div>
      <div class="rtps-head"><span class="rtps-head-label">Projects</span><span class="rtps-head-actions"></span></div>
      <div class="rtps-tree" role="tree" aria-label="Projects"></div>
      <div class="rtps-foot"></div>
`;
    document.body.appendChild(root);
    treeEl = root.querySelector(".rtps-tree");
    treeEl.style.overflowAnchor = "none"; // a rebuild never shifts the scroll on its own
    searchEl = root.querySelector(".rtps-search input");
    searchEl.addEventListener("input", () => {
      search = searchEl.value.trim().toLowerCase();
      render(true);
    });
    searchEl.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        searchEl.value = "";
        search = "";
        render(true);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        focusRow(0);
      }
    });
    root.querySelector(".rtps-head").addEventListener("click", onHeadClick);
    syncHead();
    syncFoot();
    treeEl.addEventListener("click", onTreeClick);
    treeEl.addEventListener("dblclick", onTreeDblClick);
    treeEl.addEventListener("mouseover", (e) => {
      const row = e.target.closest(".rtps-row[data-view-id]");
      if (row) flashOnScreen(row.dataset.viewWs, row.dataset.viewId, true);
      else clearHoverFlash();
    });
    treeEl.addEventListener("mouseleave", clearHoverFlash);
    treeEl.addEventListener("contextmenu", onTreeContext);
    treeEl.addEventListener("keydown", onTreeKey);
  }

  // ------------------------------------------------- branch picker (worktrees)
  let bmEl = null;
  let bmState = null;
  // The project's "+" reads as expanded while its worktree popover is open (the
  // CSS keeps it visible then). rowEl writes the same value, so a rebuild never
  // drops it; open/close also set it at once.
  const bmOpenFor = () => (bmEl && !bmEl.hidden && bmState ? bmState.projectId : null);
  function markWorktreeBtn() {
    if (!treeEl) return;
    const pid = bmOpenFor();
    for (const b of treeEl.querySelectorAll('[data-row-act="newWorktree"]')) {
      const row = b.closest(".rtps-row");
      const want = pid != null && row && row.dataset.key === `p:${pid}` ? "true" : "false";
      if (b.getAttribute("aria-expanded") !== want) b.setAttribute("aria-expanded", want);
    }
  }
  function openBranchMenu(projectId) {
    if (!root) return;
    if (!bmEl) {
      bmEl = document.createElement("div");
      bmEl.className = "rtps-menu rtps-bm";
      bmEl.setAttribute("role", "dialog");
      bmEl.setAttribute("aria-label", "New worktree from a branch");
      bmEl.hidden = true;
      root.appendChild(bmEl);
      bmEl.addEventListener("click", onBranchMenuClick);
      bmEl.addEventListener("input", () => paintBranchMenu());
      bmEl.addEventListener("keydown", onBranchMenuKey);
    }
    const { p, main } = projectRepo(projectId);
    const st = W();
    const open = new Map();
    for (const w of (st && st.workspaces) || []) if (w && w.projectId === projectId && !w.isArchived && w.agentId == null) open.set(branchLabel(w), w.id);
    bmState = { projectId, name: (p && (p.name || p.folderName)) || "project", base: (main && main.repo && (main.repo.currentBranch || main.repo.baseBranch)) || "main", open, branches: null };
    bmEl.innerHTML =
      `<div class="rtps-menu-label">New worktree in ${escapeHtml(bmState.name)}</div>` +
      `<label class="rtps-search rtps-bm-search">${svg("branch")}<input type="text" spellcheck="false" placeholder="Branch name or search…" aria-label="Branch name or search"></label>` +
      `<div class="rtps-bm-list" role="listbox"></div>`;
    const row = treeEl && treeEl.querySelector(`.rtps-row[data-key="p:${CSS.escape(projectId)}"]`);
    const r = (row || root).getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    bmEl.style.top = `${Math.round(Math.min(r.bottom - rr.top + 4, rr.height - 320))}px`;
    bmEl.hidden = false;
    markWorktreeBtn();
    paintBranchMenu();
    bmEl.querySelector("input").focus();
    setTimeout(() => document.addEventListener("pointerdown", outsideBranchMenu, true), 0);
    listProjectBranches(projectId).then((b) => {
      if (!bmState || bmState.projectId !== projectId) return;
      bmState.branches = b || { local: [], remote: [], failed: true };
      paintBranchMenu();
    });
    return logNav("worktree-menu", projectId, "open");
  }
  function paintBranchMenu() {
    if (!bmEl || !bmState) return;
    const q = (bmEl.querySelector("input") || {}).value || "";
    const qq = q.trim().toLowerCase();
    const list = bmEl.querySelector(".rtps-bm-list");
    const b = bmState.branches;
    const match = (x) => !qq || x.toLowerCase().includes(qq);
    const exact = b && (b.local.includes(q.trim()) || b.remote.includes(q.trim()) || bmState.open.has(q.trim()));
    const item = (attrs, icon, text, meta) => `<button type="button" role="option" ${attrs}>${svg(icon)}<span class="rtps-label">${escapeHtml(text)}</span>${meta ? `<span class="rtps-meta">${escapeHtml(meta)}</span>` : ""}</button>`;
    let html = item(`data-bm="new" data-name="${escapeHtml(exact ? "" : q.trim())}"`, "plus", q.trim() && !exact ? `New branch “${q.trim()}”` : "New branch", `from ${bmState.base}`);
    if (!b) html += `<div class="rtps-menu-label">Loading branches…</div>`;
    else {
      if (b.failed) html += `<div class="rtps-menu-label">Could not list the branches</div>`;
      const openRows = Array.from(bmState.open.entries()).filter(([n]) => match(n));
      const local = b.local.filter((n) => !bmState.open.has(n) && match(n));
      const remote = b.remote.filter((n) => !bmState.open.has(n) && match(n));
      if (local.length || remote.length) html += `<div class="rtps-menu-label">Branches</div>`;
      for (const n of local) html += item(`data-bm="branch" data-name="${escapeHtml(n)}"`, "branch", n, "");
      for (const n of remote) html += item(`data-bm="branch" data-name="${escapeHtml(n)}"`, "branch", n, "remote");
      if (openRows.length) html += `<div class="rtps-menu-label">Already open</div>`;
      for (const [n, id] of openRows) html += item(`data-bm="open" data-ws="${escapeHtml(id)}" data-name="${escapeHtml(n)}"`, "check", n, "switch");
    }
    // the option that had the focus keeps it (found again by kind and name); gone: the field
    const fe = list.contains(document.activeElement) ? document.activeElement : null;
    const was = fe && fe.dataset ? [fe.dataset.bm, fe.dataset.name || "", fe.dataset.ws || ""] : null;
    list.innerHTML = html;
    if (was) {
      const again = Array.from(list.querySelectorAll("[data-bm]")).find((x) => x.dataset.bm === was[0] && (x.dataset.name || "") === was[1] && (x.dataset.ws || "") === was[2]);
      (again || bmEl.querySelector("input")).focus({ preventScroll: true });
    }
  }
  function closeBranchMenu(refocus) {
    if (!bmEl || bmEl.hidden) return;
    bmEl.hidden = true;
    bmState = null;
    markWorktreeBtn();
    document.removeEventListener("pointerdown", outsideBranchMenu, true);
    if (refocus && treeEl) {
      const r = treeEl.querySelector('.rtps-row[tabindex="0"]');
      if (r) r.focus();
    }
  }
  function outsideBranchMenu(e) {
    if (bmEl && !bmEl.contains(e.target) && !e.target.closest('[data-row-act="newWorktree"]')) closeBranchMenu(false);
  }
  function onBranchMenuClick(e) {
    const b = e.target.closest("[data-bm]");
    if (!b || !bmState) return;
    const pid = bmState.projectId;
    closeBranchMenu(false);
    if (b.dataset.bm === "open") openBranch(b.dataset.ws);
    else if (b.dataset.bm === "branch") createWorktree(pid, b.dataset.name, true).finally(schedule);
    else createWorktree(pid, b.dataset.name || "", false).finally(schedule);
  }
  function onBranchMenuKey(e) {
    const items = Array.from(bmEl.querySelectorAll("[data-bm]"));
    const i = items.indexOf(document.activeElement);
    if (e.key === "Escape") closeBranchMenu(true);
    else if (e.key === "ArrowDown") (items[i + 1] || items[0]).focus();
    else if (e.key === "ArrowUp") (i <= 0 ? bmEl.querySelector("input") : items[i - 1]).focus();
    else if (e.key === "Enter" && e.target.tagName === "INPUT") {
      // an exact name: that branch (open: switch to it), else the first item (new branch)
      const q = bmEl.querySelector("input").value.trim();
      const exact = q ? items.find((x) => (x.dataset.bm === "branch" || x.dataset.bm === "open") && x.dataset.name === q) : null;
      (exact || items[0]).click();
    } else return;
    e.preventDefault();
  }



  // deck rows: a single click switches after a short beat so a double click can
  // rename instead; the deck name in the header never folds the list
  let deckClickT = 0;
  // The head (Orca): "Projects" + bell (Agent Runs, when that mod is loaded),
  // Add project (new worktrees come from the "+" on each project row). Kept in
  // step on every render, keyed like the rows.
  function syncHead() {
    const host = root && root.querySelector(".rtps-head-actions");
    if (!host) return;
    const btn = (act, ic, title) => `<button type="button" class="rtps-icon-btn" data-key="head:${act}" data-act="${act}" title="${title}" aria-label="${title}">${luc(ic)}</button>`;
    const next = document.createElement("div");
    next.innerHTML =
      (window.__RE_TEMPO_AGENT_RUNS__ ? btn("bell", "bell", `Agent runs · ${IS_MAC ? "⌘⇧A" : "Ctrl+Shift+A"}`) : "") +
      btn("add-project", "folder-plus", "Add project (open a folder)");
    patchChildren(host, next);
  }
  // The footer (the rail is hidden while this panel is on screen): a host for
  // the usage rings (usage-bar mounts its rtu-* content there; never touched
  // here), Settings and the account avatar. The avatar mirrors the native one
  // ([aria-label="User menu"] in the rail: its image or initials) every tick.
  const nativeBtn = (label) => Array.from(document.querySelectorAll(`button[aria-label="${label}"]`)).find((b) => !b.closest("[data-rtps-root], .rtps-titlebar-tools")) || null;
  let footSig = "", toolsEl = null;
  function syncFoot() {
    const mine = toolsEl && toolsEl.isConnected && toolsEl.querySelector('[data-act="account"]');
    if (!mine) return;
    const n = nativeBtn("User menu");
    const img = n && n.querySelector("img");
    const src = img && img.getAttribute("src");
    const text = n ? n.textContent.replace(/\s+/g, "").slice(0, 3) : "";
    const sig = `${src || ""}|${text}`;
    if (sig === footSig && mine.childNodes.length) return;
    footSig = sig;
    mine.innerHTML = src ? `<img src="${escapeHtml(src)}" alt="" draggable="false">` : `<span class="rtps-foot-initials">${escapeHtml(text || "?")}</span>`;
  }
  // The usage rings host exists only while this panel is on screen (mod on,
  // expanded): usage-bar watches for it (present = rings here, gone = rings in
  // the rail). Collapsed, booting or signed out the node is removed, not hidden.
  function syncRingsHost(on) {
    const foot = root && root.querySelector(".rtps-foot");
    if (!foot) return;
    const host = foot.querySelector(":scope > [data-rtu-rings-host]");
    if (on && !host) {
      const h = document.createElement("div");
      h.setAttribute("data-rtu-rings-host", "");
      foot.insertBefore(h, foot.firstChild);
    } else if (!on && host) host.remove();
  }
  function onFootClick(e) {
    const b = e.target.closest("[data-act]");
    if (!b || !b.closest(".rtps-titlebar-tools")) return;
    const menu = window.__RE_TEMPO_RAIL_MENU__;
    if (b.dataset.act === "settings") {
      if (menu && typeof menu.open === "function") return void menu.open(b);
      const n = nativeBtn("Settings");
      if (n) n.click();
      return logNav("settings", "", n ? "native" : "none");
    }
    if (b.dataset.act === "account") {
      if (menu && typeof menu.openUserMenu === "function") return void menu.openUserMenu(b);
      const n = nativeBtn("User menu");
      if (n) n.click();
      return logNav("account", "", n ? "native" : "none");
    }
  }
  function onHeadClick(e) {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "add-project") return void addProject().finally(schedule);
    if (act === "bell") {
      const l = document.querySelector("[data-rar-launcher]");
      if (l) l.click();
      else window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", shiftKey: true, metaKey: IS_MAC, ctrlKey: !IS_MAC, bubbles: true }));
      return logNav("agent-runs", "", l ? "launcher" : "shortcut");
    }
  }

  function onTreeDblClick(e) {
    const row = e.target.closest(".rtps-row[data-deck-id]");
    if (!row || (row.dataset.kind === "chats" && !e.target.closest(".rtps-deck-name"))) return;
    clearTimeout(deckClickT);
    e.preventDefault();
    startDeckRename(row);
  }
  function startDeckRename(row) {
    const { deckId, deckWs, deckName } = row.dataset;
    const lab = row.querySelector(".rtps-deck-name");
    if (!lab || deckEdit) return;
    const input = document.createElement("input");
    input.className = "rtps-deck-input";
    input.value = deckName || "";
    input.setAttribute("aria-label", "Deck name");
    input.spellcheck = false;
    lab.replaceWith(input);
    deckEdit = { ws: deckWs, id: deckId, input };
    input.focus({ preventScroll: true });
    input.select();
    const done = (commit) => {
      if (!deckEdit) return;
      deckEdit = null;
      const v = input.value.trim();
      if (commit && v && v !== deckName) {
        deckCall("rename", deckWs, deckId, v);
        logNav("deck-rename", deckId, "decks.rename");
      }
      decksVersion++;
      render(true);
    };
    input.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") done(true);
      else if (ev.key === "Escape") done(false);
    });
    input.addEventListener("blur", () => done(true));
    for (const t of ["click", "dblclick", "pointerdown"]) input.addEventListener(t, (ev) => ev.stopPropagation());
  }
  let deckEdit = null;
  // A deck's menu (pill / header): Rename, Move tabs to ▸, Move up / down, Close
  // all tabs, Remove deck, through pane-dock's decks API (each with its undo). It
  // hangs under the row that opened it (8px in, 4px below; above when there is
  // no room); Close all and Remove ask first, in place.
  function deckMenu(e, row) {
    const { deckWs: ws, deckId: id } = row.dataset;
    const name = row.dataset.deckName || id;
    const D = decksApi();
    const dk = deckInfo(ws);
    const list = dk ? dk.list : [];
    const i = list.findIndex((d) => String(d.id) === String(id));
    const d = list[i];
    const tabs = d && Array.isArray(d.tabs) ? d.tabs : [];
    const others = list.filter((x) => String(x.id) !== String(id));
    const last = list.length <= 1;
    const t = deckRemovalText(ws, id, name);
    const changed = () => {
      decksVersion++;
      schedule();
    };
    const newer = (fn) => (D && typeof D[fn] === "function" ? false : "Needs a newer pane-dock");
    const n = tabs.length;
    const items = [
      {
        label: "Rename…",
        icon: "pencil",
        run: () => {
          const r = treeEl.querySelector(`.rtps-row[data-deck-ws="${CSS.escape(ws)}"][data-deck-id="${CSS.escape(id)}"]`);
          if (r) startDeckRename(r);
        },
      },
      {
        label: "Move tabs to",
        icon: "layout-list",
        disabled: !others.length ? "No other deck" : !n ? "No tabs in it" : newer("moveTabs"),
        sub: others.map((o) => ({
          label: `Deck ${deckLabel(o.name) || o.id}`,
          run: () => {
            const k = D.moveTabs(ws, tabs, o.id);
            logNav("deck-move-tabs", id, `moveTabs -> ${o.id}: ${k}`);
            toast(k ? `Moved ${k} tab${k === 1 ? "" : "s"} to deck ${deckLabel(o.name) || o.id}` : "Nothing to move");
            changed();
          },
        })),
      },
      { label: "Move up", icon: "arrow-up", disabled: i <= 0 ? "Already the first" : newer("move"), run: () => (D.move(ws, id, i - 1), changed()) },
      { label: "Move down", icon: "arrow-down", disabled: i < 0 || i >= list.length - 1 ? "Already the last" : newer("move"), run: () => (D.move(ws, id, i + 1), changed()) },
      "sep",
      {
        label: "Close all tabs…",
        icon: "archive",
        danger: true,
        disabled: !n ? "No tabs in it" : newer("closeAll"),
        confirm: { title: `Close all tabs in deck ${name}?`, text: `Its ${n === 1 ? "tab closes" : `${n} tabs close`} (chats are archived)${last ? "" : " and the deck goes away"}. ⌘Z brings them back.`, ok: "Close all" },
        run: () => {
          logNav("deck-close-all", id, "decks.closeAll (confirmed)");
          if (D.closeAll(ws, id) === null) toast("Couldn't close them");
          changed();
        },
      },
      {
        label: "Remove deck…",
        icon: "trash-2",
        danger: true,
        disabled: last ? "A branch always keeps one deck" : false,
        confirm: { title: t.title, text: t.text, ok: "Remove" },
        run: () => {
          logNav("deck-remove", id, "decks.remove (context menu, confirmed)");
          return Promise.resolve(deckCall("remove", ws, id)).finally(changed);
        },
      },
    ];
    rowMenu.open(e, items, `Deck ${name}`, row, { anchor: true });
  }
  // The removed deck's tabs join the active deck; removing the active one first
  // switches to its neighbor (the dock's decks.remove).
  function deckRemovalText(ws, id, name) {
    const dk = deckInfo(ws);
    const list = dk ? dk.list : [];
    const i = list.findIndex((d) => String(d.id) === String(id));
    const d = list[i];
    const to = !dk ? null : String(dk.current.id) !== String(id) ? dk.current : list[i + 1] || list[i - 1] || null;
    const n = d ? (Array.isArray(d.tabs) ? d.tabs.length : Number(d.paneCount) || 0) : 0;
    const toName = to ? `deck ${deckLabel(to.name) || to.id}` : "another deck";
    return {
      title: `Remove deck ${name || deckLabel(d && d.name) || id}?`,
      text: n === 0 ? "It has no tabs." : n === 1 ? `Its tab goes back to ${toName}.` : `Its ${n} tabs go back to ${toName}.`,
    };
  }
  function onTreeContext(e) {
    const row = e.target.closest(".rtps-row[data-deck-id]");
    if (!row || !decksApi()) {
      // not a deck row: a chat's or a tab's menu, the project's, or the
      // worktree's (anywhere else in its card)
      const item = e.target.closest('.rtps-card .rtps-row[data-kind="chat"], .rtps-card .rtps-row[data-kind="subchat"], .rtps-card .rtps-row[data-kind="panel"]');
      const ref = item && rowRef(item);
      if (ref) {
        e.preventDefault();
        return ref.kind === "c" ? chatMenu(e, item, ref) : tabMenu(e, item, ref);
      }
      const proj = e.target.closest('.rtps-row[data-kind="project"]');
      const card = !proj && e.target.closest(".rtps-card");
      if (!proj && !card) return;
      e.preventDefault();
      return proj ? projectMenu(e, proj) : worktreeMenu(e, card);
    }
    e.preventDefault();
    return deckMenu(e, row);
  }

  // ------------------------------------------------- context menus (tree)
  // Right-click menus for every level of the tree, drawn like the app's own
  // right-click menu (Base UI ContextMenu: surface-container, 1px border-primary,
  // 6px padding, 32px items 13/16 weight 500, 8px separators, scale .95 -> 1 in
  // 100 ms). An item: { label, icon, kbd, danger, disabled: false | "reason",
  // run(), sub: [items], confirm: { title, text, ok } }, or "sep". A disabled
  // item says why (tooltip + aria-description) and stays open on click. A
  // confirmed item turns the menu into a small alert dialog in place (Cancel
  // focused; Enter acts on the focused button, so it cancels unless the red
  // button has the focus; Esc cancels): the app's own dialogs are React state
  // the mod cannot reach. Keyboard: ↑ ↓ Home End, → or Enter opens a submenu,
  // ← closes it, Esc closes. Opens at the pointer (at the row from the keyboard).
  const rowMenu = (() => {
    let el = null;
    let subEl = null;
    let list = [];
    let subList = [];
    let subOf = -1;
    let back = null; // the element focused before (focus returns there)
    const isSep = (it) => it === "sep";
    function itemHtml(it, i) {
      if (isSep(it)) return '<div class="rtps-ctx-sep" role="separator"></div>';
      const dis = it.disabled ? ` aria-disabled="true" title="${escapeHtml(it.disabled)}" aria-description="${escapeHtml(it.disabled)}"` : "";
      const tail = it.sub ? `<span class="rtps-ctx-chev">${luc("chevron-right")}</span>` : it.kbd ? `<span class="rtps-ctx-kbd">${escapeHtml(it.kbd)}</span>` : "";
      return (
        `<button type="button" role="menuitem" class="rtps-ctx-item${it.danger ? " rtps-ctx-danger" : ""}" data-i="${i}"${it.sub ? ' aria-haspopup="menu" aria-expanded="false"' : ""}${dis} tabindex="-1">` +
        `<span class="rtps-ctx-ic">${it.icon ? luc(it.icon) : ""}</span><span class="rtps-ctx-label">${escapeHtml(it.label)}</span>${tail}</button>`
      );
    }
    function build(host, items, label) {
      host.className = "rtps-ctx-menu";
      host.setAttribute("role", "menu");
      host.setAttribute("aria-label", label || "Actions");
      host.removeAttribute("aria-labelledby");
      host.removeAttribute("aria-describedby");
      host.removeAttribute("data-confirm");
      host.innerHTML = items.map(itemHtml).join("");
    }
    function place(host, x, y, alt, above) {
      const w = host.offsetWidth;
      const h = host.offsetHeight;
      let left = x;
      let top = y;
      if (left + w > innerWidth - 8) left = alt != null ? alt - w : innerWidth - 8 - w; // a submenu flips to the other side
      if (top + h > innerHeight - 8) top = above != null ? above - h : Math.max(8, innerHeight - 8 - h); // anchored: above the row
      host.style.left = `${Math.round(Math.max(8, left))}px`;
      host.style.top = `${Math.round(Math.max(8, top))}px`;
    }
    const buttons = (host) => Array.from(host.querySelectorAll(".rtps-ctx-item"));
    function closeSub() {
      if (subEl) subEl.remove();
      subEl = null;
      subList = [];
      if (subOf >= 0 && el) {
        const t = el.querySelector(`.rtps-ctx-item[data-i="${subOf}"]`);
        if (t) t.setAttribute("aria-expanded", "false");
      }
      subOf = -1;
    }
    function openSub(i, focusFirst) {
      if (subOf === i && subEl) {
        // opened by hover: → / Enter still move the focus into it
        if (focusFirst) {
          const b = buttons(subEl).find((x) => !x.hasAttribute("aria-disabled"));
          if (b) b.focus();
        }
        return;
      }
      closeSub();
      const it = list[i];
      const trig = el.querySelector(`.rtps-ctx-item[data-i="${i}"]`);
      if (!it || !it.sub || !trig || it.disabled) return;
      subOf = i;
      subList = it.sub;
      subEl = document.createElement("div");
      document.body.appendChild(subEl);
      build(subEl, subList, it.label);
      subEl.dataset.sub = "";
      wire(subEl, () => subList, true);
      const r = trig.getBoundingClientRect();
      place(subEl, r.right + 4, r.top - 7, r.left - 4);
      trig.setAttribute("aria-expanded", "true");
      if (focusFirst) {
        const b = buttons(subEl).find((x) => !x.hasAttribute("aria-disabled"));
        if (b) b.focus({ preventScroll: true });
      }
    }
    function act(items, i, inSub) {
      const it = items[i];
      if (!it || isSep(it) || it.disabled) return;
      if (it.sub) return openSub(i, true);
      if (it.confirm) return confirmIn(it);
      close(true); // the focus back on the row it came from (an action that moves it, like rename, takes it after)
      try {
        Promise.resolve(it.run && it.run()).catch((err) => toast(String((err && err.message) || err).slice(0, 120)));
      } catch (err) {
        toast(String((err && err.message) || err).slice(0, 120));
      }
      void inSub;
    }
    function confirmIn(it) {
      closeSub();
      const c = it.confirm;
      el.style.width = `${Math.max(el.offsetWidth, 220)}px`;
      el.dataset.confirm = "";
      el.setAttribute("role", "alertdialog");
      el.removeAttribute("aria-label");
      el.setAttribute("aria-labelledby", "rtps-ctx-confirm-title");
      el.setAttribute("aria-describedby", "rtps-ctx-confirm-text");
      el.innerHTML =
        `<div class="rtps-ctx-confirm-title" id="rtps-ctx-confirm-title">${escapeHtml(c.title)}</div>` +
        `<div class="rtps-ctx-confirm-text" id="rtps-ctx-confirm-text">${escapeHtml(c.text)}</div>` +
        `<div class="rtps-ctx-confirm-actions"><button type="button" data-ctx="cancel">Cancel</button><button type="button" class="rtps-ctx-confirm-ok" data-ctx="ok">${escapeHtml(c.ok || "Delete")}</button></div>`;
      el._confirm = it;
      const r = el.getBoundingClientRect();
      place(el, r.left, r.top);
      el.querySelector('[data-ctx="cancel"]').focus({ preventScroll: true });
    }
    function wire(host, getItems, inSub) {
      host.addEventListener("click", (e) => {
        const c = e.target.closest("[data-ctx]");
        if (c && host === el && el._confirm) {
          const it = el._confirm;
          close(true);
          if (c.dataset.ctx === "ok")
            Promise.resolve()
              .then(() => it.run && it.run())
              .catch((err) => toast(String((err && err.message) || err).slice(0, 120)));
          return;
        }
        const b = e.target.closest(".rtps-ctx-item");
        if (b) act(getItems(), Number(b.dataset.i), inSub);
      });
      host.addEventListener("mouseover", (e) => {
        const b = e.target.closest(".rtps-ctx-item");
        if (!b || host.hasAttribute("data-confirm")) return;
        if (document.activeElement !== b) b.focus({ preventScroll: true });
        if (!inSub) {
          const i = Number(b.dataset.i);
          if (list[i] && list[i].sub && !list[i].disabled) openSub(i, false);
          else closeSub();
        }
      });
      host.addEventListener("keydown", (e) => onKeyIn(e, host, getItems, inSub));
    }
    function onKeyIn(e, host, getItems, inSub) {
      if (host.hasAttribute("data-confirm")) {
        // Enter / Space act on the focused button only (the browser's own
        // activation, handled by the click listener): with Cancel focused, as it
        // opens, Enter cancels; the destructive action needs its own button
        if (e.key === "Escape") {
          e.preventDefault();
          close(true);
        } else if (e.key === "Tab") {
          const bs = Array.from(host.querySelectorAll("button"));
          const i = bs.indexOf(document.activeElement);
          e.preventDefault();
          bs[(i + (e.shiftKey ? bs.length - 1 : 1)) % bs.length].focus();
        }
        e.stopPropagation();
        return;
      }
      const bs = buttons(host);
      const i = bs.indexOf(document.activeElement);
      const move = (d) => {
        if (!bs.length) return;
        let k = i;
        for (let n = 0; n < bs.length; n++) {
          k = (k + d + bs.length) % bs.length;
          if (!bs[k].hasAttribute("aria-disabled")) break;
        }
        bs[k].focus();
      };
      if (e.key === "ArrowDown") move(1);
      else if (e.key === "ArrowUp") move(i < 0 ? 0 : -1);
      else if (e.key === "Home") (bs.find((b) => !b.hasAttribute("aria-disabled")) || bs[0]).focus();
      else if (e.key === "End") (bs.reverse().find((b) => !b.hasAttribute("aria-disabled")) || bs[0]).focus();
      else if (e.key === "ArrowRight" && !inSub && i >= 0 && getItems()[Number(bs[i].dataset.i)].sub) openSub(Number(bs[i].dataset.i), true);
      else if ((e.key === "ArrowLeft" || e.key === "Escape") && inSub) {
        const t = el.querySelector(`.rtps-ctx-item[data-i="${subOf}"]`);
        closeSub();
        if (t) t.focus({ preventScroll: true });
      } else if (e.key === "Escape") close(true);
      else if ((e.key === "Enter" || e.key === " ") && i >= 0) act(getItems(), Number(bs[i].dataset.i), inSub);
      else return;
      e.preventDefault();
      e.stopPropagation();
    }
    function outside(e) {
      if ((el && el.contains(e.target)) || (subEl && subEl.contains(e.target))) return;
      close(false);
    }
    function close(refocus) {
      closeSub();
      if (!el) return;
      const had = el.contains(document.activeElement);
      el.remove();
      el = null;
      list = [];
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onBlur);
      if (refocus && had && back && back.isConnected) back.focus({ preventScroll: true });
      back = null;
    }
    const onBlur = () => close(false);
    // e: the contextmenu event (or null); at: the element it belongs to;
    // opts.anchor: under the row (8px in, 4px below; above it without room)
    // instead of at the pointer
    function open(e, items, label, at, opts) {
      close(false);
      list = items;
      back = at && at.focus ? at : null;
      el = document.createElement("div");
      document.body.appendChild(el);
      build(el, list, label);
      wire(el, () => list, false);
      const fromKeys = !e || (!e.clientX && !e.clientY);
      const anchored = fromKeys || !!(opts && opts.anchor);
      const r = at ? at.getBoundingClientRect() : { left: 8, top: 8, bottom: 8 };
      if (anchored) place(el, r.left + 8, r.bottom + 4, null, r.top - 4);
      else place(el, e.clientX, e.clientY);
      if (anchored) {
        const b = buttons(el).find((x) => !x.hasAttribute("aria-disabled"));
        if (b) b.focus({ preventScroll: true });
      } else {
        el.tabIndex = -1;
        el.focus({ preventScroll: true });
      }
      setTimeout(() => document.addEventListener("pointerdown", outside, true), 0);
      window.addEventListener("blur", onBlur);
      window.addEventListener("resize", onBlur);
      return el;
    }
    // the editor's name for "Open in", read once (async) and kept: undefined while
    // unknown (the item stays usable), null once the app says there is none
    let editorName;
    let editorAsked = false;
    function readEditor() {
      if (editorAsked) return;
      editorAsked = true;
      const api = window.electronAPI && window.electronAPI.workspaces;
      const svc = W() && W().service;
      const f = api && typeof api.getDefaultEditor === "function" ? () => api.getDefaultEditor() : svc && typeof svc.getDefaultEditor === "function" ? () => svc.getDefaultEditor() : null;
      if (!f)
        return;
      Promise.resolve()
        .then(f)
        .then((r) => {
          editorName = (r && (r.name || (r.data && r.data.name))) || null;
        })
        .catch(() => {});
    }
    return { open, close, readEditor, editor: () => editorName, get el() { return el; }, get subEl() { return subEl; } };
  })();

  // A folder's "Open in" submenu (the app's own set): Finder, the default editor,
  // Terminal, the integrated terminal, Copy path. Through the Electron service
  // (electronAPI.workspaces.openInApp / copyPath) and the app's terminal event.
  function openInItems(path, wsId) {
    const api = window.electronAPI && window.electronAPI.workspaces;
    const why = !path ? "No local folder" : !api ? "Not available in this window" : false;
    const run = (kind) => () => Promise.resolve(api.openInApp(path, kind)).then((r) => r && r.success === false && toast(r.error || `Couldn't open in ${kind}`));
    rowMenu.readEditor();
    const ed = rowMenu.editor();
    return [
      { label: "Finder", icon: "folder-open", disabled: why || (typeof api.openInApp !== "function" && "Not available in this window"), run: run("finder") },
      { label: ed || "Editor", icon: "file", disabled: why || (ed === null ? "No default editor set" : false), run: run("editor") },
      { label: "Terminal", icon: "terminal", disabled: why, run: run("terminal") },
      {
        label: "Integrated terminal",
        icon: "square-terminal",
        disabled: !path ? "No local folder" : false,
        run: () => window.dispatchEvent(new CustomEvent("tempo:workspaces:terminal-run-request", { detail: { runId: `open-terminal-${Date.now()}`, title: "Terminal", cwd: path, commands: [], targetWorkspaceId: wsId || undefined } })),
      },
      "sep",
      { label: "Copy path", icon: "copy", disabled: !path ? "No local folder" : false, run: () => copyText(path, "Path copied", api && typeof api.copyPath === "function" ? () => api.copyPath(path) : null) },
    ];
  }
  async function copyText(text, done, native) {
    try {
      if (native) await native();
      else await navigator.clipboard.writeText(text);
      toast(done);
    } catch (_) {
      toast("Couldn't copy");
    }
  }
  // The app's WorkspaceSidebar handlers (toasts, guards, undo), when that view
  // has been mounted once (it stays mounted, hidden): null otherwise.
  const shellProps = () => {
    const el = document.querySelector('[data-testid="workspace-sidebar"]');
    return el ? propsUp(el, (p) => typeof p.onWorkspaceArchive === "function" || typeof p.onProjectRename === "function", 40) : null;
  };
  // The element a menu was opened on, as it is in the tree now (found again by
  // its key: a rebuild may have replaced it), then `sel` inside it; null if gone.
  function liveRow(el, sel) {
    const k = el && (el.dataset.key != null ? ["data-key", el.dataset.key] : el.dataset.pkey != null ? ["data-pkey", el.dataset.pkey] : null);
    const now = el && el.isConnected ? el : k && treeEl ? treeEl.querySelector(`[${k[0]}="${CSS.escape(k[1])}"]`) : null;
    return now ? now.querySelector(sel) : null;
  }
  // In-place rename of a row's label (project, worktree, chat, terminal): Enter /
  // blur commit, Esc cancels; the tree does not rebuild while the field is open.
  // `label` is resolved when the item runs (the row may have been rebuilt or be
  // gone since the menu opened): nothing happens on a label not in the page.
  function inlineRename(getLabel, value, aria, commit) {
    const label = typeof getLabel === "function" ? getLabel() : getLabel;
    if (!label || !label.isConnected || deckEdit) {
      if (!deckEdit) toast("That row is no longer in the list");
      return;
    }
    const input = document.createElement("input");
    input.className = "rtps-deck-input rtps-rename-input";
    input.value = value || "";
    input.setAttribute("aria-label", aria);
    input.spellcheck = false;
    label.replaceWith(input);
    deckEdit = { rename: aria, input };
    input.focus({ preventScroll: true });
    input.select();
    const done = (ok) => {
      if (!deckEdit) return;
      deckEdit = null;
      const v = input.value.trim();
      if (ok && v && v !== value)
        Promise.resolve()
          .then(() => commit(v))
          .catch((err) => toast(String((err && err.message) || err).slice(0, 120)))
          .finally(() => render(true));
      render(true);
    };
    input.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") done(true);
      else if (ev.key === "Escape") done(false);
    });
    input.addEventListener("blur", () => done(true));
    for (const t of ["click", "dblclick", "pointerdown", "contextmenu"]) input.addEventListener(t, (ev) => ev.stopPropagation());
  }
  // The project's menu: new workspace / from a branch, Open in, Rename,
  // Settings, Remove from Tempo (confirmed by the mod: it deletes the project's
  // local worktrees and chats from disk).
  function projectMenu(e, row) {
    const pid = (row.dataset.key || "").slice(2);
    const st = W();
    const p = st && (st.projects || []).find((x) => x && String(x.id) === pid);
    if (!p) return;
    const name = p.name || p.folderName || "project";
    const local = (st.workspaces || []).find((w) => w && String(w.projectId) === pid && w.mode === "local");
    const path = (Array.isArray(p.repos) && p.repos[0] && p.repos[0].path) || (local && local.path) || "";
    const sp = shellProps();
    const items = [
      { label: "New workspace", icon: "plus", disabled: typeof st.createLocalWorktree === "function" ? false : "Not available", run: () => Promise.resolve(W().createLocalWorktree(pid)).catch(() => toast("Couldn't create a workspace")) },
      { label: "New worktree from a branch…", icon: "git-branch", run: () => openBranchMenu(pid) },
      "sep",
      { label: "Open in", icon: "folder-open", sub: openInItems(path, local && local.id), disabled: path ? false : "No local folder" },
      "sep",
      {
        label: "Rename…",
        icon: "pencil",
        disabled: p.renameable === false ? "This project can't be renamed" : sp && typeof sp.onProjectRename === "function" ? false : typeof st.renameProject === "function" ? false : "Not available",
        run: () =>
          inlineRename(() => liveRow(row, ".rtps-label"), name, "Project name", (v) => {
            const s2 = shellProps();
            logNav("project-rename", pid, s2 && typeof s2.onProjectRename === "function" ? "onProjectRename" : "renameProject");
            return s2 && typeof s2.onProjectRename === "function" ? s2.onProjectRename(pid, v) : W().renameProject(pid, v);
          }),
      },
      { label: "Project settings", icon: "settings", disabled: sp && typeof sp.onProjectSettings === "function" ? false : "Open the Chats view once to use this", run: () => shellProps().onProjectSettings(pid) },
      "sep",
      {
        label: "Remove from Tempo…",
        icon: "trash-2",
        danger: true,
        disabled: typeof st.deleteProject === "function" ? false : "Not available",
        confirm: { title: `Remove ${name} from Tempo?`, text: "This deletes its local worktrees and their chats from this computer. It can't be undone.", ok: "Remove" },
        run: () => {
          logNav("project-remove", pid, "deleteProject (confirmed)");
          return Promise.resolve(W().deleteProject(pid)).then(() => toast(`Removed ${name}`));
        },
      },
    ];
    rowMenu.open(e, items, `Project ${name}`, row);
  }
  // A worktree's menu (the whole card): new chat / canvas / doc / issue /
  // terminal / browser (switching to it first when it is not the current one),
  // Open in, Copy branch, Rename, Pin, Archive (the app's toast with Undo when
  // its handler is reachable), Delete (confirmed by the mod).
  function worktreeMenu(e, card) {
    const wsId = (card.dataset.pkey || "").replace(/^card:w:/, "");
    const st = W();
    const w = st && (st.workspaces || []).find((x) => x && String(x.id) === wsId);
    if (!w) return;
    const name = w.name || branchLabel(w);
    const isLocal = w.mode === "local";
    const branch = (w.repo && (w.repo.currentBranch || "").trim()) || "";
    const sp = shellProps();
    const dock = window.__RE_TEMPO_PANE_DOCK__;
    const plus = dock && typeof dock.plusItems === "function" ? (() => { try { return dock.plusItems(); } catch (_) { return []; } })() : [];
    const here = st.selectedWorkspaceId === w.id;
    const goThere = async () => {
      if (W().selectedWorkspaceId === w.id) return true;
      const fn = typeof W().switchToWorkspace === "function" ? W().switchToWorkspace : W().selectWorkspace;
      if (typeof fn !== "function") return false;
      await Promise.resolve(fn(w.id)).catch(() => {});
      return !!(await waitFor(() => W() && W().selectedWorkspaceId === w.id, 2500));
    };
    const newItem = (id, label, icon) => {
      const it = plus.find((x) => x && x.id === id);
      return {
        label,
        icon,
        disabled: !it ? "Needs the chat view" : here && it.enabled === false ? "Not available here" : false,
        run: async () => {
          if (!(await goThere())) return toast("Couldn't switch to that workspace");
          goRoute("chat");
          await waitFor(() => (dock.plusItems().find((x) => x.id === id) || {}).enabled !== false, 1500, 100);
          if (!dock.runPlusItem("main", id)) toast(`Couldn't run ${label}`);
        },
      };
    };
    const running = typeof st.isWorkspaceChatInProgress === "function" && (() => { try { return !!st.isWorkspaceChatInProgress(w.id); } catch (_) { return false; } })();
    const items = [
      {
        label: "New chat",
        icon: "message-square",
        disabled: sp && typeof sp.onChatCreate === "function" ? false : typeof st.createChatTabInWorkspace === "function" ? false : "Not available",
        run: () => {
          const s2 = shellProps();
          logNav("ws-new-chat", w.id, s2 && typeof s2.onChatCreate === "function" ? "onChatCreate" : "createChatTabInWorkspace");
          return s2 && typeof s2.onChatCreate === "function" ? s2.onChatCreate(w.id) : W().createChatTabInWorkspace(w.id);
        },
      },
      newItem("canvas", "New canvas", "frame"),
      newItem("prd", "New doc", "file"),
      newItem("issue", "New issue", "circle-dot"),
      {
        label: "New terminal",
        icon: "square-terminal",
        disabled: typeof st.openTerminalTabInWorkspace === "function" || typeof st.openTerminalTab === "function" ? false : "Not available",
        run: () => (typeof W().openTerminalTabInWorkspace === "function" ? W().openTerminalTabInWorkspace(w.id) : goThere().then((ok) => ok && W().openTerminalTab())),
      },
      newItem("browser", "New browser", "globe"),
      "sep",
      { label: "Open in", icon: "folder-open", sub: openInItems(w.path || "", w.id), disabled: w.path ? false : "No local folder" },
      { label: "Copy branch", icon: "git-branch", disabled: branch ? false : "No branch", run: () => copyText(branch, "Branch copied") },
      "sep",
      {
        label: "Rename…",
        icon: "pencil",
        disabled: isLocal ? "The primary checkout is named after its folder" : typeof st.renameWorkspace === "function" ? false : "Not available",
        run: () =>
          inlineRename(() => liveRow(card, ".rtps-cardhead .rtps-card-title > .rtps-label"), name, "Workspace name", (v) => {
            logNav("ws-rename", w.id, "renameWorkspace");
            return W().renameWorkspace(w.id, v);
          }),
      },
      { label: w.isPinned || w.pinned ? "Unpin workspace" : "Pin workspace", icon: "pin", disabled: typeof st.toggleWorkspacePin === "function" ? false : "Not available", run: () => W().toggleWorkspacePin(w.id) },
      "sep",
      {
        label: "Archive workspace",
        icon: "archive",
        disabled: isLocal ? "The primary checkout can't be archived" : running ? "A chat is running in it" : (sp && typeof sp.onWorkspaceArchive === "function") || typeof st.archiveWorkspace === "function" ? false : "Not available",
        run: () => {
          const s2 = shellProps();
          logNav("ws-archive", w.id, s2 && typeof s2.onWorkspaceArchive === "function" ? "onWorkspaceArchive" : "archiveWorkspace");
          if (s2 && typeof s2.onWorkspaceArchive === "function") return s2.onWorkspaceArchive(w.id); // the app's toast with Undo
          const r = W().archiveWorkspace(w.id);
          return Promise.resolve(r).then((x) => toast(x && x.ok === false ? x.message || "Couldn't archive it" : `Archived ${name}`));
        },
      },
      {
        label: "Delete workspace…",
        icon: "trash-2",
        danger: true,
        disabled: isLocal ? "The primary checkout can't be deleted" : typeof st.deleteWorkspace === "function" ? false : "Not available",
        confirm: { title: "Delete workspace?", text: `This will permanently delete ${name} and all its chats. This action cannot be undone.`, ok: "Delete" },
        run: () => {
          logNav("ws-delete", w.id, "deleteWorkspace (confirmed)");
          return Promise.resolve(W().deleteWorkspace(w.id)).then(() => toast(`Deleted ${name}`));
        },
      },
    ];
    rowMenu.open(e, items, `Workspace ${name}`, card.querySelector(".rtps-cardhead") || card);
  }
  // A row's workspace and tab: c:<ws>:<chat> / t:<ws>:<tab> (a key can carry "@<deck>")
  function rowRef(row) {
    const m = /^([ct]):([^:]+):(.+?)(?:@[^@]*)?$/.exec(row.dataset.key || "");
    if (!m) return null;
    const st = W();
    const ws = m[2];
    const w = st && (st.workspaces || []).find((x) => x && String(x.id) === ws);
    const tabs = st && ws === String(st.selectedWorkspaceId) && Array.isArray(st.centerTabs) ? st.centerTabs : (w && w.centerTabs) || [];
    const tab = tabs.find((t) => t && String(t.id) === m[3]) || null;
    return { kind: m[1], ws, id: m[3], w, tab, here: !!st && ws === String(st.selectedWorkspaceId) };
  }
  // switch to a workspace (if it is not the current one), on the chat route
  async function showWorkspace(ws) {
    goRoute("chat");
    if (W() && String(W().selectedWorkspaceId) === ws) return true;
    const fn = W() && (typeof W().switchToWorkspace === "function" ? W().switchToWorkspace : W().selectWorkspace);
    if (typeof fn !== "function") return false;
    await Promise.resolve(fn(ws)).catch(() => {});
    return !!(await waitFor(() => W() && String(W().selectedWorkspaceId) === ws, 2500));
  }
  // "Open in split view": pane-dock's split, as a drop on the right half of the center
  function splitItem(ref) {
    const dock = window.__RE_TEMPO_PANE_DOCK__;
    return {
      label: "Open in split view",
      icon: "panel-left",
      disabled: dock && typeof dock.split === "function" ? false : "Needs pane-dock",
      run: async () => {
        if (!(await showWorkspace(ref.ws))) return toast("Couldn't switch to that workspace");
        // the dock follows a switch on its own next tick: try until it knows the tab
        if (!(await waitFor(() => dock.split(ref.id, "right"), 1500, 100))) toast("Couldn't open it in a split");
      },
    };
  }
  // "Move to deck ▸": pane-dock's moveTabs, to any other deck of that worktree
  function moveToDeckItem(row, ref) {
    const D = decksApi();
    const dk = D ? deckInfo(ref.ws) : null;
    const blk = row.closest(".rtps-deckblock");
    const here = blk ? (blk.dataset.pkey || "").split(":").pop() : null;
    const others = dk ? dk.list.filter((d) => deckKey(d) !== here) : [];
    if (!dk || dk.list.length < 2) return null;
    return {
      label: "Move to deck",
      icon: "layout-list",
      disabled: typeof D.moveTabs !== "function" ? "Needs a newer pane-dock" : others.length ? false : "No other deck",
      sub: others.map((o) => ({
        label: `Deck ${deckLabel(o.name) || o.id}`,
        run: () => {
          const k = D.moveTabs(ref.ws, [ref.id], o.id);
          logNav("tab-move-deck", ref.id, `moveTabs -> ${o.id}: ${k}`);
          if (!k) toast("Couldn't move it");
          decksVersion++;
          schedule();
        },
      })),
    };
  }
  // "Open in new window": the app's popout (its store's detach); not for terminals
  function windowItem(ref, desc, why) {
    const pq = S.pq ? (() => { try { return S.pq(); } catch (_) { return null; } })() : null;
    return {
      label: "Open in new window",
      icon: "app-window",
      disabled: why || (pq && typeof pq.detach === "function" ? false : "Not available yet"),
      run: () => {
        const ok = S.pq().detach(desc, { width: 960, height: 720, anchorX: (window.screenX || 0) + 80, anchorY: (window.screenY || 0) + 80 });
        if (!ok) toast("Couldn't open it in a window");
      },
    };
  }
  // A chat's menu: open, split, window, rename, mark as unread, archive, delete
  // (confirmed by the mod unless the app's "don't ask again" is set; the app
  // deletes only in the current workspace, so it switches there first).
  function chatMenu(e, row, ref) {
    const st = W();
    const t = ref.tab || {};
    const name = t.name || (row.querySelector(".rtps-title, .rtps-label") || row).textContent.trim() || "chat";
    const running = row.dataset.status === "running" || row.dataset.status === "waiting";
    const act = actions.get(row.dataset.key) || {};
    const items = [
      { label: "Open", icon: "message-square", disabled: act.activate ? false : "Not available", run: () => act.activate() },
      splitItem(ref),
      windowItem(ref, { id: `chat:${ref.ws}:${ref.id}`, kind: "chat", source: "chat", workspaceId: ref.ws, chatTabId: ref.id, title: name }),
      moveToDeckItem(row, ref),
      "sep",
      {
        label: "Rename…",
        icon: "pencil",
        disabled: typeof st.renameChatTab === "function" ? false : "Not available",
        run: () => inlineRename(() => liveRow(row, ".rtps-title") || liveRow(row, ".rtps-label"), name, "Chat name", (v) => {
          logNav("chat-rename", ref.id, "renameChatTab");
          return W().renameChatTab(ref.ws, ref.id, v);
        }),
      },
      { label: "Mark as unread", icon: "dot", disabled: typeof st.markChatTabUnread === "function" ? false : "Not available", run: () => W().markChatTabUnread(ref.ws, ref.id) },
      "sep",
      {
        label: "Archive",
        icon: "archive",
        disabled: running ? "It is running" : typeof st.archiveChatTab === "function" ? false : "Not available",
        run: () => {
          logNav("chat-archive", ref.id, "archiveChatTab");
          if (W().archiveChatTab(ref.ws, ref.id) === false) toast("The app kept it (running, or the workspace's main chat)");
        },
      },
      {
        label: "Delete chat…",
        icon: "trash-2",
        danger: true,
        disabled: t.createdByAgent ? "Created by an agent: archive it instead" : typeof st.closeChatTab === "function" ? false : "Not available",
        confirm: lsGet("tempo:skipCloseChatTabConfirm") === "true" ? null : { title: `Delete ${name}?`, text: "This deletes the conversation. ⌘⇧T brings it back while the app is open.", ok: "Delete" },
        run: async () => {
          if (!(await showWorkspace(ref.ws))) return toast("Couldn't switch to that workspace");
          logNav("chat-delete", ref.id, "closeChatTab (confirmed)");
          if (W().closeChatTab(ref.id) === false) toast("The app kept it");
        },
      },
    ];
    if (!items[items.length - 1].confirm) delete items[items.length - 1].confirm;
    rowMenu.open(e, items.filter(Boolean), `Chat ${name}`, row);
  }
  // A tab's menu (canvas, doc, issue, terminal, browser, file): open, split,
  // window (not a terminal), rename (a terminal's title; the others are renamed
  // where they live), reveal in Finder (a file on disk), copy URL (browser),
  // close (the current workspace's tabs; a terminal's process stops: confirmed).
  function tabMenu(e, row, ref) {
    const st = W();
    const t = ref.tab || {};
    const type = String(t.type || row.querySelector("[data-type]")?.dataset.type || "");
    const title = t.name || t.title || t.label || (row.querySelector(".rtps-label") || row).textContent.trim() || "tab";
    const term = /term/i.test(type);
    const act = actions.get(row.dataset.key) || {};
    const wpath = (ref.w && ref.w.path) || "";
    const disk = typeof t.filePath === "string" && t.filePath.startsWith("/") ? t.filePath : t.pageFolderPath != null && wpath ? `${wpath.replace(/\/$/, "")}/${String(t.pageFolderPath).replace(/^\//, "")}` : "";
    const api = window.electronAPI && window.electronAPI.workspaces;
    const renameWhy = term ? (typeof st.setTerminalTabTitle === "function" ? false : "Not available") : /canvas|design/i.test(type) ? "Rename it from the canvas pages" : /prd|doc/i.test(type) ? "Rename it in the doc" : /issue/i.test(type) ? "Rename it in the issue" : /browser|web/i.test(type) ? "Browser tabs take the page's title" : "Not available";
    const items = [
      { label: "Open", icon: term ? "square-terminal" : /browser|web/i.test(type) ? "globe" : /canvas|design/i.test(type) ? "frame" : "file", disabled: act.activate ? false : "Not available", run: () => act.activate() },
      splitItem(ref),
      windowItem(ref, { id: `center:${ref.ws}:${ref.id}`, kind: "center", source: "chat", workspaceId: ref.ws, tab: t, title }, term ? "Terminals can't open in a window" : false),
      moveToDeckItem(row, ref),
      "sep",
      {
        label: "Rename…",
        icon: "pencil",
        disabled: renameWhy,
        run: () => inlineRename(() => liveRow(row, ".rtps-label"), title, "Tab name", (v) => {
          logNav("tab-rename", ref.id, "setTerminalTabTitle");
          return W().setTerminalTabTitle(ref.id, v);
        }),
      },
      { label: "Reveal in Finder", icon: "folder-open", disabled: !disk ? "Not a file on disk" : api && typeof api.openInApp === "function" ? false : "Not available in this window", run: () => api.openInApp(disk, "finder") },
    ];
    if (/browser|web/i.test(type)) items.push({ label: "Copy URL", icon: "copy", disabled: t.url ? false : "No address yet", run: () => copyText(t.url, "URL copied") });
    items.push("sep", {
      label: term ? "Close terminal…" : "Close tab",
      icon: "trash-2",
      danger: term,
      disabled: !ref.here ? "Switch to its workspace to close it" : term ? (typeof st.closeTerminalTab === "function" ? false : "Not available") : typeof st.closeDiffTab === "function" ? false : "Not available",
      confirm: term ? { title: `Close ${title}?`, text: "Its process stops.", ok: "Close" } : undefined,
      run: () => {
        logNav("tab-close", ref.id, term ? "closeTerminalTab" : "closeDiffTab");
        return term ? W().closeTerminalTab(ref.id) : W().closeDiffTab(ref.id);
      },
    });
    if (!term) delete items[items.length - 1].confirm;
    rowMenu.open(e, items.filter(Boolean), `Tab ${title}`, row);
  }

  // Did the click land on the row's chevron? By target, else by position (its
  // box with a small margin, or the row's last 32px): a stylesheet that turns
  // the chevron's pointer events off must not make it dead.
  function onChev(e, row) {
    if (e.target.closest("[data-chev]")) return true;
    const ch = row.querySelector("[data-chev]");
    if (!ch || !(e.clientX || e.clientY)) return false;
    const r = ch.getBoundingClientRect();
    if (r.width && r.height) return e.clientX >= r.left - 6 && e.clientX <= r.right + 6 && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6;
    return e.clientX >= row.getBoundingClientRect().right - 32;
  }
  function onTreeClick(e) {
    const row = e.target.closest(".rtps-row");
    if (!row) return;
    // the deck name in the header is the rename target (double click), not a fold
    if (row.dataset.kind === "chats" && row.dataset.deckId && e.target.closest(".rtps-deck-name")) return;
    if (row.dataset.kind === "pill" || row.dataset.kind === "deck") {
      clearTimeout(deckClickT);
      const a = actions.get(row.dataset.key);
      if (e.detail > 1 || !a) return;
      if (onChev(e, row) && a.toggle) return void Promise.resolve(a.toggle()).finally(() => schedule());
      if (!a.activate) return;
      deckClickT = setTimeout(() => Promise.resolve(a.activate(e)).finally(() => schedule()), 220);
      return;
    }
    const a = actions.get(row.dataset.key);
    if (!a) return;
    const rb = e.target.closest("[data-row-act]");
    if (rb && typeof a[rb.dataset.rowAct] === "function") {
      e.stopPropagation();
      Promise.resolve(a[rb.dataset.rowAct]()).finally(() => schedule());
      return;
    }
    // the worktree header: select that worktree (no fold, no focus move)
    if (row.dataset.kind === "card") {
      if (a.activate) Promise.resolve(a.activate(e)).finally(() => schedule());
      return;
    }
    if (row.getAttribute("role") !== "treeitem") return;
    row.focus({ preventScroll: true });
    if ((onChev(e, row) && a.toggle) || !a.activate) {
      if (a.toggle) a.toggle();
      return;
    }
    Promise.resolve(a.activate(e)).finally(() => schedule());
  }

  // the rows the keyboard steps through: treeitems only (the worktree header,
  // role presentation, is skipped)
  // a deck's header changes key when it folds / unfolds (deck:… / b:…): the
  // focus follows it to the new row (same deck)
  function refocusDeck(row) {
    const { deckWs, deckId } = row.dataset;
    if (deckId == null || !treeEl || row.isConnected) return;
    const r = treeEl.querySelector(`.rtps-row[data-deck-ws="${CSS.escape(deckWs)}"][data-deck-id="${CSS.escape(deckId)}"]`);
    if (r) r.focus({ preventScroll: true });
  }
  function visibleRows() {
    return treeEl ? Array.from(treeEl.querySelectorAll('.rtps-row[role="treeitem"]')).filter((r) => !r.closest(".rtps-card-gone") && r.getClientRects().length > 0) : [];
  }
  function focusRow(i) {
    const rows = visibleRows();
    if (!rows.length) return;
    const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
    rows.forEach((x) => x.setAttribute("tabindex", x === r ? "0" : "-1"));
    r.focus();
  }
  function onTreeKey(e) {
    const row = e.target.closest(".rtps-row");
    if (!row) return;
    // the row's right-click menu from the keyboard (Shift+F10, the menu key):
    // anchored under the row, focus on its first item
    if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      return onTreeContext({ target: row, clientX: 0, clientY: 0, preventDefault() {} });
    }
    const rows = visibleRows();
    // a button inside a row (the worktree header's "+") keeps its own
    // Enter/Space and Tab; the arrows step into the tree from where it sits;
    // the worktree header itself (a button) acts on Enter / Space
    if (row.dataset.kind === "card" && e.target === row && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      const a = actions.get(row.dataset.key);
      if (a && a.activate) Promise.resolve(a.activate(e)).finally(() => schedule());
      return;
    }
    if ((e.target !== row && e.target.closest("button")) || row.dataset.kind === "card") {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const next = rows.findIndex((r) => r !== row && row.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (e.key === "ArrowDown") {
        if (next >= 0) focusRow(next);
      } else {
        const prev = (next < 0 ? rows.length : next) - 1;
        if (prev >= 0) focusRow(prev);
        else searchEl.focus();
      }
      return;
    }
    const i = rows.indexOf(row);
    const a = actions.get(row.dataset.key) || {};
    const exp = row.getAttribute("aria-expanded") || row.dataset.deckExpanded || null;
    const lvl = (r) => Number(r.getAttribute("aria-level")) || 1;
    if (e.key === "ArrowDown") focusRow(i + 1);
    else if (e.key === "ArrowUp") i === 0 ? searchEl.focus() : focusRow(i - 1);
    else if (e.key === "ArrowRight" && exp === "false") a.toggle && (a.toggle(), refocusDeck(row));
    else if (e.key === "ArrowRight" && exp === "true") focusRow(i + 1);
    else if (e.key === "ArrowLeft" && exp === "true") a.toggle && (a.toggle(), refocusDeck(row));
    else if (e.key === "ArrowLeft") {
      for (let j = i - 1; j >= 0; j--) if (lvl(rows[j]) < lvl(row)) return focusRow(j);
    } else if (e.key === "Enter" || e.key === " ") {
      if (a.activate) Promise.resolve(a.activate(e)).finally(() => schedule());
      else if (a.toggle) a.toggle();
    } else return;
    e.preventDefault();
  }

  function toast(text) {
    let t = document.querySelector(".rtps-toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "rtps-toast";
      t.setAttribute("role", "status");
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.dataset.show = "";
    clearTimeout(toastT);
    toastT = setTimeout(() => delete t.dataset.show, 1600);
  }

  // ------------------------------------------------------------------ render
  function context(st) {
    const td = window.__tempoDocs;
    const ti = window.__tempoIssues;
    const ag = agentsStore();
    let designProject = null;
    if (st.activeNavRoute === "design") {
      const side = document.querySelector(SEL.canvasSidebar);
      const sp = side && propsUp(side, (p) => p.selection && typeof p.onSelectionChange === "function", 12);
      designProject = (sp && sp.selection && sp.selection.projectId) || null;
    }
    return {
      route: st.activeNavRoute,
      ws: st.selectedWorkspaceId,
      chat: st.activeChatTabId,
      centerTab: st.activeCenterTabId || null,
      doc: td && td.selectedDocId,
      issue: ti && (ti.selectedIssueDocId || ti.selectedIssueId),
      agent: ag && ag.selectedAgentId,
      designProject,
      designTab: st.activeDesignTabId || null,
    };
  }

  // A rebuild patches the tree in place: rows (data-key) and their containers
  // (data-pkey) are matched by key and kept; only changed attributes or row
  // content are written, new ones inserted, gone ones removed. A row that did
  // not change keeps its DOM node, so focus, hover and scroll stay put.
  const pkeyOf = (el) => (el.nodeType !== 1 ? null : el.hasAttribute("data-key") ? "k" + el.getAttribute("data-key") : el.hasAttribute("data-pkey") ? "p" + el.getAttribute("data-pkey") : null);
  function patchAttrs(from, to) {
    for (const a of Array.from(from.attributes)) if (!to.hasAttribute(a.name)) from.removeAttribute(a.name);
    for (const a of Array.from(to.attributes)) if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
  }
  function patchChildren(parent, next) {
    const want = new Map();
    for (const n of Array.from(next.childNodes)) {
      const k = pkeyOf(n);
      if (k && !want.has(k)) want.set(k, n);
    }
    const have = new Map();
    for (const o of Array.from(parent.childNodes)) {
      const k = pkeyOf(o);
      const n = k && want.get(k);
      if (!n || have.has(k) || n.tagName !== o.tagName) parent.removeChild(o);
      else have.set(k, o);
    }
    let ref = parent.firstChild;
    for (const n of Array.from(next.childNodes)) {
      const k = pkeyOf(n);
      const o = k && want.get(k) === n ? have.get(k) : null;
      if (!o) {
        parent.insertBefore(n, ref);
        continue;
      }
      patchAttrs(o, n);
      if (o.hasAttribute("data-key")) {
        if (o.innerHTML !== n.innerHTML) o.innerHTML = n.innerHTML;
      } else patchChildren(o, n);
      if (o === ref) ref = ref.nextSibling;
      else parent.insertBefore(o, ref);
    }
  }

  // ------------------------------------------------------------- row motion
  // A card's rows that come, go or move between two renders animate (shared
  // motion language: 220 ms ease-out, transform and opacity only, 40 ms
  // stagger): a new row fades and settles in, a row that left fades out where
  // it was (its old node, kept for the exit with no key, so the next patch
  // drops it), rows that moved slide from their old place (FLIP). The first
  // render, a search or bell filter and big changes (a project unfolded) do
  // not animate.
  // Reduced motion: opacity only, 120 ms, nothing slides.
  const MOTION_ROW = ".rtps-card .rtps-row[data-key]";
  const MOTION_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
  const MOTION_MS = 220;
  const MOTION_EXIT_MS = 140;
  const MOTION_REDUCED_MS = 120;
  const MOTION_MAX = 10; // rows coming + going; past that, no motion
  let motionReady = false;
  let motionFilter = "";
  const motionReduced = () => {
    try {
      return matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  };
  function rowsBefore() {
    if (!treeEl || !root || root.hidden || !treeEl.getClientRects().length) return null;
    const m = new Map();
    for (const el of treeEl.querySelectorAll(MOTION_ROW)) {
      const r = el.getBoundingClientRect();
      if (r.height > 0) m.set(el.dataset.key, { el, parent: el.parentElement, top: r.top, left: r.left, width: r.width, height: r.height });
    }
    return m;
  }
  function rowExit(b, reduce, clone) {
    const g = clone ? b.el.cloneNode(true) : b.el;
    if (!b.parent || !b.parent.isConnected || g.isConnected) return;
    for (const a of ["data-key", "role", "tabindex", "aria-selected", "aria-expanded", "aria-level", "data-view-id", "data-view-ws"]) g.removeAttribute(a);
    g.setAttribute("data-rtps-leaving", "");
    g.setAttribute("aria-hidden", "true");
    g.inert = true;
    Object.assign(g.style, { position: "absolute", left: "0px", top: "0px", width: `${b.width}px`, height: `${b.height}px`, margin: "0", pointerEvents: "none" });
    b.parent.appendChild(g);
    const r = g.getBoundingClientRect();
    g.style.left = `${b.left - r.left}px`;
    g.style.top = `${b.top - r.top}px`;
    let anim = null;
    try {
      anim = g.animate(reduce ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: "translateX(0)" }, { opacity: 0, transform: "translateX(-6px)" }], { duration: reduce ? MOTION_REDUCED_MS : MOTION_EXIT_MS, easing: MOTION_EASE, fill: "forwards" });
    } catch (_) {}
    const drop = () => g.remove();
    if (anim) anim.onfinish = anim.oncancel = drop;
    setTimeout(drop, 600); // never stranded (a hidden window freezes the timeline)
  }
  // Rows kept in the same order relative to each other just slide; the fewest
  // rows that changed place (outside the longest run kept in order, or moved to
  // another container) cross-fade instead, out where they were and in where
  // they land, never sliding across the others.
  function reordered(before, now) {
    const keys = [];
    for (const k of now.keys()) if (before.has(k)) keys.push(k);
    const rank = new Map();
    let r = 0;
    for (const k of before.keys()) if (now.has(k)) rank.set(k, r++);
    const seq = keys.map((k) => rank.get(k));
    // longest increasing subsequence (patience sorting), kept as indexes into seq
    const tails = [];
    const prevIx = new Array(seq.length).fill(-1);
    for (let i = 0; i < seq.length; i++) {
      let lo = 0;
      let hi = tails.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (seq[tails[mid]] < seq[i]) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0) prevIx[i] = tails[lo - 1];
      tails[lo] = i;
    }
    const keep = new Set();
    for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prevIx[i]) keep.add(keys[i]);
    const out = new Set();
    for (const k of keys) if (!keep.has(k) || before.get(k).parent !== now.get(k).parentElement) out.add(k);
    return out;
  }
  function rowsAfter(before) {
    if (!before) return;
    const now = new Map();
    for (const el of treeEl.querySelectorAll(MOTION_ROW)) now.set(el.dataset.key, el);
    const added = [];
    for (const k of now.keys()) if (!before.has(k)) added.push(k);
    const gone = [];
    for (const k of before.keys()) if (!now.has(k)) gone.push(k);
    const moved = reordered(before, now);
    if (added.length + gone.length + moved.size > MOTION_MAX) return;
    const reduce = motionReduced();
    for (const k of gone) rowExit(before.get(k), reduce, false);
    for (const k of moved) rowExit(before.get(k), reduce, true);
    // rows that stay slide first; rows coming in wait until the room they land
    // in is mostly open (they would sit on a row still sliding away)
    const enter = [];
    let shifted = false;
    for (const [k, el] of now) {
      const b = moved.has(k) ? null : before.get(k);
      if (!b) {
        enter.push(el);
        continue;
      }
      if (reduce) continue;
      try {
        const r = el.getBoundingClientRect();
        const dy = b.top - r.top;
        if (r.height && Math.abs(dy) > 0.5 && Math.abs(dy) < 600) {
          el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: MOTION_MS, easing: MOTION_EASE });
          shifted = true;
        }
      } catch (_) {}
    }
    const wait = shifted ? 90 : 0;
    enter.forEach((el, i) => {
      try {
        if (!el.getBoundingClientRect().height) return;
        el.animate(reduce ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }], {
          duration: reduce ? MOTION_REDUCED_MS : MOTION_MS,
          delay: reduce ? 0 : wait + Math.min(i, 5) * 40,
          easing: MOTION_EASE,
          fill: "backwards",
        });
      } catch (_) {}
    });
  }

  let sig = "";
  let refs = [];
  // what openOf reads besides the store's arrays: every workspace's decks (their
  // center chat and tab, panes), the split, the popout windows' front tabs
  function decksSig(st) {
    const out = [st.splitPanelMode === true, st.leftPanelActiveTabId, st.rightPanelActiveTabId];
    if (decksApi())
      for (const w of st.workspaces || []) {
        const dk = w && deckInfo(w.id);
        if (dk) out.push(w.id, dk.list.map((d) => [d.id, d.name, d.active, d.chat, d.center, d.layout, d.tabs && d.tabs.length]));
      }
    try {
      const pq = S.pq && S.pq();
      out.push(pq && pq.activeByPopup);
    } catch (_) {}
    return JSON.stringify(out);
  }
  let cliSig = "";
  function render(force) {
    try {
      renderInner(force);
    } catch (err) {
      noteRenderError("render", err);
    }
  }
  function renderInner(force) {
    if (!root || !treeEl) return;
    // the inline rename field stays put; a lock whose field left the DOM (its row
    // went away) is dropped, so the tree never freezes on it
    if (deckEdit) {
      if (deckEdit.input && !deckEdit.input.isConnected) deckEdit = null;
      else return;
    }
    const st = W();
    if (!st) {
      treeEl.innerHTML = `<div class="rtps-empty">Waking up your projects…</div>`;
      return;
    }
    const ctx = context(st);
    const nextRefs = [st.workspaces, st.projects, st.centerTabs, phases(), popoutTabs(), inputDrafts()];
    readAgentSig();
    const nextSig = JSON.stringify([agentSig, ctx, R.version, expVersion, filterVersion, attention, search, overlaySig, cliSig, decksVersion, decksSig(st), closedSig(), Math.floor(Date.now() / 60000)]);
    if (!force && nextSig === sig && nextRefs.every((r, i) => r === refs[i])) return;
    sig = nextSig;
    refs = nextRefs;
    const model = buildModel();
    lastModel = model;
    if (!model) return;
    let nodes = buildNodes(model, ctx);
    const filtering = !!(search || attention);
    if (filtering) nodes = filterNodes(nodes, (n) => (!search || (!LEAFY.has(n.kind) && nodeText(n).includes(search))) && (!attention || !!n.attn));
    actions = new Map();
    const fe = treeEl.contains(document.activeElement) ? document.activeElement : null;
    const feRow = fe && fe.closest(".rtps-row");
    const hadFocus = feRow ? feRow.dataset.key : null;
    const hadAct = fe && fe !== feRow && fe.dataset.rowAct ? fe.dataset.rowAct : null;
    const scroll = treeEl.scrollTop; // kept across every rebuild (store, decks event, click)
    const frag = document.createDocumentFragment();
    emit(nodes, 0, 0, frag, filtering);
    if (!frag.childNodes.length)
      frag.appendChild(
        Object.assign(document.createElement("div"), {
          className: "rtps-empty",
          textContent: attention
            ? "All quiet. Nothing is running or waiting for you."
            : search
              ? `Nothing matches “${search}”.`
              : "No projects yet. Add one with the folder button and it lands here.",
        })
      );
    syncRail();
    syncHead();
    syncFoot();
    if (frag.firstChild && frag.firstChild.classList.contains("rtps-empty")) frag.firstChild.dataset.pkey = "empty";
    // the roving tabindex is chosen on the new rows, before the patch, so a
    // rebuild where nothing changed writes nothing to the DOM
    const live = (sel) => Array.from(frag.querySelectorAll(sel)).find((r) => !r.closest(".rtps-card-gone")) || null; // never a row of a card the undo hides
    const nextTab =
      (hadFocus && !hadAct && live(`.rtps-row[role="treeitem"][data-key="${CSS.escape(hadFocus)}"]`)) ||
      live('.rtps-row[role="treeitem"][aria-selected="true"]') ||
      live('.rtps-row[role="treeitem"]');
    if (nextTab) nextTab.setAttribute("tabindex", "0");
    const tabKey = nextTab ? nextTab.dataset.key : null;
    // rows animate between two plain renders of the same filter (see row motion)
    const filterKey = `${search}|${attention}`;
    const before = motionReady && !filtering && filterKey === motionFilter ? rowsBefore() : null;
    motionFilter = filterKey;
    patchChildren(treeEl, frag);
    if (typeof dropNew === "object") dropNew.afterPatch();
    if (treeEl.scrollTop !== scroll) treeEl.scrollTop = scroll;
    rowsAfter(before);
    motionReady = true;
    const tabRow = tabKey == null ? null : treeEl.querySelector(`.rtps-row[data-key="${CSS.escape(tabKey)}"]`);
    if (hadAct) {
      const btn = treeEl.querySelector(`.rtps-row[data-key="${CSS.escape(hadFocus)}"] [data-row-act="${CSS.escape(hadAct)}"]`);
      if (btn && document.activeElement !== btn) btn.focus({ preventScroll: true });
    } else if (hadFocus && tabRow && tabRow.dataset.key === hadFocus && document.activeElement !== tabRow) tabRow.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ layout
  function mark(el) {
    if (el && !el.hasAttribute(HIDDEN)) el.setAttribute(HIDDEN, "");
  }
  const isHandle = (s) =>
    !!s && (s.hasAttribute("data-panel-resize-handle-id") || s.hasAttribute("data-resize-handle") || s.hasAttribute("data-separator") || s.getAttribute("role") === "separator");
  function hideNative() {
    for (const el of document.querySelectorAll(SEL.leftPanel)) {
      mark(el);
      const n = el.nextElementSibling;
      if (n && !n.hasAttribute("data-tempo-workspace-panel") && !n.hasAttribute("data-panel")) mark(n);
      if (el.id) for (const h of document.querySelectorAll(`[aria-controls="${CSS.escape(el.id)}"]`)) if (isHandle(h)) mark(h);
    }
    for (const sel of SEL.native) {
      for (const el of document.querySelectorAll(sel)) {
        if (el.closest("[data-rtps-root]")) continue;
        mark(el);
        const p = el.parentElement;
        if (p && p.hasAttribute("data-panel") && p.childElementCount === 1) {
          mark(p);
          if (isHandle(p.previousElementSibling)) mark(p.previousElementSibling);
          if (isHandle(p.nextElementSibling)) mark(p.nextElementSibling);
        }
      }
    }
  }
  // ------------------------------------------------------------- rail group
  // The app's rail keeps its route buttons; right above them (below the org
  // avatar) the mod adds its group, the collapsed form of the sidebar: Search,
  // one avatar per project (the tree's order, same avatar as the project row),
  // Add project. Never both at once: while the sidebar is on screen the group
  // is gone (search, projects and "+" are in the sidebar). It is checked on
  // every tick (the rail re-renders): put back in place if moved or dropped,
  // patched by key only when something changed. Signed out or booting: none.
  //   mod off                       -> only "Show projects" (data-mode="off")
  //   on, collapsed (app's toggle)  -> nothing: the rail itself is hidden
  //   on, push failed (not placed)  -> the full group (data-mode="collapsed")
  //   on, sidebar on screen         -> no group
  const RAIL_ROUTES = ["chat", "docs", "design", "issues", "agents"].map((id) => `[data-testid="workspace-navbar-${id}-button"]`).join(",");
  const RAIL_GROUP = "data-rtps-rail-group";
  let railEl = null;
  let railSig = "";
  function railAnchor(rail) {
    const first = rail.querySelector(RAIL_ROUTES);
    if (!first) return null;
    let a = first; // the route button, or its own wrapper when it has one
    while (a.parentElement && a.parentElement !== rail && a.parentElement.querySelectorAll(RAIL_ROUTES).length === 1) a = a.parentElement;
    return a;
  }
  function syncRail() {
    const rail = document.querySelector(RAIL);
    const st = S.ws ? W() : null;
    if (!rail || !st) return removeRail();
    // expanded, the sidebar holds them; collapsed by the app's toggle, nothing at all
    // (rail hidden too, the workspace runs to the window's edge); the compact group
    // only stands in while the sidebar could not be placed
    if ((root && !root.hidden) || collapsed) return removeRail();
    if (!railEl || !railEl.isConnected || !rail.contains(railEl)) {
      for (const g of document.querySelectorAll(`[${RAIL_GROUP}]`)) g.remove();
      railEl = document.createElement("div");
      railEl.className = "rtps-rail";
      railEl.setAttribute(RAIL_GROUP, "");
      railEl.setAttribute("role", "group");
      railEl.setAttribute("aria-label", "Projects");
      railEl.addEventListener("click", onRailClick);
      railSig = "";
    }
    const anchor = railAnchor(rail);
    if (anchor) {
      if (railEl.parentElement !== anchor.parentElement || railEl.nextElementSibling !== anchor) anchor.parentElement.insertBefore(railEl, anchor);
    } else if (railEl.parentElement !== rail) rail.insertBefore(railEl, rail.firstElementChild ? rail.firstElementChild.nextSibling : null);
    if (railEl.dataset.mode !== "collapsed") railEl.dataset.mode = "collapsed";
    const sel = st.selectedWorkspaceId;
    const items = projectList(st).list.map(({ p, wss }) => {
      const name = p.name || p.folderName || "Untitled project";
      return { id: p.id, name, color: cssColor(p.color, name), active: wss.some((w) => w.id === sel), open: isOpen(`p:${p.id}`, true) };
    });
    const sig = JSON.stringify(items);
    if (sig === railSig) return;
    railSig = sig;
    const next = document.createElement("div");
    next.innerHTML =
      `<button type="button" class="rtps-rail-btn rtps-rail-search" data-key="rail:search" data-rail="search" title="Search" aria-label="Search">${svg("search")}</button>` +
      items
        .map(
          (it) =>
            `<button type="button" class="rtps-rail-btn rtps-rail-proj" data-key="rail:p:${escapeHtml(it.id)}" data-rail="proj" data-proj-id="${escapeHtml(it.id)}" title="${escapeHtml(it.name)}" aria-label="${escapeHtml(it.name)}"${it.active ? " data-active" : ""}${it.open ? " data-open" : ""}><span class="rtps-rail-av">${projAvatar(it.name, it.color)}</span></button>`
        )
        .join("") +
      `<button type="button" class="rtps-rail-btn rtps-rail-add" data-key="rail:add" data-rail="add" title="Add project (open a folder)" aria-label="Add project">${svg("folderPlus")}</button>`;
    patchChildren(railEl, next);
  }
  function removeRail() {
    for (const g of document.querySelectorAll(`[${RAIL_GROUP}]`)) g.remove();
    railEl = null;
    railSig = "";
  }
  // Collapsed, the sidebar opens through the app's own toggle first.
  async function showSidebar() {
    if (root && !root.hidden && treeEl) return true;
    // asked for from the rail's compact group: retry the placement now, not
    // after the 5 s pause a failed push starts
    pushFailedAt = -1e9;
    failStreak = 0;
    if (collapsed) {
      const t = toggleButton();
      if (t) t.click();
    }
    schedule();
    return !!(await waitFor(() => root && !root.hidden && treeEl, 1500));
  }
  async function onRailClick(e) {
    const b = e.target.closest("[data-rail]");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const kind = b.dataset.rail;
    if (kind === "add") return void addProject().finally(schedule);
    const wasCollapsed = collapsed;
    if (!(await showSidebar())) return;
    if (kind === "search") {
      searchEl.focus();
      searchEl.select();
      return logNav("rail-search", "", wasCollapsed ? "toggle+focus" : "focus");
    }
    if (kind === "proj") revealProject(b.dataset.projId, wasCollapsed);
  }
  // A project from the rail: open in the tree, scrolled to (explicit navigation)
  function revealProject(id, wasCollapsed) {
    const k = `p:${id}`;
    if (!isOpen(k, true)) {
      EXP.set(k, true);
      saveExp();
    }
    render(true);
    const row = treeEl && treeEl.querySelector(`.rtps-row[data-key="${CSS.escape(k)}"]`);
    if (row) {
      row.scrollIntoView({ block: "start" });
      for (const r of visibleRows()) r.setAttribute("tabindex", r === row ? "0" : "-1");
      row.focus({ preventScroll: true });
    }
    return logNav("rail-project", id, wasCollapsed ? "toggle+reveal" : "reveal");
  }

  function unhideNative() {
    for (const el of document.querySelectorAll(`[${HIDDEN}]`)) el.removeAttribute(HIDDEN);
  }
  function restoreNative() {
    unhideNative();
    for (const el of document.querySelectorAll(`[${RAIL_ATTR}],[${PUSH_ATTR}]`)) {
      if (el.hasAttribute(RAIL_ATTR)) el.removeAttribute(RAIL_ATTR);
      if (el.hasAttribute(PUSH_ATTR)) el.removeAttribute(PUSH_ATTR);
    }
    const html = document.documentElement;
    for (const c of ["rtps-on", "rtps-hide-native", "rtps-placed", "rtps-collapsed", "rtps-rail-hidden", "rtps-rail-hidden-soft"]) setClass(html, c, false);
    wasPlaced = false;
    placedTicks = 0;
    railHiddenTicks = 0;
  }

  // Collapse follows the app's own left panel toggle: the title bar button
  // "Toggle left panel" (and ⌘B / Ctrl+B on the chat route, same state) carries
  // the shell's leftPanelActive in aria-pressed: the left sidebar's state on
  // chat, docs, issues and agents, the canvas sidebar's on design. Collapsed,
  // this column goes away and the workspace gets its width back; expanded, it
  // returns. Instant, like the native panel (it unmounts, no transition). On
  // settings the button does nothing (always "false"), so the last state holds.
  // A MutationObserver on aria-pressed reacts in the same frame; the regular
  // tick only re-attaches it when the title bar re-renders the button.
  const TOGGLE = 'button[aria-label="Toggle left panel"]';
  // the app's own toggle (title bar): canvas-quick draws buttons with the same
  // label inside the canvas; those (and anything of ours) never count
  const toggleButton = () => Array.from(document.querySelectorAll(TOGGLE)).find((b) => !b.closest("[data-canvas-shell], .rcq-left-toggle, [data-rtps-root], .rtps-ctx-menu") && !b.classList.contains("rcq-left-toggle")) || null;
  let collapsed = false;
  let toggleEl = null;
  let toggleMO = null;
  function readCollapsed(route) {
    const b = toggleButton();
    if (b !== toggleEl) {
      if (toggleMO) toggleMO.disconnect();
      toggleMO = null;
      toggleEl = b;
      if (b) {
        toggleMO = new MutationObserver(schedule);
        toggleMO.observe(b, { attributes: true, attributeFilter: ["aria-pressed"] });
      }
    }
    if (b && route !== "settings" && b.hasAttribute("aria-pressed")) collapsed = b.getAttribute("aria-pressed") === "false";
    return collapsed;
  }
  // Title bar switch: right after the native back / forward arrows (next to
  // "Toggle left panel"), one button flips between this sidebar and the
  // native "Chats" one (the mod off). It lives in both states, is put back
  // when the title bar re-renders (never twice) and goes away signed out.
  // Settings and the account avatar go in the title bar right after the
  // forward arrow next to the app's left panel toggle (else after the toggle).
  function titleToolsAnchor() {
    const t = toggleButton();
    if (!t) return null;
    // the › arrow near the toggle (same bar, up to a few levels), else the toggle itself
    let fwd = null;
    for (let sc = t.parentElement, i = 0; sc && i < 4 && !fwd; sc = sc.parentElement, i++)
      fwd = Array.from(sc.querySelectorAll('button[aria-label="Forward"]')).find((b) => !b.closest("[data-rtps-root]")) || null;
    let a = fwd || t;
    for (let i = 0; i < 3 && a.parentElement && a.parentElement.childElementCount === 1; i++) a = a.parentElement; // a per-button wrapper
    return a;
  }
  // Put back when the title bar re-renders, never twice; gone signed out.
  function syncTitleTools() {
    const a = S.ws ? titleToolsAnchor() : null;
    if (!a) return removeTitleTools();
    if (!toolsEl || !toolsEl.isConnected) {
      for (const x of document.querySelectorAll(".rtps-titlebar-tools")) x.remove();
      toolsEl = document.createElement("div");
      toolsEl.className = "rtps-titlebar-tools";
      toolsEl.innerHTML =
        `<button type="button" class="rtps-icon-btn" data-act="settings" aria-label="Settings" aria-haspopup="menu" title="Settings">${luc("settings")}</button>` +
        `<button type="button" class="rtps-foot-avatar" data-act="account" aria-label="User menu" title="Account"></button>`;
      toolsEl.addEventListener("click", onFootClick);
      footSig = "";
    }
    if (toolsEl.previousElementSibling !== a || toolsEl.parentElement !== a.parentElement) a.parentElement.insertBefore(toolsEl, a.nextSibling);
    syncFoot();
  }
  function removeTitleTools() {
    for (const x of document.querySelectorAll(".rtps-titlebar-tools")) x.remove();
    toolsEl = null;
    footSig = "";
  }
  function unpush() {
    for (const el of document.querySelectorAll(`[${PUSH_ATTR}]`)) el.removeAttribute(PUSH_ATTR);
  }

  // The sidebar is a column of its own between the rail and the workspace: the
  // workspace panel group (parent of the center panel) gets a left margin and
  // the sidebar fills exactly that gap. If the margin does not take effect, or
  // anything would overlap, the push is undone and the sidebar stays hidden for
  // a while: it never draws over the app.
  let layoutState = "idle";
  let pushFailedAt = -1e9;
  // Placement is measured on the workspace group and the center panel only;
  // the rail counts only while it is on screen (our own rail-hidden class
  // moves the group: that is expected, not a failure). The tick decides what
  // to do with a failed read (hold, give up, softer rail hide).
  function layout() {
    const center = document.querySelector('[data-tempo-workspace-panel="center"]');
    const group = center && center.parentElement;
    if (!group) {
      layoutState = "no-workspace";
      return { ok: false, reason: "no-workspace" };
    }
    if (performance.now() - pushFailedAt < 5000) return { ok: false, reason: "cooldown", group };
    if (!group.hasAttribute(PUSH_ATTR)) {
      for (const el of document.querySelectorAll(`[${PUSH_ATTR}]`)) el.removeAttribute(PUSH_ATTR);
      group.setAttribute(PUSH_ATTR, "");
    }
    const g = group.getBoundingClientRect();
    const c = center.getBoundingClientRect();
    const rail = document.querySelector(RAIL);
    const rr = rail ? rail.getBoundingClientRect() : null;
    const railRight = rr && rr.width > 0 ? rr.right : -Infinity; // hidden (by us or not): nothing to overlap
    const margin = parseFloat(getComputedStyle(group).marginLeft) || 0;
    const left = g.left - WIDTH;
    const row = group.parentElement ? group.parentElement.getBoundingClientRect() : null;
    const maxRight = Math.min(window.innerWidth, row ? row.right : Infinity);
    const reason =
      margin < WIDTH - 1 ? "margin" : left < railRight - 1 ? "overlaps-rail" : c.left < g.left - 1 ? "center-left" : g.width < 160 ? "narrow" : g.right > maxRight + 1 ? "overflow-right" : "";
    const rects = { gL: Math.round(g.left), gW: Math.round(g.width), gR: Math.round(g.right), cL: Math.round(c.left), railR: railRight === -Infinity ? null : Math.round(railRight), margin: Math.round(margin), maxR: Math.round(maxRight) };
    if (reason) {
      layoutState = `push-failed:${reason}`;
      return { ok: false, reason, group, rects };
    }
    layoutState = "pushed";
    const st = root.style;
    const top = `${Math.round(g.top)}px`;
    const l = `${Math.round(left)}px`;
    const h = `${Math.round(g.height)}px`;
    if (st.top !== top) st.top = top;
    if (st.left !== l) st.left = l;
    if (st.height !== h) st.height = h;
    return { ok: true, rects };
  }
  // Would the panel (where it stands) cover the center? Then it never stays up.
  function overCenter() {
    const c = document.querySelector('[data-tempo-workspace-panel="center"]');
    if (!root || root.hidden || !c) return false;
    const r = root.getBoundingClientRect();
    const b = c.getBoundingClientRect();
    return r.right > b.left + 0.5 && r.left < b.right && r.bottom > b.top && r.top < b.bottom;
  }
  // The workspace group / center changing size (a panel mounting, the window,
  // the shell) re-measures on the next frame instead of the next poll.
  const layoutWatch = { ro: null, els: [] };
  function watchLayout() {
    const c = document.querySelector('[data-tempo-workspace-panel="center"]');
    const next = c ? [c, c.parentElement].filter(Boolean) : [];
    const w = layoutWatch;
    if (next.length === w.els.length && next.every((x, i) => x === w.els[i])) return;
    if (!w.ro && typeof ResizeObserver === "function") w.ro = new ResizeObserver(() => schedule());
    if (!w.ro) return;
    w.ro.disconnect();
    for (const x of next) w.ro.observe(x);
    w.els = next;
  }
  // Placement memory across ticks: one bad read while placed holds the panel
  // (no frame flicker); two in a row give up (and the 5 s retry pause starts).
  // The rail hides only once the panel has been placed for a tick; if the
  // layout breaks right after hiding it (a grid shell moves the workspace into
  // the rail's column, say), the hide steps down: display:none -> zero width
  // (rtps-rail-hidden-soft) -> none, and the step is remembered.
  // The step down is decided per session (not saved: a stuck "soft" left the
  // shell's gap as a strip at the left); the collapsed state has its own mode,
  // hard first, stepped down only if the workspace gets squeezed there.
  const RAIL_HIDE_KEY = "rtd.projectSidebar.railHide";
  lsSet(RAIL_HIDE_KEY, null); // older builds saved the step down
  let railMode = "hard";
  let railModeCollapsed = "hard";
  let wasPlaced = false;
  let failStreak = 0;
  let placedTicks = 0;
  let railHiddenTicks = 0; // ticks since the rail class went on (0 = not hidden)
  const traceBuf = [];
  // A render error never takes the sidebar down: the node falls back to a
  // minimal row, the error is warned, traced and kept (errors()).
  const renderErrors = [];
  function noteRenderError(key, err) {
    const msg = `${key}: ${(err && (err.stack || err.message)) || err}`.slice(0, 400);
    try {
      console.warn("[rtps] render", key, err);
    } catch (_) {}
    renderErrors.push({ t: Math.round(performance.now()), key, error: msg });
    if (renderErrors.length > 10) renderErrors.splice(0, renderErrors.length - 10);
    traceBuf.push({ t: Math.round(performance.now()), event: `render error ${msg.slice(0, 160)}` });
  }
  function stepDownRail(reason, collapsedState) {
    const cur = collapsedState ? railModeCollapsed : railMode;
    const next = cur === "hard" ? "soft" : "none";
    traceBuf.push({ t: Math.round(performance.now()), event: `rail-hide${collapsedState ? " (collapsed)" : ""} ${cur} -> ${next} (${reason})` });
    if (collapsedState) railModeCollapsed = next;
    else railMode = next;
    railHiddenTicks = 0;
  }

  // ------------------------------------------------------------------- loop
  let overlaySig = "";
  let lastOverlay = -1e9;
  function readOverlaySig(st) {
    const s = srd();
    if (!s || typeof s.getLocalOverlay !== "function") return "";
    try {
      // the fields canvasesOf() reads (name, path, branch, status, time), per project
      return (st.projects || [])
        .map((p) => `${p.id}:` + (s.getLocalOverlay(p.id) || []).map((o) => (o ? `${o.name}|${o.path}|${o.branch}|${o.workingTreeStatus}|${o.lastModifiedAt}` : "")).join(";"))
        .join(",");
    } catch (_) {
      return "";
    }
  }

  let timer = 0;
  let pending = false;
  let frame = 0;
  let stopped = false; // stop(): nothing runs any more
  function schedule() {
    if (pending || stopped) return;
    pending = true;
    frame = requestAnimationFrame(() => {
      pending = false;
      frame = 0;
      tick();
    });
  }

  // DOM writes only when something changes: other mods observe <html> and the
  // body, and a same-value write still queues a mutation record.
  function setClass(el, cls, on) {
    if (el.classList.contains(cls) !== !!on) el.classList.toggle(cls, !!on);
  }
  function tick() {
    // a hidden window does no work (polls, fiber walks, layout reads); it
    // catches up on visibilitychange
    if (stopped || document.hidden) return;
    try {
      tickInner();
    } catch (err) {
      noteRenderError("tick", err);
    }
  }
  function tickInner() {
    const rail = document.querySelector(RAIL);
    discover();
    if (!rail || !S.ws) {
      // signed-out screens or boot: the native layout stays as is, nothing on the rail
      if (root && !root.hidden) root.hidden = true;
      syncRingsHost(false);
      restoreNative();
      removeRail();
      removeTitleTools();
      return;
    }
    const html = document.documentElement;
    setClass(html, "rtps-on", true);
    if (html.style.getPropertyValue("--rtps-w") !== `${WIDTH}px`) html.style.setProperty("--rtps-w", `${WIDTH}px`);
    for (const el of document.querySelectorAll(`[${RAIL_ATTR}]`)) el.removeAttribute(RAIL_ATTR);
    mount();
    const st0 = W();
    const isCollapsed = readCollapsed(st0 && st0.activeNavRoute);
    // the collapsed class goes first: the stylesheet zeroes the workspace's margin
    // under it, so measuring before it changes would read the old state (a false
    // "margin" failure and a 5 s wait right after expanding)
    setClass(html, "rtps-collapsed", isCollapsed);
    // The native rail is hidden while this panel is placed or collapsed, and that
    // is decided BEFORE measuring: the shell lays the rail out as a grid column
    // (its transition is turned off by the CSS while the mod is on), so hiding it
    // after placing the panel moved the workspace under the panel (it showed again
    // for a tick after every expand). Not hidden during a failed push's cool-down:
    // then the rail is back with the mod's compact group.
    const hideMode = isCollapsed ? railModeCollapsed : railMode;
    const coolingDown = performance.now() - pushFailedAt < 5000;
    let hideRail = hideMode !== "none" && (isCollapsed || !coolingDown);
    setClass(html, "rtps-rail-hidden", hideRail && hideMode === "hard");
    setClass(html, "rtps-rail-hidden-soft", hideRail && hideMode === "soft");
    let placed = false;
    let held = false;
    let res = null;
    if (isCollapsed) {
      unpush();
      layoutState = "collapsed";
      failStreak = 0;
      placedTicks = 0;
    } else {
      res = layout();
      if (res.ok) {
        failStreak = 0;
        placedTicks++;
        placed = true;
      } else {
        failStreak++;
        const real = res.reason !== "cooldown" && res.reason !== "no-workspace";
        // the layout broke right as the rail went away: hide it more softly next time
        if (real && hideRail && railHiddenTicks <= 2 && railMode !== "none") stepDownRail(res.reason);
        // one bad read: hold where it was, unless the panel would sit over the center
        if (wasPlaced && failStreak < 2 && res.reason !== "no-workspace" && !overCenter()) {
          placed = true;
          held = true;
        } else {
          if (res.group) res.group.removeAttribute(PUSH_ATTR);
          else unpush(); // no center panel now: no push left on the old container
          if (real) pushFailedAt = performance.now();
          placedTicks = 0;
        }
      }
    }
    wasPlaced = placed;
    if (root.hidden === placed) {
      const hadFocus = !placed && root.contains(document.activeElement);
      root.hidden = !placed;
      // the focus was in the panel that just went away: to the app's toggle
      if (hadFocus) {
        const t = toggleButton();
        if (t) t.focus({ preventScroll: true });
      }
    }
    syncRingsHost(placed);
    // One sidebar: the rail's route buttons hide only while this sidebar is on
    // screen (collapsed, the rail is the native one again); the native route
    // sidebars hide (unless opted out) while it is on screen or collapsed by the
    // app's toggle, so a push that fails never leaves the window with none.
    const hide = (placed || isCollapsed) && lsGet(HIDE_NATIVE_KEY) !== "off";
    setClass(html, "rtps-placed", placed);
    setClass(html, "rtps-collapsed", isCollapsed);
    // the native rail hides while this panel is on screen (it has its own footer);
    // collapsed (or a push that failed) the rail is back with the mod's compact group
    // collapsed there is no placement to measure: only a squeezed workspace steps
    // the hide down; a push that did not take brings the rail back (compact group)
    if (isCollapsed && railHiddenTicks > 0 && railHiddenTicks <= 2 && railModeCollapsed !== "none") {
      const center = document.querySelector('[data-tempo-workspace-panel="center"]');
      if (center && center.getBoundingClientRect().width < 160) stepDownRail("collapsed-narrow", true);
    }
    if (!placed && !isCollapsed && hideRail) {
      hideRail = false;
      setClass(html, "rtps-rail-hidden", false);
      setClass(html, "rtps-rail-hidden-soft", false);
    }
    railHiddenTicks = hideRail ? railHiddenTicks + 1 : 0;
    // the workspace group as it stands (push attribute, inline style, left edge) for the trace
    const env = (() => {
      const c = document.querySelector('[data-tempo-workspace-panel="center"]');
      const g = c && c.parentElement;
      const rl = document.querySelector(RAIL);
      return g ? { push: g.hasAttribute(PUSH_ATTR), style: (g.getAttribute("style") || "").slice(0, 120), gL: Math.round(g.getBoundingClientRect().left), cL: Math.round(c.getBoundingClientRect().left), railW: rl ? Math.round(rl.getBoundingClientRect().width) : null } : null;
    })();
    traceBuf.push({ t: Math.round(performance.now()), placed, held, reason: res ? res.reason || "" : isCollapsed ? "collapsed" : "", rail: hideRail ? hideMode : "shown", rects: res && res.rects, env });
    watchLayout();
    if (traceBuf.length > 20) traceBuf.splice(0, traceBuf.length - 20);
    setClass(html, "rtps-hide-native", hide);
    // the regular classes hold the layout now: the boot ones go in this same
    // frame (and the state is kept for the next launch); a push the layout
    // refuses brings the native layout back. No workspace yet: boot holds.
    if (placed || isCollapsed) {
      const state = isCollapsed ? "collapsed" : "placed";
      if (lsGet(BOOT_KEY) !== state) lsSet(BOOT_KEY, state);
      endBoot(state);
    } else if (booting && res && res.reason !== "no-workspace" && res.reason !== "cooldown") endBoot(`push-failed:${res.reason}`);
    if (hide) hideNative();
    else unhideNative();
    syncRail();
    syncTitleTools();
    const st = W();
    if (!placed) return;
    if (st && performance.now() - lastOverlay > OVERLAY_MS) {
      lastOverlay = performance.now();
      overlaySig = readOverlaySig(st);
    }
    if (st && st.activeNavRoute === "chat" && performance.now() - cliAt > 2000) {
      cliAt = performance.now();
      cliSig = readCli();
    }
    loadRemote(false);
    render(false);
  }

  // Only this sidebar exists. Older builds could leave the user on the classic
  // chats layout (rtd.projectSidebar = "off", sidebar-chats on), the native one
  // or the "prev" skin: all of them come back here on boot; sidebar-chats picks
  // the change up on "rtd:sidebar-chats-changed" and stays inert.
  const CHATS_KEY = "rtd.sidebarChats";
  const SKIN_KEY = "rtd.projectSidebar.skin";
  function migrateModes() {
    if (lsGet(FLAG_KEY) === null && lsGet(SKIN_KEY) === null && lsGet(CHATS_KEY) === null) return;
    lsSet(FLAG_KEY, null);
    lsSet(SKIN_KEY, null);
    lsSet(CHATS_KEY, null);
    try {
      window.dispatchEvent(new CustomEvent("rtd:sidebar-chats-changed", { detail: { mode: "orca" } }));
    } catch (_) {}
  }
  // kept for callers (always on): a refresh
  function setEnabled() {
    sig = "";
    tick();
  }

  // ⌘⇧E: focus the sidebar's search (the app's left panel toggle opens it first
  // when collapsed). Never from a text field, the composer or an editor.
  function onKey(e) {
    const mod = IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
    if (!mod || !e.shiftKey || e.altKey || e.code !== "KeyE") return;
    // never steal the shortcut from a text field, the composer or an editor
    const t = e.target;
    if (t && t.nodeType === 1 && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || (t.closest && t.closest('[contenteditable=""],[contenteditable="true"],.monaco-editor,.cm-editor,.xterm')))) return;
    // nothing to show it with (the panel off screen and no app toggle): the shortcut stays the app's
    if ((!root || root.hidden) && !toggleButton()) return;
    e.preventDefault();
    e.stopPropagation();
    focusSearch();
  }
  function focusSearch() {
    const go = () => {
      if (!searchEl || !searchEl.isConnected || !root || root.hidden) return false;
      searchEl.focus();
      searchEl.select();
      logNav("search", "focus", "⌘⇧E");
      return true;
    };
    if (go()) return;
    const t = toggleButton();
    if (t && t.getAttribute("aria-pressed") === "false") t.click();
    waitFor(() => go(), 1500, 50);
  }

  // ------------------------------------------------- tab drop -> new worktree
  // A tab dragged from a tab bar or a dock pane (dataTransfer
  // "application/x-tempo-view-tab", or only "tempo-tab-id" for the tabs the app
  // does not transfer) can be dropped on a project's "+": pane-dock creates a
  // worktree of that project and moves the tab into it
  // (__RE_TEMPO_PANE_DOCK__.dropToNewWorkspace). While such a drag is over the
  // window every project "+" shows (data-tab-drag on the tree); the one under the
  // pointer opens into a "New workspace" pill (data-drop="hot", drawn by the CSS
  // like the dock's drop previews). Only the drop acts, never hovering. A
  // worktree's own "+" (new deck) is no target. When the dock announces the
  // worktree (rtd:workspace-created, or its promise resolving) the card enters:
  // its slot opens, it fades and slides in, an accent outline holds to 1.5 s and
  // fades into the normal card. Reduced motion: a fade only. Nothing else moves.
  // The dock's undo (rtd:workspace-drop-undone) plays it backwards (leave).
  // emit / rowElInner / renderInner call in through `dropNew`, guarded with
  // typeof: the extracted-function test harnesses have no such object.
  const dropNew = (() => {
    const TYPES = ["application/x-tempo-view-tab", "tempo-tab-id"];
    const BTN = '.rtps-project > [data-row-act="newWorktree"]';
    const ENTER_MS = 1800; // the CSS: fade + slide 600 ms, outline held to 1.5 s, then it fades out
    const CLASS_MS = ENTER_MS + 120; // the class outlives the animation, so its end is never cut
    const SLOT_MS = 300;
    const PENDING_MS = 30000; // a worktree can take a while (git worktree add)
    const EXIT_MS = 280; // a card leaving on the dock's undo
    const gone = new Map(); // wsId -> { done }: the dock undid its drop (see leave)
    let dragging = false; // a tab drag is over the window
    let entering = false; // a dragenter ran in this task (see onLeave)
    let enterT = 0;
    let lastAt = 0;
    let allowed = null; // the dock's answer for this drag (null: not asked yet)
    let hot = null; // project whose "+" is under the pointer
    let busy = null; // project whose drop waits for the dock
    let pending = null; // { projectId, known, until }: from the drop to the dock's answer
    const enter = new Map(); // wsId -> { at (0: its card is not on screen yet), ring, fresh }
    let inserted = []; // card hosts emitted for their entrance, for afterPatch

    const dock = () => window.__RE_TEMPO_PANE_DOCK__;
    const ready = () => !!dock() && typeof dock().dropToNewWorkspace === "function";
    const isTabDrag = (dt) => {
      const types = dt && dt.types ? Array.from(dt.types) : [];
      return TYPES.some((t) => types.includes(t));
    };
    const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    function btnAt(target) {
      const el = target && (target.nodeType === 1 ? target : target.parentElement);
      const b = el && el.closest ? el.closest(BTN) : null;
      return b && treeEl && treeEl.contains(b) ? b : null;
    }
    function projectOf(b) {
      const row = b.closest(".rtps-row");
      const k = (row && row.dataset.key) || "";
      return k.startsWith("p:") ? k.slice(2) : null;
    }
    function wsProject(id) {
      const st = W();
      const w = st && Array.isArray(st.workspaces) ? st.workspaces.find((x) => x && x.id === id) : null;
      return w && w.projectId != null ? String(w.projectId) : null;
    }
    const knownWs = () => (lastModel && Array.isArray(lastModel.projects) ? lastModel.projects.flatMap((p) => (p.branches || []).map((b) => b.id)) : []);
    const stateOf = (pid) => (pid == null ? "" : busy === pid ? "busy" : hot === pid ? "hot" : "");
    // rowElInner writes the same attribute, last on the button (where setAttribute
    // puts it), so a rebuild keeps it without a write
    const btnAttrs = (pid) => (stateOf(pid) ? ` data-drop="${stateOf(pid)}"` : "");
    function paint() {
      if (!treeEl) return;
      if (dragging !== treeEl.hasAttribute("data-tab-drag")) treeEl.toggleAttribute("data-tab-drag", dragging);
      for (const b of treeEl.querySelectorAll(BTN)) {
        const s = stateOf(projectOf(b));
        if (s && b.getAttribute("data-drop") !== s) b.setAttribute("data-drop", s);
        else if (!s && b.hasAttribute("data-drop")) b.removeAttribute("data-drop");
      }
    }
    function canDrop() {
      if (allowed === null) {
        // no tab id while dragging (getData is protected until the drop): the
        // dock answers for its current drag
        const api = dock();
        try {
          allowed = typeof api.canDropToNewWorkspace !== "function" || api.canDropToNewWorkspace() !== false;
        } catch (_) {
          allowed = false;
        }
      }
      return allowed;
    }
    function end() {
      allowed = null;
      if (!dragging && hot === null) return;
      dragging = false;
      hot = null;
      paint();
    }
    // dragenter / dragover anywhere (window, capture): the "+"s show; over a
    // project's "+" the drop is accepted (preventDefault) and its pill opens
    function onOver(e) {
      if (!isTabDrag(e.dataTransfer) || !ready()) return;
      lastAt = Date.now();
      if (!canDrop()) return;
      const b = btnAt(e.target);
      const pid = b && busy === null ? projectOf(b) : null;
      dragging = true;
      hot = pid;
      paint();
      if (pid === null) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
    }
    // Moving between elements fires dragenter on the next one before dragleave on
    // the last, in the same task: a dragleave with no dragenter just before it
    // means the pointer left the window (or went into a webview)
    function onLeave() {
      if (dragging && !entering) end();
    }
    function onMouse(e) {
      if (Date.now() - lastAt <= 400 || (e.type !== "mousedown" && e.buttons !== 0)) return;
      // a drag whose end never reached the window (its source left the DOM), or
      // one the dock refused: neither may outlive the drag
      if (dragging) end();
      else allowed = null;
    }
    function readTab(dt) {
      let d = null;
      try {
        d = JSON.parse(dt.getData(TYPES[0]) || "null");
      } catch (_) {
        d = null;
      }
      const tabId = d && typeof d.id === "string" && d.id ? d.id : dt.getData(TYPES[1]) || null;
      return { tabId, sourcePaneId: (d && (d.paneId || d.sourcePaneId)) || null };
    }
    function onDrop(e) {
      if (!dragging && hot === null) {
        allowed = null;
        return;
      }
      const b = hot !== null && isTabDrag(e.dataTransfer) ? btnAt(e.target) : null;
      const pid = b ? projectOf(b) : null;
      if (pid === null || pid !== hot) return end();
      e.preventDefault();
      e.stopPropagation();
      const tab = readTab(e.dataTransfer); // only readable during the drop event
      busy = pid; // the pill stays open: "Creating workspace…"
      end();
      run(pid, tab, b);
    }
    // The dock checks the tab, creates the worktree, flies the tab into targetEl
    // (this "+") and says what happened in its own toast (Undo; or why not), so
    // the sidebar only reports what the dock could not be asked. The busy pill
    // and the pending match belong to this request only (`req`): they end when
    // its promise settles, or after PENDING_MS if the dock never answers; a late
    // answer never touches a newer drop.
    let req = null;
    function settle(r) {
      if (req !== r) return;
      req = null;
      if (pending && pending.projectId === r.projectId) pending = null;
      busy = null;
      paint();
    }
    async function run(projectId, { tabId, sourcePaneId }, targetEl) {
      const api = dock();
      if (!tabId || !ready()) {
        busy = null;
        paint();
        toast("Couldn't read the dragged tab");
        return;
      }
      const mine = { projectId };
      req = mine;
      pending = { projectId, known: new Set(knownWs()), until: Date.now() + PENDING_MS };
      const hung = setTimeout(() => settle(mine), PENDING_MS);
      try {
        const res = await api.dropToNewWorkspace({ tabId, projectId, sourcePaneId, targetEl });
        if (res && res.wsId != null) announce(String(res.wsId), projectId);
      } catch (err) {
        // the dock's own toast says why, except for a tab it does not know as a
        // chat (a file / canvas from a popout): only chats move
        if (/no such chat tab/i.test(String((err && err.message) || err))) toast("Only chats can move to a new workspace");
      } finally {
        clearTimeout(hung);
        settle(mine);
      }
    }
    // The dock created wsId: its card enters as soon as it is on screen. A card
    // already shown (it came before the news, with no drop of ours waiting) only
    // gets the outline. Visual only: the request state is run()'s.
    function announce(wsId, projectId) {
      const pid = projectId || (pending && pending.projectId) || wsProject(wsId);
      if (enter.has(wsId) || gone.has(wsId)) return;
      const shown = !!(treeEl && treeEl.querySelector(`.rtps-card[data-pkey="${CSS.escape(`card:w:${wsId}`)}"]`));
      enter.set(wsId, { at: 0, ring: shown, fresh: false });
      setTimeout(() => {
        const s = enter.get(wsId);
        if (s && !s.at) enter.delete(wsId); // its card never showed up
      }, PENDING_MS);
      // a folded project would hide the card: unfold it (setOpen renders)
      if (pid != null && !shown && !isOpen(`p:${pid}`, true)) setOpen(`p:${pid}`, true);
      else render(true);
    }
    // emit, for every card: the class while its entrance plays. A card that shows
    // up while a drop of ours waits (in that project, unknown at the drop) is the
    // new worktree, even before the dock's news.
    function decorateCard(host, n) {
      const id = n.ws && n.ws.id;
      if (id == null) return;
      const g = gone.get(String(id));
      if (g) {
        // undone by the dock: hidden once its exit has played, until the store drops it
        if (g.done) host.classList.add("rtps-card-gone");
        return;
      }
      let s = enter.get(id);
      if (!s && pending) {
        const p = wsProject(id);
        if (Date.now() > pending.until) pending = null;
        else if (!pending.known.has(id) && (p === null || p === pending.projectId)) {
          s = { at: 0, ring: false, fresh: false };
          enter.set(id, s);
        }
      }
      if (!s) return;
      const now = Date.now();
      if (!s.at) {
        s.at = now;
        s.fresh = !s.ring;
        setTimeout(() => {
          enter.delete(id);
          render(true);
        }, CLASS_MS);
      }
      if (now - s.at >= CLASS_MS) return;
      host.classList.add(s.ring ? "rtps-card-ring" : "rtps-card-enter");
      if (s.fresh) {
        s.fresh = false;
        inserted.push(host);
      }
    }
    // renderInner, after the patch: the card that was just inserted opens its slot
    // (height, padding, margin and border from 0), so the cards under it glide
    // down instead of jumping; the CSS fades and slides its content in
    function afterPatch() {
      if (!inserted.length) return;
      const list = inserted;
      inserted = [];
      if (reduced()) return;
      for (const el of list) {
        if (!el.isConnected || typeof el.animate !== "function") continue;
        const h = el.offsetHeight; // layout size: the CSS slide's transform does not count
        if (!h) continue;
        const cs = getComputedStyle(el);
        const from = { height: "0px", boxSizing: "border-box", overflow: "hidden" };
        const to = { height: `${h}px`, boxSizing: "border-box", overflow: "hidden" };
        for (const k of ["paddingTop", "paddingBottom", "marginTop", "marginBottom", "borderTopWidth", "borderBottomWidth"]) {
          from[k] = "0px";
          to[k] = cs[k];
        }
        el.animate([from, to], { duration: SLOT_MS, easing: "cubic-bezier(0.2, 0, 0, 1)" });
      }
    }
    // The dock undid the drop (rtd:workspace-drop-undone): the worktree's card
    // leaves the way it came, fading and sliding up while its slot closes (the
    // cards under it glide up); reduced motion: a fade. Then it stays hidden
    // (rtps-card-gone) until the store drops the worktree; one the dock kept
    // after all (a chat of it was used) shows again after PENDING_MS.
    function leave(wsId) {
      enter.delete(wsId);
      const g = { done: false };
      gone.set(wsId, g);
      const done = () => {
        if (g.done || gone.get(wsId) !== g) return;
        g.done = true;
        render(true);
      };
      setTimeout(done, EXIT_MS + 60); // in case the animation never finishes (its card left the DOM)
      const sel = `.rtps-card[data-pkey="${CSS.escape(`card:w:${wsId}`)}"]`;
      setTimeout(() => {
        gone.delete(wsId);
        const el = treeEl && treeEl.querySelector(sel);
        if (el) for (const a of el.getAnimations()) if (!a.animationName) a.cancel();
        render(true);
      }, PENDING_MS);
      const el = treeEl && treeEl.querySelector(sel);
      if (!el || typeof el.animate !== "function") return done();
      for (const a of el.getAnimations()) if (!a.animationName) a.cancel(); // the entrance's slot, if still opening
      el.classList.remove("rtps-card-enter", "rtps-card-ring");
      let frames;
      if (reduced()) frames = [{ opacity: 1 }, { opacity: 0 }];
      else {
        const cs = getComputedStyle(el);
        const from = { height: `${el.offsetHeight}px`, boxSizing: "border-box", overflow: "hidden", opacity: 1, transform: "none" };
        const to = { height: "0px", boxSizing: "border-box", overflow: "hidden", opacity: 0, transform: "translateY(-6px) scale(0.98)" };
        for (const k of ["paddingTop", "paddingBottom", "marginTop", "marginBottom", "borderTopWidth", "borderBottomWidth"]) {
          from[k] = cs[k];
          to[k] = "0px";
        }
        frames = [from, to];
      }
      const anim = el.animate(frames, { duration: EXIT_MS, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" });
      anim.onfinish = done;
    }

    const ons = [
      [
        "dragenter",
        (e) => {
          entering = true;
          clearTimeout(enterT);
          enterT = setTimeout(() => (entering = false), 0);
          onOver(e);
        },
        true,
      ],
      ["dragstart", () => (allowed = null), true], // a new drag: ask the dock again
      ["dragover", onOver, true],
      ["dragleave", onLeave, true],
      ["drop", onDrop, true],
      ["dragend", end, true],
      ["mousemove", onMouse, true],
      ["mousedown", onMouse, true],
      [
        "rtd:workspace-created",
        (e) => {
          const d = (e && e.detail) || {};
          if (d.wsId != null) announce(String(d.wsId), d.projectId != null ? String(d.projectId) : null);
        },
        false,
      ],
      [
        "rtd:workspace-drop-undone",
        (e) => {
          const d = (e && e.detail) || {};
          if (d.wsId != null) leave(String(d.wsId));
        },
        false,
      ],
    ];
    for (const [t, f, c] of ons) window.addEventListener(t, f, c);
    return {
      stop: () => {
        for (const [t, f, c] of ons) window.removeEventListener(t, f, c);
        end();
      },
      btnAttrs,
      decorateCard,
      afterPatch,
      state: () => ({ dragging, hot, busy, pending: pending ? pending.projectId : null, entering: Array.from(enter.keys()), gone: Array.from(gone.keys()) }),
    };
  })();

  const onFocusWin = () => loadRemote(false);
  const onDecksChanged = () => {
    decksVersion++;
    schedule();
  };
  const onVisible = () => {
    if (!document.hidden) schedule();
  };
  function init() {
    migrateModes();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", schedule);
    window.addEventListener("focus", onFocusWin);
    window.addEventListener("rtd:decks-changed", onDecksChanged);
    window.addEventListener("rtc:hidden-changed", schedule);
    document.addEventListener("visibilitychange", onVisible);
    timer = setInterval(tick, POLL_MS);
    tick();
  }
  // stop(): every timer, frame, listener and observer of the mod goes; the
  // DOM stays as it is (nothing more is written)
  function stopAll() {
    stopped = true;
    endBoot("stopped");
    clearInterval(timer);
    if (frame) cancelAnimationFrame(frame);
    pending = false;
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", schedule);
    window.removeEventListener("focus", onFocusWin);
    window.removeEventListener("rtd:decks-changed", onDecksChanged);
    window.removeEventListener("rtc:hidden-changed", schedule);
    document.removeEventListener("visibilitychange", onVisible);
    if (toggleMO) toggleMO.disconnect();
    toggleMO = null;
    if (layoutWatch.ro) layoutWatch.ro.disconnect();
    layoutWatch.els = [];
    rowMenu.close(false);
    dropNew.stop();
  }

  window.__RE_TEMPO_PROJECT_SIDEBAR__ = {
    get enabled() {
      return enabled();
    },
    get ready() {
      return !!(root && S.ws && !root.hidden);
    },

    trace: () => traceBuf.slice(),
    errors: () => renderErrors.slice(),
    tick: () => tick(),
    railHide: () => ({ expanded: railMode, collapsed: railModeCollapsed }),
    focusSearch: () => focusSearch(),
    setEnabled,
    refresh: () => loadRemote(true),
    model: () => buildModel(),
    // what each branch card lists: { <ws id>: [{ deck, active, tabs: [{ id, kind, title, front, pane }] }] }
    openTabs: () => {
      const m = buildModel();
      const out = {};
      for (const p of (m && m.projects) || [])
        for (const b of p.branches)
          out[b.id] = b.open.map((g) => ({ deck: g.deck ? g.deck.id : null, active: g.active, tabs: g.items.map((it) => ({ id: it.id, kind: it.agent ? "agent" : it.kind, title: it.kind === "chat" ? it.chat.name : it.title, front: it.visible !== false, pane: it.pane || null })) }));
      return out;
    },
    rows: () => Array.from(treeEl ? treeEl.querySelectorAll(".rtps-row") : []).map((r) => ({ key: r.dataset.key, kind: r.dataset.kind, text: r.textContent.trim(), selected: r.getAttribute("aria-selected") === "true", expanded: r.getAttribute("aria-expanded") })),
    expand: (key, v = true) => setOpen(key, v),
    state: () => {
      const st = W();
      return {
        store: !!S.ws,
        client: !!S.client,
        phaseStore: !!S.phase,
        popoutStore: !!S.pq,
        cliHidden: Array.from(cliHidden),
        org: activeOrgId(),
        route: st && st.activeNavRoute,
        ws: st && st.selectedWorkspaceId,
        chat: st && st.activeChatTabId,
        remote: { status: R.status, errors: R.errors, docs: R.docs.length, issues: R.issues.length, agents: R.agents.length, linkedIssues: R.issueOpids.size, linkedDocs: Array.from(R.docOpids.values()).filter((v) => v.opids.size).length },
        hidden: document.querySelectorAll(`[${HIDDEN}]`).length,
        layout: layoutState,
        collapsed,
        hideNative: lsGet(HIDE_NATIVE_KEY) !== "off",
        boot: booting ? "on" : bootEnd,
      };
    },
    navLog,
    queryLog,
    // tab drop on a project's "+" -> new worktree: { dragging, hot, busy, pending, entering }
    dropNew: () => dropNew.state(),
    open: { project: openProject, canvas: openCanvas, chat: openChat, chatItem: openChatItem, branch: openBranch, newChat: newChatIn, addProject, doc: openDoc, issue: openIssue, agent: openAgent, route: goRoute, newWorktree: openBranchMenu, worktree: createWorktree, branches: listProjectBranches },
    filters: F,
    setFilter,
    setAttention: (v) => {
      attention = !!v;
      render(true);
    },
    stop: () => stopAll(),
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
