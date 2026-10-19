// qa/lib/discover.mjs — discovers live RE-TEMPO instances under /tmp/tempo-qa (READ ONLY).
// -----------------------------------------------------------------------------
// Groups the RE-TEMPO bundle processes by dataDir (read from the helpers'
// --user-data-dir). Used by `ps.mjs` and `clean.mjs --orphans`. NEVER includes the real
// profile/_data-isolated (it lives outside /tmp/tempo-qa): the user's pid 92950 does not show up.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { APP_BIN, QA_ROOT } from "./config.mjs";

const APP_BUNDLE = APP_BIN.replace(/(\.app\/).*$/, "$1");

export function psRows() {
  let out = "";
  try { out = execFileSync("/bin/ps", ["-axww", "-o", "pid=,ppid=,command="], { encoding: "utf8", maxBuffer: 64 << 20 }); }
  catch { return []; }
  const rows = [];
  for (const line of out.split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (m && m[3].startsWith(APP_BUNDLE)) rows.push({ pid: +m[1], ppid: +m[2], cmd: m[3] });
  }
  return rows;
}

// Map dataDir -> { dataDir, cdp, pids } for instances whose dataDir is under
// /tmp/tempo-qa/ (helpers carry --user-data-dir; cdp comes from the main, if found).
export function qaInstances() {
  const rows = psRows();
  const byDir = new Map();
  for (const r of rows) {
    const m = r.cmd.match(/--user-data-dir=(\S+)/);
    if (!m) continue;
    const dd = m[1];
    if (dd !== QA_ROOT && !dd.startsWith(QA_ROOT + path.sep)) continue; // only under /tmp/tempo-qa
    if (!byDir.has(dd)) byDir.set(dd, { dataDir: dd, cdp: null, pids: new Set() });
    byDir.get(dd).pids.add(r.pid);
  }
  // the main's cdp (MacOS/Tempo --remote-debugging-port=...) has no --user-data-dir;
  // associate via each dataDir's SingletonLock if possible.
  for (const inst of byDir.values()) inst.pids = [...inst.pids];
  return [...byDir.values()];
}
