# QA 03 — Automated, repeatable, multi-instance test harness (RE-TEMPO)

Date: 2026-10-16. Scope: the test infrastructure in `qa/` that other agents use to
exercise every area of RE-TEMPO (an editable clone of the user's own Tempo) in an
**automated, repeatable and parallel** way, driving the app over **CDP** (Chrome DevTools Protocol).

> Target: `~/RE-TEMPO/RE-TEMPO.app` (`com.re-tempo.app`). **Never** `/Applications/Tempo.app`.
> The harness **does not touch** the user's visible window (pid launched by `tools/start-live.sh`,
> CDP 9333) or the real Tempo profile. Each QA instance is isolated; ephemeral ones are
> disposable and the **logged-in profiles** (§7) are persistent.

---

## 1. Architecture

```
qa/
├── package.json            # dep: playwright-core (chromium.connectOverCDP)
├── instance.mjs            # launch()/teardown() of 1 isolated instance (ephemeral or profile)
├── run.mjs                 # runner: N instances or profiles in parallel, K repetitions, report
├── login.mjs               # creates/validates persistent LOGGED-IN profiles qa-1..qa-N (+ --dry-run)
├── clean.mjs               # safe cleanup (respects locks; never kills a live instance without --kill)
├── ps.mjs                  # lists live RE-TEMPO instances and their owners (read only)
├── lib/
│   ├── config.mjs          # slots/ports/paths + directory guards
│   ├── lock.mjs            # per-slot and per-directory/profile locks in /tmp/tempo-qa/locks/
│   ├── ports.mjs           # free-port check for the slot
│   ├── keychain.mjs        # isolated keychain INSIDE the instance's HOME
│   ├── session.mjs         # session presence + sessionId fingerprint (never the token)
│   ├── inspector.mjs       # main inspector, ONLY for --dry-run (openExternal trap)
│   ├── cdp.mjs             # CDP connection + main page selection (ignores webviews)
│   ├── collect.mjs         # console errors/warnings, exceptions, network, performance/memory
│   ├── assert.mjs          # Checker: asserts with clear messages, accumulated per test
│   ├── ui.mjs              # waitForReady/Screen, detectScreen, sidebar, identity, click, screenshot
│   └── report.mjs          # JSON + Markdown report + pass/fail/skip summary
└── suites/
    ├── 00-smoke.mjs            # logged out: boot, render, screen, sidebar, console, perf, screenshot
    └── 01-smoke-logged-in.mjs  # logged-in profile: requires home, measures logged-in boot
```

Flow of a run (`run.mjs`):

1. Loads the suite `qa/suites/<name>.mjs` and creates `/tmp/tempo-qa/runs/<timestamp>/` (atomic
   creation: two runs in the same second get `<ts>` and `<ts>-2`).
2. Picks the targets: profiles (`--profile/--profiles`, fixed slot) or ephemeral instances
   (`--instances N`, free slots from the top of the range).
3. For each target, in **parallel**: `launch()` acquires the locks, starts the instance, connects
   over CDP, picks the main page (`file://.../index.html`), turns on the collectors, waits for the UI,
   runs the tests (×`K`) and `teardown()` terminates **only** that instance's processes.
4. Writes `report.json` + `report.md` (with per-test screenshots). Exits 0 if everything passed.

Ephemeral instances use a **fresh profile** on every run (unless `--keep-profile`); profiles are never
reset by the runner.

---

## 2. Isolation

| Resource | Ephemeral | Persistent profile | Why |
|---|---|---|---|
| `HOME` | `/tmp/tempo-qa/inst-<id>/home` | `<QA_PROFILES_DIR>/qa-N/home` | empty ⇒ **logged out**; a profile keeps its own state |
| `TEMPO_USER_DATA_DIR` | `/tmp/tempo-qa/inst-<id>/data` | `<QA_PROFILES_DIR>/qa-N/data` | own userData ⇒ real profile untouched |
| keychain | `<HOME>/Library/Keychains/login.keychain-db` | same | avoids "Keychain Not Found"; **never** the real default-keychain |
| `main.log` | `.../inst-<id>/main.log` | `.../qa-N/main.log` | main's stdout/stderr (from the last boot) |

