/*
 * RE-TEMPO · canvas-chrome (user MOD layer)
 * ---------------------------------------------------------------------------
 * pen.dev layout for the design canvas ("look at how the pen.dev UI is
 * structured and let's do it that way for the canvas"). Every visible canvas shell
 * at least 460px wide (Design route, chat canvas tabs, pane-dock panes) gets:
 *
 *   1) Floating left card. The canvas's own left panel ([data-testid=
 *      "canvas-design-sidebar"]) floats over the canvas as a rounded card
 *      (24px from the edges, under the file pill) and gets a tab row on top:
 *      Agent, Layers, then Prototype / Components / Library once a mod
 *      renders them (+ other registered tabs). Layers shows the native panel
 *      (pages, layers, assets, files: untouched, still resizable by its own
 *      handle). Agent shows the workspace chat of this canvas, only while
 *      the card is open on that tab (no chat window ever floats over the
 *      canvas): the app's own chat view, the one its right panel mounts in
 *      the "Chat" tab ([data-testid="canvas-chat-tab"], always mounted while
 *      that panel is open) or the chat route's hidden chat tab body, drawn
 *      over the Agent tab's body (position: fixed on its rect, no
 *      reparenting), with the right panel's "Chat" tab hidden meanwhile.
 *      Above it, pen.dev's session row: the chat's title in a filled box
 *      (a menu: this chat, the canvas's agents, which open their small panel
 *      over their bubble in the canvas, and "New agent"; kept off the page:
 *      the row is the search alone, a new agent starts from the composer,
 *      Enter). The Design route's own
 *      chat brings the app's session row, so ours hides there. Under that
 *      row, the agents list: <section data-rtcb-hub-host>, one per card,
 *      never recreated, rendered by comment-bubbles (which sets data-count
 *      on it); we say which chat the tab shows (data-rcc-hub-chat:
 *      "messages" | "empty") and lay it out from the view it shows
 *      (data-rcc-hub-mode, hubHost): no agents, no height (the chat and its
 *      empty state have the tab); the list or an agent's thread take the
 *      whole area, no ceiling (only the rows scroll), over the chat, which
 *      is veiled meanwhile (faded out, still mounted); over a chat with
 *      messages the list folds into one line ("Agents · N ›") and the chat
 *      has the rest, sliding under it (FLIP, transform only). Never two
 *      screens stacked. openAgents() opens the card on the Agent tab and
 *      brings the list into view.
 *      Open / closed is the native panel state: canvas-quick's round toggle,
 *      Cmd/Ctrl+\ and the app's own actions keep working as before.
 *   2) Vertical tool rail (pen.dev: 36px tools at the 4px inset of a 44px
 *      capsule, 4px apart, 12px from the edge or the card, canvas-quick's
 *      44px round toggle 8px above on its axis; every container of the
 *      chrome keeps that inset around its items, canvas-chrome.css
 *      --rcc-inset). The native "Design tools" toolbar, same buttons, shortcuts and
 *      menus; tools other mods append (canvas-browser) and tools registered
 *      here come after them; nothing hidden or empty keeps a slot. When the
 *      rail does not fit the canvas's height, the app's horizontal bar stays,
 *      lifted above the composer ([data-rcc-hbar]).
 *   3) Right panel as the selection card's body (7): one card with the
 *      selection pill as its top row. Closed, the card is the pill; open,
 *      it only grows downwards: the top row stays identical and in place,
 *      the right panel right under it, as wide (300px at most), down to 8px
 *      over the composer / zoom, its column scrolling inside. No tab row
 *      (its Design tab is clicked when another tab is active), no second
 *      box; closing only hides it (the panel stays mounted for the chat).
 *      Sections in pen.dev's order: Create Component / Context hosts,
 *      Alignment, Position, Layout, Appearance, Typography, Fill, Stroke,
 *      Effects (canvas-shader's Effects section right after the native
 *      ones), Transforms, Classes, then Theme / Code / Export hosts
 *      (canvas-export's Code and Export sections): CSS order on one column,
 *      the style panel's wrappers and canvas-export's root drawn as
 *      display: contents (the app's DOM is never moved). Fields are filled
 *      boxes with their label inside, buttons are filled (the step above
 *      the card's surface).
 *   4) Zoom at the bottom right, 12px from the edges (the composer's base
 *      line, its 40px height): "−  116%  +", the canvas's own view
 *      controls (zoomIn / zoomOut / zoomTo / zoomToFit / zoomToSelection /
 *      toggleSnap, the object the native zoom menu uses); the level opens a
 *      menu with the native menu's items. The native zoom button is hidden.
 *   5) Top: a file pill at the top left (the canvas name; on chat canvas tabs
 *      canvas-quick adds its switcher chevron to it, it is a "Canvas page"
 *      toolbar; no "Auto-saved": the app exposes no save state), and a top
 *      right pill: registered top actions + the app's own Share, drawn over
 *      the pill's slot wherever the app renders it.
 *   6) Bottom left: one floating composer (pen.dev), text only: the input,
 *      the mic (voice-input's dictation, attachVoice: a 32px circle like
 *      send, 4px left of it; Enter while dictating sends) and the round send
 *      button. Nothing else: no "+", effort, model or empty-state chip, no
 *      chat title, counter or chat window. It is the one text box of the
 *      agents too: while an agent's thread shows in the card, or its
 *      popover is open over the agents slot, it answers that agent
 *      ("Reply to #N…" / "Answer #N…", syncReply; each agent and the new
 *      task keep their own draft). It sits in
 *      the left column, 12px from the edge and the bottom, as wide as the
 *      card at most, even closed (the card's last width: the native panel's
 *      273px + 2.5px of border and handle by default; the app's project
 *      sidebar is 264px). Card closed: one row, clear of the zoom, under the
 *      rail (the rail keeps 8px over it). Card open: docked under the card
 *      (its left and width; the card ends 8px above it), two rows: the
 *      input, then send on the right. The switch is a FLIP (transforms only;
 *      the surface is three slices, so its corners never stretch). The
 *      input grows to 6 lines (less when the rail or the card need the
 *      room), then scrolls.
 *      The agents slot (pen.dev's "⊞ 1x" place: comment-bubbles' segment in
 *      [data-rtcb-host], one node per shell, never recreated: its manage
 *      button, which opens the list in the card, openAgents(), then the
 *      avatars, without a counter or divider) is out of the composer: a pill
 *      of its own 8px to its right, on its base line, one composer row high,
 *      with the composer's surface, radius, shadow and inset (outside the
 *      card's column when docked; too narrow beside it: 8px above it). It
 *      shows while the slot shows something (with comment-bubbles: always,
 *      "Manage agents" alone with no agent, a 40px circle, the button as
 *      big and filled as send) and grows to the right, its surface (three
 *      slices) following with transforms only (growPill). Its room, from
 *      8px right of the composer to 12px short of the zoom (or of the view's
 *      edge), 320px at most, less its padding and end cap, is
 *      --rcc-agents-max / data-rcc-max-w on the slot (comment-bubbles
 *      decides how many avatars fit); the same state and window size give
 *      the same room.
 *      Enter deploys an agent task through canvas-comment-agent's createTask
 *      (anchored to the selection, or the whole canvas without one): the
 *      text condenses into a glowing pill that flies to where the new avatar
 *      appears (comment-bubbles' landing(), 500ms), the input empties, send
 *      is pressed; on landing the task is created and "rtcc:launch" goes
 *      out. Shift+Enter: new line. Cmd/Ctrl+Enter sends to the canvas chat
 *      (through the app's own chat input and send button), never a tab
 *      switch. The canvas's horizontal scroll indicator (under the composer)
 *      is hidden. The file pill keeps a hidden [data-rtcb-host-alt].
 *   7) Selection pill: top right under the top pill, as wide as the card
 *      it heads (3), the selection's kind icon + title (storyboard header,
 *      browser / shader frame title, a note's first line; "N selected") +
 *      the properties toggle; nothing selected, no pill. It replaces
 *      canvas-quick's loose toggle pill.
 *
 * What the app draws (assets/index-D2Ui1vc0.js, RE-TEMPO build of
 * 2026-10-14, read on 2026-10-18):
 *   [data-canvas-shell] (flex) > [left sidebar wrapper] + column > row >
 *   [viewport area (relative): stage (Design tools wrapper, inline style
 *   absolute bottom 18 center) + top layer (pointer-events-none absolute
 *   top-0 z-20 > row: "Canvas page" pill | "Canvas controls")] + [right panel
 *   wrapper (relative z-40, inline width) > aside[canvas-right-panel]].
 *   The top row's component props hold panelApi {leftCollapsed,
 *   rightCollapsed, toggleLeftPanel, toggleRightPanel, viewControls} and
 *   pageName; the zoom button's component holds the same view controls.
 *   Right panel tab bodies: div[role=tabpanel][aria-hidden] absolute inset-0,
 *   "invisible" while inactive. Design tab: .overflow-auto flex column with
 *   the alignment accordion, component props, the style panel
 *   ([data-testid="design-selection-style-panel"] > div > div holding the
 *   [data-section] sections) and a 150px spacer.
 *
 * Writes: attributes (data-rcc-*), CSS custom properties, the nodes listed
 * above (inserted, never moved: app nodes stay where React put them), the
 * launch's short-lived layer at body level (.rcc-launch, 6), and on
 * the hosted chat panel four custom properties plus aria-hidden="false"
 * (both restored on unhost). Input on the chrome's own nodes stops there
 * (React would hand a click on a fiberless node to its app ancestors).
 * Calls: panelApi.toggleRightPanel (Agent's "Open chat"), the view controls,
 * a click on the right panel's own Design tab when the hidden Chat tab was
 * active. Nothing else of the app's.
 * Limit: the chat view exists only while the right panel is open (the app
 * unmounts it with the panel), so Agent offers "Open chat" when it is closed.
 * Before the chrome takes a canvas view, the CSS keeps the app's own tool
 * bar and right panel hidden (no native flash while the app mounts it); a
 * view left to the app is marked data-rcc-native (markNative). While the
 * layout is resized (ui-motion's html[data-rtm-resizing]) a sync follows the
 * geometry only, from two reads per frame (syncGeometry).
 * Flag off: localStorage "rtd.canvasChrome" = "off" (read on every sync)
 * removes the layout and gives back the previous chrome. Tools registered by
 * other mods stay, in the app's horizontal tool bar (with their keys): they
 * are features, not layout.
 * API: window.__RE_TEMPO_CANVAS_CHROME__ (see the bottom of this file);
 * window event "rtd:canvas-chrome-ready" (detail: the API) once it exists,
 * "rtd:canvas-chrome-change" (detail: {shell, leftTab, leftOpen}) when a
 * shell's left tab or open state changes, "rtd:canvas-chrome-send" (detail:
 * {shell, text, via: "task" | "chat", task}) when the composer handed a
 * message on, "rtcc:launch" (detail: {taskId, text, rect: the input's
 * DOMRect}) when an agent the composer launched exists. API extras:
 * registerTopAction({id, icon, tooltip, onToggle(ctx) -> pressed?,
 * pressed?: boolean | (ctx) => boolean, shortcutLabel?,
 * shortcut?}) / unregisterTopAction(id) (a button in the top right pill,
 * next to Share; ctx.view = the canvas view, pressed per view; shortcutLabel
 * only shown in the tooltip, the mod owns its key);
 * propertiesOpen / setPropertiesOpen(bool) (the card open, per session);
 * openAgents(view?) -> bool (1: the card open on the Agent tab, the agents
 * list in view, then window event "rtcc:agents-open" {view: the shell});
 * agentsHost(view?) -> the view's [data-rtcb-hub-host] or null (view: the
 * shell or a node in it; none: the canvas view on screen).
 * Rail tools with options: their menu trigger is a 6px corner sub-indicator;
 * a 450ms long press on the tool opens the same menu.
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (window.__RE_TEMPO_CANVAS_CHROME__) return; // double injection

  // ------------------------------------------------------------------ config
  const FLAG = "rtd.canvasChrome";
  const TAB_KEY = "rtd.canvasChrome.leftTab";
  // "1" while the right panel is open because the chrome opened it (the
  // Design route's chat lives in it): survives a reload, flag off reads it
  const AUTO_RIGHT_KEY = "rtd.canvasChrome.autoRight";
  const SHELL = "[data-canvas-shell]";
  const LEFT = '[data-testid="canvas-design-sidebar"]';
  const RIGHT = '[data-testid="canvas-right-panel"]';
  const PILL = '[role="toolbar"][aria-label="Canvas page"]';
  const CONTROLS = '[role="toolbar"][aria-label="Canvas controls"]';
  const TOOLS = '[role="toolbar"][aria-label="Design tools"]';
  const ZOOM_TRIGGER = 'button[aria-label^="Zoom "][aria-label$="%"]';
  const DESIGN_TAB = '[data-testid="canvas-design-tab"]';
  const CHAT_TAB = '[data-testid="canvas-chat-tab"]';
  // a chat route's chat tab body: kept mounted (hidden) under the canvas tab
  const PANE_CHAT = '[data-testid="chat-tab-panel"]';
  // a chat's empty state (its illustration, over "Let's do it")
  const CHAT_EMPTY = '.message-list img.object-contain[class*="h-[276px]"]';
  const KEEPALIVE = '[data-testid="center-tab-keepalive-panel"]';
  const STYLE_PANEL = '[data-testid="design-selection-style-panel"]';
  const PANE_SCOPE = "[data-center-panel-pane], [data-rtd-panel]";
  const LTOG = '[data-testid="rcq-left-toggle"]';
  // The full layout down to a narrow view (a phone-width window, a split
  // pane): the same pieces at any width; under BOTH_W the two cards take
  // turns (syncNarrow), and the agents pill goes above the composer.
  const MIN_W = 460; // chrome on from this shell width...
  const MIN_W_OFF = 420; // ...and off below this one (no flapping)
  const BOTH_W = 700; // the left card, the rail and the properties card side by side, from this view width
  const SEL_MIN = 120; // the selection pill, at its narrowest (an icon, a short name, the toggle)
  const MIN_COMPACT = 344; // narrower views: composer + chip pill only (320 + 2 x 12)
  // 8px grid (canvas-chrome.css: --rcc-gap / --rcc-space / --rcc-col-top)
  const GAP = 24; // floating chrome from the edges (and the card from the rail)
  const SPACE = 8; // base space
  // the top row and the left column (pen.dev, images/127.png): the file pill,
  // the card, the round toggle and the rail share one 12px left edge; the
  // top pills are 36 high at 12px from the top, 8px between pill, toggle and
  // rail (canvas-chrome.css: --rcc-edge / --rcc-col-top)
  const EDGE = 12;
  const BAR = 40; // file pill, top right pill, selection pill (pen.dev, images/131.png)
  const COL_TOP = EDGE + BAR + SPACE; // card and toggle top (60)
  // the one inset (canvas-chrome.css --rcc-inset): from a container's outer
  // edge to every item with a hover or active state inside it
  const INSET = 4;
  // rail column (pen.dev, images/131.png, the comfortable sizes): 36px
  // tools at the inset in a 44px rail (4px apart), 12px from the edge (or
  // from the card), the 44px round toggle 8px above on the same axis
  const RAIL_ITEM = 36;
  const RAIL_W = RAIL_ITEM + 2 * INSET;
  const RAIL_EDGE = 12;
  const TOGGLE = RAIL_W;
  const TOGGLE_GAP = 8;
  const RAIL_STEP = INSET;
  const RAIL_PAD = INSET;
  const MIN_COMPOSER = 360; // the least room the webpanel's card leaves the chrome
  // the composer (6): as wide as the card at most, even closed: the native
  // panel's width (the app's own key) + the card's border (2 x 1px) and
  // resize handle (0.5px); 276 before either is known (273 + 2.5)
  const PANEL_W_KEY = "design-sidebar-width";
  const CARD_CHROME = 2.5;
  const CARD_W = 276;
  const CARD_MIN = 200; // the open card's least height over the docked composer
  const COMP_PAD = INSET;
  const ROW_H = 32; // a composer row: the input's line (20px + 6px padding), send's 32px circle
  const COMP_H = ROW_H + 2 * COMP_PAD; // the composer at rest: one row (40, the pills' height)
  const TA_MAX = 6 * 20 + 12; // the input: 6 lines of 20px + its padding, then it scrolls
  const COMPACT_COMP = 180; // the narrowest composer: padding, the input's least width, send
  const PILL_GAP = 8; // composer | agents pill
  const PILL_MAX = 320; // the agents pill, at most
  const PILL_PAD = INSET; // its padding (canvas-chrome.css; its hairline is drawn inside by its surface): comment-bubbles' 32px items 4px (--rcc-inset) from its edge
  const PILL_MIN = 72; // narrower beside the composer (a compact view): it goes above
  const NATIVE_AFTER = 1500; // a wide view without its top row for this long is the app's (markNative)

  // motion (the mods' shared language): out / in-out easing, durations
  const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
  const EASE_IN_OUT = "cubic-bezier(0.65, 0, 0.35, 1)";
  const DUR = Object.freeze({ micro: 140, small: 220, medium: 360 });
  const PROPS_W = 300; // the selection card (pill and properties), at most
  const ZOOM_MIN = 2;
  const ZOOM_MAX = 800;
  const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
  const MOD = IS_MAC ? "⌘" : "Ctrl+";
  const SHIFT = IS_MAC ? "⇧" : "Shift+";
  // single keys the app, canvas-keys or canvas-browser already own
  const RESERVED_KEYS = new Set(["v", "f", "r", "o", "l", "t", "c", "w", "?"]);
  // Recommended `order` values (pen.dev's right panel), for other mods.
  const ORDER = Object.freeze({
    node: 0,
    createComponent: 10,
    context: 20,
    alignment: 30,
    position: 50,
    layout: 60,
    appearance: 80,
    typography: 85,
    fill: 90,
    stroke: 100,
    effects: 110,
    transforms: 112,
    classes: 113,
    theme: 120,
    code: 130,
    export: 140,
  });
  // Registered sections with STYLE_FIRST <= order < STYLE_END go inside the
  // style panel, between the native sections; the others go in the design
  // tab's column (before the style panel, or after it with canvas-shader's
  // Effects and the Theme / Code / Export hosts).
  const STYLE_FIRST = 40;
  const STYLE_END = 115;

  const ATTR = {
    shell: "data-rcc-shell",
    left: "data-rcc-left",
    right: "data-rcc-right",
    card: "data-rcc-card",
    tab: "data-rcc-tab",
    row: "data-rcc-row",
    railwrap: "data-rcc-railwrap",
    rail: "data-rcc-rail",
    rwrap: "data-rcc-rwrap",
    rrow: "data-rcc-rrow",
    props: "data-rcc-props",
    style: "data-rcc-style",
    hosted: "data-rcc-chat-hosted",
    veil: "data-rcc-chat-veil",
    hideTab: "data-rcc-hide-tab",
    zoomed: "data-rcc-zoom",
    empty: "data-rcc-empty",
    selpill: "data-rcc-selpill",
    compact: "data-rcc-compact",
    hbar: "data-rcc-hbar",
    hbarwrap: "data-rcc-hbarwrap",
    grp: "data-rcc-grp",
    opts: "data-rcc-opts",
    dd: "data-rcc-dd",
    share: "data-rcc-share",
    own: "data-rcc-own",
    native: "data-rcc-native",
  };

  // ------------------------------------------------------------------- icons
  const svg = (inner, extra) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${extra || 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  // lucide: message-circle, layers, presentation, component, library,
  // square-dashed-mouse-pointer-ish frame, minus, plus, check
  const ICON = {
    agent: svg('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>'),
    layers: svg(
      '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>'
    ),
    prototype: svg('<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/>'),
    components: svg(
      '<path d="M15.536 11.293a1 1 0 0 0 0 1.414l2.376 2.377a1 1 0 0 0 1.414 0l2.377-2.377a1 1 0 0 0 0-1.414l-2.377-2.377a1 1 0 0 0-1.414 0z"/><path d="M2.297 11.293a1 1 0 0 0 0 1.414l2.377 2.377a1 1 0 0 0 1.414 0l2.377-2.377a1 1 0 0 0 0-1.414L6.088 8.916a1 1 0 0 0-1.414 0z"/><path d="M8.916 17.912a1 1 0 0 0 0 1.415l2.377 2.376a1 1 0 0 0 1.414 0l2.377-2.376a1 1 0 0 0 0-1.415l-2.377-2.376a1 1 0 0 0-1.414 0z"/><path d="M8.916 4.674a1 1 0 0 0 0 1.414l2.377 2.376a1 1 0 0 0 1.414 0l2.377-2.376a1 1 0 0 0 0-1.414l-2.377-2.377a1 1 0 0 0-1.414 0z"/>'
    ),
    library: svg('<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>'),
    file: svg('<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>'),
    frame: svg('<line x1="22" x2="2" y1="6" y2="6"/><line x1="22" x2="2" y1="18" y2="18"/><line x1="6" x2="6" y1="2" y2="22"/><line x1="18" x2="18" y1="2" y2="22"/>'),
    minus: svg('<path d="M5 12h14"/>'),
    plus: svg('<path d="M5 12h14"/><path d="M12 5v14"/>'),
    check: svg('<polyline points="20 6 9 17 4 12"/>'),
    send: svg('<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>'),
    // dictation (voice-input's states: idle, recording, finishing)
    mic: svg('<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>'),
    micStop: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2.5" fill="currentColor"/></svg>',
    micBusy: svg('<path d="M21 12a9 9 0 1 1-6.22-8.56"/>'),
    chevron: svg('<path d="m6 9 6 6 6-6"/>'),
    expand: svg('<path d="M17 7 7 17"/><path d="M17 17H7V7"/>'),
    panelRight: svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>'),
    globe: svg('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>'),
    sparkles: svg('<path d="M9.94 14.06 4 20M14 4l1.5 3L19 8.5 15.5 10 14 13l-1.5-3L9 8.5 12.5 7z"/><path d="M5 3v4M3 5h4"/>'),
    note: svg('<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/>'),
    stack: svg('<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
  };

  // ----------------------------------------------------------------- helpers
  const ls = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch (_) {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch (_) {}
    },
  };
  const enabled = () => ls.get(FLAG) !== "off";
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    n.setAttribute(ATTR.own, "");
    return n;
  };
  const iconEl = (markup, cls) => {
    const s = el("span", cls || "rcc-ico");
    s.innerHTML = markup; // constant SVG or a registered icon string
    return s;
  };
  // a registered icon: SVG markup string, an Element (cloned) or nothing
  const iconOf = (icon, fallback) => {
    if (icon instanceof Element) {
      const s = el("span", "rcc-ico");
      s.append(icon.cloneNode(true));
      return s;
    }
    return iconEl(typeof icon === "string" && icon.trim().startsWith("<") ? icon : fallback);
  };
  const setAttr = (n, name, value) => {
    if (value == null || value === false) {
      if (n.hasAttribute(name)) n.removeAttribute(name);
    } else {
      const v = value === true ? "" : String(value);
      if (n.getAttribute(name) !== v) n.setAttribute(name, v);
    }
  };
  const setVar = (n, name, px) => {
    const v = `${Math.round(px * 10) / 10}px`;
    if (n.style.getPropertyValue(name) !== v) n.style.setProperty(name, v);
  };
  const shown = (n) => !!n && n.isConnected && n.getClientRects().length > 0;
  const isEditable = (n) =>
    !!(n && n.closest && n.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .monaco-editor, .ProseMirror'));
  const inOverlay = (n) => !!(n && n.closest && n.closest('[role="menu"], [role="listbox"], [role="dialog"]'));
  // The canvas and the app's React handlers never see input on the chrome: a
  // click on a node without a fiber is dispatched by React to the handlers of
  // its nearest app ancestors (the panel wrapper, the canvas view), so presses,
  // clicks, wheel and context menu stop at our nodes (bubble phase: listeners
  // on our own nodes and their children run first).
  const stopCanvas = (node) => {
    for (const t of ["pointerdown", "mousedown", "click", "dblclick", "wheel", "contextmenu"]) node.addEventListener(t, (e) => e.stopPropagation());
  };
  // Errors (render blocks, registered callbacks) never stop the rest of the
  // chrome: logged with console.warn and kept for errors() (the last 50).
  const errorLog = [];
  function noteError(where, err, shell) {
    errorLog.push({ at: new Date().toISOString(), where, message: String((err && err.message) || err), view: shell ? viewKind(shell) : null });
    if (errorLog.length > 50) errorLog.shift();
    console.warn(`[canvas-chrome] ${where}:`, err);
  }
  const safe = (fn, ...args) => {
    try {
      return fn(...args);
    } catch (err) {
      noteError((fn && fn.name) || "callback", err);
      return undefined;
    }
  };
  // which kind of canvas view a shell is
  function viewKind(shell) {
    if (shell.closest("[data-rtd-panel]")) return "pane";
    if (shell.closest("[data-center-panel-pane]")) return "chat-tab";
    return "design";
  }
  const emit = (name, detail) => {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (_) {}
  };

  // ----------------------------------------------------- React tree (read-only)
  const fiberOf = (node) => {
    if (!node) return null;
    const k = Object.keys(node).find((x) => x.startsWith("__reactFiber$"));
    return k ? node[k] : null;
  };
  function propsUp(node, test, depth) {
    let f = fiberOf(node);
    for (let i = 0; f && i < depth; i++, f = f.return) {
      const p = f.memoizedProps;
      if (p && typeof p === "object" && safe(test, p)) return p;
    }
    return null;
  }
  const isControls = (c) => !!c && typeof c.zoomIn === "function" && typeof c.zoomOut === "function" && typeof c.getZoom === "function";

  // The canvas top toolbar's row: two slots (the "Canvas page" pill or an
  // empty div, "Canvas controls" or an empty div) in the absolute top layer.
  // Found through a native pill or the controls, else through its props.
  function topRow(shell) {
    const known = shell.querySelector(`${PILL}:not([${ATTR.own}]), ${CONTROLS}`);
    if (known && known.parentElement && known.parentElement.parentElement) return known.parentElement;
    for (const n of shell.querySelectorAll(".pointer-events-none.absolute > div")) if (rowProps(n)) return n;
    return null;
  }
  const rowProps = (row) => propsUp(row, (p) => p.panelApi && typeof p.panelApi.toggleLeftPanel === "function", 4);

  function viewControls(shell, api) {
    if (api && isControls(api.viewControls)) return api.viewControls;
    for (const b of shell.querySelectorAll(ZOOM_TRIGGER)) {
      const p = propsUp(b, (q) => isControls(q.controls), 8);
      if (p) return p.controls;
    }
    return null;
  }

  // ----------------------------------------------------------------- registry
  const BUILTIN_TABS = [
    { id: "agent", label: "Agent", icon: ICON.agent, builtin: true },
    { id: "layers", label: "Layers", icon: ICON.layers, builtin: true, native: true },
    { id: "prototype", label: "Prototype", icon: ICON.prototype, builtin: true },
    { id: "components", label: "Components", icon: ICON.components, builtin: true },
    { id: "library", label: "Library", icon: ICON.library, builtin: true },
  ];
  const RESERVED_TABS = new Set(["agent", "layers"]);
  const leftTabs = new Map(); // id -> registered def
  const rightSections = new Map(); // id -> registered def
  const tools = new Map(); // id -> registered def
  let regSeq = 0;
  let armedTool = null; // id of the armed registered tool
  const wired = new Map(); // tool bar -> its disarm listener (removed on dispose)

  const validId = (id) => typeof id === "string" && /^[a-z0-9][a-z0-9-]{0,40}$/i.test(id);

  // Tabs of one shell, in order: built-ins (a mod's def replaces the empty
  // host of Prototype / Components / Library), then other registered tabs.
  function tabsFor(rec) {
    const out = [];
    for (const b of BUILTIN_TABS) {
      const reg = leftTabs.get(b.id);
      // Prototype / Components / Library: only once a mod renders them
      if (!b.native && b.id !== "agent" && !(reg && typeof reg.render === "function")) continue;
      out.push(reg ? { ...b, ...reg, builtin: true, registered: true } : b);
    }
    for (const [id, def] of leftTabs) if (!BUILTIN_TABS.some((b) => b.id === id)) out.push({ ...def, registered: true });
    return out;
  }

  // ------------------------------------------------------------------ shells
  const recs = new Map(); // shell -> record
  let uidSeq = 0;
  let lastShell = null; // last canvas pressed (tools and shortcuts go there)

  function recOf(shell) {
    let r = recs.get(shell);
    if (!r) {
      r = {
        shell,
        uid: ++uidSeq,
        tab: null,
        head: null,
        headSig: "",
        file: null,
        fileSig: "",
        zoom: null,
        zoomSig: "",
        controls: null,
        unsub: null,
        chatOff: { x: 0, y: 0 },
        lastLeftOpen: null,
        ro: null,
        observed: new Set(),
        panels: new Map(), // tab id -> host (kept across wrapper re-renders)
        fileAlt: null, // hidden [data-rtcb-host-alt] of the file pill
        comp: null, // composer + chip + agents slot
        sel: null, // selection pill
        selSig: null,
        sending: false,
        lastChat: "",
        hostedChat: null, // the chat view drawn on the Agent tab (1)
        agent: null, // the Agent tab's parts (buildAgentPanel)
        hostMO: null,
        hostMOFor: null,
        autoRight: false, // the chrome opened the right panel (Design route chat)
        rightTry: 0,
      };
      recs.set(shell, r);
    }
    return r;
  }

  const agentAvailable = (shell) => !!shell.querySelector(CHAT_TAB) || !shell.closest(PANE_SCOPE);

  function eligible(shell, wasOn) {
    if (!shown(shell)) return null;
    if (getComputedStyle(shell).visibility === "hidden") return null;
    const w = shell.getBoundingClientRect().width;
    if (w < (wasOn ? MIN_W_OFF : MIN_W)) return null;
    const row = topRow(shell);
    const layer = row && row.parentElement;
    const area = layer && layer.parentElement;
    if (!layer || !area || !shell.contains(area) || area === shell) return null;
    const props = rowProps(row);
    if (!props) return null;
    return { row, layer, area, api: props.panelApi, pageName: typeof props.pageName === "string" ? props.pageName.trim() : "" };
  }

  // A view too narrow for the layout (a dock pane under 460px) still gets the
  // composer and the chip pill: the app's own chrome stays (left panel in
  // flow, its pills, its zoom), the tool bar stays horizontal, lifted above
  // the composer. Needs the canvas's top layer (for the viewport area).
  function compactInfo(shell) {
    if (!shown(shell) || getComputedStyle(shell).visibility === "hidden") return null;
    if (shell.getBoundingClientRect().width < MIN_COMPACT) return null;
    const row = topRow(shell);
    const layer = row && row.parentElement;
    const area = layer && layer.parentElement;
    if (!layer || !area || !shell.contains(area) || area === shell) return null;
    const props = rowProps(row);
    return { row, layer, area, api: props ? props.panelApi : null, pageName: props && typeof props.pageName === "string" ? props.pageName.trim() : "", compact: true };
  }
  function syncCompact(rec, c) {
    const sh = rec.shell;
    if (sh.hasAttribute(ATTR.shell)) teardownShell(rec, true, true); // the full layout goes, the composer stays
    setAttr(sh, ATTR.compact, true);
    setAttr(sh, ATTR.native, false);
    rec.unready = 0;
    observe(rec, c.area);
    // the composer as in the full layout: bottom left, 12px from the edges,
    // one row, as wide as the card at most (the pane is at least 344 wide);
    // right of the app's left panel when it is open and leaves it room for
    // the input and send (COMPACT_COMP), else over it (the shell holds it)
    try {
      syncComposer(rec, { ...c, area: sh });
      const s = sh.getBoundingClientRect();
      const lp = sh.querySelector(LEFT);
      const lr = lp && leftOpen(lp) ? lp.getBoundingClientRect() : null;
      const x = lr && lr.width > 1 && s.right - lr.right - 2 * EDGE >= COMPACT_COMP ? lr.right - s.left + EDGE : EDGE;
      const w = Math.max(0, Math.min(cardWidth(), s.width - x - EDGE));
      placeComposer(rec, "row", x, w, EDGE, Math.max(ROW_H, Math.min(TA_MAX, s.height / 2 - 2 * COMP_PAD)));
      syncAgentsRoom(rec.comp, x, x + w, s.width - EDGE, true); // (in the shell's coordinates)
      syncDockChat(rec, c); // no card in a compact view: composer + agents only
    } catch (err) {
      noteError("compact composer", err, sh);
    }
    try {
      const tb = c.area.querySelector(TOOLS);
      const wrap = tb && tb.parentElement && tb.parentElement.parentElement;
      if (wrap && wrap.style.position === "absolute") setAttr(wrap, ATTR.hbarwrap, true);
      const a = sh.getBoundingClientRect();
      setVar(sh, "--rcc-free-l", EDGE);
      setVar(sh, "--rcc-free-r", EDGE);
      // the tool bar rises above the composer (and the agents pill) only
      // where they meet
      const cw = rec.comp && rec.comp.wrap.isConnected ? rec.comp.wrap.getBoundingClientRect() : null;
      const pr = cw && pillOn(rec.comp) ? rec.comp.pill.getBoundingClientRect() : null;
      const right = pr ? Math.max(cw.right, pr.right) : cw && cw.right;
      const top = pr ? Math.min(cw.top, pr.top) : cw && cw.top;
      const hr = tb ? tb.getBoundingClientRect() : null;
      const meets = !!cw && cw.height > 0 && (!hr || hr.width === 0 || (hr.right > cw.left && hr.left < right));
      setVar(sh, "--rcc-hbar-bottom", meets ? a.bottom - top + SPACE : EDGE);
    } catch (err) {
      noteError("compact geometry", err, sh);
    }
  }

  // open = the native panel content is mounted (collapsed, the app leaves an
  // empty w-0 box in the wrapper)
  function leftOpen(side) {
    if (!side) return false;
    for (const c of side.children) {
      if (c.hasAttribute(ATTR.own)) continue;
      if (c.style.display === "contents" || c.querySelector("aside")) return true;
      if (c.getBoundingClientRect().width > 1) return true;
    }
    return false;
  }

  // -------------------------------------------------------------- left card
  function defaultTab(rec, list) {
    const stored = ls.get(TAB_KEY);
    if (stored && list.some((t) => t.id === stored)) return stored;
    return "agent";
  }

  function selectTab(rec, id, focus) {
    if (rec.tab === id) return;
    rec.tab = id;
    ls.set(TAB_KEY, id);
    syncShellSoon(rec, focus ? id : null);
    emit("rtd:canvas-chrome-change", { shell: rec.shell, leftTab: id, leftOpen: rec.lastLeftOpen });
  }

  function renderHead(rec, list) {
    const sig = list.map((t) => `${t.id}:${t.label}:${t.seq || 0}`).join("|") + `#${rec.tab}`;
    if (rec.head && rec.headSig === sig) return;
    rec.headSig = sig;
    let head = rec.head;
    if (!head) {
      head = rec.head = el("div", "rcc-card-head");
      head.dataset.testid = "rcc-left-tabs";
      head.setAttribute("role", "tablist");
      head.setAttribute("aria-label", "Canvas panel");
      head.addEventListener("click", (e) => {
        const b = e.target instanceof Element ? e.target.closest(".rcc-tab") : null;
        if (b && head.contains(b)) selectTab(rec, b.dataset.rccTabId, false);
      });
      head.addEventListener("keydown", (e) => onHeadKey(rec, e));
      head.addEventListener("pointerover", (e) => {
        const b = e.target instanceof Element ? e.target.closest("[data-rcc-tab-tip]") : null;
        if (b && head.contains(b)) scheduleTip(b);
      });
      head.addEventListener("pointerout", (e) => {
        const b = e.target instanceof Element ? e.target.closest("[data-rcc-tab-tip]") : null;
        if (b && !(e.relatedTarget instanceof Node && b.contains(e.relatedTarget))) hideTip();
      });
      head.addEventListener("pointerdown", hideTip);
      head.addEventListener("scroll", hideTip, { passive: true });
      stopCanvas(head);
    }
    const kids = list.map((t) => {
      const on = t.id === rec.tab;
      const b = el("button", `rcc-tab${on ? " rcc-tab-on" : ""}`);
      b.type = "button";
      b.dataset.rccTabId = t.id;
      b.dataset.testid = `rcc-left-tab-${t.id}`;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      b.setAttribute("aria-label", t.label);
      if (!t.native) b.setAttribute("aria-controls", panelId(rec, t.id));
      if (!on) b.dataset.rccTabTip = t.label;
      b.append(iconOf(t.icon, ICON.frame));
      if (on) b.append(el("span", "rcc-tab-label", t.label));
      return b;
    });
    const hadFocus = head.contains(document.activeElement);
    head.replaceChildren(...kids);
    const on = head.querySelector(".rcc-tab-on");
    if (on) {
      if (hadFocus) on.focus({ preventScroll: true }); // the clicked tab keeps the focus
      if (head.scrollWidth > head.clientWidth) on.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  // One tooltip at body level (500 ms, like the app's), under its tab.
  const tip = { el: null, timer: 0, anchor: null };
  function scheduleTip(b) {
    if (tip.anchor === b) return;
    hideTip();
    tip.anchor = b;
    tip.timer = setTimeout(() => {
      if (!b.isConnected || tip.anchor !== b) return;
      const t = el("div", "rcc-tip", b.dataset.rccTabTip);
      t.setAttribute("role", "tooltip");
      t.dataset.testid = "rcc-tab-tip";
      document.body.append(t);
      const r = b.getBoundingClientRect();
      const w = t.offsetWidth;
      t.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)))}px`;
      t.style.top = `${Math.round(r.bottom + 6)}px`;
      tip.el = t;
    }, 500);
  }
  function hideTip() {
    clearTimeout(tip.timer);
    tip.timer = 0;
    tip.anchor = null;
    if (tip.el) tip.el.remove();
    tip.el = null;
  }

  function onHeadKey(rec, e) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const btns = Array.from(rec.head.querySelectorAll(".rcc-tab"));
    const i = btns.findIndex((b) => b.dataset.rccTabId === rec.tab);
    let j = i;
    if (e.key === "ArrowLeft") j = (i - 1 + btns.length) % btns.length;
    else if (e.key === "ArrowRight") j = (i + 1) % btns.length;
    else if (e.key === "Home") j = 0;
    else j = btns.length - 1;
    e.preventDefault();
    e.stopPropagation();
    if (btns[j]) selectTab(rec, btns[j].dataset.rccTabId, true);
  }

  const panelId = (rec, id) => `rcc-${rec.uid}-panel-${id}`;

  // One host per non-native tab, in the card. A registered render() runs once
  // per host (its return value, a function, runs when the host goes away);
  // the host is kept per shell, so a re-render of the app's wrapper only
  // re-attaches it.
  function ensurePanel(rec, card, t) {
    const id = panelId(rec, t.id);
    let p = rec.panels.get(t.id) || null;
    const def = t.registered ? leftTabs.get(t.id) : null;
    if (p && p.__rccDef !== def) {
      dropPanel(p);
      p = null;
    }
    if (p && p.parentElement !== card) card.append(p);
    if (!p) {
      p = el("div", "rcc-panel");
      p.id = id;
      p.dataset.testid = `rcc-left-panel-${t.id}`;
      p.dataset.rccPanel = t.id;
      p.setAttribute("role", "tabpanel");
      p.setAttribute("aria-label", t.label);
      p.__rccDef = def;
      stopCanvas(p);
      card.append(p);
      rec.panels.set(t.id, p);
      if (def && typeof def.render === "function") {
        const cleanup = safe(def.render, p, ctxFor(rec));
        if (typeof cleanup === "function") track(p, cleanup);
      } else if (t.id === "agent") {
        buildAgentPanel(rec, p);
      } else {
        p.append(emptyState(t.label, "Nothing here yet."));
      }
    }
    return p;
  }
  // Hosts with a cleanup: dropped by us (dropPanel) or by the app (a panel
  // that unmounts takes our nodes with it; the sweep in tick() notices).
  const tracked = new Set();
  function track(n, cleanup) {
    n.__rccCleanup = cleanup;
    tracked.add(n);
  }
  function dropPanel(p) {
    if (typeof p.__rccCleanup === "function") safe(p.__rccCleanup);
    p.__rccCleanup = null;
    tracked.delete(p);
    for (const rec of recs.values()) {
      for (const [id, q] of rec.panels) if (q === p) rec.panels.delete(id);
      if (rec.agent && rec.agent.panel === p) rec.agent = null;
    }
    p.remove();
  }
  function sweep() {
    for (const n of Array.from(tracked)) if (!n.isConnected) dropPanel(n);
    for (const [tb, fn] of Array.from(wired))
      if (!tb.isConnected) {
        tb.removeEventListener("click", fn);
        wired.delete(tb);
      }
    for (const t of topActions.values()) for (const sh of Array.from(t.byView.keys())) if (!sh.isConnected) t.byView.delete(sh);
  }
  function emptyState(title, body, action) {
    const box = el("div", "rcc-empty");
    box.append(el("div", "rcc-empty-title", title), el("div", "rcc-empty-body", body));
    if (action) {
      const b = el("button", "rcc-empty-action", action.label);
      b.type = "button";
      b.dataset.testid = action.testid || "";
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        action.run();
      });
      box.append(b);
    }
    return box;
  }

  const ctxFor = (rec) => ({
    shell: rec.shell,
    canvasRoot: rec.shell.querySelector("[data-canvas-root]"),
    api: window.__RE_TEMPO_CANVAS_CHROME__,
  });

  function syncCard(rec, g) {
    const side = rec.shell.querySelector(`:scope > ${LEFT}`);
    if (!side) return { side: null, open: false };
    const open = leftOpen(side);
    setAttr(side, ATTR.card, true);
    setAttr(rec.shell, ATTR.left, open ? "open" : "closed");
    const list = tabsFor(rec);
    if (!rec.tab || !list.some((t) => t.id === rec.tab)) rec.tab = defaultTab(rec, list);
    setAttr(side, ATTR.tab, rec.tab);
    if (open) observe(rec, side); // resizing the panel moves the rail
    renderHead(rec, list);
    if (rec.head.parentElement !== side) side.prepend(rec.head);
    const keep = new Set([rec.head]);
    for (const t of list) {
      if (t.native) continue;
      const p = ensurePanel(rec, side, t);
      keep.add(p);
      const on = t.id === rec.tab;
      setAttr(p, "hidden", !on);
    }
    for (const c of Array.from(side.children)) if (c.hasAttribute(ATTR.own) && !keep.has(c)) dropPanel(c);
    for (const [id, p] of Array.from(rec.panels)) if (!keep.has(p)) dropPanel(p);
    if (rec.lastLeftOpen !== open) {
      const first = rec.lastLeftOpen === null;
      rec.lastLeftOpen = open;
      if (!first) emit("rtd:canvas-chrome-change", { shell: rec.shell, leftTab: rec.tab, leftOpen: open });
    }
    return { side, open };
  }

  // ------------------------------------------------------- Agent tab chat
  // The Agent tab IS the chat window (1): the app's own chat view for this
  // canvas, drawn on the tab's body (position: fixed on its rect, nothing
  // moved: hostChat) whenever the card is open on that tab, without a click.
  // Where it comes from:
  //  - "own": the canvas's right panel Chat tab body (Design route). The app
  //    mounts it only while that panel is open: the panel is opened when the
  //    app has it collapsed (once every 3 s at most) and stays hidden as the
  //    closed properties dropdown (3), so the chat is there even with the
  //    right panel "closed". It brings the app's own session picker row (the
  //    active chat, a new chat): the tab's own head row hides. Flag off
  //    collapses it again when the chrome opened it and the dropdown is not
  //    wanted;
  //  - "workspace": a chat route canvas tab has no chat of its own; the
  //    workspace's chat tab body ([data-testid="chat-tab-panel"]) stays
  //    mounted, hidden, under the canvas tab of the same pane (else of any
  //    pane). It is drawn here while the app keeps it hidden (inline
  //    visibility: hidden) and goes back the moment its own tab comes on top;
  //    the tab's head row is the session row (the chat's title, its agents);
  //  - "beside": that chat is on screen in another pane: it stays there.
  const hostOwner = new WeakMap(); // hosted chat view -> the rec drawing it
  function dockChat(rec) {
    const sh = rec.shell;
    const own = sh.querySelector(CHAT_TAB);
    if (own) return { node: own, source: "own" };
    const pane = sh.closest(PANE_SCOPE);
    if (!pane) return { node: null, source: sh.querySelector(RIGHT) ? "none" : "mounting" };
    let list = Array.from(pane.querySelectorAll(PANE_CHAT));
    if (!list.length) list = Array.from(document.querySelectorAll(PANE_CHAT));
    list = list.filter((p) => !p.contains(sh) && shown(p));
    const hiddenByApp = (p) => p.style.visibility === "hidden";
    const free = list.find((p) => hiddenByApp(p) && (!hostOwner.has(p) || hostOwner.get(p) === rec));
    if (free) return { node: free, source: "workspace" };
    if (list.some((p) => !hiddenByApp(p))) return { node: null, source: "beside" };
    return { node: null, source: "none" };
  }

  // The Agent tab's parts: a head row (the search),
  // the agents list's host (hubHost) and the body the chat view is drawn on.
  function buildAgentPanel(rec, p) {
    const head = el("div", "rcc-agent-head");
    head.dataset.testid = "rcc-agent-head";
    const sess = el("button", "rcc-agent-session");
    sess.type = "button";
    sess.dataset.testid = "rcc-agent-session";
    sess.setAttribute("aria-haspopup", "menu");
    sess.setAttribute("aria-expanded", "false");
    const sessLabel = el("span", "rcc-agent-session-label");
    sess.append(sessLabel, iconEl(ICON.chevron, "rcc-ico rcc-agent-session-chev"));
    // by request, no chat menu and no "+ New" in the head row: one search
    // over the agents and this chat, the whole row (the field is
    // comment-bubbles' own, moved into this slot: data-rtcb-search-host). A
    // new agent starts from the composer under the card (Enter). The chat's
    // title (the session button, kept off the page) is told to the list's
    // host as data-rcc-chat-title (the search's "chat" match).
    const search = el("div", "rcc-agent-search");
    search.setAttribute("data-rtcb-search-host", "");
    search.dataset.testid = "rcc-agent-search";
    head.append(search);
    const body = el("div", "rcc-agent-body");
    body.dataset.testid = "rcc-agent-body";
    // the tab's area under the head row: the agents list's host, then the
    // body the chat is drawn on (the host lies over the body when the list
    // or a thread takes the whole area)
    const stage = el("div", "rcc-agent-stage");
    stage.append(hubHost(rec), body);
    p.append(head, stage);
    sess.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSessionMenu(rec, sess);
    });
    rec.agent = { panel: p, head, sess, sessLabel, search, stage, body, view: null, viewSig: "" };
  }
  // The agents list's host (1): a section over the chat that comment-bubbles
  // renders the list in and gives data-count. One per card, never
  // recreated: a rebuilt Agent panel takes the same node back. We tell it
  // which chat the tab shows (data-rcc-hub-chat: "messages" | "empty") and
  // lay it out from the view it shows (its box's data-view), as
  // data-rcc-hub-mode:
  //   "off"   no agents: no height; the chat (its empty state) has the tab;
  //   "area"  the list ("list"; over a chat with messages only while
  //           expanded) or an agent's thread ("thread") takes the whole
  //           area under the head row, over the chat, which is veiled
  //           (data-rcc-chat-veil: faded out, hidden, still mounted);
  //   "row"   one line ("Agents · N ›") over a chat with messages, which has
  //           the rest and slides under it.
  function hubHost(rec) {
    if (rec.hub) return rec.hub;
    const h = el("section", "rcc-agent-hub");
    h.setAttribute("data-rtcb-hub-host", "");
    h.setAttribute("aria-label", "Agents");
    h.setAttribute("data-rcc-hub-mode", "off");
    h.dataset.testid = "rcc-agent-hub";
    rec.hub = h;
    rec.hubMode = "off";
    if (typeof ResizeObserver === "function") (rec.hubRO = new ResizeObserver(() => safe(hubMoved, rec))).observe(h);
    if (typeof MutationObserver === "function") {
      // the count or the view changed: the mode follows before the frame
      // (and the thread it shows: the composer answers it, syncReply)
      rec.hubMO = new MutationObserver(() => (safe(syncHubMode, rec), safe(syncReply, rec)));
      rec.hubMO.observe(h, { attributes: true, attributeFilter: ["data-count", "data-view", "data-rtcb-thread", "data-rtcb-thread-n", "data-rtcb-thread-ask"], childList: true, subtree: true });
    }
    return h;
  }
  const hubOn = (h) => (parseInt(h.getAttribute("data-count"), 10) || 0) > 0;
  function hubModeOf(h) {
    if (!hubOn(h)) return "off";
    const box = h.querySelector(":scope > [data-view]");
    return box && box.getAttribute("data-view") === "row" ? "row" : "area";
  }
  // a list that appears (off -> row / area) fades in; the chat under an
  // area is veiled (it fades out and back: canvas-chrome.css)
  function syncHubMode(rec) {
    const h = rec.hub;
    if (!h) return;
    const mode = hubModeOf(h);
    const was = rec.hubMode || "off";
    if (mode !== was) {
      rec.hubMode = mode;
      h.setAttribute("data-rcc-hub-mode", mode);
      // (over the chat: once it has mostly faded out, no two texts cross)
      if (was === "off" && !reducedMotion() && typeof h.animate === "function") h.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.small, delay: mode === "area" ? 80 : 0, easing: EASE_OUT, fill: "backwards" });
    }
    veilChat(rec);
  }
  function veilChat(rec) {
    const tp = rec.hostedChat;
    if (!tp || !tp.isConnected) return;
    const on = rec.hubMode === "area";
    if (!on && tp.hasAttribute(ATTR.veil)) rec.unveilAt = performance.now(); // its slide waits for its fade (80ms)
    setAttr(tp, ATTR.veil, on);
  }
  // Which chat the Agent tab shows, for the list's view: "messages" once
  // the chat has one (the app's message list has items), "empty" on its
  // empty state (its illustration) or with no chat here; while a chat
  // loads (neither), what it was. (Not while the card is closed.)
  function syncHubChat(rec) {
    const h = rec.hub;
    if (!h) return;
    const tp = rec.hostedChat && rec.hostedChat.isConnected ? rec.hostedChat : null;
    let st = "empty";
    if (tp) {
      if (tp.querySelector(".message-list [data-item-index]")) st = "messages";
      else if (!tp.querySelector(CHAT_EMPTY)) st = h.getAttribute("data-rcc-hub-chat") || "empty";
    }
    setAttr(h, "data-rcc-hub-chat", st);
  }
  // The agents list shrank: its old area over the chat ([r.top, r.top + h],
  // the card's surface and the list's hairline at its foot) folds up to the
  // list's new edge (scaleY from the top), then goes.
  function foldList(r, h) {
    const f = el("div", "rcc-hub-fold");
    f.setAttribute("aria-hidden", "true");
    Object.assign(f.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${h}px` });
    document.body.append(f);
    flights.add(f);
    const drop = () => {
      f.remove();
      flights.delete(f);
    };
    f.animate([{ transform: "scaleY(1)" }, { transform: "scaleY(0)" }], { duration: DUR.small, easing: EASE_OUT, fill: "forwards" }).finished.then(drop, drop);
    setTimeout(drop, DUR.small + 1500); // a stalled animation (hidden window)
  }
  // The list's height changed (its rows, data-count): the chat under it is
  // placed again at once, not a frame late (a change no sync sees, such as
  // data-count alone), and slides there (placeChat).
  // (Under an area the chat is veiled: placed again, held where it was
  // drawn while it fades out, never slid or folded.)
  function hubMoved(rec) {
    const hh = rec.hub.offsetHeight;
    const was = rec.hubH;
    rec.hubH = hh;
    const tp = rec.hostedChat;
    const host = tp && tp.isConnected && was != null && was !== hh ? agentHost(rec) : null;
    if (host) placeChat(rec, tp, host.getBoundingClientRect(), false, true);
  }
  // where the chat view is drawn: the Agent tab's body, card open on it
  function agentHost(rec) {
    const a = rec.agent;
    if (!a || !a.panel.isConnected || a.panel.hidden) return null;
    if (rec.shell.getAttribute(ATTR.left) !== "open") return null;
    return shown(a.body) ? a.body : null;
  }
  // "New agent" (the session menu): back to the canvas's chat, the composer
  // focused (every message typed there starts a new agent)
  function newAgent(rec) {
    if (rec.agent) rec.agent.view = null;
    closeSessionMenu();
    syncShellSoon(rec);
    const c = rec.comp;
    if (c) {
      c.ta.value = "";
      autosize(c.ta);
      paintSend(rec);
      try {
        c.ta.focus({ preventScroll: true });
      } catch (_) {}
    }
  }
  // Design route: the right panel mounted (it holds the chat view), hidden.
  function keepChatMounted(rec, g) {
    const sh = rec.shell;
    if (sh.closest(PANE_SCOPE) || sh.querySelector(RIGHT)) return;
    if (!g.api || typeof g.api.toggleRightPanel !== "function") return;
    const now = performance.now();
    if (now - rec.rightTry < 3000) return;
    rec.rightTry = now;
    rec.autoRight = true;
    ls.set(AUTO_RIGHT_KEY, "1");
    safe(() => g.api.toggleRightPanel());
  }
  // Flag off: the right panel back as the app had it (collapsed) when the
  // chrome opened it and the dropdown is not wanted.
  function restoreRight(rec) {
    const sh = rec.shell;
    if (!rec.autoRight && !(ls.get(AUTO_RIGHT_KEY) === "1" && !sh.closest(PANE_SCOPE))) return;
    rec.autoRight = false;
    ls.set(AUTO_RIGHT_KEY, "0");
    if (ddWanted || !sh.isConnected || !sh.querySelector(RIGHT)) return;
    const row = topRow(sh);
    const props = row && rowProps(row);
    const api = props && props.panelApi;
    if (api && typeof api.toggleRightPanel === "function") safe(() => api.toggleRightPanel());
  }
  function syncDockChat(rec, g) {
    const full = !g.compact;
    if (full) keepChatMounted(rec, g); // the chat is ready before the card opens
    const host = full ? agentHost(rec) : null;
    const viewing = !!(host && rec.agent && rec.agent.view);
    const d = host && !viewing ? dockChat(rec) : { node: null, source: viewing ? "agent" : "off" };
    if (d.node) hostChat(rec, d.node, host, d.source);
    else if (rec.hostedChat) unhostChat(rec.hostedChat, rec);
    for (const n of rec.shell.querySelectorAll(`[${ATTR.hosted}]`)) if (n !== rec.hostedChat) unhostChat(n);
    if (d.source !== "off") syncHubChat(rec); // the list's view follows the chat (comment-bubbles); a closed card keeps it
    if (rec.agent && rec.agent.panel.isConnected) {
      setDockState(rec, d.source); // own | workspace (drawn) | beside | none | mounting | agent | off
      syncAgentHead(rec, d.source);
      if (viewing) safe(renderAgentView, rec);
    }
    return d;
  }
  // the body without a chat view: a short note (pen.dev's empty state)
  function setDockState(rec, state) {
    const a = rec.agent;
    if (a.body.dataset.rccState === state) return;
    a.body.dataset.rccState = state;
    setAttr(a.panel, "data-rcc-chat", state);
    a.viewSig = "";
    const box =
      state === "none"
        ? emptyState("No chat yet", "Type below: Enter starts an agent on this canvas.")
        : state === "beside"
          ? emptyState("The chat is open beside this canvas", `Enter still starts an agent here. ${MOD}↵ sends to that chat.`)
          : null;
    a.body.replaceChildren(...(box ? [box] : []));
  }
  // the session row: the chat's title (or the agent shown)
  function syncAgentHead(rec, source) {
    const a = rec.agent;
    const t = a.view ? agentTask(a.view) : null;
    const title = t ? norm(t.text) || "Agent" : chatTitle(rec) || storeChat(rec.shell).title || rec.lastChat || "Chat";
    if (!t && title !== "Chat") rec.lastChat = title;
    setText(a.sessLabel, title);
    if (rec.hub) setAttr(rec.hub, "data-rcc-chat-title", t ? null : title);
    if (a.sess.title !== title) a.sess.title = title;
    setAttr(a.sess, "aria-label", `Session: ${title}`);
    setAttr(a.panel, "data-rcc-view", a.view ? "agent" : "chat");
  }

  // The session menu (the head row's title ˅): this canvas's chat (checked),
  // its agents (a click opens that agent's small panel in the canvas, over its
  // bubble: comment-bubbles' open(id); never a chat route), "New agent".
  const sessMenu = { node: null, rec: null, anchor: null };
  function agentTasks() {
    const api = window.__RE_TEMPO_COMMENT_AGENT__;
    const list = api && typeof api.tasks === "function" ? safe(() => api.tasks()) : null;
    return Array.isArray(list) ? list.filter(Boolean) : [];
  }
  function agentTask(id) {
    return agentTasks().find((t) => t.id === id) || null;
  }
  // an agent picked for the tab is shown in the canvas instead: the tab stays on the chat
  function renderAgentView(rec) {
    const a = rec.agent;
    if (!a || !a.view) return;
    const id = a.view;
    a.view = null;
    showAgent(id);
  }
  function showAgent(id) {
    const cb = window.__RE_TEMPO_COMMENT_BUBBLES__;
    if (cb && typeof cb.open === "function") safe(() => cb.open(id));
  }
  function toggleSessionMenu(rec, anchor) {
    if (sessMenu.node && sessMenu.rec === rec) return closeSessionMenu();
    closeSessionMenu();
    closeZoomMenu(false);
    const box = el("div", "rcc-menu rcc-session-menu");
    box.dataset.testid = "rcc-session-menu";
    box.setAttribute("role", "menu");
    box.setAttribute("aria-label", "Session");
    box.tabIndex = -1;
    const item = (label, run, check) => {
      const it = el("div", "rcc-menu-item");
      it.setAttribute("role", "menuitem");
      it.tabIndex = -1;
      it.append(el("span", "rcc-menu-label", label));
      if (check) it.append(iconEl(ICON.check, "rcc-ico rcc-menu-check"));
      it.addEventListener("click", (e) => {
        e.stopPropagation();
        closeSessionMenu();
        safe(run);
      });
      box.append(it);
    };
    item(norm(rec.agent && rec.agent.sessLabel.textContent) || "Chat", () => {}, true);
    const list = agentTasks().slice(-8).reverse();
    if (list.length) box.append(el("div", "rcc-menu-sep"));
    for (const t of list) item(`${norm(t.text) || "Agent"} · ${t.status || ""}`, () => showAgent(t.id));
    box.append(el("div", "rcc-menu-sep"));
    item("New agent", () => newAgent(rec));
    for (const t of ["pointerdown", "mousedown", "wheel", "contextmenu"]) box.addEventListener(t, (e) => e.stopPropagation());
    box.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      closeSessionMenu(true);
    });
    Object.assign(sessMenu, { node: box, rec, anchor });
    document.body.append(box);
    anchor.setAttribute("aria-expanded", "true");
    const r = anchor.getBoundingClientRect();
    box.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, r.left)))}px`;
    box.style.top = `${Math.round(Math.min(window.innerHeight - box.offsetHeight - 8, r.bottom + 6))}px`;
    box.focus({ preventScroll: true });
    document.addEventListener("pointerdown", onSessionMenuOutside, true);
    window.addEventListener("blur", onSessionMenuOutside);
    window.addEventListener("resize", onSessionMenuOutside);
  }
  function onSessionMenuOutside(e) {
    if (e && e.type === "pointerdown" && sessMenu.node && (sessMenu.node.contains(e.target) || (sessMenu.anchor && sessMenu.anchor.contains(e.target)))) return;
    closeSessionMenu();
  }
  function closeSessionMenu(restore) {
    if (!sessMenu.node) return;
    sessMenu.node.remove();
    if (sessMenu.anchor) sessMenu.anchor.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onSessionMenuOutside, true);
    window.removeEventListener("blur", onSessionMenuOutside);
    window.removeEventListener("resize", onSessionMenuOutside);
    if (restore && sessMenu.anchor && sessMenu.anchor.isConnected) sessMenu.anchor.focus({ preventScroll: true });
    Object.assign(sessMenu, { node: null, rec: null, anchor: null });
  }

  // The right panel's Chat tab: the app renders its tabs and tab bodies from
  // one list, so the tab at the chat body's index; the label is the fallback.
  function chatTrigger(tp) {
    const aside = tp.closest(RIGHT);
    if (!aside) return null;
    const bodies = tp.parentElement ? Array.from(tp.parentElement.children).filter((n) => n.getAttribute("role") === "tabpanel") : [];
    const tabsEls = Array.from(aside.querySelectorAll('[role="tablist"] [role="tab"]'));
    if (bodies.length && tabsEls.length === bodies.length) return tabsEls[bodies.indexOf(tp)] || null;
    for (const t of aside.querySelectorAll('[role="tab"]')) {
      if (Array.from(t.children).some((c) => c.textContent.trim() === "Chat") || t.textContent.trim() === "Chat") return t;
    }
    return null;
  }
  const tabActive = (t) => t.getAttribute("aria-selected") === "true" || t.hasAttribute("data-active") || t.hasAttribute("data-selected");

  function hostChat(rec, tp, host, source) {
    if (rec.hostedChat && rec.hostedChat !== tp) unhostChat(rec.hostedChat, rec);
    const prev = hostOwner.get(tp);
    if (prev && prev !== rec) unhostChat(tp, prev);
    if (rec.hostedChat !== tp) rec.chatSig = null;
    rec.hostedChat = tp;
    hostOwner.set(tp, rec);
    if (!tp.hasAttribute(ATTR.hosted)) {
      tp.__rccAriaHidden = tp.getAttribute("aria-hidden");
      tp.setAttribute(ATTR.hosted, "");
    }
    setAttr(tp, ATTR.hosted, source || true); // "own" | "workspace" (the CSS)
    veilChat(rec); // under the list from its first frame (no flash of it)
    if (tp.getAttribute("aria-hidden") !== "false") tp.setAttribute("aria-hidden", "false");
    placeChat(rec, tp, host.getBoundingClientRect(), !resizing(), true);
    const trig = chatTrigger(tp);
    if (trig) {
      setAttr(trig, ATTR.hideTab, true);
      if (tabActive(trig)) {
        const other = Array.from(trig.parentElement ? trig.parentElement.querySelectorAll('[role="tab"]') : []).find((t) => t !== trig);
        if (other) other.click(); // the panel's own Design tab: the chat is here now
      }
    }
    observe(rec, host);
    watchHosted(rec, tp);
  }
  // The hosted chat on its host's rect r (position: fixed). `measure`: the
  // offset a transformed / contained ancestor gives the fixed box is
  // measured (and corrected) when r moved; not while resizing (it does not
  // change with the size, and it is a layout read). `slide`: a chat already
  // placed whose top moved (the agents list above it grew or shrank), with
  // transforms only: moved down, it slides there from where it is drawn
  // (FLIP), uncovering the list; moved up, it takes the room at once (its
  // content stays where it is) and the list's old area folds up over it
  // (foldList). Its own style writes are taken off the chat's observer:
  // they never schedule a sync.
  function placeChat(rec, tp, r, measure, slide) {
    const put = () => {
      setVar(tp, "--rcc-chat-x", r.left - rec.chatOff.x);
      setVar(tp, "--rcc-chat-y", r.top - rec.chatOff.y);
      setVar(tp, "--rcc-chat-w", r.width);
      setVar(tp, "--rcc-chat-h", r.height);
    };
    const sliding = () => !!rec.chatFlip && rec.chatFlip.playState !== "finished" && rec.chatFlip.playState !== "idle";
    const moved = rec.chatTopFor === tp && rec.chatTop != null && Math.abs(rec.chatTop - r.top) >= 1;
    if (slide && rec.hubMode === "area") slide = "hold"; // under the list: veiled, never slid
    // "hold": the list just took the area and the chat is fading out under
    // it: it keeps the box it is drawn in (never over the composer) and
    // takes its new one once it is gone (DUR.micro)
    const holding = rec.holdFor === tp && !!rec.holdT;
    if (holding && slide === "hold") {
      rec.chatTop = r.top;
      rec.holdPut = put;
      if (rec.hostMO && rec.hostMOFor === tp) rec.hostMO.takeRecords();
      return;
    }
    let from = moved ? rec.chatTop : null;
    if (holding) {
      // the list went before the hold was over: from where it is drawn
      from = tp.getBoundingClientRect().top;
      clearTimeout(rec.holdT);
      rec.holdT = rec.holdFor = rec.holdPut = null;
    }
    if (moved && rec.chatFlip) {
      if (sliding()) from = tp.getBoundingClientRect().top; // as drawn
      rec.chatFlip.cancel();
      rec.chatFlip = null;
    }
    rec.chatTop = r.top;
    rec.chatTopFor = tp;
    const live = !reducedMotion() && !resizing() && typeof tp.animate === "function";
    if (slide === "hold" && moved && live) {
      rec.holdFor = tp;
      rec.holdPut = put;
      rec.holdT = setTimeout(() => {
        const fn = rec.holdPut;
        rec.holdT = rec.holdFor = rec.holdPut = null;
        if (fn && rec.hostedChat === tp && tp.isConnected) {
          fn();
          if (rec.hostMO && rec.hostMOFor === tp) rec.hostMO.takeRecords();
        }
      }, DUR.micro);
      if (rec.hostMO && rec.hostMOFor === tp) rec.hostMO.takeRecords();
      return;
    }
    put();
    if (slide && slide !== "hold" && (moved || holding) && from != null && live) {
      const dy = from - r.top;
      // (coming back from under the list: it slides as it fades in, 80ms on)
      const wait = rec.unveilAt && performance.now() - rec.unveilAt < 100 ? 80 : 0;
      if (dy < 0) rec.chatFlip = tp.animate([{ transform: `translateY(${dy.toFixed(1)}px)` }, { transform: "none" }], { duration: DUR.small, delay: wait, easing: EASE_OUT, fill: "backwards" });
      else if (dy > 0) foldList(r, dy);
    }
    const sig = `${r.left} ${r.top} ${r.width} ${r.height}`;
    // (never while the chat slides: its drawn box is not its place)
    if (measure && rec.chatSig !== sig && !sliding()) {
      rec.chatSig = sig;
      const a = tp.getBoundingClientRect();
      const dx = a.left - (r.left - rec.chatOff.x);
      const dy = a.top - (r.top - rec.chatOff.y);
      if (Math.abs(dx - rec.chatOff.x) > 0.5 || Math.abs(dy - rec.chatOff.y) > 0.5) {
        rec.chatOff = { x: dx, y: dy };
        put();
      }
    }
    if (rec.hostMO && rec.hostMOFor === tp) rec.hostMO.takeRecords();
  }
  // Redrawn at once when the app shows that chat's own tab or hides this
  // canvas (inline styles the global observer does not watch).
  function watchHosted(rec, tp) {
    if (rec.hostMO && rec.hostMOFor === tp) return;
    if (rec.hostMO) rec.hostMO.disconnect();
    rec.hostMO = rec.hostMOFor = null;
    if (typeof MutationObserver !== "function") return;
    const m = new MutationObserver(syncAllSoon);
    const opts = { attributes: true, attributeFilter: ["style", "class", "hidden", "inert", "aria-hidden"] };
    m.observe(tp, opts);
    const keep = rec.shell.closest(KEEPALIVE);
    if (keep) m.observe(keep, opts);
    rec.hostMO = m;
    rec.hostMOFor = tp;
  }

  // rec: unhost only what that view draws (another view may draw it now)
  function unhostChat(tp, rec) {
    if (!tp) return;
    const owner = hostOwner.get(tp);
    if (rec && owner && owner !== rec) return;
    if (owner) {
      if (owner.hostedChat === tp) owner.hostedChat = null;
      if (owner.chatTopFor === tp) owner.chatTopFor = null; // hosted again: placed, not slid
      if (owner.chatFlip) owner.chatFlip.cancel();
      owner.chatFlip = null;
      if (owner.hostMO && owner.hostMOFor === tp) {
        owner.hostMO.disconnect();
        owner.hostMO = owner.hostMOFor = null;
      }
      hostOwner.delete(tp);
    }
    if (!tp.hasAttribute(ATTR.hosted)) return;
    tp.removeAttribute(ATTR.hosted);
    tp.removeAttribute(ATTR.veil);
    for (const v of ["--rcc-chat-x", "--rcc-chat-y", "--rcc-chat-w", "--rcc-chat-h"]) tp.style.removeProperty(v);
    const orig = tp.__rccAriaHidden;
    if (orig == null) tp.removeAttribute("aria-hidden");
    else tp.setAttribute("aria-hidden", orig);
    const trig = chatTrigger(tp);
    if (trig) trig.removeAttribute(ATTR.hideTab);
  }

  // ---------------------------------------------------------------- top bar
  function syncFile(rec, g) {
    let pill = rec.file;
    if (!pill) {
      pill = rec.file = el("div", "rcc-file");
      pill.dataset.testid = "rcc-file-pill";
      pill.setAttribute("data-rcc-file", "");
      // a "Canvas page" toolbar: canvas-quick's switcher works on it as on the
      // app's own pill (chat canvas tabs)
      pill.setAttribute("role", "toolbar");
      pill.setAttribute("aria-label", "Canvas page");
      stopCanvas(pill);
    }
    const name = g.pageName || nativeName(rec.shell) || "Untitled canvas";
    const sig = name;
    if (rec.fileSig !== sig || !pill.querySelector(":scope > span.truncate")) {
      rec.fileSig = sig;
      const chev = pill.querySelector(":scope > .rcq-pill-chevron");
      const n = el("span", "truncate rcc-file-name", name);
      n.title = name;
      // no "Auto-saved": the app exposes no save state to bind it to
      // the agents segment lives in the chip row now (comment-bubbles takes
      // the visible [data-rtcb-host]); a hidden alternate stays here
      if (!rec.fileAlt) {
        rec.fileAlt = el("div", "rcc-file-alt");
        rec.fileAlt.setAttribute("data-rtcb-host-alt", "");
        rec.fileAlt.hidden = true;
      }
      pill.replaceChildren(iconEl(ICON.file, "rcc-ico rcc-file-ico"), n, ...(chev ? [chev] : []), rec.fileAlt);
    }
    if (pill.parentElement !== g.layer) g.layer.append(pill);
  }
  function nativeName(shell) {
    const s = shell.querySelector(`${PILL}:not([${ATTR.own}]) > span.truncate`);
    return s ? s.textContent.trim() : "";
  }

  // ------------------------------------------------------------------- rail
  // The rail only when it fits the canvas's height (tools x 36 + gaps +
  // padding, from the rail top down to 8px over the composer at rest, which
  // shares its column); else the app's horizontal tool bar stays, lifted
  // above the composer ([data-rcc-hbar]).
  const railRoom = (areaH) => areaH - (COL_TOP + TOGGLE + TOGGLE_GAP) - (EDGE + COMP_H + SPACE);
  function syncRail(rec, g) {
    rec.railNeed = null;
    const tb = g.area.querySelector(TOOLS);
    const wrap = tb && tb.parentElement && tb.parentElement.parentElement;
    if (!tb || !wrap || wrap.style.position !== "absolute" || !g.area.contains(wrap)) return null;
    markGroups(tb);
    syncTools(rec, tb);
    const n = railItemCount(tb);
    const need = (rec.railNeed = n * RAIL_ITEM + Math.max(0, n - 1) * RAIL_STEP + 2 * RAIL_PAD);
    const room = railRoom(g.area.getBoundingClientRect().height);
    const wasOff = rec.shell.hasAttribute(ATTR.hbar);
    const fits = need <= room - (wasOff ? 16 : 0); // 16px of hysteresis
    setAttr(rec.shell, ATTR.hbar, !fits);
    setAttr(wrap, ATTR.railwrap, fits);
    setAttr(tb, ATTR.rail, fits);
    setAttr(wrap, ATTR.hbarwrap, !fits);
    if (fits) orderRail(tb);
    else for (const k of tb.querySelectorAll("[data-rcc-order], [data-rcc-hide]")) (k.removeAttribute("data-rcc-order"), k.removeAttribute("data-rcc-hide"));
    return fits ? tb : null;
  }
  // tools that would show in the rail (separators and empty hosts left out)
  function railItemCount(tb) {
    let n = 0;
    for (const k of tb.children) {
      if (k.classList.contains("rcc-tools")) {
        for (const c of k.children) if (!c.matches(SEP)) n++;
        continue;
      }
      if (k.matches(SEP) || k.hidden) continue;
      if (!k.firstElementChild && !norm(k.textContent)) continue;
      n++;
    }
    return n;
  }
  // A tool with options: [tool, menu trigger] (the trigger: aria-haspopup
  // "menu", the label "<tool> options" as a fallback). Marked with our own
  // attributes so the CSS never depends on the English label.
  function markGroups(tb) {
    for (const b of tb.querySelectorAll('button[aria-haspopup="menu"], button[aria-label$=" options"]')) {
      const pair = b.parentElement;
      if (!pair || pair === tb || !pair.querySelector(":scope > button:not([aria-haspopup])")) continue;
      setAttr(b, ATTR.opts, true);
      setAttr(pair, ATTR.grp, true);
    }
  }

  // Rail order (CSS order, nothing moved): the app's tools up to its
  // rectangle (0), canvas-browser's separator ("bsep" 2) and Browser
  // ("browser" 3) right after it (by request: select, frame, rectangle,
  // browser, text, comment), the app's tools from Text on ("late" 5), its
  // comment group (separator + Comment, "cmt" 10), what other mods appended
  // ("mod" 20), then the tools registered here (inline order:
  // "before:browser" 29, tools 40, actions 50). React appends a child that mounts
  // late (Comment, once commenting is available) after foreign nodes, so DOM
  // order alone would put it last.
  // Then nothing reserves space for nothing: an item that is invisible
  // (visibility:hidden) or empty (no child, no text) and a separator with no
  // item on one side (first, last, next to another separator) get
  // data-rcc-hide (display:none, so no gap either).
  const isAppNode = (n) => Object.keys(n).some((k) => k.startsWith("__reactFiber$"));
  const SEP = "div.w-px, .rtbf-tool-sep, .rcc-tools-sep, [data-rtcn-sep]";
  function orderRail(tb) {
    const kids = Array.from(tb.children);
    const cmt = kids.find((k) => k.matches('button[aria-label="Comment"]') && isAppNode(k));
    const cmtSep = cmt && kids.slice(0, kids.indexOf(cmt) + 1).reverse().find((k) => k !== cmt && k.matches("div.w-px") && isAppNode(k));
    const TEXT = 'button[aria-label="Text"]';
    const textAt = kids.findIndex((k) => isAppNode(k) && (k.matches(TEXT) || !!k.querySelector(TEXT)));
    kids.forEach((k, i) => {
      let o = null;
      if (k.classList.contains("rcc-tools")) o = null; // its children carry their own order
      else if (k === cmt || k === cmtSep) o = "cmt";
      else if (k.matches(".rtbf-tool-sep, [data-rtbf-sep]")) o = "bsep";
      else if (k.matches("[data-rtbf-tool]")) o = "browser";
      else if (!isAppNode(k)) o = "mod";
      else if (textAt >= 0 && i >= textAt) o = "late";
      setAttr(k, "data-rcc-order", o);
    });
    normalizeRail(tb);
  }
  function normalizeRail(tb) {
    const flat = [];
    for (const k of tb.children) {
      if (k.classList.contains("rcc-tools")) flat.push(...k.children);
      else flat.push(k);
    }
    const items = flat.map((n, i) => ({ n, i, o: parseFloat(getComputedStyle(n).order) || 0, sep: n.matches(SEP) })).sort((a, b) => a.o - b.o || a.i - b.i);
    let prevVisibleIsItem = false;
    const verdict = new Map();
    for (const it of items) {
      if (it.sep) continue;
      const empty = !it.n.firstElementChild && !norm(it.n.textContent);
      const hidden = it.n.hidden || getComputedStyle(it.n).visibility === "hidden" || empty;
      verdict.set(it.n, hidden);
    }
    // separators: only between two shown items, one per boundary
    let pendingSep = null;
    for (const it of items) {
      if (!it.sep) {
        if (verdict.get(it.n)) continue;
        if (pendingSep && prevVisibleIsItem) verdict.set(pendingSep, false);
        pendingSep = null;
        prevVisibleIsItem = true;
        continue;
      }
      verdict.set(it.n, true); // hidden unless an item follows
      if (prevVisibleIsItem && !pendingSep) pendingSep = it.n;
    }
    for (const [n, hide] of verdict) setAttr(n, "data-rcc-hide", hide);
  }

  // Registered tools: one group at the end of the toolbar (after the native
  // buttons and what other mods appended), app button look. Vertical in the
  // rail (the group is display:contents there, its buttons placed by their
  // inline order), horizontal in a toolbar the chrome does not manage.
  function toolOrder(t) {
    return t.place != null ? t.place : t.kind === "action" ? 50 : 40;
  }
  function syncTools(rec, tb) {
    let box = tb.querySelector(":scope > .rcc-tools");
    const list = Array.from(tools.values()).filter((t) => toolAllowed(t, rec));
    // a tool that ended on its own (or started from its own key) shows it
    for (const t of list) {
      if (typeof t.isActive !== "function") continue;
      const on = !!safe(t.isActive);
      if (on && armedTool !== t.id) armedTool = t.id;
      else if (!on && armedTool === t.id) armedTool = null;
    }
    if (!list.length) {
      if (box) box.remove();
      return;
    }
    if (!box) {
      box = el("div", "rcc-tools");
      box.dataset.testid = "rcc-tools";
      box.setAttribute("role", "group");
      box.setAttribute("aria-label", "More tools");
      box.addEventListener("click", (e) => {
        const b = e.target instanceof Element ? e.target.closest(".rcc-tool") : null;
        if (!b) return;
        e.stopPropagation();
        activateTool(b.dataset.rccTool, rec.shell);
      });
      for (const t of ["pointerdown", "mousedown"]) box.addEventListener(t, (e) => e.stopPropagation());
    }
    const sorted = list.slice().sort((a, b) => toolOrder(a) - toolOrder(b) || a.seq - b.seq);
    const sig = sorted.map((t) => `${t.id}:${t.seq}:${armedTool === t.id}`).join("|");
    if (box.dataset.rccSig !== sig) {
      box.dataset.rccSig = sig;
      const focusId = box.contains(document.activeElement) ? document.activeElement.dataset.rccTool : null;
      const kids = [];
      let lastBand = null;
      for (const t of sorted) {
        const ord = toolOrder(t);
        const band = ord < 40 ? "pre" : ord < 50 ? "tools" : "actions";
        // a separator opens each band of ours (the browser band shares
        // canvas-browser's); redundant ones are hidden by normalizeRail
        if (band !== lastBand && band !== "pre") {
          const sp = el("div", "rcc-tools-sep");
          sp.style.order = String(ord);
          kids.push(sp);
        }
        lastBand = band;
        const on = armedTool === t.id;
        const b = el("button", `rcc-tool${on ? " rcc-tool-on" : ""}`);
        b.type = "button";
        b.style.order = String(ord);
        b.dataset.rccTool = t.id;
        b.dataset.testid = `rcc-tool-${t.id}`;
        b.setAttribute("aria-label", t.label);
        if (t.kind !== "action") b.setAttribute("aria-pressed", String(on));
        if (t.shortcut) b.setAttribute("aria-keyshortcuts", t.shortcut.toUpperCase());
        b.dataset.rccTip = t.shortcut ? `${t.label}  ${t.shortcut.toUpperCase()}` : t.label;
        b.append(iconOf(t.icon, ICON.frame));
        kids.push(b);
      }
      box.replaceChildren(...kids);
      // keyboard: the rebuilt button keeps the focus
      if (focusId) {
        const f = box.querySelector(`[data-rcc-tool="${CSS.escape(focusId)}"]`);
        if (f) f.focus({ preventScroll: true });
      }
    }
    if (box.parentElement !== tb) tb.append(box);
    if (!wired.has(tb)) {
      // any native tool disarms the registered one
      const fn = (e) => {
        const b = e.target instanceof Element ? e.target.closest("button") : null;
        if (b && !b.closest(".rcc-tools") && armedTool) disarmTool();
      };
      tb.addEventListener("click", fn);
      wired.set(tb, fn);
    }
  }
  const toolAllowed = (t, rec) => !t.when || safe(t.when, ctxFor(rec)) !== false;

  function activateTool(id, shell) {
    const t = tools.get(id);
    if (!t) return;
    const rec = recs.get(shell) || recOf(shell);
    if (!toolAllowed(t, rec)) return; // hidden for this canvas: its key does nothing either
    const ctx = { ...ctxFor(rec), toolbar: shell.querySelector(TOOLS) };
    if (t.kind === "action") {
      safe(t.onArm, ctx);
      return;
    }
    if (armedTool === id) return disarmTool();
    disarmTool();
    armedTool = id;
    safe(t.onArm, ctx);
    syncAllSoon();
  }
  function disarmTool() {
    const id = armedTool;
    if (!id) return;
    armedTool = null;
    const t = tools.get(id);
    if (t && typeof t.onDisarm === "function") safe(t.onDisarm);
    syncAllSoon();
  }

  // ------------------------------------------------------------ right panel
  function syncRight(rec) {
    const aside = rec.shell.querySelector(RIGHT);
    setAttr(rec.shell, ATTR.right, aside ? "open" : "closed");
    if (!aside) return null;
    const wrap = aside.parentElement;
    const row = wrap && wrap.parentElement;
    if (wrap && row && rec.shell.contains(row) && wrap !== rec.shell) {
      setAttr(wrap, ATTR.rwrap, true);
      setAttr(row, ATTR.rrow, true);
      observe(rec, wrap);
    }
    const tab = aside.querySelector(DESIGN_TAB);
    const props = tab && tab.querySelector(".overflow-auto");
    if (props) {
      setAttr(props, ATTR.props, true);
      // the sections' own column: the parent of the first native section
      const sp = props.querySelector(`:scope > ${STYLE_PANEL}`);
      const first = sp ? Array.from(sp.querySelectorAll("[data-section]")).find((n) => !n.closest("[data-rcc-section]")) : null;
      const inner = first && first.parentElement !== sp ? first.parentElement : null;
      for (const n of props.querySelectorAll(`[${ATTR.style}]`)) if (n !== inner) n.removeAttribute(ATTR.style);
      if (inner) setAttr(inner, ATTR.style, true);
      const label = selectionLabel(sp);
      syncNodeHeader(rec, props, label);
      syncSections(rec, props, inner, label);
    }
    return wrap;
  }

  // pen.dev's panel header: the selected node's name. The app hands it to its
  // style panel component (prop selectionLabel, "N elements" for several) but
  // does not draw it; that component sits inside the style panel's div, so
  // the walk starts at its first DOM child.
  function selectionLabel(sp) {
    const kid = sp && sp.firstElementChild;
    const p = kid ? propsUp(kid, (q) => typeof q.selectionLabel === "string", 16) : null;
    return p ? p.selectionLabel.trim() : "";
  }
  function syncNodeHeader(rec, props, label) {
    let h = props.querySelector(":scope > .rcc-node");
    if (!label) {
      if (h) h.remove();
      return;
    }
    if (!h) {
      h = el("div", "rcc-node");
      h.dataset.testid = "rcc-node-header";
      props.prepend(h);
    }
    if (h.dataset.rccLabel !== label) {
      h.dataset.rccLabel = label;
      const name = el("span", "rcc-node-name", label);
      name.title = label;
      h.replaceChildren(iconEl(ICON.frame, "rcc-ico rcc-node-ico"), name);
    }
  }

  // Registered sections, built like the app's own (header row 40px + body),
  // placed with CSS order (see STYLE_FIRST / STYLE_END). Prepended, never
  // appended: canvas-shader keeps its Effects section last in that column.
  function syncSections(rec, props, inner, label) {
    const want = new Set();
    for (const def of rightSections.values()) {
      const box = def.order >= STYLE_FIRST && def.order < STYLE_END && inner ? inner : props;
      const show = !def.when || safe(def.when, { ...ctxFor(rec), selectionLabel: label }) !== false;
      let s = props.querySelector(`[data-rcc-section="${CSS.escape(def.id)}"]`);
      if (s && (s.__rccDef !== def || s.parentElement !== box)) {
        dropPanel(s);
        s = null;
      }
      if (!show) {
        if (s) dropPanel(s);
        continue;
      }
      if (!s) {
        s = el("div", "rcc-section");
        s.dataset.rccSection = def.id;
        s.dataset.section = def.id;
        s.dataset.testid = `rcc-section-${def.id}`;
        s.__rccDef = def;
        const head = el("div", "rcc-section-head");
        head.setAttribute("data-section-header", def.id);
        const title = el("span", "rcc-section-title", def.label);
        const actions = el("div", "rcc-section-actions");
        head.append(title, actions);
        const body = el("div", "rcc-section-body");
        s.append(head, body);
        box.prepend(s);
        const cleanup = safe(def.render, body, { ...ctxFor(rec), section: s, header: head, actions, selectionLabel: label });
        if (typeof cleanup === "function") track(s, cleanup);
      }
      const ord = String(def.order);
      if (s.style.order !== ord) s.style.order = ord;
      want.add(s);
    }
    for (const s of props.querySelectorAll("[data-rcc-section]")) if (!want.has(s)) dropPanel(s);
  }

  // ------------------------------------------------------------------- zoom
  const zoomPct = (c) => {
    const z = safe(() => c.getZoom());
    return typeof z === "number" && isFinite(z) ? Math.round(z * 100) : null;
  };
  function syncZoom(rec, g) {
    const c = viewControls(rec.shell, g.api);
    if (!c || zoomPct(c) == null) {
      if (rec.zoom) rec.zoom.remove();
      if (rec.unsub) safe(rec.unsub);
      rec.unsub = null;
      rec.controls = null;
      if (zm.rec === rec) closeZoomMenu(false);
      setAttr(rec.shell, ATTR.zoomed, false);
      return;
    }
    if (rec.controls !== c) {
      if (rec.unsub) safe(rec.unsub);
      rec.unsub = null;
      rec.controls = c;
      if (typeof c.subscribe === "function") {
        const u = safe(() => c.subscribe(() => paintZoom(rec)));
        if (typeof u === "function") rec.unsub = u;
      }
    }
    let z = rec.zoom;
    if (!z) {
      z = rec.zoom = el("div", "rcc-zoom");
      z.dataset.testid = "rcc-zoom";
      z.setAttribute("role", "group");
      z.setAttribute("aria-label", "Zoom");
      const out = el("button", "rcc-zoom-btn");
      out.type = "button";
      out.dataset.rccZoom = "out";
      out.setAttribute("aria-label", "Zoom out");
      out.dataset.rccTip = `Zoom out  ${MOD}−`;
      out.append(iconEl(ICON.minus));
      const lvl = el("button", "rcc-zoom-level");
      lvl.type = "button";
      lvl.dataset.rccZoom = "menu";
      lvl.dataset.testid = "rcc-zoom-level";
      lvl.setAttribute("aria-haspopup", "menu");
      lvl.setAttribute("aria-expanded", "false");
      const inn = el("button", "rcc-zoom-btn");
      inn.type = "button";
      inn.dataset.rccZoom = "in";
      inn.setAttribute("aria-label", "Zoom in");
      inn.dataset.rccTip = `Zoom in  ${MOD}+`;
      inn.append(iconEl(ICON.plus));
      z.append(out, lvl, inn);
      stopCanvas(z);
      z.addEventListener("click", (e) => {
        const b = e.target instanceof Element ? e.target.closest("[data-rcc-zoom]") : null;
        if (!b || b.disabled) return;
        e.stopPropagation();
        const cc = rec.controls;
        if (!cc) return;
        const k = b.dataset.rccZoom;
        if (k !== "menu") closeZoomMenu(false);
        if (k === "out") safe(() => cc.zoomOut());
        else if (k === "in") safe(() => cc.zoomIn());
        else toggleZoomMenu(rec, b);
        paintZoom(rec);
      });
    }
    if (z.parentElement !== g.area) g.area.append(z);
    setAttr(rec.shell, ATTR.zoomed, true);
    paintZoom(rec);
  }
  function paintZoom(rec) {
    const z = rec.zoom;
    const c = rec.controls;
    if (!z || !c) return;
    const pct = zoomPct(c);
    if (pct == null) return;
    const lvl = z.querySelector(".rcc-zoom-level");
    const txt = `${pct}%`;
    if (lvl.textContent !== txt) {
      lvl.textContent = txt;
      lvl.setAttribute("aria-label", `Zoom ${pct}%, zoom options`);
    }
    const [out, , inn] = z.children;
    if (out.disabled !== pct <= ZOOM_MIN) out.disabled = pct <= ZOOM_MIN;
    if (inn.disabled !== pct >= ZOOM_MAX) inn.disabled = pct >= ZOOM_MAX;
  }

  // The native zoom menu's items, on the same controls.
  const zm = { node: null, rec: null, anchor: null, items: [], active: 0, prevFocus: null };
  function toggleZoomMenu(rec, anchor) {
    if (zm.node && zm.rec === rec) return closeZoomMenu(true);
    closeZoomMenu(false);
    const c = rec.controls;
    const snap = typeof c.isSnapEnabled === "function" ? !!safe(() => c.isSnapEnabled()) : null;
    const rows = [
      { label: "Zoom in", kbd: `${MOD}+`, run: () => c.zoomIn() },
      { label: "Zoom out", kbd: `${MOD}−`, run: () => c.zoomOut() },
      { label: "Zoom to fit", kbd: `${SHIFT}1`, run: () => c.zoomToFit && c.zoomToFit() },
      { label: "Zoom to selection", kbd: `${SHIFT}2`, run: () => c.zoomToSelection && c.zoomToSelection() },
      null,
      { label: "Zoom to 50%", run: () => c.zoomTo(0.5) },
      { label: "Zoom to 100%", kbd: `${MOD}0`, run: () => c.zoomTo(1) },
      { label: "Zoom to 200%", run: () => c.zoomTo(2) },
    ];
    if (snap !== null && typeof c.toggleSnap === "function") rows.push(null, { label: "Snap to guides", check: snap, run: () => c.toggleSnap() });
    const box = el("div", "rcc-menu");
    box.dataset.testid = "rcc-zoom-menu";
    box.setAttribute("role", "menu");
    box.setAttribute("aria-label", "Zoom");
    box.tabIndex = -1;
    zm.items = [];
    for (const r of rows) {
      if (!r) {
        box.append(el("div", "rcc-menu-sep"));
        continue;
      }
      const it = el("div", "rcc-menu-item");
      it.setAttribute("role", r.check == null ? "menuitem" : "menuitemcheckbox");
      if (r.check != null) it.setAttribute("aria-checked", String(r.check));
      it.tabIndex = -1;
      it.append(el("span", "rcc-menu-label", r.label));
      if (r.kbd) it.append(el("span", "rcc-menu-kbd", r.kbd));
      if (r.check) it.append(iconEl(ICON.check, "rcc-ico rcc-menu-check"));
      const i = zm.items.length;
      it.addEventListener("pointermove", () => paintZoomMenu(i));
      it.addEventListener("click", (e) => {
        e.stopPropagation();
        safe(r.run);
        closeZoomMenu(true);
        paintZoom(rec);
      });
      zm.items.push(it);
      box.append(it);
    }
    for (const t of ["pointerdown", "mousedown", "wheel", "contextmenu"]) box.addEventListener(t, (e) => e.stopPropagation());
    box.addEventListener("keydown", onZoomMenuKey);
    Object.assign(zm, { node: box, rec, anchor, active: -1, prevFocus: document.activeElement });
    document.body.append(box);
    anchor.setAttribute("aria-expanded", "true");
    const a = rec.zoom.getBoundingClientRect();
    const w = box.offsetWidth;
    box.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, a.right - w)))}px`;
    box.style.top = `${Math.round(Math.max(8, a.top - box.offsetHeight - 8))}px`;
    box.focus({ preventScroll: true });
    window.addEventListener("blur", onZoomMenuBlur);
    window.addEventListener("resize", onZoomMenuBlur);
  }
  function paintZoomMenu(i) {
    zm.active = i;
    zm.items.forEach((n, j) => n.classList.toggle("rcc-menu-item-on", j === i));
    if (zm.items[i]) zm.items[i].focus({ preventScroll: true });
  }
  function onZoomMenuKey(e) {
    const n = zm.items.length;
    if (e.key === "ArrowDown") paintZoomMenu((zm.active + 1) % n);
    else if (e.key === "ArrowUp") paintZoomMenu(zm.active < 0 ? n - 1 : (zm.active - 1 + n) % n);
    else if (e.key === "Home") paintZoomMenu(0);
    else if (e.key === "End") paintZoomMenu(n - 1);
    else if (e.key === "Enter" || e.key === " ") {
      if (zm.items[zm.active]) zm.items[zm.active].click();
    } else if (e.key === "Tab") {
      closeZoomMenu(true); // focus back on the level: Tab moves on from there
      return;
    } else if (e.key === "Escape") closeZoomMenu(true);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
  function onZoomMenuBlur() {
    closeZoomMenu(false);
  }
  function closeZoomMenu(restore) {
    if (!zm.node) return;
    zm.node.remove();
    if (zm.anchor) zm.anchor.setAttribute("aria-expanded", "false");
    window.removeEventListener("blur", onZoomMenuBlur);
    window.removeEventListener("resize", onZoomMenuBlur);
    if (restore && zm.anchor && zm.anchor.isConnected) zm.anchor.focus({ preventScroll: true });
    Object.assign(zm, { node: null, rec: null, anchor: null, items: [], active: 0, prevFocus: null });
  }

  // ---------------------------------------------------- composer (6), agents
  // Text only: the input and send; the agents slot in its pill beside it.
  // Enter in the composer always deploys a new agent task
  // (canvas-comment-agent's createTask), once its launch has flown to the
  // new avatar's place; Cmd/Ctrl+Enter sends to the chat
  // through the app's own chat input and send button (a normal message with
  // the context the app attaches to a canvas chat). The chat view's own
  // footer (its input and pickers) stays mounted but is not drawn: the
  // composer is the input. The agents slot is comment-bubbles'
  // [data-rtcb-host]: one node per shell, never recreated (its children
  // belong to that mod).
  const CHAT_INPUT = '[data-testid="chat-input-textarea"]';
  const CHAT_SEND = '[data-testid="chat-input-send-button"]';
  const nativeIn = (shell, sel) => shell.querySelector(`${CHAT_TAB} ${sel}`);
  const norm = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const setText = (n, t) => {
    if (n.textContent !== t) n.textContent = t;
  };
  const reducedMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  function waitFor(fn, ms) {
    return new Promise((resolve) => {
      const end = performance.now() + ms;
      const step = () => {
        const v = safe(fn);
        if (v || performance.now() > end || disposed) return resolve(v || null);
        requestAnimationFrame(step);
      };
      step();
    });
  }
  const iconButton = (cls, label, markup, testid) => {
    const b = el("button", cls);
    b.type = "button";
    b.setAttribute("aria-label", label);
    if (testid) b.dataset.testid = testid;
    b.append(iconEl(markup));
    return b;
  };

  function buildComposer(rec) {
    const wrap = el("div", "rcc-composer-wrap");
    wrap.dataset.testid = "rcc-composer-wrap";
    // one row (card closed): [input] [send]; docked under the open card: the
    // input, then [send] on the right
    const form = el("form", "rcc-composer");
    form.dataset.testid = "rcc-composer";
    form.dataset.state = "idle";
    form.noValidate = true;
    // the surface: a top cap, a middle and a bottom cap, so a FLIP changes
    // its height with transforms only and its corners never stretch
    // (empty, so no aria-hidden: voice-input takes an aria-hidden layer
    // beside the field for a copy of its text and hides it while dictating)
    const surface = el("div", "rcc-composer-surface");
    const cap = el("div", "rcc-cs-top");
    const mid = el("div", "rcc-cs-mid");
    const base = el("div", "rcc-cs-bot");
    surface.append(cap, mid, base);
    const ta = el("textarea", "rcc-composer-input");
    ta.rows = 1;
    ta.placeholder = "Design anything…";
    ta.dataset.testid = "rcc-composer-input";
    ta.setAttribute("aria-label", `Describe a task: Enter starts a new agent, ${MOD}Enter sends to the chat`);
    // comment-bubbles: this field answers the agent whose popover (or card
    // thread) is open over the slot next to it (syncReply)
    ta.setAttribute("data-rtcb-composer-field", "");
    const tools = el("div", "rcc-composer-tools");
    // dictation: voice-input's attach() on this field with this button as
    // its toggle (attachVoice); a 32px circle like send, at the inset, left
    // of it. Without voice-input it stays hidden.
    const mic = el("button", "rcc-composer-mic");
    mic.type = "button";
    mic.dataset.testid = "rcc-composer-mic";
    mic.setAttribute("aria-label", "Dictation");
    mic.hidden = true;
    mic.append(iconEl(ICON.mic, "rcc-ico rcc-mic-idle"), iconEl(ICON.micStop, "rcc-ico rcc-mic-stop"), iconEl(ICON.micBusy, "rcc-ico rcc-mic-busy"));
    const send = el("button", "rcc-composer-send");
    send.type = "submit";
    send.dataset.testid = "rcc-composer-send";
    send.setAttribute("aria-label", "Start an agent");
    send.disabled = true;
    send.append(iconEl(ICON.send));
    // the agent the composer answers while the card shows its thread
    // (syncReply): its mini avatar and number, left of send
    const target = el("span", "rcc-composer-target");
    target.dataset.testid = "rcc-composer-target";
    target.hidden = true;
    const targetAv = el("span", "rcc-ct-av");
    const targetLabel = el("span", "rcc-ct-label");
    target.append(targetAv, targetLabel);
    tools.append(target, mic, send);
    // the agents slot, out of the composer: a pill of its own on its right
    // (8px), on its base line, the composer's surface; comment-bubbles'
    // segment mounts in [data-rtcb-host] (its manage button, then the
    // avatars), always there with that mod (no agent: the button alone, a
    // 40px circle). It grows to the right (data-rcc-grow), its surface
    // following (growPill). Its room: --rcc-agents-max / data-rcc-max-w
    // (syncAgentsRoom)
    const pill = el("div", "rcc-agents-pill");
    pill.dataset.testid = "rcc-agents-pill";
    // its surface: a left cap, a middle and a right cap (as the composer's),
    // so a new width is reached with transforms only, the corners intact
    const ps = el("div", "rcc-ap-surface");
    ps.setAttribute("aria-hidden", "true");
    const psL = el("div", "rcc-ap-l");
    const psM = el("div", "rcc-ap-m");
    const psR = el("div", "rcc-ap-r");
    ps.append(psL, psM, psR);
    const agents = el("div", "rcc-agents");
    agents.dataset.testid = "rcc-agents";
    agents.setAttribute("data-rtcb-host", "");
    agents.setAttribute("data-rcc-grow", "right");
    pill.append(ps, agents);
    stopCanvas(pill);
    // why a message did not go: a chip over the composer, no layout change
    const note = el("span", "rcc-composer-note");
    note.dataset.testid = "rcc-composer-note";
    note.setAttribute("role", "status");
    note.hidden = true;
    form.append(surface, ta, tools, note);
    stopCanvas(form);
    // a press on the surface (its padding, the gaps) focuses the input
    form.addEventListener("pointerdown", (e) => {
      const t = e.target;
      if (e.button !== 0 || !(t instanceof Element) || (t !== form && !surface.contains(t))) return;
      e.preventDefault();
      ta.focus({ preventScroll: true });
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      sendFromComposer(rec, "task");
    });
    ta.addEventListener("keydown", (e) => {
      e.stopPropagation(); // typing never reaches the app's bubble-phase key handlers
      if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.isComposing) {
        e.preventDefault();
        sendFromComposer(rec, e.metaKey || e.ctrlKey ? "chat" : "task");
      } else if (e.key === "Escape") {
        // answering an agent: back to its list (the composer turns back)
        const B = rec.replyTo ? window.__RE_TEMPO_COMMENT_BUBBLES__ : null;
        if (B && typeof B.close === "function") {
          e.preventDefault();
          safe(() => B.close());
        } else ta.blur();
      }
    });
    ta.addEventListener("input", () => {
      autosize(ta);
      paintSend(rec);
    });
    wrap.append(form, pill);
    const c = { wrap, form, surface, cap, mid, base, ta, tools, agents, pill, ps: { l: psL, m: psM, r: psR }, pillW: null, pillFlips: [], send, mic, voice: null, target, targetAv, targetLabel, note, flips: [], launches: 0, drafts: new Map() };
    if (typeof ResizeObserver === "function") (c.pillRO = new ResizeObserver(() => safe(growPill, c))).observe(pill);
    // an agent's popover over the slot (comment-bubbles marks the slot as
    // it marks the card's list): the composer answers it
    if (typeof MutationObserver === "function") {
      c.slotMO = new MutationObserver(() => safe(syncReply, rec));
      c.slotMO.observe(agents, { attributes: true, attributeFilter: ["data-rtcb-thread", "data-rtcb-thread-n", "data-rtcb-thread-ask"] });
    }
    return c;
  }
  // voice-input's dictation on the composer: its mic is ours (attach with
  // button = our element: voice-input wires the click, the Escape / Enter
  // keys and the state attributes, data-rtv-state, that our CSS draws);
  // the live words are written into the field (input events: autosize,
  // send). Enter while dictating ends it, waits for the last words and sends
  // through the field's Enter: a new agent, or the reply in reply mode.
  // Attached again when voice-input is re-injected; none: no mic.
  function attachVoice(rec) {
    const c = rec.comp;
    const V = window.__RE_TEMPO_VOICE__;
    if (!c || !c.ta.isConnected) return;
    if (c.voice && c.voiceApi === V) return;
    c.voice = null;
    c.voiceApi = V;
    if (V && typeof V.attach === "function")
      try {
        c.voice = V.attach(c.ta, { button: c.mic, placement: "after" });
      } catch (err) {
        noteError("voice attach", err, rec.shell);
      }
    const show = !!c.voice;
    if (c.mic.hidden === show) c.mic.hidden = !show;
  }
  // The agents pill took a new width (an avatar came or went, "+N"): its
  // surface goes there from where it is drawn (FLIP: the right cap
  // translates, the middle scales from the left; 360ms, out growing, in-out
  // shrinking: in step with comment-bubbles' avatars sliding to their
  // places, so none of them pokes out of its end). Not while hidden,
  // resized or with reduced motion (at once).
  function growPill(c) {
    const w = c.pill.offsetWidth;
    const was = c.pillW;
    c.pillW = w;
    if (was == null || Math.abs(was - w) < 0.5) return;
    const R = c.ps.r;
    const M = c.ps.m;
    const running = c.pillFlips.length > 0;
    // drawn now: the right cap's edge (a growth over a running one starts there)
    const from = running ? R.getBoundingClientRect().right - c.pill.getBoundingClientRect().left : was;
    for (const a of c.pillFlips) a.cancel();
    c.pillFlips = [];
    M.style.right = M.style.width = "";
    const live = c.pill.isConnected && c.pill.getClientRects().length > 0 && getComputedStyle(c.pill).visibility !== "hidden" && typeof R.animate === "function";
    if (!live || reducedMotion() || resizing() || document.hidden || Math.abs(from - w) < 0.5) return;
    const cap = parseFloat(getComputedStyle(c.pill).borderTopLeftRadius) || 20;
    const grow = w > from;
    const opts = { duration: DUR.medium, easing: grow ? EASE_OUT : EASE_IN_OUT };
    // the middle, as wide as the wider of the two for the slide, scaled
    const mw = Math.max(from, w) - 2 * cap;
    if (mw > 0) {
      M.style.right = "auto";
      M.style.width = `${mw}px`;
      c.pillFlips.push(M.animate([{ transform: `scaleX(${Math.max(0, from - 2 * cap) / mw})` }, { transform: `scaleX(${Math.max(0, w - 2 * cap) / mw})` }], { ...opts, fill: "forwards" }));
    }
    c.pillFlips.push(R.animate([{ transform: `translateX(${(from - w).toFixed(1)}px)` }, { transform: "none" }], opts));
    const done = () => {
      if (!c.pillFlips.length || c.pillFlips.some((a) => a.playState === "running")) return;
      for (const a of c.pillFlips) a.cancel();
      c.pillFlips = [];
      M.style.right = M.style.width = "";
    };
    for (const a of c.pillFlips) a.finished.then(done, () => {});
  }

  // one line at rest; grows with the text up to 6 lines (or the room the
  // geometry leaves it: --rcc-ta-max), then scrolls
  function autosize(ta) {
    ta.style.height = "";
    const max = parseFloat(getComputedStyle(ta).maxHeight) || TA_MAX;
    const h = Math.min(ta.scrollHeight, max);
    if (h > ta.offsetHeight + 0.5) ta.style.height = `${Math.ceil(h)}px`;
    const scroll = ta.scrollHeight > max + 0.5;
    if (ta.style.overflowY !== (scroll ? "auto" : "hidden")) ta.style.overflowY = scroll ? "auto" : "hidden";
    setAttr(ta, "data-rcc-scroll", scroll); // its edges fade (canvas-chrome.css)
    // typing at the end: the last line clears the bottom fade (its padding)
    if (scroll && ta.selectionEnd === ta.value.length) ta.scrollTop = ta.scrollHeight;
  }
  function paintSend(rec) {
    const c = rec.comp;
    if (!c) return;
    const off = !c.ta.value.trim() || rec.sending;
    if (c.send.disabled !== off) c.send.disabled = off;
  }
  function setCompState(rec, st, why) {
    const c = rec.comp;
    if (!c) return;
    c.form.dataset.state = st;
    if (why) c.form.title = why;
    else c.form.removeAttribute("title");
    const say = st === "error" && why ? why : "";
    setText(c.note, say);
    if (c.note.hidden !== !say) c.note.hidden = !say;
  }

  // The active chat's title: the chat view's own props (chats + the active
  // id), read up from its input (the view on the Agent tab first).
  function chatTitle(rec) {
    const shell = rec.shell;
    const hc = rec.hostedChat && rec.hostedChat.isConnected ? rec.hostedChat : null;
    const start = (hc && (hc.querySelector(CHAT_INPUT) || hc.firstElementChild)) || nativeIn(shell, CHAT_INPUT) || (shell.querySelector(CHAT_TAB) || {}).firstElementChild;
    const p = start ? propsUp(start, (q) => Array.isArray(q.chats) && ("controlledActiveChatId" in q || "activeChatId" in q), 80) : null;
    if (!p) return "";
    const id = p.controlledActiveChatId || p.activeChatId;
    const c = p.chats.find((x) => x && (x.id === id || x._id === id));
    const t = c && (c.title || c.name || c.label);
    return t ? norm(t) : "";
  }

  function syncComposer(rec, g) {
    if (!rec.comp) rec.comp = buildComposer(rec);
    const c = rec.comp;
    if (c.wrap.parentElement !== g.area) g.area.append(c.wrap);
    c.form.hidden = false;
    observe(rec, c.wrap); // its height (the text grows) moves the card and the bars
    attachVoice(rec);
    syncReply(rec);
    paintSend(rec);
  }

  // The composer as the reply field of the agent whose thread the card
  // shows, or whose popover is open over the agents slot (comment-bubbles
  // marks the list's host, or the slot, the same way: data-rtcb-thread, -n,
  // -ask, --rtcb-thread-color): one text box for everything. "Reply to
  // #20…" ("Answer #20…" while it waits for one), the agent's mini avatar
  // and number left of send; Enter sends the reply through comment-bubbles'
  // reply(id, text) (the thread's own path), Cmd/Ctrl+Enter still the chat,
  // Escape closes the thread or the popover. The card closed (a card
  // thread), another tab, the thread or popover left: the composer is
  // itself again. Each agent and the new task keep their own draft. The
  // mark comes and goes with a 220ms fade (opacity, transform).
  function syncReply(rec) {
    const c = rec.comp;
    if (!c) return;
    const h = rec.hub;
    const card = !!h && !!h.getAttribute("data-rtcb-thread") && !!agentHost(rec) && !!rec.agent && !rec.agent.panel.hidden;
    const m = card ? h : c.agents.getAttribute("data-rtcb-thread") ? c.agents : null;
    const id = m ? m.getAttribute("data-rtcb-thread") : null;
    const on = !!id;
    const n = on ? m.getAttribute("data-rtcb-thread-n") || "" : "";
    const ask = on && m.getAttribute("data-rtcb-thread-ask") === "true";
    const sig = on ? `${id} ${n} ${ask}` : "";
    if ((rec.replySig || "") === sig) return;
    const was = !!rec.replyTo;
    const fromKey = rec.replyTo ? rec.replyTo.id : "";
    rec.replySig = sig;
    rec.replyTo = on ? { id, n } : null;
    if (fromKey !== (id || "")) {
      c.drafts.set(fromKey, c.ta.value);
      const next = c.drafts.get(id || "") || "";
      if (c.ta.value !== next) {
        c.ta.value = next;
        autosize(c.ta);
        paintSend(rec);
      }
    }
    const tag = n ? `#${n}` : "the agent";
    c.ta.placeholder = on ? `${ask ? "Answer" : "Reply to"} ${tag}…` : "Design anything…";
    c.ta.setAttribute("aria-label", on ? `Reply to agent ${tag}: Enter sends, Escape ${card ? "goes back to the agents" : "closes it"}` : `Describe a task: Enter starts a new agent, ${MOD}Enter sends to the chat`);
    c.send.setAttribute("aria-label", on ? `Reply to agent ${tag}` : "Start an agent");
    setAttr(c.form, "data-rcc-reply", on);
    if (on) {
      setText(c.targetAv, n);
      c.targetAv.dataset.len = String(n.length);
      const col = m.style.getPropertyValue("--rtcb-thread-color");
      if (col) c.target.style.setProperty("--rcc-ct-color", col);
      else c.target.style.removeProperty("--rcc-ct-color");
      setText(c.targetLabel, ask ? "Answering" : "Replying");
      c.target.title = `Replying to agent ${tag}`;
    }
    const live = !reducedMotion() && shown(c.form) && typeof c.target.animate === "function";
    if (on && !was) {
      c.target.hidden = false;
      if (live) c.target.animate([{ opacity: 0, transform: "translateX(-4px) scale(0.92)" }, { opacity: 1, transform: "none" }], { duration: DUR.small, easing: EASE_OUT });
      if (live) c.ta.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: DUR.small, easing: EASE_OUT });
    } else if (!on && was) {
      if (live) {
        const a = c.target.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(-4px) scale(0.92)" }], { duration: DUR.micro, easing: EASE_IN_OUT });
        const hide = () => !rec.replyTo && (c.target.hidden = true);
        a.finished.then(hide, hide);
        c.ta.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: DUR.small, easing: EASE_OUT });
      } else c.target.hidden = true;
    }
  }

  // The card's width, the composer's widest (6): measured while the card is
  // open, else the native panel's stored width plus the card's border.
  let cardWLast = 0;
  function cardWidth() {
    const n = parseFloat(ls.get(PANEL_W_KEY));
    return n > 0 ? n + CARD_CHROME : cardWLast || CARD_W;
  }
  // Mode ("row" | "docked"), left, width and bottom of the composer, in its
  // container (the viewport area; the shell in a compact view). A mode
  // change is a FLIP; anything else (a resize) is applied as it is.
  function placeComposer(rec, mode, x, w, b, taMax) {
    const c = rec.comp;
    const sh = rec.shell;
    const apply = () => {
      setAttr(c.wrap, "data-rcc-mode", mode);
      setVar(sh, "--rcc-comp-x", x);
      setVar(sh, "--rcc-comp-w", w);
      setVar(sh, "--rcc-comp-b", b);
      setVar(c.wrap, "--rcc-ta-max", Math.round(taMax));
      // the input's height follows a new mode, width or cap; not while
      // resizing (its max-height caps it meanwhile, a layout read each frame)
      const sig = `${mode} ${Math.round(w)} ${Math.round(taMax)}`;
      if (c.sized !== sig && !resizing()) {
        c.sized = sig;
        autosize(c.ta);
      }
    };
    const was = c.wrap.getAttribute("data-rcc-mode");
    if (was && was !== mode) flipComposer(c, apply);
    else apply();
    return !!was && was !== mode;
  }
  // The room the agents pill gives comment-bubbles (it decides how many
  // avatars fit): from 8px right of the composer to 12px short of the zoom
  // (or of the view's edge), 320px at most, less the pill's padding and
  // border. From the layout's geometry, never from what is drawn (the
  // slot's content would feed back into it): the same state and window
  // always give the same room. A view too narrow for it beside the
  // composer (under PILL_MIN) stacks it 8px above, as wide as the view
  // allows ([data-rcc-pill="above"]; true is returned: a docked composer's
  // card then ends above the pill). On the slot itself: --rcc-agents-max
  // (its max-width) and data-rcc-max-w (px).
  function syncAgentsRoom(c, compLeft, compRight, limit, canStack) {
    let pillW = Math.min(PILL_MAX, limit - (compRight + PILL_GAP));
    const above = !!canStack && pillW < PILL_MIN;
    if (above) pillW = Math.min(PILL_MAX, limit - compLeft);
    setAttr(c.wrap, "data-rcc-pill", above ? "above" : null);
    const room = Math.max(0, Math.floor(pillW - 2 * PILL_PAD - INSET)); // INSET: the end cap's room after the last avatar
    if (c.agents.getAttribute("data-rcc-max-w") !== String(room)) {
      c.agents.setAttribute("data-rcc-max-w", String(room));
      c.agents.style.setProperty("--rcc-agents-max", `${room}px`);
    }
    return above;
  }

  // FLIP (6): from where the parts are drawn to their new place, transforms
  // only. The input and the tools translate; the surface translates (and
  // scales across, when its width changes), its top cap translates and its
  // middle scales from the bottom, so the corners keep their radius. A FLIP
  // over a running one starts from what is drawn (it reverses smoothly).
  function drawnBox(c) {
    const r = (n) => n.getBoundingClientRect();
    const s = r(c.surface);
    return { ta: r(c.ta), tools: r(c.tools), top: r(c.cap).top, bottom: r(c.base).bottom, left: s.left, right: s.right };
  }
  function stopFlip(c) {
    if (c.midReset) c.midReset();
    for (const a of c.flips) a.cancel();
    c.flips = [];
  }
  function flipComposer(c, apply) {
    const live = c.wrap.isConnected && shown(c.form) && typeof c.form.animate === "function";
    if (!live) {
      stopFlip(c);
      return apply();
    }
    if (reducedMotion()) {
      // reduced motion: a 120ms fade, only when the composer changed shape
      const was = `${c.wrap.getAttribute("data-rcc-mode")} ${c.form.offsetWidth} ${c.form.offsetHeight}`;
      stopFlip(c);
      apply();
      if (`${c.wrap.getAttribute("data-rcc-mode")} ${c.form.offsetWidth} ${c.form.offsetHeight}` !== was) c.flips.push(c.form.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 120, easing: "linear" }));
      return;
    }
    const a = drawnBox(c);
    stopFlip(c);
    apply();
    const b = drawnBox(c);
    const opts = { duration: DUR.medium, easing: EASE_OUT };
    const go = (n, from) => c.flips.push(n.animate([{ transform: from }, { transform: "none" }], opts));
    const move = (n, f, t) => {
      const dx = f.left - t.left;
      const dy = f.top - t.top;
      if (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5) go(n, `translate(${dx}px, ${dy}px)`);
    };
    move(c.ta, a.ta, b.ta);
    move(c.tools, a.tools, b.tools);
    const ha = a.bottom - a.top;
    const hb = b.bottom - b.top;
    const wa = a.right - a.left;
    const wb = b.right - b.left;
    const dx = a.left - b.left;
    const dy = a.bottom - b.bottom;
    const sx = wb > 1 ? wa / wb : 1;
    if (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5 || Math.abs(sx - 1) > 0.002) go(c.surface, `translate(${dx}px, ${dy}px) scaleX(${sx})`);
    if (Math.abs(hb - ha) >= 0.5) {
      const d = hb - ha;
      const midB = c.mid.offsetHeight;
      go(c.cap, `translateY(${d}px)`);
      if (d > 0) {
        if (midB > 0) go(c.mid, `scaleY(${Math.max(0.01, (midB - d) / midB)})`);
      } else {
        // shrinking (to one round row its middle is 0 high): the middle is
        // drawn as tall as it was, from its final bottom, and scales down
        // to its final height; its box comes back when the slide ends
        const full = midB - d;
        c.mid.style.top = "auto";
        c.mid.style.height = `${full}px`;
        const an = c.mid.animate([{ transform: "none" }, { transform: `scaleY(${midB / full})` }], { ...opts, fill: "forwards" });
        c.midReset = () => {
          c.midReset = null;
          c.mid.style.top = "";
          c.mid.style.height = "";
          an.cancel();
        };
        an.finished.then(() => c.midReset && c.midReset(), () => {});
        c.flips.push(an);
      }
    }
  }

  // a matching node that is on screen (not in an invisible tab body)
  function visibleIn(root, sel) {
    for (const n of root.querySelectorAll(sel)) if (shown(n) && getComputedStyle(n).visibility !== "hidden") return n;
    return null;
  }
  // The workspace's chat, from the app's workspaces store (canvas-quick reads
  // it): the active chat tab's id and title, and the store's actions.
  function wsStore(shell) {
    const Q = window.__RE_TEMPO_CANVAS_QUICK__;
    const fn = Q && Q.switcher && typeof Q.switcher.wsState === "function" ? Q.switcher.wsState : null;
    const st = fn ? safe(fn, shell) || safe(fn) : null;
    return st && Array.isArray(st.workspaces) ? st : null;
  }
  function storeChat(shell) {
    const st = wsStore(shell);
    const ws = st && st.workspaces.find((w) => w && w.id === st.selectedWorkspaceId);
    const tabs = (ws && Array.isArray(ws.centerTabs) ? ws.centerTabs : []).filter((t) => t && t.type === "chat" && t.isArchived !== true);
    const tab = (ws && tabs.find((t) => t.id === ws.activeChatTabId)) || tabs[tabs.length - 1] || null;
    return { st, ws, id: tab ? tab.id : null, title: tab ? norm(tab.title || tab.name || tab.label || "") : "" };
  }

  // The chat view to reach (Cmd/Ctrl+Enter): the one on the Agent tab, else
  // this canvas's own (the Design route mounts it first: its right panel
  // opens, hidden), else the workspace's hidden one. Never a tab switch nor
  // a new chat tab: nothing takes the user out of the canvas.
  async function ensureChat(rec) {
    const sh = rec.shell;
    if (!sh.closest(PANE_SCOPE) && !sh.querySelector(CHAT_TAB)) {
      const g = eligible(sh, true) || compactInfo(sh);
      if (g && g.api && typeof g.api.toggleRightPanel === "function" && !sh.querySelector(RIGHT)) {
        rec.autoRight = true;
        rec.rightTry = performance.now();
        ls.set(AUTO_RIGHT_KEY, "1");
        g.api.toggleRightPanel();
      }
      await waitFor(() => sh.querySelector(CHAT_TAB), 3000);
    }
    if (rec.hostedChat && rec.hostedChat.isConnected) return rec.hostedChat;
    return sh.querySelector(CHAT_TAB) || safe(() => dockChat(rec).node) || null;
  }

  // Enter: a new agent task through canvas-comment-agent's pipeline
  // (createTask: the same flow as a canvas comment, anchored to the
  // selection or, without one, to the whole canvas); never the chat behind
  // the user's back: without that mod the composer says so and keeps the
  // text. Cmd/Ctrl+Enter: the chat.
  const commentAgent = () => {
    const A = window.__RE_TEMPO_COMMENT_AGENT__;
    return A && typeof A.createTask === "function" ? A : null;
  };
  // what the task is about, read on Enter (the flight must not change it)
  function taskPayload(rec, text) {
    const g = eligible(rec.shell, true);
    const sel = selectionAnchor(rec.shell);
    const payload = { text, canvasName: (g && g.pageName) || nativeName(rec.shell) || undefined, anchor: sel ? sel.anchor : null, source: "composer" };
    if (sel && sel.storyboardName) payload.storyboardName = sel.storyboardName;
    return payload;
  }
  function createTaskNow(payload) {
    const A = commentAgent();
    if (!A) return null;
    try {
      return A.createTask(payload) || null;
    } catch (err) {
      console.warn("[canvas-chrome] createTask", err);
      return null;
    }
  }
  async function sendFromComposer(rec, via) {
    const c = rec.comp;
    if (!c) return;
    const text = c.ta.value.replace(/\s+$/, "");
    if (!text.trim()) return;
    if (via !== "chat") return rec.replyTo ? replyToAgent(rec, text) : launchTask(rec, text);
    if (rec.sending) return;
    rec.sending = true;
    setCompState(rec, "sending");
    paintSend(rec);
    let ok = false;
    try {
      ok = await deliver(rec, text);
    } catch (err) {
      console.warn("[canvas-chrome] send", err);
    }
    rec.sending = false;
    if (ok) {
      if (norm(c.ta.value) === norm(text))
        flipComposer(c, () => {
          c.ta.value = "";
          autosize(c.ta);
        });
      setCompState(rec, "idle");
      emit("rtd:canvas-chrome-send", { shell: rec.shell, text, via: "chat", task: null });
    } else failComposer(rec, c, "The chat for this canvas could not be reached");
    paintSend(rec);
    try {
      c.ta.focus({ preventScroll: true });
    } catch (_) {}
  }
  // Enter while the card shows an agent's thread: the reply goes to that
  // agent through comment-bubbles' reply(id, text) (the thread shows it as
  // sending, then sent), else the store's own reply(id, text). The input
  // empties at once; a reply that did not go comes back to it.
  async function replyToAgent(rec, text) {
    const c = rec.comp;
    const t = rec.replyTo;
    if (rec.sending || !t) return;
    const B = window.__RE_TEMPO_COMMENT_BUBBLES__;
    const A = window.__RE_TEMPO_COMMENT_AGENT__;
    const fn =
      B && typeof B.reply === "function"
        ? (id, x) => B.reply(id, x)
        : A && typeof A.reply === "function"
          ? (id, x) => Promise.resolve(A.reply(id, x)).then((r) => r !== false)
          : null;
    if (!fn) return failComposer(rec, c, "Replies to agents are not available here");
    rec.sending = true;
    setCompState(rec, "sending");
    paintSend(rec);
    flipComposer(c, () => {
      c.ta.value = "";
      autosize(c.ta);
    });
    let ok = false;
    try {
      ok = (await fn(t.id, text)) === true;
    } catch (err) {
      console.warn("[canvas-chrome] reply", err);
    }
    rec.sending = false;
    if (ok) {
      setCompState(rec, "idle");
      emit("rtd:canvas-chrome-send", { shell: rec.shell, text, via: "reply", task: t.id });
    } else {
      if (!c.ta.value) {
        c.ta.value = text;
        autosize(c.ta);
      }
      failComposer(rec, c, `The reply to #${t.n || "?"} did not go`);
    }
    paintSend(rec);
  }
  function failComposer(rec, c, why) {
    setCompState(rec, "error", why);
    clearTimeout(c.noteT);
    c.noteT = setTimeout(() => {
      if (rec.comp === c && c.form.dataset.state === "error") setCompState(rec, "idle");
    }, 4000);
  }

  // The launch (Enter): the text condenses into a glowing pill that flies to
  // the slot, where the new avatar appears (~500ms); the input empties at
  // once and send is pressed. On landing the task is created with what was
  // read on Enter and "rtcc:launch" goes out ({taskId, text, rect: the
  // input's DOMRect}): comment-bubbles brings the avatar in (then
  // "rtcb:avatar-in"), agent-cursors the cursor out of it. Nothing of theirs
  // is animated here. The task never waits on a stalled animation: it lands
  // at once when the window hides, after 3s at the latest.
  function launchTask(rec, text) {
    const c = rec.comp;
    if (!commentAgent()) return failComposer(rec, c, `Agents are not available here. ${MOD}↵ sends to the chat`);
    const payload = taskPayload(rec, text);
    const rect = c.ta.getBoundingClientRect();
    const flight = reducedMotion() ? null : safe(flyToSlot, c, text, rect);
    // emptied at once; a taller input settles back to one line (a FLIP)
    flipComposer(c, () => {
      c.ta.value = "";
      autosize(c.ta);
    });
    c.launches++;
    c.form.dataset.launch = "";
    if (flight) {
      // the placeholder waits for the text to be gone
      c.ghosts = (c.ghosts || 0) + 1;
      c.form.dataset.ghost = "";
      flight.condensed.then(() => {
        if (--c.ghosts <= 0) {
          c.ghosts = 0;
          delete c.form.dataset.ghost;
        }
      });
    }
    pressSend(c);
    paintSend(rec);
    if (c.form.dataset.state === "error") setCompState(rec, "idle");
    const settle = () => {
      if (--c.launches <= 0) {
        c.launches = 0;
        delete c.form.dataset.launch;
      }
    };
    const land = () => {
      const task = createTaskNow(payload);
      settle();
      if (!task) {
        if (flight) flight.drop();
        // the text comes back unless something new was typed meanwhile
        if (rec.comp === c && !c.ta.value.trim()) {
          c.ta.value = text;
          autosize(c.ta);
          paintSend(rec);
        }
        failComposer(rec, c, "The agent could not start");
        return;
      }
      if (flight) flight.absorb();
      emit("rtcc:launch", { taskId: task.id, text, rect });
      emit("rtd:canvas-chrome-send", { shell: rec.shell, text, via: "task", task });
    };
    if (flight) flight.landed.then(land);
    else land();
  }
  // send's press: a small scale, the arrow lifts off and comes back
  function pressSend(c) {
    if (reducedMotion() || typeof c.send.animate !== "function") return;
    c.send.animate([{ transform: "scale(1)", easing: EASE_OUT }, { transform: "scale(0.88)", offset: 0.3, easing: EASE_OUT }, { transform: "scale(1)" }], { duration: DUR.medium });
    const ico = c.send.firstElementChild;
    if (ico)
      ico.animate(
        [
          { transform: "none", opacity: 1, easing: EASE_IN_OUT },
          { transform: "translateY(-10px)", opacity: 0, offset: 0.38 },
          { transform: "translateY(8px)", opacity: 0, offset: 0.4, easing: EASE_OUT },
          { transform: "none", opacity: 1 },
        ],
        { duration: 460 }
      );
  }
  // an animation's end, or the window hiding (no frames: it would stall), or
  // `ms` (a promise that always resolves)
  function settled(anim, ms) {
    return new Promise((resolve) => {
      let t = 0;
      const go = () => {
        clearTimeout(t);
        document.removeEventListener("visibilitychange", vis);
        resolve();
      };
      const vis = () => document.visibilityState === "hidden" && go();
      t = setTimeout(go, ms);
      document.addEventListener("visibilitychange", vis);
      anim.finished.then(go, go);
      vis();
    });
  }
  // The flight, at body level (never clipped by the canvas): the text drawn
  // where the input drew it shrinks into its centre (blur, fade) as the pill
  // pops there, then the pill flies an arc to the slot, aligned with its
  // path and stretched by its speed, a soft trail behind. It lands where
  // comment-bubbles says the new avatar appears (its landing(): a 20px rect
  // in screen px), else at the slot's end next to send; read on Enter and
  // again half way, the rest of the way bending to a target that moved.
  // Promises: condensed (the text is gone), landed; absorb() blooms it into
  // the avatar, drop() fades it (no task).
  const flights = new Set();
  function flyToSlot(c, text, from) {
    if (typeof document.body.animate !== "function") return null;
    const layer = el("div", "rcc-launch");
    layer.setAttribute("aria-hidden", "true");
    const cs = getComputedStyle(c.ta);
    const ghost = el("div", "rcc-launch-text", text);
    Object.assign(ghost.style, {
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      padding: cs.padding,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      color: cs.color,
    });
    const trail = el("div", "rcc-launch-pill rcc-launch-trail");
    const pill = el("div", "rcc-launch-pill");
    // the pill and its trail, moved as one when the target moves
    const mover = el("div", "rcc-launch-mover");
    mover.append(trail, pill);
    layer.append(ghost, mover);
    document.body.append(layer);
    flights.add(layer);
    ghost.scrollTop = c.ta.scrollTop;
    // where the text condenses: the middle of what it covers
    const rg = document.createRange();
    rg.selectNodeContents(ghost);
    const tb = rg.getBoundingClientRect();
    const tl = Math.max(from.left, tb.left);
    const tt = Math.max(from.top, tb.top);
    const p0 = { x: (tl + Math.min(from.right, tb.right)) / 2, y: (tt + Math.min(from.bottom, tb.bottom)) / 2 };
    if (!(tb.width > 0)) Object.assign(p0, { x: from.left + 24, y: from.top + from.height / 2 });
    // where the avatar appears: comment-bubbles' landing() (a valid rect),
    // else the slot's end in the agents pill (it grows to the right; empty:
    // where its first avatar will be)
    const target = () => {
      const B = window.__RE_TEMPO_COMMENT_BUBBLES__;
      const r = B && typeof B.landing === "function" ? safe(() => B.landing()) : null;
      if (r && [r.left, r.top, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const ar = c.agents.getBoundingClientRect();
      return { x: ar.width > 1 ? ar.right - 12 : ar.left + 10, y: ar.top + ar.height / 2 };
    };
    const p1 = target();
    ghost.style.transformOrigin = `${p0.x - from.left}px ${p0.y - from.top}px`;
    const PW = 28;
    const PH = 12;
    const at = (x, y, rot, sx, sy) => `translate(${(x - PW / 2).toFixed(2)}px, ${(y - PH / 2).toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
    // the arc: a quadratic curve lifted over the straight line
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const ctl = { x: (p0.x + p1.x) / 2, y: Math.min(p0.y, p1.y) - Math.min(90, 28 + dist * 0.22) };
    const N = 18;
    const path = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const u = 1 - t;
      const x = u * u * p0.x + 2 * u * t * ctl.x + t * t * p1.x;
      const y = u * u * p0.y + 2 * u * t * ctl.y + t * t * p1.y;
      const tx = 2 * u * (ctl.x - p0.x) + 2 * t * (p1.x - ctl.x);
      const ty = 2 * u * (ctl.y - p0.y) + 2 * t * (p1.y - ctl.y);
      const s = Math.sin(Math.PI * t);
      path.push({ x, y, rot: (Math.atan2(ty, tx) * 180) / Math.PI, sx: 1 + 0.45 * s - 0.2 * t, sy: 1 - 0.18 * s - 0.1 * t });
    }
    // the pill keeps the first and last angle while still (no spin in place)
    const rot0 = path[0].rot;
    const rot1 = path[N].rot;
    const T_POP = 70;
    const T_FLY = 190;
    const FLY = 500;
    const kick = (n, frames, o) => n.animate(frames, { fill: "forwards", ...o });
    const condense = kick(ghost, [{ transform: "none", filter: "blur(0px)", opacity: 1 }, { transform: "scale(0.16)", filter: "blur(6px)", opacity: 0 }], { duration: 240, easing: EASE_IN_OUT });
    kick(
      pill,
      [
        { transform: at(p0.x, p0.y, rot0, 0.2, 0.2), opacity: 0 },
        { transform: at(p0.x, p0.y, rot0, 1.06, 1.06), opacity: 1, offset: 0.65 },
        { transform: at(p0.x, p0.y, rot0, 1, 1), opacity: 1 },
      ],
      { duration: T_FLY - T_POP, delay: T_POP, easing: EASE_OUT }
    );
    const frames = path.map((p) => ({ transform: at(p.x, p.y, p.rot, p.sx, p.sy) }));
    const fly = kick(pill, frames, { duration: FLY, delay: T_FLY, easing: EASE_IN_OUT });
    kick(
      trail,
      path.map((p, i) => ({ transform: at(p.x, p.y, p.rot, p.sx * 1.15, p.sy * 1.3), opacity: i === 0 || i === N ? 0 : 0.5 })),
      { duration: FLY, delay: T_FLY + 50, easing: EASE_IN_OUT }
    );
    const landed = settled(fly, 3000);
    const condensed = settled(condense, 3000);
    // half way: the target again; moved, the rest of the way bends to it
    setTimeout(() => {
      if (!layer.isConnected) return;
      const p = safe(target);
      if (!p || Math.hypot(p.x - p1.x, p.y - p1.y) < 1) return;
      kick(mover, [{ transform: "none" }, { transform: `translate(${(p.x - p1.x).toFixed(2)}px, ${(p.y - p1.y).toFixed(2)}px)` }], { duration: FLY / 2, easing: EASE_OUT });
    }, T_FLY + FLY / 2);
    const end = (ms) =>
      setTimeout(() => {
        layer.remove();
        flights.delete(layer);
      }, ms);
    const last = path[N];
    return {
      condensed,
      landed,
      absorb() {
        kick(pill, [{ transform: at(last.x, last.y, rot1, last.sx, last.sy), opacity: 1, filter: "blur(0px)" }, { transform: at(last.x, last.y, rot1, 1.7, 1.7), opacity: 0, filter: "blur(4px)" }], { duration: DUR.small, easing: EASE_OUT });
        kick(trail, [{ opacity: 0.5 }, { opacity: 0 }], { duration: DUR.micro, easing: "linear" });
        end(DUR.small + 40);
      },
      drop() {
        kick(layer, [{ opacity: 1 }, { opacity: 0 }], { duration: DUR.micro, easing: "linear" });
        end(DUR.micro + 40);
      },
    };
  }

  // Into the app's chat input (ProseMirror): a paste (its own parser), else
  // insertText; then its send button once the app enables it. An inactive
  // tab body is invisible (not focusable): it is made focusable, see-through
  // and click-through for the moment it takes.
  // The chat to send to: the one on the Agent tab (this canvas's own, or the
  // workspace's), else this canvas's own right panel (hidden), else the
  // workspace's hidden chat, else a chat on screen beside this canvas.
  async function findChatInput(rec) {
    const sh = rec.shell;
    const tp = await ensureChat(rec);
    if (tp) {
      const ed = await waitFor(() => tp.querySelector(CHAT_INPUT), 1500);
      if (ed) return ed;
    }
    if (sh.querySelector(CHAT_TAB)) return waitFor(() => nativeIn(sh, CHAT_INPUT), 1500);
    return visibleIn(document, CHAT_INPUT); // a chat on screen beside this canvas
  }
  async function deliver(rec, text) {
    const ed = await findChatInput(rec);
    if (!ed) return false;
    const tp = ed.closest(CHAT_TAB) || ed.closest(PANE_CHAT);
    const reveal = !!tp && getComputedStyle(tp).visibility === "hidden";
    // the app's own inline values (its hidden tab body: visibility hidden),
    // put back as they were afterwards, never just removed (the app does
    // not write them again: the body would stay shown behind the canvas)
    const REVEAL = ["visibility", "opacity", "pointer-events"];
    const was = reveal ? REVEAL.map((k) => [k, tp.style.getPropertyValue(k), tp.style.getPropertyPriority(k)]) : null;
    if (reveal) {
      tp.style.setProperty("visibility", "visible", "important");
      tp.style.setProperty("opacity", "0", "important");
      tp.style.setProperty("pointer-events", "none", "important");
    }
    try {
      ed.focus({ preventScroll: true });
      const selObj = window.getSelection();
      selObj.selectAllChildren(ed);
      let pasted = false;
      try {
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
        ed.dispatchEvent(ev);
        pasted = ev.defaultPrevented;
      } catch (_) {}
      // line breaks become paragraphs: compare without any whitespace
      const bare = (t) => String(t || "").replace(/\s+/g, "");
      if (!pasted || bare(ed.innerText || ed.textContent) !== bare(text)) {
        selObj.selectAllChildren(ed);
        document.execCommand("insertText", false, text);
      }
      // its send button: the nearest one up from the input
      const sendNear = () => {
        for (let a = ed.parentElement; a && a !== document.body; a = a.parentElement) {
          const b = a.querySelector(CHAT_SEND);
          if (b) return b;
        }
        return null;
      };
      const btn = await waitFor(() => {
        const b = sendNear();
        return b && !b.disabled && b.getAttribute("aria-disabled") !== "true" ? b : null;
      }, 1500);
      if (!btn) return false;
      btn.click();
      return true;
    } finally {
      if (was) for (const [k, v, pr] of was) v ? tp.style.setProperty(k, v, pr) : tp.style.removeProperty(k);
    }
  }

  // ---------------------------------------------------------- selection pill
  // pen.dev: with the right panel closed, the selection's name and the panel
  // toggle in one pill at the top right (under Share). Sources: the canvas's
  // own selection (its imperative handle, storyboard ids -> the storyboard's
  // header text) and the selected frame of canvas-browser, canvas-shader and
  // canvas-notes ([data-selected]). Several -> "N selected"; none -> only the
  // toggle. Polled every 500 ms while shown (a rename changes no structure).
  const handleRefs = new WeakMap();
  const isHandle = (v) => !!v && typeof v === "object" && typeof v.getView === "function" && typeof v.getSelection === "function";
  function canvasHandle(root) {
    const cached = handleRefs.get(root);
    if (cached && isHandle(cached.current)) return cached.current;
    let f = fiberOf(root);
    for (let d = 0; f && d < 400; d++, f = f.return) {
      for (const r of [f.ref, f.memoizedProps && f.memoizedProps.ref]) {
        if (r && typeof r === "object" && "current" in r && isHandle(r.current)) {
          handleRefs.set(root, r);
          return r.current;
        }
      }
    }
    return null;
  }
  // visible text of a node, buttons and inputs left out
  function ownText(n) {
    if (!n) return "";
    let out = "";
    const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) if (!(t.parentElement && t.parentElement.closest("button, input, textarea, [aria-hidden='true']"))) out += t.textContent;
    return norm(out);
  }
  function storyboardEl(root, id) {
    const q = `[data-storyboard-id="${CSS.escape(String(id))}"]`;
    let item = root.querySelector(q);
    if (!item) return null;
    for (let up = item.parentElement && item.parentElement.closest(q); up; up = up.parentElement && up.parentElement.closest(q)) item = up;
    return item;
  }
  function storyboardTitle(root, id) {
    const item = storyboardEl(root, id);
    return item ? ownText(item.querySelector("[data-storyboard-header]")) : "";
  }
  const FRAME_KINDS = [
    { sel: ".rtbf-frame[data-selected]", kind: "browser", title: ".rtbf-head-title", fallback: "Browser" },
    { sel: ".rtsh-frame[data-selected]", kind: "shader", title: ".rtsh-head-title", fallback: "Shader" },
  ];
  function selectionItems(shell) {
    const out = [];
    for (const k of FRAME_KINDS) for (const f of shell.querySelectorAll(k.sel)) out.push({ kind: k.kind, el: f, title: ownText(f.querySelector(k.title)) || k.fallback });
    for (const n of shell.querySelectorAll("[data-rtcn-layer] [data-selected], .rtcn-layer [data-selected]")) {
      const ta = n.querySelector(".rtcn-text");
      const first = ta && ta.value ? ta.value.trim().split("\n")[0].slice(0, 80) : "";
      out.push({ kind: "note", el: n, title: first || ownText(n.querySelector(".rtcn-kind-label")) || "Note" });
    }
    const root = shell.querySelector("[data-canvas-root]");
    const hd = root && canvasHandle(root);
    let ids = [];
    try {
      ids = hd ? hd.getSelection() || [] : [];
    } catch (_) {}
    for (const raw of ids) {
      const id = typeof raw === "object" && raw ? raw.id : raw;
      out.push({ kind: "frame", id: String(id), el: storyboardEl(root, id), title: storyboardTitle(root, id) || "Frame" });
    }
    return out;
  }
  // createTask's anchor: the selection's centre in canvas (world)
  // coordinates, the storyboard as nodeId; null without a selection.
  function worldPoint(root, cx, cy) {
    const wl = root && root.querySelector(".tds-canvas-shimmer-origin");
    const m = wl && /translate3d\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px[^)]*\)\s*scale\(\s*([\d.]+)\s*\)/.exec(wl.style.transform || "");
    if (!m) return null;
    const r = root.getBoundingClientRect();
    const z = +m[3] || 1;
    return { x: (cx - r.left - +m[1]) / z, y: (cy - r.top - +m[2]) / z };
  }
  function selectionAnchor(shell) {
    const items = selectionItems(shell);
    const it = items.find((x) => x.el) || null;
    if (!it) return null;
    const root = shell.querySelector("[data-canvas-root]");
    const item = it.el.closest("[data-canvas-item-id]");
    const num = (n, v) => {
      const x = parseFloat(getComputedStyle(n).getPropertyValue(v));
      return Number.isFinite(x) ? x : null;
    };
    let pt = null;
    if (item) {
      const x = num(item, "--canvas-item-x"), y = num(item, "--canvas-item-y"), w = num(item, "--canvas-item-width"), h = num(item, "--canvas-item-height");
      if ([x, y, w, h].every((v) => v != null)) pt = { x: x + w / 2, y: y + h / 2 };
    }
    if (!pt) {
      const r = it.el.getBoundingClientRect();
      pt = worldPoint(root, r.left + r.width / 2, r.top + r.height / 2);
    }
    if (!pt) return null;
    const anchor = { x: Math.round(pt.x), y: Math.round(pt.y) };
    if (it.kind === "frame") anchor.nodeId = (item && item.getAttribute("data-canvas-item-id")) || it.id;
    return { anchor, storyboardName: it.kind === "frame" ? it.title : null };
  }
  const KIND_ICON = { frame: "frame", browser: "globe", shader: "sparkles", note: "note", multi: "stack" };

  function buildSel(rec) {
    const pill = el("div", "rcc-sel");
    pill.dataset.testid = "rcc-selection-pill";
    pill.setAttribute("role", "group");
    pill.setAttribute("aria-label", "Selection");
    const ico = el("span", "rcc-ico rcc-sel-ico");
    const title = el("span", "rcc-sel-title");
    const tg = iconButton("rcc-sel-toggle", "Show the design properties", ICON.panelRight, "rcc-sel-toggle");
    tg.setAttribute("aria-pressed", "false");
    tg.setAttribute("aria-haspopup", "dialog");
    tg.dataset.rccTip = "Properties";
    tg.addEventListener("click", () => toggleDropdown(rec));
    pill.append(ico, title, tg);
    stopCanvas(pill);
    return { pill, ico, title, tg };
  }

  // pen.dev: the selection's name in a pill under Share; nothing selected,
  // no pill (and no properties). The pill's toggle opens the properties as a
  // dropdown under it.
  function syncSelPill(rec, g) {
    if (!rec.sel) rec.sel = buildSel(rec);
    const s = rec.sel;
    const items = selectionItems(rec.shell);
    const one = items.length === 1 ? items[0] : null;
    const kind = items.length > 1 ? "multi" : one ? one.kind : "";
    const text = items.length > 1 ? `${items.length} selected` : one ? one.title : "";
    rec.hasSel = !!text;
    const sig = `${kind}|${text}`;
    if (rec.selSig !== sig) {
      const changed = rec.selSig !== null && !!text;
      rec.selSig = sig;
      setAttr(s.pill, "data-empty", !text);
      setAttr(s.pill, "data-kind", kind || null);
      s.ico.dataset.kind = kind || "";
      s.ico.innerHTML = kind ? ICON[KIND_ICON[kind]] : "";
      setText(s.title, text);
      s.title.title = text;
      s.tg.hidden = !text;
      if (changed) {
        s.pill.removeAttribute("data-rcc-fade");
        void s.pill.offsetWidth; // restart the 150ms fade
        s.pill.setAttribute("data-rcc-fade", "");
      }
    }
    if (s.pill.parentElement !== g.layer) g.layer.append(s.pill);
    setAttr(rec.shell, ATTR.selpill, true);
  }

  // ------------------------------------------- properties: the card's body
  // The app's right panel is the selection card's body: right under the
  // pill (its top row), as wide, right-aligned, down to 8px over the
  // composer or the zoom. Closing only hides it (the panel stays mounted:
  // the Agent tab keeps its chat view); opening mounts it first if the app
  // had it collapsed. Open / closed lasts the session; Esc closes; no
  // selection, no card. A collapse from the app itself (Cmd+\) closes it too.
  const DD_KEY = "rtd.canvasChrome.props";
  const sess = {
    get(k) {
      try {
        return sessionStorage.getItem(k);
      } catch (_) {
        return null;
      }
    },
    set(k, v) {
      try {
        sessionStorage.setItem(k, v);
      } catch (_) {}
    },
  };
  let ddWanted = sess.get(DD_KEY) === "open";
  function setDd(open) {
    ddWanted = !!open;
    sess.set(DD_KEY, ddWanted ? "open" : "closed");
    syncAllSoon();
  }
  function toggleDropdown(rec) {
    if (ddWanted && rec.shell.getAttribute(ATTR.dd) === "open") return setDd(false);
    setDd(true);
    if (!rec.shell.querySelector(RIGHT)) {
      const g = eligible(rec.shell, true);
      if (g && g.api && typeof g.api.toggleRightPanel === "function") g.api.toggleRightPanel();
    }
  }
  function syncDropdown(rec) {
    const aside = !!rec.shell.querySelector(RIGHT);
    // the app collapsed it while it was open here: closed for us too
    if (rec.ddShown && !aside && ddWanted) setDd(false);
    const open = ddWanted && !!rec.hasSel && aside;
    rec.ddShown = open;
    setAttr(rec.shell, ATTR.dd, open ? "open" : "closed");
    if (open) showDesignTab(rec.shell.querySelector(RIGHT));
    if (rec.sel) {
      setAttr(rec.sel.tg, "aria-pressed", String(open));
      setAttr(rec.sel.tg, "aria-expanded", String(open));
    }
  }

  // A view too narrow for both cards side by side (the left card, the rail
  // and the properties card with their edges: BOTH_W) shows one at a time:
  // the one just opened stays and the other closes; both found open (a
  // resize narrowed the view) keep the left card (it holds the chat).
  function syncNarrow(rec, g, card) {
    const left = !!card.open;
    const dd = !!rec.ddShown;
    // the free strip: the area less the webpanel's card
    const narrow = g.area.getBoundingClientRect().width - (rec.rcwInset || 0) < BOTH_W;
    if (narrow && left && dd) {
      if (rec.leftWas && !rec.ddWas && g.api && typeof g.api.toggleLeftPanel === "function") g.api.toggleLeftPanel();
      else setDd(false);
    }
    rec.leftWas = left;
    rec.ddWas = dd;
  }

  // The card shows the properties only (its tab row is not drawn): the right
  // panel's own Design tab is clicked when another of its tabs is active.
  function showDesignTab(aside) {
    const body = aside && aside.querySelector(DESIGN_TAB);
    if (!body || body.getAttribute("aria-hidden") !== "true") return;
    const bodies = body.parentElement ? Array.from(body.parentElement.children).filter((n) => n.getAttribute("role") === "tabpanel") : [];
    const tabsEls = Array.from(aside.querySelectorAll('[role="tablist"] [role="tab"]'));
    const t = bodies.length && tabsEls.length === bodies.length ? tabsEls[bodies.indexOf(body)] : null;
    if (t && !tabActive(t)) t.click();
  }

  // ----------------------------------------------------------- top right pill
  // [registered top actions] [Share]: the app's Share button (it lives in the
  // "Canvas controls" toolbar, or in the panel header while the panel is
  // mounted) is drawn over the pill's slot (position: fixed, the CSS), so it
  // never moves with the panel and its share popover anchors there.
  const topActions = new Map(); // id -> def
  function buildTop() {
    const pill = el("div", "rcc-top");
    pill.dataset.testid = "rcc-top-pill";
    pill.setAttribute("role", "toolbar");
    pill.setAttribute("aria-label", "Canvas actions");
    const actions = el("div", "rcc-top-actions");
    const slot = el("div", "rcc-top-share");
    pill.append(actions, slot);
    stopCanvas(pill);
    actions.addEventListener("click", (e) => {
      const b = e.target instanceof Element ? e.target.closest(".rcc-top-btn") : null;
      if (b) runTopAction(b.dataset.rccTopAction, b.closest(SHELL));
    });
    return { pill, actions, slot };
  }
  // pressed is per canvas view: pressed(ctx) when the mod reports it, else
  // what onToggle returned for that view (or a plain flip)
  const topCtx = (rec, shell) => ({ ...(rec ? ctxFor(rec) : {}), view: shell || (rec && rec.shell) || null });
  function topPressed(t, rec) {
    if (typeof t.pressed === "function") return !!safe(t.pressed, topCtx(rec));
    const sh = rec && rec.shell;
    return sh && t.byView.has(sh) ? t.byView.get(sh) : !!t.state;
  }
  function runTopAction(id, shell) {
    const t = topActions.get(id);
    if (!t || !shell) return;
    const rec = recs.get(shell);
    const was = topPressed(t, rec);
    const r = safe(t.onToggle, { ...topCtx(rec, shell), pressed: was });
    if (typeof r === "boolean") t.byView.set(shell, r);
    else if (typeof t.pressed !== "function") t.byView.set(shell, !was);
    syncAllSoon();
  }
  function syncTop(rec, g) {
    if (!rec.top) rec.top = buildTop();
    const tp = rec.top;
    const share = rec.shell.querySelector('button[aria-label="Share canvas"]');
    for (const n of rec.shell.querySelectorAll(`[${ATTR.share}]`)) if (n !== share) n.removeAttribute(ATTR.share);
    if (share) setAttr(share, ATTR.share, true);
    const list = Array.from(topActions.values()).sort((a, b) => a.seq - b.seq);
    const sig = list.map((t) => `${t.id}:${t.seq}:${topPressed(t, rec)}`).join("|");
    if (tp.actions.dataset.rccSig !== sig) {
      tp.actions.dataset.rccSig = sig;
      const focusId = tp.actions.contains(document.activeElement) ? document.activeElement.dataset.rccTopAction : null;
      tp.actions.replaceChildren(
        ...list.map((t) => {
          const b = el("button", "rcc-top-btn");
          b.type = "button";
          b.dataset.rccTopAction = t.id;
          b.dataset.testid = `rcc-top-action-${t.id}`;
          b.setAttribute("aria-label", t.tooltip);
          b.setAttribute("aria-pressed", String(topPressed(t, rec)));
          const aria = t.shortcut ? t.shortcut.toUpperCase() : ariaKeys(t.shortcutLabel);
          if (aria) b.setAttribute("aria-keyshortcuts", aria);
          const keyLabel = t.shortcutLabel || (t.shortcut ? t.shortcut.toUpperCase() : "");
          b.dataset.rccTip = keyLabel ? `${t.tooltip}  ${keyLabel}` : t.tooltip;
          b.append(iconOf(t.icon, ICON.frame));
          return b;
        })
      );
      if (focusId) {
        const f = tp.actions.querySelector(`[data-rcc-top-action="${CSS.escape(focusId)}"]`);
        if (f) f.focus({ preventScroll: true });
      }
    }
    tp.slot.hidden = !share;
    tp.pill.hidden = !share && !list.length;
    if (share) setVar(rec.shell, "--rcc-share-w", share.getBoundingClientRect().width || share.offsetWidth || 0);
    if (tp.pill.parentElement !== g.layer) g.layer.append(tp.pill);
  }

  // "Canvas controls" with nothing left to show (zoom moved out, the app's
  // right toggle mirrored by canvas-quick, no Share off the Design route):
  // drawn empty, canvas-quick's toggle pill takes its place (CSS).
  function syncControls(g) {
    const c = g.row.querySelector(`:scope > ${CONTROLS}`);
    if (!c) return;
    const empty = !Array.from(c.children).some((k) => !k.classList.contains("rcq-rail") && k.getBoundingClientRect().width > 0);
    setAttr(c, ATTR.empty, empty);
  }

  // --------------------------------------------------------------- geometry
  // Card, rail column, round toggle and zoom follow from a few measurements,
  // handed to the CSS as custom properties on the shell.
  // canvas-webpanel: a browser card docked on the right of the view (its
  // dock [data-rtwp-dock], or a container marked data-rcw-open="1" with
  // --rcw-width). Its left edge, or null while it is closed.
  function webpanelLeft(rec) {
    const sh = rec.shell;
    const dock = sh.querySelector(":scope > [data-rtwp-dock]:not([hidden])");
    if (dock) {
      observe(rec, dock);
      const c = dock.querySelector(".rtwp-card") || dock;
      const r = c.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return r.left;
    }
    const holder = sh.closest('[data-rcw-open="1"]') || sh.querySelector('[data-rcw-open="1"]');
    if (holder) {
      const w = parseFloat(getComputedStyle(holder).getPropertyValue("--rcw-width"));
      if (w > 0) return holder.getBoundingClientRect().right - w;
    }
    return null;
  }

  // The rects syncGeometry needs besides the shell's and the viewport
  // area's. A full sync measures them (measureGeo) and keeps them as offsets
  // from the area (geoOf); while resizing they come back from those offsets
  // (geoFrom), each anchored as the chrome anchors that piece, so a resize
  // frame reads two rects (one layout) before its writes.
  const relBox = (r, a) => r && { l: r.left - a.left, r: r.right - a.right, t: r.top - a.top, b: r.bottom - a.bottom, w: r.width, h: r.height, c: r.left + r.width / 2 - (a.left + a.width / 2) };
  // x: "l" | "r" | "c" (its width from that edge / the centre), "s" (both
  // edges); y: "t" | "b" (its height from that edge), "s" (both edges)
  function absBox(o, a, x, y) {
    if (!o) return null;
    const left = x === "r" ? a.right + o.r - o.w : x === "c" ? a.left + a.width / 2 + o.c - o.w / 2 : a.left + o.l;
    const right = x === "s" ? a.right + o.r : left + o.w;
    const top = y === "b" ? a.bottom + o.b - o.h : a.top + o.t;
    const bottom = y === "t" ? top + o.h : a.bottom + o.b;
    return { left, right, top, bottom, width: right - left, height: bottom - top };
  }
  const GEO_AT = { side: ["l", "s"], zoom: ["r", "b"], rail: ["l", "t"], slot: ["r", "t"], hbar: ["c", "b"], rrow: ["s", "s"], host: ["l", "s"], pill: ["l", "b"] };
  // the agents pill shows (its slot shows something)
  const pillOn = (c) => !!(c && c.agents.querySelector(":scope > :not([hidden])"));
  function measureGeo(rec, card, comp, topShown) {
    const sh = rec.shell;
    const box = (n) => (n && n.isConnected ? n.getBoundingClientRect() : null);
    const side = card.side && card.open ? box(card.side) : null;
    const host = rec.hostedChat && rec.hostedChat.isConnected ? agentHost(rec) : null;
    return {
      side: side && side.width > 1 ? side : null,
      zoom: box(rec.zoom),
      rail: box(sh.querySelector(`[${ATTR.rail}]`)),
      slot: topShown && !rec.top.slot.hidden ? box(rec.top.slot) : null,
      hbar: box(sh.querySelector(`[${ATTR.hbarwrap}] ${TOOLS}`)),
      rrow: box(sh.querySelector(`[${ATTR.rrow}]`)),
      host: host ? box(host) : null,
      pill: pillOn(comp) ? box(comp.pill) : null,
      wpLeft: webpanelLeft(rec),
      compH: comp ? comp.wrap.offsetHeight : 0,
    };
  }
  function geoOf(m, a) {
    const o = { wpOff: m.wpLeft == null ? null : a.right - m.wpLeft, compH: m.compH };
    for (const k of Object.keys(GEO_AT)) o[k] = relBox(m[k], a);
    return o;
  }
  function geoFrom(o, a) {
    const m = { wpLeft: o.wpOff == null ? null : a.right - o.wpOff, compH: o.compH };
    for (const [k, [x, y]] of Object.entries(GEO_AT)) m[k] = absBox(o[k], a, x, y);
    return m;
  }

  // A column that moves because a card opened or closed slides there (FLIP
  // on the individual `translate` property, so the !important `transform:
  // none` kept on the app's tool bar wrapper does not block it); a resize
  // (ui-motion's data-rtm-resizing), the first placement or reduced motion
  // moves it at once. dir: +1 for a left offset, -1 for a right one.
  function slideOn(rec, key, v, dir, sel) {
    const was = rec[key];
    rec[key] = v;
    if (was == null || Math.abs(v - was) < 0.5 || resizing() || performance.now() - resizeEnd < 400 || reducedMotion()) return;
    const dx = ((was - v) * dir).toFixed(1);
    for (const n of rec.shell.querySelectorAll(sel)) {
      if (typeof n.animate !== "function" || !shown(n)) continue;
      n.animate([{ translate: `${dx}px 0` }, { translate: "0 0" }], { duration: DUR.small, easing: EASE_OUT });
    }
  }

  function syncGeometry(rec, g, card) {
    const sh = rec.shell;
    const comp = rec.comp && rec.comp.wrap.isConnected ? rec.comp : null;
    const topShown = rec.top && !rec.top.pill.hidden;
    // the reads first (one layout), then the writes
    const s = sh.getBoundingClientRect();
    const a = g.area.getBoundingClientRect();
    const fast = !!rec.geo && resizing();
    const m = fast ? geoFrom(rec.geo, a) : measureGeo(rec, card, comp, topShown);
    if (!fast) rec.geo = geoOf(m, a);
    else {
      // the webpanel's card edge stays live while resizing (its own drag is
      // a resize: it moves every frame, the webpanel calling sync() in the
      // same rAF); the Share over the top pill's slot moves with it
      const was = m.wpLeft;
      m.wpLeft = webpanelLeft(rec);
      if (m.slot && was != null && m.wpLeft != null) {
        const d = was - m.wpLeft; // the card's growth since the reads were kept
        m.slot = { ...m.slot, left: m.slot.left - d, right: m.slot.right - d };
      }
    }
    // the webpanel's card: what it covers of the canvas area moves the chrome
    // left (the zoom 12px from the card); a card over nearly the whole view
    // leaves the chrome the least room it needs (MIN_COMPOSER)
    const wpLeft = m.wpLeft;
    let rcw = wpLeft != null ? Math.max(0, a.right - wpLeft) : 0;
    rcw = Math.min(rcw, Math.max(0, a.width - MIN_COMPOSER));
    // the free strip (the area less the card) decides what is narrow; while
    // resizing, the cards take turns as it crosses BOTH_W
    const freeW = a.width - rcw;
    if (fast && freeW < BOTH_W !== !!rec.narrowFree) {
      rec.narrowFree = freeW < BOTH_W;
      syncNarrow(rec, g, card);
    }
    setVar(sh, "--rcc-vp-l", a.left - s.left);
    setVar(sh, "--rcc-vp-t", a.top - s.top);
    // rail column: 12px from the edge, or from the open card
    const railX = m.side ? m.side.right - a.left + RAIL_EDGE : RAIL_EDGE;
    setVar(sh, "--rcc-rail-x", railX);
    slideOn(rec, "railX", railX, 1, `${LTOG}, [data-rcc-railwrap]:not([data-rcc-hbarwrap])`);
    setVar(sh, "--rcc-rail-top", sh.querySelector(LTOG) ? COL_TOP + TOGGLE + TOGGLE_GAP : COL_TOP);
    // the top right pill, then the selection pill 8px under it
    setVar(sh, "--rcc-sel-top", topShown ? EDGE + BAR + SPACE : EDGE);
    // the selection card: one width for the pill and its properties, right
    // of the left column (toggle and rail, beside the open card) on the same
    // rows: in a narrow view with the card open it narrows (SEL_MIN at
    // least), or steps aside (no pill until the card closes: syncNarrow)
    const colRight = sh.hasAttribute(ATTR.hbar) && !m.side ? 0 : railX + RAIL_W + SPACE;
    const selRoom = freeW - EDGE - colRight;
    const selW = Math.round(Math.max(Math.min(200, selRoom), Math.min(PROPS_W, a.width - 2 * GAP, selRoom)));
    setVar(sh, "--rcc-sel-w", Math.max(SEL_MIN, selW));
    if (rec.sel) setAttr(rec.sel.pill, "data-rcc-noroom", selRoom < SEL_MIN);
    setAttr(sh, "data-rcc-rcw", wpLeft != null);
    setVar(sh, "--rcc-rcw-inset", rcw);
    slideOn(rec, "rcwInset", rcw, -1, ".rcc-top, [data-rcc-rwrap], .rcc-sel");
    // 12px from the card's visible edge (it may start a little right of the area)
    const zoomInset = wpLeft != null ? (rcw > 0 ? rcw + RAIL_EDGE : Math.max(0, RAIL_EDGE - (wpLeft - a.right))) : EDGE;
    setVar(sh, "--rcc-right-inset", zoomInset); // the dropdown floats: the zoom keeps the corner
    slideOn(rec, "zoomInset", zoomInset, -1, ".rcc-zoom");
    if (m.slot) {
      setVar(sh, "--rcc-share-x", m.slot.left);
      setVar(sh, "--rcc-share-y", m.slot.top);
    }
    // the composer (6): in the left column, 12px from the edge and the
    // bottom, as wide as the card at most (its last width, even closed).
    // Card open: docked under it (its left and width, two rows; the card
    // ends 8px above it). Card closed: one row, clear of the zoom, under the
    // rail. It grows (the text) up to 8px under the rail (one row) or while
    // the card keeps 200px (docked). The switch is a FLIP (placeComposer).
    const zoomW = m.zoom && m.zoom.width > 0 ? m.zoom.width : 0;
    let cw = null;
    if (comp) {
      const docked = !!m.side;
      let x = EDGE;
      let w;
      let top;
      if (docked) {
        cardWLast = m.side.width;
        x = m.side.left - a.left;
        // as wide as the card, clear of the zoom (the free strip's)
        w = Math.max(0, Math.min(m.side.width, a.width - x - (zoomW ? zoomInset + zoomW + RAIL_EDGE : EDGE + rcw)));
        top = a.top + COL_TOP + CARD_MIN + SPACE;
      } else {
        const freeR = zoomW ? zoomInset + zoomW + RAIL_EDGE : EDGE + rcw;
        w = Math.max(0, Math.min(cardWidth(), a.width - EDGE - freeR));
        top = m.rail && m.rail.height > 0 ? m.rail.bottom + SPACE : a.top + COL_TOP + TOGGLE + TOGGLE_GAP;
      }
      const taMax = Math.max(ROW_H, Math.min(TA_MAX, a.bottom - EDGE - top - 2 * COMP_PAD - (docked ? ROW_H : 0)));
      const flipped = placeComposer(rec, docked ? "docked" : "row", x, w, EDGE, taMax);
      setAttr(sh, "data-rcc-comp", docked ? "docked" : "row");
      // its height: the one measured, read again when the mode changed
      const ch = flipped ? comp.wrap.offsetHeight : m.compH;
      if (flipped && rec.geo) rec.geo.compH = ch;
      // the agents pill: 8px right of the composer, up to 12px short of the
      // zoom; a narrow view (no room for it there): 8px above the composer
      // (docked: the card ends 8px above the pill then, so the "Manage
      // agents" button never goes)
      const above = syncAgentsRoom(comp, a.left + x, a.left + x + w, zoomW ? a.right - zoomInset - zoomW - RAIL_EDGE : a.right - EDGE - rcw, true);
      // the card ends 8px above the docked composer (its height in that mode)
      setVar(sh, "--rcc-card-bottom", Math.max(0, s.bottom - a.bottom) + EDGE + (ch > 0 ? ch : COMP_H + ROW_H) + SPACE + (docked && above ? COMP_H + SPACE : 0));
      if (ch > 0) cw = { left: a.left + x, right: a.left + x + w, top: a.bottom - EDGE - ch, width: w, height: ch };
    }
    const zr = zoomW ? { left: a.right - zoomInset - zoomW, right: a.right - zoomInset, top: m.zoom.top, width: zoomW } : null;
    // the bottom row: the composer and, when it shows, the agents pill
    const pr = cw && m.pill ? m.pill : null;
    const row = pr ? { left: cw.left, right: Math.max(cw.right, pr.right), top: Math.min(cw.top, pr.top) } : cw;
    // the horizontal tool bar (no room for the rail): above the dock only
    // where the two meet
    const hr = m.hbar;
    const meets = !!row && (!hr || hr.width === 0 || (hr.right > row.left && hr.left < row.right));
    setVar(sh, "--rcc-hbar-bottom", meets ? a.bottom - row.top + SPACE : GAP);
    // the properties: the selection card's body, right under its top row
    // (the pill), as wide, down to the composer / zoom (8px over them)
    // (the pill: --rcc-sel-top from the area's top, BAR high)
    const rr = m.rrow;
    if (rr) {
      const pillBottom = a.top + (topShown ? EDGE + BAR + SPACE : EDGE) + BAR;
      const top = pillBottom - rr.top;
      const w = Math.max(200, Math.min(selW, rr.width - rcw - 2 * GAP));
      const x1 = rr.right - EDGE - rcw;
      const x0 = x1 - w;
      let limit = a.bottom - GAP;
      for (const ob of [cw, pr, zr]) if (ob && ob.width > 0 && ob.right > x0 && ob.left < x1) limit = Math.min(limit, ob.top - SPACE);
      setVar(sh, "--rcc-dd-top", top);
      setVar(sh, "--rcc-dd-w", w);
      setVar(sh, "--rcc-dd-h", Math.max(160, limit - (rr.top + top)));
    }
    // resizing: the hosted chat follows its host here (the only other write)
    if (fast && m.host && rec.hostedChat && rec.hostedChat.isConnected) placeChat(rec, rec.hostedChat, m.host, false);
  }

  function observe(rec, node) {
    for (const n of rec.observed)
      if (!n.isConnected) {
        rec.ro.unobserve(n);
        rec.observed.delete(n);
      }
    if (rec.observed.has(node) || typeof ResizeObserver !== "function") return;
    if (!rec.ro) rec.ro = new ResizeObserver(() => syncAllSoon());
    rec.ro.observe(node);
    rec.observed.add(node);
  }

  // ------------------------------------------------------------------- sync
  function syncShell(rec) {
    const wasOn = rec.shell.hasAttribute(ATTR.shell);
    const g = enabled() ? eligible(rec.shell, wasOn) : null;
    if (!g) {
      const c = enabled() ? compactInfo(rec.shell) : null;
      if (c) return syncCompact(rec, c);
      if (!enabled()) restoreRight(rec); // flag off: the right panel as the app had it
      teardownShell(rec, true);
      return markNative(rec);
    }
    // a resize under way (see resizing): the geometry only, while the rail
    // keeps its mode; the full sync runs when it ends
    if (wasOn && rec.geo && rec.lastCard && resizing() && railSteady(rec, g)) {
      try {
        syncGeometry(rec, g, rec.lastCard);
      } catch (err) {
        noteError("geometry", err, rec.shell);
      }
      return;
    }
    if (rec.shell.hasAttribute(ATTR.compact)) rec.shell.removeAttribute(ATTR.compact); // wide again: the full layout
    setAttr(rec.shell, ATTR.native, false);
    rec.unready = 0;
    setAttr(rec.shell, ATTR.shell, true);
    setAttr(g.row, ATTR.row, true);
    observe(rec, g.area); // narrowed by a docked panel (canvas-webpanel)
    observe(rec, rec.shell);
    // one guarded block each: an error in one never takes the others down
    const step = (where, fn, fallback) => {
      try {
        return fn();
      } catch (err) {
        noteError(where, err, rec.shell);
        return fallback;
      }
    };
    step("file", () => syncFile(rec, g));
    const card = (rec.lastCard = step("card", () => syncCard(rec, g), { side: null, open: false }));
    step("rail", () => syncRail(rec, g));
    step("right", () => syncRight(rec));
    step("zoom", () => syncZoom(rec, g));
    step("controls", () => syncControls(g));
    step("composer", () => syncComposer(rec, g));
    step("top", () => syncTop(rec, g));
    step("selection", () => syncSelPill(rec, g));
    step("dropdown", () => syncDropdown(rec));
    step("narrow", () => syncNarrow(rec, g, card));
    step("geometry", () => syncGeometry(rec, g, card));
    // the chat window last: the dock's rect is final now
    step("chat", () => syncDockChat(rec, g));
    if (rec.focusTab) {
      const b = rec.head && rec.head.querySelector(`[data-rcc-tab-id="${CSS.escape(rec.focusTab)}"]`);
      rec.focusTab = null;
      if (b) b.focus({ preventScroll: true });
    }
  }

  // The rail's mode would not change at this height (railRoom, hysteresis).
  function railSteady(rec, g) {
    if (rec.railNeed == null) return true;
    const off = rec.shell.hasAttribute(ATTR.hbar);
    return rec.railNeed <= railRoom(g.area.getBoundingClientRect().height) - (off ? 16 : 0) === !off;
  }

  // The app's own tool bar and right panel are hidden by the CSS on a canvas
  // view the chrome has not taken (canvas-chrome.css, "before the chrome"):
  // no flash of the native ones while the app mounts the view. A view the
  // chrome leaves to the app gets [data-rcc-native] and shows them: at once
  // with the flag off or under 344px, after 1.5s for a wide view that never
  // gets its top row. A view out of sight stays unmarked (hidden until it is
  // taken, or left to the app, when it shows).
  function markNative(rec) {
    const sh = rec.shell;
    let native = !enabled();
    if (!native && shown(sh)) {
      if (sh.getBoundingClientRect().width < MIN_COMPACT) native = true;
      else {
        const now = performance.now();
        if (!rec.unready) rec.unready = now;
        native = now - rec.unready >= NATIVE_AFTER;
        if (!native) {
          clearTimeout(rec.nativeT);
          rec.nativeT = setTimeout(syncAllSoon, NATIVE_AFTER - (now - rec.unready) + 20);
        }
      }
    }
    setAttr(sh, ATTR.native, native);
  }

  // Everything this mod added to one shell goes away; attributes too.
  function teardownShell(rec, keepRec, keepComposer) {
    const sh = rec.shell;
    if (rec.hostedChat) unhostChat(rec.hostedChat, rec); // the workspace's chat lives outside the shell
    if (rec.hostMO) rec.hostMO.disconnect();
    rec.hostMO = rec.hostMOFor = null;
    for (const n of sh.querySelectorAll(`[${ATTR.hosted}]`)) unhostChat(n);
    for (const n of sh.querySelectorAll(`[${ATTR.hideTab}]`)) n.removeAttribute(ATTR.hideTab);
    for (const n of sh.querySelectorAll(".rcc-panel, [data-rcc-section]")) dropPanel(n);
    for (const p of Array.from(rec.panels.values())) dropPanel(p);
    for (const n of [rec.head, rec.file, rec.zoom, !keepComposer && rec.comp && rec.comp.wrap, rec.sel && rec.sel.pill, rec.top && rec.top.pill]) if (n) n.remove();
    for (const n of sh.querySelectorAll(".rcc-node")) n.remove();
    if (zm.rec === rec) closeZoomMenu(false);
    for (const a of [ATTR.card, ATTR.tab, ATTR.row, ATTR.railwrap, ATTR.rail, ATTR.rwrap, ATTR.rrow, ATTR.props, ATTR.style, ATTR.empty, "data-rcc-order", "data-rcc-hide", ATTR.hbarwrap, ATTR.grp, ATTR.opts, ATTR.share])
      for (const n of sh.querySelectorAll(`[${a}]`)) n.removeAttribute(a);
    for (const a of [ATTR.shell, ATTR.left, ATTR.right, ATTR.zoomed, ATTR.selpill, ATTR.hbar, ATTR.dd, "data-rcc-rcw", "data-rcc-comp"]) if (sh.hasAttribute(a)) sh.removeAttribute(a);
    if (!keepComposer && sh.hasAttribute(ATTR.compact)) sh.removeAttribute(ATTR.compact);
    for (const v of ["--rcc-vp-l", "--rcc-vp-t", "--rcc-rail-x", "--rcc-rail-top", "--rcc-right-inset", "--rcc-sel-top", "--rcc-sel-w", "--rcc-free-l", "--rcc-free-r", "--rcc-hbar-bottom", "--rcc-dd-top", "--rcc-dd-w", "--rcc-dd-h", "--rcc-share-x", "--rcc-share-y", "--rcc-share-w", "--rcc-rcw-inset", "--rcc-comp-x", "--rcc-comp-w", "--rcc-comp-b", "--rcc-card-bottom"])
      sh.style.removeProperty(v);
    if (rec.unsub) safe(rec.unsub);
    if (rec.ro) rec.ro.disconnect();
    if (sessMenu.rec === rec) closeSessionMenu();
    Object.assign(rec, { agent: null, head: null, headSig: "", file: null, fileSig: "", fileAlt: null, zoom: null, controls: null, unsub: null, ro: null, observed: new Set(), lastLeftOpen: null, sel: null, selSig: null, top: null, hasSel: false, ddShown: false, geo: null, lastCard: null, railNeed: null, chatSig: null });
    if (!keepComposer && rec.comp) {
      if (rec.comp.pillRO) rec.comp.pillRO.disconnect();
      if (rec.comp.slotMO) rec.comp.slotMO.disconnect();
      if (rec.comp.voice) safe(() => rec.comp.voice.destroy());
    }
    if (!keepComposer) rec.comp = null;
    if (!keepRec) {
      // the view is gone: its agents list's host with it
      if (rec.hubRO) rec.hubRO.disconnect();
      if (rec.hubMO) rec.hubMO.disconnect();
      if (rec.hub) rec.hub.remove();
      rec.hub = rec.hubRO = rec.hubMO = null;
      recs.delete(sh);
    }
  }

  let scheduled = false;
  let disposed = false;
  let selTimer = 0;
  function tick() {
    scheduled = false;
    if (disposed) return;
    const seen = new Set();
    for (const shell of document.querySelectorAll(SHELL)) {
      seen.add(shell);
      watchShell(shell);
      const rec = recOf(shell);
      safe(syncShell, rec);
      // registered tools live in every visible toolbar, chrome or not
      // (horizontal there): another mod's tool never depends on the layout
      if (!shell.hasAttribute(ATTR.shell)) {
        const tb = shown(shell) ? shell.querySelector(TOOLS) : null;
        if (tb) safe(syncTools, rec, tb);
      }
    }
    for (const [shell, rec] of recs)
      if (!seen.has(shell) || !shell.isConnected) {
        safe(teardownShell, rec, false);
        if (shellRO) shellRO.unobserve(shell);
        watched.delete(shell);
      }
    sweep();
    if (zm.node && (!zm.rec || !zm.rec.zoom || !zm.rec.zoom.isConnected)) closeZoomMenu(false);
  }
  let shellRO = null;
  const watched = new WeakSet();
  function watchShell(shell) {
    if (watched.has(shell) || typeof ResizeObserver !== "function") return;
    if (!shellRO) shellRO = new ResizeObserver(() => syncAllSoon());
    shellRO.observe(shell);
    watched.add(shell);
  }
  function syncAllSoon() {
    if (scheduled || disposed) return;
    scheduled = true;
    requestAnimationFrame(tick);
  }
  function syncShellSoon(rec, focusId) {
    if (focusId) rec.focusTab = focusId;
    syncAllSoon();
  }

  const mo = new MutationObserver(syncAllSoon);

  // ui-motion's resize contract: <html> carries data-rtm-resizing while the
  // window is resized, a split dragged or the sidebar toggled (removed 180ms
  // after the last change). Meanwhile a sync only follows the geometry
  // (syncShell, syncGeometry: two reads, then the writes, one pass per
  // frame); its end brings the full sync back.
  const RESIZING = "data-rtm-resizing";
  const resizing = () => document.documentElement.hasAttribute(RESIZING);
  let resizeEnd = 0; // when the last resize ended (its settling sync moves things at once)
  const resizeMO = new MutationObserver(() => {
    if (resizing()) return;
    resizeEnd = performance.now();
    syncAllSoon();
  });
  // without ui-motion: a window resize is still never animated
  window.addEventListener("resize", () => (resizeEnd = performance.now()), { passive: true });

  // ------------------------------------------------------------ global input
  // Long press on a rail tool with options opens its menu, as the corner
  // sub-indicator does (the app's own menu trigger, clicked); the click that
  // ends the press is swallowed so the tool does not switch too.
  const LONG_MS = 450;
  const lp = { timer: 0, x: 0, y: 0, swallow: null };
  function railGroup(t) {
    const b = t && t.closest ? t.closest("button") : null;
    if (!b || b.matches('[data-rcc-opts], [aria-label$=" options"]') || !b.closest(`[${ATTR.shell}] [${ATTR.rail}]`)) return null;
    const chev = b.parentElement && b.parentElement.querySelector(':scope > button[data-rcc-opts], :scope > button[aria-label$=" options"]');
    return chev ? { b, chev } : null;
  }
  function cancelLong() {
    clearTimeout(lp.timer);
    lp.timer = 0;
  }
  function onLongMove(e) {
    if (lp.timer && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 6) cancelLong();
  }
  function onLongClick(e) {
    const sw = lp.swallow;
    if (!sw) return;
    lp.swallow = null;
    if (e.target instanceof Element && sw.contains(e.target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
  function onPointerDown(e) {
    const t = e.target instanceof Element ? e.target : null;
    lp.swallow = null;
    cancelLong();
    const grp = e.button === 0 ? railGroup(t) : null;
    if (grp) {
      lp.x = e.clientX;
      lp.y = e.clientY;
      lp.timer = setTimeout(() => {
        lp.timer = 0;
        if (!grp.chev.isConnected) return;
        grp.chev.click(); // (its own click goes through onLongClick first)
        lp.swallow = grp.b;
      }, LONG_MS);
    }
    const sh = t && t.closest(SHELL);
    if (sh) lastShell = sh;
    if (zm.node && !(t && (zm.node.contains(t) || (zm.rec && zm.rec.zoom && zm.rec.zoom.contains(t))))) closeZoomMenu(false);
  }
  // the canvas the tools act on: the last one pressed, else the first one on
  // screen with its tool bar (managed by the chrome or not)
  const seen = (n) => shown(n) && getComputedStyle(n).visibility !== "hidden";
  function targetShell() {
    const ok = (sh) => sh && sh.isConnected && seen(sh) && seen(sh.querySelector(TOOLS));
    if (ok(lastShell)) return lastShell;
    for (const sh of document.querySelectorAll(SHELL)) if (ok(sh)) return sh;
    return null;
  }
  // Registered tools work with the layout flag off too (they stay in the
  // app's horizontal tool bar), so their keys do not read the flag.
  function onKey(e) {
    if (e.defaultPrevented || e.isComposing || e.repeat) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target instanceof Element ? e.target : null;
    const a = document.activeElement;
    if (isEditable(t) || isEditable(a) || inOverlay(t) || inOverlay(a)) return;
    if (e.key === "Escape") {
      if (armedTool) disarmTool();
      else if (ddWanted && Array.from(recs.keys()).some((sh) => sh.getAttribute(ATTR.dd) === "open")) setDd(false);
      return;
    }
    if (e.shiftKey) return;
    const k = (e.key || "").toLowerCase();
    if (k.length !== 1) return;
    const def = Array.from(tools.values()).find((x) => x.shortcut && x.shortcut === k);
    const top = def ? null : Array.from(topActions.values()).find((x) => x.shortcut && x.shortcut === k);
    if (top) {
      const sh = targetShell();
      if (!sh) return;
      e.preventDefault();
      e.stopPropagation();
      return runTopAction(top.id, sh);
    }
    if (!def) return;
    const sh = targetShell();
    if (!sh) return;
    e.preventDefault();
    e.stopPropagation();
    activateTool(def.id, sh);
  }

  // --------------------------------------------------------------------- API
  function registerLeftTab(def) {
    if (!def || !validId(def.id) || typeof def.label !== "string") return warn("registerLeftTab: {id, label} required", false);
    if (RESERVED_TABS.has(def.id)) return warn(`registerLeftTab: "${def.id}" is built in`, false);
    leftTabs.set(def.id, { id: def.id, label: def.label, icon: def.icon, render: def.render, seq: ++regSeq });
    syncAllSoon();
    return true;
  }
  function unregisterLeftTab(id) {
    const had = leftTabs.delete(id);
    if (had) syncAllSoon();
    return had;
  }
  function registerRightSection(def) {
    if (!def || !validId(def.id) || typeof def.label !== "string" || typeof def.render !== "function")
      return warn("registerRightSection: {id, label, render} required", false);
    const order = Number.isFinite(def.order) ? def.order : ORDER.export + 10;
    rightSections.set(def.id, { id: def.id, label: def.label, order, render: def.render, when: def.when, seq: ++regSeq });
    syncAllSoon();
    return true;
  }
  function unregisterRightSection(id) {
    const had = rightSections.delete(id);
    if (had) {
      for (const s of document.querySelectorAll(`[data-rcc-section="${CSS.escape(id)}"]`)) dropPanel(s);
      syncAllSoon();
    }
    return had;
  }
  // Spec: {id, label, icon?, shortcut?, kind?: "tool"|"action", onArm(ctx),
  // onDisarm?(), when?(ctx), isActive?(), order?}. Also accepted, as
  // canvas-notes sends it: key (= shortcut), activate(canvasRoot) (= onArm),
  // deactivate() (= onDisarm). order: "before:browser" | "after:browser" |
  // a number (tools 40, actions 50).
  function registerTool(def) {
    const onArm =
      def && typeof def.onArm === "function" ? def.onArm : def && typeof def.activate === "function" ? (ctx) => def.activate(ctx.canvasRoot, ctx) : null;
    if (!def || !validId(def.id) || typeof def.label !== "string" || !onArm) return warn("registerTool: {id, label, onArm | activate} required", false);
    const rawKey = typeof def.shortcut === "string" ? def.shortcut : typeof def.key === "string" ? def.key : "";
    let shortcut = rawKey.trim().toLowerCase();
    if (shortcut && (shortcut.length !== 1 || RESERVED_KEYS.has(shortcut) || Array.from(tools.values()).some((t) => t.id !== def.id && t.shortcut === shortcut))) {
      warn(`registerTool: shortcut "${rawKey}" is taken, registered without it`);
      shortcut = "";
    }
    if (armedTool === def.id) disarmTool(); // the old definition's onDisarm
    tools.set(def.id, {
      id: def.id,
      label: def.label,
      icon: def.icon,
      shortcut,
      kind: def.kind === "action" ? "action" : "tool",
      onArm,
      onDisarm: typeof def.onDisarm === "function" ? def.onDisarm : typeof def.deactivate === "function" ? def.deactivate : null,
      isActive: typeof def.isActive === "function" ? def.isActive : null,
      place: def.order === "before:browser" ? 29 : def.order === "after:browser" ? 31 : Number.isFinite(def.order) ? def.order : null,
      when: def.when,
      seq: ++regSeq,
    });
    syncAllSoon();
    return true;
  }
  function unregisterTool(id) {
    if (armedTool === id) disarmTool();
    const had = tools.delete(id);
    if (had) syncAllSoon();
    return had;
  }
  // For a mod whose tool finished on its own (a sticky placed, Esc in its UI).
  function setToolArmed(id, armed) {
    if (!tools.has(id)) return false;
    if (armed) {
      if (armedTool !== id) {
        const prev = armedTool && tools.get(armedTool);
        armedTool = id;
        if (prev && typeof prev.onDisarm === "function") safe(prev.onDisarm);
      }
    } else if (armedTool === id) armedTool = null;
    syncAllSoon();
    return true;
  }
  function warn(msg, ret) {
    console.warn(`[canvas-chrome] ${msg}`);
    return ret;
  }

  function managedShell() {
    if (lastShell && lastShell.isConnected && lastShell.hasAttribute(ATTR.shell) && shown(lastShell)) return lastShell;
    for (const sh of recs.keys()) if (sh.hasAttribute(ATTR.shell) && shown(sh)) return sh;
    return null;
  }
  // {id, icon, tooltip, onToggle(ctx) -> pressed?, pressed?: boolean |
  // (ctx) => boolean, shortcutLabel?, shortcut?}: a button in the top right
  // pill, next to Share. ctx.view is the canvas view (shell) it was pressed
  // in; pressed is per view. shortcutLabel is shown in the tooltip only (the
  // mod owns its key); shortcut (one key) makes this mod handle the key.
  // "⌘⇧B" / "Ctrl+Shift+B" -> "Meta+Shift+B" / "Control+Shift+B"
  function ariaKeys(label) {
    const t = String(label || "").trim();
    if (!t) return "";
    const names = { "⌘": "Meta", "⇧": "Shift", "⌥": "Alt", "⌃": "Control", cmd: "Meta", ctrl: "Control", shift: "Shift", alt: "Alt", option: "Alt", meta: "Meta" };
    const parts = t.includes("+") ? t.split("+").map((p) => p.trim()).filter(Boolean) : Array.from(t);
    return parts.map((p) => names[p] || names[p.toLowerCase()] || (p.length === 1 ? p.toUpperCase() : p)).join("+");
  }
  function registerTopAction(def) {
    if (!def || !validId(def.id) || typeof def.onToggle !== "function") return warn("registerTopAction: {id, onToggle} required", false);
    let shortcut = typeof def.shortcut === "string" ? def.shortcut.trim().toLowerCase() : "";
    // more than one key ("⌘⇧B"): a label to show, the mod binds it itself
    let label = typeof def.shortcutLabel === "string" ? def.shortcutLabel.trim() : "";
    if (shortcut && shortcut.length !== 1) {
      if (!label) label = def.shortcut.trim();
      shortcut = "";
    }
    const taken = (k) => RESERVED_KEYS.has(k) || Array.from(tools.values()).some((t) => t.shortcut === k) || Array.from(topActions.values()).some((t) => t.id !== def.id && t.shortcut === k);
    if (shortcut && (shortcut.length !== 1 || taken(shortcut))) {
      warn(`registerTopAction: shortcut "${def.shortcut}" is taken, registered without it`);
      shortcut = "";
    }
    const prev = topActions.get(def.id);
    topActions.set(def.id, {
      id: def.id,
      icon: def.icon,
      tooltip: typeof def.tooltip === "string" && def.tooltip ? def.tooltip : def.id,
      shortcut,
      onToggle: def.onToggle,
      pressed: def.pressed,
      shortcutLabel: label,
      state: typeof def.pressed === "boolean" ? def.pressed : prev ? prev.state : false,
      byView: prev ? prev.byView : new Map(),
      seq: ++regSeq,
    });
    syncAllSoon();
    return true;
  }
  function unregisterTopAction(id) {
    const had = topActions.delete(id);
    if (had) syncAllSoon();
    return had;
  }

  function setLeftTab(id, shell) {
    const sh = shell || managedShell();
    const rec = sh && recs.get(sh);
    if (!rec || !tabsFor(rec).some((t) => t.id === id)) return false;
    selectTab(rec, id, false);
    return true;
  }

  // A view's shell: the one holding `view` (a node in it, or the shell), else
  // the canvas view on screen.
  const shellOf = (view) => (view && view.closest ? view.closest(SHELL) : null) || (view ? null : managedShell());
  // The agents list's host of a view (hubHost), or null.
  function agentsHost(view) {
    const sh = shellOf(view);
    const rec = sh && recs.get(sh);
    return rec && rec.hub && rec.hub.isConnected ? rec.hub : null;
  }
  // The agents list (1): the card opens when it is closed (the app's own
  // toggle), the Agent tab comes on, the list's host scrolls into the tab's
  // view, then window event "rtcc:agents-open" {view} (comment-bubbles moves
  // the focus into the list). Never a route or app tab change. false when
  // the view is not one the chrome lays out.
  function openAgents(view) {
    const sh = shellOf(view);
    const rec = sh && recs.get(sh);
    if (!rec || !sh.hasAttribute(ATTR.shell) || !tabsFor(rec).some((t) => t.id === "agent")) return false;
    if (sh.getAttribute(ATTR.left) !== "open") {
      const g = eligible(sh, true);
      if (!g || !g.api || typeof g.api.toggleLeftPanel !== "function") return false;
      g.api.toggleLeftPanel();
    }
    selectTab(rec, "agent", false);
    syncShellSoon(rec);
    waitFor(() => (sh.getAttribute(ATTR.left) === "open" && rec.agent && !rec.agent.panel.hidden && rec.hub && shown(rec.hub) ? rec.hub : null), 1500).then((h) => {
      if (!h || disposed) return;
      // only the tab's own column scrolls (never the card or the canvas)
      const p = rec.agent.panel;
      const pr = p.getBoundingClientRect();
      const hr = h.getBoundingClientRect();
      if (hr.top < pr.top) p.scrollTop -= pr.top - hr.top;
      else if (hr.bottom > pr.bottom) p.scrollTop += Math.min(hr.top - pr.top, hr.bottom - pr.bottom);
      emit("rtcc:agents-open", { view: sh });
    });
    return true;
  }

  function snapshot() {
    const out = [];
    for (const [sh, rec] of recs) {
      if (!sh.hasAttribute(ATTR.shell)) continue;
      out.push({
        shell: sh,
        leftTab: rec.tab,
        leftOpen: sh.getAttribute(ATTR.left) === "open",
        rightOpen: sh.getAttribute(ATTR.right) === "open",
        chatHosted: !!rec.hostedChat,
        chatWindow: rec.agent ? rec.agent.body.dataset.rccState || "" : null,
        agentView: rec.agent ? rec.agent.view : null,
        zoom: rec.controls ? zoomPct(rec.controls) : null,
        selection: rec.sel && rec.sel.pill.isConnected ? rec.sel.title.textContent : null,
        chat: rec.agent ? rec.agent.sessLabel.textContent : null,
      });
    }
    return {
      enabled: enabled(),
      shells: out,
      leftTabs: Array.from(leftTabs.keys()),
      rightSections: Array.from(rightSections.keys()),
      tools: Array.from(tools.keys()),
      armedTool,
    };
  }

  // One row per canvas view: what the chrome sees and why a part is missing.
  // Console: console.table(__RE_TEMPO_CANVAS_CHROME__.diagnose())
  function diagnose() {
    return Array.from(document.querySelectorAll(SHELL)).map((sh, i) => {
      const rec = recs.get(sh);
      const why = [];
      if (!enabled()) why.push("flag rtd.canvasChrome=off");
      if (!shown(sh)) why.push("not on screen");
      else if (getComputedStyle(sh).visibility === "hidden") why.push("hidden (visibility)");
      const w = Math.round(sh.getBoundingClientRect().width);
      if (shown(sh) && w < MIN_W) why.push(`narrow (${w}px < ${MIN_W})`);
      const row = topRow(sh);
      if (!row) why.push("no canvas top toolbar row");
      else if (!rowProps(row)) why.push("top row without panelApi");
      const comp = rec && rec.comp && rec.comp.wrap.isConnected ? rec.comp : null;
      return {
        view: viewKind(sh),
        index: i,
        managed: sh.hasAttribute(ATTR.shell),
        mode: sh.hasAttribute(ATTR.shell) ? "full" : sh.hasAttribute(ATTR.compact) ? "compact (composer + chip)" : "off",
        width: w,
        notManagedBecause: sh.hasAttribute(ATTR.shell) ? "" : why.join("; ") || "unknown",
        composer: comp ? (comp.form.hidden ? "hidden" : "shown") : "not mounted",
        chatChip: rec && rec.agent ? rec.agent.sessLabel.textContent : "",
        chatWindow: rec && rec.agent ? rec.agent.body.dataset.rccState || "" : "",
        ownChat: agentAvailable(sh),
        commentAgent: !!commentAgent(),
        rail: sh.hasAttribute(ATTR.hbar) ? "horizontal (no room)" : sh.querySelector(`[${ATTR.rail}]`) ? "vertical" : "none",
        errors: errorLog.filter((e) => e.view === viewKind(sh)).length,
      };
    });
  }

  function dispose() {
    disarmTool();
    disposed = true;
    mo.disconnect();
    for (const rec of Array.from(recs.values())) {
      safe(restoreRight, rec);
      safe(teardownShell, rec, false);
    }
    for (const n of Array.from(tracked)) dropPanel(n);
    for (const [tb, fn] of wired) tb.removeEventListener("click", fn);
    wired.clear();
    for (const n of document.querySelectorAll(".rcc-tools")) n.remove();
    for (const n of Array.from(flights)) n.remove(); // a launch in flight still lands (its task)
    flights.clear();
    closeZoomMenu(false);
    window.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("pointermove", onLongMove, true);
    window.removeEventListener("pointerup", cancelLong, true);
    window.removeEventListener("pointercancel", cancelLong, true);
    window.removeEventListener("click", onLongClick, true);
    cancelLong();
    window.removeEventListener("resize", syncAllSoon);
    resizeMO.disconnect();
    // without the mod, the app's own tool bar and right panel show
    for (const sh of document.querySelectorAll(SHELL)) sh.setAttribute(ATTR.native, "");
    window.removeEventListener("storage", syncAllSoon);
    document.removeEventListener("pointerup", syncAllSoon, true);
    document.removeEventListener("keyup", syncAllSoon, true);
    clearInterval(selTimer);
    if (shellRO) shellRO.disconnect();
    hideTip();
    delete window.__RE_TEMPO_CANVAS_CHROME__;
  }

  const api = {
    version: 1,
    get enabled() {
      return enabled();
    },
    ORDER,
    registerLeftTab,
    unregisterLeftTab,
    registerRightSection,
    unregisterRightSection,
    registerTool,
    unregisterTool,
    setToolArmed,
    registerTopAction,
    unregisterTopAction,
    get propertiesOpen() {
      return ddWanted;
    },
    setPropertiesOpen: (open) => setDd(!!open),
    get armedTool() {
      return armedTool;
    },
    setLeftTab,
    openAgents,
    agentsHost,
    leftTab: (shell) => {
      const rec = recs.get(shell || managedShell());
      return rec ? rec.tab : null;
    },
    state: snapshot,
    errors: () => errorLog.slice(),
    diagnose,
    sync: () => tick(),
    dispose,
  };
  window.__RE_TEMPO_CANVAS_CHROME__ = api;

  // (No keyboard button in the rail, by request: canvas-keys' sheet stays
  // on its own key, "?".)

  function init() {
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-rtwp-open", "data-rcw-open"] });
    resizeMO.observe(document.documentElement, { attributes: true, attributeFilter: [RESIZING] });
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onLongMove, true);
    window.addEventListener("pointerup", cancelLong, true);
    window.addEventListener("pointercancel", cancelLong, true);
    window.addEventListener("click", onLongClick, true);
    window.addEventListener("resize", syncAllSoon);
    window.addEventListener("storage", syncAllSoon);
    // selection changes (click, shift-click, Esc, Cmd+A, a rename) re-read
    document.addEventListener("pointerup", syncAllSoon, true);
    document.addEventListener("keyup", syncAllSoon, true);
    selTimer = setInterval(() => {
      if (document.hidden) return;
      // an armed tool that reports its own state (isActive) may have ended
      const at = armedTool && tools.get(armedTool);
      if (at && at.isActive) return syncAllSoon();
      for (const rec of recs.values()) if (rec.sel && rec.sel.pill.isConnected) return syncAllSoon();
    }, 500);
    tick();
    emit("rtd:canvas-chrome-ready", api);
  }
  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init, { once: true });
})();
