# QA 02 — Static inventory of Tempo 0.0.121 features/screens (RE-TEMPO)

Date: 2026-10-16. Scope: renderer (`out/renderer/index.html` + 183 assets). Method: 100% static and read-only. The app was not opened and port 9333 was not used. No credentials were read.

Conventions:
- Evidence = asset name + identifier/string. Almost everything lives in `index-D2Ui1vc0.js` (12.8 MB, minified). Line numbers (`l.NNNN`) refer to a prettier-formatted copy outside the repo (scratch of the `tempo-re` agent), so they are only useful for locating things. The shared flags hook is in `sonner-D4Sb8YI5.js`. The other chunks (Monaco, Mermaid, KaTeX, pdf.js, workers, `modify-style-StEF3rz_.js`) are libraries with no screen of their own.
- No code is reproduced. Only UI labels, `data-testid`, `aria-label`, Convex function names (`module:function`), and IPC channels (`namespace:method`).
- `[inferred]` = no direct string/identifier.
- Side-effect risk: **L** read/local, no persistence; **LOC** writes to disk/localStorage; **ACCOUNT** creates/changes data in the Convex account; **AI** consumes AI/credits; **NAT** opens a native dialog; **EXT** opens browser/OAuth/Stripe/external network; **PUB** publishes/shares; **DEST** destructive.
- Prerequisites: **LOG** logged in (Clerk/Convex); **PRJ** project/workspace open; **CLI** AI CLI installed and authenticated; **FLAG** PostHog flag; **ADM** org admin role.
- Default selector: `[data-testid="..."]`. Where only an `aria-label` or text exists, it is stated.

---

## 1. Numeric summary

| item | value |
|---|---|
| Features inventoried in the master table | 145 (I-001 to I-188, with numbering spaced by area) |
| react-router routes | 2 (`/workspaces` and `*`, same root component) |
| Top-level sections (`activeNavRoute`) | 5 in the navbar + Settings (+ legacy alias `prd`) |
| Center tab types | 13 |
| Gates before the app | 3 (auth, onboarding, force upgrade) |
| Onboarding steps | 7 |
| Settings sections | 15 planned (6 personal, 8 org, 1 project), 14 rendered in this build |
| Distinct screens/views mapped | 54 views and sub-views in the renderer report, plus the 13 tab types and the 14 Settings sections detailed here |
| Distinct `data-testid` in the bundle | 1127 (1131 occurrences, some dynamic with `${...}`) |
| Remote PostHog flags | 7 |
| cmdk palettes | 3 |
| Documented shortcuts | 56 (+5 from the canvas outside the table) |
| Chat slash commands | 81 entries (77 names) |
| IPC channels (preload) | 403 |
| Distinct Convex modules called by the renderer | about 35 |

---

## 2. Starting screen state (user screenshot)

Logged-in home, no projects. Mapping of the visible pieces:

| Visible piece | Identifier | Notes |
|---|---|---|
| Vertical icon sidebar | `[data-testid="workspace-navbar"]` | Buttons: `workspace-navbar-chat-button` (Chat), `-docs-button` (Docs), `-design-button` (Design), `-issues-button` (Issues), `-agents-button` (Agents, present because `custom-agents` is on). Hint Ctrl+1…9. |
| Bug (footer) | `bug-report-button`, aria "Report a bug" | l.646845. Shortcut Mod+Shift+B. |
| Help (footer) | `help-menu-button`, aria "Help" | Items: Keyboard Shortcuts, Documentation, Community. |
| Settings (footer) | aria "Settings" (no testid) | Selector: `button[aria-label="Settings"]`. Shortcut Mod+,. |
| Avatar (footer) | org avatar; menu with "Settings for {org}", "Add an organization", "Show organization switcher", "Sign Out" | No stable testid; use `org-avatar-indicator-*` only for states. [inferred] |
| "Chats" panel with "No workspaces yet" | exact text `No workspaces yet`; container `workspaces-welcome` | Empty state of the workspace list. |
| "+ Add project" | `workspace-sidebar-header-add-project` and `workspace-sidebar-footer-add-project`; menu `chats-overflow-add-project` | Opens the submenu with 3 intents: Generate, Open folder, Import project (testid `${prefix}-generate`, `-open-folder`, `-import`). |
| Center "Let's do it" | exact title text not found in the bundle (may be a random variant or i18n) [inferred]; container `new-chat-empty-state` | Cards in `new-chat-empty-state-actions`. |
| Generate / Open folder / Import project cards | `empty-state-generate`, `empty-state-open-folder`, `empty-state-clone-repository` (this is the "Import project" card) | Exact labels: `Generate`, `Open folder`, `Import project`. |
| "Recent artifacts" | `new-chat-empty-state-recents` (skeleton: `new-chat-empty-state-recent-card-skeleton`) | Exact title `Recent artifacts`. Cards `artifact-card-${type}:${id}`. |
| Floating "Agent Runs" button | user mod: root `[data-rar-root]`, shortcut ⌘⇧A | Not part of the original product. See `docs/mods.md`. |

---

## 3. Master table

### 3.1 Gates and shell (A = authentication/startup)

