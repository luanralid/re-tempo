// qa/suites/80-cross-cutting/common.mjs — utilities for the cross-cutting suites (t-cross-cutting).
// -----------------------------------------------------------------------------
// Own slots: ephemeral 10..14 (CDP 9411..9415). Logged-in profiles qa-8/qa-9
// (indices 7/8). Never touches the user's window (9333) nor other slots.
//
// Harness finding that this module works around: the app's main process does NOT carry the
// dataDir in argv (it comes via the TEMPO_USER_DATA_DIR env), so teardown() via
// pgrep -f dataDir does not find it; after SIGTERM it can take tens of
// seconds to exit and holds the slot's ports. hardTeardown() waits for the main
// (the pid WE launched, or the parent of our dataDir's helpers) and applies SIGKILL.
import { execFileSync } from "node:child_process";
import dns from "node:dns/promises";
import fs from "node:fs";
import path from "node:path";
import { launch, teardown } from "../../instance.mjs";
import { connect, pickMainPage } from "../../lib/cdp.mjs";
import { attachCollectors } from "../../lib/collect.mjs";
import { instancePaths } from "../../lib/config.mjs";
import { isLockHeld, slotLockPath } from "../../lib/lock.mjs";
import { portsFree } from "../../lib/ports.mjs";
import * as ui from "../../lib/ui.mjs";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// PREFERRED ephemeral indices of t-cross-cutting (12/CDP 9413 was taken by a
// foreign `workerd`). Override: TX_SLOTS=10,11,13,14,9. If a preferred one is
// locked by another run (the ephemeral run.mjs allocates from the top, 19,18,...) or has a busy
// port, allocIndex() picks another free one — never 0..8 (profiles qa-1..qa-9).
export const SLOT_INDICES = (process.env.TX_SLOTS || "10,11,13,14,9").split(",").map((x) => parseInt(x, 10));
const FALLBACK_INDICES = [12, 15, 16, 17, 18, 19];
const inUse = new Set(); // indices in use by THIS process

export async function allocIndex(preferred) {
  const pool = [...new Set([preferred, ...SLOT_INDICES, ...FALLBACK_INDICES])].filter((i) => Number.isInteger(i) && i >= 9 && i <= 19);
  for (const i of pool) {
    if (inUse.has(i) || isLockHeld(slotLockPath(i))) continue;
    const pt = instancePaths("probe", i).ports;
    if (!(await portsFree({ cdp: pt.cdp, auth: pt.authCallback, webcap: pt.webCapture, inspect: pt.inspect }))) continue;
    inUse.add(i);
    return i;
  }
  throw new Error("no free ephemeral slot for t-cross-cutting");
}
export const freeIndex = (i) => inUse.delete(i);
export const SLOT_BASE = SLOT_INDICES[0];
export const MAX_SLOTS = SLOT_INDICES.length;
export const SCRATCH = "/tmp/tempo-qa/scratch-t-cross-cutting";
export const USER_PIDS = new Set([92950, 92951]); // user's visible window: never touch

export function runId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function stats(xs) {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return { n: 0 };
  const q = (f) => a[Math.min(a.length - 1, Math.ceil(f * a.length) - 1)];
  const mean = a.reduce((s, x) => s + x, 0) / a.length;
  return { n: a.length, min: a[0], p50: q(0.5), mean: Math.round(mean), p95: q(0.95), max: a[a.length - 1] };
}

// ---- processos ---------------------------------------------------------------
function psTable() {
  const out = execFileSync("/bin/ps", ["-axo", "pid=,ppid=,rss=,command="], { encoding: "utf8", maxBuffer: 16 << 20 });
  return out.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    return m ? { pid: +m[1], ppid: +m[2], rssKB: +m[3], cmd: m[4] } : null;
  }).filter(Boolean);
}

// Process tree of the instance: helpers (argv with the dataDir) + main(s) (parents
// of the helpers or the launched pid). Always excludes the user's pids.
export function procTree(instance) {
  const dataDir = instance.paths.dataDir;
  const rows = psTable();
  const byPid = new Map(rows.map((r) => [r.pid, r]));
  const helpers = rows.filter((r) => r.cmd.includes(dataDir));
  const mainPids = new Set();
  if (instance.pid && byPid.has(instance.pid)) mainPids.add(instance.pid);
  for (const h of helpers) {
    const parent = byPid.get(h.ppid);
    if (parent && /RE-TEMPO\.app\/Contents\/MacOS\/Tempo/.test(parent.cmd)) mainPids.add(parent.pid);
  }
  const all = new Map();
  for (const pid of mainPids) if (!USER_PIDS.has(pid)) all.set(pid, byPid.get(pid));
  for (const h of helpers) if (!USER_PIDS.has(h.pid)) all.set(h.pid, h);
  const list = [...all.values()].filter(Boolean).map((r) => ({
    pid: r.pid, ppid: r.ppid, rssMB: Math.round(r.rssKB / 1024),
    kind: mainPids.has(r.pid) ? "main" : (r.cmd.match(/--type=([a-z-]+)/) || [, r.cmd.includes("crashpad") ? "crashpad" : "?"])[1],
    sandboxed: r.cmd.includes("--type=renderer") ? !r.cmd.includes("--no-sandbox") : undefined,
    cmd: r.cmd,
  }));
  return { procs: list, mainPids: [...mainPids], totalRssMB: list.reduce((s, p) => s + p.rssMB, 0) };
}

