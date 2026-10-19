#!/usr/bin/env node
// qa/changelog/make-lab-app.mjs — "lab app" to capture BEFORE/AFTER
// -----------------------------------------------------------------------------
// Uso: node qa/changelog/make-lab-app.mjs
//
// Clones (APFS clonefile, `cp -cR`; almost zero disk) ~/RE-TEMPO/RE-TEMPO.app to
// /tmp/tempo-qa/changelog-app/RE-TEMPO.app and replaces, ONLY IN THE COPY, the index.html
// mods block with a loader that reads the list of mods to SKIP:
//   sessionStorage["rtq.skip"]  (lasts until the window is closed; survives reload)
//   localStorage["rtq.skip"]    (persistent in the profile; used if sessionStorage is missing)
// Values: "" (all mods = AFTER), "*" (no mods = original Tempo = BEFORE),
// or "zoom,tab-close" (all except those).
// window.__RTQ_MODS__ = { skip, loaded: [...] } shows what was loaded.
//
// The loader uses document.write during parsing: the <script> tags remain classic,
// synchronous and in the SAME order as the original block (tools/inject-index.mjs), before the
// type=module bundle. The out/renderer/mod -> feature/ symlink of the repo is preserved,
// so the copy runs the current mod code. ~/RE-TEMPO/RE-TEMPO.app is not modified.
// -----------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { RE_TEMPO_BASE } from "../lib/config.mjs";

const SRC = path.join(RE_TEMPO_BASE, "RE-TEMPO.app");
const DST_DIR = "/tmp/tempo-qa/changelog-app";
const DST = path.join(DST_DIR, "RE-TEMPO.app");
const FEATURE = path.resolve(import.meta.dirname, "..", "..", "feature");
export const LAB_BIN = path.join(DST, "Contents", "MacOS", "Tempo");

// Same order as tools/inject-index.mjs (MODS).
export const MODS = [
  "agent-runs-panel", "home-title", "voice-input", "usage-bar", "effort-levels",
  "canvas-quick", "canvas-keys", "canvas-snap", "canvas-browser", "canvas-shader",
  "profile-page", "decision-model", "pane-dock", "zoom", "bg-tasks",
  "canvas-autosetup", "sidebar-chats", "canvas-comment-agent", "comment-bubbles", "agent-cursors",
  "agent-follow", "project-sidebar", "tab-close", "rail-menu", "title-crumb",
  "canvas-paste", "ui-beam", "ui-drive", "app-map", "new-page",
];

const OPEN = "<!-- RE-TEMPO LIVE-RELOAD (sentinel) -->";
const CLOSE = "<!-- /RE-TEMPO LIVE-RELOAD -->";

function loaderBlock() {
  const css = MODS.filter((m) => fs.existsSync(path.join(FEATURE, `${m}.css`)));
  return `    <!-- RTQ LAB LOADER (visual changelog; only in this copy) -->
    <script>
      (function () {
        var MODS = ${JSON.stringify(MODS)};
        var CSS = ${JSON.stringify(Object.fromEntries(css.map((m) => [m, 1])))};
        var raw = "";
        try { raw = sessionStorage.getItem("rtq.skip"); if (raw == null) raw = localStorage.getItem("rtq.skip") || ""; } catch (e) {}
        var all = raw.trim() === "*", skip = {};
        raw.split(",").forEach(function (s) { s = s.trim(); if (s) skip[s] = 1; });
        var info = (window.__RTQ_MODS__ = { skip: raw, loaded: [] });
        MODS.forEach(function (m) {
          if (all || skip[m]) return;
          if (CSS[m]) document.write('<link rel="stylesheet" data-rar-css href="./mod/' + m + '.css">');
          document.write('<script src="./mod/' + m + '.js"><\\/script>');
          info.loaded.push(m);
        });
      })();
    </script>
`;
}

export function makeLabApp({ force = false } = {}) {
  const html = path.join(DST, "Contents", "Resources", "app", "out", "renderer", "index.html");
  if (!fs.existsSync(DST)) {
    fs.mkdirSync(DST_DIR, { recursive: true });
    execFileSync("/bin/cp", ["-cR", SRC, DST]);
  } else if (!force && fs.readFileSync(html, "utf8").includes("RTQ LAB LOADER")) {
    return { app: DST, html, rebuilt: false };
  }
  let s = fs.readFileSync(html, "utf8");
  const a = s.indexOf(OPEN), b = s.indexOf(CLOSE);
  if (a >= 0 && b > a) {
    const lineStart = s.lastIndexOf("\n", a) + 1;
    const lineEnd = s.indexOf("\n", b) + 1;
    s = s.slice(0, lineStart) + loaderBlock() + s.slice(lineEnd);
  } else if (s.includes("RTQ LAB LOADER")) {
    s = s.replace(/[ \t]*<!-- RTQ LAB LOADER[\s\S]*?<\/script>\n/, loaderBlock());
  } else {
    throw new Error("mods block not found in the copy's index.html");
  }
  fs.writeFileSync(html, s);
  const link = path.join(DST, "Contents", "Resources", "app", "out", "renderer", "mod");
  return { app: DST, html, rebuilt: true, modLink: fs.readlinkSync(link) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = makeLabApp({ force: process.argv.includes("--force") });
  console.log(`[lab-app] ${r.app} (index rewritten: ${r.rebuilt}) mod -> ${r.modLink || "(unchanged)"}`);
  console.log(`[lab-app] binary: ${LAB_BIN}`);
}