`QA_PROFILES_DIR` defaults to `/tmp/tempo-qa/profiles`. If set, it must be **absolute**, live
under `/tmp/tempo-qa` or have a `tempo-qa` segment in the path, and **must not** be the real HOME,
`~/Library`, `~/RE-TEMPO`, `/Applications` nor inside the repo (logged-in profiles store the
session in plain text). `/tmp/tempo-qa`, `profiles/` and each profile are created with **0700**.

Environment variables survive the app's boot relaunch. Electron's single-instance lock
(`requestSingleInstanceLock` / `.tempo-instance.lock`) is per userData/HOME, so
instances with distinct directories collide neither with each other nor with the user's window.

### Isolated keychain (security detail)
`qa/lib/keychain.mjs` runs every `security` command with `env HOME=<instance home>`. The `user`
domain preferences (search list and default-keychain) live in
`$HOME/Library/Preferences/com.apple.security.plist`; with the HOME isolated, creating/setting the
keychain **does not change** the real keychain. Disposable local password (`tempo-qa-local`). Validated
after dozens of boots: `security default-keychain -d user` (real HOME) is still
`~/Library/Keychains/login.keychain-db`.

---

## 3. Slots, ports and locks

A **slot** `i` (0..19) is an exclusive set of ports:

| Function | Range | Formula | How it reaches the app |
|---|---|---|---|
| CDP / DevTools | 9401–9420 | `9401 + i` | flag `--remote-debugging-port` |
| Main inspector | 9501–9520 | `9501 + i` | flag `--inspect` — **only** in `login.mjs --dry-run` |
| Auth callback | 17301–17320 | `17301 + i` | `TEMPO_AUTH_CALLBACK_PORT` |
| Web-capture | 17401–17420 | `17401 + i` | `TEMPO_WEB_CAPTURE_PORT` |

Tempo's web-capture is fixed at `127.0.0.1:17252` by default; the harness found the env
`TEMPO_WEB_CAPTURE_PORT` in the main's bytecode and gives each slot its own port. No range
collides with the live window (9333 / 17249 / 17252).

**Who uses which slot:**
- Profile `qa-N` → fixed slot `N-1` (qa-1 = 9401/17301, qa-3 = 9403/17303 …).
- Ephemeral instances of `run.mjs --instances N` → **free slots from the top** (19, 18, …), ids `a19`, `b18`,
  …, skipping slots with a lock or a busy port. This way they collide neither with profiles nor with
  other agents' runs. (Real example: port 9413 of slot 12 was taken by a `workerd`
  from another project of the user; the harness refuses/skips that slot and does not touch the process.)
- `launch({ id, index })` called directly by other suites keeps using the requested slot.

**Locks** (`/tmp/tempo-qa/locks/`, one file per resource, atomic creation, content
`{pid, cmd, startedAt}`): `slot-<i>.lock`, `inst-<id>.lock`, `profile-qa-N.lock`. `launch()`
acquires directory and slot **before any reset**: a second run on the same profile, id or slot
fails immediately with `in use: profile-qa-1 belongs to pid X (...)`, without touching the first. A lock whose
owner is dead is taken over automatically; `clean.mjs` removes orphans.

---

## 4. How to run (exact commands)

```sh
cd ~/Projects/re-tempo/qa
npm install                                              # once (playwright-core)

# logged out (ephemeral)
node run.mjs --suite 00-smoke --instances 1
node run.mjs --suite 00-smoke --instances 3              # 3 in parallel
node run.mjs --suite 00-smoke --instances 1 --repeat 3
node run.mjs --suite 00-smoke --instances 1 --keep-profile

# logged in (persistent profiles; see §7)
node login.mjs --profiles 6                              # creates/validates qa-1..qa-6 (the user approves)
node run.mjs --suite 01-smoke-logged-in --profile qa-1
node run.mjs --suite 01-smoke-logged-in --profiles qa-1,qa-2,qa-3

# inspection and cleanup
node ps.mjs                                              # live instances and owners (read only)
node instance.mjs --id x --index 10                      # standalone instance; Ctrl+C terminates only it
node clean.mjs --all                                     # free inst-* (NOT profiles, NOT runs)
node clean.mjs --id a19                                  # one ephemeral (if free)
node clean.mjs --profile qa-3                            # deletes a logged-in profile (if free)
node clean.mjs --runs                                    # reports of ALL agents
```

