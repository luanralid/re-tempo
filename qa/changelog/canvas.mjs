#!/usr/bin/env node
// qa/changelog/canvas.mjs — visual changelog captures, "canvas" group (profile qa-3)
// -----------------------------------------------------------------------------
// Mods: canvas-quick, canvas-keys, canvas-snap, canvas-browser, canvas-shader,
//       zoom, canvas-autosetup, canvas-paste.
// Usage (from qa/):  node changelog/canvas.mjs [mod ...]     (no args = all)
// Output (fixed board structure, names and text in English): evidence/<mod>/01-before.png,
// 02-after.png, 03-<action>.{gif,mp4}, 04-..., index.json (kit.writeIndex).
//
// Test canvases only in the qa-3 clone: "QA-changelog-screens" (copy of untitled-4 from
// the qa-1 clone) and "QA-changelog-images" (copy of untitled-2). Nothing leaves the clone: no
// system clipboard, no chat sending (same account lock as kit.open).
// zoom: main runs with --inspect (slot port) and the NATIVE zoom is changed by
// main itself (webContents.setZoomLevel, the same thing View > Zoom In does);
// menu shortcuts do not reach the app over CDP.
// -----------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import * as kit from "./kit.mjs";

const { sleep, REPO } = kit;
const PROFILE = "qa-3";
const CANVAS = "QA-changelog-screens";
const CANVAS2 = "QA-changelog-images";
const CLONE = `/tmp/tempo-qa/profiles/${PROFILE}/projects/seed-tracker`;
const CANVAS_DIR = path.join(CLONE, "tempo/designs/canvases", CANVAS);
const SOURCES = { [CANVAS]: ["/tmp/tempo-qa/profiles/qa-1/projects/seed-tracker/tempo/designs/canvases/untitled-4", "untitled-4"], [CANVAS2]: ["/tmp/tempo-qa/profiles/qa-1/projects/seed-tracker/tempo/designs/canvases/untitled-2", "untitled-2"] };

// ------------------------------------------------------------------ session
// Same as kit.open, but with the main-process inspector on (native zoom).
export async function openSession({ profile = PROFILE, width = 1440, height = 900, dpr = 1 } = {}) {
  const { makeLabApp } = await import("./make-lab-app.mjs");
  const { refreshAuth } = await import("./make-profile.mjs");
  const inst = await import("../instance.mjs");
  const cfg = await import("../lib/config.mjs");
  const cdp = await import("../lib/cdp.mjs");
  const ui = await import("../lib/ui.mjs");
  inst.installSignalCleanup();
  makeLabApp();
  refreshAuth(profile);
  const paths = cfg.profilePaths(profile);
  const i = await inst.launch({ paths, inspect: true });
  const browser = await cdp.connect(i.cdpPort);
  let page = null;
  for (let k = 0; k < 60 && !page; k++) { page = await cdp.pickMainPage(browser); if (!page) await sleep(500); }
  if (!page) throw new Error("main page not found");
  // same account lock as kit.open (from connection and on every reload)
  const GUARD = () => {
    try {
      localStorage.setItem("rtd.commentAgent.reply", "off");
      localStorage.setItem("re-tempo:canvas-autosetup-send", "0");
      localStorage.setItem("rtd.appMap.export", "off");
      localStorage.setItem("rtd.uiDrive.file", "/tmp/tempo-qa/changelog-uidrive/ui-commands.jsonl");
    } catch (_) {}
  };
  fs.mkdirSync("/tmp/tempo-qa/changelog-uidrive", { recursive: true });
  await page.evaluate(GUARD).catch(() => {});
  await page.addInitScript(GUARD).catch(() => {});
  const session = await page.context().newCDPSession(page);
  const s = { profile, inst: i, browser, page, cdp: session, width, height, dpr, overlay: false, inspectPort: paths.ports.inspect };
  await kit.viewport(s, width, height, dpr);
  await ui.waitForReady(page);
  await kit.waitApp(s);
  await s.cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});
  return s;
}

// Evaluates an expression in the main process (Node inspector, QA instance only).
export async function mainEval(s, expression) {
  const list = await (await fetch(`http://127.0.0.1:${s.inspectPort}/json/list`)).json();
  const ws = new WebSocket(list[0].webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const out = await new Promise((resolve, reject) => {
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id !== 1) return;
      if (m.error || m.result.exceptionDetails) reject(new Error(JSON.stringify(m.error || m.result.exceptionDetails)));
      else resolve(m.result.result.value);
    };
    ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true, includeCommandLineAPI: true } }));
  });
  ws.close();
  return out;
}

// ------------------------------------------------------------------ working canvas
// Test canvases only in the qa-3 clone (English names).
const CANVASES_DIR = path.join(CLONE, "tempo/designs/canvases");
export function ensureCanvas() {
  const made = [];
  for (const [name, [src, oldName]] of Object.entries(SOURCES)) {
    const dir = path.join(CANVASES_DIR, name);
    if (fs.existsSync(path.join(dir, "index.canvas.tsx"))) continue;
    fs.cpSync(src, dir, { recursive: true });
    const f = path.join(dir, "index.canvas.tsx");
    fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(`<Canvas name="${oldName}"`, `<Canvas name="${name}"`));
    made.push(name);
  }
  return { made };
}

export const ev = (dir, name) => `evidence/${dir}/${name}`;

