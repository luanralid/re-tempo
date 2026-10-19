// qa/run.mjs — multi-instance runner for the qa/suites/*.mjs suites.
// -----------------------------------------------------------------------------
// Usage:
//   node run.mjs --suite 00-smoke --instances 2 --repeat 1 [--keep-profile]
//   node run.mjs --suite 01-smoke-logged-in --profile qa-1
//   node run.mjs --suite 01-smoke-logged-in --profiles qa-1,qa-2,qa-3
//
// Ephemeral (default): starts N isolated instances in PARALLEL (indices 0..N-1 =>
// ids a,b,c...), fresh profile per run (unless --keep-profile).
// Profiles (--profile/--profiles): uses the persistent LOGGED-IN profiles created by
// login.mjs, WITHOUT resetting, with an exclusive lock per profile (two runs on the same
// profile = the second fails right away). Different profiles run in parallel.
// JSON+Markdown report in /tmp/tempo-qa/runs/<timestamp>/.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launch, teardown, installSignalCleanup } from "./instance.mjs";
import { profilePaths, instancePaths, MAX_INSTANCES } from "./lib/config.mjs";
import { isLockHeld, slotLockPath } from "./lib/lock.mjs";
import { portsFree } from "./lib/ports.mjs";
import { connect, pickMainPage } from "./lib/cdp.mjs";
import { attachCollectors, perfMetrics } from "./lib/collect.mjs";
import { Checker } from "./lib/assert.mjs";
import * as ui from "./lib/ui.mjs";
import { newRunDir, writeReport } from "./lib/report.mjs";

function parseArgs(argv) {
  const a = { suite: "00-smoke", instances: 1, repeat: 1, keepProfile: false, profiles: [] };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--suite") a.suite = argv[++i];
    else if (k === "--instances") a.instances = parseInt(argv[++i], 10);
    else if (k === "--repeat") a.repeat = parseInt(argv[++i], 10);
    else if (k === "--keep-profile") a.keepProfile = true;
    else if (k === "--profile" || k === "--profiles") a.profiles.push(...argv[++i].split(",").map((s) => s.trim()).filter(Boolean));
  }
  a.profiles = [...new Set(a.profiles)];
  return a;
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const idForIndex = (i) => (i < LETTERS.length ? LETTERS[i] : `i${i}`);

async function loadSuite(name) {
  const file = path.join(import.meta.dirname, "suites", `${name}.mjs`);
  const mod = await import(pathToFileURL(file).href);
  const suite = mod.default || mod.suite;
  if (!suite || !Array.isArray(suite.tests)) throw new Error(`invalid suite: ${name}`);
  return suite;
}

// Runs the whole suite on an already connected instance. Returns a list of test results.
async function runSuiteOnInstance(suite, instance, page, collectors, runDir, repeat) {
  const results = [];
  const instDir = path.join(runDir, `inst-${instance.id}`);
  const lib = { ui, perfMetrics };

  for (let k = 1; k <= repeat; k++) {
    for (const test of suite.tests) {
      const name = repeat > 1 ? `${test.name} #${k}` : test.name;
      const checker = new Checker();
      const rec = {
        name,
        instanceId: instance.id,
        status: "pass",
        durationMs: 0,
        bootMs: instance.bootMs,
        checks: [],
        screenshots: [],
      };
      const t0 = Date.now();
      try {
        const ctx = { suite, instance, page, collectors, checker, runDir, instDir, lib, rec, repeatIndex: k };
        await test.fn(ctx);
        rec.checks = checker.checks;
        rec.status = checker.allOk ? "pass" : "fail";
      } catch (e) {
        rec.checks = checker.checks;
        rec.status = "fail";
        rec.error = (e && e.message) || String(e);
      }
      rec.durationMs = Date.now() - t0;
      results.push(rec);
    }
  }
  return results;
}