`clean.mjs` rules: it only touches exact directories under the harness roots, only after
taking the directory lock, and **never kills a live instance** (which may belong to another agent,
launched by old code without a lock) — unless `--kill` is passed explicitly for an
orphaned instance that is yours. It uses `fs.rmSync` (no `rm -rf`, no glob).

Binary override: `RE_TEMPO_BIN=/path/Tempo node run.mjs ...`.

---

## 5. Smokes

### `00-smoke` (logged out)
Boot to the UI via CDP (time measured); renderer with content; **detects the screen** (home / auth /
onboarding / unknown) and adapts the asserts; enumerates sidebar/nav; **zero unhandled exceptions**;
console, network (domains + status), performance/memory; screenshot. Logged out, the screen is the
**login** one ("Design. Code. Ship." / Sign up / Log in) — a valid result, recorded.

### `01-smoke-logged-in` (profile `qa-N`)
Stops at `home` or at a stable `auth` (4 s) and **requires `home`** (logged out fails in ~8 s, with the note
"run login.mjs --only qa-N"). Records the **logged-in boot** = spawn → moment the home
appeared (`bootHomeMs`), checks Generate + Open folder/Import project, sidebar with items,
visible identity (masked email `l***@domain`), zero exceptions, perf, network and screenshot.
Logged-in screenshots and reports contain account data: they stay local in `/tmp` (0700).

### Home detection
The original heading is **"Let's Cook."**; the `feature/home-title.js` mod replaces it with a
live-editable text (currently "Let's do it", exposed in `window.__RE_TEMPO_HOME_TITLE_TARGET__`).
So `detectScreen` recognizes the home by its **actions** (Generate + Open folder/Import project)
or by either heading, and does not break when the mod changes the text.

Every instance of the same `.app` loads the repo's mods (`feature/` via the symlink
`out/renderer/mod`); the smoke sees the "Agent Runs (⌘⇧A)" launcher in the UI. Expected.

---

## 6. Authentication findings (no secrets)

