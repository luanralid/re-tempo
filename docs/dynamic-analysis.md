# Tempo.app 0.0.121 — Dynamic phase (runtime), isolated mode without login

Date: 2026-10-14. The user's own machine and app. Authorization: reverse engineering of the user's own copy, for study. Related static phase in [reverse-engineering.md](reverse-engineering.md).

> **Status: DONE.** The live CDP capture was done on the **isolated clone RE-TEMPO.app** (`com.re-tempo.app`), with the verification gate passed (original profile intact, signed-out boot, userData override honored). See **§11**. The section below documents the discovery boot on the original Tempo (which revealed the defeat of `--user-data-dir`).
>
> **Historical status (phase 1):** PARTIAL / BLOCKED by contract. The isolation method planned in the brief (`--user-data-dir`) was **defeated by the app itself**, which pins the real production profile. This touched the real profile once (discovery boot, already shut down and reverted as far as possible). The full CDP capture (live bridges/keys, invoke vs on, DOM CSP, full domain list) **was not executed** so as not to keep touching the real profile. A real isolation path has been identified (E2E mode or dev override), pending a decision. See the "Limits" and "Decision made" sections. **Coordinator decision (2026-10-14):** do not relaunch the original Tempo; the live CDP capture will be done on an isolated **RE-TEMPO.app** clone (bundle `com.re-tempo.app`, its own data profile = real isolation, no stubs), pending the binary/port from another agent.

---

## 1. Method and contract

- Launch of the bundle binary with a profile and debug ports, in the background, output to `notes/stdout.log`.
- Inspection **only through official channels**: Chrome DevTools Protocol (CDP) on port 9222 (renderer) and the Node inspector (inspect port). **No MITM, no CA, no `security add-trusted-cert`, no sudo, no injection, no repackaging/re-signing.**
- Intended isolated profile in `_runtime/user-data`; isolated HOME in `_runtime/home` (disposable, inside the scratchpad).
- Read-only introspection: no write method was called (no `fs:*`, `terminal:*`, `workspaces:*`, `auth:*`).
- Ports: 9222 (renderer) free and used; the brief's port 9229 was **occupied by another `node` process** (probably a sibling agent) — and so was 9230 —, so the main inspector came up on **9333**.

### Deliberate protective deviation (isolated HOME)
The brief only called for `--user-data-dir`. But `~/.tempo-auth.json` (the real session token) and the AI credentials (`~/.claude.json`, `~/.codex/auth.json`, `~/.claude/.credentials.json`) **exist** and live in HOME, outside userData. To honor "no login, zero risk to the account", I launched with `HOME` pointing at a disposable directory. Result: the app booted **signed out** (see §2), without using the account. No observation goal was lost because of this.

---

## 2. What the app does at boot WITHOUT login (observed sequence)

Source: `notes/stdout.log` (main process log of this boot). Sequence:

1. `[Main] Using production userData dir: ~/Library/Application Support/Tempo` — **the app ignores `--user-data-dir` and pins the real production profile** (central finding, §5).
2. Resolves PATH and shell env; **prepends** node version manager paths derived from HOME (it honored the isolated HOME: `_runtime/home/.nvm/...`, `.volta`, `.nodenv`, `.local/bin` appear). Looks for the `claude` binary under the isolated HOME.
3. `Bundled Node toolchain ready at ~/Library/Application Support/Tempo/node-toolchain-bin`.
4. `git probe: source=not_required available=true`.
5. `[Auth/main] registerAuthHandlers → registering IPC handlers (callbackPort=17249, authHandoffUrl=https://tempo.new/auth-handoff, convexSiteUrl=https://greedy-jackal-526.convex.site)`.
6. `[Auth/main] registerAuthHandlers → cold-start: no stored auth (signed out)` — **signed-out boot**, because without a profile/HOME holding a session there is no token to restore.
7. `[Auth/main] Local auth callback server listening on http://127.0.0.1:17249`.
8. `[web-capture] listening on http://127.0.0.1:17252`.
9. `DevTools listening on ws://127.0.0.1:9222/...`.
10. `Checking for update` → `Update for version 0.0.121 is not available (latest version: 0.0.121, downgrade is disallowed)` (twice). **The auto-update runs at boot even when signed out.**
11. `[Claude Code] bundled: { sdkVersion: '0.3.280', claudeCodeVersion: '2.1.280' }`.
12. Graceful shutdown: `[App] before-quit` → `will-quit` → `[FileWatcherProcess] transition: shutdown`.

