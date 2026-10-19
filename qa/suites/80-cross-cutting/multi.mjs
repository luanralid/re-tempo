// qa/suites/80-cross-cutting/multi.mjs — multi-instance, profile lock and kill/relaunch.
// -----------------------------------------------------------------------------
// Everything logged out, in dedicated slots (indices 10..14). Local-only stress.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { launch, teardown } from "../../instance.mjs";
import { instancePaths, APP_BIN } from "../../lib/config.mjs";
import { httpGetJson } from "../../lib/cdp.mjs";
import { acquireLock, slotLockPath } from "../../lib/lock.mjs";
import * as C from "./common.mjs";

// Round: N instances in parallel; measures boot, isolation (localStorage, ports,
// userData in the log), responsiveness of a "watcher" instance during the burst.
export async function parallelRound(slots, { watchPage = null, tag = "txp" } = {}) {
  const t0 = Date.now();
  const ping = [];
  let stopPing = false;
  const pinger = (async () => {
    while (watchPage && !stopPing) {
      const s = Date.now();
      try { await watchPage.evaluate(() => 1 + 1); ping.push(Date.now() - s); } catch { ping.push(-1); }
      await C.sleep(250);
    }
  })();
  const settled = await Promise.allSettled(slots.map((s) => C.startEphemeral(s, { tag })));
  const handles = settled.filter((x) => x.status === "fulfilled").map((x) => x.value);
  const failures = settled.filter((x) => x.status === "rejected").map((x) => String(x.reason && x.reason.message || x.reason).slice(0, 200));
  const wallMs = Date.now() - t0;
  const per = [];
  try {
    // each instance writes its own key; then all of them read all of them
    for (const h of handles) await h.page.evaluate((k) => localStorage.setItem("qa-tx-iso", k), h.instance.id);
    for (const h of handles) {
      const seen = await h.page.evaluate(() => localStorage.getItem("qa-tx-iso"));
      const screen = await C.ui.detectScreen(h.page);
      const log = C.logText(h.instance);
      const ownData = log.includes(`Using override userData dir: ${h.instance.paths.dataDir}`);
      const tree = C.procTree(h.instance);
      const listen = (await C.tcpConnections(tree.mainPids)).filter((c) => c.state === "LISTEN").map((c) => c.local);
      per.push({
        id: h.instance.id, bootMs: h.instance.bootMs, readyMs: h.readyMs, screen,
        isolatedStorage: seen === h.instance.id, ownUserData: ownData,
        listen, expectedPorts: [h.instance.paths.ports.cdp, h.instance.paths.ports.authCallback, h.instance.paths.ports.webCapture],
        procs: tree.procs.length, rssMB: tree.totalRssMB,
        exceptions: h.collectors.exceptions.length, consoleErrors: h.collectors.consoleErrors.length,
      });
    }
  } finally {
    stopPing = true;
    await pinger;
  }
  const td = await C.stopAll(handles);
  return {
    wallMs, launched: handles.length, failures, per,
    leftovers: td.flatMap((t) => t.leftovers), forcedMain: td.flatMap((t) => t.forcedMain),
    watchPingMs: C.stats(ping.filter((x) => x >= 0)), watchPingFails: ping.filter((x) => x < 0).length,
  };
}

