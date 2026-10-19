// qa/clean.mjs — SAFE cleanup of instances/profiles (no rm -rf / no glob).
// -----------------------------------------------------------------------------
// Removes only exact directories under the harness roots, validating the prefix,
// and ONLY after acquiring the directory lock: an instance in use by another run
// (another agent) is skipped, never killed or deleted. Uses fs.rmSync (does not trigger
// a shell permission prompt).
//
// Usage:
//   node clean.mjs --all                 cleans FREE inst-* (not runs/, NOT profiles)
//   node clean.mjs --id a                 cleans only inst-a (if free)
//   node clean.mjs --profile qa-3         deletes the LOGGED-IN profile qa-3 (if free)
//   node clean.mjs --runs                 also cleans runs/ (reports of ALL agents)
//   node clean.mjs --orphans              terminates ORPHAN QA instances (dead/missing lock);
//                                         skips those with another agent's live lock; never 92950
//   node clean.mjs --kill-all-qa          terminates ALL live QA instances (including those with a
//                                         live lock) — use only when the user asks to "kill everything"
//   ... --kill                            allows terminating a LIVE instance without a lock (your own orphan)
// Persistent logged-in profiles (profiles/qa-N) are only removed with an explicit --profile.
// Deleting a profile does NOT revoke the session on the server (it expires on its own).
import fs from "node:fs";
import path from "node:path";
import { QA_ROOT, RUNS_DIR, assertUnderQaRoot, instancePaths, profilePaths } from "./lib/config.mjs";
import { resetProfile, appPidsForDataDir, classifyPids, killInstanceTree } from "./instance.mjs";
import { acquireLock, dirLockPath, sweepOrphanLocks, isLockHeld, slotLockPath, LOCKS_DIR, readLock } from "./lib/lock.mjs";
import { qaInstances } from "./lib/discover.mjs";
import fsp from "node:fs";

// Terminates live RE-TEMPO instances under /tmp/tempo-qa whose owner (directory lock
// OR slot lock) is DEAD/missing — i.e. orphans of a runner that already exited. NEVER
// touches an instance with a live lock (another agent's) nor pid 92950/_data-isolated.
// `all:true` also includes those with a live lock (use only when the user asks to "kill everything").
async function killOrphans({ all = false } = {}) {
  const held = new Set();
  try {
    for (const f of fsp.readdirSync(LOCKS_DIR)) {
      const h = readLock(path.join(LOCKS_DIR, f));
      if (h && isLockHeld(path.join(LOCKS_DIR, f))) held.add(path.basename(f, ".lock"));
    }
  } catch { /* no locks */ }
  const results = [];
  for (const inst of qaInstances()) {
    const base = path.basename(path.dirname(inst.dataDir)); // inst-<id> or qa-N
    const name = base.startsWith("inst-") ? base.slice(5) : base;
    const key = base.startsWith("inst-") ? `inst-${name}` : `profile-${name}`;
    const slotKey = slotKeyForDataDir(inst.dataDir);
    const hasLiveLock = held.has(key) || (slotKey && held.has(slotKey));
    if (hasLiveLock && !all) { results.push({ dataDir: inst.dataDir, action: "skipped (live lock from another run)" }); continue; }
    const r = await killInstanceTree(inst.dataDir, {}, { graceMs: 4000, graceful: true });
    results.push({ dataDir: inst.dataDir, action: r.ok ? "terminated" : "still alive (failed)" });
  }
  return results;
}

// slot = (cdp 9401+i). Derived from the profile index (qa-N -> N-1) when applicable.
function slotKeyForDataDir(dataDir) {
  const base = path.basename(path.dirname(dataDir));
  const m = base.match(/^qa-(\d+)$/);
  return m ? `slot-${parseInt(m[1], 10) - 1}` : null;
}

// Acquires the directory lock and removes the exact directory. A LIVE instance
// (app processes on that dataDir) is never killed without --kill: it may belong to another
// agent launched by old code, without a lock. Returns what happened.
async function cleanOne(paths, { kill = false } = {}) {
  if (!fs.existsSync(paths.dir)) return "nothing";
  let release;
  try { release = acquireLock(dirLockPath(paths), `clean.mjs ${paths.id}`); }
  catch (e) { return e.message; } // in use by another run: do not touch
  try {
    const alive = appPidsForDataDir(paths.dataDir);
    if (alive.length && !kill) return `ALIVE without lock, not touched (pids ${alive.join(",")}); use --kill only if it is yours`;
    await resetProfile(paths);
    return "removed";
  } finally { release(); }
}

function rmRuns() {
  const abs = assertUnderQaRoot(RUNS_DIR);
  if (!fs.existsSync(abs)) return false;
  fs.rmSync(abs, { recursive: true, force: true });
  return true;
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = { all: argv.includes("--all"), runs: argv.includes("--runs"), kill: argv.includes("--kill"), orphans: argv.includes("--orphans"), killAll: argv.includes("--kill-all-qa"), id: null, profile: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--id") opt.id = argv[++i];
    else if (argv[i] === "--profile") opt.profile = argv[++i];
  }

  if (opt.orphans || opt.killAll) {
    const res = await killOrphans({ all: opt.killAll });
    for (const r of res) console.log(`${r.dataDir}: ${r.action}`);
    if (!res.length) console.log("no live QA instance found");
  }

  if (opt.orphans || opt.killAll) {
    // already handled above; go on to the lock sweep and exit
  } else if (opt.profile) {
    const paths = profilePaths(opt.profile);
    const r = await cleanOne(paths, opt);
    console.log(`${paths.dir}: ${r}${r === "removed" ? " (session on the server not revoked)" : ""}`);
  } else if (opt.id) {
    const paths = instancePaths(opt.id, 0); // the index does not matter for directory/lock
    console.log(`${paths.dir}: ${await cleanOne(paths, opt)}`);
  } else if (opt.all) {
    let entries = [];
    try { entries = fs.readdirSync(QA_ROOT); } catch { entries = []; }
    for (const name of entries.sort()) {
      if (!name.startsWith("inst-")) continue;
      const paths = instancePaths(name.slice("inst-".length), 0);
      if (path.join(QA_ROOT, name) !== paths.dir) continue; // name outside the slug pattern: leave it alone
      console.log(`${paths.dir}: ${await cleanOne(paths, opt)}`);
    }
  } else if (!opt.runs) {
    console.log("nothing to do. use --all, --id <id>, --profile qa-N, or --runs");
  }

  if (opt.runs) console.log(rmRuns() ? `removed: ${RUNS_DIR}` : `nothing in: ${RUNS_DIR}`);
  const orphans = sweepOrphanLocks(); // only locks with a dead owner
  if (orphans.length) console.log(`orphan locks removed: ${orphans.join(", ")}`);
}

main().catch((e) => { console.error("[clean] error:", e.message); process.exit(1); });
