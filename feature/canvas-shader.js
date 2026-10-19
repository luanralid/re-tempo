/*
 * RE-TEMPO · canvas-shader (user MOD layer)
 * ---------------------------------------------------------------------------
 * A "Shader frame" on the design canvas: a live WebGL 2 fragment shader that
 * fills a frame placed in canvas coordinates next to the storyboards and the
 * browser frames. It pans and zooms with the canvas, can be moved, resized,
 * renamed, deleted (with Undo) and is saved per canvas. Its settings (preset,
 * speed, play / pause, the controls generated from the uniform annotations,
 * a live GLSL editor with the compiler log, exports: PNG, 5 s WebM,
 * standalone embed snippet) live in the canvas's Properties panel (see
 * "Properties" below).
 *
 * Copied from pen.dev (Pencil), whose shader fills/effects are GLSL fragment
 * shaders (renderer bundle out/editor/assets/index.js, read on 2026-10-18):
 *   1. Source: GLSL ES 3.00 with a single `out vec4` or GLSL ES 1.00 with
 *      gl_FragColor. Only gl_FragCoord and uniforms are inputs ("The shader
 *      must not use anything but gl_FragCoord and uniforms!"); `in`/`varying`
 *      and more than one `out` are errors, with the same messages.
 *   2. A uniform is annotated by the /** doc comment right before it. Lines
 *      hold directives: @label <text>, @color, @range(min, max), @min, @max,
 *      @default <number | n, n, n | #hex | true | false>, @resolution, @time,
 *      @mouse, @mipmap, @content, @backdrop, @sdf. Args run to the next "@"
 *      or sit in parentheses. Unknown directives and type mismatches throw
 *      the same errors as pen ("@color requires vec3 or vec4", ...).
 *   3. Controls by type: float/int with a range -> slider (step (max-min)/100,
 *      int 1), without -> number field; bool -> checkbox; @color vec3/vec4 ->
 *      colour picker (alpha for vec4); vecN -> N fields; sampler2D -> texture
 *      source. resolution/time/mouse have no control. Label = @label or name.
 *   4. Automatic uniforms: @resolution = the frame size in canvas units,
 *      gl_FragCoord in the same units (y up, so the shader is resolution
 *      independent), @time = seconds accumulated per frame (paused frames keep
 *      their phase), @mouse = pointer in frame units (y up), eased toward the
 *      pointer at rate 5/s, centre by default. A shader with @time or @mouse
 *      is "animated".
 * What pen does not have (or does through Skia) follows the brief instead:
 * one shared offscreen WebGL 2 context renders every frame and the image is
 * copied with drawImage into each frame's 2D canvas; built-in textures stand
 * in for pen's @backdrop/@content; 8 presets written for this mod.
 *
 * What the app does (assets/index-D2Ui1vc0.js, RE-TEMPO build of 2026-10-14):
 * same canvas facts as canvas-browser.js. [data-canvas-root] holds the world
 * layer .tds-canvas-shimmer-origin (translate3d + scale, --canvas-unzoom on
 * the root); the canvas handle (React fiber ref) gives getView(),
 * getSelection(), clearSelection(), getWorldOverlayHost(). Frames mount in the
 * world layer: same transform, no drift by construction. Selection outline,
 * handles, size pill, header, toolbar button classes, tooltip and toast copy
 * the storyboards' and canvas-browser's.
 *
 * Interaction: click selects; drag the frame or its
 * header to move; edges/corners resize (Shift keeps the ratio); double-click
 * the title to rename, the frame body to open the GLSL editor;
 * Delete/Backspace removes it with a 5 s "Undo" toast; arrows nudge (Shift
 * x10); Escape closes the editor, then deselects. Create: create() (the New
 * page) places one 800x500 in the middle of the view, or a node written in the
 * canvas file. The bottom toolbar's Shader tool and the S key were removed on
 * 2026-10-18 (the user: the WebGL shader belongs in Effects, not in the base
 * tools), and so was the "Shader on Canvas" item of the tab bar's "+" menu (the
 * user: that menu only opens new windows). A stale copy of that item
 * (data-rtsh-plus) is swept.
 *
 * Effects (like pen.dev, where a shader is a fill/effect of a node): with one
 * storyboard selected, the canvas's own right panel ([data-testid=
 * "canvas-right-panel"], properties tab "canvas-design-tab") gets an
 * "Effects" section built with the app's section classes (A$ in the bundle:
 * data-section-header, h-[40px] header, k$ icon buttons, 28 px rows).
 * "+" > "Add effect" > "Shader" adds one; a row opens (and closes) its
 * settings, the same controls as a frame's plus Mode (Background: under the
 * storyboard's content, covering the frame; Overlay: over it with a blend
 * mode), Blend, Opacity, order (up/down) and Remove (see "Properties").
 * Effects stack in list order (background ones bottom-up, then overlays).
 * They mount inside the storyboard item (div[data-storyboard-id], the app's
 * position:relative 100% box), so they follow pan, zoom, moves and resizes by
 * construction; that box gets isolation:isolate while it has effects, so a
 * background effect (z-index -1) sits above the box and below everything in
 * it, and an overlay (z-index 10) blends with the storyboard's pixels only.
 * A background effect shows where the storyboard's own content is
 * transparent. The canvas has no storyboard context menu (only the layers
 * tree has one), so there is no menu entry.
 *
 * Properties (2026-10-19, the user: "this shader config should live in the
 * sidebar that's already there, not floating like this"): the settings are parts (core:
 * an effect's Mode / Blend / Opacity, Preset, Speed, Edit GLSL; Parameters:
 * status, the uniform fields, the automatic uniforms as chips, play / pause
 * and "Reset to the preset" in its header; Export, frames only: PNG, WebM,
 * Embed). With canvas-chrome (window.__RE_TEMPO_CANVAS_CHROME__.
 * registerRightSection) laying out the target's canvas view, each part is a
 * section of its right panel, the card the selection pill ("✦ Halftone",
 * Properties toggle) heads: a frame's "Shader" (31), "Parameters" (32) and
 * "Export" (33) right after canvas-props' parts (26..31); an effect's
 * "Shader effect" (112) and "Parameters" (113) right under the Effects
 * section (111). Unified with the other mods, never duplicated: canvas-props
 * already draws Preset, Speed and Edit GLSL for a frame saved in the canvas
 * file (its "Shader" section, which calls openEditor), so this mod's core
 * section stays out then (it shows without canvas-props, its flag off or in
 * localStorage mode). canvas-export's Code / Export sections are a
 * storyboard's (its image includes the effects); the Export section here is
 * the frame's own shader output and an effect has none. Nothing floats on
 * selection, and a selection never opens the panel, with one exception: the
 * first shader frame selected in a session opens it once (sessionStorage
 * "rtd.canvasShader.propsOnce"; the controls used to appear next to the
 * frame, this shows where they went). An effect is opened from the panel or
 * by openEffect(), which shows the panel. Clicks in the properties card or
 * the pill keep the frame selected. Sections come in with the shared motion
 * (220 ms, out-expo, a 6 px slide, 40 ms apart), leave in 140 ms (in-out),
 * another target's content crossfades in 140 ms; reduce motion: opacity
 * only. Edit GLSL opens a sheet docked 8 px left of the card (pen.dev's
 * popovers beside the properties), as tall as the card (pill top to card
 * bottom), up to 560 px wide (at least 360, clear of the left card and the
 * tool rail when there is room); it slides 12 px in 220 ms and lives while
 * the properties are open (Edit GLSL opens them; closing them closes it).
 * Without the chrome laying out the view (its flag off, absent, refusing
 * the sections, or a view narrower than 720 px): while the view's own right
 * panel is open, the same sections go into its design tab (a frame's first,
 * after canvas-props' own panel when it is there; an effect's under the
 * Effects section; the sheet docked left of that panel). Only with no
 * panel open (the old behaviour, so the mod never depends on another) do
 * the parts stack in the panel floating next to the frame (an effect's: a
 * popover left of the Effects section), the editor beside it, or in its
 * place when the view is too narrow for both. The dock moves between these
 * hosts by itself (rehost) when that changes. *
 * Rendering: 30 fps cap; devicePixelRatio capped at 1.5; frame pixels capped
 * (2048 px side, 3.1 MP); half resolution while the view pans/zooms; at most
 * 8 frames per tick; nothing renders for a frame outside the canvas viewport
 * (IntersectionObserver + view rect), a canvas that is not on screen, a
 * hidden document, or (prefers-reduced-motion) after one static image.
 *
 * Storage: the canvas file itself, through feature/canvas-nodes.js (loaded
 * from this script's folder; see its header for the evidence), in the
 * reTempoCanvasNodes block at the end of <canvasPath>/index.canvas.tsx:
 *   frame: {id, type: "shader", x, y, w, h, preset, glsl?, uniforms, title,
 *     speed?, paused?, z?} (glsl omitted while it is the preset's)
 *   effects: {id: "sb_<storyboard id>", type: "storyboard", storyboard:
 *     "<storyboard id>", effects: [{id, type: "shader", mode: "background" |
 *     "overlay", preset, glsl?, uniforms, opacity: 0..1, blend: a CSS
 *     mix-blend-mode, speed?, paused?}]}
 * so the agent and git see them, and an edit of the file updates the canvas.
 * Until canvas-nodes answers no canvas is mounted; without it (or without the
 * app's file bridge, e.g. a plain test page) frames stay in localStorage
 * "rtd.canvasShader.v1:<canvasPath>" = {v, frames: [{id, x, y, w, h, z, name,
 * named, preset, glsl, uniforms, speed, paused}]} (migrated into the file
 * once by canvas-nodes) and effects in "rtd.canvasShader.fx.v1:<canvasPath>".
 * Flag: localStorage "rtd.canvasShader" = "off" disables everything (live).
 * Introspection: window.__RE_TEMPO_CANVAS_SHADER__ (frames: state(), frames(),
 * create(), remove(), ...; effects: effects(), addEffect(), updateEffect(),
 * moveEffect(), removeEffect(), openEffect(); state().host / .sheet / .side:
 * where the settings are; dispose()). The 400 ms sync, the
 * DOM observer and the render loop skip a hidden tab (a catch-up sync runs
 * when it shows again); dispose() clears them, the listeners, every frame and
 * effect, and the GL context.
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (window.__RE_TEMPO_CANVAS_SHADER__) return; // double injection
  // Where canvas-nodes.js is: next to this script (./mod/ in the app).
  const SELF_SRC = (document.currentScript && document.currentScript.src) || "";

  // ------------------------------------------------------------------ config
  const FLAG_KEY = "rtd.canvasShader";
  const STORE_PREFIX = "rtd.canvasShader.v1:";
  const CANVAS_ROOT = "[data-canvas-root]";
  const WORLD_LAYER = ".tds-canvas-shimmer-origin";
  const TOOLBAR = '[role="toolbar"][aria-label="Design tools"]';
  const DEFAULT_W = 800;
  const DEFAULT_H = 500;
  const MIN_W = 64;
  const MIN_H = 64;
  const DRAG_SLOP = 3;
  const UNDO_MS = 5000;
  const SYNC_MS = 400;
  const QUICK_MS = 80;
  const MAX_FIBER_DEPTH = 600;
  const NODES_FILE = "canvas-nodes.js";
  const NODES_WAIT_MS = 4000; // then mount with localStorage
  const NODE_TYPE = "shader";
  const FX_TYPE = "storyboard"; // canvas-file node that carries a storyboard's effects
  const FX_PREFIX = "rtd.canvasShader.fx.v1:"; // localStorage fallback for effects
  const FX_MODES = ["background", "overlay"];
  const FX_BLENDS = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"];
  const FX_NEW = { mode: "overlay", blend: "screen", opacity: 0.8 };
  const RIGHT_PANEL = '[data-testid="canvas-right-panel"]';
  const DESIGN_TAB = '[data-testid="canvas-design-tab"]';
  const SHELL = "[data-canvas-shell]";
  // The GLSL sheet beside canvas-chrome's right panel: its gap to the card,
  // its widest and its narrowest size before it may cover the left column.
  const SHEET_GAP = 8;
  const SHEET_W = 560;
  const SHEET_MIN_W = 360;
  // sessionStorage: "1" once a shader frame selection opened the properties
  const PROPS_ONCE_KEY = "rtd.canvasShader.propsOnce";
  // The app's section and row classes (A$, k$ and the canvas background row).
  const FX_HEAD = "h-[40px] flex items-center pl-[16px] pr-[8px] py-[8px]";
  const FX_TITLE = "text-[12px] leading-[15px] font-[510] truncate capitalize";
  const FX_BODY = "border-b border-border-secondary flex flex-col gap-[8px] pb-[12px] pl-[16px] pr-[8px]";
  const FX_ICON_BTN = "flex items-center justify-center gap-[3px] p-[6px] rounded-[6px] [&>*]:size-[16px] text-icons-secondary hover:bg-accent-subtle-hover disabled:opacity-40 disabled:pointer-events-none";
  const FX_ROW_BTN = "bg-surface-container flex h-[28px] w-full min-w-0 items-center gap-[8px] rounded-[6px] pl-[8px] pr-[8px] text-left outline outline-1 -outline-offset-1 outline-transparent hover:outline-accent-subtle-hover data-[popup-open]:outline-lavender!";
  const TOOLTIP_DELAY = 400;
  const FPS = 30;
  const FRAME_MS = 1000 / FPS;
  const DPR_MAX = 1.5;
  const MOVE_SCALE = 0.5;
  const MOVE_SETTLE_MS = 180;
  const MAX_DIM = 2048;
  const MAX_AREA = 2048 * 1536;
  const MAX_PER_TICK = 8;
  const MOUSE_RATE = 5; // pen's easing rate toward the pointer (1/s)
  const PNG_SCALE = 2;
  const PNG_MAX_DIM = 4096;
  const WEBM_MS = 5000;
  const WEBM_MAX_DIM = 1280;
  const COMPILE_DEBOUNCE = 220;
  const CACHE_MAX = 24;
  const TEX_SIZE = 512;
  const BTN_BASE = "flex size-7 items-center justify-center rounded-md transition-colors";
  const BTN_IDLE = "text-icons-primary hover:bg-surface-container-highest";
  const BTN_ON =
    "button-accent-lavender bg-accent-subtle text-accent [[data-theme=light]_&]:bg-surface-lavender [[data-theme=light]_&]:text-text-lavender";

  const state = {
    enabled: true,
    mounts: new Map(),
    selected: null,
    tool: null,
    lastRoot: null,
    toast: null,
    tooltip: null,
    dock: null,
    reduced: false,
    lastSync: 0,
    loop: { raf: 0, last: 0, rr: 0, keep: false },
    lastDownload: null,
    lastCopied: null,
    counts: { created: 0, removed: 0, restored: 0, ticks: 0, renders: 0, compiles: 0 },
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
        return true;
      } catch (_) {
        return false;
      }
    },
    del(k) {
      try {
        localStorage.removeItem(k);
      } catch (_) {}
    },
  };
  const flagOn = () => ls.get(FLAG_KEY) !== "off";
  const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const uid = () => "sf_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const isShown = (el) => {
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === "function" && !el.checkVisibility()) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // isShown() forces a style/layout flush; the per-frame loops read this cache
  // instead. It is refreshed on show/hide/resize (observers on the canvas root),
  // on the visibility change and by every sync().
  const mountShown = (m) => m.vis;
  const refreshVis = (m) => {
    const was = m.vis;
    m.vis = isShown(m.root);
    if (m.vis && !was) wake();
    return m.vis;
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
    sparkles:
      '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    up: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
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
  const fmt = (v, int) => (int ? String(Math.trunc(v)) : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));

  // ----------------------------------------------------------------- colour
  function parseHex(hex) {
    const s = String(hex || "").trim().replace(/^#/, "");
    if (!/^[0-9a-f]+$/i.test(s)) return null;
    let r, g, b, a = 255;
    if (s.length === 3 || s.length === 4) {
      r = parseInt(s[0] + s[0], 16);
      g = parseInt(s[1] + s[1], 16);
      b = parseInt(s[2] + s[2], 16);
      if (s.length === 4) a = parseInt(s[3] + s[3], 16);
    } else if (s.length === 6 || s.length === 8) {
      r = parseInt(s.slice(0, 2), 16);
      g = parseInt(s.slice(2, 4), 16);
      b = parseInt(s.slice(4, 6), 16);
      if (s.length === 8) a = parseInt(s.slice(6, 8), 16);
    } else return null;
    return [r / 255, g / 255, b / 255, a / 255];
  }
  const hex2 = (v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, "0");
  const toHex = (rgba, alpha) => "#" + hex2(rgba[0]) + hex2(rgba[1]) + hex2(rgba[2]) + (alpha ? hex2(rgba[3]) : "");

  // ---------------------------------------------------------------- presets
  // GLSL written for this mod. Hash: lowbias32 (Chris Wellons, public domain);
  // gradient noise, fBm, domain warping and inverse-distance mesh blending are
  // textbook techniques.
  const GLSL_HEAD = `#version 300 es
precision highp float;
`;
  const GLSL_AUTO = `
/** @resolution */
uniform vec2 uResolution;
/** @time */
uniform float uTime;
/** @mouse */
uniform vec2 uMouse;
`;
  const GLSL_HASH = `
uint hashU(uint x) {
  x ^= x >> 16u;
  x *= 0x7feb352du;
  x ^= x >> 15u;
  x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}

float hash21(vec2 p) {
  uvec2 q = uvec2(floor(p) + 65536.0);
  return float(hashU(q.x ^ hashU(q.y))) / 4294967295.0;
}
`;
  const GLSL_NOISE = `
vec2 grad2(vec2 cell) {
  float a = hash21(cell) * 6.2831853;
  return vec2(cos(a), sin(a));
}

// Gradient noise with a quintic fade, roughly in [-1, 1].
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(grad2(i), f);
  float b = dot(grad2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(grad2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(grad2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.4;
}

float fbm(vec2 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amp * noise2(p);
    p = rot * p * 2.03 + vec2(13.7, 7.1);
    amp *= 0.5;
  }
  return sum;
}
`;

  const PRESETS = [
    {
      id: "mesh",
      label: "Mesh gradient",
      glsl:
        GLSL_HEAD +
        `
// Mesh gradient: four colour points drift over a softly warped plane and are
// blended with inverse-distance weights (in linear light), plus film grain.
` +
        GLSL_AUTO +
        `
/** @label Color 1 @color @default #ff7a59 */
uniform vec3 uColor1;
/** @label Color 2 @color @default #8b5cf6 */
uniform vec3 uColor2;
/** @label Color 3 @color @default #06b6d4 */
uniform vec3 uColor3;
/** @label Color 4 @color @default #fde68a */
uniform vec3 uColor4;
/** @label Distortion @range(0, 1) @default 0.6 */
uniform float uDistortion;
/** @label Swirl @range(0, 1) @default 0.45 */
uniform float uSwirl;
/** @label Grain @range(0, 0.25) @default 0.04 */
uniform float uGrain;
/** @label Follow mouse @default false */
uniform bool uFollowMouse;

out vec4 fragColor;
` +
        GLSL_HASH +
        `
vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

float weight(vec2 p, vec2 c) {
  vec2 d = p - c;
  return 1.0 / pow(dot(d, d) + 0.015, 1.5);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  float t = uTime * 0.22;

  p += uDistortion * 0.16 * vec2(
    sin(p.y * 3.3 + t * 1.7) + 0.5 * sin(p.y * 6.1 - t * 1.2),
    cos(p.x * 2.9 - t * 1.4) + 0.5 * cos(p.x * 5.3 + t * 0.9));
  float a = uSwirl * 2.6 * exp(-length(p) * 2.4) * sin(t * 0.8 + 0.6);
  p = mat2(cos(a), sin(a), -sin(a), cos(a)) * p;

  vec2 c1 = vec2(-0.32 * aspect, 0.28) + 0.16 * vec2(sin(t * 1.1), cos(t * 0.8));
  vec2 c2 = vec2(0.34 * aspect, 0.26) + 0.16 * vec2(cos(t * 0.9 + 1.0), sin(t * 1.2));
  vec2 c3 = vec2(-0.30 * aspect, -0.30) + 0.16 * vec2(sin(t * 0.7 + 2.0), cos(t * 1.0 + 0.5));
  vec2 c4 = vec2(0.30 * aspect, -0.28) + 0.16 * vec2(cos(t * 1.3 + 3.0), sin(t * 0.6 + 2.0));
  if (uFollowMouse) {
    vec2 m = uMouse / uResolution;
    c1 = vec2((m.x - 0.5) * aspect, m.y - 0.5);
  }

  float w1 = weight(p, c1);
  float w2 = weight(p, c2);
  float w3 = weight(p, c3);
  float w4 = weight(p, c4);
  vec3 col = (toLinear(uColor1) * w1 + toLinear(uColor2) * w2 +
              toLinear(uColor3) * w3 + toLinear(uColor4) * w4) / (w1 + w2 + w3 + w4);
  col = toSrgb(col);

  float g = hash21(gl_FragCoord.xy + floor(mod(uTime * 24.0, 4096.0)) * 61.0) - 0.5;
  col += g * uGrain;
  fragColor = vec4(col, 1.0);
}
`,
    },
    {
      id: "grain",
      label: "Grain gradient",
      glsl:
        GLSL_HEAD +
        `
// Grain gradient: a three-stop linear or radial gradient whose position is
// pushed around by noise and dithered by strong grain.
` +
        GLSL_AUTO +
        `
/** @label Color A @color @default #0f1c4d */
uniform vec3 uColorA;
/** @label Color B @color @default #ff4f6d */
uniform vec3 uColorB;
/** @label Color C @color @default #ffc876 */
uniform vec3 uColorC;
/** @label Angle @range(0, 360) @default 120 */
uniform float uAngle;
/** @label Noise scale @range(0.2, 6) @default 1.6 */
uniform float uNoiseScale;
/** @label Softness @range(0, 1) @default 0.45 */
uniform float uSoftness;
/** @label Grain @range(0, 1) @default 0.6 */
uniform float uGrain;
/** @label Radial @default false */
uniform bool uRadial;

out vec4 fragColor;
` +
        GLSL_HASH +
        GLSL_NOISE +
        `
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  float t = uTime * 0.12;

  float g;
  if (uRadial) {
    vec2 m = (uMouse / uResolution - 0.5) * vec2(aspect, 1.0);
    g = length(p - m * 0.35) * 1.5;
  } else {
    float ang = radians(uAngle);
    vec2 dir = vec2(cos(ang), sin(ang));
    g = dot(p, dir) / (abs(dir.x) * aspect + abs(dir.y)) + 0.5;
  }
  g += 0.32 * fbm(p * uNoiseScale + vec2(t, -t * 0.6), 4);

  float grain = hash21(gl_FragCoord.xy + floor(mod(uTime * 18.0, 4096.0)) * 37.0);
  g += (grain - 0.5) * uGrain * 0.45;

  float s = mix(0.015, 0.35, uSoftness);
  vec3 col = mix(uColorA, uColorB, smoothstep(0.36 - s, 0.36 + s, g));
  col = mix(col, uColorC, smoothstep(0.72 - s, 0.72 + s, g));
  col += (grain - 0.5) * uGrain * 0.06;
  fragColor = vec4(col, 1.0);
}
`,
    },
    {
      id: "fluid",
      label: "Fluid noise",
      glsl:
        GLSL_HEAD +
        `
// Fluid noise: fBm fed through two layers of domain warping, like ink in
// water. The pointer bends the field a little.
` +
        GLSL_AUTO +
        `
/** @label Deep @color @default #0a0f2e */
uniform vec3 uColor1;
/** @label Mid @color @default #3b5bdb */
uniform vec3 uColor2;
/** @label Light @color @default #f9a8d4 */
uniform vec3 uColor3;
/** @label Scale @range(0.5, 8) @default 1.6 */
uniform float uScale;
/** @label Warp @range(0, 4) @default 1.8 */
uniform float uWarp;
/** @label Detail @range(1, 8) @default 5 */
uniform int uDetail;
/** @label Contrast @range(0.5, 2.5) @default 1.0 */
uniform float uContrast;

out vec4 fragColor;
` +
        GLSL_HASH +
        GLSL_NOISE +
        `
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y * uScale;
  vec2 m = (uMouse - 0.5 * uResolution) / uResolution.y * uScale;
  vec2 dm = p - m;
  p += dm * 0.12 * exp(-dot(dm, dm) * 0.8);
  float t = uTime * 0.1;

  vec2 q = vec2(fbm(p + vec2(0.0, t), uDetail),
                fbm(p + vec2(5.2, 1.3) - t, uDetail));
  vec2 r = vec2(fbm(p + uWarp * q + vec2(1.7, 9.2) + 0.7 * t, uDetail),
                fbm(p + uWarp * q + vec2(8.3, 2.8) - 0.5 * t, uDetail));
  float f = fbm(p + uWarp * r, uDetail);

  float v = clamp(0.5 + f * uContrast, 0.0, 1.0);
  vec3 col = mix(uColor1, uColor2, smoothstep(0.05, 0.75, v));
  col = mix(col, uColor3, smoothstep(0.45, 1.0, v) * clamp(dot(r, r) * 0.9, 0.0, 1.0));
  col = mix(col, uColor1, clamp(abs(q.y) * 0.6, 0.0, 0.5) * (1.0 - v));
  col += 0.06 * uColor3 * smoothstep(0.2, 0.9, length(q));
  fragColor = vec4(col, 1.0);
}
`,
    },
    {
      id: "waves",
      label: "Waves",
      glsl:
        GLSL_HEAD +
        `
