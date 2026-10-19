// qa/suites/80-cross-cutting/driver.mjs — runner for the cross-cutting suites in their own slots.
// -----------------------------------------------------------------------------
// Equivalent to run.mjs (same suite and report contract), but the primary
// instance starts in ephemeral slot 0 of t-cross-cutting (index 10, CDP 9411), outside
// the qa-N profile slots. Usage:
//   node suites/80-cross-cutting/driver.mjs --suite 80-cross-cutting-logged-out [--only a,b] [--repeat K]
// Report: /tmp/tempo-qa/runs/tx-<timestamp>/report.{json,md}.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Checker } from "../../lib/assert.mjs";
import { perfMetrics } from "../../lib/collect.mjs";
import { newRunDir, writeReport, isoStamp } from "../../lib/report.mjs";
import * as ui from "../../lib/ui.mjs";
import * as C from "./common.mjs";
import fs from "node:fs";
import { sessionInfo } from "../../lib/session.mjs";

// Isolation guard: a LOGGED-OUT instance must never gain a session. If it does
// (e.g. a login callback from an old browser tab landed on the slot's port),
// it kills it, deletes the session file in its own ephemeral dir and returns true.
async function contaminated(h) {
  const si = sessionInfo(h.instance.paths);
  if (!si.present) return false;
  await C.stopAll([h]);
  for (const f of [path.join(h.instance.paths.dataDir, ".tempo-auth.json"), path.join(h.instance.paths.home, ".tempo-auth.json")]) {
    try { fs.unlinkSync(f); } catch { /* absent */ }
  }
  return true;
}

function parseArgs(argv) {
  const a = { suite: "80-cross-cutting-logged-out", only: null, repeat: 1 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--suite") a.suite = argv[++i];
    else if (k === "--only") a.only = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (k === "--repeat") a.repeat = parseInt(argv[++i], 10);
  }
  return a;
}

async function main() {
  const opts = parseArgs(process.argv);
  const mod = await import(pathToFileURL(path.join(import.meta.dirname, "..", `${opts.suite}.mjs`)).href);
  const suite = mod.default;
  const tests = suite.tests.filter((t) => !opts.only || opts.only.includes(t.name));
  const { dir: runDir, stamp } = newRunDir(`tx-${isoStamp()}`);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  console.log(`[tx] suite=${suite.name} tests=${tests.length} repeat=${opts.repeat} => ${runDir}`);

  let h = null;
  const results = [];
  try {
    h = await C.startEphemeral(0, { tag: "txmain" });
    const instDir = path.join(runDir, `inst-${h.instance.id}`);
    for (let k = 1; k <= opts.repeat; k++) {
      for (const test of tests) {
        const name = opts.repeat > 1 ? `${test.name} #${k}` : test.name;
        const checker = new Checker();
        const rec = { name, instanceId: h.instance.id, status: "pass", durationMs: 0, bootMs: h.instance.bootMs, checks: [], screenshots: [] };
        const s = Date.now();
        try {
          await test.fn({ suite, instance: h.instance, page: h.page, collectors: h.collectors, checker, runDir, instDir, lib: { ui, perfMetrics }, rec, repeatIndex: k });
          rec.checks = checker.checks;
          rec.status = rec.skip ? "skip" : checker.allOk ? "pass" : "fail";
        } catch (e) {
          rec.checks = checker.checks;
          rec.status = "fail";
          rec.error = (e && e.message) || String(e);
        }
        rec.durationMs = Date.now() - s;
        if (await contaminated(h)) {
          rec.status = "fail";
          rec.checks.push({ ok: false, label: "primary stayed logged out (isolation)", detail: "a real session appeared in the ephemeral profile during the test; instance killed, session deleted, primary recreated" });
          h = await C.startEphemeral(0, { tag: "txmain" });
        } else if (!(await h.page.evaluate(() => 1).then(() => true, () => false))) {
          // primary died (e.g. external quit): record it and recreate for the next tests
          rec.primaryLost = true;
          rec.notes = `${rec.notes ? rec.notes + "; " : ""}primary terminated during the test (log: ${JSON.stringify(C.logTail(h.instance, 6).split("\n").filter((l) => /quit|crash|exit/i.test(l)))})`;
          await C.stopAll([h]);
          h = await C.startEphemeral(0, { tag: "txmain" });
        }
        results.push(rec);
        console.log(`[tx] ${rec.status.toUpperCase()} ${name} (${checker.passed}/${checker.checks.length} checks, ${Math.round(rec.durationMs / 1000)} s)${rec.error ? " error: " + rec.error.slice(0, 160) : ""}`);
      }
    }
  } catch (e) {
    results.push({ name: "launch", instanceId: "txmain-0", status: "fail", durationMs: 0, checks: [{ ok: false, label: "primary started", detail: e.message }], error: e.message });
  } finally {
    if (h) await C.stopAll([h]);
  }
  const result = { suite: suite.name, startedAt, durationMs: Date.now() - t0, instances: 1, repeat: opts.repeat, stamp, tests: results };
  const { jsonPath, mdPath } = writeReport(runDir, result);
  const pass = results.filter((t) => t.status === "pass").length;
  const fail = results.filter((t) => t.status === "fail").length;
  const skip = results.filter((t) => t.status === "skip").length;
  console.log(`[tx] END: ${pass} PASS / ${fail} FAIL / ${skip} SKIP (${results.length})`);
  console.log(`[tx] JSON: ${jsonPath}\n[tx] MD:   ${mdPath}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("[tx] fatal error:", e); process.exit(2); });
