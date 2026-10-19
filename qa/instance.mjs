// qa/instance.mjs — launch()/teardown() of an isolated RE-TEMPO instance.
// -----------------------------------------------------------------------------
// Full isolation per instance:
//   HOME                     = /tmp/tempo-qa/inst-<id>/home   (empty => LOGGED OUT)
//   TEMPO_USER_DATA_DIR      = /tmp/tempo-qa/inst-<id>/data    (own profile)
//   TEMPO_AUTH_CALLBACK_PORT = 17301+index
//   TEMPO_WEB_CAPTURE_PORT   = 17401+index   (solves the fixed-17252 conflict)
//   --remote-debugging-port  = 9401+index    (own CDP)
//   isolated keychain INSIDE HOME (never the real default-keychain)
//
// Persistent profiles (qa-N, see login.mjs) use the same layout under
// QA_PROFILES_DIR/qa-N/ and are NEVER reset by launch().
//
// Concurrency between agents: launch() acquires the SLOT lock (ports) and the
// DIRECTORY lock (id/profile) in /tmp/tempo-qa/locks/ BEFORE any reset; a
// second run on the same slot or id fails right away, without touching the first.
//
// NEVER touches: /Applications/Tempo.app, ~/Library/Application Support/Tempo,
// ~/RE-TEMPO/_home, ~/RE-TEMPO/_data-isolated, port 9333 (the user's live window).
// teardown() only kills this instance's RE-TEMPO bundle processes: the main (launched
// pid / SingletonLock of its own dataDir) and the helpers with
// --user-data-dir=<dataDir>. Re-sends TERM (a TERM too early in boot can be
// ignored), then KILL, and confirms nothing is left.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { instancePaths, assertUnderQaRoot, APP_BIN, QA_ROOT } from "./lib/config.mjs";
import { ensureIsolatedKeychain } from "./lib/keychain.mjs";
import { lockDownDir } from "./lib/session.mjs";
import { listAppPageTargets } from "./lib/cdp.mjs";
import { hideMains } from "./lib/windows.mjs";
import { assertPortsFree } from "./lib/ports.mjs";
import { acquireLock, readLock, slotLockPath, dirLockPath } from "./lib/lock.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();

// ".../RE-TEMPO.app/" — only processes whose command starts here are kill candidates.
const APP_BUNDLE = APP_BIN.replace(/(\.app\/).*$/, "$1");

// --- process identification (read only) -------------------------------------
function psTable() {
  let out = "";
  try { out = execFileSync("/bin/ps", ["-axww", "-o", "pid=,ppid=,command="], { encoding: "utf8", maxBuffer: 64 << 20 }); }
  catch { return []; }
  const rows = [];
  for (const line of out.split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (m) rows.push({ pid: +m[1], ppid: +m[2], cmd: m[3] });
  }
  return rows;
}

// Main pid recorded in the SingletonLock of its own dataDir ("host-<pid>").
function singletonPid(dataDir) {
  try { const m = fs.readlinkSync(path.join(dataDir, "SingletonLock")).match(/-(\d+)$/); return m ? +m[1] : null; }
  catch { return null; }
}

// Classifies this instance's RE-TEMPO bundle processes into MAIN and HELPERS.
//   main   = this instance's Contents/MacOS/Tempo binary, identified by the
//            slot's --remote-debugging-port, by the dataDir's SingletonLock, or
//            by the spawn pid. (The main does NOT carry --user-data-dir in argv — only the
//            helpers do — and the app relaunches itself on boot: the final main is born with
//            ppid 1, so the spawn pid may already be dead. That is why the main is
//            found by PORT/SingletonLock, never by --user-data-dir.)
//   helper = process with --user-data-dir=<dataDir> that is NOT main (includes the
//            RE-TEMPO Helper (Renderer)).
export function classifyPids(dataDir, { cdpPort = null, spawnPid = null } = {}) {
  const dd = assertUnderQaRoot(dataDir);
  const rows = psTable().filter((r) => r.cmd.startsWith(APP_BUNDLE));
  const sing = singletonPid(dd);
  const isMain = (r) =>
    r.cmd.startsWith(APP_BIN) &&
    (r.pid === sing || r.pid === spawnPid || (cdpPort && r.cmd.includes(`--remote-debugging-port=${cdpPort}`)));
  const mains = new Set();
  const helpers = new Set();
  for (const r of rows) {
    if (isMain(r)) mains.add(r.pid);
    else if (r.cmd.split(/\s+/).includes(`--user-data-dir=${dd}`)) helpers.add(r.pid);
  }
  for (const r of rows) if (mains.has(r.ppid) && !mains.has(r.pid)) helpers.add(r.pid); // children of the main
  return { mains: [...mains], helpers: [...helpers], all: [...new Set([...mains, ...helpers])] };
}

