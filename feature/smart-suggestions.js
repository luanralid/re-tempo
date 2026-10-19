/*
 * RE-TEMPO · smart-suggestions (user MOD layer)
 * ---------------------------------------------------------------------------
 * The new-chat empty state ("Let's do it", the composer and four fixed prompt
 * cards: "Walk me through how Tempo works", "Create a design system canvas
 * from my code", "Write a PRD for a new feature", "Scaffold a working
 * prototype") shows four suggestions computed locally from where the user is
 * instead: the workspace, its branch and project, the uncommitted changes,
 * the workspace's recent chats, open comment tasks, the project's issues,
 * docs and canvases, agent runs and the time of day. A fifth, discreet chip
 * ("More…") opens the full ranked list (8-10).
 *
 * Where (renderer bundle index-D2Ui1vc0.js, read 2026-10-18):
 *   ChatView renders N0n for the empty state: <div data-testid=
 *   "chat-empty-state"> = [illustration + h1] [div: the composer] [div.flex
 *   .flex-nowrap.items-stretch: one PromptCard (Lfn) per prompt]. PromptCard
 *   is a <button> with an icon span and a label span; its onClick calls
 *   N0n's prop onPromptSelect(prompt), which the workspace passes as
 *   `e => chatHandles.get(key)?.setInputValue(e)`: the native card only
 *   FILLS the composer. This mod hides the native row (attribute + CSS, the
 *   React nodes stay) and inserts its own row right after it, with the
 *   native row's and card's classes copied at runtime (fallback: the same
 *   class strings), so it looks the same.
 *
 * Click = the app's path, then send: onPromptSelect(prompt) read from the
 *   empty state's fiber (the native fill); if absent, the TipTap editor
 *   (element.editor.commands.setContent), else insertText. Then it waits
 *   until the composer shows the prompt and the send button
 *   [data-testid="chat-input-send-button"] is enabled, and clicks it (the
 *   user's own send). localStorage "rtd.smartSuggestions.send" = "fill" keeps
 *   the native behaviour (fill only, focus the composer).
 *
 * Context sources (all read-only, all optional; a missing one is skipped):
 *   - workspaces store (zustand getState found in hook deps, as pane-dock and
 *     project-sidebar do): selected workspace, its project, branch
 *     (repo.currentBranch/baseBranch), repo.additions/deletions (the header's
 *     "+N −M"), uncommittedFiles / uncommittedTotalCount, aheadBehind,
 *     prStatus, the workspace's chat tabs (name, sessionId, createdAt,
 *     turnInterrupted, isAwaitingResponse, isChatInProgress());
 *   - window.__chatSessionStoreDebug.getMessages(sessionId): last user and
 *     assistant text of each recent chat;
 *   - window.__RE_TEMPO_COMMENT_AGENT__.tasks(): comment tasks of the
 *     workspace (needs-input, failed, running, queued);
 *   - window.__RE_TEMPO_PROJECT_SIDEBAR__.model() (cached 10 s): the
 *     project's issues, docs, canvases and agents as the sidebar links them;
 *     without it, read-only Convex queries through the logged-in client:
 *     issues:getBoard + issues:getIssues, docs:getDocsTree (org-wide), and
 *     window.__sourceRepoDataStoreDebug.getLocalOverlay(projectId) for
 *     canvases;
 *   - agentRuns:listMyActiveRuns / agentRuns:listMyRecentlyFailedRuns
 *     (Convex queries, TTL 60 s, only while an empty state is on screen);
 *   - the clock (morning / evening) and first use (no chat with a session
 *     in the workspace -> onboarding; none in the project -> new project).
 *   No mutation is ever called.
 *
 * Ranking: rules give each candidate a score (comment tasks waiting 100+,
 *   failed tasks 90+, a chat waiting for an answer 86, an interrupted chat 84,
 *   onboarding 80 for a new project, failed agent runs 72+, uncommitted
 *   changes 60-90 by size, urgent issue 70, triage 50+, ... generic prompts
 *   6-16). The four cards are the best candidate of each group first (no two
 *   cards about the same thing), the "More…" list is the rest by score.
 *   Optional re-rank: when window.__RE_TEMPO_DECISION__.configured() and the
 *   "suggestions" automation is on (decision settings
 *   automations.suggestions === true, or localStorage
 *   "rtd.smartSuggestions.rerank" = "on"), one decide() call per candidate
 *   set (cached 5 min, at most one call per 20 s) asks for a usefulness
 *   `score` per suggestion and shifts each rule score by up to ±15, so it
 *   re-orders close calls but never buries an urgent rule; the scores apply
 *   only to the exact candidate set they were computed for. The state sent holds names and
 *   counts only (project, branch, numbers, suggestion titles): no message
 *   text, paths or comment text. Any error, timeout or low confidence keeps
 *   the rule order, silently.
 *
 * Refresh: workspace or chat switch -> at once. Any other context change ->
 *   debounced 2 s (at most 6 s while it keeps changing). Cards are patched in
 *   place (same nodes); only a card whose content changed cross-fades (no
 *   animation with prefers-reduced-motion). Prompts (relative times) update
 *   silently. A document MutationObserver (one selector check per batch)
 *   mounts the row before the first paint of a new empty state, so the native
 *   cards never flash; each mounted empty state has its own observer on its
 *   chat view for switches and native re-renders. The 700 ms context poll
 *   runs only while the window is visible and an empty state is in the DOM;
 *   on visibilitychange (hidden) the interval stops and the observers
 *   disconnect, and dispose() releases every handle.
 *
 * Flag off: localStorage "rtd.smartSuggestions" = "off" -> the native cards
 *   come back (checked on every tick). Until the app's store is found the
 *   native cards stay.
 * Introspection: window.__RE_TEMPO_SMART_SUGGESTIONS__ (state(), context(),
 *   suggestions(), all(), refresh(), send(idOrIndex), openMore(),
 *   closeMore(), setEnabled(bool), dispose()). Window events: "rtss:changed"
 *   {cards}, "rtss:sent" {id, title, via, sent}.
 * Test hook: window.__RE_TEMPO_SMART_SUGGESTIONS_CONFIG__ = { debounceMs,
 *   maxWaitMs, pollMs, now: () => ms }.
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (window.__RE_TEMPO_SMART_SUGGESTIONS__?.dispose) window.__RE_TEMPO_SMART_SUGGESTIONS__.dispose(); // re-injection

  // ---------------------------------------------------------------- config
  const CFG = window.__RE_TEMPO_SMART_SUGGESTIONS_CONFIG__ || {};
  const numOr = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);
  const FLAG = "rtd.smartSuggestions"; // "off" = native cards
  const SEND_MODE = "rtd.smartSuggestions.send"; // "fill" = fill only (native)
  const RERANK = "rtd.smartSuggestions.rerank"; // "on" | "off" (decision model)
  const DM_SETTINGS = "rtd.decisionModel.settings";
  const ORG_KEY = "tempo:activeOrgId";
  const DEBOUNCE_MS = numOr(CFG.debounceMs, 2000);
  const MAX_WAIT_MS = numOr(CFG.maxWaitMs, 6000);
  const POLL_MS = numOr(CFG.pollMs, 700);
  const REMOTE_TTL_MS = numOr(CFG.remoteTtlMs, 60000);
  const PS_TTL_MS = 10000;
  const QUERY_TIMEOUT_MS = 6000;
  const SEND_WAIT_MS = 2500;
  const DECIDE_TTL_MS = 5 * 60000;
  const FRESH_MOUNT_MS = 900; // remote data landing this soon after a mount applies at once
  const CARDS = 4;
  const MAX_ALL = 10;
  const MAX_CHATS = 12;
  const CONVEX_FN = Symbol.for("functionName");
  const SEL = {
    empty: '[data-testid="chat-empty-state"]',
    rail: '[data-testid="workspace-navbar"]',
    send: '[data-testid="chat-input-send-button"]',
    // the composer's TipTap editor (bundle: data-testid chat-input-textarea, data-chat-input)
    editor: '[data-testid="chat-input-textarea"], [data-chat-input][contenteditable="true"], .ProseMirror[contenteditable="true"], [contenteditable="true"]',
  };
  // The native row (N0n) and PromptCard (Lfn) classes, as rendered (the
  // card's base merged with N0n's override). Copied from the DOM when the
  // native row is there; these are the fallback.
  const NATIVE = {
    row: "flex w-full max-w-2xl flex-nowrap items-stretch gap-3 mt-3",
    card:
      "flex cursor-pointer flex-col items-start gap-2 rounded-lg border-[0.5px] border-border-secondary p-3 text-left transition-colors h-auto flex-1 min-w-0 bg-transparent hover:bg-surface-container",
    icon: "flex size-6 items-center justify-center text-text-secondary",
    label: "text-label leading-label text-text-secondary",
  };
  const ISSUE_DONE = /^(done|completed|complete|closed|canceled|cancelled|archived|duplicate)$/i;
  const ISSUE_ACTIVE = /^(in_progress|in_review|started|doing|in progress|in review)$/i;

  // ---------------------------------------------------------------- helpers
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
  const enabled = () => lsGet(FLAG) !== "off";
  const clock = () => (typeof CFG.now === "function" ? CFG.now() : typeof CFG.now === "number" ? CFG.now : Date.now());
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmt = (n) => Number(n || 0).toLocaleString("en-US");
  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many || one + "s"}`;
  const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const alnum = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  function clip(s, n) {
    s = norm(s);
    if (s.length <= n) return s;
    const cut = s.slice(0, n - 1);
    const sp = cut.lastIndexOf(" ");
    return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:\-–—]+$/, "") + "…";
  }
  // multi-line excerpt for prompts: keeps line breaks, clipped
  function excerpt(s, n) {
    const t = String(s || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
    return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
  }
  function tsOf(v) {
    if (typeof v === "number" && isFinite(v) && v > 0) return v < 1e12 ? v * 1000 : v;
    if (typeof v === "string" && v) {
      const t = Date.parse(v);
      return isFinite(t) ? t : 0;
    }
    if (v instanceof Date) return v.getTime() || 0;
    return 0;
  }
  const maxTs = (...vals) => vals.reduce((m, v) => Math.max(m, tsOf(v)), 0);
  function ago(t) {
    if (!t) return "";
    const d = clock() - t;
    if (d < 0) return "just now";
    const m = Math.round(d / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h ago`;
    const days = Math.round(h / 24);
    return days === 1 ? "yesterday" : `${days} days ago`;
  }
  async function waitFor(fn, ms, step = 40) {
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
  const byAtDesc = (a, b) => (b.at || 0) - (a.at || 0);

  // ------------------------------------------------------------- app stores
  // zustand leaves getState in the deps of useSyncExternalStoreWithSelector's
  // useMemo; only pure `()=>x` getters are called (project-sidebar's method).
  const S = { ws: null, client: null };
  const GETTER_RE = /^\(\)=>[A-Za-z$_][\w$]*$/;
  const tried = new WeakSet();
  const isClient = (o) => !!o && typeof o === "object" && typeof o.query === "function" && typeof o.watchQuery === "function";
  const fiberOf = (n) => {
    const k = n && Object.keys(n).find((x) => x.startsWith("__reactFiber$"));
    return k ? n[k] : null;
  };
  function checkFiber(f) {
    const p = f.memoizedProps;
    if (!S.client && p && typeof p === "object") {
      if (isClient(p.client)) S.client = p.client;
      else if (isClient(p.value)) S.client = p.value;
    }
    if (S.ws) return;
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
  // 1) walk up from the rail and from an empty state; 2) a full tree scan,
  //    time-sliced (8 ms per tick), resumed across ticks (also finds the client).
  let scan = null;
  let lastScanEnd = -1e9;
  function discover() {
    if (S.ws && S.client) return true;
    for (const sel of [SEL.rail, SEL.empty]) {
      for (let f = fiberOf(document.querySelector(sel)), up = 0; f && up < 600 && !(S.ws && S.client); f = f.return, up++) checkFiber(f);
    }
    if (S.ws && S.client) return true;
    if (!scan) {
      if (performance.now() - lastScanEnd < (S.ws ? 10000 : 2000)) return !!S.ws;
      const root = document.getElementById("root");
      const key = root && Object.keys(root).find((k) => k.startsWith("__reactContainer$"));
      if (!key) return !!S.ws;
      scan = { stack: [root[key]], seen: new Set() };
    }
    const deadline = performance.now() + 8;
    while (scan.stack.length && performance.now() < deadline && !(S.ws && S.client)) {
      const f = scan.stack.pop();
      if (!f || scan.seen.has(f)) continue;
      scan.seen.add(f);
      checkFiber(f);
      if (f.child) scan.stack.push(f.child);
      if (f.sibling) scan.stack.push(f.sibling);
    }
    if ((S.ws && S.client) || !scan.stack.length) {
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

  // ------------------------------------------------------------ remote data
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  const queryLog = [];
  function query(name, args) {
    if (!S.client) return Promise.reject(new Error("no-client"));
    queryLog.push(name);
    if (queryLog.length > 100) queryLog.shift();
    return withTimeout(Promise.resolve(S.client.query({ [CONVEX_FN]: name }, args || {})), QUERY_TIMEOUT_MS);
  }
  const listOf = (r, ...keys) => {
    if (Array.isArray(r)) return r;
    for (const k of keys) if (r && Array.isArray(r[k])) return r[k];
    return [];
  };
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

  const R = {
    at: -1e12,
    loading: null,
    version: 0,
    status: { runs: "idle", issues: "idle", docs: "idle" },
    errors: {},
    board: null,
    issues: [],
    docs: [],
    runs: { active: [], failed: [] },
  };
  async function loadRuns() {
    R.status.runs = "loading";
    const [a, f] = await Promise.allSettled([query("agentRuns:listMyActiveRuns", {}), query("agentRuns:listMyRecentlyFailedRuns", {})]);
    if (a.status === "fulfilled") R.runs.active = listOf(a.value, "runs", "page").filter(Boolean);
    if (f.status === "fulfilled") R.runs.failed = listOf(f.value, "runs", "page").filter(Boolean);
    R.status.runs = a.status === "fulfilled" || f.status === "fulfilled" ? "ready" : "error";
    if (R.status.runs === "error") R.errors.runs = String((a.reason && a.reason.message) || a.reason);
  }
  async function loadIssues(org) {
    try {
      R.status.issues = "loading";
      const board = await query("issues:getBoard", { organizationId: org }); // never getOrCreateBoard (a mutation)
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
    } catch (e) {
      R.status.issues = "error";
      R.errors.issues = String((e && e.message) || e);
    }
  }
  async function loadDocs(org) {
    try {
      R.status.docs = "loading";
      const r = await query("docs:getDocsTree", { organizationId: org });
      R.docs = listOf(r, "tree", "docs").filter((d) => d && d._id);
      R.status.docs = "ready";
    } catch (e) {
      R.status.docs = "error";
      R.errors.docs = String((e && e.message) || e);
    }
  }
  function loadRemote(force) {
    if (R.loading) return R.loading;
    if (!S.client) return Promise.resolve(false);
    if (!force && Date.now() - R.at < REMOTE_TTL_MS) return Promise.resolve(false);
    R.at = Date.now();
    R.loading = (async () => {
      const org = activeOrgId();
      const jobs = [loadRuns()];
      // the project sidebar already holds the project's issues and docs
      if (!psModel() && org) jobs.push(loadIssues(org), loadDocs(org));
      await Promise.allSettled(jobs);
      R.version++;
      return true;
    })().finally(() => {
      R.loading = null;
      onRemote();
    });
    return R.loading;
  }

  // project-sidebar's model: the project's issues, docs, canvases and agents
  let psCache = { at: -1e12, model: null };
  function psModel() {
    const api = window.__RE_TEMPO_PROJECT_SIDEBAR__;
    if (!api || typeof api.model !== "function") return null;
    if (Date.now() - psCache.at < PS_TTL_MS) return psCache.model;
    let m = null;
    try {
      m = api.model();
    } catch (_) {}
    psCache = { at: Date.now(), model: m && Array.isArray(m.projects) ? m : null };
    return psCache.model;
  }
  function dedupe(list, keyOf) {
    const seen = new Set();
    const out = [];
    for (const x of list) {
      if (!x) continue;
      const k = keyOf(x);
      if (k == null || seen.has(k)) continue;
      seen.add(k);
      out.push(x);
    }
    return out;
  }
  function fromSidebar(projectId) {
    const m = psModel();
    if (!m) return null;
    const p = m.projects.find((x) => x && x.id === projectId) || null;
    const brs = (p && p.branches) || [];
    const all = (k) => [...((p && p[k]) || []), ...brs.flatMap((b) => (b && b[k]) || [])];
    const org = m.org || {};
    let issues = dedupe(all("issues"), (i) => i._id);
    let issueScope = issues.length ? "project" : null;
    if (!issues.length && Array.isArray(org.issues) && org.issues.length) {
      issues = org.issues;
      issueScope = "org";
    }
    let docs = dedupe(all("docs"), (d) => d._id);
    if (!docs.length && Array.isArray(org.docs)) docs = org.docs;
    return {
      issues,
      issueScope,
      docs,
      canvases: dedupe(all("canvases"), (c) => c.path || c.name).map((c) => ({ name: c.name, path: c.path, branch: c.branch, at: tsOf(c.at) })),
      agents: [...((p && p.agents) || []), ...(org.agents || [])],
    };
  }
  function overlayCanvases(projectId) {
    const s = window.__sourceRepoDataStoreDebug;
    let rows = [];
    try {
      rows = (s && typeof s.getLocalOverlay === "function" && s.getLocalOverlay(projectId)) || [];
    } catch (_) {}
    return (Array.isArray(rows) ? rows : [])
      .filter((o) => o && o.path && o.workingTreeStatus !== "deleted")
      .map((o) => ({ name: o.name || String(o.path).split("/").pop(), path: o.path, branch: o.branch, at: tsOf(o.lastModifiedAt) }));
  }

  // ---------------------------------------------------------------- context
  const branchOf = (w) => (w.repo && ((w.repo.currentBranch || "").trim() || w.repo.baseBranch)) || null;
  function wsOf(st) {
    const id = st && st.selectedWorkspaceId;
    return (id && (st.workspaces || []).find((w) => w && w.id === id)) || null;
  }
  // the selected workspace's live tabs are on the store root
  function tabsOf(st, w) {
    if (w.id === st.selectedWorkspaceId && Array.isArray(st.centerTabs)) return st.centerTabs;
    return Array.isArray(w.centerTabs) ? w.centerTabs : [];
  }
  function chatStatus(st, wsId, t) {
    let busy = false;
    try {
      busy = typeof st.isChatInProgress === "function" && st.isChatInProgress(wsId, t.id) === true;
    } catch (_) {}
    if (busy) return "running";
    if (t.isAwaitingResponse === true) return "waiting";
    const ti = t.turnInterrupted;
    if (ti && ti.superseded !== true && ti.dismissed !== true && !ti.dismissedAt) return "interrupted";
    return t.sessionId ? "done" : "new";
  }
  function sessionMsgs(key) {
    if (!key) return null;
    try {
      const d = window.__chatSessionStoreDebug;
      const m = d && typeof d.getMessages === "function" ? d.getMessages(key) : null;
      return Array.isArray(m) ? m : null;
    } catch (_) {
      return null;
    }
  }
  function textOf(m) {
    if (!m) return "";
    if (typeof m.content === "string") return m.content.trim();
    const parts = Array.isArray(m.content) ? m.content : Array.isArray(m.parts) ? m.parts : null;
    if (!parts) return typeof m.text === "string" ? m.text.trim() : "";
    return parts
      .filter((p) => p && p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("\n")
      .trim();
  }
  const msgAt = (m) => maxTs(m && m.timestamp, m && m.createdAt, m && m.at);
  function lastOf(msgs, role) {
    for (let i = msgs.length - 1, n = 0; i >= 0 && n < 80; i--, n++) {
      const m = msgs[i];
      if (!m || m.role !== role || m.isCompactSummary) continue;
      const text = textOf(m);
      if (text) return { text, at: msgAt(m) };
    }
    return null;
  }
  function chatInfo(st, w, t) {
    const msgs = sessionMsgs(t.sessionId);
    const la = msgs ? lastOf(msgs, "assistant") : null;
    const lu = msgs ? lastOf(msgs, "user") : null;
    const ti = t.turnInterrupted && typeof t.turnInterrupted === "object" ? t.turnInterrupted : null;
    return {
      id: String(t.id),
      title: norm(t.name || t.title) || "Untitled chat",
      status: chatStatus(st, w.id, t),
      sessionId: t.sessionId || null,
      at: maxTs(t.lastActivityAt, t.lastMessageAt, t.updatedAt, t.createdAt, ti && (ti.at || ti.timestamp || ti.interruptedAt), la && la.at, lu && lu.at),
      lastAssistant: la ? la.text : "",
      lastUser: lu ? lu.text : "",
      messages: msgs ? msgs.length : null,
    };
  }
  function commentTasks(wsId) {
    const api = window.__RE_TEMPO_COMMENT_AGENT__;
    if (!api || typeof api.tasks !== "function") return null;
    let list = null;
    try {
      list = api.tasks();
    } catch (_) {}
    return (Array.isArray(list) ? list : []).filter((t) => t && (!wsId || !t.workspaceId || t.workspaceId === wsId));
  }

  function collect() {
    const st = W();
    const at = clock();
    const ctx = {
      at,
      hour: new Date(at).getHours(),
      ws: null,
      project: null,
      git: null,
      chats: [],
      chatCount: 0,
      tasks: [],
      issues: [],
      issueScope: null,
      board: null,
      docs: [],
      canvases: [],
      agents: [],
      runs: { active: R.runs.active, failed: R.runs.failed },
      firstUse: false,
      projectNew: false,
      newUser: false,
      src: { store: !!st },
    };
    if (!st) return ctx;
    const w = wsOf(st);
    if (!w) return ctx;
    const p = (st.projects || []).find((x) => x && x.id === w.projectId) || null;
    ctx.ws = {
      id: w.id,
      name: norm(w.name) || null,
      branch: branchOf(w),
      base: (w.repo && w.repo.baseBranch) || null,
      path: w.path || null,
      mode: w.mode || null,
      createdAt: tsOf(w.createdAt),
    };
    ctx.project = p ? { id: p.id, name: norm(p.name || p.folderName) || null } : null;
    // git: the header's "+N −M" (repo.additions/deletions) and the changes panel's lists
    const repo = w.repo || {};
    const files = Array.isArray(st.uncommittedFiles) ? st.uncommittedFiles : [];
    const total = typeof st.uncommittedTotalCount === "number" ? st.uncommittedTotalCount : files.length;
    const ab = st.aheadBehind && typeof st.aheadBehind === "object" ? st.aheadBehind : null;
    ctx.git = {
      add: Number(repo.additions) || 0,
      del: Number(repo.deletions) || 0,
      files: total || 0,
      paths: files
        .slice(0, 8)
        .map((f) => (typeof f === "string" ? f : f && (f.path || f.filePath || f.file)))
        .filter(Boolean),
      ahead: ab ? Number(ab.ahead) || 0 : 0,
      behind: ab ? Number(ab.behind) || 0 : 0,
      base: ctx.ws.base,
      pr: st.prStatus && typeof st.prStatus === "object" ? st.prStatus : null,
    };
    // chats of the workspace (not the empty one on screen)
    const tabs = tabsOf(st, w).filter((t) => t && t.type === "chat" && t.isArchived !== true);
    ctx.chatCount = tabs.filter((t) => t.sessionId).length;
    ctx.chats = tabs
      .filter((t) => t.id !== st.activeChatTabId && (t.sessionId || t.turnInterrupted || t.isAwaitingResponse))
      .sort((a, b) => tsOf(b.createdAt) - tsOf(a.createdAt))
      .slice(0, MAX_CHATS)
      .map((t) => chatInfo(st, w, t))
      .sort(byAtDesc);
    ctx.src.sessions = !!(window.__chatSessionStoreDebug && typeof window.__chatSessionStoreDebug.getMessages === "function");
    // comment tasks
    const tasks = commentTasks(w.id);
    ctx.src.commentAgent = tasks != null;
    ctx.tasks = (tasks || []).filter((t) => t.status === "needs-input" || t.status === "failed" || t.status === "running" || t.status === "queued");
    // project data: the sidebar's model, else the mod's own queries
    const ps = p ? fromSidebar(p.id) : null;
    ctx.src.projectSidebar = !!ps;
    if (ps) {
      ctx.issues = ps.issues;
      ctx.issueScope = ps.issueScope;
      ctx.docs = ps.docs;
      ctx.canvases = ps.canvases.length ? ps.canvases : overlayCanvases(p.id);
      ctx.agents = ps.agents;
    } else {
      ctx.issues = R.issues;
      ctx.issueScope = R.issues.length ? "org" : null;
      ctx.board = R.board;
      ctx.docs = R.docs;
      ctx.canvases = p ? overlayCanvases(p.id) : [];
    }
    ctx.src.client = !!S.client;
    ctx.src.decision = !!window.__RE_TEMPO_DECISION__;
    // first use: no chat with a session here (and no task); new project: none in
    // any workspace of the project; new user: none anywhere
    const hist = (x) => tabsOf(st, x).some((t) => t && t.type === "chat" && t.sessionId);
    ctx.firstUse = !ctx.chatCount && !ctx.tasks.length;
    const others = (st.workspaces || []).filter((x) => x && x.id !== w.id && !x.isArchived);
    ctx.projectNew = ctx.firstUse && !others.some((x) => x.projectId === w.projectId && hist(x));
    ctx.newUser = ctx.projectNew && !others.some(hist);
    return ctx;
  }

  // ------------------------------------------------------------------ icons
  // lucide (ISC), the app's icon set: same viewBox, stroke and classes as the
  // native cards' icons.
  const ICON_PATHS = {
    compass: '<path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/><circle cx="12" cy="12" r="10"/>',
    palette:
      '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
    clipboard:
      '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
    rocket:
      '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    messageQuestion: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    messageWait: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/>',
    retry: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    hourglass:
      '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
    checkCheck: '<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
    commit: '<circle cx="12" cy="12" r="3"/><line x1="3" x2="9" y1="12" y2="12"/><line x1="15" x2="21" y1="12" y2="12"/>',
    pullRequest: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/>',
    branch: '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
    refresh:
      '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    circleAlert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    circleDot: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
    kanban: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 7v7"/><path d="M12 7v4"/><path d="M16 7v9"/>',
    fileText:
      '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    penTool:
      '<path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z"/><path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18"/><path d="m2.3 2.3 7.286 7.286"/><circle cx="11" cy="11" r="2"/>',
    bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    sunrise:
      '<path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/>',
    sunset:
      '<path d="M12 10V2"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m16 6-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/>',
    layers:
      '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    workflow: '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
    sparkles:
      '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
    listChecks: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
  };
  const svg = (name, cls = "size-4") =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide ${cls}" aria-hidden="true">${
      ICON_PATHS[name] || ICON_PATHS.sparkles
    }</svg>`;

  // ------------------------------------------------------------------ rules
  // The native prompts (bundle k0n), kept as the generic fallbacks.
  const NATIVE_PROMPTS = {
    tempo: "Walk me through Tempo end-to-end — Issue, PRD, Design, Code, and PR. I'm new here, show me the full workflow on a real project.",
    proto:
      "Scaffold a working prototype from an idea I'll describe. Generate the file structure, wire it up, and start a dev server so I can interact with it.",
  };
  const PRIO = { 1: "urgent", 2: "high priority", 3: "normal priority", 4: "low priority" };
  function issueKey(i, board) {
    if (i.identifier) return String(i.identifier);
    if (i.key) return String(i.key);
    if (i.number == null) return "";
    const prefix = board && board.prefix;
    return prefix ? `${prefix}-${i.number}` : `#${i.number}`;
  }
  const issueAt = (i) => maxTs(i.updatedAt, i.lastActivityAt, i._creationTime, i.createdAt);
  const docAt = (d) => maxTs(d.updatedAt, d.lastEditedAt, d.lastModifiedAt, d._creationTime, d.createdAt);
  const runAt = (r) => maxTs(r.completedAt, r.endedAt, r.finishedAt, r.failedAt, r.startedAt, r._creationTime);
  const runErr = (r) => norm(r.error && typeof r.error === "object" ? r.error.message : r.error || r.errorMessage || r.failureReason || "");

  function build(ctx) {
    const out = [];
    const add = (c) => {
      if (c && c.title && c.prompt && !out.some((x) => x.id === c.id)) out.push(Object.assign({ reason: "" }, c, { score: Math.round(c.score * 10) / 10 }));
    };
    const P = ctx.project && ctx.project.name;
    const proj = P || "this project";
    const B = ctx.ws && ctx.ws.branch;
    const where = B ? `on branch ${B}${P ? ` of ${P}` : ""}` : P ? `in ${P}` : "in this workspace";
    const g = ctx.git;
    const dirty = !!g && g.add + g.del + g.files > 0;

    // --- comment tasks (this workspace)
    const tasks = ctx.tasks || [];
    const canvasesOf = (list) => Array.from(new Set(list.map((t) => t.canvasName).filter(Boolean)));
    const onWhat = (list) => {
      const cs = canvasesOf(list);
      return cs.length === 1 ? cs[0] : cs.length > 1 ? `${cs.length} canvases` : "the canvas";
    };
    const taskLine = (t) =>
      `- "${clip(t.text, 220)}"${t.author && t.author.name ? ` (${t.author.name})` : ""} on canvas ${t.canvasName || "unknown"}` +
      `${t.storyboardName ? `, storyboard "${t.storyboardName}"` : ""} [task ${t.id}${t.chatId ? `, chat ${t.chatId}` : ""}]` +
      (t.summary ? `\n  The agent's last note: "${clip(t.summary, 240)}"` : "") +
      (t.error ? `\n  Error: ${clip(t.error, 200)}` : "");
    const waiting = tasks.filter((t) => t.status === "needs-input");
    if (waiting.length) {
      const n = waiting.length;
      add({
        id: "tasks-input",
        group: "tasks-input",
        score: 100 + Math.min(n, 5),
        icon: "messageQuestion",
        title: n === 1 ? `Answer the comment task waiting on ${onWhat(waiting)}` : `Resolve ${n} comment tasks waiting for you on ${onWhat(waiting)}`,
        reason: `${plural(n, "comment task")} need${n === 1 ? "s" : ""} your input · ${onWhat(waiting)}`,
        prompt:
          `${n === 1 ? "A canvas comment task is" : `${n} canvas comment tasks are`} waiting for my input ${where}:\n` +
          `${waiting.slice(0, 8).map(taskLine).join("\n")}\n\n` +
          "For each one, tell me in one or two sentences what the agent needs from me and propose the answer you would give. " +
          "Then open the canvas file and make the change the comment asks for once I confirm, keeping each change inside its storyboard.",
      });
    }
    const failedT = tasks.filter((t) => t.status === "failed");
    if (failedT.length) {
      const n = failedT.length;
      add({
        id: "tasks-failed",
        group: "tasks-failed",
        score: 90 + Math.min(n, 5),
        icon: "retry",
        title: `Retry ${plural(n, "failed comment task")} on ${onWhat(failedT)}`,
        reason: `${plural(n, "comment task")} failed · ${onWhat(failedT)}`,
        prompt:
          `${n === 1 ? "A canvas comment task" : `${n} canvas comment tasks`} failed ${where}:\n${failedT.slice(0, 8).map(taskLine).join("\n")}\n\n` +
          "Find out why each one failed (read the error and the canvas file), fix the cause, and redo the change the comment asks for. " +
          "End with a short before/after summary per task.",
      });
    }
    const activeT = tasks.filter((t) => t.status === "running" || t.status === "queued");
    if (activeT.length) {
      const n = activeT.length;
      add({
        id: "tasks-active",
        group: "tasks-active",
        score: 30 + Math.min(n, 5),
        icon: "hourglass",
        title: `Check on ${plural(n, "running comment task")}`,
        reason: `${plural(n, "task")} in progress · ${onWhat(activeT)}`,
        prompt:
          `${n === 1 ? "A canvas comment task is" : `${n} canvas comment tasks are`} running right now ${where}:\n${activeT.slice(0, 8).map(taskLine).join("\n")}\n\n` +
          "Without interrupting them, look at the canvas files they touch and tell me what each one is changing, " +
          "whether any two overlap (same file or storyboard), and what I should review first when they finish.",
      });
    }

    // --- chats of the workspace
    const chats = ctx.chats || [];
    const q = (c, n = 34) => `'${clip(c.title, n)}'`;
    const lastBlock = (c) =>
      (c.lastUser ? `\nMy last request there was:\n"""\n${excerpt(c.lastUser, 700)}\n"""` : "") +
      (c.lastAssistant ? `\nThe last assistant message was:\n"""\n${excerpt(c.lastAssistant, 900)}\n"""` : "");
    const wait = chats.find((c) => c.status === "waiting");
    if (wait) {
      add({
        id: `chat-wait:${wait.id}`,
        group: "chat-waiting",
        score: 86,
        icon: "messageWait",
        title: `Decide what ${q(wait, 30)} is asking`,
        reason: `waiting for your answer${wait.at ? ` · ${ago(wait.at)}` : ""}`,
        prompt:
          `The chat "${wait.title}" (chat ${wait.id}) ${where} stopped to ask me something${wait.at ? ` ${ago(wait.at)}` : ""}.${lastBlock(wait)}\n\n` +
          "Lay out the options it is asking me to choose between, with the trade-offs of each, and recommend one with a short reason so I can answer it.",
      });
    }
    const intr = chats.find((c) => c.status === "interrupted");
    if (intr) {
      add({
        id: `chat-continue:${intr.id}`,
        group: "chat-continue",
        score: 84,
        icon: "history",
        title: `Continue ${q(intr)} where it stopped`,
        reason: `interrupted${intr.at ? ` ${ago(intr.at)}` : ""}`,
        prompt:
          `Continue the work from the chat "${intr.title}" (chat ${intr.id}) ${where}. It was interrupted${intr.at ? ` ${ago(intr.at)}` : ""} before it finished.${lastBlock(intr)}\n\n` +
          "Check the current state of the files involved (git status and diff), work out which steps are done and which are left, " +
          "finish the remaining ones, and end with a short list of anything still open.",
      });
    }
    const recent = chats.find((c) => c.status === "done" && c.at && ctx.at - c.at < 36 * 3600e3);
    if (recent) {
      const hours = Math.max(0, (ctx.at - recent.at) / 3600e3);
      add({
        id: `chat-follow:${recent.id}`,
        group: "chat-follow",
        score: 44 - Math.min(20, hours),
        icon: "checkCheck",
        title: `Verify and wrap up ${q(recent, 32)}`,
        reason: `last chat · ${ago(recent.at)}`,
        prompt:
          `Follow up on the chat "${recent.title}" (chat ${recent.id}) ${where}, last active ${ago(recent.at)}.` +
          `${recent.lastAssistant ? `\nIts final message was:\n"""\n${excerpt(recent.lastAssistant, 900)}\n"""` : ""}\n\n` +
          "Verify the change works end to end (build, tests, and a run of the affected flow), list anything it left undone " +
          "(TODOs, debug code, missing tests), and propose the single next step.",
      });
    }
    const running = chats.filter((c) => c.status === "running");
    if (running.length) {
      add({
        id: "chats-running",
        group: "chats-running",
        score: 18,
        icon: "hourglass",
        title: running.length === 1 ? `Review what ${q(running[0], 30)} is changing` : `Review what ${running.length} running chats are changing`,
        reason: `${plural(running.length, "chat")} running`,
        prompt:
          `${running.length === 1 ? "A chat is" : `${running.length} chats are`} running ${where}: ${running.map((c) => `"${c.title}" (chat ${c.id})`).join(", ")}.\n\n` +
          "Without touching their files, look at the uncommitted diff and tell me what they are changing so far, and anything that looks risky.",
      });
    }

    // --- git
    if (dirty) {
      const lines = g.add + g.del;
      const onBase = !!(B && (B === g.base || /^(main|master|trunk|develop)$/.test(B)));
      const what = lines > 0 ? `${fmt(lines)} changed lines` : plural(g.files, "changed file");
      const more = g.files > g.paths.length ? `, and ${fmt(g.files - g.paths.length)} more` : "";
      add({
        id: "git-commit",
        group: "git",
        score: 60 + Math.min(24, 6 * Math.log10(lines + 1)) + (onBase && lines > 300 ? 6 : 0),
        icon: "commit",
        title: `Review and commit ${what}${B ? ` on ${B}` : ""}`,
        reason: `+${fmt(g.add)} −${fmt(g.del)}${g.files ? ` · ${plural(g.files, "file")}` : ""}`,
        prompt:
          `There are uncommitted changes ${where}: +${fmt(g.add)} / −${fmt(g.del)} lines${g.files ? ` across ${plural(g.files, "file")}` : ""}.` +
          `${g.paths.length ? `\nChanged files include: ${g.paths.join(", ")}${more}.` : ""}` +
          `${onBase ? `\n${B} is the base branch, so first propose a feature branch name and move the work there.` : ""}\n\n` +
          "Review the diff with git, group the changes into logical commits with clear messages, and flag anything that looks unintended " +
          "(debug code, secrets, generated or very large files). Show me the commit plan and wait for my OK before committing.",
      });
    }
    if (g && g.ahead > 0) {
      add({
        id: "git-pr",
        group: "git-pr",
        score: dirty ? 40 : 56,
        icon: "pullRequest",
        title: `Open a PR for ${plural(g.ahead, "commit")}${B ? ` on ${B}` : ""}`,
        reason: `${fmt(g.ahead)} ahead of ${g.base || "the base branch"}`,
        prompt:
          `Branch ${B || "this branch"}${P ? ` of ${P}` : ""} is ${plural(g.ahead, "commit")} ahead of ${g.base || "its base branch"}${g.behind ? ` and ${fmt(g.behind)} behind` : ""}.\n\n` +
          "Summarize those commits, run the project's checks (lint, type check, tests), and draft a pull request: a clear title, " +
          "what changed and why, how to test it, and any risk. Show me the draft before opening it.",
      });
    }
    if (g && g.behind > 0) {
      add({
        id: "git-sync",
        group: "git-sync",
        score: 34 + Math.min(10, g.behind),
        icon: "refresh",
        title: `Sync ${B || "this branch"} with ${plural(g.behind, "new commit")}`,
        reason: `${fmt(g.behind)} behind ${g.base || "the base branch"}`,
        prompt:
          `Branch ${B || "this branch"}${P ? ` of ${P}` : ""} is ${plural(g.behind, "commit")} behind ${g.base || "its base branch"}.\n\n` +
          "Summarize what changed upstream, tell me whether it conflicts with the work on this branch, and propose how to bring it in " +
          "(merge or rebase) — wait for my OK before rewriting any history.",
      });
    }
    const pr = g && g.pr;
    if (pr) {
      const n = pr.number ?? pr.prNumber ?? pr.id;
      const checks = String(pr.checksStatus ?? pr.checkStatus ?? pr.ciStatus ?? (pr.checks && pr.checks.state) ?? pr.statusCheckRollup ?? "");
      if (n != null && /fail|error/i.test(checks)) {
        add({
          id: `pr-checks:${n}`,
          group: "pr",
          score: 78,
          icon: "circleAlert",
          title: `Fix failing checks on PR #${n}`,
          reason: `checks: ${clip(checks, 30)}`,
          prompt:
            `The pull request #${n}${pr.title ? ` "${pr.title}"` : ""} for branch ${B || "this branch"} has failing checks (${clip(checks, 60)}).\n\n` +
            "Find which checks fail and why (run them locally where possible), fix the causes, and tell me what you changed.",
        });
      } else if (n != null && /changes_requested/i.test(String(pr.reviewDecision || ""))) {
        add({
          id: `pr-review:${n}`,
          group: "pr",
          score: 70,
          icon: "pullRequest",
          title: `Address the review on PR #${n}`,
          reason: "changes requested",
          prompt: `The pull request #${n}${pr.title ? ` "${pr.title}"` : ""} for branch ${B || "this branch"} has changes requested.\n\nRead the review comments, address each one in the code, and draft a short reply per comment.`,
        });
      }
    }

    // --- issues (the project's, else the board's)
    const issues = (ctx.issues || []).filter((i) => i && i.title && !ISSUE_DONE.test(i.status || ""));
    const scope = ctx.issueScope === "project" && P ? P : "the board";
    const key = (i) => issueKey(i, ctx.board);
    const prio = (i) => (typeof i.priority === "number" && i.priority > 0 ? i.priority : 3);
    const issueLine = (i) =>
      `- ${key(i) ? key(i) + " " : ""}${clip(i.title, 120)} [${i.status || "open"}${PRIO[i.priority] ? `, ${PRIO[i.priority]}` : ""}${i.branchName ? `, branch ${i.branchName}` : ""}]`;
    const issueRef = (i) => `${key(i) ? key(i) + " " : ""}"${i.title}" (issue ${i._id})`;
    const activeI = issues.filter((i) => ISSUE_ACTIVE.test(i.status || "")).sort((a, b) => prio(a) - prio(b) || issueAt(b) - issueAt(a))[0];
    if (activeI) {
      add({
        id: `issue-continue:${activeI._id}`,
        group: "issue-active",
        score: 54 + (prio(activeI) <= 2 ? 8 : 0),
        icon: "circleDot",
        title: `Continue ${key(activeI) ? key(activeI) + " " : ""}'${clip(activeI.title, 30)}'`,
        reason: `${String(activeI.status || "").replace(/_/g, " ")}${PRIO[activeI.priority] ? ` · ${PRIO[activeI.priority]}` : ""}`,
        prompt:
          `Pick up the issue ${issueRef(activeI)}, which is ${String(activeI.status || "in progress").replace(/_/g, " ")}${activeI.branchName ? ` on branch ${activeI.branchName}` : ""}.` +
          `${activeI.description ? `\nIts description:\n"""\n${excerpt(activeI.description, 700)}\n"""` : ""}\n\n` +
          "Check what is already done in the code, list what is left to meet the issue, and do the next step. Tell me when it needs my review.",
      });
    }
    const open = issues.filter((i) => !ISSUE_ACTIVE.test(i.status || ""));
    const urgent = open.filter((i) => i.priority === 1 || i.priority === 2).sort((a, b) => prio(a) - prio(b) || issueAt(b) - issueAt(a))[0];
    const startI = urgent || (open.length === 1 ? open[0] : null);
    if (startI) {
      add({
        id: `issue-start:${startI._id}`,
        group: "issue-start",
        score: startI.priority === 1 ? 70 : startI.priority === 2 ? 60 : 48,
        icon: startI.priority === 1 || startI.priority === 2 ? "flag" : "circleDot",
        title: `Start on ${key(startI) ? key(startI) + ": " : ""}'${clip(startI.title, 30)}'`,
        reason: `${PRIO[startI.priority] || "open"} · ${String(startI.status || "todo").replace(/_/g, " ")}`,
        prompt:
          `Start on the issue ${issueRef(startI)}${PRIO[startI.priority] ? `, marked ${PRIO[startI.priority]}` : ""}${scope !== "the board" ? `, in ${P}` : ""}.` +
          `${startI.description ? `\nIts description:\n"""\n${excerpt(startI.description, 700)}\n"""` : ""}\n\n` +
          "Restate the goal in one line, find the code involved, propose a short plan, and implement it after I confirm.",
      });
    }
    if (open.length >= 2) {
      const counts = {};
      for (const i of open) counts[i.status || "open"] = (counts[i.status || "open"] || 0) + 1;
      add({
        id: "issues-triage",
        group: "issues-triage",
        score: 50 + Math.min(10, open.length),
        icon: "kanban",
        title: `Triage ${open.length} open issues in ${clip(scope, 28)}`,
        reason: Object.entries(counts)
          .map(([s, n]) => `${n} ${s.replace(/_/g, " ")}`)
          .join(" · "),
        prompt:
          `There are ${open.length} open issues in ${scope === "the board" ? "the issue board" : P}:\n` +
          `${open.slice(0, 12).map(issueLine).join("\n")}${open.length > 12 ? `\n- …and ${open.length - 12} more` : ""}\n\n` +
          "Group them by theme, flag duplicates or stale ones, suggest a priority for each, and pick the three I should do first with a one-line reason each. " +
          "Read the code where it helps you judge the effort.",
      });
    }

    // --- docs
    const doc = (ctx.docs || [])
      .filter((d) => d && d.title && docAt(d) && ctx.at - docAt(d) < 7 * 864e5)
      .sort((a, b) => docAt(b) - docAt(a))[0];
    if (doc) {
      const prd = /\b(prd|spec|requirements?|proposal|rfc)\b/i.test(doc.title);
      add({
        id: `doc:${doc._id}`,
        group: "doc",
        score: prd ? 46 : 32,
        icon: "fileText",
        title: prd ? `Build a prototype from '${clip(doc.title, 30)}'` : `Turn '${clip(doc.title, 30)}' into a task plan`,
        reason: `doc edited ${ago(docAt(doc))}`,
        prompt: prd
          ? `Read the Tempo doc "${doc.title}" (doc ${doc._id}) and turn its requirements into a working prototype ${where}: ` +
            "list the screens and states it implies, build them with the project's existing components, and tell me which requirements are covered and which are not yet."
          : `Read the Tempo doc "${doc.title}" (doc ${doc._id}) and turn it into an ordered task plan for ${proj}: concrete tasks with the files each one touches, ` +
            "their order and dependencies, open questions for me, and a rough size per task.",
      });
    }

    // --- canvases
    const cv = (ctx.canvases || []).filter((c) => c && c.name && c.at && ctx.at - c.at < 3 * 864e5).sort(byAtDesc)[0];
    if (cv) {
      add({
        id: `canvas:${cv.path || cv.name}`,
        group: "canvas",
        score: 34,
        icon: "penTool",
        title: `Polish the '${clip(cv.name, 30)}' canvas`,
        reason: `canvas edited ${ago(cv.at)}`,
        prompt:
          `Open the canvas "${cv.name}"${cv.path ? ` (${cv.path})` : ""}${cv.branch ? ` on branch ${cv.branch}` : ""}. ` +
          "Review its storyboards against the project's design system (tokens, components, spacing, states), list the inconsistencies you find, " +
          "and fix the three most visible ones. Keep every change inside the canvas.",
      });
    }

    // --- agent runs
    const agentName = (r) => {
      const a = (ctx.agents || []).find((x) => x && (x._id === r.agentId || x.id === r.agentId));
      return norm(r.agentName || (r.agent && r.agent.name) || (a && a.name)) || "An agent";
    };
    const failedR = (ctx.runs.failed || []).filter((r) => r && (!runAt(r) || ctx.at - runAt(r) < 48 * 3600e3));
    if (failedR.length) {
      const names = Array.from(new Set(failedR.map(agentName)));
      add({
        id: "runs-failed",
        group: "runs-failed",
        score: 72 + Math.min(failedR.length, 5),
        icon: "bot",
        title: `Investigate ${plural(failedR.length, "failed agent run")}`,
        reason: clip(names.join(", "), 60),
        prompt:
          `${failedR.length === 1 ? "An agent run" : `${failedR.length} agent runs`} failed recently:\n` +
          failedR
            .slice(0, 8)
            .map((r) => `- ${agentName(r)}, run ${r._id || r.id}${runAt(r) ? `, ${ago(runAt(r))}` : ""}${runErr(r) ? `: ${clip(runErr(r), 200)}` : ""}`)
            .join("\n") +
          "\n\nFind the common cause if there is one (configuration, permissions, a flaky step, the prompt), say whether a retry would likely succeed, and propose the fix for each agent.",
      });
    }
    const activeR = ctx.runs.active || [];
    if (activeR.length) {
      add({
        id: "runs-active",
        group: "runs-active",
        score: 22,
        icon: "bot",
        title: `Check on ${plural(activeR.length, "agent run")} in progress`,
        reason: clip(Array.from(new Set(activeR.map(agentName))).join(", "), 60),
        prompt:
          `${activeR.length === 1 ? "An agent run is" : `${activeR.length} agent runs are`} in progress: ` +
          `${activeR.slice(0, 8).map((r) => `${agentName(r)} (run ${r._id || r.id})`).join(", ")}.\n\n` +
          "Tell me what each one is working on and whether anything needs my attention.",
      });
    }

    // --- first use: onboarding
    if (ctx.firstUse) {
      const pn = ctx.projectNew;
      add({
        id: "arch",
        group: "arch",
        score: pn ? 80 : 58,
        icon: "layers",
        title: "Explain this repo's architecture",
        reason: pn ? "new project" : "new workspace",
        prompt:
          `I'm ${pn ? "new to" : "starting a new branch in"} ${proj}${B ? ` (branch ${B})` : ""}. Explain this repo's architecture: ` +
          "the main folders and what lives in each, the entry points, how data flows from the UI to storage and back, the key dependencies, " +
          "and how to run it locally. End with a short map of where the most common kinds of change go.",
      });
      if (!pn && B) {
        add({
          id: "branch-plan",
          group: "branch-plan",
          score: 64,
          icon: "branch",
          title: `Plan the work for ${clip(B, 36)}`,
          reason: "fresh workspace",
          prompt:
            `This is a fresh workspace on branch ${B}${P ? ` of ${P}` : ""}${ctx.ws.base && ctx.ws.base !== B ? `, based on ${ctx.ws.base}` : ""}. ` +
            "From the branch name, the recent commits and the open issues, propose what this branch should deliver, a step-by-step plan with the files involved, " +
            "and how I'll know it's done. Ask me up to three questions if the goal is unclear.",
        });
      }
      add({
        id: "flows",
        group: "flows",
        score: pn ? 66 : 40,
        icon: "workflow",
        title: `Map the main user flows of ${clip(proj, 26)}`,
        reason: "onboarding",
        prompt:
          `Explore ${proj} and capture its three main user journeys as storyboards on a canvas, one screen per step, using the app's real components where you can. ` +
          "Name each flow and note where it starts in the code.",
      });
      add({
        id: "setup",
        group: "setup",
        score: pn ? 60 : 36,
        icon: "terminal",
        title: `Get ${clip(proj, 28)} running locally`,
        reason: "onboarding",
        prompt:
          `Get ${proj} running locally: find the package manager and scripts, install dependencies, set up env files from their examples ` +
          "(never invent secrets: ask me), start the dev server, and tell me the URL and anything that failed.",
      });
      add({
        id: "ds",
        group: "ds",
        score: pn ? 56 : 30,
        icon: "palette",
        title: P ? `Create a design system canvas from ${clip(P, 24)}` : "Create a design system canvas from my code",
        reason: "onboarding",
        prompt: `Create a design system canvas from ${P ? `the ${P} codebase` : "my codebase"}. Pull out my colors, typography, spacing tokens, and reusable components into a canvas I can browse and iterate on.`,
      });
      if (ctx.newUser) add({ id: "tempo", group: "tempo", score: 52, icon: "compass", title: "Walk me through how Tempo works", reason: "first time here", prompt: NATIVE_PROMPTS.tempo });
    }

    // --- time of day (not on a first use: onboarding comes first)
    const h = ctx.hour;
    if (!ctx.firstUse && h >= 5 && h < 12) {
      add({
        id: "time-morning",
        group: "time",
        score: 26,
        icon: "sunrise",
        title: "Catch up on what changed since yesterday",
        reason: "morning",
        prompt:
          `Catch me up on ${proj}${B ? ` (branch ${B})` : ""} since yesterday: the commits (git log --since=yesterday), what is uncommitted, and anything in progress. ` +
          "Then propose my top three tasks for today, with a reason for each.",
      });
    } else if (!ctx.firstUse && (h >= 17 || h < 2)) {
      add({
        id: "time-evening",
        group: "time",
        score: 26 + (dirty ? 8 : 0),
        icon: "sunset",
        title: `Wrap up today's work${B ? ` on ${clip(B, 28)}` : ""}`,
        reason: "end of day",
        prompt:
          `Help me wrap up today on ${proj}${B ? ` (branch ${B})` : ""}: summarize what changed today (commits and uncommitted work), list what is half-done, ` +
          "and write a short handoff note I can pick up from tomorrow, with the very next step at the top.",
      });
    }

    // --- generic (always there, so the cards and the list are never short)
    add({
      id: "quick-wins",
      group: "quick-wins",
      score: 16,
      icon: "sparkles",
      title: `Find quick wins in ${clip(proj, 28)}`,
      reason: "always useful",
      prompt:
        `Scan ${proj}${B ? ` on branch ${B}` : ""} for quick wins I can ship today: failing or flaky tests, lint and type errors, obvious bugs, dead code, ` +
        "outdated dependencies with known fixes, and small UX papercuts. Rank them by value over effort and fix the top one after I confirm.",
    });
    if (!ctx.firstUse && B) {
      add({
        id: "review-recent",
        group: "review-recent",
        score: 15,
        icon: "search",
        title: `Review recent commits on ${clip(B, 30)}`,
        reason: "code health",
        prompt: `Review the last 10 commits on branch ${B}${P ? ` of ${P}` : ""} for bugs, risky patterns and missing tests. List the findings by severity with file and line, and propose fixes for the top ones.`,
      });
    }
    add({
      id: "arch",
      group: "arch",
      score: 13,
      icon: "layers",
      title: "Explain this repo's architecture",
      reason: "orientation",
      prompt: `Explain the architecture of ${proj}: the main folders and what lives in each, the entry points, how data flows, the key dependencies, and where the most common kinds of change go.`,
    });
    add({
      id: "prd",
      group: "prd",
      score: 12,
      icon: "clipboard",
      title: P ? `Write a PRD for a new feature in ${clip(P, 22)}` : "Write a PRD for a new feature",
      reason: "plan something new",
      prompt: `Help me write a PRD for a new feature in ${proj}. Ask me clarifying questions first, then draft a structured doc with problem, users, requirements, and success criteria, grounded in what the code does today.`,
    });
    add({
      id: "ds",
      group: "ds",
      score: 11,
      icon: "palette",
      title: "Create a design system canvas from my code",
      reason: "design",
      prompt: `Create a design system canvas from ${P ? `the ${P} codebase` : "my codebase"}. Pull out my colors, typography, spacing tokens, and reusable components into a canvas I can browse and iterate on.`,
    });
    add({ id: "proto", group: "proto", score: 10, icon: "rocket", title: "Scaffold a working prototype", reason: "start something new", prompt: NATIVE_PROMPTS.proto });
    add({
      id: "tests",
      group: "tests",
      score: 9,
      icon: "listChecks",
      title: `Add tests where ${clip(proj, 22)} is riskiest`,
      reason: "code health",
      prompt: `Find the riskiest untested code in ${proj} (complex logic, recent changes, past bugs), propose the tests that would catch the most likely regressions, and write the top five.`,
    });
    add({ id: "tempo", group: "tempo", score: 6, icon: "compass", title: "Walk me through how Tempo works", reason: "Tempo basics", prompt: NATIVE_PROMPTS.tempo });
    return out;
  }

  // the cards: the best of each group first, then by score
  function pick(sorted, n) {
    const out = [];
    const groups = new Set();
    for (const c of sorted) {
      if (out.length >= n) break;
      if (groups.has(c.group)) continue;
      groups.add(c.group);
      out.push(c);
    }
    for (const c of sorted) {
      if (out.length >= n) break;
      if (!out.includes(c)) out.push(c);
    }
    return out;
  }

  // ------------------------------------------- decision model (optional re-rank)
  // scores apply only to the candidate set they were computed for (scoresSig)
  const D = { sig: null, at: 0, lastCall: 0, inflight: null, scores: new Map(), scoresSig: null, status: "off", error: null, latencyMs: null, calls: 0 };
  const DECIDE_MIN_GAP_MS = 20000;
  function decisionApi() {
    const api = window.__RE_TEMPO_DECISION__;
    return api && typeof api.decide === "function" && typeof api.configured === "function" ? api : null;
  }
  function decisionOn() {
    const api = decisionApi();
    const own = lsGet(RERANK);
    if (!api || own === "off") return false;
    let configured = false;
    try {
      configured = api.configured() === true;
    } catch (_) {}
    if (!configured) return false;
    if (own === "on") return true;
    try {
      const s = typeof api.settings === "function" ? api.settings() : null;
      if (s && s.automations && s.automations.suggestions === true) return true;
    } catch (_) {}
    try {
      const raw = JSON.parse(lsGet(DM_SETTINGS) || "null");
      return !!(raw && raw.automations && raw.automations.suggestions === true);
    } catch (_) {
      return false;
    }
  }
  function decisionState(ctx, list) {
    const t = ctx.tasks || [];
    const open = (ctx.issues || []).filter((i) => i && !ISSUE_DONE.test(i.status || ""));
    return {
      task: "Rank suggestions for the empty state of a new chat in a coding/design workspace.",
      hour: ctx.hour,
      project: (ctx.project && ctx.project.name) || null,
      branch: (ctx.ws && ctx.ws.branch) || null,
      firstUse: ctx.firstUse,
      uncommitted: ctx.git ? { additions: ctx.git.add, deletions: ctx.git.del, files: ctx.git.files } : null,
      ahead: ctx.git ? ctx.git.ahead : 0,
      chats: {
        interrupted: ctx.chats.filter((c) => c.status === "interrupted").length,
        waiting: ctx.chats.filter((c) => c.status === "waiting").length,
        running: ctx.chats.filter((c) => c.status === "running").length,
        total: ctx.chatCount,
      },
      commentTasks: {
        needsInput: t.filter((x) => x.status === "needs-input").length,
        failed: t.filter((x) => x.status === "failed").length,
        running: t.filter((x) => x.status === "running" || x.status === "queued").length,
      },
      issues: { open: open.length, inProgress: open.filter((i) => ISSUE_ACTIVE.test(i.status || "")).length, urgent: open.filter((i) => i.priority === 1).length },
      agentRuns: { failed: (ctx.runs.failed || []).length, active: (ctx.runs.active || []).length },
      suggestions: Object.fromEntries(list.map((c, i) => [`s${i}`, { title: c.title, why: c.reason }])),
    };
  }
  const ruleSigOf = (sorted) =>
    sorted
      .slice(0, MAX_ALL)
      .map((c) => `${c.id}:${c.title}`)
      .join("|");
  function maybeDecide(ctx, sorted, sig) {
    if (!decisionOn()) {
      D.status = decisionApi() ? "off" : "absent";
      D.scores = new Map();
      D.scoresSig = null;
      return;
    }
    const top = sorted.slice(0, MAX_ALL);
    if (D.inflight || (D.sig === sig && Date.now() - D.at < DECIDE_TTL_MS)) return;
    if (Date.now() - D.lastCall < DECIDE_MIN_GAP_MS) return; // counts that keep moving never flood the API
    D.sig = sig;
    D.at = Date.now();
    D.lastCall = Date.now();
    const api = decisionApi();
    const keys = {};
    const questions = {};
    const labels = {};
    top.forEach((c, i) => {
      const k = `s${i}`;
      keys[k] = c.id;
      labels[k] = `Suggestion: ${c.title}`;
      questions[k] = {
        type: "score",
        instructions: `How useful would it be for this user to start a new chat with the suggestion "${c.title}" right now, given the state?`,
        criteria: ["not useful now", "somewhat useful", "useful", "the best next step"],
      };
    });
    let threshold = 0;
    try {
      const s = typeof api.settings === "function" ? api.settings() : null;
      threshold = s && typeof s.threshold === "number" ? s.threshold : 0;
    } catch (_) {}
    D.status = "pending";
    D.calls++;
    const t0 = performance.now();
    D.inflight = Promise.resolve()
      .then(() => api.decide(JSON.stringify(decisionState(ctx, top)), questions, { timeoutMs: 5000, log: { id: "smart-suggestions" }, labels }))
      .then((r) => {
        const next = new Map();
        for (const k of Object.keys(keys)) {
          const a = r && r.answers && r.answers[k];
          if (a && typeof a.value === "number" && (typeof a.confidence !== "number" || a.confidence >= threshold)) next.set(keys[k], a.value);
        }
        D.scores = next;
        D.scoresSig = next.size ? sig : null;
        D.status = next.size ? "ok" : "low-confidence";
        D.error = null;
      })
      .catch((e) => {
        // silent fallback: the rule order
        D.scores = new Map();
        D.scoresSig = null;
        D.status = "error";
        D.error = (e && (e.kind || e.message)) || String(e);
      })
      .finally(() => {
        D.latencyMs = Math.round(performance.now() - t0);
        D.inflight = null;
      });
  }

  // ----------------------------------------------------------------- compute
  let cur = null; // { quick, sig, cards, all, ctx, at }
  let pending = null; // { since, last, sig }
  let renders = 0;
  function quickSig(st) {
    return st ? `${st.selectedWorkspaceId || ""}|${st.activeChatTabId || ""}` : "";
  }
  function compute() {
    const st = W();
    const ctx = collect();
    const cands = build(ctx);
    const ruleSorted = cands.slice().sort((a, b) => b.score - a.score);
    const rsig = ruleSigOf(ruleSorted);
    // the model's usefulness score (0..1) moves a rule score by up to ±15
    if (D.scoresSig === rsig) {
      for (const c of cands) {
        if (!D.scores.has(c.id)) continue;
        c.rule = c.score;
        c.model = Math.round(D.scores.get(c.id) * 100) / 100;
        c.score = Math.round((c.score + (c.model - 0.5) * 30) * 10) / 10;
      }
    }
    const sorted = cands.slice().sort((a, b) => b.score - a.score);
    const cards = pick(sorted, CARDS);
    const all = [...cards, ...sorted.filter((c) => !cards.includes(c))].slice(0, MAX_ALL);
    maybeDecide(ctx, ruleSorted, rsig);
    return {
      quick: quickSig(st),
      sig: all.map((c) => `${c.id}|${c.icon}|${c.title}|${c.reason}`).join("¦"),
      cardSig: cards.map((c) => `${c.id}|${c.icon}|${c.title}`).join("¦"),
      cards,
      all,
      ctx,
      at: Date.now(),
      byId: new Map(all.map((c) => [c.id, c])),
    };
  }
  // the latest prompt for a suggestion id (relative times move on silently)
  let latest = null;
  function findSuggestion(idOrIndex) {
    if (typeof idOrIndex === "number") return (cur && cur.all[idOrIndex]) || null;
    return (latest && latest.byId.get(idOrIndex)) || (cur && cur.byId.get(idOrIndex)) || null;
  }

  // ------------------------------------------------------------------ render
  const mounts = new Map(); // empty-state element -> mount
  let html = null;
  let lastMountAt = 0;
  function nativeRowOf(es) {
    for (const el of es.children) {
      if (el.hasAttribute("data-rtss-row") || el.hasAttribute("data-rtss-more")) continue;
      if (el.querySelector('[contenteditable], textarea, input')) continue;
      const kids = el.children;
      if (!kids.length) continue;
      let ok = true;
      for (const k of kids) if (k.tagName !== "BUTTON") ok = false;
      if (ok) return el;
    }
    return null;
  }
  function makeCard(cls) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls.card;
    b.setAttribute("data-rtss-card", "");
    const ic = document.createElement("span");
    ic.className = cls.icon;
    ic.setAttribute("data-rtss-icon", "");
    const lb = document.createElement("span");
    lb.className = cls.label;
    lb.setAttribute("data-rtss-label", "");
    b.append(ic, lb);
    b.addEventListener("click", onCardClick);
    return b;
  }
  function ensureMount(es) {
    let m = mounts.get(es);
    const native = nativeRowOf(es);
    if (m && m.row.isConnected && m.row.parentNode === es) {
      if (native && native !== m.native) {
        // React rebuilt the native row: hide the new one, keep ours after it
        m.native && m.native.removeAttribute("data-rtss-native");
        native.setAttribute("data-rtss-native", "");
        m.native = native;
        if (native.nextSibling !== m.row) es.insertBefore(m.row, native.nextSibling);
        if (m.row.nextSibling !== m.more) es.insertBefore(m.more, m.row.nextSibling);
      }
      return m;
    }
    if (m) unmount(es, m);
    const nb = native && native.querySelector("button");
    const cls = {
      row: (native && native.className) || NATIVE.row,
      card: (nb && nb.className) || NATIVE.card,
      icon: (nb && nb.children[0] && nb.children[0].className) || NATIVE.icon,
      label: (nb && nb.children[1] && nb.children[1].className) || NATIVE.label,
    };
    const count = native ? Math.max(1, Math.min(CARDS, native.children.length)) : CARDS;
    const row = document.createElement("div");
    row.className = cls.row;
    row.setAttribute("data-rtss-row", "");
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "Suggestions for this workspace");
    const more = document.createElement("div");
    more.className = "rtss-more-row";
    more.setAttribute("data-rtss-more", "");
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "rtss-more";
    chip.setAttribute("aria-haspopup", "menu");
    chip.setAttribute("aria-expanded", "false");
    chip.innerHTML = `<span>More…</span>${svg("chevronDown", "rtss-more-chev")}`;
    chip.addEventListener("click", (e) => {
      e.preventDefault();
      if (pop && pop.chip === chip) closeMore(true);
      else openMore(chip);
    });
    more.appendChild(chip);
    if (native) {
      native.setAttribute("data-rtss-native", "");
      es.insertBefore(row, native.nextSibling);
    } else es.appendChild(row);
    es.insertBefore(more, row.nextSibling);
    es.setAttribute("data-rtss-on", "");
    // the empty state's parent is the size container for the narrow layout (CSS @container)
    if (es.parentElement) es.parentElement.setAttribute("data-rtss-host", "");
    m = { es, native, row, more, chip, cls, count, cards: [], at: Date.now(), mo: null, scope: null };
    mounts.set(es, m);
    watchMount(m);
    lastMountAt = Date.now();
    return m;
  }
  function renderMount(m, list, animate) {
    for (let i = 0; i < m.count; i++) {
      const s = list[i];
      let b = m.cards[i];
      if (!b) {
        b = makeCard(m.cls);
        m.row.appendChild(b);
        m.cards[i] = b;
      }
      if (!s) {
        b.hidden = true;
        continue;
      }
      b.hidden = false;
      const k = `${s.id}|${s.icon}|${s.title}`;
      if (b.dataset.rtssKey === k) continue;
      const first = !b.dataset.rtssKey;
      b.dataset.rtssKey = k;
      b.dataset.rtssId = s.id;
      b.querySelector("[data-rtss-icon]").innerHTML = svg(s.icon);
      b.querySelector("[data-rtss-label]").textContent = s.title;
      b.setAttribute("aria-description", s.reason || "");
      if (!first && animate) {
        b.classList.remove("rtss-swap");
        void b.offsetWidth;
        b.classList.add("rtss-swap");
      }
    }
  }
  function unmount(es, m) {
    m = m || mounts.get(es);
    if (!m) return;
    if (m.mo) m.mo.disconnect();
    m.observing = false;
    m.row.remove();
    m.more.remove();
    if (m.native) m.native.removeAttribute("data-rtss-native");
    for (const n of es.querySelectorAll("[data-rtss-native]")) n.removeAttribute("data-rtss-native");
    es.removeAttribute("data-rtss-on");
    if (es.parentElement) es.parentElement.removeAttribute("data-rtss-host");
    mounts.delete(es);
    if (pop && pop.chip === m.chip) closeMore(false);
  }
  function unmountAll() {
    for (const [es, m] of Array.from(mounts)) unmount(es, m);
    for (const es of document.querySelectorAll("[data-rtss-on]")) es.removeAttribute("data-rtss-on");
    for (const h of document.querySelectorAll("[data-rtss-host]")) h.removeAttribute("data-rtss-host");
    for (const n of document.querySelectorAll("[data-rtss-native]")) n.removeAttribute("data-rtss-native");
    document.documentElement.classList.remove("rtss-on");
    closeMore(false);
  }
  function apply(next, animate) {
    const changed = !cur || cur.cardSig !== next.cardSig;
    cur = next;
    latest = next;
    pending = null;
    renders++;
    for (const m of mounts.values()) renderMount(m, cur.cards, animate);
    if (changed) {
      try {
        window.dispatchEvent(new CustomEvent("rtss:changed", { detail: { cards: cur.cards.map(pub) } }));
      } catch (_) {}
    }
  }
  const pub = (c) => ({ id: c.id, group: c.group, icon: c.icon, title: c.title, reason: c.reason, prompt: c.prompt, score: c.score, model: c.model ?? null });

  // ------------------------------------------------------------- "More…" list
  let pop = null; // { el, chip, items, onDoc, onKey, onWin }
  function openMore(chip) {
    closeMore(false);
    if (!cur || !chip || !chip.isConnected) return;
    const el = document.createElement("div");
    el.className = "rtss-pop";
    el.setAttribute("data-rtss-pop", "");
    el.setAttribute("role", "menu");
    el.setAttribute("aria-label", "All suggestions");
    const head = document.createElement("div");
    head.className = "rtss-pop-head";
    const ctx = cur.ctx;
    head.textContent = `Suggested for ${[(ctx.project && ctx.project.name) || null, (ctx.ws && ctx.ws.branch) || null].filter(Boolean).join(" · ") || "this workspace"}`;
    el.appendChild(head);
    const items = cur.all.map((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "rtss-pop-item";
      b.setAttribute("role", "menuitem");
      b.tabIndex = -1;
      b.dataset.rtssId = s.id;
      b.innerHTML = `<span class="rtss-pop-icon">${svg(s.icon, "")}</span><span class="rtss-pop-text"><span class="rtss-pop-title"></span><span class="rtss-pop-meta"></span></span>`;
      b.querySelector(".rtss-pop-title").textContent = s.title;
      const meta = b.querySelector(".rtss-pop-meta");
      if (s.reason) meta.textContent = s.reason;
      else meta.remove();
      b.addEventListener("click", (e) => {
        e.preventDefault();
        const es = chip.closest(SEL.empty);
        closeMore(true);
        send(s.id, es, "more");
      });
      el.appendChild(b);
      return b;
    });
    document.body.appendChild(el);
    pop = { el, chip, items };
    chip.setAttribute("aria-expanded", "true");
    place();
    pop.onDoc = (e) => {
      if (!pop) return;
      if (pop.el.contains(e.target) || pop.chip.contains(e.target)) return;
      closeMore(false);
    };
    pop.onKey = (e) => {
      if (!pop) return;
      const i = pop.items.indexOf(document.activeElement);
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeMore(true);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = pop.items.length;
        const j = i < 0 ? (e.key === "ArrowDown" ? 0 : n - 1) : (i + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
        pop.items[j].focus();
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        pop.items[e.key === "Home" ? 0 : pop.items.length - 1].focus();
      } else if (e.key === "Tab") closeMore(false);
    };
    pop.onWin = () => place();
    document.addEventListener("pointerdown", pop.onDoc, true);
    el.addEventListener("keydown", pop.onKey);
    window.addEventListener("resize", pop.onWin);
    window.addEventListener("scroll", pop.onWin, true);
    if (items[0]) items[0].focus({ preventScroll: true });
  }
  function place() {
    if (!pop) return;
    if (!pop.chip.isConnected) return closeMore(false);
    const r = pop.chip.getBoundingClientRect();
    const el = pop.el;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(12, Math.min(r.right - w, vw - w - 12));
    const below = vh - r.bottom - 12;
    const top = below >= h + 6 || below >= r.top - 12 ? Math.min(r.bottom + 6, vh - h - 12) : Math.max(12, r.top - 6 - h);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(Math.max(12, top))}px`;
  }
  function closeMore(focusChip) {
    if (!pop) return;
    const p = pop;
    pop = null;
    document.removeEventListener("pointerdown", p.onDoc, true);
    window.removeEventListener("resize", p.onWin);
    window.removeEventListener("scroll", p.onWin, true);
    p.el.remove();
    p.chip.setAttribute("aria-expanded", "false");
    if (focusChip && p.chip.isConnected) p.chip.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------- send
  const sendLog = [];
  let sending = false;
  function emptyPropsOf(es) {
    for (let f = fiberOf(es), i = 0; f && i < 8; f = f.return, i++) {
      const p = f.memoizedProps;
      if (p && typeof p === "object" && "onPromptSelect" in p && "prompts" in p) return p;
    }
    return null;
  }
  const editorOf = (es) => (es && es.querySelector(SEL.editor)) || null;
  function focusEnd(el) {
    if (!el) return;
    try {
      el.focus();
      const sel = window.getSelection();
      if (sel) {
        sel.selectAllChildren(el);
        sel.collapseToEnd();
      }
    } catch (_) {}
  }
  const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const toHtml = (text) =>
    String(text)
      .split("\n")
      .map((l) => `<p>${escHtml(l)}</p>`)
      .join("");
  function onCardClick(e) {
    e.preventDefault();
    const b = e.currentTarget;
    send(b.dataset.rtssId, b.closest(SEL.empty), "card");
  }
  async function send(idOrIndex, es, source = "api") {
    const s = findSuggestion(idOrIndex);
    if (!s) return { ok: false, reason: "unknown-suggestion" };
    es = (es && es.isConnected ? es : null) || document.querySelector(SEL.empty);
    const rec = { at: Date.now(), id: s.id, title: s.title, source, via: null, sent: false, reason: null };
    const done = () => {
      sendLog.push(rec);
      if (sendLog.length > 20) sendLog.shift();
      try {
        window.dispatchEvent(new CustomEvent("rtss:sent", { detail: { id: rec.id, title: rec.title, via: rec.via, sent: rec.sent } }));
      } catch (_) {}
      return { ok: rec.sent || rec.reason === "fill-only", via: rec.via, sent: rec.sent, reason: rec.reason };
    };
    if (!es) return (rec.reason = "no-empty-state"), done();
    if (sending) return { ok: false, reason: "busy" };
    sending = true;
    try {
      // 1. fill: the app's own onPromptSelect (what the native card calls)
      const props = emptyPropsOf(es);
      if (props && typeof props.onPromptSelect === "function") {
        props.onPromptSelect(s.prompt);
        rec.via = "onPromptSelect";
      } else {
        const ed = editorOf(es);
        const tt = ed && ed.editor;
        if (tt && tt.commands && typeof tt.commands.setContent === "function") {
          tt.commands.setContent(toHtml(s.prompt), true);
          rec.via = "tiptap";
        } else if (ed) {
          focusEnd(ed);
          document.execCommand("selectAll", false);
          document.execCommand("insertText", false, s.prompt);
          rec.via = "insertText";
        } else {
          rec.reason = "no-input";
          return done();
        }
      }
      if (lsGet(SEND_MODE) === "fill") {
        await sleep(30);
        focusEnd(editorOf(es));
        rec.reason = "fill-only";
        return done();
      }
      // 2. send: once the composer shows the prompt, the app's own send button
      const head = alnum(s.prompt).slice(0, 24);
      const btn = await waitFor(() => {
        if (!es.isConnected) return null;
        const b = es.querySelector(SEL.send);
        if (!b || b.disabled || b.getAttribute("aria-disabled") === "true") return null;
        const ed = editorOf(es);
        return !ed || alnum(ed.innerText || ed.textContent).startsWith(head) ? b : null;
      }, SEND_WAIT_MS);
      if (!btn) {
        focusEnd(editorOf(es));
        rec.reason = es.isConnected ? "send-not-ready" : "empty-state-gone";
        return done();
      }
      btn.click();
      rec.sent = true;
      rec.via += "+send-button";
      return done();
    } catch (e) {
      rec.reason = `error: ${(e && e.message) || e}`;
      return done();
    } finally {
      sending = false;
    }
  }

  // ------------------------------------------------------------------- loop
  // The context poll (POLL_MS: stores with no change events) runs only while
  // the window is visible and an empty state is in the DOM. A workspace/chat
  // switch or a native re-render is caught by each empty state's own
  // MutationObserver (scoped to its chat view); a new empty state by one
  // document observer whose callback is a single selector check. Hidden
  // window: the interval stops and every observer disconnects.
  let timer = null;
  let ticks = 0;
  let disposed = false;
  let lastErr = null;
  let errorUntil = 0; // after a failure the native cards stay for 30 s
  function wantLoop() {
    return !disposed && !document.hidden && !!document.querySelector(SEL.empty);
  }
  function syncLoop() {
    const want = wantLoop();
    if (want && !timer) timer = setInterval(tick, POLL_MS);
    else if (!want && timer) {
      clearInterval(timer);
      timer = null;
    }
  }
  function tick() {
    if (disposed) return;
    ticks++;
    try {
      if (Date.now() >= errorUntil) tickBody();
    } finally {
      syncLoop();
    }
  }
  function tickBody() {
    try {
      if (!enabled()) {
        if (mounts.size || document.documentElement.classList.contains("rtss-on")) unmountAll();
        return;
      }
      for (const [es, m] of Array.from(mounts)) if (!es.isConnected) unmount(es, m);
      const els = Array.from(document.querySelectorAll(SEL.empty));
      if (!els.length) {
        if (pop) closeMore(false);
        return;
      }
      discover();
      const st = W();
      if (!st) {
        // the store is not reachable yet: the native cards stay
        for (const es of els) if (!mounts.has(es)) es.setAttribute("data-rtss-on", "fallback");
        return;
      }
      document.documentElement.classList.add("rtss-on");
      const next = compute();
      latest = next;
      let mountedNow = false;
      for (const es of els) {
        if (!mounts.has(es) || !mounts.get(es).row.isConnected) mountedNow = true;
        ensureMount(es);
      }
      if (!cur || next.quick !== cur.quick || mountedNow) {
        // workspace / chat switch or a new empty state: at once, no animation
        if (!cur || next.quick !== cur.quick) apply(next, false);
        else {
          for (const m of mounts.values()) renderMount(m, cur.cards, false);
          schedule(next);
        }
      } else schedule(next);
      loadRemote(false);
    } catch (e) {
      lastErr = String((e && e.stack) || e);
      errorUntil = Date.now() + 30000;
      // never leave the empty state without cards: give the native ones back
      for (const es of document.querySelectorAll(SEL.empty)) {
        const m = mounts.get(es);
        if (m) unmount(es, m);
        es.setAttribute("data-rtss-on", "fallback");
      }
    }
  }
  // debounce: apply 2 s after the last change, at most 6 s after the first
  function schedule(next) {
    if (next.sig === cur.sig) {
      pending = null;
      if (next.cardSig === cur.cardSig) {
        cur.ctx = next.ctx;
        cur.byId = next.byId;
      }
      return;
    }
    const now = Date.now();
    if (!pending) pending = { since: now, last: now, sig: next.sig };
    else if (pending.sig !== next.sig) {
      pending.sig = next.sig;
      pending.last = now;
    }
    if (now - pending.last >= DEBOUNCE_MS || now - pending.since >= MAX_WAIT_MS) apply(next, true);
  }
  function onRemote() {
    if (disposed || !enabled() || !mounts.size) return;
    // data landing right after a mount replaces the first guess at once
    if (Date.now() - lastMountAt < FRESH_MOUNT_MS && W()) apply(compute(), false);
  }
  // a workspace / chat switch: one getState read, no compute
  function switched() {
    if (!cur || !mounts.size) return false;
    const st = W();
    return !!st && quickSig(st) !== cur.quick;
  }
  // per empty state: its chat view re-renders on a switch (new session id,
  // new children) and React may rebuild the native row; the new cards land
  // with the app's own re-render, before the paint
  function watchMount(m) {
    m.scope = m.es.closest(".chat-view") || m.es.parentElement || m.es;
    m.mo = new MutationObserver(() => {
      if (disposed || document.hidden || !enabled()) return;
      if (switched() || !m.row.isConnected || (m.native && !m.native.isConnected)) return tick();
      const n = nativeRowOf(m.es);
      if (n && n !== m.native) tick();
    });
    if (!document.hidden) observeMount(m);
  }
  function observeMount(m) {
    if (!m.mo || !m.scope || !m.scope.isConnected) return;
    m.mo.observe(m.scope, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-chat-session-id"] });
    m.observing = true;
  }
  // a new empty state anywhere: mounted before its first paint
  let docObserving = false;
  const docMo = new MutationObserver(() => {
    if (disposed || document.hidden) return;
    if (!enabled()) return syncLoop(); // a cheap loop notices the flag coming back
    if (document.querySelector(`${SEL.empty}:not([data-rtss-on])`)) return tick();
    for (const es of mounts.keys()) if (!es.isConnected) return tick();
  });
  function observeAll(on) {
    if (on && !docObserving) {
      docMo.observe(document.documentElement, { childList: true, subtree: true });
      docObserving = true;
      for (const m of mounts.values()) observeMount(m);
    } else if (!on && docObserving) {
      docMo.disconnect();
      docObserving = false;
      for (const m of mounts.values()) {
        if (m.mo) m.mo.disconnect();
        m.observing = false;
      }
    }
  }
  function onVisibility() {
    if (disposed) return;
    if (document.hidden) {
      observeAll(false);
      syncLoop(); // stops the interval
    } else {
      observeAll(true);
      tick(); // catch up at once (switches made meanwhile apply without debounce)
    }
  }
  function onStorage(e) {
    if (e && e.key === FLAG && !document.hidden) tick();
  }

  function init() {
    if (disposed) return;
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);
    if (!document.hidden) observeAll(true);
    tick();
  }

  function dispose() {
    disposed = true;
    clearInterval(timer);
    timer = null;
    observeAll(false);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("DOMContentLoaded", init);
    unmountAll(); // also disconnects each empty state's observer and closes the list
    if (window.__RE_TEMPO_SMART_SUGGESTIONS__ === api) delete window.__RE_TEMPO_SMART_SUGGESTIONS__;
  }

  const api = {
    get enabled() {
      return enabled();
    },
    setEnabled(on) {
      lsSet(FLAG, on ? null : "off");
      tick();
      return enabled();
    },
    state: () => ({
      enabled: enabled(),
      store: !!S.ws,
      client: !!S.client,
      mounted: mounts.size,
      loop: !!timer,
      ticks,
      observers: { document: docObserving, local: Array.from(mounts.values()).filter((m) => m.observing).length },
      hidden: document.hidden,
      quick: cur && cur.quick,
      renders,
      pending: pending ? { since: pending.since, last: pending.last } : null,
      remote: { status: Object.assign({}, R.status), errors: Object.assign({}, R.errors), version: R.version },
      sources: cur ? Object.assign({}, cur.ctx.src) : null,
      decision: { on: decisionOn(), status: D.status, error: D.error, latencyMs: D.latencyMs, calls: D.calls, scored: D.scores.size },
      sendMode: lsGet(SEND_MODE) === "fill" ? "fill" : "fill+send",
      sendLog: sendLog.slice(),
      queryLog: queryLog.slice(),
      error: lastErr,
    }),
    context: () => (latest ? JSON.parse(JSON.stringify(latest.ctx)) : null),
    suggestions: () => (cur ? cur.cards.map(pub) : []),
    all: () => (cur ? cur.all.map(pub) : []),
    refresh() {
      R.at = -1e12;
      psCache.at = -1e12;
      D.sig = null;
      D.lastCall = 0;
      if (W()) apply(compute(), true);
      return loadRemote(true);
    },
    send: (idOrIndex) => send(idOrIndex, null, "api"),
    openMore() {
      const m = mounts.values().next().value;
      if (m) openMore(m.chip);
      return !!pop;
    },
    closeMore: () => closeMore(false),
    dispose,
  };
  window.__RE_TEMPO_SMART_SUGGESTIONS__ = api;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
