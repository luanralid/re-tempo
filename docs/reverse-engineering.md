# RE-TEMPO — reverse engineering of Tempo.app 0.0.121 (consolidated report)

Date: 2026-10-14. Target: `/Applications/Tempo.app` (`com.tempolabs.tempo`, arm64, 2 GB).
Method: 100% static and read-only. The app was not run, nothing in `/Applications` or
`~/Library` was changed, and no request was made to the product's endpoints. The only
execution was of analysis tools (REA, prettier, `cursor-cli/node --version`) on copies,
outside the bundle.

This document summarizes six reports. The full ones are in:
- `tempo-re/REPORT.md` — core: IPC, security, network, AI, auto-update, local data, REA.
- `tempo-re-extra/tempo-renderer/REPORT-RENDERER.md` — front end: stack, routes, flags, product.
- `tempo-re-extra/tempo-sbom/REPORT-SBOM.md` — dependencies, CVEs, licenses (+ `sbom.json`).
- `tempo-re-extra/tempo-system/REPORT-SYSTEM.md` — footprint on macOS.
- `tempo-re-extra/tempo-osint/REPORT-OSINT.md` — public context on Tempo Labs.
- `tempo-re-extra/tempo-dynamic/RUNBOOK-DYNAMIC.md` — dynamic analysis runbook (not executed).
- `electron-re-research.md` — how Electron RE is done today, state of the art and REA.

---

## 1. What Tempo is

A desktop IDE built on Electron by Tempo Labs (Toronto, YC S23; founders Peter Gokhshteyn and Kevin
Michael). It brings five surfaces together in the same workspace and codebase: Docs/PRD, a storyboard
Canvas (live previews of real routes and components, with visual editing that flows back into code),
Issues on a Kanban board tied to branches/PRs, Chat with coding agents in isolated git worktrees, and
background Agents triggered by Slack, GitHub, a schedule or issues (the "software factory"). The flow
is Docs → Issues → Design → Code → PR.

The technical differentiator, and the cause of the 2 GB: the app **embeds five complete AI agent CLIs**
(Claude Code, Codex, OpenCode, Grok and Cursor Agent) as self-contained native binaries and
orchestrates them locally. Backend on Convex, login through Clerk in the browser, telemetry in PostHog
and Sentry.

---

## 2. Spec sheet

| Item | Value |
|---|---|
| Bundle | `com.tempolabs.tempo` 0.0.121, developer-tools category, minimum macOS 12.0 |
| Runtime | Electron 42.3.0 / Chromium 148.0.7778.180 / Node 24.15.0 / V8 14.8.178.22 |
| Signature | Developer ID Application: Peter Gokhshteyn (TR9Q48MK7N), hardened runtime, notarized and stapled |
| Entitlements | allow-jit, allow-unsigned-executable-memory, disable-library-validation, allow-dyld-environment-variables, network.client, files.user-selected.read-write. No App Sandbox, no get-task-allow |
| Size | 2 GB: `app.asar` 192 MB + `app.asar.unpacked` 1.5 GB |
| Build | electron-vite with V8 bytecode (`EVBC0001`) and Rolldown; pnpm 10.28 |
| Renderer | 33 MB of JS in 160 files (largest: `index-D2Ui1vc0.js`, 12.8 MB) + 17.6 MB of WASM |
| Main | 13 MB of V8 bytecode in 12 `.cjsc` files |
| URL scheme | `tempo://` |
| Backend/services | Convex (`greedy-jackal-526`), Clerk (`auth.tempo.build`), PostHog, Sentry |

The 1.5 GB of `app.asar.unpacked` is almost entirely the AI CLIs: Cursor (594 MB), Codex (324 MB),
Claude Code (213 MB, Bun compile), Grok (187 MB), OpenCode (141 MB). There are ~69 MB of useless x64,
Linux and Windows binaries in a thin arm64 Electron.

---

## 3. Architecture