// Compat: all of the instance's pids (main + helpers).
export function appPidsForDataDir(dataDir, extraMainPid = null) {
  return classifyPids(dataDir, { spawnPid: extraMainPid }).all;
}

function killPid(pid, sig) { try { process.kill(pid, sig); } catch { /* already dead */ } }

// Terminates the instance tree WITHOUT triggering the native "renderer process
// exited unexpectedly (killed)" dialog. The dialog's cause: signaling a HELPER
// (renderer) while the MAIN is alive — the main notices the renderer is gone and opens
// the dialog, which stays on screen until the main dies. Therefore:
//   1) TERM only the main(s); re-TERM mains that show up during the grace (boot relaunch);
//   2) wait for the tree to exit (helpers exit along with the main);
//   3) if the main persists, KILL the MAIN first, then any remaining helpers.
// Never a helper/renderer before the main. `graceful:false` skips step 1.
export async function killInstanceTree(dataDir, sel, { graceMs = 5000, graceful = true } = {}) {
  const scan = () => classifyPids(dataDir, sel);
  if (graceful) {
    const termed = new Set();
    const termMains = () => { for (const pid of scan().mains) if (!termed.has(pid)) { killPid(pid, "SIGTERM"); termed.add(pid); } };
    termMains();
    const deadline = now() + graceMs;
    let lastTerm = now();
    while (now() < deadline) {
      if (scan().all.length === 0) return { ok: true, termed: [...termed] };
      if (now() - lastTerm >= 1200) { termMains(); lastTerm = now(); } // catches the relaunch
      await sleep(150);
    }
  }
  for (let i = 0; i < 12; i++) {
    const { mains, helpers, all } = scan();
    if (all.length === 0) return { ok: true };
    for (const pid of mains) killPid(pid, "SIGKILL");   // MAIN first: no main, no dialog
    await sleep(120);
    for (const pid of helpers) killPid(pid, "SIGKILL"); // remaining orphan helpers
    await sleep(120);
  }
  return { ok: scan().all.length === 0 };
}

// --- directory reset (ephemeral, or profile via --force/clean) ---------------
// Requires THIS process to hold the directory lock: never deletes another run's.
export async function resetProfile(paths) {
  const dir = assertUnderQaRoot(paths.dir);
  const holder = readLock(dirLockPath(paths));
  if (!holder || holder.pid !== process.pid) {
    throw new Error(`refused: reset of ${dir} without this process holding lock ${path.basename(dirLockPath(paths))}`);
  }
  // Terminates leftovers (main-first, no dialog) before removing the directory.
  await killInstanceTree(paths.dataDir, {}, { graceMs: 2500, graceful: true });
  let lastErr;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
      if (!fs.existsSync(dir)) return;
    } catch (e) {
      lastErr = e;
      await killInstanceTree(paths.dataDir, {}, { graceMs: 0, graceful: false });
    }
    await sleep(250);
  }
  throw new Error(`could not clean ${dir}: ${lastErr ? lastErr.message : "persistent ENOTEMPTY"}`);
}

async function prepareDirs(paths, { keepProfile }) {
  // A persistent profile is never reset here (only login.mjs --force, explicitly).
  if (!keepProfile && paths.kind !== "profile") await resetProfile(paths);
  // 0700 on the root, the parent (profiles/) and the profile: session/screenshots are user-only.
  lockDownDir(QA_ROOT);
  lockDownDir(path.dirname(paths.dir));
  lockDownDir(paths.dir);
  fs.mkdirSync(paths.home, { recursive: true });
  fs.mkdirSync(paths.dataDir, { recursive: true });
}

// Polls the log until the regex matches (DevTools boot) or the timeout expires.
async function waitForLogLine(logPath, regex, { timeoutMs, child }) {
  const start = now();
  while (now() - start < timeoutMs) {
    if (child && child.exitCode != null) {
      throw new Error(`the app exited (code=${child.exitCode}) before DevTools; see ${logPath}`);
    }
    let txt = "";
    try { txt = fs.readFileSync(logPath, "utf8"); } catch { /* not created yet */ }
    if (regex.test(txt)) return now() - start;
    await sleep(250);
  }
  throw new Error(`timeout (${timeoutMs}ms) waiting for ${regex} in ${logPath}`);
}

