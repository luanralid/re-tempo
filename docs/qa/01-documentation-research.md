# QA 01 — Catalog of Tempo features according to public sources

Source access date: 2026-10-16. Test target: Tempo.app v0.0.121 (local "RE-TEMPO" copy, Electron).
Important note: the public changelog already lists up to v0.0.124 (2026-10-12) and staging builds up to 0.0.125. Features
later than 0.0.121 may not exist in the tested app (see section 5).

Source legend: **[D]** docs.tempo.new, **[C]** changelog docs.tempo.new/changelog, **[CI]** Insiders changelog,
**[S:name]** local SKILL.md at `~/.agents/skills/<name>/SKILL.md`, **[RE]** the repo's `docs/reverse-engineering.md` (static analysis, not a public source),
**[T]** third parties. All public sources have an access date of 2026-10-16; the source's own date is in the column when known.
No source was invented: where there is no source, it says "not documented".

---

## 1. Product summary

**What it is.** Tempo (Tempo Labs, Toronto, YC S23, founders Kevin Michael and Peter Gokhshteyn, 8 people according to the YC page) is now
positioned as "IDE for the whole team" (title of tempo.new) and "AI software factory for product teams" (docs): it turns feedback,
issues and requirements into reviewed pull requests, with humans approving the important decisions. Historically (v1/v2, 2024-2025) it was a
visual React editor with AI (prompt-to-app, Figma plugin, SaaS templates, Expo). The current product is a desktop app (macOS/Windows) that
replaces the web editor (app.tempo.build), whose shutdown is planned in the migration guide. **[D introduction, D migrate, T YC]**

**Who it is for.** PMs, designers and engineers working in the same codebase. **[D, T YC, S:onboarding]**

**Value proposition.** One workspace where "Issue → PRD → Design → Code → PR" happens without handoffs between Notion/Figma/git; every change
becomes real code in the repository. **[S:onboarding]**

**Concepts (testable glossary).**

| Concept | Documented definition |
|---|---|
| Organization | Top-level container: teams, projects and all cloud data (docs, issues, canvases, chat history). Types: Private (one per account, automatic, cannot be deleted) and Team (several, only an admin deletes). Roles: Admin and Member. [D organizations-and-workspaces] |
| Project | A repository registered in an organization. In a team org it requires a remote URL (GitHub/GitLab) and is unique; in a private org it accepts a local folder with no remote. [D] |
| Workspace | The project folder on the machine: one persistent local root plus zero or more worktrees. Each workspace stores canvas, chat history, dev server config and view modes. [D] |
| Worktree | Sibling, ephemeral git checkout created by each AI chat on a disposable branch; named `{git-user}/{workspace-slug}`, branch created at the agent's first edit. [D] |
| Chat | Session with an AI agent (Claude or Codex in the docs; the app also embeds OpenCode, Grok, Cursor) in an isolated worktree. [D chat, C, RE] |
| Agent | Permanent prompt tied to triggers; when fired, it opens a Tempo session on the owner's machine, with the owner's identity. Starts disabled. [D agents] |
| Agent Run | Each execution of an agent; appears as a chat inside the agent, can be followed live and redirected; since 0.0.123 it is linked to the workspace/canvas artifacts it generates. [D agents, C 0.0.123] |
| Artifact | App/changelog term for generated docs, canvases, etc. (artifact cards in chat with live issue status; "Recent artifacts" on Home). No definition of its own found in the docs. [C 0.0.123] |
| Doc | PRD/spec/note in markdown with a visual editor, stored in the organization's database. [D docs] |
| Canvas / Design | Figma-like surface; each frame is a live iframe of a real React route or component. The "Canvas" tab was renamed "Design" in 0.0.115. [D canvas, C 0.0.115] |
| Storyboard | Typed React export in `tempo/designs/canvases/**/index.canvas.tsx`; becomes a frame; cited types: component, Route, HTML. Can be "tracked" (visual review). [D canvas, D visual-review, D migrate] |
| Design system | Canvases in `tempo/designs/design-system/<family>/` that render the real components, with `defineAsset`, tokens and "Design System Debt" storyboards. [S:generate-design-system] |
| Software factory | Pipeline where tickets/feedback arrive and agents (Bug Fixer, Spec and Design, etc.) process them on top of CI/CD with guardrails; default "Software Factory" pipeline in the templates (0.0.96). [S:audit-tdd, S:launch-software-factory, C 0.0.96] |
| BYOK | Own API keys per device for AI providers (Settings → Preferences → Providers, 0.0.100) and CLI login (claude/codex/opencode). [C 0.0.100, D quick-start] |
| Tempo Inference | Models served by Tempo without CLI login; free model cited: GPT-5.4-mini (quick-start, but the changelog says GPT-6 Luna since 0.0.113). [D quick-start, C] |
| Supported AI CLIs | Docs: Claude Code, Codex. Migration: + OpenCode. Changelog: + Grok (Build), Cursor CLI (0.0.118), Kimi, GLM, DeepSeek models via OpenCode. [D, C] |

---

## 2. Feature catalog (test oracle)

Confidence: high = explicit description in docs/changelog/SKILL.md; medium = inferred from the changelog or from a single source; low = only indirect/third-party.
"Source" columns are abbreviated per the legend. When the source is docs.tempo.new, the URL is `https://docs.tempo.new/<page>`.

### 2.1 Shell, navigation, Home, Settings

