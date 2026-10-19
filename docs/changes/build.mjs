#!/usr/bin/env node
// Builds docs/changes/README.md and docs/changes/index.html from the per-area JSON files in data/
// (items-<area>.json) and the real-app print catalogs (real-<part>.json). Run: node docs/changes/build.mjs
// --no-media: the screenshots and clips are not here (this repo), so each one becomes its caption,
// as text, and nothing links to a missing file. Without the flag, missing media are dropped.
import fs from "node:fs";
import path from "node:path";

const SCR = path.join(path.dirname(new URL(import.meta.url).pathname), "data");
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const OUT = path.join(REPO, "docs/changes");
const NO_MEDIA = process.argv.includes("--no-media");

const GROUPS = [
  ["sidebar", "Sidebar"],
  ["panes", "Panes, tabs and decks"],
  ["canvas", "Canvas"],
  ["chat", "Chat and composer"],
  ["agents", "Agents driving the UI"],
  ["rail", "Rail and title bar"],
  ["prefs", "Settings and preferences"],
  ["infra", "Infrastructure and dev tools"],
  ["other", "Other changes"],
];
const GROUP_NAME = Object.fromEntries(GROUPS);

const modsSrc = fs.readFileSync(path.join(REPO, "tools/inject-index.mjs"), "utf8");
const MODS = [...modsSrc.match(/const MODS = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
// reading order inside each group (most visible first); anything else falls back to load order
const PREFERRED = [
  "project-sidebar", "sidebar-chats", "usage-bar",
  "pane-dock", "tab-close",
  "canvas-quick", "canvas-autosetup", "canvas-paste", "canvas-keys", "canvas-snap", "canvas-browser", "canvas-shader",
  "canvas-chrome", "canvas-export", "canvas-notes", "canvas-props", "canvas-webpanel",
  "canvas-comment-agent", "comment-bubbles", "agent-cursors", "agent-follow",
  "voice-input", "effort-levels", "smart-suggestions", "bg-tasks", "agent-runs-panel",
  "ui-drive", "ui-beam", "app-map", "tempo-ui",
  "rail-menu", "title-crumb", "home-title", "zoom",
  "profile-page", "decision-model",
  "inject-index", "live-reload", "start-live", "bootstrap-local", "qa-harness",
];
const order = (id) => {
  const p = PREFERRED.indexOf(id);
  if (p >= 0) return p;
  const i = MODS.indexOf(id);
  return i < 0 ? 900 : 100 + i;
};

const warnings = [];
const exists = (src) => fs.existsSync(path.join(OUT, src));
const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(SCR, f), "utf8"));
  } catch (e) {
    warnings.push(`bad JSON ${f}: ${e.message}`);
    return null;
  }
};

// ---- load items ---------------------------------------------------------------
const byId = new Map();
for (const f of fs.readdirSync(SCR).filter((f) => /^items-[\w-]+\.json$/.test(f)).sort()) {
  const j = readJson(f);
  if (!j) continue;
  for (const it of j.items || []) {
    it.features = it.features || [];
    if (byId.has(it.id)) {
      warnings.push(`duplicate item ${it.id} in ${f}; features merged`);
      byId.get(it.id).features.push(...it.features);
      continue;
    }
    byId.set(it.id, it);
  }
}
const one = (s) => String(s || "").replace(/\s+/g, " ").trim();
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// ---- real-app prints ----------------------------------------------------------
for (const f of fs.readdirSync(SCR).filter((f) => /^real-[\w-]+\.json$/.test(f)).sort()) {
  const j = readJson(f);
  if (!j) continue;
  for (const im of j.images || []) {
    const it = byId.get(im.mod);
    if (!it) {
      warnings.push(`real print for unknown mod ${im.mod}: ${im.src}`);
      continue;
    }
    const m = { src: im.src, type: "image", caption: im.caption, origin: "real-app" };
    if (im.kind === "before") {
      (it.before = it.before || []).push({ ...m, origin: "original" });
      continue;
    }
    const fn = norm(im.feature);
    const feat =
      fn &&
      (it.features.find((x) => norm(x.name) === fn) ||
        it.features.find((x) => norm(x.name).includes(fn) || fn.includes(norm(x.name))));
    if (feat) {
      feat.media = feat.media || [];
      feat.media.unshift(m);
    } else (it.realMedia = it.realMedia || []).push(m);
  }
}

