// qa/lib/lock.mjs — exclusive locks per port SLOT and per instance DIRECTORY.
// -----------------------------------------------------------------------------
// All locks live in /tmp/tempo-qa/locks/ (outside the directories that can be
// reset), one file per resource:
//   slot-<i>.lock        ports 9401+i / 9501+i / 17301+i / 17401+i
//   inst-<id>.lock       ephemeral directory /tmp/tempo-qa/inst-<id>/
//   profile-qa-N.lock    persistent profile qa-N (prevents two runs on the same profile)
// launch() acquires slot + directory BEFORE any reset; so a run never
// deletes or kills another agent's instance. Atomic creation with O_EXCL ("wx").
// An orphan lock (dead pid) is taken over. Content: { pid, cmd, startedAt }.
import fs from "node:fs";
import path from "node:path";
import { QA_ROOT } from "./config.mjs";

export const LOCKS_DIR = path.join(QA_ROOT, "locks");

export const slotLockPath = (index) => path.join(LOCKS_DIR, `slot-${index}.lock`);
export const dirLockPath = (paths) => path.join(LOCKS_DIR, `${paths.kind === "profile" ? "profile" : "inst"}-${paths.id}.lock`);

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

export function readLock(lockPath) {
  try { return JSON.parse(fs.readFileSync(lockPath, "utf8")); } catch { return null; }
}

// true if the lock exists and its owner is alive.
export function isLockHeld(lockPath) {
  const h = readLock(lockPath);
  return !!(h && Number.isInteger(h.pid) && alive(h.pid));
}

// Acquires or throws "in use". Returns release() (idempotent).
export function acquireLock(lockPath, label = "") {
  if (path.dirname(lockPath) !== LOCKS_DIR) throw new Error(`refused: lock outside ${LOCKS_DIR}: ${lockPath}`);
  fs.mkdirSync(LOCKS_DIR, { recursive: true, mode: 0o700 });
  const body = JSON.stringify({ pid: process.pid, cmd: label || process.argv.slice(1).join(" "), startedAt: new Date().toISOString() });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      fs.writeSync(fd, body);
      fs.closeSync(fd);
      let done = false;
      const release = () => { if (!done) { done = true; releaseLock(lockPath); } };
      process.once("exit", release);
      return release;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const holder = readLock(lockPath);
      if (holder && Number.isInteger(holder.pid) && alive(holder.pid)) {
        throw new Error(`in use: ${path.basename(lockPath, ".lock")} belongs to pid ${holder.pid} (${holder.cmd || "?"}, since ${holder.startedAt || "?"})`);
      }
      // Orphan: the owner died. Remove it and try once more.
      try { fs.unlinkSync(lockPath); } catch { /* race with another process */ }
    }
  }
  throw new Error(`could not acquire lock ${lockPath}`);
}

// Removes locks whose owner died (never one with a live owner). Returns the removed ones.
export function sweepOrphanLocks() {
  const removed = [];
  let files = [];
  try { files = fs.readdirSync(LOCKS_DIR).filter((f) => f.endsWith(".lock")); } catch { return removed; }
  for (const f of files) {
    const p = path.join(LOCKS_DIR, f);
    const h = readLock(p);
    if (h && Number.isInteger(h.pid) && alive(h.pid)) continue;
    try { fs.unlinkSync(p); removed.push(f); } catch { /* race */ }
  }
  return removed;
}

// Releases only if the lock belongs to this process.
export function releaseLock(lockPath) {
  const holder = readLock(lockPath);
  if (holder && holder.pid === process.pid) { try { fs.unlinkSync(lockPath); } catch { /* already released */ } }
}