function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

// harness teardown() + wait for the main to exit; SIGKILL whatever is left (our pids only).
export async function hardTeardown(instance, { graceMs } = {}) {
  if (!instance) return { leftovers: [] };
  const before = procTree(instance);
  const t0 = Date.now();
  try { await teardown(instance, graceMs != null ? { graceMs } : undefined); } catch { /* best effort */ }
  const mains = before.mainPids.filter((p) => !USER_PIDS.has(p));
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && mains.some(alive)) await sleep(200);
  const forced = [];
  for (const pid of mains) if (alive(pid)) { try { process.kill(pid, "SIGKILL"); forced.push(pid); } catch {} }
  await sleep(300);
  const left = procTree(instance).procs.map((p) => p.pid);
  freeIndex(instance.index);
  return { ms: Date.now() - t0, forcedMain: forced, leftovers: left };
}

// ---- launch ------------------------------------------------------------------
// Starts an ephemeral instance in its own slot (0..4 => index 10..14), connects and
// waits for the UI. Returns { instance, browser, page, collectors, readyMs }.
export async function startEphemeral(slot, { tag = "tx", inspect = false, attach = true } = {}) {
  if (slot < 0 || slot >= MAX_SLOTS) throw new Error(`slot out of 0..${MAX_SLOTS - 1}: ${slot}`);
  let instance = null, lastErr = null;
  for (let attempt = 0; attempt < 3 && !instance; attempt++) {
    const index = await allocIndex(SLOT_INDICES[slot]);
    try { instance = await launch({ id: `${tag}-${index}`, index, inspect }); }
    catch (e) { freeIndex(index); lastErr = e; if (!/in use|busy|occupied/.test(e.message)) throw e; }
  }
  if (!instance) throw lastErr;
  try {
    return { instance, ...(await attachTo(instance, { attach })) };
  } catch (e) {
    await hardTeardown(instance);
    throw e;
  }
}

export async function attachTo(instance, { attach = true, readyTimeoutMs = 90000 } = {}) {
  const t0 = Date.now();
  const browser = await connect(instance.cdpPort);
  const page = await pickMainPage(browser);
  if (!page) throw new Error("main page not found");
  const collectors = attach ? attachCollectors(page) : null;
  await ui.waitForReady(page, { timeoutMs: readyTimeoutMs });
  return { browser, page, collectors, readyMs: Date.now() - t0 };
}

export async function stopAll(handles) {
  const res = [];
  await Promise.all(handles.filter(Boolean).map(async (h) => {
    try { h.collectors && h.collectors.stop(); } catch {}
    try { h.browser && (await h.browser.close()); } catch {}
    res.push(await hardTeardown(h.instance));
  }));
  return res;
}

export async function cdpSession(page) {
  return page.context().newCDPSession(page);
}

// Renderer metrics via CDP Performance + DOM counters.
export async function rendererMetrics(session) {
  await session.send("Performance.enable").catch(() => {});
  const { metrics } = await session.send("Performance.getMetrics");
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  let dom = null;
  try { dom = await session.send("Memory.getDOMCounters"); } catch {}
  return {
    jsHeapUsedMB: +(m.JSHeapUsedSize / 1048576).toFixed(1),
    jsHeapTotalMB: +(m.JSHeapTotalSize / 1048576).toFixed(1),
    nodes: dom ? dom.nodes : m.Nodes,
    documents: dom ? dom.documents : m.Documents,
    listeners: dom ? dom.jsEventListeners : m.JSEventListeners,
    layoutCount: m.LayoutCount,
    taskDurationS: +(m.TaskDuration || 0).toFixed(2),
  };
}

export async function forceGC(session) {
  try { await session.send("HeapProfiler.enable"); await session.send("HeapProfiler.collectGarbage"); } catch {}
}

// ---- network -----------------------------------------------------------------
export const KNOWN_HOSTS = [
  "us.i.posthog.com", "us-assets.i.posthog.com", "app.posthog.com",
  "o4511049662070784.ingest.us.sentry.io",
  "tempo-electron.vercel.app", "greedy-jackal-526.convex.cloud", "greedy-jackal-526.convex.site",
  "relay.tempo.new", "tempo.new", "www.tempo.new", "auth.tempo.new", "view.tempo.new", "docs.tempo.new",
  "fonts.googleapis.com", "fonts.gstatic.com", "rsms.me", "api.github.com", "github.com",
  "clerk.tempo.new", "api.anthropic.com", "statsig.anthropic.com",
];

