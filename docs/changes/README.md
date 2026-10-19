# RE-TEMPO: every change vs the original Tempo

The original Tempo app is not in this repo. Every change below is a **mod**: a `feature/<name>.js` file (plus an optional `.css`) that `tools/inject-index.mjs` loads into the app's renderer, in a fixed order. No mod edits Tempo's bundle. Each entry says what the original app did, what the mod changes, and how to use it.

Media: the screenshots and clips are not in this repo; each one is kept as its caption, and the counts below refer to them. **(fixture)** marks a headless test page that runs the real mod code with fake data; **real app** marks a print of the real Tempo window. A nicer view of the same list is in [index.html](index.html).

| | Count |
|---|---|
| Changes (one per mod or tool) | 41 |
| Features inside them | 135 |
| Changes with at least one image | 40 |
| Changes with at least one video or gif | 29 |
| Features with their own video or gif | 66 |
| Features shown in a sibling clip | 8 |
| Real-app prints used | 29 |
| Changes with captures in evidence/ | 29 |

## Contents

- **Sidebar**: [1. Project sidebar](#1-project-sidebar), [2. Sidebar chats](#2-sidebar-chats), [3. Plan usage](#3-plan-usage)
- **Panes, tabs and decks**: [4. Free pane layout (panes and decks)](#4-free-pane-layout-panes-and-decks), [5. Close button on the primary chat tab](#5-close-button-on-the-primary-chat-tab)
- **Canvas**: [6. Quick access to canvases](#6-quick-access-to-canvases), [7. Canvas setup starts by itself](#7-canvas-setup-starts-by-itself), [8. Paste image at the pointer](#8-paste-image-at-the-pointer), [9. Canvas keys](#9-canvas-keys), [10. Canvas snap and Alt measurements](#10-canvas-snap-and-alt-measurements), [11. Browser frame on the canvas](#11-browser-frame-on-the-canvas), [12. Shader frame on the canvas](#12-shader-frame-on-the-canvas), [13. Canvas layout like pen.dev](#13-canvas-layout-like-pendev), [14. Code and Export in the canvas panel](#14-code-and-export-in-the-canvas-panel), [15. Sticky notes that run as prompts](#15-sticky-notes-that-run-as-prompts), [16. Properties panel for frames and notes](#16-properties-panel-for-frames-and-notes), [17. Browser card inside the canvas](#17-browser-card-inside-the-canvas), [18. Canvas comment as a Claude task](#18-canvas-comment-as-a-claude-task), [19. Comment bubbles](#19-comment-bubbles), [20. Agent cursors](#20-agent-cursors), [21. Follow an agent](#21-follow-an-agent)
- **Chat and composer**: [22. Voice dictation](#22-voice-dictation), [23. Extra High effort and model names](#23-extra-high-effort-and-model-names), [24. Smart suggestions in a new chat](#24-smart-suggestions-in-a-new-chat), [25. Background tasks in the chat](#25-background-tasks-in-the-chat), [26. Agent Runs panel](#26-agent-runs-panel)
- **Agents driving the UI**: [27. UI drive (agent controls the app)](#27-ui-drive-agent-controls-the-app), [28. UI beam (agent handoff animation)](#28-ui-beam-agent-handoff-animation), [29. App map (named controls for agents)](#29-app-map-named-controls-for-agents), [30. tempo-ui command line](#30-tempo-ui-command-line)
- **Rail and title bar**: [31. Gear menu (Settings, Help, Report a bug)](#31-gear-menu-settings-help-report-a-bug), [32. Header breadcrumb](#32-header-breadcrumb), [33. Home heading text](#33-home-heading-text), [34. Zoom level toast and Cmd+=](#34-zoom-level-toast-and-cmd)
- **Settings and preferences**: [35. Profile page and Settings API](#35-profile-page-and-settings-api), [36. Decision model settings (TypeSafe Jev)](#36-decision-model-settings-typesafe-jev)
- **Infrastructure and dev tools**: [37. inject-index (load the mods)](#37-inject-index-load-the-mods), [38. live-reload (instant updates)](#38-live-reload-instant-updates), [39. start-live (one command)](#39-start-live-one-command), [40. bootstrap-local (editable app)](#40-bootstrap-local-editable-app), [41. QA harness (qa/)](#41-qa-harness-qa)
- [Changes without video, and why](#changes-without-video-and-why)

## Sidebar

### 1. Project sidebar

One sidebar organised by project replaces the left rail and the five separate route sidebars (chat, docs, design, issues, agents). Every project shows its branches, and every branch shows its decks and what is open in them.

**Files:** `feature/project-sidebar.js`, `feature/project-sidebar.css`

**Original Tempo, before the mod:**

*The original Tempo layout before the mod: icon rail on the left and a route-specific Chats sidebar.*

*Before: the original icon rail and Chats sidebar (Tempo with no mods).*

**Shortcut:** ⌘⇧E (switch sidebar mode), ⌘B (collapse)

**Captured in the app** (`evidence/project-sidebar/`, 2026-10-18T21:36:14.716Z):

*After: one sidebar with projects, branch cards, chats and open tabs.*

*Clicking a tab row opens that tab, clicking a project collapses it, and clicking a branch switches workspace.*

*Typing in the search box filters the tree; Esc clears it.*

**In the real app:**

*Full RE-TEMPO window: project sidebar on the left with decks and branches, split panes and a canvas on the right.*

#### 1.1 Projects tree

- **What changed:** Before: the left rail had one button per route, and each route had its own sidebar. Now: one tree lists every project, its branches (worktrees) and their chats, canvases and terminals. Clicking a row runs the app's own navigation.
- **How to use:** Click a project row to fold or unfold it. Click a chat, canvas or terminal row to open it. The small + on a project starts a new worktree.

*The project tree: two projects, branch cards, decks and rows (fixture)*

*Folding and unfolding a project, then opening a deck (fixture)*

#### 1.2 Search

- **What changed:** Before: each sidebar had its own search, or none. Now: one search box at the top filters the whole tree. A row stays when it or something inside it matches, and its parents open.
- **How to use:** Click the search box and type. Backspace to clear.

*Typing 'csv' keeps only the matching branch and chat (fixture)*

#### 1.3 Issues, Agents, Docs and Organization rows

- **What changed:** Before: Issues, Agents and Docs were route buttons in the rail. Now: they are rows at the top of the sidebar and under each project, and 'Organization' holds the ones with no project link. Data comes from read-only queries to the app's own backend.
- **How to use:** Click a row to open it. Cmd+click opens a doc, issue or agent as a tab next to the chat.
- **Video:** pending (needs the real app (backend data for docs, issues and agents))

*Top of the sidebar. The Issues, Agents and Docs rows need real backend data, so they do not show in the fixture (fixture)*

#### 1.4 Decks under branches

- **What changed:** Before: decks (pages with their own pane layout) had no place in any sidebar. Now: each branch card lists its decks. The active deck is open and shows what is on screen; the other decks are compact rows.
- **How to use:** Click a deck row to switch to it. Click its chevron on the right to open or fold its rows. The + on the branch makes a new deck.

*Project sidebar: a branch card with a numbered deck listing its chats, canvases, browser and terminal, plus an Archive hidden chats row.*

*Deck 02 opened under the main branch (fixture)*

*Clicking Deck 03 switches the workspace to it (fixture)*

#### 1.5 Collapsed deck rows

- **What changed:** Now: a deck that is not open is one compact row. It shows its number and a small pill: status icons (done, running, unread), the provider of the first chat, '+N' for more, then icons for other tabs (canvas, terminal, browser, file).
- **How to use:** Hover a row to see its chevron. Click the row to switch, the chevron to open it.

*Branch card with collapsed decks that summarize their contents with status, chat, canvas and terminal icons.*

*Decks 02 and 03 as compact rows with their pills (fixture)*

*A compact row opens into its list and folds back (fixture)*

#### 1.6 Deck menu

- **What changed:** Now: right-click on a deck row opens a small menu with Rename and Remove deck. Remove asks first, in place ('Its 2 tabs go back to deck 01'), with Cancel focused. The tabs of a removed deck join the active deck.
- **How to use:** Right-click a deck row. Enter removes, Esc or Cancel keeps the deck. Double-click on a deck name renames it.

*Deck row menu offering Rename and Remove deck.*

*The confirmation before removing a deck (fixture)*

*Opening the menu and the remove confirmation, then cancelling (fixture)*

#### 1.7 New worktree picker

- **What changed:** Before: the project + created a worktree with an auto name. Now: the + opens a small picker with a search field, 'New branch' (from main), the other local and remote branches, and the branches that already have a card ('switch').
- **How to use:** Click the + on a project. Type to filter. Pick a branch to open it in a new worktree, or pick 'switch' to jump to its card. Esc closes.

*The plus button on a project opens a branch picker to create or switch to a worktree.*

*The worktree picker with a search field, branches and open worktrees (fixture)*

#### 1.8 Split pane rows

- **What changed:** Before: nothing in the sidebar knew about the split view or the dock panes. Now: the branch card lists every pane on screen (each side of the split, each dock pane) with its active tab, in screen order. Rows of one pane are linked by a thin line, and hovering a row flashes its pane in the window.
- **How to use:** Hover a row to see its pane outlined. Click a row to bring that tab forward on its own side without closing the split.

*Hovering a row outlines the right side of the split (fixture)*

#### 1.9 Drop a tab on + to open a new worktree

- **What changed:** Now: while you drag a tab, every project + appears. Dropping the tab on one makes a new worktree for that project and moves the tab into it. The new card slides in with a short highlight, and the dock's undo plays it backwards.
- **How to use:** Drag a tab from a tab bar or a dock pane over the + of a project (it turns into a 'New workspace' pill) and release.

*The new card entered right after the drop (fixture)*

*Dragging a tab onto the project + and the new card entering (fixture)*

#### 1.10 Terminal agents as agent rows

- **What changed:** Now: a terminal that runs an agent CLI (Claude Code, Codex) is listed as an agent session, with a status, the provider logo, the task title and a 'CLI' badge, not as a plain terminal. The mod reads the tab title, or the visible terminal screen.
- **Video:** pending (needs a real terminal running an agent CLI)

*A terminal titled with the Claude Code marker shows as an agent row with a CLI badge (fixture)*

#### 1.11 Footer, settings and account

- **What changed:** Now: the bottom of the sidebar hosts the plan usage line (from the usage-bar mod). Settings and the account avatar sit in the title bar next to the sidebar switch.
- **Video:** not applicable (static layout, no interaction)

*Sidebar footer with the usage line (fixture)*

*Title bar with the sidebar switch, Settings and the account avatar (fixture)*

#### 1.12 Collapsed sidebar

- **What changed:** Now: the sidebar follows the app's own 'Toggle left panel' button and Cmd+B. Collapsed, the column goes away and the workspace takes its width back; expanded, it returns.
- **How to use:** Click Toggle left panel in the title bar, or press Cmd+B.

*The sidebar collapsed and the workspace using the full width (fixture)*

*Collapsing and expanding the sidebar (fixture)*

#### 1.13 Always the only sidebar

- **What changed:** Before: a title bar switch cycled this sidebar, the native Chats sidebar and the app's own. Now: the project sidebar is the only one, with no switch. The native route sidebars stay mounted but hidden, so they keep working.
- **How to use:** Nothing to do. localStorage "rtd.projectSidebar.hideNative" = "off" shows the native sidebars again.
- **Video:** not applicable (there is no switch any more)

*The switch is the first icon, left of Settings (fixture)*

#### 1.14 Context menus

- **What changed:** Before: right-click did nothing in the sidebar. Now: chats, projects and worktrees have Orca-style menus: Open, Open in split view or new window, Move to deck, Rename, Archive or Delete for a chat; New workspace, New worktree, Open in Finder, Editor or Terminal, Copy path for a project; new chat, canvas, doc, issue, terminal or browser, Copy branch and Pin for a worktree.
- **How to use:** Right-click a chat, a project or a worktree card.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*Menu of a chat row (fixture)*

*Menu of a project with its Open in submenu (fixture)*

*Menu of a worktree card (fixture)*

#### 1.15 Worktree cards on one line

- **What changed:** Before: each worktree card had a second line with its path and tab icons. Now: a card is one line: dot, name, the primary chip and +. A branch whose name differs shows in the tooltip.
- **Video:** not applicable (static layout)

*Worktree cards on one line, decks under them (fixture)*

#### 1.16 Green status dot

- **What changed:** The dot is green for every worktree that is ready, primary or not, and pulses while a session runs. It is gray only when the worktree is not available.
- **How to use:** Hover the dot to read its state.
- **Video:** not applicable (a static status mark)

*Green dot on the main worktree (fixture)*

### 2. Sidebar chats

Every chat tab of a workspace shows in the native Chats sidebar, nested under the chat it belongs to. The original app left out chats opened with the + of the tab bar, in the split view, in a window or in a dock pane.

**Files:** `feature/sidebar-chats.js`, `feature/sidebar-chats.css`

**Original Tempo, before the mod:**

*Before: the new chat is open in the tab bar but missing from the Chats sidebar.*

**Captured in the app** (`evidence/sidebar-chats/`, 2026-10-18T21:41:21.073Z):

*After: the same chat nested under its parent chat, with workspace cards.*

*A new chat opened from the + appears nested under its parent; the arrow folds and unfolds it.*

*Moving the chat into a pane adds a "window" badge; clicking the row jumps to the chat.*

*Close-up: the nested draft chat with its "window" badge.*

#### 2.1 Tabs nested under their chat

- **What changed:** Before: chats opened with the + of the center tab bar (and those in split view, windows, dock panes or CLI mode) had no row. Now: each shows as a child row under its chat, with a status icon, the provider logo, a title, a badge ('split', 'window', 'CLI') and the time.
- **How to use:** Click a child row to open that chat, in its window or pane when it lives there.

*Each chat row in the sidebar has its canvas and terminal tabs nested underneath with connector lines.*

*Child rows with status icons, provider logos and badges under their parent chat (fixture)*

#### 2.2 Status and location badges

- **What changed:** Now: a small gray dot is a finished chat, a dashed spinning circle is a running one, a blue dot is unread, a yellow dot waits for your answer, a hollow dot is a draft.
- **Video:** not applicable (same clip as the nested chats)

*Rows with each kind of status and badge (fixture)*

#### 2.3 Fold button

- **What changed:** Now: the parent row gets a round chevron button on the right, in place of its time. It folds and unfolds its children, and the state is remembered.
- **How to use:** Hover the parent row and click the chevron.

*The first chat folded, its children hidden and the count shown (fixture)*

*Folding and unfolding, then a new chat appearing (fixture)*

#### 2.4 New chats appear by themselves

- **What changed:** Now: a chat opened with the + of the tab bar shows up nested under its owner right away, without reloading anything.
- **How to use:** Open a new chat with the + in the center tab bar.
- **Video:** shown in the clip of 2.1 (Tabs nested under their chat)

*A new child row 'Tag cleanup ideas' under its owner chat (fixture)*

#### 2.5 Workspace card per branch

- **What changed:** Now: each workspace (a local checkout or a worktree) gets a card header with a status dot (green while a chat runs), the branch in bold, a 'primary' badge for the local checkout, and its short path. The card's border contains the workspace row and all its chats.
- **How to use:** Click the header to select the workspace. Right-click opens the app's own workspace menu.
- **Video:** not applicable (static card, covered by the nested chats clip)

*Branch cards with their title, path and chats (fixture)*

### 3. Plan usage

Shows how much of your Claude and Codex plan is used (not the context window), in two forms: rings in the left rail, or one compact line in the project sidebar footer. Hovering opens a popover with every window.

**Files:** `feature/usage-bar.js`, `feature/usage-bar.css`, `feature/bin/claude-usage-oauth.mjs`

**Original Tempo, before the mod:**

*Before: original Tempo footer with no usage information*

**Shortcut:** Hover the footer line (click to pin, Esc closes)

**Captured in the app** (`evidence/usage-bar/`, 2026-10-18T21:27:54.085Z):

*After: the “Used” line in the footer with the Usage panel open*

*Hover opens the Usage panel, a click pins it, Esc closes it*

*Without the RE-TEMPO sidebar: usage rings in the rail open the same panel*

*Compact usage line in the sidebar footer*

*Two usage rings in the rail (time to reset in the center)*

#### 3.1 Usage rings

- **What changed:** Before: no plan usage anywhere. Now: two rings above the bug button in the rail, Claude on top and Codex below. The fill is the percent used of the shortest window; the centre is the time until reset (4h, 5d, 28m).
- **How to use:** Hover the rings to open the popover. A click pins it.

*Two usage rings (4h and 7d) above the footer, with the Usage popover open.*

*Hovering the rings opens the usage popover (fixture)*

#### 3.2 Footer usage line

- **What changed:** Now: when the project sidebar is on, the rings give way to one line in its footer: Claude's percent and time left, then Codex's, then a refresh arrow.
- **How to use:** Hover the line to open the popover.
- **Video:** shown in the clip of 3.1 (Usage rings)

*Compact footer line showing used percentage and time to reset for Claude and Codex.*

*The usage line at the bottom of the sidebar (fixture)*

#### 3.3 Usage popover and footer line

- **What changed:** Now: hover (or click) opens a 'Usage' popover upward, with 'Updated … ago' and a refresh button. Each provider lists up to three windows, shortest first, with a thin bar, the percent and the time to reset. Bars turn amber from 80% and red from 95%.
- **How to use:** Hover the line or the rings. Click pins it; click again, Esc or a click outside closes it.

*Hovering the footer line opens the Usage popover with session, weekly and Codex windows.*

*The popover with Claude and Codex windows (fixture)*

#### 3.4 Per-model weekly limits

- **What changed:** Now: a small helper script asks the installed Claude CLI for the weekly limit of each model (for example Fable). It sends no message, reads no token and writes one local file that the popover reads. It runs when the popover opens with old data, and every 15 minutes.
- **How to use:** Automatic. To run it by hand, with HOME set to your real home folder: node feature/bin/claude-usage-oauth.mjs
- **Video:** not applicable (background helper, only its result is visible)

*The Claude block of the popover with the per-model Fable row (fixture)*

## Panes, tabs and decks

### 4. Free pane layout (panes and decks)

Orca-style free layout: drag tabs into panes that split in any direction, with resizable dividers, decks, undo, per-pane + menus, a Solo mode and placeholders for tabs moved to another window. It uses the app's own popout tab store, so the app bundle is not edited.

**Files:** `feature/pane-dock.js`, `feature/pane-dock.css`

**Original Tempo, before the mod:**

*Before: the center shows one view at a time; chat, canvas and terminal are tabs (all mods except pane-dock, center only).*

**Shortcut:** Drag a tab to a pane edge; ⌘Z / ⌘⇧Z (undo / redo layout)

**Captured in the app** (`evidence/pane-dock/`, 2026-10-18T21:30:53.606Z):

*After: chat on the left, canvas and terminal stacked on the right, each pane with its own tab bar.*

*Dragging the canvas tab to the right edge, the terminal to the bottom of that pane, then resizing with the divider.*

*⌘Z undoes the two splits one step at a time; ⌘⇧Z redoes them.*

*While dragging, the target half of the pane is outlined before you drop ("New split").*

**In the real app:**

*One large pane on top and two panes below, each with its own tab bar.*

#### 4.1 Drop overlay with edge splits

- **What changed:** Before: the center is one block and a tab can only be reordered or popped out into a separate window. Now: dragging a tab over a pane shows a drop overlay. The edges (25% of the pane) preview a split in that direction, and dropping there puts the tab in a new pane.
- **How to use:** Drag a tab from the tab bar to the left, right, top or bottom edge of a pane, then let go.

*A tab dragged to the right edge opens a new pane (fixture)*

*The edge shows where the new pane will appear (fixture)*

*Result: the tab lives in its own pane on the right (fixture)*

#### 4.2 Drop on a pane's tab bar

- **What changed:** Before: no panes, so tabs could only be reordered in one bar. Now: dropping a tab on another pane's tab bar opens a slot under the pointer and the tab joins that pane between its tabs. Dropping over the pane body adds it at the end and the pane gets a thin accent outline.
- **How to use:** Drag a tab over another pane's tab bar (slot opens), or over its body (center), then drop.

*A tab dropped on another pane's tab bar (fixture)*

*A slot opens where the tab will land (fixture)*

*Result: the tab sits between the pane's tabs (fixture)*

#### 4.3 Nested splits

- **What changed:** Before: at most the app's own two-panel split view. Now: splits can be nested without limit, mixing rows and columns, and every pane has its own tab bar.
- **How to use:** Repeat the edge drop inside any pane, or use the split button at the right end of a pane's header.
- **Video:** not applicable (built by repeating the edge-split clip; the divider clip shows a nested layout)

*One tall pane on the left, a pane with three tabs and a pane below it on the right (fixture)*

#### 4.4 Resizable dividers

- **What changed:** Before: the split view had one fixed divider. Now: every divider between panes can be dragged, vertical and horizontal ones alike.
- **How to use:** Hover a divider (it turns blue) and drag.

*Dragging a vertical and then a horizontal divider (fixture)*

*The left pane is made narrower; the divider is highlighted (fixture)*

#### 4.5 Closing a pane, undo and redo

- **What changed:** Before: no panes to close or undo. Now: a pane left without tabs collapses. Cmd+Z (Ctrl+Z) undoes the last layout or deck change (a split, a tab moved between panes, a pane closed, a deck created, removed, renamed or reordered), several presses undo several, and Cmd+Shift+Z (Ctrl+Shift+Z, Ctrl+Y) redoes. Each workspace has its own history. The shortcut only acts when nothing else owns it (typing, the canvas, a webview).
- **How to use:** Close the last tab of a pane, then press Cmd+Z. Cmd+Shift+Z goes forward again.

*Closing a pane's only tab collapses it, Cmd+Z brings it back (fixture)*

*The bottom pane collapsed after its last tab closed (fixture)*

*After Cmd+Z the pane is back (fixture)*

#### 4.6 Decks: several arrangements per workspace

- **What changed:** Before: one set of tabs per workspace. Now: each workspace keeps several named decks. A deck is a whole arrangement (the layout, which tab sits in which pane, the tabs the center shows and its active chat). Switching hides the other decks' tabs (they are not closed). A tab belongs to one deck only, a new deck starts with a new chat, a deck left without tabs goes away (except the workspace's last one), and decks are saved and come back on reload. Decks have numbered names (Deck 01, Deck 02...). Other mods use window.__RE_TEMPO_DECKS__.
- **How to use:** Create a deck from the sidebar's deck cards and click a card to switch. The clip uses a small stand-in bar for those cards.

*Create Deck 02, then switch back to Deck 01 with its split (fixture)*

*Deck 01: center tabs plus a pane on the right (fixture)*

*Deck 02: only its own new chat is visible (fixture)*

*Back on Deck 01: its tabs and its split are back (fixture)*

#### 4.7 A + button in every pane

- **What changed:** Before: only the center had a + menu. Now: each pane has its own + right after its last tab, with the same items (New Chat, Canvas, Doc, Issue, Terminal, Browser, and Open for existing canvases, docs, issues and files). The app's own action runs and the new tab lands in that pane. The Open in split view button sits at the right end of the header.
- **How to use:** Click the + in a pane's header and pick an item.

*Pane + menu, then New Chat opens inside that pane (fixture)*

*The pane's + menu (fixture)*

*The new chat tab is inside the pane (fixture)*

#### 4.8 Pane header look

- **What changed:** Before: the split view had its own plain headers. Now: every pane header looks like the center's: same tab shape, active tab highlight, close buttons, + and split buttons.
- **Video:** not applicable (static styling, visible in every pane clip)

*Center header (left) and a pane header with three tabs (right) (fixture)*

#### 4.9 Several canvases at once

- **What changed:** Before: one canvas on screen at a time. Now: any number of canvases can be open in different panes, each with its own view, selection and undo. Opening a canvas that is already on screen gives the new pane its own second copy instead of moving the first one. The chat's canvas selection follows the last clicked canvas.
- **How to use:** Use a pane's + > Open and pick a canvas, or Open in split view on a canvas tab.

*Four different canvases, then a second copy of one (fixture)*

*The same canvas (beta) open in two panes (fixture)*

#### 4.10 Drop a chat on + to start a new workspace

- **What changed:** Before: no way to branch a chat into a workspace by dragging. Now: dropping a chat tab on a + (a pane's or the center's) turns the + into a New workspace pill, the tab flies into it, a new workspace is created with a copy of that chat and a toast offers Undo.
- **How to use:** Drag a chat tab over a + and drop it there.

*A chat dragged onto a pane's + becomes a new workspace (fixture)*

*The + grows into the New workspace pill (fixture)*

*Toast after the drop, with Undo (fixture)*

#### 4.11 Layout is saved and restored

- **What changed:** Before: nothing to save. Now: the panes, their sizes and tabs are saved per workspace (localStorage) and come back when the window reloads.

*The same panes come back after a reload (fixture)*

*Layout before the reload (fixture)*

*Layout after the reload (fixture)*

#### 4.12 Panes only on the chat route

- **What changed:** The dock works only on the chat route with a workspace open. On other routes the panes are hidden and the app looks normal; they return when you come back to chat.
- **Video:** not applicable (static switch with no motion)

*Chat route: panes visible (fixture)*

*Another route: no panes (fixture)*

#### 4.13 Solo mode

- **What changed:** Before: no way to focus one pane. Now: one pane, or the center, fills the whole area for a while. The other panes are hidden, not closed, and Exit solo brings the layout back as it was.
- **How to use:** Press Cmd+Shift+Enter, or click the solo button in a pane's header. Esc or Exit solo leaves.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*A pane in solo, with Exit solo at the top right (fixture)*

*The center in solo (fixture)*

#### 4.14 Placeholder for a tab in an external window

- **What changed:** Before: a tab torn out into a popout window simply left its pane. Now: its spot shows Open in external window with Bring back and Focus window, and the tab returns to the same pane and position when that window closes.
- **How to use:** Click Bring back to return the tab, or Focus window to jump to it.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*Placeholder in a pane for a tab open in another window (fixture)*

*The same placeholder in the center (fixture)*

#### 4.15 Canvas popovers stay in their pane

- **What changed:** Before: a canvas in a pane drew its comment composer, menus and tooltips relative to the whole window. Now: they stay inside that pane.
- **How to use:** Open a canvas in a pane and comment or open a menu: it opens in that pane.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*A comment composer kept inside the right pane (fixture)*

#### 4.16 Empty panes and decks

- **What changed:** A pane without tabs collapses and its neighbours take the room. The center hides when none of its tabs is left. A deck is never empty: a new deck starts with a new chat and a deck left without tabs goes away.
- **How to use:** Close the last tab of a pane or deck.
- **Video:** not applicable (the close-and-undo clip shows a pane collapsing)

*Center hidden: the remaining pane fills the area (fixture)*

#### 4.17 Deck API: Close all and Move tabs

- **What changed:** Other mods can now close every tab of a deck (closeAll) or move tabs to another deck (moveTabs) through window.__RE_TEMPO_DECKS__, with undo. The project sidebar uses it for its deck menu.
- **How to use:** In the sidebar, open a deck's menu and pick Move tabs to or Close all tabs.
- **Video:** not applicable (an API; the deck menu clip in the sidebar shows it)

*Deck menu in the sidebar with Move tabs to and Close all tabs (fixture)*

### 5. Close button on the primary chat tab

Every center tab gets a close button, including the first chat tab, which the original app shows without one. Closing never deletes the chat.

**Files:** `feature/tab-close.js`, `feature/tab-close.css`

**Original Tempo, before the mod:**

*Before: the main chat tab has no close button (native Chats sidebar on both sides).*

**Shortcut:** Click × or middle-click the tab

**Captured in the app** (`evidence/tab-close/`, 2026-10-18T21:38:17.952Z):

*After: the same tab with a close button.*

*Closing the main chat tab hides it; clicking the chat in the sidebar brings it back.*

#### 5.1 Close button on the primary chat tab

- **What changed:** Before: the first (primary) chat tab of the center bar has no close button and middle click does nothing. Now it has the same x as other tabs. Closing it only hides the tab: the chat, its session and its sidebar row are kept. The neighbour tab opens, and the tab comes back when you open the chat again (sidebar click, shortcut, or the app falling back to it). A middle click does the same.
- **How to use:** Click the x on the first tab, or middle click it.

*The first chat tab now shows a close button, like every other tab.*

*Closing the primary tab hides it, picking the chat again brings it back (fixture)*

*The first tab now shows a close x (fixture)*

*After closing: the tab is hidden and a neighbour is open (fixture)*

#### 5.2 Closing the only tab opens a fresh chat

- **What changed:** Before: nothing happened (no button). Now: when the primary tab is the only tab in the bar, closing it opens a fresh New Chat (an existing empty draft is reused) like the app does when the last chat goes away. The old chat is not deleted. On an empty draft alone in its workspace, the tab just shakes.
- **How to use:** Click the x on a chat tab that has no other tabs next to it.

*Closing the lone chat tab opens a New Chat (fixture)*

## Canvas

### 6. Quick access to canvases

Canvases are reachable without the big Open window. The + menu has an Open submenu, the Canvas page pill has a switcher, the left rail has a new order with matching Ctrl+number keys, and canvas controls moved into the canvas.

**Files:** `feature/canvas-quick.js`, `feature/canvas-quick.css`

**Original Tempo, before the mod:**

*Original Tempo: the "+" menu has Open, with no submenu (simulated data)*

**Shortcut:** Hover "+" › Open ›

**Captured in the app** (`evidence/canvas-quick/`, 2026-10-18T21:43:52.864Z):

*With the mod: hovering Open › lists recent canvases and Search all… (simulated data)*

*Opening a recent canvas straight from the Open › submenu (simulated data)*

*Switching the canvas of this tab from the name pill (simulated data)*

*The canvas switcher opened from the name pill (simulated data)*

*Original Tempo: the pill shows only the canvas name (simulated data)*

*Original rail with Ctrl held: Chat 1, Docs 2, Design 3 (simulated data)*

*With the mod, Ctrl held: Chat 1, Design 2, Docs 3 (simulated data)*

#### 6.1 Plus menu with Open submenu

- **What changed:** Before: Open in the + menu always opened a big search window. Now: pointing at Open shows the 8 most recent canvases and Search all.... Clicking Open itself still opens the original window.
- **How to use:** Click +, then hover Open (or press Right Arrow on it). Pick a canvas, or use Up/Down, Enter, Left and Esc.

*The plus menu has an Open entry with a chevron that leads to recent canvases.*

*Hovering Open in the + menu and picking a recent canvas (fixture)*

#### 6.2 Canvas switcher on the page pill

- **What changed:** Before: the floating Canvas page pill only showed the name. Now: a small chevron next to the name opens one Canvases list: canvases open in tabs (dot, current one checked), then other recent canvases of the project, then Open.... Picking one shows it in the same tab and pane, with no jump to another tab.
- **How to use:** Click the name or chevron on the Canvas page pill (top left of a canvas, shown while its left panel is closed), then choose a canvas.

*The canvas name pill opens a list of canvases open in tabs and recent ones, with Open at the bottom.*

*Opening the pill switcher and picking another canvas in the same tab (fixture)*

*The switcher list: open canvases, recents, Open... (fixture)*

#### 6.3 Left rail order and Ctrl+number keys

- **What changed:** Before: the left rail order was Chat, Docs, Design, Issues, Agents. Now: Design sits second (Chat, Design, Docs, Issues, Agents) and the number hints and Ctrl+1...9 follow what you see on screen. Tab inside the rail follows the same order.
- **How to use:** Hold Ctrl to see the numbers, then press Ctrl+1 to Ctrl+5.

*Holding Ctrl shows the hints, then Ctrl+2, Ctrl+3 and Ctrl+1 jump to Design, Docs and Chat (fixture)*

*After Ctrl+2 the second item (Design) is open (fixture)*

#### 6.4 Right sidebar toggle inside the canvas

- **What changed:** Before: the right sidebar toggle lived in the title bar and next to the zoom/Share toolbar. Now (pen.dev style): while the panel is open the toggle is at the end of the panel's tab row; while it is closed a small pill with the canvas name and the toggle floats under the zoom/Share toolbar. The Pop out canvas button (four arrows) is hidden.
- **How to use:** Click the toggle in the canvas. It presses the app's own hidden toggle.

*Closing the right panel turns the toggle into a floating pill; clicking it opens the panel again (fixture)*

*Panel open: the toggle sits at the end of the tab row (fixture)*

#### 6.5 Row actions in the switcher

- **What changed:** Before: canvases could not be renamed or deleted from a quick list. Now: each row shows a ... button on hover with Open in new tab, Rename... (inline, Enter saves, Esc cancels) and Delete... (asks for confirmation first). They use the app's own handlers.
- **How to use:** Hover a row in the switcher, click the ... button, and choose an action.

*Rename a canvas inline, then open the delete confirmation and cancel (fixture)*

*Delete confirmation dialog (fixture)*

### 7. Canvas setup starts by itself

When a workspace shows the Set up canvases empty state, the mod presses the app's own setup button once and sends the setup prompt, then shows a short toast.

**Files:** `feature/canvas-autosetup.js`, `feature/canvas-autosetup.css`

**Original Tempo, before the mod:**

*Original Tempo: the canvas setup empty state on the Design home (simulated data)*

**Captured in the app** (`evidence/canvas-autosetup/`, 2026-10-18T21:43:52.865Z):

*With the mod (simulated): the "Setting up canvases automatically…" toast (simulated data)*

*Opening Design: the mod presses setup by itself (simulated, no chat, no AI) (simulated data)*

*Mod on, real "This branch needs canvas setup" variant: no action, by design (simulated data)*

*The mod's toast up close (simulated data)*

**In the real app:**

*The Design home empty state ("Set up canvases") that the mod presses automatically once per workspace.*

#### 7.1 Auto-start of canvas setup

- **What changed:** Before: you had to click Set up canvases, then press Send in the new chat. Now: after about 0.8 seconds on that screen the mod clicks the button for you, opens the new chat and (by default) sends the setup prompt. It runs once per workspace and shows a toast that says why a chat opened. This starts one AI agent run. Turn off with localStorage re-tempo:canvas-autosetup-off=1, or stop only the sending with re-tempo:canvas-autosetup-send=0.
- **How to use:** Automatic. Open the Design home of a workspace with no canvases.

*The empty state, then the new chat with the prompt sent and the toast (fixture)*

*The Set up canvases empty state before the mod acts (fixture)*

### 8. Paste image at the pointer

Pasting an image on a canvas puts its top-left corner at the mouse pointer, instead of a far-away default spot.

**Files:** `feature/canvas-paste.js`

**Original Tempo, before the mod:**

*Original Tempo: the pointer was mid-canvas; the pasted image (highlighted) went to the far right (simulated data)*

**Shortcut:** ⌘V

**Captured in the app** (`evidence/canvas-paste/`, 2026-10-18T21:43:52.865Z):

*With the mod: the image lands with its corner at the pointer (simulated data)*

*With the mod: two pastes, each at the pointer (simulated data)*

*Original Tempo: ⌘V shows nothing near the pointer; the image appears far away (simulated data)*

#### 8.1 Image lands at the mouse pointer

- **What changed:** Before: Cmd+V with a screenshot dropped the image at a slot to the right of the other storyboards. Now: it lands exactly under the pointer, using the app's own Paste here code. Text, Tempo elements, Figma, links and pasting into inputs still use the original paste.
- **How to use:** Move the pointer over the canvas where you want the image and press Cmd+V.

*Original behaviour first (image goes far right), then the mod puts the image at the pointer (fixture)*

*Original behaviour: the image lands far from the pointer (fixture)*

### 9. Canvas keys

Adds the few single-key canvas shortcuts the original Tempo is missing. It never re-binds keys the app already owns, so nothing fires twice.

**Files:** `feature/canvas-keys.js`

**Original Tempo, before the mod:**

*Original Tempo: pressing ? on the canvas does nothing*

**Shortcut:** ? · C · Shift+0

**Captured in the app** (`evidence/canvas-keys/`, 2026-10-18T21:43:52.865Z):

*With the mod: ? opens the Canvas shortcuts sheet*

*?, Esc, C (Comment tool) and Shift+0 (zoom to 100%)*

*The shortcut sheet up close*

*Key C: the Comment button turns on in the toolbar*

#### 9.1 C opens the Comment tool

- **What changed:** Before: the Comment tool could only be picked with the mouse in the bottom toolbar. Now: one key press toggles it, like clicking the button.
- **How to use:** Press C while the canvas is on screen and focus is not in a text field.

*Pressing C, Shift+0 and ? on the canvas, with a key badge (animated) (fixture)*

*The Comment tool armed after pressing C (fixture)*

#### 9.2 Shift+0 zooms to 100%

- **What changed:** Before: zoom to 100% needed the zoom menu. Now: Shift+0 opens the menu and runs the app's own "Zoom to 100%" item.
- **How to use:** Press Shift+0 on the canvas.

*Shift+0 resets the canvas zoom to 100% (animated) (fixture)*

*Canvas at 100% after Shift+0 (fixture)*

#### 9.3 ? shortcut sheet

- **What changed:** Before: no quick list of canvas shortcuts. Now: a small card lists the native and the added shortcuts, with a link to the app's full shortcuts dialog.
- **How to use:** Press ?. Close with Esc, ?, a click outside or the close button.

*The ? sheet listing all canvas shortcuts (animated) (fixture)*

*The canvas shortcut sheet (fixture)*

### 10. Canvas snap and Alt measurements

Holding Alt/Option with a storyboard selected shows exact distances to other storyboards, like Figma. The app's own snapping is left as it is.

**Files:** `feature/canvas-snap.js`, `feature/canvas-snap.css`

**Original Tempo, before the mod:**

*Original Tempo: Alt held over another storyboard, no measurement (simulated data)*

**Shortcut:** Hold Alt/Option

**Captured in the app** (`evidence/canvas-snap/`, 2026-10-18T21:43:52.865Z):

*With the mod: a red 465 px label between the two storyboards (simulated data)*

*Select a storyboard, hold Alt and hover: measurements appear and vanish on release (simulated data)*

*Alt over the storyboard below: vertical gap and edge offsets (simulated data)*

*Alt over empty canvas: distance to the nearest storyboard on each side (simulated data)*

#### 10.1 Alt shows the distance to another storyboard

- **What changed:** Before: Alt measurements only worked for elements inside one storyboard. Now: hover a second storyboard while holding Alt and see the gaps between them in canvas px, as small red labels on thin red lines.
- **How to use:** Select a storyboard, hold Alt/Option, hover another storyboard. Release Alt to hide.

*Alt held over a second storyboard shows the gaps (animated) (fixture)*

*Distance to a storyboard placed to the side (fixture)*

#### 10.2 Alt on empty canvas shows the nearest neighbours

- **What changed:** Before: nothing. Now: with Alt held over empty canvas, the distance to the nearest storyboard in each of the four directions is shown.
- **How to use:** Select a storyboard, hold Alt, move the mouse over empty canvas.

*Alt over empty canvas, nearest storyboard per direction (animated) (fixture)*

*Distances to the nearest storyboard in each direction (fixture)*

### 11. Browser frame on the canvas

Places a live web page on the canvas next to the storyboards, with its own address bar. It pans and zooms with the canvas and is saved per canvas.

**Files:** `feature/canvas-browser.js`, `feature/canvas-browser.css`

**Original Tempo, before the mod:**

*Original Tempo: the canvas has no browser frame (simulated data)*

**Shortcut:** W (Browser tool)

**Captured in the app** (`evidence/canvas-browser/`, 2026-10-18T21:43:52.865Z):

*With the mod: example.com loaded in a frame on the canvas (simulated data)*

*Browser tool, draw a frame, type an address: the page loads live (simulated data)*

*Move the frame by its title, resize it from a corner, zoom out (simulated data)*

*Original canvas toolbar, without the Browser tool (simulated data)*

*Canvas toolbar with the Browser tool (globe) (simulated data)*

**In the real app:**

*The plus menu gains a Browser on Canvas item that places a browser frame on the canvas.*

#### 11.1 Add a Browser frame

- **What changed:** Before: web pages lived only in the Browser tab. Now: a Browser tool in the bottom toolbar (or the + menu item "Browser on Canvas") adds a frame. An empty frame asks for a URL, then loads the page.
- **How to use:** Click the globe tool or press W, then click for a 1280x840 frame or drag to draw one. Type an address and press Enter.

*Drawing a Browser frame and loading a page (animated) (fixture)*

*The Browser tool in the bottom toolbar (fixture)*

*A new frame asks for a URL (fixture)*

*The page loaded in the frame (fixture)*

#### 11.2 Move, resize and zoom like a storyboard

- **What changed:** Before: not possible. Now: the frame moves, resizes and zooms with the canvas, with the same blue outline, handles and size label as storyboards.
- **How to use:** Drag the header or the bar to move. Drag an edge or corner to resize (Shift keeps the ratio). Ctrl+wheel zooms the canvas. Arrows nudge, Delete removes with Undo.

*Moving and resizing a Browser frame (animated) (fixture)*

*Frame moved next to the storyboards (fixture)*

*Resizing with the size label (fixture)*

*Frame scaled with the canvas zoom (fixture)*

### 12. Shader frame on the canvas

Adds a live WebGL "Shader frame" to the canvas, with a side panel to edit it and export it. Idea and shader rules copied from pen.dev.

**Files:** `feature/canvas-shader.js`, `feature/canvas-shader.css`

**Original Tempo, before the mod:**

*Original Tempo: the "+" menu has no Shader on Canvas (simulated data)*

**Shortcut:** Right-click "+" › Shader on Canvas

**Captured in the app** (`evidence/canvas-shader/`, 2026-10-18T21:43:52.865Z):

*With the mod: an animated shader frame and its side panel (simulated data)*

*Add a shader from the "+" menu, pick a preset, drag a control, open the GLSL editor (simulated data)*

*A shader as a storyboard effect: Overlay, then Background (simulated data)*

*Live GLSL editor with the Compiled log (simulated data)*

*Six presets side by side (simulated data)*

*A storyboard with a shader effect and the effect panel (simulated data)*

*Original Tempo: the storyboard Design panel without shader effects (simulated data)*

#### 12.1 Add an animated Shader frame

- **What changed:** Before: no shaders on the canvas. Now: a Shader tool adds a frame that renders a live GLSL shader. 8 presets are included. The frame moves, resizes and zooms with the canvas.
- **How to use:** Click the sparkle tool or press S, then click (800x500) or drag to draw. Drag to move, edges to resize, double-click the title to rename.

*Drawing a Shader frame, it animates, then moving it (animated) (fixture)*

*The Shader tool in the toolbar (fixture)*

*A mesh gradient frame running on the canvas (fixture)*

*Three different shader frames at once (fixture)*

*The 8 built-in presets (fixture)*

#### 12.2 Side panel controls

- **What changed:** Before: none. Now: selecting a frame opens a panel with preset, speed, play/pause and one control per shader uniform (sliders, colours, toggles, textures). The frame updates live.
- **How to use:** Click a shader frame, then drag a slider, type a colour hex or change the speed.

*Changing Distortion, a colour and Speed in the panel (animated) (fixture)*

*Panel with a slider being changed (fixture)*

*Panel with all control types (fixture)*

#### 12.3 GLSL editor

- **What changed:** Before: none. Now: a live editor shows the shader code with a compiler log. Errors are listed by line and the frame keeps showing the last working version.
- **How to use:** Select a frame and click Edit GLSL (or double-click the frame body). Esc closes it.
- **Video:** pending (panel and editor typing already covered by the controls clip; editor needs a text-entry clip)

*GLSL editor with a compile error in the log (fixture)*

#### 12.4 Export PNG, WebM and embed code

- **What changed:** Before: none. Now: the panel exports the current image as PNG, a 5 s WebM recording, or a standalone HTML embed snippet.
- **How to use:** Select a frame and click PNG, WebM or Embed in the Export section.
- **Video:** pending (exports are file downloads, nothing to film)

*PNG export of a glass shader frame (fixture)*

*The embed snippet running on its own (fixture)*

### 13. Canvas layout like pen.dev

The design canvas gets pen.dev's layout: a floating left card with tabs, a compact vertical tool rail, a composer at the bottom, a selection pill whose dropdown holds the properties, zoom at the bottom right and pills at the top. The app's own panels and buttons are reused, only placed differently.

**Files:** `feature/canvas-chrome.js`, `feature/canvas-chrome.css`

#### 13.1 Floating left card with tabs

- **What changed:** Before: the canvas's left panel was a fixed column. Now: it floats over the canvas as a rounded card with a tab row: Agent and Layers, then Prototype, Components and Library once a mod fills them. Layers is the native panel, untouched.
- **How to use:** Open or close it as before (the round toggle or Cmd+\). Click a tab to switch.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*Left card on the Layers tab, with the tool rail beside it (fixture)*

*Left card closed: the rail moves to the left edge (fixture)*

#### 13.2 Agent tab with the canvas chat

- **What changed:** Before: the canvas chat lived in a Chat tab of the right panel. Now: the Agent tab of the left card shows that same chat view, drawn over the tab, and the right panel's Chat tab is hidden meanwhile.
- **How to use:** Click Agent in the left card. If the chat is not mounted yet, click Open chat.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*Agent tab showing the canvas chat and its composer (fixture)*

#### 13.3 Compact vertical tool rail

- **What changed:** Before: the Design tools bar sat at the bottom centre. Now: the same buttons, shortcuts and menus form a compact rail with pen.dev's sizes, next to the left card. Tools with options show a small corner mark and open their menu on a long press. If the rail does not fit, the horizontal bar stays above the composer.
- **How to use:** Use the tools as before. Press and hold a tool with a corner mark to see its options.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*pen.dev's rail (left) next to the new rail (right) (fixture)*

*Card closed: pen.dev (left) and the new layout (right) (fixture)*

#### 13.4 Composer and chat chip at the bottom

- **What changed:** Before: prompts went through the chat panel only. Now: a floating composer ("Design anything…", effort, model, send) sits at the bottom centre, with a chip above it: the chat button, the active chat's title and the agents working on comments. Enter sends an agent task anchored to the selection; Cmd+Enter sends to the canvas chat.
- **How to use:** Type in the composer at the bottom and press Enter, or Cmd+Enter for the chat. Shift+Enter adds a line.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*pen.dev's composer (top) and the new one with its chip (bottom) (fixture)*

*Whole view: top pills, rail, composer and zoom (fixture)*

#### 13.5 Selection pill with the properties dropdown

- **What changed:** Before: the right panel was a docked column. Now: a pill at the top right shows the selection's icon and title, and its toggle opens the properties as an animated dropdown under it, in pen.dev's order: Alignment, Position, Layout, Appearance, Typography, Fill, Stroke, Effects, Transforms, then Code and Export.
- **How to use:** Select something, then click the panel icon in the selection pill.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*Selection pill: pen.dev (left) and the new one (right) (fixture)*

*Properties dropdown: pen.dev (left) and the new one (right) (fixture)*

#### 13.6 Zoom and the top pills

- **What changed:** Before: zoom was a button in the canvas controls. Now: "- 116% +" sits at the bottom right and the level opens the native zoom menu. The top left pill shows the canvas name, and the top right pill holds Share plus actions other mods add, such as the browser globe.
- **How to use:** Click - or +, or click the level for Zoom to fit, 50%, 100%, 200% and Snap to guides.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*Zoom menu opened from the level at the bottom right (fixture)*

*Overall look: pen.dev (left) and the new canvas (right) (fixture)*

#### 13.7 Off switch and API for other mods

- **What changed:** Setting the flag off gives back the previous layout at once. Other mods add tabs, right-panel sections, tools and top-right buttons through registerLeftTab, registerRightSection, registerTool and registerTopAction.
- **How to use:** localStorage "rtd.canvasChrome" = "off" turns the layout off.
- **Video:** not applicable (a flag and an API, no motion to show)

*With the flag off: the native layout, tools back at the bottom (fixture)*

### 14. Code and Export in the canvas panel

With one storyboard selected, the canvas's right panel gets pen.dev's Code and Export sections: copy or export its HTML (Tailwind, plain CSS or React), import a web page as a browser frame, and export the storyboard as PNG, JPEG, WebP or PDF at 1x to 3x.

**Files:** `feature/canvas-export.js`, `feature/canvas-export.css`

#### 14.1 Code section

- **What changed:** Before: no way to get a storyboard's code from the panel. Now: pick HTML + Tailwind, HTML + CSS or React (JSX), then Copy HTML or Export HTML. Export writes a standalone page into the canvas's exports folder, with its CSS inlined and images embedded.
- **How to use:** Select a storyboard, pick the format in Code, then click Copy HTML or Export HTML. The gear has Copy as a full page, Embed images and Open exports folder.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*The new Code and Export sections after Effects (fixture)*

*Code options behind the gear (fixture)*

*An exported HTML + CSS page opened in a browser (fixture)*

#### 14.2 Import a web page via Browser

- **What changed:** Now: a small popover asks for a URL and creates a browser frame on the canvas, right of the storyboard and with the same width.
- **How to use:** Click Import Web via Browser, type the address, then Import.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*The Import web page popover (fixture)*

*The browser frame created next to the storyboard (fixture)*

#### 14.3 Export layer as PNG, JPEG, WebP or PDF

- **What changed:** Before: no image export of a storyboard. Now: pick 1x, 2x or 3x and a format, then Export layer. Large storyboards are captured in tiles and stitched, and PDF pages match the storyboard's size.
- **How to use:** Pick the scale and format in Export, then click Export layer. Cmd+Shift+E jumps to Export.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*Selected storyboard with the panel on the right (fixture)*

*Page of the exported PDF (fixture)*

### 15. Sticky notes that run as prompts

A Sticky note tool (key N), copied from pen.dev, drops notes on the canvas. A Prompt note has a Run button that sends its text to the agent as a canvas task, and the note then shows that task's status and summary.

**Files:** `feature/canvas-notes.js`, `feature/canvas-notes.css`

#### 15.1 Sticky note tool

- **What changed:** Before: no notes on the canvas. Now: press N and click to drop a note, or drag to draw one. A note is a Prompt (blue) or a Note (yellow), can be moved and resized, and Delete shows a 5 s Undo.
- **How to use:** Press N (or the Sticky note tool), click on the canvas and type. Double click a note to edit it again.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*A Prompt note being written over a storyboard (fixture)*

#### 15.2 Run a note as a prompt

- **What changed:** Now: Run sends the note's text to the agent with the composer's model and effort. The note shows queued, running, needs input, done with a short summary, or failed with Retry, and follows the storyboard under it.
- **How to use:** Write the prompt and click Run. Click Open to see the task's panel.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*The note after Run: Done, with the agent's summary (fixture)*

*The task panel a note opens: before and after, plus the summary (fixture)*

### 16. Properties panel for frames and notes

Browser frames, shader frames and sticky notes get pen.dev's properties sections in the canvas's right panel, so they can be edited by hand without asking the agent. Each edit is written into the canvas file.

**Files:** `feature/canvas-props.js`, `feature/canvas-props.css`

#### 16.1 Position, size and appearance fields

- **What changed:** Before: these frames and notes could only be moved or resized with the mouse. Now: when one is selected, the right panel shows its name, X and Y, W and H with a ratio lock, and opacity, corner radius and clip content.
- **How to use:** Select a browser frame, shader frame or note, then type in a field. Drag a field's label sideways to scrub (Shift for x10), use the arrow keys to step, or type arithmetic such as 120+40.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*A selected browser frame and its properties on the right (fixture)*

*Position, Dimensions, Appearance and Browser sections (fixture)*

#### 16.2 Browser, Shader and Note sections

- **What changed:** Each kind gets its own section. Browser has the URL, "name follows the page title", Reload and Open in browser. Shader has the preset, speed and Edit GLSL. Note has Prompt or Note, model, effort and the text.
- **How to use:** Select the frame or note and use its section under Appearance.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*A selected note with its Note section (fixture)*

*Note section: type, model, effort and text (fixture)*

#### 16.3 Undo for manual edits

- **What changed:** The app's canvas undo does not know these nodes, so the mod keeps its own history of 20 steps. Arrow steps on the same field within 1 s count as one.
- **How to use:** Cmd+Z and Cmd+Shift+Z while a frame or note is selected or the panel has focus. localStorage "rtd.canvasProps" = "off" removes the panel.
- **Video:** not applicable (keyboard history with no visual of its own)

*The fields that undo applies to (fixture)*

### 17. Browser card inside the canvas

A globe in the canvas's top right pill opens pen.dev's side browser as a card floating inside the canvas. From it a page, one element or a screenshot can be brought onto the canvas.

**Files:** `feature/canvas-webpanel.js`, `feature/canvas-webpanel.css`

#### 17.1 Browser card and globe button

- **What changed:** Before: browsing meant a separate Browser tab or a browser frame placed on the canvas. Now: the globe opens a card 12 px inside the canvas edges, the canvas stays visible around it and the floating pieces on the right move left. It works on the Design route, in chat canvas tabs and in panes.
- **How to use:** Click the globe in the top right pill, or press Option+Cmd+B with a canvas on screen. Esc inside the card closes it.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*The globe's tooltip in the top right pill (fixture)*

*A page open in the card, next to the storyboard (fixture)*

*pen.dev's side browser (left) and the new card (right) (fixture)*

#### 17.2 Import full page, element or screenshot

- **What changed:** Import the full page adds a browser frame and, when the page can be read, an editable storyboard copy. Import an element lets you pick one element in the page and drops it as an editable copy. The camera drops a screenshot as an image storyboard.
- **How to use:** Pick a mode in the empty card or use Import and the camera in the bar. In element mode, hover and click; Esc cancels.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*Empty card: Import from the web and the three modes (fixture)*

#### 17.3 Recent pages

- **What changed:** The empty card lists the last 10 pages with Clear All, and offers localhost:3000 and localhost:5173 while the list is empty.
- **How to use:** Click a recent page to open it again.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*Recent list in the empty card (fixture)*

#### 17.4 Resize, expand, mobile or desktop

- **What changed:** The card's left edge and bottom can be dragged, and Expand makes it cover the whole canvas view. The address bar switches between a mobile (390 px) and a desktop (1280 px) viewport, and the … menu has Open in browser, Copy URL and Reset width.
- **How to use:** Drag the left or bottom edge, click Expand, or use the phone icon in the address field.
- **Video:** pending (no clip recorded yet (new feature, 2026-10-18))

*Mobile viewport in the card (fixture)*

*Expanded card over the whole canvas view (fixture)*

*The … menu (fixture)*

*The card in a chat canvas tab (fixture)*

### 18. Canvas comment as a Claude task

In the original Tempo a canvas comment is only a note for people. Now every comment you post on a canvas also becomes a task for a Claude chat that works in the background while you stay on the canvas.

**Files:** `feature/canvas-comment-agent.js`, `feature/canvas-comment-agent.css`

**Original Tempo, before the mod:**

*Original Tempo: the canvas with comment pins and nothing over the sidebar (simulated data)*

**Shortcut:** Canvas comment tool

**Captured in the app** (`evidence/canvas-comment-agent/`, 2026-10-18T21:38:47.554Z):

*With the mod: a compact task list at the bottom left (author, request, time running) (simulated data)*

*Comment on the canvas; the task joins the list (simulated data)*

*Task list close-up: one waiting for an answer, two working (simulated data)*

#### 18.1 Canvas comment as a Claude task

- **What changed:** Before: a comment was just text on the canvas and nothing happened. Now: when you post a comment (a new thread or a reply), a Claude chat is created and sent the comment, the pin position, the storyboard under it and the page. The task goes from queued to running to done.
- **How to use:** Click the canvas in comment mode, write what you want (for example "add a blue square here") and press Post. Nothing else to do.

*A canvas comment appears as a Claude task row in a deck of the project sidebar.*

*Same clip as a GIF (fixture)*

*The comment is typed, ready to post (fixture)*

*The agent is done: the blue square is on the canvas (fixture)*

#### 18.2 Runs in the background

- **What changed:** Before: starting a chat moves you to the chat view. Now: the chat is created and started without leaving the canvas: same tab, same route, no chat view and no composer. The chat still appears in the chat list.
- **How to use:** Automatic. Use Open chat in the bubble panel if you want to see the full chat.
- **Video:** shown in the clip of 18.1 (Canvas comment as a Claude task)

*The designer stays on the canvas while the agent works (fixture)*

#### 18.3 Before / after captures and run GIF

- **What changed:** Before: no record of what the change looked like. Now: the mod takes a screenshot of the commented area before the run, frames while it runs and one after, and builds a small looping GIF of the whole run. Panels and bubbles are masked out of the images.
- **How to use:** Automatic. See the images in the bubble panel (Result).

*Result with before, after and the run GIF (fixture)*

*A sample run GIF produced by the mod (a square appears) (fixture)*

#### 18.4 Agent answer to a canvas comment

- **What changed:** Before: the thread had only people's messages. Now: when the run ends, the agent's answer is posted in the comment thread with its name, model, before/after images and the GIF attached.
- **How to use:** Automatic when a run is done. Turn off with localStorage rtd.commentAgent.reply = off.
- **Video:** pending (shows only in the real comment thread (fixture print only))

*The agent reports Done after acting on a comment left on the canvas.*

*The comment thread with Claude's answer, before/after and GIF (fixture)*

#### 18.5 Fallback task list

- **What changed:** Before: none. Now: if the bubbles mod is not loaded, a small list over the left sidebar shows each task (spinning logo while running, check when done, click to open the chat).
- **How to use:** Appears by itself while tasks exist.
- **Video:** pending (hidden whenever the bubbles are on)

*Mini list with a running task (fixture)*

### 19. Comment bubbles

Next to the "Canvas page" pill there is now a row of small bubbles, one per comment you sent to an agent. Each bubble shows the status and opens a panel with what you asked and what the agent did.

**Files:** `feature/comment-bubbles.js`, `feature/comment-bubbles.css`

**Original Tempo, before the mod:**

*Original Tempo: only the canvas name pill (simulated data)*

**Shortcut:** Click a bubble · Alt/Option-click to follow

**Captured in the app** (`evidence/comment-bubbles/`, 2026-10-18T21:38:47.555Z):

*With the mod: the pill gains a segment with the counter and task bubbles (simulated data)*

*Bubble tooltip, panel with the agent's question, and a finished task with before/after (simulated data)*

*An agent finishes: its bubble gets a check and the counter updates (simulated data)*

*Full window with the bubble segment on the canvas (simulated data)*

*Panel of a task waiting for an answer: amber card with the question and the answer field (simulated data)*

*Panel of a finished task: Before (green card) and After (orange card) (simulated data)*

**In the real app:**

*Agent bubbles sit right next to the canvas name pill, with a "done today" count, a red badge for tasks that need attention and a check for finished ones.*

*The pill segment counts finished comment tasks ("3 done today") and shows one bubble per task.*

*Clicking a bubble opens a card with the original request, the agent result, a reply box and an Open chat button.*

#### 19.1 Bubbles next to the Canvas page pill

- **What changed:** Before: nothing showed which comments an agent was working on. Now: a counter ("3 open - 1 done today") and bubbles with the author's initials. The ring shows the status: amber with ? needs input, spinning Claude ring running, dashed queued, red ! failed, green check done.
- **How to use:** Automatic. Alt-click a bubble to follow the agent.

*Four bubbles in different states next to the page name (fixture)*

*Video: A bubble going from queued to running to done (fixture)*

*The done bubble with the green check (fixture)*

#### 19.2 Bubble tooltip

- **What changed:** Before: none. Now: hover a bubble to see its number, author, status and request. A running agent shows its last captured frame, a done one shows the result.
- **How to use:** Hover a bubble.
- **Video:** pending (hover is part of the open-bubble clip)

*Tooltip over a done bubble (fixture)*

#### 19.3 Request panel

- **What changed:** Before: none. Now: click a bubble to open a panel with You asked (comment and before image), Agent (steps), Result (before/after, run GIF, summary) and a footer to reply, open the chat, follow or dismiss.
- **How to use:** Click a bubble. Escape or a click outside closes it. Hold Shift to peek at Before.

*Same clip as a GIF (fixture)*

*The result with before/after and GIF player (fixture)*

#### 19.4 Answer an agent that needs input

- **What changed:** Before: you had to find the chat. Now: when the agent asks a question, the bubble turns amber and the panel shows the question with an answer field already focused. The steps are folded into "N steps".
- **How to use:** Click the amber bubble, type the answer, press Enter.
- **Video:** pending (needs several scripted states (images only))

*Panel with the agent's question and the answer field (fixture)*

*Panel of a running request with its steps (fixture)*

#### 19.5 Agent answer in the comment thread

- **What changed:** Before: a thread showed only people. Now: a message that ends with the task marker is drawn as Claude's: Claude avatar, model and effort chip, the text, before/after and the GIF.
- **How to use:** Automatic.
- **Video:** pending (shows only in the real comment thread (fixture print only))

*Claude's card in a comment thread (fixture)*

### 20. Agent cursors

Agents that work on a comment now get a multiplayer-style cursor with a name tag on the canvas, in their own colour, like another person editing next to you.

**Files:** `feature/agent-cursors.js`, `feature/agent-cursors.css`

**Original Tempo, before the mod:**

*Original Tempo: the same canvas with only comment pins (simulated data)*

**Captured in the app** (`evidence/agent-cursors/`, 2026-10-18T21:38:47.555Z):

*With the mod: three agent cursors with name tags and colors (simulated data)*

*Idle cursors, tag tooltip, the cursor gliding to the edited card and fading when done (simulated data)*

*After the edit: the card is orange, the cursor is gone and the counter changed (simulated data)*

#### 20.1 Agent cursor with name tag

- **What changed:** Before: you could not see where an agent was working. Now: each running task gets an arrow and a tag ("Claude - #1" or the model) that starts on the comment's pin, then glides to the storyboard that changed, outlines it and clicks.
- **How to use:** Automatic while a task is running. Turn off with localStorage rtd.agentCursors = off.

*Same clip as a GIF (fixture)*

#### 20.2 Several agents, one colour each

- **What changed:** Before: none. Now: parallel agents get different colours and tags (up to 8) and each moves only to its own storyboard.
- **How to use:** Automatic.
- **Video:** shown in the clip of 20.1 (Agent cursor with name tag)

*Two agents on one canvas: terracotta Claude #1 and blue Opus 5.5 #2 (fixture)*

#### 20.3 Tag tooltip and needs-input balloon

- **What changed:** Before: none. Now: hover the tag to read the comment and what the agent is doing; click it to open the bubble panel. When the agent waits for an answer an amber ? appears and the cursor stops moving. Finished cursors show a check and fade.
- **How to use:** Hover or click the name tag.
- **Video:** shown in the clip of 20.1 (Agent cursor with name tag)

*Tooltip over a tag with the amber ? balloon (fixture)*

### 21. Follow an agent

Like Figma's follow mode: the canvas view pans and zooms by itself to keep an agent's work in frame.

**Files:** `feature/agent-follow.js`, `feature/agent-follow.css`

**Original Tempo, before the mod:**

*Original Tempo: canvas overview, no follow mode (simulated data)*

**Shortcut:** Alt/Option-click a bubble · Esc or Stop to quit

**Captured in the app** (`evidence/agent-follow/`, 2026-10-18T21:38:47.555Z):

*Following an agent: the camera zooms into its screen and the Following Claude bar appears (simulated data)*

*Alt/Option-click a bubble; the camera flies to the agent and stays on it while the screen changes (simulated data)*

*Alt/Option-click another bubble to switch agents, then Stop (simulated data)*

**In the real app:**

*While an agent works on a comment, the task card offers Follow next to Open chat so the canvas view tracks the agent.*

#### 21.1 Follow an agent (Alt-click)

- **What changed:** Before: you had to pan and zoom by hand to watch an agent. Now: Alt-click a task bubble (or press Follow in its panel) and the view flies to the agent's storyboard, zooms to fit it with a margin and keeps following when the cursor moves. A chip at the top shows who you follow and a Stop button.
- **How to use:** Alt-click a bubble, or Follow in the panel. Click Stop, press Escape, or Alt-click again to leave.

*Same clip as a GIF (fixture)*

*The view re-centred after the agent moved (fixture)*

#### 21.2 Pauses when you take over

- **What changed:** Before: none. Now: if you click, pan or zoom yourself, follow pauses for 4 seconds so you keep control, then resumes. When the task ends the chip says Done and follow stops after 3 seconds.
- **How to use:** Just use the canvas. Stop to end it.
- **Video:** shown in the clip of 21.1 (Follow an agent (Alt-click))

*The chip shows Paused after a click on the canvas (fixture)*

## Chat and composer

### 22. Voice dictation

A microphone button in the composer lets you dictate: words appear while you speak. It runs on the Mac itself, with no cloud and no API key. A new Settings page controls it.

**Files:** `feature/voice-input.js`, `feature/voice-input.css`

**Original Tempo, before the mod:**

*Before: original Tempo composer, no microphone (simulated data)*

**Shortcut:** Click the mic (or tap Space in an empty composer); Option-click toggles PT/EN

**Captured in the app** (`evidence/voice-input/`, 2026-10-18T21:27:54.085Z):

*After: composer with the microphone button next to Send (simulated data)*

*Live dictation filling the composer (simulated data: replayed partial results, no microphone) (simulated data)*

*Open Settings › Dictation: engine and language options (simulated data)*

*Mic tooltip: current language and engine (simulated data)*

*Mid-dictation: live words over the field's placeholder (simulated data)*

*Settings › Dictation: engine, language and microphone test (simulated data)*

#### 22.1 Live dictation in the composer

- **What changed:** Before: no voice input in the composer. Now: a mic button next to Send starts recording, and the words show up in the editor while you speak (grey text is still being corrected). Click again to stop; the final text stays at the cursor and is NOT sent.
- **How to use:** Click the mic button, or tap Space (under 250 ms) in the empty, focused composer. Tap Space or click again to stop. Option-click on the mic switches between PT and EN.

*The mic button next to send records speech, and the words appear in the composer while you speak.*

*Words appear while dictating; the speech engine is simulated (fixture)*

*The mic button in the composer toolbar (fixture)*

#### 22.2 Settings > Dictation

- **What changed:** Before: no dictation settings. Now: a new Dictation item in the Personal group of Settings lets you pick the engine (Apple Speech or Apple Dictation), the language, and test the microphone for 3 seconds.
- **How to use:** Open Settings > Dictation, or right-click the mic button in the composer. Press Test to record 3 seconds and see the text.

*Opening Settings > Dictation and running the microphone test (fixture)*

*Engine and language controls (fixture)*

### 23. Extra High effort and model names

Adds an Extra High effort level for Opus 5 and removes the " 1M" suffix from model names, showing a small "1M ctx" tag only when needed.

**Files:** `feature/effort-levels.js`

**Original Tempo, before the mod:**

*Before: Opus 5 in original Tempo, Effort menu without “Extra High”*

**Captured in the app** (`evidence/effort-levels/`, 2026-10-18T21:33:57.082Z):

*After: Opus 5 with “Extra High” in the Effort menu, already picked*

*Switch to Opus 5, open Effort and pick “Extra High”*

*Model picker with the mod: names without “ 1M”*

*Model picker in original Tempo: names with “ 1M”*

**In the real app:**

*The composer shows the model as "Opus 5.5" (no " 1M" suffix) next to the effort selector.*

#### 23.1 Extra High effort for Opus 5

- **What changed:** Before: the Effort menu stops at High and Max for Opus 5. Now: an Extra High item sits between High and Max; picking it is saved like the other levels and the button shows "Extra High".
- **How to use:** Pick Opus 5 in the composer, open the Effort menu and choose Extra High.

*Effort menu with the new Extra High item (fixture)*

*The effort button after picking Extra High (fixture)*

#### 23.2 Model names without " 1M"

- **What changed:** Before: names like "Opus 5 1M" mix the model with its context size. Now the suffix is hidden; when both Opus 5 and Opus 5 1M exist, the 1M one gets a small "1M ctx" tag so the two items are not identical.
- **How to use:** Automatic, in the model menus and buttons of the composer, Agents editor and Settings.

*Model menu with the "1M ctx" tag (fixture)*

### 24. Smart suggestions in a new chat

The new-chat empty state used to show four fixed prompt cards. Now it shows four suggestions worked out on the machine from where you are: the branch, uncommitted changes, recent chats, open comment tasks, issues, docs, canvases, agent runs and the time of day.

**Files:** `feature/smart-suggestions.js`, `feature/smart-suggestions.css`

#### 24.1 Suggestions from where you are

- **What changed:** Before: four fixed cards (Walk me through how Tempo works, Create a design system canvas, Write a PRD, Scaffold a prototype). Now: four cards ranked by local rules, one per topic, e.g. a comment task waiting for you, a failed task, an interrupted chat or a large set of uncommitted changes.
- **How to use:** Open a new chat. The cards appear under the composer, in the same style as the native ones.
- **Video:** pending (not captured yet)

#### 24.2 One click sends the prompt

- **What changed:** Before: clicking a card only filled the composer. Now: the card fills the composer through the app's own path and then presses send for you.
- **How to use:** Click a card. To keep fill-only, set localStorage "rtd.smartSuggestions.send" to "fill".
- **Video:** pending (not captured yet)

#### 24.3 More… list

- **What changed:** Before: nothing beyond the four cards. Now: a fifth, discreet chip opens the full ranked list of 8 to 10 suggestions.
- **How to use:** Click More… next to the cards.
- **Video:** pending (not captured yet)

#### 24.4 Optional re-rank with the decision model

- **What changed:** Before: no ranking. Now: when the Decision model is set up and its suggestions automation is on, one call scores the candidates and moves close calls by up to 15 points, never burying an urgent one. Only names and counts are sent, never message text or paths.
- **How to use:** Settings › Decision model, turn on the suggestions automation.
- **Video:** pending (needs the real app with a configured decision model)

#### 24.5 Live refresh and off switch

- **What changed:** The cards refresh at once on a workspace or chat switch and after 2 s for other changes; only a card whose content changed cross-fades. Turning the mod off brings the native cards back.
- **How to use:** Set localStorage "rtd.smartSuggestions" to "off" to go back to the original cards.
- **Video:** pending (not captured yet)

### 25. Background tasks in the chat

Background tasks now show inside the conversation as a block at the end of the transcript, not only in the composer pill.

**Files:** `feature/bg-tasks.js`, `feature/bg-tasks.css`

**Original Tempo, before the mod:**

*Before: the same 3 tasks only appear as “3 Tasks Running” in the composer (simulated data)*

**Shortcut:** Click the block header to show or hide finished tasks

**Captured in the app** (`evidence/bg-tasks/`, 2026-10-18T21:36:17.089Z):

*After: “3 background tasks running” block at the end of the chat (simulated data)*

*Tasks start, run and finish, one fails (simulated data)*

*Finished tasks fold into the header; a click shows them again (simulated data)*

*One task still running, one done and one failed (simulated data)*

*All finished, each with an icon and duration (simulated data)*

*After 8 s: summary folded into the header (simulated data)*

**In the real app:**

*Background tasks are listed in the conversation with a type chip (agent, bash) and a live timer, above the composer's "4 Tasks Running" pill.*

*A single running task shown in the transcript with a spinner, label, type chip and elapsed time.*

#### 25.1 Task block that updates live

- **What changed:** Before: running tasks were only in the "N Tasks Running" pill. Now: a block after the last message lists each task with a spinner, a type chip (bash, agent, workflow...) and a live timer. Finished tasks show their result and duration for 8 seconds.
- **How to use:** Automatic while background tasks run.

*Tasks running, then finishing (fixture)*

*Final states of finished tasks (fixture)*

#### 25.2 Folded summary line

- **What changed:** Before: nothing remained after tasks ended. Now: finished tasks fold into one line like "3 background tasks done - 1 failed" that stays until your next message. Click it to see the rows again.
- **How to use:** Click the summary line to expand it.
- **Video:** not applicable (shown in the block-updating clip)

*Folded summary line (fixture)*

### 26. Agent Runs panel

A floating, read-only panel shows your agent runs: totals, status breakdown, average duration and cost.

**Files:** `feature/agent-runs-panel.js`

**Original Tempo, before the mod:**

*Before: in original Tempo, ⌘⇧A opens nothing on the home screen (simulated data)*

**Shortcut:** ⌘⇧A (Esc closes)

**Captured in the app** (`evidence/agent-runs-panel/`, 2026-10-18T21:27:54.084Z):

*After: the Agent Runs panel with the account's real numbers (simulated data)*

*⌘⇧A opens the panel, Esc closes it, ⌘⇧A toggles it again (simulated data)*

*The same panel with more runs (simulated data from the mod's preview hook) (simulated data)*

#### 26.1 Open with Cmd+Shift+A

- **What changed:** Before: no overview of agent runs. Now: Cmd+Shift+A opens a panel with total runs, active now, average duration, total cost and a bar per status (completed, failed, running, queued, cancelled). It only reads data from your logged-in account.
- **How to use:** Press Cmd+Shift+A to open or close. Esc or the X closes it.

*Opening the panel with Cmd+Shift+A (fixture)*

*Loading state while data is fetched (fixture)*

## Agents driving the UI

### 27. UI drive (agent controls the app)

An agent can now open Settings, switch sections, open a canvas, doc, issue or chat, open a web page, point at a control or show a note, all on your screen. Every screen change shows a Deny button first and an Undo button after.

**Files:** `feature/ui-drive.js`, `feature/ui-drive.css`

**Original Tempo, before the mod:**

*Original Tempo: the chat screen; nothing outside controls the UI (simulated data)*

**Shortcut:** @tempo-ui <command> in a chat reply · tempo-ui CLI

**Captured in the app** (`evidence/ui-drive/`, 2026-10-18T21:38:47.556Z):

*open settings in progress: beam to the Settings button and the Deny notice (simulated data)*

*open settings, then Undo goes back to the chat (simulated data)*

*highlight points at the canvas tab; toast leaves a note (simulated data)*

*Settings opened by the agent, with the Undo / Always allow notice (simulated data)*

#### 27.1 Open something, with Deny and Undo

- **What changed:** Before: an agent could only reply in text, it could not move you around the app. Now: when the agent writes a command line (for example `@tempo-ui open settings`) or runs the CLI, the app opens Settings by itself. A small toast shows Deny while it moves, then Undo to go back.
- **How to use:** Nothing to do. Click Deny to stop it, Undo to go back, or Always allow to stop seeing the toast.

*Same clip as a GIF (fixture)*

*Toast with a Deny button while the command runs (fixture)*

*After it ran: Undo and Always allow (fixture)*

#### 27.2 Deny a command

- **What changed:** Before: no way to stop an agent. Now: pressing Deny while the beam flies cancels the move and nothing changes on screen.
- **How to use:** Click Deny in the toast.

*Same clip as a GIF (fixture)*

*The toast after Deny (fixture)*

#### 27.3 Point at a control and show a note

- **What changed:** Before: an agent could only describe a button in words. Now: it can scroll to a control and highlight it, or show a short note toast.
- **How to use:** Automatic, from the agent (focus and toast commands).

*Same clip as a GIF (fixture)*

*Highlighted target (fixture)*

*Note toast (fixture)*

#### 27.4 Safety rules

- **What changed:** Before: not applicable. Now: only a fixed list of commands runs. Code (eval), bad links (javascript:, file:) and unknown actions are refused with a short toast. Risky actions, like deleting, run only after you click Allow, and are never always-allowed.
- **How to use:** Click Allow in the toast for a risky action. Otherwise it expires after 10 seconds.
- **Video:** not applicable (covered by the stills, the clips above show the same toast)

*Refused commands (fixture)*

*A destructive action asks for an explicit Allow (fixture)*

### 28. UI beam (agent handoff animation)

When an agent uses the UI, you now see it: a pulse on the message, a beam with the Claude avatar flying to the control, then a frame around the target.

**Files:** `feature/ui-beam.js`, `feature/ui-beam.css`

**Original Tempo, before the mod:**

*Original Tempo: an empty chat, no agent indication (simulated data)*

**Captured in the app** (`evidence/ui-beam/`, 2026-10-18T21:38:47.555Z):

*With the mod: the beam leaves the chat box with Claude's avatar on its way to Settings (simulated data)*

*Three handoffs: to Settings, to the canvas tab and to Files (simulated data)*

*Arrival: a frame labeled Opening Settings on the button (simulated data)*

#### 28.1 Message to target flight

- **What changed:** Before: things just changed on screen with no clue why. Now: a pulse starts at the agent message, a rounded beam with the Claude avatar flies to the target (about 1 second), and a frame fades in around it.
- **How to use:** Automatic when ui-drive runs a command.

*Same clip as a GIF (fixture)*

*Start: pulse on the message (fixture)*

*Mid flight: beam and avatar (fixture)*

#### 28.2 Target frame and reduced motion

- **What changed:** Before: not applicable. Now: the target keeps a soft rounded frame for about 1.5 seconds. With reduced motion on, there is no travel, only a short pulse and the frame. It can be turned off in localStorage (rtd.uiBeam = off).
- **How to use:** Automatic.
- **Video:** not applicable (the flight clip above already shows the frame)

*Frame around the target (fixture)*

*Reduced motion: pulse and frame only (fixture)*

### 29. App map (named controls for agents)

A live list of every button, field and toggle on screen, each with a stable readable name, plus the app's actions. Agents can find and use a control by name instead of guessing pixels.

**Files:** `feature/app-map.js`, `feature/app-map.css`

**Original Tempo, before the mod:**

*Original Tempo: the chat screen with no markings (simulated data)*

**Shortcut:** window.__RE_TEMPO_APP_MAP__.debug(true)

**Captured in the app** (`evidence/app-map/`, 2026-10-18T21:38:47.556Z):

*Debug overlay: every element's name; green safe, yellow caution, red destructive (simulated data)*

*Turning the debug overlay on and off (simulated data)*

*find() by name, act() opens the canvas and returns, a destructive act() is refused (simulated data)*

*find("untitled-4") result highlighted: sidebar/treeitem/untitled-4, risk safe (simulated data)*

#### 29.1 Stable names and debug overlay

- **What changed:** Before: an agent saw only pixels. Now: every clickable or typeable control gets a name such as `rail/button/settings` and a risk color (green safe, orange caution, red destructive). A debug overlay draws all names on screen.
- **How to use:** For developers: run `__RE_TEMPO_APP_MAP__.debug(true)` in the console.

*Same clip as a GIF (fixture)*

#### 29.2 Find and click by name

- **What changed:** Before: not possible. Now: an agent can ask for `split right` and get the matching controls, then click, type, toggle, select or drag them by id. Destructive controls are refused unless confirmed.
- **How to use:** Agent commands such as `tempo-ui ui.find split right` and `tempo-ui ui.click <id>`.
- **Video:** not applicable (shown in the overlay clip above)

*Search result for 'split right' with risk labels (fixture)*

### 30. tempo-ui command line

A small command an agent runs in the terminal to drive the open Tempo window (open settings, open a canvas, take a screenshot...). The window answers and the result prints back.

**Files:** `feature/bin/tempo-ui`

#### 30.1 Help and agent instructions

- **What changed:** Before: Tempo's agent had no way to touch the app UI. Now: it runs `tempo-ui open settings` and the window does it with the beam and Deny/Undo. `tempo-ui --instructions` prints a text to paste into CLAUDE.md or AGENTS.md so any agent knows the commands.
- **How to use:** In a terminal: `tempo-ui --help` and `tempo-ui --instructions`.
- **Video:** not applicable (plain text output, the command channel is shown in the ui-drive clips)

*Output of tempo-ui --help (fixture)*

*Output of tempo-ui --instructions (fixture)*

## Rail and title bar

### 31. Gear menu (Settings, Help, Report a bug)

The narrow left rail used to show a bug button, a help button and the settings gear. Now the rail keeps only the gear and your avatar, and the gear opens one small menu with everything else.

**Files:** `feature/rail-menu.js`, `feature/rail-menu.css`

**Original Tempo, before the mod:**

*The original rail footer with separate Report a bug, Help and Settings buttons and the avatar.*

*Before: the rail footer has bug report, help, settings and avatar buttons.*

**Shortcut:** ⌘, (Settings), ⌘⇧B (Report a bug), Shift-click the gear (Settings directly)

**Captured in the app** (`evidence/rail-menu/`, 2026-10-18T21:24:26.470Z):

*After: only the gear and the avatar; the gear opens a menu with Settings, Help and Report a bug.*

*The gear opens the menu; Help opens the original help submenu.*

*With the project sidebar on, the title bar gear opens the same menu.*

#### 31.1 One gear menu

- **What changed:** Before: three separate buttons in the rail footer (Report a bug, Help, Settings). Now: only the gear and the avatar stay; clicking the gear opens a menu with Settings... (Cmd+,), Help and Report a bug (Cmd+Shift+B). The original buttons are only hidden, so each menu item just clicks the real one.
- **How to use:** Click the gear. Use the arrow keys, Enter, Esc or the first letter of an item. Shift+click on the gear opens Settings directly. When the project sidebar is expanded, its own gear and avatar open the same menu.

*Before: bug button, help button and gear stacked in the rail footer (fixture)*

*After: only the gear and the avatar are left (fixture)*

*Opening the gear menu and moving through its items (fixture)*

#### 31.2 Help submenu

- **What changed:** Before: Help was its own rail button with Keyboard Shortcuts, Documentation and Community. Now: Help is an item in the gear menu that opens the same original list next to it.
- **How to use:** Open the gear menu, then click Help (or press the right arrow on it).

*The Help item opens the original Help list (fixture)*

### 32. Header breadcrumb

The title in the middle of the window header showed only the branch name. Now it shows a full path: owner / project / branch, with the same diff badge.

**Files:** `feature/title-crumb.js`, `feature/title-crumb.css`

**Original Tempo, before the mod:**

*Before: the window title shows only the branch name, "jdoe/mango".*

**Captured in the app** (`evidence/title-crumb/`, 2026-10-18T21:37:36.361Z):

*After: the title is a breadcrumb, "jdoe / seed-tracker / mango".*

*Switching between two branches of the butia project updates the breadcrumb (owner from the git remote).*

**In the real app:**

*Window header shows project / branch with the diff badge instead of the bare branch name.*

#### 32.1 owner / project / branch

- **What changed:** Before: the header showed only the branch name, for example "main". Now: it shows "jdoe / seed-tracker / main". The icon, the copy-branch click and the +/- diff badge keep working as before.
- **How to use:** Automatic. Click the branch part to copy the branch name like before. Turn it off with localStorage rtd.titleCrumb = "off".

*Before: only the branch name in the header (fixture)*

*After: the breadcrumb follows the selected branch (fixture)*

*A worktree branch (jdoe/mango) does not repeat the owner (fixture)*

#### 32.2 Fits narrow windows

- **What changed:** Before: not applicable (a single short name). Now: the crumb never covers the left or right header groups. When space is short it cuts the middle of the longest parts with an ellipsis, project first, then owner, then branch.
- **How to use:** Automatic. Resize the window.

*The same crumb at different widths (fixture)*

*Wide window: the full path is shown (fixture)*

#### 32.3 Click the project name

- **What changed:** Before: the title was not clickable except to copy the branch. Now: clicking the project part opens that project's design home, like clicking the project in the sidebar (needs the project sidebar mod).
- **How to use:** Click the project name in the header.

*Clicking the project segment (fixture)*

### 33. Home heading text

On the logged-out home screen the big heading "Let's Cook." now says "Let's do it".

**Files:** `feature/home-title.js`

**Original Tempo, before the mod:**

*Before: original Tempo home with the “Let's Cook.” title*

**Captured in the app** (`evidence/home-title/`, 2026-10-18T21:27:54.084Z):

*After: the same home with the “Let's do it” title*

*Home with the new title, then an empty chat with the same title*

*Close-up of the original title: “Let's Cook.”*

*Close-up of the new title: “Let's do it”*

**In the real app:**

*The home heading reads "Let's do it" instead of the original "Let's Cook.".*

#### 33.1 Custom home heading

- **What changed:** Before: the heading read "Let's Cook.". Now: it reads "Let's do it". The mod only rewrites the text in the page, and does it again if the app redraws the heading.
- **How to use:** Automatic. To change the words, edit the TARGET line at the top of feature/home-title.js and save.

*Before: the original heading (fixture)*

*The heading is swapped, and swapped again after the app redraws it (fixture)*

*After: the new heading (fixture)*

### 34. Zoom level toast and Cmd+=

Tempo already has View > Zoom In/Out, but gives no feedback and Zoom In needs Cmd+Shift+=. Now a small toast shows the new zoom level, and Cmd+= zooms in.

**Files:** `feature/zoom.js`, `feature/zoom.css`, `tools/enable-zoom-shortcut.sh`

**Original Tempo, before the mod:**

*Original Tempo: zoomed to 110% with no feedback (simulated data)*

**Shortcut:** ⌘ = · ⌘ − · ⌘ 0

**Captured in the app** (`evidence/zoom/`, 2026-10-18T21:43:52.865Z):

*With the mod: a 110% toast in the bottom-right corner (simulated data)*

*Zoom In, Zoom Out and Actual Size, with the toast showing each level (simulated data)*

*The zoom toast up close (simulated data)*

#### 34.1 Zoom level toast

- **What changed:** Before: zooming changed the size with no message. Now: a small badge at the bottom right shows the new level (for example 140%) for one second. The zoom itself is still the app's own, so it scales everything.
- **How to use:** Press Cmd+= (in), Cmd+- (out) or Cmd+0 (reset).

*Before: normal size, no message (fixture)*

*Zoom steps with the level shown in the toast (fixture)*

*The toast at 140% (fixture)*

#### 34.2 Cmd+= shortcut

- **What changed:** Before: Zoom In only worked with Cmd+Shift+= (Cmd++). Now: a small script remaps the menu item to plain Cmd+=, like in VS Code. It only touches RE-TEMPO, never the original Tempo.
- **How to use:** Run tools/enable-zoom-shortcut.sh once and restart RE-TEMPO. Use --status to check and --undo to remove it.
- **Video:** not applicable (it is a keyboard shortcut mapping done by macOS; the visible result is the toast above)

*Usage text of the shortcut script (fixture) (fixture)*

## Settings and preferences

### 35. Profile page and Settings API

Settings gets a new RE-TEMPO group in its left list, and its first page is Profile: your photo and a calm, read-only summary of your own work. The mod also offers a small API so other mods can add their own Settings pages.

**Files:** `feature/profile-page.js`, `feature/profile-page.css`

**Original Tempo, before the mod:**

*Before: original Tempo Settings, no Profile and no RE-TEMPO group*

**Shortcut:** Settings (⌘,) › Personal › Profile

**Captured in the app** (`evidence/profile-page/`, 2026-10-18T21:27:54.085Z):

*After: Settings › Profile with level, counts and activity map*

*Open Settings, see Profile and the RE-TEMPO group, scroll the profile*

*Lower part of Profile: work by type, milestones and “Your month”*

#### 35.1 RE-TEMPO group in Settings

- **What changed:** Before: Settings had only Personal items (Preferences, Chat, Billing...) and Organizations. Now: a RE-TEMPO group sits right after Personal, with Profile first and any page added by other mods (such as Decision model) below it. It uses the same look as the original items.
- **How to use:** Open Settings and click an item under RE-TEMPO. For mod authors: window.__RE_TEMPO_SETTINGS__.registerSection({ id, label, render }).
- **Video:** not applicable (static list; the Profile video below opens it)

*Before: the original Settings screen, no RE-TEMPO group*

*After: the RE-TEMPO group with Profile and Decision model (fixture)*

#### 35.2 Profile page with level and stats

- **What changed:** Before: no profile page. Now: your name, a level ring (Newcomer up to Luminary) based on finished work, and tiles for chats, agent runs, comment tasks and plan usage. No streaks, no points, no ranking: progress only goes up.
- **How to use:** Settings > RE-TEMPO > Profile, or Profile in the avatar menu. Click the avatar on the page to add a photo (kept on this Mac only).

*Opening Profile from Settings and scrolling the whole page (fixture)*

*Top of the page: level ring and stat tiles (fixture)*

#### 35.3 Activity heatmap and your month

- **What changed:** Before: nothing like it. Now: a heatmap with one cell per day of the last weeks, work by type, milestones and a "Your month" recap that is built only when you ask.
- **How to use:** Scroll down on the Profile page.
- **Video:** shown in the clip of 35.2 (Profile page with level and stats)

*Activity heatmap and totals (fixture)*

*Bottom of the page: milestones and Your month (fixture)*

### 36. Decision model settings (TypeSafe Jev)

A new Settings page connects a hosted decision model (TypeSafe AI, "Jev") that answers short typed questions with a choice, a score or a yes/no and a confidence. RE-TEMPO uses it to sort new comment tasks (effort, ask first, urgency).

**Files:** `feature/decision-model.js`, `feature/decision-model.css`

**Original Tempo, before the mod:**

*Before: original Tempo Settings, no Decision model section*

**Shortcut:** Settings (⌘,) › RE-TEMPO › Decision model

**Captured in the app** (`evidence/decision-model/`, 2026-10-18T21:27:54.085Z):

*After: Settings › Decision model with connection fields and “Not configured”*

*Open Decision model and scroll to automations, privacy and the log*

*End of the section: automations, privacy notice and an empty decision log*

#### 36.1 Settings > Decision model

- **What changed:** Before: no such setting. Now: a page with the base URL, API key, model, timeout, confidence threshold, what to do when the model is unsure, one switch per automation and a privacy note. The key is saved only on this Mac and is never shown again.
- **How to use:** Settings > RE-TEMPO > Decision model. Type the key, then press Test connection.

*Before: the original Settings screen, no Decision model page*

*Opening the page, scrolling it and testing the connection (a fake local server answers) (fixture)*

*Top of the page: connection settings and the saved key (hidden) (fixture)*

#### 36.2 Test connection and decision log

- **What changed:** Before: nothing. Now: Test connection shows if it worked, the model, the time and the tokens used; a log lists the last 20 decisions (question, answer, confidence, speed) without any comment text.
- **How to use:** Press Test connection; scroll to the log at the bottom.
- **Video:** shown in the clip of 36.1 (Settings > Decision model)

*A successful test: Connected, model, 14 ms, tokens (fixture)*

*Lower part of the page: thresholds, switches, privacy and log (fixture)*

## Infrastructure and dev tools

### 37. inject-index (load the mods)

A small script that adds every mod to the app's index.html, in a fixed order, so the app loads them. It can be run again and again without making duplicates.

**Files:** `tools/inject-index.mjs`

#### 37.1 Idempotent mod loader

- **What changed:** Before: the original app loads no mods. Now: one marked block before </body> loads each feature/<mod>.css and .js through ./mod/. It backs up index.html once, removes old or hand-made tags and rewrites only that block.
- **How to use:** node tools/inject-index.mjs [--dry-run] <path to index.html>. --dry-run only prints what would change.
- **Video:** not applicable (command-line tool, no visible UI)

*Dry run on a fake index.html: nothing is written, the added lines are listed (fixture) (fixture)*

*The index.html after a real run on the fake file (fixture) (fixture)*

### 38. live-reload (instant updates)

A watcher with no dependencies: save a feature/ file and the open RE-TEMPO window updates by itself. CSS changes are swapped in without a reload; JS changes reload the window.

**Files:** `tools/live-reload.mjs`

#### 38.1 Hot CSS, reload on JS

- **What changed:** Before: changing the app means rebuilding and restarting. Now: the watcher talks to the app through its debug port, hot-swaps the stylesheet on a .css save (the page keeps its state) and reloads the window on a .js save.
- **How to use:** It starts with tools/start-live.sh. Edit and save any feature/*.js or *.css.
- **Video:** not applicable (background tool; it needs the real app's debug port)

*Header of tools/live-reload.mjs (the script was not run) (fixture) (fixture)*

### 39. start-live (one command)

One command that sets up and starts the whole live loop: links the mods, injects them, launches RE-TEMPO in its own profile and starts the watcher.

**Files:** `tools/start-live.sh`

#### 39.1 Start everything in one step

- **What changed:** Before: several manual steps. Now: it links out/renderer/mod to the repo's feature/ folder, runs inject-index, opens RE-TEMPO with a debug port and an isolated profile (your real Tempo data is not touched), then runs live-reload. Ctrl+C stops both.
- **How to use:** tools/start-live.sh
- **Video:** not applicable (starts the real app, so it was not recorded)

*Header of tools/start-live.sh (the script was not run) (fixture) (fixture)*

### 40. bootstrap-local (editable app)

Builds the editable copy, RE-TEMPO.app, from your own installed Tempo. Nothing is uploaded and the original app is not changed.

**Files:** `scripts/bootstrap-local.sh`

#### 40.1 Make RE-TEMPO.app

- **What changed:** Before: the installed Tempo cannot be edited. Now: the script clones the app, unpacks app.asar into a folder, renames it to RE-TEMPO (own bundle id), turns off auto-update, re-signs it and writes run-isolated.sh to start it in its own profile.
- **How to use:** Run scripts/bootstrap-local.sh once, with Tempo installed in /Applications.
- **Video:** not applicable (one-time setup script, no visible UI)

*The six steps printed by the script (it was not run) (fixture) (fixture)*

### 41. QA harness (qa/)

An automated test kit that starts several isolated RE-TEMPO copies, drives them through the debug port, and writes a report with screenshots. It never touches your visible window or your real profile.

**Files:** `qa/run.mjs`, `qa/instance.mjs`, `qa/login.mjs`, `qa/clean.mjs`, `qa/ps.mjs`, `qa/lib/`, `qa/suites/`

#### 41.1 Multi-instance test runner

- **What changed:** Before: no automated tests. Now: run.mjs launches N isolated instances (or logged-in test profiles) in parallel, runs a suite on each, and saves a JSON and Markdown report with screenshots. ps.mjs and clean.mjs list and clean the instances.
- **How to use:** cd qa && npm install, then node run.mjs --suite 00-smoke --instances 3. Details in docs/qa/03-harness.md.
- **Video:** not applicable (runs the real app headlessly; not run for this document)

*The commands from qa/README.md (fixture) (fixture)*

*Files of the harness (fixture) (fixture)*

## Changes without video, and why

| # | Feature | Status | Why |
|---|---|---|---|
| 1.3 | Project sidebar: Issues, Agents, Docs and Organization rows | pending | needs the real app (backend data for docs, issues and agents) |
| 1.10 | Project sidebar: Terminal agents as agent rows | pending | needs a real terminal running an agent CLI |
| 1.11 | Project sidebar: Footer, settings and account | not applicable | static layout, no interaction |
| 1.13 | Project sidebar: Always the only sidebar | not applicable | there is no switch any more |
| 1.14 | Project sidebar: Context menus | pending | no clip recorded yet (new feature, 2026-10-18) |
| 1.15 | Project sidebar: Worktree cards on one line | not applicable | static layout |
| 1.16 | Project sidebar: Green status dot | not applicable | a static status mark |
| 2.2 | Sidebar chats: Status and location badges | not applicable | same clip as the nested chats |
| 2.5 | Sidebar chats: Workspace card per branch | not applicable | static card, covered by the nested chats clip |
| 3.4 | Plan usage: Per-model weekly limits | not applicable | background helper, only its result is visible |
| 4.3 | Free pane layout (panes and decks): Nested splits | not applicable | built by repeating the edge-split clip; the divider clip shows a nested layout |
| 4.8 | Free pane layout (panes and decks): Pane header look | not applicable | static styling, visible in every pane clip |
| 4.12 | Free pane layout (panes and decks): Panes only on the chat route | not applicable | static switch with no motion |
| 4.13 | Free pane layout (panes and decks): Solo mode | pending | no clip recorded yet (new feature, 2026-10-18) |
| 4.14 | Free pane layout (panes and decks): Placeholder for a tab in an external window | pending | no clip recorded yet (new feature, 2026-10-18) |
| 4.15 | Free pane layout (panes and decks): Canvas popovers stay in their pane | pending | no clip recorded yet (new feature, 2026-10-18) |
| 4.16 | Free pane layout (panes and decks): Empty panes and decks | not applicable | the close-and-undo clip shows a pane collapsing |
| 4.17 | Free pane layout (panes and decks): Deck API: Close all and Move tabs | not applicable | an API; the deck menu clip in the sidebar shows it |
| 12.3 | Shader frame on the canvas: GLSL editor | pending | panel and editor typing already covered by the controls clip; editor needs a text-entry clip |
| 12.4 | Shader frame on the canvas: Export PNG, WebM and embed code | pending | exports are file downloads, nothing to film |
| 13.1 | Canvas layout like pen.dev: Floating left card with tabs | pending | no clip recorded yet (new feature, 2026-10-18) |
| 13.2 | Canvas layout like pen.dev: Agent tab with the canvas chat | pending | no clip recorded yet (new feature, 2026-10-18) |
| 13.3 | Canvas layout like pen.dev: Compact vertical tool rail | pending | no clip recorded yet (new feature, 2026-10-18) |
| 13.4 | Canvas layout like pen.dev: Composer and chat chip at the bottom | pending | no clip recorded yet (new feature, 2026-10-18) |
| 13.5 | Canvas layout like pen.dev: Selection pill with the properties dropdown | pending | no clip recorded yet (new feature, 2026-10-18) |
| 13.6 | Canvas layout like pen.dev: Zoom and the top pills | pending | no clip recorded yet (new feature, 2026-10-18) |
| 13.7 | Canvas layout like pen.dev: Off switch and API for other mods | not applicable | a flag and an API, no motion to show |
| 14.1 | Code and Export in the canvas panel: Code section | pending | no clip recorded yet (new feature, 2026-10-18) |
| 14.2 | Code and Export in the canvas panel: Import a web page via Browser | pending | no clip recorded yet (new feature, 2026-10-18) |
| 14.3 | Code and Export in the canvas panel: Export layer as PNG, JPEG, WebP or PDF | pending | no clip recorded yet (new feature, 2026-10-18) |
| 15.1 | Sticky notes that run as prompts: Sticky note tool | pending | no clip recorded yet (new feature, 2026-10-18) |
| 15.2 | Sticky notes that run as prompts: Run a note as a prompt | pending | no clip recorded yet (new feature, 2026-10-18) |
| 16.1 | Properties panel for frames and notes: Position, size and appearance fields | pending | no clip recorded yet (new feature, 2026-10-18) |
| 16.2 | Properties panel for frames and notes: Browser, Shader and Note sections | pending | no clip recorded yet (new feature, 2026-10-18) |
| 16.3 | Properties panel for frames and notes: Undo for manual edits | not applicable | keyboard history with no visual of its own |
| 17.1 | Browser card inside the canvas: Browser card and globe button | pending | no clip recorded yet (new feature, 2026-10-18) |
| 17.2 | Browser card inside the canvas: Import full page, element or screenshot | pending | no clip recorded yet (new feature, 2026-10-18) |
| 17.3 | Browser card inside the canvas: Recent pages | pending | no clip recorded yet (new feature, 2026-10-18) |
| 17.4 | Browser card inside the canvas: Resize, expand, mobile or desktop | pending | no clip recorded yet (new feature, 2026-10-18) |
| 18.4 | Canvas comment as a Claude task: Agent answer to a canvas comment | pending | shows only in the real comment thread (fixture print only) |
| 18.5 | Canvas comment as a Claude task: Fallback task list | pending | hidden whenever the bubbles are on |
| 19.2 | Comment bubbles: Bubble tooltip | pending | hover is part of the open-bubble clip |
| 19.4 | Comment bubbles: Answer an agent that needs input | pending | needs several scripted states (images only) |
| 19.5 | Comment bubbles: Agent answer in the comment thread | pending | shows only in the real comment thread (fixture print only) |
| 24.1 | Smart suggestions in a new chat: Suggestions from where you are | pending | not captured yet |
| 24.2 | Smart suggestions in a new chat: One click sends the prompt | pending | not captured yet |
| 24.3 | Smart suggestions in a new chat: More… list | pending | not captured yet |
| 24.4 | Smart suggestions in a new chat: Optional re-rank with the decision model | pending | needs the real app with a configured decision model |
| 24.5 | Smart suggestions in a new chat: Live refresh and off switch | pending | not captured yet |
| 25.2 | Background tasks in the chat: Folded summary line | not applicable | shown in the block-updating clip |
| 27.4 | UI drive (agent controls the app): Safety rules | not applicable | covered by the stills, the clips above show the same toast |
| 28.2 | UI beam (agent handoff animation): Target frame and reduced motion | not applicable | the flight clip above already shows the frame |
| 29.2 | App map (named controls for agents): Find and click by name | not applicable | shown in the overlay clip above |
| 30.1 | tempo-ui command line: Help and agent instructions | not applicable | plain text output, the command channel is shown in the ui-drive clips |
| 34.2 | Zoom level toast and Cmd+=: Cmd+= shortcut | not applicable | it is a keyboard shortcut mapping done by macOS; the visible result is the toast above |
| 35.1 | Profile page and Settings API: RE-TEMPO group in Settings | not applicable | static list; the Profile video below opens it |
| 37.1 | inject-index (load the mods): Idempotent mod loader | not applicable | command-line tool, no visible UI |
| 38.1 | live-reload (instant updates): Hot CSS, reload on JS | not applicable | background tool; it needs the real app's debug port |
| 39.1 | start-live (one command): Start everything in one step | not applicable | starts the real app, so it was not recorded |
| 40.1 | bootstrap-local (editable app): Make RE-TEMPO.app | not applicable | one-time setup script, no visible UI |
| 41.1 | QA harness (qa/): Multi-instance test runner | not applicable | runs the real app headlessly; not run for this document |