| ID | Area | Feature | Expected behavior | Source (date) | Conf. |
|---|---|---|---|---|---|
| F-001 | Shell | Surface sidebar | Icons for Chat, Docs, Design (Canvas), Issues, Agents. Clicking opens the matching surface. Ctrl+1…9 goes to the Nth section. | D introduction, D keyboard-shortcuts | high |
| F-002 | Shell | Home / Getting Started | Home tab with a "Getting Started" checklist (0.0.90); it can be closed (0.0.120). In 0.0.114 the "Home page was removed" and later came back: see contradiction C-05. | C 0.0.90, 0.0.114, 0.0.120 (2026-08 to 10) | medium |
| F-003 | Shell | "Let's do it" start screen with Generate / Open folder / Import project | Generate a prototype from an idea (/generate-prototype), open a local folder or import a project. Exact cards not described in the docs; the "+ Add Project" flow accepts a clone URL or a local folder. | D migrate; S:generate-prototype (the screen itself: not documented) | medium |
| F-004 | Shell | Recent artifacts | Lists recent artifacts (docs, canvases) on Home; opening a card opens the artifact. | Not documented (inferred from C 0.0.123 "artifact cards") | low |
| F-005 | Shell | Palettes | Cmd/Ctrl+P: file palette; Cmd/Ctrl+Shift+P: command palette; Cmd/Ctrl+K: chat palette. Cmd+P also searches "any workspace artifact" (0.0.78). | D keyboard-shortcuts; C 0.0.78 | high |
| F-006 | Shell | Shared Cmd+F search | Cmd+F bar on the five surfaces; Cmd+F in chat. | C 0.0.96, 0.0.105 | high |
| F-007 | Shell | Global back/forward navigation | Global back/forward buttons; Cmd+[ / Cmd+] navigate the chat selection history. | C 0.0.90, 0.0.96; D keyboard-shortcuts | high |
| F-008 | Shell | Unified tabs and detachable windows | Views open in unified tabs; tabs can be detached into a window; equal-width tabs; Cmd+W closes the most relevant non-chat tab. | C 0.0.113, 0.0.120; D keyboard-shortcuts | high |
| F-009 | Shell | Chat sidebar | Cmd+B toggles the chat sidebar; unified side chat (0.0.94). Active/Archived filter in the sidebar. | C 0.0.87, 0.0.94, 0.0.106 | high |
| F-010 | Shell | Embedded browser | Browser tabs inside the app with element context and a token/spacing inspector (0.0.123); persistent tabs (0.0.118 staging). | C 0.0.83, 0.0.123; CI 0.0.118 | medium |
| F-011 | Shell | Integrated terminal | Terminal tab at the bottom of any workspace; accepts `claude /login`, `codex login`, `opencode login`. | D quick-start, D migrate | high |
| F-012 | Shell | System shortcuts | Cmd+, opens Settings (0.0.79); Cmd+Option+I / Ctrl+Shift+I opens DevTools; Ctrl+Cmd+F full screen (macOS). | D keyboard-shortcuts; C 0.0.79 | high |
| F-013 | Settings | Plan & Usage | Settings → Plan & Usage shows current tier, monthly grant, top-up balance; "Manage Plan" opens the billing portal (card, tier, cancel, invoices). The migration guide calls the screen "Settings → Plan". | D tempo-web-billing, D migrate | high |
| F-014 | Settings | Providers / per-device keys | Settings → Preferences → Providers: per-device AI API keys. | C 0.0.100 | high |
| F-015 | Settings | Projects (scripts) | Settings > Projects: setup script, private setup script and run scripts fields; autosave on leaving the field. | D setup-run-scripts | high |
| F-016 | Settings | Organization members | Settings → Members: invite by email; invitee receives a link and becomes active after login; admin removes members. Access request via invite link with admin approval (0.0.96). | D organizations-and-workspaces; C 0.0.96, 0.0.97 | high |
| F-017 | Settings | Organization → Stages | Stages editor (status pipeline) in Settings → Organization → Stages. | C 0.0.100 | medium |
| F-018 | Settings | App version | Settings shows the installed version (0.0.124+). The tested app is 0.0.121: it may not have this. | C 0.0.124 | medium |
| F-019 | Settings | Default model/effort preferences | Set the default model and chat effort level. | C 0.0.115 | high |
| F-020 | Shell | Light/dark mode | Light mode with persisted theme (0.0.117); `light-mode` flag exists (RE). | C 0.0.117; CI | medium |
| F-021 | Shell | Bug report / debug | Bug icon in the sidebar opens a bug report; errors visible in reports (0.0.83); bug-report-issue-fields (flag). Detailed behavior not documented. | C 0.0.83, 0.0.123; RE | low |
| F-022 | Shell | Updates | Auto-update with retry; "What's new" modal after updating (0.0.75); updates via Cloudflare R2 (0.0.96). | C 0.0.75, 0.0.87, 0.0.96 | medium |

### 2.2 Organizations, projects, workspaces, Git