let ipMapCache = null;
export async function ipToHostMap() {
  if (ipMapCache) return ipMapCache;
  const map = new Map();
  await Promise.all(KNOWN_HOSTS.map(async (h) => {
    try {
      for (const a of await dns.lookup(h, { all: true })) if (!map.has(a.address)) map.set(a.address, h);
    } catch { /* host without DNS */ }
  }));
  ipMapCache = map;
  return map;
}

// Outgoing TCP connections (lsof) of the instance's pids, with resolved host.
export async function tcpConnections(pids) {
  if (!pids.length) return [];
  let out = "";
  try {
    out = execFileSync("/usr/sbin/lsof", ["-nP", "-a", "-iTCP", "-p", pids.join(",")], { encoding: "utf8" });
  } catch (e) { out = (e.stdout || "").toString(); }
  const map = await ipToHostMap();
  const rows = [];
  for (const line of out.split("\n").slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 9) continue;
    const name = cols.slice(8).join(" ");
    const state = (name.match(/\((\w+)\)/) || [])[1] || "";
    const pid = +cols[1];
    if (state === "LISTEN") {
      rows.push({ pid, state, local: name.replace(/\s*\(\w+\)/, "") });
      continue;
    }
    const m = name.match(/->\[([0-9a-f:.]+)\]:(\d+)/i) || name.match(/->([0-9.]+):(\d+)/);
    if (!m) continue;
    const ip = m[1];
    let host = map.get(ip) || null;
    if (!host && !/^127\.|^::1$/.test(ip)) {
      try { host = (await dns.reverse(ip))[0] || null; } catch { host = null; }
    }
    rows.push({ pid, state, ip, port: +m[2], host: host || (/^127\.|^::1$/.test(ip) ? "loopback" : `?(${ip})`) });
  }
  return rows;
}

// ---- misc --------------------------------------------------------------------
export function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
  return file;
}

export function logTail(instance, n = 60) {
  try { return fs.readFileSync(instance.paths.mainLog, "utf8").split("\n").slice(-n).join("\n"); } catch { return ""; }
}

export function logText(instance) {
  try { return fs.readFileSync(instance.paths.mainLog, "utf8"); } catch { return ""; }
}

export { ui, instancePaths, launch };

// ---- logged-in profiles (qa-8/qa-9 of t-cross-cutting) ---------------------------
// The harness launch() takes the profile and slot (N-1) locks. No reset.
export async function startProfile(name, { wantHome = true, timeoutMs = 120000 } = {}) {
  const { profilePaths } = await import("../../lib/config.mjs");
  const paths = profilePaths(name);
  if (!fs.existsSync(paths.marker)) throw new Error(`profile ${name} has no .logged-in marker (run login.mjs)`);
  const instance = await launch({ paths });
  try {
    const h = await attachTo(instance, { readyTimeoutMs: timeoutMs });
    // logged in = workspace navbar visible. The app restores the last visited section
    // (localStorage tempo:active-nav-route), so "home" requires clicking Chat.
    const nav = await h.page.locator('[data-testid="workspace-navbar"]').first().waitFor({ state: "visible", timeout: timeoutMs }).then(() => true, () => false);
    const navMs = Date.now() - instance.startedAtMs;
    let screen = nav ? "logged" : await ui.detectScreen(h.page);
    if (nav && wantHome) {
      await h.page.locator('[data-testid="workspace-navbar-chat-button"]').first().click({ timeout: 5000 }).catch(() => {});
      const sc = await ui.waitForScreen(h.page, ["home"], { timeoutMs: 20000, stableMs: 800 });
      screen = sc.timedOut ? "logged" : sc.screen;
    }
    return { instance, ...h, homeMs: nav ? navMs : null, screen };
  } catch (e) {
    await hardTeardown(instance);
    throw e;
  }
}

// Network profiles (DevTools presets). Applied via CDP in the renderer.
export const NET = {
  online: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
  offline: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
  "3g": { offline: false, latency: 300, downloadThroughput: Math.round((1.6 * 1024 * 1024 / 8) * 0.9), uploadThroughput: Math.round((750 * 1024 / 8) * 0.9) },
  "slow-3g": { offline: false, latency: 2000, downloadThroughput: Math.round((500 * 1024 / 8) * 0.8), uploadThroughput: Math.round((500 * 1024 / 8) * 0.8) },
};
export async function setNet(session, preset) {
  await session.send("Network.enable").catch(() => {});
  await session.send("Network.emulateNetworkConditions", NET[preset]);
}
