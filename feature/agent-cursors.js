/*
 * RE-TEMPO · agent-cursors (user MOD layer)
 * ---------------------------------------------------------------------------
 * Multiplayer-style cursors for the Claude agents working on a canvas: every
 * comment task (canvas-comment-agent) that is running or waiting for an
 * answer, and every ordinary chat that runs while it edits a canvas on
 * screen, gets an arrow and a name tag on that canvas, in that agent's colour.
 *
 * What pen.dev (Pencil) does, researched 2026-10-18 (docs.pencil.dev
 * core-concepts/ai-agents, Peter Yang / Tom Krcha posts, mafazr review):
 *   1. Each agent has its own named cursor, a "human-like presence with real cursors"; colours and label text are not documented.
 *   2. You watch agents "move around the canvas, placing elements": the cursor goes where the agent writes the .pen file; easing and the end of a run are not documented.
 *   3. Up to 6 agents run in parallel (swarm mode: "Split Work" / "Side by Side"), each with its own model and conversation.
 *   4. Clicking a cursor is not documented; the Agent tab lists each agent's conversation with "Stop all" / "Stop current".
 *   5. Humans keep editing other frames while agents work, so the cursors never block input.
 *
 * What this mod does with that:
 *   - Look: a Figma-multiplayer arrow (white edge, soft shadow) and a tag
 *     "Claude · #N" (#N = the request number of the comment bubble; without
 *     a bubble, the next number after the last known one), or the
 *     model ("Opus 5.5 · #N") when the task has one; a chat agent's tag is
 *     "Claude · <chat title>" (its model when the chat tab has one: "Opus 5.5 ·
 *     New Chat"). One stable colour per agent (lowest slot of 8 that no live
 *     agent holds, Claude terracotta first; remembered in localStorage
 *     "rtd.agentCursors.colors"), the same for its tag, its selections and,
 *     through colorOf(), the avatar comment-bubbles draws.
 *   - Birth: a freshly launched task (the canvas composer's Enter, a new
 *     comment) gets its cursor out of its avatar. A launched one
 *     ("rtcc:launch" {taskId, text, rect, pin?}: canvas-chrome's composer,
 *     canvas-comment-agent on a comment's Enter) pops out 50 ms after its
 *     task appears, while the avatar still enters (comment-bubbles); other
 *     fresh tasks (first seen younger than 8 s) on "rtcb:avatar-in" or after
 *     380 ms. Source: the avatar `[data-rtcb-host] .rtcb-bubble[data-id]`
 *     (else any .rtcb-bubble of that task); none on screen within 0.7 s: the
 *     comment's pin (a short hop), else the launch's field, else the
 *     composer rect. A comment's pin pulses in the agent's colour (two rings
 *     and a glow, 0.64 s) as soon as canvas-comment-agent's "before" capture
 *     is over ("rtcc:captured", the pins hide during it; 0.3 s at most). The
 *     arrow
 *     pops out of the avatar's centre (scale, a ring in its colour), flies on
 *     an arc over the whole interface (a fixed layer above everything, never
 *     clipped by the canvas view) with a short comet trail and a glow, the
 *     name tag unfolding on the way, and lands on the task's anchor (the
 *     selection; the view centre without one), clamped into the visible
 *     canvas (a comment's: just right of its pin's bubble, never over it);
 *     from then on it lives in canvas coordinates. An anchor on a storyboard
 *     is then clicked and selected.
 *   - Stream (a comment task): every tool call of its agent
 *     (canvas-comment-agent's "rtcc:activity") is the cursor's caption at
 *     once, a small pill under its tag ("Reading Hero.tsx", "Styling
 *     Hero.tsx"; "Starting" while queued and "Thinking" with three dots
 *     between calls, 1.6 s after a call ends; "Needs your answer", "Done",
 *     "Stopped" / "Couldn't finish"). A call that changes the canvas (edit,
 *     style, create, canvas, layout, node, click, shot) is also an action, in
 *     the same queue as the changes below: the cursor goes to its target and
 *     clicks it, selecting it in its colour: tempo-ui's node id or x / y,
 *     else the storyboard its file or the canvas edit names (header text),
 *     a screenshot / layout pass what it last worked on, else the comment's
 *     storyboard, else its pin. While an action plays, the caption is that
 *     action's ("Adding Red Square", "Moving Hero"), the stream's again after.
 *   - Actions: every change the agent makes on screen becomes an action of
 *     its cursor, queued, one at a time (at most 4 waiting; a long queue
 *     plays faster), each one an eased path plus the gesture:
 *       draw  a new storyboard, a new canvas-nodes frame (note, shader,
 *             browser) or a new element inside a storyboard: the cursor
 *             presses on the top-left corner and drags a rectangle in its
 *             colour to the final size ("W × H" under it) while the content
 *             is revealed inside it;
 *       box   a storyboard / frame moved or resized: the cursor grabs it
 *             (near its top-left for a move, the bottom-right handle for a
 *             resize) and drags it from the old box to the new one;
 *       edit  a change inside a storyboard's same-origin document on a known
 *             element: the cursor goes to it, clicks (press + ripple) and the
 *             element gets a selection box;
 *       focus anything else on a storyboard: a click and the storyboard
 *             selected.
 *     Selections (pen.dev / Figma): an outline in the agent's colour, white
 *     corner handles and the agent's tag on top; one per agent, kept while it
 *     works on that element and faded 2.6 s after its last change there (or
 *     as soon as it selects something else). Tags of overlapping selections
 *     are moved aside; a cursor heading where another one is goes a bit off.
 *     The change itself is held back until the gesture shows it, with Web
 *     Animations only (clip-path / transform keyframes on the element, no
 *     inline style): a hold lasts at most 1.15 s whatever happens, so nothing
 *     is ever hidden longer than that.
 *   - needs-input: an amber "?" balloon next to the tag; no idling.
 *   - done: the check in the tag; a comment's cursor first goes back to its
 *     pin ("Done"), then flies back into its avatar and vanishes in it (fades
 *     in place when the avatar is not on screen);
 *     failed: "!" and a fade; dismissed: a fade.
 *   - Hover on the tag: the comment text, model/effort and what the agent is
 *     doing. Click: the bubble's panel (window.__RE_TEMPO_COMMENT_BUBBLES__
 *     .open(id)). Only the tag takes the pointer; a wheel on it is passed on
 *     to the canvas under it. The arrow, trails and selections never take
 *     input.
 *   - prefers-reduced-motion: no trajectories, holds, trails nor click
 *     motion: cursors and selections appear, jump and fade with opacity only
 *     (120 ms).
 *   - A hidden window (minimised, another tab) runs nothing; changes seen
 *     meanwhile are compacted on return (the newest per element, at most 2)
 *     and a running gesture or flight lands at once.
 *
 * Chat agents (an ordinary chat, no comment): a chat tab of the selected
 * workspace counts while the app's own st.isChatInProgress(workspaceId,
 * chatTabId) is true (the check behind the sidebar's spinner) or while it
 * waits for an answer (__chatSessionStoreDebug.getIsWaitingForInput, shown
 * as needs-input). The workspaces store is found as project-sidebar finds it
 * (zustand getState in the deps of a selector hook; only pure `()=>x`
 * getters are called): up from a canvas or the rail, else a time-sliced tree
 * scan. Chats that belong to a comment task (task.chatId) stay with their
 * task, and a chat shows only after running for 0.9 s, so a comment task's
 * brand-new chat is never taken for one. Which canvas it edits, first match:
 *   1. the canvas view whose own chat panel ([data-testid="canvas-chat-tab"]
 *      .chat-view, props activeChatId + workspaceId) shows this chat: the
 *      Design route's canvas chat, the chat canvas-chrome's Agent tab hosts;
 *   2. a canvas tab the chat owns (centerTabs type "canvas", ownerChatTabId),
 *      by canvas name: the canvas next to the chat on the chat route;
 *   3. a canvas folder (".../canvases/<name>/") in its tool calls since its
 *      last prompt (__chatSessionStoreDebug.getMessages, every 2.5 s);
 *   4. none of those: while it runs, every canvas on screen is watched, and
 *      the first edit seen on one puts the cursor there for the rest of the
 *      run (it enters beside that change and glides to it).
 * A linked chat enters near the work area (the last changed storyboard, else
 * the one nearest the view centre) with a short glide; it has no avatar, so
 * no birth flight and, when the chat stops, the check then the fade (gone
 * within ~2 s: the 0.5 s poll plus the fade). Its edits are actions as for a
 * comment. Hover: its last prompt, model/effort, what it is doing; click:
 * canvas-chrome's Agent tab when the view has one and that canvas's chat
 * panel shows this chat (else only the hover card).
 *
 * Data (read-only): window.__RE_TEMPO_COMMENT_AGENT__ (canvas-comment-agent):
 * tasks(), subscribe(cb), the window event "rtcc:changed"; Task fields used:
 * id, status, canvasName, storyboardName, anchor {x, y, nodeId}, text,
 * author.name, model?, effort?, createdAt. The older jobs() API (state
 * starting|awaiting) is tolerated. Numbers come from the bubbles' DOM
 * (.rtcb-bubble[data-n]), else the task's position in tasks(). A queued task
 * shows its cursor only when it was just launched (it flies in and waits).
 *
 * Canvas DOM (as canvas-snap documents it): [data-canvas-root] > world layer
 * .tds-canvas-shimmer-origin (translate3d(x, y, 0) scale(zoom)) > items
 * div[data-canvas-item-id] (transform translate(X, Y), width/height in canvas
 * units, also --canvas-item-*), header [data-storyboard-header]. The
 * canvas-nodes frames sit in the same world layer, in their mods' layers:
 * .rtcn-note[data-rtcn-id], .rtsh-frame[data-rtsh-id],
 * .rtbf-frame[data-rtbf-id] (transform translate(X, Y), width, height or
 * min-height). The canvas a root shows is its name pill (as comment-bubbles
 * finds it) or the active design tab label above it, compared with
 * task.canvasName (lowercase, no ".canvas.tsx", no chevron). A canvas counts
 * as on screen when its root (or the app's comment layers over it:
 * [data-testid^="canvas-comment-"], e.g. the surface that places comments
 * while the comment tool is on) is what is hit at its middle and corners.
 *
 * Mount: one fixed layer per visible canvas view, appended to <body> and
 * clipped to the canvas root box (cursors, selections), plus one fixed
 * full-window layer for the flights and the pin pulses (nothing is inserted
 * in the app's tree). The canvas layers hide (CSS, no transition) while
 * html.rtcc-capturing is set; the flights' layer stays (a cursor leaving its
 * avatar on Enter) and canvas-comment-agent masks it in the image. Both
 * cut (clip-path with holes) around comment-bubbles' popovers and panels
 * (.rtcb-pop, the agents hub included; .rtcb-panel, .rtcb-lb, .rtcb-tip):
 * no cursor, tag, selection or flight is ever drawn over them.
 *
 * Not the agent's edits: changes while a pointer is down anywhere in the app
 * and for 1.5 s after it, 1.5 s after a key press, 0.45 s after a pan or zoom
 * (level-of-detail swaps), during the first 0.8 s of a view or iframe, while
 * the pointer moves inside that storyboard's iframe, a storyboard that
 * keeps changing on its own (an animation: muted for 30 s), a storyboard
 * document batch that touches nothing in its <body> (the dev server's hot
 * update re-injects <head> tags in every storyboard at once), and more than
 * 3 storyboards / frames appearing at once (a canvas or a node layer
 * mounting). A changed storyboard goes to the running agent whose comment is
 * on it, else the one already working there, else the storyboard name, else
 * the nearest anchor.
 *
 * Polling: a 1 s tick while cursors exist, the comment store is missing or a
 * canvas is on screen (chats have no event the mod can subscribe to; one
 * tick reads the store and calls isChatInProgress per chat tab), 0.5 s while
 * a chat agent's cursor is live; nothing while no canvas is visible and no
 * cursor exists. Motion runs on requestAnimationFrame only while something
 * moves (reads first, then writes; transforms and opacity only).
 * Flag: localStorage "rtd.agentCursors" = "off" (read on every tick).
 * API: window.__RE_TEMPO_AGENT_CURSORS__ = { colorOf(taskId) (CSS colour,
 *   stable per agent), state(), refresh(), enabled(), dispose() }; the window
 *   event "rtac:color" {taskId, color, index} whenever an agent gets (or
 *   changes) its colour. state().cursors[] has kind ("comment" | "chat"),
 *   title, canvasNames, the queue and the running action, caption, tool,
 *   landedAt; state().tools / pulses count the stream's calls and the pin
 *   pulses; state().perf the
 *   frame meter (fps while animating, frames over 50 ms, the mod's own time
 *   per frame).
 * Test hooks: window.__RE_TEMPO_AGENT_CURSORS_CFG__ = { tickMs, fadeMs,
 *   coalesceMs, quietMs, userQuietMs, settleMs, wander, chatGraceMs,
 *   birthWaitMs, birthPopMs } read once at load.
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  // Re-injection without a page reload: drop the previous instance first.
  if (window.__RE_TEMPO_AGENT_CURSORS__ && typeof window.__RE_TEMPO_AGENT_CURSORS__.dispose === "function") {
    try {
      window.__RE_TEMPO_AGENT_CURSORS__.dispose();
    } catch (_) {}
  }

  // ---------------------------------------------------------------- config
  const CFG = window.__RE_TEMPO_AGENT_CURSORS_CFG__ || {};
  const FLAG_KEY = "rtd.agentCursors"; // "off" = disabled
  const COLORS_KEY = "rtd.agentCursors.colors";
  const TICK_MS = CFG.tickMs || 1000;
  const FADE_MS = CFG.fadeMs || 1500;
  const COALESCE_MS = CFG.coalesceMs || 140;
  const QUIET_MS = CFG.quietMs || 450; // after a pan / zoom / wheel
  const USER_QUIET_MS = CFG.userQuietMs || 1500; // after a pointer or key press
  const SETTLE_MS = CFG.settleMs || 800; // a new view or iframe document
  const WANDER = CFG.wander !== false;
  const CHAT_GRACE_MS = CFG.chatGraceMs != null ? CFG.chatGraceMs : 900; // a chat runs this long before it shows
  const BIRTH_WAIT_MS = CFG.birthWaitMs || 1100; // a launched cursor waits this long for its avatar
  const BIRTH_POP_MS = CFG.birthPopMs || 50; // a launched cursor pops out of its avatar this soon (the avatar still entering)
  const PIN_WAIT_MS = 700; // a comment's cursor with no avatar by then comes out of the comment's pin
  const CAPTURE_WAIT_MS = 300; // the pin pulses after its "before" capture (this long at most): the pin hides meanwhile
  const PIN_DX = 30; // a comment's cursor rests this far right of / below the pin's point (screen px):
  const PIN_DY = 4; // beside the pin's bubble, never over it
  const TOOL_HOLD_MS = 1600; // a finished tool call's caption stays this long, then "Thinking"
  // tool calls that move the cursor (the others only change its caption)
  const TARGET_KINDS = new Set(["edit", "style", "create", "canvas", "layout", "node", "click", "shot"]);
  const CHAT_DONE_MS = 5000; // an ended chat stays "done" in the list this long
  const CHAT_SCAN_MS = 2500; // its messages are read at most this often
  const FRESH_MS = 8000; // a task first seen this young was just launched: it is born
  const HOLD_MS = 1150; // a change is never held back longer than this
  const QUEUE_MAX = 4; // actions waiting per cursor
  const SEL_IDLE_MS = 2600; // a selection fades this long after its last change
  const CHECK_MS = 560; // done: the check shows this long before the flight home
  const RM_MS = 120; // prefers-reduced-motion: opacity only, this long
  // Cinema (the launch choreography, see the header): the spark from the pin
  // to the avatar, the particle bursts, the edge indicator's inset and the
  // name tag's spring (stiffness / damping per frame at 60 fps).
  const SPARK_MS = 340;
  const BURST_MS = 420;
  const EDGE_INSET = 14;
  const TAG_K = 0.22;
  const TAG_D = 0.62;
  const CANVAS_PATH_RE = /(?:^|[\/\\])canvases[\/\\]([^\/\\"'`\s]+)[\/\\]/g;
  const GETTER_RE = /^\(\)=>[A-Za-z$_][\w$]*$/;
  // Agent colours: white 11 px text keeps 4.6:1 or more on each; amber stays
  // reserved for needs-input and red for failures and the snap guides.
  const HEX = ["#c2532d", "#2563eb", "#7c3aed", "#047857", "#db2777", "#0e7490", "#4f46e5", "#4d7c0f"];
  const PALETTE = HEX.length;
  const COLORS_MAX = 60;
  // Self-changing storyboards (animations): a burst starts after 600 ms of
  // silence; one that runs on for 2.5 s, or 4 evenly spaced bursts within
  // 15 s, mutes that storyboard for 30 s.
  const NOISE = { gapMs: 600, continuousMs: 2500, periodicN: 4, periodicSpanMs: 15000, ratio: 1.35, muteMs: 30000 };
  const SHOW = new Set(["running", "needs-input"]);
  const LIVE = new Set(["queued", "running", "needs-input"]);
  const TERMINAL = new Set(["done", "failed"]);
  const STATE_ALIAS = { starting: "running", awaiting: "needs-input" };
  const SEL = {
    root: "[data-canvas-root]",
    world: ".tds-canvas-shimmer-origin",
    item: "[data-canvas-item-id]",
    node: ".rtcn-note[data-rtcn-id], .rtsh-frame[data-rtsh-id], .rtbf-frame[data-rtbf-id]",
    nodeLayer: "[data-rtcn-layer], [data-rtsh-layer], [data-rtbf-layer]",
    header: "[data-storyboard-header]",
    designBar: '[data-testid="design-view-tab-bar"]',
    pill: '[aria-label="Canvas page"], [data-rcq-switch], button[aria-label="Expand sidebar"], [data-testid="design-view-tab-bar"]',
    ours: "[data-rtac-layer], [data-rtac-sky], .rtac-tip",
    bubbles: "[data-rtcb-root], .rtcb-panel, .rtcb-pop, .rtcb-tip, .rtcb-lb",
    // comment-bubbles' popovers and panels (the agents hub .rtcb-pop.rtcb-hub
    // over the composer): no cursor, tag or flight is ever drawn over them.
    bubblePanels: ".rtcb-pop, .rtcb-panel, .rtcb-lb, .rtcb-tip",
    // canvas-chrome's floating surfaces (cards, rail, pills, composer, zoom,
    // the hosted chat): a cursor on the canvas passes under them, as the
    // canvas's own content does (flights, over the window, are never cut by
    // them: a cursor is born on the agents pill)
    chromeSurfaces:
      '[data-rcc-shell] [data-rcc-card], [data-rcc-shell] [data-rcc-rwrap] > aside, [data-rcc-shell] [data-rcc-railwrap], [data-rcc-shell] [data-testid="rcq-left-toggle"], [data-canvas-shell] .rcc-composer-wrap, [data-canvas-shell] .rcc-agents-pill, [data-rcc-shell] .rcc-zoom, [data-rcc-shell] [data-rcc-file], [data-rcc-shell] .rcc-top, [data-rcc-shell] .rcc-sel, [data-rcc-chat-hosted]',
    editable: 'input, textarea, select, [contenteditable=""], [contenteditable="true"]',
    shell: "[data-canvas-shell]",
    chatPanel: '[data-testid="canvas-chat-tab"] .chat-view',
    rail: '[data-testid="workspace-navbar"]',
    composer: ".rcc-composer-wrap",
    commentLayer: '[data-testid^="canvas-comment-"]',
    // the app's comment pins (as canvas-comment-agent finds them)
    pins: '[data-testid^="canvas-comment-pin"]:not([data-testid="canvas-comment-pin-layer"])',
  };
  SEL.thing = `${SEL.item}, ${SEL.node}`;
  // canvas-nodes frames: [attribute, key prefix]
  const NODE_KEYS = [
    ["data-rtcn-id", "note:"],
    ["data-rtsh-id", "shader:"],
    ["data-rtbf-id", "browser:"],
  ];
  const FRAME_ATTRS = ["class", "style", "src", "srcset", "href", "d", "fill", "stroke", "viewBox", "width", "height", "placeholder", "alt", "value"];
  const VIEW_RE = /translate3d\(\s*(-?[\d.e+-]+)px\s*,\s*(-?[\d.e+-]+)px\s*,\s*0(?:px)?\s*\)\s*scale\(\s*([\d.e+-]+)\s*\)/i;
  const TRANSLATE_RE = /translate\(\s*(-?[\d.e+-]+)px\s*,\s*(-?[\d.e+-]+)px\s*\)/i;
  const ONLY_TRANSLATE_RE = /^\s*translate\(\s*-?[\d.e+-]+px\s*,\s*-?[\d.e+-]+px\s*\)\s*$/i;
  const MATRIX_RE = /^matrix\(\s*([^)]+)\)$/i;

  // Motion language shared by the RE-TEMPO mods.
  const EASE_OUT_CSS = "cubic-bezier(0.22, 1, 0.36, 1)";
  const EASE_IN_OUT_CSS = "cubic-bezier(0.65, 0, 0.35, 1)";
  // A CSS cubic-bezier as a function (Newton, then bisection), so a gesture
  // driven by the frame loop and a Web Animation with the same curve agree.
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const e = sx(t) - x;
        if (Math.abs(e) < 1e-5) return sy(t);
        const d = dx(t);
        if (Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      let a = 0;
      let b = 1;
      t = x;
      for (let i = 0; i < 24; i++) {
        const v = sx(t);
        if (Math.abs(v - x) < 1e-5) break;
        if (v > x) b = t;
        else a = t;
        t = (a + b) / 2;
      }
      return sy(t);
    };
  }
  const easeOut = bezier(0.22, 1, 0.36, 1);
  const easeInOut = bezier(0.65, 0, 0.35, 1);
  const easeInOutSine = (p) => -(Math.cos(Math.PI * p) - 1) / 2;

  const now = () => performance.now();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r2 = (v) => Math.round(v * 100) / 100;
  const lerp = (a, b, e) => a + (b - a) * e;
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
  const enabled = () => ls.get(FLAG_KEY) !== "off";
  const reduceMQ = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  const reduced = () => !!(reduceMQ && reduceMQ.matches);
  const nameKey = (s) =>
    String(s || "")
      .trim()
      .replace(/\s*[⌄˅▾▼]\s*$/, "")
      .replace(/\.canvas\.[jt]sx?$/, "")
      .toLowerCase();
  const isShown = (n) => {
    if (!n || !n.isConnected || !n.getClientRects().length) return false;
    const s = getComputedStyle(n);
    return s.visibility !== "hidden" && s.display !== "none";
  };
  const isOurs = (n) => !!(n && n.closest && n.closest(SEL.ours));
  const isBubbles = (n) => !!(n && n.closest && n.closest(SEL.bubbles));
  const el = (tag, cls) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };
  // A rect from an event detail: DOMRect, {left, top, width, height} or {x, y, w, h}.
  function rectOf(r) {
    if (!r || typeof r !== "object") return null;
    const left = Number(r.left != null ? r.left : r.x);
    const top = Number(r.top != null ? r.top : r.y);
    const width = Number(r.width != null ? r.width : r.w);
    const height = Number(r.height != null ? r.height : r.h);
    if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    return { left, top, width, height };
  }
  const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  // ------------------------------------------------------------------ state
  const cursors = new Map(); // task id -> cursor
  const roots = new Map(); // canvas root element -> view record
  const lastPos = new Map(); // task id -> { pos, focus, itemId } (a re-run resumes there)
  const knownN = new Map(); // task id -> bubble number
  const births = new Map(); // task id -> { at, launch, avatar, pin: rect | null, capturing, captured, pulsed }
  const tools = new Map(); // task id -> its latest tool call { id, label, kind, status, at, endAt }
  const pendingTools = new Map(); // task id -> tool calls that move the cursor, before it exists
  const hints = new Map(); // task id -> { status, at, reason } told by "rtca:done" / "rtca:failed" / "rtca:needs-input"
  const HINT_MS = 10000; // a hint counts this long, until the store confirms it
  let rtcaSeq = 0;
  // "rtca:action" kinds -> the stream's kinds (what moves the cursor)
  const RTCA_KIND = { create: "create", edit: "edit", style: "style", move: "node", resize: "node", click: "click", shot: "shot", layout: "layout", canvas: "canvas", node: "node", read: "read" };
  const S = {
    on: false,
    changes: 0,
    ignored: 0,
    muted: 0,
    forwardedWheel: 0,
    flights: { birth: 0, home: 0 },
    actions: { draw: 0, box: 0, edit: 0, focus: 0, tool: 0 },
    tools: 0, // rtcc:activity events seen
    pulses: 0,
    seeded: 0, // launches started from the DOM (no launch event)
    sparks: 0,
    bursts: 0,
    rtca: 0, // rtca:* events seen
    firstFrameMs: null, // launch event -> first painted frame of its choreography
    dropped: 0,
    compacted: 0,
    maxQueue: 0,
    holds: 0,
    lastOpen: null,
    lastChange: null,
    lastBirth: null,
    log: [], // the last 40 births / actions / homecomings
    errors: [],
  };
  // Frame meter while something animates: gaps between frames, the mod's own work.
  const P = { frames: 0, gapSum: 0, long: 0, maxGap: 0, workSum: 0, workMax: 0, last: 0 };
  let lastTasks = []; // the last list sync() saw (colours: who is live)
  let latest = null; // last task list from the store
  let unsub = null;
  let storeRef = null;
  let raf = 0;
  let tickWake = null;
  let wanderWake = null;
  let birthWake = null;
  let placeDirty = false;
  let syncQueued = false;
  let disposed = false;
  let userQuietUntil = 0;
  let pointerDown = false;
  let tipEl = null;
  let tipFor = null;
  let tipT = 0;
  let sky = null; // the fixed full-window layer of the flights
  let rootSeq = 0;
  let hiddenAt = 0;
  let holeKey = ""; // the comment-bubbles panels cut out of our layers
  const bootAt = now();

  const trace = (id, what, extra) => {
    S.log.push({ at: Date.now(), id, what, ...(extra || {}) });
    if (S.log.length > 40) S.log.shift();
  };
  const note = (where, e) => {
    S.errors.push(`${where}: ${(e && e.message) || e}`);
    if (S.errors.length > 20) S.errors.shift();
  };

  // ----------------------------------------------------------------- colours
  let colorMap = null;
  const announced = new Map(); // task id -> colour slot last announced ("rtac:color")
  function colors() {
    if (colorMap) return colorMap;
    colorMap = {};
    try {
      const o = JSON.parse(ls.get(COLORS_KEY) || "{}");
      if (o && typeof o === "object") for (const k of Object.keys(o)) if (Number.isInteger(o[k])) colorMap[k] = o[k];
    } catch (_) {}
    return colorMap;
  }
  const hexOf = (i) => HEX[((i % PALETTE) + PALETTE) % PALETTE];
  // Agents alive now: every cursor not on its way out, and the store's
  // queued / running / waiting tasks (an avatar may ask before a cursor exists).
  function liveIds() {
    const out = new Set();
    for (const c of cursors.values()) if (!c.finishing) out.add(c.id);
    for (const t of lastTasks) if (LIVE.has(t.status)) out.add(t.id);
    return out;
  }
  // The colour slot of an agent: its remembered one, unless another live agent
  // holds it now (then the lowest free one). An agent that is not live keeps
  // whatever it had, so the colours of finished requests never churn.
  function colorFor(id) {
    id = String(id);
    const m = colors();
    const live = liveIds();
    const used = new Set();
    for (const k of live) if (k !== id && Number.isInteger(m[k])) used.add(m[k]);
    const cur = m[id];
    if (Number.isInteger(cur) && cur >= 0 && cur < PALETTE && !(live.has(id) && used.has(cur))) return announce(id, cur);
    let pick = 0;
    while (pick < PALETTE - 1 && used.has(pick)) pick++;
    if (used.has(pick)) pick = used.size % PALETTE; // more than 8 live agents
    delete m[id];
    m[id] = pick; // newest last: the oldest ones are trimmed first
    const keys = Object.keys(m);
    for (let i = 0; i < keys.length - COLORS_MAX; i++) delete m[keys[i]];
    ls.set(COLORS_KEY, JSON.stringify(m));
    return announce(id, pick);
  }
  function announce(id, i) {
    if (announced.get(id) === i) return i;
    announced.set(id, i);
    if (announced.size > COLORS_MAX * 2) announced.delete(announced.keys().next().value);
    const detail = { taskId: id, color: hexOf(i), index: i };
    queueMicrotask(() => {
      if (disposed) return;
      try {
        window.dispatchEvent(new CustomEvent("rtac:color", { detail }));
      } catch (_) {}
    });
    return i;
  }
  function colorOf(id) {
    if (id == null || id === "") return null;
    try {
      return hexOf(colorFor(String(id)));
    } catch (e) {
      note("colorOf", e);
      return null;
    }
  }

  // Wake-ups: plain timers (a hidden window's are skipped on firing;
  // visibilitychange restarts what matters). Not animations on the document
  // element: an opacity animation on <html>, even a 1 -> 1 one, promotes the
  // whole page to a compositor layer and costs 100 to 200 ms of repaint on
  // every start, exactly on Enter.
  function later(fn, ms) {
    const h = { t: 0, dead: false };
    const run = () => {
      if (h.dead) return;
      h.dead = true;
      if (!disposed && !document.hidden) fn();
    };
    h.t = setTimeout(run, Math.max(1, ms));
    h.cancel = () => {
      h.dead = true;
      clearTimeout(h.t);
    };
    return h;
  }

  // ------------------------------------------------------------------- store
  function store() {
    const s = window.__RE_TEMPO_COMMENT_AGENT__;
    return s && (typeof s.tasks === "function" || typeof s.jobs === "function") ? s : null;
  }
  function connectStore() {
    const s = store();
    if (s === storeRef) return;
    if (unsub) {
      try {
        unsub();
      } catch (_) {}
      unsub = null;
    }
    storeRef = s;
    if (s && typeof s.subscribe === "function") {
      try {
        const u = s.subscribe((list) => {
          latest = Array.isArray(list) ? list : null;
          scheduleSync();
        });
        unsub = typeof u === "function" ? u : null;
      } catch (e) {
        note("subscribe", e);
      }
    }
    latest = null;
  }
  function onStoreEvent(e) {
    const list = e && e.detail && e.detail.tasks;
    if (Array.isArray(list)) latest = list;
    scheduleSync();
  }
  function readTasks() {
    let list = latest;
    if (!list) {
      const s = store();
      try {
        list = s ? (typeof s.tasks === "function" ? s.tasks() : s.jobs()) : [];
      } catch (e) {
        note("tasks", e);
        list = [];
      }
    }
    const out = [];
    for (const t of Array.isArray(list) ? list : []) {
      if (!t || t.id == null) continue;
      const a = t.anchor && typeof t.anchor === "object" ? t.anchor : null;
      let status = t.status || STATE_ALIAS[t.state] || t.state || "";
      // a status told ahead by "rtca:*": until the store says the same (or
      // more), at most HINT_MS
      const h = hints.get(String(t.id));
      if (h) {
        if (TERMINAL.has(status) || now() - h.at > HINT_MS || (h.status === "needs-input" && status !== "running" && status !== "queued")) hints.delete(String(t.id));
        else status = h.status;
      }
      out.push({
        id: String(t.id),
        status,
        canvasName: t.canvasName || t.canvas || "",
        storyboardName: t.storyboardName || "",
        anchor: a ? { x: Number(a.x), y: Number(a.y), nodeId: a.nodeId || null } : null,
        text: typeof t.text === "string" ? t.text : "",
        author: typeof t.author === "string" ? t.author : (t.author && t.author.name) || "",
        model: typeof t.model === "string" ? t.model : typeof t.modelName === "string" ? t.modelName : "",
        effort: typeof t.effort === "string" ? t.effort : "",
        createdAt: Number(t.createdAt) || 0,
        chatId: t.chatId != null ? String(t.chatId) : "",
        source: typeof t.source === "string" ? t.source : "",
      });
    }
    return out;
  }
  function scheduleSync() {
    if (syncQueued || disposed) return;
    syncQueued = true;
    queueMicrotask(() => {
      syncQueued = false;
      sync();
    });
  }

  // ------------------------------------------------------------ chat agents
  // Ordinary chats editing a canvas (see the header), read-only: the app's
  // workspaces store and chat session store. Each one becomes a task like a
  // comment's: { kind: "chat", chatId, workspaceId, title, canvasNames,
  // sticky, status: running | needs-input | done, anchor: null }.
  const CH = {
    get: null, // the workspaces store's getState
    scan: null,
    scanEnd: -1e9,
    tried: new WeakSet(),
    first: new Map(), // chat cursor id -> first seen running (ms)
    live: new Map(), // chat cursor id -> its last task
    ended: new Map(), // chat cursor id -> { task (status "done"), until }
    msgs: new Map(), // chat cursor id -> { at, names, text }
    sticky: new Map(), // chat cursor id -> the canvas root it was seen editing
    panel: new WeakMap(), // canvas root -> { at, v: { chatId, wsId } | null }
  };
  const fiberOf = (n) => {
    const k = n && Object.keys(n).find((x) => x.startsWith("__reactFiber$"));
    return k ? n[k] : null;
  };
  const baseName = (p) =>
    String(p || "")
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop() || "";
  const chatModel = (m) =>
    fmtModel(
      String(m || "")
        .replace(/\[[^\]]*\]$/, "")
        .replace(/-\d+[km]$/i, "")
    );
  function probeFiber(f) {
    let h = f.memoizedState;
    if (!h || typeof h !== "object" || !("next" in h)) return;
    for (let i = 0; h && i < 400 && !CH.get; i++, h = h.next) {
      const m = h.memoizedState;
      const d = Array.isArray(m) && m.length === 2 ? m[1] : null;
      if (!Array.isArray(d) || d.length !== 4 || typeof d[0] !== "function" || typeof d[2] !== "function") continue;
      const gs = d[0];
      if (CH.tried.has(gs)) continue;
      CH.tried.add(gs);
      if (!GETTER_RE.test(Function.prototype.toString.call(gs))) continue;
      let st;
      try {
        st = gs();
      } catch (_) {
        continue;
      }
      if (st && typeof st === "object" && Array.isArray(st.workspaces) && typeof st.isChatInProgress === "function") CH.get = gs;
    }
  }
  // zustand leaves getState in the deps of useSyncExternalStoreWithSelector's
  // useMemo (as project-sidebar and pane-dock find it). Up from a canvas or the
  // rail first, else a scan of the tree, 8 ms per call, at most every 3 s.
  function wsStore() {
    if (CH.get) {
      try {
        const st = CH.get();
        if (st && Array.isArray(st.workspaces)) return st;
      } catch (_) {}
      CH.get = null;
    }
    for (const sel of [SEL.root, SEL.rail]) {
      for (let f = fiberOf(document.querySelector(sel)), up = 0; f && up < 600 && !CH.get; f = f.return, up++) probeFiber(f);
    }
    if (!CH.get) {
      if (!CH.scan) {
        if (now() - CH.scanEnd < 3000) return null;
        const r = document.getElementById("root");
        const k = r && Object.keys(r).find((x) => x.startsWith("__reactContainer$"));
        if (!k) return null;
        CH.scan = { stack: [r[k]], seen: new Set() };
      }
      const end = now() + 8;
      while (CH.scan.stack.length && now() < end && !CH.get) {
        const f = CH.scan.stack.pop();
        if (!f || CH.scan.seen.has(f)) continue;
        CH.scan.seen.add(f);
        probeFiber(f);
        if (f.child) CH.scan.stack.push(f.child);
        if (f.sibling) CH.scan.stack.push(f.sibling);
      }
      if (CH.get || !CH.scan.stack.length) {
        CH.scan = null;
        CH.scanEnd = now();
      }
    }
    try {
      return CH.get ? CH.get() : null;
    } catch (_) {
      return null;
    }
  }
  const sessions = () => {
    const d = window.__chatSessionStoreDebug;
    return d && typeof d.getMessages === "function" ? d : null;
  };
  const chatKeys = (tab) => [tab.sessionId, tab.id].filter((k) => k != null && k !== "");
  function waitingOf(tab) {
    if (tab.isAwaitingResponse === true) return true;
    const d = sessions();
    if (!d || typeof d.getIsWaitingForInput !== "function") return false;
    for (const k of chatKeys(tab)) {
      try {
        if (d.getIsWaitingForInput(k) === true) return true;
      } catch (_) {}
    }
    return false;
  }
  function textOf(m) {
    const c = m && (m.content !== undefined ? m.content : m.text);
    if (typeof c === "string") return c.trim();
    if (!Array.isArray(c)) return "";
    return c
      .filter((b) => b && typeof b.text === "string" && (b.type === "text" || b.type == null))
      .map((b) => b.text)
      .join(" ")
      .trim();
  }
  // The chat's last prompt, and the canvas folders its tool calls touched since.
  function scanChat(id, tab) {
    const t = now();
    const prev = CH.msgs.get(id);
    if (prev && t - prev.at < CHAT_SCAN_MS) return prev;
    const p = { at: t, names: new Set(), text: prev ? prev.text : "" };
    CH.msgs.set(id, p);
    const d = sessions();
    let msgs = [];
    for (const k of d ? chatKeys(tab) : []) {
      try {
        const m = d.getMessages(k);
        if (Array.isArray(m) && m.length) {
          msgs = m;
          break;
        }
      } catch (_) {}
    }
    let from = Math.max(0, msgs.length - 60);
    for (let i = msgs.length - 1; i >= from; i--) {
      const m = msgs[i];
      const s = m && m.role === "user" ? textOf(m) : "";
      if (!s) continue; // not a prompt (a tool result, the agent's own turn)
      p.text = s;
      from = i + 1;
      break;
    }
    let budget = 4000;
    const visit = (o, depth) => {
      if (o == null || depth > 7 || budget-- <= 0) return;
      if (typeof o === "string") {
        if (o.length < 20000 && o.includes("canvases")) for (const m of o.matchAll(CANVAS_PATH_RE)) p.names.add(nameKey(m[1]));
        return;
      }
      if (typeof o !== "object") return;
      if (Array.isArray(o)) for (const x of o) visit(x, depth + 1);
      else for (const k in o) visit(o[k], depth + 1);
    };
    for (let i = from; i < msgs.length; i++) if (msgs[i] && msgs[i].role !== "user") visit(msgs[i], 0);
    p.names.delete("");
    return p;
  }
  function chatTask(st, ws, tab, id, status) {
    const cid = String(tab.id);
    const names = new Set();
    for (const x of ws.centerTabs) {
      if (!x || x.type !== "canvas" || x.ownerChatTabId == null || String(x.ownerChatTabId) !== cid) continue;
      const n = nameKey(x.pageName || baseName(x.pageFolderPath));
      if (n) names.add(n);
    }
    const scan = scanChat(id, tab);
    for (const n of scan.names) names.add(n);
    const task = {
      id,
      kind: "chat",
      chatId: cid,
      workspaceId: String(ws.id),
      status,
      title: String(tab.name || "").trim() || "Chat",
      canvasName: names.size ? names.values().next().value : "",
      canvasNames: names,
      sticky: CH.sticky.get(id) || null,
      storyboardName: "",
      anchor: null,
      text: scan.text,
      author: "",
      model: chatModel(tab.model || (st.chatDefaults && st.chatDefaults.model)),
      effort: tab.effort ? cap(String(tab.effort)) : "",
      createdAt: Number(tab.createdAt) || 0,
    };
    CH.live.set(id, task);
    return task;
  }
  // The selected workspace's running chats (the canvases on screen are its),
  // plus the ones that just stopped, as "done", for CHAT_DONE_MS.
  function chatTasks(comments) {
    const st = wsStore();
    const t = now();
    const running = new Set();
    const out = [];
    const ws = st && st.workspaces.find((w) => w && w.id === st.selectedWorkspaceId);
    if (ws && Array.isArray(ws.centerTabs)) {
      const taken = new Set();
      let pendingSince = 0; // a comment task whose chat is being created
      for (const k of comments) {
        if (k.chatId) taken.add(k.chatId);
        else if ((k.status === "queued" || k.status === "running") && k.createdAt && Date.now() - k.createdAt < 60000) pendingSince = pendingSince ? Math.min(pendingSince, k.createdAt) : k.createdAt;
      }
      for (const tab of ws.centerTabs) {
        if (!tab || tab.type !== "chat" || tab.isArchived === true || tab.id == null) continue;
        const cid = String(tab.id);
        if (taken.has(cid) || (pendingSince && Number(tab.createdAt) >= pendingSince - 2000)) continue;
        let busy = false;
        try {
          busy = st.isChatInProgress(ws.id, tab.id) === true;
        } catch (_) {}
        const waiting = waitingOf(tab);
        if (!busy && !waiting) continue;
        const id = `chat:${ws.id}:${cid}`;
        running.add(id);
        if (!CH.first.has(id)) CH.first.set(id, t);
        if (!cursors.has(id) && t - CH.first.get(id) < CHAT_GRACE_MS) continue;
        CH.ended.delete(id);
        out.push(chatTask(st, ws, tab, id, waiting ? "needs-input" : "running"));
      }
    }
    for (const id of [...CH.first.keys()]) if (!running.has(id)) CH.first.delete(id);
    for (const [id, task] of [...CH.live]) {
      if (running.has(id)) continue;
      CH.live.delete(id);
      CH.msgs.delete(id);
      CH.sticky.delete(id);
      CH.ended.set(id, { task: { ...task, status: "done" }, until: t + CHAT_DONE_MS });
    }
    for (const [id, e] of [...CH.ended]) {
      if (t > e.until) CH.ended.delete(id);
      else if (!running.has(id)) out.push(e.task);
    }
    return out;
  }
  // The chat a canvas view's own chat panel shows (Design route, Agent tab).
  function panelChat(root) {
    const t = now();
    const hit = CH.panel.get(root);
    if (hit && t - hit.at < 2000) return hit.v;
    let v = null;
    const shell = root.closest(SEL.shell);
    const cv = shell && shell.querySelector(SEL.chatPanel);
    for (let f = fiberOf(cv), i = 0; f && i < 8 && !v; f = f.return, i++) {
      const p = f.memoizedProps;
      if (p && typeof p === "object" && typeof p.activeChatId === "string" && p.workspaceId != null) v = { chatId: p.activeChatId, wsId: String(p.workspaceId) };
    }
    CH.panel.set(root, { at: t, v });
    return v;
  }
  // The canvas view a chat agent belongs on (see the header); the current one
  // while it still matches.
  function chatRoot(c, infos) {
    const k = c.task;
    const linked = (i) => {
      if (k.sticky && k.sticky === i.root) return true;
      for (const n of i.names) if (k.canvasNames && k.canvasNames.has(n)) return true;
      const p = panelChat(i.root);
      return !!p && p.chatId === k.chatId && p.wsId === k.workspaceId;
    };
    if (c.R) {
      const cur = infos.find((i) => i.root === c.R.root);
      if (cur && linked(cur)) return cur;
    }
    return infos.find(linked) || null;
  }
  // Where a chat agent enters: the last changed storyboard, else the one
  // nearest the view centre, else the view centre.
  function chatStart(R) {
    const v = readView(R);
    if (!v) return null;
    const rb = R.root.getBoundingClientRect();
    const cx = (rb.width / 2 - v.x) / v.zoom;
    const cy = (rb.height / 2 - v.y) / v.zoom;
    const last = R.lastItem ? itemEl(R, R.lastItem) : null;
    let best = null;
    let bd = Infinity;
    for (const n of last ? [last] : R.root.querySelectorAll(SEL.item)) {
      if (n.closest(SEL.root) !== R.root) continue;
      const r = itemRect(n);
      if (!r) continue;
      const d = Math.hypot(Math.max(r.x - cx, 0, cx - (r.x + r.width)), Math.max(r.y - cy, 0, cy - (r.y + r.height)));
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    if (best) return { x: best.x + best.width / 2, y: best.y + Math.min(best.height * 0.4, 160) };
    return { x: cx, y: cy };
  }
  function canvasOnScreen() {
    for (const n of document.querySelectorAll(SEL.root)) {
      const r = n.getBoundingClientRect();
      if (r.width >= 200 && r.height >= 200 && r.bottom > 0 && r.right > 0 && r.left < innerWidth && r.top < innerHeight) return true;
    }
    return false;
  }

  // -------------------------------------------------------------- labels
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function fmtModel(m) {
    if (!m) return "";
    const s = String(m)
      .trim()
      .replace(/^(us\.)?anthropic[./]/i, "")
      .replace(/^claude[-\s]+/i, "")
      .replace(/\[[^\]]*\]$/, "")
      .replace(/-\d{8}$/, "");
    const mm = /^([a-z]+)(?:[-\s]+(\d+(?:[-.]\d+)*))?$/i.exec(s);
    if (mm) return cap(mm[1].toLowerCase()) + (mm[2] ? " " + mm[2].replace(/-/g, ".") : "");
    return s.length > 18 ? s.slice(0, 17) + "…" : s;
  }
  function refreshNumbers(list) {
    for (const b of document.querySelectorAll(".rtcb-bubble[data-id][data-n]")) {
      const n = Number(b.dataset.n);
      if (n > 0) knownN.set(b.dataset.id, n);
    }
    // No bubble for a task (its canvas shows no column): continue the
    // numbering after the last known one, in order of creation, so two
    // agents never share a number.
    const own = new Map();
    let last = 0;
    for (const t of [...list].sort((a, b) => a.createdAt - b.createdAt)) {
      const k = knownN.get(t.id);
      last = k ? Math.max(last, k) : last + 1;
      own.set(t.id, k || last);
    }
    for (const c of cursors.values()) {
      if (c.task.kind === "chat") continue;
      const n = knownN.get(c.id) || own.get(c.id) || c.n || 0;
      if (n && n !== c.n) {
        c.n = n;
        paintLabel(c);
      }
    }
  }
  const whoOf = (c) => fmtModel(c.task.model) || "Claude";
  const titleOf = (c) => {
    const s = c.task.title || "Chat";
    return s.length > 26 ? s.slice(0, 25) + "…" : s;
  };
  const labelOf = (c) => (c.task.kind === "chat" ? `${whoOf(c)} · ${titleOf(c)}` : c.n ? `${whoOf(c)} · #${c.n}` : whoOf(c));
  function doingOf(c) {
    if (c.finishing === "failed") return "Failed";
    if (c.finishing) return "Done";
    if (c.task.status === "needs-input") return "Waiting for your answer";
    if (c.task.status === "queued") return "Starting…";
    const cap = captionOf(c);
    if (cap && c.tool && cap.text === c.tool.label) return cap.text;
    const item = c.R && c.itemId ? itemEl(c.R, c.itemId) : null;
    const name = item ? headerText(item) : "";
    if (name) return `Editing ${name}`;
    if (c.task.storyboardName) return `Working on ${c.task.storyboardName}`;
    return "Working…";
  }

  // ------------------------------------------------------------- canvas DOM
  function worldLayer(root) {
    return root.querySelector(":scope > " + SEL.world) || root.querySelector(SEL.world);
  }
  const validView = (v) => !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.zoom) && v.zoom > 0;
  function readView(R) {
    const layer = R.wl && R.wl.isConnected && R.wl !== R.root ? R.wl : worldLayer(R.root);
    if (layer) {
      const m = VIEW_RE.exec(layer.style.transform || "");
      if (m) {
        const v = { x: +m[1], y: +m[2], zoom: +m[3] };
        if (validView(v)) return v;
      }
      const mm = MATRIX_RE.exec(getComputedStyle(layer).transform || "");
      if (mm) {
        const p = mm[1].split(",").map(Number);
        const v = { x: p[4], y: p[5], zoom: p[0] };
        if (p.length === 6 && validView(v)) return v;
      }
    }
    const h = handleOf(R);
    if (h) {
      try {
        const v = h.getView();
        if (validView(v)) return { x: v.x, y: v.y, zoom: v.zoom };
      } catch (_) {}
    }
    return null;
  }
  // The infinite canvas handle (getView) on a ref above the root (fallback).
  function handleOf(R) {
    if (R.handleRef && R.handleRef.current && typeof R.handleRef.current.getView === "function") return R.handleRef.current;
    const t = now();
    if (t - (R.handleScanAt || -1e9) < 2000) return null;
    R.handleScanAt = t;
    const k = Object.keys(R.root).find((x) => x.startsWith("__reactFiber$"));
    let f = k ? R.root[k] : null;
    for (let d = 0; f && d < 400; d++, f = f.return) {
      for (const r of [f.ref, f.memoizedProps && f.memoizedProps.ref]) {
        if (r && typeof r === "object" && r.current && typeof r.current.getView === "function") {
          R.handleRef = r;
          return r.current;
        }
      }
    }
    return null;
  }
  const num = (s) => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
  };
  function itemRect(item) {
    const st = item.style;
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
    // A note grows with its text past its min-height.
    if (!Number.isFinite(height)) height = Math.max(num(st.minHeight) || 0, item.offsetHeight || 0) || NaN;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    return { x, y, width, height };
  }
  const sameRect = (a, b) => !!a && !!b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
  // A storyboard by its id, or a canvas-nodes frame by its key ("note:<id>"…).
  function itemEl(R, id) {
    if (!id) return null;
    for (const [a, p] of NODE_KEYS) {
      if (!id.startsWith(p)) continue;
      for (const n of R.root.querySelectorAll(`[${a}="${CSS.escape(id.slice(p.length))}"]`)) if (n.matches(SEL.node) && n.closest(SEL.root) === R.root) return n;
      return null;
    }
    for (const n of R.root.querySelectorAll(SEL.item)) if (n.getAttribute("data-canvas-item-id") === id && n.closest(SEL.root) === R.root) return n;
    return null;
  }
  function headerText(item) {
    const h = item.querySelector(SEL.header);
    return h ? (h.textContent || "").trim().slice(0, 60) : "";
  }

  // Canvas views on screen and on top, each with the canvas name(s) it shows.
  // A canvas root counts as on screen when it is shown and in the window and
  // nothing hides it: the hit test (the root, its own overlays, the comment
  // layers, canvas-chrome's surfaces, our layers) decides first; a root that
  // fails it is still on screen unless ANOTHER shown root covers more than
  // half of it (stacked panes). Popovers, dialogs and the modal
  // aria-hidden the app puts on the rest of the page never hide a canvas:
  // right after a comment is sent, its agent's cursor must show.
  function canvasVisible(c, all) {
    if (!isShown(c) || c.closest("[hidden]")) return false;
    const r = c.getBoundingClientRect();
    if (r.width < 200 || r.height < 200 || r.bottom <= 0 || r.right <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
    const pts = [
      [0.5, 0.5],
      [0.25, 0.3],
      [0.75, 0.3],
      [0.25, 0.75],
      [0.75, 0.75],
    ];
    // The canvas's own overlays (a selected storyboard's hit area, z 4000)
    // sit next to the root, in its parent: still this canvas. So do the
    // comment layers one level up (pins, and in comment mode the surface
    // that places a comment over the whole canvas) and canvas-chrome's
    // cards, pills and hosted chat inside the same shell.
    const box = c.parentElement;
    const view = box && box.parentElement;
    const shell = c.closest(SEL.shell);
    let other = false;
    for (const [fx, fy] of pts) {
      const x = clamp(r.left + r.width * fx, 0, innerWidth - 1);
      const y = clamp(r.top + r.height * fy, 0, innerHeight - 1);
      const hit = document.elementFromPoint(x, y);
      if (!hit) continue;
      if (c.contains(hit) || hit.contains(c) || (box && box.contains(hit)) || isOurs(hit) || isBubbles(hit)) return true;
      if (view && view.contains(hit) && hit.closest(SEL.commentLayer)) return true;
      if (shell && shell.contains(hit)) return true;
      const hr = hit.closest(SEL.root);
      if (hr && hr !== c) other = true;
    }
    if (other) return false;
    // Covered by something else (a popover, a dialog's veil, a tooltip):
    // still this canvas unless another shown root lies over most of it.
    for (const o of all || document.querySelectorAll(SEL.root)) {
      if (o === c || !isShown(o)) continue;
      const q = o.getBoundingClientRect();
      const w = Math.min(r.right, q.right) - Math.max(r.left, q.left);
      const h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
      if (w > 0 && h > 0 && w * h > 0.5 * r.width * r.height && o.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_PRECEDING) return false;
    }
    return true;
  }
  function pillName(c, cr) {
    for (const n of document.querySelectorAll(SEL.pill)) {
      if (!isShown(n) || isBubbles(n) || isOurs(n)) continue;
      if (n.matches(SEL.designBar)) continue;
      const r = n.getBoundingClientRect();
      if (r.width < 40 || r.height < 20 || r.height > 140) continue;
      if (r.top - cr.top > 80 || r.top - cr.top < -12 || r.left - cr.left < -12 || r.left - cr.left > cr.width * 0.5) continue;
      // The name's span: the first one with text outside a button (canvas-chrome's
      // file pill puts an icon span first, then the name, then a chevron button).
      const span = [...n.querySelectorAll("span")].find((x) => (x.textContent || "").trim() && !x.closest("button"));
      return nameKey((span || n).textContent);
    }
    return "";
  }
  function tabName(cr) {
    for (const bar of document.querySelectorAll(SEL.designBar)) {
      if (!isShown(bar)) continue;
      const r = bar.getBoundingClientRect();
      if (r.right <= cr.left || r.left >= cr.right) continue;
      if (r.top > cr.top + 60 || r.bottom < cr.top - 90) continue;
      const t = bar.querySelector('[aria-selected="true"], [data-state="active"], [data-active="true"]');
      const s =
        t &&
        (
          (t.innerText || t.textContent || "")
            .split("\n")
            .map((x) => x.trim())
            .find(Boolean) ||
          t.getAttribute("aria-label") ||
          ""
        ).trim();
      if (s) return nameKey(s);
    }
    return "";
  }
  function visibleCanvases() {
    const out = [];
    const all = document.querySelectorAll(SEL.root);
    for (const c of all) {
      if (!canvasVisible(c, all)) continue;
      const cr = c.getBoundingClientRect();
      const names = new Set([nameKey(c.getAttribute("data-canvas-name")), pillName(c, cr), tabName(cr)].filter(Boolean));
      out.push({ root: c, names, sig: [...names].sort().join("|") });
    }
    return out;
  }


  // -------------------------------------------------------------- view record
  function ensureRoot(info) {
    let R = roots.get(info.root);
    if (R && R.sig !== info.sig) {
      // Same view element, another canvas: start over (other storyboards).
      dropRoot(R);
      R = null;
    }
    if (R) return R;
    const layer = el("div", "rtac-layer");
    layer.setAttribute("data-rtac-layer", "");
    document.body.appendChild(layer);
    const t = now();
    R = {
      id: ++rootSeq,
      root: info.root,
      names: info.names,
      sig: info.sig,
      layer,
      wl: null,
      cursors: new Set(),
      sels: new Set(),
      holds: new Map(), // item key -> hold (see holdNew / holdBox)
      view: null,
      rb: null,
      boxKey: "",
      quietUntil: t + SETTLE_MS,
      settleUntil: t + SETTLE_MS,
      rects: new Map(),
      sizes: new Map(),
      frames: new Map(),
      pending: new Map(),
      flushT: 0,
      mo: null,
      ro: null,
      handleRef: null,
      handleScanAt: -1e9,
    };
    roots.set(info.root, R);
    observe(R);
    return R;
  }
  function dropRoot(R) {
    for (const c of [...R.cursors]) detach(c);
    if (R.mo) R.mo.disconnect();
    if (R.ro) R.ro.disconnect();
    for (const F of R.frames.values()) unhookFrame(F, true);
    R.frames.clear();
    clearTimeout(R.flushT);
    for (const ch of R.pending.values()) releaseChange(ch);
    R.pending.clear();
    for (const h of R.holds.values()) endHold(h);
    R.holds.clear();
    for (const s of [...R.sels]) killSel(s);
    R.layer.remove();
    roots.delete(R.root);
  }

  // ------------------------------------------------------- change detection
  const quiet = (R, t) => pointerDown || t < userQuietUntil || t < R.quietUntil || t < R.settleUntil;
  // A running agent can take a change made on this view (nothing is held otherwise).
  function ownable(R) {
    for (const c of R.cursors) if (!c.finishing && c.task.status === "running") return true;
    for (const c of cursors.values()) if (c.task.kind === "chat" && !c.finishing && c.task.status === "running" && !c.R) return true;
    return false;
  }
  // Storyboards and canvas-nodes frames share one key space.
  function keyOf(n) {
    if (!n || n.nodeType !== 1) return "";
    const id = n.getAttribute("data-canvas-item-id");
    if (id) return id;
    for (const [a, p] of NODE_KEYS) {
      const v = n.getAttribute(a);
      if (v && n.matches(SEL.node)) return p + v;
    }
    return "";
  }

  function observe(R) {
    const wl = worldLayer(R.root) || R.root;
    if (R.wl !== wl || !R.mo) {
      if (R.mo) R.mo.disconnect();
      if (R.ro) R.ro.disconnect();
      R.wl = wl;
      R.rects.clear();
      R.sizes.clear();
      R.mo = new MutationObserver((recs) => {
        try {
          onHostMutations(R, recs);
        } catch (e) {
          note("host-mutations", e);
        }
      });
      R.mo.observe(wl, { attributes: true, attributeFilter: ["style", "src", "srcdoc"], childList: true, subtree: true });
      R.ro = typeof ResizeObserver === "function" ? new ResizeObserver((entries) => onResize(R, entries)) : null;
      R.settleUntil = Math.max(R.settleUntil, now() + SETTLE_MS);
    }
    scanItems(R);
  }

  // Baselines for every storyboard and frame (nothing here is a change).
  function scanItems(R) {
    const seen = new Set();
    for (const n of R.root.querySelectorAll(SEL.thing)) {
      if (n.closest(SEL.root) !== R.root) continue;
      const id = keyOf(n);
      if (!id) continue;
      seen.add(id);
      registerThing(R, n);
    }
    for (const id of [...R.rects.keys()]) {
      if (seen.has(id)) continue;
      R.rects.delete(id);
      R.sizes.delete(id);
    }
    for (const [f, F] of [...R.frames]) {
      if (f.isConnected && seen.has(F.itemId)) continue;
      unhookFrame(F, true);
      R.frames.delete(f);
    }
  }

  // One storyboard / frame: baseline rect, resize watch, iframe hooks (only a
  // storyboard's: a browser frame shows someone else's page). Its key when it
  // was not known yet.
  function registerThing(R, n) {
    if (n.closest(SEL.root) !== R.root) return "";
    const id = keyOf(n);
    if (!id) return "";
    let fresh = "";
    if (!R.rects.has(id)) {
      R.rects.set(id, itemRect(n));
      if (R.ro) R.ro.observe(n);
      fresh = id;
    }
    if (n.matches(SEL.item)) for (const f of n.querySelectorAll("iframe")) hookFrame(R, n, f);
    return fresh;
  }
  // Only the nodes a mutation added or removed are looked at, never the tree.
  // A storyboard / frame that appears on its own is the agent's (held, then
  // drawn); more than 3 at once, or a node layer mounting, is a view loading.
  function scanAdded(R, nodes, t, gone) {
    const fresh = [];
    for (const a of nodes) {
      if (!a.isConnected) continue;
      const mount = a.matches(SEL.nodeLayer) || !!a.querySelector(SEL.nodeLayer);
      const list = a.matches(SEL.thing) ? [a] : [];
      for (const n of a.querySelectorAll(SEL.thing)) list.push(n);
      for (const n of list) {
        const id = registerThing(R, n);
        // The same box put back (React re-creating it) is not new.
        if (id && !mount && !(gone.has(id) && sameRect(gone.get(id), R.rects.get(id)))) fresh.push([id, n]);
      }
      const host = a.parentElement && a.parentElement.closest(SEL.item);
      if (host && host.closest(SEL.root) === R.root) {
        if (a.tagName === "IFRAME") hookFrame(R, host, a);
        else for (const f of a.querySelectorAll("iframe")) hookFrame(R, host, f);
      }
    }
    if (!fresh.length) return;
    if (fresh.length > 3 || quiet(R, t) || !ownable(R)) {
      S.ignored += fresh.length;
      return;
    }
    for (const [id, n] of fresh) {
      holdNew(R, id, n);
      noteChange(R, id, { kind: "added" });
    }
  }
  // Forgets what left; the boxes of the storyboards that left (id -> rect).
  function scanRemoved(R, nodes) {
    const gone = new Map();
    for (const a of nodes) {
      if (a.isConnected) continue;
      const items = a.matches(SEL.thing) ? [a] : [];
      items.push(...a.querySelectorAll(SEL.thing));
      for (const i of items) {
        const id = keyOf(i);
        if (!id) continue;
        if (R.ro) R.ro.unobserve(i);
        if (R.rects.get(id)) gone.set(id, R.rects.get(id));
        R.rects.delete(id);
        R.sizes.delete(id);
        const ch = R.pending.get(id);
        if (ch) releaseChange(ch);
        R.pending.delete(id);
        const h = R.holds.get(id);
        if (h) endHold(h);
        R.holds.delete(id);
      }
    }
    for (const [f, F] of [...R.frames]) {
      if (f.isConnected && R.rects.has(F.itemId)) continue;
      unhookFrame(F, true);
      R.frames.delete(f);
    }
    return gone;
  }

  function onHostMutations(R, recs) {
    const t = now();
    let view = false;
    const added = [];
    const removed = [];
    for (const r of recs) {
      if (r.type === "attributes") {
        const n = r.target;
        if (n === R.wl) {
          if (r.attributeName === "style") view = true;
          continue;
        }
        if (r.attributeName === "style" && n.matches && n.matches(SEL.thing)) {
          const id = keyOf(n);
          if (!id || !R.rects.has(id)) continue;
          const rect = itemRect(n);
          const prev = R.rects.get(id);
          R.rects.set(id, rect);
          if (prev && rect && !sameRect(prev, rect)) {
            if (quiet(R, t) || !ownable(R)) S.ignored++;
            else {
              holdBox(R, id, n, prev, rect);
              noteChange(R, id, { kind: "rect", from: prev, to: rect });
            }
          }
        } else if (n.tagName === "IFRAME" && (r.attributeName === "src" || r.attributeName === "srcdoc")) {
          const item = n.closest(SEL.item);
          if (item) hookFrame(R, item, n);
        }
      } else if (r.type === "childList") {
        for (const a of r.addedNodes) if (a.nodeType === 1 && !isOurs(a)) added.push(a);
        for (const a of r.removedNodes) if (a.nodeType === 1 && !isOurs(a)) removed.push(a);
      }
    }
    if (view) {
      R.quietUntil = Math.max(R.quietUntil, t + QUIET_MS);
      startLoop();
    }
    const gone = removed.length ? scanRemoved(R, removed) : new Map();
    if (added.length) scanAdded(R, added, t, gone);
  }

  function onResize(R, entries) {
    const t = now();
    for (const e of entries) {
      const id = keyOf(e.target);
      if (!id) continue;
      const b = e.contentRect;
      const size = { w: b.width, h: b.height };
      const prev = R.sizes.get(id);
      R.sizes.set(id, size);
      if (size.w < 1 || size.h < 1) {
        R.sizes.delete(id); // hidden view (display none), not an edit
        continue;
      }
      if (!prev || (Math.abs(prev.w - size.w) < 0.5 && Math.abs(prev.h - size.h) < 0.5)) continue;
      if (R.holds.has(id) || R.pending.has(id)) continue; // already the agent's: its own move / resize
      if (quiet(R, t) || !ownable(R)) S.ignored++;
      else noteChange(R, id, { kind: "resize" });
    }
  }

  // ------------------------------------------------------------------ holds
  // The agent's change stays unseen until its cursor "does" it: a Web
  // Animation on the element that shows the old state (a new box clipped to
  // nothing, a moved box at its old place, a grown box at its old size). No
  // inline style is touched, and a hold lasts HOLD_MS at most: whatever
  // happens to this mod, the element is itself again by then.
  function play(n, frames, dur, easing, fill) {
    try {
      const a = n.animate(frames, { duration: Math.max(1, dur), easing: easing || "linear", fill: fill || "none" });
      const tl = n.ownerDocument && n.ownerDocument.timeline;
      // Starts now (same frame as the gesture), not at the next commit.
      if (tl && tl.currentTime != null) a.startTime = tl.currentTime;
      return a;
    } catch (_) {
      return null;
    }
  }
  const holding = (h) => !!h && !!h.a && h.a.playState === "running" && now() < h.until;
  function endHold(h) {
    if (!h || !h.a) return;
    try {
      h.a.cancel();
    } catch (_) {}
    h.a = null;
  }
  // The strip of a storyboard's header above its box (item px), revealed with it.
  function headroom(n) {
    const hd = n.querySelector(SEL.header);
    if (!hd) return 0;
    const a = n.getBoundingClientRect();
    const b = hd.getBoundingClientRect();
    const s = n.offsetWidth ? a.width / n.offsetWidth : 1;
    return b.top < a.top && s > 0 ? Math.ceil((a.top - b.top) / s) + 2 : 0;
  }
  function holdNew(R, id, n) {
    if (reduced() || document.hidden) return;
    const top = `${-headroom(n)}px`;
    const k = { clipPath: `inset(${top} 100% 100% 0px)` };
    const a = play(n, [k, k], HOLD_MS);
    if (!a) return;
    endHold(R.holds.get(id));
    R.holds.set(id, { kind: "new", el: n, top, a, until: now() + HOLD_MS });
    S.holds++;
  }
  // A box's look at `r` while its real box is `h.to`.
  function boxKey(h, r) {
    const k = {};
    if (h.move) k.transform = `translate(${r.x}px, ${r.y}px)`;
    if (h.grow) k.clipPath = `inset(${h.top} ${Math.max(0, h.to.width - r.width)}px ${Math.max(0, h.to.height - r.height)}px 0px)`;
    return k;
  }
  function holdBox(R, id, n, from, to) {
    if (reduced() || document.hidden) return;
    const prev = R.holds.get(id);
    if (holding(prev) && prev.kind === "new") return; // still to be drawn: drawn at its final box
    // Moved again while held: still from where it was seen last.
    const base = holding(prev) && prev.kind === "box" && prev.el === n ? prev.from : from;
    endHold(prev);
    R.holds.delete(id);
    const move = (Math.abs(base.x - to.x) > 0.5 || Math.abs(base.y - to.y) > 0.5) && ONLY_TRANSLATE_RE.test(n.style.transform || "");
    const grow = to.width > base.width + 0.5 || to.height > base.height + 0.5;
    if (!move && !grow) return;
    const h = { kind: "box", el: n, from: base, to, move, grow, top: grow ? `${-headroom(n)}px` : "0px", a: null, until: now() + HOLD_MS };
    const k = boxKey(h, base);
    h.a = play(n, [k, k], HOLD_MS);
    if (!h.a) return;
    R.holds.set(id, h);
    S.holds++;
  }
  // An element added inside a storyboard's document (same-origin iframe).
  function holdEl(n) {
    if (reduced() || document.hidden) return null;
    const k = { clipPath: "inset(0px 100% 100% 0px)" };
    const a = play(n, [k, k], HOLD_MS);
    if (!a) return null;
    S.holds++;
    return { kind: "el", el: n, a, until: now() + HOLD_MS };
  }
  // The held change of an action plays now, in step with the drag (same
  // duration and curve); what is no longer held only shows the gesture.
  function reveal(a, dur) {
    const out = [];
    const R = a.R;
    const h = R.holds.get(a.itemId);
    if (h) {
      R.holds.delete(a.itemId);
      const live = holding(h);
      endHold(h);
      if (live && h.el.isConnected) {
        if (h.kind === "new") {
          out.push(play(h.el, [{ clipPath: `inset(${h.top} 100% 100% 0px)` }, { clipPath: `inset(${h.top} 0% 0% 0px)` }], dur, EASE_IN_OUT_CSS));
          out.push(materialize(h.el, dur));
        } else if (h.kind === "box") out.push(play(h.el, [boxKey(h, h.from), boxKey(h, h.to)], dur, EASE_IN_OUT_CSS));
      }
    }
    for (const eh of a.ch.holds || []) {
      const live = holding(eh);
      endHold(eh);
      if (live && eh.el.isConnected) {
        out.push(play(eh.el, [{ clipPath: "inset(0px 100% 100% 0px)" }, { clipPath: "inset(0px 0% 0% 0px)" }], dur, EASE_IN_OUT_CSS));
        out.push(materialize(eh.el, dur));
      }
    }
    a.ch.holds = [];
    return out.filter(Boolean);
  }
  // What the agent made materializes as the box is drawn: out of a blur and
  // a touch dim into focus (filter and opacity only, a separate animation
  // that composes with the clip-path reveal).
  function materialize(n, dur) {
    if (reduced()) return null;
    return play(n, [{ filter: "blur(8px)", opacity: 0.45 }, { filter: "blur(2px)", opacity: 0.9, offset: 0.55 }, { filter: "blur(0px)", opacity: 1 }], Math.max(1, dur + 140), EASE_OUT_CSS);
  }
  function releaseChange(ch) {
    for (const h of (ch && ch.holds) || []) endHold(h);
    if (ch) ch.holds = [];
  }

  // Same-origin storyboard iframes: their documents are watched too.
  function hookFrame(R, item, iframe) {
    let F = R.frames.get(iframe);
    if (!F) {
      const t0 = now();
      F = { R, iframe, itemId: item.getAttribute("data-canvas-item-id"), doc: null, docUrl: "", mo: null, offs: [], noisyUntil: 0, pointerAt: -1e9, down: false, readyAt: t0 + SETTLE_MS, lastMut: t0, burstAt: t0, burstOk: false, starts: [], loads: 0, cross: false };
      F.onLoad = () => {
        const t = now();
        // A real document replaced by a new one (a reload), not the first
        // about:blank -> page navigation of a new iframe.
        const reload = F.doc ? !!F.docUrl && F.docUrl !== "about:blank" && t > F.readyAt : F.cross && ++F.loads > 1 && t > F.readyAt;
        attachDoc(F);
        if (F.cross) F.readyAt = t + SETTLE_MS;
        if (reload) frameChange(F, null, "reload");
      };
      iframe.addEventListener("load", F.onLoad);
      R.frames.set(iframe, F);
    }
    attachDoc(F);
  }
  function attachDoc(F) {
    let doc = null;
    try {
      doc = F.iframe.contentDocument;
    } catch (_) {}
    F.cross = !doc;
    if (!doc || !doc.documentElement || F.doc === doc) return;
    unhookFrame(F, false);
    F.doc = doc;
    F.docUrl = doc.URL || "";
    F.readyAt = now() + SETTLE_MS;
    F.lastMut = now();
    const MO = (doc.defaultView && doc.defaultView.MutationObserver) || MutationObserver;
    F.mo = new MO((recs) => {
      try {
        onFrameMutations(F, recs);
      } catch (e) {
        note("frame-mutations", e);
      }
    });
    F.mo.observe(doc.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: FRAME_ATTRS });
    const touch = () => {
      F.pointerAt = now();
    };
    const down = () => {
      F.down = true;
      touch();
    };
    const up = () => {
      F.down = false;
      touch();
    };
    const opts = { capture: true, passive: true };
    for (const [type, fn] of [
      ["pointermove", touch],
      ["wheel", touch],
      ["keydown", touch],
      ["pointerdown", down],
      ["pointerup", up],
      ["pointercancel", up],
    ]) {
      doc.addEventListener(type, fn, opts);
      F.offs.push(() => doc.removeEventListener(type, fn, opts));
    }
  }
  function unhookFrame(F, all) {
    if (F.mo) F.mo.disconnect();
    F.mo = null;
    for (const off of F.offs.splice(0)) {
      try {
        off();
      } catch (_) {}
    }
    F.doc = null;
    if (all && F.onLoad) F.iframe.removeEventListener("load", F.onLoad);
  }
  // Bursts and noise; true when this batch may be an edit.
  function frameNoise(F, t) {
    const fresh = t - F.lastMut > NOISE.gapMs;
    F.lastMut = t;
    if (fresh) {
      F.burstAt = t;
      F.burstOk = t >= F.readyAt; // after silence, on a settled document
      F.starts.push(t);
      if (F.starts.length > NOISE.periodicN) F.starts.shift();
      if (F.starts.length === NOISE.periodicN && t - F.starts[0] < NOISE.periodicSpanMs) {
        const iv = F.starts.slice(1).map((x, i) => x - F.starts[i]);
        if (Math.max(...iv) / Math.max(1, Math.min(...iv)) < NOISE.ratio) mute(F, t);
      }
    } else if (t - F.burstAt > NOISE.continuousMs && t >= F.noisyUntil) {
      mute(F, t);
    }
    return F.burstOk && t >= F.noisyUntil;
  }
  function mute(F, t) {
    F.noisyUntil = t + NOISE.muteMs;
    F.burstOk = false;
    S.muted++;
  }
  function onFrameMutations(F, recs) {
    const body = F.doc && F.doc.body;
    // Only the storyboard's own content counts: a batch that touches nothing
    // in <body> is not an edit of it (every hot update of the dev server
    // re-injects <meta> / <style> tags in the <head> of every storyboard).
    if (!body || !recs.some((r) => {
      const n = r.type === "characterData" ? r.target.parentNode : r.target;
      return !!n && (n === body || body.contains(n));
    })) {
      S.ignored++;
      return;
    }
    const t = now();
    const ok = frameNoise(F, t);
    if (!ok || F.down || t - F.pointerAt < QUIET_MS || quiet(F.R, t) || t < F.noisyUntil || !ownable(F.R)) {
      S.ignored++;
      return;
    }
    const de = F.doc.documentElement;
    const page = Math.max(1, (de.clientWidth || 1) * (de.clientHeight || 1));
    const added = [];
    const changed = [];
    for (const r of recs) {
      if (r.type === "childList") {
        let el1 = false;
        for (const x of r.addedNodes) {
          if (x.nodeType !== 1) continue;
          el1 = true;
          if (x !== body && body.contains(x)) added.push(x);
        }
        if (!el1) changed.push(r.target); // text added or something removed: the parent changed
      } else changed.push(r.type === "characterData" ? r.target.parentElement : r.target);
    }
    // New elements (the outermost ones), not the whole page re-created: drawn.
    const tops = added.filter((x) => !added.some((y) => y !== x && y.contains(x)));
    // React matches unkeyed siblings by position: an element inserted in the
    // middle rewrites the next siblings in place and appends a copy of the
    // last one, so what was appended is not what is new on screen. A batch
    // that also changed a sibling of an added element is an edit of their
    // parent (picked below).
    const shifted = tops.some((x) => {
      const par = x.parentElement;
      return !!par && changed.some((n) => !!n && n !== par && !x.contains(n) && par.contains(n));
    });
    const drawn = [];
    for (const x of shifted ? [] : tops) {
      const b = x.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) continue;
      if (b.width * b.height >= 0.6 * page) {
        drawn.length = 0;
        break;
      }
      drawn.push(x);
    }
    if (drawn.length && drawn.length <= 3) {
      const holds = drawn.map(holdEl).filter(Boolean);
      noteChange(F.R, F.itemId, { kind: "draw-el", target: drawn[0], els: drawn, iframe: F.iframe, holds });
      return;
    }
    frameChange(F, pickTarget(body, changed.concat(tops), page), "content");
  }
  // The element a batch changed: the deepest element holding all the changed
  // ones (else the largest of them), grown to a box worth selecting; never
  // the page itself.
  function pickTarget(body, list, page) {
    const els = [];
    for (const n of list) {
      if (!n || n.nodeType !== 1 || n === body || !body.contains(n) || els.includes(n)) continue;
      els.push(n);
      if (els.length >= 8) break;
    }
    if (!els.length) return null;
    let pick = els[0];
    for (const n of els.slice(1)) while (pick && !pick.contains(n)) pick = pick.parentElement;
    if (!pick || pick === body || !body.contains(pick)) {
      pick = null;
      let best = 0;
      for (const n of els) {
        const b = n.getBoundingClientRect();
        if (b.width * b.height > best) {
          best = b.width * b.height;
          pick = n;
        }
      }
    }
    for (let i = 0; pick && i < 4; i++) {
      const b = pick.getBoundingClientRect();
      if (b.width >= 24 && b.height >= 14) break;
      const p = pick.parentElement;
      if (!p || p === body) break;
      pick = p;
    }
    if (!pick) return null;
    const b = pick.getBoundingClientRect();
    return b.width >= 1 && b.height >= 1 && b.width * b.height < 0.6 * page ? pick : null;
  }
  function frameChange(F, target, kind) {
    const t = now();
    if (quiet(F.R, t) || t < F.noisyUntil) {
      S.ignored++;
      return;
    }
    noteChange(F.R, F.itemId, { kind, target, iframe: F.iframe });
  }

  // Changes of one storyboard within COALESCE_MS are one: the strongest kind
  // wins (added > draw-el > rect > resize > content / reload), a move keeps
  // where it started, held elements add up.
  const RANK = { added: 5, "draw-el": 4, rect: 3, resize: 2, content: 1, reload: 1 };
  function noteChange(R, itemId, ch) {
    if (!itemId) return;
    S.changes++;
    const next = { kind: ch.kind, target: ch.target || null, iframe: ch.iframe || null, els: ch.els || null, from: ch.from || null, to: ch.to || null, holds: ch.holds || [], at: now() };
    const prev = R.pending.get(itemId);
    let m = next;
    if (prev) {
      const keep = (RANK[prev.kind] || 0) > (RANK[next.kind] || 0);
      const a = keep ? prev : next;
      const b = keep ? next : prev;
      m = { ...a, at: next.at, target: a.target || b.target, iframe: a.iframe || b.iframe, holds: prev.holds.concat(next.holds) };
      if (prev.kind === "rect" && prev.from) m.from = prev.from;
      if (prev.kind === "draw-el" && next.kind === "draw-el") m.els = prev.els.concat(next.els.filter((x) => !prev.els.includes(x))).slice(0, 4);
    }
    R.pending.set(itemId, m);
    if (!R.flushT) {
      R.flushT = setTimeout(() => {
        R.flushT = 0;
        try {
          flush(R);
        } catch (e) {
          note("flush", e);
        }
      }, COALESCE_MS);
    }
  }
  function flush(R) {
    if (!roots.has(R.root)) return;
    const list = [...R.pending.entries()].sort((a, b) => a[1].at - b[1].at);
    R.pending.clear();
    for (const [itemId, ch] of list) {
      R.lastItem = itemId;
      const c = assign(R, itemId) || adopt(R, itemId);
      if (!c) {
        releaseChange(ch);
        endHold(R.holds.get(itemId));
        R.holds.delete(itemId);
        continue;
      }
      const kind = ch.kind === "added" || ch.kind === "draw-el" ? "draw" : ch.kind === "rect" ? "box" : ch.target ? "edit" : "focus";
      const a = { kind, R, itemId, ch, at: ch.at, held: R.holds.has(itemId) || ch.holds.length > 0 };
      enqueue(c, a);
      S.lastChange = { id: c.id, itemId, kind: ch.kind, action: kind, element: !!ch.target, at: Date.now() };
    }
  }
  // Which running agent made this change.
  function assign(R, itemId) {
    const cands = [...R.cursors].filter((c) => !c.finishing && c.task.status === "running" && c.pos);
    if (!cands.length) return null;
    if (cands.length === 1) return cands[0];
    let hit = cands.find((c) => c.task.anchor && c.task.anchor.nodeId === itemId);
    if (hit) return hit;
    hit = cands.filter((c) => c.itemId === itemId).sort((a, b) => b.movedAt - a.movedAt)[0];
    if (hit) return hit;
    const item = itemEl(R, itemId);
    const name = item ? nameKey(headerText(item)) : "";
    if (name) {
      hit = cands.find((c) => nameKey(c.task.storyboardName) === name);
      if (hit) return hit;
    }
    const r = item ? itemRect(item) : null;
    if (!r) return cands[0];
    const d = (c) => {
      const a = c.task.anchor && Number.isFinite(c.task.anchor.x) ? c.task.anchor : c.pos;
      const dx = Math.max(r.x - a.x, 0, a.x - (r.x + r.width));
      const dy = Math.max(r.y - a.y, 0, a.y - (r.y + r.height));
      return Math.hypot(dx, dy);
    };
    return cands.sort((a, b) => d(a) - d(b))[0];
  }
  // No running agent here yet: a running chat that is not linked to any canvas
  // on screen takes this change (it is the one editing), enters beside it and
  // stays on this canvas for the rest of its run.
  function adopt(R, itemId) {
    const cands = [...cursors.values()].filter((c) => c.task.kind === "chat" && !c.finishing && c.task.status === "running" && !c.R);
    if (!cands.length) return null;
    const c = cands.sort((a, b) => (CH.first.get(b.id) || 0) - (CH.first.get(a.id) || 0))[0];
    CH.sticky.set(c.id, R.root);
    c.task.sticky = R.root;
    const item = itemEl(R, itemId);
    const ir = item && itemRect(item);
    if (ir && !c.pos) {
      const v = readView(R);
      const z = v ? v.zoom : 1;
      c.pos = { x: ir.x + ir.width / 2 - 150 / z, y: ir.y + Math.min(ir.height * 0.4, 160) + 110 / z };
      c.base = { ...c.pos };
    }
    attach(c, R);
    return c;
  }
  // An element of a storyboard's document in canvas (world) units.
  function elWorldRect(R, iframe, target) {
    const v = R.view || readView(R);
    if (!v || !target || !target.isConnected) return null;
    const rb = R.rb || R.root.getBoundingClientRect();
    const fr = iframe.getBoundingClientRect();
    if (!iframe.offsetWidth || !fr.width) return null;
    const s = fr.width / iframe.offsetWidth; // iframe CSS px -> screen px
    const ox = fr.left + iframe.clientLeft * s;
    const oy = fr.top + iframe.clientTop * s;
    const er = clippedRect(target);
    if (!er || er.width < 0.5 || er.height < 0.5) return null;
    return {
      x: (ox + er.left * s - rb.left - v.x) / v.zoom,
      y: (oy + er.top * s - rb.top - v.y) / v.zoom,
      width: (er.width * s) / v.zoom,
      height: (er.height * s) / v.zoom,
    };
  }
  // An element's box as far as it shows: cut by the ancestors that clip
  // their overflow (a hero section taller than its frame, a scroller).
  function clippedRect(n) {
    const r = n.getBoundingClientRect();
    let l = r.left;
    let t = r.top;
    let rr = r.right;
    let b = r.bottom;
    const win = n.ownerDocument.defaultView || window;
    const body = n.ownerDocument.body;
    for (let p = n.parentElement, i = 0; p && p !== body && i < 12; p = p.parentElement, i++) {
      const cs = win.getComputedStyle(p);
      if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      const q = p.getBoundingClientRect();
      if (cs.overflowX !== "visible") {
        l = Math.max(l, q.left);
        rr = Math.min(rr, q.right);
      }
      if (cs.overflowY !== "visible") {
        t = Math.max(t, q.top);
        b = Math.min(b, q.bottom);
      }
    }
    return rr > l && b > t ? { left: l, top: t, width: rr - l, height: b - t } : null;
  }
  // Elements of a storyboard's document as one box, inside the storyboard.
  function elsWorldRect(R, iframe, els, itemId) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const n of els || []) {
      const w = elWorldRect(R, iframe, n);
      if (!w) continue;
      x0 = Math.min(x0, w.x);
      y0 = Math.min(y0, w.y);
      x1 = Math.max(x1, w.x + w.width);
      y1 = Math.max(y1, w.y + w.height);
    }
    const item = itemEl(R, itemId);
    const ir = item && itemRect(item);
    if (ir) {
      x0 = Math.max(x0, ir.x);
      y0 = Math.max(y0, ir.y);
      x1 = Math.min(x1, ir.x + ir.width);
      y1 = Math.min(y1, ir.y + ir.height);
    }
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
  }

  // ----------------------------------------------------------------- cursors
  const ARROW = '<svg class="rtac-arrow" viewBox="0 0 18 22" width="18" height="22" aria-hidden="true" focusable="false"><path d="M1.5 1.5v15.6l4.3-4 2.9 6.6 2.8-1.2-2.9-6.5h6.1z"/></svg>';
  const CHECK = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><path d="M2.6 6.3 5 8.6l4.4-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function newCursor(task) {
    const c = {
      id: task.id,
      task,
      n: 0,
      color: colorFor(task.id),
      R: null,
      pos: null, // world point of the arrow's tip
      base: null, // where it rests (idling wanders around it)
      focus: null,
      itemId: null,
      tween: null, // idling / a chat's glide in
      act: null, // the running action { a, legs, i, next, anims, sel }
      queue: [],
      sel: null, // its selection
      flight: null, // out of / back into its avatar
      birth: null, // { at, until } while it waits for its avatar
      doneAt: 0,
      homeAt: 0,
      pressA: null,
      nextWanderAt: 0,
      movedAt: 0,
      moves: 0,
      clicks: 0,
      finishing: null,
      fadeT: 0,
      screen: null,
      tr: "",
      entered: false,
    };
    const prev = lastPos.get(task.id);
    if (prev) {
      c.pos = { ...prev.pos };
      c.base = { ...prev.pos };
      c.focus = prev.focus;
      c.itemId = prev.itemId;
    }
    const root = el("div", "rtac-cursor");
    root.setAttribute("data-rtac-id", task.id);
    const body = el("div", "rtac-body");
    const glow = el("span", "rtac-glow");
    body.innerHTML = ARROW;
    body.prepend(glow);
    const ripple = el("span", "rtac-ripple");
    const tag = el("div", "rtac-tag");
    const label = el("button", "rtac-label");
    label.type = "button";
    label.tabIndex = -1;
    const icon = el("span", "rtac-icon");
    const name = el("span", "rtac-name");
    label.append(icon, name);
    const ask = el("span", "rtac-ask");
    ask.textContent = "?";
    tag.append(label, ask);
    // what the agent is doing now ("Editing Hero.tsx", "Thinking…")
    const capEl = el("div", "rtac-cap");
    capEl.setAttribute("aria-hidden", "true");
    const capText = el("span", "rtac-cap-t");
    const dots = el("span", "rtac-dots");
    dots.innerHTML = "<i></i><i></i><i></i>";
    capEl.append(capText, dots);
    body.append(ripple, tag, capEl);
    root.append(body);
    Object.assign(c, { el: root, body, glow, arrow: body.querySelector(".rtac-arrow"), ripple, tag, label, icon, nameEl: name, ask, capEl, capText, capKey: "" });
    c.tool = tools.get(task.id) || null;
    for (const n of [label, ask]) {
      n.addEventListener("pointerenter", () => tipSoon(c));
      n.addEventListener("pointerleave", hideTip);
      n.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openBubble(c);
      });
      n.addEventListener("wheel", (e) => forwardWheel(e, c), { passive: false });
    }
    paintColor(c);
    paintLabel(c);
    return c;
  }
  function paintColor(c) {
    const hex = hexOf(c.color);
    c.el.style.setProperty("--rtac-color", hex);
    if (c.sel) c.sel.el.style.setProperty("--rtac-color", hex);
    if (c.flight && c.flight.trail) c.flight.trail.stops.forEach((s) => s.setAttribute("stop-color", hex));
    if (tipFor === c && tipEl) tipEl.style.setProperty("--rtac-color", hex);
  }

  function paintLabel(c) {
    const text = labelOf(c);
    if (c.nameEl.textContent !== text) {
      c.nameEl.textContent = text;
      c.tagW = 0;
    }
    if (c.sel && c.sel.tagIn.textContent !== text) {
      c.sel.tagIn.textContent = text;
      c.sel.tagW = 0;
    }
    const st = c.finishing ? (c.finishing === "failed" ? "failed" : "done") : c.task.status;
    const iconKey = st === "done" ? "check" : st === "failed" ? "bang" : "";
    if (c.icon.dataset.k !== iconKey) {
      c.icon.dataset.k = iconKey;
      c.icon.innerHTML = iconKey === "check" ? CHECK : iconKey === "bang" ? "!" : "";
    }
    c.el.classList.toggle("rtac--ask", !c.finishing && c.task.status === "needs-input");
    c.el.classList.toggle("rtac--chat", c.task.kind === "chat");
    c.el.classList.toggle("rtac--done", st === "done");
    c.el.classList.toggle("rtac--failed", st === "failed");
    c.el.dataset.status = st;
    const aria = `${text}. ${doingOf(c)}.${c.task.text ? " " + c.task.text.slice(0, 120) : ""}`;
    if (c.label.getAttribute("aria-label") !== aria) c.label.setAttribute("aria-label", aria);
    paintCaption(c);
    if (tipFor === c) paintTip(c);
  }
  // The caption under the tag: the current tool call (from the agent's own
  // stream, "rtcc:activity"), "Thinking" between calls, the status at the end.
  function captionOf(c) {
    if (c.task.kind === "chat") return null;
    if (c.finishing === "failed") return { text: /stop/i.test(c.task.error || "") ? "Stopped" : "Couldn't finish" };
    if (c.finishing === "done") return { text: "Done" };
    if (c.finishing) return null;
    const st = c.task.status;
    if (st === "needs-input") return { text: "Needs your answer" };
    if (st === "queued") return { text: "Starting", dots: true };
    // the gesture on screen says what it is (the stream may be a step ahead)
    if (c.act && c.act.label) return { text: c.act.label };
    const tl = c.tool;
    if (tl && (!tl.endAt || now() - tl.endAt < TOOL_HOLD_MS)) return { text: tl.label };
    return { text: "Thinking", dots: true };
  }
  function paintCaption(c, enterNow) {
    if (!c.capEl) return;
    const cap = captionOf(c);
    const key = cap ? `${cap.text}|${cap.dots ? 1 : 0}` : "";
    if (key === c.capKey && !enterNow) return;
    const was = c.capKey;
    c.capKey = key;
    c.capEl.hidden = !cap;
    if (!cap) return;
    c.capText.textContent = cap.text;
    c.capEl.classList.toggle("rtac-cap--dots", !!cap.dots);
    c.capEl.dataset.k = c.finishing ? c.finishing : c.tool && cap.text === c.tool.label ? c.tool.kind : "";
    // thinking: the glow breathes, the cursor floats (step)
    c.thinking = !!cap.dots && cap.text === "Thinking";
    c.el.classList.toggle("rtac--thinking", c.thinking && !c.flight);
    if (c.thinking) startLoop();
    // a new caption slides in (not the first one while flying: it shows on landing)
    if ((was || enterNow) && !c.flight && !reduced()) animate(c.capEl, [{ opacity: 0, transform: "translateY(-3px)" }, { opacity: 1, transform: "none" }], 220, EASE_OUT_CSS);
    if (c.tool && c.tool.endAt && cap.text === c.tool.label) {
      // back to "Thinking" once the finished call's caption has had its time
      const id = c.id;
      later(() => {
        const c2 = cursors.get(id);
        if (c2) paintCaption(c2);
      }, Math.max(16, TOOL_HOLD_MS - (now() - c.tool.endAt) + 20));
    }
  }

  function startPoint(c, R) {
    if (c.task.kind === "chat") return chatStart(R);
    const a = c.task.anchor;
    if (a && Number.isFinite(a.x) && Number.isFinite(a.y)) {
      if (c.task.source !== "comment") return { x: a.x, y: a.y };
      // beside the comment's pin (its bubble sits above-right of the point)
      const v = R.view || readView(R);
      const z = v && v.zoom > 0 ? v.zoom : 1;
      return { x: a.x + PIN_DX / z, y: a.y + PIN_DY / z };
    }
    let item = a && a.nodeId ? itemEl(R, a.nodeId) : null;
    if (!item && c.task.storyboardName) {
      const want = nameKey(c.task.storyboardName);
      item = [...R.root.querySelectorAll(SEL.item)].find((n) => nameKey(headerText(n)) === want) || null;
    }
    const r = item && itemRect(item);
    if (r) return { x: r.x + r.width / 2, y: r.y + Math.min(r.height * 0.4, 160) };
    const v = readView(R);
    const rb = R.root.getBoundingClientRect();
    return v ? { x: (rb.width / 2 - v.x) / v.zoom, y: (rb.height / 2 - v.y) / v.zoom } : null;
  }

  // Agents sent to the same spot (no selection: all of them at the view's
  // centre) never stack their tags: each next one takes the nearest free
  // place of a column around it (34 px apart on screen, below then above),
  // as presence cursors do.
  function freeSpot(R, c, p) {
    if (!p) return p;
    const z = (R.view || readView(R) || { zoom: 1 }).zoom || 1;
    const taken = (q) => [...R.cursors].some((o) => o !== c && o.pos && Math.abs((o.pos.x - q.x) * z) < 150 && Math.abs((o.pos.y - q.y) * z) < 30);
    for (let k = 0; k < 16; k++) {
      const dy = k ? (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 34 : 0;
      const q = { x: p.x, y: p.y + dy / z };
      if (!taken(q)) return q;
    }
    return p;
  }

  function attach(c, R) {
    if (c.R === R) return;
    detach(c);
    c.R = R;
    placeDirty = true;
    R.cursors.add(c);
    R.layer.append(c.el);
    if (!c.pos) {
      c.pos = freeSpot(R, c, startPoint(c, R));
      c.base = c.pos ? { ...c.pos } : null;
    }
    c.el.hidden = !c.pos || !!c.birth; // a newborn waits for its avatar
    c.tr = "";
    c.nextWanderAt = now() + 1400;
    observe(R);
    if (c.birth) tryBirth(c, false);
    else if (!c.entered && c.pos) enter(c, R);
    const pend = pendingTools.get(c.id);
    if (pend) {
      pendingTools.delete(c.id);
      for (const d of pend) queueTool(c, d);
    }
  }
  // Appears where it is (no avatar to come out of, or no motion).
  function enter(c, R) {
    c.entered = true;
    c.el.hidden = !c.pos;
    c.landedAt = now();
    if (reduced()) {
      animate(c.body, [{ opacity: 0 }, { opacity: 1 }], RM_MS, "linear");
      return;
    }
    animate(c.body, [{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "scale(1.06)", offset: 0.6 }, { opacity: 1, transform: "none" }], 260, EASE_OUT_CSS);
    if (c.task.kind === "chat" && !c.tween && R) {
      // A chat agent enters near the work area: a short glide in.
      const v = readView(R);
      const z = v ? v.zoom : 1;
      const to = { ...c.pos };
      c.pos = { x: to.x - 80 / z, y: to.y + 56 / z };
      c.tween = mkTween(c.pos, to, 600, easeInOut, 0.18);
      c.nextWanderAt = now() + 600 + 1600;
    }
    startLoop();
  }
  function detach(c) {
    if (!c.R) return;
    abortAct(c, false);
    if (c.flight) endFlight(c, false);
    if (c.sel) killSel(c.sel);
    c.sel = null;
    c.R.cursors.delete(c);
    c.el.remove();
    if (c.edge) {
      c.edge.remove();
      c.edgeOn = false;
    }
    c.R = null;
    c.tween = null;
    c.orbit = null;
    if (c.birth) c.birth = null; // shown normally when its canvas comes back
    if (c.base && c.pos) c.pos = { ...c.base };
    if (tipFor === c) hideTip();
  }
  function removeCursor(c) {
    clearTimeout(c.fadeT);
    if (c.pos) lastPos.set(c.id, { pos: { ...(c.base || c.pos) }, focus: c.focus, itemId: c.itemId });
    if (lastPos.size > COLORS_MAX) lastPos.delete(lastPos.keys().next().value);
    detach(c);
    if (c.flight) endFlight(c, false);
    c.el.remove();
    cursors.delete(c.id);
  }
  function finish(c, how) {
    if (c.finishing) return;
    c.finishing = how; // "done" | "failed" | "gone"
    c.birth = null;
    c.tween = null;
    if (how !== "done") abortAct(c, false); // done: what it already did still plays (2.6 s at most)
    paintLabel(c);
    if (!c.R || (c.el.hidden && !c.flight)) return removeCursor(c);
    if (how === "done") {
      c.doneAt = now();
      startLoop();
      return;
    }
    fadeOut(c, how);
  }
  // The check (or "!"), then a fade in place.
  function fadeOut(c, how) {
    if (c.fadeT) return;
    if (c.flight) endFlight(c, true);
    abortAct(c, false);
    if (c.sel) fadeSel(c.sel);
    c.sel = null;
    const rm = reduced();
    // a failure: a contained shake of the arrow and its tag before the fade
    if (how === "failed" && !rm) animate(c.body, [{ transform: "translateX(0)" }, { transform: "translateX(-3px)", offset: 0.2 }, { transform: "translateX(3px)", offset: 0.4 }, { transform: "translateX(-2px)", offset: 0.6 }, { transform: "translateX(2px)", offset: 0.8 }, { transform: "translateX(0)" }], 360, EASE_IN_OUT_CSS);
    c.el.classList.add(rm ? "rtac--out-rm" : "rtac--out", how === "failed" ? "rtac--failed" : how === "gone" ? "rtac--gone" : "rtac--done");
    c.el.style.setProperty("--rtac-fade", `${rm ? 900 + RM_MS : FADE_MS}ms`);
    c.fadeT = setTimeout(() => removeCursor(c), rm ? 900 + RM_MS : FADE_MS);
    startLoop();
  }
  function unfinish(c) {
    clearTimeout(c.fadeT);
    c.fadeT = 0;
    c.finishing = null;
    c.doneAt = 0;
    c.homeAt = 0;
    if (c.flight && c.flight.kind === "home") endFlight(c, true);
    c.el.classList.remove("rtac--out", "rtac--out-rm", "rtac--failed", "rtac--gone", "rtac--done");
    paintLabel(c);
  }
  // Done and nothing left to show: the check, then home.
  function homeCheck(c, t) {
    if (c.flight || c.fadeT) return;
    if (c.act || c.queue.length) {
      if (t - c.doneAt < 2600) return;
      abortAct(c, false);
    }
    // A comment's cursor goes back to its pin first: the request is answered there.
    if (!c.returned && c.task.source === "comment" && c.R && c.R.view && c.pos) {
      c.returned = true;
      const p = startPoint(c, c.R);
      const z = c.R.view.zoom;
      if (p && Math.hypot((p.x - c.pos.x) * z, (p.y - c.pos.y) * z) > 12 && !reduced()) {
        enqueue(c, { kind: "tool", R: c.R, itemId: "", point: p, ch: { kind: "return", holds: [] }, at: t, held: false });
        c.doneAt = t;
        return;
      }
    }
    if (!c.homeAt) {
      c.homeAt = t + (reduced() ? 900 : CHECK_MS);
      return;
    }
    if (t >= c.homeAt) goHome(c);
  }
  function goHome(c) {
    const av = c.task.kind === "chat" ? null : bubbleEl(c.id);
    const r = av && av.getBoundingClientRect();
    if (reduced() || document.hidden || !r || r.width < 8 || !c.screen || !c.R || !c.R.rb || !inBox(c.screen, c.R.rb, 0)) return fadeOut(c, "done");
    if (c.sel) fadeSel(c.sel);
    c.sel = null;
    startFlight(c, "home", rectOf(r));
  }
  const inBox = (p, r, m) => p.x >= r.left - m && p.x <= r.right + m && p.y >= r.top - m && p.y <= r.bottom + m;

  function animate(node, frames, duration, easing, fill, delay) {
    try {
      if (node.animate) return node.animate(frames, { duration, easing, fill: fill || "none", delay: delay || 0 });
    } catch (_) {}
    return null;
  }

  // -------------------------------------------------------------- selections
  // One per agent at a time (pen.dev / Figma): an outline in its colour,
  // corner handles, its tag; "draw" mode while a box is being dragged out
  // (tinted, "W × H" under it). Transforms only: edges are 1 px strips
  // scaled to the box, so the outline stays 1.5 px at any zoom.
  // src: what it outlines when no gesture drives it: { type: "item", itemId }
  // or { type: "el", els, iframe, itemId }.
  const TAG_H = 18;
  function sameSrc(a, b) {
    if (!a || !b || a.type !== b.type || a.itemId !== b.itemId) return false;
    return a.type === "item" || (a.els && b.els && a.els[0] === b.els[0]);
  }
  function mkSel(c, R, src, mode) {
    const n = el("div", "rtac-sel");
    n.setAttribute("aria-hidden", "true");
    n.style.setProperty("--rtac-color", hexOf(c.color));
    const fill = el("div", "rtac-sel-fill");
    const edges = ["n", "s", "w", "e"].map((k) => el("div", `rtac-sel-edge rtac-sel-${k}`));
    const knobs = [0, 1, 2, 3].map(() => {
      const o = el("div", "rtac-sel-knob");
      o.append(el("i"));
      return o;
    });
    const tag = el("div", "rtac-sel-tag");
    const tagIn = el("span");
    tagIn.textContent = labelOf(c);
    tag.append(tagIn);
    const size = el("div", "rtac-sel-size");
    const sizeIn = el("span");
    size.append(sizeIn);
    n.append(fill, ...edges, ...knobs, tag, size);
    n.dataset.mode = mode;
    return { c, R, src, mode, el: n, fill, edges, knobs, tag, tagIn, size, sizeIn, override: null, world: null, readAt: 0, itemNode: null, key: "", until: Infinity, dying: false, showSize: false, sizeText: "", tagW: 0, tagX: 0, tagY: 0, born: now() };
  }
  function beginSel(c, R, src, mode, rect) {
    let s = c.sel;
    if (s && s.R === R && !s.dying && sameSrc(s.src, src)) {
      s.src = src;
    } else {
      if (s) fadeSel(s);
      s = mkSel(c, R, src, mode);
      c.sel = s;
      R.sels.add(s);
      R.layer.insertBefore(s.el, R.layer.firstChild);
      if (mode === "on") {
        if (reduced()) animate(s.el, [{ opacity: 0 }, { opacity: 1 }], RM_MS, "linear");
        else drawOn(s);
      }
    }
    s.mode = mode;
    s.el.dataset.mode = mode;
    s.override = rect ? { ...rect } : null;
    s.until = Infinity;
    if (rect) s.world = { ...rect };
    return s;
  }
  // The outline is drawn as a stroke: clockwise from the top-left corner,
  // one edge after the other (clip-path on each 1 px strip, so the
  // per-frame transforms are untouched), 0.4 s in all.
  function drawOn(s) {
    const [n, so, we, ea] = s.edges;
    const seq = [
      [n, "inset(0 100% 0 0)", "inset(0 0 0 0)"],
      [ea, "inset(0 0 100% 0)", "inset(0 0 0 0)"],
      [so, "inset(0 0 0 100%)", "inset(0 0 0 0)"],
      [we, "inset(100% 0 0 0)", "inset(0 0 0 0)"],
    ];
    seq.forEach(([e, a, b], i) => animate(e, [{ clipPath: a }, { clipPath: b }], 110, "linear", "backwards", i * 95));
    animate(s.fill, [{ opacity: 0.9 }, { opacity: 0 }], 520, EASE_OUT_CSS, "none", 260);
  }
  function settleSel(s) {
    if (!s || s.dying) return;
    s.mode = "on";
    s.el.dataset.mode = "on";
    s.override = null;
    s.showSize = false;
    s.el.removeAttribute("data-size");
  }
  function fadeSel(s) {
    if (!s || s.dying) return;
    s.dying = true;
    if (s.c.sel === s) s.c.sel = null;
    s.el.setAttribute("data-dying", "");
    setTimeout(() => killSel(s), reduced() ? RM_MS + 20 : 380);
  }
  function killSel(s) {
    s.dying = true;
    if (s.c.sel === s) s.c.sel = null;
    s.el.remove();
    s.R.sels.delete(s);
  }
  // Read phase: the selection's box in canvas units.
  function readSel(s, t) {
    if (!s.tagW) s.tagW = s.tag.offsetWidth || 0;
    if (s.override) {
      s.world = s.override;
      return;
    }
    const R = s.R;
    if (s.src.type === "item") {
      // Held at its old box (a move / resize still to be shown): that box.
      const h = R.holds.get(s.src.itemId);
      if (holding(h) && h.kind === "box") {
        s.world = { ...h.from };
        return;
      }
      if (!s.itemNode || !s.itemNode.isConnected) s.itemNode = itemEl(R, s.src.itemId);
      const r = s.itemNode && itemRect(s.itemNode);
      if (r) s.world = r;
      else if (!s.itemNode) fadeSel(s);
      return;
    }
    if (t - s.readAt < 250 && s.world) return;
    s.readAt = t;
    const w = elsWorldRect(R, s.src.iframe, s.src.els, s.src.itemId);
    if (w) s.world = w;
    else if (!s.src.els.some((n) => n.isConnected)) fadeSel(s);
  }
  // Write phase: tags of overlapping selections step aside, then each box. A
  // storyboard's tag goes over its top-right corner (its own name is on the
  // left), an element's over its top-left one.
  function drawSels(R) {
    const v = R.view;
    const list = [...R.sels].filter((s) => s.world).sort((a, b) => a.born - b.born);
    const placed = [];
    // Cursor tags (layer px). A selection's tag steps back while its own
    // cursor is on it (that tag already says whose it is) or under another
    // cursor's tag.
    const tags = [];
    for (const c of R.cursors) {
      if (!c.pos || c.flight || c.el.hidden) continue;
      tags.push({ c, px: v.x + c.pos.x * v.zoom, py: v.y + c.pos.y * v.zoom, x: v.x + c.pos.x * v.zoom + 13, y: v.y + c.pos.y * v.zoom + 18, w: c.tagW || 100 });
    }
    for (const s of list) {
      const w = s.world;
      const x = v.x + w.x * v.zoom;
      const y = v.y + w.y * v.zoom;
      const tw = s.tagW || 90;
      let tx = s.src.type === "item" ? x + w.width * v.zoom + 0.75 - tw : x - 0.75;
      let ty = y - TAG_H - 5;
      if (ty < 2) ty = y + 5; // clipped above: inside the corner
      for (let pass = 0; pass < 2; pass++) {
        for (const p of placed) if (Math.abs(p.y - ty) < TAG_H && tx < p.x + p.w + 4 && tx + tw > p.x) tx = p.x + p.w + 4;
      }
      placed.push({ x: tx, y: ty, w: tw });
      s.tagX = tx - x;
      s.tagY = ty - y;
      const bw = w.width * v.zoom;
      const bh = w.height * v.zoom;
      const under = tags.some((g) =>
        g.c === s.c
          ? Math.hypot(Math.max(x - g.px, 0, g.px - (x + bw)), Math.max(y - g.py, 0, g.py - (y + bh))) < 24
          : g.x < tx + tw + 2 && g.x + g.w > tx - 2 && g.y < ty + TAG_H + 2 && g.y + 20 > ty - 2
      );
      if (under !== s.under && !s.dying) {
        s.under = under;
        s.el.toggleAttribute("data-under", under);
      }
      drawSel(s, x, y, w.width * v.zoom, w.height * v.zoom);
    }
  }
  function drawSel(s, x, y, w, h) {
    w = Math.max(0, w);
    h = Math.max(0, h);
    const k = `${r2(x)},${r2(y)},${r2(w)},${r2(h)},${r2(s.tagX)},${r2(s.tagY)}`;
    if (k === s.key) return;
    s.key = k;
    s.el.style.transform = `translate3d(${r2(x)}px, ${r2(y)}px, 0)`;
    s.fill.style.transform = `scale(${r2(w)}, ${r2(h)})`;
    const [n, so, we, ea] = s.edges;
    n.style.transform = `translate3d(-0.75px, -0.75px, 0) scale(${r2(w + 1.5)}, 1)`;
    so.style.transform = `translate3d(-0.75px, ${r2(h - 0.75)}px, 0) scale(${r2(w + 1.5)}, 1)`;
    we.style.transform = `translate3d(-0.75px, -0.75px, 0) scale(1, ${r2(h + 1.5)})`;
    ea.style.transform = `translate3d(${r2(w - 0.75)}px, -0.75px, 0) scale(1, ${r2(h + 1.5)})`;
    const pts = [
      [0, 0],
      [w, 0],
      [0, h],
      [w, h],
    ];
    s.knobs.forEach((o, i) => {
      o.style.transform = `translate3d(${r2(pts[i][0] - 3.5)}px, ${r2(pts[i][1] - 3.5)}px, 0)`;
    });
    s.tag.style.transform = `translate3d(${r2(s.tagX)}px, ${r2(s.tagY)}px, 0)`;
    s.size.style.transform = `translate3d(calc(${r2(w / 2)}px - 50%), ${r2(h + 7)}px, 0)`;
  }
  function sizeLabel(s, w, h) {
    const txt = `${Math.max(0, Math.round(w))} × ${Math.max(0, Math.round(h))}`;
    if (!s.showSize) {
      s.showSize = true;
      s.el.setAttribute("data-size", "");
    }
    if (txt !== s.sizeText) {
      s.sizeText = txt;
      s.sizeIn.textContent = txt;
    }
  }

  // ------------------------------------------------------------------ actions
  // Every change becomes an action of the agent's cursor (see the header):
  // a list of legs (travel, press, drag, release, dwell) the frame loop runs
  // one after the other, each starting exactly where the last one ended.
  function enqueue(c, a) {
    const i = c.queue.findIndex((q) => q.R === a.R && q.itemId === a.itemId && q.kind === a.kind && (q.kind !== "edit" || q.ch.target === a.ch.target));
    if (i >= 0) {
      const q = c.queue.splice(i, 1)[0];
      if (a.kind === "box" && q.ch.from) a.ch.from = q.ch.from;
      a.ch.holds = (q.ch.holds || []).concat(a.ch.holds || []);
      a.held = a.held || q.held;
    }
    if (a.held) {
      // Held changes first: each is shown before its hold runs out.
      let j = 0;
      while (j < c.queue.length && c.queue[j].held) j++;
      c.queue.splice(j, 0, a);
    } else c.queue.push(a);
    while (c.queue.length > QUEUE_MAX) {
      let j = c.queue.findIndex((q) => !q.held);
      if (j < 0) j = 0;
      dropAction(c.queue.splice(j, 1)[0]);
      S.dropped++;
    }
    S.maxQueue = Math.max(S.maxQueue, c.queue.length + (c.act ? 1 : 0));
    startLoop();
  }
  function dropAction(a) {
    if (!a) return;
    releaseChange(a.ch);
    const h = a.R.holds.get(a.itemId);
    if (h) {
      endHold(h);
      a.R.holds.delete(a.itemId);
    }
  }
  // Lands the running action at once (its end state, the change shown).
  function abortAct(c, keepQueue) {
    const A = c.act;
    if (A) {
      c.act = null;
      for (let i = A.i; i < A.legs.length; i++) {
        const L = A.legs[i];
        if (L.to) c.pos = { ...L.to };
        try {
          if (L.skip) L.skip(c, A);
        } catch (e) {
          note("skip", e);
        }
      }
      for (const an of A.anims) {
        try {
          an.finish();
        } catch (_) {}
      }
      dropAction(A.a);
      releasePress(c, true);
      if (A.sel && !A.sel.dying) {
        settleSel(A.sel);
        A.sel.until = now() + SEL_IDLE_MS;
      }
      if (c.pos) c.base = { ...c.pos };
      paintCaption(c);
    }
    if (!keepQueue) {
      for (const a of c.queue) dropAction(a);
      c.queue = [];
    }
  }
  const canAct = (c) => !!c.R && !c.flight && !c.birth && !c.el.hidden && !!c.pos && !c.fadeT && (!c.finishing || c.finishing === "done");
  function nextAction(c, t) {
    while (c.queue.length) {
      const a = c.queue.shift();
      let legs = null;
      try {
        legs = a.R === c.R && a.R.view ? plan(c, a) : null;
      } catch (e) {
        note("plan", e);
      }
      if (!legs) {
        dropAction(a);
        continue;
      }
      c.tween = null;
      c.act = { a, legs, i: 0, next: t, anims: [], sel: null, label: actLabel(a) };
      c.moves++;
      c.movedAt = t;
      c.itemId = a.itemId;
      S.actions[a.kind] = (S.actions[a.kind] || 0) + 1;
      trace(c.id, a.kind, { itemId: a.itemId, change: a.ch.kind, held: a.held });
      paintLabel(c);
      return true;
    }
    return false;
  }
  // What a gesture shows in the caption: the tool call it plays, or the
  // change on the canvas it shows ("Adding Red Square").
  function actLabel(a) {
    if (a.kind === "tool") return a.label || null;
    const item = itemEl(a.R, a.itemId);
    const name = item ? headerText(item) : "";
    if (!name || (a.ch && a.ch.kind === "land")) return null;
    if (a.kind === "draw") return a.ch && a.ch.kind === "draw-el" ? `Adding to ${name}` : `Adding ${name}`;
    if (a.kind === "box") {
      const from = a.ch && a.ch.from;
      const ir = item && itemRect(item);
      return from && ir && (Math.abs(from.width - ir.width) > 0.5 || Math.abs(from.height - ir.height) > 0.5) ? `Resizing ${name}` : `Moving ${name}`;
    }
    if (a.kind === "edit") return `Editing ${name}`;
    return null;
  }
  function runAct(c, t) {
    const A = c.act;
    for (let guard = 0; guard < 16 && c.act === A; guard++) {
      const L = A.legs[A.i];
      if (!L.on) {
        L.on = true;
        L.t0 = A.next;
        if (L.kind === "travel") beginTravel(c, L, A);
        else if (L.kind === "drag" && !L.from) L.from = { ...c.pos };
        if (L.start) {
          try {
            L.start(c, t, L, A);
          } catch (e) {
            note("leg", e);
          }
        }
      }
      const p = L.dur > 0 ? clamp((t - L.t0) / L.dur, 0, 1) : 1;
      const e = L.ease ? L.ease(p) : p;
      if (L.kind === "travel" && L.dur > 0) c.pos = quad(L.from, L.ctrl, L.to, e);
      else if (L.kind === "drag") c.pos = { x: lerp(L.from.x, L.to.x, e), y: lerp(L.from.y, L.to.y, e) };
      if (L.tick) {
        try {
          L.tick(c, e, L, A);
        } catch (er) {
          note("leg", er);
        }
      }
      if (p < 1) return;
      if (L.to) c.pos = { ...L.to };
      if (L.end) {
        try {
          L.end(c, t, L, A);
        } catch (er) {
          note("leg", er);
        }
      }
      A.next = L.t0 + L.dur;
      A.i++;
      if (A.i >= A.legs.length) {
        c.act = null;
        c.base = { ...c.pos };
        if (A.sel && !A.sel.dying) {
          A.sel.until = t + SEL_IDLE_MS;
          c.focus = A.sel.world ? { ...A.sel.world } : c.focus;
        }
        c.nextWanderAt = t + 1600;
        paintLabel(c);
        return;
      }
    }
  }
  const quad = (a, k, b, e) => {
    const u = 1 - e;
    return { x: u * u * a.x + 2 * u * e * k.x + e * e * b.x, y: u * u * a.y + 2 * u * e * k.y + e * e * b.y };
  };
  // A travel's duration and arc are set when it starts, from where the
  // cursor is then; a held change caps it so the drag starts in time.
  function beginTravel(c, L, A) {
    const R = c.R;
    const z = R.view.zoom;
    L.from = { ...c.pos };
    // Another agent already there: stop a little aside.
    for (const o of R.cursors) {
      if (o === c || !o.base || o.finishing) continue;
      if (Math.hypot((o.base.x - L.to.x) * z, (o.base.y - L.to.y) * z) < 18) L.to = { x: L.to.x + 16 / z, y: L.to.y + 12 / z };
    }
    const d = Math.hypot(L.to.x - L.from.x, L.to.y - L.from.y) * z;
    if (reduced() || d < 2) {
      L.dur = 0;
      return;
    }
    let dur = clamp(240 + d * 0.55, 300, 820) * L.k;
    if (L.cap) dur = Math.min(dur, L.cap);
    if (A.a.held) {
      const h = A.a.R.holds.get(A.a.itemId) || (A.a.ch.holds && A.a.ch.holds[0]);
      if (h && h.a) dur = Math.min(dur, Math.max(160, h.until - now() - 130));
    }
    L.dur = Math.max(160, dur);
    const side = (c.color % 2 ? 1 : -1) * (Math.random() < 0.8 ? 1 : -1);
    const bend = 0.16;
    const dx = L.to.x - L.from.x;
    const dy = L.to.y - L.from.y;
    L.ctrl = { x: (L.from.x + L.to.x) / 2 - dy * bend * side, y: (L.from.y + L.to.y) / 2 + dx * bend * side };
  }
  const travel = (to, k, cap) => ({ kind: "travel", to: { ...to }, k, cap: cap || 0, dur: 0, ease: easeInOut });
  const pressLeg = (start) => ({ kind: "press", dur: reduced() ? 0 : 90, start });
  const dwell = (ms) => ({ kind: "dwell", dur: reduced() ? 380 : ms });

  // The legs of an action, from the boxes as they are now.
  function plan(c, a) {
    const R = a.R;
    const z = R.view.zoom;
    const k = 1 / (1 + 0.45 * c.queue.length); // a long queue plays faster
    if (a.kind === "tool") return planTool(c, a, k, z);
    const item = itemEl(R, a.itemId);
    const ir = item && itemRect(item);
    if (a.kind === "draw") {
      const box = a.ch.kind === "draw-el" ? elsWorldRect(R, a.ch.iframe, a.ch.els, a.itemId) : ir;
      if (box && box.width * z >= 6 && box.height * z >= 6) {
        const src = a.ch.kind === "draw-el" ? { type: "el", els: a.ch.els, iframe: a.ch.iframe, itemId: a.itemId } : { type: "item", itemId: a.itemId };
        return planDraw(c, a, box, src, k, z);
      }
    }
    if (a.kind === "box" && ir) {
      const from = a.ch.from || ir;
      if (!sameRect(from, ir)) return planBox(c, a, from, ir, k, z);
    }
    if (a.kind === "edit" && a.ch.target && a.ch.iframe) {
      const w = elsWorldRect(R, a.ch.iframe, [a.ch.target], a.itemId);
      if (w) return planClick(c, a, w, { type: "el", els: [a.ch.target], iframe: a.ch.iframe, itemId: a.itemId }, k, z);
    }
    if (!ir) return null;
    // Not drawable after all (no box yet): whatever was held shows now.
    if (a.held) {
      releaseChange(a.ch);
      endHold(R.holds.get(a.itemId));
      R.holds.delete(a.itemId);
    }
    return planClick(c, a, ir, { type: "item", itemId: a.itemId }, k, z, a.here);
  }
  // Press on the top-left corner, drag out to the final size, the content
  // revealed inside the box as it grows.
  function planDraw(c, a, box, src, k, z) {
    const corner = { x: box.x, y: box.y };
    const far = { x: box.x + box.width, y: box.y + box.height };
    const diag = Math.hypot(box.width, box.height) * z;
    const dur = reduced() ? 0 : clamp(300 + diag * 0.32, 380, 640) * Math.max(0.6, k);
    return [
      travel(corner, k),
      pressLeg((c2, t, L, A) => {
        press(c2);
        A.sel = beginSel(c2, a.R, src, "draw", { x: box.x, y: box.y, width: 0, height: 0 });
      }),
      {
        kind: "drag",
        dur,
        from: corner,
        to: far,
        ease: easeInOut,
        start: (c2, t, L, A) => {
          A.anims.push(...reveal(a, Math.max(1, dur)));
        },
        tick: (c2, e, L, A) => {
          if (!A.sel || A.sel.dying) return;
          A.sel.override = { x: box.x, y: box.y, width: box.width * e, height: box.height * e };
          sizeLabel(A.sel, box.width * e, box.height * e);
        },
        skip: (c2, A) => {
          if (A.sel) A.sel.override = null;
        },
      },
      {
        kind: "release",
        dur: reduced() ? 0 : 130,
        start: (c2, t, L, A) => {
          releasePress(c2);
          settleSel(A.sel);
        },
      },
      dwell(160 * k),
    ];
  }
  // Grab the box (its top-left area to move it, its bottom-right handle to
  // resize it) and drag it from the old box to the new one.
  function planBox(c, a, A0, B, k, z) {
    const resize = Math.abs(A0.width - B.width) > 0.5 || Math.abs(A0.height - B.height) > 0.5;
    const grabA = resize ? { x: A0.x + A0.width, y: A0.y + A0.height } : { x: A0.x + Math.min(A0.width * 0.3, 64 / z), y: A0.y + Math.min(A0.height * 0.12, 28 / z) };
    const grabB = resize ? { x: B.x + B.width, y: B.y + B.height } : { x: grabA.x + (B.x - A0.x), y: grabA.y + (B.y - A0.y) };
    const d = Math.hypot(grabB.x - grabA.x, grabB.y - grabA.y) * z;
    const dur = reduced() ? 0 : clamp(280 + d * 0.55, 360, 700) * Math.max(0.6, k);
    const src = { type: "item", itemId: a.itemId };
    return [
      travel(grabA, k),
      pressLeg((c2, t, L, A) => {
        press(c2);
        A.sel = beginSel(c2, a.R, src, "on", A0);
      }),
      {
        kind: "drag",
        dur,
        from: grabA,
        to: grabB,
        ease: easeInOut,
        start: (c2, t, L, A) => {
          A.anims.push(...reveal(a, Math.max(1, dur)));
        },
        tick: (c2, e, L, A) => {
          if (!A.sel || A.sel.dying) return;
          const r = { x: lerp(A0.x, B.x, e), y: lerp(A0.y, B.y, e), width: lerp(A0.width, B.width, e), height: lerp(A0.height, B.height, e) };
          A.sel.override = r;
          if (resize) sizeLabel(A.sel, r.width, r.height);
        },
        skip: (c2, A) => {
          if (A.sel) A.sel.override = null;
        },
      },
      {
        kind: "release",
        dur: reduced() ? 0 : 130,
        start: (c2, t, L, A) => {
          releasePress(c2);
          settleSel(A.sel);
        },
      },
      dwell(160 * k),
    ];
  }
  // Go to it, click, select it.
  function planClick(c, a, w, src, k, z, here) {
    const pt = here ? { ...c.pos } : src.type === "el" ? { x: w.x + Math.min(w.width * 0.35, 56 / z), y: w.y + Math.min(w.height * 0.5, 22 / z) } : { x: w.x + Math.min(w.width * 0.5, 120 / z), y: w.y + Math.min(w.height * 0.3, 120 / z) };
    // The change is on screen already: get there quickly.
    return [
      travel(pt, k, 440),
      pressLeg((c2) => press(c2)),
      {
        kind: "release",
        dur: reduced() ? 0 : 120,
        start: (c2, t, L, A) => {
          releasePress(c2);
          ripple(c2);
          A.sel = beginSel(c2, a.R, src, "on", null);
          if (!A.sel.world) A.sel.world = { ...w };
          if (!reduced()) animate(A.sel.fill, [{ opacity: 1 }, { opacity: 0 }], 420, EASE_OUT_CSS); // the click lands
        },
      },
      dwell(220 * k),
    ];
  }
  // A tool call from the agent's stream: to its storyboard (click, select it
  // in the agent's colour) or to its point on the canvas (click).
  function planTool(c, a, k, z) {
    if (a.itemId) {
      const item = itemEl(a.R, a.itemId);
      const ir = item && itemRect(item);
      if (ir) return planClick(c, a, ir, { type: "item", itemId: a.itemId }, k, z);
    }
    if (!a.point) return null;
    return [
      travel(a.point, k, 560),
      pressLeg((c2) => press(c2)),
      {
        kind: "release",
        dur: reduced() ? 0 : 120,
        start: (c2) => {
          releasePress(c2);
          ripple(c2);
        },
      },
      dwell(260 * k),
    ];
  }
  function press(c) {
    c.clicks++;
    c.lastClickAt = Date.now();
    if (reduced()) return;
    releasePress(c, true);
    c.pressA = animate(c.arrow, [{ transform: "scale(1)" }, { transform: "scale(0.84)" }], 90, EASE_OUT_CSS, "forwards");
  }
  function releasePress(c, silent) {
    if (!c.pressA) return;
    try {
      c.pressA.cancel();
    } catch (_) {}
    c.pressA = null;
    if (!silent && !reduced()) animate(c.arrow, [{ transform: "scale(0.84)" }, { transform: "scale(1)" }], 160, EASE_OUT_CSS);
  }
  function ripple(c) {
    if (reduced()) return;
    animate(c.ripple, [{ transform: "translate(-50%, -50%) scale(0.2)", opacity: 0.55 }, { transform: "translate(-50%, -50%) scale(1)", opacity: 0 }], 520, EASE_OUT_CSS);
  }

  // ------------------------------------------------------------------ flights
  // Out of the avatar on launch, back into it when done: the cursor leaves
  // its canvas layer for a fixed full-window one (never clipped), its end
  // point followed live (pan, zoom, resize, the avatar moving).
  function ensureSky() {
    if (sky && sky.isConnected) return sky;
    sky = el("div", "rtac-sky");
    sky.setAttribute("data-rtac-sky", "");
    document.body.appendChild(sky);
    return sky;
  }
  // The task's avatar on screen: the composer's first, else any of its bubbles.
  function bubbleEl(id) {
    const q = `.rtcb-bubble[data-id="${CSS.escape(id)}"]`;
    for (const n of [...document.querySelectorAll(`[data-rtcb-host] ${q}`), ...document.querySelectorAll(q)]) {
      if (n.hidden || n.closest("[hidden]")) continue;
      const r = n.getBoundingClientRect();
      if (r.width >= 8 && r.height >= 8 && r.bottom > 0 && r.right > 0 && r.left < innerWidth && r.top < innerHeight) return n;
    }
    return null;
  }
  // No avatar: where the composer of that canvas view is.
  function composerRect(R) {
    const shell = R.root.closest(SEL.shell) || document;
    for (const s of ["[data-rtcb-host]", SEL.composer]) {
      for (const n of shell.querySelectorAll(s)) {
        const r = rectOf(n.getBoundingClientRect());
        if (r && r.width >= 8) return r;
      }
    }
    return null;
  }
  function birthUntil(id) {
    const b = births.get(id);
    return (b ? Math.max(b.at, now()) : now()) + BIRTH_WAIT_MS;
  }
  function tryBirth(c, force) {
    const b = c.birth;
    if (!b || c.flight || !c.R || !c.pos) return;
    const t = now();
    const info = births.get(c.id);
    let src = info && info.avatar;
    // A launched agent: out of its avatar while the avatar still enters
    // (rtcb:avatar-in, when the entrance ends, is not waited for), as soon
    // as the spark from its pin has landed on it.
    const pop = Math.max(b.at + (info && (info.launch || info.pin) ? BIRTH_POP_MS : 380), (info && info.sparkLands) || 0);
    if (!src && (force || t >= pop)) {
      const n = bubbleEl(c.id);
      if (n) src = rectOf(n.getBoundingClientRect());
    }
    const until = info && info.pin ? Math.min(b.until, b.at + PIN_WAIT_MS) : b.until;
    if (!src && !force && t < until) {
      armBirth(t < pop ? pop - t : 40);
      return;
    }
    // no avatar on screen: out of the comment's pin, else the launch's field
    if (!src && info && info.pin) src = info.pin;
    if (!src && info && info.launch) src = info.launch;
    if (!src) src = composerRect(c.R);
    c.birth = null;
    if (!src || reduced() || document.hidden) return enter(c, c.R);
    startFlight(c, "birth", src);
  }
  // A plain timer (short, only while a cursor waits to be born): it must
  // fire on time even while the rest of the page is busy painting.
  function armBirth(ms) {
    if (birthWake) return;
    const h = { t: 0, cancel: () => clearTimeout(h.t) };
    h.t = setTimeout(() => {
      birthWake = null;
      if (disposed || document.hidden) return;
      for (const c of cursors.values()) if (c.birth) tryBirth(c, false);
    }, Math.max(8, Math.min(40, ms || 40)));
    birthWake = h;
  }

  const SVG_NS = "http://www.w3.org/2000/svg";
  let trailSeq = 0;
  function mkTrail(c) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "rtac-trail");
    svg.setAttribute("aria-hidden", "true");
    const defs = document.createElementNS(SVG_NS, "defs");
    const g = document.createElementNS(SVG_NS, "linearGradient");
    const id = `rtac-trail-${++trailSeq}`;
    g.setAttribute("id", id);
    g.setAttribute("gradientUnits", "userSpaceOnUse");
    const stops = [
      [0, 0.5],
      [1, 0],
    ].map(([o, a]) => {
      const s = document.createElementNS(SVG_NS, "stop");
      s.setAttribute("offset", String(o));
      s.setAttribute("stop-color", hexOf(c.color));
      s.setAttribute("stop-opacity", String(a));
      g.append(s);
      return s;
    });
    defs.append(g);
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("fill", `url(#${id})`);
    svg.append(defs, path);
    return { svg, path, g, stops };
  }
  // A tapered ribbon through the last ~110 ms of the flight, head first.
  function drawTrail(T, pts) {
    if (pts.length < 3) {
      T.path.setAttribute("d", "");
      return;
    }
    const n = pts.length;
    const L = [];
    const Rt = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      const w = 2.6 * (1 - i / (n - 1)) + 0.15;
      L.push(`${r2(pts[i].x - dy * w)} ${r2(pts[i].y + dx * w)}`);
      Rt.push(`${r2(pts[i].x + dy * w)} ${r2(pts[i].y - dx * w)}`);
    }
    T.path.setAttribute("d", `M${L.join("L")}L${Rt.reverse().join("L")}Z`);
    T.g.setAttribute("x1", r2(pts[0].x));
    T.g.setAttribute("y1", r2(pts[0].y));
    T.g.setAttribute("x2", r2(pts[n - 1].x));
    T.g.setAttribute("y2", r2(pts[n - 1].y));
  }
  // A ring in the agent's colour on the avatar: out (birth) or in (home).
  function ring(c, r, out) {
    if (!r || reduced()) return;
    ensureSky();
    const d = Math.max(16, Math.min(48, Math.max(r.width, r.height)));
    const o = el("span", "rtac-ring");
    o.style.setProperty("--rtac-color", hexOf(c.color));
    o.style.width = o.style.height = `${d}px`;
    o.style.left = `${r2(r.left + r.width / 2 - d / 2)}px`;
    o.style.top = `${r2(r.top + r.height / 2 - d / 2)}px`;
    sky.append(o);
    const a = out
      ? animate(o, [{ transform: "scale(0.9)", opacity: 0.6 }, { transform: "scale(2)", opacity: 0 }], 560, EASE_OUT_CSS, "forwards")
      : animate(o, [{ transform: "scale(1.8)", opacity: 0 }, { transform: "scale(1.15)", opacity: 0.55, offset: 0.55 }, { transform: "scale(1)", opacity: 0 }], 420, EASE_OUT_CSS, "forwards");
    const kill = () => o.remove();
    if (a) a.onfinish = kill;
    setTimeout(kill, 900);
  }
  // The name tag unfolds out of the arrow on the way out, folds on the way home.
  function unfold(c, delay) {
    if (reduced()) return;
    animate(c.label, [{ transform: "scaleX(0.18)", opacity: 0 }, { transform: "scaleX(1)", opacity: 1 }], 300, EASE_OUT_CSS, "backwards", delay);
    animate(c.nameEl, [{ opacity: 0, transform: "translateX(-6px)" }, { opacity: 1, transform: "none" }], 220, EASE_OUT_CSS, "backwards", delay + 90);
  }
  function fold(c) {
    if (reduced()) return;
    animate(c.nameEl, [{ opacity: 1 }, { opacity: 0 }], 120, EASE_OUT_CSS, "forwards");
    animate(c.label, [{ transform: "scaleX(1)", opacity: 1 }, { transform: "scaleX(0.18)", opacity: 0 }], 240, EASE_IN_OUT_CSS, "forwards", 60);
  }
  function startFlight(c, kind, src) {
    const from = kind === "birth" ? centre(src) : c.screen ? { ...c.screen } : null;
    if (!from) return kind === "birth" ? enter(c, c.R) : fadeOut(c, "done");
    abortAct(c, kind === "birth");
    c.tween = null;
    ensureSky();
    const F = { kind, t0: now(), from, to: null, dest: kind === "home" ? centre(src) : null, src, dur: 0, delay: kind === "birth" ? 110 : 0, side: c.color % 2 ? 1 : -1, pts: [], trail: mkTrail(c), clamped: false };
    c.flight = F;
    sky.append(F.trail.svg, c.el);
    c.el.hidden = false;
    c.el.classList.add("rtac--flying");
    c.el.style.transform = `translate3d(${r2(from.x)}px, ${r2(from.y)}px, 0)`;
    c.tr = "";
    if (kind === "birth") {
      c.entered = true;
      c.body.style.opacity = "0";
      c.body.style.transform = "scale(0.2)";
      ring(c, src, true);
      unfold(c, 200);
      firstPaint(c.id);
      S.lastBirth = { id: c.id, from: { x: r2(from.x), y: r2(from.y) }, src: births.get(c.id) && births.get(c.id).avatar ? "avatar-in" : bubbleEl(c.id) ? "avatar" : "composer", at: Date.now() };
    } else fold(c);
    S.flights[kind]++;
    trace(c.id, kind === "birth" ? "birth" : "home");
    startLoop();
  }
  // Read phase: where the flight ends this frame.
  function readFlight(c) {
    const F = c.flight;
    if (F.kind === "birth") {
      const R = c.R;
      if (!R || !R.view || !R.rb) return;
      const v = R.view;
      const rb = R.rb;
      const sx = rb.left + v.x + c.pos.x * v.zoom;
      const sy = rb.top + v.y + c.pos.y * v.zoom;
      // Lands where it can be seen: inside the canvas view, tag included.
      const x = clamp(sx, rb.left + 24, Math.max(rb.left + 24, rb.right - 140));
      const y = clamp(sy, rb.top + 24, Math.max(rb.top + 24, rb.bottom - 56));
      F.to = { x, y };
      F.clamped = Math.abs(x - sx) > 0.5 || Math.abs(y - sy) > 0.5;
    } else {
      const n = bubbleEl(c.id);
      const r = n && n.getBoundingClientRect();
      if (r && r.width >= 8) {
        F.dest = centre(r);
        F.src = rectOf(r);
      }
      F.to = F.dest;
    }
  }
  function stepFlight(c, t) {
    const F = c.flight;
    const to = F.to || F.from;
    if (!F.dur) {
      const d0 = Math.hypot(to.x - F.from.x, to.y - F.from.y);
      F.dur = F.kind === "birth" ? (d0 < 140 ? 280 + d0 * 1.3 : clamp(400 + d0 * 0.28, 500, 660)) : clamp(400 + d0 * 0.3, 520, 720);
    }
    const lt = t - F.t0;
    const p = clamp((lt - F.delay) / F.dur, 0, 1);
    const e = easeInOut(p);
    const dx = to.x - F.from.x;
    const dy = to.y - F.from.y;
    const d = Math.hypot(dx, dy) || 1;
    const bend = Math.min(0.2 * d, 120) * F.side;
    const ctrl = { x: (F.from.x + to.x) / 2 - (dy / d) * bend, y: (F.from.y + to.y) / 2 + (dx / d) * bend };
    const pos = quad(F.from, ctrl, to, e);
    let s = 1;
    let o = 1;
    let g = 0;
    if (F.kind === "birth") {
      const pp = clamp(lt / 240, 0, 1); // the pop out of the avatar
      s = pp < 0.6 ? lerp(0.2, 1.06, easeOut(pp / 0.6)) : lerp(1.06, 1, easeInOutSine((pp - 0.6) / 0.4));
      o = clamp(lt / 120, 0, 1);
      g = p <= 0 ? clamp(lt / 160, 0, 1) * 0.6 : p < 0.72 ? 0.85 : lerp(0.85, 0, (p - 0.72) / 0.28);
    } else {
      s = p < 0.6 ? 1 : lerp(1, 0.3, easeInOut((p - 0.6) / 0.4));
      o = p < 0.76 ? 1 : lerp(1, 0, (p - 0.76) / 0.24);
      g = p < 0.2 ? (p / 0.2) * 0.7 : 0.7 * (1 - p);
    }
    c.el.style.transform = `translate3d(${r2(pos.x)}px, ${r2(pos.y)}px, 0)`;
    // Squash and stretch: the arrow stretches along its motion (up to 14%)
    // and leans into it (up to 10°), both from its tip; settles as it slows.
    let shape = "";
    if (F.prev && lt >= F.delay) {
      const vx = pos.x - F.prev.x;
      const vy = pos.y - F.prev.y;
      const sp = Math.hypot(vx, vy);
      const st = clamp(sp / 26, 0, 1) * 0.14 * (p < 0.85 ? 1 : (1 - p) / 0.15);
      if (st > 0.004) {
        const ang = (Math.atan2(vy, vx) * 180) / Math.PI;
        shape = ` rotate(${r2(clamp(vx * 0.9, -10, 10))}deg) rotate(${r2(ang)}deg) scale(${r2(1 + st)}, ${r2(1 - st * 0.45)}) rotate(${r2(-ang)}deg)`;
      }
    }
    F.prev = pos;
    c.body.style.transform = Math.abs(s - 1) < 0.001 && !shape ? "" : `scale(${r2(s * 1000) / 1000})${shape}`;
    c.body.style.opacity = o >= 1 ? "" : String(r2(o));
    c.glow.style.opacity = String(r2(g));
    c.screen = pos;
    tagSpring(c, F.prev2 ? { x: pos.x - F.prev2.x, y: pos.y - F.prev2.y } : null);
    F.prev2 = pos;
    // Trail: from the arrow's middle, the last ~110 ms, only while flying.
    if (lt >= F.delay) F.pts.unshift({ x: pos.x + 5 * s, y: pos.y + 7 * s, t });
    while (F.pts.length && t - F.pts[F.pts.length - 1].t > 110) F.pts.pop();
    if (F.pts.length > 24) F.pts.length = 24;
    drawTrail(F.trail, F.pts);
    if (p >= 1) land(c, t);
  }
  function land(c, t) {
    const F = c.flight;
    endFlight(c, false);
    if (F.kind === "home") {
      ring(c, F.src, false);
      // the check's burst on the avatar (a contained shake came before a failure)
      if (c.finishing !== "failed") burst(F.dest || F.to, hexOf(c.color), 8, 16);
      removeCursor(c);
      return;
    }
    // Touchdown: a short spring (overshoot 1.06, as the motion language caps it).
    if (!reduced()) animate(c.body, [{ transform: "scale(1.06)" }, { transform: "scale(0.985)", offset: 0.55 }, { transform: "scale(1)" }], 340, EASE_OUT_CSS);
    const R = c.R;
    if (!R || !R.view || !R.rb) return enter(c, R);
    const to = F.to || F.from;
    if (F.clamped) {
      c.pos = { x: (to.x - R.rb.left - R.view.x) / R.view.zoom, y: (to.y - R.rb.top - R.view.y) / R.view.zoom };
      c.base = { ...c.pos };
    }
    R.layer.append(c.el);
    // Same spot, now in the canvas layer (no frame in between).
    c.tr = `translate3d(${r2(to.x - R.rb.left)}px, ${r2(to.y - R.rb.top)}px, 0)`;
    c.el.style.transform = c.tr;
    ripple(c);
    c.nextWanderAt = t + 1400;
    c.landedAt = t;
    // An anchor on a storyboard: the agent selects it first.
    const a = c.task.anchor;
    if (a && a.nodeId && itemEl(R, String(a.nodeId))) c.queue.unshift({ kind: "focus", R, itemId: String(a.nodeId), ch: { kind: "land", holds: [] }, at: t, held: false, here: true });
    paintCaption(c, true);
    trace(c.id, "landed");
    startLoop();
  }
  // Ends a flight where it is: back into the canvas layer, or nowhere.
  function endFlight(c, toCanvas) {
    const F = c.flight;
    if (!F) return;
    c.flight = null;
    F.trail.svg.remove();
    c.el.classList.remove("rtac--flying");
    c.body.style.transform = "";
    c.body.style.opacity = "";
    c.glow.style.opacity = "";
    for (const n of [c.label, c.nameEl]) {
      for (const a of n.getAnimations ? n.getAnimations() : []) a.cancel();
    }
    if (toCanvas && c.R) {
      c.R.layer.append(c.el);
      c.tr = "";
    } else if (!toCanvas) c.el.remove();
  }

  // -------------------------------------------------------------------- motion
  function mkTween(from, to, dur, ease, bend) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const side = Math.random() < 0.5 ? -1 : 1;
    // A slight arc, like a hand moving a mouse.
    const ctrl = { x: (from.x + to.x) / 2 - dy * bend * side, y: (from.y + to.y) / 2 + dx * bend * side };
    return { from: { ...from }, to: { ...to }, ctrl, t0: now(), dur, ease };
  }
  function wander(c, t, v) {
    const rad = (16 / v.zoom) * (0.35 + Math.random() * 0.65);
    const ang = Math.random() * Math.PI * 2;
    let to = { x: c.base.x + Math.cos(ang) * rad, y: c.base.y + Math.sin(ang) * rad };
    if (c.focus) {
      const f = c.focus;
      const pad = Math.min(4 / v.zoom, f.width / 4, f.height / 4);
      to = { x: clamp(to.x, f.x + pad, f.x + f.width - pad), y: clamp(to.y, f.y + pad, f.y + f.height - pad) };
    }
    c.tween = mkTween(c.pos, to, 900 + Math.random() * 700, easeInOutSine, 0.25);
    c.nextWanderAt = t + c.tween.dur + 1100 + Math.random() * 1800;
  }
  function step(c, t, v) {
    if (c.act) return runAct(c, t);
    const tw = c.tween;
    if (tw) {
      const p = Math.min(1, (t - tw.t0) / tw.dur);
      if (p >= 1) {
        c.pos = { ...tw.to };
        c.tween = null;
      } else c.pos = quad(tw.from, tw.ctrl, tw.to, tw.ease(p));
      return;
    }
    // Thinking (between tool calls): the cursor floats on a slow, small
    // orbit around its spot, like a hand resting on the mouse; it eases in
    // and out of the orbit so a gesture never starts with a jump.
    const think = WANDER && !reduced() && !c.finishing && c.task.status === "running" && !c.queue.length && c.base && c.pos && c.thinking && c.landedAt;
    if (think) {
      if (!c.orbit) c.orbit = { t0: t, phase: Math.random() * 6.28 };
      const O = c.orbit;
      const amp = clamp((t - O.t0) / 900, 0, 1) * easeOut(clamp((t - O.t0) / 900, 0, 1));
      const a = (t - O.t0) / 1000;
      const dx = (Math.cos(a * 1.1 + O.phase) * 9 + Math.sin(a * 0.37 + O.phase) * 4) * amp;
      const dy = (Math.sin(a * 0.8 + O.phase) * 6 + Math.cos(a * 0.29) * 3) * amp;
      c.pos = { x: c.base.x + dx / v.zoom, y: c.base.y + dy / v.zoom };
      return;
    }
    if (c.orbit) {
      // out of the orbit: a short glide back to the spot
      c.orbit = null;
      if (c.base && c.pos && Math.hypot((c.base.x - c.pos.x) * v.zoom, (c.base.y - c.pos.y) * v.zoom) > 0.5) c.tween = mkTween(c.pos, c.base, 240, easeOut, 0);
      c.nextWanderAt = t + 1600;
      return;
    }
    if (WANDER && !reduced() && !c.finishing && c.task.status === "running" && !c.queue.length && c.base && c.pos && t >= c.nextWanderAt) {
      wander(c, t, v);
    }
  }
  // Writes the cursor; true while its tag's spring still settles (one more
  // frame wanted).
  function draw(c, v, rb) {
    if (!c.pos) return false;
    const sx = v.x + c.pos.x * v.zoom;
    const sy = v.y + c.pos.y * v.zoom;
    const prev = c.screen;
    c.screen = { x: rb.left + sx, y: rb.top + sy };
    const tr = `translate3d(${r2(sx)}px, ${r2(sy)}px, 0)`;
    let moved = false;
    if (tr !== c.tr) {
      c.el.style.transform = tr;
      c.tr = tr;
      moved = true;
    }
    const settling = tagSpring(c, moved && prev && c.tagDrag ? { x: c.screen.x - prev.x, y: c.screen.y - prev.y } : null);
    edgeHint(c, sx, sy, rb);
    return settling;
  }
  // The name tag (and the caption under it) hang on a spring: they lag a
  // little behind a fast move and swing back. Only while the cursor itself
  // moves on its own (a flight, a gesture); a pan or zoom moves everything
  // together. Transform only; +-12 px at most.
  function tagSpring(c, delta) {
    if (reduced()) return false;
    if (!c.tagOff) {
      c.tagOff = { x: 0, y: 0 };
      c.tagV = { x: 0, y: 0 };
    }
    const o = c.tagOff;
    const vv = c.tagV;
    if (delta) {
      o.x = clamp(o.x - delta.x * 0.32, -12, 12);
      o.y = clamp(o.y - delta.y * 0.32, -12, 12);
    }
    vv.x = (vv.x - TAG_K * o.x) * TAG_D;
    vv.y = (vv.y - TAG_K * o.y) * TAG_D;
    o.x += vv.x;
    o.y += vv.y;
    const still = Math.abs(o.x) < 0.08 && Math.abs(o.y) < 0.08 && Math.abs(vv.x) < 0.08 && Math.abs(vv.y) < 0.08;
    if (still) {
      o.x = o.y = vv.x = vv.y = 0;
    }
    const tr = still ? "" : `translate3d(${r2(o.x)}px, ${r2(o.y)}px, 0)`;
    if (tr !== c.tagTr) {
      c.tagTr = tr;
      c.tag.style.transform = tr;
      c.capEl.style.transform = tr;
    }
    return !still;
  }
  // A cursor outside the visible canvas: a small chevron in its colour on
  // the nearest edge, pointing at it (the camera is never moved).
  function edgeHint(c, sx, sy, rb) {
    const out = sx < -4 || sy < -4 || sx > rb.width + 4 || sy > rb.height + 4;
    if (!out) {
      if (c.edge && c.edgeOn) {
        c.edgeOn = false;
        c.edge.removeAttribute("data-on");
      }
      return;
    }
    if (!c.edge) {
      c.edge = el("span", "rtac-edge");
      c.edge.setAttribute("aria-hidden", "true");
      c.edge.innerHTML = '<svg viewBox="0 0 12 12" width="12" height="12"><path d="M3 1.5 7.5 6 3 10.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      c.R.layer.append(c.edge);
    } else if (c.edge.parentNode !== c.R.layer) c.R.layer.append(c.edge);
    const ex = clamp(sx, EDGE_INSET, rb.width - EDGE_INSET);
    const ey = clamp(sy, EDGE_INSET, rb.height - EDGE_INSET);
    const ang = (Math.atan2(sy - ey, sx - ex) * 180) / Math.PI;
    const tr = `translate3d(${r2(ex)}px, ${r2(ey)}px, 0) rotate(${r2(ang)}deg)`;
    if (tr !== c.edgeTr) {
      c.edgeTr = tr;
      c.edge.style.transform = tr;
    }
    if (!c.edgeOn) {
      c.edgeOn = true;
      c.edge.setAttribute("data-on", "");
    }
  }

  // comment-bubbles' popovers and panels on screen (viewport rects); with
  // sel = SEL.chromeSurfaces, canvas-chrome's surfaces.
  // The matching elements are looked up at most every 250 ms (the selector
  // lists are long; read every frame while something moves), their boxes
  // every frame.
  const holeNodes = new Map(); // selector -> { at, list }
  function readHoles(sel) {
    const out = [];
    const key = sel || SEL.bubblePanels;
    let hn = holeNodes.get(key);
    const t = now();
    if (!hn || t - hn.at > 250 || hn.list.some((n) => !n.isConnected)) {
      hn = { at: t, list: [...document.querySelectorAll(key)] };
      holeNodes.set(key, hn);
    }
    for (const n of hn.list) {
      if (n.hidden) continue;
      const r = n.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom <= 0 || r.right <= 0 || r.left >= innerWidth || r.top >= innerHeight) continue;
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
      out.push(r);
    }
    return out;
  }
  // Our layer minus those panels: an even-odd clip path with one hole each
  // (written only when it changes).
  function cutOut(node, ox, oy, w, h, holes) {
    let d = "";
    // even-odd: a hole inside another would cancel it (a panel inside a
    // card), so only the outermost ones
    const inside = (a, b) => a !== b && a.left >= b.left - 1 && a.top >= b.top - 1 && a.right <= b.right + 1 && a.bottom <= b.bottom + 1;
    for (const r of holes) {
      if (holes.some((o) => inside(r, o) && !(inside(o, r) && holes.indexOf(o) > holes.indexOf(r)))) continue;
      if (r.right <= ox || r.bottom <= oy || r.left >= ox + w || r.top >= oy + h) continue;
      d += `M${r2(r.left - ox)} ${r2(r.top - oy)}h${r2(r.width)}v${r2(r.height)}h${r2(-r.width)}Z`;
    }
    const v = d ? `path(evenodd, "M-4 -4H${r2(w + 4)}V${r2(h + 4)}H-4Z${d}")` : "";
    if (node.__rtacClip === v) return;
    node.__rtacClip = v;
    node.style.clipPath = v;
  }

  // The loop runs only while something moves or the view changes, plus a few
  // settling frames; then it stops and one wake-up is armed (idling, a
  // selection to fade, the flight home).
  function startLoop() {
    if (!raf && !disposed && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function armWake() {
    if (wanderWake) wanderWake.cancel();
    wanderWake = null;
    if (disposed || document.hidden) return;
    let at = Infinity;
    for (const c of cursors.values()) {
      if (!c.R || c.el.hidden) continue;
      if (c.finishing === "done" && !c.fadeT) at = Math.min(at, c.homeAt || now() + 16);
      if (c.sel && !c.sel.dying && c.sel.until < Infinity) at = Math.min(at, c.sel.until);
      if (WANDER && !reduced() && !c.finishing && c.task.status === "running" && c.base && c.pos) at = Math.min(at, Math.max(c.nextWanderAt, now() + 1000));
    }
    if (at === Infinity) return;
    wanderWake = later(() => {
      wanderWake = null;
      startLoop();
    }, Math.max(16, at - now()));
  }
  function meter(t) {
    if (t === P.last) return;
    if (P.last && t - P.last < 400) {
      const gap = t - P.last;
      P.frames++;
      P.gapSum += gap;
      if (gap > 50) P.long++;
      if (gap > P.maxGap) P.maxGap = gap;
    }
    P.last = t;
  }
  function frame(ts) {
    raf = 0;
    if (disposed) return;
    const w0 = now();
    const t = Number.isFinite(ts) ? ts : w0;
    meter(t);
    let any = false;
    // Reads first: boxes, views, selection targets, flight ends.
    for (const R of roots.values()) {
      R.ok = false;
      R.hide = false;
      if ((!R.cursors.size && !R.sels.size) || !R.root.isConnected) continue; // the next tick drops it
      const rb = R.root.getBoundingClientRect();
      const v = readView(R);
      if (!v || rb.width < 1 || rb.height < 1) {
        R.hide = true;
        continue;
      }
      const key = `${rb.left},${rb.top},${rb.width},${rb.height}`;
      R.changed = key !== R.boxKeyPrev || !R.view || R.view.x !== v.x || R.view.y !== v.y || R.view.zoom !== v.zoom;
      if (R.view && (R.view.x !== v.x || R.view.y !== v.y || R.view.zoom !== v.zoom)) R.quietUntil = Math.max(R.quietUntil, now() + QUIET_MS);
      R.boxKeyPrev = key;
      R.view = v;
      R.rb = rb;
      R.ok = true;
      for (const s of R.sels) readSel(s, t);
      for (const c of R.cursors) if (!c.tagW) c.tagW = c.tag.offsetWidth || 0;
    }
    for (const c of cursors.values()) if (c.flight) readFlight(c);
    const holes = readHoles();
    const under = holes.concat(readHoles(SEL.chromeSurfaces)); // the canvas layers: under the chrome too
    const hk = under.map((r) => `${r2(r.left)},${r2(r.top)},${r2(r.width)},${r2(r.height)}`).join("|");
    const holesMoved = hk !== holeKey; // a panel opening / closing animates: keep up with it
    holeKey = hk;
    // Then writes.
    for (const R of roots.values()) {
      if (R.hide) {
        R.layer.style.display = "none";
        continue;
      }
      if (!R.ok) continue;
      R.layer.style.display = "";
      const rb = R.rb;
      const key = R.boxKeyPrev;
      if (key !== R.boxKey) {
        R.boxKey = key;
        Object.assign(R.layer.style, { left: `${rb.left}px`, top: `${rb.top}px`, width: `${rb.width}px`, height: `${rb.height}px` });
      }
      let moving = R.changed;
      for (const c of [...R.cursors]) {
        if (c.flight) continue;
        if (c.finishing === "done") homeCheck(c, t);
        if (c.flight || c.fadeT) continue;
        if (!c.act && c.queue.length && canAct(c)) nextAction(c, t);
        c.tagDrag = !!(c.act || c.tween || c.orbit);
        step(c, t, R.view);
        if (draw(c, R.view, rb)) moving = true;
        if (c.tween || c.act || c.orbit || (c.queue.length && canAct(c))) moving = true;
        if (c.sel && !c.sel.dying && t > c.sel.until) fadeSel(c.sel);
      }
      drawSels(R);
      cutOut(R.layer, rb.left, rb.top, rb.width, rb.height, under);
      R.still = moving || holesMoved ? 0 : (R.still || 0) + 1;
      if (R.still < 3) any = true;
    }
    for (const c of [...cursors.values()]) {
      if (!c.flight) continue;
      stepFlight(c, t);
      any = true;
    }
    if (sky) cutOut(sky, 0, 0, innerWidth, innerHeight, holes);
    if (tipFor && tipFor.R) placeTip(tipFor);
    const work = now() - w0;
    P.workSum += work;
    if (work > P.workMax) P.workMax = work;
    if (any) {
      if (!raf) raf = requestAnimationFrame(frame);
    } else if (!raf) {
      P.last = 0;
      armWake();
    }
  }

  // ----------------------------------------------------------------- sync
  // A task first seen just after it was created (or announced by a launch
  // event) is born out of its avatar; the tasks already there when the page
  // loads are not.
  function isFresh(t) {
    if (births.has(t.id)) return true;
    if (now() - bootAt < 2500) return false;
    return !!t.createdAt && Date.now() - t.createdAt < FRESH_MS;
  }
  function sync() {
    if (disposed) return;
    if (!enabled()) {
      if (S.on) teardown();
      if (!tickWake) armTick();
      return;
    }
    S.on = true;
    const comments = readTasks();
    let chats = [];
    try {
      chats = chatTasks(comments);
    } catch (e) {
      note("chats", e);
    }
    const list = comments.concat(chats);
    lastTasks = list;
    const seen = new Set();
    for (const t of list) {
      seen.add(t.id);
      let c = cursors.get(t.id);
      if (!c) {
        const born = t.kind !== "chat" && LIVE.has(t.status) && isFresh(t);
        if (!SHOW.has(t.status) && !(born && t.status === "queued")) continue;
        if (born) seedBirth(t);
        c = newCursor(t);
        if (born) c.birth = { at: now(), until: birthUntil(t.id) };
        cursors.set(t.id, c);
      } else {
        c.task = t;
        if (c.finishing && LIVE.has(t.status)) unfinish(c);
        else if (TERMINAL.has(t.status)) finish(c, t.status === "failed" ? "failed" : "done");
      }
      if (!c.finishing) {
        const ci = colorFor(c.id);
        if (ci !== c.color) {
          c.color = ci;
          paintColor(c);
        }
      }
      paintLabel(c);
    }
    for (const c of [...cursors.values()]) if (!seen.has(c.id) && !c.finishing) finish(c, "gone");
    const t0 = now();
    for (const [id, b] of [...births]) if (t0 - b.at > 20000) births.delete(id);
    refreshNumbers(comments);
    place();
    if (!tickWake) armTick();
  }
  function place() {
    const infos = visibleCanvases();
    const byName = new Map();
    for (const i of infos) for (const n of i.names) if (!byName.has(n)) byName.set(n, i);
    for (const c of [...cursors.values()]) {
      if (c.flight && c.flight.kind === "home") continue; // on its way into the avatar
      const info = c.task.kind === "chat" ? chatRoot(c, infos) : commentRoot(c, infos, byName);
      if (!info) {
        if (c.finishing) removeCursor(c);
        else detach(c);
        continue;
      }
      attach(c, ensureRoot(info));
    }
    // A running chat linked to no canvas on screen: watch them all for its edits.
    const watch = [...cursors.values()].some((c) => c.task.kind === "chat" && !c.finishing && c.task.status === "running" && !c.R);
    if (watch) for (const i of infos) ensureRoot(i);
    for (const R of [...roots.values()]) {
      const info = infos.find((i) => i.root === R.root);
      if (!R.root.isConnected || !info || info.sig !== R.sig || (!R.cursors.size && !R.sels.size && !watch)) dropRoot(R);
    }
    if (placeDirty) {
      placeDirty = false;
      startLoop();
    }
  }
  // The canvas view a comment's cursor lives on. Its canvas by name first;
  // a name that matches nothing on screen (a renamed pill, a label the
  // store spelt differently) never hides the agent: the view that holds its
  // comment's pin (the launch's pin rect, else the pin found at its
  // anchor), else the only view on screen, else, for a task that is alive,
  // the largest one. c.via says which rule placed it (state()).
  function commentRoot(c, infos, byName) {
    const key = nameKey(c.task.canvasName);
    let info = key ? byName.get(key) : null;
    let via = "name";
    if (!info && infos.length) {
      const b = births.get(c.id);
      const p = b && b.pin ? centre(b.pin) : null;
      if (p) {
        info = infos.find((i) => inBox(p, i.root.getBoundingClientRect(), 0)) || null;
        via = "pin";
      }
      if (!info) {
        for (const i of infos) {
          if (pinElAt(i.root, c.task)) {
            info = i;
            via = "anchor";
            break;
          }
        }
      }
      if (!info && infos.length === 1) {
        info = infos[0];
        via = "only";
      }
      if (!info && !c.finishing && LIVE.has(c.task.status)) {
        info = infos
          .map((i) => ({ i, r: i.root.getBoundingClientRect() }))
          .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0].i;
        via = "largest";
      }
    }
    if (info && c.via !== via) {
      c.via = via;
      if (via !== "name") trace(c.id, "root", { via, names: [...info.names] });
    }
    return info;
  }
  // The app's pin of a comment task on a canvas root: the pin whose bubble
  // sits at the anchor's screen point (as canvas-comment-agent finds it).
  function pinElAt(root, task) {
    const a = task && task.anchor;
    if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return null;
    const R = roots.get(root);
    const v = (R && R.view) || readView({ root, wl: null });
    if (!v) return null;
    const rb = root.getBoundingClientRect();
    const sx = rb.left + v.x + a.x * v.zoom;
    const sy = rb.top + v.y + a.y * v.zoom;
    for (const n of document.querySelectorAll(SEL.pins)) {
      if (!isShown(n)) continue;
      const r = n.getBoundingClientRect();
      if (Math.abs(r.left + 2 - sx) < 8 && Math.abs(r.bottom - 6 - sy) < 12) return n;
    }
    return null;
  }
  // The pin's box on screen (the element's, else a 34 px bubble above-right
  // of the anchor), on the first view that shows this task's canvas.
  function pinRectFor(task) {
    const infos = visibleCanvases();
    const key = nameKey(task.canvasName);
    const list = infos.filter((i) => !key || i.names.has(key)).concat(infos.filter((i) => key && !i.names.has(key)));
    for (const i of list) {
      const n = pinElAt(i.root, task);
      if (n) return rectOf(n.getBoundingClientRect());
    }
    const a = task.anchor;
    if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return null;
    for (const i of list) {
      const v = readView({ root: i.root, wl: null });
      if (!v) continue;
      const rb = i.root.getBoundingClientRect();
      const sx = rb.left + v.x + a.x * v.zoom;
      const sy = rb.top + v.y + a.y * v.zoom;
      if (!inBox({ x: sx, y: sy }, rb, 40)) continue;
      return { left: sx - 2, top: sy - 28, width: 34, height: 34 };
    }
    return null;
  }
  // A task that was just created with no launch event (another mod sent the
  // comment, a reload mid-launch): the choreography starts from its pin.
  function seedBirth(t) {
    if (births.has(t.id)) return;
    let pin = null;
    try {
      pin = pinRectFor(t);
    } catch (e) {
      note("seed", e);
    }
    births.set(t.id, { at: now(), launchAt: now(), launch: null, avatar: null, pin, capturing: false, captured: true, seeded: true });
    S.seeded++;
    trace(t.id, "seed", { pin: !!pin });
    if (pin) {
      pulsePin(t.id);
      spark(t.id);
    }
  }
  // The periodic tick only exists while it has something to do: cursors on
  // screen (canvas navigation, flag), a disabled flag or a store that has not
  // appeared yet (while a task is waiting, for the flag). With the store connected and no task shown, everything is
  // driven by its events.
  function tickNeeded() {
    if (cursors.size > 0) return true;
    if (!storeRef) return true;
    if (enabled() && canvasOnScreen()) return true; // a chat may start editing it
    return !enabled() && readTasks().some((t) => SHOW.has(t.status));
  }
  function armTick() {
    if (tickWake) tickWake.cancel();
    tickWake = null;
    if (disposed || document.hidden || !tickNeeded()) return;
    // A live chat agent is polled every 0.5 s, so it ends close to its chat.
    const chatLive = [...cursors.values()].some((c) => c.task.kind === "chat" && !c.finishing);
    tickWake = later(tick, chatLive ? Math.min(TICK_MS, 500) : storeRef || canvasOnScreen() ? TICK_MS : Math.max(TICK_MS, 2000));
  }
  function tick() {
    if (disposed) return;
    tickWake = null;
    try {
      connectStore();
      if (!unsub) latest = null; // no subscription: read tasks() fresh
      sync();
      if (S.on) checkRoots();
    } catch (e) {
      note("tick", e);
    }
    armTick();
  }
  // Cheap per-root checks: a moved box or view that no mutation announced
  // wakes the frame loop once; hidden iframes are unhooked, shown ones hooked.
  // An iframe hidden inside a storyboard that is on screen stays hooked: at a
  // low zoom the canvas swaps small storyboards for a picture (level of
  // detail) while their document keeps updating.
  function checkRoots() {
    // A panel opened or closed by code (no click): re-cut on the next frames.
    if (cursors.size && readHoles().concat(readHoles(SEL.chromeSurfaces)).map((r) => `${r2(r.left)},${r2(r.top)},${r2(r.width)},${r2(r.height)}`).join("|") !== holeKey) startLoop();
    for (const R of roots.values()) {
      if (!R.cursors.size || !R.root.isConnected) continue;
      const rb = R.root.getBoundingClientRect();
      const key = `${rb.left},${rb.top},${rb.width},${rb.height}`;
      const v = readView(R);
      if (key !== R.boxKey || (v && (!R.view || R.view.x !== v.x || R.view.y !== v.y || R.view.zoom !== v.zoom))) startLoop();
      for (const [f, F] of R.frames) {
        const host = f.isConnected && !f.getClientRects().length ? f.closest(SEL.item) : null;
        const shown = f.isConnected && (f.getClientRects().length > 0 || (!!host && host.getClientRects().length > 0));
        if (!shown && F.mo) unhookFrame(F, false);
        else if (shown && !F.mo && !F.cross) attachDoc(F);
      }
    }
  }
  function teardown() {
    S.on = false;
    hideTip();
    for (const c of [...cursors.values()]) {
      clearTimeout(c.fadeT);
      detach(c);
      if (c.flight) endFlight(c, false);
      c.el.remove();
    }
    cursors.clear();
    for (const R of [...roots.values()]) dropRoot(R);
    if (sky) sky.remove();
    sky = null;
  }

  // ------------------------------------------------------- tooltip / click
  function ensureTip() {
    if (tipEl && tipEl.isConnected) return tipEl;
    tipEl = el("div", "rtac-tip");
    tipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tipEl);
    return tipEl;
  }
  function tipSoon(c) {
    clearTimeout(tipT);
    tipT = setTimeout(() => showTip(c), 180);
  }
  function showTip(c) {
    if (!c.R || disposed) return;
    tipFor = c;
    ensureTip();
    paintTip(c);
    tipEl.style.setProperty("--rtac-color", hexOf(c.color));
    tipEl.setAttribute("data-show", "");
    placeTip(c);
  }
  function paintTip(c) {
    if (!tipEl) return;
    const head = el("div", "rtac-tip-h");
    const dot = el("span", "rtac-tip-dot");
    const who = el("span", "rtac-tip-who");
    who.textContent = labelOf(c);
    head.append(dot, who);
    const meta = [fmtModel(c.task.model), c.task.effort].filter(Boolean).join(" · ");
    if (meta && meta !== whoOf(c)) {
      const m = el("span", "rtac-tip-meta");
      m.textContent = meta;
      head.append(m);
    }
    const q = el("div", "rtac-tip-q");
    const chat = c.task.kind === "chat";
    const text = c.task.text || (chat ? `Chat: ${c.task.title}` : "(no text)");
    q.textContent = (c.task.author ? `${c.task.author}: ` : "") + (text.length > 220 ? text.slice(0, 219) + "…" : text);
    const s = el("div", "rtac-tip-s");
    s.textContent = doingOf(c);
    const hint = el("div", "rtac-tip-hint");
    hint.textContent = chat ? (chatPanelOf(c) ? "Click to show the chat" : `In the chat "${titleOf(c)}"`) : "Click to open the request";
    tipEl.replaceChildren(head, q, s, hint);
  }
  function placeTip(c) {
    if (!tipEl || !tipEl.hasAttribute("data-show")) return;
    const lr = c.tag.getBoundingClientRect();
    const tw = tipEl.offsetWidth;
    const th = tipEl.offsetHeight;
    let left = lr.left;
    let top = lr.bottom + 6;
    if (top + th > innerHeight - 8) top = lr.top - th - 6;
    left = clamp(left, 8, Math.max(8, innerWidth - tw - 8));
    top = clamp(top, 8, Math.max(8, innerHeight - th - 8));
    tipEl.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
  }
  function hideTip() {
    clearTimeout(tipT);
    tipFor = null;
    if (tipEl) tipEl.removeAttribute("data-show");
  }
  // A chat agent: canvas-chrome's Agent tab, when this canvas's chat panel
  // shows that chat and the view has that tab (the shell, or null).
  function chatPanelOf(c) {
    const api = window.__RE_TEMPO_CANVAS_CHROME__;
    if (!c.R || !api || typeof api.setLeftTab !== "function") return null;
    const p = panelChat(c.R.root);
    if (!p || p.chatId !== c.task.chatId) return null;
    const shell = c.R.root.closest(SEL.shell);
    return shell && shell.querySelector('[data-rcc-tab-id="agent"]') ? shell : null;
  }
  function openBubble(c) {
    hideTip();
    if (c.task.kind === "chat") {
      const shell = chatPanelOf(c);
      let ok = false;
      try {
        ok = !!shell && window.__RE_TEMPO_CANVAS_CHROME__.setLeftTab("agent", shell) === true;
      } catch (e) {
        note("open-chat", e);
      }
      S.lastOpen = { id: c.id, ok, at: Date.now() };
      return;
    }
    const b = window.__RE_TEMPO_COMMENT_BUBBLES__;
    let ok = false;
    if (b && typeof b.open === "function") {
      try {
        ok = b.open(c.id) !== false;
      } catch (e) {
        note("open", e);
      }
    }
    S.lastOpen = { id: c.id, ok, at: Date.now() };
  }
  // A wheel on the tag goes to whatever is under it (the canvas pans/zooms).
  function forwardWheel(e, c) {
    e.preventDefault();
    e.stopPropagation();
    c.el.classList.add("rtac--pass");
    let under = null;
    try {
      under = document.elementFromPoint(e.clientX, e.clientY);
    } finally {
      c.el.classList.remove("rtac--pass");
    }
    if (!under || isOurs(under)) return;
    const init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      deltaZ: e.deltaZ,
      deltaMode: e.deltaMode,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      buttons: e.buttons,
    };
    under.dispatchEvent(new WheelEvent("wheel", init));
    S.forwardedWheel++;
  }

  // ------------------------------------------------------ user activity
  const opts = { capture: true, passive: true };
  const onDown = (e) => {
    if (isOurs(e.target)) return;
    pointerDown = true;
  };
  // A click or a key may open or close a comment-bubbles panel: a few frames
  // (and again once its opening animation is over) re-cut our layers.
  const panelsMayChange = () => {
    holeNodes.clear();
    if (!cursors.size) return;
    startLoop();
    later(startLoop, 260);
  };
  const onUp = () => {
    panelsMayChange();
    if (!pointerDown) return;
    pointerDown = false;
    userQuietUntil = now() + USER_QUIET_MS;
  };
  const onKey = (e) => {
    if (e.key === "Shift" || e.key === "Meta" || e.key === "Control" || e.key === "Alt") return;
    userQuietUntil = now() + USER_QUIET_MS;
    panelsMayChange();
  };
  const onWheel = (e) => {
    const root = e.target && e.target.closest ? e.target.closest(SEL.root) : null;
    const R = root && roots.get(root);
    if (R) R.quietUntil = Math.max(R.quietUntil, now() + QUIET_MS);
  };
  const onBlur = () => onUp();
  // Reduced motion switched on or off: everything in motion lands now.
  const onMotion = () => {
    for (const c of [...cursors.values()]) {
      c.tween = null;
      abortAct(c, true);
      if (c.flight) {
        if (c.flight.kind === "home") removeCursor(c);
        else {
          endFlight(c, true);
          enter(c, c.R);
        }
        continue;
      }
      if (c.base) c.pos = { ...c.base };
    }
    startLoop();
  };
  // Launch events (see the header): where the cursor will come out of.
  const onLaunch = (e) => {
    const d = (e && e.detail) || {};
    if (d.taskId == null) return;
    const id = String(d.taskId);
    const b = births.get(id) || { at: now(), launch: null, avatar: null };
    b.at = now();
    b.launch = rectOf(d.rect) || b.launch;
    if (d.pin) b.pin = rectOf(d.pin) || b.pin || null;
    b.capturing = !!d.capturing;
    b.captured = !d.capturing;
    if (b.launchAt == null) b.launchAt = now(); // the store's event may have come first
    births.set(id, b);
    // The pin breathes at once (the "before" capture, ~0.1 s, masks our
    // layer out of its image) and a spark leaves it for the avatar.
    if (b.pin) {
      pulsePin(id);
      spark(id);
    }
    const c = cursors.get(id);
    if (c && c.birth) c.birth.until = Math.max(c.birth.until, birthUntil(id));
    scheduleSync();
  };
  // The explicit launch contract ("rtca:*", canvas-comment-agent or any mod):
  // the same choreography, with the fields named for it.
  const onRtcaLaunch = (e) => {
    const d = (e && e.detail) || {};
    S.rtca++;
    if (d.taskId == null) return;
    onLaunch({ detail: { taskId: d.taskId, text: d.text, rect: d.composerRect || d.rect || d.pinRect, pin: d.pinRect || d.pin, capturing: !!d.capturing } });
  };
  const onRtcaAction = (e) => {
    const d = (e && e.detail) || {};
    S.rtca++;
    if (d.taskId == null) return;
    // the canvas's own changes are watched here already (and drawn, not clicked)
    if (d.source === "canvas") return;
    const tg = d.target && typeof d.target === "object" ? d.target : {};
    onActivity({
      detail: {
        taskId: d.taskId,
        id: d.id != null ? d.id : `rtca-${++rtcaSeq}`,
        phase: d.phase === "end" ? "end" : "start",
        status: d.status || (d.phase === "end" ? "succeeded" : "running"),
        kind: RTCA_KIND[d.kind] || d.kind || "other",
        label: d.label,
        nodeId: tg.nodeId || d.nodeId,
        point: tg.point || d.point || (Number.isFinite(+tg.x) && Number.isFinite(+tg.y) ? { x: +tg.x, y: +tg.y } : null),
        storyboard: tg.storyboardName || tg.storyboard || d.storyboard,
        file: tg.file || d.file,
        rect: rectOf(tg.rect),
        selector: typeof tg.selector === "string" ? tg.selector : "",
      },
    });
  };
  const onRtcaActionEnd = (e) => {
    const d = (e && e.detail) || {};
    S.rtca++;
    if (d.taskId == null) return;
    onActivity({ detail: { taskId: d.taskId, id: d.id, phase: "end", status: d.status || "succeeded" } });
  };
  const onRtcaThinking = (e) => {
    const d = (e && e.detail) || {};
    S.rtca++;
    if (d.taskId == null) return;
    const id = String(d.taskId);
    const tl = tools.get(id);
    if (tl) tl.endAt = Math.min(tl.endAt || now(), now() - TOOL_HOLD_MS); // "Thinking" at once
    const c = cursors.get(id);
    if (c) paintCaption(c);
  };
  // A status told ahead of the store: used until the store confirms it
  // (10 s at most), never after.
  const onRtcaStatus = (status) => (e) => {
    const d = (e && e.detail) || {};
    S.rtca++;
    if (d.taskId == null) return;
    hints.set(String(d.taskId), { status, at: now(), reason: d.reason || "" });
    if (hints.size > COLORS_MAX) hints.delete(hints.keys().next().value);
    scheduleSync();
  };
  const onRtcaDone = onRtcaStatus("done");
  const onRtcaFailed = onRtcaStatus("failed");
  const onRtcaNeedsInput = onRtcaStatus("needs-input");
  // The comment's pin pulses in the agent's colour (after the "before"
  // capture: our layers are hidden while it runs).
  function pulsePin(id) {
    const b = births.get(id);
    if (!b || !b.pin || b.pulsed || disposed || !enabled() || document.hidden) return;
    b.pulsed = true;
    S.pulses++;
    ensureSky();
    const r = b.pin;
    const d = Math.max(20, Math.min(44, Math.max(r.width, r.height)));
    const o = el("span", "rtac-pulse");
    o.setAttribute("data-rtac-pulse", id);
    o.style.setProperty("--rtac-color", hexOf(colorFor(id)));
    o.style.width = o.style.height = `${d}px`;
    o.style.transform = `translate3d(${r2(r.left + r.width / 2 - d / 2)}px, ${r2(r.top + r.height / 2 - d / 2)}px, 0)`;
    // ink: a soft disc that blooms and dissolves; glow; two rings; breath:
    // a filled disc that swells once like an inhale
    const rings = [el("i", "rtac-pulse-ink"), el("i", "rtac-pulse-glow"), el("i", "rtac-pulse-ring"), el("i", "rtac-pulse-ring"), el("i", "rtac-pulse-breath")];
    o.append(...rings);
    sky.append(o);
    firstPaint(id);
    let ms = 900;
    if (reduced()) {
      ms = 520;
      animate(rings[2], [{ opacity: 0 }, { opacity: 0.9, offset: 0.23 }, { opacity: 0.9, offset: 0.77 }, { opacity: 0 }], ms, "linear", "forwards");
    } else {
      animate(rings[0], [{ transform: "scale(0.4)", opacity: 0, filter: "blur(2px)" }, { transform: "scale(1.3)", opacity: 0.5, filter: "blur(4px)", offset: 0.28 }, { transform: "scale(2.1)", opacity: 0, filter: "blur(8px)" }], 760, EASE_OUT_CSS, "forwards");
      animate(rings[1], [{ transform: "scale(0.7)", opacity: 0 }, { transform: "scale(1.15)", opacity: 0.6, offset: 0.3 }, { transform: "scale(1.45)", opacity: 0 }], 620, EASE_OUT_CSS, "forwards");
      animate(rings[2], [{ transform: "scale(0.9)", opacity: 0.95 }, { transform: "scale(1.8)", opacity: 0 }], 640, EASE_OUT_CSS, "forwards");
      animate(rings[3], [{ transform: "scale(0.9)", opacity: 0.6 }, { transform: "scale(1.8)", opacity: 0 }], 640, EASE_OUT_CSS, "forwards", 150);
      animate(rings[4], [{ transform: "scale(0.86)", opacity: 0 }, { transform: "scale(1.06)", opacity: 0.35, offset: 0.35 }, { transform: "scale(1)", opacity: 0 }], 560, EASE_IN_OUT_CSS, "forwards");
    }
    trace(id, "pulse");
    setTimeout(() => o.remove(), ms + 80);
  }
  // The first painted frame of a launch's choreography, measured from its
  // launch event (state().firstFrameMs; the last launch wins).
  function firstPaint(id) {
    const b = births.get(id);
    if (!b || b.launchAt == null || b.painted) return;
    b.painted = true;
    requestAnimationFrame(() => {
      const b2 = births.get(id);
      if (b2 && b2.launchAt != null) S.firstFrameMs = r2(now() - b2.launchAt);
    });
  }
  // A spark leaves the pin for the agent's avatar (the composer's, as it
  // enters) and bursts there: the request handed to the agent. No avatar on
  // screen within a frame: the avatar host's right edge; none at all: nothing.
  function spark(id) {
    const b = births.get(id);
    if (!b || !b.pin || b.sparked || disposed || !enabled() || document.hidden || reduced()) return;
    b.sparked = true;
    const from = centre(b.pin);
    const target = () => {
      const n = bubbleEl(id);
      if (n) return centre(n.getBoundingClientRect());
      const h = document.querySelector("[data-rtcb-host]");
      const r = h && rectOf(h.getBoundingClientRect());
      return r ? { x: r.left + r.width - 14, y: r.top + r.height / 2 } : null;
    };
    const to0 = target();
    if (!to0 || Math.hypot(to0.x - from.x, to0.y - from.y) < 24) return;
    S.sparks++;
    b.sparkLands = now() + SPARK_MS - 30; // the cursor pops out as it lands
    armBirth(SPARK_MS);
    ensureSky();
    const o = el("span", "rtac-spark");
    o.style.setProperty("--rtac-color", hexOf(colorFor(id)));
    const tail = el("i");
    o.append(tail);
    sky.append(o);
    const t0 = now();
    const side = colorFor(id) % 2 ? -1 : 1;
    let raf2 = 0;
    const stepSpark = () => {
      raf2 = 0;
      if (disposed || !o.isConnected) return;
      const to = target() || to0;
      const p = clamp((now() - t0) / SPARK_MS, 0, 1);
      const e = easeInOut(p);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const d = Math.hypot(dx, dy) || 1;
      const bend = Math.min(0.22 * d, 110) * side;
      const ctrl = { x: (from.x + to.x) / 2 - (dy / d) * bend, y: (from.y + to.y) / 2 + (dx / d) * bend };
      const q = quad(from, ctrl, to, e);
      const q2 = quad(from, ctrl, to, Math.max(0, e - 0.06));
      const ang = Math.atan2(q.y - q2.y, q.x - q2.x);
      const s = p < 0.15 ? lerp(0.3, 1, p / 0.15) : p > 0.85 ? lerp(1, 0.4, (p - 0.85) / 0.15) : 1;
      o.style.transform = `translate3d(${r2(q.x)}px, ${r2(q.y)}px, 0) rotate(${r2((ang * 180) / Math.PI)}deg) scale(${r2(s)})`;
      o.style.opacity = p > 0.9 ? String(r2(1 - (p - 0.9) / 0.1)) : "1";
      if (p < 1) raf2 = requestAnimationFrame(stepSpark);
      else {
        o.remove();
        burst(to, hexOf(colorFor(id)), 7, 18);
        trace(id, "spark");
      }
    };
    raf2 = requestAnimationFrame(stepSpark);
    setTimeout(() => {
      if (raf2) cancelAnimationFrame(raf2);
      o.remove();
    }, SPARK_MS + 400);
  }
  // Particles out of a point (a check's burst, the spark's landing): n dots
  // on a jittered fan, each flying `reach` px out while it fades.
  function burst(p, hex, n, reach) {
    if (!p || reduced() || document.hidden || disposed) return;
    S.bursts++;
    ensureSky();
    const g = el("span", "rtac-burst");
    g.style.setProperty("--rtac-color", hex);
    g.style.transform = `translate3d(${r2(p.x)}px, ${r2(p.y)}px, 0)`;
    for (let i = 0; i < n; i++) {
      const dot = el("i");
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const r = reach * (0.7 + Math.random() * 0.6);
      const sz = 2 + Math.random() * 2.5;
      dot.style.width = dot.style.height = `${r2(sz)}px`;
      g.append(dot);
      animate(dot, [{ transform: "translate(-50%, -50%) translate(0px, 0px) scale(1)", opacity: 1 }, { transform: `translate(-50%, -50%) translate(${r2(Math.cos(a) * r)}px, ${r2(Math.sin(a) * r)}px) scale(0.2)`, opacity: 0 }], BURST_MS * (0.8 + Math.random() * 0.4), EASE_OUT_CSS, "forwards", Math.random() * 40);
    }
    const halo = el("b");
    g.append(halo);
    animate(halo, [{ transform: "translate(-50%, -50%) scale(0.4)", opacity: 0.55 }, { transform: "translate(-50%, -50%) scale(1.6)", opacity: 0 }], 460, EASE_OUT_CSS, "forwards");
    sky.append(g);
    setTimeout(() => g.remove(), BURST_MS * 1.3 + 80);
  }
  const onCaptured = () => {
    for (const [id, b] of births) {
      if (!b.capturing || b.captured) continue;
      b.captured = true;
      pulsePin(id);
      const c = cursors.get(id);
      if (c && c.birth) tryBirth(c, false);
    }
  };
  // The agent's tool calls (canvas-comment-agent's stream): the caption now;
  // a call that changes the canvas moves the cursor there, in turn.
  // canvas-comment-agent tells each call twice ("rtcc:activity" and the
  // contract's "rtca:action", same id): the second one is dropped.
  const seenCalls = new Map(); // "task|call|phase" -> at
  function seenCall(id, call, phase) {
    if (call == null) return false;
    const k = `${id}|${call}|${phase}`;
    const t = now();
    const was = seenCalls.get(k);
    seenCalls.set(k, t);
    if (seenCalls.size > 400) for (const [kk, at] of seenCalls) if (t - at > HINT_MS) seenCalls.delete(kk);
    return was != null && t - was < HINT_MS;
  }
  const onActivity = (e) => {
    const d = (e && e.detail) || {};
    if (d.taskId == null || disposed) return;
    const id = String(d.taskId);
    if (seenCall(id, d.id, d.phase === "end" ? "end" : "start")) return;
    S.tools++;
    const t = now();
    let tl = tools.get(id);
    if (d.phase === "end") {
      if (!tl || tl.id !== d.id) return;
      tl.endAt = t;
      tl.status = d.status;
    } else {
      tl = { id: d.id, label: pretty(String(d.label || "Working")).slice(0, 48), kind: d.kind || "other", status: d.status, at: t, endAt: d.status === "succeeded" || d.status === "failed" ? t : 0 };
      tools.set(id, tl);
      if (tools.size > COLORS_MAX) tools.delete(tools.keys().next().value);
    }
    const c = cursors.get(id);
    if (c) {
      c.tool = tl;
      paintCaption(c);
      if (tipFor === c) paintTip(c);
    }
    if (d.phase === "end" || !TARGET_KINDS.has(d.kind)) return;
    if (c && c.R && !c.finishing) queueTool(c, d);
    else if (!c || !c.finishing) {
      const list = pendingTools.get(id) || [];
      list.push(d);
      pendingTools.set(id, list.slice(-QUEUE_MAX));
    }
  };
  // A caption reads like a sentence: "Creating RedCircle.tsx" -> "Creating
  // Red Circle" (a component's file name, split on its capitals; other
  // files keep their names).
  function pretty(label) {
    return label.replace(/\b([A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+)\.(?:tsx|jsx)\b/g, (m, stem) => stem.replace(/([a-z0-9])([A-Z])/g, "$1 $2"));
  }
  // Where a tool call happens on this canvas: its frame (tempo-ui's id), its
  // point (tempo-ui's x / y), the storyboard its file or the canvas edit
  // names, the comment's storyboard, else the comment's pin.
  const squash = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  function toolTarget(c, R, d) {
    if (d.nodeId && itemEl(R, String(d.nodeId))) return { itemId: String(d.nodeId) };
    // "rtca:action": a selector (the storyboard, a canvas-nodes frame, or an
    // element inside a storyboard's document), else a screen rect
    if (d.selector) {
      try {
        let n = R.root.querySelector(d.selector);
        if (n) {
          const item = n.closest(SEL.thing);
          if (item && item.closest(SEL.root) === R.root) return { itemId: keyOf(item) };
        } else {
          for (const [f, F] of R.frames) {
            if (!F.doc) continue;
            n = F.doc.querySelector(d.selector);
            if (n) {
              const w = elWorldRect(R, f, n);
              if (w) return { point: { x: w.x + Math.min(w.width * 0.35, 56 / (R.view || { zoom: 1 }).zoom), y: w.y + Math.min(w.height * 0.5, 22 / (R.view || { zoom: 1 }).zoom) } };
            }
          }
        }
      } catch (e) {
        note("selector", e);
      }
    }
    if (d.rect && R.rb && R.view) {
      const v = R.view;
      const rb = R.rb;
      const p = { x: (d.rect.left + Math.min(d.rect.width * 0.4, 48) - rb.left - v.x) / v.zoom, y: (d.rect.top + Math.min(d.rect.height * 0.5, 24) - rb.top - v.y) / v.zoom };
      for (const n of R.root.querySelectorAll(SEL.thing)) {
        const r = itemRect(n);
        if (r && p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height && n.closest(SEL.root) === R.root) return { itemId: keyOf(n) };
      }
      return { point: p };
    }
    if (d.point && Number.isFinite(+d.point.x) && Number.isFinite(+d.point.y)) return { point: { x: +d.point.x, y: +d.point.y } };
    const stem = d.file ? String(d.file).split(/[\\/]/).pop().replace(/\.(canvas\.)?[jt]sx?$|\.\w+$/i, "") : "";
    const want = [d.storyboard, stem].map(squash).filter((w) => w.length >= 3 && w !== "index" && w !== "app");
    if (want.length)
      for (const n of R.root.querySelectorAll(SEL.item)) {
        if (n.closest(SEL.root) !== R.root) continue;
        const h = squash(headerText(n));
        if (h && want.some((w) => w === h || (w.length >= 5 && h.length >= 5 && (h.includes(w) || w.includes(h))))) return { itemId: n.getAttribute("data-canvas-item-id") };
      }
    // a screenshot / layout pass: what it last worked on
    if ((d.kind === "shot" || d.kind === "layout") && c.itemId && itemEl(R, c.itemId)) return { itemId: c.itemId };
    const a = c.task.anchor;
    if (a && a.nodeId && itemEl(R, String(a.nodeId))) return { itemId: String(a.nodeId) };
    const p = startPoint(c, R);
    return p ? { point: p } : null;
  }
  function queueTool(c, d) {
    const R = c.R;
    if (!R) return;
    let tg = null;
    try {
      tg = toolTarget(c, R, d);
    } catch (e) {
      note("tool-target", e);
    }
    if (!tg) return;
    enqueue(c, { kind: "tool", R, itemId: tg.itemId || "", point: tg.point || null, ch: { kind: "tool", tool: d.kind, holds: [] }, at: now(), held: false, label: pretty(String(d.label || "")) || null });
    trace(c.id, "tool", { tool: d.tool, kind: d.kind, target: tg.itemId || (tg.point ? "point" : null) });
  }
  const onAvatarIn = (e) => {
    const d = (e && e.detail) || {};
    if (d.taskId == null) return;
    const id = String(d.taskId);
    const b = births.get(id) || { at: now(), launch: null, avatar: null };
    b.avatar = rectOf(d.rect) || b.avatar;
    births.set(id, b);
    const c = cursors.get(id);
    if (c && c.birth) tryBirth(c, !!b.avatar);
    else scheduleSync();
  };
  // Back from a hidden window: what piled up meanwhile is compacted (the
  // newest change per storyboard / element, 2 at most), a running gesture
  // lands at once; flights are timed and land on the next frame.
  function compact() {
    for (const c of cursors.values()) {
      if (c.act) abortAct(c, true);
      const keep = [];
      const seen = new Set();
      for (let i = c.queue.length - 1; i >= 0; i--) {
        const a = c.queue[i];
        const k = `${a.R.id}|${a.itemId}`;
        if (seen.has(k) || keep.length >= 2) {
          dropAction(a);
          S.compacted++;
          continue;
        }
        seen.add(k);
        keep.unshift(a);
      }
      c.queue = keep;
    }
  }

  const RTCA = [
    ["rtca:launch", onRtcaLaunch],
    ["rtca:action", onRtcaAction],
    ["rtca:action-end", onRtcaActionEnd],
    ["rtca:thinking", onRtcaThinking],
    ["rtca:done", onRtcaDone],
    ["rtca:failed", onRtcaFailed],
    ["rtca:needs-input", onRtcaNeedsInput],
  ];

  // ------------------------------------------------------------------- init
  function init() {
    if (disposed) return;
    window.addEventListener("pointerdown", onDown, opts);
    window.addEventListener("pointerup", onUp, opts);
    window.addEventListener("pointercancel", onUp, opts);
    window.addEventListener("keydown", onKey, opts);
    window.addEventListener("wheel", onWheel, opts);
    window.addEventListener("blur", onBlur);
    window.addEventListener("rtcc:changed", onStoreEvent);
    window.addEventListener("rtcc:launch", onLaunch);
    window.addEventListener("rtcc:captured", onCaptured);
    window.addEventListener("rtcc:activity", onActivity);
    window.addEventListener("rtcb:avatar-in", onAvatarIn);
    for (const [k, fn] of RTCA) window.addEventListener(k, fn);
    if (reduceMQ && reduceMQ.addEventListener) reduceMQ.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", startLoop);
    tick();
  }
  function onVisibility() {
    if (disposed) return;
    if (document.hidden) {
      hiddenAt = now();
      if (tickWake) tickWake.cancel();
      if (wanderWake) wanderWake.cancel();
      if (birthWake) birthWake.cancel();
      tickWake = wanderWake = birthWake = null;
      cancelAnimationFrame(raf);
      raf = 0;
      P.last = 0;
    } else {
      if (hiddenAt && now() - hiddenAt > 250) compact();
      hiddenAt = 0;
      tick();
      for (const c of cursors.values()) if (c.birth) tryBirth(c, false);
      startLoop();
    }
  }
  function dispose() {
    disposed = true;
    if (tickWake) tickWake.cancel();
    if (wanderWake) wanderWake.cancel();
    if (birthWake) birthWake.cancel();
    tickWake = wanderWake = birthWake = null;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("resize", startLoop);
    cancelAnimationFrame(raf);
    raf = 0;
    if (unsub) {
      try {
        unsub();
      } catch (_) {}
    }
    unsub = null;
    window.removeEventListener("pointerdown", onDown, opts);
    window.removeEventListener("pointerup", onUp, opts);
    window.removeEventListener("pointercancel", onUp, opts);
    window.removeEventListener("keydown", onKey, opts);
    window.removeEventListener("wheel", onWheel, opts);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("rtcc:changed", onStoreEvent);
    window.removeEventListener("rtcc:launch", onLaunch);
    window.removeEventListener("rtcc:captured", onCaptured);
    window.removeEventListener("rtcc:activity", onActivity);
    window.removeEventListener("rtcb:avatar-in", onAvatarIn);
    for (const [k, fn] of RTCA) window.removeEventListener(k, fn);
    if (reduceMQ && reduceMQ.removeEventListener) reduceMQ.removeEventListener("change", onMotion);
    teardown();
    if (tipEl) tipEl.remove();
    if (window.__RE_TEMPO_AGENT_CURSORS__ === API) delete window.__RE_TEMPO_AGENT_CURSORS__;
  }

  const rect4 = (r) => r && { x: r2(r.x), y: r2(r.y), width: r2(r.width), height: r2(r.height) };
  const API = {
    colorOf,
    enabled,
    refresh() {
      tick();
    },
    state() {
      return {
        enabled: enabled(),
        on: S.on,
        reducedMotion: reduced(),
        store: !!store(),
        roots: [...roots.values()].map((R) => ({
          names: [...R.names],
          cursors: [...R.cursors].map((c) => c.id),
          rect: R.rb ? { left: r2(R.rb.left), top: r2(R.rb.top), width: r2(R.rb.width), height: r2(R.rb.height) } : null,
          view: R.view ? { ...R.view } : null,
          frames: R.frames.size,
          watch: !R.cursors.size,
          crossOrigin: [...R.frames.values()].filter((F) => F.cross).length,
          selections: R.sels.size,
          holds: [...R.holds.values()].filter(holding).length,
        })),
        cursors: [...cursors.values()].map((c) => ({
          id: c.id,
          kind: c.task.kind || "comment",
          title: c.task.title || null,
          canvasNames: c.task.canvasNames ? [...c.task.canvasNames] : null,
          sticky: !!c.task.sticky,
          n: c.n,
          label: c.nameEl.textContent,
          color: hexOf(c.color),
          colorIndex: c.color,
          status: c.task.status,
          canvas: c.task.canvasName,
          attached: !!c.R,
          shown: !!c.R && !c.el.hidden,
          finishing: c.finishing,
          world: c.pos ? { x: r2(c.pos.x), y: r2(c.pos.y) } : null,
          base: c.base ? { x: r2(c.base.x), y: r2(c.base.y) } : null,
          screen: c.screen ? { x: r2(c.screen.x), y: r2(c.screen.y) } : null,
          moving: !!(c.tween || c.act || c.flight),
          flight: c.flight ? c.flight.kind : null,
          waitingForAvatar: !!c.birth,
          action: c.act ? { kind: c.act.a.kind, leg: (c.act.legs[c.act.i] || {}).kind || null, itemId: c.act.a.itemId } : null,
          queue: c.queue.map((a) => a.kind),
          selection: c.sel && c.sel.world ? { ...rect4(c.sel.world), mode: c.sel.mode, type: c.sel.src.type } : null,
          itemId: c.itemId,
          focus: rect4(c.focus),
          clicks: c.clicks,
          moves: c.moves,
          ask: c.el.classList.contains("rtac--ask"),
          caption: c.capEl && !c.capEl.hidden ? c.capText.textContent : null,
          tool: c.tool ? { label: c.tool.label, kind: c.tool.kind, status: c.tool.status } : null,
          landedAt: c.landedAt || null,
          via: c.via || null,
          thinking: !!c.thinking,
          orbit: !!c.orbit,
          edge: !!c.edgeOn,
        })),
        cinema: { seeded: S.seeded, sparks: S.sparks, bursts: S.bursts, rtca: S.rtca, firstFrameMs: S.firstFrameMs, hints: hints.size },
        births: [...births].map(([id, b]) => ({ id, pin: b.pin ? { left: r2(b.pin.left), top: r2(b.pin.top), width: r2(b.pin.width), height: r2(b.pin.height) } : null, launch: !!b.launch, avatar: !!b.avatar, seeded: !!b.seeded, pulsed: !!b.pulsed, sparked: !!b.sparked })),
        chats: {
          store: !!CH.get,
          live: [...CH.live.keys()],
          pending: [...CH.first.keys()].filter((k) => !CH.live.has(k)),
          ended: [...CH.ended.keys()],
        },
        changes: S.changes,
        ignored: S.ignored,
        muted: S.muted,
        holds: S.holds,
        actions: { ...S.actions },
        flights: { ...S.flights },
        dropped: S.dropped,
        compacted: S.compacted,
        maxQueue: S.maxQueue,
        forwardedWheel: S.forwardedWheel,
        lastOpen: S.lastOpen,
        lastChange: S.lastChange,
        lastBirth: S.lastBirth,
        tools: S.tools,
        pulses: S.pulses,
        log: S.log.slice(),
        perf: {
          frames: P.frames,
          fps: P.gapSum ? r2((1000 * P.frames) / P.gapSum) : null,
          framesOver50ms: P.long,
          maxFrameGapMs: r2(P.maxGap),
          workAvgMs: P.frames ? r2(P.workSum / P.frames) : null,
          workMaxMs: r2(P.workMax),
        },
        errors: S.errors.slice(),
      };
    },
    resetPerf() {
      Object.assign(P, { frames: 0, gapSum: 0, long: 0, maxGap: 0, workSum: 0, workMax: 0, last: 0 });
    },
    dispose,
  };
  window.__RE_TEMPO_AGENT_CURSORS__ = API;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
