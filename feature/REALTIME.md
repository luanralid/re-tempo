# REALTIME — edit the feature and see it in RE-TEMPO in real time

One command, then just save: you edit `feature/*.js` / `feature/*.css` **in this repository**
and the RE-TEMPO window updates by itself.

- **CSS** → instant *hot-swap*, **no reload** (screen state is preserved: an open panel
  stays open).
- **JS** → window *reload* (`Page.reload`), to re-run the module.

> This is not HMR of Tempo's source code. It is live reload of the **feature module** (`agent-runs-panel.*`),
> which the app now loads **straight from the repo** via a symlink. Tempo's minified bundle is not touched.

---

## Start (one command)

```sh
tools/start-live.sh
```

This:

1. ensures the symlink `…/out/renderer/mod` → `…/re-tempo/feature`
   (the app reads the feature **straight from the repo**);
2. idempotently injects `<link>` + `<script>` into the renderer's `index.html`
   (pointing to `./mod/…`, marked by a sentinel comment — running it again does not duplicate);
3. launches `RE-TEMPO.app` with `--remote-debugging-port=9333` in an **isolated profile**
   (`HOME` and `TEMPO_USER_DATA_DIR` under `~/RE-TEMPO/`) — Tempo's real profile is not touched;
4. starts the `tools/live-reload.mjs` watcher.

Leave that terminal open. In **another** terminal (or in the editor), edit
`feature/agent-runs-panel.css` or `feature/agent-runs-panel.js` and save.
The window reacts in ~1s. **Ctrl+C** stops the watcher and the app the script launched.

---

## How it works

```
you save feature/*.css|*.js
        │
        ▼
tools/live-reload.mjs  (fs.watch on the feature/ folder)
        │  discovers the target at  http://127.0.0.1:9333/json
        │  opens the devtools WebSocket (CDP)
        ├── .css → Runtime.evaluate: swaps the href of <link data-rar-css>
        │          with a cache-bust (?live=<ts>) → CSS re-fetch, NO reload
        └── .js  → Page.reload(ignoreCache) → module re-runs
```

Pieces:

- **`mod/` symlink** — `out/renderer/mod` points to the repo's `feature/`. So the `<script>`/`<link>`
  in `index.html` (`./mod/agent-runs-panel.*`) serve the **same file** you edit
  (same inode). Since RE-TEMPO runs **from the folder** (unpacked asar), there is no repack/re-signing.
- **zero-dependency watcher** — only `node:fs`, `node:http` and Node 24's global `WebSocket`.
  Nothing installed (no chokidar/ws/puppeteer).
- **CDP** — the app starts with DevTools on `127.0.0.1:9333`; the watcher speaks the Chrome DevTools Protocol
  through it.

---

## Troubleshooting

**Port 9333 busy / "address already in use"**
A RE-TEMPO (or another Chrome) is already using the port. Close the previous instance
(`cat ~/RE-TEMPO/_live-app.pid` and `kill -TERM <pid>`), or run with another port:
`CDP_PORT=9444 tools/start-live.sh`.

**The watcher says "app unreachable on port 9333"**
The app is still booting (the isolated profile is slow) or was closed. The watcher **reconnects
by itself**: as soon as the window opens, save the file again. Check the boot in
`~/RE-TEMPO/_live-app.log` (wait for `DevTools listening on ws://127.0.0.1:9333`).

**I saved the CSS and nothing changed**
The hot-swap swaps the feature's `<link>`; it only exists after the module has mounted. If the panel/launcher
has not appeared yet, the watcher warns ("no feature `<link>` on the page"). Edit a `.js` once
(forces a reload) or reload the window and try again. Also confirm that `index.html` has the
`RE-TEMPO LIVE-RELOAD` sentinel block.

**I saved the JS and the window did not reload**
Check the watcher log: if "Page.reload fired" appears but the screen does not change, the change may not be
visible (e.g. it renders nothing new). Test with something obvious, e.g. change a launcher text.

**The `mod/` symlink disappeared or points to the wrong place**
Run `tools/start-live.sh` again: it recreates/fixes the symlink. To check:
`ls -l ~/RE-TEMPO/RE-TEMPO.app/Contents/Resources/app/out/renderer/mod`.

**I want to put `index.html` back to its pre-live state**
There is a single backup at `…/out/renderer/index.html.pre-live-bak`. Restore it with
`mv …/index.html.pre-live-bak …/index.html` and, if you want, remove the `mod` symlink.

---

## Relationship with APPLY.md

`APPLY.md` describes the **static** mode (copying the files into the `.app`): good for
"freezing" the applied feature. For **development**, use this live mode — it loads the feature
from the repo via symlink, so what you save here is what the app runs, with nothing to copy.
