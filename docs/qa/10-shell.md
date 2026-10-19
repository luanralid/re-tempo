# QA 10 — Shell, navigation and gates (agent t-shell)

Status: **PHASE 1 done** (no login). Phase 2 (logged in, profile qa-1) pending.

## 1. How the area works (phase 1)

- Logged out, the renderer shows the auth screen (`[data-testid="login-heading"]` "Design. Code. Ship. All in one place."), the paragraph "Stop switching apps…", the caption "DEPARTING TO: TEMPO", two buttons (`sign-up-button` "Sign up", `log-in-button` "Already have an account? Log in") and macOS-style window controls (`macos-window-controls`: Close, Minimize, Maximize, all with `aria-label`). No `<a>` at all; document.title "Tempo", `lang="en"`.
- The buttons call `bridge.openSignUp()` / `openSignIn()` (opens the browser at tempo.new/auth-handoff). **They were not clicked** to avoid opening the real browser; NOT-TESTABLE safely.
- No app shortcut does anything while logged out (Ctrl+1, Mod+P/Shift+P/K/,/T/Shift+B, Esc): nothing opens.
- The text "Let's do it" comes from the **user's mod** (`feature/home-title.js`, TARGET = "Let's do it"), which replaces the native heading "Let's Cook." (the component's default, subtitle `Where do you want to start?`). It is not Tempo text. In phase 2 the asserts accept both texts.
- Network at logged-out boot: fonts.googleapis/gstatic, rsms.me, PostHog (us.i / us-assets). Console: 0 errors, 0 exceptions, 1 warning (Canvas2D willReadFrequently).

## 2. Matrix (phase 1)

| ID | Feature | Documented | Observed | Status | Evidence |
|---|---|---|---|---|---|
| I-001 | Auth screen | Sign up / Log in | present, stable testids | OK (render); click NOT-TESTABLE | evidence/shell/auth-1400.png |
| I-001 | Window controls | n/a | 3 buttons with aria-label | OK | suite auth-window-controls |
| F-auth | Keyboard focus | n/a | Tab: Close, Minimize, Maximize, Sign up, Log in, (Agent Runs) | OK | auth-keyboard-focus |
| F-005/F-012 | Shortcuts while logged out | n/a | inert | OK | auth-inert-shortcuts |
| resp. | 600x400 up to 2560x1440 | n/a | no horizontal scroll, buttons visible | OK | auth-responsive |
| resp. | 320x480 | n/a | h1 cut off at the top (y=-4); Agent Runs button (mod) overlaps Sign up | DIVERGENT (D-01, cosmetic) | evidence/shell/auth-320.png |
| mod | Agent Runs button on the auth screen | user mod | present | OK | auth-mod-agent-runs-present |
| I-004, I-012 | Onboarding / force upgrade | — | not reachable without login | pending phase 2 | — |
| I-020…I-041 | Navbar, tabs, palettes, Help, Bug, Settings, empty state | — | suites written, waiting for login | pending phase 2 | — |

## 3. Bugs / divergences

- **D-01** (low): a 320x480 viewport cuts off the auth screen title (y=-4) and the Agent Runs launcher covers the Sign up button. The real Electron window has a larger min size (to verify in phase 2); it only happens with emulation.

## 4. Suite

- File: `qa/suites/10-shell.mjs` (16 tests: 8 auth, 8 logged-in shell, the latter with a soft skip when logged out).
- Phase 2: `cd qa && node run.mjs --suite 10-shell --profile qa-1` (×2). Results: pending.
- Phase 1, logged out, index 15 (own slot; slot `a`/9401 was taken by another agent): 8/8 auth PASS, 8 part-B tests with soft skip.

## 5. Limits

- `run.mjs --instances N` uses slots starting at 9401 and collides with other testers; I used a local (scratch) driver on slot 15 for phase 1.
- Sign up/Log in, Close/Minimize/Maximize were not clicked.
- Part B (selectors) comes from the inventory and has not yet been validated against the real UI.
