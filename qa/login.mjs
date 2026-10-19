// qa/login.mjs — creates/validates persistent LOGGED-IN QA profiles (dedicated login per profile).
// -----------------------------------------------------------------------------
// Usage:
//   node login.mjs [--profiles N] [--only qa-2,qa-5] [--force] [--timeout-min 5]
//   node login.mjs --dry-run --only qa-1          # stops BEFORE opening the browser
//
// For each profile qa-1..qa-N, IN SEQUENCE:
//   1. starts the instance on the persistent profile <QA_PROFILES_DIR>/qa-N/ (own HOME,
//      userData and keychain; fixed ports of slot N-1);
//   2. if it already boots logged in (home) -> skips (marker recreated if missing);
//   3. if it is on the auth screen -> clicks "Log in" (the app opens the handoff
//      https://tempo.new/auth-handoff?next=sign-in&callbackPort=<slot port>
//      in the default browser), prints the ">>> Approve the login..." line and waits up to
//      --timeout-min for the logged-in home;
//   4. writes qa-N/.logged-in (date, e-mail/org VISIBLE in the UI, fingerprint
//      of the sessionId — NEVER a token), terminates the instance, moves to the next one.
// Final output: table profile -> ok/failed.
//
// The USER approves the login in the browser. This script does not touch the browser.
// --dry-run: only up to the point where the app would open the browser. Turns on the
// main's inspector (slot port 9501+i), swaps shell.openExternal for a trap that
// CAPTURES the URL without opening anything, clicks "Log in", records URL/port/state and exits.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { launch, teardown, resetProfile, installSignalCleanup } from "./instance.mjs";
import { profilePaths, PROFILES_DIR } from "./lib/config.mjs";
import { connect, pickMainPage } from "./lib/cdp.mjs";
import * as ui from "./lib/ui.mjs";
import { acquireLock, dirLockPath } from "./lib/lock.mjs";
import { sessionInfo, maskEmail } from "./lib/session.mjs";
import { installOpenExternalTrap, readCaptured } from "./lib/inspector.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOKENISH = /[A-Za-z0-9_.\-]{24,}/g;
const redact = (s) => String(s == null ? "" : s).replace(TOKENISH, "<redacted>");
const log = (...a) => console.log("[login]", ...a);

function parseArgs(argv) {
  const a = { profiles: 6, only: null, force: false, dryRun: false, timeoutMin: 5 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--profiles") a.profiles = parseInt(argv[++i], 10);
    else if (k === "--only") a.only = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (k === "--force") a.force = true;
    else if (k === "--dry-run") a.dryRun = true;
    else if (k === "--timeout-min") a.timeoutMin = parseFloat(argv[++i]);
  }
  return a;
}

function readMarker(paths) {
  try { return JSON.parse(fs.readFileSync(paths.marker, "utf8")); } catch { return null; }
}

function writeMarker(paths, data) {
  fs.writeFileSync(paths.marker, JSON.stringify(data, null, 2), { mode: 0o600 });
}

// main.log lines relevant to auth, already redacted.
function authLogLines(mainLog) {
  let txt = "";
  try { txt = fs.readFileSync(mainLog, "utf8"); } catch { return []; }
  return txt.split("\n").filter((l) => /\[Auth|auth callback|auth-handoff|callbackPort/i.test(l)).map(redact);
}

// PIDs listening on a TCP port (read only, via lsof).
function listeners(port) {
  try {
    return execFileSync("/usr/sbin/lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" })
      .split(/\s+/).map((s) => parseInt(s, 10)).filter(Number.isInteger);
  } catch { return []; }
}

// Is the ORIGINAL Tempo running? (a tempo:// fallback could have opened it)
function originalTempoRunning() {
  try {
    execFileSync("/usr/bin/pgrep", ["-f", "^/Applications/Tempo.app/Contents/MacOS/Tempo"], { encoding: "utf8" });
    return true;
  } catch { return false; }
}

// Visible identity + profile session state, for the marker.
async function collectIdentity(page, paths) {
  const id = await ui.readVisibleIdentity(page);
  const sess = sessionInfo(paths);
  return {
    email: id.emails[0] || null,
    org: id.orgs[0] || null,
    avatar: id.avatars[0] || null,
    authFile: sess.authFile,
    sessionFp: sess.sessionFp,
  };
}