| ID | Feature | How to reach / selectors | Prerequisites | Side effect / risk | IPC / Convex | Evidence |
|---|---|---|---|---|---|---|
| I-001 | Clerk login (browser handoff) | Auth screen when opening logged out; the sign-in button calls `auth:openSignIn` / `auth:openSignUp` | app logged out | EXT: opens the browser at `tempo.new/auth-handoff` and receives the callback at `127.0.0.1:17249` | `auth:openSignIn`, `auth:openSignUp`, `auth:getToken`, `auth:callback-received`, `auth:getCallbackPort`; `users:storeUser` | `index-D2Ui1vc0.js` (`ConvexProviderWithClerk`, `web-auth-bg-CkVk6vDa.png`); docs/dynamic-analysis.md §2 |
| I-002 | Sign Out | Avatar menu, item `Sign Out`; Settings sidebar footer, `Sign Out` button | LOG | ACCOUNT (ends session); deletes `~/.tempo-auth.json` [inferred] | `auth:signOut`, event `onSignedOut` | l.35303 org menu region; Settings footer |
| I-003 | Re-authentication banner | `reauth-banner`, `reauth-banner-login`; `auth-status-banner` | expired session | EXT (opens login) | `auth:refreshToken` | testids |
| I-004 | Onboarding (7 steps) | Gate `Jyn`; testids `onboarding-next`, `onboarding-back`, `onboarding-finish-status` | LOG, new account or without `completeOnboarding` | ACCOUNT (creates org, invites, project, kickoff agents) / AI | `users:completeOnboarding`, `organizations:createOrganization`, `invites:*` | `index-D2Ui1vc0.js` (steps `role`, `pending-invitations`, `invite`, `set-up-agents`, `create-project`, `create-prompt`, `kickoff-workspaces`) |
| I-005 | Onboarding: role | `onboarding-role-${id}` (Designer, Developer, Product Manager, Other); title "Which of the following best describes your role?" | I-004 | L | — | testids |
| I-006 | Onboarding: pending invitations | `onboarding-pending-invitation-${memberId}`, `-join-`, `-joined-`; title "Using Tempo with your organization?" | pending invitation | ACCOUNT (accepts invitation) | `invites:listMyPendingInvitations`, `invites:acceptInviteByMember` | testids |
| I-007 | Onboarding: create org / invite | `onboarding-invite-team-form`, `onboarding-invite-email-${n}`, `onboarding-invite-add-more`, `onboarding-invite-copy-link`; title "Create your Organization!" | I-004 | ACCOUNT + EXT (invite emails) | `organizations:createOrganization`, `invites:addInvitedEmails`, `invites:sendInviteEmails` | testids |
| I-008 | Onboarding: set up AI agents | `onboarding-set-up-agents-grid`, `onboarding-agent-${id}`, `-login`, `-install-dependency`, `onboarding-login-terminal` (+ `-done`, `-close`); title "Set up your AI agents" | CLI installed or installable | NAT/AI: opens a terminal for CLI login | `agent-detection:probe-auth`, `install-detection:check`, `terminal:create` | testids |
| I-009 | Onboarding: create/open project | `onboarding-project-method-${id}` (`create` = "Create new project", `open` = "Open existing project"); title "Create or open a project" | I-004 | NAT (dialog) / LOC (creates folder) | `dialog:openFolder`, `workspaces:createNewProject` | testids |
| I-010 | Onboarding: generation prompt | `onboarding-ai-generate-page`, `onboarding-ai-generate-loading`, `onboarding-generate-file-input` | new project | AI (skill `generate-prototype`) | `ai-chat:sendMessage` | testids |
| I-011 | Onboarding: kickoff of N agents | `onboarding-kickoff-${id}`, `onboarding-kickoff-model`, `-effort`, `-prompt-edit`, `-prompt-dialog(-input/-save)`, `onboarding-kickoff-skip`; title "Start N agents on <project>" / "Start your first agents" | I-009 | **AI in parallel** (consumes credit/CLI) | `ai-chat:sendMessage`, `workspaces:create*` | testids; functional map M27 |
| I-012 | Force upgrade (blocking overlay) | `force-upgrade-overlay`, `force-upgrade-action`, `force-upgrade-download-link`, `force-upgrade-landing-link` | server requires a new version; can be simulated with `window.__TEMPO_E2E__` | EXT (download); blocks the app | `updater:onForceUpgradeRequired` | testids; `index-D2Ui1vc0.js` |
| I-013 | Auto-update (install/retry/manual) | `updater-install`, `updater-install-retry`, `updater-manual-download` | update downloaded | Mild DEST: restarts the app. In RE-TEMPO auto-update is disabled | `updater:*` (9 channels) | testids; docs/modding-guide.md |
| I-014 | Connection outage banner | `connection-outage-banner` | Convex/network down | L | — | testid |
| I-015 | Error boundary | `error-boundary-stack`; illustrations `error-illustration-CskSZhgg.png` / `-light-` | React crash | L | `bug-report:*` | assets + testid |
| I-016 | Light/dark theme | Settings → Preferences → "Appearance" (Dark/Light); `html[data-theme]` | FLAG `light-mode` for light | LOC (`localStorage["tempo-theme"]`) | — | Settings `RIa` |
| I-017 | `tempo://` deep links | URL scheme; errors `deep-link-clone-error`, `deep-link-org-access-denied`, `-switch-account` | LOG | PRJ/EXT: may clone a repo | `tempo:open-url`, `git:clone` | testids |

### 3.2 Shell, navigation and tabs

| ID | Feature | How to reach / selectors | Prerequisites | Side effect / risk | IPC / Convex | Evidence |
|---|---|---|---|---|---|---|
| I-020 | Navbar: Chat | `workspace-navbar-chat-button`, shortcut Ctrl+1; tooltip "Describe what you want to build and AI will make code changes." | LOG | L (persists `localStorage["tempo:active-nav-route"]`) | — | l.646721 |
| I-021 | Navbar: Docs | `workspace-navbar-docs-button`; tooltip "Docs define what to build. Write one here, then generate canvases from it." | LOG | L | — | l.646737 |
| I-022 | Navbar: Design | `workspace-navbar-design-button`; tooltip "Visually edit your UI on a real codebase. Changes become real code." | LOG | L | — | l.646753 |
| I-023 | Navbar: Issues | `workspace-navbar-issues-button`; tooltip "See all your tasks at a glance…" | LOG | L | — | l.646769 |
| I-024 | Navbar: Agents | `workspace-navbar-agents-button`; indicators `agents-nav-indicator`, `agents-nav-unread-dot` | FLAG `custom-agents` | L | — | l.646781 |
| I-025 | Settings (route) | `button[aria-label="Settings"]` in the footer; Mod+, | LOG | L | — | l.35094 |
| I-026 | New Tab menu | Mod+T; `new-tab-panel`; actions `new-tab-action-{chat,canvas,prd,issue,terminal,browser,open,duplicate-active-tab,move-active-tab}` | PRJ | LOC/ACCOUNT depending on the action (New Doc/Issue create a record) | — | testids |
| I-027 | Center tabs (13 types) | `tab-${id}`; types `chat, canvas, design-canvas, prd, file, diff, mcp, terminal, browser, issue, agent, artifact, slack-preview`; close with Mod+W, reopen with Mod+Shift+T | PRJ | L | — | `index-D2Ui1vc0.js` tab validator |
| I-028 | Split view | `split-panel-toggle`; Mod+Option/Alt+T | PRJ | L | — | testid |
| I-029 | Right panel (rail) | `right-panel-rail`, `right-panel-toggle-button`; Mod+\ in Design | PRJ | L | — | testids |
| I-030 | Command palette (⌘⇧P) | Shortcut Mod+Shift+P; placeholder "Type a command..." (no testid; use `[cmdk-root]`, `[cmdk-input]`) | LOG | L; project run scripts execute commands (LOC/NAT) | `terminal:create` (run scripts) | cmdk; commands doc C07–C09 |
| I-031 | File palette (⌘P) | Mod+P; placeholder "Search anything across Tempo… (type > for commands)"; groups Open file, Chats, Canvases, Issues, Docs, Files | PRJ | L | `fs:readDir`, `workspaces:listAllFiles` | same |
| I-032 | Conversation palette (⌘K) | Mod+K; placeholder "Search conversations..." | PRJ | L | — | same |
| I-033 | Keyboard Shortcuts dialog | Help menu → Keyboard Shortcuts (Ctrl+Shift+/); search "Search shortcuts…"; event `tempo:open-keyboard-shortcuts` | LOG | L | — | commands doc C27 |
| I-034 | Help menu | `help-menu-button`; items Keyboard Shortcuts, Documentation (`https://docs.tempo.new/`), Community (Discord) | LOG | EXT (opens link) | `shell:openExternal` | l.646076 |
| I-035 | Bug report | `bug-report-button`; dialog `bug-report-dialog`; fields `bug-report-description`, `bug-report-record`, `bug-report-attach-button`, `bug-report-email-updates`, `bug-report-issue-fields` (FLAG `bug-report-issue-fields`); actions `bug-report-submit`, `-cancel`, `-done` | LOG | **ACCOUNT + EXT**: sends diagnostics, chat history, and a screenshot. NAT: screen-recording permission. In a dev build it only downloads the ZIP | `bug-report:submit`, `bug-report:auto-submit`, `bug-report:capture-app-screenshot`, `bridge getScreenRecordingPermission` | testids |
| I-036 | Native menu / ⌘, / DevTools / fullscreen | Application menu (main, bytecode); Cmd+Option+I; Ctrl+Cmd+F | app focused | NAT | `menu:*` (3), `window:*` (10) | docs/chan_preload_index.txt; shortcut table. Native menu contents [inferred] |
| I-037 | Quit prompt | When quitting with work in progress | active agents | Mild DEST | `app:confirm-quit`, `app:quit-prompt-ack`, `app:quit-response` | channels |

