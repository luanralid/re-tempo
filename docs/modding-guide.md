# How to mod RE-TEMPO

A local, editable, renamed copy of your own Tempo.app, for study and modding.
Authorized reverse engineering of your own app. **Local use only, do not redistribute.**
The original `Tempo.app` in `/Applications` stays **intact**.

---

## 1. Where the editable code lives

```
~/RE-TEMPO/RE-TEMPO.app/Contents/Resources/app/
├── package.json                 # "main": "out/main/index.cjs"
├── out/
│   ├── renderer/                # <<< EDITABLE: the interface (HTML/JS/CSS)
│   │   ├── index.html           # UI entry point
│   │   └── assets/              # 183 .js/.css bundles + images
│   ├── main/                    # main process — BYTECODE (.cjsc), NOT editable
│   └── preload/                 # preloads — BYTECODE (.cjsc), NOT editable
├── node_modules/                # includes native binaries (*.node) and CLIs
└── cursor-cli/                  # native binaries
```

- **Truly editable:** everything in `Resources/app/out/renderer/`. It is JavaScript/HTML/CSS
  bundled by Vite (hashed names, e.g. `index-D2Ui1vc0.js`). You can open, read,
  change and save it directly.
- **Not editable as source:** `out/main/*.cjsc` and `out/preload/*.cjsc` are **V8 bytecode**
  (the `.cjs` files next to them are just 73-byte stubs that load the `.cjsc`). See section 5
  for extending that side without editing the bytecode.

## 2. The edit loop (no repack)

The app runs from the **folder** `Resources/app/` (not from an `.asar`), because Electron's fuses
(`OnlyLoadAppFromAsar=OFF`, `EnableEmbeddedAsarIntegrityValidation=OFF`) allow
it. So **there is nothing to repack**:

1. Edit a file in `Resources/app/out/renderer/`.
2. Relaunch the app (section 3).
3. The change shows up. Done.

> If macOS complains about the signature after editing, re-sign (section 6). For local use,
> it is normally not needed after every edit.

## 3. Two ways to open it

### A) Normal mode — REAL profile, SIGNED IN (to use as an app)
Open `RE-TEMPO.app` from Finder (double-click `~/RE-TEMPO/RE-TEMPO.app`) or run the
binary directly. It uses the **same profile as the real Tempo** (`~/Library/Application Support/Tempo`),
so it comes up **signed in** with your session. Use this mode when you want the app working for real.

```sh
"$HOME/RE-TEMPO/RE-TEMPO.app/Contents/MacOS/Tempo"
```

> Warning: in this mode RE-TEMPO shares data with the real Tempo. Do not run both at
> the same time on the same profile.

### B) Isolated mode — its OWN profile, SIGNED OUT (to study/mod/capture) — **recommended**
Use the wrapper `~/RE-TEMPO/run-isolated.sh`. It isolates **both** sides that define the session:

- Its own empty `HOME` (`~/RE-TEMPO/_home`) → there is no `~/.tempo-auth.json` → the app opens
  **signed out** (the login token lives in HOME, not in userData).
- `TEMPO_USER_DATA_DIR=~/RE-TEMPO/_data-isolated` → its own userData → the real profile
  `~/Library/Application Support/Tempo` **is not touched**.

These environment variables **survive the relaunch** the app does at boot (CLI flags
alone do not), and the script's `BASE` is fixed so it does not depend on the HOME it swaps.

```sh
~/RE-TEMPO/run-isolated.sh            # opens isolated and signed out, DevTools on port 9333
~/RE-TEMPO/run-isolated.sh --flag...  # extra Electron flags go along
```

- Expected confirmation in the log: `Using override userData dir: .../RE-TEMPO/_data-isolated` and
  `cold-start: no stored auth (signed out)`.
- **Note:** with HOME swapped, your shell config (`~/.zshrc`, `~/.nvm`, PATH) is not
  seen and the app falls back to the embedded Node toolchain. Expected for an isolated study boot.

### DevTools (applies to both modes)
Pass `--remote-debugging-port=9333` (the wrapper already does). Boot is slow (it resolves the shell env,
the Node toolchain, auth); wait for the line `DevTools listening on ws://127.0.0.1:9333`. Then:
`http://localhost:9333` in your personal browser, or `curl -s http://localhost:9333/json`.
To quit: `osascript -e 'quit app "RE-TEMPO"'` or `pkill -TERM -f '/RE-TEMPO/RE-TEMPO.app'`
(no `-9` first).

## 4. Why main and preload are not editable

Tempo's build compiles the main process and the preloads to **V8 bytecode** (`.cjsc`) through a custom
loader. Bytecode is not source code: there is no readable JS to change, and recompiling
would need the original source (which we do not have). So `out/main/` and `out/preload/` are black boxes.

## 5. How to extend the non-editable side (on top)

