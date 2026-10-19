/*
 * RE-TEMPO · tab-close (user mod layer)
 * ---------------------------------------------------------------------------
 * Every tab of the center tab bar gets a close button, including the chat's
 * own tab (the first tab of the bar, the "primary" chat), which the app
 * renders without one. Canvas tabs are never previews: each canvas opens in a
 * tab of its own (see "canvas tabs").
 *
 * Why the primary chat tab had no close (renderer bundle index-D2Ui1vc0.js):
 *   - The center bar maps each center tab with Qma(tab):
 *       r = tab.type === "chat" && !tab.ownerChatTabId   (primary chat)
 *       testId: r ? "chat-tab" : "chat-tab-<id>" | "browser-tab-<id>" | ...
 *       canClose: !r
 *   - The shared tab component (HHe) renders the close button only when
 *     S && onTabClose, with S = tab.canClose ?? tabsCount > 1. Middle click
 *     (onAuxClick, button 1) has the same S guard. So canClose:false hides
 *     the button and disables middle click for the primary chat only.
 *   - The bar's onTabClose (Pn, the same for the main bar and both split
 *     bars) also ignores it: if (!RG(tab)) { secondary chat -> confirm, then
 *     closeDiffTab; terminal -> closeTerminalTab; else closeDiffTab }.
 *     closeDiffTab itself starts with `if (tab && RG(tab)) return`.
 *   - What the bar shows (Zt): the active primary chat g (activeChatTabId)
 *     first, then the tabs owned by it (secondary chats, browser, files,
 *     canvases...; non-chat tabs get ownerChatTabId = the current chat).
 *     The other primary chats are not tabs: they are the sidebar's chat rows.
 *     So the primary tab is the anchor of the selected chat's tab group.
 *   - Store actions that remove a primary chat, none of them a plain close:
 *       closeChatTab(id): the sidebar's "Delete chat" (onChatDelete). It drops
 *         the chat record (rtr(..., {removeChatRecord: true})), its secondary
 *         chats and owned tabs, destroys the CLI session process.
 *       archiveChatTab(ws, id, {allowPromoted}): the sidebar's "Archive". It
 *         marks the chat and its secondaries archived, drops its owned tabs,
 *         refuses while any of them runs, and by default refuses the
 *         workspace's promoted (oldest) chat.
 *     Both call eq(): when no non-archived primary chat is left, a fresh
 *     "New Chat" (kq) is created and activated, so a workspace never ends up
 *     without a chat; the workspace is not removed and the app stays on it.
 *   - Even secondary chats are "deleted" by the app on close (its dialog:
 *     "Closing ... deletes the conversation. You can bring it back with
 *     ⌘⇧T until you restart Tempo."). Popout/pane-dock tabs (canClose:true)
 *     go through the popout store instead.
 *
 * What this mod does on close (the × or a middle click on the primary tab).
 * Every primary chat tab gets the ×: the only tab of the bar, an empty draft,
 * a chat that owns other tabs (every other tab already has the app's own ×,
 * canClose:true). One click closes the tab and it stays closed: nothing
 * alternates, no other chat is shown in its place, no chat is created,
 * archived or deleted (the conversation stays; the project sidebar drops its
 * row). The tab is hidden (CSS, per workspace + tab id, kept in localStorage)
 * until the chat is opened on purpose: a path that opens it (the project
 * sidebar calls reveal) brings the tab back. The app falling back to it never
 * does.
 *   A) The bar has other visible tabs (the chat's canvas, terminal, browser,
 *      files, secondary chats): only the chat's tab goes and its neighbour is
 *      activated through the bar's own click handler (falls back to
 *      setActiveCenterTab). The chat's other tabs stay until each is closed
 *      with its own × (the app's close).
 *   B) It is the only tab of its bar: the bar ends with no tab. The app always
 *      keeps an active chat (eq() makes a "New Chat" whenever none is left,
 *      and there is no action for "no active tab"), so that chat stays the
 *      active one with its tab hidden ("parked"), and pane-dock covers the
 *      center with its empty state ("No open tabs") while parked(ws) is true.
 *      No store call at all, so no route change either (closing never takes
 *      the user off the design route). "+" opens tabs normally (they belong
 *      to the parked chat, whose own tab stays hidden); the cover's "New chat"
 *      or a sidebar row opens a chat. The same empty center follows when the
 *      last tab of a chat whose own tab was closed in A closes.
 *
 * "I closed one tab and another one closed" (three causes, all fixed here):
 *   1) Fixed-width tabs (w-[220px], shrinking only past the bar's width):
 *      closing a tab slides the next one into its place, its × right under
 *      the pointer (and revealed by the hover). The second click of a double
 *      click, or an impatient second click, closed that neighbour. A click,
 *      middle click or double click in a tab bar that continues the click
 *      sequence of a close (detail > 1, or the same spot) within GUARD_MS is
 *      swallowed (capture phase on window, before React's root listener): one
 *      close per sequence; a click elsewhere in the bar acts at once.
 *   2) ⌘W (bundle sda, the window keydown and the menu's "close-tab"): with a
 *      primary chat in front it cannot close it, so it closes the LAST
 *      non-primary tab of the workspace's whole centerTabs: another tab of the
 *      bar, or a tab of another chat's group that is not even on screen. ⌘W on
 *      a primary chat now closes that chat's tab (case A/B above); on a parked
 *      center (nothing in front) it does nothing. Other tabs: the app's ⌘W.
 *   3) Closing the tab in front makes the app fall back to its left
 *      neighbour, the owner chat; with that chat's tab closed the bar kept its
 *      tabs, none in front, under the empty center. The bar's neighbour comes
 *      forward instead (right of the closed tab, else left), as in a browser.
 *      In a split whose side went empty that way, the other side's tab comes
 *      forward and the split closes (toggleSplitPanelMode). A split side left
 *      with the closed chat as its active tab (the tab in front moved into a
 *      split: the app falls back to the owner chat on the side it leaves)
 *      brings its first tab forward; the focus stays where it was.
 * Motion: a closing tab fades out in place (a ghost, 140 ms) while the tabs
 * after it slide into its room (FLIP, transform only, 220 ms ease-out); a new
 * or revealed tab fades and rises in (220 ms). A whole-bar change (another
 * chat's group) or a bar that moved or resized is not animated. Reduced
 * motion: opacity only, 120 ms.
 * The app dev server tab: the app reopens its "App dev server" terminal by
 * itself (the canvas views ask for it again whenever it is not open). Once
 * closed in a workspace, the app's requests for it are dropped until the user
 * asks for it with a Run control (see "app dev server" below); the server
 * itself keeps running (the tab only shows its output).
 * Button: same markup and classes as the app's close button (HHe): button
 * "ml-auto inline-flex size-5 ... text-icons-tertiary hover:text-icons-
 * secondary", opacity-100 on the active tab, opacity-80 on the tab active in
 * the other split panel, otherwise opacity-0 group-hover:opacity-100 (hover
 * reveal), aria-label "Close <label>", lucide x icon size-3. The tab gets the
 * app's closable padding (pr-1.5) through CSS :has. If the app ever renders
 * its own close button in that tab, the mod's one is removed.
 *
 * Store: the workspaces zustand store `$`, found through the React fibers
 * above the tab bar (useSyncExternalStoreWithSelector hook shape, the same
 * discovery as sidebar-chats.js). Without it the mod still hides/reveals
 * tabs from the DOM (case A) and nudges in case B.
 *
 * Mount: a MutationObserver on each center [role="tablist"] that holds a
 * primary chat tab, plus the store subscription and a 1 s tick, re-run an
 * idempotent sync (one button per tab, nothing written when the DOM already
 * matches). dispose() removes every node, listener and the hiding style.
 * Introspection: window.__RE_TEMPO_TAB_CLOSE__ (state, parked, close, reveal,
 * hiddenIn: the closed chats of a workspace, which the project sidebar leaves
 * out of its rows). "rtc:hidden-changed" (window) fires when that set changes.
 *
 * Limits: without pane-dock the parked center is not covered (the chat shows
 * under a bar with no tab). A hidden chat selected by a path other than the
 * project sidebar (a notification, a shortcut) shows the empty center: its
 * sidebar row opens it. Tabs in popout windows
 * are not touched (another document). No button in an archived workspace
 * (read-only). Fragility: the testid "chat-tab", the tab attributes
 * (data-tab-id, data-active-state), the class list and the action names
 * (setActiveCenterTab), the dev server tab's title and run request event.
 * Validated in the logged-in app (an
 * isolated instance, a project with two worktrees, chats and a canvas).
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  // Re-injection without a page reload: drop the previous instance first.
  if (window.__RE_TEMPO_TAB_CLOSE__ && typeof window.__RE_TEMPO_TAB_CLOSE__.dispose === "function") {
    try {
      window.__RE_TEMPO_TAB_CLOSE__.dispose();
    } catch (_) {}
  }

  const CFG = window.__RE_TEMPO_TAB_CLOSE_CONFIG__ || {}; // test hook only
  const TICK_MS = CFG.tickMs || 1000;
  const DISCOVER_MS = CFG.discoverMs || 500;
  const DISCOVER_TRIES = 240; // ~2 min, then only on demand
  const FIBER_UP_LIMIT = 500;

  const TABLIST_SEL = '[role="tablist"]';
  const TAB_SEL = '[role="tab"][data-tab-id]';
  const PRIMARY_SEL = '[role="tablist"] [role="tab"][data-testid="chat-tab"][data-tab-id]';
  const OWN_ATTR = "data-rtc-close";
  const NUDGE_ATTR = "data-rtc-nudge";
  const STYLE_ATTR = "data-rtc-style";
  const LS_HIDDEN = "re-tempo:tab-close:hidden:v1";
  const MAX_HIDDEN = 300;
  // The app's own output-only terminal for the app dev server (bundle: _fr), opened
  // by a "tempo:workspaces:terminal-run-request" window event (runId "appserver-<path>-<ts>").
  const DEV_TITLE = "App dev server";
  const RUN_REQUEST = "tempo:workspaces:terminal-run-request";
  const LS_DEV = "re-tempo:tab-close:devserver-dismissed:v1";
  const ASK_MS = 3000; // a Run click this recent asks for the dev server tab again
  const GUARD_MS = 650; // a click sequence continuing a close within this is swallowed
  const CLOSE_CTL = `[${OWN_ATTR}], [role="tab"] button[aria-label^="Close"]`; // ours, the app's (HHe)
  const GHOST_ATTR = "data-rtc-ghost";
  const HIDDEN_EV = "rtc:hidden-changed";
  // shared motion language (all mods): ease-out, small 220 ms, micro 140 ms
  const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
  const SLIDE_MS = 220;
  const GHOST_MS = 140;
  const ENTER_MS = 220;
  const REDUCED_MS = 120;

  // HHe close button (bundle), base + per-state opacity.
  const BTN_BASE =
    "ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-icons-tertiary transition-colors hover:text-icons-secondary";
  const BTN_STATE = {
    primary: "opacity-100",
    secondary: "opacity-80",
    inactive: "opacity-0 group-hover:opacity-100",
  };
  const SVG_NS = "http://www.w3.org/2000/svg";

  let disposed = false;
  let raf = 0;
  let timer = 0;
  let discoverTimer = 0;
  let styleEl = null;
  let lastStyleText = null;
  let lastAction = null;

  const src = { ws: null, subscribed: false, unsubs: [], tries: 0, scan: null, error: null };
  const observed = new Set(); // tablists under observation
  const bound = new WeakSet(); // tab elements with our auxclick listener
  const buttons = new Set(); // our buttons currently in the DOM

  const errText = (e) => String(e && e.message ? e.message : e);

  // ----------------------------------------------------------- hidden state
  // key "ws\u0000tab" -> { ws, tab, at }: a primary chat tab the user closed. It
  // stays hidden until the chat is opened on purpose (reveal).
  const hidden = new Map();

  function lsGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }
  function lsSet(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (_) {}
  }

  function loadHidden() {
    hidden.clear();
    try {
      const arr = JSON.parse(lsGet(LS_HIDDEN) || "[]");
      if (Array.isArray(arr))
        for (const e of arr)
          if (e && typeof e.tab === "string")
            hidden.set(`${e.ws || ""}\u0000${e.tab}`, { ws: e.ws || "", tab: e.tab, at: e.at || 0 });
    } catch (_) {}
  }
  function saveHidden() {
    const arr = [...hidden.values()].sort((a, b) => a.at - b.at).slice(-MAX_HIDDEN);
    lsSet(LS_HIDDEN, arr.length ? JSON.stringify(arr) : null);
    try {
      window.dispatchEvent(new CustomEvent(HIDDEN_EV));
    } catch (_) {}
  }
  function hide(ws, tab) {
    hidden.set(`${ws || ""}\u0000${tab}`, { ws: ws || "", tab, at: Date.now() });
    saveHidden();
  }
  // The selected workspace's center is parked: the app's active center tab is a
  // chat whose tab the user closed (the bar shows no tab for it).
  function parkedNow(s) {
    if (!s) return false;
    return hidden.has(`${s.selectedWorkspaceId || ""}\u0000${s.activeCenterTabId}`);
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
    !!s &&
    typeof s === "object" &&
    Array.isArray(s.workspaces) &&
    Array.isArray(s.centerTabs) &&
    typeof s.setActiveCenterTab === "function" &&
    typeof s.createChatTab === "function" &&
    typeof s.selectChatTab === "function";

  // zustand v4 hook = useSyncExternalStoreWithSelector(api.subscribe,
  // api.getState, ...): a useMemo with deps [getState, getServerState,
  // selector, isEqual], then useSyncExternalStore (queue.getSnapshot === the
  // memo's getter) and its subscribe effect (deps [api.subscribe]).
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
      out.push({ getState: ms[1][0], subscribe });
    }
    return out;
  }

  const probed = new WeakSet();
  function probe(f) {
    for (const hk of selectorHooks(f)) {
      if (probed.has(hk.getState)) continue;
      probed.add(hk.getState);
      let s;
      try {
        s = hk.getState();
      } catch (_) {
        continue;
      }
      if (looksLikeWs(s)) return hk;
    }
    return null;
  }

  function discover() {
    if (src.ws) return true;
    const starts = [
      document.querySelector(PRIMARY_SEL),
      document.querySelector('[data-testid="center-panel"]'),
      document.querySelector('[data-testid="center-panel-add-tab-button"]'),
      document.querySelector('[data-testid^="workspace-chat-"]'),
    ]
      .map(nearestFiber)
      .filter(Boolean);
    for (const f0 of starts) {
      for (let f = f0, i = 0; f && i < FIBER_UP_LIMIT; i++, f = f.return) {
        const hk = probe(f);
        if (hk) return adopt(hk);
      }
    }
    // Time-sliced full tree scan while nothing was found from the anchors.
    if (!src.scan) {
      const root = containerFiber(document.getElementById("root"));
      if (root) src.scan = { stack: [root], seen: new WeakSet() };
    }
    const sc = src.scan;
    if (sc) {
      const deadline = performance.now() + 6;
      while (sc.stack.length && performance.now() < deadline) {
        const f = sc.stack.pop();
        if (!f || sc.seen.has(f)) continue;
        sc.seen.add(f);
        const hk = probe(f);
        if (hk) return adopt(hk);
        if (f.sibling) sc.stack.push(f.sibling);
        if (f.child) sc.stack.push(f.child);
      }
      if (!sc.stack.length) src.scan = null;
    }
    return false;
  }

  function adopt(hk) {
    src.ws = hk;
    src.scan = null;
    if (typeof hk.subscribe === "function") {
      try {
        const u = hk.subscribe(() => {
          try {
            const s = readState();
            pinCanvasTabs(s);
            trackDevTabs(s);
          } catch (_) {}
          schedule();
        });
        if (typeof u === "function") {
          src.unsubs.push(u);
          src.subscribed = true;
        }
      } catch (e) {
        src.error = `subscribe: ${errText(e)}`;
      }
    }
    schedule();
    return true;
  }

  function readState() {
    if (!src.ws) discover();
    if (!src.ws) return null;
    try {
      const s = src.ws.getState();
      return looksLikeWs(s) ? s : null;
    } catch (e) {
      src.error = errText(e);
      return null;
    }
  }

  // ------------------------------------------------------------- tab helpers
  const isPrimary = (t) => !!t && t.type === "chat" && !t.ownerChatTabId;
  const findTab = (s, id) => (s && id ? s.centerTabs.find((t) => t.id === id) || null : null);
  const shown = (el) => !!el && el.isConnected && el.getClientRects().length > 0;

  // The chat content is on screen (so its tab must be too).
  function onScreen(s, id) {
    if (s.activeCenterTabId === id) return true;
    return s.splitPanelMode === true && (s.leftPanelActiveTabId === id || s.rightPanelActiveTabId === id);
  }

  // ------------------------------------------------------- app dev server
  // The app reopens its "App dev server" tab by itself: the canvas views run an
  // effect (deps: the selected workspace, the canvas's workspace, the dev server
  // being configured) that asks for that tab again whenever the one it opened is
  // no longer open (yfr: `isTabOpen(tabId)` false -> a new run request). So a
  // closed dev server tab came back on the next canvas mount, workspace switch,
  // pane move or route change. Once the user closes it in a workspace, its run
  // requests are dropped (capture listener on window, before the app's) until
  // the user asks for it: a click on a Run control within ASK_MS. Closing the tab
  // never stops the dev server itself (a supervisor runs it; the tab only shows
  // its output). Kept per workspace path in localStorage.
  const devDismissed = new Set();
  function loadDev() {
    devDismissed.clear();
    try {
      const arr = JSON.parse(lsGet(LS_DEV) || "[]");
      if (Array.isArray(arr)) for (const p of arr) if (typeof p === "string") devDismissed.add(p);
    } catch (_) {}
  }
  function saveDev() {
    lsSet(LS_DEV, devDismissed.size ? JSON.stringify([...devDismissed].slice(-100)) : null);
  }
  let lastAskAt = 0;
  let lastDevCloseAt = 0; // a close gesture on a dev server tab (its ×, a middle click, ⌘W)
  // the title bar's Run control (its button, "Run …" / "Set up a run action", and its menu)
  const RUN_SEL = '[aria-label^="Run" i], [aria-label*="run action" i], [title^="Run" i], [data-testid*="run-action" i]';
  const isDevTab = (el) => !!el && (el.getAttribute("aria-label") || el.textContent || "").trim().startsWith(DEV_TITLE);
  const onUserPress = (e) => {
    if (!e.isTrusted) return;
    const t = e.target instanceof Element ? e.target : null;
    if (e.type === "keydown") {
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === "w") lastDevCloseAt = Date.now();
      return;
    }
    if (t && t.closest(RUN_SEL)) lastAskAt = Date.now();
    const tab = t && t.closest('[role="tab"]');
    if (tab && isDevTab(tab) && (e.button === 1 || t.closest("button"))) lastDevCloseAt = Date.now();
  };
  const onRunRequest = (e) => {
    const d = e && e.detail;
    if (!d || d.title !== DEV_TITLE || typeof d.cwd !== "string" || !devDismissed.has(d.cwd)) return;
    if (d.autoFocus === true || Date.now() - lastAskAt < ASK_MS) {
      devDismissed.delete(d.cwd); // asked for: it opens, and may be closed again
      saveDev();
      record("devserver-allowed", { cwd: d.cwd });
      return;
    }
    e.stopImmediatePropagation();
    record("devserver-blocked", { cwd: d.cwd, runId: d.runId || null });
  };
  // ------------------------------------------------------------ canvas tabs
  // A canvas tab is never a preview. The app opens canvases unpinned (italic
  // label, isTemporary) from the "+" (new canvas), the Open modal and quick
  // open, and the next unpinned canvas of the same chat overwrites that tab in
  // place (bundle GG: the chat's unpinned tab of that type is replaced), so a
  // second canvas took the first one's tab. Every canvas tab of the selected
  // workspace is pinned (the store's pinTab, what a double click on the tab
  // does) as soon as the store holds it, in the store listener, before anything
  // else can open: the next canvas opens beside it. Each canvas tab stays
  // mounted while another is in front, so its zoom, position and selection stay.
  let canvasPins = 0;
  function pinCanvasTabs(s) {
    if (!s || typeof s.pinTab !== "function") return;
    for (const t of s.centerTabs) {
      if (!t || t.type !== "canvas" || t.isPinned === true) continue;
      try {
        s.pinTab(t.id);
        canvasPins++;
      } catch (_) {}
    }
  }

  // A dev server tab that left the selected workspace right after a close gesture
  // on it (no workspace switch in between: the app drops its ephemeral tabs from a
  // workspace that is not on screen) was closed by the user: dismissed there.
  let lastDev = { ws: null, ids: new Set() };
  function trackDevTabs(s) {
    if (!s) return;
    const ws = s.selectedWorkspaceId || "";
    const ids = new Set((Array.isArray(s.centerTabs) ? s.centerTabs : []).filter((t) => t && t.type === "terminal" && t.title === DEV_TITLE).map((t) => t.id));
    if (lastDev.ws === ws && Date.now() - lastDevCloseAt < ASK_MS && [...lastDev.ids].some((id) => !ids.has(id))) {
      const w = s.workspaces.find((x) => x && x.id === ws);
      if (w && w.path && !devDismissed.has(w.path)) {
        devDismissed.add(w.path);
        saveDev();
        record("devserver-dismissed", { cwd: w.path });
      }
    }
    lastDev = { ws, ids };
  }

  function record(result, extra) {
    lastAction = { result, at: Date.now(), ...(extra || {}) };
    return lastAction;
  }

  function nudge(tabEl) {
    if (!tabEl) return;
    tabEl.removeAttribute(NUDGE_ATTR);
    void tabEl.offsetWidth; // restart the animation
    tabEl.setAttribute(NUDGE_ATTR, "");
    setTimeout(() => tabEl.removeAttribute(NUDGE_ATTR), 450);
  }

  // Activate a tab of the same bar through the bar's own click handler
  // (onTabSelect: setActiveCenterTab, or setPanelActiveTab in split view).
  function activate(s0, tabEl, closingId) {
    if (!tabEl) return false;
    const id = tabEl.getAttribute("data-tab-id");
    try {
      tabEl.click();
    } catch (_) {}
    const s = readState() || s0;
    if (s && onScreen(s, closingId) && typeof s.setActiveCenterTab === "function") {
      try {
        s.setActiveCenterTab(id);
      } catch (e) {
        src.error = `setActiveCenterTab: ${errText(e)}`;
      }
    }
    return true;
  }

  // ----------------------------------------------------------------- motion
  // Each observed bar keeps its last read (tab ids on screen in bar order, their
  // boxes and nodes). A change of the bar (a mutation, our hiding style) is
  // compared with it before the next paint: tabs gone leave a ghost (a clone at
  // their old box, fading out), tabs kept slide from their old place (FLIP),
  // tabs added fade in. Only small changes inside the same group animate.
  const barMemo = new WeakMap(); // tablist -> { ids, boxes: id -> { x, y, w, h, el }, left, top, width, lw, tail }
  const ghosts = new Set();
  const reducedMotion = () => {
    try {
      return matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  };
  function readBar(list) {
    const boxes = new Map();
    const ids = [];
    for (const t of list.querySelectorAll(TAB_SEL)) {
      if (!shown(t)) continue;
      const id = t.getAttribute("data-tab-id");
      const r = t.getBoundingClientRect();
      ids.push(id);
      boxes.set(id, { x: r.left, y: r.top, w: r.width, h: r.height, el: t });
    }
    // the list hugs its tabs (its width follows them): the bar holding it says
    // whether the layout moved (a resize, a sidebar folded)
    const lr = list.getBoundingClientRect();
    const br = (list.closest("[data-tab-bar]") || list.parentElement || list).getBoundingClientRect();
    // what follows the list in its bar (the "+"): it moves with the list's end
    const tail = [];
    for (let n = list.nextElementSibling; n; n = n.nextElementSibling) tail.push({ el: n, x: n.getBoundingClientRect().left });
    return { ids, boxes, left: lr.left, top: lr.top, width: br.width, lw: lr.width, tail };
  }
  // The ghost is the bar's first child, out of the flow (absolute): it paints
  // under the tabs (positioned, later in the tree), so the ones sliding into
  // its room pass over it, never under it.
  function ghostOf(box, list) {
    if (!box || !box.el) return;
    const host = list && list.isConnected ? list : document.body;
    if (!host) return;
    const g = box.el.cloneNode(true);
    // a look-alike only: nothing another mod or the app could query or click
    for (const n of [g, ...g.querySelectorAll("*")])
      for (const a of ["id", "data-testid", "data-tab-id", "data-tab-index", "data-active-state", "role", "tabindex", "aria-selected", "aria-label", "draggable", OWN_ATTR]) n.removeAttribute(a);
    g.setAttribute(GHOST_ATTR, "");
    g.setAttribute("aria-hidden", "true");
    g.inert = true;
    Object.assign(g.style, { position: host === list ? "absolute" : "fixed", left: "0px", top: "0px", width: `${box.w}px`, height: `${box.h}px`, margin: "0", pointerEvents: "none", transform: "none" });
    host.insertBefore(g, host.firstChild);
    const at = g.getBoundingClientRect();
    g.style.left = `${box.x - at.left}px`;
    g.style.top = `${box.y - at.top}px`;
    ghosts.add(g);
    const reduce = reducedMotion();
    const frames = reduce ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: "scale(1)", filter: "blur(0)" }, { opacity: 0, transform: "scale(0.96)", filter: "blur(2px)" }];
    let anim = null;
    try {
      anim = g.animate(frames, { duration: reduce ? REDUCED_MS : GHOST_MS, easing: EASE_OUT, fill: "forwards" });
    } catch (_) {}
    const drop = () => {
      ghosts.delete(g);
      g.remove();
    };
    if (anim) anim.onfinish = anim.oncancel = drop;
    setTimeout(drop, 600); // a frozen timeline (hidden window) never strands a ghost
  }
  function animateBar(list, prev, next) {
    if (!prev || Math.abs(prev.left - next.left) > 1 || Math.abs(prev.width - next.width) > 1 || Math.abs(prev.top - next.top) > 1) return "moved";
    const gone = prev.ids.filter((id) => !next.boxes.has(id));
    const added = next.ids.filter((id) => !prev.boxes.has(id));
    if (!gone.length && !added.length) return "same";
    // another chat's group (no tab in common) or a big change: no motion
    if (!next.ids.some((id) => prev.boxes.has(id)) || gone.length + added.length > 3) return "replaced";
    const reduce = reducedMotion();
    for (const id of gone) ghostOf(prev.boxes.get(id), list);
    if (!reduce) slideTail(list, prev, next);
    // tabs that stay slide first; a tab coming in waits until its room is
    // mostly open (it would sit on a neighbour still sliding away)
    let slid = false;
    for (const id of next.ids) {
      const now = next.boxes.get(id);
      const was = prev.boxes.get(id);
      if (!was || reduce || Math.abs(was.x - now.x) <= 0.5) continue;
      try {
        now.el.animate([{ transform: `translateX(${was.x - now.x}px)` }, { transform: "translateX(0)" }], { duration: SLIDE_MS, easing: EASE_OUT });
        slid = true;
      } catch (_) {}
    }
    for (const id of added) {
      try {
        next.boxes.get(id).el.animate(
          reduce ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(3px) scale(0.98)" }, { opacity: 1, transform: "none" }],
          { duration: reduce ? REDUCED_MS : ENTER_MS, delay: slid ? 90 : 0, easing: EASE_OUT, fill: "backwards" }
        );
      } catch (_) {}
    }
    return "animated";
  }
  // The list hugs its tabs, so it shrinks at once when one goes: the tabs
  // sliding in from the right would be cut by its edge and the "+" would jump.
  // It keeps its old width while they slide, the "+" glides to its new place
  // with them, and both let go together when the slide ends (no jump).
  function slideTail(list, prev, next) {
    const moves = [];
    for (const t of next.tail) {
      const p = prev.tail.find((x) => x.el === t.el);
      if (p && Math.abs(p.x - t.x) > 0.5) moves.push({ el: t.el, from: p.x, to: t.x });
    }
    if (!moves.length) return;
    if (next.lw < prev.lw - 0.5) {
      const held = list.style.minWidth;
      list.style.minWidth = `${prev.lw}px`;
      const anims = [];
      for (const m of moves) {
        try {
          anims.push(m.el.animate([{ transform: "translateX(0)" }, { transform: `translateX(${m.to - m.from}px)` }], { duration: SLIDE_MS, easing: EASE_OUT, fill: "forwards" }));
        } catch (_) {}
      }
      let done = false;
      const release = () => {
        if (done) return;
        done = true;
        if (list.style.minWidth === `${prev.lw}px`) list.style.minWidth = held;
        for (const a of anims) a.cancel();
      };
      if (anims[0]) anims[0].finished.then(release, release);
      setTimeout(release, SLIDE_MS + 200); // a frozen timeline never holds the width
      return;
    }
    for (const m of moves) {
      try {
        m.el.animate([{ transform: `translateX(${m.from - m.to}px)` }, { transform: "translateX(0)" }], { duration: SLIDE_MS, easing: EASE_OUT });
      } catch (_) {}
    }
  }
  // read a bar, animate from its last read, keep the new one
  let lastMotion = null; // the last bar change seen: animated, replaced (another group), moved (resized)
  const lastGone = new WeakMap(); // tablist -> { ids, gone } the read before tabs left it
  function settle(list) {
    if (!list || !list.isConnected) return null;
    const prev = barMemo.get(list);
    const next = readBar(list);
    const res = animateBar(list, prev, next);
    if (res !== "same") lastMotion = { res, at: Date.now(), from: prev ? prev.ids.length : 0, to: next.ids.length };
    barMemo.set(list, next);
    const gone = prev ? prev.ids.filter((id) => !next.boxes.has(id)) : [];
    if (gone.length) lastGone.set(list, { ids: prev.ids, gone });
    return res;
  }
  function settleAll() {
    for (const l of observed) settle(l);
  }

  // --------------------------------------------------------- close gestures
  let gesture = null; // { at, via, pointer, x, y } the last close gesture (cause 1)
  let swallowed = 0;
  const onBarPointer = (e) => {
    const t = e.target instanceof Element ? e.target : null;
    const list = t && t.closest(TABLIST_SEL);
    if (!list || (t && t.closest(`[${GHOST_ATTR}]`))) return;
    const now = Date.now();
    // the same click sequence: a multi-click, or a click on the same spot (a
    // fresh click count, as some pointers and synthetic input send)
    const again = !!gesture && gesture.pointer && now - gesture.at < GUARD_MS && (e.detail > 1 || Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) <= 10);
    if (again) {
      // the rest of a click sequence that closed a tab: whatever slid under the
      // pointer (the next tab, its ×) is left alone
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      swallowed++;
      record("swallowed", { type: e.type, detail: e.detail, sinceClose: now - gesture.at });
      return;
    }
    if (e.type === "dblclick") return;
    const isClose = e.type === "auxclick" ? e.button === 1 && !!t.closest(TAB_SEL) : !!t.closest(CLOSE_CTL);
    if (isClose) gesture = { at: now, via: e.type, pointer: true, x: e.clientX, y: e.clientY };
  };

  // ⌘W (cause 2): a primary chat in front is closed like its ×; a parked
  // center has nothing in front, so nothing closes. Anything else (a terminal,
  // a canvas, a browser with focus) stays the app's.
  const onKeyClose = (e) => {
    if (e.defaultPrevented || e.isComposing || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
    if (String(e.key).toLowerCase() !== "w" && e.code !== "KeyW") return;
    const s = readState();
    if (!s || s.activeNavRoute !== "chat") return;
    const a = document.activeElement;
    if (a && (a.tagName === "WEBVIEW" || a.tagName === "IFRAME")) return; // the app closes that browser tab
    const tab = findTab(s, s.activeCenterTabId);
    gesture = { at: Date.now(), via: "cmd-w", pointer: false };
    if (!isPrimary(tab)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();
    if (e.repeat) return record("cmd-w-repeat", { id: tab.id });
    if (hidden.has(`${s.selectedWorkspaceId || ""}\u0000${tab.id}`)) return record("cmd-w-parked", { id: tab.id });
    const el = [...document.querySelectorAll(PRIMARY_SEL)].find((t) => t.getAttribute("data-tab-id") === tab.id && shown(t));
    if (!el) return record("cmd-w-no-tab", { id: tab.id });
    closeTab(el, "cmd-w");
  };

  // Cause 3: the app put a closed chat in front (its fallback after the tab in
  // front closed) while its bar still shows tabs: the closed tab's neighbour
  // comes forward instead (from the bar's last read: right, else left).
  let unparkAt = 0;
  function unpark(s) {
    if (!s || !parkedNow(s) || Date.now() - unparkAt < 400) return false;
    const id = s.activeCenterTabId;
    const el = [...document.querySelectorAll(PRIMARY_SEL)].find((t) => t.getAttribute("data-tab-id") === id);
    const list = el && el.closest(TABLIST_SEL);
    if (!list || !shown(list)) return false;
    const now = [...list.querySelectorAll(TAB_SEL)].filter((t) => t !== el && shown(t));
    if (!now.length) return unsplit(s, list); // a true empty center, unless a split side still shows tabs
    const nowIds = now.map((t) => t.getAttribute("data-tab-id"));
    const prev = lastGone.get(list);
    let pick = null;
    if (prev) {
      const at = prev.ids.indexOf(prev.gone[0]);
      if (at >= 0) pick = prev.ids.slice(at + 1).find((x) => nowIds.includes(x)) || prev.ids.slice(0, at).reverse().find((x) => nowIds.includes(x)) || null;
    }
    const target = now[pick ? nowIds.indexOf(pick) : nowIds.length - 1];
    unparkAt = Date.now();
    activate(s, target, id);
    record("unparked", { id, to: target.getAttribute("data-tab-id") });
    return true;
  }

  // Cause 3 in a split: the side that is not focused can be left with the
  // closed chat as its active tab (moving the tab in front into a split makes
  // the app fall back to the owner chat on the side it leaves): that side
  // showed the closed chat's view under a bar with no tab in front. Its first
  // tab on screen comes forward (setPanelActiveTab), and the focus goes back
  // to the side that had it (that call moves the focus).
  function unparkSplit(s) {
    if (!s || s.splitPanelMode !== true || typeof s.setPanelActiveTab !== "function" || Date.now() - unparkAt < 400) return false;
    const ws = s.selectedWorkspaceId || "";
    for (const side of ["left", "right"]) {
      const id = side === "left" ? s.leftPanelActiveTabId : s.rightPanelActiveTabId;
      if (!id || !hidden.has(`${ws}\u0000${id}`)) continue;
      const el = [...document.querySelectorAll(PRIMARY_SEL)].find((t) => t.getAttribute("data-tab-id") === id);
      const list = el && el.closest(TABLIST_SEL);
      if (!list || !shown(list)) continue;
      const now = [...list.querySelectorAll(TAB_SEL)].filter((t) => t !== el && shown(t));
      if (!now.length) return unsplit(s, list);
      const to = now[0].getAttribute("data-tab-id");
      const focus = s.activeCenterTabId;
      const other = side === "left" ? "right" : "left";
      unparkAt = Date.now();
      try {
        s.setPanelActiveTab(side, to);
        const after = readState();
        const otherActive = after && after.splitPanelMode === true ? (other === "left" ? after.leftPanelActiveTabId : after.rightPanelActiveTabId) : null;
        if (focus && focus !== id && focus !== to && otherActive === focus) after.setPanelActiveTab(other, focus);
      } catch (e) {
        src.error = `unparkSplit: ${errText(e)}`;
        return false;
      }
      record("unparked-split", { id, side, to });
      return true;
    }
    return false;
  }

  // A split ("Open in split view") whose side with the closed chat has no tab
  // left: the other side's tab comes forward and the split closes, as when a
  // side empties by itself (else that side would show the closed chat's view
  // under an empty bar, or the empty center would cover the other side).
  function unsplit(s, list) {
    if (s.splitPanelMode !== true || typeof s.toggleSplitPanelMode !== "function" || typeof s.setActiveCenterTab !== "function") return false;
    const other = [...document.querySelectorAll('[data-testid="center-panel"] [role="tablist"]')].find(
      (l) => l !== list && !l.closest(".rtd-panel") && shown(l) && [...l.querySelectorAll(TAB_SEL)].some(shown)
    );
    const tabs = other ? [...other.querySelectorAll(TAB_SEL)].filter(shown) : [];
    const front = tabs.find((t) => t.getAttribute("data-active-state") !== "inactive") || tabs[0];
    if (!front) return false;
    const id = front.getAttribute("data-tab-id");
    unparkAt = Date.now();
    try {
      s.setActiveCenterTab(id);
      const now = readState();
      if (now && now.splitPanelMode === true) now.toggleSplitPanelMode();
    } catch (e) {
      src.error = `unsplit: ${errText(e)}`;
      return false;
    }
    record("unsplit", { id: s.activeCenterTabId, to: id });
    return true;
  }

  // ------------------------------------------------------------------ close
  function closeTab(tabEl, via) {
    if (disposed || !tabEl || !tabEl.isConnected) return record("gone");
    const id = tabEl.getAttribute("data-tab-id");
    const s = readState();
    const ws = s ? s.selectedWorkspaceId || "" : "";
    const tab = s ? findTab(s, id) : null;
    if (s && !isPrimary(tab)) return record("not-a-primary-chat", { id, via });

    const list = tabEl.closest(TABLIST_SEL);
    const tabs = list ? [...list.querySelectorAll(TAB_SEL)] : [];
    const others = tabs.filter((t) => t !== tabEl && shown(t));

    // A) other tabs stay in the bar (the chat's own canvas, terminal, browser...):
    // only the chat's tab goes; its neighbour is shown. Those tabs stay open
    // until they are closed one by one (each with its own ×).
    if (others.length) {
      const visible = s ? onScreen(s, id) : tabEl.getAttribute("data-active-state") !== "inactive";
      settle(list); // the bar as it is now, for the slide
      hide(ws, id);
      applyStyle(s);
      settle(list);
      if (visible) {
        const at = tabs.indexOf(tabEl);
        const after = tabs.slice(at + 1).find((t) => others.includes(t));
        const before = tabs.slice(0, Math.max(0, at)).reverse().find((t) => others.includes(t));
        activate(s, after || before, id);
      }
      schedule();
      return record("hidden", { id, ws, via, activated: visible });
    }

    // B) the only tab of its bar: the bar ends with no tab. The app keeps this
    // chat active (it always keeps one), its tab hidden, and pane-dock covers the
    // center ("No open tabs") while parked() is true. No store call: nothing is
    // selected, created or archived, so nothing alternates and no "New Chat" is
    // added; the chat (running or not) stays in the sidebar.
    if (!s) {
      nudge(tabEl);
      return record("no-store", { id, via });
    }
    const wsObj = s.workspaces.find((w) => w.id === ws) || null;
    if (wsObj && wsObj.isArchived === true) {
      nudge(tabEl);
      return record("archived-workspace", { id, via });
    }
    settle(list);
    hide(ws, id);
    applyStyle(s);
    settle(list);
    schedule();
    return record("parked", { id, ws, via });
  }

  // ------------------------------------------------------------------- DOM
  function makeIcon() {
    const svg = document.createElementNS(SVG_NS, "svg");
    const attrs = {
      xmlns: SVG_NS,
      width: "24",
      height: "24",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      class: "lucide lucide-x size-3",
      "aria-hidden": "true",
    };
    for (const k in attrs) svg.setAttribute(k, attrs[k]);
    for (const d of ["M18 6 6 18", "m6 6 12 12"]) {
      const p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    }
    return svg;
  }

  function onButtonClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const tabEl = e.currentTarget.closest('[role="tab"]');
    closeTab(tabEl, "button");
  }
  function onButtonKey(e) {
    // Enter/Space press the button only; the tab's own keydown would select it.
    if (e.key === "Enter" || e.key === " ") e.stopPropagation();
  }
  function onTabAux(e) {
    if (e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    closeTab(e.currentTarget, "middle-click");
  }

  function makeButton() {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute(OWN_ATTR, "");
    b.appendChild(makeIcon());
    b.addEventListener("click", onButtonClick);
    b.addEventListener("keydown", onButtonKey);
    buttons.add(b);
    return b;
  }

  function dropButton(b) {
    b.removeEventListener("click", onButtonClick);
    b.removeEventListener("keydown", onButtonKey);
    buttons.delete(b);
    b.remove();
  }

  function fillButton(b, tabEl) {
    const st = tabEl.getAttribute("data-active-state");
    const cls = `${BTN_BASE} ${BTN_STATE[st] || BTN_STATE.inactive}`;
    if (b.className !== cls) b.className = cls;
    const label = `Close ${tabEl.getAttribute("aria-label") || "chat"}`;
    if (b.getAttribute("aria-label") !== label) b.setAttribute("aria-label", label);
  }

  function ensureButton(tabEl) {
    const own = [...tabEl.children].filter((c) => c.hasAttribute(OWN_ATTR));
    const app = [...tabEl.children].find((c) => c.tagName === "BUTTON" && !c.hasAttribute(OWN_ATTR));
    if (app) {
      // The app renders its own close button now: never show two.
      own.forEach(dropButton);
      return;
    }
    let b = own[0];
    for (const extra of own.slice(1)) dropButton(extra);
    if (!b) b = makeButton();
    if (b.parentNode !== tabEl || tabEl.lastElementChild !== b) tabEl.appendChild(b);
    fillButton(b, tabEl);
    if (!bound.has(tabEl)) {
      bound.add(tabEl);
      tabEl.addEventListener("auxclick", onTabAux);
    }
  }

  function ensureStyleEl() {
    if (styleEl && styleEl.isConnected) return styleEl;
    styleEl = document.createElement("style");
    styleEl.setAttribute(STYLE_ATTR, "");
    (document.head || document.documentElement).appendChild(styleEl);
    lastStyleText = null;
    return styleEl;
  }

  function applyStyle(s) {
    const ws = s ? s.selectedWorkspaceId || "" : null;
    const rules = [];
    for (const e of hidden.values()) {
      if (ws != null && e.ws !== ws) continue;
      rules.push(`${PRIMARY_SEL.replace("[data-tab-id]", `[data-tab-id="${CSS.escape(e.tab)}"]`)}{display:none!important}`);
    }
    const text = rules.join("\n");
    if (text === lastStyleText && styleEl && styleEl.isConnected) return;
    ensureStyleEl().textContent = text;
    lastStyleText = text;
  }

  // Hidden tabs whose chat is gone (deleted, archived, its workspace gone) are
  // forgotten. A hidden chat never comes back by itself: not when the app falls
  // back to it after its last other tab closes (that is the empty center), not
  // on a workspace switch; only reveal() shows it again. Without the store, the
  // DOM decides: a hidden tab that is active or alone in a bar on screen shows.
  function pruneHidden(s) {
    let changed = false;
    if (s) {
      const sel = s.selectedWorkspaceId || "";
      const wsById = new Map(s.workspaces.map((w) => [w.id, w]));
      for (const [key, e] of hidden) {
        const tabs = e.ws === sel ? s.centerTabs : (wsById.get(e.ws) || {}).centerTabs;
        if (!wsById.has(e.ws) || !Array.isArray(tabs)) {
          if (!wsById.has(e.ws)) {
            hidden.delete(key);
            changed = true;
          }
          continue; // a workspace whose tabs are not loaded: nothing to judge
        }
        const t = tabs.find((x) => x.id === e.tab);
        if (!isPrimary(t) || t.isArchived === true) {
          hidden.delete(key);
          changed = true;
        }
      }
    } else {
      for (const tabEl of document.querySelectorAll(PRIMARY_SEL)) {
        const id = tabEl.getAttribute("data-tab-id");
        const keys = [...hidden.keys()].filter((k) => k.endsWith(`\u0000${id}`));
        if (!keys.length) continue;
        const list = tabEl.closest(TABLIST_SEL);
        if (list && !shown(list)) continue; // only a bar on screen is judged
        const alone = !list || ![...list.querySelectorAll(TAB_SEL)].some((t) => t !== tabEl && shown(t));
        if (alone || tabEl.getAttribute("data-active-state") !== "inactive") {
          for (const k of keys) hidden.delete(k);
          changed = true;
        }
      }
    }
    if (changed) saveHidden();
    return s;
  }

  function observeBars() {
    const lists = new Set();
    for (const t of document.querySelectorAll(PRIMARY_SEL)) {
      const l = t.closest(TABLIST_SEL);
      if (l) lists.add(l);
    }
    let changed = lists.size !== observed.size;
    for (const l of observed) if (!l.isConnected || !lists.has(l)) changed = true;
    if (!changed) return;
    mo.disconnect();
    observed.clear();
    for (const l of lists) {
      mo.observe(l, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-active-state", "aria-label", "data-testid", "data-tab-id"],
      });
      observed.add(l);
    }
  }

  function sync() {
    raf = 0;
    if (disposed) return;
    const s = pruneHidden(readState());
    pinCanvasTabs(s);
    trackDevTabs(s);
    const sel = s ? s.selectedWorkspaceId : null;
    const wsObj = s ? s.workspaces.find((w) => w.id === sel) : null;
    const readOnly = !!wsObj && wsObj.isArchived === true;
    applyStyle(s);
    const tabs = new Set(document.querySelectorAll(PRIMARY_SEL));
    for (const tabEl of tabs) {
      if (readOnly) {
        for (const c of [...tabEl.children]) if (c.hasAttribute(OWN_ATTR)) dropButton(c);
        continue;
      }
      ensureButton(tabEl);
    }
    // Strays: a button left in an element that is no longer a primary tab.
    for (const b of [...buttons]) {
      const host = b.parentElement;
      if (!b.isConnected || !host || !tabs.has(host)) dropButton(b);
    }
    for (const b of document.querySelectorAll(`[${OWN_ATTR}]`)) if (!buttons.has(b)) b.remove();
    observeBars();
    settleAll();
    if (!unpark(s)) unparkSplit(s);
  }

  function schedule() {
    if (disposed || raf) return;
    raf = requestAnimationFrame(sync);
  }

  // A bar changed (React's commit, before the paint): its motion and a closed
  // chat put in front are handled right away; the rest on the next frame.
  const mo = new MutationObserver((records) => {
    let hit = false;
    for (const r of records) {
      if (r.type === "attributes") hit = true;
      const t = r.target;
      if (hit || (t && t.nodeType === 1 && (t.hasAttribute(OWN_ATTR) || t.closest(`[${GHOST_ATTR}]`)))) continue;
      const ours = (n) => n.nodeType === 1 && (n.hasAttribute(OWN_ATTR) || n.hasAttribute(GHOST_ATTR));
      for (const n of r.addedNodes) if (!ours(n)) hit = true;
      for (const n of r.removedNodes) if (!ours(n)) hit = true;
    }
    if (!hit || disposed) return;
    try {
      settleAll();
      const s = readState();
      if (!unpark(s)) unparkSplit(s);
    } catch (_) {}
    schedule();
  });

  function tryDiscover() {
    if (disposed || src.ws) return;
    try {
      discover();
    } catch (e) {
      src.error = errText(e);
    }
    if (!src.ws && ++src.tries < DISCOVER_TRIES) discoverTimer = setTimeout(tryDiscover, DISCOVER_MS);
  }

  function loop() {
    if (disposed) return;
    if (document.visibilityState !== "hidden") schedule();
    timer = setTimeout(loop, TICK_MS);
  }

  const onStorage = (e) => {
    if (e.key === LS_HIDDEN) {
      loadHidden();
      schedule();
    }
    if (e.key === LS_DEV) loadDev();
  };

  const start = () => {
    if (disposed) return;
    loadHidden();
    loadDev();
    window.addEventListener(RUN_REQUEST, onRunRequest, true);
    window.addEventListener("pointerdown", onUserPress, true);
    window.addEventListener("keydown", onUserPress, true);
    window.addEventListener("keydown", onKeyClose, true);
    for (const type of ["click", "auxclick", "dblclick"]) window.addEventListener(type, onBarPointer, true);
    window.addEventListener("resize", schedule);
    tryDiscover();
    loop();
    schedule();
    window.addEventListener("storage", onStorage);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();

  // ------------------------------------------------------------- introspection
  window.__RE_TEMPO_TAB_CLOSE__ = {
    source: () => ({ hasStore: !!src.ws, subscribed: src.subscribed, tries: src.tries, error: src.error }),
    state: () => ({
      buttons: [...buttons].filter((b) => b.isConnected).length,
      primaryTabs: document.querySelectorAll(PRIMARY_SEL).length,
      bars: observed.size,
      hidden: [...hidden.values()].map((e) => ({ ...e })),
      devServerDismissed: [...devDismissed],
      swallowed,
      lastMotion,
      lastAction,
      canvasPins,
    }),
    // hiddenIn("<ws id>"): the chats of that workspace whose tab was closed (the
    // project sidebar lists them nowhere)
    hiddenIn: (wsId) => [...hidden.values()].filter((e) => e.ws === (wsId || "")).map((e) => e.tab),
    // parked("<ws id>"): that workspace is the selected one and its center is
    // empty (its last tab was closed; the app's active chat is a hidden empty
    // one). pane-dock covers the center while this is true.
    parked: (wsId) => {
      const s = readState();
      return !!s && (!wsId || (s.selectedWorkspaceId || "") === wsId) && parkedNow(s);
    },
    // close("<tab id>") acts like the × of that primary tab.
    close: (id) => {
      const el = [...document.querySelectorAll(PRIMARY_SEL)].find((t) => t.getAttribute("data-tab-id") === id);
      return el ? closeTab(el, "api") : record("no-tab", { id });
    },
    // reveal() brings back every hidden tab; reveal("<tab id>") just one (the
    // project sidebar calls it when a chat row is clicked: a parked or closing
    // chat opened on purpose shows again).
    reveal: (id) => {
      for (const k of [...hidden.keys()]) if (!id || k.endsWith(`\u0000${id}`)) hidden.delete(k);
      saveHidden();
      sync();
      return hidden.size;
    },
    refresh: () => sync(),
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(timer);
      clearTimeout(discoverTimer);
      mo.disconnect();
      observed.clear();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(RUN_REQUEST, onRunRequest, true);
      window.removeEventListener("pointerdown", onUserPress, true);
      window.removeEventListener("keydown", onUserPress, true);
      window.removeEventListener("keydown", onKeyClose, true);
      for (const type of ["click", "auxclick", "dblclick"]) window.removeEventListener(type, onBarPointer, true);
      window.removeEventListener("resize", schedule);
      for (const g of ghosts) g.remove();
      ghosts.clear();
      for (const u of src.unsubs) {
        try {
          u();
        } catch (_) {}
      }
      src.unsubs = [];
      for (const b of [...buttons]) dropButton(b);
      for (const t of document.querySelectorAll(PRIMARY_SEL)) {
        t.removeEventListener("auxclick", onTabAux);
        t.removeAttribute(NUDGE_ATTR);
      }
      if (styleEl) styleEl.remove();
      styleEl = null;
      if (window.__RE_TEMPO_TAB_CLOSE__ === api) delete window.__RE_TEMPO_TAB_CLOSE__;
    },
  };
  const api = window.__RE_TEMPO_TAB_CLOSE__;
})();