### 3.3 Home / projects (Add project, Generate, Open folder, Import)

| ID | Feature | How to reach / selectors | Prerequisites | Side effect / risk | IPC / Convex | Evidence |
|---|---|---|---|---|---|---|
| I-040 | Workspaces empty state | `workspaces-welcome`; text `No workspaces yet` | LOG, 0 projects | L | — | l.631073 |
| I-041 | Add project (menu) | `workspace-sidebar-header-add-project`, `workspace-sidebar-footer-add-project`, or ⋯ `chats-overflow-menu` (aria "Chat list options") → `chats-overflow-add-project` | LOG | L until an intent is chosen | — | l.629497, l.668944 |
| I-042 | Generate (new AI project) | `empty-state-generate`; submenu `chats-overflow-add-project-generate`; modes `empty-state-generate-design` ("Mockup": "A standalone visual separate from your codebase"), `-prototype` ("React Prototype": "A working app built from your code"), `-blank` ("Blank Project": "Start from an empty project"); group label "Generation mode"; input `new-chat-empty-state-input`, `empty-state-file-input` | LOG, CLI or Tempo Inference | **AI** (skills `generate-design` / `generate-prototype`), LOC (creates folder and Vite+React+Tailwind scaffold) | `workspaces:createNewProject`, `ai-chat:sendMessage` | l.650230–650470; `zya('generate')` |
| I-043 | Open folder | `empty-state-open-folder`; `chats-overflow-add-project-open-folder` | LOG | **NAT**: `dialog:openFolder` opens a native picker (not automatable via DOM); then registers the project | `dialog:openFolder`, `workspaces:isGitRepo`, `workspaces:gitInit`; `projects:registerProject` | l.671578 |
| I-044 | Import project | `empty-state-clone-repository` (card); `chats-overflow-add-project-import`; dialog "Import project" ("Choose how you'd like to add a project.") | LOG | opens a dialog (L) | — | l.653371 |
| I-045 | Import → Clone from URL | `add-repo-source-clone`; text "Paste a Git URL (https://, git@, ssh://) to clone the repo."; status `clone-access-status`, `clone-resolution-status` | LOG, git/gh | LOC (clone to disk) + EXT (network) | `git:clone`, `git:checkAccess`, `workspaces:cloneToRepos` | l.653371; `toolbar-menu-clone` |
| I-046 | Import → From your organization | `add-repo-source-org`; "Pick a project from {org}." | org with projects | LOC (clone) | `projects:getOrgProjects`, `workspaces:cloneToRepos` | same |
| I-047 | Recent artifacts | `new-chat-empty-state-recents`; cards `artifact-card-${type}:${id}`; actions `artifact-open-button`, `artifact-row-actions-trigger-${id}`, `artifact-preview-card` | LOG | L | `canvasIndex:getCanvasPreviewSnapshotsForProject` [inferred] | l.650425 |
| I-048 | New chat suggestions | empty state `chat-empty-state`; suggestions onboarding, design-system, prd, prototype; `new-chat-icon-button` | PRJ | AI on send | — | map/views V30 |
| I-049 | Getting Started (widget) | `getting-started-widget`; 4 tasks: "Spec and design a feature" (`spec-design-feature`), "Generate a design system" (`generate-design-system`), "Audit my tests and CI" (`audit-tdd`), "Launch Your Software Factory" (`launch-software-factory`) | PRJ | **AI** (8–20 min, 80–300 ktokens per task) and creates its own workspace | `gettingStarted:getProgress`, `gettingStarted:markStepComplete`, `ai-chat:sendMessage` | map/views V16 |
| I-050 | Org switcher / add org | Avatar menu: "Add an organization", "Show organization switcher"; `org-avatar-indicator-streaming/unread` | LOG | ACCOUNT (create org) | `organizations:getUserOrganizations`, `organizations:createOrganization`, `activeOrg:get/set` | l.34643, 35303 |

### 3.4 Chat and workspaces

