/*
 * RE-TEMPO · canvas-browser (user MOD layer)
 * ---------------------------------------------------------------------------
 * A "Browser frame" on the design canvas: a live web page with its own URL
 * bar (back / forward / reload, address field, open in the system browser),
 * placed in canvas coordinates next to the storyboards. It pans and zooms with
 * the canvas, can be moved by its header or bar, resized from its edges and
 * corners, renamed, and is saved per canvas.
 *
 * Copied from pen.dev (Pencil), whose .pen schema has a `browser` node ("Live
 * web page shown on the canvas": url, zoom, scroll, name; skill docs read on
 * 2026-10-18 through the pencil MCP read_skill tool):
 *   1. A browser is a canvas node like any frame: it lives in world units,
 *      moves and scales with pan/zoom, and has a name shown above it.
 *   2. An empty url shows a URL prompt; typing an address loads the page.
 *   3. The page is fully interactive (scroll, click, sign in) and all browser
 *      nodes share one browser session (here: the app's own Browser tab one).
 *   4. Only the url and the geometry are stored; the page reloads from its
 *      url when the canvas is reopened (no snapshot).
 *   5. Selecting, moving and resizing behave like the other canvas nodes.
 * What pen.dev does not document (toolbar entry, chrome, interaction mode)
 * follows the Tempo canvas instead: a tool in the bottom toolbar, the app's
 * storyboard selection outline and handles, and Figma-style "click a
 * selected frame to interact".
 *
 * What the app does (assets/index-D2Ui1vc0.js, RE-TEMPO build of 2026-10-14,
 * read on 2026-10-18):
 *   - [data-canvas-root] holds the world layer .tds-canvas-shimmer-origin,
 *     whose inline style is `translate3d(x, y, 0) scale(zoom)` (origin 0 0),
 *     and sets `--canvas-unzoom` (1 / zoom) on itself. The canvas handle
 *     (forwardRef imperative handle, found through the React fiber) exposes
 *     getView(), getSelection(), clearSelection() and getWorldOverlayHost(),
 *     which returns that world layer. The frames are mounted inside it, so
 *     they get the exact same transform in the same frame: no drift by
 *     construction.
 *   - Storyboard selection: border `calc(var(--canvas-unzoom) * 2px) solid
 *     rgba(0,145,255,0.95)`, 4 px edge handles and 14 px corner hit areas
 *     with a 10 px white square; the resize label is a blue monospace pill
 *     under the frame. Storyboard headers stay at screen size with
 *     `scale(var(--canvas-unzoom)) translateY(-100%)`. All copied here.
 *   - Bottom toolbar: [role=toolbar][aria-label="Design tools"], 28 px
 *     buttons with aria-pressed. The Browser tool is appended to it.
 *   - The Browser tab's <webview>: partition "persist:tempo-browser",
 *     preload = file URL of window.browserBridge.webviewPreloadPath,
 *     useragent = navigator.userAgent without the Electron/ and Tempo/
 *     tokens, allowpopups. The frames use the same attributes, so cookies and
 *     logins are shared with that tab. The address field normalizes input the
 *     same way (V0i): http(s)/file kept, localhost -> http, dotted -> https,
 *     anything else -> Google search.
 *   - "+" menu (new-tab-panel): "New Browser" item. This mod no longer adds
 *     a "Browser on Canvas" item after it (removed on 2026-10-18 at the
 *     user's request; a stale one from an older injection is swept).
 *
 * Interaction: click selects (and clears the storyboard selection); drag the
 * header, the bar or the page (while not interacting) to move; drag an edge or
 * corner to resize (Shift on a corner keeps the ratio); click a selected
 * frame's page (or double-click) to interact with it, click outside or press
 * Escape to stop; double-click the title to rename (empty = page title);
 * Delete/Backspace removes it with a 5 s "Undo" toast; arrows nudge (Shift x10).
 * Create: the toolbar's Browser tool (or W, only for the design route's
 * active canvas: its design toolbar on screen and, read from the app's
 * workspace store, activeNavRoute "design"): click to place 1280x840, or drag
 * to draw; create() (the New page, ui-drive) places one in the middle of the
 * view. Arming it disarms canvas-shader's draw tool (one tool at a time).
 *
 * Storage: the canvas file itself, through feature/canvas-nodes.js (loaded
 * from this script's folder; see its header for the evidence). Every frame is
 * a node of the reTempoCanvasNodes block at the end of
 * <canvasPath>/index.canvas.tsx: {id, type: "browser", x, y, w, h, url, title,
 * titled?, z?}, so the agent and git see it and an edit of the file moves the
 * frames. canvasPath and workspacePath are props read from the canvas root's
 * fiber ancestors. Until canvas-nodes answers no canvas is mounted; without
 * it (or without the app's file bridge, e.g. a plain test page) the frames
 * stay in localStorage "rtd.canvasBrowser.v1:<canvasPath>" = {v, frames: [{id,
 * x, y, w, h, url, title, titled, z}]}, which canvas-nodes migrates into the
 * file once. Flag: localStorage "rtd.canvasBrowser" = "off" disables
 * everything (checked live).
 * Introspection: window.__RE_TEMPO_CANVAS_BROWSER__ (state(), frames(), create(),
 * remove(), select(), navigate(), undo(), arm(), disarm(), sync(), keyOf(),
 * stored(), route(), dispose()). The 400 ms sync and the DOM observer skip a
 * hidden tab (a catch-up sync runs when it shows again); dispose() clears
 * them, the listeners and every frame.
 * Without <webview> support (a plain browser test page) an <iframe> is used.
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (window.__RE_TEMPO_CANVAS_BROWSER__) return; // double injection
  // Where canvas-nodes.js is: next to this script (./mod/ in the app).
  const SELF_SRC = (document.currentScript && document.currentScript.src) || "";

  // ------------------------------------------------------------------ config
  const FLAG_KEY = "rtd.canvasBrowser";
  const STORE_PREFIX = "rtd.canvasBrowser.v1:";
  const CANVAS_ROOT = "[data-canvas-root]";
  const WORLD_LAYER = ".tds-canvas-shimmer-origin";
  const TOOLBAR = '[role="toolbar"][aria-label="Design tools"]';
  const PARTITION = "persist:tempo-browser";
  const NODES_FILE = "canvas-nodes.js";
  const NODES_WAIT_MS = 4000; // then mount with localStorage
  const NODE_TYPE = "browser";
  const DEFAULT_W = 1280;
  const DEFAULT_H = 840;
  const MIN_W = 320;
  const MIN_H = 200;
  const DRAG_SLOP = 3; // screen px before a press becomes a drag
  const UNDO_MS = 5000;
  const SYNC_MS = 400;
  const QUICK_MS = 80;
  const MAX_FIBER_DEPTH = 600;
  const TOOL_KEY = "w";
  const TOOLTIP_DELAY = 400;
  // The app's toolbar button classes (qon in the bundle).
  const BTN_BASE = "flex size-7 items-center justify-center rounded-md transition-colors";
  const BTN_IDLE = "text-icons-primary hover:bg-surface-container-highest";
  const BTN_ON =
    "button-accent-lavender bg-accent-subtle text-accent [[data-theme=light]_&]:bg-surface-lavender [[data-theme=light]_&]:text-text-lavender";

  const state = {
    enabled: true,
    mounts: new Map(), // canvas root -> mount
    selected: null, // frame
    active: null, // frame being interacted with
    tool: null, // { m, overlay, preview }
    lastRoot: null,
    toast: null,
    tooltip: null,
    engine: null, // "webview" | "iframe"
    lastSync: 0,
    counts: { created: 0, removed: 0, restored: 0 },
  };
  let mountSeq = 0;

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
    del(k) {
      try {
        localStorage.removeItem(k);
      } catch (_) {}
    },
  };
  const flagOn = () => ls.get(FLAG_KEY) !== "off";
  const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const uid = () => "bf_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const isShown = (el) => {
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === "function" && !el.checkVisibility()) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const isEditable = (el) =>
    !!el &&
    el.nodeType === 1 &&
    (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest('[contenteditable=""], [contenteditable="true"], .monaco-editor'));

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
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    forward: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    reload: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    stop: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    spinner: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  };
  function icon(name, cls, stroke) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", String(stroke || 2));
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    if (cls) s.setAttribute("class", cls);
    s.innerHTML = ICONS[name];
    return s;
  }

  // ----------------------------------------------------------------- urls
  // Same rules as the app's address bar (V0i).
  function normalizeUrl(raw) {
    const t = String(raw || "").trim();
    if (!t) return null;
    if (/^https?:\/\//i.test(t) || /^file:\/\//i.test(t)) return t;
    if (/^localhost(?::\d+)?(?:[/?#]|$)/i.test(t)) return "http://" + t;
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
  // "webview" in the app (browserBridge is exposed by its preload before any
  // page script). Elsewhere Electron defines <webview> only after the first
  // scripts ran, so "iframe" is only decided once the page has loaded; until
  // then guests wait (see ensureGuest / waitEngine).
  function engine() {
    if (state.engine) return state.engine;
    let wv = false;
    try {
      wv = !!(window.browserBridge && window.browserBridge.webviewPreloadPath) || !!(window.customElements && window.customElements.get("webview"));
    } catch (_) {}
    if (wv) return (state.engine = "webview");
    if (document.readyState === "complete") return (state.engine = "iframe");
    return null;
  }
  let engineWait = false;
  function waitEngine() {
    if (engineWait) return;
    engineWait = true;
    const done = () => {
      if (!engine()) state.engine = "iframe";
      for (const m of state.mounts.values())
        for (const f of m.frames.values())
          if (!f.guest && f.pendingUrl) {
            const u = f.pendingUrl;
            f.pendingUrl = null;
            ensureGuest(f, u);
          }
    };
    try {
      if (window.customElements) window.customElements.whenDefined("webview").then(done, () => {});
    } catch (_) {}
    window.addEventListener("load", () => setTimeout(done, 0), { once: true });
  }

  // ------------------------------------------------------------ fiber (read)
  const fiberOf = (node) => {
    if (!node) return null;
    const k = Object.keys(node).find((x) => x.startsWith("__reactFiber$"));
    return k ? node[k] : null;
  };
  const handleRefs = new WeakMap();
  const isHandle = (v) => !!v && typeof v === "object" && typeof v.getView === "function";
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
  // The canvas this root shows: the first canvasPath prop above it.
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
  function worldHostOf(root, handle) {
    try {
      const w = handle && typeof handle.getWorldOverlayHost === "function" ? handle.getWorldOverlayHost() : null;
      if (w && w.nodeType === 1 && root.contains(w)) return w;
    } catch (_) {}
    return root.querySelector(":scope > " + WORLD_LAYER) || root.querySelector(WORLD_LAYER);
  }

  // ------------------------------------------------------------------- view
  const TRANSFORM_RE = /translate3d\(\s*(-?[\d.e+-]+)px\s*,\s*(-?[\d.e+-]+)px\s*,\s*0(?:px)?\s*\)\s*scale\(\s*([\d.e+-]+)\s*\)/i;
  const validView = (v) => !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.zoom) && v.zoom > 0;
  function viewOf(m) {
    const hd = m.handle || findHandle(m.root);
    if (hd) {
      try {
        const v = hd.getView();
        if (validView(v)) return { x: v.x, y: v.y, zoom: v.zoom };
      } catch (_) {}
    }
    const t = TRANSFORM_RE.exec((m.host && m.host.style.transform) || "");
    if (t) {
      const v = { x: +t[1], y: +t[2], zoom: +t[3] };
      if (validView(v)) return v;
    }
    return { x: 0, y: 0, zoom: 1 };
  }
  function toWorld(m, cx, cy) {
    const r = m.root.getBoundingClientRect();
    const v = viewOf(m);
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom, zoom: v.zoom };
  }

  // ---------------------------------------------------------------- storage
  function normalizeData(d) {
    const o = d && typeof d === "object" ? d : {};
    return {
      id: typeof o.id === "string" && o.id ? o.id : uid(),
      x: Math.round(num(o.x, 0)),
      y: Math.round(num(o.y, 0)),
      w: Math.max(MIN_W, Math.round(num(o.w, DEFAULT_W))),
      h: Math.max(MIN_H, Math.round(num(o.h, DEFAULT_H))),
      url: loadable(o.url) ? o.url : "",
      title: typeof o.title === "string" ? o.title.slice(0, 200) : "",
      titled: o.titled === true,
      z: Math.max(0, Math.round(num(o.z, 0))),
    };
  }
  function load(key) {
    try {
      const v = JSON.parse(ls.get(STORE_PREFIX + key) || "null");
      return v && Array.isArray(v.frames) ? v.frames.map(normalizeData) : [];
    } catch (_) {
      return [];
    }
  }
  function writeStore(key, frames) {
    if (frames.length) ls.set(STORE_PREFIX + key, JSON.stringify({ v: 1, t: Date.now(), frames }));
    else ls.del(STORE_PREFIX + key);
  }
  // ------------------------------------------- canvas file (canvas-nodes.js)
  const nodesApi = () => {
    const n = window.__RE_TEMPO_CANVAS_NODES__;
    return n && typeof n.attach === "function" && n.available() ? n : null;
  };
  const nodesLoad = { failed: false, timer: null, typed: false };
  // Mounting waits for canvas-nodes (true once it answered or gave up).
  const nodesSettled = () => !!window.__RE_TEMPO_CANVAS_NODES__ || nodesLoad.failed;
  function loadNodes() {
    if (window.__RE_TEMPO_CANVAS_NODES__) return;
    const give = () => {
      if (!window.__RE_TEMPO_CANVAS_NODES__) nodesLoad.failed = true;
      scheduleQuick();
    };
    let s = document.querySelector("script[data-rt-canvas-nodes]");
    if (!s) {
      let src = "";
      try {
        src = new URL(NODES_FILE, SELF_SRC || location.href).href;
      } catch (_) {}
      if (!src) return give();
      s = document.createElement("script");
      s.src = src;
      s.setAttribute("data-rt-canvas-nodes", "");
      (document.head || document.documentElement).appendChild(s);
    }
    s.addEventListener("load", give);
    s.addEventListener("error", give);
    nodesLoad.timer = setTimeout(give, NODES_WAIT_MS);
  }
  function toNode(d) {
    const n = { id: d.id, type: NODE_TYPE, x: d.x, y: d.y, w: d.w, h: d.h, url: d.url || "", title: d.title || "" };
    if (n.title) n.titled = d.titled === true;
    if (d.z) n.z = d.z;
    return n;
  }
  function fromNode(n) {
    return normalizeData({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, url: n.url, title: n.title, titled: typeof n.titled === "boolean" ? n.titled : !!n.title, z: n.z });
  }
  function registerNodeType(N) {
    if (nodesLoad.typed || !N || typeof N.registerType !== "function") return;
    nodesLoad.typed = true;
    N.registerType(NODE_TYPE, { keys: ["x", "y", "w", "h", "url", "title", "titled", "z"], fromLegacy: (d) => toNode(normalizeData(d)) });
  }
  function save(m) {
    clearTimeout(m.saveTimer);
    m.saveTimer = null;
    const frames = Array.from(m.frames.values()).map((f) => ({ ...f.data }));
    // The canvas file: canvas-nodes hands the change to the other panes.
    if (m.nodes) {
      m.nodes.set(frames.map(toNode));
      return;
    }
    writeStore(m.key, frames);
    // Same canvas shown in another pane: bring it in line.
    for (const o of state.mounts.values()) if (o !== m && o.key === m.key) reconcile(o, load(o.key));
  }
  function scheduleSave(m, ms) {
    clearTimeout(m.saveTimer);
    m.saveTimer = setTimeout(() => save(m), ms == null ? 250 : ms);
  }

  // ----------------------------------------------------------------- mounts
  function mount(root, host, key, handle) {
    const layer = h("div", { class: "rtbf-layer", "data-rtbf-layer": "" });
    host.appendChild(layer);
    const m = { id: ++mountSeq, root, host, key, handle, layer, frames: new Map(), saveTimer: null, nodes: null, ws: null };
    state.mounts.set(root, m);
    const N = nodesApi();
    const ref = N && typeof N.refOf === "function" ? N.refOf(root) : null;
    if (N && ref && ref.workspacePath) {
      registerNodeType(N);
      m.ws = ref.workspacePath;
      m.nodes = N.attach({
        workspacePath: ref.workspacePath,
        canvasPath: key,
        type: NODE_TYPE,
        token: m,
        onNodes: (list) => {
          if (state.mounts.get(m.root) === m) reconcile(m, list.map(fromNode));
        },
      });
    }
    if (!m.nodes) reconcile(m, load(key));
    return m;
  }
  function unmount(m) {
    if (m.saveTimer) save(m);
    if (m.nodes) m.nodes.detach();
    if (state.tool && state.tool.m === m) disarm();
    if (state.selected && state.selected.m === m) deselect();
    for (const f of m.frames.values()) destroyFrame(f, true);
    m.layer.remove();
    state.mounts.delete(m.root);
  }
  function reconcile(m, list) {
    const ids = new Set();
    for (const d of list) {
      ids.add(d.id);
      const f = m.frames.get(d.id);
      if (!f) {
        buildFrame(m, d);
        continue;
      }
      const urlChanged = d.url && d.url !== f.data.url;
      Object.assign(f.data, { x: d.x, y: d.y, w: d.w, h: d.h, title: d.title, titled: d.titled, z: d.z });
      applyGeom(f);
      applyTitle(f);
      if (urlChanged) {
        f.data.url = d.url;
        loadInto(f, d.url);
      }
    }
    for (const [id, f] of m.frames) if (!ids.has(id)) destroyFrame(f);
  }
  const mountsOf = (key) => Array.from(state.mounts.values()).filter((m) => m.key === key);
  const visibleMount = (key) => {
    const list = key ? mountsOf(key) : Array.from(state.mounts.values());
    return list.find((m) => m.root === state.lastRoot && isShown(m.root)) || list.find((m) => isShown(m.root)) || null;
  };

  // ----------------------------------------------------------------- frames
  function buildFrame(m, raw) {
    const data = normalizeData(raw);
    const f = { m, data, el: null, els: {}, guest: null, kind: null, nav: { ready: false, loading: false, back: false, fwd: false }, hist: null, pageTitle: "", loadedOnce: false };
    const E = f.els;

    E.favicon = h("img", { class: "rtbf-favicon", alt: "", draggable: "false", hidden: true });
    E.favicon.addEventListener("error", () => (E.favicon.hidden = true, E.globe.removeAttribute("hidden")));
    E.globe = icon("globe", "rtbf-head-globe", 1.5);
    E.title = h("span", { class: "rtbf-head-title" });
    E.titleInput = h("input", { class: "rtbf-head-input", type: "text", spellcheck: "false", "aria-label": "Frame name", maxlength: "200" });
    E.head = h("div", { class: "rtbf-head", "data-rtbf-head": "" }, h("div", { class: "rtbf-head-row" }, E.favicon, E.globe, E.title, E.titleInput));

    const btn = (name, label, cls) => {
      const b = h("button", { class: "rtbf-btn" + (cls ? " " + cls : ""), type: "button", "aria-label": label, title: label });
      b.append(icon(name, "rtbf-ic"));
      return b;
    };
    E.back = btn("back", "Back");
    E.fwd = btn("forward", "Forward");
    E.reload = btn("reload", "Reload");
    E.url = h("input", {
      class: "rtbf-url",
      type: "text",
      placeholder: "Enter a URL",
      "aria-label": "Address",
      autocapitalize: "none",
      autocorrect: "off",
      spellcheck: "false",
      autocomplete: "off",
      inputmode: "url",
    });
    E.form = h("form", { class: "rtbf-addr" }, E.url);
    E.ext = btn("external", "Open in browser", "rtbf-btn-ext");
    E.progress = h("div", { class: "rtbf-progress", "aria-hidden": "true" });
    E.bar = h("div", { class: "rtbf-bar", "data-rtbf-bar": "" }, E.back, E.fwd, E.reload, E.form, E.ext, E.progress);

    E.errDesc = h("span", { class: "rtbf-error-desc" });
    E.errUrl = h("span", { class: "rtbf-error-url" });
    E.error = h("div", { class: "rtbf-error", hidden: true }, E.errDesc, " ", E.errUrl);

    E.empty = h(
      "div",
      { class: "rtbf-empty" },
      h(
        "div",
        { class: "rtbf-empty-in" },
        h("div", { class: "rtbf-empty-icon" }, icon("globe", "rtbf-ic-lg", 1.5)),
        h("div", { class: "rtbf-empty-title", text: "Start browsing" }),
        h("div", { class: "rtbf-empty-sub", text: "Enter a URL to open a page" })
      )
    );
    E.loading = h("div", { class: "rtbf-loading", "aria-hidden": "true" }, h("span", { class: "rtbf-loading-in" }, icon("spinner", "rtbf-spin"), "Loading page..."));
    E.shield = h("div", { class: "rtbf-shield", "data-rtbf-shield": "" });
    E.hint = h("div", { class: "rtbf-hint", "aria-hidden": "true", text: "Click to interact" });
    E.view = h("div", { class: "rtbf-view" }, E.empty, E.loading, E.shield, E.hint);
    E.win = h("div", { class: "rtbf-win" }, E.bar, E.error, E.view);

    E.outline = h("div", { class: "rtbf-outline", "aria-hidden": "true" });
    for (const k of ["n", "s", "w", "e"]) E.outline.append(h("div", { class: "rtbf-edge rtbf-edge-" + k, "data-rtbf-handle": k }));
    for (const k of ["nw", "ne", "sw", "se"]) E.outline.append(h("div", { class: "rtbf-corner rtbf-corner-" + k, "data-rtbf-handle": k }, h("div", { class: "rtbf-corner-sq" })));
    E.size = h("div", { class: "rtbf-size", "aria-hidden": "true" });

    f.el = h("div", { class: "rtbf-frame", "data-rtbf-id": data.id, role: "group", "aria-label": "Browser frame" }, E.head, E.win, E.outline, E.size);
    wireFrame(f);
    m.layer.appendChild(f.el);
    m.frames.set(data.id, f);
    applyGeom(f);
    applyTitle(f);
    E.url.value = data.url;
    if (data.url) loadInto(f, data.url);
    updateNav(f);
    return f;
  }

  function destroyFrame(f, keepSelection) {
    if (!keepSelection && state.selected === f) deselect();
    if (state.active === f) state.active = null;
    f.el.remove();
    f.m.frames.delete(f.data.id);
  }

  function applyGeom(f) {
    const d = f.data;
    const s = f.el.style;
    s.transform = `translate(${d.x}px, ${d.y}px)`;
    s.width = d.w + "px";
    s.height = d.h + "px";
    s.zIndex = String(d.z || 0);
  }
  function applyTitle(f) {
    const d = f.data;
    const text = (d.titled && d.title) || d.title || f.pageTitle || hostOf(d.url) || "Browser";
    if (f.els.title.textContent !== text) f.els.title.textContent = text;
    f.els.head.title = d.url ? `${text}\n${d.url}` : text;
    f.el.setAttribute("aria-label", "Browser frame: " + text);
  }

  // ---------------------------------------------------------------- guests
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
      w.setAttribute("data-testid", "canvas-browser-webview");
      w.setAttribute("class", "rtbf-guest");
      w.setAttribute("src", url);
      return w;
    }
    const i = document.createElement("iframe");
    i.className = "rtbf-guest";
    i.setAttribute("data-testid", "canvas-browser-iframe");
    i.setAttribute("allow", "clipboard-read; clipboard-write; fullscreen");
    i.src = url;
    return i;
  }

  function ensureGuest(f, url) {
    if (f.guest) return false;
    if (!engine()) {
      f.pendingUrl = url;
      f.el.setAttribute("data-has-page", "");
      setLoading(f, true);
      waitEngine();
      return true;
    }
    const g = makeGuest(url);
    f.guest = g;
    f.kind = g.tagName === "WEBVIEW" ? "webview" : "iframe";
    f.el.setAttribute("data-has-page", "");
    setLoading(f, true);
    if (f.kind === "webview") {
      g.addEventListener("dom-ready", () => {
        f.nav.ready = true;
        updateNav(f);
      });
      g.addEventListener("did-start-loading", () => setLoading(f, true));
      g.addEventListener("did-stop-loading", () => {
        setLoading(f, false);
        markLoaded(f);
        updateNav(f);
      });
      g.addEventListener("did-navigate", (e) => onUrl(f, e.url));
      g.addEventListener("did-navigate-in-page", (e) => {
        if (e.isMainFrame !== false) onUrl(f, e.url);
      });
      g.addEventListener("page-title-updated", (e) => onPageTitle(f, e.title));
      g.addEventListener("page-favicon-updated", (e) => onFavicon(f, e.favicons && e.favicons[0]));
      g.addEventListener("did-fail-load", (e) => {
        if (e.isMainFrame === false || e.errorCode === -3) return;
        showError(f, e.errorDescription || "The page could not load", e.validatedURL || f.data.url);
        setLoading(f, false);
        markLoaded(f);
      });
    } else {
      f.hist = { list: [url], idx: 0, skip: false };
      g.addEventListener("load", () => onIframeLoad(f));
    }
    f.els.view.insertBefore(g, f.els.view.firstChild);
    return true;
  }

  function loadInto(f, url) {
    if (!loadable(url)) return;
    clearError(f);
    f.data.url = url;
    if (document.activeElement !== f.els.url) f.els.url.value = url;
    applyTitle(f);
    if (ensureGuest(f, url)) return;
    const g = f.guest;
    if (f.kind === "webview") {
      if (f.nav.ready && typeof g.loadURL === "function") {
        try {
          const p = g.loadURL(url);
          if (p && typeof p.catch === "function")
            p.catch((err) => {
              const msg = String((err && err.message) || err || "");
              if (!/ERR_ABORTED|\(-3\)/.test(msg)) showError(f, msg || "The page could not load", url);
            });
        } catch (_) {
          g.setAttribute("src", url);
        }
      } else g.setAttribute("src", url);
    } else {
      const hs = f.hist;
      hs.list = hs.list.slice(0, hs.idx + 1);
      hs.list.push(url);
      hs.idx = hs.list.length - 1;
      hs.skip = true;
      setLoading(f, true);
      g.src = url;
    }
    updateNav(f);
  }

  function onIframeLoad(f) {
    const g = f.guest;
    let href = null;
    let title = null;
    try {
      href = g.contentWindow.location.href;
      title = g.contentDocument && g.contentDocument.title;
      g.contentWindow.addEventListener("pagehide", () => setLoading(f, true), { once: true });
    } catch (_) {}
    setLoading(f, false);
    markLoaded(f);
    const hs = f.hist;
    if (href && href !== "about:blank") {
      if (hs.skip) {
        hs.skip = false;
        hs.list[hs.idx] = href;
      } else if (href !== hs.list[hs.idx]) {
        hs.list = hs.list.slice(0, hs.idx + 1);
        hs.list.push(href);
        hs.idx = hs.list.length - 1;
      }
      onUrl(f, href);
    }
    if (title) onPageTitle(f, title);
    updateNav(f);
  }

  function markLoaded(f) {
    if (f.loadedOnce) return;
    f.loadedOnce = true;
    f.el.setAttribute("data-loaded", "");
  }
  function onUrl(f, url) {
    if (!loadable(url)) return;
    if (url !== f.data.url) {
      f.data.url = url;
      scheduleSave(f.m);
    }
    if (document.activeElement !== f.els.url) f.els.url.value = url;
    applyTitle(f);
    updateNav(f);
  }
  function onPageTitle(f, t) {
    const title = String(t || "").trim().slice(0, 200);
    if (!title) return;
    f.pageTitle = title;
    if (!f.data.titled && f.data.title !== title) {
      f.data.title = title;
      scheduleSave(f.m);
    }
    applyTitle(f);
  }
  function onFavicon(f, src) {
    if (!src || !/^(https?|data):/i.test(src)) return;
    f.els.favicon.src = src;
    f.els.favicon.hidden = false;
    f.els.globe.setAttribute("hidden", "");
  }
  function setLoading(f, on) {
    if (f.nav.loading === on) return;
    f.nav.loading = on;
    f.el.toggleAttribute("data-loading", on);
    const b = f.els.reload;
    b.replaceChildren(icon(on ? "stop" : "reload", "rtbf-ic"));
    b.setAttribute("aria-label", on ? "Stop" : "Reload");
    b.title = on ? "Stop" : "Reload";
  }
  function showError(f, desc, url) {
    f.els.errDesc.textContent = desc;
    f.els.errUrl.textContent = url || "";
    f.els.error.hidden = false;
  }
  function clearError(f) {
    f.els.error.hidden = true;
  }
  function updateNav(f) {
    let back = false;
    let fwd = false;
    const g = f.guest;
    if (g && f.kind === "webview" && f.nav.ready) {
      try {
        back = !!g.canGoBack();
        fwd = !!g.canGoForward();
      } catch (_) {}
    } else if (g && f.hist) {
      back = f.hist.idx > 0;
      fwd = f.hist.idx < f.hist.list.length - 1;
    }
    f.nav.back = back;
    f.nav.fwd = fwd;
    f.els.back.disabled = !back;
    f.els.fwd.disabled = !fwd;
    f.els.reload.disabled = !g;
    f.els.ext.disabled = !/^https?:/i.test(f.data.url);
  }
  function goHistory(f, delta) {
    const g = f.guest;
    if (!g) return;
    clearError(f);
    if (f.kind === "webview") {
      try {
        delta < 0 ? g.goBack() : g.goForward();
      } catch (_) {}
      return;
    }
    const hs = f.hist;
    const i = hs.idx + delta;
    if (i < 0 || i >= hs.list.length) return;
    hs.idx = i;
    hs.skip = true;
    setLoading(f, true);
    g.src = hs.list[i];
    updateNav(f);
  }
  function reloadOrStop(f) {
    const g = f.guest;
    if (!g) return;
    if (f.kind === "webview") {
      try {
        if (f.nav.loading) g.stop();
        else {
          clearError(f);
          g.reload();
        }
      } catch (_) {}
      return;
    }
    if (f.nav.loading) {
      try {
        g.contentWindow.stop();
      } catch (_) {}
      setLoading(f, false);
      return;
    }
    clearError(f);
    setLoading(f, true);
    try {
      g.contentWindow.location.reload();
    } catch (_) {
      f.hist.skip = true;
      g.src = f.hist.list[f.hist.idx] || f.data.url;
    }
  }
  function openExternal(f) {
    const u = f.data.url;
    if (!/^https?:/i.test(u)) return;
    const api = window.electronAPI;
    if (api && typeof api.openExternal === "function") {
      try {
        const p = api.openExternal(u);
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch (_) {}
    } else window.open(u, "_blank", "noopener,noreferrer");
  }

  // --------------------------------------------------------- frame wiring
  function wireFrame(f) {
    const E = f.els;
    const el = f.el;

    el.addEventListener("pointerdown", (e) => {
      if (e.button === 1 || state.spaceDown) return; // middle button / space: let the canvas pan
      e.stopPropagation();
      if (e.button !== 0) {
        select(f);
        return;
      }
      const t = e.target;
      const wasSelected = state.selected === f;
      select(f);
      const hd = t.closest("[data-rtbf-handle]");
      if (hd) {
        e.preventDefault();
        startDrag(f, e, "resize:" + hd.getAttribute("data-rtbf-handle"));
        return;
      }
      if (t.closest("button, input, .rtbf-error")) return; // controls keep their own behavior
      // No preventDefault: the press focuses the canvas root (tabIndex 0), as a
      // press on the canvas does, which also blurs any field that had focus.
      const onShield = !!t.closest("[data-rtbf-shield]");
      startDrag(f, e, "move", {
        onClick: () => {
          if (onShield && wasSelected) activate(f);
        },
      });
    });
    for (const type of ["mousedown", "click", "auxclick", "contextmenu", "keyup", "keypress", "paste", "copy", "cut"]) el.addEventListener(type, (e) => e.stopPropagation());
    el.addEventListener("keydown", (e) => {
      // Keys typed in the frame's own fields never reach the canvas.
      if (isEditable(e.target)) e.stopPropagation();
    });
    el.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      if (e.target.closest(".rtbf-head-title, .rtbf-head-row")) startTitleEdit(f);
      else if (e.target.closest("[data-rtbf-shield]")) activate(f);
    });

    E.back.addEventListener("click", () => goHistory(f, -1));
    E.fwd.addEventListener("click", () => goHistory(f, 1));
    E.reload.addEventListener("click", () => reloadOrStop(f));
    E.ext.addEventListener("click", () => openExternal(f));
    E.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const u = normalizeUrl(E.url.value);
      if (!u) return;
      loadInto(f, u);
      save(f.m);
      E.url.blur();
    });
    E.url.addEventListener("focus", () => {
      select(f);
      E.url.select();
    });
    E.url.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        E.url.value = f.data.url;
        E.url.blur();
      }
    });

    E.titleInput.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "Enter") {
        e.preventDefault();
        endTitleEdit(f, true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        endTitleEdit(f, false);
      }
    });
    E.titleInput.addEventListener("blur", () => endTitleEdit(f, true));
  }

  function startTitleEdit(f) {
    if (f.el.hasAttribute("data-editing")) return;
    select(f);
    const inp = f.els.titleInput;
    inp.value = f.els.title.textContent || "";
    f.el.setAttribute("data-editing", "");
    inp.focus({ preventScroll: true });
    inp.select();
  }
  function endTitleEdit(f, commit) {
    if (!f.el.hasAttribute("data-editing")) return;
    f.el.removeAttribute("data-editing");
    if (commit) {
      const v = f.els.titleInput.value.trim().slice(0, 200);
      if (!v) {
        // Empty name: back to the page's own title.
        f.data.titled = false;
        f.data.title = f.pageTitle || "";
      } else if (v !== f.els.title.textContent) {
        f.data.title = v;
        f.data.titled = true;
      }
      applyTitle(f);
      save(f.m);
    }
    if (document.activeElement === f.els.titleInput) f.els.titleInput.blur();
  }

  // --------------------------------------------------------------- dragging
  function startDrag(f, e, kind, opts) {
    const m = f.m;
    const pid = e.pointerId;
    const sx = e.clientX;
    const sy = e.clientY;
    const start = toWorld(m, sx, sy);
    const o = { x: f.data.x, y: f.data.y, w: f.data.w, h: f.data.h };
    const handle = kind.startsWith("resize:") ? kind.slice(7) : null;
    let moved = false;
    // Listeners on window (capture) and pointer capture only once the press
    // becomes a drag: a plain click keeps its real target, so click/dblclick
    // still land on the title or the page shield.
    const capture = () => {
      try {
        f.el.setPointerCapture(pid);
      } catch (_) {}
      document.documentElement.setAttribute("data-rtbf-dragging", "");
    };
    if (handle) {
      f.el.setAttribute("data-dragging", "resize");
      showSize(f);
      capture();
    }
    const move = (ev) => {
      if (ev.pointerId !== pid) return;
      ev.stopPropagation();
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_SLOP) return;
      if (!moved) {
        moved = true;
        if (!handle) {
          f.el.setAttribute("data-dragging", "move");
          capture();
        }
        if (state.active === f) deactivate(f);
      }
      const p = toWorld(m, ev.clientX, ev.clientY);
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      if (!handle) {
        f.data.x = Math.round(o.x + dx);
        f.data.y = Math.round(o.y + dy);
      } else {
        Object.assign(f.data, resizeRect(o, handle, dx, dy, ev.shiftKey));
        showSize(f);
      }
      applyGeom(f);
    };
    let done = false;
    const end = (ev) => {
      if (done || (ev && ev.pointerId !== pid)) return;
      done = true;
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
      f.el.removeEventListener("lostpointercapture", end);
      try {
        if (f.el.hasPointerCapture(pid)) f.el.releasePointerCapture(pid);
      } catch (_) {}
      document.documentElement.removeAttribute("data-rtbf-dragging");
      f.el.removeAttribute("data-dragging");
      hideSize(f);
      if (moved && ev) ev.stopPropagation();
      if (moved || handle) save(m);
      else if (opts && opts.onClick && ev && ev.type === "pointerup") opts.onClick();
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    f.el.addEventListener("lostpointercapture", end);
  }
  function resizeRect(o, hd, dx, dy, keepRatio) {
    let w = o.w;
    let hh = o.h;
    if (hd.includes("e")) w = o.w + dx;
    if (hd.includes("w")) w = o.w - dx;
    if (hd.includes("s")) hh = o.h + dy;
    if (hd.includes("n")) hh = o.h - dy;
    if (keepRatio && hd.length === 2) {
      const ar = o.w / o.h;
      if (w / hh > ar) hh = w / ar;
      else w = hh * ar;
    }
    w = Math.max(MIN_W, Math.round(w));
    hh = Math.max(MIN_H, Math.round(hh));
    return {
      x: hd.includes("w") ? Math.round(o.x + o.w - w) : o.x,
      y: hd.includes("n") ? Math.round(o.y + o.h - hh) : o.y,
      w,
      h: hh,
    };
  }
  function showSize(f) {
    f.els.size.textContent = `${f.data.w} × ${f.data.h}`;
    f.el.setAttribute("data-sizing", "");
  }
  function hideSize(f) {
    f.el.removeAttribute("data-sizing");
  }

  // -------------------------------------------------------------- selection
  // One selection on the canvas: a frame press always clears the storyboards'.
  function clearAppSelection(m) {
    try {
      const hd = m.handle || findHandle(m.root);
      if (hd && typeof hd.getSelection === "function" && hd.getSelection().length && typeof hd.clearSelection === "function") hd.clearSelection();
    } catch (_) {}
  }
  function select(f) {
    clearAppSelection(f.m);
    if (state.selected === f) return;
    deselect();
    state.selected = f;
    state.lastRoot = f.m.root;
    f.el.setAttribute("data-selected", "");
    let top = 0;
    for (const o of f.m.frames.values()) if (o !== f) top = Math.max(top, o.data.z || 0);
    if ((f.data.z || 0) <= top && f.m.frames.size > 1) {
      f.data.z = top + 1;
      applyGeom(f);
      scheduleSave(f.m);
    }
  }
  function deselect() {
    const f = state.selected;
    if (!f) return;
    deactivate(f);
    endTitleEdit(f, true);
    f.el.removeAttribute("data-selected");
    state.selected = null;
  }
  function activate(f) {
    if (!f.guest || state.active === f) return;
    select(f);
    state.active = f;
    f.el.setAttribute("data-active", "");
    try {
      f.guest.focus();
    } catch (_) {}
  }
  function deactivate(f) {
    if (!f || state.active !== f) return;
    state.active = null;
    f.el.removeAttribute("data-active");
    try {
      if (document.activeElement === f.guest) f.guest.blur();
    } catch (_) {}
  }

  // ------------------------------------------------------- create / remove
  function createIn(m, opts) {
    const o = opts || {};
    let x = o.x;
    let y = o.y;
    const w = Math.max(MIN_W, Math.round(num(o.w, DEFAULT_W)));
    const hh = Math.max(MIN_H, Math.round(num(o.h, DEFAULT_H)));
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      const r = m.root.getBoundingClientRect();
      const c = toWorld(m, r.left + r.width / 2, r.top + r.height / 2);
      x = c.x - w / 2;
      y = c.y - hh / 2;
    }
    let top = 0;
    for (const f of m.frames.values()) top = Math.max(top, f.data.z || 0);
    const url = o.url ? normalizeUrl(o.url) : "";
    const f = buildFrame(m, { x, y, w, h: hh, url: url || "", title: o.title || "", titled: !!o.title, z: top + 1 });
    state.counts.created++;
    save(m);
    select(f);
    if (!f.data.url && o.focus !== false) requestAnimationFrame(() => f.els.url.focus({ preventScroll: true }));
    return f;
  }
  function removeFrame(f, withUndo) {
    const m = f.m;
    const data = { ...f.data };
    destroyFrame(f);
    state.counts.removed++;
    save(m);
    if (withUndo !== false) showUndo(m, data);
    return data;
  }
  function restore(key, data) {
    const m = visibleMount(key) || mountsOf(key)[0];
    state.counts.restored++;
    if (!m) {
      const N = nodesApi();
      if (N) {
        N.upsert({ ...toNode(normalizeData(data)), canvasPath: key }).catch(() => {});
        return null;
      }
      const list = load(key).filter((d) => d.id !== data.id);
      list.push(normalizeData(data));
      writeStore(key, list);
      return null;
    }
    const f = m.frames.get(data.id) || buildFrame(m, data);
    save(m);
    select(f);
    return f;
  }

  // ------------------------------------------------------------------ toast
  function showUndo(m, data) {
    hideToast();
    const action = h("button", { class: "rtbf-toast-action", type: "button", text: "Undo" });
    const el = h("div", { class: "rtbf-toast", role: "status", "aria-live": "polite", "data-rtbf-toast": "" }, h("span", { class: "rtbf-toast-text", text: "Browser frame deleted" }), action);
    const r = m.root.isConnected ? m.root.getBoundingClientRect() : { left: 0, right: window.innerWidth, bottom: window.innerHeight };
    el.style.left = Math.round((r.left + r.right) / 2) + "px";
    el.style.bottom = Math.round(window.innerHeight - r.bottom + 68) + "px";
    document.body.appendChild(el);
    const t = { el, key: m.key, root: m.root, data, timer: null, left: UNDO_MS, since: 0 };
    const arm = () => {
      t.since = Date.now();
      t.timer = setTimeout(hideToast, t.left);
    };
    el.addEventListener("pointerenter", () => {
      clearTimeout(t.timer);
      t.left = Math.max(800, t.left - (Date.now() - t.since));
    });
    el.addEventListener("pointerleave", arm);
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    action.addEventListener("click", (e) => {
      e.stopPropagation();
      undo();
    });
    state.toast = t;
    arm();
    requestAnimationFrame(() => el.setAttribute("data-show", ""));
  }
  function hideToast() {
    const t = state.toast;
    if (!t) return;
    state.toast = null;
    clearTimeout(t.timer);
    t.el.removeAttribute("data-show");
    setTimeout(() => t.el.remove(), 200);
  }
  function undo() {
    const t = state.toast;
    if (!t) return false;
    hideToast();
    restore(t.key, t.data);
    return true;
  }

  // --------------------------------------------------------- browser tool
  function arm(m) {
    if (!m || !m.root.isConnected) return false;
    disarm();
    deselect();
    // One draw tool at a time: canvas-shader's (its arm() disarms this one).
    try {
      const sh = window.__RE_TEMPO_CANVAS_SHADER__;
      if (sh && typeof sh.state === "function" && sh.state().tool && typeof sh.disarm === "function") sh.disarm();
    } catch (_) {}
    const overlay = h("div", { class: "rtbf-draw-overlay", "data-rtbf-draw": "" });
    m.root.appendChild(overlay);
    state.tool = { m, overlay, preview: null };
    document.documentElement.setAttribute("data-rtbf-armed", "");
    overlay.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      startDraw(e);
    });
    for (const type of ["mousedown", "click", "dblclick", "contextmenu"]) overlay.addEventListener(type, (e) => e.stopPropagation());
    refreshToolButtons();
    return true;
  }
  function disarm() {
    const t = state.tool;
    if (!t) return;
    state.tool = null;
    t.overlay.remove();
    if (t.preview) t.preview.remove();
    document.documentElement.removeAttribute("data-rtbf-armed");
    refreshToolButtons();
  }
  function startDraw(e) {
    const t = state.tool;
    const m = t.m;
    const pid = e.pointerId;
    const sx = e.clientX;
    const sy = e.clientY;
    const a = toWorld(m, sx, sy);
    let dragged = false;
    const label = h("div", { class: "rtbf-size" });
    const pv = h("div", { class: "rtbf-draw-preview" }, ...["nw", "ne", "sw", "se"].map((k) => h("div", { class: "rtbf-draw-sq rtbf-corner-" + k })), label);
    t.preview = pv;
    try {
      t.overlay.setPointerCapture(pid);
    } catch (_) {}
    const rectFrom = (ev) => {
      const b = toWorld(m, ev.clientX, ev.clientY);
      return { x: Math.round(Math.min(a.x, b.x)), y: Math.round(Math.min(a.y, b.y)), w: Math.round(Math.abs(b.x - a.x)), h: Math.round(Math.abs(b.y - a.y)) };
    };
    const move = (ev) => {
      if (ev.pointerId !== pid) return;
      ev.stopPropagation();
      if (!dragged && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      if (!dragged) {
        dragged = true;
        m.layer.appendChild(pv);
      }
      const r = rectFrom(ev);
      Object.assign(pv.style, { transform: `translate(${r.x}px, ${r.y}px)`, width: r.w + "px", height: r.h + "px" });
      label.textContent = `${Math.max(MIN_W, r.w)} × ${Math.max(MIN_H, r.h)}`;
    };
    const up = (ev) => {
      if (ev.pointerId !== pid) return;
      ev.stopPropagation();
      t.overlay.removeEventListener("pointermove", move);
      t.overlay.removeEventListener("pointerup", up);
      t.overlay.removeEventListener("pointercancel", up);
      pv.remove();
      t.preview = null;
      if (ev.type === "pointercancel") return disarm();
      const r = dragged ? rectFrom(ev) : { x: Math.round(a.x), y: Math.round(a.y), w: DEFAULT_W, h: DEFAULT_H };
      disarm();
      createIn(m, r);
    };
    t.overlay.addEventListener("pointermove", move);
    t.overlay.addEventListener("pointerup", up);
    t.overlay.addEventListener("pointercancel", up);
  }

  // ------------------------------------------------------------------ route
  // The app's nav route, from its workspace store (zustand), found through the
  // canvas root's fiber hooks as pane-dock.js and app-map.js find it: a pure
  // getter "()=>x" whose state has activeNavRoute ("design", "chat", ...).
  const GETTER_RE = /^\(\)=>[A-Za-z$_][\w$]*$/;
  let routeGetter = null;
  function findRouteGetter(node) {
    const tried = new Set();
    for (let f = fiberOf(node), d = 0; f && d < MAX_FIBER_DEPTH; f = f.return, d++) {
      let hk = f.memoizedState;
      if (!hk || typeof hk !== "object" || !("next" in hk)) continue;
      for (let i = 0; hk && i < 400; i++, hk = hk.next) {
        const ms = hk.memoizedState;
        const dep = Array.isArray(ms) && ms.length === 2 ? ms[1] : null;
        if (!Array.isArray(dep) || dep.length !== 4 || typeof dep[0] !== "function") continue;
        const gs = dep[0];
        if (tried.has(gs)) continue;
        tried.add(gs);
        let src = "";
        try {
          src = Function.prototype.toString.call(gs);
        } catch (_) {}
        if (!GETTER_RE.test(src)) continue; // never call anything but a plain getter
        let st = null;
        try {
          st = gs();
        } catch (_) {}
        if (st && typeof st === "object" && typeof st.activeNavRoute === "string") return gs;
      }
    }
    return null;
  }
  function navRoute(m) {
    if (!routeGetter) routeGetter = findRouteGetter(m.root);
    if (!routeGetter) return null;
    try {
      const st = routeGetter();
      return st && typeof st.activeNavRoute === "string" ? st.activeNavRoute : null;
    } catch (_) {
      routeGetter = null;
      return null;
    }
  }
  // The canvas the W key acts on: the design route's active canvas, i.e. one
  // whose design toolbar is on screen (canvas-keys.js's guard) while the nav
  // route is "design" (when the store was not found, the toolbar decides).
  function toolTarget() {
    const cands = [];
    for (const tb of document.querySelectorAll(TOOLBAR)) {
      if (!isShown(tb)) continue;
      const root = rootForToolbar(tb);
      const m = root ? state.mounts.get(root) : null;
      if (m && isShown(m.root) && !cands.includes(m)) cands.push(m);
    }
    const m = cands.find((x) => x.root === state.lastRoot) || cands[0] || null;
    if (!m) return null;
    const route = navRoute(m);
    return route === null || route === "design" ? m : null;
  }

  // ------------------------------------------------------- toolbar button
  function rootForToolbar(tb) {
    for (let a = tb.parentElement; a && a !== document.body; a = a.parentElement) {
      const roots = a.querySelectorAll(CANVAS_ROOT);
      if (roots.length) return Array.from(roots).find(isShown) || roots[0];
    }
    return null;
  }
  function injectToolbars() {
    let added = false;
    for (const tb of document.querySelectorAll(TOOLBAR)) {
      if (tb.querySelector(":scope > .rtbf-tool")) continue;
      added = true;
      const sepNative = tb.querySelector(":scope > div.w-px");
      const sep = h("div", { class: (sepNative && sepNative.className) || "h-5 w-px shrink-0 bg-border-secondary", "data-rtbf-sep": "" });
      sep.classList.add("rtbf-tool-sep");
      const b = h("button", { type: "button", class: "rtbf-tool", "aria-label": "Browser", "aria-pressed": "false", "data-rtbf-tool": "", "data-testid": "canvas-browser-tool" });
      b.append(icon("globe", "size-4 rtbf-ic", 1.5));
      b.addEventListener("pointerdown", (e) => e.stopPropagation());
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        hideTooltip();
        if (state.tool) return disarm();
        const root = rootForToolbar(tb);
        const m = root && (state.mounts.get(root) || (sync(), state.mounts.get(root)));
        if (m) {
          state.lastRoot = root;
          arm(m);
        }
      });
      b.addEventListener("pointerenter", () => scheduleTooltip(b));
      b.addEventListener("pointerleave", hideTooltip);
      b.addEventListener("focus", () => scheduleTooltip(b));
      b.addEventListener("blur", hideTooltip);
      tb.append(sep, b);
      // Any native tool disarms the browser tool.
      if (!tb.__rtbfWired) {
        tb.__rtbfWired = true;
        tb.addEventListener("click", (e) => {
          const nb = e.target.closest("button");
          if (nb && !nb.hasAttribute("data-rtbf-tool")) disarm();
        });
      }
    }
    if (added) refreshToolButtons();
  }
  function refreshToolButtons() {
    for (const b of document.querySelectorAll("button[data-rtbf-tool]")) {
      const tb = b.closest(TOOLBAR);
      const on = !!state.tool && !!tb && rootForToolbar(tb) === state.tool.m.root;
      const cls = `${BTN_BASE} ${on ? BTN_ON : BTN_IDLE} rtbf-tool`;
      if (b.className !== cls) b.className = cls;
      if (b.getAttribute("aria-pressed") !== String(on)) b.setAttribute("aria-pressed", String(on));
    }
  }
  function scheduleTooltip(b) {
    hideTooltip();
    const t = { anchor: b, el: null, timer: setTimeout(() => showTooltip(t), TOOLTIP_DELAY) };
    state.tooltip = t;
  }
  function showTooltip(t) {
    if (state.tooltip !== t || !t.anchor.isConnected) return;
    const el = h("div", { class: "rtbf-tooltip", role: "tooltip" }, h("span", { text: "Browser" }), h("kbd", { class: "rtbf-kbd", text: TOOL_KEY.toUpperCase() }));
    document.body.appendChild(el);
    const r = t.anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    el.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))) + "px";
    el.style.top = Math.round(r.top - el.offsetHeight - 10) + "px";
    t.el = el;
    requestAnimationFrame(() => el.setAttribute("data-show", ""));
  }
  function hideTooltip() {
    const t = state.tooltip;
    if (!t) return;
    state.tooltip = null;
    clearTimeout(t.timer);
    if (t.el) t.el.remove();
  }

  // ---------------------------------------------------------- "+" menu item
  // Removed: the "Browser on Canvas" item. Only a stale copy is swept.
  function sweepPlusMenu() {
    for (const el of document.querySelectorAll("[data-rtbf-plus]")) el.remove();
  }

  // ------------------------------------------------------------- global keys
  function onKeyDown(e) {
    if (!state.enabled || e.isComposing) return;
    if (e.key === " " && !isEditable(e.target)) state.spaceDown = true;
    const ae = document.activeElement;
    const typing = isEditable(e.target) || isEditable(ae);
    if (state.tool && e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      disarm();
      return;
    }
    if (typing || (ae && /^(IFRAME|WEBVIEW)$/.test(ae.tagName) && !(state.active && ae === state.active.guest))) return;
    const plain = !e.metaKey && !e.ctrlKey && !e.altKey;
    const f = state.selected;
    if (f && f.el.isConnected) {
      if (plain && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        removeFrame(f, true);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (state.active === f) deactivate(f);
        else deselect();
        return;
      }
      if (plain && /^Arrow(Left|Right|Up|Down)$/.test(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const s = e.shiftKey ? 10 : 1;
        if (e.key === "ArrowLeft") f.data.x -= s;
        if (e.key === "ArrowRight") f.data.x += s;
        if (e.key === "ArrowUp") f.data.y -= s;
        if (e.key === "ArrowDown") f.data.y += s;
        applyGeom(f);
        scheduleSave(f.m, 400);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        e.stopImmediatePropagation();
        f.els.url.focus({ preventScroll: true });
        return;
      }
    }
    if (plain && !e.shiftKey && !e.repeat && e.key.toLowerCase() === TOOL_KEY) {
      // Only in the canvas context: focus on the page body, a canvas root, a
      // browser frame or the design toolbar (as the app's tool keys), and only
      // for the design route's active canvas.
      const ctx = !ae || ae === document.body || !!ae.closest(CANVAS_ROOT + ", " + TOOLBAR + ", .rtbf-frame");
      const m = ctx ? toolTarget() : null;
      if (!m) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (state.tool) disarm();
      else arm(m);
    }
  }
  function onKeyUp(e) {
    if (e.key === " ") state.spaceDown = false;
  }
  function onPointerDownCapture(e) {
    if (!state.enabled) return;
    const t = e.target;
    const root = t && t.closest ? t.closest(CANVAS_ROOT) : null;
    if (root) state.lastRoot = root;
    if (t && t.closest && t.closest(".rtbf-frame, [data-rtbf-toast], [data-rtbf-tool], [data-rtbf-draw]")) {
      const fr = t.closest(".rtbf-frame");
      if (state.active && (!fr || fr !== state.active.el)) deactivate(state.active);
      return;
    }
    if (state.selected) deselect();
  }
  // Focus moving into a storyboard iframe (no host pointerdown for it).
  function onWindowBlur() {
    setTimeout(() => {
      const ae = document.activeElement;
      if (!ae || !state.selected) return;
      if (/^(IFRAME|WEBVIEW)$/.test(ae.tagName) && !ae.closest(".rtbf-frame")) deselect();
    }, 0);
  }

  // ------------------------------------------------------------------- sync
  function teardownAll() {
    disarm();
    hideToast();
    hideTooltip();
    deselect();
    for (const m of Array.from(state.mounts.values())) unmount(m);
    for (const el of document.querySelectorAll("[data-rtbf-tool], [data-rtbf-sep], [data-rtbf-plus]")) el.remove();
  }
  function syncMounts(full) {
    const roots = document.querySelectorAll(CANVAS_ROOT);
    const seen = new Set();
    for (const root of roots) {
      seen.add(root);
      let m = state.mounts.get(root);
      if (m && !full && m.layer.isConnected) continue;
      const handle = findHandle(root);
      const host = worldHostOf(root, handle);
      const key = canvasKeyOf(root);
      if (m && (m.host !== host || m.key !== key || !m.layer.isConnected)) {
        unmount(m);
        m = null;
      }
      if (!m && host && key && nodesSettled()) m = mount(root, host, key, handle);
      if (m && handle) m.handle = handle;
    }
    for (const [root, m] of Array.from(state.mounts)) if (!seen.has(root) || !root.isConnected) unmount(m);
  }
  function sync() {
    if (document.hidden || boot.disposed) return; // nothing to do for a hidden tab
    const on = flagOn();
    if (on !== state.enabled) {
      state.enabled = on;
      if (!on) teardownAll();
    }
    if (!on) return;
    state.lastSync = Date.now();
    syncMounts(true);
    injectToolbars();
    sweepPlusMenu();
    if (state.tool && !isShown(state.tool.m.root)) disarm();
    if (state.toast && !isShown(state.toast.root)) hideToast();
    if (state.tooltip && !state.tooltip.anchor.isConnected) hideTooltip();
    // A storyboard got selected (click inside its iframe, marquee...).
    const f = state.selected;
    if (f) {
      if (!f.el.isConnected) state.selected = null;
      else
        try {
          const hd = f.m.handle;
          if (hd && typeof hd.getSelection === "function" && hd.getSelection().length) deselect();
        } catch (_) {}
    }
  }
  let quickTimer = null;
  let quickAt = 0;
  function quickSync() {
    quickTimer = null;
    quickAt = Date.now();
    if (!state.enabled || document.hidden || boot.disposed) return;
    syncMounts(false);
    injectToolbars();
  }
  function scheduleQuick() {
    if (quickTimer || !state.enabled || document.hidden || boot.disposed) return;
    quickTimer = setTimeout(quickSync, Math.max(0, QUICK_MS - (Date.now() - quickAt)));
  }

  // ------------------------------------------------------------------ boot
  // Every listener, the interval and the observer are kept for dispose().
  const boot = { interval: null, observer: null, listeners: [], disposed: false };
  const listen = (target, type, fn, opt) => {
    target.addEventListener(type, fn, opt);
    boot.listeners.push([target, type, fn, opt]);
  };
  listen(window, "keydown", onKeyDown, true);
  listen(window, "keyup", onKeyUp, true);
  listen(window, "pointerdown", onPointerDownCapture, true);
  listen(window, "blur", onWindowBlur);
  listen(window, "storage", (e) => {
    if (e.key === FLAG_KEY) return sync();
    if (!e.key || !e.key.startsWith(STORE_PREFIX)) return;
    const key = e.key.slice(STORE_PREFIX.length);
    for (const m of mountsOf(key)) if (!m.nodes) reconcile(m, load(key));
  });
  listen(window, "rtd:canvas-nodes-ready", () => {
    registerNodeType(window.__RE_TEMPO_CANVAS_NODES__);
    scheduleQuick();
  });
  // The interval skips a hidden tab; catch up as soon as it shows again.
  listen(document, "visibilitychange", () => {
    if (!document.hidden) sync();
  });
  loadNodes();
  const start = () => {
    if (boot.disposed) return;
    state.enabled = flagOn();
    boot.observer = new MutationObserver(scheduleQuick);
    boot.observer.observe(document.documentElement, { childList: true, subtree: true });
    boot.interval = setInterval(sync, SYNC_MS);
    sync();
  };
  if (document.body) start();
  else listen(document, "DOMContentLoaded", start, { once: true });
  // Removes everything this mod added (frames, toolbar items, listeners,
  // timers, observer) and its window API; the canvas file is left as it is.
  function dispose() {
    if (boot.disposed) return false;
    boot.disposed = true;
    clearInterval(boot.interval);
    boot.interval = null;
    if (boot.observer) boot.observer.disconnect();
    boot.observer = null;
    clearTimeout(quickTimer);
    quickTimer = null;
    clearTimeout(nodesLoad.timer);
    for (const [target, type, fn, opt] of boot.listeners.splice(0)) target.removeEventListener(type, fn, opt);
    teardownAll();
    if (window.__RE_TEMPO_CANVAS_BROWSER__ === api) delete window.__RE_TEMPO_CANVAS_BROWSER__;
    return true;
  }

  // ---------------------------------------------------------- introspection
  const frameById = (id) => {
    for (const m of state.mounts.values()) if (m.frames.has(id)) return m.frames.get(id);
    return null;
  };
  const pub = (f) => ({
    ...f.data,
    kind: f.kind,
    loading: f.nav.loading,
    canGoBack: f.nav.back,
    canGoForward: f.nav.fwd,
    selected: state.selected === f,
    active: state.active === f,
    shownTitle: f.els.title.textContent,
  });
  const api = {
    version: 1,
    get enabled() {
      return state.enabled;
    },
    state: () => ({
      enabled: state.enabled,
      engine: engine(),
      tool: !!state.tool,
      selected: state.selected ? state.selected.data.id : null,
      active: state.active ? state.active.data.id : null,
      toast: !!state.toast,
      counts: { ...state.counts },
      lastSync: state.lastSync,
      disposed: boot.disposed,
      mounts: Array.from(state.mounts.values()).map((m) => ({ key: m.key, workspacePath: m.ws, persistence: m.nodes ? "canvas-file" : "localStorage", visible: isShown(m.root), frames: Array.from(m.frames.values()).map(pub) })),
    }),
    frames: (key) => {
      const m = key ? visibleMount(key) || mountsOf(key)[0] : visibleMount();
      return m ? Array.from(m.frames.values()).map(pub) : [];
    },
    // What is saved for a canvas: the file's nodes, or localStorage.
    stored: (key) => {
      const N = nodesApi();
      const k = key || (visibleMount() || {}).key;
      if (N && k) return N.list(k).filter((n) => n.type === NODE_TYPE).map(fromNode);
      return k ? load(k) : [];
    },
    create: (opts) => {
      const m = visibleMount();
      return m ? createIn(m, opts || {}).data.id : null;
    },
    remove: (id, withUndo) => {
      const f = frameById(id);
      return f ? (removeFrame(f, withUndo), true) : false;
    },
    select: (id) => {
      const f = frameById(id);
      if (f) select(f);
      else deselect();
      return !!f;
    },
    activate: (id) => {
      const f = frameById(id);
      if (f) activate(f);
      return !!f;
    },
    navigate: (id, url) => {
      const f = frameById(id);
      const u = normalizeUrl(url);
      if (!f || !u) return false;
      loadInto(f, u);
      save(f.m);
      return true;
    },
    undo,
    arm: () => arm(visibleMount()),
    disarm,
    sync,
    keyOf: (root) => canvasKeyOf(root || (visibleMount() || {}).root),
    storageKey: (key) => STORE_PREFIX + key,
    normalizeUrl,
    route: () => {
      const m = visibleMount();
      return m ? navRoute(m) : null;
    },
    dispose,
  };
  window.__RE_TEMPO_CANVAS_BROWSER__ = api;
})();
