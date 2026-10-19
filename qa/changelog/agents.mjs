#!/usr/bin/env node
// qa/changelog/agents.mjs — capture of the "agents" group (profile qa-5)
// -----------------------------------------------------------------------------
// Mods: 18 canvas-comment-agent, 19 comment-bubbles, 20 agent-cursors,
//       21 agent-follow, 27 ui-beam, 28 ui-drive, 29 app-map.
// Usage: cd qa && node changelog/agents.mjs [scene ...]    (no args = all)
//
// SAFETY (cloned profile = same account as the user):
//  - No real comment is posted and no Claude chat is created. The "running"
//    tasks are SIMULATED DATA written to localStorage "rtd.commentAgent.tasks"
//    (null chatId/threadId and replied=true: the pipeline neither tracks nor replies).
//  - The clone carries a REAL task in "running" with a real threadId; so that the
//    pipeline never posts the reply in the thread, "rtd.commentAgent.reply" = "off" is
//    written as soon as the page connects (and via an init script on every reload).
//  - ui-drive reads commands from an isolated file (rtd.uiDrive.file) and app-map does
//    not export to the real HOME (rtd.appMap.autoExport = off).
//  - At the end, the touched rtd.* keys go back to their original value (snapshot in
//    /tmp/tempo-qa/agents-ls-original.json, taken only on the first run), with
//    two permanent exceptions on qa-5: "rtd.commentAgent.reply" stays "off" and the
//    real task t:ts72fx5h… stays replied=true (no future boot replies in the thread).
//  - Media, captions, simulated texts and index.json in ENGLISH (Figma board).
// -----------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import * as kit from "./kit.mjs";
import { makeLabApp } from "./make-lab-app.mjs";
import { refreshAuth } from "./make-profile.mjs";

export const PROFILE = "qa-5";
const SNAP = "/tmp/tempo-qa/agents-ls-original.json";
const UID_DIR = "/tmp/tempo-qa/agents-uidrive";
export const KEYS = [
  "rtd.commentAgent.tasks", "rtd.commentAgent.reply", "rtd.commentAgent.handled", "rtd.commentAgent",
  "rtd.commentBubbles.cache", "rtd.commentBubbles", "rtd.agentCursors.colors", "rtd.agentCursors",
  "rtd.agentFollow", "rtd.uiBeam", "rtd.uiDrive", "rtd.uiDrive.file", "rtd.uiDrive.seen", "rtd.uiDrive.allow",
  "rtd.appMap", "rtd.appMap.autoExport", "re-tempo:canvas-autosetup-send",
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };

// Guard: runs in the renderer (evaluate and init script). Idempotent.
const GUARD = (dir) => {
  try {
    localStorage.setItem("rtd.commentAgent.reply", "off");
    localStorage.setItem("rtd.appMap.autoExport", "off");
    localStorage.setItem("rtd.appMap.export", "off"); // current app-map key (export opt-in)
    localStorage.setItem("rtd.uiDrive.file", dir + "/ui-commands.jsonl");
    localStorage.setItem("re-tempo:canvas-autosetup-send", "0"); // never auto-sends the setup chat
  } catch (_) {}
};

export async function openGuarded({ profile = PROFILE } = {}) {
  makeLabApp();
  fs.mkdirSync(UID_DIR, { recursive: true });
  const inst = await import("../instance.mjs");
  const cfg = await import("../lib/config.mjs");
  const cdpm = await import("../lib/cdp.mjs");
  const ui = await import("../lib/ui.mjs");
  inst.installSignalCleanup();
  refreshAuth(profile);
  const I = await inst.launch({ paths: cfg.profilePaths(profile) });
  const browser = await cdpm.connect(I.cdpPort);
  let page = null;
  for (let i = 0; i < 60 && !page; i++) { page = await cdpm.pickMainPage(browser); if (!page) await sleep(250); }
  if (!page) throw new Error("main page not found");
  // snapshot BEFORE the guard (only the first time: it is the profile's original)
  const orig = await page.evaluate((keys) => Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k)])), KEYS).catch(() => null);
  if (orig && !fs.existsSync(SNAP)) fs.writeFileSync(SNAP, JSON.stringify(orig));
  await page.evaluate(GUARD, UID_DIR).catch(() => {});
  await page.addInitScript(GUARD, UID_DIR).catch(() => {});
  const cdp = await page.context().newCDPSession(page);
  const s = { profile, inst: I, browser, page, cdp, width: 1440, height: 900, dpr: 1, overlay: false };
  await kit.viewport(s, 1440, 900, 1);
  await ui.waitForReady(page);
  await kit.waitApp(s);
  await page.evaluate(GUARD, UID_DIR);
  return s;
}

// Final restore: reloads WITHOUT mods (setSkip "*": nothing reads these keys) and only
// then returns each rtd.* key to its original value. Permanent exceptions (qa-5):
// reply = "off" and the real task t:ts72fx5h… with replied = true.
const PERMANENT_REPLY_OFF = "off";
const REAL_RUNNING_TASK = "t:ts72fx5h";
function patchOriginal(orig) {
  const o = { ...orig, "rtd.commentAgent.reply": PERMANENT_REPLY_OFF };
  try {
    const list = JSON.parse(o["rtd.commentAgent.tasks"] || "[]");
    for (const t of list) if (String(t.id).startsWith(REAL_RUNNING_TASK)) t.replied = true;
    o["rtd.commentAgent.tasks"] = JSON.stringify(list);
  } catch (_) {}
  return o;
}
export async function finalRestore(s) {
  if (!fs.existsSync(SNAP)) return null;
  const orig = patchOriginal(JSON.parse(fs.readFileSync(SNAP, "utf8")));
  await kit.setSkip(s, "*");
  const loaded = await kit.loadedMods(s);
  if (loaded && loaded.length) throw new Error("mods still loaded: " + loaded.join(","));
  await s.page.evaluate((o) => {
    for (const [k, v] of Object.entries(o)) { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
  }, orig);
  const back = await s.page.evaluate((keys) => Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k)])), Object.keys(orig));
  const diff = Object.keys(orig).filter((k) => back[k] !== orig[k]);
  const real = await s.page.evaluate((id) => { const t = JSON.parse(localStorage.getItem("rtd.commentAgent.tasks") || "[]").find((x) => String(x.id).startsWith(id)); return t ? { status: t.status, replied: t.replied } : null; }, REAL_RUNNING_TASK);
  return { restored: Object.keys(orig).length, diff, reply: back["rtd.commentAgent.reply"], realTask: real };
}

// ------------------------------------------------------------------ helpers
export const CANVAS = "untitled-4";
export const CLONE = "/tmp/tempo-qa/profiles/qa-5/projects/seed-tracker";
export const DOG = CLONE + "/src/components/DogHomeScreen.tsx";
const DOG_ORIG = "/tmp/tempo-qa/agents-DogHomeScreen.orig.tsx";
const BEFORE_JSON = "/tmp/tempo-qa/agents-before.json";
export const SKIP_CANVAS = "canvas-autosetup,canvas-browser,canvas-shader"; // clean canvas (no frames from other mods)
const ev = (mod, f) => `evidence/${mod}/${f}`;
const EMPTY = { x: 1290, y: 770 }; // empty canvas spot in the AGENTS_VIEW view (a click here selects nothing)

export async function skip(s, v) {
  await kit.setSkip(s, v);
  await s.page.evaluate(GUARD, UID_DIR);
}