| ID | Feature | How to reach / selectors | Prerequisites | Side effect / risk | IPC / Convex | Evidence |
|---|---|---|---|---|---|---|
| I-060 | Workspace/chat list (sidebar) | `workspace-item`, `workspace-row`, `workspace-row-title`, `workspace-chat-${ws}-${id}`; indicators `workspace-chat-indicator-{unread,loading,background,interrupted,archived,none}`; badges `workspace-pr-badge`, `workspace-remote-badge` | PRJ | L | `workspaces:*` | testids |
| I-061 | Chat input | `chat-input-textarea`; container `chat-tab-panel`; attachment `chat-input-attach-button`, `chat-input-file-input` | PRJ + CLI or Inference | **AI** on send (Enter) | `ai-chat:sendMessage`, `stream-event`, `stream-complete` | testids |
| I-062 | Provider selector | `chat-input-provider-selector`; options `chat-input-provider-option-{claude,codex,opencode,grok,cursor}` (Claude Code, Codex, OpenCode, Grok Build, Cursor CLI) | provider CLI | L (only filters by installed) | `agent-detection:probe-auth`, `chat-defaults:probe-cli` | testids |
| I-063 | Model and effort selector | `chat-input-model-selector`, `chat-input-effort-selector`, `chat-input-effort-option-${id}`; `chat-input-fast-mode-toggle`; `chat-input-speed-menu` | provider | L | `ai-chat:getCodexSpeedCapabilities` | testids |
| I-064 | Tempo Inference pill | `chat-input-tempo-inference-pill`; notice `tempo-inference-blocked-notice` (+`-dismiss`, `-open-settings`) | LOG | AI/credits | `billing:inheritedBilling` | testids |
| I-065 | Plan mode | `chat-input-plan-mode-button`, `chat-input-plan-mode-menu-item`; plan card and `ai-chat:submitPlanDecision` | PRJ | AI | `ai-chat:submitPlanDecision` | testids |
| I-066 | Composer menu (⋯) | `chat-input-toolbar-overflow`; items Generate Mockup (`chat-input-generate-design-menu-item`), Generate Prototype (`...-prototype-menu-item`), Configure MCP (`chat-input-mcp-menu-item`), Add files/Docs/Canvases/Issues, Add Linear issue (`chat-input-add-linear-issue`) | PRJ | AI when skills are triggered | — | testids |
| I-067 | Slash commands | type `/` in the textarea; 81 entries (e.g. `/compact`, `/cost`, `/context`, `/review`, `/plan`, `/model`, `/mcp`, `/agents`, `/rewind`, `/resume`); `command-option`, `command-argument-hint` | PRJ + CLI | AI/LOC depending on the command | `ai-chat:getSupportedCommands` | commands doc C20 |
| I-068 | Personal skills in chat | chip `personal-skill-chip`; sends `/tempo-personal:<slug>` | FLAG `personal-skills` | AI | `ai-chat:resolvePersonalSkills`, `preflightPersonalSkills`, `personalSkills:picker` | commands doc C21 |
| I-069 | Message queue and steer | `chat-input-tasks-indicator`; queue channels | active chat | AI | `ai-chat:queue*`, `steerActiveStream`, `interrupt`, `interruptRequest` | channels |
| I-070 | Agent permissions and questions | permission/question cards; `submitPermissionDecision`, `submitAnswer` | agent running | **LOC/DEST**: authorizes file edits and commands | `ai-chat:submitPermissionDecision`, `submitAnswer` | channels |
| I-071 | History, fork, rewind | chat context menu; `chat-loading-earlier-messages` | existing chat | `rewindFiles` is DEST (reverts files) | `ai-chat:getHistory`, `listSessions`, `forkSession`, `rewindFiles` | channels |
| I-072 | Chat/workspace context menu | right-click: Mark as unread, Rename chat, Archive, Delete chat, Restore, Open in, Enable Remote Control, Archive workspace, Delete workspace, Delete permanently; `workspace-archive-${id}`, `workspace-delete-${id}`, `workspace-restore-${id}`, `workspace-permanent-delete-${id}`, `workspace-pin-${id}`, `workspace-remote-toggle-${id}` | PRJ | **DEST** (archive/delete remove the worktree) | `workspaces:prepareArchive`, `finishArchiveCleanup`, `restoreArchived`, `prepareDelete`, `delete` | commands doc C16 |
| I-073 | Chat artifacts | `chat-artifacts-summary(-trigger)`, `chat-artifact-panel-add/-empty`, `artifact-tab-view`, `artifact-link-chip`; types plan, doc, canvas, issue, agent, file | chat with tool calls | L | — | testids |
| I-074 | Changes panel (git) | `changes-panel`, `changes-toolbar`, `changes-view-toggle`, `changes-file-list-scroll-container`; menu `changes-context-{stage,unstage,view-diff,discard,open-in}`; `diff-mode-diff` / `diff-mode-hunks` | PRJ git | LOC; `changes-context-discard` is DEST | `workspaces:getChangedFiles`, `getFileDiff`, `stageFile`, `discardFileChanges`, `applyHunk` | testids |
| I-075 | Git toolbar | `git-action-split-button`, `git-action-commit`, `git-action-push`, `git-action-create-pr`, `git-pull-button`, `git-push-button`, `git-publish-button`; menu `toolbar-menu-*` (commit/amend/signoff, create-branch, create-tag, add/change-remote, clone, abort-rebase, discard-all) | PRJ git | **LOC + EXT**: commit, push, PR, publish branch, create GitHub repo | `workspaces:commitChanges`, `pushChanges`, `commitAndPush`, `publishBranch`, `pullChanges`, `createBranch`, `createGithubRepo` | testids |
| I-076 | PR checks and status | `pr-checks-menu-trigger`, `pr-checks-menu-open-pr`, `pr-checks-passing`, `pr-checks-failing`, `pr-review-approved`, `pr-review-changes-requested` | PRJ + gh | EXT (GitHub API via gh) | `workspaces:getPRStatus`, `getPRStatusBatch` | testids |
| I-077 | Files and Monaco editor | tree `files-tree-item-*`, `files-new-file-button`, `files-new-folder-button`, `files-row-actions-trigger`; tab `file`; notices `file-too-large-banner`, `file-load-error-banner`; search `files-search-empty` | PRJ | LOC (create/rename/delete/save file) | `fs:readFile`, `fs:writeFile`, `workspaces:createFile`, `renameFile`, `deleteFile`, `saveFileContent`, `lsp:*` | testids |
| I-078 | Terminal (xterm + node-pty) | tab `terminal` via New Tab → `new-tab-action-terminal` | PRJ | **LOC/DEST**: arbitrary shell | `terminal:create/write/resize/dispose` | channels; `terminalBridge` |
| I-079 | Embedded browser (webview) | `new-tab-action-browser`; `browser-address-bar`, `browser-back-button`, `browser-forward-button`, `browser-webview`, `browser-find-bar`, `browser-add-element-to-chat-button`; errors `browser-load-error`, `browser-empty-state` | PRJ | EXT (navigates to the URL) | `browser:*`, `tempo-browser:open-url-in-new-tab` | testids |
| I-080 | MCP server manager | tab `mcp` ("MCP Servers"); via Configure MCP | PRJ + CLI | AI/LOC (enables/disables/reconnects servers) | `ai-chat:getMcpStatus`, `toggleMcpServer`, `reconnectMcpServer` | channels |
| I-081 | Dev server / run scripts | run-script selector in the workspace; "Start/Restart dev server" in the composer menu | PRJ | **LOC**: starts a process and local port | `appServer:acquire/release/stop/setCommand`, `workspaces:getDevServerLaunchPlan` | channels |
| I-082 | Chat CLI mode | toggle `cliMode`/`onCliModeToggle`; banners `cli-command-banner`, `cli-exit-banner`, `cli-exit-banner-restart` | CLI | AI; the `TrustPromptDismisser` answers CLI trust prompts on its own (security alert) | `terminal:*`, `cli:resolveLaunch` | testids; reverse-engineering §5.4 |
| I-083 | OpenCode no-auth notice | `opencode-auth-banner-key-input`, `-open-signin`, `-save` | OpenCode provider | EXT + writes a credential | `ai-chat:getOpencodeAuthStatus`, `setOpencodeAuthKey`, `openOpencodeSignInUrl` | testids |
| I-084 | Remote workspaces (Machines / remote control) | `workspace-remote-toggle-${id}`, `agent-prop-remote-control`; Settings → `settings-machines-section` | FLAG `remote-control` | **EXT**: tunnel `wss://relay.tempo.new`; remote execution | `remote-control:*`, `remoteWorkspaces:*`, `remoteCommands:*`, `machines:*` | testids |

### 3.5 Docs / PRD

| ID | Feature | How to reach / selectors | Prerequisites | Side effect / risk | IPC / Convex | Evidence |
|---|---|---|---|---|---|---|
| I-090 | Docs list and tree | `workspace-navbar-docs-button` → `docs-view-sidebar`, `docs-view-tab-bar`; sub-page `docs-sidebar-add-sub-page-${id}` | LOG | L | `docs:getDocsTree` | testids |
| I-091 | Create/open doc | New Tab → `new-tab-action-prd` (shortcut D); Convex doc `convex://docs/<id>` or local `.md` in `tempo/prds/` | LOG | **ACCOUNT** (Convex doc) or LOC (.md) | `docs:createDoc`, `docs:getDoc` | testids |
| I-092 | Tiptap editor (slash menu, 18 items) | `/` in the editor; `doc-editor-scroll-container`; items Continue Writing, Ask AI, Heading 1/2/3, Bullet/Numbered/To-do list, Blockquote, Code Block, Mention, Emoji, Table, Separator, Table of contents, Image, Attach file | doc open | ACCOUNT (autosave via Yjs); AI on the AI items | `docs:updateDoc`, Yjs `[ConvexYjsProvider]` | commands doc C22 |
| I-093 | Doc context menu | `docs-sidebar-context-menu`, `-change-icon`, `-delete` (+ Rename) | existing doc | **DEST** (delete) | `docs:moveDoc`, `docs:deleteDoc` | testids |
| I-094 | Docs right panel and context | `docs-right-panel`, `docs-right-panel-context-trigger`, `doc-context-button`, `doc-context-panel(-add)` | doc open | L | — | testids |
| I-095 | Doc AI chat | `docs-ai-chat-panel`, `docs-ai-chat-toggle-icon` | doc + CLI/Inference | **AI** | `ai-chat:sendMessage` | testids |
| I-096 | Skill spec-design-feature / canvas generation from the doc | via Getting Started or chat | PRJ | AI, LOC | — | skills doc |