```
 Browser ── tempo.new/auth-handoff ──> auth.tempo.build (Clerk)
      │ POST 127.0.0.1:<port>/tempo/auth {token,userId,sessionId,email}  or  tempo://auth/callback
      ▼
 MAIN PROCESS (V8 bytecode)
   writes ~/.tempo-auth.json · local express server · 13 tempo-* MCP servers on 127.0.0.1
   "Tempo Inference" proxy → Bedrock/Azure OpenAI · Convex WS · PostHog · Sentry · electron-updater
   subprocesses: claude, codex, opencode, grok, cursor-agent, tsserver/tailwind LSP, node-pty, git
   remote-control: wss://relay.tempo.new tunnel
      │ IPC: 403 channels in 60 namespaces
 PRELOAD (bytecode, Node enabled, sandbox off)
   contextBridge: window.electronAPI + 17 bridges
      │
 RENDERER (file://) React 19.3 + Monaco + Tiptap + mermaid + pdfjs + custom canvas
   + 4 isolated webviews (browser, canvas-interact, canvas-html, frame-pool)
```

---

## 4. IPC surface and front end

- **403 IPC channels** in 60 namespaces in the main preload, plus 17 `contextBridge` bridges. The
  largest namespaces: workspaces (115, includes git push, file writes and deletes), ai-chat
  (47), frame-pool (21), terminal, auth, fs. Sensitive channels include `terminal:create` (shell via
  node-pty), `workspaces:pushChanges`, `shell:openExternal` and `provider-api-keys:*`.
- **Renderer stack:** React 19.3 with React Compiler, react-router in a MemoryRouter (only 2 routes;
  real navigation lives in ~31 Zustand stores), Convex + Yjs, Clerk, Tailwind v4 with Radix/shadcn,
  Monaco, Tiptap v3, xterm wired to node-pty, Mermaid 10.9.5, pdf.js, and a custom canvas and
  visual-editing engine with Babel, css-tree, PostCSS, lightningcss and oxc in WASM.
- **Product:** ~54 views, 13 tab types, 56 shortcuts, 81 slash commands that mirror the CLIs, 7
  remote feature flags in PostHog (`custom-agents`, `remote-control`, `light-mode`,
  `canvas-ai-mode`, `bug-report-issue-fields`, `org-pr-insights`, `personal-skills`) and 12 local
  toggles. There are no source maps; the bundle was formatted with prettier for reading.
- **Plans (embedded Stripe):** Pro US$30, Scale US$50, Ultimate US$100, Power US$350/month. The plan
  only changes the monthly inference quota; it does not unlock client-side features.

---

## 5. Security — findings

In order of relevance.

1. **Session token in plain text.** `~/.tempo-auth.json`, permission 0644, with `token` (JWT),
   `sessionId` (renews the session through `/auth/refresh`), `userId`, name and email. Confirmed by me:
   the file exists and has these keys. The main code does not use `safeStorage`. Any process
   of your own user can read and reuse the session. **This is the first point to address.**

2. **Electron fuses in the insecure default.** `RunAsNode`, `EnableNodeOptionsEnvironmentVariable` and
   `EnableNodeCliInspectArguments` are on; `EnableEmbeddedAsarIntegrityValidation` and
   `OnlyLoadAppFromAsar` are off. Combined with `disable-library-validation` and
   `allow-dyld-environment-variables`, a local process can use Tempo's signed binary as
   Node and inherit the app's TCC permissions (camera, microphone, screen capture). This is the known
   class of Electron abuse with default fuses.

3. **Unsandboxed renderer and permissive CSP.** The preloads require `fs`, `vm` and `v8`, so they run with
   `sandbox: false`. The renderer CSP allows `'unsafe-eval'` and `connect-src *`. An XSS in the renderer
   would reach all 403 channels, including terminal and git.

4. **`TrustPromptDismisser`.** In CLI mode, a renderer component reads the terminal and answers the
   CLIs' trust prompts on its own: "trust this folder", "trust these settings" and Claude Code's
   **bypass permissions mode** warning, plus Codex's "trust and continue". Limit of 3
   answers per session. It is deliberate automation of third-party tools' security prompts.

