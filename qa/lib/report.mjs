// qa/lib/report.mjs — writes the JSON + Markdown report of a run.
// -----------------------------------------------------------------------------
// Deterministic output in /tmp/tempo-qa/runs/<timestamp>/ with report.json,
// report.md and the per-test screenshots. Pass/fail/skip summary per test.
import fs from "node:fs";
import path from "node:path";
import { RUNS_DIR } from "./config.mjs";

// Unique directory per run. NON-recursive mkdir is atomic: two runs in the same
// second get <stamp> and <stamp>-2 (instead of overwriting the same report).
export function newRunDir(base = isoStamp()) {
  fs.mkdirSync(RUNS_DIR, { recursive: true, mode: 0o700 });
  for (let n = 1; n < 1000; n++) {
    const stamp = n === 1 ? base : `${base}-${n}`;
    const dir = path.join(RUNS_DIR, stamp);
    try { fs.mkdirSync(dir); return { dir, stamp }; }
    catch (e) { if (e.code !== "EEXIST") throw e; }
  }
  throw new Error(`could not create a unique run directory for ${base}`);
}

export function isoStamp(d = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

// result: { suite, startedAt, durationMs, instances, tests: [...] }
// each test: { name, instanceId, status: pass|fail|skip, durationMs, bootMs,
//              checks: [{ok,label,detail}], screenshots: [path], notes, error }
export function writeReport(runDir, result) {
  const jsonPath = path.join(runDir, "report.json");
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  const mdPath = path.join(runDir, "report.md");
  fs.writeFileSync(mdPath, toMarkdown(result));
  return { jsonPath, mdPath };
}

function statusIcon(s) {
  return s === "pass" ? "PASS" : s === "fail" ? "FAIL" : "SKIP";
}

function toMarkdown(r) {
  const lines = [];
  const total = r.tests.length;
  const pass = r.tests.filter((t) => t.status === "pass").length;
  const fail = r.tests.filter((t) => t.status === "fail").length;
  const skip = r.tests.filter((t) => t.status === "skip").length;

  lines.push(`# RE-TEMPO QA report — ${r.suite}`);
  lines.push("");
  lines.push(`- Start: ${r.startedAt}`);
  lines.push(`- Total duration: ${Math.round(r.durationMs)} ms`);
  lines.push(`- Instances: ${r.instances} (parallel)`);
  lines.push(`- Repeats: ${r.repeat ?? 1}`);
  lines.push(`- Result: **${pass}/${total} PASS**, ${fail} FAIL, ${skip} SKIP`);
  lines.push("");

  // Per-test summary.
  lines.push("## Per-test summary");
  lines.push("");
  lines.push("| Status | Test | Instance | Boot (ms) | Checks ok/total | Duration (ms) |");
  lines.push("|---|---|---|---:|---:|---:|");
  for (const t of r.tests) {
    const ok = (t.checks || []).filter((c) => c.ok).length;
    const tot = (t.checks || []).length;
    lines.push(
      `| ${statusIcon(t.status)} | ${t.name} | ${t.instanceId} | ${t.bootMs ?? "-"} | ${ok}/${tot} | ${Math.round(t.durationMs || 0)} |`
    );
  }
  lines.push("");

  // Per-test detail.
  lines.push("## Detail");
  for (const t of r.tests) {
    lines.push("");
    lines.push(`### ${statusIcon(t.status)} — ${t.name} @ inst-${t.instanceId}`);
    if (t.bootMs != null) {
      const parts = [];
      if (t.bootDevtoolsMs != null) parts.push(`devtools=${t.bootDevtoolsMs}ms`);
      if (t.bootTargetMs != null) parts.push(`ui=${t.bootTargetMs}ms`);
      const what = t.bootHomeMs != null ? "spawn -> logged-in home" : "spawn -> UI via CDP";
      lines.push(`- Boot (${what}): ${t.bootMs} ms${parts.length ? ` (${parts.join(", ")})` : ""}`);
    }
    if (t.identity) lines.push(`- Visible identity: ${JSON.stringify(t.identity)}`);
    if (t.screen) lines.push(`- Detected screen: \`${t.screen}\``);
    if (t.perf) lines.push(`- Perf: ${JSON.stringify(t.perf)}`);
    if (t.network && t.network.length) {
      lines.push(`- Network (domains): ${t.network.map((n) => `${n.domain}[${n.statuses.join(",")}]`).join(", ")}`);
    }
    if (t.sidebar && t.sidebar.length) {
      lines.push(`- Sidebar/nav (${t.sidebar.length}): ${t.sidebar.map((s) => s.label).join(" · ")}`);
    }
    if (t.consoleErrors != null) lines.push(`- Console errors: ${t.consoleErrors}; warnings: ${t.consoleWarnings}; exceptions: ${t.exceptions}`);
    if (t.notes) lines.push(`- Notes: ${t.notes}`);
    if (t.error) lines.push(`- Error: \`${t.error}\``);
    if (t.checks && t.checks.length) {
      lines.push("");
      for (const c of t.checks) lines.push(`  - [${c.ok ? "x" : " "}] ${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
    }
    if (t.screenshots && t.screenshots.length) {
      lines.push("");
      for (const s of t.screenshots) lines.push(`  - screenshot: \`${s}\``);
    }
  }
  lines.push("");
  return lines.join("\n");
}
