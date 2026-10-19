#!/bin/zsh
# package-release.sh — zips this repo's OWN files for another Mac: dist/re-tempo-<version>.zip
# ---------------------------------------------------------------------------
# Usage: scripts/package-release.sh [version]   (default: <yyyymmdd>-<short sha>[-dirty])
#
# Contents: install.sh, "Install RE-TEMPO.command", TESTING.md, README.md, feature/ (the mods),
# scripts/ and tools/, as git sees them (tracked + new files, minus .gitignore),
# under one top folder re-tempo-<version>/. Not a single byte of Tempo: the
# list is checked before and after zipping, and anything that looks like the
# app (asar, .app bundles, renderer bundles, node_modules, big files) stops it.
# Only writes the zip; publishes nothing.
# ---------------------------------------------------------------------------
set -e
setopt pipefail
REPO="${0:A:h:h}"
cd "$REPO"

INCLUDE=(install.sh "Install RE-TEMPO.command" TESTING.md README.md feature scripts tools)
dirty=""
[ -n "$(git status --porcelain -- $INCLUDE)" ] && dirty=-dirty
VERSION="${1:-$(date +%Y%m%d)-$(git rev-parse --short HEAD)$dirty}"
NAME="re-tempo-$VERSION"
OUT="$REPO/dist/$NAME.zip"

files=()
for f in "${(@f)$(git ls-files --cached --others --exclude-standard -- $INCLUDE)}"; do
  [ -f "$f" ] && files+=("$f")   # skip tracked files deleted from the working tree
done
(( ${#files} )) || { echo "ERROR: nothing to package" >&2; exit 1; }

FORBIDDEN='(^|/)(app\.asar|[^/]+\.app/|node_modules/|out/renderer/|extracted/|_home/|_data[^/]*/)|\.(asar|cjsc|node|dylib)$'
check_list() {
  local bad
  bad="$(print -rl -- "$@" | grep -E "$FORBIDDEN" || true)"
  [ -z "$bad" ] || { echo "ERROR: refusing to package files that look like Tempo:" >&2; print -r -- "$bad" >&2; exit 1; }
}
check_list "${files[@]}"
for f in "${files[@]}"; do
  (( $(stat -f %z "$f") <= 1024 * 1024 )) || { echo "ERROR: $f is over 1 MB; not a mod file, not packaging it." >&2; exit 1; }
done

# zip through a symlink named re-tempo-<version> -> repo, so the archive has one top
# folder without copying anything
mkdir -p "$REPO/dist"
TMP="$(mktemp -d -t re-tempo-pkg)"
ln -s "$REPO" "$TMP/$NAME"
( cd "$TMP" && print -rl -- "${files[@]/#/$NAME/}" | zip -q -X "$TMP/out.zip" -@ )
mv -f "$TMP/out.zip" "$OUT"
rm "$TMP/$NAME"
rmdir "$TMP"

entries=("${(@f)$(zipinfo -1 "$OUT")}")
check_list "${entries[@]}"
echo "$OUT"
echo "   ${#entries} files, $(du -h "$OUT" | cut -f1 | tr -d ' '); version $VERSION"
echo "   top level: $(print -rl -- "${entries[@]}" | cut -d/ -f2 | sort -u | tr '\n' ' ')"
