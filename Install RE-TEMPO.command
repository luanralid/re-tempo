#!/bin/zsh
# Double-click in Finder to install RE-TEMPO on this Mac (runs install.sh next to this file).
cd "${0:A:h}" || exit 1
./install.sh "$@"
rc=$?
echo
if (( rc == 0 )); then
  echo "Done. You can close this window."
else
  echo "Install failed (exit $rc); the message above says why. See README > Install on another Mac."
fi
exit $rc