// ---- evidence/<mod>/ captures --------------------------------------------------
// Captures of the running app; read-only here and linked by relative path (never copied).
// evidence/<mod>/index.json, current contract: {mod, title, summary, shortcut, capturedAt, login,
// files: [{file, type, caption}], notCaptured, simulatedData}. simulatedData: true adds
// "(simulated data)" to every caption. Without index.json the folder is read by file name:
// 01-before.* = original Tempo, 02-after.* = after, NN-<action>.gif/.mp4.
// evidence/ is not in this repo: when it exists, its index (captions, no media) is saved to
// data/evidence.json, and that file stands in for it when it does not.
const EVID = path.join(REPO, "evidence");
const EVID_INDEX = path.join(SCR, "evidence.json");
const extType = (f) =>
  /\.(mp4|webm|mov)$/i.test(f) ? "video" : /\.gif$/i.test(f) ? "gif" : /\.(png|jpe?g|webp)$/i.test(f) ? "image" : null;
const humanize = (f) => {
  const t = f.replace(/\.[^.]+$/, "").replace(/^\d+-/, "").replace(/[-_]+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const evidenceFolders = () => {
  const out = [];
  for (const mod of fs.readdirSync(EVID).sort()) {
    const dir = path.join(EVID, mod);
    if (!fs.statSync(dir).isDirectory()) continue;
    let meta = null;
    if (fs.existsSync(path.join(dir, "index.json"))) {
      try {
        meta = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
      } catch (e) {
        warnings.push(`bad evidence/${mod}/index.json: ${e.message}`);
      }
    }
    const metaFiles = meta && Array.isArray(meta.files) ? meta.files : null;
    const list = metaFiles
      ? metaFiles.map((a) => ({ file: a && a.file, caption: a && a.caption }))
      : fs.readdirSync(dir).filter(extType).sort().map((f) => ({ file: f, caption: null }));
    const keepMeta = meta && {
      title: meta.title,
      summary: meta.summary,
      shortcut: meta.shortcut,
      capturedAt: meta.capturedAt,
      notCaptured: meta.notCaptured,
      simulatedData: meta.simulatedData,
    };
    out.push({ mod, meta: keepMeta, list });
  }
  // the saved index keeps the indexed folders (index.json) of documented changes (an item in data/)
  const saved = out.filter((e) => e.meta && byId.has(e.mod));
  fs.writeFileSync(EVID_INDEX, JSON.stringify({ note: "Index of evidence/ (not in this repo), written by build.mjs", mods: saved }, null, 1) + "\n");
  return out;
};
const evidenceIndex = () => {
  const j = fs.existsSync(EVID_INDEX) ? readJson("evidence.json") : null;
  return (j && j.mods) || [];
};
const evidenceMods = [];
{
  for (const { mod, meta, list } of fs.existsSync(EVID) ? evidenceFolders() : evidenceIndex()) {
    const simulated = !!(meta && meta.simulatedData);
    let it = byId.get(mod);
    if (!it) {
      if (!meta) {
        warnings.push(`evidence/${mod}/ has no item and no index.json; skipped`);
        continue;
      }
      it = { id: mod, title: meta.title || mod, group: "other", files: [`feature/${mod}.js`], summary: meta.summary || "", features: [] };
      byId.set(mod, it);
    }
    if (meta) {
      it.evidenceMeta = {
        shortcut: meta.shortcut,
        capturedAt: meta.capturedAt,
        notCaptured: meta.notCaptured,
      };
      if (!one(it.summary) && meta.summary) it.summary = meta.summary;
    }
    it.evidence = it.evidence || [];
    for (const { file, caption } of list) {
      if (!file || String(file).includes("..")) continue;
      const type = extType(file);
      if (!type) continue;
      const isBefore = /^0*1-before\b/i.test(file);
      let cap =
        caption || (isBefore ? "Before: the original Tempo" : /^0*2-after\b/i.test(file) ? "After: with the mod" : humanize(file));
      if (simulated && !/\(simulated data\)/i.test(cap)) cap = `${cap} (simulated data)`;
      const m = { src: `../../evidence/${mod}/${file}`, type, caption: cap, origin: isBefore ? "original" : "evidence" };
      if (isBefore) (it.before = it.before || []).push(m);
      else it.evidence.push(m);
    }
    evidenceMods.push(mod);
  }
}
for (const m of MODS) if (!byId.has(m)) warnings.push(`mod ${m} (tools/inject-index.mjs) has no item`);

// ---- validate media -----------------------------------------------------------
const keep = (list, where) =>
  (list || []).filter((m) => {
    if (!m || !m.src) return false;
    if (!NO_MEDIA && !exists(m.src)) {
      warnings.push(`missing media ${m.src} (${where})`);
      return false;
    }
    return true;
  });
for (const it of byId.values()) {
  it.realMedia = keep(it.realMedia, it.id);
  it.before = keep(it.before, it.id);
  it.evidence = keep(it.evidence, it.id);
  for (const f of it.features) f.media = keep(f.media, `${it.id}/${f.name}`);
}

// ---- order + numbering --------------------------------------------------------
const items = [...byId.values()].sort((a, b) => {
  const ga = GROUPS.findIndex((g) => g[0] === a.group);
  const gb = GROUPS.findIndex((g) => g[0] === b.group);
  return (ga < 0 ? 99 : ga) - (gb < 0 ? 99 : gb) || order(a.id) - order(b.id) || a.title.localeCompare(b.title);
});
for (const it of items) if (!GROUP_NAME[it.group]) warnings.push(`unknown group ${it.group} for ${it.id}`);
items.forEach((it, i) => {
  it.n = i + 1;
  it.features.forEach((f, k) => (f.n = `${i + 1}.${k + 1}`));
});

const isVid = (m) => m.type === "video" || m.type === "gif";
const isImg = (m) => m.type === "image" || m.type === "gif";
const featHasVideo = (f) => f.media.some(isVid);
const featHasImage = (f) => f.media.some(isImg);
const itemAllMedia = (it) => [...it.realMedia, ...it.before, ...it.evidence, ...it.features.flatMap((f) => f.media)];
const itemHasImage = (it) => itemAllMedia(it).some(isImg);
const itemHasVideo = (it) => itemAllMedia(it).some(isVid);
// a feature marked "done" without a clip of its own is shown in a sibling feature's clip
const coveredBy = (f) => {
  if (featHasVideo(f) || !/^done/i.test(String(f.video || ""))) return null;
  const it = items.find((x) => x.features.includes(f));
  return (it && it.features.find((x) => x !== f && featHasVideo(x))) || null;
};
const pendingReason = (f) => {
  const v = String(f.video || "");
  if (featHasVideo(f) || coveredBy(f)) return null;
  if (/^n\/a/i.test(v)) return { kind: "n/a", why: v.replace(/^n\/a:?\s*/i, "") || "no visible motion" };
  return { kind: "pending", why: v.replace(/^pending:?\s*/i, "") || "not recorded" };
};

const stats = {
  items: items.length,
  features: items.reduce((s, it) => s + it.features.length, 0),
  itemsWithImage: items.filter(itemHasImage).length,
  itemsWithVideo: items.filter(itemHasVideo).length,
  featuresWithImage: items.reduce((s, it) => s + it.features.filter(featHasImage).length, 0),
  featuresWithVideo: items.reduce((s, it) => s + it.features.filter(featHasVideo).length, 0),
  featuresCovered: items.reduce((s, it) => s + it.features.filter((f) => coveredBy(f)).length, 0),
  evidenceMods: items.filter((it) => it.evidence.length).length,
  realPrints: items.reduce((s, it) => s + itemAllMedia(it).filter((m) => m.origin === "real-app").length, 0),
};

// ---- README.md ----------------------------------------------------------------
const enc = (src) => src.split("/").map(encodeURIComponent).join("/");
const alt = (s) => one(s).replace(/[[\]]/g, "");
const baseOf = (src) => src.replace(/\.[^.]+$/, "");

// no media: one caption per clip or picture (a clip's gif and poster share its caption)
function mdCaptionList(list) {
  const bases = new Set(list.filter((m) => m.type !== "video").map((m) => baseOf(m.src)));
  const gifBases = new Set(list.filter((m) => m.type === "gif").map((m) => baseOf(m.src)));
  const caps = [];
  for (const m of list) {
    if (m.type === "video" && bases.has(baseOf(m.src))) continue;
    if (m.type === "image" && gifBases.has(baseOf(m.src))) continue;
    const c = `*${m.type === "video" ? "Video: " : ""}${one(m.caption)}*`;
    if (!caps.includes(c) && !caps.includes(`*${one(m.caption)}*`)) caps.push(c);
  }
  return caps.join("\n\n");
}

function mdMediaList(list) {
  if (NO_MEDIA) return mdCaptionList(list);
  const out = [];
  const shownGifBases = new Set(list.filter((m) => m.type === "gif").map((m) => baseOf(m.src)));
  for (const m of list) {
    if (m.type === "video") {
      out.push(`[Video (mp4): ${alt(m.caption)}](${enc(m.src)})`);
    } else if (m.type === "image" && shownGifBases.has(baseOf(m.src))) {
      continue; // poster of a gif already shown inline
    } else {
      out.push(`![${alt(m.caption)}](${enc(m.src)})  \n*${one(m.caption)}*`);
    }
  }
  return out.join("\n\n");
}

let md = "";
md += `# RE-TEMPO: every change vs the original Tempo\n\n`;
md += `The original Tempo app is not in this repo. Every change below is a **mod**: a \`feature/<name>.js\` file (plus an optional \`.css\`) that \`tools/inject-index.mjs\` loads into the app's renderer, in a fixed order. No mod edits Tempo's bundle. Each entry says what the original app did, what the mod changes, and how to use it.\n\n`;
md += NO_MEDIA
  ? `Media: the screenshots and clips are not in this repo; each one is kept as its caption, and the counts below refer to them. **(fixture)** marks a headless test page that runs the real mod code with fake data; **real app** marks a print of the real Tempo window. A nicer view of the same list is in [index.html](index.html).\n\n`
  : `Media legend: **(fixture)** means a headless test page that loads the real mod code with fake data; **real app** means a print of the real Tempo window; **app capture** media live in \`evidence/<mod>/\` and are linked, not copied. Videos are mp4 links; gifs play inline. A nicer view of the same list is in [index.html](index.html).\n\n`;
md += `| | Count |\n|---|---|\n`;
md += `| Changes (one per mod or tool) | ${stats.items} |\n| Features inside them | ${stats.features} |\n`;
md += `| Changes with at least one image | ${stats.itemsWithImage} |\n| Changes with at least one video or gif | ${stats.itemsWithVideo} |\n`;
md += `| Features with their own video or gif | ${stats.featuresWithVideo} |\n| Features shown in a sibling clip | ${stats.featuresCovered} |\n| Real-app prints used | ${stats.realPrints} |\n| Changes with captures in evidence/ | ${stats.evidenceMods} |\n\n`;

md += `## Contents\n\n`;
for (const [g, gname] of GROUPS) {
  const gi = items.filter((it) => it.group === g);
  if (!gi.length) continue;
  md += `- **${gname}**: ${gi.map((it) => `[${it.n}. ${it.title}](#${it.n}-${slug(it.title)})`).join(", ")}\n`;
}
md += `- [Changes without video, and why](#changes-without-video-and-why)\n\n`;

function notCap(v) {
  return Array.isArray(v) ? v.join("; ") : v && typeof v === "object" ? JSON.stringify(v) : v || "";
}
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9 -]/g, "").trim().replace(/\s+/g, "-");
}