Local servers opened at boot without login: **127.0.0.1:17249** (auth callback) and **127.0.0.1:17252** (web-capture). The auth port is configurable via `TEMPO_AUTH_CALLBACK_PORT`.

---

## 3. Network connections (partial — CDP capture aborted)

**The CDP network capture was aborted** (see §6), so there is **no complete list of outbound domains**. What was established in this boot:

| Function | Runtime evidence | Without login? |
|---|---|---|
| Auto-update | Log `Checking for update` / `...not available (latest 0.0.121, downgrade disallowed)`. Polling at boot. Final host not captured; statically: private GitHub `TempoLabsAI/tempo-monorepo` + `tempo-electron.vercel.app/force-upgrade-check` | Yes |
| Auth/backend | `convexSiteUrl=https://greedy-jackal-526.convex.site` and `authHandoffUrl=https://tempo.new/auth-handoff` registered. Signed out: no authenticated call confirmed | Reference present |
| Crashpad (native) | `--url=https://f.a.k/e` in the `chrome_crashpad_handler` args — **placeholder/inoperative URL**: native crash upload is effectively disabled/neutralized | n/a |
| Local | `127.0.0.1:17249` (auth), `127.0.0.1:17252` (web-capture) | Yes |

The static analysis's per-function domain table (§6 of the static report) **could neither be confirmed nor refuted live** in this phase. It remains pending (needs the `Network.*` capture under real isolation).

---

## 4. Surface exposed to the renderer (bridges and keys)

**Not introspected live** in this phase (enumerating `window`/bridges/`electronAPI` via `Runtime.evaluate` requires the window to be loaded for ~30–60 s, which keeps the real profile touched). Therefore the **17 bridges** and the static keys **remain as [static obs], without runtime confirmation** here. Likewise, the **invoke vs on** split of the 403 channels **remains unconfirmed** (it depended on CDP).

What the runtime did show, relevant to the surface:
- **Registered privileged schemes** (real flags of the `network.mojom.NetworkService` process, `captures/privileged-schemes.txt`):

| Scheme | standard | secure | bypassCSP | cors | supportFetchAPI |
|---|---|---|---|---|---|
| `tempo-screenshot` | ✔ | ✔ | ✔ | — | ✔ |
| `tempo-frame-codec` | ✔ | ✔ | **—** | — | ✔ |
| `tempo-html-storyboard` | ✔ | ✔ | ✔ | — | ✔ |
| `sentry-ipc` | **—** | ✔ | ✔ | **✔** | ✔ |

  - **Resolves the static [inf]** ("which scheme gets which privilege was not recovered").
  - **Refines the static list**: there were 3 schemes; the runtime shows **4** (adds `sentry-ipc`, the IPC transport of `@sentry/electron`), which is the **only one with CORS** and is **not standard**.
  - **`tempo-frame-codec` does NOT have bypassCSP** (unlike `tempo-screenshot` and `tempo-html-storyboard`).
  - `allowServiceWorkers` does not appear as a command-line flag (it is a `registerSchemesAsPrivileged` option, it does not become a `--*-schemes` switch), so it was not confirmed this way.

---

## 5. Main process (versions/argv) and the isolation finding

