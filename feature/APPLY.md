# How to apply the Agent Runs feature to RE-TEMPO

Feature: a floating **Agent Runs** panel that reads the agent runs of the **already logged-in**
account (reusing the app's real session) and shows the total, a breakdown by status, the average
duration and the summed cost. **Read-only**: no Convex mutation/write is called.

Feature files (this repository, 100% original work):
- `feature/agent-runs-panel.js` — the module (UI + data + shortcut). Self-contained.
- `feature/agent-runs-panel.css` — styles scoped under `[data-rar-root]` (`rar-` prefix).

> The module is injected into the **RE-TEMPO renderer** (the editable copy of your own Tempo).
> None of Tempo's code is versioned here; only the module above.

---

## 1. Copy the two files into the renderer

```sh
R="$HOME/RE-TEMPO/RE-TEMPO.app/Contents/Resources/app/out/renderer"
cp feature/agent-runs-panel.js  "$R/agent-runs-panel.js"
cp feature/agent-runs-panel.css "$R/agent-runs-panel.css"
```

The `.css` must sit **next to** the `.js` with the same base name: the module loads its own
CSS from `document.currentScript.src` (swapping `.js` for `.css`). Alternative: define
`window.__RAR_CSS_URL__` before the script.

## 2. Inject ONE line into `index.html` (minimal, reversible edit)

File:
`~/RE-TEMPO/RE-TEMPO.app/Contents/Resources/app/out/renderer/index.html`

Right **before** `</body>`, add:

```html
    <!-- RE-TEMPO · Agent Runs feature -->
    <script src="./agent-runs-panel.js"></script>
```

### Exact diff applied (confirmed at runtime)

```diff
   <body>
     <!-- RE-TEMPO build -->
     <div id="root"></div>
+    <!-- RE-TEMPO · Agent Runs feature -->
+    <script src="./agent-runs-panel.js"></script>
   </body>
```

Since RE-TEMPO runs **from the folder** (no repack/asar), just save and relaunch the app. No
repacking, no re-signing (normally not needed for local use; if macOS complains, see
`docs/modding-guide.md` §6).

## 3. Use

- Floating **"Agent Runs"** button in the bottom-right corner, or the **⌘⇧A** shortcut (Cmd+Shift+A).
- `Esc` or a click on the backdrop closes it. "Try again" button in the error state.

## 4. Revert

Option A (restore the index.html backup created on first apply):

```sh
R="$HOME/RE-TEMPO/RE-TEMPO.app/Contents/Resources/app/out/renderer"
mv "$R/index.html.rar-bak" "$R/index.html"      # if the backup exists
rm -f "$R/agent-runs-panel.js" "$R/agent-runs-panel.css"
```

Option B (manual): delete the 2 lines from step 2 in `index.html` and remove the 2 files.

---

## How the feature talks to the backend (logged-in session reuse)

At runtime, `callConvex(name, args)` tries, in this order:

1. **The app's logged-in Convex client** — the module finds the already-authenticated
   `ConvexReactClient` in the React tree (a fiber sweep looking for an object with `query` +
   `watchQuery`) and calls `client.query(ref, args)`, where `ref = { [Symbol.for("functionName")]: name }`.
   It is the user's **same logged-in WebSocket**. **This was the path used in the test**
   (`window.__RE_TEMPO_AGENT_RUNS_VIA__ === "live-convex-client"`).
2. **HTTP fallback + session token** — if the client is not found, it gets the token via
   `window.authBridge.getToken()` (preload bridge) and does
   `POST https://greedy-jackal-526.convex.cloud/api/query`. The token is **never** stored,
   logged or sent outside the app's own backend.

Queries read (all are read **queries** of Tempo's Convex):

| Convex function                       | What for |
|---------------------------------------|----------|
| `agentRuns:listMyActiveRuns`          | the user's active runs |
| `agentRuns:listMyRecentlyFailedRuns`  | the user's recent failures |
| `organizations:getUserOrganizations`  | active org (to sweep the history) |
| `agents:listMyAgents`                 | the user's agents in the org |
| `agentRuns:listRunsForAgent`          | per-agent history (cost/duration) |

Aggregated fields: `status` (breakdown by status), `durationMs` or
`completedAt−startedAt` (average duration), and `costUsd`/`cost`/`costCents` (summed cost).
No mutation (`claimRun`, `markRun*`, `failRun*`, `cancel*`, `reap*`, `revive*`,
`runAgentManually`) is called.

## Automation/preview hooks (exposed on `window`)

- `__RE_TEMPO_AGENT_RUNS_OPEN__()` / `__RE_TEMPO_AGENT_RUNS_CLOSE__()` — open/close.
- `__RE_TEMPO_AGENT_RUNS_LAST__` — last **aggregated** summary (no personal data).
- `__RE_TEMPO_AGENT_RUNS_VIA__` — data path used.
- `__RE_TEMPO_AGENT_RUNS_PREVIEW__(summary)` — **demo**: renders the populated layout from
  a synthetic summary, **without** touching the backend (used for the preview screenshot).
