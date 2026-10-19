# scripts/common.sh — shared paths and helpers for the RE-TEMPO scripts (sourced by zsh).
# ---------------------------------------------------------------------------
# Nothing here is tied to one user: paths come from this repo's location and
# from $HOME. Overrides (env):
#   RE_TEMPO_BASE   where RE-TEMPO lives            (default ~/RE-TEMPO)
#   TEMPO_APP       the licensed Tempo to copy from (default /Applications/Tempo.app,
#                   else ~/Applications/Tempo.app)
#   RE_TEMPO_NODE   the Node that runs the helper scripts (default: Tempo itself, see tnode)
# ---------------------------------------------------------------------------

REPO="${${(%):-%x}:A:h:h}"

RE_TEMPO_BASE="${RE_TEMPO_BASE:-$HOME/RE-TEMPO}"
RE_TEMPO_BASE="${RE_TEMPO_BASE:a}"
export RE_TEMPO_BASE   # child scripts (and a HOME override after this) keep the same base

APP="$RE_TEMPO_BASE/RE-TEMPO.app"
RENDERER="$APP/Contents/Resources/app/out/renderer"
INDEX="$RENDERER/index.html"
BUILD_INFO="$RE_TEMPO_BASE/build-info.txt"

if [ -z "$TEMPO_APP" ]; then
  TEMPO_APP=/Applications/Tempo.app
  [ ! -d "$TEMPO_APP" ] && [ -d "$HOME/Applications/Tempo.app" ] && TEMPO_APP="$HOME/Applications/Tempo.app"
fi
TEMPO_EXPECTED_VERSION=0.0.121   # the Tempo build the mods were made against

# Only for the fallback below: a double-clicked .command may not see a Homebrew/user node.
for d in /opt/homebrew/bin /usr/local/bin "$HOME/.local/bin"; do
  [ -d "$d" ] && (( ! ${path[(Ie)$d]} )) && path+=("$d")
done

say()  { print -r -- "$*"; }
warn() { print -r -- "WARNING: $*" >&2; }
die()  { print -r -- "ERROR: $*" >&2; exit 1; }
stamp() { date +%Y%m%d-%H%M%S; }

# Moves $1 to $RE_TEMPO_BASE/_backup/<RUN_STAMP>/ and prints where it went. Never
# deletes and never nests into an existing folder (a free name is picked).
backup_move() {
  local src="$1" dir="$RE_TEMPO_BASE/_backup/${RUN_STAMP:-$(stamp)}"
  mkdir -p "$dir"
  local dst="$dir/${src:t}" n=1
  while [ -e "$dst" ] || [ -L "$dst" ]; do dst="$dir/${src:t}.$n"; n=$((n + 1)); done
  mv "$src" "$dst"
  print -r -- "$dst"
}

tempo_version() {
  /usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$1/Contents/Info.plist" 2>/dev/null
}

# True when the Electron app $1 has the RunAsNode fuse on, i.e. ELECTRON_RUN_AS_NODE=1
# turns its binary into plain Node. Read from the framework binary, never by launching
# the app: with the fuse off the variable is ignored and the whole app would start.
FUSE_SENTINEL=dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX   # then: wire version, fuse count, fuses
can_run_as_node() {
  local fw="$1/Contents/Frameworks/Electron Framework.framework/Electron Framework" off
  [ -f "$fw" ] || return 1
  off="$(LC_ALL=C /usr/bin/grep -obUa -m1 "$FUSE_SENTINEL" "$fw" 2>/dev/null | head -1 | cut -d: -f1)"
  [ -n "$off" ] && [ "$(/bin/dd if="$fw" bs=1 skip=$((off + ${#FUSE_SENTINEL} + 2)) count=1 2>/dev/null)" = 1 ]
}

# The Node that runs the helper scripts (extract-asar, inject-index, live-reload): Tempo's
# own Electron in Node mode, so nothing else has to be installed. RE_TEMPO_NODE overrides;
# a Node.js on PATH is the fallback if a future Tempo turns the fuse off.
node_bin() {
  [ -n "$RE_TEMPO_NODE" ] && { print -r -- "$RE_TEMPO_NODE"; return 0; }
  local a
  for a in "$TEMPO_APP" "$APP"; do
    can_run_as_node "$a" && { print -r -- "$a/Contents/MacOS/Tempo"; return 0; }
  done
  command -v node
}
tnode() {
  [ -n "$NODE_BIN" ] || NODE_BIN="$(node_bin)" ||
    die "cannot run the helper scripts: Tempo's RunAsNode fuse is off and Node.js is not installed (install Node 18+ from https://nodejs.org)."
  # ELECTRON_NO_ASAR: Electron's fs would otherwise open *.asar files as folders
  ELECTRON_RUN_AS_NODE=1 ELECTRON_NO_ASAR=1 "$NODE_BIN" "$@"
}