| ID | Area | Feature | Expected behavior | Source | Conf. |
|---|---|---|---|---|---|
| F-030 | Org | Automatic private organization | Every account has exactly one private org; it cannot be deleted; local-only projects allowed. | D organizations-and-workspaces | high |
| F-031 | Org | Team organization | Can be created in any number; visible to others; project requires a remote URL; only an admin deletes. | D organizations-and-workspaces | high |
| F-032 | Org | Switch organization | Switching changes what is visible, does not move data. | D organizations-and-workspaces | high |
| F-033 | Project | Add project | "+ Add Project": clone URL or local folder. In a team org without a remote it must be refused. A duplicate project in a team org must be refused. | D migrate, D organizations-and-workspaces | high |
| F-034 | Workspace | Persistent per-workspace state | Canvas, chat history, dev server config and view modes preserved when switching workspace. Workspace switch ~instant (0.0.91/0.0.99). | D organizations-and-workspaces; C | high |
| F-035 | Workspace | Worktree per chat | Each AI chat creates a worktree on a disposable branch; the local root is not changed; several agents in parallel without conflict. | D chat, D organizations-and-workspaces | high |
| F-036 | Workspace | Worktree discard | "Discard" or ending the chat runs `git worktree remove` and deletes the branch; root untouched. | D organizations-and-workspaces | high |
| F-037 | Workspace | Changes panel | Worktree diff: "Uncommitted" modes (Staged/Unstaged, stage/unstage/diff/discard per file) and "vs. Target Branch" with a searchable branch selector; behind-remote indicator with a Pull button. | D multi-repo, D organizations-and-workspaces | high |
| F-038 | Workspace | Commit / Push / Create PR | Commit button in the header triggers an AI chat that creates commits; dropdown with Push and Create PR; Push becomes "Publish" if the branch does not exist on the remote. PR badges with unpushed-commit count and failing-checks indicator. | D multi-repo; C 0.0.79 and later | high |
| F-039 | Workspace | Multi-repo via submodules | Import the parent repository folder; submodules detected and shown as separate sections in Changes; commits per repository. Choosing only one child hides the others. | D multi-repo | high |
| F-040 | Workspace | Archive / restore workspace | Archived workspaces sorted by activity, restorable (including for follow-up); archive toast with Undo; auto-archiving by agents (0.0.98). | C 0.0.83, 0.0.98, 0.0.100, 0.0.121 | high |
| F-041 | Workspace | Batch workspace creation | "Create N workspaces" on multi-select of issues; one workspace per issue (0.0.78). | C 0.0.78, 0.0.96 | medium |
| F-042 | Workspace | Setup script | `setupScript` in `tempo/tempo.config.json` runs when a workspace is created, in a background terminal tab "Setup Script"; "Private Setup Script" (localStorage) runs afterwards; failure (exit≠0) produces a toast and does not block the other. | D setup-run-scripts | high |
| F-043 | Workspace | Run scripts and Play button | Play button left of Commit runs the default script (star); menu groups Repo and Private; "Add action" leads to Settings; only one default across the two tables; each script opens a focused terminal tab. | D setup-run-scripts | high |
| F-044 | Workspace | Generated "App dev server" script | If `apps[0].appStart` exists, it appears as read-only "Generated by Tempo"; `${PORT}` resolves to the canvas port. | D setup-run-scripts | high |
| F-045 | Workspace | `TEMPO_SOURCE_PATH` | Variable injected into setup/run scripts with the original directory path (to symlink `.env`). | D setup-run-scripts | high |
| F-046 | Workspace | Project environment variables panel | API keys and URLs in the project variables panel instead of `.env`. | D migrate | medium |
| F-047 | Workspace | Remote Control | Run workspaces on another machine, mirror and control locally. Behind the `remote-control` flag (RE). | C 0.0.84; RE | medium |
| F-048 | Workspace | Sharing by link | Share links for issues, docs and canvases (view.tempo.new, 0.0.78); rich previews (0.0.97); canvas links become readable previews in Slack (0.0.88); same-org links open in Tempo (0.0.120/123). | C 0.0.78, 0.0.84, 0.0.88, 0.0.97, 0.0.120 | medium |

### 2.3 Chat

| ID | Area | Feature | Expected behavior | Source | Conf. |
|---|---|---|---|---|---|
| F-050 | Chat | Open/focus chat | Chat icon or Cmd/Ctrl+L focuses the chat input. | D chat, D keyboard-shortcuts | high |
| F-051 | Chat | Model selector | Menu at the bottom of the chat: Claude (Opus/Sonnet/Haiku), Codex (GPT-5.4 Codex/mini; later GPT-6.x), Tempo Inference; the changelog also lists Grok, Cursor, OpenCode (Kimi, GLM, DeepSeek). Default since 0.0.124: Opus 5.5 for Claude. | D chat, D quick-start; C 0.0.105-0.0.124 | high |
| F-052 | Chat | Provider login | `claude /login` (Pro/Max/Team plan or key), `codex login` (ChatGPT Plus/Pro/Team or key), `opencode login`; no login when choosing the Tempo Inference model. | D quick-start, D migrate | high |
| F-053 | Chat | Effort | Effort levels, including Max effort in Claude chats (0.0.77) and maximum effort in Codex (0.0.107). | C 0.0.77, 0.0.107 | medium |
| F-054 | Chat | Plan mode | Ask for a structured plan; user reviews, edits and approves; agent only writes files after acceptance. | D chat | high |
| F-055 | Chat | Linked context | On every turn the agent sees the linked worktree, docs, canvases and issues. Linking a doc makes the agent read its content on every turn. | D chat, D docs | high |
| F-056 | Chat | @-mentions | @-mentioning a Tempo agent runs the agent with the task, without a ticket (0.0.93/0.0.100); @ for docs/issues in editors. | C 0.0.78, 0.0.93, 0.0.100 | high |
| F-057 | Chat | Conversation fork | Fork from any completed message/reply, including across providers. | C 0.0.96, 0.0.97, 0.0.100 | high |
| F-058 | Chat | Restore to an earlier point | Restore the conversation to an earlier point. | C 0.0.77 | medium |
| F-059 | Chat | Secondary tabs inside a chat | Secondary chat tabs under a root chat. | CI 0.0.107 | low |
| F-060 | Chat | Slash commands and skills | Slash command picker with fuzzy match; personal skills across all providers (`personal-skills` flag); built-in skills listed in section 4 become commands. | C 0.0.79, 0.0.113; S | high |
| F-061 | Chat | Attach context | Attach the selected canvas element (Cmd+L in the canvas), doc excerpt (0.0.123), Linear issue (0.0.96), images, PDFs. | D keyboard-shortcuts; C | high |
| F-062 | Chat | Inline artifact cards | Rich cards for docs/canvases/issues/agents in chat, with live issue status. | C 0.0.87, 0.0.123 | medium |
| F-063 | Chat | Queue and resume | Queued messages; interrupted turns resumable; "Awaiting Response" on an asynchronous Codex question; OAuth re-authentication banner. | C 0.0.99, 0.0.120 | medium |
| F-064 | Chat | Rename chat/branch | Renaming a chat can rename the branch; clicking the branch name copies it. | C 0.0.83, 0.0.84 | medium |
| F-065 | Chat | Commit target | Commit action preserves the model selected in the chat. | C 0.0.83 | low |