Read-only investigation (main bytecode strings, RE docs and the QA instances' `main.log`).
**No token value was read, printed or copied.**

- **Where the session lives:** a plain-text `.tempo-auth.json` file, with the keys `token`
  (JWT), `sessionId`, `userId`, name and email. Correction to the 1st version of this doc:
  with `TEMPO_USER_DATA_DIR` set, the file **lives in userData** — observed in the live logged-in
  window (`_data-isolated/.tempo-auth.json` exists and is rewritten on renewal; `_home` has
  none). The harness checks the profile's userData and HOME.
- **Login:** IPC `auth:openSignIn` → `shell.openExternal(https://tempo.new/auth-handoff?next=sign-in&callbackPort=<port>)`.
  The page (Clerk) returns the session via `POST 127.0.0.1:<callbackPort>/tempo/auth`, served by the
  instance's "Local auth callback server". Since the port is in the URL, the approval of a QA
  profile arrives **at the QA instance**, not at the live window (17249).
- **Fallback `tempo://auth/callback`:** exists in the app. The `tempo://` scheme is registered in
  RE-TEMPO **and** in the original Tempo, and the system's default handler is `com.re-tempo.app`. If the
  page falls into this fallback, macOS would deliver the callback to a RE-TEMPO app (probably the
  live window) or open a Tempo. So the instruction to the user is to **cancel** any
  browser prompt to open RE-TEMPO/Tempo (§7).
- **Renewal:** `auth:refreshToken`/`auth:getToken` → `/auth/refresh` on Convex
  (`convexSiteUrl`). Signout signals: `__tempo_auth_reason:{no_auth,session_expired,transient,unauthorized}`.
- **Singleton:** no sign of a "concurrent/replaced session" in the client; the instance lock
  is local.

### Phase B — do not clone the live session (kept)
Refresh token rotation: **uncertain** (only the server knows). Cloning the live session into
concurrent instances could make the backend revoke both and drop the user's window. So the
harness **never** copies `token`/`sessionId` from the live session; logged-in profiles do their **own
login** (§7).

---

## 7. Logged-in profiles (dedicated login per profile)

Reason: logged out, only the auth screen appears, and suites S1–S7 (`docs/qa/02`) need a login.

### Layout
```
<QA_PROFILES_DIR>/qa-N/        (default /tmp/tempo-qa/profiles/qa-N, 0700)
├── home/                      own HOME (+ isolated keychain)
├── data/                      own userData (session .tempo-auth.json lives here)
├── main.log                   log of the last boot
├── .logged-in                 marker (0600): see below
└── dryrun.json                --dry-run evidence (if run)
```
Profile lock: `/tmp/tempo-qa/locks/profile-qa-N.lock`. Fixed slot `N-1`.

### `login.mjs`
```sh
node login.mjs --profiles 6            # qa-1..qa-6, in sequence
node login.mjs --only qa-2,qa-5        # only these
node login.mjs --profiles 6 --force    # redo from scratch (deletes the local profile first)
node login.mjs --timeout-min 5         # waits for approval (default 5 min)
node login.mjs --dry-run --only qa-1   # stops BEFORE opening the browser
```
For each profile, in sequence:
1. takes the profile lock and starts the instance (slot ports);
2. waits for `home` or a stable `auth`. **Already logged in** → does not log in: refreshes/recreates the marker and
   moves on (skips). Marker present but boot in `auth` → stale marker, removed, logs in;
3. in `auth`: clicks **"Log in"** (the app opens the handoff in the default browser) and prints
   `>>> Approve the login of profile qa-3 in the browser (tempo.new tab, callbackPort=17303)`;
4. waits up to 5 min for the logged-in home (1 s poll, stable for 2 s);
5. writes `qa-N/.logged-in` and terminates the instance (12 s grace for the app to write session/LevelDB);
6. at the end: table `profile | callbackPort | status | detail` and exit 1 if any failed.

Contents of the `.logged-in` marker (no token): `profile`, `loggedInAt`, `verifiedAt`,
`email` / `org` / `avatar` **visible in the UI** (passive DOM scan; `null` if the UI does not show them
without opening a menu), `authFile` (`data`|`home`), `sessionFp` (sha256 of the `sessionId`
truncated to 12 hex, not reversible), `bootHomeMs`, `slotPorts`.

**New session per profile:** `sessionFp` lets us prove, without exposing values, that each approval
produced its own session. If two profiles end up with the same `sessionFp`, `login.mjs`
warns ("profiles with the SAME session … do not sign out in these profiles") — a sign that the handoff
reused the browser's session.

`--force` deletes only the **local** profile; the old session is **not revoked** on the server (it expires
on its own, or the user revokes it in the account settings). The same applies to
`clean.mjs --profile`.

### What the user sees in the browser
For each profile, a new tab at `https://tempo.new/auth-handoff?next=sign-in&callbackPort=1730X`
(Tempo/Clerk sign-in flow). If the browser already has a Tempo session, confirming/continuing should be enough.
Instructions (`login.mjs` also prints them):
- approve **only** the tab whose `callbackPort` matches the profile announced in the terminal;
- the browser may ask for permission for the page to access the local network/`127.0.0.1` (the POST to
  the callback port) — allowing it is required for the login to reach the QA instance;
- if the browser asks to **open RE-TEMPO/Tempo** (`tempo://` link), **cancel**: that
  would hand the session to another app (probably the live window).
- `login.mjs` warns if the **original** Tempo opens during a login (a sign of the fallback).

### `run.mjs` with profiles
`--profile qa-N` or `--profiles qa-1,qa-2`: uses the profile **without resetting**; the profile and slot
locks prevent two simultaneous runs on the same profile (the second fails immediately). Distinct profiles
run in parallel. Without `.logged-in`, the runner warns and the suite sees the real screen.

### Dry-run executed (2026-10-16, profile `qa-1`, without opening a browser)
`node login.mjs --dry-run --only qa-1` — turns on the QA instance's main inspector (9501) and replaces
`shell.openExternal` with a trap that **captures the URL without opening anything** (with an extra defense
that would turn `open <url>` via `child_process` into `/usr/bin/true`). It only clicks "Log in"
if the swap is **verified by reading it back**. Evidence (`qa-1/dryrun.json` + `main.log`):

| Item | Result |
|---|---|
| Boot | `cold-start: no stored auth (signed out)`; no `.tempo-auth.json` in data/home |
| Callback server | `Local auth callback server listening on http://127.0.0.1:17301`, pid = QA instance |
| Live window | port 17249 is still pid 92950's (not touched) |
| Trap | installed and verified; `Log in` clicked |
| `main.log` after the click | `[Auth/main] IPC auth:openSignIn → shell.openExternal(https://tempo.new/auth-handoff?next=sign-in&callbackPort=17301)` |
| Captured URL | `https://tempo.new/auth-handoff?next=sign-in&callbackPort=17301` (port = qa-1's slot) |
| `open` via child_process | 0 calls (the path is only `shell.openExternal`) |
| Session afterwards | still none (nothing approved); instance terminated, zero leftovers |

Conclusion: the profile's session will be **new** (empty profile, nothing inherited, `next=sign-in`, delivery
to its own port). If the backend reuses the browser's session, `sessionFp` will show it
after the real login.

### Risks and limits of logged-in profiles
- **Real login not executed here** (by decision): the `auth → home` path, the reading of
  email/org and `sessionFp` will only be exercised on the first run with approval.
- **Sign-out in suites:** forbidden until `sessionFp` confirms distinct sessions; even then,
  sign-out revokes that profile's session (redo with `login.mjs --only qa-N`).
- **Data in the account:** suites that create data use the `QA-AUTO-` prefix and clean up at the end (user's
  rule). Billing/Stripe, org delete and integration OAuth remain out.
- **`/tmp` is volatile:** macOS clears `/tmp` on reboot and files idle for days; to
  persist, use `QA_PROFILES_DIR=~/tempo-qa-profiles` (outside the repo).
- **Plain-text session** in the profiles (it is the app's format): directories 0700, marker 0600.

---

## 8. How to write a new suite (template)

Create `qa/suites/<name>.mjs` exporting `default = { name, tests: [...] }`:

```js
// qa/suites/10-example.mjs
export default {
  name: "10-example",
  tests: [
    {
      name: "opens-something",
      // ctx = { instance, page, collectors, checker, runDir, instDir, lib, rec }
      async fn({ page, checker, collectors, rec, lib, instDir }) {
        const { ui } = lib;

        // 1) wait for the right screen (logged in: ["home"])
        const seen = await ui.waitForScreen(page, ["home", "auth"], { timeoutMs: 60000 });
        rec.screen = seen.screen;

        // 2) interact (tolerant: returns a boolean, does not throw)
        const clicked = await ui.clickByText(page, "Generate", { role: "button" });
        checker.ok(clicked, "clicked Generate");

        // 3) asserts with a clear message (accumulated; pass if all ok)
        checker.equal(collectors.exceptions.length, 0, "no unhandled exception");

        // 4) evidence
        const shot = await ui.screenshot(page, instDir, "example");
        if (shot) rec.screenshots.push(shot);
      },
    },
  ],
};
```

- **`checker`**: `ok`, `equal`, `truthy`, `includes`, `atMost`. Pass if no check failed and
  there was at least 1; a thrown exception also marks fail.
- **`lib.ui`**: `waitForReady`, `waitForScreen`, `bodyText`, `detectScreen`, `enumerateSidebar`,
  `readVisibleIdentity`, `clickByText`, `screenshot(page, dir, name)`, `a11ySnapshot`.
- **`collectors`**: `consoleErrors`, `consoleWarnings`, `exceptions`, `requests`, `networkSummary()`.
- **`rec`**: `screen`, `sidebar`, `perf`, `network`, `notes`, `identity`, `screenshots.push()`.
- Run logged out with `--instances N`, logged in with `--profiles qa-1,qa-2`.

---

## 9. Validation (2026-10-16)

### Round 1 (logged out)
- 3× sequential: **3/3 PASS**; parallel 2: **2/2**; parallel 3: **3/3** (2 rounds, after fixing
  an `ENOTEMPTY` race in the profile reset).
- Boot spawn → UI via CDP: ~**930–1050 ms**; JS memory on the login screen ~78 MB.

### Round 2 (profiles, locks, dry-run)
- Concurrency (3 rounds): run A on `qa-1` **PASS**; run B on the same profile and ephemeral run C on the
  same slot **blocked immediately** by the locks; zero leaked processes checked with `ps.mjs`.
- `00-smoke --instances 3` on slots 19/18/17: **3/3 PASS** (~1.0 s boot); `--instances 2`: **2/2**.
- `01-smoke-logged-in --profile qa-1` (profile still logged out): **expected FAIL** in 8 s, `auth` screen.
- `clean.mjs`: with a live owner → "in use"; dead owner and live app → "ALIVE without lock, not touched";
  `--kill` → removed, no process left; orphan lock swept.
- Login dry-run: see §7. Live window (92950) intact (only `ps`/`lsof`); real keychain intact.

### Bugs found and fixed in this round
1. **Main leaked on teardown:** a SIGTERM that arrives early in the boot is ignored and the main recreates the
   helpers; since the main does not carry the `dataDir` in its arguments, the final SIGKILL never hit it.
   Now teardown identifies the main by the launched pid and the dataDir's `SingletonLock`,
   re-sends TERM, applies KILL and **confirms** nothing is left (throws an error if something is).
2. **Kill by substring:** `pgrep -f <dataDir>` would match other agents' shells that quote the
   path. Now only processes whose command starts in the RE-TEMPO bundle qualify, and helpers only
   by the exact argument `--user-data-dir=<dataDir>`.
3. **Reset of someone else's instance:** runs with the same id/slot could reset another
   agent's instance. Now directory and slot locks come before any reset; `clean` never kills
   a live instance without `--kill`.
4. **Overwritten report:** two runs in the same second shared the directory. Now
   creation is atomic (`<ts>`, `<ts>-2`).
5. **`instance.mjs` CLI** exited right after starting (child `unref`'d), releasing locks and leaving the
   app orphaned. Now it stays alive while the app lives and Ctrl+C terminates the instance.
6. **Relative `QA_PROFILES_DIR`** became a path inside the repo. Now it requires absolute and
   forbids the repo.

Note on round 1: that round's leftover check used `pgrep` by path, which does not
see the main; a full listing of the bundle done afterwards showed there were no leaked mains
from round 1 (the only leak was bug 1's, already terminated).

---

## 10. Limitations and notes

- **Logged-in boot** is slower than logged-out (auth restore, Convex, workspace); the
  `launch()` timeouts are 120 s per step and the logged-in smoke waits up to 120 s for the home.
- **Post-connection network:** the collectors only see requests after CDP connects; boot
  traffic appears via `performance` resources.
- **Other agents' instances with old code** (launched before the locks) have no lock:
  `ps.mjs` shows them as "NO LOCK"; `clean` does not touch them without `--kill`.
- **Visible windows:** each QA instance opens a real window on the user's screen during the run.
- **macOS/CDP:** depends on `--remote-debugging-port` and `--inspect` (RE-TEMPO's fuses allow them)
  and on the `security` CLI.
- **Webviews:** `pickMainPage` picks the `index.html` with the largest viewport; specific webviews
  must be selected by the suite.
- **No commit/push/deploy.** The harness only writes to `qa/**` and `docs/qa/03-*`; run artifacts
  stay in `/tmp/tempo-qa/`.
