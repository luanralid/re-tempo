#!/bin/zsh
# tools/enable-zoom-shortcut.sh — Cmd+= triggers RE-TEMPO's native View > Zoom In.
# ---------------------------------------------------------------------------
# The app's menu binds Zoom In to Cmd+Shift+= ("Cmd++") only, so a plain Cmd+=
# does nothing (Cmd+- and Cmd+0 already work). This remaps the menu item with
# macOS App Shortcuts (NSUserKeyEquivalents), the same thing as System
# Settings > Keyboard > Keyboard Shortcuts > App Shortcuts. Native zoom scales
# the whole UI (webviews, canvas, terminal) and Electron persists the level.
#
# Usage:
#   tools/enable-zoom-shortcut.sh            apply (idempotent)
#   tools/enable-zoom-shortcut.sh --status   show the current mapping
#   tools/enable-zoom-shortcut.sh --undo     remove only this mapping
#
# Notes:
#   - App: $RE_TEMPO_APP, else $RE_TEMPO_BASE/RE-TEMPO.app (default ~/RE-TEMPO).
#   - Scope: the bundle id of RE-TEMPO.app (com.re-tempo.app), never the
#     original Tempo (com.tempolabs.tempo; refused). CFPreferences ignores
#     $HOME, so every RE-TEMPO instance shares it (isolated profiles too).
#   - Takes effect on the next launch of RE-TEMPO; open windows keep the old
#     shortcut until they are relaunched.
#   - Trade-off: Zoom In moves from Cmd+Shift+= to Cmd+= (a menu item has a
#     single shortcut).
# ---------------------------------------------------------------------------
set -e

APP="${RE_TEMPO_APP:-${RE_TEMPO_BASE:-$HOME/RE-TEMPO}/RE-TEMPO.app}"
ITEM="Zoom In"
KEY="@="   # @ = Cmd

ID="$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$APP/Contents/Info.plist" 2>/dev/null)" || {
  echo "ERROR: cannot read the bundle id of $APP"; exit 1; }
if [ "$ID" = "com.tempolabs.tempo" ]; then
  echo "ERROR: $APP has the original Tempo bundle id ($ID); refusing to touch it."; exit 1
fi

current() { defaults read "$ID" NSUserKeyEquivalents 2>/dev/null | sed -n "s/^ *\"$ITEM\" = \"\(.*\)\";$/\1/p"; }

case "${1:-}" in
  --status)
    cur="$(current)"
    if [ -n "$cur" ]; then echo "$ID: \"$ITEM\" = \"$cur\""; else echo "$ID: \"$ITEM\" not remapped (app default Cmd+Shift+=)"; fi
    ;;
  --undo)
    if [ -z "$(current)" ]; then echo "$ID: nothing to undo"; exit 0; fi
    # Remove only our entry; keep any other App Shortcuts of this app.
    TMP="$(mktemp -t re-tempo-prefs)"
    trap 'rm -f "$TMP"' EXIT
    defaults export "$ID" "$TMP"
    /usr/libexec/PlistBuddy -c "Delete :NSUserKeyEquivalents:${ITEM// /\\ }" "$TMP"
    if /usr/libexec/PlistBuddy -c "Print :NSUserKeyEquivalents" "$TMP" | grep -q " = "; then
      defaults import "$ID" "$TMP"
    else
      defaults delete "$ID" NSUserKeyEquivalents
    fi
    echo "$ID: \"$ITEM\" back to the app default (Cmd+Shift+=). Relaunch RE-TEMPO."
    ;;
  "")
    if [ "$(current)" = "$KEY" ]; then echo "$ID: \"$ITEM\" already on Cmd+= (no change)"; exit 0; fi
    defaults write "$ID" NSUserKeyEquivalents -dict-add "$ITEM" "$KEY"
    echo "$ID: \"$ITEM\" now on Cmd+=. Relaunch RE-TEMPO to apply. Undo: $0 --undo"
    ;;
  *)
    echo "usage: $0 [--status|--undo]"; exit 1
    ;;
esac
