# feature/

The mods. Each one is a `<name>.js` file, sometimes with a `<name>.css`, loaded into RE-TEMPO's renderer in the order set by `MODS` in `tools/inject-index.mjs`.

Most mods have an off switch in `localStorage` (for example `rtd.canvasKeys` set to `off`). `bin/` holds two helpers: `tempo-ui`, a CLI that lets an agent drive the UI, and `claude-usage-oauth.mjs`, which reads plan usage.

Edit live with `tools/start-live.sh` (see [REALTIME.md](REALTIME.md)). Every mod, with its API and off switch, is described in [docs/mods.md](../docs/mods.md).