### 3.6 Design / Canvas / Storyboards / Design System

| ID | Feature | How to reach / selectors | Prerequisites | Side effect / risk | IPC / Convex | Evidence |
|---|---|---|---|---|---|---|
| I-100 | Design home (canvas grid) | `workspace-navbar-design-button` → `canvas-homepage`, `canvas-grid`, `canvas-list-toolbar`, `canvas-sidebar`, `canvas-design-sidebar`; states `canvas-grid-empty`, `canvas-grid-loading`, `canvas-grid-scan-error`, `design-homepage-empty-workspace`, `design-homepage-no-canvas-config` | PRJ | L | `workspaces:listCanvases*`, `canvasIndex:*`, `canvasPins:getPinnedCanvases` | testids |
| I-101 | New canvas | `homepage-new-canvas-button`, `workspace-row-new-canvas`, `workspace-canvases-modal-new-canvas`, New Tab uppercase C (`new-tab-action-canvas`) | PRJ | LOC (creates a folder with `index.canvas.tsx`) | `workspaces:writePageConfig`, `ensureTempoConfigs` | testids |
| I-102 | Open existing canvas | `new-tab-action-open`; `open-modal-search`; `workspace-canvases-modal-search` | PRJ | L; starts `canvas devserver` | `appServer:*`, `tempobook:*`, `frame-pool:*` | testids |
| I-103 | Canvas (storyboard rendering) | tab `canvas`/`design-canvas` (`design-tab-${id}`); `canvas-loading-progress(-label)`; isolated webviews (`frame-pool`) | PRJ + dev server | LOC (processes) | `frame-pool:*` (21), `canvas:*`, `html-storyboard:*`, `tailwind:*`, `css-variables:*` | testids |
| I-104 | Design tools and shortcuts | V F R T Shift+R Shift+C Shift+G I; Mod+A/C/X/V/D/Z; zoom Shift+1/2, Mod+=/-/0; Mod+\ | canvas focused | LOC (edits become code) | `canvas-edit-log:record`, `workspaces:planWrapStoryboards` | commands doc §2 |
| I-105 | Style / selection panel | `design-selection-style-panel`, `design-selection-empty-state`, `design-selection-multi-state`; popovers `layout-settings-trigger`, `typography-settings-trigger`, `border-settings-trigger`, `align-settings-trigger`, `wrap-settings-trigger`, `outline-settings-trigger`; `add-stroke`, `add-effect` | selection | LOC | `canvas:*` | testids |
| I-106 | Design variables | `variables-open-modal`, `variables-modal(-search/-nav/-row-${name})`, states `-loading/-empty/-error` | canvas | LOC | `css-variables:*` | testids |
| I-107 | Canvas AI Mode | bar `ai-mode-bar`, `ai-mode-apply`, `ai-mode-cancel`, `ai-mode-queue-dock`, `ai-mode-ledger-view`, dialog `ai-mode-extract-dialog` | FLAG `canvas-ai-mode` | **AI** + LOC | `ai-chat:sendMessage` | testids |
| I-108 | Canvas right panel (assets, layers, activity) | `canvas-right-panel`, `canvas-right-panel-activity-trigger`, `canvas-activity-list`, `canvas-context-panel-add` | canvas open | L | `notifications:listActivityForCanvas` | testids |
| I-109 | Canvas chat | `canvas-chat-panel`, `canvas-chat-view`, `canvas-chat-session-selector` | canvas + CLI | AI | `ai-chat:*` | testids |
| I-110 | Storyboard comments | `canvas-comment-composer`, `canvas-comment-pin-layer`, `canvas-comment-popover`; `comment-message-*`, `comment-thread-{reply,copy-link,delete,mark-unread}`, `comments-sidebar-filter-trigger` | LOG + canvas | **ACCOUNT** (creates thread, attachments, reactions) | `comments:createThread`, `addComment`, `resolveThread`, `deleteThread`, `generateAttachmentUploadUrl` | testids |
| I-111 | Share canvas (`view.tempo.new`) | `share-popover`, `share-link-field`, `share-copy-link-button`, `share-commit-message`, `share-commit-push-button`, `share-create-repo-button`, `share-repo-name-input`, `share-invite-email-input`, `share-invite-send-button`, `share-preview-overlay` | LOG + project with repo | **PUB**: publishes screenshots, commits/pushes, creates a repo, sends email | `publicShares:enablePublicShare`, `canvasArtifacts:publishCanvasArtifact`, `projects:upsertShareSnapshot`, `workspaces:pushChanges`, `createGithubRepo` | testids |
| I-112 | Visual tests / visual review | element menu "Track/Untrack visual test"; "Approve all storyboards"; visual review portal | PRJ + PR | ACCOUNT/PUB | `visualReview:approveAllForRun` [inferred] | functional map M10, M47 |
| I-113 | Paste from Figma (JSX storyboard) | paste (Mod+V) on the canvas; `figma-paste-with-token`, `figma-paste-without-images`, `figma-paste-token-input`, `figma-paste-token-error` | PRJ + Figma token (optional) | EXT (Figma API) + LOC | `figma:fetch-images`, `figma:get-state`, `figma:save-pat` | testids |
| I-114 | Extract to JSX storyboard / html-to-jsx | element context menu (also "Extract selected component to JSX…") | route canvas | LOC | `html-storyboard:*`, `html-projection:update` | commands doc §6 |
| I-115 | Design system / assets (`defineAsset`) | Assets panel on the canvas; skill `generate-design-system`; `asset-preview:*` | PRJ | AI + LOC (writes `.canvas.tsx` files) | `asset-preview:save-files`, `asset-index:*` | functional map M08, M09 |
| I-116 | Home cover / canvas pins | menu: Set/Remove as home cover; pin | canvas | ACCOUNT | `canvasIndex:setCanvasCoverStoryboard`, `canvasPins:pinCanvas/unpinCanvas` | commands doc §6 |

### 3.7 Issues