// Waves: stacked glowing lines, each a sine plus noise, that bend away from
// the pointer.
` +
        GLSL_AUTO +
        `
/** @label Background @color @default #070a12 */
uniform vec3 uBackground;
/** @label Line @color @default #38bdf8 */
uniform vec3 uLine;
/** @label Accent @color @default #c084fc */
uniform vec3 uAccent;
/** @label Lines @range(2, 48) @default 22 */
uniform int uLines;
/** @label Amplitude @range(0, 1) @default 0.5 */
uniform float uAmplitude;
/** @label Frequency @range(0.2, 6) @default 1.6 */
uniform float uFrequency;
/** @label Thickness @range(0.3, 6) @default 1.4 */
uniform float uThickness;
/** @label Mouse bend @range(0, 1) @default 0.35 */
uniform float uBend;
/** @label Glow @default true */
uniform bool uGlow;

out vec4 fragColor;
` +
        GLSL_HASH +
        GLSL_NOISE +
        `
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 m = uMouse / uResolution;
  float t = uTime * 0.6;
  float aa = max(fwidth(gl_FragCoord.y), 0.001);
  float th = max(uThickness, aa);

  vec3 col = uBackground * (0.85 + 0.3 * uv.y);
  int n = max(uLines, 1);
  float denom = max(float(n - 1), 1.0);
  for (int i = 0; i < 48; i++) {
    if (i >= n) break;
    float fi = float(i) / denom;
    float base = mix(0.12, 0.88, fi);
    float w = sin(uv.x * uFrequency * 6.2831853 + t * (0.8 + fi * 0.6) + fi * 5.0) * 0.6
            + noise2(vec2(uv.x * uFrequency * 1.7 - t * 0.35, fi * 3.0 + t * 0.1)) * 0.4;
    float env = 0.35 + 0.65 * sin(3.14159265 * fi);
    float y = base + w * uAmplitude * 0.09 * env;
    float near = exp(-pow((uv.x - m.x) * 3.5, 2.0));
    y += (y - m.y) * near * uBend * 0.6 * exp(-abs(y - m.y) * 6.0);

    float d = abs(uv.y - y) * uResolution.y;
    float line = 1.0 - smoothstep(th * 0.5 - aa * 0.5, th * 0.5 + aa, d);
    float glow = uGlow ? exp(-d / (6.0 + 10.0 * uThickness)) * 0.35 : 0.0;
    col += mix(uLine, uAccent, fi) * (line * 0.9 + glow) * (0.55 + 0.45 * env);
  }
  fragColor = vec4(col, 1.0);
}
`,
    },
    {
      id: "aurora",
      label: "Aurora",
      glsl:
        GLSL_HEAD +
        `
// Aurora: layered curtains with a sharp lower edge and a long upward fade,
// streaked by vertical rays, over a starry sky and a dark ridge.
` +
        GLSL_AUTO +
        `
/** @label Sky @color @default #030616 */
uniform vec3 uSky;
/** @label Aurora 1 @color @default #34d399 */
uniform vec3 uColor1;
/** @label Aurora 2 @color @default #8b5cf6 */
uniform vec3 uColor2;
/** @label Intensity @range(0, 2) @default 1.35 */
uniform float uIntensity;
/** @label Height @range(0.2, 0.8) @default 0.48 */
uniform float uHeight;
/** @label Ripple @range(0, 1) @default 0.5 */
uniform float uRipple;
/** @label Stars @default true */
uniform bool uStars;

out vec4 fragColor;
` +
        GLSL_HASH +
        GLSL_NOISE +
        `
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  float x = uv.x * aspect;
  float t = uTime * 0.08;

  vec3 col = mix(uSky * 1.8, uSky * 0.6, uv.y);
  if (uStars) {
    float hs = hash21(floor(gl_FragCoord.xy / 3.0));
    float tw = 0.5 + 0.5 * sin(uTime * 2.0 + hs * 40.0);
    col += step(0.9975, hs) * tw * smoothstep(0.15, 0.6, uv.y) * 0.9;
  }

  vec3 glow = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float xx = x * (0.9 + fi * 0.18) + t * (0.6 + fi * 0.25) + fi * 1.7;
    float center = uHeight + fi * 0.035 + 0.16 * fbm(vec2(xx * 0.9, fi * 2.3 + t), 3) * (0.5 + uRipple);
    float d = uv.y - center;
    float curtain = smoothstep(-0.015, 0.02, d) * exp(-max(d, 0.0) * mix(2.5, 7.0, fi / 4.0));
    float rays = 0.55 + 0.45 * noise2(vec2(xx * 14.0, t * 3.0 + fi * 5.0));
    rays *= 0.7 + 0.3 * noise2(vec2(xx * 3.0, fi));
    vec3 c = mix(uColor1, uColor2, clamp(d * 3.5 + fi * 0.12, 0.0, 1.0));
    glow += c * curtain * max(rays, 0.0) * (1.0 - fi * 0.13);
  }
  col += glow * uIntensity * 0.75;

  float ridge = 0.1 + 0.035 * fbm(vec2(x * 2.2, 3.0), 4);
  col = mix(col, uSky * 0.25, smoothstep(ridge + 0.004, ridge - 0.004, uv.y));
  fragColor = vec4(col, 1.0);
}
`,
    },
    {
      id: "glass",
      label: "Glass",
      glsl:
        GLSL_HEAD +
        `
// Glass: a texture seen through fluted glass and a lens that follows the
// pointer, with refraction, chromatic dispersion and highlights.
` +
        GLSL_AUTO +
        `
/** @label Texture */
uniform sampler2D uTexture;
/** @label Refraction @range(0, 1) @default 0.55 */
uniform float uRefraction;
/** @label Dispersion @range(0, 1) @default 0.4 */
uniform float uDispersion;
/** @label Lens size @range(0.05, 0.7) @default 0.3 */
uniform float uLensSize;
/** @label Flutes @range(0, 60) @default 14 */
uniform float uFlutes;
/** @label Tint @color @default #e0f2fe */
uniform vec3 uTint;
/** @label Frosted @default false */
uniform bool uFrosted;

out vec4 fragColor;
` +
        GLSL_HASH +
        `
vec3 sampleRGB(vec2 uv, vec2 off, float k) {
  return vec3(texture(uTexture, uv + off * (1.0 + k)).r,
              texture(uTexture, uv + off).g,
              texture(uTexture, uv + off * (1.0 - k)).b);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  float t = uTime * 0.25;
  // The texture spans the frame width (square texels), drifting slowly.
  vec2 tuv = (uv - 0.5) * vec2(1.0, 1.0 / aspect) * 0.94 + 0.5 + vec2(t * 0.03, 0.0);

  // Fluted glass: each flute bends the light sideways like a half cylinder.
  float flute = uFlutes >= 1.0 ? fract(uv.x * uFlutes) * 2.0 - 1.0 : 0.0;

  // Lens: centred on the pointer (frame centre by default), wobbling a bit.
  vec2 c = uMouse / uResolution + 0.03 * vec2(sin(t * 2.1), cos(t * 1.7));
  vec2 d = (uv - c) * vec2(aspect, 1.0) / uLensSize;
  float r2 = dot(d, d);
  float inside = 1.0 - smoothstep(0.96, 1.0, r2);

  vec2 off = vec2(flute * 0.03 * uRefraction, 0.0) * (1.0 - inside);
  off += -d * uLensSize * 0.45 * uRefraction * inside * (1.0 - 0.5 * r2);
  float k = uDispersion * 0.35;

  vec3 col;
  if (uFrosted) {
    col = vec3(0.0);
    float j0 = hash21(gl_FragCoord.xy) * 6.2831853;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 2.3999632 + j0;
      vec2 j = vec2(cos(a), sin(a)) * 0.006 * sqrt(float(i) + 0.5);
      col += sampleRGB(tuv, off + j, k);
    }
    col /= 8.0;
  } else {
    col = sampleRGB(tuv, off, k);
  }

  col *= mix(vec3(1.0), uTint, 0.35 + 0.25 * inside);
  float edge = uFlutes >= 1.0 ? pow(abs(flute), 12.0) * 0.18 : 0.0;
  float rim = smoothstep(0.75, 0.98, r2) * inside * 0.35;
  float spec = pow(max(0.0, 1.0 - length(d - vec2(-0.35, 0.35)) * 1.6), 6.0) * inside * 0.5;
  col += edge * (1.0 - inside) + rim + spec;
  fragColor = vec4(col, 1.0);
}
`,
    },
    {
      id: "halftone",
      label: "Halftone",
      glsl:
        GLSL_HEAD +
        `
// Halftone: an animated tone field (ripples from the pointer plus noise)
// printed as a rotated dot screen, with an optional second accent screen.
` +
        GLSL_AUTO +
        `
/** @label Ink @color @default #14151a */
uniform vec3 uInk;
/** @label Paper @color @default #f4efe4 */
uniform vec3 uPaper;
/** @label Accent @color @default #ff4d3d */
uniform vec3 uAccent;
/** @label Cell size @range(4, 48) @default 14 */
uniform float uCell;
/** @label Angle @range(0, 90) @default 25 */
uniform float uAngle;
/** @label Contrast @range(0.5, 3) @default 1.4 */
uniform float uContrast;
/** @label Two tone @default true */
uniform bool uTwoTone;

out vec4 fragColor;
` +
        GLSL_HASH +
        GLSL_NOISE +
        `
// Tone at a point in frame units: 0 = paper, 1 = full ink.
float tone(vec2 pos, float phase) {
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (pos / uResolution - 0.5) * vec2(aspect, 1.0);
  vec2 m = (uMouse / uResolution - 0.5) * vec2(aspect, 1.0);
  float t = uTime;
  float v = 0.5 + 0.5 * sin(length(p - m) * 11.0 - t * 1.6 + phase);
  v = mix(v, 0.5 + 0.75 * fbm(p * 2.2 + vec2(t * 0.08, phase), 3), 0.55);
  v *= 1.0 - 0.35 * smoothstep(0.3, 0.75, length(p));
  return clamp((v - 0.5) * uContrast + 0.5, 0.0, 1.0);
}

float screen(vec2 frag, float angle, float phase) {
  float a = radians(angle);
  mat2 rot = mat2(cos(a), sin(a), -sin(a), cos(a));
  mat2 inv = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 q = rot * frag / uCell;
  vec2 id = floor(q) + 0.5;
  vec2 local = q - id;
  float v = tone(inv * (id * uCell), phase);
  float radius = sqrt(v) * 0.62;
  float aa = max(fwidth(q.x), 0.001);
  return 1.0 - smoothstep(radius - aa, radius + aa, length(local));
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec3 col = uPaper;
  if (uTwoTone) {
    float a2 = screen(frag + vec2(uCell * 0.25), uAngle + 30.0, 1.3);
    col = mix(col, col * uAccent, a2 * 0.9);
  }
  float a1 = screen(frag, uAngle, 0.0);
  col = mix(col, uInk, a1);
  fragColor = vec4(col, 1.0);
}
`,
    },
    {
      id: "particles",
      label: "Particles",
      glsl:
        GLSL_HEAD +
        `
// Particles: four parallax layers of drifting, twinkling motes in hashed
// grid cells, pushed away by the pointer.
` +
        GLSL_AUTO +
        `
/** @label Background @color @default #050816 */
uniform vec3 uBackground;
/** @label Particle 1 @color @default #fde68a */
uniform vec3 uColor1;
/** @label Particle 2 @color @default #67e8f9 */
uniform vec3 uColor2;
/** @label Density @range(0.05, 1) @default 0.55 */
uniform float uDensity;
/** @label Size @range(0.5, 8) @default 2.4 */
uniform float uSize;
/** @label Drift @range(0, 2) @default 0.7 */
uniform float uDrift;
/** @label Mouse repel @range(0, 1) @default 0.4 */
uniform float uRepel;
/** @label Glow @default true */
uniform bool uGlow;

out vec4 fragColor;
` +
        GLSL_HASH +
        `
