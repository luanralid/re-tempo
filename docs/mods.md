# Mods reference

## Mod index

Flag off = `localStorage.setItem("<key>", "off")` (most are read live; reload if a mod says otherwise). "—" = the file header documents no off switch.

| Mod (`feature/<name>.js`) | What it does | Flag off |
|---|---|---|
| `agent-runs-panel` | Floating Agent Runs panel (read-only) | — |
| `home-title` | Replaces the logged-out HOME heading | — |
| `voice-input` | On-device dictation in the composer and in any field | — |
| `usage-bar` | Plan usage rings / compact footer line | — |
| `effort-levels` | "Extra High" effort for Opus 5 | — |
| `canvas-quick` | Quick access to canvases (documented in the file header) | — |
| `canvas-chrome` | pen.dev-style canvas layout (documented in the file header) | `rtd.canvasChrome` |
| `canvas-keys` | Figma-style single-key shortcuts and a "?" sheet on the canvas | `rtd.canvasKeys` |
| `canvas-snap` | Alt-hold distance measurements between storyboards | `rtd.canvasSnap` |
| `canvas-browser` | Live Browser frames on the canvas | `rtd.canvasBrowser` |
| `canvas-shader` | WebGL shader frames and Effects on the canvas | `rtd.canvasShader` |
| `canvas-export` | Code and Export sections in the canvas right panel | `rtd.canvasExport` |
| `canvas-comment-agent` | A canvas comment becomes a Claude chat task | `rtd.commentAgent` |
| `canvas-notes` | **Removed from loading (removed: replaced by canvas comments).** Sticky notes on the canvas that run as prompts | `rtd.canvasNotes` |
| `profile-page` | Settings API for mods and Settings > Profile | `rtd.profilePage` |
| `decision-model` | TypeSafe "Jev" decision-model client and comment triage | `rtd.decisionModel` |
| `pane-dock` | Free pane layout (documented in the file header) | — |
| `zoom` | Toast with the native zoom level | — |
| `bg-tasks` | Background tasks shown inside the conversation | — |
| `canvas-autosetup` | Starts canvas setup by itself (once per workspace, through the app's own "Set up canvases" button): on the Design home, from the disabled "New canvas" (click, Enter, ⇧C) and when a new project/workspace without setup is opened. An empty repo also gets "scaffold a minimal Vite + React + TypeScript app first" in the prompt | — |
| `sidebar-chats` | Every chat tab in the Chats sidebar, one card per workspace | `rtd.sidebarChats` |
| `comment-bubbles` | Designer's view of comment tasks, next to the canvas name pill | `rtd.commentBubbles` |
| `agent-cursors` | Multiplayer-style cursors for running comment agents | `rtd.agentCursors` |
| `agent-follow` | Figma-style follow of a running comment agent | `rtd.agentFollow` |
| `project-sidebar` | Project-oriented left sidebar (documented in the file header) | `rtd.projectSidebar` |
| `tab-close` | Close button on every center tab, primary chat included | — |
| `rail-menu` | Gear menu in the rail (documented in the file header) | — |
| `title-crumb` | Full breadcrumb in the window header (documented in the file header) | `rtd.titleCrumb` |
| `canvas-paste` | Pasted images land at the pointer (documented in the file header) | — |
| `ui-beam` | Beam animation for agent UI actions | `rtd.uiBeam` |
| `ui-drive` | Lets an agent drive the Tempo UI (+ `bin/tempo-ui` CLI) | `rtd.uiDrive` |
| `app-map` | Live map of everything actionable on screen | `rtd.appMap` |
| `smart-suggestions` | Four context-aware cards in the new-chat empty state | `rtd.smartSuggestions` |
| `window-frame` | Closes the central panel's frame at the bottom and right of the window (rounded corners, borders, inset) | `rtd.windowFrame` |
| `canvas-nodes` | Shared helper: frame/note storage in the canvas file (not in the load list; loaded by `canvas-browser`, `canvas-shader`, `canvas-notes`) | `rtd.canvasNodes` |

## Load order

Copied from `MODS` in `tools/inject-index.mjs`. One `<link>` (when `feature/<name>.css` exists) then one `<script>` per entry, in this order, inside the live block before `</body>`:

```
agent-runs-panel, home-title, voice-input, usage-bar, effort-levels,
canvas-quick, canvas-chrome, canvas-keys, canvas-snap, canvas-browser,
canvas-shader, canvas-export, canvas-comment-agent, canvas-notes,
profile-page, decision-model, pane-dock, zoom, bg-tasks, canvas-autosetup,
sidebar-chats, comment-bubbles, agent-cursors, agent-follow,
project-sidebar, tab-close, rail-menu, title-crumb, canvas-paste,
ui-beam, ui-drive, app-map, smart-suggestions, window-frame
```

Order matters in one documented place: `canvas-export` must load before `project-sidebar`, because both bind Cmd+Shift+E on window capture and the first registered listener wins.

## Mods documented in their own file

`pane-dock` (free pane layout), `project-sidebar` (project-oriented left sidebar), `canvas-quick` (quick canvas access), `canvas-chrome` (pen.dev-style canvas layout), `rail-menu` (gear menu in the rail), `title-crumb` (header breadcrumb) and `canvas-paste` (paste at the pointer) are documented in the header comment of their own `feature/<name>.js`. Only `canvas-quick` and `pane-dock` have older sections below.


The first mod: a floating **Agent Runs** panel injected into the RE-TEMPO renderer
(an editable copy of the user's own Tempo). It reads the agent runs of the **already logged-in**
account, reusing the real session, and shows:

- **Total runs** and **active now**;
- **Breakdown by status** (done / running / failed / queued / cancelled …) with bars;
- **Average duration** and **summed cost**;
- **Empty state** and **error state** (with retry) handled.

It is **read-only**: it only calls Convex *queries*, no mutation/write.

## Files (original work, versionable)

| File | What it is |
|------|------------|
| `agent-runs-panel.js`  | self-contained module: UI, data, ⌘⇧A shortcut, launcher |
| `agent-runs-panel.css` | styles scoped under `[data-rar-root]` (`rar-` prefix) |
| `feature/APPLY.md`     | how to inject into `index.html` (exact line) and how to revert |

Injection: 1 line `<script src="./agent-runs-panel.js">` before `</body>`. No repack
(RE-TEMPO runs from the folder). See `feature/APPLY.md`.

## How it reuses the logged-in session

1. Finds the **already-authenticated** `ConvexReactClient` in the React tree and calls
   `client.query(ref, args)`, reusing the user's logged-in WebSocket — the **path used in the
   test**.
2. Fallback: token via `window.authBridge.getToken()` + Convex `POST .../api/query`.
   The token is never persisted and never leaves the app's own backend.

Queries: `agentRuns:listMyActiveRuns`, `agentRuns:listMyRecentlyFailedRuns`,
`organizations:getUserOrganizations`, `agents:listMyAgents`, `agentRuns:listRunsForAgent`.

## Real test (CDP, logged-in app)

Run on RE-TEMPO in **normal mode (real profile, logged in)** with
`--remote-debugging-port=9333`, via the Chrome DevTools Protocol:

- The panel loads, the launcher mounts, the shortcut works.
- Data path: **`live-convex-client`** (logged-in client reuse, confirmed).
- Real result for the account: **0 runs** (active, failed and history) and **12 agents**
  configured → the panel shows the **correct empty state** (`evidence/agent-runs-panel.png`).
- The account simply has no runs at the moment; the backend responded successfully.

## Evidence (`../evidence/`)

| File | What it shows |
|------|---------------|
| `agent-runs-panel.png`         | **real data**: empty state (0 runs, 12 agents), logged-in session |
| `agent-runs-panel-preview.png` | **preview with synthetic data** (labeled): populated layout — total, status, duration, cost |

> The preview uses `__RE_TEMPO_AGENT_RUNS_PREVIEW__(summary)` with made-up numbers, only to
> show the populated layout; they are **not** real account data. The screenshots were
> cropped to the panel (clip on the bounding rect), so they capture no app content and
> no personal data.

## Dictation in the composer (`voice-input.js` / `voice-input.css`)

Microphone button in the composer bar, before send/stop. Click to record: the words
appear in the editor **as you speak**. Each new word comes in with blur→sharp, a fade and a
slight rise; volatile words are dimmer until they settle, and corrections swap the text in
place, without flicker. With `prefers-reduced-motion`, words only fade in. Click again to
end the speech: the final text stays in the editor, at the same spot, and is **not sent**.

- **Engine:** on-device macOS transcription (`SpeechAnalyzer` + `SpeechTranscriber` with
  volatile results, macOS 26+). No network and no key. Partials arrive in chunks of
  ~1 s of audio. Electron's Web Speech API yields `network`, and `SpeechRecognition.available()`
  takes the renderer down, so do not use it. `DictationTranscriber` is faster, but got pt-BR wrong.
- **Flow:** the mic is captured in the renderer (getUserMedia) and an AudioWorklet produces
  16 kHz PCM in 100 ms chunks. Those chunks go through the pty's stdin (`terminalBridge`) to a
  Swift CLI, which replies `RTV:{json}` with the partials and the final. The CLI does not open the mic.
- **Live text:** lives in a ProseMirror decoration widget at the cursor position. It does
  not enter the doc or the undo history and becomes real text at the same spot when the speech ends.
  The composer uses a pool of TipTap editors: in the workspace chat (e.g. with tasks running),
  it may destroy the editor and mount another one in the middle of a speech. So, on every partial and
  every 200 ms, the widget checks which editor is the composer's current one and moves to it. Before
  that, the live text vanished and only the final text appeared, without animation.
- **CLI:** compiled once with `xcrun swiftc` from the source embedded in the `.js`, so it
  requires Xcode or the Command Line Tools. Cached at `/tmp/re-tempo-voice/stt-<hash>`.
  Hovering the button already speeds up the compilation. On first use, text only appears once it
  finishes.
- **Settings:** live in **Settings › Dictation**, a new item in the "Personal" group of the
  Settings nav, with the same classes as the native sections. While the section is open, the native
  content is hidden; clicking any native item gives the screen back to the app. Right-clicking the
  mic opens this section directly. It has:
  - **Engine:** segmented control like "Appearance", with "Apple Speech (accurate)"
    (`SpeechTranscriber`, the default) and "Apple Dictation (fast)" (`DictationTranscriber`). Dictation
    carries the warning that it got pt-BR wrong a lot. Each engine has its own language list.
    In tests, Dictation showed the 1st word in 0.96 s in EN, versus 1.36 s for Speech.
  - **Language:** field that opens the list, with Portuguese (Brazil) and English (US) on top and ↓ on
    languages that are not installed. If the model is missing, the CLI downloads the assets (AssetInventory) and shows
    "Downloading language… N%". With no choice, `navigator.language` applies, and there is no auto-detection
    after a choice.
  - **Test microphone:** records 3 s and shows the text with the same animation.
  - Persistence in `localStorage["re-tempo:voice-lang"]` and `["re-tempo:voice-engine"]`.
- **Composer:** only the mic. The tooltip, styled like the composer's tooltips, shows the current language
  and engine (e.g. "Dictation · Portuguese (Brazil) · Apple Speech"). ⌥-click toggles
  PT↔EN and is not shown in the interface.
- **Microphone:** macOS asks for the permission (TCC) for `com.re-tempo.app` on first real use.
- **Debugging:** `window.__RE_TEMPO_VOICE__.state()`, `.timeline()` (partials of the last speech)
  and `.langs()` (supported/installed).

## Plan usage in the sidebar, in 3 levels (`usage-bar.js` / `usage-bar.css`)

Shows plan usage (not the context window) in Orca's style, as a footer at the bottom of **every
section sidebar** (Chat, Docs, Design, Issues, Agents), with no bar in the window footer and nothing
in the composer. All footers share one state, one poller and one helper. The logos are inline SVG
using `currentColor` (lobehub icons, MIT, the same ones as Orca). Bar colors: Claude `#D97757`,
Codex `#bababa`, amber at ≥80%, red at ≥95%.

The Chats "+ Add project" button is hidden (the React node is kept); projects are still added via
the ⋮ "Chat list options" → Add project.

1. **Text line** in the sidebar footer, in the flow (the footer grows and the list above shrinks;
   "Getting started" stays visible): `[Claude logo] 29% used 3h 2m  [OpenAI logo] 0% used 5d 5h`.
   It shows the window under the most pressure (highest %). If it does not fit the column width,
   Codex becomes just the % and then disappears (`full` > `codex-short` > `claude` > `compact`);
   Claude never disappears. With the sidebar collapsed, the line disappears with it. The line has no
   refresh button (the popover header keeps it).
2. **Click: "Usage" popover**, opened upward and anchored to the line, with ↻ and one row per
   account with local data
   (`Claude Max 20x · 3h 34m · 23% ›`, `Codex · 5d 5h · 0% ›`). Esc or a click outside closes it;
   ↑/↓ arrows navigate. "Usage details & history" and "Manage Accounts" were left out (there are
   no screens for them).
3. **Hover/focus/click on a row: side panel** with "Updated … ago" and each window with a bar:
   Session (5h), Weekly and per-model weekly limits, plus "Resets in …" and the account (label +
   file). Click pins the panel. The **Fable** row always appears for Claude ("—" and "No per-model
   data yet" while the helper has not run); Opus/Sonnet only appear if they come in the file. The
   parser accepts `seven_day_<model>` and the `model_scoped` array (`[{display_name,
   utilization|used_percentage, resets_at}]`); buckets the CLI itself does not display
   (`oauth_apps`, `cowork`, `overage_included`, `omelette`) are left out.
   - **Where Fable comes from:** Claude Code's statusline (2.1.301) only receives `five_hour`,
     `seven_day` and, on a gateway, `spend_limit`. Per-model limits come from `api/oauth/usage`
     (`limits[]`), which the CLI exposes as `rate_limits.model_scoped` in the Agent SDK's `get_usage`
     control request. The helper below fetches it.

The context ring's tooltip keeps an extra section below the "Context
window…" lines (the MutationObserver finds the Base UI positioner `[class~="group/tooltip"]` with that text
and appends to the `span.text-label`).

- **Helper `bin/claude-usage-oauth.mjs` (per-model limits):** calls `get_usage` through the
  installed `claude` CLI (the one from `command -v claude` in the login shell) via the Agent SDK in
  RE-TEMPO's bundle. No user message is sent, so there is no model call, and no token is ever read
  by the mod or the helper (it stays with the CLI). It starts without settings (no hooks, plugins or
  statusline), without MCP, without writing a session, without telemetry and without the claude.ai
  connector listing. It writes `~/.local/state/claude-usage/oauth-usage.json` (0600, tmp + rename)
  with `updated_at`, `account` (email, org, plan), `five_hour`, `seven_day` and
  `model_scoped: [{model, percent, resets_at}]` (Fable included); it has its own lock and a 45 s
  timeout.
  - The mod runs the helper from the pty (`terminalBridge`) with `HOME=<real home>` and `zsh -ilc`,
    when opening the popover if the data is older than 5 min, and every 15 min while the app is
    open (one run at a time).
  - Run by hand, with HOME set to your real home: `node feature/bin/claude-usage-oauth.mjs` (prints
    `RTU:{…}` with no token or email). `RTU_DEBUG_FILE=<file>` passes `--debug-file` to the CLI,
    to check the requests (only `GET /api/oauth/usage`, no `/v1/messages`).

- **Accounts:** the account logged into the installed `claude` CLI. An account known only from
  the statusline shows only if its reading is under 24 h old and its window is still open. Codex
  shows while its window is open. The plan name comes from `get_usage`, never from file names.
- **Sources** (local files only, no credential and no network, read through
  `electronAPI.fs.readDir/readFile/stat`):
  - Claude: `~/.local/state/claude-usage/<account>.json`, written by the user's statusline
    (`~/.local/bin/claude-usage-statusline`) from Claude Code's official `rate_limits`.
    One account per file, newest to oldest. Every key with
    `used_percentage` becomes a window. The account email is not in the file; it shows the label.
  - Codex: the last `rate_limits` line (`token_count` event) of the 3 most recent rollouts in
    `~/.codex/sessions/YYYY/MM/DD/`, cached by `mtime`; the plan comes from `plan_type`.
- **Freshness:** the data is as good as what the CLI last saw. An expired window shows as 0% with
  no countdown. With no file: "—".
- **HOME:** RE-TEMPO runs with an isolated HOME (`~/RE-TEMPO/_home`), so the mod uses the
  real home folder at the start of the app's HOME path. To force another path:
  `localStorage.setItem("re-tempo.usage.home", "/path/to/home")`.
- **Cycle:** reads on load, every 5 min, on ↻ and when opening the popover/tooltip if the data is older
  than 1 min; countdowns are recomputed every 30 s, without reading the disk.
- **Injection:** `<link rel="stylesheet" href="./mod/usage-bar.css">` and
  `<script src="./mod/usage-bar.js"></script>`.
- **Debugging:** `window.__RE_TEMPO_USAGE__.state.accounts` and `window.__RE_TEMPO_USAGE__.refresh()`.

## "Extra High" effort for Opus 5 (`effort-levels.js`)

In the composer, with **Opus 5 1M** (or Opus 5), the Effort menu gains **Extra High** (`xhigh`) between
High and Max. The item behaves like the native ones: a check on the selected one, an "Extra High" label
on the button and persistence (the value goes to the same store, e.g. `tempo-chat-input-drafts` →
`modelDefaults.effort = "xhigh"`, and survives a reload).

- **Why it was missing:** Tempo's bundle only allows xhigh for a fixed list of models
  (opus-5.5-1m, sonnet-5.5-1m, fable-5.x, opus-4.7/4.8) in 3 places: the menu list, the Set that
  `tK()` uses to downgrade xhigh → high when creating a chat from the defaults, and the Set for the model
  switch. The bundled CLI (Claude Code 2.1.280) accepts `--effort xhigh` and only refuses xhigh on
  opus 4.0–4.6, sonnet 4.0–4.6, haiku 4.5 and claude-3; `claude-opus-5` is not on that list.
- **Path to the CLI:** `chatTab.effort` → `aiChatBridge.sendMessage(..., { effort })` (no
  per-model filter in the renderer) → IPC `send_message` (the type already accepts `'xhigh'`) → Agent SDK
  (`if (options.effort) argv.push("--effort", effort)`) → `claude --effort xhigh`.
- **How it works:**
  - Menu: a MutationObserver injects the item when the menu opens (a clone of the "High" item) and, on click,
    calls the selector's own `onEffortChange("xhigh")`, read from the React fiber. Then it closes the
    menu with Escape.
  - Label: the app shows "Medium" for ids outside its list, so the mod rewrites the text and the
    button's `aria-label` while the effort is xhigh and gives the native label back when it changes.
  - Bundle Sets: the script runs before the bundle (the module is evaluated ~40–100 ms after
    `DOMContentLoaded`) and wraps `Set.prototype.add` until the 2 capability Sets are
    created. On seeing the `opus-4.7-1m` marker, it adds `opus-5-1m` and `opus-5` and then
    restores the native `add` (safety net: 10 s).
- **Models:** the `XHIGH_MODELS` constant (today `opus-5-1m`, `opus-5`). Sonnet 5 1M is in the same
  situation and can be added to the list.
- **Limits:** the keyboard (arrows) does not reach the injected item; to pick it, use the mouse. The
  Agents editor's selector uses a different component and was not changed. If the account's server
  says the model does not support xhigh, the CLI itself downgrades the level.
- **Ultracode:** CLI 2.1.280 has the mode (`ultracode` keyword in the prompt, `ultracode: true` settings
  key and `/effort ultracode`), but it depends on workflows being enabled
  for the account (`allow_workflows`/availability). The clean path would be for main to pass
  `settings: { ultracode: true }` to the SDK, and main is out of the mod's scope. **Not implemented.**
- **Model name without " 1M":** the same file strips the " 1M" suffix (context window) from the
  text rendered in the model selector buttons (composers, Agents editor and Settings)
  and in the menus. In the menu, if the same group (provider) has the non-1M variant, the 1M item gets
  a gray "1M ctx". The model id/value does not change.
- **Injection:** `<script src="./mod/effort-levels.js"></script>` (no CSS: it uses the app's own
  classes).
- **Debugging:** `window.__RE_TEMPO_EFFORT__.state()` → `patchedSets` (expected 2), `setPatch`
  (`done`), visible selectors with `model`/`effort`.

## Quick access to canvases (`canvas-quick.js` / `canvas-quick.css`)

Canvases no longer depend on the "Open" modal:

- **"Canvases" button** (just the app's canvas icon) at the right end of the tab bar,
  immediately left of "Open in split view", with the same classes as it (size, color,
  hover, radius) and the same visual tooltip ("Canvases"). In split, when the toggle disappears, the button
  sits in its own group at the end of the main panel's bar. Clicking opens a light
  **slide-over**, anchored to the panel's right edge and just below the tab bar (without covering it),
  with the canvases of the selected workspace's project: name,
  project and when it was edited (or opened, if more recent). It has a filter at the top (auto
  focus, ↑↓ and Enter), **New Canvas** (disabled with the same reason as the app when the
  workspace has no setup) and **Search all…** (opens the original modal). Esc, a click outside or
  choosing an item closes the panel.
- **"Open ›" submenu** in the "+" menu: on hover (or → with "Open" highlighted) the
  8 most recent canvases and **Search all…** appear. Clicking "Open" still opens the modal.
  The keyboard works through virtual navigation (↑↓ Enter ← Esc) and focus stays on the app's menu, which
  therefore does not close.
- **Data (read-only)**, as the Open modal's hook builds the list:
  - local overlay of the source-repo store that the bundle itself exposes at
    `window.__sourceRepoDataStoreDebug` (`getLocalOverlay`, `projectInfo`,
    `getWorktreeBranches`, `subscribeLocalOverlay` to update with the panel open);
  - the Convex queries `sourceRepo:getProjectCanvases` and `sourceRepo:getCanvasesForBranches`,
    through the already logged-in `ConvexReactClient`;
  - the selected workspace and the project name, via `electronAPI.persist.getItem("tempo-workspaces")`;
  - "edited": the app's `lastModifiedAt`, otherwise the `mtime` of `<canvas>/index.canvas.tsx`
    (`electronAPI.fs.stat`); "opened": `localStorage["tempo:design-tab:recent:<id>"]`.
  The merge and dedupe are the modal's (by `canvasPath`, preferring the current branch and without the
  `deleted` ones). Order is most recent (edited or opened) to oldest.
- **Opening:** calls the same `onOpenCanvas` that the app passes to the modal (a `useCallback` in the
  tab bar's ancestor). It opens the canvas tab or, if the canvas is on another
  branch, the app's branch selector. Plan B: opens the hidden modal (`opacity: 0`) and clicks
  the item; if the item does not appear, the modal becomes visible. The mod makes no mutation of its own.
- **Validation (2026-10-16):** isolated instance on CDP 9440 (HOME/userData in
  `/tmp/tempo-canvas`) with a test guard that blocked every Convex Mutation/Action. The
  project was an already registered one (`QA-AUTO-design-x1`), pointing to a local fixture repo with
  12 canvases. Button, slide-over, filter, ↑↓/Esc/click outside, opening via the app's callback and
  via plan B, and the submenu with mouse and keyboard were tested. Opening a canvas generated
  no mutation. The evidence is in `/tmp/tempo-canvas/shots/`.
- **Limits:** only the main tab bar gets the button (the split's right panel does not);
  in split, the slide-over anchors to the main panel's right edge.
  The list covers the selected workspace's project, like the modal. Detecting `onOpenCanvas`
  depends on bundle property names (`originatingWorkspaceId`, `canvasName`); if a
  Tempo update changes that, plan B kicks in.
- **Left rail order:** the rail shows Design second (chat, design, docs, issues, agents), using CSS
  `order` only. Ctrl+1…5 still follow the app's original order.
- **Injection:** `<link rel="stylesheet" data-rar-css href="./mod/canvas-quick.css">` and
  `<script src="./mod/canvas-quick.js"></script>` (in `tools/inject-index.mjs`).
- **Debugging:** `window.__RE_TEMPO_CANVAS_QUICK__.load()` (current list),
  `.state.openedVia` (`app-callback` | `hidden-modal`) and `.findAppOpenCanvas()`.
- **Several canvases at once (2026-10-19):** the "+" item reads **New canvas** and creates one (the app's
  own New Canvas, in a new tab; when the app makes the folder but cannot open it, as on a symlinked
  workspace path, the new folder is opened here); a pane-dock pane's "+" does the same. In the
  canvas switcher, a canvas open in a tab brings that tab forward and any other one opens in a new
  tab (the in-place swap is gone). `tab-close` pins every canvas tab, so none replaces another.
- **Empty canvas cleanup (2026-10-19):** only a canvas New canvas made is ever a candidate
  (`localStorage["rtd.canvasQuick.made.v1"]`: workspace path and folder, with the file's mtime). It is
  deleted (the app's own delete, a toast) only when its `index.canvas.tsx` still has that mtime and is
  the app's scaffold (no storyboard, no node), nothing else is in its folder, no canvas mod or comment
  refers to it, and no tab of any chat or workspace has it open, 2 s after its last tab closes. A
  canvas that already existed is never looked at; an edited one leaves the list for good.
  `.cleanup.made()` lists the candidates. Evidence: `evidence/project-sidebar/real-canvases*`,
  `real-13*`, `real-14*`.

## Free pane layout (`pane-dock.js` / `pane-dock.css`)

Orca-style free layout. Dragging a tab over a pane shows a drop overlay: the edges (25%) create a
split in that direction, the center moves the tab into that pane, and dropping on a tab bar
moves/reorders it. Splits can be nested, dividers are resizable, closing the last tab collapses the
pane, and the layout is saved per workspace (`localStorage`) and restored on reload.

- **How it works:** each pane is a virtual container of the app's own popout "transferred tabs"
  store. No bundle edits and no React DOM reparenting.
- **Limits:** moving a tab remounts its content once (a terminal reconnects, a browser reloads);
  new panes have no "+" of their own; tested with a single workspace; the MCP tab is not docked.
- **Deck API for other mods:** `window.__RE_TEMPO_DECKS__.list(ws)` gives each deck's `tabs` (its
  members: every live tab of the workspace is some deck's member, chat history included, so members
  are not open tabs), its center chat and tab (`chat`, `center`) and its `layout`: the leaves in screen
  order, `{ pane: "main" }` for the center and `{ pane, tabs, active }` for each pane with an open tab
  (the live panes for the deck on screen, its stored arrangement otherwise). `project-sidebar` lists a
  branch's open tabs from it.

---

# Mods added 2026-10-18

Each section below is taken from the mod's header comment and checked against the code. Behavior not stated there is not described. Unless noted, a mod has a `.css` beside it and is injected by `tools/inject-index.mjs`.

## Comment agent pipeline (`canvas-comment-agent.js`)

A comment you post on a canvas becomes a task for a Claude chat. The mod wraps `mutation` on the logged-in Convex client and acts on the call to `comments:createThread` (new thread) or `comments:addComment` (reply), that is on the user's Enter, not when the server answers; once per comment (`rtd.commentAgent.handled`). Only what this window's user posts triggers it.

- **Launch (on Enter):** the task (id `h:thread:<time36>` / `h:reply:<time36>`) is in the store, `queued`, in the same tick, and `rtcc:launch` `{taskId, text, rect, pin, source: "comment", capturing}` goes out for the avatar and the cursor. The chat starts at once, in parallel with the server's answer, "before" and the author lookup; it waits only for what its prompt needs (the author's name, cached after the first comment, 250 ms at most; a reply's thread, 1.5 s at most). Only the chat's create step is serialized with other sends. When the server answers, the task gets the thread's ids (`postedAt`); if the comment was not posted, the task is stopped and fails with "The comment wasn't posted".
- **Run:** the chat is created and submitted in the background through the app's chat orchestrator, and the user's tab is put back in the same tick, so the user stays on the canvas. The prompt carries the comment, canvas, storyboard, anchor, element and branch, plus what the agent can do through `ui-drive` and `canvas-nodes` (a static list when those mods are absent).
- **Status:** `queued` (at most 20 s) > `running` > `needs-input` > `done` | `failed`, from the workspaces store and the chat session store. A 500 ms tick runs only while there is work.
- **Stream:** while a task runs, the chat session store's own `subscribe(key, cb)` wakes a read of its messages (at most every 90 ms). Each tool call that starts or ends sets `task.activity` and sends `rtcc:activity` `{taskId, id, tool, phase, status, kind, label, file?, storyboard?, point?, nodeId?}`: kind `read`, `edit`, `style`, `create`, `canvas`, `layout`, `check`, `shot`, `node`, `click`, `run`, `web`, `plan` or `other`, with a short label ("Styling Hero.tsx"). `tempo-ui` canvas commands carry their x / y and id. `agent-cursors` plays them. The messages are read under the key of the chat's own session controller (`getHost({workspaceId, chatTabId}).getSessionController().storeKey`, `__host_pending_…` until the CLI session exists): a background chat writes there, not under its tab's `sessionId` (the old key saw no tool call of a real run).
- **Contract (for agent-cursors):** `rtca:launch` `{taskId, agent, pinRect, composerRect, rect, anchor, canvasName, source, capturing, at}` in the task's first tick; `rtca:thinking` (running, no tool call open); `rtca:action` `{taskId, id, kind, label, target: {file, storyboardName, nodeId, selector, rect, x, y, fallback?}, source: "stream" | "canvas", matches?}` for each call that changes the canvas (target: the box a `.canvas.tsx` edit declares, the storyboard it names, tempo-ui's x / y or frame, the comment's storyboard, else its pin), and from the canvas itself when a storyboard appears, moves or is resized during a task; `rtca:action-end`; `rtca:needs-input`, `rtca:done`, `rtca:failed`. Full shapes in the file's header.
- **Screenshots (change shots):** the pictures show what the agent changed, not the pin, at their own resolution, whatever the user's zoom or camera.
  - *Scene:* on Enter the canvas's storyboards are snapshotted (each projection document's HTML; the shared `<head>` kept once) in idle slices of ≤ 4 ms, together with the window capture of the visible canvas and its world→screen mapping. While the task runs, every 1.5 s a storyboard whose HTML or box changed becomes a state (8 per storyboard, 4 MB per task at most).
  - *Change and frame:* at the end (3 s after `done`), new / moved / resized / removed storyboards and mod frames, and edited storyboards (their HTML); a change another task named, and this one did not, is that task's. An edit in a big storyboard (> 900 units, or < 2 % of it) is located by a pixel diff of two 160 px renders and framed with part of its storyboard; otherwise the whole storyboard is framed, the edit highlighted. The frame is the union of the changes (and where a moved one was), plus the pin when that does not make it more than 2.5x bigger, padded, at least 240 units, ratio 0.56–2.2.
  - *Rendering:* a hidden `<webview>` (in-memory partition `rtcc-shots`, fixed at the window's top-left, opacity 0, under everything: a guest off the viewport never paints) gets each storyboard's document (`about:blank` + `document.write`; `data:` URLs are refused), its zoom factor set so it draws at the frame's density, and `capturePage()`. The only synchronous step is `toJPEG` (≤ 2 ms per render). Mod frames (browser, shader) come from a window capture where it showed them, else a labelled outline.
  - *Output:* `task.after` (hero, up to 960x1280 px, ≥ 2x its card width), `task.before` (same frame and size; `null` when nothing was there: `shot.empty`), `task.shot` `{v: 2, frame, boxes (changed areas in fractions, kind new | edited | moved | removed), pin, empty, src: offscreen | mixed | window, k, note}` and `task.replay` `{w, h, durMs ≤ 6000, frames: [{dataUrl, t}], cursor: [{t, fx, fy, kind, label}]}` (before, the states in between, after, at ≤ 640 px; the agent's cursor from its canvas actions, else from the pin to each change). The thread reply's GIF is made of the replay's frames.
  - *Fallbacks:* no `<webview>` -> the old window crop of the pin's region once it is on screen; still nothing 20 s after `done` -> the run's last frame, said so in `shot.note`. The canvas not mounted -> tried again every 2 s for 10 min, and past 20 s the run's last frame as a provisional after (`shot.provisional`), replaced when the change renders. (A canvas in a background tab stays mounted: it renders.)
  - "before" of the pin's region is still taken on Enter for the live preview while the agent works (the pins hide ~0.1 s, then `rtcc:captured`); frames while running are window crops (`createImageBitmap` from a Blob, `toBlob`). Capture failures leave a note and `captureError`. Persisted in `localStorage` within a 2M-character budget, newest first: after and before for 12 tasks, the replay (else the GIF) for 3.
- **Thread reply:** when a run is done, its result is posted to the comment thread with `comments:addComment` (so it is authored by the signed-in user), ending with a marker line that `comment-bubbles` renders as Claude's message. The after image and the GIF are attached natively. Off with `rtd.commentAgent.reply` = `off`.
- **Fallback UI:** a compact list over the left sidebar, hidden while `html.rtcb-on` is set (comment-bubbles).
- **Off switch:** `localStorage["rtd.commentAgent"] = "off"`. Change shots only: `localStorage["rtd.commentAgent.shots"] = "off"` (the window path as before, read live; comment-bubbles falls back to Before | After on tasks without `shot`).
- **API:** `window.__RE_TEMPO_COMMENT_AGENT__` with `tasks()`, `task(id)`, `subscribe(cb)`, `openChat(id)`, `reply(id, text)`, `dismiss(id)`, `createTask(payload)` (used by canvas-notes), `jobs()`, `state`, `handled()`, `lastPrompt()`, `forget()`, `setEnabled()` and `found()`. Events `rtcc:changed`, `rtcc:launch` (comments), `rtcc:captured`, `rtcc:activity`. Tasks also carry `activity`, `postedAt` and `timing` (`at`, `launched`, `started`, `firstTool`). Test hooks in `window.__RE_TEMPO_COMMENT_AGENT_CFG__`.
- **Dry run (QA on a signed-in account):** `CFG.dryRun = {rttMs}` or `_dry({rttMs})` at runtime (`_dry(false)` off): `comments:*` mutations never reach the server, no chat is created, no thread reply, dry tasks are not persisted; `_sim(id, {messages, status})` drives a dry task as its chat would.
- **Limits:** at most 50 tasks are kept. The renders need the canvas mounted (any camera, any zoom) and see storyboards as their projection documents (no canvas/WebGL pixels inside a storyboard; a mod frame off screen is an outline). A storyboard larger than the window is drawn at the density that fits the window. Window captures depend on `bugReportBridge.captureAppScreenshot()`. The thread reply is authored by the user because the client's `addComment` takes no author.
- **QA hooks (change shots):** `_shots(id)` (renderer counters, the last final shot, a task's scene / states / cursor track), `_render(itemId, k)` (one storyboard now, as a JPEG data URL), `_state(itemId)` and `_diffBox(a, b)`.

## Comment bubbles (`comment-bubbles.js` / `.css`)

The designer's view of the comments they sent. Each task from `canvas-comment-agent` becomes a 28 px bubble in a segment that continues the canvas name pill to its right (same classes, in the row's flow, so it moves with the pill). The designer sees what they sent and what the agent did, never the chat.

- **Bubbles:** author initials inside a status ring plus a corner badge: needs-input (amber, pulsing, "?", sorted first), running (spinning ring, Claude badge), queued (dashed), failed (red, "!"), done (green check, dims after 8 s, moves to "Show resolved" after 1 h). At most 5 and "+N". Each request has a number (#1, #2...).
- **Panel (click a bubble):** header with model and effort, the agent's question when it needs input, "You asked" with the before shot, the agent timeline, a media carousel (side by side, before, after, GIF) and a summary, and a footer with a reply field, "Open chat", "Follow" and "Dismiss". Esc or a click outside closes it.
- **Follow:** Alt-click a bubble or "Follow" fires `rtcb:follow` and calls `__RE_TEMPO_AGENT_FOLLOW__.follow(id)` when that mod exists.
- **Thread messages:** comment messages carrying the pipeline's marker line are drawn as Claude's (avatar, model chip, before/after, GIF player). Messages without the marker are untouched.
- **Dictation:** the reply field uses `__RE_TEMPO_VOICE__.attach` when `voice-input` provides it.
- **Agents in canvas-chrome's slot:** hovering an avatar, or a row of the agents list (the card floats beside the list, ~250 ms of intent, at once from row to row), shows one card (312 px, hoverable): what the agent changed, the after as the hero (its live frame while it works); with `task.replay` the replay plays on its own (frames cross-fading, the agent's cursor and its label, ≤ 6 s, loop, resting on the after; under reduced motion the after only), a "New" badge when nothing was there before (`shot.empty`), the changed areas outlined for a moment; press and hold (or Shift) shows the before, dragging moves a before / after divider, a click opens the lightbox with the same comparison; then "#n · status · time", the request and the last two messages. Tasks without `shot` (older ones) keep Before | After. A click opens the agent's thread in the card when the card is open, else a popover over the avatar; opening the card with that popover open moves the thread into the card. One text box: next to the composer the panel has no reply field of its own; the composer reads "Reply to #N…" / "Answer #N…" (the slot's `data-rtcb-thread*` marks, the field `[data-rtcb-composer-field]`), and Follow, Stop and Dismiss sit in the popover's header.
- **Readable answers:** the agent's last message shows whole, in Markdown (code, bold, lists), 6 lines then "Show more" in place; earlier steps fold into "N steps", which one click opens whole. A failure the last message explains is said once.
- **Mount:** one segment per visible canvas view; a `[data-rtcb-host]` slot (canvas-chrome's file pill) wins over the native pill. No pill, nothing is shown. The UI stays inside the canvas view box.
- **Off switch:** `localStorage["rtd.commentBubbles"] = "off"`. Cache without screenshots in `rtd.commentBubbles.cache`.
- **API:** `window.__RE_TEMPO_COMMENT_BUBBLES__` with `open(id)`, `close()`, `follow(id)`, `unfollow()`, `state()`, `showResolved(bool)`, `refresh()`, `dispose()`.

## Agent cursors (`agent-cursors.js` / `.css`)

Multiplayer-style cursors for the Claude agents working on canvas comments. Every task that is running or waiting for an answer gets an arrow and a tag ("Claude · #N", or "Opus 5.5 · #N") on its canvas, in a stable per-task color (8 slots, kept in `rtd.agentCursors.colors`).

- **Launch (the choreography, ~0.9 s from Enter to the cursor at the comment):** the comment's pin breathes in the agent's colour (ink bloom, glow, two rings, a swell; first frame within 4 ms of the launch event, the "before" capture no longer waited for); a spark leaves the pin on an arc for the agent's avatar in the composer pill and bursts there as the avatar lands (340 ms); the cursor then pops out of the avatar (ring, scale, squash-and-stretch along its motion, a lean of up to 10°), flies on an arc over the whole interface with a comet trail and a glow while its name tag unfolds, and touches down just right of the pin's bubble with a short spring (overshoot 1.06). With no avatar on screen it comes out of the pin. The tag and the caption hang on a spring and lag a little behind every move of its own.
- **Stream:** each tool call of the agent (`rtcc:activity`) is the caption under the tag at once ("Reading Hero.tsx", "Styling Hero.tsx", "Creating Red Circle": a component's file name reads as words; "Thinking" with dots between calls). Calls that change the canvas (edit, style, create, canvas, layout, node, click, shot) also move the cursor, in turn, to their target (tempo-ui's node or x / y, the storyboard named by the file or the canvas edit, the comment's storyboard, else the pin) and click it, selecting it in the agent's colour. While a gesture plays, the caption is the gesture's.
- **Thinking:** between calls the glow breathes and the cursor floats on a slow, small orbit around its spot (eased in and out; a gesture never starts with a jump).
- **Behavior:** when a storyboard changes (box moved or resized, storyboard added, same-origin iframe mutated), the cursor glides there with a press and a ripple ("Adding Red Square"). A new storyboard or element is held unseen until the cursor drags its box out ("W × H") and **materializes** inside it (clip reveal plus blur 8 px → sharp, dim → full). Selections are **drawn as a stroke**, edge after edge from the top-left corner (0.4 s), then the white corner handles. Actions queue (4 at most) and play faster when they pile up. needs-input shows an amber "?"; done shows the check, the cursor goes back to the comment's pin ("Done"), flies home into its avatar and bursts there; failed shakes the arrow once (±3 px), shows "!" and fades over 1.5 s.
- **Several agents:** distinct colours, cursors sent to the same spot take free places in a column, selection tags step aside. The camera is never moved: a cursor outside the visible canvas (pan, zoom, a narrow window) shows a chevron in its colour on the nearest edge, pointing at it.
- **It always runs:** no single signal is required. The canvas view is found by name first; a name that matches nothing on screen never hides the agent: the view holding the comment's pin, else the only view on screen, else the largest one (`state().cursors[].via`). A canvas counts as on screen under the app's comment layers, canvas-chrome's surfaces, a popover, a dialog's veil or the modal `aria-hidden` the app sets on the rest of the page; only another canvas root over most of it hides it. A task that appears in the store with no launch event starts the choreography from its pin, found in the DOM at its anchor (`state().cinema.seeded`). Without tool events, the canvas's own changes during the task are still animated before they show (holds of 1.15 s at most). A hidden window pauses everything and compacts what piled up on return; a resize only re-places the layers.
- **Events consumed:** `rtcc:launch` / `rtcc:captured` / `rtcc:activity` / `rtcc:changed` (canvas-comment-agent), `rtcb:avatar-in` (comment-bubbles), and the explicit contract `rtca:launch {taskId, pinRect, composerRect?}`, `rtca:action {taskId, id?, kind, label, target: {nodeId? | selector? | rect? | storyboardName? | x, y?}}`, `rtca:action-end {taskId, id}`, `rtca:thinking`, `rtca:needs-input`, `rtca:done`, `rtca:failed` (a status told ahead of the store counts for 10 s, until the store confirms it).
- **Not the agent's edits:** changes during or right after the user's own pointer, key, pan or zoom are ignored, as are storyboards that animate on their own (muted 30 s).
- **Interaction:** hover on the tag shows the comment and what the agent is doing; click opens the bubble panel. Only the tag takes the pointer.
- **Motion:** transform, opacity, clip-path and filter (blur ≤ 8 px) only, on layers of its own; 120 fps on a 120 Hz display with 0 frames over 50 ms in the evidence runs. Wake-ups are plain timers: an opacity animation on `<html>`, even 1 → 1, re-rasterizes the whole page and stalled the first 150–700 ms after Enter (fixed). With `prefers-reduced-motion` cursors only appear, jump and fade (120 ms of opacity); no spark, bursts, orbit or trails.
- **Off switch:** `localStorage["rtd.agentCursors"] = "off"` (read every tick).
- **API:** `window.__RE_TEMPO_AGENT_CURSORS__` with `colorOf(taskId)`, `state()` (per cursor: caption, tool, landedAt, via, thinking, orbit, edge; `tools`, `pulses`, `cinema` {seeded, sparks, bursts, rtca, firstFrameMs}, `births`, `perf`), `refresh()`, `enabled()`, `dispose()`. Test hooks in `__RE_TEMPO_AGENT_CURSORS_CFG__` (`birthPopMs` among them).
- **Evidence:** `evidence/agent-cinema/` (videos, GIFs, frame sheets, metrics of the full, fallback and reduced-motion runs, the edge / resize / hidden checks and the replay of #29's real events).

## Agent follow (`agent-follow.js` / `.css`)

Figma-style follow for canvas comment agents: pans and zooms the canvas to the agent's storyboard, fitting it with a 10% margin and zoom clamped to 0.25 to 2.

- **Use:** Alt-click a task bubble, "Follow" in the bubble panel, `rtcb:follow` with `{id}`, or the API.
- **View writes, in order:** the canvas imperative ref's `getView()` and `setView()` (found as in canvas-snap), CSS `--canvas-view-*` only when the world transform consumes them, else native wheel events.
- **Pauses:** native input pauses it for 4 s after the last interaction. Reduced motion jumps directly. No timers or observers while idle.
- **Off switch:** `localStorage["rtd.agentFollow"] = "off"`.
- **API:** `window.__RE_TEMPO_AGENT_FOLLOW__` with `follow(id)`, `unfollow()`, `following()`, `settings()`, `dispose()`.

## UI beam (`ui-beam.js` / `.css`)

A visible agent handoff: a message pulse, a rounded beam with the Claude avatar, then a frame around the target. It draws only; it executes no action. Timing: 180 ms source, 900 ms flight (1080 ms to arrival), frame fades over 1500 ms. Flights are queued FIFO. A missing target gives a 320 ms searching pulse. Reduced motion uses a 180 ms pulse and frame, no travel. Overlays are noninteractive and hidden from assistive technology.

- **Events:** the window events `rtud:action` (calls `play(event.detail)`) and `rtud:done` (`{id}` or an id), both sent by `ui-drive`.
- **Off switch:** `localStorage["rtd.uiBeam"] = "off"` (play resolves immediately).
- **API:** `window.__RE_TEMPO_UI_BEAM__` with `play(detail)` (a Promise resolved at avatar arrival, not after the frame fades), `cancel()`, `settings()`. `detail = { id, action, args, sourceRect, targetEl?, targetRect?, label? }`; ids must be unique.

## UI drive (`ui-drive.js` / `.css`) and `bin/tempo-ui`

Lets an agent drive the Tempo UI on the user's screen. `ui-drive` is the channel and executor; `ui-beam` draws the animation.

- **Commands:** `open settings [section]`, `go chat|design|docs|issues|agents|settings`, `open canvas|doc|issue|agent|chat <x>`, `open url <http(s)://...>`, `focus <selector>`, `highlight <selector> [ms]`, `toast <text>`, `split left|right`, `run <id>`, `screenshot [--canvas | --selector <css>] [--out file.png]`, `list`, plus any action registered in `window.__RE_TEMPO_ACTIONS__`.
- **Sources:**
  - Chats: a line `@tempo-ui <action> <args>` at the start of an assistant message line, or a fenced block with info string `tempo-ui` holding JSON (max 10 commands). Inline and indented code never match.
  - CLI: `feature/bin/tempo-ui <words>` appends a JSON line to `~/.tempo/ui-commands.jsonl` (override with `$TEMPO_UI_COMMANDS`) and waits for the reply in `ui-replies.jsonl`. Lines older than 15 s are dropped. Exit codes: 0 done or queued, 1 denied, refused or failed, 2 usage. Options: `--no-wait`, `--timeout <ms>`, `--quiet`, `--raw`, `--json '<...>'`, `--instructions`.
  - Console: `__RE_TEMPO_UI_DRIVE__.run("open settings")`.
- **Safety:** actions come from an allowlist and an action registry, nothing is eval'd, URLs are http(s) only, rate limit is 8 commands per 10 s. Screen changes show a toast with "Deny", then "Undo" and "Always allow" for 4 s. Registry risk levels: `safe` runs at once, `caution` (default) can be denied, `destructive` runs only after an explicit Allow within 10 s and is never always-allowed.
- **Action registry:** `window.__RE_TEMPO_ACTIONS__` with `register(id, spec)`, `unregister`, `has`, `get`, `list`, `run`. Events `rtd:actions-ready` and `rtd:actions-changed`. Mods loaded earlier push `[id, spec]` into `window.__RE_TEMPO_ACTIONS_PENDING__`. It also registers `canvas.browser.create` and `canvas.browser.navigate` for `canvas-browser`.
- **Off switch:** `localStorage["rtd.uiDrive"] = "off"`. Commands are still consumed and refused, so nothing replays later.
- **API:** `window.__RE_TEMPO_UI_DRIVE__` with `help()`, `run(cmd)`, `parse(text)`, `log()`, `state()`, `setEnabled()`, `setAlwaysAllow()`, `actions`, `runActions`, `registry`, `dispose()`. `tempo-ui --instructions` prints the text to paste into a project's `CLAUDE.md` or `AGENTS.md`.
- **Limits:** only the top-level window without an opener reads the sources.

## App map (`app-map.js` / `.css`)

A live map of everything on screen that can be clicked, typed into, toggled, picked or dragged, plus the app's store actions, under stable readable ids, so an agent can drive the app by name instead of pixels.

- **DOM map:** an initial pass, then a MutationObserver (40 ms debounce). Items carry `id`, `kind` (click, type, toggle, select, drag), `label`, `region`, `rect`, `enabled` and `risk`. Ids such as `#<testid>` or `<region>/<role>/<label>` stay fixed for an element's life. ui-drive's toasts and ui-beam's overlay are never mapped, so an agent cannot approve itself.
- **Risk:** `destructive` (delete, discard, deploy, commit, push..., and every send), `caution` (rename, save, create, move, toggles in Settings...) and `safe`. `act()` refuses a destructive target without `{confirm: true}`; through ui-drive only `ui.destructive` (which asks the user) reaches one.
- **Registry actions:** `ui.click`, `ui.type`, `ui.key`, `ui.toggle`, `ui.select`, `ui.drag`, `ui.destructive`, `ui.find`, `ui.map`, `ui.hints`, `ui.export`, `app.*` (state, tabs, route, openSettings, openChat, newChat, openCanvas, openDoc, openIssue, openAgent, selectTab, sendPrompt, draftPrompt, panes, split, splitPane, duplicate, layoutReset, layoutUndo, layoutRedo) and allowlisted `store.*` calls. Only the allowlist of store calls runs; the rest of the store map is names only.
- **Export:** `export()` returns compact JSON (max 200 KB). Writing `~/.tempo/app-map.json` is opt-in (`rtd.appMap.export` = `on`, rewritten at most every 30 s). It never carries the value of an input or editor.
- **Cost:** 8 ms rAF slices (never more than 16 ms a tick), a full re-walk every 15 s while mutations keep coming, paused while the document is hidden.
- **Off switch:** `localStorage["rtd.appMap"] = "off"` (the API stays and answers `{enabled: false}`).
- **API:** `window.__RE_TEMPO_APP_MAP__` with `snapshot()`, `find()`, `act()`, `click/type/toggle/select/drag`, `screenshotHints()`, `stores()`, `actions()`, `runStore()`, `runAction()`, `export()`, `exportAsync()`, `debug(on)`, `el(id)`, `idOf(el)`, `rescan()`, `reset()`, `settle()`, `stats()`, `state()`, `setEnabled()`, `dispose()`. Event `rtam:changed`.
- **Limits:** validated against a fixture (Playwright, app-shaped DOM, fake stores), not in the logged-in app.

## Decision model (`decision-model.js` / `.css`)

Wires TypeSafe AI's hosted decision model "Jev" into the app. Given a `state` and typed questions (choice, score, yes/no) it returns answers with a confidence. It writes no text.

- **Settings > Decision model:** base URL (https; http only for localhost), API key, model, timeout, confidence threshold and what happens below it, one switch per automation, a privacy notice, "Test connection" and a log of the last 20 decisions. Registered through the Settings API of `profile-page`.
- **Connection:** `api.typesafe.ai` refuses browser origins at CORS, so on `file://` "Auto" runs `/usr/bin/curl` through the app's pty (config, key included, goes through stdin, never argv). Up to 2 retries on 429, 529, 5xx and network errors inside a 5 s default budget.
- **API key:** stored in this profile's `localStorage` (`rtd.decisionModel.apiKey`), unencrypted, and the UI says so. It is never rendered, logged or returned by the API.
- **Comment triage:** each new `queued` comment task gets one `decide()` call with only the user's own text and names, asking effort, ask_first and urgency (each when its automation is on). The record is advisory, available as `triage(id)` and the event `rtdm:triaged`. A task is triaged once, two calls at a time.
- **Off switch:** `localStorage["rtd.decisionModel"] = "off"` (no section, no triage, `decide()` rejects).
- **API:** `window.__RE_TEMPO_DECISION__` with `configured()`, `decide(state, questions, opts)`, `test()`, `settings()`, `triage(id)`, `triaged()`, `log()`, `setSettings()`, `setKey()`, `clearLog()`, `dispose()`.
- **Limits:** the mod runs nothing and changes nothing on its own; anything risky still needs a human.

## Profile page and Settings API (`profile-page.js` / `.css`)

Two things. First, a small API that lets any mod add a section to Settings, in a "RE-TEMPO" group of the nav. Second, Settings > Profile: the user's photo and a read-only, gamified view of their own work (level ring, stat tiles, activity heatmap, work by type, milestones, "Your month"). No streaks, points or ranking; every number is a count of real work.

- **Settings API:** `window.__RE_TEMPO_SETTINGS__` with `registerSection({ id, label, icon?, order?, render(container) })`, `unregisterSection(id)`, `sections()`. `render` runs on every open and may return a cleanup function. The event `rtsettings:ready` fires at script load. The API stays on even with Profile off.
- **Entry points:** Settings > Profile, a "Profile" item in the user menu, or `__RE_TEMPO_PROFILE__.open()`.
- **Photo is local to this machine:** Tempo has no avatar API, so the photo lives in IndexedDB `rtd-profile-page`. Editor accepts PNG, JPEG or WebP up to 5 MB and at least 64 px, with circular crop. The photo is laid over the user's own initials avatars (rail, comment pins, comment rows, bubbles); removing it gives the app's avatar back.
- **Claude on comment pins:** the comment pipeline posts Claude's reply from your account (ending with `· task <id> · <model> · <effort>`), so the app draws it as yours. A pin whose thread Claude took part in (a marker in the thread, or a comment-agent task for it) shows your avatar and a Claude avatar (the mark in a dark circle) overlapped, at the app's size, ring and status color. Hovering a pin shows the thread's last messages (up to three: the first one, "N more replies" and the last two), each with its author (You / Claude + model / the participant) and time, without the marker, plus the agent's status (Working, Needs you, Done, Failed) and "N replies". Messages come from the read-only query `comments:getThread`, fetched on hover. Same off switch as Profile; `state().pins` reports it.
- **Data (read-only, no mutation):** agent runs (same Convex queries as the Agent Runs panel), comment tasks, chats, canvases and plan usage. Each source fails on its own with "Couldn't load" and Retry. Level bands: 0 Newcomer, 5 Explorer, 15 Builder, 40 Maker, 100 Architect, 250 Virtuoso, 500 Luminary. The highest count seen is kept per account, so progress only goes up.
- **Off switch:** `localStorage["rtd.profilePage"] = "off"` (read at load; no section, menu item or photo).
- **API:** `window.__RE_TEMPO_PROFILE__` with `state()`, `open()`, `close()`, `refresh()`, `data()`, `identity()`, `avatar.{get,set,clear,edit}`, `dispose()`.

## Canvas nodes (`canvas-nodes.js`)

Shared helper. Browser frames, shader frames and notes live in the canvas file itself, in a block at the end of `<canvasPath>/index.canvas.tsx` (`// @re-tempo-canvas-nodes:start` ... `:end`, a `const reTempoCanvasNodes = {...}` JSON value), so the agent and git see them. The block sits outside `<Canvas>` because the app refuses unknown JSX children there. It is not in `tools/inject-index.mjs`; `canvas-browser`, `canvas-shader` and `canvas-notes` load it from their own folder.

- **Node types:** `browser`, `shader` (with `storyboard` entries holding Effects) and `note`. Other types and unknown fields are kept untouched.
- **Sync:** writes go through `sourceEditor.writeSourceFile` with the mtime read just before (stale writes are merged, up to 5 tries), 300 ms after the last change. A change on disk is picked up through the file watcher, a 4 s poll or window focus. On conflict the file on disk wins. A block that does not parse (an agent mid-edit) is never overwritten.
- **Migration:** old `localStorage` frames are written into the file once per type and canvas, and the old values are kept in `rtd.canvasNodes.migrated.<canvasPath>`. Image textures over 48 KB stay in `localStorage` as `image:local:<hash>`.
- **Off switch:** `localStorage["rtd.canvasNodes"] = "off"` (`available()` is false and the mods keep `localStorage`).
- **API:** `window.__RE_TEMPO_CANVAS_NODES__` with `list(canvasPath?)`, `upsert(node)`, `remove(id, canvasPath?)`, `format()`, `flush()`, `reload()`, `state()`, `refOf(root)`, `available()`, plus `registerType`, `attach` and `setBackend` for the mods and tests. Registry actions `canvas.node.upsert` and `canvas.node.remove` (both undoable).

## Canvas browser (`canvas-browser.js` / `.css`)

A Browser frame on the design canvas: a live web page with its own URL bar (back, forward, reload, address field, open in the system browser), placed in canvas coordinates. It pans and zooms with the canvas, moves by its header or bar, resizes from edges and corners, can be renamed, and is saved per canvas. Modeled on pen.dev's `browser` node.

- **Create:** the Browser tool in the bottom design toolbar, or `W` on the design route's active canvas. Click places a 1280x840 frame, drag draws one. `create()` places one in the middle of the view.
- **Interact:** click selects, click a selected frame (or double-click) to use the page, Escape or a click outside stops. Double-click the title to rename (empty means the page title). Delete or Backspace removes it with a 5 s Undo toast. Arrows nudge (Shift for x10). Shift on a corner keeps the ratio.
- **Session:** frames use the app's Browser tab `<webview>` partition, so cookies and logins are shared. The address field normalizes input like the app: http(s) and file kept, localhost becomes http, dotted becomes https, anything else becomes a Google search.
- **Storage:** node `{id, type: "browser", x, y, w, h, url, title, titled?, z?}` in the canvas file through `canvas-nodes`; `localStorage` `rtd.canvasBrowser.v1:<canvasPath>` without it. Only the URL and geometry are stored; the page reloads from its URL.
- **Off switch:** `localStorage["rtd.canvasBrowser"] = "off"` (live).
- **API:** `window.__RE_TEMPO_CANVAS_BROWSER__` with `state()`, `frames()`, `create()`, `remove()`, `select()`, `navigate()`, `undo()`, `arm()`, `disarm()`, `sync()`, `keyOf()`, `stored()`, `route()`, `dispose()`.
- **Limits:** without `<webview>` support (a plain test page) an `<iframe>` is used. The "Browser on Canvas" menu item was removed on 2026-10-18.

## Canvas browser card (`canvas-webpanel.js` / `.css`)

pen.dev's side browser: the globe in the canvas's top right pill (or Option+Cmd+B) opens a browser card inside the canvas view, docked on the right (full details in the file header).

- **Resize, live (2026-10-19):** the left edge, the bottom edge and the corner resize the card. The pointer lands once per animation frame, and canvas-chrome syncs in that same frame, so the top pill (globe, Share), the selection pill, the properties, the zoom and the agents pill stay 12 px left of the card in every frame. The same holds for a window resize. The card always leaves the canvas 360 px beside it (canvas-chrome's `MIN_COMPOSER`). Arrow keys on a focused handle resize it (Shift ×4) and never nudge the canvas selection. A step that grows the card slides its edge with canvas-chrome's slide (220 ms, `cubic-bezier(0.22, 1, 0.36, 1)`). Opening uses that same slide. On close, the chrome takes the room back once the card is gone. Expanded, the card starts under the chrome's top row, which stays in place: the file pill, the globe and Share stay visible and clickable, and what sits under the row hides.
- **Geometry contract:** on the shell, `data-rcw-open="1"` + `--rcw-width` (read by canvas-chrome) and `data-rtwp-right-inset` (px from the view's right edge to where right-anchored things go: card + margin; none while nothing moves). Window event `rtwp:geometry` `{shell, open, full, dragging, rightInset, rect}`, once per change, in the frame it changes. A custom property changed on the shell restyles the whole canvas view (about 5 ms at 1440; 13 ms on `<html>`), so per-frame readers should use the attribute or the event.
- **Off switch:** `localStorage["rtd.canvasWebpanel"] = "off"` (or the canvas-chrome flag).
- **API:** `window.__RE_TEMPO_CANVAS_WEBPANEL__` (`state()`, `open()`, `close()`, `toggle()`, `navigate()`, `setMode()`, `setWidth()`, `setHeight()`, `setExpanded()`, imports, `arm()`, `recent()`, `sync()`, `dispose()`).
- **Evidence:** `evidence/canvas-webpanel/resize-*` (drag frames at 1440 and 1024, the expanded card, per-frame metrics).

## Canvas shader (`canvas-shader.js` / `.css`)

A Shader frame on the design canvas: a live WebGL 2 fragment shader in a frame that pans and zooms with the canvas, moves, resizes, renames, deletes (with Undo) and is saved per canvas. A side panel edits it: preset, speed, controls generated from the uniform annotations, a live GLSL editor with the compiler log, and exports (PNG, 5 s WebM, standalone embed snippet). Modeled on pen.dev's shader fills.

- **Create:** the "+" menu item "Shader on Canvas" or `create()`, which places an 800x500 frame. The bottom toolbar tool and the `S` key were removed on 2026-10-18.
- **Shader contract (as pen):** GLSL ES 3.00 with one `out vec4`, or 1.00 with `gl_FragColor`. Inputs are only `gl_FragCoord` and uniforms. Uniforms are annotated by the doc comment before them with `@label`, `@color`, `@range`, `@min`, `@max`, `@default`, `@resolution`, `@time`, `@mouse`, `@mipmap`, `@content`, `@backdrop` and `@sdf`.
- **Presets:** mesh, grain, fluid, waves, aurora, glass, halftone, particles.
- **Effects:** with one storyboard selected, the right panel gets an "Effects" section. "+" > "Add effect" > "Shader" adds a background (under the storyboard content) or overlay (blended) shader with Blend, Opacity, order and Remove.
- **Rendering:** 30 fps cap, devicePixelRatio capped at 1.5, half resolution while panning, nothing rendered off screen or in a hidden tab; one static image under `prefers-reduced-motion`. The loop runs only while a shader is visible and the document is visible; canvas visibility is a cache refreshed by IntersectionObserver/ResizeObserver (no `checkVisibility()` per frame) and the loop skips frames between two render slots. With no shader on the canvas the mod costs about 0.1% of the main thread; one visible shader went from 10.4% to 3.1% (2026-10-19, evidence in `evidence/canvas-shader/perf-*`).
- **Storage:** nodes `{type: "shader", ...}` and `{type: "storyboard", effects: [...]}` in the canvas file through `canvas-nodes`; `localStorage` `rtd.canvasShader.v1:` and `rtd.canvasShader.fx.v1:` without it.
- **Off switch:** `localStorage["rtd.canvasShader"] = "off"` (live).
- **API:** `window.__RE_TEMPO_CANVAS_SHADER__` with `state()`, `frames()`, `create()`, `remove()`, `effects()`, `addEffect()`, `updateEffect()`, `moveEffect()`, `removeEffect()`, `openEffect()`, `dispose()`.

## Canvas notes (`canvas-notes.js` / `.css`)

> **Removed from loading (removed: replaced by canvas comments).** The files stay in the repo but `tools/inject-index.mjs` no longer injects the mod. The documentation below is kept for reference.

Sticky notes on the design canvas that turn into prompts, modeled on pen.dev. Tool "Sticky note", key `N` (toolbar button through `canvas-chrome`'s `registerTool` when it accepts it, else in the design toolbar). A click drops a 250 x 219 note; a drag draws its box.

- **Kinds:** `prompt` (blue, with the model label and a "Run" button) and `note` (amber, plain). Double-click or Enter edits the text.
- **Run:** the note flashes and the prompt becomes a canvas task through `__RE_TEMPO_COMMENT_AGENT__.createTask(...)` (the event `rtcn:submit` is the fallback and the pipeline must listen to it). Model and effort are read from the composer and frozen when sent. Without a link after 6 s the note shows `failed`.
- **Status on the note:** queued, running, needs input, done (with the summary) or failed (with the reason and Retry). "Open" opens the task's bubble panel. The note follows the storyboard under it when that moves.
- **Interaction:** selection, move, resize, Delete with a 5 s Undo, arrows and Escape behave like `canvas-browser` frames.
- **Storage:** node `{id, type: "note", x, y, w, h, text, kind, status, ...}` in the canvas file through `canvas-nodes` (an agent can add notes there by hand; see `format()`). `localStorage` `rtd.canvasNotes.v1:<canvasPath>` without it.
- **Off switch:** `localStorage["rtd.canvasNotes"] = "off"` (live).
- **API:** `window.__RE_TEMPO_CANVAS_NOTES__` with `state()`, `notes()`, `stored()`, `create()`, `remove()`, `select()`, `edit()`, `setText()`, `setKind()`, `submit()`, `link()`, `open()`, `undo()`, `arm()`, `disarm()`, `sync()`, `format()`, `dispose()`.

## Canvas export (`canvas-export.js` / `.css`)

"Code" and "Export" sections in the canvas right panel (design tab, after "Effects"), like pen.dev's. They appear with one storyboard selected.

- **Code:** HTML + Tailwind, HTML + CSS or React (JSX), from the storyboard's projected DOM, cleaned of scripts, event attributes and `data-tempo-*` / `data-canvas-*` / `data-rt*`. Buttons: Copy HTML, Export HTML (a standalone page, images embedded by default) and Import Web via Browser (creates a Browser frame to the right of the storyboard). Files go to `<workspace>/<canvasPath>/exports/<storyboard>.html` (or `.jsx`), or download as a Blob without a file bridge.
- **Export layer:** PNG, JPEG, WebP or PDF at 1x, 2x or 3x. Pixels come from the app window capture, with the view moved and tiles stitched when the storyboard does not fit. The canvas input is blocked while capturing and Escape cancels. The PDF is written by hand (lossless up to 24 MP). The toast offers "Reveal in Finder".
- **Shortcut:** Cmd+Shift+E (Ctrl+Shift+E) scrolls to Export and focuses it, only with a storyboard selected on a visible canvas and focus outside text fields. `canvas-export` must load before `project-sidebar`, which binds the same keys.
- **Actions:** `canvas.export.layer {scale?, format?}` and `canvas.export.code {format?, to?}`.
- **Prefs:** `rtd.canvasExport.prefs`. **Off switch:** `localStorage["rtd.canvasExport"] = "off"` (live).
- **API:** `window.__RE_TEMPO_CANVAS_EXPORT__` with `state()`, `selected()`, `code(format, {document})`, `copy()`, `exportCode()`, `exportImage({scale, format})`, `importWeb(url)`, `focusExport()`, `sync()`, `setEnabled()`, `dispose()`.
- **Limits:** pseudo-elements and canvas pixels are not in the code, fonts stay linked, and a storyboard with a cross-origin frame has no code (image export still works).

## Canvas keys (`canvas-keys.js`)

Figma and Sketch style single-key shortcuts for the design canvas, ported from pen.dev. The app already implements most of the map natively (V, F, R, T, Shift+R/C/G, Esc, Cmd+D, arrows, Shift+1, Shift+2, Cmd+=/-/0), so this mod only fills the gaps and never re-binds a key the app owns. Styles in `canvas-keys.css`.

- `C`: Comment tool (clicks the toolbar's Comment button).
- `Shift+0`: zoom to 100% (through the app's zoom menu).
- `?`: a shortcut sheet listing native and added shortcuts. Esc, `?`, a click outside or the close button dismiss it. "All app shortcuts" opens the app's dialog.
- **Guards:** never fires in inputs, editors, the composer, menus or dialogs, while composing (IME), on key repeat, with Cmd, Ctrl or Alt held, or when the design toolbar is not visible.
- **Not done:** Hand tool `H` and Group `Cmd+G`, because the app has no action for them.
- **Off switch:** `localStorage["rtd.canvasKeys"] = "off"` (read on every key).
- **API:** `window.__RE_TEMPO_CANVAS_KEYS__` with `enabled`, `active`, `sheetOpen`, `last`, `open()`, `close()`, `dispose()`.

## Canvas snap (`canvas-snap.js` / `.css`)

Figma and Pencil style measurements on the design canvas. With a storyboard selected, hold Alt/Option:

- hover another storyboard to see the exact distances between the two in canvas px, as red labels on thin red lines;
- hover empty canvas (or the selection) to see the distance to the nearest storyboard in each of the four directions.

Everything disappears when Alt is released, a button goes down or the window loses focus. Snapping itself is the app's native one (8 screen px / zoom) and is not touched. The mod is read-only and shows nothing while an element inside a storyboard is selected, because the app measures elements itself.

- **Off switch:** `localStorage["rtd.canvasSnap"] = "off"`.
- **API:** `window.__RE_TEMPO_CANVAS_SNAP__` with `enabled`, `alt`, `status()`, `measureAt(x, y)`, `lastMeasure`, `rescan()`.

## Smart suggestions (`smart-suggestions.js` / `.css`)

In the new-chat empty state, replaces the four fixed prompt cards with four suggestions computed locally from where the user is: workspace, branch, uncommitted changes, recent chats, open comment tasks, issues, docs, canvases, agent runs and the time of day. A fifth discreet chip, "More...", opens the full ranked list (8 to 10).

- **Click:** fills the composer through the app's own `onPromptSelect`, then clicks send once the prompt is in. `localStorage["rtd.smartSuggestions.send"] = "fill"` keeps the native fill-only behavior.
- **Ranking:** rules score each candidate (waiting comment tasks 100+, failed tasks 90+, a chat awaiting an answer 86, uncommitted changes 60 to 90 by size, generic prompts 6 to 16); no two cards are about the same thing. Optional re-rank through `decision-model` (automation "suggestions" or `rtd.smartSuggestions.rerank` = `on`) shifts scores by at most 15 and sends names and counts only. Any error keeps the rule order.
- **Data:** read-only; the workspaces store, chat session store, comment tasks, project-sidebar's model or Convex queries, agent runs. No mutation is called.
- **Refresh:** at once on a workspace or chat switch, else debounced 2 s. The 700 ms poll runs only while the window is visible and an empty state is on screen.
- **Off switch:** `localStorage["rtd.smartSuggestions"] = "off"` (native cards come back).
- **API:** `window.__RE_TEMPO_SMART_SUGGESTIONS__` with `state()`, `context()`, `suggestions()`, `all()`, `refresh()`, `send(idOrIndex)`, `openMore()`, `closeMore()`, `setEnabled()`, `dispose()`. Events `rtss:changed` and `rtss:sent`. Test hook `__RE_TEMPO_SMART_SUGGESTIONS_CONFIG__`.

## Hide the "Canvas devserver" tab (`hide-devserver-tab.js`)

The app opens an output-only terminal tab, "Canvas devserver", beside a canvas. This mod hides it from the center tab bar (no gap left). The server keeps running and the canvas keeps working: only the tab is hidden, nothing is closed or killed.

- **Detection:** by type in the workspaces store (`centerTabs`: `type: "terminal"`, `ephemeral: true`, title "Canvas devserver"), applied to the tab through its `data-tab-id`. Without the store, a DOM fallback matches `terminal-tab-*` with that exact label.
- **Active tab:** if the hidden tab was in front, the previous visible tab of the bar is clicked, so no tab shows invisible content.
- **Revert:** `localStorage.setItem("rtd.hideDevserverTab", "off")` shows it again within 1 s (no reload); `removeItem` (or `"on"`) hides it again.
- **Hot apply:** works on an open window with no reload: add `<script src="./mod/hide-devserver-tab.js">` to the page (re-running it replaces the previous instance). Introspection: `window.__RE_TEMPO_HIDE_DEVSERVER__.state()`.
- **Limit:** with the tab hidden it cannot be brought forward from the bar; a row the project sidebar already lists for it stays (revert to open it).

## Today's changes to existing mods

### `usage-bar`: compact line in the project-sidebar footer

The header now describes two placements. In the left rail, two rings (Claude, then GPT) sit just above the bug button, each filled by the percent used of that provider's shortest window with the time to reset in the center. When the DOM has a rendered `[data-rtu-rings-host]` (the project-sidebar footer), the rings give way there to one compact line ("Used [Claude] 22%·3h12m [GPT] 0%·6d5h ↻") with the same popover, and leave the rail. It follows hosts that appear, go, hide or are re-created, and falls back to the rail. The "Plan usage in the sidebar, in 3 levels" section above describes the earlier footer of every section sidebar and predates this change. Sources, the helper and `window.__RE_TEMPO_USAGE__` are unchanged.

### `voice-input`: `attach` and `autoAttach`

Dictation now works in any field, not just the composer. `window.__RE_TEMPO_VOICE__.attach(el, opts)` takes an `<input>`, `<textarea>` or contenteditable and returns `{ start(), stop(), toggle(), cancel(), destroy(), state, el, button }` (`state`: `idle`, `recording`, `finishing`, `error`).

- **Options:** `button` (`true` for the composer's mic, an element to use as the toggle, `false` for none), `placement` (`inside-end` default, `before`, `after`), `onPartial(text)`, `onFinal(text)`, `reducedMotion`.
- **Fields:** in an `<input>` or `<textarea>` the live words are written into the value at the caret (a React-controlled field gets its `onChange`) and drawn by an overlay mirror with the composer's animated words. A contenteditable gets the composer's word widget.
- **Enter sends:** Enter (no Shift) in a field that is dictating stops the dictation, waits up to 600 ms for the final transcript (on timeout it keeps the words heard, minus a provisional "."), writes it into the field and then sends through the field's own Enter (comment thread, canvas composer, agent reply). Shift+Enter still breaks the line and Escape cancels the dictation without sending. Typing mid-dictation keeps what is typed.
- **One recorder at a time:** starting in another field hands the current one off, and there is never more than one CLI process.
- **`autoAttach(selector, opts)`:** attaches to every matching field and returns an undo function. It never touches the chat composer. Attached by default: the agent panel's "Reply to the agent..." (comment-bubbles) and the canvas comment threads' "Reply to thread..." and new-thread composer.
- **Also in the header:** a Space tap (under 250 ms) in the focused, empty composer starts dictation, and a second tap stops it.

### `sidebar-chats`: one card per workspace

Every non-archived chat tab of a workspace shows in the left Chats sidebar, nested under its parent chat, including secondary chats, split view, popout, pane-dock and CLI-mode chats, with badges "split", "window" and "CLI". Each workspace node also gets a header that turns the workspace and its chats into one rounded card (Orca's worktree card): a status dot (green while any chat runs), the branch in bold, a "primary" badge for non-worktree workspaces, and the short path. The native workspace row stays as is, and click and right-click on the header are forwarded to it.

- **Guard:** while `project-sidebar` replaces the native sidebar, this mod shows nothing and removes its nodes.
- **Off switch:** `localStorage["rtd.sidebarChats"] = "off"` (the project sidebar's title bar switch cycles Projects, Classic chats (this mod), Native). Picked up on `rtd:sidebar-chats-changed`, `storage` and a 1 s tick.
- **API:** `window.__RE_TEMPO_SIDEBAR_CHATS__`.
- **Limits:** depends on the zustand hook shape, test ids, tree layout and action names of the frozen bundle; each degrades to no extra rows or no badge. Validated against a fixture, not in the logged-in app.

### `project-sidebar`: a branch lists only what it has open

Each branch card lists the tabs its workspace has open and nothing else, the same rows whichever branch you are on. One function (`openOf`) reads them from the stores, the same way for every workspace: the workspace's active primary chat, then the tabs it owns and the ones no chat owns (what the app's own tab bar shows), each pane-dock pane's tabs (from the deck `layout` above) and each popout window's tab. With several decks each deck lists its own tabs from its own chat and panes.

- **Not listed:** the other primary chats (the chat history, finished or not: the app does not show them as tabs either), archived chats, a chat whose tab was closed with tab-close's × (the tabs it owns stay while they are open), the comment agent's background chats, and the app's infrastructure terminals it neither saves nor restores ("Canvas devserver", "Tempobook", ephemeral ones: the server a canvas needs, opened by the app, which keeps running) until you bring one forward (its tab in front, or moved to a pane, split side or window; then it stays listed until it closes). A tab is listed once, by id; two tabs with the same label are numbered.
- **Removed:** the DOM read of the tab bars, the per-deck row record in `localStorage` (`rtd.projectSidebar.deckRows.v1`, dropped on load: it brought closed tabs back after a reload), the deck-member and "orphan" rows (every live chat), and the auto-close of hidden empty drafts.
- **API:** `window.__RE_TEMPO_PROJECT_SIDEBAR__.openTabs()` returns what each card lists.
- **Evidence:** `evidence/project-sidebar/real-*` (before/after captures, the row → source table, `real-open-tabs.mjs`, `real-matrix.mjs`).

### `tab-close`: canvas tabs are never previews

The app opens a canvas as an unpinned preview tab (italic label) from the "+" new canvas, the Open modal and quick open, and the next unpinned canvas of the same chat replaced it in place, so only one canvas could be open. `tab-close` pins every canvas tab of the selected workspace (the store's `pinTab`, what a double click on the tab does) in the store listener, as soon as it exists: each canvas opens in a tab of its own, beside the others. The tabs stay mounted while another one is in front, so each keeps its zoom, position and selection. `__RE_TEMPO_TAB_CLOSE__.state().canvasPins` counts the pins. Evidence: `evidence/project-sidebar/real-11*`, `real-12*`, `real-canvases.json`.

### `shell-glass`: the canvas HUD's surfaces take the portfolio header's glass

Every HUD surface of the canvas (tool rail and panel button, the file and Share pills, the selection pill, composer and agents pill, zoom, the left Agent/layers card, the Properties card, the browser card, menus, tooltips, hover cards, comment pins and the native comment-thread popover) is drawn with the glass of the portfolio header. Tokens copied from `portfolio/src/components/PortfolioHeader.css`, the dark fill, line 11: `background: rgba(33,33,33,.33)`, `backdrop-filter: blur(10px)`. The site's dark fill has no hairline, shadow or grain; the HUD keeps its own hairline and shadow (the owning mods' geometry). The light fill (line 10: `rgba(255,255,255,.66)`, `blur(20px)`) is not used: the canvas cannot be sampled behind the storyboard iframes, so the site's per-page tone choice is not possible.

- **Contrast cap:** the backdrop is `blur(10px) brightness(.35)`, then the fill. A dark canvas (#232323) stays about as it was; a white storyboard becomes a #474747 glass, so white text keeps 8.5:1 (secondary 4.8:1). Tertiary grey text (#787878) measures 2.1:1 over a white storyboard (4.2:1 over the dark canvas; the solid surface it replaces gave 4.0:1).
- **Levels:** a glass root paints the fill and the blur once. Inside it the app's surface tokens are re-scoped (`--color-surface-container*`, `--rcc-surface`, `--rtcb-surface*`, `--rtac-surface`): fields, segments, hovers and chips are tonal white washes (7% and 13%) over it, with no nested backdrop filter.
- **Composer and agents pill:** their surface is caps + a middle inside a wrapper with a drop-shadow `filter`, which is a backdrop root; the wrapper (`.rcc-composer-surface`, `.rcc-ap-surface`) takes the glass and the caps keep only the hairline.
- **Cost:** about ten backdrop filters on static surfaces, none animated. Measured with a real middle-button drag (`Input.dispatchMouseEvent`) plus ctrl-wheel zoom, with the browser card, left card and Properties open over real storyboards: 120 fps with and without the glass. The comment pins are the exception: many ride the moving canvas, and a backdrop filter on each cost about 30 fps (86 fps with them blurred), so pins take the fill without the blur (`rgba(33,33,33,.82)`).
- **Limits:** the hosted chat inside the left card is a separate surface of its own and stays solid; a tooltip drawn as `::after` of the rail stays inside the rail's backdrop root.
- **Shell background:** the black of the shell as glass (ambient layer + the same fill and blur) is off by default; `localStorage["rtd.shellGlass.bg"] = "on"` turns it on.
- **Off switch:** `localStorage["rtd.shellGlass"] = "off"` (read on `storage` and focus). API: `window.__RE_TEMPO_SHELL_GLASS__` (`enabled`, `dispose`).
- **Evidence:** `evidence/shell-glass/` (`hud-{dark,white}-{before,after}-*.png`, `browser-{dark,white}-{before,after}.png`).
