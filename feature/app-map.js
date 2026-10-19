/*
 * RE-TEMPO · app-map (user MOD layer)
 * ---------------------------------------------------------------------------
 * A live map of everything on screen that can be clicked, typed into,
 * toggled, picked or dragged, plus the app's store actions, under stable,
 * readable names, so a CLI / MCP / chat agent can drive the whole app by name
 * instead of by pixels.
 *
 * 1. DOM map (live)
 *    A first pass over the document, then a MutationObserver (added subtrees,
 *    a few attributes) with a 40 ms debounce, indexes every actionable element:
 *    native controls (button, a[href], input, textarea, select, summary,
 *    contenteditable roots), ARIA roles (button, link, tab, menuitem*, option,
 *    switch, checkbox, radio, treeitem, combobox, textbox, searchbox, slider,
 *    spinbutton), draggable="true" nodes, canvas items ([data-canvas-item-id]),
 *    mod action markers (data-act, data-row-act) and plain nodes with a React
 *    click handler (__reactProps$*.onClick / onMouseDown / onPointerDown /
 *    onDoubleClick), an onclick, or a labelled tabindex >= 0.
 *    ui-drive's toasts ([data-rtud-ui]: its Allow / Deny buttons) and
 *    ui-beam's overlay are never mapped, so no agent can approve itself.
 *    Cheap-to-spot hidden subtrees (hidden, inert, inline display:none,
 *    Tailwind "hidden" without a responsive/stateful display class,
 *    [data-rtps-hidden]) are skipped and re-scanned when that attribute
 *    changes. The rest is filtered by real visibility when the map is read
 *    (checkVisibility + a non-empty rect; handler-only nodes bigger than a
 *    quarter of the viewport are containers and left out).
 *    Item: { id, kind: click|type|toggle|select|drag, label, region, pane?,
 *            rect: [x, y, w, h], enabled, risk, why?, role, testid?, state?,
 *            value?, draggable?, offscreen? }
 *    Ids are fixed for an element's lifetime, readable, and handed over to
 *    the element that replaces a removed one (a React remount keeps its id):
 *      "#<data-testid>"                   then "#tid@<pane|region>", "#tid/<text>"
 *      "<region>/<role>/<aria-label>"     e.g. "rail/button/settings"
 *      "<region>/<role>/<text>"           e.g. "sidebar/treeitem/fix-login-bug"
 *      "<region>/<role>/<title|placeholder|name>"
 *      "<region>/<role>/@<anchor>>div2>button1"  (short path from the nearest testid)
 *    and "~2", "~3"... on a collision. <region> carries the pane when the
 *    region sits inside one ("composer@p3/button/attach").
 *    Region, most specific first: settings (the Settings shell: the div.w-60
 *    nav with the "Personal" group, as profile-page finds it) > dialog (role
 *    dialog / alertdialog / menu, aria-modal, data-slot dialog-content) >
 *    composer (the box around [data-testid="chat-input-textarea"] holding the
 *    send / stop / model buttons) > canvas ([data-canvas-shell],
 *    [data-canvas-root], canvas-design-sidebar) > pane:<id> (pane-dock
 *    [data-rtd-panel], native split [data-center-panel-pane]) > rail
 *    ([data-testid="workspace-navbar"]) > sidebar (project-sidebar, the left
 *    workspace panel, docs / issues / canvas / agents sidebars) > right (the
 *    right workspace panel) > titlebar (top header strip: <header> or
 *    -webkit-app-region:drag box at the top, or the box around the branch
 *    title) > center (center-panel, center workspace panel) > app. On the
 *    settings route, center/app become settings. `pane` is also set for an
 *    item of another region inside a pane.
 *
 * 2. Store map (names only)
 *    The zustand stores the React tree subscribes to (getState in the
 *    useSyncExternalStoreWithSelector deps; only pure `()=>x` getters are
 *    called, as project-sidebar and pane-dock do), the window stores (__*__
 *    with getState + subscribe, __tempoDocs, __tempoIssues,
 *    __sourceRepoDataStoreDebug) and the mods' APIs (__RE_TEMPO_*__, own data
 *    properties only, getters are never read). Function names and arity are
 *    listed as "store.<name>.<fn>" / "mod.<name>.<fn>". Only the ALLOW list
 *    (store calls the mods already make) runs; everything else is "manual".
 *    High-level "app.*" actions go through the mods' own paths
 *    (project-sidebar open.*, pane-dock split / splitPane / duplicate / reset /
 *    undo / redo, rail-menu run("settings")) with store fallbacks.
 *
 * 3. Registry (ui-drive's window.__RE_TEMPO_ACTIONS__)
 *    actions() are registered with ui-drive's spec ({label: (args) => text,
 *    description, params [{name, type, required, enum}], risk, kind, owner
 *    "app-map", target: (args) => the element, for its beam; run}): ui.click,
 *    ui.type, ui.key, ui.toggle, ui.select, ui.drag (all "caution", and they
 *    refuse a destructive target), ui.destructive ("destructive": ui-drive
 *    asks the user for an explicit Allow first), ui.find / ui.map / ui.hints /
 *    ui.export ("safe"), the app.* actions and the allowlisted store.* ones.
 *    The text param is always the last one, so `tempo-ui ui.type <id> some
 *    words` works. Before ui-drive loads, the specs go to its pending queue
 *    (window.__RE_TEMPO_ACTIONS_PENDING__); a new or re-injected registry
 *    ("rtd:actions-ready", checked every second) is registered again.
 *    Without ui-drive the mod works standalone (runAction() here wants
 *    {confirm: true} for a destructive action).
 *
 * 4. Risk (for the decision model and for confirmation in a UI)
 *    destructive: delete, remove, discard, reset, close, archive, deploy,
 *      publish, commit, push, merge, revoke, sign out, revert, kill...; and
 *      every send: a button / menu item / store function that sends, submits,
 *      posts or replies (the composer's send), typing with submit, Enter in a
 *      text field or editor (composer, form), Enter / Space on a destructive
 *      control, a destructive option picked from a menu, app.sendPrompt and
 *      store createChatTabWithMessage;
 *    caution: rename, save, create, new, add, move, duplicate, upload, run,
 *      start, stop, install, enable / disable, attach... and any toggle or text
 *      field in Settings ("Send usage stats" as a toggle is a setting);
 *    safe: the rest (navigate, open, select, search, expand, copy...).
 *    Words come from aria-label, testid and title; the visible text counts
 *    too for buttons and menu items (a chat named "deploy fix" is not a
 *    destructive tab). "Close" / "Cancel" / "Dismiss" inside a dialog is safe.
 *    act() refuses a destructive target without {confirm: true}; through
 *    ui-drive only ui.destructive (which asks the user) reaches one.
 *
 * 5. Export
 *    export() returns a compact JSON string (<= 200 KB: offscreen items, then
 *    long labels, then manual store actions are dropped until it fits). Disk
 *    is opt-in: with localStorage "rtd.appMap.export" = "on" it is also
 *    written to ~/.tempo/app-map.json through electronAPI.fs.writeFile (real
 *    HOME = the home-folder prefix of workspaces.getHomeDir, as usage-bar
 *    does; override: "rtd.appMap.exportPath") and rewritten at most every
 *    30 s while the map changes. Off (the default): nothing is written. The
 *    export never carries the value of an input / editor (labels come from
 *    aria-label, <label>, placeholder or testid for text fields), and act()
 *    results report a typed text's length, not the text, since ui-drive keeps
 *    replies in ~/.tempo/ui-replies.jsonl.
 *
 * 6. Cost and flag
 *    Work runs in requestAnimationFrame slices of 8 ms (never more than 16 ms
 *    per tick), incremental (only added subtrees), with a full re-walk every
 *    15 s while mutations keep coming (React can add a handler without a DOM
 *    mutation). Paused while the document is hidden. localStorage
 *    "rtd.appMap" = "off": no scan, no observer, no registration (the API
 *    stays and answers {enabled: false}).
 *
 * API: window.__RE_TEMPO_APP_MAP__
 *   snapshot({region, all, inView})  -> {at, route, viewport, count, regions, items}
 *   find(query, {limit, region, kind}) -> items with score (fuzzy over label,
 *                       id, testid, region, kind; synonyms: "split right" finds
 *                       "Open in split view"; "region:x", "kind:x" filters)
 *   act(id, {kind, text, value, clear, append, submit, to, dx, dy, confirm})
 *                    -> Promise<{ok, id, kind, how, ...}>; click / type / toggle /
 *                       select / drag (also click(id), type(id, text), toggle(id, v),
 *                       select(id, v), drag(id, to))
 *   screenshotHints() -> {viewport, dpr, regions: [{name, rect}], items: [{id,
 *                       label, kind, risk, region, center, rect}], legend}
 *   stores()         -> [{name, via, actions: [{id, arity, exec: allow|manual,
 *                       risk, params?}]}]
 *   actions()        -> the registry actions [{id, label, params, rest, risk, kind}]
 *   runStore(id, args[], {confirm}) / runAction(id, args | ...positional)
 *   export({write})  -> JSON string; exportAsync() (8 ms slices); lastExport
 *   debug(on)        -> overlay with the ids over the screen (colored by risk)
 *   el(id), idOf(el), rescan(), reset(), settle(ms), stats() (ticks,
 *   maxTickMs, maxSliceMs, moMs, mutations...), state(), setEnabled(bool),
 *   dispose(). Window event "rtam:changed" {count} after the map changes.
 * Registry actions: ui.click <id> | ui.type <id> <text> | ui.key <id> [key] |
 *   ui.toggle <id> [on|off] | ui.select <id> <option> | ui.drag <id> [to]
 *   [zone] [--dx --dy] | ui.destructive <id> [kind] [value] | ui.find <words> |
 *   ui.map [region] | ui.hints | ui.export | app.state | app.tabs |
 *   app.route <route> | app.openSettings [section] | app.openChat <ws> <chat> |
 *   app.openBranch <ws> | app.newChat [ws] | app.openCanvas <name> <path> [ws] |
 *   app.openDoc <id> | app.openIssue <id> | app.openAgent <id> |
 *   app.selectTab <tab> | app.sendPrompt <text> | app.draftPrompt <text> |
 *   app.panes | app.split <tab> [zone] [target] | app.splitPane <pane> |
 *   app.duplicate <tab> | app.layoutReset | app.layoutUndo | app.layoutRedo |
 *   store.<allowlisted>.
 * Validated against a fixture (Playwright, app-shaped DOM, fake stores), not
 * in the logged-in app.
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  const previous = window.__RE_TEMPO_APP_MAP__;
  if (previous && typeof previous.dispose === "function") {
    try {
      previous.dispose();
    } catch (_) {}
  }

  // ---------------------------------------------------------------- config
  const VERSION = 1;
  const FLAG_KEY = "rtd.appMap";
  const EXPORT_FLAG = "rtd.appMap.export"; // "on" = write ~/.tempo/app-map.json (export() and every 30 s)
  const EXPORT_PATH_KEY = "rtd.appMap.exportPath";
  const HOME_KEY = "re-tempo.usage.home"; // usage-bar's real-HOME override
  const BUDGET_MS = 8;
  const DEBOUNCE_MS = 40;
  const FULL_EVERY_MS = 15000;
  const STORE_EVERY_MS = 60000;
  const HOUSEKEEP_MS = 1000;
  const AUTO_EXPORT_MS = 30000;
  const EXPORT_MAX = 200 * 1024;
  const QUEUE_MAX = 1500;
  const LABEL_MAX = 60;
  const GENERIC_MAX_CHILDREN = 16;
  const GENERIC_MAX_AREA = 0.25;
  const OVERLAY_MAX = 900;
  const LOG_MAX = 50;

  const SEL = {
    rail: '[data-testid="workspace-navbar"]',
    sidebar:
      '[data-rtps-root], [data-tempo-workspace-panel="left"], [data-testid="docs-view-sidebar"], [data-testid="issues-sidebar"], [data-testid="canvas-sidebar"], [data-testid="agents-chat-sidebar"]',
    right: '[data-tempo-workspace-panel="right"], [data-testid="right-panel-rail"]',
    center: '[data-testid="center-panel"], [data-tempo-workspace-panel="center"]',
    canvas: '[data-canvas-shell], [data-canvas-root], [data-testid="canvas-design-sidebar"]',
    pane: "[data-rtd-panel], [data-center-panel-pane]",
    dialog: '[role="dialog"], [role="alertdialog"], [aria-modal="true"], [role="menu"], [data-slot="dialog-content"]',
    editor: '[data-testid="chat-input-textarea"]',
    composerBtn: '[data-testid^="chat-input-send-button"], [data-testid="chat-input-stop-button"], [data-testid="chat-input-model-selector"]',
    send: '[data-testid^="chat-input-send-button"]',
    branch: '[data-testid="app-header-branch-status"]',
    options: '[role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]',
  };
  const EDITABLE = '[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
  const OBSERVED_ATTRS = [
    "class",
    "style",
    "hidden",
    "inert",
    "data-rtps-hidden",
    "role",
    "tabindex",
    "data-testid",
    "contenteditable",
    "draggable",
    "href",
    "type",
    "data-act",
  ];
  const HIDE_ATTRS = new Set(["class", "style", "hidden", "inert", "data-rtps-hidden"]);

  // ------------------------------------------------------------- utilities
  const now = () => performance.now();
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
  const flagOn = () => lsGet(FLAG_KEY) !== "off";
  const deaccent = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const norm = (s) =>
    deaccent(s == null ? "" : s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const splitCamel = (s) => String(s || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const slug = (s, max = 40) => norm(s).replace(/ /g, "-").slice(0, max).replace(/-+$/, "");
  const squash = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  // Id words: no relative times ("2m", "5h", "3d", "ago"), at most 5 words.
  const idWords = (s) =>
    norm(s)
      .split(" ")
      .filter((w) => w && !/^\d+(?:s|m|h|d|w|mo|y|min|mins|hr|hrs)$/.test(w) && w !== "ago")
      .slice(0, 5)
      .join("-")
      .slice(0, 48);
  const humanize = (t) =>
    squash(
      String(t)
        .replace(/[-_]+/g, " ")
        .replace(/\b(button|btn)\b/g, "")
    );
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () =>
    new Promise((r) => {
      let done = false;
      const fin = () => {
        if (!done) {
          done = true;
          r();
        }
      };
      requestAnimationFrame(fin);
      setTimeout(fin, 50);
    });
  async function waitFor(fn, ms, step = 30) {
    const end = now() + ms;
    for (;;) {
      let v = null;
      try {
        v = fn();
      } catch (_) {}
      if (v) return v;
      if (now() > end) return null;
      await sleep(step);
    }
  }
  const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  function brief(v, depth = 0) {
    if (v == null || typeof v === "boolean" || typeof v === "number") return v;
    if (typeof v === "string") return clip(v, 200);
    if (typeof v === "function") return "[function]";
    if (Array.isArray(v)) return depth ? `[array ${v.length}]` : v.slice(0, 20).map((x) => brief(x, 1));
    if (v instanceof Element) return `<${v.tagName.toLowerCase()}>`;
    if (typeof v === "object") {
      if (depth) return "[object]";
      const o = {};
      for (const k of Object.keys(v).slice(0, 12)) o[k] = brief(v[k], 1);
      return o;
    }
    return String(v);
  }

  // ------------------------------------------------------------------ state
  let running = false;
  let disposed = false;
  const byId = new Map(); // id -> entry {id, el, kind, generic}
  const meta = new WeakMap(); // el -> entry
  const suffixNext = new Map(); // base id -> next "~n" to try
  const freed = new Map(); // base id -> suffix numbers released by removed elements
  let skipped = new WeakSet(); // hidden roots skipped at scan, re-scanned on attribute change
  const queue = new Set(); // roots to scan
  const reclass = new Set(); // elements whose attributes changed
  let pruneDirty = false;
  let needFull = false;
  let job = null; // {root, walker, restarts}
  let changed = false;
  let mutatedSinceFull = false;
  let fullStartedAt = 0;
  let fullRunning = false;
  let lastFullAt = -1e9;
  let propsKey = null;
  let mo = null;
  let rafId = 0;
  let debTimer = 0;
  let house = 0;
  let pausedPending = false;
  const actLog = [];
  const stats = {
    ticks: 0,
    maxTickMs: 0,
    lastTickMs: 0,
    visited: 0,
    indexed: 0,
    dropped: 0,
    mutations: 0,
    fullPasses: 0,
    lastFullMs: 0,
    pauses: 0,
    maxSliceMs: 0,
    moMs: 0,
    storeScans: 0,
    storeFibers: 0,
    errors: [],
  };
  const err = (where, e) => {
    stats.errors.push({ at: Date.now(), where, msg: String((e && e.message) || e) });
    if (stats.errors.length > 20) stats.errors.shift();
  };

  // ------------------------------------------------------------ classify
  const ROLE_KIND = {
    button: "click",
    link: "click",
    menuitem: "click",
    tab: "select",
    option: "select",
    treeitem: "select",
    combobox: "select",
    switch: "toggle",
    checkbox: "toggle",
    radio: "toggle",
    menuitemcheckbox: "toggle",
    menuitemradio: "toggle",
    textbox: "type",
    searchbox: "type",
    spinbutton: "type",
    slider: "drag",
  };
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "LINK", "META", "HEAD", "OPTION", "OPTGROUP", "DATALIST"]);
  const LEAF_TAGS = new Set(["svg", "IFRAME", "CANVAS", "VIDEO", "AUDIO", "IMG", "PICTURE", "TEXTAREA", "SELECT", "INPUT", "math", "webview"]);
  const SHOWN_VARIANT = /(?:^|\s)[\w@/[\]().:-]*:(?:flex|block|grid|inline|inline-flex|inline-block|inline-grid|contents|table|flow-root)(?=\s|$)/;
  const HIDDEN_CLASS = /(?:^|\s)hidden(?=\s|$)/;

  function hiddenCheap(el) {
    if (el.hidden === true || el.hasAttribute("inert") || el.hasAttribute("data-rtps-hidden")) return true;
    const st = el.style;
    if (st && st.display === "none") return true;
    const c = el.getAttribute("class");
    return !!c && HIDDEN_CLASS.test(c) && !SHOWN_VARIANT.test(c);
  }
  function isEditableRoot(el) {
    const ce = el.getAttribute("contenteditable");
    if (ce === null || ce === "false") return false;
    const p = el.parentElement;
    return !(p && p.closest(EDITABLE));
  }
  function hasHandler(el) {
    if (typeof el.onclick === "function" || typeof el.onmousedown === "function" || typeof el.onpointerdown === "function") return true;
    const p = propsKey ? el[propsKey] : null;
    return !!(
      p &&
      (typeof p.onClick === "function" ||
        typeof p.onMouseDown === "function" ||
        typeof p.onPointerDown === "function" ||
        typeof p.onDoubleClick === "function")
    );
  }
  const popupKind = (el) => (el.getAttribute("aria-haspopup") === "listbox" ? "select" : "click");
  const pressable = (el) => el.hasAttribute("aria-pressed") || el.hasAttribute("aria-checked");

  // -> {kind, generic} or null
  function classify(el) {
    const tag = el.tagName;
    if (tag === "INPUT") {
      const t = (el.getAttribute("type") || "text").toLowerCase();
      if (t === "hidden") return null;
      if (t === "checkbox" || t === "radio") return { kind: "toggle", generic: false };
      if (t === "button" || t === "submit" || t === "reset" || t === "image" || t === "file") return { kind: "click", generic: false };
      return { kind: "type", generic: false };
    }
    if (tag === "TEXTAREA") return { kind: "type", generic: false };
    if (tag === "SELECT") return { kind: "select", generic: false };
    const role = el.getAttribute("role");
    if (role) {
      const k = ROLE_KIND[role];
      if (k === "click") return { kind: pressable(el) ? "toggle" : popupKind(el), generic: false };
      if (k) return { kind: k, generic: false };
    }
    if (tag === "BUTTON") return { kind: pressable(el) ? "toggle" : popupKind(el), generic: false };
    if (tag === "A" && el.hasAttribute("href")) return { kind: "click", generic: false };
    if (tag === "SUMMARY") return { kind: "toggle", generic: false };
    if (isEditableRoot(el)) return { kind: "type", generic: false };
    if (el.hasAttribute("data-canvas-item-id")) return { kind: "drag", generic: false };
    if (el.getAttribute("draggable") === "true") return { kind: "drag", generic: false };
    if (el.hasAttribute("data-act") || el.hasAttribute("data-row-act")) return { kind: "click", generic: false };
    if (el.childElementCount > GENERIC_MAX_CHILDREN) return null;
    if (hasHandler(el)) return { kind: "click", generic: true };
    const ti = el.getAttribute("tabindex");
    if (ti !== null && +ti >= 0 && (el.hasAttribute("data-testid") || el.hasAttribute("aria-label") || el.hasAttribute("title")))
      return { kind: "click", generic: true };
    return null;
  }

  function roleTag(el, kind) {
    const role = el.getAttribute("role");
    if (role && role !== "presentation" && role !== "none") return role;
    const tag = el.tagName;
    if (tag === "BUTTON") return "button";
    if (tag === "A") return "link";
    if (tag === "INPUT") {
      const t = (el.getAttribute("type") || "text").toLowerCase();
      if (t === "checkbox" || t === "radio") return t;
      if (t === "search") return "searchbox";
      if (t === "range") return "slider";
      if (t === "button" || t === "submit" || t === "reset" || t === "image" || t === "file") return "button";
      return "textbox";
    }
    if (tag === "TEXTAREA") return "textbox";
    if (tag === "SELECT") return "select";
    if (tag === "SUMMARY") return "summary";
    if (kind === "type") return "editor";
    if (el.hasAttribute("data-canvas-item-id")) return "item";
    if (kind === "drag") return "draggable";
    return tag.toLowerCase();
  }

  // Visible text, bounded: stops after max chars or 80 text nodes.
  function shortText(el, max) {
    let out = "";
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(), i = 0; n && i < 80; n = w.nextNode(), i++) {
      const v = n.nodeValue;
      if (!v || !v.trim()) continue;
      const p = n.parentElement;
      if (p && (p.tagName === "STYLE" || p.tagName === "SCRIPT")) continue;
      out += (out ? " " : "") + v.trim();
      if (out.length >= max) break;
    }
    out = squash(out);
    return out.length > max ? out.slice(0, max) : out;
  }
  const svgTitle = (el) => {
    const t = el.querySelector && el.querySelector("svg title");
    return t ? t.textContent : "";
  };
  const imgAlt = (el) => {
    const i = el.querySelector && el.querySelector("img[alt]");
    return i ? i.getAttribute("alt") : "";
  };
  // Text of the <label> of a form control, without the control's own text (a
  // <select> inside its label would add every option).
  function labelText(el) {
    const l = el.labels && el.labels[0];
    if (!l) return "";
    let out = "";
    const w = document.createTreeWalker(l, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(), i = 0; n && i < 40; n = w.nextNode(), i++) {
      if (el.contains(n)) continue;
      out += ` ${n.nodeValue}`;
      if (out.length > LABEL_MAX) break;
    }
    return squash(out);
  }
  function pmPlaceholder(el) {
    const own = el.getAttribute("data-placeholder") || el.getAttribute("aria-placeholder");
    if (own) return own;
    const p = el.querySelector("[data-placeholder]");
    return p ? p.getAttribute("data-placeholder") : "";
  }

  function labelOf(el, kind) {
    let s = el.getAttribute("aria-label");
    if (!s) {
      const lb = el.getAttribute("aria-labelledby");
      if (lb)
        s = lb
          .split(/\s+/)
          .map((id) => {
            const n = document.getElementById(id);
            return n ? n.textContent : "";
          })
          .join(" ");
    }
    if (!s) s = labelText(el);
    if (!s && el.hasAttribute("data-canvas-item-id")) {
      const h = el.querySelector("[data-storyboard-header]");
      s = (h && h.textContent) || `item ${el.getAttribute("data-canvas-item-id")}`;
    }
    if (!s && kind === "type") {
      s = el.getAttribute("placeholder") || pmPlaceholder(el) || el.getAttribute("title") || el.getAttribute("name");
      if (!s && el.getAttribute("data-testid")) s = humanize(el.getAttribute("data-testid"));
      if (!s) s = "text field";
    }
    if (!s && el.tagName === "SELECT") s = el.getAttribute("name") || el.getAttribute("title");
    if (!s) s = shortText(el, LABEL_MAX);
    if (!s) s = el.getAttribute("title") || el.getAttribute("placeholder") || el.getAttribute("alt") || svgTitle(el) || imgAlt(el);
    if (!s && el.getAttribute("data-testid")) s = humanize(el.getAttribute("data-testid"));
    if (!s) s = el.getAttribute("name") || el.getAttribute("value") || roleTag(el, kind);
    return clip(squash(s), LABEL_MAX);
  }

  // ---------------------------------------------------------------- regions
  let R = null;
  let rAt = -1e9;
  function findSettings() {
    for (const side of document.querySelectorAll("div.w-60")) {
      for (const s of side.querySelectorAll("span")) {
        if (!s.children.length && s.textContent.trim() === "Personal") return side.parentElement || side;
      }
    }
    return null;
  }
  function findComposers() {
    const out = [];
    for (const ed of document.querySelectorAll(SEL.editor)) {
      let box = null;
      for (let n = ed.parentElement, i = 0; n && i < 10; n = n.parentElement, i++) {
        if (n.querySelector(SEL.composerBtn)) {
          box = n;
          break;
        }
      }
      out.push(box || ed.parentElement || ed);
    }
    return out;
  }
  // Layout-free (the scan never forces a layout): the <header> holding the
  // branch title or "Toggle left panel" (checked before center), and boxes with
  // an inline -webkit-app-region: drag (checked after center).
  function findTitlebars() {
    const head = new Set();
    const drag = new Set();
    for (const a of document.querySelectorAll(`${SEL.branch}, button[aria-label="Toggle left panel"]`)) {
      const h = a.closest("header");
      if (h) head.add(h);
    }
    for (const n of document.querySelectorAll('[style*="app-region: drag"], [style*="app-region:drag"]')) if (!head.has(n)) drag.add(n);
    return { head, drag };
  }
  let rcache = new WeakMap();
  function roots(force) {
    const t = now();
    if (R && !force && t - rAt < 250) return R;
    rAt = t;
    rcache = new WeakMap();
    let route = null;
    const st = wsState();
    if (st && typeof st.activeNavRoute === "string") route = st.activeNavRoute;
    const tb = findTitlebars();
    const composers = findComposers();
    R = { settings: findSettings(), composers, composerSet: new Set(composers), titleSet: tb.head, dragSet: tb.drag, route };
    return R;
  }
  const F = { settings: 1, dialog: 2, composer: 4, canvas: 8, pane: 16, rail: 32, sidebar: 64, right: 128, titlebar: 256, center: 512, drag: 1024 };
  const ANY_MARK = [SEL.dialog, SEL.canvas, SEL.pane, SEL.rail, SEL.sidebar, SEL.right, SEL.center].join(", ");
  function ownFlags(n, Rr) {
    let f = 0;
    if (n === Rr.settings) f |= F.settings;
    if (Rr.composerSet.has(n)) f |= F.composer;
    if (Rr.titleSet.has(n)) f |= F.titlebar;
    if (Rr.dragSet.has(n)) f |= F.drag;
    if (!n.matches(ANY_MARK)) return f;
    if (n.matches(SEL.dialog)) f |= F.dialog;
    if (n.matches(SEL.canvas)) f |= F.canvas;
    if (n.matches(SEL.pane)) f |= F.pane;
    if (n.matches(SEL.rail)) f |= F.rail;
    if (n.matches(SEL.sidebar)) f |= F.sidebar;
    if (n.matches(SEL.right)) f |= F.right;
    if (n.matches(SEL.center)) f |= F.center;
    return f;
  }
  // Region flags of an element = its ancestors' flags | its own; memoized per
  // ancestor (cleared with the roots, every 250 ms), so siblings cost O(1).
  function infoOf(el, Rr) {
    const stack = [];
    let n = el;
    let info = null;
    while (n && n.nodeType === 1) {
      const c = rcache.get(n);
      if (c) {
        info = c;
        break;
      }
      stack.push(n);
      n = n.parentElement;
    }
    if (!info) info = { f: 0, pane: null };
    for (let i = stack.length - 1; i >= 0; i--) {
      const node = stack[i];
      const own = ownFlags(node, Rr);
      let pane = info.pane;
      if (own & F.pane) pane = node.getAttribute("data-rtd-panel") || node.getAttribute("data-center-panel-pane");
      if (own || pane !== info.pane) info = { f: info.f | own, pane };
      rcache.set(node, info);
    }
    return info;
  }
  function regionOf(el, Rr) {
    const { f, pane } = infoOf(el, Rr);
    const st = Rr.route === "settings";
    let region;
    if (f & F.settings) region = "settings";
    else if (f & F.dialog) region = "dialog";
    else if (f & F.composer) region = "composer";
    else if (f & F.canvas) region = "canvas";
    else if (pane) region = `pane:${pane}`;
    else if (f & F.rail) region = "rail";
    else if (f & F.sidebar) region = "sidebar";
    else if (f & F.right) region = "right";
    else if (f & F.titlebar) region = "titlebar";
    else if (f & F.center) region = st ? "settings" : "center";
    else if (f & F.drag) region = "titlebar";
    else region = st ? "settings" : "app";
    return { region, pane };
  }

  // -------------------------------------------------------------------- ids
  function shortPath(el) {
    const steps = [];
    let n = el;
    let anchor = "";
    for (let i = 0; n && n !== document.body && i < 8; i++) {
      const p = n.parentElement;
      if (!p) break;
      let k = 1;
      for (let s = n.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === n.tagName) k++;
      steps.unshift(n.tagName.toLowerCase() + k);
      n = p;
      const t = n.getAttribute && (n.getAttribute("data-testid") || n.id);
      if (t) {
        anchor = slug(t, 40);
        break;
      }
    }
    return (anchor ? `@${anchor}>` : "") + steps.slice(-4).join(">");
  }
  function baseIds(el, kind, region, pane) {
    const tid = el.getAttribute("data-testid");
    const ns = pane && region !== `pane:${pane}` ? `${region}@${pane}` : region;
    if (tid) {
      const t = `#${tid.slice(0, 80)}`;
      const out = [t, `${t}@${pane || region}`];
      const w = idWords(el.getAttribute("aria-label") || "") || idWords(shortText(el, 48));
      if (w) out.push(`${t}/${w}`);
      return out;
    }
    const rt = roleTag(el, kind);
    let w = idWords(el.getAttribute("aria-label") || "");
    if (!w && el.hasAttribute("data-canvas-item-id")) return [`${ns}/item/${slug(el.getAttribute("data-canvas-item-id"), 48)}`];
    if (!w) w = idWords(labelText(el));
    if (!w && kind !== "type" && el.tagName !== "SELECT") w = idWords(shortText(el, 48));
    if (!w)
      w = idWords(
        el.getAttribute("title") ||
          el.getAttribute("placeholder") ||
          el.getAttribute("aria-placeholder") ||
          el.getAttribute("name") ||
          el.getAttribute("alt") ||
          (kind === "type" ? pmPlaceholder(el) : "") ||
          svgTitle(el) ||
          ""
      );
    return [`${ns}/${rt}/${w || shortPath(el)}`];
  }
  function free(id, el) {
    const cur = byId.get(id);
    if (!cur || cur.el === el) return true;
    if (!cur.el.isConnected) {
      drop(cur);
      return true;
    }
    return false;
  }
  function index(el, c) {
    const { region, pane } = regionOf(el, roots());
    const cands = baseIds(el, c.kind, region, pane);
    const base = cands[0];
    let id = cands.find((x) => free(x, el));
    if (!id) {
      // a suffix freed by a removed twin first (a remount keeps its number), then the next one
      const fl = freed.get(base);
      if (fl && fl.length) {
        fl.sort((a, b) => b - a);
        while (!id && fl.length) {
          const n = fl.pop();
          if (free(`${base}~${n}`, el)) id = `${base}~${n}`;
        }
      }
      for (let n = suffixNext.get(base) || 2; !id; n++) {
        if (free(`${base}~${n}`, el)) {
          id = `${base}~${n}`;
          suffixNext.set(base, n + 1);
        }
      }
    }
    const e = { id, el, kind: c.kind, generic: c.generic, base };
    byId.set(id, e);
    meta.set(el, e);
    stats.indexed++;
    changed = true;
    return e;
  }
  function drop(e) {
    const m = /~(\d+)$/.exec(e.id);
    if (m && e.base) {
      let fl = freed.get(e.base);
      if (!fl) freed.set(e.base, (fl = []));
      fl.push(+m[1]);
    }
    if (byId.get(e.id) === e) byId.delete(e.id);
    meta.delete(e.el);
    stats.dropped++;
    changed = true;
  }
  function visit(el) {
    stats.visited++;
    const c = classify(el);
    const e = meta.get(el);
    if (e) {
      if (!c) drop(e);
      else e.kind = c.kind;
      return;
    }
    if (c) index(el, c);
  }

  // ------------------------------------------------------------------- scan
  let layer = null; // debug overlay root, never indexed
  // ui-drive's toasts (its Allow / Deny buttons) and ui-beam's overlay are never
  // mapped: an agent must not be able to approve its own destructive action.
  const FOREIGN = "[data-rtud-ui], [data-rtub-root]";
  function accept(el) {
    if (el === layer) return NodeFilter.FILTER_REJECT;
    const tag = el.tagName;
    if (SKIP_TAGS.has(tag)) return NodeFilter.FILTER_REJECT;
    if (el.hasAttribute("data-rtud-ui") || el.hasAttribute("data-rtub-root")) return NodeFilter.FILTER_REJECT;
    if (hiddenCheap(el)) {
      skipped.add(el);
      return NodeFilter.FILTER_REJECT;
    }
    visit(el);
    if (LEAF_TAGS.has(tag) || el.hasAttribute("data-canvas-item-id")) return NodeFilter.FILTER_REJECT;
    const ce = el.getAttribute("contenteditable");
    if (ce !== null && ce !== "false") return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT;
  }
  // React's per-root props key (__reactProps$<random>), probed on at most 200
  // nodes once a second. Found after a pass (React mounted later): full re-walk,
  // so handler-only nodes already seen get indexed.
  let propsProbeAt = -1e9;
  function findPropsKey() {
    if (propsKey) return true;
    const t = now();
    if (t - propsProbeAt < 1000) return false;
    propsProbeAt = t;
    const root = document.getElementById("root") || document.body;
    const probe = root && root.getElementsByTagName("*");
    if (!probe) return false;
    for (let i = 0; i < probe.length && i < 200; i++) {
      const k = Object.keys(probe[i]).find((x) => x.startsWith("__reactProps$"));
      if (k) {
        propsKey = k;
        if (byId.size || lastFullAt > 0) needFull = true;
        return true;
      }
    }
    return false;
  }
  function inQueue(n) {
    for (let p = n.parentElement, i = 0; p && i < 60; p = p.parentElement, i++) if (queue.has(p)) return true;
    return false;
  }
  function startJob(root) {
    if (!root.isConnected || root === layer || (layer && layer.contains(root))) return null;
    if (root !== document.body && root !== document.documentElement) {
      for (let p = root; p && p !== document.body; p = p.parentElement) {
        if (p === layer) return null;
      }
      if (root.closest(FOREIGN)) return null;
      if (hiddenCheap(root)) {
        skipped.add(root);
        return null;
      }
      visit(root);
      const tag = root.tagName;
      if (LEAF_TAGS.has(tag) || root.hasAttribute("data-canvas-item-id")) return null;
      const ce = root.getAttribute("contenteditable");
      if (ce !== null && ce !== "false") return null;
    }
    return { root, walker: document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, { acceptNode: accept }), restarts: 0 };
  }
  // true when DOM work remains
  function workDom(end) {
    if (pruneDirty) {
      pruneDirty = false;
      for (const e of Array.from(byId.values())) if (!e.el.isConnected) drop(e);
    }
    if (reclass.size) {
      for (const el of reclass) if (el.isConnected && !(layer && layer.contains(el)) && !el.closest(FOREIGN)) visit(el);
      reclass.clear();
    }
    if (needFull) {
      needFull = false;
      queue.clear();
      job = null;
      queue.add(document.body);
      fullRunning = true;
      fullStartedAt = now();
      mutatedSinceFull = false;
      lastFullAt = now();
    }
    let n = 0;
    for (;;) {
      if (!job) {
        let next = null;
        for (const q of queue) {
          queue.delete(q);
          if (!q.isConnected || inQueue(q)) continue;
          next = q;
          break;
        }
        if (!next) break;
        job = startJob(next);
        if (!job) continue;
      }
      const w = job.walker;
      if (w.currentNode !== job.root && !w.currentNode.isConnected) {
        if (++job.restarts > 3) {
          job = null;
          continue;
        }
        job.walker = document.createTreeWalker(job.root, NodeFilter.SHOW_ELEMENT, { acceptNode: accept });
        continue;
      }
      let more = true;
      while ((more = !!w.nextNode())) {
        if ((++n & 7) === 0 && now() > end) return true;
      }
      job = null;
      if (now() > end) return queue.size > 0;
    }
    if (fullRunning) {
      fullRunning = false;
      stats.fullPasses++;
      stats.lastFullMs = Math.round(now() - fullStartedAt);
    }
    return false;
  }

  // ------------------------------------------------------------- observer
  function onMutations(records) {
    if (!running) return;
    const t0 = now();
    stats.mutations += records.length;
    let any = false;
    for (const r of records) {
      const t = r.target;
      if (layer && (t === layer || layer.contains(t))) continue;
      if (r.type === "childList") {
        for (const n of r.addedNodes) {
          if (n.nodeType === 1 && n !== layer) {
            queue.add(n);
            any = true;
          }
        }
        if (r.removedNodes.length) {
          pruneDirty = true;
          any = true;
        }
      } else if (r.type === "attributes" && t.nodeType === 1) {
        if (HIDE_ATTRS.has(r.attributeName)) {
          if (skipped.has(t) && !hiddenCheap(t)) {
            skipped.delete(t);
            queue.add(t);
            any = true;
          }
          if (r.attributeName !== "class" && r.attributeName !== "style") {
            reclass.add(t);
            any = true;
          }
        } else {
          reclass.add(t);
          any = true;
        }
      }
    }
    if (queue.size > QUEUE_MAX) {
      queue.clear();
      needFull = true;
    }
    if (any) {
      mutatedSinceFull = true;
      schedule();
    }
    stats.moMs += now() - t0;
  }

  // ------------------------------------------------------------ scheduler
  function schedule(delay = DEBOUNCE_MS) {
    if (!running || disposed) return;
    if (document.hidden) {
      pausedPending = true;
      return;
    }
    if (rafId || debTimer) return;
    debTimer = setTimeout(() => {
      debTimer = 0;
      if (!rafId) rafId = requestAnimationFrame(tick);
    }, delay);
  }
  function tick() {
    rafId = 0;
    if (!running) return;
    if (document.hidden) {
      pausedPending = true;
      stats.pauses++;
      return;
    }
    const t0 = now();
    const end = t0 + BUDGET_MS;
    let more = false;
    try {
      if (!propsKey) findPropsKey();
      more = workDom(end);
      if (!more && SS.scan && now() < end) more = workStores(end);
    } catch (e) {
      err("tick", e);
    }
    const dt = now() - t0;
    stats.ticks++;
    stats.lastTickMs = Math.round(dt * 100) / 100;
    if (dt > stats.maxTickMs) stats.maxTickMs = Math.round(dt * 100) / 100;
    if (more) rafId = requestAnimationFrame(tick);
    else settled();
  }
  function settled() {
    if (!changed) return;
    changed = false;
    try {
      window.dispatchEvent(new CustomEvent("rtam:changed", { detail: { count: byId.size } }));
    } catch (_) {}
    if (dbg.on) drawOverlay();
    exportDirty = true;
  }
  function onVisibility() {
    if (!running) return;
    if (!document.hidden && pausedPending) {
      pausedPending = false;
      schedule(0);
    }
  }

  // ------------------------------------------------------------- read side
  const rendered = (el) =>
    typeof el.checkVisibility === "function"
      ? el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })
      : getComputedStyle(el).visibility !== "hidden";
  function enabledOf(el) {
    if (el.disabled === true || el.getAttribute("aria-disabled") === "true" || el.hasAttribute("data-disabled")) return false;
    return !el.closest("[inert], fieldset[disabled]");
  }
  function boolState(el) {
    if (el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio")) return el.checked;
    const a = el.getAttribute("aria-checked") || el.getAttribute("aria-pressed");
    if (a === "true" || a === "mixed") return true;
    if (a === "false") return false;
    const ds = el.getAttribute("data-state");
    if (ds === "checked" || ds === "on" || ds === "open" || ds === "active") return true;
    if (ds === "unchecked" || ds === "off" || ds === "closed" || ds === "inactive") return false;
    if (el.tagName === "SUMMARY" && el.parentElement) return !!el.parentElement.open;
    const ex = el.getAttribute("aria-expanded");
    if (ex) return ex === "true";
    return null;
  }
  function stateOf(el, kind) {
    const out = [];
    if (kind === "toggle") {
      const b = boolState(el);
      if (b !== null) out.push(b ? "on" : "off");
    }
    if (el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-current") === "page" || el.getAttribute("aria-current") === "true")
      out.push("selected");
    else if (el.getAttribute("role") === "tab" && el.getAttribute("data-state") === "active") out.push("selected");
    const ex = el.getAttribute("aria-expanded");
    if (ex) out.push(ex === "true" ? "expanded" : "collapsed");
    return out.length ? out.join(",") : null;
  }
  function valueOf(el, kind) {
    if (kind !== "type" && el.tagName !== "SELECT") return null;
    if (el.tagName === "INPUT") return el.type === "password" ? null : clip(String(el.value || ""), 60);
    if (el.tagName === "TEXTAREA") return clip(String(el.value || ""), 60);
    if (el.tagName === "SELECT") {
      const o = el.options[el.selectedIndex];
      return o ? clip(squash(o.textContent), 60) : "";
    }
    return clip(squash(el.textContent), 60);
  }
  // sends: a click (or a store function) that sends / submits / posts / replies
  // puts text in front of the agent or other people: destructive (the user
  // confirms). As a toggle ("Send usage stats") it stays a setting.
  function guessRiskWords(text, sends = true) {
    let m = RX_DESTRUCTIVE.exec(text);
    if (m) return { level: "destructive", why: m[1] };
    if (sends) {
      m = RX_SEND.exec(text);
      if (m) return { level: "destructive", why: m[1] };
    }
    m = RX_CAUTION.exec(text);
    if (m) return { level: "caution", why: m[1] };
    return null;
  }
  const RX_DESTRUCTIVE =
    /\b(delete|remove|trash|discard|reset|close|archive|deploy|publish|release|commit|push|merge|rebase|force|revoke|sign out|log out|logout|signout|uninstall|drop|destroy|wipe|erase|purge|kill|terminate|abort|unlink|disconnect|leave|revert|overwrite|clear all|clear history)\b/;
  const RX_SEND = /\b(send|submit|post|reply)\b/;
  const RX_CAUTION =
    /\b(rename|send|submit|save|apply|create|new|add|invite|share|move|duplicate|edit|upload|import|export|run|start|restart|reload|stop|enable|disable|install|update|upgrade|connect|post|reply|comment|approve|reject|assign|change|replace|pin|unpin|sync|retry|generate|attach|paste|clear|mark|resolve|reopen|accept|allow|deny|grant|login|log in|sign in|configure)\b/;
  const SAFE_DISMISS = /^(close|dismiss|cancel|close dialog|close menu|close modal|close popover|close panel|back|done|ok|got it)$/;
  function riskOf(el, label, region, kind) {
    const attrs = [splitCamel(el.getAttribute("data-testid") || ""), el.getAttribute("aria-label") || "", el.getAttribute("title") || ""];
    const role = el.getAttribute("role");
    const control =
      (kind === "click" || kind === "toggle") &&
      (el.tagName === "BUTTON" || el.tagName === "INPUT" || role === "button" || role === "menuitem" || role === "menuitemcheckbox" || role === "switch");
    if (control) attrs.push(label);
    const l = norm(label);
    if ((region === "dialog" || region === "settings") && SAFE_DISMISS.test(l)) return { level: "safe", why: "dismiss" };
    const g = guessRiskWords(norm(attrs.join(" ")), kind === "click");
    if (g) return g;
    if ((kind === "toggle" || kind === "type" || kind === "select") && region === "settings") return { level: "caution", why: "setting" };
    return { level: "safe" };
  }

  function itemOf(e, Rr, vw, vh, all) {
    const el = e.el;
    if (!el.isConnected) return null;
    const r = el.getBoundingClientRect();
    const sized = r.width >= 1 && r.height >= 1;
    const vis = sized && rendered(el);
    if (!all) {
      if (!vis) return null;
      if (e.generic && r.width * r.height > GENERIC_MAX_AREA * vw * vh) return null;
    }
    const rg = regionOf(el, Rr);
    let region = rg.region;
    if (region === "app" && r.top >= 0 && r.bottom <= 48 && sized) region = "titlebar";
    const label = labelOf(el, e.kind);
    const risk = riskOf(el, label, region, e.kind);
    const it = {
      id: e.id,
      kind: e.kind,
      label,
      region,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      enabled: enabledOf(el),
      risk: risk.level,
      role: roleTag(el, e.kind),
    };
    if (rg.pane && region !== `pane:${rg.pane}`) it.pane = rg.pane;
    if (risk.why) it.why = risk.why;
    const tid = el.getAttribute("data-testid");
    if (tid) it.testid = tid;
    const st = stateOf(el, e.kind);
    if (st) it.state = st;
    const v = valueOf(el, e.kind);
    if (v != null) it.value = v;
    if (e.kind !== "drag" && el.getAttribute("draggable") === "true") it.draggable = true;
    if (r.bottom <= 0 || r.right <= 0 || r.top >= vh || r.left >= vw) it.offscreen = true;
    if (!vis) it.hidden = true;
    return it;
  }
  function liveItems(opts = {}) {
    const Rr = roots();
    const vw = innerWidth;
    const vh = innerHeight;
    const out = [];
    const reg = opts.region ? String(opts.region) : null;
    for (const e of byId.values()) {
      let it = null;
      try {
        it = itemOf(e, Rr, vw, vh, !!opts.all);
      } catch (x) {
        err("item", x);
      }
      if (!it) continue;
      if (reg && it.region !== reg && !it.region.startsWith(`${reg}:`) && it.pane !== reg && `pane:${it.pane}` !== reg) continue;
      if (opts.kind && it.kind !== opts.kind) continue;
      if (opts.inView && it.offscreen) continue;
      out.push(it);
    }
    out.sort((a, b) => a.rect[1] - b.rect[1] || a.rect[0] - b.rect[0]);
    return out;
  }
  // Same as liveItems({}), in 8 ms slices across frames (background export).
  async function liveItemsSliced() {
    const all = Array.from(byId.values());
    const out = [];
    let i = 0;
    while (i < all.length) {
      if (!running) return out;
      const end = now() + BUDGET_MS;
      const Rr = roots();
      const vw = innerWidth;
      const vh = innerHeight;
      const t0 = now();
      for (; i < all.length && now() < end; i++) {
        try {
          const it = itemOf(all[i], Rr, vw, vh, false);
          if (it) out.push(it);
        } catch (x) {
          err("item", x);
        }
      }
      const dt = Math.round((now() - t0) * 100) / 100;
      if (dt > stats.maxSliceMs) stats.maxSliceMs = dt;
      if (i < all.length) await frame();
    }
    out.sort((a, b) => a.rect[1] - b.rect[1] || a.rect[0] - b.rect[0]);
    return out;
  }
  function snapshot(opts = {}) {
    if (!running) return { enabled: false, at: Date.now(), count: 0, regions: {}, items: [] };
    const items = opts.items || liveItems(opts);
    const regions = {};
    for (const it of items) regions[it.region] = (regions[it.region] || 0) + 1;
    const st = wsState();
    return {
      enabled: true,
      v: VERSION,
      at: Date.now(),
      route: (st && st.activeNavRoute) || (roots().settings ? "settings" : null),
      viewport: [innerWidth, innerHeight],
      count: items.length,
      indexed: byId.size,
      regions,
      items,
    };
  }

  // ------------------------------------------------------------------- find
  const SYN = {
    right: ["split view"],
    left: ["split view"],
    split: ["split view", "divide"],
    divide: ["split"],
    close: ["dismiss", "remove"],
    new: ["add", "create", "plus"],
    add: ["new", "create", "plus"],
    create: ["new", "add"],
    plus: ["add", "new"],
    settings: ["preferences", "gear", "config"],
    preferences: ["settings"],
    config: ["settings"],
    configure: ["settings"],
    search: ["find", "filter", "query"],
    find: ["search"],
    filter: ["search"],
    send: ["submit"],
    submit: ["send"],
    rename: ["edit name", "title"],
    delete: ["remove", "trash"],
    remove: ["delete"],
    prompt: ["message", "chat input", "ask"],
    composer: ["message", "chat input", "prompt"],
    message: ["chat input", "prompt"],
    canvas: ["design", "canvases"],
    design: ["canvas"],
    agent: ["agents"],
    doc: ["docs", "document"],
    issue: ["issues"],
    sidebar: ["left panel"],
    panel: ["pane"],
    pane: ["panel"],
    tab: ["tabs"],
    model: ["model selector"],
    comment: ["comments"],
    user: ["avatar", "profile"],
    profile: ["avatar", "user menu"],
  };
  function find(query, opts = {}) {
    if (!running) return [];
    const q = squash(query);
    const limit = opts.limit || 10;
    const exact = byId.get(q);
    let region = opts.region || null;
    let kind = opts.kind || null;
    const toks = [];
    for (const raw of q.split(" ")) {
      const m = /^(region|in|kind|risk):(.+)$/i.exec(raw);
      if (m) {
        if (m[1] === "kind") kind = m[2];
        else if (m[1] !== "risk") region = m[2];
        continue;
      }
      for (const t of norm(raw).split(" ")) if (t) toks.push(t);
    }
    const items = liveItems({ region, kind, all: !!opts.all });
    if (exact) {
      const it = items.find((x) => x.id === q);
      if (it) return [{ ...it, score: 100 }];
    }
    if (!toks.length) return items.slice(0, limit).map((it) => ({ ...it, score: 0 }));
    const qn = toks.join(" ");
    const scored = [];
    for (const it of items) {
      const ln = norm(it.label);
      const words = ln.split(" ");
      const idn = norm(splitCamel(it.id));
      const tn = it.testid ? norm(it.testid) : "";
      let score = 0;
      let matched = 0;
      for (const tok of toks) {
        let s = 0;
        if (words.includes(tok)) s = 3;
        else if (words.some((w) => w.startsWith(tok))) s = 2;
        else if (ln.includes(tok)) s = 1.5;
        else if (idn.includes(tok) || tn.includes(tok)) s = 1.2;
        else if (it.region === tok || it.region.startsWith(`${tok}:`) || it.pane === tok) s = 1;
        else if (it.kind === tok || it.role === tok) s = 0.8;
        else {
          const syn = SYN[tok];
          if (syn && syn.some((x) => ln.includes(x) || idn.includes(x))) s = 1.4;
        }
        if (s) matched++;
        score += s;
      }
      if (!matched) continue;
      score *= matched / toks.length;
      if (ln === qn) score += 3;
      if (!it.enabled) score -= 0.5;
      if (it.offscreen) score -= 0.3;
      scored.push({ ...it, score: Math.round(score * 100) / 100 });
    }
    scored.sort((a, b) => b.score - a.score || a.rect[1] - b.rect[1]);
    return scored.slice(0, limit);
  }

  // ----------------------------------------------------------- act (input)
  function center(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
  }
  function fire(el, type, x, y, buttons, extra) {
    const ptr = type.startsWith("pointer");
    const C = ptr && typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
    const bubbles = !/enter|leave/.test(type);
    const init = {
      bubbles,
      cancelable: bubbles,
      composed: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x + (window.screenX || 0),
      screenY: y + (window.screenY || 0),
      button: /move|over|enter|leave|out/.test(type) ? (ptr ? -1 : 0) : 0,
      buttons,
      detail: !ptr && /click|down|up/.test(type) ? 1 : 0,
      ...extra,
    };
    if (ptr) Object.assign(init, { pointerId: 1, pointerType: "mouse", isPrimary: true, width: 1, height: 1, pressure: buttons ? 0.5 : 0 });
    return el.dispatchEvent(new C(type, init));
  }
  function hover(el, x, y) {
    fire(el, "pointerover", x, y, 0);
    fire(el, "pointerenter", x, y, 0);
    fire(el, "mouseover", x, y, 0);
    fire(el, "mouseenter", x, y, 0);
    fire(el, "pointermove", x, y, 0);
    fire(el, "mousemove", x, y, 0);
  }
  function focusFor(el) {
    const f = el.closest('button, a[href], input, textarea, select, summary, [tabindex], [contenteditable]:not([contenteditable="false"])');
    if (f && typeof f.focus === "function" && document.activeElement !== f) {
      try {
        f.focus({ preventScroll: true });
      } catch (_) {}
    }
  }
  function doClick(el) {
    const { x, y } = center(el);
    const hit = document.elementFromPoint(x, y);
    const occluded = !!hit && hit !== el && !el.contains(hit);
    hover(el, x, y);
    const down = fire(el, "pointerdown", x, y, 1);
    let md = true;
    if (down) md = fire(el, "mousedown", x, y, 1);
    if (md) focusFor(el);
    fire(el, "pointerup", x, y, 0);
    if (down) fire(el, "mouseup", x, y, 0);
    fire(el, "click", x, y, 0);
    return { how: "pointer", at: [Math.round(x), Math.round(y)], occluded };
  }
  function pressKey(el, key) {
    const code = key === "Enter" ? "Enter" : key;
    const keyCode = key === "Enter" ? 13 : key === "Escape" ? 27 : 0;
    const o = { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true, composed: true };
    const ok = el.dispatchEvent(new KeyboardEvent("keydown", o));
    if (ok && key === "Enter") el.dispatchEvent(new KeyboardEvent("keypress", o));
    el.dispatchEvent(new KeyboardEvent("keyup", o));
  }
  function setNative(el, v) {
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, "value");
    if (d && d.set) d.set.call(el, v);
    else el.value = v;
  }
  function editableHost(el) {
    if (el.getAttribute("contenteditable") !== null && el.getAttribute("contenteditable") !== "false") return el;
    return el.querySelector(EDITABLE) || el.closest(EDITABLE);
  }
  function tiptapOf(host) {
    const pm = host.classList.contains("ProseMirror") ? host : host.closest(".ProseMirror");
    const ed = host.editor || (pm && pm.editor);
    return ed && typeof ed.chain === "function" && !ed.isDestroyed ? ed : null;
  }
  function pmNodes(ed, text) {
    const lines = text.split("\n");
    if (lines.length === 1) return text ? [{ type: "text", text }] : [];
    const nodes = ed.schema && ed.schema.nodes;
    if (nodes && nodes.hardBreak) {
      const out = [];
      lines.forEach((l, i) => {
        if (i) out.push({ type: "hardBreak" });
        if (l) out.push({ type: "text", text: l });
      });
      return out;
    }
    return lines.map((l) => ({ type: "paragraph", content: l ? [{ type: "text", text: l }] : [] }));
  }
  async function doType(el, opts) {
    const text = opts.text == null ? "" : String(opts.text);
    const tag = el.tagName;
    if (tag === "SELECT") return doSelect(el, { value: text });
    if (tag === "INPUT" || tag === "TEXTAREA") {
      try {
        el.focus({ preventScroll: true });
      } catch (_) {}
      const next = opts.append ? el.value + text : text;
      const ok = el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, composed: true, inputType: "insertText", data: text }));
      if (!ok) return { how: "beforeinput-cancelled", error: "cancelled" };
      setNative(el, next);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: text }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      if (opts.submit) pressKey(el, "Enter");
      return { how: "value", length: String(el.value).length };
    }
    const host = editableHost(el);
    if (!host) return { how: "none", error: "not-typable" };
    const ed = tiptapOf(host);
    if (ed) {
      let ch = ed.chain().focus(opts.append ? "end" : undefined);
      if (!opts.append) ch = ed.commands && typeof ed.commands.clearContent === "function" ? ch.clearContent() : ch.selectAll().deleteSelection();
      const nodes = pmNodes(ed, text);
      if (nodes.length) ch = ch.insertContent(nodes.length === 1 ? nodes[0] : nodes);
      ch.run();
      if (opts.submit) pressKey(host, "Enter");
      return { how: "tiptap", length: squash(host.textContent).length };
    }
    try {
      host.focus({ preventScroll: true });
    } catch (_) {}
    const sel = getSelection();
    const rg = document.createRange();
    rg.selectNodeContents(host);
    if (opts.append) rg.collapse(false);
    sel.removeAllRanges();
    sel.addRange(rg);
    let ok = false;
    try {
      ok = text ? document.execCommand("insertText", false, text) : document.execCommand("delete");
    } catch (_) {}
    if (!ok) {
      host.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: text }));
      if (!opts.append) host.textContent = "";
      host.append(document.createTextNode(text));
      host.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    }
    if (opts.submit) pressKey(host, "Enter");
    return { how: ok ? "execCommand" : "dom", length: squash(host.textContent).length };
  }
  const truthy = (v) => v === true || v === 1 || v === "1" || v === "true" || v === "on" || v === "yes";
  async function doToggle(el, opts) {
    const before = boolState(el);
    const want = opts.value == null || opts.value === "" ? null : truthy(opts.value);
    if (want !== null && before === want) return { how: "already", value: before };
    const r = doClick(el);
    await frame();
    return { how: "click", before, value: boolState(el), occluded: r.occluded };
  }
  function visibleOptions(scope) {
    const pool = scope ? scope.querySelectorAll(SEL.options) : document.querySelectorAll(SEL.options);
    return Array.from(pool).filter((o) => {
      const r = o.getBoundingClientRect();
      return r.width >= 1 && r.height >= 1 && rendered(o);
    });
  }
  function pickOption(want, trigger) {
    const id = trigger && trigger.getAttribute("aria-controls");
    const scope = id ? document.getElementById(id) : null;
    const opts = visibleOptions(scope && scope.isConnected ? scope : null);
    const w = norm(want);
    const lab = (o) => norm(labelOf(o, "select"));
    return opts.find((o) => lab(o) === w) || opts.find((o) => lab(o).startsWith(w)) || opts.find((o) => lab(o).includes(w)) || null;
  }
  async function doSelect(el, opts) {
    const want = opts.value == null ? null : String(opts.value);
    if (el.tagName === "SELECT") {
      if (want == null) return { error: "value-required" };
      const list = Array.from(el.options);
      const w = norm(want);
      const o = list.find((x) => x.value === want) || list.find((x) => norm(x.textContent) === w) || list.find((x) => norm(x.textContent).includes(w));
      if (!o) return { error: "no-option", options: list.slice(0, 20).map((x) => squash(x.textContent)) };
      try {
        el.focus({ preventScroll: true });
      } catch (_) {}
      setNative(el, o.value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { how: "value", chose: squash(o.textContent) };
    }
    const role = el.getAttribute("role");
    if (want == null || role === "tab" || role === "option" || role === "treeitem" || role === "menuitemradio") {
      const r = doClick(el);
      return { how: "click", occluded: r.occluded };
    }
    doClick(el);
    const opt = await waitFor(() => pickOption(want, el), 1500);
    if (!opt) return { error: "no-option", options: visibleOptions().slice(0, 20).map((o) => labelOf(o, "select")) };
    // the option itself may be destructive ("Delete" in a menu): same rule as a click on it
    const ol = labelOf(opt, "click");
    const or = riskOf(opt, ol, regionOf(opt, roots()).region, "click");
    if (or.level === "destructive" && opts.confirm !== true) {
      pressKey(opt, "Escape");
      return { error: "confirm-required", reason: "confirm-required", why: or.why, chose: ol, hint: "destructive option: ui.destructive <trigger id> select <option> (the user confirms)" };
    }
    doClick(opt);
    return { how: "popup", chose: labelOf(opt, "select") };
  }
  function fireDrag(el, type, p, dt) {
    const ev = new DragEvent(type, {
      bubbles: true,
      cancelable: type !== "dragleave" && type !== "dragend",
      composed: true,
      view: window,
      clientX: p.x,
      clientY: p.y,
      screenX: p.x,
      screenY: p.y,
      dataTransfer: dt,
    });
    return el.dispatchEvent(ev);
  }
  function targetPoint(to, zone) {
    if (to && typeof to === "object" && "x" in to) return { x: +to.x, y: +to.y };
    const te = resolve(to);
    if (!te) return null;
    const r = te.el.getBoundingClientRect();
    const z = zone || "center";
    const fx = z === "left" ? 0.1 : z === "right" ? 0.9 : 0.5;
    const fy = z === "top" ? 0.1 : z === "bottom" ? 0.9 : 0.5;
    return { x: r.left + r.width * fx, y: r.top + r.height * fy };
  }
  async function doDrag(el, opts) {
    const s = center(el);
    let t;
    if (opts.to != null) {
      t = targetPoint(opts.to, opts.zone);
      if (!t) return { error: "target-not-found" };
    } else t = { x: s.x + (+opts.dx || 0), y: s.y + (+opts.dy || 0) };
    const steps = Math.max(2, Math.min(30, +opts.steps || 10));
    const html5 = opts.mode ? opts.mode === "html5" : el.getAttribute("draggable") === "true";
    const at = (i) => ({ x: s.x + ((t.x - s.x) * i) / steps, y: s.y + ((t.y - s.y) * i) / steps });
    if (html5) {
      const dt = new DataTransfer();
      hover(el, s.x, s.y);
      fire(el, "pointerdown", s.x, s.y, 1);
      fire(el, "mousedown", s.x, s.y, 1);
      if (!fireDrag(el, "dragstart", s, dt)) return { how: "html5", error: "dragstart-cancelled" };
      await frame();
      let over = null;
      for (let i = 1; i <= steps; i++) {
        const p = at(i);
        const hit = document.elementFromPoint(p.x, p.y) || document.body;
        if (hit !== over) {
          if (over) fireDrag(over, "dragleave", p, dt);
          fireDrag(hit, "dragenter", p, dt);
          over = hit;
        }
        fireDrag(hit, "dragover", p, dt);
        fireDrag(el, "drag", p, dt);
        await frame();
      }
      const accepted = over ? !fireDrag(over, "drop", t, dt) : false;
      fireDrag(el, "dragend", t, dt);
      return { how: "html5", dropped: accepted, to: [Math.round(t.x), Math.round(t.y)] };
    }
    hover(el, s.x, s.y);
    const down = fire(el, "pointerdown", s.x, s.y, 1);
    if (down) fire(el, "mousedown", s.x, s.y, 1);
    for (let i = 1; i <= steps; i++) {
      const p = at(i);
      const tgt = opts.target === "hit" ? document.elementFromPoint(p.x, p.y) || el : el;
      fire(tgt, "pointermove", p.x, p.y, 1);
      if (down) fire(tgt, "mousemove", p.x, p.y, 1);
      await frame();
    }
    const endEl = opts.target === "hit" ? document.elementFromPoint(t.x, t.y) || el : el;
    fire(endEl, "pointerup", t.x, t.y, 0);
    if (down) fire(endEl, "mouseup", t.x, t.y, 0);
    return { how: "pointer", to: [Math.round(t.x), Math.round(t.y)] };
  }

  function resolve(id) {
    if (!id) return null;
    if (id instanceof Element) {
      if (id.closest(FOREIGN) || (layer && layer.contains(id))) return null;
      return meta.get(id) || (classify(id) ? index(id, classify(id)) : null);
    }
    const s = String(id).trim();
    let e = byId.get(s) || byId.get(`#${s}`);
    if (e && !e.el.isConnected) {
      drop(e);
      e = null;
    }
    return e || null;
  }
  async function act(id, opts = {}) {
    if (!running) return { ok: false, reason: "disabled" };
    if (typeof opts === "string") opts = { text: opts };
    let e = resolve(id);
    if (!e && opts.fuzzy) {
      const f = find(String(id), { limit: 1 })[0];
      if (f) e = byId.get(f.id);
    }
    if (!e) return { ok: false, id, reason: "not-found", suggestions: find(String(id), { limit: 3 }).map((i) => i.id) };
    const el = e.el;
    const it = itemOf(e, roots(true), innerWidth, innerHeight, true);
    if (!it) return { ok: false, id, reason: "stale" };
    const kind = opts.kind || e.kind;
    const base = { id: e.id, kind, label: it.label, region: it.region, risk: it.risk };
    if (!it.enabled && !opts.force) return { ok: false, ...base, reason: "element-disabled" };
    // typing and then pressing Enter sends (composer, forms): same rule as a send button
    let risk = it.risk;
    let why = it.why;
    if (kind === "type" && opts.submit) {
      risk = "destructive";
      why = "submit";
      base.risk = risk;
    }
    if (risk === "destructive" && opts.confirm !== true)
      return { ok: false, ...base, why, reason: "confirm-required", hint: `destructive target: ui.destructive ${e.id} (the user confirms), or act(id, {confirm: true})` };
    if (it.offscreen) {
      try {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch (_) {}
    }
    let res;
    try {
      if (kind === "click") res = doClick(el);
      else if (kind === "type") res = await doType(el, opts);
      else if (kind === "toggle") res = await doToggle(el, opts);
      else if (kind === "select") res = await doSelect(el, opts);
      else if (kind === "drag") res = await doDrag(el, opts);
      else if (kind === "focus") {
        el.focus();
        res = { how: "focus" };
      } else return { ok: false, ...base, reason: "bad-kind" };
    } catch (x) {
      res = { error: String((x && x.message) || x) };
    }
    const out = { ok: !res.error, ...base, ...res };
    actLog.push({ at: Date.now(), id: e.id, kind, ok: out.ok, how: res.how, error: res.error });
    if (actLog.length > LOG_MAX) actLog.shift();
    return out;
  }

  // ------------------------------------------------------- screenshot hints
  function screenshotHints(opts = {}) {
    const items = liveItems({ inView: true, region: opts.region });
    const box = new Map();
    for (const it of items) {
      const [x, y, w, h] = it.rect;
      const b = box.get(it.region) || [x, y, x + w, y + h];
      box.set(it.region, [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x + w), Math.max(b[3], y + h)]);
    }
    const hints = items.map((it) => ({
      id: it.id,
      label: it.label,
      kind: it.kind,
      risk: it.risk,
      region: it.region,
      center: [Math.round(it.rect[0] + it.rect[2] / 2), Math.round(it.rect[1] + it.rect[3] / 2)],
      rect: it.rect,
    }));
    return {
      viewport: [innerWidth, innerHeight],
      dpr: window.devicePixelRatio || 1,
      regions: Array.from(box, ([name, b]) => ({ name, rect: [b[0], b[1], b[2] - b[0], b[3] - b[1]] })),
      items: hints,
      legend: hints
        .slice(0, 400)
        .map((h) => `${h.id} @${h.center[0]},${h.center[1]} ${h.kind} ${h.risk} "${h.label}"`)
        .join("\n"),
    };
  }

  // ------------------------------------------------------------------ stores
  const GETTER_RE = /^\(\)=>[A-Za-z$_][\w$]*$/;
  const SS = { byName: new Map(), seen: new WeakSet(), mods: new Map(), scan: null, lastEnd: -1e9, fibers: 0 };
  const fiberOf = (n) => {
    if (!n) return null;
    const k = Object.keys(n).find((x) => x.startsWith("__reactFiber$"));
    return k ? n[k] : null;
  };
  const camel = (s) =>
    String(s)
      .toLowerCase()
      .replace(/_+([a-z0-9])/g, (_, c) => c.toUpperCase())
      .replace(/^_+|_+$/g, "");
  function storeName(st) {
    if (Array.isArray(st.workspaces) && typeof st.setActiveNavRoute === "function") return "workspaces";
    if (typeof st.moveToPopup === "function" && "activeByPopup" in st) return "popout";
    if ("placements" in st && "returned" in st) return "placements";
    if (st.phaseStateByKey && typeof st.phaseStateByKey === "object") return "chatPhase";
    if ("chatInputDrafts" in st) return "chatInputDrafts";
    const keys = Object.keys(st);
    const data = keys.find((k) => typeof st[k] !== "function") || keys[0] || "store";
    return String(data).replace(/[^\w$]/g, "") || "store";
  }
  function uniqueName(n) {
    let x = n;
    for (let i = 2; SS.byName.has(x); i++) x = `${n}${i}`;
    return x;
  }
  function addGetter(gs) {
    if (SS.seen.has(gs)) return;
    SS.seen.add(gs);
    let src;
    try {
      src = Function.prototype.toString.call(gs);
    } catch (_) {
      return;
    }
    if (!GETTER_RE.test(src)) return;
    let st;
    try {
      st = gs();
    } catch (_) {
      return;
    }
    if (!isObj(st)) return;
    const name = uniqueName(storeName(st));
    SS.byName.set(name, { name, via: "fiber", get: gs });
  }
  function checkFiber(f) {
    let h = f.memoizedState;
    if (!h || typeof h !== "object" || !("next" in h)) return;
    for (let i = 0; h && i < 400; i++, h = h.next) {
      const m = h.memoizedState;
      const d = Array.isArray(m) && m.length === 2 ? m[1] : null;
      if (!Array.isArray(d) || d.length !== 4 || typeof d[0] !== "function" || typeof d[2] !== "function") continue;
      addGetter(d[0]);
    }
  }
  function scanGlobals() {
    let keys = [];
    try {
      keys = Object.keys(window);
    } catch (_) {}
    for (const k of keys) {
      if (!k.startsWith("__")) continue;
      let v;
      try {
        v = window[k];
      } catch (_) {
        continue;
      }
      if (!v || (typeof v !== "object" && typeof v !== "function")) continue;
      const mm = /^__RE_TEMPO_(.+)__$/.exec(k);
      if (mm) {
        // mods' APIs; not this one, the registry, its pending queue or test configs
        if (!/^(APP_MAP|ACTIONS|ACTIONS_PENDING)$|_CONFIG$/.test(mm[1])) SS.mods.set(camel(mm[1]), { name: camel(mm[1]), key: k });
        continue;
      }
      if (typeof v.getState === "function" && typeof v.subscribe === "function") {
        if (SS.seen.has(v.getState)) continue;
        SS.seen.add(v.getState);
        const name = uniqueName(camel(k.replace(/^_+|_+$/g, "").replace(/_?STORE$/i, "")) || "store");
        SS.byName.set(name, { name, via: "global", key: k, get: () => v.getState() });
        continue;
      }
      const named = { __tempoDocs: "docs", __tempoIssues: "issues", __sourceRepoDataStoreDebug: "sourceRepoData" }[k];
      if (named && !SS.byName.has(named)) SS.byName.set(named, { name: named, via: "global", key: k, get: () => window[k] });
    }
  }
  function startStoreScan() {
    if (SS.scan) return;
    scanGlobals();
    const stack = [];
    for (const sel of [SEL.rail, SEL.center]) {
      for (let f = fiberOf(document.querySelector(sel)), up = 0; f && up < 600; f = f.return, up++) checkFiber(f);
    }
    const root = document.getElementById("root");
    const key = root && Object.keys(root).find((k) => k.startsWith("__reactContainer$"));
    if (key && root[key]) stack.push(root[key]);
    SS.scan = { stack, seen: new WeakSet(), t0: now(), fibers: 0 };
    stats.storeScans++;
    schedule(0);
  }
  function workStores(end) {
    const sc = SS.scan;
    let n = 0;
    while (sc.stack.length) {
      const f = sc.stack.pop();
      if (!f || sc.seen.has(f)) continue;
      sc.seen.add(f);
      sc.fibers++;
      const tg = f.tag;
      if (tg === 0 || tg === 11 || tg === 14 || tg === 15) checkFiber(f);
      if (f.sibling) sc.stack.push(f.sibling);
      if (f.child) sc.stack.push(f.child);
      if ((++n & 63) === 0 && now() > end) return true;
    }
    stats.storeFibers = sc.fibers;
    SS.scan = null;
    SS.lastEnd = now();
    exportDirty = true;
    return false;
  }
  const wsState = () => {
    const r = SS.byName.get("workspaces");
    try {
      return r ? r.get() : null;
    } catch (_) {
      return null;
    }
  };
  function ownFns(obj) {
    const out = [];
    if (!obj || (typeof obj !== "object" && typeof obj !== "function")) return out;
    let ds = {};
    try {
      ds = Object.getOwnPropertyDescriptors(obj);
    } catch (_) {}
    for (const k of Object.keys(ds)) {
      const d = ds[k];
      if (d && typeof d.value === "function") out.push({ fn: k, arity: d.value.length });
    }
    return out;
  }

  // Store calls the mods already make (project-sidebar, pane-dock, canvas-quick,
  // canvas-comment-agent). Params are positional, in this order ("?" = optional).
  const ALLOW = {
    "workspaces.setActiveNavRoute": { params: ["route"], risk: "safe" },
    "workspaces.selectWorkspaceChat": { params: ["workspaceId", "chatId"], risk: "safe" },
    "workspaces.switchToWorkspace": { params: ["workspaceId"], risk: "safe" },
    "workspaces.selectWorkspace": { params: ["workspaceId"], risk: "safe" },
    "workspaces.selectChatTab": { params: ["chatId"], risk: "safe" },
    "workspaces.setActiveCenterTab": { params: ["tabId"], risk: "safe" },
    "workspaces.setPanelActiveTab": { params: ["side", "tabId"], risk: "safe" },
    "workspaces.openDesignTab": { params: ["name", "path"], risk: "safe" },
    "workspaces.openDocTab": { params: ["uri", "title", "route?", "options?"], risk: "safe" },
    "workspaces.openIssueTab": { params: ["issueId", "title?"], risk: "safe" },
    "workspaces.openAgentTab": { params: ["agentId", "name?"], risk: "safe" },
    "workspaces.openDocCallback": { params: ["docId"], risk: "safe" },
    "workspaces.openIssueCallback": { params: ["issueId"], risk: "safe" },
    "workspaces.createChatTab": { params: ["options?"], risk: "caution" },
    "workspaces.createChatTabInWorkspace": { params: ["workspaceId"], risk: "caution" },
    "workspaces.createChatTabWithMessage": { params: ["prompt", "options?"], risk: "destructive" }, // sends the prompt
    "workspaces.pinTab": { params: ["tabId"], risk: "caution" },
    "workspaces.closeChatTab": { params: ["chatId"], risk: "destructive" },
    "agentsRoute.openAgent": { params: ["agentId"], risk: "safe" },
    "docs.selectDoc": { params: ["docId"], risk: "safe" },
    "issues.selectIssue": { params: ["issueId"], risk: "safe" },
  };
  const paramDefs = (list) =>
    list.map((p) => ({ name: p.replace(/\?$/, ""), type: /options/.test(p) ? "object" : "string", required: !p.endsWith("?") }));
  function stores() {
    const out = [];
    for (const rec of SS.byName.values()) {
      let st = null;
      try {
        st = rec.get();
      } catch (_) {}
      const fns = ownFns(st);
      out.push({
        name: rec.name,
        via: rec.via,
        key: rec.key,
        actions: fns.map((f) => {
          const a = ALLOW[`${rec.name}.${f.fn}`];
          const g = a ? null : guessRiskWords(norm(splitCamel(f.fn)));
          return {
            id: `store.${rec.name}.${f.fn}`,
            arity: f.arity,
            exec: a ? "allow" : "manual",
            risk: a ? a.risk : g ? g.level : "safe",
            params: a ? paramDefs(a.params) : undefined,
          };
        }),
      });
    }
    for (const m of SS.mods.values()) {
      const fns = ownFns(window[m.key]);
      out.push({
        name: `mod.${m.name}`,
        via: "mod",
        key: m.key,
        actions: fns.map((f) => {
          const g = guessRiskWords(norm(splitCamel(f.fn)));
          return { id: `mod.${m.name}.${f.fn}`, arity: f.arity, exec: "manual", risk: g ? g.level : "safe" };
        }),
      });
    }
    return out;
  }
  async function runStore(id, args = [], opts = {}) {
    const m = /^store\.([^.]+)\.(.+)$/.exec(String(id));
    if (!m) return { ok: false, id, reason: "bad-id" };
    const a = ALLOW[`${m[1]}.${m[2]}`];
    if (!a) return { ok: false, id, reason: "manual", note: "not in the allowlist: drive the UI with ui.click / ui.type" };
    if (a.risk === "destructive" && opts.confirm !== true) return { ok: false, id, risk: a.risk, reason: "confirm-required" };
    const rec = SS.byName.get(m[1]);
    if (!rec) {
      startStoreScan();
      return { ok: false, id, reason: "store-not-found" };
    }
    let st;
    try {
      st = rec.get();
    } catch (_) {}
    const fn = st && st[m[2]];
    if (typeof fn !== "function") return { ok: false, id, reason: "no-function" };
    try {
      let r = fn.apply(st, Array.isArray(args) ? args : [args]);
      if (r && typeof r.then === "function") r = await Promise.race([r, sleep(10000).then(() => "[pending]")]);
      return { ok: true, id, risk: a.risk, result: brief(r) };
    } catch (x) {
      return { ok: false, id, reason: "threw", error: String((x && x.message) || x) };
    }
  }

  // ---------------------------------------------------- high-level (app.*)
  const PS = () => window.__RE_TEMPO_PROJECT_SIDEBAR__ || null;
  const PD = () => window.__RE_TEMPO_PANE_DOCK__ || null;
  const RM = () => window.__RE_TEMPO_RAIL_MENU__ || null;
  const st0 = () => wsState() || {};
  const tabLabel = (t) => {
    switch (t && t.type) {
      case "chat":
        return t.name || "Chat";
      case "canvas":
        return t.pageName;
      case "file":
        return t.fileName;
      case "prd":
        return t.displayTitle || String(t.fileName || "").replace(/\.md$/i, "");
      case "terminal":
        return t.title;
      case "browser":
        return t.title || "Browser";
      case "issue":
        return t.issueTitle;
      case "agent":
        return t.agentName;
      default:
        return (t && (t.title || t.name)) || "Tab";
    }
  };
  async function goRoute(route) {
    route = String(route || "").toLowerCase();
    if (route === "settings") return openSettings();
    const ps = PS();
    if (ps && ps.open && typeof ps.open.route === "function") return { ok: true, via: "project-sidebar", how: ps.open.route(route) };
    const st = wsState();
    if (st && st.activeNavRoute === route) return { ok: true, how: "already" };
    const btn = document.querySelector(`[data-testid="workspace-navbar-${CSS.escape(route)}-button"]`);
    if (btn) {
      btn.click();
      const after = wsState();
      if (!after || after.activeNavRoute === route) return { ok: true, how: "rail-click" };
    }
    if (st && typeof st.setActiveNavRoute === "function") {
      st.setActiveNavRoute(route);
      return { ok: true, how: "store" };
    }
    return { ok: false, reason: "no-route-path" };
  }
  async function openSettings(section) {
    let how = null;
    const rm = RM();
    if (rm && typeof rm.run === "function") {
      try {
        rm.run("settings");
        how = "rail-menu";
      } catch (_) {}
    }
    if (!how) {
      const gear = Array.from(document.querySelectorAll('button[aria-label="Settings"]')).find((b) => !(layer && layer.contains(b)));
      if (gear) {
        gear.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true, view: window }));
        how = "gear";
      }
    }
    if (!how) {
      const st = wsState();
      if (st && typeof st.setActiveNavRoute === "function") {
        st.setActiveNavRoute("settings");
        how = "store";
      }
    }
    if (!how) return { ok: false, reason: "no-settings-path" };
    if (!section) return { ok: true, how };
    const shell = await waitFor(() => findSettings(), 2500);
    if (!shell) return { ok: false, how, reason: "settings-not-shown" };
    const w = norm(section);
    const btn = Array.from(shell.querySelectorAll("button, [role=tab], a")).find((b) => norm(b.textContent) === w) ||
      Array.from(shell.querySelectorAll("button, [role=tab], a")).find((b) => norm(b.textContent).includes(w));
    if (!btn) return { ok: false, how, reason: "no-section" };
    doClick(btn);
    return { ok: true, how, section: squash(btn.textContent) };
  }
  function composerEditor(id) {
    if (id) {
      const e = resolve(id);
      return e ? editableHost(e.el) || e.el : null;
    }
    const eds = Array.from(document.querySelectorAll(SEL.editor)).filter((x) => {
      const r = x.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && rendered(x);
    });
    return eds.find((x) => !x.closest(SEL.pane)) || eds[0] || null;
  }
  async function sendPrompt({ text, id, submit = true, append = false } = {}) {
    const ed = composerEditor(id);
    if (!ed) return { ok: false, reason: "no-composer" };
    const t = await doType(ed, { text: String(text == null ? "" : text), append });
    if (t.error) return { ok: false, reason: t.error };
    if (!submit) return { ok: true, how: t.how, sent: false };
    await frame();
    const box = roots(true).composers.find((c) => c.contains(ed));
    const btn = box && box.querySelector(SEL.send);
    if (btn && enabledOf(btn)) {
      doClick(btn);
      return { ok: true, how: t.how, sent: true, via: "send-button" };
    }
    pressKey(ed, "Enter");
    return { ok: true, how: t.how, sent: true, via: "enter" };
  }
  function appState() {
    const st = wsState();
    const pd = PD();
    let panes = null;
    try {
      panes = pd ? pd.panels.map((p) => ({ id: p.id, tabs: p.tabs, active: p.active })) : null;
    } catch (_) {}
    return {
      route: st ? st.activeNavRoute : null,
      workspaceId: st ? st.selectedWorkspaceId : null,
      activeChatTabId: st ? st.activeChatTabId : null,
      activeCenterTabId: st ? st.activeCenterTabId : null,
      workspaces: st && Array.isArray(st.workspaces) ? st.workspaces.slice(0, 40).map((w) => ({ id: w.id, name: w.name || w.title || (w.repo && w.repo.currentBranch) || null })) : null,
      panes,
      mods: Array.from(SS.mods.keys()),
    };
  }
  function appTabs() {
    const st = wsState();
    if (!st) return { ok: false, reason: "store-not-found" };
    const tabs = Array.isArray(st.centerTabs) ? st.centerTabs : [];
    return tabs.slice(0, 200).map((t) => ({ id: t.id, type: t.type, label: tabLabel(t), active: t.id === st.activeCenterTabId || t.id === st.activeChatTabId }));
  }
  const need = (fn, reason) => (typeof fn === "function" ? null : { ok: false, reason });

  // param: {name, type, required}
  const P = (name, type = "string", required = true, extra) => ({ name, type, required, ...(extra || {}) });
  const APP = [
    { id: "app.state", label: "App state (route, workspace, active tabs, panes)", params: [], risk: "safe", run: () => appState() },
    { id: "app.tabs", label: "Center tabs of the selected workspace", params: [], risk: "safe", run: () => appTabs() },
    {
      id: "app.route",
      label: "Go to a route (chat, design, docs, issues, agents, settings)",
      params: [P("route", "string", true, { enum: ["chat", "design", "docs", "issues", "agents", "settings"] })],
      risk: "safe",
      run: (a) => goRoute(a.route),
    },
    { id: "app.openSettings", label: "Open Settings (optionally a section)", params: [P("section", "string", false)], risk: "safe", run: (a) => openSettings(a.section) },
    {
      id: "app.openChat",
      label: "Open a chat of a workspace",
      params: [P("workspaceId"), P("chatId")],
      risk: "safe",
      run: (a) => {
        const ps = PS();
        if (ps && ps.open && ps.open.chat) return { ok: true, how: ps.open.chat(a.workspaceId, a.chatId) };
        return runStore("store.workspaces.selectWorkspaceChat", [a.workspaceId, a.chatId]);
      },
    },
    {
      id: "app.openBranch",
      label: "Switch to a workspace (branch)",
      params: [P("workspaceId")],
      risk: "safe",
      run: (a) => {
        const ps = PS();
        if (ps && ps.open && ps.open.branch) return { ok: true, how: ps.open.branch(a.workspaceId) };
        return runStore("store.workspaces.switchToWorkspace", [a.workspaceId]);
      },
    },
    {
      id: "app.newChat",
      label: "New chat (in a workspace or the selected one)",
      params: [P("workspaceId", "string", false)],
      risk: "caution",
      run: async (a) => {
        const ps = PS();
        if (ps && ps.open && ps.open.newChat) return { ok: true, how: await ps.open.newChat(a.workspaceId) };
        return a.workspaceId ? runStore("store.workspaces.createChatTabInWorkspace", [a.workspaceId]) : runStore("store.workspaces.createChatTab", []);
      },
    },
    {
      id: "app.openCanvas",
      label: "Open a canvas",
      params: [P("name"), P("path"), P("workspaceId", "string", false)],
      risk: "safe",
      run: async (a) => {
        const ps = PS();
        const ws = a.workspaceId || st0().selectedWorkspaceId;
        if (ps && ps.open && ps.open.canvas) return { ok: true, how: await ps.open.canvas({ name: a.name, path: a.path, wsId: ws }) };
        return runStore("store.workspaces.openDesignTab", [a.name, a.path]);
      },
    },
    {
      id: "app.openDoc",
      label: "Open a doc (asTab: beside the chat)",
      params: [P("docId"), P("title", "string", false), P("asTab", "boolean", false)],
      risk: "safe",
      run: async (a) => {
        const ps = PS();
        if (ps && ps.open && ps.open.doc) return { ok: true, how: await ps.open.doc({ _id: a.docId, title: a.title }, truthy(a.asTab)) };
        return runStore("store.workspaces.openDocTab", [`convex://docs/${a.docId}`, a.title || "Untitled", "chat", { displayTitle: a.title || "Untitled" }]);
      },
    },
    {
      id: "app.openIssue",
      label: "Open an issue (asTab: beside the chat)",
      params: [P("issueId"), P("title", "string", false), P("asTab", "boolean", false)],
      risk: "safe",
      run: async (a) => {
        const ps = PS();
        if (ps && ps.open && ps.open.issue) return { ok: true, how: await ps.open.issue({ _id: a.issueId, title: a.title }, truthy(a.asTab)) };
        return runStore("store.workspaces.openIssueTab", [a.issueId, a.title]);
      },
    },
    {
      id: "app.openAgent",
      label: "Open an agent (asTab: beside the chat)",
      params: [P("agentId"), P("name", "string", false), P("asTab", "boolean", false)],
      risk: "safe",
      run: (a) => {
        const ps = PS();
        if (ps && ps.open && ps.open.agent) return { ok: true, how: ps.open.agent({ _id: a.agentId, name: a.name }, truthy(a.asTab)) };
        return runStore("store.agentsRoute.openAgent", [a.agentId]);
      },
    },
    { id: "app.selectTab", label: "Bring a center tab forward", params: [P("tabId")], risk: "safe", run: (a) => runStore("store.workspaces.setActiveCenterTab", [a.tabId]) },
    {
      id: "app.sendPrompt",
      label: "Type a prompt into the visible composer and send it (the user confirms)",
      params: [P("text")],
      rest: "text",
      risk: "destructive",
      target: () => composerEditor(),
      run: (a, c) => (c && c.approved ? sendPrompt({ text: a.text, id: a.id, submit: true }) : { ok: false, reason: "confirm-required" }),
    },
    {
      id: "app.draftPrompt",
      label: "Type a prompt into the visible composer without sending it",
      params: [P("text")],
      rest: "text",
      risk: "caution",
      target: () => composerEditor(),
      run: (a) => sendPrompt({ text: a.text, id: a.id, submit: false }),
    },
    { id: "app.panes", label: "Panes of the free layout (pane-dock)", params: [], risk: "safe", run: () => (PD() ? PD().panels : { ok: false, reason: "no-pane-dock" }) },
    {
      id: "app.split",
      label: "Move a tab into a split (zone: right, left, top, bottom, center)",
      params: [P("tabId"), P("zone", "string", false, { enum: ["right", "left", "top", "bottom", "center"] }), P("target", "string", false)],
      risk: "safe",
      run: (a) => need(PD() && PD().split, "no-pane-dock") || { ok: !!PD().split(a.tabId, a.zone || "right", a.target || "main") },
    },
    {
      id: "app.splitPane",
      label: "A pane's 'Open in split view' (copy: duplicate a canvas)",
      params: [P("panelId"), P("copy", "boolean", false)],
      risk: "safe",
      run: (a) => need(PD() && PD().splitPane, "no-pane-dock") || { ok: !!PD().splitPane(a.panelId, truthy(a.copy)) },
    },
    {
      id: "app.duplicate",
      label: "Second tab of an open canvas, placed like a split",
      params: [P("tabId"), P("zone", "string", false), P("target", "string", false)],
      risk: "caution",
      run: (a) => need(PD() && PD().duplicate, "no-pane-dock") || { ok: !!PD().duplicate(a.tabId, a.zone || "right", a.target || "main") },
    },
    {
      id: "app.layoutReset",
      label: "Every tab back to the center, layout cleared",
      params: [],
      risk: "destructive",
      run: () => need(PD() && PD().reset, "no-pane-dock") || (PD().reset(), { ok: true }),
    },
    { id: "app.layoutUndo", label: "Undo the last layout change", params: [], risk: "caution", run: () => need(PD() && PD().undo, "no-pane-dock") || { ok: !!PD().undo() } },
    { id: "app.layoutRedo", label: "Redo a layout change", params: [], risk: "caution", run: () => need(PD() && PD().redo, "no-pane-dock") || { ok: !!PD().redo() } },
  ];

  // ------------------------------------------------------------------ registry
  // Object args as they are; positional (CLI style) args by param order. The
  // `rest` param takes every remaining word ("ui.type <id> <text...>"); ui-drive
  // does the same for the last string param, so `rest` is always the last one.
  function argsOf(a, rest, names, restName) {
    if (isObj(a)) return a;
    const arr = Array.isArray(a) ? a.slice() : [a, ...rest].filter((x) => x !== undefined);
    const o = {};
    const ri = restName ? names.indexOf(restName) : -1;
    names.forEach((n, i) => {
      if (ri >= 0 && i >= ri) return;
      if (arr[i] !== undefined) o[n] = arr[i];
    });
    if (ri >= 0 && arr.length > ri) o[restName] = arr.slice(ri).join(" ");
    else if (ri < 0 && arr.length > names.length && names.length) o[names[names.length - 1]] = arr.slice(names.length - 1).join(" ");
    return o;
  }
  const elFor = (id) => {
    const e = id ? resolve(id) : null;
    return e && e.el.isConnected ? e.el : null;
  };
  const labFor = (id) => {
    const e = id ? resolve(id) : null;
    return e ? labelOf(e.el, e.kind) : String(id || "");
  };
  const q = (s) => `“${clip(String(s), 40)}”`;
  const findRow = (it) => ({ id: it.id, label: it.label, kind: it.kind, region: it.region, risk: it.risk, enabled: it.enabled, rect: it.rect, score: it.score });
  function mapCompact(region, limit = 300) {
    const sn = snapshot({ region: region || null });
    const cols = ["id", "kind", "label", "region", "risk", "rect", "state"];
    return {
      route: sn.route,
      count: sn.count,
      regions: sn.regions,
      cols,
      items: (sn.items || []).slice(0, limit).map((it) => cols.map((c) => (it[c] === undefined ? null : it[c]))),
      more: Math.max(0, sn.count - limit),
    };
  }
  // ui.click / type / toggle / select / drag never act on a destructive target:
  // ui.destructive does (registered as destructive, so ui-drive asks the user).
  // A key on an element. Enter / Space activate a focused control (its own risk
  // applies) and Enter in a text field or editor submits it (composer: sends):
  // both are destructive when the target is, and need the user's Allow.
  function keyOn(id, key, approved) {
    const e = resolve(id);
    if (!e || !e.el.isConnected) return { ok: false, id, reason: "not-found" };
    key = key || "Enter";
    const it = itemOf(e, roots(true), innerWidth, innerHeight, true);
    if (!it) return { ok: false, id, reason: "stale" };
    let risk = "safe";
    let why = null;
    if (key === "Enter" || key === " " || key === "Space") {
      if (it.risk === "destructive") {
        risk = "destructive";
        why = it.why;
      } else if (key === "Enter" && e.kind === "type" && (it.region === "composer" || e.el.tagName !== "INPUT" || e.el.form)) {
        risk = "destructive";
        why = "submit";
      }
    }
    if (risk === "destructive" && !approved)
      return { ok: false, id: e.id, label: it.label, risk, why, reason: "confirm-required", hint: `ui.destructive ${e.id} key ${key} (the user confirms)` };
    try {
      e.el.focus({ preventScroll: true });
    } catch (_) {}
    pressKey(e.el, key === "Space" ? " " : key);
    actLog.push({ at: Date.now(), id: e.id, kind: "key", ok: true, how: key });
    if (actLog.length > LOG_MAX) actLog.shift();
    return { ok: true, id: e.id, key, risk };
  }
  const UI = [
    {
      id: "ui.click",
      label: "Click an element of the app map (by id)",
      say: (a) => `Clicking ${q(labFor(a.id))}`,
      params: [P("id")],
      rest: "id",
      risk: "caution",
      target: (a) => elFor(a.id),
      run: (a) => act(a.id, { kind: "click" }),
    },
    {
      id: "ui.type",
      label: "Type text into an input, textarea or editor (replaces its text)",
      say: (a) => `Typing into ${q(labFor(a.id))}`,
      params: [P("id"), P("text")],
      rest: "text",
      risk: "caution",
      target: (a) => elFor(a.id),
      run: (a) => act(a.id, { kind: "type", text: a.text }), // never submits: ui.destructive <id> submit <text>
    },
    {
      id: "ui.key",
      label: "Press a key on an element (Enter, Escape, Tab, ArrowDown, ArrowUp, Backspace)",
      say: (a) => `Pressing ${a.key || "Enter"} on ${q(labFor(a.id))}`,
      params: [P("id"), P("key", "string", false, { enum: ["Enter", "Escape", "Tab", "ArrowDown", "ArrowUp", "Backspace"] })],
      risk: "caution",
      target: (a) => elFor(a.id),
      run: (a) => keyOn(a.id, a.key, false),
    },
    {
      id: "ui.toggle",
      label: "Toggle a switch / checkbox / pressed button (value on|off sets it)",
      say: (a) => `Toggling ${q(labFor(a.id))}`,
      params: [P("id"), P("value", "string", false, { enum: ["on", "off"] })],
      risk: "caution",
      target: (a) => elFor(a.id),
      run: (a) => act(a.id, { kind: "toggle", value: a.value }),
    },
    {
      id: "ui.select",
      label: "Pick an option: <select>, combobox / menu trigger (by option text), tab",
      say: (a) => `Picking ${q(a.value || labFor(a.id))}`,
      params: [P("id"), P("value", "string", false)],
      rest: "value",
      risk: "caution",
      target: (a) => elFor(a.id),
      run: (a) => act(a.id, { kind: "select", value: a.value }),
    },
    {
      id: "ui.drag",
      label: "Drag an element onto another id (zone: left, right, top, bottom, center) or by dx, dy",
      say: (a) => `Dragging ${q(labFor(a.id))}`,
      params: [P("id"), P("to", "string", false), P("zone", "string", false, { enum: ["center", "left", "right", "top", "bottom"] }), P("dx", "number", false), P("dy", "number", false)],
      risk: "caution",
      target: (a) => elFor(a.id),
      run: (a) => act(a.id, { kind: "drag", to: a.to || null, zone: a.zone, dx: a.dx, dy: a.dy }),
    },
    {
      id: "ui.destructive",
      label: "Act on a destructive element (delete, close, reset, archive, deploy...): the user confirms",
      say: (a) => `${a.kind && a.kind !== "click" ? a.kind : "Clicking"} ${q(labFor(a.id))} (destructive)`,
      params: [P("id"), P("kind", "string", false, { enum: ["click", "type", "toggle", "select", "key", "submit"] }), P("value", "string", false)],
      rest: "value",
      risk: "destructive",
      target: (a) => elFor(a.id),
      run: (a, c) => {
        if (!(c && c.approved)) return { ok: false, id: a.id, reason: "confirm-required" };
        if (a.kind === "key") return keyOn(a.id, a.value || "Enter", true);
        if (a.kind === "submit") return act(a.id, { kind: "type", text: a.value, submit: true, confirm: true });
        return act(a.id, { kind: a.kind || undefined, text: a.value, value: a.value, confirm: true });
      },
    },
    {
      id: "ui.find",
      label: "Find elements by words (fuzzy over label, id, region; 'region:x' filters)",
      say: (a) => `Looking for ${q(a.query || "")}`,
      params: [P("query")],
      rest: "query",
      risk: "safe",
      run: (a) => find(a.query || "", { limit: 10 }).map(findRow),
    },
    {
      id: "ui.map",
      label: "The visible app map (ids, kinds, labels, regions, risk), optionally one region",
      params: [P("region", "string", false)],
      risk: "safe",
      run: (a) => mapCompact(a.region),
    },
    { id: "ui.hints", label: "Ids with screen coordinates (to read a screenshot)", params: [], risk: "safe", run: () => screenshotHints() },
    { id: "ui.export", label: "Export the map to ~/.tempo/app-map.json", params: [], risk: "safe", run: () => {
      const sz = bytes(exportMap());
      return { ok: true, bytes: sz, path: lastExport && lastExport.path };
    } },
  ];
  function storeActionDefs() {
    const out = [];
    for (const [key, a] of Object.entries(ALLOW)) {
      const [name, fn] = key.split(".");
      const rec = SS.byName.get(name);
      let st = null;
      try {
        st = rec ? rec.get() : null;
      } catch (_) {}
      if (!st || typeof st[fn] !== "function") continue;
      const names = a.params.map((p) => p.replace(/\?$/, ""));
      out.push({
        id: `store.${key}`,
        label: `${name}.${fn}(${a.params.join(", ")}) (app store)`,
        params: paramDefs(a.params),
        risk: a.risk,
        names,
        run: (o, c) => {
          const args = names.map((n) => o[n]);
          while (args.length && args[args.length - 1] === undefined) args.pop();
          return runStore(`store.${key}`, args, { confirm: !!(c && c.approved) });
        },
      });
    }
    return out;
  }
  function actionDefs() {
    return [...UI, ...APP, ...storeActionDefs()];
  }
  function actions() {
    return actionDefs().map((a) => ({ id: a.id, label: a.label, params: a.params, rest: a.rest, risk: a.risk, kind: a.id.split(".")[0] }));
  }
  // Direct API: a destructive action runs only with {confirm: true}.
  async function runAction(id, a, ...rest) {
    const def = actionDefs().find((x) => x.id === id);
    if (!def) return { ok: false, id, reason: "unknown-action" };
    const names = def.names || def.params.map((p) => p.name);
    const o = argsOf(a, rest, names, def.rest);
    const approved = truthy(o.confirm);
    if (def.risk === "destructive" && !approved) return { ok: false, id, risk: "destructive", reason: "confirm-required" };
    try {
      return await def.run(o, { approved });
    } catch (x) {
      return { ok: false, id, reason: "threw", error: String((x && x.message) || x) };
    }
  }
  // ui-drive spec: {label, description, params, risk, kind, owner, target, run}.
  // ui-drive runs a destructive action only after the user's explicit Allow, so
  // the run of a destructive spec counts as approved.
  function specOf(def) {
    const names = def.names || def.params.map((p) => p.name);
    return {
      label: def.say
        ? (a) => {
            try {
              return def.say(a || {});
            } catch (_) {
              return def.label;
            }
          }
        : def.label,
      description: def.label,
      params: def.params,
      risk: def.risk,
      kind: def.id.split(".")[0],
      owner: "app-map",
      target: def.target
        ? (a) => {
            try {
              return def.target(a || {});
            } catch (_) {
              return null;
            }
          }
        : undefined,
      run: async (a, ...rest) => {
        const o = isObj(a) ? a : argsOf(a, rest, names, def.rest);
        const r = await def.run(o, { approved: def.risk === "destructive" });
        if (r && typeof r === "object" && r.ok === false && !r.reason) r.reason = r.error || "failed";
        return r;
      },
    };
  }
  let registry = null;
  const registered = new Set();
  const pendingPushed = new Set();
  function registerAll() {
    const reg = window.__RE_TEMPO_ACTIONS__;
    const defs = actionDefs();
    if (!reg || typeof reg.register !== "function") {
      // ui-drive not loaded yet: its pending queue registers these when it starts
      let pend = window.__RE_TEMPO_ACTIONS_PENDING__;
      if (pend == null) pend = window.__RE_TEMPO_ACTIONS_PENDING__ = [];
      if (pend && typeof pend.push === "function") {
        for (const def of defs) {
          if (pendingPushed.has(def.id)) continue;
          try {
            pend.push([def.id, specOf(def)]);
            pendingPushed.add(def.id);
          } catch (_) {}
        }
      }
      return false;
    }
    if (reg !== registry) {
      registry = reg;
      registered.clear();
    }
    for (const def of defs) {
      if (registered.has(def.id)) continue;
      try {
        if (reg.register(def.id, specOf(def)) !== false) registered.add(def.id);
        else err(`register ${def.id}`, "refused");
      } catch (x) {
        err(`register ${def.id}`, x);
      }
    }
    return true;
  }
  function unregisterAll() {
    const reg = window.__RE_TEMPO_ACTIONS__;
    if (reg && reg === registry && typeof reg.unregister === "function") for (const id of registered) {
      try {
        reg.unregister(id);
      } catch (_) {}
    }
    registered.clear();
    registry = null;
    const pend = window.__RE_TEMPO_ACTIONS_PENDING__;
    if (Array.isArray(pend)) {
      for (let i = pend.length - 1; i >= 0; i--) if (Array.isArray(pend[i]) && pendingPushed.has(pend[i][0])) pend.splice(i, 1);
    }
    pendingPushed.clear();
  }

  // ------------------------------------------------------------------- export
  let exportDirty = true;
  let autoBusy = false;
  let lastWriteAt = -1e9;
  let lastExport = null;
  let homeCache = null;
  const bytes = (s) => (typeof TextEncoder === "function" ? new TextEncoder().encode(s).length : s.length);
  async function exportPath() {
    const o = (lsGet(EXPORT_PATH_KEY) || "").trim();
    if (o) return o;
    if (!homeCache) {
      let home = (lsGet(HOME_KEY) || "").trim().replace(/\/+$/, "");
      if (!home) {
        const api = window.electronAPI;
        try {
          const r = api && api.workspaces && typeof api.workspaces.getHomeDir === "function" ? await api.workspaces.getHomeDir() : null;
          const h = r && typeof r === "object" ? (r.success ? r.data : null) : r;
          if (typeof h === "string" && h) {
            const m = /^\/Users\/[^/]+/.exec(h);
            home = m ? m[0] : h.replace(/\/+$/, "");
          }
        } catch (_) {}
      }
      homeCache = home || null;
    }
    return homeCache ? `${homeCache}/.tempo/app-map.json` : null;
  }
  const diskOn = () => lsGet(EXPORT_FLAG) === "on";
  async function writeExport(json) {
    if (!diskOn()) return { wrote: false, reason: 'export flag off (localStorage "rtd.appMap.export" = "on" writes)' };
    const fs = window.electronAPI && window.electronAPI.fs;
    if (!fs || typeof fs.writeFile !== "function") return { wrote: false, reason: "no-fs-bridge" };
    const path = await exportPath();
    if (!path) return { wrote: false, reason: "no-home" };
    try {
      const r = await fs.writeFile(path, json);
      if (r && r.success === false) return { wrote: false, path, reason: r.error || "write-failed" };
      lastWriteAt = now();
      return { wrote: true, path };
    } catch (x) {
      return { wrote: false, path, reason: String((x && x.message) || x) };
    }
  }
  // Never "value": what the user typed stays in memory (snapshot()), not on disk.
  const COLS = ["id", "kind", "label", "region", "rect", "enabled", "risk", "role", "testid", "state", "pane", "offscreen", "why"];
  function exportMap(opts = {}) {
    if (!running) return JSON.stringify({ v: VERSION, enabled: false });
    const snap = snapshot({ items: opts.items });
    const row = (it, labelMax) => COLS.map((c) => (c === "label" ? clip(it.label, labelMax) : it[c] === undefined ? null : it[c]));
    const trim = (r) => {
      while (r.length && r[r.length - 1] === null) r.pop();
      return r;
    };
    let items = snap.items;
    let labelMax = LABEL_MAX;
    let manual = true;
    const build = () => {
      const st = stores().map((s) => ({
        name: s.name,
        via: s.via,
        actions: s.actions.filter((a) => manual || a.exec === "allow").map((a) => (a.exec === "allow" ? [a.id, a.arity, a.exec, a.risk, a.params.map((p) => p.name)] : [a.id, a.arity, a.exec, a.risk])),
      }));
      return JSON.stringify({
        v: VERSION,
        app: "re-tempo",
        at: new Date(snap.at).toISOString(),
        route: snap.route,
        viewport: snap.viewport,
        regions: snap.regions,
        cols: COLS,
        items: items.map((it) => trim(row(it, labelMax))),
        stores: st,
        actions: actions().map((a) => [a.id, a.risk, a.params.map((p) => (p.required ? p.name : `${p.name}?`))]),
      });
    };
    let s = build();
    let size = bytes(s);
    if (size > EXPORT_MAX) {
      items = items.filter((it) => !it.offscreen);
      s = build();
      size = bytes(s);
    }
    if (size > EXPORT_MAX) {
      labelMax = 24;
      s = build();
      size = bytes(s);
    }
    if (size > EXPORT_MAX) {
      manual = false;
      s = build();
      size = bytes(s);
    }
    while (size > EXPORT_MAX && items.length) {
      items = items.slice(0, Math.floor(items.length * 0.85));
      s = build();
      size = bytes(s);
    }
    lastExport = { at: Date.now(), bytes: size, items: items.length, of: snap.items.length, wrote: null, path: null };
    if (opts.write !== false) {
      const rec = lastExport;
      writeExport(s).then((r) => {
        if (r.wrote) exportDirty = false;
        rec.wrote = r.wrote;
        rec.path = r.path || null;
        if (!r.wrote) rec.reason = r.reason;
      });
    }
    return s;
  }

  // -------------------------------------------------------------- debug overlay
  const dbg = { on: false, raf: 0 };
  function drawOverlay() {
    if (!dbg.on) return;
    if (!layer || !layer.isConnected) {
      layer = document.createElement("div");
      layer.setAttribute("data-rtam-root", "");
      layer.className = "rtam-layer";
      (document.body || document.documentElement).appendChild(layer);
    }
    const items = liveItems({ inView: true }).slice(0, OVERLAY_MAX);
    const frag = document.createDocumentFragment();
    for (const it of items) {
      const [x, y, w, h] = it.rect;
      const b = document.createElement("div");
      b.className = "rtam-box";
      b.dataset.risk = it.risk;
      if (!it.enabled) b.dataset.off = "";
      b.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
      const t = document.createElement("span");
      t.className = y < 14 ? "rtam-tag rtam-tag-in" : "rtam-tag";
      t.textContent = it.id;
      b.appendChild(t);
      frag.appendChild(b);
    }
    const leg = document.createElement("div");
    leg.className = "rtam-legend";
    const counts = { safe: 0, caution: 0, destructive: 0 };
    for (const it of items) counts[it.risk]++;
    leg.textContent = `app-map · ${items.length} on screen · ${byId.size} indexed · safe ${counts.safe} · caution ${counts.caution} · destructive ${counts.destructive}`;
    frag.appendChild(leg);
    layer.replaceChildren(frag);
  }
  function onScrollOrResize() {
    if (!dbg.on || dbg.raf) return;
    dbg.raf = requestAnimationFrame(() => {
      dbg.raf = 0;
      drawOverlay();
    });
  }
  function debug(on = true) {
    dbg.on = !!on && running;
    if (dbg.on) {
      window.addEventListener("scroll", onScrollOrResize, true);
      window.addEventListener("resize", onScrollOrResize);
      drawOverlay();
    } else {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      if (layer) layer.remove();
      layer = null;
    }
    return dbg.on;
  }

  // ------------------------------------------------------------- lifecycle
  function housekeep() {
    if (!running) return;
    const reg = window.__RE_TEMPO_ACTIONS__;
    if (reg !== registry || (reg ? registered.size : pendingPushed.size) < actionDefs().length) registerAll();
    if (document.hidden) return;
    const t = now();
    if (!propsKey && findPropsKey()) schedule(0);
    if (mutatedSinceFull && t - lastFullAt > FULL_EVERY_MS && !fullRunning) {
      needFull = true;
      schedule(0);
    }
    if (!SS.scan && t - SS.lastEnd > STORE_EVERY_MS) startStoreScan();
    if (exportDirty && diskOn() && t - lastWriteAt > AUTO_EXPORT_MS) {
      const fs = window.electronAPI && window.electronAPI.fs;
      if (fs && typeof fs.writeFile === "function" && !rafId && !autoBusy) {
        autoBusy = true;
        lastWriteAt = t;
        liveItemsSliced()
          .then((items) => {
            if (running) exportMap({ write: true, items });
          })
          .catch((x) => err("auto-export", x))
          .finally(() => {
            autoBusy = false;
          });
      }
    }
  }
  const onActionsReady = () => registerAll();
  function start() {
    if (running || disposed) return;
    running = true;
    findPropsKey();
    mo = new MutationObserver(onMutations);
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: OBSERVED_ATTRS });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("rtd:actions-ready", onActionsReady);
    house = setInterval(housekeep, HOUSEKEEP_MS);
    needFull = true;
    registerAll();
    setTimeout(() => running && startStoreScan(), 300);
    schedule(0);
  }
  function stop() {
    running = false;
    if (mo) mo.disconnect();
    mo = null;
    clearInterval(house);
    clearTimeout(debTimer);
    debTimer = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("rtd:actions-ready", onActionsReady);
    unregisterAll();
    debug(false);
    byId.clear();
    suffixNext.clear();
    freed.clear();
    queue.clear();
    reclass.clear();
    job = null;
    skipped = new WeakSet();
  }
  function setEnabled(on) {
    lsSet(FLAG_KEY, on ? null : "off");
    if (on) start();
    else stop();
    return running;
  }
  function reset() {
    for (const e of Array.from(byId.values())) meta.delete(e.el);
    byId.clear();
    suffixNext.clear();
    freed.clear();
    skipped = new WeakSet();
    queue.clear();
    job = null;
    needFull = true;
    schedule(0);
  }
  // Resolves when the queued work is done (or after `ms`).
  async function settle(ms = 3000) {
    await sleep(0); // let pending MutationObserver records arrive first
    return waitFor(() => !queue.size && !job && !needFull && !reclass.size && !rafId && !debTimer && !SS.scan, ms, 16).then((v) => !!v);
  }

  const api = {
    version: VERSION,
    get enabled() {
      return running;
    },
    setEnabled,
    snapshot,
    find,
    act,
    click: (id, o = {}) => act(id, { ...o, kind: "click" }),
    type: (id, text, o = {}) => act(id, { ...o, text, kind: "type" }),
    toggle: (id, value, o = {}) => act(id, { ...o, value, kind: "toggle" }),
    select: (id, value, o = {}) => act(id, { ...o, value, kind: "select" }),
    drag: (id, to, o = {}) => act(id, { ...o, to, kind: "drag" }),
    screenshotHints,
    export: exportMap,
    // Background flavour: items gathered in 8 ms slices, then the same JSON.
    exportAsync: async (o = {}) => (running ? exportMap({ ...o, items: await liveItemsSliced() }) : exportMap(o)),
    get lastExport() {
      return lastExport ? { ...lastExport } : null;
    },
    stores,
    actions,
    runStore,
    runAction,
    debug,
    el: (id) => {
      const e = resolve(id);
      return e ? e.el : null;
    },
    idOf: (el) => {
      const e = el && meta.get(el);
      return e ? e.id : null;
    },
    rescan: () => {
      needFull = true;
      schedule(0);
      return settle();
    },
    reset: () => {
      reset();
      return settle();
    },
    settle,
    stats: () => ({ ...stats, errors: stats.errors.slice(), indexedNow: byId.size, queue: queue.size, observing: !!mo, running, hidden: document.hidden }),
    state: () => ({
      enabled: running,
      indexed: byId.size,
      stores: Array.from(SS.byName.keys()),
      mods: Array.from(SS.mods.keys()),
      registry: !!registry,
      registered: registered.size,
      propsKey: !!propsKey,
      debug: dbg.on,
      lastExport,
      log: actLog.slice(-10),
    }),
    dispose: () => {
      stop();
      disposed = true;
      if (window.__RE_TEMPO_APP_MAP__ === api) delete window.__RE_TEMPO_APP_MAP__;
    },
  };
  window.__RE_TEMPO_APP_MAP__ = api;

  const boot = () => {
    if (flagOn()) start();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
