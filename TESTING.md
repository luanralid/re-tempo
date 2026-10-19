# Testing RE-TEMPO

RE-TEMPO is your own Tempo plus a layer of UI mods, installed as a separate app with its own profile. Your Tempo app, account and data stay as they are.

## You need

- A Mac with Apple Silicon and Tempo in `/Applications`, ideally 0.0.121 (Tempo > About Tempo).
- About 1 GB of free disk. Nothing else.

## Install

1. Unzip `re-tempo-<version>.zip`.
2. Double-click `Install RE-TEMPO.command` in the unzipped folder. About a minute; RE-TEMPO opens at the end.
3. Log in with your Tempo account. Approve in the browser; if it offers to open "Tempo", cancel. The login comes back to RE-TEMPO on its own.

**macOS blocks it?** System Settings > Privacy & Security > Open Anyway, or right-click the file > Open > Open. Still blocked: `xattr -dr com.apple.quarantine ~/Downloads/re-tempo-<version>` (use the folder's real path), then double-click again.

## Try it

- **Agents on the canvas:** leave a comment on a canvas. An agent picks it up with its own cursor.
- **Deploy from the canvas:** type a request in the canvas bar, press Enter. A new agent joins the stack.
- **Voice input:** click the mic in the composer and talk (macOS 26+).
- **Plan usage:** hover the usage line at the bottom of the sidebar.

## Open it again

Double-click `~/RE-TEMPO/RE-TEMPO.command` (Finder: Go > Home > RE-TEMPO). Not `RE-TEMPO.app`: that uses your normal Tempo profile.

## Uninstall

Quit RE-TEMPO, move `~/RE-TEMPO` to the Trash. Your Tempo was never modified.

## Other Tempo versions

You get a warning and it installs anyway. Most mods still work; some may look off. Include your Tempo version when you report a problem. After Tempo updates itself, run `./install.sh --rebuild` from the unzipped folder.

## Something broke

Run `Install RE-TEMPO.command` again; it is safe to repeat. Replaced files go to `~/RE-TEMPO/_backup/`, never deleted. Send the Terminal output and `~/RE-TEMPO/_app.log`.