for (const [g, gname] of GROUPS) {
  const gi = items.filter((it) => it.group === g);
  if (!gi.length) continue;
  md += `## ${gname}\n\n`;
  for (const it of gi) {
    md += `### ${it.n}. ${it.title}\n\n`;
    md += `${one(it.summary)}\n\n`;
    md += `**Files:** ${(it.files || []).map((f) => `\`${f}\``).join(", ")}\n\n`;
    if (it.before.length) md += `**Original Tempo, before the mod:**\n\n${mdMediaList(it.before)}\n\n`;
    const em = it.evidenceMeta || {};
    if (one(em.shortcut)) md += `**Shortcut:** ${one(em.shortcut)}\n\n`;
    if (it.evidence.length) md += `**Captured in the app** (\`evidence/${it.id}/\`${em.capturedAt ? `, ${one(em.capturedAt)}` : ""}):\n\n${mdMediaList(it.evidence)}\n\n`;
    if (one(notCap(em.notCaptured))) md += `**Not captured yet:** ${one(notCap(em.notCaptured))}\n\n`;
    if (it.realMedia.length) md += `**In the real app:**\n\n${mdMediaList(it.realMedia)}\n\n`;
    for (const f of it.features) {
      md += `#### ${f.n} ${f.name}\n\n`;
      md += `- **What changed:** ${one(f.what)}\n`;
      if (one(f.how)) md += `- **How to use:** ${one(f.how)}\n`;
      const p = pendingReason(f);
      const cov = coveredBy(f);
      if (cov) md += `- **Video:** shown in the clip of ${cov.n} (${one(cov.name)})\n`;
      if (p) md += `- **Video:** ${p.kind === "n/a" ? "not applicable" : "pending"} (${one(p.why)})\n`;
      md += `\n`;
      if (f.media.length) md += `${mdMediaList(f.media)}\n\n`;
    }
  }
}

