// qa/suites/80-cross-cutting/export-evidence.mjs — copies a run's evidence into the repo.
// -----------------------------------------------------------------------------
// Usage: node suites/80-cross-cutting/export-evidence.mjs <runDir> <label>
// Destination: docs/qa/evidence/cross-cutting/<label>/ (report.md + report.json + *.json
// of the instances). Refuses any file that looks like a JWT/cookie/token
// and replaces the OS e-mail/user/host with placeholders. Screenshots are not copied.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [runDir, label] = process.argv.slice(2);
if (!runDir || !label || !/^[a-z0-9-]+$/i.test(label)) {
  console.error("usage: export-evidence.mjs <runDir> <alphanumeric-label>");
  process.exit(2);
}
const src = path.resolve(runDir);
if (!src.startsWith("/tmp/tempo-qa/runs/")) { console.error("refused: runDir outside /tmp/tempo-qa/runs/"); process.exit(2); }
const dest = path.resolve(import.meta.dirname, "../../../docs/qa/evidence/cross-cutting", label);

const SECRET = [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, /"(token|sessionId|cookie|authorization)"\s*:\s*"[^"]{8,}"/i, /sk-[A-Za-z0-9]{20,}/];
const user = (() => { try { return os.userInfo().username; } catch { return null; } })();
const host = (() => { try { return os.hostname(); } catch { return null; } })();
const scrub = (txt) => {
  let t = txt.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<email>");
  if (host && host.length > 3) t = t.split(host).join("<os-hostname>");
  return t.replace(/\/Users\/[^/"\s]+\//g, (m) => (user && m.split("/")[2] === user ? "~/" : m));
};

const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(json|md)$/.test(e.name)) files.push(p);
  }
};
walk(src);
fs.mkdirSync(dest, { recursive: true });
const out = { copied: [], refused: [] };
for (const f of files) {
  const raw = fs.readFileSync(f, "utf8");
  if (SECRET.some((re) => re.test(raw))) { out.refused.push(path.relative(src, f)); continue; }
  const rel = path.relative(src, f).replace(/\//g, "__");
  fs.writeFileSync(path.join(dest, rel), scrub(raw));
  out.copied.push(rel);
}
fs.writeFileSync(path.join(dest, "SOURCE.txt"), `run: ${path.basename(src)}\ncopied: ${new Date().toISOString()}\nfiles: ${out.copied.length}\nrefused (possible secret): ${out.refused.join(", ") || "none"}\n`);
console.log(JSON.stringify({ dest: path.relative(process.cwd(), dest), ...out }, null, 1));