// Waits for the untitled-4 canvas with its 5 storyboards rendered (iframes with a body).
export async function waitCanvas(s, { timeoutMs = 40000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const ok = await s.page.evaluate((name) => {
      const pill = [...document.querySelectorAll('[aria-label="Canvas page"]')].some((n) => n.textContent.includes(name));
      const items = [...document.querySelectorAll("[data-canvas-item-id]")];
      const loaded = items.filter((n) => { const f = n.querySelector("iframe"); try { return f && f.contentDocument && f.contentDocument.body && f.contentDocument.body.innerText.length > 20; } catch (_) { return false; } });
      return pill && items.length >= 5 && loaded.length >= 4;
    }, CANVAS).catch(() => false);
    if (ok) { await sleep(1500); return true; }
    await sleep(500);
  }
  throw new Error("canvas untitled-4 did not load");
}

export async function sbRects(s) {
  return s.page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-canvas-item-id]")].map((n) => {
    const r = n.getBoundingClientRect();
    return [n.getAttribute("data-canvas-item-id"), { x: r.x, y: r.y, width: r.width, height: r.height }];
  })));
}

// JPEG dataURL of a screen crop (for the before/after of the simulated tasks).
export async function capJpeg(s, r, { pad = 8, scale = 2.5 } = {}) {
  const clip = { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.width + 2 * pad, height: r.height + 2 * pad, scale };
  const { data } = await s.cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 82, clip });
  await kit.viewport(s); // reapplies the metrics (never take a scaled crop during a recording)
  return { dataUrl: "data:image/jpeg;base64," + data, w: Math.round(clip.width * scale), h: Math.round(clip.height * scale) };
}

const AUTHOR = { name: "Sam", initials: "SM", color: "#8b5cf6" };
// Ids of the capture profile's workspaces and chats: set the RT_* env vars (the defaults are placeholders).
const WS = process.env.RT_WS_MAIN || "ws-00000000-00000";
// SIMULATED DATA: tasks with no chat (null chatId/threadId, replied=true).
export function simTasks(now, before = {}) {
  const base = (o) => ({
    threadId: null, commentId: null, author: { ...AUTHOR }, canvasName: CANVAS, chatId: null, workspaceId: WS,
    finishedAt: null, model: "Opus 5.5", effort: "High", modelId: "opus-5.5-1m", effortId: "high",
    after: null, gif: null, frames: null, summary: null, captureError: null, error: null, replied: true,
    seenMsgIds: [], ...o,
  });
  return [
    base({ id: "t:sim-qa-2", text: "Swap the cat at the top for a paw icon", storyboardName: "Kitties App",
      anchor: { x: -191, y: -1290, nodeId: "KittiesApp" }, createdAt: now - 150000, startedAt: now - 146000, status: "needs-input",
      before: before.KittiesApp || null,
      updates: [{ at: now - 120000, kind: "text", text: "Found the cat at the top of the Kitties App (KittiesAppScreen.tsx)." },
        { at: now - 90000, kind: "text", text: "Should the paw be orange (brand color) or gray like the other icons?" }] }),
    base({ id: "t:sim-qa-1", text: "Make the “Explore Models” button orange and taller", storyboardName: "Storyboard1",
      anchor: { x: 30, y: -110, nodeId: "Storyboard1" }, createdAt: now - 95000, startedAt: now - 92000, status: "running",
      before: before.Storyboard1 || null,
      updates: [{ at: now - 60000, kind: "text", text: "Found the button in Storyboard1.tsx; adjusting color and height." }] }),
    base({ id: "t:sim-qa-3", text: "Make the top of Biscuit\u2019s card orange", storyboardName: "Dog Home Screen",
      anchor: { x: 664, y: -1040, nodeId: "DogHome" }, createdAt: now - 40000, startedAt: now - 36000, status: "running",
      before: before.DogHome || null,
      updates: [{ at: now - 20000, kind: "text", text: "Opening DogHomeScreen.tsx to change the card gradient." }] }),
    base({ id: "t:sim-qa-4", text: "Publish this screen to the website", storyboardName: "Car Home Screen",
      anchor: { x: 2800, y: -1400, nodeId: "CarHome" }, createdAt: now - 300000, startedAt: now - 296000, status: "failed",
      finishedAt: now - 240000, before: before.CarHome || null, error: "The chat was closed before it finished.",
      updates: [{ at: now - 250000, kind: "text", text: "Publishing is outside the canvas; I need deploy permission." }] }),
  ];
}

// Writes ONLY the simulated tasks (in English) to the store during the capture: no real
// user text shows up in bubbles, cursors or panels. The original comes back at the end.
export async function injectSim(s, before) {
  return s.page.evaluate(([list]) => {
    localStorage.setItem("rtd.commentAgent.tasks", JSON.stringify(list));
    return list.length;
  }, [simTasks(Date.now(), before)]);
}

// Simulation layer over the store API (this instance only): overrides the status of the
// simulated tasks and re-emits "rtcc:changed". reply()/openChat() of simulated tasks
// never reach a chat.
const INSTALL_SIM = () => {
  if (window.__AGSIM__) return "already";
  const api = window.__RE_TEMPO_COMMENT_AGENT__;
  if (!api) return "no api";
  const orig = { tasks: api.tasks, openChat: api.openChat };
  const over = {};
  const apply = (l) => l.map((t) => (over[t.id] ? Object.assign({}, t, over[t.id]) : t));
  const SIM = (window.__AGSIM__ = {
    over, apply,
    set(id, patch) { over[id] = Object.assign(over[id] || {}, patch); SIM.emit(); },
    emit() { window.dispatchEvent(new CustomEvent("rtcc:changed", { detail: { tasks: apply(orig.tasks()) } })); },
  });
  api.tasks = () => apply(orig.tasks());
  api.jobs = api.tasks;
  api.task = (id) => api.tasks().find((t) => t.id === id) || null;
  api.reply = async () => false; // never sends
  api.openChat = (id) => (String(id).startsWith("t:sim-qa") ? false : orig.openChat(id));
  window.addEventListener("rtcc:changed", (e) => {
    const l = e.detail && e.detail.tasks;
    if (Array.isArray(l)) { const a = apply(l); l.splice(0, l.length, ...a); }
  }, true);
  SIM.emit();
  return "ok";
};
// The overrides are also kept in Node (s.simOver): if the page reloads, reinstall and reapply.
export async function installSim(s) {
  const r = await s.page.evaluate(INSTALL_SIM);
  if (s.simOver) await s.page.evaluate((o) => { for (const [i, p] of Object.entries(o)) window.__AGSIM__.set(i, p); }, s.simOver);
  return r;
}
export async function simSet(s, id, patch) {
  s.simOver = s.simOver || {};
  s.simOver[id] = Object.assign(s.simOver[id] || {}, patch);
  const ok = await s.page.evaluate(() => !!window.__AGSIM__);
  if (!ok) { console.log("[agents] page reloaded: reinstalling simulation"); await installSim(s); return; }
  return s.page.evaluate(([i, p]) => window.__AGSIM__.set(i, p), [id, patch]);
}

export function dogToggle() {
  const cur = fs.readFileSync(DOG, "utf8").includes("from-orange-300 to-white");
  dogEdit(!cur);
  return !cur;
}
export function dogEdit(on) {
  if (!fs.existsSync(DOG_ORIG)) fs.copyFileSync(DOG, DOG_ORIG);
  const orig = fs.readFileSync(DOG_ORIG, "utf8");
  const next = on ? orig.replace("bg-gradient-to-b from-emerald-50 to-white px-4 pt-5 pb-4", "bg-gradient-to-b from-orange-300 to-white px-4 pt-5 pb-4") : orig;
  if (on && next === orig) throw new Error("DogHomeScreen snippet not found");
  fs.writeFileSync(DOG, next);
}

