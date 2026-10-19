// qa/changelog/chat-config.mjs — visual changelog, chat-config group (profile qa-2).
// -----------------------------------------------------------------------------
// Mods: agent-runs-panel, home-title, voice-input, usage-bar, effort-levels,
//       profile-page, decision-model, bg-tasks.
// Generates evidence/<mod>/01-before.png, 02-after.png, 03-<action>.{gif,mp4}, extras 04-… and index.json
// (names, captions and simulated texts in English; see brief-v3).
//
//   cd qa && node changelog/chat-config.mjs            # everything (before + after + rail)
//   cd qa && node changelog/chat-config.mjs after      # a single phase (before|after|rail)
//
// Rules followed: cloned profile, nothing sent in chat, no microphone (dictation by
// replaying synthetic partial results), no key/test on TypeSafe, background tasks
// simulated in the renderer store (BU.applyEvent), chat model/effort
// restored at the end, selected workspace restored at the end.
// -----------------------------------------------------------------------------
import fs from "node:fs";
import os from "node:os";
import * as kit from "./kit.mjs";

const { sleep } = kit;
const OUT = (mod, f) => `evidence/${mod}/${f}`;
const LOG = "/tmp/tempo-qa/cap-chat/log.json";
const results = {};
const note = (k, v) => { results[k] = v; };

// Chat with history (not archived) used for composer/bg-tasks; initial workspace.
// Ids of the capture profile's workspaces and chats: set the RT_* env vars (the defaults are placeholders).
const CHAT = { ws: process.env.RT_WS_BUTIA || "ws-00000000-00001", tab: process.env.RT_CHAT_BUTIA_HISTORY || "00000000-0000-0000-0000-000000000005" };
// Existing empty chat (mango, no session): English-only background for effort-levels.
const EMPTY_CHAT = { ws: process.env.RT_WS_MANGO || "00000000-0000-0000-0000-000000000001", tab: process.env.RT_CHAT_MANGO_EMPTY || "00000000-0000-0000-0000-000000000006" };
const START_WS = process.env.RT_WS_MAIN || "ws-00000000-00000";
const MODEL_ORIG = "opus-5.5-1m";
const MODEL_X = "opus-5-1m";

// Clean PNG: hides caption/highlight/cursor and waits for the caption fade (.18 s)
async function snap(s, out, opts) {
  await kit.clean(s);
  await sleep(300);
  return kit.shot(s, out, opts);
}

// ---------------------------------------------------------------- app store
// getState of the workspaces zustand store (found in the hook deps, like pane-dock).
async function ws(s) {
  await s.page.evaluate(() => {
    if (window.__CAPCHAT_WS_GET__) return;
    const rootEl = document.getElementById("root");
    let rf = null;
    for (const k in rootEl) if (k.startsWith("__reactContainer$")) rf = rootEl[k];
    const stack = [rf];
    let n = 0;
    while (stack.length && n < 300000) {
      const f = stack.pop(); n++;
      let h = f && f.memoizedState, i = 0;
      while (h && typeof h === "object" && "next" in h && i++ < 100) {
        const ms = h.memoizedState;
        if (Array.isArray(ms) && ms.length === 2 && Array.isArray(ms[1]) && ms[1].length === 4 &&
            typeof ms[1][0] === "function" && Array.isArray(ms[0]) && typeof ms[0][0] === "function") {
          const gs = ms[1][0];
          if (gs.toString().length < 40) {
            try {
              const st = gs();
              if (st && typeof st.selectWorkspace === "function" && typeof st.switchToWorkspace === "function") { window.__CAPCHAT_WS_GET__ = gs; return; }
            } catch {}
          }
        }
        h = h.next;
      }
      if (f && f.sibling) stack.push(f.sibling);
      if (f && f.child) stack.push(f.child);
    }
  });
  const ok = await s.page.evaluate(() => !!window.__CAPCHAT_WS_GET__);
  if (!ok) throw new Error("workspaces store not found");
}

async function goHome(s) {
  await ws(s);
  await s.page.evaluate(() => window.__CAPCHAT_WS_GET__().selectWorkspace(null));
  await kit.waitFor(s, () => { const w = document.querySelector('[data-testid="workspaces-welcome"]'); return !!w && w.getBoundingClientRect().width > 0; });
  await sleep(900);
}

async function openChat(s) {
  await ws(s);
  await s.page.evaluate(([w, t]) => window.__CAPCHAT_WS_GET__().selectWorkspaceChat(w, t), [CHAT.ws, CHAT.tab]);
  await kit.waitFor(s, () => [...document.querySelectorAll(".chat-view")].some((v) => v.getBoundingClientRect().width > 0 && v.getAttribute("data-chat-session-id")), { timeoutMs: 20000 });
  await sleep(1500);
}

async function openEmptyChat(s) {
  await ws(s);
  await s.page.evaluate(([w, t]) => window.__CAPCHAT_WS_GET__().selectWorkspaceChat(w, t), [EMPTY_CHAT.ws, EMPTY_CHAT.tab]);
  await kit.waitFor(s, (id) => { const v = document.querySelector(`[data-testid="chat-view-${id}"]`); return !!v && v.getBoundingClientRect().width > 0 && !!v.querySelector('[data-testid="chat-input-model-selector"]'); }, { arg: EMPTY_CHAT.tab, timeoutMs: 20000 });
  await sleep(1500);
}

// Virtuoso undoes programmatic scrollTop; the mouse wheel sticks.
async function chatBottom(s) {
  await s.page.mouse.move(850, 400);
  for (let i = 0; i < 4; i++) { await s.page.mouse.wheel(0, 2500); await sleep(250); }
  await sleep(500);
}

async function restoreWs(s) {
  await ws(s);
  await s.page.evaluate((id) => window.__CAPCHAT_WS_GET__().selectWorkspace(id), START_WS);
  await sleep(800);
}

