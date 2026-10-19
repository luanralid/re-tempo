#!/bin/zsh
# bootstrap-local.sh — builds a locally EDITABLE RE-TEMPO.app from YOUR licensed Tempo
# (default /Applications/Tempo.app) into $RE_TEMPO_BASE (default ~/RE-TEMPO).
# Uploads and downloads nothing and needs nothing installed besides Tempo (its own
# runtime runs the helper scripts); never touches the original Tempo or its data.
#
# Safe to rerun: the new app is built in $RE_TEMPO_BASE/_staging and replaces
# RE-TEMPO.app only at the end; the previous app is MOVED (never deleted) to
# $RE_TEMPO_BASE/_backup/<time>/. Refuses while that RE-TEMPO is running.
# Mods are applied separately: scripts/apply-mods.sh (install.sh does both).
#
#   RE_TEMPO_BASE=/path   build somewhere else    TEMPO_APP=/path/Tempo.app   other source
set -e
source "${0:A:h}/common.sh"

check_prereqs
RUN_STAMP="$(stamp)"
STAGE_DIR="$RE_TEMPO_BASE/_staging"
STAGE="$STAGE_DIR/RE-TEMPO.app"
SRES="$STAGE/Contents/Resources"
TEMPO_VERSION="$(tempo_version "$TEMPO_APP")"

running="$(app_pids)"
[ -z "$running" ] || die "RE-TEMPO at $APP is running (pid ${running//$'\n'/ }); quit it and run again."

mkdir -p "$RE_TEMPO_BASE"
[ -e "$STAGE_DIR" ] && say "   leftover of an interrupted build moved to $(backup_move "$STAGE_DIR")"
mkdir -p "$STAGE_DIR"

say "1/6 copying $TEMPO_APP (APFS clone, almost no disk)..."
ditto --clone "$TEMPO_APP" "$STAGE" 2>/dev/null || ditto "$TEMPO_APP" "$STAGE"

say "2/6 extracting app.asar into an editable app/ folder..."
tnode "$REPO/scripts/extract-asar.mjs" "$SRES/app.asar" "$SRES/app"   # Node = Tempo itself
# Electron prefers app.asar over app/: move the archive (and its .unpacked) out of the bundle
backup_move "$SRES/app.asar" >/dev/null
[ -d "$SRES/app.asar.unpacked" ] && backup_move "$SRES/app.asar.unpacked" >/dev/null

say "3/6 renaming to RE-TEMPO (app + helpers)..."
PL="$STAGE/Contents/Info.plist"
plutil -replace CFBundleDisplayName -string RE-TEMPO "$PL"
plutil -replace CFBundleName        -string RE-TEMPO "$PL"
plutil -replace CFBundleIdentifier  -string com.re-tempo.app "$PL"
# the helpers derive their name from CFBundleName; rename them to avoid a crash
for happ in "$STAGE/Contents/Frameworks/"Tempo\ Helper*.app(N); do
  h="${happ:t:r}"
  new="RE-TEMPO ${h#Tempo }"
  mv "$happ" "${happ:h}/$new.app"
  mv "${happ:h}/$new.app/Contents/MacOS/$h" "${happ:h}/$new.app/Contents/MacOS/$new" 2>/dev/null || true
  hpl="${happ:h}/$new.app/Contents/Info.plist"
  plutil -replace CFBundleExecutable -string "$new" "$hpl" 2>/dev/null || true
  plutil -replace CFBundleName       -string "$new" "$hpl" 2>/dev/null || true
done

say "4/6 disabling auto-update..."
[ -f "$SRES/app-update.yml" ] && mv "$SRES/app-update.yml" "$SRES/app-update.yml.disabled"

say "5/6 re-signing ad-hoc (takes a minute)..."
xattr -cr "$STAGE"
codesign --force --deep --sign - "$STAGE"
codesign --verify --deep --strict "$STAGE" && say "   codesign OK"

say "6/6 putting the new RE-TEMPO.app in place..."
[ -e "$APP" ] && say "   previous RE-TEMPO.app moved to $(backup_move "$APP")"
mv "$STAGE" "$APP"
rmdir "$STAGE_DIR"
print -r -- "tempo_version=$TEMPO_VERSION
tempo_app=$TEMPO_APP
built_at=$(date '+%Y-%m-%d %H:%M:%S %z')
repo=$REPO" > "$BUILD_INFO"
install_launchers

say "DONE: $APP (from Tempo $TEMPO_VERSION). Next: scripts/apply-mods.sh, or ./install.sh for everything."