md += `## Changes without video, and why\n\n`;
const noVid = [];
for (const it of items)
  for (const f of it.features) {
    const p = pendingReason(f);
    if (p) noVid.push({ it, f, p });
  }
if (!noVid.length) md += `Every feature has a video or gif.\n`;
else {
  md += `| # | Feature | Status | Why |\n|---|---|---|---|\n`;
  for (const { it, f, p } of noVid)
    md += `| ${f.n} | ${it.title}: ${one(f.name)} | ${p.kind === "n/a" ? "not applicable" : "pending"} | ${one(p.why).replace(/\|/g, "/")} |\n`;
}
md += `\n`;
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "README.md"), md);

// ---- index.html ---------------------------------------------------------------
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const badge = (m) =>
  m.origin === "real-app" ? `<span class="tag real">real app</span>` : m.origin === "evidence" ? `<span class="tag ev">app capture</span>` : m.origin === "original" ? `<span class="tag orig">original Tempo</span>` : `<span class="tag fx">fixture</span>`;
const capText = (c) => esc(one(c).replace(/\s*\(fixture\)\s*$/i, ""));

function htmlMain(m, all) {
  if (NO_MEDIA) return "";
  if (m.type === "video") {
    const poster = all.find((x) => x.type === "image" && baseOf(x.src) === baseOf(m.src));
    return `<video src="${esc(m.src)}"${poster ? ` poster="${esc(poster.src)}"` : ""} muted loop playsinline controls preload="metadata" data-auto></video>`;
  }
  return `<img src="${esc(m.src)}" alt="${esc(alt(m.caption))}" loading="lazy" data-zoom>`;
}
function htmlMedia(list) {
  if (!list.length) return "";
  const vids = list.filter((m) => m.type === "video");
  const vidBases = new Set(vids.map((m) => baseOf(m.src)));
  // when an mp4 exists, its gif and poster are redundant in the page
  let shown = list.filter((m) => m.type === "video" || !vidBases.has(baseOf(m.src)));
  if (NO_MEDIA) shown = shown.filter((m, i) => shown.findIndex((x) => one(x.caption) === one(m.caption)) === i);
  return `<div class="media">${shown
    .map(
      (m) => `<figure class="${NO_MEDIA ? "" : m.type === "video" ? "is-video" : ""}">${htmlMain(m, list)}<figcaption>${badge(m)}${capText(m.caption)}</figcaption></figure>`,
    )
    .join("")}</div>`;
}