### 2.4 Docs

| ID | Area | Feature | Expected behavior | Source | Conf. |
|---|---|---|---|---|---|
| F-070 | Docs | Create/edit doc | Docs icon opens the list; docs are markdown with a visual editor (headings, lists, code, callouts, images, internal links). | D docs | high |
| F-071 | Docs | Types | PRDs, specs/RFCs, project notes. | D docs | high |
| F-072 | Docs | Links | Doc ↔ chat, doc ↔ issue (PRD shows inline on the card), doc ↔ canvas. | D docs | high |
| F-073 | Docs | Visibility scope | Stored in the organization's database, tied to the workspace of creation; org members see the same docs; private workspaces stay private. | D docs | high |
| F-074 | Docs | /prd-writer | Skill that guides the structure (goals, non-goals, user stories, success criteria) and writes to the Docs tab; opens 3 parallel Explore agents and asks for Quick/Thorough mode. | D docs, S:prd-writer | high |
| F-075 | Docs | Collaboration | @mention in docs/issues, Notion-style sharing, persisted images. | C 0.0.78, 0.0.84, 0.0.99 | medium |
| F-076 | Docs | Attach excerpt to chat | Select text in the doc and attach it to the AI chat. | C 0.0.123 | medium |

### 2.5 Design (Canvas), storyboards, design system

