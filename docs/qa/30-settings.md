# QA 30 — Settings (0.0.121, RE-TEMPO)

Date: 2026-10-16. Profile `qa-3` (logged in, isolated HOME/userData). Evidence in `docs/qa/evidence/settings/` (PNGs + `explore-sections.json`, a text/testid dump of each section).

## 1. How Settings really works

Opens via the `button` "Settings" (no aria-label, icon only), via `Meta+,` (confirmed) or via the avatar menu. It is a full screen overlaid on the app (the Issues board stays in the DOM underneath, with its own testids). The navigation (`div.w-60`) has "Return to app", **Personal** (Preferences, Chat, Billing, Auth tokens, Providers), **Organizations** (one entry per org + "Add organization"), **Projects** (`[data-section=projects]`, only shown with local projects) and a footer with name/email + `Sign Out`. Nav items have no testid.

| Section | Where it persists | Effect |
|---|---|---|
| Preferences > Appearance (Dark/Light buttons) | LOCAL: `localStorage["tempo-theme"]` + `html[data-theme="light"]` | switches the theme immediately; no "system" option, font or density |
| Preferences > Links (2 switches) | LOCAL: `tempo:chatLinksOpenInTempo`, `tempo:workspacePrLinksOpenInTempo` (the key only exists after the 1st toggle) | chat/PR links open in the Tempo Browser |
| Preferences > Auto-upload canvas diagnostics | ACCOUNT (`users:setAutoUploadDiagnosticsEnabled`) | read only, not changed |
| Preferences > Max concurrent agent runs (number 1–50) | ACCOUNT (`users:setMaxAgentConcurrency`, saves on `onBlur`) | read only |
| Preferences > Figma token | ACCOUNT (secret on the server) | NOT tested (secret) |
| Chat | model/effort defaults: LOCAL; System Prompt and Skills: ACCOUNT | read only |
| Billing | ACCOUNT/Stripe | no active plan: Pro $30, Scale $50, Ultimate $100, Power $350 cards (`Subscribe`), "Redeem a code". Nothing clicked |
| Auth tokens | ACCOUNT | "No active tokens", `Create token` (not clicked) |
| Providers (BYOK) | LOCAL, device only (`maskedKey` + host) | 5 groups (OpenCode, Codex, Claude Code, Grok Build, Cursor CLI), 33 models, all "System default" |
| Org (7 visible tabs: General, Members, Projects, Stages, Admin, Integrations, Agents) | ACCOUNT | read only |

Test account: 1 org ("Personal", admin), 1 member (self), 3 projects (`portfolio`, `demo-project`, `QA-AUTO-agents-repo`), Linear/Slack not connected, 0 public agents.

## 2. Matrix