Without touching the bytecode, you can inject behavior:

- **In the renderer (easiest):** all of `out/renderer/` is yours. Add a `<script>` to
  `index.html` or edit the bundles in `assets/` to run your code in the UI context
  (`window.tempoDebug` is accessible in several places). Proof example already applied: a
  `<!-- RE-TEMPO build -->` comment at the top of `index.html`'s `<body>`.
- **Via an additional preload (concept):** the main process creates windows with
  `webPreferences.preload`. Since main is bytecode, you cannot change that path directly;
  the alternative is to intercept in the renderer (the original preload exposes APIs on `window`) and
  wrap them with your own script loaded by `index.html`. That way you observe/extend
  the exposed IPC bridges without recompiling main.
- **Native binaries/CLIs:** they live in `app/node_modules/...*.node` and `app/cursor-cli/`,
  `app/node_modules/@anthropic-ai`, `@openai`, etc. They are arm64 Mach-O, inspectable, not source.

### Practical example: a new visible feature (renderer)

File to edit:
`~/RE-TEMPO/RE-TEMPO.app/Contents/Resources/app/out/renderer/index.html`.
Right before `</body>`, add a `<script>` that creates a fixed on-screen "badge" and a shortcut
(Cmd+Shift+Y) that shows/hides it:

```html
<script>
  window.addEventListener("DOMContentLoaded", () => {
    const badge = document.createElement("div");
    badge.textContent = "RE-TEMPO";
    badge.style.cssText =
      "position:fixed;bottom:10px;right:10px;z-index:999999;padding:4px 8px;" +
      "font:600 11px system-ui;color:#fff;background:#7c3aed;border-radius:6px;" +
      "box-shadow:0 1px 4px rgba(0,0,0,.3);pointer-events:none;opacity:.9";
    document.body.appendChild(badge);
    // shortcut Cmd+Shift+Y: toggles the badge
    window.addEventListener("keydown", (e) => {
      if (e.metaKey && e.shiftKey && e.code === "KeyY") {
        badge.style.display = badge.style.display === "none" ? "" : "none";
      }
    });
  });
</script>
```

Edit loop: save the file → relaunch (`run-isolated.sh` or double-click) → the "RE-TEMPO"
badge appears in the bottom-right corner; Cmd+Shift+Y toggles it. No repack. If macOS
complains about the signature, re-sign (section 6). To revert, delete the `<script>`.

## 6. Re-sign ad-hoc after editing

The copy is signed **ad-hoc** (no Apple Developer ID, no notarization — normal for a locally
modified build). Editing files can invalidate the seal. If macOS complains ("app is damaged"
or refuses to open), re-sign:

```sh
codesign --force --sign - "$HOME/RE-TEMPO/RE-TEMPO.app"
codesign --verify --verbose "$HOME/RE-TEMPO/RE-TEMPO.app"      # check
```

If you changed nested helpers/frameworks, use `--deep`:

```sh
codesign --force --deep --sign - "$HOME/RE-TEMPO/RE-TEMPO.app"
```

If Gatekeeper flags quarantine (download), clear the xattrs first: `xattr -cr <.app>`.

## 7. Names and identity

The copy was renamed to **RE-TEMPO** including in the menu bar:

- `CFBundleName` = `RE-TEMPO`, `CFBundleDisplayName` = `RE-TEMPO`, `CFBundleIdentifier` =
  `com.re-tempo.app`. `CFBundleExecutable` stays `Tempo` (it is only the binary file's name).
- **The 4 helpers were renamed** to `RE-TEMPO Helper.app`, `RE-TEMPO Helper (GPU).app`,
  `RE-TEMPO Helper (Plugin).app`, `RE-TEMPO Helper (Renderer).app` (folder + executable +
  `CFBundleExecutable` + id `com.re-tempo.app.helper*`). This is **mandatory**: Electron
  derives the helpers' names from `CFBundleName`; if you change `CFBundleName` to `RE-TEMPO`
  without renaming the helpers, the app crashes with `Unable to find helper app`. Always re-sign
  (`--deep`) after touching names.

## 8. Auto-update

Off: `Resources/app-update.yml` → `app-update.yml.disabled`. Without the file,
`electron-updater` only logs an error and does not update; the copy does not overwrite itself. To re-enable
(not recommended), rename it back.

## 9. Remove everything

```sh
rm -rf "$HOME/RE-TEMPO"
```

Deletes the copy, the `.asar` backup, the `_data`/`_data-isolated` profiles and the logs. The original
`Tempo.app` and `~/Library/Application Support/Tempo` are not touched by this command.

---

**Warnings:** build without an Apple signature, for local use and study; do not redistribute. Login
and BYOK are kept as in the original (no bypassing payment/license). The original Tempo remains
intact in `/Applications/Tempo.app`.