| ID | Area | Feature | Expected behavior | Source | Conf. |
|---|---|---|---|---|---|
| F-080 | Design | Infinite canvas with live frames | Infinite plane with zoom; each frame is an iframe of a real route/component served by the project's dev server (Vite/Next); code changes reload the canvas. | D canvas | high |
| F-081 | Design | New storyboard | Right-click on an empty area → "New Storyboard"; or ask the AI. Creates an export in `tempo/designs/canvases/**/index.canvas.tsx`. | D canvas, D migrate | high |
| F-082 | Design | Visual editing writing to code | Style panel on the right (typography, color, spacing, layout); each change writes to the source file; selecting an element jumps to its definition in the editor. | D canvas | high |
| F-083 | Design | Component drag-and-drop | Drag components from the project library into frames; insertable asset variants (0.0.113); create a reusable component from an element (0.0.100). | D canvas; C | high |
| F-084 | Design | Tools and shortcuts | V select, F frame ("Div" since 0.0.78), R rectangle, T text, Shift+R line, Shift+C column, Shift+G grid, Esc exits; Cmd+A/Shift+A, Cmd+C/X/V/D, Delete, Cmd+Z/Shift+Z. | D keyboard-shortcuts | high |
| F-085 | Design | Zoom and view | Shift+1 fit all; Shift+2 fit selection; Cmd+= / Cmd+- / Cmd+0 (100%); Cmd+\ toggles the right panel (Layers/Style); pixel grid at 400% (0.0.109). | D keyboard-shortcuts; C 0.0.109 | high |
| F-086 | Design | Auto-layout | Shift+A converts/aligns while keeping grid/wrap; gap/spacing inference. | C 0.0.82, 0.0.83, 0.0.88 | high |
| F-087 | Design | Storyboard types | Component, Route (maps whole pages), HTML (paste HTML/URLs; drag several HTMLs; Web Clipper turns any page into an HTML storyboard); AI React snapshots; Svelte and Expo/React Native. | D migrate; C 0.0.75, 0.0.83, 0.0.86, 0.0.99, 0.0.100, 0.0.107 | high |
| F-088 | Design | Paste from Figma | Paste Figma designs as editable HTML storyboards. | C 0.0.80 | high |
| F-089 | Design | Canvas AI mode | Explicit AI mode for edits on non-editable elements; AI drafts preserved. | C 0.0.89, 0.0.108, 0.0.109 | medium |
| F-090 | Design | Canvas comments | Pins, threads, @-mentions, resolve/reopen, image attachments. | C 0.0.77, 0.0.83 | high |
| F-091 | Design | Tokens, variables and fonts | Figma-style token libraries (0.0.117), Variables in production (0.0.111), Google font picker (0.0.107), SVG gradients, editable corner radius, spacing snapping, per-canvas background color. | C | high |
| F-092 | Design | Layers | Persistent layer locking; Layers/Style in the right panel; Option-drag; marquee selection. | C 0.0.81, 0.0.94, 0.0.108 | medium |
| F-093 | Design | Send element to chat | Cmd+L adds the selected element as context; Cmd+Shift+C copies a high-quality capture; current canvas selection automatically attached to chat (0.0.91). | D keyboard-shortcuts; C 0.0.91 | high |
| F-094 | Design | Tracked storyboards + Visual Review | `vrt` (or "Track visual regression" in the menu) on component storyboards; each PR compares pixels against the default branch; the `visual-review` check stays red until a human approves in the portal; `threshold` 0..0.5, `ignore`, `skip`. | D visual-review | high |
| F-095 | Design | Share canvas | Share links via MCP `canvas_share` (requires a committed and pushed branch); per-commit previews with live per-branch links (0.0.104). | D install-mcp; C 0.0.101, 0.0.104 | high |
| F-096 | Design | Canvases home page | Page with all canvases ("all canvases" modal when clicking the folder); cloud canvases with GitHub (0.0.121). | C 0.0.85, 0.0.121 | medium |
| F-097 | Design | Chat beside the canvas | Canvas opens side by side with chat; chat sits on the right inside the Design tab. | D migrate; C 0.0.121 | high |
| F-098 | Design | Generate design (/generate-design) | One idea → "Design brief: <topic>" doc + a single canvas with several JSX variants; no questions; screenshot to verify. Probable origin of the "Design brief: …" artifact seen on Home. | S:generate-design | high |
| F-099 | Design | /design | End-to-end feature design as a set of clickable UI-only storyboards, with real components; asks ambiguous UX decisions via AskUserQuestion; covers states (empty, loading, error). | S:design | high |
| F-100 | Design | /generate-design-system | Scans the codebase, creates one canvas per family in `design-system/<Family>` with `defineAsset`, component controls and Design System Debt storyboards. `canvas_validate` fails without a declaration. | S:generate-design-system | high |
| F-101 | Design | /audit-design-system-violations | Scans for off-palette colors, off-scale values, reimplemented components, deprecated usage, declaration hygiene; findings are only documented, never fixed. If there is no design system, recommends /generate-design-system. | S:audit-design-system-violations | high |
| F-102 | Design | /design-review | Two independent tracks: mechanical adherence to the design system and blind visual judgment against the canvases; report in chat; never blocks or fixes. | S:design-review | high |
| F-103 | Design | /harden | Proposes hardening component APIs (remove dead surface, narrow types); only for mature design systems; each change is approved and applied with callers migrated and typecheck green. | S:harden | high |
| F-104 | Design | /generate-product-flows | Explores the running app and captures 3 journeys as full-screen storyboards (10 to 15 states each) + a "Reused & recreated" storyboard. | S:generate-product-flows | high |
| F-105 | Design | /html-to-jsx | Converts an attached route storyboard into an editable React storyboard (HTML/SVG JSX + scoped CSS), faithful to the viewport. | S:html-to-jsx | high |
| F-106 | Design | /canvas-code-quality | Audits the diff classifying each hunk (design scope / light interaction / business logic / out of place) and drafts a handoff note; it is an audit, not a fix. | S:canvas-code-quality | high |
| F-107 | Design | /designer-pr-polish | Prepares a friendly PR: cleans code, separates mocks, asks before removing business logic, generates the PR description. | S:designer-pr-polish | high |
| F-108 | Design | /document-design-preferences | Mines the conversation for corrections/redos, asks for approval and writes to `tempo/CLAUDE.md` and `tempo/AGENTS.md`; never writes silently. | S:document-design-preferences | high |

### 2.6 Issues

| ID | Area | Feature | Expected behavior | Source | Conf. |
|---|---|---|---|---|---|
| F-110 | Issues | Kanban | Default columns Backlog, In Progress, In Review, Done (customizable per board / Stages); cards in the org database. | D issues | high |
| F-111 | Issues | Card | Title, description (TL;DR), status, assignee (person, you or agent; multiple since 0.0.78), links (branch, PR, canvases, docs, chats), labels; PR state (open, merged, CI failing). | D issues; C 0.0.78 | high |
| F-112 | Issues | Assign to agent | On assignment, the agent creates a worktree, reads linked docs/canvases, makes changes, opens a PR and moves to In Review. Reassigning continues the existing workspace (0.0.87). | D issues; C 0.0.87 | high |
| F-113 | Issues | Saved views | Filter/group by assignee, label, status or artifact; save views per board. | D issues | high |
| F-114 | Issues | Split mode | Split mode for triaging agent PRs; unified, searchable assignment picker. | C 0.0.87, 0.0.96 | medium |
| F-115 | Issues | Deletion, labels, local images | Delete a ticket with confirmation (0.0.77); Labels submenu; upload of local images in issues (0.0.124). | C | medium |
| F-116 | Issues | Linear integration | Org-level integration: issue mirror, Integrations tab, "Add Linear issue" as chat context. | C 0.0.96 | high |
| F-117 | Issues | /launch-software-factory | Looks for where tickets/feedback live; picks 3 "low-hanging" issues, creates them in Tempo, suggests assigning Bug Fixer and Spec and Design; verifies runs with `agents_list_runs` and `ownerMachineOnline: true`; ends with a `TEMPO_STEP_COMPLETE:` line. | S:launch-software-factory | high |
| F-118 | Issues | /spec-design-feature | Takes an issue from the backlog (`issues_summarize_board`), generates a PRD in Docs and a clickable canvas with real components, both linked to the issue; two beats: choose and approve. | S:spec-design-feature | high |

### 2.7 Agents and Agent Runs

