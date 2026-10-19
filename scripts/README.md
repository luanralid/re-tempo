# scripts/

What `install.sh` runs. You rarely call these directly.

- `bootstrap-local.sh` builds `~/RE-TEMPO/RE-TEMPO.app` from your Tempo. It clones the app, unpacks it with `extract-asar.mjs`, renames it, turns off auto-update and re-signs it. Anything it replaces is moved to `_backup/`.
- `apply-mods.sh --build|--dev` copies or symlinks `feature/` into the app and wires up `index.html`.
- `launcher/` has `run-isolated.sh` and `RE-TEMPO.command`, which are copied next to the app. `common.sh` holds shared paths and helpers. The helper scripts run on Tempo's own runtime.
- `package-release.sh` writes `dist/re-tempo-<version>.zip` with this repo's files only.