// Two app processes on the SAME profile (HOME + userData), distinct ports.
// B is launched BY HAND (direct spawn, without launch()): the harness teardown() kills
// every helper with the same --user-data-dir, which would take A down and contaminate the
// result. B is shut down only through its own tree (B's pid and direct children).
export async function sameProfileTwice(slotA, slotB, { observeMs = 20000 } = {}) {
  const A = await C.startEphemeral(slotA, { tag: "txlock" });
  const pA = A.instance.paths;
  const idxB = await C.allocIndex(C.SLOT_INDICES[slotB]);
  const releaseB = acquireLock(slotLockPath(idxB), "t-cross-cutting sameProfile B");
  const portsB = instancePaths("x", idxB).ports;
  const logB = path.join(pA.dir, "main-B.log");
  const lockFiles = () => {
    const cands = [path.join(pA.home, ".tempo-instance.lock"), path.join(pA.dataDir, "SingletonLock"), path.join(pA.dataDir, "SingletonSocket"), path.join(pA.dataDir, "SingletonCookie")];
    return cands.filter((f) => { try { fs.lstatSync(f); return true; } catch { return false; } }).map((f) => path.relative(pA.dir, f));
  };
  const res = { lockFiles: lockFiles() };
  const logALenBefore = C.logText(A.instance).length;
  const aTreeBefore = C.procTree(A.instance).procs.map((p) => p.pid).sort();
  const env = { ...process.env, HOME: pA.home, TEMPO_USER_DATA_DIR: pA.dataDir, TEMPO_AUTH_CALLBACK_PORT: String(portsB.authCallback), TEMPO_WEB_CAPTURE_PORT: String(portsB.webCapture) };
  delete env.npm_config_prefix;
  const fd = fs.openSync(logB, "w");
  const t0 = Date.now();
  const B = spawn(APP_BIN, [`--remote-debugging-port=${portsB.cdp}`], { env, stdio: ["ignore", fd, fd], detached: true });
  fs.closeSync(fd);
  let exit = null;
  B.on("exit", (code, signal) => { exit = { code, signal, afterMs: Date.now() - t0 }; });
  let bTargets = null;
  while (Date.now() - t0 < observeMs && !exit) {
    try { bTargets = (await httpGetJson("127.0.0.1", portsB.cdp, "/json")).filter((t) => t.type === "page").length; } catch { /* no CDP */ }
    await C.sleep(500);
  }
  const bLog = (() => { try { return fs.readFileSync(logB, "utf8"); } catch { return ""; } })();
  res.secondInstance = {
    exited: !!exit, exit, devtoolsUp: /DevTools listening/.test(bLog), pageTargets: bTargets,
    stillAliveAfterMs: exit ? null : Date.now() - t0,
  };
  res.secondLogHints = bLog.split("\n").filter((l) => /lock|single|another|already|instance|quit|exit|second/i.test(l)).slice(0, 8).map((l) => l.replace(/\/tmp\/tempo-qa\/[^\s]+/g, "<qa>").slice(0, 160));
  const aLogNew = C.logText(A.instance).slice(logALenBefore);
  res.firstLogHints = aLogNew.split("\n").filter((l) => /second|instance|focus|lock|deep|open-url|argv|crash/i.test(l)).slice(0, 8).map((l) => l.replace(/\/tmp\/tempo-qa\/[^\s]+/g, "<qa>").slice(0, 160));
  // shut down ONLY B (pid + direct children), if still alive
  if (!exit) {
    const kids = execFileSync("/bin/ps", ["-axo", "pid=,ppid="], { encoding: "utf8" }).split("\n").map((l) => l.trim().split(/\s+/).map(Number)).filter(([, pp]) => pp === B.pid).map(([p]) => p);
    for (const p of [B.pid, ...kids]) { try { process.kill(p, "SIGKILL"); } catch {} }
    await C.sleep(500);
  }
  res.firstAlive = await A.page.evaluate(() => 1 + 1).then((x) => x === 2).catch(() => false);
  res.firstScreen = await C.ui.detectScreen(A.page);
  res.firstTreeUnchanged = JSON.stringify(C.procTree(A.instance).procs.map((p) => p.pid).sort()) === JSON.stringify(aTreeBefore);
  res.lockFilesAfter = lockFiles();
  releaseB();
  C.freeIndex(idxB);
  const td = await C.stopAll([A]);
  res.leftovers = td.flatMap((t) => t.leftovers);
  return res;
}