| ID | Feature | How to reach / selectors | Prerequisites | Side effect / risk | IPC / Convex | Evidence |
|---|---|---|---|---|---|---|
| I-120 | Issues board | `workspace-navbar-issues-button` → `issues-view`/`issues-board`, `issues-board-scroll`, `issues-column-header`, `issues-sidebar`, `issues-view-tab-bar` | LOG + org | L (creates the board on first access: `getOrCreateBoard`) | `issues:getBoard`, `getOrCreateBoard`, `getIssues` | testids |
| I-121 | Create issue | `issues-new-issue-button`, modal `issues-create-modal`, `issues-create-title-input`, `issues-create-submit`, `issues-create-and-open`, `issues-create-more-toggle`; New Tab → `new-tab-action-issue` | LOG | **ACCOUNT** | `issues:createIssue` | testids |
| I-122 | Issue detail | `issues-detail-view`, `issues-detail-back/-close/-copy-id/-delete`, `issue-comment-input`, `issue-assignee-trigger`, `issues-activity-feed` | issue | ACCOUNT (comment/edit/delete); `issues-detail-delete-confirm` DEST | `issues:updateIssue`, `addComment`, `deleteIssue`, `getIssueActivity` | testids |
| I-123 | Filters, search, grouping, display | `issues-search-input`, `issues-filter-add-button`, `issues-filter-reset`, `issues-grouping-select`, `issues-display-button`, `issues-order-field-trigger` | board | L | — | testids |
| I-124 | Org saved views | `issues-filter-save`, `issues-filter-save-as-menu-item`; "Save as new org view" | LOG | **ACCOUNT** | `issues:createView`, `updateView`, `deleteView`, `toggleViewFavorite` | testids |
| I-125 | Labels and stages per issue | `issues-label-pill`, `issues-label-create-option`, `issue-labels-menuitem`, `issue-stage-menuitem-${id}` | issue | ACCOUNT | `issues:createLabel`, `bulkPatchIssues` | testids |
| I-126 | Bulk actions | `issues-bulk-bar`, `issues-bulk-create-workspaces`, `issues-bulk-overflow`, `issue-context-menu-bulk-header` | selection | ACCOUNT; "Create workspace" creates worktrees (LOC) | `issues:bulkUpdateIssues`, `bulkDeleteIssues` | testids |
| I-127 | Create workspace from an issue | `issues-detail-create-workspace`, `issue-create-workspaces-menuitem`, `chat-issue-card-create-workspace` | PRJ | LOC + AI | `workspaces:create` | testids |
| I-128 | Assign agent to an issue | `issue-assignee-trigger` → assignable agents; `issue-context-agent-run-pending` | FLAG `custom-agents` | **AI + ACCOUNT** (triggers a run) | `agentAssignments:assignAgentToIssue`, `agents:listAssignableAgentsInOrg` | testids |
| I-129 | AI chat panel in Issues | `issues-ai-chat-panel`, `issues-ai-chat-toggle-icon` | CLI/Inference | AI | `ai-chat:*` | testids |
| I-130 | Linear: synced issues and picker | `linear-issue-picker`, `-row`, `-search` | Linear connected | L | `linearIntegrations:listSyncedIssues`, `getIssueWithComments` | testids |

### 3.8 Agents / software factory

| ID | Feature | How to reach / selectors | Prerequisites | Side effect / risk | IPC / Convex | Evidence |
|---|---|---|---|---|---|---|
| I-140 | Agents landing and empty state | `agents-landing-create`, `agents-landing-browse-templates`, `agents-landing-empty`, `agents-empty-create`, `agents-empty-browse(-all)` | FLAG `custom-agents` | L | `agents:listMyAgents` | testids |
| I-141 | Agent list | `agents-list-sidebar`, `agent-list-header`, `agent-list-search`, `agent-list-create`, `agent-list-create-blank`, `agent-list-browse-templates`, `agent-list-empty`, `agent-list-clear-filters`, `agent-list-settings-${id}` | same | L | `agents:listAgentsInOrg` | testids |
| I-142 | Gallery of 12 templates | Bug Fixer, Feature Builder, Spec & Design, Feedback Triage (slack), Board Sync on Merged PRs (github), PR Reviewer, Production Error Sweep, Daily Bug Report, Build-in-Public Curator, Prioritization, Brainstorming, Daily Release Driver; `agent-template-from-scratch` | same | **ACCOUNT** on create | `agents:createAgent` | functional map M18, M19 |
| I-143 | Agent configuration | `agent-settings-view`, `agent-settings-title`, `-description`, `-enable`, `-duplicate`, `-delete`, `-back`; props `agent-prop-model`, `-effort`, `-permission`, `-visibility`, `-auto-archive`, `-remote-control` | agent | ACCOUNT; `-delete` DEST; enabling an agent makes the machine execute runs | `agents:updateAgent`, `deleteAgent` | testids |
| I-144 | Agent triggers | `agent-add-trigger`, `agent-add-trigger-option-${kind}` (assigned_to_me, schedule, slack, github), `agent-trigger-config-modal`, cron: `agent-trigger-cron`, `-nl`, `-generate`; Slack: `agent-trigger-slack-channel-search`; assignee/label chips | agent | ACCOUNT; Slack/GitHub require an org connection; a schedule runs local commands unattended | `agentTriggers:estimateTriggerRate`, `agentSchedules:getAgentScheduleStatus`, `agentWebhooks:ensureWebhookForAgent`, `regenerateWebhookUrl` | testids |
| I-145 | Run an agent manually / runs | `agent-run-card`, `agent-queued-run-row`, `agent-list-queued-${id}`; open the agent chat (`agents-chat-sidebar`) | agent enabled | **AI** (consumes CLI/credit) | `agentRuns:runAgentManually`, `cancelQueuedRuns`, `listRunsForAgent`; `agent-run-heartbeat:register` | testids |
| I-146 | Org public agents (sharing) | `settings-public-agents`, `shared-agent-row-${id}`, `shared-agent-open-${id}`, `shared-agent-unshare-${id}` | LOG | ACCOUNT (visibility) | `agents:listPublicAgentsInOrg` | testids |
| I-147 | Maximum run concurrency | Settings → Preferences, `settings-max-agent-concurrency` (default 10) | LOG | ACCOUNT | `users:setMaxAgentConcurrency` | Settings |
| I-148 | Software factory (launch) | Getting Started "Launch Your Software Factory"; skill `launch-software-factory`; marker `TEMPO_STEP_COMPLETE` | PRJ, Linear/feedback | **AI + ACCOUNT** (pulls 3 issues, assigns agents) | `issues:*`, `agentAssignments:*` | functional map M55 |
| I-149 | Agent Runs panel (user mod) | `[data-rar-root]`, ⌘⇧A | LOG | L (queries only) | `agentRuns:listMyActiveRuns`, `listMyRecentlyFailedRuns`, `agents:listMyAgents`, `organizations:getUserOrganizations`, `agentRuns:listRunsForAgent` | `feature/agent-runs-panel.js` |

### 3.9 Settings (personal, org, project)

Access: `button[aria-label="Settings"]`, Mod+,, or "Settings for {org}" in the avatar menu. The Settings sidebar has "Return to app", groups Personal / Organizations / Projects (`[data-section="projects"]`), and a footer with `Sign Out`. Navigation items have no testid; select by exact text.