5. **Remote control.** A `wss://relay.tempo.new` tunnel with a token from `remoteRelay:mintRelayToken`, plus
   `remote-control:{attachWorkspace,declareChatSessions}`. Custom Agents run on the owner's machine
   and can be triggered by GitHub and Slack webhooks: locally executed, remotely triggered, by
   design. Protected by a flag and by a switch in `remote-control/settings.json`.

6. **Login CSRF (hypothesis, to be validated at runtime).** The callback accepts `token`/`userId` via
   `POST 127.0.0.1:<port>/tempo/auth` with no `state`/`nonce` visible in the strings. If confirmed, a
   page could log the desktop into a third party's account. It can only be proven by running it.

7. **Others.** ATS disabled (`NSAllowsArbitraryLoads=true`); test hooks in production
   (`stubAi:*`, `workspaces:test*`); embedded keys are public only (PostHog, Sentry DSN, Stripe price IDs,
   Bedrock ARNs). The app reads credentials from other tools (Claude Code Keychain,
   `~/.codex/auth.json`) and writes `opencode/auth.json`.

**Positives:** hardened runtime and notarization; isolated partitions per surface; minimal preload
in the embedded browser; navigation and permission hooks; `codesign --deep --strict` validation
before installing updates; JWT and key redaction in bug reports.

---

## 6. Supply chain (SBOM)

- **Runtime:** Electron 42.3.0 is two patch lines behind (OSV lists fixes in 42.9.2) and reaches
  end of support around 20 Oct 2026 according to third-party sources, i.e. in a few days.
- **Dependencies:** 254 name@version pairs in `node_modules`, 51 direct. CycloneDX 1.5 SBOM with 255
  components in `sbom.json`.
- **CVEs (OSV, 98 advisories):** 2 critical (`proxy-addr` 2.0.7 and `simple-git` 3.32.3, the latter with RCE
  CVE-2026-6951 fixed in 3.36.0), 43 high, 50 moderate, 3 low. High highlights: Electron itself (4),
  `hono` (32), `@xmldom/xmldom` (15), `electron-updater`/`builder-util-runtime` (leaks the authorization
  header on redirect), `@modelcontextprotocol/sdk`, `ws`. Reachability not tested.
- **Licenses:** 14 distinct, almost all MIT/Apache. Watch: `lightningcss` (MPL-2.0), `jszip`
  (MIT OR GPL-3.0), Claude Agent SDK under Anthropic's own license. None non-commercial.

---

## 7. AI integration

| Agent | How it runs | Credential and destination |
|---|---|---|
| Claude Code | SDK + `claude` binary (Bun), `CLAUDE_AGENT_SDK_CLIENT_APP=tempo-electron` | user account, `ANTHROPIC_API_KEY`, Vertex, or Tempo Inference proxy (Bedrock) |
| Codex | `codex app-server` (JSON-RPC) | ChatGPT login, `OPENAI_API_KEY`, or `/codex-proxy` |
| OpenCode | local server `:4096` | `opencode.ai/auth` or `tempo-inference/*` (GLM, Kimi, DeepSeek, Qwen) |
| Grok | ACP | `XAI_API_KEY` |
| Cursor | ACP via `cursor-agent-sea` | `CURSOR_API_KEY` |

- **Tempo Inference:** its own proxy that maps Claude to AWS Bedrock application inference profiles
  (us-west-2) and the free tier to Azure OpenAI (`gpt-5.4-mini`).
- **MCP:** 13 `tempo-*` servers with ~130 tools (canvas, docs, issues, agents, slack, linear) via
  streamableHttp with bearer.
- **Embedded prompts:** ~110 long strings, ~477 thousand characters, including the main prompt
  ("You are working inside Tempo…") and 12 agent templates.