// Harness locks (lib/lock.mjs via launch()): with A alive, a 2nd node process
// tries (1) the SAME instance directory in a free slot and (2) ANOTHER directory in the
// SAME port slot. Both must be refused without touching A.
export async function harnessLockProbe(slotA, slotFree) {
  const A = await C.startEphemeral(slotA, { tag: "txhl" });
  const inst = path.resolve(import.meta.dirname, "../../instance.mjs");
  const child = (id, index) => new Promise((resolve) => {
    const code = `import(${JSON.stringify(inst)}).then(async (m) => { try { const i = await m.launch({ id: ${JSON.stringify(id)}, index: ${index}, devtoolsTimeoutMs: 15000 }); console.log("ACQUIRED"); await m.teardown(i); } catch (e) { console.log("REFUSED:" + e.message.replace(/\\/tmp[^ ]+/g, "<qa>").slice(0, 160)); } });`;
    const p = spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("exit", () => resolve(out.trim().split("\n").pop()));
  });
  const res = {};
  try {
    const free = await C.allocIndex(C.SLOT_INDICES[slotFree]);
    C.freeIndex(free); // the child tries to take this slot; the directory lock must block it first
    res.sameDir = await child(A.instance.id, free);
    res.sameSlot = await child("txhl-intruder", A.instance.index);
    res.firstAlive = await A.page.evaluate(() => 1 + 1).then((x) => x === 2).catch(() => false);
  } finally {
    const td = await C.stopAll([A]);
    res.leftovers = td.flatMap((t) => t.leftovers);
  }
  return res;
}

// Kill -9 + relaunch on the SAME ephemeral profile, several fast rounds. In each
// round it writes a new value to localStorage, waits `settleMs[r]` and kills with
// SIGKILL; on relaunch it checks whether the value survived. The last round uses
// GRACEFUL shutdown (SIGTERM via teardown) for comparison.
export async function killRelaunch(slot, { settleMs = [1500, 6000, 15000], graceful = true } = {}) {
  let cur = await C.startEphemeral(slot, { tag: "txkill" });
  const paths = cur.instance.paths;
  const key = "qa-tx-kill";
  const plan = settleMs.map((ms) => ({ mode: "SIGKILL", settleMs: ms }));
  if (graceful) plan.push({ mode: "SIGTERM", settleMs: 1500 });
  const out = { rounds: [] };
  for (let r = 0; r < plan.length; r++) {
    const val = `v${r}-${Date.now()}`;
    await cur.page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, val]);
    await C.sleep(plan[r].settleMs);
    const tree = C.procTree(cur.instance);
    try { cur.collectors && cur.collectors.stop(); } catch {}
    try { await cur.browser.close(); } catch {}
    if (plan[r].mode === "SIGKILL") {
      for (const p of tree.procs) { try { process.kill(p.pid, "SIGKILL"); } catch {} }
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline && C.procTree(cur.instance).procs.length) await C.sleep(150);
      // processes already dead: teardown() only confirms and releases the slot/directory locks
      try { await teardown(cur.instance, { graceMs: 500 }); } catch {}
    } else {
      await C.hardTeardown(cur.instance);
    }
    const t0 = Date.now();
    let next = null, err = null;
    try {
      const inst = await launch({ paths, keepProfile: true });
      next = { instance: inst, ...(await C.attachTo(inst)) };
    } catch (e) { err = String(e.message).slice(0, 160); }
    const rec = { round: r + 1, ...plan[r], relaunchMs: Date.now() - t0, error: err };
    if (next) {
      rec.screen = await C.ui.detectScreen(next.page);
      const got = await next.page.evaluate((k) => localStorage.getItem(k), key);
      rec.localStorageKept = got === val;
      rec.gotPrevious = got != null && got !== val;
      rec.exceptions = next.collectors.exceptions.length;
      rec.crashHints = C.logText(next.instance).split("\n").filter((l) => /corrupt|crash|recover|IO error/i.test(l)).slice(0, 5).map((l) => l.slice(0, 160));
      cur = next;
    }
    out.rounds.push(rec);
    if (!next) break;
  }
  const td = await C.stopAll([cur]);
  out.leftovers = td.flatMap((t) => t.leftovers);
  return out;
}
