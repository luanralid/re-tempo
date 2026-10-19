/*
 * RE-TEMPO · canvas-nodes (user MOD layer, shared by canvas-browser and
 * canvas-shader)
 * ---------------------------------------------------------------------------
 * Browser and shader frames live in the canvas file itself, next to the
 * storyboards, so the agent and git see them (pen.dev keeps its browser nodes
 * in the .pen file the same way). This module owns that block: it reads it,
 * writes it through the app's own source-file bridge, migrates the old
 * localStorage frames once, and hands every change (this pane's, another
 * pane's, an edit made on disk by an agent or by git) to the two mods.
 * canvas-browser.js and canvas-shader.js load it from their own folder (it is
 * not in tools/inject-index.mjs); without it they keep localStorage.
 *
 * The canvas file (assets/index-D2Ui1vc0.js and out/main, RE-TEMPO build of
 * 2026-10-14, read on 2026-10-18):
 *   - A canvas is `<pageFolderPath>/index.canvas.tsx` (for example
 *     tempo/designs/canvases/home/index.canvas.tsx), a TSX module whose
 *     default export returns one <Canvas> with <Storyboard>, <RouteStoryboard>,
 *     <HtmlStoryboard>, <SvelteStoryboard> or <LegacyStoryboardV1> children.
 *     This build has no index.canvas.json (its only ".canvas.json" string is
 *     a filter in the @-mention picker).
 *   - Read: electronAPI.canvasPages.readPageConfig(workspacePath,
 *     pageFolderPath) -> main's readCanvasPageConfig (chunk
 *     out/main/chunks/canvas-validation-*.cjsc). Storyboard moves:
 *     canvasPages.writePageConfig(ws, folder, {storyboards}) ->
 *     commitCanvasPageLayoutWrite, which rewrites only the layout={{...}}
 *     span. Adding (addCanvasStoryboard) and deleting
 *     (planDeleteStoryboardsOnDisk) storyboards are span edits too. Undo/redo
 *     and the canvas surface write whole files through
 *     electronAPI.sourceEditor: readSourceFileIfExists(ws, rel) -> {content,
 *     mtime} and writeSourceFile(ws, rel, content, expectedMtime) -> {stale,
 *     content, mtime}, a stale write being merged and retried up to 5 times.
 *     usePageConfigSync reloads 300 ms after fileWatcher.onChange reports the
 *     file and polls every 4 s.
 *   - Both placements were tested against those real main functions (the
 *     .cjsc bytecode loaded by the app's own Electron with
 *     ELECTRON_RUN_AS_NODE=1, no window):
 *     (a) own JSX nodes inside <Canvas> (<ReTempoNode id=... />):
 *         readCanvasPageConfig throws "<Canvas> children must be <Storyboard>,
 *         <SvelteStoryboard>, <RouteStoryboard>, <HtmlStoryboard>, or
 *         <LegacyStoryboardV1> declarations": the app refuses the canvas.
 *     (b) a module-level block outside <Canvas>: parses with no errors, the
 *         storyboard list is unchanged, and the block survives a layout
 *         write, a storyboard add and a storyboard delete byte for byte.
 *     The frames use (b), as a plain (not exported) const: the canvas host
 *     builds with @vitejs/plugin-react, and a named non-component export
 *     would turn every canvas edit into a full reload instead of a Fast
 *     Refresh. The app's page check (validatePage: tsc with the project's
 *     tsconfig) reported TS6133 for the unread const under noUnusedLocals
 *     (seed-tracker has it on), hence the `void` line; with it the check
 *     passes.
 *
 * Block (appended at the end of the file, replaced in place afterwards,
 * removed with the last frame):
 *   // @re-tempo-canvas-nodes:start
 *   // (a few comment lines)
 *   const reTempoCanvasNodes = {
 *     "v": 1,
 *     "nodes": [ {...}, {...} ]
 *   };
 *   void reTempoCanvasNodes; // read once, for noUnusedLocals
 *   // @re-tempo-canvas-nodes:end
 * The value is JSON; on read, comments, trailing commas and bare keys are
 * tolerated, and a `const reTempoCanvasNodes = {...}` written without the
 * markers is found too. Nodes, in canvas units like the storyboards' layout:
 *   browser {id, type: "browser", x, y, w, h, url, title, titled?, z?}
 *     url: http(s) or file URL, "" shows the URL prompt. title: the name over
 *     the frame. titled: false = the title follows the page's own title
 *     (default true when a title is given). z: stacking among the frames.
 *   shader {id, type: "shader", x, y, w, h, preset, glsl?, uniforms, title,
 *     speed?, paused?, z?}
 *     preset: a canvas-shader preset id (mesh, grain, fluid, waves, aurora,
 *     glass, halftone, particles). glsl: GLSL ES
 *     3.00 (one `out vec4`) or 1.00 fragment source, only gl_FragCoord and
 *     uniforms as inputs; omitted = the preset's. uniforms: {name: number |
 *     boolean | number[] | "#hex" | "pattern:<id>" | "image:data:..."}.
 *     title: "" = the preset's label. speed: 0..4 (default 1).
 *   storyboard {id: "sb_<storyboard id>", type: "storyboard", storyboard:
 *     "<storyboard id>", effects: [{id, type: "shader", mode: "background" |
 *     "overlay", preset, glsl?, uniforms, opacity: 0..1, blend: a CSS
 *     mix-blend-mode, speed?, paused?}]}
 *     canvas-shader's Effects: shaders drawn behind (background) or over
 *     (overlay, blended) a storyboard of this canvas, in list order.
 *   ids: any unique string (the mods make bf_... and sf_...); a node without
 *   one gets a stable id written back. Other types and unknown fields are
 *   kept as they are.
 * Image textures over 48 KB stay out of the file: the uniform holds
 * "image:local:<hash>" and the data URL sits in localStorage
 * "rtd.canvasNodes.blob:<hash>" (a clone without it shows the default).
 *
 * Sync: writes go through sourceEditor.writeSourceFile with the mtime read
 * just before (stale -> the block is spliced into the new content, up to 5
 * tries), 300 ms after the last change; upsert/remove write at once. A change
 * on disk (fileWatcher.onChange for the file, a 4 s poll, window focus, the
 * app's "tempo:canvas:page-config-saved") rereads the file 300 ms later; only
 * a change inside the block reaches the frames. Conflict: the file on disk
 * wins, local changes not written yet are dropped when the block changed on
 * disk under them. A block that does not parse (an agent mid-edit) is never
 * overwritten; the frames stay as they were until it parses again.
 *
 * Migration: when a canvas is read (or a mod attaches to it later), frames in
 * the old localStorage keys "rtd.canvasBrowser.v1:<canvasPath>" and
 * "rtd.canvasShader.v1:<canvasPath>" whose id is not in the file yet are
 * written into it, type by type and only for a type whose mod called
 * registerType (so a mod that still reads localStorage keeps its frames).
 * The old values are then kept in "rtd.canvasNodes.migrated.<canvasPath>"
 * ({t, workspacePath, file, types, added, browser, shader}) and the old keys
 * are removed. Once per type and canvasPath: the old keys had no workspace,
 * so the first workspace that opens that path gets them.
 *
 * API: window.__RE_TEMPO_CANVAS_NODES__
 *   list(canvasPath?) -> the nodes of that canvas (default: the one on
 *     screen; [] until its file is read).
 *   upsert(node) -> Promise<node>: create, or update by id (fields not given
 *     are kept). node.canvasPath and node.workspacePath pick the canvas
 *     (default: the one on screen); written at once.
 *   remove(id, canvasPath?) -> Promise<bool>.
 *   format() -> {version, file, marker, constName, types, rules, example}.
 *   flush(), reload(canvasPath?), state(), refOf(root), available().
 *   For the mods: registerType(type, {keys, fromLegacy}), attach({workspacePath,
 *   canvasPath, type, token, onNodes}) -> {set(list), flush(), detach(),
 *   state()}. Tests: setBackend({read, write, onChange?, onInvalidated?}).
 * Actions (ui-drive's window.__RE_TEMPO_ACTIONS__, or its pending queue):
 *   canvas.node.upsert {node (json), canvasPath?}, canvas.node.remove {id,
 *   canvasPath?}; both undoable.
 * Flag: localStorage "rtd.canvasNodes" = "off" -> available() is false and the
 * mods keep localStorage (read when a canvas mounts).
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (window.__RE_TEMPO_CANVAS_NODES__) return; // double injection

  // ------------------------------------------------------------------ config
  const VERSION = 1;
  const FLAG_KEY = "rtd.canvasNodes";
  const MARK_START = "// @re-tempo-canvas-nodes:start";
  const MARK_END = "// @re-tempo-canvas-nodes:end";
  const MARK_WORD = "@re-tempo-canvas-nodes";
  const CONST_NAME = "reTempoCanvasNodes";
  const CANVAS_FILE = "index.canvas.tsx";
  const WRITE_MS = 300; // the app reloads 300 ms after a watcher event
  const RELOAD_MS = 300;
  const POLL_MS = 4000; // the app's fallback poll
  const WRITE_TRIES = 5; // the app retries a stale write 5 times
  const BLOB_MAX = 48 * 1024;
  const MIGRATED_PREFIX = "rtd.canvasNodes.migrated.";
  const BLOB_PREFIX = "rtd.canvasNodes.blob:";
  const LEGACY_PREFIX = { browser: "rtd.canvasBrowser.v1:", shader: "rtd.canvasShader.v1:" };
  const ID_PREFIX = { browser: "bf_", shader: "sf_" };
  const CANVAS_ROOT = "[data-canvas-root]";
  const MAX_FIBER_DEPTH = 600;
  const KEY_ORDER = ["id", "type", "storyboard", "x", "y", "w", "h", "url", "mode", "preset", "glsl", "uniforms", "opacity", "blend", "title", "titled", "speed", "paused", "z", "effects"];
  const BLOCK_NOTE = [
    "// RE-TEMPO canvas nodes: the browser and shader frames placed on this canvas",
    "// next to the storyboards (feature/canvas-nodes.js). The value is JSON; edit it",
    "// to add, move or remove frames and the open canvas follows. Coordinates are",
    "// canvas units, like the storyboards' layout.",
    '//   browser {id, type: "browser", x, y, w, h, url, title, titled?, z?}',
    '//   shader  {id, type: "shader", x, y, w, h, preset, glsl?, uniforms, title, speed?, paused?, z?}',
    '//   storyboard {id, type: "storyboard", storyboard: "<storyboard id>", effects: [{id, type: "shader",',
    '//     mode: "background" | "overlay", preset, glsl?, uniforms, opacity, blend, speed?, paused?}]}',
  ];

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
  const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  const fin = (v) => typeof v === "number" && Number.isFinite(v);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const msg = (e) => (e && e.message) || String(e);
  const warn = (...a) => {
    try {
      console.warn("[canvas-nodes]", ...a);
    } catch (_) {}
  };
  const fire = (name, detail) => {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (_) {}
  };
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, "0") + s.length.toString(36);
  }
  const randomId = (type) => (ID_PREFIX[type] || "n_") + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  // Paths as the app compares them (W0 + the /private/tmp fold of its watcher).
  const normPath = (p) =>
    String(p || "")
      .replace(/\\/g, "/")
      .replace(/^\/private\/(?=(?:tmp|var|etc)\/)/, "/")
      .replace(/\/+$/, "");
  const cleanPath = (p) =>
    String(p || "")
      .replace(/\\/g, "/")
      .replace(/\/+$/, "")
      .replace(/\/index\.canvas\.tsx$/, "")
      .replace(/^\/+/, "");
  const isShown = (el) => {
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === "function" && !el.checkVisibility()) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // ------------------------------------------------------------------ nodes
  // Any object with a type (or one that can be told from its fields) and an id.
  function normalizeNode(raw, idSeed) {
    if (!isObj(raw)) return null;
    const n = { ...raw };
    delete n.canvasPath;
    delete n.workspacePath;
    if (typeof n.type !== "string" || !n.type) {
      if (typeof n.url === "string") n.type = "browser";
      else if (typeof n.preset === "string" || typeof n.glsl === "string") n.type = "shader";
      else return null;
    }
    let generated = false;
    if (typeof n.id !== "string" || !n.id) {
      if (fin(n.id)) n.id = String(n.id);
      else {
        n.id = idSeed != null ? (ID_PREFIX[n.type] || "n_") + hashStr(JSON.stringify(raw) + "#" + idSeed) : randomId(n.type);
        generated = true;
      }
    }
    for (const k of ["x", "y", "w", "h", "z", "speed"]) if (k in n && !fin(n[k])) delete n[k];
    const out = {};
    for (const k of KEY_ORDER) if (k in n) out[k] = n[k];
    for (const k of Object.keys(n)) if (!(k in out)) out[k] = n[k];
    if (generated) Object.defineProperty(out, "__generated", { value: true, enumerable: false });
    return out;
  }
  // Big image textures go to localStorage, the file keeps a reference.
  function encodeNode(n) {
    if (!isObj(n.uniforms)) return n;
    let u = null;
    for (const [k, v] of Object.entries(n.uniforms)) {
      if (typeof v !== "string" || !v.startsWith("image:data:") || v.length <= BLOB_MAX) continue;
      const h = hashStr(v);
      if (ls.get(BLOB_PREFIX + h) !== v && !ls.set(BLOB_PREFIX + h, v)) continue; // no room: keep it inline
      if (!u) u = { ...n.uniforms };
      u[k] = "image:local:" + h;
    }
    return u ? { ...n, uniforms: u } : n;
  }
  function decodeNode(n) {
    if (!isObj(n.uniforms)) return n;
    let u = null;
    for (const [k, v] of Object.entries(n.uniforms)) {
      if (typeof v !== "string" || !v.startsWith("image:local:")) continue;
      const d = ls.get(BLOB_PREFIX + v.slice(12));
      if (!d) continue;
      if (!u) u = { ...n.uniforms };
      u[k] = d;
    }
    return u ? { ...n, uniforms: u } : n;
  }
  const canon = (nodes) => JSON.stringify(nodes.map(encodeNode));

  // ------------------------------------------------------------------ block
  // Index after the bracket that closes src[i] ("{" or "["), string and
  // comment aware; -1 when it does not close.
  function scanValue(src, i) {
    let depth = 0;
    let str = null;
    for (let j = i; j < src.length; j++) {
      const c = src[j];
      if (str) {
        if (c === "\\") j++;
        else if (c === str) str = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") str = c;
      else if (c === "/" && src[j + 1] === "/") {
        const n = src.indexOf("\n", j);
        if (n < 0) return -1;
        j = n;
      } else if (c === "/" && src[j + 1] === "*") {
        const n = src.indexOf("*/", j + 2);
        if (n < 0) return -1;
        j = n + 1;
      } else if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") {
        depth--;
        if (depth === 0) return j + 1;
      }
    }
    return -1;
  }
  // End of the declaration that closes at `close`: `;`, spaces, one newline.
  function declEnd(src, close) {
    let e = close;
    while (e < src.length && (src[e] === " " || src[e] === "\t")) e++;
    if (src[e] === ";") e++;
    while (e < src.length && (src[e] === " " || src[e] === "\t")) e++;
    if (src[e] === "\r") e++;
    if (src[e] === "\n") e++;
    return e;
  }
  const DECL_RE = new RegExp("(^|\\n)[ \\t]*(?:export[ \\t]+)?(?:const|let|var)[ \\t]+" + CONST_NAME + "\\b[^=\\n]*=[ \\t]*", "g");
  // {start, end, json, error} of the block in src, or null.
  function findBlock(src) {
    if (typeof src !== "string") return null;
    const ms = src.indexOf(MARK_START);
    let start = -1;
    let end = -1;
    let limit = src.length;
    if (ms >= 0) {
      start = src.lastIndexOf("\n", ms) + 1;
      const me = src.indexOf(MARK_END, ms + MARK_START.length);
      if (me >= 0) {
        const nl = src.indexOf("\n", me);
        end = nl < 0 ? src.length : nl + 1;
        limit = me;
      }
    }
    DECL_RE.lastIndex = ms >= 0 ? Math.max(0, ms - 1) : 0;
    const m = DECL_RE.exec(src);
    if (!m || m.index > limit) {
      if (ms < 0) return null;
      return { start, end: end >= 0 ? end : src.length, json: null, error: `no "const ${CONST_NAME} = {...}" between the markers` };
    }
    const declStart = m.index + m[1].length;
    const open = m.index + m[0].length;
    if (start < 0) start = declStart;
    if (src[open] !== "{" && src[open] !== "[") return { start, end: end >= 0 ? end : src.length, json: null, error: `${CONST_NAME} is not a JSON object` };
    const close = scanValue(src, open);
    if (close < 0 || close > limit) return { start, end: end >= 0 ? end : src.length, json: null, error: `${CONST_NAME} does not close` };
    if (end < 0) end = declEnd(src, close);
    return { start, end, json: src.slice(open, close), error: null };
  }
  function stripComments(t) {
    let out = "";
    let str = null;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (str) {
        out += c;
        if (c === "\\") out += t[++i] || "";
        else if (c === str) str = null;
        continue;
      }
      if (c === '"') {
        str = c;
        out += c;
      } else if (c === "/" && t[i + 1] === "/") {
        const n = t.indexOf("\n", i);
        i = n < 0 ? t.length : n - 1;
      } else if (c === "/" && t[i + 1] === "*") {
        const n = t.indexOf("*/", i + 2);
        i = n < 0 ? t.length : n + 1;
      } else out += c;
    }
    return out;
  }
  function parseLoose(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      const t = stripComments(text)
        .replace(/,(\s*[}\]])/g, "$1")
        .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":');
      try {
        return JSON.parse(t);
      } catch (_) {
        throw e;
      }
    }
  }
  // {found, text, nodes, generated, error}: text is the block's exact source.
  function readBlock(src) {
    const b = findBlock(src);
    if (!b) return { found: false, text: null, nodes: [], generated: false, error: null };
    const text = src.slice(b.start, b.end);
    if (b.error) return { found: true, text, nodes: null, generated: false, error: b.error };
    let v;
    try {
      v = parseLoose(b.json);
    } catch (e) {
      return { found: true, text, nodes: null, generated: false, error: "invalid JSON: " + msg(e) };
    }
    const list = Array.isArray(v) ? v : isObj(v) && Array.isArray(v.nodes) ? v.nodes : null;
    if (!list) return { found: true, text, nodes: null, generated: false, error: 'expected {"v": 1, "nodes": [...]}' };
    const nodes = [];
    const seen = new Set();
    let generated = false;
    list.forEach((raw, i) => {
      const n = normalizeNode(raw, i);
      if (!n || seen.has(n.id)) return;
      if (n.__generated) generated = true;
      seen.add(n.id);
      nodes.push(decodeNode(n));
    });
    return { found: true, text, nodes, generated, error: null };
  }
  // Inline JSON with a space after ":" and ",".
  function inline(v) {
    if (Array.isArray(v)) return "[" + v.map(inline).join(", ") + "]";
    if (isObj(v)) return "{" + Object.keys(v).map((k) => JSON.stringify(k) + ": " + inline(v[k])).join(", ") + "}";
    return JSON.stringify(v === undefined ? null : v);
  }
  function renderBlock(nodes, eol) {
    const nl = eol || "\n";
    const body = nodes.length
      ? "[" + nl + nodes.map((n) => {
          const e = encodeNode(n);
          const val = (v) => (Array.isArray(v) && v.length && v.every(isObj) ? "[" + nl + v.map((x) => "        " + inline(x)).join("," + nl) + nl + "      ]" : inline(v));
          return "    {" + nl + Object.keys(e).map((k) => "      " + JSON.stringify(k) + ": " + val(e[k])).join("," + nl) + nl + "    }";
        }).join("," + nl) + nl + "  ]"
      : "[]";
    // The marker word never appears inside a value (a title, a URL...).
    const json = ("{" + nl + '  "v": ' + VERSION + "," + nl + '  "nodes": ' + body + nl + "}").split(MARK_WORD).join("@re\\u002dtempo-canvas-nodes");
    // The void line reads the const: the app's page check (validatePage, a tsc
    // run with the project's tsconfig) reports TS6133 under noUnusedLocals.
    return [MARK_START, ...BLOCK_NOTE, `const ${CONST_NAME} = ${json};`, `void ${CONST_NAME}; // read once, for noUnusedLocals`, MARK_END].join(nl);
  }
  // src with the block set to nodes (appended, replaced, or removed when empty).
  function splice(src, nodes) {
    const eol = src.includes("\r\n") ? "\r\n" : "\n";
    const b = findBlock(src);
    if (!nodes.length) {
      if (!b) return src;
      const before = src.slice(0, b.start).replace(/\r?\n[ \t]*\r?\n$/, eol);
      return before + src.slice(b.end);
    }
    if (b && b.error) throw new Error("the canvas nodes block does not parse: " + b.error);
    const text = renderBlock(nodes, eol);
    if (b) {
      const old = src.slice(b.start, b.end);
      return src.slice(0, b.start) + text + (/\n$/.test(old) ? eol : "") + src.slice(b.end);
    }
    return src.replace(/\s+$/, "") + eol + eol + text + eol;
  }

  // ---------------------------------------------------------------- backend
  // The app's own bridge for this file: electronAPI.sourceEditor (+ fileWatcher).
  function appBackend() {
    const api = window.electronAPI;
    const se = api && api.sourceEditor;
    if (!se || typeof se.writeSourceFile !== "function") return null;
    if (typeof se.readSourceFileIfExists !== "function" && typeof se.readSourceFile !== "function") return null;
    const fw = api.fileWatcher;
    return {
      name: "sourceEditor",
      async read(ws, rel) {
        let r;
        if (typeof se.readSourceFileIfExists === "function") r = await se.readSourceFileIfExists(ws, rel);
        else
          try {
            r = await se.readSourceFile(ws, rel);
          } catch (_) {
            r = null;
          }
        return r && typeof r.content === "string" ? { content: r.content, mtime: r.mtime == null ? null : r.mtime } : null;
      },
      async write(ws, rel, content, mtime) {
        return (await se.writeSourceFile(ws, rel, content, mtime == null ? undefined : mtime)) || {};
      },
      onChange: fw && typeof fw.onChange === "function" ? (cb) => fw.onChange(cb) : null,
      onInvalidated: fw && typeof fw.onInvalidated === "function" ? (cb) => fw.onInvalidated(cb) : null,
    };
  }
  let backend = null;
  let backendOffs = [];
  function useBackend(b) {
    for (const off of backendOffs)
      try {
        if (typeof off === "function") off();
      } catch (_) {}
    backendOffs = [];
    backend = b || null;
    if (!backend) return;
    try {
      if (backend.onChange) backendOffs.push(backend.onChange(onFsChange));
      if (backend.onInvalidated) backendOffs.push(backend.onInvalidated(onFsInvalidated));
    } catch (e) {
      warn("watcher", msg(e));
    }
  }
  const available = () => !!backend && flagOn();

  // ------------------------------------------------------------------- docs
  const docs = new Map(); // workspacePath \0 canvasPath -> doc
  const types = new Map(); // type -> {keys: Set, fromLegacy}
  const stats = { reads: 0, writes: 0, stale: 0, conflicts: 0, external: 0, parseErrors: 0, migrated: 0 };
  function ensureDoc(ws, canvasPath) {
    const w = normPath(ws);
    const p = cleanPath(canvasPath);
    const key = w + "\0" + p;
    let d = docs.get(key);
    if (!d) {
      d = {
        key,
        ws: w,
        path: p,
        rel: p + "/" + CANVAS_FILE,
        nodes: [],
        loaded: false,
        loading: null,
        content: null,
        mtime: null,
        found: false,
        baseText: null, // the block's source as last read or written
        baseCanon: "[]", // its nodes
        dirty: false,
        invalid: false,
        error: null,
        timer: null,
        refreshTimer: null,
        writing: null,
        again: false,
        refreshAfterWrite: false,
        pending: [], // sets made before the first read
        subs: new Set(),
        lastWriteAt: 0,
        lastReadAt: 0,
        migration: null,
        migrating: false,
      };
      docs.set(key, d);
    }
    return d;
  }
  const nodesOf = (doc, type) => doc.nodes.filter((n) => !type || n.type === type).map(clone);
  const pubDoc = (d) => ({
    workspacePath: d.ws,
    canvasPath: d.path,
    file: d.rel,
    loaded: d.loaded,
    found: d.found,
    nodes: d.nodes.length,
    byType: d.nodes.reduce((a, n) => ((a[n.type] = (a[n.type] || 0) + 1), a), {}),
    dirty: d.dirty,
    writing: !!d.writing,
    invalid: d.invalid,
    error: d.error,
    subscribers: d.subs.size,
    mtime: d.mtime,
    lastWriteAt: d.lastWriteAt,
    lastReadAt: d.lastReadAt,
    migration: d.migration,
  });
  function notify(doc, token) {
    for (const s of Array.from(doc.subs)) {
      if (token && s.token === token) continue;
      try {
        s.cb(nodesOf(doc, s.type), { source: token ? "pane" : "file" });
      } catch (e) {
        warn("subscriber", msg(e));
      }
    }
    fire("rtd:canvas-nodes-changed", { workspacePath: doc.ws, canvasPath: doc.path, nodes: doc.nodes.length });
  }
  // Take the file's content as the truth. false when the block does not parse.
  function adopt(doc, cur) {
    doc.content = cur.content;
    doc.mtime = cur.mtime;
    doc.lastReadAt = Date.now();
    const r = readBlock(cur.content);
    doc.found = r.found;
    doc.baseText = r.text;
    if (r.error) {
      doc.invalid = true;
      doc.error = r.error;
      stats.parseErrors++;
      return false;
    }
    doc.invalid = false;
    doc.error = null;
    doc.nodes = r.nodes;
    doc.baseCanon = canon(r.nodes);
    doc.dirty = false;
    if (r.generated) {
      // stable ids for nodes written without one
      doc.dirty = true;
      scheduleWrite(doc);
    }
    return true;
  }
  function load(doc) {
    if (doc.loaded) return Promise.resolve(doc);
    if (doc.loading) return doc.loading;
    doc.loading = (async () => {
      try {
        if (!backend) {
          doc.error = "no file bridge";
          return doc;
        }
        let cur;
        try {
          cur = await backend.read(doc.ws, doc.rel);
        } catch (e) {
          doc.error = "read failed: " + msg(e);
          return doc;
        }
        stats.reads++;
        if (!cur) {
          doc.error = "canvas file not found: " + doc.rel;
          return doc;
        }
        adopt(doc, cur);
        doc.loaded = true;
        // sets made before the file was read only add or update: they never
        // saw the frames already in the file
        for (const [type, list, token] of doc.pending.splice(0)) setNodes(doc, type, list, token, true, true);
        await migrate(doc);
        notify(doc, null);
        return doc;
      } finally {
        doc.loading = null;
      }
    })();
    return doc.loading;
  }
  function scheduleWrite(doc, ms) {
    clearTimeout(doc.timer);
    doc.timer = setTimeout(() => {
      doc.timer = null;
      flush(doc);
    }, ms == null ? WRITE_MS : ms);
  }
  function scheduleRefresh(doc, ms) {
    if (doc.refreshTimer) return;
    doc.refreshTimer = setTimeout(() => {
      doc.refreshTimer = null;
      refresh(doc);
    }, ms == null ? RELOAD_MS : ms);
  }
  // The block on disk changed under us: the file wins.
  function takeDisk(doc, cur, r) {
    if (doc.dirty) stats.conflicts++;
    stats.external++;
    clearTimeout(doc.timer);
    doc.timer = null;
    doc.content = cur.content;
    doc.mtime = cur.mtime;
    doc.lastReadAt = Date.now();
    doc.baseText = r.text;
    doc.found = r.found;
    doc.invalid = false;
    doc.error = null;
    doc.nodes = r.nodes;
    doc.baseCanon = canon(r.nodes);
    doc.dirty = false;
    notify(doc, null);
    if (r.generated) {
      doc.dirty = true;
      scheduleWrite(doc);
    }
  }
  async function refresh(doc) {
    if (!backend) return;
    if (!doc.loaded) return void (await load(doc));
    if (doc.writing) {
      doc.refreshAfterWrite = true;
      return;
    }
    let cur;
    try {
      cur = await backend.read(doc.ws, doc.rel);
    } catch (_) {
      return;
    }
    stats.reads++;
    if (!cur || doc.writing) return;
    if (cur.content === doc.content) {
      doc.mtime = cur.mtime;
      return;
    }
    const r = readBlock(cur.content);
    doc.content = cur.content;
    doc.mtime = cur.mtime;
    doc.lastReadAt = Date.now();
    if (r.text === doc.baseText) return; // only the storyboards (or other code) changed
    if (r.error) {
      // an agent mid-edit: keep the frames, never overwrite it
      doc.baseText = r.text;
      doc.invalid = true;
      doc.error = r.error;
      stats.parseErrors++;
      return;
    }
    const wasInvalid = doc.invalid;
    if (!wasInvalid && canon(r.nodes) === doc.baseCanon) {
      // same nodes, formatted differently
      doc.baseText = r.text;
      return;
    }
    takeDisk(doc, cur, r);
  }
  async function flush(doc) {
    clearTimeout(doc.timer);
    doc.timer = null;
    if (doc.writing) {
      doc.again = true;
      return doc.writing;
    }
    if (!doc.dirty || !backend || !doc.loaded || doc.invalid) return false;
    const run = async () => {
      let cur = null;
      for (let i = 0; i < WRITE_TRIES; i++) {
        if (!cur) {
          try {
            cur = await backend.read(doc.ws, doc.rel);
          } catch (e) {
            doc.error = "read failed: " + msg(e);
            return false;
          }
          stats.reads++;
        }
        if (!cur) {
          doc.error = "canvas file not found: " + doc.rel;
          return false;
        }
        const r = readBlock(cur.content);
        if (r.text !== doc.baseText) {
          if (r.error) {
            doc.content = cur.content;
            doc.mtime = cur.mtime;
            doc.baseText = r.text;
            doc.invalid = true;
            doc.error = r.error;
            stats.conflicts++;
            stats.parseErrors++;
            return false;
          }
          if (canon(r.nodes) !== doc.baseCanon) {
            takeDisk(doc, cur, r);
            return false;
          }
        }
        const snap = doc.nodes.slice();
        const snapCanon = canon(snap);
        const next = splice(cur.content, snap);
        if (next === cur.content) {
          doc.content = cur.content;
          doc.mtime = cur.mtime;
          doc.baseText = readBlock(next).text;
          doc.baseCanon = snapCanon;
          if (canon(doc.nodes) === snapCanon) doc.dirty = false;
          return true;
        }
        let res;
        try {
          res = await backend.write(doc.ws, doc.rel, next, cur.mtime);
        } catch (e) {
          doc.error = "write failed: " + msg(e);
          return false;
        }
        if (res && res.stale) {
          stats.stale++;
          cur = typeof res.content === "string" ? { content: res.content, mtime: res.mtime == null ? null : res.mtime } : null;
          continue;
        }
        stats.writes++;
        doc.content = next;
        doc.mtime = res && res.mtime != null ? res.mtime : null;
        doc.lastWriteAt = Date.now();
        doc.baseText = readBlock(next).text;
        doc.baseCanon = snapCanon;
        doc.found = snap.length > 0;
        doc.error = null;
        if (canon(doc.nodes) === snapCanon) doc.dirty = false;
        else doc.again = true;
        return true;
      }
      doc.error = "the canvas file kept changing during the write";
      return false;
    };
    const p = run();
    doc.writing = p;
    let ok = false;
    try {
      ok = await p;
    } finally {
      doc.writing = null;
      if (doc.again) {
        doc.again = false;
        if (doc.dirty) scheduleWrite(doc, 0);
      }
      if (doc.refreshAfterWrite) {
        doc.refreshAfterWrite = false;
        scheduleRefresh(doc);
      }
    }
    return ok;
  }
  // Write now and wait until nothing is pending (a write in flight included).
  async function flushNow(doc) {
    for (let i = 0; i < 4; i++) {
      if (doc.writing) await doc.writing;
      else if (doc.dirty && !doc.invalid) await flush(doc);
      else break;
    }
    return !doc.dirty;
  }
  // Replace the nodes of one type (a mod's frames), keeping the fields the mod
  // does not know (an agent's additions) and the other types.
  function setNodes(doc, type, list, token, quiet, mergeOnly) {
    if (!doc.loaded) {
      doc.pending.push([type, list, token]);
      load(doc);
      return false;
    }
    const keys = (types.get(type) || {}).keys || null;
    const prev = new Map(doc.nodes.filter((n) => n.type === type).map((n) => [n.id, n]));
    const next = new Map();
    for (const raw of Array.isArray(list) ? list : []) {
      const n = normalizeNode({ ...raw, type });
      if (!n) continue;
      const p = prev.get(n.id);
      if (p && keys) for (const k of Object.keys(p)) if (!(k in n) && !keys.has(k)) n[k] = p[k];
      next.set(n.id, n);
    }
    const out = [];
    for (const n of doc.nodes) {
      if (n.type !== type) out.push(n);
      else if (next.has(n.id)) {
        out.push(next.get(n.id));
        next.delete(n.id);
      } else if (mergeOnly) out.push(n);
    }
    for (const n of next.values()) out.push(n);
    if (canon(out) === canon(doc.nodes)) return false;
    doc.nodes = out;
    doc.dirty = true;
    scheduleWrite(doc);
    if (!quiet) notify(doc, token);
    return true;
  }

  // -------------------------------------------------------------- migration
  const GENERIC_LEGACY = {
    browser: (f) => ({ id: f.id, x: f.x, y: f.y, w: f.w, h: f.h, url: typeof f.url === "string" ? f.url : "", title: typeof f.title === "string" ? f.title : "", titled: f.titled === true, z: f.z }),
    shader: (f) => ({ id: f.id, x: f.x, y: f.y, w: f.w, h: f.h, preset: f.preset, glsl: f.glsl, uniforms: isObj(f.uniforms) ? f.uniforms : {}, title: f.named && typeof f.name === "string" ? f.name : "", speed: f.speed, paused: f.paused === true, z: f.z }),
  };
  // Per type, and only for a type whose mod registered it (registerType): a
  // mod that still reads localStorage never loses its frames to the file.
  // true when nodes were added to the file.
  async function migrate(doc) {
    if (doc.invalid || doc.migrating) return false;
    const mk = MIGRATED_PREFIX + doc.path;
    let mark = null;
    const prev = ls.get(mk);
    if (prev != null)
      try {
        mark = JSON.parse(prev);
      } catch (_) {
        mark = {};
      }
    // a marker without "types" (older format) covered every type
    const done = new Set(mark ? (Array.isArray(mark.types) ? mark.types : Object.keys(LEGACY_PREFIX)) : []);
    const todo = Object.keys(LEGACY_PREFIX).filter((t) => !done.has(t) && types.has(t) && ls.get(LEGACY_PREFIX[t] + doc.path) != null);
    if (!todo.length) return false;
    doc.migrating = true;
    try {
      const raw = {};
      const found = [];
      for (const type of todo) {
        const v = ls.get(LEGACY_PREFIX[type] + doc.path);
        raw[type] = v;
        let frames = [];
        try {
          const o = JSON.parse(v);
          frames = o && Array.isArray(o.frames) ? o.frames : [];
        } catch (_) {}
        const conv = types.get(type).fromLegacy || GENERIC_LEGACY[type];
        for (const f of frames) {
          let n = null;
          try {
            n = normalizeNode({ ...conv(f), type });
          } catch (_) {}
          if (n) found.push(n);
        }
      }
      const ids = new Set(doc.nodes.map((n) => n.id));
      const add = found.filter((n) => !ids.has(n.id));
      if (add.length) {
        doc.nodes = doc.nodes.concat(add);
        doc.dirty = true;
        await flushNow(doc);
        if (doc.dirty || !doc.nodes.some((n) => n === add[0])) return false; // not written (or the file won): next load
      }
      const m = mark || {};
      const backup = {
        t: Date.now(),
        workspacePath: doc.ws,
        file: doc.rel,
        types: Array.from(new Set([...done, ...todo])),
        added: [...(Array.isArray(m.added) ? m.added : []), ...add.map((n) => n.id)],
        browser: m.browser != null ? m.browser : raw.browser == null ? null : raw.browser,
        shader: m.shader != null ? m.shader : raw.shader == null ? null : raw.shader,
      };
      if (ls.set(mk, JSON.stringify(backup))) {
        for (const type of todo) ls.del(LEGACY_PREFIX[type] + doc.path);
      } else {
        // no room for the copy: the old keys stay as the backup
        ls.set(mk, JSON.stringify({ t: backup.t, workspacePath: doc.ws, file: doc.rel, types: backup.types, added: backup.added, backup: "kept in the old keys (storage full)" }));
      }
      stats.migrated += add.length;
      doc.migration = { added: add.length, types: todo, at: backup.t };
      return add.length > 0;
    } finally {
      doc.migrating = false;
    }
  }

  // --------------------------------------------------------------- watching
  function onFsChange(changes) {
    const list = Array.isArray(changes) ? changes : [changes];
    for (const doc of docs.values()) {
      if (!doc.loaded) continue;
      const abs = normPath(doc.ws + "/" + doc.rel);
      const hit = list.some((c) => {
        if (!c) return false;
        if (typeof c === "string") return normPath(c) === abs || cleanPath(c) === doc.rel;
        if (typeof c.path === "string" && normPath(c.path) === abs) return true;
        return typeof c.relativePath === "string" && c.relativePath.replace(/\\/g, "/").replace(/^\/+/, "") === doc.rel;
      });
      if (hit) scheduleRefresh(doc);
    }
  }
  function onFsInvalidated(e) {
    const p = normPath(e && e.projectPath);
    for (const doc of docs.values()) if (doc.loaded && (!p || doc.ws === p)) scheduleRefresh(doc);
  }
  let pollTimer = null;
  function ensurePolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      for (const d of docs.values()) if (d.subs.size && d.loaded) refresh(d);
    }, POLL_MS);
  }
  window.addEventListener("focus", () => {
    for (const d of docs.values()) if (d.subs.size && d.loaded) scheduleRefresh(d, 0);
  });
  window.addEventListener("tempo:canvas:page-config-saved", (e) => {
    const p = cleanPath(e && e.detail && e.detail.pageFolderPath);
    for (const d of docs.values()) if (d.loaded && d.path === p) scheduleRefresh(d);
  });
  window.addEventListener("pagehide", () => {
    for (const d of docs.values()) if (d.dirty) flush(d);
  });

  // ----------------------------------------------------------------- canvas
  const fiberOf = (node) => {
    if (!node) return null;
    const k = Object.keys(node).find((x) => x.startsWith("__reactFiber$"));
    return k ? node[k] : null;
  };
  // {canvasPath, workspacePath} of a [data-canvas-root] (the canvas surface
  // gets both props: canvasPath is the page folder).
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
    return cp ? { canvasPath: cp, workspacePath } : null;
  }
  function activeRef() {
    let fallback = null;
    for (const r of document.querySelectorAll(CANVAS_ROOT)) {
      const ref = refOf(r);
      if (!ref || !ref.workspacePath) continue;
      if (isShown(r)) return ref;
      if (!fallback) fallback = ref;
    }
    return fallback;
  }
  // The doc a public call means: canvasPath (+ workspacePath), else the
  // canvas on screen.
  function target(canvasPath, workspacePath) {
    let ws = workspacePath ? normPath(workspacePath) : null;
    let cp = canvasPath ? String(canvasPath).replace(/\\/g, "/") : null;
    if (!cp) {
      const a = activeRef();
      if (!a) return null;
      cp = a.canvasPath;
      ws = ws || normPath(a.workspacePath);
    }
    if (cp.startsWith("/")) {
      const n = normPath(cp);
      const owner = ws ? [ws] : Array.from(new Set(Array.from(docs.values()).map((d) => d.ws)));
      const hit = owner.find((w) => n.startsWith(w + "/"));
      if (hit) {
        ws = hit;
        cp = n.slice(hit.length + 1);
      }
    }
    cp = cleanPath(cp);
    if (!ws) {
      const known = Array.from(docs.values()).filter((d) => d.path === cp);
      const live = known.find((d) => d.subs.size) || known[0];
      if (live) ws = live.ws;
      else {
        const a = activeRef();
        ws = a && a.workspacePath ? normPath(a.workspacePath) : null;
      }
    }
    return ws && cp ? ensureDoc(ws, cp) : null;
  }

  // -------------------------------------------------------------------- api
  function registerType(type, spec) {
    if (typeof type !== "string" || !type) return false;
    const s = spec || {};
    types.set(type, { keys: new Set(["id", "type", ...(Array.isArray(s.keys) ? s.keys : [])]), fromLegacy: typeof s.fromLegacy === "function" ? s.fromLegacy : null });
    return true;
  }
  function attach(o) {
    if (!available() || !o || !o.workspacePath || !o.canvasPath || typeof o.onNodes !== "function") return null;
    const doc = ensureDoc(o.workspacePath, o.canvasPath);
    const sub = { type: o.type || null, cb: o.onNodes, token: o.token || {} };
    doc.subs.add(sub);
    ensurePolling();
    if (doc.loaded) {
      Promise.resolve().then(() => {
        if (doc.subs.has(sub)) sub.cb(nodesOf(doc, sub.type), { source: "cache" });
      });
      scheduleRefresh(doc, 0);
      // a type registered after the first read migrates now
      migrate(doc).then((added) => added && notify(doc, null));
    } else load(doc);
    return {
      key: doc.key,
      get loaded() {
        return doc.loaded;
      },
      set: (list) => setNodes(doc, sub.type, list, sub.token),
      flush: () => flush(doc),
      detach() {
        doc.subs.delete(sub);
        if (doc.dirty) flush(doc);
      },
      state: () => pubDoc(doc),
    };
  }
  async function upsertImpl(node) {
    if (!isObj(node)) throw new Error("node must be an object");
    const doc = target(node.canvasPath, node.workspacePath);
    if (!doc) throw new Error("no canvas: pass canvasPath (and workspacePath) or open a canvas");
    await load(doc);
    if (!doc.loaded) throw new Error(doc.error || "the canvas file could not be read");
    if (doc.invalid) throw new Error("the canvas nodes block does not parse (" + doc.error + "); fix it in " + doc.rel);
    const hasId = typeof node.id === "string" ? !!node.id : fin(node.id);
    const existing = hasId ? doc.nodes.find((n) => n.id === String(node.id)) : null;
    // an update by id may leave the type out
    const given = normalizeNode(existing && !node.type ? { ...node, type: existing.type } : node);
    if (!given) throw new Error('node needs a "type" (browser, shader, ...)');
    const i = hasId ? doc.nodes.findIndex((n) => n.id === given.id) : -1;
    const previous = i >= 0 ? clone(doc.nodes[i]) : null;
    const merged = normalizeNode(previous ? { ...doc.nodes[i], ...given } : given);
    doc.nodes = i >= 0 ? doc.nodes.map((n, j) => (j === i ? merged : n)) : doc.nodes.concat([merged]);
    doc.dirty = true;
    notify(doc, null);
    await flushNow(doc);
    const now = doc.nodes.find((n) => n.id === merged.id);
    if (!now || canon([now]) !== canon([merged])) throw new Error(doc.error || "the canvas file changed on disk before the write (the file wins); read it again and retry");
    return { node: clone(merged), previous, doc };
  }
  async function removeImpl(id, canvasPath, workspacePath) {
    const sid = String(id == null ? "" : id);
    if (!sid) throw new Error("id is required");
    const list = canvasPath || workspacePath ? [target(canvasPath, workspacePath)] : [target(null), ...docs.values()];
    for (const doc of list) {
      if (!doc) continue;
      if (!doc.loaded) await load(doc);
      const i = doc.nodes.findIndex((n) => n.id === sid);
      if (i < 0) continue;
      if (doc.invalid) throw new Error("the canvas nodes block does not parse (" + doc.error + ")");
      const node = clone(doc.nodes[i]);
      doc.nodes = doc.nodes.filter((_, j) => j !== i);
      doc.dirty = true;
      notify(doc, null);
      await flushNow(doc);
      if (doc.nodes.some((n) => n.id === sid)) throw new Error(doc.error || "the canvas file changed on disk before the write (the file wins); read it again and retry");
      return { node, doc };
    }
    return null;
  }
  function list(canvasPath, workspacePath) {
    const doc = target(canvasPath, workspacePath);
    if (!doc) return [];
    if (!doc.loaded) load(doc);
    return nodesOf(doc, null).map((n) => ({ ...n, canvasPath: doc.path }));
  }
  async function reload(canvasPath, workspacePath) {
    const all = canvasPath || workspacePath ? [target(canvasPath, workspacePath)] : Array.from(docs.values());
    for (const d of all) if (d) await refresh(d);
    return all.filter(Boolean).map(pubDoc);
  }
  async function flushAll() {
    const r = [];
    for (const d of docs.values()) if (d.dirty || d.writing) r.push(await flushNow(d));
    return r;
  }
  const EXAMPLE = [
    { id: "bf_docs", type: "browser", x: 1400, y: 0, w: 1280, h: 840, url: "https://example.com/", title: "Example", titled: true },
    { id: "sf_hero", type: "shader", x: 0, y: 960, w: 800, h: 500, preset: "aurora", uniforms: {}, title: "" },
    { id: "sb_Home", type: "storyboard", storyboard: "Home", effects: [{ id: "fx_glow", type: "shader", mode: "overlay", preset: "mesh", uniforms: {}, opacity: 0.6, blend: "screen" }] },
  ];
  function format() {
    return {
      version: VERSION,
      file: "<workspacePath>/<canvasPath>/" + CANVAS_FILE + " (canvasPath: the canvas folder, e.g. tempo/designs/canvases/home)",
      marker: [MARK_START, MARK_END],
      constName: CONST_NAME,
      placement: "a plain (not exported) const at module level, outside <Canvas>, at the end of the file; its value is JSON",
      types: {
        browser: {
          fields: { id: "string, unique", type: '"browser"', x: "number", y: "number", w: "number (min 320)", h: "number (min 200)", url: 'http(s) or file URL, "" = URL prompt', title: "name over the frame" },
          optional: { titled: "false = the title follows the page title (default true when a title is given)", z: "stacking order among frames" },
        },
        shader: {
          fields: { id: "string, unique", type: '"shader"', x: "number", y: "number", w: "number (min 64)", h: "number (min 64)", preset: "canvas-shader preset id", uniforms: "{name: number | boolean | number[] | \"#hex\" | \"pattern:<id>\" | \"image:data:...\"}", title: '"" = the preset label' },
          optional: { glsl: "GLSL ES 3.00 (one out vec4) or 1.00 fragment source; omitted = the preset's", speed: "0..4, default 1", paused: "boolean", z: "stacking order among frames" },
        },
        storyboard: {
          fields: { id: '"sb_<storyboard id>"', type: '"storyboard"', storyboard: "the id of a storyboard of this canvas", effects: "shader effects, in drawing order" },
          effect: { id: "string, unique", type: '"shader"', mode: '"background" (under the storyboard content) | "overlay" (over it)', preset: "canvas-shader preset id", glsl: "optional, as for a shader frame", uniforms: "as for a shader frame", opacity: "0..1", blend: "CSS mix-blend-mode for overlays (normal, multiply, screen, overlay, ...)" },
        },
      },
      rules: [
        "Coordinates are canvas units, the same space as the storyboards' layout={{ x, y, width, height }}.",
        "Unknown types and fields are kept; a node without an id gets a stable one written back.",
        "The file on disk wins over unsaved changes in the app; a block that does not parse is left alone until it does.",
        "Do not put the frames inside <Canvas>: the app only accepts storyboard children there.",
      ],
      example: renderBlock(EXAMPLE, "\n"),
    };
  }
  function state() {
    return {
      version: VERSION,
      available: available(),
      backend: backend ? backend.name || "custom" : null,
      types: Array.from(types.keys()),
      stats: { ...stats },
      docs: Array.from(docs.values()).map(pubDoc),
    };
  }

  // ---------------------------------------------------------------- actions
  const ACTIONS = [
    [
      "canvas.node.upsert",
      {
        owner: "canvas-nodes",
        kind: "canvas",
        risk: "caution",
        label: (a) => (a && a.node && a.node.id ? `Updating canvas node ${a.node.id}` : `Adding a ${(a && a.node && a.node.type) || "canvas"} node to the canvas`),
        description: "Create or update a browser or shader frame in the canvas file's reTempoCanvasNodes block (index.canvas.tsx). node = {id?, type, x, y, w, h, ...}; fields not given are kept. Format: window.__RE_TEMPO_CANVAS_NODES__.format().",
        params: [
          { name: "node", type: "json", required: true, description: '{id?, type: "browser" | "shader", x, y, w, h, url | preset, ...}' },
          { name: "canvasPath", type: "string", description: "canvas folder (default: the canvas on screen)" },
        ],
        validate: (a) => (isObj(a && a.node) ? null : "node must be a JSON object"),
        async run(a) {
          const r = await upsertImpl({ ...a.node, ...(a.canvasPath ? { canvasPath: a.canvasPath } : {}) });
          return { node: r.node, created: !r.previous, previous: r.previous, canvasPath: r.doc.path, workspacePath: r.doc.ws };
        },
        async undo(a, { result }) {
          if (!result || !result.node) return false;
          if (result.previous) {
            await upsertImpl({ ...result.previous, canvasPath: result.canvasPath, workspacePath: result.workspacePath });
            return true;
          }
          return !!(await removeImpl(result.node.id, result.canvasPath, result.workspacePath));
        },
      },
    ],
    [
      "canvas.node.remove",
      {
        owner: "canvas-nodes",
        kind: "canvas",
        risk: "caution",
        label: (a) => `Removing canvas node ${(a && a.id) || ""}`.trim(),
        description: "Remove a browser or shader frame from the canvas file's reTempoCanvasNodes block by id.",
        params: [
          { name: "id", type: "string", required: true },
          { name: "canvasPath", type: "string", description: "canvas folder (default: any open canvas that has the id)" },
        ],
        async run(a) {
          const r = await removeImpl(a.id, a.canvasPath);
          if (!r) throw new Error("no canvas node with id " + a.id);
          return { removed: true, node: r.node, canvasPath: r.doc.path, workspacePath: r.doc.ws };
        },
        async undo(a, { result }) {
          if (!result || !result.node) return false;
          await upsertImpl({ ...result.node, canvasPath: result.canvasPath, workspacePath: result.workspacePath });
          return true;
        },
      },
    ],
  ];
  function registerActions() {
    const reg = window.__RE_TEMPO_ACTIONS__;
    if (reg && typeof reg.register === "function") {
      for (const [id, spec] of ACTIONS) reg.register(id, spec);
      return "registry";
    }
    if (!window.__RE_TEMPO_ACTIONS_PENDING__) window.__RE_TEMPO_ACTIONS_PENDING__ = [];
    const q = window.__RE_TEMPO_ACTIONS_PENDING__;
    if (q && typeof q.push === "function") q.push(...ACTIONS);
    return "pending";
  }

  // ------------------------------------------------------------------- boot
  useBackend(appBackend());
  window.__RE_TEMPO_CANVAS_NODES__ = {
    version: VERSION,
    list,
    upsert: async (node) => (await upsertImpl(node)).node,
    remove: async (id, canvasPath, workspacePath) => !!(await removeImpl(id, canvasPath, workspacePath)),
    format,
    flush: flushAll,
    reload,
    state,
    refOf,
    available,
    registerType,
    attach,
    setBackend(b) {
      useBackend(b);
      return !!backend;
    },
    // pure helpers, for tests and tools
    block: { find: findBlock, read: readBlock, render: renderBlock, splice },
  };
  registerActions();
  fire("rtd:canvas-nodes-ready", { api: window.__RE_TEMPO_CANVAS_NODES__ });
})();