- **Skills:** 17 built-in skills generated at runtime as per-provider plugins (there is no `SKILL.md`
  in the asar). On first launch Tempo installed 16 commands in `~/.claude/commands`, the
  `prd-writer` skill, 17 mirrors in `~/.config/opencode/command` and the `~/tempo/` folder. It did not touch
  `settings.json`, global MCP or plugins.

---

## 8. Auto-update and macOS footprint

- **Feed:** `electron-updater` with the GitHub Releases provider pointing to the **private** repo
  `TempoLabsAI/tempo-monorepo` (404 without auth). Plus the native `autoUpdater` (Squirrel.Mac/ShipIt).
  60 s polling and `force-upgrade-check` at `tempo-electron.vercel.app`.
- **Verification:** update sha512 and `codesign --deep --strict` on the staged bundle before
  installing.
- **Footprint:** notarized and stapled, URL scheme `tempo:`, no LaunchAgents and no crashes (only 6
  "disk writes" events). Keychain has only "Tempo Safe Storage" (metadata). A 1.5 GB update cache
  in `~/Library/Caches/tempo-electron-updater` (reusable). `~/Library/Application Support/Tempo`
  holds 231 MB with chat history, system prompts, diagnostics and Chromium profiles. `TCC.db` was
  inaccessible, so camera/screen permissions were not confirmed.

---

## 9. How the RE was done and the community standard

- **"REA" exists and is the current standard:** "Reverse Engineer Anything" (`morluto/rea`, MIT, npm
  `rea-agents` 6.5.0). Confirmed by me on the GitHub API: 240,509 stars, 59,804 forks, 231 thousand
  downloads/week. It is a CLI and MCP server. The state of the art in AI-assisted RE today combines REA,
  GhidraMCP and RevEng.AI, with webcrack and humanify for JS bundles.
- **What REA caught in this app:** it validated the 9 fuses (and named the 9th, `WasmTrapHandlers`), the
  signature, cdhash, Mach-O data and a dyld resolution graph. It served as a cross-check of the
  native part.
- **Where REA failed:** it found 4 IPC channels against the 403 found manually, because main and preloads are
  V8 bytecode it does not parse; 317 of its 340 "endpoints" were false positives; the whole-bundle
  analysis aborted on a memory limit. The core (IPC, Convex, telemetry, AI, auth) only came out of
  manually reading strings from the bytecode. **Conclusion: on an Electron app with bytecode, static REA
  does not replace manual analysis.**
- **Workflow used (reproducible):** asar extraction with a custom Python reader (`@electron/asar`
  fails on unpacked entries); exact string extraction from the V8 code cache by size prefix;
  grep for channels, domains and keys; prettier on the renderer bundle; `@electron/fuses` and reading the
  sentinel; `codesign`/`spctl`/`stapler`; OSV for CVEs.

---

## 10. Dynamic analysis (runbook ready, not executed)

This build leaves all of Electron's official inspection available without re-signing or modifying the app:
renderer DevTools, `--remote-debugging-port` with a `/json` endpoint, `--inspect`/`--inspect-brk` on
main (fuses on), and network observation through a proxy with a legitimately trusted CA. It does not depend on
`get-task-allow`. The runbook and scripts (`launch-inspect.sh`, `proxy-start.sh`) are ready in
`tempo-dynamic/`, each with a not-executed header, plus a rollback checklist (remove the
proxy CA and the isolated profile when done).

**Out of scope, by decision:** in-process injection (Frida/dylib/task port) and bypassing
certificate verification (pinning bypass, disabling TLS).

---

## 11. Limits

- Main and preloads are in V8 bytecode, with no compatible decompiler short of running the exact-version
  Electron. Because of that, the `webPreferences` booleans, each scheme's privileges, the final feed
  URL and the `invoke`/`on` split were inferred.
- Nothing from the app was run; the login CSRF and the effect of the test hooks are hypotheses.
- CVEs via OSV (no lockfile), with no reachability test. Tempo's prices and privacy policy
  were not confirmed in an official source. Subagent counts were spot-checked.