vec3 hash3(vec2 p) {
  uvec2 q = uvec2(floor(p) + 65536.0);
  uint hv = hashU(q.x ^ hashU(q.y));
  return vec3(float(hv & 1023u), float((hv >> 10u) & 1023u), float((hv >> 20u) & 1023u)) / 1023.0;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec3 col = uBackground * (0.7 + 0.5 * frag.y / uResolution.y);
  float t = uTime;

  for (int layer = 0; layer < 4; layer++) {
    float fl = float(layer) / 3.0;
    float cell = mix(150.0, 56.0, fl);
    float speed = uDrift * mix(34.0, 10.0, fl);
    vec2 shift = vec2(sin(t * 0.1 + fl * 3.0) * 20.0, t * speed) - float(layer) * 37.0;
    vec2 q = (frag - shift) / cell;
    vec2 id0 = floor(q);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 id = id0 + vec2(float(i), float(j));
        vec3 hv = hash3(id + float(layer) * 101.0);
        if (hv.z > uDensity) continue;
        vec2 pos = id + 0.2 + 0.6 * hv.xy +
          0.12 * vec2(sin(t * (0.6 + hv.x) + hv.y * 6.28), cos(t * (0.5 + hv.y) + hv.x * 6.28));
        vec2 world = pos * cell + shift;
        vec2 away = world - uMouse;
        float dm = length(away);
        world += away / max(dm, 0.001) * uRepel * cell * 0.3 * exp(-dm * dm / 19600.0);
        float d = length(frag - world);
        float radius = uSize * mix(1.4, 0.55, fl) * (0.6 + 0.8 * hv.x);
        float core = 1.0 - smoothstep(radius * 0.6, radius, d);
        float glow = uGlow ? exp(-d / (radius * 3.0)) * 0.45 : 0.0;
        float tw = 0.65 + 0.35 * sin(t * (1.5 + 2.0 * hv.y) + hv.x * 30.0);
        col += mix(uColor1, uColor2, hv.y) * (core + glow) * tw * mix(1.0, 0.45, fl);
      }
    }
  }
  fragColor = vec4(col, 1.0);
}
`,
    },
  ];
  const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

  // -------------------------------------------------------------- textures
  // Built-in textures for sampler2D uniforms (pen binds @backdrop/@content or
  // an image there). Self-contained so the embed snippet can inline them.
  const PATTERNS = {
    poster: {
      label: "Poster",
      draw: function (ctx, w, hh) {
        var bands = ["#0f172a", "#1d4ed8", "#f97316", "#facc15", "#22d3ee", "#e11d48"];
        var bw = w / bands.length;
        for (var i = 0; i < bands.length; i++) {
          ctx.fillStyle = bands[i];
          ctx.fillRect(Math.floor(i * bw), 0, Math.ceil(bw) + 1, hh);
        }
        ctx.strokeStyle = "rgba(255,255,255,0.22)";
        ctx.lineWidth = 2;
        for (var gx = 0; gx <= 16; gx++) {
          ctx.beginPath();
          ctx.moveTo((gx * w) / 16, 0);
          ctx.lineTo((gx * w) / 16, hh);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, (gx * hh) / 16);
          ctx.lineTo(w, (gx * hh) / 16);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        for (var c = 0; c < 6; c++) {
          ctx.beginPath();
          ctx.arc(w * (0.12 + c * 0.155), hh * 0.18, w * 0.035, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "800 " + Math.round(hh * 0.3) + "px -apple-system, 'Helvetica Neue', Arial, sans-serif";
        ctx.fillText("GLASS", w / 2, hh * 0.52);
        ctx.font = "600 " + Math.round(hh * 0.07) + "px -apple-system, 'Helvetica Neue', Arial, sans-serif";
        ctx.fillText("light bends here", w / 2, hh * 0.8);
      },
    },
    grid: {
      label: "Checker",
      draw: function (ctx, w, hh) {
        var n = 8;
        for (var y = 0; y < n; y++)
          for (var x = 0; x < n; x++) {
            ctx.fillStyle = (x + y) % 2 ? "#e5e7eb" : "#1f2937";
            ctx.fillRect((x * w) / n, (y * hh) / n, w / n + 1, hh / n + 1);
          }
        ctx.fillStyle = "#f43f5e";
        for (var i = 0; i < n; i++) {
          ctx.beginPath();
          ctx.arc(((i + 0.5) * w) / n, ((i + 0.5) * hh) / n, w / n / 5, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    },
    stripes: {
      label: "Stripes",
      draw: function (ctx, w, hh) {
        var cols = ["#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#f8fafc", "#0f172a", "#06b6d4"];
        var n = 16;
        var sw = (w * 2) / n;
        ctx.save();
        for (var i = -n; i < n * 2; i++) {
          ctx.fillStyle = cols[((i % cols.length) + cols.length) % cols.length];
          ctx.beginPath();
          ctx.moveTo(i * sw, 0);
          ctx.lineTo(i * sw + sw, 0);
          ctx.lineTo(i * sw + sw - hh, hh);
          ctx.lineTo(i * sw - hh, hh);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      },
    },
  };
  const DEFAULT_TEXTURE = "pattern:poster";
  const validTexture = (v) => typeof v === "string" && ((v.startsWith("pattern:") && !!PATTERNS[v.slice(8)]) || /^image:data:image\/(png|jpeg|webp|gif);base64,/.test(v));

  // ------------------------------------------------------- source handling
  // Wraps a user shader for WebGL: gl_FragCoord becomes frame units (divided
  // by rt_Scale, the render pixels per frame unit), main() becomes rt_main()
  // called by our own main. Self-contained: the embed snippet inlines it.
  function rtshWrap(src) {
    var es3 = /^[ \t]*#version[ \t]+300[ \t]+es\b/m.test(src);
    var body = String(src).replace(/^[ \t]*#version[^\n]*/m, "");
    var ext = [];
    body = body.replace(/^[ \t]*#extension[^\n]*/gm, function (m) {
      ext.push(m.trim());
      return "";
    });
    var mainRe = /\bvoid\s+main\s*\(\s*(?:void)?\s*\)/;
    if (!mainRe.test(body)) return { error: "No main() function found.", es3: es3 };
    body = body.replace(/\bgl_FragCoord\b/g, "rt_FragCoord").replace(mainRe, "void rt_main()");
    var head = (es3 ? "#version 300 es\n" : "") + (ext.length ? ext.join("\n") + "\n" : "") + "precision highp float;\nprecision highp int;\nuniform vec2 rt_Scale;\nvec4 rt_FragCoord;\n";
    var lines = head.split("\n").length - 1;
    var tail = "\nvoid main() {\n  rt_FragCoord = vec4(gl_FragCoord.xy / rt_Scale, gl_FragCoord.zw);\n  rt_main();\n}\n";
    return { code: head + body + tail, headLines: lines, es3: es3 };
  }

  // Global statements of a GLSL source (comments and preprocessor skipped),
  // with their start offset: what pen gets from its GLSL parser.
  function scanGlobals(src) {
    const out = [];
    const n = src.length;
    let i = 0;
    let dB = 0;
    let dP = 0;
    let start = -1;
    let buf = "";
    const ws = (c) => c === " " || c === "\t" || c === "\n" || c === "\r";
    const atLineStart = (k) => {
      for (let j = k - 1; j >= 0; j--) {
        if (src[j] === "\n") return true;
        if (src[j] !== " " && src[j] !== "\t") return false;
      }
      return true;
    };
    while (i < n) {
      const c = src[i];
      const d = src[i + 1];
      if (c === "/" && d === "/") {
        const e = src.indexOf("\n", i);
        i = e < 0 ? n : e;
        if (start >= 0) buf += " ";
        continue;
      }
      if (c === "/" && d === "*") {
        const e = src.indexOf("*/", i + 2);
        i = e < 0 ? n : e + 2;
        if (start >= 0) buf += " ";
        continue;
      }
      if (c === "#" && atLineStart(i)) {
        let e = i;
        while (e < n && src[e] !== "\n") e += src[e] === "\\" && src[e + 1] === "\n" ? 2 : 1;
        i = e;
        continue;
      }
      if (start < 0 && dB === 0 && dP === 0 && !ws(c)) {
        start = i;
        buf = "";
      }
      if (start >= 0) buf += c;
      if (c === "(") dP++;
      else if (c === ")") dP = Math.max(0, dP - 1);
      else if (c === "{") dB++;
      else if (c === "}") {
        dB = Math.max(0, dB - 1);
        if (dB === 0 && dP === 0 && start >= 0 && !/^\s*(?:\w+\s+)*(?:struct|uniform|buffer)\b/.test(buf.slice(0, buf.indexOf("{")))) {
          out.push({ text: buf, start, kind: "func" });
          start = -1;
        }
      } else if (c === ";" && dB === 0 && dP === 0 && start >= 0) {
        out.push({ text: buf, start, kind: buf.includes("{") ? "block" : "decl" });
        start = -1;
      }
      i++;
    }
    return out;
  }
  const lineAt = (src, off) => {
    let l = 1;
    for (let i = 0; i < off && i < src.length; i++) if (src.charCodeAt(i) === 10) l++;
    return l;
  };

  // pen: the /** comment right before a declaration (only whitespace between).
  function docBefore(src, off) {
    let n = off - 1;
    while (n >= 0 && /[ \t\n\r]/.test(src[n])) n--;
    if (n < 3 || src[n] !== "/" || src[n - 1] !== "*") return null;
    for (let r = n - 2; r >= 1; r--)
      if (src[r - 1] === "/" && src[r] === "*") {
        const body = src.substring(r + 1, n - 1);
        return body.startsWith("*") ? body.substring(1) : null;
      }
    return null;
  }
  // pen's annotation grammar: per line, "@name args" repeated; args are a
  // parenthesised list or run to the next "@".
  function parseAnnotations(text) {
    const a = {};
    for (const line of text.split("\n")) {
      let rest = line.replace(/^\s*\*\s?/, "").trim();
      while (rest.length) {
        const m = rest.match(/^@(\w+)\s*/);
        if (!m) break;
        rest = rest.substring(m[0].length);
        let args;
        if (rest[0] === "(") {
          let depth = 0;
          let end = -1;
          for (let i = 0; i < rest.length; i++) {
            if (rest[i] === "(") depth++;
            else if (rest[i] === ")" && --depth === 0) {
              end = i;
              break;
            }
          }
          if (end < 0) throw new Error(`Unterminated argument list in annotation: '${rest}'`);
          args = rest.substring(1, end);
          rest = rest.substring(end + 1).trimStart();
        } else {
          const at = rest.indexOf("@");
          args = at < 0 ? rest.trim() : rest.substring(0, at).trim();
          rest = at < 0 ? "" : rest.substring(at);
        }
        applyDirective(a, m[1], args);
      }
    }
    return a;
  }
  const splitArgs = (t) => t.split(",").map((x) => x.trim()).filter((x) => x.length > 0);
  function numArg(dir, v) {
    const n = Number.parseFloat(v);
    if (!Number.isFinite(n)) throw new Error(`${dir} got non-numeric value: '${v}'`);
    return n;
  }
  function applyDirective(a, name, args) {
    const flag = (k) => {
      if (args.length > 0) throw new Error(`@${k} takes no arguments`);
      a[k] = true;
    };
    switch (name) {
      case "color":
      case "resolution":
      case "time":
      case "mouse":
      case "sdf":
      case "content":
      case "backdrop":
        flag(name);
        break;
      case "min":
      case "max":
        if (!args.trim()) throw new Error(`@${name} requires a numeric argument`);
        a[name] = numArg("@" + name, args.trim());
        break;
      case "range": {
        const r = splitArgs(args);
        if (r.length !== 2) throw new Error("@range expects 2 numeric arguments");
        a.min = numArg("@range", r[0]);
        a.max = numArg("@range", r[1]);
        break;
      }
      case "default":
        a.defaultValue = parseDefault(args);
        break;
      case "mipmap": {
        const v = args.trim();
        if (v === "" || v === "true") a.mipmap = true;
        else if (v === "false") a.mipmap = false;
        else throw new Error("@mipmap takes true or false");
        break;
      }
      case "label":
        if (!args.trim()) throw new Error("@label requires a value");
        a.label = args.trim();
        break;
      default:
        throw new Error(`Unknown annotation directive: @${name}`);
    }
  }
  function parseDefault(t) {
    const e = t.trim();
    if (!e.length) throw new Error("@default requires a value");
    if (e === "true") return true;
    if (e === "false") return false;
    if (e.startsWith("#")) {
      if (!/^#[0-9a-fA-F]+$/.test(e)) throw new Error(`@default invalid hex literal: '${e}'`);
      return e;
    }
    const parts = splitArgs(e);
    if (parts.length === 1) return Number.isFinite(Number.parseFloat(parts[0])) ? numArg("@default", parts[0]) : parts[0];
    return parts.map((p) => numArg("@default", p));
  }

  const SCALAR_TYPES = ["float", "int", "bool", "vec2", "vec3", "vec4", "ivec2", "ivec3", "ivec4", "sampler2D"];
  // pen's uniform classification (same rules and messages).
  function classify(name, type, a) {
    const noRange = () => {
      if (a.min != null || a.max != null) throw new Error(`Uniform '${name}': @range/@min/@max is not valid for '${type}'`);
    };
    const noColor = () => {
      if (a.color) throw new Error(`Uniform '${name}': @color only valid for vec3/vec4`);
    };
    const noMip = () => {
      if (a.mipmap != null) throw new Error(`Uniform '${name}': @mipmap is not valid for '${type}'`);
    };
    const label = a.label;
    if (a.color) {
      if (type !== "vec3" && type !== "vec4") throw new Error(`Uniform '${name}': @color requires vec3 or vec4`);
      noRange();
      noMip();
      const alpha = type === "vec4";
      let def = alpha ? "#ffffffff" : "#ffffff";
      if (a.defaultValue != null) {
        if (typeof a.defaultValue === "string") {
          if (!parseHex(a.defaultValue)) throw new Error(`Uniform '${name}': @color @default must be a hex color`);
          def = a.defaultValue;
        } else if (Array.isArray(a.defaultValue) && a.defaultValue.length === (alpha ? 4 : 3)) def = toHex(alpha ? a.defaultValue : [...a.defaultValue, 1], alpha);
        else throw new Error(`Uniform '${name}': @color @default needs ${alpha ? 4 : 3} numbers`);
      }
      return { type: "color", name, label, alpha, defaultValue: def };
    }
    if (a.resolution || a.mouse) {
      const k = a.resolution ? "resolution" : "mouse";
      if (type !== "vec2" && type !== "ivec2") throw new Error(`Uniform '${name}': @${k} requires vec2 or ivec2`);
      noRange();
      noMip();
      if (k === "mouse" && a.defaultValue != null) throw new Error(`Uniform '${name}': @mouse does not support @default`);
      return { type: k, name, label, integer: type === "ivec2" };
    }
    if (a.time) {
      if (type !== "float") throw new Error(`Uniform '${name}': @time requires float`);
      noRange();
      noMip();
      if (a.defaultValue != null) throw new Error(`Uniform '${name}': @time does not support @default`);
      return { type: "time", name, label };
    }
    if (a.sdf) throw new Error(`Uniform '${name}': @sdf is not supported on the Tempo canvas`);
    if (a.content || a.backdrop) {
      if (type !== "sampler2D") throw new Error(`Uniform '${name}': ${a.content ? "@content" : "@backdrop"} requires sampler2D`);
      noRange();
      return { type: "sampler2D", name, label, mipmap: !!a.mipmap, defaultValue: DEFAULT_TEXTURE };
    }
    switch (type) {
      case "float":
      case "int": {
        noColor();
        noMip();
        if (a.defaultValue != null && typeof a.defaultValue !== "number") throw new Error(`Uniform '${name}': @default must be a single number`);
        let def = a.defaultValue != null ? a.defaultValue : 0;
        if (type === "int") def = Math.trunc(def);
        return { type, name, label, defaultValue: def, min: a.min, max: a.max };
      }
      case "bool":
        noColor();
        noRange();
        noMip();
        if (a.defaultValue != null && typeof a.defaultValue !== "boolean") throw new Error(`Uniform '${name}' is bool, @default must be true or false`);
        return { type: "bool", name, label, defaultValue: a.defaultValue != null ? a.defaultValue : false };
      case "sampler2D":
        noColor();
        noRange();
        return { type: "sampler2D", name, label, mipmap: !!a.mipmap, defaultValue: DEFAULT_TEXTURE };
      default: {
        noRange();
        noMip();
        const dim = Number.parseInt(type.charAt(type.length - 1), 10);
        let def = new Array(dim).fill(0);
        if (a.defaultValue != null) {
          if (!Array.isArray(a.defaultValue) || a.defaultValue.length !== dim || !a.defaultValue.every((x) => typeof x === "number")) throw new Error(`Uniform '${name}': @default needs ${dim} numbers`);
          def = a.defaultValue;
        }
        return { type: "vec", name, label, dim, integer: type.startsWith("i"), defaultValue: def };
      }
    }
  }

  const QUALIFIERS = new Set(["uniform", "in", "out", "varying", "attribute", "const", "flat", "smooth", "centroid", "invariant", "highp", "mediump", "lowp"]);
  // Reads the source like pen does: uniforms with their annotations, the
  // single output, the forbidden inputs. Never touches GL.
  function analyze(src) {
    const errors = [];
    const warnings = [];
    const uniforms = [];
    let output = null;
    let code = "";
    for (const st of scanGlobals(src)) {
      code += st.text + "\n";
      if (st.kind !== "decl") continue;
      let text = st.text.replace(/;\s*$/, "").replace(/\blayout\s*\([^)]*\)/g, " ").trim();
      if (/^precision\b/.test(text)) continue;
      const words = text.split(/\s+/);
      const quals = [];
      while (words.length && QUALIFIERS.has(words[0])) quals.push(words.shift());
      if (!quals.length) continue;
      const line = lineAt(src, st.start);
      const type = words.shift() || "";
      const decls = words.join(" ").split(",").map((s) => s.trim()).filter(Boolean);
      if (quals.includes("in") || quals.includes("varying") || quals.includes("attribute")) {
        errors.push({ line, msg: "The shader must not use anything but gl_FragCoord and uniforms!" });
        continue;
      }
      if (quals.includes("out")) {
        if (output || decls.length !== 1) errors.push({ line, msg: "More than one `out` variables are not allowed!" });
        else if (type !== "vec4" || /\[/.test(decls[0])) errors.push({ line, msg: "Must use a single `out vec4` variable!" });
        else output = decls[0];
        continue;
      }
      if (!quals.includes("uniform")) continue;
      let ann = {};
      const doc = docBefore(src, st.start);
      if (doc != null) {
        try {
          ann = parseAnnotations(doc);
        } catch (e) {
          errors.push({ line, msg: String(e.message || e) });
          continue;
        }
      }
      for (const dcl of decls) {
        const nm = (dcl.match(/^(\w+)/) || [])[1];
        if (!nm) continue;
        if (/\[/.test(dcl) || !SCALAR_TYPES.includes(type)) {
          warnings.push({ line, msg: `Uniform '${nm}' of type '${type}${/\[/.test(dcl) ? "[]" : ""}' has no control (left at zero)` });
          continue;
        }
        try {
          uniforms.push({ ...classify(nm, type, ann), glslType: type, line });
        } catch (e) {
          errors.push({ line, msg: String(e.message || e) });
        }
      }
    }
    if (!output && !/\bgl_FragColor\b/.test(code)) errors.push({ line: null, msg: "No color output found. Expected `out vec4 <name>` or `gl_FragColor`." });
    const hasTime = uniforms.some((u) => u.type === "time");
    const hasMouse = uniforms.some((u) => u.type === "mouse");
    return { uniforms, errors, warnings, hasTime, hasMouse, animated: hasTime || hasMouse, output };
  }

  // ------------------------------------------------------------- shared GL
  const GL = { gl: null, canvas: null, failed: false, lost: false, cache: new Map(), textures: new Map(), samplers: null, vao: null, vs: {}, size: [0, 0], max: 4096, renderer: "" };
  function glInit() {
    if (GL.gl && !GL.lost) return GL.gl;
    if (GL.failed || GL.lost) return null;
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    let gl = null;
    try {
      gl = c.getContext("webgl2", { alpha: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "default" });
    } catch (_) {}
    if (!gl) {
      GL.failed = true;
      return null;
    }
    c.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      if (GL.canvas !== c) return; // a context we released on purpose (flag off)
      GL.lost = true;
      GL.cache.clear();
      GL.textures.clear();
      GL.samplers = null;
      GL.vao = null;
      GL.vs = {};
    });
    c.addEventListener("webglcontextrestored", () => {
      if (GL.canvas !== c) return;
      GL.lost = false;
      setupGL(gl);
      recompileAll();
    });
    GL.canvas = c;
    GL.gl = gl;
    GL.size = [256, 256];
    try {
      const dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      GL.max = Math.min(4096, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096, dims ? Math.min(dims[0], dims[1]) : 4096);
      GL.renderer = String(gl.getParameter(gl.RENDERER) || "");
    } catch (_) {}
    setupGL(gl);
    return gl;
  }
  function setupGL(gl) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    GL.vao = vao;
    const mk = (min) => {
      const s = gl.createSampler();
      gl.samplerParameteri(s, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.samplerParameteri(s, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.samplerParameteri(s, gl.TEXTURE_MIN_FILTER, min);
      gl.samplerParameteri(s, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return s;
    };
    GL.samplers = { linear: mk(gl.LINEAR), mip: mk(gl.LINEAR_MIPMAP_LINEAR) };
    GL.vs = {};
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
  }
  function vertexShader(gl, es3) {
    const k = es3 ? "es3" : "es1";
    if (GL.vs[k]) return GL.vs[k];
    const s = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(s, es3 ? "#version 300 es\nin vec2 a;\nvoid main() { gl_Position = vec4(a, 0.0, 1.0); }\n" : "attribute vec2 a;\nvoid main() { gl_Position = vec4(a, 0.0, 1.0); }\n");
    gl.compileShader(s);
    GL.vs[k] = s;
    return s;
  }
  function parseLog(log, headLines, userLines) {
    const out = [];
    for (const raw of String(log || "").split("\n")) {
      const ln = raw.trim();
      if (!ln) continue;
      const m = ln.match(/^(ERROR|WARNING):\s*\d+:(\d+):\s*(.*)$/);
      if (m) {
        const l = +m[2] - headLines;
        out.push({ line: l >= 1 && l <= userLines ? l : null, msg: m[3], warning: m[1] === "WARNING" });
      } else if (!/^\s*$/.test(ln) && !/compilation terminated/i.test(ln)) out.push({ line: null, msg: ln });
    }
    return out;
  }
  // Parse + compile + link. Cached by source.
  function getEntry(src) {
    const hit = GL.cache.get(src);
    if (hit) {
      GL.cache.delete(src);
      GL.cache.set(src, hit); // LRU order
      return hit;
    }
    const meta = analyze(src);
    const e = { src, meta, ok: false, errors: meta.errors.slice(), warnings: meta.warnings.slice(), prog: null, locs: null, es3: false };
    const gl = glInit();
    const w = rtshWrap(src);
    e.es3 = !!w.es3;
    if (!gl) e.errors.push({ line: null, msg: "WebGL 2 is not available in this window." });
    else if (w.error) e.errors.push({ line: null, msg: w.error });
    else {
      state.counts.compiles++;
      const userLines = src.split("\n").length;
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, w.code);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        const errs = parseLog(gl.getShaderInfoLog(fs), w.headLines, userLines);
        for (const x of errs) (x.warning ? e.warnings : e.errors).push(x);
        if (!errs.some((x) => !x.warning)) e.errors.push({ line: null, msg: "The shader failed to compile." });
        gl.deleteShader(fs);
      } else {
        const p = gl.createProgram();
        gl.attachShader(p, vertexShader(gl, w.es3));
        gl.attachShader(p, fs);
        gl.bindAttribLocation(p, 0, "a");
        gl.linkProgram(p);
        gl.deleteShader(fs);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
          e.errors.push({ line: null, msg: "Link failed: " + (gl.getProgramInfoLog(p) || "unknown error").trim() });
          gl.deleteProgram(p);
        } else {
          e.prog = p;
          e.locs = { rtScale: gl.getUniformLocation(p, "rt_Scale") };
          for (const u of meta.uniforms) e.locs[u.name] = gl.getUniformLocation(p, u.name);
        }
      }
    }
    e.ok = !!e.prog && !e.errors.length;
    if (!e.ok && e.prog && gl) {
      gl.deleteProgram(e.prog);
      e.prog = null;
    }
    GL.cache.set(src, e);
    evictCache();
    return e;
  }
  function evictCache() {
    if (GL.cache.size <= CACHE_MAX) return;
    const used = new Set();
    for (const m of state.mounts.values())
      for (const f of m.frames.values()) {
        if (f.entry) used.add(f.entry.src);
        if (f.result) used.add(f.result.src);
      }
    for (const [k, e] of GL.cache) {
      if (GL.cache.size <= CACHE_MAX) break;
      if (used.has(k)) continue;
      if (e.prog && GL.gl) GL.gl.deleteProgram(e.prog);
      GL.cache.delete(k);
    }
  }
  function recompileAll() {
    for (const m of state.mounts.values())
      for (const f of m.frames.values()) {
        f.entry = null;
        applyGlsl(f, f.data.glsl, true);
      }
  }

  function textureFor(key) {
    const gl = GL.gl;
    const k = validTexture(key) ? key : DEFAULT_TEXTURE;
    const hit = GL.textures.get(k);
    if (hit) return hit;
    const tex = gl.createTexture();
    const t = { tex, ready: false };
    GL.textures.set(k, t);
    const upload = (src) => {
      if (!GL.gl || GL.lost) return;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      t.ready = true;
    };
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
    if (k.startsWith("pattern:")) {
      const c = document.createElement("canvas");
      c.width = TEX_SIZE;
      c.height = TEX_SIZE;
      PATTERNS[k.slice(8)].draw(c.getContext("2d"), TEX_SIZE, TEX_SIZE);
      upload(c);
    } else {
      const img = new Image();
      img.onload = () => {
        upload(img);
        markAllDirty();
      };
      img.src = k.slice(6);
    }
    return t;
  }

  // Draws frame f's shader into the shared GL canvas at pw x ph and copies it
  // into target (a 2D canvas). Returns false when nothing could be drawn.
  function renderShader(f, pw, ph, time, mouse, target) {
    const gl = glInit();
    const e = f.entry;
    if (!gl || !e || !e.prog) return false;
    pw = Math.max(1, Math.min(GL.max, Math.round(pw)));
    ph = Math.max(1, Math.min(GL.max, Math.round(ph)));
    if (GL.size[0] < pw || GL.size[1] < ph) {
      const nw = Math.min(GL.max, Math.max(GL.size[0], Math.ceil(pw / 256) * 256));
      const nh = Math.min(GL.max, Math.max(GL.size[1], Math.ceil(ph / 256) * 256));
      GL.canvas.width = nw;
      GL.canvas.height = nh;
      GL.size = [nw, nh];
    }
    const d = f.data;
    gl.viewport(0, 0, pw, ph);
    gl.useProgram(e.prog);
    gl.bindVertexArray(GL.vao);
    if (e.locs.rtScale) gl.uniform2f(e.locs.rtScale, pw / d.w, ph / d.h);
    let unit = 0;
    for (const u of e.meta.uniforms) {
      const loc = e.locs[u.name];
      if (!loc) continue;
      const v = valueOf(f, u);
      switch (u.type) {
        case "float":
          gl.uniform1f(loc, v);
          break;
        case "int":
          gl.uniform1i(loc, v);
          break;
        case "bool":
          gl.uniform1i(loc, v ? 1 : 0);
          break;
        case "color": {
          const c = parseHex(v) || [1, 1, 1, 1];
          if (u.alpha) gl.uniform4f(loc, c[0], c[1], c[2], c[3]);
          else gl.uniform3f(loc, c[0], c[1], c[2]);
          break;
        }
        case "vec":
          gl["uniform" + u.dim + (u.integer ? "iv" : "fv")](loc, u.integer ? new Int32Array(v.map(Math.trunc)) : new Float32Array(v));
          break;
        case "resolution":
          if (u.integer) gl.uniform2i(loc, Math.round(d.w), Math.round(d.h));
          else gl.uniform2f(loc, d.w, d.h);
          break;
        case "time":
          gl.uniform1f(loc, time);
          break;
        case "mouse":
          if (u.integer) gl.uniform2i(loc, Math.round(mouse[0]), Math.round(mouse[1]));
          else gl.uniform2f(loc, mouse[0], mouse[1]);
          break;
        case "sampler2D": {
          const t = textureFor(v);
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, t.tex);
          gl.bindSampler(unit, u.mipmap ? GL.samplers.mip : GL.samplers.linear);
          gl.uniform1i(loc, unit);
          unit++;
          break;
        }
      }
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    state.counts.renders++;
    if (target) {
      const tc = target.canvas;
      const ctx = target.ctx;
      ctx.globalCompositeOperation = "copy";
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(GL.canvas, 0, GL.size[1] - ph, pw, ph, 0, 0, tc.width, tc.height);
      ctx.globalCompositeOperation = "source-over";
    }
    return true;
  }

  // ------------------------------------------------------- uniform values
  function valueOf(f, u) {
    const raw = f.data.uniforms[u.name];
    switch (u.type) {
      case "float":
      case "int": {
        let v = typeof raw === "number" && Number.isFinite(raw) ? raw : typeof raw === "boolean" ? +raw : u.defaultValue;
        if (u.min != null && u.max != null) v = clamp(v, Math.min(u.min, u.max), Math.max(u.min, u.max));
        return u.type === "int" ? Math.trunc(v) : v;
      }
      case "bool":
        return typeof raw === "boolean" ? raw : typeof raw === "number" ? raw !== 0 : u.defaultValue;
      case "color":
        return typeof raw === "string" && parseHex(raw) ? raw : u.defaultValue;
      case "vec":
        return Array.isArray(raw) && raw.length === u.dim && raw.every((x) => typeof x === "number" && Number.isFinite(x)) ? raw : u.defaultValue;
      case "sampler2D":
        return validTexture(raw) ? raw : u.defaultValue;
      default:
        return null;
    }
  }
  const mouseOf = (f) => (f.mouse ? f.mouse : [f.data.w / 2, f.data.h / 2]);

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
  function screenRect(rr, v, d) {
    const l = rr.left + v.x + d.x * v.zoom;
    const t = rr.top + v.y + d.y * v.zoom;
    return { l, t, r: l + d.w * v.zoom, b: t + d.h * v.zoom };
  }

  // ---------------------------------------------------------------- storage
  function cleanUniforms(u) {
    const out = {};
    if (!u || typeof u !== "object" || Array.isArray(u)) return out;
    let n = 0;
    for (const [k, v] of Object.entries(u)) {
      if (n >= 64 || !/^\w{1,64}$/.test(k)) continue;
      if ((typeof v === "number" && Number.isFinite(v)) || typeof v === "boolean") out[k] = v;
      else if (typeof v === "string" && v.length <= 600000) out[k] = v;
      else if (Array.isArray(v) && v.length <= 4 && v.every((x) => typeof x === "number" && Number.isFinite(x))) out[k] = v.slice();
      else continue;
      n++;
    }
    return out;
  }
  function normalizeData(d) {
    const o = d && typeof d === "object" ? d : {};
    const preset = PRESET_BY_ID[o.preset] ? o.preset : PRESETS[0].id;
    return {
      id: typeof o.id === "string" && o.id ? o.id : uid(),
      x: Math.round(num(o.x, 0)),
      y: Math.round(num(o.y, 0)),
      w: Math.max(MIN_W, Math.round(num(o.w, DEFAULT_W))),
      h: Math.max(MIN_H, Math.round(num(o.h, DEFAULT_H))),
      z: Math.max(0, Math.round(num(o.z, 0))),
      name: typeof o.name === "string" ? o.name.slice(0, 200) : "",
      named: o.named === true,
      preset,
      glsl: typeof o.glsl === "string" && o.glsl.trim() ? o.glsl.slice(0, 200000) : PRESET_BY_ID[preset].glsl,
      uniforms: cleanUniforms(o.uniforms),
      speed: clamp(num(o.speed, 1), 0, 4),
      paused: o.paused === true,
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
    if (frames.length) {
      const ok = ls.set(STORE_PREFIX + key, JSON.stringify({ v: 1, t: Date.now(), frames }));
      if (!ok && !state.storageWarned) {
        state.storageWarned = true;
        showToast("Could not save the shader frames (storage is full)");
      }
    } else ls.del(STORE_PREFIX + key);
  }
  const snapshot = (f) => ({ ...f.data, uniforms: { ...f.data.uniforms } });
  function save(m) {
    clearTimeout(m.saveTimer);
    m.saveTimer = null;
    const frames = Array.from(m.frames.values()).map(snapshot);
    // The canvas file: canvas-nodes hands the change to the other panes.
    if (m.nodes) m.nodes.set(frames.map(toNode));
    else {
      writeStore(m.key, frames);
      for (const o of state.mounts.values()) if (o !== m && o.key === m.key && !o.nodes) reconcile(o, load(o.key));
    }
    saveEffects(m);
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
  const presetGlsl = (id) => (PRESET_BY_ID[id] || {}).glsl;
  function toNode(d) {
    const n = { id: d.id, type: NODE_TYPE, x: d.x, y: d.y, w: d.w, h: d.h, preset: d.preset };
    if (d.glsl && d.glsl !== presetGlsl(d.preset)) n.glsl = d.glsl;
    n.uniforms = { ...d.uniforms };
    n.title = d.named ? d.name || "" : "";
    if (d.speed !== 1) n.speed = d.speed;
    if (d.paused) n.paused = true;
    if (d.z) n.z = d.z;
    return n;
  }
  function fromNode(n) {
    const title = typeof n.title === "string" ? n.title : "";
    return normalizeData({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, z: n.z, name: title, named: typeof n.titled === "boolean" ? n.titled && !!title : !!title, preset: n.preset, glsl: n.glsl, uniforms: n.uniforms, speed: n.speed, paused: n.paused });
  }
  function registerNodeTypes(N) {
    if (nodesLoad.typed || !N || typeof N.registerType !== "function") return;
    nodesLoad.typed = true;
    N.registerType(NODE_TYPE, { keys: ["x", "y", "w", "h", "preset", "glsl", "uniforms", "title", "titled", "speed", "paused", "z"], fromLegacy: (d) => toNode(normalizeData(d)) });
    N.registerType(FX_TYPE, { keys: ["storyboard", "effects"] });
  }
  // Effects: one canvas-file node per storyboard that has any.
  function fxToJson(d) {
    const e = { id: d.id, type: "shader", mode: d.mode, preset: d.preset };
    if (d.glsl && d.glsl !== presetGlsl(d.preset)) e.glsl = d.glsl;
    e.uniforms = { ...d.uniforms };
    e.opacity = d.opacity;
    e.blend = d.blend;
    if (d.speed !== 1) e.speed = d.speed;
    if (d.paused) e.paused = true;
    return e;
  }
  function fxNodes(m) {
    const out = [];
    for (const ent of m.fx.values()) if (ent.list.length) out.push({ id: ent.nodeId || "sb_" + ent.sb, type: FX_TYPE, storyboard: ent.sb, effects: ent.list.map((f) => fxToJson(f.data)) });
    return out;
  }
  function loadFx(key) {
    try {
      const v = JSON.parse(ls.get(FX_PREFIX + key) || "null");
      return v && Array.isArray(v.nodes) ? v.nodes : [];
    } catch (_) {
      return [];
    }
  }
  function saveEffects(m) {
    const list = fxNodes(m);
    if (m.fxNodes) return void m.fxNodes.set(list);
    if (list.length) ls.set(FX_PREFIX + m.key, JSON.stringify({ v: 1, t: Date.now(), nodes: list }));
    else ls.del(FX_PREFIX + m.key);
    for (const o of state.mounts.values()) if (o !== m && o.key === m.key && !o.fxNodes) reconcileEffects(o, loadFx(o.key));
  }
  function scheduleSave(m, ms) {
    clearTimeout(m.saveTimer);
    m.saveTimer = setTimeout(() => save(m), ms == null ? 250 : ms);
  }

  // ----------------------------------------------------------------- mounts
  function mount(root, host, key, handle) {
    const layer = h("div", { class: "rtsh-layer", "data-rtsh-layer": "" });
    host.appendChild(layer);
    const m = { id: ++mountSeq, root, host, key, handle, layer, frames: new Map(), fx: new Map(), saveTimer: null, lastView: null, movedAt: 0, nodes: null, fxNodes: null, ws: null, vis: isShown(root), vio: null, vro: null };
    state.mounts.set(root, m);
    const onVis = () => state.mounts.get(root) === m && refreshVis(m);
    try {
      if (typeof IntersectionObserver === "function") (m.vio = new IntersectionObserver(onVis, { threshold: 0 })).observe(root);
      if (typeof ResizeObserver === "function") (m.vro = new ResizeObserver(onVis)).observe(root);
    } catch (_) {}
    const N = nodesApi();
    const ref = N && typeof N.refOf === "function" ? N.refOf(root) : null;
    if (N && ref && ref.workspacePath) {
      registerNodeTypes(N);
      m.ws = ref.workspacePath;
      const live = () => state.mounts.get(m.root) === m;
      m.nodes = N.attach({ workspacePath: ref.workspacePath, canvasPath: key, type: NODE_TYPE, token: m, onNodes: (list) => live() && reconcile(m, list.map(fromNode)) });
      m.fxNodes = m.nodes && N.attach({ workspacePath: ref.workspacePath, canvasPath: key, type: FX_TYPE, token: m, onNodes: (list) => live() && reconcileEffects(m, list) });
    }
    if (!m.nodes) {
      reconcile(m, load(key));
      reconcileEffects(m, loadFx(key));
    }
    wake();
    return m;
  }
  function unmount(m) {
    if (m.saveTimer) save(m);
    if (m.nodes) m.nodes.detach();
    if (m.fxNodes) m.fxNodes.detach();
    if (m.vio) m.vio.disconnect();
    if (m.vro) m.vro.disconnect();
    if (state.tool && state.tool.m === m) disarm();
    if (state.selected && state.selected.m === m) deselect();
    for (const f of m.frames.values()) destroyFrame(f, true);
    for (const ent of Array.from(m.fx.values())) destroyEntry(m, ent);
    if (fxUi.m === m) removeFxSection();
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
      const glslChanged = d.glsl !== f.data.glsl;
      const uniChanged = JSON.stringify(d.uniforms) !== JSON.stringify(f.data.uniforms);
      Object.assign(f.data, { x: d.x, y: d.y, w: d.w, h: d.h, z: d.z, name: d.name, named: d.named, preset: d.preset, speed: d.speed, paused: d.paused, uniforms: d.uniforms });
      applyGeom(f);
      applyTitle(f);
      if (glslChanged) applyGlsl(f, d.glsl);
      if (glslChanged || uniChanged) {
        f.dirty = true;
        if (docked(f)) refreshDock(true);
      }
    }
    for (const [id, f] of m.frames) if (!ids.has(id)) destroyFrame(f);
    wake();
  }
  const mountsOf = (key) => Array.from(state.mounts.values()).filter((m) => m.key === key);
  const visibleMount = (key) => {
    const list = key ? mountsOf(key) : Array.from(state.mounts.values());
    return list.find((m) => m.root === state.lastRoot && isShown(m.root)) || list.find((m) => isShown(m.root)) || null;
  };

  // ----------------------------------------------------------------- frames
  let io = null;
  function observer() {
    if (io || typeof IntersectionObserver !== "function") return io;
    io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          const f = en.target.__rtshFrame;
          if (!f) continue;
          f.io = en.isIntersecting;
          if (en.isIntersecting) wake();
        }
      },
      { threshold: 0 }
    );
    return io;
  }

  function buildFrame(m, raw) {
    const data = normalizeData(raw);
    const f = { m, data, el: null, els: {}, ctx: null, entry: null, result: null, t: 0, lastAt: 0, mouse: null, mouseTarget: null, io: null, dirty: true, renders: 0, status: "new", scale: 1, lastRenderAt: 0, recording: null };
    const E = f.els;
    E.glyph = icon("sparkles", "rtsh-head-icon", 1.5);
    E.title = h("span", { class: "rtsh-head-title" });
    E.titleInput = h("input", { class: "rtsh-head-input", type: "text", spellcheck: "false", "aria-label": "Frame name", maxlength: "200" });
    E.head = h("div", { class: "rtsh-head", "data-rtsh-head": "" }, h("div", { class: "rtsh-head-row" }, E.glyph, E.title, E.titleInput));
    E.canvas = h("canvas", { class: "rtsh-canvas", "data-testid": "canvas-shader-canvas" });
    E.canvas.width = 1;
    E.canvas.height = 1;
    f.ctx = E.canvas.getContext("2d");
    E.errTitle = h("div", { class: "rtsh-error-title" }, icon("alert", "rtsh-ic"), h("span", { text: "Shader error" }));
    E.errMsg = h("div", { class: "rtsh-error-msg" });
    E.error = h("div", { class: "rtsh-error", hidden: true }, h("div", { class: "rtsh-error-in" }, E.errTitle, E.errMsg));
    E.badge = h("div", { class: "rtsh-badge", hidden: true });
    E.body = h("div", { class: "rtsh-body", "data-rtsh-body": "" }, E.canvas, E.error, E.badge);
    E.body.__rtshFrame = f;
    E.outline = h("div", { class: "rtsh-outline", "aria-hidden": "true" });
    for (const k of ["n", "s", "w", "e"]) E.outline.append(h("div", { class: "rtsh-edge rtsh-edge-" + k, "data-rtsh-handle": k }));
    for (const k of ["nw", "ne", "sw", "se"]) E.outline.append(h("div", { class: "rtsh-corner rtsh-corner-" + k, "data-rtsh-handle": k }, h("div", { class: "rtsh-corner-sq" })));
    E.size = h("div", { class: "rtsh-size", "aria-hidden": "true" });
    f.el = h("div", { class: "rtsh-frame", "data-rtsh-id": data.id, role: "group", "aria-label": "Shader frame" }, E.head, E.body, E.outline, E.size);
    wireFrame(f);
    m.layer.appendChild(f.el);
    m.frames.set(data.id, f);
    applyGeom(f);
    applyGlsl(f, data.glsl);
    applyTitle(f);
    const o = observer();
    if (o) o.observe(E.body);
    wake();
    return f;
  }
  function destroyFrame(f, keepSelection) {
    if (!keepSelection && state.selected === f) deselect();
    if (io) io.unobserve(f.els.body);
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
  const presetLabel = (f) => (PRESET_BY_ID[f.data.preset] || PRESETS[0]).label;
  const shownName = (f) => (f.data.named && f.data.name) || f.data.name || presetLabel(f);
  function applyTitle(f) {
    if (f.kind === "effect") {
      if (docked(f)) state.dock.els.name.textContent = fxName(f);
      return;
    }
    const text = shownName(f);
    if (f.els.title.textContent !== text) f.els.title.textContent = text;
    f.els.head.title = text;
    f.el.setAttribute("aria-label", "Shader frame: " + text);
    if (docked(f)) state.dock.els.name.textContent = text;
  }
  // Compiles src for frame f; keeps the last good program while src fails.
  function applyGlsl(f, src, quiet) {
    f.data.glsl = src;
    const e = getEntry(src);
    f.result = e;
    if (e.ok) f.entry = e;
    f.dirty = true;
    showFrameError(f);
    if (!quiet && docked(f)) refreshDock(false);
    wake();
    return e;
  }
  function showFrameError(f) {
    if (f.kind === "effect") {
      f.el.toggleAttribute("data-error", !!f.result && !f.result.ok);
      return;
    }
    const e = f.result;
    const E = f.els;
    const failing = !!e && !e.ok;
    const first = failing ? e.errors[0] : null;
    if (failing && !f.entry) {
      E.errMsg.textContent = first ? (first.line ? `Line ${first.line}: ` : "") + first.msg : "The shader failed to compile.";
      E.error.hidden = false;
    } else E.error.hidden = true;
    f.el.toggleAttribute("data-error", failing);
    E.badge.hidden = !(failing && f.entry);
    if (!E.badge.hidden) E.badge.textContent = "Error · showing last good";
  }

  // --------------------------------------------------------- frame wiring
  function wireFrame(f) {
    const E = f.els;
    const el = f.el;
    el.addEventListener("pointerdown", (e) => {
      if (e.button === 1 || state.spaceDown) return;
      e.stopPropagation();
      if (e.button !== 0) {
        select(f);
        return;
      }
      const t = e.target;
      select(f);
      const hd = t.closest("[data-rtsh-handle]");
      if (hd) {
        e.preventDefault();
        startDrag(f, e, "resize:" + hd.getAttribute("data-rtsh-handle"));
        return;
      }
      if (t.closest("input")) return;
      startDrag(f, e, "move");
    });
    for (const type of ["mousedown", "click", "auxclick", "contextmenu", "keyup", "keypress", "paste", "copy", "cut"]) el.addEventListener(type, (e) => e.stopPropagation());
    el.addEventListener("keydown", (e) => {
      if (isEditable(e.target)) e.stopPropagation();
    });
    el.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      if (e.target.closest(".rtsh-head-title, .rtsh-head-row")) startTitleEdit(f);
      else if (e.target.closest("[data-rtsh-body]")) openEditor(f);
    });
    el.addEventListener("pointermove", (e) => {
      if (!e.isPrimary) return;
      const p = toWorld(f.m, e.clientX, e.clientY);
      const lx = clamp(p.x - f.data.x, 0, f.data.w);
      const ly = clamp(p.y - f.data.y, 0, f.data.h);
      f.mouseTarget = [lx, f.data.h - ly];
      if (!f.mouse) f.mouse = [f.data.w / 2, f.data.h / 2];
      if (f.entry && f.entry.meta.hasMouse) wake();
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
        f.data.named = false;
        f.data.name = "";
      } else if (v !== f.els.title.textContent) {
        f.data.name = v;
        f.data.named = true;
      }
      applyTitle(f);
      save(f.m);
    }
    if (document.activeElement === f.els.titleInput) f.els.titleInput.blur();
  }

  // --------------------------------------------------------------- dragging
  function startDrag(f, e, kind) {
    const m = f.m;
    const pid = e.pointerId;
    const sx = e.clientX;
    const sy = e.clientY;
    const start = toWorld(m, sx, sy);
    const o = { x: f.data.x, y: f.data.y, w: f.data.w, h: f.data.h };
    const handle = kind.startsWith("resize:") ? kind.slice(7) : null;
    let moved = false;
    const capture = () => {
      try {
        f.el.setPointerCapture(pid);
      } catch (_) {}
      document.documentElement.setAttribute("data-rtsh-dragging", "");
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
        f.dirty = true;
        wake();
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
      document.documentElement.removeAttribute("data-rtsh-dragging");
      f.el.removeAttribute("data-dragging");
      hideSize(f);
      if (moved && ev) ev.stopPropagation();
      if (moved || handle) {
        f.dirty = true;
        save(m);
        wake();
      }
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
    return { x: hd.includes("w") ? Math.round(o.x + o.w - w) : o.x, y: hd.includes("n") ? Math.round(o.y + o.h - hh) : o.y, w, h: hh };
  }
  function showSize(f) {
    f.els.size.textContent = `${f.data.w} × ${f.data.h}`;
    f.el.setAttribute("data-sizing", "");
  }
  function hideSize(f) {
    f.el.removeAttribute("data-sizing");
  }

  // -------------------------------------------------------------- selection
  function clearAppSelection(m) {
    try {
      const hd = m.handle || findHandle(m.root);
      if (hd && typeof hd.getSelection === "function" && hd.getSelection().length && typeof hd.clearSelection === "function") hd.clearSelection();
    } catch (_) {}
  }
  function clearBrowserSelection() {
    try {
      const b = window.__RE_TEMPO_CANVAS_BROWSER__;
      if (b && typeof b.state === "function" && b.state().selected && typeof b.select === "function") b.select(null);
    } catch (_) {}
  }
  function select(f) {
    clearAppSelection(f.m);
    clearBrowserSelection();
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
    openDock(f);
  }
  function deselect() {
    const f = state.selected;
    if (!f) return;
    endTitleEdit(f, true);
    f.el.removeAttribute("data-selected");
    state.selected = null;
    closeDock();
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
    const preset = PRESET_BY_ID[o.preset] ? o.preset : PRESETS[0].id;
    const f = buildFrame(m, { x, y, w, h: hh, z: top + 1, preset, glsl: typeof o.glsl === "string" ? o.glsl : PRESET_BY_ID[preset].glsl, uniforms: o.uniforms || {}, name: o.name || "", named: !!o.name });
    state.counts.created++;
    save(m);
    if (o.select !== false) select(f);
    return f;
  }
  function removeFrame(f, withUndo) {
    const m = f.m;
    const data = snapshot(f);
    destroyFrame(f);
    state.counts.removed++;
    save(m);
    if (withUndo !== false) showToast("Shader frame deleted", () => restore(m.key, data));
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
  const frameById = (id) => {
    for (const m of state.mounts.values()) if (m.frames.has(id)) return m.frames.get(id);
    return null;
  };
  // Shader state changes that can be undone from the toast (preset, reset).
  function shaderState(f) {
    return { preset: f.data.preset, glsl: f.data.glsl, uniforms: { ...f.data.uniforms }, speed: f.data.speed, name: f.data.name, named: f.data.named };
  }
  function setShaderState(f, s) {
    Object.assign(f.data, { preset: s.preset, speed: s.speed, name: s.name, named: s.named, uniforms: { ...s.uniforms } });
    applyGlsl(f, s.glsl, true);
    applyTitle(f);
    save(f.m);
    if (docked(f)) refreshDock(true);
  }
  function withUndoToast(f, text, change) {
    const before = shaderState(f);
    const id = f.data.id;
    change();
    showToast(text, () => {
      const g = frameById(id) || effectById(id);
      if (g) setShaderState(g, before);
    });
  }
  function setPreset(f, preset) {
    const p = PRESET_BY_ID[preset];
    if (!p || (preset === f.data.preset && f.data.glsl === p.glsl)) return;
    const custom = f.data.glsl !== (PRESET_BY_ID[f.data.preset] || {}).glsl;
    const apply = () => setShaderState(f, { preset, glsl: p.glsl, uniforms: {}, speed: f.data.speed, name: f.data.named ? f.data.name : "", named: f.data.named });
    if (custom) withUndoToast(f, "Preset applied, GLSL edits replaced", apply);
    else apply();
  }
  function resetShader(f) {
    const p = PRESET_BY_ID[f.data.preset] || PRESETS[0];
    withUndoToast(f, "Shader reset", () => setShaderState(f, { preset: p.id, glsl: p.glsl, uniforms: {}, speed: 1, name: f.data.name, named: f.data.named }));
  }
  function setUniform(f, name, value, commit) {
    f.data.uniforms[name] = value;
    f.dirty = true;
    wake();
    scheduleSave(f.m, commit ? 0 : 350);
  }

  // ------------------------------------------------------------------ toast
  function showToast(text, onUndo) {
    hideToast();
    const kids = [h("span", { class: "rtsh-toast-text", text })];
    let action = null;
    if (onUndo) {
      action = h("button", { class: "rtsh-toast-action", type: "button", text: "Undo" });
      kids.push(action);
    }
    const el = h("div", { class: "rtsh-toast", role: "status", "aria-live": "polite", "data-rtsh-toast": "" }, ...kids);
    if (!onUndo) el.setAttribute("data-plain", "");
    const m = (state.selected && state.selected.m) || visibleMount();
    const r = m && m.root.isConnected ? m.root.getBoundingClientRect() : { left: 0, right: window.innerWidth, bottom: window.innerHeight };
    // Never over the GLSL sheet or the right card. With the sheet open the
    // toast sits in the strip under it (centered on the sheet) when that
    // strip fits it; otherwise it is centered on the canvas span left of
    // whichever of the two is open.
    let lo = Math.max(0, r.left);
    let hi = Math.min(window.innerWidth, r.right);
    let sheetR = null;
    for (const n of document.querySelectorAll("[data-rtsh-sheet], [data-rcc-props]")) {
      const nr = n.getBoundingClientRect();
      if (!(nr.width > 0 && nr.height > 0)) continue;
      if (n.hasAttribute("data-rtsh-sheet")) sheetR = nr;
      if (nr.left > lo + 160 && nr.left < hi) hi = nr.left - 12;
    }
    el.style.left = Math.round((lo + hi) / 2) + "px";
    el.style.bottom = Math.round(window.innerHeight - r.bottom + 68) + "px";
    document.body.appendChild(el);
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    if (sheetR && window.innerHeight - sheetR.bottom >= th + 12) {
      const gap = window.innerHeight - sheetR.bottom;
      const half = tw / 2 + 8;
      const bottom = Math.round((gap - th) / 2);
      const midY = window.innerHeight - bottom - th / 2;
      // the nearest slot along the strip that is not over a field or a button
      // (the composer, the zoom control): start centered on the sheet, then
      // step outwards.
      const busy = (cx) =>
        [-tw / 2, 0, tw / 2].some((dx) => {
          const x = Math.max(1, Math.min(window.innerWidth - 1, cx + dx));
          return document.elementsFromPoint(x, midY).some((n) => n !== el && !el.contains(n) && n.closest && n.closest("textarea, input, button, [contenteditable], [role=toolbar], [role=group]"));
        });
      const c0 = Math.max(half, Math.min((sheetR.left + sheetR.right) / 2, window.innerWidth - half));
      let cx = c0;
      for (let k = 1; busy(cx) && k <= 40; k++) {
        const cand = [c0 + 24 * k, c0 - 24 * k].find((c) => c >= half && c <= window.innerWidth - half && !busy(c));
        if (cand != null) cx = cand;
      }
      if (busy(cx)) cx = c0;
      el.style.left = Math.round(cx) + "px";
      el.style.bottom = bottom + "px";
    } else if (tw) el.style.left = Math.round(Math.max(lo + tw / 2 + 8, Math.min((lo + hi) / 2, hi - tw / 2 - 8))) + "px";
    const t = { el, root: m && m.root, onUndo, timer: null, left: onUndo ? UNDO_MS : 2200, since: 0 };
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
    if (action)
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
    if (!t || !t.onUndo) return false;
    hideToast();
    t.onUndo();
    return true;
  }

  // ------------------------------------------------------------ render loop
  function wake() {
    if (state.loop.raf || !state.enabled) return;
    if (document.visibilityState === "hidden") return;
    state.loop.raf = requestAnimationFrame(tick);
  }
  function markAllDirty() {
    for (const m of state.mounts.values()) {
      for (const f of m.frames.values()) f.dirty = true;
      for (const ent of m.fx.values()) for (const f of ent.list) f.dirty = true;
    }
    wake();
  }
  // Frames and effects with their screen rects. An effect takes its size from
  // the storyboard box (world units: the box is inside the scaled layer).
  function* renderables(m, rr, v) {
    for (const f of m.frames.values()) yield [f, screenRect(rr, v, f.data)];
    for (const ent of m.fx.values()) {
      const host = ent.host;
      if (!host || !host.isConnected) {
        for (const f of ent.list) setStatus(f, "offscreen");
        continue;
      }
      const w = Math.max(1, host.offsetWidth);
      const hh = Math.max(1, host.offsetHeight);
      const b = host.getBoundingClientRect();
      for (const f of ent.list) {
        if (f.data.w !== w || f.data.h !== hh) {
          f.data.w = w;
          f.data.h = hh;
          f.dirty = true;
        }
        if (!f.el.isConnected) continue;
        yield [f, { l: b.left, t: b.top, r: b.right, b: b.bottom }];
      }
    }
  }
  function targetSize(f, zoom, scale) {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
    let pw = f.data.w * zoom * dpr * scale;
    let ph = f.data.h * zoom * dpr * scale;
    const k = Math.min(1, MAX_DIM / Math.max(pw, ph), Math.sqrt(MAX_AREA / Math.max(1, pw * ph)));
    pw = Math.max(1, Math.round(pw * k));
    ph = Math.max(1, Math.round(ph * k));
    return [pw, ph];
  }
  const differs = (c, t) => Math.abs(c.width - t[0]) > Math.max(2, t[0] * 0.08) || Math.abs(c.height - t[1]) > Math.max(2, t[1] * 0.08);
  function setStatus(f, s) {
    if (f.status === s) return;
    f.status = s;
    if (s !== "running") f.lastAt = 0;
    if (docked(f)) updateDockStatus();
  }
  function tick(now) {
    state.loop.raf = 0;
    if (!state.enabled) return;
    if (document.visibilityState === "hidden") {
      for (const m of state.mounts.values()) for (const f of m.frames.values()) setStatus(f, "document-hidden");
      return;
    }
    const due = now - state.loop.last >= FRAME_MS - 1.5;
    // Between two render slots nothing changes: just wait for the next frame.
    if (!due && state.loop.keep) {
      state.loop.raf = requestAnimationFrame(tick);
      return;
    }
    state.counts.ticks++;
    let keep = false;
    const jobs = [];
    for (const m of state.mounts.values()) {
      if (!m.frames.size && !m.fx.size) continue;
      if (!mountShown(m)) {
        for (const f of m.frames.values()) setStatus(f, "hidden-tab");
        for (const ent of m.fx.values()) for (const f of ent.list) setStatus(f, "hidden-tab");
        continue;
      }
      const v = viewOf(m);
      const lv = m.lastView;
      if (!lv || lv.x !== v.x || lv.y !== v.y || lv.zoom !== v.zoom) {
        if (lv) m.movedAt = now;
        m.lastView = v;
      }
      const moving = now - m.movedAt < MOVE_SETTLE_MS;
      if (moving) keep = true;
      const rr = m.root.getBoundingClientRect();
      for (const [f, sr] of renderables(m, rr, v)) {
        const inView = sr.r > rr.left && sr.l < rr.right && sr.b > rr.top && sr.t < rr.bottom && f.io !== false;
        if (!inView) {
          setStatus(f, "offscreen");
          continue;
        }
        if (!f.entry) {
          setStatus(f, "error");
          continue;
        }
        const meta = f.entry.meta;
        const playing = meta.hasTime && !f.data.paused && !state.reduced && f.data.speed > 0;
        let easing = false;
        if (meta.hasMouse && f.mouseTarget && f.mouse) easing = Math.hypot(f.mouseTarget[0] - f.mouse[0], f.mouseTarget[1] - f.mouse[1]) > 0.25;
        setStatus(f, playing ? "running" : meta.hasTime && state.reduced ? "reduced-motion" : meta.hasTime && (f.data.paused || f.data.speed <= 0) ? "paused" : "static");
        const full = targetSize(f, v.zoom, 1);
        const live = playing || easing;
        const tgt = moving && live ? targetSize(f, v.zoom, MOVE_SCALE) : full;
        if (!moving && differs(f.els.canvas, full)) f.dirty = true;
        if (live || f.dirty) {
          keep = true;
          jobs.push({ f, tgt, playing, easing, moving, zoom: v.zoom });
        }
      }
    }
    if (due && jobs.length) {
      state.loop.last = now;
      const n = jobs.length;
      const start = n > MAX_PER_TICK ? state.loop.rr++ % n : 0;
      for (let k = 0; k < Math.min(n, MAX_PER_TICK); k++) {
        const j = jobs[(start + k) % n];
        const f = j.f;
        const dt = f.lastAt ? Math.min(now - f.lastAt, 100) / 1000 : 0;
        f.lastAt = now;
        if (j.playing) f.t += dt * f.data.speed;
        if (f.mouseTarget && f.mouse) {
          const a = 1 - Math.exp(-MOUSE_RATE * Math.max(dt, 1 / FPS));
          f.mouse = [f.mouse[0] + (f.mouseTarget[0] - f.mouse[0]) * a, f.mouse[1] + (f.mouseTarget[1] - f.mouse[1]) * a];
        }
        const c = f.els.canvas;
        if (c.width !== j.tgt[0] || c.height !== j.tgt[1]) {
          c.width = j.tgt[0];
          c.height = j.tgt[1];
        }
        if (renderShader(f, j.tgt[0], j.tgt[1], f.t, mouseOf(f), { canvas: c, ctx: f.ctx })) {
          f.renders++;
          f.lastRenderAt = now;
          f.scale = j.tgt[0] < targetSize(f, j.zoom, 1)[0] - 1 ? MOVE_SCALE : 1;
          f.dirty = false;
        }
      }
    }
    state.loop.keep = keep;
    if (keep) state.loop.raf = requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- exports
  function fileBase(f) {
    return (shownName(f) || "shader").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "shader";
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: name });
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    state.lastDownload = { name, size: blob.size, type: blob.type, at: Date.now() };
  }
  function blobToDataUrl(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  }
  async function exportPng(f, opts) {
    const o = opts || {};
    if (!f.entry) throw new Error("The shader does not compile");
    const s = Math.min(o.scale || PNG_SCALE, Math.min(PNG_MAX_DIM, GL.max || PNG_MAX_DIM) / Math.max(f.data.w, f.data.h));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(f.data.w * s));
    c.height = Math.max(1, Math.round(f.data.h * s));
    if (!renderShader(f, c.width, c.height, f.t, mouseOf(f), { canvas: c, ctx: c.getContext("2d") })) throw new Error("WebGL 2 is not available");
    const blob = await new Promise((res) => c.toBlob(res, "image/png"));
    if (!blob) throw new Error("PNG encoding failed");
    if (o.download !== false) download(blob, fileBase(f) + ".png");
    return o.dataUrl ? blobToDataUrl(blob) : { size: blob.size, type: blob.type, width: c.width, height: c.height };
  }
  function exportWebm(f, opts) {
    const o = opts || {};
    if (f.recording) return f.recording.promise;
    if (!f.entry) return Promise.reject(new Error("The shader does not compile"));
    if (typeof MediaRecorder !== "function") return Promise.reject(new Error("MediaRecorder is not available"));
    const ms = clamp(num(o.ms, WEBM_MS), 200, 60000);
    const s = Math.min(1, WEBM_MAX_DIM / Math.max(f.data.w, f.data.h));
    const c = document.createElement("canvas");
    c.width = Math.max(2, Math.round((f.data.w * s) / 2) * 2);
    c.height = Math.max(2, Math.round((f.data.h * s) / 2) * 2);
    const ctx = c.getContext("2d");
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    if (!mime || typeof c.captureStream !== "function") return Promise.reject(new Error("WebM recording is not supported here"));
    const t0 = f.t;
    const speed = f.data.speed > 0 ? f.data.speed : 1;
    const animated = f.entry.meta.hasTime;
    renderShader(f, c.width, c.height, t0, mouseOf(f), { canvas: c, ctx });
    const stream = c.captureStream(FPS);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000 });
    const chunks = [];
    let frames = 0;
    const job = { progress: 0, ms, promise: null };
    f.recording = job;
    job.promise = new Promise((resolve, reject) => {
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      rec.onerror = (e) => {
        f.recording = null;
        updateDockExport();
        reject(e.error || new Error("Recording failed"));
      };
      rec.onstop = () => {
        for (const tr of stream.getTracks()) tr.stop();
        f.recording = null;
        const blob = new Blob(chunks, { type: "video/webm" });
        if (o.download !== false && blob.size) download(blob, fileBase(f) + ".webm");
        updateDockExport();
        resolve({ size: blob.size, type: blob.type, mime, width: c.width, height: c.height, frames, ms });
      };
      const begin = performance.now();
      const step = () => {
        const el = performance.now() - begin;
        if (f.entry) {
          renderShader(f, c.width, c.height, animated ? t0 + (Math.min(el, ms) / 1000) * speed : t0, mouseOf(f), { canvas: c, ctx });
          frames++;
        }
        job.progress = Math.min(1, el / ms);
        updateDockExport();
        if (el >= ms) {
          // No new frames from here (the clip keeps its length). A software
          // encoder under load may not have emitted anything yet: give it up
          // to 2 s to deliver the first data before stopping.
          const until = performance.now() + 2000;
          const finish = () => {
            if (rec.state === "inactive") return;
            if (chunks.length || performance.now() > until) {
              try {
                rec.stop();
              } catch (_) {}
              return;
            }
            try {
              rec.requestData();
            } catch (_) {}
            setTimeout(finish, 100);
          };
          finish();
          return;
        }
        setTimeout(step, FRAME_MS);
      };
      rec.start(250);
      setTimeout(step, FRAME_MS);
    });
    updateDockExport();
    return job.promise;
  }

  // Standalone embed: the wrapped shader, a loop and nothing else. Runs on
  // any page with WebGL 2; respects reduced motion and pauses off screen.
  function rtshEmbedRun(canvas, cfg, wrap, patterns) {
    var gl = canvas.getContext("webgl2", { premultipliedAlpha: false, antialias: false });
    if (!gl) {
      canvas.style.background = "#111";
      return;
    }
    var w = wrap(cfg.glsl);
    if (w.error) {
      console.error(w.error);
      return;
    }
    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
      return s;
    }
    var vs = w.es3 ? "#version 300 es\nin vec2 a;\nvoid main() { gl_Position = vec4(a, 0.0, 1.0); }\n" : "attribute vec2 a;\nvoid main() { gl_Position = vec4(a, 0.0, 1.0); }\n";
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, w.code));
    gl.bindAttribLocation(prog, 0, "a");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    var loc = function (n) {
      return gl.getUniformLocation(prog, n);
    };
    var unit = 0;
    var dirty = true;
    cfg.uniforms.forEach(function (u) {
      var l = loc(u.name);
      if (!l) return;
      var v = u.value;
      if (u.type === "float") gl.uniform1f(l, v);
      else if (u.type === "int" || u.type === "bool") gl.uniform1i(l, +v);
      else if (u.type === "vec") gl["uniform" + v.length + (u.integer ? "iv" : "fv")](l, v);
      else if (u.type === "sampler2D") {
        var tex = gl.createTexture();
        var my = unit++;
        gl.activeTexture(gl.TEXTURE0 + my);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
        gl.uniform1i(l, my);
        var up = function (src) {
          gl.activeTexture(gl.TEXTURE0 + my);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, u.mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
          dirty = true;
        };
        if (v.indexOf("image:") === 0) {
          var img = new Image();
          img.onload = function () {
            up(img);
          };
          img.src = v.slice(6);
        } else {
          var c2 = document.createElement("canvas");
          c2.width = 512;
          c2.height = 512;
          patterns[v.slice(8)](c2.getContext("2d"), 512, 512);
          up(c2);
        }
      } else if (u.type === "color") {
        var s = v.replace("#", "");
        var p = function (i) {
          return parseInt(s.slice(i, i + 2), 16) / 255;
        };
        if (s.length === 3 || s.length === 4)
          s = s
            .split("")
            .map(function (ch) {
              return ch + ch;
            })
            .join("");
        if (u.alpha) gl.uniform4f(l, p(0), p(2), p(4), s.length >= 8 ? p(6) : 1);
        else gl.uniform3f(l, p(0), p(2), p(4));
      }
    });
    var lScale = loc("rt_Scale");
    var autos = cfg.auto.map(function (a) {
      return { type: a.type, integer: a.integer, l: loc(a.name) };
    });
    var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var t = 0;
    var last = 0;
    var prev = 0;
    var visible = true;
    var mouse = null;
    var target = null;
    canvas.addEventListener("pointermove", function (e) {
      var r = canvas.getBoundingClientRect();
      target = [e.clientX - r.left, r.height - (e.clientY - r.top)];
      if (!mouse) mouse = [r.width / 2, r.height / 2];
      dirty = true;
    });
    if (window.IntersectionObserver)
      new IntersectionObserver(function (es) {
        visible = es[es.length - 1].isIntersecting;
      }).observe(canvas);
    function frame(now) {
      requestAnimationFrame(frame);
      if (!visible || document.hidden || now - last < 1000 / 30 - 1.5) return;
      var cw = canvas.clientWidth;
      var ch = canvas.clientHeight;
      if (!cw || !ch) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var pw = Math.round(cw * dpr);
      var ph = Math.round(ch * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
        dirty = true;
      }
      var dt = prev ? Math.min(now - prev, 100) / 1000 : 0;
      prev = now;
      last = now;
      var anim = cfg.animated && !reduce;
      if (target && mouse) {
        var k = 1 - Math.exp(-5 * Math.max(dt, 1 / 30));
        mouse = [mouse[0] + (target[0] - mouse[0]) * k, mouse[1] + (target[1] - mouse[1]) * k];
        if (Math.abs(target[0] - mouse[0]) + Math.abs(target[1] - mouse[1]) > 0.25) dirty = true;
      }
      if (!anim && !dirty) return;
      dirty = false;
      if (anim) t += dt * cfg.speed;
      var m = mouse || [cw / 2, ch / 2];
      gl.viewport(0, 0, pw, ph);
      if (lScale) gl.uniform2f(lScale, pw / cw, ph / ch);
      autos.forEach(function (a) {
        if (!a.l) return;
        if (a.type === "time") gl.uniform1f(a.l, t);
        else {
          var v = a.type === "resolution" ? [cw, ch] : m;
          if (a.integer) gl.uniform2i(a.l, Math.round(v[0]), Math.round(v[1]));
          else gl.uniform2f(a.l, v[0], v[1]);
        }
      });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    t = cfg.time || 0;
    requestAnimationFrame(frame);
  }
  function buildEmbed(f) {
    const e = f.entry;
    if (!e) return null;
    const uniforms = [];
    const auto = [];
    const used = new Set();
    for (const u of e.meta.uniforms) {
      if (u.type === "resolution" || u.type === "time" || u.type === "mouse") {
        auto.push({ type: u.type, name: u.name, integer: !!u.integer });
        continue;
      }
      const v = valueOf(f, u);
      if (u.type === "sampler2D" && String(v).startsWith("pattern:")) used.add(v.slice(8));
      uniforms.push({ type: u.type, name: u.name, value: v, alpha: !!u.alpha, integer: !!u.integer, mipmap: !!u.mipmap });
    }
    const cfg = { glsl: e.src, uniforms, auto, animated: e.meta.hasTime, speed: f.data.speed, time: Math.round(f.t * 1000) / 1000 };
    const id = "rtsh-" + f.data.id.replace(/[^\w-]/g, "");
    const pats = Array.from(used)
      .map((k) => `    ${JSON.stringify(k)}: ${PATTERNS[k].draw.toString()}`)
      .join(",\n");
    const safe = (s) => s.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
    return (
      `<!-- Shader "${shownName(f).replace(/--/g, "-")}" from RE-TEMPO. Standalone WebGL 2, no SDK. -->\n` +
      `<div style="position:relative;width:100%;aspect-ratio:${f.data.w} / ${f.data.h};">\n` +
      `  <canvas data-shader-embed="${id}" style="position:absolute;inset:0;width:100%;height:100%;display:block;"></canvas>\n` +
      `</div>\n` +
      `<script>\n(() => {\n` +
      safe(
        `  const wrap = ${rtshWrap.toString()};\n` +
          `  const run = ${rtshEmbedRun.toString()};\n` +
          `  const patterns = {\n${pats}\n  };\n` +
          `  const cfg = ${JSON.stringify(cfg)};\n` +
          `  const canvas = document.querySelector('canvas[data-shader-embed="${id}"]');\n` +
          `  if (canvas) run(canvas, cfg, wrap, patterns);\n`
      ) +
      `})();\n</script>\n`
    );
  }
  async function copyText(text) {
    state.lastCopied = text;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}
    try {
      const ta = h("textarea", { class: "rtsh-copy-buffer", "aria-hidden": "true" });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (_) {
      return false;
    }
  }

  // ---------------------------------------------------------------- effects
  // Shader effects on storyboards (see the header). An effect is a frame-like
  // object (kind "effect": data, entry, result, status, canvas) so the panel,
  // the GLSL editor and the render loop treat it like a frame; its size is the
  // storyboard box's and it has no position of its own.
  const docked = (f) => !!state.dock && state.dock.f === f;
  const fxUid = () => "fx_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fxName = (f) => presetLabel(f);
  // Short, for the 28 px row: "Background 80%", "Multiply 60%", "Overlay".
  const fxModeLabel = (d) => (d.mode === "background" ? "Background" : d.blend !== "normal" ? d.blend.replace(/-/g, " ") : "Overlay") + (d.opacity < 1 ? " " + Math.round(d.opacity * 100) + "%" : "");
  const fxUi = { section: null, list: null, title: null, header: null, add: null, menu: null, m: null, sb: null, sig: "" };
  function normalizeEffect(o, fallbackId) {
    const r = o && typeof o === "object" ? o : {};
    const id = typeof r.id === "string" && r.id ? r.id : fallbackId || fxUid();
    const d = normalizeData({ id, x: 0, y: 0, w: num(r.w, DEFAULT_W), h: num(r.h, DEFAULT_H), z: 0, name: "", named: false, preset: r.preset, glsl: r.glsl, uniforms: r.uniforms, speed: r.speed, paused: r.paused });
    d.mode = FX_MODES.includes(r.mode) ? r.mode : FX_NEW.mode;
    d.blend = FX_BLENDS.includes(r.blend) ? r.blend : "normal";
    d.opacity = clamp(num(r.opacity, 1), 0, 1);
    return d;
  }
  const effectById = (id) => {
    for (const m of state.mounts.values()) for (const ent of m.fx.values()) for (const f of ent.list) if (f.data.id === id) return f;
    return null;
  };
  // The storyboard's own box: the outermost div[data-storyboard-id] in the
  // world layer (renderItem's position:relative, 100% x 100% div).
  function sbElement(m, id) {
    if (!m.host || !m.host.isConnected || !id) return null;
    let sel;
    try {
      sel = `div[data-storyboard-id="${CSS.escape(String(id))}"]`;
    } catch (_) {
      return null;
    }
    for (const el of m.host.querySelectorAll(sel)) {
      if (el.hasAttribute("data-fullscreen-storyboard-overlay")) continue;
      const up = el.parentElement && el.parentElement.closest("[data-storyboard-id]");
      if (up && m.host.contains(up)) continue;
      return el;
    }
    return null;
  }
  function buildEffect(m, sb, raw, fallbackId) {
    const data = normalizeEffect(raw, fallbackId);
    const f = { kind: "effect", m, sb, data, el: null, els: {}, ctx: null, entry: null, result: null, t: 0, lastAt: 0, mouse: null, mouseTarget: null, io: null, dirty: true, renders: 0, status: "new", scale: 1, lastRenderAt: 0, recording: null };
    const c = h("canvas", { class: "rtsh-fx-canvas", "data-rtsh-fx": data.id, "data-testid": "canvas-shader-effect", "aria-hidden": "true" });
    c.width = 1;
    c.height = 1;
    c.__rtshFrame = f;
    f.els.canvas = c;
    f.el = c;
    f.ctx = c.getContext("2d");
    applyEffectStyle(f);
    applyGlsl(f, data.glsl, true);
    const o = observer();
    if (o) o.observe(c);
    return f;
  }
  function applyEffectStyle(f) {
    const c = f.el;
    const d = f.data;
    c.setAttribute("data-mode", d.mode);
    c.setAttribute("data-blend", d.mode === "overlay" ? d.blend : "normal");
    c.style.opacity = String(d.opacity);
    c.style.mixBlendMode = d.mode === "overlay" ? d.blend : "normal";
  }
  function destroyEffect(f) {
    if (docked(f)) closeDock();
    if (io) io.unobserve(f.el);
    f.el.remove();
  }
  function destroyEntry(m, ent) {
    for (const f of ent.list) destroyEffect(f);
    ent.list = [];
    if (ent.bg) ent.bg.remove();
    if (ent.fg) ent.fg.remove();
    if (ent.host) ent.host.removeAttribute("data-rtsh-fx-host");
    ent.host = null;
    m.fx.delete(ent.sb);
  }
  function fxEntry(m, sb) {
    let ent = m.fx.get(sb);
    if (!ent) {
      ent = { sb, nodeId: "sb_" + sb, list: [], host: null, bg: null, fg: null };
      m.fx.set(sb, ent);
    }
    return ent;
  }
  function syncKids(parent, els) {
    els.forEach((el, i) => {
      if (parent.children[i] !== el) parent.insertBefore(el, parent.children[i] || null);
    });
    while (parent.children.length > els.length) parent.lastElementChild.remove();
  }
  // Every effect's canvas in its storyboard box, in list order: the
  // background layer is the box's first child, the overlay layer its last.
  function placeEffects(m) {
    for (const ent of m.fx.values()) {
      const el = ent.list.length ? sbElement(m, ent.sb) : null;
      if (el !== ent.host) {
        if (ent.host) ent.host.removeAttribute("data-rtsh-fx-host");
        ent.host = el;
      }
      if (!el) {
        if (ent.bg) ent.bg.remove();
        if (ent.fg) ent.fg.remove();
        continue;
      }
      if (!ent.bg) ent.bg = h("div", { class: "rtsh-fx-layer", "data-rtsh-fx-layer": "background" });
      if (!ent.fg) ent.fg = h("div", { class: "rtsh-fx-layer", "data-rtsh-fx-layer": "overlay" });
      if (!el.hasAttribute("data-rtsh-fx-host")) el.setAttribute("data-rtsh-fx-host", "");
      if (el.firstChild !== ent.bg) el.insertBefore(ent.bg, el.firstChild);
      if (el.lastChild !== ent.fg) el.appendChild(ent.fg);
      syncKids(ent.bg, ent.list.filter((f) => f.data.mode === "background").map((f) => f.el));
      syncKids(ent.fg, ent.list.filter((f) => f.data.mode !== "background").map((f) => f.el));
    }
  }
  // The canvas file's storyboard nodes -> effects (the file wins).
  function reconcileEffects(m, nodes) {
    const want = new Map();
    for (const n of Array.isArray(nodes) ? nodes : []) {
      if (!n || typeof n !== "object") continue;
      const sb = typeof n.storyboard === "string" && n.storyboard ? n.storyboard : typeof n.id === "string" ? n.id.replace(/^sb_/, "") : "";
      if (!sb || !Array.isArray(n.effects)) continue;
      want.set(sb, { nodeId: typeof n.id === "string" && n.id ? n.id : "sb_" + sb, effects: n.effects.filter((e) => e && typeof e === "object" && (e.type == null || e.type === "shader")) });
    }
    for (const ent of Array.from(m.fx.values())) if (!want.has(ent.sb)) destroyEntry(m, ent);
    for (const [sb, w] of want) {
      const ent = fxEntry(m, sb);
      ent.nodeId = w.nodeId;
      const old = new Map(ent.list.map((f) => [f.data.id, f]));
      const seen = new Set();
      const next = [];
      w.effects.forEach((raw, i) => {
        let d = normalizeEffect(raw, "fx_" + sb + "_" + i);
        if (seen.has(d.id)) d = normalizeEffect({ ...raw, id: "fx_" + sb + "_" + i });
        seen.add(d.id);
        let f = old.get(d.id);
        if (!f) f = buildEffect(m, sb, d);
        else {
          old.delete(d.id);
          const glslChanged = d.glsl !== f.data.glsl;
          const uniChanged = JSON.stringify(d.uniforms) !== JSON.stringify(f.data.uniforms);
          Object.assign(f.data, { preset: d.preset, speed: d.speed, paused: d.paused, uniforms: d.uniforms, mode: d.mode, blend: d.blend, opacity: d.opacity });
          applyEffectStyle(f);
          if (glslChanged) applyGlsl(f, d.glsl, true);
          f.dirty = true;
          if (docked(f)) refreshDock(glslChanged || uniChanged);
        }
        next.push(f);
      });
      for (const f of old.values()) destroyEffect(f);
      ent.list = next;
      if (!next.length) destroyEntry(m, ent);
    }
    placeEffects(m);
    renderFxList();
    wake();
  }
  function addEffect(m, sb, opts) {
    const o = opts || {};
    const preset = PRESET_BY_ID[o.preset] ? o.preset : PRESETS[0].id;
    const mode = FX_MODES.includes(o.mode) ? o.mode : FX_NEW.mode;
    const ent = fxEntry(m, sb);
    const f = buildEffect(m, sb, {
      id: typeof o.id === "string" && o.id && !effectById(o.id) ? o.id : undefined,
      preset,
      glsl: typeof o.glsl === "string" && o.glsl.trim() ? o.glsl : presetGlsl(preset),
      uniforms: o.uniforms || {},
      speed: o.speed,
      paused: o.paused,
      mode,
      blend: FX_BLENDS.includes(o.blend) ? o.blend : mode === "overlay" ? FX_NEW.blend : "normal",
      opacity: num(o.opacity, mode === "overlay" ? FX_NEW.opacity : 1),
    });
    const at = Number.isInteger(o.index) ? clamp(o.index, 0, ent.list.length) : ent.list.length;
    ent.list.splice(at, 0, f);
    state.counts.effects = (state.counts.effects || 0) + 1;
    placeEffects(m);
    save(m);
    renderFxList();
    wake();
    return f;
  }
  function removeEffect(f, withUndo) {
    const m = f.m;
    const ent = m.fx.get(f.sb);
    const i = ent ? ent.list.indexOf(f) : -1;
    if (i < 0) return null;
    const data = fxToJson(f.data);
    destroyEffect(f);
    ent.list.splice(i, 1);
    if (!ent.list.length) destroyEntry(m, ent);
    placeEffects(m);
    save(m);
    renderFxList();
    if (withUndo !== false)
      showToast("Shader effect removed", () => {
        if (state.mounts.get(m.root) === m) addEffect(m, f.sb, { ...data, index: i });
      });
    return data;
  }
  function setEffect(f, patch, commit) {
    const p = patch || {};
    const d = f.data;
    if (FX_MODES.includes(p.mode)) d.mode = p.mode;
    if (FX_BLENDS.includes(p.blend)) d.blend = p.blend;
    if (p.opacity != null && Number.isFinite(+p.opacity)) d.opacity = clamp(+p.opacity, 0, 1);
    applyEffectStyle(f);
    placeEffects(f.m);
    f.dirty = true;
    wake();
    scheduleSave(f.m, commit === false ? 350 : 0);
    renderFxList();
    if (docked(f)) refreshDock(false);
  }
  function moveEffect(f, delta) {
    const ent = f.m.fx.get(f.sb);
    if (!ent) return false;
    const i = ent.list.indexOf(f);
    const j = clamp(i + delta, 0, ent.list.length - 1);
    if (i < 0 || i === j) return false;
    ent.list.splice(i, 1);
    ent.list.splice(j, 0, f);
    placeEffects(f.m);
    save(f.m);
    renderFxList();
    if (docked(f)) refreshDock(false);
    return true;
  }

  // ----------------------------------------------- Effects section (panel)
  function selectionOf(m) {
    try {
      const hd = m.handle || findHandle(m.root);
      const sel = hd && typeof hd.getSelection === "function" ? hd.getSelection() : [];
      return Array.isArray(sel) ? sel.map((x) => (typeof x === "string" ? x : x && x.id)).filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }
  // The one storyboard selected on a canvas on screen (the app's selection).
  function selectedStoryboard() {
    const all = Array.from(state.mounts.values()).sort((a, b) => (b.root === state.lastRoot ? 1 : 0) - (a.root === state.lastRoot ? 1 : 0));
    for (const m of all) {
      if (!isShown(m.root)) continue;
      const sel = selectionOf(m);
      if (sel.length === 1 && sbElement(m, sel[0])) return { m, sb: sel[0] };
    }
    return null;
  }
  // The right panel of m's canvas view: the nearest one up the tree.
  function panelFor(m) {
    let best = null;
    let bestD = Infinity;
    for (const p of document.querySelectorAll(RIGHT_PANEL)) {
      if (!isShown(p)) continue;
      let a = p;
      let d = 0;
      while (a && !a.contains(m.root)) {
        a = a.parentElement;
        d++;
      }
      if (a && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }
  const fxEffects = () => {
    const ent = fxUi.m && fxUi.m.fx.get(fxUi.sb);
    return ent ? ent.list : [];
  };
  function syncFxSection() {
    const cur = state.enabled ? selectedStoryboard() : null;
    const d = state.dock;
    if (d && d.f.kind === "effect" && (!cur || cur.m !== d.f.m || cur.sb !== d.f.sb)) closeDock();
    const panel = cur ? panelFor(cur.m) : null;
    const tab = panel ? panel.querySelector(DESIGN_TAB) : null;
    const body = tab && isShown(tab) ? tab.querySelector(".overflow-auto") || tab : null;
    if (!cur || !body) return removeFxSection();
    if (!fxUi.section || fxUi.m !== cur.m || fxUi.sb !== cur.sb) {
      removeFxSection();
      buildFxSection(cur.m, cur.sb);
    }
    // Before the panel's growing filler (the canvas settings), else last;
    // an effect's settings in this panel (native host) right after it.
    const d2 = state.dock;
    const nb = d2 && d2.host === "native" && d2.el && kindOf(d2.f) === "effect" && d2.f.m === cur.m && d2.f.sb === cur.sb ? d2.el : null;
    const grow = Array.from(body.children).find((c) => c !== fxUi.section && c !== nb && c.classList.contains("flex-1"));
    const last = nb || fxUi.section;
    const placed = (nb ? fxUi.section.nextElementSibling === nb : true) && (grow ? last.nextElementSibling === grow : body.lastElementChild === last);
    if (!placed) {
      if (grow) {
        body.insertBefore(fxUi.section, grow);
        if (nb) body.insertBefore(nb, grow);
      } else {
        body.appendChild(fxUi.section);
        if (nb) body.appendChild(nb);
      }
    }
    renderFxList();
  }
  function removeFxSection() {
    closeFxMenu();
    if (fxUi.section) fxUi.section.remove();
    Object.assign(fxUi, { section: null, list: null, title: null, header: null, add: null, m: null, sb: null, sig: "" });
  }
  function buildFxSection(m, sb) {
    const add = h("button", { type: "button", class: FX_ICON_BTN, "aria-label": "Add effect", title: "Add effect", "aria-haspopup": "menu", "aria-expanded": "false", "data-rtsh-fx-add": "" }, icon("plus", null, 1.5));
    const title = h("span", { class: FX_TITLE, text: "Effects" });
    const header = h("div", { "data-section-header": "effects", class: FX_HEAD }, h("div", { "data-property-row": "", class: "flex flex-1 items-center justify-between" }, title, h("div", { class: "flex items-center" }, add)));
    const list = h("div", { class: FX_BODY, "data-rtsh-fx-list": "" });
    const section = h("div", { class: "rtsh-fx-section", "data-rtsh-fx-section": "", "data-testid": "canvas-shader-effects-section" }, header, list);
    add.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFxMenu();
    });
    header.addEventListener("click", (e) => {
      if (!fxEffects().length && !(e.target.closest && e.target.closest("button"))) toggleFxMenu();
    });
    Object.assign(fxUi, { section, list, title, header, add, m, sb, sig: "" });
    renderFxList();
  }
  function renderFxList() {
    if (!fxUi.section) return;
    const list = fxEffects();
    const open = state.dock && state.dock.f.kind === "effect" ? state.dock.f.data.id : "";
    const sig = list.map((f) => f.data.id + ":" + f.data.preset + ":" + fxModeLabel(f.data)).join("|") + "#" + open;
    if (sig === fxUi.sig) return;
    fxUi.sig = sig;
    const empty = !list.length;
    fxUi.header.className = FX_HEAD + (empty ? " border-b border-border-secondary select-none" : "");
    fxUi.title.className = FX_TITLE + (empty ? " text-text-tertiary" : " text-text-secondary");
    fxUi.add.className = FX_ICON_BTN + (empty ? " text-icons-tertiary" : "");
    fxUi.list.hidden = empty;
    fxUi.list.replaceChildren(...list.map((f) => fxRow(f, f.data.id === open)));
  }
  function fxRow(f, open) {
    const d = f.data;
    const btn = h(
      "button",
      { type: "button", class: FX_ROW_BTN, "data-rtsh-fx-open": d.id, "data-popup-open": open ? "" : null, "aria-label": "Edit shader effect " + fxName(f), "aria-expanded": open ? "true" : "false", title: "Shader effect · " + fxName(f) + " · " + (d.mode === "background" ? "background" : "overlay, " + d.blend) + " · " + Math.round(d.opacity * 100) + "%" },
      icon("sparkles", "rtsh-fx-row-ic", 1.5),
      h("span", { class: "min-w-0 flex-1 truncate text-[13px] leading-[16px] text-text-secondary", text: presetLabel(f) }),
      h("span", { class: "rtsh-fx-row-mode", text: fxModeLabel(d) })
    );
    const rm = h("button", { type: "button", class: FX_ICON_BTN + " rtsh-fx-row-rm", "aria-label": "Remove effect", title: "Remove effect", "data-rtsh-fx-remove": d.id }, icon("minus", null, 1.5));
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (docked(f)) closeDock();
      else openDock(f);
    });
    rm.addEventListener("click", (e) => {
      e.stopPropagation();
      removeEffect(f, true);
    });
    return h("div", { class: "group flex items-center w-full gap-[4px]", "data-property-row": "", "data-rtsh-fx-row": d.id, "data-mode": d.mode }, btn, rm);
  }
  // "+" > "Add effect" > "Shader".
  function toggleFxMenu() {
    if (fxUi.menu) return closeFxMenu();
    if (!fxUi.add) return;
    const item = h("button", { type: "button", class: "rtsh-fx-menu-item", role: "menuitem", "data-rtsh-fx-kind": "shader" }, icon("sparkles", "rtsh-ic", 1.5), h("span", { class: "rtsh-fx-menu-label", text: "Shader" }), h("span", { class: "rtsh-fx-menu-hint", text: "WebGL" }));
    const menu = h("div", { class: "rtsh-fx-menu", role: "menu", "aria-label": "Add effect", "data-rtsh-fx-menu": "" }, h("div", { class: "rtsh-fx-menu-title" }, h("span", { text: "Add effect" }), icon("chevron", "rtsh-ic", 1.5)), item);
    for (const t of ["pointerdown", "mousedown", "click", "wheel", "contextmenu"]) menu.addEventListener(t, (e) => e.stopPropagation());
    menu.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeFxMenu();
        if (fxUi.add) fxUi.add.focus({ preventScroll: true });
      }
    });
    item.addEventListener("click", () => {
      const m = fxUi.m;
      const sb = fxUi.sb;
      closeFxMenu();
      if (!m || !sb) return;
      openDock(addEffect(m, sb, {}));
    });
    document.body.appendChild(menu);
    const r = fxUi.add.getBoundingClientRect();
    const w = menu.offsetWidth || 200;
    menu.style.left = Math.round(Math.max(8, Math.min(r.right - w, window.innerWidth - 8 - w))) + "px";
    menu.style.top = Math.round(Math.min(r.bottom + 4, window.innerHeight - 8 - menu.offsetHeight)) + "px";
    fxUi.menu = menu;
    fxUi.add.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => menu.setAttribute("data-show", ""));
    item.focus({ preventScroll: true });
  }
  function closeFxMenu() {
    if (!fxUi.menu) return;
    fxUi.menu.remove();
    fxUi.menu = null;
    if (fxUi.add) fxUi.add.setAttribute("aria-expanded", "false");
  }
  // The effect panel: a popover left of the Effects section (or next to the
  // storyboard while the section is not on screen).
  function placeFxDock(d) {
    const f = d.f;
    const anchor = fxUi.section && fxUi.section.isConnected && fxUi.m === f.m && fxUi.sb === f.sb && isShown(fxUi.section) ? fxUi.section : null;
    const ent = f.m.fx.get(f.sb);
    const box = ent && ent.host && ent.host.isConnected ? ent.host : null;
    if ((!anchor && !box) || !isShown(f.m.root) || document.querySelector('[role="dialog"][aria-modal="true"]:not(.rtsh-panel)')) {
      d.el.style.visibility = "hidden";
      return;
    }
    d.el.style.visibility = "";
    const pad = 8;
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    fitDock(d, vw - 2 * pad);
    const ar = (anchor || box).getBoundingClientRect();
    const w = d.el.offsetWidth;
    let x = anchor ? ar.left - gap - w : ar.right + gap;
    x = Math.max(pad, Math.min(x, vw - pad - w));
    const maxH = Math.max(160, vh - 2 * pad);
    if (d.maxH !== maxH) {
      d.maxH = maxH;
      d.el.style.setProperty("--rtsh-max-h", maxH + "px");
    }
    const hh = d.el.offsetHeight;
    const y = Math.max(pad, Math.min(ar.top, vh - pad - hh));
    const pos = Math.round(x) + "," + Math.round(y);
    if (pos !== d.pos) {
      d.pos = pos;
      d.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
    const side = anchor ? "left" : "right";
    if (side !== d.side) {
      d.side = side;
      d.el.setAttribute("data-side", side);
    }
  }
  // A floating dock too wide for its room (panel + editor): the editor takes
  // the panel's place, as wide as the room allows.
  function fitDock(d, room) {
    const narrow = !!d.editor && room < 280 + 8 + 520;
    if (narrow !== !!d.narrow) {
      d.narrow = narrow;
      d.el.toggleAttribute("data-narrow", narrow);
    }
    const ew = narrow ? Math.round(Math.max(240, Math.min(520, room))) + "px" : "";
    if (ew !== (d.ew || "")) {
      d.ew = ew;
      d.el.style.setProperty("--rtsh-ed-w", ew || "520px");
    }
  }
  function sweepToolbars() {
    for (const el of document.querySelectorAll("[data-rtsh-tool], [data-rtsh-sep]")) el.remove();
  }

  // ------------------------------------------------------------------ dock
  // state.dock is the frame or effect being edited. Its controls are built
  // once per target as parts: core (an effect's mode, blend and opacity;
  // preset, speed, Edit GLSL; an effect's order and remove in its header),
  // params (status, the uniform controls, the automatic uniforms; play /
  // pause and reset in its header) and, for frames, export (PNG, WebM,
  // embed). Host "side": the parts are sections of canvas-chrome's right
  // panel (see "side panel" below) and the GLSL editor is a sheet docked to
  // the left of that panel. Host "float" (no chrome, or a canvas view it does
  // not lay out): the parts stack in a panel floating next to the selected
  // frame (an effect's: left of the Effects section), the editor beside it.
  // opts.rehost: the same target moved hosts (no panel opening).
  function openDock(f, opts) {
    const prev = state.dock;
    const swap = !!(prev && prev.host === "native" && kindOf(prev.f) === kindOf(f));
    closeDock({ replacing: true });
    const host = hostFor(f);
    const els = buildDockEls(f);
    const d = { f, host, els, parts: buildParts(f, els), el: null, editor: null, sheet: null, raf: 0, sheetRaf: 0, pos: "", side: "", sig: "" };
    state.dock = d;
    wireDock(d);
    refreshDock(true);
    if (host === "side") showSide(d, !!(opts && opts.rehost));
    else {
      if (sideUi.view) hideSide(sideUi.view, true);
      if (host === "native") showNative(d, swap);
      else openFloat(d);
    }
    renderFxList();
  }
  // opts.replacing: another dock opens right after (the side sections stay
  // and take its parts); opts.instant: no fade out.
  function closeDock(opts) {
    const d = state.dock;
    if (!d) return;
    const o = opts || {};
    state.dock = null;
    cancelAnimationFrame(d.raf);
    if (d.editor) closeEditor(d);
    if (d.el) {
      const el = d.el;
      d.el = null;
      // the native panel's sections leave like the chrome's (140 ms)
      if (d.host === "native" && !o.replacing && !o.instant && isShown(el)) {
        el.setAttribute("data-rtsh-out", "");
        setTimeout(() => el.remove(), state.reduced ? 130 : 150);
      } else el.remove();
    }
    if (d.host === "side" && !o.replacing) hideSide(d, !!o.instant);
    renderFxList();
  }
  // The dock's view moved between hosts (the chrome came or went, the canvas
  // view crossed the chrome's width threshold): the same target, rebuilt.
  function rehost(d) {
    const f = d.f;
    const ed = !!d.editor;
    closeDock({ instant: true });
    const live = f.kind === "effect" ? effectById(f.data.id) === f : state.selected === f && f.el.isConnected;
    if (!live) return;
    openDock(f, { rehost: true });
    if (ed) openEditor(f);
  }
  function syncHost() {
    const d = state.dock;
    if (!d) return;
    if (d.host !== hostFor(d.f)) rehost(d);
    else if (d.host === "native") placeNative(d);
  }
  // side: canvas-chrome lays out the target's view; native: it does not (or
  // is absent) and the view's own right panel shows its design tab; float:
  // neither (the panel is closed, or no panel).
  function hostFor(f) {
    if (sideHostFor(f)) return "side";
    return nativeBodyFor(f) ? "native" : "float";
  }
  function buildDockEls(f) {
    const fx = f.kind === "effect";
    const E = {};
    const ib = (act, name, label) => h("button", { class: "rtsh-icon-btn", type: "button", "data-rtsh-act": act, "aria-label": label, title: label }, icon(name, "rtsh-ic"));
    const sb = (act, name, label, aria, tip) => h("button", { class: "rtsh-sbtn", type: "button", "data-rtsh-act": act, "aria-label": aria, title: tip || null }, icon(name, "rtsh-ic"), h("span", { text: label }));
    E.name = h("span", { class: "rtsh-panel-name" });
    E.play = ib("play", "pause", "Pause");
    E.reset = ib("reset", "reset", "Reset to the preset");
    if (fx) {
      E.modeBg = h("button", { class: "rtsh-seg", type: "button", "data-rtsh-mode": "background", "aria-label": "Background", text: "Background" });
      E.modeFg = h("button", { class: "rtsh-seg", type: "button", "data-rtsh-mode": "overlay", "aria-label": "Overlay", text: "Overlay" });
      E.mode = h("div", { class: "rtsh-f rtsh-f-segs", "data-kind": "mode" }, fieldLabel("Mode"), h("div", { class: "rtsh-segs", role: "group", "aria-label": "Effect mode" }, E.modeBg, E.modeFg));
      E.blend = selectField("Blend", h("select", { "aria-label": "Blend mode", "data-rtsh-ctl": "blend" }), FX_BLENDS.map((b) => [b, b[0].toUpperCase() + b.slice(1).replace(/-/g, " ")]));
      E.opacity = rangeField({
        label: "Opacity",
        min: 0,
        max: 1,
        step: 0.01,
        rangeAttrs: { "data-rtsh-ctl": "opacity" },
        get: () => f.data.opacity,
        format: (v) => Math.round(v * 100) + "%",
        parse: (t) => {
          const n = parseFloat(t);
          return Number.isFinite(n) ? clamp(/%/.test(t) || n > 1 ? n / 100 : n, 0, 1) : null;
        },
        input: (v) => setEffect(f, { opacity: v }, false),
        commit: (v) => setEffect(f, { opacity: v }),
      });
      E.up = ib("up", "up", "Move up (drawn first)");
      E.down = ib("down", "down", "Move down (drawn later)");
      E.remove = ib("remove-effect", "trash", "Remove effect");
    }
    E.preset = selectField("Preset", h("select", { "aria-label": "Preset", "data-rtsh-ctl": "preset" }), PRESETS.map((p) => [p.id, p.label]));
    E.speed = rangeField({
      label: "Speed",
      min: 0,
      max: 3,
      step: 0.05,
      rangeAttrs: { "data-rtsh-ctl": "speed" },
      get: () => f.data.speed,
      format: (v) => v.toFixed(2) + "×",
      parse: (t) => {
        const n = parseFloat(t);
        return Number.isFinite(n) ? clamp(n, 0, 4) : null;
      },
      input: (v) => setSpeed(f, v, false),
      commit: (v) => setSpeed(f, v, true),
    });
    E.edit = sb("edit", "code", "Edit GLSL", "Edit GLSL");
    E.edit.setAttribute("aria-pressed", "false");
    E.status = h("div", { class: "rtsh-note", role: "status", hidden: true });
    E.params = h("div", { class: "rtsh-params" });
    E.auto = h("div", { class: "rtsh-auto", hidden: true });
    E.png = sb("png", "image", "PNG", "Export PNG", "Current frame, 2x");
    E.webmLabel = h("span", { text: "WebM" });
    E.webm = h("button", { class: "rtsh-sbtn", type: "button", "data-rtsh-act": "webm", "aria-label": "Export WebM", title: "Record a 5 second WebM video" }, icon("video", "rtsh-ic"), E.webmLabel);
    E.embed = sb("embed", "copy", "Embed", "Copy embed", "Copy embed: standalone HTML + JS, no SDK");
    return E;
  }
  function buildParts(f, E) {
    const fx = f.kind === "effect";
    const rows = (...kids) => h("div", { class: "rtsh-rows" }, ...kids);
    const parts = {
      core: { label: fx ? "Shader effect" : "Shader", rows: rows(...(fx ? [E.mode, E.blend.el, E.opacity.el] : []), E.preset.el, E.speed.el, E.edit), actions: fx ? [E.up, E.down, E.remove] : [] },
      params: { label: "Parameters", rows: rows(E.status, E.params, E.auto), actions: [E.play, E.reset] },
    };
    if (!fx) parts.export = { label: "Export", rows: h("div", { class: "rtsh-grid3" }, E.png, E.webm, E.embed), actions: [] };
    return parts;
  }
  // Input inside the dock's nodes stays there (React would hand it to the
  // app's ancestors); Escape closes the editor, leaves a field, then closes
  // an effect's settings or deselects the frame.
  function stopInput(el) {
    for (const type of ["pointerdown", "mousedown", "click", "dblclick", "contextmenu", "wheel", "keyup", "keypress", "paste", "copy", "cut"]) el.addEventListener(type, (e) => e.stopPropagation());
    el.addEventListener("keydown", onDockKey);
  }
  function onDockKey(e) {
    const d = state.dock;
    if (isEditable(e.target)) e.stopPropagation();
    if (e.key !== "Escape" || e.defaultPrevented || !d) return;
    e.preventDefault();
    e.stopPropagation();
    const inSheet = !!(d.sheet && d.sheet.contains(e.target));
    if (d.editor) {
      closeEditor(d);
      if (inSheet && isShown(d.els.edit)) d.els.edit.focus({ preventScroll: true });
    } else if (isEditable(e.target)) e.target.blur();
    else if (d.f.kind === "effect") closeDock();
    else deselect();
  }
  function setSpeed(f, v, commit) {
    f.data.speed = clamp(Number.isFinite(v) ? v : 1, 0, 4);
    wake();
    scheduleSave(f.m, commit ? 0 : 350);
    if (docked(f)) {
      state.dock.els.speed.sync();
      updateDockStatus();
    }
  }
  function wireDock(d) {
    const E = d.els;
    const f = d.f;
    E.preset.sel.addEventListener("change", () => setPreset(f, E.preset.sel.value));
    if (E.modeBg) {
      E.modeBg.addEventListener("click", () => setEffect(f, { mode: "background" }));
      E.modeFg.addEventListener("click", () => setEffect(f, { mode: "overlay" }));
      E.blend.sel.addEventListener("change", () => setEffect(f, { blend: E.blend.sel.value }));
      E.up.addEventListener("click", () => moveEffect(f, -1));
      E.down.addEventListener("click", () => moveEffect(f, 1));
      E.remove.addEventListener("click", () => removeEffect(f, true));
    }
    E.play.addEventListener("click", () => {
      f.data.paused = !f.data.paused;
      save(f.m);
      wake();
      updateDockStatus();
    });
    E.edit.addEventListener("click", () => (d.editor ? closeEditor(d) : openEditor(f)));
    E.reset.addEventListener("click", () => resetShader(f));
    E.png.addEventListener("click", () => {
      exportPng(f).then(
        () => showToast("PNG exported"),
        (err) => showToast("PNG export failed: " + (err && err.message))
      );
    });
    E.webm.addEventListener("click", () => {
      if (f.recording) return;
      exportWebm(f).then(
        (r) => showToast(r.size ? "WebM exported" : "WebM export produced no data"),
        (err) => showToast("WebM export failed: " + (err && err.message))
      );
    });
    E.embed.addEventListener("click", async () => {
      const code = buildEmbed(f);
      if (!code) return showToast("Fix the shader before copying the embed");
      const ok = await copyText(code);
      showToast(ok ? "Embed code copied" : "Could not copy the embed code");
    });
  }
  // The floating panel: the name on top, then the parts (the core part's
  // title is the panel's own head, its actions sit there).
  function openFloat(d) {
    const E = d.els;
    const fx = d.f.kind === "effect";
    const head = h("div", { class: "rtsh-panel-head" }, icon("sparkles", "rtsh-ic rtsh-ic-accent", 1.5), E.name, ...d.parts.core.actions);
    const part = (k, p) =>
      h(
        "div",
        { class: "rtsh-part", "data-part": k },
        k === "core" ? null : h("div", { class: "rtsh-part-head" }, h("span", { class: "rtsh-part-title", text: p.label }), h("div", { class: "rtsh-part-actions" }, ...p.actions)),
        h("div", { class: "rtsh-part-body" }, p.rows)
      );
    const body = h("div", { class: "rtsh-panel-body" }, ...Object.entries(d.parts).map(([k, p]) => part(k, p)));
    E.panel = h("div", { class: "rtsh-panel", role: "dialog", "aria-label": fx ? "Shader effect settings" : "Shader settings", "data-testid": "canvas-shader-panel", "data-kind": fx ? "effect" : "frame" }, head, body);
    d.el = h("div", { class: "rtsh-dock", "data-rtsh-dock": "" }, E.panel);
    stopInput(d.el);
    document.body.appendChild(d.el);
    placeDock();
    const loop = () => {
      if (state.dock !== d) return;
      placeDock();
      d.raf = requestAnimationFrame(loop);
    };
    d.raf = requestAnimationFrame(loop);
    requestAnimationFrame(() => d.el && d.el.setAttribute("data-show", ""));
  }
  // Rebuilds the controls' values for the current target (full: also the
  // parameters).
  function refreshDock(full) {
    const d = state.dock;
    if (!d) return;
    const f = d.f;
    const E = d.els;
    E.name.textContent = f.kind === "effect" ? fxName(f) : shownName(f);
    if (E.modeBg) {
      const x = f.data;
      E.modeBg.setAttribute("aria-pressed", String(x.mode === "background"));
      E.modeFg.setAttribute("aria-pressed", String(x.mode === "overlay"));
      E.blend.set(x.blend);
      E.blend.disable(x.mode !== "overlay", "Blend applies to overlays");
      E.opacity.sync();
      const ent = f.m.fx.get(f.sb);
      const i = ent ? ent.list.indexOf(f) : -1;
      E.up.disabled = i <= 0;
      E.down.disabled = !ent || i < 0 || i >= ent.list.length - 1;
    }
    E.preset.set(f.data.preset);
    E.speed.sync();
    const sig = f.entry ? f.entry.meta.uniforms.map((u) => u.name + ":" + u.type + ":" + (u.label || "") + ":" + u.min + ":" + u.max).join("|") : "";
    if (full || sig !== d.sig) {
      d.sig = sig;
      buildParams(d);
    }
    updateDockStatus();
    updateDockExport();
    if (d.editor) {
      // Preset change, reset or undo replaced the source under the editor.
      if (!d.editor.timer && d.editor.ta.value !== f.data.glsl) d.editor.ta.value = f.data.glsl;
      d.editor.target.textContent = E.name.textContent;
      updateEditorLog();
    }
  }
  function updateDockStatus() {
    const d = state.dock;
    if (!d) return;
    const f = d.f;
    const E = d.els;
    const animated = !!(f.entry && f.entry.meta.hasTime);
    const label = f.data.paused ? "Play" : "Pause";
    if (E.play.getAttribute("aria-label") !== label || !E.play.firstChild) {
      E.play.replaceChildren(icon(f.data.paused ? "play" : "pause", "rtsh-ic"));
      E.play.setAttribute("aria-label", label);
      E.play.title = label;
    }
    E.play.setAttribute("aria-pressed", String(!!f.data.paused));
    E.play.disabled = !animated;
    let text = "";
    let kind = "";
    if (f.result && !f.result.ok) {
      const er = f.result.errors[0];
      text = (f.entry ? "Compile error, showing the last good version. " : "Compile error. ") + (er ? (er.line ? `Line ${er.line}: ` : "") + er.msg : "");
      kind = "error";
    } else if (animated && state.reduced) {
      text = "Paused: reduce motion is on (static frame)";
      kind = "info";
    } else if (f.status === "offscreen") {
      text = "Paused while off screen";
      kind = "info";
    }
    E.status.hidden = !text;
    if (E.status.textContent !== text) E.status.textContent = text;
    E.status.setAttribute("data-kind", kind);
  }
  function updateDockExport() {
    const d = state.dock;
    if (!d) return;
    const r = d.f.recording;
    d.els.webm.disabled = !!r;
    d.els.webmLabel.textContent = r ? `${Math.max(1, Math.ceil((1 - r.progress) * (r.ms / 1000)))}s…` : "WebM";
    const bad = !d.f.entry;
    d.els.png.disabled = bad;
    d.els.embed.disabled = bad;
    if (!r) d.els.webm.disabled = bad;
  }
  function buildParams(d) {
    const f = d.f;
    const E = d.els;
    E.params.replaceChildren();
    const meta = f.entry ? f.entry.meta : f.result ? f.result.meta : null;
    const autos = [];
    if (meta)
      for (const u of meta.uniforms) {
        if (u.type === "resolution" || u.type === "time" || u.type === "mouse") {
          autos.push(u);
          continue;
        }
        const c = controlFor(f, u);
        if (c) E.params.append(c);
      }
    if (!E.params.childElementCount) E.params.append(h("div", { class: "rtsh-empty", text: "No adjustable uniforms" }));
    E.auto.replaceChildren(...(autos.length ? [h("span", { class: "rtsh-auto-label", text: "Auto" }), ...autos.map((u) => h("span", { class: "rtsh-chip", text: u.name, title: `${u.name}: ${u.type}, set by the renderer` }))] : []));
    E.auto.hidden = !autos.length;
  }

  // ----------------------------------------------------------------- fields
  // pen.dev's property fields: a 28 px filled box, the label inside on the
  // left, the value on the right. A slider field is filled up to its value
  // and the whole box is the slider (a transparent native range on top:
  // click, drag, arrow keys, screen readers); the value is typed in its own
  // input (Enter commits, arrows step, Shift x10).
  const fieldLabel = (label) => h("span", { class: "rtsh-f-label", text: label });
  function textInput(cls, aria, attrs) {
    const el = h("input", { class: cls, type: "text", spellcheck: "false", autocomplete: "off", "aria-label": aria, ...attrs });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") el.blur();
    });
    return el;
  }
  // o: {label, title?, min, max, step, int?, get(), format(v), parse(text) ->
  // number | null, input(v), commit(v), rangeAttrs?, valAttrs?}
  function rangeField(o) {
    const lo = Math.min(o.min, o.max);
    const hi = Math.max(o.min, o.max);
    const read = (v) => (o.int ? Math.trunc(v) : v);
    const range = h("input", { class: "rtsh-f-range", type: "range", min: String(lo), max: String(hi), step: String(o.step), "aria-label": o.label, ...o.rangeAttrs });
    const val = textInput("rtsh-f-val", o.label + " value", { inputmode: "decimal", ...o.valAttrs });
    const el = h("div", { class: "rtsh-f rtsh-f-slider", "data-kind": "range", title: o.title || null }, range, fieldLabel(o.label), val);
    const paint = (v) => el.style.setProperty("--p", (hi > lo ? clamp((v - lo) / (hi - lo), 0, 1) : 0).toFixed(4));
    const show = (v) => {
      range.value = String(v);
      if (document.activeElement !== val) val.value = o.format(v);
      paint(v);
    };
    const sync = () => show(o.get());
    range.addEventListener("input", () => {
      const v = read(+range.value);
      val.value = o.format(v);
      paint(v);
      o.input(v);
    });
    range.addEventListener("change", () => o.commit(read(+range.value)));
    val.addEventListener("change", () => {
      const v = o.parse(val.value);
      if (v != null) o.commit(read(v));
      val.value = o.format(o.get());
      show(o.get());
    });
    val.addEventListener("blur", () => (val.value = o.format(o.get())));
    val.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const k = (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1) * (o.int ? Math.max(1, o.step) : o.step);
      const v = read(clamp(o.get() + k, lo, hi));
      o.commit(v);
      val.value = o.format(v);
      show(v);
    });
    sync();
    return { el, range, val, sync };
  }
  // A select drawn as a field: the native select covers the box (its own
  // menu, keyboard and a11y), the chosen option's label shows on the right.
  function selectField(label, sel, options) {
    for (const [v, t] of options) sel.append(h("option", { value: v, text: t }));
    sel.className = "rtsh-f-select";
    const shown = h("span", { class: "rtsh-f-shown" });
    const el = h("div", { class: "rtsh-f rtsh-f-sel", "data-kind": "select" }, fieldLabel(label), shown, icon("chevronDown", "rtsh-f-chev"), sel);
    const paint = () => {
      const o = sel.options[sel.selectedIndex];
      const t = o ? o.textContent : "";
      if (shown.textContent !== t) shown.textContent = t;
    };
    sel.addEventListener("change", paint);
    const set = (v) => {
      if (sel.value !== v) sel.value = v;
      paint();
    };
    const disable = (off, why) => {
      sel.disabled = !!off;
      el.toggleAttribute("data-disabled", !!off);
      el.title = off && why ? why : "";
    };
    paint();
    return { el, sel, set, paint, disable };
  }
  function controlFor(f, u) {
    const label = u.label || u.name;
    const title = u.label ? `${u.label} (${u.name})` : u.name;
    const val = valueOf(f, u);
    const mark = (el) => {
      el.setAttribute("data-uniform", u.name);
      el.title = title;
      return el;
    };
    switch (u.type) {
      case "float":
      case "int": {
        const int = u.type === "int";
        const lim = (v) => (u.min != null && u.max != null ? clamp(v, Math.min(u.min, u.max), Math.max(u.min, u.max)) : v);
        const parse = (t) => {
          const n = parseFloat(t);
          return Number.isFinite(n) ? lim(n) : null;
        };
        if (u.min != null && u.max != null) {
          const r = rangeField({
            label,
            title,
            min: u.min,
            max: u.max,
            step: int ? 1 : (u.max - u.min) / 100,
            int,
            rangeAttrs: { "data-rtsh-range": u.name },
            valAttrs: { "data-rtsh-num": u.name },
            get: () => valueOf(f, u),
            format: (v) => fmt(v, int),
            parse,
            input: (v) => setUniform(f, u.name, v, false),
            commit: (v) => setUniform(f, u.name, v, true),
          });
          return mark(r.el);
        }
        const box = textInput("rtsh-f-val rtsh-f-val-wide", label + " value", { inputmode: "decimal", "data-rtsh-num": u.name });
        box.value = fmt(val, int);
        box.addEventListener("change", () => {
          let v = parse(box.value);
          if (v == null) v = valueOf(f, u);
          if (int) v = Math.trunc(v);
          box.value = fmt(v, int);
          setUniform(f, u.name, v, true);
        });
        return mark(h("div", { class: "rtsh-f", "data-kind": "number" }, fieldLabel(label), box));
      }
      case "bool": {
        const sw = h("button", { class: "rtsh-f rtsh-f-bool", type: "button", role: "switch", "aria-checked": String(!!val), "aria-label": label, "data-rtsh-bool": u.name }, fieldLabel(label), h("span", { class: "rtsh-sw", "aria-hidden": "true" }, h("span", { class: "rtsh-sw-knob" })));
        sw.addEventListener("click", () => {
          const v = sw.getAttribute("aria-checked") !== "true";
          sw.setAttribute("aria-checked", String(v));
          setUniform(f, u.name, v, true);
        });
        return mark(sw);
      }
      case "color": {
        const pick = h("input", { class: "rtsh-f-pick", type: "color", "aria-label": label + " color", "data-rtsh-color": u.name });
        const chip = h("span", { class: "rtsh-f-swatch" }, pick);
        const hex = textInput("rtsh-f-val rtsh-f-hex", label + " hex", { maxlength: u.alpha ? "9" : "7", "data-rtsh-hex": u.name });
        const pct = u.alpha ? textInput("rtsh-f-val rtsh-f-pct", label + " opacity", { inputmode: "decimal" }) : null;
        const current = () => parseHex(f.data.uniforms[u.name]) || parseHex(valueOf(f, u)) || [1, 1, 1, 1];
        const show = (c) => {
          chip.style.setProperty("--c", toHex(c, true));
          pick.value = toHex(c, false);
          if (document.activeElement !== hex) hex.value = toHex(c, false).slice(1).toUpperCase();
          if (pct && document.activeElement !== pct) pct.value = Math.round(c[3] * 100) + "%";
        };
        const push = (c, commit) => {
          show(c);
          setUniform(f, u.name, toHex(c, u.alpha), commit);
        };
        pick.addEventListener("input", () => {
          const c = parseHex(pick.value);
          if (c) push([c[0], c[1], c[2], current()[3]], false);
        });
        pick.addEventListener("change", () => {
          const c = parseHex(pick.value);
          if (c) push([c[0], c[1], c[2], current()[3]], true);
        });
        hex.addEventListener("change", () => {
          const c = parseHex(hex.value.trim());
          if (c) push(u.alpha && hex.value.replace(/^#/, "").trim().length > 6 ? c : [c[0], c[1], c[2], current()[3]], true);
          hex.value = toHex(current(), false).slice(1).toUpperCase();
        });
        hex.addEventListener("blur", () => (hex.value = toHex(current(), false).slice(1).toUpperCase()));
        if (pct) {
          pct.addEventListener("change", () => {
            const n = parseFloat(pct.value);
            const c = current();
            if (Number.isFinite(n)) push([c[0], c[1], c[2], clamp(/%/.test(pct.value) || n > 1 ? n / 100 : n, 0, 1)], true);
            pct.value = Math.round(current()[3] * 100) + "%";
          });
        }
        show(parseHex(val) || [1, 1, 1, 1]);
        return mark(h("div", { class: "rtsh-f rtsh-f-color", "data-kind": "color" }, chip, fieldLabel(label), hex, pct));
      }
      case "vec": {
        const boxes = [];
        for (let i = 0; i < u.dim; i++) {
          const b = textInput("rtsh-f-val rtsh-f-vecv", `${label} ${"xyzw"[i]}`, { inputmode: "decimal" });
          b.value = fmt(val[i], u.integer);
          b.addEventListener("change", () => {
            const cur = valueOf(f, u).slice();
            const v = parseFloat(b.value);
            if (Number.isFinite(v)) cur[i] = u.integer ? Math.trunc(v) : v;
            b.value = fmt(cur[i], u.integer);
            setUniform(f, u.name, cur, true);
          });
          boxes.push(b);
        }
        return mark(h("div", { class: "rtsh-f", "data-kind": "vec" }, fieldLabel(label), h("div", { class: "rtsh-f-vec" }, ...boxes)));
      }
      case "sampler2D": {
        const opts = Object.entries(PATTERNS).map(([k, p]) => ["pattern:" + k, p.label]);
        if (String(val).startsWith("image:")) opts.push([val, "Uploaded image"]);
        opts.push(["__upload", "Upload image…"]);
        const s = selectField(label, h("select", { "aria-label": label, "data-rtsh-tex": u.name }), opts);
        s.set(val);
        const file = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", hidden: true });
        s.sel.addEventListener("change", () => {
          if (s.sel.value === "__upload") {
            s.set(valueOf(f, u));
            file.click();
            return;
          }
          setUniform(f, u.name, s.sel.value, true);
        });
        file.addEventListener("change", () => {
          const fl = file.files && file.files[0];
          if (!fl) return;
          imageToDataUrl(fl).then(
            (url) => {
              setUniform(f, u.name, "image:" + url, true);
              if (state.dock && state.dock.f === f) buildParams(state.dock);
            },
            () => showToast("Could not read that image")
          );
        });
        s.el.append(file);
        return mark(s.el);
      }
      default:
        return null;
    }
  }
  function imageToDataUrl(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, TEX_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL("image/jpeg", 0.86));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        rej(new Error("bad image"));
      };
      img.src = url;
    });
  }
  function placeDock() {
    const d = state.dock;
    if (!d || d.host !== "float" || !d.el) return;
    const f = d.f;
    if (f.kind === "effect") return placeFxDock(d);
    const m = f.m;
    if (!f.el.isConnected || !mountShown(m) || document.querySelector('[role="dialog"][aria-modal="true"]:not(.rtsh-panel)')) {
      d.el.style.visibility = "hidden";
      return;
    }
    d.el.style.visibility = "";
    const rr = m.root.getBoundingClientRect();
    const fr = screenRect(rr, viewOf(m), f.data);
    const pad = 8;
    const gap = 12;
    fitDock(d, rr.width - 2 * pad);
    const w = d.el.offsetWidth;
    let x;
    let side;
    if (fr.r + gap + w <= rr.right - pad) {
      x = fr.r + gap;
      side = "right";
    } else if (fr.l - gap - w >= rr.left + pad) {
      x = fr.l - gap - w;
      side = "left";
    } else {
      x = rr.right - pad - w;
      side = "inside";
    }
    x = Math.max(rr.left + pad, Math.min(x, rr.right - pad - w));
    // Keep the canvas toolbar visible: stop above it when they would overlap.
    let bottom = rr.bottom - pad;
    if (!d.toolbar || !d.toolbar.isConnected) d.toolbar = Array.from(document.querySelectorAll(TOOLBAR)).find((tb) => rootForToolbar(tb) === m.root) || null;
    if (d.toolbar) {
      const tr = d.toolbar.getBoundingClientRect();
      if (tr.width && tr.left < x + w && tr.right > x && tr.top > rr.top + 200) bottom = Math.min(bottom, tr.top - pad);
    }
    const maxH = Math.max(160, bottom - rr.top - pad);
    if (d.maxH !== maxH) {
      d.maxH = maxH;
      d.el.style.setProperty("--rtsh-max-h", maxH + "px");
    }
    const hh = d.el.offsetHeight;
    const y = Math.max(rr.top + pad, Math.min(fr.t, bottom - hh));
    const pos = Math.round(x) + "," + Math.round(y);
    if (pos !== d.pos) {
      d.pos = pos;
      d.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
    if (side !== d.side) {
      d.side = side;
      d.el.setAttribute("data-side", side);
    }
  }

  // ---------------------------------------------------------- native panel
  // A view canvas-chrome does not lay out (narrower than 720 px, or no
  // chrome) whose own right panel is open: the parts go into that panel's
  // design tab with the app's section anatomy, never floating: a frame's
  // first (after canvas-props' own panel when it is there, CSS order -1 like
  // it), an effect's right under the Effects section.
  function nativeBodyFor(f) {
    const sh = shellOf(f);
    if (!sh || sh.hasAttribute("data-rcc-shell")) return null;
    const panel = panelFor(f.m);
    const tab = panel && sh.contains(panel) ? panel.querySelector(DESIGN_TAB) : null;
    if (!tab || !isShown(tab)) return null;
    if (kindOf(f) === "effect" && !(fxUi.section && tab.contains(fxUi.section))) return null;
    return tab.querySelector(".overflow-auto") || tab;
  }
  // canvas-props' own panel (its inject mode, no chrome) already shows
  // Preset, Speed and Edit GLSL for the frame.
  function nativeCovered(f) {
    if (!propsCovers(f)) return false;
    try {
      return window.__RE_TEMPO_CANVAS_PROPS__.state().mode !== "chrome";
    } catch (_) {
      return false;
    }
  }
  function showNative(d, swap) {
    const fx = kindOf(d.f) === "effect";
    const box = h("div", { class: "rtsh-native", "data-rtsh-native": "", "data-kind": fx ? "effect" : "frame", "data-testid": "canvas-shader-native" });
    let i = 0;
    for (const [k, p] of Object.entries(d.parts)) {
      const sec = h(
        "div",
        { class: "rtsh-part rtsh-side", "data-part": k, "data-rtsh-side": k, "data-section": "canvas-shader-" + k },
        h("div", { class: "rtsh-part-head", "data-section-header": "canvas-shader-" + k }, h("span", { class: "rtsh-part-title", text: p.label }), h("div", { class: "rtsh-part-actions" }, ...p.actions)),
        h("div", { class: "rtsh-part-body rtsh-side-body" }, p.rows)
      );
      if (k === "core") {
        d.nativeCore = sec;
        sec.hidden = nativeCovered(d.f);
      }
      if (swap) sec.lastChild.setAttribute("data-rtsh-swap", "");
      else {
        sec.style.setProperty("--rtsh-i", String(sec.hidden ? 0 : i++));
        sec.setAttribute("data-rtsh-in", "");
        sec.addEventListener("animationend", () => sec.removeAttribute("data-rtsh-in"), { once: true });
      }
      box.append(sec);
    }
    stopInput(box);
    d.el = box;
    placeNative(d);
  }
  // Keeps the box where it belongs (the app re-renders its panel) and the
  // core section out while canvas-props shows its own (it may switch modes
  // after this box was built).
  function placeNative(d) {
    const box = d.el;
    const body = box && nativeBodyFor(d.f);
    if (!body) return;
    const cov = nativeCovered(d.f);
    if (d.nativeCore && d.nativeCore.hidden !== cov) d.nativeCore.hidden = cov;
    if (kindOf(d.f) === "effect") {
      if (box.previousElementSibling !== fxUi.section) fxUi.section.after(box);
      return;
    }
    const cp = body.querySelector(":scope > .rtcp-wrap");
    if (cp ? box.previousElementSibling !== cp : body.firstElementChild !== box) {
      if (cp) cp.after(box);
      else body.prepend(box);
    }
  }

  // ------------------------------------------------------------ side panel
  // canvas-chrome's right panel (window.__RE_TEMPO_CANVAS_CHROME__.
  // registerRightSection): one section per part, shown for the dock's target
  // while its canvas view is one the chrome lays out ([data-rcc-shell]).
  // Frames: right after canvas-props' parts (26..31); the core part only
  // when canvas-props does not draw its own "Shader" section (Preset, Speed,
  // Edit GLSL) for the frame. Effects: right under the Effects section (111).
  const SIDE_DEFS = [
    { id: "canvas-shader", part: "core", kind: "frame", label: "Shader", order: 31 },
    { id: "canvas-shader-params", part: "params", kind: "frame", label: "Parameters", order: 32 },
    { id: "canvas-shader-export", part: "export", kind: "frame", label: "Export", order: 33 },
    { id: "canvas-shader-effect", part: "core", kind: "effect", label: "Shader effect", order: 112 },
    { id: "canvas-shader-effect-params", part: "params", kind: "effect", label: "Parameters", order: 113 },
  ];
  // view: the dock whose parts the sections show (kept while they fade out)
  const sideUi = { api: null, tried: null, hosts: new Map(), view: null, out: 0, opened: false };
  const chromeApi = () => {
    const c = window.__RE_TEMPO_CANVAS_CHROME__;
    return c && c.enabled !== false && typeof c.registerRightSection === "function" ? c : null;
  };
  const shellOf = (f) => (f.m.root.isConnected ? f.m.root.closest(SHELL) : null);
  const kindOf = (f) => (f.kind === "effect" ? "effect" : "frame");
  function sideHostFor(f) {
    if (!useSide()) return false;
    const sh = shellOf(f);
    return !!(sh && sh.hasAttribute("data-rcc-shell"));
  }
  // canvas-props shows Preset, Speed and Edit GLSL for a frame saved in the
  // canvas file (it needs canvas-nodes): the core part then stays out.
  function propsCovers(f) {
    const P = window.__RE_TEMPO_CANVAS_PROPS__;
    return kindOf(f) === "frame" && !!f.m.nodes && !!P && P.enabled !== false;
  }
  function useSide() {
    const c = state.enabled ? chromeApi() : null;
    if (!c) {
      if (sideUi.api) dropSide();
      sideUi.tried = null;
      return false;
    }
    if (sideUi.api === c) return true;
    if (sideUi.api) dropSide();
    if (sideUi.tried === c) return false;
    sideUi.tried = c;
    const done = [];
    try {
      for (const def of SIDE_DEFS) {
        const ok = c.registerRightSection({ id: def.id, label: def.label, order: def.order, when: (ctx) => sideWants(def, ctx), render: (body, ctx) => renderSide(def, body, ctx) });
        if (!ok) throw new Error("registerRightSection refused " + def.id);
        done.push(def.id);
      }
    } catch (_) {
      for (const id of done)
        try {
          c.unregisterRightSection(id);
        } catch (_) {}
      return false;
    }
    sideUi.api = c;
    return true;
  }
  function dropSide() {
    const c = sideUi.api;
    sideUi.api = null;
    sideUi.view = null;
    clearTimeout(sideUi.out);
    sideUi.out = 0;
    if (c && typeof c.unregisterRightSection === "function")
      for (const def of SIDE_DEFS)
        try {
          c.unregisterRightSection(def.id);
        } catch (_) {}
    sideUi.hosts.clear();
  }
  function sideWants(def, ctx) {
    const d = sideUi.view;
    if (!d || d.host !== "side" || kindOf(d.f) !== def.kind || !d.parts[def.part]) return false;
    if (def.part === "core" && propsCovers(d.f)) return false;
    const sh = ctx && ctx.shell;
    return !sh || sh.contains(d.f.m.root);
  }
  function renderSide(def, body, ctx) {
    const sec = (ctx && ctx.section) || body.parentElement;
    const host = { def, body, sec, actions: (ctx && ctx.actions) || null };
    sideUi.hosts.set(def.id, host);
    sec.classList.add("rtsh-side");
    sec.setAttribute("data-rtsh-side", def.part);
    body.classList.add("rtsh-side-body");
    stopInput(sec);
    fillHost(host);
    // The sections of one selection come in together, 40 ms apart.
    const i = SIDE_DEFS.filter((x) => x.kind === def.kind && sideUi.hosts.has(x.id)).findIndex((x) => x.id === def.id);
    sec.style.setProperty("--rtsh-i", String(Math.max(0, i)));
    sec.setAttribute("data-rtsh-in", "");
    sec.addEventListener("animationend", () => sec.removeAttribute("data-rtsh-in"), { once: true });
    return () => {
      if (sideUi.hosts.get(def.id) === host) sideUi.hosts.delete(def.id);
    };
  }
  function fillHost(host) {
    const d = sideUi.view;
    const p = d && d.parts[host.def.part];
    if (!p) return;
    if (host.body.firstChild !== p.rows || host.body.childNodes.length !== 1) host.body.replaceChildren(p.rows);
    if (host.actions) host.actions.replaceChildren(...p.actions);
  }
  const pokeChrome = () => {
    const c = sideUi.api;
    if (c && typeof c.sync === "function")
      try {
        c.sync();
      } catch (_) {}
  };
  function showSide(d, rehost) {
    const prev = sideUi.view;
    clearTimeout(sideUi.out);
    sideUi.out = 0;
    sideUi.view = d;
    for (const host of sideUi.hosts.values()) {
      host.sec.removeAttribute("data-rtsh-out");
      if (!d.parts[host.def.part] || host.def.kind !== kindOf(d.f)) continue;
      fillHost(host);
      // another target of the same kind: the sections stay, their content
      // crossfades in
      if (prev && prev !== d) {
        host.body.removeAttribute("data-rtsh-swap");
        void host.body.offsetWidth;
        host.body.setAttribute("data-rtsh-swap", "");
      }
    }
    // The panel is never opened by a selection, with one exception: the
    // first shader frame selected in the session opens it once (the controls
    // used to show up next to the frame; the pill's Properties toggle is the
    // way from then on). An effect is opened from the panel itself, or by
    // the API, which shows the panel.
    let first = false;
    if (kindOf(d.f) === "frame") {
      first = !sideUi.opened;
      try {
        first = sessionStorage.getItem(PROPS_ONCE_KEY) !== "1";
        sessionStorage.setItem(PROPS_ONCE_KEY, "1");
      } catch (_) {}
      sideUi.opened = true;
    }
    pokeChrome();
    if (!rehost && (kindOf(d.f) === "effect" || first)) openProps(d.f);
  }
  // Opens the properties card of f's view the way its selection pill does
  // (setPropertiesOpen alone leaves a collapsed right panel closed).
  function openProps(f) {
    const sh = shellOf(f);
    if (!sh || sh.getAttribute("data-rcc-dd") === "open") return;
    const tg = sh.querySelector('[data-testid="rcc-sel-toggle"]');
    if (tg && !tg.disabled) tg.click();
    else if (sideUi.api) sideUi.api.setPropertiesOpen(true);
  }
  function hideSide(d, instant) {
    if (sideUi.view !== d) return;
    const hosts = Array.from(sideUi.hosts.values()).filter((x) => x.def.kind === kindOf(d.f) && isShown(x.sec));
    const done = () => {
      sideUi.out = 0;
      if (sideUi.view !== d) return;
      sideUi.view = null;
      pokeChrome();
    };
    clearTimeout(sideUi.out);
    if (instant || !hosts.length) return done();
    for (const x of hosts) x.sec.setAttribute("data-rtsh-out", "");
    sideUi.out = setTimeout(done, state.reduced ? 130 : 150);
  }

  // ---------------------------------------------------------------- editor
  // Side host: a sheet docked to the left of the right panel's card, as tall
  // as the card (selection pill to its bottom), up to 560 px wide, clear of
  // the left card and the tool rail when there is room. It lives while the
  // properties are open. Float host: beside the floating panel.
  function openEditor(f) {
    if (f.kind === "effect") {
      if (!docked(f)) openDock(f);
    } else if (state.selected !== f) select(f);
    const d = state.dock;
    if (!d || d.f !== f) return;
    if (d.editor) {
      d.editor.ta.focus();
      return;
    }
    const ed = { timer: 0 };
    ed.status = h("span", { class: "rtsh-ed-status" });
    ed.target = h("span", { class: "rtsh-ed-target", text: d.els.name.textContent });
    ed.close = h("button", { class: "rtsh-icon-btn", type: "button", "aria-label": "Close editor", title: "Close (Esc)" }, icon("close", "rtsh-ic"));
    ed.gutter = h("div", { class: "rtsh-gutter", "aria-hidden": "true" });
    ed.ta = h("textarea", { class: "rtsh-code", spellcheck: "false", autocapitalize: "off", autocomplete: "off", autocorrect: "off", wrap: "off", "aria-label": "GLSL source", "data-testid": "canvas-shader-glsl" });
    ed.ta.value = f.data.glsl;
    ed.log = h("div", { class: "rtsh-log", role: "log", "aria-live": "polite", "data-testid": "canvas-shader-log" });
    ed.el = h(
      "div",
      { class: "rtsh-editor", role: "dialog", "aria-label": "GLSL editor", "data-testid": "canvas-shader-editor" },
      h("div", { class: "rtsh-panel-head" }, icon("code", "rtsh-ic rtsh-ic-accent"), h("span", { class: "rtsh-panel-name", text: "GLSL" }), ed.target, ed.status, ed.close),
      h("div", { class: "rtsh-code-wrap" }, ed.gutter, ed.ta),
      ed.log
    );
    d.editor = ed;
    d.els.edit.setAttribute("aria-pressed", "true");
    ed.close.addEventListener("click", () => closeEditor(d));
    ed.ta.addEventListener("input", () => {
      renderGutter(ed);
      ed.status.textContent = "Compiling…";
      ed.status.setAttribute("data-kind", "busy");
      clearTimeout(ed.timer);
      ed.timer = setTimeout(() => compileFromEditor(d), COMPILE_DEBOUNCE);
    });
    ed.ta.addEventListener("scroll", () => (ed.gutter.scrollTop = ed.ta.scrollTop));
    ed.ta.addEventListener("keydown", (e) => {
      if (e.key === "Tab" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const s = ed.ta.selectionStart;
        const en = ed.ta.selectionEnd;
        ed.ta.setRangeText("  ", s, en, "end");
        ed.ta.dispatchEvent(new Event("input"));
      }
    });
    renderGutter(ed);
    updateEditorLog();
    if (d.host !== "float") {
      if (d.host === "side") openProps(f);
      d.sheet = h("div", { class: "rtsh-sheet", "data-rtsh-dock": "", "data-rtsh-sheet": "", "data-testid": "canvas-shader-sheet" }, ed.el);
      d.sheetAt = performance.now();
      d.sheetShown = false;
      d.sheetPos = "";
      stopInput(d.sheet);
      document.body.appendChild(d.sheet);
      placeSheet(d);
      const loop = () => {
        if (state.dock !== d || !d.sheet) return;
        placeSheet(d);
        if (d.sheet) d.sheetRaf = requestAnimationFrame(loop);
      };
      d.sheetRaf = requestAnimationFrame(loop);
    } else {
      d.el.appendChild(ed.el);
      d.el.setAttribute("data-editor", "");
      placeDock();
    }
    requestAnimationFrame(() => ed.ta.focus({ preventScroll: true }));
  }
  // The sheet's anchor: canvas-chrome's card (selection pill to its bottom),
  // or the view's own right panel (8 px inset).
  function sheetAnchor(d) {
    const sh = shellOf(d.f);
    if (!sh || !mountShown(d.f.m)) return null;
    if (d.host === "native") {
      const panel = panelFor(d.f.m);
      if (!panel || !isShown(panel)) return null;
      const r = panel.getBoundingClientRect();
      return { sh, top: r.top + SHEET_GAP, bottom: r.bottom - SHEET_GAP, left: r.left };
    }
    const card = sh.querySelector("[data-rcc-rwrap]");
    if (!card || sh.getAttribute("data-rcc-dd") !== "open" || !isShown(card)) return null;
    const cr = card.getBoundingClientRect();
    const pill = sh.querySelector(".rcc-sel");
    const pr = pill && isShown(pill) ? pill.getBoundingClientRect() : null;
    return { sh, top: pr ? Math.min(pr.top, cr.top) : cr.top, bottom: cr.bottom, left: Math.min(cr.left, pr ? pr.left : cr.left) };
  }
  function placeSheet(d) {
    const s = d.sheet;
    const a = sheetAnchor(d);
    if (!a) {
      // The properties closed (or the view left): the editor goes with them.
      // Right after Edit GLSL the panel may still be opening.
      if (d.sheetShown || performance.now() - d.sheetAt > 800) return closeEditor(d);
      s.style.visibility = "hidden";
      return;
    }
    const sh = a.sh;
    const top = a.top;
    const right = Math.floor(a.left - SHEET_GAP);
    const rr = d.f.m.root.getBoundingClientRect();
    // clear of the left card and the rail when that leaves enough room
    let clear = rr.left + SHEET_GAP;
    for (const n of sh.querySelectorAll('[data-rcc-railwrap], [data-rcc-card]')) {
      if (n.matches("[data-rcc-card]") && sh.getAttribute("data-rcc-left") !== "open") continue;
      const r = n.getBoundingClientRect();
      if (r.width && r.right < right) clear = Math.max(clear, r.right + SHEET_GAP);
    }
    const room = right - clear >= SHEET_MIN_W ? right - clear : right - (rr.left + SHEET_GAP);
    const w = Math.round(Math.max(Math.min(SHEET_W, room), Math.min(SHEET_MIN_W, right - 8)));
    const x = Math.round(right - w);
    const y = Math.round(top);
    const hh = Math.round(Math.max(200, a.bottom - top));
    const pos = `${x},${y},${w},${hh}`;
    if (pos !== d.sheetPos) {
      d.sheetPos = pos;
      s.style.left = x + "px";
      s.style.top = y + "px";
      s.style.width = w + "px";
      s.style.height = hh + "px";
    }
    if (!d.sheetShown) {
      d.sheetShown = true;
      s.style.visibility = "";
      requestAnimationFrame(() => s.isConnected && s.setAttribute("data-show", ""));
    }
  }
  function closeEditor(dd) {
    const d = dd || state.dock;
    if (!d || !d.editor) return;
    const ed = d.editor;
    if (ed.timer) {
      clearTimeout(ed.timer);
      compileFromEditor(d);
    }
    d.editor = null;
    d.els.edit.setAttribute("aria-pressed", "false");
    if (d.sheet) {
      const s = d.sheet;
      d.sheet = null;
      cancelAnimationFrame(d.sheetRaf);
      s.removeAttribute("data-show");
      s.setAttribute("data-closing", "");
      s.style.pointerEvents = "none";
      setTimeout(() => s.remove(), state.reduced ? 130 : 160);
    } else {
      ed.el.remove();
      if (d.el) d.el.removeAttribute("data-editor");
    }
  }
  function compileFromEditor(d) {
    const ed = d.editor;
    if (!ed) return;
    ed.timer = 0;
    const src = ed.ta.value;
    if (src === d.f.data.glsl && d.f.result && d.f.result.src === src) return updateEditorLog();
    applyGlsl(d.f, src, true);
    if (state.dock === d) refreshDock(false);
    save(d.f.m);
  }
  function renderGutter(ed) {
    const n = ed.ta.value.split("\n").length;
    const errLines = new Set();
    const r = state.dock && state.dock.f.result;
    if (r && r.src === ed.ta.value) for (const e of r.errors) if (e.line) errLines.add(e.line);
    let html = "";
    for (let i = 1; i <= n; i++) html += errLines.has(i) ? `<span class="rtsh-ln" data-err>${i}</span>\n` : `<span class="rtsh-ln">${i}</span>\n`;
    ed.gutter.innerHTML = html;
    ed.gutter.scrollTop = ed.ta.scrollTop;
  }
  function updateEditorLog() {
    const d = state.dock;
    if (!d || !d.editor) return;
    const ed = d.editor;
    const r = d.f.result;
    ed.log.replaceChildren();
    if (!r) return;
    const items = [...r.errors.map((e) => ({ ...e, kind: "error" })), ...r.warnings.map((e) => ({ ...e, kind: "warning" }))];
    if (!items.length) {
      ed.log.append(h("div", { class: "rtsh-log-ok" }, icon("check", "rtsh-ic"), h("span", { text: `Compiled · ${r.meta.uniforms.length} uniforms${r.meta.hasTime ? " · animated" : ""}` })));
    } else
      for (const it of items) {
        const b = h("button", { class: "rtsh-log-item", type: "button", "data-kind": it.kind }, h("span", { class: "rtsh-log-line", text: it.line ? `Line ${it.line}` : it.kind === "error" ? "Error" : "Warning" }), h("span", { class: "rtsh-log-msg", text: it.msg }));
        if (it.line) b.addEventListener("click", () => jumpToLine(ed, it.line));
        ed.log.append(b);
      }
    const nErr = r.errors.length;
    ed.status.textContent = nErr ? `${nErr} error${nErr > 1 ? "s" : ""}` : "Compiled";
    ed.status.setAttribute("data-kind", nErr ? "error" : "ok");
    renderGutter(ed);
  }
  function jumpToLine(ed, line) {
    const lines = ed.ta.value.split("\n");
    let s = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) s += lines[i].length + 1;
    const e = s + (lines[line - 1] || "").length;
    ed.ta.focus({ preventScroll: true });
    ed.ta.setSelectionRange(s, e);
    const lh = parseFloat(getComputedStyle(ed.ta).lineHeight) || 16;
    ed.ta.scrollTop = Math.max(0, (line - 4) * lh);
  }

  // ------------------------------------------------------------ shader tool
  function arm(m) {
    if (!m || !m.root.isConnected) return false;
    disarm();
    deselect();
    try {
      const b = window.__RE_TEMPO_CANVAS_BROWSER__;
      if (b && b.state().tool) b.disarm();
    } catch (_) {}
    const overlay = h("div", { class: "rtsh-draw-overlay", "data-rtsh-draw": "" });
    m.root.appendChild(overlay);
    state.tool = { m, overlay, preview: null };
    document.documentElement.setAttribute("data-rtsh-armed", "");
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
    document.documentElement.removeAttribute("data-rtsh-armed");
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
    const label = h("div", { class: "rtsh-size" });
    const pv = h("div", { class: "rtsh-draw-preview" }, ...["nw", "ne", "sw", "se"].map((k) => h("div", { class: "rtsh-draw-sq rtsh-corner-" + k })), label);
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

  // ------------------------------------------------------- toolbar button
  function rootForToolbar(tb) {
    for (let a = tb.parentElement; a && a !== document.body; a = a.parentElement) {
      const roots = a.querySelectorAll(CANVAS_ROOT);
      if (roots.length) return Array.from(roots).find(isShown) || roots[0];
    }
    return null;
  }
  function makeToolButton(tb) {
    const b = h("button", { type: "button", class: "rtsh-tool", "aria-label": "Shader", "aria-pressed": "false", "data-rtsh-tool": "", "data-testid": "canvas-shader-tool" });
    b.append(icon("sparkles", "size-4 rtsh-ic", 1.5));
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
    if (!tb.__rtshWired) {
      tb.__rtshWired = true;
      tb.addEventListener("click", (e) => {
        const nb = e.target.closest("button");
        if (nb && !nb.hasAttribute("data-rtsh-tool")) disarm();
      });
    }
    return b;
  }
  // Right after the Browser tool when canvas-browser is there (sharing its
  // separator), else at the end behind an own separator.
  function injectToolbars() {
    let changed = false;
    for (const tb of document.querySelectorAll(TOOLBAR)) {
      let b = tb.querySelector(":scope > [data-rtsh-tool]");
      let sep = tb.querySelector(":scope > [data-rtsh-sep]");
      const browser = tb.querySelector(":scope > [data-rtbf-tool]");
      if (!b) {
        b = makeToolButton(tb);
        changed = true;
      }
      if (browser) {
        if (sep) sep.remove();
        if (browser.nextElementSibling !== b) browser.after(b);
      } else {
        if (!sep) {
          const sepNative = tb.querySelector(":scope > div.w-px");
          sep = h("div", { class: (sepNative && sepNative.className) || "h-5 w-px shrink-0 bg-border-secondary", "data-rtsh-sep": "" });
          sep.classList.add("rtsh-tool-sep");
        }
        if (tb.lastElementChild !== b || b.previousElementSibling !== sep) tb.append(sep, b);
      }
    }
    if (changed) refreshToolButtons();
  }
  function refreshToolButtons() {
    for (const b of document.querySelectorAll("button[data-rtsh-tool]")) {
      const tb = b.closest(TOOLBAR);
      const on = !!state.tool && !!tb && rootForToolbar(tb) === state.tool.m.root;
      const cls = `${BTN_BASE} ${on ? BTN_ON : BTN_IDLE} rtsh-tool`;
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
    const el = h("div", { class: "rtsh-tooltip", role: "tooltip" }, h("span", { text: "Shader" }));
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
  // Removed (2026-10-18): the "Shader on Canvas" item of the tab bar's "+" menu.
  // That menu only opens new windows (chat, canvas, doc, issue, terminal,
  // browser). Only a stale copy from an older load is swept.
  function sweepPlusMenu() {
    for (const el of document.querySelectorAll("[data-rtsh-plus]")) el.remove();
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
    if (typing || (ae && /^(IFRAME|WEBVIEW)$/.test(ae.tagName))) return;
    const plain = !e.metaKey && !e.ctrlKey && !e.altKey;
    if (e.key === "Escape" && (fxUi.menu || (state.dock && state.dock.f.kind === "effect"))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (fxUi.menu) closeFxMenu();
      else if (state.dock.editor) closeEditor();
      else closeDock();
      return;
    }
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
        if (state.dock && state.dock.editor) closeEditor();
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
    }
    // No tool key: the Shader tool left the toolbar (shaders are Effects).
  }
  function onKeyUp(e) {
    if (e.key === " ") state.spaceDown = false;
  }
  function onPointerDownCapture(e) {
    if (!state.enabled) return;
    const t = e.target;
    const root = t && t.closest ? t.closest(CANVAS_ROOT) : null;
    if (root) state.lastRoot = root;
    const near = (sel) => !!(t && t.closest && t.closest(sel));
    if (fxUi.menu && !near("[data-rtsh-fx-menu], [data-rtsh-fx-add]")) closeFxMenu();
    // The floating effect panel is a popover; in the right panel an effect's
    // settings stay open while its storyboard is selected.
    if (state.dock && state.dock.f.kind === "effect" && state.dock.host === "float" && !near("[data-rtsh-fx-section], [data-rtsh-fx-menu], [data-rtsh-dock], [data-rtsh-toast]")) closeDock();
    // Working in the properties (canvas-chrome's card and selection pill, or
    // the view's own design tab and its "Open right sidebar" toolbar) keeps
    // the frame selected.
    if (near('.rtsh-frame, [data-rtsh-dock], [data-rtsh-toast], [data-rtsh-tool], [data-rtsh-draw], [data-rtsh-side], [data-rcc-props], [data-testid="rcc-selection-pill"], [data-testid="canvas-design-tab"], [role="toolbar"][aria-label="Canvas controls"]')) return;
    if (state.selected) deselect();
  }
  function onWindowBlur() {
    setTimeout(() => {
      const ae = document.activeElement;
      if (!ae || !state.selected) return;
      if (/^(IFRAME|WEBVIEW)$/.test(ae.tagName)) deselect();
    }, 0);
  }

  // ------------------------------------------------------------------- sync
  function teardownAll() {
    disarm();
    hideToast();
    hideTooltip();
    deselect();
    if (state.loop.raf) cancelAnimationFrame(state.loop.raf);
    state.loop.raf = 0;
    closeDock({ instant: true });
    dropSide();
    removeFxSection();
    for (const m of Array.from(state.mounts.values())) unmount(m);
    for (const el of document.querySelectorAll("[data-rtsh-tool], [data-rtsh-sep], [data-rtsh-plus], [data-rtsh-fx-menu]")) el.remove();
    // Free the GPU: the context comes back on demand when the flag is on.
    try {
      if (GL.gl) {
        for (const e of GL.cache.values()) if (e.prog) GL.gl.deleteProgram(e.prog);
        const ext = GL.gl.getExtension("WEBGL_lose_context");
        if (ext) ext.loseContext();
      }
    } catch (_) {}
    GL.gl = null;
    GL.canvas = null;
    GL.lost = false;
    GL.cache.clear();
    GL.textures.clear();
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
    for (const m of state.mounts.values()) refreshVis(m);
    sweepToolbars();
    sweepPlusMenu();
    for (const m of state.mounts.values()) placeEffects(m);
    syncFxSection();
    useSide();
    syncHost();
    if (state.tool && !isShown(state.tool.m.root)) disarm();
    if (state.toast && state.toast.root && !isShown(state.toast.root)) hideToast();
    if (state.tooltip && !state.tooltip.anchor.isConnected) hideTooltip();
    const f = state.selected;
    if (f) {
      if (!f.el.isConnected) {
        state.selected = null;
        closeDock();
      } else
        try {
          const hd = f.m.handle;
          if (hd && typeof hd.getSelection === "function" && hd.getSelection().length) deselect();
        } catch (_) {}
    }
    for (const m of state.mounts.values()) if ((m.frames.size || m.fx.size) && isShown(m.root)) wake();
  }
  let quickTimer = null;
  let quickAt = 0;
  function quickSync() {
    quickTimer = null;
    quickAt = Date.now();
    if (!state.enabled || document.hidden || boot.disposed) return;
    syncMounts(false);
    sweepToolbars();
    sweepPlusMenu();
    for (const m of state.mounts.values()) placeEffects(m);
    syncFxSection();
    syncHost();
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
    if (e.key && e.key.startsWith(FX_PREFIX)) {
      const key = e.key.slice(FX_PREFIX.length);
      for (const m of mountsOf(key)) if (!m.fxNodes) reconcileEffects(m, loadFx(key));
      return;
    }
    if (!e.key || !e.key.startsWith(STORE_PREFIX)) return;
    const key = e.key.slice(STORE_PREFIX.length);
    for (const m of mountsOf(key)) if (!m.nodes) reconcile(m, load(key));
  });
  listen(window, "rtd:canvas-chrome-ready", () => scheduleQuick());
  listen(window, "rtd:canvas-nodes-ready", () => {
    registerNodeTypes(window.__RE_TEMPO_CANVAS_NODES__);
    scheduleQuick();
  });
  loadNodes();
  // The interval and the render loop skip a hidden tab; catch up on show.
  listen(document, "visibilitychange", () => {
    if (document.hidden) return;
    sync();
    wake();
  });
  try {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    state.reduced = mq.matches;
    const onMq = () => {
      state.reduced = mq.matches;
      markAllDirty();
      updateDockStatus();
    };
    if (typeof mq.addEventListener === "function") listen(mq, "change", onMq);
    else if (typeof mq.addListener === "function") {
      mq.addListener(onMq);
      boot.listeners.push([{ removeEventListener: () => mq.removeListener(onMq) }, "change", onMq]);
    }
  } catch (_) {}
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
  // Removes everything this mod added (frames, effects, the Effects section,
  // listeners, timers, observer, the GL context) and its window API; the
  // canvas file is left as it is.
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
    if (window.__RE_TEMPO_CANVAS_SHADER__ === api) delete window.__RE_TEMPO_CANVAS_SHADER__;
    return true;
  }

  // ---------------------------------------------------------- introspection
  const pub = (f) => ({
    id: f.data.id,
    x: f.data.x,
    y: f.data.y,
    w: f.data.w,
    h: f.data.h,
    z: f.data.z,
    name: shownName(f),
    preset: f.data.preset,
    customGlsl: f.data.glsl !== (PRESET_BY_ID[f.data.preset] || {}).glsl,
    uniforms: { ...f.data.uniforms },
    speed: f.data.speed,
    paused: f.data.paused,
    selected: state.selected === f,
    status: f.status,
    renders: f.renders,
    time: f.t,
    scale: f.scale,
    canvas: [f.els.canvas.width, f.els.canvas.height],
    ok: !!(f.result && f.result.ok),
    hasProgram: !!f.entry,
    errors: f.result ? f.result.errors.slice() : [],
    controls: f.entry ? f.entry.meta.uniforms.map((u) => ({ name: u.name, type: u.type, label: u.label || null })) : [],
    recording: !!f.recording,
  });
  const pubFx = (f) => ({
    id: f.data.id,
    storyboard: f.sb,
    mode: f.data.mode,
    blend: f.data.blend,
    opacity: f.data.opacity,
    preset: f.data.preset,
    customGlsl: f.data.glsl !== presetGlsl(f.data.preset),
    uniforms: { ...f.data.uniforms },
    speed: f.data.speed,
    paused: f.data.paused,
    status: f.status,
    renders: f.renders,
    canvas: [f.els.canvas.width, f.els.canvas.height],
    size: [f.data.w, f.data.h],
    ok: !!(f.result && f.result.ok),
    mounted: f.el.isConnected,
    layer: f.el.parentElement ? f.el.parentElement.getAttribute("data-rtsh-fx-layer") : null,
    docked: docked(f),
  });
  const api = {
    version: 1,
    get enabled() {
      return state.enabled;
    },
    state: () => ({
      enabled: state.enabled,
      reduced: state.reduced,
      tool: !!state.tool,
      selected: state.selected ? state.selected.data.id : null,
      dock: !!state.dock,
      host: state.dock ? state.dock.host : null,
      editor: !!(state.dock && state.dock.editor),
      sheet: !!(state.dock && state.dock.sheet),
      side: { registered: !!sideUi.api, sections: Array.from(sideUi.hosts.keys()), view: sideUi.view ? sideUi.view.f.data.id : null },
      toast: state.toast ? state.toast.el.textContent : null,
      loop: !!state.loop.raf,
      counts: { ...state.counts },
      lastSync: state.lastSync,
      disposed: boot.disposed,
      gl: { ok: !!GL.gl && !GL.lost, failed: GL.failed, renderer: GL.renderer, canvas: GL.size.slice(), cache: GL.cache.size, max: GL.max },
      lastDownload: state.lastDownload,
      mounts: Array.from(state.mounts.values()).map((m) => ({ key: m.key, workspacePath: m.ws, persistence: m.nodes ? "canvas-file" : "localStorage", visible: isShown(m.root), frames: Array.from(m.frames.values()).map(pub), effects: Array.from(m.fx.values()).reduce((a, ent) => a + ent.list.length, 0) })),
      effectsSection: { shown: !!(fxUi.section && fxUi.section.isConnected), storyboard: fxUi.sb, rows: fxEffects().length, menu: !!fxUi.menu },
      effectDock: state.dock && state.dock.f.kind === "effect" ? state.dock.f.data.id : null,
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
    // Effects on storyboards (sb: a storyboard id; default all / the selected one).
    effects: (sb) => {
      const out = [];
      for (const m of state.mounts.values()) for (const ent of m.fx.values()) if (!sb || ent.sb === sb) for (const f of ent.list) out.push(pubFx(f));
      return out;
    },
    selectedStoryboard: () => {
      const c = selectedStoryboard();
      return c ? c.sb : null;
    },
    addEffect: (sb, opts) => {
      const cur = selectedStoryboard();
      const id = sb || (cur && cur.sb);
      if (!id) return null;
      const m = (cur && cur.sb === id && cur.m) || Array.from(state.mounts.values()).find((x) => sbElement(x, id)) || null;
      return m ? addEffect(m, id, opts || {}).data.id : null;
    },
    updateEffect: (id, patch) => {
      const f = effectById(id);
      if (!f) return false;
      const p = patch || {};
      if (p.preset && PRESET_BY_ID[p.preset] && p.preset !== f.data.preset) setShaderState(f, { preset: p.preset, glsl: presetGlsl(p.preset), uniforms: {}, speed: f.data.speed, name: "", named: false });
      if (typeof p.glsl === "string" && p.glsl.trim()) applyGlsl(f, p.glsl, true);
      if (p.uniforms && typeof p.uniforms === "object") f.data.uniforms = cleanUniforms({ ...f.data.uniforms, ...p.uniforms });
      if (p.speed != null && Number.isFinite(+p.speed)) f.data.speed = clamp(+p.speed, 0, 4);
      if (p.paused != null) f.data.paused = !!p.paused;
      setEffect(f, p, true);
      if (docked(f)) refreshDock(true);
      return true;
    },
    moveEffect: (id, delta) => {
      const f = effectById(id);
      return f ? moveEffect(f, delta) : false;
    },
    removeEffect: (id, withUndo) => {
      const f = effectById(id);
      return f ? (removeEffect(f, withUndo), true) : false;
    },
    openEffect: (id) => {
      const f = effectById(id);
      if (!f) return false;
      openDock(f);
      return true;
    },
    openEffectMenu: () => {
      if (!fxUi.section) return false;
      if (!fxUi.menu) toggleFxMenu();
      return !!fxUi.menu;
    },
    presets: () => PRESETS.map((p) => ({ id: p.id, label: p.label })),
    presetSource: (id) => (PRESET_BY_ID[id] || {}).glsl || null,
    analyze: (src) => analyze(String(src)),
    compile: (src) => {
      const e = getEntry(String(src));
      return { ok: e.ok, errors: e.errors.slice(), warnings: e.warnings.slice(), uniforms: e.meta.uniforms.map((u) => ({ ...u })), animated: e.meta.animated };
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
    setPreset: (id, preset) => {
      const f = frameById(id);
      if (!f || !PRESET_BY_ID[preset]) return false;
      setPreset(f, preset);
      return true;
    },
    setUniform: (id, name, value) => {
      const f = frameById(id);
      if (!f) return false;
      setUniform(f, name, value, true);
      if (state.selected === f) refreshDock(true);
      return true;
    },
    setGlsl: (id, src) => {
      const f = frameById(id);
      if (!f) return null;
      const e = applyGlsl(f, String(src));
      save(f.m);
      return { ok: e.ok, errors: e.errors.slice() };
    },
    setSpeed: (id, s) => {
      const f = frameById(id);
      if (!f) return false;
      f.data.speed = clamp(+s, 0, 4);
      save(f.m);
      wake();
      if (state.selected === f) refreshDock(false);
      return true;
    },
    setPaused: (id, p) => {
      const f = frameById(id);
      if (!f) return false;
      f.data.paused = !!p;
      save(f.m);
      wake();
      if (state.selected === f) updateDockStatus();
      return true;
    },
    reset: (id) => {
      const f = frameById(id);
      if (f) resetShader(f);
      return !!f;
    },
    // Reads a uniform back from GL right after drawing this frame.
    uniformValue: (id, name) => {
      const f = frameById(id);
      const gl = GL.gl;
      if (!f || !gl || !f.entry || !f.entry.locs[name]) return null;
      renderShader(f, 8, 8, f.t, mouseOf(f), null);
      const v = gl.getUniform(f.entry.prog, f.entry.locs[name]);
      return v && typeof v === "object" && "length" in v ? Array.from(v) : v;
    },
    openEditor: (id) => {
      const f = frameById(id);
      if (f) openEditor(f);
      return !!f;
    },
    closeEditor,
    exportPng: (id, opts) => {
      const f = frameById(id);
      return f ? exportPng(f, opts) : Promise.reject(new Error("no frame"));
    },
    exportWebm: (id, opts) => {
      const f = frameById(id);
      return f ? exportWebm(f, opts) : Promise.reject(new Error("no frame"));
    },
    embed: (id) => {
      const f = frameById(id);
      return f ? buildEmbed(f) : null;
    },
    copyEmbed: (id) => {
      const f = frameById(id);
      const code = f && buildEmbed(f);
      return code ? copyText(code) : Promise.resolve(false);
    },
    lastCopied: () => state.lastCopied,
    undo,
    arm: () => arm(visibleMount()),
    disarm,
    sync,
    wake,
    keyOf: (root) => canvasKeyOf(root || (visibleMount() || {}).root),
    storageKey: (key) => STORE_PREFIX + key,
    dispose,
  };
  window.__RE_TEMPO_CANVAS_SHADER__ = api;
})();
