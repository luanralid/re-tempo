// qa/ps.mjs — lists live RE-TEMPO instances and who owns them (READ ONLY).
// -----------------------------------------------------------------------------
// For each main process of the RE-TEMPO bundle: pid, CDP port, dataDir (from the
// helpers), whether it is the user's window (outside the harness roots) and the owner
// of the slot/directory lock. Use it to confirm "zero leftovers" after a run:
//   node ps.mjs           table
//   node ps.mjs --mine    only harness instances whose lock is orphaned/missing
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { APP_BIN, QA_ROOT, PROFILES_DIR } from "./lib/config.mjs";
import { LOCKS_DIR, readLock } from "./lib/lock.mjs";

const APP_BUNDLE = APP_BIN.replace(/(\.app\/).*$/, "$1");
const rows = execFileSync("/bin/ps", ["-axww", "-o", "pid=,ppid=,etime=,command="], { encoding: "utf8", maxBuffer: 64 << 20 })
  .split("\n").map((l) => l.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/)).filter(Boolean)
  .map((m) => ({ pid: +m[1], ppid: +m[2], etime: m[3], cmd: m[4] }))
  .filter((r) => r.cmd.startsWith(APP_BUNDLE));

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
const locks = new Map();
try {
  for (const f of fs.readdirSync(LOCKS_DIR)) {
    const h = readLock(path.join(LOCKS_DIR, f));
    if (h) locks.set(f.replace(/\.lock$/, ""), { ...h, alive: alive(h.pid) });
  }
} catch { /* no locks yet */ }

const harnessRoots = [QA_ROOT, PROFILES_DIR];
const out = [];
for (const main of rows.filter((r) => r.cmd.startsWith(APP_BIN))) {
  const cdp = (main.cmd.match(/--remote-debugging-port=(\d+)/) || [])[1] || "-";
  const child = rows.find((r) => r.ppid === main.pid && /--user-data-dir=/.test(r.cmd));
  const dataDir = child ? (child.cmd.match(/--user-data-dir=(\S+)/) || [])[1] : "?";
  const harness = harnessRoots.some((root) => dataDir.startsWith(root + path.sep));
  const dir = harness ? path.dirname(dataDir) : null;
  const key = dir ? (path.dirname(dir) === PROFILES_DIR ? `profile-${path.basename(dir)}` : path.basename(dir)) : null;
  const slot = cdp !== "-" ? `slot-${+cdp - 9401}` : null;
  const owner = (key && locks.get(key)) || (slot && locks.get(slot)) || null;
  out.push({
    pid: main.pid, etime: main.etime, cdp, dataDir,
    type: harness ? "harness" : "OUTSIDE the harness (do not touch)",
    owner: owner ? `pid ${owner.pid}${owner.alive ? "" : " (DEAD)"} ${owner.cmd || ""}` : harness ? "NO LOCK (old code or orphan)" : "-",
  });
}

const mine = process.argv.includes("--mine");
const list = mine ? out.filter((o) => o.type === "harness" && !/pid \d+ [^(]/.test(o.owner)) : out;
console.log("| pid | etime | cdp | type | owner | dataDir |");
console.log("|---:|---|---:|---|---|---|");
for (const o of list) console.log(`| ${o.pid} | ${o.etime} | ${o.cdp} | ${o.type} | ${o.owner} | ${o.dataDir} |`);
if (!list.length) console.log("| - | - | - | (none) | - | - |");
