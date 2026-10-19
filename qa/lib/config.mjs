// qa/lib/config.mjs — constants and per-instance port/path allocation.
// -----------------------------------------------------------------------------
// Isolation: each instance has its own HOME and its own TEMPO_USER_DATA_DIR under
// /tmp/tempo-qa/inst-<id>/ (ephemeral) or under the persistent profiles directory
// (QA_PROFILES_DIR, default /tmp/tempo-qa/profiles/qa-N/). Deterministic ports
// by slot index. NEVER reuses the real Tempo profile nor the _home/_data-isolated
// of RE-TEMPO.
import os from "node:os";
import path from "node:path";

export const QA_ROOT = "/tmp/tempo-qa";
export const RUNS_DIR = path.join(QA_ROOT, "runs");

// Persistent logged-in profiles (one per slot). Configurable, but always validated.
const RAW_PROFILES_DIR = process.env.QA_PROFILES_DIR || "";
export const PROFILES_DIR = RAW_PROFILES_DIR ? path.resolve(RAW_PROFILES_DIR) : path.join(QA_ROOT, "profiles");
// Repo root: profiles (with a plain-text session) must never live inside it.
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

// Where install.sh / scripts/bootstrap-local.sh set up RE-TEMPO (default ~/RE-TEMPO).
export const RE_TEMPO_BASE = path.resolve(process.env.RE_TEMPO_BASE || path.join(os.homedir(), "RE-TEMPO"));

// Target app: the editable RE-TEMPO clone (NEVER /Applications/Tempo.app).
export const APP_BIN =
  process.env.RE_TEMPO_BIN ||
  path.join(RE_TEMPO_BASE, "RE-TEMPO.app", "Contents", "MacOS", "Tempo");

// Port ranges (slots 0..MAX_INSTANCES-1). Slot reservations:
//   0..8   -> logged-in profiles qa-1..qa-9 (slot = N-1)
//   10..19 -> MANUAL reservation (launch(index) called directly by other agents); the
//             automatic allocator does NOT use this range
//   20+    -> automatic allocator (run.mjs --instances), with a per-slot lock
export const MAX_INSTANCES = 40; // CDP 9401..9440
export const PROFILE_SLOTS = 9;  // slots 0..8 reserved for profiles
export const MANUAL_SLOT_MIN = 10, MANUAL_SLOT_MAX = 19; // manual reservation
export const AUTO_SLOT_MIN = 20; // automatic allocator starts here
const CDP_BASE = 9401; // 9401..9440  (DevTools / CDP)
const INSPECT_BASE = 9501; // 9501..9540 (inspector do main; only in the login --dry-run)
const AUTH_BASE = 17301; // 17301..17340 (TEMPO_AUTH_CALLBACK_PORT)
const WEBCAP_BASE = 17401; // 17401..17440 (TEMPO_WEB_CAPTURE_PORT)

// Throwaway password for each instance's isolated keychain (local, disposable).
export const KEYCHAIN_PW = "tempo-qa-local";

// Sanitizes an instance id into a safe file/port slug.
export function slug(id) {
  const s = String(id)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!s) throw new Error(`invalid instance id: ${JSON.stringify(id)}`);
  return s;
}

function portsFor(index) {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_INSTANCES) {
    throw new Error(`index out of range 0..${MAX_INSTANCES - 1}: ${index}`);
  }
  return {
    cdp: CDP_BASE + index,
    inspect: INSPECT_BASE + index,
    authCallback: AUTH_BASE + index,
    webCapture: WEBCAP_BASE + index,
  };
}

function layout(id, index, dir, kind) {
  return {
    id,
    index,
    kind, // "ephemeral" | "profile"
    dir,
    home: path.join(dir, "home"),
    dataDir: path.join(dir, "data"),
    mainLog: path.join(dir, "main.log"),
    ports: portsFor(index),
  };
}

// EPHEMERAL instance (profile recreated on every run): /tmp/tempo-qa/inst-<id>/.
export function instancePaths(id, index) {
  const s = slug(id);
  return layout(s, index, path.join(QA_ROOT, `inst-${s}`), "ephemeral");
}

// PERSISTENT profile qa-N (slot N-1): <PROFILES_DIR>/qa-N/. Accepts "qa-3" or 3.
export function profilePaths(name) {
  const m = String(name).trim().match(/^(?:qa-)?(\d+)$/i);
  if (!m) throw new Error(`invalid profile: ${JSON.stringify(name)} (use qa-N)`);
  const n = parseInt(m[1], 10);
  if (n < 1 || n > PROFILE_SLOTS) throw new Error(`profile out of range qa-1..qa-${PROFILE_SLOTS} (reserved slots 0..${PROFILE_SLOTS - 1}): ${name}`);
  assertProfilesDirSafe();
  const id = `qa-${n}`;
  const p = layout(id, n - 1, path.join(PROFILES_DIR, id), "profile");
  p.marker = path.join(p.dir, ".logged-in");
  return p;
}

// The profiles directory must be dedicated: under /tmp/tempo-qa or with a
// "tempo-qa" segment in the path. Never the real HOME, ~/Library or ~/RE-TEMPO.
function assertProfilesDirSafe() {
  const real = os.userInfo().homedir;
  if (RAW_PROFILES_DIR && !path.isAbsolute(RAW_PROFILES_DIR)) {
    throw new Error(`QA_PROFILES_DIR must be absolute: ${RAW_PROFILES_DIR}`);
  }
  if (PROFILES_DIR === "/" || PROFILES_DIR === real) {
    throw new Error(`refused: QA_PROFILES_DIR in a forbidden location: ${PROFILES_DIR}`);
  }
  for (const bad of [path.join(real, "RE-TEMPO"), path.join(real, "Library"), "/Applications", REPO_ROOT]) {
    if (PROFILES_DIR === bad || PROFILES_DIR.startsWith(bad + path.sep)) {
      throw new Error(`refused: QA_PROFILES_DIR in a forbidden location: ${PROFILES_DIR}`);
    }
  }
  const dedicated = PROFILES_DIR.startsWith(QA_ROOT + path.sep) || PROFILES_DIR.split(path.sep).some((s) => s.includes("tempo-qa"));
  if (!dedicated) throw new Error(`refused: QA_PROFILES_DIR must be under ${QA_ROOT} or have "tempo-qa" in the path: ${PROFILES_DIR}`);
}

// Roots where the harness may create/remove/kill things.
function allowedRoots() {
  const roots = [QA_ROOT];
  if (!PROFILES_DIR.startsWith(QA_ROOT + path.sep)) roots.push(PROFILES_DIR);
  return roots;
}

// Safety guard: we only allow touching paths under the harness roots.
export function assertUnderQaRoot(p) {
  const abs = path.resolve(p);
  for (const root of allowedRoots()) {
    if (abs === root || abs.startsWith(root + path.sep)) return abs;
  }
  throw new Error(`refused: path outside ${allowedRoots().join(" | ")}: ${abs}`);
}
