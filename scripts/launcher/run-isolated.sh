#!/bin/zsh
# RE-TEMPO launcher (copied here by install.sh; reinstalling overwrites it).
# ---------------------------------------------------------------------------
# Opens the RE-TEMPO.app next to this file with its OWN isolated profile:
# HOME=_home and TEMPO_USER_DATA_DIR=_data-isolated, both next to this file.
# Your real Tempo (app, login and data) is not touched; log in once here.
#
#   CDP_PORT=9333 ./run-isolated.sh   also expose Chrome DevTools Protocol on that port
#   ./run-isolated.sh <args>          extra arguments go to the app
# ---------------------------------------------------------------------------
set -e
BASE="${0:A:h}"
APP="$BASE/RE-TEMPO.app"
[ -x "$APP/Contents/MacOS/Tempo" ] || { echo "RE-TEMPO.app not found in $BASE; run install.sh again." >&2; exit 1; }

export HOME="$BASE/_home"
export TEMPO_USER_DATA_DIR="$BASE/_data-isolated"
# Own local ports (Tempo's defaults are 17249 auth / 17252 web-capture), so RE-TEMPO
# can run while the original Tempo is open.
export TEMPO_AUTH_CALLBACK_PORT="${TEMPO_AUTH_CALLBACK_PORT:-17349}"
export TEMPO_WEB_CAPTURE_PORT="${TEMPO_WEB_CAPTURE_PORT:-17352}"
mkdir -p "$HOME" "$TEMPO_USER_DATA_DIR"

# Isolated keychain: with an empty HOME, Electron's safeStorage asks for a keychain on
# every launch ("Keychain Not Found"). One is created inside _home only; `security`
# runs with HOME=_home, so the real login keychain and its search list stay as they are.
KC_PW="$(cat "$BASE/.keychain-pw" 2>/dev/null || echo re-tempo-local)"
KC="$HOME/Library/Keychains/login.keychain-db"
mkdir -p "${KC:h}"
[ -f "$KC" ] || security create-keychain -p "$KC_PW" login.keychain
security set-keychain-settings login.keychain 2>/dev/null || true   # no auto-lock
security list-keychains   -d user -s "$KC" >/dev/null
security default-keychain -d user -s "$KC" >/dev/null
security unlock-keychain  -p "$KC_PW" login.keychain 2>/dev/null || true

# --user-data-dir too: Electron reads it at startup, before the app applies
# TEMPO_USER_DATA_DIR, so early files (Crashpad) also stay in the isolated profile.
args=(--user-data-dir="$TEMPO_USER_DATA_DIR")
[ -n "$CDP_PORT" ] && args+=(--remote-debugging-port="$CDP_PORT")
exec "$APP/Contents/MacOS/Tempo" "${args[@]}" "$@"
