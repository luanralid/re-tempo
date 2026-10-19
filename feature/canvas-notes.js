/*
 * RE-TEMPO · canvas-notes (user MOD layer)
 * ---------------------------------------------------------------------------
 * Sticky notes on the design canvas that turn into prompts, copied from
 * pen.dev (RE-PEN.app, out/editor/assets/index.js, read on 2026-10-18):
 *   - Tool "Sticky note", key N (Pen: "Sticky note tool", keyCode N, no
 *     modifier). While armed, a ghost note (250 x 219, fill #E8F6FFcc, stroke
 *     #009DFFcc, radius 8) follows the pointer. A click drops a 250 x 219 note
 *     centred on the click, of kind "prompt", inside the frame under the click;
 *     the tool goes back to select and the text is edited at once. A drag
 *     draws the note's box instead.
 *   - Kinds and colours (Pen's table), in Pen's menu order:
 *       note     header #FFF1D6, body #FFF7E5, outline #8B6311, text #664500
 *       context  header #FFFFFF, body #F0F0F0, outline #767676, text #2C2C2C
 *       prompt   header #C3E8FF, body #E8F6FF, outline #009DFF, text #006CAF
 *     A context note is never sent alone: its text goes with every prompt of
 *     the same storyboard (see Sending).
 *   - Card: width max(250, w), height fits the text. Header with a dashed
 *     outline, the kind label and a chevron (a click opens the kind menu);
 *     body with the text (JetBrains Mono); prompt footer: the model picker
 *     (Pen: label + 12 px chevron, a click lists the models), here also an
 *     effort picker, and a "Run" button (play triangle, radius 6, padding
 *     4 12 4 10, the kind's text colour as background, white label; 50% and
 *     inert without text or while sending). Pen's metrics (radius 8, 1 px
 *     outline, 14/21 text, 45 px header) were then tuned for Tempo on the
 *     team lead's request: radius 16, hairline outline, shadow 0 8px 24px
 *     rgba(0,0,0,.35), padding 12, text 13 / 12 px, gaps 8.
 *   - Double click (or Enter on a selected note) edits the text; leaving the
 *     edit selects the note.
 *   - Run: the note flashes (a scan line sweeps it) and the prompt goes to
 *     the agent with the chosen model. Pen hands it to its chat
 *     (ipc "submit-prompt" {prompt, model}); here it becomes a canvas task.
 * Added for Tempo (not in Pen): the note shows the task it started (queued /
 * running with Claude's logo breathing / needs input / done with a check and
 * the summary in 1-2 lines / failed with the reason and Retry), "Open" opens
 * the task's bubble panel, and the note follows the storyboard under it.
 * Selection, moving, resizing, Delete with a 5 s Undo toast, arrows and
 * Escape behave like canvas-browser's frames (same outline, handles and size
 * label, copied from feature/canvas-browser.js).
 *
 * Model and effort: the note's own pick (modelId / model, effortId / effort
 * in the node), else the composer's, frozen into the node when the prompt
 * runs. Composer: the model button [data-testid="chat-input-model-selector"]
 * and effort button [data-testid="chat-input-effort-selector"] (their text),
 * window.__RE_TEMPO_EFFORT__.state().pickers (effort-levels.js: raw ids),
 * else the last values seen (localStorage "rtd.canvasNotes.lastModel").
 * Model list: the composer's model menu element (Gnn in the bundle: props
 * groups [{label, models: [{id, provider, shortName, disabled}]}],
 * itemTestIdPrefix "chat-input-model-option-"), found in the fiber props
 * above the model button even while the menu is closed; cached in
 * localStorage "rtd.canvasNotes.models". Effort levels: the composer's effort
 * picker list (its compiler memo cache) for the composer's model, else the
 * bundle's zF({model, provider}) copied here, plus "Extra High" for the
 * models effort-levels.js adds it to. Picking a model keeps the effort when
 * the new model has it, else High. The task's own model / effort labels
 * replace them once the pipeline reports them.
 *
 * Sending (the agent pipeline is feature/canvas-comment-agent.js; this mod
 * never edits it):
 *   payload = {text, prompt, context, contextNotes, canvasName, canvasPath,
 *     workspacePath, storyboardName, anchor: {x, y, nodeId, noteId},
 *     source: "note", noteId, model, effort, modelId, effortId}
 *   prompt: the note's text. context: "Context:\n" + the texts of the
 *   context notes on the same storyboard (targetId; none = the notes with no
 *   storyboard), top to bottom, blank line between them; null without any.
 *   text: prompt, then a blank line and context when there is one (ready to
 *   send as is). contextNotes: their ids.
 *   x / y: the note's centre in canvas (world) units; nodeId: the storyboard
 *   (canvas item id) under the note.
 *   1. window.__RE_TEMPO_COMMENT_AGENT__.createTask(payload) when it exists:
 *      its result (a task, a task id, or a Promise of either) links the note.
 *   2. Otherwise the window event "rtcn:submit" with detail = payload plus
 *      respond(taskOrId). THE PIPELINE MUST LISTEN TO IT to run notes: start
 *      a task for detail.text and call detail.respond(task.id) (or set
 *      detail.taskId synchronously, or give the task noteId /
 *      anchor.noteId = detail.noteId, or call
 *      window.__RE_TEMPO_CANVAS_NOTES__.link(noteId, taskId)).
 *   Without a link after 6 s the note shows "failed" with the reason.
 *   Status: tasks() / subscribe() / the "rtcc:changed" event of the pipeline:
 *   task.status (queued | running | needs-input | done | failed), summary,
 *   error, model, effort. Open: window.__RE_TEMPO_COMMENT_BUBBLES__.open(id),
 *   else the pipeline's openChat(id).
 *
 * Anchor: a note belongs to the storyboard under its centre
 * ([data-canvas-item-id], world box from --canvas-item-x/y/width/height or
 * its translate()), recomputed when the note is created or moved by hand
 * and when a note without one appears. targetX / targetY keep where that
 * storyboard was; when it moves (a style mutation in the world layer, or any
 * sync, also after a reload) the note moves by the same amount.
 *
 * Storage: the canvas file, through feature/canvas-nodes.js (loaded from this
 * script's folder, as canvas-browser does), type "note":
 *   {id, type: "note", x, y, w, h, text, kind: "prompt" | "context" | "note", status,
 *    model?, effort?, modelId?, effortId?, targetId?, targetX?, targetY?,
 *    taskId?, summary?, error?, sentAt?, z?}
 *   h is the least height (the card grows with its text); status: draft |
 *   queued | running | needs-input | done | failed. An agent can add notes to
 *   the reTempoCanvasNodes block by hand: see format(). Without canvas-nodes
 *   (or the app's file bridge) the notes stay in localStorage
 *   "rtd.canvasNotes.v1:<canvasPath>" and move into the file once it is
 *   available. Flag: localStorage "rtd.canvasNotes" = "off" (checked live).
 * Toolbar: window.__RE_TEMPO_CANVAS_CHROME__.registerTool(spec) when that
 * exists and accepts it (spec = {id, label, key, icon, order, isActive(),
 * activate(root), deactivate()}; the chrome then owns the button and the N
 * key); else a button in [role=toolbar][aria-label="Design tools"], just
 * before canvas-browser's Browser tool (Pen's order), and N here.
 * Introspection: window.__RE_TEMPO_CANVAS_NOTES__ (state(), notes(), stored(),
 * create(), remove(), select(), edit(), setText(), setKind(), submit(),
 * link(), open(), undo(), arm(), disarm(), sync(), format(), dispose()).
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (window.__RE_TEMPO_CANVAS_NOTES__) return; // double injection
  const SELF_SRC = (document.currentScript && document.currentScript.src) || "";

  // ------------------------------------------------------------------ config
  const FLAG_KEY = "rtd.canvasNotes";
  const STORE_PREFIX = "rtd.canvasNotes.v1:";
  const MODEL_KEY = "rtd.canvasNotes.lastModel";
  const CANVAS_ROOT = "[data-canvas-root]";
  const WORLD_LAYER = ".tds-canvas-shimmer-origin";
  const ITEM = "[data-canvas-item-id]";
  const TOOLBAR = '[role="toolbar"][aria-label="Design tools"]';
  const MODEL_BTN = '[data-testid="chat-input-model-selector"]';
  const EFFORT_BTN = '[data-testid="chat-input-effort-selector"]';
  const NODES_FILE = "canvas-nodes.js";
  const NODES_WAIT_MS = 4000;
  const NODE_TYPE = "note";
  const DEFAULT_W = 250; // Pen's sticky note
  const DEFAULT_H = 219;
  const MIN_W = 250; // Pen: width max(250, w)
  const MIN_H = 120;
  const TEXT_MAX = 20000;
  const SUMMARY_MAX = 300;
  const DRAG_SLOP = 3;
  const UNDO_MS = 5000;
  const SYNC_MS = 400;
  const QUICK_MS = 80;
  const LINK_MS = 6000; // a sent note with no task after this: failed
  const LOST_MS = 15000; // an active task missing from tasks() this long after the send: failed
  const MODEL_TTL = 1500;
  const MAX_FIBER_DEPTH = 600;
  const TOOL_KEY = "n";
  const TOOLTIP_DELAY = 400;
  const KINDS = ["note", "context", "prompt"]; // Pen's menu order
  const KIND_LABEL = { note: "Note", context: "Context", prompt: "Prompt" };
  const MODELS_KEY = "rtd.canvasNotes.models";
  const MODEL_OPTION_PREFIX = "chat-input-model-option-";
  const STATUSES = ["draft", "queued", "running", "needs-input", "done", "failed"];
  const ACTIVE = new Set(["queued", "running", "needs-input"]);
  const EFFORT_LABEL = { minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra High", max: "Max" };
  const EFFORT_SHORT = { minimal: "Min", medium: "Med", xhigh: "X-High" };
  const EFFORT_SHORT_BY_LABEL = { Minimal: "Min", Medium: "Med", "Extra High": "X-High" };
  const NOTE_KEYS = ["x", "y", "w", "h", "text", "kind", "status", "model", "effort", "modelId", "effortId", "targetId", "targetX", "targetY", "taskId", "summary", "error", "sentAt", "z"];
  const BTN_BASE = "flex size-7 items-center justify-center rounded-md transition-colors";
  const BTN_IDLE = "text-icons-primary hover:bg-surface-container-highest";
  const BTN_ON =
    "button-accent-lavender bg-accent-subtle text-accent [[data-theme=light]_&]:bg-surface-lavender [[data-theme=light]_&]:text-text-lavender";

  const state = {
    enabled: true,
    mounts: new Map(), // canvas root -> mount
    selected: null, // note
    editing: null, // note
    tool: null, // { m, overlay, ghost, preview }
    lastRoot: null,
    toast: null,
    tooltip: null,
    menu: null,
    lastSync: 0,
    pending: new Map(), // noteId -> { at, timer }
    agent: { api: null, off: null, via: null, lastError: null, tasksSeenAt: 0 },
    chrome: { api: null, registered: false },
    lastSubmit: null,
    counts: { created: 0, removed: 0, restored: 0, submitted: 0, linked: 0 },
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
  const str = (v, max) => (typeof v === "string" ? v.slice(0, max || 200) : "");
  const uid = () => "sn_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const msg = (e) => String((e && e.message) || e || "error");
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
  const fire = (name, detail) => {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (_) {}
  };

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

  // Lucide paths (the app's icon set) and Pen's own glyphs.
  const ICONS = {
    note: '<path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/>',
    chevron16: '<path d="M4 7 8 11 12 7"/>', // Pen's header chevron (16 x 16)
    chevron12: '<path d="M3 5 6 8 9 5"/>', // Pen's model chevron (12 x 12)
    check: '<path d="M20 6 9 17l-5-5"/>',
    open: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  };
  const CLAUDE_PATH =
    "M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z";
  function icon(name, cls, stroke, box) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", box || "0 0 24 24");
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
  function claudeIcon(cls) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("class", cls);
    s.innerHTML = `<path fill="#D97757" d="${CLAUDE_PATH}"/>`;
    return s;
  }
  // Pen's Run glyph: a 9 x 9 play triangle, "M6.8 3.9 0 7.8V0L6.8 3.9Z".
  function playIcon() {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 7 8");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("class", "rtcn-play");
    s.innerHTML = '<path fill="currentColor" d="M6.8 3.9 0 7.8V0L6.8 3.9Z"/>';
    return s;
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

  // ------------------------------------------------------------ storyboards
  // A canvas item's world box, as canvas-comment-agent reads it.
  const pxVar = (el, name) => {
    const v = parseFloat(el.style.getPropertyValue(name));
    return Number.isFinite(v) ? v : null;
  };
  function itemBox(el) {
    let x = pxVar(el, "--canvas-item-x");
    let y = pxVar(el, "--canvas-item-y");
    const w = pxVar(el, "--canvas-item-width") ?? parseFloat(el.style.width);
    const hh = pxVar(el, "--canvas-item-height") ?? parseFloat(el.style.height);
    if (x == null || y == null) {
      const t = /translate(?:3d)?\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(el.style.transform || "");
      if (t) (x = +t[1]), (y = +t[2]);
    }
    return [x, y, w, hh].every(Number.isFinite) && w > 0 && hh > 0 ? { x, y, w, h: hh } : null;
  }
  function itemsOf(m) {
    const out = new Map();
    for (const el of m.root.querySelectorAll(ITEM)) {
      if (el.closest(".rtcn-layer")) continue;
      const id = el.getAttribute("data-canvas-item-id");
      const b = id && itemBox(el);
      if (b && !out.has(id)) out.set(id, { ...b, el });
    }
    return out;
  }
  // The storyboard under a world point: inside, the smallest one.
  function itemAt(m, x, y, items) {
    let best = null;
    for (const [id, b] of items || itemsOf(m)) {
      if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) continue;
      if (!best || b.w * b.h < best.w * best.h) best = { id, ...b };
    }
    return best;
  }
  function itemName(m, id) {
    if (!id) return null;
    const el = m.root.querySelector(`[data-canvas-item-id="${CSS.escape(id)}"]`);
    const hd = el && el.querySelector("[data-storyboard-header]");
    const s = hd ? (hd.innerText || hd.textContent || "").split("\n").map((x) => x.trim()).find(Boolean) : "";
    return (s || "").slice(0, 80) || null;
  }

  // ---------------------------------------------------------------- storage
  function normalizeData(d) {
    const o = d && typeof d === "object" ? d : {};
    const out = {
      id: typeof o.id === "string" && o.id ? o.id : uid(),
      x: Math.round(num(o.x, 0)),
      y: Math.round(num(o.y, 0)),
      w: Math.max(MIN_W, Math.round(num(o.w, DEFAULT_W))),
      h: Math.max(MIN_H, Math.round(num(o.h, DEFAULT_H))),
      text: typeof o.text === "string" ? o.text.slice(0, TEXT_MAX) : typeof o.content === "string" ? o.content.slice(0, TEXT_MAX) : "",
      kind: KINDS.includes(o.kind) ? o.kind : "note",
      status: STATUSES.includes(o.status) ? o.status : "draft",
      z: Math.max(0, Math.round(num(o.z, 0))),
    };
    for (const k of ["model", "effort", "modelId", "effortId", "targetId", "taskId", "error"]) if (typeof o[k] === "string" && o[k]) out[k] = o[k].slice(0, 300);
    if (typeof o.summary === "string" && o.summary) out.summary = o.summary.slice(0, SUMMARY_MAX);
    if (out.targetId && Number.isFinite(o.targetX) && Number.isFinite(o.targetY)) {
      out.targetX = Math.round(o.targetX);
      out.targetY = Math.round(o.targetY);
    }
    if (Number.isFinite(o.sentAt)) out.sentAt = o.sentAt;
    return out;
  }
  function toNode(d) {
    const n = { id: d.id, type: NODE_TYPE, x: d.x, y: d.y, w: d.w, h: d.h, text: d.text || "", kind: d.kind, status: d.status || "draft" };
    for (const k of ["model", "effort", "modelId", "effortId", "targetId", "targetX", "targetY", "taskId", "summary", "error", "sentAt"]) if (d[k] != null && d[k] !== "") n[k] = d[k];
    if (d.z) n.z = d.z;
    return n;
  }
  const fromNode = (n) => normalizeData(n);
  function loadLocal(key) {
    try {
      const v = JSON.parse(ls.get(STORE_PREFIX + key) || "null");
      return v && Array.isArray(v.notes) ? v.notes.map(normalizeData) : [];
    } catch (_) {
      return [];
    }
  }
  function writeLocal(key, notes) {
    if (notes.length) ls.set(STORE_PREFIX + key, JSON.stringify({ v: 1, t: Date.now(), notes }));
    else ls.del(STORE_PREFIX + key);
  }

  // ------------------------------------------- canvas file (canvas-nodes.js)
  const nodesApi = () => {
    const n = window.__RE_TEMPO_CANVAS_NODES__;
    return n && typeof n.attach === "function" && n.available() ? n : null;
  };
  const nodesLoad = { failed: false, timer: null, typed: false };
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
  function registerNodeType(N) {
    if (nodesLoad.typed || !N || typeof N.registerType !== "function") return;
    nodesLoad.typed = true;
    N.registerType(NODE_TYPE, { keys: NOTE_KEYS });
  }
  function save(m) {
    clearTimeout(m.saveTimer);
    m.saveTimer = null;
    applyContext(m);
    const notes = Array.from(m.notes.values()).map((f) => ({ ...f.data }));
    if (m.nodes) {
      m.nodes.set(notes.map(toNode));
      return;
    }
    writeLocal(m.key, notes);
    for (const o of state.mounts.values()) if (o !== m && o.key === m.key && !o.nodes) reconcile(o, loadLocal(o.key));
  }
  function scheduleSave(m, ms) {
    clearTimeout(m.saveTimer);
    m.saveTimer = setTimeout(() => save(m), ms == null ? 300 : ms);
  }

  // ----------------------------------------------------------------- mounts
  function mount(root, host, key, handle) {
    const layer = h("div", { class: "rtcn-layer", "data-rtcn-layer": "" });
    host.appendChild(layer);
    const m = { id: ++mountSeq, root, host, key, handle, layer, notes: new Map(), saveTimer: null, nodes: null, ws: null, observer: null, followRaf: 0, migrated: false };
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
          if (state.mounts.get(m.root) !== m) return;
          reconcile(m, list.map(fromNode));
          migrateLocal(m);
        },
      });
    }
    if (!m.nodes) reconcile(m, loadLocal(key));
    // Storyboards moving: their style changes in the world layer.
    try {
      m.observer = new MutationObserver((recs) => {
        for (const r of recs)
          if (r.target.nodeType === 1 && r.target.hasAttribute("data-canvas-item-id")) {
            scheduleFollow(m);
            return;
          }
      });
      m.observer.observe(host, { attributes: true, attributeFilter: ["style"], subtree: true });
    } catch (_) {}
    return m;
  }
  // Notes kept in localStorage while the file was not available go into it once.
  function migrateLocal(m) {
    if (m.migrated || !m.nodes || !m.nodes.loaded) return;
    m.migrated = true;
    const old = loadLocal(m.key).filter((d) => !m.notes.has(d.id));
    if (!old.length) return ls.del(STORE_PREFIX + m.key);
    for (const d of old) buildNote(m, d);
    save(m);
    ls.del(STORE_PREFIX + m.key);
  }
  function unmount(m) {
    if (m.saveTimer) save(m);
    if (m.nodes) m.nodes.detach();
    if (m.observer) m.observer.disconnect();
    cancelAnimationFrame(m.followRaf);
    if (state.tool && state.tool.m === m) disarm();
    if (state.selected && state.selected.m === m) deselect();
    for (const f of m.notes.values()) destroyNote(f, true);
    m.layer.remove();
    state.mounts.delete(m.root);
  }
  function reconcile(m, list) {
    const ids = new Set();
    for (const d of list) {
      ids.add(d.id);
      const f = m.notes.get(d.id);
      if (!f) {
        const nf = buildNote(m, d);
        if (!nf.data.targetId) nf.needsTarget = true;
        continue;
      }
      if (f.dragging) continue; // the drag's end writes the truth
      const editingThis = state.editing === f;
      const text = editingThis ? f.data.text : d.text;
      f.data = { ...d, text };
      applyAll(f);
    }
    for (const [id, f] of m.notes) if (!ids.has(id)) destroyNote(f);
    applyContext(m);
    scheduleFollow(m);
    if (agentApi()) refreshFromTasks();
  }
  const mountsOf = (key) => Array.from(state.mounts.values()).filter((m) => m.key === key);
  const visibleMount = (key) => {
    const list = key ? mountsOf(key) : Array.from(state.mounts.values());
    return list.find((m) => m.root === state.lastRoot && isShown(m.root)) || list.find((m) => isShown(m.root)) || null;
  };
  function noteById(id) {
    const m = visibleMount();
    if (m && m.notes.has(id)) return m.notes.get(id);
    for (const x of state.mounts.values()) if (x.notes.has(id)) return x.notes.get(id);
    return null;
  }
  const allNotes = () => {
    const out = [];
    for (const m of state.mounts.values()) for (const f of m.notes.values()) out.push(f);
    return out;
  };

  // ------------------------------------------------------------------ notes
  function buildNote(m, raw) {
    const data = normalizeData(raw);
    const f = { m, data, el: null, els: {}, dragging: false, needsTarget: false };
    const E = f.els;

    E.kindLabel = h("span", { class: "rtcn-kind-label" });
    E.kind = h("button", { class: "rtcn-kind", type: "button", "aria-haspopup": "menu", "aria-expanded": "false", "aria-label": "Note type", "data-rtcn-menu-trigger": "kind" }, E.kindLabel, icon("chevron16", "rtcn-chev", 1, "0 0 16 16"));
    E.ctx = h("span", { class: "rtcn-ctx", hidden: true });
    E.head = h("div", { class: "rtcn-head", "data-rtcn-head": "" }, E.kind, E.ctx);

    E.text = h("textarea", { class: "rtcn-text", rows: "1", spellcheck: "false", readonly: true, "aria-label": "Note text", maxlength: String(TEXT_MAX) });

    E.stIcon = h("span", { class: "rtcn-st-icon", "aria-hidden": "true" });
    E.stLabel = h("span", { class: "rtcn-st-label" });
    E.open = h("button", { class: "rtcn-st-btn", type: "button", "data-rtcn-open": "" }, "Open");
    E.retry = h("button", { class: "rtcn-st-btn", type: "button", "data-rtcn-retry": "" }, "Retry");
    E.summary = h("div", { class: "rtcn-summary" });
    E.status = h("div", { class: "rtcn-status", role: "status", "aria-live": "polite" }, h("div", { class: "rtcn-st-row" }, E.stIcon, E.stLabel, E.open, E.retry), E.summary);

    const picker = (what, label) => {
      const lab = h("span", { class: "rtcn-pick-label" });
      const b = h("button", { class: "rtcn-pick rtcn-pick-" + what, type: "button", "aria-haspopup": "menu", "aria-expanded": "false", "aria-label": label, "data-rtcn-menu-trigger": what }, lab, icon("chevron12", "rtcn-chev-sm", 1, "0 0 12 12"));
      return [b, lab];
    };
    [E.modelBtn, E.modelLabel] = picker("model", "Model");
    [E.effortBtn, E.effortLabel] = picker("effort", "Effort");
    E.run = h("button", { class: "rtcn-run", type: "button", "aria-label": "Run prompt", "data-rtcn-run": "" }, playIcon(), h("span", { text: "Run" }));
    E.foot = h("div", { class: "rtcn-foot" }, h("span", { class: "rtcn-foot-fill" }), E.modelBtn, E.effortBtn, E.run);
    E.ctxFoot = h("div", { class: "rtcn-ctx-foot" });

    E.body = h("div", { class: "rtcn-body" }, E.text, E.status, E.foot, E.ctxFoot);
    E.card = h("div", { class: "rtcn-card" }, E.head, E.body, h("div", { class: "rtcn-flash", "aria-hidden": "true" }));

    E.outline = h("div", { class: "rtcn-outline", "aria-hidden": "true" });
    for (const k of ["n", "s", "w", "e"]) E.outline.append(h("div", { class: "rtcn-edge rtcn-edge-" + k, "data-rtcn-handle": k }));
    for (const k of ["nw", "ne", "sw", "se"]) E.outline.append(h("div", { class: "rtcn-corner rtcn-corner-" + k, "data-rtcn-handle": k }, h("div", { class: "rtcn-corner-sq" })));
    E.size = h("div", { class: "rtcn-size", "aria-hidden": "true" });

    f.el = h("div", { class: "rtcn-note", "data-rtcn-id": data.id, role: "group", "aria-label": "Sticky note" }, E.card, E.outline, E.size);
    wireNote(f);
    m.layer.appendChild(f.el);
    m.notes.set(data.id, f);
    applyAll(f);
    return f;
  }
  function destroyNote(f, keepSelection) {
    if (state.editing === f) state.editing = null;
    if (!keepSelection && state.selected === f) deselect();
    if (state.menu && state.menu.f === f) closeMenu();
    f.el.remove();
    f.m.notes.delete(f.data.id);
  }
  function applyAll(f) {
    applyGeom(f);
    applyKind(f);
    if (state.editing !== f && f.els.text.value !== f.data.text) f.els.text.value = f.data.text;
    autoGrow(f);
    applyStatus(f);
    applyModel(f);
  }
  function applyGeom(f) {
    const d = f.data;
    const s = f.el.style;
    s.transform = `translate(${d.x}px, ${d.y}px)`;
    s.width = d.w + "px";
    s.minHeight = d.h + "px";
    s.zIndex = String(d.z || 0);
  }
  function applyKind(f) {
    const k = f.data.kind;
    if (f.el.getAttribute("data-kind") !== k) f.el.setAttribute("data-kind", k);
    f.els.kindLabel.textContent = KIND_LABEL[k];
    f.els.text.placeholder = k === "prompt" ? "Describe a change…" : k === "context" ? "Context for the prompts on this storyboard…" : "Write a note…";
    f.el.setAttribute("aria-label", (k === "prompt" ? "Prompt note" : k === "context" ? "Context note" : "Sticky note") + (f.data.text ? ": " + f.data.text.slice(0, 60) : ""));
  }
  // The textarea grows with its text (Pen: text growth "fixed-width"): CSS
  // field-sizing where the engine has it, else measured here.
  const FIELD_SIZING = (() => {
    try {
      return CSS.supports("field-sizing", "content");
    } catch (_) {
      return false;
    }
  })();
  function autoGrow(f) {
    if (FIELD_SIZING) return;
    const t = f.els.text;
    t.style.height = "0px";
    t.style.height = Math.max(t.scrollHeight, 21) + "px";
  }
  const renderedH = (f) => Math.max(f.data.h, Math.round(f.el.offsetHeight || f.data.h));
  const busy = (d) => ACTIVE.has(d.status) || state.pending.has(d.id);

  // Status strip: prompt notes that were sent.
  function applyStatus(f) {
    const d = f.data;
    const E = f.els;
    const st = d.kind === "prompt" && d.status !== "draft" ? d.status : "draft";
    if (f.el.getAttribute("data-status") !== st) f.el.setAttribute("data-status", st);
    E.status.hidden = st === "draft";
    if (st !== "draft") {
      const label = { queued: "Sending…", running: "Working…", "needs-input": "Needs your input", done: "Done", failed: "Failed" }[st];
      if (E.stLabel.textContent !== label) E.stLabel.textContent = label;
      if (E.stIcon.getAttribute("data-for") !== st) {
        E.stIcon.setAttribute("data-for", st);
        E.stIcon.replaceChildren(st === "queued" || st === "running" ? claudeIcon("rtcn-claude") : st === "done" ? icon("check", "rtcn-check", 3) : document.createTextNode(st === "failed" ? "!" : "?"));
      }
      E.open.hidden = !d.taskId;
      E.retry.hidden = st !== "failed";
      const sum = st === "failed" ? d.error || "" : st === "done" || st === "needs-input" ? d.summary || "" : "";
      if (E.summary.textContent !== sum) E.summary.textContent = sum;
      E.summary.hidden = !sum;
      E.summary.title = sum;
    }
    const canRun = d.kind === "prompt" && !!d.text.trim() && !busy(d);
    E.run.disabled = !canRun;
    E.run.setAttribute("aria-disabled", String(!canRun));
    E.run.title = !d.text.trim() ? "Write a prompt first" : busy(d) ? "Running" : "Run (⌘↩)";
  }
  // Footer pickers: the note's own model / effort, else the composer's.
  function applyModel(f) {
    const p = currentPick(f);
    const E = f.els;
    const ml = p.model || "Model";
    // the button is narrow: "Extra High" -> "X-High" (the menu keeps the names)
    const el = (p.effort && (EFFORT_SHORT[p.effortId] || EFFORT_SHORT_BY_LABEL[p.effort])) || p.effort || "Effort";
    if (E.modelLabel.textContent !== ml) E.modelLabel.textContent = ml;
    if (E.effortLabel.textContent !== el) E.effortLabel.textContent = el;
    const own = !!(f.data.modelId || f.data.model);
    E.modelBtn.title = (p.model ? p.model + " · " : "") + (own ? "model for this prompt" : "the composer's model (pick one to keep it on this note)");
    E.effortBtn.title = (p.effort ? p.effort + " · " : "") + (own ? "effort for this prompt" : "the composer's effort (pick one to keep it on this note)");
    E.effortBtn.hidden = !p.effort && !effortsFor(p.modelId, p.provider).length;
  }

  // ------------------------------------------------------------ the composer
  const modelCache = { at: 0, v: null };
  function modelLabel(id) {
    const s = String(id || "")
      .trim()
      .replace(/\[\d+m\]$/i, "")
      .replace(/^claude-/i, "");
    if (!s) return null;
    const parts = s.split("-").filter(Boolean);
    while (parts.length > 1 && /^\d+m$/i.test(parts[parts.length - 1])) parts.pop();
    const out = [];
    for (const p of parts) {
      const prev = out[out.length - 1];
      if (/^\d+$/.test(p) && prev && /^\d+$/.test(prev)) out[out.length - 1] = `${prev}.${p}`;
      else out.push(p);
    }
    const word = (w) => (/^(glm|gpt)$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1));
    return out.map(word).join(" ");
  }
  const btnText = (sel) => {
    const list = Array.from(document.querySelectorAll(sel));
    const b = list.find(isShown) || list[0];
    const t = b ? (b.textContent || "").replace(/\s+/g, " ").trim() : "";
    return t ? t.replace(/\s+1M$/i, "").slice(0, 40) : null;
  };
  function composerModel() {
    const now = Date.now();
    if (modelCache.v && now - modelCache.at < MODEL_TTL) return modelCache.v;
    let modelId = null;
    let effortId = null;
    let effortText = null;
    let provider = null;
    try {
      const E = window.__RE_TEMPO_EFFORT__;
      const ps = E && typeof E.state === "function" ? E.state().pickers || [] : [];
      const p = ps.find((x) => x && x.model) || null;
      if (p) {
        modelId = typeof p.model === "string" ? p.model : null;
        effortId = typeof p.effort === "string" ? p.effort : null;
        effortText = typeof p.label === "string" ? p.label.trim() : null;
        provider = typeof p.provider === "string" ? p.provider : null;
      }
    } catch (_) {}
    const model = btnText(MODEL_BTN) || (modelId ? modelLabel(modelId) : null);
    const effort = btnText(EFFORT_BTN) || effortText || (effortId ? EFFORT_LABEL[effortId] || effortId : null);
    let v = { model, effort, modelId, effortId, provider };
    if (model) ls.set(MODEL_KEY, JSON.stringify(v));
    else {
      try {
        const last = JSON.parse(ls.get(MODEL_KEY) || "null");
        if (last && last.model) v = { model: last.model, effort: last.effort || null, modelId: last.modelId || null, effortId: last.effortId || null, provider: last.provider || null };
      } catch (_) {}
    }
    modelCache.at = now;
    modelCache.v = v;
    return v;
  }

  // The app's model list: the composer's model menu (Gnn in the bundle) gets
  // groups = [{label, models: [{id, provider, shortName, disabled?}]}] and
  // itemTestIdPrefix "chat-input-model-option-". That element sits in the
  // props of the picker's popover root, above the model button in the fiber
  // tree, also while the menu is closed. Kept in localStorage for the times
  // no composer is mounted.
  const isEl = (v) => !!v && typeof v === "object" && typeof v.$$typeof === "symbol" && !!v.props && typeof v.props === "object";
  function findModelMenu(v, depth) {
    if (!v || depth > 8) return null;
    if (Array.isArray(v)) {
      for (const x of v) {
        const r = findModelMenu(x, depth + 1);
        if (r) return r;
      }
      return null;
    }
    if (!isEl(v)) return null;
    const p = v.props;
    if (p.itemTestIdPrefix === MODEL_OPTION_PREFIX && Array.isArray(p.groups)) return p;
    return findModelMenu(p.children, depth + 1) || (isEl(p.render) ? findModelMenu(p.render, depth + 1) : null);
  }
  const listCache = { at: 0, v: null };
  function appModels() {
    const now = Date.now();
    if (listCache.v && now - listCache.at < MODEL_TTL) return listCache.v;
    let found = null;
    const btns = Array.from(document.querySelectorAll(MODEL_BTN));
    btns.sort((a, b) => Number(isShown(b)) - Number(isShown(a)));
    for (const b of btns) {
      let f = fiberOf(b);
      for (let d = 0; f && d < 40 && !found; d++, f = f.return) {
        const p = f.memoizedProps;
        if (p && typeof p === "object") found = findModelMenu(p.children, 0);
      }
      if (found) break;
    }
    let groups = null;
    if (found) {
      groups = found.groups
        .map((g) => ({
          label: typeof (g && g.label) === "string" ? g.label : "",
          models: (Array.isArray(g && g.models) ? g.models : [])
            .filter((x) => x && typeof x.id === "string")
            .map((x) => ({ id: x.id, provider: typeof x.provider === "string" ? x.provider : "claude", label: String(x.shortName || x.label || modelLabel(x.id) || x.id), disabled: x.disabled === true })),
        }))
        .filter((g) => g.models.length);
      // " 1M" off the names, as effort-levels shows them, unless two would clash
      const all = groups.flatMap((g) => g.models);
      for (const x of all) {
        const short = x.label.replace(/\s+1M$/i, "");
        if (short !== x.label && !all.some((y) => y !== x && y.label === short)) x.label = short;
      }
      if (groups.length) ls.set(MODELS_KEY, JSON.stringify({ t: now, groups }));
    }
    if (!groups || !groups.length) {
      try {
        const c = JSON.parse(ls.get(MODELS_KEY) || "null");
        if (c && Array.isArray(c.groups)) groups = c.groups;
      } catch (_) {}
    }
    if (!groups || !groups.length) {
      const c = composerModel();
      groups = c.modelId ? [{ label: "", models: [{ id: c.modelId, provider: c.provider || "claude", label: c.model || modelLabel(c.modelId), disabled: false }] }] : [];
    }
    listCache.at = now;
    listCache.v = groups;
    return groups;
  }
  const modelById = (id) => {
    for (const g of appModels()) for (const x of g.models) if (x.id === id) return x;
    return null;
  };
  // Effort levels. For the composer's model: the effort picker's own list
  // (lan in the bundle keeps zF({model, provider}) in its compiler memo
  // cache); else zF copied from the bundle (RE-TEMPO build of 2026-10-14);
  // plus "Extra High" for the models effort-levels.js adds it to.
  const XHIGH_CLAUDE = ["opus-5.5-1m", "sonnet-5.5-1m", "fable-5.1", "fable-5.1-1m", "fable-5", "fable-5-1m", "opus-4.8", "opus-4.8-1m", "opus-4.7", "opus-4.7-1m"];
  const lv = (ids) => ids.map((id) => ({ id, label: EFFORT_LABEL[id] }));
  function effortReplica(model, provider) {
    const pv = provider || "claude";
    if (pv === "grok") return lv(["low", "medium", "high", "xhigh"]);
    if (pv === "codex") return lv(["minimal", "low", "medium", "high", "xhigh"]);
    if (pv === "opencode" || pv === "cursor") return [];
    return lv(["low", "medium", "high", ...(XHIGH_CLAUDE.includes(model) ? ["xhigh"] : []), "max"]);
  }
  function composerEfforts() {
    for (const b of document.querySelectorAll(EFFORT_BTN)) {
      let f = fiberOf(b);
      for (let d = 0; f && d < 60; d++, f = f.return) {
        const p = f.memoizedProps;
        if (!p || typeof p.onEffortChange !== "function" || typeof p.model !== "string") continue;
        const mc = f.updateQueue && f.updateQueue.memoCache;
        const data = mc && Array.isArray(mc.data) ? mc.data : [];
        for (const cache of data)
          if (Array.isArray(cache))
            for (const v of cache)
              if (Array.isArray(v) && v.length && v.every((o) => o && typeof o.id === "string" && typeof o.label === "string") && v.some((o) => EFFORT_LABEL[o.id])) return { model: p.model, list: v.map((o) => ({ id: o.id, label: o.label })) };
        return { model: p.model, list: null };
      }
    }
    return null;
  }
  function effortsFor(modelId, provider) {
    if (!modelId) return [];
    const pv = provider || (modelById(modelId) || {}).provider || "claude";
    const c = composerEfforts();
    let list = c && c.model === modelId && c.list ? c.list.slice() : effortReplica(modelId, pv);
    let extra = [];
    try {
      const E = window.__RE_TEMPO_EFFORT__;
      extra = E && Array.isArray(E.models) ? E.models : [];
    } catch (_) {}
    if (pv === "claude" && extra.includes(modelId) && !list.some((o) => o.id === "xhigh")) {
      const i = list.findIndex((o) => o.id === "max");
      list.splice(i < 0 ? list.length : i, 0, { id: "xhigh", label: EFFORT_LABEL.xhigh });
    }
    return list;
  }
  // What a run of this note uses: its own pick, else the composer's.
  function currentPick(f) {
    const d = f.data;
    const c = composerModel();
    if (d.modelId || d.model) {
      const x = d.modelId ? modelById(d.modelId) : null;
      return { model: d.model || (x && x.label) || modelLabel(d.modelId), modelId: d.modelId || null, effort: d.effort || null, effortId: d.effortId || null, provider: (x && x.provider) || "claude" };
    }
    return { model: c.model, modelId: c.modelId, effort: c.effort, effortId: c.effortId, provider: c.provider || "claude" };
  }
  function setModel(f, id) {
    const x = modelById(id);
    if (!x) return false;
    const d = f.data;
    const cur = currentPick(f);
    const levels = effortsFor(x.id, x.provider);
    const keep = levels.find((o) => o.id === cur.effortId) || levels.find((o) => o.id === "high") || levels[levels.length - 1] || null;
    d.modelId = x.id;
    d.model = x.label;
    if (keep) {
      d.effortId = keep.id;
      d.effort = keep.label;
    } else {
      delete d.effortId;
      delete d.effort;
    }
    applyModel(f);
    save(f.m);
    return true;
  }
  function setEffort(f, id) {
    const cur = currentPick(f);
    const o = effortsFor(cur.modelId, cur.provider).find((x) => x.id === id);
    if (!o) return false;
    const d = f.data;
    if (!d.modelId && !d.model) {
      // the pair stays together: the composer's model comes along
      if (cur.modelId) d.modelId = cur.modelId;
      if (cur.model) d.model = cur.model;
    }
    d.effortId = o.id;
    d.effort = o.label;
    applyModel(f);
    save(f.m);
    return true;
  }

  // ---------------------------------------------------------- context notes
  // Context notes join every prompt of the same storyboard (or, without a
  // storyboard, the prompts that have none), top to bottom.
  function contextFor(f) {
    const t = f.data.targetId || null;
    return Array.from(f.m.notes.values())
      .filter((o) => o !== f && o.data.kind === "context" && o.data.text.trim() && (o.data.targetId || null) === t)
      .sort((a, b) => a.data.y - b.data.y || a.data.x - b.data.x);
  }
  function applyContext(m) {
    for (const f of m.notes.values()) {
      const d = f.data;
      const E = f.els;
      if (d.kind === "prompt") {
        const n = contextFor(f).length;
        const txt = n ? n + " context" : "";
        if (E.ctx.textContent !== txt) E.ctx.textContent = txt;
        E.ctx.hidden = !n;
        E.ctx.title = n ? `${n} context note${n > 1 ? "s" : ""} on this storyboard go with this prompt` : "";
      } else if (!E.ctx.hidden) E.ctx.hidden = true;
      if (d.kind === "context") {
        const where = d.targetId ? itemName(m, d.targetId) || "this storyboard" : "this canvas";
        const txt = d.targetId ? `Added to the prompts on ${where}` : "Added to the prompts outside storyboards";
        if (E.ctxFoot.textContent !== txt) {
          E.ctxFoot.textContent = txt;
          E.ctxFoot.title = txt;
        }
      }
    }
  }

  // --------------------------------------------------------- note wiring
  function wireNote(f) {
    const E = f.els;
    const el = f.el;

    el.addEventListener("pointerdown", (e) => {
      if (e.button === 1 || state.spaceDown) return; // middle button / space: the canvas pans
      e.stopPropagation();
      if (e.button !== 0) {
        select(f);
        return;
      }
      const t = e.target;
      // Typing: the textarea keeps its own caret and selection.
      if (state.editing === f && t === E.text) return;
      const wasSelected = state.selected === f;
      if (state.editing === f) endEdit(f, true);
      select(f);
      const hd = t.closest("[data-rtcn-handle]");
      if (hd) {
        e.preventDefault();
        startDrag(f, e, "resize:" + hd.getAttribute("data-rtcn-handle"));
        return;
      }
      if (t.closest("button")) return; // kind menu, Run, Open, Retry
      // No preventDefault: the press focuses the canvas root, as a press on
      // the canvas does (canvas-browser does the same).
      const onBody = !!t.closest(".rtcn-body") && !t.closest(".rtcn-status, .rtcn-foot");
      startDrag(f, e, "move", {
        onClick: () => {
          if (onBody && wasSelected) startEdit(f);
        },
      });
    });
    for (const type of ["mousedown", "click", "auxclick", "contextmenu", "keyup", "keypress", "paste", "copy", "cut"]) el.addEventListener(type, (e) => e.stopPropagation());
    el.addEventListener("keydown", (e) => {
      if (isEditable(e.target)) e.stopPropagation();
    });
    el.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      if (e.target.closest("button, [data-rtcn-handle]")) return;
      startEdit(f);
    });

    E.kind.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMenu(f, "kind");
    });
    E.modelBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMenu(f, "model");
    });
    E.effortBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMenu(f, "effort");
    });
    E.run.addEventListener("click", (e) => {
      e.stopPropagation();
      submit(f);
    });
    E.retry.addEventListener("click", (e) => {
      e.stopPropagation();
      submit(f);
    });
    E.open.addEventListener("click", (e) => {
      e.stopPropagation();
      openTask(f.data.taskId);
    });
    E.text.addEventListener("input", () => {
      f.data.text = E.text.value.slice(0, TEXT_MAX);
      autoGrow(f);
      applyStatus(f);
      applyKind(f);
      scheduleSave(f.m, 500);
    });
    E.text.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        endEdit(f, true);
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        submit(f);
      }
    });
    E.text.addEventListener("blur", () => {
      if (state.editing === f) endEdit(f, true);
    });
  }

  function startEdit(f) {
    if (!f.el.isConnected) return false;
    if (state.editing && state.editing !== f) endEdit(state.editing, true);
    select(f);
    if (state.editing === f) return true;
    state.editing = f;
    const t = f.els.text;
    t.readOnly = false;
    f.el.setAttribute("data-editing", "");
    t.focus({ preventScroll: true });
    const n = t.value.length;
    try {
      t.setSelectionRange(n, n);
    } catch (_) {}
    return true;
  }
  function endEdit(f, commit) {
    if (state.editing !== f) return;
    state.editing = null;
    f.el.removeAttribute("data-editing");
    const t = f.els.text;
    t.readOnly = true;
    if (commit) {
      f.data.text = t.value.slice(0, TEXT_MAX);
      save(f.m);
    }
    if (document.activeElement === t) t.blur();
    applyAll(f);
  }

  // ----------------------------------------------------------------- menus
  // Kind (Pen: Note / Context / Prompt), model and effort: the app's menu look.
  function toggleMenu(f, what) {
    if (state.menu && state.menu.f === f && state.menu.what === what) return closeMenu();
    const d = f.data;
    if (what === "kind")
      return openMenu(f, what, f.els.kind, "Note type", [{ items: KINDS.map((k) => ({ value: k, label: KIND_LABEL[k], checked: d.kind === k, dot: k })) }], (k) => setKind(f, k));
    const cur = currentPick(f);
    if (what === "model") {
      const sections = appModels().map((g) => ({ title: g.label, items: g.models.map((x) => ({ value: x.id, label: x.label, checked: x.id === cur.modelId || (!cur.modelId && x.label === cur.model), disabled: x.disabled })) }));
      return openMenu(f, what, f.els.modelBtn, "Model", sections, (id) => setModel(f, id));
    }
    const levels = effortsFor(cur.modelId, cur.provider);
    return openMenu(f, what, f.els.effortBtn, "Effort", [{ title: "Effort", items: levels.map((o) => ({ value: o.id, label: o.label, checked: o.id === cur.effortId || (!cur.effortId && o.label === cur.effort) })) }], (id) => setEffort(f, id));
  }
  function openMenu(f, what, anchor, label, sections, onPick) {
    closeMenu();
    const r = anchor.getBoundingClientRect();
    const items = [];
    const kids = [];
    sections.forEach((sec, si) => {
      if (!sec.items.length) return;
      if (si > 0 && kids.length) kids.push(h("div", { class: "rtcn-menu-sep", role: "separator" }));
      if (sec.title) kids.push(h("div", { class: "rtcn-menu-title", text: sec.title }));
      for (const o of sec.items) {
        const it = h("div", { class: "rtcn-menu-item", role: "menuitemradio", tabindex: "-1", "aria-checked": String(!!o.checked), "aria-disabled": o.disabled ? "true" : null, "data-value": o.value, "data-kind": o.dot || null });
        if (o.dot) it.append(h("span", { class: "rtcn-menu-dot", "data-kind": o.dot }));
        it.append(h("span", { class: "rtcn-menu-text", text: o.label }), icon("check", "rtcn-menu-check", 2));
        if (!o.disabled) {
          it.addEventListener("click", (e) => {
            e.stopPropagation();
            closeMenu();
            onPick(o.value);
          });
          it.addEventListener("pointerenter", () => it.focus({ preventScroll: true }));
          items.push(it);
        }
        kids.push(it);
      }
    });
    if (!kids.length) kids.push(h("div", { class: "rtcn-menu-title", text: "Nothing to pick" }));
    const el = h("div", { class: "rtcn-menu", role: "menu", "aria-label": label, "data-rtcn-menu": what }, ...kids);
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    el.addEventListener("wheel", (e) => e.stopPropagation());
    el.addEventListener("keydown", (e) => {
      const i = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!items.length) return;
        const n = (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[n].focus({ preventScroll: true });
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (i >= 0) items[i].click();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
      }
    });
    document.body.appendChild(el);
    const mh = el.offsetHeight;
    const below = r.bottom + 4 + mh <= window.innerHeight - 8;
    el.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, r.left))) + "px";
    el.style.top = Math.round(below ? r.bottom + 4 : Math.max(8, r.top - 4 - mh)) + "px";
    el.setAttribute("data-side", below ? "bottom" : "top");
    state.menu = { f, el, what, anchor };
    anchor.setAttribute("aria-expanded", "true");
    const cur = items.find((x) => x.getAttribute("aria-checked") === "true") || items[0];
    if (cur) cur.focus({ preventScroll: true });
    requestAnimationFrame(() => el.setAttribute("data-show", ""));
    return true;
  }
  function closeMenu() {
    const mn = state.menu;
    if (!mn) return;
    state.menu = null;
    mn.el.remove();
    mn.anchor.setAttribute("aria-expanded", "false");
  }
  function setKind(f, kind) {
    if (!KINDS.includes(kind) || f.data.kind === kind) return false;
    f.data.kind = kind;
    applyAll(f);
    applyContext(f.m);
    save(f.m);
    return true;
  }

  // --------------------------------------------------------------- dragging
  function startDrag(f, e, kind, opts) {
    const m = f.m;
    const pid = e.pointerId;
    const sx = e.clientX;
    const sy = e.clientY;
    const start = toWorld(m, sx, sy);
    const o = { x: f.data.x, y: f.data.y, w: f.data.w, h: renderedH(f) };
    const handle = kind.startsWith("resize:") ? kind.slice(7) : null;
    let moved = false;
    const capture = () => {
      try {
        f.el.setPointerCapture(pid);
      } catch (_) {}
      document.documentElement.setAttribute("data-rtcn-dragging", "");
    };
    if (handle) {
      f.dragging = true;
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
        f.dragging = true;
        if (!handle) {
          f.el.setAttribute("data-dragging", "move");
          capture();
        }
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
      document.documentElement.removeAttribute("data-rtcn-dragging");
      f.el.removeAttribute("data-dragging");
      f.dragging = false;
      hideSize(f);
      if (moved && ev) ev.stopPropagation();
      if (moved || handle) {
        if (moved && !handle) retarget(f);
        save(m);
      } else if (opts && opts.onClick && ev && ev.type === "pointerup") opts.onClick();
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
    f.els.size.textContent = `${f.data.w} × ${renderedH(f)}`;
    f.el.setAttribute("data-sizing", "");
  }
  function hideSize(f) {
    f.el.removeAttribute("data-sizing");
  }

  // ------------------------------------------------------------ anchoring
  // The storyboard under the note's centre becomes its target.
  function retarget(f, items) {
    const d = f.data;
    const c = itemAt(f.m, d.x + d.w / 2, d.y + renderedH(f) / 2, items);
    f.needsTarget = false;
    if (c) {
      d.targetId = c.id;
      d.targetX = Math.round(c.x);
      d.targetY = Math.round(c.y);
    } else {
      delete d.targetId;
      delete d.targetX;
      delete d.targetY;
    }
  }
  function scheduleFollow(m) {
    if (m.followRaf) return;
    m.followRaf = requestAnimationFrame(() => {
      m.followRaf = 0;
      follow(m);
    });
  }
  // A target that moved carries its notes along.
  function follow(m) {
    if (!m.notes.size || state.mounts.get(m.root) !== m) return 0;
    const items = itemsOf(m);
    if (!items.size) return 0;
    let changed = 0;
    for (const f of m.notes.values()) {
      if (f.dragging) continue;
      const d = f.data;
      if (f.needsTarget) {
        const before = d.targetId || null;
        retarget(f, items);
        if ((d.targetId || null) !== before) changed++;
        continue;
      }
      if (!d.targetId) continue;
      const b = items.get(d.targetId);
      if (!b) continue; // the storyboard is gone (or not drawn yet): stay
      const bx = Math.round(b.x);
      const by = Math.round(b.y);
      if (!Number.isFinite(d.targetX) || !Number.isFinite(d.targetY)) {
        d.targetX = bx;
        d.targetY = by;
        changed++;
        continue;
      }
      if (bx === d.targetX && by === d.targetY) continue;
      d.x += bx - d.targetX;
      d.y += by - d.targetY;
      d.targetX = bx;
      d.targetY = by;
      applyGeom(f);
      changed++;
    }
    if (changed) scheduleSave(m, 250);
    return changed;
  }

  // -------------------------------------------------------------- selection
  function clearAppSelection(m) {
    try {
      const hd = m.handle || findHandle(m.root);
      if (hd && typeof hd.getSelection === "function" && hd.getSelection().length && typeof hd.clearSelection === "function") hd.clearSelection();
    } catch (_) {}
  }
  function select(f) {
    clearAppSelection(f.m);
    try {
      const B = window.__RE_TEMPO_CANVAS_BROWSER__;
      if (B && typeof B.state === "function" && B.state().selected && typeof B.select === "function") B.select(null);
    } catch (_) {}
    if (state.selected === f) return;
    deselect();
    state.selected = f;
    state.lastRoot = f.m.root;
    f.el.setAttribute("data-selected", "");
    let top = 0;
    for (const o of f.m.notes.values()) if (o !== f) top = Math.max(top, o.data.z || 0);
    if ((f.data.z || 0) <= top && f.m.notes.size > 1) {
      f.data.z = top + 1;
      applyGeom(f);
      scheduleSave(f.m);
    }
  }
  function deselect() {
    const f = state.selected;
    if (!f) return;
    if (state.editing === f) endEdit(f, true);
    if (state.menu && state.menu.f === f) closeMenu();
    f.el.removeAttribute("data-selected");
    state.selected = null;
  }

  // ------------------------------------------------------- create / remove
  function createIn(m, opts) {
    const o = opts || {};
    const w = Math.max(MIN_W, Math.round(num(o.w, DEFAULT_W)));
    const hh = Math.max(MIN_H, Math.round(num(o.h, DEFAULT_H)));
    let x = o.x;
    let y = o.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      const r = m.root.getBoundingClientRect();
      const c = toWorld(m, r.left + r.width / 2, r.top + r.height / 2);
      x = c.x - w / 2;
      y = c.y - hh / 2;
    }
    let top = 0;
    for (const f of m.notes.values()) top = Math.max(top, f.data.z || 0);
    const f = buildNote(m, { x, y, w, h: hh, text: typeof o.text === "string" ? o.text : "", kind: KINDS.includes(o.kind) ? o.kind : "prompt", status: "draft", z: top + 1 });
    retarget(f);
    state.counts.created++;
    save(m);
    select(f);
    if (o.edit !== false) requestAnimationFrame(() => startEdit(f));
    return f;
  }
  function removeNote(f, withUndo) {
    const m = f.m;
    const data = { ...f.data };
    destroyNote(f);
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
      const list = loadLocal(key).filter((d) => d.id !== data.id);
      list.push(normalizeData(data));
      writeLocal(key, list);
      return null;
    }
    const f = m.notes.get(data.id) || buildNote(m, data);
    save(m);
    select(f);
    return f;
  }

  // ------------------------------------------------------------------ toast
  function showUndo(m, data) {
    hideToast();
    const action = h("button", { class: "rtcn-toast-action", type: "button", text: "Undo" });
    const el = h("div", { class: "rtcn-toast", role: "status", "aria-live": "polite", "data-rtcn-toast": "" }, h("span", { class: "rtcn-toast-text", text: data.kind === "prompt" ? "Prompt note deleted" : data.kind === "context" ? "Context note deleted" : "Sticky note deleted" }), action);
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

  // ---------------------------------------------------------- agent pipeline
  function agentApi() {
    const A = window.__RE_TEMPO_COMMENT_AGENT__;
    return A && typeof A === "object" && typeof A.tasks === "function" ? A : null;
  }
  // Subscribe once per pipeline object (it may be re-created).
  function ensureAgent() {
    const A = agentApi();
    if (A === state.agent.api) return A;
    if (state.agent.off)
      try {
        state.agent.off();
      } catch (_) {}
    state.agent.off = null;
    state.agent.api = A;
    if (A && typeof A.subscribe === "function")
      try {
        state.agent.off = A.subscribe((list) => onTasks(list));
      } catch (_) {}
    if (A) refreshFromTasks();
    return A;
  }
  const idOf = (r) => (typeof r === "string" && r ? r : r && typeof r === "object" ? (typeof r.id === "string" && r.id) || (typeof r.taskId === "string" && r.taskId) || null : null);
  function refreshFromTasks() {
    const A = agentApi();
    if (!A) return;
    let list = null;
    try {
      list = A.tasks();
    } catch (_) {}
    if (Array.isArray(list)) onTasks(list);
  }
  function onTasks(list) {
    if (!Array.isArray(list)) return;
    state.agent.tasksSeenAt = Date.now();
    const byId = new Map();
    for (const t of list) if (t && t.id) byId.set(t.id, t);
    const touched = new Set();
    for (const f of allNotes()) {
      const d = f.data;
      if (d.kind !== "prompt") continue;
      // A note sent without a link yet: a task that names it.
      if (!d.taskId && state.pending.has(d.id)) {
        const t = list.find((x) => x && (x.noteId === d.id || (x.anchor && x.anchor.noteId === d.id)));
        if (t) {
          linkNote(f, t.id, t);
          touched.add(f.m);
        }
        continue;
      }
      if (!d.taskId) continue;
      const t = byId.get(d.taskId);
      if (!t) {
        // The task left the store while it was still working.
        if (ACTIVE.has(d.status) && !state.pending.has(d.id) && Date.now() - (d.sentAt || 0) > LOST_MS) {
          d.status = "failed";
          d.error = "The task is no longer in the agent's list.";
          applyStatus(f);
          touched.add(f.m);
        }
        continue;
      }
      if (applyTask(f, t)) touched.add(f.m);
    }
    for (const m of touched) scheduleSave(m, 200);
  }
  function applyTask(f, t) {
    const d = f.data;
    const before = JSON.stringify([d.status, d.summary, d.error, d.model, d.effort]);
    const st = STATUSES.includes(t.status) && t.status !== "draft" ? t.status : d.status;
    d.status = st;
    const sum = typeof t.summary === "string" ? t.summary.replace(/\s+/g, " ").trim().slice(0, SUMMARY_MAX) : "";
    if (sum) d.summary = sum;
    else if (st !== "done" && st !== "needs-input") delete d.summary;
    if (st === "failed") d.error = (typeof t.error === "string" && t.error.slice(0, 300)) || d.error || "The agent stopped.";
    else delete d.error;
    if (typeof t.model === "string" && t.model) d.model = t.model.slice(0, 60);
    if (typeof t.effort === "string" && t.effort) d.effort = t.effort.slice(0, 40);
    const changed = JSON.stringify([d.status, d.summary, d.error, d.model, d.effort]) !== before;
    if (changed) {
      applyStatus(f);
      applyModel(f);
      autoGrow(f);
    }
    return changed;
  }
  function linkNote(f, taskId, task) {
    const p = state.pending.get(f.data.id);
    if (p) clearTimeout(p.timer);
    state.pending.delete(f.data.id);
    f.data.taskId = taskId;
    if (f.data.status === "draft" || f.data.status === "failed") f.data.status = "queued";
    delete f.data.error;
    state.counts.linked++;
    const A = agentApi();
    let t = task || null;
    if (!t && A && typeof A.task === "function")
      try {
        t = A.task(taskId);
      } catch (_) {}
    if (t) applyTask(f, t);
    applyStatus(f);
    save(f.m);
    fire("rtcn:linked", { noteId: f.data.id, taskId });
    return true;
  }
  function link(noteId, taskOrId) {
    const id = idOf(taskOrId);
    const f = noteById(noteId);
    if (!f || !id) return false;
    return linkNote(f, id, typeof taskOrId === "object" ? taskOrId : null);
  }
  function failNote(noteId, why) {
    const p = state.pending.get(noteId);
    if (p) clearTimeout(p.timer);
    state.pending.delete(noteId);
    const f = noteById(noteId);
    if (!f) return;
    f.data.status = "failed";
    f.data.error = why;
    state.agent.lastError = why;
    applyStatus(f);
    autoGrow(f);
    save(f.m);
  }
  function canvasNameOf(key) {
    const last = String(key || "").replace(/\/+$/, "").split("/").pop() || "Canvas";
    return last.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  function flash(f) {
    f.el.removeAttribute("data-flash");
    void f.el.offsetWidth; // restart the animation
    f.el.setAttribute("data-flash", "");
    clearTimeout(f.flashTimer);
    f.flashTimer = setTimeout(() => f.el.removeAttribute("data-flash"), 1300);
  }
  // Run: the prompt becomes a canvas task.
  function submit(f) {
    const d = f.data;
    if (state.editing === f) endEdit(f, true);
    if (d.kind !== "prompt" || !d.text.trim() || busy(d)) return false;
    const pk = currentPick(f);
    if (pk.model) d.model = pk.model;
    if (pk.effort) d.effort = pk.effort;
    if (pk.modelId) d.modelId = pk.modelId;
    if (pk.effortId) d.effortId = pk.effortId;
    retarget(f);
    const ctxNotes = contextFor(f);
    const context = ctxNotes.length ? "Context:\n" + ctxNotes.map((o) => o.data.text.trim()).join("\n\n") : null;
    d.status = "queued";
    d.sentAt = Date.now();
    delete d.taskId;
    delete d.summary;
    delete d.error;
    const m = f.m;
    const rh = renderedH(f);
    const payload = {
      text: d.text.trim() + (context ? "\n\n" + context : ""),
      prompt: d.text.trim(),
      context,
      contextNotes: ctxNotes.map((o) => o.data.id),
      canvasName: canvasNameOf(m.key),
      canvasPath: m.key,
      workspacePath: m.ws || null,
      storyboardName: itemName(m, d.targetId),
      anchor: { x: Math.round(d.x + d.w / 2), y: Math.round(d.y + rh / 2), nodeId: d.targetId || null, noteId: d.id },
      source: "note",
      noteId: d.id,
      model: d.model || null,
      effort: d.effort || null,
      modelId: d.modelId || null,
      effortId: d.effortId || null,
    };
    const noteId = d.id;
    const p = { at: Date.now(), timer: setTimeout(() => failNote(noteId, "No agent picked this up: the comment agent needs createTask() or an rtcn:submit listener."), LINK_MS) };
    state.pending.set(noteId, p);
    state.counts.submitted++;
    flash(f);
    applyStatus(f);
    applyModel(f);
    save(m);
    const A = ensureAgent();
    state.lastSubmit = { at: p.at, noteId, via: null, payload: { ...payload, anchor: { ...payload.anchor } } };
    if (A && typeof A.createTask === "function") {
      state.lastSubmit.via = state.agent.via = "createTask";
      Promise.resolve()
        .then(() => A.createTask(payload))
        .then((r) => {
          const id = idOf(r);
          if (id) link(noteId, r);
          else if (state.pending.has(noteId)) failNote(noteId, "The agent did not accept the note.");
        })
        .catch((e) => failNote(noteId, "The agent refused the note: " + msg(e)));
      return true;
    }
    state.lastSubmit.via = state.agent.via = "event";
    const detail = {
      ...payload,
      taskId: null,
      respond: (r) => link(noteId, r),
    };
    fire("rtcn:submit", detail);
    if (detail.taskId) link(noteId, detail.taskId);
    else refreshFromTasks();
    return true;
  }
  function openTask(taskId) {
    if (!taskId) return false;
    try {
      const B = window.__RE_TEMPO_COMMENT_BUBBLES__;
      if (B && typeof B.open === "function") {
        const r = B.open(taskId);
        if (r !== false) return true;
      }
    } catch (_) {}
    try {
      const A = agentApi();
      if (A && typeof A.openChat === "function") return !!A.openChat(taskId);
    } catch (_) {}
    return false;
  }

  // ------------------------------------------------------------ the tool
  function arm(m) {
    if (!m || !m.root.isConnected) return false;
    disarm();
    deselect();
    // One draw tool at a time.
    for (const k of ["__RE_TEMPO_CANVAS_BROWSER__", "__RE_TEMPO_CANVAS_SHADER__"])
      try {
        const o = window[k];
        if (o && typeof o.state === "function" && o.state().tool && typeof o.disarm === "function") o.disarm();
      } catch (_) {}
    const overlay = h("div", { class: "rtcn-draw-overlay", "data-rtcn-draw": "" });
    const ghost = h("div", { class: "rtcn-ghost", "aria-hidden": "true" });
    m.root.appendChild(overlay);
    state.tool = { m, overlay, ghost, preview: null };
    document.documentElement.setAttribute("data-rtcn-armed", "");
    overlay.addEventListener("pointermove", (e) => {
      if (state.tool && !state.tool.preview) moveGhost(e);
    });
    overlay.addEventListener("pointerleave", () => ghost.remove());
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
  // Pen's ghost: the note's box centred on the pointer.
  function moveGhost(e) {
    const t = state.tool;
    const p = toWorld(t.m, e.clientX, e.clientY);
    if (!t.ghost.isConnected) t.m.layer.appendChild(t.ghost);
    Object.assign(t.ghost.style, { transform: `translate(${Math.round(p.x - DEFAULT_W / 2)}px, ${Math.round(p.y - DEFAULT_H / 2)}px)`, width: DEFAULT_W + "px", height: DEFAULT_H + "px" });
  }
  function disarm() {
    const t = state.tool;
    if (!t) return;
    state.tool = null;
    t.overlay.remove();
    t.ghost.remove();
    if (t.preview) t.preview.remove();
    document.documentElement.removeAttribute("data-rtcn-armed");
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
    const label = h("div", { class: "rtcn-size" });
    const pv = h("div", { class: "rtcn-draw-preview" }, label);
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
        t.ghost.remove();
        m.layer.appendChild(pv);
      }
      const r = rectFrom(ev);
      Object.assign(pv.style, { transform: `translate(${r.x}px, ${r.y}px)`, width: Math.max(MIN_W, r.w) + "px", height: Math.max(MIN_H, r.h) + "px" });
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
      const r = dragged ? rectFrom(ev) : { x: Math.round(a.x - DEFAULT_W / 2), y: Math.round(a.y - DEFAULT_H / 2), w: DEFAULT_W, h: DEFAULT_H };
      disarm(); // Pen: back to the move tool
      createIn(m, { ...r, kind: "prompt" });
    };
    t.overlay.addEventListener("pointermove", move);
    t.overlay.addEventListener("pointerup", up);
    t.overlay.addEventListener("pointercancel", up);
  }

  // ------------------------------------------------------------------ route
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
  // The canvas chrome mod, when there is one, owns the tool.
  function chromeRegister() {
    const C = window.__RE_TEMPO_CANVAS_CHROME__;
    if (!C || typeof C.registerTool !== "function" || C === state.chrome.api) return state.chrome.registered;
    state.chrome.api = C;
    let ok = false;
    try {
      ok = !!C.registerTool({
        id: "sticky-note",
        label: "Sticky note",
        key: TOOL_KEY.toUpperCase(),
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS.note}</svg>`,
        order: "before:browser",
        isActive: () => !!state.tool,
        activate: (root) => {
          const m = (root && state.mounts.get(root)) || toolTarget() || visibleMount();
          return m ? arm(m) : false;
        },
        deactivate: () => disarm(),
      });
    } catch (_) {
      ok = false;
    }
    state.chrome.registered = ok;
    if (ok) for (const el of document.querySelectorAll("[data-rtcn-tool], [data-rtcn-sep]")) el.remove();
    return ok;
  }
  function injectToolbars() {
    if (chromeRegister()) return;
    let added = false;
    for (const tb of document.querySelectorAll(TOOLBAR)) {
      let b = tb.querySelector(":scope > [data-rtcn-tool]");
      const browserBtn = tb.querySelector(":scope > [data-rtbf-tool]");
      if (!b) {
        added = true;
        b = h("button", { type: "button", class: "rtcn-tool", "aria-label": "Sticky note", "aria-pressed": "false", "data-rtcn-tool": "", "data-testid": "canvas-notes-tool" });
        b.append(icon("note", "size-4 rtcn-ic", 1.5));
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
        if (!tb.__rtcnWired) {
          tb.__rtcnWired = true;
          tb.addEventListener("click", (e) => {
            const nb = e.target.closest("button");
            if (nb && !nb.hasAttribute("data-rtcn-tool")) disarm();
          });
        }
      }
      // Pen's order: the sticky note right before the browser. Next to
      // canvas-browser's button it shares that tool's separator.
      const mySep = tb.querySelector(":scope > [data-rtcn-sep]");
      if (browserBtn) {
        if (mySep) mySep.remove();
        if (b.nextElementSibling !== browserBtn) tb.insertBefore(b, browserBtn);
      } else if (!b.isConnected || !mySep) {
        const sepNative = tb.querySelector(":scope > div.w-px:not([data-rtbf-sep])");
        const sep = h("div", { class: (sepNative && sepNative.className) || "h-5 w-px shrink-0 bg-border-secondary", "data-rtcn-sep": "" });
        sep.classList.add("rtcn-tool-sep");
        if (b.isConnected) tb.insertBefore(sep, b);
        else tb.append(sep, b);
      }
    }
    if (added) refreshToolButtons();
  }
  function refreshToolButtons() {
    for (const b of document.querySelectorAll("button[data-rtcn-tool]")) {
      const tb = b.closest(TOOLBAR);
      const on = !!state.tool && !!tb && rootForToolbar(tb) === state.tool.m.root;
      const cls = `${BTN_BASE} ${on ? BTN_ON : BTN_IDLE} rtcn-tool`;
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
    const el = h("div", { class: "rtcn-tooltip", role: "tooltip" }, h("span", { text: "Sticky note" }), h("kbd", { class: "rtcn-kbd", text: TOOL_KEY.toUpperCase() }));
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

  // ------------------------------------------------------------- global keys
  function onKeyDown(e) {
    if (!state.enabled || e.isComposing) return;
    if (e.key === " " && !isEditable(e.target)) state.spaceDown = true;
    const ae = document.activeElement;
    if (state.tool && e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      disarm();
      return;
    }
    // Escape leaves the note's text (the textarea's own handler runs later,
    // the app's window listeners would see the key first otherwise).
    if (state.editing && (e.target === state.editing.els.text || ae === state.editing.els.text)) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        endEdit(state.editing, true);
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        submit(state.editing);
      }
      return;
    }
    if (state.menu) return; // the menu handles its keys
    const typing = isEditable(e.target) || isEditable(ae);
    if (typing || (ae && /^(IFRAME|WEBVIEW)$/.test(ae.tagName))) return;
    const plain = !e.metaKey && !e.ctrlKey && !e.altKey;
    const f = state.selected;
    if (f && f.el.isConnected) {
      if (plain && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        removeNote(f, true);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        deselect();
        return;
      }
      if (plain && !e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        startEdit(f);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        submit(f);
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
        clearTimeout(f.nudgeTimer);
        f.nudgeTimer = setTimeout(() => {
          retarget(f);
          save(f.m);
        }, 400);
        return;
      }
    }
    if (state.chrome.registered) return; // the chrome owns the N key
    if (plain && !e.shiftKey && !e.repeat && e.key.toLowerCase() === TOOL_KEY) {
      const ctx = !ae || ae === document.body || !!ae.closest(CANVAS_ROOT + ", " + TOOLBAR + ", .rtcn-note, .rtbf-frame");
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
    if (state.menu && !(t && t.closest && t.closest("[data-rtcn-menu], [data-rtcn-menu-trigger]"))) closeMenu();
    const root = t && t.closest ? t.closest(CANVAS_ROOT) : null;
    if (root) state.lastRoot = root;
    if (t && t.closest && t.closest(".rtcn-note, [data-rtcn-toast], [data-rtcn-tool], [data-rtcn-draw], [data-rtcn-menu]")) return;
    if (state.selected) deselect();
  }
  function onWindowBlur() {
    setTimeout(() => {
      const ae = document.activeElement;
      if (!ae || !state.selected) return;
      if (/^(IFRAME|WEBVIEW)$/.test(ae.tagName) && !ae.closest(".rtcn-note")) deselect();
    }, 0);
  }
  function onTasksEvent(e) {
    const list = e && e.detail && e.detail.tasks;
    if (Array.isArray(list)) onTasks(list);
  }

  // ------------------------------------------------------------------- sync
  function teardownAll() {
    disarm();
    hideToast();
    hideTooltip();
    closeMenu();
    deselect();
    for (const p of state.pending.values()) clearTimeout(p.timer);
    state.pending.clear();
    for (const m of Array.from(state.mounts.values())) unmount(m);
    for (const el of document.querySelectorAll("[data-rtcn-tool], [data-rtcn-sep]")) el.remove();
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
    if (document.hidden || boot.disposed) return;
    const on = flagOn();
    if (on !== state.enabled) {
      state.enabled = on;
      if (!on) teardownAll();
    }
    if (!on) return;
    state.lastSync = Date.now();
    syncMounts(true);
    injectToolbars();
    ensureAgent();
    if (state.tool && (!isShown(state.tool.m.root) || document.documentElement.hasAttribute("data-rtbf-armed"))) disarm();
    if (state.toast && !isShown(state.toast.root)) hideToast();
    if (state.tooltip && !state.tooltip.anchor.isConnected) hideTooltip();
    if (state.menu && !state.menu.f.el.isConnected) closeMenu();
    for (const m of state.mounts.values()) {
      follow(m);
      // composer model on the draft prompts
      for (const f of m.notes.values()) if (f.data.kind === "prompt") applyModel(f);
      applyContext(m);
    }
    const f = state.selected;
    if (f) {
      if (!f.el.isConnected) state.selected = null;
      else
        try {
          const hd = f.m.handle;
          if (state.editing !== f && hd && typeof hd.getSelection === "function" && hd.getSelection().length) deselect();
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
  const boot = { interval: null, observer: null, listeners: [], disposed: false };
  const listen = (target, type, fn, opt) => {
    target.addEventListener(type, fn, opt);
    boot.listeners.push([target, type, fn, opt]);
  };
  listen(window, "keydown", onKeyDown, true);
  listen(window, "keyup", onKeyUp, true);
  listen(window, "pointerdown", onPointerDownCapture, true);
  listen(window, "blur", onWindowBlur);
  listen(window, "rtcc:changed", onTasksEvent);
  listen(window, "storage", (e) => {
    if (e.key === FLAG_KEY) return sync();
    if (!e.key || !e.key.startsWith(STORE_PREFIX)) return;
    const key = e.key.slice(STORE_PREFIX.length);
    for (const m of mountsOf(key)) if (!m.nodes) reconcile(m, loadLocal(key));
  });
  listen(window, "rtd:canvas-nodes-ready", () => {
    registerNodeType(window.__RE_TEMPO_CANVAS_NODES__);
    scheduleQuick();
  });
  listen(window, "rtd:canvas-chrome-ready", () => scheduleQuick());
  // Unsaved edits go to canvas-nodes (and its write starts) before the page goes.
  listen(window, "pagehide", () => {
    let any = false;
    for (const m of state.mounts.values())
      if (m.saveTimer) {
        save(m);
        any = any || !!m.nodes;
      }
    const N = any ? nodesApi() : null;
    if (N && typeof N.flush === "function") N.flush().catch(() => {});
  });
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
    if (state.agent.off)
      try {
        state.agent.off();
      } catch (_) {}
    state.agent.off = null;
    state.agent.api = null;
    teardownAll();
    if (window.__RE_TEMPO_CANVAS_NOTES__ === api) delete window.__RE_TEMPO_CANVAS_NOTES__;
    return true;
  }

  // ----------------------------------------------------------------- format
  function format() {
    return {
      type: NODE_TYPE,
      where: "a node of the reTempoCanvasNodes block in <canvasPath>/index.canvas.tsx (window.__RE_TEMPO_CANVAS_NODES__.format() for the block)",
      fields: {
        id: "string, unique (sn_...)",
        type: '"note"',
        x: "number, canvas units (the storyboards' layout space)",
        y: "number",
        w: "number, min 250 (default 250)",
        h: "number, least height, min 120 (default 219); the card grows with its text",
        text: "the note's text (for a prompt: the instruction the agent runs)",
        kind: '"prompt" (blue, has Run) | "context" (grey, added to the prompts of the same storyboard) | "note" (yellow, an annotation; the default)',
        status: '"draft" | "queued" | "running" | "needs-input" | "done" | "failed" (written by the app; "draft" for a new note)',
      },
      optional: {
        model: 'label of the model picked on the note or used by its last run ("Opus 5.5"); none = the composer\'s',
        effort: 'label of its effort ("High")',
        modelId: 'the app\'s model id ("opus-5.5-1m")',
        effortId: 'the app\'s effort id ("low" | "medium" | "high" | "xhigh" | "max")',
        targetId: "the storyboard (canvas item id) the note sits on; the note moves with it",
        targetX: "that storyboard's x when the note was placed",
        targetY: "that storyboard's y when the note was placed",
        taskId: "the comment-agent task the note started",
        summary: "the task's result, <= 300 chars",
        error: "why the last run failed",
        sentAt: "ms timestamp of the last run",
        z: "stacking order among notes",
      },
      rules: [
        "Put a note over a storyboard to attach it (leave targetId out: the app fills it in).",
        "An agent writes kind \"note\" for remarks; a \"prompt\" note only runs when the designer presses Run.",
        "Context notes are never sent alone: their text joins every prompt of the same storyboard (targetId), top to bottom.",
        "Leave status, taskId, summary and error to the app.",
      ],
      example: { id: "sn_hero", type: "note", x: 40, y: 120, w: 250, h: 219, text: "Hero copy is too long on mobile", kind: "note", status: "draft" },
      submit: {
        api: "window.__RE_TEMPO_COMMENT_AGENT__.createTask(payload) -> task | id | Promise",
        event: 'window event "rtcn:submit", detail = payload + respond(taskOrId), when createTask is missing',
        payload: "{text (the prompt, then a blank line and the context when there is some), prompt, context (\"Context:\\n...\" or null), contextNotes: [ids], canvasName, canvasPath, workspacePath, storyboardName, anchor: {x, y, nodeId, noteId}, source: \"note\", noteId, model, effort, modelId, effortId}",
      },
    };
  }

  // ---------------------------------------------------------- introspection
  const pub = (f) => ({
    ...f.data,
    renderedH: renderedH(f),
    selected: state.selected === f,
    editing: state.editing === f,
    pending: state.pending.has(f.data.id),
    shownModel: (() => {
      const p = currentPick(f);
      return (p.model || "") + (p.effort ? " · " + p.effort : "");
    })(),
    shownLabels: [f.els.modelLabel.textContent, f.els.effortLabel.textContent],
    contextCount: f.els.ctx.hidden ? 0 : contextFor(f).length,
  });
  const api = {
    version: 1,
    get enabled() {
      return state.enabled;
    },
    state: () => ({
      enabled: state.enabled,
      tool: !!state.tool,
      selected: state.selected ? state.selected.data.id : null,
      editing: state.editing ? state.editing.data.id : null,
      menu: !!state.menu,
      toast: !!state.toast,
      pending: Array.from(state.pending.keys()),
      counts: { ...state.counts },
      lastSync: state.lastSync,
      disposed: boot.disposed,
      agent: { found: !!agentApi(), createTask: !!(agentApi() && typeof agentApi().createTask === "function"), subscribed: !!state.agent.off, via: state.agent.via, lastError: state.agent.lastError },
      chrome: { found: !!window.__RE_TEMPO_CANVAS_CHROME__, registered: state.chrome.registered },
      lastSubmit: state.lastSubmit,
      mounts: Array.from(state.mounts.values()).map((m) => ({ key: m.key, workspacePath: m.ws, persistence: m.nodes ? "canvas-file" : "localStorage", visible: isShown(m.root), notes: Array.from(m.notes.values()).map(pub) })),
    }),
    notes: (key) => {
      const m = key ? visibleMount(key) || mountsOf(key)[0] : visibleMount();
      return m ? Array.from(m.notes.values()).map(pub) : [];
    },
    stored: (key) => {
      const N = nodesApi();
      const k = key || (visibleMount() || {}).key;
      if (N && k) return N.list(k).filter((n) => n.type === NODE_TYPE).map(fromNode);
      return k ? loadLocal(k) : [];
    },
    create: (opts) => {
      const m = visibleMount();
      return m ? createIn(m, { edit: false, ...(opts || {}) }).data.id : null;
    },
    remove: (id, withUndo) => {
      const f = noteById(id);
      return f ? (removeNote(f, withUndo), true) : false;
    },
    select: (id) => {
      const f = id ? noteById(id) : null;
      if (f) select(f);
      else deselect();
      return !!f;
    },
    edit: (id) => {
      const f = noteById(id);
      return f ? startEdit(f) : false;
    },
    setText: (id, text) => {
      const f = noteById(id);
      if (!f || typeof text !== "string") return false;
      f.data.text = text.slice(0, TEXT_MAX);
      applyAll(f);
      save(f.m);
      return true;
    },
    setKind: (id, kind) => {
      const f = noteById(id);
      return f ? setKind(f, kind) : false;
    },
    submit: (id) => {
      const f = noteById(id);
      return f ? submit(f) : false;
    },
    link,
    open: (id) => {
      const f = noteById(id);
      return f ? openTask(f.data.taskId) : false;
    },
    undo,
    arm: () => arm(toolTarget() || visibleMount()),
    disarm,
    sync,
    follow: () => Array.from(state.mounts.values()).reduce((a, m) => a + follow(m), 0),
    format,
    storageKey: (key) => STORE_PREFIX + key,
    route: () => {
      const m = visibleMount();
      return m ? navRoute(m) : null;
    },
    dispose,
  };
  window.__RE_TEMPO_CANVAS_NOTES__ = api;
})();
