#!/bin/zsh
# install.sh — one command to get RE-TEMPO (your Tempo + this repo's mods) on this Mac.
# ---------------------------------------------------------------------------
# Usage: ./install.sh [--dev] [--rebuild] [--no-open]
#   --dev       mods load from this repo through a symlink (live editing with
#               tools/start-live.sh); default: copied into the app, so it keeps
#               working if this folder is moved or deleted
#   --rebuild   rebuild RE-TEMPO.app from Tempo even when it is up to date
#   --no-open   do not open RE-TEMPO at the end
# Env: RE_TEMPO_BASE (default ~/RE-TEMPO), TEMPO_APP (default /Applications/Tempo.app)
#
# Steps: prerequisites -> RE-TEMPO.app (scripts/bootstrap-local.sh, only when
# missing or built from another Tempo version) -> mods (scripts/apply-mods.sh)
# -> launchers (run-isolated.sh, RE-TEMPO.command) -> open. Rerunning updates the mods.
# Needs only Tempo: its own runtime runs the helper scripts (no Node.js install).
# Nothing is uploaded; the original Tempo and its data are not touched.
# ---------------------------------------------------------------------------
set -e
source "${0:A:h}/scripts/common.sh"

mode=build rebuild=0 open=1
for a in "$@"; do
  case "$a" in
    --dev) mode=dev ;;
    --rebuild) rebuild=1 ;;
    --no-open) open=0 ;;
    -h|--help) sed -n '2,18p' "${0:A}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option '$a' (see --help)" ;;
  esac
done

say "RE-TEMPO installer"
say "   repo:  $REPO"
say "   base:  $RE_TEMPO_BASE"

say "[1/5] prerequisites"
check_prereqs
export RE_TEMPO_PREREQS_OK=1

say "[2/5] RE-TEMPO.app"
if (( rebuild )) || needs_build; then
  "$REPO/scripts/bootstrap-local.sh"
else
  built="$(sed -n 's/^tempo_version=//p' "$BUILD_INFO" 2>/dev/null)"
  say "   $APP is up to date (built from Tempo ${built:-?}); --rebuild to rebuild it"
fi

say "[3/5] mods ($mode)"
"$REPO/scripts/apply-mods.sh" --$mode

say "[4/5] launchers"
install_launchers

say "[5/5] open"
if (( ! open )); then
  say "   skipped (--no-open). Open later: $RE_TEMPO_BASE/RE-TEMPO.command"
elif [ -n "$(app_pids)" ]; then
  say "   RE-TEMPO is already running; quit it and open $RE_TEMPO_BASE/RE-TEMPO.command to load the new mods"
else
  "$RE_TEMPO_BASE/RE-TEMPO.command" | sed 's/^/   /'
fi

say ""
say "Installed. Open RE-TEMPO any time with $RE_TEMPO_BASE/RE-TEMPO.command (double-click)"
say "or $RE_TEMPO_BASE/run-isolated.sh. It has its own profile: log in with your Tempo account there."
