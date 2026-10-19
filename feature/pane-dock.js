/*
 * RE-TEMPO · pane-dock (user MOD layer)
 * ---------------------------------------------------------------------------
 * Free-form pane layout in the workspace center, like Orca:
 *   - moving a tab into a pane looks and works the same over its tab bar and
 *     over its body: the pane's bar opens a slot where the tab will land (under
 *     the pointer over the bar, at the end over the body) and the pane gets a 1px
 *     accent outline. The body's edges (25%) preview a split in that direction;
 *   - unlimited nested splits (mixed columns and rows), each pane with its own
 *     tab bar;
 *   - dividers resizable by dragging;
 *   - solo: ⌘⇧Enter or a pane's header button makes one pane (or the center) fill
 *     the area for a while, "Exit solo" / Esc brings the layout back as it was
 *     (see "solo");
 *   - a tab a chat opens (a browser, terminal or canvas from the agent's tools,
 *     ownerChatTabId) shows in that chat's pane when the chat sits in one: it
 *     never leaves the center rendering it under an empty tab bar, never makes a
 *     pane of its own, and the panes keep their sizes (adoptOwnedTabs);
 *   - hidden tabs (the chats the comment agent runs in the background, and the tabs
 *     they own) belong to no deck and are never the center's pick after a close:
 *     the center falls back to a tab of its own deck, or stays empty (cover,
 *     hidden); opening one on purpose makes it a tab like any other
 *     (isHiddenTab, __RE_TEMPO_DECKS__.hiddenTabs);
 *   - a pane left without tabs collapses and its neighbors take its room; so
 *     does the center ("main") when none of its tabs is left: it hides and the
 *     panes fill the area, until a tab opens there again. Closing tabs never
 *     moves a tab between panes: when the app makes a tab that lives in a pane
 *     the center's active one (its pick after a close), the center goes back to
 *     one of its own tabs (or stays empty and hidden). A change of the layout's
 *     shape (a pane gone, the center hidden or back, a split) eases in 200 ms
 *     (not while dragging a divider or resizing the window; reduced motion: none);
 *   - decks: each workspace keeps several named arrangements (layout, which tab
 *     sits in which pane, the tabs the center shows, its active chat), one of
 *     them active; switching hides the other decks' tabs (they are not closed).
 *     A tab belongs to one deck only, and a deck is never empty: a new deck
 *     starts with a new chat (the store's own createChatTab), and a deck left
 *     without tabs goes away (except a workspace's only deck). Saved in
 *     localStorage, they come back on reload. API for other mods:
 *     window.__RE_TEMPO_DECKS__ (list(ws): each deck's members, its center chat
 *     and tab, and its layout of open tabs) and the "rtd:decks-changed" event;
 *   - each pane has its own "+" with the center's "+" items (New canvas, Chat,
 *     Doc, Issue, Terminal, Browser, and Open for existing canvases, docs,
 *     issues and files): the app's own action runs and the tab it opens lands in
 *     that pane (New canvas creates one, like the center's "+"). Canvases, docs and issues opened
 *     on the chat route are center tabs, so they dock, render and restore like
 *     any other center tab. As in
 *     the center, the "+" sits right after the pane's last tab and "Open in split
 *     view" at the header's right end (it moves the active tab to a new pane on
 *     the right);
 *   - ⌘Z / Ctrl+Z undoes the last layout or deck change (a split, a tab moved
 *     between panes or back to the center, a pane closed with tabs inside, a deck
 *     created, removed, renamed or reordered), several presses undo several, and
 *     ⌘⇧Z / Ctrl+Shift+Z / Ctrl+Y redo. One history per workspace. The shortcut
 *     only acts when nothing else owns it (typing, the canvas, a webview...);
 *   - a chat tab dropped on a "+" (a pane's or the center's) goes to a new
 *     workspace: over the "+" it turns into a "New workspace" pill, and the tab
 *     flies into it on drop (see "a tab dropped on a "+"" below). Undoable too;
 *   - a tab torn out into an external window (the app's popout) keeps a placeholder
 *     at home ("Open in external window", Bring back, Focus window) and comes back
 *     to its pane and index when that window (or its tab's "×") is closed or on
 *     Bring back; after a reload the window opens again (see "external window
 *     closed: the tab goes home" and "external window: the placeholder at home");
 *   - a canvas in a pane keeps its floating UI in that pane: the comment composer
 *     and thread, the pin preview, the mention list and the canvas's menus and
 *     tooltips stay inside the pane (see "canvas popovers stay in their pane");
 *
 * How it works, without editing the bundle or reparenting React DOM:
 *   - the app already has a "transferred tabs" system for popout windows (a
 *     store with tabs, activeByPopup, moveToPopup, attach, select, reorder). It
 *     renders each popout with its own tab bar and the tab content: chat through
 *     a portal into a registered host, and canvas/terminal/file/browser with the
 *     same renderer as the center. Each dock pane is a fake "window": a window
 *     Proxy whose document.body.append puts the content inside the pane. Moving a
 *     tab between panes is the app's own moveToPopup (the tab content remounts
 *     once, as with the native popout and split; chat history comes from the
 *     store and is not lost);
 *   - the native center (with the native "Open in split view") is the "main"
 *     leaf of the tree and is only repositioned by CSS into that leaf's rect;
 *   - internal stores are found through the getState functions zustand leaves in
 *     useMemo deps across the React tree (only pure `()=>x` getters are called).
 *
 * Several canvases at once (any number, the same canvas in several panes too).
 * What the bundle does (index-D2Ui1vc0.js) and what was in the way:
 *   - rendering is per pane already. The popout renderer gives each pane its own
 *     portal root (a div it appends to the pane's fake document.body) and, per tab,
 *     a wrapper keyed by tab id ("h-full" for the active one, "hidden" for the
 *     others) with its own content renderer (o9 -> xua -> N0i -> QRi). Nothing is
 *     pooled or shared: no iframe/webview pool, no "active canvas" store, no limit
 *     per workspace; each canvas keeps its page config, viewport, selection and
 *     undo in its own React state and refs. A pane's other tabs stay mounted
 *     (hidden). The renderer sits at the app root, outside the route keep-alive's
 *     freeze context, so every docked canvas is "active". Canvas shortcuts are per
 *     instance (a canvas owns them while the last pointerdown/focusin was in its
 *     own [data-canvas-shell]): the last clicked canvas gets them. Moving or
 *     swapping a tab in one pane remounts that pane's tab only;
 *   - one tab, one place: the popout store keeps a tab (descriptor id
 *     "center:<ws>:<tabId>") in one window, and moveToPopup takes it out of the
 *     previous one;
 *   - one tab per canvas: openCanvasTab reuses the tab of that folder for the
 *     current chat (id "canvas-<chat>-<folder>") and only activates it. A pane "+"
 *     (Open... on a canvas already open) took that tab, and moving it into the pane
 *     emptied the pane, or the center, that was showing it: one canvas replaced the
 *     other;
 *   - preview tabs: openCanvasTab without pin (Open..., quick open) replaces the
 *     chat's unpinned canvas tab in place, so a preview canvas the center showed
 *     went away when a pane "+" opened another canvas.
 * What the dock does:
 *   - a canvas already on screen (another pane's tab, or a tab the center shows)
 *     gets a second tab for the new pane instead of moving: the app's own kind of
 *     duplicate (the same canvas with the id suffix of the center's "Duplicate
 *     Active Tab", "-split-right-N", pinned), added with applyRemoteTabOp("open").
 *     No splitPanelCloneOf: leaving the native split drops clones whose original is
 *     open. That pane mounts its own instance; the other one is not touched;
 *   - "Open in split view" on a pane whose only tab is a canvas duplicates it into a
 *     new pane on the right; with more tabs it moves the active one, and ⌥-click
 *     duplicates the active canvas. API: duplicate(), splitPane(id, true);
 *   - before a pane "+" runs Open..., the canvas tabs on screen are pinned (the
 *     app's pinTab), so a canvas it opens is added instead of replacing them;
 *   - undo of a step that made a duplicate closes it (it does not come back to the
 *     center as a second tab of the same canvas, unless it is the canvas's last
 *     tab), and redo opens it again;
 *   - the chat composer's canvas selection (its "canvas-selection" context and the
 *     selection captured on send) comes from one canvas: a module-level handle each
 *     canvas claims in an effect when it mounts (TGi; last mounted wins, the native
 *     split included). With several canvases mounted, a pointerdown in one re-runs
 *     that canvas's own claim effect (on the nearest ancestor fiber of its
 *     [data-canvas-shell], the effect whose deps are [true, {handleRef}]), so the
 *     chat sees the last clicked canvas. Besides store actions and getters, this is
 *     the only app code the dock calls.
 * Limits (they need the app's internals): the canvas reload shortcut (⌘R) and its
 *     diagnostic go to the last mounted canvas (the restart is per worktree, so it
 *     restarts the same dev server whichever canvas has it); two instances of the
 *     same canvas each hold a copy of its page config and pick up the other's saves
 *     through the file watcher, so editing both at the same moment is last write
 *     wins; picking, in a pane's "+" Open..., the canvas the center itself shows
 *     changes nothing in the store (openCanvasTab finds that tab already active),
 *     so the dock cannot tell it from a cancelled picker and nothing happens (the
 *     center's "Duplicate Active Tab" or duplicate() put it in a pane).
 *
 * Introspection: window.__RE_TEMPO_PANE_DOCK__ (layout, panels, split(), splitPane(),
 * duplicate(), reset(), undo(), redo(), history, dropToNewWorkspace(),
 * canDropToNewWorkspace(), plusItems(), runPlusItem(paneId, itemId): the "+" menu's
 * items and the same action as clicking one in that pane's "+", "main" = center;
 * viewRect(el): the rect of the pane hosting that canvas/element, null in the center).
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (window.__RE_TEMPO_PANE_DOCK__) return; // double injection

  const VIEW_TAB = "application/x-tempo-view-tab";
  const LS_KEY = "re-tempo:pane-dock:v1";
  const POPUP_PREFIX = "rtd-dock-";
  const CENTER = '[data-testid="center-panel"]';
  const EDGE = 0.25; // edge fraction that creates a split
  const MIN_PX = 160; // minimum pane size while resizing
  const GAP = 1; // line between panes
  const HIT = 7; // divider grab area
  const POLL_MS = 250;
  const HEADER_FALLBACK = 45;

  // ------------------------------------------------------------- app stores
  const S = { ws: null, pq: null, vq: null };
  const GETTER_RE = /^\(\)=>[A-Za-z$_][\w$]*$/;

  const tried = new WeakSet();

  // Checks one fiber's hooks for zustand getState functions.
  function checkFiber(f) {
    let h = f.memoizedState;
    if (!h || typeof h !== "object" || !("next" in h)) return;
    for (let i = 0; h && i < 400; i++, h = h.next) {
      const m = h.memoizedState;
      // useSyncExternalStoreWithSelector: useMemo(fn, [getState, getInitialState, selector, isEqual])
      const d = Array.isArray(m) && m.length === 2 ? m[1] : null;
      if (!Array.isArray(d) || d.length !== 4 || typeof d[0] !== "function" || typeof d[2] !== "function") continue;
      const gs = d[0];
      if (tried.has(gs)) continue;
      tried.add(gs);
      // Pure zustand getters only: calling arbitrary functions from deps has side effects.
      if (!GETTER_RE.test(Function.prototype.toString.call(gs))) continue;
      let st;
      try {
        st = gs();
      } catch (_) {
        continue;
      }
      if (!st || typeof st !== "object") continue;
      if (!S.pq && typeof st.moveToPopup === "function" && "activeByPopup" in st) S.pq = gs;
      else if (!S.vq && "placements" in st && "returned" in st) S.vq = gs;
      else if (!S.ws && Array.isArray(st.workspaces) && typeof st.setActiveCenterTab === "function") S.ws = gs;
    }
  }

  const storesFound = () => !!(S.ws && S.pq);
  const fiberOf = (n) => {
    const k = n && Object.keys(n).find((x) => x.startsWith("__reactFiber$"));
    return k ? n[k] : null;
  };

  // 1) Walk up from the center panel: its component reads the workspace, popout
  //    and placement stores. 2) Otherwise a full tree scan, time-sliced and resumed
  //    across ticks: a big real tree does not fit in one short budget.
  let scan = null;
  function discoverStores() {
    let up = 0;
    for (let f = fiberOf(document.querySelector(CENTER)); f && up < 600 && !storesFound(); f = f.return, up++) checkFiber(f);
    if (storesFound()) return true;
    if (!scan) {
      const root = document.getElementById("root");
      const key = root && Object.keys(root).find((k) => k.startsWith("__reactContainer$"));
      if (!key) return false;
      scan = { stack: [root[key]], seen: new Set() };
    }
    const deadline = performance.now() + 8;
    while (scan.stack.length && performance.now() < deadline && !storesFound()) {
      const f = scan.stack.pop();
      if (!f || scan.seen.has(f)) continue;
      scan.seen.add(f);
      checkFiber(f);
      if (f.child) scan.stack.push(f.child);
      if (f.sibling) scan.stack.push(f.sibling);
    }
    const done = storesFound();
    if (done || !scan.stack.length) scan = null;
    return done;
  }

  const W = () => S.ws();
  const PQ = () => S.pq();
  const VQ = () => (S.vq ? S.vq() : null);

  // ------------------------------------------------------ tabs (descriptors)
  // Same label the app shows in the center tab bar.
  function tabLabel(t) {
    switch (t.type) {
      case "chat":
        return t.name || "Chat";
      case "diff":
        return `${t.fileName} (Working Tree)`;
      case "canvas":
        return t.pageName;
      case "file":
        return t.fileName;
      case "prd":
        return t.displayTitle || String(t.fileName || "").replace(/\.md$/i, "");
      case "mcp":
        return "MCP Servers";
      case "terminal":
        return t.title;
      case "browser":
        return t.title || "Browser";
      case "issue":
        return t.issueTitle;
      case "agent":
        return t.agentName;
      default:
        return t.title || "Unknown";
    }
  }

  // Same shape the center tab bar puts in dataTransfer.
  function descFor(wsId, tab) {
    return tab.type === "chat"
      ? { id: `chat:${wsId}:${tab.id}`, kind: "chat", source: "chat", workspaceId: wsId, chatTabId: tab.id, title: tabLabel(tab) }
      : { id: `center:${wsId}:${tab.id}`, kind: "center", source: "chat", workspaceId: wsId, tab, title: tabLabel(tab) };
  }

  // Id of the underlying tab, per descriptor kind (same kinds the popout store takes).
  const KINDS = ["chat", "center", "canvas", "doc", "issue"];
  const isCenterKind = (d) => d.kind === "chat" || d.kind === "center";
  const typeOfDesc = (d) => (d.kind === "center" ? (d.tab && d.tab.type) || "" : d.kind === "doc" ? "prd" : d.kind);
  const tabIdOf = (d) =>
    d.kind === "chat" ? d.chatTabId : d.kind === "center" ? d.tab && d.tab.id : d.kind === "canvas" ? d.tabId : d.kind === "doc" ? d.docId : d.issueId;

  // Design canvases, docs and issues have no center tab to re-read: the stored
  // descriptor is reused, checking that a canvas tab still exists.
  function plainDesc(d) {
    if (!d || typeof d.id !== "string" || !KINDS.includes(d.kind) || isCenterKind(d)) return null;
    const out = { ...d };
    delete out.popup;
    if (out.kind === "canvas") {
      const ws = W().workspaces.find((w) => w.id === out.workspaceId);
      if (!ws) return null;
      if (Array.isArray(ws.designTabs) && !ws.designTabs.some((t) => t.id === out.tabId)) return null;
    }
    return out;
  }

  function liveTab(wsId, tabId) {
    const st = W();
    const tabs = st.selectedWorkspaceId === wsId ? st.centerTabs : (st.workspaces.find((w) => w.id === wsId) || {}).centerTabs;
    const t = (tabs || []).find((x) => x.id === tabId);
    return t && !(t.type === "chat" && t.isArchived === true) ? t : null;
  }

  // The native split does not hide transferred tabs (CSS hides them and
  // fixNativeSplitSides switches that side's active tab). If a side would be
  // left with no tabs, leave the split before moving.
  function leaveNativeSplitFor(all) {
    const st = W();
    const descs = all.filter(isCenterKind);
    if (!st.splitPanelMode || !descs.length) return;
    const active = st.activeChatTabId;
    const leaving = new Set(descs.map(tabIdOf).concat(PQ().tabs.filter(isCenterKind).map(tabIdOf)));
    const shown = (st.centerTabs || []).filter((t) => t.id === active || t.ownerChatTabId === active);
    const sideOf = (t) => t.splitPanelSide || (t.id === active ? "left" : null);
    const empties = ["left", "right"].some((side) => {
      const mine = shown.filter((t) => sideOf(t) === side);
      return mine.some((t) => leaving.has(t.id)) && mine.every((t) => leaving.has(t.id));
    });
    if (empties) st.toggleSplitPanelMode();
  }

  // ------------------------------------------------------------ layout tree
  // node: { t: "l", id } (leaf: "main" or a pane id)
  //   | { t: "s", d: "row" | "col", c: [node], z: [fractions] }
  const leaf = (id) => ({ t: "l", id });

  function find(node, id, parent = null, idx = -1) {
    if (node.t === "l") return node.id === id ? { parent, idx } : null;
    for (let i = 0; i < node.c.length; i++) {
      const r = find(node.c[i], id, node, i);
      if (r) return r;
    }
    return null;
  }

  function leaves(node, out = []) {
    if (node.t === "l") out.push(node.id);
    else node.c.forEach((c) => leaves(c, out));
    return out;
  }

  function insertBeside(root, targetId, newId, zone) {
    const dir = zone === "left" || zone === "right" ? "row" : "col";
    const before = zone === "left" || zone === "top";
    const hit = find(root, targetId);
    if (!hit) return root;
    const { parent, idx } = hit;
    const n = leaf(newId);
    if (parent && parent.d === dir) {
      const half = parent.z[idx] / 2;
      const at = before ? idx : idx + 1;
      parent.z[idx] = half;
      parent.c.splice(at, 0, n);
      parent.z.splice(at, 0, half);
      return root;
    }
    const target = parent ? parent.c[idx] : root;
    const split = { t: "s", d: dir, c: before ? [n, target] : [target, n], z: [0.5, 0.5] };
    if (!parent) return split;
    parent.c[idx] = split;
    return root;
  }

  function removeLeaf(root, id) {
    const hit = find(root, id);
    if (!hit) return root;
    if (!hit.parent) return leaf("main");
    const { parent, idx } = hit;
    const [share] = parent.z.splice(idx, 1);
    parent.c.splice(idx, 1);
    parent.z[idx > 0 ? idx - 1 : 0] += share; // the neighbor inherits the space
    return normalize(root);
  }

  // Unwraps single-child splits and flattens splits in the same direction as the parent.
  function normalize(node) {
    if (node.t === "l") return node;
    const c = [];
    const z = [];
    node.c.forEach((child, i) => {
      const n = normalize(child);
      if (n.t === "s" && n.d === node.d) {
        const sum = n.z.reduce((a, b) => a + b, 0) || 1;
        n.c.forEach((cc, j) => {
          c.push(cc);
          z.push((node.z[i] * n.z[j]) / sum);
        });
      } else {
        c.push(n);
        z.push(node.z[i]);
      }
    });
    if (c.length === 1) return c[0];
    return { t: "s", d: node.d, c, z };
  }

  function validTree(node) {
    if (!node || typeof node !== "object") return false;
    if (node.t === "l") return typeof node.id === "string";
    return (
      node.t === "s" &&
      (node.d === "row" || node.d === "col") &&
      Array.isArray(node.c) &&
      Array.isArray(node.z) &&
      node.c.length === node.z.length &&
      node.c.length > 0 &&
      node.z.every((v) => typeof v === "number" && v > 0) &&
      node.c.every(validTree)
    );
  }

  const hiddenNode = (node, hidden) => (node.t === "l" ? hidden.has(node.id) : node.c.every((c) => hiddenNode(c, hidden)));

  function computeLayout(root, width, height, hidden) {
    const out = { rects: new Map(), dividers: [] };
    (function walk(node, r) {
      if (node.t === "l") {
        if (!hidden.has(node.id)) out.rects.set(node.id, r);
        return;
      }
      const vis = [];
      node.c.forEach((ch, i) => {
        if (!hiddenNode(ch, hidden)) vis.push(i);
      });
      if (!vis.length) return;
      const row = node.d === "row";
      const span = row ? r.w : r.h;
      const avail = Math.max(1, span - GAP * (vis.length - 1));
      const sum = vis.reduce((a, i) => a + node.z[i], 0) || 1;
      let pos = row ? r.x : r.y;
      const end = pos + span;
      vis.forEach((i, k) => {
        const last = k === vis.length - 1;
        const len = last ? end - pos : Math.round((avail * node.z[i]) / sum);
        walk(node.c[i], row ? { x: pos, y: r.y, w: len, h: r.h } : { x: r.x, y: pos, w: r.w, h: len });
        pos += len;
        if (!last) {
          out.dividers.push({ node, a: i, b: vis[k + 1], row, x: row ? pos : r.x, y: row ? r.y : pos, len: row ? r.h : r.w, avail, sum });
          pos += GAP;
        }
      });
    })(root, { x: 0, y: 0, w: width, h: height });
    return out;
  }

  // ------------------------------------------------------------------ state
  const panels = new Map(); // id -> { id, wsId, el, popup, name, emptySince }
  const layouts = new Map(); // wsId -> tree root
  const dupTabs = new Map(); // tab id -> tab: canvas duplicates the dock opened (this session)
  const dupParked = new Set(); // ids of those an undo closed (a redo opens them again)
  let savedAll = {};
  try {
    savedAll = JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {};
  } catch (_) {
    savedAll = {};
  }
  let lastSaved = "";
  let currentWs = null;
  let mainEmpty = false;
  let lastSize = "";
  let lastActiveChat = null;
  let lastLayout = { rects: new Map(), dividers: [] };
  let hiddenNow = new Set();
  let outIds = []; // transferred tabs of the current workspace (hidden in the center tab bar)
  let dirty = true;
  let restoring = false;
  let frozen = false; // page unloading: stop writing anything
  let destroyed = false;
  let resizing = null;
  let drag = null;
  let seq = 0;
  let listenerAfterReact = false;
  let mainNode = null; // visible route view marked with data-rtd-main
  let coverEl = null; // empty-deck cover over the center content
  let lastParked = false; // tab-close reported the center as parked (no open tab)
  let ticking = false; // relayout() runs from the tick (the cover may go up)
  // The dock lives on the chat route only: there #workspace-center is just the
  // content area (the Chats sidebar sits outside it). Other routes keep their
  // own sidebar inside it, so docking there would squeeze the whole view.
  const ROUTES = ["chat"];

  let host = null; // #workspace-center
  let layerEl = null;
  let dndEl = null;
  let hintEl = null; // split preview over half a pane (the body's edges)
  let targetEl = null; // 1px accent outline of the destination pane
  let ghostEl = null; // translucent copy of the dragged tab in the opened slot
  let markerEl = null; // 2px insertion marker
  let dragStyle = null; // slot room and slide distance of the bar being previewed
  let dynStyle = null;
  let divEls = [];

  const el = (cls, tag = "div") => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };
  const place = (n, r) => {
    n.style.left = `${r.x}px`;
    n.style.top = `${r.y}px`;
    n.style.width = `${r.w}px`;
    n.style.height = `${r.h}px`;
  };

  function ensureDom() {
    if (!layerEl) {
      layerEl = el("rtd-layer");
      dndEl = el("rtd-dnd");
      hintEl = el("rtd-hint");
      const label = el("rtd-hint-label", "span");
      label.textContent = "New split";
      hintEl.appendChild(label);
      targetEl = el("rtd-target");
      ghostEl = el("rtd-ghost");
      ghostEl.appendChild(el("rtd-ghost-label", "span"));
      markerEl = el("rtd-insert");
      dragStyle = el("", "style");
      dragStyle.id = "rtd-drag";
      document.head.appendChild(dragStyle);
      dynStyle = el("", "style");
      dynStyle.id = "rtd-dyn";
      document.head.appendChild(dynStyle);
    }
    const wc = document.getElementById("workspace-center");
    if (!wc) return null;
    if (layerEl.parentElement !== wc) {
      // Before the webview host (webviews sit above the panes); the drag overlay
      // goes after it, above everything.
      const browserHost = wc.querySelector(':scope > [data-testid="browser-tab-host"]');
      wc.insertBefore(layerEl, browserHost || null);
      wc.appendChild(dndEl);
      dirty = true;
    }
    host = wc;
    return wc;
  }

  // ------------------------------------------------- panes (fake "windows")
  function makePanel(wsId, id = `p${Date.now().toString(36)}${(seq++).toString(36)}`) {
    const box = el("rtd-panel");
    box.setAttribute("data-rtd-panel", id);
    box.setAttribute("data-detachable-tab-view", ""); // the app measures this when tearing a tab out
    box.style.display = "none";
    // The pane's own "+" and "Open in split view" (buttons, so the `.rtd-panel > div`
    // sizing rule skips them). placeChrome() puts them in the pane's header.
    const add = el("rtd-add", "button");
    add.type = "button";
    add.title = "New tab in this pane";
    add.setAttribute("aria-label", "New tab in this pane");
    add.setAttribute("aria-haspopup", "menu");
    add.setAttribute("aria-expanded", "false");
    add.innerHTML = svg(ICON.plus);
    add.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleAddMenu(id, add);
    });
    box.appendChild(add);
    const split = el("rtd-split", "button");
    split.type = "button";
    split.title = "Open in split view";
    split.setAttribute("aria-label", "Open in split view");
    split.setAttribute("aria-disabled", "true");
    split.innerHTML = svg(ICON.columns);
    split.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (split.getAttribute("aria-disabled") !== "true") splitPane(id, e.altKey);
    });
    box.appendChild(split);
    const solo = soloButton(() => setSolo(soloNow() === id ? null : id));
    solo.hidden = true;
    box.appendChild(solo);
    const name = POPUP_PREFIX + id;
    // The app's popout renderer uses: title, head.append, body.append,
    // body.style, documentElement.{className,style}, createElement, importNode.
    const doc = {
      title: "",
      head: { append() {}, appendChild() {} },
      body: { append: (...n) => box.append(...n), appendChild: (n) => box.appendChild(n), style: {} },
      documentElement: { className: "", style: { cssText: "" } },
      createElement: (tag) => document.createElement(tag),
      importNode: () => document.createComment("rtd"),
    };
    const own = {
      name,
      closed: false,
      opener: null,
      document: doc,
      focus() {},
      close() {
        onPopupClosed(id, popup); // a deck switch can recreate a pane with the same id
      },
    };
    const popup = new Proxy(own, {
      get(t, p) {
        if (Object.prototype.hasOwnProperty.call(t, p)) return t[p];
        const v = window[p];
        return typeof v === "function" ? v.bind(window) : v;
      },
      set(t, p, v) {
        t[p] = v;
        return true;
      },
    });
    const panel = { id, wsId, el: box, popup, name, emptySince: 0, add, split, solo };
    panels.set(id, panel);
    ensureDom();
    layerEl.appendChild(box);
    return panel;
  }

  const tabsOf = (panel) => PQ().tabs.filter((t) => t.popup === panel.popup);

  function onPopupClosed(id, popup) {
    if (destroyed || frozen) return;
    const panel = panels.get(id);
    if (!panel || (popup && panel.popup !== popup)) return;
    const mine = tabsOf(panel);
    if (!mine.length && paneHolds(id)) return; // its tabs went to external windows: it keeps their placeholders
    if (mine.length) record("close");
    for (const t of mine) returnToMain(t); // closed with tabs inside: they go back to the center
    removePanel(id);
  }

  function removePanel(id) {
    const panel = panels.get(id);
    if (!panel) return;
    panels.delete(id);
    const root = layouts.get(panel.wsId);
    if (root) layouts.set(panel.wsId, removeLeaf(root, id));
    panel.el.remove();
    dirty = true;
    schedule();
  }

  // ---------------------------------------------------------------- actions
  // A tab a chat opens (ownerChatTabId: openBrowserTab, openTerminalTab... from the
  // agent's tools) is a center tab that the app makes the center's active one. When
  // that chat sits in a dock pane, the center rendered it under a tab bar that does
  // not list it (the center came back as a leaf of its own, squeezing the panes):
  // such a tab joins its chat's pane instead, shown there when it was the active
  // one. The app gives every tab opened in the center the active chat as owner (a
  // canvas from Open..., quick open), so only these move: a tab that just appeared
  // while the center is hidden (it would bring the center back), and the center's
  // active tab when its bar does not list it. Not while a pane "+" waits for its
  // tab, nor a placeholder's tab, nor one put back in the center.
  let centerSeen = null; // center tab ids on the last tick
  const handBack = new Set(); // tabs put back in the center (by hand, a pane closed): left there
  function adoptOwnedTabs() {
    if (!currentWs || !S.ws || !S.pq) return;
    const st = W();
    const tabs = st.centerTabs || [];
    const prev = centerSeen;
    centerSeen = new Set(tabs.map((t) => t && t.id));
    if (drag || restoring || applying || pendingAdd || resizing) return;
    const inPq = new Map(PQ().tabs.filter(isCenterKind).map((t) => [tabIdOf(t), t]));
    for (const id of [...handBack]) if (inPq.has(id) || !centerSeen.has(id)) handBack.delete(id);
    const parked = new Set(parkedIds());
    let moved = false;
    for (const t of tabs) {
      if (!t || !t.ownerChatTabId || t.type === "chat" || inPq.has(t.id) || parked.has(t.id) || handBack.has(t.id) || !dockable(t)) continue;
      const owner = inPq.get(t.ownerChatTabId);
      const p = owner && panelOfDesc(owner.id);
      if (!p || p.wsId !== currentWs) continue;
      const active = st.activeCenterTabId === t.id;
      const fresh = prev && !prev.has(t.id) && (mainEmpty || hiddenNow.has("main"));
      const bar = mainNode && mainNode.querySelector(`${CENTER} [role="tab"][data-tab-id="${CSS.escape(t.id)}"]`);
      const unseen = active && !(bar && bar.offsetWidth > 0);
      if (!fresh && !unseen) continue;
      const d = descFor(currentWs, t);
      if (st.splitPanelMode) leaveNativeSplitFor([d]);
      moveInto(p, d);
      if (active) PQ().select(p.popup, d.id);
      moved = true;
    }
    if (moved) {
      outIds = transferredIds();
      dirty = true;
    }
  }

  function moveInto(panel, desc) {
    const st = W();
    // As the app does on transfer: a preview tab becomes pinned.
    try {
      if (desc.kind === "center" && st.selectedWorkspaceId === desc.workspaceId) st.pinTab(desc.tab.id);
      else if (desc.kind === "canvas" && typeof st.pinDesignTabForWorkspace === "function") st.pinDesignTabForWorkspace(desc.workspaceId, desc.tabId);
    } catch (_) {}
    try {
      const vq = VQ();
      if (vq) {
        vq.remove(desc.id);
        if (desc.source && desc.source !== "chat") vq.select(desc.source, null);
      }
    } catch (_) {}
    PQ().moveToPopup(desc, panel.popup);
    // A chat owned by another one (split chat) stays in the center tab bar, which
    // filters it by the center: key. If it was the active tab the center goes
    // blank, so activate another one.
    const now = W();
    const tabId = tabIdOf(desc);
    if (desc.kind === "chat" && now.activeCenterTabId === tabId) {
      const moved = new Set(PQ().tabs.map((t) => tabIdOf(t)));
      const next =
        (!moved.has(now.activeChatTabId) && now.activeChatTabId !== tabId && now.activeChatTabId) ||
        ((now.centerTabs || []).find((t) => t.id !== tabId && !moved.has(t.id) && t.ownerChatTabId === now.activeChatTabId) || {}).id;
      if (next) setCenter(next);
    }
  }

  // The dock's own center activations: syncDecks does not take them for the user
  // picking a tab (which would move that tab into the active deck).
  function setCenter(id) {
    const st = W();
    st.setActiveCenterTab(id);
    if (currentWs && st.selectedWorkspaceId === currentWs) seenActive.set(currentWs, activeNow());
  }

  // Ids of transferred tabs. The center tab bar hides neither split chats (it
  // filters them by the center: key) nor anything in the native split; CSS hides
  // them by data-tab-id.
  function transferredIds() {
    return PQ()
      .tabs.filter((t) => isCenterKind(t) && t.workspaceId === currentWs)
      .map((t) => tabIdOf(t))
      .sort();
  }

  // In the native split, a side whose active tab was transferred would show it twice.
  function fixNativeSplitSides() {
    const st = W();
    if (!st.splitPanelMode || !outIds.length) return;
    for (const side of ["left", "right"]) {
      const active = st[`${side}PanelActiveTabId`];
      if (!active || !outIds.includes(active)) continue;
      const next = (st.centerTabs || []).find(
        (t) => t.splitPanelSide === side && !outIds.includes(t.id) && (t.id === st.activeChatTabId || t.ownerChatTabId === st.activeChatTabId),
      );
      if (next) st.setPanelActiveTab(side, next.id);
    }
  }

  function returnToMain(desc) {
    const pq = PQ();
    if (!pq.tabs.some((t) => t.id === desc.id)) return;
    if (isCenterKind(desc)) handBack.add(tabIdOf(desc)); // a chat's tab put back in the center stays there
    const st = W();
    try {
      if (isCenterKind(desc) && st.selectedWorkspaceId === desc.workspaceId) setCenter(tabIdOf(desc));
      else if (desc.kind === "canvas" && st.selectedWorkspaceId === desc.workspaceId && st.setActiveDesignTab) st.setActiveDesignTab(desc.tabId);
    } catch (_) {}
    try {
      const vq = VQ();
      if (vq) vq.remove(desc.id);
    } catch (_) {}
    pq.attach(desc.id);
  }

  // ------------------------------------------------- several canvases at once
  // (See the header.) A center tab is on screen when it is a pane's tab or the tab
  // the center, or a side of the native split, shows.
  const isCanvasDesc = (d) => !!d && d.kind === "center" && !!d.tab && d.tab.type === "canvas";
  function centerShown(st = W()) {
    const ids = [st.activeCenterTabId];
    if (st.splitPanelMode) ids.push(st.leftPanelActiveTabId, st.rightPanelActiveTabId);
    return new Set(ids.filter(Boolean));
  }

  function canDuplicate(wsId = currentWs) {
    const st = W();
    if (typeof st.applyRemoteTabOp !== "function") return false;
    const ws = st.workspaces.find((w) => w.id === wsId);
    return !!ws && ws.hostMachineId == null; // applyRemoteTabOp skips remote-hosted worktrees
  }

  // A second tab for a canvas: the same canvas, owner chat and name, pinned, with
  // the id suffix of the app's own duplicates ("-split-right-N", the first N free
  // among the center tabs and the popout store's), added with the store's
  // applyRemoteTabOp("open") (a plain add, the active tab stays). The live tab, or
  // null.
  function duplicateCanvasTab(wsId, tab) {
    if (!tab || tab.type !== "canvas" || !canDuplicate(wsId)) return null;
    const used = new Set(wsTabs(wsId).map((t) => t && t.id));
    for (const d of PQ().tabs) if (d && d.kind === "center" && d.tab) used.add(d.tab.id);
    const base = String(tab.id).replace(/-split-right-\d+$/, "");
    let n = 1;
    while (used.has(`${base}-split-right-${n}`)) n++;
    const next = { ...tab, id: `${base}-split-right-${n}`, isPinned: true };
    delete next.splitPanelCloneOf;
    delete next.splitPanelSide;
    try {
      W().applyRemoteTabOp(wsId, { kind: "open", tab: next });
    } catch (_) {
      return null;
    }
    const live = liveTab(wsId, next.id);
    if (live) dupTabs.set(live.id, { ...live });
    return live;
  }

  // Another open tab of the same canvas in that workspace.
  const hasTwin = (wsId, tab) =>
    wsTabs(wsId).some((x) => x && x.id !== tab.id && x.type === "canvas" && x.pageFolderPath === tab.pageFolderPath);

  // A duplicate the dock opened leaves the pane and the store (undo of its step);
  // reopenDuplicate (redo) puts the same tab back.
  function closeDuplicate(desc) {
    const id = tabIdOf(desc);
    PQ().attach(desc.id);
    try {
      W().applyRemoteTabOp(desc.workspaceId, { kind: "close", tabId: id });
    } catch (_) {}
    if (!liveTab(desc.workspaceId, id)) dupParked.add(id);
  }
  function reopenDuplicate(wsId, id) {
    const tab = dupTabs.get(id);
    if (!tab || !dupParked.has(id) || !canDuplicate(wsId)) return null;
    try {
      W().applyRemoteTabOp(wsId, { kind: "open", tab: { ...tab } });
    } catch (_) {
      return null;
    }
    dupParked.delete(id);
    return liveTab(wsId, id);
  }

  // A new tab for the canvas `live` goes where a drop would put it: into pane
  // `target` (zone "center") or a new pane on `zone`'s side of `target` (a pane or
  // "main"). Undoable like a move or a split.
  function duplicateTo(target, zone, live) {
    if (!currentWs || !live || live.type !== "canvas" || !["left", "right", "top", "bottom", "center"].includes(zone)) return false;
    if (zone !== "center" && soloNow()) setSolo(null);
    if (zone === "center" ? !panels.has(target) : target !== "main" && !panels.has(target)) return false;
    const dup = duplicateCanvasTab(currentWs, live);
    if (!dup) return false;
    const d = descFor(currentWs, dup);
    record(zone === "center" ? "move" : "split");
    let panel = panels.get(target);
    if (zone !== "center") {
      panel = makePanel(currentWs);
      layouts.set(currentWs, insertBeside(layouts.get(currentWs) || leaf("main"), target, panel.id, zone));
    }
    moveInto(panel, d);
    PQ().select(panel.popup, d.id);
    // hide it in the center tab bar now, not on the next tick
    outIds = transferredIds();
    dirty = true;
    if (host && dynStyle) relayout();
    schedule();
    return true;
  }

  // Before a pane "+" runs Open...: the canvas tabs on screen get pinned (the app's
  // pinTab), since openCanvasTab without pin replaces the chat's unpinned canvas
  // tab in place.
  function pinShownCanvases() {
    const st = W();
    if (typeof st.pinTab !== "function") return;
    const ids = centerShown(st);
    for (const d of PQ().tabs) if (isCenterKind(d) && d.workspaceId === currentWs) ids.add(tabIdOf(d));
    for (const t of st.centerTabs || []) {
      if (!t || t.type !== "canvas" || t.isPinned || !ids.has(t.id)) continue;
      try {
        st.pinTab(t.id);
      } catch (_) {}
    }
  }

  function panelOfDesc(id) {
    const t = PQ().tabs.find((x) => x.id === id);
    if (!t) return null;
    for (const p of panels.values()) if (p.popup === t.popup) return p;
    return null;
  }

  // Revalidates the descriptor against the store (the dataTransfer one may be stale).
  function freshDesc(d) {
    if (!d || !KINDS.includes(d.kind)) return null;
    if (!isCenterKind(d)) return plainDesc(d);
    const live = liveTab(d.workspaceId, tabIdOf(d));
    return live && dockable(live) ? descFor(d.workspaceId, live) : null;
  }

  function canDrop(target, zone, d) {
    if (!d || (isCenterKind(d) && d.workspaceId !== currentWs)) return false;
    const inPq = PQ().tabs.some((t) => t.id === d.id);
    const from = panelOfDesc(d.id);
    if (zone === "center") {
      if (target === "main") return inPq;
      return !from || from.id !== target;
    }
    if (from && from.id === target && tabsOf(from).length === 1) return false; // split of itself
    if (target === "main" && !inPq && !from && mainTabCount() <= 1) return false;
    return true;
  }

  function performDrop(target, zone, raw) {
    const d = freshDesc(raw);
    if (!d || !canDrop(target, zone, d)) return false;
    if (zone !== "center" && soloNow()) setSolo(null); // the new pane shows next to the others
    const root = layouts.get(currentWs) || leaf("main");
    if (zone === "center") {
      if (target === "main") {
        record("move");
        returnToMain(d);
      } else {
        const panel = panels.get(target);
        if (!panel) return false;
        record("move");
        if (!PQ().tabs.some((t) => t.id === d.id)) leaveNativeSplitFor([d]);
        moveInto(panel, d);
      }
    } else {
      record("split");
      if (!PQ().tabs.some((t) => t.id === d.id)) leaveNativeSplitFor([d]);
      const panel = makePanel(currentWs);
      layouts.set(currentWs, insertBeside(root, target, panel.id, zone));
      moveInto(panel, d);
    }
    dirty = true;
    schedule();
    return true;
  }

  // ----------------------------------------------------------------- render
  // The "main" leaf is the visible route view in #workspace-center (chat center,
  // design, docs or issues); the hidden routes and the app's overlays are skipped.
  function findMain() {
    if (!host) return null;
    for (const c of host.children) {
      if (c === layerEl || c === dndEl || c.getAttribute("data-testid") === "browser-tab-host") continue;
      if (c.classList.contains("hidden") || c.classList.contains("absolute") || c.classList.contains("pointer-events-none")) continue;
      if (c.getClientRects().length) return c;
    }
    return null;
  }

  function mainTabCount() {
    if (!mainNode) return 0;
    const cp = mainNode.querySelector(CENTER);
    const sel = cp ? '[data-testid$="-tab-drop-zone"] [role="tab"], [data-testid="document-tab-bar"] [role="tab"]' : '[role="tab"]';
    return Array.from((cp || mainNode).querySelectorAll(sel)).filter(
      (t) => (t.offsetWidth > 0 || t === lifted) && !outIds.includes(t.getAttribute("data-tab-id")),
    ).length;
  }

  function headerHeight(id) {
    if (id === "main") {
      if (!mainNode) return HEADER_FALLBACK;
      const zone = mainNode.querySelector(`${CENTER} [data-testid$="-tab-drop-zone"]`);
      // Topmost visible tab bar of the route view (design also has inner tablists).
      const lists = [...mainNode.querySelectorAll('[role="tablist"]')].filter((t) => t.offsetWidth > 0);
      lists.sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top);
      const bar = zone || lists[0];
      if (!bar) return HEADER_FALLBACK;
      const h = bar.getBoundingClientRect().bottom - mainNode.getBoundingClientRect().top + (zone ? 0 : 8);
      return h > 0 && h < 120 ? Math.round(h) : HEADER_FALLBACK;
    }
    const p = panels.get(id);
    const h = p && p.el.querySelector("header");
    return (h && h.offsetHeight) || HEADER_FALLBACK;
  }

  // A change of the layout's shape eases in (see the header): the class is on for
  // the frame that places the new rects and a little longer than the transition.
  let shapeSeen = null; // { sig, size, ws, deck }
  let animTimer = 0;
  function easeShape(root, hidden) {
    const sig = JSON.stringify(root) + "|" + [...hidden].sort().join();
    const now = { sig, size: `${host.clientWidth}x${host.clientHeight}`, ws: currentWs, deck: decksOf(currentWs).active };
    const prev = shapeSeen;
    shapeSeen = now;
    if (!prev || prev.sig === sig || prev.size !== now.size || prev.ws !== now.ws || prev.deck !== now.deck) return;
    if (resizing || drag || reducedMotion()) return;
    host.classList.add("rtd-anim");
    clearTimeout(animTimer);
    animTimer = setTimeout(() => {
      if (host) host.classList.remove("rtd-anim");
      dirty = true; // the center's eased-out rect (last pane gone) is let go
      schedule();
    }, 260);
  }

  function relayout() {
    if (!host || !currentWs) return;
    const root = layouts.get(currentWs) || leaf("main");
    const ids = leaves(root);
    const hasPanels = ids.some((id) => id !== "main" && panels.has(id));
    const hidden = new Set();
    if (hasPanels && mainEmpty) hidden.add("main");
    const s = solos.get(currentWs);
    if (s && (!ids.includes(s) || hidden.has(s) || !hasPanels || (s !== "main" && !panels.has(s)))) {
      solos.delete(currentWs); // the solo leaf went (closed, another deck, the center emptied)
      emit("rtd:solo-changed", { wsId: currentWs, pane: null });
    } else if (s) for (const id of ids) if (id !== s) hidden.add(id);
    easeShape(root, hidden);
    const L = computeLayout(root, host.clientWidth, host.clientHeight, hidden);
    lastLayout = L;
    hiddenNow = hidden;
    for (const p of panels.values()) {
      const r = p.wsId === currentWs ? L.rects.get(p.id) : null;
      if (!r) {
        p.el.style.display = "none";
        continue;
      }
      p.el.style.display = "";
      place(p.el, r);
    }
    const m = L.rects.get("main");
    const sel = "#workspace-center > [data-rtd-main]";
    const hideTabs = outIds.concat(deckHidden, parkedIds()).map((id) => `${CENTER} [role="tab"][data-tab-id="${CSS.escape(id)}"]{display:none!important}`).join("");
    dynStyle.textContent =
      hideTabs +
      (!hasPanels
        ? host.classList.contains("rtd-anim")
          ? // the last pane went: the center eases out to the whole area, then flows again
            `${sel}{position:absolute!important;left:0px!important;top:0px!important;width:${host.clientWidth}px!important;height:${host.clientHeight}px!important;overflow:hidden!important}`
          : ""
        : !m
          ? `${sel}{visibility:hidden!important;pointer-events:none!important}`
          : `${sel}{position:absolute!important;left:${m.x}px!important;top:${m.y}px!important;width:${m.w}px!important;height:${m.h}px!important;overflow:hidden!important}`);
    layerEl.classList.toggle("rtd-on", hasPanels);
    renderDividers(L.dividers);
    // The cover goes up from the tick only: a layout made inside an action (a deck
    // switch, a new deck) runs before the app draws the deck's tab, and would
    // flash it over the tab drawn right after. The tick that follows decides.
    const cover = !!m && coverWanted();
    if (!cover || ticking || (coverEl && !coverEl.hidden)) syncCover(cover ? m : null);
    else {
      dirty = true;
      schedule();
    }
    if (floats.size) placeFloats(); // canvas popovers follow their pane's new rect
    if (phStrips.size || phBodies.size) renderPlaceholders();
  }

  // The center bar shows no tab while the app still renders an active tab below
  // it, in two cases:
  //   - a deck with none of its tabs in the center bar (a new deck, or its last
  //     center tab closed or moved) while the workspace has tabs in other decks:
  //     the app's active tab is another deck's;
  //   - the app's active tab is a chat whose tab was closed with tab-close's ×
  //     (the bar's last tab, or the app falling back to that chat after its
  //     other tabs closed): the app always keeps an active chat, so tab-close
  //     keeps its tab hidden and reports the center as parked
  //     (__RE_TEMPO_TAB_CLOSE__.parked(ws)) until a tab is opened ("+", a tab of
  //     the bar, a sidebar row, this cover's button).
  // This cover hides that content; the bar and its "+" stay usable. A workspace
  // with no tab at all keeps the app's own empty view (nothing is hidden there).
  // It never stands over a tab: while the center bar shows one (or a placeholder
  // holds the center) there is no cover, and the tick checks that on every pass
  // (not only when the layout changes). It used to be decided only by relayout(),
  // which the tick runs when something is dirty: a layout made in the same task
  // as an action, before the app drew its new tab (a deck switch, a new deck), or
  // while mainEmpty stands still (a placeholder holding the center, a drag), put
  // it up over a tab that showed a moment later; a new chat from "+", the
  // sidebar or this cover's own button then changed nothing the tick watched, so
  // the cover stayed over every chat opened after it.
  function coverWanted() {
    if (mainTabCount() > 0 || centerHolds()) return false;
    return centerParked() || deckHidden.length > 0;
  }
  function centerParked() {
    try {
      const tc = window.__RE_TEMPO_TAB_CLOSE__;
      return !!(currentWs && tc && typeof tc.parked === "function" && tc.parked(currentWs));
    } catch (_) {
      return false;
    }
  }
  function syncCover(r) {
    if (!r || !host) {
      if (coverEl) coverEl.hidden = true;
      return;
    }
    if (!coverEl) {
      coverEl = el("rtd-empty");
      coverEl.hidden = true;
      const title = el("rtd-empty-title");
      const hint = el("rtd-empty-hint");
      const btn = el("rtd-empty-btn", "button");
      btn.type = "button";
      btn.textContent = "New chat";
      btn.addEventListener("click", () => {
        if (currentWs) openChatHere(currentWs);
      });
      coverEl.append(title, hint, btn);
    }
    if (coverEl.parentElement !== host) host.appendChild(coverEl);
    const deckCase = deckHidden.length > 0 && !centerParked();
    const [titleText, hintText] = deckCase
      ? ["Empty deck", "Tabs you open here stay in this deck."]
      : ["No open tabs", "Open a chat from the sidebar, or a new tab with +."];
    if (coverEl.children[0].textContent !== titleText) coverEl.children[0].textContent = titleText;
    if (coverEl.children[1].textContent !== hintText) coverEl.children[1].textContent = hintText;
    const top = Math.min(headerHeight("main"), r.h);
    place(coverEl, { x: r.x, y: r.y + top, w: r.w, h: r.h - top });
    const st = W();
    const a = centerActions();
    coverEl.lastChild.hidden = !(typeof st.createChatTab === "function" || (a && typeof a.onNewChat === "function"));
    if (coverEl.hidden) {
      coverEl.hidden = false;
      // Typing would go on into the hidden tab (another deck's chat composer).
      const f = document.activeElement;
      if (f instanceof HTMLElement && mainNode && mainNode.contains(f) && !f.closest('[role="tablist"], [data-tab-bar]')) f.blur();
    }
  }

  function renderDividers(list) {
    const pos = (n, d) =>
      place(n, d.row ? { x: d.x - (HIT - GAP) / 2, y: d.y, w: HIT, h: d.len } : { x: d.x, y: d.y - (HIT - GAP) / 2, w: d.len, h: HIT });
    if (resizing && divEls.length === list.length) {
      list.forEach((d, i) => pos(divEls[i], d)); // keep the elements while dragging
      return;
    }
    divEls.forEach((n) => n.remove());
    divEls = list.map((d) => {
      const n = el(`rtd-divider ${d.row ? "rtd-divider-v" : "rtd-divider-h"}`);
      pos(n, d);
      n.addEventListener("pointerdown", (e) => startResize(e, d, n));
      layerEl.appendChild(n);
      return n;
    });
  }

  function startResize(e, d, handle) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const start = d.row ? e.clientX : e.clientY;
    const za = d.node.z[d.a];
    const zb = d.node.z[d.b];
    const k = d.sum / d.avail; // fraction per px
    const min = MIN_PX * k;
    resizing = { handle };
    handle.classList.add("rtd-active");
    dndEl.classList.add("rtd-resizing");
    dndEl.dataset.dir = d.row ? "v" : "h";
    try {
      handle.setPointerCapture(e.pointerId);
    } catch (_) {}
    const move = (ev) => {
      const total = za + zb;
      if (total < 2 * min) return;
      const next = Math.min(total - min, Math.max(min, za + ((d.row ? ev.clientX : ev.clientY) - start) * k));
      d.node.z[d.a] = next;
      d.node.z[d.b] = total - next;
      relayout();
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      handle.classList.remove("rtd-active");
      dndEl.classList.remove("rtd-resizing");
      resizing = null;
      relayout();
      save();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }

  // --------------------------------------------------------------- tab drag
  function zoneAt(r, x, y) {
    const px = (x - r.x) / r.w;
    const py = (y - r.y) / r.h;
    const m = Math.min(px, 1 - px, py, 1 - py);
    if (m >= EDGE) return "center";
    if (m === px) return "left";
    if (m === 1 - px) return "right";
    if (m === py) return "top";
    return "bottom";
  }

  function hintRect(r, zone) {
    const hw = Math.round(r.w / 2);
    const hh = Math.round(r.h / 2);
    if (zone === "left") return { x: r.x, y: r.y, w: hw, h: r.h };
    if (zone === "right") return { x: r.x + r.w - hw, y: r.y, w: hw, h: r.h };
    if (zone === "top") return { x: r.x, y: r.y, w: r.w, h: hh };
    if (zone === "bottom") return { x: r.x, y: r.y + r.h - hh, w: r.w, h: hh };
    return r;
  }

  // Tabs the app does not let you transfer (terminal, agent...) only set
  // tempo-tab-id on drag; the popout renderer draws them too, so they can dock.
  const dockable = (t) => t.type !== "mcp";

  // Tab id -> descriptor: "chat:"/"center:" ids are tabs already in a pane,
  // anything else is a center tab of the current workspace.
  function descFromTabId(id) {
    if (!id || !currentWs) return null;
    if (/^(chat|center):/.test(id)) return PQ().tabs.find((t) => t.id === id) || null;
    const live = liveTab(currentWs, id);
    return live && dockable(live) ? descFor(currentWs, live) : null;
  }

  function readDesc(dt) {
    try {
      const d = JSON.parse(dt.getData(VIEW_TAB) || "null");
      if (d && typeof d.id === "string") return d;
    } catch (_) {}
    return descFromTabId(dt.getData("tempo-tab-id"));
  }

  function onDragStart(e) {
    const dt = e.dataTransfer;
    const types = Array.from((dt && dt.types) || []);
    if (destroyed || !S.pq || !S.ws) return;
    // Native descriptor from dataTransfer when the tab bar already filled it (this
    // listener is re-added after React's); otherwise the tab from the DOM. When the
    // script loads before the bundle, the first listener runs before React's handler.
    let d = null;
    try {
      if (types.includes(VIEW_TAB) || types.includes("tempo-tab-id")) d = readDesc(dt);
      if (!d) {
        const tabEl = e.target && e.target.closest ? e.target.closest('[role="tab"][data-tab-id]') : null;
        d = tabEl ? descFromTabId(tabEl.getAttribute("data-tab-id")) : null;
      }
    } catch (_) {
      d = null;
    }
    if (!d || !KINDS.includes(d.kind) || !host || !host.isConnected || !currentWs || !mainNode) return;
    const srcEl = e.target && e.target.closest ? e.target.closest('[role="tab"]') : null;
    closeAddMenu(false);
    const from = panelOfDesc(d.id);
    // Source leaf: a reorder inside it gets no destination outline.
    drag = { desc: d, srcEl, srcW: srcEl ? srcEl.getBoundingClientRect().width : 140, srcLeaf: from ? from.id : isCenterKind(d) ? "main" : null };
    dragDepth = 0;
    // Outside dragstart itself: touching the DOM during it can cancel the drag.
    setTimeout(() => {
      if (drag) showCatchers();
    }, 0);
  }

  // Catchers cover each pane's body (below its tab bar) while dragging, above the
  // webviews. They have no listeners: the window's drag listeners read them.
  const catcherBoxes = new Map(); // leaf id -> { full, content } (host coordinates)

  function showCatchers() {
    relayout();
    dndEl.replaceChildren(targetEl, hintEl, ghostEl, markerEl);
    clearTarget();
    catcherBoxes.clear();
    for (const [id, r] of lastLayout.rects) {
      const hh = Math.min(headerHeight(id), r.h - 40);
      const c = el("rtd-catcher");
      c.dataset.leaf = id;
      const content = { x: r.x, y: r.y + hh, w: r.w, h: r.h - hh };
      place(c, content);
      catcherBoxes.set(id, { full: r, content });
      dndEl.appendChild(c);
    }
    dndEl.classList.add("rtd-dragging");
  }

  // ------------------------------------------------------- tab bar preview
  // Over a tab bar the dock handles, the bar opens a slot where the tab will land,
  // like Chrome: the tabs after the slot slide right, a translucent copy of the
  // dragged tab fills the slot and a 2px marker (the app's own marker shape) sits
  // in the gap before it. Dragging inside its own bar lifts the tab out of it, so
  // the bar never shows it twice. The list gets room for the slot first (its
  // width follows its content, so a slid tab would be clipped), and positions are
  // read from the layout with the current slide removed, so a slide in progress
  // never moves the slot under the pointer.
  let barPreview = null; // { bar, list, leafId, panelId, own, slotW, index, beforeId, lastId, key }
  let lifted = null; // source tab hidden while the pointer is over its own bar
  const MARK_W = 2;
  const MARK_H = 20; // the app's tab bar marker is h-5 w-0.5, centered on the row

  function translateX(n) {
    const t = getComputedStyle(n).transform;
    if (!t || t === "none") return 0;
    try {
      return new DOMMatrixReadOnly(t).m41;
    } catch (_) {
      return 0;
    }
  }

  function clearBarPreview() {
    if (barPreview) {
      barPreview.list.removeAttribute("data-rtd-slot");
      barPreview.bar.removeAttribute("data-rtd-shifting");
    }
    barPreview = null;
    for (const t of document.querySelectorAll("[data-rtd-shift]")) t.removeAttribute("data-rtd-shift");
    if (lifted) lifted.removeAttribute("data-rtd-lift");
    lifted = null;
    if (dragStyle) dragStyle.textContent = "";
    for (const n of [ghostEl, markerEl]) if (n) n.removeAttribute("data-on");
  }

  // Tab bar under the pointer, and whether the dock or the app handles the drop:
  // pane bars and tabs coming back to the chat center (or reordered in its bar)
  // are the dock's; other bars keep the app's own drop and get no preview.
  function barUnder(e) {
    const t = e.target;
    if (!drag || !t || !t.closest || t.closest(".rtd-dnd")) return null;
    const panelEl = t.closest(".rtd-panel");
    if (panelEl) {
      // Above the catcher only the pane's header is reachable (its "+" and split button sit in it).
      const bar = t.closest("header") || panelEl.querySelector("header");
      const id = panelEl.getAttribute("data-rtd-panel");
      return bar ? { bar, leaf: id, leafId: "panel", panelId: id, own: true } : null;
    }
    if (!mainNode || !mainNode.contains(t)) return null;
    const bar = t.closest('[data-testid$="-tab-drop-zone"], [data-testid$="tab-bar"]');
    if (!bar) return null;
    const onCenter = !!bar.closest(CENTER) && isCenterKind(drag.desc);
    const fromPanel = !!panelOfDesc(drag.desc.id);
    const sameBar = !!(drag.srcEl && bar.contains(drag.srcEl));
    return { bar, leaf: "main", leafId: "main", panelId: null, own: onCenter && (fromPanel || sameBar) };
  }

  // The tab bar of a leaf, as barUnder() returns it, for a drop on the leaf's body.
  function barOfLeaf(id) {
    if (id === "main") {
      const zone = mainNode && mainNode.querySelector(`${CENTER} [data-testid$="-tab-drop-zone"]`);
      const bar = zone && (zone.querySelector('[data-testid$="tab-bar"]') || zone);
      return bar ? { bar, leaf: "main", leafId: "main", panelId: null, own: true } : null;
    }
    const p = panels.get(id);
    const bar = p && p.el.querySelector("header");
    return bar ? { bar, leaf: id, leafId: "panel", panelId: id, own: true } : null;
  }

  // Visible tabs of a list at their layout position (slide transform removed).
  function layoutTabs(list) {
    return [...list.querySelectorAll('[role="tab"]')]
      .filter((t) => t.offsetWidth > 0)
      .map((t) => {
        const r = t.getBoundingClientRect();
        const dx = translateX(t);
        return { el: t, id: t.getAttribute("data-tab-id"), left: r.left - dx, right: r.right - dx, top: r.top, height: r.height };
      });
  }

  function openSlot(hit, list) {
    clearBarPreview();
    void markerEl.offsetWidth; // hidden for a frame: the marker does not glide in from another bar
    if (drag.srcEl && list.contains(drag.srcEl)) {
      drag.srcEl.setAttribute("data-rtd-lift", "");
      lifted = drag.srcEl;
    }
    const cs = getComputedStyle(list);
    const gap = parseFloat(cs.columnGap) || 4;
    const slotW = Math.round(Math.min(240, Math.max(80, drag.srcW || 140)));
    const pad = (parseFloat(cs.paddingRight) || 0) + slotW + gap;
    dragStyle.textContent =
      `[data-rtd-shift]{transform:translateX(${slotW + gap}px)!important}` + `[data-rtd-slot]{padding-right:${pad}px!important}`;
    list.setAttribute("data-rtd-slot", "");
    hit.bar.setAttribute("data-rtd-shifting", "");
    hintEl.removeAttribute("data-on");
    ghostEl.firstChild.textContent = drag.desc.title || "Tab";
    ghostEl.setAttribute("data-rtd-type", typeOfDesc(drag.desc));
    barPreview = { bar: hit.bar, list, leafId: hit.leafId, panelId: hit.panelId, own: hit.own, slotW, index: -1, beforeId: null, lastId: null, key: "" };
  }

  // ------------------------------------------------------------ drop target
  // Moving a tab into a pane has one affordance and one drop, over the pane's tab
  // bar or over its body: the bar opens the slot (under the pointer over the bar,
  // at the end over the body), the pane gets a 1px accent outline and the drop
  // goes through dropOnBar(). The body's edges are another action (a new split)
  // and keep the half-pane preview. Returns true while the dock owns the target;
  // the window listener then stops the event, so the app's own drag-over marker
  // (the ::before of the tab under the pointer) never shows next to the slot.
  let bodyDrop = null; // { id, zone } on a body: a split, or a move into a pane without a bar

  function trackDrag(e) {
    const plus = plusAt(e);
    if (plus) return overPlus(e, plus);
    if (plusHover) clearPlus();
    const t = e.target;
    const c = t && t.closest ? t.closest(".rtd-catcher") : null;
    return c && dndEl && dndEl.contains(c) ? overBody(e, c) : overBar(e);
  }

  function overBar(e) {
    const hit = barUnder(e);
    const list = hit && hit.own ? hit.bar.querySelector('[role="tablist"]') : null;
    if (!list) {
      clearTarget();
      return false;
    }
    showSlot(e, hit, list, false);
    return true;
  }

  function overBody(e, c) {
    const id = c.dataset.leaf;
    const box = catcherBoxes.get(id);
    const hb = host.getBoundingClientRect();
    const zone = box ? zoneAt(box.content, e.clientX - hb.left, e.clientY - hb.top) : null;
    if (!box || !canDrop(id, zone, freshDesc(drag.desc))) {
      clearTarget();
      return false; // no preventDefault: the drop is not accepted here
    }
    if (zone === "center") {
      const hit = barOfLeaf(id);
      const list = hit && hit.bar.querySelector('[role="tablist"]');
      if (list) {
        showSlot(e, hit, list, true);
        return true;
      }
    }
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (barPreview || lifted) clearBarPreview();
    bodyDrop = { id, zone };
    if (zone === "center") {
      hintEl.removeAttribute("data-on");
      showOutline(id);
    } else {
      hideOutline();
      place(hintEl, hintRect(box.full, zone));
      hintEl.dataset.zone = zone;
      hintEl.setAttribute("data-on", "");
    }
    return true;
  }

  function showOutline(id) {
    const r = lastLayout.rects.get(id);
    if (!r) return hideOutline();
    if (targetEl.dataset.leaf !== id) {
      place(targetEl, r);
      targetEl.dataset.leaf = id;
    }
    targetEl.setAttribute("data-on", "");
  }

  function hideOutline() {
    if (!targetEl) return;
    targetEl.removeAttribute("data-on");
    delete targetEl.dataset.leaf;
  }

  function clearTarget() {
    if (barPreview || lifted) clearBarPreview();
    clearPlus();
    bodyDrop = null;
    hideOutline();
    if (hintEl) hintEl.removeAttribute("data-on");
  }

  function showSlot(e, hit, list, atEnd) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    bodyDrop = null;
    hintEl.removeAttribute("data-on");
    // Same list, same slot: going from the bar to the body only moves it to the end.
    if (!barPreview || barPreview.list !== list) openSlot(hit, list);
    if (hit.leaf !== drag.srcLeaf) showOutline(hit.leaf);
    else hideOutline(); // a reorder inside the tab's own pane
    const cs = getComputedStyle(list);
    const gap = parseFloat(cs.columnGap) || 4;
    const tabs = layoutTabs(list);
    let index = tabs.length;
    if (!atEnd) {
      for (let i = 0; i < tabs.length; i++) {
        if (e.clientX < (tabs[i].left + tabs[i].right) / 2) {
          index = i;
          break;
        }
      }
    }
    // The center bar always shows the active chat first, and a chat dropped there becomes it.
    if (hit.leafId === "main") {
      if (drag.desc.kind === "chat") index = 0;
      else if (tabs.length && tabs[0].id === W().activeChatTabId) index = Math.max(1, index);
    }
    const lr = list.getBoundingClientRect();
    const slotL =
      index < tabs.length ? tabs[index].left : tabs.length ? tabs[tabs.length - 1].right + gap : lr.left + (parseFloat(cs.paddingLeft) || 0);
    const rowTop = tabs.length ? tabs[0].top : lr.top + Math.max(0, (lr.height - 28) / 2);
    const rowH = tabs.length ? tabs[0].height : Math.min(28, lr.height);
    // Re-applied on every dragover: a tab element the app re-creates comes back unshifted.
    tabs.forEach((t, i) => t.el.toggleAttribute("data-rtd-shift", i >= index));
    const key = `${index}|${Math.round(slotL)}|${Math.round(rowTop)}|${Math.round(lr.right)}|${tabs.length}`;
    if (barPreview.key === key) return;
    const hb = host.getBoundingClientRect();
    const gl = Math.max(slotL, lr.left);
    const gr = Math.min(slotL + barPreview.slotW, lr.right);
    place(ghostEl, { x: Math.round(gl - hb.left), y: Math.round(rowTop - hb.top), w: Math.max(0, Math.round(gr - gl)), h: Math.round(rowH) });
    const mh = Math.min(MARK_H, rowH);
    place(markerEl, {
      x: Math.round(slotL - gap / 2 - MARK_W / 2 - hb.left),
      y: Math.round(rowTop + (rowH - mh) / 2 - hb.top),
      w: MARK_W,
      h: Math.round(mh),
    });
    for (const n of [ghostEl, markerEl]) n.setAttribute("data-on", "");
    Object.assign(barPreview, {
      index,
      key,
      beforeId: index < tabs.length ? tabs[index].id : null,
      lastId: tabs.length ? tabs[tabs.length - 1].id : null,
    });
  }

  // Drop on a bar the dock handles: move the tab there (pane or center) and put it
  // at the marked slot.
  function dropOnBar(p, d) {
    const pq = PQ();
    if (p.leafId === "panel") {
      const panel = panels.get(p.panelId);
      if (!panel) return;
      if (!tabsOf(panel).some((t) => t.id === d.id)) {
        record("move");
        if (!pq.tabs.some((t) => t.id === d.id)) leaveNativeSplitFor([d]);
        moveInto(panel, d);
      }
      const list = tabsOf(panel);
      const idx = list.findIndex((t) => t.id === d.id);
      const before = p.beforeId ? list.findIndex((t) => t.id === p.beforeId) : -1;
      const to = before < 0 ? list.length - 1 : before > idx ? before - 1 : before;
      if (idx >= 0 && to !== idx) PQ().reorder(panel.popup, idx, to);
      PQ().select(panel.popup, d.id);
    } else {
      if (pq.tabs.some((t) => t.id === d.id)) {
        record("move");
        returnToMain(d);
      }
      const st = W();
      const ids = (st.centerTabs || []).map((t) => t.id);
      const from = ids.indexOf(tabIdOf(d));
      if (from >= 0 && typeof st.reorderTabs === "function") {
        const bi = p.beforeId ? ids.indexOf(p.beforeId) : -1;
        const li = p.lastId ? ids.indexOf(p.lastId) : -1;
        const to = bi >= 0 ? (bi > from ? bi - 1 : bi) : li >= 0 ? (li > from ? li : li + 1) : from;
        if (to !== from) st.reorderTabs(from, to);
      }
    }
    dirty = true;
    schedule();
  }

  function endDrag() {
    drag = null;
    dragDepth = 0;
    clearTarget();
    catcherBoxes.clear();
    if (!dndEl) return;
    dndEl.classList.remove("rtd-dragging");
    dndEl.replaceChildren();
  }

  // The popout tab bar only shows the label; tag the type so CSS can add the icon.
  function decorateTabs() {
    const types = new Map(PQ().tabs.map((t) => [t.id, typeOfDesc(t)]));
    for (const p of panels.values()) {
      if (p.wsId !== currentWs) continue;
      for (const tab of p.el.querySelectorAll('[role="tab"][data-tab-id]')) {
        const type = types.get(tab.getAttribute("data-tab-id")) || "";
        if (tab.getAttribute("data-rtd-type") !== type) tab.setAttribute("data-rtd-type", type);
      }
    }
  }

  // ------------------------------------------------- pane header buttons
  // The popout header has the tab bar ([data-tab-bar] > [role=tablist]) and no
  // "+" of its own. As in the center, the "+" goes right after the tab list
  // (outside the scrolling list, so it follows the last tab and stays in view
  // when the tabs overflow) and "Open in split view" at the header's end. React
  // does not own these nodes: a re-render that drops them (a new header) gets them
  // back on the next tick. Without a tab bar they float in the pane's corner.
  function placeChrome() {
    for (const p of panels.values()) {
      if (p.wsId !== currentWs) continue;
      const bar = p.el.querySelector("header [data-tab-bar]");
      const list = bar && bar.querySelector('[role="tablist"]');
      const head = list && bar.closest("header");
      if (head) {
        if (list.nextElementSibling !== p.add) list.after(p.add);
        // last in the header; a focused button is not moved for a sibling React added after it
        if (p.split.parentElement !== head || (head.lastElementChild !== p.split && document.activeElement !== p.split)) head.appendChild(p.split);
        if (p.solo.nextElementSibling !== p.split && document.activeElement !== p.solo) p.split.before(p.solo);
      } else {
        if (p.add.parentElement !== p.el) p.el.appendChild(p.add);
        if (p.split.parentElement !== p.el) p.el.appendChild(p.split);
        if (p.solo.parentElement !== p.el) p.el.appendChild(p.solo);
      }
      const src = splitSource(p);
      const off = String(!src);
      if (p.split.getAttribute("aria-disabled") !== off) p.split.setAttribute("aria-disabled", off);
      const title = src && src.dup ? "Duplicate in split view" : "Open in split view";
      if (p.split.title !== title) {
        p.split.title = title;
        p.split.setAttribute("aria-label", title);
      }
    }
  }

  // What "Open in split view" does with the pane's active tab: { desc, dup }. It
  // moves the tab to a new pane on the right; a canvas that is the pane's only tab
  // (or the active canvas with ⌥) is duplicated there instead, as the center's
  // "Duplicate Active Tab" does. Any other single tab cannot split its own pane
  // (canDrop), so the button is disabled.
  function splitSource(p, copy = false) {
    const mine = tabsOf(p);
    if (!mine.length) return null;
    const active = PQ().activeByPopup[p.name];
    const t = mine.find((x) => x.id === active) || mine[mine.length - 1];
    if (isCanvasDesc(t) && (copy || mine.length < 2) && canDuplicate(p.wsId)) return { desc: t, dup: true };
    return mine.length < 2 ? null : { desc: t, dup: false };
  }

  // Same path as a drop of that tab on the pane's right edge: a new pane on its
  // right (with a new tab for a duplicated canvas).
  function splitPane(panelId, copy = false) {
    const p = panels.get(panelId);
    const src = p && p.wsId === currentWs ? splitSource(p, copy) : null;
    if (!src) return false;
    if (src.dup) return duplicateTo(p.id, "right", liveTab(currentWs, tabIdOf(src.desc)));
    return performDrop(p.id, "right", src.desc);
  }

  // ------------------------------------------------------- pane "+" menu
  // The same items as the center's "+" panel, with the app's menu classes. Each
  // item calls the center tab bar's own action (read from its React props): the
  // tab opens in the center as usual, and captureAdded() moves the tab it opened
  // into the pane. "Open" is the app's picker for canvases, docs, issues and
  // files, so the capture waits while a dialog that appeared after the click is up.
  const ICON = {
    plus: "<path d='M5 12h14'/><path d='M12 5v14'/>",
    chat: "<path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/>",
    canvas: "<rect width='7' height='7' x='3' y='3' rx='1'/><rect width='7' height='7' x='14' y='3' rx='1'/><rect width='7' height='7' x='14' y='14' rx='1'/><rect width='7' height='7' x='3' y='14' rx='1'/>",
    doc: "<path d='M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'/><path d='M14 2v4a2 2 0 0 0 2 2h4'/><path d='M16 13H8'/><path d='M16 17H8'/><path d='M10 9H8'/>",
    issue: "<circle cx='12' cy='12' r='10'/><circle cx='12' cy='12' r='1'/>",
    terminal: "<path d='m7 11 2-2-2-2'/><path d='M11 13h4'/><rect width='18' height='18' x='3' y='3' rx='2'/>",
    browser: "<circle cx='12' cy='12' r='10'/><path d='M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20'/><path d='M2 12h20'/>",
    open: "<path d='m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2'/>",
    chevron: "<path d='m9 18 6-6-6-6'/>",
    columns: "<rect width='18' height='18' x='3' y='3' rx='2'/><path d='M12 3v18'/>", // the center's split toggle
  };
  function svg(paths, cls = "") {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
      `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${cls ? ` class="${cls}"` : ""}>${paths}</svg>`
    );
  }
  // act: the center tab bar prop the item calls.
  // New canvas first; the others plain names (what each item opens, no "New" prefix).
  const ADD_ITEMS = [
    { key: "canvas", label: "New canvas", act: "onNewCanvas", hint: "⇧C", icon: "canvas" },
    { key: "chat", label: "Chat", act: "onNewChat", hint: "C", icon: "chat" },
    { key: "prd", label: "Doc", act: "onNewPrd", hint: "D", icon: "doc" },
    { key: "issue", label: "Issue", act: "onNewIssue", hint: "I", icon: "issue" },
    { key: "terminal", label: "Terminal", act: "onNewTerminal", hint: "T", icon: "terminal" },
    { key: "browser", label: "Browser", act: "onNewBrowser", hint: "B", icon: "browser" },
    null,
    { key: "open", label: "Open", act: "onOpenFile", hint: "O", icon: "open" },
  ];
  const LETTERS = { d: "prd", i: "issue", t: "terminal", b: "browser", o: "open" };
  // The app's own menu classes (popup, item, separator, icon slot, shortcut).
  const MENU_CLS = "rtd-menu z-50 w-64 rounded-lg border border-border-primary bg-surface-menu px-1.5 py-1.5 shadow-dropdown outline-none";
  const ITEM_CLS =
    "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2.5 py-2 [font-size:var(--text-body)] [line-height:var(--leading-body)] " +
    "font-medium outline-none transition-colors data-[highlighted]:bg-surface-menu-hover data-[disabled]:pointer-events-none " +
    "data-[disabled]:text-text-tertiary data-[disabled]:opacity-50 text-text-secondary [[data-theme=light]_&]:text-text-primary";
  const SEP_CLS = "my-1.5 -mx-1.5 h-px bg-menu-divider";
  const ICON_CLS = "flex size-4 shrink-0 items-center justify-center text-text-tertiary [&_svg]:size-4";
  const HINT_CLS = "ml-auto pl-4 [font-size:var(--text-label)] [line-height:var(--leading-label)] tracking-widest text-text-tertiary";
  const ADD_QUICK_MS = 10000; // no dialog: the tab comes once the app has created it, or not at all
  const ADD_DIALOG_MS = 180000; // the picker (or the canvas dialog) is still up
  const ADD_AFTER_DIALOG_MS = 2500; // the dialog closed: its tab opens right after, if any

  let menu = null; // { el, panelId, btn, items }
  let pendingAdd = null; // { panelId, wsId, key, known, active, at, dialogsBefore, dialogSeen, dialogGoneAt }

  // A "+" item the app can run now: its action is there (and New Canvas has no
  // disabled reason).
  const plusItemOk = (acts, it) => !!acts && typeof acts[it.act] === "function" && !(it.key === "canvas" && acts.newCanvasDisabledReason);

  // The pane "+" New canvas is the center's: the canvas quick mod's newCanvas() (the
  // app's own New Canvas, which also notes the folder it made for that mod's empty
  // canvas cleanup); without that mod, the app's New Canvas itself. Either way the
  // new canvas tab is a new tab, which captureAdded() brings to the pane.
  const newCanvasApi = () => {
    const q = window.__RE_TEMPO_CANVAS_QUICK__;
    return q && typeof q.newCanvas === "function" ? q : null;
  };

  // The center tab bar's "+" actions, from the props of the "+" button's ancestors.
  function centerActions() {
    if (!mainNode) return null;
    const btn =
      mainNode.querySelector('[data-testid="center-panel-add-tab-button"]') || mainNode.querySelector(`${CENTER} [data-testid$="add-tab-button"]`);
    for (let f = fiberOf(btn), up = 0; f && up < 40; f = f.return, up++) {
      const p = f.memoizedProps;
      if (!p || typeof p !== "object") continue;
      if (p.newTabActions && typeof p.newTabActions.onNewChat === "function") return p.newTabActions;
      if (typeof p.onNewChat === "function" && typeof p.onOpenFile === "function") return p;
    }
    return null;
  }

  function highlight(b) {
    if (!menu) return;
    for (const n of menu.items) n.toggleAttribute("data-highlighted", n === b);
  }

  function toggleAddMenu(panelId, btn) {
    if (menu && menu.panelId === panelId) closeAddMenu(true);
    else openAddMenu(panelId, btn);
  }

  function openAddMenu(panelId, btn) {
    closeAddMenu(false);
    const acts = centerActions() || {};
    const box = el(MENU_CLS);
    box.setAttribute("role", "menu");
    box.setAttribute("aria-label", "New tab in this pane");
    box.tabIndex = -1;
    const items = [];
    for (const it of ADD_ITEMS) {
      if (!it) {
        const s = el(SEP_CLS);
        s.setAttribute("role", "separator");
        box.appendChild(s);
        continue;
      }
      const b = el(ITEM_CLS, "button");
      b.type = "button";
      b.tabIndex = -1;
      b.setAttribute("role", "menuitem");
      b.dataset.key = it.key;
      const reason = it.key === "canvas" ? acts.newCanvasDisabledReason : null;
      const ok = plusItemOk(acts, it);
      if (!ok) {
        b.setAttribute("data-disabled", "");
        b.setAttribute("aria-disabled", "true");
        if (reason) b.title = String(reason);
      }
      b.innerHTML =
        `<span class="${ICON_CLS}">${svg(ICON[it.icon])}</span><span class="min-w-0 truncate">${it.label}</span>` +
        (it.key === "open" ? svg(ICON.chevron, "ml-auto size-3 text-text-tertiary") : `<span class="${HINT_CLS}">${it.hint}</span>`);
      b.addEventListener("pointermove", () => highlight(b));
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (ok) runAdd(panelId, it);
      });
      box.appendChild(b);
      items.push(b);
    }
    box.addEventListener("keydown", onMenuKey);
    document.body.appendChild(box);
    // Under the button, left-aligned (as the center's "+" panel), kept inside the window.
    const r = btn.getBoundingClientRect();
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
    const top = r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6;
    box.style.position = "fixed";
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
    menu = { el: box, panelId, btn, items };
    btn.setAttribute("aria-expanded", "true");
    btn.setAttribute("data-open", "");
    const first = items.find((b) => !b.hasAttribute("data-disabled"));
    highlight(first);
    (first || box).focus();
    document.addEventListener("pointerdown", onMenuOutside, true);
    window.addEventListener("blur", onMenuBlur);
  }

  function closeAddMenu(restoreFocus) {
    if (!menu) return;
    const m = menu;
    menu = null;
    m.el.remove();
    m.btn.setAttribute("aria-expanded", "false");
    m.btn.removeAttribute("data-open");
    document.removeEventListener("pointerdown", onMenuOutside, true);
    window.removeEventListener("blur", onMenuBlur);
    if (restoreFocus && m.btn.isConnected) m.btn.focus();
  }

  function onMenuOutside(e) {
    if (menu && !menu.el.contains(e.target) && !menu.btn.contains(e.target)) closeAddMenu(false);
  }

  function onMenuBlur() {
    closeAddMenu(false);
  }

  // Arrows, Home/End, Enter/Space, Esc, and the "+" panel's letters (C, ⇧C, D, I, T, B; O for Open).
  function onMenuKey(e) {
    if (!menu) return;
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    const live = menu.items.filter((b) => !b.hasAttribute("data-disabled"));
    const cur = live.findIndex((b) => b.hasAttribute("data-highlighted"));
    const k = e.key;
    if (k === "Escape" || k === "Tab") {
      stop();
      closeAddMenu(true);
      return;
    }
    if (k === "ArrowDown" || k === "ArrowUp" || k === "Home" || k === "End") {
      stop();
      const n = live.length;
      if (!n) return;
      const i = k === "Home" ? 0 : k === "End" ? n - 1 : k === "ArrowDown" ? (cur + 1) % n : cur < 0 ? n - 1 : (cur - 1 + n) % n;
      highlight(live[i]);
      live[i].focus();
      return;
    }
    if (k === "Enter" || k === " ") {
      stop();
      if (live[cur]) live[cur].click();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const ch = k.toLowerCase();
    const key = ch === "c" ? (e.shiftKey ? "canvas" : "chat") : e.shiftKey ? null : LETTERS[ch];
    const b = key && live.find((x) => x.dataset.key === key);
    if (b) {
      stop();
      b.click();
    }
  }

  const openDialogs = () => [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter((n) => n.getClientRects().length);

  function runAdd(panelId, it) {
    closeAddMenu(false);
    const acts = centerActions();
    const fn = acts && acts[it.act];
    if (typeof fn !== "function" || !panels.has(panelId) || !currentWs) return false;
    const st = W();
    pendingAdd = {
      panelId,
      wsId: currentWs,
      key: it.key,
      known: new Set((st.centerTabs || []).map((t) => t.id)),
      active: st.activeCenterTabId || null,
      shown: centerShown(st), // tabs the center showed (a canvas there is duplicated, not moved)
      at: Date.now(),
      dialogsBefore: new Set(openDialogs()),
      dialogSeen: false,
      dialogGoneAt: 0,
    };
    const make = it.key === "canvas" && !acts.newCanvasDisabledReason ? newCanvasApi() : null;
    // a canvas opened without pin replaces the chat's unpinned canvas tab (tab-close pins
    // them all; this is for when it is not loaded)
    if (it.key === "open" || it.key === "canvas") pinShownCanvases();
    const p = pendingAdd;
    try {
      if (make)
        Promise.resolve(make.newCanvas()).then(
          (res) => {
            if (pendingAdd === p && (!res || res.via === "none")) pendingAdd = null;
          },
          () => {
            if (pendingAdd === p) pendingAdd = null;
          },
        );
      else fn();
    } catch (_) {
      pendingAdd = null;
      return false;
    }
    schedule();
    return true;
  }

  // The tab a pane "+" item opened: a new center tab or, when the item was already
  // open (a doc picked again), the center tab it activated. It moves into the pane,
  // and the center goes back to the tab it showed before.
  function captureAdded() {
    const p = pendingAdd;
    if (!p) return;
    const panel = panels.get(p.panelId);
    if (!panel || p.wsId !== currentWs) {
      pendingAdd = null;
      return;
    }
    const st = W();
    const now = Date.now();
    const tabs = st.centerTabs || [];
    // (not a duplicate the dock opened itself meanwhile)
    let t = tabs.find((x) => !p.known.has(x.id) && !dupTabs.has(x.id) && dockable(x) && !(x.type === "chat" && x.isArchived === true));
    if (!t && st.activeCenterTabId && st.activeCenterTabId !== p.active) {
      t = tabs.find((x) => x.id === st.activeCenterTabId && x.type !== "chat" && dockable(x)) || null;
    }
    if (!t) {
      const dialog = openDialogs().some((n) => !p.dialogsBefore.has(n));
      if (dialog) {
        p.dialogSeen = true;
        p.dialogGoneAt = 0;
      } else if (p.dialogSeen && !p.dialogGoneAt) p.dialogGoneAt = now;
      const expired = dialog
        ? now - p.at > ADD_DIALOG_MS
        : p.dialogGoneAt
          ? now - p.dialogGoneAt > ADD_AFTER_DIALOG_MS
          : now - p.at > ADD_QUICK_MS;
      if (expired) pendingAdd = null;
      return;
    }
    pendingAdd = null;
    const picked = t.id;
    let d = descFor(currentWs, t);
    let from = panelOfDesc(d.id);
    // A canvas already on screen (another pane's tab, or the one the center showed)
    // stays where it is: this pane gets its own tab for it (see the header).
    if (t.type === "canvas" && from !== panel && (from || (p.shown && p.shown.has(t.id)))) {
      const dup = duplicateCanvasTab(currentWs, t);
      if (dup) {
        t = dup;
        d = descFor(currentWs, dup);
        from = null;
      }
    }
    if (from !== panel) {
      if (!from) leaveNativeSplitFor([d]);
      moveInto(panel, d);
    }
    PQ().select(panel.popup, d.id);
    const after = W();
    const cur = after.activeCenterTabId;
    // The center goes back to its tab when the app activated the one now in a pane.
    if (cur === t.id || (cur === picked && cur !== p.active)) {
      const out = new Set(PQ().tabs.filter(isCenterKind).map(tabIdOf));
      const back = [p.active, after.activeChatTabId].find(
        (id) => id && id !== cur && !out.has(id) && (after.centerTabs || []).some((x) => x.id === id),
      );
      if (back) setCenter(back);
    }
    outIds = transferredIds(); // a duplicate is hidden in the center tab bar right away
    dirty = true;
  }

  // ---------------------------------------------------- persistence/restore
  // A deck is one arrangement of a workspace center: the dock's layout tree
  // (splits and sizes), which tabs sit in which pane, and the center's active chat
  // and tab. Each workspace keeps N decks with one active, and the live dock state
  // is the active deck. A center tab belongs to the one deck whose members list
  // it; the center bar hides the others (hidden, never closed). A tab no deck lists
  // (a new tab, or one left by a removed deck) joins the active deck, and so does a
  // tab on screen in its panes. Another deck's tab that the user activates here
  // (the center's previous tab is still there) moves to the active deck; one the
  // app falls back to after a close or a move into a pane does not, and the center
  // goes to one of the deck's own tabs. A deck is never empty: a new deck starts
  // with a new chat of its own (newChatTab), a deck left with no tab goes
  // (pruneEmptyDecks, undoable), and stored decks with no open tab are dropped on
  // load (never a workspace's only deck). Should the center still end up with no
  // tab of the active deck, the empty-deck cover (syncCover) hides the app's
  // active tab, which is another deck's. Saved per workspace as
  // { v: 2, active, decks } under LS_KEY; the single layout of earlier versions
  // ({ root, panels }) becomes "Deck 01". Default names ("Deck NN") always run 01..K
  // in list order (renumberDecks); a deck the user renamed keeps its name.
  const decksByWs = new Map(); // wsId -> { active, decks: [deck], touched, activateOnOpen }
  const lastLive = new Map(); // wsId -> center tab ids of the previous tick (while current)
  const deckSigs = new Map(); // wsId -> arrangement signature last announced
  const seenActive = new Map(); // wsId -> { chat, center } the app had active on the previous tick
  const departed = new Map(); // deckId -> tab ids that left the deck (closed, archived, taken) while it has none open
  const bootPruned = new Set(); // workspaces whose stored empty decks were dropped (no undo entry for those)
  let deckHidden = []; // center tab ids of the current workspace outside its active deck
  const MAX_MEMBERS = 400;

  const newId = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
  const deckName = (n) => `Deck ${String(n).padStart(2, "0")}`;
  // A default name, as deckName makes it (the sidebar reads the same shape as "NN").
  const DEFAULT_DECK_NAME = /^Deck\s+\d+$/i;

  function blankDeck(name, members = []) {
    return { id: newId("d"), name, root: leaf("main"), panels: {}, members: [...members], mainActive: null, chat: null };
  }

  // Stored panes as applyDeck reads them: { tabs: [{ kind, ref, desc? }], active };
  // anything else is dropped (a bad entry must not stop the restore).
  function readPanels(p) {
    const out = {};
    if (!p || typeof p !== "object") return out;
    for (const [id, spec] of Object.entries(p)) {
      if (!spec || typeof spec !== "object") continue;
      const tabs = Array.isArray(spec.tabs) ? spec.tabs.filter((t) => t && typeof t === "object" && KINDS.includes(t.kind) && typeof t.ref === "string") : [];
      out[id] = { tabs: JSON.parse(JSON.stringify(tabs)), active: typeof spec.active === "string" ? spec.active : null };
    }
    return out;
  }
  // A deck lists open tabs only: an id gone from the store leaves; an archived chat
  // leaves too and waits aside (ds.archived: id -> its deck), so it comes back to
  // that deck when it is unarchived. Only when the store holds that workspace's tabs.
  function pruneMembers(wsId, ds) {
    if (!ds || !storeKnows(wsId)) return false;
    const byId = new Map(wsTabs(wsId).filter(Boolean).map((t) => [t.id, t]));
    if (!byId.size) return false;
    ds.archived = ds.archived || {};
    let changed = false;
    for (const d of ds.decks) {
      const keep = [];
      for (const id of d.members) {
        const t = byId.get(id);
        if (t && !(t.type === "chat" && t.isArchived === true)) keep.push(id);
        else {
          if (t) ds.archived[id] = d.id;
          changed = true;
        }
      }
      if (keep.length !== d.members.length) d.members = keep;
    }
    for (const id of Object.keys(ds.archived)) {
      const t = byId.get(id);
      if (!t || !ds.decks.some((d) => d.id === ds.archived[id])) {
        delete ds.archived[id]; // deleted for good, or its deck went
        changed = true;
      }
    }
    return changed;
  }
  // A deck's member list over the cap loses tabs that are no longer open, never open ones.
  function capMembers(list, wsId) {
    if (list.length <= MAX_MEMBERS || !storeKnows(wsId)) return list;
    return list.filter((id) => liveTab(wsId, id));
  }
  function readDeck(d) {
    if (!d || typeof d !== "object" || typeof d.id !== "string") return null;
    const root = validTree(d.root) && leaves(d.root).includes("main") ? d.root : leaf("main");
    return {
      id: d.id,
      name: typeof d.name === "string" && d.name.trim() ? d.name : "Deck",
      root: JSON.parse(JSON.stringify(root)),
      panels: readPanels(d.panels),
      members: Array.isArray(d.members) ? d.members.filter((x) => typeof x === "string") : [], // open ones are never cut (capMembers)
      mainActive: typeof d.mainActive === "string" ? d.mainActive : null,
      chat: typeof d.chat === "string" ? d.chat : null,
    };
  }

  function decksOf(wsId) {
    let ds = decksByWs.get(wsId);
    if (ds) return ds;
    const saved = savedAll[wsId];
    let decks = [];
    if (saved && Array.isArray(saved.decks)) decks = saved.decks.map(readDeck).filter(Boolean);
    else if (saved && saved.root) {
      // the format before decks: one deck holding every tab (its panes' too)
      const d = readDeck({ id: newId("d"), name: deckName(1), root: saved.root, panels: saved.panels });
      const refs = Object.values(d.panels).flatMap((sp) => sp.tabs.filter((t) => t.kind === "chat" || t.kind === "center").map((t) => t.ref));
      d.members = [...new Set(refs.concat(S.ws ? liveIds(wsId) : []))];
      decks = [d];
    }
    const ids = new Set();
    decks = decks.filter((d) => d && !ids.has(d.id) && ids.add(d.id));
    if (!decks.length) decks.push(blankDeck(deckName(1)));
    exclusiveMembers(decks); // fixes tabs stored in several decks; saved below
    let active = saved && decks.some((d) => d.id === saved.active) ? saved.active : decks[0].id;
    const live = S.ws ? liveIds(wsId) : [];
    if (live.length) {
      // Stored decks with none of their tabs open any more go (not the only one); an
      // active one hands over to its previous neighbor, or the next.
      bootPruned.add(wsId);
      const open = new Set(live);
      const keep = decks.filter((d) => d.id === active || d.members.some((id) => open.has(id)));
      const activeOpen = decks.some((d) => d.id === active && d.members.some((id) => open.has(id)));
      if (!activeOpen && keep.length > 1) {
        const i = decks.findIndex((d) => d.id === active);
        const pick = decks
          .slice(0, i)
          .reverse()
          .concat(decks.slice(i + 1))
          .find((d) => keep.includes(d));
        keep.splice(keep.findIndex((d) => d.id === active), 1);
        active = pick.id;
      }
      decks = keep;
    }
    renumberDecks(decks); // fixes stored gaps (02, 03, 04 -> 01, 02, 03); saved below
    const archived = {};
    if (saved && saved.archived && typeof saved.archived === "object") for (const [k, v] of Object.entries(saved.archived)) if (typeof v === "string") archived[k] = v;
    ds = { active, decks, touched: !!saved, activateOnOpen: false, archived };
    pruneMembers(wsId, ds); // ids gone from the store leave, archived chats wait aside
    decksByWs.set(wsId, ds);
    return ds;
  }

  const activeDeck = (ds) => ds.decks.find((d) => d.id === ds.active) || ds.decks[0];

  const activeNow = () => {
    const st = W();
    return { chat: st.activeChatTabId || null, center: st.activeCenterTabId || null };
  };

  // A workspace's center tabs in the store, and the ids of the open ones (an
  // archived chat is not open).
  function wsTabs(wsId) {
    const st = W();
    return (st.selectedWorkspaceId === wsId ? st.centerTabs : (st.workspaces.find((w) => w.id === wsId) || {}).centerTabs) || [];
  }
  const liveIds = (wsId) => wsTabs(wsId).filter((t) => t && !(t.type === "chat" && t.isArchived === true)).map((t) => t.id);

  // The workspace's live center tabs that no deck lists yet (one the dock has not
  // opened, or a tab opened since the last tick) go to deck: a deck created next
  // must not take them over.
  function adoptUnlisted(wsId, deck) {
    if (!S.ws) return;
    const listed = new Set();
    for (const d of decksOf(wsId).decks) for (const id of d.members) listed.add(id);
    for (const id of liveIds(wsId)) if (!listed.has(id)) deck.members.push(id);
  }

  // A new chat in a workspace, as the native "New chat" does it: the store's
  // createChatTab() (a primary chat with the chat defaults; it becomes the active
  // tab) in the selected workspace, createChatTabInWorkspace() in another one, and
  // the center "+" New Chat as the last resort. Its id, or null when none opened.
  function newChatTab(wsId) {
    if (!S.ws || !wsId) return null;
    const st = W();
    const before = new Set(wsTabs(wsId).map((t) => t && t.id));
    let id = null;
    try {
      if (st.selectedWorkspaceId === wsId && typeof st.createChatTab === "function") id = st.createChatTab();
      else if (typeof st.createChatTabInWorkspace === "function") id = st.createChatTabInWorkspace(wsId);
      else if (st.selectedWorkspaceId === wsId) {
        const a = centerActions();
        if (a && typeof a.onNewChat === "function") a.onNewChat();
      }
    } catch (_) {
      id = null;
    }
    if (typeof id !== "string" || !liveTab(wsId, id)) {
      const t = wsTabs(wsId).find((x) => x && x.type === "chat" && x.isArchived !== true && !before.has(x.id));
      id = t ? t.id : null;
    }
    if (id && wsId === currentWs) seenActive.set(wsId, activeNow()); // the dock's own activation
    return id;
  }

  // The cover's "New chat": a new chat in front of the center that belongs to the
  // active deck at once (out of any other deck, and not a hidden tab), so the
  // next tick shows its tab and takes the cover down.
  function openChatHere(wsId) {
    const id = newChatTab(wsId);
    if (!id || wsId !== currentWs) return null;
    const ds = decksOf(wsId);
    const deck = activeDeck(ds);
    for (const d of ds.decks) if (d !== deck && d.members.includes(id)) d.members = d.members.filter((x) => x !== id);
    if (!deck.members.includes(id)) deck.members.push(id);
    revealed.add(id);
    try {
      const st = W();
      if (st.activeCenterTabId !== id && typeof st.setActiveCenterTab === "function") st.setActiveCenterTab(id);
    } catch (_) {}
    seenActive.set(wsId, activeNow());
    dirty = true;
    schedule();
    return id;
  }

  // A chat nobody used yet: no session, no composer text, attachments or command
  // (the app's draft store), not waiting, not made by an agent, owning no tab, and
  // still named "New Chat". The project sidebar uses the same test for drafts.
  function untouchedChat(wsId, id) {
    const tabs = wsTabs(wsId);
    const t = tabs.find((x) => x && x.id === id);
    if (!t || t.type !== "chat" || t.isArchived === true || t.sessionId || t.ownerChatTabId || t.createdByAgent || t.isAwaitingResponse) return false;
    if (((typeof t.name === "string" && t.name.trim()) || "New Chat") !== "New Chat") return false;
    if (tabs.some((x) => x && x.ownerChatTabId === id)) return false;
    try {
      const d = window.__CHAT_INPUT_DRAFTS_STORE__;
      const ds = d && typeof d.getState === "function" ? d.getState() : null;
      const k = `${wsId}-${id}`;
      const has = (m) => {
        const v = m && m[k];
        return Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim().length > 0 : !!v;
      };
      if (ds && (has(ds.chatInputDrafts) || has(ds.chatInputDraftAttachments) || has(ds.chatInputDraftCommands))) return false;
    } catch (_) {
      return false;
    }
    return true;
  }

  // Undoing a deck's creation: a deck that goes with a single open tab, a chat
  // nobody used (the one it was born with), takes that chat along through the
  // tab's own close (closeChatTab). A used chat stays and joins the active deck.
  function closeBornChats(snap) {
    const ws = currentWs;
    const st = W();
    if (typeof st.closeChatTab !== "function" || st.selectedWorkspaceId !== ws) return;
    const stays = new Set(snap.decks.map((d) => d.id));
    const away = new Set(PQ().tabs.filter(isCenterKind).map(tabIdOf));
    for (const d of decksOf(ws).decks) {
      if (stays.has(d.id)) continue;
      const open = d.members.filter((id) => liveTab(ws, id));
      if (open.length !== 1 || away.has(open[0]) || !untouchedChat(ws, open[0])) continue;
      try {
        st.closeChatTab(open[0]);
      } catch (_) {}
    }
  }

  // Takes a deck out of the list; the active one first hands over to a neighbor
  // (the next one first, or with prefer "prev" the previous one). False for the
  // last deck. Its tabs no other deck lists join the active deck (syncDecks).
  function dropDeck(wsId, id, prefer) {
    const ds = decksOf(wsId);
    const i = ds.decks.findIndex((d) => d.id === id);
    if (i < 0 || ds.decks.length <= 1) return false;
    if (ds.active === id) {
      const to = prefer === "prev" ? ds.decks[i - 1] || ds.decks[i + 1] : ds.decks[i + 1] || ds.decks[i - 1];
      if (!switchDeck(wsId, to.id)) return false;
    }
    const at = ds.decks.findIndex((d) => d.id === id);
    if (at >= 0) ds.decks.splice(at, 1);
    departed.delete(id);
    renumberDecks(ds.decks);
    ds.touched = true;
    save();
    announce(wsId, true);
    return true;
  }

  // A deck left with no open tab (its last one closed, archived or taken by another
  // deck) goes, unless it is the workspace's only deck; the active one hands over
  // to its previous neighbor (or the next). Undoable ("deck-empty"): the entry lists
  // the tabs that left, so ⌘Z brings the deck back with them when the store still
  // has them (an archived chat is unarchived), otherwise with a new chat
  // (reviveDecks). Stored empty decks found on the first pass are dropped without
  // an entry. Not during a drag, a resize, a pane "+" or an undo/redo.
  function pruneEmptyDecks() {
    if (!currentWs || !S.ws || !S.pq || drag || resizing || restoring || applying || pendingAdd) return;
    if ((moveGuard.get(currentWs) || 0) > Date.now()) return; // its tab is flying to a new workspace
    const ws = currentWs;
    const ds = decksOf(ws);
    const live = new Set(liveIds(ws));
    if (!live.size) return; // the store holds no tab for it (yet): nothing to judge
    const boot = !bootPruned.has(ws);
    bootPruned.add(ws);
    if (ds.decks.length <= 1) return;
    const onScreen = [...panels.values()].some((p) => p.wsId === ws && tabsOf(p).length);
    const empty = [];
    for (const d of ds.decks) {
      if (d.members.some((id) => live.has(id)) || (d.id === ds.active && onScreen)) departed.delete(d.id);
      else empty.push(d);
    }
    for (const d of empty) {
      if (ds.decks.length <= 1) break;
      if (!boot && record("deck-empty", ws)) {
        // The tabs that left belong to this deck in the entry (a tab another deck
        // took goes back on undo).
        const left = departed.get(d.id) || [];
        const metas = historyOf(ws).undo[historyOf(ws).undo.length - 1].snap.decks;
        for (const m of metas) {
          if (m.id === d.id) m.members = [...new Set(m.members.concat(left))];
          else m.members = m.members.filter((id) => !left.includes(id));
        }
      }
      dropDeck(ws, d.id, "prev");
    }
  }

  // The workspaces not on screen: a deck with none of its tabs open any more (its
  // chat archived or closed from the sidebar, a window...) goes the same way, on
  // the tick that sees it, undoable on that workspace ("deck-empty"); not its
  // only deck. The store holds every workspace's tabs (the selected one's in
  // centerTabs, the others' in workspaces[].centerTabs).
  // Tabs that are not members (design canvases, docs, issues from a window) in a
  // deck's panes: its live panes for the active deck of a loaded layout, its stored
  // panes otherwise.
  function deckHoldsPaneTab(ws, ds, d) {
    if (d.id === ds.active && layouts.has(ws)) return [...panels.values()].some((p) => p.wsId === ws && tabsOf(p).length);
    return Object.values(d.panels || {}).some((sp) => (sp.tabs || []).some((t) => t && !(t.kind === "chat" || t.kind === "center") && t.desc && plainDesc(t.desc)));
  }
  // A workspace seen in the store this session and gone from it now was deleted:
  // its decks, layout, panes, history and stored record go. Workspaces never seen
  // this session (another organization, a list still loading) are left alone.
  const wsSeen = new Set();
  function forgetDeletedWorkspaces() {
    if (!S.ws) return;
    const ids = new Set(W().workspaces.map((w) => w && w.id).filter(Boolean));
    if (!ids.size) return;
    for (const id of ids) wsSeen.add(id);
    let changed = false;
    for (const id of [...wsSeen]) {
      if (ids.has(id) || id === currentWs) continue;
      wsSeen.delete(id);
      for (const p of [...panels.values()]) if (p.wsId === id) removePanel(p.id);
      decksByWs.delete(id);
      layouts.delete(id);
      histories.delete(id);
      solos.delete(id);
      for (const [k, o] of [...external]) if (o.ws === id) external.delete(k);
      if (savedAll[id]) {
        const next = { ...savedAll };
        delete next[id];
        savedAll = next;
        changed = true;
      }
    }
    if (changed) {
      lastSaved = null;
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(savedAll));
        lastSaved = JSON.stringify(savedAll);
      } catch (_) {}
      saveExternal();
    }
  }
  function pruneOtherDecks() {
    if (!S.ws || !S.pq || drag || resizing || restoring || applying) return;
    const st = W();
    for (const [ws, ds] of decksByWs) {
      if (ws === currentWs || ws === st.selectedWorkspaceId || ds.decks.length <= 1) continue;
      if ((moveGuard.get(ws) || 0) > Date.now()) continue;
      const w = st.workspaces.find((x) => x && x.id === ws);
      if (!w || !Array.isArray(w.centerTabs)) continue; // its tabs are not loaded: nothing to judge
      const live = new Set(liveIds(ws));
      if (!live.size) continue;
      if (pruneMembers(ws, ds)) ds.touched = true;
      for (const d of ds.decks.slice()) {
        if (ds.decks.length <= 1) break;
        if (d.members.some((id) => live.has(id)) || deckHoldsPaneTab(ws, ds, d)) continue;
        record("deck-empty", ws);
        dropDeck(ws, d.id, "prev");
      }
    }
  }

  // After a deck step: a deck that came back with none of its tabs open gets them
  // back from the store (an archived chat is unarchived) or, with none left, a new
  // chat. The workspace's only deck may stay as it is.
  function reviveDecks(ws) {
    const ds = decksOf(ws);
    if (ds.decks.length <= 1 || !S.ws) return;
    const prev = activeNow();
    let touchedCenter = false;
    let activeGot = null;
    for (const d of ds.decks) {
      if (d.members.some((id) => liveTab(ws, id))) continue;
      const st = W();
      let got = null;
      const waiting = Object.keys(ds.archived || {}).filter((id) => ds.archived[id] === d.id);
      for (const id of d.members.concat(waiting).reverse()) {
        const t = wsTabs(ws).find((x) => x && x.id === id && x.type === "chat" && x.isArchived === true);
        if (!t || typeof st.unarchiveChatTab !== "function") continue;
        try {
          st.unarchiveChatTab(ws, id, { select: false });
        } catch (_) {}
        if (!got && liveTab(ws, id)) got = id;
      }
      if (!got) {
        got = newChatTab(ws);
        if (!got) continue;
        touchedCenter = true;
        for (const o of ds.decks) if (o !== d) o.members = o.members.filter((x) => x !== got);
        const inStore = new Set(wsTabs(ws).map((t) => t && t.id));
        d.members = d.members.filter((x) => inStore.has(x)).concat(got); // closed tabs are gone for good
      }
      d.chat = got;
      d.mainActive = got;
      if (d.id === ds.active) activeGot = got;
    }
    // The center: the active deck's tab that came back; otherwise, when a new chat
    // for an inactive deck became the app's active tab, the active deck's own tab.
    if (ws === W().selectedWorkspaceId && (activeGot || touchedCenter)) {
      const own = activeDeck(ds).members;
      try {
        if (activeGot) W().setActiveCenterTab(activeGot);
        else {
          if (prev.chat && own.includes(prev.chat) && liveTab(ws, prev.chat)) W().setActiveCenterTab(prev.chat);
          if (prev.center && own.includes(prev.center) && liveTab(ws, prev.center)) W().setActiveCenterTab(prev.center);
        }
      } catch (_) {}
    }
    if (ws === currentWs) seenActive.set(ws, activeNow());
  }

  // A tab belongs to one deck. Data stored before that rule (a new deck took the
  // active chat along) can list a tab in several decks: it stays in the deck that
  // holds it in a pane, otherwise in the first deck (list order) that lists it.
  function exclusiveMembers(decks) {
    const owner = new Map();
    const inPane = (d, id) => Object.values(d.panels || {}).some((s) => s && Array.isArray(s.tabs) && s.tabs.some((t) => t && t.ref === id));
    for (const d of decks) for (const id of d.members) if (!owner.has(id) && inPane(d, id)) owner.set(id, d);
    for (const d of decks) for (const id of d.members) if (!owner.has(id)) owner.set(id, d);
    let changed = false;
    for (const d of decks) {
      const keep = d.members.filter((id) => owner.get(id) === d);
      if (keep.length === d.members.length) continue;
      d.members = keep;
      if (d.chat && !keep.includes(d.chat)) d.chat = null;
      if (d.mainActive && !keep.includes(d.mainActive)) d.mainActive = null;
      changed = true;
    }
    return changed;
  }

  // Decks with a default name are numbered 01..K by their place in the list; renamed
  // decks keep their name and do not count. True when a name changed.
  function renumberDecks(decks) {
    let n = 0;
    let changed = false;
    for (const d of decks) {
      if (!DEFAULT_DECK_NAME.test(d.name)) continue;
      const name = deckName(++n);
      if (d.name !== name) {
        d.name = name;
        changed = true;
      }
    }
    return changed;
  }

  // The lowest default name not in use.
  function nextDeckName(ds) {
    const used = new Set(ds.decks.map((d) => d.name));
    let n = 1;
    while (used.has(deckName(n))) n++;
    return deckName(n);
  }

  function paneSpec(p) {
    return {
      tabs: tabsOf(p).map((t) => (isCenterKind(t) ? { kind: t.kind, ref: tabIdOf(t) } : { kind: t.kind, ref: tabIdOf(t), desc: plainDesc(t) })),
      active: PQ().activeByPopup[p.name] || null,
    };
  }

  // The live state of a workspace (its layout is loaded), written into its active deck.
  function captureDeck(wsId) {
    const ds = decksByWs.get(wsId);
    const root = layouts.get(wsId);
    if (!ds || !root || !S.pq) return;
    const deck = activeDeck(ds);
    const spec = {};
    for (const id of leaves(root)) {
      const p = id !== "main" && panels.get(id);
      if (p) spec[id] = paneSpec(p);
    }
    deck.root = JSON.parse(JSON.stringify(root));
    deck.panels = spec;
    const m = new Set(deck.members);
    for (const s of Object.values(spec)) for (const t of s.tabs) if (t.kind === "chat" || t.kind === "center") m.add(t.ref);
    deck.members = capMembers([...m], wsId);
    if (wsId === currentWs && S.ws) {
      // Only the deck's own tabs: on a new deck the app's active tab is another deck's.
      const st = W();
      // Otherwise the stored ones stay (a new deck's chat is active while you leave).
      const own = (id) => (id && deck.members.includes(id) ? id : null);
      deck.chat = own(st.activeChatTabId) || own(deck.chat);
      deck.mainActive = own(st.activeCenterTabId) || own(deck.mainActive);
    }
  }

  // Every tab of the workspace's panes goes back to its center (no activation); the panes go.
  function dissolvePanes(wsId) {
    const pq = PQ();
    for (const p of [...panels.values()]) {
      if (p.wsId !== wsId) continue;
      for (const t of tabsOf(p)) {
        try {
          const vq = VQ();
          if (vq) vq.remove(t.id);
        } catch (_) {}
        pq.attach(t.id);
      }
      removePanel(p.id);
    }
  }

  // Builds the deck's panes in the current workspace; with activate, also its
  // center chat and tab (a deck switch; a reload keeps what the app restored).
  function applyDeck(wsId, deck, activate) {
    let root = JSON.parse(JSON.stringify(deck.root));
    const pq = PQ();
    const plan = [];
    for (const id of leaves(root)) {
      if (id === "main") continue;
      const spec = deck.panels[id] || {};
      const descs = (spec.tabs || [])
        .map((s) => {
          if (!s) return null;
          // Canvases, docs and issues opened on the chat route are center tabs (restored
          // here). View tabs of the design/docs/issues routes only arrive from a popout
          // window's tab bar and are not restored.
          if (!isCenterKind(s) || !deck.members.includes(s.ref)) return null; // another deck's tab stays there
          const live = liveTab(wsId, s.ref);
          return live && (live.type === "chat") === (s.kind === "chat") ? descFor(wsId, live) : null;
        })
        .filter((d) => d && !pq.tabs.some((t) => t.id === d.id));
      if (!descs.length || panels.has(id)) {
        root = removeLeaf(root, id);
        continue;
      }
      plan.push({ id, descs, active: spec.active });
    }
    layouts.set(wsId, root);
    const was = restoring;
    restoring = true;
    try {
      if (plan.length) leaveNativeSplitFor(plan.flatMap((p) => p.descs));
      for (const it of plan) {
        const panel = makePanel(wsId, it.id);
        for (const d of it.descs) moveInto(panel, d);
        if (it.active && it.descs.some((d) => d.id === it.active)) PQ().select(panel.popup, it.active);
      }
      if (activate && wsId === currentWs) {
        const inPanes = new Set(PQ().tabs.filter(isCenterKind).map(tabIdOf));
        const ok = (id) => !!id && !inPanes.has(id) && deck.members.includes(id) && !!liveTab(wsId, id);
        const chat = ok(deck.chat) ? deck.chat : null;
        try {
          if (chat && W().activeChatTabId !== chat) W().setActiveCenterTab(chat);
          const main = ok(deck.mainActive) ? deck.mainActive : chat || deck.members.find(ok);
          if (main && W().activeCenterTabId !== main) W().setActiveCenterTab(main);
        } catch (_) {}
        lastActiveChat = W().activeChatTabId;
        seenActive.set(wsId, activeNow()); // not a pick by the user (syncDecks)
      }
    } finally {
      restoring = was;
    }
  }

  function restoreWs(wsId) {
    const ds = decksOf(wsId);
    ds.touched = true;
    const activate = ds.activateOnOpen;
    ds.activateOnOpen = false;
    applyDeck(wsId, activeDeck(ds), activate);
  }

  function switchDeck(wsId, id) {
    if (!wsId || destroyed) return false;
    const ds = decksOf(wsId);
    const target = ds.decks.find((d) => d.id === id);
    if (!target) return false;
    if (ds.active === id) return true;
    ds.touched = true;
    if (!S.pq || !layouts.has(wsId)) {
      ds.active = id; // applied when the workspace opens
      ds.activateOnOpen = true;
    } else if (wsId !== currentWs) {
      // Another workspace with live panes: store them in its deck, unload them, and
      // build the target deck when that workspace opens again.
      captureDeck(wsId);
      dissolvePanes(wsId);
      layouts.delete(wsId);
      ds.active = id;
      ds.activateOnOpen = true;
    } else {
      endDrag();
      closeAddMenu(false);
      pendingAdd = null;
      const was = restoring;
      restoring = true;
      try {
        adoptUnlisted(wsId, activeDeck(ds)); // tabs opened since the last tick belong to the deck you leave
        captureDeck(wsId);
        dissolvePanes(wsId);
        ds.active = id;
        applyDeck(wsId, target, true);
      } finally {
        restoring = was;
      }
      // Hide the other decks' tabs now, not on the next tick: no flash of them.
      outIds = transferredIds();
      syncDecks(true);
      if (host && dynStyle) relayout();
      else dirty = true;
    }
    save();
    announce(wsId, true);
    schedule();
    return true;
  }

  // Hidden tabs: chats nobody opened that another mod runs in the background (the
  // comment agent's tasks, __RE_TEMPO_COMMENT_AGENT__.tasks(): their chatId), and
  // the tabs those chats own. No deck lists them (they never join one on their
  // own), so after a close the app's pick of one is another deck's tab for the
  // center (it goes back to a tab of its own deck, or the cover hides it). A
  // hidden chat the user opens on purpose (made active with no close at that
  // moment) is revealed: a tab like any other from then on.
  const revealed = new Set();
  function hiddenTabIds(ws) {
    const out = new Set();
    let tasks = [];
    try {
      const A = window.__RE_TEMPO_COMMENT_AGENT__;
      tasks = A && typeof A.tasks === "function" ? A.tasks() || [] : [];
    } catch (_) {
      tasks = [];
    }
    for (const t of tasks) if (t && typeof t.chatId === "string" && (!t.workspaceId || t.workspaceId === ws) && !revealed.has(t.chatId)) out.add(t.chatId);
    if (out.size && S.ws) for (const t of wsTabs(ws)) if (t && t.ownerChatTabId && out.has(t.ownerChatTabId) && !revealed.has(t.id)) out.add(t.id);
    return out;
  }

  // Deck membership of the current workspace's center tabs, and the tabs to hide.
  function syncDecks(quiet) {
    if (!currentWs || !S.ws || !S.pq) return;
    const ds = decksOf(currentWs);
    ds.touched = true;
    const deck = activeDeck(ds);
    const st = W();
    const tabs = st.selectedWorkspaceId === currentWs ? st.centerTabs : (st.workspaces.find((w) => w.id === currentWs) || {}).centerTabs;
    const live = (tabs || []).filter((t) => !(t.type === "chat" && t.isArchived === true)).map((t) => t.id);
    const liveSet = new Set(live);
    // A tab live on the previous tick and gone now was closed: it leaves every deck.
    const prev = lastLive.get(currentWs);
    const gone = prev ? prev.filter((id) => !liveSet.has(id)) : [];
    const leave = (d, ids) => departed.set(d.id, (departed.get(d.id) || []).concat(ids).slice(-20));
    ds.archived = ds.archived || {};
    if (gone.length) {
      const archivedNow = new Set((tabs || []).filter((t) => t && t.type === "chat" && t.isArchived === true).map((t) => t.id));
      for (const d of ds.decks) {
        const lost = d.members.filter((id) => gone.includes(id));
        if (!lost.length) continue;
        leave(d, lost);
        for (const id of lost) if (archivedNow.has(id)) ds.archived[id] = d.id; // archived: back to this deck when unarchived
        d.members = d.members.filter((id) => !gone.includes(id));
      }
    }
    pruneMembers(currentWs, ds); // stale ids (closed or archived while the workspace was away)
    const secret = hiddenTabIds(currentWs); // hidden tabs: in no deck
    if (secret.size) for (const d of ds.decks) if (d.members.some((id) => secret.has(id))) d.members = d.members.filter((id) => !secret.has(id));
    lastLive.set(currentWs, live);
    const assigned = new Set();
    for (const d of ds.decks) for (const id of d.members) assigned.add(id);
    // An unarchived chat goes back to the deck it was in.
    for (const id of live) {
      const home = !assigned.has(id) && ds.archived[id] && ds.decks.find((d) => d.id === ds.archived[id]);
      if (!home) continue;
      home.members.push(id);
      assigned.add(id);
      delete ds.archived[id];
    }
    const mine = new Set(deck.members);
    const join = (id) => {
      if (!id || !liveSet.has(id) || mine.has(id)) return;
      mine.add(id);
      deck.members.push(id);
    };
    // Into the active deck and out of every other one (a tab belongs to one deck).
    const claim = (id) => {
      if (!id || !liveSet.has(id)) return;
      if (secret.has(id)) {
        // a hidden chat picked by the user (no close at that moment): a tab like any other now
        revealed.add(id);
        secret.delete(id);
      }
      for (const d of ds.decks) {
        if (d === deck || !d.members.includes(id)) continue;
        leave(d, [id]);
        d.members = d.members.filter((x) => x !== id);
      }
      join(id);
    };
    // The app keeps a primary chat in every workspace: a close that leaves none (the
    // last tab of a workspace whose other tabs are terminals, canvases...) makes a
    // fresh "New Chat" in the same update (eq() in closeDiffTab / closeChatTab /
    // archiveChatTab). When that close emptied the active deck, the chat goes to the
    // neighbor deck (the one that takes over) and the emptied deck goes; it never
    // keeps the deck alive with a chat nobody opened. (Closing it would only make
    // the app create another.)
    if (gone.length && prev && ds.decks.length > 1) {
      const spawned = live.filter((id) => !prev.includes(id) && !assigned.has(id) && untouchedChat(currentWs, id));
      const own = deck.members.filter((id) => liveSet.has(id) && !spawned.includes(id));
      const inPanes = [...panels.values()].some((p) => p.wsId === currentWs && tabsOf(p).length);
      if (spawned.length && !own.length && !inPanes) {
        const i = ds.decks.indexOf(deck);
        const heir = ds.decks[i - 1] || ds.decks[i + 1];
        for (const id of spawned) {
          heir.members.push(id);
          assigned.add(id);
        }
      }
    }
    for (const id of live) if (!assigned.has(id) && !secret.has(id)) join(id);
    // A tab a chat owns (a secondary chat, that chat's terminal or browser) shows
    // only with its owner: it belongs to the owner's deck, unless it sits in a pane
    // or a window. Otherwise a deck whose chat went to another deck keeps that
    // chat's tabs, shows nothing and never empties.
    const inPq = new Set(PQ().tabs.filter(isCenterKind).map(tabIdOf));
    for (const d of ds.decks) if (d !== deck) for (const sp of Object.values(d.panels || {})) for (const t of (sp && sp.tabs) || []) if (t && t.ref) inPq.add(t.ref); // in an inactive deck's pane
    for (const t of tabs || []) {
      if (!t || !t.ownerChatTabId || !liveSet.has(t.id) || !liveSet.has(t.ownerChatTabId) || inPq.has(t.id)) continue;
      const home = ds.decks.find((d) => d.members.includes(t.ownerChatTabId));
      if (!home || home.members.includes(t.id)) continue;
      for (const d of ds.decks) if (d !== home && d.members.includes(t.id)) d.members = d.members.filter((x) => x !== t.id);
      home.members.push(t.id);
      if (home === deck) mine.add(t.id);
      else mine.delete(t.id);
    }
    const away = new Set(); // in a pane or a popout window, not in the center
    for (const t of PQ().tabs) {
      if (!isCenterKind(t)) continue;
      away.add(tabIdOf(t));
      if (t.workspaceId === currentWs && panelOfDesc(t.id)) claim(tabIdOf(t)); // on screen in this deck's panes
    }
    const inCenter = (id) => !!id && liveSet.has(id) && !away.has(id);
    // A tab the app makes active that this deck does not list: the user picked
    // another deck's tab here when the center's previous tab is still there and
    // nothing closed; otherwise it is the app's fallback (after a close, or a move
    // into a pane), which does not move tabs between decks.
    const seen = seenActive.get(currentWs);
    const now = activeNow();
    if (seen && !restoring) {
      for (const k of ["chat", "center"]) {
        const id = now[k];
        if (id && id !== seen[k] && !mine.has(id) && !gone.length && inCenter(seen[k])) claim(id);
      }
    }
    // The center shows another deck's tab: go to one of this deck's own center
    // tabs. With none, the empty-deck cover hides it.
    if (!restoring && !drag && inCenter(now.center) && !mine.has(now.center)) {
      const own = [deck.mainActive, deck.chat].concat(deck.members.slice().reverse()).find((id) => id && mine.has(id) && inCenter(id));
      if (own) {
        try {
          st.setActiveCenterTab(own);
        } catch (_) {}
        dirty = true;
      }
    }
    // The center never shows a tab that lives in a pane or a window: after a close
    // the app may pick one as the center's active tab (and the center would render
    // it a second time). Back to one of this deck's own center tabs; with none the
    // center is empty and hides (mainEmpty). The tab stays where it is.
    const cur = activeNow();
    if (!restoring && !drag && cur.center && (away.has(cur.center) || parkedIds().includes(cur.center))) {
      const own = [seen && seen.center, seen && seen.chat, deck.mainActive, deck.chat]
        .concat(deck.members.slice().reverse())
        .find((id) => id && mine.has(id) && inCenter(id));
      if (own) {
        try {
          st.setActiveCenterTab(own);
        } catch (_) {}
        dirty = true;
      }
    }
    seenActive.set(currentWs, activeNow());
    if (deck.members.length > MAX_MEMBERS) deck.members = deck.members.filter((id) => liveSet.has(id)); // open ones stay
    const hidden = live.filter((id) => !mine.has(id)).sort();
    if (hidden.join() !== deckHidden.join()) {
      deckHidden = hidden;
      dirty = true;
    }
    if (!quiet) announce(currentWs, false);
  }

  // What another mod sees of a workspace's decks: which deck is active, the names,
  // the pane tree and its tabs, and the active deck's tabs. Sizes are left out.
  function deckSignature(wsId) {
    const ds = decksByWs.get(wsId);
    if (!ds) return "";
    const root = layouts.get(wsId);
    const shape = (n) => (n.t === "l" ? n.id : [n.d, n.c.map(shape)]);
    const tabs = [...panels.values()].filter((p) => p.wsId === wsId).map((p) => [p.id, tabsOf(p).map((t) => t.id), PQ().activeByPopup[p.name] || null]);
    const deck = activeDeck(ds);
    const center = wsId === currentWs && S.ws ? [W().activeCenterTabId || null, hiddenNow.has("main")] : null;
    return JSON.stringify([
      ds.active,
      ds.decks.map((d) => [d.id, d.name]),
      root ? shape(root) : null,
      tabs,
      [...deck.members].sort(),
      wsId === currentWs ? deckHidden : [],
      center,
    ]);
  }

  function announce(wsId, force) {
    if (!wsId) return;
    const sig = deckSignature(wsId);
    if (!force && sig === deckSigs.get(wsId)) return;
    deckSigs.set(wsId, sig);
    try {
      window.dispatchEvent(new CustomEvent("rtd:decks-changed", { detail: { wsId } }));
    } catch (_) {}
  }

  function save() {
    if (frozen || destroyed || restoring || !S.pq) return;
    const merged = { ...savedAll };
    delete merged._; // shared layout of an earlier version (other routes)
    for (const [wsId, ds] of decksByWs) {
      if (!ds.touched) continue; // only listed, never opened or changed: keep what is stored
      captureDeck(wsId);
      merged[wsId] = {
        v: 2,
        active: ds.active,
        decks: ds.decks.map((d) => ({ id: d.id, name: d.name, root: d.root, panels: d.panels, members: d.members, mainActive: d.mainActive, chat: d.chat })),
        archived: ds.archived || {},
      };
    }
    const s = JSON.stringify(merged);
    if (s === lastSaved) return;
    savedAll = merged;
    try {
      localStorage.setItem(LS_KEY, s);
      lastSaved = s; // only once written: a failed write is tried again
    } catch (_) {}
  }

  // ------------------------------------------------------------ undo / redo
  // Each layout change (a split from the button, the API or an edge drop, a tab
  // moved between panes or back to the center, a pane closed with tabs inside, a
  // reset) and each deck change (created, removed, renamed or reordered through the
  // decks API, so also the project sidebar's "+" and deck menu) first records a
  // snapshot of the workspace: the tree with its sizes, each pane's tabs in order
  // and its active tab, the center's active chat and tab, and the deck list (ids,
  // names, order, each deck's tabs and stored arrangement, the active deck).
  // Resizing and plain deck switches are not recorded. Splits less than GROUP_MS
  // apart share one entry. One history per workspace (decks come and go),
  // HISTORY_MAX entries; a new change drops the redo entries.
  // Undo/redo restore a snapshot through the app's own paths (moveToPopup, attach,
  // select, reorder): tab content remounts as on any move and chats come back from
  // the store. A tab closed since the snapshot is skipped, and a pane left with no
  // tab is dropped from the tree. A pane that comes back gets a fresh id (a closed
  // pane's window name is never reused) and the other snapshots follow the rename.
  //   - a layout step made on another deck than the active one first switches to
  //     that deck: it is undone where it was made, and its redo stays there;
  //   - a deck step puts the deck list back (a created deck goes, a removed one
  //     comes back with its id, name, place, tabs and arrangement; the redo of a
  //     creation brings back the same id and name) and, when the active deck was
  //     another one, switches to it with the snapshot's panes. Tabs the snapshot
  //     lists go back to their deck; tabs opened since keep theirs, or join the
  //     active deck when theirs goes. A deck that comes back with none of its tabs
  //     open gets them back from the store or a new chat (reviveDecks). Default
  //     names are renumbered (no gaps). A deck emptied by closing its last tab
  //     goes as an entry of its own ("deck-empty", pruneEmptyDecks).
  //
  // The shortcut (window keydown, capture phase, registered before the bundle's
  // listeners) is the dock's only when nothing else owns it; otherwise the event
  // goes on untouched:
  //   - typing: focus in an input, textarea, select, contenteditable, Monaco,
  //     CodeMirror or a terminal; or in a menu, dialog or listbox;
  //   - a webview or iframe has focus;
  //   - the canvas owns its shortcuts. Same rule as the app's canvas view: the
  //     last pointerdown/focusin (or this key's target) was inside the canvas
  //     shell/root or a [data-canvas-shortcut-scope], reset on window blur, and a
  //     canvas is on screen;
  //   - the last thing done was a drop on a file tree the dock did not handle: the
  //     file tree's move has its own ⌘Z (one level), so that press goes to it;
  //   - off the chat route, during a drag or resize, or nothing to undo/redo.
  const HISTORY_MAX = 50;
  const GROUP_MS = 300;
  const TOAST_MS = 1400;
  const KIND_LABEL = {
    split: "split",
    move: "tab move",
    close: "pane close",
    reset: "layout reset",
    "deck-create": "new deck",
    "deck-remove": "deck removal",
    "deck-rename": "deck rename",
    "deck-move": "deck reorder",
    "deck-empty": "deck removal",
    workspace: "move to a new workspace",
    "deck-tabs": "move to deck",
    "deck-close": "close all in deck",
  };
  const DECK_KINDS = new Set(["deck-create", "deck-remove", "deck-rename", "deck-move", "deck-empty", "deck-tabs"]);
  const EDITABLE =
    "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], .monaco-editor, .cm-editor, .CodeMirror, .xterm";
  const BUSY = "[role='menu'], [role='menubar'], [role='dialog'], [role='alertdialog'], [role='listbox']";
  const CANVAS_SCOPE = "[data-canvas-shell], [data-canvas-root], [data-canvas-shortcut-scope]";
  const histories = new Map(); // wsId -> { undo: [{ kind, snap }], redo: [...], lastKind, lastAt }
  let applying = false;
  let canvasOwned = false; // the canvas owns the shortcuts (last pointerdown/focusin inside it)
  let treeDropAt = 0; // time of the last drop on a tree that the dock did not handle
  let toastEl = null;
  let toastTimer = 0;

  const asEl = (n) => (n instanceof Element ? n : n && n.parentElement instanceof Element ? n.parentElement : null);
  const inCanvas = (n) => {
    const e = asEl(n);
    return !!(e && e.closest(CANVAS_SCOPE));
  };

  function historyOf(wsId = currentWs) {
    if (!wsId) return null;
    let h = histories.get(wsId);
    if (!h) histories.set(wsId, (h = { undo: [], redo: [], lastKind: null, lastAt: 0 }));
    return h;
  }

  // A deck as a snapshot keeps it (a copy).
  const deckMeta = (d) =>
    JSON.parse(JSON.stringify({ id: d.id, name: d.name, root: d.root, panels: d.panels, members: d.members, mainActive: d.mainActive, chat: d.chat }));

  // A pane tab as a snapshot keeps it: no window reference, no copy of the center
  // tab (re-read from the store on restore).
  function storedDesc(t) {
    const d = { ...t };
    delete d.popup;
    if (d.kind === "center" && d.tab) d.tab = { id: d.tab.id, type: d.tab.type };
    return d;
  }

  // The workspace as undo/redo puts it back: the deck list and, for the current
  // workspace, the screen (tree, panes, center). Another workspace has no screen
  // part (root null): its decks keep their stored arrangement.
  function snapshot(wsId = currentWs) {
    const ds = decksOf(wsId);
    if (layouts.has(wsId)) captureDeck(wsId); // the active deck's stored copy follows the screen
    const decks = { active: ds.active, decks: ds.decks.map(deckMeta) };
    if (wsId !== currentWs) return { root: null, panes: {}, chat: null, center: null, ...decks };
    const root = layouts.get(wsId) || leaf("main");
    const panes = {};
    for (const id of leaves(root)) {
      const p = id !== "main" && panels.get(id);
      if (p) panes[id] = { tabs: tabsOf(p).map(storedDesc), active: PQ().activeByPopup[p.name] || null };
    }
    const st = W();
    return { root: JSON.parse(JSON.stringify(root)), panes, chat: st.activeChatTabId || null, center: st.activeCenterTabId || null, ...decks };
  }

  // What undo/redo can change on screen: the tree, the panes' tabs and active tab,
  // the center's active tab, and the decks (which one is active, names, order).
  function stateSig() {
    const ps = [...panels.values()].filter((p) => p.wsId === currentWs).map((p) => [p.id, tabsOf(p).map((t) => t.id), PQ().activeByPopup[p.name] || null]);
    const ds = decksOf(currentWs);
    return JSON.stringify([layouts.get(currentWs) || null, ps, W().activeCenterTabId || null, ds.active, ds.decks.map((d) => [d.id, d.name])]);
  }

  // Called right before a change (wsId: a deck change of another workspace). True
  // when an entry was added.
  function record(kind, wsId = currentWs) {
    if (applying || restoring || destroyed || !wsId || !S.pq || !S.ws) return false;
    const h = historyOf(wsId);
    const now = Date.now();
    h.redoBackup = h.redo.slice(); // unrecord gives them back
    h.redo.length = 0;
    if (kind === "split" && h.lastKind === "split" && now - h.lastAt < GROUP_MS && h.undo.length) {
      h.lastAt = now; // a quick burst of splits is one entry
      return false;
    }
    h.undo.push({ kind, snap: snapshot(wsId), at: now });
    if (h.undo.length > HISTORY_MAX) h.undo.shift();
    h.lastKind = kind;
    h.lastAt = now;
    return true;
  }

  // Drops the entry record() just added (the change did not happen after all).
  function unrecord(wsId, kind) {
    const h = histories.get(wsId);
    if (!h || !h.undo.length || h.undo[h.undo.length - 1].kind !== kind) return;
    h.undo.pop();
    if (h.redoBackup && !h.redo.length) h.redo.push(...h.redoBackup); // nothing changed: the redo steps stay
    h.redoBackup = null;
  }

  // The tab a stored descriptor points to, if it is still open: center tabs are
  // re-read from the store; a tab now in a popout window of its own stays there.
  function liveDescOf(s) {
    if (!s || typeof s.id !== "string" || !KINDS.includes(s.kind)) return null;
    const inPq = PQ().tabs.find((t) => t.id === s.id);
    if (inPq && !panelOfDesc(s.id)) return null;
    if (isCenterKind(s)) {
      if (s.workspaceId !== currentWs) return null;
      const live = liveTab(s.workspaceId, tabIdOf(s)) || reopenDuplicate(s.workspaceId, tabIdOf(s));
      return live && dockable(live) ? descFor(s.workspaceId, live) : null;
    }
    return plainDesc(inPq || s);
  }

  function renamePane(root, from, to) {
    const walk = (n) => {
      if (n.t === "l") {
        if (n.id === from) n.id = to;
      } else n.c.forEach(walk);
    };
    const rekey = (o) => {
      if (o && o[from]) {
        o[to] = o[from];
        delete o[from];
      }
    };
    walk(root);
    for (const h of histories.values()) {
      for (const e of h.undo.concat(h.redo)) {
        if (e.snap.root) walk(e.snap.root);
        rekey(e.snap.panes);
        for (const d of e.snap.decks || []) {
          walk(d.root);
          rekey(d.panels);
        }
      }
    }
  }

  // Puts the current workspace in the snapshot's arrangement. Tabs move into their
  // panes first and leave the others after, so a kept pane never empties on the way.
  function applySnapshot(snap) {
    const ws = currentWs;
    let root = JSON.parse(JSON.stringify(snap.root));
    const claimed = new Set();
    const plan = [];
    for (const id of leaves(root)) {
      if (id === "main") continue;
      const spec = snap.panes[id];
      const descs = [];
      for (const s of (spec && spec.tabs) || []) {
        const d = liveDescOf(s);
        if (d && !claimed.has(d.id)) {
          claimed.add(d.id);
          descs.push(d);
        }
      }
      if (descs.length) plan.push({ id, descs, active: spec.active });
      else root = removeLeaf(root, id); // none of its tabs is open any more
    }
    endDrag();
    closeAddMenu(false);
    pendingAdd = null;
    const was = restoring;
    applying = true;
    restoring = true;
    try {
      const fromCenter = plan.flatMap((it) => it.descs).filter((d) => !PQ().tabs.some((t) => t.id === d.id));
      if (fromCenter.length) leaveNativeSplitFor(fromCenter);
      for (const it of plan) {
        let panel = panels.get(it.id);
        if (!panel || panel.wsId !== ws) {
          panel = makePanel(ws);
          renamePane(root, it.id, panel.id);
        }
        for (const d of it.descs) if (panelOfDesc(d.id) !== panel) moveInto(panel, d);
        it.descs.forEach((d, i) => {
          const at = tabsOf(panel).findIndex((t) => t.id === d.id);
          if (at >= 0 && at !== i) PQ().reorder(panel.popup, at, i);
        });
        const active = it.descs.some((d) => d.id === it.active) ? it.active : it.descs[it.descs.length - 1].id;
        PQ().select(panel.popup, active);
      }
      for (const p of [...panels.values()]) {
        if (p.wsId !== ws) continue;
        for (const t of tabsOf(p)) {
          if (claimed.has(t.id)) continue;
          // a duplicate the dock opened goes away (redo reopens it), unless it is the canvas's last tab
          if (isCanvasDesc(t) && dupTabs.has(tabIdOf(t)) && hasTwin(ws, t.tab)) closeDuplicate(t);
          else returnToMain(t);
        }
      }
      const keep = new Set(leaves(root));
      for (const p of [...panels.values()]) if (p.wsId === ws && !keep.has(p.id)) removePanel(p.id);
      layouts.set(ws, root);
      const inPanes = new Set(PQ().tabs.filter(isCenterKind).map(tabIdOf));
      const ok = (id) => !!id && !inPanes.has(id) && !!liveTab(ws, id);
      try {
        if (ok(snap.chat) && W().activeChatTabId !== snap.chat) W().setActiveCenterTab(snap.chat);
        if (ok(snap.center) && W().activeCenterTabId !== snap.center) W().setActiveCenterTab(snap.center);
      } catch (_) {}
      lastActiveChat = W().activeChatTabId;
      seenActive.set(ws, activeNow()); // not a pick by the user (syncDecks)
    } finally {
      restoring = was;
      applying = false;
    }
    // The center bar shows the returned tabs now (CSS hides transferred ones), so
    // the next tick sees whether the center has tabs again.
    outIds = transferredIds();
    dirty = true;
    if (host && dynStyle) relayout();
    schedule();
  }

  // Puts the snapshot's deck list back and, when its active deck is another one,
  // switches to that deck with the snapshot's arrangement (see the rules above).
  // screen: also put the snapshot's panes back when the same deck stays on screen
  // (moved tabs, a deck's "close all"), before the decks are synced: a tab still in
  // a pane would otherwise be claimed by the deck on screen.
  function applyDeckState(snap, screen) {
    const ws = currentWs;
    const ds = decksOf(ws);
    const switching = snap.active !== ds.active;
    if (layouts.has(ws)) captureDeck(ws);
    const cur = new Map(ds.decks.map((d) => [d.id, d]));
    const known = new Set();
    for (const m of snap.decks) for (const id of m.members) known.add(id);
    ds.decks = snap.decks.map((m) => {
      const c = cur.get(m.id);
      // The arrangement: the snapshot's for a deck that is gone and for the deck it
      // brings on screen; the stored one for the others (the same, maybe resized).
      const base = !c || (switching && m.id === snap.active) ? m : c;
      const members = m.members.concat(c ? c.members.filter((id) => !known.has(id)) : []);
      return JSON.parse(JSON.stringify({ id: m.id, name: m.name, root: base.root, panels: base.panels, members, mainActive: base.mainActive, chat: base.chat }));
    });
    if (!ds.decks.length) ds.decks.push(blankDeck(deckName(1)));
    ds.active = ds.decks.some((d) => d.id === snap.active) ? snap.active : ds.decks[0].id;
    ds.touched = true;
    for (const d of ds.decks) departed.delete(d.id);
    renumberDecks(ds.decks);
    if (switching) {
      if (snap.root) applySnapshot(snap);
      else {
        // Recorded on another workspace (no screen part): the deck's stored arrangement.
        endDrag();
        closeAddMenu(false);
        pendingAdd = null;
        const was = restoring;
        restoring = true;
        try {
          dissolvePanes(ws);
          layouts.set(ws, leaf("main"));
          applyDeck(ws, activeDeck(ds), true);
        } finally {
          restoring = was;
        }
      }
    } else if (screen && snap.root) applySnapshot(snap);
    reviveDecks(ws);
    seenActive.set(ws, activeNow());
    // Hide the other decks' tabs now, not on the next tick: no flash of them.
    outIds = transferredIds();
    syncDecks(true);
    dirty = true;
    if (host && dynStyle) relayout();
    save();
    announce(ws, true);
    schedule();
  }

  // One step back ("undo") or forward ("redo"). An entry that changes nothing on
  // screen any more (its tabs were closed) is passed over while older ones remain.
  function stepHistory(dir) {
    syncWs();
    if (destroyed || frozen || !currentWs || !S.pq || !S.ws || W().selectedWorkspaceId !== currentWs) return false;
    const h = historyOf();
    const ds = decksOf(currentWs);
    const from = dir === "undo" ? h.undo : h.redo;
    const to = dir === "undo" ? h.redo : h.undo;
    while (from.length) {
      const entry = from.pop();
      if (entry.op) {
        // A step with its own undo/redo: a deck's "close all" (run), a move to a new
        // workspace (see "a tab dropped on a "+"").
        if (typeof entry.op.run === "function") {
          if (entry.op.run(dir)) return true;
          continue;
        }
        if (entry.op.redo ? dir === "redo" && redoMove(entry.op) : dir === "undo" && undoMove(entry.op)) return true;
        continue;
      }
      const deckStep = DECK_KINDS.has(entry.kind);
      const sig = stateSig();
      if (!deckStep && entry.snap.active && entry.snap.active !== ds.active) {
        // A layout step made on another deck: undone (or redone) on that deck.
        if (!ds.decks.some((d) => d.id === entry.snap.active)) continue; // that deck is gone
        applying = true;
        try {
          switchDeck(currentWs, entry.snap.active);
        } finally {
          applying = false;
        }
      }
      const before = snapshot();
      if (deckStep && dir === "undo" && entry.kind === "deck-create") closeBornChats(entry.snap);
      if (deckStep) applyDeckState(entry.snap, entry.kind === "deck-tabs"); // tabs moved between decks: their panes too
      else applySnapshot(entry.snap);
      if (stateSig() === sig && from.length && entry.kind !== "deck-tabs") continue; // (moved tabs change deck membership only)
      to.push({ kind: entry.kind, snap: before });
      if (to.length > HISTORY_MAX) to.shift();
      h.lastKind = null;
      h.lastAt = Date.now();
      toast(`${dir === "undo" ? "Undid" : "Redid"} ${KIND_LABEL[entry.kind] || "change"}`);
      return true;
    }
    return false;
  }

  // "undo" | "redo" | null for a keydown: ⌘Z / Ctrl+Z, ⌘⇧Z / Ctrl+Shift+Z, Ctrl+Y.
  function historyKey(e) {
    if (e.altKey || e.metaKey === e.ctrlKey) return null; // neither, or both
    const k = String(e.key || "").toLowerCase();
    const latin = /^[a-z]$/.test(k);
    if (k === "z" || (!latin && e.code === "KeyZ")) return e.shiftKey ? "redo" : "undo";
    if ((k === "y" || (!latin && e.code === "KeyY")) && e.ctrlKey && !e.shiftKey) return "redo";
    return null;
  }

  // True when the key belongs to something else (see the rules above).
  function shortcutOwnedElsewhere(e) {
    const a = document.activeElement;
    for (const n of [asEl(e.target), a instanceof Element && a !== document.body ? a : null]) {
      if (!n) continue;
      if (/^(IFRAME|WEBVIEW|EMBED|OBJECT)$/.test(n.tagName)) return true;
      if (n.isContentEditable || n.closest(EDITABLE) || n.closest(BUSY)) return true;
    }
    if (canvasOwned || inCanvas(e.target)) {
      const shown = [...document.querySelectorAll("[data-canvas-shell], [data-canvas-root]")].some((c) => c.getClientRects().length);
      if (shown) return true;
    }
    return false;
  }

  // The dock follows a workspace switch on its next tick: an action right after one
  // brings it up to date first (its history, its panes).
  function syncWs() {
    if (!destroyed && !frozen && S.ws && S.pq && W().selectedWorkspaceId && W().selectedWorkspaceId !== currentWs) tick();
  }

  function onHistoryKey(e) {
    if (destroyed || frozen || e.defaultPrevented || e.isComposing) return;
    const dir = historyKey(e);
    if (dir) syncWs();
    if (!dir || !mainNode || !currentWs || !S.pq || !S.ws || drag || resizing) return;
    const h = historyOf();
    if (!(dir === "undo" ? h.undo : h.redo).length) return;
    if (shortcutOwnedElsewhere(e)) return;
    if (dir === "undo" && treeDropAt > h.lastAt) {
      treeDropAt = 0; // this press is the file tree's
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    stepHistory(dir);
  }

  // Ownership as the canvas view tracks it.
  const onOwnerEvent = (e) => {
    canvasOwned = inCanvas(e.target);
    if (canvasOwned && e.type === "pointerdown") claimCanvasSelection(e.target);
  };

  // The chat's canvas selection follows the last clicked canvas (see the header).
  // With several canvases mounted, a pointerdown in one re-runs its own claim
  // effect, TGi in the bundle:
  //   useEffect(() => { if (!active) return; const off = claim(handle);
  //     publish(handle, lastSummary); return off; }, [active, handle])
  // found on the nearest ancestor fiber of its [data-canvas-shell] with an effect
  // whose deps are [true, { handleRef }]. React keeps its own cleanup (on unmount it
  // releases the handle if that canvas still holds it), so the cleanup returned here
  // is not kept. True when a claim ran.
  function claimCanvasSelection(target) {
    const n = asEl(target);
    const shell = n && n.closest("[data-canvas-shell]");
    if (!shell || document.querySelectorAll("[data-canvas-shell]").length < 2) return false; // a lone canvas holds it already
    for (let f = fiberOf(shell), up = 0; f && up < 400; f = f.return, up++) {
      let h = f.memoizedState;
      if (!h || typeof h !== "object" || !("next" in h)) continue;
      for (let i = 0; h && i < 400; i++, h = h.next) {
        const fx = h.memoizedState;
        if (!fx || typeof fx !== "object" || typeof fx.create !== "function" || !Array.isArray(fx.deps) || fx.deps.length !== 2) continue;
        const [on, handle] = fx.deps;
        if (on !== true || !handle || typeof handle !== "object") continue;
        const keys = Object.keys(handle);
        if (keys.length !== 1 || keys[0] !== "handleRef" || !handle.handleRef || typeof handle.handleRef !== "object") continue;
        try {
          fx.create();
        } catch (_) {
          return false;
        }
        return true;
      }
    }
    return false;
  }
  const onWindowBlur = () => {
    canvasOwned = false;
    schedule(); // a tear-out opens a window (this one blurs): its tab gets its origin and close hooks now, not on the next poll
  };

  // A short status line centered under the dock area ("Undid split"), with an
  // optional action button (opt.action: { label, run }) and duration (opt.ms).
  // Hovering a toast with an action keeps it up.
  function toast(text, opt) {
    if (!document.body) return;
    if (!toastEl || !toastEl.isConnected) {
      toastEl = el("rtd-toast");
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      toastEl.addEventListener("mouseenter", () => {
        if (toastEl.hasAttribute("data-action")) clearTimeout(toastTimer);
      });
      toastEl.addEventListener("mouseleave", () => {
        if (!toastEl.hasAttribute("data-action") || !toastEl.hasAttribute("data-show")) return;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(hideToast, 1500);
      });
      document.body.appendChild(toastEl);
    }
    const msg = el("rtd-toast-text", "span");
    msg.textContent = text;
    toastEl.replaceChildren(msg);
    const action = opt && opt.action && typeof opt.action.run === "function" ? opt.action : null;
    toastEl.toggleAttribute("data-action", !!action);
    if (action) {
      const sep = el("rtd-toast-sep", "span");
      sep.setAttribute("aria-hidden", "true");
      sep.textContent = "·";
      const b = el("rtd-toast-btn", "button");
      b.type = "button";
      b.textContent = action.label || "Undo";
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideToast();
        action.run();
      });
      toastEl.append(sep, b);
    }
    const r = host && host.isConnected ? host.getBoundingClientRect() : null;
    toastEl.style.left = r && r.width ? `${Math.round(r.left + r.width / 2)}px` : "";
    toastEl.style.bottom = r && r.height ? `${Math.max(16, Math.round(innerHeight - r.bottom + 16))}px` : "";
    toastEl.setAttribute("data-show", "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, (opt && opt.ms) || TOAST_MS);
  }
  function hideToast() {
    clearTimeout(toastTimer);
    if (toastEl) toastEl.removeAttribute("data-show");
  }

  // ------------------------------------------ a tab dropped on a "+": new workspace
  // Dragging a tab over a "+" (a pane's, or the center's) turns it into a "New
  // workspace" pill (the split preview's outline and tint); dropping there moves
  // the tab to a new workspace. Only on drop, never on hover. What the bundle has:
  //   - no store action moves a chat between workspaces: a chat tab lives in its
  //     workspace's centerTabs, its session host and transcript are keyed by
  //     "<workspaceId>::<chatTabId>", and its agent runs in that worktree. So the
  //     dock does the app's fork across workspaces: the new workspace's first chat
  //     starts from the transcript as seed messages (createWorkspace's
  //     chatSeedMessages, in the format forkChatTab uses: text and tool calls,
  //     the same size limits), with the same name, model, effort and composer
  //     draft, and the source chat is archived (archiveChatTab; undo unarchives
  //     it). A workspace's own first chat cannot be archived (the app refuses):
  //     it stays and the new workspace gets a copy. So does a chat that owns tabs
  //     (archiving closes them and ends its terminals, which undo cannot bring
  //     back), and one whose transcript is not mounted (not readable). The toast
  //     says it is a copy ("Copied to new workspace <name>", "(last N messages)"
  //     when the seed left older ones out). The new chat only holds the seed: no
  //     first turn is sent (no initialTurn), the agent runs when the user sends;
  //   - the workspace is the native "New Workspace": createWorkspace(projectId,
  //     name, Map(repoId -> branch), "create_workspace", undefined, opts), i.e.
  //     createLocalWorktree. Name: the chat's name as a slug ("make-it-red"),
  //     unique in the project (the app's suggested name for an unnamed chat);
  //     base: the primary checkout's branch. Created in the background (its card
  //     shows up at once; "rtd:workspace-created" on window) and selected once the
  //     tab has flown into the "+";
  //   - undo (the toast's Undo, or ⌘Z in either workspace): the chat comes back to
  //     its pane (the whole arrangement when nothing changed there since) and the
  //     new workspace is deleted (deleteWorkspace) once it has materialized,
  //     unless one of its chats was used (a session, or a draft of its own) or the
  //     source chat is gone. Redo moves it again, to a new workspace. Only chats
  //     move: other tabs belong to their worktree.
  // a pane's "+", the center's (and its right side's in the native split)
  const PLUS_SEL = '.rtd-add, [data-testid="center-panel-add-tab-button"], [data-testid="center-panel-add-tab-button-right"]';
  const FLY_MS = 520; // the tab's flight into the "+"
  const PULSE_MS = 260; // the "+" taking it (starts before the flight ends)
  const MOVE_TOAST_MS = 5000;
  const SEED_BUDGET = 150000; // the app's fork limits: transcript, text part, tool field
  const SEED_TEXT_MAX = 20000;
  const SEED_FIELD_MAX = 400;
  const GENERIC_CHAT = /^(new chat|chat|untitled)?$/i;
  let plusHover = null; // { btn, zone, ok }
  let plusPill = null;
  let pendingReturn = null; // { op, until }: a moved chat on its way back to its pane (undo)
  const moveGuard = new Map(); // wsId -> time until which its empty decks stay (the source deck while its tab flies)
  const flying = new Set();
  // Pane tabs whose chat was archived and that stay in their pane until the flight
  // ends (a pane left empty collapses, and its "+" with it).
  const heldTabs = new Map(); // descriptor id -> the move holding it
  const reducedMotion = () => {
    try {
      return matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  };
  const emit = (type, detail) => {
    try {
      window.dispatchEvent(new CustomEvent(type, { detail }));
    } catch (_) {}
  };
  const errText = (e) => String((e && e.message) || e || "unknown error").slice(0, 120);

  // The "+" under the pointer while a tab is dragged: a pane's (this workspace's)
  // or the chat center's. Once the pill is up, its whole area counts.
  function plusAt(e) {
    if (!drag) return null;
    if (plusHover && plusHover.btn.isConnected) {
      const z = plusHover.zone;
      if (e.clientX >= z.left && e.clientX <= z.right && e.clientY >= z.top && e.clientY <= z.bottom) return plusHover.btn;
    }
    const t = e.target;
    const btn = t && t.closest ? t.closest(PLUS_SEL) : null;
    if (!btn || !btn.getClientRects().length) return null;
    if (btn.classList.contains("rtd-add")) {
      const box = btn.closest(".rtd-panel");
      const p = box && panels.get(box.getAttribute("data-rtd-panel"));
      return p && p.wsId === currentWs ? btn : null;
    }
    return mainNode && mainNode.contains(btn) && btn.closest(CENTER) ? btn : null;
  }

  function overPlus(e, btn) {
    // The bar keeps the slot's room (its tabs stop sliding, no copy, no marker):
    // closing it would pull the "+" from under the pointer.
    if (barPreview) {
      for (const n of document.querySelectorAll("[data-rtd-shift]")) n.removeAttribute("data-rtd-shift");
      for (const n of [ghostEl, markerEl]) n.removeAttribute("data-on");
      barPreview.key = "";
    }
    bodyDrop = null;
    hideOutline();
    hintEl.removeAttribute("data-on");
    if (!plusHover || plusHover.btn !== btn) showPill(e, btn, wsDropCheck(freshDesc(drag.desc)));
    if (!plusHover.ok) {
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none"; // no preventDefault: no drop here
      return true;
    }
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    return true;
  }

  // The "+" grows into a pill from where it is (kept inside its pane).
  function showPill(e, btn, chk) {
    if (!plusPill) {
      plusPill = el("rtd-newws");
      plusPill.innerHTML = svg(ICON.plus);
      plusPill.appendChild(el("rtd-newws-label", "span"));
    }
    if (plusPill.parentElement !== dndEl) dndEl.appendChild(plusPill);
    if (plusHover && plusHover.btn !== btn) plusHover.btn.removeAttribute("data-rtd-newws");
    plusPill.lastChild.textContent = chk.ok ? "New workspace" : `New workspace · ${chk.reason}`;
    plusPill.toggleAttribute("data-off", !chk.ok);
    const hb = host.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    const box = btn.closest(".rtd-panel");
    const leafRect = lastLayout && lastLayout.rects.get(box ? box.getAttribute("data-rtd-panel") : "main");
    plusPill.style.left = "0px";
    plusPill.setAttribute("data-on", "");
    const w = plusPill.offsetWidth; // its own width (the slide-in scales it)
    let x = br.left - hb.left;
    if (leafRect) x = Math.max(leafRect.x + 6, Math.min(x, leafRect.x + leafRect.w - 6 - w));
    const h = 28;
    const y = Math.round(br.top + br.height / 2 - h / 2 - hb.top);
    plusPill.style.left = `${Math.round(x)}px`;
    plusPill.style.top = `${y}px`;
    btn.setAttribute("data-rtd-newws", "");
    const left = Math.min(br.left, hb.left + x) - 4;
    const right = Math.max(br.right, hb.left + x + w, e.clientX + 8) + 4;
    plusHover = { btn, ok: !!chk.ok, zone: { left, right, top: Math.min(br.top, hb.top + y) - 6, bottom: Math.max(br.bottom, hb.top + y + h) + 6 } };
  }

  function clearPlus() {
    if (plusHover) plusHover.btn.removeAttribute("data-rtd-newws");
    plusHover = null;
    if (plusPill) plusPill.removeAttribute("data-on");
  }

  // Whether chat tab `d` can go to a new workspace: { ok, reason, tab, ws, project }.
  function wsDropCheck(d, projectId) {
    const no = (reason) => ({ ok: false, reason });
    if (!d || !S.ws || !S.pq) return no("can't move this tab");
    if (d.kind !== "chat") return no("chats only");
    const st = W();
    const tab = liveTab(d.workspaceId, tabIdOf(d));
    const ws = st.workspaces.find((w) => w && w.id === d.workspaceId);
    if (!tab || tab.type !== "chat" || !ws) return no("can't move this tab");
    if (ws.hostMachineId != null) return no("chat on another machine");
    if (tab.createdByAgent) return no("agent chat");
    if (typeof st.createWorkspace !== "function" && typeof st.createLocalWorktree !== "function") return no("unavailable");
    try {
      if (typeof st.isChatInProgress === "function" && st.isChatInProgress(ws.id, tab.id)) return no("chat is running");
    } catch (_) {}
    const pid = typeof projectId === "string" && projectId ? projectId : ws.projectId;
    const project = (st.projects || []).find((p) => p && p.id === pid);
    if (!project || !Array.isArray(project.repos) || !project.repos.length) return no("no project");
    return { ok: true, reason: "", tab, ws, project };
  }

  // A chat tab as a descriptor: a "chat:<ws>:<id>" id, or a raw chat tab id (the
  // current workspace first, then the others).
  function chatDescOf(tabId) {
    if (typeof tabId !== "string" || !tabId || !S.ws) return null;
    const ids = [currentWs].concat(W().workspaces.map((w) => w && w.id)).filter(Boolean);
    for (const ws of ids) {
      const raw = refOf(ws, tabId) || (/^(chat|center):/.test(tabId) ? null : tabId);
      const live = raw && liveTab(ws, raw);
      if (live && live.type === "chat") return descFor(ws, live);
    }
    return null;
  }

  // The chat's transcript as its view renders it: the message list's `messages`
  // prop, below the [data-display-message-count] element of the ChatView whose
  // hostKey is { workspaceId, chatTabId }. null when that chat is not mounted.
  const isMsg = (m) => !!m && typeof m === "object" && typeof m.role === "string" && Array.isArray(m.content);
  function chatTranscript(wsId, tabId) {
    for (const n of document.querySelectorAll("[data-display-message-count]")) {
      let key = null;
      for (let f = fiberOf(n), up = 0; f && up < 160 && !key; f = f.return, up++) {
        const k = f.memoizedProps && f.memoizedProps.hostKey;
        if (k && typeof k === "object" && typeof k.chatTabId === "string") key = k;
      }
      if (!key || key.workspaceId !== wsId || key.chatTabId !== tabId) continue;
      const stack = [{ f: fiberOf(n), depth: 0 }];
      for (let seen = 0; stack.length && seen < 400; seen++) {
        const { f, depth } = stack.pop();
        if (!f) continue;
        const m = f.memoizedProps && f.memoizedProps.messages;
        if (Array.isArray(m) && m.every(isMsg)) return m;
        if (depth > 0 && f.sibling) stack.push({ f: f.sibling, depth });
        if (depth < 8 && f.child) stack.push({ f: f.child, depth: depth + 1 });
      }
    }
    return null;
  }

  // Seed messages as the app's fork makes them: text parts and tool calls (scalar
  // arguments, short results), the newest messages that fit, and a notice for
  // the ones left out.
  const clip = (s, n) => (s.length <= n ? s : s.slice(0, n) + "\n… [truncated when forking]");
  function seedOf(m) {
    const content = m.content.flatMap((c) =>
      c && c.type === "text" && typeof c.text === "string" && c.text.trim() ? [{ type: "text", text: clip(c.text, SEED_TEXT_MAX) }] : [],
    );
    const toolCalls = (Array.isArray(m.toolCalls) ? m.toolCalls : []).filter((t) => t && typeof t === "object").map((t) => {
      const args = {};
      for (const [k, v] of Object.entries(t.args && typeof t.args === "object" ? t.args : {})) {
        if (typeof v === "string") {
          if (v.length <= SEED_FIELD_MAX) args[k] = v;
        } else if (typeof v === "number" || typeof v === "boolean") args[k] = v;
      }
      const r = t.result;
      return {
        id: t.id,
        name: t.name,
        displayName: t.displayName,
        args,
        status: t.status === "pending" || t.status === "running" ? "aborted" : t.status,
        ...(r != null ? { result: { content: clip(String(r.content == null ? "" : r.content), SEED_FIELD_MAX), isError: r.isError, ...(r.filePath != null ? { filePath: r.filePath } : {}) } } : {}),
        ...(t.parentToolUseId != null ? { parentToolUseId: t.parentToolUseId } : {}),
      };
    });
    if (!content.length && !toolCalls.length) return null;
    const out = { id: m.id, role: m.role, content, toolCalls, timestamp: m.timestamp };
    for (const k of ["navigationContext", "navigationArtifactItems", "codeArtifactItems"]) if (m[k] != null) out[k] = m[k];
    if (m.isCompactSummary) out.isCompactSummary = true;
    if (m._isMiniTurn) out._isMiniTurn = true;
    return out;
  }
  function seedsFrom(msgs) {
    const all = msgs.filter((m) => m && m.restored !== true && (m.role === "user" || m.role === "assistant")).map(seedOf).filter(Boolean);
    const out = [];
    let room = SEED_BUDGET;
    for (let i = all.length - 1; i >= 0; i--) {
      const size = JSON.stringify(all[i]).length;
      if (size > room) break;
      out.unshift(all[i]);
      room -= size;
    }
    if (!out.length && all.length) {
      // The newest message alone is over the budget: its first parts, the last one cut.
      const last = { ...all[all.length - 1], toolCalls: [] };
      while (JSON.stringify(last).length > SEED_BUDGET && last.content.length > 1) last.content = last.content.slice(0, -1);
      const over = JSON.stringify(last).length - SEED_BUDGET;
      const tail = last.content[last.content.length - 1];
      if (over > 0 && tail) last.content = last.content.slice(0, -1).concat({ type: "text", text: clip(tail.text, Math.max(0, tail.text.length - over - 40)) });
      out.push(last);
    }
    const dropped = all.length - out.length;
    if (dropped > 0) {
      out.unshift({
        id: "fork-seed-omission-notice",
        role: "assistant",
        content: [{ type: "text", text: `[Forked from a longer conversation — the ${dropped} earliest message(s) were omitted.]` }],
        toolCalls: [],
        timestamp: (out[0] && out[0].timestamp) || Date.now(),
      });
    }
    return out;
  }

  // The composer draft (text and slash command) of a chat, in the app's draft store.
  function draftStore() {
    const d = window.__CHAT_INPUT_DRAFTS_STORE__;
    return d && typeof d.getState === "function" ? d : null;
  }
  function readDraft(wsId, tabId) {
    try {
      const ds = draftStore() && draftStore().getState();
      if (!ds) return null;
      const k = `${wsId}-${tabId}`;
      const text = ds.chatInputDrafts && typeof ds.chatInputDrafts[k] === "string" ? ds.chatInputDrafts[k] : "";
      const command = ds.chatInputDraftCommands && ds.chatInputDraftCommands[k] != null ? ds.chatInputDraftCommands[k] : null;
      return text.trim() || command ? { text, command } : null;
    } catch (_) {
      return null;
    }
  }
  function writeDraft(wsId, tabId, dr) {
    try {
      const ds = draftStore() && draftStore().getState();
      if (!ds) return;
      if (dr.text && typeof ds.setChatInputDraft === "function") ds.setChatInputDraft(wsId, tabId, dr.text);
      if (dr.command != null && typeof ds.setChatInputDraftCommand === "function") ds.setChatInputDraftCommand(wsId, tabId, dr.command);
    } catch (_) {}
  }

  // "Make it red!" -> "make-it-red" (40 characters at most, cut at a word).
  function slugOf(title) {
    const s = String(title || "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (s.length <= 40) return s;
    const cut = s.slice(0, 40);
    const i = cut.lastIndexOf("-");
    return (i >= 16 ? cut.slice(0, i) : cut).replace(/-+$/, "");
  }
  function workspaceNameFor(st, projectId, title) {
    let base = slugOf(title);
    if (!base) {
      try {
        base = typeof st.generateSuggestedName === "function" ? String(st.generateSuggestedName(projectId) || "") : "";
      } catch (_) {
        base = "";
      }
    }
    if (!base) base = "workspace";
    const taken = new Set(st.workspaces.filter((w) => w && w.projectId === projectId).map((w) => String(w.name || "").toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`.toLowerCase())) n++;
    return `${base}-${n}`;
  }
  // Base branch: the primary checkout's current branch (Map(repoId -> branch)).
  function primaryBranch(st, project) {
    const repo = project.repos[0];
    const main = st.workspaces.find((w) => w && w.projectId === project.id && w.mode === "local" && !w.isArchived);
    const r = main && main.repo;
    const b = r && ((typeof r.currentBranch === "string" && r.currentBranch.trim()) || (typeof r.baseBranch === "string" && r.baseBranch.trim()));
    return repo && repo.id && b ? new Map([[repo.id, b]]) : undefined;
  }

  function liftTab(d) {
    const out = [];
    for (const id of [d.id, tabIdOf(d)]) {
      for (const n of document.querySelectorAll(`[role="tab"][data-tab-id="${CSS.escape(String(id))}"]`)) {
        n.setAttribute("data-rtd-flying-src", "");
        out.push(n);
      }
    }
    return out;
  }
  function tabRect(d) {
    for (const id of [d.id, tabIdOf(d)]) {
      for (const n of document.querySelectorAll(`[role="tab"][data-tab-id="${CSS.escape(String(id))}"]`)) if (n.offsetWidth > 0) return n.getBoundingClientRect();
    }
    return null;
  }

  // Moves chat tab `d` to a new workspace (see above). o: { projectId,
  // sourcePaneId, fromRect, toEl, animate, follow }. Resolves { wsId, name,
  // moved, archived, history, chatTabId } once the workspace is in the store
  // (its worktree materializes after); moved: the tab left its workspace (its
  // chat continues in the new one), false when it stayed (a copy). Rejects when
  // the tab cannot go.
  function moveToNewWorkspace(d, o = {}) {
    const chk = wsDropCheck(d, o.projectId);
    if (!chk.ok) {
      toast(`Can't move to a new workspace: ${chk.reason}`);
      return Promise.reject(new Error(chk.reason));
    }
    const st = W();
    const { tab, ws, project } = chk;
    const src = ws.id;
    const title = tabLabel(tab);
    const named = !GENERIC_CHAT.test(String(tab.name || "").trim());
    const name = workspaceNameFor(st, project.id, named ? tab.name : "");
    const msgs = chatTranscript(src, tab.id);
    // Not mounted: a forked chat that never ran still has its seed messages.
    const own = !msgs && Array.isArray(tab.seedMessages) ? tab.seedMessages.filter(isMsg) : [];
    const seeds = msgs && msgs.length ? seedsFrom(msgs) : own.length ? seedsFrom(own) : [];
    const history = seeds.length > 0;
    // The seed left older messages out (its first entry is the omission notice).
    const lastN = history && seeds[0].id === "fork-seed-omission-notice" ? seeds.length - 1 : 0;
    // Archived only when nothing is lost: the transcript was read (and copied), or
    // the chat never had a session; and archiving would close none of its tabs.
    const safe = msgs ? true : !tab.sessionId;
    const ownsTabs = wsTabs(src).some((t) => t && t.type !== "chat" && t.ownerChatTabId === tab.id);
    const draft = readDraft(src, tab.id);
    const from = panelOfDesc(d.id);
    const paneId = typeof o.sourcePaneId === "string" && o.sourcePaneId ? o.sourcePaneId : from ? from.id : "main";
    const snap = snapshot(src);
    const before = new Set(st.workspaces.map((w) => w && w.id));
    const opts = { activation: "background" };
    if (history) opts.chatSeedMessages = seeds;
    if (tab.model) {
      opts.chatTabModel = tab.model;
      if (tab.effort != null) opts.chatTabEffort = tab.effort;
    }
    const base = primaryBranch(st, project);
    let created;
    try {
      created =
        typeof st.createWorkspace === "function"
          ? st.createWorkspace(project.id, name, base, "create_workspace", undefined, opts)
          : st.createLocalWorktree(project.id, name, base, "create_local_worktree", undefined, undefined, opts);
    } catch (e) {
      toast(`Could not create the workspace: ${errText(e)}`);
      return Promise.reject(e);
    }
    const ready = Promise.resolve(created);
    ready.catch(() => {}); // failMove below, or the caller
    const fresh = () => W().workspaces.find((w) => w && !before.has(w.id) && w.projectId === project.id) || null;

    const finish = (row) => {
      const cur = W();
      const chat = wsTabs(row.id).find((t) => t && t.type === "chat") || null;
      if (chat && named && typeof cur.renameChatTab === "function") {
        try {
          cur.renameChatTab(row.id, chat.id, tab.name);
        } catch (_) {}
      }
      if (chat && draft) writeDraft(row.id, chat.id, draft);
      let archived = false;
      const hold = {};
      if (safe && !ownsTabs && typeof cur.archiveChatTab === "function") {
        moveGuard.set(src, Date.now() + FLY_MS + 1500);
        try {
          cur.archiveChatTab(src, tab.id);
        } catch (_) {}
        archived = !liveTab(src, tab.id);
        if (archived && PQ().tabs.some((t) => t.id === d.id)) heldTabs.set(d.id, hold);
      }
      // The tab leaves its place while its copy flies (still taking its room, so the
      // "+" does not move under the copy).
      const lifted = archived ? liftTab(d) : [];
      const op = {
        srcWs: src,
        newWs: row.id,
        projectId: project.id,
        name,
        tabId: tab.id,
        descId: d.id,
        title,
        paneId,
        snap,
        archived,
        history,
        keep: archived ? null : !safe ? "history" : ownsTabs ? "tabs" : "first",
        lastN,
        destTabs: wsTabs(row.id).map((t) => t && t.id), // what the new workspace held when made (undo deletes it only if nothing was added)
        at: Date.now(),
        draft: chat && draft ? draft : null,
        ready,
        state: "done",
      };
      pushOp(op, !!o.redo);
      ready.then(null, (e) => failMove(op, e));
      dirty = true;
      schedule();
      emit("rtd:workspace-created", {
        wsId: op.newWs,
        name,
        tabId: tab.id,
        moved: archived,
        archived,
        history,
        sourceWsId: src,
        chatTabId: chat ? chat.id : null,
        projectId: project.id,
      });
      const flight = o.animate === false ? Promise.resolve() : flyTab(o.fromRect || tabRect(d), o.toEl, title);
      flight.then(() => {
        for (const n of lifted) n.removeAttribute("data-rtd-flying-src");
        if (destroyed) return;
        if (heldTabs.get(d.id) === hold) {
          heldTabs.delete(d.id);
          if (PQ().tabs.some((t) => t.id === d.id) && !liveTab(src, tab.id)) PQ().attach(d.id);
        }
        dirty = true;
        schedule();
        if (op.state !== "done") return;
        const now = W();
        if (o.follow !== false && now.selectedWorkspaceId === src && now.workspaces.some((w) => w && w.id === op.newWs) && typeof now.switchToWorkspace === "function") {
          try {
            Promise.resolve(now.switchToWorkspace(op.newWs)).catch(() => {});
          } catch (_) {}
        }
        toast(moveText(op), { action: { label: "Undo", run: () => undoMove(op) }, ms: MOVE_TOAST_MS });
      });
      return { wsId: op.newWs, name, moved: archived, archived, history, chatTabId: chat ? chat.id : null };
    };

    const row = fresh();
    if (row) return Promise.resolve(finish(row));
    return ready.then(
      (w) => {
        const r = (w && W().workspaces.find((x) => x && x.id === w.id)) || fresh();
        if (!r) throw new Error("the workspace did not open");
        return finish(r);
      },
      (e) => {
        toast(`Could not create the workspace: ${errText(e)}`);
        throw e;
      },
    );
  }

  // What the toast says: always a copy (the chat is copied, its history as seed
  // messages, even when the source is archived), "(last N messages)" when the
  // seed had to leave older ones out.
  function moveText(op) {
    const base = `Copied to new workspace ${op.name}`;
    if (op.keep === "history") return `${base} (without its history)`;
    return op.lastN ? `${base} (last ${op.lastN} messages)` : base;
  }

  // The move is one step in both workspaces' histories (⌘Z works from either). A
  // new move clears their redo; a redone one keeps the other redo steps.
  function pushOp(op, redone) {
    const entry = { kind: "workspace", snap: op.snap, op };
    for (const w of new Set([op.srcWs, op.newWs])) {
      const h = historyOf(w);
      if (!redone) h.redo.length = 0;
      h.undo.push(entry);
      if (h.undo.length > HISTORY_MAX) h.undo.shift();
      h.lastKind = "workspace";
      h.lastAt = Date.now();
    }
  }
  function dropOps(op) {
    const out = (a) => {
      for (let i = a.length - 1; i >= 0; i--) if (a[i].op === op) a.splice(i, 1);
    };
    for (const h of histories.values()) {
      out(h.undo);
      out(h.redo);
    }
  }

  // Nobody used it yet: no tab was added there (a terminal, a browser, a canvas, a
  // chat), its repo shows no change, no chat there has a session or is running, and
  // no composer holds a draft of its own (the one the move carried over is not).
  function workspaceUnused(op) {
    const st = W();
    const w = st.workspaces.find((x) => x && x.id === op.newWs);
    const repo = w && w.repo;
    if (repo && ((Number(repo.additions) || 0) > 0 || (Number(repo.deletions) || 0) > 0)) return false;
    let ds = null;
    try {
      ds = draftStore() && draftStore().getState();
    } catch (_) {}
    for (const t of wsTabs(op.newWs)) {
      if (t && Array.isArray(op.destTabs) && !op.destTabs.includes(t.id) && !(t.type === "chat" && t.isArchived === true)) return false;
      if (!t || t.type !== "chat") continue;
      if (t.sessionId) return false;
      try {
        if (typeof st.isChatInProgress === "function" && st.isChatInProgress(op.newWs, t.id)) return false;
      } catch (_) {}
      if (!ds) continue;
      const k = `${op.newWs}-${t.id}`;
      const text = ds.chatInputDrafts && typeof ds.chatInputDrafts[k] === "string" ? ds.chatInputDrafts[k] : "";
      const cmd = ds.chatInputDraftCommands ? ds.chatInputDraftCommands[k] : null;
      const att = ds.chatInputDraftAttachments ? ds.chatInputDraftAttachments[k] : null;
      if (text.trim() && !(op.draft && text === op.draft.text)) return false;
      if (cmd != null && !(op.draft && JSON.stringify(cmd) === JSON.stringify(op.draft.command))) return false;
      if (Array.isArray(att) && att.length) return false;
    }
    return true;
  }

  // The chat back in its workspace (unarchived, which selects it there) and, on
  // the tick that sees that workspace again, back in its pane (finishReturn).
  function bringBack(op) {
    const st = W();
    const t = wsTabs(op.srcWs).find((x) => x && x.id === op.tabId);
    pendingReturn = { op, until: Date.now() + 5000 };
    try {
      if (op.archived && t && t.isArchived === true && typeof st.unarchiveChatTab === "function") st.unarchiveChatTab(op.srcWs, op.tabId);
      else if (st.selectedWorkspaceId !== op.srcWs) {
        if (t && typeof st.selectWorkspaceChat === "function") st.selectWorkspaceChat(op.srcWs, op.tabId);
        else if (typeof st.switchToWorkspace === "function") Promise.resolve(st.switchToWorkspace(op.srcWs)).catch(() => {});
      }
    } catch (_) {}
    schedule();
  }
  // A source arrangement as a comparable shape: the tree (sizes left out) with
  // each pane as its tab descriptor ids.
  function shapeSig(root, tabsOfPane) {
    const walk = (n) => (n.t === "l" ? (n.id === "main" ? "main" : tabsOfPane(n.id)) : [n.d, n.c.map(walk)]);
    return JSON.stringify(walk(root));
  }
  function finishReturn() {
    const r = pendingReturn;
    if (!r) return;
    if (Date.now() > r.until) {
      pendingReturn = null;
      return;
    }
    const live = currentWs === r.op.srcWs && liveTab(r.op.srcWs, r.op.tabId);
    if (!live) return;
    pendingReturn = null;
    const d = descFor(r.op.srcWs, live);
    const snap = r.op.snap;
    const ws = currentWs;
    const ds = decksOf(ws);
    const snapTabs = (id) => ((snap.panes[id] && snap.panes[id].tabs) || []).map((t) => t.id);
    // The arrangement the move left: the snapshot without the tab (its pane gone
    // when it was the last one); or the snapshot itself (undone mid-flight).
    let left = null;
    let asSnap = null;
    if (snap && snap.root) {
      let root = JSON.parse(JSON.stringify(snap.root));
      for (const id of Object.keys(snap.panes)) if (snapTabs(id).length && snapTabs(id).every((x) => x === d.id)) root = removeLeaf(root, id);
      left = shapeSig(root, (id) => snapTabs(id).filter((x) => x !== d.id));
      asSnap = shapeSig(snap.root, snapTabs);
    }
    const now = shapeSig(layouts.get(ws) || leaf("main"), (id) => {
      const p = panels.get(id);
      return p ? tabsOf(p).map((t) => t.id) : [];
    });
    const sameDecks = snap && ds.active === snap.active && ds.decks.map((x) => x.id).join() === snap.decks.map((x) => x.id).join();
    if (left && sameDecks && (now === left || now === asSnap)) {
      applySnapshot(snap); // nothing changed there since: all of it as it was
      return;
    }
    // Only decks missing (the one its tab left, pruned while the copy was out) and no
    // deck added: that deck and its arrangement come back; the background prune's
    // own undo entry goes (its tab is back).
    const missing = snap ? snap.decks.filter((m) => !ds.decks.some((x) => x.id === m.id)) : [];
    const added = snap ? ds.decks.filter((x) => !snap.decks.some((m) => m.id === x.id)) : [];
    if (left && missing.length && !added.length) {
      const h = historyOf(ws);
      for (let i = h.undo.length - 1; i >= 0; i--) if (h.undo[i].kind === "deck-empty" && (h.undo[i].at || 0) >= (r.op.at || 0)) h.undo.splice(i, 1);
      applyDeckState(snap, true);
      return;
    }
    // Changed since: only the tab, back into its pane if that pane is still there.
    const p = panels.get(r.op.paneId);
    if (p && p.wsId === ws && panelOfDesc(d.id) !== p) {
      moveInto(p, d);
      PQ().select(p.popup, d.id);
      outIds = transferredIds();
      dirty = true;
      schedule();
    }
  }

  // Undo of a move (the toast's Undo, ⌘Z). True when handled (done, or refused
  // with a toast); false for a step that is over (undone, or failed).
  function undoMove(op) {
    if (!op || op.state !== "done" || destroyed) return false;
    const refuse = (why) => {
      op.state = "kept";
      dropOps(op);
      toast(`Can't undo: ${why}`);
      return true;
    };
    if (!W().workspaces.some((w) => w && w.id === op.srcWs) || !wsTabs(op.srcWs).some((t) => t && t.id === op.tabId)) return refuse(`${op.title} is gone from its workspace`);
    if (W().workspaces.some((w) => w && w.id === op.newWs) && !workspaceUnused(op)) return refuse(`${op.name} already has work in it`);
    op.state = "undone";
    dropOps(op);
    bringBack(op);
    // Deleted once materialized: removing it mid-setup would race the app's own setup.
    op.ready
      .then(
        () => {
          const now = W();
          if (!now.workspaces.some((w) => w && w.id === op.newWs) || typeof now.deleteWorkspace !== "function") return;
          if (!workspaceUnused(op)) {
            keepCopy(op);
            toast(`Kept ${op.name}: it has work in it now`); // used while it was being set up
            return;
          }
          return now.deleteWorkspace(op.newWs);
        },
        () => {}, // it never materialized: the app dropped it
      )
      .catch((e) => {
        keepCopy(op);
        toast(`Could not remove ${op.name} (${errText(e)}): it stays, and ${op.title} is back here too`);
      });
    emit("rtd:workspace-drop-undone", { wsId: op.newWs, name: op.name, tabId: op.tabId, sourceWsId: op.srcWs });
    const h = historyOf(op.srcWs);
    h.redo.push({ kind: "workspace", snap: op.snap, op: { redo: true, srcWs: op.srcWs, tabId: op.tabId, projectId: op.projectId } });
    if (h.redo.length > HISTORY_MAX) h.redo.shift();
    h.lastKind = null;
    h.lastAt = Date.now();
    toast(`Undid copy to ${op.name}`);
    return true;
  }

  // The new workspace stays after all (used meanwhile, or its delete failed): the
  // chat is back at home too, so the redo step (a second copy) goes.
  function keepCopy(op) {
    op.state = "kept";
    const h = historyOf(op.srcWs);
    for (let i = h.redo.length - 1; i >= 0; i--) {
      const e = h.redo[i];
      if (e.op && e.op.redo && e.op.srcWs === op.srcWs && e.op.tabId === op.tabId) h.redo.splice(i, 1);
    }
  }

  // Redo: the same chat to a new workspace again, from where it is now.
  function redoMove(op) {
    if (destroyed || currentWs !== op.srcWs) return false;
    const live = liveTab(op.srcWs, op.tabId);
    const d = live && live.type === "chat" ? descFor(op.srcWs, live) : null;
    if (!d || !wsDropCheck(d, op.projectId).ok) return false;
    const p = panelOfDesc(d.id);
    const plus = p ? p.add : mainNode && mainNode.querySelector('[data-testid="center-panel-add-tab-button"]');
    moveToNewWorkspace(d, { toEl: plus, fromRect: tabRect(d), projectId: op.projectId, redo: true }).catch(() => {});
    return true;
  }

  // The workspace could not be set up (the app shows why and drops it): the
  // chat comes back.
  function failMove(op, e) {
    if (op.state !== "done") return;
    if (destroyed) {
      // the dock is gone, the data is not: the source chat comes back
      op.state = "failed";
      try {
        if (op.archived && S.ws && typeof W().unarchiveChatTab === "function") W().unarchiveChatTab(op.srcWs, op.tabId, { select: false });
      } catch (_) {}
      return;
    }
    op.state = "failed";
    dropOps(op);
    bringBack(op);
    emit("rtd:workspace-drop-undone", { wsId: op.newWs, name: op.name, tabId: op.tabId, sourceWsId: op.srcWs, failed: true });
    toast(`Could not create ${op.name} (${errText(e)}): ${op.title} is back`);
  }

  // The tab flies from its place into the "+" (a copy with its label, on an arc,
  // shrinking into the button; the "+" is read again every frame, so a bar that
  // reflows under it does not matter), and the "+" pulses as it lands. Reduced
  // motion: the copy only fades and the "+" only glows. Resolves when it is over
  // (on timers: a hidden window has no frames and still finishes).
  const EASE = bezier(0.2, 0.8, 0.2, 1);
  function bezier(x1, y1, x2, y2) {
    const at = (a, b, t) => ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
    const slope = (a, b, t) => 3 * (1 - 3 * b + 3 * a) * t * t + 2 * (3 * b - 6 * a) * t + 3 * a;
    return (x) => {
      if (x <= 0 || x >= 1) return Math.max(0, Math.min(1, x));
      let t = x;
      for (let i = 0; i < 6; i++) {
        const d = slope(x1, x2, t);
        if (Math.abs(d) < 1e-6) break;
        t -= (at(x1, x2, t) - x) / d;
      }
      return at(y1, y2, Math.max(0, Math.min(1, t)));
    };
  }
  function flyTab(from, toEl, label) {
    return new Promise((resolve) => {
      const reduce = reducedMotion();
      const target = () => (toEl && toEl.isConnected && toEl.getClientRects().length ? toEl.getBoundingClientRect() : null);
      let over = false;
      let n = null;
      const done = () => {
        if (over) return;
        over = true;
        if (n) {
          n.remove();
          flying.delete(n);
        }
        resolve();
      };
      if (!from || !from.width || !document.body) {
        pulse(toEl, reduce);
        setTimeout(done, reduce ? 0 : PULSE_MS);
        return;
      }
      n = el("rtd-fly");
      n.setAttribute("data-rtd-type", "chat");
      const t = el("rtd-fly-label", "span");
      t.textContent = label || "Chat";
      n.appendChild(t);
      Object.assign(n.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
      document.body.appendChild(n);
      flying.add(n);
      let last = target();
      const fade = reduce || !last;
      const dur = fade ? 200 : FLY_MS;
      const t0 = performance.now();
      const frame = (now) => {
        if (over) return;
        const k = Math.min(1, (now - t0) / dur);
        if (fade) n.style.opacity = String(1 - k);
        else {
          const to = target() || last;
          last = to;
          const e = EASE(k);
          const dx = to.left + to.width / 2 - (from.left + from.width / 2);
          const dy = to.top + to.height / 2 - (from.top + from.height / 2);
          const lift = Math.min(24, 8 + Math.abs(dx) * 0.04) * Math.sin(Math.PI * e);
          // one scale for both axes (the label never squashes), down to the "+"'s size
          const sc = 1 + (Math.max(0.25, Math.min(1, to.width / from.width, to.height / from.height)) - 1) * e;
          n.style.transform = `translate(${(dx * e).toFixed(1)}px, ${(dy * e - lift).toFixed(1)}px) scale(${sc.toFixed(3)})`;
          n.style.opacity = String(k < 0.6 ? 1 : 1 - ((k - 0.6) / 0.4) * 0.9);
        }
        if (k < 1) requestAnimationFrame(frame);
        else n.style.visibility = "hidden";
      };
      requestAnimationFrame(frame);
      setTimeout(() => pulse(toEl, reduce), fade ? 0 : FLY_MS - 120);
      setTimeout(done, fade ? 220 : FLY_MS + PULSE_MS - 120);
    });
  }
  function pulse(btn, reduce) {
    if (!btn || !btn.isConnected) return;
    btn.removeAttribute("data-rtd-pulse");
    void btn.offsetWidth;
    btn.setAttribute("data-rtd-pulse", reduce ? "fade" : "");
    setTimeout(() => btn.removeAttribute("data-rtd-pulse"), PULSE_MS + 80);
  }

  // ------------------------------------------ canvas popovers stay in their pane
  // The canvas's own floating UI is portaled to document.body and placed against
  // the window, so a canvas in a pane opened it over the neighbor pane. What the
  // bundle does:
  //   - the comment composer and thread (S0i) are a fixed div at the pin's point
  //     (left/top = pin layer rect + pin), shifted by transform: translate(40px |
  //     calc(-100% - 14px), -34px), opening to the LEFT when the pin is past the
  //     middle of the WINDOW; the app only corrects vertically (window bottom);
  //   - the pin's hover preview (xhi) is a fixed div (left/bottom at the pin), the
  //     mention list a fixed div under/above the composer's rect;
  //   - menus, dropdowns and tooltips are Radix poppers (a fixed wrapper placed by
  //     floating-ui inside the window).
  // What the dock does: when panes are on screen and such an element's anchor
  // (the pin point; a popper's trigger, or the pointerdown that opened it) is
  // inside a canvas in a leaf (a pane, or the center), the element is kept inside
  // that leaf's content rect (below its tab bar, 8px in) with the CSS
  // `translate` property, which adds to the transform React and floating-ui set
  // and that they never write. The composer/thread first tries the other side of
  // its pin; anything larger than the leaf gets a max size and scrolls. Re-placed
  // on every change of the element (style, size), on window resize and scroll,
  // and when the panes are laid out again; not while the thread is dragged by
  // its header (it is placed when dropped). Pins are drawn inside the canvas, so
  // the pane (and the center, while panes are on screen) clips them.
  // Limits: a canvas popover that is neither one of these nor a Radix popper
  // (a fixed portal with no anchor the dock can read) stays where the app puts
  // it; a popper whose trigger is not inside a canvas (app menus) is left alone.
  const FLOAT_SEL =
    '[data-testid="canvas-comment-popover"], [data-testid^="canvas-comment-pin-preview-"], [data-testid="canvas-comment-mention-popover"], [data-radix-popper-content-wrapper]';
  const FLOAT_M = 8;
  const FLOAT_POINTER_MS = 2000; // a popper with no trigger (a context menu) opened by that pointerdown
  const floats = new Map(); // fixed root -> { kind, node, mo, ro, born, pointer }
  let floatPointer = null; // last pointerdown / contextmenu: { x, y, at, canvas }
  let floatBusy = false;
  let floatQueued = 0;

  function floatKind(n) {
    const t = n.getAttribute("data-testid") || "";
    if (t === "canvas-comment-popover") return "comment";
    if (t.startsWith("canvas-comment-pin-preview-")) return "preview";
    if (t === "canvas-comment-mention-popover") return "mention";
    return n.hasAttribute("data-radix-popper-content-wrapper") ? "popper" : null;
  }
  // The element that carries the position (fixed): the match or an ancestor.
  function floatRootOf(n) {
    for (let e = n, i = 0; e && e !== document.body && i < 5; e = e.parentElement, i++) if (getComputedStyle(e).position === "fixed") return e;
    return null;
  }
  function trackFloats() {
    for (const root of [...floats.keys()]) if (!root.isConnected) untrackFloat(root);
    if (destroyed || !document.body) return;
    for (const n of document.body.querySelectorAll(FLOAT_SEL)) {
      const kind = floatKind(n);
      const root = kind ? floatRootOf(n) : null;
      if (!root || floats.has(root)) continue;
      const f = { kind, node: n, mo: null, ro: null, born: Date.now(), pointer: floatPointer };
      f.mo = new MutationObserver(() => placeFloats());
      f.mo.observe(root, { attributes: true, attributeFilter: ["style"] });
      if (typeof ResizeObserver === "function") {
        f.ro = new ResizeObserver(() => placeFloats());
        f.ro.observe(root);
      }
      floats.set(root, f);
    }
  }
  function untrackFloat(root) {
    const f = floats.get(root);
    if (!f) return;
    f.mo.disconnect();
    if (f.ro) f.ro.disconnect();
    floats.delete(root);
  }
  function queueFloats() {
    if (floatQueued) return;
    floatQueued = requestAnimationFrame(() => {
      floatQueued = 0;
      trackFloats();
      placeFloats();
    });
  }

  // The content rect (viewport coordinates, below the tab bar) of the leaf at a
  // point, while panes are on screen; null otherwise.
  function leafBoxAt(x, y) {
    if (!host || !lastLayout || !currentWs || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (![...panels.values()].some((p) => p.wsId === currentWs && lastLayout.rects.has(p.id))) return null;
    const hb = host.getBoundingClientRect();
    for (const [id, r] of lastLayout.rects) {
      if (hiddenNow.has(id)) continue;
      const L = hb.left + r.x;
      const T = hb.top + r.y;
      if (x < L || x > L + r.w || y < T || y > T + r.h) continue;
      const hh = Math.max(0, Math.min(headerHeight(id), r.h - 40));
      return { left: L, top: T + hh, right: L + r.w, bottom: T + r.h, width: r.w, height: r.h - hh };
    }
    return null;
  }
  const inCanvasEl = (n) => !!(n && n.closest && n.closest(CANVAS_SCOPE));
  // The content rect of the leaf whose DOM holds this element (a pin, a pin layer):
  // a pin scrolled out of its pane's view is still that pane's.
  function leafBoxOfEl(n) {
    if (!n || !host || !lastLayout || !currentWs) return null;
    const box = n.closest(".rtd-panel");
    const id = box ? box.getAttribute("data-rtd-panel") : mainNode && mainNode.contains(n) ? "main" : null;
    const r = id && !hiddenNow.has(id) ? lastLayout.rects.get(id) : null;
    if (!r || ![...panels.values()].some((p) => p.wsId === currentWs && lastLayout.rects.has(p.id))) return null;
    const hb = host.getBoundingClientRect();
    const hh = Math.max(0, Math.min(headerHeight(id), r.h - 40));
    return { left: hb.left + r.x, top: hb.top + r.y + hh, right: hb.left + r.x + r.w, bottom: hb.top + r.y + r.h, width: r.w, height: r.h - hh };
  }
  // The pin of a pin preview: of the pins with its thread id (one per instance of the
  // canvas), the one at the preview's point (it is placed at its pin: left, bottom).
  function previewPin(root, f) {
    const id = (f.node.getAttribute("data-testid") || "").slice("canvas-comment-pin-preview-".length);
    if (!id) return null;
    let pins = [];
    try {
      pins = [...document.querySelectorAll(`[data-testid="canvas-comment-pin-${CSS.escape(id)}"]`)];
    } catch (_) {
      pins = [];
    }
    if (pins.length < 2) return pins[0] || null;
    const x = parseFloat(root.style.left);
    const y = innerHeight - parseFloat(root.style.bottom);
    let best = null;
    let bestD = Infinity;
    for (const pin of pins) {
      const r = pin.getBoundingClientRect();
      const d = Math.abs(r.left - x) + Math.abs(r.bottom - y);
      if (d < bestD) {
        bestD = d;
        best = pin;
      }
    }
    return best;
  }
  // The pin layer a comment popover belongs to: the one holding its point, else the
  // nearest (its pin may be scrolled out of the canvas's view).
  function pinLayerAt(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const l of document.querySelectorAll('[data-testid="canvas-comment-pin-layer"]')) {
      if (!l.getClientRects().length) continue;
      const r = l.getBoundingClientRect();
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    return best;
  }

  // Where the element belongs: the leaf of its anchor (see above), or null.
  function floatBounds(root, f) {
    const px = (v) => parseFloat(v);
    if (f.kind === "comment") {
      const x = px(root.style.left);
      const y = px(root.style.top);
      const layer = pinLayerAt(x, y);
      return (layer && leafBoxOfEl(layer)) || leafBoxAt(x, y);
    }
    if (f.kind === "preview") {
      const pin = previewPin(root, f);
      return (pin && leafBoxOfEl(pin)) || leafBoxAt(px(root.style.left), innerHeight - px(root.style.bottom));
    }
    if (f.kind === "mention") {
      for (const [r, g] of floats) if (g.kind === "comment" && r.isConnected) return floatBounds(r, g);
      const b = root.getBoundingClientRect();
      return leafBoxAt(b.left, b.top);
    }
    const id = f.node.firstElementChild && f.node.firstElementChild.id;
    let trigger = null;
    if (id) {
      try {
        trigger = document.querySelector(`[aria-controls="${CSS.escape(id)}"], [aria-describedby~="${CSS.escape(id)}"]`);
      } catch (_) {
        trigger = null;
      }
    }
    if (trigger) {
      if (!inCanvasEl(trigger)) return null;
      const t = trigger.getBoundingClientRect();
      return leafBoxAt(t.left + t.width / 2, t.top + t.height / 2);
    }
    const p = f.pointer;
    return p && p.canvas && f.born - p.at < FLOAT_POINTER_MS ? leafBoxAt(p.x, p.y) : null;
  }

  function floatShift(root) {
    const m = /^(-?\d+),(-?\d+)$/.exec(root.dataset.rtdShift || "");
    return m ? { x: +m[1], y: +m[2] } : { x: 0, y: 0 };
  }
  function setFloatShift(root, x, y) {
    const v = x || y ? `${x}px ${y}px` : "";
    if (root.style.translate !== v) root.style.translate = v;
    if (x || y) root.dataset.rtdShift = `${x},${y}`;
    else delete root.dataset.rtdShift;
  }
  function unfixFloat(root) {
    setFloatShift(root, 0, 0);
    if (root.dataset.rtdHid) {
      root.style.visibility = "";
      delete root.dataset.rtdHid;
    }
    if (root.dataset.rtdMaxw) {
      root.style.maxWidth = "";
      delete root.dataset.rtdMaxw;
    }
    if (root.dataset.rtdMaxh) {
      root.style.maxHeight = "";
      root.style.overflowY = "";
      delete root.dataset.rtdMaxh;
    }
  }

  function placeFloat(root, f) {
    const P = floatBounds(root, f);
    if (!P) return unfixFloat(root);
    if (f.kind === "preview") {
      // its pin scrolled out of the pane's view (clipped): the card would point at nothing
      const pin = previewPin(root, f);
      const pr = pin && pin.getBoundingClientRect();
      const out = !!pr && (pr.right < P.left || pr.left > P.right || pr.bottom < P.top || pr.top > P.bottom);
      if (out !== !!root.dataset.rtdHid) {
        root.style.visibility = out ? "hidden" : "";
        if (out) root.dataset.rtdHid = "1";
        else delete root.dataset.rtdHid;
      }
      if (out) return;
    }
    if (f.kind === "comment" && root.style.userSelect === "none") return; // dragged by its header: placed when dropped
    const cur = floatShift(root);
    // its own size first (a max size set earlier is lifted to measure again)
    if (root.dataset.rtdMaxw) root.style.maxWidth = "";
    if (root.dataset.rtdMaxh) {
      root.style.maxHeight = "";
      root.style.overflowY = "";
    }
    let r = root.getBoundingClientRect();
    const maxW = Math.floor(P.width - 2 * FLOAT_M);
    const maxH = Math.floor(P.height - 2 * FLOAT_M);
    if (r.width > maxW && maxW > 40) {
      root.style.maxWidth = `${maxW}px`;
      root.dataset.rtdMaxw = "1";
      r = root.getBoundingClientRect(); // narrower: its text wraps, it may grow taller
    } else delete root.dataset.rtdMaxw;
    if (r.height > maxH && maxH > 40) {
      root.style.maxHeight = `${maxH}px`;
      root.style.overflowY = "auto";
      root.dataset.rtdMaxh = "1";
      r = root.getBoundingClientRect();
    } else delete root.dataset.rtdMaxh;
    const baseL = r.left - cur.x;
    const baseT = r.top - cur.y;
    const w = r.width;
    const h = r.height;
    let left = baseL;
    const fits = (l) => l >= P.left + FLOAT_M - 0.5 && l + w <= P.right - FLOAT_M + 0.5;
    if (f.kind === "comment" && !fits(left)) {
      // the other side of its pin (the app's own offsets: 40px right, 14px left)
      const pin = parseFloat(root.style.left);
      const alt = baseL + w <= pin + 1 ? pin + 40 : pin - 14 - w;
      if (fits(alt)) left = alt;
    }
    left = Math.max(P.left + FLOAT_M, Math.min(left, P.right - FLOAT_M - w));
    const top = Math.max(P.top + FLOAT_M, Math.min(baseT, P.bottom - FLOAT_M - h));
    setFloatShift(root, Math.round(left - baseL), Math.round(top - baseT));
  }

  function placeFloats() {
    if (floatBusy || destroyed) return;
    floatBusy = true;
    try {
      for (const [root, f] of floats) {
        if (!root.isConnected) continue;
        try {
          placeFloat(root, f);
        } catch (_) {}
      }
    } finally {
      for (const f of floats.values()) f.mo.takeRecords(); // its own writes
      floatBusy = false;
    }
  }

  // New portals (body children): tracked and placed before they paint.
  const floatBodyObs = new MutationObserver(() => {
    trackFloats();
    placeFloats();
  });
  const onFloatPointer = (e) => {
    floatPointer = { x: e.clientX, y: e.clientY, at: Date.now(), canvas: inCanvasEl(asEl(e.target)) };
  };

  // ---------------------------------- external window closed: the tab goes home
  // A tab torn out into an external window (the app's own popout: tearOut /
  // detach, a window named "tempo-tab-popout-<uuid>") comes back to where it was
  // when that window closes, or when its tab's "×" is clicked in it: the same
  // pane at the same index; a pane that went away with it (its only tab) is made
  // again on the same side of the same neighbor; with neither, the center at the
  // nearest index. What the bundle does on its own: its popout host notices the
  // close (electronAPI.window.onTabPopoutClosed, else polling popup.closed) and
  // runs xq(tab) + attach for each tab: a chat goes back to the center, a center
  // tab (terminal, browser, canvas) is CLOSED (closeDiffTab), a design canvas too;
  // its "×" does the same. Nothing reopens on boot. What the dock does:
  //   - every tick it notes where each tab is (pane, index, neighbor in the tree);
  //     a tab that shows up in an external window has, as its origin, where it was
  //     on the tick before. Origins are kept in localStorage (EXT_KEY);
  //   - the popout is same-origin: the dock listens to its pagehide/beforeunload
  //     and, in the capture phase of its document, to its tabs' "×" (click) and
  //     middle click (auxclick), and moves those tabs home right then (moveToPopup
  //     into the pane / attach into the center): the app's host then has no tab,
  //     unmounts and closes nothing;
  //   - safety net: a tab the app closed anyway comes back with
  //     applyRemoteTabOp("open") from the copy kept with its origin (a center tab;
  //     a terminal starts a new session), a chat it attached goes home on the
  //     next tick; after a reload (the window is gone) tabs with an origin go home
  //     once their workspace is on screen;
  //   - a tab dragged out of the window by hand goes where it is dropped (only a
  //     close sends it home).
  // Limits: a design canvas, doc or issue tab the app closed from its window
  // (closeDesignTabForWorkspace / the docs and issues view tabs) is not reopened.
  const EXT_KEY = "re-tempo:pane-dock:external:v1";
  const external = new Map(); // descriptor id -> { ws, deck, pane, index, near, desc, closing?, popup? }
  let placeBefore = new Map(); // descriptor id -> where it was on the last tick
  const hookedPopups = new WeakSet();
  const popupUnhooks = new Map(); // window -> removes its listeners (on teardown, or once it closed)
  try {
    const raw = JSON.parse(localStorage.getItem(EXT_KEY) || "{}") || {};
    for (const [id, o] of Object.entries(raw)) if (o && typeof o === "object" && typeof o.ws === "string" && o.desc) external.set(id, { ...o, boot: true, restored: true }); // its window went with the reload: opened again
  } catch (_) {}
  function saveExternal() {
    if (frozen || destroyed) return;
    try {
      const out = {};
      for (const [id, o] of external) if (!o.closing) out[id] = { ws: o.ws, deck: o.deck, pane: o.pane, index: o.index, near: o.near, desc: o.desc, size: o.size || null };
      if (Object.keys(out).length) localStorage.setItem(EXT_KEY, JSON.stringify(out));
      else localStorage.removeItem(EXT_KEY);
    } catch (_) {}
  }
  const isExternal = (popup) => !!popup && typeof popup.name === "string" && !popup.name.startsWith(POPUP_PREFIX);
  // A descriptor as kept with an origin: no window, the center tab as it was (to reopen it).
  function keptDesc(d) {
    const out = { ...d };
    delete out.popup;
    if (out.kind === "center" && out.tab) out.tab = JSON.parse(JSON.stringify(out.tab));
    return out;
  }
  const firstLeaf = (n) => (n.t === "l" ? n.id : firstLeaf(n.c[0]));
  const lastLeaf = (n) => (n.t === "l" ? n.id : lastLeaf(n.c[n.c.length - 1]));
  // The leaf a pane sits next to, and on which side, to make it again there.
  function nearOf(root, id) {
    const hit = find(root, id);
    if (!hit || !hit.parent) return null;
    const { parent, idx } = hit;
    const row = parent.d === "row";
    if (idx > 0) return { leaf: lastLeaf(parent.c[idx - 1]), zone: row ? "right" : "bottom" };
    return parent.c[1] ? { leaf: firstLeaf(parent.c[1]), zone: row ? "left" : "top" } : null;
  }

  // Where each tab of the workspace on screen is now (read by the next tick).
  function notePlacements() {
    if (!currentWs || !S.ws || !S.pq) return;
    const out = new Map();
    const root = layouts.get(currentWs) || leaf("main");
    const deck = decksOf(currentWs).active;
    for (const id of leaves(root)) {
      const p = id !== "main" && panels.get(id);
      if (!p || p.wsId !== currentWs) continue;
      const near = nearOf(root, id);
      const act = PQ().activeByPopup[p.name];
      tabsOf(p).forEach((t, index) => out.set(t.id, { ws: currentWs, deck, pane: id, index, near, desc: t, active: t.id === act }));
    }
    const inPq = new Set(PQ().tabs.map((t) => t.id));
    let index = 0;
    for (const t of W().centerTabs || []) {
      if (!t || (t.type === "chat" && t.isArchived === true) || !dockable(t)) continue;
      const d = descFor(currentWs, t);
      if (inPq.has(d.id)) continue;
      out.set(d.id, { ws: currentWs, deck, pane: "main", index: index++, near: null, desc: d, active: W().activeCenterTabId === t.id });
    }
    placeBefore = out;
    noteWindowSizes();
  }

  // New tabs in external windows get their origin; tabs that left one after a
  // close go home.
  function trackExternal() {
    if (!S.pq || !S.ws) return;
    let changed = false;
    for (const t of PQ().tabs) {
      if (!isExternal(t.popup)) continue;
      hookPopup(t.popup);
      const o = external.get(t.id);
      if (o) {
        o.popup = t.popup;
        if (t.popup.closed) homeNow(t.id); // closed and not seen by its pagehide: home before the app's own close
        continue;
      }
      const was = placeBefore.get(t.id);
      const ws = t.workspaceId || currentWs;
      const rec = { ws, deck: was ? was.deck : null, pane: was ? was.pane : "main", index: was ? was.index : -1, near: was ? was.near : null, desc: keptDesc(was ? was.desc : t), popup: t.popup };
      external.set(t.id, rec);
      if (ws === currentWs) {
        ensureHomePane(rec);
        const l = homeLeaf(rec);
        if (l && was && was.active) {
          phActive.set(l, t.id); // the tab you were looking at: its place says where it went
          phPicked.set(l, { sel: leafSelection(l), at: Date.now() });
        }
      }
      changed = true;
    }
    for (const [w, off] of [...popupUnhooks]) if (w.closed) {
      off();
      popupUnhooks.delete(w);
    }
    for (const [id, o] of [...external]) {
      const inPq = PQ().tabs.find((t) => t.id === id);
      if (inPq && isExternal(inPq.popup)) continue;
      if (!inPq && !o.popup && !o.closing) {
        // no window (after a reload, or a reopen that failed): a placeholder; the
        // window opens again once, when its workspace is on screen
        if (o.boot && o.ws === currentWs) {
          o.boot = false;
          ensureHomePane(o);
          reopenWindow(id, o);
          changed = true;
        }
        continue;
      }
      if (inPq || o.byHand || !(o.closing || (o.popup && o.popup.closed))) {
        external.delete(id); // moved by hand (into a pane, or dropped on a bar): it stays there
        changed = true;
        continue;
      }
      if (o.ws !== currentWs) continue; // goes home when its workspace is on screen
      goHome(id, o);
      external.delete(id);
      changed = true;
    }
    if (changed) saveExternal();
  }

  // The popout's close (its window, or a tab's "×" or middle click in it): the
  // tabs go home before the app's own close runs.
  function hookPopup(win) {
    if (hookedPopups.has(win)) return;
    hookedPopups.add(win);
    const closing = () => {
      if (destroyed) return;
      for (const t of PQ().tabs.filter((x) => x.popup === win)) homeNow(t.id);
      // Tabs that left this window before it closed and are still open were moved by
      // hand (the app closes a window it emptied): they stay where they were dropped.
      for (const [id, o] of external) {
        if (o.popup !== win || o.closing || PQ().tabs.some((t) => t.id === id && t.popup === win)) continue;
        const d = o.desc;
        if (isCenterKind(d) ? liveTab(d.workspaceId, tabIdOf(d)) : true) o.byHand = true;
      }
    };
    const onTabClose = (e) => {
      if (destroyed) return;
      const tgt = e.target && e.target.closest ? e.target : null;
      const tab = tgt && tgt.closest('[role="tab"][data-tab-id]');
      if (!tab) return;
      const isX = e.type === "click" && !!tgt.closest('button[aria-label^="Close"]');
      const isMiddle = e.type === "auxclick" && e.button === 1;
      if (!isX && !isMiddle) return;
      const id = tab.getAttribute("data-tab-id");
      if (!PQ().tabs.some((t) => t.id === id && t.popup === win)) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      homeNow(id);
    };
    try {
      const doc = win.document;
      win.addEventListener("pagehide", closing);
      win.addEventListener("beforeunload", closing);
      doc.addEventListener("click", onTabClose, true);
      doc.addEventListener("auxclick", onTabClose, true);
      popupUnhooks.set(win, () => {
        try {
          win.removeEventListener("pagehide", closing);
          win.removeEventListener("beforeunload", closing);
          doc.removeEventListener("click", onTabClose, true);
          doc.removeEventListener("auxclick", onTabClose, true);
        } catch (_) {}
      });
    } catch (_) {}
  }
  function homeNow(id) {
    const o = external.get(id) || (placeBefore.get(id) && { ...placeBefore.get(id), desc: keptDesc(placeBefore.get(id).desc) });
    if (!o) return;
    o.closing = true;
    if (o.ws === currentWs && goHome(id, o)) external.delete(id);
    else {
      external.set(id, o);
      if (PQ().tabs.some((t) => t.id === id)) PQ().attach(id); // home when its workspace is on screen
    }
    saveExternal();
  }

  // The tab as it is now, or again (reopened from the kept copy when the app closed it).
  function liveOrReopen(o) {
    const d = o.desc;
    if (!isCenterKind(d)) return plainDesc(PQ().tabs.find((t) => t.id === d.id) || d);
    const id = tabIdOf(d);
    let live = liveTab(d.workspaceId, id);
    if (!live && d.kind === "center" && d.tab && typeof W().applyRemoteTabOp === "function") {
      try {
        W().applyRemoteTabOp(d.workspaceId, { kind: "open", tab: { ...d.tab } });
      } catch (_) {}
      live = liveTab(d.workspaceId, id);
    }
    return live && dockable(live) ? descFor(d.workspaceId, live) : null;
  }

  // Home: its pane (made again next to the same neighbor if it went), at its
  // index; else the center at the nearest index. True when it got there.
  function goHome(id, o) {
    // Home is in its origin deck: that deck comes on screen first.
    if (!originDeckOn(o)) switchDeck(currentWs, o.deck);
    if (o.pane && o.pane !== "main") ensureHomePane(o);
    const d = liveOrReopen(o);
    if (!d) return false;
    const root = layouts.get(currentWs) || leaf("main");
    let panel = o.pane && o.pane !== "main" ? panels.get(o.pane) : null;
    if (panel && panel.wsId !== currentWs) panel = null;
    if (!panel && o.pane && o.pane !== "main" && o.near && find(root, o.near.leaf) && (o.near.leaf === "main" || panels.has(o.near.leaf))) {
      panel = makePanel(currentWs);
      layouts.set(currentWs, insertBeside(root, o.near.leaf, panel.id, o.near.zone));
    }
    if (panel) {
      if (!PQ().tabs.some((t) => t.id === d.id)) leaveNativeSplitFor([d]);
      moveInto(panel, d);
      const list = tabsOf(panel);
      const at = list.findIndex((t) => t.id === d.id);
      const to = Math.max(0, Math.min(o.index, list.length - 1));
      if (at >= 0 && at !== to) PQ().reorder(panel.popup, at, to);
      PQ().select(panel.popup, d.id);
    } else {
      returnToMain(d);
      if (PQ().tabs.some((t) => t.id === d.id)) PQ().attach(d.id);
      // the nearest index among the center's own tabs
      const st = W();
      const inPq = new Set(PQ().tabs.filter(isCenterKind).map(tabIdOf));
      const own = (st.centerTabs || []).filter((t) => t && !(t.type === "chat" && t.isArchived === true) && !inPq.has(t.id) && t.id !== tabIdOf(d));
      const ids = (st.centerTabs || []).map((t) => t.id);
      const from = ids.indexOf(tabIdOf(d));
      const before = o.index >= 0 && o.index < own.length ? own[o.index].id : null;
      if (from >= 0 && before && typeof st.reorderTabs === "function") {
        const bi = ids.indexOf(before);
        const to = bi > from ? bi - 1 : bi;
        if (to !== from) st.reorderTabs(from, to);
      }
    }
    outIds = transferredIds();
    dirty = true;
    schedule();
    setTimeout(() => landOn(d), 0);
    return true;
  }

  // ------------------------------------------------------------------ solo
  // Solo: one leaf (a pane, or the center) fills the area for a while; the other
  // panes are hidden, not closed, and the tree is not touched, so leaving solo
  // brings the layout back as it was. ⌘⇧Enter / Ctrl+Shift+Enter toggles it for
  // the leaf with the focus (or the last one clicked), the button in a pane's
  // header too (before "Open in split view"; out of the Tab order until it reads
  // "Exit solo", so Tab still goes from the "+" to the split button). The center's
  // native header is not touched: the center goes solo with the shortcut, and
  // while it is solo an "Exit solo" pill floats at its top right, under its tab
  // bar. Esc leaves solo (when nothing else owns Esc: typing, the canvas, a
  // dialog). A new split leaves solo first; a solo leaf that
  // goes away (closed, another deck) ends it. Per workspace, not saved.
  // "rtd:solo-changed" { wsId, pane } on window.
  const solos = new Map(); // wsId -> leaf id ("main" or a pane id)
  let soloTarget = null; // the leaf of the last pointerdown/focusin
  let mainSoloBtn = null;
  const soloNow = () => (currentWs && solos.get(currentWs)) || null;
  const SOLO_ICON = {
    on: "<path d='M15 3h6v6'/><path d='M9 21H3v-6'/><path d='m21 3-7 7'/><path d='m3 21 7-7'/>", // maximize-2
    off: "<path d='m14 10 7-7'/><path d='M20 10h-6V4'/><path d='m3 21 7-7'/><path d='M4 14h6v6'/>", // minimize-2
  };
  function leafOfNode(n) {
    const e = asEl(n);
    if (!e) return null;
    const box = e.closest(".rtd-panel");
    if (box) return panels.has(box.getAttribute("data-rtd-panel")) ? box.getAttribute("data-rtd-panel") : null;
    return mainNode && mainNode.contains(e) ? "main" : null;
  }
  // Leaves that can go solo now: two or more on screen (the center counts while shown).
  function soloLeaves() {
    if (!currentWs) return [];
    const ids = leaves(layouts.get(currentWs) || leaf("main")).filter((id) => (id === "main" ? !mainEmpty : panels.has(id)));
    return ids.length > 1 || soloNow() ? ids : [];
  }
  function setSolo(leafId) {
    if (!currentWs || destroyed) return false;
    const next = leafId || null;
    if (next && !soloLeaves().includes(next)) return false;
    if ((solos.get(currentWs) || null) === next) return true;
    if (next) solos.set(currentWs, next);
    else solos.delete(currentWs);
    dirty = true;
    if (host && dynStyle) relayout();
    soloChrome();
    schedule();
    emit("rtd:solo-changed", { wsId: currentWs, pane: next });
    return true;
  }
  function soloButton(onClick) {
    const b = el("rtd-solo", "button");
    b.type = "button";
    b.innerHTML = svg(SOLO_ICON.on) + `<span class="rtd-solo-label">Exit solo</span>`;
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  }
  function paintSolo(b, on, show) {
    if (b.hidden !== !show) b.hidden = !show;
    if (b.hasAttribute("data-on") !== on) {
      b.toggleAttribute("data-on", on);
      b.firstChild.outerHTML = svg(on ? SOLO_ICON.off : SOLO_ICON.on);
    }
    const title = on ? "Exit solo (Esc)" : "Solo: this pane alone (⌘⇧Enter)";
    if (b.title !== title) {
      b.title = title;
      b.setAttribute("aria-label", on ? "Exit solo" : "Solo");
      b.setAttribute("aria-pressed", String(on));
    }
    const ti = on ? 0 : -1;
    if (b.tabIndex !== ti) b.tabIndex = ti;
  }
  // The buttons: in each pane's header (placeChrome puts them before the split
  // button) and, while the center is solo, a floating "Exit solo" over it.
  function soloChrome() {
    const ok = soloLeaves();
    const s = soloNow();
    for (const p of panels.values()) if (p.solo && p.wsId === currentWs) paintSolo(p.solo, s === p.id, ok.includes(p.id));
    if (s !== "main" || !host || !lastLayout || !lastLayout.rects.get("main")) {
      if (mainSoloBtn) mainSoloBtn.remove();
      return;
    }
    if (!mainSoloBtn) {
      mainSoloBtn = soloButton(() => setSolo(null));
      mainSoloBtn.classList.add("rtd-solo-float");
    }
    if (mainSoloBtn.parentElement !== host) host.appendChild(mainSoloBtn);
    paintSolo(mainSoloBtn, true, true);
    const r = lastLayout.rects.get("main");
    mainSoloBtn.style.top = `${Math.round(r.y + Math.min(headerHeight("main"), r.h - 40) + 8)}px`;
    mainSoloBtn.style.right = `${Math.round(host.clientWidth - (r.x + r.w) + 12)}px`;
  }
  function onSoloKey(e) {
    if (destroyed || frozen || e.defaultPrevented || e.isComposing || !currentWs || !mainNode) return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Enter" && mod && e.shiftKey && !e.altKey) {
      const a = document.activeElement;
      if ([asEl(e.target), a instanceof Element ? a : null].some((n) => n && n.closest(BUSY))) return; // a dialog or a menu owns it
      const s = soloNow();
      const target = s ? null : leafOfNode(document.activeElement) || (soloTarget && soloLeaves().includes(soloTarget) ? soloTarget : null);
      if (!s && !target) return;
      if (!setSolo(target)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return;
    }
    if (e.key === "Escape" && !mod && !e.shiftKey && !e.altKey && soloNow() && !drag && !shortcutOwnedElsewhere(e)) {
      setSolo(null);
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }
  const onSoloPointer = (e) => {
    const l = leafOfNode(e.target);
    if (l) soloTarget = l;
  };

  // ------------------------------------ external window: the placeholder at home
  // While a tab is in an external window, its place keeps a placeholder: in the tab
  // bar a chip with its icon, title and a small "external" mark (in a pane, right
  // after the pane's "+"; in the center, floating right after the center's "+", its
  // native header untouched), and in the body, while that chip is picked, a sober
  // empty state: "Open in external window", "Bring back" (primary: the tab goes
  // home, same pane and index, and the window closes) and "Focus window". A pane
  // whose tabs all went out stays, with its placeholders. On detach the chip lifts
  // (scale 1 -> 0.96 with a shadow, 250 ms) and on the way back a copy lands on the
  // tab (0.96 -> 1); reduced motion: fades only. Clicking another tab of that pane
  // shows that tab again (the chip stays). After a reload or a restart the
  // placeholder comes back and the window is opened again (the app's own detach,
  // at its last size and place); when it cannot open, the tab stays parked (out of
  // the center bar) and the placeholder offers "Bring back" and "Reopen window".
  // A window is only ever opened again for a tab that has a placeholder.
  const phStrips = new Map(); // leaf -> chip strip
  const phBodies = new Map(); // leaf -> empty state
  const phActive = new Map(); // leaf -> descriptor id whose empty state shows
  const phPicked = new Map(); // leaf -> the selection when its empty state was picked
  const phLifted = new Set(); // descriptor ids whose chip already lifted
  const PH_ICON = {
    external: "<path d='M15 3h6v6'/><path d='M10 14 21 3'/><path d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'/>",
    window: "<rect width='18' height='18' x='3' y='3' rx='2'/><path d='M3 9h18'/><path d='M7 6h.01'/><path d='M11 6h.01'/>",
  };

  // The leaf of a record's home on screen ("main", a pane of this workspace), or null.
  function homeLeaf(o) {
    if (!o || o.ws !== currentWs || o.closing) return null;
    if (!originDeckOn(o)) return null; // its deck is not the one on screen: its placeholder shows with it
    if (!o.pane || o.pane === "main") return "main";
    const p = panels.get(o.pane);
    return p && p.wsId === currentWs ? o.pane : null;
  }
  const placeholders = () => [...external].filter(([, o]) => homeLeaf(o));
  const centerHolds = () => placeholders().some(([, o]) => homeLeaf(o) === "main");
  // A pane keeps living with no tab while it holds a placeholder (also for the
  // tick between a tear-out and its record).
  function paneHolds(id) {
    if (placeholders().some(([, o]) => o.pane === id)) return true;
    return !!S.pq && PQ().tabs.some((t) => isExternal(t.popup) && !external.has(t.id) && (placeBefore.get(t.id) || {}).pane === id);
  }
  // Tabs out of every bar while their window is closed (a failed reopen): the
  // placeholder stands for them.
  function parkedIds() {
    const out = [];
    for (const [, o] of external) {
      if (o.ws !== currentWs || o.closing || (o.popup && !o.popup.closed) || !isCenterKind(o.desc)) continue;
      out.push(tabIdOf(o.desc));
    }
    return out;
  }

  // The origin deck of a record is the one on screen (or it is gone: any deck will do).
  function originDeckOn(o) {
    if (!o.deck || o.ws !== currentWs) return true;
    const ds = decksOf(currentWs);
    return ds.active === o.deck || !ds.decks.some((d) => d.id === o.deck);
  }
  // A home pane that went (its tabs all left before the dock kept it, or after a
  // reload) is made again next to the same neighbor, for its placeholder; every
  // record of that pane follows the new one.
  function ensureHomePane(o) {
    if (!o.pane || o.pane === "main" || (panels.get(o.pane) && panels.get(o.pane).wsId === currentWs)) return;
    if (!originDeckOn(o)) return; // made when its deck is on screen
    const root = layouts.get(currentWs) || leaf("main");
    if (!o.near || !find(root, o.near.leaf) || !(o.near.leaf === "main" || panels.has(o.near.leaf))) {
      o.pane = "main";
      return;
    }
    const panel = makePanel(currentWs);
    layouts.set(currentWs, insertBeside(root, o.near.leaf, panel.id, o.near.zone));
    const old = o.pane;
    for (const r of external.values()) if (r.ws === o.ws && r.pane === old) r.pane = panel.id;
    o.pane = panel.id;
    dirty = true;
  }

  function phChip(id, o, leafId) {
    const b = el("rtd-ph-tab", "button");
    b.type = "button";
    b.dataset.ph = id;
    b.setAttribute("data-rtd-type", typeOfDesc(o.desc));
    const t = el("rtd-ph-title", "span");
    t.textContent = o.desc.title || "Tab";
    const m = el("rtd-ph-mark", "span");
    m.innerHTML = svg(PH_ICON.external);
    b.append(t, m);
    b.title = `${o.desc.title || "Tab"} · open in an external window`;
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      phActive.set(leafId, id);
      phPicked.set(leafId, { sel: leafSelection(leafId), at: Date.now() });
      renderPlaceholders();
    });
    if (!phLifted.has(id) && !o.restored) b.classList.add("rtd-ph-lift");
    phLifted.add(id);
    return b;
  }
  function phBody(leafId) {
    const box = el("rtd-ext");
    box.innerHTML =
      `<div class="rtd-ext-icon">${svg(PH_ICON.window)}</div>` +
      `<div class="rtd-ext-title">Open in external window</div><div class="rtd-ext-sub"></div>` +
      `<div class="rtd-ext-actions"><button type="button" class="rtd-ext-primary">Bring back</button><button type="button" class="rtd-ext-secondary"></button></div>`;
    box.querySelector(".rtd-ext-primary").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = phActive.get(leafId);
      if (id) bringBackFromWindow(id);
    });
    box.querySelector(".rtd-ext-secondary").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = phActive.get(leafId);
      const o = id && external.get(id);
      if (!o) return;
      if (o.popup && !o.popup.closed) {
        try {
          o.popup.focus();
        } catch (_) {}
      } else reopenWindow(id, o);
    });
    return box;
  }

  // What a leaf shows now: its pane's selected tab, the center's active tab.
  function leafSelection(l) {
    if (l === "main") return S.ws ? W().activeCenterTabId || null : null;
    const p = panels.get(l);
    return p && S.pq ? PQ().activeByPopup[p.name] || null : null;
  }
  // Chips and empty states follow the records (every tick and after a layout).
  function renderPlaceholders() {
    if (!host || destroyed) return;
    // another tab picked there since (by keyboard, or the app): it shows, the chip
    // stays. Changes in the first moments after it showed are the app and the dock
    // settling the selection (the center going back to one of its own tabs).
    for (const [l] of [...phActive]) {
      const pk = phPicked.get(l);
      if (!pk) continue;
      const cur = leafSelection(l);
      if (Date.now() - pk.at < 600) pk.sel = cur;
      else if (pk.sel !== cur) {
        phActive.delete(l);
        phPicked.delete(l);
      }
    }
    const byLeaf = new Map();
    for (const [id, o] of placeholders()) {
      const l = homeLeaf(o);
      if (!byLeaf.has(l)) byLeaf.set(l, []);
      byLeaf.get(l).push([id, o]);
    }
    for (const l of [...phStrips.keys()]) {
      if (byLeaf.has(l)) continue;
      phStrips.get(l).remove();
      phStrips.delete(l);
    }
    for (const [l, id] of [...phActive]) if (!byLeaf.has(l) || !byLeaf.get(l).some(([x]) => x === id)) phActive.delete(l);
    const hb = host.getBoundingClientRect();
    for (const [l, list] of byLeaf) {
      let strip = phStrips.get(l);
      const key = list.map(([id]) => id).join("|");
      if (!strip || strip.dataset.key !== key) {
        if (strip) strip.remove();
        strip = el("rtd-ph");
        strip.dataset.key = key;
        for (const [id, o] of list) strip.appendChild(phChip(id, o, l));
        phStrips.set(l, strip);
      }
      for (const chip of strip.children) chip.toggleAttribute("data-active", phActive.get(l) === chip.dataset.ph);
      if (l === "main") {
        const r = lastLayout && lastLayout.rects.get("main");
        if (!r || !mainNode) {
          strip.remove();
          continue;
        }
        strip.className = "rtd-ph rtd-ph-center";
        if (strip.parentElement !== host) host.appendChild(strip);
        const plus = mainNode.querySelector('[data-testid="center-panel-add-tab-button"]');
        const pr = plus && plus.getClientRects().length ? plus.getBoundingClientRect() : null;
        const left = pr ? pr.right - hb.left + 6 : r.x + 8;
        const top = pr ? pr.top - hb.top + (pr.height - 28) / 2 : r.y + 8;
        Object.assign(strip.style, { left: `${Math.round(left)}px`, top: `${Math.round(top)}px`, maxWidth: `${Math.max(80, Math.round(r.x + r.w - left - 96))}px` });
      } else {
        const p = panels.get(l);
        const head = p.el.querySelector("header [data-tab-bar]") ? p.add.parentElement : null;
        if (head && head !== p.el) {
          strip.className = "rtd-ph";
          strip.style.cssText = "";
          if (strip.previousElementSibling !== p.add) p.add.after(strip);
        } else {
          strip.className = "rtd-ph rtd-ph-float";
          strip.style.cssText = "";
          if (strip.parentElement !== p.el) p.el.appendChild(strip);
        }
      }
      // A home whose only tab went out shows its placeholder.
      if (!phActive.has(l) && (l === "main" ? mainTabCount() === 0 : !tabsOf(panels.get(l)).length)) {
        phActive.set(l, list[0][0]);
        phPicked.set(l, { sel: leafSelection(l), at: Date.now() });
      }
    }
    // Empty states
    for (const l of [...phBodies.keys()]) {
      if (phActive.has(l)) continue;
      phBodies.get(l).remove();
      phBodies.delete(l);
    }
    for (const [l, id] of phActive) {
      const o = external.get(id);
      let box = phBodies.get(l);
      if (!box) {
        box = phBody(l);
        phBodies.set(l, box);
      }
      box.querySelector(".rtd-ext-sub").textContent = o.desc.title || "";
      const open = !!(o.popup && !o.popup.closed);
      const sec = box.querySelector(".rtd-ext-secondary");
      const label = open ? "Focus window" : "Reopen window";
      if (sec.textContent !== label) sec.textContent = label;
      if (l === "main") {
        const r = lastLayout && lastLayout.rects.get("main");
        if (!r) {
          box.remove();
          continue;
        }
        if (box.parentElement !== host) host.appendChild(box);
        const hh = Math.min(headerHeight("main"), r.h - 40);
        place(box, { x: r.x, y: r.y + hh, w: r.w, h: r.h - hh });
        box.classList.add("rtd-ext-center");
      } else {
        const p = panels.get(l);
        if (box.parentElement !== p.el) p.el.appendChild(box);
        const hh = (p.el.querySelector("header") || {}).offsetHeight || HEADER_FALLBACK;
        box.style.top = `${hh}px`;
      }
    }
  }

  // "Bring back": home (same pane and index), the window closes, the tab lands.
  function bringBackFromWindow(id) {
    const o = external.get(id);
    if (!o) return false;
    const win = o.popup;
    o.closing = true;
    const ok = goHome(id, o);
    if (ok) external.delete(id);
    else o.closing = false;
    saveExternal();
    if (ok && win && !win.closed && !PQ().tabs.some((t) => t.popup === win)) {
      try {
        win.close(); // only when empty: its other tabs stay out
      } catch (_) {}
    }
    renderPlaceholders();
    if (ok) setTimeout(() => landOn(o.desc), 0);
    return ok;
  }
  // The window again (the app's own detach), at its last size and place.
  function reopenWindow(id, o) {
    const d = liveOrReopen(o);
    if (!d || !S.pq || typeof PQ().detach !== "function") return false;
    if (PQ().tabs.some((t) => t.id === d.id && !isExternal(t.popup))) PQ().attach(d.id); // detach only focuses a tab already in a window
    const z = o.size || {};
    let ok = false;
    try {
      ok = !!PQ().detach(d, { width: z.w || 960, height: z.h || 720, anchorX: Number.isFinite(z.x) ? z.x : 80, anchorY: Number.isFinite(z.y) ? z.y : 80 });
    } catch (_) {
      ok = false;
    }
    const t = ok && PQ().tabs.find((x) => x.id === d.id && isExternal(x.popup));
    if (t) {
      o.popup = t.popup;
      hookPopup(t.popup);
    }
    o.reopenFailed = !t;
    outIds = transferredIds();
    dirty = true;
    renderPlaceholders();
    schedule();
    return !!t;
  }
  // A copy lands on the tab now home (0.96 -> 1, the shadow going), then fades.
  function landOn(desc) {
    if (destroyed || !document.body) return;
    let tab = null;
    for (const id of [desc.id, tabIdOf(desc)]) {
      for (const n of document.querySelectorAll(`[role="tab"][data-tab-id="${CSS.escape(String(id))}"]`)) if (n.offsetWidth > 0) tab = n;
    }
    if (!tab) return;
    const r = tab.getBoundingClientRect();
    const g = el("rtd-land");
    Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    if (reducedMotion()) g.classList.add("rtd-land-fade");
    document.body.appendChild(g);
    flying.add(g);
    setTimeout(() => {
      g.remove();
      flying.delete(g);
    }, 320);
  }
  // A tab's "×" or ⌘W / Ctrl+W: the app closes it in this event; the dock looks right
  // after (its fallback pick is undone before the next poll).
  const onCloseIntent = (e) => {
    if (destroyed) return;
    if (e.type === "click") {
      const t = asEl(e.target);
      if (t && t.closest('[role="tab"] button[aria-label^="Close"]')) setTimeout(tick, 0);
    } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && String(e.key || "").toLowerCase() === "w") setTimeout(tick, 0);
  };
  // Back on screen: catch up at once.
  const onVisibility = () => {
    if (!document.hidden) schedule();
  };
  // A click on another tab of a leaf shows that tab again (its chip stays).
  const onPhPointer = (e) => {
    if (!phActive.size) return;
    const t = asEl(e.target) && asEl(e.target).closest('[role="tab"]');
    if (!t || t.closest(".rtd-ph")) return;
    const l = leafOfNode(t);
    if (l && phActive.delete(l)) {
      phPicked.delete(l);
      renderPlaceholders();
    }
  };
  // The window's size and place, for a reopen.
  let extSavedAt = 0;
  function noteWindowSizes() {
    let changed = false;
    for (const [, o] of external) {
      const w = o.popup;
      if (!w || w.closed) continue;
      try {
        if (w.outerWidth > 0) {
          const z = { w: w.outerWidth, h: w.outerHeight, x: w.screenX, y: w.screenY };
          if (!o.size || o.size.w !== z.w || o.size.h !== z.h || o.size.x !== z.x || o.size.y !== z.y) changed = true;
          o.size = z;
        }
      } catch (_) {}
    }
    if (changed && Date.now() - extSavedAt > 2000) {
      extSavedAt = Date.now();
      saveExternal();
    }
  }

  // ------------------------------------------------------------------ sync
  // Tabs closed/archived outside the dock leave the pane; tab titles and data
  // (e.g. a renamed chat, the browser URL) follow the store.
  function reconcile() {
    const pq = PQ();
    const now = Date.now();
    for (const p of [...panels.values()]) {
      const mine = tabsOf(p);
      if (!mine.length && paneHolds(p.id)) {
        p.emptySince = 0;
        continue;
      }
      if (!mine.length) {
        if (!p.emptySince) p.emptySince = now;
        else if (now - p.emptySince > 1500) removePanel(p.id); // safety net in case close() never comes
        continue;
      }
      p.emptySince = 0;
      if (p.wsId !== currentWs) continue;
      mine.forEach((t, idx) => {
        if (!isCenterKind(t)) {
          if (t.kind === "canvas" && !plainDesc(t)) pq.attach(t.id); // canvas tab closed elsewhere
          return;
        }
        const live = liveTab(t.workspaceId, tabIdOf(t));
        if (!live) {
          if (!heldTabs.has(t.id)) pq.attach(t.id); // a held one leaves when its flight ends
          return;
        }
        const title = tabLabel(live);
        const stale = title !== t.title || (t.kind === "center" && JSON.stringify(live) !== JSON.stringify(t.tab));
        if (!stale) return;
        const active = pq.activeByPopup[p.name];
        const next = { ...t, title, ...(t.kind === "center" ? { tab: live } : {}) };
        delete next.popup;
        pq.moveToPopup(next, p.popup); // there is no "update": move into the same pane and restore the position
        const len = tabsOf(p).length;
        if (idx !== len - 1) PQ().reorder(p.popup, len - 1, idx);
        if (active) PQ().select(p.popup, active);
      });
    }
    // A chat picked in the sidebar that lives in a pane: activate its tab there.
    const st = W();
    if (st.activeChatTabId !== lastActiveChat) {
      lastActiveChat = st.activeChatTabId;
      const p = lastActiveChat && panelOfDesc(`chat:${currentWs}:${lastActiveChat}`);
      if (p) {
        PQ().select(p.popup, `chat:${currentWs}:${lastActiveChat}`);
        p.el.classList.remove("rtd-flash");
        void p.el.offsetWidth;
        p.el.classList.add("rtd-flash");
      }
    }
  }

  // setTimeout, not rAF: a minimized/hidden window produces no frames.
  let pending = 0;
  function schedule() {
    if (!pending) pending = setTimeout(tick, 0);
  }

  function tick() {
    clearTimeout(pending);
    pending = 0;
    if (destroyed || frozen) return;
    if (!S.pq || !S.ws) {
      if (!discoverStores()) return;
    }
    if (document.hidden) {
      // minimized/hidden: no layout work; the external windows are still followed
      // (a tab out there can be closed while this window is away)
      try {
        trackExternal();
      } catch (_) {}
      return;
    }
    if (!listenerAfterReact) {
      // React has its root listeners by now: re-adding ours puts it after them, so
      // the tab bar has filled dataTransfer when it runs.
      listenerAfterReact = true;
      reactRoot.removeEventListener("dragstart", onDragStart);
      reactRoot.addEventListener("dragstart", onDragStart);
    }
    const wc = ensureDom();
    const st = W();
    // Layouts are per workspace, on the chat route with a workspace open.
    const wsId = st.selectedWorkspaceId;
    const onRoute = !!wsId && (st.activeNavRoute === undefined || ROUTES.includes(st.activeNavRoute));
    const found = onRoute ? findMain() : null;
    const m = found && found.querySelector(CENTER) ? found : null;
    if (m !== mainNode) {
      if (mainNode) mainNode.removeAttribute("data-rtd-main");
      if (m) m.setAttribute("data-rtd-main", "");
      mainNode = m;
      dirty = true;
    }
    if (wc) wc.classList.toggle("rtd-offroute", !m); // the center's placeholder and "Exit solo" pill go with the route
    if (!m) {
      if (layerEl) layerEl.style.display = "none";
      if (dynStyle) dynStyle.textContent = "";
      syncCover(null);
      closeAddMenu(false);
      pendingAdd = null;
      return;
    }
    layerEl.style.display = "";
    if (wsId !== currentWs) {
      currentWs = wsId;
      lastActiveChat = st.activeChatTabId;
      lastLive.delete(wsId); // closes are detected while the workspace stays current
      seenActive.delete(wsId); // what the app restored is not a pick by the user
      if (!layouts.has(wsId)) restoreWs(wsId);
      dirty = true;
    }
    finishReturn();
    reconcile();
    trackExternal();
    captureAdded();
    adoptOwnedTabs();
    if (menu && (!menu.btn.isConnected || !panels.has(menu.panelId) || !menu.btn.getClientRects().length)) closeAddMenu(false);
    const out = transferredIds();
    if (out.join() !== outIds.join()) {
      outIds = out;
      dirty = true;
    }
    fixNativeSplitSides();
    decorateTabs();
    placeChrome();
    soloChrome();
    renderPlaceholders();
    syncDecks(false);
    pruneEmptyDecks();
    pruneOtherDecks();
    forgetDeletedWorkspaces();
    // While dragging, the center tab bar drops the dragged tab from its list;
    // hiding the center then cancels the drag. Re-evaluate only after the drag.
    const empty = drag ? mainEmpty : mainTabCount() === 0 && !centerHolds(); // a placeholder keeps the center
    if (empty !== mainEmpty) {
      mainEmpty = empty;
      dirty = true;
    }
    const parked = centerParked(); // tab-close's empty center (see syncCover)
    if (parked !== lastParked) {
      lastParked = parked;
      dirty = true;
    }
    // The cover follows the bar on every pass (see coverWanted); not mid-drag,
    // where the bar may drop the dragged tab for a moment.
    if (!drag && lastLayout && !!(coverEl && !coverEl.hidden) !== (!!lastLayout.rects.get("main") && coverWanted())) dirty = true;
    const size = `${wc.clientWidth}x${wc.clientHeight}`;
    if (size !== lastSize) {
      lastSize = size;
      dirty = true;
    }
    if (dirty && !resizing) {
      dirty = false;
      ticking = true;
      try {
        relayout();
      } finally {
        ticking = false;
      }
    }
    notePlacements();
    save();
  }

  const timer = setInterval(tick, POLL_MS);
  const ro = new ResizeObserver(() => schedule());
  const roWatch = setInterval(() => {
    if (host && !host.__rtdObserved) {
      host.__rtdObserved = true;
      ro.observe(host);
    }
  }, 1000);
  const onHide = () => {
    frozen = true;
  };
  const onDragEnd = () => endDrag();
  // If the source tab leaves the DOM before the end (a native drop on a tab bar
  // moves it), dragend fires on a detached node and never reaches window: end on
  // drop and on the first mouse move after the drag.
  const onDropAny = (e) => {
    if (drag && plusHover) {
      // On a "+": the tab goes to a new workspace (the drop only lands when allowed).
      e.preventDefault();
      e.stopPropagation();
      const hover = plusHover;
      const s = drag.srcEl;
      const w = Math.round(Math.min(240, Math.max(80, drag.srcW || 140)));
      const fromRect = s && s.isConnected && s.offsetWidth > 0 ? s.getBoundingClientRect() : { left: e.clientX - w / 2, top: e.clientY - 14, width: w, height: 28 };
      const d = freshDesc(readDesc(e.dataTransfer) || drag.desc);
      endDrag();
      if (d && hover.ok) moveToNewWorkspace(d, { fromRect, toEl: hover.btn }).catch(() => {});
      return;
    }
    const p = barPreview && barPreview.own ? barPreview : null;
    const b = bodyDrop;
    if (drag && (p || b)) {
      // The dock's drop (bar slot, split, or a move into a pane without a bar):
      // keep it from the app's handlers underneath.
      e.preventDefault();
      e.stopPropagation();
      const d = freshDesc(readDesc(e.dataTransfer) || drag.desc);
      endDrag();
      if (d) {
        if (p) dropOnBar(p, d);
        else performDrop(b.id, b.zone, d);
      }
      return;
    }
    const tgt = asEl(e.target);
    if (tgt && tgt.closest('[role="tree"]')) treeDropAt = Date.now(); // the file tree's move (its own ⌘Z)
    setTimeout(endDrag, 0);
  };
  // A real drag keeps firing dragover; a mouse event only means the drag is over
  // when no drag event arrived for a while (some platforms send a mouse move as
  // the drag starts).
  let lastDragEventAt = 0;
  let dragDepth = 0; // dragenter minus dragleave: 0 means the pointer left the window
  const onDragActivity = (e) => {
    lastDragEventAt = Date.now();
    if (e.type === "dragenter") dragDepth++;
    if (drag && trackDrag(e)) e.stopPropagation();
  };
  // Outside the window no dragover arrives to update the previews: drop them there.
  const onDragLeaveAny = (e) => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!drag) return;
    const x = e.clientX;
    const y = e.clientY;
    if (dragDepth === 0 || x < 0 || y < 0 || x > innerWidth || y > innerHeight) clearTarget();
  };
  const onMouseAfterDrag = (e) => {
    if (!drag || (e.type !== "mousedown" && e.buttons !== 0)) return;
    if (Date.now() - lastDragEventAt > 400) endDrag();
  };
  // Tab bars call stopPropagation on dragstart, so the event never reaches window.
  // On #root itself (where React listens) the listener runs right after the app's.
  const reactRoot = document.getElementById("root") || window;
  reactRoot.addEventListener("dragstart", onDragStart);
  window.addEventListener("dragover", onDragActivity, true);
  window.addEventListener("dragenter", onDragActivity, true);
  window.addEventListener("dragleave", onDragLeaveAny, true);
  window.addEventListener("dragend", onDragEnd, true);
  window.addEventListener("drop", onDropAny, true);
  window.addEventListener("mousemove", onMouseAfterDrag, true);
  window.addEventListener("mousedown", onMouseAfterDrag, true);
  window.addEventListener("pagehide", onHide);
  window.addEventListener("keydown", onHistoryKey, true);
  window.addEventListener("keydown", onSoloKey, true);
  window.addEventListener("pointerdown", onSoloPointer, true);
  window.addEventListener("pointerdown", onPhPointer, true);
  window.addEventListener("click", onCloseIntent, true);
  window.addEventListener("keydown", onCloseIntent, true);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focusin", onSoloPointer, true);
  window.addEventListener("pointerdown", onOwnerEvent, true);
  window.addEventListener("focusin", onOwnerEvent, true);
  window.addEventListener("blur", onWindowBlur);
  window.addEventListener("pointerdown", onFloatPointer, true);
  window.addEventListener("contextmenu", onFloatPointer, true);
  window.addEventListener("resize", queueFloats);
  window.addEventListener("scroll", queueFloats, true);
  if (document.body) {
    floatBodyObs.observe(document.body, { childList: true });
    trackFloats();
  }
  schedule();

  // ---------------------------------------------------------- introspection
  function destroy() {
    save();
    destroyed = true;
    clearInterval(timer);
    clearInterval(roWatch);
    ro.disconnect();
    reactRoot.removeEventListener("dragstart", onDragStart);
    window.removeEventListener("dragover", onDragActivity, true);
    window.removeEventListener("dragenter", onDragActivity, true);
    window.removeEventListener("dragleave", onDragLeaveAny, true);
    window.removeEventListener("dragend", onDragEnd, true);
    window.removeEventListener("drop", onDropAny, true);
    window.removeEventListener("mousemove", onMouseAfterDrag, true);
    window.removeEventListener("mousedown", onMouseAfterDrag, true);
    window.removeEventListener("pagehide", onHide);
    window.removeEventListener("keydown", onHistoryKey, true);
    window.removeEventListener("keydown", onSoloKey, true);
    window.removeEventListener("pointerdown", onSoloPointer, true);
    window.removeEventListener("pointerdown", onPhPointer, true);
    window.removeEventListener("click", onCloseIntent, true);
    window.removeEventListener("keydown", onCloseIntent, true);
    for (const n of phStrips.values()) n.remove();
    for (const n of phBodies.values()) n.remove();
    phStrips.clear();
    phBodies.clear();
    for (const off of popupUnhooks.values()) off();
    popupUnhooks.clear();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focusin", onSoloPointer, true);
    if (mainSoloBtn) mainSoloBtn.remove();
    window.removeEventListener("pointerdown", onOwnerEvent, true);
    window.removeEventListener("focusin", onOwnerEvent, true);
    window.removeEventListener("blur", onWindowBlur);
    window.removeEventListener("pointerdown", onFloatPointer, true);
    window.removeEventListener("contextmenu", onFloatPointer, true);
    window.removeEventListener("resize", queueFloats);
    window.removeEventListener("scroll", queueFloats, true);
    floatBodyObs.disconnect();
    if (floatQueued) cancelAnimationFrame(floatQueued);
    clearTimeout(animTimer);
    if (host) host.classList.remove("rtd-anim");
    for (const root of [...floats.keys()]) {
      unfixFloat(root);
      untrackFloat(root);
    }
    clearTimeout(toastTimer);
    if (toastEl) toastEl.remove();
    clearPlus();
    if (plusPill) plusPill.remove();
    for (const n of flying) n.remove();
    flying.clear();
    heldTabs.clear();
    pendingReturn = null;
    histories.clear();
    closeAddMenu(false);
    pendingAdd = null;
    if (S.pq) for (const p of panels.values()) for (const t of tabsOf(p)) PQ().attach(t.id);
    panels.clear();
    if (mainNode) mainNode.removeAttribute("data-rtd-main");
    clearBarPreview();
    for (const n of [layerEl, dndEl, dynStyle, dragStyle, coverEl]) if (n) n.remove();
    delete window.__RE_TEMPO_PANE_DOCK__;
    delete window.__RE_TEMPO_DECKS__;
  }

  // A deck's tabs closed the app's way: a chat archived (archiveChatTab; an untouched
  // draft closed), a terminal closed (closeTerminalTab, which ends its session), any
  // other tab closed (closeDiffTab; applyRemoteTabOp "close" on a workspace not on
  // screen). A tab in a pane or a window leaves it first. { done: [{ id, tab, how }],
  // kept: [ids the app refused] } (the workspace's own first chat cannot be archived).
  function closeDeckTabs(ws, ids) {
    const st = W();
    const sel = st.selectedWorkspaceId === ws;
    const done = [];
    const kept = [];
    for (const id of ids) {
      const t = liveTab(ws, id);
      if (!t) continue;
      const copy = JSON.parse(JSON.stringify(t));
      const desc = descFor(ws, t);
      external.delete(desc.id); // closed for good: its window does not send it home
      if (PQ().tabs.some((x) => x.id === desc.id)) PQ().attach(desc.id);
      let how = null;
      try {
        if (t.type === "chat") {
          if (sel && untouchedChat(ws, id) && typeof st.closeChatTab === "function") {
            st.closeChatTab(id);
            how = "closed";
          } else if (typeof st.archiveChatTab === "function") {
            st.archiveChatTab(ws, id);
            how = "archived";
          }
        } else if (sel) {
          if (t.type === "terminal" && typeof st.closeTerminalTab === "function") st.closeTerminalTab(id);
          else st.closeDiffTab(id);
          how = "closed";
        } else if (typeof st.applyRemoteTabOp === "function") {
          st.applyRemoteTabOp(ws, { kind: "close", tabId: id });
          how = "closed";
        }
      } catch (_) {
        how = null;
      }
      if (how && !liveTab(ws, id)) done.push({ id, tab: copy, how });
      else kept.push(id);
    }
    saveExternal();
    return { done, kept };
  }

  // "Close all" in a deck (decks API closeAll): its open tabs closed, the deck gone
  // with them (not a workspace's only deck, nor while the app kept one of them).
  // One undoable step: undo brings the tabs back (unarchived, reopened) and the deck
  // with its arrangement; redo closes them again.
  function closeAllIn(w, deckId, redone) {
    const ds = decksOf(w);
    const d = ds.decks.find((x) => x.id === deckId);
    if (!d) return null;
    if (layouts.has(w)) captureDeck(w);
    const ids = d.members.filter((id) => liveTab(w, id));
    const snap = snapshot(w);
    const { done, kept } = closeDeckTabs(w, ids);
    if (!kept.length && ds.decks.some((x) => x.id === deckId) && ds.decks.length > 1) dropDeck(w, deckId, "prev");
    if (w === currentWs) {
      outIds = transferredIds();
      dirty = true;
    }
    if (done.length) {
      const h = historyOf(w);
      if (!redone) h.redo.length = 0;
      const op = {
        run: (dir) => {
          if (dir !== "undo" || currentWs !== w) return false;
          const st = W();
          for (const x of done) {
            try {
              if (x.how === "archived" && typeof st.unarchiveChatTab === "function") st.unarchiveChatTab(w, x.id, { select: false });
              else if (typeof st.applyRemoteTabOp === "function") st.applyRemoteTabOp(w, { kind: "open", tab: { ...x.tab } });
            } catch (_) {}
          }
          applyDeckState(snap, true);
          const hr = historyOf(w);
          hr.redo.push({ kind: "deck-close", snap, op: { run: (d2) => d2 === "redo" && currentWs === w && !!closeAllIn(w, deckId, true) } });
          if (hr.redo.length > HISTORY_MAX) hr.redo.shift();
          toast(`Undid ${KIND_LABEL["deck-close"]}`);
          return true;
        },
      };
      h.undo.push({ kind: "deck-close", snap, op });
      if (h.undo.length > HISTORY_MAX) h.undo.shift();
      h.lastKind = "deck-close";
      h.lastAt = Date.now();
    }
    save();
    announce(w, true);
    schedule();
    return { closed: done.length, kept };
  }

  // ------------------------------------------------------------- decks API
  // For other mods (the project sidebar). wsId may be omitted: the current workspace.
  //   list(wsId) -> [{ id, name, paneCount, active, panes, tabs }]
  //     panes: in screen order, [{ chatTabId, title, pane } | { type, title, tabId, pane }]
  //     tabs: the deck's center tab ids (a tab belongs to one deck)
  //   current(wsId) -> id
  //   create(wsId, { name?, activate? }) -> id | null   (its tab: a new chat, made
  //     with the store's createChatTab; null and a toast when no chat opened;
  //     activate defaults to true, false keeps the current deck on screen)
  //   switchTo(wsId, id) / rename(wsId, id, name) / remove(wsId, id) -> boolean
  //   move(wsId, id, index) -> boolean   (its new place in the list)
  //   closeAll(wsId, id) -> { closed, kept } | null   (every open tab of the deck
  //     closed the app's way: chats archived, an untouched draft closed, terminals
  //     closed (their session ends), other tabs closed; the deck goes with them
  //     unless it is the only one or the app kept one (kept: those ids). Undoable:
  //     the tabs come back (a terminal with a new session) and the deck with them)
  //   moveTabs(wsId, tabIds, toId) -> number   (those tabs, raw or "chat:"/"center:"
  //     ids, now belong to deck toId; one on screen in the active deck's panes waits
  //     in its new deck; a deck they leave empty goes. Undoable, one step)
  // Any change fires window "rtd:decks-changed" with detail { wsId }.
  // Default names stay "Deck 01".."Deck K" in list order after create/rename/remove/move.
  // create, remove, rename and move are undoable (⌘Z / ⌘⇧Z on that workspace, or
  // __RE_TEMPO_PANE_DOCK__.undo() / redo()), and so is a deck going away when its
  // last tab closes; a plain switchTo is not.
  const wsArg = (wsId) => (typeof wsId === "string" && wsId) || currentWs;

  // A pane as the sidebar shows it: its visible tab, a chat by id, anything else
  // by type and title. pane is "main" (the center) or the dock pane id.
  function paneEntry(wsId, tabId, pane) {
    const t = tabId ? liveTab(wsId, tabId) : null;
    if (!t) return null;
    return t.type === "chat" ? { chatTabId: t.id, title: tabLabel(t), pane } : { type: t.type, title: tabLabel(t), tabId: t.id, pane };
  }

  // Raw tab id of a "chat:<ws>:<id>" / "center:<ws>:<id>" descriptor id.
  function refOf(wsId, descId) {
    for (const k of ["chat", "center"]) {
      const p = `${k}:${wsId}:`;
      if (typeof descId === "string" && descId.startsWith(p)) return descId.slice(p.length);
    }
    return null;
  }

  // The deck's panes in screen order (the layout tree, left to right, top to bottom).
  function deckPanes(ds, d, wsId) {
    const live = d.id === ds.active && layouts.has(wsId);
    const here = live && wsId === currentWs;
    const out = [];
    for (const id of leaves(live ? layouts.get(wsId) : d.root)) {
      let e = null;
      if (id === "main") {
        if (here && hiddenNow.has("main")) continue; // collapsed: no center tab left in this deck
        const ids = here ? [W().activeCenterTabId, W().activeChatTabId] : [d.mainActive, d.chat];
        // The deck's own tabs only (on a new deck the app's active tab is another
        // deck's), and of those the ones in the center, not in a pane or a window.
        const away = new Set(
          live
            ? PQ().tabs.filter(isCenterKind).map(tabIdOf)
            : Object.values(d.panels).flatMap((s) => (s && Array.isArray(s.tabs) ? s.tabs.map((t) => t && t.ref) : [])),
        );
        for (const tid of ids.concat(d.members)) if (tid && d.members.includes(tid) && !away.has(tid) && (e = paneEntry(wsId, tid, id))) break;
      } else if (live) {
        const p = panels.get(id);
        const ts = p ? tabsOf(p) : [];
        const t = ts.find((x) => x.id === PQ().activeByPopup[p.name]) || ts[0];
        if (!t) continue;
        e = isCenterKind(t) ? paneEntry(wsId, tabIdOf(t), id) : { type: typeOfDesc(t), title: t.title || "", tabId: tabIdOf(t), pane: id };
      } else {
        const spec = d.panels[id];
        const refs = spec && Array.isArray(spec.tabs) ? spec.tabs.filter((s) => s && isCenterKind(s)).map((s) => s.ref) : [];
        for (const tid of [refOf(wsId, spec && spec.active)].concat(refs)) if (tid && d.members.includes(tid) && (e = paneEntry(wsId, tid, id))) break;
      }
      if (e) out.push(e);
    }
    return out;
  }

  // The store holds that workspace's tabs (the selected one, or one whose
  // centerTabs are loaded).
  function storeKnows(wsId) {
    if (!S.ws) return false;
    const st = W();
    if (st.selectedWorkspaceId === wsId) return true;
    const w = st.workspaces.find((x) => x && x.id === wsId);
    return !!w && Array.isArray(w.centerTabs);
  }

  function deckInfo(ds, d, wsId) {
    const live = d.id === ds.active && layouts.has(wsId);
    const panes = S.ws ? deckPanes(ds, d, wsId) : [];
    // panes is read from the store; without it (or for a workspace whose tabs the
    // store does not hold), the stored arrangement: its panes with a tab of the deck.
    const known = storeKnows(wsId);
    const open = known ? d.members.filter((id) => liveTab(wsId, id)) : d.members;
    const paneCount =
      panes.length ||
      (S.ws && wsId === currentWs
        ? 0
        : (open.length ? 1 : 0) +
          leaves(d.root).filter((id) => id !== "main" && d.panels[id] && (d.panels[id].tabs || []).some((s) => s && open.includes(s.ref))).length);
    // Its open tabs (archived or closed ones are left out) on every workspace whose
    // tabs the store holds; the stored list otherwise.
    const secret = hiddenTabIds(wsId);
    const tabs = (storeKnows(wsId) ? d.members.filter((id) => liveTab(wsId, id)) : d.members.slice()).filter((id) => !secret.has(id));
    return { id: d.id, name: d.name, paneCount, active: d.id === ds.active, panes, tabs, chat: d.chat, center: d.mainActive, layout: deckLayout(ds, d, wsId) };
  }
  // What the deck has open besides its center, for a list of it (project-sidebar):
  // its leaves in screen order, { pane: "main" } for the center and { pane, tabs,
  // active } for each pane with a live tab of the deck. The live panes for the deck
  // on screen, its stored arrangement otherwise. Members are not open tabs: every
  // live tab of the workspace, its chat history included, is some deck's member.
  function deckLayout(ds, d, wsId) {
    const live = d.id === ds.active && layouts.has(wsId);
    const known = S.ws && storeKnows(wsId);
    const ok = (id) => !!id && d.members.includes(id) && (!known || !!liveTab(wsId, id));
    const out = [];
    for (const id of leaves(live ? layouts.get(wsId) : d.root)) {
      if (id === "main") {
        out.push({ pane: "main" });
        continue;
      }
      let ids = [];
      let active = null;
      if (live) {
        const p = panels.get(id);
        const ts = p && S.pq ? tabsOf(p).filter(isCenterKind) : [];
        ids = ts.map(tabIdOf);
        const a = p ? ts.find((t) => t.id === PQ().activeByPopup[p.name]) : null;
        active = a ? tabIdOf(a) : null;
      } else {
        const spec = d.panels[id];
        ids = spec && Array.isArray(spec.tabs) ? spec.tabs.filter((s) => s && isCenterKind(s)).map((s) => s.ref) : [];
        active = refOf(wsId, spec && spec.active);
      }
      ids = ids.filter(ok);
      if (ids.length) out.push({ pane: id, tabs: ids, active: ids.includes(active) ? active : ids[0] });
    }
    return out;
  }

  window.__RE_TEMPO_DECKS__ = {
    list(wsId) {
      const w = wsArg(wsId);
      if (!w) return [];
      const ds = decksOf(w);
      if (layouts.has(w)) captureDeck(w);
      return ds.decks.map((d) => deckInfo(ds, d, w));
    },
    current(wsId) {
      const w = wsArg(wsId);
      return w ? decksOf(w).active : null;
    },
    create(wsId, opts) {
      const w = wsArg(wsId);
      if (!w || destroyed || !S.ws || !S.pq) return null;
      const o = opts && typeof opts === "object" ? opts : {};
      const ds = decksOf(w);
      if (layouts.has(w)) captureDeck(w); // the deck you leave keeps its center as it is
      adoptUnlisted(w, activeDeck(ds));
      const added = record("deck-create", w);
      const prev = activeNow();
      // Never empty: its tab is a new chat, made the way the native New chat makes it.
      const tabId = newChatTab(w);
      if (!tabId) {
        if (added) unrecord(w, "deck-create");
        toast("Could not create a deck: no new chat opened");
        return null;
      }
      for (const d of ds.decks) d.members = d.members.filter((x) => x !== tabId);
      ds.touched = true;
      const name = typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 60) : nextDeckName(ds);
      const deck = blankDeck(name, [tabId]);
      deck.chat = tabId;
      deck.mainActive = tabId;
      ds.decks.push(deck);
      renumberDecks(ds.decks);
      if (o.activate === false) {
        // The current deck stays on screen with its own center tab; the chat waits in its deck.
        if (W().selectedWorkspaceId === w) {
          try {
            if (prev.chat && liveTab(w, prev.chat)) W().setActiveCenterTab(prev.chat);
            if (prev.center && liveTab(w, prev.center)) W().setActiveCenterTab(prev.center);
          } catch (_) {}
        }
        if (w === currentWs) seenActive.set(w, activeNow());
        save();
        announce(w, true);
        schedule();
      } else {
        save();
        announce(w, true);
        switchDeck(w, deck.id);
      }
      return deck.id;
    },
    switchTo(wsId, id) {
      return switchDeck(wsArg(wsId), id);
    },
    rename(wsId, id, name) {
      const w = wsArg(wsId);
      if (!w || typeof name !== "string" || !name.trim()) return false;
      const ds = decksOf(w);
      const d = ds.decks.find((x) => x.id === id);
      if (!d) return false;
      const next = name.trim().slice(0, 60);
      if (next === d.name) return true;
      const names = ds.decks.map((x) => x.name).join("\n");
      const added = record("deck-rename", w);
      d.name = next;
      renumberDecks(ds.decks);
      if (added && ds.decks.map((x) => x.name).join("\n") === names) unrecord(w, "deck-rename"); // "Deck 07" on the 3rd deck stays "Deck 03"
      ds.touched = true;
      save();
      announce(w, true);
      return true;
    },
    // Moves the deck to index (0-based, clamped) in the list; default names follow
    // the new order.
    move(wsId, id, index) {
      const w = wsArg(wsId);
      const n = Number(index);
      if (!w || !Number.isFinite(n)) return false;
      const ds = decksOf(w);
      const i = ds.decks.findIndex((d) => d.id === id);
      if (i < 0) return false;
      const to = Math.max(0, Math.min(ds.decks.length - 1, Math.trunc(n)));
      if (to === i) return true;
      record("deck-move", w);
      const [d] = ds.decks.splice(i, 1);
      ds.decks.splice(to, 0, d);
      renumberDecks(ds.decks);
      ds.touched = true;
      save();
      announce(w, true);
      return true;
    },
    // Hidden tabs of a workspace (see "hidden tabs"): in no deck, never a fallback.
    hiddenTabs(wsId) {
      const w = wsArg(wsId);
      return w ? [...hiddenTabIds(w)] : [];
    },
    closeAll(wsId, id) {
      const w = wsArg(wsId);
      if (!w || destroyed || !S.ws || !S.pq) return null;
      return closeAllIn(w, id, false);
    },
    moveTabs(wsId, tabIds, toId) {
      const w = wsArg(wsId);
      if (!w || destroyed || !S.ws || !S.pq || !Array.isArray(tabIds)) return 0;
      const ds = decksOf(w);
      const to = ds.decks.find((d) => d.id === toId);
      if (!to) return 0;
      if (layouts.has(w)) captureDeck(w);
      const ids = [...new Set(tabIds.map((x) => (typeof x === "string" ? refOf(w, x) || x : null)))].filter((id) => id && liveTab(w, id) && !to.members.includes(id));
      if (!ids.length) return 0;
      record("deck-tabs", w);
      const left = [];
      for (const d of ds.decks) {
        if (d === to || !d.members.some((id) => ids.includes(id))) continue;
        d.members = d.members.filter((id) => !ids.includes(id));
        left.push(d);
      }
      to.members.push(...ids);
      // On screen in the active deck's panes and going to another deck: out of the pane
      // (it waits in its deck's center; otherwise the active deck would claim it back).
      if (w === currentWs && to.id !== ds.active) {
        for (const t of PQ().tabs.slice()) if (isCenterKind(t) && t.workspaceId === w && ids.includes(tabIdOf(t)) && panelOfDesc(t.id)) PQ().attach(t.id);
      }
      // A deck they leave with no open tab goes in the same step.
      for (const d of left) if (ds.decks.length > 1 && !d.members.some((id) => liveTab(w, id))) dropDeck(w, d.id, "prev");
      ds.touched = true;
      if (w === currentWs) {
        outIds = transferredIds();
        syncDecks(true);
        dirty = true;
        if (host && dynStyle) relayout();
      }
      save();
      announce(w, true);
      schedule();
      return ids.length;
    },
    // Never the last one. Removing the active deck switches to its neighbor first; its
    // tabs that no other deck lists join the active deck.
    remove(wsId, id) {
      const w = wsArg(wsId);
      if (!w || destroyed) return false;
      const ds = decksOf(w);
      if (!ds.decks.some((d) => d.id === id) || ds.decks.length <= 1) return false;
      const added = record("deck-remove", w);
      if (dropDeck(w, id, "next")) return true;
      if (added) unrecord(w, "deck-remove");
      return false;
    },
  };

  window.__RE_TEMPO_PANE_DOCK__ = {
    get ready() {
      return !!(S.pq && S.ws && currentWs);
    },
    get layout() {
      return JSON.parse(JSON.stringify(layouts.get(currentWs) || null));
    },
    get panels() {
      if (!S.pq) return [];
      return [...panels.values()].map((p) => ({
        id: p.id,
        wsId: p.wsId,
        tabs: tabsOf(p).map((t) => t.title),
        types: tabsOf(p).map(typeOfDesc),
        active: PQ().activeByPopup[p.name] || null,
        rect: p.el.getBoundingClientRect().toJSON(),
      }));
    },
    get mainHidden() {
      return hiddenNow.has("main");
    },
    // Same path as a drop: split(tabId, "right" | "left" | "top" | "bottom" | "center", target).
    split(tabId, zone = "right", target = "main") {
      syncWs();
      const live = currentWs && liveTab(currentWs, tabId);
      return live ? performDrop(target, zone, descFor(currentWs, live)) : false;
    },
    // A pane's "Open in split view": its active tab moves to a new pane on its right
    // (a lone canvas, or the active canvas with copy = true, is duplicated there).
    splitPane(panelId, copy = false) {
      syncWs();
      return splitPane(panelId, !!copy);
    },
    // A new tab for an open canvas, placed like split(): duplicate(tabId, "right" |
    // "left" | "top" | "bottom" | "center", target). The canvas stays where it is.
    duplicate(tabId, zone = "right", target = "main") {
      syncWs();
      const live = currentWs && liveTab(currentWs, tabId);
      return !!live && duplicateTo(target, zone, live);
    },
    // Same path as a pane "+" item: add(panelId, "chat" | "canvas" | "prd" | "issue" | "terminal" | "browser" | "open").
    add(panelId, key) {
      const it = ADD_ITEMS.find((x) => x && x.key === key);
      return !!it && runAdd(panelId, it);
    },
    // The "+" menu's items, as every pane's "+" lists them (no separators):
    // [{ id, label, kind, hint, enabled }]. kind: "new" (a new tab of that type)
    // or "open" (the app's picker for canvases, docs, issues and files); enabled:
    // the app's action is available now.
    plusItems() {
      const a = centerActions();
      return ADD_ITEMS.filter(Boolean).map((it) => ({ id: it.key, label: it.label, kind: it.key === "open" ? "open" : "new", hint: it.hint, enabled: plusItemOk(a, it) }));
    },
    // Runs a "+" item in a pane, as clicking it in that pane's "+" menu: paneId is a
    // dock pane id (.rtd-panel[data-rtd-panel]) or "main" (the center: the center
    // "+" item's own action, the tab opens there). True when the action ran.
    runPlusItem(paneId, itemId) {
      syncWs();
      const it = ADD_ITEMS.find((x) => x && x.key === itemId);
      const a = centerActions();
      if (!it || !plusItemOk(a, it) || !currentWs) return false;
      if (paneId === "main") {
        closeAddMenu(false);
        try {
          a[it.act]();
        } catch (_) {
          return false;
        }
        schedule();
        return true;
      }
      const p = panels.get(paneId);
      return !!p && p.wsId === currentWs && runAdd(paneId, it);
    },
    // Solo: solo("main" | paneId) makes that leaf fill the area, solo(null) leaves
    // it; soloPane is the solo leaf of the workspace on screen (or null).
    solo(leafId) {
      return setSolo(typeof leafId === "string" && leafId ? leafId : null);
    },
    get soloPane() {
      return soloNow();
    },
    // Whether a tab is hidden (a background chat of another mod, or a tab it owns):
    // tabId raw or "chat:"/"center:" descriptor id, in the workspace on screen.
    isHiddenTab(tabId) {
      if (typeof tabId !== "string" || !currentWs) return false;
      return hiddenTabIds(currentWs).has(refOf(currentWs, tabId) || tabId);
    },
    // The rect (DOMRect) of the dock pane hosting that element (a canvas, or anything
    // inside a pane), for other mods to use as a boundary; null in the center.
    viewRect(el) {
      const box = el instanceof Element ? el.closest(".rtd-panel") : null;
      return box && panels.has(box.getAttribute("data-rtd-panel")) ? box.getBoundingClientRect() : null;
    },
    // "+" items whose app action is available right now.
    get addActions() {
      const a = centerActions() || {};
      return ADD_ITEMS.filter((it) => it && typeof a[it.act] === "function").map((it) => it.key);
    },
    get pendingAdd() {
      return pendingAdd ? { panelId: pendingAdd.panelId, key: pendingAdd.key, dialogSeen: pendingAdd.dialogSeen } : null;
    },
    // Returns every tab of the current workspace to the center and clears its saved layout.
    reset() {
      if ([...panels.values()].some((p) => p.wsId === currentWs)) record("reset");
      for (const p of [...panels.values()]) if (p.wsId === currentWs) for (const t of tabsOf(p)) returnToMain(t);
      layouts.set(currentWs, leaf("main"));
      dirty = true;
      schedule();
    },
    // Same as ⌘Z / ⌘⇧Z, without the focus rules. True when a step was taken.
    undo() {
      return stepHistory("undo");
    },
    redo() {
      return stepHistory("redo");
    },
    // A chat tab to a new workspace, as a drop on a "+" does it (for the project
    // sidebar): dropToNewWorkspace({ tabId, projectId?, sourcePaneId?, targetEl?,
    // fromRect?, animate?, follow? }). tabId: the chat tab id or its "chat:<ws>:<id>"
    // descriptor id; projectId: another project than the chat's; targetEl: where
    // the tab flies (no flight without it, unless the tab is on screen and
    // animate is true); follow: false stays in the source workspace. Resolves
    // { wsId, name, moved, archived, history, chatTabId }: the app has no move, so
    // the new workspace's chat starts from this one's history (history: it was
    // copied) and this one is archived; moved is true when the tab left its
    // workspace, false when it stayed (a copy). Rejects with the reason. Fires
    // "rtd:workspace-created" { wsId, name, tabId, moved, archived, history,
    // sourceWsId, chatTabId, projectId } on window right away, and
    // "rtd:workspace-drop-undone" { wsId, name, tabId, sourceWsId } on undo.
    dropToNewWorkspace(opts) {
      const o = opts && typeof opts === "object" ? opts : {};
      syncWs();
      const d = chatDescOf(o.tabId);
      if (!d) {
        // say why (callers rely on the dock's toast): not a chat, or no such tab
        const ws = currentWs;
        const raw = typeof o.tabId === "string" ? refOf(ws, o.tabId) || (/^(chat|center):/.test(o.tabId) ? null : o.tabId) : null;
        toast(`Can't move to a new workspace: ${raw && ws && liveTab(ws, raw) ? "chats only" : "can't move this tab"}`);
        return Promise.reject(new Error("no such chat tab"));
      }
      const toEl = o.targetEl instanceof Element ? o.targetEl : null;
      return moveToNewWorkspace(d, {
        projectId: o.projectId,
        sourcePaneId: o.sourcePaneId,
        toEl,
        fromRect: o.fromRect || null,
        animate: o.animate === undefined ? !!toEl : !!o.animate,
        follow: o.follow,
      });
    },
    // Whether that tab can go to a new workspace (a chat, not running, not an
    // agent's, in a local project). Without a tab id (dataTransfer is unreadable
    // until the drop): the tab the dock sees dragged now, true when it sees none.
    canDropToNewWorkspace(tabId) {
      if (tabId === undefined || tabId === null || tabId === "") return drag ? wsDropCheck(freshDesc(drag.desc)).ok : true;
      return wsDropCheck(chatDescOf(tabId)).ok;
    },
    // Sizes of the current workspace's history and the kind of the next step each
    // way: "split", "move", "close", "reset", "deck-create", "deck-remove",
    // "deck-rename", "deck-move", "deck-empty" (a deck gone with its last tab) or
    // "workspace" (a chat moved to a new workspace).
    get history() {
      const h = currentWs && S.pq && S.ws ? historyOf() : null;
      const top = (a) => (a && a.length ? a[a.length - 1].kind : null);
      return { undo: h ? h.undo.length : 0, redo: h ? h.redo.length : 0, nextUndo: top(h && h.undo), nextRedo: top(h && h.redo) };
    },
    destroy,
  };
})();
