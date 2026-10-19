/*
 * RE-TEMPO · canvas-props (user MOD layer)
 * ---------------------------------------------------------------------------
 * pen.dev's properties panel for the canvas nodes the mods add (pen.dev:
 * "manual edits without spending tokens"). When a browser frame
 * (canvas-browser), a shader frame (canvas-shader) or a note (canvas-notes)
 * is selected, the canvas's right panel shows, before Effects, pen's
 * sections for it:
 *   node header   type icon + editable name + type label
 *   Position      X, Y
 *   Dimensions    W, H, aspect ratio lock
 *   Appearance    opacity (%), corner radius, clip content
 *   Browser       URL, "name follows the page title", Reload, Open in browser
 *   Shader        preset, speed, "Edit GLSL" (the shader's own GLSL editor)
 *   Note          type (Prompt / Note), model and effort, text
 * With nothing of ours selected nothing is added (the app's own sections stay
 * as they are).
 *
 * Fields (as in Figma / pen.dev): drag a numeric field's label sideways to
 * scrub its value (1 unit per px, Shift x10; speed 0.01 per px); ArrowUp /
 * ArrowDown step it (Shift x10); typing accepts arithmetic ("120+40",
 * "w/2" is not: numbers and + - * / ( ) only); Enter commits, Escape cancels
 * (back to the value the field had when it was focused or last committed,
 * arrow steps included) and leaves the field; leaving it commits. The lock keeps W / H in the ratio they had when the
 * edit started (per node, for this session).
 *
 * Writes: every edit goes through window.__RE_TEMPO_CANVAS_NODES__.upsert({id,
 * canvasPath, workspacePath, ...fields}) (feature/canvas-nodes.js), so it is
 * written into the node in <canvasPath>/index.canvas.tsx and handed to the
 * owning mod, which redraws the frame. Live edits (scrub, arrows) are
 * debounced 150 ms with a 150 ms max wait (at most one write per 150 ms while
 * the value keeps changing, the last value always written); one upsert per
 * node is in flight at a time (canvas-nodes compares the node after its
 * write, so two at once would report a false conflict). Fields:
 *   x, y, w, h (canvas units; W / H clamped to the owning mod's minimum:
 *     browser 320 x 200, shader 64 x 64, note 250 x 120)
 *   title (browser: + titled; an empty name follows the page title)
 *   opacity 0..1, radius (px), clip (boolean): new fields, kept by
 *     canvas-nodes for every type (unknown fields are preserved) and drawn by
 *     this mod on the frame's content box (.rtbf-win, .rtsh-body, .rtcn-card:
 *     opacity, border-radius, overflow). Defaults: 1, 16 (the mods' CSS),
 *     true. The frame's name label and selection outline are not faded.
 *   browser: url (normalized by canvas-browser's normalizeUrl)
 *   shader: preset (+ uniforms reset to {}, and glsl set to the new preset's
 *     source when the node had its own GLSL, as canvas-shader's setPreset
 *     does), speed 0..4
 *   note: kind ("prompt" | "note"), text
 * A note's model and effort show the card's pick (its own, else the
 * composer's); Model / Effort open the card's own pickers
 * ([data-rtcn-menu-trigger="model" | "effort"]), which keep the model list
 * and levels and write modelId / model / effortId / effort. Reload and Open
 * in browser press the frame's own bar buttons, Edit GLSL calls
 * canvas-shader's openEditor(id).
 *
 * Undo: ui-drive's registry undo is the agent actions' (toast, approval), not
 * a manual edit history, and the app's canvas undo does not know these nodes,
 * so this mod keeps its own: Cmd+Z / Cmd+Shift+Z (Ctrl on other systems), 20
 * steps, while one of our nodes is selected or focus is in the panel (a
 * text field with uncommitted typing keeps the native text undo). Undo picks
 * the latest step of the selected node. Steps of the same field made within
 * 1 s with the arrows are merged.
 *
 * Selection: the mods mark the selected frame with [data-selected]
 * (.rtbf-frame[data-rtbf-id], .rtsh-frame[data-rtsh-id], .rtcn-note
 * [data-rtcn-id]); the most recently selected one wins. The mods deselect on
 * any pointerdown outside their frames except their toasts, so this panel's
 * nodes carry data-rtbf-toast, data-rtsh-toast and data-rtcn-toast (those
 * attributes are only read by that closest() test): clicking in the panel
 * keeps the selection. Input on the panel's nodes stops there (they have no
 * React fiber, React would hand it to the panel's app ancestors).
 *
 * Placement: window.__RE_TEMPO_CANVAS_CHROME__.registerRightSection when it
 * exists (now or on "rtd:canvas-chrome-ready"): one section per part,
 * {id: "canvas-props-<part>", label, order, when(ctx), render(body, ctx)}
 * in pen's order as one block, orders 26..31 (see PARTS: before the
 * canvas-level section at 40, before Effects at 110); when(ctx) is true only
 * for the shell that holds the selected node. A chrome whose enabled is false
 * (its flag off) counts as absent. Otherwise the parts go into the design
 * tab body of the right panel nearest to the canvas ([data-testid=
 * "canvas-right-panel"] [data-testid="canvas-design-tab"] .overflow-auto),
 * prepended, CSS order -1, like canvas-export's fallback (which appends).
 * Without canvas-nodes (localStorage mode of the mods) the panel stays off.
 * Flag: localStorage "rtd.canvasProps" = "off" (checked live) removes the
 * panel, the chrome sections and the appearance styles.
 * Introspection: window.__RE_TEMPO_CANVAS_PROPS__ (state(), selected(),
 * set(field, value), undo(), redo(), flush(), sync(), dispose()).
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (window.__RE_TEMPO_CANVAS_PROPS__) return; // double injection

  // ------------------------------------------------------------------ config
  const VERSION = 1;
  const FLAG_KEY = "rtd.canvasProps";
  const CANVAS_ROOT = "[data-canvas-root]";
  const RIGHT_PANEL = '[data-testid="canvas-right-panel"]';
  const DESIGN_TAB = '[data-testid="canvas-design-tab"]';
  const DEBOUNCE_MS = 150;
  const MAX_WAIT_MS = 150;
  const UNDO_MAX = 20;
  const COALESCE_MS = 1000;
  const SYNC_MS = 500;
  const DRAG_SLOP = 2;
  const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
  // The mods' "click here keeps the selection" markers (see the header).
  const KEEP_ATTRS = ["data-rtbf-toast", "data-rtsh-toast", "data-rtcn-toast"];
  const TYPES = {
    browser: { sel: ".rtbf-frame", idAttr: "data-rtbf-id", content: ".rtbf-win", label: "Browser", icon: "globe", minW: 320, minH: 200, radius: 16, api: "__RE_TEMPO_CANVAS_BROWSER__" },
    shader: { sel: ".rtsh-frame", idAttr: "data-rtsh-id", content: ".rtsh-body", label: "Shader", icon: "sparkles", minW: 64, minH: 64, radius: 16, api: "__RE_TEMPO_CANVAS_SHADER__" },
    note: { sel: ".rtcn-note", idAttr: "data-rtcn-id", content: ".rtcn-card", label: "Note", icon: "note", minW: 250, minH: 120, radius: 16, api: "__RE_TEMPO_CANVAS_NOTES__" },
  };
  const TYPE_KEYS = Object.keys(TYPES);
  const ALL_FRAMES = TYPE_KEYS.map((t) => TYPES[t].sel).join(", ");
  const SELECTED_Q = TYPE_KEYS.map((t) => TYPES[t].sel + "[data-selected]").join(", ");
  const SHADER_PRESETS = [
    ["mesh", "Mesh gradient"],
    ["grain", "Grain gradient"],
    ["fluid", "Fluid noise"],
    ["waves", "Waves"],
    ["aurora", "Aurora"],
    ["glass", "Glass"],
    ["halftone", "Halftone"],
    ["particles", "Particles"],
  ];
  // Chrome sections in pen.dev's order, as one block: canvas-chrome's CSS
  // gives the canvas-level section (shown while the app has no selection, so
  // while one of ours is selected) order 40, unknown children 35 and the
  // spacer 999; ORDER.position (50) would put "Canvas" between our header and
  // the rest. 26..31 sit after createComponent / context / alignment (10..30,
  // all for app selections) and well before Effects (110).
  const PARTS = [
    { part: "node", label: "", order: 26 },
    { part: "position", label: "Position", order: 27 },
    { part: "dimensions", label: "Dimensions", order: 28 },
    { part: "appearance", label: "Appearance", order: 29 },
    { part: "browser", label: "Browser", order: 31, type: "browser" },
    { part: "shader", label: "Shader", order: 31, type: "shader" },
    { part: "note", label: "Note", order: 31, type: "note" },
  ];

  const state = {
    enabled: true,
    sel: null, // {type, id, el, root, ws, cp, key}
    mode: "inject", // "inject" | "chrome"
    chrome: null,
    chromeTried: null,
    chromeOffs: [],
    nodesDirty: true,
    framesSig: "",
    error: null,
    undo: [],
    redo: [],
    locks: new Map(), // node key -> bool
    counts: { writes: 0, errors: 0, undos: 0, redos: 0, syncs: 0 },
    lastWriteAt: 0,
  };
  const selAt = new WeakMap(); // frame element -> selection sequence
  let selSeq = 0;
  const stamped = new WeakSet(); // frame elements appearance was applied to

  // ---------------------------------------------------------------- helpers
  const ls = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch (_) {
        return null;
      }
    },
  };
  const flagOn = () => ls.get(FLAG_KEY) !== "off";
  const fin = (v) => typeof v === "number" && Number.isFinite(v);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const round = (v, d) => {
    const p = Math.pow(10, d || 0);
    return Math.round(v * p) / p;
  };
  const warn = (...a) => {
    try {
      console.warn("[canvas-props]", ...a);
    } catch (_) {}
  };
  const errText = (e) => (e && e.message) || String(e);
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
  const nodesApi = () => {
    const n = window.__RE_TEMPO_CANVAS_NODES__;
    return n && typeof n.upsert === "function" && typeof n.list === "function" && (typeof n.available !== "function" || n.available()) ? n : null;
  };
  const modApi = (type) => window[TYPES[type].api] || null;
  const keyOf = (ws, cp, id) => (ws || "") + "\0" + (cp || "") + "\0" + id;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
    sparkles:
      '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
    note: '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    unlock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    reload: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
    radius: '<path d="M21 11a8 8 0 0 0-8-8"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
    opacity: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
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
    s.innerHTML = ICONS[name] || "";
    return s;
  }

  // Numbers and + - * / ( ) only; NaN otherwise (no eval: the renderer's CSP).
  function evalExpr(raw) {
    const src = String(raw == null ? "" : raw)
      .replace(/,/g, ".")
      .replace(/px|%|°/gi, "")
      .replace(/\s+/g, "");
    if (!src || !/^[0-9+\-*/().]+$/.test(src)) return NaN;
    let i = 0;
    const factor = () => {
      const c = src[i];
      if (c === "-") return i++, -factor();
      if (c === "+") return i++, factor();
      if (c === "(") {
        i++;
        const v = expr();
        if (src[i] !== ")") throw new Error("paren");
        i++;
        return v;
      }
      const m = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i));
      if (!m) throw new Error("number");
      i += m[0].length;
      return parseFloat(m[0]);
    };
    const term = () => {
      let v = factor();
      while (src[i] === "*" || src[i] === "/") {
        const op = src[i++];
        const r = factor();
        v = op === "*" ? v * r : v / r;
      }
      return v;
    };
    const expr = () => {
      let v = term();
      while (src[i] === "+" || src[i] === "-") {
        const op = src[i++];
        const r = term();
        v = op === "+" ? v + r : v - r;
      }
      return v;
    };
    try {
      const v = expr();
      return i === src.length && Number.isFinite(v) ? v : NaN;
    } catch (_) {
      return NaN;
    }
  }

  // --------------------------------------------------------------- canvases
  const refCache = new WeakMap(); // canvas root -> {canvasPath, workspacePath}
  function refOfRoot(root) {
    if (!root) return null;
    let r = refCache.get(root);
    if (r && r.canvasPath) return r;
    const N = window.__RE_TEMPO_CANVAS_NODES__;
    r = N && typeof N.refOf === "function" ? N.refOf(root) : null;
    if (r && r.canvasPath) refCache.set(root, r);
    return r;
  }
  const typeOfEl = (el) => TYPE_KEYS.find((t) => el.matches(TYPES[t].sel)) || null;
  const idOfEl = (el, type) => el.getAttribute(TYPES[type].idAttr);

  // The node as stored, plus the edits not written yet.
  function storedNode(sel) {
    const N = nodesApi();
    if (!N || !sel) return null;
    let list = [];
    try {
      list = N.list(sel.cp, sel.ws || undefined) || [];
    } catch (_) {
      list = [];
    }
    return list.find((n) => n.id === sel.id) || null;
  }
  // Stored nodes by node key, dropped on every canvas-nodes change and after
  // each of our writes (a field keeps the target it got on focus; the node
  // must not be the one seen then).
  const nodeCache = new Map();
  function invalidateNodes() {
    nodeCache.clear();
    state.nodesDirty = true;
  }
  function baseNode(t) {
    if (nodeCache.has(t.key)) return nodeCache.get(t.key);
    const n = storedNode(t);
    if (n) nodeCache.set(t.key, n);
    return n;
  }
  function viewOf(t) {
    if (!t) return null;
    const base = baseNode(t);
    if (!base) return null;
    const w = writers.get(t.key);
    return w ? { ...base, ...w.inflight, ...w.patch } : { ...base };
  }

  // --------------------------------------------------------------- selection
  function currentSelection() {
    if (!nodesApi()) return null;
    let best = null;
    let bestAt = -1;
    for (const el of document.querySelectorAll(SELECTED_Q)) {
      if (!isShown(el)) continue;
      const at = selAt.get(el) || 0;
      if (at > bestAt) {
        best = el;
        bestAt = at;
      }
    }
    if (!best) return null;
    const type = typeOfEl(best);
    const id = type && idOfEl(best, type);
    const root = best.closest(CANVAS_ROOT);
    const ref = refOfRoot(root);
    if (!type || !id || !ref || !ref.canvasPath) return null;
    const ws = ref.workspacePath || "";
    const cp = ref.canvasPath;
    const s = state.sel;
    if (s && s.el === best && s.id === id) return s;
    return { type, id, el: best, root, ws, cp, key: keyOf(ws, cp, id) };
  }

  // ---------------------------------------------------------------- writes
  // One writer per node: pending patch (debounced), one upsert in flight.
  const writers = new Map();
  function writerOf(t) {
    let w = writers.get(t.key);
    if (!w) {
      w = { key: t.key, id: t.id, ws: t.ws, cp: t.cp, patch: {}, inflight: null, promise: null, timer: 0, firstAt: 0, waiters: [] };
      writers.set(t.key, w);
    }
    return w;
  }
  // now: write at once; otherwise debounced with a max wait.
  function queue(t, patch, now) {
    const w = writerOf(t);
    if (!Object.keys(w.patch).length) w.firstAt = Date.now();
    Object.assign(w.patch, patch);
    clearTimeout(w.timer);
    w.timer = 0;
    const p = new Promise((resolve) => w.waiters.push(resolve));
    if (now) flushWriter(w);
    else {
      const wait = Math.max(0, Math.min(DEBOUNCE_MS, w.firstAt + MAX_WAIT_MS - Date.now()));
      w.timer = setTimeout(() => {
        w.timer = 0;
        flushWriter(w);
      }, wait);
    }
    applyAppearanceFor(t);
    return p;
  }
  function flushWriter(w) {
    clearTimeout(w.timer);
    w.timer = 0;
    if (w.promise) return w.promise; // the next one goes when it settles
    const patch = w.patch;
    if (!Object.keys(patch).length) {
      for (const r of w.waiters.splice(0)) r(true);
      return Promise.resolve(true);
    }
    w.patch = {};
    w.firstAt = 0;
    w.inflight = patch;
    const N = nodesApi();
    const waiters = w.waiters.splice(0);
    w.promise = (async () => {
      let ok = false;
      try {
        if (!N) throw new Error("the canvas file is not available (canvas-nodes)");
        await N.upsert({ id: w.id, canvasPath: w.cp, ...(w.ws ? { workspacePath: w.ws } : {}), ...patch });
        state.counts.writes++;
        state.lastWriteAt = Date.now();
        setError(null);
        ok = true;
      } catch (e) {
        state.counts.errors++;
        setError("Couldn't save: " + errText(e));
        warn("upsert", errText(e));
      }
      w.inflight = null;
      w.promise = null;
      invalidateNodes();
      for (const r of waiters) r(ok);
      if (Object.keys(w.patch).length) {
        if (!w.timer) flushWriter(w);
      } else {
        for (const r of w.waiters.splice(0)) r(ok);
        if (!w.timer) writers.delete(w.key);
      }
      schedule();
      return ok;
    })();
    return w.promise;
  }
  async function flushAll() {
    const all = [];
    for (const w of writers.values()) all.push(flushWriter(w));
    await Promise.all(all);
    // a write queued while another was in flight
    if (Array.from(writers.values()).some((w) => w.promise || Object.keys(w.patch).length)) return flushAll();
    return true;
  }

  // ------------------------------------------------------------------ undo
  function pushUndo(t, before, after, coalesce) {
    if (same(before, after)) return;
    const top = state.undo[state.undo.length - 1];
    if (coalesce && top && top.coalesce === coalesce && top.key === t.key && Date.now() - top.at < COALESCE_MS) {
      Object.assign(top.after, after);
      for (const k of Object.keys(after)) if (!(k in top.before)) top.before[k] = before[k];
      top.at = Date.now();
    } else {
      state.undo.push({ key: t.key, id: t.id, ws: t.ws, cp: t.cp, type: t.type, before: { ...before }, after: { ...after }, at: Date.now(), coalesce: coalesce || null });
      if (state.undo.length > UNDO_MAX) state.undo.splice(0, state.undo.length - UNDO_MAX);
    }
    state.redo = state.redo.filter((e) => e.key !== t.key);
  }
  function stepFor(stack, key) {
    for (let i = stack.length - 1; i >= 0; i--) if (!key || stack[i].key === key) return i;
    return -1;
  }
  function undoRedo(dir) {
    const from = dir === "undo" ? state.undo : state.redo;
    const to = dir === "undo" ? state.redo : state.undo;
    const i = stepFor(from, state.sel ? state.sel.key : null);
    if (i < 0) return false;
    const [e] = from.splice(i, 1);
    to.push({ ...e, at: 0, coalesce: null });
    if (to.length > UNDO_MAX) to.splice(0, to.length - UNDO_MAX);
    state.counts[dir === "undo" ? "undos" : "redos"]++;
    commitActive(false);
    queue(e, dir === "undo" ? e.before : e.after, true);
    refreshFields(true);
    return true;
  }

  // Fields an edit touches, as they are now (absent ones at their default).
  function defaultsFor(type) {
    return { opacity: 1, radius: TYPES[type].radius, clip: true, title: "", titled: false, speed: 1, uniforms: {} };
  }
  function pick(view, keys, type) {
    const d = defaultsFor(type);
    const out = {};
    for (const k of keys) out[k] = view && k in view ? view[k] : k in d ? d[k] : null;
    return out;
  }
  // A one-step edit: write at once, one undo step.
  function commit(t, patch, coalesce) {
    const view = viewOf(t);
    if (!view) return Promise.resolve(false);
    const before = pick(view, Object.keys(patch), t.type);
    if (same(before, patch)) return Promise.resolve(true);
    pushUndo(t, before, patch, coalesce);
    const p = queue(t, patch, true);
    refreshFields(false);
    return p;
  }

  // ------------------------------------------------------------ appearance
  function styleContent(el, type, v) {
    const c = el.querySelector(":scope > " + TYPES[type].content) || el.querySelector(TYPES[type].content);
    if (!c) return;
    const op = v && fin(v.opacity) ? clamp(v.opacity, 0, 1) : 1;
    const r = v && fin(v.radius) ? Math.max(0, v.radius) : null;
    const clip = v && typeof v.clip === "boolean" ? v.clip : true;
    const want = { opacity: op === 1 ? "" : String(op), borderRadius: r == null ? "" : r + "px", overflow: clip ? "" : "visible" };
    let any = false;
    for (const [k, val] of Object.entries(want)) {
      if (c.style[k] !== val) c.style[k] = val;
      if (val) any = true;
    }
    if (any) c.setAttribute("data-rtcp-styled", "");
    else c.removeAttribute("data-rtcp-styled");
  }
  function applyAppearanceAll(force) {
    const frames = Array.from(document.querySelectorAll(ALL_FRAMES));
    const fresh = frames.some((el) => !stamped.has(el));
    if (!force && !fresh && !state.nodesDirty) return;
    const N = nodesApi();
    if (!N) return;
    const byRoot = new Map();
    for (const el of frames) {
      const type = typeOfEl(el);
      const id = type && idOfEl(el, type);
      const root = el.closest(CANVAS_ROOT);
      if (!id || !root) continue;
      let map = byRoot.get(root);
      if (!map) {
        map = new Map();
        const ref = refOfRoot(root);
        if (ref && ref.canvasPath) {
          let list = [];
          try {
            list = N.list(ref.canvasPath, ref.workspacePath || undefined) || [];
          } catch (_) {}
          for (const n of list) map.set(n.id, n);
          map.ref = ref;
        }
        byRoot.set(root, map);
      }
      let v = map.get(id) || null;
      if (map.ref) {
        const w = writers.get(keyOf(map.ref.workspacePath || "", map.ref.canvasPath, id));
        if (w) v = { ...(v || {}), ...w.inflight, ...w.patch };
      }
      styleContent(el, type, v);
      stamped.add(el);
    }
  }
  function applyAppearanceFor(t) {
    const sel = TYPES[t.type] ? TYPES[t.type].sel + `[${TYPES[t.type].idAttr}="${CSS.escape(t.id)}"]` : null;
    if (!sel) return;
    for (const el of document.querySelectorAll(sel)) {
      const root = el.closest(CANVAS_ROOT);
      const ref = refOfRoot(root);
      if (!ref || ref.canvasPath !== t.cp) continue;
      const w = writers.get(t.key);
      styleContent(el, t.type, { ...(baseNode(t) || {}), ...(w ? { ...w.inflight, ...w.patch } : {}) });
    }
  }
  function clearAppearance() {
    for (const c of document.querySelectorAll("[data-rtcp-styled]")) {
      c.style.opacity = "";
      c.style.borderRadius = "";
      c.style.overflow = "";
      c.removeAttribute("data-rtcp-styled");
    }
  }

  // -------------------------------------------------------------------- UI
  const ui = { built: false, wrap: null, parts: {}, fields: [], active: null };
  // Input on our nodes stops at them (see the header); keys with Cmd/Ctrl go
  // on (the app's shortcuts; Cmd+Z is caught on window first).
  function guard(el) {
    for (const a of KEEP_ATTRS) el.setAttribute(a, "");
    el.setAttribute("data-rtcp-root", "");
    if (el.__rtcpGuard) return;
    el.__rtcpGuard = true;
    for (const type of ["pointerdown", "mousedown", "click", "dblclick", "contextmenu", "keyup", "keypress", "paste", "copy", "cut", "input", "change"]) el.addEventListener(type, (e) => e.stopPropagation());
    el.addEventListener("keydown", (e) => {
      if (!e.metaKey && !e.ctrlKey) e.stopPropagation();
    });
  }
  function shell(part, title) {
    const head = h("div", { class: "rtcp-head", "data-section-header": "canvas-props-" + part }, h("span", { class: "rtcp-title", text: title }));
    const body = h("div", { class: "rtcp-body" });
    const s = h("div", { class: "rtcp-section", "data-rtcp-section": part, "data-section": "canvas-props-" + part, role: "group", "aria-label": title || "Node" }, title ? head : null, body);
    return { shell: s, head, body };
  }

  // Focus selects the whole value (Figma); a mouse focus would put the caret
  // back on mouseup, so that one mouseup keeps the selection.
  function selectAll(input) {
    input.select();
    const up = (e) => {
      if (input.selectionStart === input.selectionEnd && document.activeElement === input) {
        e.preventDefault();
        input.select();
      }
    };
    input.addEventListener("mouseup", up, { once: true });
    setTimeout(() => input.removeEventListener("mouseup", up), 600);
  }

  // A numeric field: label (scrub handle) + input. spec: {name, label | glyph,
  // unit, min(type), max(type), step, rate, dec, read(view, type), patch(v,
  // view, type, start) -> fields}
  function numField(spec) {
    const lab = h("span", { class: "rtcp-num-label", "data-rtcp-scrub": spec.name, title: spec.title || null }, spec.glyph ? icon(spec.glyph, "rtcp-ic") : spec.label);
    const input = h("input", { class: "rtcp-num-input", type: "text", inputmode: "decimal", spellcheck: "false", autocomplete: "off", "aria-label": spec.aria || spec.label, "data-rtcp-field": spec.name });
    const unit = spec.unit ? h("span", { class: "rtcp-num-unit", text: spec.unit }) : null;
    // a div, not a label: a label would focus the input after every scrub
    const el = h("div", { class: "rtcp-num", "data-rtcp-num": spec.name }, lab, input, unit);
    el.addEventListener("click", (e) => {
      if (e.target === el || e.target === unit) input.focus();
    });
    const f = { spec, el, input, lab, kind: "num", target: null, start: null, startText: "", focused: false, scrub: null, dirty: false };
    const fmt = (v) => (v == null || !Number.isFinite(v) ? "" : String(round(v, spec.dec || 0)));
    const lim = (v, type) => {
      const mn = typeof spec.min === "function" ? spec.min(type) : spec.min;
      const mx = typeof spec.max === "function" ? spec.max(type) : spec.max;
      return clamp(round(v, spec.dec || 0), mn == null ? -1e7 : mn, mx == null ? 1e7 : mx);
    };
    f.read = (view, type) => spec.read(view, type);
    f.show = (view, type) => {
      if (f.focused || f.scrub) return;
      const t = fmt(f.read(view, type));
      if (input.value !== t) input.value = t;
    };
    const begin = () => {
      const t = state.sel;
      if (!t) return null;
      const view = viewOf(t);
      if (!view) return null;
      return { t, view, value: f.read(view, t.type) };
    };
    // A value for this field -> the fields written (W / H with the lock).
    const patchFor = (g, v) => spec.patch(lim(v, g.t.type), g.view, g.t.type);
    f.live = (g, v) => {
      const p = patchFor(g, v);
      queue(g.t, p, false);
      input.value = fmt(f.read({ ...g.view, ...p }, g.t.type));
      refreshFields(false, f);
      return p;
    };
    input.addEventListener("focus", () => {
      f.focused = true;
      f.dirty = false;
      ui.active = f;
      const g = begin();
      f.target = g;
      f.startText = input.value;
      f.arrowBefore = null;
      selectAll(input);
    });
    input.addEventListener("input", () => {
      f.dirty = input.value !== f.startText;
    });
    f.commit = (keepFocus) => {
      const g = f.target;
      f.dirty = false;
      if (!g) return;
      const v = evalExpr(input.value);
      if (!Number.isFinite(v)) {
        input.value = f.startText;
        return;
      }
      const p = patchFor(g, v);
      commit(g.t, p);
      g.view = { ...g.view, ...p };
      // Enter ends the arrow run too: Escape now goes back to this value
      g.value = f.read(g.view, g.t.type);
      f.arrowBefore = null;
      input.value = fmt(g.value);
      f.startText = input.value;
      if (keepFocus) input.select();
    };
    f.cancel = () => {
      const g = f.target;
      f.dirty = false;
      if (g && f.arrowBefore) {
        // arrows already wrote: back to the value at focus
        queue(g.t, f.arrowBefore, true);
        state.undo = state.undo.filter((e) => !(e.coalesce === "arrow:" + spec.name && e.key === g.t.key && e.at >= f.focusAt));
        f.arrowBefore = null;
      }
      input.value = g ? fmt(g.value) : f.startText;
      f.startText = input.value;
      f.cancelled = true;
      input.blur();
    };
    input.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "Enter") {
        e.preventDefault();
        f.commit(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        f.cancel();
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const g = f.target;
        if (!g) return;
        const typed = evalExpr(input.value);
        const cur = Number.isFinite(typed) ? typed : f.read(g.view, g.t.type);
        const step = (spec.step || 1) * (e.shiftKey ? 10 : 1) * (e.key === "ArrowUp" ? 1 : -1);
        const p = patchFor(g, cur + step);
        if (!f.arrowBefore) {
          f.arrowBefore = pick(g.view, Object.keys(p), g.t.type);
          f.focusAt = Date.now();
        }
        pushUndo(g.t, pick(g.view, Object.keys(p), g.t.type), p, "arrow:" + spec.name);
        queue(g.t, p, false);
        g.view = { ...g.view, ...p };
        input.value = fmt(f.read(g.view, g.t.type));
        f.startText = input.value;
        f.dirty = false;
        refreshFields(false, f);
      }
    });
    input.addEventListener("blur", () => {
      if (!f.cancelled && f.dirty) f.commit(false);
      f.cancelled = false;
      f.focused = false;
      f.dirty = false;
      f.target = null;
      if (ui.active === f) ui.active = null;
      const w = state.sel && writers.get(state.sel.key);
      if (w && !w.promise) flushWriter(w);
      refreshFields(true);
    });
    // Scrub: drag the label sideways.
    lab.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const g = begin();
      if (!g) return;
      e.preventDefault();
      if (f.focused) input.blur();
      f.scrub = { g, x: e.clientX, moved: false, id: e.pointerId, last: null, start: g.value };
      try {
        lab.setPointerCapture(e.pointerId);
      } catch (_) {}
    });
    lab.addEventListener("pointermove", (e) => {
      const s = f.scrub;
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x;
      if (!s.moved && Math.abs(dx) < DRAG_SLOP) return;
      if (!s.moved) {
        s.moved = true;
        document.documentElement.setAttribute("data-rtcp-scrubbing", "");
      }
      const rate = (spec.rate || 1) * (e.shiftKey ? 10 : 1);
      s.last = f.live(s.g, s.start + dx * rate);
    });
    const endScrub = (e) => {
      const s = f.scrub;
      if (!s || (e && e.pointerId !== s.id)) return;
      f.scrub = null;
      document.documentElement.removeAttribute("data-rtcp-scrubbing");
      try {
        lab.releasePointerCapture(s.id);
      } catch (_) {}
      if (!s.moved) {
        input.focus();
        return;
      }
      if (s.last) {
        pushUndo(s.g.t, pick(s.g.view, Object.keys(s.last), s.g.t.type), s.last);
        const w = writers.get(s.g.t.key);
        if (w) flushWriter(w);
      }
      refreshFields(true);
    };
    lab.addEventListener("pointerup", endScrub);
    lab.addEventListener("pointercancel", endScrub);
    lab.addEventListener("lostpointercapture", endScrub);
    ui.fields.push(f);
    return f;
  }

  // A text field (input or textarea): commit on Enter (Cmd+Enter in a
  // textarea) or leave, Escape cancels.
  function textField(spec) {
    const multi = !!spec.multiline;
    const input = h(multi ? "textarea" : "input", {
      class: multi ? "rtcp-textarea" : spec.cls || "rtcp-text",
      type: multi ? null : "text",
      spellcheck: "false",
      autocomplete: "off",
      autocapitalize: spec.url ? "none" : null,
      inputmode: spec.url ? "url" : null,
      placeholder: spec.placeholder || null,
      "aria-label": spec.aria,
      "data-rtcp-field": spec.name,
      rows: multi ? "5" : null,
      maxlength: spec.max ? String(spec.max) : null,
    });
    const f = { spec, el: input, input, kind: "text", target: null, startText: "", focused: false, dirty: false };
    f.show = (view, type) => {
      if (f.focused) return;
      const t = spec.read(view, type);
      if (input.value !== t) input.value = t;
      if (spec.placeholderOf) {
        const ph = spec.placeholderOf(view, type);
        if (input.placeholder !== ph) input.placeholder = ph;
      }
    };
    input.addEventListener("focus", () => {
      f.focused = true;
      f.dirty = false;
      ui.active = f;
      const t = state.sel;
      f.target = t ? { t, view: viewOf(t) } : null;
      f.startText = input.value;
      if (!multi) selectAll(input);
    });
    input.addEventListener("input", () => {
      f.dirty = input.value !== f.startText;
    });
    f.commit = () => {
      const g = f.target;
      f.dirty = false;
      if (!g || !g.view || input.value === f.startText) return;
      const p = spec.patch(input.value, g.view, g.t.type);
      if (!p) {
        input.value = f.startText;
        return;
      }
      commit(g.t, p);
      g.view = { ...g.view, ...p };
      f.startText = input.value = spec.read(g.view, g.t.type);
    };
    f.cancel = () => {
      input.value = f.startText;
      f.dirty = false;
      f.cancelled = true;
      input.blur();
    };
    input.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "Escape") {
        e.preventDefault();
        f.cancel();
      } else if (e.key === "Enter" && (!multi || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        f.commit();
        f.cancelled = true; // committed: the blur has nothing to do
        input.blur();
      }
    });
    input.addEventListener("blur", () => {
      if (!f.cancelled && f.dirty) f.commit();
      f.cancelled = false;
      f.focused = false;
      f.dirty = false;
      f.target = null;
      if (ui.active === f) ui.active = null;
      refreshFields(true);
    });
    ui.fields.push(f);
    return f;
  }
  function checkField(spec) {
    const box = h("input", { type: "checkbox", class: "rtcp-check-input", "data-rtcp-field": spec.name, "aria-label": spec.label });
    const mark = h("span", { class: "rtcp-check-box", "aria-hidden": "true" }, icon("check", "rtcp-ic-check"));
    const el = h("label", { class: "rtcp-check" }, box, mark, h("span", { class: "rtcp-check-label", text: spec.label }));
    const f = { spec, el, input: box, kind: "check" };
    f.show = (view, type) => {
      const v = !!spec.read(view, type);
      if (box.checked !== v) box.checked = v;
    };
    box.addEventListener("change", () => {
      const t = state.sel;
      const view = t && viewOf(t);
      if (!view) return;
      commit(t, spec.patch(box.checked, view, t.type));
    });
    ui.fields.push(f);
    return f;
  }
  function selectField(spec) {
    const sel = h("select", { class: "rtcp-select-el", "aria-label": spec.aria, "data-rtcp-field": spec.name });
    const wrap = h("div", { class: "rtcp-select" }, sel, icon("chevron", "rtcp-select-ic"));
    const f = { spec, el: wrap, input: sel, kind: "select", optsSig: "" };
    f.show = (view, type) => {
      const opts = spec.options();
      const sig = opts.map((o) => o[0]).join(",");
      if (sig !== f.optsSig) {
        f.optsSig = sig;
        sel.replaceChildren(...opts.map(([v, l]) => h("option", { value: v, text: l })));
      }
      const v = spec.read(view, type);
      if (sel.value !== v) sel.value = v;
    };
    sel.addEventListener("change", () => {
      const t = state.sel;
      const view = t && viewOf(t);
      if (!view) return;
      commit(t, spec.patch(sel.value, view, t.type));
    });
    ui.fields.push(f);
    return f;
  }
  function segField(spec) {
    const el = h("div", { class: "rtcp-segs", role: "radiogroup", "aria-label": spec.aria, "data-rtcp-field": spec.name });
    const btns = spec.options.map(([v, l]) => {
      const b = h("button", { type: "button", class: "rtcp-seg", role: "radio", "data-value": v, text: l });
      b.addEventListener("click", () => {
        const t = state.sel;
        const view = t && viewOf(t);
        if (!view) return;
        commit(t, spec.patch(v, view, t.type));
      });
      el.append(b);
      return b;
    });
    const f = { spec, el, kind: "seg" };
    f.show = (view, type) => {
      const v = spec.read(view, type);
      for (const b of btns) {
        const on = b.getAttribute("data-value") === v;
        if (b.getAttribute("aria-checked") !== String(on)) b.setAttribute("aria-checked", String(on));
      }
    };
    ui.fields.push(f);
    return f;
  }
  const button = (label, iconName, attr) => h("button", { type: "button", class: "rtcp-btn", [attr]: "" }, iconName ? icon(iconName, "rtcp-ic") : null, h("span", { text: label }));
  const row = (cls, ...kids) => h("div", { class: "rtcp-row" + (cls ? " " + cls : "") }, ...kids);
  const labelRow = (label, ...kids) => h("div", { class: "rtcp-lrow" }, h("span", { class: "rtcp-lrow-label", text: label }), h("div", { class: "rtcp-lrow-ctl" }, ...kids));

  function lockedFor(t) {
    return !!(t && state.locks.get(t.key));
  }
  // W / H: the other one follows when the lock is on (ratio at the start).
  function sizePatch(dim, v, view, type) {
    const T = TYPES[type];
    const out = {};
    const t = state.sel;
    if (dim === "w") {
      out.w = Math.max(T.minW, Math.round(v));
      if (lockedFor(t) && view.w > 0 && view.h > 0) out.h = Math.max(T.minH, Math.round((out.w * view.h) / view.w));
    } else {
      out.h = Math.max(T.minH, Math.round(v));
      if (lockedFor(t) && view.w > 0 && view.h > 0) out.w = Math.max(T.minW, Math.round((out.h * view.w) / view.h));
    }
    return out;
  }

  function buildUi() {
    if (ui.built) return;
    ui.built = true;
    ui.wrap = h("div", { class: "rtcp-wrap", "data-testid": "canvas-props" });
    guard(ui.wrap);

    // node header
    const P = {};
    const nodeIcon = h("span", { class: "rtcp-node-icon", "aria-hidden": "true" });
    const name = textField({
      name: "title",
      aria: "Name",
      cls: "rtcp-node-name",
      max: 200,
      read: (v) => (typeof v.title === "string" ? v.title : ""),
      placeholderOf: (v, type) => placeholderName(v, type),
      patch: (s, view, type) => {
        const title = s.trim().slice(0, 200);
        if (type === "browser") return { title, titled: !!title };
        return { title };
      },
    });
    const kind = h("span", { class: "rtcp-node-kind" });
    const err = h("div", { class: "rtcp-error", role: "status", "aria-live": "polite", hidden: true });
    P.node = { rows: h("div", { class: "rtcp-rows rtcp-rows-node" }, h("div", { class: "rtcp-node" }, nodeIcon, name.el, kind), err) };
    ui.nodeIcon = nodeIcon;
    ui.kind = kind;
    ui.err = err;

    // position
    const coord = (k, label) =>
      numField({ name: k, label, aria: label, step: 1, rate: 1, dec: 0, read: (v) => (fin(v[k]) ? v[k] : 0), patch: (x) => ({ [k]: Math.round(x) }) });
    P.position = { rows: h("div", { class: "rtcp-rows" }, row("rtcp-grid2", coord("x", "X").el, coord("y", "Y").el)) };

    // dimensions
    const dim = (k, label) =>
      numField({
        name: k,
        label,
        aria: k === "w" ? "Width" : "Height",
        step: 1,
        rate: 1,
        dec: 0,
        min: (type) => (k === "w" ? TYPES[type].minW : TYPES[type].minH),
        read: (v) => (fin(v[k]) ? v[k] : 0),
        patch: (x, view, type) => sizePatch(k, x, view, type),
      });
    const lock = h("button", { type: "button", class: "rtcp-icon-btn rtcp-lock", "aria-label": "Lock aspect ratio", "aria-pressed": "false", title: "Lock aspect ratio", "data-rtcp-lock": "" });
    lock.addEventListener("click", () => {
      const t = state.sel;
      if (!t) return;
      state.locks.set(t.key, !lockedFor(t));
      refreshFields(true);
    });
    ui.lock = lock;
    P.dimensions = { rows: h("div", { class: "rtcp-rows" }, row("rtcp-grid2l", dim("w", "W").el, dim("h", "H").el, lock)) };

    // appearance
    const opacity = numField({
      name: "opacity",
      glyph: "opacity",
      title: "Opacity",
      aria: "Opacity",
      unit: "%",
      min: 0,
      max: 100,
      step: 1,
      rate: 1,
      dec: 0,
      read: (v) => Math.round((fin(v.opacity) ? clamp(v.opacity, 0, 1) : 1) * 100),
      patch: (x) => ({ opacity: round(clamp(x, 0, 100) / 100, 2) }),
    });
    const radius = numField({
      name: "radius",
      glyph: "radius",
      title: "Corner radius",
      aria: "Corner radius",
      min: 0,
      max: 2000,
      step: 1,
      rate: 1,
      dec: 0,
      read: (v, type) => (fin(v.radius) ? v.radius : TYPES[type].radius),
      patch: (x) => ({ radius: Math.max(0, Math.round(x)) }),
    });
    const clip = checkField({ name: "clip", label: "Clip content", read: (v) => v.clip !== false, patch: (on) => ({ clip: !!on }) });
    P.appearance = { rows: h("div", { class: "rtcp-rows" }, row("rtcp-grid2", opacity.el, radius.el), clip.el) };

    // browser
    const url = textField({
      name: "url",
      aria: "URL",
      url: true,
      placeholder: "Enter a URL",
      cls: "rtcp-text rtcp-url",
      read: (v) => (typeof v.url === "string" ? v.url : ""),
      patch: (s) => {
        const B = modApi("browser");
        const raw = s.trim();
        if (!raw) return { url: "" };
        const u = B && typeof B.normalizeUrl === "function" ? B.normalizeUrl(raw) : /^(https?|file):/i.test(raw) ? raw : "https://" + raw;
        return u ? { url: u } : null;
      },
    });
    const follow = checkField({
      name: "titled",
      label: "Name follows the page title",
      read: (v) => !(v.titled === true && v.title),
      patch: (on, view) => (on ? { titled: false, title: "" } : { titled: true, title: shownTitleOf(state.sel) || (typeof view.title === "string" ? view.title : "") || "Browser" }),
    });
    const reload = button("Reload", "reload", "data-rtcp-reload");
    reload.addEventListener("click", () => pressFrameButton('[aria-label="Reload"], [aria-label="Stop"], .rtbf-bar .rtbf-btn:nth-child(3)'));
    const ext = button("Open", "external", "data-rtcp-external");
    ext.title = "Open in browser";
    ext.setAttribute("aria-label", "Open in browser");
    ext.addEventListener("click", () => pressFrameButton(".rtbf-btn-ext"));
    P.browser = { rows: h("div", { class: "rtcp-rows" }, h("div", { class: "rtcp-field-wrap" }, icon("link", "rtcp-ic rtcp-field-ic"), url.el), follow.el, row("rtcp-grid2", reload, ext)) };

    // shader
    const preset = selectField({
      name: "preset",
      aria: "Preset",
      options: () => {
        const S = modApi("shader");
        try {
          const l = S && typeof S.presets === "function" ? S.presets() : null;
          if (Array.isArray(l) && l.length) return l.map((p) => [p.id, p.label]);
        } catch (_) {}
        return SHADER_PRESETS;
      },
      read: (v) => (typeof v.preset === "string" ? v.preset : "mesh"),
      patch: (id, view) => {
        const p = { preset: id, uniforms: {} };
        const S = modApi("shader");
        if (typeof view.glsl === "string" && view.glsl) {
          const src = S && typeof S.presetSource === "function" ? S.presetSource(id) : null;
          if (src) p.glsl = src;
        }
        return p;
      },
    });
    const speed = numField({
      name: "speed",
      label: "Speed",
      aria: "Speed",
      min: 0,
      max: 4,
      step: 0.05,
      rate: 0.01,
      dec: 2,
      read: (v) => (fin(v.speed) ? v.speed : 1),
      patch: (x) => ({ speed: round(clamp(x, 0, 4), 2) }),
    });
    speed.el.classList.add("rtcp-num-wide");
    const glsl = button("Edit GLSL", "code", "data-rtcp-glsl");
    glsl.addEventListener("click", () => {
      const S = modApi("shader");
      const t = state.sel;
      if (S && t && typeof S.openEditor === "function") S.openEditor(t.id);
    });
    P.shader = { rows: h("div", { class: "rtcp-rows" }, labelRow("Preset", preset.el), labelRow("Speed", speed.el), glsl) };

    // note
    const kindSeg = segField({
      name: "kind",
      aria: "Note type",
      options: [
        ["prompt", "Prompt"],
        ["note", "Note"],
      ],
      read: (v) => (v.kind === "prompt" ? "prompt" : "note"),
      patch: (k) => ({ kind: k }),
    });
    // the card's own pickers (canvas-notes keeps the model list and levels)
    const pick = (what) => {
      const lab = h("span", { class: "rtcp-pick-label", ["data-rtcp-" + what]: "" });
      const b = h("button", { type: "button", class: "rtcp-pick", "data-rtcp-pick": what, "aria-haspopup": "menu", "aria-label": what === "model" ? "Model" : "Effort" }, lab, icon("chevron", "rtcp-ic rtcp-pick-ic"));
      b.addEventListener("click", () => {
        const t = state.sel;
        const trig = t && t.type === "note" && t.el.querySelector(`[data-rtcn-menu-trigger="${what}"]`);
        if (trig && !trig.disabled) trig.click();
      });
      return [b, lab];
    };
    const [modelBtn, model] = pick("model");
    const [effortBtn, effort] = pick("effort");
    const modelHint = h("div", { class: "rtcp-hint" });
    const modelRow = labelRow("Model", modelBtn);
    const effortRow = labelRow("Effort", effortBtn);
    ui.modelBtn = modelBtn;
    ui.effortBtn = effortBtn;
    ui.effort = effort;
    ui.effortRow = effortRow;
    const text = textField({ name: "text", aria: "Note text", multiline: true, max: 20000, placeholder: "Write a note…", read: (v) => (typeof v.text === "string" ? v.text : ""), patch: (s) => ({ text: s.slice(0, 20000) }) });
    ui.model = model;
    ui.modelRow = modelRow;
    ui.modelHint = modelHint;
    ui.noteText = text;
    P.note = { rows: h("div", { class: "rtcp-rows" }, labelRow("Type", kindSeg.el), modelRow, effortRow, modelHint, text.el) };

    for (const def of PARTS) {
      const p = P[def.part];
      guard(p.rows);
      const s = shell(def.part, def.label);
      p.shell = s.shell;
      p.body = s.body;
      p.def = def;
      s.body.append(p.rows);
      ui.wrap.append(s.shell);
    }
    ui.parts = P;
  }
  function placeholderName(v, type) {
    if (type === "browser") return shownTitleOf(state.sel) || hostOf(v.url) || "Browser";
    if (type === "shader") {
      const id = typeof v.preset === "string" ? v.preset : "mesh";
      const p = SHADER_PRESETS.find((x) => x[0] === id);
      return p ? p[1] : "Shader";
    }
    return v.kind === "prompt" ? "Prompt" : "Note";
  }
  function hostOf(u) {
    try {
      return u ? new URL(u).host : "";
    } catch (_) {
      return "";
    }
  }
  function shownTitleOf(t) {
    if (!t || t.type !== "browser" || !t.el) return "";
    const el = t.el.querySelector(".rtbf-head-title");
    return el ? (el.textContent || "").trim() : "";
  }
  function pressFrameButton(sel) {
    const t = state.sel;
    if (!t || t.type !== "browser" || !t.el) return false;
    const b = t.el.querySelector(sel);
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }
  function setError(text) {
    state.error = text;
    if (ui.err) {
      ui.err.textContent = text || "";
      ui.err.hidden = !text;
    }
  }

  // Values into the fields (a focused or scrubbed field keeps its own).
  function refreshFields(full, except) {
    const t = state.sel;
    if (!ui.built || !t) return;
    const view = viewOf(t);
    if (!view) return;
    for (const f of ui.fields) if (f !== except) f.show(view, t.type);
    const T = TYPES[t.type];
    if (ui.nodeIcon.getAttribute("data-type") !== t.type) {
      ui.nodeIcon.setAttribute("data-type", t.type);
      ui.nodeIcon.replaceChildren(icon(T.icon, "rtcp-ic"));
    }
    const kindText = t.type === "note" ? (view.kind === "prompt" ? "Prompt" : "Note") : T.label;
    if (ui.kind.textContent !== kindText) ui.kind.textContent = kindText;
    const locked = lockedFor(t);
    if (ui.lock.getAttribute("aria-pressed") !== String(locked)) {
      ui.lock.setAttribute("aria-pressed", String(locked));
      ui.lock.replaceChildren(icon(locked ? "lock" : "unlock", "rtcp-ic"));
    }
    if (!ui.lock.firstChild) ui.lock.append(icon(locked ? "lock" : "unlock", "rtcp-ic"));
    if (t.type === "note") {
      const prompt = view.kind === "prompt";
      // what the card shows (its pickers), else the node's frozen pair
      const trig = (w) => (t.el ? t.el.querySelector(`[data-rtcn-menu-trigger="${w}"]`) : null);
      const labelOf = (b) => ((b && b.querySelector(".rtcn-pick-label")) || b || { textContent: "" }).textContent.trim();
      const mt = trig("model");
      const et = trig("effort");
      const old = t.el && t.el.querySelector(".rtcn-model"); // older canvas-notes: one "model · effort" label
      const oldParts = old ? old.textContent.split("·").map((x) => x.trim()) : [];
      const m = labelOf(mt) || oldParts[0] || view.model || "Default model";
      const ef = labelOf(et) || oldParts[1] || view.effort || "";
      if (ui.model.textContent !== m) ui.model.textContent = m;
      if (ui.effort.textContent !== ef) ui.effort.textContent = ef;
      ui.modelBtn.disabled = !mt;
      ui.effortBtn.disabled = !et;
      ui.modelRow.hidden = !prompt;
      ui.effortRow.hidden = !prompt || !ef || !!(et && et.hidden);
      ui.modelHint.hidden = !prompt;
      const hint = view.status && view.status !== "draft" ? "Model and effort of this run." : view.modelId || view.model ? "This note's own pick; frozen when the prompt runs." : "The composer's, until you pick one; frozen when the prompt runs.";
      if (ui.modelHint.textContent !== hint) ui.modelHint.textContent = hint;
      const ph = prompt ? "Describe a change…" : "Write a note…";
      if (ui.noteText.input.placeholder !== ph) ui.noteText.input.placeholder = ph;
    }
    if (full) setError(state.error);
  }
  // Commits the field being edited (before the panel goes away or an undo).
  function commitActive(keep) {
    const f = ui.active;
    if (!f) return;
    if (f.dirty && f.commit) f.commit(keep);
  }

  // -------------------------------------------------------------- placement
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
  function visibleFor(def, ctx) {
    const s = state.sel;
    if (!state.enabled || !s || !s.el.isConnected) return false;
    if (def.type && s.type !== def.type) return false;
    const sh = ctx && (ctx.shell || null);
    if (sh && sh.contains && !sh.contains(s.root)) return false;
    if (!sh && ctx && ctx.canvasRoot && ctx.canvasRoot !== s.root) return false;
    return true;
  }
  // window.__RE_TEMPO_CANVAS_CHROME__.registerRightSection, when present.
  function useChrome() {
    const c = window.__RE_TEMPO_CANVAS_CHROME__;
    const fn = c && c.enabled !== false && typeof c.registerRightSection === "function" ? c.registerRightSection : null;
    if (!fn) {
      if (state.mode === "chrome") dropChrome();
      return false;
    }
    if (state.mode === "chrome" && state.chrome === c) return true;
    if (state.mode === "chrome") dropChrome();
    if (state.chromeTried === c) return false;
    state.chromeTried = c;
    buildUi();
    const offs = [];
    try {
      for (const def of PARTS) {
        const id = "canvas-props-" + def.part;
        const r = fn.call(c, {
          id,
          label: def.label,
          title: def.label,
          order: def.order,
          when: (ctx) => visibleFor(def, ctx),
          visible: () => visibleFor(def, null),
          render: (body, ctx) => {
            const p = ui.parts[def.part];
            body.appendChild(p.rows);
            const sec = (ctx && ctx.section) || body.parentElement;
            for (const n of [sec, body]) {
              if (!n) continue;
              for (const a of KEEP_ATTRS) n.setAttribute(a, "");
              n.setAttribute("data-rtcp-part", def.part);
            }
            if (sec && sec.classList) sec.classList.add("rtcp-chrome-section");
            refreshFields(true);
            return () => {
              if (ui.active && p.rows.contains(ui.active.input)) commitActive(false);
              if (p.rows.parentElement === body) p.body.append(p.rows); // back home
            };
          },
        });
        if (!r) throw new Error("registerRightSection refused " + id);
        offs.push(typeof r === "function" ? r : () => c.unregisterRightSection && c.unregisterRightSection(id));
      }
    } catch (e) {
      warn("chrome", errText(e));
      for (const off of offs)
        try {
          off();
        } catch (_) {}
      return false;
    }
    state.chrome = c;
    state.chromeOffs = offs;
    state.mode = "chrome";
    if (ui.wrap.parentElement) ui.wrap.remove();
    chromeSync();
    return true;
  }
  function dropChrome() {
    for (const off of state.chromeOffs.splice(0))
      try {
        off();
      } catch (_) {}
    state.chrome = null;
    state.mode = "inject";
    state.chromeTried = null;
    // the rows go back to our own shells
    for (const p of Object.values(ui.parts)) if (p.rows.parentElement !== p.body) p.body.append(p.rows);
  }
  function chromeSync() {
    const c = state.chrome;
    if (c && typeof c.sync === "function")
      try {
        c.sync();
      } catch (_) {}
  }
  function place() {
    if (state.mode === "chrome") return;
    const s = state.sel;
    const body = s && panelBodyFor(s.root);
    if (!body) {
      if (ui.wrap && ui.wrap.parentElement) {
        commitActive(false);
        ui.wrap.remove();
      }
      return;
    }
    buildUi();
    for (const p of Object.values(ui.parts)) {
      const show = !p.def.type || p.def.type === s.type;
      if (p.shell.hidden === show) p.shell.hidden = !show;
    }
    if (ui.wrap.parentElement !== body) body.prepend(ui.wrap);
  }

  // ------------------------------------------------------------------- sync
  function setSelection(s) {
    const prev = state.sel;
    if (prev === s) return false;
    if (prev && (!s || prev.key !== s.key)) {
      commitActive(false);
      const w = writers.get(prev.key);
      if (w) flushWriter(w);
    }
    state.sel = s;
    return true;
  }
  function sync() {
    state.counts.syncs++;
    const on = flagOn();
    if (!on) {
      if (state.enabled) disable();
      return;
    }
    let force = false;
    if (!state.enabled) {
      state.enabled = true;
      force = true; // the styles were cleared when it went off
    }
    applyAppearanceAll(force);
    state.nodesDirty = false;
    const changed = setSelection(currentSelection());
    if (state.sel && !baseNode(state.sel)) {
      // not in the canvas file (yet): nothing to edit
      setSelection(null);
    }
    const chrome = useChrome();
    if (chrome) {
      if (changed) chromeSync();
    } else place();
    if (state.sel) refreshFields(changed);
  }
  function disable() {
    state.enabled = false;
    commitActive(false);
    flushAll();
    if (state.mode === "chrome") dropChrome();
    state.chromeTried = null;
    if (ui.wrap && ui.wrap.parentElement) ui.wrap.remove();
    clearAppearance();
    state.sel = null;
    chromeSync();
  }
  let raf = 0;
  function schedule() {
    if (raf || boot.disposed) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!document.hidden) sync();
    });
  }

  // Cmd+Z / Cmd+Shift+Z (Ctrl elsewhere): our steps, see the header.
  function onKeyDown(e) {
    if (!state.enabled || e.isComposing) return;
    const mod = IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
    if (!mod || e.altKey) return;
    const k = (e.key || "").toLowerCase();
    const redo = (k === "z" && e.shiftKey) || (!IS_MAC && k === "y" && !e.shiftKey);
    if (k !== "z" && !redo) return;
    const ae = document.activeElement;
    const inPanel = !!(ae && ae.closest && ae.closest("[data-rtcp-root]"));
    if (isEditable(ae) && !inPanel) return;
    if (inPanel && ui.active && ui.active.dirty) return; // the field's own text undo
    if (!state.sel && !inPanel) return;
    const stack = redo ? state.redo : state.undo;
    if (stepFor(stack, state.sel ? state.sel.key : null) < 0) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (inPanel && ui.active && isEditable(ae)) ae.blur();
    undoRedo(redo ? "redo" : "undo");
  }

  // ------------------------------------------------------------------- boot
  const boot = { interval: null, observer: null, listeners: [], disposed: false };
  const listen = (target, type, fn, opt) => {
    target.addEventListener(type, fn, opt);
    boot.listeners.push([target, type, fn, opt]);
  };
  function onMutations(recs) {
    let ours = true;
    for (const r of recs) {
      if (r.type === "attributes") {
        if (r.attributeName === "data-selected" && r.target.hasAttribute("data-selected") && r.target.matches(ALL_FRAMES)) selAt.set(r.target, ++selSeq);
        if (r.attributeName === "data-selected") ours = false;
        continue;
      }
      const t = r.target;
      if (!(t.closest && t.closest("[data-rtcp-root], .rtcp-chrome-section"))) ours = false;
    }
    if (!ours) schedule();
  }
  listen(window, "keydown", onKeyDown, true);
  listen(window, "rtd:canvas-nodes-changed", () => {
    invalidateNodes();
    schedule();
  });
  listen(window, "rtd:canvas-nodes-ready", schedule);
  listen(window, "rtd:canvas-chrome-ready", () => {
    state.chromeTried = null;
    schedule();
  });
  listen(window, "storage", (e) => {
    if (!e.key || e.key === FLAG_KEY) schedule();
  });
  listen(document, "visibilitychange", () => {
    if (!document.hidden) schedule();
  });
  const start = () => {
    if (boot.disposed) return;
    state.enabled = flagOn();
    boot.observer = new MutationObserver(onMutations);
    boot.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-selected"] });
    boot.interval = setInterval(() => {
      if (!document.hidden) sync();
    }, SYNC_MS);
    sync();
  };
  if (document.body) start();
  else listen(document, "DOMContentLoaded", start, { once: true });

  function dispose() {
    if (boot.disposed) return false;
    disable();
    boot.disposed = true;
    clearInterval(boot.interval);
    if (boot.observer) boot.observer.disconnect();
    cancelAnimationFrame(raf);
    for (const [target, type, fn, opt] of boot.listeners.splice(0)) target.removeEventListener(type, fn, opt);
    if (window.__RE_TEMPO_CANVAS_PROPS__ === api) delete window.__RE_TEMPO_CANVAS_PROPS__;
    return true;
  }

  // ---------------------------------------------------------- introspection
  const pubSel = () => {
    const s = state.sel;
    return s ? { type: s.type, id: s.id, canvasPath: s.cp, workspacePath: s.ws || null, node: viewOf(s) } : null;
  };
  // set(field, value): the panel's own path (clamping, lock, one undo step).
  const SETTERS = {
    x: (v) => ({ x: Math.round(+v) }),
    y: (v) => ({ y: Math.round(+v) }),
    w: (v, view, type) => sizePatch("w", +v, view, type),
    h: (v, view, type) => sizePatch("h", +v, view, type),
    opacity: (v) => ({ opacity: round(clamp(+v, 0, 1), 2) }),
    radius: (v) => ({ radius: Math.max(0, Math.round(+v)) }),
    clip: (v) => ({ clip: !!v }),
    title: (v, view, type) => (type === "browser" ? { title: String(v), titled: !!String(v) } : { title: String(v) }),
    url: (v) => ({ url: String(v) }),
    preset: (v, view) => ({ preset: String(v), uniforms: {}, ...(view.glsl && modApi("shader") && modApi("shader").presetSource ? { glsl: modApi("shader").presetSource(String(v)) } : {}) }),
    speed: (v) => ({ speed: round(clamp(+v, 0, 4), 2) }),
    kind: (v) => ({ kind: v === "prompt" ? "prompt" : "note" }),
    text: (v) => ({ text: String(v).slice(0, 20000) }),
  };
  const api = {
    version: VERSION,
    get enabled() {
      return state.enabled;
    },
    state: () => ({
      enabled: state.enabled,
      mode: state.mode,
      selected: pubSel(),
      shown: !!(state.sel && (state.mode === "chrome" ? document.querySelector(".rtcp-chrome-section") : ui.wrap && ui.wrap.isConnected)),
      parts: ui.built ? Object.keys(ui.parts).filter((k) => ui.parts[k].rows.isConnected && isShown(ui.parts[k].rows)) : [],
      undo: state.undo.map((e) => ({ id: e.id, fields: Object.keys(e.after) })),
      redo: state.redo.map((e) => ({ id: e.id, fields: Object.keys(e.after) })),
      pending: Array.from(writers.values()).map((w) => ({ id: w.id, patch: { ...w.patch }, inflight: !!w.promise })),
      locks: Array.from(state.locks.entries()).filter((x) => x[1]).map((x) => x[0].split("\0")[2]),
      error: state.error,
      counts: { ...state.counts },
      lastWriteAt: state.lastWriteAt,
      disposed: boot.disposed,
    }),
    selected: pubSel,
    set: (field, value) => {
      const t = state.sel;
      const fn = SETTERS[field];
      const view = t && viewOf(t);
      if (!fn || !view) return Promise.resolve(false);
      const p = fn(value, view, t.type);
      return commit(t, p);
    },
    undo: () => undoRedo("undo"),
    redo: () => undoRedo("redo"),
    flush: flushAll,
    sync,
    dispose,
  };
  window.__RE_TEMPO_CANVAS_PROPS__ = api;
})();