| ID | Feature | How to reach / selectors | Prerequisites | Side effect / risk | IPC / Convex | Evidence |
|---|---|---|---|---|---|---|
| I-160 | Preferences: Appearance | Dark/Light selector (no testid); `localStorage["tempo-theme"]` | FLAG `light-mode` (light) | LOC | — | Settings `RIa` |
| I-161 | Preferences: links in Tempo | `settings-chat-links-open-in-tempo-toggle`, `settings-workspace-pr-links-open-in-tempo-toggle` | — | LOC (`tempo:chatLinksOpenInTempo`, `tempo:workspacePrLinksOpenInTempo`) | — | testids |
| I-162 | Preferences: process memory tracker | `settings-process-memory-tracker-toggle` | Insiders/dev build | LOC | — | testid |
| I-163 | Preferences: auto-upload diagnostics | `settings-auto-upload-diagnostics-toggle` | LOG | **ACCOUNT** (sends error bundles) | `users:setAutoUploadDiagnosticsEnabled` | testid |
| I-164 | Preferences: Figma token | `settings-figma-token-input/-save/-reveal/-change/-remove`; state "Connected via Figma OAuth" | LOG | **ACCOUNT** (secret on the server) | `figma:setPat`, `figma:revealPat`, `figma:clearConnection`, `figma:getConnection` | testids |
| I-165 | Preferences: Machines | `settings-machines-section`, `settings-machine-rename-input`, `-rename-button`, `-remove-button` | FLAG `remote-control`, 1+ machine | ACCOUNT; remove is DEST | `machines:rename`, `machines:remove` | testids |
| I-166 | Chat: new chat defaults | `aria-label="New chat defaults"` | LOG | LOC | store `chatDefaults` | Settings `S7n` |
| I-167 | Chat: System Prompt | `settings-user-system-prompt` (aria "User system prompt") | LOG | **ACCOUNT** (goes into every AI conversation) | `users:setUserSystemPrompt` | testid |
| I-168 | Chat: Personal skills | list with `aria-label="Skills"`; "Manage skills…" | FLAG `personal-skills` | **ACCOUNT** (create/edit/delete) | `personalSkills:list/get/create/update/duplicate/remove/resolve` | Settings |
| I-169 | Billing: Tempo Inference | `aria-label="Use Tempo Inference"`; `tempo-inference-suspended-note` | LOG | AI/credits | `billing:inheritedBilling` (setUseInheritedCredits) | Settings `PPa` |
| I-170 | Billing: subscribe to a plan (Pro $30, Scale $50, Ultimate $100, Power $350) | plan cards, `Subscribe` button (becomes "Opening…") | LOG | **EXT/PAYMENT**: opens Stripe Checkout. DO NOT automate | `billing:inheritedBillingImport.createCheckoutSession` | Settings |
| I-171 | Billing: Manage Plan | `Manage Plan` button | active plan | EXT (Stripe portal) | `createManagePlanSession` | Settings |
| I-172 | Billing: top-up | `chat-billing-topup-decrement/-amount/-increment/-add` (US$50 per unit, 1 to 10) | LOG | **EXT/PAYMENT** | `createTopUpCheckoutSession` | testids |
| I-173 | Billing: promo code | input aria "Promo code" (`TEMPO-XXXX-XXXX`), `Redeem` button; `promo-pending-chip` | LOG | **ACCOUNT** (adds credits) | `billing:promoCodes.redeemPromoCode`, `getMyRedemptions` | Settings |
| I-174 | Billing: credits per model | `tempo-inference-model-table`, `ti-provider-row/-expand/-toggle-${p}`, `ti-model-row/-toggle-${id}`; `scoped-packs-list` | LOG | ACCOUNT | `billing:inheritedBilling.setModelRedemptionDisabled` | testids |
| I-175 | Auth tokens (`TEMPO_AUTH_TOKEN` / `@tempo-ai/mcp`) | "Auth tokens" section; input "Token name (e.g. grokbot, codex-cloud)"; `Revoke` (no testid) | LOG | **ACCOUNT** (creates a secret, shown once) | `mcpTokens:mint/list/revoke` | Settings `VPa` |
| I-176 | Providers (BYOK) | tab `providers-tab`; `provider-group-${id}`; `model-set-key-${modelId}`, `model-key-input-${modelId}`, `model-baseurl-input-${modelId}`, `model-save-${modelId}`, `model-remove-${modelId}`; text "System default" / "Custom key" | LOG | LOC (key only on the device; `maskedKey · host`) | `provider-api-keys:get-all/set/clear` | testids |
| I-177 | Referrals | label exists, but the container does not pass the prop; probably hidden in this build [inferred] | — | — | `posthog:getInstallReferralToken` | Settings `LIa` |
| I-178 | Org: General | `org-logo-input`, `org-name-input`, `org-slug-input` (prefix `view.tempo.new/`) | ADM [inferred] | **ACCOUNT** | `organizations:updateOrganization`, `generateUploadUrl` | testids |
| I-179 | Org: Members and invites | `invite-members-button`, `invite-link-field`, `invite-email-input`, `invite-email-submit`, `member-row`, `invited-member-row`, `make-admin-action`, `remove-admin-action` | LOG | **ACCOUNT + EXT** (emails); removing a member is DEST | `members:getOrgMembers`, `updateMemberRole`, `removeMember`, `invites:addInvitedEmails`, `sendInviteEmails` | testids |
| I-180 | Org: access requests | `access-requests-section`, `access-request-row`, `access-request-approve`, `access-request-deny` | ADM | ACCOUNT | `accessRequests:*` | testids |
| I-181 | Org: Projects | `add-project-to-org-button`, `settings-project-row`, `remove-project-button`; "Device folder" / "Github repo" | LOG | ACCOUNT | `projects:registerProject`, `removeProject`, `updateProjectName` | testids |
| I-182 | Org: Agents (public) | see I-146 | — | — | — | — |
| I-183 | Org: PR Insights | `pr-insights-chart`, `pr-insights-user-filter`, `pr-insights-metric-${v}`, `pr-insights-refresh`, `pr-insights-rebuild`, states `pr-insights-empty`, `pr-insights-error` | FLAG `org-pr-insights`, gh CLI | EXT (GitHub API via gh) | `pr-insights:fetch` | testids |
| I-184 | Org: Integrations — Linear | `linear-integration-card`, `linear-connect-button`, `linear-manage-teams-button`, `linear-team-picker-row/-confirm`, `linear-write-switch` ("Allow Tempo to write to Linear"), `linear-overflow-button`, `linear-disconnect-confirm` | LOG + org | **EXT** (OAuth in the browser); write-switch and disconnect change data | `linearIntegrations:getIntegrationStatus`, `createLinearInstallNonce`, `setSyncedTeams`, `setWriteEnabled`, `disconnectLinearIntegration` | testids |
| I-185 | Org: Integrations — Slack | `slack-integration-card`, `slack-connect-button`, `slack-workspace-row`, `slack-workspace-disconnect`, `slack-workspace-reconnect` | LOG + org | **EXT** (OAuth in the browser) | `slackIntegrations:getIntegrationStatus`, `createSlackInstallNonce`, `disconnectSlackIntegration` | testids |
| I-186 | Org: Stages (admin) | `issues-stages-editor`, `issues-stages-status-row-${s}`, `issues-stages-add-${s}`, `issues-stages-label-${id}`, `issues-stages-delete-${id}`, `issues-stages-delete-confirm` | ADM | **ACCOUNT** (22 stages, 5 groups) | `issues:getStageRegistry`, `createStage`, `updateStage`, `reorderStages`, `hideBuiltinStage`, `deleteStage` | testids |
| I-187 | Org: Admin (delete org) | "Deletion" / "Delete organization" section; confirmation by typing the name | ADM | **Irreversible DEST** | `organizations:deleteOrganization` | Settings |
| I-188 | Project: scripts and danger zone | "Org Setup Script", "Org Run Scripts", "My Setup Script", "My Run Scripts"; `delete-project-from-client(-confirm)` | PRJ | ACCOUNT (org scripts) / local DEST (remove the project from the machine) | `projectScripts:*`, `workspace:readTempoConfig` | Settings `Yfn` |

---

## 4. Sections by area

### 4.1 Routes and screens

- react-router routes (MemoryRouter, `initialEntries` `/workspaces`): only `/workspaces` and `*`, both rendering the same root component. There are no navigable URLs; navigation is driven by Zustand (`activeNavRoute`, `centerTabs`).
- `activeNavRoute`: `chat`, `docs`, `design`, `issues`, `agents`, `settings`, `prd` (alias). Only the first four persist in `localStorage["tempo:active-nav-route"]`.
- Automation: switching screens = clicking the `workspace-navbar-*-button` buttons. To validate the screen, wait for the section container (`docs-view-sidebar`, `canvas-homepage`, `issues-board`, `agents-list-sidebar`/`agents-landing-*`, `workspaces-welcome`).
- The product's own test mode: `NODE_ENV=test` with `TEMPO_E2E_USER_DATA_DIR`, and `window.__*__` (stores and Convex client), skipping auth and onboarding; flag override via `localStorage["tempo:e2e-feature-flags"]`. Documented by `tempo-re`, not exercised here.

