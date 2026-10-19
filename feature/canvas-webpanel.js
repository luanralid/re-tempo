/*
 * RE-TEMPO · canvas-webpanel (user MOD layer)
 * ---------------------------------------------------------------------------
 * pen.dev's side browser for the design canvas ("add a browser button to
 * open and close the browser on the right"; then "it doesn't need a
 * background; this sidebar has to stay inside the canvas along with
 * everything; do the proper see-through background and all the
 * functionality right"). A globe in the canvas's
 * top right pill opens a browser CARD that floats inside the canvas view,
 * 12 px off its top, right and bottom edges, radius 16, one hairline and one
 * shadow; the canvas stays visible around it. Copied from pen.dev
 * (screenshots of 2026-10-18, images/119.png and 127.png).
 *
 * Pieces:
 *   1) Toggle. On the views canvas-chrome manages, the globe is one of its
 *      top right pill actions (registerTopAction: {id, icon, tooltip,
 *      shortcutLabel, onToggle(ctx) -> pressed, pressed(ctx)}). Elsewhere
 *      (no canvas-chrome, or a view it leaves alone, e.g. a narrow pane) the
 *      mod inserts its own button right after the canvas's native Share
 *      (button[aria-label="Share canvas"] or "Share"), or into the "Canvas
 *      controls" pill when the view has no Share; on a view at least 720 px
 *      wide it waits 1.5 s for canvas-chrome first, so the globe never shows
 *      twice. aria-pressed mirrors the card. Shortcut Option+Cmd+B
 *      (Ctrl+Alt+B elsewhere, not in a text field there: AltGr), while a
 *      canvas view is on screen; shown in the tooltip (shortcutLabel).
 *   2) Card. One per canvas view ([data-canvas-shell]), mounted in the
 *      canvas viewport area (the parent of the app's top layer: the box the
 *      canvas, canvas-chrome's zoom and composer live in), position absolute.
 *      Width 45% of the area by default (left edge handle, min 360 px, the
 *      canvas keeps 360 px beside it, the room canvas-chrome lays its chrome
 *      out in; an area narrower than 744 px gets the card over the whole
 *      view), full height by default (bottom handle, min
 *      320 px); both stored. The free bottom left corner (16 px, a small dotted
 *      grip, cursor nesw-resize) resizes width and height together with the
 *      same limits and the same stored ratios as the two edge handles; where
 *      it meets them the corner wins (the edge handles stop 16 px short of
 *      it). Keyboard: the corner is a role=separator too, the arrows change
 *      both dimensions (Left/Right the width, Up/Down the height); the keys
 *      reach the handles before the canvas (which nudges its selection on
 *      the arrows wherever the focus is). The floating things anchored on
 *      the right move left of the card while it is open: on a canvas-chrome
 *      view a box in the view's corner gets data-rcw-open="1" + --rcw-width
 *      (the contract canvas-chrome reads: it moves its top pill, selection pill, right
 *      card, zoom and composer band itself; this mod asks it to sync, in the
 *      same animation frame while a handle is dragged: the chrome follows the
 *      edge live, ui-motion marks the drag as a resize); without
 *      canvas-chrome the app's top layer gets an additive margin-right. The
 *      live geometry is published too (publish: data-rtwp-right-inset and the
 *      "rtwp:geometry" event). Expand (or a view too narrow to share): the
 *      card covers the whole view; on a canvas-chrome view it starts under
 *      the chrome's top row, which keeps its place (the globe and Share stay
 *      in sight and clickable), what sits under that row hides. Slides in
 *      220 ms on canvas-chrome's curve, with its chrome (reduced motion: a
 *      120 ms fade); closing, the chrome takes the room back once the card
 *      is gone.
 *      Esc with focus in the card closes it; focus goes back to the globe.
 *   3) Bar (pen's order): element picker, back, forward, reload, address
 *      field (site icon, "Enter a URL", mobile/desktop toggle), Import,
 *      camera, expand, "…", close. Narrow cards move camera / expand,
 *      forward, back, then reload into "…".
 *   4) Empty card (pen's): "Import from the web", "Enter a URL ›", the three
 *      modes, Recent (the 5 latest pages, "Clear All"; localhost:3000 / 5173
 *      chips while it is empty) and a short privacy note. The three modes are
 *      a radio group ("it would be nice if I could select one of these options
 *      and then go there and click the item I want"): picking one ARMS it
 *      (role=radio + aria-checked, roving tabindex, arrows move and check,
 *      clicking the checked one or Esc clears it) and the page opened next
 *      (address, Recent row or chip) comes up with that mode armed:
 *      - Import an element: the picker is live as soon as the page has
 *        loaded; each click imports that element and the picker stays live
 *        for the next one. Esc (in the page or the card) disarms.
 *      - Import the full page / a screenshot: one click away, never fired by
 *        itself: a page often needs a moment first (a login, a cookie banner,
 *        a scroll, an app still rendering after load), and the armed mode
 *        outlives navigation, so firing on load would drop a new import on
 *        the canvas at every page change.
 *      While a page is open the armed mode shows as a pill at the bottom of
 *      the page (the mode switch, the one-click action or the picker hint,
 *      and an off button) and on the bar (pick pressed, Import or camera
 *      tinted); it outlives navigation (address, back/forward, reload, links,
 *      in-page routes) and can be switched or turned off there or in "…"
 *      (Esc with the focus in the card turns it off before closing the card).
 *      No mode armed: everything works as before (the bar's picker is one
 *      pick, Import and camera act at once). The mode lives in the card, not
 *      in storage.
 *      A card always opens on this empty card ("open straight on Google" was
 *      the last URL coming back): nothing loads until the user enters an
 *      address or a search (Google) or picks a Recent row or chip, and the
 *      last URL is not stored. Opened from the globe or the shortcut, the
 *      address field gets the focus.
 *   5) Modes.
 *      - Import the full page: a canvas-browser frame with the URL
 *        (window.__RE_TEMPO_CANVAS_BROWSER__.create({url, x, y, w, h}); the
 *        registry's "canvas.browser.create" without that API), 390x844 or
 *        1280x840 by the viewport, 80 units right of the selection, else in
 *        the middle of the view; plus, when the page can be read, an
 *        editable copy: the page's HTML (scripts dropped, readable
 *        stylesheets inlined, <base href>) handed to the canvas's own HTML
 *        drop (htmlFileDropRef.current([file], atWorld): the app turns it
 *        into a storyboard), right of the frame.
 *      - Import an element: a picker inside the page (hover outline + tag
 *        label, click picks, Esc cancels; a navigation or a mode switch
 *        drops it silently, only Esc counts as the user's cancel). The
 *        element becomes an editable copy (its subtree with the computed
 *        styles inlined, through the same HTML drop), or, without that
 *        drop, a PNG of its box
 *        (webview.capturePage(rect) -> the canvas's "Paste here").
 *      - Import a screenshot (camera): webview.capturePage() -> PNG on the
 *        clipboard -> pasteAtWorldPositionRef.current({x, y}) (CanvasActions
 *        context, see canvas-paste.js): the app's native image storyboard.
 *        Without that ref the PNG stays on the clipboard.
 *   6) Page. A <webview> made like the app's Browser tab and canvas-browser's
 *      frames: partition "persist:tempo-browser", preload = file URL of
 *      window.browserBridge.webviewPreloadPath, useragent without the
 *      Electron/ and Tempo/ tokens, allowpopups (cookies and logins shared
 *      with that tab). Address input is normalized like the app. Viewport:
 *      mobile 390 or desktop 1280 CSS px, scaled down to fit, centered.
 *      Corners: the page box clips the page to radius 12. The page is its own
 *      composited layer and its rounded clip anti-aliases apart from what is
 *      painted behind it, so a white backing (box and <webview> were #fff)
 *      showed as a light rim on all 4 corners ("risquinhos"), and the scaled
 *      page ended a sub-pixel short of the box's right/bottom edge. Now
 *      nothing is painted behind the page, the scaled page always covers the
 *      box (exact scale, height rounded up); the hairline stays outside.
 *      Without <webview> (a plain test page) an <iframe> is used (readable
 *      only same-origin; no capturePage there).
 *
 * What the app draws (assets/index-D2Ui1vc0.js, RE-TEMPO build of
 * 2026-10-14, read on 2026-10-18): [data-canvas-shell] > left wrapper +
 * column > row > [viewport area (relative): stage + top layer
 * (pointer-events-none absolute top-0 z-20 > row: "Canvas page" | "Canvas
 * controls")] + right panel wrapper. The canvas Share is
 * button[aria-label="Share canvas"]. The paste context (a ref whose current
 * holds skipNextNativePaste, canvasShortcutScopeRef, htmlFileDropRef...) is
 * a hook of the canvas view; htmlFileDropRef.current(files, world) reads
 * each HTML file and runs runHtmlPasteToStoryboards (the canvas's drop of
 * .html files does exactly that). pasteAtWorldPosition(t) runs the paste
 * pipeline with {atWorld: t}. The bundle binds Cmd+B and Cmd+Shift+B
 * ("Report a bug", the editors' blockquote), not Option+Cmd+B.
 *
 * Writes: the button and the card (own nodes, never moved app nodes); on
 * the shell data-rtwp / data-rtwp-open / data-rtwp-full / data-rtwp-dragging
 * / data-rtwp-right-inset; data-rcw-open and --rcw-width on its own
 * .rtwp-anchor (a box of no size in the view's corner); data-rtwp-layer
 * and --rtwp-inset on the app's top layer; data-rtwp-pos
 * (position: relative) only on a mount box that is static. Input on the
 * card stops there (React would hand it to the app's ancestors).
 * Storage: localStorage "rtd.canvasWebpanel.v1" = {v, ratio, hRatio, mode,
 * open: {<canvasPath>: true}, recent: [{url, title, t}]} (no last URL: an
 * older "url" is ignored and dropped on the next save).
 * Flags (read on every sync): localStorage "rtd.canvasWebpanel" = "off" or
 * "rtd.canvasChrome" = "off" removes the button and the cards (the stored
 * state is kept).
 * API: window.__RE_TEMPO_CANVAS_WEBPANEL__ (state(), open(), close(),
 * toggle(), navigate(), setMode(), setWidth(), setHeight(), setExpanded(),
 * importToCanvas() / importFull(), importElement(), cancelPick(), capture(),
 * arm(mode | null), recent(), clearRecent(), sync(), dispose()); window event
 * "rtd:canvas-webpanel-change" (detail: {shell, open, url, mode, arm}) and
 * "rtwp:geometry" (detail: {shell, open, full, dragging, rightInset, rect},
 * see publish). Registry
 * actions canvas.webpanel.open {url?} and canvas.webpanel.close.
 * Limits: keys pressed while focus is inside the page go to the page (Esc
 * there cancels the picker, not the card). Import goes through
 * canvas-browser's create(), which uses the canvas view it last saw in use.
 * A closed card keeps its page loaded (hidden) until the view goes away:
 * reopened in that view it shows that page again; a new view starts empty.
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (window.__RE_TEMPO_CANVAS_WEBPANEL__) return; // double injection
  const SELF_SRC = (document.currentScript && document.currentScript.src) || "";

  // ------------------------------------------------------------------ config
  const FLAG = "rtd.canvasWebpanel";
  const CHROME_FLAG = "rtd.canvasChrome";
  const STORE = "rtd.canvasWebpanel.v1";
  const SHELL = "[data-canvas-shell]";
  const CANVAS_ROOT = "[data-canvas-root]";
  const WORLD_LAYER = ".tds-canvas-shimmer-origin";
  const CONTROLS = '[role="toolbar"][aria-label="Canvas controls"]';
  const PAGE_PILL = '[role="toolbar"][aria-label="Canvas page"]';
  const SHARE = 'button[aria-label="Share canvas"], button[aria-label="Share"]';
  const OWN = "[data-rtwp-own]";
  const PARTITION = "persist:tempo-browser";
  const TOP_ID = "webpanel";
  const TOOLTIP = "Open a webpage and reproduce it on the canvas";
  const DEFAULT_RATIO = 0.45;
  const MARGIN = 12; // card off the view's top, right and bottom
  const GAP = 12; // card <-> the things it pushes left
  const MIN_W = 360;
  const MIN_H = 320;
  // canvas width the card always leaves beside it: canvas-chrome lays its
  // chrome out in that room (its MIN_COMPOSER, 360); with less it stops
  // moving it and the card would cover it
  const MIN_CANVAS = 360;
  // an expanded card on a canvas-chrome view starts under its top row (12 +
  // its 40px pills + 8): the globe and Share stay in sight and clickable
  const FULL_TOP = 60;
  const STAGE_PAD = 8;
  const VIEWPORT = { mobile: 390, desktop: 1280 };
  const FRAME = { mobile: { w: 390, h: 844 }, desktop: { w: 1280, h: 840 } };
  const IMPORT_GAP = 80; // world units between imported things
  const ANIM_MS = 220; // the shared "small" duration: canvas-chrome slides its chrome in the same time
  const RM_MS = 120; // reduced motion: a fade, no longer than this
  const TIP_DELAY = 400;
  const TOAST_MS = 4000;
  const KEY_STEP = 16;
  const RECENT_MAX = 5;
  const MAX_FIBER_DEPTH = 600;
  const MAX_HOOKS = 1500;
  const MAX_OPEN_KEYS = 60;
  const MAX_HTML = 6 * 1024 * 1024;
  const CHROME_MIN_W = 720;
  const CHROME_GRACE_MS = 1500;
  const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
  // Option+Cmd+B: free in the app's bundle (it binds Cmd+B and Cmd+Shift+B,
  // "Report a bug") and in the other mods
  const KBD = IS_MAC ? "⌥⌘B" : "Ctrl+Alt+B";
  const ARIA_KEYS = IS_MAC ? "Alt+Meta+B" : "Control+Alt+B";
  const PRIVACY = "Pages load in a browser inside Tempo, on this machine. Logins and cookies stay here; only what you import goes onto the canvas.";
  // The three import modes: the empty card's radio group, the pill's switch
  // and the "…" menu all read this list (same order everywhere).
  const MODES = [
    {
      id: "full",
      icon: "code",
      title: "Import the full page",
      body: "Reproduce it as frames, text, and images.",
      short: "Full page",
      next: "Open a page, then import it in one click.",
      go: "Import this page",
    },
    {
      id: "element",
      icon: "pick",
      title: "Import an element",
      body: "Pick one element instead of the whole page.",
      short: "Element",
      next: "Open a page, then click the element you want.",
    },
    {
      id: "screenshot",
      icon: "camera",
      title: "Import a screenshot",
      body: "Drop a PNG onto the canvas or send it to the agent.",
      short: "Screenshot",
      next: "Open a page, then capture it in one click.",
      go: "Capture this view",
    },
  ];
  const modeOf = (id) => MODES.find((m) => m.id === id) || null;
  const REARM_MS = 360; // after a pick: the toast and the canvas land, then the picker is back
  const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
  const reducedMotion = () => {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  };

  const ATTR = {
    managed: "data-rtwp",
    open: "data-rtwp-open",
    full: "data-rtwp-full",
    dragging: "data-rtwp-dragging",
  };
  const LAYER_ATTR = "data-rtwp-layer";
  const INSET_ATTR = "data-rtwp-right-inset"; // the live push (publish)
  const POS_ATTR = "data-rtwp-pos";

  // ---------------------------------------------------------------- helpers
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
  const enabled = () => ls.get(FLAG) !== "off" && ls.get(CHROME_FLAG) !== "off";
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const shown = (el) => {
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === "function" && !el.checkVisibility()) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const isEditable = (el) =>
    !!el &&
    el.nodeType === 1 &&
    (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest('[contenteditable=""], [contenteditable="true"], .monaco-editor'));
  const safe = (fn, ...a) => {
    try {
      return fn(...a);
    } catch (err) {
      console.warn("[canvas-webpanel]", err);
      return undefined;
    }
  };
  const toggleAttr = (el, a, on) => {
    if (on && !el.hasAttribute(a)) el.setAttribute(a, "");
    else if (!on && el.hasAttribute(a)) el.removeAttribute(a);
  };
  const setVar = (el, k, v) => {
    if (el.style.getPropertyValue(k) !== v) el.style.setProperty(k, v);
  };
  let uidSeq = 0;
  const uid = (p) => `rtwp-${p}-${++uidSeq}`;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs)
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else el.setAttribute(k, v === true ? "" : String(v));
      }
    for (const c of kids) if (c != null) el.append(c);
    el.setAttribute("data-rtwp-own", "");
    return el;
  }

  // Lucide paths (the app's icon set).
  const ICONS = {
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    forward: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    reload: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    stop: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    mobile: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
    desktop: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    expand: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
    collapse: '<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    close: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m8 9 3 3-3 3"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    width: '<path d="m18 8 4 4-4 4"/><path d="m6 8-4 4 4 4"/><path d="M2 12h20"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    pick: '<path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z"/><path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h2"/><path d="M14 3h1"/><path d="M3 9v1"/><path d="M21 9v2"/><path d="M3 14v1"/>',
    code: '<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  };
  function icon(name, cls) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.5");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    if (cls) s.setAttribute("class", cls);
    s.innerHTML = ICONS[name];
    return s;
  }
  const iconMarkup = (name) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  function ensureCss() {
    if (!SELF_SRC || document.querySelector('link[href*="canvas-webpanel.css"]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.setAttribute("data-rar-css", "");
    l.href = SELF_SRC.replace(/\.js(\?.*)?$/, ".css");
    (document.head || document.documentElement).appendChild(l);
  }

  // ------------------------------------------------------------------ urls
  // Same rules as the app's address bar (V0i) and canvas-browser.
  function normalizeUrl(raw) {
    const t = String(raw || "").trim();
    if (!t) return null;
    if (/^https?:\/\//i.test(t) || /^file:\/\//i.test(t)) return t;
    if (/^localhost(?::\d+)?(?:[/?#]|$)/i.test(t)) return "http://" + t;
    if (/^127\.0\.0\.1(?::\d+)?(?:[/?#]|$)/.test(t)) return "http://" + t;
    if (t.includes(".") && !/\s/.test(t)) return "https://" + t;
    return "https://www.google.com/search?q=" + encodeURIComponent(t);
  }
  const loadable = (u) => typeof u === "string" && /^(https?|file):\/\//i.test(u);
  function hostOf(u) {
    try {
      const x = new URL(u);
      return x.protocol === "file:" ? decodeURIComponent(x.pathname.split("/").pop() || "file") : x.host;
    } catch (_) {
      return "";
    }
  }
  // pen's Recent rows: no scheme, no "localhost:", a file shows its name and folder
  function recentLabel(u) {
    try {
      const x = new URL(u);
      if (x.protocol === "file:") {
        const p = decodeURIComponent(x.pathname);
        const i = p.lastIndexOf("/");
        return { main: p.slice(i + 1) || p, sub: p.slice(0, i + 1) };
      }
      let s = x.host.replace(/^localhost:/, "") + (x.pathname === "/" ? "" : x.pathname) + x.search;
      if (x.pathname === "/" && x.search) s = x.host.replace(/^localhost:/, "") + "/" + x.search;
      return { main: s, sub: "" };
    } catch (_) {
      return { main: u, sub: "" };
    }
  }
  function fileUrl(p) {
    if (p.startsWith("file:")) return p;
    const t = p.replaceAll("\\", "/");
    return encodeURI(t.startsWith("/") ? "file://" + t : "file:///" + t).replaceAll("#", "%23").replaceAll("?", "%3F");
  }
  const cleanUA = () =>
    navigator.userAgent
      .replace(/\sElectron\/[^\s]+/g, "")
      .replace(/\s(?:Tempo|TempoInsiders|Tempo-Insiders)\/[^\s]+/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

  let engineKind = null;
  function engine() {
    if (engineKind) return engineKind;
    let wv = false;
    try {
      wv = !!(window.browserBridge && window.browserBridge.webviewPreloadPath) || !!(window.customElements && window.customElements.get("webview"));
    } catch (_) {}
    if (wv) return (engineKind = "webview");
    if (document.readyState === "complete") return (engineKind = "iframe");
    return null;
  }

  // ------------------------------------------------------------ fiber (read)
  const fiberOf = (node) => {
    if (!node) return null;
    const k = Object.keys(node).find((x) => x.startsWith("__reactFiber$"));
    return k ? node[k] : null;
  };
  const isRefObj = (r) => !!r && typeof r === "object" && "current" in r;
  const isHandle = (v) => !!v && typeof v === "object" && typeof v.getView === "function";
  function canvasKeyOf(root) {
    let f = fiberOf(root);
    let alt = null;
    for (let d = 0; f && d < MAX_FIBER_DEPTH; d++, f = f.return) {
      const p = f.memoizedProps;
      if (!p || typeof p !== "object") continue;
      if (typeof p.canvasPath === "string" && p.canvasPath) return p.canvasPath;
      if (!alt && typeof p.pageFolderPath === "string" && p.pageFolderPath) alt = p.pageFolderPath;
    }
    return alt;
  }
  // Above [data-canvas-root]: the canvas handle (getView/getSelection), the
  // CanvasActions value (pasteAtWorldPositionRef) and the paste context ref
  // (its current holds htmlFileDropRef). Plain property reads only.
  function wiringOf(root) {
    const out = { handle: null, actions: null, htmlDrop: null };
    let f = fiberOf(root);
    for (let d = 0; f && d < MAX_FIBER_DEPTH; d++, f = f.return) {
      const p = f.memoizedProps;
      if (!out.handle)
        for (const r of [f.ref, p && p.ref])
          if (isRefObj(r) && isHandle(r.current)) {
            out.handle = r.current;
            break;
          }
      if (!out.htmlDrop && p && isRefObj(p.htmlFileDropRef)) out.htmlDrop = p.htmlFileDropRef;
      if (!out.htmlDrop) {
        let hk = f.memoizedState;
        if (hk && typeof hk === "object" && "next" in hk)
          for (let i = 0; hk && i < MAX_HOOKS; i++, hk = hk.next) {
            const s = hk.memoizedState;
            if (isRefObj(s) && s.current && typeof s.current === "object" && isRefObj(s.current.htmlFileDropRef)) {
              out.htmlDrop = s.current.htmlFileDropRef;
              break;
            }
          }
      }
      const v = p && p.value;
      if (!out.actions && v && typeof v === "object" && isRefObj(v.pasteAtWorldPositionRef)) out.actions = v;
      if (out.handle && out.actions && out.htmlDrop) break;
    }
    return out;
  }
  const TRANSFORM_RE = /translate3d\(\s*(-?[\d.e+-]+)px\s*,\s*(-?[\d.e+-]+)px\s*,\s*0(?:px)?\s*\)\s*scale\(\s*([\d.e+-]+)\s*\)/i;
  const validView = (v) => !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.zoom) && v.zoom > 0;
  function viewOf(root, handle) {
    if (handle) {
      try {
        const v = handle.getView();
        if (validView(v)) return { x: v.x, y: v.y, zoom: v.zoom };
      } catch (_) {}
    }
    const layer = root.querySelector(":scope > " + WORLD_LAYER) || root.querySelector(WORLD_LAYER);
    const t = layer && TRANSFORM_RE.exec(layer.style.transform || "");
    if (t) {
      const v = { x: +t[1], y: +t[2], zoom: +t[3] };
      if (validView(v)) return v;
    }
    return { x: 0, y: 0, zoom: 1 };
  }

  // ------------------------------------------------------------------ prefs
  function loadPrefs() {
    let o = null;
    try {
      o = JSON.parse(ls.get(STORE) || "null");
    } catch (_) {}
    o = o && typeof o === "object" ? o : {};
    const num = (v, d, a, b) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, a, b) : d);
    const open = {};
    if (o.open && typeof o.open === "object") for (const [k, v] of Object.entries(o.open)) if (v === true) open[k] = true;
    const recent = Array.isArray(o.recent)
      ? o.recent
          .filter((r) => r && loadable(r.url))
          .slice(0, RECENT_MAX)
          .map((r) => ({ url: r.url, title: typeof r.title === "string" ? r.title.slice(0, 200) : "", t: Number(r.t) || 0 }))
      : [];
    return {
      v: 1,
      ratio: num(o.ratio, DEFAULT_RATIO, 0.02, 0.98),
      hRatio: num(o.hRatio, 1, 0.05, 1),
      mode: o.mode === "mobile" ? "mobile" : "desktop",
      open,
      recent,
    };
  }
  let prefs = loadPrefs();
  function savePrefs() {
    const keys = Object.keys(prefs.open);
    if (keys.length > MAX_OPEN_KEYS) for (const k of keys.slice(0, keys.length - MAX_OPEN_KEYS)) delete prefs.open[k];
    ls.set(STORE, JSON.stringify(prefs));
  }
  function addRecent(url, title) {
    if (!/^(https?|file):/i.test(url || "")) return;
    const old = prefs.recent.find((r) => r.url === url);
    prefs.recent = [{ url, title: title || (old && old.title) || "", t: Date.now() }, ...prefs.recent.filter((r) => r.url !== url)].slice(0, RECENT_MAX);
    savePrefs();
    for (const rec of recs.values()) if (rec.els) renderRecent(rec);
  }
  function setRecentTitle(url, title) {
    const r = prefs.recent.find((x) => x.url === url);
    if (!r || !title || r.title === title) return;
    r.title = title.slice(0, 200);
    savePrefs();
  }
  function clearRecent() {
    prefs.recent = [];
    savePrefs();
    for (const rec of recs.values()) if (rec.els) renderRecent(rec);
  }

  // ------------------------------------------------------------------ state
  const recs = new Map(); // shell -> rec
  let lastRec = null;
  let disposed = false;
  let topAction = false;
  const counts = { opened: 0, closed: 0, imports: 0, htmlImports: 0, elements: 0, captures: 0 };
  const ui = { tip: null, tipTimer: null, tipFor: null, menu: null, toast: null };

  function emit(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (_) {}
  }

  function makeRec(shell) {
    const rec = {
      id: uid("view"),
      shell,
      born: performance.now(),
      key: null,
      host: null, // the canvas viewport area the card lives in
      layer: null, // the app's top layer (pushed left while open)
      open: false,
      expanded: false,
      full: false,
      width: 0,
      height: 0,
      mode: prefs.mode,
      url: "", // a card opens empty: no page until the user enters or picks one
      pageTitle: "",
      arm: null, // the armed import mode ("full" | "element" | "screenshot")
      armTimer: 0,
      picking: false,
      pickSeq: 0, // bumped by every pick and every silent cancel: a stale result is dropped
      btn: null,
      dock: null,
      els: null,
      guest: null,
      kind: null,
      pendingUrl: null,
      nav: { ready: false, loading: false, back: false, fwd: false },
      hist: null,
      closeTimer: null,
      ro: null,
      viewRo: null,
      endDrag: null,
    };
    recs.set(shell, rec);
    if (typeof ResizeObserver === "function") {
      rec.ro = new ResizeObserver(() => {
        if (!rec.open) return;
        const was = rec.pubKey;
        applyGeometry(rec);
        if (rec.pubKey !== was) nudgeChrome(); // a resized view: the chrome follows the card in this frame
      });
      try {
        rec.ro.observe(shell, { box: "border-box" });
      } catch (_) {
        rec.ro.observe(shell);
      }
    }
    return rec;
  }

  // The viewport area: parent of the top layer that holds the "Canvas
  // controls" / "Canvas page" row; the shell itself when there is none.
  function geometryOf(sh) {
    const root = sh.querySelector(CANVAS_ROOT);
    const bar = Array.from(sh.querySelectorAll(`${CONTROLS}, ${PAGE_PILL}`)).find((n) => !n.closest(OWN));
    const row = bar && bar.parentElement;
    const layer = row && row.parentElement;
    const area = layer && layer.parentElement;
    if (area && area !== sh && sh.contains(area) && (!root || area.contains(root))) return { area, layer, root };
    return { area: sh, layer: null, root };
  }

  // ------------------------------------------------------------------- sync
  let syncQueued = false;
  function syncSoon() {
    if (syncQueued || disposed) return;
    syncQueued = true;
    requestAnimationFrame(() => {
      syncQueued = false;
      syncAll();
    });
  }

  function syncAll() {
    if (disposed) return;
    for (const [sh, rec] of Array.from(recs)) if (!sh.isConnected) destroyRec(rec);
    if (!enabled()) {
      for (const rec of Array.from(recs.values())) destroyRec(rec);
      unregisterTop();
      hideTip();
      closeMenu(false);
      return;
    }
    tryRegisterTop();
    for (const sh of document.querySelectorAll(SHELL)) {
      if (sh.closest(OWN)) continue;
      const rec = recs.get(sh) || (shown(sh) ? makeRec(sh) : null);
      if (rec) safe(syncRec, rec);
    }
  }

  function syncRec(rec) {
    const sh = rec.shell;
    if (!sh.hasAttribute(ATTR.managed)) sh.setAttribute(ATTR.managed, "");
    const g = geometryOf(sh);
    if (rec.layer && rec.layer !== g.layer) {
      rec.layer.removeAttribute(LAYER_ATTR);
      rec.layer.style.removeProperty("--rtwp-inset");
    }
    rec.layer = g.layer;
    if (g.layer && !g.layer.hasAttribute(LAYER_ATTR)) g.layer.setAttribute(LAYER_ATTR, "");
    // a canvas area too narrow for a card (a narrow pane with its sidebar
    // open): the card covers the whole view instead
    const host = g.area !== sh && g.area.getBoundingClientRect().width < MIN_W + 2 * MARGIN ? sh : g.area;
    if (rec.host !== host) {
      if (rec.host) rec.host.removeAttribute(POS_ATTR);
      rec.host = host;
    }
    if (!rec.host.hasAttribute(POS_ATTR) && getComputedStyle(rec.host).position === "static") rec.host.setAttribute(POS_ATTR, "");
    if (g.root) {
      const key = canvasKeyOf(g.root) || "default";
      if (key !== rec.key) {
        const first = rec.key == null;
        rec.key = key;
        if (first && rec.open) {
          prefs.open[key] = true;
          if (key !== "default") delete prefs.open.default;
          savePrefs();
        } else {
          const want = !!prefs.open[key];
          if (want && !rec.open) openPanel(rec, { focus: false, animate: !first, persist: false });
          else if (!want && rec.open) closePanel(rec, { persist: false });
        }
      }
    }
    syncButton(rec);
    if (rec.dock) {
      if (rec.dock.parentElement !== rec.host) rec.host.appendChild(rec.dock); // the app re-rendered the area
      if (rec.open) applyGeometry(rec);
    }
  }

  function destroyRec(rec) {
    if (rec.endDrag) rec.endDrag();
    if (rec.picking) cancelPick(rec);
    clearTimeout(rec.closeTimer);
    clearTimeout(rec.armTimer);
    if (rec.ro) rec.ro.disconnect();
    if (rec.viewRo) rec.viewRo.disconnect();
    if (ui.tipFor && (rec.btn === ui.tipFor || (rec.dock && rec.dock.contains(ui.tipFor)))) hideTip();
    if (ui.menu && ui.menu.rec === rec) closeMenu(false);
    if (rec.btn) rec.btn.remove();
    if (rec.dock) rec.dock.remove();
    if (rec.anchor) rec.anchor.remove();
    const sh = rec.shell;
    for (const a of Object.values(ATTR)) sh.removeAttribute(a);
    sh.style.removeProperty("--rtwp-inset");
    sh.style.removeProperty("--rcw-width");
    sh.removeAttribute(INSET_ATTR);
    sh.removeAttribute("data-rcw-open");
    if (rec.pubKey && !rec.pubKey.startsWith("closed")) emit("rtwp:geometry", { shell: sh, open: false, full: false, dragging: false, rightInset: 0, rect: null });
    if (rec.layer) {
      rec.layer.removeAttribute(LAYER_ATTR);
      rec.layer.style.removeProperty("--rtwp-inset");
    }
    if (rec.host) rec.host.removeAttribute(POS_ATTR);
    recs.delete(sh);
    if (lastRec === rec) lastRec = null;
    nudgeChrome();
  }

  // ----------------------------------------------------------------- toggle
  function chromeApi() {
    const a = window.__RE_TEMPO_CANVAS_CHROME__;
    return a && typeof a === "object" ? a : null;
  }
  const chromeOwns = (rec) => topAction && rec.shell.hasAttribute("data-rcc-shell");
  const topButtonOf = (rec) => rec.shell.querySelector(`[data-rcc-top-action="${TOP_ID}"]`);
  function tryRegisterTop() {
    if (topAction) return;
    const c = chromeApi();
    if (!c || typeof c.registerTopAction !== "function") return;
    let ok = false;
    try {
      ok =
        c.registerTopAction({
          id: TOP_ID,
          icon: iconMarkup("globe"),
          tooltip: TOOLTIP,
          shortcutLabel: KBD, // display only: this mod binds the key
          onToggle: (ctx) => {
            const sh = ctx && ctx.shell;
            const rec = sh ? recs.get(sh) || makeRec(sh) : targetRec();
            if (!rec) return false;
            togglePanel(rec, { focus: true });
            return rec.open;
          },
          pressed: (ctx) => {
            const sh = ctx && ctx.shell;
            const rec = sh ? recs.get(sh) : targetRec();
            return !!(rec && rec.open);
          },
        }) !== false;
    } catch (err) {
      console.warn("[canvas-webpanel] registerTopAction failed, using the Share fallback", err);
      ok = false;
    }
    if (!ok) return;
    topAction = true;
    for (const rec of recs.values()) if (rec.btn && chromeOwns(rec)) rec.btn.remove();
  }
  function unregisterTop() {
    if (!topAction) return;
    topAction = false;
    const c = chromeApi();
    if (c && typeof c.unregisterTopAction === "function") safe(() => c.unregisterTopAction(TOP_ID));
  }
  // canvas-chrome re-measures (Share over its slot, composer band, pressed state)
  function nudgeChrome() {
    const c = chromeApi();
    if (c && typeof c.sync === "function") safe(() => c.sync());
  }

  function makeButton(rec) {
    const b = h("button", {
      type: "button",
      class: "rtwp-btn",
      "data-rtwp-btn": "",
      "data-testid": "canvas-webpanel-toggle",
      "aria-label": "Browser",
      "aria-pressed": "false",
      "aria-keyshortcuts": ARIA_KEYS,
      "data-rtwp-tip": TOOLTIP,
      "data-rtwp-kbd": KBD,
    });
    b.append(icon("globe"));
    for (const t of ["pointerdown", "mousedown", "dblclick", "contextmenu"]) b.addEventListener(t, (e) => e.stopPropagation());
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideTip();
      togglePanel(rec, { focus: true });
    });
    wireTip(b);
    return b;
  }
  function findShare(sh) {
    let first = null;
    for (const b of sh.querySelectorAll(SHARE)) {
      if (b.closest(OWN)) continue;
      if (shown(b)) return b;
      if (!first) first = b;
    }
    return first;
  }
  function syncButton(rec) {
    const pending = topAction && performance.now() - rec.born < CHROME_GRACE_MS && rec.shell.getBoundingClientRect().width >= CHROME_MIN_W;
    if (chromeOwns(rec) || pending) {
      if (rec.btn) rec.btn.remove();
      return;
    }
    const sh = rec.shell;
    if (!rec.btn) rec.btn = makeButton(rec);
    const b = rec.btn;
    const share = findShare(sh);
    if (share && share.parentElement) {
      if (b.previousElementSibling !== share || b.parentElement !== share.parentElement) share.after(b);
      b.setAttribute("data-rtwp-place", "share");
    } else {
      const ctl = Array.from(sh.querySelectorAll(CONTROLS)).find((c) => !c.closest(OWN));
      if (ctl) {
        if (b.parentElement !== ctl) ctl.append(b);
        b.setAttribute("data-rtwp-place", "controls");
      } else if (b.isConnected) b.remove();
    }
    setPressed(rec);
  }
  function setPressed(rec) {
    const v = rec.open ? "true" : "false";
    if (rec.btn && rec.btn.getAttribute("aria-pressed") !== v) rec.btn.setAttribute("aria-pressed", v);
    if (rec.btn && rec.dock) rec.btn.setAttribute("aria-controls", rec.dock.id);
  }

  // ------------------------------------------------------------------- card
  function ensureDock(rec) {
    if (rec.dock) {
      if (rec.host && rec.dock.parentElement !== rec.host) rec.host.appendChild(rec.dock);
      return rec.dock;
    }
    if (!rec.host) rec.host = geometryOf(rec.shell).area;
    const E = {};
    const ib = (name, label, extra) => {
      const b = h("button", { type: "button", class: "rtwp-ib", "aria-label": label, "data-rtwp-tip": label, ...(extra || {}) });
      b.append(icon(name));
      wireTip(b);
      return b;
    };
    E.pick = ib("pick", "Import an element", { "data-testid": "canvas-webpanel-pick", "aria-pressed": "false", disabled: true });
    E.back = ib("back", "Back", { "data-testid": "canvas-webpanel-back", "data-rtwp-slot": "back", disabled: true });
    E.fwd = ib("forward", "Forward", { "data-testid": "canvas-webpanel-forward", "data-rtwp-slot": "fwd", disabled: true });
    E.reload = ib("reload", "Reload", { "data-testid": "canvas-webpanel-reload", "data-rtwp-slot": "reload", disabled: true });
    E.globe = icon("globe", "rtwp-site-ico");
    E.favicon = h("img", { class: "rtwp-favicon", alt: "", draggable: "false", hidden: true });
    E.favicon.addEventListener("error", () => {
      E.favicon.hidden = true;
      E.globe.removeAttribute("hidden");
    });
    E.siteMode = h("span", { class: "rtwp-site-mode" }); // the armed mode, while no page is open
    E.site = h("span", { class: "rtwp-site", "aria-hidden": "true" }, E.globe, E.favicon, E.siteMode);
    E.url = h("input", {
      type: "text",
      class: "rtwp-url",
      "aria-label": "Address",
      placeholder: "Enter a URL",
      spellcheck: "false",
      autocomplete: "off",
      autocapitalize: "off",
      "data-testid": "canvas-webpanel-url",
    });
    E.mode = ib(rec.mode === "mobile" ? "mobile" : "desktop", "Mobile viewport", {
      class: "rtwp-ib rtwp-mode",
      "aria-pressed": rec.mode === "mobile" ? "true" : "false",
      "data-testid": "canvas-webpanel-mode",
    });
    E.progress = h("span", { class: "rtwp-progress", "aria-hidden": "true" }, h("span", { class: "rtwp-progress-bar" }));
    E.form = h("form", { class: "rtwp-field", role: "search" }, E.site, E.url, E.mode, E.progress);
    E.import = h("button", {
      type: "button",
      class: "rtwp-import",
      "data-testid": "canvas-webpanel-import",
      "data-rtwp-tip": "Import the full page",
      text: "Import",
      disabled: true,
    });
    wireTip(E.import);
    E.camera = ib("camera", "Import a screenshot", { "data-testid": "canvas-webpanel-camera", "data-rtwp-slot": "camera", disabled: true });
    E.sep = h("span", { class: "rtwp-sep", "aria-hidden": "true", "data-rtwp-slot": "sep" });
    E.expand = ib("expand", "Expand", { "data-testid": "canvas-webpanel-expand", "data-rtwp-slot": "expand", "aria-pressed": "false" });
    E.more = ib("more", "More", { "data-testid": "canvas-webpanel-more", "aria-haspopup": "menu", "aria-expanded": "false" });
    E.close = ib("close", "Close browser", { "data-testid": "canvas-webpanel-close", "data-rtwp-kbd": "Esc" });
    E.bar = h("div", { class: "rtwp-bar", role: "toolbar", "aria-label": "Browser controls" }, E.pick, E.back, E.fwd, E.reload, E.form, E.import, E.camera, E.sep, E.expand, E.more, E.close);

    // page view
    E.device = h("div", { class: "rtwp-device", "data-testid": "canvas-webpanel-device" });
    E.errTitle = h("div", { class: "rtwp-error-title", text: "This page couldn't load" });
    E.errDesc = h("div", { class: "rtwp-error-desc" });
    E.errRetry = h("button", { type: "button", class: "rtwp-ghost", text: "Try again" });
    E.error = h("div", { class: "rtwp-error", role: "alert", hidden: true }, icon("alert", "rtwp-error-ico"), E.errTitle, E.errDesc, E.errRetry);
    E.shield = h("div", { class: "rtwp-shield", "aria-hidden": "true" });

    // the armed mode's pill, at the bottom of the page: mode switch | the
    // one-click action or the picker hint | off. A one-shot pick (no mode
    // armed) shows only the hint and the off button.
    E.armSeg = h("div", { class: "rtwp-seg", role: "radiogroup", "aria-label": "Import mode" }, h("span", { class: "rtwp-seg-thumb", "aria-hidden": "true" }));
    E.armSegBtns = {};
    for (const m of MODES) {
      const b = h(
        "button",
        { type: "button", class: "rtwp-seg-btn", role: "radio", "aria-checked": "false", tabindex: "-1", "aria-label": m.title, "data-rtwp-tip": m.title, "data-rtwp-mode": m.id, "data-testid": `canvas-webpanel-arm-${m.id}` },
        icon(m.icon)
      );
      wireTip(b);
      b.addEventListener("click", () => setArm(rec, m.id));
      E.armSegBtns[m.id] = b;
      E.armSeg.append(b);
    }
    E.armHint = h(
      "span",
      { class: "rtwp-armhint" },
      h("span", { class: "rtwp-armhint-long", text: "Click an element to import it" }),
      h("span", { class: "rtwp-armhint-short", text: "Click an element" }),
      h("kbd", { text: "Esc" })
    );
    E.armGo = h("button", { type: "button", class: "rtwp-armgo", "data-testid": "canvas-webpanel-arm-go" });
    wireTip(E.armGo);
    E.armMain = h("div", { class: "rtwp-armmain" }, E.armHint, E.armGo);
    E.armOff = ib("x", "Turn off import mode", { class: "rtwp-ib rtwp-armoff", "data-rtwp-kbd": "Esc", "data-testid": "canvas-webpanel-arm-off" });
    E.armbar = h(
      "div",
      { class: "rtwp-armbar", role: "group", "aria-label": "Armed import", inert: true, "data-testid": "canvas-webpanel-armbar" },
      E.armSeg,
      E.armMain,
      E.armOff
    );
    E.view = h("div", { class: "rtwp-view" }, E.device, E.armbar, E.error, E.shield);

    // empty card (pen's "Import from the web")
    E.enter = h("button", { type: "button", class: "rtwp-ghost rtwp-enter", "data-testid": "canvas-webpanel-enter" }, h("span", { text: "Enter a URL" }), icon("chevron"));
    E.modeNext = h("p", { class: "rtwp-modenext", id: uid("next"), "aria-live": "polite", "data-testid": "canvas-webpanel-mode-next" });
    E.modes = h("div", { class: "rtwp-modes", role: "radiogroup", "aria-label": "Import mode", "aria-describedby": E.modeNext.id });
    E.modeBtns = {};
    for (const m of MODES) {
      const b = h(
        "button",
        { type: "button", class: "rtwp-modecard", role: "radio", "aria-checked": "false", tabindex: "-1", "data-rtwp-mode": m.id, "data-testid": `canvas-webpanel-mode-${m.id}` },
        h("span", { class: "rtwp-modecard-ico" }, icon(m.icon)),
        h("span", { class: "rtwp-modecard-title", text: m.title }),
        h("span", { class: "rtwp-modecard-body", text: m.body }),
        h("span", { class: "rtwp-modecard-radio", "aria-hidden": "true" })
      );
      b.addEventListener("click", (e) => {
        const on = rec.arm !== m.id;
        setArm(rec, on ? m.id : null);
        // a pointer pick goes on to the next step (the address); keys stay in the group
        if (on && e.detail > 0) E.url.focus({ preventScroll: true });
      });
      E.modeBtns[m.id] = b;
      E.modes.append(b);
    }
    E.recentList = h("div", { class: "rtwp-recent-list", role: "list" });
    E.recentClear = h("button", { type: "button", class: "rtwp-link", text: "Clear All", "data-testid": "canvas-webpanel-recent-clear" });
    E.recentClear.addEventListener("click", clearRecent);
    E.recentEmpty = h("div", { class: "rtwp-recent-empty" });
    for (const s of ["localhost:3000", "localhost:5173"]) {
      const c = h("button", { type: "button", class: "rtwp-chip", text: s });
      c.addEventListener("click", () => navigate(rec, normalizeUrl(s)));
      E.recentEmpty.append(c);
    }
    E.recent = h(
      "section",
      { class: "rtwp-recent", "aria-label": "Recent", "data-testid": "canvas-webpanel-recent" },
      h("div", { class: "rtwp-recent-head" }, icon("history"), h("span", { class: "rtwp-recent-title", text: "Recent" }), E.recentClear),
      E.recentList,
      E.recentEmpty
    );
    E.empty = h(
      "div",
      { class: "rtwp-empty", "data-testid": "canvas-webpanel-empty" },
      h(
        "div",
        { class: "rtwp-hero" },
        h("span", { class: "rtwp-hero-ico" }, icon("globe")),
        h("div", { class: "rtwp-hero-title", text: "Import from the web" }),
        h("div", { class: "rtwp-hero-body", text: "Open a live site or your localhost dev server, then bring it onto the canvas as editable layers." }),
        E.enter
      ),
      h("div", { class: "rtwp-modepick" }, E.modes, E.modeNext),
      E.recent,
      h("p", { class: "rtwp-privacy", text: PRIVACY })
    );
    E.body = h("div", { class: "rtwp-body" }, E.view, E.empty);
    E.sideHandle = h("div", { class: "rtwp-handle rtwp-handle-side", role: "separator", tabindex: "0", "aria-orientation": "vertical", "aria-label": "Resize browser width", "data-testid": "canvas-webpanel-divider" });
    E.bottomHandle = h(
      "div",
      { class: "rtwp-handle rtwp-handle-bottom", role: "separator", tabindex: "0", "aria-orientation": "horizontal", "aria-label": "Resize browser height", "data-testid": "canvas-webpanel-bottom" },
      h("span", { class: "rtwp-grip", "aria-hidden": "true" })
    );
    E.cornerHandle = h(
      "div",
      {
        class: "rtwp-handle rtwp-handle-corner",
        role: "separator",
        tabindex: "0",
        "aria-label": "Resize browser width and height",
        "data-testid": "canvas-webpanel-corner",
      },
      h("span", { class: "rtwp-corner-grip", "aria-hidden": "true" })
    );
    const d = h(
      "section",
      {
        id: uid("panel"),
        class: "rtwp-dock",
        role: "complementary",
        "aria-label": "Browser",
        "data-rtwp-dock": "",
        "data-testid": "canvas-webpanel",
        "data-state": "closed",
        "data-mode": rec.mode,
        hidden: true,
      },
      E.bar,
      E.body,
      E.sideHandle,
      E.bottomHandle,
      E.cornerHandle
    );
    rec.dock = d;
    rec.els = E;
    wireDock(rec);
    rec.host.appendChild(d);
    if (typeof ResizeObserver === "function") {
      rec.viewRo = new ResizeObserver(() => layoutDevice(rec));
      rec.viewRo.observe(E.view);
    }
    setUrlField(rec);
    renderRecent(rec);
    updateNav(rec);
    setPressed(rec);
    return d;
  }

  function renderRecent(rec) {
    const E = rec.els;
    const rows = prefs.recent.map((r) => {
      const lab = recentLabel(r.url);
      const b = h(
        "button",
        { type: "button", class: "rtwp-recent-row", role: "listitem", title: r.title ? `${r.title}\n${r.url}` : r.url },
        icon("globe", "rtwp-recent-ico"),
        h("span", { class: "rtwp-recent-main", text: lab.main }),
        lab.sub ? h("span", { class: "rtwp-recent-sub", text: lab.sub }) : null,
        icon("arrow", "rtwp-recent-go")
      );
      b.addEventListener("click", () => navigate(rec, r.url));
      return b;
    });
    E.recentList.replaceChildren(...rows);
    E.recentList.hidden = !rows.length;
    E.recentClear.hidden = !rows.length;
    E.recentEmpty.hidden = !!rows.length;
  }

  function wireDock(rec) {
    const E = rec.els;
    const d = rec.dock;
    for (const t of ["pointerdown", "mousedown", "click", "dblclick", "wheel", "contextmenu", "keydown", "keyup"]) d.addEventListener(t, (e) => e.stopPropagation());
    d.addEventListener("pointerdown", () => (lastRec = rec), true);
    d.addEventListener("focusin", () => (lastRec = rec));
    E.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const u = normalizeUrl(E.url.value);
      if (!u) return;
      navigate(rec, u);
      E.url.blur();
    });
    E.url.addEventListener("focus", () => {
      setTimeout(() => {
        if (document.activeElement === E.url) E.url.select();
      }, 0);
    });
    E.url.addEventListener("blur", () => setUrlField(rec));
    E.pick.addEventListener("click", () => (rec.picking || rec.arm === "element" ? stopPicking(rec) : importElement(rec)));
    const radios = (map) => MODES.map((m) => map[m.id]);
    E.modes.addEventListener("keydown", (e) => radioKeys(e, radios(E.modeBtns), (id) => setArm(rec, id)));
    E.armSeg.addEventListener("keydown", (e) => radioKeys(e, radios(E.armSegBtns), (id) => setArm(rec, id)));
    E.armGo.addEventListener("click", () => {
      if (rec.arm === "full") importFull(rec);
      else if (rec.arm === "screenshot") capture(rec);
    });
    E.armOff.addEventListener("click", () => {
      hideTip();
      // a one-shot pick under another armed mode ends the pick only
      if (rec.picking && rec.arm !== "element") cancelPick(rec);
      else setArm(rec, null);
    });
    E.back.addEventListener("click", () => goHistory(rec, -1));
    E.fwd.addEventListener("click", () => goHistory(rec, 1));
    E.reload.addEventListener("click", () => reloadOrStop(rec));
    E.mode.addEventListener("click", () => setMode(rec, rec.mode === "mobile" ? "desktop" : "mobile"));
    E.import.addEventListener("click", () => importFull(rec));
    E.camera.addEventListener("click", () => capture(rec));
    E.expand.addEventListener("click", () => setExpanded(rec, !rec.expanded));
    E.more.addEventListener("click", () => (ui.menu && ui.menu.rec === rec ? closeMenu(true) : openMenu(rec)));
    E.close.addEventListener("click", () => closePanel(rec, { focus: true }));
    E.enter.addEventListener("click", () => E.url.focus({ preventScroll: true }));
    E.errRetry.addEventListener("click", () => {
      clearError(rec);
      if (rec.url) loadUrl(rec, rec.url, true);
    });
    d.addEventListener("transitionend", (e) => {
      if (e.target !== d || e.propertyName !== "opacity") return;
      if (!rec.open) d.hidden = true;
      else nudgeChrome();
    });
    wireResize(rec);
  }

  // ---------------------------------------------------------- open / close
  function setOpenPref(rec, on) {
    const k = rec.key || "default";
    if (on) prefs.open[k] = true;
    else delete prefs.open[k];
    savePrefs();
  }
  function openPanel(rec, opts) {
    const o = opts || {};
    if (rec.open) return true;
    rec.open = true;
    rec.closing = false;
    lastRec = rec;
    if (o.persist !== false) setOpenPref(rec, true);
    ensureDock(rec);
    clearTimeout(rec.closeTimer);
    const d = rec.dock;
    d.hidden = false;
    applyGeometry(rec);
    rec.shell.setAttribute(ATTR.open, "");
    if (o.animate === false) {
      d.setAttribute("data-instant", "");
      d.setAttribute("data-state", "open");
      requestAnimationFrame(() => d.removeAttribute("data-instant"));
    } else {
      d.setAttribute("data-state", "closed");
      void d.offsetWidth; // the slide starts off the right edge
      d.setAttribute("data-state", "open");
    }
    counts.opened++;
    layoutDevice(rec);
    updateNav(rec);
    setPressed(rec);
    nudgeChrome();
    if (o.focus && !rec.url) requestAnimationFrame(() => rec.els && rec.els.url.focus({ preventScroll: true }));
    armTick(rec); // an armed element mode picks again over the page kept loaded
    emit("rtd:canvas-webpanel-change", { shell: rec.shell, open: true, url: rec.url, mode: rec.mode, arm: rec.arm });
    return true;
  }
  function closePanel(rec, opts) {
    const o = opts || {};
    if (!rec.open) return false;
    rec.open = false;
    if (o.persist !== false) setOpenPref(rec, false);
    if (rec.picking) cancelPick(rec);
    if (ui.menu && ui.menu.rec === rec) closeMenu(false);
    if (ui.tipFor && rec.dock && rec.dock.contains(ui.tipFor)) hideTip();
    const d = rec.dock;
    const hadFocus = !!(d && d.contains(document.activeElement));
    rec.shell.removeAttribute(ATTR.open);
    rec.shell.removeAttribute(ATTR.full);
    // the chrome takes the room back once the card is gone (its slide, or
    // reduced motion's fade): canvas-chrome's fixed Share goes to its place
    // at once and would cross the card on its way out (closing keeps the
    // push meanwhile, syncPush)
    rec.closing = !!d && !d.hidden;
    syncPush(rec);
    if (d) {
      d.setAttribute("data-state", "closed");
      clearTimeout(rec.closeTimer);
      rec.closeTimer = setTimeout(
        () => {
          if (rec.open) return;
          d.hidden = true;
          rec.closing = false;
          syncPush(rec);
          nudgeChrome();
        },
        (reducedMotion() ? RM_MS : ANIM_MS) + 20,
      );
    }
    if (rec.expanded) setExpanded(rec, false);
    counts.closed++;
    setPressed(rec);
    nudgeChrome();
    if (hadFocus) {
      const top = topButtonOf(rec);
      const target = rec.btn && shown(rec.btn) ? rec.btn : top && shown(top) ? top : rec.shell.querySelector(CANVAS_ROOT);
      if (target) safe(() => target.focus({ preventScroll: true }));
    }
    emit("rtd:canvas-webpanel-change", { shell: rec.shell, open: false, url: rec.url, mode: rec.mode, arm: rec.arm });
    return true;
  }
  function togglePanel(rec, opts) {
    return rec.open ? (closePanel(rec, opts), false) : openPanel(rec, opts);
  }

  // --------------------------------------------------------------- geometry
  function limits(rec) {
    const r = (rec.host || rec.shell).getBoundingClientRect();
    const maxW = Math.floor(r.width - 2 * MARGIN - MIN_CANVAS);
    const maxH = Math.max(0, Math.floor(r.height - 2 * MARGIN));
    return { r, aw: r.width, ah: r.height, maxW, maxH, tight: maxW < MIN_W };
  }
  // Card size, the "full" state (expanded or a view too narrow to share) and
  // the push the right-anchored floating things get (--rtwp-inset). L: the
  // limits when they were just read (a drag frame reads the view once).
  function applyGeometry(rec, L0) {
    if (!rec.dock) return;
    const L = L0 || limits(rec);
    rec.box = L.r;
    rec.tight = L.tight;
    const w = L.tight ? Math.max(0, Math.floor(L.aw - 2 * MARGIN)) : clamp(Math.round(prefs.ratio * L.aw), MIN_W, L.maxW);
    const hh = clamp(Math.round(prefs.hRatio * L.maxH), Math.min(MIN_H, L.maxH), L.maxH);
    rec.width = w;
    rec.height = hh;
    const full = rec.expanded || L.tight;
    rec.full = full;
    const d = rec.dock;
    setVar(d, "--rtwp-w", w + "px");
    setVar(d, "--rtwp-h", hh + "px");
    toggleAttr(d, "data-full", full);
    toggleAttr(rec.shell, ATTR.full, full && rec.open);
    syncPush(rec);
    const E = rec.els;
    E.sideHandle.setAttribute("aria-valuemin", String(MIN_W));
    E.sideHandle.setAttribute("aria-valuemax", String(Math.max(MIN_W, L.maxW)));
    E.sideHandle.setAttribute("aria-valuenow", String(w));
    E.bottomHandle.setAttribute("aria-valuemin", String(Math.min(MIN_H, L.maxH)));
    E.bottomHandle.setAttribute("aria-valuemax", String(L.maxH));
    E.bottomHandle.setAttribute("aria-valuenow", String(hh));
    E.cornerHandle.setAttribute("aria-valuemin", String(MIN_W));
    E.cornerHandle.setAttribute("aria-valuemax", String(Math.max(MIN_W, L.maxW)));
    E.cornerHandle.setAttribute("aria-valuenow", String(w));
    E.cornerHandle.setAttribute("aria-valuetext", w + " by " + hh + " px");
  }
  // What sits on the right moves past the card while it is open:
  // canvas-chrome reads a container marked data-rcw-open="1" with
  // --rcw-width (the width it covers from that container's right edge: the
  // shell, an ancestor or a descendant) and moves its top pill, selection
  // pill, right card, zoom and composer band itself. The container is a box
  // of no size at the view's top right corner (anchorOf), not the shell: a
  // custom property changed on the shell restyles the whole canvas view
  // (about 5ms a write at 1440, measured; 13ms on <html>), on that box only
  // the box, so a drag writes it every frame for nothing. Without
  // canvas-chrome the app's own top layer gets margin-right: --rtwp-inset
  // (set on that layer, a small box). Expanded on a canvas-chrome view the
  // push stays: the card starts under the chrome's top row (FULL_TOP), whose
  // pills (the globe, Share) keep their place, so expanding or restoring
  // moves nothing on the chrome; what sits under that row hides meanwhile
  // (the CSS). A view too narrow to share (tight) gets no push.
  function syncPush(rec) {
    const sh = rec.shell;
    const on = (rec.open || rec.closing) && !!rec.dock && (!rec.full || (!rec.tight && sh.hasAttribute("data-rcc-shell")));
    const covered = Math.round(rec.width + MARGIN);
    if (on) {
      const a = anchorOf(rec);
      if (a.getAttribute("data-rcw-open") !== "1") a.setAttribute("data-rcw-open", "1");
      setVar(a, "--rcw-width", covered + "px");
    } else if (rec.anchor && rec.anchor.hasAttribute("data-rcw-open")) {
      rec.anchor.removeAttribute("data-rcw-open");
      rec.anchor.style.removeProperty("--rcw-width");
    }
    if (rec.layer) {
      if (on && !sh.hasAttribute("data-rcc-shell")) setVar(rec.layer, "--rtwp-inset", Math.max(0, covered + GAP - 6) + "px"); // the app's row has 6px of padding
      else rec.layer.style.removeProperty("--rtwp-inset");
    }
    publish(rec, on ? covered : 0);
  }
  // canvas-chrome's container (syncPush), in the box the card lives in
  function anchorOf(rec) {
    const host = rec.host || rec.shell;
    if (!rec.anchor) rec.anchor = h("div", { class: "rtwp-anchor", "data-rtwp-own": "", "aria-hidden": "true" });
    if (rec.anchor.parentElement !== host) host.appendChild(rec.anchor);
    return rec.anchor;
  }
  // The card's geometry for whatever keeps clear of it, in the frame it
  // changes (a drag: every frame, before canvas-chrome syncs): on the shell
  // data-rtwp-right-inset (px from the view's right edge to where the
  // right-anchored floating things go: the card and its margin; no attribute
  // when nothing moves) and the window event "rtwp:geometry" {shell, open,
  // full, dragging, rightInset, rect} once per change; rect: the card's
  // layout box in viewport px (where an open / close slide ends), null while
  // it is closed; full: it covers the view under rect.top. No layout read:
  // the view's rect comes from the limits. An attribute no selector names
  // costs nothing, written or read (a custom property on the shell would
  // restyle the whole view, see syncPush).
  function publish(rec, inset) {
    const sh = rec.shell;
    const on = rec.open && !!rec.dock;
    if (inset > 0) {
      if (sh.getAttribute(INSET_ATTR) !== String(inset)) sh.setAttribute(INSET_ATTR, String(inset));
    } else if (sh.hasAttribute(INSET_ATTR)) sh.removeAttribute(INSET_ATTR);
    const b = rec.box;
    let rect = null;
    if (on && b) {
      const top = b.top + (rec.full && sh.hasAttribute("data-rcc-shell") ? FULL_TOP : MARGIN);
      const right = b.right - MARGIN;
      const left = rec.full ? b.left + MARGIN : right - rec.width;
      const bottom = rec.full ? b.bottom - MARGIN : top + rec.height;
      rect = { left, top, right, bottom, width: right - left, height: bottom - top };
    }
    const dragging = sh.hasAttribute(ATTR.dragging);
    const key = rect ? [inset, rec.full, dragging, rect.left, rect.top, rect.right, rect.bottom].join("|") : `closed|${inset}|${dragging}`;
    if (key === rec.pubKey) return;
    const first = rec.pubKey == null;
    rec.pubKey = key;
    if (first && !rect) return; // never opened: nothing to take back
    if (ui.toast && ui.toast.rec === rec) placeToast(ui.toast);
    emit("rtwp:geometry", { shell: sh, open: on, full: !!(on && rec.full), dragging, rightInset: inset, rect });
  }
  // A size in pixels (a drag frame, the keys, the API), stored as ratios of
  // the view (a resized window keeps the card's share of it); one read.
  function resizeTo(rec, w, hh, persist) {
    const L = limits(rec);
    let changed = false;
    if (w != null && !L.tight && L.aw) {
      prefs.ratio = clamp(Math.round(w), MIN_W, L.maxW) / L.aw;
      changed = true;
    }
    if (hh != null && L.maxH) {
      const v = clamp(Math.round(hh), Math.min(MIN_H, L.maxH), L.maxH);
      prefs.hRatio = clamp(v / L.maxH, 0.05, 1);
      changed = true;
    }
    if (!changed) return false;
    applyGeometry(rec, L);
    if (persist !== false) savePrefs();
    return true;
  }
  const setWidthPx = (rec, px, persist) => resizeTo(rec, px, null, persist);
  const setHeightPx = (rec, px, persist) => resizeTo(rec, null, px, persist);
  // A width changed in one step (the keys, a double click, Reset size, the
  // API): canvas-chrome slides its right-anchored chrome to the new edge
  // (its FLIP on translate, 220ms out). A card that grows slides its edge
  // along on the same curve and clock, so the two stay 12px apart in every
  // frame; one that shrinks moves at once and the chrome follows it (its
  // fixed Share goes to its place at once: a card still on its way would
  // run under it). When the chrome moves at once (a resize under way,
  // reduced motion, no chrome), so does the card.
  function stepSize(rec, fn) {
    const w0 = rec.open && !rec.full ? rec.width : null;
    fn();
    nudgeChrome();
    const d = rec.dock;
    if (w0 == null || !d || !rec.open || rec.full || rec.width - w0 < 0.5 || typeof d.animate !== "function" || !chromeSlides(rec)) return;
    d.animate([{ translate: `${rec.width - w0}px 0` }, { translate: "0 0" }], { duration: ANIM_MS, easing: EASE_OUT });
  }
  // canvas-chrome has just started sliding this view's right-anchored chrome
  function chromeSlides(rec) {
    const n = rec.shell.querySelector(".rcc-top, .rcc-zoom");
    if (!n || typeof n.getAnimations !== "function") return false;
    return n.getAnimations().some((a) => a.constructor === Animation && (a.pending || (a.currentTime || 0) < 34));
  }
  function setExpanded(rec, on) {
    rec.expanded = !!on;
    if (!rec.dock) return rec.expanded;
    const E = rec.els;
    E.expand.replaceChildren(icon(rec.expanded ? "collapse" : "expand"));
    E.expand.setAttribute("aria-pressed", rec.expanded ? "true" : "false");
    E.expand.setAttribute("aria-label", rec.expanded ? "Restore" : "Expand");
    E.expand.setAttribute("data-rtwp-tip", rec.expanded ? "Restore" : "Expand");
    applyGeometry(rec);
    nudgeChrome();
    requestAnimationFrame(() => layoutDevice(rec));
    return rec.expanded;
  }

  // Drags: the latest pointer position lands in the next animation frame,
  // and canvas-chrome syncs in that same frame (its chrome follows the edge
  // before the paint: no lag, no jump; ui-motion marks the drag as a resize,
  // so the chrome only follows the geometry meanwhile).
  function wireResize(rec) {
    const E = rec.els;
    let drag = null;
    const frame = () => {
      if (!drag) return;
      drag.raf = 0;
      resizeTo(rec, drag.axis !== "y" ? drag.w + (drag.x - drag.cx) : null, drag.axis !== "x" ? drag.h + (drag.cy - drag.y) : null, false);
      nudgeChrome();
    };
    const start = (axis) => (e) => {
      if (e.button !== 0 || rec.full) return;
      e.preventDefault();
      drag = { axis, x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY, w: rec.width, h: rec.height, id: e.pointerId, el: e.currentTarget, raf: 0 };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (_) {}
      rec.shell.setAttribute(ATTR.dragging, "");
      rec.dock.setAttribute("data-dragging", "");
      document.documentElement.classList.add(axis === "x" ? "rtwp-resizing-x" : axis === "y" ? "rtwp-resizing-y" : "rtwp-resizing-xy");
      syncPush(rec);
    };
    const move = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.cx = e.clientX;
      drag.cy = e.clientY;
      if (!drag.raf) drag.raf = requestAnimationFrame(frame);
    };
    const end = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      if (drag.raf) {
        cancelAnimationFrame(drag.raf);
        frame(); // the last position lands
      }
      drag = null;
      rec.shell.removeAttribute(ATTR.dragging);
      if (rec.dock) rec.dock.removeAttribute("data-dragging");
      document.documentElement.classList.remove("rtwp-resizing-x", "rtwp-resizing-y", "rtwp-resizing-xy");
      savePrefs();
      syncPush(rec);
      nudgeChrome();
    };
    rec.endDrag = () => end(); // a view removed mid-drag never sends these here
    for (const [el, axis] of [
      [E.sideHandle, "x"],
      [E.bottomHandle, "y"],
      [E.cornerHandle, "xy"],
    ]) {
      el.addEventListener("pointerdown", start(axis));
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
      el.addEventListener("lostpointercapture", end);
    }
    const reset = (w, hgt) =>
      stepSize(rec, () => {
        if (w) prefs.ratio = DEFAULT_RATIO;
        if (hgt) prefs.hRatio = 1;
        applyGeometry(rec);
        savePrefs();
      });
    E.sideHandle.addEventListener("dblclick", () => reset(true, false));
    E.bottomHandle.addEventListener("dblclick", () => reset(false, true));
    E.cornerHandle.addEventListener("dblclick", () => reset(true, true));
    // The keys (role=separator): onKey hands them over at window capture,
    // before the canvas sees them (with a selection, the app nudges it on the
    // arrows wherever the focus is). true: handled.
    rec.handleKey = (el, e) => {
      const step = e.shiftKey ? KEY_STEP * 4 : KEY_STEP;
      if (e.metaKey || e.ctrlKey || e.altKey) return false;
      if (el === E.cornerHandle) {
        const L = limits(rec);
        let w = null;
        let v = null;
        if (e.key === "ArrowLeft") w = rec.width + step;
        else if (e.key === "ArrowRight") w = rec.width - step;
        else if (e.key === "ArrowUp") v = rec.height - step;
        else if (e.key === "ArrowDown") v = rec.height + step;
        else if (e.key === "Home") (w = L.maxW), (v = L.maxH);
        else if (e.key === "End") (w = MIN_W), (v = MIN_H);
        else if (e.key === "Enter") {
          reset(true, true);
          return true;
        }
        if (w == null && v == null) return false;
        stepSize(rec, () => resizeTo(rec, w, v, true));
        return true;
      }
      if (el === E.sideHandle) {
        let w = null;
        if (e.key === "ArrowLeft") w = rec.width + step;
        else if (e.key === "ArrowRight") w = rec.width - step;
        else if (e.key === "Home") w = limits(rec).maxW;
        else if (e.key === "End") w = MIN_W;
        else if (e.key === "Enter") {
          reset(true, false);
          return true;
        }
        if (w == null) return false;
        stepSize(rec, () => setWidthPx(rec, w, true));
        return true;
      }
      if (el === E.bottomHandle) {
        let v = null;
        if (e.key === "ArrowUp") v = rec.height - step;
        else if (e.key === "ArrowDown") v = rec.height + step;
        else if (e.key === "Home") v = MIN_H;
        else if (e.key === "End" || e.key === "Enter") v = limits(rec).maxH;
        if (v == null) return false;
        setHeightPx(rec, v, true);
        return true;
      }
      return false;
    };
  }

  // --------------------------------------------------------------- viewport
  function setMode(rec, mode) {
    const m = mode === "mobile" ? "mobile" : "desktop";
    rec.mode = m;
    prefs.mode = m;
    savePrefs();
    if (!rec.dock) return m;
    rec.dock.setAttribute("data-mode", m);
    const b = rec.els.mode;
    b.replaceChildren(icon(m === "mobile" ? "mobile" : "desktop"));
    b.setAttribute("aria-pressed", m === "mobile" ? "true" : "false");
    b.setAttribute("data-rtwp-tip", m === "mobile" ? "Mobile viewport · 390 px" : "Desktop viewport · 1280 px");
    layoutDevice(rec);
    emit("rtd:canvas-webpanel-change", { shell: rec.shell, open: rec.open, url: rec.url, mode: m });
    return m;
  }
  function layoutDevice(rec) {
    if (!rec.dock || rec.dock.hidden) return;
    const E = rec.els;
    const r = E.view.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const aw = Math.max(1, r.width - 2 * STAGE_PAD);
    const ah = Math.max(1, r.height - 2 * STAGE_PAD);
    const vw = VIEWPORT[rec.mode] || VIEWPORT.desktop;
    // the scale comes from the whole-pixel box width and the height rounds up,
    // so the scaled page always covers the box (no sub-pixel strip at its edges)
    const boxW = Math.max(1, Math.floor(Math.min(aw, vw)));
    const s = boxW / vw;
    const st = E.device.style;
    st.left = Math.round(STAGE_PAD + (aw - boxW) / 2) + "px";
    st.width = boxW + "px";
    st.setProperty("--rtwp-gw", vw + "px");
    st.setProperty("--rtwp-gh", Math.ceil(ah / s) + "px");
    st.setProperty("--rtwp-s", String(s));
    rec.dock.setAttribute("data-scale", String(Math.round(s * 1000) / 1000));
  }

  // ----------------------------------------------------------------- guests
  function makeGuest(url) {
    if (engine() === "webview") {
      const w = document.createElement("webview");
      w.setAttribute("partition", PARTITION);
      try {
        const p = window.browserBridge && window.browserBridge.webviewPreloadPath;
        if (p) w.setAttribute("preload", fileUrl(String(p)));
      } catch (_) {}
      w.setAttribute("useragent", cleanUA());
      w.setAttribute("allowpopups", "");
      w.setAttribute("data-testid", "canvas-webpanel-webview");
      w.setAttribute("class", "rtwp-guest");
      w.setAttribute("data-rtwp-own", "");
      w.setAttribute("src", url);
      return w;
    }
    const i = document.createElement("iframe");
    i.className = "rtwp-guest";
    i.setAttribute("data-testid", "canvas-webpanel-iframe");
    i.setAttribute("data-rtwp-own", "");
    i.setAttribute("allow", "clipboard-read; clipboard-write; fullscreen");
    i.src = url;
    return i;
  }
  let engineWait = false;
  function waitEngine() {
    if (engineWait) return;
    engineWait = true;
    const done = () => {
      if (!engine()) engineKind = "iframe";
      for (const rec of recs.values())
        if (!rec.guest && rec.pendingUrl) {
          const u = rec.pendingUrl;
          rec.pendingUrl = null;
          loadUrl(rec, u, false);
        }
    };
    try {
      if (window.customElements) window.customElements.whenDefined("webview").then(done, () => {});
    } catch (_) {}
    window.addEventListener("load", () => setTimeout(done, 0), { once: true });
  }
  function ensureGuest(rec, url) {
    if (rec.guest) return false;
    if (!engine()) {
      rec.pendingUrl = url;
      setLoading(rec, true);
      waitEngine();
      return true;
    }
    const g = makeGuest(url);
    rec.guest = g;
    rec.kind = g.tagName === "WEBVIEW" ? "webview" : "iframe";
    rec.nav.ready = false;
    setLoading(rec, true);
    if (rec.kind === "webview") {
      g.addEventListener("dom-ready", () => {
        rec.nav.ready = true;
        updateNav(rec);
      });
      g.addEventListener("did-start-loading", () => setLoading(rec, true));
      g.addEventListener("did-stop-loading", () => {
        setLoading(rec, false);
        updateNav(rec);
        pageSettled(rec);
      });
      g.addEventListener("did-navigate", (e) => {
        dropPick(rec); // the picker lived in the document that just went away
        onUrl(rec, e.url, true);
      });
      g.addEventListener("did-navigate-in-page", (e) => {
        if (e.isMainFrame !== false) onUrl(rec, e.url, false);
      });
      g.addEventListener("page-title-updated", (e) => onTitle(rec, e.title));
      g.addEventListener("page-favicon-updated", (e) => onFavicon(rec, e.favicons && e.favicons[0]));
      g.addEventListener("did-fail-load", (e) => {
        if (e.isMainFrame === false || e.errorCode === -3) return;
        showError(rec, e.errorDescription || "The page could not load");
        setLoading(rec, false);
      });
    } else {
      rec.hist = { list: [url], idx: 0, skip: true };
      g.addEventListener("load", () => onIframeLoad(rec));
    }
    rec.els.device.appendChild(g);
    rec.dock.setAttribute("data-has-page", "");
    return true;
  }
  function loadUrl(rec, url, force) {
    if (!loadable(url)) return false;
    ensureDock(rec);
    const same = url === rec.url;
    rec.url = url;
    setUrlField(rec);
    if (ensureGuest(rec, url)) {
      updateNav(rec);
      return true;
    }
    if (same && !force) {
      updateNav(rec);
      return true;
    }
    clearError(rec);
    if (rec.picking) cancelPick(rec);
    const g = rec.guest;
    if (rec.kind === "webview") {
      if (rec.nav.ready && typeof g.loadURL === "function") {
        try {
          const p = g.loadURL(url);
          if (p && typeof p.catch === "function")
            p.catch((err) => {
              const msg = String((err && err.message) || err || "");
              if (!/ERR_ABORTED|\(-3\)/.test(msg)) showError(rec, msg || "The page could not load");
            });
        } catch (_) {
          g.setAttribute("src", url);
        }
      } else g.setAttribute("src", url);
    } else {
      const hs = rec.hist;
      hs.list = hs.list.slice(0, hs.idx + 1);
      hs.list.push(url);
      hs.idx = hs.list.length - 1;
      hs.skip = true;
      setLoading(rec, true);
      g.src = url;
    }
    updateNav(rec);
    return true;
  }
  function navigate(rec, url) {
    if (!url) return false;
    if (!rec.open) openPanel(rec, { focus: false });
    return loadUrl(rec, url, true);
  }
  function onIframeLoad(rec) {
    dropPick(rec); // a new document: the picker went with the old one
    const g = rec.guest;
    let href = null;
    let title = null;
    try {
      href = g.contentWindow.location.href;
      title = g.contentDocument && g.contentDocument.title;
      g.contentWindow.addEventListener("pagehide", () => setLoading(rec, true), { once: true });
    } catch (_) {}
    setLoading(rec, false);
    const hs = rec.hist;
    if (href && href !== "about:blank") {
      if (hs.skip) {
        hs.skip = false;
        hs.list[hs.idx] = href;
      } else if (href !== hs.list[hs.idx]) {
        hs.list = hs.list.slice(0, hs.idx + 1);
        hs.list.push(href);
        hs.idx = hs.list.length - 1;
      }
      onUrl(rec, href, true);
    } else {
      hs.skip = false;
      if (rec.url) addRecent(rec.url, ""); // cross-origin: the URL we asked for
    }
    if (title) onTitle(rec, title);
    updateNav(rec);
    pageSettled(rec);
  }
  function onUrl(rec, url, committed) {
    if (!loadable(url)) return;
    rec.url = url;
    if (committed) addRecent(url, "");
    setUrlField(rec);
    updateNav(rec);
  }
  function onTitle(rec, t) {
    rec.pageTitle = String(t || "").slice(0, 200);
    if (rec.url) setRecentTitle(rec.url, rec.pageTitle);
  }
  function onFavicon(rec, src) {
    if (!src || !/^(https?|data):/i.test(src) || !rec.els) return;
    rec.els.favicon.src = src;
    rec.els.favicon.hidden = false;
    rec.els.globe.setAttribute("hidden", "");
  }
  // A page finished loading (updateNav has already enabled the pill's
  // one-click action): an armed element mode puts the picker back on it.
  function pageSettled(rec) {
    armTick(rec);
  }
  function setUrlField(rec) {
    if (!rec.els) return;
    const E = rec.els;
    if (document.activeElement !== E.url && E.url.value !== (rec.url || "")) {
      E.url.value = rec.url || "";
      E.url.scrollLeft = 0;
    }
    if (!rec.url) {
      E.favicon.hidden = true;
      E.globe.removeAttribute("hidden");
    }
  }
  function setLoading(rec, on) {
    if (rec.nav.loading === on || !rec.els) return;
    rec.nav.loading = on;
    toggleAttr(rec.dock, "data-loading", on);
    const b = rec.els.reload;
    b.replaceChildren(icon(on ? "stop" : "reload"));
    b.setAttribute("aria-label", on ? "Stop" : "Reload");
    b.setAttribute("data-rtwp-tip", on ? "Stop" : "Reload");
    renderArmbar(rec);
  }
  function showError(rec, desc) {
    if (!rec.els) return;
    rec.els.errDesc.textContent = desc;
    rec.els.error.hidden = false;
    renderArmbar(rec);
  }
  function clearError(rec) {
    if (!rec.els) return;
    rec.els.error.hidden = true;
    renderArmbar(rec);
  }
  const canCapture = (rec) => !!(rec.guest && rec.kind === "webview" && typeof rec.guest.capturePage === "function");
  function updateNav(rec) {
    if (!rec.els) return;
    let back = false;
    let fwd = false;
    const g = rec.guest;
    if (g && rec.kind === "webview" && rec.nav.ready) {
      try {
        back = !!g.canGoBack();
        fwd = !!g.canGoForward();
      } catch (_) {}
    } else if (g && rec.hist) {
      back = rec.hist.idx > 0;
      fwd = rec.hist.idx < rec.hist.list.length - 1;
    }
    rec.nav.back = back;
    rec.nav.fwd = fwd;
    const E = rec.els;
    E.back.disabled = !back;
    E.fwd.disabled = !fwd;
    E.reload.disabled = !g;
    const has = loadable(rec.url) && !!g;
    E.import.disabled = !has;
    E.pick.disabled = !has;
    E.camera.disabled = !canCapture(rec);
    E.camera.setAttribute("data-rtwp-tip", g && !canCapture(rec) ? "Screenshots need the app's browser" : "Import a screenshot");
    toggleAttr(rec.dock, "data-empty", !has);
    markArm(rec);
  }
  function goHistory(rec, delta) {
    const g = rec.guest;
    if (!g) return;
    clearError(rec);
    if (rec.picking) cancelPick(rec);
    if (rec.kind === "webview") {
      try {
        delta < 0 ? g.goBack() : g.goForward();
      } catch (_) {}
      return;
    }
    const hs = rec.hist;
    const i = hs.idx + delta;
    if (i < 0 || i >= hs.list.length) return;
    hs.idx = i;
    hs.skip = true;
    setLoading(rec, true);
    g.src = hs.list[i];
    rec.url = hs.list[i];
    setUrlField(rec);
    updateNav(rec);
  }
  function reloadOrStop(rec) {
    const g = rec.guest;
    if (!g) return;
    if (rec.picking) cancelPick(rec);
    if (rec.kind === "webview") {
      try {
        if (rec.nav.loading) g.stop();
        else {
          clearError(rec);
          g.reload();
        }
      } catch (_) {}
      return;
    }
    if (rec.nav.loading) {
      try {
        g.contentWindow.stop();
      } catch (_) {}
      setLoading(rec, false);
      return;
    }
    clearError(rec);
    setLoading(rec, true);
    try {
      g.contentWindow.location.reload();
    } catch (_) {
      rec.hist.skip = true;
      g.src = rec.hist.list[rec.hist.idx] || rec.url;
    }
  }
  function openExternal(url) {
    if (!/^https?:/i.test(url || "")) return;
    const api = window.electronAPI;
    if (api && typeof api.openExternal === "function") {
      try {
        const p = api.openExternal(url);
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch (_) {}
    } else window.open(url, "_blank", "noopener,noreferrer");
  }

  // --------------------------------------------------- code run in the page
  // executeJavaScript (webview, with a user gesture) or the iframe's own
  // eval (same origin only). Both return what the code evaluates to.
  function runInPage(rec, src) {
    const g = rec.guest;
    if (!g) return Promise.reject(new Error("no page"));
    if (rec.kind === "webview") return Promise.resolve(g.executeJavaScript(src, true));
    return new Promise((resolve, reject) => {
      try {
        resolve(g.contentWindow.eval(src));
      } catch (err) {
        reject(err);
      }
    });
  }
  // The page as one HTML document: scripts dropped, readable stylesheets
  // inlined, URLs absolute (<base>), form values kept.
  const PAGE_SRC = `(() => {
    const abs = (u) => { try { return new URL(u, document.baseURI).href; } catch (e) { return u; } };
    const css = [];
    const keepLinks = [];
    for (const sh of Array.from(document.styleSheets)) {
      try { css.push(Array.from(sh.cssRules).map((r) => r.cssText).join("\\n")); }
      catch (e) { if (sh.href) keepLinks.push(sh.href); }
    }
    const root = document.documentElement.cloneNode(true);
    root.querySelectorAll("script, noscript, link[rel~=stylesheet], style, base, meta[http-equiv]").forEach((n) => n.remove());
    for (const el of root.querySelectorAll("[src]")) el.setAttribute("src", abs(el.getAttribute("src")));
    for (const el of root.querySelectorAll("a[href], area[href]")) el.setAttribute("href", abs(el.getAttribute("href")));
    for (const el of root.querySelectorAll("[srcset]")) el.removeAttribute("srcset");
    const live = document.querySelectorAll("input, textarea, select");
    const cl = root.querySelectorAll("input, textarea, select");
    live.forEach((n, i) => { const c = cl[i]; if (!c) return; if (n.type === "checkbox" || n.type === "radio") { if (n.checked) c.setAttribute("checked", ""); else c.removeAttribute("checked"); } else if (n.tagName === "TEXTAREA") c.textContent = n.value; else if (n.tagName !== "SELECT") c.setAttribute("value", n.value); });
    let head = root.querySelector("head");
    if (!head) { head = document.createElement("head"); root.prepend(head); }
    const base = document.createElement("base"); base.href = location.href; head.prepend(base);
    for (const href of keepLinks) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; head.append(l); }
    const st = document.createElement("style"); st.textContent = css.join("\\n"); head.append(st);
    return { html: "<!doctype html>\\n" + root.outerHTML, title: document.title || location.host, w: innerWidth, h: Math.max(document.documentElement.scrollHeight, innerHeight) };
  })()`;
  // Element picker: outline + label on hover, click picks, Esc cancels. The
  // picked element comes back with its box and a standalone HTML copy (its
  // subtree with the computed styles inlined); Esc comes back as {esc: true},
  // a cancel from outside (window.__rtwpPick.cancel()) as null.
  const PICK_SRC = `(() => new Promise((resolve) => {
    if (window.__rtwpPick) window.__rtwpPick.cancel();
    const PROPS = ["display","position","top","right","bottom","left","z-index","box-sizing","width","height","min-width","min-height","max-width","max-height","margin-top","margin-right","margin-bottom","margin-left","padding-top","padding-right","padding-bottom","padding-left","border-top-width","border-right-width","border-bottom-width","border-left-width","border-top-style","border-right-style","border-bottom-style","border-left-style","border-top-color","border-right-color","border-bottom-color","border-left-color","border-top-left-radius","border-top-right-radius","border-bottom-right-radius","border-bottom-left-radius","background-color","background-image","background-size","background-position","background-repeat","color","font-family","font-size","font-weight","font-style","line-height","letter-spacing","text-align","text-transform","text-decoration-line","text-overflow","white-space","word-break","flex-direction","flex-wrap","justify-content","align-items","align-content","align-self","gap","row-gap","column-gap","flex-grow","flex-shrink","flex-basis","order","grid-template-columns","grid-template-rows","grid-column","grid-row","opacity","box-shadow","overflow-x","overflow-y","object-fit","object-position","transform","vertical-align","list-style-type","fill","stroke","stroke-width","cursor","visibility"];
    const SKIP = new Set(["", "none", "normal", "auto", "0px", "rgba(0, 0, 0, 0)", "visible", "static", "0% 0%", "repeat", "baseline", "start", "nowrap", "row", "stretch", "content-box", "solid 0px"]);
    const KEEP_ZERO = new Set(["opacity"]);
    const snap = (el) => {
      const src = [el, ...el.querySelectorAll("*")];
      if (src.length > 4000) return null;
      const clone = el.cloneNode(true);
      const dst = [clone, ...clone.querySelectorAll("*")];
      src.forEach((n, i) => {
        const d = dst[i]; if (!d) return;
        const cs = getComputedStyle(n); let s = "";
        for (const p of PROPS) { const v = cs.getPropertyValue(p); if (!v || (SKIP.has(v) && !KEEP_ZERO.has(p))) continue; if (p === "opacity" && v === "1") continue; if ((p === "flex-shrink" && v === "1") || (p === "flex-grow" && v === "0") || (p === "order" && v === "0")) continue; s += p + ":" + v + ";"; }
        d.setAttribute("style", s);
        d.removeAttribute("class");
        if (n.tagName === "IMG" && n.currentSrc) d.setAttribute("src", n.currentSrc);
        if (n.tagName === "A" && n.href) d.setAttribute("href", n.href);
        if (d.hasAttribute("srcset")) d.removeAttribute("srcset");
      });
      clone.querySelectorAll("script, noscript").forEach((n) => n.remove());
      const r = el.getBoundingClientRect();
      clone.style.position = "relative"; clone.style.top = "0"; clone.style.left = "0"; clone.style.margin = "0";
      clone.style.width = Math.round(r.width) + "px";
      const bodyBg = getComputedStyle(document.body).backgroundColor;
      return "<!doctype html>\\n<html><head><meta charset=\\"utf-8\\"><base href=\\"" + location.href.replace(/"/g, "&quot;") + "\\"><title>" + (document.title || location.host).replace(/</g, "&lt;") + "</title></head><body style=\\"margin:0;background:" + bodyBg + "\\">" + clone.outerHTML + "</body></html>";
    };
    const ov = document.createElement("div");
    ov.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #0091ff;background:rgba(0,145,255,.10);border-radius:2px;display:none;box-sizing:border-box";
    const tag = document.createElement("div");
    tag.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;background:#0091ff;color:#fff;font:600 11px/16px -apple-system,system-ui,sans-serif;padding:2px 6px;border-radius:4px;display:none;white-space:nowrap";
    document.documentElement.append(ov, tag);
    let cur = null;
    const show = (el) => { cur = el; const r = el.getBoundingClientRect(); Object.assign(ov.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" }); tag.textContent = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + "  " + Math.round(r.width) + "×" + Math.round(r.height); Object.assign(tag.style, { display: "block", left: Math.max(0, r.left) + "px", top: Math.max(0, r.top - 22) + "px" }); };
    const onMove = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); if (el && el !== ov && el !== tag && el !== document.documentElement) show(el); };
    const block = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
    const onClick = (e) => { block(e); const el = cur || document.elementFromPoint(e.clientX, e.clientY); finish(el && el !== document.documentElement ? el : null); };
    const onKey = (e) => { if (e.key === "Escape") { block(e); finish(null, true); } };
    const opts = { capture: true };
    addEventListener("pointermove", onMove, opts); addEventListener("mousemove", onMove, opts);
    addEventListener("click", onClick, opts); addEventListener("pointerdown", block, opts); addEventListener("mousedown", block, opts); addEventListener("pointerup", block, opts); addEventListener("mouseup", block, opts);
    addEventListener("keydown", onKey, opts);
    let done = false;
    function finish(el, esc) {
      if (done) return; done = true;
      removeEventListener("pointermove", onMove, opts); removeEventListener("mousemove", onMove, opts);
      removeEventListener("click", onClick, opts); removeEventListener("pointerdown", block, opts); removeEventListener("mousedown", block, opts); removeEventListener("pointerup", block, opts); removeEventListener("mouseup", block, opts);
      removeEventListener("keydown", onKey, opts);
      ov.remove(); tag.remove(); delete window.__rtwpPick;
      if (!el) return resolve(esc ? { esc: true } : null);
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        let html = null; try { html = snap(el); } catch (e) {}
        resolve({ x: r.left, y: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, tag: el.tagName.toLowerCase(), id: el.id || "", label: (el.getAttribute("aria-label") || el.innerText || "").trim().slice(0, 60), html, title: document.title || location.host });
      }));
    }
    window.__rtwpPick = { cancel: () => finish(null) };
  }))()`;

  // -------------------------------------------------------- canvas placement
  // canvas-browser and canvas-shader deselect their frame on any pointerdown
  // outside it (window, capture phase), before Import's click. This observer
  // notes every frame that loses data-selected; a press in the card within
  // 100 ms of that (same press: microtasks run between a native event's
  // listeners) keeps that frame as the anchor, whatever the load order.
  const SEL_FRAMES = ".rtbf-frame, .rtsh-frame";
  const PRESS_MS = 100;
  let lastDeselect = null;
  let pressDeselect = null;
  function noteDeselect(list) {
    for (const m of list) {
      const n = m.target;
      if (m.oldValue !== null && n.nodeType === 1 && !n.hasAttribute("data-selected") && n.matches(SEL_FRAMES)) lastDeselect = { el: n, t: performance.now() };
    }
  }
  const selMo = new MutationObserver(noteDeselect);
  function readDeselect(fromPanel) {
    noteDeselect(selMo.takeRecords());
    if (fromPanel && lastDeselect && performance.now() - lastDeselect.t < PRESS_MS) pressDeselect = { ...lastDeselect };
  }
  // World point for a w x h item: right of the selection, else the middle of
  // the canvas part the card leaves visible.
  function placement(rec, w, hh) {
    const root = rec.shell.querySelector(CANVAS_ROOT);
    if (!root) return null;
    const wiring = wiringOf(root);
    const v = viewOf(root, wiring.handle);
    const rr = root.getBoundingClientRect();
    const toWorld = (cx, cy) => ({ x: (cx - rr.left - v.x) / v.zoom, y: (cy - rr.top - v.y) / v.zoom });
    let box = null;
    const add = (r) => {
      if (!r || r.width <= 0 || r.height <= 0) return;
      box = box ? { l: Math.min(box.l, r.left), t: Math.min(box.t, r.top), r: Math.max(box.r, r.right), b: Math.max(box.b, r.bottom) } : { l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    let ids = [];
    try {
      ids = wiring.handle && typeof wiring.handle.getSelection === "function" ? wiring.handle.getSelection() || [] : [];
    } catch (_) {}
    for (const raw of ids) {
      const id = String(typeof raw === "object" && raw ? raw.id : raw);
      const sel = `[data-storyboard-id="${CSS.escape(id)}"]`;
      let item = root.querySelector(sel);
      while (item && item.parentElement && item.parentElement.closest(sel)) item = item.parentElement.closest(sel);
      if (item) add(item.getBoundingClientRect());
    }
    for (const f of root.querySelectorAll(".rtbf-frame[data-selected], .rtsh-frame[data-selected]")) add(f.getBoundingClientRect());
    const pd = pressDeselect;
    if (!box && pd && performance.now() - pd.t < 3000 && pd.el.isConnected && root.contains(pd.el)) add(pd.el.getBoundingClientRect());
    if (box) {
      const p = toWorld(box.r, box.t);
      return { x: Math.round(p.x + IMPORT_GAP), y: Math.round(p.y), zoom: v.zoom, via: "selection" };
    }
    let right = rr.right;
    if (rec.open && !rec.full && rec.dock) right = Math.min(right, rec.dock.getBoundingClientRect().left - GAP);
    const c = toWorld((rr.left + right) / 2, rr.top + rr.height / 2);
    return { x: Math.round(c.x - w / 2), y: Math.round(c.y - hh / 2), zoom: v.zoom, via: "center" };
  }

  function htmlDropOf(rec) {
    const root = rec.shell.querySelector(CANVAS_ROOT);
    const d = root && wiringOf(root).htmlDrop;
    return d && typeof d.current === "function" ? d : null;
  }
  // An HTML document onto the canvas through the app's own .html drop.
  function dropHtml(rec, html, name, at) {
    const drop = htmlDropOf(rec);
    if (!drop || !html || html.length > MAX_HTML || !at) return false;
    const safeName = (String(name || "Web import").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || "Web import") + ".html";
    let file;
    try {
      file = new File([html], safeName, { type: "text/html" });
    } catch (_) {
      return false;
    }
    try {
      drop.current([file], { x: at.x, y: at.y });
      return true;
    } catch (err) {
      console.warn("[canvas-webpanel] HTML drop failed", err);
      return false;
    }
  }

  // ------------------------------------------------------------------ modes
  const setAttr = (el, a, v) => {
    if (el.getAttribute(a) !== v) el.setAttribute(a, v);
  };
  // a page to import from: loaded, and not the error card
  const pageReady = (rec) => !!rec.guest && loadable(rec.url) && !rec.nav.loading && (rec.kind !== "webview" || rec.nav.ready) && !!rec.els && rec.els.error.hidden;

  // Arrow keys move the check along a radio group (WAI-ARIA radio pattern),
  // Home / End jump to its ends. `buttons` are in MODES order.
  function radioKeys(e, buttons, choose) {
    const i = buttons.indexOf(document.activeElement);
    if (i < 0 || e.altKey || e.metaKey || e.ctrlKey) return;
    const n = buttons.length;
    const j =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? (i + 1) % n
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? (i - 1 + n) % n
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : -1;
    if (j < 0) return;
    e.preventDefault();
    choose(MODES[j].id);
    buttons[j].focus({ preventScroll: true });
  }

  // Arms a mode (null turns it off). The page open now gets it at once, the
  // next page once it has loaded.
  function setArm(rec, id) {
    const next = modeOf(id) ? id : null;
    if (next !== rec.arm) {
      rec.arm = next;
      clearTimeout(rec.armTimer);
      if (rec.picking) cancelPick(rec); // element turned off, or a one-shot pick under the old mode
      emit("rtd:canvas-webpanel-change", { shell: rec.shell, open: rec.open, url: rec.url, mode: rec.mode, arm: rec.arm });
    }
    markArm(rec);
    armTick(rec);
    return rec.arm;
  }

  // Everything that shows the armed mode: the empty card's radios and hint,
  // the address field's icon, the bar (pick pressed, Import / camera tinted)
  // and the pill.
  function markArm(rec) {
    const E = rec.els;
    if (!E) return;
    const m = modeOf(rec.arm);
    MODES.forEach((x, i) => {
      const on = rec.arm === x.id;
      setAttr(E.modeBtns[x.id], "aria-checked", on ? "true" : "false");
      setAttr(E.modeBtns[x.id], "tabindex", on || (!m && i === 0) ? "0" : "-1");
      setAttr(E.armSegBtns[x.id], "aria-checked", on ? "true" : "false");
      setAttr(E.armSegBtns[x.id], "tabindex", on ? "0" : "-1");
      if (on) E.armSeg.style.setProperty("--rtwp-seg-i", String(i));
    });
    const next = m ? m.next : "";
    if (E.modeNext.textContent !== next) {
      E.modeNext.textContent = next;
      if (next) swapIn(E.modeNext);
    }
    // no page yet: the address field leads with the armed mode's icon and
    // is described by the hint
    const lead = m && !rec.url ? m.id : "";
    if (lead) {
      if (E.site.getAttribute("data-arm") !== lead) {
        E.siteMode.replaceChildren(icon(m.icon));
        E.site.setAttribute("data-arm", lead);
        swapIn(E.siteMode);
      }
      setAttr(E.url, "aria-describedby", E.modeNext.id);
    } else {
      if (E.site.hasAttribute("data-arm")) E.site.removeAttribute("data-arm");
      if (E.url.hasAttribute("aria-describedby")) E.url.removeAttribute("aria-describedby");
    }
    if (m) setAttr(rec.dock, "data-arm", m.id);
    else if (rec.dock.hasAttribute("data-arm")) rec.dock.removeAttribute("data-arm");
    const live = rec.picking || rec.arm === "element";
    setAttr(E.pick, "aria-pressed", live ? "true" : "false");
    setAttr(E.pick, "data-rtwp-tip", live ? "Stop picking" : "Import an element");
    if (live) setAttr(E.pick, "data-rtwp-kbd", "Esc");
    else if (E.pick.hasAttribute("data-rtwp-kbd")) E.pick.removeAttribute("data-rtwp-kbd");
    for (const [el, id] of [
      [E.pick, "element"],
      [E.import, "full"],
      [E.camera, "screenshot"],
    ]) {
      toggleAttr(el, "data-armed", rec.arm === id);
      if (rec.arm === id) setAttr(el, "aria-description", "Armed");
      else if (el.hasAttribute("aria-description")) el.removeAttribute("aria-description");
    }
    renderArmbar(rec);
  }

  // The pill at the bottom of the page: shown while a mode is armed or the
  // picker is live, over a page (not on the empty card, not over an error).
  function renderArmbar(rec) {
    const E = rec.els;
    if (!E || !E.armbar) return;
    const variant = rec.arm === "element" ? "element" : rec.picking ? "pick" : rec.arm;
    const show = !!variant && !!rec.guest && loadable(rec.url) && E.error.hidden;
    const was = E.armbar.hasAttribute("data-shown");
    if (!show && was && E.armbar.contains(document.activeElement)) safe(() => (E.pick.disabled ? E.url : E.pick).focus({ preventScroll: true }));
    toggleAttr(E.armbar, "data-shown", show);
    toggleAttr(E.armbar, "inert", !show);
    toggleAttr(E.armbar, "data-waiting", show && !pageReady(rec)); // the page is still loading: the picker isn't live yet
    if (!variant) return;
    const prev = E.armbar.getAttribute("data-variant");
    if (prev !== variant) {
      E.armbar.setAttribute("data-variant", variant);
      if (was && show && prev) swapIn(E.armMain);
    }
    const m = modeOf(variant);
    if (m && m.go) {
      const capturable = variant !== "screenshot" || !rec.guest || canCapture(rec);
      E.armGo.disabled = !pageReady(rec) || !capturable;
      if (E.armGo.getAttribute("data-mode") !== variant) {
        E.armGo.setAttribute("data-mode", variant);
        E.armGo.replaceChildren(icon(m.icon), h("span", { text: m.go }));
      }
      const tip = !capturable ? "Screenshots need the app's browser" : E.armGo.disabled ? "Waiting for the page to load" : "";
      if (tip) setAttr(E.armGo, "data-rtwp-tip", tip);
      else if (E.armGo.hasAttribute("data-rtwp-tip")) E.armGo.removeAttribute("data-rtwp-tip");
    }
    const off = variant === "pick" ? "Cancel picking" : "Turn off import mode";
    setAttr(E.armOff, "aria-label", off);
    setAttr(E.armOff, "data-rtwp-tip", off);
  }
  // The pill's content changing in place (mode switch): a short fade in.
  function swapIn(el) {
    if (typeof el.animate !== "function") return;
    const rm = reducedMotion();
    safe(() =>
      el.animate(rm ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(2px)" }, { opacity: 1, transform: "none" }], {
        duration: rm ? 100 : 140,
        easing: EASE_OUT,
      })
    );
  }

  // The armed element mode keeps the picker live over a loaded page.
  function armTick(rec) {
    clearTimeout(rec.armTimer);
    rec.armTimer = 0;
    if (rec.arm !== "element" || !rec.open || rec.picking || !rec.els || !pageReady(rec)) return;
    armedPick(rec);
  }
  async function armedPick(rec) {
    const r = await pickOnce(rec);
    if (r.status === "stale") return; // a navigation or a switch: the next load picks again
    if (r.status === "esc" || r.status === "error") {
      if (rec.arm === "element") setArm(rec, null); // Esc in the page disarms; a page that can't be picked too
      return;
    }
    if (r.status === "picked") await importPicked(rec, r.pick);
    if (rec.arm === "element") rec.armTimer = setTimeout(() => armTick(rec), r.status === "picked" ? REARM_MS : 0);
  }
  // The user's stop (the bar's pressed picker, Esc, the API): an armed
  // element mode turns off, a one-shot pick just ends.
  function stopPicking(rec) {
    if (rec.arm === "element") setArm(rec, null);
    else cancelPick(rec);
  }

  async function createFrame(rec, at, size) {
    const opts = { url: rec.url, x: at.x, y: at.y, w: size.w, h: size.h, focus: false };
    const cb = window.__RE_TEMPO_CANVAS_BROWSER__;
    let id = null;
    try {
      if (cb && typeof cb.create === "function") id = cb.create(opts);
      else {
        const reg = window.__RE_TEMPO_ACTIONS__;
        if (reg && typeof reg.run === "function" && (typeof reg.has !== "function" || reg.has("canvas.browser.create"))) {
          const r = await reg.run("canvas.browser.create", { url: opts.url, x: opts.x, y: opts.y, w: opts.w, h: opts.h });
          id = r && typeof r === "object" ? r.id || (r.result && r.result.id) || null : r || null;
        }
      }
    } catch (err) {
      console.warn("[canvas-webpanel] browser frame failed", err);
    }
    return { id, cb };
  }

  // Import the full page: the live frame, plus an editable HTML copy right of it.
  async function importFull(rec) {
    if (!rec || !loadable(rec.url)) return null;
    const size = FRAME[rec.mode] || FRAME.desktop;
    const at = placement(rec, size.w, size.h) || {};
    const { id, cb } = await createFrame(rec, at, size);
    let copied = false;
    if (htmlDropOf(rec) && Number.isFinite(at.x)) {
      try {
        const snap = await runInPage(rec, PAGE_SRC);
        if (snap && typeof snap.html === "string") copied = dropHtml(rec, snap.html, snap.title || hostOf(rec.url), { x: at.x + size.w + IMPORT_GAP, y: at.y });
      } catch (err) {
        console.warn("[canvas-webpanel] page copy unavailable", err);
      }
    }
    if (!id && !copied) {
      toast(rec, !cb || cb.enabled === false ? "Browser frames are off (canvas-browser)" : "No design canvas to import into");
      return null;
    }
    if (id) counts.imports++;
    if (copied) counts.htmlImports++;
    const host = hostOf(rec.url) || "Page";
    const text = id && copied ? `${host}: live frame and editable copy added` : id ? `${host} added to the canvas` : `${host}: editable copy added`;
    toast(rec, text, id && cb && typeof cb.remove === "function" ? { label: "Undo", run: () => cb.remove(id, false) } : null);
    return id || (copied ? "html" : null);
  }

  // One pick in the page. status: "picked" (pick), "esc" (the user's Esc in
  // the page), "none" (a click on no element), "error" (no picker in this
  // page), "stale" (cancelled from here or the page went away: ignore).
  async function pickOnce(rec) {
    const seq = ++rec.pickSeq;
    const url = rec.url;
    setPicking(rec, true);
    let res = null;
    try {
      res = await runInPage(rec, PICK_SRC);
    } catch (err) {
      if (seq !== rec.pickSeq) return { status: "stale" };
      setPicking(rec, false);
      if (rec.nav.loading || rec.url !== url || !rec.guest) return { status: "stale" };
      toast(rec, "Can't pick in this page");
      console.warn("[canvas-webpanel] picker unavailable", err);
      return { status: "error" };
    }
    if (seq !== rec.pickSeq) return { status: "stale" };
    setPicking(rec, false);
    if (res && res.esc) return { status: "esc" };
    return res ? { status: "picked", pick: res } : { status: "none" };
  }

  // Import an element: the picker, then an editable copy (or a PNG of its box).
  async function importElement(rec) {
    if (!rec || !rec.guest || !loadable(rec.url)) return null;
    if (rec.picking) return null;
    const r = await pickOnce(rec);
    return r.status === "picked" ? importPicked(rec, r.pick) : null;
  }
  async function importPicked(rec, pick) {
    const w = Math.max(1, Math.round(pick.w));
    const hh = Math.max(1, Math.round(pick.h));
    const at = placement(rec, w, hh);
    const name = [pick.label || pick.tag, pick.title].filter(Boolean).join(" · ") || "Element";
    if (pick.html && dropHtml(rec, pick.html, name, at)) {
      counts.elements++;
      toast(rec, `Element added to the canvas (${w}×${hh})`);
      return { kind: "html", ...pick, html: undefined };
    }
    if (canCapture(rec)) {
      const x = clamp(Math.floor(pick.x), 0, pick.vw);
      const y = clamp(Math.floor(pick.y), 0, pick.vh);
      const rect = { x, y, width: Math.max(1, Math.min(Math.ceil(pick.w), pick.vw - x)), height: Math.max(1, Math.min(Math.ceil(pick.h), pick.vh - y)) };
      const ok = await pasteCapture(rec, rect, at, "Element");
      if (ok) counts.elements++;
      return ok ? { kind: "image", ...pick, html: undefined } : null;
    }
    toast(rec, "Couldn't import this element here");
    return null;
  }
  function setPicking(rec, on) {
    rec.picking = !!on;
    if (!rec.els) return;
    toggleAttr(rec.dock, "data-picking", on);
    markArm(rec);
  }
  // Drops the live picker without it counting as the user's cancel (the
  // pending pick comes back stale); the armed mode stays as it is.
  function cancelPick(rec) {
    if (!rec.picking) return;
    rec.pickSeq++;
    setPicking(rec, false);
    runInPage(rec, "window.__rtwpPick && window.__rtwpPick.cancel(); true").catch(() => {});
  }
  // The document that held the picker is gone: nothing to cancel there.
  function dropPick(rec) {
    if (!rec.picking) return;
    rec.pickSeq++;
    setPicking(rec, false);
  }

  function dataUrlToBlob(u) {
    const i = u.indexOf(",");
    const meta = u.slice(5, i);
    const bin = atob(u.slice(i + 1));
    const arr = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
    return new Blob([arr], { type: meta.split(";")[0] || "image/png" });
  }
  // capturePage(rect?) -> clipboard -> the canvas's "Paste here" at `at`,
  // decided before the awaits (the view may show another canvas meanwhile).
  async function pasteCapture(rec, rect, at, what) {
    const root = rec.shell.querySelector(CANVAS_ROOT);
    const key = rec.key;
    try {
      const img = await (rect ? rec.guest.capturePage(rect) : rec.guest.capturePage());
      const u = img && typeof img.toDataURL === "function" ? img.toDataURL() : null;
      if (!u || !u.startsWith("data:image")) throw new Error("empty capture");
      const blob = dataUrlToBlob(u);
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    } catch (err) {
      console.warn("[canvas-webpanel] capture failed", err);
      toast(rec, "Couldn't take a screenshot");
      return false;
    }
    const same = recs.get(rec.shell) === rec && rec.key === key && !!root && root.isConnected && rec.shell.querySelector(CANVAS_ROOT) === root;
    const actions = same ? wiringOf(root).actions : null;
    const paste = actions && actions.pasteAtWorldPositionRef && actions.pasteAtWorldPositionRef.current;
    if (typeof paste === "function" && at) {
      try {
        paste({ x: at.x, y: at.y });
        toast(rec, `${what} added to the canvas`);
        return true;
      } catch (err) {
        console.warn("[canvas-webpanel] paste failed", err);
      }
    }
    toast(rec, `${what} copied to the clipboard`);
    return true;
  }
  // Import a screenshot: the visible page, as the canvas's own image.
  async function capture(rec) {
    if (!rec || !canCapture(rec)) {
      if (rec) toast(rec, "Screenshots need the app's browser");
      return false;
    }
    const gw = VIEWPORT[rec.mode] || VIEWPORT.desktop;
    const gh = parseFloat(rec.els.device.style.getPropertyValue("--rtwp-gh")) || 800;
    const ok = await pasteCapture(rec, null, placement(rec, gw, gh), "Screenshot");
    if (ok) counts.captures++;
    return ok;
  }

  // ---------------------------------------------------------------- tooltip
  function wireTip(el) {
    el.addEventListener("pointerenter", () => {
      clearTimeout(ui.tipTimer);
      ui.tipTimer = setTimeout(() => showTip(el), TIP_DELAY);
    });
    el.addEventListener("pointerleave", hideTip);
    el.addEventListener("pointerdown", hideTip);
    el.addEventListener("focus", () => {
      try {
        if (el.matches(":focus-visible")) showTip(el);
      } catch (_) {}
    });
    el.addEventListener("blur", hideTip);
  }
  function showTip(el) {
    if (!el.isConnected || disposed) return;
    const text = el.getAttribute("data-rtwp-tip");
    if (!text) return;
    if (!ui.tip) {
      ui.tip = h("div", { class: "rtwp-tip", role: "tooltip", id: uid("tip"), "data-testid": "canvas-webpanel-tip" });
      document.body.appendChild(ui.tip);
    }
    const t = ui.tip;
    t.replaceChildren(h("span", { class: "rtwp-tip-text", text }));
    const kbd = el.getAttribute("data-rtwp-kbd");
    if (kbd) t.append(h("kbd", { class: "rtwp-tip-kbd", text: kbd }));
    t.hidden = false;
    ui.tipFor = el;
    el.setAttribute("aria-describedby", t.id);
    const r = el.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    const x = clamp(r.left + r.width / 2 - tr.width / 2, 8, window.innerWidth - tr.width - 8);
    let y = r.bottom + 8;
    if (y + tr.height > window.innerHeight - 8) y = r.top - tr.height - 8;
    t.style.left = Math.round(x) + "px";
    t.style.top = Math.round(y) + "px";
  }
  function hideTip() {
    clearTimeout(ui.tipTimer);
    if (ui.tipFor) ui.tipFor.removeAttribute("aria-describedby");
    ui.tipFor = null;
    if (ui.tip) ui.tip.hidden = true;
  }

  // ------------------------------------------------------------------- menu
  function hiddenSlot(rec, slot) {
    const el = rec.dock.querySelector(`[data-rtwp-slot="${slot}"]`);
    return !el || getComputedStyle(el).display === "none";
  }
  function openMenu(rec) {
    closeMenu(false);
    hideTip();
    const E = rec.els;
    const rows = [{ label: "Import mode", group: MODES.map((m) => ({ label: m.short, icon: m.icon, checked: rec.arm === m.id, run: () => setArm(rec, rec.arm === m.id ? null : m.id) })) }, null];
    if (hiddenSlot(rec, "back")) rows.push({ label: "Back", icon: "back", disabled: !rec.nav.back, run: () => goHistory(rec, -1) });
    if (hiddenSlot(rec, "fwd")) rows.push({ label: "Forward", icon: "forward", disabled: !rec.nav.fwd, run: () => goHistory(rec, 1) });
    if (hiddenSlot(rec, "reload")) rows.push({ label: rec.nav.loading ? "Stop" : "Reload", icon: rec.nav.loading ? "stop" : "reload", disabled: !rec.guest, run: () => reloadOrStop(rec) });
    if (hiddenSlot(rec, "camera")) rows.push({ label: "Import a screenshot", icon: "camera", disabled: E.camera.disabled, run: () => capture(rec) });
    if (hiddenSlot(rec, "expand")) rows.push({ label: rec.expanded ? "Restore" : "Expand", icon: rec.expanded ? "collapse" : "expand", run: () => setExpanded(rec, !rec.expanded) });
    if (rows.length) rows.push(null);
    rows.push({ label: "Open in browser", icon: "external", disabled: !/^https?:/i.test(rec.url || ""), run: () => openExternal(rec.url) });
    rows.push({
      label: "Copy URL",
      icon: "copy",
      disabled: !rec.url,
      run: () => {
        try {
          navigator.clipboard.writeText(rec.url).then(() => toast(rec, "URL copied"), () => toast(rec, "Couldn't copy the URL"));
        } catch (_) {}
      },
    });
    rows.push(null);
    rows.push({
      label: "Reset size",
      icon: "width",
      disabled: rec.full,
      run: () =>
        stepSize(rec, () => {
          prefs.ratio = DEFAULT_RATIO;
          prefs.hRatio = 1;
          applyGeometry(rec);
          savePrefs();
        }),
    });
    const box = h("div", { class: "rtwp-menu", role: "menu", "aria-label": "Browser options", "data-testid": "canvas-webpanel-menu" });
    const items = [];
    const item = (r) => {
      const radio = typeof r.checked === "boolean";
      const it = h(
        "button",
        { type: "button", class: "rtwp-menu-item", role: radio ? "menuitemradio" : "menuitem", "aria-checked": radio ? String(r.checked) : null, tabindex: "-1", disabled: !!r.disabled },
        icon(r.icon),
        h("span", { text: r.label }),
        radio ? icon("check", "rtwp-menu-check") : null
      );
      it.addEventListener("click", () => {
        if (r.disabled) return;
        closeMenu(true);
        r.run();
      });
      items.push(it);
      return it;
    };
    for (const r of rows) {
      if (!r) box.append(h("div", { class: "rtwp-menu-sep", role: "separator" }));
      else if (r.group) {
        const id = uid("menu-label");
        box.append(h("div", { class: "rtwp-menu-group", role: "group", "aria-labelledby": id }, h("div", { class: "rtwp-menu-label", id, text: r.label }), ...r.group.map(item)));
      } else box.append(item(r));
    }
    for (const t of ["pointerdown", "mousedown", "click", "wheel", "contextmenu"]) box.addEventListener(t, (e) => e.stopPropagation());
    box.addEventListener("keydown", (e) => {
      const live = items.filter((i) => !i.disabled);
      const at = live.indexOf(document.activeElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = live.length;
        if (n) live[(at + (e.key === "ArrowDown" ? 1 : -1) + n) % n].focus();
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        if (live.length) live[e.key === "Home" ? 0 : live.length - 1].focus();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeMenu(true);
      } else if (e.key === "Tab") closeMenu(false);
      e.stopPropagation();
    });
    document.body.appendChild(box);
    const r = E.more.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    box.style.left = Math.round(clamp(r.right - br.width, 8, window.innerWidth - br.width - 8)) + "px";
    box.style.top = Math.round(Math.min(r.bottom + 8, window.innerHeight - br.height - 8)) + "px";
    ui.menu = { rec, box };
    E.more.setAttribute("aria-expanded", "true");
    const first = items.find((i) => !i.disabled);
    if (first) first.focus({ preventScroll: true });
  }
  function closeMenu(focusBack) {
    const m = ui.menu;
    if (!m) return;
    ui.menu = null;
    m.box.remove();
    if (m.rec.els) {
      m.rec.els.more.setAttribute("aria-expanded", "false");
      if (focusBack) safe(() => m.rec.els.more.focus({ preventScroll: true }));
    }
  }

  // ------------------------------------------------------------------ toast
  function toast(rec, text, action) {
    hideToast();
    const el = h("div", { class: "rtwp-toast", role: "status", "aria-live": "polite", "data-testid": "canvas-webpanel-toast" }, h("span", { class: "rtwp-toast-text", text }));
    if (action) {
      const b = h("button", { type: "button", class: "rtwp-toast-action", text: action.label });
      b.addEventListener("click", () => {
        hideToast();
        safe(action.run);
      });
      el.append(b);
    }
    for (const t of ["pointerdown", "mousedown", "click"]) el.addEventListener(t, (e) => e.stopPropagation());
    document.body.appendChild(el);
    ui.toast = { el, text, rec, timer: setTimeout(hideToast, TOAST_MS) };
    placeToast(ui.toast);
  }
  // centred on the card (or the view), placed again when the card moves
  function placeToast(t) {
    const rec = t.rec;
    const el = t.el;
    const host = rec && rec.dock && !rec.dock.hidden ? rec.dock : rec && rec.shell;
    const r = host && host.isConnected ? host.getBoundingClientRect() : { left: 0, right: window.innerWidth, bottom: window.innerHeight };
    el.style.left = Math.round((r.left + r.right) / 2) + "px";
    // above the armed mode's pill when it is up
    const pill = rec && rec.els && host === rec.dock && rec.els.armbar.hasAttribute("data-shown") ? rec.els.armbar.getBoundingClientRect() : null;
    el.style.bottom = Math.round(Math.max(16, pill ? window.innerHeight - pill.top + 8 : window.innerHeight - r.bottom + 24)) + "px";
  }
  function hideToast() {
    if (!ui.toast) return;
    clearTimeout(ui.toast.timer);
    ui.toast.el.remove();
    ui.toast = null;
  }

  // -------------------------------------------------------------- keyboard
  function recOf(node) {
    const sh = node && node.closest ? node.closest(SHELL) : null;
    return sh ? recs.get(sh) || null : null;
  }
  function targetRec() {
    const a = recOf(document.activeElement);
    if (a && shown(a.shell)) return a;
    if (lastRec && recs.has(lastRec.shell) && shown(lastRec.shell)) return lastRec;
    for (const rec of recs.values()) if (shown(rec.shell)) return rec;
    if (enabled())
      for (const sh of document.querySelectorAll(SHELL))
        if (!sh.closest(OWN) && shown(sh)) {
          const rec = makeRec(sh);
          syncRec(rec);
          return rec;
        }
    return null;
  }
  function onKey(e) {
    if (disposed || e.defaultPrevented) return;
    const t = e.target;
    const inDock = !!(t && t.closest && t.closest("[data-rtwp-dock]"));
    // the resize handles own their keys (wireResize: handleKey)
    const hnd = inDock && t.closest(".rtwp-handle");
    if (hnd && !e.isComposing) {
      const r = recOf(t);
      if (r && r.handleKey && r.handleKey(hnd, e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    }
    if (e.key === "Escape" && !e.isComposing) {
      const rec = inDock ? recOf(t) : null;
      if (ui.menu) return; // the menu closes first (its own handler)
      const picking = Array.from(recs.values()).find((r) => r.picking);
      if (picking && (!rec || rec === picking)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        stopPicking(picking);
        return;
      }
      // an armed mode goes off first, the card closes on the next Esc
      if (rec && rec.open && rec.arm) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setArm(rec, null);
        return;
      }
      if (rec && rec.open) {
        e.preventDefault();
        e.stopImmediatePropagation();
        closePanel(rec, { focus: true });
      }
      return;
    }
    const mod = IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
    if (!mod || !e.altKey || e.shiftKey || e.repeat) return;
    if (e.code !== "KeyB" && String(e.key).toLowerCase() !== "b") return; // Option turns e.key into "∫" on a Mac
    if (!enabled()) return;
    // Ctrl+Alt is AltGr on some Windows/Linux layouts: text fields keep it there
    if (!IS_MAC && !inDock && isEditable(document.activeElement)) return;
    const rec = targetRec();
    if (!rec) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    togglePanel(rec, { focus: true });
  }
  function onPointer(e) {
    const t = e.target;
    readDeselect(!!(t && t.closest && t.closest("[data-rtwp-dock]")));
    const rec = recOf(t);
    if (rec) lastRec = rec;
    if (ui.menu && !ui.menu.box.contains(t) && !(ui.menu.rec.els && ui.menu.rec.els.more.contains(t))) closeMenu(false);
  }

  // ---------------------------------------------------------------- actions
  const ACTIONS = [
    [
      "canvas.webpanel.open",
      {
        owner: "canvas-webpanel",
        label: (a) => (a && a.url ? `Opening ${hostOf(normalizeUrl(a.url) || "")} in the canvas browser` : "Opening the canvas browser"),
        description: "Open the browser card floating on the right of the canvas on screen, optionally loading a URL (http(s)).",
        params: [{ name: "url", type: "string", description: "http(s) only" }],
        risk: "safe",
        kind: "canvas",
        run(a) {
          const rec = targetRec();
          if (!rec) throw new Error("no design canvas on screen");
          openPanel(rec, { focus: false });
          const u = a && a.url ? normalizeUrl(a.url) : null;
          if (u && /^https?:/i.test(u)) navigate(rec, u);
          return { open: true, url: rec.url };
        },
      },
    ],
    [
      "canvas.webpanel.close",
      {
        owner: "canvas-webpanel",
        label: () => "Closing the canvas browser",
        description: "Close the browser card of the canvas on screen.",
        params: [],
        risk: "safe",
        kind: "canvas",
        run() {
          const rec = targetRec();
          return { closed: !!(rec && closePanel(rec, {})) };
        },
      },
    ],
  ];
  function registerActions() {
    const reg = window.__RE_TEMPO_ACTIONS__;
    if (reg && typeof reg.register === "function") {
      for (const [id, spec] of ACTIONS) safe(() => reg.register(id, spec));
      return;
    }
    if (!window.__RE_TEMPO_ACTIONS_PENDING__) window.__RE_TEMPO_ACTIONS_PENDING__ = [];
    const q = window.__RE_TEMPO_ACTIONS_PENDING__;
    if (q && typeof q.push === "function") q.push(...ACTIONS);
  }
  function unregisterActions() {
    const reg = window.__RE_TEMPO_ACTIONS__;
    if (reg && typeof reg.unregister === "function") for (const [id] of ACTIONS) safe(() => reg.unregister(id));
    const q = window.__RE_TEMPO_ACTIONS_PENDING__;
    if (Array.isArray(q)) for (let i = q.length - 1; i >= 0; i--) if (q[i] && ACTIONS.some(([id]) => id === q[i][0])) q.splice(i, 1);
  }

  // ------------------------------------------------------------------- boot
  const isOwnNode = (n) => !!(n && n.nodeType === 1 && n.closest && n.closest(OWN));
  const ownMutation = (m) => {
    if (isOwnNode(m.target)) return true;
    const all = [...m.addedNodes, ...m.removedNodes];
    return all.length > 0 && all.every((n) => n.nodeType === 1 && n.hasAttribute("data-rtwp-own"));
  };
  const mo = new MutationObserver((list) => {
    for (const m of list) if (!ownMutation(m)) return syncSoon();
  });
  let timer = 0;
  const onVisible = () => {
    if (!document.hidden) syncSoon();
  };
  const onStorage = (e) => {
    if (!e || e.key == null || e.key === FLAG || e.key === CHROME_FLAG) syncSoon();
    if (e && e.key === STORE) prefs = loadPrefs();
  };
  const onResize = () => {
    for (const rec of recs.values()) if (rec.open) applyGeometry(rec);
    hideTip();
    closeMenu(false);
  };
  const onChromeReady = () => {
    topAction = false; // a (re)loaded canvas-chrome: register on its new API
    syncSoon();
  };

  function dispose() {
    if (disposed) return;
    for (const rec of Array.from(recs.values())) destroyRec(rec);
    unregisterTop();
    unregisterActions();
    disposed = true;
    mo.disconnect();
    selMo.disconnect();
    clearInterval(timer);
    hideTip();
    if (ui.tip) ui.tip.remove();
    ui.tip = null;
    closeMenu(false);
    hideToast();
    window.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointerdown", onPointer, true);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("rtd:canvas-chrome-ready", onChromeReady);
    document.documentElement.classList.remove("rtwp-resizing-x", "rtwp-resizing-y", "rtwp-resizing-xy");
    delete window.__RE_TEMPO_CANVAS_WEBPANEL__;
  }

  const pick = (shell) => (shell && shell.nodeType === 1 ? recs.get(shell.closest(SHELL) || shell) || null : null) || targetRec();
  const api = {
    version: 2,
    get enabled() {
      return enabled();
    },
    state: () => ({
      enabled: enabled(),
      disposed,
      topAction,
      engine: engine(),
      prefs: JSON.parse(JSON.stringify(prefs)),
      counts: { ...counts },
      panels: Array.from(recs.values()).map((r) => ({
        shell: r.shell,
        key: r.key,
        open: r.open,
        url: r.url,
        mode: r.mode,
        width: r.width,
        height: r.height,
        expanded: r.expanded,
        full: r.full,
        picking: r.picking,
        arm: r.arm,
        intent: r.arm, // the older name of arm
        kind: r.kind,
        button: chromeOwns(r) ? (topButtonOf(r) ? "top-action" : "top-action-pending") : r.btn && r.btn.isConnected ? r.btn.getAttribute("data-rtwp-place") : null,
        loading: r.nav.loading,
      })),
    }),
    open: (shell) => {
      const r = pick(shell);
      return r ? openPanel(r, { focus: false }) : false;
    },
    close: (shell) => {
      const r = pick(shell);
      return r ? closePanel(r, {}) : false;
    },
    toggle: (shell) => {
      const r = pick(shell);
      return r ? togglePanel(r, { focus: false }) : false;
    },
    navigate: (url, shell) => {
      const r = pick(shell);
      const u = normalizeUrl(url);
      return r && u ? navigate(r, u) : false;
    },
    setMode: (mode, shell) => {
      const r = pick(shell);
      return r ? setMode(r, mode) : null;
    },
    setWidth: (px, shell) => {
      const r = pick(shell);
      let ok = false;
      if (r) stepSize(r, () => (ok = setWidthPx(r, px, true)));
      return ok;
    },
    setHeight: (px, shell) => {
      const r = pick(shell);
      return r ? setHeightPx(r, px, true) : false;
    },
    setExpanded: (on, shell) => {
      const r = pick(shell);
      return r ? setExpanded(r, on) : false;
    },
    importToCanvas: (shell) => {
      const r = pick(shell);
      return r ? importFull(r) : Promise.resolve(null);
    },
    importFull: (shell) => {
      const r = pick(shell);
      return r ? importFull(r) : Promise.resolve(null);
    },
    importElement: (shell) => {
      const r = pick(shell);
      return r ? importElement(r) : Promise.resolve(null);
    },
    cancelPick: (shell) => {
      const r = pick(shell);
      if (r) stopPicking(r);
      return !!r;
    },
    arm: (mode, shell) => {
      const r = pick(shell);
      return r ? setArm(r, mode) : null;
    },
    capture: (shell) => {
      const r = pick(shell);
      return r ? capture(r) : Promise.resolve(false);
    },
    placement: (shell) => {
      const r = pick(shell);
      const s = r ? FRAME[r.mode] || FRAME.desktop : FRAME.desktop;
      return r ? placement(r, s.w, s.h) : null;
    },
    recent: () => prefs.recent.map((r) => ({ ...r })),
    clearRecent,
    normalizeUrl,
    sync: () => syncAll(),
    dispose,
  };
  window.__RE_TEMPO_CANVAS_WEBPANEL__ = api;

  function init() {
    if (disposed) return;
    ensureCss();
    mo.observe(document.body, { childList: true, subtree: true });
    selMo.observe(document.body, { attributes: true, attributeFilter: ["data-selected"], attributeOldValue: true, subtree: true });
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    window.addEventListener("resize", onResize);
    window.addEventListener("rtd:canvas-chrome-ready", onChromeReady);
    timer = setInterval(() => {
      if (!document.hidden) syncAll();
    }, 1000);
    registerActions();
    syncAll();
  }
  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init, { once: true });
})();
