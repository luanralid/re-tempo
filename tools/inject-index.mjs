#!/usr/bin/env node
/*
 * tools/inject-index.mjs — IDEMPOTENT injection of the live block into index.html
 * ---------------------------------------------------------------------------
 * Usage: node tools/inject-index.mjs [--dry-run] <path/to/index.html>
 *
 * The block between the sentinels is the ONLY place where mods are loaded.
 * Safe to rerun (running it again does not duplicate anything):
 *   1) one-time backup at index.html.pre-live-bak (first real run only);
 *   2) removes the old copy-based injection (feature/APPLY.md: the <script
 *      src="./agent-runs-panel.js"> that pointed at the copy in the renderer);
 *   3) removes any previous live block (between the sentinels);
 *   4) removes every other <link>/<script> pointing at ./mod/ (tags added by
 *      hand outside the block), so each mod is loaded once, from the block;
 *   5) inserts a fresh live block before </body>, pointing at ./mod/ (the
 *      symlink to the repo's feature/), in MODS order: a <link> when
 *      feature/<mod>.css exists, then the <script>.
 *
 * --dry-run prints the diff (removed/added lines) and writes nothing.
 * Without it, writes only when something changed.
 * Warns about mod .js files listed in MODS that are missing from feature/
 * (their <script> is still written, so an in-progress mod starts loading as
 * soon as its file lands; a new .css needs a rerun to get its <link>).
 *
 * Env config (optional): FEATURE_DIR (../feature relative to this file).
 * ---------------------------------------------------------------------------
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FEATURE_DIR = path.resolve(process.env.FEATURE_DIR || path.join(HERE, "..", "feature"));

const SENTINEL_OPEN = "<!-- RE-TEMPO LIVE-RELOAD (sentinel) -->";
const SENTINEL_CLOSE = "<!-- /RE-TEMPO LIVE-RELOAD -->";

// Load order. One entry per mod: feature/<name>.js (+ feature/<name>.css when present).
const MODS = [
  "ui-motion",
  "agent-runs-panel",
  "home-title",
  "voice-input",
  "usage-bar",
  "effort-levels",
  "canvas-quick",
  "canvas-chrome",
  "canvas-keys",
  "canvas-snap",
  "canvas-browser",
  "canvas-webpanel",
  "canvas-shader",
  "canvas-export",
  "canvas-comment-agent",
  "canvas-props",
  "profile-page",
  "decision-model",
  "pane-dock",
  "zoom",
  "bg-tasks",
  "canvas-autosetup",
  "sidebar-chats",
  "comment-bubbles",
  "agent-cursors",
  "agent-follow",
  "project-sidebar",
  "tab-close",
  "hide-devserver-tab",
  "rail-menu",
  "title-crumb",
  "canvas-paste",
  "ui-beam",
  "ui-drive",
  "app-map",
  "smart-suggestions",
  "window-frame",
  "shell-glass",
];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const unknown = args.filter((a) => a.startsWith("--") && a !== "--dry-run");
const indexPath = args.find((a) => !a.startsWith("--"));
if (!indexPath || unknown.length) {
  if (unknown.length) console.error("unknown option(s):", unknown.join(" "));
  console.error("usage: node inject-index.mjs [--dry-run] <index.html>");
  process.exit(1);
}
if (!fs.existsSync(indexPath)) {
  console.error("ERROR: index.html not found:", indexPath);
  process.exit(1);
}

// --- live block, built from what exists in feature/ ---------------------------
const exists = (file) => fs.existsSync(path.join(FEATURE_DIR, file));
const missing = [];
let liveBlock = `    ${SENTINEL_OPEN}\n`;
for (const name of MODS) {
  if (exists(`${name}.css`)) liveBlock += `    <link rel="stylesheet" data-rar-css href="./mod/${name}.css">\n`;
  if (!exists(`${name}.js`)) missing.push(`${name}.js`);
  liveBlock += `    <script src="./mod/${name}.js"></script>\n`;
}
liveBlock += `    ${SENTINEL_CLOSE}\n`;

const original = fs.readFileSync(indexPath, "utf8");
let html = original;

// 2) remove the old copy-based injection (points at ./agent-runs-panel.js)
html = html.replace(
  /[ \t]*<!-- RE-TEMPO · Agent Runs feature[^\n]*-->\n[ \t]*<script\s+src="\.\/agent-runs-panel\.js"><\/script>\n?/g,
  ""
);

// 3) remove any previous live block (between the sentinels)
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const liveRe = new RegExp(`[ \\t]*${esc(SENTINEL_OPEN)}[\\s\\S]*?${esc(SENTINEL_CLOSE)}[ \\t]*\\n?`, "g");
html = html.replace(liveRe, "");

// 4) remove every other ./mod/ tag (outside the block); the whole line goes
//    only when the tag is alone on it, otherwise just the tag
const strays = [];
const MOD_REF = `["'](?:\\./)?mod/[^"']*["']`;
const strayRes = [
  new RegExp(`([ \\t]*)(<link\\b[^>]*\\bhref=${MOD_REF}[^>]*>)([ \\t]*\\n?)`, "gi"),
  new RegExp(`([ \\t]*)(<script\\b[^>]*\\bsrc=${MOD_REF}[^>]*>\\s*</script>)([ \\t]*\\n?)`, "gi"),
];
for (const re of strayRes) {
  html = html.replace(re, (_m, lead, tag, trail, offset, str) => {
    strays.push(tag);
    const lineStart = offset === 0 || str[offset - 1] === "\n";
    const lineEnd = trail.endsWith("\n") || offset + _m.length === str.length;
    return lineStart && lineEnd ? "" : lead + (trail.endsWith("\n") ? "\n" : "");
  });
}

// 5) insert the live block before </body>
if (!/<\/body>/i.test(html)) {
  console.error("ERROR: </body> not found in index.html; nothing changed.");
  process.exit(1);
}
html = html.replace(/([ \t]*)<\/body>/i, (_m, indent) => `${liveBlock}${indent}</body>`);

// --- report -------------------------------------------------------------------
if (strays.length) console.log(`moved into the live block (were outside it): ${strays.length} tag(s)`);
if (missing.length) {
  console.warn(`WARNING: referenced but missing in ${FEATURE_DIR}: ${missing.join(", ")}`);
}

// Minimal line diff (LCS); index.html is small.
function lineDiff(a, b) {
  const A = a.split("\n");
  const B = b.split("\n");
  const n = A.length;
  const m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) {
      i++;
      j++;
    } else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) {
      out.push(`+ ${String(j + 1).padStart(4)} | ${B[j]}`);
      j++;
    } else {
      out.push(`- ${String(i + 1).padStart(4)} | ${A[i]}`);
      i++;
    }
  }
  return out;
}

if (html === original) {
  console.log("index.html already had the correct live block (no change).");
  process.exit(0);
}

if (dryRun) {
  const d = lineDiff(original, html);
  console.log(`--dry-run: ${indexPath} would change (${d.filter((l) => l[0] === "-").length} removed, ${d.filter((l) => l[0] === "+").length} added); nothing written.`);
  for (const l of d) console.log(l);
  process.exit(0);
}

// 1) one-time backup (pre-live state)
const bak = indexPath + ".pre-live-bak";
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, original);
  console.log("backup created:", bak);
}
fs.writeFileSync(indexPath, html);
console.log(`index.html updated: ${MODS.length} mods load from ./mod/, inside the live block only.`);