let cards = "";
for (const [g, gname] of GROUPS) {
  const gi = items.filter((it) => it.group === g);
  if (!gi.length) continue;
  cards += `<section class="group" id="g-${g}"><h2>${esc(gname)} <span class="count">${gi.length}</span></h2>`;
  for (const it of gi) {
    const hv = itemHasVideo(it);
    cards += `<article class="item" id="i-${esc(it.id)}" data-video="${hv ? "yes" : "no"}">`;
    cards += `<header><span class="num">${it.n}</span><div><h3>${esc(it.title)}</h3><p class="summary">${esc(one(it.summary))}</p>`;
    if (one((it.evidenceMeta || {}).shortcut)) cards += `<p class="how"><b>Shortcut:</b> ${esc(one(it.evidenceMeta.shortcut))}</p>`;
    cards += `<p class="files">${(it.files || []).map((f) => `<code>${esc(f)}</code>`).join(" ")}</p></div></header>`;
    if (it.before.length) cards += `<div class="strip"><h4>Original Tempo</h4>${htmlMedia(it.before)}</div>`;
    const em = it.evidenceMeta || {};
    if (it.evidence.length)
      cards += `<div class="strip"><h4>Captured in the app${em.capturedAt ? ` · ${esc(one(em.capturedAt))}` : ""}</h4>${htmlMedia(it.evidence)}</div>`;
    if (one(notCap(em.notCaptured))) cards += `<div class="strip"><p class="pending">Not captured yet: ${esc(one(notCap(em.notCaptured)))}</p></div>`;
    if (it.realMedia.length) cards += `<div class="strip"><h4>In the real app</h4>${htmlMedia(it.realMedia)}</div>`;
    cards += `<div class="features">`;
    for (const f of it.features) {
      const p = pendingReason(f);
      cards += `<div class="feature" id="f-${f.n.replace(".", "-")}" data-video="${p ? "no" : "yes"}"><div class="ftext"><h4><span class="fnum">${f.n}</span>${esc(f.name)}</h4>`;
      cards += `<p>${esc(one(f.what))}</p>`;
      if (one(f.how)) cards += `<p class="how"><b>How:</b> ${esc(one(f.how))}</p>`;
      const cov = coveredBy(f);
      if (cov) cards += `<p class="pending na">Video: shown in the clip of <a href="#f-${cov.n.replace(".", "-")}">${cov.n} ${esc(one(cov.name))}</a></p>`;
      if (p) cards += `<p class="pending ${p.kind === "n/a" ? "na" : ""}">${p.kind === "n/a" ? "No video needed" : "Video pending"}: ${esc(one(p.why))}</p>`;
      cards += `</div>${htmlMedia(f.media)}</div>`;
    }
    cards += `</div></article>`;
  }
  cards += `</section>`;
}