// --- dry-run: up to the point where the browser would open ------------------
async function dryRun(inst, page, paths) {
  const out = { profile: paths.id, at: new Date().toISOString(), slotPorts: paths.ports };
  out.sessionBefore = sessionInfo(paths); // expected: present=false (nothing inherited)
  out.bootAuthLog = authLogLines(paths.mainLog);
  out.callbackListeners = listeners(paths.ports.authCallback);
  out.callbackOwnedByInstance = out.callbackListeners.includes(inst.pid);
  out.liveWindowPortUntouched = { port: 17249, listeners: listeners(17249) };

  out.trapInstalled = await installOpenExternalTrap(paths.ports.inspect).catch((e) => { out.trapError = e.message; return false; });
  if (!out.trapInstalled) {
    out.clicked = false;
    out.note = "openExternal trap NOT verified: 'Log in' click NOT performed (so the browser is not opened)";
    return out;
  }
  out.clicked = await ui.clickByText(page, "Log in", { role: "button" });
  let cap = { urls: [], blocked: [] };
  for (let i = 0; i < 30 && out.clicked; i++) {
    cap = await readCaptured(paths.ports.inspect).catch(() => cap);
    if (cap.urls.length) break;
    await sleep(500);
  }
  out.capturedUrls = cap.urls.map(redact);
  out.blockedOpenCalls = cap.blocked;
  const first = cap.urls[0];
  if (first) {
    try {
      const u = new URL(first);
      out.handoff = {
        origin: u.origin,
        pathname: u.pathname,
        params: Object.fromEntries([...u.searchParams].map(([k, v]) => [k, redact(v)])),
      };
      out.callbackPortInUrl = parseInt(u.searchParams.get("callbackPort"), 10) || null;
      out.callbackPortMatchesSlot = out.callbackPortInUrl === paths.ports.authCallback;
    } catch { out.handoff = { raw: redact(first) }; }
  }
  out.screenAfterClick = await ui.detectScreen(page);
  out.authLogAfterClick = authLogLines(paths.mainLog).slice(out.bootAuthLog.length);
  out.sessionAfter = sessionInfo(paths); // still no session: nothing was approved
  return out;
}