// ------------------------------------------------------------------ scenes
export const scenes = {};

const pillClip = async (s, w = 640) => {
  const r = await kit.rectOf(s, '[aria-label="Canvas page"]');
  return { x: Math.max(0, r.x - 14), y: Math.max(0, r.y - 14), width: w, height: r.height + 28 };
};
const THREAD_PIN = '[data-thread-id^="ts75smgp"] [aria-label="LR"]'; // "make a app for dogs here" (the agent's real reply)
async function threadClip(s) {
  const r = await s.page.evaluate(() => {
    const m = [...document.querySelectorAll('[data-testid="comment-message"]')];
    if (!m.length) return null;
    let n = m[0];
    for (let i = 0; i < 14 && n; i++) { if ((n.innerText || "").trim().startsWith("Comment thread")) break; n = n.parentElement; }
    if (!n) return null;
    const b = n.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  });
  return r && { x: r.x - 10, y: r.y - 10, width: r.width + 20, height: r.height + 20 };
}
const threadOpen = (s) => s.page.evaluate(() => [...document.querySelectorAll('[data-testid="comment-message"]')].some((m) => {
  for (let n = m, i = 0; n && i < 14; n = n.parentElement, i++) if ((n.innerText || "").trim().startsWith("Comment thread")) return true;
  return false;
}));
// Opens the pin's thread: hovers, waits for the hover to settle and clicks (with 1 retry).
async function openThread(s, { ms = 600 } = {}) {
  for (let i = 0; i < 2; i++) {
    const r = await kit.rectOf(s, THREAD_PIN);
    await kit.moveTo(s, r.x + r.width / 2, r.y + r.height / 2, { ms });
    await sleep(450);
    await kit.click(s);
    for (let k = 0; k < 20; k++) { if (await threadOpen(s)) return true; await sleep(200); }
    await kit.click(s, EMPTY.x, EMPTY.y, { ms: 300 });
    await sleep(400);
  }
  return false;
}