| ID | Feature | Documented | Observed | Status | Evidence |
|---|---|---|---|---|---|
| I-160 | Theme | Dark/Light, `tempo-theme` | Identical; light writes `tempo-theme=light` and `data-theme=light`; restored | OK | `settings-theme-light.png`, theme test |
| I-160 / F-xxx | "System" theme, font, density | considered in the brief | nonexistent | ABSENT-in-0.0.121 | bundle + `settings-preferences.png` |
| I-161 | 2 "open in Tempo" toggles | testids + `tempo:*` keys | toggle, restore; persist after `reload` | OK | preferences and persistence tests |
| I-162 | Process memory tracker | Insiders/dev only | absent in this build | ABSENT (expected) | `rec.processMemoryTracker` |
| I-163 | Auto-upload diagnostics | toggle | present; not changed (account) | OK (read-only) | explore |
| I-147 | Max concurrent runs | input 1–50 | present, min=1 max=50 | OK (read-only) | a11y/keyboard test |
| I-164 | Figma token | input/save/reveal | input+save present; not tested | BLOCKED (secret) | explore |
| I-165 | Machines | `remote-control` flag | section absent | ABSENT (flag) / out of scope (t-agents) | explore |
| I-166 | New chat defaults | aria "New chat defaults" | Default model / Default effort = "Last used" | OK | `settings-chat.png` |
| I-167 | System Prompt | `settings-user-system-prompt` | textarea present | OK (read-only) | same |
| I-168 | Personal skills | `personal-skills` flag | **visible**: search, filter, "New skill", empty state | OK (flag on) | explore |
| I-169..174 | Billing | plans/Redeem/Manage Plan | no plan: 4 cards + Redeem; no `Manage Plan`, top-up or model table | OK / partly DIVERGENT (no active plan, normal) | `settings-billing.png` |
| I-175 | Auth tokens | mint/list/revoke | explanation + "No active tokens" + Create token | OK (read-only) | `settings-auth-tokens.png` |
| I-176 | Providers BYOK | `model-*` testids | Set key → Save disabled when empty and with whitespace only; Cancel does not save; saves masked `sk-ant…fake` + "Custom key"; Remove restores "System default"; also saves offline (local) with emoji/unicode | OK | `settings-byok-saved.png`, providers and offline tests |
| F-014 | Per-device keys | per device | confirmed ("stored only on this device" text) | OK | explore |
| I-177 | Referrals | hidden | no nav item | OK | nav test |
| I-178 | Org General | logo/name/slug | 3 testids present; editing NOT tested (account) | OK | `settings-org.png` |
| I-179 | Members | invite/rows | `invite-members-button`, `member-row`; no invite sent | OK (read-only) | org test |
| I-180 | Access requests | `access-requests-section` | no requests, section does not render | NOT-TESTABLE | explore |
| I-181 | Org Projects | add/remove | `add-project-to-org-button`, 3 `settings-project-row` | OK | org test |
| I-182/146 | Public agents | `settings-public-agents` | empty | OK | org test |
| I-183 | PR insights | flag | tab absent | ABSENT (flag) | org test |
| I-184/185 | Linear/Slack | cards + connect | cards and buttons present; OAuth NOT started | OK (read-only) | org test |
| I-186 | Stages | editor | `issues-stages-editor` with 22 stages | OK | explore |
| I-187 | Admin / delete org | Deletion section | text and button present; NOT clicked | OK (read-only) | explore |
| I-188 | Project settings (scripts) | `[data-section=projects]` | no local projects in this profile, section does not render | NOT-TESTABLE (no local project) | explore |
| F-012 | Meta+, | opens Settings | confirmed | OK | nav test |
| F-018 | App version in Settings | 0.0.124+ | no version shown | ABSENT-in-0.0.121 | explore (`version: null`) |
| — | MCP, Notifications, Shortcuts, Account/Profile sections | mentioned in the brief | do not exist as a section; name/email only in the nav footer | ABSENT-in-0.0.121 | nav |
| — | Check for updates | "observe only" | no control in Settings | ABSENT (auto-update off) | explore |
| — | CLI detection (Claude Code, Codex, Cursor) | brief | Settings does not show detection; Providers lists all models with "System default" | NOT-TESTABLE in Settings | — |

## 3. Bugs and divergences

1. **BUG-S1 (low, a11y):** the Figma token input (`settings-figma-token-input`) has no `aria-label` or associated label; a screen reader cannot tell what it is. Reproduces on every run of the `keyboard-labels-and-console` test (the only expected FAIL).
2. **DIV-S2 (low, UX):** `Esc` with the BYOK key form open does not close or cancel the form; only "Cancel" closes it. Settings also stays open.
3. **DIV-S3 (info):** the bar's "Settings" button and the nav sidebar have no testid; navigation depends on exact text.
4. **DIV-S4 (info):** the org's initial tab opens on "Agents" (previous state) instead of "General" when coming from another section, on the first opening of the exploration.
5. The `tempo:*` keys only exist in localStorage after the 1st toggle (implicit default value = off).

## 4. Execution

```sh
cd qa && node run.mjs --suite 30-settings --profile qa-3
```
Suite: 12 tests. Run 1 (`/tmp/tempo-qa/runs/20261016-115634`): 11 PASS / 1 FAIL / 0 SKIP. Run 2 (`20261016-115707`): 11 PASS / 1 FAIL / 0 SKIP. The FAIL is always BUG-S1. Earlier (initial version): 6/2. Exploration: `--suite 30-settings/explore`. No unhandled exceptions; all changed data (toggles, theme, fake BYOK keys `sk-ant-QA-AUTO-fake`) was restored; teardown confirmed by `ps.mjs` (0 qa-3 processes).

## 5. Limits

- Not tested by rule: Billing/checkout, promo, tokens, Figma token, org delete/rename, invites, Linear/Slack OAuth, Machines, sign-out.
- No coverage of editing the org name/slug/logo, system prompt, concurrency and diagnostics (they change the shared account).
- Project settings and access requests need a local project/pending request, which the profile does not have.
- MCP, shortcuts, notifications and account do not exist in Settings in this version; they may be in other screens (avatar menu/palette), outside this suite.
- "Relaunch" was approximated by `page.reload()`; the full process relaunch was not repeated.
- The automatic SKIP (rec.skip) does not exist yet; blocks are recorded only here.