// Waits for /json to answer with at least 1 app page (UI mounted).
async function waitForAppTarget(port, { timeoutMs }) {
  const start = now();
  while (now() - start < timeoutMs) {
    try {
      const targets = await listAppPageTargets(port);
      if (targets.length) return now() - start;
    } catch { /* port not ready yet */ }
    await sleep(300);
  }
  throw new Error(`timeout (${timeoutMs}ms) waiting for an app page on CDP :${port}`);
}

// Instances launched by THIS process and not yet terminated.
const live = new Set();

// Hides the windows of the instance's current main(s) (minimizes by pid).
async function hideInstanceWindows(inst, mode) {
  const { mains } = classifyPids(inst.paths.dataDir, { cdpPort: inst.cdpPort, spawnPid: inst.pid });
  return hideMains(mains, { mode });
}

// Re-applies "hide window" for a few seconds after boot: the app relaunches itself
// and opens a new (visible) window after the first hide, and the main changes pid.
// Stops when the instance is terminated. Does not block launch.
function keepHidden(inst, { forMs = 12000, everyMs = 800, mode = "minimized" } = {}) {
  const until = now() + forMs;
  const tick = async () => {
    if (!live.has(inst) || now() > until) return;
    try { await hideInstanceWindows(inst, mode); } catch { /* app may be relaunching */ }
    if (live.has(inst) && now() <= until) setTimeout(tick, everyMs);
  };
  setTimeout(tick, everyMs);
}

// Launches the instance. Ephemeral: { id, index }. Persistent profile: { paths } from
// profilePaths("qa-N"). `inspect: true` turns on the main's inspector on the slot's
// port (9501+i) — used ONLY by login.mjs --dry-run. `dirLockHeld: true` when the
// caller already holds the directory lock (login.mjs/clean.mjs).
// Returns { paths, proc, pid, cdpPort, bootDevtoolsMs, bootTargetMs, bootMs, ... }.
export async function launch({ id, index, paths: given, keepProfile = false, inspect = false, dirLockHeld = false, noHide = false, devtoolsTimeoutMs = 120000, targetTimeoutMs = 120000 } = {}) {
  const paths = given || instancePaths(id, index);
  if (!fs.existsSync(APP_BIN)) throw new Error(`RE-TEMPO binary not found: ${APP_BIN}`);

  const label = `${path.basename(process.argv[1] || "node")} ${paths.id}`;
  const releases = [];
  const inst = { id: paths.id, index: paths.index, paths, proc: null, pid: null, releases };
  try {
    if (!dirLockHeld) releases.push(acquireLock(dirLockPath(paths), label)); // directory/profile
    releases.push(acquireLock(slotLockPath(paths.index), label)); // slot ports
    await prepareDirs(paths, { keepProfile }); // ephemeral: kills leftovers and recreates
    const { cdp, authCallback, webCapture } = paths.ports;
    await assertPortsFree(inspect ? { cdp, authCallback, webCapture, inspect: paths.ports.inspect } : { cdp, authCallback, webCapture });
    ensureIsolatedKeychain(paths.home);

    const env = {
      ...process.env,
      HOME: paths.home,
      TEMPO_USER_DATA_DIR: paths.dataDir,
      TEMPO_AUTH_CALLBACK_PORT: String(authCallback),
      TEMPO_WEB_CAPTURE_PORT: String(webCapture),
    };
    // Do not leak shell config from the real HOME (the app's embedded toolchain takes over).
    delete env.npm_config_prefix;

    const logFd = fs.openSync(paths.mainLog, "w");
    // Anti-throttling flags: a hidden/offscreen window must not freeze timers/
    // rAF (otherwise screenshots and waits hang). See the note on surviving the
    // relaunch in doc 03 (confirmed via the relaunched main's argv).
    const args = [
      `--remote-debugging-port=${cdp}`,
      "--disable-renderer-backgrounding",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
    ];
    if (inspect) args.push(`--inspect=127.0.0.1:${paths.ports.inspect}`);
    const t0 = now();
    const proc = spawn(APP_BIN, args, { env, stdio: ["ignore", logFd, logFd], detached: true });
    proc.unref();
    fs.closeSync(logFd);
    Object.assign(inst, { proc, pid: proc.pid, startedAtMs: t0, cdpPort: cdp, cdpUrl: `http://127.0.0.1:${cdp}` });
    live.add(inst);

    const devtoolsRe = new RegExp(`DevTools listening on ws://127\\.0\\.0\\.1:${cdp}/`);
    inst.bootDevtoolsMs = await waitForLogLine(paths.mainLog, devtoolsRe, { timeoutMs: devtoolsTimeoutMs, child: proc }); // spawn -> DevTools
    inst.bootTargetMs = await waitForAppTarget(cdp, { timeoutMs: targetTimeoutMs }); // DevTools -> page on /json
    inst.bootMs = inst.bootDevtoolsMs + inst.bootTargetMs; // spawn -> UI reachable via CDP (total)
    // Hides the window from the user's screen as soon as the main exists (as early
    // as possible). Boot may relaunch (main changes pid): re-applied in the background.
    const hideMode = process.env.QA_WINDOW_MODE === "offscreen" ? "offscreen" : "minimized";
    if (!noHide) {
      inst.hidden = await hideInstanceWindows(inst, hideMode).catch((e) => ({ hidden: 0, errors: [e.message] }));
      keepHidden(inst, { mode: hideMode }); // covers the relaunch window
    }
    return inst;
  } catch (e) {
    // Failure mid-launch: leave no process or lock behind. Only kill if
    // THIS process got as far as launching (pid); if the lock failed, the dataDir may belong
    // to another live run and must not be touched.
    if (inst.pid) await teardown(inst).catch(() => {});
    else for (const release of releases) release();
    throw e;
  }
}