// ------------------------------------------------------------------ canvas helpers
export async function canvasRoot(s) {
  return s.page.evaluate(() => {
    for (const n of document.querySelectorAll("[data-canvas-root]")) {
      const r = n.getBoundingClientRect();
      if (r.width > 100 && r.height > 100) return { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    return null;
  });
}

// Screen rectangles of the visible storyboards.
export async function items(s) {
  return s.page.evaluate(() => [...document.querySelectorAll("[data-canvas-item-id]")].map((n) => {
    const r = n.getBoundingClientRect();
    return { id: n.getAttribute("data-canvas-item-id"), x: r.x, y: r.y, width: r.width, height: r.height, sel: n.hasAttribute("data-canvas-item-selected") };
  }).filter((r) => r.width > 0));
}

// Empty canvas point (outside storyboards, toolbars and pills).
export async function emptyPoint(s, prefer = "left") {
  return s.page.evaluate((prefer) => {
    const root = [...document.querySelectorAll("[data-canvas-root]")].find((n) => n.getBoundingClientRect().width > 100);
    if (!root) return null;
    const R = root.getBoundingClientRect();
    const xs = [];
    for (let fx = 0.06; fx < 0.95; fx += 0.04) xs.push(R.x + R.width * fx);
    if (prefer === "right") xs.reverse();
    for (let fy = 0.45; fy < 0.85; fy += 0.05) {
      for (const x of xs) {
        const y = R.y + R.height * fy;
        const el = document.elementFromPoint(x, y);
        if (!el || !root.contains(el)) continue;
        if (el.closest("[data-canvas-item-id], [role=toolbar], button, [data-rcb-frame], [data-rcs-frame], .rcb-frame, .rcs-frame")) continue;
        return { x: Math.round(x), y: Math.round(y) };
      }
    }
    return { x: Math.round(R.x + 30), y: Math.round(R.y + R.height - 120) };
  }, prefer);
}

export async function focusCanvas(s, { show = false } = {}) {
  const p = await emptyPoint(s);
  if (show) await kit.click(s, p.x, p.y);
  else { await s.page.mouse.click(p.x, p.y); s.mouse = p; }
  await sleep(250);
  return p;
}

// Shift+1 = zoom to fit (the app's built-in shortcut).
export async function fit(s) {
  await focusCanvas(s);
  await s.page.keyboard.press("Escape");
  await s.page.keyboard.press("Shift+Digit1");
  await sleep(900);
}

// Ensures the Design route with the working canvas open (visible elements only: the
// workspace route stays mounted and hidden alongside).
export async function gotoCanvas(s) {
  const vis = "(n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; }";
  const state = () => s.page.evaluate(([name, visSrc]) => {
    const vis = (0, eval)(visSrc);
    const root = [...document.querySelectorAll("[data-canvas-root]")].some((n) => vis(n) && n.getBoundingClientRect().width > 100);
    const tabs = [...document.querySelectorAll("[role=tab]")].filter(vis).map((n) => n.textContent.trim());
    const tree = [...document.querySelectorAll("[role=treeitem]")].some(vis);
    return { root, design: tabs.includes("Home"), canvasTab: tabs.some((x) => x.startsWith(name)), tree };
  }, [CANVAS, vis]);
  let st = await state();
  if (st.design && st.canvasTab && st.root && st.tree) return true;
  if (!st.design) {
    await s.page.evaluate(() => document.querySelector("[data-testid=workspace-navbar-design-button]")?.click());
    await sleep(2500);
    st = await state();
  }
  // canvas tab already open in the Design route: click it
  const tab = await s.page.evaluate((name) => { const t = [...document.querySelectorAll("[role=tab]")].find((n) => n.getBoundingClientRect().width && n.textContent.trim().startsWith(name)); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, CANVAS);
  if (tab) { await s.page.mouse.click(tab.x, tab.y); await sleep(2500); }
  else {
    // Design home (cards) or the "Canvases" list in the left panel
    const pos = await s.page.evaluate((name) => {
      for (const n of document.querySelectorAll("[role=treeitem], body *")) {
        if (n.getAttribute("role") !== "treeitem" && n.children.length) continue;
        if (n.textContent.trim() !== name) continue;
        const r = n.getBoundingClientRect();
        if (r.width) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
      return null;
    }, CANVAS);
    if (pos) { await s.page.mouse.click(pos.x, pos.y); await sleep(400); st = await state(); if (!st.canvasTab) await s.page.mouse.dblclick(pos.x, pos.y); }
  }
  for (let i = 0; i < 40; i++) { st = await state(); if (st.design && st.canvasTab && st.root) break; await sleep(500); }
  await sleep(2500);
  return st.design && st.canvasTab && st.root;
}

export async function closeRightSidebar(s) {
  const r = await s.page.evaluate(() => {
    for (const b of document.querySelectorAll('button[aria-label="Collapse right sidebar"]')) {
      const r = b.getBoundingClientRect();
      if (r.width && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest("button") === b) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return null;
  });
  if (r) { await s.page.mouse.click(r.x, r.y); await sleep(1000); }
  return !!r;
}

export async function prep(s) {
  await gotoCanvas(s);
  await closeRightSidebar(s);
  await kit.clean(s);
  await fit(s);
}

// ------------------------------------------------------------------ recording helpers
const say = (s, t) => kit.caption(s, t);
export async function toolbarButton(s, label) {
  return s.page.evaluate((label) => {
    const tb = [...document.querySelectorAll('[role="toolbar"][aria-label="Design tools"]')].find((t) => t.getBoundingClientRect().width > 0);
    if (!tb) return null;
    for (const b of tb.querySelectorAll("button")) {
      const l = (b.getAttribute("aria-label") || b.title || "").trim();
      if (l.toLowerCase().startsWith(label.toLowerCase())) { const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, pressed: b.getAttribute("aria-pressed") }; }
    }
    return null;
  }, label);
}
export async function zoomLabel(s) {
  return s.page.evaluate(() => [...document.querySelectorAll('button[aria-label^="Zoom "]')].map((b) => b.getAttribute("aria-label")).find((l) => /%$/.test(l)) || null);
}

// =================================================================== 7. canvas-keys
export const canvasKeys = {
  dir: "canvas-keys",
  async before(s) {
    await prep(s);
    await s.page.keyboard.press("?");
    await sleep(800);
    const sheet = await s.page.evaluate(() => !!document.querySelector("[data-rtck-sheet]"));
    await kit.shot(s, ev("canvas-keys", "01-before.png"));
    return { sheet };
  },
  async after(s) {
    await prep(s);
    await s.page.keyboard.press("?");
    await sleep(800);
    await kit.shot(s, ev("canvas-keys", "02-after.png"));
    await kit.shot(s, ev("canvas-keys", "04-shortcut-sheet.png"), { selector: "[data-rtck-sheet]", pad: 10, scale: 2 });
    await s.page.keyboard.press("Escape");
    await sleep(400);
    const out = {};
    out.rec = await kit.record(s, ev("canvas-keys", "03-single-key-shortcuts"), async () => {
      await say(s, "Single-key canvas shortcuts, Figma style");
      const p = await emptyPoint(s);
      await kit.click(s, p.x, p.y);
      await sleep(900);
      await say(s, "? opens a sheet with every canvas shortcut");
      await s.page.keyboard.press("?");
      await sleep(2600);
      await say(s, "Esc closes the sheet");
      await s.page.keyboard.press("Escape");
      await sleep(1100);
      await say(s, "C turns on the Comment tool (toolbar button)");
      const cb = await toolbarButton(s, "Comment");
      await s.page.keyboard.press("c");
      await sleep(300);
      if (cb) await kit.highlight(s, cb);
      await sleep(1800);
      await kit.highlight(s, null);
      await s.page.keyboard.press("Escape");
      await sleep(500);
      await say(s, "Shift+0 zooms to 100%");
      const zr = await s.page.evaluate(() => { const b = [...document.querySelectorAll('button[aria-label^="Zoom "]')].find((n) => n.getBoundingClientRect().width); const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
      await kit.highlight(s, zr);
      await s.page.keyboard.press("Shift+Digit0");
      await sleep(2000);
      out.zoomAfter = await zoomLabel(s);
      await say(s, "Shift+1 (built-in) zooms to fit again");
      await s.page.keyboard.press("Shift+Digit1");
      await sleep(1600);
      await kit.highlight(s, null);
      await say(s, null);
    });
    // 05: Comment tool turned on by the C key
    await focusCanvas(s);
    await s.page.keyboard.press("c");
    await sleep(500);
    const tb = await s.page.evaluate(() => { const t = [...document.querySelectorAll('[role="toolbar"][aria-label="Design tools"]')].find((n) => n.getBoundingClientRect().width); const r = t.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    out.comment = await toolbarButton(s, "Comment");
    await kit.shot(s, ev("canvas-keys", "05-key-c-comment-tool.png"), { clip: { x: tb.x - 12, y: tb.y - 12, width: tb.width + 24, height: tb.height + 24 }, scale: 2 });
    await s.page.keyboard.press("Escape");
    await sleep(300);
    return out;
  },
};

// Drag with a visible fake cursor.
export async function drag(s, a, b, { ms = 700, down = 300 } = {}) {
  await kit.moveTo(s, a.x, a.y, { ms: 350 });
  await s.page.mouse.down();
  await sleep(down);
  await kit.moveTo(s, b.x, b.y, { ms });
  await sleep(120);
  await s.page.mouse.up();
}
// Linear movement in short steps (the "Open ›" submenu closes with the kit.moveTo easing).
export async function glide(s, x, y, { steps = 10, stepMs = 30 } = {}) {
  await kit.overlay(s); await kit.cursor(s, true);
  const from = s.mouse || { x, y };
  for (let i = 1; i <= steps; i++) {
    const px = from.x + (x - from.x) * i / steps, py = from.y + (y - from.y) * i / steps;
    await s.page.mouse.move(px, py);
    await s.page.evaluate(([a, b]) => window.__rtq && window.__rtq.at(a, b), [px, py]);
    await sleep(stepMs);
  }
  s.mouse = { x, y };
}
const center = (r) => ({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
export async function item(s, id) { return (await items(s)).find((i) => i.id === id) || null; }

// Selects ONLY the storyboard (drag selection). A plain click also selects the
// root element, and then the app measures elements itself (the mod stays quiet on purpose).
export async function marquee(s, id, { show = false } = {}) {
  const d = await item(s, id);
  const a = { x: Math.round(d.x - 12), y: Math.round(d.y - 25) }, b = { x: Math.round(d.x + d.width + 8), y: Math.round(d.y + d.height + 4) };
  if (show) await drag(s, a, b);
  else { await s.page.mouse.move(a.x, a.y); await s.page.mouse.down(); await s.page.mouse.move(b.x, b.y, { steps: 12 }); await s.page.mouse.up(); }
  await sleep(500);
  return d;
}

// =================================================================== 8. canvas-snap
export const canvasSnap = {
  dir: "canvas-snap",
  async before(s) {
    await prep(s);
    await marquee(s, "DogHome");
    await s.page.keyboard.down("Alt");
    const k = await item(s, "KittiesApp");
    await s.page.mouse.move(center(k).x, center(k).y, { steps: 4 });
    await sleep(700);
    await kit.overlay(s); await kit.cursor(s, true); await s.page.evaluate(([x, y]) => window.__rtq.at(x, y), [center(k).x, center(k).y]);
    await kit.shot(s, ev("canvas-snap", "01-before.png"), { keepOverlay: true });
    await s.page.keyboard.up("Alt");
    await kit.clean(s);
    return {};
  },
  async after(s) {
    await prep(s);
    const out = {};
    await marquee(s, "DogHome");
    await s.page.keyboard.down("Alt");
    const k = await item(s, "KittiesApp");
    await s.page.mouse.move(center(k).x, center(k).y, { steps: 4 });
    await sleep(700);
    out.m1 = await s.page.evaluate(() => window.__RE_TEMPO_CANVAS_SNAP__.lastMeasure?.reason);
    await kit.overlay(s); await kit.cursor(s, true); await s.page.evaluate(([x, y]) => window.__rtq.at(x, y), [center(k).x, center(k).y]);
    await kit.shot(s, ev("canvas-snap", "02-after.png"), { keepOverlay: true });
    const sb = await item(s, "Storyboard1");
    await s.page.mouse.move(center(sb).x, center(sb).y, { steps: 4 });
    await s.page.evaluate(([x, y]) => window.__rtq.at(x, y), [center(sb).x, center(sb).y]);
    await sleep(700);
    await kit.shot(s, ev("canvas-snap", "04-alt-hover-storyboard-below.png"), { keepOverlay: true });
    const e = await emptyPoint(s, "right");
    await s.page.mouse.move(e.x, e.y, { steps: 4 });
    await s.page.evaluate(([x, y]) => window.__rtq.at(x, y), [e.x, e.y]);
    await sleep(700);
    await kit.shot(s, ev("canvas-snap", "05-alt-empty-canvas.png"), { keepOverlay: true });
    await s.page.keyboard.up("Alt");
    await kit.clean(s);
    await s.page.keyboard.press("Escape");
    await sleep(300);
    out.rec = await kit.record(s, ev("canvas-snap", "03-alt-measure"), async () => {
      await say(s, "1. Select a storyboard (drag a selection around it)");
      await marquee(s, "DogHome", { show: true });
      await sleep(700);
      await say(s, "2. Hold Alt/Option and hover another storyboard");
      await s.page.keyboard.down("Alt");
      const k2 = await item(s, "KittiesApp");
      await kit.moveTo(s, center(k2).x, center(k2).y, { ms: 700 });
      await sleep(1800);
      await say(s, "Red lines and labels: exact distance in canvas px");
      const sb2 = await item(s, "Storyboard1");
      await kit.moveTo(s, center(sb2).x, center(sb2).y, { ms: 700 });
      await sleep(1800);
      const c2 = await item(s, "CarHome");
      if (c2) { await kit.moveTo(s, center(c2).x - 20, center(c2).y + 40, { ms: 800 }); await sleep(1500); }
      await say(s, "Over empty canvas: distance to the nearest neighbor on each side");
      const e2 = await emptyPoint(s, "right");
      await kit.moveTo(s, e2.x, e2.y, { ms: 700 });
      await sleep(1900);
      await say(s, "Release Alt: the measurements disappear");
      await s.page.keyboard.up("Alt");
      await sleep(1400);
      await say(s, null);
    });
    await s.page.keyboard.press("Escape");
    return out;
  },
};

// Infinite canvas handle (getView/setView), found through the [data-canvas-root] fiber.
export async function setView(s, wx, wy, zoom) {
  return s.page.evaluate(([wx, wy, zoom]) => {
    const root = [...document.querySelectorAll("[data-canvas-root]")].find((n) => n.getBoundingClientRect().width > 100);
    const k = Object.keys(root).find((x) => x.startsWith("__reactFiber$"));
    let h = null;
    for (let f = root[k], d = 0; f && d < 600 && !h; d++, f = f.return) {
      for (const r of [f.ref, f.memoizedProps && f.memoizedProps.ref]) if (r && typeof r === "object" && r.current && typeof r.current.getView === "function") { h = r.current; break; }
    }
    const R = root.getBoundingClientRect();
    h.setView({ x: R.width / 2 - wx * zoom, y: R.height / 2 - wy * zoom, zoom });
    return h.getView();
  }, [wx, wy, zoom]);
}

// Removes frames (browser/shader) left by previous runs, only on the working canvas.
export async function clearFrames(s) {
  return s.page.evaluate(() => {
    let n = 0;
    const B = window.__RE_TEMPO_CANVAS_BROWSER__, S = window.__RE_TEMPO_CANVAS_SHADER__;
    if (B) for (const f of B.frames()) { B.remove(f.id, false); n++; }
    if (S && S.frames) for (const f of S.frames()) { S.remove(f.id, false); n++; }
    return n;
  });
}

// =================================================================== 9. canvas-browser
const BROWSER_WORLD = { x: 1700, y: -1000, zoom: 0.6 };
export const canvasBrowser = {
  dir: "canvas-browser",
  async before(s) {
    await prep(s);
    await setView(s, BROWSER_WORLD.x, BROWSER_WORLD.y, BROWSER_WORLD.zoom);
    await sleep(700);
    await kit.shot(s, ev("canvas-browser", "01-before.png"));
    const tb = await s.page.evaluate(() => { const t = [...document.querySelectorAll('[role="toolbar"][aria-label="Design tools"]')].find((n) => n.getBoundingClientRect().width); const r = t.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    await kit.shot(s, ev("canvas-browser", "05-toolbar-original.png"), { clip: { x: tb.x - 12, y: tb.y - 12, width: tb.width + 24, height: tb.height + 24 }, scale: 2 });
    return {};
  },
  async after(s) {
    await prep(s);
    const out = { cleared: await clearFrames(s) };
    await setView(s, BROWSER_WORLD.x, BROWSER_WORLD.y, BROWSER_WORLD.zoom);
    await sleep(700);
    out.rec = await kit.record(s, ev("canvas-browser", "03-draw-browser-frame"), async () => {
      await say(s, "New Browser tool in the canvas toolbar (shortcut W)");
      const b = await toolbarButton(s, "Browser");
      await kit.highlight(s, b);
      await kit.click(s, b.x + b.width / 2, b.y + b.height / 2);
      await sleep(600);
      await kit.highlight(s, null);
      await say(s, "Drag on the canvas to draw a browser frame");
      await drag(s, { x: 600, y: 210 }, { x: 1110, y: 540 }, { ms: 800 });
      await sleep(600);
      await say(s, "Type an address: the live page loads inside the canvas");
      await s.page.keyboard.type("example.com", { delay: 90 });
      await sleep(300);
      await s.page.keyboard.press("Enter");
      await sleep(3600);
      await say(s, null);
    });
    out.rec2 = await kit.record(s, ev("canvas-browser", "04-move-resize-frame"), async () => {
      await say(s, "Drag the title to move the frame");
      const f = (await s.page.evaluate(() => window.__RE_TEMPO_CANVAS_BROWSER__.frames()))[0];
      out.frame = f;
      const grab = await s.page.evaluate(() => { const n = [...document.querySelectorAll(".rtbf-head-title")].find((x) => x.getBoundingClientRect().width); const b = n.getBoundingClientRect(); return { x: Math.round(b.x + Math.min(40, b.width / 2)), y: Math.round(b.y + b.height / 2) }; });
      await drag(s, grab, { x: grab.x + 90, y: grab.y + 70 }, { ms: 900 });
      await sleep(900);
      await say(s, "Drag a corner to resize it");
      const fr = await s.page.evaluate(() => { const n = [...document.querySelectorAll(".rtbf-frame")].find((x) => x.getBoundingClientRect().width > 100); const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
      out.fr = fr;
      await drag(s, { x: Math.round(fr.x + fr.width - 1), y: Math.round(fr.y + fr.height - 1) }, { x: Math.round(fr.x + fr.width + 150), y: Math.round(fr.y + fr.height + 110) }, { ms: 1000 });
      await sleep(1000);
      await say(s, "The frame zooms and pans with the storyboards");
      await s.page.keyboard.press("Escape");
      await sleep(200);
      await setView(s, BROWSER_WORLD.x - 600, BROWSER_WORLD.y + 300, 0.3);
      await sleep(1400);
      await say(s, null);
    });
    out.frames = await s.page.evaluate(() => window.__RE_TEMPO_CANVAS_BROWSER__.frames());
    // 02: new frame (not resized: the webview guest does not re-layout in the offscreen window)
    await clearFrames(s);
    await setView(s, 1575, -1060, 0.8);
    await sleep(500);
    await s.page.evaluate(() => window.__RE_TEMPO_CANVAS_BROWSER__.create({ x: 1150, y: -1330, w: 850, h: 550, url: "https://example.com" }));
    await sleep(4000);
    await kit.moveTo(s, 1300, 860, { ms: 50 });
    await kit.clean(s);
    await kit.shot(s, ev("canvas-browser", "02-after.png"));
    const tb = await s.page.evaluate(() => { const t = [...document.querySelectorAll('[role="toolbar"][aria-label="Design tools"]')].find((n) => n.getBoundingClientRect().width); const r = t.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    await kit.shot(s, ev("canvas-browser", "06-toolbar-browser-tool.png"), { clip: { x: tb.x - 12, y: tb.y - 12, width: tb.width + 24, height: tb.height + 24 }, scale: 2 });
    return out;
  },
};

// =================================================================== 10. canvas-shader
// Version of 2026-10-18 17:17: the toolbar Shader tool (and the S key) is gone; a shader is
// created from the "+" menu › "Shader on Canvas" (or from New page) and can also be an EFFECT
// of a storyboard (Design panel › Effects › + › Shader).
const SHADER_VIEW = { x: 1700, y: -1000, zoom: 0.6 };
async function rectSel(s, sel) { return kit.rectOf(s, sel); }
async function pickOption(s, sel, value) {
  // The native <select> menu does not show in CDP captures: the cursor clicks the field and
  // the value is changed the way a user would (change event).
  const r = await rectSel(s, sel);
  await kit.click(s, r.x + r.width / 2, r.y + r.height / 2);
  await sleep(250);
  await s.page.keyboard.press("Escape");
  await s.page.evaluate(([sel, value]) => { const n = document.querySelector(sel); n.value = value; n.dispatchEvent(new Event("input", { bubbles: true })); n.dispatchEvent(new Event("change", { bubbles: true })); }, [sel, value]);
}
async function openRightPanel(s) {
  const b = await s.page.evaluate(() => { const b = [...document.querySelectorAll('button[aria-label="Open right sidebar"]')].find((x) => { const r = x.getBoundingClientRect(); return r.width && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest("button") === x; }); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (b) { await s.page.mouse.click(b.x, b.y); await sleep(1200); }
  const d = await s.page.evaluate(() => { const t = [...document.querySelectorAll('[data-testid="canvas-right-panel"] button')].find((x) => x.textContent.trim() === "Design" && x.getBoundingClientRect().width); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (d) { await s.page.mouse.click(d.x, d.y); await sleep(600); }
  return !!b;
}
// Truly visible button (there is a 2nd, hidden canvas mount in the Design route).
async function clickVisibleButton(s, text, opts = {}) {
  const r = await s.page.evaluate((text) => {
    for (const b of document.querySelectorAll("button")) {
      if (b.textContent.trim() !== text) continue;
      const r = b.getBoundingClientRect();
      if (!r.width) continue;
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (hit && (hit === b || b.contains(hit))) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return null;
  }, text);
  if (!r) throw new Error("visible button not found: " + text);
  await kit.click(s, r.x, r.y, opts);
  return r;
}
async function visibleRect(s, sel) {
  return s.page.evaluate((sel) => {
    for (const n of document.querySelectorAll(sel)) {
      const r = n.getBoundingClientRect();
      if (!r.width) continue;
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (hit && (hit === n || n.contains(hit))) return { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    return null;
  }, sel);
}
async function clickVisibleFrame(s, opts = {}) {
  const fr = await s.page.evaluate(() => { const n = [...document.querySelectorAll(".rtsh-frame")].find((x) => { const r = x.getBoundingClientRect(); if (r.width < 50) return false; const hit = document.elementFromPoint(r.x + r.width * 0.4, r.y + r.height * 0.5); return hit && x.contains(hit); }); if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  if (fr) await kit.click(s, Math.round(fr.x + fr.width * 0.4), Math.round(fr.y + fr.height * 0.5), opts);
  return fr;
}
async function clearEffects(s) {
  return s.page.evaluate(() => { const S = window.__RE_TEMPO_CANVAS_SHADER__; if (!S || !S.effects) return 0; let n = 0; for (const e of S.effects()) { S.removeEffect(e.id, false); n++; } return n; });
}
async function plusMenuItem(s, testid) {
  const a = await kit.rectOf(s, ADD);
  await kit.moveTo(s, a.x + a.width / 2, a.y + a.height / 2, { ms: 400 });
  await s.page.evaluate(([x, y]) => window.__rtq && window.__rtq.ripple(x, y), [a.x + a.width / 2, a.y + a.height / 2]);
  await s.page.mouse.click(a.x + a.width / 2, a.y + a.height / 2, { button: "right" });
  let it = null;
  for (let i = 0; i < 15 && !it; i++) { await sleep(150); it = await kit.rectOf(s, `[data-testid="${testid}"]`); }
  if (!it) return false;
  await sleep(150);
  it = await kit.rectOf(s, `[data-testid="${testid}"]`);
  await kit.moveTo(s, it.x + 50, it.y + it.height / 2, { ms: 450 });
  await sleep(300);
  await kit.click(s);
  return true;
}
export const canvasShader = {
  dir: "canvas-shader",
  async before(s) {
    const out = { ws: await gotoWorkspace(s) };
    await closeRightSidebar(s);
    await setView(s, SHADER_VIEW.x, SHADER_VIEW.y, SHADER_VIEW.zoom);
    await sleep(700);
    // original Tempo "+" menu (with a canvas on screen): no "Shader on Canvas"
    const a = await kit.rectOf(s, ADD);
    await kit.click(s, a.x + a.width / 2, a.y + a.height / 2);
    await sleep(900);
    out.items = await s.page.evaluate(() => [...document.querySelectorAll('[data-testid="new-tab-panel"] [data-testid^="new-tab-action-"]')].map((n) => n.textContent.trim()));
    await kit.shot(s, ev("canvas-shader", "01-before.png"), { keepOverlay: true, clip: await contentClip(s) });
    await s.page.keyboard.press("Escape");
    await sleep(400);
    await kit.clean(s);
    // a storyboard's Design panel in the original: no mod effects section
    await setView(s, 430, 100, 0.3);
    await sleep(500);
    await selectOnly(s, ["Storyboard1"]);
    await openRightPanel(s);
    await s.page.evaluate(() => { const p = document.querySelector('[data-testid="canvas-right-panel"]'); const sc = p && [...p.querySelectorAll("*")].find((n) => n.scrollHeight > n.clientHeight + 40 && getComputedStyle(n).overflowY !== "visible"); if (sc) sc.scrollTop = sc.scrollHeight; });
    await sleep(600);
    await kit.shot(s, ev("canvas-shader", "08-panel-original-no-shader-effects.png"), { clip: await contentClip(s) });
    await closeRightSidebar(s);
    await s.page.keyboard.press("Escape");
    return out;
  },
  async after(s) {
    const out = { ws: await gotoWorkspace(s) };
    await closeRightSidebar(s);
    out.cleared = await clearFrames(s);
    out.fxCleared = await clearEffects(s);
    await setView(s, SHADER_VIEW.x, SHADER_VIEW.y, SHADER_VIEW.zoom);
    await sleep(700);
    for (let attempt = 0; attempt < 3 && !out.rec; attempt++) {
     await clearFrames(s);
     await s.page.keyboard.press("Escape");
     try {
     out.rec = await kit.record(s, ev("canvas-shader", "03-add-shader-frame"), async () => {
      await say(s, "\"+\" menu (right-click +) › Shader on Canvas");
      out.plus = await plusMenuItem(s, "new-tab-action-canvas-shader");
      await sleep(400);
      if (!(await s.page.evaluate(() => window.__RE_TEMPO_CANVAS_SHADER__.frames().length))) throw new Error("frame not created by the + menu");
      await say(s, "An animated WebGL shader lands mid-view; click it to open the panel");
      await sleep(600);
      out.frameRect = await clickVisibleFrame(s, { ms: 500 });
      for (let i = 0; i < 10 && !(await kit.rectOf(s, 'select[data-rtsh-ctl="preset"]')); i++) await sleep(200);
      await sleep(400);
      await say(s, "Panel: pick a preset");
      await pickOption(s, 'select[data-rtsh-ctl="preset"]', "waves");
      await sleep(1100);
      await say(s, "Controls generated from the GLSL annotations");
      const sl = await s.page.evaluate(() => { const n = [...document.querySelectorAll("input.rtsh-range")].filter((x) => { const r = x.getBoundingClientRect(); return r.width && r.x > 300 && !/speed/i.test(x.getAttribute("aria-label") || ""); }); const t = n[0]; if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, v: +t.value, min: +t.min, max: +t.max }; });
      out.slider = sl;
      if (sl) {
        const fx = (v) => sl.x + 6 + ((v - sl.min) / (sl.max - sl.min)) * (sl.width - 12);
        const y = Math.round(sl.y + sl.height / 2);
        await drag(s, { x: Math.round(fx(sl.v)), y }, { x: Math.round(sl.x + sl.width - 4), y }, { ms: 600 });
        await sleep(400);
        await drag(s, { x: Math.round(sl.x + sl.width - 4), y }, { x: Math.round(sl.x + sl.width * 0.2), y }, { ms: 600 });
        await sleep(400);
      }
      await say(s, "Edit GLSL: live editor with the compiler log");
      await clickVisibleButton(s, "Edit GLSL", { ms: 500 });
      await sleep(1600);
      await say(s, "Esc closes the editor; the frame keeps animating");
      await s.page.keyboard.press("Escape");
      await sleep(600);
      await say(s, null);
    });
     } catch (e) { out.recErr = (out.recErr || []).concat(e.message); await kit.caption(s, null); await s.page.keyboard.press("Escape"); }
    }
    out.frames = await s.page.evaluate(() => window.__RE_TEMPO_CANVAS_SHADER__.frames().map((f) => ({ id: f.id, preset: f.preset, status: f.status, renders: f.renders })));
    // 02/04: reopen the panel by clicking the visible frame (the API's S.select may hit the hidden mount)
    await s.page.keyboard.press("Escape");
    await sleep(300);
    await clickVisibleFrame(s, { ms: 50 });
    await sleep(1500);
    await kit.moveTo(s, 700, 860, { ms: 50 });
    await kit.shot(s, ev("canvas-shader", "02-after.png"), { clip: await contentClip(s) });
    await clickVisibleButton(s, "Edit GLSL", { ms: 50 });
    await sleep(1500);
    await kit.shot(s, ev("canvas-shader", "05-glsl-editor.png"));
    await s.page.keyboard.press("Escape");
    await sleep(500);
    // 05: presets side by side
    await clearFrames(s);
    await s.page.keyboard.press("Escape");
    await setView(s, 1760, -1220, 0.6);
    await sleep(500);
    const presets = ["mesh", "aurora", "waves", "halftone", "fluid", "particles"];
    for (let i = 0; i < presets.length; i++) {
      const x = 1000 + (i % 3) * 520, y = -1560 + Math.floor(i / 3) * 360;
      await s.page.evaluate(([x, y, p]) => { const S = window.__RE_TEMPO_CANVAS_SHADER__; const id = S.create({ x, y, w: 480, h: 300, preset: p }); if (id && typeof id === "string") S.setPreset(id, p); }, [x, y, presets[i]]);
      await sleep(250);
    }
    await s.page.evaluate(() => window.__RE_TEMPO_CANVAS_SHADER__.select(null));
    await s.page.keyboard.press("Escape");
    await sleep(2500);
    await kit.shot(s, ev("canvas-shader", "06-presets.png"));
    out.presetFrames = await s.page.evaluate(() => window.__RE_TEMPO_CANVAS_SHADER__.frames().map((f) => f.preset));
    await clearFrames(s);
    // 06/07: shader as a storyboard EFFECT
    await setView(s, 430, 100, 0.42);
    await sleep(600);
    await s.page.keyboard.press("Escape");
    out.rec2 = await kit.record(s, ev("canvas-shader", "04-shader-effect-on-storyboard"), async () => {
      await say(s, "A shader can also be an effect: select a storyboard");
      const sb = await item(s, "Storyboard1");
      await kit.click(s, Math.round(sb.x + 30), Math.round(sb.y - 9), { ms: 600 });
      await sleep(400);
      await selectOnly(s, ["Storyboard1"]);
      await openRightPanel(s);
      await say(s, "Design panel › Effects › + › Shader");
      await s.page.evaluate(() => { for (const n of document.querySelectorAll('[data-testid="canvas-shader-effects-section"]')) if (n.getBoundingClientRect().width) n.scrollIntoView({ block: "center" }); });
      await sleep(500);
      const add = await visibleRect(s, "[data-rtsh-fx-add]");
      out.fxAdd = add;
      if (add) { await kit.click(s, add.x + add.width / 2, add.y + add.height / 2, { ms: 600 }); await sleep(700); }
      const it = await visibleRect(s, '[data-rtsh-fx-kind="shader"]');
      if (it) { await kit.click(s, it.x + 40, it.y + it.height / 2, { ms: 400 }); }
      await sleep(1200);
      await say(s, "The shader animates over the storyboard (Overlay, screen blend)");
      await sleep(2200);
      await say(s, "Mode › Background: the shader moves under the content");
      try { await clickVisibleButton(s, "Background", { ms: 500 }); await sleep(2000); } catch (e) { out.bgErr = e.message; }
      try { await clickVisibleButton(s, "Overlay", { ms: 400 }); await sleep(1500); } catch (e) { out.ovErr = e.message; }
      await say(s, null);
    }, { gif: true });
    out.effects = await s.page.evaluate(() => window.__RE_TEMPO_CANVAS_SHADER__.effects().map((e) => ({ sb: e.storyboard, mode: e.mode, blend: e.blend, status: e.status })));
    await kit.moveTo(s, 700, 860, { ms: 50 });
    await kit.shot(s, ev("canvas-shader", "07-storyboard-shader-effect.png"), { clip: await contentClip(s) });
    out.fxRemoved = await clearEffects(s);
    await s.page.keyboard.press("Escape");
    await closeRightSidebar(s);
    return out;
  },
};

// =================================================================== 26. canvas-paste
// Paste WITHOUT the system clipboard: the renderer gets a fake navigator.clipboard.read
// (this page only) that returns a PNG generated here, and receives a synthetic paste
// event with a DataTransfer holding the same PNG (File). Nothing is written to the clipboard.
export async function stubClipboardImage(s, label = "Pasted image") {
  return s.page.evaluate(async (label) => {
    const c = document.createElement("canvas");
    c.width = 480; c.height = 300;
    const g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 480, 300);
    gr.addColorStop(0, "#f97316"); gr.addColorStop(1, "#8b5cf6");
    g.fillStyle = gr; g.fillRect(0, 0, 480, 300);
    g.fillStyle = "rgba(255,255,255,.92)"; g.font = "600 34px -apple-system, system-ui, sans-serif";
    g.fillText(label, 32, 160);
    g.font = "500 20px -apple-system, system-ui, sans-serif"; g.fillText("Test PNG (QA)", 32, 200);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    window.__qaPasteBlob = blob;
    const item = new ClipboardItem({ "image/png": blob });
    const clip = navigator.clipboard;
    if (!window.__qaClipOrig) window.__qaClipOrig = { read: clip.read, readText: clip.readText };
    Object.defineProperty(clip, "read", { configurable: true, writable: true, value: async () => [item] });
    Object.defineProperty(clip, "readText", { configurable: true, writable: true, value: async () => "" });
    return blob.size;
  }, label);
}
export async function syntheticPaste(s) {
  return s.page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([window.__qaPasteBlob], "image.png", { type: "image/png" }));
    const e = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true, composed: true });
    (document.activeElement || document.body).dispatchEvent(e);
    const P = window.__RE_TEMPO_CANVAS_PASTE__;
    return { prevented: e.defaultPrevented, decision: P ? P.lastDecision : null, count: P ? P.count : null };
  });
}

const BASE_ITEMS = ["CarHome", "DogHome", "KittiesApp", "Storyboard1", "Storyboard2"];
async function handleCall(s, fn, arg) {
  return s.page.evaluate(([src, arg]) => {
    const root = [...document.querySelectorAll("[data-canvas-root]")].find((n) => n.getBoundingClientRect().width > 100);
    const k = Object.keys(root).find((x) => x.startsWith("__reactFiber$"));
    let h = null;
    for (let f = root[k], d = 0; f && d < 600 && !h; d++, f = f.return) {
      for (const r of [f.ref, f.memoizedProps && f.memoizedProps.ref]) if (r && typeof r === "object" && r.current && typeof r.current.getView === "function") { h = r.current; break; }
    }
    return (0, eval)(src)(h, root.getBoundingClientRect(), arg);
  }, [fn.toString(), arg]);
}
export const selectOnly = (s, ids) => handleCall(s, (h, R, ids) => h.setSelection(ids), ids);
const worldOf = (s, p) => handleCall(s, (h, R, p) => { const v = h.getView(); return { x: (p.x - R.left - v.x) / v.zoom, y: (p.y - R.top - v.y) / v.zoom }; }, p);
const screenOf = (s, w) => handleCall(s, (h, R, w) => { const v = h.getView(); return { x: R.left + v.x + w.x * v.zoom, y: R.top + v.y + w.y * v.zoom }; }, w);
// Deletes the storyboards created by the test pastes from the working canvas.
export async function deletePasted(s) {
  const extra = (await items(s)).map((i) => i.id).filter((id) => !BASE_ITEMS.includes(id));
  if (!extra.length) return [];
  await handleCall(s, (h, R, ids) => h.setSelection(ids), extra);
  await s.page.mouse.move(1000, 700);
  await sleep(200);
  await s.page.keyboard.press("Backspace");
  await sleep(2000);
  return extra;
}

const PASTE_AT = { x: 1010, y: 600 };
const PASTE_AT2 = { x: 1090, y: 400 };
export const canvasPaste = {
  dir: "canvas-paste",
  async before(s) {
    await prep(s);
    const out = { deleted: await deletePasted(s) };
    await s.page.mouse.click(PASTE_AT.x, PASTE_AT.y);
    await sleep(300);
    await stubClipboardImage(s, "Pasted image");
    const wP = await worldOf(s, PASTE_AT);
    out.rec = await kit.record(s, ev("canvas-paste", "04-original-paste-lands-far"), async () => {
      await say(s, "Original Tempo: pointer here, ⌘V with a copied image");
      await kit.moveTo(s, PASTE_AT.x, PASTE_AT.y, { ms: 600 });
      await sleep(1200);
      await say(s, "⌘V … nothing shows up near the pointer");
      out.paste = await syntheticPaste(s);
      await sleep(2200);
      await say(s, "The image lands far away, right of every storyboard");
      await s.page.keyboard.press("Shift+Digit1");
      await sleep(1200);
      const nw = (await items(s)).filter((i) => !BASE_ITEMS.includes(i.id));
      out.newItems = nw.map((i) => i.id);
      const ps = await screenOf(s, wP);
      await kit.moveTo(s, Math.round(ps.x), Math.round(ps.y), { ms: 400 });
      if (nw[0]) await kit.highlight(s, nw[0]);
      await sleep(2600);
      await say(s, null);
    });
    await kit.shot(s, ev("canvas-paste", "01-before.png"), { keepOverlay: true });
    await kit.clean(s);
    out.deleted2 = await deletePasted(s);
    return out;
  },
  async after(s) {
    await prep(s);
    const out = { deleted: await deletePasted(s) };
    await s.page.mouse.click(PASTE_AT.x, PASTE_AT.y);
    await sleep(300);
    await stubClipboardImage(s, "Pasted image");
    out.rec = await kit.record(s, ev("canvas-paste", "03-paste-at-pointer"), async () => {
      await say(s, "With the mod: point where the image should go, ⌘V");
      await kit.moveTo(s, PASTE_AT.x, PASTE_AT.y, { ms: 600 });
      await sleep(1100);
      await say(s, "⌘V: the image's top-left corner lands at the pointer");
      out.paste1 = await syntheticPaste(s);
      await sleep(2300);
      await say(s, "Somewhere else, same thing: it lands at the pointer");
      await kit.moveTo(s, PASTE_AT2.x, PASTE_AT2.y, { ms: 700 });
      await sleep(700);
      out.paste2 = await syntheticPaste(s);
      await sleep(2400);
      await say(s, null);
    });
    out.newItems = (await items(s)).filter((i) => !BASE_ITEMS.includes(i.id)).map((i) => ({ id: i.id, x: Math.round(i.x), y: Math.round(i.y) }));
    await deletePasted(s);
    // 02: a single paste, with the pointer visible
    await s.page.mouse.click(PASTE_AT.x, PASTE_AT.y);
    await sleep(300);
    await stubClipboardImage(s, "Pasted image");
    out.paste3 = await syntheticPaste(s);
    await sleep(2500);
    await kit.overlay(s); await kit.cursor(s, true); await s.page.evaluate(([x, y]) => window.__rtq.at(x, y), [PASTE_AT.x, PASTE_AT.y]);
    await kit.shot(s, ev("canvas-paste", "02-after.png"), { keepOverlay: true });
    await kit.clean(s);
    out.deleted2 = await deletePasted(s);
    return out;
  },
};

// Clip without the chats sidebar (in the original Tempo it lists the user's real chat
// titles): from the left edge of the center panel to the right edge of the window.
export async function contentClip(s) {
  const r = await s.page.evaluate(() => { const n = [...document.querySelectorAll('[data-testid="center-panel"]')].find((x) => x.getBoundingClientRect().width > 300); if (!n) return null; const b = n.getBoundingClientRect(); return { x: b.x, y: 0, width: window.innerWidth - b.x, height: window.innerHeight }; });
  return r || { x: 0, y: 0, width: s.width, height: s.height };
}
// =================================================================== 6. canvas-quick
const PILL = '[role="toolbar"][aria-label="Canvas page"]';
const ADD = '[data-testid="center-panel-add-tab-button"]';
const OPEN_ITEM = '[data-testid="new-tab-action-open"]';
export async function gotoWorkspace(s, canvas = CANVAS) {
  await s.page.evaluate(() => document.querySelector("[data-testid=workspace-navbar-chat-button]")?.click());
  await sleep(2000);
  const sel = `[role=tab][data-testid^="canvas-tab-"][data-testid$="/${canvas}"]`;
  let r = await kit.rectOf(s, sel);
  if (!r) {
    const other = await kit.rectOf(s, `[role=tab][data-testid^="canvas-tab-"]`);
    if (other) { await s.page.mouse.click(other.x + other.width / 2, other.y + other.height / 2); await sleep(2000); if (await pillSwitchTo(s, canvas)) r = await kit.rectOf(s, sel); }
  }
  if (!r) {
    const it = await s.page.evaluate(async (name) => { const q = window.__RE_TEMPO_CANVAS_QUICK__; if (!q) return false; const d = await q.load(); const it = d.items.find((i) => i.canvasName === name); if (it) await q.open(it); return !!it; }, canvas);
    await sleep(4000);
    r = await kit.rectOf(s, sel);
  }
  if (r) await s.page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  await sleep(1500);
  for (let i = 0; i < 30; i++) { // wait for the storyboards to render
    const n = await s.page.evaluate(() => [...document.querySelectorAll("[data-canvas-item-id] iframe")].filter((f) => f.getBoundingClientRect().width > 0).length);
    if (n >= 3) break;
    await sleep(500);
  }
  await sleep(1000);
  await fit(s);
  return !!r;
}
async function railShot(s, file) {
  await s.page.keyboard.down("Control"); // the app shows the hints after 1.5 s with Ctrl held
  await sleep(1900);
  const r = await kit.rectOf(s, '[data-testid="workspace-navbar"]');
  let res = null;
  if (r && r.width) res = await kit.shot(s, file, { clip: { x: Math.max(0, r.x - 4), y: Math.max(0, r.y - 4), width: r.width + 8, height: Math.min(r.height + 8, 420) }, scale: 2 });
  await s.page.keyboard.up("Control");
  return { rail: r, res };
}
async function railOrder(s) {
  return s.page.evaluate(() => {
    const rail = document.querySelector('[data-testid="workspace-navbar"]');
    if (!rail) return null;
    return [...rail.querySelectorAll('[data-testid^="workspace-navbar-"][data-testid$="-button"]')].map((b) => ({ id: b.dataset.testid.replace("workspace-navbar-", "").replace("-button", ""), y: Math.round(b.getBoundingClientRect().y) })).filter((x) => x.y > 0).sort((a, b) => a.y - b.y).map((x) => x.id);
  });
}
const pillName = (s) => s.page.evaluate((sel) => { const p = [...document.querySelectorAll(sel)].find((x) => x.getBoundingClientRect().width); return p ? p.textContent.trim() : null; }, PILL);
// Switches this tab's canvas through the pill (not recorded), to restart the take.
export async function pillSwitchTo(s, name) {
  if ((await pillName(s)) === name) return true;
  const p = await kit.rectOf(s, PILL);
  if (!p) return false;
  await s.page.mouse.click(p.x + 40, p.y + p.height / 2);
  await sleep(1200);
  const row = await s.page.evaluate((name) => { const n = [...document.querySelectorAll(".rcq-switch [data-testid^=rcq-switch]")].find((x) => x.textContent.trim().startsWith(name)); if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.x + 70, y: r.y + r.height / 2 }; }, name);
  if (row) { await s.page.mouse.move(row.x, row.y, { steps: 4 }); await sleep(300); await s.page.mouse.down(); await s.page.mouse.up(); }
  for (let i = 0; i < 15 && (await pillName(s)) !== name; i++) await sleep(300);
  await sleep(1500);
  return (await pillName(s)) === name;
}
export const canvasQuick = {
  dir: "canvas-quick",
  async before(s) {
    const out = { ws: await gotoWorkspace(s) };
    await closeRightSidebar(s);
    const a = await kit.rectOf(s, ADD);
    await kit.click(s, a.x + a.width / 2, a.y + a.height / 2);
    await sleep(900);
    const o = await kit.rectOf(s, OPEN_ITEM);
    out.open = o;
    if (o) { await kit.moveTo(s, o.x + o.width / 2, o.y + o.height / 2); await sleep(1300); }
    out.submenu = await s.page.evaluate(() => !!document.querySelector(".rcq-sub"));
    await kit.shot(s, ev("canvas-quick", "01-before.png"), { keepOverlay: true, clip: await contentClip(s) });
    await s.page.keyboard.press("Escape");
    await sleep(500);
    await kit.clean(s);
    const p = await kit.rectOf(s, PILL);
    out.pill = p;
    if (p) await kit.shot(s, ev("canvas-quick", "06-pill-original.png"), { clip: { x: p.x - 10, y: p.y - 10, width: Math.max(p.width + 20, 260), height: p.height + 20 }, scale: 2 });
    out.railOrder = await railOrder(s);
    out.railShot = await railShot(s, ev("canvas-quick", "07-rail-original-order.png"));
    return out;
  },
  async after(s) {
    const out = { ws: await gotoWorkspace(s) };
    await closeRightSidebar(s);
    // 02: original "+" menu (right-click, since the new-page mod takes the plain click) + "Open ›"
    const a = await kit.rectOf(s, ADD);
    await kit.moveTo(s, a.x + a.width / 2, a.y + a.height / 2, { ms: 100 });
    await s.page.mouse.click(a.x + a.width / 2, a.y + a.height / 2, { button: "right" });
    await sleep(900);
    let o = await kit.rectOf(s, OPEN_ITEM);
    await kit.moveTo(s, o.x + o.width / 2, o.y + o.height / 2);
    await sleep(1500);
    out.sub = await s.page.evaluate(() => [...document.querySelectorAll(".rcq-sub *")].filter((n) => n.children.length === 0).map((n) => n.textContent.trim()).filter(Boolean));
    await kit.shot(s, ev("canvas-quick", "02-after.png"), { keepOverlay: true, clip: await contentClip(s) });
    await s.page.keyboard.press("Escape");
    await sleep(300);
    await s.page.keyboard.press("Escape");
    await sleep(400);
    await kit.clean(s);
    // 04: switcher in the "Canvas page" pill
    let p = await kit.rectOf(s, PILL);
    await s.page.mouse.click(p.x + 40, p.y + p.height / 2);
    await sleep(1200);
    const m = await s.page.evaluate(() => { const n = document.querySelector(".rcq-switch"); if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, rows: [...n.querySelectorAll("[data-testid^=rcq-switch]")].map((x) => x.textContent.trim()) }; });
    out.switcher = m;
    if (m) await kit.shot(s, ev("canvas-quick", "05-pill-switcher-menu.png"), { clip: { x: p.x - 10, y: p.y - 10, width: Math.max(m.width, p.width) + 40, height: m.y + m.height - p.y + 30 }, scale: 2 });
    await s.page.keyboard.press("Escape");
    await sleep(500);
    // 03: recording (opening from the submenu sometimes misses; check the pill and redo the take)
    for (let attempt = 0; attempt < 3 && !out.rec; attempt++) {
     await s.page.keyboard.press("Escape");
     out.reset = await pillSwitchTo(s, CANVAS);
     try {
     out.rec = await kit.record(s, ev("canvas-quick", "03-open-recent-submenu"), async () => {
      await say(s, "\"+\" menu (right-click +): hover Open ›");
      const a2 = await kit.rectOf(s, ADD);
      await kit.moveTo(s, a2.x + a2.width / 2, a2.y + a2.height / 2, { ms: 600 });
      await s.page.evaluate(([x, y]) => window.__rtq && window.__rtq.ripple(x, y), [a2.x + a2.width / 2, a2.y + a2.height / 2]);
      await s.page.mouse.click(a2.x + a2.width / 2, a2.y + a2.height / 2, { button: "right" });
      await sleep(900);
      const o2 = await kit.rectOf(s, OPEN_ITEM);
      await kit.moveTo(s, o2.x + o2.width / 2, o2.y + o2.height / 2, { ms: 600 });
      await sleep(1300);
      await say(s, "Recent canvases right in the submenu, no modal");
      const findIt = () => s.page.evaluate((name) => { const n = [...document.querySelectorAll(".rcq-sub [data-testid=rcq-sub-item]")].find((x) => x.textContent.trim().startsWith(name)); if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, CANVAS2);
      for (let k = 0; k < 3; k++) {
        let it = await findIt();
        if (!it) { await kit.moveTo(s, o2.x + o2.width / 2, o2.y + o2.height / 2, { ms: 300 }); await sleep(1000); it = await findIt(); }
        if (!it) continue;
        // to the edge of the "Open" item and ONE step into the submenu: mouseleave/mouseenter
        // in the same dispatch (with the screencast on, short steps overrun the 300 ms timer)
        await glide(s, o2.x + o2.width - 6, o2.y + o2.height / 2, { steps: 6 });
        await glide(s, it.x + 24, o2.y + o2.height / 2, { steps: 1, stepMs: 60 });
        it = await findIt();
        if (!it) continue;
        await glide(s, it.x + 60, it.y + it.height / 2, { steps: 8 });
        await sleep(500);
        it = await findIt();
        if (!it) continue;
        out.subItem = it;
        await s.page.evaluate(() => { window.__RE_TEMPO_CANVAS_QUICK__.state.openedVia = null; });
        await kit.click(s, it.x + 60, it.y + it.height / 2, { ms: 60 });
        // The submenu re-renders when the local list changes (dev server HMR); if the
        // click landed mid-re-render, the row's own handler is dispatched on the DOM.
        for (let i = 0; i < 8 && !(await s.page.evaluate(() => window.__RE_TEMPO_CANVAS_QUICK__.state.openedVia)); i++) await sleep(100);
        if (!(await s.page.evaluate(() => window.__RE_TEMPO_CANVAS_QUICK__.state.openedVia))) {
          out.subFallback = await s.page.evaluate((name) => { const n = [...document.querySelectorAll(".rcq-sub [data-testid=rcq-sub-item]")].find((x) => x.textContent.trim().startsWith(name)); if (!n) return false; n.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })); return true; }, CANVAS2);
        }
        break;
      }
      for (let i = 0; i < 12 && (await pillName(s)) !== CANVAS2; i++) await sleep(250);
      if ((await pillName(s)) !== CANVAS2) throw new Error("submenu did not open the canvas");
      await say(s, "The recent canvas opens in this tab");
      await sleep(2200);
      await say(s, null);
    });
     } catch (e) { out.recErr = (out.recErr || []).concat(e.message); await kit.caption(s, null); }
    }
    // 04: pill switcher (switches this tab's canvas back)
    for (let attempt = 0; attempt < 3 && !out.rec2; attempt++) {
     await s.page.keyboard.press("Escape");
     out.reset2 = await pillSwitchTo(s, CANVAS2);
     try {
     out.rec2 = await kit.record(s, ev("canvas-quick", "04-switch-canvas-pill"), async () => {
      await say(s, "Canvas pill: click the name to switch canvas in this tab");
      const p2 = await kit.rectOf(s, PILL);
      await kit.click(s, p2.x + 40, p2.y + p2.height / 2, { ms: 700 });
      await sleep(1700);
      await say(s, "Open tabs and recent canvases of this project, in one list");
      const row = await s.page.evaluate((name) => { const n = [...document.querySelectorAll(".rcq-switch [data-testid^=rcq-switch]")].find((x) => x.textContent.trim().startsWith(name)); if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, CANVAS);
      out.row = row;
      if (row) { await kit.moveTo(s, row.x + 70, row.y + row.height / 2, { ms: 700 }); await sleep(700); await kit.click(s); }
      for (let i = 0; i < 12 && (await pillName(s)) !== CANVAS; i++) await sleep(250);
      if ((await pillName(s)) !== CANVAS) throw new Error("pill did not switch the canvas");
      await say(s, "Same tab, same slot: now showing the other canvas");
      await sleep(2200);
      await say(s, null);
    });
     } catch (e) { out.recErr2 = (out.recErr2 || []).concat(e.message); await kit.caption(s, null); }
    }
    out.tabs = await s.page.evaluate(() => [...document.querySelectorAll("[role=tab][data-testid^=canvas-tab-]")].map((n) => n.textContent.trim()));
    return out;
  },
  // Rail with project-sidebar off (it hides the rail): Design second and Ctrl+N in visual order.
  async rail(s) {
    await kit.setSkip(s, "project-sidebar");
    await sleep(1500);
    const out = { order: await railOrder(s) };
    out.shot = await railShot(s, ev("canvas-quick", "08-rail-design-second.png"));
    await kit.setSkip(s, "");
    return out;
  },
};

// =================================================================== 14. zoom
// Menu shortcuts (⌘= / ⌘− / ⌘0) do not reach the app over CDP. The NATIVE zoom is changed in
// main (the QA instance's Node inspector) with the same call the View › Zoom
// In/Out/Actual Size menu items make: webContents.setZoomLevel(level ± 0.5) / 0.
export async function nativeZoom(s, delta) {
  const expr = delta === 0 ? "0" : `w.getZoomLevel() + (${delta})`;
  return mainEval(s, `(() => { const { BrowserWindow } = process.mainModule.require("electron"); const win = BrowserWindow.getAllWindows().find((b) => !b.isDestroyed() && b.webContents.getURL().includes("/renderer/index.html")); const w = win.webContents; w.setZoomLevel(${expr}); return w.getZoomFactor(); })()`);
}
export const zoom = {
  dir: "zoom",
  async before(s) {
    await prep(s);
    const f = await nativeZoom(s, 0.5);
    await sleep(500);
    const toast = await s.page.evaluate(() => !!document.querySelector(".rtz-toast[data-show]"));
    await kit.shot(s, ev("zoom", "01-before.png"));
    await nativeZoom(s, 0);
    await sleep(800);
    return { f, toast };
  },
  async after(s) {
    await prep(s);
    const out = {};
    out.f = await nativeZoom(s, 0.5);
    await sleep(350);
    out.toast = await s.page.evaluate(() => document.querySelector(".rtz-toast[data-show]")?.textContent || null);
    await kit.shot(s, ev("zoom", "02-after.png"));
    // rectangle in CSS px of the zoomed page; the screenshot clip is in window px (× factor)
    const t = await s.page.evaluate(() => { const n = document.querySelector(".rtz-toast"); const r = n.getBoundingClientRect(); const z = window.canvasApi.getHostZoomFactor(); return { x: r.x * z, y: r.y * z, width: r.width * z * (parseFloat(n.style.zoom) || 1), height: r.height * z * (parseFloat(n.style.zoom) || 1) }; });
    await kit.shot(s, ev("zoom", "04-zoom-toast.png"), { clip: { x: t.x - 200, y: t.y - 80, width: 200 + t.width + 16, height: 80 + t.height + 16 }, scale: 2 });
    await nativeZoom(s, 0);
    await sleep(1600);
    const steps = [];
    out.rec = await kit.record(s, ev("zoom", "03-zoom-in-out"), async () => {
      await say(s, "View › Zoom In (⌘ =): the whole app scales, a toast shows the level");
      await sleep(900);
      steps.push(await nativeZoom(s, 0.5));
      await sleep(1500);
      steps.push(await nativeZoom(s, 0.5));
      await sleep(1700);
      await say(s, "View › Zoom Out (⌘ −)");
      steps.push(await nativeZoom(s, -0.5));
      await sleep(1500);
      steps.push(await nativeZoom(s, -0.5));
      await sleep(1500);
      steps.push(await nativeZoom(s, -0.5));
      await sleep(1700);
      await say(s, "View › Actual Size (⌘ 0): back to 100%");
      steps.push(await nativeZoom(s, 0));
      await sleep(2000);
      await say(s, null);
    });
    out.steps = steps.map((z) => Math.round(z * 100) + "%");
    await nativeZoom(s, 0);
    return out;
  },
};

// =================================================================== 16. canvas-autosetup
// SAFETY: this account has no project without canvases, so the primary variant
// ("Set up canvases", the only one where the mod acts) never shows; the "mango" workspace shows
// the secondary one ("This branch needs canvas setup"). To show the mod acting WITHOUT spending AI:
//   - auto-send off (re-tempo:canvas-autosetup-send = "0") and kill switch on
//     until the interception is in place;
//   - a click listener (capture, window) swallows the click on the app's button: the app's
//     onSetup does not run, no chat is created, nothing is sent;
//   - hasProjectCanvases=false is forced in the fiber props (what the mod reads) = simulated.
const MANGO = process.env.RT_WS_MANGO || "00000000-0000-0000-0000-000000000001"; // set RT_* env vars to the capture profile's ids
const AS_OFF = "re-tempo:canvas-autosetup-off", AS_SEND = "re-tempo:canvas-autosetup-send";
export async function lockAutosetup(s) {
  return s.page.evaluate(([off, send]) => { localStorage.setItem(off, "1"); localStorage.setItem(send, "0"); return [localStorage.getItem(off), localStorage.getItem(send)]; }, [AS_OFF, AS_SEND]);
}
async function selectWorkspace(s, name) {
  await s.page.evaluate(() => document.querySelector("[data-testid=workspace-navbar-chat-button]")?.click());
  await sleep(1500);
  const r = await s.page.evaluate((name) => {
    for (const n of document.querySelectorAll("body *")) {
      if (n.children.length || n.textContent.trim() !== name) continue;
      const b = n.getBoundingClientRect();
      if (b.width && b.x < 260 && b.y > 90) return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }
    return null;
  }, name);
  if (r) await s.page.mouse.click(r.x, r.y);
  await sleep(2000);
  return !!r;
}
async function designHome(s) {
  await s.page.evaluate(() => document.querySelector("[data-testid=workspace-navbar-design-button]")?.click());
  await sleep(2500);
  const h = await s.page.evaluate(() => { const t = [...document.querySelectorAll("[role=tab]")].find((n) => n.textContent.trim() === "Home" && n.getBoundingClientRect().width); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (h) await s.page.mouse.click(h.x, h.y);
  await sleep(2500);
  return s.page.evaluate(() => document.querySelector('[data-testid="design-homepage-no-canvas-config"]')?.innerText || null);
}
// Clip without the sidebar (with mango selected it lists real chat titles).
async function sideClip(s) {
  const x = await s.page.evaluate(() => {
    const sb = [...document.querySelectorAll('[data-testid="workspace-sidebar"]')].find((n) => n.getBoundingClientRect().width > 50);
    if (sb) return Math.ceil(sb.getBoundingClientRect().right);
    const t = [...document.querySelectorAll("[role=tab]")].find((n) => n.textContent.trim() === "Home" && n.getBoundingClientRect().width);
    if (t) { const tl = t.closest("[role=tablist]") || t.parentElement; return Math.max(0, Math.floor(tl.getBoundingClientRect().x - 6)); }
    return 0;
  });
  return { x, y: 0, width: s.width - x, height: s.height };
}
export const canvasAutosetup = {
  dir: "canvas-autosetup",
  // Original Tempo: the real empty state of the mango workspace.
  async before(s) {
    const out = {}; // the mango workspace is already selected (main() selects it with the mods locked)
    out.text = await designHome(s);
    await kit.shot(s, ev("canvas-autosetup", "01-before.png"), { clip: await sideClip(s) });
    return out;
  },
  async after(s) {
    const out = { lock: await lockAutosetup(s) };
    await kit.setSkip(s, ""); // ensures mods on + lock already written
    out.selected = await selectWorkspace(s, "mango");
    out.text = await designHome(s);
    // 04: with the mod ON in the real (secondary) variant: it does not act (by design).
    await s.page.evaluate((off) => localStorage.removeItem(off), AS_OFF);
    await s.page.evaluate(() => window.__RE_TEMPO_CANVAS_AUTOSETUP__.setAutoSend(false));
    await s.page.evaluate(() => window.__RE_TEMPO_CANVAS_AUTOSETUP__.setEnabled(true));
    await sleep(2500);
    out.real = await s.page.evaluate(() => ({ status: window.__RE_TEMPO_CANVAS_AUTOSETUP__.state.status, reason: window.__RE_TEMPO_CANVAS_AUTOSETUP__.state.reason, toast: !!document.querySelector(".rcas-toast") }));
    const homeClip = await sideClip(s);
    out.homeClip = homeClip;
    await kit.shot(s, ev("canvas-autosetup", "04-real-variant-no-action.png"), { clip: homeClip });
    await s.page.evaluate(() => window.__RE_TEMPO_CANVAS_AUTOSETUP__.setEnabled(false));
    // simulation: interceptor + forced primary variant; starts on mango's Chat route,
    // in the "New Chat" tab (the terminal tab shows the machine prompt)
    await s.page.evaluate(() => document.querySelector("[data-testid=workspace-navbar-chat-button]")?.click());
    await sleep(2000);
    const nc = await s.page.evaluate(() => { const t = [...document.querySelectorAll("[role=tab]")].find((n) => n.textContent.trim() === "New Chat" && n.getBoundingClientRect().width); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    if (nc) { await s.page.mouse.click(nc.x, nc.y); await sleep(1500); }
    await s.page.evaluate(() => {
      window.__qaAS = { blocked: 0 };
      window.addEventListener("click", (e) => {
        const b = e.target && e.target.closest && e.target.closest('[data-testid="start-canvas-setup-button"]');
        if (b) { e.stopImmediatePropagation(); e.preventDefault(); window.__qaAS.blocked++; }
      }, true);
      window.__qaAS.timer = setInterval(() => {
        const root = document.querySelector('[data-testid="design-homepage-no-canvas-config"]');
        if (!root) return;
        const k = Object.keys(root).find((x) => x.startsWith("__reactFiber$"));
        for (let f = root[k], d = 0; f && d < 6; d++, f = f.return) {
          const p = f.memoizedProps;
          if (p && typeof p.onSetup === "function") { if (p.hasProjectCanvases !== false) p.hasProjectCanvases = false; break; }
        }
      }, 25);
    });
    await s.page.evaluate((id) => { window.__RE_TEMPO_CANVAS_AUTOSETUP__.reset(id); window.__RE_TEMPO_CANVAS_AUTOSETUP__.setEnabled(true); }, MANGO);
    await sleep(500);
    const recClip = homeClip.x > 0 ? homeClip : await sideClip(s);
    out.rec = await kit.record(s, ev("canvas-autosetup", "03-auto-start-setup"), async () => {
      await say(s, "A workspace without canvas setup: opening Design");
      await sleep(1500);
      await s.page.evaluate(() => document.querySelector("[data-testid=workspace-navbar-design-button]")?.click());
      await sleep(700);
      const home = await s.page.evaluate(() => { if (document.querySelector('[data-testid="design-homepage-no-canvas-config"]')) return null; const t = [...document.querySelectorAll("[role=tab]")].find((n) => n.textContent.trim() === "Home" && n.getBoundingClientRect().width); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      if (home) await kit.click(s, home.x, home.y, { ms: 500 });
      await say(s, "With the mod: after ~1 s it presses the setup button itself (once per workspace)");
      await sleep(1800);
      const tr = await kit.rectOf(s, ".rcas-toast");
      if (tr) await kit.moveTo(s, tr.x + tr.width / 2, tr.y + tr.height / 2, { ms: 700 }); // hover pauses the toast
      await sleep(900);
      await say(s, "SIMULATED: variant forced, click intercepted. No chat opened, nothing sent");
      await sleep(3200);
      await say(s, null);
    }, { clip: recClip });
    out.sim = await s.page.evaluate(() => ({ blocked: window.__qaAS.blocked, state: JSON.parse(JSON.stringify(window.__RE_TEMPO_CANVAS_AUTOSETUP__.state)), toast: document.querySelector(".rcas-toast")?.innerText || null }));
    // 02: empty state + mod toast (the toast hides after 6 s; hover to pause it)
    const t = await kit.rectOf(s, ".rcas-toast");
    await kit.shot(s, ev("canvas-autosetup", "02-after.png"), { clip: await sideClip(s) });
    if (t) await kit.shot(s, ev("canvas-autosetup", "05-setup-toast.png"), { clip: { x: t.x - 12, y: t.y - 12, width: t.width + 24, height: t.height + 24 }, scale: 2 });
    // cleanup: mango guard, interceptor, keys back to the original
    out.cleanup = await s.page.evaluate(([id, off, send]) => {
      clearInterval(window.__qaAS.timer);
      const removed = window.__RE_TEMPO_CANVAS_AUTOSETUP__.reset(id);
      window.__RE_TEMPO_CANVAS_AUTOSETUP__.setEnabled(false);
      return { removed, guards: window.__RE_TEMPO_CANVAS_AUTOSETUP__.guards() };
    }, [MANGO, AS_OFF, AS_SEND]);
    out.tabs = await s.page.evaluate(() => [...document.querySelectorAll("[role=tab]")].map((n) => n.textContent.trim()).filter(Boolean));
    return out;
  },
};

// =================================================================== tabs (run setup)
// Tabs of the legacy canvases (old names, deleted from the clone) are closed and the
// working canvas is opened in both routes (workspace and Design). Clone UI only.
async function openFromSubmenu(s, name) {
  const a = await kit.rectOf(s, ADD);
  if (!a) return false;
  await s.page.mouse.click(a.x + a.width / 2, a.y + a.height / 2, { button: "right" });
  await sleep(900);
  const o = await kit.rectOf(s, OPEN_ITEM);
  if (!o) return false;
  await s.page.mouse.move(o.x + o.width / 2, o.y + o.height / 2, { steps: 3 });
  await sleep(1400);
  const it = await s.page.evaluate((name) => { const n = [...document.querySelectorAll(".rcq-sub [data-testid=rcq-sub-item]")].find((x) => x.textContent.trim().startsWith(name)); if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.x + 60, y: r.y + r.height / 2 }; }, name);
  if (!it) { await s.page.keyboard.press("Escape"); return false; }
  await s.page.mouse.move(o.x + o.width - 6, o.y + o.height / 2);
  await s.page.mouse.move(it.x - 30, o.y + o.height / 2);
  await s.page.mouse.move(it.x, it.y, { steps: 3 });
  await sleep(300);
  await s.page.mouse.down(); await s.page.mouse.up();
  await sleep(4000);
  return true;
}
export async function prepareTabs(s) {
  const out = {};
  await kit.setSkip(s, "");
  await s.page.evaluate(() => document.querySelector("[data-testid=workspace-navbar-chat-button]")?.click());
  await sleep(2000);
  const has = await kit.rectOf(s, `[role=tab][data-testid^="canvas-tab-"][data-testid$="/${CANVAS}"]`);
  out.openedWs = has ? "already" : await openFromSubmenu(s, CANVAS);
  await s.page.evaluate(() => document.querySelector("[data-testid=workspace-navbar-design-button]")?.click());
  await sleep(2500);
  out.design = await gotoCanvas(s);
  out.tabs = await s.page.evaluate(() => [...document.querySelectorAll("[role=tab]")].filter((n) => n.getBoundingClientRect().width).map((n) => n.textContent.trim()));
  return out;
}

// =================================================================== index.json (English)
const INDEX = {
  "canvas-quick": {
    title: "Quick canvas access",
    summary: "Opening a canvas no longer needs the Open modal. In the \"+\" menu, hovering \"Open ›\" lists the recent canvases and \"Search all…\". The canvas name pill at the top left is now a switcher that shows another canvas in the same tab. In the left rail, Design moves to second place and Ctrl+1…5 follow that order.",
    shortcut: "Hover \"+\" › Open ›",
    files: [
      ["01-before.png", "Original Tempo: the \"+\" menu has Open, with no submenu"],
      ["02-after.png", "With the mod: hovering Open › lists recent canvases and Search all…"],
      ["03-open-recent-submenu.gif", "Opening a recent canvas straight from the Open › submenu"],
      ["03-open-recent-submenu.mp4", "Opening a recent canvas straight from the Open › submenu (MP4)"],
      ["04-switch-canvas-pill.gif", "Switching the canvas of this tab from the name pill"],
      ["04-switch-canvas-pill.mp4", "Switching the canvas of this tab from the name pill (MP4)"],
      ["05-pill-switcher-menu.png", "The canvas switcher opened from the name pill"],
      ["06-pill-original.png", "Original Tempo: the pill shows only the canvas name"],
      ["07-rail-original-order.png", "Original rail with Ctrl held: Chat 1, Docs 2, Design 3"],
      ["08-rail-design-second.png", "With the mod, Ctrl held: Chat 1, Design 2, Docs 3"],
    ],
    simulatedData: "Test canvases \"QA-changelog-screens\" and \"QA-changelog-images\" exist only in the cloned profile. The rail shot runs with the project-sidebar mod off, because it hides the rail. The original \"+\" menu opens with a right-click, since the new-page mod takes the plain click.",
  },
  "canvas-keys": {
    title: "Single-key canvas shortcuts",
    summary: "The design canvas gets the Figma-style single keys the app was missing. C turns on the Comment tool and Shift+0 zooms to 100%. \"?\" opens a sheet with every canvas shortcut, built-in and new. Keys the app already owns are left alone.",
    shortcut: "? · C · Shift+0",
    files: [
      ["01-before.png", "Original Tempo: pressing ? on the canvas does nothing"],
      ["02-after.png", "With the mod: ? opens the Canvas shortcuts sheet"],
      ["03-single-key-shortcuts.gif", "?, Esc, C (Comment tool) and Shift+0 (zoom to 100%)"],
      ["03-single-key-shortcuts.mp4", "?, Esc, C (Comment tool) and Shift+0 (zoom to 100%) (MP4)"],
      ["04-shortcut-sheet.png", "The shortcut sheet up close"],
      ["05-key-c-comment-tool.png", "Key C: the Comment button turns on in the toolbar"],
    ],
    simulatedData: null,
  },
  "canvas-snap": {
    title: "Alt measurements between storyboards",
    summary: "With a storyboard selected, holding Alt/Option over another storyboard shows the exact distance between them, as thin red lines with red labels in canvas pixels. Over empty canvas it shows the distance to the nearest storyboard on each side. Everything disappears when Alt is released. Snapping itself stays the app's own.",
    shortcut: "Hold Alt/Option",
    files: [
      ["01-before.png", "Original Tempo: Alt held over another storyboard, no measurement"],
      ["02-after.png", "With the mod: a red 465 px label between the two storyboards"],
      ["03-alt-measure.gif", "Select a storyboard, hold Alt and hover: measurements appear and vanish on release"],
      ["03-alt-measure.mp4", "Select a storyboard, hold Alt and hover: measurements appear and vanish on release (MP4)"],
      ["04-alt-hover-storyboard-below.png", "Alt over the storyboard below: vertical gap and edge offsets"],
      ["05-alt-empty-canvas.png", "Alt over empty canvas: distance to the nearest storyboard on each side"],
    ],
    simulatedData: "The storyboard is selected with a drag selection: a plain click also selects its root element, and then the mod stays quiet on purpose (the app measures elements itself).",
  },
  "canvas-browser": {
    title: "Browser frame on the canvas",
    summary: "The canvas gets a Browser frame: a live web page with its own address bar, placed next to the storyboards. It pans and zooms with the canvas, moves by its title, resizes from its corners and is saved with the canvas. It shares the session of the app's Browser tab.",
    shortcut: "W (Browser tool)",
    files: [
      ["01-before.png", "Original Tempo: the canvas has no browser frame"],
      ["02-after.png", "With the mod: example.com loaded in a frame on the canvas"],
      ["03-draw-browser-frame.gif", "Browser tool, draw a frame, type an address: the page loads live"],
      ["03-draw-browser-frame.mp4", "Browser tool, draw a frame, type an address: the page loads live (MP4)"],
      ["04-move-resize-frame.gif", "Move the frame by its title, resize it from a corner, zoom out"],
      ["04-move-resize-frame.mp4", "Move the frame by its title, resize it from a corner, zoom out (MP4)"],
      ["05-toolbar-original.png", "Original canvas toolbar, without the Browser tool"],
      ["06-toolbar-browser-tool.png", "Canvas toolbar with the Browser tool (globe)"],
    ],
    simulatedData: "The page is https://example.com. In the offscreen capture window the page content sometimes shows shifted inside a freshly drawn frame until it is resized.",
  },
  "canvas-shader": {
    title: "WebGL shader on the canvas",
    summary: "The canvas gets a Shader frame: an animated WebGL shader next to the storyboards, with a side panel for preset, speed, controls generated from the GLSL code, a live GLSL editor and PNG/WebM/embed export. A shader can also be an effect of a storyboard, over its content (Overlay, with a blend mode) or under it (Background).",
    shortcut: "Right-click \"+\" › Shader on Canvas",
    files: [
      ["01-before.png", "Original Tempo: the \"+\" menu has no Shader on Canvas"],
      ["02-after.png", "With the mod: an animated shader frame and its side panel"],
      ["03-add-shader-frame.gif", "Add a shader from the \"+\" menu, pick a preset, drag a control, open the GLSL editor"],
      ["03-add-shader-frame.mp4", "Add a shader from the \"+\" menu, pick a preset, drag a control, open the GLSL editor (MP4)"],
      ["04-shader-effect-on-storyboard.gif", "A shader as a storyboard effect: Overlay, then Background"],
      ["04-shader-effect-on-storyboard.mp4", "A shader as a storyboard effect: Overlay, then Background (MP4)"],
      ["05-glsl-editor.png", "Live GLSL editor with the Compiled log"],
      ["06-presets.png", "Six presets side by side"],
      ["07-storyboard-shader-effect.png", "A storyboard with a shader effect and the effect panel"],
      ["08-panel-original-no-shader-effects.png", "Original Tempo: the storyboard Design panel without shader effects"],
    ],
    simulatedData: "The native menu of the Preset field does not show in CDP captures: the pointer clicks the field and the value changes as a user pick would (change event).",
  },
  zoom: {
    title: "Zoom level toast",
    summary: "When the app's native zoom changes (View › Zoom In, Zoom Out, Actual Size), a small toast in the bottom-right corner shows the new level, such as 110%, for about a second. The zoom itself is still the app's own.",
    shortcut: "⌘ = · ⌘ − · ⌘ 0",
    files: [
      ["01-before.png", "Original Tempo: zoomed to 110% with no feedback"],
      ["02-after.png", "With the mod: a 110% toast in the bottom-right corner"],
      ["03-zoom-in-out.gif", "Zoom In, Zoom Out and Actual Size, with the toast showing each level"],
      ["03-zoom-in-out.mp4", "Zoom In, Zoom Out and Actual Size, with the toast showing each level (MP4)"],
      ["04-zoom-toast.png", "The zoom toast up close"],
    ],
    simulatedData: "Menu shortcuts do not reach the app over CDP, so the native zoom was changed from the test instance's main process (webContents.setZoomLevel ± 0.5, the same call as the View menu items). The toast reacts to the real zoom.",
  },
  "canvas-autosetup": {
    title: "Automatic canvas setup",
    summary: "When the Design home shows the \"Set up canvases\" empty state, the mod presses the setup button by itself after about a second, once per workspace, and shows a toast that explains why a chat opened. By default it also presses Send in that new chat, which starts an agent run. On the \"This branch needs canvas setup\" variant it does nothing.",
    shortcut: null,
    files: [
      ["01-before.png", "Original Tempo: the canvas setup empty state on the Design home"],
      ["02-after.png", "With the mod (simulated): the \"Setting up canvases automatically…\" toast"],
      ["03-auto-start-setup.gif", "Opening Design: the mod presses setup by itself (simulated, no chat, no AI)"],
      ["03-auto-start-setup.mp4", "Opening Design: the mod presses setup by itself (simulated, no chat, no AI) (MP4)"],
      ["04-real-variant-no-action.png", "Mod on, real \"This branch needs canvas setup\" variant: no action, by design"],
      ["05-setup-toast.png", "The mod's toast up close"],
    ],
    simulatedData: "This account has no project without canvases, so the \"Set up canvases\" variant (the only one where the mod acts) never shows. On a workspace without canvas setup, the variant was forced in the renderer (hasProjectCanvases=false in the props the mod reads), auto-send stayed off and the click on the app's button was intercepted: no chat opened and nothing was sent. The auto-send step was not captured, since it would start a real agent run.",
  },
  "canvas-paste": {
    title: "Paste images at the pointer",
    summary: "Pasting an image on the canvas (⌘V) now puts its top-left corner exactly at the mouse pointer. In the original Tempo the image lands far away, to the right of every storyboard. The mod uses the same path as the canvas menu's Paste here; text, Tempo elements, Figma and links keep the normal paste.",
    shortcut: "⌘V",
    files: [
      ["01-before.png", "Original Tempo: the pointer was mid-canvas; the pasted image (highlighted) went to the far right"],
      ["02-after.png", "With the mod: the image lands with its corner at the pointer"],
      ["03-paste-at-pointer.gif", "With the mod: two pastes, each at the pointer"],
      ["03-paste-at-pointer.mp4", "With the mod: two pastes, each at the pointer (MP4)"],
      ["04-original-paste-lands-far.gif", "Original Tempo: ⌘V shows nothing near the pointer; the image appears far away"],
      ["04-original-paste-lands-far.mp4", "Original Tempo: ⌘V shows nothing near the pointer; the image appears far away (MP4)"],
    ],
    simulatedData: "The image is a test PNG drawn in the page. The system clipboard was not used: navigator.clipboard.read was replaced in this page only and a synthetic paste event with a DataTransfer carried the same PNG. Pasted images were deleted from the test canvas afterwards.",
  },
};
export function writeIndexes(list) {
  const out = {};
  for (const n of list) {
    const d = INDEX[n];
    try { out[n] = kit.writeIndex(n, { title: d.title, summary: d.summary, shortcut: d.shortcut, login: true, files: d.files.map(([file, caption]) => ({ file, caption })), notCaptured: null, simulatedData: d.simulatedData }); } catch (e) { out[n] = "ERR " + e.message; }
  }
  return out;
}

// =================================================================== runner
// node changelog/canvas.mjs [canvas-quick canvas-keys canvas-snap canvas-browser canvas-shader zoom canvas-autosetup canvas-paste]
// BEFORE phase (setSkip "*") for every requested mod, then the AFTER phase (setSkip "").
const MODS = {
  "canvas-quick": canvasQuick, "canvas-keys": canvasKeys, "canvas-snap": canvasSnap, "canvas-browser": canvasBrowser,
  "canvas-shader": canvasShader, zoom, "canvas-autosetup": canvasAutosetup, "canvas-paste": canvasPaste,
};
export async function main(names) {
  // canvas-autosetup changes the selected workspace (mango): it runs last in both phases.
  const list = (names.length ? names : Object.keys(MODS)).slice().sort((a, b) => (a === "canvas-autosetup") - (b === "canvas-autosetup"));
  ensureCanvas();
  const s = await openSession();
  const log = {};
  try {
    await lockAutosetup(s); // auto-send off + kill switch before any screen with mods
    log.tabs = await prepareTabs(s).catch((e) => "ERR " + e.message);
    for (const phase of ["before", "after"]) {
      for (const n of list) {
        log[n] = log[n] || {};
        try {
          if (n === "canvas-autosetup" && phase === "before") {
            await kit.setSkip(s, ""); // the original does not list mango in the sidebar: select it with the mods on (locked)
            await selectWorkspace(s, "mango");
          }
          await kit.setSkip(s, phase === "before" ? "*" : "");
          log[n][phase] = await MODS[n][phase](s);
          if (n === "canvas-quick" && phase === "after") log[n].rail = await canvasQuick.rail(s);
        } catch (e) { log[n][phase] = "ERR " + e.message; }
        if (n === "canvas-autosetup" && phase === "before") { await kit.setSkip(s, ""); await selectWorkspace(s, "main").catch(() => {}); }
      }
    }
    await kit.setSkip(s, "");
    await selectWorkspace(s, "main").catch(() => {}); // back to the clone's original workspace (seed-tracker/main)
    try { await gotoWorkspace(s); await clearFrames(s); await deletePasted(s); await clearEffects(s); } catch {}
    await nativeZoom(s, 0).catch(() => {});
    await s.page.evaluate((off) => { localStorage.removeItem(off); }, AS_OFF).catch(() => {}); // auto-send stays "0" (kit lock)
  } finally {
    await kit.close(s);
  }
  for (const n of list) for (const [f] of INDEX[n].files) {
    if (!/\.(gif|mp4)$/.test(f)) continue;
    const p = path.join(REPO, "evidence", MODS[n].dir, f);
    if (fs.existsSync(p)) (log[n].probe ||= {})[f] = kit.probe(p);
  }
  try { log.index = writeIndexes(list); } catch (e) { log.index = "ERR " + e.message; }
  return log;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((log) => { console.log(JSON.stringify(log, null, 1)); process.exit(0); }, (e) => { console.error(e); process.exit(1); });
}
