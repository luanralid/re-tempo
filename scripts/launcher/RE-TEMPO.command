#!/bin/zsh
# Double-click to open RE-TEMPO (isolated profile, see run-isolated.sh). The app keeps running
# after this window closes; its log goes to _app.log next to this file.
BASE="${0:A:h}"
nohup "$BASE/run-isolated.sh" "$@" >>"$BASE/_app.log" 2>&1 &!
echo "RE-TEMPO is starting (log: $BASE/_app.log). You can close this window."