### 4.2 Feature flags and plan gates

| Flag (PostHog) | Effect | How to force in a test |
|---|---|---|
| `custom-agents` | Agents tab, agent assignment to issues, run executor | `localStorage["tempo:e2e-feature-flags"]` [inferred] |
| `remote-control` | Machines, remote workspaces, remote commands | same; `electronAPI.remoteControl.forceEnabled` |
| `light-mode` | light theme | same |
| `canvas-ai-mode` | canvas AI Mode | same |
| `bug-report-issue-fields` | issue fields in the bug report | same |
| `org-pr-insights` | PR Insights in org Settings | same |
| `personal-skills` | personal skills and "Manage skills…" | same |

Plan gates: the client does not block functions by plan. The plan only defines the monthly inference quota (`monthlyGrantUsdMicros`). Without credit, chat falls back to the user's own provider account. The free tier uses `*-tempo-free` models. Roles: `memberRole === "admin"` governs Admin, Stages, and access approval.

### 4.3 Empty, error, and loading states (selectors for asserts)

| Context | Selector / text |
|---|---|
| No workspaces | `workspaces-welcome`, `No workspaces yet` |
| Empty new chat | `new-chat-empty-state`, `chat-empty-state`, `new-chat-empty-state-recent-card-skeleton` |
| No canvases | `canvas-grid-empty`, `design-homepage-empty-workspace`, `design-homepage-no-canvas-config`, `canvas-grid-scan-error` |
| No agents | `agents-landing-empty`, `agents-empty-create`, `agent-list-empty` |
| No git changes | `changes-empty` |
| Browser | `browser-empty-state`, `browser-load-error`, `browser-loading-overlay` |
| File | `file-too-large-banner`, `file-load-error-banner`, `files-empty` |
| Connection/auth | `connection-outage-banner`, `reauth-banner`, `auth-status-banner` |
| Inference | `tempo-inference-blocked-notice`, `tempo-inference-suspended-note` |
| PR insights | `pr-insights-empty`, `pr-insights-error` |
| CLI | `cli-command-banner`, `cli-exit-banner` |
| Crash | `error-boundary-stack` |

### 4.4 Integrations

Real for the user: Figma (PAT/OAuth), GitHub (gh CLI + agent webhooks), Linear (OAuth), Slack (OAuth + @Tempo app). Tempo infrastructure: Clerk, Convex, PostHog, Sentry, Stripe, Vercel (updates), Discord (link). Absent: Jira, Supabase, Netlify, Asana, ClickUp, Loom.

### 4.5 IPC mapping by namespace (403 channels)

workspaces 115, ai-chat 47, frame-pool 21, tempobook 17, lsp 17, fs 15, asset-preview 10, window 10, updater 9, terminal 10, bug-report 7, and the rest with fewer than 11. Highest-risk channels for tests: `terminal:create/write`, `workspaces:pushChanges/commitAndPush/publishBranch/createGithubRepo/delete*/discard*`, `fs:writeFile`, `shell:openExternal`, `dialog:openFolder`, `provider-api-keys:set/clear`, `auth:getToken`, `bug-report:submit`, `remote-control:setEnabled`, `stubAi:*`, and `workspaces:test*` (test hooks in production).

---

## 5. Coverage and gaps

- Electron native menus (the macOS menu bar) live in the main process as bytecode; only the shortcuts reach the renderer. Exact contents [inferred].
- "Let's do it": home title not found as a literal string; probably a variable or coming from a list [inferred]. For tests, anchor on `new-chat-empty-state` and the three `empty-state-*`.
- Referrals and AI CLI login/status inside Settings: no visible screen in this build [inferred]. CLI status appears in onboarding (`onboarding-agent-*`) and in the provider selector.
- Settings → Chat: only 3 sub-blocks confirmed (defaults, system prompt, skills).
- Selectors for Settings navigation items and the avatar menu have no testid; they depend on text/aria and are fragile to language changes.
- The query/mutation/action types of several Convex functions are inferred from the name.
- Nothing was executed: no flag, shortcut, or selector was validated at runtime.

---

## 6. Proposed test suites

Ordered by priority (P0 = mandatory and safe smoke; P3 = only with explicit authorization).

| Suite | Area | Items | Priority | Content | Recommended isolation |
|---|---|---|---|---|---|
| S1 — Shell and navigation | I-020 to I-037, I-040, I-041 | P0 | Presence and navigation of the 5 navbar buttons, Settings, Help, Bug (open and cancel), shortcuts Ctrl+1…9, Mod+P/Shift+P/K, Mod+T, Keyboard Shortcuts, `No workspaces yet` state, `workspaces-welcome` | RE-TEMPO with an isolated profile or logged in, read-only; never submit a bug report |
| S2 — Home, projects, and Add project | I-042 to I-050 | P0/P1 | Add project menu (3 intents), Import project dialog (two paths), empty-state cards, Recent artifacts; Open folder only up to the native dialog (verify the call, do not pick a folder); Generate only up to the composer, without sending | isolated profile + `TEMPO_USER_DATA_DIR`; do not send a prompt |
| S3 — Full Settings (read-only and reversible) | I-160 to I-188 | P0 | Visit the 14 sections, assert labels/testids; local toggles (I-161, I-162) with restore; BYOK with a fake local key and removal; Providers; no Billing/Stripe, no delete org, no creating a token/promo | isolated profile; real accounts read-only |
| S4 — Chat and workspaces (with AI stub) | I-060 to I-084 | P1 | Composer, provider/model/effort selectors, slash menu, plan mode, Changes panel and git toolbar in a disposable repo, terminal and embedded browser; sending a message only with `stubAi:*`/test mode or a mock CLI | temporary repo in /tmp; no push; no real AI |
| S5 — Docs, Design/Canvas, and Issues | I-090 to I-130 | P1 | Docs: create/edit/delete locally (.md) and slash menu; Design: canvas home, new canvas in a temporary repo, tool shortcuts, style panel, variables; Issues: board, filters, shortcuts; actions that create Convex data go in S7 | temporary repo; real account read-only |
| S6 — Agents and software factory | I-140 to I-149 | P2 | Landing, template gallery, trigger form, agent settings without enabling; the mod's Agent Runs panel (empty/error/retry state) | FLAG `custom-agents`; do not execute runs |
| S7 — Account effects and integrations (opt-in) | I-002, I-035, I-050, I-091, I-110 to I-112, I-121 to I-128, I-142 to I-146, I-170 to I-187 | P3 | Everything that creates/changes/deletes account data, publishes, opens OAuth/Stripe, consumes AI, or sends email. Run only in a disposable test org and with written authorization | dedicated test account and org |

Cross-cutting: empty/error state asserts (section 4.3); flag coverage with `tempo:e2e-feature-flags` on and off; verification that documented shortcuts match handlers; check that no test touches `~/.tempo-auth.json`.

Cross-references: `docs/reverse-engineering.md`, `docs/dynamic-analysis.md`, `docs/modding-guide.md`, `docs/chan_*.txt`, `docs/mods.md`.