| ID | Area | Feature | Expected behavior | Source | Conf. |
|---|---|---|---|---|---|
| F-120 | Agents | Agent grid/list | Agents tab (redesigned in 0.0.99: list in the sidebar, configuration in the center); empty state with briefing (0.0.113). | D agents; C 0.0.99, 0.0.113 | high |
| F-121 | Agents | Starts disabled | An agent only fires after being manually enabled. Nothing runs with Tempo closed; missed schedules are recovered on reopening (0.0.120). | D agents; C 0.0.120 | high |
| F-122 | Agents | Composition | Name, icon, color, project, model and effort, prompt (runbook), Assignable, triggers (any combination). | D agents | high |
| F-123 | Agents | Assignable trigger | Fires when an issue is assigned to the agent. | D agents | high |
| F-124 | Agents | Issue events trigger | Created, moved, labeled or commented, with filters. | D agents | high |
| F-125 | Agents | Schedule trigger | Cron in the user's time zone. | D agents | high |
| F-126 | Agents | Slack trigger | Messages/mentions in chosen channels; requires connecting the org's Slack workspace; thread replies return to the same session. | D agents | high |
| F-127 | Agents | GitHub trigger | Events such as merged PR; requires a webhook on the repository; Tempo shows the payload URL and secret. | D agents | high |
| F-128 | Agents | Published release trigger | Trigger on a published release. | C 0.0.99 | medium |
| F-129 | Agents | Templates | Gallery/Templates button: bug fix, feedback triage, PR review, release management; fills name, prompt, effort, schedule; Slack/GitHub templates come without a trigger with a warning; nothing is created/enabled automatically. Default "Software Factory" pipeline with diagram. | D agents; C 0.0.93, 0.0.96 | high |
| F-130 | Agent Runs | Runs as chats | Each run is a chat inside the agent; follow live, scroll history, intervene mid-run. Archived runs are read-only and reopenable; run queue in the Activity column (0.0.92). | D agents; C 0.0.92, 0.0.100 | high |
| F-131 | Agent Runs | Link to artifacts | Runs linked to the workspace/canvas artifacts they generate (0.0.123). Probable basis of the user's mod "Agent Runs" panel. | C 0.0.123 | medium |
| F-132 | Agents | Org custom agents | Private/Public visibility, read-only permission or "anyone can edit"; templates with MCP tools; `custom-agents` flag. | C 0.0.84, 0.0.87; RE | high |
| F-133 | Agents | Work attribution | AI writes appear as "<user>'s Claude Agent" in comments and issue activity. | C 0.0.120 | high |
| F-134 | Agents | Security | Agent acts with the owner's identity and machine; no separate bot. | D agents | high |
| F-135 | Agents | Active Slack | Agents post to Slack (0.0.81); Slack reads DOCX and Google Docs attachments (0.0.123). | C | medium |

### 2.8 MCP, integrations, plans

| ID | Area | Feature | Expected behavior | Source | Conf. |
|---|---|---|---|---|---|
| F-140 | MCP | `@tempo-ai/mcp` (npm) | `claude mcp add tempo -- npx -y @tempo-ai/mcp`; Node 20+; automatic login on first use or `login`/`whoami`/`logout`; tokens `token create/list/revoke`; `TEMPO_AUTH_TOKEN`. | D install-mcp | high |
| F-141 | MCP | Hosted server | `https://mcp.tempo.new/mcp` (issues, docs, comments, agents, scripts, Slack, Linear; no canvas); `?readonly=1`, `?toolsets=`. | D install-mcp; C 0.0.105 | high |
| F-142 | MCP | `tempo-mcp` CLI | `tools`, `tools --schemas`, `call <tool> --json`. Toolsets: issues, docs, comments, agents, scripts, slack, linear, canvas. | D install-mcp | high |
| F-143 | MCP | MCP embedded in the app | Inside the app the tools are native; a copy installed by the user is ignored. | D install-mcp | high |
| F-144 | Integr. | GitHub | GitHub/GitLab projects; PR/commit via chat; webhook for agents; "Tempo Labs AI" GitHub App for Visual Review; cloud canvases with GitHub. | D; C | high |
| F-145 | Integr. | Linear | See F-116. | C 0.0.96 | high |
| F-146 | Integr. | Slack | Connect the org's Slack workspace; agent triggers and posts; canvas links with preview. | D agents; C | high |
| F-147 | Integr. | ChatGPT | ChatGPT sidebar in Tempo (0.0.121) and ChatGPT plugin update packages (0.0.122 staging). | C 0.0.121; CI | low |
| F-148 | Integr. | Figma | Paste from Figma (0.0.80). The v2 Figma plugin belongs to the old product. | C; T YC | medium |
| F-149 | Plans | Free / paid / top-up | See section 3. | | |

---

## 3. Plans, limits, pricing and integrations (as documented)

**Current billing model (desktop).** The app "measures usage in dollars, not prompts": the subscription's monthly price becomes the dollar
inference balance; old prompt packs that are imported add to the balance; Tempo says it charges API price at break-even. Settings → Plan & Usage
shows tier, monthly grant and top-up; "Manage Plan" opens the portal. Web subscription and balance appear automatically when logging in with the
same email; the two apps coexist without double billing. [D tempo-web-billing, 2026-10]

**Consumption warnings.** On plans under US$ 100, the doc recommends Sonnet or GPT-5.4 with low effort, because Opus or GPT-5.5 with high effort
consume credit very quickly. [D migrate, D tempo-web-billing]

**Free plan.** It exists and uses Tempo inference: 0.0.79 (2026-07-02) cited limits of 20 requests/day and 60/month; 0.0.88 (2026-07-31)
changed to a spending limit instead of a prompt count (GPT-5.6 Luna model); 0.0.113 (2026-09-23) moves to GPT-6 Luna; the quick-start still cites GPT-5.4-mini. [C, D quick-start]

