// qa/lib/keychain.mjs — isolated keychain INSIDE the instance's HOME.
// -----------------------------------------------------------------------------
// Why: with its own empty HOME, Electron's safeStorage (OSCrypt) finds no place
// to store the key and opens the "Keychain Not Found" dialog on every boot. We create
// a login.keychain ONLY inside the instance's HOME and make it the default IN THAT
// HOME. Replicates the technique from tools/start-live.sh, but per instance.
//
// CRITICAL SAFETY: every `security` command runs with env HOME=<instance home>.
// Keychain preferences for the `user` domain live in
// $HOME/Library/Preferences/com.apple.security.plist — so writing with the isolated
// HOME NEVER touches the user's real default-keychain. We never pass the real
// keychain nor run `security` with the real HOME.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { KEYCHAIN_PW, assertUnderQaRoot } from "./config.mjs";

function sec(args, home) {
  return execFileSync("/usr/bin/security", args, {
    env: { ...process.env, HOME: home },
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
}

// Ensures the isolated keychain. Idempotent. `home` MUST be the instance's HOME.
export function ensureIsolatedKeychain(home) {
  // Only in a harness instance/profile HOME (never the real HOME).
  if (!home) throw new Error("refused: instance HOME is empty");
  assertUnderQaRoot(home);
  const kcDir = path.join(home, "Library", "Keychains");
  const kc = path.join(kcDir, "login.keychain-db");
  fs.mkdirSync(kcDir, { recursive: true });

  if (!fs.existsSync(kc)) {
    // create-keychain uses the relative name "login.keychain"; with an isolated HOME,
    // it materializes at <home>/Library/Keychains/login.keychain-db.
    sec(["create-keychain", "-p", KEYCHAIN_PW, "login.keychain"], home);
  }
  // No auto-lock; added to the (isolated) user domain search list and made default.
  try { sec(["set-keychain-settings", "login.keychain"], home); } catch {}
  sec(["list-keychains", "-d", "user", "-s", kc], home);
  sec(["default-keychain", "-d", "user", "-s", kc], home);
  try { sec(["unlock-keychain", "-p", KEYCHAIN_PW, "login.keychain"], home); } catch {}
  return kc;
}