// Run target: persistent profile (qa-N, fixed slot N-1) or ephemeral
// instance. Ephemeral ones take FREE slots from the top of the range (19, 18, ...) so they do not
// collide with profiles qa-1..qa-N (slots 0..N-1) nor with other agents' runs;
// ids = order letter + slot (a19, b18...): they never collide between concurrent runs.
async function targetsFor(opts) {
  if (opts.profiles.length) {
    return opts.profiles.map((name) => {
      const paths = profilePaths(name);
      return { id: paths.id, paths, launchOpts: { paths }, marker: paths.marker };
    });
  }
  const targets = [];
  for (let slot = MAX_INSTANCES - 1; slot >= 0 && targets.length < opts.instances; slot--) {
    if (isLockHeld(slotLockPath(slot))) continue;
    const { cdp, authCallback, webCapture } = instancePaths("probe", slot).ports;
    if (!(await portsFree({ cdp, authCallback, webCapture }))) continue;
    const id = `${idForIndex(targets.length)}${slot}`; // e.g. a19 — unique per slot (the slot lock is exclusive)
    targets.push({ id, launchOpts: { id, index: slot, keepProfile: opts.keepProfile } });
  }
  if (targets.length < opts.instances) throw new Error(`only ${targets.length} free slot(s) for ${opts.instances} instance(s)`);
  return targets;
}

async function handleInstance(suite, target, opts, runDir) {
  const id = target.id;
  let instance = null;
  try {
    // launch() acquires the slot and directory/profile locks (another run on the same
    // profile or slot fails here, without touching the first one).
    if (target.marker && !fs.existsSync(target.marker)) console.log(`[run] warning: ${id} has no .logged-in (run login.mjs); the suite will see the real screen`);
    instance = await launch(target.launchOpts);
    const browser = await connect(instance.cdpPort);
    const page = await pickMainPage(browser);
    if (!page) throw new Error("no main page (index.html) found via CDP");
    const collectors = attachCollectors(page);
    await ui.waitForReady(page);
    const results = await runSuiteOnInstance(suite, instance, page, collectors, runDir, opts.repeat);
    collectors.stop();
    try { await browser.close(); } catch { /* CDP connection; does not kill the app */ }
    return results;
  } catch (e) {
    return [{
      name: "launch", instanceId: id, status: "fail", durationMs: 0,
      checks: [{ ok: false, label: "instance started and connected", detail: (e && e.message) || String(e) }],
      error: (e && e.message) || String(e),
    }];
  } finally {
    if (instance) {
      try { await teardown(instance); }
      catch (e) { console.error(`[run] WARNING teardown ${id}: ${e.message}`); }
    }
  }
}

async function main() {
  installSignalCleanup();
  const opts = parseArgs(process.argv);
  const suite = await loadSuite(opts.suite);
  const { dir: runDir, stamp } = newRunDir();
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  const targets = await targetsFor(opts);
  const mode = opts.profiles.length ? `profiles=${targets.map((t) => t.id).join(",")}` : `instances=${targets.length}`;
  console.log(`[run] suite=${opts.suite} ${mode} repeat=${opts.repeat}`);
  console.log(`[run] report => ${runDir}`);

  const perInstance = await Promise.all(targets.map((t) => handleInstance(suite, t, opts, runDir)));
  const tests = perInstance.flat();

  const result = {
    suite: suite.name || opts.suite,
    startedAt,
    durationMs: Date.now() - t0,
    instances: targets.length,
    profiles: opts.profiles.length ? targets.map((t) => t.id) : undefined,
    repeat: opts.repeat,
    stamp,
    tests,
  };
  const { jsonPath, mdPath } = writeReport(runDir, result);

  const pass = tests.filter((t) => t.status === "pass").length;
  const fail = tests.filter((t) => t.status === "fail").length;
  const skip = tests.filter((t) => t.status === "skip").length;
  console.log(`[run] END: ${pass} PASS / ${fail} FAIL / ${skip} SKIP (${tests.length} tests)`);
  console.log(`[run] JSON: ${jsonPath}`);
  console.log(`[run] MD:   ${mdPath}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("[run] fatal error:", e); process.exit(2); });