**Prices per tier (conflicting, see C-01).**

| Source | Tiers |
|---|---|
| Static analysis of app 0.0.121 [RE] (embedded Stripe; not a public source) | Pro US$ 30, Scale US$ 50, Ultimate US$ 100, Power US$ 350 per month; plan only changes the monthly inference quota |
| Changelog 0.0.100 (2026-08-28) | "Team plan at US$ 200" (staging CI item, no details) |
| Changelog 0.0.79 | legacy US$ 50 top-up with 250 prompts |
| nocode.mba (updated 2026-03-06, old web product) | Free US$ 0 (30 credits/month, max 5/day); Pro US$ 30 (150 credits); Agent+ US$ 4,500 (human engineers); 1 credit per message, error fixes free |
| tempo.new pricing page | Not obtained: the site is an SPA and the fetch returns only the title. "Not documented" in this research. |

**Features per plan.** Codex Ultrafast only on a paid plan (0.0.120). Fast mode (OpenAI priority tier) and GPT-5.3 Codex Spark only on BYOK (0.0.83). Per-model credit controls, per-model promo codes, and "Tempo Inference does not appear active without a plan or usable credits" (0.0.81). [C]

**Documented integrations.** GitHub (projects, PRs, webhook, GitHub App for Visual Review); GitLab (remote URL accepted); Linear (org); Slack (triggers, posts, attachments); ChatGPT (sidebar/plugin); Figma (paste); Convex/Clerk/Supabase/Stripe/Polar only as starter templates of the old product [T YC; TempoLabsAI/* repos]; external MCP (design context capturable in the workspace, 0.0.123). Vercel and Notion: not documented as integrations (Notion only as a UI analogy for share).

---

## 4. End-to-end flows (test scenarios)

**E2E-01 First use (install and AI login).** Source: D quick-start. 1) Open the app, log in (Clerk in the browser, return via `tempo://`). 2) Grant Full Disk Access and Accessibility if asked. 3) In a workspace's Terminal tab, run `claude /login` or `codex login`; or choose the Tempo Inference model without login. 4) Expected: the model selector shows the provider; a simple prompt gets a reply.

**E2E-02 Add project.** Source: D migrate, D organizations-and-workspaces. 1) "+ Add Project" (Home shows "No workspaces yet"). 2) Choose a clone URL or local folder. 3) Expected: workspace created with a local root; team org without a remote is refused; setup script runs in a "Setup Script" tab; Terminal and Chat available.

**E2E-03 Chat in a worktree with a plan.** Source: D chat. 1) Open Chat (Cmd+L). 2) Choose a model and ask for a plan (Plan mode). 3) Approve the plan. 4) Expected: branch `{user}/{slug}` created at the first edit; changes appear in Changes; the root does not change. 5) Commit, Push and Create PR from the header. 6) Discard removes the worktree and branch.

**E2E-04 Issue → PRD → Design → Code → PR (onboarding).** Source: S:onboarding. List of 6 items: create Issue (`issues_create_issue`), write PRD (prd-writer), design in the canvas, ensure dev server, implement against PRD + design, commit/push/PR. Rules: checkpoint after each step (show the artifact, teach one thing, ask "Ready to move on?"); "just go" turns the checkpoints off; `{{entry_path}}` imported_repo vs demo differs only in the PR step.

**E2E-05 Generate prototype.** Source: S:generate-prototype. "Generate" card with an idea → Vite+React+Tailwind+TS scaffold at the root with `tempo-sdk`/`tempoVitePlugin()`, PRD in Docs (prd-writer quick), implementation, dev server, canvas opened in split. Expected: TodoWrite with 5 items, no questions. Nothing under `tempo/` written by hand.

**E2E-06 Generate design.** Source: S:generate-design. One-line idea → "Design brief: <topic>" doc via `docs_create` + canvas with multiple variants → screenshot. Expected: the artifact appears in "Recent artifacts".

**E2E-07 Doc ↔ Issue ↔ Canvas.** Source: D docs, D issues, D canvas. Create doc, create issue, link PRD, link canvas; expected: the issue card shows the PRD inline and the design preview; a chat with a linked doc reads the doc on every turn.

**E2E-08 Visual editing in the canvas.** Source: D canvas. Open canvas, New Storyboard, select element, change color/spacing in the style panel; expected: source file changed on disk; undo (Cmd+Z) reverts; automatic iframe reload.

**E2E-09 Agent on an issue.** Source: D issues, D agents. Create agent (from template), enable, assign issue; expected: worktree, PR opened, card moves to In Review, run visible as the agent's chat. A disabled agent does not fire.

**E2E-10 Agent with Schedule and GitHub trigger.** Source: D agents. Valid cron fires on time; GitHub shows the payload URL and secret on creation.

**E2E-11 Visual Review.** Source: D visual-review. Mark `vrt` on a component storyboard, workflow `.github/workflows/visual-review.yml`, PR → pending check → fails with "N of M need approval" → approve in the portal → green.

**E2E-12 Software factory.** Source: S:launch-software-factory, S:audit-tdd. /audit-tdd generates a doc with a color-coded per-repo table; /launch-software-factory creates 3 issues, assigns the user's own Bug Fixer/Spec and Design, verifies runs with `ownerMachineOnline: true`.

**E2E-13 Design system.** Source: S:generate-design-system, S:audit-design-system-violations, S:design-review, S:harden. Sequence: generate, audit, review, harden (only if mature). Each step has a documented stop condition (no design system → recommends generating; immature → harden stops).

**E2E-14 External MCP.** Source: D install-mcp. `npx -y @tempo-ai/mcp whoami`, `tempo-mcp tools`, `call tempo_list_orgs`; expected: requires login or `TEMPO_AUTH_TOKEN`; `--readonly` mode does not register write tools.

---

## 5. Gaps, contradictions, web vs desktop

**Contradictions between sources**
- C-01 Pricing: nocode.mba (Free/Pro/Agent+, web product, March 2026) vs. Pro/Scale/Ultimate/Power tiers seen in the app (RE) vs. "Team plan US$ 200" (changelog). The official docs do not publish a price table.
- C-02 Free model: quick-start cites GPT-5.4-mini; changelog cites GLM 5.2 (≈0.0.80), GPT-5.6 Luna (0.0.88) and GPT-6 Luna (0.0.113).
- C-03 Providers: Chat docs only cite Claude and Codex; migration cites OpenCode; changelog cites Grok, Cursor CLI, Kimi, DeepSeek.
- C-04 Names: "Canvas" (product docs) vs. "Design" (0.0.115); "Frame" became "Div" in 0.0.78 but the shortcuts document F = frame; "Settings → Plan" (migrate) vs "Plan & Usage" (billing).
- C-05 Home: removed in 0.0.114, but there is a Home with a checklist and Recent artifacts in 0.0.121 (screenshot) and 0.0.120 says Home can be closed; staging 0.0.125 touches Getting Started.
- C-06 Cmd+L shortcut: focuses the chat input and, in the canvas, adds the element to chat (contextual, not a conflict).
- C-07 Skills: the changelog talks about personal skills and commands; RE says the 17 skills are generated at runtime and that 16 commands were installed in `~/.claude/commands`; the local SKILL.md files are copies that Tempo installed, not public docs.

**Gaps (not documented)**
- Pricing page/numeric plan limits; details of the start screen ("Let's do it", Generate/Open folder/Import project); formal definition of "artifact"; behavior of the "Agent Runs" button (it is a user mod, outside the product); full Settings (only parts cited); bug report; Insights (mention in 0.0.90); Remote Control step by step; privacy/terms (pages exist at docs.tempo.new/legal/*, not read); blog, Product Hunt, X, LinkedIn and YouTube returned no useful content (tempo.new is an SPA; search found no posts).
- Full changelog: only versions 0.0.75 to 0.0.124 read (earlier entries not); the Insiders changelog was read up to 0.0.90-staging.

**Web vs desktop.** The web editor (app.tempo.build) is the old product (prompt-to-app React/Next, credits, Figma plugin, templates) and will be shut down; the desktop app is the current product. Desktop-only features: worktrees, terminal, AI CLIs, agents on the local machine, Remote Control, embedded MCP. Web version: share links (view.tempo.new), billing lookup page, hosted MCP. Windows has its own installer and requirements (Git, network).

**App version vs docs.** The docs reflect up to 0.0.124; the tested app is 0.0.121, so F-018 (version in Settings), local image upload in issues (F-115), Opus 5.5 as default and Haiku 5.5 may be absent. Staging-only items (0.0.125) must not be required.

---

## 6. Sources (accessed 2026-10-16)

1. https://docs.tempo.new/introduction (and /llms.txt, index)
2. https://docs.tempo.new/guides/quick-start
3. https://docs.tempo.new/product/docs
4. https://docs.tempo.new/product/canvas
5. https://docs.tempo.new/product/issues
6. https://docs.tempo.new/product/chat
7. https://docs.tempo.new/product/agents
8. https://docs.tempo.new/guides/organizations-and-workspaces
9. https://docs.tempo.new/guides/keyboard-shortcuts
10. https://docs.tempo.new/guides/multi-repo
11. https://docs.tempo.new/guides/setup-run-scripts
12. https://docs.tempo.new/guides/install-mcp
13. https://docs.tempo.new/guides/visual-review
14. https://docs.tempo.new/guides/migrate
15. https://docs.tempo.new/guides/tempo-web-billing
16. https://docs.tempo.new/changelog (read up to ~0.0.75; source of dates 2026-06 to 2026-10)
17. https://docs.tempo.new/changelog/insiders (read up to 0.0.90-staging)
18. https://www.ycombinator.com/companies/tempo-2 and https://www.ycombinator.com/launches/N19-tempo-v2-build-react-apps-10x-faster-with-ai (v2 product, 2024/25)
19. https://www.nocode.mba/articles/tempo-pricing (third party, 2026-03-06)
20. https://github.com/TempoLabsAI (public repositories: Vite/Next/Expo starters, `tempo-tutorial`, `tempo-tutorial-canvas`, `starter-vite-canvases`, `tempo-custom-app-template`; private monorepo)
21. https://www.tempo.new and https://www.tempo.new/pricing and /blog (fetch returns only the title "Tempo - The IDE for the whole team"; SPA)
22. Local SKILL.md files (read-only) in `~/.agents/skills/`: prd-writer, audit-design-system-violations, audit-tdd, canvas-code-quality, design, design-review, designer-pr-polish, document-design-preferences, generate-design, generate-design-system, generate-product-flows, generate-prototype, harden, html-to-jsx, launch-software-factory, onboarding, spec-design-feature (copies in `~/RE-TEMPO/_home/.agents|.grok/skills/`)
23. `<repo>/docs/reverse-engineering.md` (static analysis of the repo; tagged [RE], not a public source)
24. Search results with no useful content about Tempo: warp.dev (article about Warp Factories, 2026-09-02, does not mention Tempo), tempo.io and Grafana Tempo (homonymous products, ignore).
