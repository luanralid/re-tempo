# tools/

Dev helpers.

- `start-live.sh` is the live loop. It loads mods from `feature/` through a symlink, opens RE-TEMPO with DevTools on port 9333, and runs `live-reload.mjs`: CSS hot-swaps, JS reloads on save.
- `inject-index.mjs` writes the block in `index.html` that loads every mod, in `MODS` order. It is safe to rerun.
- `enable-zoom-shortcut.sh` maps Cmd+= to View > Zoom In. Add `--status` to check the current mapping.
