/*
 * RE-TEMPO · canvas-paste (user MOD layer)
 * ---------------------------------------------------------------------------
 * Pasting an image on the design canvas (Cmd+V with a screenshot on the
 * clipboard) drops it with its TOP-LEFT corner at the mouse pointer, instead
 * of the app's default slot far away from the cursor.
 *
 * What the app does today (assets/index-D2Ui1vc0.js, RE-TEMPO build of
 * 2026-10-14, read on 2026-10-18):
 *   - The canvas view registers window "keydown" and "paste" listeners in
 *     the capture phase (handlePasteKeydown / handleNativePaste). The paste
 *     handler bails out on Cmd+Shift+V, when the canvas is inactive, when
 *     focus is in an input/contenteditable/Monaco or a [role=menu], or while
 *     a context menu owns "paste". Otherwise it calls preventDefault +
 *     stopPropagation and runs the paste pipeline WITHOUT a position.
 *   - The pipeline reads navigator.clipboard.read() (image, text, html and
 *     the Tempo marker). Without a position, an image becomes an <img> inside
 *     the selected element (when an element is selected) or a new JSX
 *     storyboard placed by the layout helper: x = right edge of the
 *     rightmost storyboard + 80 (or right of the source storyboard), y = the
 *     first free slot there. That is the "random spot" the user sees.
 *   - The same pipeline accepts `atWorld` ({x, y} in canvas/world units): the
 *     selection anchor is ignored and the new storyboard's top-left corner is
 *     placed exactly at that point. The app already uses it for the canvas
 *     background context menu "Paste here" (pasteAtWorldPositionRef in the
 *     CanvasActions context, filled by the canvas view).
 *   - Drop: the canvas wrapper only handles dropped HTML files and component
 *     assets. It converts clientX/clientY with
 *       world = (client - canvasRect.topLeft - view.{x,y}) / view.zoom
 *     (view = the infinite canvas handle's getView()) and passes it as
 *     atWorld, so a drop lands with its top-left corner at the cursor.
 *     Dropped image files are ignored by the canvas.
 *
 * Strategy: a window "paste" listener in the capture phase, registered before
 * the app's (this classic script runs before the deferred module bundle).
 * When the clipboard has an image, focus is not in an editable, and the last
 * pointer position is over a visible [data-canvas-root], it calls
 * preventDefault + stopImmediatePropagation (the app's handler does not run,
 * so nothing is pasted twice) and calls the app's own
 * pasteAtWorldPositionRef.current(world): the same code path as "Paste here".
 * Everything else (text, Tempo elements, Figma, URLs, HTML files, pointer
 * outside the canvas, Cmd+Shift+V) falls through to the native handler.
 *
 * Read-only lookups: the CanvasActions context value, the canvas view's paste
 * context ref and the infinite canvas handle (getView) are found in the React
 * fiber tree; only plain property reads and getView() are used to look.
 * Pointer: host pointermove/pointerdown, plus pointermove inside same-origin
 * storyboard iframes (mapped to host coordinates like the app does).
 * Introspection: window.__RE_TEMPO_CANVAS_PASTE__ (enabled, lastPointer,
 * lastDecision, count, respectSelection, toWorld(), probe()).
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (window.__RE_TEMPO_CANVAS_PASTE__) return; // double injection

  const CANVAS_ROOT = "[data-canvas-root]";
  const VIEW_LAYER = ".tds-canvas-shimmer-origin";
  const MAX_FIBER_DEPTH = 600;
  const MAX_HOOKS = 1500;
  const FRAME_SCAN_MS = 400;
  const EDGE_PX = 1;

  const state = {
    enabled: true,
    // When true, an image pasted while an element is selected keeps the
    // app's "insert into the selected element" behavior.
    respectSelection: false,
    lastPointer: null, // { x, y, t, inWindow, source }
    lastDecision: null, // { t, kind: "redirect" | "native", reason, world? }
    count: 0,
  };
  const kbd = { shiftV: false, timer: null };

  // ------------------------------------------------------------ fiber (read)
  const fiberOf = (node) => {
    if (!node) return null;
    const k = Object.keys(node).find((x) => x.startsWith("__reactFiber$"));
    return k ? node[k] : null;
  };
  const isRefObj = (r) => !!r && typeof r === "object" && "current" in r;

  // Per canvas root: { actions, pasteCtxRef, handleRef }. All three are
  // stable objects for the life of the mounted canvas.
  const wiringCache = new WeakMap();

  function findWiring(root) {
    const cached = wiringCache.get(root);
    if (cached && cached.actions) return cached;
    const out = { actions: null, pasteCtxRef: null, handleRef: null };
    let f = fiberOf(root);
    for (let d = 0; f && d < MAX_FIBER_DEPTH; d++, f = f.return) {
      if (!out.handleRef) {
        for (const r of [f.ref, f.memoizedProps && f.memoizedProps.ref]) {
          if (isRefObj(r) && r.current && typeof r.current.getView === "function") {
            out.handleRef = r;
            break;
          }
        }
      }
      if (!out.pasteCtxRef) {
        let h = f.memoizedState;
        if (h && typeof h === "object" && "next" in h) {
          for (let i = 0; h && i < MAX_HOOKS; i++, h = h.next) {
            const s = h.memoizedState;
            if (isRefObj(s) && s.current && typeof s.current === "object" && "skipNextNativePaste" in s.current && "canvasShortcutScopeRef" in s.current) {
              out.pasteCtxRef = s;
              break;
            }
          }
        }
      }
      const v = f.memoizedProps && f.memoizedProps.value;
      if (v && typeof v === "object" && isRefObj(v.pasteAtWorldPositionRef)) {
        out.actions = v;
        break; // the context provider sits above everything else we need
      }
    }
    if (out.actions) wiringCache.set(root, out);
    return out;
  }

  // ------------------------------------------------------------------- view
  const TRANSFORM_RE = /translate3d\(\s*(-?[\d.e+-]+)px\s*,\s*(-?[\d.e+-]+)px\s*,\s*0(?:px)?\s*\)\s*scale\(\s*([\d.e+-]+)\s*\)/i;
  const validView = (v) => !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.zoom) && v.zoom > 0;

  function readView(root, wiring) {
    const h = wiring && wiring.handleRef && wiring.handleRef.current;
    if (h && typeof h.getView === "function") {
      try {
        const v = h.getView();
        if (validView(v)) return { x: v.x, y: v.y, zoom: v.zoom, via: "handle" };
      } catch (_) {}
    }
    // Fallback: the transform the canvas writes on its world layer.
    const layer = root.querySelector(":scope > " + VIEW_LAYER) || root.querySelector(VIEW_LAYER);
    const m = layer && TRANSFORM_RE.exec(layer.style.transform || "");
    if (m) {
      const v = { x: +m[1], y: +m[2], zoom: +m[3], via: "transform" };
      if (validView(v)) return v;
    }
    return null;
  }

  function clientToWorld(root, view, x, y) {
    const r = root.getBoundingClientRect();
    return { x: (x - r.left - view.x) / view.zoom, y: (y - r.top - view.y) / view.zoom };
  }

  // ---------------------------------------------------------------- pointer
  function recordPointer(x, y, source) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    state.lastPointer = { x, y, t: Date.now(), inWindow: true, source };
  }

  const hookedDocs = new WeakSet();
  let lastScan = 0;
  function scanFrames(force) {
    const now = Date.now();
    if (!force && now - lastScan < FRAME_SCAN_MS) return;
    lastScan = now;
    for (const fr of document.querySelectorAll(CANVAS_ROOT + " iframe")) hookFrame(fr);
  }
  function hookFrame(fr) {
    let doc = null;
    try {
      doc = fr.contentDocument;
    } catch (_) {
      return; // cross-origin
    }
    if (!doc || hookedDocs.has(doc)) return;
    hookedDocs.add(doc);
    const onMove = (e) => {
      const view = doc.defaultView;
      const host = view && view.frameElement;
      if (!host || !host.isConnected) return;
      const r = host.getBoundingClientRect();
      const iw = Math.max(1, view.innerWidth || doc.documentElement.clientWidth || r.width);
      const ih = Math.max(1, view.innerHeight || doc.documentElement.clientHeight || r.height);
      recordPointer(r.left + (e.clientX * r.width) / iw, r.top + (e.clientY * r.height) / ih, "iframe");
    };
    try {
      doc.addEventListener("pointermove", onMove, { capture: true, passive: true });
      doc.addEventListener("pointerdown", onMove, { capture: true, passive: true });
    } catch (_) {}
  }

  function onHostPointer(e) {
    recordPointer(e.clientX, e.clientY, e.isTrusted ? "host" : "forwarded");
    scanFrames(false);
  }

  // Leaving through the window edge counts as "outside"; moving into an
  // iframe or under an overlay keeps the last known position.
  function onHostMouseOut(e) {
    if (e.relatedTarget) return;
    const p = state.lastPointer;
    if (!p) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = e.clientX;
    const y = e.clientY;
    if (x <= EDGE_PX || y <= EDGE_PX || x >= w - EDGE_PX - 1 || y >= h - EDGE_PX - 1) p.inWindow = false;
  }

  // --------------------------------------------------------------- keyboard
  // Mirrors the app: Cmd/Ctrl+Shift+V makes the native handler skip.
  function onKeydown(e) {
    if (!(e.metaKey || e.ctrlKey) || String(e.key).toLowerCase() !== "v") return;
    kbd.shiftV = !!e.shiftKey;
    if (kbd.timer !== null) clearTimeout(kbd.timer);
    kbd.timer = setTimeout(() => {
      kbd.shiftV = false;
      kbd.timer = null;
    }, 0);
  }

  // ------------------------------------------------------------- clipboard
  function safeData(dt, type) {
    try {
      return dt.getData(type) || "";
    } catch (_) {
      return "";
    }
  }
  function classifyClipboard(dt) {
    const out = { hasImage: false, hasHtmlFile: false, figma: false, url: false };
    if (!dt) return out;
    for (const f of Array.from(dt.files || [])) {
      const type = String(f.type || "").toLowerCase();
      const name = String(f.name || "").toLowerCase();
      if (type === "text/html" || name.endsWith(".html") || name.endsWith(".htm")) out.hasHtmlFile = true;
      else if (type.startsWith("image/")) out.hasImage = true;
    }
    if (!out.hasImage) {
      for (const it of Array.from(dt.items || [])) {
        if (it && it.kind === "file" && String(it.type || "").toLowerCase().startsWith("image/")) out.hasImage = true;
      }
    }
    out.figma = safeData(dt, "text/html").includes("(figma)");
    const text = safeData(dt, "text/plain").trim();
    out.url = !!text && !/\s/.test(text) && text.length <= 8192 && /^https?:\/\//i.test(text);
    return out;
  }

  // ------------------------------------------------------------------ focus
  // Same rules as the app's shortcut-scope check.
  function focusBlocksCanvas() {
    const a = document.activeElement;
    if (a && a !== document.body) {
      if (a.closest("[role='menu']") || a.closest(".monaco-editor")) return true;
      const tag = a.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || a.isContentEditable) return true;
      if (a.closest("[contenteditable]:not([contenteditable='false'])")) return true;
    }
    // A context menu that owns "paste" handles Cmd+V itself.
    for (const m of document.querySelectorAll("[role='menu']")) {
      const r = m.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ the decision
  function canvasUnderPointer(p) {
    const el = document.elementFromPoint(p.x, p.y);
    const root = el && el.closest ? el.closest(CANVAS_ROOT) : null;
    if (!root || !root.isConnected) return null;
    const r = root.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    if (p.x < r.left || p.x >= r.right || p.y < r.top || p.y >= r.bottom) return null;
    return root;
  }

  const native = (reason) => ({ kind: "native", reason });

  function decide(e, dtOverride) {
    if (!state.enabled) return native("disabled");
    if (e && e.defaultPrevented) return native("already-handled");
    if (kbd.shiftV) return native("shift-v");
    const clip = classifyClipboard(dtOverride || (e && e.clipboardData));
    if (!clip.hasImage) return native("no-image");
    if (clip.hasHtmlFile) return native("html-file");
    if (clip.figma) return native("figma");
    if (clip.url) return native("url-text");
    if (focusBlocksCanvas()) return native("focus");
    const p = state.lastPointer;
    if (!p || !p.inWindow) return native("pointer-outside-window");
    const root = canvasUnderPointer(p);
    if (!root) return native("pointer-off-canvas");
    const wiring = findWiring(root);
    const paste = wiring.actions && wiring.actions.pasteAtWorldPositionRef.current;
    if (typeof paste !== "function") return native("no-app-hook");
    const ctx = wiring.pasteCtxRef && wiring.pasteCtxRef.current;
    if (ctx) {
      if (ctx.skipNextNativePaste) return native("shift-v");
      if (ctx.active === false) return native("canvas-inactive");
      if (ctx.canvasShortcutScopeRef && !ctx.canvasShortcutScopeRef.current) return native("no-shortcut-scope");
      if (state.respectSelection) {
        let snap = null;
        try {
          snap = ctx.selectionActions && ctx.selectionActions.getSnapshot();
        } catch (_) {}
        if (snap && snap.elementSelections && snap.elementSelections.length > 0) return native("element-selected");
      }
    }
    const view = readView(root, wiring);
    if (!view) return native("no-view");
    const world = clientToWorld(root, view, p.x, p.y);
    if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) return native("bad-world");
    return { kind: "redirect", reason: "image-at-pointer", world, view, paste };
  }

  function publicDecision(d) {
    const out = { t: Date.now(), kind: d.kind, reason: d.reason };
    if (d.world) out.world = { x: Math.round(d.world.x), y: Math.round(d.world.y) };
    if (d.view) out.view = { x: d.view.x, y: d.view.y, zoom: d.view.zoom, via: d.view.via };
    if (state.lastPointer) out.pointer = { x: state.lastPointer.x, y: state.lastPointer.y };
    return out;
  }

  function onPaste(e) {
    let d;
    try {
      d = decide(e);
    } catch (err) {
      d = native("error");
      console.warn("[canvas-paste] decision failed; native paste", err);
    }
    state.lastDecision = publicDecision(d);
    if (d.kind !== "redirect") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    state.count += 1;
    try {
      d.paste({ x: d.world.x, y: d.world.y });
    } catch (err) {
      console.error("[canvas-paste] pasteAtWorldPosition failed", err);
    }
  }

  // --------------------------------------------------------------- listeners
  window.addEventListener("keydown", onKeydown, { capture: true });
  window.addEventListener("paste", onPaste, { capture: true });
  window.addEventListener("pointermove", onHostPointer, { capture: true, passive: true });
  window.addEventListener("pointerdown", onHostPointer, { capture: true, passive: true });
  document.addEventListener("mouseout", onHostMouseOut, { capture: true, passive: true });

  // ---------------------------------------------------------- debug API
  const fakeImageClipboard = {
    files: [{ type: "image/png", name: "probe.png" }],
    items: [],
    getData: () => "",
  };
  window.__RE_TEMPO_CANVAS_PASTE__ = {
    get enabled() {
      return state.enabled;
    },
    set enabled(v) {
      state.enabled = !!v;
    },
    get respectSelection() {
      return state.respectSelection;
    },
    set respectSelection(v) {
      state.respectSelection = !!v;
    },
    get lastPointer() {
      return state.lastPointer ? { ...state.lastPointer } : null;
    },
    get lastDecision() {
      return state.lastDecision ? { ...state.lastDecision } : null;
    },
    get count() {
      return state.count;
    },
    // World point for a client point over a canvas, or null.
    toWorld(x, y) {
      const p = { x, y };
      const root = canvasUnderPointer(p);
      if (!root) return null;
      const view = readView(root, findWiring(root));
      return view ? clientToWorld(root, view, x, y) : null;
    },
    // What an image paste would do right now (pastes nothing).
    probe() {
      return publicDecision(decide(null, fakeImageClipboard));
    },
  };
})();
