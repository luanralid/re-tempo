#!/bin/zsh
# apply-mods.sh — puts this repo's mods (feature/) into RE-TEMPO's renderer and wires index.html.
# ---------------------------------------------------------------------------
# Usage: scripts/apply-mods.sh [--build | --dev]
#   --build (default)  COPY feature/ to out/renderer/mod: the app works without the repo
#   --dev              SYMLINK out/renderer/mod -> <repo>/feature, for live editing
#                      (tools/start-live.sh uses this)
# Then tools/inject-index.mjs writes the <link>/<script> block into index.html.
# Rerunnable; whatever it replaces is MOVED to $RE_TEMPO_BASE/_backup/<time>/.
# ---------------------------------------------------------------------------
set -e
setopt pipefail
source "${0:A:h}/common.sh"

mode=build
case "${1:-}" in
  ""|--build) ;;
  --dev) mode=dev ;;
  *) die "usage: $0 [--build|--dev]" ;;
esac

FEATURE="$REPO/feature"
MOD="$RENDERER/mod"
[ -f "$INDEX" ] || die "no RE-TEMPO renderer at $RENDERER; run ./install.sh (or scripts/bootstrap-local.sh) first."
[ -d "$FEATURE" ] || die "$FEATURE does not exist"
RUN_STAMP="$(stamp)"

if [ "$mode" = dev ]; then
  if [ -L "$MOD" ] && [ "$(readlink "$MOD")" = "$FEATURE" ]; then
    say "   mod -> $FEATURE (already)"
  else
    if [ -e "$MOD" ] || [ -L "$MOD" ]; then say "   previous mod/ moved to $(backup_move "$MOD")"; fi
    ln -s "$FEATURE" "$MOD"
    say "   symlink mod -> $FEATURE (live editing)"
  fi
else
  if [ -d "$MOD" ] && [ ! -L "$MOD" ] && diff -rq "$FEATURE" "$MOD" >/dev/null 2>&1; then
    say "   mod/ already matches $FEATURE (copy)"
  else
    NEW="$RENDERER/.mod-new"
    if [ -e "$NEW" ] || [ -L "$NEW" ]; then backup_move "$NEW" >/dev/null; fi
    ditto "$FEATURE" "$NEW"
    xattr -cr "$NEW" 2>/dev/null || true   # drop the download quarantine of a zipped repo
    if [ -e "$MOD" ] || [ -L "$MOD" ]; then say "   previous mod/ moved to $(backup_move "$MOD")"; fi
    mv "$NEW" "$MOD"
    say "   copied feature/ -> mod/ ($(ls "$MOD" | grep -c '\.js$') js files)"
  fi
fi

FEATURE_DIR="$FEATURE" tnode "$REPO/tools/inject-index.mjs" "$INDEX" | sed 's/^/   /'
say "   index.html loads $(grep -c '<script src="./mod/' "$INDEX") mod scripts and $(grep -c 'href="./mod/' "$INDEX") stylesheets"