// Terminates ONLY this instance's processes. TERM (re-sent) -> KILL -> confirm.
// Persistent profiles get a longer grace (the app writes session/LevelDB on exit).
export async function teardown(instance, { graceMs } = {}) {
  const dataDir = instance.paths.dataDir;
  if (graceMs == null) graceMs = instance.paths.kind === "profile" ? 12000 : 4000;
  assertUnderQaRoot(dataDir); // hard guard: only inside the harness roots

  const sel = { cdpPort: instance.cdpPort, spawnPid: instance.pid };
  const before = classifyPids(dataDir, sel).all;
  const res = await killInstanceTree(dataDir, sel, { graceMs, graceful: true });
  live.delete(instance);
  for (const release of instance.releases || []) release();
  if (!res.ok) {
    const left = classifyPids(dataDir, sel).all;
    throw new Error(`teardown of ${instance.id}: processes still alive ${left.join(",")}`);
  }
  return { killed: before };
}

// Ctrl+C / SIGTERM on the runner: terminates everything this process launched and exits.
export function installSignalCleanup() {
  let busy = false;
  const handler = async (sig) => {
    if (busy) return;
    busy = true;
    console.error(`\n[qa] ${sig}: terminating ${live.size} instance(s) launched by this process...`);
    for (const inst of [...live]) { try { await teardown(inst); } catch { /* best effort */ } }
    process.exit(130);
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
}

// --- CLI: node instance.mjs --id a --index 0 [--keep-profile] ----------------
function parseArgs(argv) {
  const a = { id: "a", index: 0, keepProfile: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--id") a.id = argv[++i];
    else if (k === "--index") a.index = parseInt(argv[++i], 10);
    else if (k === "--keep-profile") a.keepProfile = true;
  }
  return a;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = parseArgs(process.argv);
  launch(a).then((inst) => {
    console.log(`[instance] inst-${inst.id} up`);
    console.log(`  pid=${inst.pid} cdp=${inst.cdpUrl}`);
    console.log(`  boot(devtools)=${inst.bootDevtoolsMs}ms boot(ui)=${inst.bootTargetMs}ms`);
    console.log(`  home=${inst.paths.home}`);
    console.log(`  data=${inst.paths.dataDir}`);
    console.log(`  log=${inst.paths.mainLog}`);
    console.log(`  (Ctrl+C terminates ONLY this instance)`);
    const bye = async () => { await teardown(inst).catch(() => {}); process.exit(0); };
    process.on("SIGINT", bye);
    process.on("SIGTERM", bye);
    // The child is unref()'d: without this Node would exit right away, releasing the locks and leaving the
    // app orphaned. Stays alive while the app lives; if the app dies, cleans up and exits.
    setInterval(() => {
      try { process.kill(inst.pid, 0); } catch { bye(); }
    }, 2000);
  }).catch((e) => { console.error("[instance] failed:", e.message); process.exit(1); });
}