# pids of processes running from $APP (main + helpers); detection only, nothing is killed.
app_pids() {
  /bin/ps -axww -o pid=,command= | while read -r pid cmd; do
    [[ "$cmd" == "$APP/Contents/"* ]] && print -r -- "$pid"
  done
  return 0
}

# Prerequisites, with what to do when one is missing. Exits 1 on a blocker.
check_prereqs() {
  [ -n "$RE_TEMPO_PREREQS_OK" ] && return 0
  local fail=0 v major
  [ "$(uname -s)" = Darwin ] || die "RE-TEMPO needs macOS."
  if [ ! -d "$TEMPO_APP" ]; then
    print -r -- "ERROR: Tempo not found at $TEMPO_APP. Install Tempo first (https://tempo.new), or point TEMPO_APP=/path/to/Tempo.app." >&2
    fail=1
  elif [ ! -f "$TEMPO_APP/Contents/Resources/app.asar" ]; then
    print -r -- "ERROR: $TEMPO_APP has no Contents/Resources/app.asar; is it really Tempo?" >&2
    fail=1
  else
    v="$(tempo_version "$TEMPO_APP")"
    if [ "$v" = "$TEMPO_EXPECTED_VERSION" ]; then
      say "   Tempo $v at $TEMPO_APP"
    else
      warn "Tempo ${v:-(unknown version)} at $TEMPO_APP; the mods were made for $TEMPO_EXPECTED_VERSION. Installing anyway: most mods only touch the UI and usually keep working, but some may misbehave."
    fi
  fi
  if NODE_BIN="$(node_bin)"; then
    v="$(ELECTRON_RUN_AS_NODE=1 "$NODE_BIN" -p 'process.versions.node' 2>/dev/null)"
    major="${v%%.*}"
    if (( ${major:-0} < 18 )); then
      print -r -- "ERROR: $NODE_BIN runs Node ${v:-?}; 18 or newer is needed." >&2
      fail=1
    elif [[ "$NODE_BIN" == */Contents/MacOS/Tempo ]]; then
      say "   scripts run on Tempo's own runtime (Node $v); nothing else to install"
    else
      say "   scripts run on $NODE_BIN (Node $v)"
    fi
    export RE_TEMPO_NODE="$NODE_BIN"   # child scripts skip the fuse check
  else
    print -r -- "ERROR: cannot run the helper scripts: this Tempo's RunAsNode fuse is off and Node.js is not installed. Install Node 18+ (https://nodejs.org) and run again." >&2
    fail=1
  fi
  for t in codesign xattr plutil ditto security; do
    command -v "$t" >/dev/null 2>&1 || { print -r -- "ERROR: '$t' not found (it ships with macOS; try 'xcode-select --install')." >&2; fail=1; }
  done
  local parent="$RE_TEMPO_BASE"
  while [ ! -d "$parent" ]; do parent="${parent:h}"; done
  local free_kb="$(/bin/df -Pk "$parent" | awk 'NR==2 {print $4}')"
  (( ${free_kb:-0} < 2 * 1024 * 1024 )) && warn "less than 2 GB free on the disk of $RE_TEMPO_BASE; the build may run out of space."
  (( fail )) && exit 1
  return 0
}

# true when RE-TEMPO.app is missing, incomplete, or was built from another Tempo version.
needs_build() {
  [ -x "$APP/Contents/MacOS/Tempo" ] && [ -f "$INDEX" ] || return 0
  [ -f "$BUILD_INFO" ] || return 1   # older build without build-info: keep it (use --rebuild)
  local built="$(sed -n 's/^tempo_version=//p' "$BUILD_INFO")"
  [ "$built" != "$(tempo_version "$TEMPO_APP")" ]
}

# Copies the launchers next to RE-TEMPO.app (run-isolated.sh + RE-TEMPO.command).
install_launchers() {
  local f
  for f in run-isolated.sh RE-TEMPO.command; do
    cp "$REPO/scripts/launcher/$f" "$RE_TEMPO_BASE/$f"
    chmod 755 "$RE_TEMPO_BASE/$f"
  done
  say "   launchers: $RE_TEMPO_BASE/run-isolated.sh and $RE_TEMPO_BASE/RE-TEMPO.command"
}