Versions (from `localhost:9222/json/version` and the crashpad annotations):
- Chromium **148.0.7778.180**, V8 **14.8.178.22**, Electron Framework **42.3.0**, app **0.0.121**. **Confirms** the static "Electron 42". (Electron 42's Node was not read from the inspector; capture aborted.)

Argv/process structure (`captures/proc-args.txt`):
- Main: `--remote-debugging-port=9222 --inspect=9333 --user-data-dir=<isolated>`.
- Renderer: **`--no-sandbox --no-zygote`** + `--app-path=.../app.asar` + `--tempo-session-id=...` + `--tempo-user-data-dir=~/Library/Application Support/Tempo`.
- NetworkService/GPU: `--user-data-dir=~/Library/Application Support/Tempo` (real profile).

**Central finding (new, refutes the brief's premise):** the app calls `resolveTempoUserDataProfile` and, by default in a packaged build, uses the **real production profile** (`~/Library/Application Support/Tempo`), **injecting** `--tempo-user-data-dir`/`--tempo-session-id` into the helpers and **ignoring Chromium's `--user-data-dir`**. HOME is resolved via `getpwuid` (NSHomeDirectory) for profile paths, which is why the isolated `HOME` did **not** redirect userData (although it did redirect PATH/tool discovery and the token read → signed out).

- **`--no-sandbox` on the renderer confirms** the static `sandbox: false` ([strong inf] → **confirmed**) for the main renderer.
- Active `contextIsolation` remains consistent (bridges via `contextBridge`), but the value was not re-read live.

---

## 6. Confirmations and refutations of the [inf] items

| Static point | Runtime status |
|---|---|
| Privileged schemes: which gets which privilege [inf] | **CONFIRMED/RESOLVED** (table §4); +1 scheme `sentry-ipc` |
| `sandbox: false` on the renderer [strong inf] | **CONFIRMED** (`--no-sandbox` on the renderer) |
| Electron 42 / versions | **CONFIRMED** (148 / V8 14.8 / Electron 42.3.0) |
| Auth: handoff `tempo.new/auth-handoff`, `convex.site`, local callback | **CONFIRMED** (boot log; port 17249) |
| Auto-update runs and checks the feed | **CONFIRMED that polling happens at boot**; final feed URL **still [inf]** (no network capture) |
| Main renderer webPreferences | **CONFIRMED live (§11)**: sandbox=false, contextIsolation=true, nodeIntegration=false, webviewTag=true |
| invoke vs on / channel count | **RESOLVED live (§11)**: 403 channels (electronAPI 291 + 16 bridges 112); ~27 `on*` events, the rest invoke |
| Effective CSP read from the DOM | **CONFIRMED live (§11)**: `connect-src *`, `script-src unsafe-inline/eval`, very permissive |
| Live bridges/keys (17 bridges, electronAPI) | **ENUMERATED live (§11)**; 17 bridges, with 2 new and 3 missing vs static |
| Domains without login (list) | **CONFIRMED live (§11)**: PostHog + Sentry + Vercel (update) + fonts; Convex and relay do NOT connect when signed out |
| Brief premise: `--user-data-dir` isolates the app | **REFUTED** (app pins the production profile) |

New runtime findings beyond the [inf] items:
- **Crashpad with placeholder URL** `https://f.a.k/e` (native crash upload neutralized).
- **Embedded Claude Code versions**: SDK `0.3.280`, CLI `2.1.280`.
- Clean **signed-out boot** via HOME isolation (a useful mechanism for future runs without an account).

---

## 7. Evidence (files)

- `notes/stdout.log` — full log of the boot without login (the §2 sequence).
- `captures/proc-args.txt` — `ps` of the app's processes (full args: schemes, sandbox, real userData, crashpad).
- `captures/privileged-schemes.txt` — extracted scheme/sandbox/crashpad flags.
- `captures/real-profile-touch.txt` — `lsof` of the **real profile** files opened by the app (proof of the touch: `Storage/leveldb`, `IndexedDB/file__0`, `Cookies`, `GPUCache`, `DawnGraphiteCache`, `DIPS`, `WebStorage/QuotaManager`).
- `captures/rollback-baseline.txt` — mtime baseline of the real profile and `~/.tempo-auth.json` before the boot.
- `notes/inspect-port.txt`, `notes/app-launch-pid.txt` — inspect port and launch PID.

Numbers: **1 boot** observed (aborted by contract); **5 processes** of the app (main + crashpad + gpu + network + renderer); **4 real privileged schemes**; **2 local servers** at boot without login (17249, 17252); **0 write-method calls** via IPC; **0 CAs** installed.

---

## 8. Limits

- **There was no CDP network capture or live introspection of `window`/bridges.** These steps require the window to be loaded for tens of seconds, which **keeps the app writing to the real profile** — which the contract forbids. They were deliberately **not executed**.
- Therefore the following remain **pending**: invoke vs on, webPreferences booleans (beyond sandbox), CSP read from the DOM, live enumeration of bridges/keys, and the full list of domains without login.
- The Node inspector (9333) came up, but was **not** used for introspection (same contract reason); the brief's port (9229) was occupied.
- No CA was installed; no injection; the app was not modified or re-signed.

---

## 9. Decision made (completion route)

**Coordinator decided (2026-10-14):** do NOT relaunch the original Tempo (the real profile was already touched once; the contract is "zero risk to the data"). The pending live CDP capture will be done on an **isolated clone RE-TEMPO.app** (bundle id `com.re-tempo.app`, in `~/RE-TEMPO`), which has its **own data profile** — real isolation with **production behavior** and **no stubs** (unlike E2E mode). Another agent is assembling the clone; when it is ready, I receive the binary path and port and run there:
- `Network.*` for the complete list of outbound domains (without login).
- `Runtime.evaluate` (read-only) to enumerate `window`/`electronAPI`/the 17 bridges and keys, and for the effective DOM CSP.
- The invoke vs on split of the channels and the boolean webPreferences per window/webview.
- The Node inspector for the main's `process.versions`/`argv`.

The app's own modes, documented for reference (will not be used for now):
1. **E2E:** `NODE_ENV=test` + `TEMPO_E2E_USER_DATA_DIR=<tmp>` (temporary profile, PostHog off, auth off) — maximum isolation, but **changes behavior** (stubs/fixtures).
2. **Dev override:** `TEMPO_USER_DATA_DIR=<dir>`, probably unlocked by `__TEMPO_ALLOW_DEV_OVERRIDES__` / `ALLOW_DEV_OVERRIDES_IN_PACKAGED` — keeps production, but if not honored it falls back to the real profile.

Status: **on standby**, with no new boots of the original Tempo.

## 10. Rollback performed

- App shut down gracefully (`osascript -e 'quit app "Tempo"'`, exited on the 2nd check; no SIGKILL → no risk of corrupting the DB). `pgrep -fl Tempo` empty.
- `rm -rf _runtime` (isolated profile/HOME, inside the scratchpad). Confirmed removed.
- No CA: `security find-certificate -c mitmproxy` → empty (nothing found).
- Real `~/.tempo-auth.json`: mtime **unchanged** (Oct 14 09:47:29), token on disk intact; the boot was signed out.
- **Real profile touched (not revertible, I must not touch it further):** `~/Library/Application Support/Tempo` had its top-level mtime changed from Oct 14 09:47:30 (baseline) to Oct 14 21:51:09, with Chromium session/cache writes (LevelDB `Storage`, `IndexedDB/file__0`, `Cookies`, `GPUCache`, `DawnGraphiteCache`/`DawnWebGPUCache`, `DIPS`, `WebStorage/QuotaManager`). These are signed-out session artifacts, not user documents. Recorded honestly; the graceful shutdown avoided corruption.


---

## 11. Live CDP capture on the RE-TEMPO clone (phase 2, authorized)

Done on the **clone** `~/RE-TEMPO/RE-TEMPO.app` (`com.re-tempo.app`, CFBundleName `RE-TEMPO`, auto-update off), **not on the original Tempo**. Coordinator decision after the phase 1 block.

### 11.1 Verification gate (passed)
Launch: `HOME=~/RE-TEMPO/_home TEMPO_USER_DATA_DIR=~/RE-TEMPO/_data-isolated RE-TEMPO.app/Contents/MacOS/Tempo --remote-debugging-port=9333 --inspect=9444`.
- Log line 3: `[Main] Using override userData dir: ~/RE-TEMPO/_data-isolated` — **userData override honored** (the `TEMPO_USER_DATA_DIR` env feeds `explicitUserDataDir`); **0** occurrences of the original profile in the log. All helpers use `_data-isolated`.
- `[Auth/main] cold-start: no stored auth (signed out)` — **signed-out boot**.
- `stat -f %m` of the **original** profile BEFORE == AFTER (`1792026401`) — **intact**.
- `NODE_ENV=null` (non-test): **production behavior, no stubs** (unlike the clone's E2E mode).
- Caveat: `chrome_crashpad_handler` receives `--database=~/Library/Application Support/Tempo/Crashpad` (original profile), but it **did not open or write there** (`lsof` empty for the original; `Crashpad/` with mtime of 7 Oct). No clone process opened the original profile.
- `~/.tempo-auth.json` was NOT touched by my capture (isolated HOME); the mtime change observed (22:04) predates it and is external (a non-isolated smoke test by the clone's agent).

### 11.2 Main process (Node inspector 9444)
`process.versions`: **Node 24.15.0**, **V8 14.8.178.22-electron.0**, **Electron 42.3.0**, **Chrome 148.0.7778.180**, OpenSSL(BoringSSL), undici 7.24.4, nghttp2 1.68.0, sqlite 3.51.3, zlib motley, zstd 1.6.0. `platform=darwin arch=arm64`. Injected `tempoEnvKeys`: `TEMPO_USER_DATA_DIR`, `TEMPO_EFFECTIVE_PROFILE_DIR`, `TEMPO_DIAGNOSTICS_DIR`, `TEMPO_NODE_TOOLCHAIN_BIN_DIR`, `TEMPO_NODE_TOOLCHAIN_RUNTIME`. Evidence: `captures/main.json`.

### 11.3 Main renderer webPreferences (resolves [inf])
Introspection of `window` (`captures/bridges.json`): `typeof require/process/module/global = undefined` → **nodeIntegration=false**; `typeof electronAPI = object` → **contextIsolation=true**; `document.createElement('webview').constructor.name = "WebViewElement"` → **webviewTag=true**; `--no-sandbox` in the args → **sandbox=false**. `location = file:///.../out/renderer/index.html`.

### 11.4 Effective CSP (resolves [inf])
Read from the DOM's `<meta http-equiv>`:
```
default-src 'self' data: blob: https: http: ws: wss:; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' data: blob: https: http:; style-src 'self' 'unsafe-inline' data: blob: https: http:; img-src * data: blob: tempo-screenshot:; font-src * data: blob:; media-src * data: blob:; connect-src * data: blob: ws: wss: tempo-screenshot:; worker-src 'self' blob: https: http:; child-src 'self' blob: https: http:; frame-src * data: blob:; object-src 'self' data: blob: https: http:; manifest-src 'self' https: http:;
```
Confirms the static analysis: very permissive (`connect-src *`, `frame-src *`, `script-src` with `unsafe-inline`/`unsafe-eval`). An XSS in the renderer reaches the 403 channels.

### 11.5 Live IPC surface (resolves [inf] 403 and invoke vs on)
17 bridges on `window`: `browserBridge, electronAPI, posthogBridge, providerApiKeysBridge, aiChatBridge, diagnosticsBridge, bugReportBridge, terminalBridge, updaterBridge, authBridge, activeOrgBridge, activeProjectBridge, workspaceOrgBridge, notificationBridge, canvasFlashLogBridge, __tempoChatNameBridge, __tempoArchiveWorkspaceBridge`.
- **The count matches the static analysis:** `electronAPI` has **291** leaf methods (recursive) + **112** in the other 16 bridges = **403** channels.
- **Differences vs static:** **two new** bridges are present, `__tempoChatNameBridge` (get/rename) and `__tempoArchiveWorkspaceBridge` (validate/execute); **absent** in the signed-out boot are `stubAiBridge`, `canvasGestureLogBridge`, `canvasEditLogBridge` (stubAi is a test-mode thing; the canvas ones probably only with an active canvas).
- **invoke vs on** (name-based heuristic; `arity` is no use because contextBridge reports `length=0`): ~**27** `on*` event methods (e.g. `aiChatBridge.onStreamEvent/onModelChanged`, `authBridge.onAuthCallback/onSignedOut`, `updaterBridge.onUpdateDownloaded/onForceUpgradeRequired/onDownloadProgress`, `terminalBridge.onData/onExit`, `browserBridge.onLocalHtmlFileChange`); the rest is invoke/call.
- **Sensitive channels reachable from the renderer (confirmed live):** `providerApiKeysBridge.{getAll,set,clear}` (BYOK), `terminalBridge.{create,write}` (shell), `authBridge.{getToken,refreshToken,signOut}`, `electronAPI.{fs,git,workspace,workspaces,net,openExternal,remoteControl,lsp,dialog,persist}`; and **test hooks in production**: `electronAPI.isTestMode/isE2ETestMode/enableAuthInTests/enableOnboardingInTests/forceShowOnboarding` and the `__tempo*` bridges. Evidence: `captures/bridges.json`, `captures/electronapi-deep.json`.

### 11.6 Network without login (completes this phase)
- **Renderer** (`performance.getEntriesByType('resource')`, `captures/renderer-resources.json`): `fonts.googleapis.com`, `fonts.gstatic.com`, `rsms.me` (fonts); **PostHog** `us-assets.i.posthog.com` (`dead-clicks-autocapture.js`, `array/<key>/config.js`) and `us.i.posthog.com` (`/flags`, `/e`, `/i/v0/e` — analytics events). Observed (public) PostHog project key: `phc_<redacted>`.
- **Main** (`lsof` ESTABLISHED, `captures/connections.txt`): 3 outbound TLS connections, resolved by IP matching: **Sentry** (`...ingest.us.sentry.io`, IPv6 `2600:1901:0:5e8a::`), **PostHog** (`us.i.posthog.com`, IPv6 `2600:1f18:4c12:9a00:...`), **Vercel** (`216.198.79.67` = Vercel range, `tempo-electron.vercel.app`, update/force-upgrade).
- **NOT contacted when signed out:** **Convex** (`greedy-jackal-526.convex.cloud/.site`, Cloudflare) and **`relay.tempo.new`** do not appear in any snapshot; neither do remote auth servers (only the **local callback** `127.0.0.1:17249` and the **web-capture** `127.0.0.1:17252`).
- **CDP Network** on the renderer: **0 events** in 35 s of steady state — signed out, the page is served from `file://` and makes no continuous requests; the boot ones (PostHog/fonts) were recovered via performance resources.

### 11.7 Phase 2 rollback
Clone shut down with a graceful quit (exited on the 2nd check). Original profile **intact** (identical mtime). No CA. Ports 9333/9444 closed. The clone's isolated profile (`~/RE-TEMPO/_data-isolated`) and isolated HOME (`~/RE-TEMPO/_home`) belong to the clone and were used per the recipe; they were not removed so as not to interfere with the clone's agent.

### 11.8 Re-run through the validated wrapper (confirms phase 2)
At the coordinator's request, I repeated the capture through the sanctioned wrapper `~/RE-TEMPO/run-isolated.sh`. Clarification: the CURRENT version of the wrapper does **not** use the E2E mode described in the message; it does `export HOME=$BASE/_home` + `export TEMPO_USER_DATA_DIR=$BASE/_data-isolated` and opens with `--remote-debugging-port=9333` — that is, the **same override approach as phase 2** (production behavior, no stubs), not `NODE_ENV=test`/`TEMPO_E2E_USER_DATA_DIR`. That is why the log says `Using override userData dir` (not `test`) and telemetry **appears** (PostHog active).
- Gate: original profile `stat -f %m` BEFORE==AFTER (`1792026401`, byte-for-byte intact), `cold-start signed out`, 0 occurrences of the original profile, no file of the original open (apart from the crashpad `--database`, which did not write).
- Results identical to phase 2: 17 bridges (same set, with `__tempoChatNameBridge`/`__tempoArchiveWorkspaceBridge` and without `stubAiBridge`/`canvasGestureLogBridge`/`canvasEditLogBridge`), `electronAPI` 291 leaves (total 403), probes (sandbox=false, contextIsolation=true, nodeIntegration=false, webviewTag=true), identical CSP, and outbound traffic to PostHog (`us.i.posthog.com` /flags,/e; `us-assets.i.posthog.com`; key `phc_Fyc…`), Sentry and Vercel (`64.29.17.195`/`216.198.79.x`, update). Evidence: `captures/bridges-wrapper.json`, `captures/connections-wrapper.txt`, `captures/boot-isolated.log`.
- Graceful shutdown; original profile intact; port 9333 closed; no CA.
- Note: since the current wrapper is an override (production) and not E2E, telemetry was NOT suppressed; the coordinator's remark that "in E2E PostHog is off" does not apply to this run.