// Original Tempo sidebar: collapses only the "Local" folder that lists the user's real chat,
// whose title is not in English (the board is English-only); the other "Local" folders stay
// open. UI state of the clone only. The regex below matches that real chat title ("homepage <word> apple").
const SIDEBAR_STATE = () => {
  const vis = (n) => { const b = n.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  // truly visible: the center point of the text lands on it (a collapsed folder leaves the node with a rect)
  const shown = (n) => { if (!vis(n)) return false; const b = n.getBoundingClientRect(); const e = document.elementFromPoint(b.x + Math.min(20, b.width / 2), b.y + b.height / 2); return !!e && (e === n || n.contains(e) || (e.contains(n) && e.getBoundingClientRect().height < 40)); };
  const leaf = [...document.querySelectorAll("span")].find((n) => n.childElementCount === 0 && /homepage \S+ apple/i.test(n.textContent || "") && shown(n));
  const folders = [...document.querySelectorAll("[role=treeitem][aria-expanded]")].filter((t) => (t.textContent || "").trim() === "Local" && vis(t))
    .map((t) => { const b = t.getBoundingClientRect(); return { x: b.x + 40, y: b.y + b.height / 2, exp: t.getAttribute("aria-expanded") === "true" }; });
  return { leafY: leaf ? leaf.getBoundingClientRect().y : null, folders };
};
export async function hideRealChat(s) {
  const realIdx = new Set(); // index (sidebar order) of the folder holding the real chat
  for (let i = 0; i < 12; i++) {
    const st = await s.page.evaluate(SIDEBAR_STATE);
    if (st.leafY != null) {
      const k = st.folders.map((f, j) => ({ ...f, j })).filter((f) => f.exp && f.y < st.leafY).sort((p, q) => q.y - p.y)[0];
      if (!k) { await sleep(700); continue; } // folder just collapsed (animation)
      realIdx.add(k.j);
      await s.page.mouse.click(k.x, k.y);
      await sleep(800);
      continue;
    }
    const closed = st.folders.map((f, j) => ({ ...f, j })).filter((f) => !f.exp && !realIdx.has(f.j));
    if (!closed.length) return true;
    const f = closed[0]; // reopens one at a time (fresh coordinates on every round)
    await s.page.mouse.click(f.x, f.y);
    await sleep(800);
    const after = await s.page.evaluate(SIDEBAR_STATE);
    if (after.leafY != null) { realIdx.add(f.j); await s.page.mouse.click(after.folders[f.j].x, after.folders[f.j].y); await sleep(800); }
  }
  const end = await s.page.evaluate(SIDEBAR_STATE);
  if (end.leafY != null) throw new Error("real chat still visible in the sidebar");
  return true;
}

// BEFORE (original Tempo): canvas, pill, thread with the agent's real reply; storyboard befores.
scenes.before = async (s) => {
  await skip(s, "*");
  await waitCanvas(s);
  await sleep(1500);
  await hideRealChat(s);
  for (const m of ["canvas-comment-agent", "agent-cursors", "agent-follow"]) await kit.shot(s, ev(m, "01-before.png"));
  await kit.shot(s, ev("comment-bubbles", "01-before.png"), { clip: await pillClip(s), scale: 2 });
  const rects = await sbRects(s);
  const before = {};
  for (const id of ["Storyboard1", "KittiesApp", "DogHome", "CarHome"]) before[id] = await capJpeg(s, rects[id]);
  fs.writeFileSync(BEFORE_JSON, JSON.stringify(before));
  return { before: Object.keys(before) };
};

const loadBefore = () => (fs.existsSync(BEFORE_JSON) ? JSON.parse(fs.readFileSync(BEFORE_JSON, "utf8")) : {});

// 18 · AFTER: compact pipeline list (comment-bubbles off so that it shows up).
scenes.list = async (s) => {
  await injectSim(s, loadBefore());
  await skip(s, SKIP_CANVAS + ",comment-bubbles,agent-cursors,agent-follow");
  await waitCanvas(s);
  await kit.waitFor(s, () => document.querySelectorAll(".rcca .rcca-item").length >= 2, { timeoutMs: 15000 });
  await sleep(1200);
  const rows = await s.page.evaluate(() => [...document.querySelectorAll(".rcca .rcca-item")].map((n) => n.innerText.replace(/\s+/g, " ")));
  return { rows };
};

scenes.listMedia = async (s) => {
  const M = "canvas-comment-agent";
  await s.page.keyboard.press("Escape");
  await kit.click(s, EMPTY.x, EMPTY.y, { ms: 50 });
  await sleep(600);
  await kit.cursor(s, false);
  await kit.shot(s, ev(M, "02-after.png"));
  await kit.shot(s, ev(M, "04-task-list.png"), { selector: ".rcca", pad: 8, scale: 3 });
  const sb = (await sbRects(s)).Storyboard1;
  const btn = { x: sb.x + sb.width * 0.12, y: sb.y + sb.height * 0.29 }; // "Explore Models" button
  // Demo comment NEVER sent: pipeline off while typing.
  await s.page.evaluate(() => window.__RE_TEMPO_COMMENT_AGENT__.setEnabled(false));
  await sleep(600);
  const r3 = await kit.record(s, ev(M, "03-comment-to-task"), async () => {
    await kit.caption(s, "1. Comment on the canvas as usual");
    await kit.click(s, 958, 858, { ms: 700 });
    await sleep(500);
    await kit.click(s, btn.x, btn.y, { ms: 700 });
    await sleep(700);
    // only types if the comment composer opened (otherwise the letters would become canvas shortcuts)
    const composer = await s.page.evaluate(() => { const a = document.activeElement; return !!a && a.tagName === "TEXTAREA" && a.getAttribute("placeholder") === "Start a thread…"; });
    if (!composer) { await s.page.keyboard.press("Escape"); throw new Error("comment composer did not open; nothing was typed"); }
    await s.page.keyboard.type("Make this button orange", { delay: 70 });
    await sleep(500);
    await kit.caption(s, "On send, the comment becomes a task for a Claude chat in the background");
    await sleep(2000);
    await kit.caption(s, "(not sent in this recording)");
    await sleep(1000);
    await s.page.keyboard.press("Escape");
    await sleep(300);
    await s.page.keyboard.press("Escape");
    await kit.click(s, EMPTY.x, EMPTY.y, { ms: 500 }); // back to selection, no comment
    await s.page.evaluate(() => window.__RE_TEMPO_COMMENT_AGENT__.setEnabled(true));
    await sleep(500);
    await kit.caption(s, "2. The task shows up in this list: who asked, the request, time running (simulated data)");
    await kit.highlight(s, ".rcca");
    const lr = await kit.rectOf(s, ".rcca");
    await kit.moveTo(s, lr.x + 120, lr.y + lr.height - 16, { ms: 700 });
    await sleep(800);
    await kit.moveTo(s, lr.x + 120, lr.y + 16, { ms: 300 });
    await sleep(1400);
    await kit.highlight(s, null);
  }, { tailMs: 300 });
  await kit.caption(s, null);
  return { r3 };
};

// 19/20/21 · state with all agent mods + simulation layer.
scenes.bubblesSetup = async (s) => {
  await skip(s, SKIP_CANVAS);
  await waitCanvas(s);
  await kit.waitFor(s, () => document.querySelectorAll(".rtcb-segment .rtcb-bubble").length >= 3, { timeoutMs: 15000 });
  const sim = await installSim(s);
  await s.page.evaluate(() => window.__RE_TEMPO_COMMENT_BUBBLES__.showResolved(true)); // real tasks finished > 1 h ago
  await sleep(1500);
  return s.page.evaluate((sim) => ({
    sim,
    seg: (document.querySelector(".rtcb-segment") || {}).innerText,
    cursors: [...document.querySelectorAll(".rtac-cursor")].map((c) => c.innerText.replace(/\s+/g, " ")),
  }), sim);
};

const B = (id) => `.rtcb-bubble[data-id="${id}"]`;
const bubbleShown = (s, id) => s.page.evaluate((sel) => { const b = document.querySelector(sel); return !!b && !b.hidden && b.getClientRects().length > 0 && b.getBoundingClientRect().width > 0; }, B(id));
// Clicks the bubble; if it is inside the "+N", expands the queue first.
async function clickBubble(s, id, opts = {}) {
  if (!(await bubbleShown(s, id))) {
    const more = await kit.rectOf(s, ".rtcb-segment .rtcb-more");
    if (more) { await kit.click(s, more.x + more.width / 2, more.y + more.height / 2, { ms: opts.ms || 500 }); await sleep(600); }
  }
  if (!(await bubbleShown(s, id))) { await s.page.evaluate((i) => window.__RE_TEMPO_COMMENT_BUBBLES__.open(i), id); return false; }
  await kit.clickSel(s, B(id), opts);
  return true;
}
async function doneAfter(s) {
  // "after" of simulated task 3: DogHome crop with the cursor layer hidden
  await s.page.evaluate(() => document.documentElement.classList.add("rtcc-capturing"));
  await sleep(120);
  const r = (await sbRects(s)).DogHome;
  const img = await capJpeg(s, r);
  await s.page.evaluate(() => document.documentElement.classList.remove("rtcc-capturing"));
  return img;
}
export const cursorsOn = (s, on) => s.page.evaluate((v) => { if (v) localStorage.removeItem("rtd.agentCursors"); else localStorage.setItem("rtd.agentCursors", "off"); }, on);

// 20 · agent cursors (simulated DogHome edit in the clone)
scenes.cursors = async (s) => {
  const M = "agent-cursors";
  await cursorsOn(s, true);
  await simSet(s, "t:sim-qa-1", { status: "running", finishedAt: null, summary: null });
  await simSet(s, "t:sim-qa-3", { status: "running", finishedAt: null, summary: null, after: null });
  dogEdit(false);
  await setView(s, ...AGENTS_VIEW);
  await kit.moveTo(s, 1250, 760, { ms: 50 });
  await sleep(2500);
  await kit.shot(s, ev(M, "02-after.png"));
  const tag2 = await s.page.evaluate(() => {
    const t = [...document.querySelectorAll(".rtac-tag")].find((n) => /#13/.test(n.innerText));
    if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const r = await kit.record(s, ev(M, "03-agent-edits-canvas"), async () => {
    await kit.caption(s, "Each agent working on a comment gets a named, colored cursor (simulated data)");
    await sleep(2600);
    if (tag2) {
      await kit.caption(s, "Hover the name tag: the request and what the agent is doing");
      await kit.moveTo(s, tag2.x, tag2.y, { ms: 700 });
      await sleep(2000);
      await kit.moveTo(s, 1250, 760, { ms: 500 });
    }
    await kit.caption(s, "The agent edits the screen (simulated edit in the clone): its cursor glides to the change");
    dogEdit(true);
    await sleep(4200);
    await kit.caption(s, "Done: a check mark, then the cursor fades out");
    await simSet(s, "t:sim-qa-3", { status: "done", finishedAt: Date.now(), summary: "Changed Biscuit’s card gradient to orange." });
    await sleep(2800);
  }, { tailMs: 300 });
  await kit.caption(s, null);
  // "after" only after the recording: a scaled crop during the screencast spoils the frames
  await sleep(500);
  await simSet(s, "t:sim-qa-3", { after: await doneAfter(s) });
  await sleep(500);
  await kit.shot(s, ev(M, "04-after-edit.png"));
  return r;
};

// 19 · bubbles (cursors off in these media: they draw on top of the panel)
scenes.bubblesMedia = async (s) => {
  const M = "comment-bubbles";
  await cursorsOn(s, false);
  await s.page.keyboard.press("Escape");
  await kit.click(s, EMPTY.x, EMPTY.y, { ms: 50 });
  await sleep(800);
  await kit.shot(s, ev(M, "02-after.png"), { clip: await pillClip(s), scale: 2 });
  await kit.shot(s, ev(M, "05-full-window.png"));
  const r3 = await kit.record(s, ev(M, "03-open-bubble-panel"), async () => {
    await kit.caption(s, "Comment tasks become bubbles next to the canvas name (simulated data)");
    await kit.hoverSel(s, ".rtcb-segment", { ms: 700 }).catch(() => {});
    await sleep(1200);
    await kit.caption(s, "Hover: request number, author, status and request");
    await kit.hoverSel(s, B("t:sim-qa-2"), { ms: 600 });
    await sleep(1700);
    await kit.caption(s, "Click: the panel shows the agent’s question and a reply field");
    await kit.click(s);
    await sleep(2600);
    await s.page.keyboard.press("Escape");
    await sleep(400);
    await kit.caption(s, "A finished task: the before/after images of the commented area");
    await clickBubble(s, "t:sim-qa-3", { ms: 600 });
    await sleep(1200);
    await s.page.evaluate(() => { const p = document.querySelector(".rtcb-panel .rtcb-pb") || document.querySelector(".rtcb-panel"); if (p) p.scrollTo({ top: 360, behavior: "smooth" }); });
    await sleep(2400);
    await s.page.keyboard.press("Escape");
    await sleep(300);
  }, { tailMs: 300 });
  const r4 = await kit.record(s, ev(M, "04-task-finishes"), async () => {
    await kit.caption(s, "When an agent finishes, its bubble gets a check and the counter updates");
    await kit.moveTo(s, 640, 160, { ms: 500 });
    await sleep(1200);
    await simSet(s, "t:sim-qa-1", { status: "done", finishedAt: Date.now(), summary: "Made the “Explore Models” button orange and 8 px taller." });
    await sleep(2800);
  }, { tailMs: 300 });
  await kit.caption(s, null);
  return { r3, r4 };
};

// Extra stills for 19: panels and thread with the "Claude" card.
scenes.bubblesExtras = async (s) => {
  const M = "comment-bubbles";
  await cursorsOn(s, false);
  await clickBubble(s, "t:sim-qa-2");
  await sleep(1200);
  await kit.shot(s, ev(M, "06-panel-question.png"), { selector: ".rtcb-panel", pad: 10, scale: 2 });
  await s.page.keyboard.press("Escape");
  await sleep(400);
  await s.page.evaluate(() => window.__RE_TEMPO_COMMENT_BUBBLES__.open("t:sim-qa-3"));
  await sleep(1200);
  await s.page.evaluate(() => { const p = document.querySelector(".rtcb-panel .rtcb-pb") || document.querySelector(".rtcb-panel"); if (p) p.scrollTo({ top: 360 }); });
  await sleep(600);
  await kit.shot(s, ev(M, "07-panel-before-after.png"), { selector: ".rtcb-panel", pad: 10, scale: 2 });
  await s.page.keyboard.press("Escape");
  await sleep(400);
  await kit.click(s, EMPTY.x, EMPTY.y, { ms: 50 });
  await simSet(s, "t:sim-qa-1", { status: "running", finishedAt: null, summary: null });
  await cursorsOn(s, true);
  return true;
};

// Canvas view via native wheel events (ctrl+wheel = zoom at the point; wheel = pan).
export const getView = (s) => s.page.evaluate(() => window.__RE_TEMPO_COMMENT_AGENT__ && window.__RE_TEMPO_COMMENT_AGENT__._view());
// Canvas point with no storyboard/iframe/pin underneath (a wheel over an iframe is forwarded with the opposite sign).
const emptyPoint = (s, pref) => s.page.evaluate((pref) => {
  const root = document.querySelector("[data-canvas-root]");
  if (!root) return null;
  const R = root.getBoundingClientRect();
  const ok = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el || !root.contains(el)) return false;
    return !el.closest("[data-canvas-item-id], iframe, [data-testid^='canvas-comment-pin'], button, [role=toolbar], .rtcb-segment, .rtcb-panel, .rtcb-tip, .rtac-tag, .rtaf-chip");
  };
  if (pref && ok(pref.x, pref.y)) return pref;
  const pts = [];
  for (let y = R.top + 70; y < R.bottom - 90; y += 30) for (let x = R.left + 30; x < R.right - 30; x += 30) if (ok(x, y)) pts.push({ x, y });
  if (!pts.length) return null;
  const p0 = pref || { x: R.left + R.width / 2, y: R.top + R.height / 2 };
  pts.sort((a, b) => Math.hypot(a.x - p0.x, a.y - p0.y) - Math.hypot(b.x - p0.x, b.y - p0.y));
  return pts[0];
}, pref);
export async function setView(s, z, wx, wy, { cx = 852, cy = 500 } = {}) {
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  await s.page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  let v0 = await getView(s);
  if (!v0) throw new Error("no canvas view");
  if (Math.abs(Math.log(z / v0.z)) > 0.4) {
    const p = await emptyPoint(s, null);
    if (!p) throw new Error("no empty point on the canvas");
    await s.page.mouse.click(p.x, p.y); // focus the canvas (a click on empty space selects nothing)
    await sleep(250);
    await s.page.keyboard.press("Shift+Digit1"); // canvas-keys: zoom to fit
    await sleep(1000);
  }
  for (let i = 0; i < 160; i++) {
    const v = await getView(s);
    const k = Math.log(z / v.z);
    if (Math.abs(k) < 0.01) break;
    const p = await emptyPoint(s, { x: cl(v.ox + wx * v.z, 300, 1400), y: cl(v.oy + wy * v.z, 130, 820) });
    if (!p) throw new Error("no empty point on the canvas for the zoom");
    await s.page.mouse.move(p.x, p.y);
    await s.page.keyboard.down("Control");
    await s.page.mouse.wheel(0, cl(-k / 0.002, -14, 14)); // measured: factor exp(-0.002·delta)
    await s.page.keyboard.up("Control");
    await sleep(35);
  }
  for (let i = 0; i < 40; i++) {
    const v = await getView(s);
    const dx = v.ox + wx * v.z - cx, dy = v.oy + wy * v.z - cy;
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) break;
    const p = await emptyPoint(s, { x: cx, y: cy });
    if (!p) throw new Error("no empty point on the canvas for the pan");
    await s.page.mouse.move(p.x, p.y);
    await s.page.mouse.wheel(cl(dx / 2, -150, 150), cl(dy / 2, -150, 150)); // measured: pan = -2·delta
    await sleep(120);
  }
  await sleep(700);
  const v = await getView(s);
  if (Math.abs(Math.log(z / v.z)) > 0.05) throw new Error(`view off target: z=${v.z}`);
  return v;
}

export const AGENTS_VIEW = [0.31, 276, -496, { cx: 852, cy: 520 }]; // Kitties + DogHome + Storyboard1

const CHAT_TAB = `[role=tab][data-tab-id="${process.env.RT_CHAT_MAIN || "00000000-0000-0000-0000-000000000002"}"]`; // empty "New Chat" (visual only; nothing is typed)
const CANVAS_TAB = '[role=tab][data-tab-id$="tempo/designs/canvases/untitled-4"]';
export async function gotoTab(s, sel) {
  const r = await kit.rectOf(s, sel);
  if (!r) throw new Error("tab not found: " + sel);
  await s.page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  await sleep(1800);
}

async function altClick(s, sel, opts = {}) {
  const r = await kit.rectOf(s, sel);
  if (!r) throw new Error("bubble not found: " + sel);
  await kit.moveTo(s, r.x + r.width / 2, r.y + r.height / 2, { ms: opts.ms || 600 });
  await sleep(200);
  await s.page.keyboard.down("Alt");
  await kit.click(s);
  await s.page.keyboard.up("Alt");
}
const following = (s) => s.page.evaluate(() => window.__RE_TEMPO_AGENT_FOLLOW__ && window.__RE_TEMPO_AGENT_FOLLOW__.following());

// 21 · follow the agent (Alt-click on the bubble)
scenes.follow = async (s) => {
  const M = "agent-follow";
  await cursorsOn(s, true);
  await simSet(s, "t:sim-qa-3", { status: "running", finishedAt: null, summary: null });
  await simSet(s, "t:sim-qa-1", { status: "running", finishedAt: null, summary: null });
  await s.page.evaluate(() => window.__RE_TEMPO_AGENT_FOLLOW__.unfollow());
  await setView(s, ...AGENTS_VIEW);
  await kit.moveTo(s, 1250, 760, { ms: 50 });
  await sleep(1500);
  await altClick(s, B("t:sim-qa-3"), { ms: 100 });
  await sleep(2600);
  const f1 = await following(s);
  await kit.moveTo(s, 1250, 760, { ms: 50 });
  await kit.shot(s, ev(M, "02-after.png"));
  await s.page.evaluate(() => window.__RE_TEMPO_AGENT_FOLLOW__.unfollow()); // (⌥-click again does NOT stop it: see limits)
  await sleep(800);
  await setView(s, ...AGENTS_VIEW);
  await kit.moveTo(s, 1250, 760, { ms: 50 });
  await sleep(1200);
  const out = { f1 };
  out.r3 = await kit.record(s, ev(M, "03-alt-click-follow"), async () => {
    await kit.caption(s, "Alt/Option-click a bubble: the camera follows that agent, like in Figma (simulated data)");
    await altClick(s, B("t:sim-qa-3"), { ms: 700 });
    await sleep(2800);
    out.a = await following(s);
    await kit.caption(s, "The agent changes the screen and the camera stays on it");
    await kit.moveTo(s, 1250, 760, { ms: 500 });
    dogToggle();
    await sleep(3000);
  }, { tailMs: 300 });
  // the edit reloads the storyboards (HMR): wait for all of them to come back before the next recording
  await waitCanvas(s);
  await cursorsOn(s, false); // the storyboard reload may assign another storyboard to #14: recreate the cursors on the comments
  await sleep(1600);
  await cursorsOn(s, true);
  await sleep(2500);
  out.r4 = await kit.record(s, ev(M, "04-switch-agent-and-stop"), async () => {
    await kit.caption(s, "Alt/Option-click another bubble to switch agents");
    await altClick(s, B("t:sim-qa-1"), { ms: 700 });
    await sleep(2800);
    out.b = await following(s);
    await kit.caption(s, "“Stop” in the bar (or Esc) stops following");
    await kit.clickSel(s, ".rtaf-stop", { ms: 600 });
    await sleep(1600);
    out.c = await following(s);
  }, { tailMs: 300 });
  await kit.caption(s, null);
  return out;
};

// BEFORE for 27/28/29 (original Tempo): empty New Chat tab.
scenes.beforeUi = async (s) => {
  await skip(s, "*");
  await gotoTab(s, CHAT_TAB);
  await sleep(1500);
  await s.page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  await hideRealChat(s);
  for (const m of ["ui-beam", "ui-drive", "app-map"]) await kit.shot(s, ev(m, "01-before.png"));
  return true;
};

// ------------------------------------------------------------------ 27/28/29 (New Chat tab, nothing is typed)
scenes.uiSetup = async (s) => {
  await skip(s, "canvas-autosetup");
  await gotoTab(s, CHAT_TAB);
  await s.page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  await sleep(800);
  return kit.loadedMods(s).then((m) => m.length);
};
const composerRect = (s) => s.page.evaluate(() => {
  const t = document.querySelector('[data-testid="chat-input-textarea"]');
  let n = t;
  for (let i = 0; i < 8 && n; i++) { const b = n.getBoundingClientRect(); if (b.height > 90 && b.width > 500) break; n = n.parentElement; }
  const b = n.getBoundingClientRect();
  return { x: b.x, y: b.y, width: b.width, height: b.height };
});
const SETTINGS_BTN = '[aria-label="Settings"]';
const capTop = (s, v) => s.page.evaluate((x) => { if (x) document.documentElement.style.setProperty("--rtq-cap-top", x); else document.documentElement.style.removeProperty("--rtq-cap-top"); }, v);
// ui-beam's play() through the API (animation only: no action is executed).
const beam = (s, id, src, sel, label) => s.page.evaluate(([id, src, sel, label]) => {
  const el = document.querySelector(sel);
  return window.__RE_TEMPO_UI_BEAM__.play({ id, action: "demo", args: {}, sourceRect: src, targetEl: el, targetRect: el && el.getBoundingClientRect(), label });
}, [id, src, sel, label]);

scenes.beam = async (s) => {
  const M = "ui-beam";
  const src = await composerRect(s);
  let n = 0;
  const id = () => `qa-beam-${Date.now()}-${++n}`;
  const p = beam(s, id(), src, SETTINGS_BTN, "Opening Settings");
  await sleep(640);
  await kit.shot(s, ev(M, "02-after.png"));
  await p;
  await sleep(120);
  await kit.shot(s, ev(M, "04-target-frame.png"));
  await sleep(1800);
  await capTop(s, "150px");
  const r = await kit.record(s, ev(M, "03-beam-to-target"), async () => {
    await kit.caption(s, "When an agent is about to use the UI, a beam travels from the message to the target");
    await beam(s, id(), src, SETTINGS_BTN, "Opening Settings");
    await sleep(1900);
    await kit.caption(s, "Pulse at the source → rounded beam with Claude’s avatar → frame on the target");
    await beam(s, id(), src, CANVAS_TAB, "Opening untitled-4");
    await sleep(1900);
    await kit.caption(s, "Animation only: ui-beam runs nothing (ui-drive does the action)");
    await beam(s, id(), src, '[aria-label="Files"]', "Opening Files");
    await sleep(2200);
  }, { tailMs: 400 });
  await kit.caption(s, null);
  await capTop(s, null);
  return r;
};

const drive = (s, cmd) => s.page.evaluate((c) => { window.__qaDrive = window.__RE_TEMPO_UI_DRIVE__.run(c); return true; }, cmd);
const driveDone = (s) => s.page.evaluate(async () => { const r = await window.__qaDrive; return r && { status: r.status, reason: r.reason, via: r.via }; });
const toastBtn = (s, re) => s.page.evaluate((src) => {
  const b = [...document.querySelectorAll("[data-rtud-ui] button")].find((n) => new RegExp(src).test(n.innerText));
  if (!b) return null; const q = b.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
}, re);

scenes.drive = async (s) => {
  const M = "ui-drive";
  const out = {};
  await drive(s, "open settings");
  await sleep(620);
  await kit.shot(s, ev(M, "02-after.png"));
  await sleep(1300);
  await kit.shot(s, ev(M, "05-settings-opened-undo.png"));
  out.first = await driveDone(s);
  const u = await toastBtn(s, "Undo");
  if (u) await kit.click(s, u.x, u.y, { ms: 50 });
  await sleep(2500);
  await capTop(s, "150px");
  out.r3 = await kit.record(s, ev(M, "03-open-settings-undo"), async () => {
    await kit.caption(s, "Command “open settings” (sent through the mod’s local API, no real agent)");
    await drive(s, "open settings");
    await sleep(2300);
    await kit.caption(s, "The notice can undo it: “Undo” goes back to where you were");
    const b = await toastBtn(s, "Undo");
    if (b) { await kit.moveTo(s, b.x, b.y, { ms: 600 }); await sleep(250); await kit.click(s); }
    await sleep(1800);
  }, { tailMs: 300 });
  out.r4 = await kit.record(s, ev(M, "04-highlight-and-note"), async () => {
    await kit.caption(s, "“highlight”: the agent points at something on screen");
    await drive(s, `highlight ${CANVAS_TAB} 2200`);
    await sleep(2600);
    await kit.caption(s, "“toast”: the agent leaves a short note");
    await drive(s, "toast Opened Settings and came back to the chat");
    await sleep(2600);
  }, { tailMs: 300 });
  await kit.caption(s, null);
  await capTop(s, null);
  out.log = await s.page.evaluate(() => window.__RE_TEMPO_UI_DRIVE__.log().slice(-6).map((e) => [e.action, e.status, e.via]));
  return out;
};

scenes.map = async (s) => {
  const M = "app-map";
  const AM = (fn, ...args) => s.page.evaluate(([fn, args]) => { const r = window.__RE_TEMPO_APP_MAP__[fn](...args); return r && r.then ? r.then((x) => JSON.parse(JSON.stringify(x))) : JSON.parse(JSON.stringify(r)); }, [fn, args]);
  await s.page.keyboard.press("Escape");
  const dm = await toastBtn(s, "Dismiss");
  if (dm) await s.page.mouse.click(dm.x, dm.y);
  await sleep(800);
  await AM("debug", true);
  await sleep(1200);
  await kit.shot(s, ev(M, "02-after.png"));
  await AM("debug", false);
  await sleep(600);
  const rectOfItem = (it) => it && { x: it.rect[0], y: it.rect[1], width: it.rect[2], height: it.rect[3] };
  const found = (await AM("find", "untitled-4", { limit: 5 })).map((i) => ({ id: i.id, label: i.label, risk: i.risk, region: i.region, rect: i.rect }));
  const row = found.find((i) => i.id === "sidebar/treeitem/untitled-4") || found[0];
  const close = found.find((i) => i.risk === "destructive");
  await capTop(s, "150px");
  await kit.highlight(s, rectOfItem(row));
  await kit.caption(s, `find("untitled-4") → ${row.id}  ·  risk: ${row.risk}`);
  await sleep(400);
  await kit.shot(s, ev(M, "05-find-result.png"), { keepOverlay: true });
  await kit.clean(s);
  const out = {};
  out.r3 = await kit.record(s, ev(M, "03-debug-overlay"), async () => {
    await kit.caption(s, "Live map: every clickable element gets a stable name (green safe · yellow caution · red destructive)");
    await AM("debug", true);
    await sleep(3600);
    await AM("debug", false);
    await sleep(600);
  }, { tailMs: 300 });
  out.r4 = await kit.record(s, ev(M, "04-find-and-act"), async () => {
    await kit.caption(s, `The agent looks it up by name: find("untitled-4") → ${row.id}`);
    await kit.highlight(s, rectOfItem(row));
    await sleep(2200);
    await kit.highlight(s, null);
    await kit.caption(s, `…and acts by name: act("${row.id}") opens the canvas`);
    out.act1 = await AM("act", row.id);
    await sleep(2300);
    await kit.caption(s, `act("#chat-tab") goes back to the chat`);
    out.act2 = await AM("act", "#chat-tab");
    await sleep(1700);
    if (close) {
      out.act3 = await AM("act", close.id);
      await kit.highlight(s, rectOfItem(close));
      await kit.caption(s, `A destructive target without confirmation is refused: act("${close.id}") → ${out.act3 && out.act3.ok === false ? "refused" : JSON.stringify(out.act3).slice(0, 60)}`);
      await sleep(2600);
      await kit.highlight(s, null);
    }
  }, { tailMs: 400 });
  await kit.caption(s, null);
  await capTop(s, null);
  return { row: row.id, act3: out.act3 && out.act3.reason, r3: out.r3, r4: out.r4 };
};

// Prep: untitled-4 canvas in the scenes' default view, original DogHome.
scenes.prep = async (s) => {
  dogEdit(false);
  await skip(s, SKIP_CANVAS);
  await gotoTab(s, CANVAS_TAB);
  await waitCanvas(s);
  await s.page.keyboard.press("Escape");
  const v = await setView(s, ...AGENTS_VIEW);
  await sleep(1500);
  // proof that the pipeline did not reply in any thread (state.reply only exists if it tried)
  const guard = await s.page.evaluate(() => ({ reply: localStorage.getItem("rtd.commentAgent.reply"), tried: !!(window.__RE_TEMPO_COMMENT_AGENT__.state || {}).reply }));
  return { v, guard };
};

// ------------------------------------------------------------------ index.json (English) + cleanup of old names
const SIM_TASKS = "Four comment tasks with no chat and no thread (one waiting for an answer, two working, one failed) written to the mod's local store; status changes come from a simulation layer over its API.";
export const INDEX = {
  "canvas-comment-agent": {
    title: "Canvas comment becomes a Claude task",
    summary: "A comment you post on a canvas becomes a task for a Claude chat that runs in the background while you stay on the canvas. The mod tracks its status and captures the commented area before and after. When the run ends, it replies in the comment thread with a short summary and the images. Without the bubbles mod, tasks appear in a compact list over the sidebar.",
    shortcut: "Canvas comment tool",
    simulatedData: SIM_TASKS + " The typed comment was cancelled, never sent, so no chat or thread reply was created.",
    files: [
      ["01-before.png", "Original Tempo: the canvas with comment pins and nothing over the sidebar"],
      ["02-after.png", "With the mod: a compact task list at the bottom left (author, request, time running)"],
      ["03-comment-to-task.gif", "Comment on the canvas; the task joins the list"],
      ["03-comment-to-task.mp4", "Comment on the canvas; the task joins the list"],
      ["04-task-list.png", "Task list close-up: one waiting for an answer, two working"],
    ],
  },
  "comment-bubbles": {
    title: "Task bubbles next to the canvas name",
    summary: "Comment tasks become bubbles, like presence avatars, in a segment attached to the canvas name pill, with an open/done counter. Ring and badge show the status: question, working, done or failed. Clicking a bubble opens a panel with the request, the agent's question with a reply field, the steps and before/after images. In the comment thread, the agent's reply is drawn as a Claude card (not shown here: no real threads were opened).",
    shortcut: "Click a bubble · Alt/Option-click to follow",
    simulatedData: SIM_TASKS + " The after image in the panel comes from an edit made only in the project clone.",
    files: [
      ["01-before.png", "Original Tempo: only the canvas name pill"],
      ["02-after.png", "With the mod: the pill gains a segment with the counter and task bubbles"],
      ["03-open-bubble-panel.gif", "Bubble tooltip, panel with the agent's question, and a finished task with before/after"],
      ["03-open-bubble-panel.mp4", "Bubble tooltip, panel with the agent's question, and a finished task with before/after"],
      ["04-task-finishes.gif", "An agent finishes: its bubble gets a check and the counter updates"],
      ["04-task-finishes.mp4", "An agent finishes: its bubble gets a check and the counter updates"],
      ["05-full-window.png", "Full window with the bubble segment on the canvas"],
      ["06-panel-question.png", "Panel of a task waiting for an answer: amber card with the question and the answer field"],
      ["07-panel-before-after.png", "Panel of a finished task: Before (green card) and After (orange card)"],
    ],
  },
  "agent-cursors": {
    title: "Agent cursors on the canvas",
    summary: "Each agent working on a comment shows up on the canvas as a multiplayer-style cursor with a name tag and its own color. It stays near the comment and follows pan and zoom. When the screen changes, it glides to the changed element, outlines it and clicks. Waiting agents show a question mark; finished ones show a check and fade out.",
    shortcut: null,
    simulatedData: SIM_TASKS + " The agent's edit was a CSS class change in DogHomeScreen.tsx inside the project clone, undone at the end.",
    files: [
      ["01-before.png", "Original Tempo: the same canvas with only comment pins"],
      ["02-after.png", "With the mod: three agent cursors with name tags and colors"],
      ["03-agent-edits-canvas.gif", "Idle cursors, tag tooltip, the cursor gliding to the edited card and fading when done"],
      ["03-agent-edits-canvas.mp4", "Idle cursors, tag tooltip, the cursor gliding to the edited card and fading when done"],
      ["04-after-edit.png", "After the edit: the card is orange, the cursor is gone and the counter changed"],
    ],
  },
  "agent-follow": {
    title: "Follow an agent, Figma style",
    summary: "Alt/Option-clicking a task bubble makes the canvas camera follow that agent: it zooms in, frames the screen being edited and keeps up with changes. A bar shows who is being followed with a Stop button. Alt/Option-clicking another bubble switches agents; Stop or Esc ends it.",
    shortcut: "Alt/Option-click a bubble · Esc or Stop to quit",
    simulatedData: SIM_TASKS + " The screen change is the same edit in the project clone used for the cursors.",
    files: [
      ["01-before.png", "Original Tempo: canvas overview, no follow mode"],
      ["02-after.png", "Following an agent: the camera zooms into its screen and the Following Claude bar appears"],
      ["03-alt-click-follow.gif", "Alt/Option-click a bubble; the camera flies to the agent and stays on it while the screen changes"],
      ["03-alt-click-follow.mp4", "Alt/Option-click a bubble; the camera flies to the agent and stays on it while the screen changes"],
      ["04-switch-agent-and-stop.gif", "Alt/Option-click another bubble to switch agents, then Stop"],
      ["04-switch-agent-and-stop.mp4", "Alt/Option-click another bubble to switch agents, then Stop"],
    ],
  },
  "ui-beam": {
    title: "Agent handoff beam",
    summary: "When an agent is about to use the interface, an animation shows it: a pulse at the source, a rounded beam with Claude's avatar traveling to the target, and a labeled frame on the target. It is only the animation; ui-drive performs the action.",
    shortcut: null,
    simulatedData: "Triggered through the mod's local play() API with no agent; the source is the message box of an empty chat.",
    files: [
      ["01-before.png", "Original Tempo: an empty chat, no agent indication"],
      ["02-after.png", "With the mod: the beam leaves the chat box with Claude's avatar on its way to Settings"],
      ["03-beam-to-target.gif", "Three handoffs: to Settings, to the canvas tab and to Files"],
      ["03-beam-to-target.mp4", "Three handoffs: to Settings, to the canvas tab and to Files"],
      ["04-target-frame.png", "Arrival: a frame labeled Opening Settings on the button"],
    ],
  },
  "ui-drive": {
    title: "An agent drives the interface",
    summary: "An agent can operate Tempo for you: open Settings, switch sections, open a canvas, doc, issue or chat, point at an element and leave a short note. Commands come from @tempo-ui lines in chat replies, the tempo-ui CLI or the API. Every screen change shows a notice with Deny while the beam flies, then Undo and Always allow.",
    shortcut: "@tempo-ui <command> in a chat reply · tempo-ui CLI",
    simulatedData: "Commands sent through the mod's local run() API with no real agent and no chat; CLI reading pointed at an isolated file.",
    files: [
      ["01-before.png", "Original Tempo: the chat screen; nothing outside controls the UI"],
      ["02-after.png", "open settings in progress: beam to the Settings button and the Deny notice"],
      ["03-open-settings-undo.gif", "open settings, then Undo goes back to the chat"],
      ["03-open-settings-undo.mp4", "open settings, then Undo goes back to the chat"],
      ["04-highlight-and-note.gif", "highlight points at the canvas tab; toast leaves a note"],
      ["04-highlight-and-note.mp4", "highlight points at the canvas tab; toast leaves a note"],
      ["05-settings-opened-undo.png", "Settings opened by the agent, with the Undo / Always allow notice"],
    ],
  },
  "app-map": {
    title: "Live map of clickable elements",
    summary: "The app keeps a live index of everything that can be clicked, typed into, toggled or dragged, each with a stable readable name, its region and a risk level. Agents act by name instead of by pixels. A debug overlay shows the names on screen, and destructive actions need explicit confirmation.",
    shortcut: "window.__RE_TEMPO_APP_MAP__.debug(true)",
    simulatedData: "find() and act() called through the mod's local API with no real agent; the orange highlight and captions come from the capture kit.",
    files: [
      ["01-before.png", "Original Tempo: the chat screen with no markings"],
      ["02-after.png", "Debug overlay: every element's name; green safe, yellow caution, red destructive"],
      ["03-debug-overlay.gif", "Turning the debug overlay on and off"],
      ["03-debug-overlay.mp4", "Turning the debug overlay on and off"],
      ["04-find-and-act.gif", "find() by name, act() opens the canvas and returns, a destructive act() is refused"],
      ["04-find-and-act.mp4", "find() by name, act() opens the canvas and returns, a destructive act() is refused"],
      ["05-find-result.png", "find(\"untitled-4\") result highlighted: sidebar/treeitem/untitled-4, risk safe"],
    ],
  },
};
// Old names (earlier runs of this agent), deleted by name.
const OLD = {
  "canvas-comment-agent": ["04-result-in-thread.gif", "04-result-in-thread.mp4", "05-task-list.png", "06-reply-in-thread.png"],
  "comment-bubbles": ["05-thread-original.png", "06-thread-claude-card.png", "07-full-window.png", "08-panel-question.png", "09-panel-before-after.png"],
  "app-map": ["04-find.png"],
};
export function writeIndexes() {
  const out = {};
  for (const [mod, d] of Object.entries(INDEX)) {
    const removed = [];
    for (const f of OLD[mod] || []) { const p = path.join(kit.REPO, "evidence", mod, f); if (fs.existsSync(p)) { fs.unlinkSync(p); removed.push(f); } }
    const r = kit.writeIndex(mod, { title: d.title, summary: d.summary, shortcut: d.shortcut, login: true,
      files: d.files.map(([file, caption]) => ({ file, caption })), notCaptured: null, simulatedData: d.simulatedData });
    out[mod] = { removed, warnings: r.warnings, unlisted: r.unlisted };
  }
  return out;
}
scenes.index = async () => writeIndexes();

export const ORDER = ["prep", "before", "list", "listMedia", "bubblesSetup", "cursors", "bubblesMedia", "bubblesExtras", "follow",
  "beforeUi", "uiSetup", "beam", "drive", "map", "index"];

if (import.meta.url === `file://${process.argv[1]}`) {
  const want = process.argv.slice(2);
  if (want.length === 1 && want[0] === "index") { console.log(JSON.stringify(writeIndexes(), null, 1)); process.exit(0); }
  const s = await openGuarded();
  const t0 = Date.now();
  try {
    for (const name of ORDER) {
      if (want.length && !want.includes(name)) continue;
      const t = Date.now();
      console.log(`[agents] scene ${name}`);
      const r = await scenes[name](s);
      console.log(`[agents] ${name} (${((Date.now() - t) / 1000).toFixed(1)} s) ->`, JSON.stringify(r === undefined ? null : r, (k, v) => (typeof v === "string" && v.length > 200 ? v.slice(0, 60) + "…" : v)).slice(0, 900));
    }
  } catch (e) {
    console.error("[agents] ERROR", e && e.stack || e);
    process.exitCode = 1;
  } finally {
    const rr = await finalRestore(s).catch((e) => ({ error: e.message }));
    console.log("[agents] localStorage restore:", JSON.stringify(rr));
    try { dogEdit(false); console.log("[agents] clone DogHomeScreen.tsx restored"); } catch (e) { console.error("dog", e.message); }
    await kit.close(s);
    console.log(`[agents] done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}
