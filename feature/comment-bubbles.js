/*
 * RE-TEMPO · comment-bubbles (user MOD layer)
 * ---------------------------------------------------------------------------
 * The designer's view of the comments they "pointed" at on a canvas. Each
 * comment that the canvas-comment-agent pipeline handed to a Claude chat
 * becomes a bubble in a segment that continues the canvas name pill ("Canvas
 * page") to its right. The designer only sees what they sent and what the
 * agent did about it, never the chat itself.
 *
 * Segment: part of the canvas chrome, not an overlay. It is the pill's
 * immediate next sibling in the pill's own container (the app's top row of
 * that canvas view), with the pill's own classes (same height, surface,
 * border, radius), in the row's flow (margin-right: auto keeps it against
 * the pill), so it moves with the pill at 0 px on any pane resize or divider
 * drag; [data-rtcb-joined] squares the pill's right corners and a thin
 * divider separates them. Inside: the counter ("3 open · 2 done today"),
 * then the bubbles in a row, 28 px, overlapping by 6 px like presence
 * avatars (a cut-out ring in the segment colour, the first one on top), at
 * most 5 and "+N" (expands the row; the open request always keeps its
 * bubble). It never passes the app's controls on the same row (zoom, Share)
 * nor the canvas view: when tight, fewer bubbles, then no counter, then
 * nothing. No pill: nothing (no floating fallback). React re-creating the
 * row: put back on the next body mutation.
 * Everything else of this UI (panel, tooltip, enlarged view) is a child of
 * the canvas view element (the pill's clipping "relative … overflow-clip"
 * ancestor), absolutely positioned in it: nothing fixed, nothing on <body>.
 * Pointer down, wheel, double-click and context menu stop at this UI, so the
 * canvas does not pan, zoom or place a comment under it.
 * Bubbles (28px): the author's initials inside a status ring, plus a corner
 * badge, so colour is never the only signal.
 *   needs-input  amber ring pulsing + "?" badge         (sorted first)
 *   running      ring spinning in Claude's colour + Claude logo badge
 *   queued       hollow dashed ring, no badge
 *   failed       red ring + "!" badge
 *   done         green ring + check badge; the check pops once when it
 *                finishes on screen (the only celebration: no sound, no
 *                modal, no amber). After 8 s the bubble dims to 60%; after
 *                1 h it moves to "Show resolved"
 * Within a status, oldest first. Bubbles slide to their new place when the
 * order changes (no motion with prefers-reduced-motion). Each request has a
 * number (#1, #2… in order of creation), shown in the tooltip and the panel.
 * Tooltip (below the bubble): #n, author, status, the request; a running
 * agent also shows its last captured frame (task.lastFrame, live while the
 * tooltip is up), a done one its result (shotView, below). An agent in a
 * slot gets the same picture (agentTip): done, its result as the hero
 * (the card 312 px wide, the after as wide as the card); its live frame
 * while it works, else its before, in a box of the picture's own ratio
 * that holds its place while the image decodes (then a 160 ms fade in);
 * then "#n · status · time" and the request in two lines. A card with a
 * result takes the pointer: it stays while hovered (the pointer may cross
 * the gap from the avatar), a press compares, a click enlarges, Shift
 * shows the before; placed towards the middle of the
 * view, flipped and slid to stay inside the view and the window. Clicking
 * the avatar hands over to its popover: the tooltip fades under the panel
 * while the popover grows out of the avatar (220 ms, scale 0.96 + 4 px),
 * so nothing blinks.
 * Follow: ⌥-click a bubble, or "Follow" in the panel: window event
 * "rtcb:follow" {id} and window.__RE_TEMPO_AGENT_FOLLOW__.follow(id) when
 * that mod exists (it pans/zooms to the agent); again (or unfollow()):
 * "rtcb:unfollow" {id} and its unfollow(id). The followed bubble has a
 * Claude-coloured outline.
 * Boundary: the canvas view's box (pane-dock's viewRect(canvas) when it has
 * one, else the pill's nearest clipping ancestor, else the canvas root): the
 * segment, the panel and the tooltips stay inside it, so a canvas in a
 * narrow pane keeps all of this inside that pane.
 *
 * Panel (click a bubble; one at a time; 420 px wide, at most min(560 px, 60% of
 * the canvas view) tall, only its body scrolls (header and reply field
 * stay); Escape or a click outside closes it; for a bubble in a slot (the
 * composer at the bottom) a small popover instead, [data-anchor="bubble"]:
 * 320 px wide, 400 px tall at most, centred over that bubble, its bottom
 * 14 px over the slot's surface (the composer), a caret on the bubble;
 * Escape, "/" and Shift act only with the focus in the panel / enlarged view
 * or the pointer over them, and Escape never while an app menu or dialog is
 * open),
 * opening downwards from the segment (above it when there is no room below),
 * narrower and shorter to fit the canvas view, never under its bottom
 * toolbar, top to bottom:
 *   - header: #n, status chip, time and, on the right, the chat's model and
 *     effort ("✱ Opus 5.5 · High", Claude's mark);
 *   - needs-input only: the agent's question as an amber card, with the
 *     answer field inside it, focused when the panel opens;
 *   - "You asked": avatar, the comment, canvas › storyboard, the before
 *     screenshot (click to enlarge);
 *   - "Agent" (with the model when the header has no room for it): the
 *     timeline. The agent's last message shows whole, in Markdown (`code`,
 *     **bold**, lists, fenced code: md(), text nodes only), at most 6 lines
 *     then "Show more" in place; its earlier thoughts and actions fold into
 *     "N steps", which one click opens with every step whole (no second
 *     fold, no focus ring on a click: :focus-visible only); the designer's
 *     replies, the questions answered and the answers stay visible. A
 *     failure the last message explains is said once, in the failure card;
 *     a summary that is that message is not repeated;
 *   - "Result" / "Preview": failure reason, then the media in one carousel
 *     (slides: "Result", the shotView, the default: it replays while the
 *     pointer is on it; GIF, or the key frames without a GIF; without an
 *     after, Before / After; arrows, dots, ←/→; Shift peeks at the before,
 *     "/" pins it; a click enlarges them all), why a capture is missing (the
 *     pipeline's "note" updates, until it shows up), then the summary in 3
 *     lines with "Show more". The GIF slide plays on its own (paused, its
 *     still shown, under prefers-reduced-motion) with "GIF" (play / pause)
 *     and "Copy" (image/gif where the clipboard takes it, else the GIF as
 *     HTML plus a still PNG); no download button;
 *   - footer: "Reply to the agent…" (Enter -> reply(id, text)), "Follow"
 *     (while it works) and, once finished, "Dismiss" (dismiss(id)). No
 *     "Open chat": no click on this UI opens a chat or leaves the canvas.
 *     One text box: next to canvas-chrome's composer (a field marked
 *     [data-rtcb-composer-field] within the slot's 4 nearest ancestors) the
 *     panel has no field of its own ([data-reply="composer"]): the composer
 *     answers the agent ("Reply to #N…" / "Answer #N…", see "the card's
 *     agents list": markReply), takes the focus a frame after the popover
 *     shows, and a press in it never closes the popover; Follow, Stop and
 *     Dismiss sit in the popover's header, compact (on the card's "‹ Agents"
 *     line in the card).
 *
 * Result picture (shotView): the after is the hero, at its own ratio. On
 * it, the replay (task.replay's frames crossfading on their timeline, the
 * agent's cursor in its colour gliding between its points with a short
 * chip, a progress hairline; without one, before -> after with the cursor
 * from the pin to each changed area), each pass ending on the after and
 * looping; the changed areas (shot.boxes) outlined thin with a soft glow
 * that comes and goes. Compare: press and hold = the before, drag = a
 * divider (before left), Shift = the before, "/" pins it. An empty place
 * (shot.empty): no before, a quiet "New". shot.note: one muted line under
 * it. Web Animations on opacity / transform only, started once the frames
 * are decoded; nothing is drawn or encoded on hover. prefers-reduced-
 * motion: no autoplay, the after with its areas outlined. The enlarged
 * view (a click) shows the same, big, replaying, with "Replay".
 *
 * Why not the real chat inside the panel: pane-dock hosts chats through the
 * app's popout "transferred tabs" store (a fake window + moveToPopup). Doing
 * that here would take the chat tab out of the center while the panel is
 * open, duplicate pane-dock's store discovery, and show the whole agent
 * prompt and tool calls, the opposite of "only what I sent".
 *
 * Data: window.__RE_TEMPO_COMMENT_AGENT__ (feature/canvas-comment-agent.js,
 * read-only here): tasks() -> Task[] (oldest first), subscribe(cb) (not
 * called on subscribe, so tasks() is read first), the window event
 * "rtcc:changed", reply(id, text) -> Promise<boolean> (its openChat(id) is
 * never called from here: nothing of this UI leaves the canvas),
 * dismiss(id). Task = {id, threadId, text, author:{name, initials, color},
 * canvasName, storyboardName, anchor, createdAt, status: queued|running|
 * needs-input|done|failed, startedAt, finishedAt, model, effort,
 * before/after:{dataUrl,w,h}|null, gif:{dataUrl,frames,w,h,bytes}|null,
 * frames:[{dataUrl,w,h}]|null, lastFrame:{dataUrl,w,h,at}|null,
 * shot:{boxes:[{fx,fy,fw,fh,kind,label}], pin:{fx,fy}|null, empty, src,
 * note}|null (v2: where the after changed, in fractions of it; empty: no
 * before on purpose), replay:{w,h,durMs<=6000, frames:[{dataUrl,t}],
 * cursor:[{t,fx,fy,kind,label}]}|null (older tasks: neither), summary,
 * updates:[{at, kind: text|screenshot|
 * note, text?, dataUrl?, shot?}], error}. The pipeline also logs its
 * before/after captures as screenshot updates ("before"/"after"); the
 * timeline skips them, and the notes (shown in Result). Missing fields are
 * null. tasks() is the source of truth: a task it drops leaves the column.
 * Tolerated fallback: an older jobs()-only API (state queued|starting|
 * running|awaiting|done|failed, author as a string, endedAt), whose finished
 * jobs vanish after a few seconds, so those are kept here.
 * This mod keeps per task: its number, when it finished (for the 8 s / 1 h
 * timers) and the replies sent from the panel. Saved in localStorage
 * "rtd.commentBubbles.cache" without screenshots (never eats the app's
 * quota). Read on subscribe() and on "rtcc:changed".
 *
 * Mount: one segment per visible canvas view (connected, laid out, not
 * hidden: no hit test, so the canvas's own layers such as comment mode never
 * hide it). A [data-rtcb-host] slot anywhere in that view (another mod's:
 * the chip row over a floating composer at the bottom centre, or a file
 * pill "untitled-2 ⌄ — Auto-saved" at the top) wins over the native pill:
 * the segment goes inside it, compact (.rtcb--hosted: 28 px tall, natural
 * width, no surface or margin of its own; a short counter in 11 px, "2
 * waiting" / "2 running" / "1 queued" / "5 done" / "1 failed", only when it
 * costs no avatar; first the "Manage agents" button (the agents grid icon;
 * in a pill with a surface of its own, e.g. canvas-chrome's agents pill,
 * concentric with it: the same inset on every side as the pill's padding
 * and border, its radius the pill's less that inset; else 22 px), then the
 * agents as a stack of 24 px avatars overlapping 6 px, then "+N" (a 24 px
 * disc in the stack, up to "+99"); the status
 * only in a 1.5 px ring, no corner badges, no "Show resolved" button; a
 * divider on its left only when something of a transparent slot's container
 * comes before it; as wide as that container and the controls on its right
 * allow, a name in it keeping ~96 px).
 * Agents in a slot: each avatar is the agent's colour (agent-cursors'
 * colorOf(taskId) when that mod offers it, so it matches the agent's cursor;
 * else a stable colour of this mod's palette) with its request number, the
 * status only in the ring (a spinning arc in the agent's colour while it
 * works). As many as the slot's width allows: the slot's own
 * data-rcc-max-w / --rcc-agents-max (px, the room for this whole segment;
 * re-read when the attribute or the slot's style changes), else 3: as many
 * as fit together with "+N" (K), all of them when they are K or fewer, so
 * more agents never show fewer avatars (one line, 89 px: K = 3; docked,
 * 221 px: 8, the most). Which ones: needs-input, then working (queued too), then the most
 * recent; shown left to right: the waiting ones, then the others from the
 * oldest to the newest, so a new agent appears at the end, next to "+N"
 * and the button (where canvas-chrome's launch lands). A slot without a width of its own (no data-rcc-max-w /
 * --rcc-agents-max): on hover / focus the avatars spread (150 ms; 24 px
 * each, 6 px apart, up to 8), back 300 ms after the pointer / focus leaves.
 * Each avatar is a button: its tooltip is the agent's picture (agentTip,
 * above); a click (or ⇧-click) opens that agent: with canvas-chrome's card
 * open (state().shells[].leftOpen), its thread in the card ("‹ Agents"
 * back to the list), else the small popover over the avatar; the card
 * opening while that popover is open, or right after a press closed it
 * (its toggle), moves the same panel into the card in the card's first
 * frame, its copy fading where it was (onChromeChange). ⌥-click follows it
 * (agent-follow's own click handler when that mod is there). Tab / arrows
 * walk the avatars, "+N" and the button; Enter opens.
 * A new agent: on "rtcc:launch" {taskId, text, rect} (canvas-chrome's
 * composer, right after createTask) or, without it, a task first seen less
 * than 10 s after it was created: the avatars already there make room
 * (FLIP, 360 ms), one that has to go tucks into "+N" (a disc in its colour
 * flying into it), then, 110 ms in, the new avatar enters (560 ms): from
 * 40%, a 6 px blur and a brighter tone to 106%, then 100%, with a glow and
 * a ring in its colour behind the avatars (the segment's first child: in a
 * slot nothing clips it). When it is done (~680 ms): window event
 * "rtcb:avatar-in" {taskId, rect} (the avatar's DOMRect; agent-cursors
 * starts the agent's cursor there). An agent that lands past "+N" (the
 * stack full of waiting ones) still shows in the last place for 1.5 s,
 * ringed in its colour, then tucks into "+N", which pulses. An avatar that
 * leaves for good (dismissed) fades where it was. landing() (below) says
 * where the next one is born. prefers-reduced-motion: a 120 ms fade only.
 * In a slot with a width of its own (canvas-chrome's agents pill) the
 * segment is always there: with no agent it is "Manage agents" alone.
 * Manager ("Agents", compact segment and pill segment): "Manage agents",
 * "+N" or the counter open it; a panel in the canvas view (no route or tab
 * change), anchored to the segment: over the composer, opening upwards
 * from its left edge (360 px; one height while open, enough for every
 * agent, at most 460 px: only the list scrolls, so a filter or a search
 * never moves its header),
 * scale 0.96 + fade from the button that opened it (220 ms; closing 140 ms),
 * the rows 40 ms apart. Header: "Agents", the counts (running · waiting ·
 * done · failed), "Stop all" and "Clear done" (dismiss(id) of the
 * finished ones: what Done lists, done and failed). Filters Active / Done / All (a sliding segmented control, with
 * counts), a search field (request, canvas, storyboard, status, #n; the
 * match highlighted). One row per agent: its avatar (colour, number,
 * status ring), the request (one line), status · elapsed time (live) or
 * duration · canvas › storyboard; on hover or the active row: Follow (as
 * ⌥-click), Reply (the agent's popover), Stop (⌘.), Dismiss. Stop calls
 * the store's stop(id), "Stop all" its stopAll() in two steps ("Stop 4?"
 * for 3 s, then it stops them); without them (typeof checks) both show
 * disabled with the reason. A stopped agent (failed with stoppedAt) reads
 * "Stopped by you", its ring neutral, counted apart ("1 stopped"). Keys (the focus
 * starts in the search field): ↑ / ↓ move the active row, Enter replies,
 * ⌥Enter follows, ⌘⌫ dismisses a finished one, Escape clears the search,
 * then closes (the focus back on the button); ← / → on the filters. A click
 * outside, or the focus leaving it, closes it. Empty states per filter and
 * search. The rows' changes animate (enter, leave, FLIP). Kept open while
 * the canvas is: with no agent left it shows its empty state where the
 * segment was. It keeps the class .rtcb-pop (the pipeline masks it out of
 * its captures).
 * The panel opens towards the middle of the
 * view: a segment in the lower half -> above it (its bottom 12 px over the
 * segment, so never over the composer under it), else below. The tooltip
 * too. The slot gone, back to the native pill (canvas-chrome's floating
 * file pill without a slot gets nothing). The slot coming or going (added / removed, or the
 * attribute set) is seen by the body observer. The canvas name is the
 * canvas pill's name span (span.truncate / .rcc-file-name), else its text
 * before "⌄" / "—"; a slot outside a pill (the chip row) never names it. Sets
 * html.rtcb-on, which the pipeline uses to hide its own mini list. Never
 * hidden for a screenshot: the pipeline masks this UI out of its images.
 * Reply field: [data-rtcb-reply], 32 px kept free on its right; when the
 * voice-input mod offers window.__RE_TEMPO_VOICE__.attach, the panel calls
 * attach(field, {button: true, placement: "inside-end", onFinal}) when it
 * opens and destroys it when it closes (no dictation of its own). Only a
 * panel with a field of its own (the native pill's): next to the composer,
 * the composer's mic (canvas-chrome) is the one.
 * Lifecycle: see the "lifecycle" section (events only, no polling).
 *
 * The agent's replies in comment threads: the pipeline posts each run's
 * result with the app's addComment (so it is authored by the user) and ends
 * it with a marker line "· task <id> · <model> · <effort>". Every
 * [data-testid="comment-message"] whose text ([.whitespace-pre-wrap]) has
 * that marker is drawn as Claude's: a card appended to the message (Claude's
 * mark in a dark circle, still; "Claude"; the model/effort chip; the app's
 * timestamp; the text without the marker; the result (shotView: replays
 * under the pointer, a click enlarges; Before/After side by side for a task
 * without an after) and the GIF player from the task store, by the
 * marker's id; "Show agent": its
 * panel, in the canvas). The
 * message itself only gets data-rtcb-agent / data-rtcb-media and CSS hides
 * its native avatar, name and text (its "…" menu and reactions stay); its
 * native images are hidden only when the card shows the task's own (on a
 * machine without the task they stay). Nothing of React's is removed or
 * moved. Messages without the marker are never touched. A MutationObserver
 * (one rAF) and the 1 s tick keep it current; off -> everything restored.
 *
 * Off switch: localStorage "rtd.commentBubbles" = "off" (read on every store
 * event, DOM change and refresh()).
 * Introspection: window.__RE_TEMPO_COMMENT_BUBBLES__ = { open(id), close(),
 *   openManager(name?), closeManager() (openList / closeList: older names),
 *   follow(id), unfollow(), state(), showResolved(bool), refresh(),
 *   dispose() }; state().manager (filter, query, counts, rows, active),
 *   state().slot (its width, the avatars shown, "+N"), state().entries (the
 *   last new-agent entries: source, overflow, via, rect, ms).
 * Test hooks: window.__RE_TEMPO_COMMENT_BUBBLES_CFG__ = { checkMs, keepMs }
 *   read once at load.
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  // Re-injection without a page reload: drop the previous instance first.
  if (window.__RE_TEMPO_COMMENT_BUBBLES__ && typeof window.__RE_TEMPO_COMMENT_BUBBLES__.dispose === "function") {
    try {
      window.__RE_TEMPO_COMMENT_BUBBLES__.dispose();
    } catch (_) {}
  }

  // ---------------------------------------------------------------- config
  const CFG = window.__RE_TEMPO_COMMENT_BUBBLES_CFG__ || {};
  const OFF_KEY = "rtd.commentBubbles"; // "off" = disabled
  const CACHE_KEY = "rtd.commentBubbles.cache";
  const CHECK_MS = CFG.checkMs || 8000; // done: full strength, then dim
  const KEEP_MS = CFG.keepMs || 60 * 60 * 1000; // done/failed stay in the column
  const RESOLVED_MS = 24 * 60 * 60 * 1000; // "Show resolved" reaches this far back
  const CELEBRATE_MS = 900;
  const RESTORE_GRACE_MS = 5000;
  const CACHE_MAX = 60;
  const PANEL_W = 420;
  const PANEL_MAX_H = 560; // and 60% of the canvas view's height
  // a slot's bubble (the composer at the bottom): a small popover over it
  const BPOP_W = 320;
  const BPOP_MAX_H = 400;
  const BPOP_GAP = 14; // its bottom this far over the slot's surface (the caret in it)
  const UP_GAP = 12; // a panel opening upwards: this far over the segment
  const GAP = 8;
  const EDGE = 12;
  const EDGE_IN = 8; // margin inside the canvas view
  const SEG_PAD = 8; // segment padding (each side)
  const MAX_SHOWN = 5; // bubbles before "+N"
  const COMPACT_MAX = 4; // in a slot
  const SPREAD_MAX = 8; // in a slot, spread on hover / focus
  const SPREAD_OUT_MS = 300; // back to the cluster after the pointer / focus leaves
  const HUB_W = 360; // the manager
  const HUB_MAX_H = 460;
  const HUB_GAP = 10; // its bottom this far over the composer
  const HUB_ROW_H = 46; // one agent in it (CSS .rtcb-hub-row)
  const FIT_FALLBACK = 3; // avatars in a slot that gives no width of its own
  const FIT_MAX = 8; // avatars in a slot, at most
  const NEW_MS = 10000; // a task first seen this soon after its creation is new
  const ENTRY_DELAY = 110; // the avatars around it start making room first
  const ENTRY_MS = 560; // then the new agent's avatar enters (ends at 670 ms)
  const BURST_MS = 720; // its glow, from the moment it is inserted
  const FLIP_MS = 360; // the avatars around it making room
  const HOLD_MS = 1500; // a new agent past "+N" stays in view this long
  const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
  const EASE_IN_OUT = "cubic-bezier(0.65, 0, 0.35, 1)";
  const SEG_MIN = 76; // room the segment needs right of the pill
  const MAX_Z = 20;
  const SLOT_AV = 24; // an avatar in a slot (canvas-chrome's agents pill: 8 px from its edge, concentric)
  const TIP_DELAY = 260;
  const ROOT_CLASS = "rtcb-on";
  const SEL = {
    host: "[data-rtcb-host]", // a slot for the segment in a canvas view (another mod's pill)
    left: [
      '[data-testid="workspace-navbar"]',
      "[data-rtps-root]",
      '[data-tempo-workspace-panel="left"]',
      '[data-testid="docs-view-sidebar"]',
      '[data-testid="issues-sidebar"]',
      '[data-testid="canvas-sidebar"]',
    ],
    content: ["[data-canvas-root]", '[data-testid="center-panel"]'],
    designBar: '[data-testid="design-view-tab-bar"]',
    // The canvas's own name pill (collapsed design sidebar: canvas name + expand
    // button). The column docks right below it.
    pill: '[aria-label="Canvas page"], [data-rcq-switch], button[aria-label="Expand sidebar"], [data-testid="design-view-tab-bar"]',
    editable: 'input, textarea, select, [contenteditable=""], [contenteditable="true"]',
  };

  const now = () => Date.now();
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
      } catch (_) {}
    },
  };
  const enabled = () => ls.get(OFF_KEY) !== "off";
  const reducedMotion = () => {
    try {
      return matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  };
  const agent = () => {
    const a = window.__RE_TEMPO_COMMENT_AGENT__;
    return a && typeof a === "object" ? a : null;
  };
  const has = (fn) => {
    const a = agent();
    return !!(a && typeof a[fn] === "function");
  };
  const errors = [];
  const note = (where, e) => {
    errors.push({ where, at: now(), msg: String((e && e.message) || e) });
    if (errors.length > 20) errors.shift();
  };

  // ---------------------------------------------------------------- icons
  const CLAUDE_PATH =
    "M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z";
  const claudeSvg = (size) =>
    `<svg class="rtcb-claude" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false"><path fill="#D97757" d="${CLAUDE_PATH}"/></svg>`;
  const svg12 = (inner, size = 12) =>
    `<svg viewBox="0 0 12 12" width="${size}" height="${size}" fill="none" aria-hidden="true" focusable="false">${inner}</svg>`;
  const ICON = {
    check: svg12('<path class="rtcb-check-path" d="M2.6 6.3 4.9 8.6 9.4 3.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>', 9),
    bang: svg12('<path d="M6 2.8v3.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="6" cy="8.9" r=".95" fill="currentColor"/>', 9),
    ask: svg12('<path d="M4.4 4.6a1.7 1.7 0 1 1 2.5 1.5c-.6.3-.9.7-.9 1.3v.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="6" cy="9.3" r=".9" fill="currentColor"/>', 9),
    close: svg12('<path d="M3 3l6 6M9 3 3 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>'),
    send: svg12('<path d="M6 9.8V2.4M2.9 5.4 6 2.3l3.1 3.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>', 13),
    open: svg12('<path d="M5 2.5H3.2a.7.7 0 0 0-.7.7v5.6c0 .4.3.7.7.7h5.6c.4 0 .7-.3.7-.7V7M7 2.5h2.5V5M9.3 2.7 5.6 6.4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>'),
    canvas: svg12('<rect x="1.75" y="2.25" width="8.5" height="7.5" rx="1.25" stroke="currentColor" stroke-width="1"/><path d="M1.75 4.75h8.5" stroke="currentColor" stroke-width="1"/>', 11),
    history: svg12('<path d="M2.2 6a3.8 3.8 0 1 0 1.1-2.7M2.2 2.3v1.9h1.9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 4v2.2l1.4.9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>', 13),
    hide: svg12('<path d="M3 6.5 5 8.5 9 3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>', 13),
    chev: svg12('<path d="M4.5 3 7.5 6l-3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>', 10),
    chevL: svg12('<path d="M7.5 3 4.5 6l3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>', 10),
    play: svg12('<path d="M4 2.8v6.4L9.2 6 4 2.8Z" fill="currentColor"/>', 11),
    pause: svg12('<path d="M4 2.8v6.4M8 2.8v6.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>', 11),
    info: svg12('<circle cx="6" cy="6" r="4.6" stroke="currentColor" stroke-width="1"/><path d="M6 5.4v3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><circle cx="6" cy="3.7" r=".65" fill="currentColor"/>', 12),
    // canvas-chrome's agents icon (its "⊞ 0" empty state), on a 12 px grid
    agents: svg12('<rect x="1.6" y="1.6" width="3.6" height="3.6" rx=".9" stroke="currentColor" stroke-width="1.1"/><rect x="6.8" y="1.6" width="3.6" height="3.6" rx=".9" stroke="currentColor" stroke-width="1.1"/><rect x="1.6" y="6.8" width="3.6" height="3.6" rx=".9" stroke="currentColor" stroke-width="1.1"/><rect x="6.8" y="6.8" width="3.6" height="3.6" rx=".9" stroke="currentColor" stroke-width="1.1"/>', 14),
    search: svg12('<circle cx="5.2" cy="5.2" r="3.4" stroke="currentColor" stroke-width="1.1"/><path d="m7.8 7.8 2.6 2.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>', 13),
    follow: svg12('<circle cx="6" cy="6" r="3.3" stroke="currentColor" stroke-width="1.1"/><circle cx="6" cy="6" r="1" fill="currentColor"/><path d="M6 .9v1.6M6 9.5v1.6M.9 6h1.6M9.5 6h1.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>', 13),
    reply: svg12('<path d="M4.8 2.8 2.2 5.4 4.8 8M2.5 5.4h4.3a2.8 2.8 0 0 1 2.8 2.8v.9" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>', 13),
    chat: svg12('<path d="M3.2 2.2h5.6a1.2 1.2 0 0 1 1.2 1.2v3.9a1.2 1.2 0 0 1-1.2 1.2H5.4L3 10.2V8.5h.2A1.2 1.2 0 0 1 2 7.3V3.4a1.2 1.2 0 0 1 1.2-1.2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>', 14),
    stop: svg12('<rect x="3" y="3" width="6" height="6" rx="1.3" fill="currentColor"/>', 13),
    dismiss: svg12('<path d="M3.2 3.2l5.6 5.6M8.8 3.2 3.2 8.8" stroke="currentColor" stroke-width="1.15" stroke-linecap="round"/>', 13),
  };

  // --------------------------------------------------------- normalization
  const STATUS = {
    queued: "queued",
    pending: "queued",
    waiting: "queued",
    starting: "running",
    running: "running",
    working: "running",
    "needs-input": "needs-input",
    needs_input: "needs-input",
    awaiting: "needs-input",
    "awaiting-input": "needs-input",
    done: "done",
    completed: "done",
    complete: "done",
    failed: "failed",
    error: "failed",
    cancelled: "failed",
  };
  const TERMINAL = new Set(["done", "failed"]);
  const RANK = { "needs-input": 0, running: 1, queued: 2, failed: 3, done: 4 };
  const LABEL = { queued: "Queued", running: "Working", "needs-input": "Needs your input", done: "Done", failed: "Failed" };
  const PALETTE = ["#8b5cf6", "#3b82f6", "#14b8a6", "#f59e0b", "#ec4899", "#22c55e", "#ef4444", "#6366f1"];
  // agents without agent-cursors' colorOf: the same deep tones its cursors use
  const AGENT_PALETTE = ["#c2532d", "#2563eb", "#7c3aed", "#047857", "#db2777", "#0e7490", "#4f46e5", "#4d7c0f"];
  const SAFE_URL = /^(data:image\/|blob:|https?:|file:)/i;

  const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
  function time(v) {
    if (typeof v === "number" && isFinite(v)) return v;
    if (typeof v === "string") {
      const t = Date.parse(v);
      return isNaN(t) ? null : t;
    }
    return null;
  }
  function shot(v) {
    if (!v) return null;
    const url = typeof v === "string" ? v : str(v.dataUrl) || str(v.url) || str(v.src);
    if (!url || !SAFE_URL.test(url)) return null;
    return { dataUrl: url, w: typeof v === "object" ? num(v.w ?? v.width) : null, h: typeof v === "object" ? num(v.h ?? v.height) : null };
  }
  function initialsOf(name) {
    const w = String(name).split(/\s+/).filter(Boolean);
    if (!w.length) return "?";
    return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : w[0][0]).toUpperCase();
  }
  function colorOf(name) {
    let h = 0;
    for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }
  const CSS_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/deg]+\)|oklch\([\d\s.,%/]+\)|[a-z]{3,20})$/i;
  function author(a) {
    if (typeof a === "string") a = { name: a };
    if (!a || typeof a !== "object") a = {};
    const name = str(a.name) || str(a.displayName) || "You";
    const color = str(a.color) && CSS_COLOR.test(a.color.trim()) ? a.color.trim() : colorOf(name);
    return { name, initials: (str(a.initials) || initialsOf(name)).slice(0, 2).toUpperCase(), color };
  }
  // The agent's colour: agent-cursors' colorOf(taskId) (its cursor's), else
  // (that mod missing or turned off: no cursor to match) a stable one of
  // this palette.
  function agentColor(id) {
    const ac = window.__RE_TEMPO_AGENT_CURSORS__;
    let on = true;
    try {
      on = !ac || typeof ac.enabled !== "function" || ac.enabled() !== false;
    } catch (_) {}
    if (on && ac && typeof ac.colorOf === "function") {
      try {
        const c = ac.colorOf(id);
        if (typeof c === "string" && c.trim() && !(window.CSS && CSS.supports && !CSS.supports("color", c.trim()))) return c.trim();
      } catch (e) {
        note("colorOf", e);
      }
    }
    let h = 0;
    for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return AGENT_PALETTE[h % AGENT_PALETTE.length];
  }
  // The run's GIF: a GIF data URL (or blob:) only.
  function gifOf(v) {
    const url = v && typeof v === "object" ? str(v.dataUrl) : null;
    if (!url || !(/^data:image\/gif;base64,/i.test(url) || /^blob:/i.test(url))) return null;
    return { dataUrl: url, w: num(v.w), h: num(v.h), frames: num(v.frames), bytes: num(v.bytes) };
  }
  function updatesOf(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const u of list) {
      if (!u || typeof u !== "object") continue;
      const text = str(u.text) || str(u.body) || str(u.message);
      if (u.kind === "note") {
        if (text) out.push({ at: time(u.at), kind: "note", text, shot: str(u.shot), img: null });
        continue;
      }
      const img = shot(u.dataUrl || u.image || u.screenshot || null);
      const kind = u.kind === "screenshot" || (!text && img) ? "screenshot" : "text";
      if (kind === "text" && !text) continue;
      if (kind === "screenshot" && !img) continue;
      // the pipeline logs the designer's replies as "You: …" (role "user")
      const user = kind === "text" && u.role === "user";
      out.push({ at: time(u.at ?? u.time ?? u.createdAt), kind, text: user ? text.replace(/^You:\s*/, "") : text, img: kind === "screenshot" ? img : null, user });
    }
    return out;
  }
  // The capture's description (task.shot, v2): where the changes are in the
  // after (boxes, fractions of the image), the comment's pin, whether the
  // place was empty before, and why a capture fell back (note).
  const frac = (v) => (typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(1, v)) : null);
  const BOX_KINDS = new Set(["new", "edited", "moved"]);
  function shotMetaOf(v) {
    if (!v || typeof v !== "object") return null;
    const boxes = [];
    for (const b of Array.isArray(v.boxes) ? v.boxes : []) {
      if (!b || typeof b !== "object") continue;
      const fx = frac(b.fx);
      const fy = frac(b.fy);
      const fw = frac(b.fw);
      const fh = frac(b.fh);
      if (fx == null || fy == null || !fw || !fh) continue;
      boxes.push({ fx, fy, fw: Math.min(fw, 1 - fx), fh: Math.min(fh, 1 - fy), kind: BOX_KINDS.has(b.kind) ? b.kind : "edited", label: str(b.label) ? clip(str(b.label), 28) : null });
      if (boxes.length >= 8) break;
    }
    const pin = v.pin && frac(v.pin.fx) != null && frac(v.pin.fy) != null ? { fx: frac(v.pin.fx), fy: frac(v.pin.fy) } : null;
    return { boxes, pin, empty: v.empty === true, src: str(v.src), note: str(v.note) };
  }
  // The run's replay (task.replay): its frames on a timeline (t in ms, the
  // first the before, the last the after) and the agent's cursor on it. At
  // most 6 s: a longer one is squeezed into 6 s.
  const REPLAY_MAX = 6000;
  function replayOf(v) {
    if (!v || typeof v !== "object" || !Array.isArray(v.frames)) return null;
    const frames = [];
    for (const f of v.frames.slice(0, 24)) {
      const s = shot(f);
      const t = num(f && f.t);
      if (s && t != null) frames.push({ dataUrl: s.dataUrl, t: Math.max(0, t) });
    }
    if (frames.length < 2) return null;
    frames.sort((a, b) => a.t - b.t);
    const cursor = [];
    for (const c of Array.isArray(v.cursor) ? v.cursor.slice(0, 40) : []) {
      const t = num(c && c.t);
      const fx = frac(c && c.fx);
      const fy = frac(c && c.fy);
      if (t == null || fx == null || fy == null) continue;
      // label "" (e.g. the pin): no chip at all; no label: the kind's word
      cursor.push({ t: Math.max(0, t), fx, fy, kind: str(c.kind), label: str(c.label) ? clip(str(c.label), 28) : typeof c.label === "string" ? "" : null });
    }
    cursor.sort((a, b) => a.t - b.t);
    let dur = Math.max(num(v.durMs) || 0, frames[frames.length - 1].t, cursor.length ? cursor[cursor.length - 1].t : 0);
    if (dur > REPLAY_MAX) {
      const k = REPLAY_MAX / dur;
      for (const f of frames) f.t *= k;
      for (const c of cursor) c.t *= k;
      dur = REPLAY_MAX;
    }
    return { w: num(v.w), h: num(v.h), durMs: Math.max(dur, 1), frames, cursor };
  }
  function normTask(t) {
    if (!t || typeof t !== "object" || t.id == null) return null;
    const status = STATUS[String(t.status ?? t.state ?? "").toLowerCase()];
    if (!status) return null; // "gone" or unknown: not shown
    const anchor = t.anchor && typeof t.anchor === "object" ? t.anchor : null;
    return {
      id: String(t.id),
      threadId: t.threadId ?? null,
      text: String(t.text ?? t.body ?? "").trim(),
      author: author(t.author),
      canvasName: str(t.canvasName) || str(t.canvas) || null,
      storyboardName: str(t.storyboardName) || (anchor && (str(anchor.storyboardName) || str(anchor.storyboard))) || null,
      status,
      createdAt: time(t.createdAt) ?? now(),
      startedAt: time(t.startedAt),
      finishedAt: time(t.finishedAt ?? t.endedAt),
      model: str(t.model),
      effort: str(t.effort),
      before: shot(t.before),
      after: shot(t.after),
      gif: gifOf(t.gif),
      lastFrame: shot(t.lastFrame) ? { ...shot(t.lastFrame), at: time(t.lastFrame.at) } : null,
      frames: Array.isArray(t.frames) ? t.frames.map(shot).filter(Boolean).slice(0, 3) : [],
      shot: shotMetaOf(t.shot),
      replay: replayOf(t.replay),
      summary: str(t.summary),
      question: str(t.question),
      error: str(t.error),
      stoppedAt: time(t.stoppedAt),
      updates: updatesOf(t.updates),
    };
  }
  const sigOf = (t) =>
    JSON.stringify([
      t.status,
      t.text,
      t.author,
      t.canvasName,
      t.storyboardName,
      t.startedAt,
      t.finishedAt,
      t.model,
      t.effort,
      t.before && t.before.dataUrl.length,
      t.after && t.after.dataUrl.length,
      t.gif && t.gif.dataUrl.length,
      t.frames.length,
      t.shot && [t.shot.empty, t.shot.boxes.length, t.shot.note],
      t.replay && [t.replay.frames.length, t.replay.durMs],
      t.updates.filter((u) => u.kind === "note").map((u) => u.text),
      t.summary,
      t.question,
      t.error,
      t.stoppedAt,
      t.updates.length,
      t.updates.length ? t.updates[t.updates.length - 1].text : null,
    ]);

  // ------------------------------------------------------------- the store
  // id -> { task, n, live, doneAt, celebrateUntil, mine: [{at, text, state}],
  //        asked: [question texts seen while needs-input] }
  const cache = new Map();
  let api = null;
  let unsub = null;
  let sourceKind = null;
  let persistTimer = 0;

  function restore() {
    let list = [];
    try {
      list = JSON.parse(ls.get(CACHE_KEY) || "[]");
    } catch (_) {}
    if (!Array.isArray(list)) return;
    for (const r of list) {
      const task = r && normTask(r.task);
      if (!task) continue;
      cache.set(task.id, {
        task,
        n: num(r.n),
        live: false,
        doneAt: time(r.doneAt),
        celebrateUntil: 0,
        mine: Array.isArray(r.mine) ? r.mine.filter((m) => m && str(m.text)).map((m) => ({ at: time(m.at), text: m.text, state: m.state === "failed" ? "failed" : "sent" })) : [],
        asked: Array.isArray(r.asked) ? r.asked.filter((q) => typeof q === "string").slice(-20) : [],
      });
    }
    for (const e of cache.values()) if (!e.n) e.n = nextN();
  }

  // Light copy: no screenshots (data URLs can be hundreds of KB each, and
  // localStorage is shared with the app).
  function persist() {
    persistTimer = 0;
    const list = [...cache.values()]
      .sort((a, b) => b.task.createdAt - a.task.createdAt)
      .slice(0, CACHE_MAX)
      .map((e) => ({
        task: { ...e.task, before: null, after: null, gif: null, frames: null, replay: null, updates: e.task.updates.filter((u) => u.kind === "text") },
        n: e.n,
        doneAt: e.doneAt,
        mine: e.mine.filter((m) => m.state !== "sending"),
        asked: e.asked,
      }));
    ls.set(CACHE_KEY, list.length ? JSON.stringify(list) : null);
  }
  const persistSoon = () => persistTimer || (persistTimer = setTimeout(persist, 400));

  // Request numbers: #1, #2… in order of creation; they restart once every
  // kept request is gone.
  function nextN() {
    let m = 0;
    for (const e of cache.values()) if (e.n > m) m = e.n;
    return m + 1;
  }

  function attach(a) {
    if (unsub) {
      try {
        unsub();
      } catch (_) {}
    }
    unsub = null;
    api = a;
    if (a && typeof a.subscribe === "function") {
      try {
        const u = a.subscribe(() => schedule());
        if (typeof u === "function") unsub = u;
      } catch (e) {
        note("subscribe", e);
      }
    }
  }

  function readLive() {
    const a = agent();
    if (!a) {
      sourceKind = null;
      return null;
    }
    if (a !== api) attach(a);
    let list = null;
    try {
      if (typeof a.tasks === "function") {
        list = a.tasks();
        sourceKind = "tasks";
      } else if (typeof a.jobs === "function") {
        list = a.jobs();
        sourceKind = "jobs";
      } else sourceKind = null;
    } catch (e) {
      note("read", e);
      return null;
    }
    return Array.isArray(list) ? list : null;
  }

  function sync() {
    const raw = readLive();
    const t = now();
    let changed = false;
    if (raw) {
      const seen = new Set();
      const list = raw
        .map(normTask)
        .filter(Boolean)
        .sort((a, b) => a.createdAt - b.createdAt);
      for (const task of list) {
        if (seen.has(task.id)) continue;
        seen.add(task.id);
        const prev = cache.get(task.id);
        const prevStatus = prev ? prev.task.status : null;
        // A later snapshot without the screenshots keeps the ones already seen.
        if (prev) {
          // (an empty place has no before on purpose: not the old one either)
          if (!task.before && prev.task.before && !(task.shot && task.shot.empty)) task.before = prev.task.before;
          if (!task.after && prev.task.after) task.after = prev.task.after;
          if (!task.shot && prev.task.shot && task.status === prev.task.status) task.shot = prev.task.shot;
          if (!task.replay && prev.task.replay && task.status === prev.task.status) task.replay = prev.task.replay;
          if (!task.gif && prev.task.gif && task.status === prev.task.status) task.gif = prev.task.gif;
          if (!task.frames.length && prev.task.frames.length && task.status === prev.task.status) task.frames = prev.task.frames;
          if (task.updates.length < prev.task.updates.length && prev.task.updates.length) task.updates = prev.task.updates;
        }
        const e = prev || { task, n: nextN(), live: true, doneAt: null, celebrateUntil: 0, mine: [], asked: [] };
        // a task first seen right after its creation: a new agent (its avatar enters)
        if (!prev && booted && !TERMINAL.has(task.status) && task.createdAt >= t - NEW_MS && !entries.has(task.id)) newEntry(task.id, "store");
        if (task.status === "needs-input") {
          const q = questionOf(task);
          if (q && q.text && !e.asked.includes(q.text)) e.asked.push(q.text);
        }
        if (TERMINAL.has(task.status)) {
          if (!TERMINAL.has(prevStatus) || !e.doneAt) e.doneAt = task.finishedAt || t;
          if (task.status === "done" && prev && prev.live && prevStatus && prevStatus !== "done") e.celebrateUntil = t + CELEBRATE_MS;
        } else e.doneAt = null;
        if (!prev || !prev.live || sigOf(prev.task) !== sigOf(task)) changed = true;
        e.task = task;
        e.live = true;
        cache.set(task.id, e);
      }
      for (const [id, e] of cache) {
        if (seen.has(id)) continue;
        if (sourceKind === "tasks") {
          // Dismissed or trimmed by the pipeline. A restored entry gets a few
          // seconds: the pipeline may restore its own list after this mod.
          if (e.live || t - initAt > RESTORE_GRACE_MS) {
            cache.delete(id);
            changed = true;
          }
        } else if (e.live) {
          // Older jobs() API: finished jobs vanish after a few seconds; keep them.
          e.live = false;
          changed = true;
          if (!TERMINAL.has(e.task.status)) cache.delete(id); // the chat went away mid-run
        }
      }
    }
    for (const [id, e] of cache) {
      if (TERMINAL.has(e.task.status) && t - (e.doneAt || e.task.createdAt) > RESOLVED_MS) {
        cache.delete(id);
        changed = true;
      }
    }
    if (raw) booted = true;
    pruneEntries();
    if (changed) persistSoon();
    return changed;
  }

  // forName: undefined = every task; a name = only that canvas's tasks (a task
  // with no canvas name, or a view with no name, matches nothing).
  function view(forName) {
    const t = now();
    const all = [...cache.values()]
      .filter((e) => forName === undefined || (!!forName && nameKey(e.task.canvasName) === forName))
      // Restored entries wait for the pipeline (finished ones show only with the old jobs() API).
      .filter((e) => e.live || (sourceKind !== "tasks" && TERMINAL.has(e.task.status)))
      .sort((a, b) => RANK[a.task.status] - RANK[b.task.status] || a.task.createdAt - b.task.createdAt || a.n - b.n);
    const isResolved = (e) => TERMINAL.has(e.task.status) && t - (e.doneAt || 0) >= KEEP_MS;
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return {
      all,
      shown: all.filter((e) => showResolved || !isResolved(e)),
      hidden: all.filter(isResolved).length,
      open: all.filter((e) => !TERMINAL.has(e.task.status)).length,
      attn: all.filter((e) => e.task.status === "needs-input").length,
      doneToday: all.filter((e) => e.task.status === "done" && (e.doneAt || 0) >= midnight.getTime()).length,
    };
  }

  // ------------------------------------------------------------ formatting
  function fmtDur(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }
  function ago(ts) {
    if (!ts) return "";
    const s = Math.floor((now() - ts) / 1000);
    if (s < 45) return "just now";
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }
  const clip = (s, n) => {
    const one = String(s || "").replace(/\s+/g, " ").trim();
    return one.length > n ? one.slice(0, n - 1).trimEnd() + "…" : one;
  };
  function headTime(e) {
    const t = e.task;
    const tn = now();
    switch (t.status) {
      case "queued":
        return `Queued ${fmtDur(tn - t.createdAt)}`;
      case "running":
        return fmtDur(tn - (t.startedAt || t.createdAt));
      case "needs-input": {
        const asked = t.updates.filter((u) => u.kind === "text" && u.at).pop();
        return asked ? `Waiting ${fmtDur(tn - asked.at)}` : "Waiting for you";
      }
      case "done":
        return `in ${fmtDur((e.doneAt || tn) - (t.startedAt || t.createdAt))} · ${ago(e.doneAt)}`;
      case "failed":
        return `after ${fmtDur((e.doneAt || tn) - (t.startedAt || t.createdAt))} · ${ago(e.doneAt)}`;
      default:
        return "";
    }
  }
  const where = (t) => [t.canvasName, t.storyboardName].filter(Boolean).join(" › ");
  // The question the card shows: an explicit one, else the agent's last text.
  function questionOf(t) {
    if (t.status !== "needs-input") return null;
    if (t.question) return { text: t.question, update: null };
    const texts = t.updates.filter((u) => u.kind === "text");
    const last = texts[texts.length - 1];
    return last ? { text: last.text, update: last } : { text: null, update: null };
  }

  // -------------------------------------------------------------------- DOM
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function button(cls, label, html) {
    const b = el("button", cls);
    b.type = "button";
    if (label) b.setAttribute("aria-label", label);
    if (html) b.innerHTML = html; // constant markup only
    return b;
  }
  const isShown = (n) => !!n && n.isConnected && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== "hidden";
  const isEditable = (n) => n instanceof Element && !!n.closest(SEL.editable);

  let root = null;
  let countEl = null;
  let railEl = null;
  let footBtn = null;
  let tipEl = null;
  let tipTimer = 0;
  let tipFor = null;
  let tipAnchor = null; // the node the tooltip is shown for
  let tipCol = null; // its column
  let tipSide = false; // beside the agents list (a row's)
  let lastTipAt = 0;
  let bubbles = new Map(); // id -> { btn, av, badge, key }
  let showResolved = false;
  let hosted = false;
  let lastPos = "";
  let moreBtn = null; // "+N"
  let manageBtn = null; // "Manage agents"
  let bounds = null; // the canvas view's box {l, t, r, b}
  let expanded = false;
  let pillEl = null; // the pill the segment continues
  let viewEl = null; // the canvas view element: the segment's panel, tooltip and lightbox live in it
  let tipImgAt = 0; // the tooltip's live frame

  // One column per visible canvas view (a pane can show several canvases side by
  // side). The functions below work on the "current" column held in the vars
  // above; loadCol/saveCol swap a column in and out.
  const columns = new Map(); // canvas element -> column
  let panelCol = null; // column that owns the open panel
  const newCol = () => ({ root: null, countEl: null, railEl: null, footBtn: null, moreBtn: null, manageBtn: null, bubbles: new Map(), hosted: false, lastPos: "", bounds: null, expanded: false, pillEl: null, viewEl: null, ro: null, watched: [], canvas: null, name: "", seg: null });
  function loadCol(c) {
    ({ root, countEl, railEl, footBtn, moreBtn, manageBtn, bubbles, hosted, lastPos, bounds, expanded, pillEl, viewEl } = c);
  }
  function saveCol(c) {
    Object.assign(c, { root, countEl, railEl, footBtn, moreBtn, manageBtn, bubbles, hosted, lastPos, bounds, expanded, pillEl, viewEl });
  }
  const withCol = (c, fn) => {
    loadCol(c);
    try {
      return fn();
    } finally {
      saveCol(c);
    }
  };
  const nameKey = (s) =>
    String(s || "")
      .trim()
      .replace(/\s*[⌄˅▾▼]\s*$/, "")
      .replace(/\.canvas\.[jt]sx?$/, "")
      .toLowerCase();
  // This mod's own UI (the enlarged view included: covering the canvas with it
  // must not read as "the canvas went away" and close the panel).
  const isRtcbNode = (n) => !!(n && n.closest && n.closest("[data-rtcb-root], .rtcb-panel, .rtcb-pop, .rtcb-lb, .rtcb-tip, .rtcb-ag"));

  function ensureRoot() {
    if (root) return;
    root = el("div");
    const myRoot = root;
    const colOf = () => [...columns.values()].find((c) => c.root === myRoot);
    root.setAttribute("data-rtcb-root", "");
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "Comment requests");
    countEl = el("div", "rtcb-count");
    countEl.setAttribute("aria-live", "polite");
    railEl = el("div", "rtcb-rail");
    railEl.setAttribute("role", "toolbar");
    railEl.setAttribute("aria-orientation", "horizontal");
    railEl.setAttribute("aria-label", "Comment requests");
    railEl.addEventListener("scroll", hideTip, { passive: true });
    const fb = (footBtn = button("rtcb-foot"));
    fb.addEventListener("click", () => setShowResolved(!showResolved));
    fb.addEventListener("pointerenter", () => tipSoon(fb, null));
    fb.addEventListener("pointerleave", hideTip);
    const more = (moreBtn = button("rtcb-more"));
    more.addEventListener("click", (ev) => {
      ev.stopPropagation();
      hideTip();
      const col = colOf();
      if (col && col.hosted) return void (openInCard(col, null) || toggleHub(col, more)); // compact: "+N" opens the manager
      if (col) col.expanded = !col.expanded;
      render();
    });
    more.addEventListener("pointerenter", () => tipSoon(more, null));
    more.addEventListener("pointerleave", hideTip);
    more.addEventListener("focus", () => more.matches(":focus-visible") && showTip(more, null));
    more.addEventListener("blur", hideTip);
    // "Manage agents": the manager (every agent of this canvas)
    const mg = (manageBtn = button("rtcb-manage", "Manage agents", ICON.agents));
    mg.dataset.tip = "Manage agents";
    mg.setAttribute("aria-haspopup", "dialog");
    mg.setAttribute("aria-expanded", "false");
    mg.addEventListener("click", (ev) => {
      ev.stopPropagation();
      hideTip();
      const col = colOf();
      if (col && !openInCard(col, null)) toggleHub(col, mg);
    });
    mg.addEventListener("pointerenter", () => tipSoon(mg, null));
    mg.addEventListener("pointerleave", hideTip);
    mg.addEventListener("focus", () => mg.matches(":focus-visible") && showTip(mg, null));
    mg.addEventListener("blur", hideTip);
    root.append(countEl, railEl, mg);
    root.addEventListener("keydown", onRailKey);
    isolate(root);
    // compact (in a slot): its counter opens the manager too (role, tabindex
    // and aria set by renderCount while hosted)
    const fromCount = (ev) => {
      const col = colOf();
      if (!col || !col.hosted) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (!openInCard(col, null)) toggleHub(col, countEl);
    };
    countEl.addEventListener("click", fromCount);
    countEl.addEventListener("keydown", (ev) => (ev.key === "Enter" || ev.key === " ") && fromCount(ev));
    // compact, in a slot without a width of its own: the cluster spreads
    // while the pointer or the focus is in it
    const spreadTo = (on) => {
      clearTimeout(myRoot._spreadT);
      const col = colOf();
      if (!col || !col.hosted || myRoot.dataset.fit === "slot") return void (myRoot.dataset.spread && (delete myRoot.dataset.spread, render()));
      if (on) {
        if (myRoot.dataset.spread === "true") return;
        myRoot.dataset.spread = "true";
        render();
      } else
        myRoot._spreadT = setTimeout(() => {
          // the pointer back on it, or a keyboard focus in it: stays spread
          const ae = document.activeElement;
          if (myRoot.matches(":hover") || (ae && myRoot.contains(ae) && ae.matches(":focus-visible"))) return;
          delete myRoot.dataset.spread;
          render();
        }, SPREAD_OUT_MS);
    };
    root.addEventListener("pointerenter", () => spreadTo(true));
    root.addEventListener("pointerleave", () => spreadTo(false));
    root.addEventListener("focusin", () => spreadTo(true));
    root.addEventListener("focusout", (ev) => {
      if (!ev.relatedTarget || !myRoot.contains(ev.relatedTarget)) spreadTo(false);
    });
  }

  // The canvas view element: the pill's nearest clipping ancestor (the app's
  // "relative … overflow-clip" box of that canvas), else the canvas root.
  function viewOf(info) {
    for (let n = info.pill ? info.pill.parentElement : null; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (!/(clip|hidden)/.test(`${cs.overflowX} ${cs.overflowY}`)) continue;
      const b = n.getBoundingClientRect();
      if (b.width >= 200 && b.height >= 200) return n;
    }
    return info.c;
  }
  // This UI lives inside the canvas: the canvas must not pan, zoom, select or
  // place a comment when it is pressed or scrolled (bubble phase: the app's
  // listeners above it never see these events; keys are left alone).
  const ISOLATE = ["pointerdown", "mousedown", "touchstart", "wheel", "dblclick", "contextmenu"];
  function isolate(n) {
    const stop = (ev) => ev.stopPropagation();
    for (const t of ISOLATE) n.addEventListener(t, stop, t === "wheel" || t === "touchstart" ? { passive: true } : false);
  }
  // Where an overlay of this UI goes: the canvas view holding `node` (or the
  // open panel's), else the first visible one.
  function hostFor(node) {
    for (const c of columns.values()) if (c.viewEl && node && c.viewEl.contains(node)) return c.viewEl;
    if (panelCol && panelCol.viewEl && panelCol.viewEl.isConnected) return panelCol.viewEl;
    for (const c of columns.values()) if (c.viewEl && c.viewEl.isConnected) return c.viewEl;
    return null;
  }

  // The canvas view's box: the segment, the panel and the tooltips never leave
  // it (a canvas in a narrow pane keeps everything inside that pane).
  // pane-dock's viewRect(canvas) when it has one, else the pill's nearest
  // clipping ancestor (the canvas view), else the canvas root.
  function boundsOf(info) {
    viewEl = viewOf(info);
    let r = null;
    const pd = window.__RE_TEMPO_PANE_DOCK__;
    if (pd && typeof pd.viewRect === "function") {
      try {
        r = pd.viewRect(info.c);
      } catch (e) {
        note("viewRect", e);
      }
    }
    if (!r || !(r.width > 0) || !(r.height > 0)) r = viewEl.getBoundingClientRect();
    const v = viewEl.getBoundingClientRect();
    // never past the view element itself (everything is clipped by it)
    return { l: Math.max(0, r.left, v.left), t: Math.max(0, r.top, v.top), r: Math.min(innerWidth, r.right, v.right), b: Math.min(innerHeight, r.bottom, v.bottom) };
  }
  // The pill the segment continues: [data-rtcb-joined] squares its right
  // corners (CSS); one pill per column, released when the segment goes.
  function joinPill(p) {
    if (pillEl === p) return;
    if (pillEl && pillEl.isConnected) pillEl.removeAttribute("data-rtcb-joined");
    pillEl = p;
    if (p) p.setAttribute("data-rtcb-joined", "");
  }

  // ---------------------------------------------------------------- follow
  // Follow an agent: "rtcb:follow" {id} on window and, when the agent-follow
  // mod is there, window.__RE_TEMPO_AGENT_FOLLOW__.follow(id) (it pans and
  // zooms the canvas to the agent). unfollow(): "rtcb:unfollow" {id} and
  // its unfollow(id).
  let followId = null;
  function follow(id) {
    if (id == null) return unfollow();
    id = String(id);
    if (!cache.has(id)) return false;
    if (followId && followId !== id) unfollow();
    followId = id;
    try {
      window.dispatchEvent(new CustomEvent("rtcb:follow", { detail: { id } }));
    } catch (_) {}
    const f = window.__RE_TEMPO_AGENT_FOLLOW__;
    if (f && typeof f.follow === "function") {
      try {
        f.follow(id);
      } catch (e) {
        note("follow", e);
      }
    }
    render();
    if (openId) renderPanel(true);
    return true;
  }
  function unfollow() {
    if (!followId) return false;
    const id = followId;
    followId = null;
    try {
      window.dispatchEvent(new CustomEvent("rtcb:unfollow", { detail: { id } }));
    } catch (_) {}
    const f = window.__RE_TEMPO_AGENT_FOLLOW__;
    if (f && typeof f.unfollow === "function") {
      try {
        f.unfollow(id);
      } catch (e) {
        note("unfollow", e);
      }
    }
    if (!disposed) {
      render();
      if (openId) renderPanel(true);
    }
    return true;
  }


  // ----------------------------------------------------------- new agents
  // A new agent's avatar enters (see the header). entries: id -> { id, src
  // ("store" | "launch"), at, state: "wait" (its avatar not drawn yet) |
  // "play" | "done", pinUntil, overflow, tucked, input (the composer's
  // rect from rtcc:launch) }. "wait" ends after 4 s without an avatar.
  const entries = new Map();
  const entryLog = []; // the last ones, for state()
  const overlays = new Set(); // halos and ghosts on screen
  let booted = false; // the first store read is done: later tasks can be new
  function newEntry(id, src, input) {
    const en = { id, src, at: now(), state: "wait", pinUntil: 0, overflow: false, tucked: false, input: input || null, started: 0, ended: 0, rect: null, via: null };
    entries.set(id, en);
    return en;
  }
  function onLaunch(ev) {
    const d = ev && ev.detail;
    if (!d || d.taskId == null || disposed) return;
    const id = String(d.taskId);
    const input = d.rect && typeof d.rect === "object" ? { left: d.rect.left, top: d.rect.top, width: d.rect.width, height: d.rect.height } : null;
    const en = entries.get(id);
    if (en) {
      en.launch = true;
      if (input) en.input = input;
      return;
    }
    // its avatar already on screen for a while: no second entry
    for (const c of columns.values()) {
      const b = c.bubbles.get(id);
      if (b && b.btn.isConnected && now() - (b.bornAt || 0) > 200) return;
    }
    newEntry(id, "launch", input).launch = true;
    schedule();
  }
  function pruneEntries() {
    const t = now();
    for (const [id, en] of entries) {
      if (en.state === "wait" && t - en.at > 4000) entries.delete(id);
      else if (en.state === "done" && t > Math.max(en.pinUntil, en.ended) + 30000) entries.delete(id);
    }
  }
  const rectOf = (r) => r && { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  function playEntry(b, id, overflow) {
    const en = entries.get(id);
    if (!en || en.state !== "wait") return;
    startEntryOn(b.btn, en, overflow, b);
  }
  // The entry on `target`: the avatar, else "+N" / "Manage agents" (no room).
  function startEntryOn(target, en, overflow, b) {
    en.state = "play";
    en.started = now();
    en.overflow = !!overflow;
    en.pinUntil = b ? en.started + ENTRY_MS + (overflow ? HOLD_MS : 0) : 0;
    const seg = root;
    const rm = reducedMotion();
    const color = b ? b.btn.style.getPropertyValue("--rtcb-agent") : agentColor(en.id);
    let anim = null;
    if (b) {
      b.btn.classList.add("rtcb--born");
      if (overflow) b.btn.classList.add("rtcb--spot");
    }
    try {
      if (!b) pulse(target, color);
      else if (rm) anim = b.btn.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: "linear" });
      else {
        // the others make room first (FLIP), then it comes in: from a
        // blurred, bright 40% to 106%, then home; its glow behind the avatars
        anim = b.btn.animate(
          [
            { transform: "scale(0.4)", filter: "blur(6px) brightness(1.6)", opacity: 0, easing: EASE_OUT },
            { transform: "scale(1.06)", filter: "blur(0px) brightness(1.1)", opacity: 1, offset: 0.6, easing: EASE_IN_OUT },
            { transform: "scale(1)", filter: "blur(0px) brightness(1)", opacity: 1 },
          ],
          { duration: ENTRY_MS, delay: ENTRY_DELAY, fill: "backwards" },
        );
        burst(seg, b.btn, color);
        // "+N" took the one it replaced: a pulse
        const mb = moreBtn;
        if (overflow && mb && mb.isConnected) setTimeout(() => pulse(mb, color), 180);
      }
    } catch (e) {
      note("entry", e);
    }
    const finish = () => {
      if (en.state !== "play") return;
      en.state = "done";
      en.ended = now();
      if (b) b.btn.classList.remove("rtcb--born");
      const tgt = b && b.btn.isConnected && b.btn.getClientRects().length ? b.btn : target.isConnected && target.getClientRects().length ? target : null;
      en.via = !tgt ? null : tgt === (b && b.btn) ? "avatar" : tgt.classList.contains("rtcb-more") ? "more" : "manage";
      if (tgt) {
        const r = tgt.getBoundingClientRect();
        en.rect = rectOf(r);
        try {
          window.dispatchEvent(new CustomEvent("rtcb:avatar-in", { detail: { taskId: en.id, rect: r, via: en.via } }));
        } catch (e) {
          note("avatar-in", e);
        }
      }
      entryLog.push({ id: en.id, src: en.src, launch: !!en.launch, overflow: en.overflow, via: en.via, rect: en.rect, ms: en.ended - en.started, at: en.ended });
      if (entryLog.length > 30) entryLog.shift();
      if (en.overflow) planNext();
    };
    if (anim && anim.finished) anim.finished.then(finish, finish);
    // no animation (or it never settles: a hidden window), still once
    setTimeout(finish, (b ? (rm ? 120 : ENTRY_DELAY + ENTRY_MS) : 420) + (anim ? 2000 : 0));
  }
  // A glow and a ring in the agent's colour around `anchor`, behind the
  // avatars: the segment's first child (in a slot, nothing clips it), its
  // place kept on the anchor while it plays. Only in a slot: the pill's
  // segment clips its content.
  function burst(seg, anchor, color, small) {
    if (!seg || !seg.isConnected || !seg.classList.contains("rtcb--hosted") || typeof anchor.animate !== "function") return;
    const n = el("div", "rtcb-burst");
    n.setAttribute("aria-hidden", "true");
    n.style.setProperty("--rtcb-agent", color || "var(--rtcb-claude)");
    n.style.setProperty("--d", `${anchor.offsetWidth || 20}px`);
    const halo = el("span", "rtcb-burst-halo");
    const ring = el("span", "rtcb-burst-ring");
    n.append(halo, ring);
    seg.prepend(n);
    overlays.add(n);
    const place = () => {
      if (!anchor.isConnected || !n.isConnected) return false;
      const r = anchor.getBoundingClientRect();
      const sr = seg.getBoundingClientRect();
      n.style.transform = `translate(${(r.left + r.width / 2 - sr.left).toFixed(1)}px, ${(r.top + r.height / 2 - sr.top).toFixed(1)}px)`;
      return true;
    };
    place();
    const a1 = halo.animate(
      [
        { opacity: 0, transform: "scale(0.5)" },
        { opacity: small ? 0.6 : 1, transform: small ? "scale(0.8)" : "scale(1)", offset: 0.35 },
        { opacity: 0, transform: small ? "scale(1.1)" : "scale(1.5)" },
      ],
      { duration: BURST_MS - 140, delay: 140, easing: EASE_OUT, fill: "backwards" },
    );
    const a2 = ring.animate(
      small
        ? [
            { opacity: 0.8, transform: "scale(1)" },
            { opacity: 0, transform: "scale(1.6)" },
          ]
        : [
            { opacity: 0.95, transform: "scale(1)" },
            { opacity: 0.55, transform: "scale(1.8)", offset: 0.45 },
            { opacity: 0, transform: "scale(2.4)" },
          ],
      { duration: BURST_MS - 300, delay: 300, easing: EASE_OUT }, // hidden (CSS) until it starts
    );
    // while it plays (on the animations' clock, not the wall clock)
    const playing = () => a1.playState !== "finished" || a2.playState !== "finished";
    const gone = () => {
      n.remove();
      overlays.delete(n);
    };
    const loop = () => {
      if (!playing() || !place()) return;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    Promise.all([a1.finished, a2.finished]).then(gone, gone);
    setTimeout(gone, BURST_MS + 2000);
  }
  // "+N" (or the button) took an agent: one pulse with a small glow; soft:
  // a slight swell only (the held avatar tucking in)
  function pulse(n, color, soft) {
    if (!n || !n.isConnected || reducedMotion() || typeof n.animate !== "function") return;
    n.animate(
      [
        { transform: "scale(1)", filter: "brightness(1)" },
        { transform: soft ? "scale(1.08)" : "scale(1.14)", filter: soft ? "brightness(1.2)" : "brightness(1.45)", offset: 0.35 },
        { transform: "scale(1)", filter: "brightness(1)" },
      ],
      { duration: soft ? 300 : 420, easing: EASE_OUT, composite: "add" },
    );
    if (!soft) burst(n.closest("[data-rtcb-root]"), n, color, true);
  }
  // The avatar a new agent had past "+N" flies into it (a disc in its
  // colour, in the canvas view), then "+N" pulses.
  function tuck(tk, target) {
    const view = hostFor(target);
    if (!view) return;
    const vr = view.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    const f = tk.from;
    const g = el("div", "rtcb-ghost", tk.label);
    g.setAttribute("aria-hidden", "true");
    g.style.setProperty("--rtcb-agent", tk.color || "var(--rtcb-claude)");
    g.style.width = `${f.width}px`;
    g.style.height = `${f.height}px`;
    view.appendChild(g);
    overlays.add(g);
    const x0 = f.left - vr.left;
    const y0 = f.top - vr.top;
    const dx = tr.left + tr.width / 2 - (f.left + f.width / 2);
    const dy = tr.top + tr.height / 2 - (f.top + f.height / 2);
    const done = () => {
      g.remove();
      overlays.delete(g);
    };
    const a = g.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1, filter: "blur(0px)" },
        { transform: `translate(${x0 + dx}px, ${y0 + dy}px) scale(0.4)`, opacity: 0, filter: "blur(3px)" },
      ],
      { duration: 420, easing: EASE_IN_OUT, fill: "forwards" },
    );
    a.finished.then(done, done);
    setTimeout(done, 2400);
    setTimeout(() => pulse(target, tk.color, true), 320);
  }

  // An avatar that left the stack for good: a disc in its colour where it
  // was, shrinking and fading (220 ms).
  function fadeAway(fd, view) {
    if (!view || !view.isConnected) return;
    const vr = view.getBoundingClientRect();
    const f = fd.from;
    const g = el("div", "rtcb-ghost", fd.label);
    g.setAttribute("aria-hidden", "true");
    g.style.setProperty("--rtcb-agent", fd.color || "var(--rtcb-claude)");
    g.style.width = `${f.width}px`;
    g.style.height = `${f.height}px`;
    view.appendChild(g);
    overlays.add(g);
    const done = () => {
      g.remove();
      overlays.delete(g);
    };
    const at = `translate(${f.left - vr.left}px, ${f.top - vr.top}px)`;
    const a = g.animate(
      [
        { transform: `${at} scale(1)`, opacity: 1, filter: "blur(0px)" },
        { transform: `${at} scale(0.6)`, opacity: 0, filter: "blur(2px)" },
      ],
      { duration: 220, easing: EASE_OUT, fill: "forwards" },
    );
    a.finished.then(done, done);
    setTimeout(done, 1500);
  }

  // The rounded pill with the canvas name (+ chevron + panel button) that sits
  // in the top-left of canvas view `c`.
  function findPill(c) {
    const cr = c.getBoundingClientRect();
    for (const n of document.querySelectorAll(SEL.pill)) {
      if (!isShown(n) || isRtcbNode(n)) continue;
      const r = n.getBoundingClientRect();
      if (r.width < 40 || r.height < 24 || r.height > 140) continue;
      if (r.top - cr.top > 80 || r.top - cr.top < -12 || r.left - cr.left < -12 || r.left - cr.left > cr.width * 0.5) continue;
      return n;
    }
    return null;
  }
  // The canvas name a pill shows: its name span (the app's span.truncate,
  // canvas-chrome's .rcc-file-name), else its first span with text, else its
  // own text before "⌄" / "—"; never this mod's segment inside it.
  const ownNode = (n) => !!(n && n.closest && n.closest("[data-rtcb-root], [data-rtcb-host]"));
  function pillName(p) {
    const spans = [...p.querySelectorAll("span.truncate, .rcc-file-name")].concat([...p.querySelectorAll("span")]);
    const sp = spans.find((n) => !ownNode(n) && (n.textContent || "").trim());
    let s = sp ? sp.textContent : "";
    if (!sp) {
      const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      for (let t = w.nextNode(); t; t = w.nextNode()) if (!ownNode(t.parentElement)) s += t.textContent;
    }
    return nameKey(String(s).split(/[\u2304\u02c5\u25be\u25bc\u2014]/)[0]);
  }
  // A [data-rtcb-host] slot of canvas view `c`: in the nearest ancestor of
  // the canvas that holds one, never in an area that also holds another
  // canvas on screen (another pane's slot).
  const slotShown = (n) => n.isConnected && !n.closest("[hidden], [inert], [aria-hidden='true']") && getComputedStyle(n).display !== "none" && (n.closest(SEL.pill) || n.parentElement || n).getClientRects().length > 0;
  function findHost(c) {
    for (let n = c, d = 0; n && n !== document.body && d < 10; n = n.parentElement, d++) {
      if ([...n.querySelectorAll(SEL.content[0])].some((r) => r !== c && r.getClientRects().length > 0)) break;
      const h = [...n.querySelectorAll(SEL.host)].find((x) => !x.closest("[data-rtcb-root]") && slotShown(x));
      if (h) return h;
    }
    return null;
  }
  // The pill a slot sits in (its own box when it is not in one).
  const hostPill = (h) => (h && (h.closest(SEL.pill) || h.parentElement)) || null;

  // The canvas a view shows when no name pill is on screen (a compact
  // layout moves it into a panel): the selected canvas tab of its pane (its
  // path ".../canvases/<name>", else its label), else what the view showed.
  function tabName(c) {
    const pane = c.closest('[data-testid="split-panel-left"], [data-testid="split-panel-right"], [data-testid^="split-panel-"]') || document;
    const tab = pane.querySelector('[role="tab"][aria-selected="true"][data-testid^="canvas-tab-"]');
    if (!tab) return "";
    const m = /canvases\/([^/]+)\/?$/.exec(tab.dataset.testid || "");
    return nameKey(m ? m[1] : tab.textContent || "");
  }
  // Canvas views that are on screen and on top, each with the canvas it shows.
  function canvasInfos() {
    const out = [];
    for (const c of document.querySelectorAll(SEL.content[0])) {
      if (!canvasVisible(c)) continue;
      const host = findHost(c);
      // the name: the canvas pill (the slot's own when it sits in one); a
      // slot in a chip row names nothing; no pill: the tab, then the last one
      const pill = (host && host.closest(SEL.pill)) || findPill(c);
      let name = pill ? pillName(pill) : "";
      if (!name) name = tabName(c) || (columns.get(c) && columns.get(c).name) || "";
      out.push({ c, pill, host, name });
    }
    return out;
  }

  function mount(info) {
    bounds = boundsOf(info);
    const host = info.host && info.host.isConnected ? info.host : null;
    if (host) {
      // another mod's slot (its pill): inside it, no surface of its own
      if (root.parentNode !== host) host.appendChild(root);
      hosted = true;
      if (root.className !== "rtcb-segment rtcb--hosted") root.className = "rtcb-segment rtcb--hosted";
      if (root.getAttribute("aria-label") !== "Agents") (root.setAttribute("aria-label", "Agents"), railEl.setAttribute("aria-label", "Agents"));
      joinPill(null);
      // a pill that draws its surface with children says its colour
      // (--rtcb-slot-bg; canvas-chrome's agents pill), else the first
      // painted background up from it
      const hp0 = hostPill(host);
      const said = hp0 ? getComputedStyle(hp0).getPropertyValue("--rtcb-slot-bg").trim() : "";
      let bg = said;
      for (let n = hp0; n && n !== document.body && !bg; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && c !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(c)) bg = c;
      }
      if (bg && root.style.getPropertyValue("--rtcb-seg-bg") !== bg) root.style.setProperty("--rtcb-seg-bg", bg);
      // a divider when the slot continues something (a transparent slot after
      // a name, a chip…); a slot with its own surface is a chip of its own
      const sb = getComputedStyle(host).backgroundColor;
      const own = !!sb && sb !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(sb);
      let lead = false;
      for (let n = host.previousSibling; n && !lead && !own; n = n.previousSibling) lead = n.nodeType === 3 ? !!n.textContent.trim() : n.nodeType === 1 && n.getClientRects().length > 0;
      const ld = lead ? "true" : "false";
      if (root.dataset.lead !== ld) root.dataset.lead = ld;
      // "Manage agents" concentric with the pill that holds the slot (its own
      // surface, at most 64 px tall): the same inset on every side (the
      // pill's padding and border), its radius the pill's less that inset
      const pe = hostPill(host);
      let mg = "";
      let mr = "";
      if (pe && pe !== host) {
        const pc = getComputedStyle(pe);
        const pb = said || pc.backgroundColor;
        const ph = pe.getBoundingClientRect().height;
        if (pb && pb !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(pb) && ph > 0 && ph <= 64) {
          const inset = (parseFloat(pc.paddingLeft) || 0) + (parseFloat(pc.borderLeftWidth) || 0);
          const size = Math.round(Math.max(22, Math.min(40, ph - 2 * inset)));
          mg = `${size}px`;
          mr = `${Math.max(4, Math.round((parseFloat(pc.borderTopLeftRadius) || 0) - inset))}px`;
        }
      }
      if (root.style.getPropertyValue("--rtcb-mg") !== mg) (mg ? root.style.setProperty("--rtcb-mg", mg) : root.style.removeProperty("--rtcb-mg"));
      if (root.style.getPropertyValue("--rtcb-mg-r") !== mr) (mr ? root.style.setProperty("--rtcb-mg-r", mr) : root.style.removeProperty("--rtcb-mg-r"));
      return true;
    }
    hosted = false;
    delete root.dataset.lead;
    if (root.getAttribute("aria-label") !== "Comment requests") (root.setAttribute("aria-label", "Comment requests"), railEl.setAttribute("aria-label", "Comment requests"));
    const pill = info.pill;
    // canvas-chrome's floating file pill without a slot: the segment can't
    // continue it (its own absolute box would land under it)
    const floating = !!pill && pill.matches("[data-rcc-file]");
    if (!pill || !pill.parentNode || floating) {
      // no pill, or that floating pill: nothing (no floating fallback)
      // no pill, nothing (no floating fallback)
      if (root.isConnected) root.remove();
      joinPill(null);
      return false;
    }
    // The pill's immediate next sibling, in the pill's own container, with the
    // pill's own classes: a native part of the canvas chrome (React re-creating
    // the row puts it back on the next body mutation).
    if (root.parentNode !== pill.parentNode || root.previousElementSibling !== pill) pill.after(root);
    const cls = `${pill.className} rtcb-segment`;
    if (root.className !== cls) root.className = cls;
    joinPill(pill);
    const bg = getComputedStyle(pill).backgroundColor;
    if (root.style.getPropertyValue("--rtcb-seg-bg") !== bg) root.style.setProperty("--rtcb-seg-bg", bg);
    return true;
  }

  // "3 open · 2 done today"; an amber dot before "open" while any request
  // waits for the designer.
  function renderCount(v) {
    const parts = [];
    if (hosted) {
      // compact: one short count, the most urgent first
      const n = (st) => v.all.filter((e) => e.task.status === st).length;
      const run = n("running");
      const q = n("queued");
      const bad = n("failed");
      const txt = v.attn ? `${v.attn} waiting` : run ? `${run} running` : q ? `${q} queued` : v.doneToday ? `${v.doneToday} done` : bad ? `${bad} failed` : "";
      if (txt) parts.push(["rtcb-n-short", txt]);
    } else {
      if (v.open) parts.push(["rtcb-n-open", `${v.open} open`]);
      if (v.doneToday) parts.push(["rtcb-n-done", `${v.doneToday} done today`]);
    }
    const key = JSON.stringify([parts, v.attn]);
    if (countEl.dataset.key === key) return;
    countEl.dataset.key = key;
    countEl.textContent = "";
    countEl.dataset.attn = v.attn ? "true" : "false";
    parts.forEach(([cls, text], i) => {
      if (i) countEl.append(el("span", "rtcb-sep", "·"));
      countEl.append(el("span", cls, text));
    });
    countEl.title = v.attn ? `${v.attn} request${v.attn === 1 ? "" : "s"} need${v.attn === 1 ? "s" : ""} your input` : hosted ? "Manage agents" : "";
    // compact: the counter opens the list
    if (hosted) {
      countEl.setAttribute("role", "button");
      countEl.tabIndex = 0;
      countEl.setAttribute("aria-haspopup", "dialog");
      if (!countEl.hasAttribute("aria-expanded")) countEl.setAttribute("aria-expanded", "false");
    } else if (countEl.hasAttribute("role")) {
      for (const a of ["role", "tabindex", "aria-haspopup", "aria-expanded"]) countEl.removeAttribute(a);
    }
    countEl.hidden = !parts.length;
  }

  function makeBubble(id) {
    const btn = button("rtcb-bubble");
    btn.dataset.id = id;
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    const ring = el("span", "rtcb-ring");
    const av = el("span", "rtcb-av");
    const badge = el("span", "rtcb-badge");
    btn.append(ring, av, badge);
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (ev.altKey) {
        // ⌥-click: follow this agent (or stop)
        hideTip();
        if (followId === id) unfollow();
        else follow(id);
        return;
      }
      // its panel in the canvas: in a slot (the composer's agents pill),
      // with canvas-chrome's card open, its thread in the card (the
      // sidebar's own experience, "‹ Agents" back to the list); the card
      // closed, the small popover over the avatar, where its tooltip was
      // (and nothing else opens). A click on the canvas UI never opens a
      // chat nor leaves the canvas.
      const col = [...columns.values()].find((c) => c.bubbles.get(id) && c.bubbles.get(id).btn === btn);
      const inCard = !!(col && col.hosted && cardOpen(col));
      if (openId === id && !(panel && panel.dataset.inline === "true")) closePanel(false);
      else if (inCard) openPanel(id);
      else openPanel(id, col && col.hosted ? { popover: true } : undefined);
    });
    btn.addEventListener("pointerenter", () => tipSoon(btn, id));
    btn.addEventListener("pointerleave", tipOut);
    btn.addEventListener("focus", () => btn.matches(":focus-visible") && showTip(btn, id));
    btn.addEventListener("blur", () => tipHover || hideTip());
    btn.addEventListener("animationend", (ev) => {
      if (ev.animationName === "rtcb-check-pop") btn.classList.remove("rtcb--celebrate");
      if (ev.animationName === "rtcb-fade") btn.classList.remove("rtcb--enter");
    });
    return { btn, av, badge, key: "" };
  }

  const BADGE = { running: () => claudeSvg(8), "needs-input": () => ICON.ask, done: () => ICON.check, failed: () => ICON.bang };

  function updateBubble(b, e) {
    const t = e.task;
    const tn = now();
    const fresh = t.status === "done" && tn - (e.doneAt || 0) < CHECK_MS;
    const faded = t.status === "done" && !fresh;
    const celebrate = e.celebrateUntil > tn;
    const open = openId === t.id;
    const followed = followId === t.id;
    // the agent's colour (its cursor's); in a slot its number, else the author's initials
    const color = agentColor(t.id);
    const stopped = stoppedOf(t);
    const key = JSON.stringify([t.status, stopped, fresh, faded, celebrate, t.author, t.text, open, e.n, followed, hosted, color]);
    if (b.key === key) return;
    const statusChanged = b.btn.dataset.status !== t.status;
    b.key = key;
    b.btn.dataset.status = t.status;
    b.btn.dataset.stopped = stopped ? "true" : "false";
    b.btn.dataset.n = String(e.n);
    b.btn.dataset.follow = followed ? "true" : "false";
    b.btn.classList.toggle("rtcb--fresh", fresh);
    b.btn.classList.toggle("rtcb--faded", faded);
    if (celebrate && statusChanged) b.btn.classList.add("rtcb--celebrate"); // removed on animationend
    else if (!celebrate) b.btn.classList.remove("rtcb--celebrate");
    b.btn.style.setProperty("--rtcb-av", color);
    b.btn.style.setProperty("--rtcb-agent", color);
    b.av.textContent = hosted ? String(e.n) : t.author.initials;
    b.av.dataset.len = String(b.av.textContent.length);
    if (statusChanged) b.badge.innerHTML = BADGE[t.status] ? BADGE[t.status]() : "";
    b.btn.setAttribute("aria-label", hosted ? `Agent #${e.n}: ${clip(t.text, 90)}. ${LABEL[t.status]}${followed ? ". Following" : ""}` : `Request #${e.n}, ${t.author.name}: ${clip(t.text, 90)}. ${LABEL[t.status]}${followed ? ". Following" : ""}`);
    b.btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function renderFoot(v) {
    const show = !hosted && (v.hidden > 0 || showResolved); // compact: the manager lists them
    if (!show) {
      footBtn.remove();
      return;
    }
    footBtn.innerHTML = showResolved ? ICON.hide : ICON.history;
    footBtn.dataset.on = showResolved ? "true" : "false";
    footBtn.dataset.tip = showResolved ? "Hide resolved" : `Show resolved (${v.hidden})`;
    footBtn.setAttribute("aria-label", footBtn.dataset.tip);
    footBtn.setAttribute("aria-pressed", showResolved ? "true" : "false");
    if (railEl.lastChild !== footBtn) railEl.appendChild(footBtn);
  }

  // True when canvas view `c` is connected, laid out and not hidden (display,
  // visibility, opacity, [hidden]/[inert]/aria-hidden on it or an ancestor)
  // and on screen. Never a hit test: the canvas's own layers (comment mode,
  // tool overlays, cursors, pins) sit over it and must not hide the bubbles.
  function canvasVisible(c) {
    if (!c.isConnected || c.closest('[hidden], [aria-hidden="true"], [inert]') || !c.getClientRects().length) return false;
    const r = c.getBoundingClientRect();
    if (r.width < 200 || r.height < 200 || r.bottom <= 0 || r.right <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
    for (let n = c; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    }
    return true;
  }


  function render() {
    if (disposed) return;
    if (!enabled()) return teardown();
    document.documentElement.classList.add(ROOT_CLASS);
    // A feature OF the canvas: one column per visible canvas view, with only
    // that canvas's tasks. Nothing exists when no canvas view is visible and on
    // top (other tabs and routes: chat, terminal, docs, browser).
    const seen = new Set();
    for (const info of canvasInfos()) {
      let col = columns.get(info.c);
      if (!col) columns.set(info.c, (col = newCol()));
      col.canvas = info.c;
      col.name = info.name;
      seen.add(info.c);
      withCol(col, () => renderColumn(view(info.name), info));
    }
    for (const [c, col] of columns) {
      if (seen.has(c)) continue;
      if (col.root && col.root.isConnected) col.root.remove();
      for (const b of col.bubbles.values()) b.btn.remove();
      if (col.pillEl && col.pillEl.isConnected) col.pillEl.removeAttribute("data-rtcb-joined");
      columns.delete(c);
      if (panelCol === col) panelCol = null;
    }
    if (!columns.size) hideTip();
    if (followId && !cache.has(followId)) unfollow();
    // a running agent's preview follows its frames while the tooltip is up
    if (tipFor && tipEl && tipEl.dataset.rich === "true") {
      const te = cache.get(tipFor);
      const lf = te && te.task.status === "running" && te.task.lastFrame;
      const im = tipEl.querySelector(".rtcb-tip-img");
      if (lf && im && lf.at !== tipImgAt) (im.src = lf.dataUrl), (tipImgAt = lf.at);
    }
    syncCards();
    const inlinePanel = !!(panel && panel.dataset.inline === "true");
    if (openId && (!cache.has(openId) || (inlinePanel ? !(hub && hub.inline && hub.el.isConnected) : !panelCol || !panelCol.root || !panelCol.root.isConnected || !panelCol.bubbles.has(openId)))) {
      closePanel(false);
      if (panel && panel.isConnected && !inlinePanel) panel.remove();
    } else if (openId) {
      renderPanel(false);
      placePanel();
    }
    if (hub) {
      // kept while its canvas view is (its segment may be gone: the empty state)
      if (![...columns.values()].includes(hub.col) || !hub.col.viewEl || !hub.col.viewEl.isConnected) closeHub(false, true);
      else {
        renderHub("data");
        placeHub();
      }
    }
    planNext();
  }

  // Hosted: the slot's pill may cap its width (canvas-chrome's file pill has
  // a max-width) or squeeze the canvas name: fit again within what is left.
  const NAME_KEEP = 96;
  function renderColumn(v, info) {
    renderColumnOnce(v, info, Infinity);
    // a slot that gives its own width (data-rcc-max-w): that is the room;
    // its pill follows the segment (measuring the pill would feed back)
    if (!hosted || !root || !root.isConnected || root.hidden || root.dataset.fit === "slot") return;
    const hp = hostPill(root.parentElement);
    if (!hp) return;
    const nm = [...hp.querySelectorAll("span.truncate, .rcc-file-name")].find((n) => !ownNode(n));
    const nameShort = nm ? Math.max(0, Math.min(nm.scrollWidth, NAME_KEEP) - nm.clientWidth) : 0;
    // the segment's own negative margins (its hover area) are not an overflow
    const cs = getComputedStyle(root);
    const spill = Math.max(0, -parseFloat(cs.marginLeft) || 0) + Math.max(0, -parseFloat(cs.marginRight) || 0);
    const over = Math.max(0, hp.scrollWidth - hp.clientWidth - spill) + nameShort;
    if (over > 1) renderColumnOnce(v, info, root.getBoundingClientRect().width - over);
  }
  // A slot's own width for this segment: its data-rcc-max-w or its
  // --rcc-agents-max (px, the slot's box; the smaller of the two) less the
  // slot's own padding and border, else NaN.
  function slotMax(host) {
    if (!host || host.nodeType !== 1) return NaN;
    let w = parseFloat(host.getAttribute("data-rcc-max-w"));
    if (!(w >= 0)) w = NaN;
    const cs = getComputedStyle(host);
    const v = parseFloat(cs.getPropertyValue("--rcc-agents-max"));
    if (v >= 0) w = Number.isFinite(w) ? Math.min(w, v) : v;
    if (!Number.isFinite(w)) return NaN;
    const px = (k) => parseFloat(cs[k]) || 0;
    return Math.max(0, w - px("paddingLeft") - px("paddingRight") - px("borderLeftWidth") - px("borderRightWidth"));
  }
  // In a slot: the ones that need an answer, then the working ones (queued
  // too), then the most recent first.
  const PRIO = { "needs-input": 0, running: 1, queued: 1 };
  const byPriority = (a, b) => (PRIO[a.task.status] ?? 2) - (PRIO[b.task.status] ?? 2) || b.task.createdAt - a.task.createdAt || b.n - a.n;
  function renderColumnOnce(v, info, cap) {
    // a slot with a width of its own (canvas-chrome's agents pill) always
    // holds the segment: with no agent it is "Manage agents" alone
    const always = !!(info.host && info.host.isConnected && info.host.hasAttribute("data-rcc-max-w"));
    if (!v.shown.length && !v.hidden && !always) {
      if (root && root.isConnected) root.remove();
      joinPill(null);
      return;
    }
    ensureRoot();
    const wasIn = root.isConnected && !root.hidden;
    if (!mount(info)) return;
    renderCount(v);

    // Room right of the pill: up to the next item on the same line (the app's
    // zoom / Share) or the row's end, never past the canvas view.
    let maxW = Infinity;
    let slotW = NaN;
    const pill = info.pill;
    if (pill && !hosted) {
      const pr = pill.getBoundingClientRect();
      const row = pill.parentElement;
      const rr = row.getBoundingClientRect();
      let right = Math.min(rr.right - (parseFloat(getComputedStyle(row).paddingRight) || 0), bounds.r - EDGE_IN);
      for (const sib of row.children) {
        if (sib === pill || sib === root || !sib.getClientRects().length) continue;
        const r = sib.getBoundingClientRect();
        if (r.left >= pr.right - 1 && r.top < pr.bottom && r.bottom > pr.top) right = Math.min(right, r.left - 8);
      }
      maxW = right - pr.right;
    } else if (hosted) {
      // inside the slot: up to the controls on the same line right of its
      // pill (Share, zoom) or the view's edge, minus the pill's own padding;
      // never wider than the slot's own width for it
      const hp = hostPill(root.parentElement) || root.parentElement;
      const pr = hp.getBoundingClientRect();
      const sr = root.getBoundingClientRect();
      let right = bounds.r - EDGE_IN;
      for (const tb of (viewEl || hp.parentElement).querySelectorAll('[role="toolbar"], [data-testid="canvas-share-button"]')) {
        if (tb === hp || hp.contains(tb) || tb.contains(hp) || isRtcbNode(tb) || !tb.getClientRects().length) continue;
        const r = tb.getBoundingClientRect();
        if (r.left >= pr.right - 1 && r.top < pr.bottom && r.bottom > pr.top) right = Math.min(right, r.left - 8);
      }
      maxW = Math.min(cap, right - sr.left - Math.max(0, pr.right - sr.right));
      slotW = slotMax(root.parentElement);
      if (Number.isFinite(slotW)) maxW = Math.min(maxW, slotW);
    }
    const fit = hosted && Number.isFinite(slotW) ? "slot" : "auto";
    if (root.dataset.fit !== fit) root.dataset.fit = fit;
    if (fit === "slot" && root.dataset.spread) delete root.dataset.spread;
    // How many bubbles fit. On the pill: 28 px, each next one 6 px under the
    // previous, at most 5 and "+N"; the counter goes first when it would
    // cost a bubble; no room at all: nothing. In a slot: a stack of 24 px
    // avatars, each next one 6 px under the previous, "+N" a 24 px disc at its
    // end (up to "+99"), then "Manage agents"; as many as fit together with
    // "+N" (K), so a longer list never shows fewer avatars than a shorter one
    // (K and fewer: all of them, no "+N"); the counter only when it costs
    // nothing; too tight for one avatar: "+N" and the button, then the
    // button alone.
    const total = v.shown.length;
    const footW = !hosted && (v.hidden > 0 || showResolved) ? 30 : 0;
    const spread = hosted && root.dataset.spread === "true";
    const maxN = hosted ? (spread ? SPREAD_MAX : fit === "slot" ? FIT_MAX : FIT_FALLBACK) : MAX_SHOWN;
    const exp = expanded && !hosted;
    // avatar size: 28 (each next one 6 px under), 24 in a slot (6 px under,
    // or 6 px apart spread)
    const BW = hosted ? SLOT_AV : 28;
    const STEP = spread ? BW + 6 : BW - 6;
    const fits = (w) => (w < BW ? 0 : Math.floor((w - BW) / STEP) + 1);
    const GAPW = hosted ? 6 : 10; // the segment's gap
    // "Manage agents": in a slot, first (its size the pill's, see mount())
    const MGW = (hosted ? manageBtn.offsetWidth || parseFloat(root.style.getPropertyValue("--rtcb-mg")) || 22 : 24) + GAPW;
    let avail = maxW - (hosted ? 0 : SEG_PAD + 12) - footW - MGW;
    let showManage = true;
    if (!hosted && fits(avail) < 1) (avail += MGW), (showManage = false);
    root.dataset.compact = "false";
    // in a slot the button alone needs no gap after it: hidden only when
    // even it does not fit
    root.hidden = hosted ? !(avail + GAPW >= 0) : fits(avail) < 1;
    if (root.hidden) return;
    let shownN;
    let noMore = false; // no "+N" (pill: room for one item only, the first bubble)
    if (hosted && !spread) {
      // K: avatars that fit with the "+N" disc (STEP more after the last one)
      const k = Math.min(maxN, fits(avail - STEP));
      shownN = total <= k ? total : k;
      if (shownN < total && !shownN && avail < BW) noMore = true; // the button alone
      root.dataset.k = String(k);
      // the counter (when the slot shows it) only in the room left
      if (!countEl.hidden) {
        const w0 = countEl.getBoundingClientRect().width;
        const used = shownN ? BW + STEP * (shownN - 1) + (shownN < total ? STEP : 0) : shownN < total ? BW : 0;
        if (w0 > 0 && used + w0 + GAPW > avail) root.dataset.compact = "true";
      }
    } else {
      const MOREW = hosted ? SLOT_AV + 6 : 30; // "+N" (spread: a chip 6 px after the last bubble; pill: 6 px under it)
      if (!countEl.hidden) {
        // the slot's own CSS may hide it (0 wide): then it costs nothing
        const w0 = countEl.getBoundingClientRect().width;
        const cw = w0 > 0 ? w0 + GAPW : 0;
        if (fits(avail - cw) >= Math.min(total, hosted ? maxN : 2)) avail -= cw;
        else root.dataset.compact = "true";
      }
      shownN = exp ? total : Math.min(total, maxN, fits(avail));
      if (shownN < total && !exp) {
        const withMore = fits(avail - MOREW);
        if (hosted) shownN = Math.min(shownN, withMore); // 0: "+N" and the button
        else if (withMore < 1) (shownN = 1), (noMore = true);
        else shownN = Math.min(shownN, withMore);
      }
      if (hosted && !shownN && avail < MOREW - 6) noMore = true; // the button alone
      delete root.dataset.k;
    }
    root.style.maxWidth = Number.isFinite(maxW) ? `${Math.max(0, Math.floor(maxW))}px` : "";
    const ordered = hosted ? [...v.shown].sort(byPriority) : v.shown;
    const list = ordered.slice(0, shownN);
    const natural = new Set(list.map((e) => e.task.id));
    const rest = noMore ? 0 : total - shownN;
    // Kept in view past "+N": the open request (its panel hangs from its
    // bubble) and a new agent while it enters (HOLD_MS more when it landed
    // there), each in the last place that is not kept itself.
    const t0 = now();
    const pins = [panel && panel.dataset.inline === "true" ? null : openId];
    for (const en of entries.values()) if (en.state === "wait" || en.pinUntil > t0) pins.push(en.id);
    for (const id of pins) {
      if (!id || !list.length || natural.has(id) || list.some((e) => e.task.id === id)) continue;
      const pe = ordered.find((e) => e.task.id === id);
      if (!pe) continue;
      for (let k = list.length - 1; k >= 0; k--) {
        if (pins.includes(list[k].task.id)) continue;
        list[k] = pe;
        break;
      }
    }
    // shown left to right: the ones waiting for an answer, then the others
    // from the oldest to the newest (a new agent appears at the end, next
    // to "+N" and the button, where the composer's launch lands)
    if (hosted) list.sort((a, b) => (a.task.status === "needs-input" ? 0 : 1) - (b.task.status === "needs-input" ? 0 : 1) || a.task.createdAt - b.task.createdAt || a.n - b.n);

    // Changes (a new agent, needs-input jumping to the front, one leaving):
    // measure first (centres: a bubble may be scaling), slide after (FLIP).
    const desired = list.map((e) => e.task.id);
    const inDom = [...railEl.children].filter((n) => n.classList.contains("rtcb-bubble")).map((n) => n.dataset.id);
    const moreTxt = rest > 0 || (exp && total > maxN) ? (exp && rest === 0 ? "−" : hosted && rest > 99 ? "99+" : `+${rest}`) : "";
    const changed = desired.join("\n") !== inDom.join("\n") || (moreBtn.isConnected ? moreBtn.textContent : "") !== moreTxt;
    const cx = (n) => {
      const r = n.getBoundingClientRect();
      return r.left + r.width / 2;
    };
    const spreadFlip = root._spreadWas !== spread;
    root._spreadWas = spread;
    const before = changed && wasIn && !spreadFlip && !reducedMotion() ? new Map([...railEl.children, manageBtn].filter((n) => n.isConnected && n.getClientRects().length).map((n) => [n, cx(n)])) : null;
    const tucks = [];

    const keep = new Set();
    const born = [];
    let prev = null;
    list.forEach((e, i) => {
      const id = e.task.id;
      keep.add(id);
      let b = bubbles.get(id);
      if (!b) {
        bubbles.set(id, (b = makeBubble(id)));
        b.bornAt = t0;
        if (spread && !entries.has(id)) b.btn.classList.add("rtcb--enter");
      }
      updateBubble(b, e);
      const z = String(MAX_Z - i); // the first one (needs-input) on top
      if (b.btn.style.zIndex !== z) b.btn.style.zIndex = z;
      const want = prev ? prev.nextSibling : railEl.firstChild;
      if (want !== b.btn) railEl.insertBefore(b.btn, want);
      prev = b.btn;
      const en = entries.get(id);
      if (en && en.state === "wait") born.push([b, id, !natural.has(id)]);
      b.btn.classList.toggle("rtcb--spot", !!(en && en.overflow && en.pinUntil > t0));
    });
    const fades = [];
    for (const [id, b] of bubbles) {
      if (keep.has(id)) continue;
      // An avatar that leaves the stack: into "+N" when its agent is still
      // listed (a new one's hold over, or room for a newer one), else a
      // short fade where it was (dismissed, gone). Never just vanishing.
      const en = entries.get(id);
      if (b.btn.isConnected && wasIn && !spreadFlip && !reducedMotion()) {
        const g = { from: b.av.getBoundingClientRect(), color: b.btn.style.getPropertyValue("--rtcb-agent"), label: b.av.textContent };
        if (rest > 0 && v.shown.some((e) => e.task.id === id) && !(en && en.tucked)) {
          if (en) en.tucked = true;
          tucks.push(g);
        } else fades.push(g);
      }
      b.btn.remove();
      bubbles.delete(id);
      if (tipFor === id) hideTip();
    }
    if (moreTxt) {
      if (moreBtn.textContent !== moreTxt) (moreBtn.textContent = moreTxt), (moreBtn.dataset.len = String(moreTxt.length));
      moreBtn.dataset.tip = exp && rest === 0 ? "Show fewer" : hosted ? `${rest} more agent${rest === 1 ? "" : "s"} · Manage agents` : `${rest} more request${rest === 1 ? "" : "s"}`;
      moreBtn.setAttribute("aria-label", moreBtn.dataset.tip);
      if (hosted) moreBtn.setAttribute("aria-haspopup", "dialog");
      else moreBtn.removeAttribute("aria-haspopup");
      moreBtn.setAttribute("aria-expanded", hosted ? String(!!(hub && hub.col && hub.col.root === root)) : exp ? "true" : "false");
      const want = prev ? prev.nextSibling : railEl.firstChild;
      if (want !== moreBtn) railEl.insertBefore(moreBtn, want);
    } else moreBtn.remove();
    renderFoot(v);
    if (showManage) {
      const n = v.all.length;
      const label = `Manage agents (${n})`;
      if (manageBtn.getAttribute("aria-label") !== label) manageBtn.setAttribute("aria-label", label);
      // in a slot: [button][avatars][+N]; on the pill: [counter][avatars][button]
      if (hosted ? manageBtn.nextElementSibling !== countEl : root.lastElementChild !== manageBtn) {
        if (hosted) root.insertBefore(manageBtn, countEl);
        else root.appendChild(manageBtn);
      }
      if (!wasIn && hosted && !reducedMotion() && typeof manageBtn.animate === "function")
        manageBtn.animate([{ opacity: 0, transform: "scale(0.85)" }, { opacity: 1, transform: "scale(1)" }], { duration: 220, delay: 120, easing: EASE_OUT, fill: "backwards" });
    } else manageBtn.remove();
    railEl.dataset.empty = list.length ? "false" : "true";
    if (before) {
      for (const [n, x0] of before) {
        if (!n.isConnected || typeof n.animate !== "function") continue;
        if (n._flip) n._flip.cancel();
        n._flip = null;
        const d = x0 - cx(n);
        if (Math.abs(d) > 0.5) n._flip = n.animate([{ transform: `translateX(${d}px)` }, { transform: "translateX(0)" }], { duration: FLIP_MS, easing: EASE_IN_OUT, composite: "add" });
      }
    }
    for (const [b, id, over] of born) playEntry(b, id, over);
    // a new agent with no room at all (only "+N" or the button): they pulse
    for (const en of entries.values()) {
      if (en.state !== "wait" || keep.has(en.id) || !v.shown.some((e) => e.task.id === en.id)) continue;
      const tgt = moreBtn.isConnected ? moreBtn : manageBtn.isConnected ? manageBtn : null;
      if (tgt) startEntryOn(tgt, en);
    }
    if (tucks.length) {
      const tgt = moreBtn.isConnected ? moreBtn : manageBtn.isConnected ? manageBtn : null;
      for (const tk of tucks) if (tgt) tuck(tk, tgt);
    }
    for (const fd of fades) fadeAway(fd, viewEl);
  }

  function setShowResolved(on) {
    showResolved = !!on;
    hideTip();
    render();
  }

  function onRailKey(ev) {
    const fwd = ev.key === "ArrowRight" || ev.key === "ArrowDown";
    if (!fwd && ev.key !== "ArrowLeft" && ev.key !== "ArrowUp") return;
    const items = [...ev.currentTarget.querySelectorAll(".rtcb-bubble, .rtcb-more, .rtcb-foot, .rtcb-manage")].filter((n) => !n.hidden);
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    ev.preventDefault();
    const next = items[Math.max(0, Math.min(items.length - 1, i + (fwd ? 1 : -1)))];
    if (next) next.focus();
  }

  // --------------------------------------------------------------- tooltip
  // Bubble tooltips sit where the panel opens: none while a panel is open.
  // (an avatar's tooltip waits while a popover is open, its panel or the
  // manager's; the card's list and thread, always there, do not count)
  const popoverOpen = () => !!((openId && !(panel && panel.dataset.inline === "true")) || (hub && !hub.inline));
  function tipSoon(anchor, id) {
    clearTimeout(tipTimer);
    if (popoverOpen() && id) return;
    if (hub && !hub.inline && hub.col.root && hub.col.root.contains(anchor)) return; // its own buttons: the manager is open
    const quick = now() - lastTipAt < 600;
    tipTimer = setTimeout(() => showTip(anchor, id), quick ? 0 : TIP_DELAY);
  }
  // side: a row of the agents list (the card's, or the manager's): the
  // agent's card floats beside the list, its top on the row (rowTipSoon)
  function showTip(anchor, id, side) {
    clearTimeout(tipTimer);
    if (!anchor.isConnected || (id && !side && popoverOpen())) return;
    const col = side ? hub && hub.col : [...columns.values()].find((c) => c.root && c.root.contains(anchor));
    if (!col || !col.viewEl) return;
    if (!tipEl) {
      tipEl = el("div", "rtcb-tip");
      tipEl.setAttribute("role", "tooltip");
      tipEl.id = "rtcb-tip";
      // a card with a picture takes the pointer (compare, enlarge): it stays
      // while hovered, beside the list (rowTipOut) or over an avatar (tipOut)
      tipEl.addEventListener("pointerenter", () => {
        tipHover = true;
        clearTimeout(tipOutT);
      });
      tipEl.addEventListener("pointerleave", (ev) => {
        tipHover = false;
        if (tipSide) rowTipOut(ev);
        else tipOut(ev);
      });
      isolate(tipEl);
    }
    if (tipEl.parentNode !== col.viewEl) col.viewEl.appendChild(tipEl);
    clearTimeout(tipOutT);
    if (tipSv) tipSv.destroy();
    tipSv = null;
    tipEl.classList.remove("rtcb-tip--hero");
    tipEl.textContent = "";
    tipEl.dataset.rich = "false";
    delete tipEl.dataset.leaving;
    tipEl.classList.toggle("rtcb-tip--mini", !!col.hosted && !id);
    tipEl.classList.toggle("rtcb-tip--agent", !!id && (col.hosted || !!side));
    tipEl.classList.toggle("rtcb-tip--side", !!side);
    tipImgAt = 0;
    if (id && (col.hosted || side)) {
      // an agent in a slot: what it changed, then "#n · status · time" and
      // the request (agentTip)
      const e = cache.get(id);
      if (!e) return;
      agentTip(e);
    } else if (id) {
      const e = cache.get(id);
      if (!e) return;
      const t = e.task;
      // Rich: a running agent shows its last captured frame; a done one, its
      // result (shotView: the after, replay, compare).
      const sv = t.status === "done" ? shotView(t, { mode: "tip", maxH: 200, autoplay: true, onOpen: () => openResult(t) }) : null;
      const pic = t.status === "running" ? t.lastFrame : t.status === "done" && !sv ? t.after : null;
      if (sv) {
        tipSv = sv;
        tipEl.append(sv.el);
        tipEl.dataset.rich = "true";
        tipEl.classList.add("rtcb-tip--hero");
      }
      if (pic) {
        const im = el("img", "rtcb-tip-img");
        im.alt = t.status === "running" ? "What the agent's canvas region looks like now" : "After";
        im.src = pic.dataUrl;
        if (pic.w && pic.h) im.style.aspectRatio = `${pic.w} / ${pic.h}`;
        tipEl.append(im);
        tipEl.dataset.rich = "true";
        tipImgAt = t.status === "running" && t.lastFrame ? t.lastFrame.at : 0;
      }
      const head = el("div", "rtcb-tip-h");
      head.append(el("span", "rtcb-num", `#${e.n}`), el("b", null, t.author.name), el("span", `rtcb-tip-st rtcb-st--${t.status}`, LABEL[t.status]));
      tipEl.append(head, el("div", "rtcb-tip-t", clip(t.text, 140) || "(no text)"));
      if (!TERMINAL.has(t.status)) tipEl.append(el("div", "rtcb-tip-k", followId === id ? "⌥-click to stop following" : "⌥-click to follow"));
    } else if (col.hosted) tipEl.append(el("div", "rtcb-tip-mini", anchor.dataset.tip || ""));
    else tipEl.append(el("div", "rtcb-tip-t", anchor.dataset.tip || ""));
    tipFor = id;
    tipAnchor = anchor;
    tipCol = col;
    tipSide = !!side;
    const cap = tipEl.classList.contains("rtcb-tip--hero") ? 320 : tipEl.classList.contains("rtcb-tip--agent") ? 264 : 260;
    tipEl.style.maxWidth = `${Math.max(120, Math.min(cap, (col.bounds ? col.bounds.r - col.bounds.l : innerWidth) - 2 * EDGE_IN))}px`;
    tipEl.setAttribute("data-show", "");
    placeTip();
    anchor.setAttribute("aria-describedby", tipEl.id);
    lastTipAt = now();
  }
  // Next to its anchor, inside the canvas view (absolute in it) and the
  // window: towards the middle of the view (above an anchor in its lower
  // half), on the other side when that side has no room, then the side with
  // more; centred on the anchor, slid to stay inside. Its size is known
  // before its picture loads (the picture's box has its ratio), so this runs
  // once; a picture without a size places it again when it loads.
  function placeTip() {
    const anchor = tipAnchor;
    if (!tipEl || !tipEl.hasAttribute("data-show") || !anchor || !anchor.isConnected) return;
    const col = tipCol;
    if (!col || !col.viewEl) return;
    const B0 = col.bounds || { l: 0, t: 0, r: innerWidth, b: innerHeight };
    const B = { l: Math.max(B0.l, 0), t: Math.max(B0.t, 0), r: Math.min(B0.r, innerWidth), b: Math.min(B0.b, innerHeight) };
    const vr = col.viewEl.getBoundingClientRect();
    const r = anchor.getBoundingClientRect();
    tipEl.style.left = "0px";
    tipEl.style.top = "0px";
    const tr = tipEl.getBoundingClientRect();
    if (tipSide) {
      // beside the list (right of it; left when there is no room), its top
      // on the row's, slid to stay inside
      const lr = (anchor.closest(".rtcb-hub") || anchor).getBoundingClientRect();
      // past canvas-chrome's tool rail when it stands right beside the card
      let edge = lr.right;
      const rail = col.viewEl.querySelector("[data-rcc-railwrap]") || (anchor.closest("[data-canvas-shell]") || document).querySelector("[data-rcc-railwrap]");
      const rr = rail && rail.getClientRects().length ? rail.getBoundingClientRect() : null;
      if (rr && rr.left >= lr.right - 1 && rr.left - lr.right < 48) edge = rr.right;
      let left = edge + 8;
      if (left + tr.width > B.r - EDGE_IN && lr.left - 8 - tr.width >= B.l + EDGE_IN) left = lr.left - 8 - tr.width;
      left = Math.max(B.l + EDGE_IN, Math.min(B.r - EDGE_IN - tr.width, left));
      const top = Math.max(B.t + EDGE_IN, Math.min(B.b - EDGE_IN - tr.height, r.top));
      tipEl.dataset.dir = "side";
      tipEl.style.left = `${Math.round(left - vr.left)}px`;
      tipEl.style.top = `${Math.round(top - vr.top)}px`;
      return;
    }
    const roomUp = r.top - 8 - (B.t + EDGE_IN);
    const roomDown = B.b - EDGE_IN - (r.bottom + 8);
    let up = (r.top + r.bottom) / 2 > (B.t + B.b) / 2;
    if (up && roomUp < tr.height && roomDown >= tr.height) up = false;
    else if (!up && roomDown < tr.height && roomUp >= tr.height) up = true;
    else if (roomUp < tr.height && roomDown < tr.height) up = roomUp >= roomDown;
    let top = up ? r.top - 8 - tr.height : r.bottom + 8;
    top = Math.max(B.t + EDGE_IN, Math.min(B.b - EDGE_IN - tr.height, top));
    const left = Math.max(B.l + EDGE_IN, Math.min(B.r - EDGE_IN - tr.width, r.left + r.width / 2 - tr.width / 2));
    tipEl.dataset.dir = up ? "up" : "down";
    tipEl.style.left = `${Math.round(left - vr.left)}px`;
    tipEl.style.top = `${Math.round(top - vr.top)}px`;
  }
  // handoff: the popover opening from this avatar covers the tooltip as it
  // fades (it steps under the panel for its fade), so nothing blinks
  function hideTip(handoff) {
    clearTimeout(tipTimer);
    clearTimeout(tipOutT);
    if (!tipEl || !tipEl.hasAttribute("data-show")) return;
    if (tipSv) tipSv.destroy(); // its replay stops (the card fades on the after)
    if (handoff === true) tipEl.dataset.leaving = "under";
    else delete tipEl.dataset.leaving;
    tipEl.removeAttribute("data-show");
    tipFor = null;
    tipAnchor = null;
    tipSide = false;
    tipHover = false;
    lastTipAt = now();
  }
  // A row of the agents list: the agent's card (agentTip, the avatar's own)
  // floats beside the list after ~250 ms of intent, at once from one row to
  // the next (the card stays up and changes in place: no blink down the
  // list); it goes 160 ms after the pointer leaves the row, unless the
  // pointer went onto it (it stays while hovered). A click on a row opens
  // its thread, the card goes.
  let rowTipT = 0;
  let tipHover = false;
  // An avatar's card with a picture: the pointer may cross the 8 px gap onto
  // it (it stays while hovered, goes when the pointer leaves both); a card
  // without one goes at once, as before.
  let tipOutT = 0;
  function tipOut(ev) {
    clearTimeout(tipTimer);
    clearTimeout(tipOutT);
    const to = ev && ev.relatedTarget;
    const hoverable = !!tipEl && tipEl.hasAttribute("data-show") && tipEl.classList.contains("rtcb-tip--hero") && !tipSide;
    if (!hoverable) return hideTip();
    if (to instanceof Node && (tipEl.contains(to) || (tipAnchor && tipAnchor.contains(to)))) return;
    tipOutT = setTimeout(() => !tipHover && hideTip(), 140);
  }
  function rowTipSoon(li) {
    clearTimeout(rowTipT);
    const up = !!tipEl && tipEl.hasAttribute("data-show") && tipSide;
    rowTipT = setTimeout(() => li.isConnected && !li.dataset.out && showTip(li, li.dataset.id, true), up ? 0 : 250);
  }
  function rowTipOut(ev) {
    clearTimeout(rowTipT);
    const to = ev && ev.relatedTarget;
    if (to instanceof Node && ((tipEl && tipEl.contains(to)) || (to.closest && to.closest(".rtcb-hub-row")))) return;
    rowTipT = setTimeout(() => tipSide && !tipHover && hideTip(), 160);
  }

  // The picture of what an agent changed: done, Before | After side by side
  // (the after alone without a before); working, its last captured frame
  // (live while the tooltip is up), else its before; waiting, queued or
  // failed, its before. [[shot, label]] | null.
  function tipShots(t) {
    if (t.status === "done" && t.after) return t.before ? [[t.before, "Before"], [t.after, "After"]] : [[t.after, "After"]];
    if (t.status === "running" && t.lastFrame) return [[t.lastFrame, "Now"]];
    if (t.before) return [[t.before, "Before"]];
    if (t.after) return [[t.after, "After"]];
    return null;
  }
  // An agent's tooltip: its picture(s) in boxes of their own ratio (the
  // surface shows until the image is decoded, then it fades in: 160 ms),
  // "#n · status · time" and the request in two lines. Hover only; the
  // click opens its popover (or its thread in the card).
  function agentTip(e) {
    const t = e.task;
    // done: the result picture (shotView: the after, replay, compare)
    const sv = t.status === "done" ? shotView(t, { mode: "tip", maxH: 220, autoplay: true, note: true, onOpen: () => openResult(t) }) : null;
    const shots = sv ? null : tipShots(t);
    if (sv) {
      tipSv = sv;
      tipEl.append(sv.el);
      tipEl.dataset.rich = "true";
      tipEl.classList.add("rtcb-tip--hero");
    }
    if (shots) {
      const media = el("div", "rtcb-tip-media");
      media.dataset.n = String(shots.length);
      for (const [s, label] of shots) {
        const fig = el("figure", "rtcb-tip-fig");
        fig.style.setProperty("--rtcb-ar", s.w && s.h ? `${s.w} / ${s.h}` : "16 / 10");
        const im = el("img", "rtcb-tip-img");
        im.alt = label === "Now" ? "What the agent's part of the canvas looks like now" : `${label} screenshot`;
        im.decoding = "async";
        const shown = () => {
          fig.dataset.loaded = "true";
          // a picture without a size: its real ratio, then the tooltip again
          if (!(s.w && s.h) && im.naturalWidth && im.naturalHeight) {
            fig.style.setProperty("--rtcb-ar", `${im.naturalWidth} / ${im.naturalHeight}`);
            placeTip();
          }
        };
        im.addEventListener("load", shown, { once: true });
        im.src = s.dataUrl;
        if (im.complete && im.naturalWidth) shown();
        fig.append(im);
        if (shots.length > 1 || label !== "Now") fig.append(el("figcaption", "rtcb-tip-tag", label));
        media.append(fig);
      }
      tipEl.append(media);
      tipEl.dataset.rich = "true";
      if (t.status === "running" && t.lastFrame && shots[0][0] === t.lastFrame) tipImgAt = t.lastFrame.at || 0;
    }
    const stopped = stoppedOf(t);
    const head = el("div", "rtcb-tip-h");
    head.append(el("span", "rtcb-num", `#${e.n}`), el("span", `rtcb-tip-st rtcb-st--${stopped ? "stopped" : t.status}`, stopped ? "Stopped by you" : SHORT[t.status] || LABEL[t.status]));
    const when = TERMINAL.has(t.status) ? t.finishedAt || t.startedAt || t.createdAt : t.startedAt || t.createdAt;
    if (when) head.append(el("span", "rtcb-sep", "·"), el("span", "rtcb-tip-when", TERMINAL.has(t.status) ? ago(when) : `${fmtDur(now() - when)}`));
    tipEl.append(head, el("div", "rtcb-tip-t", clip(t.text, 140) || "(no text)"));
    // the conversation's last two messages (the agent's, the designer's
    // replies), two lines each, Markdown marks dropped
    const said = t.updates.filter((u) => u.kind === "text").map((u) => ({ at: u.at || 0, you: !!u.user, text: u.text }));
    for (const m of e.mine) if (!said.some((x) => x.you && x.text.trim() === m.text.trim())) said.push({ at: m.at || 0, you: true, text: m.text });
    said.sort((a, b) => a.at - b.at);
    const last = said.slice(-2);
    if (last.length) {
      const box = el("div", "rtcb-tip-msgs");
      for (const m of last) {
        const row = el("div", "rtcb-tip-msg");
        const who = el("span", "rtcb-tip-who");
        if (!m.you) who.innerHTML = claudeSvg(10); // constant markup
        who.append(el("span", null, m.you ? "You" : "Claude"));
        row.append(who, el("div", "rtcb-tip-mt", clip(m.text.replace(/```[\s\S]*?```/g, " ").replace(/[`*_#>]/g, ""), 220)));
        box.append(row);
      }
      tipEl.append(box);
    }
  }

  // ------------------------------------------------------ the result picture
  // shotView(t, opts): what the agent did, readable in a second. The after
  // is the hero (its own ratio, as wide as its place allows, at most
  // opts.maxH tall). Over it:
  //   - the replay: task.replay's frames crossfading on their timeline and
  //     the agent's cursor (its colour) gliding between its points with a
  //     short chip of what it did; without a replay, before -> after in a
  //     crossfade, the cursor going from the pin to each changed area. Each
  //     pass ends on the after, holds it, fades back and loops; Web
  //     Animations only (opacity / transform: nothing for the main thread
  //     per frame), started once every frame is decoded;
  //   - the changed areas (task.shot.boxes): a thin outline with a soft glow
  //     that comes when the after lands and goes;
  //   - compare: press and hold shows the before; drag moves a divider
  //     (before left of it, after right of it); Shift shows the before
  //     (opts.peek via setPeek), "/" pins it; a short click enlarges
  //     (opts.onOpen);
  //   - an empty place (task.shot.empty): no before (never a dark box), a
  //     "New" mark on the after;
  //   - task.shot.note: why the capture fell back, one muted line under it.
  // prefers-reduced-motion: no autoplay, the after with its areas outlined.
  // Returns { el, play(), rest(), peek(on), toggle(), destroy(), plan } or
  // null (no after and no replay).
  const SV_HOLD = 1300; // the after stays this long at the end of a pass
  const SV_BACK = 380; // then the pass fades back to its first frame
  const SV_KIND = { create: "Create", edit: "Edit", style: "Style", move: "Move", resize: "Resize", canvas: "Canvas", click: "Click", new: "New", edited: "Edited", moved: "Moved" };
  function svPlan(t) {
    const sm = t.shot;
    const rp = t.replay;
    const last = rp ? rp.frames[rp.frames.length - 1] : null;
    const hero = t.after || (last ? { dataUrl: last.dataUrl, w: rp.w, h: rp.h } : null);
    if (!hero) return null;
    const empty = !!(sm && sm.empty);
    const before = empty ? null : t.before;
    const boxes = sm ? sm.boxes : [];
    const pin = sm ? sm.pin : null;
    let frames;
    let cursor = [];
    let dur;
    let land; // when the after lands (the areas glow then)
    if (rp) {
      frames = rp.frames.map((f) => ({ url: f.dataUrl, t: f.t }));
      // (moving over the canvas or a click needs no word)
      cursor = rp.cursor.map((c) => ({ ...c, label: c.label === "" ? null : c.label || (c.kind === "canvas" || c.kind === "click" ? null : SV_KIND[c.kind]) || null }));
      dur = rp.durMs;
      land = frames[frames.length - 1].t;
    } else {
      // made up from what there is: the cursor from the pin to each area,
      // then the after
      const pts = boxes.map((b) => ({ fx: b.fx + b.fw / 2, fy: b.fy + b.fh / 2, label: b.label || SV_KIND[b.kind] }));
      if (pts.length) {
        const from = pin || { fx: 0.5, fy: 0.5 };
        cursor.push({ t: 0, fx: from.fx, fy: from.fy, label: null });
        pts.forEach((p, k) => cursor.push({ t: 650 + k * 650, ...p }));
      }
      land = pts.length ? cursor[cursor.length - 1].t + 200 : 900;
      frames = before ? [{ url: before.dataUrl, t: 0 }, { url: hero.dataUrl, t: land }] : [{ url: hero.dataUrl, t: 0 }];
      dur = Math.min(REPLAY_MAX, land + 200);
    }
    const animated = frames.length > 1 || cursor.length > 1 || boxes.length > 0;
    const w = hero.w || (rp && rp.w) || null;
    const h = hero.h || (rp && rp.h) || null;
    return { hero, before, boxes, pin, empty, frames, cursor, dur, land, animated, w, h, note: sm && sm.note, replay: !!rp, src: sm && sm.src };
  }
  const svWait = (ms) => new Promise((r) => setTimeout(r, ms));
  let tipSv = null; // the tooltip's picture (Shift peeks at its before)
  function shotView(t, opts) {
    const o = opts || {};
    const plan = svPlan(t);
    if (!plan) return null;
    const root = el("div", `rtcb-sv rtcb-sv--${o.mode || "panel"}`);
    root.dataset.state = "rest";
    root.style.setProperty("--rtcb-sv-ar", String(plan.w && plan.h ? +(plan.w / plan.h).toFixed(4) : 1.6));
    if (o.maxH) root.style.setProperty("--rtcb-sv-mh", `${o.maxH}px`);
    if (plan.w) root.style.setProperty("--rtcb-sv-nw", `${Math.round(plan.w * 1.25)}px`);
    root.style.setProperty("--rtcb-sv-c", agentColor(t.id));
    const frame = el("div", "rtcb-sv-frame");
    const imgs = [];
    const mk = (url, cls, alt) => {
      const im = el("img", cls);
      im.alt = alt || "";
      im.decoding = "async";
      im.draggable = false;
      im.src = url;
      imgs.push(im);
      return im;
    };
    const after = mk(plan.hero.dataUrl, "rtcb-sv-img rtcb-sv-after", "After: what the agent changed");
    frame.append(after);
    // the pass's frames, over the after while it plays (the last one is the after)
    let rp = null;
    const rpImgs = [];
    if (plan.frames.length > 1) {
      rp = el("div", "rtcb-sv-rp");
      for (const f of plan.frames) rpImgs.push(mk(f.url, "rtcb-sv-img"));
      rp.append(...rpImgs);
      frame.append(rp);
    }
    let beforeEl = null;
    if (plan.before) {
      beforeEl = mk(plan.before.dataUrl, "rtcb-sv-img rtcb-sv-before", "Before");
      frame.append(beforeEl);
    }
    const boxEls = plan.boxes.map((b) => {
      const n = el("span", `rtcb-sv-box rtcb-sv-box--${b.kind}`);
      n.style.left = `${(b.fx * 100).toFixed(2)}%`;
      n.style.top = `${(b.fy * 100).toFixed(2)}%`;
      n.style.width = `${(b.fw * 100).toFixed(2)}%`;
      n.style.height = `${(b.fh * 100).toFixed(2)}%`;
      return n;
    });
    if (boxEls.length) {
      const bl = el("div", "rtcb-sv-boxes");
      bl.append(...boxEls);
      frame.append(bl);
    }
    // the agent's cursor: a layer the size of the frame, moved by its own
    // size (translate %), the arrow at its top left
    let cur = null;
    let curIn = null;
    const chips = [];
    if (plan.cursor.length) {
      cur = el("div", "rtcb-sv-cur");
      curIn = el("div", "rtcb-sv-cur-in");
      curIn.innerHTML =
        '<svg class="rtcb-sv-arrow" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M2.2 1.6 13.4 7.3 8.2 8.6 5.6 13.6Z" fill="currentColor" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>'; // constant markup
      for (const c of plan.cursor) {
        if (!c.label) continue;
        // on the side of the cursor with more room (right half: its left),
        // never past the picture's edge: at most that room (the frame is a
        // size container), the rest in an ellipsis; near the bottom, above
        const ch = el("span", `rtcb-sv-chip${c.fx > 0.5 ? " rtcb-sv-chip--l" : ""}${c.fy > 0.82 ? " rtcb-sv-chip--u" : ""}`, c.label);
        ch.style.setProperty("--rtcb-sv-cfx", c.fx.toFixed(4));
        ch.title = c.label;
        chips.push({ el: ch, t: c.t });
        curIn.append(ch);
      }
      const p0 = plan.cursor[0];
      cur.style.transform = `translate(${(p0.fx * 100).toFixed(2)}%, ${(p0.fy * 100).toFixed(2)}%)`;
      cur.append(curIn);
      frame.append(cur);
    }
    const prog = el("span", "rtcb-sv-prog");
    const div = el("span", "rtcb-sv-div");
    frame.append(prog, div);
    if (plan.before) frame.append(el("span", "rtcb-sv-side rtcb-sv-side--b", "Before"), el("span", "rtcb-sv-side rtcb-sv-side--a", "After"));
    const tag = el("span", "rtcb-sv-tag");
    // at rest "After"; while it plays "Replay" (a made-up pass: "Before → after"; an empty place: nothing, "New" says it)
    tag.append(el("span", "rtcb-sv-tag-a", "After"));
    if (plan.replay || plan.before) tag.append(el("span", "rtcb-sv-tag-r", plan.replay ? "Replay" : "Before → after"));
    else tag.classList.add("rtcb-sv-tag--still");
    frame.append(tag);
    if (plan.empty) {
      const nw = el("span", "rtcb-sv-new", "New");
      nw.title = "Nothing here before";
      frame.append(nw);
    }
    let hint = null;
    if (plan.before && o.hint !== false) {
      hint = el("span", "rtcb-sv-hint", "Hold or drag to compare");
      hint.title = "Hold: the before · drag: a divider · Shift: the before · /: pin it";
      frame.append(hint);
    }
    root.append(frame);
    if (plan.note && o.note !== false) {
      const n = el("p", "rtcb-sv-note");
      n.innerHTML = ICON.info; // constant markup
      n.append(el("span", null, plan.note));
      root.append(n);
    }

    // ---- the pass
    const L = plan.dur + SV_HOLD + SV_BACK;
    let anims = [];
    let playing = false;
    let token = 0;
    let decoded = null;
    const off = (ms) => Math.max(0, Math.min(1, ms / L));
    const ready = () => decoded || (decoded = Promise.race([Promise.all(imgs.map((im) => (im.decode ? im.decode().catch(() => {}) : null))), svWait(900)]));
    function stopAnims() {
      for (const a of anims)
        try {
          a.cancel();
        } catch (_) {}
      anims = [];
    }
    async function play() {
      if (playing || pinned || cmpOn || !plan.animated || reducedMotion() || typeof frame.animate !== "function") return;
      playing = true;
      const my = ++token;
      await ready();
      if (my !== token || !playing) return;
      if (!root.isConnected) return void (playing = false);
      root.dataset.state = "play";
      const iterations = o.loop === false ? 1 : Infinity;
      const A = (node, kf) => anims.push(node.animate(kf, { duration: L, iterations, fill: "both" }));
      const endAt = off(L - SV_BACK);
      // frames: each fades in over the one before it, all fade back at the end
      rpImgs.forEach((im, i) => {
        if (!i) return;
        const ti = plan.frames[i].t;
        const xf = Math.min(280, Math.max(60, ti - plan.frames[i - 1].t));
        const a0 = off(Math.max(0, ti - xf));
        const a1 = Math.max(a0, off(ti));
        A(im, [
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: a0, easing: "ease-out" },
          { opacity: 1, offset: a1 },
          { opacity: 1, offset: Math.max(a1, endAt), easing: "ease-in" },
          { opacity: 0, offset: 1 },
        ]);
      });
      // the cursor: glides between its points, shows from its first one
      if (cur) {
        const pts = plan.cursor;
        const tr = (p) => `translate(${(p.fx * 100).toFixed(2)}%, ${(p.fy * 100).toFixed(2)}%)`;
        const kf = [{ transform: tr(pts[0]), offset: 0 }];
        // each move eases in and out between two points
        for (const p of pts) kf.push({ transform: tr(p), offset: Math.max(kf[kf.length - 1].offset, off(p.t)) });
        kf.push({ transform: tr(pts[pts.length - 1]), offset: 1 });
        for (const k of kf) k.easing = "cubic-bezier(0.45, 0, 0.2, 1)";
        A(cur, kf);
        const s0 = off(Math.max(0, pts[0].t - 120));
        const s1 = Math.max(s0, off(pts[0].t + 60));
        A(curIn, [
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: s0 },
          { opacity: 1, offset: s1 },
          { opacity: 1, offset: Math.max(s1, off(L - SV_BACK - 120)) },
          { opacity: 0, offset: Math.max(s1, endAt) },
          { opacity: 0, offset: 1 },
        ]);
        chips.forEach((c, k) => {
          const until = Math.min(c.t + 1300, k + 1 < chips.length ? chips[k + 1].t : Infinity, L - SV_BACK - 120);
          const c0 = off(c.t);
          const c1 = Math.max(c0, off(c.t + 90));
          const c2 = Math.max(c1, off(until));
          A(c.el, [
            { opacity: 0, transform: "translateY(2px)", offset: 0 },
            { opacity: 0, transform: "translateY(2px)", offset: c0 },
            { opacity: 1, transform: "none", offset: c1 },
            { opacity: 1, transform: "none", offset: c2 },
            { opacity: 0, transform: "none", offset: Math.min(1, c2 + off(120)) },
            { opacity: 0, transform: "none", offset: 1 },
          ]);
        });
      }
      // the changed areas: glow when the after lands (or the cursor reaches them), then go
      boxEls.forEach((n, k) => {
        const at = plan.replay ? plan.land : plan.cursor[k + 1] ? plan.cursor[k + 1].t : plan.land;
        const b0 = off(Math.max(0, at - 120));
        const b1 = Math.max(b0, off(at + 160));
        const b2 = Math.max(b1, off(at + 1100));
        A(n, [
          { opacity: 0, transform: "scale(1.04)", offset: 0 },
          { opacity: 0, transform: "scale(1.04)", offset: b0, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
          { opacity: 1, transform: "none", offset: b1 },
          { opacity: 1, transform: "none", offset: b2, easing: "ease-in" },
          { opacity: 0, transform: "none", offset: Math.min(1, Math.max(b2, off(at + 1700))) },
          { opacity: 0, transform: "none", offset: 1 },
        ]);
      });
      // the compare hint: only while the after holds (never over the cursor's work)
      if (hint)
        A(hint, [
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: off(plan.dur + 150) },
          { opacity: 0.9, offset: off(plan.dur + 350) },
          { opacity: 0.9, offset: endAt },
          { opacity: 0, offset: Math.min(1, endAt + off(120)) },
          { opacity: 0, offset: 1 },
        ]);
      A(prog, [
        { transform: "scaleX(0)", offset: 0 },
        { transform: "scaleX(1)", offset: off(plan.dur) },
        { transform: "scaleX(1)", opacity: 1, offset: endAt },
        { transform: "scaleX(1)", opacity: 0, offset: 1 },
      ]);
    }
    function rest() {
      token++;
      playing = false;
      stopAnims();
      root.dataset.state = "rest";
    }
    // compare: the before left of the divider (x: 0..1; 1 = the before whole)
    let cmpOn = false;
    let pinned = false;
    const setX = (x) => root.style.setProperty("--rtcb-sv-x", `${(Math.max(0, Math.min(1, x)) * 100).toFixed(2)}%`);
    function compare(on, x) {
      if (!beforeEl) return false;
      if (on) {
        if (playing) rest();
        cmpOn = true;
        setX(x == null ? 1 : x);
        root.dataset.cmp = x == null || x >= 1 ? "before" : "split";
      } else {
        cmpOn = false;
        delete root.dataset.cmp;
        if (pinned) (setX(1), (root.dataset.cmp = "before"));
      }
      return true;
    }
    frame.addEventListener("mousedown", (ev) => ev.preventDefault()); // no focus move, no image drag
    frame.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      const r = frame.getBoundingClientRect(); // one read per press
      const x0 = ev.clientX;
      const y0 = ev.clientY;
      const fx = (cx) => (cx - r.left) / Math.max(1, r.width);
      let moved = false;
      let held = false;
      const hold = setTimeout(() => {
        held = true;
        compare(true, null);
      }, 170);
      try {
        frame.setPointerCapture(ev.pointerId);
      } catch (_) {}
      const move = (e) => {
        if (!moved && Math.hypot(e.clientX - x0, e.clientY - y0) > 4) {
          moved = true;
          clearTimeout(hold);
        }
        if (moved && beforeEl) compare(true, fx(e.clientX));
      };
      const end = (e) => {
        clearTimeout(hold);
        frame.removeEventListener("pointermove", move);
        frame.removeEventListener("pointerup", end);
        frame.removeEventListener("pointercancel", end);
        if (held || (moved && beforeEl)) compare(false);
        else if (!moved && e.type === "pointerup" && o.onOpen) o.onOpen();
      };
      frame.addEventListener("pointermove", move);
      frame.addEventListener("pointerup", end);
      frame.addEventListener("pointercancel", end);
    });
    if (o.onOpen && o.focusable) {
      frame.tabIndex = 0;
      frame.setAttribute("role", "button");
      frame.setAttribute("aria-label", "Enlarge the result");
      frame.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          o.onOpen();
        }
      });
    }
    if (o.hover) {
      root.addEventListener("pointerenter", () => play());
      root.addEventListener("pointerleave", () => cmpOn || rest());
    }
    const api = {
      el: root,
      plan,
      play,
      rest,
      peek: (on) => compare(on, null),
      // "/": pins the before (again: the after)
      toggle() {
        if (!beforeEl) return false;
        pinned = !pinned;
        if (pinned) compare(true, null);
        else ((cmpOn = false), delete root.dataset.cmp);
        return true;
      },
      state: () => ({ state: root.dataset.state, cmp: root.dataset.cmp || null, anims: anims.length, frames: plan.frames.length, cursor: plan.cursor.length, boxes: plan.boxes.length, replay: plan.replay, empty: plan.empty }),
      destroy() {
        rest();
        if (tipSv === api) tipSv = null;
      },
    };
    root._sv = api;
    if (reducedMotion() && boxEls.length) root.dataset.still = "true"; // the areas outlined, still
    if (o.autoplay) requestAnimationFrame(() => play());
    return api;
  }
  // compare views going away with their node: their replay stops
  function svDrop(node) {
    if (node) for (const n of node.querySelectorAll(".rtcb-sv")) if (n._sv) n._sv.destroy();
  }
  // The task's media for the enlarged view: the result (the compare view),
  // then the GIF (or the key frames without one).
  function mediaList(t) {
    const list = [];
    if (svPlan(t)) list.push({ sv: true, label: "Result", img: t.after });
    else {
      if (t.before) list.push({ img: t.before, label: "Before" });
      if (t.after) list.push({ img: t.after, label: "After" });
    }
    if (t.gif) list.push({ img: { dataUrl: t.gif.dataUrl, w: t.gif.w, h: t.gif.h }, label: "GIF" });
    else if (t.frames.length > 1) {
      const names = t.frames.length === 3 ? ["Start", "Middle", "End"] : ["Start", "End"];
      t.frames.forEach((f, i) => list.push({ img: f, label: names[i] || `Frame ${i + 1}` }));
    }
    return list;
  }

  // ----------------------------------------------------------------- panel
  let openId = null;
  let panel = null;
  let P = null; // panel parts
  let panelSig = "";
  let peek = false; // Shift held: show Before
  const drafts = new Map(); // id -> unsent reply
  const sumOpen = new Set(); // ids whose summary is shown whole
  const openSteps = new Map(); // id -> Set of expanded step-group keys

  function ensurePanel() {
    if (panel) return;
    panel = el("section", "rtcb-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", "rtcb-panel-title");
    panel.tabIndex = -1;

    const head = el("header", "rtcb-ph");
    const numEl = el("span", "rtcb-num rtcb-num--head");
    const chip = el("span", "rtcb-chip");
    chip.id = "rtcb-panel-title";
    const chipIco = el("span", "rtcb-chip-ico");
    const chipLabel = el("span", "rtcb-chip-label");
    chip.append(chipIco, chipLabel);
    const htime = el("span", "rtcb-ptime");
    // the chat's model and effort, e.g. "✱ Opus 5.5 · High"
    const model = el("span", "rtcb-model");
    model.hidden = true;
    const x = button("rtcb-x", "Close", ICON.close);
    x.addEventListener("click", () => closePanel(true));
    head.append(numEl, chip, htime, el("span", "rtcb-grow"), model, x);

    const body = el("div", "rtcb-pb");
    // in the card, its edges fade where there is more to scroll
    body.addEventListener(
      "scroll",
      () => {
        if (panel.dataset.inline === "true") fadeEdges(body);
        else if (popRect) popRect.scroll = body.scrollTop;
      },
      { passive: true },
    );

    const foot = el("footer", "rtcb-pf");
    const box = el("div", "rtcb-reply");
    const ta = el("textarea", "rtcb-ta");
    ta.rows = 1;
    ta.setAttribute("data-rtcb-reply", ""); // voice-input attaches its mic here
    ta.placeholder = "Reply to the agent…";
    ta.setAttribute("aria-label", "Reply to the agent");
    const send = button("rtcb-send", "Send reply", ICON.send);
    send.disabled = true;
    box.append(ta, send);
    const row = el("div", "rtcb-pf-row");
    const openBtn = null; // no "Open chat": the panel is the agent's view in the canvas
    const dismissBtn = button("rtcb-btn rtcb-dismiss", null);
    dismissBtn.textContent = "Dismiss";
    // Follow this agent on the canvas (the agent-follow mod pans to it)
    const followBtn = button("rtcb-btn rtcb-follow", null);
    followBtn.addEventListener("click", () => {
      if (!openId) return;
      if (followId === openId) unfollow();
      else follow(openId);
    });
    const hint = el("span", "rtcb-hint", "Enter to send");
    // Stop (the store's stop(id)), while it works
    const stopBtn = button("rtcb-btn rtcb-stop", null);
    stopBtn.textContent = "Stop";
    stopBtn.title = "Stop this agent (⌘. in the agents list)";
    stopBtn.addEventListener("click", () => {
      const f = stopFn();
      if (openId && f) f(openId);
    });
    row.append(followBtn, stopBtn, dismissBtn, el("span", "rtcb-grow"), hint);
    foot.append(box, row);

    ta.addEventListener("input", () => {
      if (openId) drafts.set(openId, ta.value);
      autosize();
    });
    ta.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing && !ev.altKey) {
        ev.preventDefault();
        sendReply();
      }
    });
    send.addEventListener("click", () => sendReply());
    dismissBtn.addEventListener("click", () => {
      const id = openId;
      const a = agent();
      if (!id || !a || typeof a.dismiss !== "function") return;
      try {
        a.dismiss(id);
      } catch (e) {
        note("dismiss", e);
      }
      cache.delete(id);
      persistSoon();
      closePanel(false);
    });

    panel.append(head, body, foot);
    isolate(panel);
    panel.addEventListener("pointerenter", () => (hoverUI = true));
    panel.addEventListener("pointerleave", () => (hoverUI = false));
    P = { head, numEl, chip, chipIco, chipLabel, htime, model, x, body, foot, box, ta, send, row, openBtn, followBtn, stopBtn, dismissBtn, hint, car: null };
  }
  // Its actions (Follow, Stop, Dismiss): under its own reply field; a
  // popover whose reply field is the composer has them in its header, left
  // of ×, compact (the card's thread, on its "‹ Agents" line: the CSS)
  function placeActions() {
    if (!P) return;
    if (panel.dataset.reply === "composer" && panel.dataset.inline !== "true") {
      if (P.row.parentNode !== P.head || P.row.nextSibling !== P.x) P.head.insertBefore(P.row, P.x);
    } else if (P.row.parentNode !== P.foot) P.foot.append(P.row);
  }

  function autosize() {
    const ta = P.ta;
    P.send.disabled = !ta.value.trim() || !has("reply");
    if (panel && panel.dataset.reply === "composer") return; // not shown: no layout for it
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 112)}px`;
  }

  // opts.focusReply: the reply field focused. Its canvas showing the agents
  // list in canvas-chrome's card: the thread opens there, in place of the
  // list (the card shown first); else the popover over the bubble / panel.
  // opts.popover: the popover even then (an avatar in the agents pill): the
  // card's list stays as it is (a thread it showed goes back to the list:
  // one panel at a time).
  function openPanel(id, opts) {
    id = String(id);
    const e = cache.get(id);
    if (!e) return false;
    clearTimeout(holdTimer);
    holdMark = null;
    const pop = !!(opts && opts.popover);
    // its column (also when its bubble sits behind "+N": rendering adds it)
    const owner = [...columns.values()].find((c) => c.bubbles.has(id)) || [...columns.values()].find((c) => c.name && c.name === nameKey(e.task.canvasName));
    if (pop && !owner) return false;
    if (pop && inlineThread()) closePanel(false);
    const inl = !pop && hub && hub.inline && hub.el.isConnected && (!owner || owner === hub.col) ? hub : null;
    // the view that leaves, copied before anything here changes the layout
    // (one cheap read, no forced reflow)
    const inlShown = !!inl && inl.el.getClientRects().length > 0;
    const quiet = !!(opts && opts.quiet); // the card is opening with it: no move of its own
    const pre = inl && inlShown && !quiet && inl.el.dataset.view !== "thread" && viewLive(inl.el) ? ghostOf(inl.el) : null;
    if (!inl && !(hub && hub.inline)) closeHub(false, true); // (the card's list stays)
    hideTip(!inl); // a popover takes over from the avatar's tooltip
    closeLightbox();
    if (!owner && !inl) return false;
    ensurePanel();
    const switching = openId && openId !== id;
    // opts.keep: the same agent's panel moves (popover -> card) as it is
    // drawn (nothing rebuilt, nothing drawn twice)
    const keep = !!(opts && opts.keep) && panel.dataset.id === id && !!panelSig;
    if (!keep) carIdx.delete(id); // "Side by side" (or After) first, every time it opens
    openId = id;
    panelCol = inl ? inl.col : owner;
    if (!keep) panelSig = "";
    peek = false;
    if (inl) {
      // in the card: no box, no place of its own
      if (panel.parentNode !== inl.P.threadSlot) inl.P.threadSlot.appendChild(panel);
      panel.dataset.inline = "true";
      panel.dataset.narrow = "true";
      delete panel.dataset.anchor;
      delete panel.dataset.pos;
      for (const k of ["left", "top", "bottom", "width", "maxHeight"]) panel.style[k] = "";
      panel.style.removeProperty("--rtcb-caret-x");
      inl.expanded = true; // "‹ Agents" goes back to the list
      setInlineView("thread", !quiet, pre);
      setHubActive(id, false);
      // the card hidden (closed, another tab): canvas-chrome shows it
      if (!inlShown && cardApi())
        try {
          cardApi().openAgents(inl.col.viewEl);
        } catch (err) {
          note("openAgents", err);
        }
    } else {
      delete panel.dataset.inline;
      if (owner.viewEl && panel.parentNode !== owner.viewEl) owner.viewEl.appendChild(panel);
    }
    // one text box: in the card, and in a slot's popover next to
    // canvas-chrome's composer, the composer is the reply field
    // ("Reply to #N…", markReply); the panel has none of its own and its
    // actions sit in its header. Elsewhere (the native pill), its own.
    const field = composerField(panelCol);
    panel.dataset.reply = inl || field ? "composer" : "own";
    placeActions();
    // dictation in the reply field, when the voice-input mod offers it:
    // attached once the panel is on screen (its measuring stays out of the
    // click that opened it); the composer has its own mic
    const voiceFor = id;
    requestAnimationFrame(() =>
      setTimeout(() => {
        if (P.voice || openId !== voiceFor || !panel || !panel.isConnected || panel.dataset.reply !== "own") return;
        const V = window.__RE_TEMPO_VOICE__;
        if (!V || typeof V.attach !== "function") return;
        try {
          P.voice = V.attach(P.ta, {
            button: true,
            placement: "inside-end",
            onFinal: () => {
              if (openId) drafts.set(openId, P.ta.value);
              autosize();
            },
          });
        } catch (err) {
          note("voice", err);
        }
      }, 0),
    );
    clockOn();
    if (!switching && !keep) {
      panel.classList.remove("rtcb--in");
      void panel.offsetWidth;
      panel.classList.add("rtcb--in");
    }
    P.ta.value = drafts.get(id) || "";
    placePanel();
    if (keep && !P.car) P.car = P.carKept || null;
    // aria-expanded on the bubbles, then the panel content (panelSig was
    // reset); a kept panel is already drawn for this agent
    if (!keep) render();
    const wantsReply = (opts && opts.focusReply) || e.task.status === "needs-input";
    if (wantsReply && has("reply") && !P.ta.disabled && panel.dataset.reply === "own") P.ta.focus({ preventScroll: true });
    else if (!quiet) panel.focus({ preventScroll: true });
    // a popover over the composer: the composer turns into its reply field
    // and takes the focus, in the next frame (the popover paints first: the
    // two never share one long task); a thread in the card: its mark at once
    // (the card's list host takes over from the slot in one change)
    if (inl) markReply();
    if (field && (!inl || wantsReply)) {
      const want = id;
      requestAnimationFrame(() => {
        if (openId !== want || disposed) return;
        markReply();
        if (field.isConnected && (!document.activeElement || document.activeElement === document.body || panel.contains(document.activeElement))) field.focus({ preventScroll: true });
      });
    }
    return true;
  }

  function closePanel(restoreFocus) {
    if (!openId) return false;
    const id = openId;
    openId = null;
    peek = false;
    svDrop(panel);
    closeLightbox();
    const hadFocus = panel && panel.contains(document.activeElement);
    clockOff();
    if (P && P.voice) {
      try {
        if (typeof P.voice.destroy === "function") P.voice.destroy();
      } catch (e) {
        note("voice", e);
      }
      P.voice = null;
    }
    const inline = !!(panel && panel.dataset.inline === "true");
    // the thread as it leaves (its copy dissolves over the list coming back)
    const pre = inline && hub && hub.inline && !hub.closing && viewLive(hub.el) ? ghostOf(hub.el) : null;
    if (panel) panel.remove();
    if (P) (P.carKept = P.car), (P.car = null); // (kept for a move into the card: keep)
    hoverUI = false;
    if (inline) {
      // back to the card's list, on that agent's row (its line, when the
      // list was folded meanwhile)
      if (panel) delete panel.dataset.inline;
      if (hub && hub.inline) {
        setInlineView(inlineView(), true, pre);
        setHubActive(id, true);
        if (restoreFocus || hadFocus) focusInline();
      } else if (pre) (pre.remove(), overlays.delete(pre));
    } else {
      const b = panelCol && panelCol.bubbles.get(id);
      if (b && (restoreFocus || hadFocus)) b.btn.focus({ preventScroll: true });
    }
    markReply();
    render();
    return true;
  }

  // Room the canvas's bottom toolbar takes (Select, Frame, Comment…): from
  // its top to the view's bottom, plus a gap; 72 px at least.
  const TOOLBAR_BTN = 'button[aria-label="Select"], button[aria-label="Comment"], button[aria-label="Frame"], button[aria-label="Text"]';
  function toolbarRects(view, B) {
    const out = [];
    for (const n of view ? view.querySelectorAll(TOOLBAR_BTN) : []) {
      if (n.closest(".rtcb-panel, .rtcb-pop, [data-rtcb-root]") || !n.getClientRects().length) continue;
      // the toolbar: the largest ancestor that still looks like a bar
      let bar = n;
      for (let q = n.parentElement; q && q !== view; q = q.parentElement) {
        const qr = q.getBoundingClientRect();
        if (qr.height < 120 && qr.width < (B.r - B.l) * 0.95) bar = q;
        else break;
      }
      const r = bar.getBoundingClientRect();
      if (!out.some((o) => o.left === r.left && o.top === r.top)) out.push(r);
    }
    return out;
  }
  function toolbarReserve(view, B) {
    let top = Infinity;
    for (const r of toolbarRects(view, B)) if (r.bottom > B.b - 160) top = Math.min(top, r.top);
    return Math.max(72, Number.isFinite(top) ? B.b - top + 12 : 0);
  }
  // Opening upwards from `edge` over [l, r]: never under a toolbar that sits
  // just above the composer there (a narrow view docks the canvas tools at
  // the bottom): its top instead.
  function clearOfBars(view, B, edge, l, r, gap) {
    for (const b of toolbarRects(view, B)) if (b.left < r && b.right > l && b.bottom > edge - 2 && b.top < edge + 120) edge = Math.min(edge, b.top - gap);
    return edge;
  }
  // The segment on screen; in a slot, with the small box holding it (its
  // pill or chip row; a box taller than 120 px is ignored). null: not shown.
  function segRectOf(col) {
    const rr = col.root && col.root.isConnected ? col.root.getBoundingClientRect() : null;
    if (!rr) return null;
    const boxEl = col.hosted ? hostPill(col.root.parentElement) : null;
    const xr = boxEl ? boxEl.getBoundingClientRect() : null;
    const box = xr && xr.height <= 120 ? xr : null;
    return { left: rr.left, right: rr.right, top: box ? Math.min(rr.top, box.top) : rr.top, bottom: box ? Math.max(rr.bottom, box.bottom) : rr.bottom };
  }
  function placePanel() {
    if (!panel || !panel.isConnected || panel.dataset.inline === "true") return;
    const col = panelCol;
    if (!col || !col.viewEl) return;
    if (panel.parentNode !== col.viewEl) col.viewEl.appendChild(panel);
    const B = col.bounds || { l: 0, t: 0, r: innerWidth, b: innerHeight };
    const vr = col.viewEl.getBoundingClientRect();
    const seg = segRectOf(col) || { left: B.l + EDGE_IN, bottom: B.t + EDGE_IN, top: B.t, right: B.l + EDGE_IN };
    const b = openId && col.bubbles.get(openId);
    const br = b && b.btn.isConnected ? b.btn.getBoundingClientRect() : null;
    // Downwards from the segment, inside the canvas view: narrower when the
    // pane is, shorter (inner scroll) when it is short, never under the
    // canvas's floating toolbar at the bottom (72 px kept, more if it is
    // taller), never taller than the view - 24 px.
    const w = Math.round(Math.min(PANEL_W, Math.max(200, B.r - B.l - 2 * EDGE_IN)));
    let left = br ? br.left - 12 : seg.left;
    left = Math.max(B.l + EDGE_IN, Math.min(B.r - EDGE_IN - w, left));
    const cap = Math.min(B.b - B.t - 24, PANEL_MAX_H, Math.round((B.b - B.t) * 0.6));
    // a segment in the lower half of the view (a slot over a composer at the
    // bottom): upwards, its bottom 12 px over the segment, so it never covers
    // what is under the segment
    let up = col.hosted && (seg.top + seg.bottom) / 2 > (B.t + B.b) / 2;
    let edge; // the panel's top (down) or bottom (up), screen px
    let maxH;
    if (up) {
      edge = seg.top - UP_GAP;
      maxH = Math.min(edge - B.t - EDGE_IN, cap);
    } else {
      edge = seg.bottom + GAP;
      const bottom = B.b - toolbarReserve(col.viewEl, B);
      maxH = Math.min(bottom - edge, cap);
      if (maxH < 220 && seg.top - B.t > 220) {
        // not enough room below: above the segment instead (same ceiling)
        up = true;
        edge = seg.top - GAP;
        maxH = Math.min(edge - B.t - EDGE_IN, cap);
      }
    }
    // a bubble in a slot (the composer's agents): a small popover centred
    // over that bubble, just above the slot's box, its caret on the bubble
    let caret = null;
    if (col.hosted && br) {
      const pw = Math.round(Math.min(BPOP_W, Math.max(200, B.r - B.l - 2 * EDGE_IN)));
      const cx = br.left + br.width / 2;
      const pl = Math.max(B.l + EDGE_IN, Math.min(B.r - EDGE_IN - pw, cx - pw / 2));
      // the box holding the slot (the composer)
      const sf = surfaceOf(col);
      const top = sf ? Math.min(seg.top, sf.top) : seg.top;
      const pe = clearOfBars(col.viewEl, B, top - BPOP_GAP, pl, pl + pw, BPOP_GAP);
      const ph = Math.min(pe - B.t - EDGE_IN, BPOP_MAX_H, B.b - B.t - 24);
      if (ph >= 160) {
        const pp = [Math.round(pl - vr.left), Math.round(vr.bottom - pe), pw, Math.round(ph), "up"];
        caret = Math.round(Math.max(16, Math.min(pw - 16, cx - pl)));
        const sig = pp.join() + ",bubble," + caret;
        if (panel.dataset.pos === sig) return;
        panel.dataset.pos = sig;
        measureMore(P.body, openId);
        panel.dataset.dir = "up";
        panel.dataset.anchor = "bubble";
        panel.style.setProperty("--rtcb-caret-x", `${caret}px`);
        panel.style.left = `${pp[0]}px`;
        panel.style.top = "auto";
        panel.style.bottom = `${pp[1]}px`;
        panel.style.width = `${pp[2]}px`;
        panel.style.maxHeight = `${pp[3]}px`;
        panel.dataset.narrow = "true";
        return;
      }
    }
    delete panel.dataset.anchor;
    panel.style.removeProperty("--rtcb-caret-x");
    const pos = [Math.round(left - vr.left), up ? Math.round(vr.bottom - edge) : Math.round(edge - vr.top), w, Math.max(120, Math.round(maxH)), up ? "up" : "down"];
    if (panel.dataset.pos === pos.join()) return;
    panel.dataset.pos = pos.join();
    panel.dataset.dir = pos[4];
    panel.style.left = `${pos[0]}px`;
    // anchored by the edge next to the segment, so a short panel stays there
    panel.style.top = up ? "auto" : `${pos[1]}px`;
    panel.style.bottom = up ? `${pos[1]}px` : "auto";
    panel.style.width = `${pos[2]}px`;
    panel.style.maxHeight = `${pos[3]}px`;
    panel.dataset.narrow = w < 320 ? "true" : "false";
  }

  function avatar(a, cls) {
    const n = el("span", `rtcb-av ${cls || ""}`, a.initials);
    n.style.setProperty("--rtcb-av", a.color);
    n.setAttribute("aria-hidden", "true");
    return n;
  }
  function agoEl(ts, cls) {
    const n = el("time", cls || "rtcb-ago", ago(ts));
    if (ts) {
      n.dataset.rtcbAgo = String(ts);
      n.dateTime = new Date(ts).toISOString();
      n.title = new Date(ts).toLocaleString();
    }
    return n;
  }
  function thumb(img, label, list, index, cls) {
    const b = button(`rtcb-thumb ${cls || ""}`, `Enlarge the ${label.toLowerCase()} screenshot`);
    const im = el("img");
    im.alt = `${label} screenshot`;
    im.decoding = "async";
    im.src = img.dataUrl;
    if (img.w && img.h) b.style.setProperty("--rtcb-ar", `${img.w} / ${img.h}`);
    b.append(im, el("span", "rtcb-thumb-tag", label));
    b.addEventListener("click", () => openLightbox(list, index));
    return b;
  }
  const beforeAfter = (t) => (t.before ? [{ img: t.before, label: "Before" }] : []).concat(t.after ? [{ img: t.after, label: "After" }] : []);

  // needs-input: the question on top, with the answer field inside.
  function askCard(q) {
    const ask = el("div", "rtcb-ask");
    ask.setAttribute("role", "group");
    ask.setAttribute("aria-label", "Claude needs your input");
    const ah = el("div", "rtcb-ask-h");
    ah.innerHTML = ICON.ask; // constant markup
    ah.append(el("span", null, "Claude needs your input"));
    const qt = el("div", "rtcb-md rtcb-ask-q");
    qt.append(md(q.text || "Claude is waiting for your answer before it continues."));
    ask.append(ah, qt);
    return ask;
  }

  function requestSection(e) {
    const t = e.task;
    const sec = el("div", "rtcb-sec rtcb-sec--asked");
    sec.append(el("div", "rtcb-sec-h", "You asked"));
    const msg = el("div", "rtcb-msg");
    const main = el("div", "rtcb-msg-main");
    const who = el("div", "rtcb-who");
    who.append(el("b", null, t.author.name), agoEl(t.createdAt));
    main.append(who, el("p", "rtcb-text", t.text || "(no text)"));
    const w = where(t);
    if (w) {
      const wl = el("div", "rtcb-where");
      wl.innerHTML = ICON.canvas; // constant markup
      wl.append(el("span", null, w));
      wl.title = w;
      main.append(wl);
    }
    if (t.before) main.append(thumb(t.before, "Before", beforeAfter(t), 0, "rtcb-thumb--att"));
    msg.append(avatar(t.author, "rtcb-av--sm"), main);
    sec.append(msg);
    return sec;
  }

  // Timeline: the agent's last message shows whole (sayBlock: Markdown, 6
  // lines, then "Show more" in place); its earlier thoughts and actions fold
  // into "N steps" (one click shows every step whole: no second fold); the
  // designer's replies, a question it asked and the answers stay visible.
  // (skip: a message said elsewhere, the failure card's reason)
  function timelineSection(e, q, fin, skip) {
    const t = e.task;
    const captures = new Set([t.before && t.before.dataUrl, t.after && t.after.dataUrl].filter(Boolean));
    const updates = t.updates.filter((u) => u.kind !== "note" && (u.kind !== "screenshot" || !(captures.has(u.img.dataUrl) || /^(before|after)$/i.test(u.text || ""))));
    // a reply sent from here is drawn from e.mine (with its sending state),
    // not again from the pipeline's log
    const sent = new Set(e.mine.map((m) => m.text.trim()));
    const items = [];
    updates.forEach((u, i) => {
      if ((q && q.update === u) || u === skip) return; // in the card on top / the failure card
      if (u.user && sent.has(u.text.trim())) return;
      items.push({ at: u.at, order: i, u, you: !!u.user, fin: u === fin });
    });
    e.mine.forEach((m, i) => items.push({ at: m.at, order: 1e6 + i, mine: m }));
    items.sort((a, b) => (a.at && b.at ? a.at - b.at : 0) || a.order - b.order);
    // A question = a text the agent showed while waiting for input, or a text
    // ending in "?" right before a reply.
    items.forEach((it, i) => {
      if (it.u && it.u.kind === "text" && !it.you && e.asked.includes(it.u.text)) it.q = true;
      const p = items[i - 1];
      if ((it.mine || it.you) && p && p.u && p.u.kind === "text" && !p.you && /\?\s*$/.test(p.u.text)) p.q = true;
    });
    const blocks = [];
    let group = null;
    for (const it of items) {
      if (it.mine || it.you || it.q || it.fin) {
        group = null;
        blocks.push(it);
      } else {
        if (!group) blocks.push((group = { steps: [], key: String(it.order) }));
        group.steps.push(it);
      }
    }
    const live = t.status === "running";
    if (!blocks.length && !live && t.status !== "queued") return null;

    const sec = el("div", "rtcb-sec rtcb-sec--agent");
    const h = el("div", "rtcb-sec-h");
    h.innerHTML = claudeSvg(11); // constant markup
    h.append(el("span", null, "Agent"));
    // the chat's model, here when the header has no room for it (a popover
    // over the composer: its actions are there)
    const mtxt = [t.model, t.effort].filter(Boolean).join(" · ");
    if (mtxt) h.append(el("span", "rtcb-sec-model", mtxt));
    sec.append(h);
    if (!blocks.length) {
      sec.append(el("p", `rtcb-idle${live ? " rtcb-idle--live" : ""}`, live ? "Working on it…" : "Waiting for Claude to pick this up."));
      return sec;
    }
    const shotList = updates.filter((u) => u.kind === "screenshot").map((u, i) => ({ img: u.img, label: `Step ${i + 1}` }));
    const expanded = openSteps.get(t.id) || new Set();
    const list = el("div", "rtcb-tl");
    blocks.forEach((b, bi) => {
      const isLast = bi === blocks.length - 1;
      if (b.steps) {
        const open = expanded.has(b.key);
        const wrap = el("div", "rtcb-steps");
        wrap.dataset.open = open ? "true" : "false";
        const toggle = button("rtcb-steps-b", null);
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        const chev = el("span", "rtcb-chev");
        chev.innerHTML = ICON.chev; // constant markup
        const n = b.steps.length;
        const lastStep = b.steps[n - 1].u;
        toggle.append(chev, el("span", "rtcb-steps-n", `${n} step${n === 1 ? "" : "s"}`));
        if (!open) toggle.append(el("span", `rtcb-steps-last${live && isLast ? " rtcb-idle--live" : ""}`, lastStep.kind === "text" ? clip(lastStep.text, 160) : "Screenshot"));
        toggle.addEventListener("click", () => {
          const s = openSteps.get(t.id) || new Set();
          if (s.has(b.key)) s.delete(b.key);
          else s.add(b.key);
          openSteps.set(t.id, s);
          renderPanel(true);
        });
        wrap.append(toggle);
        if (open) {
          // every step whole, as the agent wrote it
          const ol = el("ol", "rtcb-feed");
          for (const it of b.steps) {
            const li = el("li", "rtcb-u");
            if (it.u.kind === "screenshot") {
              li.classList.add("rtcb-u--shot");
              const k = shotList.findIndex((s) => s.img === it.u.img);
              li.append(thumb(it.u.img, shotList[k].label, shotList, k, "rtcb-thumb--feed"), agoEl(it.u.at));
            } else {
              li.classList.add("rtcb-u--step");
              const tx = el("div", "rtcb-u-t rtcb-md");
              tx.append(md(it.u.text));
              li.append(tx, agoEl(it.u.at));
            }
            ol.append(li);
          }
          wrap.append(ol);
        }
        list.append(wrap);
      } else if (b.fin) {
        list.append(sayBlock(t, b.u, live && isLast));
      } else if (b.mine || b.you) {
        const m = b.mine || { text: b.u.text, at: b.u.at, state: "sent" };
        const li = el("div", "rtcb-msgb rtcb-msgb--you");
        li.append(el("p", null, m.text));
        const meta = el("div", "rtcb-u-meta");
        if (m.state === "sending") meta.append(el("span", null, "Sending…"));
        else if (m.state === "failed") {
          meta.append(el("span", "rtcb-u-err", "Not sent"));
          const retry = button("rtcb-link", null);
          retry.textContent = "Retry";
          retry.addEventListener("click", () => {
            e.mine.splice(e.mine.indexOf(b.mine), 1);
            sendReply(b.mine.text);
          });
          meta.append(retry);
        } else meta.append(el("span", null, "You"), agoEl(m.at));
        li.append(meta);
        list.append(li);
      } else {
        const li = el("div", "rtcb-msgb rtcb-msgb--q");
        const p = el("div", "rtcb-md");
        p.append(md(b.u.text));
        li.append(p);
        const meta = el("div", "rtcb-u-meta");
        meta.append(el("span", null, "Claude asked"), agoEl(b.u.at));
        li.append(meta);
        list.append(li);
      }
    });
    sec.append(list);
    return sec;
  }

  // The agent's last message (its answer; while it works, its latest word):
  // the last text that is not the designer's own. None while it waits for an
  // answer (the question on top is its last word).
  function finalOf(t, q) {
    if (q) return null;
    for (let i = t.updates.length - 1; i >= 0; i--) {
      const u = t.updates[i];
      if (u.kind === "text" && !u.user) return u;
    }
    return null;
  }
  // two texts that say the same (the summary is the last message, cut)
  const sameText = (a, b) => {
    const k = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 120);
    return !!a && !!b && (k(a) === k(b) || k(a).startsWith(k(b)) || k(b).startsWith(k(a)));
  };
  // One message of the agent, whole: Markdown, at most 6 lines until "Show
  // more" (in place, under it; measured in renderPanel), then its time. A
  // click on the text selects it, nothing else (no focus ring).
  const sayOpen = new Set(); // "<task id>:<time>" shown whole
  function sayBlock(t, u, live) {
    const key = `${t.id}:${u.at || ""}`;
    const open = sayOpen.has(key);
    const box = el("div", "rtcb-say");
    const body = el("div", "rtcb-md rtcb-say-t");
    body.append(md(u.text));
    body.dataset.clamp = open ? "false" : "true";
    const meta = el("div", "rtcb-say-meta");
    const more = button("rtcb-link rtcb-say-more", null);
    more.textContent = open ? "Show less" : "Show more";
    more.hidden = true;
    more.addEventListener("click", () => {
      if (sayOpen.has(key)) sayOpen.delete(key);
      else sayOpen.add(key);
      renderPanel(true);
    });
    if (live) meta.append(el("span", "rtcb-idle--live", "Working…"));
    meta.append(more, el("span", "rtcb-grow"), agoEl(u.at));
    box.append(body, meta);
    return box;
  }

  // A small, safe Markdown subset for the agent's words: paragraphs, line
  // breaks, "-" / "*" / "1." lists, "#" headings (bold), fenced code,
  // `code`, **bold**, *italic*, [links](…) as their text. Text nodes only:
  // nothing of the message ever goes through innerHTML.
  function md(text) {
    const out = document.createDocumentFragment();
    let paragraph = null;
    let list = null;
    let code = null;
    for (const line of String(text || "").replace(/\r\n?/g, "\n").split("\n")) {
      if (code) {
        if (/^\s*```/.test(line)) code = null;
        else code.textContent += (code.textContent ? "\n" : "") + line;
        continue;
      }
      if (/^\s*```/.test(line)) {
        paragraph = list = null;
        const pre = el("pre", "rtcb-md-pre");
        pre.append((code = el("code")));
        out.append(pre);
        continue;
      }
      if (!line.trim()) {
        paragraph = list = null;
        continue;
      }
      const li = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(line);
      if (li) {
        const ordered = !!li[1];
        if (!list || (list.tagName === "OL") !== ordered) {
          paragraph = null;
          list = el(ordered ? "ol" : "ul", "rtcb-md-list");
          if (ordered && li[1] !== "1") list.start = Number(li[1]);
          out.append(list);
        }
        const item = el("li");
        mdInline(item, li[2]);
        list.append(item);
        continue;
      }
      if (list && /^\s{2,}\S/.test(line)) {
        // a list item's next line
        list.lastElementChild.append(" ");
        mdInline(list.lastElementChild, line.trim());
        continue;
      }
      list = null;
      const hd = /^\s*#{1,6}\s+(.*)$/.exec(line);
      if (hd) {
        paragraph = null;
        const p = el("p", "rtcb-md-h");
        mdInline(p, hd[1]);
        out.append(p);
        continue;
      }
      if (paragraph) paragraph.append(el("br"));
      else out.append((paragraph = el("p")));
      mdInline(paragraph, line);
    }
    return out;
  }
  function mdInline(parent, s) {
    const re = /`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|\*([^*\s](?:[^*]*[^*\s])?)\*|\[([^\]]+)\]\([^)\s]+\)/g;
    let at = 0;
    let m;
    while ((m = re.exec(s))) {
      if (m.index > at) parent.append(s.slice(at, m.index));
      if (m[1] != null) parent.append(el("code", "rtcb-md-code", m[1]));
      else if (m[2] != null || m[3] != null) {
        const b = el("strong");
        mdInline(b, m[2] ?? m[3]);
        parent.append(b);
      } else if (m[4] != null) parent.append(el("em", null, m[4]));
      else parent.append(m[5]);
      at = re.lastIndex;
    }
    if (at < s.length) parent.append(s.slice(at));
  }

  // fin: the agent's last message (shown in the timeline); failText: what
  // the failure card says (that last message when it is the reason)
  function resultSection(e, fin, failText) {
    const t = e.task;
    const parts = [];
    if (t.status === "failed") {
      const f = el("div", "rtcb-fail");
      const fh = el("div", "rtcb-fail-h");
      fh.innerHTML = ICON.bang; // constant markup
      fh.append(el("span", null, "Claude couldn't finish this"));
      const why = el("div", "rtcb-md rtcb-fail-t");
      why.append(md(failText || t.error || "Open the chat to see what happened."));
      f.append(fh, why);
      parts.push(f);
    }
    // before / after / GIF in one carousel, then the summary; a Before alone
    // (a run that failed early) is already the "You asked" thumbnail: not
    // twice, nor big
    const onlyBefore = !!t.before && !t.after && !t.gif && !(t.frames && t.frames.length > 1);
    const car = onlyBefore ? null : carousel(e);
    if (car) parts.push(car);
    // Why a capture is missing, until it shows up.
    for (const u of t.updates) {
      if (u.kind !== "note" || (u.shot === "gif" ? t.gif : u.shot && t[u.shot])) continue;
      const n = el("p", "rtcb-note");
      n.innerHTML = ICON.info; // constant markup
      n.append(el("span", null, u.text));
      parts.push(n);
    }
    // the summary is the last message, already whole in the timeline: not twice
    if (t.status === "done" && !(fin && (!t.summary || sameText(fin.text, t.summary)))) {
      const s = el("div", "rtcb-sum");
      const sh = el("div", "rtcb-sum-h");
      sh.innerHTML = ICON.check; // constant markup
      sh.append(el("span", null, "Done"));
      // 3 lines, the rest on "Show more"
      const open = sumOpen.has(t.id);
      s.dataset.open = open ? "true" : "false";
      const more = button("rtcb-link rtcb-sum-more", null);
      more.textContent = open ? "Show less" : "Show more";
      more.hidden = true; // shown when the text is clamped (measured after render)
      more.addEventListener("click", () => {
        if (sumOpen.has(t.id)) sumOpen.delete(t.id);
        else sumOpen.add(t.id);
        renderPanel(true);
      });
      const st = el("div", "rtcb-md rtcb-sum-t");
      st.append(md(t.summary || "Claude finished this request. Open the chat to review the changes."));
      s.append(sh, st, more);
      parts.push(s);
    }
    if (!parts.length) return null;
    const sec = el("div", "rtcb-sec rtcb-sec--result");
    sec.append(el("div", "rtcb-sec-h", TERMINAL.has(t.status) ? "Result" : "Preview"), ...parts);
    return sec;
  }

  // ------------------------------------------------------------ GIF player
  // id -> playing; default: playing, paused under prefers-reduced-motion.
  const gifPlay = new Map();
  const playingOf = (id) => (gifPlay.has(id) ? gifPlay.get(id) : !reducedMotion());
  // The still shown while paused: the after, else the last key frame, the
  // before; none -> the GIF's first frame (drawn in a canvas).
  const stillOf = (t) => t.after || t.frames[t.frames.length - 1] || t.before || null;
  function firstFrame(url, im) {
    const g = new Image();
    g.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = g.naturalWidth;
        c.height = g.naturalHeight;
        c.getContext("2d").drawImage(g, 0, 0);
        im.src = c.toDataURL("image/png");
      } catch (e) {
        note("still", e);
      }
    };
    g.src = url;
  }
  function gifBlob(url) {
    if (/^blob:/i.test(url)) return null;
    const bin = atob(url.slice(url.indexOf(",") + 1));
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: "image/gif" });
  }
  function pngOf(url) {
    return new Promise((res, rej) => {
      const g = new Image();
      g.onload = () => {
        const c = document.createElement("canvas");
        c.width = g.naturalWidth;
        c.height = g.naturalHeight;
        c.getContext("2d").drawImage(g, 0, 0);
        c.toBlob((b) => (b ? res(b) : rej(new Error("no png"))), "image/png");
      };
      g.onerror = () => rej(new Error("still failed to load"));
      g.src = url;
    });
  }
  const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  function flash(msg, text) {
    msg.textContent = text;
    clearTimeout(msg._t);
    msg._t = setTimeout(() => (msg.textContent = ""), 2400);
  }
  // Copy: the GIF itself where the clipboard takes image/gif; else the GIF as
  // HTML (rich text editors keep the animation) plus a still PNG (apps that
  // only take images get a frame).
  async function copyGif(t, msg) {
    const g = t.gif;
    const cb = navigator.clipboard;
    if (!cb || typeof cb.write !== "function" || typeof ClipboardItem !== "function") return flash(msg, "Can't copy here");
    const gifOk = typeof ClipboardItem.supports === "function" ? ClipboardItem.supports("image/gif") : false;
    try {
      if (gifOk) {
        await cb.write([new ClipboardItem({ "image/gif": gifBlob(g.dataUrl) })]);
        lastCopy = "image/gif";
        return flash(msg, "GIF copied");
      }
    } catch (e) {
      note("copy-gif", e);
    }
    try {
      const still = stillOf(t);
      await cb.write([
        new ClipboardItem({
          "text/html": new Blob([`<img src="${g.dataUrl}" alt="${clip(t.text, 60).replace(/[<>&"]/g, "")}">`], { type: "text/html" }),
          "image/png": pngOf(still ? still.dataUrl : g.dataUrl),
        }),
      ]);
      lastCopy = "text/html+image/png";
      flash(msg, "Copied: the GIF for docs and chats, a still for image apps");
    } catch (e) {
      note("copy", e);
      lastCopy = `error: ${(e && e.message) || e}`;
      flash(msg, "Couldn't copy");
    }
  }
  let lastCopy = null;
  function gifPlayer(e) {
    const t = e.task;
    const g = t.gif;
    const wrap = el("div", "rtcb-gif");
    const view = button("rtcb-thumb rtcb-gif-view", "Enlarge the GIF");
    if (g.w && g.h) view.style.setProperty("--rtcb-ar", `${g.w} / ${g.h}`);
    const im = el("img");
    im.alt = "GIF of the run";
    im.decoding = "async";
    view.append(im, el("span", "rtcb-thumb-tag", "GIF"));
    const bar = el("div", "rtcb-gif-bar");
    const play = button("rtcb-btn rtcb-gif-play", null);
    const copy = button("rtcb-btn rtcb-gif-copy", null);
    copy.textContent = "Copy";
    copy.title = "Copy the GIF";
    const meta = el("span", "rtcb-gif-meta", [g.frames ? `${g.frames} frames` : null, g.bytes ? kb(g.bytes) : null].filter(Boolean).join(" · "));
    const msg = el("span", "rtcb-gif-msg");
    msg.setAttribute("role", "status");
    bar.append(play, copy, el("span", "rtcb-grow"), meta);
    const paint = () => {
      const on = playingOf(t.id);
      const still = stillOf(t);
      if (on) im.src = g.dataUrl; // setting the src again restarts it
      else if (still) im.src = still.dataUrl;
      else firstFrame(g.dataUrl, im);
      wrap.dataset.playing = on ? "true" : "false";
      play.innerHTML = on ? ICON.pause : ICON.play; // constant markup
      play.append(el("span", null, "GIF"));
      play.setAttribute("aria-pressed", on ? "true" : "false");
      play.setAttribute("aria-label", on ? "Pause the GIF" : "Play the GIF");
      play.title = on ? "Pause" : "Play";
    };
    play.addEventListener("click", () => {
      gifPlay.set(t.id, !playingOf(t.id));
      paint();
    });
    view.addEventListener("click", () => {
      const list = mediaList(t).filter((x) => x.label !== "GIF");
      const on = playingOf(t.id);
      const still = stillOf(t);
      list.push({ img: { dataUrl: on || !still ? g.dataUrl : still.dataUrl, w: g.w, h: g.h }, label: on || !still ? "GIF" : "GIF (paused)" });
      openLightbox(list, list.length - 1, t);
    });
    copy.addEventListener("click", () => copyGif(t, msg));
    paint();
    wrap.append(view, bar, msg);
    return wrap;
  }
  // ------------------------------------------------------------- carousel
  // The result's media in one place, one slide at a time: "Side by side"
  // (when both shots exist; the default), Before, After, GIF (or the key
  // frames when there is no GIF). Arrows, dots and ←/→ (focus or pointer in
  // the panel); Shift peeks at Before, "/" flips Before / After. Each slide is
  // 200 px tall, the image contained; a click enlarges it with all of them.
  // The GIF slide has its play / pause and Copy under it.
  const carIdx = new Map(); // id -> slide index (reset when the panel opens)
  function slidesOf(t) {
    const S = [];
    if (svPlan(t)) S.push({ key: "result", label: "Result", sv: true });
    else {
      if (t.before) S.push({ key: "before", label: "Before", imgs: [{ img: t.before, label: "Before" }] });
      if (t.after) S.push({ key: "after", label: "After", imgs: [{ img: t.after, label: "After" }] });
    }
    if (t.gif) S.push({ key: "gif", label: "GIF", gif: true });
    else if (t.frames.length > 1) {
      const names = t.frames.length === 3 ? ["Start", "Middle", "End"] : ["Start", "End"];
      t.frames.forEach((f, i) => S.push({ key: `frame${i}`, label: names[i] || `Frame ${i + 1}`, imgs: [{ img: f, label: names[i] || `Frame ${i + 1}` }] }));
    }
    return S;
  }
  function carousel(e) {
    const t = e.task;
    const S = slidesOf(t);
    if (!S.length) return null;
    const wrap = el("div", "rtcb-car");
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-roledescription", "carousel");
    wrap.setAttribute("aria-label", "Screenshots of the result");
    // a div: the "Result" slide has its own controls (a press compares)
    const stage = el("div", "rtcb-car-stage");
    stage.addEventListener("keydown", (ev) => {
      if ((ev.key === "Enter" || ev.key === " ") && ev.target === stage) {
        ev.preventDefault();
        stage.click();
      }
    });
    const nav = el("div", "rtcb-car-nav");
    const prev = button("rtcb-car-arrow", "Previous", ICON.chevL);
    const next = button("rtcb-car-arrow", "Next", ICON.chev);
    const dots = el("div", "rtcb-car-dots");
    dots.setAttribute("role", "tablist");
    dots.setAttribute("aria-label", "Slides");
    const name = el("span", "rtcb-car-name");
    const gifCtl = el("span", "rtcb-car-gif");
    const play = button("rtcb-btn rtcb-gif-play", null);
    const copy = button("rtcb-btn rtcb-gif-copy", null);
    copy.textContent = "Copy";
    copy.title = "Copy the GIF";
    gifCtl.append(play, copy);
    const msg = el("span", "rtcb-gif-msg");
    msg.setAttribute("role", "status");
    const dotBtns = S.map((sl, k) => {
      const d = button("rtcb-car-dot", sl.label);
      d.setAttribute("role", "tab");
      d.title = sl.label;
      d.addEventListener("click", () => show(k));
      dots.append(d);
      return d;
    });
    nav.append(prev, dots, next, name, el("span", "rtcb-grow"), gifCtl);
    wrap.append(stage, nav, msg);
    // the enlarged view: every slide, in order
    const lbList = mediaList(t);
    const lbOpen = (label) => openLightbox(lbList, Math.max(0, lbList.findIndex((x) => x.label === label)), t);
    let sv = null; // the "Result" slide's compare view
    const figure = (img, label, gif) => {
      const f = el("span", "rtcb-car-fig");
      const im = el("img");
      im.alt = `${label} screenshot`;
      im.decoding = "async";
      if (gif) {
        const on = playingOf(t.id);
        const still = stillOf(t);
        if (on || !still) im.src = t.gif.dataUrl;
        else im.src = still.dataUrl;
        if (!on && !still) firstFrame(t.gif.dataUrl, im);
      } else im.src = img.dataUrl;
      f.append(im, el("span", "rtcb-thumb-tag", label));
      return f;
    };
    let i = carIdx.has(t.id) ? Math.min(carIdx.get(t.id), S.length - 1) : Math.max(0, S.findIndex((x) => x.key === "result" || x.key === "after"));
    let peekFrom = null;
    const show = (k) => {
      i = (k + S.length) % S.length;
      if (peekFrom == null) carIdx.set(t.id, i);
      const sl = S[i];
      if (sv) (sv.destroy(), (sv = null));
      stage.textContent = "";
      stage.dataset.slide = sl.key;
      stage.setAttribute("aria-label", `Enlarge: ${sl.label}`);
      if (sl.sv) {
        // it replays while the pointer is on it; a click enlarges
        sv = shotView(t, { mode: "panel", hover: true, focusable: true, onOpen: () => lbOpen("Result") });
        stage.append(sv.el);
      } else if (sl.gif) stage.append(figure(null, "GIF", true));
      else for (const x of sl.imgs) stage.append(figure(x.img, x.label));
      stage.dataset.sv = sl.sv ? "true" : "false";
      if (sl.sv) (stage.removeAttribute("tabindex"), stage.removeAttribute("role"));
      else (stage.tabIndex = 0), stage.setAttribute("role", "button");
      name.textContent = sl.label;
      dotBtns.forEach((d, j) => d.setAttribute("aria-selected", j === i ? "true" : "false"));
      gifCtl.hidden = !sl.gif;
      if (sl.gif) {
        const on = playingOf(t.id);
        play.innerHTML = on ? ICON.pause : ICON.play; // constant markup
        play.append(el("span", null, "GIF"));
        play.setAttribute("aria-pressed", on ? "true" : "false");
        play.setAttribute("aria-label", on ? "Pause the GIF" : "Play the GIF");
      }
      wrap.dataset.slide = sl.key;
    };
    prev.addEventListener("click", () => show(i - 1));
    next.addEventListener("click", () => show(i + 1));
    play.addEventListener("click", () => {
      gifPlay.set(t.id, !playingOf(t.id));
      show(i);
    });
    copy.addEventListener("click", () => copyGif(t, msg));
    stage.addEventListener("click", () => {
      const sl = S[i];
      if (sl.sv) return; // its own click (a press compares)
      lbOpen(sl.gif ? "GIF" : sl.imgs[0].label);
    });
    prev.hidden = next.hidden = dots.hidden = S.length < 2;
    // one slide: its tag on the image is its name (no second label under it)
    name.hidden = S.length < 2 && !S[0].gif;
    nav.hidden = S.length < 2 && !S[0].gif;
    P.car = {
      key: () => S[i].key,
      slides: () => S.map((x) => x.label),
      index: () => i,
      step: (d) => show(i + d),
      sv: () => sv,
      flip() {
        if (sv) return sv.toggle();
        const b = S.findIndex((x) => x.key === "before");
        const a = S.findIndex((x) => x.key === "after");
        if (b < 0 || a < 0) return false;
        show(S[i].key === "before" ? a : b);
        return true;
      },
      peek(on) {
        if (sv) return void sv.peek(on);
        const b = S.findIndex((x) => x.key === "before");
        if (b < 0) return;
        if (on && peekFrom == null) {
          peekFrom = i;
          show(b);
        } else if (!on && peekFrom != null) {
          const back = peekFrom;
          peekFrom = null;
          show(back);
        }
      },
    };
    show(i);
    return wrap;
  }


  // ------------------------------------------- the agent's replies in threads
  // "<text>\n\n· task <id> · <model> · <effort>" (model/effort optional).
  const AG_MARK = /(?:^|\s)·\s*task\s+([tch]:[\w:.-]+)(?:\s*·\s*([^·\n]+?))?(?:\s*·\s*([^·\n]+?))?\s*$/;
  const AG_MSG = '[data-testid="comment-message"]';
  const agMsgs = new Map(); // message element -> { sig, card }
  let agRaf = 0;
  function agText(msg) {
    const n = [...msg.querySelectorAll(".whitespace-pre-wrap")].find((x) => !x.closest(".rtcb-ag"));
    return n ? n.textContent || "" : "";
  }
  function agUnmark(msg) {
    const rec = agMsgs.get(msg);
    if (rec && rec.card) (svDrop(rec.card), rec.card.remove());
    agMsgs.delete(msg);
    msg.removeAttribute("data-rtcb-agent");
    msg.removeAttribute("data-rtcb-media");
  }
  function agUnmarkAll() {
    cancelAnimationFrame(agRaf);
    agRaf = 0;
    for (const msg of [...agMsgs.keys()]) agUnmark(msg);
    for (const msg of document.querySelectorAll("[data-rtcb-agent]")) agUnmark(msg);
  }
  function agCard(msg, mark, voice, e) {
    const t = e ? e.task : null;
    const model = (t && t.model) || (mark[2] || "").trim() || null;
    const effort = (t && t.effort) || (mark[3] || "").trim() || null;
    const card = el("div", "rtcb-ag");
    const h = el("div", "rtcb-ag-h");
    const av = el("span", "rtcb-ag-av");
    av.innerHTML = claudeSvg(14); // constant markup
    av.setAttribute("aria-hidden", "true");
    h.append(av, el("b", "rtcb-ag-name", "Claude"));
    const mt = [model, effort].filter(Boolean).join(" · ");
    if (mt) {
      const chip = el("span", "rtcb-model rtcb-ag-chip");
      chip.append(el("span", "rtcb-model-t", mt));
      chip.title = `Model ${model || "unknown"} · effort ${effort || "unknown"}`;
      h.append(chip);
    }
    const ts = msg.querySelector('[data-testid="comment-message-timestamp"]');
    if (ts) {
      const tm = el("span", "rtcb-ag-time", ts.textContent);
      if (ts.title) tm.title = ts.title;
      h.append(tm);
    }
    const b = el("div", "rtcb-ag-b");
    b.append(el("p", "rtcb-ag-text", voice || "Done: the details are in the chat."));
    if (t) {
      // the result: the compare view (replays under the pointer, a click
      // enlarges); without an after, the shots as before
      const sv = shotView(t, { mode: "thread", maxH: 220, hover: true, focusable: true, onOpen: () => openResult(t) });
      const shots = sv ? [] : beforeAfter(t);
      if (sv) b.append(sv.el);
      else if (shots.length) {
        const grid = el("div", "rtcb-ag-cmp");
        shots.forEach((s, i) => grid.append(thumb(s.img, s.label, shots, i)));
        b.append(grid);
      }
      if (t.gif) b.append(gifPlayer(e));
      {
        const open = button("rtcb-btn rtcb-open rtcb-ag-open", null);
        open.innerHTML = ICON.open; // constant markup
        open.append(el("span", null, "Show agent"));
        open.addEventListener("click", (ev) => {
          ev.stopPropagation();
          openPanel(t.id);
        });
        b.append(open);
      }
    }
    card.append(h, b);
    return card;
  }
  function agScan() {
    agRaf = 0;
    if (disposed || !enabled()) return;
    const seen = new Set();
    for (const msg of document.querySelectorAll(AG_MSG)) {
      if (msg.closest(".rtcb-ag")) continue;
      const text = agText(msg);
      const mark = text ? AG_MARK.exec(text) : null;
      if (!mark) {
        if (msg.hasAttribute("data-rtcb-agent") || agMsgs.has(msg)) agUnmark(msg);
        continue;
      }
      seen.add(msg);
      const voice = text.slice(0, mark.index).trim();
      const e = cache.get(mark[1]) || null;
      const ts = msg.querySelector('[data-testid="comment-message-timestamp"]');
      const sig = JSON.stringify([mark[0], voice, e ? sigOf(e.task) : null, e && e.n, ts && ts.textContent, has("openChat")]);
      const rec = agMsgs.get(msg);
      if (rec && rec.sig === sig && rec.card.parentNode === msg) continue;
      if (rec && rec.card) (svDrop(rec.card), rec.card.remove());
      const card = agCard(msg, mark, voice, e);
      const own = !!(e && (e.task.before || e.task.after || e.task.gif || e.task.replay));
      msg.setAttribute("data-rtcb-agent", mark[1]);
      msg.setAttribute("data-rtcb-media", own ? "own" : "native");
      msg.appendChild(card);
      agMsgs.set(msg, { sig, card });
    }
    for (const msg of [...agMsgs.keys()]) if (!seen.has(msg)) agUnmark(msg);
  }

  function renderPanel(force) {
    if (!panel || !openId) return;
    const e = cache.get(openId);
    if (!e) return void closePanel(false);
    const t = e.task;
    P.htime.textContent = P.htime.title = headTime(e);
    for (const n of panel.querySelectorAll("[data-rtcb-ago]")) n.textContent = ago(Number(n.dataset.rtcbAgo));
    const sig = JSON.stringify([t.id, e.n, sigOf(t), e.mine.map((m) => m.state + m.text), panel.dataset.narrow, has("reply"), has("openChat"), has("dismiss"), !!stopFn()]);
    if (!force && sig === panelSig) return;
    const first = !panelSig || panel.dataset.id !== t.id;
    panelSig = sig;
    panel.dataset.id = t.id;
    panel.dataset.status = t.status;
    P.numEl.textContent = `#${e.n}`;
    const mtxt = [t.model, t.effort].filter(Boolean).join(" · ");
    P.model.hidden = !mtxt;
    P.model.textContent = "";
    if (mtxt) {
      P.model.innerHTML = claudeSvg(11); // constant markup
      P.model.append(el("span", "rtcb-model-t", mtxt));
      P.model.title = `Model ${t.model || "unknown"} · effort ${t.effort || "unknown"}`;
      P.model.setAttribute("aria-label", `Model ${t.model || "unknown"}, effort ${t.effort || "unknown"}`);
    }
    P.chipLabel.textContent = stoppedOf(t) ? "Stopped by you" : LABEL[t.status];
    P.chipIco.innerHTML = BADGE[t.status] ? (t.status === "running" ? claudeSvg(11) : BADGE[t.status]()) : "";

    // Keep focus and caret in the reply field while the body is rebuilt.
    const typing = document.activeElement === P.ta;
    const sel = typing ? [P.ta.selectionStart, P.ta.selectionEnd] : null;
    const body = P.body;
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 24;
    const keepTop = body.scrollTop;
    P.car = null;
    svDrop(body);
    body.textContent = "";
    const q = questionOf(t);
    let card = null;
    if (q) body.append((card = askCard(q)));
    body.append(requestSection(e));
    // the agent's last message, whole; a failure it explains is said once,
    // in the failure card
    let fin = finalOf(t, q);
    let failText = t.error;
    let inFail = null;
    if (t.status === "failed" && fin && (!t.error || sameText(fin.text, t.error))) (failText = fin.text), (inFail = fin), (fin = null);
    const tl = timelineSection(e, q, fin, inFail);
    if (tl) body.append(tl);
    const res = resultSection(e, fin, failText);
    if (res) body.append(res);

    const replyOk = has("reply");
    if (card) card.append(P.box);
    else if (P.box.parentNode !== P.foot) P.foot.insertBefore(P.box, P.row.parentNode === P.foot ? P.row : null);
    panel.dataset.replyIn = card ? "card" : "foot";
    P.ta.disabled = !replyOk;
    P.ta.placeholder = replyOk ? (card ? "Answer Claude…" : "Reply to the agent…") : "Replies go through the chat";
    P.hint.textContent = replyOk && !card ? "Enter to send" : "";
    P.dismissBtn.hidden = !(TERMINAL.has(t.status) && has("dismiss"));
    P.stopBtn.hidden = TERMINAL.has(t.status) || !stopFn();
    const fol = followId === t.id;
    P.followBtn.hidden = TERMINAL.has(t.status) && !fol;
    P.followBtn.textContent = fol ? "Following" : "Follow";
    P.followBtn.setAttribute("aria-pressed", fol ? "true" : "false");
    P.followBtn.title = fol ? "Stop following this agent" : "Follow this agent on the canvas (⌥-click its bubble)";
    autosize();
    if (typing && !P.ta.disabled) {
      P.ta.focus({ preventScroll: true });
      try {
        P.ta.setSelectionRange(sel[0], sel[1]);
      } catch (_) {}
    }
    measureMore(body, t.id);
    if (!first) markReply(); // (the open itself marks it in its next frame)
    if (first) body.scrollTop = 0;
    else body.scrollTop = atBottom ? body.scrollHeight : keepTop;
    if (panel.dataset.inline === "true") fadeSoon(body);
  }

  // "Show more" only where the lines cut the text (the summary, the agent's
  // message): read in the next frame, with the layout the frame needs anyway
  // (never a forced layout in the middle of a render), before it paints
  let moreRaf = 0;
  // the popover's rect, read where a frame reads the layout anyway: its copy
  // (ghostOf) never forces one in the middle of the card opening
  let popRect = null;
  function measureMore(body, id) {
    cancelAnimationFrame(moreRaf);
    moreRaf = requestAnimationFrame(() => {
      moreRaf = 0;
      if (!body.isConnected) return;
      popRect = null;
      const op = panel && panel.dataset.anchor === "bubble" ? panel.offsetParent : null;
      if (op) {
        // its laid-out box (its entrance's scale left out)
        const o = op.getBoundingClientRect();
        popRect = { left: o.left + panel.offsetLeft, top: o.top + panel.offsetTop, width: panel.offsetWidth, height: panel.offsetHeight, scroll: P.body.scrollTop };
      }
      const sumT = body.querySelector(".rtcb-sum-t");
      const sumMore = body.querySelector(".rtcb-sum-more");
      if (sumT && sumMore) sumMore.hidden = !(sumOpen.has(id) || sumT.scrollHeight > sumT.clientHeight + 1);
      for (const say of body.querySelectorAll(".rtcb-say")) {
        const tx = say.querySelector(".rtcb-say-t");
        const more = say.querySelector(".rtcb-say-more");
        const cut = tx.dataset.clamp === "true" && tx.scrollHeight > tx.clientHeight + 1;
        tx.dataset.cut = cut ? "true" : "false";
        more.hidden = !(cut || tx.dataset.clamp === "false");
      }
    });
  }

  // -> Promise<boolean>: the store took the reply
  function sendReply(textArg) {
    const id = openId;
    if (!id) return Promise.resolve(false);
    const e = cache.get(id);
    const text = String(textArg != null ? textArg : P.ta.value).trim();
    if (!e || !text) return Promise.resolve(false);
    const a = agent();
    if (!a || typeof a.reply !== "function") return Promise.resolve(false);
    const item = { at: now(), text, state: "sending" };
    e.mine.push(item);
    if (textArg == null) {
      P.ta.value = "";
      drafts.delete(id);
      autosize();
    }
    renderPanel(true);
    P.body.scrollTop = P.body.scrollHeight;
    let res;
    try {
      res = a.reply(id, text);
    } catch (err) {
      note("reply", err);
      res = Promise.reject(err);
    }
    return Promise.resolve(res).then(
      (r) => {
        item.state = r === false ? "failed" : "sent";
        persistSoon();
        if (openId === id) renderPanel(true);
        return r !== false;
      },
      (err) => {
        note("reply", err);
        item.state = "failed";
        if (openId === id) renderPanel(true);
        return false;
      },
    );
  }

  // -------------------------------------------------------------- lightbox
  let lb = null; // { el, list, i, show, peekFrom, sv }
  // A task's result, enlarged: the compare view (replaying), then its GIF.
  function openResult(t) {
    hideTip();
    const list = mediaList(t);
    if (list.length) openLightbox(list, 0, t);
  }
  // list: [{img, label}] or {sv: true, label} (the task's compare view, big:
  // it replays on its own, hold / drag / Shift / "/" compare, "Replay" plays
  // it again).
  function openLightbox(list, index, task) {
    closeLightbox();
    const node = el("div", "rtcb-lb");
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-modal", "true");
    node.setAttribute("aria-label", "Screenshot");
    node.tabIndex = -1;
    const fig = el("figure", "rtcb-lb-fig");
    const img = el("img");
    const bar = el("figcaption", "rtcb-lb-bar");
    const seg = el("div", "rtcb-seg");
    const x = button("rtcb-x rtcb-lb-x", "Close", ICON.close);
    const again = button("rtcb-btn rtcb-lb-replay", "Play the replay again", ICON.history);
    again.append(el("span", null, "Replay"));
    const hint = el("span", "rtcb-lb-hint", "Hold or drag on it to compare · Shift: before · /: pin");
    const state = { el: node, list, i: index, peekFrom: null, sv: null };
    state.show = () => {
      const it = list[state.i];
      if (state.sv) (state.sv.destroy(), state.sv.el.remove(), (state.sv = null));
      const sv = it.sv && task ? shotView(task, { mode: "lb", autoplay: true, hint: false }) : null;
      if (sv) {
        state.sv = sv;
        fig.insertBefore(sv.el, img);
        img.hidden = true;
        img.removeAttribute("src");
      } else {
        img.hidden = false;
        img.src = it.img.dataUrl;
        img.alt = `${it.label} screenshot`;
      }
      again.hidden = !(sv && sv.plan.animated && !reducedMotion());
      hint.hidden = !(sv && sv.plan.before);
      seg.querySelectorAll(".rtcb-seg-b").forEach((b, k) => b.setAttribute("aria-checked", k === state.i ? "true" : "false"));
    };
    again.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (!state.sv) return;
      state.sv.rest();
      state.sv.play();
    });
    if (list.length > 1) {
      list.forEach((s, k) => {
        const b = button("rtcb-seg-b", null);
        b.textContent = s.label;
        b.setAttribute("role", "radio");
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          state.i = k;
          state.show();
        });
        seg.append(b);
      });
      bar.append(seg);
    } else bar.append(el("span", "rtcb-lb-label", list[0].label));
    bar.append(again, hint, el("span", "rtcb-grow"), x);
    fig.append(img, bar);
    node.append(fig);
    node.addEventListener("click", (ev) => {
      if (ev.target === node || ev.target === x || x.contains(ev.target)) closeLightbox();
    });
    node.addEventListener("keydown", (ev) => {
      if (list.length < 2 || (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight")) return;
      ev.preventDefault();
      state.i = (state.i + (ev.key === "ArrowRight" ? 1 : list.length - 1)) % list.length;
      state.show();
    });
    state.show();
    lb = state;
    isolate(node);
    node.addEventListener("pointerenter", () => (hoverUI = true));
    node.addEventListener("pointerleave", () => (hoverUI = false));
    const host = hostFor(document.activeElement) || hostFor(null);
    (host || document.body).appendChild(node);
    node.focus({ preventScroll: true });
  }
  function closeLightbox() {
    if (!lb) return false;
    if (lb.sv) lb.sv.destroy();
    lb.el.remove();
    lb = null;
    hoverUI = false;
    if (panel && panel.isConnected) panel.focus({ preventScroll: true });
    return true;
  }

  // --------------------------------------------------------------- manager
  // "Agents" (see the header): every agent of one canvas view, in a panel of
  // that view. hub = { el, col, opener, P (parts), filter, q, active (id),
  // rows: Map(id -> row), listSig, pos, anchor, clock, tipT }.
  let hub = null;
  let hubFilter = null; // the filter chosen last (this session)
  let hubSeq = 0;
  let lastChat = null; // the last chat opened from an avatar (state())
  const SHORT = { queued: "Queued", running: "Working", "needs-input": "Needs you", done: "Done", failed: "Failed" };
  const HUB_TABS = [
    ["active", "Active"],
    ["done", "Done"],
    ["all", "All"],
  ];
  const isActive = (st) => !TERMINAL.has(st);
  // The store's way to stop an agent (canvas-comment-agent's stop(id) ->
  // Promise<boolean>; cancel / abort tolerated), when it has one; a stopped
  // task comes back "failed" with stoppedAt set.
  function stopFn() {
    const a = agent();
    if (!a) return null;
    for (const k of ["stop", "cancel", "abort"])
      if (typeof a[k] === "function")
        return (id) => {
          try {
            return Promise.resolve(a[k](id)).catch((e) => note("stop", e));
          } catch (e) {
            note("stop", e);
            return Promise.resolve(false);
          }
        };
    return null;
  }
  function stopAllOf(ids) {
    const a = agent();
    if (a && typeof a.stopAll === "function" && ids.length)
      try {
        return Promise.resolve(a.stopAll()).catch((e) => note("stopAll", e));
      } catch (e) {
        note("stopAll", e);
      }
    const f = stopFn();
    return f ? Promise.all(ids.map((id) => f(id))) : Promise.resolve(0);
  }
  const NO_STOP = "Stop isn't available: the agent pipeline can't stop a run yet";
  const stoppedOf = (t) => t.status === "failed" && !!t.stoppedAt;
  // elapsed while it works, its duration once finished
  function hubTime(t) {
    const tn = now();
    if (t.status === "queued") return fmtDur(tn - t.createdAt);
    if (isActive(t.status)) return fmtDur(tn - (t.startedAt || t.createdAt));
    return fmtDur(Math.max(0, (t.finishedAt || tn) - (t.startedAt || t.createdAt)));
  }
  function hubCounts(all) {
    const c = { running: 0, waiting: 0, done: 0, failed: 0, stopped: 0 };
    for (const e of all) {
      const st = e.task.status;
      if (st === "needs-input") c.waiting++;
      else if (st === "done") c.done++;
      else if (st === "failed") c[stoppedOf(e.task) ? "stopped" : "failed"]++;
      else c.running++;
    }
    return c;
  }
  const hayOf = (e) => [e.task.text, e.task.canvasName, e.task.storyboardName, LABEL[e.task.status], SHORT[e.task.status], `#${e.n}`].filter(Boolean).join("\n").toLowerCase();
  // The rows of the current filter and search: the working ones first
  // (needs-input, working, newest first), then the finished ones, the last
  // finished first.
  function hubList(v) {
    const f = hub.filter;
    const q = hub.q.trim().toLowerCase();
    const endOf = (e) => e.doneAt || e.task.finishedAt || e.task.createdAt;
    return v.all
      .filter((e) => f === "all" || (f === "active") === isActive(e.task.status))
      .filter((e) => !q || hayOf(e).includes(q))
      .sort((a, b) => {
        const A = isActive(a.task.status);
        if (A !== isActive(b.task.status)) return A ? -1 : 1;
        return A ? byPriority(a, b) : endOf(b) - endOf(a) || b.n - a.n;
      });
  }
  // `text` in `node`, the search match marked
  function marked(node, text, q) {
    node.textContent = "";
    const i = q ? text.toLowerCase().indexOf(q) : -1;
    if (i < 0) return void (node.textContent = text);
    const m = el("mark", "rtcb-hub-mark", text.slice(i, i + q.length));
    node.append(text.slice(0, i), m, text.slice(i + q.length));
  }
  function setOpenState(col, on) {
    if (!col) return;
    if (col.root) {
      if (on) col.root.dataset.pop = "true";
      else delete col.root.dataset.pop;
    }
    if (col.manageBtn) col.manageBtn.setAttribute("aria-expanded", on ? "true" : "false");
    if (col.hosted && col.moreBtn) col.moreBtn.setAttribute("aria-expanded", on ? "true" : "false");
    if (col.countEl && col.countEl.hasAttribute("aria-haspopup")) col.countEl.setAttribute("aria-expanded", on ? "true" : "false");
  }
  function toggleHub(col, opener) {
    if (hub && hub.inline) return void focusInline(); // the card's list: there
    if (hub && hub.col === col) closeHub(true);
    else openHub(col, opener);
  }
  // cardHost: canvas-chrome's [data-rtcb-hub-host] in its card: the manager
  // lives there inline (no box of its own, never closed by a click or a key,
  // focused only on request), else a popover over the composer.
  function openHub(col, opener, cardHost) {
    const inline = !!cardHost;
    if (!col || (!inline && (!col.viewEl || !col.viewEl.isConnected))) return false;
    if (!inline) closePanel(false);
    hideTip();
    closeHub(false, true);
    const v = view(col.name);
    const box = el("section", inline ? "rtcb-pop rtcb-hub rtcb-hub--inline" : "rtcb-pop rtcb-hub");
    box.setAttribute("role", inline ? "region" : "dialog");
    box.setAttribute("aria-label", "Agents");
    box.tabIndex = -1;
    box.dataset.view = "list";
    if (inline) box.dataset.narrow = "true";
    // header: "Agents" (inline: "Agents · N"), the counts, the batch actions
    const head = el("header", "rtcb-hub-h");
    const title = el("h2", "rtcb-hub-title", "Agents");
    const nEl = el("span", "rtcb-hub-n");
    title.append(nEl);
    const counts = el("div", "rtcb-hub-counts");
    const stopAll = button("rtcb-hub-act", null);
    stopAll.dataset.act = "stop-all";
    stopAll.textContent = "Stop all";
    const clear = button("rtcb-hub-act", null);
    clear.dataset.act = "clear";
    clear.textContent = "Clear done";
    // inline over a chat with messages: "‹" (or Escape) folds the list back
    // into its one line (the chat shows again)
    const collapse = button("rtcb-hub-collapse", "Back to the chat", ICON.chevL);
    collapse.dataset.tip = "Back to the chat  esc";
    collapse.addEventListener("click", () => expandInline(false));
    head.append(collapse, title, stopAll, clear, counts);
    // filters and search
    const tools = el("div", "rtcb-hub-tools");
    const seg = el("div", "rtcb-hub-seg");
    seg.setAttribute("role", "tablist");
    seg.setAttribute("aria-label", "Show");
    seg.append(el("span", "rtcb-hub-thumb"));
    const tabs = HUB_TABS.map(([k, label]) => {
      const b = button("rtcb-hub-tab", null);
      b.setAttribute("role", "tab");
      b.dataset.k = k;
      b.append(el("span", "rtcb-hub-tab-l", label), el("span", "rtcb-hub-tab-n", ""));
      b.addEventListener("click", () => setHubFilter(k, false));
      seg.append(b);
      return b;
    });
    const search = el("label", "rtcb-hub-search");
    const sIco = el("span", "rtcb-hub-search-ico");
    sIco.innerHTML = ICON.search;
    const input = el("input", "rtcb-hub-q");
    input.type = "text";
    input.placeholder = inline ? "Search agents and chats" : "Search agents";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Search agents");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-autocomplete", "list");
    const qx = button("rtcb-hub-qx", "Clear search", ICON.dismiss);
    qx.hidden = true;
    qx.tabIndex = -1;
    search.append(sIco, input, qx);
    tools.append(seg, search);
    // the rows, the empty state, the keys
    const list = el("ul", "rtcb-hub-list");
    list.id = `rtcb-hub-list-${++hubSeq}`;
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Agents");
    input.setAttribute("aria-controls", list.id);
    const empty = el("div", "rtcb-hub-empty");
    empty.hidden = true;
    const foot = el("footer", "rtcb-hub-foot");
    for (const [k, l] of [
      ["↑↓", "Move"],
      ["↵", "Reply"],
      ["⌥↵", "Follow"],
      ["esc", "Close"],
    ]) {
      const it = el("span", "rtcb-hub-key");
      it.append(el("kbd", null, k), l);
      foot.append(it);
    }
    const tip = el("div", "rtcb-hub-tip");
    tip.setAttribute("role", "tooltip");
    tip.id = `rtcb-hub-tip-${hubSeq}`;
    // inline: an agent's thread (its panel) in place of the list, "‹ Agents" back
    const thread = el("div", "rtcb-hub-thread");
    const backBtn = button("rtcb-hub-back", "Back to the agents");
    backBtn.innerHTML = ICON.chevL;
    backBtn.append(el("span", null, "Agents"));
    backBtn.addEventListener("click", () => closePanel(true));
    const threadSlot = el("div", "rtcb-hub-thread-slot");
    thread.append(backBtn, threadSlot);
    // inline: the one line over a chat with messages ("Agents · N", the
    // agents' mini avatars, "›"): it expands the list over the chat
    const bar = button("rtcb-hub-bar", null);
    bar.setAttribute("aria-expanded", "false");
    const barN = el("span", "rtcb-hub-n");
    const barT = el("span", "rtcb-hub-bar-t", "Agents");
    barT.append(barN);
    const barAvs = el("span", "rtcb-hub-bar-avs");
    barAvs.setAttribute("aria-hidden", "true");
    const barChev = el("span", "rtcb-hub-bar-chev");
    barChev.innerHTML = ICON.chev;
    bar.append(barT, barAvs, barChev);
    bar.addEventListener("click", () => expandInline(true));
    box.append(head, tools, list, empty, foot);
    if (inline) box.append(bar, thread);
    box.append(tip);
    isolate(box);
    // the rows and a thread's body fade at the edges that scroll (no row is
    // ever cut by an edge)
    list.addEventListener("scroll", () => fadeEdges(list), { passive: true });
    hub = {
      el: box,
      col,
      inline,
      cardHost: cardHost || null,
      opener: opener && opener.isConnected ? opener : col.manageBtn,
      host: col.root && col.root.parentElement,
      P: { head, nEl, counts, stopAll, clear, tools, seg, tabs, search, input, qx, list, empty, foot, tip, thread, threadSlot, backBtn, collapse, bar, barN, barAvs },
      expanded: false, // inline over a chat with messages: the list open over it (else its one line)
      chat: null, // the host's data-rcc-hub-chat last seen
      filter: hubFilter || (v.all.some((e) => isActive(e.task.status)) ? "active" : "all"),
      q: "",
      active: null,
      rows: new Map(),
      ids: [],
      listSig: "",
      pos: "",
      anchor: null,
      clock: 0,
      tipT: 0,
    };
    // input
    input.addEventListener("input", () => {
      if (!hub) return;
      hub.q = input.value;
      qx.hidden = !input.value;
      // inline, typing over the folded list opens it (the results show)
      if (hub.inline && input.value && hub.el.dataset.view === "row") (hub.expanded = true), syncInlineView(true);
      renderHub("search");
    });
    // inline, the field lives in the card's head row (placeSearch): its keys
    // still drive the rows
    search.addEventListener("keydown", (ev) => {
      if (hub && hub.el !== box) return;
      if (!box.contains(search)) onHubKey(ev);
    });
    qx.addEventListener("click", () => {
      input.value = "";
      if (hub) (hub.q = ""), (qx.hidden = true), renderHub("search");
      input.focus({ preventScroll: true });
    });
    box.addEventListener("keydown", onHubKey);
    list.addEventListener("click", onHubClick);
    head.addEventListener("click", onHubClick);
    list.addEventListener("pointermove", (ev) => {
      const li = ev.target instanceof Element && ev.target.closest(".rtcb-hub-row");
      if (li && hub && li.dataset.id !== hub.active && !li.dataset.out) setHubActive(li.dataset.id, false);
    });
    // a row's hover: the agent's card beside the list (rowTipSoon)
    list.addEventListener("pointerover", (ev) => {
      const li = ev.target instanceof Element && ev.target.closest(".rtcb-hub-row");
      if (!li || li.dataset.out || !li.dataset.id || !cache.has(li.dataset.id)) return;
      if (tipSide && tipFor === li.dataset.id && tipEl.hasAttribute("data-show")) return void clearTimeout(rowTipT);
      rowTipSoon(li);
    });
    list.addEventListener("pointerout", (ev) => {
      const li = ev.target instanceof Element && ev.target.closest(".rtcb-hub-row");
      if (li && !(ev.relatedTarget instanceof Node && li.contains(ev.relatedTarget))) rowTipOut(ev);
    });
    list.addEventListener("pointerdown", () => {
      clearTimeout(rowTipT);
      if (tipSide) hideTip();
    });
    box.addEventListener("pointerover", (ev) => {
      const b = ev.target instanceof Element && ev.target.closest("[data-tip]");
      if (b && box.contains(b)) hubTipSoon(b);
    });
    box.addEventListener("pointerout", (ev) => {
      const b = ev.target instanceof Element && ev.target.closest("[data-tip]");
      if (b && !(ev.relatedTarget instanceof Node && b.contains(ev.relatedTarget))) hubTipHide();
    });
    box.addEventListener("focusout", (ev) => {
      const to = ev.relatedTarget;
      if (!hub || hub.el !== box || hub.inline || !(to instanceof Node)) return;
      if (box.contains(to) || (col.root && col.root.contains(to))) return;
      closeHub(false);
    });
    if (inline) {
      cardHost.appendChild(box);
      renderHub("search"); // no motion when it mounts (on every load)
      syncInlineView(false);
      hub.clock = setInterval(hubTick, 1000);
      return true;
    }
    col.viewEl.appendChild(box);
    setOpenState(col, true);
    renderHub("open");
    placeHub();
    if (reducedMotion()) box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: "linear" });
    else
      box.animate(
        [
          { opacity: 0, transform: "scale(0.96)" },
          { opacity: 1, transform: "scale(1)" },
        ],
        { duration: 220, easing: EASE_OUT },
      );
    input.focus({ preventScroll: true });
    hub.clock = setInterval(hubTick, 1000);
    return true;
  }
  // instant: no closing motion (another one opens, the canvas went away)
  function closeHub(restoreFocus, instant) {
    if (!hub) return false;
    hub.closing = true;
    if (hub.inline && openId && panel && panel.dataset.inline === "true") closePanel(false);
    const h = hub;
    hub = null;
    if (h.inline && h.cardHost) clearThreadMark(h.cardHost);
    if (h.P.search && !h.el.contains(h.P.search)) h.P.search.remove(); // (it lived in the card's head row)
    clearInterval(h.clock);
    clearTimeout(h.tipT);
    clearTimeout(h.armT);
    const had = h.el.contains(document.activeElement);
    if (!h.inline) setOpenState(h.col, false);
    const box = h.el;
    box.style.pointerEvents = "none";
    box.setAttribute("aria-hidden", "true");
    const gone = () => box.remove();
    if (instant || h.inline || document.hidden || typeof box.animate !== "function") gone();
    else {
      const a = reducedMotion()
        ? box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: "linear", fill: "forwards" })
        : box.animate(
            [
              { opacity: 1, transform: "scale(1)" },
              { opacity: 0, transform: "scale(0.96)" },
            ],
            { duration: 140, easing: EASE_IN_OUT, fill: "forwards" },
          );
      a.finished.then(gone, gone);
      setTimeout(gone, 400);
    }
    const lost = !document.activeElement || document.activeElement === document.body;
    if (restoreFocus || had || lost) {
      // the button that opened it, else the segment's, else the composer's
      // field (the segment gone with the last agent)
      const form = h.host && h.host.isConnected ? h.host.closest("form") : null;
      const back = [h.opener, h.col.manageBtn, h.col.moreBtn, form && form.querySelector("textarea, input")].find((n) => n && n.isConnected && n.getClientRects().length);
      if (back) back.focus({ preventScroll: true });
    }
    return true;
  }
  function setHubFilter(k, focusTab) {
    if (!hub || !HUB_TABS.some(([x]) => x === k)) return;
    hubFilter = k;
    if (hub.filter !== k) {
      hub.filter = k;
      hub.active = null;
      renderHub("filter");
    }
    const tab = hub.P.tabs.find((b) => b.dataset.k === k);
    if (focusTab && tab) tab.focus({ preventScroll: true });
  }
  function setHubActive(id, scroll) {
    if (!hub) return;
    hub.active = id || null;
    let act = null;
    for (const [rid, r] of hub.rows) {
      const on = rid === hub.active;
      if (on) act = r;
      if ((r.li.getAttribute("aria-selected") === "true") !== on) r.li.setAttribute("aria-selected", on ? "true" : "false");
    }
    if (act) hub.P.input.setAttribute("aria-activedescendant", act.li.id);
    else hub.P.input.removeAttribute("aria-activedescendant");
    if (act && scroll) act.li.scrollIntoView({ block: "nearest" });
  }
  function hubRow(id) {
    const li = el("li", "rtcb-hub-row");
    li.id = `rtcb-hub-o-${++hubSeq}`;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", "false");
    li.dataset.id = id;
    const avw = el("span", "rtcb-hub-av");
    const av = el("span", "rtcb-av");
    avw.append(el("span", "rtcb-ring"), av);
    const main = el("div", "rtcb-hub-main");
    const l1 = el("div", "rtcb-hub-l1");
    const title = el("span", "rtcb-hub-t");
    const tm = el("span", "rtcb-hub-time");
    l1.append(title, tm);
    const l2 = el("div", "rtcb-hub-l2");
    const st = el("span", "rtcb-hub-st");
    const sep = el("span", "rtcb-sep", "·");
    const wh = el("span", "rtcb-hub-where");
    l2.append(st, sep, wh);
    main.append(l1, l2);
    const acts = el("div", "rtcb-hub-acts");
    const mk = (act, label, icon) => {
      const b = button("rtcb-hub-ib", label, icon);
      b.dataset.act = act;
      b.dataset.tip = label;
      b.tabIndex = -1;
      acts.append(b);
      return b;
    };
    const fBtn = mk("follow", "Follow", ICON.follow);
    const rBtn = mk("reply", "Reply", ICON.reply);
    const sBtn = mk("stop", "Stop", ICON.stop);
    const dBtn = mk("dismiss", "Dismiss", ICON.dismiss);
    li.append(avw, main, acts);
    return { li, avw, av, title, tm, st, sep, wh, fBtn, rBtn, sBtn, dBtn, sig: "" };
  }
  function updateHubRow(r, e, q) {
    const t = e.task;
    const color = agentColor(t.id);
    const live = isActive(t.status);
    const canStop = !!stopFn();
    const stopped = stoppedOf(t);
    const sig = JSON.stringify([t.status, stopped, t.text, e.n, color, t.canvasName, t.storyboardName, followId === t.id, q, canStop, has("dismiss")]);
    const tt = hubTime(t);
    if (r.tm.textContent !== tt) r.tm.textContent = tt;
    if (r.sig === sig) return;
    r.sig = sig;
    r.li.dataset.status = t.status;
    r.avw.dataset.status = t.status;
    r.li.dataset.stopped = stopped ? "true" : "false";
    r.avw.dataset.stopped = stopped ? "true" : "false";
    r.avw.style.setProperty("--rtcb-agent", color);
    r.avw.style.setProperty("--rtcb-av", color);
    r.av.textContent = String(e.n);
    r.av.dataset.len = String(r.av.textContent.length);
    marked(r.title, clip(t.text, 200) || "(no text)", q);
    r.st.textContent = stopped ? "Stopped by you" : SHORT[t.status] || t.status;
    const w = where(t);
    marked(r.wh, w || "This canvas", q);
    r.sep.hidden = false;
    r.tm.title = live ? "Elapsed" : `Took ${tt}${e.doneAt ? ` · ${ago(e.doneAt)}` : ""}`;
    r.li.setAttribute("aria-label", `Agent #${e.n}: ${clip(t.text, 120)}. ${stopped ? "Stopped by you" : LABEL[t.status]}. ${w}`);
    const followed = followId === t.id;
    r.fBtn.hidden = !live;
    r.fBtn.dataset.on = followed ? "true" : "false";
    r.fBtn.dataset.tip = followed ? "Stop following" : "Follow  ⌥↵";
    r.fBtn.setAttribute("aria-label", followed ? "Stop following" : "Follow");
    r.rBtn.dataset.tip = "Reply  ↵";
    r.sBtn.hidden = !live;
    r.sBtn.setAttribute("aria-disabled", canStop ? "false" : "true");
    r.sBtn.dataset.tip = canStop ? "Stop  ⌘." : NO_STOP;
    r.dBtn.hidden = live;
    r.dBtn.setAttribute("aria-disabled", has("dismiss") ? "false" : "true");
    r.dBtn.dataset.tip = "Dismiss  ⌘⌫";
  }
  // mode: "open" (rows 40 ms apart), "filter" (the same, quicker), "search"
  // (no motion), "data" (the store changed: rows enter, leave, slide)
  function renderHub(mode) {
    if (!hub) return;
    const h = hub;
    const P = h.P;
    const v = view(h.col.name);
    const c = hubCounts(v.all);
    const nActive = c.running + c.waiting;
    const nDone = c.done + c.failed + c.stopped;
    const rm = reducedMotion();
    const nTxt = ` · ${v.all.length}`;
    if (P.nEl.textContent !== nTxt) P.nEl.textContent = nTxt;
    if (h.inline) (renderBar(h, v, nTxt), markThread());
    // counts: "3 running · 1 waiting · 5 done" (+ "· 1 failed")
    const cs = JSON.stringify(c);
    if (P.counts.dataset.sig !== cs) {
      P.counts.dataset.sig = cs;
      P.counts.textContent = "";
      const parts = [
        ["running", c.running, "running"],
        ["waiting", c.waiting, "waiting"],
        ["done", c.done, "done"],
      ];
      if (c.failed) parts.push(["failed", c.failed, "failed"]);
      if (c.stopped) parts.push(["stopped", c.stopped, "stopped"]);
      parts.forEach(([k, n, l], i) => {
        if (i) P.counts.append(el("span", "rtcb-sep", "·"));
        const s = el("span", `rtcb-hub-c rtcb-hub-c--${k}`);
        s.dataset.zero = n ? "false" : "true";
        s.append(el("b", null, String(n)), ` ${l}`);
        P.counts.append(s);
      });
      P.counts.setAttribute("aria-label", parts.map(([, n, l]) => `${n} ${l}`).join(", "));
    }
    // batch actions
    const canStop = !!stopFn();
    P.stopAll.setAttribute("aria-disabled", canStop && nActive ? "false" : "true");
    if (!canStop) P.stopAll.dataset.tip = NO_STOP;
    else if (h.armed) P.stopAll.dataset.tip = "Click again to stop them all";
    else delete P.stopAll.dataset.tip;
    if (h.armed && !nActive) disarm(h);
    const sa = h.armed ? `Stop ${nActive}?` : "Stop all";
    if (P.stopAll.textContent !== sa) P.stopAll.textContent = sa;
    P.stopAll.dataset.armed = h.armed ? "true" : "false";
    // everything under Done (done and failed)
    P.clear.disabled = !nDone || !has("dismiss");
    P.clear.textContent = nDone ? `Clear done (${nDone})` : "Clear done";
    // filters
    const n = { active: nActive, done: nDone, all: v.all.length };
    const idx = HUB_TABS.findIndex(([k]) => k === h.filter);
    P.seg.style.setProperty("--i", String(idx));
    for (const b of P.tabs) {
      const on = b.dataset.k === h.filter;
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      const nn = b.querySelector(".rtcb-hub-tab-n");
      const txt = String(n[b.dataset.k]);
      if (nn.textContent !== txt) nn.textContent = txt;
    }
    // rows
    const q = h.q.trim().toLowerCase();
    const rows = hubList(v);
    const ids = rows.map((e) => e.task.id);
    const listSig = JSON.stringify([h.filter, q, ids]);
    const reorder = listSig !== h.listSig;
    h.listSig = listSig;
    h.ids = ids;
    const fresh = mode === "open" || mode === "filter";
    const tops = reorder && mode === "data" && !rm ? new Map([...h.rows].map(([id, r]) => [id, r.li.getBoundingClientRect().top])) : null;
    // rows that leave: out at once (open / filter / search), else fade away
    const keep = new Set(ids);
    for (const [id, r] of h.rows) {
      if (keep.has(id)) continue;
      h.rows.delete(id);
      if (mode !== "data" || rm) r.li.remove();
      else leaveRow(r.li);
    }
    let prev = null;
    let k = 0;
    for (const e of rows) {
      const id = e.task.id;
      let r = h.rows.get(id);
      const born = !r;
      if (!r) h.rows.set(id, (r = hubRow(id)));
      updateHubRow(r, e, q);
      if (reorder) {
        const want = prev ? prev.nextSibling : P.list.firstChild;
        if (want !== r.li) P.list.insertBefore(r.li, want);
      }
      prev = r.li;
      if ((born || fresh) && !rm && mode !== "search") {
        const d = fresh ? Math.min(k, 8) * (mode === "open" ? 40 : 24) : 0;
        r.li.animate(
          [
            { opacity: 0, transform: "translateY(6px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: mode === "filter" ? 180 : 220, delay: d, easing: EASE_OUT, fill: "backwards" },
        );
      }
      k++;
    }
    if (tops) {
      for (const [id, y0] of tops) {
        const r = h.rows.get(id);
        if (!r) continue;
        const d = y0 - r.li.getBoundingClientRect().top;
        if (Math.abs(d) > 0.5) r.li.animate([{ transform: `translateY(${d}px)` }, { transform: "translateY(0)" }], { duration: 240, easing: EASE_IN_OUT, composite: "add" });
      }
    }
    // the active row: kept, else the first
    if (!h.active || !h.rows.has(h.active)) setHubActive(ids[0] || null, false);
    else setHubActive(h.active, false);
    // the empty state
    const none = !rows.length;
    P.list.hidden = none && ![...P.list.children].some((n) => n.dataset.out);
    P.empty.hidden = !none;
    if (none) {
      const key = JSON.stringify([h.filter, q, v.all.length, nActive, nDone]);
      if (P.empty.dataset.key !== key) {
        P.empty.dataset.key = key;
        P.empty.textContent = "";
        const ico = el("span", "rtcb-hub-empty-ico");
        ico.innerHTML = q ? ICON.search : ICON.agents;
        let t1;
        let t2;
        if (q) (t1 = `No agents match “${clip(h.q.trim(), 40)}”`), (t2 = "Search looks at the request, the canvas and the status.");
        else if (!v.all.length) (t1 = "No agents yet"), (t2 = "Describe a change in the composer and press Enter to start one.");
        else if (h.filter === "active") (t1 = "No agents running"), (t2 = nDone ? `${nDone} finished · see Done.` : "Start one from the composer.");
        else (t1 = "Nothing finished yet"), (t2 = "Agents land here when they finish.");
        P.empty.append(ico, el("div", "rtcb-hub-empty-t", t1), el("div", "rtcb-hub-empty-d", t2));
        if (q) {
          const b = button("rtcb-hub-link", null);
          b.textContent = "Clear search";
          b.addEventListener("click", () => P.qx.click());
          P.empty.append(b);
        } else if (h.filter === "active" && nDone) {
          const b = button("rtcb-hub-link", null);
          b.textContent = "Show done";
          b.addEventListener("click", () => setHubFilter("done", false));
          P.empty.append(b);
        }
        if (!rm && mode !== "search") P.empty.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: EASE_OUT });
      }
    } else delete P.empty.dataset.key;
    if (h.inline) (renderChatHit(h), fadeSoon(P.list));
  }
  // Inline: the card's chat matching the search (its title, or "chat") is
  // the first result over a chat with messages; a click (or Enter on it)
  // folds the list and shows the chat, the search cleared.
  function renderChatHit(h) {
    const P = h.P;
    const q = h.q.trim().toLowerCase();
    const title = (h.cardHost && h.cardHost.getAttribute("data-rcc-chat-title")) || "";
    const hit = !!q && h.chat === "messages" && (title.toLowerCase().includes(q) || "chat".startsWith(q));
    if (!hit) {
      if (P.chatHit) P.chatHit.remove();
      return;
    }
    if (!P.chatHit) {
      const li = (P.chatHit = el("li", "rtcb-hub-row rtcb-hub-chathit"));
      li.setAttribute("role", "option");
      li.tabIndex = -1;
      const ico = el("span", "rtcb-hub-chathit-ico");
      ico.innerHTML = ICON.chat;
      const main = el("div", "rtcb-hub-main");
      const l1 = el("div", "rtcb-hub-l1");
      P.chatHitT = el("span", "rtcb-hub-t");
      l1.append(P.chatHitT);
      const l2 = el("div", "rtcb-hub-l2");
      l2.append(el("span", "rtcb-hub-st", "Chat"), el("span", "rtcb-sep", "·"), el("span", "rtcb-hub-where", "Show it in the card"));
      main.append(l1, l2);
      li.append(ico, main);
      li.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (!hub || !hub.inline) return;
        hub.q = "";
        P.input.value = "";
        P.qx.hidden = true;
        expandInline(false);
        renderHub("search");
      });
    }
    marked(P.chatHitT, title || "Chat", q);
    P.chatHit.setAttribute("aria-label", `Chat: ${title || "this chat"}`);
    if (P.list.firstChild !== P.chatHit) P.list.insertBefore(P.chatHit, P.list.firstChild);
    P.list.hidden = false;
  }
  // The card's one line: "Agents · N", then up to 4 mini avatars (the ones
  // waiting for an answer, then the working ones, then the newest; their
  // colour and number, an amber ring when waiting) and "+N", then "›".
  const BAR_AV = 4;
  function renderBar(h, v, nTxt) {
    const P = h.P;
    if (P.barN.textContent !== nTxt) P.barN.textContent = nTxt;
    const top = [...v.all].sort(byPriority).slice(0, BAR_AV);
    const more = v.all.length - top.length;
    const sig = JSON.stringify([top.map((e) => [e.task.id, e.n, e.task.status, agentColor(e.task.id)]), more]);
    if (P.barAvs.dataset.sig === sig) return;
    P.barAvs.dataset.sig = sig;
    P.barAvs.textContent = "";
    for (const e of top) {
      const a = el("span", "rtcb-hub-mini", String(e.n));
      a.dataset.status = e.task.status;
      a.dataset.len = String(String(e.n).length);
      a.style.setProperty("--rtcb-av", agentColor(e.task.id));
      P.barAvs.append(a);
    }
    if (more > 0) P.barAvs.append(el("span", "rtcb-hub-mini rtcb-hub-mini--more", `+${more > 99 ? 99 : more}`));
    const waiting = v.all.filter((e) => e.task.status === "needs-input").length;
    const working = v.all.filter((e) => isActive(e.task.status)).length;
    P.bar.setAttribute("aria-label", `Agents: ${v.all.length}${working ? `, ${working} working` : ""}${waiting ? `, ${waiting} waiting for you` : ""}. Show the list`);
  }
  // A row leaving (dismissed, cleared, finished under Active): fades and
  // slides away, then the rows under it close the gap (FLIP).
  function leaveRow(li) {
    li.dataset.out = "1";
    li.setAttribute("aria-hidden", "true");
    li.style.pointerEvents = "none";
    const list = li.parentElement;
    const out = () => {
      if (!li.isConnected) return;
      const h = hub;
      const others = h && list === h.P.list ? [...list.children].filter((n) => n !== li && !n.dataset.out) : [];
      const tops = new Map(others.map((n) => [n, n.getBoundingClientRect().top]));
      li.remove();
      for (const [n, y0] of tops) {
        const d = y0 - n.getBoundingClientRect().top;
        if (Math.abs(d) > 0.5) n.animate([{ transform: `translateY(${d}px)` }, { transform: "translateY(0)" }], { duration: 220, easing: EASE_IN_OUT, composite: "add" });
      }
      if (h && h.P.empty && !h.rows.size) h.P.list.hidden = ![...list.children].some((n) => n.dataset.out);
    };
    const a = li.animate(
      [
        { opacity: 1, transform: "translateX(0)" },
        { opacity: 0, transform: "translateX(12px)" },
      ],
      { duration: 180, easing: EASE_IN_OUT, fill: "forwards" },
    );
    a.finished.then(out, out);
    setTimeout(out, 400);
  }
  function disarm(h) {
    if (!h || !h.armed) return;
    h.armed = false;
    clearTimeout(h.armT);
    if (h === hub) renderHub("data");
  }
  function hubTick() {
    if (!hub || document.hidden || (hub.inline && !hub.el.getClientRects().length)) return;
    for (const [id, r] of hub.rows) {
      const e = cache.get(id);
      if (!e || !isActive(e.task.status)) continue;
      const tt = hubTime(e.task);
      if (r.tm.textContent !== tt) r.tm.textContent = tt;
    }
  }
  // The box holding the slot (the composer): its largest ancestor that is
  // still at most 160 px tall, 6 levels up at most (its surface may be drawn
  // by a child, so no background test). null: not in a slot.
  function surfaceOf(col) {
    const host = col.hosted && col.root && col.root.isConnected ? col.root.parentElement : null;
    let best = null;
    for (let n = host, d = 0; n && n !== col.viewEl && n !== document.body && d < 6; n = n.parentElement, d++) {
      const r = n.getBoundingClientRect();
      if (r.height > 160) break;
      best = r;
    }
    return best && { left: best.left, top: best.top, right: best.right, bottom: best.bottom };
  }
  // Over the composer, opening upwards from its left edge (a segment in the
  // lower half of the view); else below the segment. Kept where it was when
  // the segment goes (the last agent dismissed: the empty state stays).
  function placeHub() {
    if (!hub || hub.inline) return;
    const h = hub;
    const col = h.col;
    if (!col.viewEl || !col.viewEl.isConnected) return void closeHub(false, true);
    if (h.el.parentNode !== col.viewEl) col.viewEl.appendChild(h.el);
    const seg = col.hosted || (col.root && col.root.isConnected) ? segRectOf(col) : null;
    const a = seg ? { seg, sf: surfaceOf(col) } : h.anchor;
    if (!a) return void closeHub(false, true);
    h.anchor = a;
    const B = col.bounds || { l: 0, t: 0, r: innerWidth, b: innerHeight };
    const vr = col.viewEl.getBoundingClientRect();
    const w = Math.round(Math.min(HUB_W, Math.max(240, B.r - B.l - 2 * EDGE_IN)));
    const S = a.sf || a.seg;
    const up = (a.seg.top + a.seg.bottom) / 2 > (B.t + B.b) / 2;
    const left = Math.max(B.l + EDGE_IN, Math.min(B.r - EDGE_IN - w, S.left));
    const edge = up ? clearOfBars(col.viewEl, B, S.top - HUB_GAP, left, left + w, HUB_GAP) : a.seg.bottom + GAP;
    const room = up ? edge - B.t - EDGE_IN : B.b - toolbarReserve(col.viewEl, B) - edge;
    const maxH = Math.max(160, Math.min(HUB_MAX_H, room));
    const o = h.opener && h.opener.isConnected && h.opener.getClientRects().length ? h.opener.getBoundingClientRect() : a.seg;
    const ox = Math.round(Math.max(16, Math.min(w - 16, o.left + o.width / 2 - left)));
    // One height while it is open, enough for every agent of the canvas (the
    // list scrolls past the cap): a filter or a search never moves its
    // header and filters under the pointer (it opens upwards from its bottom).
    const P = h.P;
    const chrome = P.head.offsetHeight + P.seg.parentElement.offsetHeight + (P.foot.offsetParent ? P.foot.offsetHeight : 0) + 2;
    const n = view(col.name).all.length;
    h.minH = Math.max(h.minH || 0, chrome + Math.max(n * HUB_ROW_H + 8, 168));
    const height = Math.round(Math.min(maxH, h.minH));
    const sig = [left - vr.left, up ? vr.bottom - edge : edge - vr.top, w, height, up, ox].map((x) => Math.round(+x)).join();
    if (h.pos === sig) return;
    h.pos = sig;
    const st = h.el.style;
    st.left = `${Math.round(left - vr.left)}px`;
    st.top = up ? "auto" : `${Math.round(edge - vr.top)}px`;
    st.bottom = up ? `${Math.round(vr.bottom - edge)}px` : "auto";
    st.width = `${w}px`;
    st.height = `${height}px`;
    st.maxHeight = `${Math.round(maxH)}px`;
    st.transformOrigin = `${ox}px ${up ? "100%" : "0%"}`;
    h.el.dataset.dir = up ? "up" : "down";
    h.el.dataset.narrow = w < 320 ? "true" : "false";
  }
  let replyFocus = false; // the row's Reply button: the thread with its field focused
  function hubAct(kind, id) {
    if (!hub) return;
    const e = id ? cache.get(id) : null;
    if (kind === "stop-all") {
      // two steps: "Stop all" arms ("Stop 4?", 3 s), a second click stops them
      const ids = view(hub.col.name).all.filter((x) => isActive(x.task.status)).map((x) => x.task.id);
      if (!stopFn() || !ids.length) return;
      if (!hub.armed) {
        hub.armed = true;
        clearTimeout(hub.armT);
        const h = hub;
        h.armT = setTimeout(() => disarm(h), 3000);
        renderHub("data");
        return;
      }
      disarm(hub);
      stopAllOf(ids);
      return;
    }
    if (kind === "clear") {
      dismissIds(view(hub.col.name).all.filter((x) => !isActive(x.task.status)).map((x) => x.task.id));
      if (hub) hub.P.input.focus({ preventScroll: true }); // the button is disabled now
      return;
    }
    if (!e) return;
    if (kind === "reply") {
      // inline: the thread in the card; a popover: the agent's popover
      if (hub.inline) return void openPanel(id, { focusReply: replyFocus });
      closeHub(false, true);
      openPanel(id);
    } else if (kind === "follow") {
      if (!isActive(e.task.status)) return;
      if (!hub.inline) closeHub(true);
      if (followId === id) unfollow();
      else follow(id);
    } else if (kind === "stop") {
      const f = stopFn();
      if (!f || !isActive(e.task.status)) return;
      f(id);
    } else if (kind === "dismiss") {
      if (isActive(e.task.status)) return;
      // the active row moves to the next one
      const ids = hub.ids;
      const i = ids.indexOf(id);
      if (hub.active === id) hub.active = ids[i + 1] || ids[i - 1] || null;
      dismissIds([id]);
    }
  }
  function dismissIds(ids) {
    const a = agent();
    if (!ids.length || !a || typeof a.dismiss !== "function") return;
    for (const id of ids) {
      try {
        a.dismiss(id);
      } catch (err) {
        note("dismiss", err);
      }
      cache.delete(id);
    }
    persistSoon();
    render();
  }
  function onHubClick(ev) {
    if (!hub || !(ev.target instanceof Element)) return;
    const b = ev.target.closest("[data-act]");
    if (b && b.getAttribute("aria-disabled") === "true") return void ev.stopPropagation();
    if (b && hub.P.head.contains(b)) return void hubAct(b.dataset.act, null);
    const li = ev.target.closest(".rtcb-hub-row");
    if (!li || li.dataset.out) return;
    ev.stopPropagation();
    replyFocus = !!(b && b.dataset.act === "reply");
    hubAct(b ? b.dataset.act : ev.altKey ? "follow" : "reply", li.dataset.id);
    replyFocus = false;
  }
  function onHubKey(ev) {
    if (!hub) return;
    const P = hub.P;
    const ids = hub.ids;
    const i = ids.indexOf(hub.active);
    if (ev.key === "Escape") {
      if (appOverlayOpen()) return;
      if (hub.q && ev.target === P.input) {
        ev.preventDefault();
        ev.stopPropagation();
        return void P.qx.click();
      }
      // the card's list stays (a thread goes back on its own Escape); over a
      // chat with messages it folds into its line
      if (hub.inline) {
        if (hub.el.dataset.view === "list" && hub.el.dataset.collapsible === "true") {
          ev.preventDefault();
          ev.stopPropagation();
          expandInline(false);
        }
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      closeHub(true);
      return;
    }
    const tab = ev.target instanceof Element && ev.target.closest(".rtcb-hub-tab");
    if (tab && (ev.key === "ArrowLeft" || ev.key === "ArrowRight")) {
      ev.preventDefault();
      ev.stopPropagation();
      const k = HUB_TABS.findIndex(([x]) => x === hub.filter);
      const nk = HUB_TABS[(k + (ev.key === "ArrowRight" ? 1 : HUB_TABS.length - 1)) % HUB_TABS.length][0];
      setHubFilter(nk, true);
      return;
    }
    const inList = ev.target === P.input || ev.target === hub.el || (ev.target instanceof Element && P.list.contains(ev.target));
    if (!inList) return;
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      ev.stopPropagation();
      if (!ids.length) return;
      const k = i < 0 ? 0 : Math.max(0, Math.min(ids.length - 1, i + (ev.key === "ArrowDown" ? 1 : -1)));
      setHubActive(ids[k], true);
      return;
    }
    if (ev.key === "Enter" && !ev.isComposing && i >= 0) {
      ev.preventDefault();
      ev.stopPropagation();
      hubAct(ev.altKey ? "follow" : "reply", hub.active);
      return;
    }
    if (ev.key === "." && (ev.metaKey || ev.ctrlKey) && i >= 0) {
      ev.preventDefault();
      ev.stopPropagation();
      hubAct("stop", hub.active);
      return;
    }
    if ((ev.key === "Backspace" || ev.key === "Delete") && (ev.metaKey || ev.ctrlKey) && !hub.q && i >= 0) {
      ev.preventDefault();
      ev.stopPropagation();
      hubAct("dismiss", hub.active);
      return;
    }
    // typing in the search field stays here (no canvas shortcut sees it)
    if (ev.target === P.input) ev.stopPropagation();
  }
  function hubState() {
    if (!hub) return null;
    const P = hub.P;
    return {
      inline: !!hub.inline,
      view: hub.el.dataset.view || null,
      thread: hub.inline && openId && panel && panel.dataset.inline === "true" ? openId : null,
      dir: hub.el.dataset.dir || null,
      filter: hub.filter,
      query: hub.q,
      counts: P.counts.textContent,
      tabs: P.tabs.map((b) => b.textContent),
      active: hub.active,
      empty: P.empty.hidden ? null : P.empty.textContent,
      rows: hub.ids.map((id) => {
        const r = hub.rows.get(id);
        return { id, status: r.li.dataset.status, title: r.title.textContent, time: r.tm.textContent, where: r.wh.textContent, selected: r.li.getAttribute("aria-selected") === "true" };
      }),
      focus: document.activeElement && hub.el.contains(document.activeElement) ? document.activeElement.className || document.activeElement.tagName : null,
      rect: rectOf(hub.el.getBoundingClientRect()),
      stop: !!stopFn(),
    };
  }
  // the hub's own tooltip (its buttons; inside the box, so never clipped by the list)
  function hubTipSoon(b) {
    if (!hub) return;
    clearTimeout(hub.tipT);
    const quick = now() - lastTipAt < 600;
    hub.tipT = setTimeout(() => hubTipShow(b), quick ? 0 : 320);
  }
  function hubTipShow(b) {
    if (!hub || !b.isConnected || !b.dataset.tip) return;
    const tip = hub.P.tip;
    const box = hub.el;
    tip.textContent = b.dataset.tip;
    tip.style.left = "0px";
    tip.style.top = "0px";
    tip.setAttribute("data-show", "");
    const br = box.getBoundingClientRect();
    const r = b.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    const up = r.top - br.top > tr.height + 10;
    const top = up ? r.top - br.top - tr.height - 6 : r.bottom - br.top + 6;
    const left = Math.max(6, Math.min(br.width - tr.width - 6, r.left - br.left + r.width / 2 - tr.width / 2));
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    b.setAttribute("aria-describedby", tip.id);
    lastTipAt = now();
  }
  function hubTipHide() {
    if (!hub) return;
    clearTimeout(hub.tipT);
    if (hub.P.tip.hasAttribute("data-show")) (hub.P.tip.removeAttribute("data-show"), (lastTipAt = now()));
  }

  // ---------------------------------------------------------------- events
  function onDocPointerDown(ev) {
    if (hub && !hub.inline) {
      const t = ev.target;
      if (t instanceof Node && !hub.el.contains(t) && !(hub.col.root && hub.col.root.contains(t)) && !(tipEl && tipEl.contains(t)) && !(lb && lb.el.contains(t))) closeHub(false);
    }
    if (!openId || !panel || panel.dataset.inline === "true") return;
    const tg = ev.target;
    if (!(tg instanceof Node)) return;
    if (panel.contains(tg) || (lb && lb.el.contains(tg)) || isRtcbNode(tg instanceof Element ? tg : tg.parentElement)) return;
    // the composer that answers this agent is part of it
    const f = panel.dataset.reply === "composer" ? composerField(panelCol) : null;
    if (f && (f.closest("form") || f.parentElement).contains(tg)) return;
    // an avatar's popover fades where it was (140 ms); kept in mind for a
    // moment: a press that opens the card (its toggle) brings its thread there
    const bubblePop = panel.dataset.anchor === "bubble" && !!panelCol && panelCol.hosted;
    if (bubblePop) (popGone = { id: openId, col: panelCol, at: now() }), holdReply(350);
    const g = bubblePop && viewLive(panel) ? ghostOf(panel, popRect) : null;
    closePanel(false);
    if (g)
      fadeGhost(g, [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "translateY(4px) scale(0.98)" },
      ], 140);
  }
  function flip() {
    if (lb && lb.sv) return lb.sv.toggle();
    if (lb && lb.list.length > 1) {
      lb.i = (lb.i + 1) % lb.list.length;
      lb.show();
      return true;
    }
    if (openId && P && P.car) return P.car.flip();
    return false;
  }
  function setPeek(on) {
    if (peek === on) return;
    peek = on;
    if (tipSv) tipSv.peek(on); // the avatar's card under the pointer
    if (lb && lb.sv) lb.sv.peek(on);
    else if (lb && lb.list.length > 1 && lb.list[0].label === "Before") {
      if (on) {
        lb.peekFrom = lb.i;
        lb.i = 0;
      } else if (lb.peekFrom != null) {
        lb.i = lb.peekFrom;
        lb.peekFrom = null;
      }
      lb.show();
    } else if (P && P.car) P.car.peek(on);
  }
  // Keys reach this UI only when it is where the user is: the focus inside the
  // panel or the enlarged view, or the pointer over them. Escape is never
  // taken while one of the app's own menus or dialogs is open (it is theirs).
  let hoverUI = false;
  const inUI = (n) => !!n && n.nodeType === 1 && ((panel && panel.contains(n)) || (lb && lb.el.contains(n)));
  function appOverlayOpen() {
    for (const n of document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]')) {
      if (inUI(n) || n.closest(".rtcb-panel, .rtcb-pop, .rtcb-lb, .rtcb-ag, [data-rtcb-root]")) continue;
      if (n.getClientRects().length && getComputedStyle(n).visibility !== "hidden") return true;
    }
    return false;
  }
  function onDocKey(ev) {
    // the manager open and the focus lost (its focused control went away): Escape still closes it
    if (hub && !hub.inline && ev.key === "Escape" && !ev.defaultPrevented && (!document.activeElement || document.activeElement === document.body) && !appOverlayOpen()) {
      ev.preventDefault();
      ev.stopPropagation();
      closeHub(true);
      return;
    }
    // Shift over an avatar's card: its before
    if (ev.key === "Shift" && !ev.repeat && !ev.metaKey && !ev.ctrlKey && !ev.altKey && tipSv && tipEl && tipEl.hasAttribute("data-show") && !lb) return void setPeek(true);
    if (!openId && !lb) return;
    const here = inUI(document.activeElement) || hoverUI;
    if (!here) return;
    if (ev.key === "Escape" && !ev.defaultPrevented) {
      if (appOverlayOpen()) return;
      if (lb) {
        ev.preventDefault();
        ev.stopPropagation();
        closeLightbox();
      } else if (openId) {
        ev.preventDefault();
        ev.stopPropagation();
        closePanel(true);
      }
      return;
    }
    if (!openId || isEditable(ev.target)) return;
    if ((ev.key === "ArrowLeft" || ev.key === "ArrowRight") && !ev.metaKey && !ev.ctrlKey && !ev.altKey && !ev.shiftKey && P && P.car && !lb) {
      ev.preventDefault();
      ev.stopPropagation();
      P.car.step(ev.key === "ArrowRight" ? 1 : -1);
      return;
    }
    if (ev.key === "/" && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
      if (flip()) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    } else if (ev.key === "Shift" && !ev.repeat && !ev.metaKey && !ev.ctrlKey && !ev.altKey) setPeek(true);
  }
  function onDocKeyUp(ev) {
    if (ev.key === "Shift") setPeek(false);
  }
  const onBlur = () => setPeek(false);

  // ---------------------------------------------- the card's agents list
  // canvas-chrome's left card (its Agent tab) holds a [data-rtcb-hub-host]
  // under "New Chat | + New", over the chat: the manager lives there inline
  // (the first canvas view that has one), and every host gets data-count
  // (its canvas's agents; 0: it hides). Its views (syncInlineView): the
  // list over the whole tab, an agent's thread over the whole tab, or, over
  // a chat with messages (the host's data-rcc-hub-chat), one line that
  // expands into the list. window.__RE_TEMPO_CANVAS_CHROME__:
  // openAgents(view) shows the card on its Agent tab and sends
  // "rtcc:agents-open" {view}; agentsHost(view) -> the host. Without them (or
  // without a host) the popover stays.
  const cardApi = () => {
    const a = window.__RE_TEMPO_CANVAS_CHROME__;
    return a && typeof a.openAgents === "function" ? a : null;
  };
  // canvas-chrome's card (its left panel) open in the shell that holds this
  // column's slot: an avatar's thread opens there (state().shells[].leftOpen)
  function cardOpen(col) {
    const a = cardApi();
    if (!a || typeof a.state !== "function" || !col || !col.root || !col.root.isConnected) return false;
    try {
      const s = (a.state().shells || []).find((x) => x && x.shell && x.shell.contains(col.root));
      return !!(s && s.leftOpen);
    } catch (e) {
      note("cardOpen", e);
      return false;
    }
  }
  // canvas-chrome's composer next to a slot: its field
  // ([data-rtcb-composer-field], within the slot's 4 nearest ancestors) is
  // the reply field of the agent whose popover or thread is open. null: none.
  function composerField(col) {
    const host = col && col.hosted && col.root && col.root.isConnected ? col.root.parentElement : null;
    for (let n = host, d = 0; n && n !== document.body && d < 4; n = n.parentElement, d++) {
      const f = n.querySelector("[data-rtcb-composer-field]");
      if (f) return f.isConnected && !f.closest("[hidden]") ? f : null;
    }
    return null;
  }
  // The card opens while an avatar's popover is open (⌘\, the app's own
  // action) or right after a press closed it (the card's toggle): the
  // popover gives way to that thread in the card, in the card's first frame
  // (no other view of the list shows on the way). Its copy fades where it
  // was (160 ms); the panel itself moves as it is drawn (keep: no slide of
  // its own, the card's opening carries it, no rebuild).
  let popGone = null; // { id, col, at }: the popover an outside press just closed
  function onChromeChange(ev) {
    const d = (ev && ev.detail) || {};
    const gone = popGone && now() - popGone.at < 800 ? popGone : null;
    popGone = null;
    if (disposed || !d.leftOpen || !d.shell) return;
    const open = !!openId && !!panel && panel.dataset.inline !== "true" && panel.dataset.anchor === "bubble";
    const id = open ? openId : gone && !openId ? gone.id : null;
    const col = open ? panelCol : gone ? gone.col : null;
    if (!id || !cache.has(id) || !col || !col.root || !d.shell.contains(col.root) || !(hub && hub.inline && hub.col === col)) return;
    const g = open && viewLive(panel) ? ghostOf(panel, popRect) : null;
    openPanel(id, { quiet: true, keep: true });
    if (g)
      fadeGhost(g, [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "translateY(6px) scale(0.98)" },
      ], 160);
  }
  function cardHostOf(col) {
    const a = window.__RE_TEMPO_CANVAS_CHROME__;
    if (a && typeof a.agentsHost === "function" && col.viewEl)
      try {
        const h = a.agentsHost(col.viewEl);
        if (h && h.nodeType === 1 && h.isConnected) return h;
      } catch (e) {
        note("agentsHost", e);
      }
    // its nearest one, never in an area that also shows another canvas
    for (let n = col.canvas, d = 0; n && n !== document.body && d < 12; n = n.parentElement, d++) {
      if ([...n.querySelectorAll(SEL.content[0])].some((r) => r !== col.canvas && r.getClientRects().length > 0)) break;
      const h = n.querySelector("[data-rtcb-hub-host]");
      if (h) return h;
    }
    return null;
  }
  let domEpoch = 0; // bumped by every DOM batch: a host found (or not) stays until then
  function syncCards() {
    let bound = null;
    for (const col of columns.values()) {
      if (col.cardEpoch !== domEpoch || (col.cardHost && !col.cardHost.isConnected)) (col.cardHost = col.canvas ? cardHostOf(col) : null), (col.cardEpoch = domEpoch);
      const host = col.cardHost;
      if (!host) continue;
      const n = String(view(col.name).all.length);
      if (host.dataset.count !== n) {
        // the last agent gone while the list fills the tab: the list as it
        // was dissolves over the chat coming back (no blank frame)
        if (n === "0" && hub && hub.inline && hub.cardHost === host && hub.el.dataset.view !== "row" && viewLive(hub.el)) {
          const g = ghostOf(hub.el);
          if (g) fadeGhost(g, [{ opacity: 1 }, { opacity: 0 }], 160);
        }
        host.dataset.count = n;
      }
      if (!bound) bound = { col, host };
    }
    if (bound) {
      if (!(hub && hub.inline && hub.cardHost === bound.host && hub.col === bound.col && hub.el.parentNode === bound.host)) openHub(bound.col, null, bound.host);
      const pe = bound.host.parentElement;
      if (ro && pe && !observed.has(pe)) (observed.add(pe), ro.observe(pe));
      fitInline();
    } else if (hub && hub.inline) closeHub(false, true);
  }
  // Inline: no ceiling of its own (canvas-chrome gives the host the whole
  // tab, or the line over the chat); only the rows, or a thread's body,
  // scroll. The view follows the host's chat.
  function fitInline() {
    if (!hub || !hub.inline || !hub.cardHost) return;
    if (hub.el.style.maxHeight) hub.el.style.maxHeight = "";
    placeSearch();
    syncInlineView(true);
    fadeSoon(hub.P.list);
  }
  // The card's head row has a slot for one search ([data-rtcb-search-host],
  // canvas-chrome): the list's own field goes there (one search, up top,
  // over the agents and the chat); a head row not shown (the Design route
  // brings the app's own): back in the list's tools.
  function placeSearch() {
    const P = hub.P;
    const tab = hub.cardHost.closest('[role="tabpanel"]') || hub.cardHost.parentElement;
    const slot = tab && tab.querySelector("[data-rtcb-search-host]");
    const up = !!slot && slot.getClientRects().length > 0;
    const want = up ? slot : P.tools;
    if (P.search.parentNode !== want) {
      const had = document.activeElement === P.input;
      want.appendChild(P.search);
      if (had) P.input.focus({ preventScroll: true });
    }
    hub.el.dataset.search = up ? "head" : "list";
  }
  // "+N", "Manage agents", an avatar (id): the list (or that agent's
  // thread) in the card; false without canvas-chrome's openAgents, or when
  // it says no (the popover then). Applied when the card shows the list
  // ("rtcc:agents-open", or at once when it already does); nothing within
  // 1.8 s: the popover too.
  let pendingCard = null; // { col, id, t }
  function openInCard(col, id) {
    const api = cardApi();
    if (!api || !col) return false;
    if (pendingCard) clearTimeout(pendingCard.t);
    const pc = (pendingCard = { col, id: id || null, t: 0 });
    let ok = false;
    try {
      ok = api.openAgents(col.viewEl) !== false;
    } catch (e) {
      note("openAgents", e);
    }
    if (!ok) {
      if (pendingCard === pc) pendingCard = null;
      return false;
    }
    if (pendingCard !== pc) return true; // its "rtcc:agents-open" came at once
    const there = () => !!(hub && hub.inline && hub.col === col && hub.el.getClientRects().length);
    if (!there()) render(); // the host may be there now (a card already showing it: no second render)
    if (there()) applyPending();
    else
      pc.t = setTimeout(() => {
        if (pendingCard !== pc) return;
        if (hub && hub.inline && hub.col === col) return applyPending();
        pendingCard = null;
        if (pc.id) openPanel(pc.id);
        else openHub(col, col.manageBtn);
      }, 1800);
    return true;
  }
  function applyPending() {
    const pc = pendingCard;
    pendingCard = null;
    if (!pc) return;
    clearTimeout(pc.t);
    if (!hub || !hub.inline) return;
    if (pc.id) return void openPanel(pc.id);
    // the list itself, open over a chat with messages too
    hub.expanded = true;
    if (openId && panel && panel.dataset.inline === "true") closePanel(false);
    else syncInlineView(true);
    setHubActive(hub.ids[0] || null, true);
    focusInline();
  }
  // the card's list: its search field (↑ / ↓ / Enter drive the rows from
  // there, and a key typed in a field is never a canvas shortcut); folded
  // into its line: that line. No agent (the host shows nothing): nothing.
  function focusInline() {
    if (!hub || !hub.inline || !(parseInt(hub.cardHost && hub.cardHost.dataset.count, 10) > 0)) return;
    (hub.el.dataset.view === "row" ? hub.P.bar : hub.P.input).focus({ preventScroll: true });
  }

  // The card's three views (box data-view): "list" (the whole tab; over a
  // chat with messages only while expanded, "‹" / Escape fold it back),
  // "thread" (one agent, the whole tab, "‹ Agents" back to the list) and
  // "row" (one line over a chat with messages). canvas-chrome says which
  // chat the tab shows on the host (data-rcc-hub-chat: "messages" |
  // "empty") and lays the host out from the view (the whole tab, or a line
  // over the chat). A chat that gets its first message folds the list.
  const inlineThread = () => !!(openId && panel && panel.dataset.inline === "true");
  // The thread shown in the card, on its host (canvas-chrome's composer is
  // its reply field meanwhile): data-rtcb-thread (task id),
  // data-rtcb-thread-n (its number), data-rtcb-thread-ask ("true" while it
  // waits for an answer) and --rtcb-thread-color (its avatar's colour).
  function markThread() {
    const host = hub && hub.inline ? hub.cardHost : null;
    for (const h of document.querySelectorAll("[data-rtcb-hub-host][data-rtcb-thread]")) if (h !== host) clearThreadMark(h);
    if (host) setThreadMark(host, inlineThread() ? openId : null);
  }
  // The same marks on a slot's host ([data-rtcb-host]) while the popover of
  // one of its agents is open over canvas-chrome's composer: the composer
  // answers that agent ("Reply to #N…"), and goes back when it closes.
  function markReply() {
    markThread();
    const col = openId && panel && panel.dataset.reply === "composer" && panel.dataset.inline !== "true" ? panelCol : null;
    let host = col && col.root && col.root.isConnected ? col.root.parentElement : null;
    let id = openId;
    // a popover that just closed keeps its agent on the composer a moment
    // (holdReply): the card may be taking its thread
    if (!host && holdMark && holdMark.host.isConnected && !inlineThread()) (host = holdMark.host), (id = holdMark.id);
    for (const h of document.querySelectorAll("[data-rtcb-host][data-rtcb-thread]")) if (h !== host) clearThreadMark(h);
    if (host) setThreadMark(host, id);
  }
  // The open popover is about to close where the card may take its thread
  // (a press outside, the card opening): the composer stays on its agent
  // for ms (no "Design anything…" blink between the two), then follows.
  let holdMark = null; // { host, id }
  let holdTimer = 0;
  function holdReply(ms) {
    const host = openId && panel && panel.dataset.reply === "composer" && panel.dataset.inline !== "true" && panelCol && panelCol.root && panelCol.root.isConnected ? panelCol.root.parentElement : null;
    if (!host) return;
    clearTimeout(holdTimer);
    holdMark = { host, id: openId };
    holdTimer = setTimeout(() => {
      holdMark = null;
      if (!disposed) markReply();
    }, ms);
  }
  function setThreadMark(host, id) {
    const e = id ? cache.get(id) : null;
    if (!e) return void clearThreadMark(host);
    const set = (k, v) => host.getAttribute(k) !== v && host.setAttribute(k, v);
    set("data-rtcb-thread-n", String(e.n));
    set("data-rtcb-thread-ask", e.task.status === "needs-input" ? "true" : "false");
    const c = agentColor(id);
    if (host.style.getPropertyValue("--rtcb-thread-color") !== c) host.style.setProperty("--rtcb-thread-color", c);
    set("data-rtcb-thread", id); // last: the one canvas-chrome watches
  }
  function clearThreadMark(h) {
    if (!h.hasAttribute("data-rtcb-thread")) return;
    h.removeAttribute("data-rtcb-thread-n");
    h.removeAttribute("data-rtcb-thread-ask");
    h.style.removeProperty("--rtcb-thread-color");
    h.removeAttribute("data-rtcb-thread");
  }
  function inlineView() {
    if (inlineThread()) return "thread";
    return hub.chat === "messages" && !hub.expanded ? "row" : "list";
  }
  function syncInlineView(animate) {
    if (!hub || !hub.inline) return;
    const chat = (hub.cardHost && hub.cardHost.getAttribute("data-rcc-hub-chat")) || "empty";
    if (chat !== hub.chat) {
      if (hub.chat === "empty" && chat === "messages") hub.expanded = false; // the chat just started: show it
      hub.chat = chat;
    }
    const coll = chat === "messages" ? "true" : "false";
    if (hub.el.dataset.collapsible !== coll) hub.el.dataset.collapsible = coll;
    setInlineView(inlineView(), animate !== false);
  }
  // From one view to another, a fade through the card's surface: the view
  // that leaves is drawn once more as a still copy over the card (its rect,
  // the card's surface) that dissolves (140 ms) while the new one comes in
  // just behind it (220 ms, 50-100 ms later, so no two texts cross): list ↔
  // thread push sideways (16 px), the list folding into its line rises
  // 8 px, the line opening into the list gives way to the rows (40 ms
  // apart; the chat under it fades out first). Transforms and opacity only.
  // `pre`: the copy, taken before the caller changed the box (a thread
  // that already left its slot)
  const viewLive = (box) => !reducedMotion() && !document.hidden && box.getClientRects().length > 0 && typeof box.animate === "function";
  function setInlineView(want, animate, pre) {
    const h = hub;
    const box = h.el;
    const was = box.dataset.view;
    h.P.bar.setAttribute("aria-expanded", want === "row" ? "false" : "true");
    markThread();
    if (was === want) {
      if (pre) (pre.remove(), overlays.delete(pre));
      return;
    }
    const live = animate && was && viewLive(box);
    const ghost = live ? pre || ghostOf(box) : null;
    if (pre && !live) (pre.remove(), overlays.delete(pre));
    box.dataset.view = want;
    if (want === "list") fadeSoon(h.P.list);
    if (!live) {
      // reduced motion: the new view fades in (120 ms), nothing moves
      if (animate && was && reducedMotion() && box.getClientRects().length && typeof box.animate === "function") box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: "linear" });
      return;
    }
    const back = was === "thread" && want === "list";
    const dx = was === "list" && want === "thread" ? -16 : back ? 16 : 0;
    const dy = want === "row" ? -8 : 0;
    if (ghost)
      fadeGhost(ghost, [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: `translate(${dx}px, ${dy}px)` },
      ], 140);
    const fromRow = was === "row";
    const lead = want === "row" ? 90 : fromRow ? 100 : 50;
    const parts = want === "thread" ? [h.P.thread] : want === "row" ? [h.P.bar] : [h.P.head, h.P.tools];
    for (const n of parts)
      if (n)
        n.animate(
          [
            { opacity: 0, transform: dx ? `translateX(${-dx}px)` : want === "row" ? "translateY(4px)" : "translateY(-4px)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 220, delay: lead, easing: EASE_OUT, fill: "backwards" },
        );
    if (want === "list") {
      // the rows come in after the head (the list's own "open")
      let k = 0;
      for (const li of h.P.list.children)
        if (!li.dataset.out && k < 9)
          li.animate(
            [
              { opacity: 0, transform: back ? "translateX(16px)" : "translateY(6px)" },
              { opacity: 1, transform: "none" },
            ],
            { duration: 220, delay: lead + 30 + 40 * k++, easing: EASE_OUT, fill: "backwards" },
          );
      fadeSoon(h.P.list);
    }
  }
  // A still copy of a view at its rect, over the card (body level: it
  // outlives the box's new size), with the card's surface under it.
  // rect: the box's rect when it is known without a layout (popRect, its
  // body's scroll in rect.scroll)
  function ghostOf(box, rect) {
    const r = rect || box.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return null;
    const g = box.cloneNode(true);
    g.removeAttribute("id");
    for (const n of g.querySelectorAll("[id]")) n.removeAttribute("id");
    g.classList.add("rtcb-hub-ghost");
    g.setAttribute("aria-hidden", "true");
    g.inert = true;
    Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, maxHeight: "none" });
    document.body.appendChild(g);
    overlays.add(g);
    // where its scrollers were
    const from = box.querySelectorAll(".rtcb-hub-list, .rtcb-pb");
    const to = g.querySelectorAll(".rtcb-hub-list, .rtcb-pb");
    if (rect && rect.scroll != null) to.forEach((n) => n.matches(".rtcb-pb") && rect.scroll && (n.scrollTop = rect.scroll));
    else from.forEach((n, i) => to[i] && n.scrollTop && (to[i].scrollTop = n.scrollTop));
    return g;
  }
  function fadeGhost(g, frames, ms) {
    const drop = () => {
      g.remove();
      overlays.delete(g);
    };
    g.animate(frames, { duration: ms, easing: EASE_IN_OUT, fill: "forwards" }).finished.then(drop, drop);
    setTimeout(drop, ms + 1500); // a stalled animation (hidden window)
  }
  // inline: open the list over the chat (on) or fold it into its line
  function expandInline(on) {
    if (!hub || !hub.inline) return;
    hub.expanded = !!on;
    if (!on && inlineThread()) return void closePanel(false); // (it folds on the way back)
    syncInlineView(true);
    focusInline();
  }
  // A scroller's edges fade where there is more to scroll (16 px), so a row
  // at an edge reads as "more" and is never just cut. Measured in the next
  // frame (one read for all of them, never a forced reflow mid-render); a
  // scroll measures at once (the layout is clean then).
  const fading = new Set();
  let fadeRaf = 0;
  function fadeSoon(sc) {
    if (!sc) return;
    fading.add(sc);
    if (!fadeRaf)
      fadeRaf = requestAnimationFrame(() => {
        fadeRaf = 0;
        const all = [...fading];
        fading.clear();
        for (const n of all) fadeEdges(n);
      });
  }
  function fadeEdges(sc) {
    if (!sc || !sc.isConnected) return;
    const top = sc.scrollTop > 1 ? "16px" : "0px";
    const bot = sc.scrollHeight - sc.clientHeight - sc.scrollTop > 1 ? "16px" : "0px";
    if (sc.style.getPropertyValue("--rtcb-ft") !== top) sc.style.setProperty("--rtcb-ft", top);
    if (sc.style.getPropertyValue("--rtcb-fb") !== bot) sc.style.setProperty("--rtcb-fb", bot);
  }
  // the card opened on its Agent tab: our request, else the search field
  // (unless the designer is typing somewhere else)
  function onAgentsOpen() {
    if (disposed) return;
    render();
    if (pendingCard) return void applyPending();
    if (!hub || !hub.inline) return;
    const ae = document.activeElement;
    if (ae && ae !== document.body && isEditable(ae) && !hub.el.contains(ae)) return;
    if (!(openId && panel && panel.dataset.inline === "true")) focusInline();
  }

  // ------------------------------------------------------------- lifecycle
  // Event-driven, no polling. The store: its subscribe() and "rtcc:changed"
  // (one microtask: sync, render, thread scan). The DOM: one MutationObserver
  // on the body, childList only (canvas views and their pill row come and
  // go or are re-created by React; comment threads), one frame per batch;
  // one ResizeObserver on the canvas views, their pills and rows (pane
  // resizes, divider drags, tabs shown/hidden), one frame per batch. Timers
  // only while needed: the open panel's clock (1 s while its request works,
  // else 30 s), the next bubble change within a minute (the fresh check
  // dims), the tooltip delay, the flipbook. The 1 h "resolved" move and the
  // 24 h cleanup happen on the next event. Nothing while the window is hidden.
  let scheduled = false;
  function schedule() {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (disposed || !enabled()) return void (enabled() || teardown());
      sync();
      render();
      agScan();
      if (openId) clockOn();
    });
  }
  let domRaf = 0;
  let layoutRaf = 0;
  let viewsSig = null;
  let bodyMO = null;
  let ro = null;
  let slotMO = null;
  const observed = new WeakSet();
  const slotSeen = new WeakSet();
  function domSoon() {
    if (!domRaf && !disposed && !document.hidden) domRaf = requestAnimationFrame(domWork);
  }
  function domWork() {
    domRaf = 0;
    if (disposed || document.hidden) return;
    if (!enabled()) return teardown();
    watchViews();
    const infos = canvasInfos();
    const sig = infos.map((i) => `${i.name}${i.pill ? "+" : "-"}${i.host ? "h" : ""}`).join("\n") + `|${document.querySelectorAll("[data-rtcb-hub-host]").length}`;
    domEpoch++;
    // a view came or went, or React re-created the pill's row (the segment
    // was dropped or is no longer right after the pill): render again
    const stale = [...columns.values()].some((c) =>
      c.root && c.root.isConnected ? (c.hosted ? !c.root.parentElement.matches(SEL.host) || !slotShown(c.root.parentElement) : !!c.pillEl && c.root.previousElementSibling !== c.pillEl) : c.bubbles.size > 0
    );
    if (sig !== viewsSig || stale || (hub && hub.inline && !hub.el.isConnected)) {
      viewsSig = sig;
      render();
    }
    agScan();
  }
  function layoutSoon() {
    if (layoutRaf || disposed) return;
    layoutRaf = requestAnimationFrame(() => {
      layoutRaf = 0;
      if (disposed || document.hidden || !enabled()) return;
      render();
      if (tipFor !== undefined && tipEl && tipEl.hasAttribute("data-show")) hideTip();
    });
  }
  // Every canvas view (shown or not: a tab shown again resizes from 0), its
  // pill and the pill's row.
  function watchViews() {
    if (!ro) return;
    for (const c of document.querySelectorAll(SEL.content[0])) {
      const host = findHost(c);
      const pill = (host && host.closest(SEL.pill)) || findPill(c);
      const els = [c, pill, pill && pill.parentElement, pill && viewOf({ c, pill }), host && hostPill(host)];
      for (const n of els) if (n && !observed.has(n)) (observed.add(n), ro.observe(n));
      if (host && slotMO && !slotSeen.has(host)) (slotSeen.add(host), slotMO.observe(host, { attributes: true, attributeFilter: ["style", "data-rcc-max-w"] }));
    }
  }
  let clockTimer = 0;
  let clockMs = 0;
  function clockOn() {
    if (!openId || document.hidden || disposed) return clockOff();
    const e = cache.get(openId);
    const ms = e && !TERMINAL.has(e.task.status) ? 1000 : 30000;
    if (clockTimer && ms === clockMs) return;
    clockOff();
    clockMs = ms;
    clockTimer = setInterval(() => (openId ? renderPanel(false) : clockOff()), ms);
  }
  function clockOff() {
    clearInterval(clockTimer);
    clockTimer = 0;
    clockMs = 0;
  }
  let nextTimer = 0;
  function planNext() {
    clearTimeout(nextTimer);
    nextTimer = 0;
    if (disposed || document.hidden) return;
    const t = now();
    let at = Infinity;
    for (const e of cache.values()) {
      if (e.task.status === "done" && e.doneAt && e.doneAt + CHECK_MS > t) at = Math.min(at, e.doneAt + CHECK_MS);
      if (e.celebrateUntil > t) at = Math.min(at, e.celebrateUntil);
    }
    for (const en of entries.values()) if (en.state === "done" && en.pinUntil > t) at = Math.min(at, en.pinUntil);
    if (at - t <= 60000)
      nextTimer = setTimeout(() => {
        nextTimer = 0;
        render();
      }, Math.max(50, at - t + 30));
  }
  function onVisibility() {
    if (document.hidden) {
      clockOff();
      clearTimeout(nextTimer);
      nextTimer = 0;
      hideTip();
      return;
    }
    schedule();
    domSoon();
  }

  // Off at runtime: give the pipeline its list back and drop the UI.
  function teardown() {
    document.documentElement.classList.remove(ROOT_CLASS);
    closeHub(false, true);
    if (openId) {
      openId = null;
      if (panel) panel.remove();
    }
    for (const h of document.querySelectorAll("[data-rtcb-host][data-rtcb-thread]")) clearThreadMark(h);
    clockOff();
    clearTimeout(nextTimer);
    nextTimer = 0;
    closeLightbox();
    hideTip();
    agUnmarkAll();
    for (const n of overlays) n.remove();
    overlays.clear();
    for (const c of columns.values()) {
      if (c.root) c.root.remove();
      if (c.pillEl && c.pillEl.isConnected) c.pillEl.removeAttribute("data-rtcb-joined");
    }
    for (const p of document.querySelectorAll("[data-rtcb-joined]")) p.removeAttribute("data-rtcb-joined");
    columns.clear();
    panelCol = null;
    viewsSig = null;
  }

  let disposed = false;
  let initAt = now();
  function init() {
    initAt = now();
    restore();
    if (enabled()) document.documentElement.classList.add(ROOT_CLASS);
    window.addEventListener("rtcc:changed", schedule);
    window.addEventListener("rtcc:launch", onLaunch);
    window.addEventListener("rtcc:agents-open", onAgentsOpen);
    window.addEventListener("rtd:canvas-chrome-change", onChromeChange);
    window.addEventListener("rtac:color", layoutSoon); // agent-cursors gave an agent its colour
    window.addEventListener("resize", layoutSoon);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    if (typeof ResizeObserver === "function") ro = new ResizeObserver(layoutSoon);
    // a slot's width for the segment (data-rcc-max-w, --rcc-agents-max in its style)
    if (typeof MutationObserver === "function") slotMO = new MutationObserver(layoutSoon);
    if (typeof MutationObserver === "function") {
      // a slot's width for the segment changed (data-rcc-max-w): fit again
      bodyMO = new MutationObserver((recs) => {
        if (recs.some((r) => r.type === "attributes" && r.attributeName === "data-rcc-max-w")) layoutSoon();
        // the card's chat got its first message (or another chat came): the
        // list's view follows in the same frame
        if (hub && hub.inline && recs.some((r) => r.attributeName === "data-rcc-hub-chat" && r.target === hub.cardHost)) syncInlineView(true);
        domSoon();
      });
      // childList: views, rows, slots come and go; the slot attribute set on
      // an element that already exists
      bodyMO.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-rtcb-host", "data-rcc-max-w", "data-rtcb-hub-host", "data-rcc-hub-chat"] });
    }
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onDocKey, true);
    document.addEventListener("keyup", onDocKeyUp, true);
    schedule();
    domSoon();
  }

  function dispose() {
    unfollow();
    disposed = true;
    if (bodyMO) bodyMO.disconnect();
    if (ro) ro.disconnect();
    if (slotMO) slotMO.disconnect();
    bodyMO = ro = slotMO = null;
    cancelAnimationFrame(domRaf);
    cancelAnimationFrame(layoutRaf);
    clockOff();
    clearTimeout(nextTimer);
    clearTimeout(tipTimer);
    clearTimeout(holdTimer);
    if (persistTimer) {
      clearTimeout(persistTimer);
      persist();
    }
    window.removeEventListener("rtcc:changed", schedule);
    window.removeEventListener("rtcc:launch", onLaunch);
    window.removeEventListener("rtcc:agents-open", onAgentsOpen);
    window.removeEventListener("rtd:canvas-chrome-change", onChromeChange);
    window.removeEventListener("rtac:color", layoutSoon);
    window.removeEventListener("resize", layoutSoon);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVisibility);
    document.removeEventListener("pointerdown", onDocPointerDown, true);
    document.removeEventListener("keydown", onDocKey, true);
    document.removeEventListener("keyup", onDocKeyUp, true);
    if (unsub) {
      try {
        unsub();
      } catch (_) {}
    }
    teardown();
    if (tipEl) tipEl.remove();
    if (panel) panel.remove();
    for (const c of columns.values()) if (c.root) c.root.remove();
    if (window.__RE_TEMPO_COMMENT_BUBBLES__ === API) delete window.__RE_TEMPO_COMMENT_BUBBLES__;
  }

  const API = {
    open: (id) => openPanel(id),
    // a reply to an agent (canvas-chrome's composer while the card shows its
    // thread): the thread's own path when it is the open one (it shows as
    // "sending", then sent), else straight to the store. -> Promise<boolean>
    reply(id, text) {
      id = String(id || "");
      const t = String(text || "").trim();
      if (!id || !t) return Promise.resolve(false);
      if (openId === id && P) return sendReply(t);
      const a = agent();
      if (!a || typeof a.reply !== "function") return Promise.resolve(false);
      try {
        return Promise.resolve(a.reply(id, t)).then((r) => r !== false, () => false);
      } catch (e) {
        note("reply", e);
        return Promise.resolve(false);
      }
    },
    close: () => closePanel(false),
    // the manager of the first canvas view (or the one named); openList /
    // closeList: the older names
    openManager(name) {
      const col = [...columns.values()].find((c) => !name || c.name === nameKey(name));
      return !!col && (openInCard(col, null) || openHub(col, col.manageBtn));
    },
    closeManager: () => closeHub(false),
    // Where the next new agent's avatar is born in the first slot on screen
    // (a launch animation can land there): at the end of the stack, before
    // "+N" / "Manage agents"; the slot grows to the left when the field
    // before it can still give room (it ends its row), else to the right; an
    // empty slot: where its first avatar will be. {left, top, width, height}
    // (screen px) | null.
    landing() {
      const A = SLOT_AV;
      const box = (l, t) => ({ left: Math.round(l), top: Math.round(t), width: A, height: A });
      const c = [...columns.values()].find((x) => x.hosted && x.root && x.root.isConnected && !x.root.hidden);
      const host = c ? c.root.parentElement : [...document.querySelectorAll(SEL.host)].find((x) => !x.closest("[data-rtcb-root]") && slotShown(x));
      if (!host) return null;
      const hr = host.getBoundingClientRect();
      const mid = hr.top + hr.height / 2 - A / 2;
      // the slot grows to the left when its row packs it to the end, or a
      // flexible field before it (or before its row, 3 levels up) can shrink
      const said = host.getAttribute("data-rcc-grow"); // canvas-chrome: "right" | "left"
      let growsLeft = said === "left";
      for (let n = host, d = 0; !said && n && n !== document.body && d < 3 && !growsLeft; n = n.parentElement, d++) {
        const pj = n.parentElement ? getComputedStyle(n.parentElement).justifyContent : "";
        if (d === 0 && /(flex-end|end|right)/.test(pj)) growsLeft = true;
        for (let m = n.previousElementSibling; m && !growsLeft; m = m.previousElementSibling) {
          const cs = getComputedStyle(m);
          if (parseFloat(cs.flexGrow) > 0 && m.getBoundingClientRect().width > (parseFloat(cs.minWidth) || 0) + 14) growsLeft = true;
        }
      }
      // empty: [button][6][avatar]; the button concentric with the pill (as mount() sizes it)
      if (!c) {
        const pe = hostPill(host);
        let b = 22;
        if (pe && pe !== host) {
          const pc = getComputedStyle(pe);
          const ph = pe.getBoundingClientRect().height;
          if (ph > 0 && ph <= 64) b = Math.round(Math.max(22, Math.min(40, ph - 2 * ((parseFloat(pc.paddingLeft) || 0) + (parseFloat(pc.borderLeftWidth) || 0)))));
        }
        const w = b + 6 + A;
        const right = host.nextElementSibling ? host.nextElementSibling.getBoundingClientRect().left - 4 : hr.right;
        return box((growsLeft ? right - w : hr.left) + b + 6, mid);
      }
      const bs = [...c.railEl.querySelectorAll(".rtcb-bubble")];
      const last = bs[bs.length - 1];
      const more = c.moreBtn && c.moreBtn.isConnected ? c.moreBtn.getBoundingClientRect() : null;
      const k = Number(c.root.dataset.k);
      const mg = c.manageBtn.getBoundingClientRect();
      // "+N" there: the stack keeps its width, the new one takes the last place
      if (more) return box(more.left - (A - 6), mid);
      // no avatar yet (only resolved ones): right after the button
      if (!last) return box(growsLeft ? mg.right + 6 - (A + 6) : mg.right + 6, mid);
      const lr = last.getBoundingClientRect();
      // full: the last place, "+N" comes (A - 6 px more); else one more after the last
      if (Number.isFinite(k) && bs.length >= k) return box(growsLeft ? lr.left - (A - 6) : lr.left, mid);
      return box(growsLeft ? lr.left : lr.left + (A - 6), mid);
    },
    openList(name) {
      return API.openManager(name);
    },
    closeList: () => closeHub(false),
    follow: (id) => follow(id),
    unfollow: () => unfollow(),
    showResolved: (on) => setShowResolved(on !== false),
    refresh() {
      sync();
      render();
    },
    state() {
      const cols = [...columns.values()].map((c) =>
        withCol(c, () => {
          const v = view(c.name);
          return {
            name: c.name,
            mounted: !!(root && root.isConnected),
            counter: countEl && !countEl.hidden ? countEl.textContent : "",
            ids: v.shown.map((e) => e.task.id),
            position: root && root.isConnected ? (({ left, top, width, height }) => ({ left, top, width, height }))(root.getBoundingClientRect()) : null,
          };
        }),
      );
      const first = [...columns.values()][0];
      if (first) loadCol(first);
      const v = first ? view(first.name) : view(undefined);
      const out = {
        columns: cols,
        enabled: enabled(),
        mounted: !!(root && root.isConnected),
        hosted,
        source: sourceKind,
        openId,
        showResolved,
        counter: countEl && !countEl.hidden ? countEl.textContent : "",
        hiddenResolved: v.hidden,
        compare: openId && P && P.car ? P.car.key() : null,
        follow: followId,
        spread: !!(root && root.dataset.spread === "true"),
        lastChat,
        // the manager (also as "list", its older name)
        list: hubState(),
        manager: hubState(),
        slot: (() => {
          const c = [...columns.values()].find((x) => x.hosted && x.root && x.root.isConnected);
          if (!c) return null;
          const h = c.root.parentElement;
          return {
            maxW: Number.isFinite(slotMax(h)) ? slotMax(h) : null,
            fit: c.root.dataset.fit || null,
            width: Math.round(c.root.getBoundingClientRect().width),
            avatars: [...c.railEl.querySelectorAll(".rtcb-bubble")].map((b) => ({ id: b.dataset.id, n: b.dataset.n, status: b.dataset.status, color: b.style.getPropertyValue("--rtcb-agent") })),
            more: c.moreBtn && c.moreBtn.isConnected ? c.moreBtn.textContent : null,
            manage: !!(c.manageBtn && c.manageBtn.isConnected),
            counter: c.countEl && !c.countEl.hidden && c.countEl.getBoundingClientRect().width > 0 ? c.countEl.textContent : null,
          };
        })(),
        entries: entryLog.slice(),
        overlays: overlays.size,
        media: (() => {
          if (!openId || !panel) return null;
          const c = panel.querySelector(".rtcb-car");
          const im = c && c.querySelector(".rtcb-car-stage img");
          return {
            kind: c ? "carousel" : null,
            slides: P && P.car ? P.car.slides() : [],
            slide: P && P.car ? P.car.key() : null,
            playing: openId ? playingOf(openId) : null,
            src: im ? im.src.slice(0, 22) : null,
            model: P && !P.model.hidden ? P.model.textContent : null,
            notes: [...panel.querySelectorAll(".rtcb-note")].map((n) => n.textContent),
            lastCopy,
          };
        })(),
        agentReplies: [...agMsgs.entries()].map(([msg, r]) => ({ commentId: msg.getAttribute("data-comment-id"), task: msg.getAttribute("data-rtcb-agent"), media: msg.getAttribute("data-rtcb-media"), connected: r.card.isConnected })),
        bubbles: v.shown.map((e) => {
          const b = bubbles.get(e.task.id);
          return {
            id: e.task.id,
            n: e.n,
            status: e.task.status,
            author: e.task.author.initials,
            fresh: !!(b && b.btn.classList.contains("rtcb--fresh")),
            faded: !!(b && b.btn.classList.contains("rtcb--faded")),
            celebrating: !!(b && b.btn.classList.contains("rtcb--celebrate")),
          };
        }),
        replies: Object.fromEntries([...cache.values()].filter((e) => e.mine.length).map((e) => [e.task.id, e.mine.map((m) => ({ text: m.text, state: m.state }))])),
        position: root && root.isConnected ? (({ left, top, width, height }) => ({ left, top, width, height }))(root.getBoundingClientRect()) : null,
        errors: errors.slice(),
      };
      if (first) saveCol(first);
      return out;
    },
    dispose,
  };
  window.__RE_TEMPO_COMMENT_BUBBLES__ = API;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