// ---------------------------------------------------------------- simulated tasks
// processTaskEvent of the pill hook (BU.applyEvent) found in React's memo cache.
async function bgInstall(s) {
  const r = await s.page.evaluate(() => {
    const view = [...document.querySelectorAll(".chat-view")].find((v) => v.getBoundingClientRect().width > 0);
    const key = view && view.getAttribute("data-chat-session-id");
    const rootEl = document.getElementById("root");
    let rf = null;
    for (const k in rootEl) if (k.startsWith("__reactContainer$")) rf = rootEl[k];
    const stack = [rf];
    let n = 0, hit = null;
    while (stack.length && n < 400000 && !hit) {
      const f = stack.pop(); n++;
      const mc = f && f.updateQueue && f.updateQueue.memoCache;
      if (mc && Array.isArray(mc.data)) {
        for (const arr of mc.data) {
          if (Array.isArray(arr) && arr.length >= 8 && arr[4] === key && typeof arr[5] === "function" && typeof arr[7] === "function") {
            const s5 = arr[5].toString();
            if (s5.includes("applyEvent(") && s5.length < 60) { hit = { apply: arr[5], clear: arr[7] }; break; }
          }
        }
      }
      if (f && f.sibling) stack.push(f.sibling);
      if (f && f.child) stack.push(f.child);
    }
    window.__CAPCHAT_BG__ = hit ? { key, v: 1000, ...hit } : null;
    return { key, ok: !!hit };
  });
  if (!r.ok) throw new Error("tasks hook not found");
  return r;
}
const bgEvt = (s, task) => s.page.evaluate((t) => {
  const B = window.__CAPCHAT_BG__;
  B.v = Math.max(B.v + 1, Date.now()); // always-increasing version (the store rejects an old version)
  B.apply({ type: "task_status", task: { source: "qa-sim", ...t }, version: B.v });
}, task);
const bgClear = (s) => s.page.evaluate(() => window.__CAPCHAT_BG__ && window.__CAPCHAT_BG__.clear());

const TASKS = (now) => [
  { id: "qa-sim-1", type: "local_bash", status: "running", description: "Run the test suite (npm test)", command: "npm test", startedAt: now - 14000 },
  { id: "qa-sim-2", type: "local_agent", status: "running", description: "Review the component diff", prompt: "Review the diff", startedAt: now - 6000 },
  { id: "qa-sim-3", type: "local_bash", status: "running", description: "Build for production (vite build)", command: "vite build", startedAt: now - 2000 },
];