// --- one profile -------------------------------------------------------------
async function doProfile(name, opts) {
  const paths = profilePaths(name);
  const row = { profile: paths.id, status: "failed", detail: "", callbackPort: paths.ports.authCallback };
  let release = null, inst = null, browser = null;
  try {
    // Profile lock during ALL of the processing (including the --force reset):
    // run.mjs/clean.mjs on the same profile fail right away meanwhile.
    release = acquireLock(dirLockPath(paths), `login.mjs${opts.dryRun ? " --dry-run" : ""} ${paths.id}`);
    if (opts.force && !opts.dryRun) {
      log(`${paths.id}: --force -> recreating the profile from scratch (the old session is NOT revoked on the server)`);
      await resetProfile(paths);
    }
    inst = await launch({ paths, inspect: opts.dryRun, dirLockHeld: true });
    browser = await connect(inst.cdpPort);
    const page = await pickMainPage(browser);
    if (!page) throw new Error("main page (index.html) not found via CDP");
    await ui.waitForReady(page);
    const first = await ui.waitForScreen(page, ["home", "auth"], { timeoutMs: 120000, stableMs: 2000 });
    const marker = readMarker(paths);

    if (opts.dryRun) {
      if (first.screen !== "auth") {
        row.status = "skipped";
        row.detail = `dry-run only applies to a logged-out profile (screen=${first.screen})`;
        return row;
      }
      const dr = await dryRun(inst, page, paths);
      fs.writeFileSync(path.join(paths.dir, "dryrun.json"), JSON.stringify(dr, null, 2), { mode: 0o600 });
      row.status = dr.clicked && dr.callbackPortMatchesSlot ? "ok (dry-run)" : "failed (dry-run)";
      row.detail = `url=${dr.handoff ? dr.handoff.origin + dr.handoff.pathname : "-"} callbackPort=${dr.callbackPortInUrl ?? "-"} ` +
        `sessionBefore=${dr.sessionBefore.present ? "PRESENT" : "none"} -> ${paths.dir}/dryrun.json`;
      row.dryRun = dr;
      return row;
    }

    if (first.screen === "home") {
      const bootHomeMs = first.firstSeenAt - inst.startedAtMs; // spawn -> home appeared
      if (!marker) {
        writeMarker(paths, { profile: paths.id, loggedInAt: null, verifiedAt: new Date().toISOString(), ...(await collectIdentity(page, paths)), bootHomeMs, slotPorts: paths.ports });
        row.status = "ok";
        row.detail = "already logged in; marker recreated";
      } else {
        writeMarker(paths, { ...marker, verifiedAt: new Date().toISOString(), bootHomeMs });
        row.status = "ok";
        row.detail = "already logged in; skipped";
      }
      return row;
    }
    if (first.screen !== "auth") {
      await ui.screenshot(page, paths.dir, "login-unexpected-screen");
      throw new Error(`unexpected screen at boot: ${first.screen} (screenshot in ${paths.dir})`);
    }

    // Logged out: the marker (if any) is stale.
    if (marker) fs.rmSync(paths.marker, { force: true });
    const tempoOrigBefore = originalTempoRunning();
    const clicked = await ui.clickByText(page, "Log in", { role: "button" });
    if (!clicked) throw new Error("'Log in' button not found on the auth screen");
    console.log(`>>> Approve the login of profile ${paths.id} in the browser (tempo.new tab, callbackPort=${paths.ports.authCallback})`);
    const res = await ui.waitForScreen(page, ["home"], { timeoutMs: opts.timeoutMin * 60000, stableMs: 2000, pollMs: 1000 });
    if (!tempoOrigBefore && originalTempoRunning()) {
      log(`WARNING: the ORIGINAL Tempo opened during the login of ${paths.id} (likely a tempo:// fallback). Check it.`);
    }
    if (res.timedOut) {
      await ui.screenshot(page, paths.dir, "login-timeout");
      throw new Error(`no logged-in home within ${opts.timeoutMin} min (last screen=${res.screen})`);
    }
    // Gives the app time to persist the session before reading presence/fingerprint.
    await sleep(1500);
    const ident = await collectIdentity(page, paths);
    writeMarker(paths, {
      profile: paths.id,
      loggedInAt: new Date().toISOString(),
      ...ident,
      bootHomeMs: null,
      slotPorts: paths.ports,
    });
    row.status = "ok";
    row.detail = `logged in; email=${maskEmail(ident.email) || "(not visible)"} org=${ident.org || "(not visible)"} session=${ident.authFile || "?"}`;
    return row;
  } catch (e) {
    row.status = opts.dryRun ? "failed (dry-run)" : "failed";
    row.detail = redact((e && e.message) || String(e));
    return row;
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
    if (inst) { try { await teardown(inst); } catch (e) { log(`WARNING teardown ${paths.id}: ${e.message}`); } }
    if (release) release();
  }
}

async function main() {
  installSignalCleanup();
  const opts = parseArgs(process.argv);
  const names = opts.only || Array.from({ length: opts.profiles }, (_, i) => `qa-${i + 1}`);
  log(`profiles=${names.join(",")} dir=${PROFILES_DIR}${opts.dryRun ? " (DRY-RUN: no browser will be opened)" : ""}${opts.force ? " --force" : ""}`);
  if (!opts.dryRun) {
    log("In the browser: approve ONLY the tempo.new tab whose callbackPort matches the announced profile.");
    log("If the browser asks to OPEN RE-TEMPO/Tempo (tempo:// link), CANCEL: the right callback is local, on the profile's port.");
  }

  const rows = [];
  for (const n of names) {
    log(`--- ${n} ---`);
    const row = await doProfile(n, opts);
    log(`${row.profile}: ${row.status} — ${row.detail}`);
    rows.push(row);
  }

  // Repeated fingerprints = the handoff reused the SAME session.
  const fps = new Map();
  for (const n of names) {
    const m = readMarker(profilePaths(n));
    if (m && m.sessionFp) fps.set(m.sessionFp, [...(fps.get(m.sessionFp) || []), n]);
  }
  const shared = [...fps.values()].filter((v) => v.length > 1);
  if (shared.length) log(`WARNING: profiles with the SAME session: ${shared.map((g) => g.join("+")).join("; ")} — do not sign out in these profiles.`);

  console.log("\n| profile | callbackPort | status | detail |");
  console.log("|---|---:|---|---|");
  for (const r of rows) console.log(`| ${r.profile} | ${r.callbackPort} | ${r.status} | ${r.detail} |`);
  const bad = rows.filter((r) => r.status.startsWith("failed")).length;
  process.exit(bad ? 1 : 0);
}

main().catch((e) => { console.error("[login] fatal error:", redact(e.message)); process.exit(2); });
