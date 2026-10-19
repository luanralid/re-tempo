/*
 * RE-TEMPO · canvas-snap (user MOD layer)
 * ---------------------------------------------------------------------------
 * Figma/Pencil-style measurements on the design canvas. With a storyboard
 * selected, hold Alt/Option and:
 *   - hover another storyboard: the exact distances between the two, in
 *     canvas px (gaps between facing edges; edge-to-edge distances when one
 *     spans the other), as small red labels on thin red lines;
 *   - hover empty canvas (or the selection itself): the distance to the
 *     nearest storyboard in each of the four directions.
 * Labels show canvas px at any zoom; lines follow the zoom and pan. Everything
 * disappears when Alt is released, a mouse button goes down, or the window
 * loses focus.
 *
 * Snapping is NATIVE, the mod does not touch it. What the app already does
 * (assets/index-D2Ui1vc0.js, RE-TEMPO build of 2026-10-14, read on
 * 2026-10-18):
 *   - The canvas view creates snap hooks with options { getOverlayHost,
 *     enabled }: item drag (adjustItemDragRects, called by the infinite
 *     canvas on every drag pointermove with the proposed rects), resize
 *     (adjustResizeRect and the storyboard root handles' adjustResize) and
 *     element drag/resize/draw inside storyboards. They snap edges and
 *     centers, the drag one also equal gaps (with gap labels), and draw an
 *     <svg> into the canvas overlay host: 1 px #E53636 guides. That overlay
 *     ends on window pointerup/pointercancel/blur, so guides vanish on release.
 *   - Tolerance: options.thresholdPx ?? 8 screen px, divided by the zoom
 *     (world tolerance = 8 / zoom). Kept as is.
 *   - On/off: the view-controls store, localStorage
 *     "canvas-view-controls:snap-enabled" (default on), also exposed as
 *     window.tempoDebug.viewControls.isSnapEnabled().
 *   - Alt measurements exist only INSIDE storyboards (the iframe runtime's
 *     "altHoverSelected": selected element vs hovered element). Nothing
 *     measured storyboard to storyboard on the host canvas: that is what
 *     this mod adds.
 *   - DOM: each canvas item is div[data-canvas-item-id] inside the world
 *     layer (.tds-canvas-shimmer-origin, translate3d(x, y, 0) scale(zoom)),
 *     positioned with transform: translate(Xpx, Ypx) and width/height in
 *     canvas units (also --canvas-item-x/-y/-width/-height), with
 *     [data-canvas-item-selected] when selected. The infinite canvas handle
 *     (getView() -> { x, y, zoom }, relative to [data-canvas-root]) sits on a
 *     ref above the root, as canvas-paste found.
 *
 * How (read-only, nothing is prevented, stopped or written to the app):
 *   - Rects come from the item DOM (canvas units); the view from the handle,
 *     else from the world layer transform.
 *   - The overlay is an <svg> appended to the same overlay host the native
 *     guides use (found by calling getOverlayHost() of the snap options seen
 *     in the fiber chain above [data-canvas-root]), or a fixed <svg> over
 *     the canvas root when that host is unknown.
 *   - Shown only while Alt is held, no button is down, focus is not in an
 *     editable, and no element inside a storyboard is selected (the app
 *     measures elements itself; checked with the canvas selection snapshot).
 *     Alt and the pointer are also read from same-origin storyboard iframes.
 *
 * Flag: localStorage "rtd.canvasSnap" = "off" disables the mod.
 * Reduced motion: the overlay fade is CSS only and off under
 * prefers-reduced-motion.
 * Introspection: window.__RE_TEMPO_CANVAS_SNAP__ (enabled, alt, status(),
 * measureAt(x, y), lastMeasure, rescan()).
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (window.__RE_TEMPO_CANVAS_SNAP__) return; // double injection

  const FLAG_KEY = "rtd.canvasSnap";
  const CANVAS_ROOT = "[data-canvas-root]";
  const VIEW_LAYER = ".tds-canvas-shimmer-origin";
  const ITEM = "[data-canvas-item-id]";
  const SELECTED_ATTR = "data-canvas-item-selected";
  const MAX_FIBER_DEPTH = 600;
  const MAX_HOOKS = 1500;
  const SCAN_THROTTLE_MS = 1500;
  const FRAME_SCAN_MS = 400;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const LABEL = { font: 11, padX: 6, padY: 2, radius: 3, charW: 0.62 };
  const CAP = 3; // half length of the end ticks, screen px
  const OPTION_KEYS = new Set(["getOverlayHost", "enabled", "thresholdPx"]);

  const readStore = (k) => {
    try {
      return localStorage.getItem(k);
    } catch (_) {
      return null;
    }
  };
  const writeStore = (k, v) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch (_) {}
  };
  const state = {
    enabled: readStore(FLAG_KEY) !== "off",
    alt: false,
    buttons: 0,
    pointer: null, // { x, y } client px of the host window
    lastMeasure: null,
    raf: 0,
  };

  // ------------------------------------------------------------ fiber (read)
  const fiberOf = (node) => {
    if (!node) return null;
    const k = Object.keys(node).find((x) => x.startsWith("__reactFiber$"));
    return k ? node[k] : null;
  };
  const isRefObj = (r) => !!r && typeof r === "object" && "current" in r;
  const isSnapOptions = (c) =>
    !!c &&
    typeof c === "object" &&
    typeof c.getOverlayHost === "function" &&
    typeof c.enabled === "function" &&
    Object.keys(c).every((k) => OPTION_KEYS.has(k));

  // Per canvas root: { handleRef, optionRefs, selCtxRef, t }.
  const wiringCache = new WeakMap();

  function scanWiring(root) {
    const out = { handleRef: null, optionRefs: [], selCtxRef: null, t: Date.now() };
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
      let h = f.memoizedState;
      if (h && typeof h === "object" && "next" in h) {
        for (let i = 0; h && i < MAX_HOOKS; i++, h = h.next) {
          const s = h.memoizedState;
          if (!isRefObj(s)) continue;
          const c = s.current;
          if (isSnapOptions(c)) {
            if (!out.optionRefs.includes(s)) out.optionRefs.push(s);
          } else if (!out.selCtxRef && c && typeof c === "object" && "skipNextNativePaste" in c && c.selectionActions) {
            out.selCtxRef = s;
          }
        }
      }
      // The CanvasActions provider sits above the canvas view: stop there.
      const v = f.memoizedProps && f.memoizedProps.value;
      if (v && typeof v === "object" && isRefObj(v.pasteAtWorldPositionRef)) break;
    }
    wiringCache.set(root, out);
    return out;
  }

  function wiringFor(root, maxAgeMs) {
    const w = wiringCache.get(root);
    if (w && (maxAgeMs === undefined || Date.now() - w.t < maxAgeMs)) return w;
    return scanWiring(root);
  }

  // ------------------------------------------------------------------- view
  const VIEW_RE = /translate3d\(\s*(-?[\d.e+-]+)px\s*,\s*(-?[\d.e+-]+)px\s*,\s*0(?:px)?\s*\)\s*scale\(\s*([\d.e+-]+)\s*\)/i;
  const TRANSLATE_RE = /translate\(\s*(-?[\d.e+-]+)px\s*,\s*(-?[\d.e+-]+)px\s*\)/i;
  const validView = (v) => !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.zoom) && v.zoom > 0;

  function readView(root, w) {
    const h = w && w.handleRef && w.handleRef.current;
    if (h && typeof h.getView === "function") {
      try {
        const v = h.getView();
        if (validView(v)) return { x: v.x, y: v.y, zoom: v.zoom };
      } catch (_) {}
    }
    const layer = root.querySelector(":scope > " + VIEW_LAYER) || root.querySelector(VIEW_LAYER);
    const m = layer && VIEW_RE.exec(layer.style.transform || "");
    if (m) {
      const v = { x: +m[1], y: +m[2], zoom: +m[3] };
      if (validView(v)) return v;
    }
    return null;
  }

  const num = (s) => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
  };

  function itemRect(el) {
    const st = el.style;
    let x;
    let y;
    const m = TRANSLATE_RE.exec(st.transform || "");
    if (m) {
      x = +m[1];
      y = +m[2];
    } else {
      x = num(st.getPropertyValue("--canvas-item-x"));
      y = num(st.getPropertyValue("--canvas-item-y"));
    }
    let width = num(st.width);
    let height = num(st.height);
    if (!Number.isFinite(width)) width = num(st.getPropertyValue("--canvas-item-width"));
    if (!Number.isFinite(height)) height = num(st.getPropertyValue("--canvas-item-height"));
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    return { x, y, width, height };
  }

  function readItems(root) {
    const out = [];
    let order = 0;
    for (const el of root.querySelectorAll(ITEM)) {
      if (el.closest(CANVAS_ROOT) !== root) continue;
      if (el.getClientRects().length === 0) continue; // display: none
      const r = itemRect(el);
      if (!r) continue;
      const z = Number(el.style.zIndex) || 0;
      out.push({ id: el.getAttribute("data-canvas-item-id"), el, ...r, z, order: order++, selected: el.hasAttribute(SELECTED_ATTR) });
    }
    return out;
  }

  // ---------------------------------------------------------------- geometry
  const R = (r) => ({ l: r.x, t: r.y, r: r.x + r.width, b: r.y + r.height });
  const fmt = (v) => {
    const n = Math.round(v * 10) / 10;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  };

  function unionRect(list) {
    let l = Infinity;
    let t = Infinity;
    let r = -Infinity;
    let b = -Infinity;
    for (const a of list) {
      l = Math.min(l, a.x);
      t = Math.min(t, a.y);
      r = Math.max(r, a.x + a.width);
      b = Math.max(b, a.y + a.height);
    }
    return { x: l, y: t, width: r - l, height: b - t };
  }

  // Segments on one axis between selection S and target T (canvas units).
  // axis "x": horizontal distances, drawn at a y (cross); "y": vertical.
  function axisSegments(S, T, axis) {
    const s = R(S);
    const t = R(T);
    const [sa, sb, ta, tb] = axis === "x" ? [s.l, s.r, t.l, t.r] : [s.t, s.b, t.t, t.b];
    const [sc0, sc1, tc0, tc1] = axis === "x" ? [s.t, s.b, t.t, t.b] : [s.l, s.r, t.l, t.r];
    const segs = [];
    const sCross = [sc0, sc1];
    const tCross = [tc0, tc1];
    const ov0 = Math.max(sc0, tc0);
    const ov1 = Math.min(sc1, tc1);
    const crossFor = () => (ov1 > ov0 ? (ov0 + ov1) / 2 : (sc0 + sc1) / 2);
    // Dashed extension from the line to an edge that does not reach it.
    const conn = (at, range, cross) => (cross >= range[0] && cross <= range[1] ? null : { at, from: cross, to: cross < range[0] ? range[0] : range[1] });
    const mk = (a, aRange, b, bRange, cross) => ({
      axis,
      from: Math.min(a, b),
      to: Math.max(a, b),
      cross,
      value: Math.abs(b - a),
      connectors: [conn(a, aRange, cross), conn(b, bRange, cross)].filter(Boolean),
    });
    if (ta >= sb) {
      segs.push(mk(sb, sCross, ta, tCross, crossFor()));
    } else if (tb <= sa) {
      segs.push(mk(tb, tCross, sa, sCross, crossFor()));
    } else if ((ta <= sa && tb >= sb) || (sa <= ta && sb >= tb)) {
      // One contains the other on this axis: edge-to-edge distances, drawn
      // across the middle of the inner one.
      const inner = ta <= sa && tb >= sb ? sCross : tCross;
      const cross = (inner[0] + inner[1]) / 2;
      if (sa !== ta) segs.push(mk(sa, sCross, ta, tCross, cross));
      if (sb !== tb) segs.push(mk(sb, sCross, tb, tCross, cross));
    }
    return segs;
  }

  // Nearest item entirely on each side of S (left, right, up, down). An item
  // facing S (overlapping it on the other axis) wins over a diagonal one;
  // a diagonal one gets a dashed extension to its edge.
  function neighborSegments(S, items) {
    const s = R(S);
    const best = { left: null, right: null, up: null, down: null };
    const better = (cur, cand) => !cur || (cand.facing && !cur.facing) || (cand.facing === cur.facing && cand.d < cur.d);
    for (const it of items) {
      const t = R(it);
      const ovY = Math.min(s.b, t.b) - Math.max(s.t, t.t) > 0;
      const ovX = Math.min(s.r, t.r) - Math.max(s.l, t.l) > 0;
      const cands = [
        ["right", t.l >= s.r, ovY, t.l - s.r],
        ["left", t.r <= s.l, ovY, s.l - t.r],
        ["down", t.t >= s.b, ovX, t.t - s.b],
        ["up", t.b <= s.t, ovX, s.t - t.b],
      ];
      for (const [k, side, facing, d] of cands) {
        if (!side) continue;
        const cand = { it, d, facing };
        if (better(best[k], cand)) best[k] = cand;
      }
    }
    const segs = [];
    for (const k of ["left", "right"]) if (best[k]) segs.push(...axisSegments(S, best[k].it, "x"));
    for (const k of ["up", "down"]) if (best[k]) segs.push(...axisSegments(S, best[k].it, "y"));
    return { segs, targets: [...new Set(Object.values(best).filter(Boolean).map((b) => b.it))] };
  }

  function topItemAt(items, wx, wy) {
    let hit = null;
    for (const it of items) {
      if (wx < it.x || wx > it.x + it.width || wy < it.y || wy > it.y + it.height) continue;
      if (!hit || it.z > hit.z || (it.z === hit.z && it.order > hit.order)) hit = it;
    }
    return hit;
  }

  // ------------------------------------------------------------ the decision
  function canvasRootAt(x, y) {
    const el = document.elementFromPoint(x, y);
    let root = el && el.closest ? el.closest(CANVAS_ROOT) : null;
    if (!root) {
      for (const r of document.querySelectorAll(CANVAS_ROOT)) {
        const b = r.getBoundingClientRect();
        if (b.width > 0 && b.height > 0 && x >= b.left && x < b.right && y >= b.top && y < b.bottom) {
          root = r;
          break;
        }
      }
    }
    if (!root || !root.isConnected) return null;
    const b = root.getBoundingClientRect();
    if (x < b.left || x >= b.right || y < b.top || y >= b.bottom) return null;
    return root;
  }

  function focusBlocks() {
    const a = document.activeElement;
    if (!a || a === document.body) return false;
    if (a.tagName === "IFRAME") return false; // a storyboard has focus: fine
    const tag = a.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || a.isContentEditable) return true;
    return !!(a.closest && a.closest(".monaco-editor, [contenteditable]:not([contenteditable='false'])"));
  }

  function elementSelected(w) {
    const ctx = w && w.selCtxRef && w.selCtxRef.current;
    if (!ctx || !ctx.selectionActions || typeof ctx.selectionActions.getSnapshot !== "function") return false;
    try {
      const snap = ctx.selectionActions.getSnapshot();
      return !!(snap && snap.elementSelections && snap.elementSelections.length > 0);
    } catch (_) {
      return false;
    }
  }

  // Pure measurement for a client point: no Alt or button checks.
  function computeAt(x, y) {
    const root = canvasRootAt(x, y);
    if (!root) return { reason: "pointer-off-canvas" };
    const w = wiringFor(root, SCAN_THROTTLE_MS);
    if (elementSelected(w)) return { reason: "element-selected", root };
    const view = readView(root, w);
    if (!view) return { reason: "no-view", root };
    const items = readItems(root);
    const selected = items.filter((i) => i.selected);
    if (selected.length === 0) return { reason: "no-selection", root };
    const rb = root.getBoundingClientRect();
    const wx = (x - rb.left - view.x) / view.zoom;
    const wy = (y - rb.top - view.y) / view.zoom;
    const S = unionRect(selected);
    const others = items.filter((i) => !i.selected);
    // The topmost item under the pointer; the selection itself means "neighbors".
    const top = topItemAt(items, wx, wy);
    const hover = top && !top.selected ? top : null;
    let segs;
    let targets;
    let mode;
    if (hover) {
      mode = "hover";
      targets = [hover];
      segs = [...axisSegments(S, hover, "x"), ...axisSegments(S, hover, "y")];
    } else {
      mode = "neighbors";
      ({ segs, targets } = neighborSegments(S, others));
    }
    return { reason: "ok", root, w, view, rb, mode, selection: S, targets, segs };
  }

  // ----------------------------------------------------------------- overlay
  const overlay = { svg: null, host: null, key: "" };

  function overlayHostFor(m) {
    for (const r of (m.w && m.w.optionRefs) || []) {
      try {
        const h = r.current && r.current.getOverlayHost();
        if (h && h.isConnected && m.root.contains(h)) return h;
      } catch (_) {}
    }
    return null;
  }

  function ensureSvg(host) {
    const want = host || document.body;
    if (overlay.svg && overlay.host === want && overlay.svg.isConnected) return overlay.svg;
    if (overlay.svg) overlay.svg.remove();
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "rcsn-measure");
    svg.setAttribute("data-rcsn-measure", "");
    svg.setAttribute("aria-hidden", "true");
    if (!host) svg.classList.add("rcsn-measure--fixed");
    want.appendChild(svg);
    overlay.svg = svg;
    overlay.host = want;
    overlay.key = "";
    return svg;
  }

  function hide() {
    if (overlay.svg) {
      overlay.svg.classList.remove("is-visible");
      overlay.svg.replaceChildren();
      overlay.key = "";
    }
  }

  function el(tag, attrs, parent) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) n.setAttribute(k, String(attrs[k]));
    parent.appendChild(n);
    return n;
  }

  function draw(m) {
    const host = overlayHostFor(m);
    const svg = ensureSvg(host);
    const { view, rb } = m;
    // Client point of a canvas point, then into the svg's own frame.
    let ox = rb.left;
    let oy = rb.top;
    if (host) {
      const hb = host.getBoundingClientRect();
      ox = rb.left - hb.left;
      oy = rb.top - hb.top;
      svg.removeAttribute("style");
    } else {
      svg.setAttribute("style", `left:${rb.left}px;top:${rb.top}px;width:${rb.width}px;height:${rb.height}px`);
      ox = 0;
      oy = 0;
    }
    const sx = (wx) => ox + view.x + wx * view.zoom;
    const sy = (wy) => oy + view.y + wy * view.zoom;
    const P = (v) => Math.round(v * 2) / 2; // crisp 1 px lines

    const lines = [];
    const dashes = [];
    const labels = [];
    const outlines = m.targets.map((t) => ({ x: sx(t.x), y: sy(t.y), w: t.width * view.zoom, h: t.height * view.zoom }));
    for (const s of m.segs) {
      if (s.axis === "x") {
        const y = P(sy(s.cross));
        lines.push({ x1: sx(s.from), y1: y, x2: sx(s.to), y2: y, axis: "x" });
        for (const c of s.connectors) dashes.push({ x1: P(sx(c.at)), y1: sy(c.from), x2: P(sx(c.at)), y2: sy(c.to) });
        labels.push({ cx: (sx(s.from) + sx(s.to)) / 2, cy: y, text: fmt(s.value), len: Math.abs(sx(s.to) - sx(s.from)), axis: "x" });
      } else {
        const x = P(sx(s.cross));
        lines.push({ x1: x, y1: sy(s.from), x2: x, y2: sy(s.to), axis: "y" });
        for (const c of s.connectors) dashes.push({ x1: sx(c.from), y1: P(sy(c.at)), x2: sx(c.to), y2: P(sy(c.at)) });
        labels.push({ cx: x, cy: (sy(s.from) + sy(s.to)) / 2, text: fmt(s.value), len: Math.abs(sy(s.to) - sy(s.from)), axis: "y" });
      }
    }
    const key = JSON.stringify([ox, oy, rb.width, rb.height, outlines, lines, dashes, labels.map((l) => [l.cx, l.cy, l.text])]);
    if (key === overlay.key) return;
    overlay.key = key;
    svg.replaceChildren();
    for (const o of outlines) el("rect", { class: "rcsn-target", x: P(o.x), y: P(o.y), width: Math.max(0, Math.round(o.w)), height: Math.max(0, Math.round(o.h)) }, svg);
    for (const d of dashes) el("line", { class: "rcsn-dash", ...d }, svg);
    for (const l of lines) {
      el("line", { class: "rcsn-line", "data-axis": l.axis, x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 }, svg);
      if (l.axis === "x") {
        el("line", { class: "rcsn-cap", x1: l.x1, y1: l.y1 - CAP, x2: l.x1, y2: l.y1 + CAP }, svg);
        el("line", { class: "rcsn-cap", x1: l.x2, y1: l.y2 - CAP, x2: l.x2, y2: l.y2 + CAP }, svg);
      } else {
        el("line", { class: "rcsn-cap", x1: l.x1 - CAP, y1: l.y1, x2: l.x1 + CAP, y2: l.y1 }, svg);
        el("line", { class: "rcsn-cap", x1: l.x2 - CAP, y1: l.y2, x2: l.x2 + CAP, y2: l.y2 }, svg);
      }
    }
    for (const l of labels) {
      const w = Math.round(l.text.length * LABEL.font * LABEL.charW) + LABEL.padX * 2;
      const h = LABEL.font + LABEL.padY * 2;
      let cx = l.cx;
      let cy = l.cy;
      // A label longer than its segment moves off the line instead of hiding it.
      if (l.axis === "x" && l.len < w + 4) cy -= h / 2 + 4;
      if (l.axis === "y" && l.len < h + 4) cx += w / 2 + 4;
      const g = el("g", { class: "rcsn-label", "data-value": l.text }, svg);
      el("rect", { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: LABEL.radius, ry: LABEL.radius }, g);
      const t = el("text", { x: cx, y: cy, "text-anchor": "middle", "dominant-baseline": "central" }, g);
      t.textContent = l.text;
    }
    svg.classList.add("is-visible");
  }

  function publicMeasure(m) {
    if (!m || m.reason !== "ok") return { t: Date.now(), reason: m ? m.reason : "none" };
    return {
      t: Date.now(),
      reason: "ok",
      mode: m.mode,
      zoom: m.view.zoom,
      selection: { ...m.selection },
      targets: m.targets.map((t) => t.id),
      distances: m.segs.map((s) => ({ axis: s.axis, value: Math.round(s.value * 10) / 10, from: s.from, to: s.to })),
    };
  }

  function update() {
    state.raf = 0;
    const p = state.pointer;
    let m = null;
    if (!state.enabled) m = { reason: "disabled" };
    else if (!state.alt) m = { reason: "no-alt" };
    else if (state.buttons) m = { reason: "button-down" };
    else if (!p) m = { reason: "no-pointer" };
    else if (focusBlocks()) m = { reason: "focus" };
    else {
      try {
        m = computeAt(p.x, p.y);
      } catch (err) {
        m = { reason: "error" };
        console.warn("[canvas-snap] measure failed", err);
      }
    }
    if (m.reason === "ok") {
      draw(m);
      state.lastMeasure = publicMeasure(m);
    } else {
      hide();
      if (state.alt || !state.lastMeasure || state.lastMeasure.reason === "ok") state.lastMeasure = publicMeasure(m);
    }
    // While Alt is held, follow pans, zooms and selection changes.
    if (state.alt && state.enabled) schedule();
  }

  function schedule() {
    if (!state.raf) state.raf = requestAnimationFrame(update);
  }

  // ---------------------------------------------------------------- input
  function setAlt(v) {
    if (v === state.alt) return;
    state.alt = v;
    schedule();
  }

  function readAlt(e) {
    if (typeof e.getModifierState === "function") return e.getModifierState("Alt");
    return e.altKey === true;
  }

  function onPointer(x, y, e) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    state.pointer = { x, y };
    if (typeof e.buttons === "number") state.buttons = e.buttons;
    if (e.type === "pointerdown") state.buttons = state.buttons || 1;
    if (e.type === "pointerup" || e.type === "pointercancel") state.buttons = 0;
    setAlt(readAlt(e));
    if (state.alt || overlay.key) schedule();
  }

  function onHostPointer(e) {
    if (e.type === "pointerdown") readFlagLive();
    onPointer(e.clientX, e.clientY, e);
    scanFrames(false);
  }

  function onKey(e) {
    if (e.key === "Alt") setAlt(e.type === "keydown");
    else setAlt(readAlt(e));
  }

  function onBlur() {
    state.alt = false;
    state.buttons = 0;
    schedule();
  }

  function onHostMouseOut(e) {
    if (e.relatedTarget) return;
    const x = e.clientX;
    const y = e.clientY;
    if (x <= 0 || y <= 0 || x >= window.innerWidth - 1 || y >= window.innerHeight - 1) {
      state.pointer = null;
      schedule();
    }
  }

  // Same-origin storyboard iframes: pointer (mapped to host px) and Alt.
  const hookedDocs = new WeakSet();
  let lastFrameScan = 0;
  function scanFrames(force) {
    const now = Date.now();
    if (!force && now - lastFrameScan < FRAME_SCAN_MS) return;
    lastFrameScan = now;
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
      onPointer(r.left + (e.clientX * r.width) / iw, r.top + (e.clientY * r.height) / ih, e);
    };
    try {
      for (const t of ["pointermove", "pointerdown", "pointerup", "pointercancel"]) doc.addEventListener(t, onMove, { capture: true, passive: true });
      doc.addEventListener("keydown", onKey, { capture: true, passive: true });
      doc.addEventListener("keyup", onKey, { capture: true, passive: true });
    } catch (_) {}
  }

  // ------------------------------------------------------------- enable flag
  function setEnabled(v, persist) {
    v = !!v;
    if (persist) writeStore(FLAG_KEY, v ? null : "off");
    if (v === state.enabled) return;
    state.enabled = v;
    if (!v) hide();
    schedule();
  }
  function readFlagLive() {
    const on = readStore(FLAG_KEY) !== "off";
    if (on !== state.enabled) setEnabled(on, false);
  }

  // --------------------------------------------------------------- listeners
  const opt = { capture: true, passive: true };
  for (const t of ["pointermove", "pointerdown", "pointerup", "pointercancel"]) window.addEventListener(t, onHostPointer, opt);
  window.addEventListener("keydown", onKey, opt);
  window.addEventListener("keyup", onKey, opt);
  window.addEventListener("wheel", () => (state.alt ? schedule() : 0), opt);
  window.addEventListener("blur", onBlur);
  document.addEventListener("mouseout", onHostMouseOut, opt);
  document.addEventListener("visibilitychange", () => (document.hidden ? onBlur() : 0));

  // ---------------------------------------------------------- debug API
  window.__RE_TEMPO_CANVAS_SNAP__ = {
    get enabled() {
      return state.enabled;
    },
    set enabled(v) {
      setEnabled(v, true);
    },
    get alt() {
      return state.alt;
    },
    get lastMeasure() {
      return state.lastMeasure ? JSON.parse(JSON.stringify(state.lastMeasure)) : null;
    },
    status() {
      let nativeSnap = null;
      try {
        const vc = window.tempoDebug && window.tempoDebug.viewControls;
        if (vc && typeof vc.isSnapEnabled === "function") nativeSnap = !!vc.isSnapEnabled();
      } catch (_) {}
      let hooks = 0;
      for (const r of document.querySelectorAll(CANVAS_ROOT)) {
        const w = wiringCache.get(r);
        if (w) hooks += w.optionRefs.length;
      }
      return {
        enabled: state.enabled,
        nativeSnapEnabled: nativeSnap, // the app's own toggle (snap stays native)
        snapHooksSeen: hooks, // read only, used to find the overlay host
        roots: document.querySelectorAll(CANVAS_ROOT).length,
        overlayHost: overlay.svg ? (overlay.host === document.body ? "body" : "app-overlay-host") : null,
      };
    },
    // Measurement for a client point as if Alt were held (draws nothing).
    measureAt(x, y) {
      return publicMeasure(computeAt(x, y));
    },
    // Re-walk the fiber chain of every canvas root (read only).
    rescan() {
      let n = 0;
      for (const r of document.querySelectorAll(CANVAS_ROOT)) n += scanWiring(r).optionRefs.length;
      return n;
    },
  };
})();