// ---------------------------------------------------------------- composer / settings
async function composerRect(s) {
  return s.page.evaluate(() => {
    const sel = [...document.querySelectorAll('[data-testid="chat-input-model-selector"]')].find((n) => n.getBoundingClientRect().width > 0);
    let n = sel; // climbs up to the box that contains the editor and the bar (the whole composer)
    while (n && !(n.getBoundingClientRect().width >= 600 && n.querySelector('[data-testid="chat-input-textarea"]'))) n = n.parentElement;
    const r = n.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}
// rectangle of the popup (menu) that contains the first visible item of `sel`, merged with the composer
async function menuClip(s, sel, pad = 12) {
  const r = await s.page.evaluate((q) => {
    const o = [...document.querySelectorAll(q)].find((n) => n.getBoundingClientRect().width > 0);
    if (!o) return null;
    let p = o;
    while (p && !/^(menu|listbox|dialog)$/.test(p.getAttribute("role") || "")) p = p.parentElement;
    const b = (p || o).getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }, sel);
  const c = await composerRect(s);
  if (!r) return { x: c.x - pad, y: c.y - pad, width: c.width + 2 * pad, height: c.height + 2 * pad };
  const x0 = Math.min(r.x, c.x) - pad, y0 = Math.min(r.y, c.y) - pad;
  const x1 = Math.max(r.x + r.width, c.x + c.width) + pad, y1 = Math.max(r.y + r.height, c.y + c.height) + pad;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
const visible = (s, sel) => s.page.evaluate((q) => [...document.querySelectorAll(q)].some((n) => n.getBoundingClientRect().width > 0), sel);
async function clickVisible(s, sel) {
  const r = await s.page.evaluate((q) => {
    const n = [...document.querySelectorAll(q)].find((x) => x.getBoundingClientRect().width > 0);
    if (!n) return null;
    const b = n.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }, sel);
  if (!r) throw new Error(`not visible: ${sel}`);
  await kit.click(s, r.x + r.width / 2, r.y + r.height / 2);
  return r;
}
async function pickModel(s, id) {
  const cur = await s.page.evaluate(() => window.__RE_TEMPO_EFFORT__ ? window.__RE_TEMPO_EFFORT__.state().pickers.find(Boolean)?.model : null);
  await clickVisible(s, '[data-testid="chat-input-model-selector"]');
  await sleep(700);
  await clickVisible(s, `[data-testid="chat-input-model-option-${id}"]`);
  await sleep(600);
  return cur;
}
async function pickEffort(s, id) {
  await clickVisible(s, '[data-testid="chat-input-effort-selector"]');
  await sleep(600);
  await clickVisible(s, `[data-testid="chat-input-effort-option-${id}"]`);
  await sleep(500);
}
const effortLabel = (s) => s.page.evaluate(() => [...document.querySelectorAll('[data-testid="chat-input-effort-selector"]')].find((n) => n.getBoundingClientRect().width > 0)?.getAttribute("aria-label"));
const modelLabel = (s) => s.page.evaluate(() => [...document.querySelectorAll('[data-testid="chat-input-model-selector"]')].find((n) => n.getBoundingClientRect().width > 0)?.innerText);

// caption inside the video crop (the default sits at the top of the window, outside the clip)
async function capAt(s, clip) {
  await kit.overlay(s);
  await s.page.evaluate((c) => {
    const el = document.getElementById("rtq-caption");
    if (!c) {
      document.documentElement.style.removeProperty("--rtq-cap-top");
      if (el) { el.style.left = ""; el.style.maxWidth = ""; }
      return;
    }
    document.documentElement.style.setProperty("--rtq-cap-top", c.y + 12 + "px");
    if (el) { el.style.left = c.x + c.width / 2 + "px"; el.style.maxWidth = c.width - 32 + "px"; }
  }, clip || null);
}
async function clearComposer(s) {
  await s.page.evaluate(() => { const ed = [...document.querySelectorAll('[data-testid="chat-input-textarea"]')].find((e) => e.offsetParent); if (ed && ed.editor) ed.editor.commands.clearContent(true); });
  await sleep(400);
}
const hasText = (s, t) => s.page.evaluate((x) => (document.body.innerText || "").includes(x), t);
async function openSettings(s) {
  if (await hasText(s, "Return to app")) return;
  if (await visible(s, '[data-testid="workspace-navbar"]')) { // original Tempo: button in the rail
    await clickVisible(s, 'button[aria-label="Settings"]');
  } else { // with rail-menu: the gear opens a menu -> "Settings…"
    await clickVisible(s, 'button[aria-label="Settings"]');
    await sleep(500);
    await kit.clickText(s, "Settings…", { selector: "[role=menuitem]" });
  }
  await kit.waitFor(s, () => (document.body.innerText || "").includes("Return to app"));
  await sleep(900);
}
async function leaveSettings(s) {
  if (await hasText(s, "Return to app")) { await kit.clickText(s, "Return to app"); await sleep(900); }
}
const rectText = (s, sel, txt) => s.page.evaluate(([q, t]) => {
  const n = [...document.querySelectorAll(q)].find((x) => x.getBoundingClientRect().width > 0 && (x.innerText || "").trim() === t);
  if (!n) return null;
  const b = n.getBoundingClientRect();
  return { x: b.x, y: b.y, width: b.width, height: b.height };
}, [sel, txt]);
async function blur(s) {
  await s.page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
}
async function wheelAt(s, x, y, dy, steps = 6, ms = 120) {
  await kit.moveTo(s, x, y, { ms: 250 });
  for (let i = 0; i < steps; i++) { await s.page.mouse.wheel(0, dy / steps); await sleep(ms); }
}

// Cropped PNG: scales up to 2x without exceeding 1200 px of width
async function snapClip(s, out, clip) {
  const scale = Math.max(1, Math.min(2, kit.OUT_WIDTH / clip.width));
  return snap(s, out, { clip, scale });
}
const SEL_H1 = '[data-testid="workspaces-welcome"] h1';
const h1Clip = (s) => s.page.evaluate((q) => { const b = document.querySelector(q).getBoundingClientRect(); return { x: b.x - 40, y: b.y - 40, width: b.width + 80, height: b.height + 80 }; }, SEL_H1);
const mainRect = (s) => s.page.evaluate(() => { const v = [...document.querySelectorAll(".chat-view")].find((x) => x.getBoundingClientRect().width > 0).getBoundingClientRect(); return { x: v.x, width: v.width }; });
// bg-tasks crop: only the block strip + composer (y from composer.top - 300).
async function bgClip(s) {
  const m = await mainRect(s);
  const c = await composerRect(s);
  const y = Math.round(c.y - 300);
  return { x: Math.ceil(m.x), y, width: Math.floor(Math.min(m.width, 1440 - Math.ceil(m.x))) - 2, height: Math.min(900, Math.round(c.y + c.height + 16)) - y };
}
// Capture mask (like the kit's caption/cursor, pointer-events:none): covers, inside the crop,
// the chat history above the tasks block (or the composer, with no block), following the layout.
async function mask(s, clip) {
  await s.page.evaluate((c) => {
    const old = window.__capMask;
    if (old) { clearInterval(old.timer); old.el.remove(); window.__capMask = null; }
    if (!c) return;
    const el = document.createElement("div");
    el.id = "cap-mask";
    const view = [...document.querySelectorAll(".chat-view")].find((v) => v.getBoundingClientRect().width > 0);
    let bg = "", n = view && view.querySelector(".message-list");
    while (n && !bg) { const b = getComputedStyle(n).backgroundColor; if (b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent") bg = b; n = n.parentElement; }
    Object.assign(el.style, { position: "fixed", left: c.x - 4 + "px", top: c.y - 6 + "px", width: c.width + 8 + "px", height: "0px", background: bg || "#111", zIndex: "2147483600", pointerEvents: "none" });
    document.documentElement.appendChild(el);
    const anchorTop = () => {
      const b = [...document.querySelectorAll('[data-testid="re-tempo-bg-tasks"]')].find((x) => x.getBoundingClientRect().height > 0);
      if (b) return b.getBoundingClientRect().top;
      const sel = [...document.querySelectorAll('[data-testid="chat-input-model-selector"]')].find((x) => x.getBoundingClientRect().width > 0);
      let k = sel;
      while (k && !(k.getBoundingClientRect().width >= 600 && k.querySelector('[data-testid="chat-input-textarea"]'))) k = k.parentElement;
      return k ? k.getBoundingClientRect().top - 44 : c.y; // keeps the "CLI" chip above the composer
    };
    const tick = () => { el.style.height = Math.max(0, anchorTop() - 8 - c.y + 6) + "px"; }; // 6 px of slack above the crop (scale rounding)
    tick();
    window.__capMask = { el, timer: setInterval(tick, 16) };
  }, clip || null);
}
const PREVIEW = { total: 37, byStatus: { done: 21, failed: 7, queued: 4, running: 3, cancelled: 2 }, activeCount: 7, avgDurationMs: 128000, totalCost: 4.82, costSamples: 30, agentsCount: 12 };
const EVENTS = [
  { t: 0, f: "", v: "I want" },
  { t: 700, f: "", v: "I want an export" },
  { t: 1500, f: "", v: "I want an export to CSV button" },
  { t: 2400, f: "", v: "I want an export to CSV button at the top" },
  { t: 3300, d: true, f: "I want an Export to CSV button at the top of the table." },
];
const replayVoice = (s) => s.page.evaluate((ev) => {
  const ed = [...document.querySelectorAll('[data-testid="chat-input-textarea"]')].find((e) => e.offsetParent);
  return window.__RE_TEMPO_VOICE__.replay(ev, ed.parentElement); // same root as the mod (findRoot)
}, EVENTS);

// ================================================================= BEFORE (original Tempo)
export async function before(s) {
  await kit.setSkip(s, "*");
  note("before.mods", (await kit.loadedMods(s) || []).length);

  // home: "Let's Cook." + footer without usage + ⌘⇧A does nothing
  await goHome(s);
  await snap(s, OUT("home-title", "01-before.png"));
  await snapClip(s, OUT("home-title", "04-title-before.png"), await h1Clip(s));
  await snapClip(s, OUT("usage-bar", "01-before.png"), { x: 0, y: 640, width: 340, height: 260 });
  await blur(s);
  await s.page.keyboard.press("Meta+Shift+A");
  await sleep(1500);
  note("before.agentRunsOpen", await visible(s, "[data-rar-root]"));
  await snap(s, OUT("agent-runs-panel", "01-before.png"));

  // chat: composer without mic; simulated tasks only in the native pill
  await openChat(s);
  await chatBottom(s);
  const c = await composerRect(s);
  await snapClip(s, OUT("voice-input", "01-before.png"), { x: c.x - 16, y: c.y - 16, width: c.width + 32, height: c.height + 32 });
  await beforeBg(s);
  await beforeEffort(s);

  // settings without Profile / RE-TEMPO / Dictation
  await openSettings(s);
  await snap(s, OUT("profile-page", "01-before.png"));
  fs.mkdirSync(kit.REPO + "/evidence/decision-model", { recursive: true });
  fs.copyFileSync(kit.REPO + "/evidence/profile-page/01-before.png", kit.REPO + "/evidence/decision-model/01-before.png");
  await leaveSettings(s);
}

// bg-tasks before: 3 tasks simulated only in the native pill (chat with history open, masked crop)
export async function beforeBg(s) {
  await openChat(s);
  await chatBottom(s);
  await bgInstall(s);
  for (const t of TASKS(Date.now())) await bgEvt(s, t);
  await sleep(1200);
  await chatBottom(s);
  const bclip = await bgClip(s);
  await mask(s, bclip);
  await sleep(200);
  await snapClip(s, OUT("bg-tasks", "01-before.png"), bclip);
  await mask(s, null);
  note("before.pill", await s.page.evaluate(() => ((document.body.innerText || "").match(/\d+ Tasks? Running/) || [null])[0]));
  await bgClear(s);
  await sleep(500);

}

// effort-levels before: empty chat (English-only background)
export async function beforeEffort(s) {
  // effort: Opus 5 without "Extra High"; model names with " 1M" (empty chat: English-only background)
  await openEmptyChat(s);
  const m0 = await modelLabel(s);
  await clickVisible(s, '[data-testid="chat-input-model-selector"]');
  await sleep(800);
  await snapClip(s, OUT("effort-levels", "05-model-names-before.png"), await menuClip(s, '[data-testid^="chat-input-model-option-"]'));
  await clickVisible(s, `[data-testid="chat-input-model-option-${MODEL_X}"]`);
  await sleep(700);
  await clickVisible(s, '[data-testid="chat-input-effort-selector"]');
  await sleep(800);
  note("before.effortItems", await s.page.evaluate(() => [...document.querySelectorAll('[data-testid^="chat-input-effort-option-"]')].map((n) => n.innerText)));
  await snapClip(s, OUT("effort-levels", "01-before.png"), await menuClip(s, '[data-testid^="chat-input-effort-option-"]'));
  await s.page.keyboard.press("Escape");
  await sleep(400);
  await pickModel(s, MODEL_ORIG);
  note("before.modelRestored", { before: m0, after: await modelLabel(s), effort: await effortLabel(s) });

}

// ================================================================= AFTER (with the mods)
export async function after(s) {
  await after1(s);
  await after2(s);
}

export async function after1(s) {
  await kit.setSkip(s, "");
  await s.page.evaluate((home) => localStorage.setItem("re-tempo.usage.home", home), os.homedir());
  await kit.reload(s);
  note("after.mods", (await kit.loadedMods(s) || []).length);
  await homeTitle(s);
  await usageBar(s);
  await agentRuns(s);
}

// ---------------- home-title
export async function homeTitle(s) {
  await goHome(s);
  await sleep(2500); // usage-bar reads the local files
  await snap(s, OUT("home-title", "02-after.png"));
  await snapClip(s, OUT("home-title", "05-title-after.png"), await h1Clip(s));
  note("home.title", await s.page.evaluate((q) => document.querySelector(q)?.innerText, SEL_H1));
  note("home-title.rec", await kit.record(s, OUT("home-title", "03-open-empty-chat"), async () => {
    await kit.caption(s, "Tempo home: the “Let's Cook.” title now reads “Let's do it”");
    await kit.highlight(s, SEL_H1);
    await sleep(2800);
    await kit.highlight(s, null);
    await kit.caption(s, "Opening a new, empty chat");
    const row = await rectText(s, "span", "New Chat");
    await kit.click(s, row.x + row.width / 2, row.y + row.height / 2, { ms: 700 });
    await kit.waitFor(s, () => [...document.querySelectorAll("h1")].some((h) => h.getBoundingClientRect().width > 0 && /Let's do it/.test(h.innerText)));
    await sleep(700);
    const h1 = await s.page.evaluate(() => { const h = [...document.querySelectorAll("h1")].find((x) => x.getBoundingClientRect().width > 0 && /Let's do it/.test(x.innerText)); const b = h.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
    await kit.caption(s, "The empty chat shows the same new title");
    await kit.highlight(s, h1);
    await sleep(2800);
    await kit.highlight(s, null);
    await kit.caption(s, null);
  }));
}

// ---------------- usage-bar (sidebar footer)
export async function usageBar(s) {
  const line = await s.page.evaluate(() => { const g = window.__RE_TEMPO_USAGE__.groups()[0]; const b = g.group.getBoundingClientRect(); return { place: g.place, x: b.x, y: b.y, width: b.width, height: b.height, label: g.group.querySelector("button")?.getAttribute("aria-label") }; });
  note("usage.line", line);
  await kit.moveTo(s, 800, 300);
  await sleep(600);
  await snapClip(s, OUT("usage-bar", "05-footer-line.png"), { x: 0, y: 840, width: 300, height: 60 });
  await kit.moveTo(s, line.x + 70, line.y + line.height / 2);
  await sleep(1200);
  await snapClip(s, OUT("usage-bar", "02-after.png"), { x: 0, y: 640, width: 340, height: 260 });
  await kit.moveTo(s, 800, 300);
  await sleep(800);
  const uclip = { x: 0, y: 300, width: 900, height: 600 };
  await capAt(s, uclip);
  note("usage-bar.rec", await kit.record(s, OUT("usage-bar", "03-open-usage-popover"), async () => {
    await kit.caption(s, "Sidebar footer: plan usage for Claude and Codex");
    await kit.highlight(s, line);
    await sleep(2300);
    await kit.highlight(s, null);
    await kit.caption(s, "Hover: each usage window with % used and time to reset");
    await kit.moveTo(s, line.x + 70, line.y + line.height / 2, { ms: 800 });
    await sleep(2800);
    await kit.caption(s, "Click to pin the panel open");
    await kit.click(s, line.x + 70, line.y + line.height / 2, { ms: 200 });
    await sleep(600);
    await kit.moveTo(s, 700, 420, { ms: 700 });
    await sleep(1500);
    await kit.caption(s, "Esc closes it");
    await s.page.keyboard.press("Escape");
    await sleep(1400);
    await kit.caption(s, null);
  }, { clip: uclip }));
  await capAt(s, null);
  await s.page.keyboard.press("Escape").catch(() => {});
}

// ---------------- agent-runs-panel (real data, read-only) + simulated preview
export async function agentRuns(s) {
  await goHome(s);
  await blur(s);
  await kit.click(s, 1300, 600); // neutral area (outside iframes/editors)
  await blur(s);
  note("agent-runs.rec", await kit.record(s, OUT("agent-runs-panel", "03-open-panel"), async () => {
    await kit.caption(s, "⌘⇧A opens the Agent Runs panel (real account data, read-only)");
    await sleep(900);
    await s.page.keyboard.press("Meta+Shift+A");
    await sleep(3800);
    await kit.caption(s, "Esc closes it");
    await sleep(800);
    await s.page.keyboard.press("Escape");
    await sleep(1100);
    await kit.caption(s, "⌘⇧A toggles it again");
    await s.page.keyboard.press("Meta+Shift+A");
    await sleep(2200);
    await s.page.keyboard.press("Meta+Shift+A");
    await sleep(700);
    await kit.caption(s, null);
  }));
  await s.page.keyboard.press("Meta+Shift+A");
  await kit.waitFor(s, () => !!window.__RE_TEMPO_AGENT_RUNS_LAST__ && !!document.querySelector("[data-rar-root] .rar-stats .rar-v"), { timeoutMs: 20000 }).catch(() => {});
  await sleep(1200);
  note("agent-runs.real", await s.page.evaluate(() => window.__RE_TEMPO_AGENT_RUNS_LAST__));
  await snap(s, OUT("agent-runs-panel", "02-after.png"));
  await s.page.keyboard.press("Escape");
  await sleep(400);
  await s.page.evaluate((p) => window.__RE_TEMPO_AGENT_RUNS_PREVIEW__(p), PREVIEW);
  await sleep(600);
  const pr = await kit.rectOf(s, "[data-rar-root] .rar-panel");
  await snapClip(s, OUT("agent-runs-panel", "04-preview-simulated.png"), { x: pr.x - 16, y: pr.y - 16, width: pr.width + 32, height: pr.height + 32 });
  await s.page.evaluate(() => window.__RE_TEMPO_AGENT_RUNS_CLOSE__());
}

// second half (chat + settings); can be re-run on its own
export async function after2(s) {
  await chatComposer(s);
  await bgTasks(s);
  await settingsMods(s);
}

// ---------------- chat: voice-input + effort-levels (reloads: clean state)
export async function chatComposer(s) {
  if ((await kit.loadedMods(s) || []).length === 0) await kit.setSkip(s, "");
  else await kit.reload(s);
  await openChat(s);
  await clearComposer(s);
  await chatBottom(s);
  let c = await composerRect(s);
  await kit.moveTo(s, 800, 300);
  await sleep(600);
  await snapClip(s, OUT("voice-input", "02-after.png"), { x: c.x - 16, y: c.y - 16, width: c.width + 32, height: c.height + 32 });
  await kit.hoverSel(s, "button.rtv-mic");
  await sleep(1300);
  await snapClip(s, OUT("voice-input", "05-mic-tooltip.png"), { x: c.x + c.width - 380, y: c.y - 30, width: 520, height: c.height + 46 });
  await kit.moveTo(s, 800, 300);
  await sleep(500);
  const vclip = { x: c.x - 40, y: c.y - 160, width: Math.min(c.width + 200, 1440 - (c.x - 40)), height: Math.min(c.height + 175, 900 - (c.y - 160)) };
  await capAt(s, vclip);
  note("voice-input.rec", await kit.record(s, OUT("voice-input", "03-dictate-in-composer"), async () => {
    await kit.caption(s, "New microphone button in the composer");
    await kit.hoverSel(s, "button.rtv-mic", { ms: 800 });
    await sleep(2200);
    await kit.caption(s, "Live dictation: words appear as you speak (simulated input)");
    const m = await kit.rectOf(s, "button.rtv-mic");
    await s.page.evaluate(([x, y]) => window.__rtq && window.__rtq.ripple(x, y), [m.x + m.width / 2, m.y + m.height / 2]);
    results["voice.replay"] = await replayVoice(s);
    await sleep(400);
    await kit.caption(s, "The text stays in the composer: nothing is sent");
    await sleep(2600);
    await kit.caption(s, null);
  }, { clip: vclip }));
  await capAt(s, null);
  note("voice.text", await s.page.evaluate(() => [...document.querySelectorAll('[data-testid="chat-input-textarea"]')].find((e) => e.offsetParent)?.innerText));
  await clearComposer(s);
  // mid-dictation still (outside the recording)
  await kit.moveTo(s, 800, 300);
  await sleep(500);
  const again = replayVoice(s);
  await sleep(2600);
  await snapClip(s, OUT("voice-input", "06-live-dictation.png"), { x: c.x - 16, y: c.y - 16, width: c.width + 32, height: c.height + 32 });
  await again;
  await sleep(500);
  await clearComposer(s);
  await blur(s);
  // Settings › Dictation (the mod's section). Note: the mic's right-click shortcut clicks the
  // first button[aria-label=Settings], which with rail-menu is the gear menu, so it is not used here.
  note("voice-input.rec2", await kit.record(s, OUT("voice-input", "04-open-dictation-settings"), async () => {
    await kit.caption(s, "Settings gets a new “Dictation” section");
    await openSettings(s);
    const it = await rectText(s, "button", "Dictation");
    if (it) await kit.highlight(s, { x: it.x, y: it.y, width: 222, height: it.height });
    await sleep(1400);
    await kit.highlight(s, null);
    await kit.clickText(s, "Dictation", { exact: true });
    await kit.waitFor(s, () => (document.body.innerText || "").includes("Test microphone"), { timeoutMs: 8000 });
    await sleep(900);
    await kit.caption(s, "Engine and language, all on-device (no cloud, no API key)");
    await kit.moveTo(s, 990, 157, { ms: 700 });
    await sleep(1400);
    await kit.moveTo(s, 968, 277, { ms: 600 });
    await sleep(1600);
    await kit.caption(s, null);
  }));
  await snap(s, OUT("voice-input", "07-settings-dictation.png"));
  await leaveSettings(s);

  await effortLevels(s);
}

// ---------------- effort-levels (empty chat)
export async function effortLevels(s) {
  // ---------------- effort-levels (empty chat: English-only background)
  await openEmptyChat(s);
  await blur(s);
  const c = await composerRect(s);
  const m0 = await modelLabel(s);
  await clickVisible(s, '[data-testid="chat-input-model-selector"]');
  await sleep(800);
  await snapClip(s, OUT("effort-levels", "04-model-names-after.png"), await menuClip(s, '[data-testid^="chat-input-model-option-"]'));
  await s.page.keyboard.press("Escape");
  await sleep(400);
  await kit.moveTo(s, 800, 300);
  const eclip = { x: Math.round(c.x - 40), y: 100, width: Math.round(c.width + 80), height: Math.round(c.y + c.height + 15) - 100 };
  await capAt(s, eclip);
  note("effort-levels.rec", await kit.record(s, OUT("effort-levels", "03-pick-extra-high"), async () => {
    await kit.caption(s, "Switch the model to Opus 5");
    await clickVisible(s, '[data-testid="chat-input-model-selector"]');
    await sleep(900);
    await clickVisible(s, `[data-testid="chat-input-model-option-${MODEL_X}"]`);
    await sleep(800);
    await kit.caption(s, "The Effort menu now has “Extra High”");
    await clickVisible(s, '[data-testid="chat-input-effort-selector"]');
    await sleep(900);
    const xr = await s.page.evaluate(() => { const n = document.querySelector('[data-testid="chat-input-effort-option-xhigh"]'); const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
    await kit.moveTo(s, xr.x + xr.width / 2, xr.y + xr.height / 2, { ms: 600 });
    await kit.highlight(s, xr);
    await sleep(1800);
    await kit.highlight(s, null);
    await kit.click(s, xr.x + xr.width / 2, xr.y + xr.height / 2);
    await sleep(900);
    await kit.caption(s, "Picked: the button shows “Extra High” (nothing is sent)");
    await sleep(2500);
    await kit.caption(s, null);
  }, { clip: eclip }));
  await capAt(s, null);
  note("effort.afterPick", { model: await modelLabel(s), effort: await effortLabel(s) });
  await clickVisible(s, '[data-testid="chat-input-effort-selector"]');
  await sleep(800);
  await snapClip(s, OUT("effort-levels", "02-after.png"), await menuClip(s, '[data-testid^="chat-input-effort-option-"]'));
  await s.page.keyboard.press("Escape");
  await sleep(400);
  // back to the original: High + Opus 5.5
  await pickEffort(s, "high");
  await pickModel(s, MODEL_ORIG);
  note("effort.restored", { before: m0, model: await modelLabel(s), effort: await effortLabel(s) });
}

// ---------------- chat: bg-tasks (simulated tasks); reload = clean state
export async function bgTasks(s) {
  const fresh = async () => {
    await kit.reload(s);
    await openChat(s);
    await blur(s);
    await chatBottom(s);
    await bgInstall(s);
    const clip = await bgClip(s);
    await mask(s, clip);
    return clip;
  };
  // stills
  let clipBg = await fresh();
  {
    const T = TASKS(Date.now());
    for (const t of T) await bgEvt(s, t);
    await sleep(1200);
    await chatBottom(s);
    await kit.moveTo(s, 1380, 300, { ms: 100 });
    await sleep(1200);
    note("bg.running", await s.page.evaluate(() => window.__RE_TEMPO_BG_TASKS__.state()));
    await snapClip(s, OUT("bg-tasks", "02-after.png"), clipBg);
    await bgEvt(s, { ...T[2], status: "completed", completedAt: Date.now() });
    await bgEvt(s, { ...T[0], status: "failed", completedAt: Date.now() });
    await sleep(700);
    await snapClip(s, OUT("bg-tasks", "05-one-failed.png"), clipBg);
    await bgEvt(s, { ...T[1], status: "completed", completedAt: Date.now() });
    await sleep(900);
    await snapClip(s, OUT("bg-tasks", "06-all-finished.png"), clipBg);
    await sleep(8600);
    await snapClip(s, OUT("bg-tasks", "07-folded-summary.png"), clipBg);
    note("bg.pngFinal", await s.page.evaluate(() => window.__RE_TEMPO_BG_TASKS__.state()));
    await bgClear(s);
  }
  // videos (another clean state): 03 run + finish, 04 fold + expand
  clipBg = await fresh();
  await kit.moveTo(s, 1380, 300);
  await capAt(s, clipBg);
  let lastEnd = 0;
  note("bg-tasks.rec", await kit.record(s, OUT("bg-tasks", "03-tasks-run-and-finish"), async () => {
    await kit.caption(s, "Background tasks show up at the end of the chat (simulated data)");
    const T = TASKS(Date.now());
    for (const t of T) { await bgEvt(s, t); await sleep(600); }
    await chatBottom(s);
    await kit.moveTo(s, 1380, 300, { ms: 200 });
    await sleep(1000);
    await kit.caption(s, "Each row: task type and live elapsed time");
    await sleep(1600);
    await kit.caption(s, "Finished: final icon and duration (one failed)");
    await bgEvt(s, { ...T[2], status: "completed", completedAt: Date.now() });
    await sleep(900);
    await bgEvt(s, { ...T[0], status: "failed", completedAt: Date.now() });
    await sleep(700);
    await bgEvt(s, { ...T[1], status: "completed", completedAt: Date.now() });
    lastEnd = Date.now();
    await sleep(1800);
    await kit.caption(s, null);
  }, { clip: clipBg }));
  // fold happens 8 s after each task ends; start 04 a bit before it
  await sleep(Math.max(0, lastEnd + 5200 - Date.now()));
  note("bg-tasks.rec2", await kit.record(s, OUT("bg-tasks", "04-fold-and-expand"), async () => {
    await kit.caption(s, "After 8 s, finished tasks fold into the header");
    await sleep(Math.max(0, lastEnd + 8600 - Date.now()));
    await sleep(1200);
    await kit.caption(s, "Click the header to show them again");
    await clickVisible(s, "[data-testid=re-tempo-bg-tasks] .rbt-head");
    await sleep(1800);
    await kit.moveTo(s, 1380, 300, { ms: 300 });
    await kit.caption(s, null);
  }, { clip: clipBg, leadMs: 200 }));
  await capAt(s, null);
  note("bg.final", await s.page.evaluate(() => window.__RE_TEMPO_BG_TASKS__.state()));
  await bgClear(s);
  await mask(s, null);
  await sleep(400);
}

// ---------------- settings: profile-page, decision-model
export async function settingsMods(s) {
  await kit.moveTo(s, 800, 300);
  note("profile-page.rec", await kit.record(s, OUT("profile-page", "03-open-profile"), async () => {
    await kit.caption(s, "Settings now has “Profile” at the top of Personal");
    await openSettings(s);
    const pit = await rectText(s, "button", "Profile");
    if (pit) await kit.highlight(s, { x: pit.x, y: pit.y, width: 222, height: pit.height });
    await sleep(2000);
    await kit.caption(s, "…and a “RE-TEMPO” group where other mods add their sections");
    const grp = await rectText(s, "span, div", "RE-TEMPO");
    if (grp) await kit.highlight(s, { x: grp.x - 6, y: grp.y - 4, width: 222, height: 54 });
    await sleep(2200);
    await kit.highlight(s, null);
    await kit.caption(s, "Profile: level, counts of your work and an activity map");
    await kit.clickText(s, "Profile", { exact: true });
    await sleep(2600);
    await kit.caption(s, "Read-only: everything counts real work, no points or ranking");
    await wheelAt(s, 900, 600, 1400, 10, 160);
    await sleep(2200);
    await wheelAt(s, 900, 600, -1400, 6, 80);
    await sleep(600);
    await kit.caption(s, null);
  }));
  await kit.clickText(s, "Profile", { exact: true });
  await sleep(1800);
  await snap(s, OUT("profile-page", "02-after.png"));
  await wheelAt(s, 900, 600, 900, 6, 100);
  await sleep(900);
  await snap(s, OUT("profile-page", "04-profile-bottom.png"));
  note("profile.text", (await kit.text(s)).match(/Level \d+[^\n]*/)?.[0]);

  note("decision-model.rec", await kit.record(s, OUT("decision-model", "03-open-decision-model"), async () => {
    await kit.caption(s, "Settings › Decision model: TypeSafe's Jev model for comment triage");
    await kit.clickText(s, "Decision model", { exact: true });
    await sleep(2600);
    await kit.caption(s, "No API key set: nothing is sent (connection not tested)");
    await wheelAt(s, 900, 600, 700, 6, 140);
    await sleep(1800);
    await kit.caption(s, "Confidence threshold, automations and the decision log");
    await wheelAt(s, 900, 600, 1600, 8, 140);
    await sleep(2500);
    await kit.caption(s, null);
  }));
  await kit.clickText(s, "Decision model", { exact: true });
  await sleep(1200);
  await wheelAt(s, 900, 500, -6000, 8, 60); // back to the top of the section
  await sleep(900);
  await snap(s, OUT("decision-model", "02-after.png"));
  await wheelAt(s, 900, 600, 5000, 10, 60);
  await sleep(900);
  await snap(s, OUT("decision-model", "04-empty-log.png"));
  note("decision.state", await s.page.evaluate(() => { const d = window.__RE_TEMPO_DECISION__; return { configured: d.configured(), hasKey: d.settings().hasKey, log: d.log().length }; }));
  await leaveSettings(s);
}

// ================================================================= RAIL (rings without the mod sidebar)
export async function rail(s) {
  await kit.setSkip(s, "project-sidebar");
  await sleep(3000);
  const g = await s.page.evaluate(() => window.__RE_TEMPO_USAGE__.groups().map((x) => { const b = x.group.getBoundingClientRect(); return { place: x.place, x: b.x, y: b.y, width: b.width, height: b.height }; }));
  note("rail.groups", g);
  const r = g.find((x) => x.place === "rail");
  if (!r) return;
  await kit.moveTo(s, 800, 300);
  await sleep(500);
  await snapClip(s, OUT("usage-bar", "06-rail-rings.png"), { x: 0, y: Math.max(0, r.y - 60), width: 120, height: 900 - Math.max(0, r.y - 60) });
  const rclip = { x: 0, y: 300, width: 900, height: 600 };
  await capAt(s, rclip);
  note("usage-bar.rec2", await kit.record(s, OUT("usage-bar", "04-rail-rings-popover"), async () => {
    await kit.caption(s, "Without the RE-TEMPO sidebar, usage shows as two rings in the rail");
    await kit.highlight(s, r);
    await sleep(2400);
    await kit.highlight(s, null);
    await kit.caption(s, "Hover the rings to open the same Usage panel");
    await kit.moveTo(s, r.x + r.width / 2, r.y + r.height / 2, { ms: 800 });
    await sleep(3000);
    await kit.moveTo(s, 700, 420, { ms: 700 });
    await sleep(1000);
    await kit.caption(s, null);
  }, { clip: rclip }));
  await capAt(s, null);
}

// ================================================================= cleanup
export async function cleanup(s) {
  await kit.setSkip(s, "");
  await leaveSettings(s).catch(() => {});
  await restoreWs(s).catch(() => {});
  await s.page.evaluate(() => localStorage.removeItem("re-tempo.usage.home"));
}

// ================================================================= index.json (English)
const SIM = "Simulated data";
export function writeIndexes(only = null) {
  const D = {
    "agent-runs-panel": {
      title: "Agent Runs panel (⌘⇧A)",
      summary: "A floating panel sums up the agent runs of your account: total, active now, average duration, total cost and a bar per status. It only reads data from the logged-in session and changes nothing. Original Tempo has no such summary.",
      simulatedData: "Only 04-preview-simulated.png: a synthetic summary (37 runs, 12 agents, $4.82) rendered by the mod's preview hook. 02 and the GIF show real account data.",
      shortcut: "⌘⇧A (Esc closes)",
      files: [
        ["01-before.png", "Before: in original Tempo, ⌘⇧A opens nothing on the home screen"],
        ["02-after.png", "After: the Agent Runs panel with the account's real numbers"],
        ["03-open-panel.gif", "⌘⇧A opens the panel, Esc closes it, ⌘⇧A toggles it again"],
        ["03-open-panel.mp4", "⌘⇧A opens the panel, Esc closes it, ⌘⇧A toggles it again"],
        ["04-preview-simulated.png", `The same panel with more runs (${SIM.toLowerCase()} from the mod's preview hook)`],
      ],
    },
    "home-title": {
      title: "New home title (“Let's do it”)",
      summary: "The big home title “Let's Cook.” now reads “Let's do it”. The mod only swaps the text on screen, without touching Tempo's code, and keeps it swapped when the screen re-renders. The empty new chat shows the same title.",
      shortcut: null,
      files: [
        ["01-before.png", "Before: original Tempo home with the “Let's Cook.” title"],
        ["02-after.png", "After: the same home with the “Let's do it” title"],
        ["03-open-empty-chat.gif", "Home with the new title, then an empty chat with the same title"],
        ["03-open-empty-chat.mp4", "Home with the new title, then an empty chat with the same title"],
        ["04-title-before.png", "Close-up of the original title: “Let's Cook.”"],
        ["05-title-after.png", "Close-up of the new title: “Let's do it”"],
      ],
    },
    "voice-input": {
      title: "Voice dictation in the composer",
      summary: "The chat composer gets a microphone button next to Send. Words appear in the field while you speak and the final text stays in the composer; nothing is sent. Recognition runs on the Mac (Apple Speech), with no cloud and no API key. Settings gets a Dictation section for engine, language and a mic test.",
      simulatedData: "Dictation is replayed from synthetic partial results through the mod's replay hook (no microphone recording). Text: “I want an Export to CSV button at the top of the table.”",
      shortcut: "Click the mic (or tap Space in an empty composer); Option-click toggles PT/EN",
      files: [
        ["01-before.png", "Before: original Tempo composer, no microphone"],
        ["02-after.png", "After: composer with the microphone button next to Send"],
        ["03-dictate-in-composer.gif", `Live dictation filling the composer (${SIM.toLowerCase()}: replayed partial results, no microphone)`],
        ["03-dictate-in-composer.mp4", `Live dictation filling the composer (${SIM.toLowerCase()}: replayed partial results, no microphone)`],
        ["04-open-dictation-settings.gif", "Open Settings › Dictation: engine and language options"],
        ["04-open-dictation-settings.mp4", "Open Settings › Dictation: engine and language options"],
        ["05-mic-tooltip.png", "Mic tooltip: current language and engine"],
        ["06-live-dictation.png", `Mid-dictation: live words over the field's placeholder (${SIM.toLowerCase()})`],
        ["07-settings-dictation.png", "Settings › Dictation: engine, language and microphone test"],
      ],
    },
    "usage-bar": {
      title: "Plan usage in the sidebar footer",
      summary: "The sidebar footer shows how much of your plan is used, for Claude and Codex, with the time until each window resets. Hovering opens a Usage panel with every window as a bar. Numbers come from local files on the Mac and no credential is read. Without the RE-TEMPO sidebar, the same usage shows as two rings in the rail.",
      shortcut: "Hover the footer line (click to pin, Esc closes)",
      files: [
        ["01-before.png", "Before: original Tempo footer with no usage information"],
        ["02-after.png", "After: the “Used” line in the footer with the Usage panel open"],
        ["03-open-usage-popover.gif", "Hover opens the Usage panel, a click pins it, Esc closes it"],
        ["03-open-usage-popover.mp4", "Hover opens the Usage panel, a click pins it, Esc closes it"],
        ["04-rail-rings-popover.gif", "Without the RE-TEMPO sidebar: usage rings in the rail open the same panel"],
        ["04-rail-rings-popover.mp4", "Without the RE-TEMPO sidebar: usage rings in the rail open the same panel"],
        ["05-footer-line.png", "Compact usage line in the sidebar footer"],
        ["06-rail-rings.png", "Two usage rings in the rail (time to reset in the center)"],
      ],
    },
    "effort-levels": {
      title: "“Extra High” effort for Opus 5",
      summary: "With Opus 5 (or Opus 5 1M), the composer's Effort menu gets an “Extra High” option that original Tempo hides for these models, although Claude Code accepts it. The choice is saved like the built-in options. The mod also drops the “ 1M” suffix from model names in the picker.",
      shortcut: null,
      files: [
        ["01-before.png", "Before: Opus 5 in original Tempo, Effort menu without “Extra High”"],
        ["02-after.png", "After: Opus 5 with “Extra High” in the Effort menu, already picked"],
        ["03-pick-extra-high.gif", "Switch to Opus 5, open Effort and pick “Extra High”"],
        ["03-pick-extra-high.mp4", "Switch to Opus 5, open Effort and pick “Extra High”"],
        ["04-model-names-after.png", "Model picker with the mod: names without “ 1M”"],
        ["05-model-names-before.png", "Model picker in original Tempo: names with “ 1M”"],
      ],
    },
    "profile-page": {
      title: "Profile page and the RE-TEMPO group in Settings",
      summary: "Settings gets a Profile page, the first item under Personal, with a read-only view of your work: level ring, counts, a 26-week activity map, work by type and milestones. There are no points, streaks or rankings; every number counts real work and only goes up. The mod also adds a “RE-TEMPO” group to Settings where other mods add their sections.",
      shortcut: "Settings (⌘,) › Personal › Profile",
      files: [
        ["01-before.png", "Before: original Tempo Settings, no Profile and no RE-TEMPO group"],
        ["02-after.png", "After: Settings › Profile with level, counts and activity map"],
        ["03-open-profile.gif", "Open Settings, see Profile and the RE-TEMPO group, scroll the profile"],
        ["03-open-profile.mp4", "Open Settings, see Profile and the RE-TEMPO group, scroll the profile"],
        ["04-profile-bottom.png", "Lower part of Profile: work by type, milestones and “Your month”"],
      ],
    },
    "decision-model": {
      title: "Decision model (TypeSafe Jev) in Settings",
      summary: "Settings gets a Decision model section, in the RE-TEMPO group, that connects TypeSafe AI's Jev model to canvas comment triage. For each new comment it suggests effort, whether to ask first and urgency, each with a confidence. Without an API key nothing is sent.",
      shortcut: "Settings (⌘,) › RE-TEMPO › Decision model",
      files: [
        ["01-before.png", "Before: original Tempo Settings, no Decision model section"],
        ["02-after.png", "After: Settings › Decision model with connection fields and “Not configured”"],
        ["03-open-decision-model.gif", "Open Decision model and scroll to automations, privacy and the log"],
        ["03-open-decision-model.mp4", "Open Decision model and scroll to automations, privacy and the log"],
        ["04-empty-log.png", "End of the section: automations, privacy notice and an empty decision log"],
      ],
    },
    "bg-tasks": {
      title: "Background tasks inside the chat",
      summary: "Tasks the agent runs in the background show up as a block at the end of the chat, like a message. Each row shows the task type and live elapsed time; finished tasks get a final icon and duration, then fold into the header after 8 s. Original Tempo only shows a “N Tasks Running” pill in the composer.",
      simulatedData: "Three fictional tasks (Run the test suite, Review the component diff, Build for production) injected into the app's own background-task store in the renderer, then cleared.",
      shortcut: "Click the block header to show or hide finished tasks",
      files: [
        ["01-before.png", `Before: the same 3 tasks only appear as “3 Tasks Running” in the composer (${SIM.toLowerCase()})`],
        ["02-after.png", `After: “3 background tasks running” block at the end of the chat (${SIM.toLowerCase()})`],
        ["03-tasks-run-and-finish.gif", `Tasks start, run and finish, one fails (${SIM.toLowerCase()})`],
        ["03-tasks-run-and-finish.mp4", `Tasks start, run and finish, one fails (${SIM.toLowerCase()})`],
        ["04-fold-and-expand.gif", `Finished tasks fold into the header; a click shows them again (${SIM.toLowerCase()})`],
        ["04-fold-and-expand.mp4", `Finished tasks fold into the header; a click shows them again (${SIM.toLowerCase()})`],
        ["05-one-failed.png", `One task still running, one done and one failed (${SIM.toLowerCase()})`],
        ["06-all-finished.png", `All finished, each with an icon and duration (${SIM.toLowerCase()})`],
        ["07-folded-summary.png", `After 8 s: summary folded into the header (${SIM.toLowerCase()})`],
      ],
    },
  };
  const out = {};
  for (const [mod, d] of Object.entries(D)) {
    if (only && !only.includes(mod)) continue;
    const r = kit.writeIndex(mod, { title: d.title, summary: d.summary, shortcut: d.shortcut, login: true, files: d.files.map(([file, caption]) => ({ file, caption })), notCaptured: null, simulatedData: d.simulatedData || null });
    out[mod] = { unlisted: r.unlisted, warnings: r.warnings };
  }
  return out;
}

// ================================================================= main
async function main() {
  const which = process.argv[2] || "all";
  fs.mkdirSync("/tmp/tempo-qa/cap-chat", { recursive: true });
  const s = await kit.open({ profile: "qa-2" });
  try {
    if (which === "all" || which === "before") await before(s);
    if (which === "all" || which === "after") await after(s);
    if (which === "all" || which === "rail") await rail(s);
    await cleanup(s);
  } finally {
    fs.writeFileSync(LOG, JSON.stringify(results, null, 1));
    await kit.close(s);
  }
  if (which === "all") console.log(JSON.stringify(writeIndexes(), null, 1));
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
export { results, openEmptyChat, bgClip, mask, openChat, goHome, chatBottom, composerRect, openSettings, leaveSettings, restoreWs };
