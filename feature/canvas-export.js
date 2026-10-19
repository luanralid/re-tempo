/*
 * RE-TEMPO · canvas-export (user MOD layer)
 * ---------------------------------------------------------------------------
 * "Code" and "Export" sections in the canvas's right panel, like pen.dev's
 * (Pencil) properties panel: with one storyboard selected, the design tab
 * gets, after "Effects":
 *   Code    [HTML + Tailwind | HTML + CSS | React (JSX)]   (gear: options)
 *           [Copy HTML] [Export HTML]
 *           [Import Web via Browser]
 *   Export  [1x | 2x | 3x] [PNG | JPEG | WebP | PDF]
 *           [Export layer]                  (hint: output size in px)
 * and ⌘⇧E (Ctrl+Shift+E) scrolls to Export and focuses it.
 *
 * Placement. With canvas-chrome's Properties card
 * (window.__RE_TEMPO_CANVAS_CHROME__), the mod registers two sections through
 * registerRightSection({id, label, render(body, ctx), order?, when?(ctx)}):
 * "canvas-export-code" (label Code, order 130) and "canvas-export-export"
 * (label Export, order 140), shown while a storyboard is selected. The chrome
 * draws each header (the title row); render() puts only the body in, and the
 * Code options gear goes into ctx.actions (the header's right side). Without
 * the chrome (or when it refuses), the mod falls back to injecting one
 * wrapper with both sections, headers included, into the app's design tab.
 * The shader frame's own "Export" (canvas-shader, shader frames only) is a
 * different section id and never shows with a storyboard selected.
 *
 * What the app does (assets/index-D2Ui1vc0.js and out/preload, RE-TEMPO
 * build of 2026-10-14, read on 2026-10-18):
 *   - A storyboard is painted by the "combined projection": its DOM is
 *     serialized in the frame pool and written into an <iframe title=
 *     "Projection surface"> inside the storyboard item, with no src (so it is
 *     same-origin with the app): head CSS through the app's head writer, the
 *     body through template.innerHTML, documentElementAttributes on <html>
 *     and rootAttributes on the container. The DOM is therefore readable with
 *     iframe.contentDocument, computed styles included. That is the source of
 *     the code (read only; nothing in it is changed).
 *   - Canvas DOM: [data-canvas-root] > world layer .tds-canvas-shimmer-origin
 *     > div[data-canvas-item-id] (translate(X, Y), width/height and
 *     --canvas-item-x/-y/-width/-height in world units, [data-canvas-item-
 *     selected] when selected) > [data-storyboard-header] (the name) and
 *     div[data-storyboard-id] (the 100% box). The canvas handle (forwardRef
 *     imperative handle, found through the React fiber) has setView(),
 *     getView() {x, y, zoom} (screen = root.left + x + world * zoom),
 *     getSelection(), setSelection(), clearSelection(),
 *     setSelectedOutlineVisible(bool) and getWorldOverlayHost().
 *   - Right panel: [data-testid="canvas-right-panel"], design tab body
 *     [data-testid="canvas-design-tab"] .overflow-auto (a flex column). The
 *     sections use the app's section classes (A$: data-section-header,
 *     h-[40px] header, 12 px / 510 title, 28 px rows), as canvas-shader's
 *     "Effects" does.
 *   - Files: window.electronAPI.fs.writeFile(path, text) and
 *     writeBinaryFile(path, base64) (preload channels fs:writeFile and
 *     fs:writeBinaryFile; writeFile creates missing folders, as voice-input's
 *     build folder shows), fs.stat to check the size. Finder:
 *     electronAPI.workspaces.openInApp(path, "finder") (the file tree's
 *     "Open in Finder"). Screen capture: window.bugReportBridge.
 *     captureAppScreenshot() -> {ok, dataUrl} of the app window (the bug
 *     report's; canvas-comment-agent crops it the same way). No upload.
 *
 * Code (the selected storyboard's projected DOM, cleaned: no scripts, no
 * event handler attributes, no data-tempo-*, data-canvas-*, data-rt*):
 *   - HTML + Tailwind: the markup with its classes as they are. "Copy HTML"
 *     copies the body's content, pretty-printed (children on their own lines
 *     only where whitespace cannot change the layout: flex/grid containers
 *     and block containers of block children; inline runs and white-space:
 *     pre stay as they are). "Export HTML" writes a standalone page: the
 *     storyboard's stylesheets inlined (rules whose selectors match nothing
 *     in the storyboard are dropped, url()s made absolute), the <html> and
 *     <body> attributes, a frame rule (body width = the storyboard's width)
 *     and, by default, its images embedded as data URLs.
 *   - HTML + CSS: no classes; each element gets an inline style with the
 *     computed values that differ from what it would inherit or from the
 *     browser default for its tag (sizes only where a rule or the style
 *     attribute set one: "100%" stays "100%"), shorthands merged.
 *   - React (JSX): a component named after the storyboard (className,
 *     htmlFor, camelCased SVG attributes, style objects, self-closing tags).
 *   Files go to <workspace>/<canvasPath>/exports/<storyboard>.html (.jsx;
 *   canvasPath is the canvas folder, e.g. tempo/designs/canvases/home), or
 *   are downloaded (Blob) when there is no file bridge or workspace path.
 * Import Web via Browser: a URL prompt (a popover; Electron has no
 *   window.prompt) that creates a Browser frame on the canvas to the right
 *   of the storyboard, same width, through
 *   window.__RE_TEMPO_CANVAS_BROWSER__.create(), else ui-drive's registry
 *   action canvas.browser.create.
 * Export layer: the storyboard as PNG, JPEG, WebP or PDF at 1x/2x/3x of its
 *   size in canvas units. Pixels come from captureAppScreenshot(): the view
 *   is moved (setView) so the storyboard is drawn at the needed density, in
 *   tiles when it does not fit the free part of the canvas (toolbars and
 *   panels over the canvas are found by hit-testing and avoided), each tile
 *   cropped and drawn into the output canvas, then the view is restored.
 *   While capturing, the selection outline is hidden (setSelectedOutline
 *   Visible(false)) and html gets rtcx-capturing, rtcc-capturing and
 *   rtud-capturing (the other mods hide their overlays on those); input on
 *   the canvas is blocked and Escape cancels. When it already fits at the
 *   needed density, one capture and no view change. PDF is written by hand:
 *   one image per page, page size = the storyboard in points (1 px = 0.75
 *   pt), lossless (FlateDecode through CompressionStream) up to 24 MP, else
 *   JPEG; pages taller than 14400 pt are split. The file name is the
 *   storyboard's name (+ @2x / @3x). The toast offers "Reveal in Finder".
 *
 * Panel placement: inside the design tab body, with CSS order 1 so it sits
 * after the app's sections and after canvas-shader's "Effects" (which keeps
 * itself last in the DOM; this mod never moves its node once it is there, so
 * the two never fight). If window.__RE_TEMPO_CANVAS_CHROME__.
 * registerRightSection exists, the sections are registered there instead:
 * registerRightSection({id: "canvas-export", title, order, after: "effects",
 * visible(): bool, render(container): cleanup}) -> unregister fn.
 *
 * Shortcut: ⌘⇧E, only with a storyboard selected on a visible canvas and
 * focus outside text fields; otherwise the key is left alone. project-sidebar
 * also binds ⌘⇧E (focus its search) on window capture: this listener calls
 * stopImmediatePropagation, so it wins when it is registered first (load
 * canvas-export before project-sidebar in tools/inject-index.mjs).
 *
 * Actions (ui-drive's window.__RE_TEMPO_ACTIONS__ or its pending queue):
 *   canvas.export.layer {scale?, format?} and canvas.export.code {format?,
 *   to?: "file" | "clipboard" | "return"} on the selected storyboard.
 * Prefs (per viewer): localStorage "rtd.canvasExport.prefs" = {code, scale,
 * format, fullDoc, embed}. Flag: localStorage "rtd.canvasExport" = "off"
 * disables everything (checked live).
 * Introspection: window.__RE_TEMPO_CANVAS_EXPORT__ (state(), selected(),
 * code(format, {document}), copy(), exportCode(), exportImage({scale,
 * format}), importWeb(url), focusExport(), sync(), setEnabled(), dispose()).
 * Limits: pseudo-elements (::before/::after) and canvas pixels are not in the
 * code; fonts stay linked (not embedded); a storyboard whose frame is
 * cross-origin cannot be read (no code; the image export still works).
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (window.__RE_TEMPO_CANVAS_EXPORT__) return; // double injection

  // ------------------------------------------------------------------ config
  const VERSION = 1;
  const FLAG_KEY = "rtd.canvasExport";
  const PREFS_KEY = "rtd.canvasExport.prefs";
  const CANVAS_ROOT = "[data-canvas-root]";
  const WORLD_LAYER = ".tds-canvas-shimmer-origin";
  const ITEM = "[data-canvas-item-id]";
  const SB = "[data-storyboard-id]";
  const HEADER = "[data-storyboard-header]";
  const SELECTED_ATTR = "data-canvas-item-selected";
  const RIGHT_PANEL = '[data-testid="canvas-right-panel"]';
  const DESIGN_TAB = '[data-testid="canvas-design-tab"]';
  const TOOLBAR = '[role="toolbar"][aria-label="Design tools"]';
  const PROJECTION = 'iframe[title="Projection surface"]';
  const LOADING = "[data-storyboard-loading]";
  const SYNC_MS = 300;
  const MAX_FIBER_DEPTH = 600;
  const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
  const CODE_FORMATS = [
    { id: "tailwind", label: "HTML + Tailwind" },
    { id: "css", label: "HTML + CSS" },
    { id: "react", label: "React (JSX)" },
  ];
  const SCALES = [1, 2, 3];
  const IMAGE_FORMATS = [
    { id: "png", label: "PNG", mime: "image/png", ext: "png" },
    { id: "jpeg", label: "JPEG", mime: "image/jpeg", ext: "jpg" },
    { id: "webp", label: "WebP", mime: "image/webp", ext: "webp" },
    { id: "pdf", label: "PDF", mime: "application/pdf", ext: "pdf" },
  ];
  const IMAGE_QUALITY = 0.92;
  const MAX_SIDE = 16384; // output canvas side (Chromium's limit)
  const MAX_AREA = 120e6; // output pixels
  const MAX_TILES = 36;
  const CAPTURE_TIMEOUT = 6000;
  const SETTLE_MS = 140; // after the view settles: the projection repaints
  const LOADING_WAIT_MS = 1500;
  const MARGIN = 8; // px kept free around a tile, inside the canvas
  const PDF_PT = 0.75; // points per CSS px
  const PDF_MAX_PT = 14400; // a PDF page side limit (Acrobat)
  const PDF_FLATE_MAX = 24e6; // pixels per page stored lossless
  const EMBED_MAX = 8e6; // bytes per embedded image
  const EMBED_TOTAL = 25e6;
  const EMBED_TIMEOUT = 4000;
  const MAX_NODES = 25000;
  const RETURN_MAX = 400000; // chars of code an action returns
  const TOAST_MS = 4200;
  const CAPTURE_CLASSES = ["rtcx-capturing", "rtcc-capturing", "rtud-capturing"];
  // The app's section classes (A$, as canvas-shader's Effects section).
  const HEAD_CLS = "h-[40px] flex items-center pl-[16px] pr-[8px] py-[8px]";
  const TITLE_CLS = "text-[12px] leading-[15px] font-[510] truncate capitalize text-text-secondary";
  const BODY_CLS = "border-b border-border-secondary flex flex-col gap-[8px] pb-[12px] pl-[16px] pr-[8px]";
  const ICON_BTN = "flex items-center justify-center gap-[3px] p-[6px] rounded-[6px] [&>*]:size-[16px] text-icons-secondary hover:bg-accent-subtle-hover disabled:opacity-40 disabled:pointer-events-none";

  const state = {
    enabled: true,
    sel: null,
    lastRoot: null,
    busy: null,
    cancel: false,
    last: null,
    lastError: null,
    mode: "inject",
    chromeOff: null,
    timer: 0,
    raf: 0,
    toast: null,
    pop: null,
    menu: null,
    blocker: null,
    counts: { copies: 0, codeExports: 0, images: 0, imports: 0, errors: 0, captures: 0, syncs: 0 },
  };

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
        if (v == null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
        return true;
      } catch (_) {
        return false;
      }
    },
  };
  const flagOn = () => ls.get(FLAG_KEY) !== "off";
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const now = () => (window.performance && performance.now ? performance.now() : Date.now());
  const isShown = (el) => {
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === "function" && !el.checkVisibility()) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const isEditable = (el) =>
    !!el &&
    el.nodeType === 1 &&
    (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!(el.closest && el.closest('[contenteditable=""], [contenteditable="true"], .monaco-editor, .cm-editor, .xterm')));
  const kindOf = (o) => (o && o.constructor && o.constructor.name) || "";
  function fail(code, message) {
    const e = new Error(message || code);
    e.code = code;
    return e;
  }

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
    return el;
  }
  // Lucide paths (the app's icon set).
  const ICONS = {
    settings:
      '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  };
  function icon(name, cls, sw) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", String(sw || 1.5));
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    if (cls) s.setAttribute("class", cls);
    s.innerHTML = ICONS[name] || "";
    return s;
  }

  // ------------------------------------------------------------------ prefs
  const prefs = { code: "tailwind", scale: 1, format: "png", fullDoc: false, embed: true };
  try {
    const p = JSON.parse(ls.get(PREFS_KEY) || "null");
    if (p && typeof p === "object") {
      if (CODE_FORMATS.some((f) => f.id === p.code)) prefs.code = p.code;
      if (SCALES.includes(p.scale)) prefs.scale = p.scale;
      if (IMAGE_FORMATS.some((f) => f.id === p.format)) prefs.format = p.format;
      if (typeof p.fullDoc === "boolean") prefs.fullDoc = p.fullDoc;
      if (typeof p.embed === "boolean") prefs.embed = p.embed;
    }
  } catch (_) {}
  const savePrefs = () => ls.set(PREFS_KEY, JSON.stringify(prefs));

  // ------------------------------------------------------------ fiber (read)
  const fiberOf = (node) => {
    if (!node) return null;
    const k = Object.keys(node).find((x) => x.startsWith("__reactFiber$"));
    return k ? node[k] : null;
  };
  const handleRefs = new WeakMap();
  const isHandle = (v) => !!v && typeof v === "object" && typeof v.getView === "function" && typeof v.getSelection === "function";
  function findHandle(root) {
    const cached = handleRefs.get(root);
    if (cached && isHandle(cached.current)) return cached.current;
    let f = fiberOf(root);
    for (let d = 0; f && d < MAX_FIBER_DEPTH; d++, f = f.return) {
      for (const r of [f.ref, f.memoizedProps && f.memoizedProps.ref]) {
        if (r && typeof r === "object" && "current" in r && isHandle(r.current)) {
          handleRefs.set(root, r);
          return r.current;
        }
      }
    }
    return null;
  }
  // {canvasPath, workspacePath} of a canvas root (props of its ancestors).
  function refOf(root) {
    let f = fiberOf(root);
    let canvasPath = null;
    let alt = null;
    let workspacePath = null;
    for (let d = 0; f && d < MAX_FIBER_DEPTH; d++, f = f.return) {
      const p = f.memoizedProps;
      if (!p || typeof p !== "object") continue;
      if (!canvasPath && typeof p.canvasPath === "string" && p.canvasPath) canvasPath = p.canvasPath;
      if (!alt && typeof p.pageFolderPath === "string" && p.pageFolderPath) alt = p.pageFolderPath;
      if (!workspacePath && (canvasPath || alt) && typeof p.workspacePath === "string" && p.workspacePath) workspacePath = p.workspacePath;
      if ((canvasPath || alt) && workspacePath) break;
    }
    const cp = canvasPath || alt;
    return { canvasPath: cp || null, workspacePath: workspacePath || null };
  }

  // -------------------------------------------------------------- selection
  const pxVar = (el, name) => {
    const v = parseFloat(el.style.getPropertyValue(name));
    return Number.isFinite(v) ? v : null;
  };
  // World box of a canvas item (its style, in canvas units).
  function itemBox(el) {
    if (!el || !el.style) return null;
    let x = pxVar(el, "--canvas-item-x");
    let y = pxVar(el, "--canvas-item-y");
    let w = pxVar(el, "--canvas-item-width");
    let hh = pxVar(el, "--canvas-item-height");
    if (w == null) w = parseFloat(el.style.width);
    if (hh == null) hh = parseFloat(el.style.height);
    if (x == null || y == null) {
      const m = /translate(?:3d)?\(\s*(-?[\d.e+-]+)px\s*,\s*(-?[\d.e+-]+)px/i.exec(el.style.transform || "");
      if (m) (x = +m[1]), (y = +m[2]);
    }
    return [x, y, w, hh].every(Number.isFinite) && w > 0 && hh > 0 ? { x, y, w, h: hh } : null;
  }
  function viewOf(root, handle) {
    try {
      const v = handle && handle.getView();
      if (v && [v.x, v.y, v.zoom].every(Number.isFinite) && v.zoom > 0) return { x: v.x, y: v.y, zoom: v.zoom };
    } catch (_) {}
    const w = root.querySelector(WORLD_LAYER);
    const m = w && /translate3d\(\s*(-?[\d.e+-]+)px\s*,\s*(-?[\d.e+-]+)px\s*,\s*0(?:px)?\s*\)\s*scale\(\s*([\d.e+-]+)\s*\)/i.exec(w.style.transform || "");
    return m ? { x: +m[1], y: +m[2], zoom: +m[3] } : { x: 0, y: 0, zoom: 1 };
  }
  function headerName(item) {
    const hd = item && item.querySelector(HEADER);
    const s = hd ? (hd.innerText || hd.textContent || "").split("\n").map((x) => x.trim()).find(Boolean) : "";
    return (s || "").slice(0, 120);
  }
  // The outermost div[data-storyboard-id="id"] of a root (not a fullscreen copy).
  function sbById(root, id) {
    let list;
    try {
      list = root.querySelectorAll(`div[data-storyboard-id="${CSS.escape(String(id))}"]`);
    } catch (_) {
      return null;
    }
    for (const el of list) {
      if (el.hasAttribute("data-fullscreen-storyboard-overlay")) continue;
      const up = el.parentElement && el.parentElement.closest(SB);
      if (up && root.contains(up)) continue;
      return el;
    }
    return null;
  }
  function itemById(root, id) {
    try {
      return root.querySelector(`[data-canvas-item-id="${CSS.escape(String(id))}"]`);
    } catch (_) {
      return null;
    }
  }
  function selectionIds(root, handle) {
    if (handle) {
      try {
        const sel = handle.getSelection();
        if (Array.isArray(sel)) return sel.map((x) => (typeof x === "string" ? x : x && x.id)).filter(Boolean);
      } catch (_) {}
    }
    return Array.from(root.querySelectorAll(`${ITEM}[${SELECTED_ATTR}]`), (el) => el.getAttribute("data-canvas-item-id"));
  }
  function infoFor(root, handle, id) {
    let sbEl = sbById(root, id);
    let item = sbEl ? sbEl.closest(ITEM) : null;
    if (!sbEl) {
      item = itemById(root, id);
      sbEl = item ? item.querySelector(SB) : null;
    }
    if (!sbEl) return null;
    if (!item) item = sbEl;
    let box = itemBox(item);
    if (!box) {
      const v = viewOf(root, handle);
      const rr = root.getBoundingClientRect();
      const r = sbEl.getBoundingClientRect();
      box = { x: (r.left - rr.left - v.x) / v.zoom, y: (r.top - rr.top - v.y) / v.zoom, w: r.width / v.zoom, h: r.height / v.zoom };
    }
    const name = headerName(item) || sbEl.getAttribute("data-storyboard-name") || "Storyboard";
    return { root, handle, id: String(id), sbId: sbEl.getAttribute("data-storyboard-id"), item, sbEl, name, box, ref: refOf(root) };
  }
  // The one storyboard selected on a canvas on screen (the app's selection).
  function selectedStoryboard() {
    const roots = Array.from(document.querySelectorAll(CANVAS_ROOT)).filter(isShown);
    roots.sort((a, b) => (b === state.lastRoot ? 1 : 0) - (a === state.lastRoot ? 1 : 0));
    for (const root of roots) {
      const handle = findHandle(root);
      const ids = selectionIds(root, handle);
      if (ids.length !== 1) continue;
      const info = infoFor(root, handle, ids[0]);
      if (info) return info;
    }
    return null;
  }
  const summary = (i) => (i ? { id: i.id, storyboardId: i.sbId, name: i.name, box: { ...i.box }, canvasPath: i.ref.canvasPath, workspacePath: i.ref.workspacePath } : null);

  // The design tab body of the right panel nearest to a canvas root.
  function panelBodyFor(root) {
    let best = null;
    let bestD = Infinity;
    for (const p of document.querySelectorAll(RIGHT_PANEL)) {
      if (!isShown(p)) continue;
      let a = p;
      let d = 0;
      while (a && !a.contains(root)) {
        a = a.parentElement;
        d++;
      }
      if (a && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    const tab = best && best.querySelector(DESIGN_TAB);
    if (!tab || !isShown(tab)) return null;
    return tab.querySelector(".overflow-auto") || tab;
  }

  // ------------------------------------------------------------- code source
  // The storyboard's DOM: the projection iframe (same-origin), another
  // readable iframe, an optional interact bridge (html string, rendered in a
  // hidden same-origin frame so styles compute), or the box itself when the
  // storyboard is drawn inline.
  const SVG_NS = "http://www.w3.org/2000/svg";
  async function sourceOf(info) {
    const scope = info.item || info.sbEl;
    const frames = Array.from(scope.querySelectorAll("iframe")).sort((a, b) => (b.matches(PROJECTION) ? 1 : 0) - (a.matches(PROJECTION) ? 1 : 0));
    for (const fr of frames) {
      let doc = null;
      try {
        doc = fr.contentDocument;
      } catch (_) {}
      if (doc && doc.body && doc.body.childElementCount) return { doc, win: doc.defaultView, root: doc.body, frame: fr, via: fr.matches(PROJECTION) ? "projection" : "iframe" };
    }
    const ib = window.__RE_TEMPO_CANVAS_INTERACT__;
    const fn = ib && (typeof ib.html === "function" ? ib.html : typeof ib.getHtml === "function" ? ib.getHtml : null);
    if (fn) {
      try {
        const html = await fn.call(ib, info.sbId || info.id);
        if (typeof html === "string" && html.trim()) {
          const doc = await renderHidden(html, info.box.w, info.box.h);
          if (doc && doc.body && doc.body.childElementCount) return { doc, win: doc.defaultView, root: doc.body, frame: null, via: "bridge", hidden: true };
        }
      } catch (_) {}
    }
    if (!frames.length && info.sbEl.querySelector(":scope > *")) return { doc: document, win: window, root: info.sbEl, frame: null, via: "inline" };
    return null;
  }
  let hiddenFrame = null;
  async function renderHidden(html, w, hh) {
    dropHidden();
    hiddenFrame = h("iframe", { "aria-hidden": "true", tabindex: "-1", "data-rtcx-hidden": "" });
    hiddenFrame.style.cssText = `position:fixed;left:-20000px;top:0;width:${Math.round(w)}px;height:${Math.round(hh)}px;border:0;visibility:hidden;pointer-events:none`;
    document.body.appendChild(hiddenFrame);
    const doc = hiddenFrame.contentDocument;
    doc.open();
    doc.write(/<html[\s>]/i.test(html) ? html : `<!doctype html><html><head></head><body>${html}</body></html>`);
    doc.close();
    await sleep(60);
    return doc;
  }
  function dropHidden() {
    if (hiddenFrame) hiddenFrame.remove();
    hiddenFrame = null;
  }

  // ------------------------------------------------------------ serializer
  const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  const SKIP_TAGS = new Set(["script", "noscript", "template", "style", "link", "meta", "title", "base"]);
  const BOOL_ATTRS = new Set(["allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls", "default", "defer", "disabled", "formnovalidate", "hidden", "inert", "ismap", "itemscope", "loop", "multiple", "muted", "nomodule", "novalidate", "open", "playsinline", "readonly", "required", "reversed", "selected"]);
  const URL_ATTRS = new Set(["src", "href", "poster", "action", "formaction", "background", "xlink:href", "data"]);
  const ASSET_TAGS = new Set(["img", "image", "video", "input", "source"]);
  const DROP_ATTR = /^(on[a-z]|data-(tempo|canvas|rt|rar|tds|projection))/i;
  const MOD_CLASS = /^rt[a-z]{1,4}-/;
  const INLINE_SKIP = "[data-storyboard-header], [data-canvas-handle-layer], [data-rtsh-fx-layer], .rtsh-fx-canvas, .sel-outline";
  const JSX_ATTRS = {
    class: "className", for: "htmlFor", tabindex: "tabIndex", readonly: "readOnly", maxlength: "maxLength", minlength: "minLength",
    colspan: "colSpan", rowspan: "rowSpan", contenteditable: "contentEditable", crossorigin: "crossOrigin", autocomplete: "autoComplete",
    autofocus: "autoFocus", autoplay: "autoPlay", enctype: "encType", formaction: "formAction", formnovalidate: "formNoValidate",
    srcset: "srcSet", srcdoc: "srcDoc", usemap: "useMap", frameborder: "frameBorder", allowfullscreen: "allowFullScreen",
    accesskey: "accessKey", spellcheck: "spellCheck", datetime: "dateTime", novalidate: "noValidate", inputmode: "inputMode",
    enterkeyhint: "enterKeyHint", playsinline: "playsInline", referrerpolicy: "referrerPolicy", charset: "charSet",
    cellpadding: "cellPadding", cellspacing: "cellSpacing", "http-equiv": "httpEquiv", "accept-charset": "acceptCharset",
    itemprop: "itemProp", itemscope: "itemScope", itemtype: "itemType", popovertarget: "popoverTarget", fetchpriority: "fetchPriority",
    nomodule: "noModule", hreflang: "hrefLang", marginwidth: "marginWidth", marginheight: "marginHeight", ismap: "isMap",
  };
  // Computed properties for HTML + CSS. Inherited ones are written where they
  // differ from the parent; the others where they differ from the tag's
  // default; sizes only where a rule or the style attribute sets them.
  const INHERITED = new Set([
    "color", "font-family", "font-size", "font-weight", "font-style", "font-variant-numeric", "font-feature-settings", "line-height",
    "letter-spacing", "word-spacing", "text-align", "text-transform", "text-indent", "text-shadow", "white-space", "word-break",
    "overflow-wrap", "list-style-type", "list-style-position", "cursor", "visibility", "fill", "fill-opacity", "stroke", "stroke-width",
    "stroke-linecap", "stroke-linejoin", "stroke-opacity", "-webkit-font-smoothing", "hyphens",
  ]);
  const SIZING = new Set(["width", "height", "min-width", "min-height", "max-width", "max-height"]);
  const SIDES = ["top", "right", "bottom", "left"];
  const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"];
  const P_ALL = [
    "display", "position", "top", "right", "bottom", "left", "z-index", "float", "clear", "box-sizing",
    "width", "height", "min-width", "min-height", "max-width", "max-height", "aspect-ratio",
    ...SIDES.map((s) => "margin-" + s), ...SIDES.map((s) => "padding-" + s),
    ...SIDES.map((s) => `border-${s}-width`), ...SIDES.map((s) => `border-${s}-style`), ...SIDES.map((s) => `border-${s}-color`),
    ...CORNERS.map((c) => `border-${c}-radius`),
    "flex-direction", "flex-wrap", "justify-content", "justify-items", "justify-self", "align-items", "align-content", "align-self",
    "flex-grow", "flex-shrink", "flex-basis", "order", "row-gap", "column-gap",
    "grid-template-columns", "grid-template-rows", "grid-template-areas", "grid-auto-flow", "grid-auto-columns", "grid-auto-rows",
    "grid-column-start", "grid-column-end", "grid-row-start", "grid-row-end",
    "overflow-x", "overflow-y", "opacity", "background-color", "background-image", "background-size", "background-position",
    "background-repeat", "background-clip", "box-shadow", "outline-width", "outline-style", "outline-color", "outline-offset",
    "filter", "backdrop-filter", "mix-blend-mode", "transform", "transform-origin", "clip-path", "object-fit", "object-position",
    "vertical-align", "text-decoration-line", "text-decoration-color", "text-decoration-style", "text-decoration-thickness",
    "text-underline-offset", "text-overflow", "-webkit-line-clamp", "-webkit-box-orient", "pointer-events", "isolation",
    ...INHERITED,
  ];
  const P_SVG = ["display", "opacity", "transform", "fill", "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-opacity", "color"];
  const REPLACED = new Set(["img", "video", "canvas", "iframe", "embed", "object"]);
  // Inherited values set on the sandbox's probe parent: a tag whose computed
  // value differs from these has it from the browser's own stylesheet (a
  // button's font, a th's text-align), so it does not inherit it.
  const PROBE_STYLE =
    "color: rgb(1, 2, 3); font: italic 300 17px / 23px rtcxprobe; letter-spacing: 0.5px; word-spacing: 1px; text-align: right; text-transform: lowercase; text-indent: 1px; text-shadow: rgb(1, 2, 3) 1px 1px 0px; white-space: pre-wrap; word-break: break-all; overflow-wrap: anywhere; list-style-type: square; list-style-position: inside; cursor: crosshair; fill: rgb(1, 2, 3); stroke: rgb(1, 2, 3); stroke-width: 3px; font-variant-numeric: tabular-nums; hyphens: none";

  function makeCtx(src, mode, o) {
    let base = null;
    try {
      const b = src.doc.baseURI;
      if (b && !/^about:/i.test(b)) base = b;
    } catch (_) {}
    return {
      src,
      mode,
      jsx: mode === "react",
      css: mode === "css",
      inline: src.via === "inline",
      embed: !!(o && o.embed),
      base,
      assets: new Map(),
      cs: new Map(),
      defaults: new Map(),
      sandbox: null,
      sizing: null,
      count: 0,
    };
  }
  function closeCtx(ctx) {
    if (ctx.sandbox) ctx.sandbox.remove();
    ctx.sandbox = null;
    if (ctx.src && ctx.src.hidden) dropHidden();
  }
  function csOf(el, ctx) {
    let c = ctx.cs.get(el);
    if (!c) {
      const w = el.ownerDocument && el.ownerDocument.defaultView;
      c = w ? w.getComputedStyle(el) : null;
      ctx.cs.set(el, c);
    }
    return c;
  }
  const displayOf = (el, ctx) => {
    const c = csOf(el, ctx);
    return (c && c.display) || "inline";
  };

  // -- what is kept
  function skipEl(el, ctx) {
    const t = el.localName;
    if (el.namespaceURI !== SVG_NS && SKIP_TAGS.has(t)) return true;
    if (el.hasAttribute("data-tempo-overlay") || el.hasAttribute("data-tempo-ui") || el.hasAttribute("data-rtcx-hidden")) return true;
    if (ctx.inline) {
      try {
        if (el.matches(INLINE_SKIP)) return true;
      } catch (_) {}
      for (const a of el.attributes) if (a.name.startsWith("data-rt")) return true;
      if (el.classList) for (const c of el.classList) if (MOD_CLASS.test(c)) return true;
    }
    return false;
  }
  function kidsOf(el, ctx) {
    const out = [];
    for (const n of el.childNodes) {
      if (n.nodeType === 3) {
        if (n.data) out.push(n);
      } else if (n.nodeType === 1 && !skipEl(n, ctx)) out.push(n);
    }
    return out;
  }
  const preserveWs = (el, ctx) => {
    const c = csOf(el, ctx);
    return !!c && /^(pre|break-spaces)/.test(c.whiteSpace || "");
  };
  // Children on their own lines only where whitespace cannot change layout.
  function canBreak(el, kids, ctx) {
    if (el.namespaceURI === SVG_NS) return !/^(text|tspan|textPath|title|desc)$/.test(el.localName);
    const d = displayOf(el, ctx);
    if (/flex|grid/.test(d)) return true;
    if (/^(inline|contents|ruby)/.test(d) && d !== "inline-block") return false;
    for (const k of kids) {
      if (k.nodeType === 3) {
        if (/[^\t\n\r\f ]/.test(k.data)) return false;
        continue;
      }
      const kc = csOf(k, ctx);
      if (kc && (kc.position === "absolute" || kc.position === "fixed")) continue;
      if (!/^(block|flex|grid|table|list-item|flow-root|none)$/.test(displayOf(k, ctx))) return false;
    }
    return true;
  }

  // -- text
  const escHtml = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");
  const escAttr = (v) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  function textOut(s, ctx, how) {
    let t = s;
    if (how !== "raw") t = t.replace(/[\t\n\r\f ]+/g, " ");
    if (how === "trim") t = t.replace(/^ +| +$/g, "");
    if (!t) return "";
    if (!ctx.jsx) return escHtml(t);
    if (how === "raw" || /[{}<>&"]/.test(t)) return `{${JSON.stringify(t)}}`;
    return t.replace(/ /g, "&nbsp;");
  }

  // -- urls and assets
  function absUrl(v, ctx) {
    const s = String(v || "").trim();
    if (!s || /^(#|data:|blob:|javascript:|mailto:|tel:|about:)/i.test(s)) return s;
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
    if (!ctx.base) return s;
    try {
      return new URL(s, ctx.base).href;
    } catch (_) {
      return s;
    }
  }
  function asset(url, el, ctx) {
    if (!ctx.embed || !url || /^(data:|#)/i.test(url)) return url;
    let a = ctx.assets.get(url);
    if (!a) {
      a = { token: `__RTCX_ASSET_${ctx.assets.size}__`, el: el || null };
      ctx.assets.set(url, a);
    }
    return a.token;
  }
  const IMG_URL = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)(\?|#|$)/i;
  function cssUrls(text, base, ctx, imagesOnly) {
    return text.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g, (m, q, u) => {
      if (!u || /^(data:|#)/i.test(u)) return m;
      let abs = u;
      if (!/^[a-z][a-z0-9+.-]*:/i.test(u) && base) {
        try {
          abs = new URL(u, base).href;
        } catch (_) {}
      }
      const out = imagesOnly && !IMG_URL.test(abs) ? abs : asset(abs, null, ctx);
      return `url("${out}")`;
    });
  }
  function srcsetAbs(v, ctx) {
    return v
      .split(",")
      .map((part) => {
        const p = part.trim().split(/\s+/);
        if (p[0]) p[0] = absUrl(p[0], ctx);
        return p.join(" ");
      })
      .join(", ");
  }

  // -- attributes
  function attrList(el, ctx) {
    const isSvg = el.namespaceURI === SVG_NS;
    const tag = el.localName;
    const list = [];
    const embedImg = ctx.embed && !isSvg && tag === "img";
    for (const at of el.attributes) {
      const n = at.name;
      if (DROP_ATTR.test(n)) continue;
      if (ctx.css && (n === "class" || n === "style")) continue;
      if (ctx.inline && (n === "data-storyboard-id" || n.startsWith("data-rt"))) continue;
      let v = at.value;
      if (n === "class") {
        v = v.split(/\s+/).filter((c) => c && !(ctx.inline && MOD_CLASS.test(c))).join(" ");
        if (!v) continue;
      } else if (n === "srcset") {
        if (embedImg || (ctx.embed && tag === "source")) continue;
        v = srcsetAbs(v, ctx);
      } else if (n === "sizes" && embedImg) continue;
      else if (URL_ATTRS.has(n) || (isSvg && n === "href" && tag === "image")) {
        let u = v;
        if (tag === "img" && n === "src") u = el.currentSrc || el.src || v;
        u = absUrl(u, ctx);
        v = ASSET_TAGS.has(tag) && n !== "href" ? asset(u, el, ctx) : tag === "image" ? asset(u, el, ctx) : u;
      } else if (n === "style" && ctx.embed) v = cssUrls(v, ctx.base, ctx, true);
      list.push([n, v]);
    }
    if (ctx.css) {
      const st = cssFor(el, ctx);
      if (st) list.push(["style", st]);
    }
    return list;
  }
  function htmlAttrs(list) {
    return list.map(([n, v]) => (v === "" && BOOL_ATTRS.has(n) ? " " + n : ` ${n}="${escAttr(v)}"`)).join("");
  }
  const camel = (s) => s.replace(/[-:]([a-z])/g, (_, c) => c.toUpperCase());
  function jsxName(n, el) {
    if (n.startsWith("aria-") || n.startsWith("data-")) return n;
    if (JSX_ATTRS[n]) return JSX_ATTRS[n];
    if (el.localName === "input" || el.localName === "textarea" || el.localName === "select") {
      if (n === "value") return "defaultValue";
      if (n === "checked") return "defaultChecked";
    }
    if (n.includes(":")) return camel(n);
    if (el.namespaceURI === SVG_NS && n.includes("-")) return camel(n);
    return n;
  }
  function styleObject(v) {
    const s = document.createElement("div").style;
    s.cssText = v;
    const parts = [];
    for (let i = 0; i < s.length; i++) {
      const p = s[i];
      const val = s.getPropertyValue(p);
      const key = p.startsWith("--") ? JSON.stringify(p) : p.startsWith("-webkit-") ? "Webkit" + camel(p.slice(8)).replace(/^./, (c) => c.toUpperCase()) : camel(p);
      parts.push(`${key}: ${JSON.stringify(val)}`);
    }
    return parts.join(", ");
  }
  function jsxAttrs(list, el) {
    return list
      .map(([n, v]) => {
        const name = jsxName(n, el);
        if (n === "style") {
          const o = styleObject(v);
          return o ? ` style={{ ${o} }}` : "";
        }
        if (v === "" && BOOL_ATTRS.has(n)) return " " + name;
        if (/["&\n\r\\{}]/.test(v)) return ` ${name}={${JSON.stringify(v)}}`;
        return ` ${name}="${v}"`;
      })
      .join("");
  }

  // -- elements
  function elStr(el, ind, ctx) {
    if (++ctx.count > MAX_NODES) throw fail("too-large", "The storyboard has too many elements to export as code.");
    const isSvg = el.namespaceURI === SVG_NS;
    const tag = el.localName;
    const list = attrList(el, ctx);
    const a = ctx.jsx ? jsxAttrs(list, el) : htmlAttrs(list);
    if (!isSvg && VOID.has(tag)) return ctx.jsx ? `<${tag}${a} />` : `<${tag}${a}>`;
    const kids = kidsOf(el, ctx);
    const c = kids.length ? childrenStr(el, kids, ind, ctx) : { s: "", broken: false };
    if (!c.s) return ctx.jsx || isSvg ? `<${tag}${a} />` : `<${tag}${a}></${tag}>`;
    return c.broken ? `<${tag}${a}>\n${c.s}\n${ind}</${tag}>` : `<${tag}${a}>${c.s}</${tag}>`;
  }
  function blockLines(kids, ind, ctx) {
    const lines = [];
    for (const k of kids) {
      if (k.nodeType === 3) {
        const t = textOut(k.data, ctx, "trim");
        if (t) lines.push(ind + t);
      } else lines.push(ind + elStr(k, ind, ctx));
    }
    return lines;
  }
  function childrenStr(el, kids, ind, ctx) {
    if (preserveWs(el, ctx)) return { s: kids.map((k) => (k.nodeType === 3 ? textOut(k.data, ctx, "raw") : elStr(k, ind, ctx))).join(""), broken: false };
    if (canBreak(el, kids, ctx)) {
      const lines = blockLines(kids, ind + "  ", ctx);
      return lines.length ? { s: lines.join("\n"), broken: true } : { s: "", broken: false };
    }
    return { s: kids.map((k) => (k.nodeType === 3 ? textOut(k.data, ctx, "inline") : elStr(k, ind, ctx))).join(""), broken: false };
  }
  // The body's content at indentation ind (one line per child where safe).
  function contentStr(root, ind, ctx) {
    const kids = kidsOf(root, ctx);
    if (!kids.length) return "";
    if (preserveWs(root, ctx) || !canBreak(root, kids, ctx)) return ind + kids.map((k) => (k.nodeType === 3 ? textOut(k.data, ctx, "inline") : elStr(k, ind, ctx))).join("").trim();
    return blockLines(kids, ind, ctx).join("\n");
  }

  // -- HTML + CSS: computed styles
  function sandboxDoc(ctx) {
    if (ctx.sandbox && ctx.sandbox.isConnected) return ctx.sandbox.contentDocument;
    const f = h("iframe", { "aria-hidden": "true", tabindex: "-1", "data-rtcx-hidden": "" });
    f.style.cssText = "position:fixed;left:-20000px;top:0;width:1200px;height:800px;border:0;visibility:hidden;pointer-events:none";
    document.body.appendChild(f);
    const d = f.contentDocument;
    d.open();
    d.write(`<!doctype html><html><head></head><body><div data-probe style="${PROBE_STYLE}"></div></body></html>`);
    d.close();
    ctx.sandbox = f;
    const pc = d.defaultView.getComputedStyle(d.querySelector("[data-probe]"));
    ctx.probe = {};
    for (const p of INHERITED) ctx.probe[p] = pc.getPropertyValue(p);
    return d;
  }
  function defaultsFor(el, ctx) {
    const isSvg = el.namespaceURI === SVG_NS;
    const key = (isSvg ? "svg:" : "") + el.localName;
    let d = ctx.defaults.get(key);
    if (d) return d;
    const doc = sandboxDoc(ctx);
    const parent = doc.querySelector("[data-probe]");
    let probe;
    let host = parent;
    if (isSvg && el.localName !== "svg") {
      host = doc.createElementNS(SVG_NS, "svg");
      parent.appendChild(host);
      probe = doc.createElementNS(SVG_NS, el.localName);
    } else probe = isSvg ? doc.createElementNS(SVG_NS, "svg") : doc.createElement(el.localName);
    host.appendChild(probe);
    const c = doc.defaultView.getComputedStyle(probe);
    d = {};
    for (const p of P_ALL) d[p] = c.getPropertyValue(p);
    probe.remove();
    if (host !== parent) host.remove();
    ctx.defaults.set(key, d);
    return d;
  }
  function rootDefaults(ctx) {
    let d = ctx.defaults.get("#body");
    if (d) return d;
    const doc = sandboxDoc(ctx);
    const c = doc.defaultView.getComputedStyle(doc.body);
    d = {};
    for (const p of P_ALL) d[p] = c.getPropertyValue(p);
    ctx.defaults.set("#body", d);
    return d;
  }
  // Rules of the storyboard's sheets that set a size, matched per element.
  function sizingIndex(ctx) {
    if (ctx.sizing) return ctx.sizing;
    const rules = [];
    const win = ctx.src.win;
    const walk = (list) => {
      for (const r of list) {
        const k = kindOf(r);
        if (k === "CSSStyleRule") {
          const d = {};
          let any = false;
          for (const p of SIZING) {
            const v = r.style.getPropertyValue(p);
            if (v) {
              d[p] = v;
              any = true;
            }
          }
          if (any && r.selectorText && !r.selectorText.includes("&")) {
            const sel = r.selectorText;
            const m = sel.includes(",") ? null : /\.((?:\\.|[\w-])+)(?![\s\S]*\.(?:\\.|[\w-]))/.exec(sel);
            rules.push({ sel, d, key: m ? m[1].replace(/\\(.)/g, "$1") : null });
          }
        } else if (k === "CSSMediaRule") {
          let ok = true;
          try {
            ok = win.matchMedia(r.media.mediaText).matches;
          } catch (_) {}
          if (ok) walk(r.cssRules);
        } else if (k === "CSSSupportsRule") {
          let ok = true;
          try {
            ok = CSS.supports(r.conditionText);
          } catch (_) {}
          if (ok) walk(r.cssRules);
        } else if (k === "CSSImportRule") {
          try {
            if (r.styleSheet) walk(r.styleSheet.cssRules);
          } catch (_) {}
        } else if (r.cssRules) {
          try {
            walk(r.cssRules);
          } catch (_) {}
        }
      }
    };
    for (const sh of ctx.src.doc.styleSheets) {
      try {
        walk(sh.cssRules);
      } catch (_) {}
    }
    const cache = new Map();
    ctx.sizing = {
      rules: rules.length,
      of(el) {
        let d = cache.get(el);
        if (d) return d;
        d = {};
        for (const r of rules) {
          if (r.key && !(el.classList && el.classList.contains(r.key))) continue;
          let m = false;
          try {
            m = el.matches(r.sel);
          } catch (_) {}
          if (m) Object.assign(d, r.d);
        }
        cache.set(el, d);
        return d;
      },
    };
    return ctx.sizing;
  }
  function declaredSize(el, p, cs, ctx) {
    const tag = el.localName;
    let decl = (el.style && el.style.getPropertyValue(p)) || sizingIndex(ctx).of(el)[p] || "";
    decl = decl.trim();
    if (!decl && (p === "width" || p === "height") && (REPLACED.has(tag) || (el.namespaceURI === SVG_NS && tag === "svg"))) return cs.getPropertyValue(p);
    if (!decl || /^(auto|none|initial|unset|inherit|revert|normal)$/.test(decl)) return null;
    if (/^-?[\d.]+(%|vw|vh|dvh|svh|lvh|vmin|vmax)$/.test(decl) || /^(fit-content|min-content|max-content)$/.test(decl)) return decl;
    // The declared value, not the used one (a flex item shrunk to 18 px
    // keeps its 20 px): var()s from the element, rem/em in px, calc() worked
    // out in the sandbox when it has no relative unit left.
    const expr = resolveVars(decl, cs);
    if (/var\(/.test(expr)) {
      const v = cs.getPropertyValue(p);
      return !v || v === "auto" || v === "none" ? null : v;
    }
    if (/%|vw|vh|vmin|vmax|dvh|svh|lvh|cq[whib]|fr\b|fit-content|min-content|max-content|auto/.test(expr)) return expr;
    const rootFs = parseFloat(ctx.src.win.getComputedStyle(ctx.src.doc.documentElement).fontSize) || 16;
    const elFs = parseFloat(cs.fontSize) || 16;
    const px = expr.replace(/(-?[\d.]+)rem\b/g, (_, n) => n * rootFs + "px").replace(/(-?[\d.]+)em\b/g, (_, n) => n * elFs + "px");
    if (/^-?[\d.]+px$/.test(px)) return px;
    return mathPx(px, ctx) || px;
  }
  function resolveVars(v, cs) {
    let out = v;
    for (let i = 0; i < 6 && out.includes("var("); i++) {
      out = out.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g, (m, name, fb) => {
        const x = cs.getPropertyValue(name).trim();
        return x || (fb != null ? fb.trim() : m);
      });
    }
    return out;
  }
  // A px-only calc()/min()/max()/clamp() as a number of px (sandbox probe).
  function mathPx(expr, ctx) {
    const doc = sandboxDoc(ctx);
    let probe = ctx.mathProbe;
    if (!probe || !probe.isConnected) {
      probe = ctx.mathProbe = doc.createElement("div");
      probe.style.cssText = "position:absolute;left:0;top:0;height:0";
      doc.body.appendChild(probe);
    }
    probe.style.width = "";
    probe.style.width = expr;
    if (!probe.style.width) return null;
    const v = doc.defaultView.getComputedStyle(probe).width;
    return /^-?[\d.]+px$/.test(v) ? v : null;
  }
  function cssFor(el, ctx, asRoot) {
    const cs = csOf(el, ctx);
    if (!cs) return "";
    const isSvg = el.namespaceURI === SVG_NS;
    const svgChild = isSvg && el.localName !== "svg";
    const parent = asRoot ? null : el.parentElement;
    const pcs = parent ? csOf(parent, ctx) : null;
    const def = asRoot ? rootDefaults(ctx) : defaultsFor(el, ctx);
    const probe = ctx.probe || {};
    const out = new Map();
    for (const p of svgChild ? P_SVG : P_ALL) {
      if (asRoot && (p.startsWith("margin-") || SIZING.has(p) || p === "position" || SIDES.includes(p) || p === "display")) continue;
      let v = cs.getPropertyValue(p);
      if (!v) continue;
      if (INHERITED.has(p)) {
        const uaSets = !asRoot && def[p] !== probe[p];
        const expected = uaSets ? def[p] : pcs ? pcs.getPropertyValue(p) : asRoot ? def[p] : rootDefaults(ctx)[p];
        if (v === expected) continue;
      } else if (SIZING.has(p)) {
        const d = declaredSize(el, p, cs, ctx);
        if (d != null) out.set(p, d);
        continue;
      } else if (v === def[p]) continue;
      if (ctx.embed && /url\(/.test(v)) v = cssUrls(v, null, ctx, false);
      out.set(p, v);
    }
    prune(out, cs, def);
    compact(out);
    return Array.from(out, ([k, v]) => `${k}: ${v}`).join("; ");
  }
  const hasBorder = (style, width) => style !== "none" && style !== "hidden" && parseFloat(width) > 0;
  function prune(out, cs, def) {
    if (cs.position === "static") for (const s of SIDES) out.delete(s);
    // A border is its width, style and colour together, or nothing (a
    // preflight's "0 solid" written as style alone would get the 3 px
    // default); "0" is written where the tag has a border by default (input,
    // button).
    for (const s of SIDES) {
      const names = [`border-${s}-width`, `border-${s}-style`, `border-${s}-color`];
      names.forEach((n) => out.delete(n));
      if (hasBorder(cs.getPropertyValue(names[1]), cs.getPropertyValue(names[0]))) names.forEach((n) => out.set(n, cs.getPropertyValue(n)));
      else if (def && hasBorder(def[names[1]], def[names[0]])) out.set(names[0], "0px");
    }
    if (cs.outlineStyle === "none" || !(parseFloat(cs.outlineWidth) > 0)) ["outline-width", "outline-color", "outline-style", "outline-offset"].forEach((p) => out.delete(p));
    if (cs.transform === "none") out.delete("transform-origin");
    if (!out.has("text-decoration-line") && /^none/.test(cs.textDecorationLine || "none")) ["text-decoration-color", "text-decoration-style", "text-decoration-thickness"].forEach((p) => out.delete(p));
    if (cs.backgroundImage === "none") ["background-size", "background-position", "background-repeat"].forEach((p) => out.delete(p));
    if (cs.display !== "flex" && cs.display !== "inline-flex" && cs.display !== "grid" && cs.display !== "inline-grid") {
      ["flex-direction", "flex-wrap", "justify-content", "justify-items", "align-items", "align-content", "row-gap", "column-gap", "grid-template-columns", "grid-template-rows", "grid-template-areas", "grid-auto-flow", "grid-auto-columns", "grid-auto-rows"].forEach((p) => out.delete(p));
    }
  }
  function four(out, names, short) {
    if (!names.every((n) => out.has(n))) return;
    const v = names.map((n) => out.get(n));
    let s;
    if (v[0] === v[1] && v[1] === v[2] && v[2] === v[3]) s = v[0];
    else if (v[0] === v[2] && v[1] === v[3]) s = `${v[0]} ${v[1]}`;
    else if (v[1] === v[3]) s = `${v[0]} ${v[1]} ${v[2]}`;
    else s = v.join(" ");
    const at = Array.from(out.keys()).indexOf(names[0]);
    names.forEach((n) => out.delete(n));
    insertAt(out, at, short, s);
  }
  function insertAt(out, at, k, v) {
    const e = Array.from(out.entries());
    e.splice(Math.min(at, e.length), 0, [k, v]);
    out.clear();
    for (const [a, b] of e) out.set(a, b);
  }
  function compact(out) {
    four(out, SIDES.map((s) => "margin-" + s), "margin");
    four(out, SIDES.map((s) => "padding-" + s), "padding");
    four(out, CORNERS.map((c) => `border-${c}-radius`), "border-radius");
    const bw = SIDES.map((s) => `border-${s}-width`);
    const bs = SIDES.map((s) => `border-${s}-style`);
    const bc = SIDES.map((s) => `border-${s}-color`);
    if ([...bw, ...bs, ...bc].every((n) => out.has(n)) && [bw, bs, bc].every((g) => g.every((n) => out.get(n) === out.get(g[0])))) {
      const at = Array.from(out.keys()).indexOf(bw[0]);
      const v = `${out.get(bw[0])} ${out.get(bs[0])} ${out.get(bc[0])}`;
      [...bw, ...bs, ...bc].forEach((n) => out.delete(n));
      insertAt(out, at, "border", v);
    }
    four(out, bw, "border-width");
    four(out, bs, "border-style");
    four(out, bc, "border-color");
    if (out.has("row-gap") && out.get("row-gap") === out.get("column-gap")) {
      const at = Array.from(out.keys()).indexOf("row-gap");
      const v = out.get("row-gap");
      out.delete("row-gap");
      out.delete("column-gap");
      insertAt(out, at, "gap", v);
    }
    if (out.has("overflow-x") && out.get("overflow-x") === out.get("overflow-y")) {
      const at = Array.from(out.keys()).indexOf("overflow-x");
      const v = out.get("overflow-x");
      out.delete("overflow-x");
      out.delete("overflow-y");
      insertAt(out, at, "overflow", v);
    }
    for (const g of ["column", "row"]) {
      const a = `grid-${g}-start`;
      const b = `grid-${g}-end`;
      if (out.has(a) && out.has(b)) {
        const at = Array.from(out.keys()).indexOf(a);
        const v = `${out.get(a)} / ${out.get(b)}`;
        out.delete(a);
        out.delete(b);
        insertAt(out, at, `grid-${g}`, v);
      }
    }
  }

  // -- the storyboard's stylesheets, for a standalone page
  const PSEUDO = /(?<!\\)::?[a-zA-Z-]+(\((?:[^()]|\([^()]*\))*\))?/g;
  function splitSelectors(s) {
    const out = [];
    let depth = 0;
    let cur = "";
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === "\\") {
        cur += c + (s[i + 1] || "");
        i++;
        continue;
      }
      if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth--;
      if (c === "," && depth === 0) {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out.map((x) => x.trim()).filter(Boolean);
  }
  function makeUsed(doc) {
    const cache = new Map();
    return (selectorText) => {
      if (!selectorText) return true;
      let r = cache.get(selectorText);
      if (r !== undefined) return r;
      r = false;
      for (const sel of splitSelectors(selectorText)) {
        const bare = sel.replace(PSEUDO, "").trim();
        if (!bare || /[>+~]$/.test(bare) || bare.includes("&")) {
          r = true;
          break;
        }
        try {
          if (doc.querySelector(bare)) {
            r = true;
            break;
          }
        } catch (_) {
          r = true;
          break;
        }
      }
      cache.set(selectorText, r);
      return r;
    };
  }
  function collectCss(ctx, onlyFonts) {
    const doc = ctx.src.doc;
    const used = makeUsed(doc);
    const imports = [];
    const stats = { sheets: 0, rules: 0, kept: 0 };
    const emit = (list, base) => {
      const parts = [];
      for (const r of list) {
        stats.rules++;
        const k = kindOf(r);
        if (onlyFonts) {
          if (k === "CSSFontFaceRule") parts.push(cssUrls(r.cssText, base, ctx, true));
          else if (r.cssRules && k !== "CSSStyleRule" && k !== "CSSKeyframesRule") {
            try {
              const inner = emit(r.cssRules, base);
              if (inner) parts.push(inner);
            } catch (_) {}
          }
          continue;
        }
        if (k === "CSSStyleRule") {
          if (!used(r.selectorText)) continue;
          parts.push(cssUrls(r.cssText, base, ctx, true));
        } else if (k === "CSSMediaRule" || k === "CSSSupportsRule" || k === "CSSLayerBlockRule" || k === "CSSContainerRule") {
          const inner = emit(r.cssRules, base);
          if (!inner) continue;
          const head =
            k === "CSSMediaRule" ? `@media ${r.media.mediaText}` : k === "CSSSupportsRule" ? `@supports ${r.conditionText}` : k === "CSSLayerBlockRule" ? `@layer${r.name ? " " + r.name : ""}` : `@container ${r.conditionText || ""}`;
          parts.push(`${head} {\n${inner}\n}`);
        } else if (k === "CSSImportRule") {
          let inner = null;
          try {
            inner = r.styleSheet ? emit(r.styleSheet.cssRules, r.styleSheet.href || base) : null;
          } catch (_) {}
          const media = r.media && r.media.mediaText;
          if (inner != null) parts.push(media ? `@media ${media} {\n${inner}\n}` : inner);
          else imports.push(`@import url("${absUrl(r.href, { base })}")${media ? " " + media : ""};`);
        } else if (k === "CSSNamespaceRule") imports.push(r.cssText);
        else parts.push(cssUrls(r.cssText, base, ctx, true));
        stats.kept++;
      }
      return parts.join("\n");
    };
    const body = [];
    for (const sh of doc.styleSheets) {
      stats.sheets++;
      const base = sh.href || ctx.base;
      let rules = null;
      try {
        rules = sh.cssRules;
      } catch (_) {}
      if (!rules) {
        if (sh.href && !onlyFonts) imports.push(`@import url("${sh.href}");`);
        continue;
      }
      const t = emit(rules, base);
      if (t) body.push(t);
    }
    ctx.cssStats = stats;
    return [...imports, ...body].join("\n");
  }

  // -- embedded images
  function blobToDataUrl(b) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(r.error);
      r.readAsDataURL(b);
    });
  }
  async function fetchDataUrl(url, el) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), EMBED_TIMEOUT);
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok) {
        const b = await r.blob();
        if (b.size <= EMBED_MAX) return await blobToDataUrl(b);
        return null;
      }
    } catch (_) {}
    if (el && el.localName === "img" && el.complete && el.naturalWidth) {
      try {
        const c = document.createElement("canvas");
        c.width = el.naturalWidth;
        c.height = el.naturalHeight;
        c.getContext("2d").drawImage(el, 0, 0);
        return c.toDataURL("image/png");
      } catch (_) {}
    }
    return null;
  }
  async function resolveAssets(text, ctx) {
    if (!ctx.assets.size) return text;
    const entries = Array.from(ctx.assets.entries());
    let total = 0;
    const done = new Map();
    let i = 0;
    const worker = async () => {
      while (i < entries.length) {
        const [url, a] = entries[i++];
        let d = total < EMBED_TOTAL ? await fetchDataUrl(url, a.el) : null;
        if (d && total + d.length > EMBED_TOTAL) d = null;
        if (d) total += d.length;
        done.set(a.token, d || url);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    ctx.embedded = Array.from(done.values()).filter((v) => v.startsWith("data:")).length;
    let out = text;
    for (const [token, v] of done) out = out.split(token).join(ctx.jsx ? v : escAttr(v));
    return out;
  }

  // -- the three outputs
  function componentName(name) {
    const words = String(name || "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean);
    let s = words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
    if (!s) s = "Storyboard";
    if (/^\d/.test(s)) s = "Storyboard" + s;
    return s;
  }
  const keepDocAttr = (n, ctx) => !DROP_ATTR.test(n) && !(ctx.css && (n === "class" || n === "style"));
  function docAttrs(el, ctx) {
    return Array.from(el.attributes)
      .filter((a) => keepDocAttr(a.name, ctx))
      .map((a) => [a.name, a.value]);
  }
  // The body's own classes/style (and <html>'s classes), kept by wrapping a
  // fragment so nothing set on <body> is lost.
  function wrapperAttrs(ctx) {
    if (ctx.inline) return null;
    const { doc, root } = ctx.src;
    if (ctx.css) {
      const st = cssFor(root, ctx, true);
      return st ? [["style", st]] : null;
    }
    const cls = [...(doc.documentElement.getAttribute("class") || "").split(/\s+/), ...(root.getAttribute("class") || "").split(/\s+/)].filter(Boolean);
    const list = [];
    if (cls.length) list.push(["class", Array.from(new Set(cls)).join(" ")]);
    const st = root.getAttribute("style");
    if (st) list.push(["style", st]);
    return list.length ? list : null;
  }
  function fragmentOf(ctx, ind) {
    const wrap = wrapperAttrs(ctx);
    if (!wrap) return contentStr(ctx.src.root, ind, ctx);
    const fake = { localName: "div", namespaceURI: "http://www.w3.org/1999/xhtml" };
    const a = ctx.jsx ? jsxAttrs(wrap, fake) : htmlAttrs(wrap);
    const inner = contentStr(ctx.src.root, ind + "  ", ctx);
    return `${ind}<div${a}>\n${inner}\n${ind}</div>`;
  }
  function frameRule(info) {
    const w = Math.round(info.box.w);
    const hh = Math.round(info.box.h);
    return `/* The storyboard's frame on the canvas: ${w} x ${hh}. Remove for a fluid page. */\nbody { box-sizing: border-box; width: ${w}px; min-height: ${hh}px; margin-left: auto; margin-right: auto; }`;
  }
  function documentOf(info, ctx) {
    const { doc, root } = ctx.src;
    const htmlA = htmlAttrs(docAttrs(doc.documentElement, ctx));
    const bodyList = docAttrs(root, ctx).filter(([n]) => !ctx.inline || n === "class");
    if (ctx.css) {
      const st = cssFor(root, ctx, true);
      bodyList.push(["style", "margin: 0" + (st ? "; " + st : "")]);
    }
    const bodyA = ctx.inline ? "" : htmlAttrs(bodyList);
    const css = collectCss(ctx, ctx.css);
    const inner = contentStr(root, "", ctx);
    const title = escHtml(info.name);
    const canvas = info.ref.canvasPath ? ` canvas "${escHtml(info.ref.canvasPath)}"` : "";
    return [
      "<!doctype html>",
      `<html${htmlA}>`,
      "<head>",
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${title}</title>`,
      `<!-- Exported from the RE-TEMPO${canvas}, storyboard "${title}", ${new Date().toISOString()} (${ctx.mode === "css" ? "HTML + CSS" : "HTML + Tailwind"}). -->`,
      css ? `<style>\n${css}\n</style>` : "",
      `<style data-storyboard-frame>\n${frameRule(info)}\n</style>`,
      "</head>",
      `<body${bodyA}>`,
      inner,
      "</body>",
      "</html>",
      "",
    ]
      .filter((l) => l !== "")
      .join("\n");
  }
  function reactOf(info, ctx) {
    const name = componentName(info.name);
    let body = fragmentOf(ctx, "    ");
    const tops = body.split("\n").filter((l) => /^ {4}\S/.test(l)).length;
    if (tops > 1 || !/^ {4}</.test(body)) body = `    <>\n${body.replace(/^/gm, "  ")}\n    </>`;
    return [
      `// ${info.name}: exported from the RE-TEMPO canvas${info.ref.canvasPath ? ` (${info.ref.canvasPath})` : ""}.`,
      "// Tailwind classes are kept as className.",
      "",
      `export default function ${name}() {`,
      "  return (",
      body,
      "  );",
      "}",
      "",
    ].join("\n");
  }
  // -> {text, ext, mime, mode, document, via, stats}
  async function buildCode(info, mode, o) {
    const opts = o || {};
    const src = await sourceOf(info);
    if (!src) throw fail("no-source", "This storyboard's page can't be read (its frame is not on screen or is cross-origin).");
    const ctx = makeCtx(src, mode, { embed: !!opts.embed });
    const t0 = now();
    try {
      let text;
      let ext = "html";
      let mime = "text/html";
      if (mode === "react") {
        text = reactOf(info, ctx);
        ext = "jsx";
        mime = "text/javascript";
      } else if (opts.document) text = documentOf(info, ctx);
      else text = fragmentOf(ctx, "");
      text = await resolveAssets(text, ctx);
      if (mode !== "react" && !opts.document && text && !text.endsWith("\n")) text += "\n";
      return { text, ext, mime, mode, document: !!opts.document || mode === "react", via: src.via, stats: { nodes: ctx.count, ms: Math.round(now() - t0), css: ctx.cssStats || null, sizingRules: ctx.sizing ? ctx.sizing.rules : 0, assets: ctx.assets.size, embedded: ctx.embedded || 0 } };
    } finally {
      closeCtx(ctx);
    }
  }

  // ---------------------------------------------------------------- capture
  const captureBridge = () => {
    const b = window.bugReportBridge;
    return b && typeof b.captureAppScreenshot === "function" ? b : null;
  };
  async function grab(bridge) {
    const res = await Promise.race([Promise.resolve().then(() => bridge.captureAppScreenshot()), sleep(CAPTURE_TIMEOUT).then(() => "timeout")]);
    if (res === "timeout") throw fail("capture-timeout", "The screen capture timed out.");
    if (!res || res.ok === false || typeof res.dataUrl !== "string") throw fail("capture-failed", "The screen capture failed.");
    const img = new Image();
    img.src = res.dataUrl;
    await img.decode();
    state.counts.captures++;
    return img;
  }
  const meet = (a, b) => ({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });
  const area = (r) => Math.max(0, r.r - r.l) * Math.max(0, r.b - r.t);
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom };
  };
  const topAt = (x, y) => {
    for (const el of document.elementsFromPoint(x, y)) if (el !== state.blocker) return el;
    return null;
  };
  // What sits over the canvas (toolbars, panels, controls), hit-tested on a
  // grid: the outermost box of each hit that is not the canvas's world.
  function occluders(root) {
    const vp = meet(rectOf(root), { l: 0, t: 0, r: innerWidth, b: innerHeight });
    const world = root.querySelector(WORLD_LAYER);
    const found = new Set();
    const cols = 16;
    const rows = 10;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        let el = topAt(vp.l + ((i + 0.5) * (vp.r - vp.l)) / cols, vp.t + ((j + 0.5) * (vp.b - vp.t)) / rows);
        if (!el || el === root || (world && (el === world || world.contains(el)))) continue;
        if (root.contains(el)) {
          while (el.parentElement && el.parentElement !== root) el = el.parentElement;
          if (el === world) continue;
        } else while (el.parentElement && !el.parentElement.contains(root)) el = el.parentElement;
        found.add(el);
      }
    }
    for (const sel of [TOOLBAR, RIGHT_PANEL]) for (const el of document.querySelectorAll(sel)) if (isShown(el)) found.add(el);
    const out = [];
    for (const el of found) {
      const r = meet(rectOf(el), vp);
      if (area(r) > 0 && area(r) < 0.6 * area(vp)) out.push(r);
    }
    return out;
  }
  // The free part of the canvas on screen (CSS px).
  function usableRect(root) {
    let u = meet(rectOf(root), { l: 0, t: 0, r: innerWidth, b: innerHeight });
    u = { l: u.l + MARGIN, t: u.t + MARGIN, r: u.r - MARGIN, b: u.b - MARGIN };
    for (const o of occluders(root)) {
      if (area(meet(u, o)) <= 0) continue;
      const cuts = [
        { ...u, b: Math.min(u.b, o.t - MARGIN) },
        { ...u, t: Math.max(u.t, o.b + MARGIN) },
        { ...u, r: Math.min(u.r, o.l - MARGIN) },
        { ...u, l: Math.max(u.l, o.r + MARGIN) },
      ].sort((a, b) => area(b) - area(a));
      if (area(cuts[0]) > 0) u = cuts[0];
    }
    return { ...u, w: u.r - u.l, h: u.b - u.t };
  }
  async function settle(info, ok) {
    const t0 = now();
    await frame();
    await frame();
    while (now() - t0 < 700) {
      const r = rectOf(info.sbEl);
      if (ok(r, (r.r - r.l) / info.box.w)) return true;
      await frame();
    }
    return false;
  }
  async function waitLoaded(info) {
    const t0 = now();
    while (now() - t0 < LOADING_WAIT_MS) {
      const l = info.item.querySelector(LOADING);
      if (!l || !isShown(l)) return;
      await sleep(50);
    }
  }
  // Puts tile t's top-left at screen (tx, ty) at zoom z; one correction pass
  // for an offset the view math does not know about.
  async function moveTo(info, z, t, tx, ty) {
    const { handle, root, box: B } = info;
    const at = (r, f) => Math.abs(r.l + t.x * f - tx) < 0.75 && Math.abs(r.t + t.y * f - ty) < 0.75;
    const rr = rectOf(root);
    const v = { zoom: z, x: tx - rr.l - (B.x + t.x) * z, y: ty - rr.t - (B.y + t.y) * z };
    handle.setView(v);
    if (!(await settle(info, at))) {
      const r = rectOf(info.sbEl);
      const f = (r.r - r.l) / B.w;
      const ex = tx - (r.l + t.x * f);
      const ey = ty - (r.t + t.y * f);
      if (Math.abs(ex) > 0.75 || Math.abs(ey) > 0.75) {
        handle.setView({ zoom: z, x: v.x + ex, y: v.y + ey });
        await settle(info, at);
      }
    }
    await waitLoaded(info);
    await sleep(SETTLE_MS);
  }
  function occludedSamples(info, r) {
    let n = 0;
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        const x = r.l + ((i + 0.5) * (r.r - r.l)) / 5;
        const y = r.t + ((j + 0.5) * (r.b - r.t)) / 5;
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) {
          n++;
          continue;
        }
        const el = topAt(x, y);
        if (!el || !info.item.contains(el)) n++;
      }
    }
    return n;
  }
  function tilesFor(B, z, U) {
    let nx = Math.max(1, Math.ceil((B.w * z) / U.w - 1e-6));
    let ny = Math.max(1, Math.ceil((B.h * z) / U.h - 1e-6));
    while (nx * ny > MAX_TILES) {
      z *= 0.85;
      nx = Math.max(1, Math.ceil((B.w * z) / U.w - 1e-6));
      ny = Math.max(1, Math.ceil((B.h * z) / U.h - 1e-6));
    }
    const tw = B.w / nx;
    const th = B.h / ny;
    const tiles = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) tiles.push({ x: i * tw, y: j * th, w: tw, h: th });
    return { z, tiles };
  }
  function block() {
    if (state.blocker) return;
    state.blocker = h("div", { class: "rtcx-blocker", "data-rtcx-blocker": "", "aria-hidden": "true" });
    document.body.appendChild(state.blocker);
    window.addEventListener("keydown", onBusyKey, true);
    window.addEventListener("wheel", stopEvent, { capture: true, passive: false });
  }
  function unblock() {
    if (state.blocker) state.blocker.remove();
    state.blocker = null;
    window.removeEventListener("keydown", onBusyKey, true);
    window.removeEventListener("wheel", stopEvent, { capture: true });
  }
  function onBusyKey(e) {
    if (e.key === "Escape") state.cancel = true;
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  function stopEvent(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  // The storyboard at `scale` output px per canvas unit, from window captures.
  async function renderStoryboard(info, scale, onProgress) {
    const bridge = captureBridge();
    if (!bridge) throw fail("no-capture", "Screen capture isn't available here.");
    const { root, handle, box: B } = info;
    let s = scale;
    let outW = Math.max(1, Math.round(B.w * s));
    let outH = Math.max(1, Math.round(B.h * s));
    const lim = Math.min(1, MAX_SIDE / Math.max(outW, outH), Math.sqrt(MAX_AREA / (outW * outH)));
    if (lim < 1) {
      s *= lim;
      outW = Math.max(1, Math.floor(B.w * s));
      outH = Math.max(1, Math.floor(B.h * s));
    }
    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const g = out.getContext("2d");
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, outW, outH);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    const canMove = !!(handle && typeof handle.setView === "function");
    const v0 = viewOf(root, handle);
    const html = document.documentElement;
    const added = CAPTURE_CLASSES.filter((c) => !html.classList.contains(c));
    const outlineOff = !!(handle && typeof handle.setSelectedOutlineVisible === "function") && !root.querySelector("[data-canvas-selected-outline-hidden]") && !root.hasAttribute("data-canvas-selected-outline-hidden");
    const res = { canvas: out, w: outW, h: outH, scale: s, limited: lim < 1, tiles: 0, moved: false, k: 0, density: 0, occluded: 0 };
    let moved = false;
    state.cancel = false;
    html.classList.add(...added);
    try {
      if (outlineOff) handle.setSelectedOutlineVisible(false);
      await frame();
      await frame();
      const U = usableRect(root);
      if (U.w < 40 || U.h < 40) throw fail("no-room", "The canvas is too small on screen to capture the storyboard.");
      block();
      let k = state.k || 0;
      if (!k) {
        k = (await grab(bridge)).naturalWidth / window.innerWidth; // calibration: capture px per CSS px
        state.k = k;
      }
      const r0 = rectOf(info.sbEl);
      const z0 = (r0.r - r0.l) / B.w;
      const fits = r0.l >= U.l - 0.5 && r0.t >= U.t - 0.5 && r0.r <= U.r + 0.5 && r0.b <= U.b + 0.5;
      const moving = canMove && !(fits && z0 * k >= s * 0.999);
      let plan = moving ? tilesFor(B, s / k, U) : { z: z0, tiles: [{ x: 0, y: 0, w: B.w, h: B.h }] };
      for (let pass = 0; pass < 2; pass++) {
        let replan = null;
        for (let n = 0; n < plan.tiles.length; n++) {
          if (state.cancel) throw fail("cancelled", "Export cancelled.");
          const t = plan.tiles[n];
          if (moving) {
            const tx = U.l + Math.max(0, (U.w - t.w * plan.z) / 2);
            const ty = U.t + Math.max(0, (U.h - t.h * plan.z) / 2);
            await moveTo(info, plan.z, t, tx, ty);
            moved = true;
          }
          const r = rectOf(info.sbEl);
          const f = (r.r - r.l) / B.w;
          // the app clamped the zoom: the tiles no longer fit, plan again once
          if (moving && pass === 0 && Math.abs(f - plan.z) > plan.z * 0.01 && (t.w * f > U.w + 1 || t.h * f > U.h + 1)) {
            replan = tilesFor(B, f, U);
            break;
          }
          if (onProgress) onProgress(n + 1, plan.tiles.length);
          const sx = r.l + t.x * f;
          const sy = r.t + t.y * f;
          const sw = t.w * f;
          const sh = t.h * f;
          res.occluded += occludedSamples(info, { l: sx, t: sy, r: sx + sw, b: sy + sh });
          const img = await grab(bridge);
          k = img.naturalWidth / window.innerWidth;
          state.k = k;
          res.k = k;
          res.density = f * k;
          const dx = Math.floor(t.x * s);
          const dy = Math.floor(t.y * s);
          const dw = Math.min(outW, Math.ceil((t.x + t.w) * s)) - dx;
          const dh = Math.min(outH, Math.ceil((t.y + t.h) * s)) - dy;
          g.drawImage(img, sx * k, sy * k, sw * k, sh * k, dx, dy, dw, dh);
        }
        if (!replan) break;
        plan = replan;
      }
      res.tiles = plan.tiles.length;
      res.moved = moved;
      return res;
    } finally {
      unblock();
      if (moved) {
        try {
          handle.setView(v0);
        } catch (_) {}
      }
      if (outlineOff) {
        try {
          handle.setSelectedOutlineVisible(true);
        } catch (_) {}
      }
      html.classList.remove(...added);
      state.cancel = false;
    }
  }
  const canvasBlob = (c, mime, q) =>
    new Promise((res, rej) => {
      c.toBlob((b) => (b && (b.type === mime || mime === "image/png") ? res(b) : rej(fail("encode-failed", `This app can't encode ${mime}.`))), mime, q);
    });

  // -------------------------------------------------------------------- PDF
  async function deflate(u8) {
    const s = new Blob([u8]).stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  function pdfText(str) {
    let hex = "FEFF";
    for (const ch of String(str)) {
      const c = ch.codePointAt(0);
      if (c > 0xffff) {
        const v = c - 0x10000;
        hex += (0xd800 + (v >> 10)).toString(16).padStart(4, "0") + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, "0");
      } else hex += c.toString(16).padStart(4, "0");
    }
    return "<" + hex.toUpperCase() + ">";
  }
  const pdfNum = (n) => String(Math.round(n * 100) / 100);
  // One image per page: [{wPt, hPt, img: {w, h, filter, bytes}}] -> bytes.
  function pdfBytes(pages, title) {
    const enc = new TextEncoder();
    const chunks = [];
    const offsets = [];
    let len = 0;
    const push = (x) => {
      const b = typeof x === "string" ? enc.encode(x) : x;
      chunks.push(b);
      len += b.length;
    };
    const obj = (n, body) => {
      offsets[n] = len;
      push(`${n} 0 obj\n${body}\nendobj\n`);
    };
    const stream = (n, dict, bytes) => {
      offsets[n] = len;
      push(`${n} 0 obj\n<< ${dict}${dict ? " " : ""}/Length ${bytes.length} >>\nstream\n`);
      push(bytes);
      push("\nendstream\nendobj\n");
    };
    push("%PDF-1.4\n");
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    const n = pages.length;
    const infoN = 3 + 3 * n;
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + 3 * i} 0 R`).join(" ")}] /Count ${n} >>`);
    pages.forEach((p, i) => {
      const pn = 3 + 3 * i;
      const w = pdfNum(p.wPt);
      const hh = pdfNum(p.hPt);
      obj(pn, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${hh}] /Resources << /XObject << /Im0 ${pn + 1} 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ${pn + 2} 0 R >>`);
      stream(pn + 1, `/Type /XObject /Subtype /Image /Width ${p.img.w} /Height ${p.img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${p.img.filter}`, p.img.bytes);
      stream(pn + 2, "", enc.encode(`q ${w} 0 0 ${hh} 0 0 cm /Im0 Do Q`));
    });
    const d = new Date();
    const p2 = (x) => String(x).padStart(2, "0");
    const date = `D:${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    obj(infoN, `<< /Title ${pdfText(title)} /Producer (RE-TEMPO canvas-export) /Creator (RE-TEMPO) /CreationDate (${date}) >>`);
    const xref = len;
    let x = `xref\n0 ${infoN + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= infoN; i++) x += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    push(x);
    push(`trailer\n<< /Size ${infoN + 1} /Root 1 0 R /Info ${infoN} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(len);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
  // The rendered canvas as a PDF: page = the storyboard in points, the image
  // at the export's density; pages taller than PDF_MAX_PT are split.
  async function makePdf(canvas, title, s) {
    const W = canvas.width;
    const H = canvas.height;
    const pxPerPt = s / PDF_PT;
    const sliceMax = Math.max(1, Math.floor(PDF_MAX_PT * pxPerPt));
    const g = canvas.getContext("2d");
    const pages = [];
    for (let y = 0; y < H; y += sliceMax) {
      const hh = Math.min(sliceMax, H - y);
      let img;
      if (W * hh <= PDF_FLATE_MAX && typeof CompressionStream === "function") {
        const data = g.getImageData(0, y, W, hh).data;
        const rgb = new Uint8Array(W * hh * 3);
        for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
          rgb[j] = data[i];
          rgb[j + 1] = data[i + 1];
          rgb[j + 2] = data[i + 2];
        }
        img = { w: W, h: hh, filter: "FlateDecode", bytes: await deflate(rgb) };
      } else {
        const c = document.createElement("canvas");
        c.width = W;
        c.height = hh;
        c.getContext("2d").drawImage(canvas, 0, y, W, hh, 0, 0, W, hh);
        const b = await canvasBlob(c, "image/jpeg", IMAGE_QUALITY);
        img = { w: W, h: hh, filter: "DCTDecode", bytes: new Uint8Array(await b.arrayBuffer()) };
      }
      pages.push({ wPt: W / pxPerPt, hPt: hh / pxPerPt, img });
    }
    return { bytes: pdfBytes(pages, title), pages: pages.length, filters: pages.map((p) => p.img.filter) };
  }

  // ------------------------------------------------------------ files, copy
  const fsApi = () => (window.electronAPI && window.electronAPI.fs) || null;
  const finderApi = () => {
    const w = window.electronAPI && window.electronAPI.workspaces;
    return w && typeof w.openInApp === "function" ? w : null;
  };
  function exportDir(info) {
    const ws = info.ref && info.ref.workspacePath;
    const cp = info.ref && info.ref.canvasPath;
    if (!cp) return null;
    if (cp.startsWith("/")) return cp.replace(/\/+$/, "") + "/exports";
    if (!ws) return null;
    return ws.replace(/\/+$/, "") + "/" + cp.replace(/^\/+|\/+$/g, "") + "/exports";
  }
  function fileBase(name) {
    let s = String(name || "")
      .replace(/[\/\\:*?"<>|\u0000-\u001f]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\.+/, "");
    if (!s) s = "Storyboard";
    return s.slice(0, 120);
  }
  async function checkSize(f, path, size) {
    if (typeof f.stat !== "function") return true;
    try {
      let st = await f.stat(path);
      if (st && typeof st === "object" && "success" in st) st = st.success ? st.data : null;
      const n = st && typeof st.size === "number" ? st.size : null;
      return n == null || Math.abs(n - size) <= 2;
    } catch (_) {
      return true;
    }
  }
  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: name });
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  // Writes <canvas folder>/exports/<name> through the file bridge, else downloads.
  async function saveFile(info, name, data, mime) {
    const f = fsApi();
    const dir = exportDir(info);
    const isText = typeof data === "string";
    const blob = isText ? new Blob([data], { type: mime || "text/plain" }) : data;
    let why;
    const write = f && (isText ? f.writeFile : f.writeBinaryFile);
    if (dir && typeof write === "function") {
      const path = dir + "/" + name;
      try {
        const r = isText ? await f.writeFile(path, data) : await f.writeBinaryFile(path, (await blobToDataUrl(blob)).replace(/^data:[^,]*,/, ""));
        if (r && r.success === false) why = r.error || "the write failed";
        else if (await checkSize(f, path, blob.size)) return { via: "file", path, dir, bytes: blob.size };
        else why = "the written size doesn't match";
      } catch (e) {
        why = String((e && e.message) || e);
      }
    } else why = !f ? "no file bridge" : !dir ? "no workspace path" : "no write bridge";
    download(name, blob);
    return { via: "download", path: null, dir: null, bytes: blob.size, why };
  }
  async function writeClipboard(text) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
        return "clipboard";
      }
    } catch (_) {}
    const prev = document.activeElement;
    const ta = h("textarea", { "aria-hidden": "true", tabindex: "-1" });
    ta.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0";
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (_) {}
    ta.remove();
    if (prev && typeof prev.focus === "function") prev.focus({ preventScroll: true });
    if (!ok) throw fail("clipboard", "Couldn't write to the clipboard.");
    return "execCommand";
  }
  function reveal(path) {
    const w = finderApi();
    if (!w || !path) return false;
    Promise.resolve()
      .then(() => w.openInApp(path, "finder"))
      .then((r) => {
        if (r && r.success === false) toast(r.error || "Couldn't open Finder", { kind: "error" });
      })
      .catch(() => toast("Couldn't open Finder", { kind: "error" }));
    return true;
  }

  // ------------------------------------------------------------- operations
  function needInfo(o) {
    const info = (o && o.info) || selectedStoryboard();
    if (!info) throw fail("no-selection", "Select one storyboard first.");
    return info;
  }
  const codeMode = (m) => {
    const id = String(m || prefs.code).toLowerCase();
    return CODE_FORMATS.some((f) => f.id === id) ? id : id === "html" ? "tailwind" : id === "jsx" ? "react" : prefs.code;
  };
  // Code of the selected storyboard, as text (no clipboard, no file).
  async function code(format, o) {
    const info = needInfo(o);
    const mode = codeMode(format);
    const r = await buildCode(info, mode, { document: mode !== "react" && !!(o && o.document), embed: !!(o && o.embed) });
    return r.text;
  }
  async function copyCode(o) {
    const opts = o || {};
    const info = needInfo(opts);
    const mode = codeMode(opts.format);
    const r = await buildCode(info, mode, { document: mode !== "react" && (opts.document != null ? !!opts.document : prefs.fullDoc), embed: false });
    const via = await writeClipboard(r.text);
    state.counts.copies++;
    const res = { kind: "copy", format: mode, document: r.document, chars: r.text.length, lines: r.text.split("\n").length, source: r.via, clipboard: via, stats: r.stats, storyboard: info.name };
    state.last = res;
    return res;
  }
  async function exportCode(o) {
    const opts = o || {};
    const info = needInfo(opts);
    const mode = codeMode(opts.format);
    const r = await buildCode(info, mode, { document: true, embed: opts.embed != null ? !!opts.embed : prefs.embed });
    const name = mode === "react" ? componentName(info.name) + ".jsx" : fileBase(info.name) + (mode === "css" ? ".inline.html" : ".html");
    const saved = await saveFile(info, name, r.text, r.mime);
    state.counts.codeExports++;
    const res = { kind: "code", format: mode, name, chars: r.text.length, source: r.via, stats: r.stats, storyboard: info.name, ...saved };
    state.last = res;
    return res;
  }
  async function exportImage(o) {
    const opts = o || {};
    const info = needInfo(opts);
    const scale = Number(opts.scale != null ? opts.scale : prefs.scale);
    if (!(scale > 0 && scale <= 4)) throw fail("bad-scale", "The scale must be between 0 and 4.");
    const want = String(opts.format || prefs.format).toLowerCase().replace(/^jpg$/, "jpeg");
    const fmt = IMAGE_FORMATS.find((f) => f.id === want);
    if (!fmt) throw fail("bad-format", "The format must be png, jpeg, webp or pdf.");
    const t0 = now();
    const shot = await renderStoryboard(info, scale, opts.onProgress);
    let blob;
    let pdf = null;
    if (fmt.id === "pdf") {
      pdf = await makePdf(shot.canvas, info.name, shot.scale);
      blob = new Blob([pdf.bytes], { type: fmt.mime });
    } else blob = await canvasBlob(shot.canvas, fmt.mime, IMAGE_QUALITY);
    const name = fileBase(info.name) + (scale !== 1 ? `@${scale}x` : "") + "." + fmt.ext;
    const saved = await saveFile(info, name, blob);
    state.counts.images++;
    const res = {
      kind: "image",
      format: fmt.id,
      name,
      w: shot.w,
      h: shot.h,
      scale: Math.round(shot.scale * 1000) / 1000,
      requested: scale,
      limited: shot.limited,
      tiles: shot.tiles,
      moved: shot.moved,
      density: Math.round(shot.density * 100) / 100,
      occluded: shot.occluded,
      pages: pdf ? pdf.pages : 0,
      pdfFilters: pdf ? pdf.filters : null,
      ms: Math.round(now() - t0),
      storyboard: info.name,
      ...saved,
    };
    state.last = res;
    return res;
  }
  function normalizeUrl(raw) {
    const s = String(raw || "").trim();
    if (!s) return null;
    const B = window.__RE_TEMPO_CANVAS_BROWSER__;
    if (B && typeof B.normalizeUrl === "function") {
      try {
        const u = B.normalizeUrl(s);
        if (u && /^https?:\/\//i.test(u)) return u;
      } catch (_) {}
    }
    if (/^https?:\/\/\S+$/i.test(s)) return s;
    if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/\S*)?$/i.test(s)) return "http://" + s;
    if (/^[^\s/]+\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(s)) return "https://" + s;
    return null;
  }
  // World spot right of the storyboard, past whatever is already there.
  function spotRightOf(info, w, hh) {
    const B = info.box;
    const boxes = [];
    for (const el of info.root.querySelectorAll(ITEM)) {
      const b = itemBox(el);
      if (b) boxes.push(b);
    }
    for (const api of [window.__RE_TEMPO_CANVAS_BROWSER__, window.__RE_TEMPO_CANVAS_SHADER__]) {
      try {
        for (const f of api && typeof api.frames === "function" ? api.frames() : []) if (f && [f.x, f.y, f.w, f.h].every(Number.isFinite)) boxes.push({ x: f.x, y: f.y, w: f.w, h: f.h });
      } catch (_) {}
    }
    let x = B.x + B.w + 80;
    const y = B.y;
    for (let i = 0; i < 60; i++) {
      const hit = boxes.find((b) => x < b.x + b.w + 40 && x + w + 40 > b.x && y < b.y + b.h && y + hh > b.y);
      if (!hit) break;
      x = hit.x + hit.w + 80;
    }
    return { x: Math.round(x), y: Math.round(y) };
  }
  async function importWeb(raw, o) {
    const info = needInfo(o);
    const url = normalizeUrl(raw);
    if (!url) throw fail("bad-url", "Enter a web address, like https://example.com");
    const w = Math.max(320, Math.round(info.box.w));
    const hh = Math.max(320, Math.min(Math.round(info.box.h), 1200));
    const at = spotRightOf(info, w, hh);
    const args = { url, x: at.x, y: at.y, w, h: hh };
    let id = null;
    let via = null;
    const B = window.__RE_TEMPO_CANVAS_BROWSER__;
    if (B && typeof B.create === "function") {
      id = B.create({ ...args, focus: false });
      via = "canvas-browser";
    }
    if (!id) {
      const reg = window.__RE_TEMPO_ACTIONS__;
      if (reg && typeof reg.run === "function" && (typeof reg.has !== "function" || reg.has("canvas.browser.create"))) {
        const r = await reg.run("canvas.browser.create", args);
        if (r && r.status === "done") {
          id = (r.result && r.result.id) || "created";
          via = "actions";
        } else if (r) throw fail("browser", r.reason || "The Browser frame wasn't created.");
      }
    }
    if (!id) throw fail("no-browser", "Browser frames aren't available (canvas-browser is off).");
    state.counts.imports++;
    const res = { kind: "import", id, url, via, ...args, storyboard: info.name };
    state.last = res;
    return res;
  }

  // ------------------------------------------------------------------ toast
  function toastAnchor() {
    const r = (state.sel && state.sel.root && isShown(state.sel.root) && state.sel.root) || Array.from(document.querySelectorAll(CANVAS_ROOT)).find(isShown);
    return r ? r.getBoundingClientRect() : { left: 0, width: innerWidth, bottom: innerHeight };
  }
  function toast(text, o) {
    hideToast();
    const opts = o || {};
    const kids = [h("span", { class: "rtcx-toast-text", text })];
    if (opts.action) {
      const b = h("button", { class: "rtcx-toast-action", type: "button", text: opts.action.label, "data-rtcx-toast-action": "" });
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        hideToast();
        opts.action.run();
      });
      kids.push(b);
    }
    const el = h("div", { class: "rtcx-toast", role: opts.kind === "error" ? "alert" : "status", "aria-live": "polite", "data-rtcx-toast": "", "data-kind": opts.kind || "info", "data-plain": opts.action ? null : "" }, ...kids);
    document.body.appendChild(el);
    const a = toastAnchor();
    el.style.left = Math.round(a.left + a.width / 2) + "px";
    el.style.top = Math.round(Math.min(innerHeight, a.bottom) - 76 - el.offsetHeight) + "px";
    requestAnimationFrame(() => el.setAttribute("data-show", ""));
    const t = { el, timer: 0 };
    const arm = (ms) => {
      clearTimeout(t.timer);
      t.timer = setTimeout(() => state.toast === t && hideToast(), ms);
    };
    el.addEventListener("pointerenter", () => clearTimeout(t.timer));
    el.addEventListener("pointerleave", () => arm(1600));
    arm(opts.ms || TOAST_MS);
    state.toast = t;
  }
  function hideToast() {
    const t = state.toast;
    if (!t) return;
    clearTimeout(t.timer);
    t.el.remove();
    state.toast = null;
  }
  const errText = (e) => (e && e.message) || String(e);
  function report(e, what) {
    state.counts.errors++;
    state.lastError = { at: Date.now(), what, code: (e && e.code) || null, message: errText(e) };
    if (e && e.code === "cancelled") toast("Export cancelled");
    else toast(`Couldn't ${what}: ${errText(e)}`, { kind: "error", ms: 6000 });
  }

  // --------------------------------------------------------------------- UI
  const ui = { wrap: null, codeBody: null, exportBody: null, exportSection: null };
  // The nodes that carry the panel's state attributes: the one wrapper when
  // injected, the two section bodies when canvas-chrome hosts them.
  const uiRoots = () => (state.mode === "chrome" ? [ui.codeBody, ui.exportBody] : [ui.wrap]).filter(Boolean);
  // Both parts are in the document (chrome: Code and Export sections drawn).
  const uiMounted = () => (state.mode === "chrome" ? !!(ui.codeBody && ui.codeBody.isConnected && ui.exportBody && ui.exportBody.isConnected) : !!(ui.wrap && ui.wrap.isConnected));
  function selectBox(options, value, label, attr) {
    const sel = h("select", { class: "rtcx-select-el", "aria-label": label, [attr]: "" });
    for (const o of options) sel.append(h("option", { value: o.id, text: o.label }));
    sel.value = value;
    const wrap = h("div", { class: "rtcx-select" }, sel, icon("chevron", "rtcx-select-ic", 1.5));
    return { wrap, sel };
  }
  const button = (label, attr, extra) => h("button", { type: "button", class: "rtcx-btn" + (extra ? " " + extra : ""), [attr]: "", text: label });
  function sectionHead(key, title, tools) {
    return h("div", { "data-section-header": key, class: HEAD_CLS + " rtcx-head" }, h("div", { "data-property-row": "", class: "flex flex-1 items-center justify-between rtcx-head-row" }, h("span", { class: TITLE_CLS + " rtcx-title", text: title }), h("div", { class: "flex items-center rtcx-tools" }, ...(tools || []))));
  }
  function buildUi() {
    const gear = h("button", { type: "button", class: ICON_BTN + " rtcx-icon-btn", "aria-label": "Code options", title: "Code options", "aria-haspopup": "menu", "aria-expanded": "false", "data-rtcx-code-options": "" }, icon("settings", null, 1.5));
    const codeSel = selectBox(CODE_FORMATS, prefs.code, "Code format", "data-rtcx-code-format");
    const copyBtn = button("Copy HTML", "data-rtcx-copy");
    const exportBtn = button("Export HTML", "data-rtcx-export-code");
    const importBtn = button("Import Web via Browser", "data-rtcx-import", "rtcx-btn-wide");
    const codeBody = h("div", { class: BODY_CLS + " rtcx-body", "data-rtcx-body": "code" }, codeSel.wrap, h("div", { class: "rtcx-row" }, copyBtn, exportBtn), importBtn);
    const codeSec = h("div", { class: "rtcx-section", "data-rtcx-section": "code", role: "group", "aria-label": "Code" }, sectionHead("code", "Code", [gear]), codeBody);
    const scaleSel = selectBox(SCALES.map((s) => ({ id: String(s), label: s + "x" })), String(prefs.scale), "Export scale", "data-rtcx-scale");
    const fmtSel = selectBox(IMAGE_FORMATS, prefs.format, "Export format", "data-rtcx-format");
    const layerBtn = button("Export layer", "data-rtcx-export-layer", "rtcx-btn-wide");
    const hint = h("div", { class: "rtcx-hint", "data-rtcx-hint": "", "aria-live": "polite" });
    const exportBody = h("div", { class: BODY_CLS + " rtcx-body", "data-rtcx-body": "export" }, h("div", { class: "rtcx-row" }, scaleSel.wrap, fmtSel.wrap), layerBtn, hint);
    const exportSec = h("div", { class: "rtcx-section", "data-rtcx-section": "export", role: "group", "aria-label": "Export" }, sectionHead("export", "Export", []), exportBody);
    const wrap = h("div", { class: "rtcx-wrap", "data-rtcx-root": "", "data-testid": "canvas-export-sections" }, codeSec, exportSec);
    Object.assign(ui, { wrap, codeBody, exportBody, gear, codeSel: codeSel.sel, copyBtn, exportBtn, importBtn, codeSec, scaleSel: scaleSel.sel, fmtSel: fmtSel.sel, layerBtn, hint, exportSec });

    codeSel.sel.addEventListener("change", () => {
      prefs.code = codeMode(codeSel.sel.value);
      savePrefs();
      updateUi(state.sel);
    });
    scaleSel.sel.addEventListener("change", () => {
      prefs.scale = Number(scaleSel.sel.value) || 1;
      savePrefs();
      updateUi(state.sel);
    });
    fmtSel.sel.addEventListener("change", () => {
      prefs.format = fmtSel.sel.value;
      savePrefs();
      updateUi(state.sel);
    });
    gear.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMenu();
    });
    copyBtn.addEventListener("click", () => run(copyBtn, "Copying…", "copy the code", async () => {
      const r = await copyCode();
      toast(`Copied ${r.format === "react" ? "JSX" : "HTML"} · ${r.lines} lines`);
    }));
    exportBtn.addEventListener("click", () => run(exportBtn, "Exporting…", "export the code", async () => {
      const r = await exportCode();
      savedToast(r);
    }));
    importBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.pop && state.pop.kind === "import") closePop();
      else openImport(importBtn);
    });
    layerBtn.addEventListener("click", () => run(layerBtn, "Exporting…", "export the layer", async () => {
      const r = await exportImage({ onProgress: (i, n) => n > 1 && (layerBtn.textContent = `Exporting ${i}/${n}…`) });
      savedToast(r);
    }));
  }
  async function run(btn, busyLabel, what, fn) {
    if (state.busy) return;
    const label = btn.textContent;
    state.busy = what;
    btn.textContent = busyLabel;
    btn.setAttribute("aria-busy", "true");
    for (const n of uiRoots()) n.setAttribute("data-busy", "");
    try {
      await fn();
    } catch (e) {
      report(e, what);
    } finally {
      state.busy = null;
      btn.removeAttribute("aria-busy");
      for (const n of uiRoots()) n.removeAttribute("data-busy");
      btn.textContent = label;
      updateUi(state.sel);
    }
  }
  function savedToast(r) {
    const size = r.kind === "image" ? ` · ${r.w} × ${r.h}` + (r.pages > 1 ? ` · ${r.pages} pages` : "") : "";
    if (r.via === "file") toast(`Exported ${r.name}${size}`, finderApi() ? { action: { label: "Reveal in Finder", run: () => reveal(r.path) } } : null);
    else toast(`Downloaded ${r.name}${size}`);
  }
  function updateUi(info) {
    if (!ui.wrap) return;
    const react = prefs.code === "react";
    if (!state.busy) {
      ui.copyBtn.textContent = react ? "Copy JSX" : "Copy HTML";
      ui.exportBtn.textContent = react ? "Export JSX" : "Export HTML";
      ui.layerBtn.textContent = "Export layer";
    }
    ui.codeSel.value = prefs.code;
    ui.scaleSel.value = String(prefs.scale);
    ui.fmtSel.value = prefs.format;
    const busy = !!state.busy;
    for (const b of [ui.copyBtn, ui.exportBtn, ui.importBtn, ui.layerBtn]) b.disabled = busy;
    const canBrowse = !!((window.__RE_TEMPO_CANVAS_BROWSER__ && window.__RE_TEMPO_CANVAS_BROWSER__.create) || (window.__RE_TEMPO_ACTIONS__ && window.__RE_TEMPO_ACTIONS__.run));
    if (!canBrowse) ui.importBtn.disabled = true;
    ui.importBtn.title = canBrowse ? "Open a web page in a Browser frame next to this storyboard" : "Browser frames aren't available (canvas-browser is off)";
    const cap = !!captureBridge();
    if (!cap) ui.layerBtn.disabled = true;
    ui.layerBtn.title = cap ? "Export this storyboard (⌘⇧E)" : "Screen capture isn't available here";
    if (info) {
      const s = prefs.scale;
      const w = Math.round(info.box.w * s);
      const hh = Math.round(info.box.h * s);
      const fmt = IMAGE_FORMATS.find((f) => f.id === prefs.format) || IMAGE_FORMATS[0];
      const pages = fmt.id === "pdf" ? Math.ceil((info.box.h * PDF_PT) / PDF_MAX_PT) : 1;
      const dir = exportDir(info);
      ui.hint.textContent = `${w} × ${hh} px · ${fileBase(info.name)}${s !== 1 ? "@" + s + "x" : ""}.${fmt.ext}${pages > 1 ? ` · ${pages} pages` : ""}`;
      ui.hint.title = dir ? `Saved to ${dir}` : "Downloaded (no workspace folder)";
      for (const n of uiRoots()) n.setAttribute("data-storyboard", info.name);
    }
  }

  // -- the gear menu (code options)
  function toggleMenu() {
    if (state.menu) return closeMenu();
    if (!ui.gear) return;
    const item = (key, label, checked, onPick, disabled) => {
      const b = h("button", { type: "button", class: "rtcx-menu-item", role: checked == null ? "menuitem" : "menuitemcheckbox", "aria-checked": checked == null ? null : String(!!checked), "data-rtcx-option": key, disabled: disabled ? "" : null });
      b.append(h("span", { class: "rtcx-menu-check" }, checked ? icon("check", "rtcx-ic", 2) : checked == null ? icon("folder", "rtcx-ic", 1.5) : null), h("span", { class: "rtcx-menu-label", text: label }));
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu();
        onPick();
      });
      return b;
    };
    const info = state.sel;
    const dir = info && exportDir(info);
    const menu = h(
      "div",
      { class: "rtcx-menu", role: "menu", "aria-label": "Code options", "data-rtcx-menu": "" },
      item("fullDoc", "Copy as a full page", prefs.fullDoc, () => {
        prefs.fullDoc = !prefs.fullDoc;
        savePrefs();
      }),
      item("embed", "Embed images in exports", prefs.embed, () => {
        prefs.embed = !prefs.embed;
        savePrefs();
      }),
      h("div", { class: "rtcx-menu-sep", role: "separator" }),
      item("folder", "Open exports folder", null, () => reveal(dir), !(dir && finderApi()))
    );
    for (const t of ["pointerdown", "mousedown", "click", "wheel", "contextmenu"]) menu.addEventListener(t, (e) => e.stopPropagation());
    menu.addEventListener("keydown", (e) => {
      const items = Array.from(menu.querySelectorAll(".rtcx-menu-item:not([disabled])"));
      const i = items.indexOf(document.activeElement);
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
        ui.gear.focus({ preventScroll: true });
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        const n = items.length;
        if (n) items[(i + (e.key === "ArrowDown" ? 1 : -1) + n) % n].focus();
      }
    });
    document.body.appendChild(menu);
    const r = ui.gear.getBoundingClientRect();
    const w = menu.offsetWidth || 220;
    menu.style.left = Math.round(Math.max(8, Math.min(r.right - w, innerWidth - 8 - w))) + "px";
    menu.style.top = Math.round(Math.min(r.bottom + 4, innerHeight - 8 - menu.offsetHeight)) + "px";
    state.menu = menu;
    ui.gear.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => menu.setAttribute("data-show", ""));
    const first = menu.querySelector(".rtcx-menu-item:not([disabled])");
    if (first) first.focus({ preventScroll: true });
  }
  function closeMenu() {
    if (!state.menu) return;
    state.menu.remove();
    state.menu = null;
    if (ui.gear) ui.gear.setAttribute("aria-expanded", "false");
  }

  // -- the URL prompt (Import Web via Browser)
  function openImport(anchor) {
    closePop();
    closeMenu();
    const input = h("input", { type: "text", class: "rtcx-input", placeholder: "https://example.com", "aria-label": "Web address", spellcheck: "false", autocomplete: "off", autocapitalize: "off", "data-rtcx-import-url": "" });
    const err = h("div", { class: "rtcx-pop-error", role: "alert", "data-rtcx-import-error": "" });
    err.hidden = true;
    const cancel = h("button", { type: "button", class: "rtcx-btn", text: "Cancel" });
    const go = h("button", { type: "button", class: "rtcx-btn rtcx-btn-primary", text: "Import", "data-rtcx-import-go": "" });
    const pop = h(
      "div",
      { class: "rtcx-pop", role: "dialog", "aria-label": "Import web page", "data-rtcx-pop": "import" },
      h("div", { class: "rtcx-pop-title", text: "Import web page" }),
      h("div", { class: "rtcx-pop-hint", text: "Opens it in a Browser frame next to the storyboard." }),
      input,
      err,
      h("div", { class: "rtcx-pop-actions" }, cancel, go)
    );
    const submit = async () => {
      go.disabled = true;
      try {
        const r = await importWeb(input.value);
        closePop();
        toast(`Browser frame added · ${r.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}`);
      } catch (e) {
        err.textContent = errText(e);
        err.hidden = false;
        input.focus();
      } finally {
        go.disabled = false;
      }
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closePop();
        anchor.focus({ preventScroll: true });
      }
    });
    input.addEventListener("input", () => (err.hidden = true));
    cancel.addEventListener("click", () => {
      closePop();
      anchor.focus({ preventScroll: true });
    });
    go.addEventListener("click", submit);
    for (const t of ["pointerdown", "mousedown", "click", "wheel", "contextmenu"]) pop.addEventListener(t, (e) => e.stopPropagation());
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth || 280;
    const hh = pop.offsetHeight || 140;
    pop.style.left = Math.round(Math.max(8, Math.min(r.right - w, innerWidth - 8 - w))) + "px";
    pop.style.top = Math.round(r.bottom + 6 + hh > innerHeight - 8 ? Math.max(8, r.top - 6 - hh) : r.bottom + 6) + "px";
    state.pop = { kind: "import", el: pop, anchor };
    anchor.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => pop.setAttribute("data-show", ""));
    input.focus({ preventScroll: true });
  }
  function closePop() {
    if (!state.pop) return;
    state.pop.el.remove();
    if (state.pop.anchor) state.pop.anchor.setAttribute("aria-expanded", "false");
    state.pop = null;
  }

  // -------------------------------------------------------- mount and sync
  function unmount() {
    closeMenu();
    closePop();
    if (ui.wrap && ui.wrap.parentElement && state.mode !== "chrome") ui.wrap.remove();
  }
  // window.__RE_TEMPO_CANVAS_CHROME__.registerRightSection, when present.
  function useChrome() {
    const c = window.__RE_TEMPO_CANVAS_CHROME__;
    const fn = c && typeof c.registerRightSection === "function" ? c.registerRightSection : null;
    if (!fn) {
      if (state.mode === "chrome") {
        try {
          if (state.chromeOff) state.chromeOff();
        } catch (_) {}
        state.chromeOff = null;
        state.mode = "inject";
        state.chromeTried = null;
        // back to the one wrapper (the chrome's sections are gone)
        if (ui.wrap) {
          ui.codeBody.classList.remove("rtcx-in-chrome");
          ui.exportBody.classList.remove("rtcx-in-chrome");
          ui.codeSec.append(ui.codeBody);
          ui.exportSec.append(ui.exportBody);
          const tools = ui.codeSec.querySelector(".rtcx-tools");
          if (tools && ui.gear) tools.append(ui.gear);
        }
      }
      return false;
    }
    if (state.mode === "chrome") return true;
    if (state.chromeTried === c) return false;
    state.chromeTried = c;
    // Two sections in canvas-chrome's Properties card: Code (130) and Export
    // (140). The chrome draws the header (title, 40 px row); this mod fills
    // the body, and the Code gear goes into the header's actions.
    const ids = ["canvas-export-code", "canvas-export-export"];
    const when = () => state.enabled && !!selectedStoryboard();
    const mountBody = (get, section) => (body, ctx) => {
      if (!ui.wrap) buildUi();
      const node = get();
      node.classList.add("rtcx-in-chrome");
      body.appendChild(node);
      if (section === "code" && ctx && ctx.actions) ctx.actions.appendChild(ui.gear);
      else if (section === "export") ui.exportSection = (ctx && ctx.section) || null;
      state.mode = "chrome";
      updateUi(state.sel || selectedStoryboard());
      return () => {
        if (node.parentElement === body) node.remove();
        if (section === "code" && ui.gear && ctx && ctx.actions && ui.gear.parentElement === ctx.actions) ui.gear.remove();
        if (section === "export") ui.exportSection = null;
      };
    };
    const done = [];
    try {
      const specs = [
        { id: ids[0], label: "Code", order: 130, when, render: mountBody(() => ui.codeBody, "code") },
        { id: ids[1], label: "Export", order: 140, when, render: mountBody(() => ui.exportBody, "export") },
      ];
      for (const def of specs) {
        if (!fn.call(c, def)) throw new Error("registerRightSection refused " + def.id);
        done.push(def.id);
      }
    } catch (_) {
      for (const id of done)
        try {
          c.unregisterRightSection(id);
        } catch (_) {}
      return false;
    }
    if (ui.wrap && ui.wrap.parentElement) ui.wrap.remove();
    state.chromeOff = () => {
      for (const id of ids)
        try {
          c.unregisterRightSection(id);
        } catch (_) {}
    };
    state.mode = "chrome";
    return true;
  }
  function sync() {
    state.counts.syncs++;
    const on = flagOn();
    if (on !== state.enabled) {
      state.enabled = on;
      if (!on) {
        unmount();
        hideToast();
      }
    }
    if (!state.enabled) return;
    const info = state.busy && state.sel ? state.sel : selectedStoryboard();
    state.sel = info;
    if (useChrome()) {
      if (uiMounted()) updateUi(info);
      return;
    }
    if (!info) return unmount();
    const body = panelBodyFor(info.root);
    if (!body) return unmount();
    if (!ui.wrap) buildUi();
    // Never moved once inside the body: CSS order puts it after the app's
    // sections and canvas-shader's Effects (which keeps itself last).
    if (ui.wrap.parentElement !== body) body.appendChild(ui.wrap);
    updateUi(info);
  }
  function schedule() {
    if (state.raf) return;
    state.raf = requestAnimationFrame(() => {
      state.raf = 0;
      sync();
    });
  }
  function onPointer(e) {
    const t = e.target;
    const r = t && t.closest ? t.closest(CANVAS_ROOT) : null;
    if (r) state.lastRoot = r;
    if (state.menu && !state.menu.contains(t) && !(ui.gear && ui.gear.contains(t))) closeMenu();
    if (state.pop && !state.pop.el.contains(t) && !(state.pop.anchor && state.pop.anchor.contains(t))) closePop();
    schedule();
  }

  // ⌘⇧E: the Export section, focused (only with a storyboard selected).
  async function focusExport() {
    const info = selectedStoryboard();
    if (!info) return false;
    sync();
    if (!uiMounted()) {
      const panel = Array.from(document.querySelectorAll(RIGHT_PANEL)).find(isShown);
      const tab = panel && Array.from(panel.querySelectorAll('[role="tab"]')).find((b) => /design/i.test(b.textContent || "") || /design/i.test(b.getAttribute("data-testid") || ""));
      if (tab && tab.getAttribute("aria-selected") !== "true") {
        tab.click();
        for (let i = 0; i < 16 && !uiMounted(); i++) {
          await sleep(50);
          sync();
        }
      }
    }
    if (!uiMounted()) {
      toast("Open the canvas's right panel to export", { kind: "error" });
      return false;
    }
    const sec = (state.mode === "chrome" && ui.exportSection) || ui.exportSec;
    sec.scrollIntoView({ block: "nearest" });
    ui.scaleSel.focus({ preventScroll: true });
    sec.removeAttribute("data-flash");
    void sec.offsetWidth;
    sec.setAttribute("data-flash", "");
    setTimeout(() => sec.removeAttribute("data-flash"), 1000);
    return true;
  }
  function onKey(e) {
    if (!state.enabled || state.busy) return;
    const mod = IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
    if (!mod || !e.shiftKey || e.altKey || e.code !== "KeyE") return;
    if (isEditable(e.target)) return;
    if (!selectedStoryboard()) return; // not ours: project-sidebar's search keeps it
    e.preventDefault();
    e.stopImmediatePropagation();
    focusExport();
  }

  // ---------------------------------------------------------------- actions
  const ACTIONS = [
    [
      "canvas.export.layer",
      {
        label: (a) => `Export the selected storyboard as ${String((a && a.format) || prefs.format).toUpperCase()} ${(a && a.scale) || prefs.scale}x`,
        description: "Export the selected canvas storyboard as an image or PDF into <canvas folder>/exports (or a download). scale 1-3, format png | jpeg | webp | pdf.",
        params: [
          { name: "scale", type: "number", description: "1, 2 or 3 (default: the panel's)" },
          { name: "format", type: "string", enum: IMAGE_FORMATS.map((f) => f.id), description: "default: the panel's" },
        ],
        risk: "caution",
        owner: "canvas-export",
        target: () => (ui.layerBtn && ui.layerBtn.isConnected ? ui.layerBtn : state.sel && state.sel.sbEl) || null,
        run: async (a) => {
          if (!state.enabled) return { ok: false, reason: "canvas-export is off" };
          const r = await exportImage({ scale: a && a.scale, format: a && a.format });
          return { ok: true, ...r };
        },
      },
    ],
    [
      "canvas.export.code",
      {
        label: (a) => `Export the selected storyboard's code (${codeMode(a && a.format)})`,
        description: "The selected canvas storyboard's code: format tailwind | css | react; to file (<canvas folder>/exports), clipboard or return (the text in the result).",
        params: [
          { name: "format", type: "string", enum: CODE_FORMATS.map((f) => f.id) },
          { name: "to", type: "string", enum: ["file", "clipboard", "return"], default: "file" },
        ],
        risk: "caution",
        owner: "canvas-export",
        target: () => (ui.exportBtn && ui.exportBtn.isConnected ? ui.exportBtn : state.sel && state.sel.sbEl) || null,
        run: async (a) => {
          if (!state.enabled) return { ok: false, reason: "canvas-export is off" };
          const to = (a && a.to) || "file";
          if (to === "return") {
            const text = await code(a && a.format, { document: false });
            return { ok: true, format: codeMode(a && a.format), chars: text.length, truncated: text.length > RETURN_MAX, text: text.slice(0, RETURN_MAX) };
          }
          const r = to === "clipboard" ? await copyCode({ format: a && a.format }) : await exportCode({ format: a && a.format });
          return { ok: true, ...r };
        },
      },
    ],
  ];
  let actionsVia = null;
  function registerActions() {
    const reg = window.__RE_TEMPO_ACTIONS__;
    if (reg && typeof reg.register === "function") {
      for (const [id, spec] of ACTIONS) reg.register(id, spec);
      actionsVia = "registry";
      return;
    }
    if (!window.__RE_TEMPO_ACTIONS_PENDING__) window.__RE_TEMPO_ACTIONS_PENDING__ = [];
    const q = window.__RE_TEMPO_ACTIONS_PENDING__;
    if (q && typeof q.push === "function") q.push(...ACTIONS);
    actionsVia = "pending";
  }
  function unregisterActions() {
    const reg = window.__RE_TEMPO_ACTIONS__;
    if (reg && typeof reg.unregister === "function") for (const [id] of ACTIONS) reg.unregister(id);
    const q = window.__RE_TEMPO_ACTIONS_PENDING__;
    if (Array.isArray(q)) for (let i = q.length - 1; i >= 0; i--) if (q[i] && ACTIONS.some(([id]) => id === q[i][0])) q.splice(i, 1);
  }

  // -------------------------------------------------------------------- CSS
  const SELF_SRC = (document.currentScript && document.currentScript.src) || "";
  function ensureCss() {
    if (document.querySelector('link[rel="stylesheet"][href*="canvas-export.css"]') || !SELF_SRC) return;
    document.head.appendChild(h("link", { rel: "stylesheet", href: SELF_SRC.replace(/canvas-export\.js(\?.*)?$/, "canvas-export.css"), "data-rtcx-css": "" }));
  }

  // ------------------------------------------------------------------- boot
  function dispose() {
    clearInterval(state.timer);
    if (state.raf) cancelAnimationFrame(state.raf);
    window.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointerdown", onPointer, true);
    document.removeEventListener("pointerup", schedule, true);
    document.removeEventListener("keyup", schedule, true);
    document.removeEventListener("visibilitychange", schedule);
    unblock();
    closeMenu();
    closePop();
    hideToast();
    dropHidden();
    if (state.chromeOff) {
      try {
        state.chromeOff();
      } catch (_) {}
    }
    if (ui.wrap) ui.wrap.remove();
    ui.wrap = null;
    unregisterActions();
    const css = document.querySelector("link[data-rtcx-css]");
    if (css) css.remove();
    if (window.__RE_TEMPO_CANVAS_EXPORT__ === api) delete window.__RE_TEMPO_CANVAS_EXPORT__;
  }
  const api = {
    version: VERSION,
    state: () => ({
      enabled: state.enabled,
      mode: state.mode,
      mounted: uiMounted(),
      selected: summary(state.sel),
      exportDir: state.sel ? exportDir(state.sel) : null,
      prefs: { ...prefs },
      busy: state.busy,
      captureScale: state.k || null,
      bridges: { capture: !!captureBridge(), fs: !!fsApi(), finder: !!finderApi(), browser: !!(window.__RE_TEMPO_CANVAS_BROWSER__ && window.__RE_TEMPO_CANVAS_BROWSER__.create), chrome: !!(window.__RE_TEMPO_CANVAS_CHROME__ && window.__RE_TEMPO_CANVAS_CHROME__.registerRightSection) },
      actions: actionsVia,
      last: state.last ? { ...state.last } : null,
      lastError: state.lastError,
      counts: { ...state.counts },
    }),
    selected: () => summary(selectedStoryboard()),
    code,
    copy: (o) => copyCode(o),
    exportCode: (o) => exportCode(o),
    exportImage: (o) => exportImage(o),
    importWeb: (url, o) => importWeb(url, o),
    focusExport,
    sync,
    setEnabled: (on) => {
      ls.set(FLAG_KEY, on ? null : "off");
      sync();
      return state.enabled;
    },
    exportDir: () => (state.sel ? exportDir(state.sel) : null),
    dispose,
  };
  window.__RE_TEMPO_CANVAS_EXPORT__ = api;

  ensureCss();
  window.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onPointer, true);
  document.addEventListener("pointerup", schedule, true);
  document.addEventListener("keyup", schedule, true);
  document.addEventListener("visibilitychange", schedule);
  state.timer = setInterval(() => {
    if (!document.hidden) sync();
  }, SYNC_MS);
  registerActions();
  sync();
})();
