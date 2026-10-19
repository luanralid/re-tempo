// qa/lib/session.mjs — session state of a QA PROFILE (never of the user's window).
// -----------------------------------------------------------------------------
// The app stores the session in plain text (.tempo-auth.json) — observed in userData
// when TEMPO_USER_DATA_DIR is set; HOME is checked just in case.
// Here we only read the QA profile's OWN file and only extract:
//   - whether it exists (and where: data|home);
//   - sessionFp = sha256(sessionId) truncated to 12 hex (not reversible).
// The `token` field is NEVER read out, printed or written.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { assertUnderQaRoot } from "./config.mjs";

export function sessionInfo(paths) {
  const candidates = [
    ["data", path.join(paths.dataDir, ".tempo-auth.json")],
    ["home", path.join(paths.home, ".tempo-auth.json")],
  ];
  for (const [where, file] of candidates) {
    assertUnderQaRoot(file);
    if (!fs.existsSync(file)) continue;
    let sessionFp = null;
    try {
      const sid = JSON.parse(fs.readFileSync(file, "utf8")).sessionId;
      if (typeof sid === "string" && sid) sessionFp = createHash("sha256").update(sid).digest("hex").slice(0, 12);
    } catch { /* file being written/corrupt: only record presence */ }
    return { present: true, authFile: where, sessionFp };
  }
  return { present: false, authFile: null, sessionFp: null };
}

// Masks an e-mail for reports (l***@domain). The local marker keeps it whole.
export function maskEmail(e) {
  if (!e || typeof e !== "string" || !e.includes("@")) return e || null;
  const [u, d] = e.split("@");
  return `${u.slice(0, 1)}***@${d}`;
}

// Restricts permissions (0700): logged-in profiles keep the session in plain text.
export function lockDownDir(dir) {
  assertUnderQaRoot(dir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch { /* best effort */ }
}
