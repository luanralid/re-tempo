/*
 * RE-TEMPO · canvas-comment-agent (user MOD layer)
 * ---------------------------------------------------------------------------
 * A comment you post on a canvas becomes a task for a Claude chat. This mod is
 * the pipeline (trigger -> chat -> status -> screenshots) and exposes the
 * tasks as an observable store for a UI mod (comment-bubbles). Its own compact
 * list over the left sidebar is the minimal fallback UI: hidden while
 * html.rtcb-on is set.
 *
 * Public API: window.__RE_TEMPO_COMMENT_AGENT__
 *   tasks()          -> Task[] (copies, oldest first; at most 50, persisted in
 *                       localStorage "rtd.commentAgent.tasks", survive reload)
 *   task(id)         -> Task | null
 *   subscribe(cb)    -> unsubscribe(); cb(tasks) after every change (not on
 *                       subscribe: read tasks() first)
 *   window event "rtcc:changed", event.detail = { tasks } (same moments)
 *   openChat(id)     -> boolean; the task's chat selected in the center (chat
 *                       route). The only call that leaves the canvas: explicit
 *                       "Open chat" actions only
 *   reply(id, text)  -> Promise<boolean>; sends `text` to the task's chat in the
 *                       background (same path as the prompt, the chat does not
 *                       open); true when the chat accepted it: a new turn, or
 *                       queued behind the running one
 *   stop(id)         -> Promise<boolean>; the chat's Stop button for that
 *                       task (see Stop): its turn aborted, the task "failed"
 *                       with error "Stopped by you" (task.stoppedAt set); a
 *                       "queued" task leaves the send queue (no chat is
 *                       created, no prompt sent). Never changes the route or
 *                       the active tab. false: no such task, not queued /
 *                       running / needs-input, or the app could not abort
 *                       its turn (the task is left as it was)
 *   stopAll()        -> Promise<number>; stop() on every queued / running /
 *                       needs-input task at once; how many were stopped
 *   dismiss(id)      -> boolean; removes the task from the store
 *   createTask(p)    -> Task (a snapshot, already "queued"); a task that is
 *                       not a comment: a canvas note's "Run" (canvas-notes.js,
 *                       source "note") or the canvas composer's prompt
 *                       (canvas-chrome.js, source "composer"). anchor null:
 *                       the request is about the canvas as a whole: before /
 *                       after / GIF show the canvas's visible area (region
 *                       kind "viewport", no storyboard crop) and the prompt
 *                       says "Canvas: <name> (no specific element)".
 *                       p = { text, canvasName?,
 *                       canvasPath?, storyboardName?, anchor: { x, y,
 *                       nodeId?, noteId? }?, source? ("note"), noteId?,
 *                       model?, effort?, modelId?, effortId? }. Same flow as a
 *                       comment (before, chat in the background, status,
 *                       frames, after, GIF) without a Convex thread, so no
 *                       thread reply. anchor.nodeId = the storyboard (canvas
 *                       item or storyboard id) the anchor belongs to.
 *                       canvasName = the canvas name pill of the view that
 *                       holds the note (what comment-bubbles matches), else
 *                       the design tab label / canvasPath's folder / the
 *                       payload's canvasName.
 *                       model / effort (ids or labels: "opus-5.5-1m" /
 *                       "Opus 5.5", "high" / "High") become the new chat's
 *                       when the app knows that model (chat defaults or a
 *                       chat tab use it), else the chat keeps the app's
 *                       defaults; task.model / effort are read back from the
 *                       chat. The same noteId and text again within 3 s
 *                       returns the same task. Throws on an empty text or
 *                       when the mod is off.
 *   window event "rtcn:submit" (canvas-notes' fallback): detail = the same
 *                       payload plus respond(taskOrId); the task is created
 *                       as with createTask and given to detail.respond(task)
 *                       (detail.taskId = id when there is no respond);
 *                       detail.handledBy is set, so a second listener skips it
 *   window event "rtcc:launch" {taskId, text, rect, pin, source: "comment",
 *                       capturing} on Enter for a comment (canvas-chrome sends
 *                       its own for the composer): rect = the comment field,
 *                       pin = the pin's 34 px bubble (DOMRects, viewport px);
 *                       capturing = "before" is being taken (the pins hide
 *                       until "rtcc:captured" {kind})
 *   window event "rtcc:activity" = one tool call of the task's agent (see
 *                       Stream): {taskId, id, tool, displayName, phase:
 *                       "start" | "end", status, at, kind, label, file?,
 *                       storyboard?, point?, nodeId?}
 *   Task = {
 *     id,                 "h:thread:<time36>" | "h:reply:<time36>" (a comment:
 *                         made on Enter, before the server answers; tasks of
 *                         older versions: "t:<threadId>" | "c:<commentId>")
 *                         | "n:<noteId>:<time36>" (createTask, source "note")
 *                         | "x:<time36>" (createTask, other sources)
 *     source,             "comment" | "note" | "composer" (createTask's source)
 *     noteId,             createTask's noteId (also anchor.noteId) | null
 *     threadId, commentId, text,       threadId / commentId null for notes
 *     author: { name, initials, color },   name = first word, as the comment shows it
 *     canvasName, storyboardName,
 *     anchor: { x, y, nodeId?, selector?, noteId? } | null,  x/y in canvas (world)
 *                         coordinates, the pin's; nodeId = storyboard id;
 *                         selector = element under the pin (tag#id.class)
 *     createdAt, chatId, workspaceId,
 *     status: "queued" | "running" | "needs-input" | "done" | "failed",
 *     startedAt, finishedAt,
 *     model, effort,      labels of the chat's model and effort ("Opus 5.5",
 *                         "High"): read when the chat is created, kept up to
 *                         date until it finishes; null when unknown
 *     modelId, effortId,  the raw ids ("opus-5.5-1m", "high")
 *     before: { dataUrl, w, h } | null,    what the change looked like before
 *     after:  { dataUrl, w, h } | null,    / after the run, both in the
 *                         change's frame (see Screenshots: change shots;
 *                         JPEG, up to 960x1280); before is null when nothing
 *                         was there (shot.empty). While the task works,
 *                         before is the pin's region on Enter
 *     shot: { v: 2, frame: {x, y, w, h} (canvas units), boxes: [{fx, fy,
 *             fw, fh, kind: new | edited | moved | removed, label}] (the
 *             changed areas, fractions of the picture), pin: {fx, fy} |
 *             null, empty, src: offscreen | mixed | window, k (px per
 *             unit), note: string | null (a fallback said in words),
 *             provisional? (the run's last frame, until it renders) } | null
 *     replay: { w, h, durMs (<= 6000), frames: [{dataUrl, t}] (before, the
 *             states in between, after), cursor: [{t, fx, fy, kind, label}]
 *             (the agent's cursor on that timeline) } | null
 *     gif: { dataUrl, frames, w, h, bytes } | null   the run as an animated
 *                         GIF (2 fps, <= 480 px wide, loops): before, the
 *                         frames taken while running, after
 *     frames: [{ dataUrl, w, h, at }] | null   first, middle and last frame
 *                         (JPEG): the fallback when there is no GIF
 *     summary: string | null,              last assistant text, <= 300 chars
 *     updates: [{ at, kind: "text" | "screenshot" | "note", text?, dataUrl?,
 *                 shot? }]  screenshot text = "before" | "after" | "agent"
 *                         (an image the chat produced); "note" = why a
 *                         capture is missing (shot = before | after | gif)
 *     postedAt: number | null              when the server took the comment
 *                                          (threadId / commentId set then)
 *     activity: { id, tool, kind, label, status, at, n } | null  the agent's
 *                         latest tool call (n = calls so far), see Stream
 *     timing: { at, launched, started, firstTool }  ms timestamps: Enter, the
 *                         chat created, its first turn running, first tool call
 *     captureError: string | null          the last capture failure, cleared
 *                                          when that capture succeeds later
 *     error: string | null                 why it failed ("Stopped by you"
 *                                          after stop())
 *     stoppedAt: number | null             when stop() stopped it (cleared
 *                                          when reply() starts it again)
 *   }
 *     lastFrame: { dataUrl, w, h, at } | null  the last frame captured (PNG,
 *                         memory only), e.g. a hover preview of a running task
 *     region: { kind, x, y, w, h } | null  what the captures show, in canvas
 *                         (world) coordinates (kind "screen": screen px);
 *                         kind storyboard | anchor | view | viewport | screen
 *   Overlay UIs never need to hide for a capture: the pipeline masks every
 *   overlay ([data-rtcb-root], .rtcb-panel, .rtcb-pop, .rtcb-tip, .rtcb-lb, its own
 *   list, the comment popover) out of the image. html.rtcc-capturing is set
 *   only while "before" / "after" are taken (~0.1 s each), or a frame that
 *   changed under the popover is retaken, and hides only the app's comment
 *   popover (this mod's CSS).
 *   Also: jobs() (alias of tasks()), state (state.dispatch = last send: how,
 *   route/center before, restored, submit, started, reason, step), handled(),
 *   lastPrompt(), forget(id?), setEnabled(bool), found().
 *
 * Trigger (renderer bundle index-D2Ui1vc0.js, read 2026-10-18):
 *   - The comment UI posts through the app's useMutation ($I -> Yvn), which
 *     calls `client.mutation(ref, args, {optimisticUpdate})` on the logged-in
 *     ConvexReactClient at call time:
 *       comments:createThread {orgProjectId, branch, contentPath, positionX,
 *                              positionY, body, attachmentIds}   (new thread)
 *       comments:addComment   {threadId, body, attachmentIds}     (reply)
 *     The mod wraps `mutation` on that client instance (own property, the
 *     prototype is untouched) and acts on the call itself (the user's Enter),
 *     not one server round trip later: the task is in the store, "queued",
 *     in that tick ("rtcc:launch" goes out with it) and its chat starts at
 *     once. When the promise resolves the task gets the thread's ids
 *     (postedAt); when it rejects (the comment was not posted) the task is
 *     stopped and fails with "The comment wasn't posted". Only what this
 *     window's user posts goes through it; other people's and agents'
 *     comments arrive through subscriptions and never trigger.
 *   - Once per comment: the task's id, then the server's ("t:<threadId>" /
 *     "c:<commentId>"), are written to localStorage
 *     "rtd.commentAgent.handled". Edits, reactions and empty
 *     (attachment-only) comments are ignored. The mod's own thread reply is
 *     muted while it is posted.
 *   - Context: author from authBridge.getUserInfo() (the app's comment author
 *     source: first word as the name, first+last initials, color =
 *     LG(userId), the app's avatar palette); canvas = the design tab label,
 *     else the contentPath; storyboard = the [data-canvas-item-id] whose
 *     --canvas-item-x/y/width/height box (world coordinates, the same space as
 *     positionX/Y) holds the pin, named by its [data-storyboard-header];
 *     element = the DOM element under the pin, when it is not an iframe.
 *     comments:getThread gives the comment id, the reply's pin position and
 *     the earlier comments (after the post for a new thread, off the launch
 *     path; before the chat for a reply, 1.5 s at most).
 *   - Launch, in parallel: "before" (started in the Enter tick), the author
 *     (authBridge, cached after the first comment; the prompt waits 250 ms at
 *     most) and the chat. The chat never waits for "before" nor for the
 *     server; only its create step is serialized with other sends (one store
 *     write at a time), waiting for a turn to start holds nothing back.
 *
 * Execution, in the background (the user stays on the canvas: same route,
 * same active tab, no chat view, no composer):
 *   - Engine: the chat orchestrator registry (jW() in the bundle, found in a
 *     React compiler memo cache) keeps one host per chat tab, keyed
 *     {workspaceId, chatTabId}: getActions(key).submit(content) starts a turn,
 *     getSnapshot(key).phase tells idle | submitting | streaming |
 *     waiting_for_input, getHost(key).getSessionController().enqueueMessage()
 *     queues behind a running turn (the app's C5n.submitTurn). The app's
 *     headless host mounter (STa / I5n, F5n) mounts and readies a host for
 *     every chat tab of the selected workspace with no chat view; agent runs
 *     start turns in chats nobody looks at this way.
 *   - Prompt: workspaces store createChatTabWithMessage(prompt, {name}) (title
 *     = the comment, truncated) creates a primary chat (it lands in the chat
 *     list, not in the canvas's tab bar) and submits the prompt itself in a
 *     microtask through that registry. It also makes the chat the active tab:
 *     in the same tick the mod puts the user's tab back with
 *     setActiveCenterTab(previous tab), which also restores its owner chat,
 *     so React never renders the switch. Without createChatTabWithMessage:
 *     createChatTab({name}), same restore, then the mod's own submit.
 *   - Steps run one per macrotask (setTimeout), outside React's render, each
 *     in try/catch; the only two store calls sharing a tick are create +
 *     restore. If the app's submit does not show up within 1.5 s, the mod
 *     submits; an accepted submit must show a run (phase, isChatInProgress or
 *     a session) within 8 s. Any step error or a run that never starts ->
 *     "failed" with `error` (the prompt is left in the chat's draft, ready to
 *     send from "Open chat"). "queued" lasts at most 20 s, then "failed"
 *     (a dispatch still waiting then creates no chat).
 *   - reply(id, text): the same submit on the task's chat (enqueue while a
 *     turn runs). Sends are serialized.
 *   - The prompt: the comment and its context (canvas, storyboard, anchor,
 *     element, branch, thread), what the agent can do on the canvas (the
 *     UI-drive mod's help() and its canvas actions with params, read from
 *     window.__RE_TEMPO_UI_DRIVE__ at send time: canvas.browser.create /
 *     navigate, canvas.node.upsert / remove with the format of
 *     window.__RE_TEMPO_CANVAS_NODES__.format(), ui.find / click / type,
 *     tempo-ui screenshot --canvas; a static list without those mods), and
 *     rules: a browser / page / site / preview is a Browser frame on this
 *     canvas near the anchor, not an app tab; small tasks done directly, no
 *     subagents; the reply in the comment's language, 1-2 sentences, no
 *     status tables; a canvas screenshot after a change. Images in the chat's messages (Anthropic
 *     image blocks, also inside tool results) become "agent" screenshot
 *     updates (at most 4, in memory only).
 *   - Model and effort: the chat tab's own `model` / `effort` (workspaces
 *     store; the composer's pickers write them), else the store's
 *     chatDefaults; label = the composer's model button text when that chat
 *     is mounted, else the id spelled like the app's shortName without the
 *     context suffix ("opus-5.5-1m" -> "Opus 5.5"); effort labels as the
 *     app's Effort menu (xhigh -> "Extra High").
 *
 * Stop (renderer bundle index-D2Ui1vc0.js, read 2026-10-18):
 *   - The composer's Stop button (data-testid chat-input-stop-button,
 *     aria-label "Stop generating") runs the chat view's handleStopStreaming
 *     (D8n), whose abort is the view's dispatchOrchestratorAbort: the chat
 *     execution port C5n({registry: jW()}).interruptTurn(key, requestId)
 *     (next to its submitTurn), which checks the host's session controller
 *     currentRequestId and calls the orchestrator registry's
 *     getActions(key).abort() (g1n): AbortRequested (phase "aborting", a
 *     pending submit dropped), then the session controller's abort() (the
 *     runner: completion status "aborted", streaming off, the CLI request
 *     aborted over the bridge), then AbortAcknowledged. The rest of
 *     handleStopStreaming is view state (the stopped first prompt put back
 *     in the composer, a rewind marker) that a chat with no view lacks.
 *   - stop(id) calls that same getActions(key).abort() on the task's chat
 *     when a turn runs (orchestrator phase not idle, or the store's
 *     isChatInProgress); nothing else. Follow-ups reply() queued behind the
 *     turn are dropped first with the session controller's
 *     cancelQueuedMessage (the queue chip's cancel): the app sends its queue
 *     only after a turn that completed, so they would run after the next
 *     one. The task is marked in the caller's tick (stopAll(): every task in
 *     one tick), so a dispatch still waiting creates no chat and submits
 *     nothing, and the abort never waits behind the send queue. For 30 s
 *     the tick aborts a first turn that starts late (the app's own first
 *     submit waits for the chat's host). The chat is archived as any failed
 *     task's. reply() on a stopped task starts it again.
 *     state.stop / state.stops = the last stops (abort: aborted | idle |
 *     no-chat | no-host | timeout | rejected, dropped = follow-ups dropped).
 *
 * Status (a 500 ms tick, running only while there is work: stores not found
 * yet, a task queued / running / waiting, a send, an "after" (10 min at
 * most), a GIF or a thread reply to come, a mini list row; idle = no timer):
 * workspaces store isChatInProgress(ws, tab) (the
 * sidebar's spinner check); tab.isAwaitingResponse or the chat session
 * store's getIsWaitingForInput(key) -> "needs-input"; getCompletionStatus(key)
 * "errored" / "aborted" -> "failed"; not in progress for 2 ticks after the
 * run was seen (or the session exists) -> "done". key = tab.sessionId, else
 * the mounted .chat-view[data-chat-session-id]. Assistant texts come from
 * window.__chatSessionStoreDebug.getMessages(key) / getCachedMessages(key)
 * (the app's debug handle, as bg-tasks reads it): each finished assistant
 * text is an update; the last one is the summary.
 *
 * Stream (what the agent does, as it does it): while a task runs, the chat
 * session store's own subscribe(key, cb) (the store the chat view renders
 * from) wakes a read of its messages, at most every 90 ms, besides the tick.
 * Each tool call (message.toolCalls {id, name, args, status}, else tool_use
 * blocks and their tool_result) that appears or ends sets task.activity and
 * sends "rtcc:activity" (see the API). kind and label come from the tool:
 * Read / Grep / Glob "read" ("Reading Hero.tsx"); Write "create"; Edit /
 * MultiEdit "edit", or "style" for a stylesheet or a change of classes /
 * colours ("Styling Hero.tsx"); a write to a .canvas.tsx file "canvas"
 * ("Editing the canvas", storyboard = the name / title it writes); the
 * canvas tools (mcp__tempo-design-canvas-tools__*) canvas / layout / check /
 * shot; Bash "run", or ui-drive's tempo-ui commands: canvas.browser.* /
 * canvas.node.* "node" with their x / y (point, canvas coordinates) and id
 * (nodeId), ui.click / type "click", screenshot "shot". agent-cursors turns
 * them into the cursor's moves and captions. A task restored after a reload
 * takes the calls already there silently (task.toolSeen is persisted).
 *
 * Where the messages are: a background chat has no chat view, and its tab's
 * sessionId is not where its turn writes while it runs. Its orchestrator
 * host's session controller writes into the session store under its own key
 * (storeKey: "__host_pending_<ws>_<tab>_<n>" until the CLI session exists,
 * then the session id; the store aliases the first to the second). So the
 * key comes from that controller (F.reg.getHost({workspaceId, chatTabId})
 * .getSessionController().storeKey); tab.sessionId and a mounted chat view
 * are fallbacks. (Reading tab.sessionId only, the tasks of 2026-10-18/19
 * saw no tool call and at most one early text of their runs.)
 *
 * Contract (window events for the cursor's choreography, agent-cursors;
 * rect = DOMRect in viewport px, x / y = canvas coordinates):
 *   rtca:launch {taskId, agent: {model, effort, n: null}, color: null,
 *     pinRect, composerRect, rect, anchor, canvasName, source, text,
 *     capturing, at}: every new task in its first tick (a comment: on
 *     Enter, pinRect = its pin's bubble; the composer / a note: their box).
 *     The colour and the request number are agent-cursors' / comment-bubbles'.
 *   rtca:thinking {taskId, at}: running with no tool call open (on start,
 *     and 1.2 s after the last call ended).
 *   rtca:action {taskId, id, kind, label, tool, target, source, matches?, at}
 *     kind create | edit | style | move | resize | canvas | layout | shot |
 *     click; target {file, storyboardName, nodeId, selector, rect, x, y,
 *     fallback?}. source "stream": a tool call that changes the canvas, when
 *     it starts (the box a canvas edit declares, `<…Storyboard id name
 *     layout={{x, y, width, height}}>`, a storyboard on screen named by the
 *     call, tempo-ui's x / y or frame, else the comment's storyboard, else
 *     its pin: fallback "pin"). source "canvas": a storyboard that appeared,
 *     moved or was resized on the canvas while a task runs (not during the
 *     user's pointer, key or wheel, nor > 3 at once), for the task that named
 *     it, else the one whose pin is nearest; matches = that task's stream
 *     action on it within 6 s.
 *   rtca:action-end {taskId, id, status, at}: that call ended.
 *   rtca:needs-input {taskId, at}, rtca:done {taskId, at}, rtca:failed
 *     {taskId, reason, why, at}.
 *   Restored tasks (a reload) send nothing for what already happened.
 *
 * The task's chat is a background chat, never a window of its own:
 *   - while the task works it is hidden from the app's tab fallback: the
 *     workspaces store's own subscribe (the useSyncExternalStore subscribe
 *     next to its getter; listeners run inside setState, before React
 *     renders) sees the active center tab move to a task chat (or a tab it
 *     owns) in the same change that closed or archived the active tab: the
 *     app's pick after a close. In that same tick the active tab goes to the
 *     closed tab's nearest live neighbour (right first) that is not a task
 *     chat, else, as the app does when its last chat closes, a new chat
 *     (createChatTab). A task chat made active while the previous tab stays
 *     (the sidebar, "Open chat") was opened on purpose: revealed, a tab like
 *     any other from then on (task.revealed, kept). No subscribe found: the
 *     same check on every 500 ms tick. state.guard = the last revert.
 *   - finished (done / failed, 1.5 s later, its last messages read) or
 *     dismissed: the chat is archived with the app's own archiveChatTab(ws,
 *     tab, {allowPromoted: true}) (the sidebar's "Archive"; the app refuses
 *     while a turn runs: not tried until the chat is idle, then 8 tries), the
 *     id kept in the Task (task.chatArchived = true). Not while it is on
 *     screen (the active center tab or a split pane's): when it leaves. A
 *     revealed chat stays. If the app opens a new chat for it (the last live
 *     chat archived), the user's tab is put back in the same tick.
 *   - "Open chat": unarchiveChatTab(ws, tab) (it selects it), revealed.
 *     reply(): unarchived without selecting it, then sent.
 *   - boot: finished tasks with live chats are archived as above; chats no
 *     task knows any more whose first message is one of this pipeline's
 *     prompts ("Canvas comment from …", "Canvas note from …", "Canvas request
 *     from …", from the session store's cached messages) are archived once
 *     (state.migrated).
 *
 * Thread reply (off with "rtd.commentAgent.reply" = "off"): when a run is
 * done, once its GIF is built (or "after" taken on a restored task, or 30 s
 * after "done"), the agent's result goes to the comment thread through the
 * app's comments:addComment, in the agent's voice: the first 1-2 sentences
 * of the last text block of the last assistant message (the summary when
 * there is none), then a marker line "· task <id> · <model> · <effort>"
 * that comment-bubbles turns into Claude's message (avatar, chip,
 * before/after, GIF). The "after" JPEG and the GIF are attached natively
 * (comments:generateAttachmentUploadUrl -> POST the blob ->
 * comments:recordAttachmentUpload -> attachmentIds, the composer's own
 * upload; the app takes PNG/JPEG/WebP/GIF up to 10 MB), so the thread shows
 * them without the mod too. The comment is still authored by the signed-in
 * user: the client's addComment takes no author (agent comments are
 * attributed server-side). A reply sent from the panel starts a new run,
 * which posts its own result. task.replyCommentId = the last posted comment.
 *
 * Screenshots: change shots. The pictures a finished task shows are of what
 * it changed, rendered at their own density, whatever the user's zoom or
 * camera (which is never moved):
 *   - on Enter the canvas's storyboards are snapshotted, each projection
 *     document's HTML (the <head>, shared, kept once), in idle slices of
 *     <= 4 ms; while it runs, every 1.5 s, a storyboard whose HTML or box
 *     changed is a new state (8 per storyboard, 4 MB per task);
 *   - 3 s after "done": the changes (storyboards and mod frames new, moved,
 *     resized, removed; storyboards edited), minus those another task named
 *     and this one did not; an edit in a big storyboard (> 900 units, or
 *     < 2% of it) is found by a pixel diff of two 160 px renders and framed
 *     with part of its storyboard, else the whole storyboard is framed. The
 *     frame: the changes (and where a moved one was), the pin unless it
 *     makes it > 2.5x bigger, padded, >= 240 units, ratio 0.56-2.2;
 *   - a hidden <webview> (partition "rtcc-shots", fixed at the window's
 *     top-left under everything, opacity 0: a guest off the viewport never
 *     paints) gets each storyboard's document (about:blank +
 *     document.write: data: URLs are refused), a zoom factor for the
 *     frame's density, then capturePage(); toJPEG is the one synchronous
 *     step (<= 2 ms). Mod frames come from a window capture that showed
 *     them, else a labelled outline;
 *   - after / before / shot / replay (see Task); the GIF is made of the
 *     replay's frames. No <webview>: the window path below, on the pin's
 *     region; nothing 20 s after "done": the run's last frame (shot.note).
 *     The canvas not mounted: again every 2 s (10 min), past 20 s the last
 *     frame as a provisional after (shot.provisional), replaced later.
 * The window path: window.bugReportBridge.captureAppScreenshot() (the bug
 * report dialog's capture of the app window, {ok, dataUrl}; nothing is
 * uploaded), cropped in a 2D canvas. One region per task, fixed in canvas (world)
 * coordinates by its first capture: the whole storyboard the pin (a note's
 * centre, or createTask's anchor.nodeId) is on (or within 24 px of), plus a
 * 16 px margin; with no
 * storyboard there (empty canvas, a loose pin) the canvas around the anchor,
 * 480x320 CSS px, the pin a third in from the top-left. World -> screen
 * comes from the pin layer's --canvas-view-x/y/zoom (the app sets them on
 * every canvas, empty or not), else from a visible canvas item's world box,
 * else the region is a fixed screen box in the middle of the canvas. Same
 * region, same framing for before, the GIF frames and after:
 *   - "before": on Enter, while the chat starts (the agent's first edit is
 *     seconds away), the app's comment popover and pins hidden
 *     (html.rtcc-capturing, ~0.1 s; agent-cursors' flights stay and are
 *     masked); "rtcc:captured" when they are back. The window capture is
 *     kept as a Blob, each crop decoded and scaled off the main thread
 *     (createImageBitmap) and the PNG frame encoded with toBlob, so no
 *     capture blocks the main thread more than a few ms (a whole-window
 *     drawImage plus toDataURL took ~55 ms, while the cursor flies);
 *   - frames while "running": 0.9 s after each new tool call / result in
 *     the chat (the canvas may change now), else every 2 s doubling while
 *     nothing changes up to 30 s (back to 2 s on a change; slow captures
 *     double it too); at most 24 (past that every other one is dropped).
 *     Identical frames are skipped, hashed (32x20 grey thumbnail) before any
 *     encoding; tasks due together share one screenshot (400 ms). A
 *     frame hides nothing; one that changed while the app's comment popover
 *     covers part of the region is retaken once with that popover hidden
 *     (html.rtcc-capturing, ~0.1 s);
 *   - in every capture the overlays over the region (bubbles, panel,
 *     tooltip, lightbox, this list, the comment popover when shown) are
 *     masked: the previous frame's pixels there, else the canvas background
 *     colour; nothing of the mods' UI ever hides; the comment pins and the
 *     canvas notes (.rtcn-note) are hidden while "before" / "after" are
 *     taken and masked in the frames;
 *   - "after" (the window path only): 3 s after the task is done, or later,
 *     as soon as the region is 85% on screen again; it is also the GIF's
 *     last frame. "before" keeps its whole window capture (and its view)
 *     until the end: the change's frame is cut from it for the mod frames.
 * The GIF (GIF89a encoded here: one 256-colour median-cut palette, no
 * dithering, LZW, each frame only the rectangle that changed, loops) is
 * built once "after" is taken, or 20 s after "done" without it, in an idle
 * callback (requestIdleCallback, 2 s at the latest). A capture
 * that cannot be taken leaves a "note" update and captureError, never
 * nothing. localStorage (the app's own quota): one debounced write per 1.5 s
 * at most, within 2M chars (~4 MB): every task's metadata (shot included),
 * then images newest first while they fit: after/before (and the 3 key
 * frames) for the 12 most recent tasks, the replay (else the GIF when
 * <= 300 KB) for the 3 most recent; the oldest lose their images first.
 *
 * Mini list: fixed over the left sidebar ([data-rtps-root], else the native
 * left panel or route sidebar), just above its footer; inside
 * [data-rtcc-host] when another mod provides one. Rows: queued/running
 * (spinning Claude logo), needs-input, then done (check, 8 s) or failed
 * (12 s). Click opens the chat.
 *
 * Off switch: localStorage "rtd.commentAgent" = "off". Change shots only:
 * "rtd.commentAgent.shots" = "off" (the window path, as before; read live).
 * Test hooks: window.__RE_TEMPO_COMMENT_AGENT_CFG__ = { tickMs, doneMs,
 *   failMs, scanMs, afterDelayMs, queuedMs, hostWaitMs, appSubmitMs, startMs,
 *   frameMs, frameIdleMs, gifWaitMs, replyWaitMs, persistMs, persistMax,
 *   stopWaitMs } read
 *   once at load.
 *   CFG.dryRun = { rttMs } (or __RE_TEMPO_COMMENT_AGENT__._dry({ rttMs }) at
 *   runtime, _dry(false) off, dropping its tasks): QA on a signed-in account.
 *   comments:* mutations never reach the server (they resolve with null
 *   after rttMs), the chat is not created (the task "runs" from where it
 *   would be created, task.dry), no thread reply, no getThread, dry tasks
 *   are never persisted. _sim(id, { messages?, status?, error? }) drives a
 *   dry task as its chat would (messages in the session store's shape;
 *   status running | needs-input | done | failed; bind: { workspaceId,
 *   chatId } makes it read that live chat's messages through the real
 *   session store path, without sending anything). _describeTool(name, args)
 *   is the Stream's tool -> { kind, label, ... }; _hosts() lists the engine's
 *   hosts with their session controller's key and message count.
 *   __RE_TEMPO_COMMENT_AGENT__
 *   ._gif(frames, opts) is the GIF encoder (ImageData[] -> Uint8Array).
 *   ._chat(id) -> { phase, busy, inProgress, completion, requestId, queued,
 *   host, archived } | null: the task's chat as stop() sees it.
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (window.__RE_TEMPO_COMMENT_AGENT__) return; // double injection

  // ---------------------------------------------------------------- config
  const CFG = window.__RE_TEMPO_COMMENT_AGENT_CFG__ || {};
  const OFF_KEY = "rtd.commentAgent"; // "off" = disabled
  const REPLY_KEY = "rtd.commentAgent.reply"; // "off" = no thread reply
  const SHOTS_KEY = "rtd.commentAgent.shots"; // "off" = no change shots (the window path only)
  const HANDLED_KEY = "rtd.commentAgent.handled";
  const TASKS_KEY = "rtd.commentAgent.tasks";
  const HANDLED_MAX = 300;
  const TASKS_MAX = 50;
  const IMG_KEEP = 12; // tasks whose screenshots are persisted
  const TICK_MS = CFG.tickMs || 500;
  const DONE_MS = CFG.doneMs || 8000; // mini list: check, then the row goes
  const FAIL_MS = CFG.failMs || 12000;
  const SCAN_MS = CFG.scanMs || 2000;
  const AFTER_DELAY_MS = CFG.afterDelayMs || 3000; // let HMR repaint the storyboard
  const QUEUED_MAX_MS = CFG.queuedMs || 20000; // "queued" longer than this -> failed
  const HOST_WAIT_MS = CFG.hostWaitMs || 5000; // the chat's orchestrator host gets ready
  const APP_SUBMIT_MS = CFG.appSubmitMs || 1500; // the app's own first submit shows up
  const START_WAIT_MS = CFG.startMs || 8000; // an accepted submit shows up as a run
  const TITLE_MAX = 48;
  const SUMMARY_MAX = 300;
  const UPDATES_MAX = 30;
  const OUT_MAX_W = 720;
  const MARGIN = 16; // CSS px around the storyboard (the whole storyboard is captured)
  const NEAR_PX = 24; // a pin this close to a storyboard (CSS px on screen) belongs to it
  const LOOSE_W = 480; // the region when no storyboard is under the pin
  const LOOSE_H = 320;
  const MIN_SIDE = 40;
  const FRAME_MS = CFG.frameMs || 2000; // GIF frames while running (the fastest pace)
  const FRAME_IDLE_MAX = CFG.frameIdleMs || 30000; // the slowest pace, nothing changing
  const ACT_DELAY_MS = 900; // a tool call -> a frame this long after (HMR repaints)
  const SHARE_MS = 400; // one screenshot serves every task capturing within this
  const AFTER_MAX_MS = 10 * 60 * 1000; // an "after" is retried this long after "done"
  const LOAD_WAIT_MS = 10000; // "after" waits this long for its storyboard to load
  const NEW_WAIT_MS = 4000; // ...and this long for one to appear at the pin
  const BLANK_SHARE = 0.92; // this share of the thumbnail in one grey band: a blank crop
  const BLANK_TRIES = 3; // blank "after" of a storyboard: tried again (1 s apart)
  const FRAME_MAX = 24;
  const GIF_W = 480;
  const GIF_DELAY = 50; // centiseconds per frame: 2 fps
  const GIF_HOLD = 150; // the last frame stays 1.5 s
  const GIF_WAIT_MS = CFG.gifWaitMs || 20000; // done and no "after" -> GIF anyway
  const GIF_PERSIST_MAX = 300 * 1024; // bytes; bigger GIFs live in memory only
  const GIF_KEEP = 3; // tasks whose GIF is persisted
  const PERSIST_MS = CFG.persistMs || 1500; // localStorage writes: one per this, at most
  const PERSIST_MAX = CFG.persistMax || 2 * 1024 * 1024; // chars (~4 MB as UTF-16) of the app's quota, at most
  const AGENT_IMG_MAX = 4;
  const AGENT_IMG_BYTES = 3 * 1024 * 1024;
  const REPLY_WAIT_MS = CFG.replyWaitMs || 30000; // done -> thread reply at the latest
  const STOP_WAIT_MS = CFG.stopWaitMs || 5000; // the app's abort answers within this
  const STOP_WATCH_MS = 30000; // a first turn starting this long after a stop is aborted too
  const AUTHOR_WAIT_MS = 250; // the prompt waits this long for the author's name (cached after the first)
  const REPLY_CTX_MS = 1500; // a reply waits this long for its thread (the pin's position)
  const STREAM_MS = 90; // the chat's messages are read at most this often while it streams
  const VOICE_MAX = 320;
  const FN_UPLOAD_URL = "comments:generateAttachmentUploadUrl";
  const FN_UPLOAD_REC = "comments:recordAttachmentUpload";
  const CONVEX_FN = Symbol.for("functionName");
  const WRAPPED = Symbol.for("re-tempo.comment-agent.wrapped");
  const FN_CREATE = "comments:createThread";
  const FN_REPLY = "comments:addComment";
  const FN_THREAD = "comments:getThread";
  // The app's avatar palette and hash (bundle Ner / jer, LG = Ner[jer(id) % 10]).
  const PALETTE = ["#9B3BF6", "#34BFFD", "#33CD88", "#FF898C", "#FFD55F", "#f97316", "#6366f1", "#ec4899", "#06b6d4", "#8b5cf6"];
  const SEL = {
    item: "[data-canvas-item-id]",
    header: "[data-storyboard-header]",
    canvasRoot: "[data-canvas-root]",
    pinLayer: '[data-testid="canvas-comment-pin-layer"]',
    designBar: '[data-testid="design-view-tab-bar"]',
    pill: '[aria-label="Canvas page"]', // the canvas name pill (comment-bubbles joins it)
    host: "[data-rtcc-host]",
    rail: '[data-testid="workspace-navbar"]',
    // UIs over the canvas that a GIF frame must not show (agent-cursors'
    // flights stay on screen while "before" / "after" are taken: masked)
    overlays:
      '.rtcb-panel, .rtcb-pop, [data-rtcb-root], .rtcb-tip, .rtcb-lb, [data-rcca-root], [data-testid="canvas-comment-popover"], [data-testid="canvas-comment-mention-popover"], [data-rtac-sky] .rtac-arrow, [data-rtac-sky] .rtac-glow, [data-rtac-sky] .rtac-tag, [data-rtac-sky] .rtac-cap, [data-rtac-sky] .rtac-pulse, [data-rtac-sky] .rtac-ring, [data-rtac-sky] .rtac-trail path',
    popovers: '[data-testid="canvas-comment-popover"], [data-testid="canvas-comment-mention-popover"]',
    // comment pins and canvas notes (canvas-notes.js): hidden while before /
    // after are taken, masked in the frames
    pins: '[data-testid^="canvas-comment-pin"]:not([data-testid="canvas-comment-pin-layer"]), .rtcn-note',
    modelBtn: '[data-testid="chat-input-model-selector"]',
    sidebars: [
      "[data-rtps-root]",
      '[data-tempo-workspace-panel="left"]',
      '[data-testid="docs-view-sidebar"]',
      '[data-testid="issues-sidebar"]',
      '[data-testid="canvas-sidebar"]',
    ],
    foot: ".rtps-foot",
  };

  const now = () => Date.now();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
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
    json(k, dflt) {
      try {
        const v = JSON.parse(localStorage.getItem(k) || "null");
        return v == null ? dflt : v;
      } catch (_) {
        return dflt;
      }
    },
  };
  const enabled = () => ls.get(OFF_KEY) !== "off";
  const replyOn = () => ls.get(REPLY_KEY) !== "off";
  const shotsOn = () => ls.get(SHOTS_KEY) !== "off";
  // Dry run (QA on a signed-in account, see the header): nothing reaches the
  // server or the chat engine. null | { rttMs }
  const dryOf = (o) => (o ? { rttMs: Number.isFinite(+o.rttMs) ? Math.max(0, +o.rttMs) : 300 } : null);
  let dry = dryOf(CFG.dryRun);
  const isShown = (n) => !!n && n.isConnected && !n.closest("[inert]") && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== "hidden";
  const clip = (s, max) => {
    const one = String(s || "").replace(/\s+/g, " ").trim();
    return one.length > max ? one.slice(0, max - 1).trimEnd() + "…" : one;
  };

  async function waitFor(fn, ms, step = 100) {
    const t0 = now();
    for (;;) {
      let v = null;
      try {
        v = fn();
      } catch (_) {}
      if (v) return v;
      if (now() - t0 > ms) return null;
      await sleep(step);
    }
  }

  const state = {
    status: "boot", // boot | ready | off
    clients: 0,
    trigger: null, // last trigger { fn, at, key, skipped? }
    dispatch: null, // last send { id, route, draft, sent, reason }
    captures: { ok: 0, fail: 0, last: null },
    errors: [],
  };
  const note = (where, e) => {
    state.errors.push({ where, at: now(), msg: String((e && e.message) || e) });
    if (state.errors.length > 20) state.errors.shift();
  };

  // ---------------------------------------------------------------- stores
  // zustand v4 leaves getState in the deps [getState, getServerState, selector,
  // isEqual] of useSyncExternalStoreWithSelector's useMemo; only pure `()=>x`
  // getters are called (same technique as pane-dock / sidebar-chats).
  const F = { ws: null, wsSub: null, draft: null, reg: null, clients: new Set() };
  const GETTER_RE = /^\(\)=>[A-Za-z$_][\w$]*$/;
  const tried = new WeakSet();
  const isClient = (o) =>
    !!o && typeof o === "object" && typeof o.query === "function" && typeof o.watchQuery === "function" && typeof o.mutation === "function";
  // The chat orchestrator registry (jW() in the bundle): a module singleton
  // the React compiler keeps in memo caches (fiber.updateQueue.memoCache).
  const isRegistry = (o) =>
    !!o &&
    typeof o === "object" &&
    typeof o.getActions === "function" &&
    typeof o.ensureHost === "function" &&
    typeof o.getSnapshot === "function" &&
    typeof o.getHost === "function" &&
    o.hostsById instanceof Map;

  function checkFiber(f) {
    const p = f.memoizedProps;
    if (p && typeof p === "object") {
      if (isClient(p.client)) addClient(p.client);
      else if (isClient(p.value)) addClient(p.value);
    }
    if (!F.reg) {
      const mc = f.updateQueue && typeof f.updateQueue === "object" ? f.updateQueue.memoCache : null;
      const data = mc && Array.isArray(mc.data) ? mc.data : null;
      if (data)
        for (const arr of data) {
          const hit = Array.isArray(arr) ? arr.find(isRegistry) : null;
          if (hit) {
            F.reg = hit;
            break;
          }
        }
    }
    if (F.ws && F.draft) return;
    let h = f.memoizedState;
    if (!h || typeof h !== "object" || !("next" in h)) return;
    for (let i = 0; h && i < 400; i++, h = h.next) {
      const m = h.memoizedState;
      const d = Array.isArray(m) && m.length === 2 ? m[1] : null;
      if (!Array.isArray(d) || d.length !== 4 || typeof d[0] !== "function" || typeof d[2] !== "function") continue;
      const gs = d[0];
      if (tried.has(gs)) continue;
      tried.add(gs);
      if (!GETTER_RE.test(Function.prototype.toString.call(gs))) continue;
      let st;
      try {
        st = gs();
      } catch (_) {
        continue;
      }
      if (!st || typeof st !== "object") continue;
      if (!F.ws && Array.isArray(st.workspaces) && typeof st.createChatTab === "function" && typeof st.setActiveNavRoute === "function") {
        F.ws = gs;
        F.wsSub = subscribeOf(h, m);
        guardOn();
      }
      else if (!F.draft && typeof st.setChatInputDraft === "function" && st.chatInputDrafts && typeof st.chatInputDrafts === "object") F.draft = gs;
    }
  }

  // The store's subscribe for a selector hook: useSyncExternalStore keeps it
  // in its effect's deps, two hooks after the selector's memo (as
  // sidebar-chats reads it). null when the shape is not that one.
  function subscribeOf(h, m) {
    try {
      const sync = h.next;
      if (!Array.isArray(m[0]) || typeof m[0][0] !== "function" || !sync || !sync.queue || sync.queue.getSnapshot !== m[0][0]) return null;
      const eff = sync.next && sync.next.memoizedState;
      return eff && Array.isArray(eff.deps) && eff.deps.length === 1 && typeof eff.deps[0] === "function" ? eff.deps[0] : null;
    } catch (_) {
      return null;
    }
  }

  // Full tree walk, time-sliced (8 ms per slice) and resumed on the next call.
  let scan = null;
  function scanStep() {
    if (!scan) {
      const root = document.getElementById("root");
      const key = root && Object.keys(root).find((k) => k.startsWith("__reactContainer$"));
      if (!key) return true;
      scan = { stack: [root[key]], seen: new Set() };
    }
    const deadline = performance.now() + 8;
    while (scan.stack.length && performance.now() < deadline) {
      const f = scan.stack.pop();
      if (!f || scan.seen.has(f)) continue;
      scan.seen.add(f);
      checkFiber(f);
      if (f.child) scan.stack.push(f.child);
      if (f.sibling) scan.stack.push(f.sibling);
    }
    if (!scan.stack.length) {
      scan = null;
      return true;
    }
    return false;
  }
  async function fullScan() {
    for (let i = 0; i < 400; i++) {
      if (scanStep()) return;
      await sleep(0);
    }
  }

  const get = (gs) => {
    try {
      return gs ? gs() : null;
    } catch (_) {
      return null;
    }
  };
  const W = () => get(F.ws);
  const D = () => get(F.draft);
  const anyClient = () => {
    for (const c of F.clients) return c;
    return null;
  };
  const sessStore = () => {
    const s = window.__chatSessionStoreDebug;
    return s && typeof s.getMessages === "function" ? s : null;
  };

  // --------------------------------------------------------------- trigger
  const fnName = (ref) => {
    const n = typeof ref === "string" ? ref : ref && ref[CONVEX_FN];
    return typeof n === "string" ? n.replace(/\.js:/, ":") : "";
  };
  const makeRef = (name) => ({ [CONVEX_FN]: name });
  let muted = 0; // > 0 while the mod posts its own reply

  function addClient(c) {
    if (F.clients.has(c)) return;
    F.clients.add(c);
    state.clients = F.clients.size;
    if (c[WRAPPED]) return; // already wrapped (e.g. a reloaded copy of the mod)
    const orig = c.mutation;
    const wrapped = function (ref, args) {
      const name = fnName(ref);
      // dry run: no comment mutation reaches the server; it "resolves" after rttMs
      const p = dry && /^comments:/.test(name) ? sleep(dry.rttMs).then(() => null) : orig.apply(this, arguments);
      try {
        observe(name, args, p);
      } catch (e) {
        note("observe", e);
      }
      return p;
    };
    try {
      c.mutation = wrapped;
      c[WRAPPED] = orig;
    } catch (e) {
      note("wrap", e);
    }
  }

  const unMention = (s) => String(s || "").replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1");

  function observe(fn, args, p) {
    if (fn !== FN_CREATE && fn !== FN_REPLY) return;
    if (muted > 0) return void (state.trigger = { fn, at: now(), skipped: "own-reply" });
    if (!enabled()) return void (state.trigger = { fn, at: now(), skipped: "off" });
    const text = unMention(args && typeof args.body === "string" ? args.body : "").trim();
    if (!text) return void (state.trigger = { fn, at: now(), skipped: "empty" });
    // The DOM context is read now, while the canvas and its pin are on screen.
    const ctx = {
      kind: fn === FN_CREATE ? "thread" : "reply",
      text,
      threadId: fn === FN_REPLY ? String(args.threadId || "") : null,
      branch: args.branch || null,
      contentPath: args.contentPath || null,
      x: typeof args.positionX === "number" ? args.positionX : null,
      y: typeof args.positionY === "number" ? args.positionY : null,
      canvasLabel: canvasLabel(),
      at: now(),
    };
    if (ctx.x != null) {
      ctx.anchor = anchorAt(ctx.x, ctx.y);
      ctx.cap = newCap(ctx.anchor, true);
      ctx.before = capture(ctx.cap, "before"); // starts now, before the chat starts
    }
    // The task exists now, while the server still answers: the avatar, the
    // cursor and the chat start on Enter, not one round trip later.
    const task = startTask(ctx);
    Promise.resolve(p).then(
      (res) => onPublished(task, ctx, res),
      (e) => onRejected(task, ctx, e)
    );
  }

  const idOf = (res, ...keys) => {
    if (typeof res === "string" || typeof res === "number") return String(res);
    if (res && typeof res === "object") for (const k of keys) if (res[k] != null) return String(res[k]);
    return null;
  };

  function handledList() {
    const v = ls.json(HANDLED_KEY, []);
    return Array.isArray(v) ? v : [];
  }
  function markHandled(key) {
    const list = handledList().filter((k) => k !== key);
    list.push(key);
    ls.set(HANDLED_KEY, JSON.stringify(list.slice(-HANDLED_MAX)));
  }

  // On Enter (the mutation was just called): the task, "queued", in the store
  // in this tick; "rtcc:launch" for the avatar and the cursor; then the chat.
  // Its id is "h:<kind>:<time36>" (the server's ids come later).
  function startTask(ctx) {
    let id = `h:${ctx.kind}:${ctx.at.toString(36)}`;
    for (let n = 2; tasks.some((t) => t.id === id); n++) id = `h:${ctx.kind}:${ctx.at.toString(36)}-${n}`;
    markHandled(id);
    state.trigger = { fn: ctx.kind, at: now(), key: id };
    const task = newTask({
      id,
      source: "comment",
      kind: ctx.kind,
      threadId: ctx.threadId,
      text: ctx.text,
      canvasName: ctx.canvasLabel || canvasFromPath(ctx.contentPath),
      anchor: ctx.anchor || null,
      x: ctx.x,
      y: ctx.y,
      at: ctx.at,
      contentPath: ctx.contentPath,
      branch: ctx.branch,
      cap: ctx.cap,
    });
    if (me) task.author = { ...me };
    tasks.push(task);
    trim();
    changed();
    wake();
    emitLaunch(task, ctx);
    launch(task, ctx).catch((e) => note("launch", e));
    return task;
  }
  // "rtcc:launch" {taskId, text, rect, pin, source, capturing}: rect = the
  // comment field (else the popover), pin = the pin's bubble (else a box
  // around the anchor), both DOMRects in viewport px; capturing = a "before"
  // capture runs now: the pins are hidden until "rtcc:captured".
  function emitLaunch(task, ctx) {
    const box = (r) => (r && r.width > 0 && r.height > 0 ? new DOMRect(r.left, r.top, r.width, r.height) : null);
    let rect = null;
    let pin = null;
    try {
      const pop = Array.from(document.querySelectorAll(SEL.popovers)).find(present);
      const field = pop && Array.from(pop.querySelectorAll('textarea, [contenteditable="true"], input')).find(present);
      rect = box((field || pop) && (field || pop).getBoundingClientRect());
      const v = task.anchor ? viewOf(null) : null;
      if (v && v.ox != null) {
        const sx = v.ox + task.anchor.x * v.z;
        const sy = v.oy + task.anchor.y * v.z;
        // the app's pin: a 34 px bubble above-right of its point
        const el = Array.from(document.querySelectorAll(SEL.pins)).find((n) => {
          if (!present(n)) return false;
          const r = n.getBoundingClientRect();
          return Math.abs(r.left + 2 - sx) < 6 && Math.abs(r.bottom - 6 - sy) < 10;
        });
        pin = box(el ? el.getBoundingClientRect() : { left: sx - 2, top: sy - 28, width: 34, height: 34 });
      }
    } catch (e) {
      note("launch-rect", e);
    }
    fire("rtcc:launch", { taskId: task.id, text: task.text, rect: rect || pin, pin, source: "comment", capturing: !!ctx.before });
    fireLaunch(task, pin, null, rect, !!ctx.before);
  }
  // The contract's launch (see Contract): every new task, in its first tick.
  function fireLaunch(task, pinRect, composerRect, rect, capturing) {
    fire("rtca:launch", {
      taskId: task.id,
      agent: { model: task.model || null, effort: task.effort || null, n: null },
      color: null,
      pinRect: pinRect || null,
      composerRect: composerRect || null,
      rect: rect || pinRect || composerRect || null,
      anchor: task.anchor ? { ...task.anchor } : null,
      canvasName: task.canvasName || null,
      source: task.source,
      text: task.text,
      capturing: !!capturing,
      at: task.createdAt,
    });
  }
  // The server answered: the thread's ids (the task keeps its own id).
  function onPublished(task, ctx, res) {
    const threadId = ctx.kind === "thread" ? idOf(res, "threadId", "_id", "id") : ctx.threadId;
    const commentId = ctx.kind === "reply" ? idOf(res, "commentId", "_id", "id") : res && typeof res === "object" && res.commentId != null ? String(res.commentId) : null;
    if (threadId) task.threadId = threadId;
    if (commentId) task.commentId = commentId;
    const key = ctx.kind === "thread" ? (threadId ? `t:${threadId}` : null) : commentId ? `c:${commentId}` : null;
    if (key) markHandled(key);
    task.postedAt = now();
    state.trigger = { fn: ctx.kind, at: now(), key: task.id, posted: key };
    changed();
    // the comment's own id and the thread's path, off the launch path
    if (ctx.kind === "thread" && threadId && !dry) fillFromThread(task).catch((e) => note("context", e));
  }
  // The comment never reached the server: its agent stops.
  function onRejected(task, ctx, e) {
    state.trigger = { fn: ctx.kind, at: now(), key: task.id, skipped: "mutation-failed" };
    note("comment", e);
    if (!LIVE.has(task.status)) return;
    stop(task.id)
      .catch(() => false)
      .then(() => {
        task.why = "unposted";
        task.error = WHY.unposted;
        task.stoppedAt = null;
        changed();
      });
  }

  // A new task (status "queued"): o = { id, source, kind, threadId,
  // commentId, noteId, text, canvasName, anchor (anchorAt()), x, y, at,
  // contentPath, branch, cap }.
  function newTask(o) {
    const a = o.anchor || null;
    return {
      id: o.id,
      source: o.source || "comment",
      noteId: o.noteId || null,
      threadId: o.threadId || null,
      commentId: o.commentId || null,
      text: o.text,
      author: { name: "", initials: "", color: PALETTE[0] },
      canvasName: o.canvasName || "",
      storyboardName: (a && a.storyboard) || null,
      anchor: publicAnchor(a, o.x, o.y),
      createdAt: o.at,
      chatId: null,
      workspaceId: null,
      status: "queued",
      startedAt: null,
      finishedAt: null,
      model: null,
      effort: null,
      modelId: null,
      effortId: null,
      before: null,
      after: null,
      gif: null,
      frames: null,
      shot: null,
      replay: null,
      summary: null,
      updates: [],
      captureError: null,
      error: null,
      stoppedAt: null,
      // internal
      kind: o.kind,
      title: clip(o.text, TITLE_MAX),
      contentPath: o.contentPath || null,
      branch: o.branch || null,
      info: a, // storyboard geometry for the prompt and the screenshots
      earlier: [],
      seenRunning: false,
      idleTicks: 0,
      lastCs: null,
      seenMsgIds: [],
      replied: false,
      afterDueAt: null,
      afterTryAt: 0,
      cap: o.cap || newCap(a, true),
      captureErrorShot: null,
      agentImgs: 0,
      activity: null, // the agent's current tool call (see Stream)
      toolCount: 0,
      toolSeen: {}, // tool call id -> its last status
      liveRun: true, // created in this page (a restored task reads its old tools silently)
      timing: { at: o.at, launched: null, started: null, firstTool: null },
    };
  }

  // After the task is in the store, in parallel: the author, the thread (a
  // reply's pin), "before" and the chat. The chat waits only for what its
  // prompt needs (the author's name: cached after the first comment; a
  // reply's thread), never for "before" (taken while the chat starts, long
  // before the agent's first edit). ctx.before = a "before" capture already
  // started (ctx.cap its target).
  async function launch(task, ctx) {
    const who = authorInfo()
      .then((a) => {
        if (a && (a.name !== task.author.name || a.initials !== task.author.initials)) {
          task.author = a;
          changed();
        }
      })
      .catch((e) => note("context", e));
    // A reply has no position in its args: its pin comes from getThread.
    const thread = task.kind === "reply" && !dry ? fillFromThread(task).catch((e) => note("context", e)) : null;
    // the canvas on Enter, what the change is measured from (idle slices)
    if (task.cap && task.cap.live) sceneStart(task.cap);
    beforeShot(task, ctx, thread).catch((e) => note("before", e));
    await Promise.race([Promise.all([who, thread]), sleep(thread ? REPLY_CTX_MS : AUTHOR_WAIT_MS)]);
    pending.add(task.id);
    wake();
    dispatch(task)
      .catch((e) => {
        note("dispatch", e);
        if (task.status === "queued") fail(task, "error");
      })
      .finally(() => pending.delete(task.id));
  }
  async function beforeShot(task, ctx, thread) {
    if (!ctx.cap) {
      await thread;
      task.cap.info = task.info || null;
    }
    let r = await Promise.race([ctx.before || capture(task.cap, "before"), sleep(7000).then(() => ({ ok: false, why: "timeout" }))]);
    if (r && r.ok && r.blank && task.cap.region && task.cap.region.kind === "storyboard") {
      await sleep(1000); // a storyboard not painted yet: once more
      const again = await Promise.race([capture(task.cap, "before"), sleep(7000).then(() => null)]);
      if (again && again.ok) r = again;
    }
    if (r && r.ok) {
      task.before = r.shot;
      // the moment of the comment, so it stays first among the updates
      task.updates.unshift({ at: task.createdAt, kind: "screenshot", text: "before", dataUrl: r.shot.dataUrl });
      addFrame(task.cap, r.frame, true);
    } else capNote(task, "before", (r && r.why) || "failed");
    changed();
    // the pin's region off screen: the window as it was, for the frame cut
    // at the end (the mods' frames in it)
    if (task.cap.live && !task.cap.wide && shotsOn()) task.cap.wide = await grabWide().catch(() => null);
  }

  // ---------------------------------------------------------------- context
  function canvasFromPath(p) {
    if (!p) return "";
    const parts = String(p).replace(/\/+$/, "").split("/");
    let last = parts.pop() || "";
    if (/^index\.canvas\.[jt]sx?$/.test(last) || /^index\.[jt]sx?$/.test(last)) last = parts.pop() || last;
    return last.replace(/\.canvas\.[jt]sx?$/, "").replace(/\.[jt]sx?$/, "");
  }
  function canvasLabel() {
    for (const bar of document.querySelectorAll(SEL.designBar)) {
      if (!isShown(bar)) continue;
      const t = bar.querySelector('[aria-selected="true"], [data-state="active"], [data-active="true"]');
      const s = t && ((t.innerText || "").split("\n").map((x) => x.trim()).find(Boolean) || t.getAttribute("aria-label") || "").trim();
      if (s) return s.slice(0, 80);
    }
    return "";
  }

  let me = null;
  function hashId(s) {
    let t = 0;
    for (let n = 0; n < s.length; n++) t = (t * 31 + s.charCodeAt(n)) | 0;
    return Math.abs(t);
  }
  async function authorInfo() {
    if (me) return { ...me };
    let u = null;
    try {
      const b = window.authBridge;
      u = b && typeof b.getUserInfo === "function" ? await Promise.race([b.getUserInfo(), sleep(3000).then(() => null)]) : null;
    } catch (_) {}
    const full = u ? [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || "" : "";
    const name = full.trim().split(/[\s@]/).filter(Boolean)[0] || "";
    const words = full.trim().split(/\s+/).filter(Boolean);
    const initials = words.length >= 2 ? (words[0][0] + words[words.length - 1][0]).toUpperCase() : (full.trim().slice(0, 2) || "?").toUpperCase();
    const color = PALETTE[hashId(String((u && (u.userId || u.email)) || name || "?")) % PALETTE.length];
    const out = { name: name || "You", initials, color };
    if (name) me = out;
    return { ...out };
  }

  const pxVar = (el, name) => {
    const v = parseFloat(el.style.getPropertyValue(name));
    return Number.isFinite(v) ? v : null;
  };
  function itemBox(el) {
    let x = pxVar(el, "--canvas-item-x");
    let y = pxVar(el, "--canvas-item-y");
    const w = pxVar(el, "--canvas-item-width") ?? parseFloat(el.style.width);
    const h = pxVar(el, "--canvas-item-height") ?? parseFloat(el.style.height);
    if (x == null || y == null) {
      const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(el.style.transform || "");
      if (m) (x = +m[1]), (y = +m[2]);
    }
    return [x, y, w, h].every(Number.isFinite) && w > 0 && h > 0 ? { x, y, w, h } : null;
  }
  function headerName(el) {
    const hd = el.querySelector(SEL.header);
    const s = hd ? (hd.innerText || hd.textContent || "").split("\n").map((x) => x.trim()).find(Boolean) : "";
    return (s || "").slice(0, 80);
  }
  function selectorOf(el) {
    if (!el || el.nodeType !== 1) return "";
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${CSS.escape(el.id)}`;
    const tid = el.getAttribute("data-testid");
    if (tid) s += `[data-testid="${tid.replace(/"/g, '\\"')}"]`;
    const cls = (typeof el.className === "string" ? el.className : "").split(/\s+/).filter((c) => c && /^[A-Za-z_-][\w-]*$/.test(c)).slice(0, 3);
    if (cls.length) s += "." + cls.join(".");
    return s.slice(0, 160);
  }
  function describeEl(el) {
    const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
    return selectorOf(el) + (txt && txt.length <= 60 ? ` "${txt}"` : "");
  }
  const canvasScope = () => {
    const layer = Array.from(document.querySelectorAll(SEL.pinLayer)).find(isShown);
    return (layer && layer.closest(SEL.canvasRoot)) || document;
  };
  function itemById(itemId) {
    if (!itemId) return null;
    const list = Array.from(document.querySelectorAll(`[data-canvas-item-id="${CSS.escape(itemId)}"]`));
    return list.find(isShown) || null;
  }
  // A canvas item by its own id or by the storyboard id it renders.
  function itemOf(id) {
    if (!id) return null;
    const el = itemById(id);
    if (el) return el;
    const sb = Array.from(document.querySelectorAll(`[data-storyboard-id="${CSS.escape(id)}"]`)).find(isShown);
    return (sb && sb.closest(SEL.item)) || null;
  }
  // The storyboard (canvas item) holding world point (x, y) and what is under
  // it. nodeId (createTask's anchor.nodeId: the storyboard a note is on) wins
  // when that item is on this canvas, near or not.
  function anchorAt(x, y, nodeId) {
    let best = null;
    const v = viewOf(null);
    const near = NEAR_PX / (v && v.z > 0 ? v.z : 1); // world units
    const forced = nodeId ? itemOf(String(nodeId)) : null;
    for (const el of forced && itemBox(forced) ? [forced] : canvasScope().querySelectorAll(SEL.item)) {
      const b = itemBox(el);
      if (!b) continue;
      const dx = x < b.x ? b.x - x : x > b.x + b.w ? x - (b.x + b.w) : 0;
      const dy = y < b.y ? b.y - y : y > b.y + b.h ? y - (b.y + b.h) : 0;
      const dist = Math.hypot(dx, dy);
      if (dist > near && !forced) continue;
      const name = headerName(el);
      const score = dist * 1e9 + (name ? 0 : 1e8) + b.w * b.h; // inside > near; storyboards first; smallest
      if (!best || score < best.score) best = { el, b, name, dist, score };
    }
    if (!best) return { x: Math.round(x), y: Math.round(y) };
    const { el, b } = best;
    const sbEl = el.querySelector("[data-storyboard-id]");
    const out = {
      x: Math.round(x),
      y: Math.round(y),
      itemId: el.getAttribute("data-canvas-item-id"),
      storyboardId: (sbEl && sbEl.getAttribute("data-storyboard-id")) || null,
      storyboard: best.name || null,
      inside: best.dist === 0,
      relX: Math.round(x - b.x),
      relY: Math.round(y - b.y),
      w: Math.round(b.w),
      h: Math.round(b.h),
      element: null,
      selector: null,
    };
    try {
      const r = el.getBoundingClientRect();
      if (best.dist === 0 && r.width > 0) {
        const k = r.width / b.w;
        for (const n of document.elementsFromPoint(r.left + (x - b.x) * k, r.top + (y - b.y) * k)) {
          if (n === el || !el.contains(n) || n.closest(SEL.header)) continue;
          if (n.tagName === "IFRAME") out.element = "(the storyboard renders in an iframe; the element is not readable from the canvas)";
          else (out.element = describeEl(n)), (out.selector = selectorOf(n));
          break;
        }
      }
    } catch (_) {}
    return out;
  }
  function publicAnchor(a, x, y) {
    if (x == null || y == null) return null;
    const out = { x: Math.round(x), y: Math.round(y) };
    if (a && (a.storyboardId || a.itemId)) out.nodeId = a.storyboardId || a.itemId;
    if (a && a.selector) out.selector = a.selector;
    return out;
  }

  // ------------------------------------------------------------ createTask
  // A task that does not come from a comment, e.g. a canvas note's "Run"
  // (canvas-notes.js): the same pipeline (before, chat, status, frames,
  // after, GIF), no Convex thread (so no thread reply). Synchronous: the task
  // is in the store, "queued", when it returns; its "before" and chat follow.
  const DUP_MS = 3000; // the same note and text again this soon: the same task
  const recentNotes = new Map(); // noteId -> { at, text, id }
  const numOr = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(+v) ? +v : null);
  // The canvas's name as the bubbles' segment matches it: the canvas name
  // pill ("Canvas page") of the view that holds `host` (the note, else the
  // anchor's storyboard); without one, the design tab label when it names
  // the same canvas as the payload, else the folder of canvasPath, else the
  // payload's canvasName.
  function canvasNameFor(p, host) {
    const root = (host && host.closest(SEL.canvasRoot)) || null;
    for (let n = root, d = 0; n && n !== document.body && d < 12; n = n.parentElement, d++) {
      const pill = Array.from(n.querySelectorAll(SEL.pill)).find(isShown);
      if (!pill) continue;
      // its name span (the app's span.truncate, canvas-chrome's
      // .rcc-file-name: its first span is an icon), never the bubbles' segment
      const sp = Array.from(pill.querySelectorAll("span.truncate, .rcc-file-name, span")).find((x) => !x.closest("[data-rtcb-root], [data-rtcb-host]") && (x.textContent || "").trim());
      const t = ((sp || pill).textContent || "").split(/[\u2304\u02c5\u25be\u25bc\u2014]/)[0].trim();
      if (t) return t.slice(0, 80);
      break;
    }
    const k = (x) =>
      String(x || "")
        .trim()
        .toLowerCase()
        .replace(/\.canvas\.[jt]sx?$/, "")
        .replace(/[\s_-]+/g, "-");
    const fromPath = canvasFromPath(p.canvasPath || p.contentPath || "");
    const given = typeof p.canvasName === "string" ? p.canvasName.trim().slice(0, 80) : "";
    const label = canvasLabel();
    if (label && ((fromPath && k(fromPath) === k(label)) || (!fromPath && given && k(given) === k(label)))) return label;
    return fromPath || given || label || "";
  }
  // The model / effort a caller asks for, as ids the app knows: an id seen in
  // the store (chat defaults, any chat tab), or a label ("Opus 5.5") whose
  // id is; efforts by id or label ("high", "Extra High"). Unknown -> null:
  // the new chat keeps the app's defaults (never an id the app may not run).
  function wantModel(p) {
    const st = W();
    const known = [];
    const add = (v) => typeof v === "string" && v && !known.includes(v) && known.push(v);
    if (st) {
      add(st.chatDefaults && st.chatDefaults.model);
      for (const t of st.centerTabs || []) add(t && t.model);
      for (const w of st.workspaces || []) for (const t of (w && w.centerTabs) || []) add(t && t.model);
    }
    const norm = (x) =>
      String(x || "")
        .toLowerCase()
        .replace(/\s+1m$/, "")
        .replace(/\s+/g, " ")
        .trim();
    const isId = (x) => /^[a-z0-9][a-z0-9._[\]-]*$/.test(x);
    let modelId = null;
    for (const v of [p.modelId, p.model]) {
      const x = typeof v === "string" ? v.trim() : "";
      if (!x) continue;
      if (known.includes(x)) {
        modelId = x;
        break;
      }
      const lab = norm(isId(x) ? modelLabel(x) : x);
      const hit = lab && known.find((id) => norm(modelLabel(id)) === lab);
      if (hit) {
        modelId = hit;
        break;
      }
    }
    let effortId = null;
    for (const v of [p.effortId, p.effort]) {
      const x = typeof v === "string" ? v.trim().toLowerCase() : "";
      if (!x) continue;
      const hit = EFFORT_LABEL[x] ? x : Object.keys(EFFORT_LABEL).find((id) => EFFORT_LABEL[id].toLowerCase() === x);
      if (hit) {
        effortId = hit;
        break;
      }
    }
    const asked = typeof p.model === "string" ? p.model.trim() : "";
    return {
      modelId,
      effortId,
      model: modelId ? modelLabel(modelId) : asked && !isId(asked) ? asked.slice(0, 40) : null,
      effort: effortId ? EFFORT_LABEL[effortId] : null,
    };
  }
  // createTask({ text, canvasName?, canvasPath?, storyboardName?, anchor:
  //   { x, y, nodeId?, noteId? }?, source? = "note", noteId?, model?,
  //   effort?, modelId?, effortId? }) -> Task (a snapshot). Throws on an
  // empty text or when the mod is off.
  function createTask(p) {
    if (!p || typeof p !== "object") throw new TypeError("createTask(payload): payload must be an object");
    if (!enabled()) throw new Error("The comment agent is turned off");
    const text = unMention(typeof p.text === "string" ? p.text : "").trim();
    if (!text) throw new Error("createTask: the text is empty");
    const an = p.anchor && typeof p.anchor === "object" ? p.anchor : {};
    const noteId = (typeof p.noteId === "string" && p.noteId) || (typeof an.noteId === "string" && an.noteId) || null;
    const at = now();
    if (noteId) {
      const r = recentNotes.get(noteId);
      const same = r && at - r.at < DUP_MS && r.text === text ? tasks.find((t) => t.id === r.id) : null;
      if (same) return snapshot(same);
    }
    const source = typeof p.source === "string" && p.source.trim() ? p.source.trim().slice(0, 24) : "note";
    const x = numOr(an.x);
    const y = x == null ? null : numOr(an.y);
    const a = x != null && y != null ? anchorAt(x, y, typeof an.nodeId === "string" ? an.nodeId : null) : null;
    const host = (noteId && Array.from(document.querySelectorAll(`.rtcn-note[data-rtcn-id="${CSS.escape(noteId)}"]`)).find(isShown)) || (a && a.itemId && itemById(a.itemId)) || Array.from(document.querySelectorAll(SEL.canvasRoot)).find(isShown) || null;
    const base = `${source === "note" ? "n" : "x"}:${noteId ? `${String(noteId).replace(/[^\w.-]/g, "").slice(0, 64)}:` : ""}${at.toString(36)}`;
    let id = base;
    for (let n = 2; tasks.some((t) => t.id === id); n++) id = `${base}-${n}`;
    // no anchor: about the canvas as a whole, captured as its visible area
    const cap = newCap(a || { viewport: true }, true);
    const before = capture(cap, "before"); // starts now, before the chat starts
    const task = newTask({
      id,
      source,
      kind: source,
      noteId,
      text,
      canvasName: canvasNameFor(p, host),
      anchor: a,
      x,
      y: x == null ? null : y,
      at,
      contentPath: (typeof p.canvasPath === "string" && p.canvasPath) || (typeof p.contentPath === "string" && p.contentPath) || null,
      branch: typeof p.branch === "string" ? p.branch : null,
      cap,
    });
    if (task.anchor && noteId) task.anchor.noteId = noteId;
    if (!a) task.viewport = true; // the prompt: no specific element
    if (!task.storyboardName && typeof p.storyboardName === "string" && p.storyboardName.trim()) task.storyboardName = p.storyboardName.trim().slice(0, 80);
    // the chat's model / effort: asked for here, read back from the chat once it exists
    const w = wantModel(p);
    task.want = { modelId: w.modelId, effortId: w.effortId, asked: { model: p.model || null, effort: p.effort || null, modelId: p.modelId || null, effortId: p.effortId || null } };
    for (const k of ["model", "effort", "modelId", "effortId"]) if (w[k]) task[k] = w[k];
    tasks.push(task);
    trim();
    if (noteId) recentNotes.set(noteId, { at, text, id });
    for (const [k, r] of recentNotes) if (at - r.at > DUP_MS) recentNotes.delete(k);
    state.trigger = { fn: "createTask", at, key: id, source };
    changed();
    wake();
    // its launch: a note's box, else the composer of that canvas view
    try {
      const noteEl = noteId ? Array.from(document.querySelectorAll(`.rtcn-note[data-rtcn-id="${CSS.escape(noteId)}"]`)).find(present) : null;
      const shell = host && host.closest("[data-canvas-shell]");
      const comp = shell ? Array.from(shell.querySelectorAll(".rcc-composer-wrap")).find(present) : null;
      const r = (n) => (n ? domRect(n.getBoundingClientRect()) : null);
      fireLaunch(task, r(noteEl), r(comp), null, true);
    } catch (e) {
      note("launch-rect", e);
    }
    launch(task, { cap, before }).catch((e) => note("task", e));
    return snapshot(task);
  }
  // The canvas-notes fallback: window event "rtcn:submit" with the same
  // detail (plus respond(taskOrId)); answered with respond(task), else
  // detail.taskId (one link per note: never both).
  function onNoteSubmit(ev) {
    const d = ev && ev.detail;
    if (!d || typeof d !== "object" || d.taskId || d.handledBy) return;
    d.handledBy = "canvas-comment-agent";
    let t = null;
    try {
      t = createTask(d);
    } catch (e) {
      note("rtcn:submit", e);
      d.error = String((e && e.message) || e);
      return;
    }
    if (typeof d.respond === "function")
      try {
        d.respond(t);
      } catch (e) {
        note("respond", e);
      }
    else d.taskId = t.id;
  }

  async function fillFromThread(task) {
    const c = anyClient();
    if (!c || !task.threadId) return;
    let r = null;
    try {
      r = await Promise.race([c.query(makeRef(FN_THREAD), { threadId: task.threadId }), sleep(4000).then(() => null)]);
    } catch (e) {
      note("getThread", e);
    }
    if (!r || typeof r !== "object") return;
    const th = r.thread && typeof r.thread === "object" ? r.thread : r;
    if (!task.contentPath && th.contentPath) task.contentPath = th.contentPath;
    if (!task.branch && th.branch) task.branch = th.branch;
    if (!task.canvasName) task.canvasName = canvasFromPath(task.contentPath);
    const list = (Array.isArray(r.comments) ? r.comments : []).filter((m) => m && !m.deleted);
    if (task.kind === "thread" && !task.commentId) {
      const mine = list.find((m) => typeof m.body === "string" && unMention(m.body).trim() === task.text) || list[0];
      if (mine && mine._id != null) task.commentId = String(mine._id);
    }
    if (task.kind === "reply" && typeof th.positionX === "number" && typeof th.positionY === "number") {
      task.info = anchorAt(th.positionX, th.positionY);
      task.anchor = publicAnchor(task.info, th.positionX, th.positionY);
      task.storyboardName = task.info.storyboard || null;
    }
    task.earlier = list
      .filter((m) => String(m._id) !== String(task.commentId) && typeof m.body === "string" && m.body.trim())
      .map((m) => clip(unMention(m.body), 200))
      .slice(-5);
  }

  // What the agent can do on the canvas: the UI-drive mod's own help (read at
  // send time), the canvas actions from its registry (descriptions and
  // params), the canvas-nodes file format; a short static list when those
  // mods are not there.
  const ACTION_FALLBACK = {
    "canvas.browser.create": ["url x? y? w? h?", "Live web page frame on the open design canvas; x, y, w, h in canvas units (without x/y it lands in the middle of the view)."],
    "canvas.browser.navigate": ["url id?", "Load a URL in a browser frame on the canvas (default: the selected frame, or the only one)."],
    "canvas.node.upsert": ["node", "Create or update a browser or shader frame in the canvas file's reTempoCanvasNodes block (index.canvas.tsx)."],
    "canvas.node.remove": ["id canvasPath?", "Remove a browser or shader frame from that block by id."],
    "ui.find": ["query", "Find elements of the app by words (label, id, region)."],
    "ui.click": ["id", "Click an element of the app map (id from ui.find)."],
    "ui.type": ["id text", "Type text into an input, textarea or editor (replaces its text)."],
  };
  function toolsLines() {
    const L = [];
    const ui = window.__RE_TEMPO_UI_DRIVE__;
    let help = "";
    let reg = null;
    try {
      help = ui && typeof ui.help === "function" ? String(ui.help() || "") : "";
      reg = ui && (typeof ui.registry === "function" ? ui.registry() : ui.registry);
    } catch (_) {}
    const entry = (id) => {
      try {
        return (reg && (typeof reg.get === "function" ? reg.get(id) : reg[id])) || null;
      } catch (_) {
        return null;
      }
    };
    L.push("Tempo app control: you can drive the user's Tempo window.");
    if (help) L.push(help.trim().slice(0, 3200));
    else L.push("Run actions with the tempo-ui command (tempo-ui <action> name=value ...).");
    L.push("");
    L.push("Canvas actions (tempo-ui <action> name=value ...; e.g. tempo-ui canvas.browser.create url=https://example.com x=400 y=300 w=1024 h=720):");
    for (const id of Object.keys(ACTION_FALLBACK)) {
      const e = entry(id);
      const params = e && Array.isArray(e.params) ? e.params.map((q) => `${q.name}${q.required ? "" : "?"}`).join(" ") : ACTION_FALLBACK[id][0];
      const desc = (e && (e.description || e.label)) || ACTION_FALLBACK[id][1];
      L.push(`- ${id} ${params}: ${String(desc).replace(/\s+/g, " ").trim()}`);
    }
    L.push("- tempo-ui screenshot --canvas --out <file.png>: capture the canvas to a PNG you can read");
    let fmt = "";
    try {
      const cn = window.__RE_TEMPO_CANVAS_NODES__;
      fmt = cn && typeof cn.format === "function" ? cn.format() : "";
      fmt = typeof fmt === "string" ? fmt : JSON.stringify(fmt);
    } catch (_) {}
    if (fmt) L.push(`- Canvas node format (browser / shader frames in index.canvas.tsx): ${fmt.slice(0, 1600)}`);
    return L;
  }
  function buildPrompt(task) {
    const a = task.info || {};
    const L = [];
    const what = task.source === "note" ? "note" : task.source === "comment" || !task.source ? "comment" : "request";
    const from = task.source === "composer" ? " (the canvas composer)" : "";
    L.push(`Canvas ${what} from ${(task.author && task.author.name) || "the user"}${from}: "${task.text}"`);
    L.push("");
    L.push(
      task.viewport
        ? `Do what this ${what} asks, on this canvas. It is about the canvas as a whole (no element or storyboard was pointed at): for a design change, find the components its storyboards render, apply the change in their source and keep everything else as it is.`
        : `Do what this ${what} asks, on this canvas. For a design change, find the component the storyboard renders, apply the change in its source and keep everything else as it is.`
    );
    L.push("");
    L.push("Context:");
    if (task.viewport) {
      L.push(`- Canvas: ${task.canvasName || "(unknown)"} (no specific element)`);
      if (task.contentPath) L.push(`- Canvas path: ${task.contentPath}`);
    } else L.push(`- Canvas: ${task.canvasName || "(unknown)"}${task.contentPath ? ` (${task.contentPath})` : ""}`);
    if (a.storyboard || a.itemId) L.push(`- Storyboard: ${a.storyboard || "(unnamed)"}${a.storyboardId || a.itemId ? ` (id ${a.storyboardId || a.itemId})` : ""}`);
    if (a.itemId != null && a.relX != null)
      L.push(
        `- Anchor: the ${what === "note" ? "note's centre" : "comment pin"} is ${a.inside ? "inside" : "next to"} ${a.storyboard || "that storyboard"}, ${a.relX}px from its left edge and ${a.relY}px from its top (storyboard ${a.w}×${a.h}); canvas position (${a.x}, ${a.y})`
      );
    else if (task.anchor) L.push(`- Anchor: canvas position (${task.anchor.x}, ${task.anchor.y})`);
    if (a.element) L.push(`- Element under the ${what === "note" ? "note" : "pin"}: ${a.element}`);
    if (task.noteId) L.push(`- The request is the sticky note ${task.noteId} on this canvas (canvas-notes); leave the note where it is.`);
    if (task.branch) L.push(`- Branch: ${task.branch}`);
    if (task.threadId) L.push(`- Comment thread: ${task.threadId} (${task.kind === "reply" ? "a reply" : "a new thread"})`);
    if (task.earlier && task.earlier.length) {
      L.push("- Earlier in this thread:");
      for (const e of task.earlier) L.push(`  - "${e}"`);
    }
    L.push("");
    L.push(...toolsLines());
    L.push("");
    const name = task.canvasName || "this canvas";
    const ax = task.anchor ? Math.round(task.anchor.x) : null;
    const ay = task.anchor ? Math.round(task.anchor.y) : null;
    L.push("Rules:");
    L.push(
      `- This request lives on the canvas "${name}": when the user asks for a browser, a page, a site or a preview, create a Browser frame on that canvas ${ax != null ? "near the anchor" : "in its visible area"} (canvas.browser.create${ax != null ? ` with x=${ax} y=${ay}` : ""}) instead of opening app tabs.`
    );
    L.push("- Do the whole task yourself, in this turn, and reply only when the change is on the canvas. Never hand it off to a background agent, a background task or another chat (no run_in_background); if you split it across subagents, wait for all of them before replying.");
    L.push(`- Reply in the user's language (the language of the ${what}): 1-2 sentences, no status tables.`);
    L.push("- After changing the canvas, take a screenshot with tempo-ui screenshot --canvas, and say what changed and where.");
    return L.join("\n");
  }

  // ------------------------------------------------------------ screenshots
  // A task's capture target. region = the rectangle every capture of the task
  // shows (fixed by its first capture); gw x gh = the GIF frame size;
  // frames = this run's PNG frames (memory only); live = frames are taken
  // for it (tasks restored after a reload get their "after" only).
  const newCap = (info, live) => ({ info: info || null, region: null, gw: 0, gh: 0, frames: [], live: !!live, lastHash: null, lastFrameAt: 0, activityAt: 0, every: FRAME_MS, gifTried: false, gifQueued: false, gifDone: false, last: null });
  // Shown, ignoring visibility (the comment popover hides while capturing).
  const present = (n) => !!n && n.isConnected && !n.closest("[inert]") && n.getClientRects().length > 0;
  const boxOf = (n) => {
    const r = n.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom };
  };
  const meet = (a, b) => ({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });
  const areaOf = (a) => Math.max(0, a.r - a.l) * Math.max(0, a.b - a.t);
  const clampN = (n, lo, hi) => Math.min(Math.max(n, lo), Math.max(lo, hi));

  // The canvas view: world -> screen (sx = ox + x * z) and the canvas's box
  // on screen. ox = null: no transform known (no pin layer vars, no item).
  function viewOf(itemId) {
    const roots = Array.from(document.querySelectorAll(SEL.canvasRoot)).filter(present);
    const item = itemId ? Array.from(document.querySelectorAll(`[data-canvas-item-id="${CSS.escape(itemId)}"]`)).find(present) : null;
    const root = (item && item.closest(SEL.canvasRoot)) || roots[0] || null;
    if (!root) return null;
    const clip = meet(boxOf(root), { l: 0, t: 0, r: window.innerWidth, b: window.innerHeight });
    if (clip.r - clip.l < MIN_SIDE || clip.b - clip.t < MIN_SIDE) return null;
    const layers = Array.from(document.querySelectorAll(SEL.pinLayer)).filter(present);
    const layer = layers.find((l) => root.contains(l)) || layers.find((l) => areaOf(meet(boxOf(l), clip)) > 0);
    if (layer) {
      const vx = pxVar(layer, "--canvas-view-x");
      const vy = pxVar(layer, "--canvas-view-y");
      const z = parseFloat(layer.style.getPropertyValue("--canvas-view-zoom"));
      if (vx != null && vy != null && Number.isFinite(z) && z > 0) {
        const r = layer.getBoundingClientRect();
        return { ox: r.left + vx, oy: r.top + vy, z, clip, via: "view" };
      }
    }
    for (const el of item ? [item] : root.querySelectorAll(SEL.item)) {
      const b = itemBox(el);
      const r = b && present(el) ? el.getBoundingClientRect() : null;
      if (!r || !(r.width > 0)) continue;
      const z = r.width / b.w;
      return { ox: r.left - b.x * z, oy: r.top - b.y * z, z, clip, via: "item" };
    }
    return { ox: null, oy: null, z: 1, clip, via: "none" };
  }

  // The task's region: world coordinates (kind storyboard | anchor | view),
  // or screen coordinates (kind screen) when the view is unknown. Only what
  // is on screen now.
  function regionFor(info, v) {
    const c = v.clip;
    // createTask without an anchor: the canvas's whole visible area
    if (info && info.viewport) {
      if (v.ox == null) return { kind: "screen", x: c.l, y: c.t, w: c.r - c.l, h: c.b - c.t };
      const R = { kind: "viewport", x: (c.l - v.ox) / v.z, y: (c.t - v.oy) / v.z, w: (c.r - c.l) / v.z, h: (c.b - c.t) / v.z };
      return R.w * v.z >= MIN_SIDE && R.h * v.z >= MIN_SIDE ? R : null;
    }
    if (v.ox == null) {
      const w = Math.min(LOOSE_W, c.r - c.l);
      const h = Math.min(LOOSE_H, c.b - c.t);
      return { kind: "screen", x: (c.l + c.r - w) / 2, y: (c.t + c.b - h) / 2, w, h };
    }
    const z = v.z;
    const vis = { x: (c.l - v.ox) / z, y: (c.t - v.oy) / z, r: (c.r - v.ox) / z, b: (c.b - v.oy) / z };
    const hasXY = !!info && Number.isFinite(info.x) && Number.isFinite(info.y);
    const el = info && info.itemId ? itemById(info.itemId) : null;
    const b = el ? itemBox(el) : null;
    let R;
    if (b) {
      // the whole storyboard plus a margin (what is on screen of it)
      const m = MARGIN / z;
      R = { kind: "storyboard", x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m };
      const x0 = Math.max(R.x, vis.x);
      const y0 = Math.max(R.y, vis.y);
      R.w = Math.min(R.x + R.w, vis.r) - x0;
      R.h = Math.min(R.y + R.h, vis.b) - y0;
      R.x = x0;
      R.y = y0;
    } else {
      // No storyboard under the pin (empty canvas, loose pin): the canvas
      // around it, the pin a third in from the top-left (new content tends
      // to start at the pin); no anchor at all: the middle of the canvas.
      const w = Math.min(LOOSE_W / z, vis.r - vis.x);
      const h = Math.min(LOOSE_H / z, vis.b - vis.y);
      const f = hasXY ? 1 / 3 : 1 / 2;
      const ax = hasXY ? info.x : (vis.x + vis.r) / 2;
      const ay = hasXY ? info.y : (vis.y + vis.b) / 2;
      R = { kind: hasXY ? "anchor" : "view", x: clampN(ax - w * f, vis.x, vis.r - w), y: clampN(ay - h * f, vis.y, vis.b - h), w, h };
    }
    return R.w * z >= MIN_SIDE && R.h * z >= MIN_SIDE ? R : null;
  }
  function screenOf(R, v) {
    if (R.kind === "screen") return { l: R.x, t: R.y, r: R.x + R.w, b: R.y + R.h };
    if (v.ox == null) return null;
    return { l: v.ox + R.x * v.z, t: v.oy + R.y * v.z, r: v.ox + (R.x + R.w) * v.z, b: v.oy + (R.y + R.h) * v.z };
  }

  const CAP_WHY = {
    "no-bridge": "this build of the app can't take screenshots",
    "no-canvas": "the canvas wasn't on screen",
    "off-screen": "the commented area was off screen",
    failed: "the app's screenshot failed",
    timeout: "the app's screenshot took too long",
    crop: "the screenshot couldn't be cropped",
    frames: "too few frames were captured",
    encode: "the GIF couldn't be encoded",
    "other-canvas": "another canvas was open",
  };
  let capturing = Promise.resolve();
  function capture(cap, kind) {
    const run = capturing.then(() => captureNow(cap, kind));
    capturing = run.catch(() => null);
    return run;
  }
  // kind "before" | "after" | "frame" -> { ok: true, frame, shot?, ms } |
  // { ok: false, why }. frame = the GIF frame (PNG, gw x gh, hash);
  // before / after also return the JPEG screenshot (<= 720 px wide).
  async function captureNow(cap, kind) {
    const bridge = window.bugReportBridge;
    if (!bridge || typeof bridge.captureAppScreenshot !== "function") return { ok: false, why: "no-bridge" };
    const locate = () => {
      const v = viewOf(cap.info && cap.info.itemId);
      if (!v) return { why: "no-canvas" };
      if (!cap.region) {
        const R = regionFor(cap.info, v);
        if (!R) return { why: "off-screen" };
        cap.region = R;
        if (R.kind === "storyboard" && cap.info) R.itemId = cap.info.itemId;
        if (!cap.known) cap.known = new Set(Array.from(document.querySelectorAll(SEL.item), (n) => n.getAttribute("data-canvas-item-id")));
      } else if (kind !== "before") followStoryboard(cap, v);
      const s = screenOf(cap.region, v);
      if (!s) return { why: "no-canvas" };
      return areaOf(meet(s, v.clip)) >= 0.85 * areaOf(s) ? { s, via: v.via, v } : { why: "off-screen" };
    };
    const first = locate();
    if (first.why) return { ok: false, why: first.why };
    // Nothing of the mods' UI ever hides: the bubbles, the panel and the list
    // stay on screen and are masked in the image (the previous frame's pixels
    // there, else the canvas background colour). Before / after hide the
    // app's comment popover and pins (html.rtcc-capturing, ~0.1 s, once
    // each), so nothing under a pin is lost; GIF frames hide nothing and mask
    // the pins too (with the previous frame: the "before" has none).
    const covers = () => Array.from(document.querySelectorAll(`${SEL.overlays}, ${SEL.pins}`)).filter((n) => present(n) && getComputedStyle(n).visibility !== "hidden" && areaOf(meet(boxOf(n), first.s)) > 0);
    // "frame-clean": a frame retaken with the app's popover hidden (below)
    const cls = kind === "frame" ? null : "rtcc-capturing";
    const html = document.documentElement;
    const t0 = now();
    let at = null;
    let res = null;
    let masks = [];
    let popMasked = false;
    let vw = window.innerWidth;
    if (cls) html.classList.add(cls);
    try {
      if (cls) {
        await frame();
        await frame();
      }
      at = locate(); // the view may have moved meanwhile
      vw = window.innerWidth;
      if (!at.why) {
        const cv = covers();
        masks = cv.map(boxOf);
        popMasked = cv.some((n) => n.matches(SEL.popovers));
        // "before": the whole window is kept (with its view) until the run
        // ends, the change's frame is cut from it (see change shots)
        const wm = kind === "before" && cap.live && shotsOn() ? Array.from(document.querySelectorAll(SEL.overlays)).filter((n) => present(n) && getComputedStyle(n).visibility !== "hidden").map(boxOf) : null;
        res = await grab(bridge, cls);
        if (wm && res && res !== "timeout" && (res.blob || res.img) && at.v && at.v.ox != null) cap.wide = { blob: res.blob || null, img: res.img || null, w: res.w, vw: res.vw || vw, view: { ox: at.v.ox, oy: at.v.oy, z: at.v.z, clip: at.v.clip }, masks: wm, bg: canvasBg() };
      }
    } catch (e) {
      note("capture", e);
    } finally {
      if (cls) {
        html.classList.remove(cls);
        // what hides while capturing (pins, the popover, agent-cursors' layers) is back
        try {
          window.dispatchEvent(new CustomEvent("rtcc:captured", { detail: { kind } }));
        } catch (_) {}
      }
    }
    if (at && at.why) return { ok: false, why: at.why };
    if (res === "timeout" || !res || !(res.img || res.blob)) {
      state.captures.fail++;
      return { ok: false, why: res === "timeout" ? "timeout" : res && res.why ? res.why : "failed" };
    }
    try {
      if (res.vw) vw = res.vw;
      const s = at.s;
      const k = res.w / vw; // device px per CSS px of the capture
      const sx = s.l * k;
      const sy = s.t * k;
      const sw = (s.r - s.l) * k;
      const sh = (s.b - s.t) * k;
      if (!cap.gw) {
        cap.gw = Math.max(1, Math.round(Math.min(GIF_W, sw)));
        cap.gh = Math.max(1, Math.round(sh * (cap.gw / sw)));
      }
      // masks in region-relative fractions, painted on a canvas of size W x H
      const prev = cap.lastCv || null;
      const bg = masks.length && !prev ? canvasBg() : null;
      const fr = masks.map((m) => meet(m, s)).map((c) => ({ x: (c.l - s.l) / (s.r - s.l), y: (c.t - s.t) / (s.b - s.t), w: (c.r - c.l) / (s.r - s.l), h: (c.b - c.t) / (s.b - s.t) }));
      const mask = (cv) => {
        if (!fr.length) return cv;
        const g = cv.getContext("2d");
        for (const m of fr) {
          const x = Math.floor(m.x * cv.width);
          const y = Math.floor(m.y * cv.height);
          const w = Math.min(cv.width - x, Math.ceil(m.w * cv.width) + 1);
          const h = Math.min(cv.height - y, Math.ceil(m.h * cv.height) + 1);
          if (w <= 0 || h <= 0) continue;
          if (!prev) {
            g.fillStyle = bg;
            g.fillRect(x, y, w, h);
          } else if (prev.width === cv.width && prev.height === cv.height) {
            g.drawImage(prev, x, y, w, h, x, y, w, h); // the same pixels: no resampling, no drift
          } else {
            const kx = prev.width / cv.width;
            const ky = prev.height / cv.height;
            g.drawImage(prev, x * kx, y * ky, w * kx, h * ky, x, y, w, h);
          }
        }
        return cv;
      };
      const fc = mask(await cropTo(res, sx, sy, sw, sh, cap.gw, cap.gh));
      // the hash first: an unchanged frame is never encoded again
      const { hash, dom } = sigOf(fc);
      const same = kind !== "before" && kind !== "after" && hash === cap.lastHash && cap.last;
      // blank: a nearly uniform crop (a storyboard not painted yet, a capture
      // of nothing); the caller retries when it expected content
      const out = { ok: true, ms: 0, masked: fr.length, popMasked, same: !!same, blank: dom >= BLANK_SHARE, dom, frame: { at: now(), dataUrl: null, hash } };
      if (kind === "before" || kind === "after") {
        const outW = Math.max(1, Math.round(Math.min(sw, OUT_MAX_W)));
        const outH = Math.max(1, Math.round(sh * (outW / sw)));
        out.shot = { dataUrl: mask(await cropTo(res, sx, sy, sw, sh, outW, outH)).toDataURL("image/jpeg", 0.72), w: outW, h: outH };
      }
      cap.lastCv = fc;
      // PNG encoded off the main thread (toDataURL would block it ~50 ms,
      // while the cursor animates)
      out.frame.dataUrl = same ? cap.last.dataUrl : await pngOf(fc);
      out.ms = now() - t0;
      if (fr.length) state.captures.masked = (state.captures.masked || 0) + 1;
      state.captures.ok++;
      state.captures.last = { at: now(), kind, region: cap.region.kind, via: at.via, w: out.shot ? out.shot.w : cap.gw, h: out.shot ? out.shot.h : cap.gh, ms: out.ms, bytes: out.shot ? out.shot.dataUrl.length : out.frame.dataUrl.length };
      return out;
    } catch (e) {
      note("crop", e);
      state.captures.fail++;
      return { ok: false, why: "crop" };
    }
  }
  // One screenshot of the app window, decoded. A plain one (no class set) is
  // shared by every task capturing within SHARE_MS.
  let shared = null;
  async function grab(bridge, cls) {
    if (!cls && shared && now() - shared.at < SHARE_MS) {
      state.captures.shared = (state.captures.shared || 0) + 1;
      return shared;
    }
    const res = await Promise.race([bridge.captureAppScreenshot(), sleep(5000).then(() => "timeout")]);
    if (res === "timeout") return res;
    if (!res || res.ok === false || typeof res.dataUrl !== "string") return { why: "failed" };
    // Kept as a Blob: each crop is decoded and scaled off the main thread
    // (createImageBitmap); drawing the whole window into a canvas here would
    // block it ~50 ms while the cursors animate. Else a decoded image.
    let g = null;
    try {
      const blob = await (await fetch(res.dataUrl)).blob();
      const size = typeof createImageBitmap === "function" ? await pngSize(blob) : null;
      if (size) g = { at: now(), blob, w: size.w, h: size.h, vw: window.innerWidth };
    } catch (_) {}
    if (!g) {
      const img = new Image();
      img.src = res.dataUrl;
      await img.decode();
      g = { at: now(), img, w: img.naturalWidth, h: img.naturalHeight, vw: window.innerWidth };
    }
    state.captures.grabs = (state.captures.grabs || 0) + 1;
    (state.captures.grabTimes = state.captures.grabTimes || []).push(g.at);
    if (state.captures.grabTimes.length > 120) state.captures.grabTimes.shift();
    if (!cls) shared = g;
    return g;
  }
  // The canvas background colour (the first opaque background from the canvas
  // root up), for masks with no previous frame.
  function canvasBg() {
    let n = Array.from(document.querySelectorAll(SEL.canvasRoot)).find(present) || null;
    for (; n && n.nodeType === 1; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && c !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(c)) return c;
    }
    return "#1f1f1f";
  }
  // A PNG's size from its header (IHDR); null when it is not a PNG.
  async function pngSize(blob) {
    const b = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
    if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;
    const dv = new DataView(b.buffer, b.byteOffset, 24);
    const w = dv.getUint32(16);
    const h = dv.getUint32(20);
    return w > 0 && h > 0 ? { w, h } : null;
  }
  // The crop (device px of the capture) scaled to w x h, on a canvas: from
  // the Blob off the main thread, else drawn from the decoded image.
  async function cropTo(src, sx, sy, sw, sh, w, h) {
    if (src.blob && !src.img) {
      try {
        const bm = await createImageBitmap(src.blob, Math.round(sx), Math.round(sy), Math.max(1, Math.round(sw)), Math.max(1, Math.round(sh)), { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
        const cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        const g = cv.getContext("2d", { willReadFrequently: true });
        g.fillStyle = "#1f1f1f"; // a region partly off the window
        g.fillRect(0, 0, w, h);
        g.drawImage(bm, 0, 0);
        if (typeof bm.close === "function") bm.close();
        return cv;
      } catch (e) {
        note("crop-bitmap", e);
        const img = new Image();
        img.src = URL.createObjectURL(src.blob);
        try {
          await img.decode();
        } finally {
          URL.revokeObjectURL(img.src);
        }
        src.img = img;
      }
    }
    return drawTo(src.img, sx, sy, sw, sh, w, h);
  }
  function pngOf(cv) {
    const sync = () => cv.toDataURL("image/png");
    return new Promise((resolve) => {
      try {
        cv.toBlob((b) => {
          if (!b) return resolve(sync());
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = () => resolve(sync());
          fr.readAsDataURL(b);
        }, "image/png");
      } catch (_) {
        resolve(sync());
      }
    });
  }
  function drawTo(img, sx, sy, sw, sh, w, h) {
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.fillStyle = "#1f1f1f"; // a region partly off the window
    g.fillRect(0, 0, w, h);
    g.imageSmoothingQuality = "high";
    g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    return cv;
  }
  // 32x20 grey thumbnail, 4 bits per pixel, FNV-1a: equal for frames that look
  // the same (anti-aliasing noise aside).
  // ...and how uniform it is: the share of its pixels in the most common grey
  // band (3 bands of 8 levels): a blank crop is ~1 (the pin on it is ~2%).
  function sigOf(cv) {
    const t = document.createElement("canvas");
    t.width = 32;
    t.height = 20;
    const g = t.getContext("2d", { willReadFrequently: true });
    g.drawImage(cv, 0, 0, 32, 20);
    const d = g.getImageData(0, 0, 32, 20).data;
    let h = 0x811c9dc5;
    const bins = new Uint16Array(34);
    for (let i = 0; i < d.length; i += 4) {
      const y = (d[i] * 3 + d[i + 1] * 6 + d[i + 2]) / 10;
      bins[(y >> 3) + 1]++;
      h ^= y >> 4;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    let top = 0;
    for (let b = 1; b < 33; b++) top = Math.max(top, bins[b - 1] + bins[b] + bins[b + 1]);
    return { hash: h.toString(16), dom: top / (d.length / 4) };
  }
  // The region follows the storyboard, resolved at each capture: the one it
  // was on (its live box: the agent may resize it), else a storyboard that
  // appeared during the task (the nearest new one to the pin) or now holds
  // the pin. A new region resets the frame size: the frames taken before
  // are fitted into the final one when the GIF is built.
  function followStoryboard(cap, v) {
    const info = cap.info;
    if (!info || v.ox == null) return;
    let el = cap.region.itemId ? itemById(cap.region.itemId) : null;
    let a = null;
    if (!el && Number.isFinite(info.x) && Number.isFinite(info.y)) {
      const near = anchorAt(info.x, info.y);
      if (near.itemId) a = near;
      else if (cap.known) {
        let best = null;
        for (const n of document.querySelectorAll(SEL.item)) {
          const id = n.getAttribute("data-canvas-item-id");
          const b = !cap.known.has(id) && present(n) ? itemBox(n) : null;
          if (!b) continue;
          const d = Math.hypot(Math.max(b.x - info.x, 0, info.x - b.x - b.w), Math.max(b.y - info.y, 0, info.y - b.y - b.h));
          if (!best || d < best.d) best = { id, b, d, n };
        }
        if (best) a = { itemId: best.id, x: info.x, y: info.y, relX: Math.round(info.x - best.b.x), relY: Math.round(info.y - best.b.y), w: best.b.w, h: best.b.h, storyboard: headerName(best.n) || null };
      }
      if (a) el = itemById(a.itemId);
    }
    if (!el) return;
    const id = el.getAttribute("data-canvas-item-id");
    const merged = a ? { ...info, ...a, itemId: id } : { ...info, itemId: id };
    const R = regionFor(merged, v);
    if (!R || R.kind !== "storyboard") return;
    R.itemId = id;
    const old = cap.region;
    const moved = old.kind !== "storyboard" || old.itemId !== id || Math.abs(R.w - old.w) > old.w * 0.02 || Math.abs(R.h - old.h) > old.h * 0.02 || Math.abs(R.x - old.x) > 2 || Math.abs(R.y - old.y) > 2;
    if (!moved) return;
    cap.region = R;
    cap.info = merged;
    cap.gw = cap.gh = 0;
    cap.lastHash = null;
    state.captures.regionSwitch = { at: now(), item: id, kind: old.kind };
  }
  // A frame of the run; identical ones skipped; past FRAME_MAX every other
  // one goes (the first, "before", stays) and the interval doubles.
  function addFrame(cap, f, first) {
    if (!cap || !f) return;
    // "before" (taken while the chat starts): always the GIF's first frame
    if (first && cap.frames.length) return void cap.frames.unshift(f);
    cap.last = f;
    if (f.hash === cap.lastHash) {
      cap.every = Math.min(cap.every * 2, FRAME_IDLE_MAX); // nothing moves: slow down
      return;
    }
    cap.every = FRAME_MS; // something moved: back to the fast pace
    cap.lastHash = f.hash;
    cap.frames.push(f);
    if (cap.frames.length > FRAME_MAX + 1) {
      cap.frames = cap.frames.filter((_, i) => i % 2 === 0);
      cap.every = Math.min(cap.every * 2, 16000);
    }
  }
  // A capture that could not be taken: a note in the updates (one per shot)
  // and captureError, both cleared when that capture succeeds later.
  function capNote(task, shot, why) {
    const what = shot === "gif" ? "No GIF" : shot === "after" ? "No after screenshot yet" : `No ${shot} screenshot`;
    const text = `${what}: ${CAP_WHY[why] || why}`;
    state.captures.lastError = { at: now(), id: task.id, shot, why };
    if (task.captureError === text && task.updates.some((u) => u.kind === "note" && u.text === text)) return false;
    task.updates = task.updates.filter((u) => !(u.kind === "note" && u.shot === shot));
    task.updates.push({ at: now(), kind: "note", shot, text });
    task.captureError = text;
    task.captureErrorShot = shot;
    return true;
  }
  function capOk(task, shot) {
    task.updates = task.updates.filter((u) => !(u.kind === "note" && u.shot === shot));
    if (task.captureErrorShot === shot) task.captureError = task.captureErrorShot = null;
  }

  // Once per run: the frames -> task.gif and task.frames (first, middle, last).
  async function decodeFrame(url, w, h) {
    const img = new Image();
    img.src = url;
    await img.decode();
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const g = cv.getContext("2d", { willReadFrequently: true });
    // a frame from an earlier region (another size): fitted, centred
    const k = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const dw = Math.round(img.naturalWidth * k);
    const dh = Math.round(img.naturalHeight * k);
    if (dw !== w || dh !== h) {
      g.fillStyle = canvasBg();
      g.fillRect(0, 0, w, h);
      g.drawImage(img, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
    } else g.drawImage(img, 0, 0, w, h);
    return { cv, data: g.getImageData(0, 0, w, h) };
  }
  async function buildGif(task) {
    const cap = task.cap;
    if (!cap || cap.gifTried) return;
    cap.gifTried = true;
    cap.gifDone = false;
    const list = cap.frames.slice();
    cap.frames = [];
    if (list.length < 2 || !cap.gw) {
      capNote(task, "gif", "frames");
      cap.gifDone = true;
      return changed();
    }
    const t0 = now();
    try {
      const dec = [];
      for (const f of list) {
        dec.push(await decodeFrame(f.dataUrl, cap.gw, cap.gh));
        await sleep(0);
      }
      const enc = await encodeGif(
        dec.map((d) => d.data),
        { delay: GIF_DELAY, hold: GIF_HOLD }
      );
      task.gif = { dataUrl: `data:image/gif;base64,${b64(enc.data)}`, frames: enc.frames, w: cap.gw, h: cap.gh, bytes: enc.data.length };
      const keys = [...new Set([0, Math.floor((dec.length - 1) / 2), dec.length - 1])];
      task.frames = keys.map((i) => ({ dataUrl: dec[i].cv.toDataURL("image/jpeg", 0.8), w: cap.gw, h: cap.gh, at: list[i].at }));
      capOk(task, "gif");
      state.gif = { at: now(), id: task.id, frames: enc.frames, captured: list.length, bytes: enc.data.length, ms: now() - t0 };
    } catch (e) {
      note("gif", e);
      capNote(task, "gif", "encode");
    }
    cap.gifDone = true;
    changed();
  }

  // ---------------------------------------------------------- change shots
  // What the agent changed, framed on the change and rendered at the
  // frame's own density (see Screenshots): the canvas's storyboards are
  // snapshotted (their projection documents' HTML) on Enter and while the
  // task runs; at the end the change is the diff, and before / after / the
  // replay are drawn from those snapshots by a hidden <webview>, never at
  // the user's zoom and wherever the user's camera is.
  const SHOT_W = 960; // the hero's width at most (px)
  const SHOT_H = 1280;
  const SHOT_MAX_K = 3; // px per canvas unit, at most
  const SHOT_MIN_SIDE = 240; // canvas units: a tiny change keeps some context
  const SHOT_PAD = 0.07; // of the frame's longer side (24 canvas units at least)
  const PIN_GROW_MAX = 2.5; // the pin joins the frame unless it makes it this much bigger
  const CTX_SIDE = 900; // canvas units: an edit in a storyboard bigger than this is framed with part of it
  const ASPECT_MIN = 0.56; // w / h of the frame, widened / heightened into this range
  const ASPECT_MAX = 2.2;
  const REPLAY_W = 640;
  const REPLAY_MAX_MS = 6000;
  const REPLAY_HOLD_MS = 1400; // the after stays this long before the loop
  const REPLAY_STEP_MS = 1100;
  const REPLAY_MID_MAX = 4; // states between before and after
  const SNAP_MAX = 60; // storyboards per scene
  const SNAP_STATES = 8; // states kept per storyboard while a task runs
  const SNAP_CHARS = 4 * 1024 * 1024; // body HTML kept per task, at most
  const SCENE_POLL_MS = 1500;
  const DIFF_W = 160; // px: the low-res renders that find what changed inside a storyboard
  const RENDER_IDLE_MS = 30000; // the hidden webview goes after this long unused
  const FALLBACK_MS = 20000; // no render after this long: the last frame, said so
  const NODE_KINDS = { browser: [".rtbf-frame[data-rtbf-id]", "data-rtbf-id"], shader: [".rtsh-frame[data-rtsh-id]", "data-rtsh-id"] };
  const idle = (fn, ms) => (typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: ms }) : setTimeout(fn, 0));
  const unionOf = (a, b) => {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  };
  const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const boxMoved = (a, b) => Math.abs(a.x - b.x) > 2 || Math.abs(a.y - b.y) > 2 || Math.abs(a.w - b.w) > 2 || Math.abs(a.h - b.h) > 2;

  // One storyboard's state: its box, name, z order and its projection
  // document (the <head> is shared by every storyboard of a canvas: kept
  // once, by a key of its children's sizes).
  const heads = new Map(); // head key -> head HTML
  function headKeyOf(d) {
    let k = "";
    for (const n of d.head.children) k += `${n.tagName}:${n.tagName === "STYLE" ? n.textContent.length : n.getAttribute("href") || n.getAttribute("content") || ""}|`;
    return k;
  }
  function sbState(el, at) {
    const b = itemBox(el);
    if (!b) return null;
    const f = el.querySelector('iframe[title="Projection surface"]') || el.querySelector("iframe");
    const hd = el.querySelector(SEL.header);
    const name = hd ? (hd.textContent || "").trim().slice(0, 80) : ""; // textContent: innerText would force a layout
    const st = { id: el.getAttribute("data-canvas-item-id"), at, box: b, z: parseInt(el.style.zIndex, 10) || 0, name: name || null, body: null, head: null, attrs: null, url: null };
    let d = null;
    try {
      d = f && f.contentDocument && f.contentDocument.body ? f.contentDocument : null;
    } catch (_) {}
    if (d) {
      const hk = headKeyOf(d);
      if (!heads.has(hk)) {
        heads.set(hk, d.head.innerHTML);
        if (heads.size > 16) heads.delete(heads.keys().next().value);
      }
      st.head = hk;
      st.body = d.body.outerHTML;
      st.attrs = Array.from(d.documentElement.attributes, (a) => [a.name, a.value]);
    } else if (f && /^https?:/i.test(f.getAttribute("src") || "")) st.url = f.src;
    return st.body != null || st.url ? st : { ...st, blank: true };
  }
  // The mods' frames on the canvas (browser, shader), in canvas units.
  function nodeStates(v) {
    const out = new Map();
    if (!v || v.ox == null) return out;
    for (const [kind, [sel, attr]] of Object.entries(NODE_KINDS))
      for (const n of document.querySelectorAll(sel)) {
        const r = n.isConnected ? n.getBoundingClientRect() : null;
        if (!r || !(r.width > 0)) continue;
        const id = `${kind}:${n.getAttribute(attr)}`;
        const label = kind === "browser" ? (n.getAttribute("data-rtbf-url") || n.getAttribute("title") || "Browser").slice(0, 60) : "Shader";
        out.set(id, { id, kind, box: { x: (r.left - v.ox) / v.z, y: (r.top - v.oy) / v.z, w: r.width / v.z, h: r.height / v.z }, label });
      }
    return out;
  }
  // A scene (every storyboard of the canvas, the mods' frames, the view),
  // read in idle slices of ~4 ms: the cursor's flight never waits for it.
  const SC = { slices: 0, max: 0, setup: 0 }; // the scene reads' cost (ms), for QA
  function sceneSoon(cb) {
    const s0 = performance.now();
    const v = viewOf(null);
    const els = Array.from(canvasScope().querySelectorAll(SEL.item)).slice(0, SNAP_MAX);
    const sc = { at: now(), view: v && v.ox != null ? { ox: v.ox, oy: v.oy, z: v.z, clip: v.clip } : null, sbs: new Map(), nodes: nodeStates(v) };
    SC.setup = Math.max(SC.setup, performance.now() - s0);
    let i = 0;
    const step = () => {
      const t0 = performance.now();
      try {
        while (i < els.length && performance.now() - t0 < 4) {
          const st = els[i].isConnected ? sbState(els[i], now()) : null;
          if (st) sc.sbs.set(st.id, st);
          i++;
        }
      } catch (e) {
        note("scene", e);
        i = els.length;
      }
      SC.slices++;
      SC.max = Math.max(SC.max, performance.now() - t0);
      if (i < els.length) idle(step, 400);
      else cb(sc);
    };
    idle(step, 400);
  }
  // On Enter: the scene the change is measured from.
  function sceneStart(cap) {
    if (!cap || cap.scene0 || cap.scene0Pending || !shotsOn()) return;
    cap.scene0Pending = true;
    sceneSoon((sc) => {
      cap.scene0Pending = false;
      cap.scene0 = sc;
      cap.states = new Map();
      cap.stateChars = 0;
    });
  }
  // While tasks run: every 1.5 s the storyboards whose HTML or box changed
  // become a state of each running task (the replay's middle frames).
  let scenePollAt = 0;
  let scenePolling = false;
  function scenePoll() {
    const live = tasks.filter((t) => (t.status === "running" || t.status === "needs-input") && t.cap && t.cap.live && t.cap.scene0);
    if (!live.length || scenePolling || now() - scenePollAt < SCENE_POLL_MS) return;
    scenePolling = true;
    scenePollAt = now();
    sceneSoon((sc) => {
      scenePolling = false;
      for (const t of live) {
        const cap = t.cap;
        for (const st of sc.sbs.values()) {
          if (st.blank) continue;
          const list = cap.states.get(st.id) || [];
          const last = list[list.length - 1] || cap.scene0.sbs.get(st.id);
          if (last && last.body === st.body && last.url === st.url && !boxMoved(last.box, st.box)) continue;
          if (cap.stateChars + (st.body ? st.body.length : 0) > SNAP_CHARS) continue;
          list.push(st);
          cap.stateChars += st.body ? st.body.length : 0;
          if (list.length > SNAP_STATES) cap.stateChars -= (list.splice(1, 1)[0].body || "").length; // the first and the latest stay
          cap.states.set(st.id, list);
        }
      }
    });
  }
  // The agent's cursor, for the replay: where each canvas action happened
  // (canvas units), and the names it touched (whose change is whose).
  function trackAct(task, kind, label, target) {
    const cap = task && task.cap;
    if (!cap || !cap.live || !target) return;
    const v = viewOf(null);
    let p = null;
    if (target.rect && v && v.ox != null) p = { x: (target.rect.left + target.rect.width / 2 - v.ox) / v.z, y: (target.rect.top + target.rect.height / 2 - v.oy) / v.z };
    else if (Number.isFinite(target.x) && Number.isFinite(target.y)) p = { x: target.x, y: target.y };
    if (target.nodeId) (cap.touched = cap.touched || new Set()).add(squash(target.nodeId));
    if (target.storyboardName) (cap.touched = cap.touched || new Set()).add(squash(target.storyboardName));
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const tr = (cap.track = cap.track || []);
    tr.push({ at: now(), x: p.x, y: p.y, kind, label: clip(label || "", 40), fallback: !!target.fallback });
    if (tr.length > 40) tr.splice(1, 1);
  }

  // ------------------------------------------------- the hidden renderer
  // One <webview> (in-memory partition "rtcc-shots"), fixed at the window's
  // top-left under everything, opacity 0, no pointer events: a guest needs
  // to be in the viewport to paint (off the window it never does), and
  // opacity 0 still paints. Each render writes one storyboard's document
  // into it (about:blank + document.write: a data: URL is not allowed),
  // waits for its images and fonts, and takes capturePage(); the zoom factor
  // makes the guest draw at the density the frame needs, layout untouched.
  const RD = { host: null, wv: null, ready: null, chain: Promise.resolve(), t: 0, renders: 0, fails: 0, ms: [] };
  function rdDrop() {
    clearTimeout(RD.t);
    RD.t = 0;
    const t0 = performance.now();
    if (RD.host) RD.host.remove();
    RD.host = RD.wv = RD.ready = null;
    RD.dropMs = performance.now() - t0;
  }
  function rdOpen() {
    clearTimeout(RD.t);
    RD.t = setTimeout(rdDrop, RENDER_IDLE_MS);
    if (RD.wv && RD.wv.isConnected && RD.ready) return RD.ready;
    if (!(window.customElements && window.customElements.get("webview"))) return Promise.resolve(false);
    const host = document.createElement("div");
    host.setAttribute("data-rtcc-render", "");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "position:fixed;left:0;top:0;width:16px;height:16px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1;contain:strict;";
    const wv = document.createElement("webview");
    wv.setAttribute("partition", "rtcc-shots");
    wv.setAttribute("src", "about:blank");
    wv.setAttribute("tabindex", "-1");
    wv.style.cssText = "display:flex;width:16px;height:16px;";
    const t0 = performance.now();
    host.append(wv);
    document.body.append(host);
    RD.openMs = performance.now() - t0;
    RD.host = host;
    RD.wv = wv;
    RD.fresh = true;
    RD.ready = new Promise((res) => {
      const t = setTimeout(() => res(false), 8000);
      wv.addEventListener(
        "dom-ready",
        () => {
          clearTimeout(t);
          res(true);
        },
        { once: true }
      );
    });
    return RD.ready;
  }
  // In the guest: the document, then its images and fonts (3 s at most),
  // then two frames.
  const GUEST_WRITE = `(html, bg) => new Promise((done) => {
    document.open(); document.write(html); document.close();
    const s = document.createElement("style");
    s.textContent = "html{background:" + bg + " !important}*{caret-color:transparent!important}";
    (document.head || document.documentElement).appendChild(s);
    const imgs = Array.from(document.images);
    let n = imgs.length + 1;
    const next = () => { if (--n === 0) (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => done(true), 16)))); };
    imgs.forEach((i) => (i.complete ? next() : i.addEventListener("load", next, { once: true }), i.complete || i.addEventListener("error", next, { once: true })));
    next();
    setTimeout(() => done(false), 3000);
  })`;
  // st (a storyboard state) drawn at k px per canvas unit -> ImageBitmap
  // (st.box.w * k wide, or less when it cannot fit the window).
  function renderSb(st, k) {
    const run = RD.chain.then(() => renderNow(st, k));
    RD.chain = run.catch(() => null);
    return run;
  }
  async function renderNow(st, k) {
    if (!(await rdOpen())) throw new Error("no-webview");
    // a new guest's first capture can come before its first paint: once
    // for nothing
    if (RD.fresh) {
      RD.fresh = false;
      await renderNow(st, k)
        .then((bm) => bm.close())
        .catch(() => {});
    }
    const t0 = now();
    const wv = RD.wv;
    const dpr = window.devicePixelRatio || 1;
    // the guest draws at dpr; its box stays inside the window (a guest
    // paints only what is in the viewport)
    const z = Math.max(0.25, Math.min(k / dpr, (window.innerWidth - 4) / st.box.w, (window.innerHeight - 4) / st.box.h, 4));
    const W = Math.max(1, Math.round(st.box.w * z));
    const H = Math.max(1, Math.round(st.box.h * z));
    RD.host.style.width = wv.style.width = `${W}px`;
    RD.host.style.height = wv.style.height = `${H}px`;
    try {
      wv.setZoomFactor(z);
    } catch (_) {}
    if (st.url) {
      await Promise.race([wv.loadURL(st.url), sleep(8000)]);
      await sleep(400);
    } else {
      const attrs = (st.attrs || []).map(([n, v]) => ` ${n}="${String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`).join("");
      // the projected DOM only: no script runs in the guest (scripts and
      // inline handlers dropped)
      const inert = (x) => String(x || "").replace(/<script\b[\s\S]*?<\/script\s*>/gi, "").replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
      const html = `<!doctype html><html${attrs}><head>${inert(heads.get(st.head))}</head>${inert(st.body) || "<body></body>"}</html>`;
      await Promise.race([wv.executeJavaScript(`(${GUEST_WRITE})(${JSON.stringify(html)}, ${JSON.stringify(canvasBg())})`), sleep(5000)]);
    }
    const img = await Promise.race([wv.capturePage(), sleep(4000).then(() => null)]);
    if (!img || img.isEmpty()) {
      RD.fails++;
      throw new Error("capture");
    }
    const tj = performance.now();
    const jpg = img.toJPEG(92); // the only synchronous step (~2-3 ms for 1 MP)
    RD.syncMax = Math.max(RD.syncMax || 0, performance.now() - tj);
    const bm = await createImageBitmap(new Blob([jpg], { type: "image/jpeg" }));
    RD.renders++;
    RD.ms.push(now() - t0);
    if (RD.ms.length > 40) RD.ms.shift();
    return bm;
  }

  // ------------------------------------------------- the change and its frame
  // The changes between the scene on Enter (s0) and now (s1): storyboards
  // new, moved / resized, edited (their HTML), removed; the mods' frames
  // new, moved or removed. A change another task named (and this one did
  // not) is that task's. null: not the same canvas (nothing to compare).
  function changesOf(task, s0, s1) {
    const out = [];
    const common = [...s1.sbs.keys()].filter((id) => s0.sbs.has(id)).length;
    if (s0.sbs.size && s1.sbs.size && !common) return null; // another canvas
    for (const [id, st] of s1.sbs) {
      if (st.blank) continue;
      const old = s0.sbs.get(id);
      const label = st.name || id;
      if (!old) out.push({ id, kind: "new", box: st.box, label });
      else if (boxMoved(old.box, st.box)) out.push({ id, kind: "moved", box: st.box, from: old.box, label });
      else if (!old.blank && (old.body !== st.body || old.url !== st.url)) out.push({ id, kind: "edited", box: st.box, label });
    }
    for (const [id, st] of s0.sbs) if (!s1.sbs.has(id) && s1.sbs.size) out.push({ id, kind: "removed", box: st.box, label: st.name || id });
    for (const [id, n] of s1.nodes) {
      const old = s0.nodes.get(id);
      if (!old) out.push({ id, kind: "new", box: n.box, label: n.label, node: true });
      else if (boxMoved(old.box, n.box)) out.push({ id, kind: "moved", box: n.box, from: old.box, label: n.label, node: true });
    }
    const mine = task.cap.touched || new Set();
    const others = tasks.filter((t) => t !== task && t.cap && t.cap.touched && (t.createdAt >= task.createdAt - 60000 || LIVE.has(t.status)));
    return out.filter((c) => {
      const keys = [squash(c.id), squash(c.label)];
      if (keys.some((k) => mine.has(k))) return true;
      return !others.some((t) => keys.some((k) => t.cap.touched.has(k)));
    });
  }
  // Where an edit happened inside a storyboard: before and after drawn
  // small (DIFF_W px wide), the box of the pixels that differ (canvas units),
  // or null (nothing visible changed: the whole storyboard).
  async function diffBox(a, b) {
    const k = Math.min(1, DIFF_W / b.box.w);
    const [ba, bb] = await Promise.all([renderSb(a, k), renderSb(b, k)]);
    const w = Math.max(1, Math.round(b.box.w * k));
    const h = Math.max(1, Math.round(b.box.h * k));
    const px = (bm) => {
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const g = cv.getContext("2d", { willReadFrequently: true });
      g.drawImage(bm, 0, 0, w, h);
      bm.close();
      return g.getImageData(0, 0, w, h).data;
    };
    const da = px(ba);
    const db = px(bb);
    let l = w;
    let t = h;
    let r = -1;
    let btm = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) < 48) continue;
        if (x < l) l = x;
        if (x > r) r = x;
        if (y < t) t = y;
        if (y > btm) btm = y;
      }
    if (r < 0) return null;
    const s = b.box.w / w;
    return { x: b.box.x + l * s, y: b.box.y + t * s, w: (r - l + 1) * s, h: (btm - t + 1) * s };
  }
  // The frame: every change (and where a moved one was), the pin when it
  // does not make the frame much bigger, a margin, a minimum size and a
  // ratio a card can show.
  function frameOf(task, boxes) {
    let U = null;
    for (const b of boxes) U = U ? unionOf(U, b) : { ...b };
    if (!U) return null;
    let F = U;
    const a = task.anchor;
    if (a && Number.isFinite(a.x) && Number.isFinite(a.y)) {
      const P = unionOf(U, { x: a.x, y: a.y, w: 0, h: 0 });
      const area = (r) => Math.max(r.w, SHOT_MIN_SIDE) * Math.max(r.h, SHOT_MIN_SIDE);
      if (area(P) <= PIN_GROW_MAX * area(U)) F = P;
    }
    const pad = Math.max(24, SHOT_PAD * Math.max(F.w, F.h));
    F = { x: F.x - pad, y: F.y - pad, w: F.w + 2 * pad, h: F.h + 2 * pad };
    const grow = (f, key, want) => {
      if (f[key] >= want) return;
      const d = (want - f[key]) / 2;
      if (key === "w") f.x -= d;
      else f.y -= d;
      f[key] = want;
    };
    grow(F, "w", SHOT_MIN_SIDE);
    grow(F, "h", SHOT_MIN_SIDE * 0.66);
    if (F.w / F.h > ASPECT_MAX) grow(F, "h", F.w / ASPECT_MAX);
    if (F.w / F.h < ASPECT_MIN) grow(F, "w", F.h * ASPECT_MIN);
    return F;
  }

  // ------------------------------------------------------- composition
  // A crop of a window capture (the one on Enter, or one taken now) for a
  // box in canvas units -> drawn into g at its place in frame F (k px per
  // unit). Only where that capture showed the canvas; masks painted over.
  async function drawWide(g, wide, box, F, k) {
    const v = wide.view;
    if (!v) return false;
    const s = { l: v.ox + box.x * v.z, t: v.oy + box.y * v.z, r: v.ox + (box.x + box.w) * v.z, b: v.oy + (box.y + box.h) * v.z };
    const c = meet(s, v.clip);
    if (areaOf(c) < 0.85 * areaOf(s)) return false;
    const d = wide.w / wide.vw;
    const dx = ((c.l - v.ox) / v.z - F.x) * k;
    const dy = ((c.t - v.oy) / v.z - F.y) * k;
    const dw = Math.max(1, Math.round(((c.r - c.l) / v.z) * k));
    const dh = Math.max(1, Math.round(((c.b - c.t) / v.z) * k));
    const src = wide.blob ? await createImageBitmap(wide.blob, Math.round(c.l * d), Math.round(c.t * d), Math.max(1, Math.round((c.r - c.l) * d)), Math.max(1, Math.round((c.b - c.t) * d)), { resizeWidth: dw, resizeHeight: dh, resizeQuality: "high" }) : null;
    if (src) {
      g.drawImage(src, dx, dy);
      src.close();
    } else if (wide.img) g.drawImage(wide.img, c.l * d, c.t * d, (c.r - c.l) * d, (c.b - c.t) * d, dx, dy, dw, dh);
    else return false;
    g.fillStyle = wide.bg || canvasBg();
    for (const m of wide.masks || []) {
      const mm = meet(m, c);
      if (areaOf(mm) > 0) g.fillRect(((mm.l - v.ox) / v.z - F.x) * k, ((mm.t - v.oy) / v.z - F.y) * k, ((mm.r - mm.l) / v.z) * k, ((mm.b - mm.t) / v.z) * k);
    }
    return true;
  }
  function placeholder(g, n, F, k) {
    const x = (n.box.x - F.x) * k;
    const y = (n.box.y - F.y) * k;
    const w = n.box.w * k;
    const h = n.box.h * k;
    g.save();
    g.fillStyle = "rgba(255,255,255,0.04)";
    g.strokeStyle = "rgba(255,255,255,0.18)";
    g.lineWidth = Math.max(1, k);
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, 8 * k);
    else g.rect(x, y, w, h);
    g.fill();
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.font = `${Math.max(10, Math.round(13 * k))}px Inter, system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(n.kind === "browser" ? `Browser · ${n.label}` : n.label, x + w / 2, y + h / 2, w - 16);
    g.restore();
  }
  // One picture of frame F at k px per unit: the canvas colour, the
  // storyboards (rendered, in z order), the mods' frames (from a window
  // capture where it showed them, else a labelled placeholder).
  async function compose(F, k, sbs, nodes, wides) {
    const W = Math.max(1, Math.round(F.w * k));
    const H = Math.max(1, Math.round(F.h * k));
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const g = cv.getContext("2d");
    g.fillStyle = canvasBg();
    g.fillRect(0, 0, W, H);
    const st = { sb: 0, wide: 0, ph: 0, failed: 0 };
    const list = [...sbs].filter((s) => !s.blank && hits(s.box, F)).sort((a, b) => a.z - b.z);
    for (const s of list) {
      let ok = false;
      try {
        const bm = await renderSb(s, k);
        g.drawImage(bm, (s.box.x - F.x) * k, (s.box.y - F.y) * k, s.box.w * k, s.box.h * k);
        bm.close();
        ok = true;
        st.sb++;
      } catch (e) {
        note("render", e);
        st.failed++;
      }
      if (!ok) {
        for (const w of wides) if (w && (await drawWide(g, w, s.box, F, k).catch(() => false))) (ok = true), st.wide++;
        if (!ok) placeholder(g, { kind: "storyboard", label: s.name || s.id, box: s.box }, F, k), st.ph++;
      }
    }
    for (const n of nodes) {
      if (!hits(n.box, F)) continue;
      let ok = false;
      for (const w of wides) if (!ok && w && (await drawWide(g, w, n.box, F, k).catch(() => false))) (ok = true), st.wide++;
      if (!ok) placeholder(g, n, F, k), st.ph++;
      await sleep(0);
    }
    return { cv, W, H, st };
  }
  // A canvas -> JPEG data URL, encoded off the main thread (toBlob).
  function jpegOf(cv, q) {
    return new Promise((resolve) => {
      const sync = () => cv.toDataURL("image/jpeg", q);
      try {
        cv.toBlob(
          (b) => {
            if (!b) return resolve(sync());
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result));
            fr.onerror = () => resolve(sync());
            fr.readAsDataURL(b);
          },
          "image/jpeg",
          q
        );
      } catch (_) {
        resolve(sync());
      }
    });
  }
  function scaled(cv, w, h) {
    if (cv.width === w && cv.height === h) return cv;
    const o = document.createElement("canvas");
    o.width = w;
    o.height = h;
    const g = o.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(cv, 0, 0, w, h);
    return o;
  }

  // ------------------------------------------------------- the final shots
  // Once the run is done (3 s for the canvas to repaint): the change, its
  // frame, after / before (null when there was nothing there) and the
  // replay -> task.after / before / shot / replay; the GIF is built from the
  // replay's frames. Returns true when done, false to try again later, or
  // "fallback" (no renderer: the window capture path takes over).
  async function finalShots(task) {
    const cap = task.cap;
    const t0 = now();
    const s0 = cap.scene0 || null;
    const s1 = await new Promise((r) => sceneSoon(r));
    if (!s1.sbs.size && !s1.nodes.size && !s1.view) return capNote(task, "after", "no-canvas"), false;
    let changes = s0 ? changesOf(task, s0, s1) : [];
    if (changes === null) return capNote(task, "after", "other-canvas"), false;
    // what an edit changed inside its storyboard (a big one: its pixels)
    for (const c of changes) {
      if (c.kind !== "edited" || c.node) continue;
      const a = s0.sbs.get(c.id);
      const b = s1.sbs.get(c.id);
      if (!a || !b || Math.max(b.box.w, b.box.h) < SHOT_MIN_SIDE * 1.5) continue;
      try {
        const d = await diffBox(a, b);
        const B = b.box;
        if (d) c.area = d;
        // a big storyboard (a long page): framed on the edit with some of
        // the storyboard around it, inside it; else the whole storyboard
        // (the edit highlighted in it)
        if (d && (Math.max(B.w, B.h) > CTX_SIDE || d.w * d.h < 0.02 * B.w * B.h)) {
          const ctx = { ...d };
          const fit = (key, pos, want, lo, span) => {
            if (ctx[key] < want) (ctx[pos] -= (want - ctx[key]) / 2), (ctx[key] = want);
            ctx[key] = Math.min(ctx[key], span);
            ctx[pos] = clampN(ctx[pos], lo, lo + span - ctx[key]);
          };
          fit("w", "x", Math.max(SHOT_MIN_SIDE, 0.7 * B.w), B.x, B.w);
          fit("h", "y", Math.max(SHOT_MIN_SIDE * 0.66, 0.55 * B.h), B.y, B.h);
          c.ctx = ctx;
        }
      } catch (e) {
        if (String(e && e.message) === "no-webview") return "fallback";
        note("diff", e);
      }
    }
    let boxes = changes.map((c) => c.ctx || c.box);
    for (const c of changes) if (c.from) boxes.push(c.from);
    let why = null;
    if (!boxes.length) {
      // nothing to compare (a reload) or nothing changed: what the agent
      // named, else the storyboard at the pin, else the canvas around it
      const named = [...s1.sbs.values()].filter((s) => cap.touched && (cap.touched.has(squash(s.id)) || cap.touched.has(squash(s.name))));
      const pin = cap.info && cap.info.itemId ? s1.sbs.get(cap.info.itemId) : null;
      boxes = named.length ? named.map((s) => s.box) : pin ? [pin.box] : [];
      if (!boxes.length && task.anchor) boxes = [{ x: task.anchor.x - 320, y: task.anchor.y - 140, w: 640, h: 420 }];
      if (!boxes.length && s0 && s0.view) {
        const v = s0.view;
        boxes = [{ x: (v.clip.l - v.ox) / v.z, y: (v.clip.t - v.oy) / v.z, w: (v.clip.r - v.clip.l) / v.z, h: (v.clip.b - v.clip.t) / v.z }];
      }
      why = s0 ? "nothing-changed" : "no-scene";
    }
    const F = frameOf(task, boxes);
    if (!F) return capNote(task, "after", "no-canvas"), false;
    const k = Math.min(SHOT_MAX_K, SHOT_W / F.w, SHOT_H / F.h);
    // the window as it is now, for the mods' frames (pins hidden, ~0.1 s)
    const nodesIn = (sc) => [...sc.nodes.values()].filter((n) => hits(n.box, F));
    let wideNow = null;
    if (nodesIn(s1).length) wideNow = await grabWide().catch(() => null);
    let after;
    try {
      after = await compose(F, k, s1.sbs.values(), nodesIn(s1), [wideNow]);
    } catch (e) {
      note("compose", e);
      return "fallback";
    }
    if (after.st.failed && !after.st.sb) return "fallback";
    const before0 = s0 ? [...s0.sbs.values()].filter((s) => !s.blank && hits(s.box, F)) : [];
    const empty = !!s0 && !before0.length && !nodesIn(s0).length;
    let before = null;
    if (s0 && !empty) before = await compose(F, k, s0.sbs.values(), nodesIn(s0), [cap.wide]);
    const frac = (b) => ({ fx: (b.x - F.x) / F.w, fy: (b.y - F.y) / F.h, fw: b.w / F.w, fh: b.h / F.h });
    const kindOf = { new: "new", moved: "moved", edited: "edited", removed: "removed" };
    const a = task.anchor;
    const pinIn = a && a.x >= F.x && a.x <= F.x + F.w && a.y >= F.y && a.y <= F.y + F.h;
    const src = after.st.wide && after.st.sb ? "mixed" : after.st.wide ? "window" : "offscreen";
    const off = s1.view ? areaOf(meet({ l: s1.view.ox + F.x * s1.view.z, t: s1.view.oy + F.y * s1.view.z, r: s1.view.ox + (F.x + F.w) * s1.view.z, b: s1.view.oy + (F.y + F.h) * s1.view.z }, s1.view.clip)) < 0.85 * F.w * F.h * s1.view.z * s1.view.z : true;
    task.shot = {
      v: 2,
      frame: { x: Math.round(F.x), y: Math.round(F.y), w: Math.round(F.w), h: Math.round(F.h) },
      boxes: changes.slice(0, 12).map((c) => ({ ...frac(c.area || c.box), kind: kindOf[c.kind], label: clip(c.label || "", 40) })),
      pin: pinIn ? { fx: (a.x - F.x) / F.w, fy: (a.y - F.y) / F.h } : null,
      empty,
      src,
      k: Math.round(k * 1000) / 1000,
      note: after.st.ph ? "Some frames were off screen: shown as outlines" : off ? "Rendered from the canvas's code: the area was off screen" : why === "no-scene" ? "Before isn't available (the app reloaded)" : null,
    };
    task.after = { dataUrl: await jpegOf(after.cv, 0.84), w: after.W, h: after.H };
    task.before = before ? { dataUrl: await jpegOf(before.cv, 0.84), w: before.W, h: before.H } : null;
    task.updates = task.updates.filter((u) => !(u.kind === "screenshot" && (u.text === "before" || u.text === "after")));
    if (task.before) task.updates.unshift({ at: task.createdAt, kind: "screenshot", text: "before", dataUrl: task.before.dataUrl });
    task.updates.push({ at: now(), kind: "screenshot", text: "after", dataUrl: task.after.dataUrl });
    capOk(task, "after");
    capOk(task, "before");
    cap.frameF = F;
    try {
      await buildReplay(task, F, k, s0, s1, after, before, changes);
    } catch (e) {
      note("replay", e);
    }
    state.captures.final = { at: now(), id: task.id, ms: now() - t0, frame: task.shot.frame, k: task.shot.k, w: after.W, h: after.H, src, empty, changes: changes.length, why, renders: RD.renders, renderMs: RD.ms.slice(-6) };
    changed();
    return true;
  }
  // A plain window capture with the view it shows (pins and the comment
  // popover hidden ~0.1 s, the mods' UI masked).
  async function grabWide() {
    const bridge = window.bugReportBridge;
    if (!bridge || typeof bridge.captureAppScreenshot !== "function") return null;
    const v = viewOf(null);
    if (!v || v.ox == null) return null;
    const html = document.documentElement;
    html.classList.add("rtcc-capturing");
    let res = null;
    let masks = [];
    try {
      await frame();
      await frame();
      masks = Array.from(document.querySelectorAll(SEL.overlays))
        .filter((n) => present(n) && getComputedStyle(n).visibility !== "hidden")
        .map(boxOf);
      res = await grab(bridge, "rtcc-capturing");
    } finally {
      html.classList.remove("rtcc-capturing");
      fire("rtcc:captured", { kind: "after" });
    }
    if (!res || res === "timeout" || !(res.blob || res.img)) return null;
    return { blob: res.blob || null, img: res.img || null, w: res.w, vw: res.vw || window.innerWidth, view: { ox: v.ox, oy: v.oy, z: v.z, clip: v.clip }, masks, bg: canvasBg() };
  }
  // The replay: before, the states the canvas went through, after, in frame
  // F at REPLAY_W px at most, <= 6 s, and the agent's cursor on that
  // timeline (its actions, else from the pin to each change).
  async function buildReplay(task, F, k, s0, s1, after, before, changes) {
    const cap = task.cap;
    const kr = Math.min(k, REPLAY_W / F.w);
    const w = Math.max(1, Math.round(F.w * kr));
    const h = Math.max(1, Math.round(F.h * kr));
    const start = (s0 && s0.at) || task.startedAt || task.createdAt;
    const end = task.finishedAt || now();
    // the middle states: the moments a storyboard in the frame changed
    const times = new Set();
    if (cap.states) for (const list of cap.states.values()) for (const st of list) if (hits(st.box, F) && st.at > start && st.at < end - 300) times.add(st.at);
    let mids = [...times].sort((x, y) => x - y);
    if (mids.length > REPLAY_MID_MAX) mids = Array.from({ length: REPLAY_MID_MAX }, (_, i) => mids[Math.round(((i + 1) * (mids.length - 1)) / REPLAY_MID_MAX)]);
    mids = [...new Set(mids)];
    const ids = new Set([...(s0 ? s0.sbs.keys() : []), ...s1.sbs.keys(), ...(cap.states ? cap.states.keys() : [])]);
    const sceneAt = (t) => {
      const out = [];
      for (const id of ids) {
        const list = (cap.states && cap.states.get(id)) || [];
        let st = s0 ? s0.sbs.get(id) || null : null;
        for (const x of list) if (x.at <= t) st = x;
        if (st && !st.blank) out.push(st);
      }
      return out;
    };
    const blank = () => {
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const g = cv.getContext("2d");
      g.fillStyle = canvasBg();
      g.fillRect(0, 0, w, h);
      return cv;
    };
    const shots = [{ cv: before ? scaled(before.cv, w, h) : blank(), at: start }];
    // a middle state that already looks like the end (or like the one
    // before it) is not a frame
    const sceneSig = (list) =>
      list
        .filter((st) => hits(st.box, F))
        .map((st) => `${st.id}|${Math.round(st.box.x)},${Math.round(st.box.y)},${Math.round(st.box.w)},${Math.round(st.box.h)}|${st.body ? st.body.length + ":" + st.body.slice(-200) : st.url}`)
        .sort()
        .join("\n");
    const endSig = sceneSig([...s1.sbs.values()].filter((st) => !st.blank));
    let prevSig = s0 ? sceneSig([...s0.sbs.values()].filter((st) => !st.blank)) : "";
    for (const t of mids) {
      const sc = sceneAt(t);
      const sg = sceneSig(sc);
      if (sg === endSig || sg === prevSig) continue;
      prevSig = sg;
      const c = await compose(F, kr, sc, [], [cap.wide]);
      shots.push({ cv: scaled(c.cv, w, h), at: t });
      await sleep(0);
    }
    shots.push({ cv: scaled(after.cv, w, h), at: end });
    const n = shots.length;
    const durMs = Math.min(REPLAY_MAX_MS, REPLAY_HOLD_MS + 400 + REPLAY_STEP_MS * (n - 1));
    const last = durMs - REPLAY_HOLD_MS;
    const tOf = (i) => Math.round((i * last) / (n - 1));
    // real time -> replay time, through the frames' moments
    const knots = shots.map((s, i) => [s.at, tOf(i)]);
    const mapT = (at) => {
      if (at <= knots[0][0]) return 0;
      for (let i = 1; i < knots.length; i++) {
        const [a0, r0] = knots[i - 1];
        const [a1, r1] = knots[i];
        if (at <= a1) return Math.round(r0 + ((at - a0) / Math.max(1, a1 - a0)) * (r1 - r0));
      }
      return last;
    };
    const fx = (x) => clampN((x - F.x) / F.w, 0.03, 0.97);
    const fy = (y) => clampN((y - F.y) / F.h, 0.03, 0.97);
    let cursor = (cap.track || []).filter((p) => !p.fallback && p.at >= start && p.at <= end + 1000 && hits({ x: p.x, y: p.y, w: 1, h: 1 }, F)).map((p) => ({ t: Math.max(0, mapT(p.at) - 350), fx: fx(p.x), fy: fy(p.y), kind: p.kind, label: p.label }));
    if (!cursor.length) {
      // no action in the frame: from the pin to each change, landing just
      // before the frame that shows it
      const a = task.anchor;
      const p0 = a ? { fx: fx(a.x), fy: fy(a.y) } : { fx: 0.5, fy: 0.5 };
      cursor = [{ t: 0, ...p0, kind: "move", label: "" }];
      const list = changes.slice(0, 4);
      list.forEach((c, i) => {
        const b = c.area || c.box;
        const verb = c.kind === "new" ? "create" : c.kind === "edited" ? "edit" : c.kind === "moved" ? "move" : "edit";
        cursor.push({ t: Math.max(200, Math.round(((i + 1) * last) / (list.length + 1)) - 300), fx: fx(b.x + b.w / 2), fy: fy(b.y + b.h / 2), kind: verb, label: clip(`${c.kind === "new" ? "Adding" : c.kind === "edited" ? "Editing" : c.kind === "moved" ? "Moving" : "Removing"} ${c.label || ""}`.trim(), 40) });
      });
    } else {
      // an action on a storyboard whose edit was found lands on that edit
      for (const p of cursor) {
        const c = changes.find((x) => x.area && hits(x.box, { x: F.x + p.fx * F.w, y: F.y + p.fy * F.h, w: 1, h: 1 }));
        if (c) (p.fx = fx(c.area.x + c.area.w / 2)), (p.fy = fy(c.area.y + c.area.h / 2));
      }
      // it flies in from the pin (from the frame's edge towards it when
      // the pin is outside), and stays put on repeated points
      const a = task.anchor;
      if (a && Math.hypot(fx(a.x) - cursor[0].fx, fy(a.y) - cursor[0].fy) > 0.01) {
        for (const p of cursor) p.t = Math.max(p.t, 500); // the flight shows
        cursor.unshift({ t: 0, fx: fx(a.x), fy: fy(a.y), kind: "move", label: "" });
      }
      cursor = cursor.filter((p, i) => !i || Math.hypot(p.fx - cursor[i - 1].fx, p.fy - cursor[i - 1].fy) > 0.01 || p.label !== cursor[i - 1].label);
    }
    cursor = cursor.slice(0, 12).map((p) => ({ ...p, fx: Math.round(p.fx * 1000) / 1000, fy: Math.round(p.fy * 1000) / 1000 }));
    const frames = [];
    for (let i = 0; i < n; i++) frames.push({ dataUrl: await jpegOf(shots[i].cv, 0.74), t: tOf(i) });
    task.replay = { w, h, durMs, frames, cursor };
    // the GIF (the thread reply's attachment): these frames
    cap.frames = frames.map((f, i) => ({ dataUrl: f.dataUrl, hash: `r${i}`, at: shots[i].at }));
    cap.gw = w;
    cap.gh = h;
  }
  // No renderer and the frame off screen for FALLBACK_MS: the last frame
  // the run captured, said so.
  function lastResort(task, provisional) {
    const f = task.cap && task.cap.last;
    if (!f || !f.dataUrl || task.after) return false;
    task.after = { dataUrl: f.dataUrl, w: task.cap.gw || 0, h: task.cap.gh || 0 };
    task.shot = { v: 2, frame: null, boxes: [], pin: null, empty: false, src: "window", k: 0, provisional: !!provisional, note: provisional ? "The last frame while it ran: the canvas isn't open" : "The last frame while it ran: the area was off screen" };
    task.updates.push({ at: now(), kind: "screenshot", text: "after", dataUrl: f.dataUrl });
    capOk(task, "after");
    return true;
  }

  // ------------------------------------------------------------------- GIF
  // GIF89a written here: one global 256-colour palette (median cut over a
  // 15-bit histogram of every frame; no dithering, flat UI colours stay
  // flat), NETSCAPE2.0 loop, each frame only the rectangle that changed since
  // the previous one (disposal 1, leave in place), identical frames merged
  // into the previous one's delay, LZW with omggif's code-size timing.
  function paletteOf(frames) {
    const cnt = new Uint32Array(32768);
    const sr = new Float64Array(32768);
    const sg = new Float64Array(32768);
    const sb = new Float64Array(32768);
    for (const f of frames) {
      const d = f.data;
      for (let i = 0; i < d.length; i += 4) {
        const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
        cnt[k]++;
        sr[k] += d[i];
        sg[k] += d[i + 1];
        sb[k] += d[i + 2];
      }
    }
    const bins = [];
    for (let k = 0; k < 32768; k++) if (cnt[k]) bins.push(k);
    const ch = (k, c) => (k >> (10 - c * 5)) & 31; // c: 0 r, 1 g, 2 b
    const box = (b) => {
      const lo = [31, 31, 31];
      const hi = [0, 0, 0];
      let pop = 0;
      for (const k of b) {
        pop += cnt[k];
        for (let c = 0; c < 3; c++) {
          const v = ch(k, c);
          if (v < lo[c]) lo[c] = v;
          if (v > hi[c]) hi[c] = v;
        }
      }
      let c = 0;
      for (let j = 1; j < 3; j++) if (hi[j] - lo[j] > hi[c] - lo[c]) c = j;
      return { b, pop, c, range: hi[c] - lo[c] };
    };
    const boxes = [box(bins)];
    while (boxes.length < 256) {
      let bi = -1;
      let best = 0;
      boxes.forEach((x, i) => {
        const s = x.b.length > 1 ? x.range * Math.sqrt(x.pop) : 0;
        if (s > best) (best = s), (bi = i);
      });
      if (bi < 0) break;
      const x = boxes[bi];
      x.b.sort((p, q) => ch(p, x.c) - ch(q, x.c));
      let acc = 0;
      let cut = x.b.length - 1;
      for (let i = 0; i < x.b.length - 1; i++) {
        acc += cnt[x.b[i]];
        if (acc >= x.pop / 2) {
          cut = i + 1;
          break;
        }
      }
      boxes.splice(bi, 1, box(x.b.slice(0, cut)), box(x.b.slice(cut)));
    }
    const pal = new Uint8Array(768);
    const map = new Uint8Array(32768);
    boxes.forEach((x, i) => {
      let r = 0;
      let g = 0;
      let bl = 0;
      for (const k of x.b) {
        r += sr[k];
        g += sg[k];
        bl += sb[k];
        map[k] = i;
      }
      pal[i * 3] = Math.round(r / x.pop);
      pal[i * 3 + 1] = Math.round(g / x.pop);
      pal[i * 3 + 2] = Math.round(bl / x.pop);
    });
    return { pal, map, colors: boxes.length };
  }
  function byteOut() {
    let buf = new Uint8Array(1 << 16);
    let n = 0;
    const need = (k) => {
      if (n + k <= buf.length) return;
      let m = buf.length * 2;
      while (m < n + k) m *= 2;
      const nb = new Uint8Array(m);
      nb.set(buf.subarray(0, n));
      buf = nb;
    };
    return {
      byte(b) {
        need(1);
        buf[n++] = b;
      },
      bytes(a) {
        need(a.length);
        buf.set(a, n);
        n += a.length;
      },
      u16(v) {
        need(2);
        buf[n++] = v & 255;
        buf[n++] = (v >> 8) & 255;
      },
      str(s) {
        need(s.length);
        for (let i = 0; i < s.length; i++) buf[n++] = s.charCodeAt(i);
      },
      done: () => buf.slice(0, n),
    };
  }
  // LZW code table: (prefix code << 8 | index) -> code, valid while its stamp
  // equals the current generation (a clear code starts a new one).
  const LZ = { codes: null, stamp: null, gen: 0 };
  function lzw(idx, out) {
    const MIN = 8;
    if (!LZ.codes) (LZ.codes = new Int16Array(1 << 20)), (LZ.stamp = new Uint32Array(1 << 20));
    const clear = 1 << MIN;
    const eoi = clear + 1;
    let size = MIN + 1;
    let next = eoi + 1;
    let gen = ++LZ.gen;
    let cur = 0;
    let bits = 0;
    const block = new Uint8Array(255);
    let bn = 0;
    const flush = () => {
      if (!bn) return;
      out.byte(bn);
      out.bytes(block.subarray(0, bn));
      bn = 0;
    };
    const emit = (code) => {
      cur |= code << bits;
      bits += size;
      while (bits >= 8) {
        block[bn++] = cur & 255;
        cur >>>= 8;
        bits -= 8;
        if (bn === 255) flush();
      }
    };
    out.byte(MIN);
    emit(clear);
    let prefix = idx[0];
    for (let i = 1; i < idx.length; i++) {
      const k = idx[i];
      const key = (prefix << 8) | k;
      if (LZ.stamp[key] === gen) {
        prefix = LZ.codes[key];
        continue;
      }
      emit(prefix);
      if (next === 4096) {
        emit(clear);
        next = eoi + 1;
        size = MIN + 1;
        gen = ++LZ.gen;
      } else {
        if (next >= 1 << size) size++;
        LZ.stamp[key] = gen;
        LZ.codes[key] = next++;
      }
      prefix = k;
    }
    emit(prefix);
    emit(eoi);
    if (bits > 0) {
      block[bn++] = cur & 255;
      if (bn === 255) flush();
    }
    flush();
    out.byte(0);
  }
  // frames: ImageData[] of one size -> { data: Uint8Array, frames, colors }
  async function encodeGif(frames, opts) {
    const w = frames[0].width;
    const h = frames[0].height;
    const delay = (opts && opts.delay) || GIF_DELAY;
    const hold = (opts && opts.hold) || delay;
    const { pal, map, colors } = paletteOf(frames);
    await sleep(0);
    const list = [];
    let prev = null;
    for (const f of frames) {
      const d = f.data;
      const n = w * h;
      const idx = new Uint8Array(n);
      for (let p = 0, i = 0; p < n; p++, i += 4) idx[p] = map[((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)];
      if (!prev) {
        list.push((prev = { idx, x: 0, y: 0, w, h, delay }));
        continue;
      }
      let x0 = w;
      let y0 = h;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          if (idx[row + x] === prev.idx[row + x]) continue;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          y1 = y;
        }
      }
      if (x1 < 0) {
        prev.delay += delay; // identical: the previous frame stays longer
        continue;
      }
      list.push((prev = { idx, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, delay }));
    }
    list[list.length - 1].delay = Math.max(list[list.length - 1].delay, hold);
    const out = byteOut();
    out.str("GIF89a");
    out.u16(w);
    out.u16(h);
    out.bytes([0xf7, 0, 0]); // global colour table, 8 bits per channel, 256 entries
    out.bytes(pal);
    out.bytes([0x21, 0xff, 0x0b]);
    out.str("NETSCAPE2.0");
    out.bytes([3, 1, 0, 0, 0]); // loop forever
    for (const fr of list) {
      out.bytes([0x21, 0xf9, 4, 0x04, fr.delay & 255, (fr.delay >> 8) & 255, 0, 0]); // disposal 1
      out.byte(0x2c);
      out.u16(fr.x);
      out.u16(fr.y);
      out.u16(fr.w);
      out.u16(fr.h);
      out.byte(0);
      let sub = fr.idx;
      if (fr.w !== w || fr.h !== h) {
        sub = new Uint8Array(fr.w * fr.h);
        for (let y = 0; y < fr.h; y++) sub.set(fr.idx.subarray((fr.y + y) * w + fr.x, (fr.y + y) * w + fr.x + fr.w), y * fr.w);
      }
      lzw(sub, out);
      await sleep(0);
    }
    out.byte(0x3b);
    return { data: out.done(), frames: list.length, colors };
  }
  function b64(u8) {
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }

  // --------------------------------------------------------------- sending
  // Everything happens in the background: the chat never opens, the visible
  // route and the active tab stay where the user is (the canvas).
  let lock = Promise.resolve();
  function enqueue(fn) {
    const run = lock.then(fn);
    lock = run.catch((e) => note("queue", e));
    return run;
  }

  const chatViewOf = (tabId) =>
    document.querySelector(`.chat-view[data-testid="chat-view-${CSS.escape(tabId)}"]`) || document.querySelector(`[data-testid="chat-view-${CSS.escape(tabId)}"]`);
  const inProgress = (st, wsId, tabId) => {
    try {
      return !!(st && typeof st.isChatInProgress === "function" && st.isChatInProgress(wsId, tabId) === true);
    } catch (_) {
      return false;
    }
  };

  // One pipeline step: its own macrotask (never inside a React render or
  // commit), one store operation, errors caught and tagged with the step.
  async function step(name, fn) {
    await sleep(0);
    try {
      return await fn();
    } catch (e) {
      note(name, e);
      const err = new Error(String((e && e.message) || e));
      err.step = name;
      throw err;
    }
  }

  const keyOf = (wsId, tabId) => ({ workspaceId: wsId, chatTabId: tabId });
  function snapOf(key) {
    try {
      return F.reg ? F.reg.getSnapshot(key) : null;
    } catch (_) {
      return null;
    }
  }
  function actionsOf(key) {
    try {
      return F.reg ? F.reg.getActions(key) : null;
    } catch (_) {
      return null;
    }
  }

  // The new chat's first turn: started (orchestrator phase, the store's
  // in-progress flag, or a session on the tab), or a start error.
  function turnState(key) {
    const s = snapOf(key);
    if (s && s.phase && s.phase !== "idle" && s.phase !== "disposed") return { started: true, via: `phase:${s.phase}` };
    const st = W();
    if (st && inProgress(st, key.workspaceId, key.chatTabId)) return { started: true, via: "in-progress" };
    const tab = st && tabOf(st, key.workspaceId, key.chatTabId);
    if (tab && tab.sessionId) return { started: true, via: "session" };
    if (s && s.lastError) return { started: false, error: String(s.lastError.message || s.lastError.code || "error") };
    return null;
  }

  // The app's C5n.submitTurn: idle / waiting_for_input -> the host's
  // submit(); a turn running -> the session controller's enqueueMessage()
  // (queued behind it, as the composer does). Waits for the host first.
  async function submitTurn(key, text, rec) {
    if (!F.reg) await fullScan();
    if (!F.reg) return { ok: false, why: "no-engine" };
    const actions = await waitFor(() => actionsOf(key), HOST_WAIT_MS);
    if (!actions) return { ok: false, why: "no-host" };
    return step("submit", async () => {
      const s = snapOf(key);
      const phase = (s && s.phase) || "idle";
      if (phase !== "idle" && phase !== "waiting_for_input") {
        const host = F.reg.getHost(key);
        const sc = host && typeof host.getSessionController === "function" ? host.getSessionController() : null;
        if (!sc || typeof sc.enqueueMessage !== "function") return { ok: false, why: "busy" };
        rec.submit = "queue";
        const r = await sc.enqueueMessage(text);
        return r && r.accepted ? { ok: true, how: "queued" } : { ok: false, why: "busy", detail: r && r.reason };
      }
      rec.submit = "submit";
      const r = await actions.submit(text);
      return r && r.accepted !== false ? { ok: true, how: "started" } : { ok: false, why: "rejected", detail: r && r.skippedReason };
    });
  }

  // createChatTab* make the new chat the active tab: put back the tab the
  // user was on (same tick, so React never renders the switch).
  // setActiveCenterTab(canvas tab) also restores its owner chat.
  function restoreView(prev) {
    const s = W();
    if (!s) return "no-store";
    const has = (id) => (s.centerTabs || []).some((t) => t && t.id === id);
    let out = "same";
    if (prev.center && s.activeCenterTabId !== prev.center && has(prev.center) && typeof s.setActiveCenterTab === "function") {
      s.setActiveCenterTab(prev.center);
      out = "center";
    } else if (!prev.center && prev.chat && s.activeChatTabId !== prev.chat && has(prev.chat) && typeof s.selectChatTab === "function") {
      s.selectChatTab(prev.chat);
      out = "chat";
    }
    const s2 = W();
    if (prev.route && s2 && s2.activeNavRoute !== prev.route && typeof s2.setActiveNavRoute === "function") {
      s2.setActiveNavRoute(prev.route);
      out += "+route";
    }
    return out;
  }

  const WHY = {
    off: "Turned off",
    "no-store": "Couldn't reach the app's chat store",
    "no-workspace": "No workspace is selected",
    "no-tab": "Couldn't create the chat",
    "no-engine": "Couldn't reach the app's chat engine",
    "no-host": "The new chat didn't get ready to run",
    busy: "The chat is busy and couldn't queue the message",
    rejected: "The chat didn't accept the prompt",
    "not-started": "The chat didn't start",
    "start-error": "The chat couldn't start",
    step: "Something went wrong while starting the chat",
    timeout: `Claude didn't pick this up within ${Math.round(QUEUED_MAX_MS / 1000)} s`,
    errored: "The chat stopped with an error",
    aborted: "The chat was stopped",
    stopped: "Stopped by you",
    closed: "The chat was closed",
    interrupted: "The app reloaded before the chat started",
    unposted: "The comment wasn't posted",
    error: "Something went wrong",
  };
  function fail(task, why, detail) {
    if (isStopped(task) && why !== "stopped") return; // the user's stop stays
    task.status = "failed";
    task.error = (WHY[why] || why) + (detail ? ` (${clip(detail, 160)})` : "");
    task.why = why;
    task.finishedAt = now();
    changed();
  }
  // The chat exists but its first turn did not start: the prompt goes in its
  // draft, so "Open chat" shows it ready to send.
  async function failStart(task, rec, why, detail, prompt) {
    if (isStopped(task)) return void (rec.reason = "stopped"); // no draft: stopped on purpose
    rec.reason = why;
    let drafted = false;
    try {
      drafted = await step("draft", () => {
        const ds = D();
        if (!ds || typeof ds.setChatInputDraft !== "function" || !task.workspaceId || !task.chatId) return false;
        ds.setChatInputDraft(task.workspaceId, task.chatId, prompt);
        return true;
      });
    } catch (_) {}
    fail(task, why, detail);
    if (drafted) {
      task.error += ". The prompt is in the chat: open it and press Send";
      changed();
    }
  }

  // The new chat's model / effort as asked: -> "config" (the tab already has
  // them) or "set:model+effort" (the store's setChatTabModel / Effort).
  function setModel(wsId, tabId, want) {
    const s = W();
    const tab = s && tabOf(s, wsId, tabId);
    if (!tab) return "no-tab";
    const out = [];
    if (want.model && tab.model !== want.model && typeof s.setChatTabModel === "function") {
      s.setChatTabModel(wsId, tabId, want.model);
      out.push("model");
    }
    if (want.effort && tab.effort !== want.effort && typeof s.setChatTabEffort === "function") {
      s.setChatTabEffort(wsId, tabId, want.effort);
      out.push("effort");
    }
    return out.length ? `set:${out.join("+")}` : "config";
  }

  async function dispatch(task) {
    if (task.status !== "queued") return;
    if (!enabled()) return fail(task, "off");
    if (!F.ws) await fullScan(); // the engine (F.reg) is needed only after the chat exists
    const st = W();
    if (!st) return fail(task, "no-store");
    const wsId = st.selectedWorkspaceId;
    if (!wsId) return fail(task, "no-workspace");
    if (typeof st.createChatTabWithMessage !== "function" && typeof st.createChatTab !== "function") return fail(task, "no-store");
    // createTask's model / effort, resolved again now that the store is found
    if (task.want && task.want.asked)
      try {
        const w = wantModel(task.want.asked);
        if (w.modelId) task.want.modelId = w.modelId;
        if (w.effortId) task.want.effortId = w.effortId;
      } catch (e) {
        note("want-model", e);
      }
    const prompt = buildPrompt(task);
    lastPrompt = prompt;
    const rec = { id: task.id, how: null, route: null, center: null, restored: null, submit: null, started: null, sent: false, reason: null, step: null };
    state.dispatch = rec;
    // 1. Create the chat and put the user's tab back, in one tick. With the
    //    app's createChatTabWithMessage the first turn is submitted by the app
    //    itself (microtask, through the orchestrator registry). Only this step
    //    is serialized (one store write at a time): waiting for a turn to
    //    start never holds the next comment back.
    let created = null;
    try {
      created = await enqueue(() => step("create", () => {
        if (task.status !== "queued") return null; // timed out meanwhile: no chat
        if (dry) return { id: `dry:${task.id}`, how: "dry" }; // where the chat would be created
        const s = W();
        if (!s || s.selectedWorkspaceId !== wsId) throw new Error("the selected workspace changed");
        const prev = { route: s.activeNavRoute || null, center: s.activeCenterTabId || null, chat: s.activeChatTabId || null };
        rec.route = prev.route;
        rec.center = prev.center;
        const opts = { name: task.title };
        // createTask's model / effort: the new tab's config (the app's
        // createChatTab* take it), checked and set again in this same tick,
        // before the app submits the first turn (a microtask)
        if (task.want && task.want.modelId) opts.model = task.want.modelId;
        if (task.want && task.want.effortId) opts.effort = task.want.effortId;
        let id = null;
        let how = "mod";
        if (typeof s.createChatTabWithMessage === "function") {
          id = s.createChatTabWithMessage(prompt, opts);
          how = "app";
        } else id = s.createChatTab(opts);
        if (id && (opts.model || opts.effort))
          try {
            rec.model = setModel(wsId, String(id), opts);
          } catch (e) {
            note("set-model", e);
            rec.model = `error: ${(e && e.message) || e}`;
          }
        try {
          rec.restored = restoreView(prev);
        } catch (e) {
          note("restore", e);
          rec.restored = `error: ${(e && e.message) || e}`;
        }
        guardSnap(); // the tick fallback starts from the user's view
        return { id: id ? String(id) : null, how };
      }));
    } catch (e) {
      rec.step = e.step;
      rec.reason = "step";
      return fail(task, "step", `${e.step}: ${e.message}`);
    }
    if (!created) return;
    if (!created.id) return fail(task, "no-tab");
    rec.how = created.how;
    task.timing.launched = now();
    if (created.how === "dry") {
      // dry run: no chat; it "starts" at once, as the app's own submit does
      // (_sim() feeds its messages and its status)
      task.dry = true;
      task.chatId = created.id;
      task.status = "running";
      task.startedAt = task.timing.started = now();
      rec.started = "dry";
      changed();
      return;
    }
    task.workspaceId = wsId;
    task.chatId = created.id;
    try {
      const s = W() || st;
      readModel(task, tabOf(s, wsId, created.id), s);
    } catch (e) {
      note("model", e);
    }
    changed();
    // 2. The first turn starts: the app's own submit, else the mod's.
    const key = keyOf(wsId, created.id);
    try {
      let ts = created.how === "app" ? await waitFor(() => turnState(key), APP_SUBMIT_MS) : null;
      if (!ts && isStopped(task)) return void (rec.reason = "stopped"); // nothing sent
      if (!ts) {
        const r = await submitTurn(key, prompt, rec);
        if (!r.ok) return failStart(task, rec, r.why, r.detail, prompt);
        ts = await waitFor(() => turnState(key), START_WAIT_MS);
      }
      if (!ts) return failStart(task, rec, "not-started", null, prompt);
      if (!ts.started) return failStart(task, rec, "start-error", ts.error, prompt);
      rec.started = ts.via;
      rec.sent = true;
    } catch (e) {
      rec.step = e.step || "start";
      return failStart(task, rec, "step", `${rec.step}: ${e.message}`, prompt);
    }
    // A late start after the queued timeout still is a running chat.
    if (task.status === "queued" || (task.status === "failed" && task.why === "timeout")) {
      task.status = "running";
      task.error = null;
      task.why = null;
      task.finishedAt = null;
      task.startedAt = task.timing.started = now();
      changed();
    }
  }

  async function reply(id, text) {
    const task = tasks.find((t) => t.id === id);
    const msg = String(text || "").trim();
    if (!task || !task.chatId || !task.workspaceId || !msg) return false;
    wake();
    return enqueue(async () => {
      try {
        return await replyNow(task, id, msg);
      } catch (e) {
        note("reply", e);
        if (state.dispatch && state.dispatch.id === id) state.dispatch.reason = `${e.step || "reply"}: ${e.message}`;
        return false;
      }
    });
  }
  async function replyNow(task, id, msg) {
    const rec = { id, reply: true, submit: null, sent: false, reason: null };
    state.dispatch = rec;
    const exists = await step("reply-check", () => {
      const st = W();
      const tab = st && tabOf(st, task.workspaceId, task.chatId);
      if (tab && tab.isArchived === true && typeof st.unarchiveChatTab === "function") {
        // archived when it finished: back in the background, not selected
        st.unarchiveChatTab(task.workspaceId, task.chatId, { select: false });
        task.chatArchived = false;
        task.archiveTries = 0;
        rec.unarchived = true;
      }
      const t2 = tabOf(W() || st, task.workspaceId, task.chatId);
      return !!t2 && t2.isArchived !== true;
    });
    if (!exists) return (rec.reason = "no-chat"), false;
    const r = await submitTurn(keyOf(task.workspaceId, task.chatId), msg, rec);
    if (!r.ok) return (rec.reason = r.why + (r.detail ? `: ${r.detail}` : "")), false;
    rec.sent = r.how;
    task.updates.push({ at: now(), kind: "text", text: clip(`You: ${msg}`, SUMMARY_MAX), role: "user" });
    task.resumedAt = now();
    if (task.status !== "running") {
      // back to work: the next "done" captures a new "after"
      task.status = "running";
      task.finishedAt = null;
      task.error = null;
      task.why = null;
      task.seenRunning = false;
      task.idleTicks = 0;
      task.lastCs = null;
      task.afterDueAt = null;
      task.after = null;
      task.shot = null;
      task.replay = null;
      task.replied = false; // its result goes to the thread too
      task.stoppedAt = null;
      // a new run, a new GIF: it starts from the last frame of the previous one
      const cap = task.cap || (task.cap = newCap(task.info, true));
      cap.live = true;
      // ...and a new change, measured from the canvas as it is now
      cap.scene0 = null;
      cap.scene0Pending = false;
      cap.track = [];
      cap.wide = null;
      cap.noRender = false;
      sceneStart(cap);
      cap.gifTried = false;
      cap.gifQueued = false;
      cap.gifDone = false;
      cap.frames = cap.last ? [cap.last] : [];
      cap.lastHash = cap.last ? cap.last.hash : null;
      cap.every = FRAME_MS;
    }
    changed();
    return true;
  }

  // ------------------------------------------------------------------- stop
  // The chat's Stop button (see the header): the orchestrator registry's
  // getActions(key).abort(), what C5n().interruptTurn() runs for the
  // composer's Stop. The task is marked first, in the caller's tick: a
  // dispatch still waiting creates no chat and sends nothing, and the abort
  // never waits behind the send queue.
  const LIVE = new Set(["queued", "running", "needs-input"]);
  function isStopped(t) {
    return t.status === "failed" && t.why === "stopped";
  }
  function logStop(rec) {
    state.stop = rec;
    state.stops = [...(state.stops || []).slice(-19), rec];
  }
  function controllerOf(key) {
    try {
      const host = F.reg ? F.reg.getHost(key) : null;
      return host && typeof host.getSessionController === "function" ? host.getSessionController() : null;
    } catch (_) {
      return null;
    }
  }
  // A turn to stop: the orchestrator submitting / streaming / waiting for
  // input (not "aborting": already on its way), or the store's in-progress
  // flag (the sidebar's spinner).
  function chatBusy(key) {
    const s = snapOf(key);
    if (s && s.phase && s.phase !== "idle" && s.phase !== "disposed" && s.phase !== "aborting") return true;
    return inProgress(W(), key.workspaceId, key.chatTabId);
  }
  // -> "aborted" | "idle" (no turn running) | "no-host" | "timeout" |
  // "rejected[: reason]"
  async function abortTurn(task, rec) {
    if (!F.reg) await fullScan();
    const key = keyOf(task.workspaceId, task.chatId);
    const busy = chatBusy(key);
    const actions = busy ? actionsOf(key) : null;
    if (busy && (!actions || typeof actions.abort !== "function")) return "no-host";
    // follow-ups queued behind the turn: the app sends its queue only after a
    // turn that completed, so they would run after the next one
    const sc = controllerOf(key);
    try {
      const q = sc && typeof sc.getQueuedMessages === "function" ? sc.getQueuedMessages() : null;
      if (Array.isArray(q) && typeof sc.cancelQueuedMessage === "function")
        for (const m of q)
          if (m && m.localId != null) {
            sc.cancelQueuedMessage(m.localId);
            rec.dropped++;
          }
    } catch (e) {
      note("stop-queue", e);
    }
    if (!busy) return "idle";
    task.abortAt = now();
    const r = await Promise.race([actions.abort(), sleep(STOP_WAIT_MS).then(() => ({ timeout: true }))]);
    if (r && r.timeout) return "timeout";
    if (r && r.accepted === false) return `rejected${r.skippedReason ? `: ${r.skippedReason}` : ""}`;
    return "aborted";
  }
  async function stop(id) {
    const task = tasks.find((t) => t.id === id);
    if (!task || !LIVE.has(task.status)) return false;
    const was = { status: task.status, error: task.error, why: task.why, finishedAt: task.finishedAt };
    const rec = { at: now(), id, from: was.status, chat: task.chatId || null, abort: null, dropped: 0 };
    logStop(rec);
    task.stoppedAt = rec.at;
    fail(task, "stopped"); // this tick: dispatch() sees it before its next step
    wake();
    if (!task.chatId || !task.workspaceId) return (rec.abort = "no-chat"), true; // out of the send queue
    try {
      rec.abort = await abortTurn(task, rec);
    } catch (e) {
      note("stop", e);
      rec.abort = `error: ${(e && e.message) || e}`;
    }
    if (rec.abort === "aborted" || rec.abort === "idle") return true;
    // the app could not stop the turn: the task is left as it was
    if (isStopped(task)) {
      Object.assign(task, was);
      task.stoppedAt = null;
      changed();
    }
    return false;
  }
  // Every live task marked in this tick (each stop() marks before its first
  // await), then the aborts in parallel. -> how many were stopped
  async function stopAll() {
    const ids = tasks.filter((t) => LIVE.has(t.status)).map((t) => t.id);
    const rec = { at: now(), ids, stopped: 0 };
    state.stopAll = rec;
    const res = await Promise.all(ids.map((id) => stop(id).catch(() => false)));
    rec.stopped = res.filter(Boolean).length;
    return rec.stopped;
  }
  // The tick, for STOP_WATCH_MS after a stop: a first turn that started late
  // (the app's own submit waits for the chat's host) is stopped too.
  function watchStopped(task, t) {
    if (!task.chatId || !task.workspaceId || t - (task.stoppedAt || 0) > STOP_WATCH_MS || t - (task.abortAt || 0) < 2000) return;
    if (!chatBusy(keyOf(task.workspaceId, task.chatId))) return;
    task.abortAt = t;
    const rec = { at: t, id: task.id, from: "late-start", chat: task.chatId, abort: null, dropped: 0 };
    logStop(rec);
    abortTurn(task, rec)
      .then((r) => (rec.abort = r))
      .catch((e) => note("stop", e));
  }

  // ------------------------------------------------------- background chats
  // Task chats (and the tabs they own) of workspace `ws` that must never
  // become the active tab on their own: not revealed, not archived.
  function hiddenTabs(st, ws) {
    const out = new Set();
    for (const t of tasks) if (t.chatId && !t.revealed && (!t.workspaceId || t.workspaceId === ws)) out.add(String(t.chatId));
    if (!out.size) return out;
    const tabs = (st.selectedWorkspaceId === ws ? st.centerTabs : (((st.workspaces || []).find((w) => w && w.id === ws) || {}).centerTabs)) || [];
    for (const t of tabs) {
      if (!t) continue;
      if (t.type === "chat" && t.isArchived === true) out.delete(String(t.id));
      else if (t.ownerChatTabId != null && out.has(String(t.ownerChatTabId))) out.add(String(t.id));
    }
    return out;
  }
  let guarding = false;
  let ownSelectUntil = 0; // our own selection of a task chat (openChat)
  let guardUnsub = null;
  let guardPrev = null; // the last state seen (tick fallback)
  function guardOn() {
    if (guardUnsub || !F.wsSub) return;
    try {
      const u = F.wsSub((st, prev) => onStore(st, prev));
      if (typeof u === "function") guardUnsub = u;
      state.guardVia = "subscribe";
    } catch (e) {
      note("subscribe", e);
    }
  }
  // The app moved the active center tab: to a background task chat, in the
  // same change that removed the active tab? Its fallback: undo it now.
  function onStore(st, prev) {
    if (guarding || !st || !prev || st === prev) return;
    const a = st.activeCenterTabId;
    const p = prev.activeCenterTabId;
    if (!a || a === p) return;
    const ws = st.selectedWorkspaceId;
    if (!ws || ws !== prev.selectedWorkspaceId) return; // a workspace switch: that workspace's own tab
    const hidden = hiddenTabs(st, ws);
    if (!hidden.has(String(a))) return;
    if (now() < ownSelectUntil) return;
    const aTab = (st.centerTabs || []).find((x) => x && String(x.id) === String(a)) || {};
    const task = tasks.find((t) => t.chatId && (String(t.chatId) === String(a) || String(t.chatId) === String(aTab.ownerChatTabId)));
    const live = (t) => t && !(t.type === "chat" && t.isArchived === true);
    const prevStays = !!p && (st.centerTabs || []).some((t) => live(t) && t.id === p);
    if (prevStays) {
      // opened on purpose (the sidebar, a link): a tab like any other now
      if (task && !task.revealed) {
        task.revealed = true;
        state.revealed = { at: now(), id: task.id, tab: a };
        changed();
      }
      return;
    }
    guarding = true;
    try {
      const to = replaceActive(st, prev, hidden);
      state.guard = { at: now(), from: a, closed: p, to, task: task ? task.id : null };
    } catch (e) {
      note("guard", e);
    } finally {
      guarding = false;
    }
  }
  // The closed tab's nearest live neighbour that is not a task chat (right
  // first), else a new chat, as the app does when its last chat closes.
  function replaceActive(st, prev, hidden) {
    // pane-dock's background tabs too (other mods' hidden chats)
    const PD = window.__RE_TEMPO_PANE_DOCK__;
    const pdHidden = (id) => {
      try {
        return !!(PD && typeof PD.isHiddenTab === "function" && PD.isHiddenTab(String(id)));
      } catch (_) {
        return false;
      }
    };
    const ok = (t) => t && !hidden.has(String(t.id)) && !(t.type === "chat" && t.isArchived === true) && !pdHidden(t.id);
    const nowTabs = (st.centerTabs || []).filter(ok);
    const order = (prev.centerTabs || []).map((t) => t && t.id);
    const at = order.indexOf(prev.activeCenterTabId);
    let pick = null;
    for (let d = 1; !pick && at >= 0 && d < order.length + 1; d++)
      for (const i of [at + d, at - d]) {
        const t = i >= 0 && i < order.length ? nowTabs.find((x) => x.id === order[i]) : null;
        if (t) {
          pick = t;
          break;
        }
      }
    if (!pick) pick = nowTabs[nowTabs.length - 1] || null;
    if (pick && typeof st.setActiveCenterTab === "function") {
      st.setActiveCenterTab(pick.id);
      return pick.id;
    }
    if (typeof st.createChatTab === "function") return `new:${st.createChatTab({ name: "New Chat" })}`;
    return null;
  }
  // No subscribe: the same check on the tick (the change shows for <= 0.5 s).
  function guardTick() {
    if (guardUnsub) return;
    const st = W();
    if (!st) return;
    if (guardPrev) onStore(st, guardPrev);
    guardSnap();
  }
  function guardSnap() {
    if (guardUnsub) return;
    const s2 = W();
    if (s2) guardPrev = { activeCenterTabId: s2.activeCenterTabId, selectedWorkspaceId: s2.selectedWorkspaceId, centerTabs: s2.centerTabs };
  }

  // On screen: the active center tab or a split pane's, in the selected workspace.
  function onScreen(st, task) {
    if (!st || st.selectedWorkspaceId !== task.workspaceId) return false;
    const id = String(task.chatId);
    return [st.activeCenterTabId, st.leftPanelActiveTabId, st.rightPanelActiveTabId, st.viewingArchivedChatTabId].some((x) => x != null && String(x) === id);
  }
  const ARCHIVE_DELAY_MS = 1500;
  const ARCHIVE_TRIES = 8;
  // Archive one chat with the app's own action, keeping the user's view.
  function archiveChat(st, ws, tabId) {
    if (!st || typeof st.archiveChatTab !== "function") return "no-action";
    const prev = { route: st.activeNavRoute || null, center: st.activeCenterTabId || null, chat: st.activeChatTabId || null };
    let r;
    guarding = true;
    try {
      r = st.archiveChatTab(ws, tabId, { allowPromoted: true });
      // the app opened a new chat for it (its last live chat): the user's tab back
      const s2 = W();
      if (prev.center && s2 && s2.activeCenterTabId !== prev.center && String(prev.center) !== String(tabId)) restoreView(prev);
    } finally {
      guarding = false;
    }
    const tab = tabOf(W() || st, ws, tabId);
    return !tab ? "gone" : tab.isArchived === true ? "archived" : r === false ? "refused" : "not-archived";
  }
  // Finished tasks: their chats go to the archive (see the header).
  function archiveDone() {
    const st = W();
    if (!st || typeof st.archiveChatTab !== "function") return;
    const t = now();
    for (const task of tasks) {
      if ((task.status !== "done" && task.status !== "failed") || !task.chatId || !task.workspaceId || task.revealed) continue;
      if (task.chatArchived === true || task.chatArchived === "gone" || (task.archiveTries || 0) >= ARCHIVE_TRIES) continue;
      if (t - (task.finishedAt || 0) < ARCHIVE_DELAY_MS) continue;
      const tab = tabOf(st, task.workspaceId, task.chatId);
      if (!tab) {
        task.chatArchived = "gone";
        continue;
      }
      if (tab.isArchived === true) {
        task.chatArchived = true;
        continue;
      }
      if (onScreen(st, task)) continue; // the user is reading it: when it leaves the screen
      // a turn still winding down: the app would refuse; again when it stops (no try spent)
      const snap = snapOf(keyOf(task.workspaceId, task.chatId));
      if (inProgress(st, task.workspaceId, task.chatId) || (snap && snap.phase && snap.phase !== "idle" && snap.phase !== "disposed")) continue;
      const r = archiveChat(st, task.workspaceId, task.chatId);
      state.archive = { at: t, id: task.id, chat: task.chatId, result: r };
      if (r === "archived" || r === "gone") task.chatArchived = r === "archived" ? true : "gone";
      else task.archiveTries = (task.archiveTries || 0) + 1;
      changed();
    }
  }
  // Boot: chats no task knows any more, started by this pipeline (their first
  // message is one of its prompts), idle and off screen: archived once.
  const PROMPT_RE = /^Canvas (comment|note|request) from [^\n]*?: "/;
  function migrateOrphans() {
    if (state.migrated) return;
    const st = W();
    const ss = sessStore();
    if (!st) return;
    if (!ss || typeof st.archiveChatTab !== "function") return void (state.migrated = { at: now(), archived: [], skipped: 0, why: ss ? "no-archive-action" : "no-session-store" });
    state.migrated = { at: now(), archived: [], skipped: 0 };
    const known = new Set(tasks.map((t) => String(t.chatId)));
    for (const w of st.workspaces || []) {
      if (!w || !w.id) continue;
      const tabs = (st.selectedWorkspaceId === w.id ? st.centerTabs : w.centerTabs) || [];
      for (const tab of tabs) {
        if (!tab || tab.type !== "chat" || tab.isArchived === true || tab.ownerChatTabId || known.has(String(tab.id)) || !tab.sessionId) continue;
        let msgs = null;
        try {
          msgs = (typeof ss.getCachedMessages === "function" && ss.getCachedMessages(String(tab.sessionId))) || (typeof ss.getMessages === "function" && ss.getMessages(String(tab.sessionId))) || null;
        } catch (_) {}
        const first = Array.isArray(msgs) ? msgs.find((m) => m && m.role === "user") : null;
        if (!first || !PROMPT_RE.test(textOf(first))) continue;
        if (inProgress(st, w.id, tab.id) || (st.selectedWorkspaceId === w.id && [st.activeCenterTabId, st.leftPanelActiveTabId, st.rightPanelActiveTabId].includes(tab.id))) {
          state.migrated.skipped++;
          continue;
        }
        if (archiveChat(W() || st, w.id, tab.id) === "archived") state.migrated.archived.push(tab.id);
      }
    }
  }

  // ----------------------------------------------------------------- status
  let tasks = [];
  let lastPrompt = "";

  function trim() {
    if (tasks.length > TASKS_MAX) tasks = tasks.slice(-TASKS_MAX);
  }

  function tabOf(st, wsId, tabId) {
    const ws = (st.workspaces || []).find((w) => w && w.id === wsId);
    const tabs = (ws && ws.centerTabs) || (st.selectedWorkspaceId === wsId ? st.centerTabs : null) || [];
    return tabs.find((t) => t && t.id === tabId) || null;
  }
  // The key of a chat's messages in the session store: its session
  // controller's own (the orchestrator host's; a pending key until the CLI
  // session exists, then the session id, the store aliasing the first to the
  // second). A background chat has no view and its tab may carry no
  // sessionId while it runs, so tab.sessionId and a mounted chat view are
  // only fallbacks.
  function sessionKeyOf(tab, tabId, wsId) {
    try {
      const sc = wsId && F.reg ? controllerOf(keyOf(wsId, tabId)) : null;
      const k = sc && typeof sc.storeKey === "string" && sc.storeKey ? sc.storeKey : null;
      if (k) return k;
    } catch (_) {}
    if (tab && tab.sessionId) return String(tab.sessionId);
    const cv = chatViewOf(tabId);
    return (cv && cv.getAttribute("data-chat-session-id")) || null;
  }
  function textOf(m) {
    if (!m) return "";
    if (typeof m.content === "string") return m.content;
    if (!Array.isArray(m.content)) return "";
    return m.content
      .filter((p) => p && p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("\n")
      .trim();
  }
  // Images in the chat (the agent's screenshots / previews): Anthropic image
  // blocks, also inside tool results. -> data URLs
  function imagesOf(m) {
    const out = [];
    const walk = (p, d) => {
      if (!p || typeof p !== "object" || d > 4) return;
      if (Array.isArray(p)) return void p.forEach((x) => walk(x, d + 1));
      if (p.type === "image") {
        const s = p.source && typeof p.source === "object" ? p.source : p;
        const mt = String(s.media_type || s.mediaType || "");
        let url = null;
        if (typeof s.data === "string" && /^image\/(png|jpe?g|webp|gif)$/i.test(mt)) url = `data:${mt};base64,${s.data}`;
        else if (typeof s.url === "string" && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(s.url)) url = s.url;
        if (url && url.length <= AGENT_IMG_BYTES) out.push(url);
        return;
      }
      if (p.type === "tool_result" || p.type === "tool-result") walk(p.content, d + 1);
    };
    walk(m && m.content, 0);
    return out;
  }
  // Finished assistant texts -> updates; the last one is the summary. A new
  // tool call / result is "activity": the canvas may change now (a GIF frame
  // follows shortly).
  function messagesOf(ss, key) {
    let msgs = null;
    try {
      msgs = ss.getMessages(key);
      if ((!Array.isArray(msgs) || !msgs.length) && typeof ss.getCachedMessages === "function") msgs = ss.getCachedMessages(key);
    } catch (_) {}
    return Array.isArray(msgs) && msgs.length ? msgs : null;
  }
  function readMessages(task, ss, key, list) {
    const msgs = list || messagesOf(ss, key);
    if (!msgs) return false;
    let dirty = ingest(task, msgs);
    let tools = 0;
    for (const m of msgs) {
      if (m && m.role === "tool") tools++;
      else if (m && Array.isArray(m.content)) for (const p of m.content) if (p && typeof p.type === "string" && /tool/.test(p.type)) tools++;
    }
    if (tools !== (task.toolCount || 0)) {
      task.toolCount = tools;
      if (task.cap) task.cap.activityAt = now();
    }
    for (const m of msgs) {
      if ((task.agentImgs || 0) >= AGENT_IMG_MAX) break;
      if (!m || m.id == null || m.isStreaming === true) continue;
      const mid = `img:${m.id}`;
      if (task.seenMsgIds.includes(mid)) continue;
      const imgs = imagesOf(m);
      if (!imgs.length) continue;
      task.seenMsgIds.push(mid);
      for (const url of imgs.slice(0, AGENT_IMG_MAX - (task.agentImgs || 0))) {
        task.updates.push({ at: typeof m.timestamp === "number" ? m.timestamp : now(), kind: "screenshot", text: "agent", dataUrl: url });
        task.agentImgs = (task.agentImgs || 0) + 1;
      }
      dirty = true;
    }
    const last = lastAssistant(msgs);
    for (const m of msgs) {
      if (!m || m.role !== "assistant" || m.isStreaming === true || m.id == null) continue;
      const t = textOf(m);
      if (!t) continue;
      const mid = String(m.id);
      if (!task.seenMsgIds.includes(mid)) {
        task.seenMsgIds.push(mid);
        if (task.seenMsgIds.length > 200) task.seenMsgIds.shift();
        task.updates.push({ at: typeof m.timestamp === "number" ? m.timestamp : now(), kind: "text", text: clip(t, SUMMARY_MAX) });
        dirty = true;
      }
      const sum = clip(t, SUMMARY_MAX);
      if (m === last && task.summary !== sum) {
        task.summary = sum;
        dirty = true;
      }
      if (m === last) task.lastBlock = lastTextOf(m).slice(0, 1500); // the thread reply's source
    }
    if (task.updates.length > UPDATES_MAX) {
      // keep the screenshots, drop the oldest texts
      const shots = task.updates.filter((u) => u.kind === "screenshot");
      const texts = task.updates.filter((u) => u.kind !== "screenshot").slice(-(UPDATES_MAX - shots.length));
      task.updates = [...shots, ...texts].sort((a, b) => a.at - b.at);
    }
    return dirty;
  }
  // ----------------------------------------------------------------- stream
  // The agent's tool calls as they happen (see Stream in the header): the
  // chat session store's own subscribe(key, cb) wakes the read (at most every
  // STREAM_MS), the 500 ms tick reads too. Each new tool call (and each one
  // that ends) -> task.activity and the window event "rtcc:activity".
  const subs = new Map(); // task id -> { key, off, t }
  function watchSession(task, ss, key) {
    const s = subs.get(task.id);
    if (s && s.key === key) return;
    unwatch(task.id);
    if (!ss || typeof ss.subscribe !== "function" || !key) return;
    try {
      const off = ss.subscribe(key, () => streamSoon(task.id));
      subs.set(task.id, { key, off: typeof off === "function" ? off : null, t: 0 });
    } catch (e) {
      note("stream", e);
    }
  }
  function unwatch(id) {
    const s = subs.get(id);
    if (!s) return;
    subs.delete(id);
    clearTimeout(s.t);
    try {
      if (s.off) s.off();
    } catch (_) {}
  }
  // Called inside the store's notify: only a timer here.
  function streamSoon(id) {
    const s = subs.get(id);
    if (!s || s.t) return;
    s.t = setTimeout(() => {
      s.t = 0;
      const task = tasks.find((x) => x.id === id);
      const ss = sessStore();
      if (!task || !LIVE.has(task.status) || !ss) return unwatch(id);
      const msgs = messagesOf(ss, s.key);
      if (msgs && ingest(task, msgs)) changed();
    }, STREAM_MS);
  }
  const baseName = (p) => String(p || "").split(/[\\/]/).filter(Boolean).pop() || "";
  const STYLE_RE = /className=|style=\{|\b(?:bg|text|border|rounded|shadow|ring|fill|stroke)-[\w[#]|#[0-9a-f]{3,8}\b|\b(?:color|background|font-size|padding|margin)\s*:/i;
  const NAME_RE = /\b(?:name|title|label)\s*[:=]\s*\{?\s*["'`]([^"'`\n]{1,60})["'`]/;
  // A tool call -> { kind, label, file?, storyboard?, point?, nodeId? }:
  // what the cursor shows. kind: read (no target) | edit | style | create |
  // canvas | layout | check | shot | node | click | run | web | plan | other.
  function describeTool(name, a) {
    const tool = String(name || "").replace(/^mcp__.+?__/, "");
    a = a && typeof a === "object" ? a : {};
    const file = a.file_path || a.notebook_path || (typeof a.path === "string" && /\.\w+$/.test(a.path) ? a.path : null);
    const f = baseName(file);
    const canvasFile = /\.canvas\.[jt]sx?$/i.test(f);
    const body = [a.new_string, a.content, ...(Array.isArray(a.edits) ? a.edits.map((e) => e && e.new_string) : [])].filter((x) => typeof x === "string").join("\n").slice(0, 20000);
    const named = (NAME_RE.exec(body) || [])[1] || null;
    const stem = f.replace(/\.(canvas\.)?[jt]sx?$|\.\w+$/i, "").replace(/\.(module|styles?|stories)$/i, "");
    switch (tool) {
      case "Read":
        return { kind: "read", label: f ? `Reading ${f}` : "Reading", file };
      case "Grep":
      case "Glob":
      case "LS":
        return { kind: "read", label: a.pattern ? `Searching “${clip(a.pattern, 22)}”` : "Searching the code" };
      case "Write":
        return canvasFile ? canvasEdit(a, file, "Laying out the canvas") : { kind: "create", label: f ? `Creating ${f}` : "Creating a file", file, storyboard: named || stem };
      case "Edit":
      case "MultiEdit":
      case "NotebookEdit": {
        if (canvasFile) return canvasEdit(a, file, "Editing the canvas");
        const css = /\.(css|scss|sass|less)$/i.test(f);
        if (css || STYLE_RE.test(body)) return { kind: "style", label: f ? `Styling ${f}` : "Changing styles", file, storyboard: stem };
        return { kind: "edit", label: f ? `Editing ${f}` : "Editing", file, storyboard: stem };
      }
      case "Bash":
        return describeCommand(String(a.command || ""));
      case "WebFetch":
      case "WebSearch":
        return { kind: "web", label: "Searching the web" };
      case "TodoWrite":
        return { kind: "plan", label: "Planning" };
      case "Task":
      case "Agent":
        return { kind: "plan", label: "Delegating" };
      case "start_working_on_canvas":
        return { kind: "canvas", label: "Opening the canvas" };
      case "finish_working_on_canvas":
        return { kind: "check", label: "Wrapping up" };
      case "canvas_create":
        return { kind: "canvas", label: "Creating a canvas" };
      case "canvas_compute_layout":
        return { kind: "layout", label: "Arranging the layout" };
      case "canvas_validate":
        return { kind: "check", label: "Checking the canvas" };
      case "canvas_screenshot":
        return { kind: "shot", label: "Taking a screenshot", storyboard: typeof a.storyboard === "string" ? a.storyboard : null };
      case "canvas_list":
      case "canvas_project_init":
        return { kind: "read", label: "Looking at the canvases" };
      case "asset_list":
      case "asset_list_libraries":
      case "asset_get":
        return { kind: "read", label: "Browsing the assets" };
      default: {
        const words = tool.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
        return { kind: "other", label: words ? clip(words.charAt(0).toUpperCase() + words.slice(1), 32) : "Working" };
      }
    }
  }
  // The storyboards a canvas file declares (<TempoCanvasStoryboard id name
  // layout={{ x, y, width, height }} />, as the agent writes them): the
  // ones a write / edit adds or moves -> the action's target (world box).
  function storyboardsIn(src) {
    const out = [];
    for (const chunk of String(src || "").split(/<(?=[A-Z][\w.]*Storyboard\b)/)) {
      const lay = /layout=\{\{\s*x:\s*(-?[\d.]+)\s*,\s*y:\s*(-?[\d.]+)(?:\s*,\s*width:\s*([\d.]+))?(?:\s*,\s*height:\s*([\d.]+))?/.exec(chunk);
      const id = (/\bid=\{?["'`]([^"'`]+)["'`]/.exec(chunk) || [])[1] || null;
      const name = (/\bname=\{?["'`]([^"'`]+)["'`]/.exec(chunk) || [])[1] || null;
      if (!lay || (!id && !name)) continue;
      out.push({ id, name, x: +lay[1], y: +lay[2], width: lay[3] ? +lay[3] : null, height: lay[4] ? +lay[4] : null });
    }
    return out;
  }
  function canvasEdit(a, file, label) {
    const edits = Array.isArray(a.edits) ? a.edits : [a];
    const before = storyboardsIn(edits.map((e) => (e && (e.old_string || "")) || "").join("\n"));
    const after = storyboardsIn(edits.map((e) => (e && (e.new_string || e.content || "")) || "").join("\n") || a.content || "");
    const key = (b) => b.id || b.name;
    for (const b of after) {
      const was = before.find((o) => key(o) === key(b));
      const name = b.name || b.id;
      const world = { x: b.x, y: b.y, width: b.width, height: b.height };
      if (!was && a.old_string !== undefined) return { kind: "create", label: `Adding ${name}`, file, storyboard: name, nodeId: b.id, world };
      if (was && (was.x !== b.x || was.y !== b.y)) return { kind: "move", label: `Moving ${name}`, file, storyboard: name, nodeId: b.id, world };
      if (was && (was.width !== b.width || was.height !== b.height)) return { kind: "resize", label: `Resizing ${name}`, file, storyboard: name, nodeId: b.id, world };
    }
    // a whole file written, or an edit that adds no storyboard (imports)
    if (a.content !== undefined && after.length && a.old_string === undefined) return { kind: "canvas", label, file, storyboard: after[after.length - 1].name || after[after.length - 1].id };
    return { kind: "canvas", label, file, storyboard: (NAME_RE.exec(edits.map((e) => (e && e.new_string) || "").join("\n")) || [])[1] || null };
  }
  // A shell command; ui-drive's tempo-ui commands (canvas actions with their
  // x / y / id) become actions on the canvas.
  function describeCommand(cmd) {
    const m = /(?:^|[\s;&|/])tempo-ui\s+([\w.:-]+)([^\n;&|]*)/.exec(cmd);
    if (!m) {
      const w = (cmd.trim().split(/\s+/)[0] || "").replace(/^.*\//, "");
      return { kind: "run", label: w ? `Running ${clip(w, 20)}` : "Running a command" };
    }
    const act = m[1];
    const rest = m[2] || "";
    const numOf = (k) => {
      const r = new RegExp(`(?:["']?${k}["']?\\s*[:=]\\s*)(-?\\d+(?:\\.\\d+)?)`).exec(rest);
      return r ? +r[1] : null;
    };
    const idOf2 = (/(?:["']?id["']?\s*[:=]\s*)["']?([\w.:-]+)/.exec(rest) || [])[1] || null;
    const x = numOf("x");
    const y = numOf("y");
    const point = x != null && y != null ? { x, y } : null;
    if (act === "screenshot") return { kind: "shot", label: "Taking a screenshot" };
    if (/^canvas\.browser\./.test(act)) return { kind: "node", label: act.endsWith("navigate") ? "Opening a page" : "Adding a browser", point, nodeId: idOf2 ? `browser:${idOf2}` : null };
    if (/^canvas\.node\./.test(act)) return { kind: "node", label: act.endsWith("remove") ? "Removing a frame" : "Placing a frame", point, nodeId: idOf2 && /(note|shader|browser):/.test(idOf2) ? idOf2 : null };
    if (/^ui\.(click|toggle|select)$/.test(act)) return { kind: "click", label: "Clicking", point };
    if (act === "ui.type") return { kind: "click", label: "Typing", point };
    return { kind: "run", label: `Running ${clip(act, 24)}` };
  }
  // The chat's tool calls (message.toolCalls, else tool_use blocks with their
  // tool_result) -> activity; true when the task changed. A task restored
  // after a reload takes the calls already there silently.
  function ingest(task, msgs) {
    const seen = task.toolSeen && typeof task.toolSeen === "object" ? task.toolSeen : (task.toolSeen = {});
    const quiet = !task.liveRun && !task.ingested;
    task.ingested = true;
    const results = new Map();
    for (const m of msgs) if (m && Array.isArray(m.content)) for (const p of m.content) if (p && p.type === "tool_result" && p.tool_use_id) results.set(String(p.tool_use_id), p.is_error ? "failed" : "succeeded");
    let dirty = false;
    for (const m of msgs) {
      if (!m || m.role !== "assistant") continue;
      const calls = Array.isArray(m.toolCalls) && m.toolCalls.length ? m.toolCalls : Array.isArray(m.content) ? m.content.filter((p) => p && p.type === "tool_use") : [];
      for (const tc of calls) {
        if (!tc || tc.id == null || !tc.name) continue;
        const id = String(tc.id);
        const status = typeof tc.status === "string" ? tc.status : results.get(id) || "running";
        const prev = seen[id];
        if (prev === status) continue;
        seen[id] = status;
        if (quiet) continue;
        const d = describeTool(tc.name, tc.args || tc.input);
        const phase = prev ? "end" : "start";
        const at = now();
        const n = (task.activity && task.activity.n) || 0;
        if (phase === "start" || (task.activity && task.activity.id === id)) task.activity = { id, tool: String(tc.name), kind: d.kind, label: d.label, status, at, n: phase === "start" ? n + 1 : n };
        if (phase === "start" && task.timing && !task.timing.firstTool) task.timing.firstTool = at;
        if (task.cap) task.cap.activityAt = at;
        dirty = true;
        fire("rtcc:activity", { taskId: task.id, id, tool: String(tc.name), displayName: tc.displayName || null, phase, status, at, ...d });
        contractTool(task, id, d, phase, status, String(tc.name));
      }
    }
    const keys = Object.keys(seen);
    if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete seen[k];
    return dirty;
  }

  // --------------------------------------------------------------- contract
  // The events the cursor's choreography (agent-cursors) plays: see Contract
  // in the header. Everything here only reads the page.
  const fire = (name, detail) => {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (_) {}
  };
  const ACTION_KIND = { edit: "edit", style: "style", create: "create", canvas: "canvas", layout: "layout", shot: "shot", click: "click", node: "create", move: "move", resize: "resize" };
  const THINK_MS = 1200; // no tool call open this long while running: "thinking"
  const NODE_SEL = { note: ".rtcn-note[data-rtcn-id", shader: ".rtsh-frame[data-rtsh-id", browser: ".rtbf-frame[data-rtbf-id" };
  const squash = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const stemOf = (file) => baseName(file).replace(/\.(canvas\.)?[jt]sx?$|\.\w+$/i, "").replace(/\.(module|styles?|stories)$/i, "");
  const domRect = (r) => (r && r.width > 0 && r.height > 0 ? new DOMRect(r.left, r.top, r.width, r.height) : null);
  // A storyboard on screen by its id, header or component name.
  function storyboardEl(names) {
    const want = names.map(squash).filter((w) => w.length >= 3 && w !== "index" && w !== "app");
    if (!want.length) return null;
    for (const el of document.querySelectorAll(SEL.item)) {
      if (!present(el)) continue;
      const id = squash(el.getAttribute("data-canvas-item-id"));
      const h = squash(headerName(el));
      if (want.some((w) => w === id || (h && w === h))) return el;
    }
    return null;
  }
  // canvas (world) box -> viewport px
  function screenBox(w) {
    const v = w ? viewOf(null) : null;
    if (!v || v.ox == null) return null;
    return new DOMRect(v.ox + w.x * v.z, v.oy + w.y * v.z, Math.max(1, (w.width || 0) * v.z), Math.max(1, (w.height || 0) * v.z));
  }
  const itemTarget = (t, el) => {
    t.nodeId = el.getAttribute("data-canvas-item-id");
    t.selector = `[data-canvas-item-id="${CSS.escape(t.nodeId)}"]`;
    t.rect = domRect(el.getBoundingClientRect());
    if (!t.storyboardName) t.storyboardName = headerName(el) || t.nodeId;
    return t;
  };
  // Where a tool call happens: a canvas-nodes frame (tempo-ui's id), a
  // storyboard on screen (id, name, the file's component), the box a canvas
  // edit declares, tempo-ui's x / y, else the comment's storyboard, else its
  // pin (fallback "pin"). rect in viewport px; x / y in canvas coordinates.
  function targetOf(task, d) {
    const t = { file: d.file || null, storyboardName: d.storyboard || null, nodeId: d.nodeId || null, selector: null, rect: null, x: null, y: null };
    const w = d.world || (d.point ? { x: d.point.x, y: d.point.y, width: 0, height: 0 } : null);
    if (w) (t.x = w.x), (t.y = w.y);
    const nm = /^(note|shader|browser):(.+)$/.exec(d.nodeId || "");
    if (nm) {
      const el = Array.from(document.querySelectorAll(`${NODE_SEL[nm[1]]}="${CSS.escape(nm[2])}"]`)).find(present);
      if (el) {
        t.selector = `${NODE_SEL[nm[1]]}="${CSS.escape(nm[2])}"]`;
        t.rect = domRect(el.getBoundingClientRect());
        return t;
      }
    }
    const el = storyboardEl([d.nodeId, d.storyboard, stemOf(d.file)]);
    if (el) return itemTarget(t, el);
    if (w) return (t.rect = screenBox(w)), t;
    const a = task.anchor;
    const own = a && a.nodeId ? itemOf(String(a.nodeId)) : null;
    if (own) return itemTarget(t, own);
    if (a) {
      t.x = a.x;
      t.y = a.y;
      t.rect = screenBox({ x: a.x, y: a.y, width: 0, height: 0 });
      t.fallback = "pin";
    }
    return t;
  }
  const thinkT = new Map(); // task id -> timer
  function thinkSoon(task, ms) {
    clearTimeout(thinkT.get(task.id));
    thinkT.set(
      task.id,
      setTimeout(() => {
        thinkT.delete(task.id);
        const open = Object.values(task.toolSeen || {}).some((st) => st === "running" || st === "pending");
        if (task.status === "running" && !open) fire("rtca:thinking", { taskId: task.id, at: now() });
      }, ms)
    );
  }
  function contractTool(task, id, d, phase, status, tool) {
    if (phase === "start") clearTimeout(thinkT.get(task.id));
    else thinkSoon(task, THINK_MS);
    const kind = ACTION_KIND[d.kind];
    if (!kind) return;
    if (phase === "end") return fire("rtca:action-end", { taskId: task.id, id, status, at: now() });
    let target = null;
    try {
      target = targetOf(task, d);
    } catch (e) {
      note("target", e);
    }
    task.lastAction = { id, at: now(), names: [d.storyboard, d.nodeId, stemOf(d.file), target && target.nodeId].map(squash).filter(Boolean) };
    if (task.cap) for (const nm of task.lastAction.names) (task.cap.touched = task.cap.touched || new Set()).add(nm);
    trackAct(task, kind, d.label, target);
    fire("rtca:action", { taskId: task.id, id, kind, label: d.label, tool, target, source: "stream", at: now() });
    if (status === "succeeded" || status === "failed") fire("rtca:action-end", { taskId: task.id, id, status, at: now() });
  }
  // Status changes -> rtca:thinking (running, no tool call open),
  // rtca:needs-input, rtca:done, rtca:failed. Called with every change.
  const lastSt = new Map(); // task id -> status the contract last saw
  function contractStatus() {
    for (const t of tasks) {
      const was = lastSt.get(t.id);
      if (was === t.status) continue;
      lastSt.set(t.id, t.status);
      if (was === undefined && !t.liveRun) continue; // restored: not news
      if (t.status === "running") thinkSoon(t, 0);
      else if (t.status === "needs-input") fire("rtca:needs-input", { taskId: t.id, at: now() });
      else if (t.status === "done") fire("rtca:done", { taskId: t.id, at: now() });
      else if (t.status === "failed" && was !== undefined) fire("rtca:failed", { taskId: t.id, reason: t.error || null, why: t.why || null, at: now() });
    }
    for (const id of lastSt.keys()) if (!tasks.some((t) => t.id === id)) lastSt.delete(id);
    canvasWatch();
  }
  // Fallback from the canvas itself, while a task works: a storyboard that
  // appears, moves or is resized (not during the user's own pointer, key or
  // wheel, nor more than 3 at once: a canvas mounting) -> rtca:action
  // {source: "canvas"}, for the running task that named it, else the one
  // whose pin is nearest. matches = that task's stream action on the same
  // storyboard within 6 s, when there is one.
  const CW = { obs: new Map(), seen: new Map(), pend: new Map(), t: 0, userAt: 0, on: false };
  const boxKeyOf = (el) => {
    const b = itemBox(el);
    return b ? `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}` : "";
  };
  const onUser = () => (CW.userAt = now());
  function canvasWatch() {
    const live = tasks.some((t) => t.status === "running" || t.status === "needs-input");
    if (!live) {
      if (CW.on) {
        for (const mo of CW.obs.values()) mo.disconnect();
        CW.obs.clear();
        CW.seen.clear();
        for (const ev of ["pointerdown", "keydown", "wheel"]) window.removeEventListener(ev, onUser, true);
        CW.on = false;
      }
      return;
    }
    if (!CW.on) {
      for (const ev of ["pointerdown", "keydown", "wheel"]) window.addEventListener(ev, onUser, { capture: true, passive: true });
      CW.on = true;
    }
    for (const [wl, mo] of CW.obs) if (!wl.isConnected) mo.disconnect(), CW.obs.delete(wl);
    for (const root of document.querySelectorAll(SEL.canvasRoot)) {
      const wl = root.querySelector(".tds-canvas-shimmer-origin") || root;
      if (CW.obs.has(wl)) continue;
      for (const el of wl.querySelectorAll(SEL.item)) CW.seen.set(el.getAttribute("data-canvas-item-id"), boxKeyOf(el));
      const mo = new MutationObserver(onCanvasMutations);
      mo.observe(wl, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
      CW.obs.set(wl, mo);
    }
  }
  function onCanvasMutations(recs) {
    const mark = (el) => {
      const id = el.getAttribute("data-canvas-item-id");
      if (!id) return;
      CW.pend.set(id, el);
      if (!CW.t) CW.t = setTimeout(flushCanvas, 160);
    };
    for (const r of recs) {
      if (r.type === "attributes") {
        if (r.target.nodeType === 1 && r.target.hasAttribute("data-canvas-item-id")) mark(r.target);
        continue;
      }
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.hasAttribute("data-canvas-item-id")) mark(n);
        else for (const el of n.querySelectorAll(SEL.item)) mark(el);
      }
    }
  }
  function flushCanvas() {
    CW.t = 0;
    const list = [...CW.pend.entries()];
    CW.pend.clear();
    const t = now();
    const quiet = t - CW.userAt < 1500;
    const fresh = list.filter(([id]) => !CW.seen.has(id)).length;
    for (const [id, el] of list) {
      const k = boxKeyOf(el);
      const prev = CW.seen.get(id);
      CW.seen.set(id, k);
      if (quiet || fresh > 3 || !el.isConnected || !k) continue;
      let kind = null;
      if (prev === undefined) kind = "create";
      else if (prev !== k) {
        const [, , pw, ph] = prev.split(",");
        const [, , w, h] = k.split(",");
        kind = pw !== w || ph !== h ? "resize" : "move";
      }
      if (!kind) continue;
      const task = ownerOf(el);
      if (!task) continue;
      const name = headerName(el) || id;
      const target = itemTarget({ file: null, storyboardName: name, nodeId: null, selector: null, rect: null, x: null, y: null }, el);
      const b = itemBox(el);
      if (b) (target.x = b.x), (target.y = b.y);
      const la = task.lastAction;
      const matches = la && t - la.at < 6000 && (la.names.includes(squash(id)) || la.names.includes(squash(name))) ? la.id : null;
      trackAct(task, kind, `${kind === "create" ? "Adding" : kind === "resize" ? "Resizing" : "Moving"} ${name}`, target);
      fire("rtca:action", { taskId: task.id, id: `canvas:${id}:${t.toString(36)}`, kind, label: `${kind === "create" ? "Adding" : kind === "resize" ? "Resizing" : "Moving"} ${name}`, tool: null, target, source: "canvas", matches, at: t });
    }
  }
  // The running task a canvas change belongs to.
  function ownerOf(el) {
    const live = tasks.filter((t) => t.status === "running" || t.status === "needs-input");
    if (live.length <= 1) return live[0] || null;
    const id = squash(el.getAttribute("data-canvas-item-id"));
    const name = squash(headerName(el));
    const named = live.filter((t) => t.lastAction && (t.lastAction.names.includes(id) || (name && t.lastAction.names.includes(name))));
    if (named.length) return named.sort((a, b) => b.lastAction.at - a.lastAction.at)[0];
    const b = itemBox(el);
    if (!b) return live[live.length - 1];
    const dist = (t) => (t.anchor ? Math.hypot(Math.max(b.x - t.anchor.x, 0, t.anchor.x - (b.x + b.w)), Math.max(b.y - t.anchor.y, 0, t.anchor.y - (b.y + b.h))) : Infinity);
    return live.sort((x, y) => dist(x) - dist(y))[0];
  }

  // The last text block of a message: after the tool calls, the agent's own
  // account of what it did (earlier blocks narrate the work).
  function lastTextOf(m) {
    if (!m) return "";
    if (typeof m.content === "string") return m.content.trim();
    const parts = Array.isArray(m.content) ? m.content.filter((p) => p && p.type === "text" && typeof p.text === "string" && p.text.trim()) : [];
    return parts.length ? parts[parts.length - 1].text.trim() : "";
  }
  function lastAssistant(msgs) {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m && m.role === "assistant" && m.isStreaming !== true && textOf(m)) return m;
    }
    return null;
  }

  // The chat's model and effort: the tab's own (the composer's pickers write
  // them), else the store's chatDefaults. -> true when something changed
  const EFFORT_LABEL = { minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra High", max: "Max" };
  // "opus-5.5-1m" -> "Opus 5.5" (the app's shortName without the context
  // suffix, as the pickers show it); "claude-opus-5-5[1m]" -> "Opus 5.5".
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
      if (/^\d+$/.test(p) && prev && /^\d+$/.test(prev)) out[out.length - 1] = `${prev}.${p}`; // 5-5 -> 5.5
      else out.push(p);
    }
    const word = (w) => (/^(glm|gpt)$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1));
    if (/^gpt$/i.test(out[0]) && out[1]) return [`GPT-${out[1]}`, ...out.slice(2).map(word)].join(" ");
    return out.map(word).join(" ");
  }
  function readModel(task, tab, st) {
    const d = st && st.chatDefaults && typeof st.chatDefaults === "object" ? st.chatDefaults : null;
    const modelId = (tab && typeof tab.model === "string" && tab.model) || (d && typeof d.model === "string" && d.model) || null;
    const effortId = (tab && typeof tab.effort === "string" && tab.effort) || (d && typeof d.effort === "string" && d.effort) || null;
    let model = modelId ? modelLabel(modelId) : null;
    try {
      const cv = task.chatId ? chatViewOf(task.chatId) : null;
      const b = cv && cv.querySelector(SEL.modelBtn);
      const txt = b ? (b.textContent || "").replace(/\s+/g, " ").trim().replace(/ 1M$/, "") : "";
      if (txt && txt.length <= 40) model = txt;
    } catch (_) {}
    const effort = effortId ? EFFORT_LABEL[effortId] || effortId.charAt(0).toUpperCase() + effortId.slice(1) : null;
    let dirty = false;
    for (const [k, v] of [
      ["modelId", modelId],
      ["effortId", effortId],
      ["model", model],
      ["effort", effort],
    ])
      if (v && task[k] !== v) (task[k] = v), (dirty = true);
    return dirty;
  }

  function track() {
    const st = W();
    const ss = sessStore();
    const t = now();
    let dirty = false;
    for (const task of tasks) {
      if (!LIVE.has(task.status) && subs.has(task.id)) unwatch(task.id);
      if (task.status === "queued" && t - task.createdAt > QUEUED_MAX_MS) {
        fail(task, "timeout"); // a dispatch still waiting sees it and creates no chat
        continue;
      }
      if (isStopped(task)) {
        watchStopped(task, t);
        continue;
      }
      if (task.dry) {
        // dry run: driven by _sim(); one bound to a real chat (QA) reads that
        // chat's messages the way a real task does
        const b = task.bound;
        const key = b && ss ? sessionKeyOf(null, b.chatId, b.workspaceId) : null;
        if (key) {
          watchSession(task, ss, key);
          if (readMessages(task, ss, key)) dirty = true;
        }
        continue;
      }
      if (!task.chatId || !st) continue;
      if (task.status !== "running" && task.status !== "needs-input") continue;
      const tab = tabOf(st, task.workspaceId, task.chatId);
      if (!tab || tab.isArchived === true) {
        fail(task, "closed");
        continue;
      }
      if (readModel(task, tab, st)) dirty = true;
      const key = sessionKeyOf(tab, task.chatId, task.workspaceId);
      let waiting = tab.isAwaitingResponse === true;
      let cs = null;
      if (ss && key) {
        try {
          if (!waiting && typeof ss.getIsWaitingForInput === "function") waiting = ss.getIsWaitingForInput(key) === true;
          const has = typeof ss.hasState !== "function" || ss.hasState(key);
          if (has && typeof ss.getCompletionStatus === "function") cs = ss.getCompletionStatus(key);
        } catch (_) {}
        if (cs && cs !== "idle") task.lastCs = cs;
        watchSession(task, ss, key);
        if (readMessages(task, ss, key)) dirty = true;
      }
      const busy = inProgress(st, task.workspaceId, task.chatId);
      const prev = task.status;
      if (waiting) {
        task.idleTicks = 0;
        task.status = "needs-input";
      } else if (busy) {
        task.seenRunning = true;
        task.idleTicks = 0;
        task.status = "running";
      } else if (task.lastCs === "errored" || task.lastCs === "aborted") {
        fail(task, task.lastCs);
        continue;
      } else {
        task.idleTicks++;
        if (!task.seenRunning && !tab.sessionId && t - (task.startedAt || task.createdAt) > 60000) {
          fail(task, "interrupted"); // never started (e.g. reloaded mid-send)
          continue;
        } else if (task.idleTicks >= 2 && (task.seenRunning || (tab.sessionId && t - Math.max(task.startedAt || 0, task.resumedAt || 0) > 3000))) {
          task.status = "done";
          task.finishedAt = t;
          task.afterDueAt = t + AFTER_DELAY_MS;
          if (ss && key) readMessages(task, ss, key);
        }
      }
      if (task.status !== prev) dirty = true;
    }
    if (dirty) changed();
    guardTick();
    archiveDone();
    if (!state.migrated && t - bootAt > 3000) migrateOrphans();
    afterShots();
    frameShots();
    scenePoll();
    gifShots();
    replyShots();
  }
  const bootAt = now();

  // "after": once the run is done and its region is on screen again.
  let afterBusy = false;
  // "after" waits for its storyboard: one at the pin (made during the task)
  // when the region is still the bare canvas (NEW_WAIT_MS at most), then
  // painted (no visible [data-storyboard-loading]; LOAD_WAIT_MS); a blank crop
  // of a storyboard is taken again, 1 s apart, BLANK_TRIES times at most.
  // -> "none" (no storyboard at the pin yet), "loading", or false (ready)
  function storyboardPending(cap) {
    const R = cap.region;
    if (!R || R.kind === "viewport" || (cap.info && cap.info.viewport)) return false; // the whole canvas: nothing to wait for
    if (R.kind !== "storyboard") return "none";
    const el = R.itemId ? itemById(R.itemId) : null;
    if (!el) return "none";
    const ld = el.querySelector("[data-storyboard-loading]");
    return !!ld && (ld.getAttribute("data-storyboard-loading") === "true" || (ld.getClientRects().length > 0 && getComputedStyle(ld).display !== "none")) ? "loading" : false;
  }
  async function afterShots() {
    if (afterBusy || document.visibilityState !== "visible") return;
    const t = now();
    // a provisional after (the run's last frame) is replaced once the change can be rendered
    const task = tasks.find((x) => x.status === "done" && (!x.after || (x.shot && x.shot.provisional && !x.cap.noRender)) && x.afterDueAt && t >= x.afterDueAt && t - x.afterTryAt > (x.afterRetry ? 1000 : 2000));
    if (!task) return;
    if (!task.cap) task.cap = newCap(task.info, false);
    const cap = task.cap;
    // The change, rendered (see change shots): any camera, any zoom. A
    // storyboard still loading gets LOAD_WAIT_MS first.
    if (!cap.noRender && shotsOn()) {
      const loading = Array.from(canvasScope().querySelectorAll("[data-storyboard-loading]")).some((ld) => ld.getAttribute("data-storyboard-loading") === "true" || (ld.getClientRects().length > 0 && getComputedStyle(ld).display !== "none"));
      if (loading && t - task.afterDueAt < LOAD_WAIT_MS) {
        task.afterTryAt = t;
        task.afterRetry = true;
        return;
      }
      afterBusy = true;
      task.afterTryAt = t;
      task.afterRetry = false;
      let r = false;
      try {
        r = await finalShots(task);
      } catch (e) {
        note("final", e);
        r = "fallback";
      } finally {
        afterBusy = false;
      }
      if (r === true) {
        // the window capture and the scenes served their frame: freed
        cap.wide = cap.states = cap.scene0 = null;
        return;
      }
      if (r !== "fallback") {
        // the canvas not open: again in 2 s; meanwhile, past FALLBACK_MS,
        // the run's last frame (provisional, replaced when it renders)
        if (t - task.afterDueAt > FALLBACK_MS && !task.after) lastResort(task, true);
        return void changed();
      }
      cap.noRender = true;
      state.captures.noRender = { at: now(), id: task.id };
    }
    // No renderer: the window capture of the pin's region, once it is on
    // screen; past FALLBACK_MS the run's last frame, said so.
    if (t - task.afterDueAt > FALLBACK_MS && lastResort(task)) return void changed();
    // the region follows a storyboard that appeared at the pin
    if (cap.region) {
      const v = viewOf(cap.info && cap.info.itemId);
      if (v) followStoryboard(cap, v);
    }
    const pend = storyboardPending(cap);
    if ((pend === "loading" && t - task.afterDueAt < LOAD_WAIT_MS) || (pend === "none" && t - task.afterDueAt < NEW_WAIT_MS)) {
      task.afterTryAt = t;
      task.afterRetry = true; // look again in 1 s
      return;
    }
    afterBusy = true;
    task.afterTryAt = t;
    task.afterRetry = false;
    try {
      const r = await capture(cap, "after");
      if (task.status !== "done" || task.after) return;
      if (r.ok && r.blank && cap.region && cap.region.kind === "storyboard" && (task.blankTries || 0) < BLANK_TRIES - 1) {
        task.blankTries = (task.blankTries || 0) + 1;
        task.afterRetry = true;
        state.captures.blankRetry = { at: now(), id: task.id, tries: task.blankTries, dom: +r.dom.toFixed(3) };
        return;
      }
      if (r.ok) {
        task.after = r.shot;
        task.updates.push({ at: now(), kind: "screenshot", text: "after", dataUrl: r.shot.dataUrl });
        addFrame(cap, r.frame);
        capOk(task, "after");
        changed();
      } else if (capNote(task, "after", r.why)) changed();
    } finally {
      afterBusy = false;
    }
  }
  // GIF frames while running: one capture at a time, the task waiting
  // longest first.
  let frameBusy = false;
  // When a frame is due: the agent just used a tool (ACT_DELAY_MS after it,
  // at most one per FRAME_MS / 2), else every `every` (2 s, doubling while
  // nothing changes, up to 30 s; back to 2 s on a change). Every due task in
  // one pass, so they share one screenshot.
  const frameDue = (x, t) => {
    const c = x.cap;
    if (x.status !== "running" || !c || !c.live) return false;
    const since = t - Math.max(c.lastFrameAt, x.startedAt || 0, x.resumedAt || 0);
    if (c.activityAt > c.lastFrameAt && t - c.activityAt >= ACT_DELAY_MS && since >= FRAME_MS / 2) return true;
    return since >= c.every;
  };
  async function frameShots() {
    if (frameBusy || afterBusy || document.visibilityState !== "visible") return;
    const t = now();
    const due = tasks.filter((x) => frameDue(x, t));
    if (!due.length) return;
    frameBusy = true;
    try {
      for (const task of due) {
        const cap = task.cap;
        cap.lastFrameAt = now();
        let r = await capture(cap, "frame");
        // A change while the app's comment popover covers part of the region
        // (its part of the frame is stale): retaken once with only that popover
        // hidden (~0.1 s). The mods' UI never hides: it stays masked.
        if (r.ok && r.popMasked && !r.same && r.frame.hash !== cap.lastHash && task.status === "running") {
          const clean = await capture(cap, "frame-clean");
          if (clean.ok) (r = clean), (state.captures.clean = (state.captures.clean || 0) + 1);
        }
        state.captures.frames = (state.captures.frames || 0) + (r.ok ? 1 : 0);
        if (!r.ok) state.captures.frameSkip = { at: now(), why: r.why };
        else if (task.status === "running") addFrame(cap, r.frame);
        if (r.ok && r.ms > 900) cap.every = Math.min(Math.max(cap.every, FRAME_MS) * 2, FRAME_IDLE_MAX); // slow captures: fewer frames
      }
    } finally {
      frameBusy = false;
    }
  }
  // The GIF, once per run: when "after" is taken, or GIF_WAIT_MS after
  // "done" without it. A failed run drops its frames.
  function gifShots() {
    const t = now();
    for (const task of tasks) {
      const cap = task.cap;
      if (!cap || !cap.live || cap.gifTried) continue;
      if (task.status === "failed") (cap.frames = []), (cap.wide = cap.states = cap.scene0 = null);
      else if (task.status === "done" && !cap.gifQueued && (task.after || t - (task.finishedAt || t) > GIF_WAIT_MS)) {
        // off the hot path: when the renderer is idle (2 s at the latest)
        cap.gifQueued = true;
        const go = () => buildGif(task).catch((e) => note("gif", e));
        if (typeof requestIdleCallback === "function") requestIdleCallback(go, { timeout: 2000 });
        else setTimeout(go, 0);
      }
    }
  }

  // ---------------------------------------------------------- thread reply
  // The run's result in the comment thread, once its media are ready.
  function replyShots() {
    if (!replyOn()) return;
    const t = now();
    for (const task of tasks) {
      if (task.status !== "done" || task.replied || !task.threadId || task.dry) continue;
      const cap = task.cap;
      const ready = cap && cap.live ? !!task.gif || !!cap.gifDone : !!task.after;
      if (ready || t - (task.finishedAt || t) > REPLY_WAIT_MS) replyDone(task).catch((e) => note("reply", e));
    }
  }
  // "Added a red square at your pin." from the agent's last text block: the
  // first paragraph that is not a list or a heading, markdown stripped, its
  // first 1-2 sentences (<= 320 chars).
  function voiceOf(text) {
    const paras = String(text || "")
      .replace(/\r/g, "")
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    let p = paras.find((x) => !/^([-*•>]|\d+[.)]|#)/.test(x)) || paras[0] || "";
    p = p
      .replace(/\*\*|__|`/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    const sentences = p.split(/(?<=[.!?])\s+/); // "index.canvas.tsx" or "5.5" never split
    let out = "";
    let n = 0;
    for (const s of sentences) {
      const x = s.trim();
      if (!x) continue;
      if (n >= 2 || (out && out.length + x.length + 1 > VOICE_MAX)) break;
      out += (out ? " " : "") + x;
      n++;
    }
    return clip(out || p, VOICE_MAX);
  }
  function replyBody(task) {
    const voice = voiceOf(task.lastBlock || task.summary || "") || "Done: the details are in the chat.";
    const mark = [`· task ${task.id}`, task.model, task.effort].filter(Boolean).join(" · ");
    return `${voice}\n\n${mark}`;
  }
  function blobOf(dataUrl) {
    const m = /^data:([^;,]+);base64,/.exec(dataUrl);
    const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: m ? m[1] : "application/octet-stream" });
  }
  // The comment composer's own upload (useAttachmentUpload in the bundle).
  async function uploadAttachment(c, blob) {
    const r = await c.mutation(makeRef(FN_UPLOAD_URL), {});
    if (!r || typeof r.url !== "string") throw new Error("no upload url");
    const res = await fetch(r.url, { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
    if (!res.ok) throw new Error(`upload failed (${res.status})`);
    const { storageId } = await res.json();
    if (!storageId) throw new Error("no storageId");
    await c.mutation(makeRef(FN_UPLOAD_REC), { storageId });
    return storageId;
  }
  async function replyDone(task) {
    if (task.replied || !task.threadId || !replyOn()) return;
    task.replied = true;
    const c = anyClient();
    if (!c) return;
    const body = replyBody(task);
    const rec = { id: task.id, at: now(), body, attachments: [], failed: [], commentId: null };
    state.reply = rec;
    for (const [what, img] of [
      ["after", task.after],
      ["gif", task.gif],
    ]) {
      if (!img || !img.dataUrl) continue;
      try {
        const blob = blobOf(img.dataUrl);
        if (blob.size > 10 * 1024 * 1024) throw new Error("over 10 MB");
        rec.attachments.push({ what, storageId: await uploadAttachment(c, blob), type: blob.type, bytes: blob.size });
      } catch (e) {
        note(`attach-${what}`, e);
        rec.failed.push({ what, error: String((e && e.message) || e) });
      }
    }
    const ids = rec.attachments.map((a) => a.storageId);
    let p;
    muted++;
    try {
      p = c.mutation(makeRef(FN_REPLY), { threadId: task.threadId, body, attachmentIds: ids.length ? ids : undefined });
    } catch (e) {
      note("reply", e);
    } finally {
      muted--;
    }
    try {
      const res = await p;
      const id = idOf(res, "commentId", "_id", "id");
      if (id) {
        markHandled(`c:${id}`);
        rec.commentId = task.replyCommentId = id;
        changed();
      }
    } catch (e) {
      note("reply", e);
    }
  }

  // ------------------------------------------------------- store: snapshot
  const PUBLIC = [
    "id",
    "source",
    "noteId",
    "threadId",
    "commentId",
    "text",
    "canvasName",
    "storyboardName",
    "createdAt",
    "chatId",
    "workspaceId",
    "status",
    "startedAt",
    "finishedAt",
    "model",
    "effort",
    "modelId",
    "effortId",
    "summary",
    "replyCommentId",
    "chatArchived",
    "revealed",
    "captureError",
    "error",
    "stoppedAt",
    "postedAt",
  ];
  function snapshot(t) {
    const o = {};
    for (const k of PUBLIC) o[k] = t[k] ?? null;
    o.source = t.source || "comment";
    o.author = { ...t.author };
    o.anchor = t.anchor ? { ...t.anchor } : null;
    o.before = t.before ? { ...t.before } : null;
    o.after = t.after ? { ...t.after } : null;
    o.gif = t.gif ? { ...t.gif } : null;
    o.shot = t.shot ? { ...t.shot, frame: t.shot.frame ? { ...t.shot.frame } : null, boxes: (t.shot.boxes || []).map((b) => ({ ...b })), pin: t.shot.pin ? { ...t.shot.pin } : null } : null;
    o.replay = t.replay ? { ...t.replay, frames: t.replay.frames.map((f) => ({ ...f })), cursor: t.replay.cursor.map((c) => ({ ...c })) } : null;
    // the last frame taken (memory only: the bubbles' hover preview) and the
    // captured region in canvas coordinates (for a follow mode)
    const lf = t.cap && t.cap.last;
    o.lastFrame = lf && t.cap.gw ? { dataUrl: lf.dataUrl, w: t.cap.gw, h: t.cap.gh, at: lf.at } : null;
    o.region = t.cap && t.cap.region ? { ...t.cap.region } : null;
    o.frames = Array.isArray(t.frames) ? t.frames.map((f) => ({ ...f })) : null;
    o.updates = t.updates.map((u) => ({ ...u }));
    o.activity = t.activity ? { ...t.activity } : null;
    o.timing = t.timing ? { ...t.timing } : null;
    if (t.dry) o.dry = true;
    return o;
  }
  const listeners = new Set();
  let notifyQueued = false;
  const pending = new Set(); // task ids waiting for their chat in the send queue
  // store = false: notify only (the boot's restore: nothing new to write)
  let persistQueued = false;
  function changed(store = true) {
    if (store) persistQueued = true;
    if (notifyQueued) return;
    notifyQueued = true;
    queueMicrotask(() => {
      notifyQueued = false;
      if (persistQueued) persistSoon();
      persistQueued = false;
      try {
        contractStatus();
      } catch (e) {
        note("contract", e);
      }
      render();
      const list = tasks.map(snapshot);
      for (const cb of Array.from(listeners)) {
        try {
          cb(list);
        } catch (e) {
          note("subscriber", e);
        }
      }
      try {
        window.dispatchEvent(new CustomEvent("rtcc:changed", { detail: { tasks: list } }));
      } catch (_) {}
    });
  }

  // localStorage (the app's quota): debounced, one write per PERSIST_MS at
  // most (and right away when the window hides or the page goes), within
  // PERSIST_MAX chars. Every task's metadata; images newest task first while
  // they fit: before/after (and the 3 key frames) for the IMG_KEEP most
  // recent, the GIF for the GIF_KEEP most recent when <= GIF_PERSIST_MAX
  // (else its key frames); older tasks lose their images first. Frames of a
  // run in progress are never persisted.
  let persistTimer = 0;
  function persistSoon() {
    if (!persistTimer) persistTimer = setTimeout(persist, PERSIST_MS);
  }
  function persistNow() {
    if (persistTimer) persist();
  }
  const imgLen = (o) => (o && typeof o.dataUrl === "string" ? o.dataUrl.length + 64 : 0);
  function persist() {
    clearTimeout(persistTimer);
    persistTimer = 0;
    const list = tasks.filter((t) => !t.dry).slice(-TASKS_MAX); // a dry run's tasks live in memory only
    const meta = (t) => ({
      ...t,
      before: null,
      after: null,
      gif: null,
      frames: null,
      replay: null,
      cap: t.cap ? { region: t.cap.region || null, gw: t.cap.gw || 0, gh: t.cap.gh || 0 } : null,
      updates: t.updates.map((u) => (u.kind === "screenshot" ? { at: u.at, kind: u.kind, text: u.text } : u)),
    });
    for (let budget = PERSIST_MAX; budget >= 0; budget = budget > 64 * 1024 ? Math.floor(budget / 2) : -1) {
      const out = list.map(meta);
      let size = JSON.stringify(out).length;
      let kept = 0;
      for (let i = out.length - 1, rank = 0; i >= 0; i--, rank++) {
        const t = list[i];
        const o = out[i];
        const add = (k, v) => {
          const n = Array.isArray(v) ? v.reduce((a, f) => a + imgLen(f), 0) : v && Array.isArray(v.frames) ? v.frames.reduce((a, f) => a + imgLen(f), 512) : imgLen(v);
          if (!n || size + n > budget) return false;
          o[k] = v;
          size += n;
          return true;
        };
        if (rank >= IMG_KEEP) break;
        add("after", t.after);
        add("before", t.before);
        // the replay (its frames) before the GIF made of them
        const replayOk = rank < GIF_KEEP && !!t.replay && add("replay", t.replay);
        const gifOk = !replayOk && rank < GIF_KEEP && t.gif && t.gif.bytes <= GIF_PERSIST_MAX && add("gif", t.gif);
        if (!gifOk && !replayOk && t.frames) add("frames", t.frames);
        if (o.before || o.after || o.gif || o.frames || o.replay) kept++;
      }
      const json = out.length ? JSON.stringify(out) : null;
      if (ls.set(TASKS_KEY, json)) {
        state.persist = { at: now(), chars: json ? json.length : 0, budget, withImages: kept, tasks: out.length, writes: (state.persist ? state.persist.writes : 0) + 1 };
        return;
      }
    }
    note("persist", "localStorage full");
  }
  function restore() {
    const v = ls.json(TASKS_KEY, []);
    if (!Array.isArray(v)) return;
    for (const t of v) {
      if (!t || !t.id || !t.status) continue;
      t.updates = Array.isArray(t.updates) ? t.updates : [];
      for (const u of t.updates) {
        if (u.kind !== "screenshot") continue;
        const img = u.text === "before" ? t.before : u.text === "after" ? t.after : null;
        if (img) u.dataUrl = img.dataUrl;
      }
      t.updates = t.updates.filter((u) => u.kind !== "screenshot" || u.dataUrl);
      t.seenMsgIds = Array.isArray(t.seenMsgIds) ? t.seenMsgIds : [];
      const c = t.cap && typeof t.cap === "object" ? t.cap : {};
      t.cap = newCap(t.info || null, false);
      t.cap.region = c.region || null;
      t.cap.gw = c.gw || 0;
      t.cap.gh = c.gh || 0;
      for (const k of ["model", "effort", "modelId", "effortId", "gif", "frames", "shot", "replay", "captureError", "captureErrorShot"]) if (t[k] === undefined) t[k] = null;
      t.idleTicks = 0;
      t.afterTryAt = 0;
      t.liveRun = false; // its tool calls so far are not news
      t.ingested = false;
      if (!t.toolSeen || typeof t.toolSeen !== "object") t.toolSeen = {};
      if (t.status === "queued") {
        t.status = "failed";
        t.why = "interrupted";
        t.error = WHY.interrupted;
        t.finishedAt = now();
      }
      tasks.push(t);
    }
    trim();
  }

  // -------------------------------------------------------------------- UI
  const CLAUDE_SVG =
    '<svg class="rcca-logo" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false"><path fill="#D97757" fill-rule="nonzero" d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"/></svg>';
  const CHECK_SVG =
    '<svg class="rcca-check" viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true" focusable="false"><path d="M2.5 6.25 5 8.75l4.5-5.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const WARN_SVG =
    '<svg class="rcca-warn" viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true" focusable="false"><circle cx="6" cy="6" r="4.75" stroke="currentColor" stroke-width="1.2"/><path d="M6 3.6v3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="6" cy="8.4" r=".7" fill="currentColor"/></svg>';

  let root = null;
  const rows = new Map(); // task id -> { btn, ico, author, body, time, st }

  function fmtElapsed(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }

  function openChat(id) {
    const task = typeof id === "object" && id ? id : tasks.find((t) => t.id === id);
    const st = W();
    const tab = task && st && task.chatId ? tabOf(st, task.workspaceId, task.chatId) : null;
    if (!task || !st || !tab) return false;
    try {
      // opened on purpose: a tab like any other from now on
      task.revealed = true;
      ownSelectUntil = now() + 1000;
      st.setActiveNavRoute("chat");
      if (tab.isArchived === true && typeof st.unarchiveChatTab === "function") {
        st.unarchiveChatTab(task.workspaceId, task.chatId); // selects it too
        task.chatArchived = false;
        const s2 = W();
        if (s2 && s2.activeCenterTabId !== task.chatId && typeof s2.selectWorkspaceChat === "function") s2.selectWorkspaceChat(task.workspaceId, task.chatId);
      } else if (typeof st.selectWorkspaceChat === "function") st.selectWorkspaceChat(task.workspaceId, task.chatId);
      else {
        if (typeof st.selectWorkspace === "function") st.selectWorkspace(task.workspaceId);
        if (typeof st.selectChatTab === "function") st.selectChatTab(task.chatId);
      }
      changed();
      return true;
    } catch (e) {
      note("open", e);
      return false;
    }
  }

  const inList = (t, at) =>
    t.status === "queued" ||
    t.status === "running" ||
    t.status === "needs-input" ||
    (t.status === "done" && at - (t.finishedAt || 0) <= DONE_MS) ||
    (t.status === "failed" && at - (t.finishedAt || 0) <= FAIL_MS);

  function mount() {
    const host = Array.from(document.querySelectorAll(SEL.host)).find((h) => h.isConnected);
    if (host) {
      if (root.parentNode !== host) host.appendChild(root);
      root.classList.add("rcca--hosted");
      root.style.left = root.style.width = root.style.bottom = "";
      return;
    }
    root.classList.remove("rcca--hosted");
    if (root.parentNode !== document.body) document.body.appendChild(root);
    let side = null;
    for (const s of SEL.sidebars) {
      side = Array.from(document.querySelectorAll(s)).find((n) => {
        if (!isShown(n)) return false;
        const r = n.getBoundingClientRect();
        return r.width >= 120 && r.left < window.innerWidth / 2;
      });
      if (side) break;
    }
    let left, width, bottom;
    if (side) {
      const r = side.getBoundingClientRect();
      const foot = Array.from(side.querySelectorAll(SEL.foot)).find(isShown);
      const fr = foot && foot.getBoundingClientRect();
      left = r.left + 8;
      width = Math.max(160, r.width - 16);
      bottom = window.innerHeight - (fr && fr.height ? fr.top : r.bottom) + 6;
    } else {
      const rail = Array.from(document.querySelectorAll(SEL.rail)).find(isShown);
      left = (rail ? rail.getBoundingClientRect().right : 0) + 8;
      width = 248;
      bottom = 12;
    }
    root.style.left = `${Math.round(left)}px`;
    root.style.width = `${Math.round(width)}px`;
    root.style.bottom = `${Math.round(Math.max(8, bottom))}px`;
  }

  function rowFor(task) {
    let r = rows.get(task.id);
    if (r) return r;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rcca-item";
    btn.setAttribute("data-rcca-id", task.id);
    const ico = document.createElement("span");
    ico.className = "rcca-ico";
    const line = document.createElement("span");
    line.className = "rcca-line";
    const author = document.createElement("span");
    author.className = "rcca-author";
    const sep = document.createElement("span");
    sep.className = "rcca-sep";
    sep.textContent = " · ";
    const body = document.createElement("span");
    body.className = "rcca-body";
    line.append(author, sep, body);
    const time = document.createElement("span");
    time.className = "rcca-time";
    btn.append(ico, line, time);
    const id = task.id;
    btn.addEventListener("click", () => openChat(id));
    r = { btn, ico, author, body, time, st: "" };
    rows.set(task.id, r);
    return r;
  }

  function render() {
    const t = now();
    const visible = enabled() && !document.documentElement.classList.contains("rtcb-on") ? tasks.filter((x) => inList(x, t)) : [];
    if (!visible.length) {
      if (root) root.remove();
      rows.clear();
      return;
    }
    if (!root || !root.isConnected) {
      root = document.createElement("div");
      root.setAttribute("data-rcca-root", "");
      root.className = "rcca";
      root.setAttribute("role", "status");
      root.setAttribute("aria-live", "polite");
      root.setAttribute("aria-label", "Claude working on canvas comments");
      rows.clear();
    }
    const ids = new Set(visible.map((x) => x.id));
    for (const [id, r] of rows) if (!ids.has(id)) (r.btn.remove(), rows.delete(id));
    let prev = null;
    for (const task of visible) {
      const r = rowFor(task);
      const sig = `${task.status}|${task.chatId || ""}`;
      if (r.st !== sig) {
        r.st = sig;
        r.btn.setAttribute("data-state", task.status);
        r.ico.innerHTML = task.status === "done" ? CHECK_SVG : task.status === "failed" ? WARN_SVG : CLAUDE_SVG; // constant markup
        const logo = r.ico.querySelector(".rcca-logo");
        if (logo && (task.status === "queued" || task.status === "running")) logo.classList.add("rcca-spin");
        const what =
          task.status === "done"
            ? "Done"
            : task.status === "failed"
              ? task.error || "Couldn't start"
              : task.status === "needs-input"
                ? "Waiting for your answer"
                : task.status === "running"
                  ? "Claude is working on this"
                  : "Starting a Claude chat";
        r.btn.title = `${what}: ${task.text}${task.chatId ? "\nClick to open the chat" : ""}`;
        r.btn.disabled = !task.chatId;
      }
      const name = (task.author && task.author.name) || "You";
      if (r.author.textContent !== name) r.author.textContent = name;
      if (r.body.textContent !== task.text) r.body.textContent = task.text;
      const el = fmtElapsed((task.finishedAt || t) - (task.startedAt || task.createdAt));
      if (r.time.textContent !== el) r.time.textContent = el;
      const want = prev ? prev.nextSibling : root.firstChild;
      if (want !== r.btn) root.insertBefore(r.btn, want);
      prev = r.btn;
    }
    mount();
  }

  // ------------------------------------------------------------------- loop
  // The 500 ms tick runs only while there is work: the app's stores not found
  // yet, a task queued / running / waiting, a send in flight, an "after"
  // (10 min at most), a GIF or a thread reply still to come, a row of the
  // mini list on screen. Idle: no timer at all; a comment posted, a reply
  // or setEnabled() start it again.
  let lastScan = 0;
  let tickTimer = 0;
  function needsTick() {
    if (!enabled()) return false;
    if (!F.ws || !F.clients.size || !F.draft) return true;
    if (pending.size) return true;
    const t = now();
    const listUp = !document.documentElement.classList.contains("rtcb-on");
    const ws0 = W();
    const canArchive = !!ws0 && typeof ws0.archiveChatTab === "function";
    for (const x of tasks) {
      if (x.status === "queued" || x.status === "running" || x.status === "needs-input") return true;
      if (x.stoppedAt && isStopped(x) && x.chatId && t - x.stoppedAt < STOP_WATCH_MS) return true;
      const ago = t - (x.finishedAt || 0);
      if (x.status === "done" && (!x.after || (x.shot && x.shot.provisional)) && x.afterDueAt && ago < AFTER_MAX_MS) return true;
      if (x.status === "done" && x.cap && x.cap.live && !x.cap.gifDone) return true;
      if (x.status === "done" && !x.replied && x.threadId && replyOn() && ago < REPLY_WAIT_MS + 5000) return true;
      if (listUp && TERMINAL_ROW.has(x.status) && ago < FAIL_MS) return true;
      if (canArchive && TERMINAL_ROW.has(x.status) && x.chatId && !x.revealed && x.chatArchived == null && (x.archiveTries || 0) < ARCHIVE_TRIES && ago < 30 * 60 * 1000) return true;
    }
    if (canArchive && !state.migrated && tasks.length) return true;
    return false;
  }
  const TERMINAL_ROW = new Set(["done", "failed"]);
  function wake() {
    if (!tickTimer && enabled()) tickTimer = setInterval(tick, TICK_MS);
  }
  function tick() {
    if (!enabled()) {
      state.status = "off";
      if (root) root.remove();
      clearInterval(tickTimer);
      tickTimer = 0;
      return;
    }
    state.status = "ready";
    const t = now();
    if ((!F.ws || !F.clients.size || !F.draft || !F.reg) && (scan || t - lastScan > SCAN_MS) && (!F.ws || !F.clients.size || !F.draft || tasks.some((x) => x.status === "queued"))) {
      if (scanStep()) lastScan = t;
    }
    if (tasks.length) track();
    render();
    if (!needsTick()) {
      clearInterval(tickTimer);
      tickTimer = 0;
    }
    state.ticking = !!tickTimer;
  }

  function init() {
    restore();
    window.addEventListener("rtcn:submit", onNoteSubmit);
    // the pending write goes out before the page or the window goes away
    window.addEventListener("pagehide", persistNow);
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && persistNow());
    window.addEventListener("resize", () => root && root.isConnected && mount());
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && wake());
    wake();
    tick();
    if (tasks.length) changed(false);
  }

  window.__RE_TEMPO_COMMENT_AGENT__ = {
    tasks: () => tasks.map(snapshot),
    jobs: () => tasks.map(snapshot), // alias of tasks() (first version's name)
    task(id) {
      const t = tasks.find((x) => x.id === id);
      return t ? snapshot(t) : null;
    },
    subscribe(cb) {
      if (typeof cb !== "function") return () => {};
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    createTask,
    openChat: (id) => openChat(id),
    reply,
    stop,
    stopAll,
    dismiss(id) {
      unwatch(id);
      const n = tasks.length;
      const task = tasks.find((t) => t.id === id);
      if (task && task.chatId && task.workspaceId && !task.revealed && task.chatArchived !== true)
        try {
          const st = W();
          const tab = st && tabOf(st, task.workspaceId, task.chatId);
          if (tab && tab.isArchived !== true && !onScreen(st, task)) state.archive = { at: now(), id, chat: task.chatId, result: archiveChat(st, task.workspaceId, task.chatId), dismissed: true };
        } catch (e) {
          note("archive", e);
        }
      tasks = tasks.filter((t) => t.id !== id);
      if (tasks.length === n) return false;
      changed();
      return true;
    },
    // diagnostics
    state,
    handled: handledList,
    lastPrompt: () => lastPrompt,
    buildPrompt: (id) => {
      const t = tasks.find((x) => x.id === id);
      return t ? buildPrompt(t) : null;
    },
    forget(id) {
      if (id) ls.set(HANDLED_KEY, JSON.stringify(handledList().filter((k) => k !== id)));
      else ls.set(HANDLED_KEY, null);
    },
    setEnabled(on) {
      ls.set(OFF_KEY, on ? null : "off");
      wake();
      tick();
    },
    found: () => ({ ws: !!F.ws, draft: !!F.draft, engine: !!F.reg, clients: F.clients.size, sessions: !!sessStore(), capture: !!(window.bugReportBridge && window.bugReportBridge.captureAppScreenshot) }),
    // the task's chat as the app sees it (what stop() looks at)
    _chat(id) {
      const t = tasks.find((x) => x.id === id);
      if (!t || !t.chatId || !t.workspaceId) return null;
      const key = keyOf(t.workspaceId, t.chatId);
      const st = W();
      const tab = st && tabOf(st, t.workspaceId, t.chatId);
      const s = snapOf(key);
      const sc = controllerOf(key);
      const ss = sessStore();
      const sk = tab && sessionKeyOf(tab, t.chatId, t.workspaceId);
      let completion = null;
      let queued = null;
      try {
        completion = ss && sk && typeof ss.getCompletionStatus === "function" ? ss.getCompletionStatus(sk) : null;
        queued = sc && typeof sc.getQueuedMessages === "function" ? (sc.getQueuedMessages() || []).length : null;
      } catch (_) {}
      let messages = null;
      try {
        const m = ss && sk ? ss.getMessages(sk) : null;
        messages = Array.isArray(m) ? m.length : null;
      } catch (_) {}
      return { phase: (s && s.phase) || null, busy: chatBusy(key), inProgress: inProgress(st, t.workspaceId, t.chatId), completion, requestId: (sc && sc.currentRequestId) || null, queued, host: !!actionsOf(key), archived: tab ? tab.isArchived === true : null, storeKey: sk || null, controllerKey: (sc && sc.storeKey) || null, tabSessionId: (tab && tab.sessionId) || null, messages, watched: subs.has(id) };
    },
    // dry run (see the header): _dry({ rttMs }) on, _dry(false) off (its
    // tasks are dropped); _sim(id, { messages?, status?, error? }) drives a
    // dry task as its chat would: messages in the session store's shape
    // ({ id, role, content, toolCalls }), status running | needs-input |
    // done | failed
    _dry(o) {
      dry = o ? dryOf(o === true ? {} : o) : null;
      if (!dry) {
        const n = tasks.length;
        tasks = tasks.filter((t) => !t.dry);
        if (tasks.length !== n) changed();
      }
      return dry ? { ...dry } : null;
    },
    _sim(id, p) {
      const t = tasks.find((x) => x.id === id && x.dry);
      if (!t || !p || typeof p !== "object") return false;
      // bind = { workspaceId, chatId }: read that live chat's messages (its
      // session controller's key in the session store), as a real task does
      if (p.bind && p.bind.workspaceId && p.bind.chatId) {
        t.bound = { workspaceId: String(p.bind.workspaceId), chatId: String(p.bind.chatId) };
        wake();
      }
      let dirty = Array.isArray(p.messages) && p.messages.length ? readMessages(t, null, null, p.messages) : false;
      const s = p.status;
      if (s === "running" || s === "needs-input") {
        if (t.status !== s) (t.status = s), (dirty = true);
      } else if (s === "done" && t.status !== "done") {
        t.status = "done";
        t.finishedAt = now();
        t.afterDueAt = t.finishedAt + AFTER_DELAY_MS;
        dirty = true;
      } else if (s === "failed" && LIVE.has(t.status)) {
        fail(t, "errored", p.error || null);
        dirty = false;
      }
      if (dirty) changed();
      wake();
      return true;
    },
    _describeTool: describeTool,
    // the chat engine's hosts (one per live chat tab): where each one's
    // messages are (its session controller's key) and how many
    _hosts() {
      const ss = sessStore();
      let list = [];
      try {
        list = F.reg && F.reg.hostsById instanceof Map ? Array.from(F.reg.hostsById.entries()) : [];
      } catch (_) {}
      return list.slice(0, 40).map(([key, h]) => {
        let sc = null;
        try {
          sc = h && typeof h.getSessionController === "function" ? h.getSessionController() : null;
        } catch (_) {}
        const k = sc && sc.storeKey;
        let n = null;
        try {
          n = ss && k ? (ss.getMessages(k) || []).length : null;
        } catch (_) {}
        return { key, storeKey: k || null, sessionId: (sc && sc.sessionId) || null, messages: n };
      });
    },
    _anchorAt: anchorAt,
    _gif: (frames, opts) => encodeGif(frames, opts),
    _modelLabel: modelLabel,
    _voice: voiceOf,
    _replyBody: (id) => {
      const t = tasks.find((x) => x.id === id);
      return t ? replyBody(t) : null;
    },
    _view: () => {
      const v = viewOf(null);
      return v && { ox: v.ox, oy: v.oy, z: v.z, via: v.via };
    },
    _state: (itemId) => {
      const el = itemById(itemId);
      return el ? sbState(el, now()) : null;
    },
    _diffBox: (a, b) => diffBox(a, b),
    // change shots: one storyboard as it is now, rendered at k px per unit
    _render: async (itemId, k = 1) => {
      const el = itemById(itemId);
      const st = el && sbState(el, now());
      if (!st) return null;
      const bm = await renderSb(st, k);
      const cv = document.createElement("canvas");
      cv.width = bm.width;
      cv.height = bm.height;
      cv.getContext("2d").drawImage(bm, 0, 0);
      bm.close();
      return jpegOf(cv, 0.9);
    },
    // change shots: the renderer's counters and a task's capture state
    _shots: (id) => {
      const t = id ? tasks.find((x) => x.id === id) : null;
      const c = t && t.cap;
      return {
        renderer: { up: !!RD.wv, renders: RD.renders, fails: RD.fails, ms: RD.ms.slice(-10), dropMs: RD.dropMs, openMs: RD.openMs, syncMax: RD.syncMax || 0 },
        scene: { ...SC },
        final: state.captures.final || null,
        task: c ? { scene0: c.scene0 ? { at: c.scene0.at, sbs: c.scene0.sbs.size, nodes: c.scene0.nodes.size } : null, states: c.states ? [...c.states].map(([k, v]) => [k, v.length]) : null, track: (c.track || []).length, touched: c.touched ? [...c.touched] : [], wide: !!c.wide, noRender: !!c.noRender } : null,
      };
    },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
