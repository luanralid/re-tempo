#!/bin/zsh
# tools/start-live.sh — ONE command for the RE-TEMPO live loop.
# ---------------------------------------------------------------------------
# Edit feature/*.js|*.css in the REPO and watch the RE-TEMPO window update in
# real time: CSS hot-swaps (no reload), JS reloads.
#
# What this script does:
#   (a) ensures the symlink  out/renderer/mod -> <repo>/feature   (app reads from the repo)
#   (b) injects <link>+<script> into index.html (idempotent, marked by a sentinel)
#       (a)+(b) = scripts/apply-mods.sh --dev; a copied mod/ (install.sh) is moved
#       to $RE_TEMPO_BASE/_backup/ and replaced by the symlink
#   (c) launches RE-TEMPO.app with --remote-debugging-port=9333 (ISOLATED PROFILE)
#   (d) starts tools/live-reload.mjs (watcher, in the foreground)
#
# Paths: the repo is where this script lives; RE-TEMPO is at $RE_TEMPO_BASE
# (default ~/RE-TEMPO, see scripts/common.sh).
# ISOLATED PROFILE: HOME and TEMPO_USER_DATA_DIR point to folders under $RE_TEMPO_BASE,
# same as run-isolated.sh. The REAL profile (~/Library/Application Support/Tempo)
# is NOT touched. Ctrl+C stops the watcher and the app this script launched.
# ---------------------------------------------------------------------------
set -e

source "${0:A:h:h}/scripts/common.sh"   # REPO, RE_TEMPO_BASE, APP, RENDERER, INDEX
BASE="$RE_TEMPO_BASE"
PORT="${CDP_PORT:-9333}"

# --- (a)+(b) mods from the repo: symlink mod/ -> feature/, inject index.html ---
# (before HOME changes below; RE_TEMPO_BASE is exported, so it stays the same)
[ -x "$APP/Contents/MacOS/Tempo" ] || { echo "ERROR: RE-TEMPO binary not found at $APP (run ./install.sh --dev)"; exit 1; }
echo "[a+b] mods from the repo (symlink + index.html)"
"$REPO/scripts/apply-mods.sh" --dev

# Isolated profile (does not touch Tempo's real data). Survives the boot relaunch.
export HOME="$BASE/_home"
export TEMPO_USER_DATA_DIR="$BASE/_data-isolated"
mkdir -p "$HOME" "$TEMPO_USER_DATA_DIR"

# --- (a0) isolated keychain: avoids the "Keychain Not Found" dialog ----------
# With an isolated, empty HOME, Electron's safeStorage cannot find where to store the
# "Tempo Key" and opens a dialog on every launch. We create a keychain ONLY in here
# (does NOT touch the user's real keychain). Throwaway local password.
# Password read from $BASE/.keychain-pw (outside git, chmod 600); without the file, uses the default.
KC_PW="$(cat "$BASE/.keychain-pw" 2>/dev/null || echo re-tempo-local)"
KC_DIR="$HOME/Library/Keychains"
KC="$KC_DIR/login.keychain-db"
mkdir -p "$KC_DIR"
if [ ! -f "$KC" ]; then
  security create-keychain -p "$KC_PW" login.keychain
  echo "[a0] isolated keychain created"
else
  echo "[a0] isolated keychain already exists"
fi
security set-keychain-settings login.keychain || true      # no auto-lock
security list-keychains   -d user -s "$KC" >/dev/null
security default-keychain -d user -s "$KC" >/dev/null
security unlock-keychain  -p "$KC_PW" login.keychain 2>/dev/null || true

# --- (c) launch the app with remote debugging -----------------------------------
APP_PID=""
cleanup() {
  if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
    echo "\n[end] stopping RE-TEMPO (pid $APP_PID)…"
    kill -TERM "$APP_PID" 2>/dev/null || true
  fi
}
trap cleanup INT TERM EXIT

echo "[c] launching RE-TEMPO (isolated profile) with DevTools on port $PORT…"
"$APP/Contents/MacOS/Tempo" --remote-debugging-port="$PORT" >"$BASE/_live-app.log" 2>&1 &
APP_PID=$!
echo "$APP_PID" > "$BASE/_live-app.pid"
echo "    app pid: $APP_PID   (log: $BASE/_live-app.log)"

# --- (d) watcher in the foreground -----------------------------------------
echo "[d] starting the watcher…"
CDP_PORT="$PORT" tnode "$REPO/tools/live-reload.mjs"   # Node = Tempo itself (scripts/common.sh)
