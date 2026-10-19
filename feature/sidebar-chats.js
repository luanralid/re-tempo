/*
 * RE-TEMPO · sidebar-chats (user mod layer)
 * ---------------------------------------------------------------------------
 * Every chat tab of a workspace shows in the left "Chats" sidebar, including
 * the ones the app leaves out: chats opened with the "+" of the center tab bar
 * ("secondary" chats), in the split view, in a popout window or pane-dock pane,
 * or switched to CLI mode. They are nested under the chat they belong to, in
 * Orca's style:
 *   - child row: status (small gray bullet; dashed spinning circle while the
 *     chat runs; info dot when unread; warning dot when it awaits an answer;
 *     hollow bullet for a draft), provider logo, title (truncated), a small
 *     badge with where the chat lives ("split", "window", "CLI") and the
 *     relative time on the right;
 *   - the parent row (the app's own) gets a round chevron button on the right,
 *     in place of its time, that folds/unfolds its children (state kept in
 *     localStorage). The app row's DOM is never touched: a zero-height node of
 *     the mod sits right after it and CSS (:has) reserves the lane.
 *
 * Workspace card ("one view per branch per project", Orca's worktree card):
 * each workspace node of the sidebar (the "Local" row of a local checkout, or
 * the workspace row of a worktree) gets a header of the mod as its first
 * child: line 1 = status dot (green while any chat of the workspace runs,
 * gray otherwise) + branch in bold (workspace.repo.currentBranch, else the
 * workspace name) + "primary" badge when mode !== "worktree"; line 2 = short
 * path in gray. CSS (:has on that header) draws the rounded border around the
 * workspace node, so the workspace row and all its chats sit inside the card.
 * The native workspace row stays as is (chevron, actions, menu, promoted
 * chat). The header stands for the workspace: click and right-click are
 * forwarded to the native workspace row (select, the app's own menu). When
 * that row only repeats the card title (a worktree with no chat), CSS hides
 * it and the header takes its place.
 *
 * Why they were missing (renderer bundle index-D2Ui1vc0.js, frozen copy):
 *   - The sidebar derives its rows in hRa(workspace): only centerTabs passing
 *     RG(tab) = tab.type === "chat" && !tab.ownerChatTabId become rows.
 *   - openSecondaryChatTab() creates {...kq({name: "New Chat"}),
 *     ownerChatTabId: <active primary chat>, splitPanelSide?}. Such a tab only
 *     feeds the parent row's indicator (secondaryChatTabIds). Split view tabs
 *     are the same center tabs with splitPanelSide; popout/pane-dock tabs stay
 *     in centerTabs too (CSS hides them from the center); CLI mode is the same
 *     chat tab rendered as a terminal.
 *
 * Data (read-only), found through the React fibers. zustand v4's hook calls
 * useSyncExternalStoreWithSelector(api.subscribe, api.getState, ...), which
 * leaves a useMemo with deps [getState, getServerState, selector, isEqual],
 * then the useSyncExternalStore hook (queue.getSnapshot === the memo's getter)
 * and its subscribe effect (deps [api.subscribe]). getState is a snapshot
 * getter, so calling it is pure.
 *   - workspaces store `$` (required): getState() has workspaces[],
 *     centerTabs[], selectWorkspaceChat(). Rows come from
 *     state.workspaces[].centerTabs, the list the sidebar's own rows use.
 *   - popout store `pq` (optional, "window" badge): getState() has tabs[],
 *     activeByPopup, moveToPopup(); chat entries {id: "chat:<ws>:<tab>",
 *     kind: "chat", workspaceId, chatTabId, popup}. pane-dock panes are fake
 *     popups named "rtd-dock-*".
 *   - CLI mode (optional, "CLI" badge): React state of the center panel
 *     (useState({}) keyed by chat tab id). That component is the one whose
 *     hooks read window.__chatUiStateStoreDebug with a selector on
 *     pendingOpenCliRequest; the map is the first hook of the pattern
 *     useState({}), useState({}), useCallback(fn, []), useCallback(fn, []),
 *     useState(null). Read through queue.lastRenderedState (shared by the
 *     current and alternate fibers).
 *   - "split": the workspace is in split mode and tab.splitPanelSide is "right".
 *   - status: state.isChatInProgress(ws, tab) (the sidebar's own spinner
 *     check), tab.isAwaitingResponse, tab.isUnread, tab.sessionId.
 *   - time: tab.createdAt with the app's rule (v2t: now / Nm / Nh / Nd),
 *     hidden while the chat has no sessionId, as the app does for drafts.
 *
 * Which tabs get a row: every non-archived chat tab with an owner that is a
 * primary chat of the same workspace, drafts included (the app also lists
 * "New Chat" drafts, without a time). A tab that already has a native row
 * (same chat id) is never duplicated.
 *
 * Click: state.selectWorkspaceChat(workspaceId, tabId), the action the
 * sidebar's own onChatSelect calls (it handles secondary tabs, the split side
 * and other workspaces). A chat in a window or pane-dock pane is selected in
 * that window with pq.select(popup, id) (after switching workspace when
 * needed); a native popout is also focused. Enter/Space do the same.
 * Right-click and keys are swallowed so the app's tree never acts on the
 * wrong row.
 *
 * Guard: while the project-sidebar mod replaces the native sidebar
 * (localStorage "rtd.projectSidebar" !== "off", its root [data-rtps-root] in
 * the DOM, and either that root on screen or html.rtps-hide-native set), this
 * mod shows nothing and removes its nodes. When the native Chats sidebar stays
 * on screen (root hidden at boot or after a failed push, or
 * "rtd.projectSidebar.hideNative" = "off"), the rows come back. Checked on
 * every render: observer, store change or 1 s tick.
 *
 * Off switch: localStorage "rtd.sidebarChats" = "off" turns this mod off
 * without a reload (the project sidebar's title bar switch cycles Projects ->
 * Classic chats (this mod) -> Native): every node of the mod goes and the
 * native rows (never touched) are what is left. Back to anything else, the
 * rows come back. Picked up on the "rtd:sidebar-chats-changed" window event
 * (sent by whoever flips it), on "storage" (another window) and on the tick.
 *
 * Mount: each app tree node is <div role="none" class="relative"> holding the
 * <div role="treeitem">. A plain chat row carries
 * data-testid="workspace-chat-<ws>-<chat>" on the treeitem: the mod's nodes go
 * right after that wrapper, as siblings. The first chat of a non-local
 * workspace is "promoted" into the workspace row: the testid is then on the
 * wrapper, and the mod's nodes go right after the workspace treeitem, before
 * its children group (hidden while that group is collapsed). The mod's nodes
 * carry data-rsc-root and no app testid, id or data-chat-id. A
 * MutationObserver on the [role="tree"] roots and the store subscriptions
 * re-place them (idempotent: nothing is written when the DOM already
 * matches); a 1 s tick refreshes times, spinners, CLI state and the guard.
 *
 * Fragility: the zustand/with-selector hook shape, the testid format, the
 * tree node layout, the action names (selectWorkspaceChat, isChatInProgress,
 * select) and the center panel's hook order for CLI. Each one degrades to
 * "no extra rows" or "no badge", never to an error in the app.
 * Introspection: window.__RE_TEMPO_SIDEBAR_CHATS__.
 * Validated against a fixture (fake stores + fake fibers + tree-shaped DOM
 * with the app's CSS), not in the logged-in app.
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  // Re-injection without a page reload: drop the previous instance first.
  if (window.__RE_TEMPO_SIDEBAR_CHATS__?.dispose) window.__RE_TEMPO_SIDEBAR_CHATS__.dispose();

  const CFG = window.__RE_TEMPO_SIDEBAR_CHATS_CONFIG__ || {}; // test hook only
  const POLL_MS = CFG.pollMs || 500; // no subscribe available
  const TICK_MS = CFG.tickMs || 1000; // with subscribe: times, spinners, CLI, guard
  const DISCOVER_MS = CFG.discoverMs || 1000;
  const OPTIONAL_TRIES = 60; // discovery attempts for the optional sources
  const FIBER_UP_LIMIT = 600;
  const SCAN_BUDGET_MS = 8; // per attempt, for the full tree scan
  const ANCHOR_PREFIX = "workspace-chat-";
  const OWN_TESTID = "re-tempo-sidebar-chat-";
  const LS_COLLAPSED = "re-tempo:sidebar-chats:collapsed:v1";
  const LS_GUARD = "rtd.projectSidebar";
  const LS_GUARD_NATIVE = "rtd.projectSidebar.hideNative"; // "off": native sidebars stay on screen
  const LS_SELF = "rtd.sidebarChats"; // "off": this mod applies nothing (the app's own Chats sidebar)
  const CHANGED_EV = "rtd:sidebar-chats-changed";
  // project-sidebar.js mounts <aside class="rtps" data-rtps-root> while on and
  // removes it when "rtd.projectSidebar" is "off"; the other names are spares.
  const GUARD_SEL =
    '[data-rtps-root], [data-rtd-project-sidebar], [class^="rtd-project-sidebar"], [class*=" rtd-project-sidebar"], [id^="rtd-project-sidebar"]';
  const TIME_RE = /^(now|\d+[mhd])$/;

  // ------------------------------------------------------- app classes (bundle)
  // Tree item cva (tZt) base + selected:false + disabled:false, plus "relative".
  const ROW_BASE =
    "relative group flex w-full min-w-0 select-none items-center overflow-hidden rounded-md gap-[var(--tree-item-gap)] text-[length:var(--tree-label-size)] leading-[var(--tree-label-line-height)] outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-border-secondary";
  const ROW_IDLE =
    "text-text-secondary hover:bg-[var(--tree-item-hover-bg)] hover:text-text-primary data-[hovered=true]:bg-[var(--tree-item-hover-bg)] data-[hovered=true]:text-text-primary cursor-pointer";
  // tZt hovered:true; used for the chat focused in its pane (the app keeps its
  // own selection on the owner row).
  const ROW_CURRENT = "bg-[var(--tree-item-hover-bg)] text-text-primary cursor-pointer";
  const SLOT = "flex size-[var(--tree-icon-size)] shrink-0 items-center justify-center leading-none";
  // hQe (the tree label) renders cg("block truncate outline-none", className).
  const LABEL_FALLBACK =
    "block truncate outline-none text-[length:var(--tree-label-size)] font-normal leading-tight text-body text-text-primary";
  const META_WRAP =
    "ml-auto flex min-w-0 self-stretch items-stretch gap-[var(--tree-meta-gap)] transition-opacity duration-75";
  // y2t size "xs" (the app's relative time).
  const TIME_FALLBACK =
    "font-normal text-text-tertiary [font-size:var(--text-caption)] [line-height:var(--leading-caption)]";
  // S0t dots: neutral xs, info sm, warning sm.
  const DOTS = {
    done: "shrink-0 rounded-full bg-text-tertiary size-1",
    unread: "shrink-0 rounded-full bg-[color:var(--info)] size-1.5",
    awaiting: "shrink-0 rounded-full bg-[color:var(--warning)] size-1.5",
  };

  // ------------------------------------------------------------------ icons
  const LOADING =
    '<svg class="animate-spin rsc-spin" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2"/></svg>';
  const CHEVRON =
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 7.25 6 4.25l3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // Provider logos (lobehub icons, MIT; the same ones usage-bar.js uses).
  // Claude keeps its brand orange (#D97757, the color the app itself uses for
  // the Claude mark); Codex follows the text color.
  const LOGO = (inner) =>
    `<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">${inner}</svg>`;
  const PROVIDERS = {
    claude: { name: "Claude", svg: LOGO('<path fill="#D97757" fill-rule="nonzero" d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"/>') },
    codex: { name: "Codex", svg: LOGO('<path fill="currentColor" fill-rule="evenodd" d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z"/>') },
  };

  // ------------------------------------------------------------------ helpers
  function el(tag, cls, attrs) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  // Same output as the app's v2t(date) without a format: now / Nm / Nh / Nd.
  function fmtAgo(ms, now) {
    const t = now - ms;
    const m = Math.floor(t / 6e4);
    const h = Math.floor(t / 36e5);
    const d = Math.floor(t / 864e5);
    return d > 0 ? `${d}d` : h > 0 ? `${h}h` : m > 0 ? `${m}m` : "now";
  }

  const errText = (e) => String(e && e.message ? e.message : e);
  const isPlainObject = (v) => !!v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;

  function lsGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }
  function lsSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_) {}
  }

  // ---------------------------------------------------------- collapse state
  const collapsed = new Set();
  try {
    const arr = JSON.parse(lsGet(LS_COLLAPSED) || "[]");
    if (Array.isArray(arr)) for (const k of arr) if (typeof k === "string") collapsed.add(k);
  } catch (_) {}
  function setCollapsed(gk, on) {
    if (on) collapsed.add(gk);
    else collapsed.delete(gk);
    lsSet(LS_COLLAPSED, JSON.stringify([...collapsed].slice(-200)));
  }

  // ------------------------------------------------------------- fiber access
  function fiberOf(node) {
    if (!node) return null;
    for (const k in node) if (k.startsWith("__reactFiber$")) return node[k];
    return null;
  }

  function nearestFiber(node) {
    for (let n = node, i = 0; n && i < 60; n = n.parentElement, i++) {
      const f = fiberOf(n);
      if (f) return f;
    }
    return null;
  }

  function containerFiber(node) {
    if (!node) return null;
    for (const k in node) if (k.startsWith("__reactContainer$")) return node[k];
    return null;
  }

  const isHook = (h) => !!h && typeof h === "object" && "memoizedState" in h && "queue" in h && "next" in h;

  const looksLikeWs = (s) =>
    !!s && typeof s === "object" && Array.isArray(s.workspaces) && Array.isArray(s.centerTabs) && typeof s.selectWorkspaceChat === "function";
  const looksLikePq = (s) =>
    !!s && typeof s === "object" && Array.isArray(s.tabs) && typeof s.moveToPopup === "function" && typeof s.select === "function" && isPlainObject(s.activeByPopup);

  // with-selector hooks of one fiber: [{getState, selector, subscribe}]
  function selectorHooks(f) {
    const out = [];
    let h = f && f.memoizedState;
    if (!isHook(h)) return out;
    for (let i = 0; h && i < 400; i++, h = h.next) {
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
      if (!sync || !sync.queue || sync.queue.getSnapshot !== ms[0][0]) continue;
      const eff = sync.next && sync.next.memoizedState;
      const subscribe =
        eff && Array.isArray(eff.deps) && eff.deps.length === 1 && typeof eff.deps[0] === "function" ? eff.deps[0] : null;
      out.push({ getState: ms[1][0], selector: ms[1][2], subscribe });
    }
    return out;
  }

  const probed = new WeakSet(); // getState fns already classified

  function probeStores(f, found) {
    for (const hk of selectorHooks(f)) {
      if (probed.has(hk.getState)) continue;
      probed.add(hk.getState);
      let s;
      try {
        s = hk.getState();
      } catch (_) {
        continue;
      }
      if (!found.ws && looksLikeWs(s)) found.ws = hk;
      else if (!found.pq && looksLikePq(s)) found.pq = hk;
    }
  }

  // CLI mode map (React state of the center panel), see the header.
  function probeCli(f) {
    const h3 = window.__chatUiStateStoreDebug;
    const h3get = h3 && typeof h3.getState === "function" ? h3.getState : null;
    if (!h3get) return null;
    const reads = selectorHooks(f).some((hk) => {
      if (hk.getState !== h3get || typeof hk.selector !== "function") return false;
      try {
        return Function.prototype.toString.call(hk.selector).includes("pendingOpenCliRequest");
      } catch (_) {
        return false;
      }
    });
    if (!reads) return null;
    const isState = (h) => isHook(h) && h.queue && typeof h.queue.dispatch === "function" && "lastRenderedState" in h.queue;
    const isCb0 = (h) =>
      isHook(h) &&
      Array.isArray(h.memoizedState) &&
      h.memoizedState.length === 2 &&
      typeof h.memoizedState[0] === "function" &&
      Array.isArray(h.memoizedState[1]) &&
      h.memoizedState[1].length === 0;
    let h = f.memoizedState;
    for (let i = 0; h && i < 400; i++, h = h.next) {
      const b = h.next;
      const c = b && b.next;
      const d = c && c.next;
      const e = d && d.next;
      if (!isState(h) || !isState(b) || !isCb0(c) || !isCb0(d) || !isState(e)) continue;
      if (!isPlainObject(h.memoizedState) || !isPlainObject(b.memoizedState) || e.memoizedState !== null) continue;
      if (!Object.values(h.memoizedState).every((v) => typeof v === "boolean")) continue;
      return h.queue;
    }
    return null;
  }

  // ------------------------------------------------------------- data source
  const src = {
    how: "none",
    ws: null, // {getState, subscribe}
    pq: null,
    cli: null, // useState queue of the CLI map
    unsubs: [],
    error: null,
    lastActivate: null,
    optionalTries: 0,
    scan: null,
    guard: false,
  };

  function startFibers() {
    const sels = [
      `[data-testid^="${ANCHOR_PREFIX}"]`,
      '[data-testid="workspace-item"]',
      '[data-testid="center-panel"]',
      '[data-testid="center-panel-add-tab-button"]',
      ".chat-view",
    ];
    return sels.map((s) => nearestFiber(document.querySelector(s))).filter(Boolean);
  }

  function discover() {
    const found = { ws: src.ws, pq: src.pq };
    let cli = src.cli;
    const done = () => found.ws && found.pq && cli;
    for (let f0 of startFibers()) {
      for (let f = f0, i = 0; f && i < FIBER_UP_LIMIT && !done(); i++, f = f.return) {
        probeStores(f, found);
        if (!cli) cli = probeCli(f);
      }
    }
    // Full tree scan, time-sliced across attempts, while something is missing.
    if (!done()) {
      if (!src.scan) {
        const root = containerFiber(document.getElementById("root"));
        if (root) src.scan = { stack: [root], seen: new WeakSet() };
      }
      const sc = src.scan;
      if (sc) {
        const deadline = performance.now() + SCAN_BUDGET_MS;
        while (sc.stack.length && performance.now() < deadline && !done()) {
          const f = sc.stack.pop();
          if (!f || sc.seen.has(f)) continue;
          sc.seen.add(f);
          probeStores(f, found);
          if (!cli) cli = probeCli(f);
          if (f.sibling) sc.stack.push(f.sibling);
          if (f.child) sc.stack.push(f.child);
        }
        if (!sc.stack.length) src.scan = null;
      }
    }
    adopt(found, cli);
  }

  function subscribeTo(hk, label) {
    if (!hk || typeof hk.subscribe !== "function") return false;
    try {
      const u = hk.subscribe(() => schedule());
      if (typeof u === "function") {
        src.unsubs.push(u);
        return true;
      }
    } catch (e) {
      src.error = `${label}: ${errText(e)}`;
    }
    return false;
  }

  function adopt(found, cli) {
    let changed = false;
    if (found.ws && !src.ws) {
      src.ws = found.ws;
      src.wsSubscribed = subscribeTo(found.ws, "ws");
      changed = true;
    }
    if (found.pq && !src.pq) {
      src.pq = found.pq;
      subscribeTo(found.pq, "pq");
      changed = true;
    }
    if (cli && !src.cli) {
      src.cli = cli;
      changed = true;
    }
    src.how = [src.ws && "ws", src.pq && "pq", src.cli && "cli"].filter(Boolean).join("+") || "none";
    if (changed) schedule();
  }

  function readState() {
    if (!src.ws) return null;
    try {
      const s = src.ws.getState();
      return looksLikeWs(s) ? s : null;
    } catch (e) {
      src.error = errText(e);
      return null;
    }
  }

  // Map<"ws\0tab", {id, popup, dock}> for chats living in a window/pane.
  function windowMap() {
    const m = new Map();
    if (!src.pq) return m;
    let st;
    try {
      st = src.pq.getState();
    } catch (_) {
      return m;
    }
    if (!looksLikePq(st)) return m;
    for (const t of st.tabs) {
      if (!t || t.kind !== "chat" || !t.workspaceId || !t.chatTabId || !t.popup) continue;
      let name = "";
      try {
        name = String(t.popup.name || "");
      } catch (_) {}
      m.set(`${t.workspaceId}\u0000${t.chatTabId}`, { id: t.id, popup: t.popup, dock: name.startsWith("rtd-dock-") });
    }
    return m;
  }

  function cliMap() {
    const v = src.cli && src.cli.lastRenderedState;
    return isPlainObject(v) ? v : null;
  }

  function guardOn() {
    if (lsGet(LS_GUARD) === "off" || lsGet(LS_GUARD_NATIVE) === "off") return false;
    let root = null;
    try {
      root = document.querySelector(GUARD_SEL);
    } catch (_) {}
    if (!root) return false;
    // A hidden root with the native sidebars on screen (boot, failed push)
    // replaces nothing: the native tree keeps its rows.
    return !root.hidden || document.documentElement.classList.contains("rtps-hide-native");
  }

  // Desired rows, grouped by parent chat: Map<"ws\0parent", item[]>.
  function collect(s, now) {
    const groups = new Map();
    const wins = windowMap();
    const cli = cliMap();
    for (const ws of s.workspaces) {
      if (!ws || !ws.id || ws.isArchived === true) continue;
      // Same source as the sidebar's own rows (Rt = $(e => e.workspaces)).
      const tabs = Array.isArray(ws.centerTabs)
        ? ws.centerTabs
        : ws.id === s.selectedWorkspaceId && Array.isArray(s.centerTabs)
          ? s.centerTabs
          : [];
      const selected = ws.id === s.selectedWorkspaceId;
      const split = (selected ? s.splitPanelMode : ws.splitPanelMode) === true;
      let primaries = null;
      for (const tab of tabs) {
        if (!tab || tab.type !== "chat" || !tab.ownerChatTabId || tab.isArchived === true) continue;
        if (!primaries) {
          primaries = new Set();
          for (const t of tabs) if (t && t.type === "chat" && !t.ownerChatTabId && t.isArchived !== true) primaries.add(t.id);
        }
        if (!primaries.has(tab.ownerChatTabId)) continue; // orphan: the app re-parents it
        let inProgress = false;
        try {
          inProgress = typeof s.isChatInProgress === "function" && s.isChatInProgress(ws.id, tab.id) === true;
        } catch (_) {}
        const key = `${ws.id}\u0000${tab.id}`;
        const win = wins.get(key);
        const badges = [];
        if (win) badges.push("window");
        else if (split && tab.splitPanelSide === "right") badges.push("split");
        if (cli && cli[tab.id] === true) badges.push("CLI");
        const created = typeof tab.createdAt === "number" ? tab.createdAt : null;
        const provider = typeof tab.provider === "string" && PROVIDERS[tab.provider] ? tab.provider : "";
        const item = {
          key,
          ws: ws.id,
          id: tab.id,
          parent: tab.ownerChatTabId,
          label: (typeof tab.name === "string" && tab.name.trim()) || "New Chat",
          time: tab.sessionId && created ? fmtAgo(created, now) : "",
          title: created ? new Date(created).toLocaleString() : "",
          status: inProgress
            ? "loading"
            : tab.isAwaitingResponse === true
              ? "awaiting"
              : tab.isUnread === true
                ? "unread"
                : tab.sessionId
                  ? "done"
                  : "draft",
          provider,
          badges,
          win: !!win,
          current: selected && s.activeCenterTabId === tab.id,
        };
        const gk = `${ws.id}\u0000${tab.ownerChatTabId}`;
        let g = groups.get(gk);
        if (!g) groups.set(gk, (g = []));
        g.push(item);
      }
    }
    return groups;
  }

  // ------------------------------------------------------------- layout probe
  // Reads a real chat row of the app to mirror its label/time classes and the
  // chevron spacer of the tree's "aligned" mode.
  function readTemplate() {
    let t = null;
    for (const r of document.querySelectorAll('[role="treeitem"][data-thread-workspace-id]')) {
      if (r.hasAttribute("data-rsc-row")) continue;
      t = r;
      if (r.getAttribute("data-thread-indicator") === "none") break;
    }
    const first = t && t.firstElementChild;
    const chevron = !!(first && first.tagName === "SPAN" && !first.firstElementChild && /tree-chevron-size/.test(first.className));
    const labelEl = t && t.querySelector(":scope > span.flex-1 > span");
    const labelCls = labelEl ? labelEl.className.replace(/\bworkspace-tree-shimmer\b/g, "").trim() : "";
    let timeCls = "";
    for (const sp of document.querySelectorAll('[role="treeitem"][data-thread-workspace-id] span[title]')) {
      if (TIME_RE.test((sp.textContent || "").trim())) {
        timeCls = sp.className;
        break;
      }
    }
    return {
      chevron,
      labelCls: labelCls || LABEL_FALLBACK,
      timeCls: timeCls || TIME_FALLBACK,
      sig: `${chevron}|${labelCls}|${timeCls}`,
    };
  }

  // ------------------------------------------------------------- rendering
  // nodes: Map<"ws\0tab#anchorIndex", child node>; handles: Map<"ws\0parent#i", handle>
  const nodes = new Map();
  const handles = new Map();

  function createNode(item) {
    const wrap = el("div", "relative", { role: "none", "data-rsc-root": "", "data-rsc-child": "" });
    wrap.style.marginTop = "var(--tree-item-gap-y)";
    const row = el("div", "", {
      role: "treeitem",
      tabindex: "-1",
      "data-rsc-row": "",
      "data-testid": `${OWN_TESTID}${item.ws}-${item.id}`,
    });
    row.style.paddingRight = "var(--tree-item-pr, var(--tree-item-px))";
    row.style.paddingTop = "var(--tree-item-py)";
    row.style.paddingBottom = "var(--tree-item-py)";
    row.style.height = "var(--tree-item-height, auto)";
    row.style.transition = "background-color 150ms ease, color 150ms ease";
    const status = el("span", `${SLOT} rsc-status`);
    const provider = el("span", "rsc-provider");
    const titleWrap = el("span", "rsc-title");
    const label = el("span", "");
    titleWrap.append(label);
    const badges = el("span", "rsc-badges");
    const meta = el("span", META_WRAP);
    const metaInner = el("span", "min-w-0");
    const time = el("span", "");
    metaInner.append(time);
    meta.append(metaInner);
    row.append(status, provider, titleWrap, badges, meta);
    wrap.append(row);
    const node = { wrap, row, status, provider, label, badges, time, meta, item: null, st: "", pv: null, bd: null, tplSig: "", pl: "" };
    node.onClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      activate(node.item);
    };
    node.onKey = (e) => {
      e.stopPropagation();
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate(node.item);
      }
    };
    node.onMenu = (e) => e.stopPropagation();
    row.addEventListener("click", node.onClick);
    row.addEventListener("keydown", node.onKey);
    row.addEventListener("contextmenu", node.onMenu);
    return node;
  }

  function fillNode(node, item, tpl, paddingLeft) {
    const prev = node.item;
    node.item = item;
    if (node.tplSig !== tpl.sig) {
      node.tplSig = tpl.sig;
      node.label.className = `${tpl.labelCls} rsc-label`;
      node.time.className = tpl.timeCls;
    }
    const cls = `${ROW_BASE} ${item.current ? ROW_CURRENT : ROW_IDLE} rsc-row`;
    if (node.row.className !== cls) node.row.className = cls;
    if (!prev || prev.current !== item.current) {
      if (item.current) node.row.setAttribute("aria-current", "true");
      else node.row.removeAttribute("aria-current");
    }
    if (node.pl !== paddingLeft) node.row.style.paddingLeft = node.pl = paddingLeft;
    const where = item.badges.join(", ");
    const aria = `${item.label}${where ? ` (${where})` : ""}, opened from the chat above`;
    if (!prev || prev.label !== item.label) node.label.textContent = item.label;
    if (node.row.getAttribute("aria-label") !== aria) node.row.setAttribute("aria-label", aria);
    if (!prev || prev.time !== item.time) {
      node.time.textContent = item.time;
      node.meta.hidden = !item.time;
    }
    if (!prev || prev.title !== item.title) node.time.title = item.title;
    if (node.st !== item.status) {
      node.st = item.status;
      node.row.setAttribute("data-rsc-status", item.status);
      if (item.status === "loading") node.status.innerHTML = LOADING; // constant markup
      else if (item.status === "draft") node.status.innerHTML = '<span class="rsc-hollow"></span>';
      else node.status.innerHTML = `<span class="${DOTS[item.status]}"></span>`;
      node.status.title =
        item.status === "loading" ? "Running" : item.status === "awaiting" ? "Waiting for your answer" : item.status === "unread" ? "New reply" : item.status === "draft" ? "Draft" : "";
    }
    if (node.pv !== item.provider) {
      node.pv = item.provider;
      const p = PROVIDERS[item.provider];
      node.provider.innerHTML = p ? p.svg : ""; // constant markup
      node.provider.hidden = !p;
      node.provider.setAttribute("data-provider", item.provider);
      node.provider.title = p ? p.name : "";
    }
    const bd = item.badges.join("|");
    if (node.bd !== bd) {
      node.bd = bd;
      node.badges.textContent = "";
      for (const b of item.badges) node.badges.append(el("span", "rsc-badge", { "data-badge": b.toLowerCase() }));
      node.badges.querySelectorAll(".rsc-badge").forEach((n, i) => (n.textContent = item.badges[i]));
      node.badges.hidden = !item.badges.length;
    }
  }

  function createHandle() {
    const wrap = el("div", "rsc-handle", { role: "none", "data-rsc-root": "", "data-rsc-handle": "" });
    const btn = el("button", "rsc-toggle", { type: "button" });
    const count = el("span", "rsc-count");
    const chev = el("span", "rsc-chev");
    chev.innerHTML = CHEVRON; // constant markup
    btn.append(count, chev);
    wrap.append(btn);
    const h = { wrap, btn, count, gk: "", n: -1, folded: null };
    h.onClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setCollapsed(h.gk, !collapsed.has(h.gk));
      render();
    };
    h.stop = (e) => e.stopPropagation();
    btn.addEventListener("click", h.onClick);
    btn.addEventListener("keydown", h.stop);
    btn.addEventListener("contextmenu", h.stop);
    btn.addEventListener("pointerdown", h.stop);
    return h;
  }

  function fillHandle(h, gk, n, folded) {
    h.gk = gk;
    if (h.n === n && h.folded === folded) return;
    h.n = n;
    h.folded = folded;
    const what = `${n} ${n === 1 ? "chat" : "chats"} opened from this chat`;
    h.btn.setAttribute("aria-expanded", String(!folded));
    h.btn.setAttribute("aria-label", folded ? `Show ${what}` : `Hide ${what}`);
    h.btn.title = folded ? `Show ${what}` : `Hide ${what}`;
    h.wrap.toggleAttribute("data-folded", folded);
    h.count.textContent = folded ? String(n) : "";
    h.count.hidden = !folded;
  }

  // Where the rows of one parent go, for one anchor element.
  function placementFor(anchor, tpl) {
    // Children start under the parent's label: parent padding + (chevron
    // spacer) + icon slot + gap, minus a little so the bullet lines up with it.
    const extra = `${tpl.chevron ? "var(--tree-chevron-size) + var(--tree-item-gap) + " : ""}var(--rsc-indent)`;
    if (anchor.getAttribute("role") === "treeitem") {
      const wrap = anchor.parentElement;
      if (!wrap || !wrap.parentNode) return null;
      const base = anchor.style.paddingLeft || "var(--tree-item-px)";
      return { parent: wrap.parentNode, after: wrap, paddingLeft: `calc(${base} + ${extra})`, hidden: false };
    }
    // Promoted chat: the testid is on the wrapper of the workspace row.
    const row = anchor.querySelector(':scope > [role="treeitem"]');
    if (!row) return null;
    const group = anchor.querySelector(':scope > [role="group"]');
    const hidden = !!(group && group.getAttribute("aria-hidden") === "true" && group.querySelector('[role="treeitem"]'));
    const base = row.style.paddingLeft || "var(--tree-item-px)";
    return { parent: anchor, after: row, paddingLeft: `calc(${base} + ${extra})`, hidden };
  }

  // The app marks its selected row with the unprefixed hover bg class (or aria).
  function parentSelected(anchor) {
    const row = anchor.getAttribute("role") === "treeitem" ? anchor : anchor.querySelector(':scope > [role="treeitem"]');
    if (!row) return false;
    return (
      row.getAttribute("aria-selected") === "true" ||
      row.getAttribute("aria-current") === "true" ||
      row.classList.contains("bg-[var(--tree-item-hover-bg)]")
    );
  }

  // Hover on any row of a group lights the whole card: the mod's own nodes
  // (handle + child rows) get data-rsc-ghover; the app's parent wrapper is
  // reached from the handle by CSS (:has).
  let hoverMembers = [];
  function setGroupHover(on) {
    for (const m of hoverMembers) m.toggleAttribute("data-rsc-ghover", false);
    hoverMembers = on || [];
    for (const m of hoverMembers) m.setAttribute("data-rsc-ghover", "");
  }
  function groupOf(t) {
    let n = t && t.closest ? t.closest('[role="none"]') : null;
    if (!n) return null;
    let h = null;
    if (n.hasAttribute("data-rsc-child")) {
      h = n.previousElementSibling;
      while (h && h.hasAttribute("data-rsc-child")) h = h.previousElementSibling;
    } else if (!n.hasAttribute("data-rsc-handle")) {
      h = n.nextElementSibling;
    } else h = n;
    if (!h || !h.hasAttribute("data-rsc-handle") || h.hidden) return null;
    const out = [h];
    for (let c = h.nextElementSibling; c && c.hasAttribute("data-rsc-child"); c = c.nextElementSibling) out.push(c);
    return out;
  }
  const onGroupHover = (e) => {
    const g = groupOf(e.target);
    if (g && hoverMembers.length === g.length && hoverMembers[0] === g[0]) return;
    if (g || hoverMembers.length) setGroupHover(g);
  };
  document.addEventListener("pointerover", onGroupHover, true);

  function place(parent, prev, node) {
    if (node.parentNode !== parent || prev.nextSibling !== node) parent.insertBefore(node, prev.nextSibling);
  }

  let lastCounts = { rows: 0, anchors: 0, groups: 0 };

  // ------------------------------------------------------- workspace cards
  // cards: Map<"ws#occurrence", card>
  const cards = new Map();

  function shortPath(p) {
    if (typeof p !== "string" || !p) return "";
    let out = p.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, "~");
    if (out.length > 42) out = `…/${out.split("/").filter(Boolean).slice(-2).join("/")}`;
    return out;
  }

  function cardInfo(s, ws) {
    const branch = (ws.repo && typeof ws.repo.currentBranch === "string" && ws.repo.currentBranch.trim()) || "";
    let live = false;
    if (typeof s.isChatInProgress === "function") {
      for (const t of Array.isArray(ws.centerTabs) ? ws.centerTabs : []) {
        if (!t || t.type !== "chat" || t.isArchived === true) continue;
        try {
          if (s.isChatInProgress(ws.id, t.id) === true) {
            live = true;
            break;
          }
        } catch (_) {}
      }
    }
    return {
      title: branch || (typeof ws.name === "string" && ws.name.trim()) || "Workspace",
      primary: ws.mode !== "worktree",
      path: shortPath(ws.path),
      fullPath: typeof ws.path === "string" ? ws.path : "",
      live,
    };
  }

  function createCard() {
    const head = el("div", "rsc-card-head", { role: "none", "data-rsc-root": "", "data-rsc-card-head": "" });
    const l1 = el("div", "rsc-card-l1");
    const dot = el("span", "rsc-card-dot");
    const title = el("span", "rsc-card-title");
    const primary = el("span", "rsc-badge", { "data-badge": "primary" });
    primary.textContent = "primary";
    l1.append(dot, title, primary);
    const l2 = el("div", "rsc-card-l2");
    head.append(l1, l2);
    const c = { head, dot, title, primary, l2, row: null, info: null, pl: "", dup: null };
    c.onClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (c.row && c.row.isConnected) c.row.click(); // same as clicking the workspace row
    };
    // Right-click opens the app's own menu of the workspace row.
    c.stop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!c.row || !c.row.isConnected) return;
      const opts = { bubbles: true, cancelable: true, composed: true, button: 2, buttons: 2 };
      for (const k of ["clientX", "clientY", "screenX", "screenY"]) opts[k] = e[k];
      c.row.dispatchEvent(new MouseEvent("contextmenu", opts));
    };
    head.addEventListener("click", c.onClick);
    head.addEventListener("contextmenu", c.stop);
    return c;
  }

  function fillCard(c, info, row) {
    c.row = row;
    const prev = c.info;
    c.info = info;
    if (!prev || prev.title !== info.title) c.title.textContent = info.title;
    if (!prev || prev.live !== info.live) {
      c.head.toggleAttribute("data-live", info.live);
      c.dot.title = info.live ? "A chat is running" : "Idle";
    }
    if (!prev || prev.primary !== info.primary) c.primary.hidden = !info.primary;
    if (!prev || prev.path !== info.path) {
      c.l2.textContent = info.path;
      c.l2.hidden = !info.path;
    }
    if (!prev || prev.fullPath !== info.fullPath) c.l2.title = info.fullPath;
    const pl = row.style.paddingLeft || "var(--tree-item-px)";
    if (c.pl !== pl) c.head.style.paddingLeft = c.pl = pl;
    const label = row.querySelector(":scope > span.flex-1 > span");
    const dup = !!label && (label.textContent || "").trim() === info.title;
    if (c.dup !== dup) {
      c.dup = dup;
      c.head.toggleAttribute("data-rsc-dup", dup);
    }
  }

  function renderCards(s) {
    const keep = new Set();
    const byId = new Map();
    for (const w of s.workspaces) if (w && w.id) byId.set(w.id, w);
    const infos = new Map();
    const seen = new Map();
    for (const row of document.querySelectorAll('[role="treeitem"][data-testid="workspace-item"][data-workspace-id]')) {
      const wsId = row.getAttribute("data-workspace-id");
      const ws = byId.get(wsId);
      const wrap = row.parentElement;
      if (!ws || !wrap || wrap.getAttribute("role") !== "none") continue;
      let info = infos.get(wsId);
      if (!info) infos.set(wsId, (info = cardInfo(s, ws)));
      const n = seen.get(wsId) || 0;
      seen.set(wsId, n + 1);
      const key = `${wsId}#${n}`;
      keep.add(key);
      let c = cards.get(key);
      if (!c) cards.set(key, (c = createCard()));
      fillCard(c, info, row);
      if (c.head.parentNode !== wrap || c.head.nextSibling !== row) wrap.insertBefore(c.head, row);
    }
    for (const [k, c] of cards) if (!keep.has(k)) (c.head.remove(), cards.delete(k));
    return cards.size;
  }

  function clearAll() {
    for (const n of nodes.values()) n.wrap.remove();
    for (const h of handles.values()) h.wrap.remove();
    for (const c of cards.values()) c.head.remove();
    nodes.clear();
    handles.clear();
    cards.clear();
  }

  function render() {
    const s = readState();
    src.off = lsGet(LS_SELF) === "off";
    src.guard = !!s && guardOn();
    if (!s || src.off || src.guard) {
      clearAll();
      lastCounts = { rows: 0, anchors: 0, groups: 0 };
      observeTrees();
      return;
    }
    const groups = collect(s, Date.now());
    const keepNodes = new Set();
    const keepHandles = new Set();
    let anchorsUsed = 0;
    let rows = 0;
    if (groups.size) {
      const byTestId = new Map();
      for (const a of document.querySelectorAll(`[data-testid^="${ANCHOR_PREFIX}"]`)) {
        const id = a.getAttribute("data-testid");
        let list = byTestId.get(id);
        if (!list) byTestId.set(id, (list = []));
        list.push(a);
      }
      const tpl = readTemplate();
      for (const [gk, all] of groups) {
        // Never duplicate a chat the app already shows (same chat id).
        const items = all.filter((it) => !byTestId.has(`${ANCHOR_PREFIX}${it.ws}-${it.id}`));
        rows += items.length;
        if (!items.length) continue;
        const anchors = byTestId.get(`${ANCHOR_PREFIX}${items[0].ws}-${items[0].parent}`);
        if (!anchors) continue;
        const folded = collapsed.has(gk);
        anchors.forEach((anchor, ai) => {
          const p = placementFor(anchor, tpl);
          if (!p) return;
          anchorsUsed++;
          const hk = `${gk}#${ai}`;
          keepHandles.add(hk);
          let h = handles.get(hk);
          if (!h) handles.set(hk, (h = createHandle()));
          fillHandle(h, gk, items.length, folded);
          if (h.wrap.hidden !== p.hidden) h.wrap.hidden = p.hidden;
          place(p.parent, p.after, h.wrap);
          let prev = h.wrap;
          const members = [h.wrap];
          let gsel = parentSelected(anchor);
          for (const item of items) {
            const nk = `${item.key}#${ai}`;
            keepNodes.add(nk);
            let node = nodes.get(nk);
            if (!node) nodes.set(nk, (node = createNode(item)));
            fillNode(node, item, tpl, p.paddingLeft);
            const hide = p.hidden || folded;
            if (node.wrap.hidden !== hide) node.wrap.hidden = hide;
            place(p.parent, prev, node.wrap);
            prev = node.wrap;
            members.push(node.wrap);
            if (item.current) gsel = true;
          }
          // Group-as-one-card markers (CSS in sidebar-chats.css).
          members.forEach((m, i) => {
            m.toggleAttribute("data-rsc-gsel", gsel);
            m.toggleAttribute("data-rsc-last", i === members.length - 1);
          });
        });
      }
    }
    for (const [k, n] of nodes) if (!keepNodes.has(k)) (n.wrap.remove(), nodes.delete(k));
    for (const [k, h] of handles) if (!keepHandles.has(k)) (h.wrap.remove(), handles.delete(k));
    const cardCount = renderCards(s);
    lastCounts = { rows, anchors: anchorsUsed, groups: groups.size, cards: cardCount };
    observeTrees();
  }

  // ------------------------------------------------------------- activation
  function activate(item) {
    if (!item) return false;
    const s = readState();
    if (!s) return false;
    try {
      const win = item.win ? windowMap().get(item.key) : null;
      const pq = win && src.pq ? src.pq.getState() : null;
      if (win && pq && typeof pq.select === "function") {
        const other = s.selectedWorkspaceId !== item.ws;
        if (other) s.selectWorkspaceChat(item.ws, item.id);
        const go = () => {
          try {
            pq.select(win.popup, win.id);
            if (!win.dock && typeof win.popup.focus === "function") win.popup.focus();
          } catch (e) {
            src.error = errText(e);
          }
        };
        if (other) requestAnimationFrame(go);
        else go();
        src.lastActivate = { ws: item.ws, id: item.id, via: "pq.select", at: Date.now() };
      } else if (typeof s.selectWorkspaceChat === "function") {
        s.selectWorkspaceChat(item.ws, item.id);
        src.lastActivate = { ws: item.ws, id: item.id, via: "selectWorkspaceChat", at: Date.now() };
      } else if (s.selectedWorkspaceId === item.ws && typeof s.selectChatTab === "function") {
        s.selectChatTab(item.id);
        src.lastActivate = { ws: item.ws, id: item.id, via: "selectChatTab", at: Date.now() };
      } else return false;
    } catch (e) {
      src.error = errText(e);
      return false;
    }
    schedule();
    return true;
  }

  // ------------------------------------------------------------- scheduling
  let disposed = false;
  let raf = 0;
  let timer = 0;
  let discoverTimer = 0;
  const observed = new Set();

  function schedule() {
    if (disposed || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (disposed) return;
      try {
        render();
      } catch (e) {
        src.error = errText(e);
      }
    });
  }

  const ours = (n) => n && n.nodeType === 1 && (n.hasAttribute("data-rsc-root") || !!n.closest?.("[data-rsc-root]"));

  const mo = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "attributes") {
        if (!ours(r.target)) return schedule();
        continue;
      }
      if (ours(r.target)) continue;
      for (const n of r.addedNodes) if (!ours(n)) return schedule();
      for (const n of r.removedNodes) if (!ours(n)) return schedule();
    }
  });

  // Watch every sidebar tree that holds chat rows; re-attach when React
  // replaces a tree (route change, sidebar remount).
  function observeTrees() {
    let stale = false;
    for (const t of observed) if (!t.isConnected) stale = true;
    const trees = new Set();
    for (const a of document.querySelectorAll(`[data-testid^="${ANCHOR_PREFIX}"], [data-testid="workspace-item"]`)) {
      const t = a.closest('[role="tree"]');
      if (t) trees.add(t);
    }
    let changed = stale || trees.size !== observed.size;
    if (!changed) for (const t of trees) if (!observed.has(t)) changed = true;
    if (!changed) return;
    mo.disconnect();
    observed.clear();
    for (const t of trees) {
      mo.observe(t, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-hidden", "data-testid"] });
      observed.add(t);
    }
  }

  function tryDiscover() {
    if (disposed) return;
    const missingOptional = !src.pq || !src.cli;
    if (src.ws && (!missingOptional || src.optionalTries >= OPTIONAL_TRIES)) return;
    if (src.ws) src.optionalTries++;
    try {
      discover();
    } catch (e) {
      src.error = errText(e);
    }
    discoverTimer = setTimeout(tryDiscover, DISCOVER_MS);
  }

  function loop() {
    if (disposed) return;
    if (document.visibilityState !== "hidden") schedule();
    timer = setTimeout(loop, src.wsSubscribed ? TICK_MS : POLL_MS);
  }

  const onStorage = (e) => {
    if (e.key === LS_GUARD || e.key === LS_GUARD_NATIVE || e.key === LS_COLLAPSED || e.key === LS_SELF) schedule();
  };
  const onChanged = () => schedule();

  const start = () => {
    if (disposed) return;
    tryDiscover();
    if (!timer) loop();
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGED_EV, onChanged);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();

  // ------------------------------------------------------------- introspection
  window.__RE_TEMPO_SIDEBAR_CHATS__ = {
    source: () => ({
      how: src.how,
      hasStore: !!src.ws,
      subscribed: !!src.wsSubscribed,
      windows: !!src.pq,
      cli: !!src.cli,
      guard: src.guard,
      off: !!src.off,
      error: src.error,
      lastActivate: src.lastActivate,
    }),
    state: () => ({
      ...lastCounts,
      mounted: [...nodes.values()].filter((n) => n.wrap.isConnected).length,
      handles: handles.size,
      collapsed: [...collapsed],
      rows: [...nodes.values()].map((n) => ({
        ws: n.item?.ws,
        id: n.item?.id,
        parent: n.item?.parent,
        label: n.item?.label,
        time: n.item?.time,
        status: n.item?.status,
        provider: n.item?.provider,
        badges: n.item?.badges,
        current: n.item?.current,
        mounted: n.wrap.isConnected,
        hidden: n.wrap.hidden,
      })),
      trees: observed.size,
    }),
    refresh: () => render(),
    activate: (ws, id) => {
      const s = readState();
      const it = s && [...collect(s, Date.now()).values()].flat().find((x) => x.ws === ws && x.id === id);
      return activate(it || { ws, id, key: `${ws}\u0000${id}`, win: false });
    },
    dispose() {
      disposed = true;
      document.removeEventListener("pointerover", onGroupHover, true);
      clearTimeout(timer);
      clearTimeout(discoverTimer);
      if (raf) cancelAnimationFrame(raf);
      mo.disconnect();
      observed.clear();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGED_EV, onChanged);
      for (const u of src.unsubs) {
        try {
          u();
        } catch (_) {}
      }
      src.unsubs = [];
      for (const n of nodes.values()) {
        n.row.removeEventListener("click", n.onClick);
        n.row.removeEventListener("keydown", n.onKey);
        n.row.removeEventListener("contextmenu", n.onMenu);
      }
      for (const h of handles.values()) {
        h.btn.removeEventListener("click", h.onClick);
        h.btn.removeEventListener("keydown", h.stop);
        h.btn.removeEventListener("contextmenu", h.stop);
        h.btn.removeEventListener("pointerdown", h.stop);
      }
      for (const c of cards.values()) {
        c.head.removeEventListener("click", c.onClick);
        c.head.removeEventListener("contextmenu", c.stop);
      }
      clearAll();
      if (window.__RE_TEMPO_SIDEBAR_CHATS__ === this) delete window.__RE_TEMPO_SIDEBAR_CHATS__;
    },
  };
})();