const nav = GROUPS.filter(([g]) => items.some((it) => it.group === g))
  .map(([g, n]) => `<a href="#g-${g}">${esc(n)}</a>`)
  .join("");

let pendingRows = noVid
  .map(({ it, f, p }) => `<tr><td>${f.n}</td><td><a href="#i-${esc(it.id)}">${esc(it.title)}</a>: ${esc(one(f.name))}</td><td>${p.kind === "n/a" ? "not applicable" : "pending"}</td><td>${esc(one(p.why))}</td></tr>`)
  .join("");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RE-TEMPO Changes</title>
<style>
:root{--bg:#0d0e10;--panel:#15171b;--panel2:#1b1e23;--line:#2a2e35;--text:#e8eaee;--muted:#9aa1ad;--faint:#6b7280;--accent:#8fb0ff;--ok:#4cc38a;--warn:#e5a54b;--real:#c69bff;--radius:12px}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:72px}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.top{position:sticky;top:0;z-index:5;background:rgba(13,14,16,.88);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.top .in{max-width:1240px;margin:0 auto;padding:10px 16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.top b{font-weight:650;letter-spacing:.01em}
.top nav{display:flex;gap:4px;flex-wrap:wrap;flex:1}
.top nav a{color:var(--muted);font-size:13px;padding:4px 9px;border-radius:999px}
.top nav a:hover{background:var(--panel2);color:var(--text);text-decoration:none}
.filters{display:flex;gap:4px}
.filters button{background:var(--panel);color:var(--muted);border:1px solid var(--line);border-radius:999px;font:inherit;font-size:12.5px;padding:4px 10px;cursor:pointer}
.filters button[aria-pressed=true]{color:var(--text);border-color:var(--accent)}
main{max-width:1240px;margin:0 auto;padding:28px 16px 80px}
.hero h1{font-size:30px;line-height:1.2;margin:0 0 8px;letter-spacing:-.01em}
.hero p{color:var(--muted);max-width:820px;margin:0 0 18px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 30px}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px}
.stat b{display:block;font-size:24px;font-variant-numeric:tabular-nums}
.stat span{color:var(--muted);font-size:12.5px}
.group{margin:34px 0}
.group h2{font-size:20px;margin:0 0 14px;display:flex;align-items:center;gap:8px}
.count{font-size:12px;color:var(--muted);background:var(--panel2);border:1px solid var(--line);border-radius:999px;padding:1px 8px;font-weight:500}
.item{background:var(--panel);border:1px solid var(--line);border-radius:16px;margin:0 0 16px;overflow:hidden}
.item>header{display:flex;gap:14px;padding:18px 18px 8px}
.num{flex:none;width:34px;height:34px;border-radius:10px;background:var(--panel2);border:1px solid var(--line);display:grid;place-items:center;font-weight:650;font-variant-numeric:tabular-nums}
.item h3{margin:3px 0 4px;font-size:18px}
.summary{margin:0 0 8px;color:#cfd3da;max-width:900px}
.files{margin:0;display:flex;gap:6px;flex-wrap:wrap}
code{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:1px 6px;color:#c9cfda}
.strip{padding:6px 18px 4px}
.strip h4,.feature h4{margin:6px 0;font-size:13px;color:var(--muted);font-weight:600;letter-spacing:.02em;text-transform:uppercase}
.features{padding:6px 10px 12px}
.feature{display:grid;grid-template-columns:minmax(240px,1fr) minmax(0,1.6fr);gap:16px;padding:12px 8px;border-top:1px solid var(--line)}
.feature:first-child{border-top:0}
.feature h4{text-transform:none;letter-spacing:0;font-size:15px;color:var(--text);margin:0 0 6px;display:flex;gap:8px;align-items:baseline}
.fnum{color:var(--faint);font-size:12.5px;font-variant-numeric:tabular-nums;font-weight:500}
.feature p{margin:0 0 8px;color:#cfd3da;font-size:14px}
.feature .how{color:var(--muted)}.feature .how b{color:var(--text);font-weight:600}
.pending{display:inline-block;font-size:12.5px;color:var(--warn);border:1px solid rgba(229,165,75,.35);border-radius:8px;padding:2px 8px}
.pending.na{color:var(--muted);border-color:var(--line)}
.media{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;align-content:start}
.media figure{margin:0;background:#0a0b0d;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.media figure.is-video{grid-column:1/-1}
.media img,.media video{display:block;width:100%;height:auto;max-height:520px;object-fit:contain;background:#0a0b0d}
.media img{cursor:zoom-in}
figcaption{font-size:12.5px;color:var(--muted);padding:7px 10px;display:flex;gap:6px;align-items:baseline;flex-wrap:wrap}
.tag{font-size:10.5px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;border-radius:5px;padding:1px 5px;border:1px solid var(--line);color:var(--faint)}
.tag.real{color:var(--real);border-color:rgba(198,155,255,.4)}
.tag.ev{color:#7fd1e0;border-color:rgba(127,209,224,.4)}
.item>header .how{margin:0 0 8px;color:var(--muted);font-size:14px}.item>header .how b{color:var(--text)}
.tag.orig{color:var(--ok);border-color:rgba(76,195,138,.4)}
table{width:100%;border-collapse:collapse;font-size:14px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
th,td{text-align:left;padding:8px 10px;border-top:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600;border-top:0}
.lb{position:fixed;inset:0;background:rgba(0,0,0,.88);display:none;place-items:center;z-index:20;cursor:zoom-out;padding:16px}
.lb.on{display:grid}.lb img{max-width:100%;max-height:100%;border-radius:8px}
body.f-video .item[data-video=no],body.f-video .feature[data-video=no]{display:none}
body.f-pending .feature[data-video=yes]{display:none}
body.f-pending .item:not(:has(.feature[data-video=no])){display:none}
.strip .media{grid-template-columns:repeat(auto-fill,minmax(min(100%,460px),1fr))}
@media (max-width:820px){.top .in{gap:8px}.top nav{flex:1 1 100%;order:3;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.top nav a{white-space:nowrap}.top nav::-webkit-scrollbar{display:none}html{scroll-padding-top:110px}.feature{grid-template-columns:1fr}.item>header{padding:14px 14px 6px}.hero h1{font-size:24px}.media{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="top"><div class="in"><b>RE-TEMPO changes</b><nav>${nav}<a href="#no-video">Without video</a></nav>
<div class="filters" role="group" aria-label="Filter"><button data-f="" aria-pressed="true">All</button><button data-f="video" aria-pressed="false">With video</button><button data-f="pending" aria-pressed="false">Video pending</button></div></div></div>
<main>
<div class="hero"><h1>Every change vs the original Tempo</h1>
<p>The original Tempo app is not in this repo. Each change is a mod: a <code>feature/&lt;name&gt;.js</code> file (plus optional <code>.css</code>) loaded into the app's renderer by <code>tools/inject-index.mjs</code>. No mod edits Tempo's bundle. <span class="tag fx">fixture</span> media come from headless test pages running the real mod code with fake data; <span class="tag real">real app</span> media are prints of the real window; <span class="tag ev">app capture</span> media come from the running app${NO_MEDIA ? ". The screenshots and clips are not in this repo; their captions are kept" : `, linked from <code>evidence/&lt;mod&gt;/</code>`}.</p></div>
<div class="stats">
<div class="stat"><b>${stats.items}</b><span>changes (mods and tools)</span></div>
<div class="stat"><b>${stats.features}</b><span>features inside them</span></div>
<div class="stat"><b>${stats.itemsWithImage}</b><span>changes with images</span></div>
<div class="stat"><b>${stats.itemsWithVideo}</b><span>changes with video</span></div>
<div class="stat"><b>${stats.featuresWithVideo}</b><span>features with video</span></div>
<div class="stat"><b>${stats.realPrints}</b><span>real-app prints</span></div>
<div class="stat"><b>${stats.evidenceMods}</b><span>changes with app captures</span></div>
</div>
${cards}
<section class="group" id="no-video"><h2>Without video <span class="count">${noVid.length}</span></h2>
${noVid.length ? `<table><tr><th>#</th><th>Feature</th><th>Status</th><th>Why</th></tr>${pendingRows}</table>` : "<p>Every feature has a video.</p>"}
</section>
</main>
<div class="lb" id="lb"><img alt=""></div>
<script>
const lb=document.getElementById("lb"),li=lb.querySelector("img");
document.addEventListener("click",e=>{const t=e.target.closest("img[data-zoom]");if(t){li.src=t.currentSrc||t.src;li.alt=t.alt;lb.classList.add("on")}else if(e.target.closest("#lb"))lb.classList.remove("on")});
document.addEventListener("keydown",e=>{if(e.key==="Escape")lb.classList.remove("on")});
const io=new IntersectionObserver(es=>es.forEach(e=>{const v=e.target;if(e.isIntersecting){const p=v.play();if(p&&p.catch)p.catch(()=>{})}else v.pause()}),{threshold:.35});
document.querySelectorAll("video[data-auto]").forEach(v=>io.observe(v));
document.querySelectorAll(".filters button").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".filters button").forEach(x=>x.setAttribute("aria-pressed",x===b));document.body.classList.remove("f-video","f-pending");if(b.dataset.f)document.body.classList.add("f-"+b.dataset.f)}));
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(OUT, "index.html"), html);

console.log(JSON.stringify({ stats, noVideo: noVid.length, warnings }, null, 2));
