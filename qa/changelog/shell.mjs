#!/usr/bin/env node
// qa/changelog/shell.mjs — visual changelog, "shell" group (profile qa-4)
// -----------------------------------------------------------------------------
// Mods: pane-dock, sidebar-chats, project-sidebar, tab-close, rail-menu,
// title-crumb, new-page. Fixed layout per mod in evidence/<mod>/:
//   01-before.png, 02-after.png, 03-<action>.gif/.mp4, 04-/05-... and index.json
//   (kit.writeIndex, keys and text in English). Captions recorded in English.
//
//   cd qa && node changelog/shell.mjs                 # all mods
//   cd qa && node changelog/shell.mjs tab-close rail-menu
//
// Also exports SCENES (async (s) => result) to run against an instance that is
// already open (kit.open({ profile: "qa-4" })).
//
// State used (qa-4 clone of the seed-tracker project): workspace "main"
// (RT_WS_MAIN) with the primary draft chat "New Chat" (RT_CHAT_MAIN, empty:
// avoids showing the user's real chat), the untitled-2 canvas (copied from the
// qa-1 clone when missing) and a local "Terminal"; worktree "mango" (RT_WS_MANGO).
// Nothing is sent to chats. Created in the clone and undone at the end: a
// secondary draft chat (sidebar-chats) and the local terminal (pane-dock).
// -----------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as kit from "./kit.mjs";

const sleep = kit.sleep;
const PROFILE = "qa-4";
// Ids of the capture profile's workspaces and chats: set the RT_* env vars (the defaults are placeholders).
const WS_MAIN = process.env.RT_WS_MAIN || "ws-00000000-00000";
const WS_MANGO = process.env.RT_WS_MANGO || "00000000-0000-0000-0000-000000000001";
const CHAT_MAIN = process.env.RT_CHAT_MAIN || "00000000-0000-0000-0000-000000000002"; // "New Chat" (empty draft in the clone)
const WS_BUTIA = process.env.RT_WS_BUTIA || "ws-00000000-00001"; // butia, local feature branch
const WS_BUTIA_MAIN = process.env.RT_WS_BUTIA_MAIN || "00000000-0000-0000-0000-000000000003"; // butia, worktree main
const CHAT_BUTIA = process.env.RT_CHAT_BUTIA || "00000000-0000-0000-0000-000000000004"; // "New Chat" (empty draft)
const PROJ_SEED = process.env.RT_PROJ_SEED || "project-0000000000000-0000000";
const PROJ_BUTIA = process.env.RT_PROJ_BUTIA || "project-0000000000000-0000001";
const CANVAS = "untitled-2";
const CANVAS_PATH = `tempo/designs/canvases/${CANVAS}`;
const CENTER = '[data-testid="center-panel"]';
const PLUS = '[data-testid="center-panel-add-tab-button"]';
const EV = (mod, f) => `evidence/${mod}/${f}`;
const CAPTURED = "2026-10-18";

// stale files from earlier runs, deleted by name
const OLD = {
  "project-sidebar": ["04-search-and-collapse.gif", "04-search-and-collapse.mp4", "03-switch-branch-open-tab.gif", "03-switch-branch-open-tab.mp4"],
};
function removeOld(mod) {
  const gone = [];
  for (const f of OLD[mod] || []) {
    const p = path.join(kit.REPO, "evidence", mod, f);
    if (fs.existsSync(p)) { fs.unlinkSync(p); gone.push(f); }
  }
  return gone;
}

// ------------------------------------------------------------ page helpers
// workspaces store (zustand getState found in hook deps, like pane-dock)
const STORE_JS = () => {
  if (window.__qaWs && window.__qaWs()) return;
  const RE = /^\(\)=>[A-Za-z$_][\w$]*$/;
  let found = null;
  const check = (f) => {
    let h = f.memoizedState;
    if (!h || typeof h !== "object" || !("next" in h)) return;
    for (let i = 0; h && i < 400; i++, h = h.next) {
      const m = h.memoizedState;
      const d = Array.isArray(m) && m.length === 2 ? m[1] : null;
      if (!Array.isArray(d) || d.length !== 4 || typeof d[0] !== "function" || typeof d[2] !== "function") continue;
      const gs = d[0];
      if (!RE.test(Function.prototype.toString.call(gs))) continue;
      let st;
      try { st = gs(); } catch { continue; }
      if (st && typeof st === "object" && Array.isArray(st.workspaces) && typeof st.setActiveCenterTab === "function") { found = gs; return; }
    }
  };
  const root = document.getElementById("root");
  const key = Object.keys(root).find((k) => k.startsWith("__reactContainer$"));
  const stack = [root[key]];
  const seen = new Set();
  while (stack.length && !found) {
    const f = stack.pop();
    if (!f || seen.has(f)) continue;
    seen.add(f);
    check(f);
    if (f.child) stack.push(f.child);
    if (f.sibling) stack.push(f.sibling);
  }
  window.__qaWs = () => found;
};

// Synthetic DragEvents with a shared DataTransfer (same as qa/suites/90-pane-dock-dnd.mjs)
const DND_JS = () => {
  if (window.__qaDrag) return;
  const fire = (target, type, x, y) => {
    const ev = new DragEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, dataTransfer: window.__qaDt });
    target.dispatchEvent(ev);
    return ev;
  };
  const at = (x, y) => document.elementFromPoint(x, y) || document.body;
  let last = null;
  let src = null;
  window.__qaDrag = {
    start(sel) {
      src = typeof sel === "string" ? document.querySelector(sel) : sel;
      if (!src) return null;
      const dt = new DataTransfer();
      if (src.getAttribute("data-tab-id")) dt.setData("tempo-tab-id", src.getAttribute("data-tab-id"));
      window.__qaDt = dt;
      const r = src.getBoundingClientRect();
      fire(src, "dragstart", r.left + r.width / 2, r.top + r.height / 2);
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    over(x, y) {
      const t = at(x, y);
      if (t !== last) { if (last) fire(last, "dragleave", x, y); fire(t, "dragenter", x, y); last = t; }
      fire(t, "dragover", x, y);
    },
    drop(x, y) {
      const t = at(x, y);
      fire(t, "dragover", x, y);
      const ev = fire(t, "drop", x, y);
      last = null;
      return ev.defaultPrevented;
    },
    end(x, y) {
      fire(src && src.isConnected ? src : document.body, "dragend", x || 0, y || 0);
      last = null;
      src = null;
    },
  };
};

async function inject(s) {
  await s.page.evaluate(STORE_JS);
  await s.page.evaluate(DND_JS);
}

// Canvas with content in the clone (the qa-4 clone only had untitled-6, empty).
function ensureCanvas() {
  const dst = `/tmp/tempo-qa/profiles/${PROFILE}/projects/seed-tracker/${CANVAS_PATH}`;
  const src = `/tmp/tempo-qa/profiles/qa-1/projects/seed-tracker/${CANVAS_PATH}`;
  if (!fs.existsSync(dst) && fs.existsSync(src)) execFileSync("/bin/cp", ["-cR", src, dst]);
  return fs.existsSync(dst);
}

const centerTabs = (s) =>
  s.page.evaluate((C) => [...document.querySelectorAll(`${C} [role="tab"][data-tab-id]`)].filter((t) => t.offsetWidth > 0).map((t) => {
    const r = t.getBoundingClientRect();
    return { id: t.getAttribute("data-tab-id"), testid: t.getAttribute("data-testid"), text: t.innerText.trim().slice(0, 40), x: r.x, y: r.y, w: r.width, h: r.height };
  }), CENTER);

// caption position (px) for cropped recordings; left = horizontal center
const capTop = (s, px, left = null, maxW = null) => s.page.evaluate(([v, l, mw]) => {
  if (v == null) document.documentElement.style.removeProperty("--rtq-cap-top");
  else document.documentElement.style.setProperty("--rtq-cap-top", v + "px");
  let st = document.getElementById("rtq-cap-left");
  if (l == null) { if (st) st.remove(); return; }
  if (!st) { st = document.createElement("style"); st.id = "rtq-cap-left"; document.documentElement.appendChild(st); }
  st.textContent = `#rtq-caption{left:${l}px !important;max-width:${mw || Math.max(200, 2 * l - 20)}px !important}`;
}, [px, left, maxW]);

// Base state: dock with no panes, no New tabs, primary tab visible, workspace main,
// chat "New Chat" (draft) with the untitled-2 canvas (and a terminal if requested).
async function base(s, skip, { ws = WS_MAIN, terminal = false, active = "canvas" } = {}) {
  await s.page.evaluate(() => { try { window.__RE_TEMPO_PANE_DOCK__ && window.__RE_TEMPO_PANE_DOCK__.reset(); } catch (_) {} });
  await kit.setSkip(s, skip);
  await inject(s);
  await capTop(s, 104); // caption below the tab bar
  await s.page.evaluate(() => { try { window.__RE_TEMPO_PANE_DOCK__ && window.__RE_TEMPO_PANE_DOCK__.reset(); } catch (_) {} });
  const res = await s.page.evaluate(async ({ ws, WS_MAIN, CHAT_MAIN, CANVAS, CANVAS_PATH, terminal, active }) => {
    const w8 = (ms) => new Promise((r) => setTimeout(r, ms));
    const st = () => window.__qaWs()();
    try { window.__RE_TEMPO_TAB_CLOSE__ && window.__RE_TEMPO_TAB_CLOSE__.reveal(); } catch (_) {}
    try { for (const t of (window.__RE_TEMPO_NEW_PAGE__ && window.__RE_TEMPO_NEW_PAGE__.state().tabs) || []) window.__RE_TEMPO_NEW_PAGE__.close(t.id); } catch (_) {}
    if (st().activeNavRoute !== "chat") { st().setActiveNavRoute("chat"); await w8(600); }
    if (st().selectedWorkspaceId !== WS_MAIN) { st().switchToWorkspace(WS_MAIN); await w8(1200); }
    if (st().activeChatTabId !== CHAT_MAIN) { st().selectWorkspaceChat(WS_MAIN, CHAT_MAIN); await w8(800); }
    const tabs = () => st().centerTabs.filter((t) => !t.archived && !t.isArchived);
    if (!tabs().some((t) => t.type === "canvas" && t.ownerChatTabId === CHAT_MAIN && (t.pageFolderPath || "").endsWith("/" + CANVAS))) {
      try { await st().loadAllFiles(); } catch (_) {}
      st().openCanvasTab(CANVAS, CANVAS_PATH, true);
      await w8(1500);
    }
    if (terminal && !tabs().some((t) => t.type === "terminal" && t.ownerChatTabId === CHAT_MAIN)) {
      window.__RE_TEMPO_PANE_DOCK__ ? window.__RE_TEMPO_PANE_DOCK__.runPlusItem("main", "terminal") : st().openTerminalTab();
      await w8(1500);
    }
    const want = tabs().find((t) => (active === "chat" ? t.id === CHAT_MAIN : active === "terminal" ? t.type === "terminal" && t.ownerChatTabId === CHAT_MAIN : t.type === "canvas" && t.ownerChatTabId === CHAT_MAIN && (t.pageFolderPath || "").endsWith("/" + CANVAS)));
    if (want) { st().setActiveCenterTab(want.id); await w8(500); }
    if (ws !== WS_MAIN) { st().switchToWorkspace(ws); await w8(1500); }
    return { ws: st().selectedWorkspaceId, chat: st().activeChatTabId, act: st().activeCenterTabId };
  }, { ws, WS_MAIN, CHAT_MAIN, CANVAS, CANVAS_PATH, terminal, active });
  await sleep(1500);
  return res;
}

// Native Chats sidebar: collapses (on) or reopens the "Local" node of the seed-tracker
// main workspace, which lists a real user chat with a Portuguese title.
async function nativeMainCollapsed(s, on) {
  await s.page.evaluate(([W, on]) => {
    const st = window.__qaWs()();
    const exp = st.expandedWorkspaceIds.filter((x) => x !== W);
    const coll = st.userCollapsedWorkspaceIds.filter((x) => x !== W);
    st.setExpandedWorkspaceIds(on ? exp : [...exp, W]);
    st.setUserCollapsedWorkspaceIds(on ? [...coll, W] : coll);
  }, [WS_MAIN, on]);
  await sleep(700);
}

// Base state on butia (local feature branch, empty draft chat) for the scenes that use
// the native Chats sidebar; the seed-tracker main node stays collapsed.
async function butiaBase(s, skip, { terminal = false, active = "chat" } = {}) {
  await base(s, skip, { active: "chat" });
  const r = await s.page.evaluate(async ({ WS_BUTIA, CHAT_BUTIA, terminal, active }) => {
    const w8 = (ms) => new Promise((res) => setTimeout(res, ms));
    const st = () => window.__qaWs()();
    if (st().selectedWorkspaceId !== WS_BUTIA || st().activeChatTabId !== CHAT_BUTIA) { st().selectWorkspaceChat(WS_BUTIA, CHAT_BUTIA); await w8(1500); }
    const tabs = () => st().centerTabs.filter((t) => !t.archived && !t.isArchived);
    if (terminal && !tabs().some((t) => t.type === "terminal" && t.ownerChatTabId === CHAT_BUTIA)) {
      window.__RE_TEMPO_PANE_DOCK__ ? window.__RE_TEMPO_PANE_DOCK__.runPlusItem("main", "terminal") : st().openTerminalTab();
      await w8(1500);
    }
    const want = active === "terminal" ? tabs().find((t) => t.type === "terminal" && t.ownerChatTabId === CHAT_BUTIA) : tabs().find((t) => t.id === CHAT_BUTIA);
    if (want) { st().setActiveCenterTab(want.id); await w8(500); }
    return { ws: st().selectedWorkspaceId, chat: st().activeChatTabId, act: st().activeCenterTabId };
  }, { WS_BUTIA, CHAT_BUTIA, terminal, active });
  await nativeMainCollapsed(s, true);
  await sleep(800);
  return r;
}

// Is real user text visible on screen? (check only; changes nothing)
// The pattern is the title of a real user chat (user data: "homepage <word> apple").
const leak = (s) => s.page.evaluate(() => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!/homepage \S+ apple/i.test(n.nodeValue || "")) continue;
    const el = n.parentElement;
    if (!el || (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))) continue;
    let r = el.getBoundingClientRect();
    let box = { l: Math.max(0, r.left), t: Math.max(0, r.top), r: Math.min(innerWidth, r.right), b: Math.min(innerHeight, r.bottom) };
    // clip by ancestors with overflow (collapsed groups end up with height 0)
    for (let a = el.parentElement; a && box.r > box.l && box.b > box.t; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflow === "visible" && cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      const q = a.getBoundingClientRect();
      box = { l: Math.max(box.l, q.left), t: Math.max(box.t, q.top), r: Math.min(box.r, q.right), b: Math.min(box.b, q.bottom) };
    }
    if (box.r - box.l > 1 && box.b - box.t > 1) return true;
  }
  return false;
});

// Undoes what the scenes left in the clone: local terminals created in the draft chats
// (main and butia), collapsed native node; returns to main with all mods.
export async function cleanup(s) {
  await base(s, "", { active: "chat" });
  await nativeMainCollapsed(s, false);
  return s.page.evaluate(async ([CM, CB, WM]) => {
    const w8 = (ms) => new Promise((r) => setTimeout(r, ms));
    const st = () => window.__qaWs()();
    const closed = [];
    // closeTerminalTab acts on the selected workspace: select the owner before closing
    const mine = st().workspaces.flatMap((w) => (w.centerTabs || []).filter((t) => t.type === "terminal" && (t.ownerChatTabId === CM || t.ownerChatTabId === CB)).map((t) => ({ ws: w.id, id: t.id, owner: t.ownerChatTabId })));
    for (const t of mine) {
      st().selectWorkspaceChat(t.ws, t.owner);
      await w8(1200);
      try { st().closeTerminalTab(t.id); closed.push(t.id); } catch (_) {}
      await w8(600);
    }
    st().selectWorkspaceChat(WM, CM);
    await w8(1000);
    return closed;
  }, [CHAT_MAIN, CHAT_BUTIA, WS_MAIN]);
}

// drag with a fake cursor: dragstart on the tab, dragover along the path, drop
async function dragTab(s, tabSel, to, { steps = 22, ms = 900, drop = true, hold = 500 } = {}) {
  const from = await s.page.evaluate((sel) => window.__qaDrag.start(sel), tabSel);
  if (!from) throw new Error(`tab to drag not found: ${tabSel}`);
  await sleep(140);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const x = from.x + (to.x - from.x) * e, y = from.y + (to.y - from.y) * e;
    await s.page.evaluate(([a, b]) => { window.__rtq && window.__rtq.at(a, b); window.__qaDrag.over(a, b); }, [x, y]);
    await sleep(ms / steps);
  }
  for (let i = 0; i < 4; i++) { await s.page.evaluate(([a, b]) => window.__qaDrag.over(a, b), [to.x, to.y]); await sleep(hold / 4); }
  s.mouse = { x: to.x, y: to.y };
  if (!drop) return { from };
  const ok = await s.page.evaluate(([a, b]) => { const r = window.__qaDrag.drop(a, b); window.__qaDrag.end(a, b); return r; }, [to.x, to.y]);
  await s.page.evaluate(([a, b]) => window.__rtq && window.__rtq.ripple(a, b), [to.x, to.y]);
  return { from, dropped: ok };
}

const panels = (s) => s.page.evaluate(() => (window.__RE_TEMPO_PANE_DOCK__ ? window.__RE_TEMPO_PANE_DOCK__.panels.map((p) => ({ id: p.id, tabs: p.tabs, rect: p.rect })) : []));
const scrollTo = (s, sel) => s.page.evaluate((q) => { const n = document.querySelector(q); n && n.scrollIntoView({ block: "center" }); }, sel);
const check = (file) => ({ file, ...kit.probe(file) });

// records and returns the gif/mp4 probe
async function rec(s, mod, name, fn, opts) {
  const r = await kit.record(s, EV(mod, name), fn, opts);
  return { seconds: r.seconds, gif: check(EV(mod, name + ".gif")), mp4: check(EV(mod, name + ".mp4")) };
}

// ============================================================ scenes
export const SCENES = {};

// ---------------------------------------------------------------- 22 project-sidebar
SCENES["project-sidebar"] = async (s) => {
  const M = "project-sidebar";
  const out = { removed: removeOld(M) };
  const row = (k) => `[data-rtps-root] .rtps-row[data-key="${k}"]`;
  const expand = async (pid, want) => {
    const open = await s.page.evaluate((k) => { const r = document.querySelector(k); return r ? r.getAttribute("aria-expanded") : null; }, row(`p:${pid}`));
    if ((open === "true") !== want && open != null) { await kit.clickSel(s, row(`p:${pid}`)); await sleep(600); }
  };
  await base(s, "*", { active: "chat" });
  await nativeMainCollapsed(s, true);
  out.leak01 = await leak(s);
  await kit.shot(s, EV(M, "01-before.png"));
  await nativeMainCollapsed(s, false);
  await base(s, "", { active: "chat" });
  for (const pid of [PROJ_SEED, PROJ_BUTIA]) await expand(pid, true);
  await sleep(800);
  out.leak02 = await leak(s);
  await kit.shot(s, EV(M, "02-after.png"));
  // With main out of focus, its card lists the whole deck (including a real user
  // chat). So seed-tracker is collapsed before switching to the butia branches.
  out.r03 = await rec(s, M, "03-open-tab-switch-branch", async () => {
    await kit.caption(s, "One sidebar: project → branch → chats and tabs");
    await kit.highlight(s, "[data-rtps-root]");
    await sleep(1800);
    await kit.highlight(s, null);
    await kit.caption(s, "Click a tab row to open it in the center");
    await kit.clickSel(s, `[data-rtps-root] .rtps-row.rtps-panel[data-key^="t:${WS_MAIN}:canvas-${CHAT_MAIN}"][data-key$="/${CANVAS}"]`);
    await sleep(1600);
    await kit.clickSel(s, row(`c:${WS_MAIN}:${CHAT_MAIN}`));
    await sleep(1300);
    await kit.caption(s, "Click a project to collapse it");
    await kit.clickSel(s, row(`p:${PROJ_SEED}`));
    await sleep(1300);
    await kit.caption(s, "Click a branch to switch workspace");
    await kit.clickSel(s, row(`w:${WS_BUTIA_MAIN}`));
    await sleep(1700);
    out.leak03 = await leak(s);
    await kit.clickSel(s, row(`w:${WS_BUTIA}`));
    await sleep(1700);
    await kit.caption(s, null);
  });
  // go back (outside the recording): main selected before reopening seed-tracker
  await base(s, "", { active: "chat" });
  await expand(PROJ_SEED, true);
  await sleep(600);
  out.r04 = await rec(s, M, "04-search-filter", async () => {
    await kit.caption(s, "Search filters projects, chats and tabs");
    await kit.clickSel(s, "[data-rtps-root] input");
    const ae = await s.page.evaluate(() => document.activeElement && document.activeElement.tagName);
    if (ae === "INPUT") await s.page.keyboard.type("term", { delay: 160 });
    await sleep(1800);
    out.leak04 = await leak(s);
    await kit.caption(s, "Esc clears the search");
    await s.page.keyboard.press("Escape");
    await sleep(1400);
    await kit.caption(s, null);
  });
  out.index = kit.writeIndex(M, {
    title: "One project-oriented sidebar",
    summary: "The left icon rail and the five separate sidebars (chat, docs, design, issues, agents) become a single sidebar organized by project. Each project lists its branches as cards, and each branch lists its chats and open tabs. Search, agent runs, add project and new worktree sit on top, and every click uses the app's own navigation.",
    shortcut: "⌘⇧E (switch sidebar mode), ⌘B (collapse)",
    login: true,
    files: [
      { file: "01-before.png", caption: "Before: the original icon rail and Chats sidebar (Tempo with no mods)." },
      { file: "02-after.png", caption: "After: one sidebar with projects, branch cards, chats and open tabs." },
      { file: "03-open-tab-switch-branch.gif", caption: "Clicking a tab row opens that tab, clicking a project collapses it, and clicking a branch switches workspace." },
      { file: "03-open-tab-switch-branch.mp4", caption: "Clicking a tab row opens that tab, clicking a project collapses it, and clicking a branch switches workspace." },
      { file: "04-search-filter.gif", caption: "Typing in the search box filters the tree; Esc clears it." },
      { file: "04-search-filter.mp4", caption: "Typing in the search box filters the tree; Esc clears it." },
    ],
    notCaptured: null,
    simulatedData: null,
  });
  return out;
};

// ---------------------------------------------------------------- 25 title-crumb
SCENES["title-crumb"] = async (s) => {
  const M = "title-crumb";
  const out = { removed: removeOld(M) };
  const HDR = { x: 380, y: 0, width: 680, height: 40 };
  const row = (k) => `[data-rtps-root] .rtps-row[data-key="${k}"]`;
  const crumb = '[data-testid="app-header-branch-status"]';
  await base(s, "title-crumb", { ws: WS_MANGO });
  out.before = await s.page.evaluate((c) => document.querySelector(c)?.innerText, crumb);
  await kit.shot(s, EV(M, "01-before.png"), { clip: HDR, scale: 2 });
  await base(s, "", { ws: WS_MANGO });
  await sleep(800);
  out.after = await s.page.evaluate(() => window.__RE_TEMPO_TITLE_CRUMB__ && window.__RE_TEMPO_TITLE_CRUMB__.text);
  await kit.shot(s, EV(M, "02-after.png"), { clip: HDR, scale: 2 });
  // Switch between the two butia branches with seed-tracker collapsed (with main out of
  // focus, its card lists a real user chat).
  await base(s, "", { active: "chat" });
  const seedOpen = await s.page.evaluate((k) => document.querySelector(k)?.getAttribute("aria-expanded"), row(`p:${PROJ_SEED}`));
  if (seedOpen === "true") { await kit.clickSel(s, row(`p:${PROJ_SEED}`)); await sleep(600); }
  await s.page.evaluate((w) => window.__qaWs()().switchToWorkspace(w), WS_BUTIA);
  await sleep(1800);
  await capTop(s, 104, 530);
  out.r03 = await rec(s, M, "03-crumb-follows-branch", async () => {
    await kit.caption(s, "Window title: owner / project / branch");
    await kit.highlight(s, crumb);
    await sleep(2000);
    await kit.highlight(s, null);
    await kit.caption(s, "Switch branch and the title follows");
    await kit.clickSel(s, row(`w:${WS_BUTIA_MAIN}`));
    await sleep(1300);
    await kit.highlight(s, crumb);
    await sleep(1500);
    await kit.highlight(s, null);
    out.leak03 = await leak(s);
    await kit.clickSel(s, row(`w:${WS_BUTIA}`));
    await sleep(1300);
    await kit.highlight(s, crumb);
    await sleep(1500);
    await kit.highlight(s, null);
    await kit.caption(s, "The owner comes from the project's git remote");
    await sleep(2200);
    await kit.caption(s, null);
  }, { clip: { x: 0, y: 0, width: 1060, height: 420 } });
  out.butia = await s.page.evaluate(() => window.__RE_TEMPO_TITLE_CRUMB__ && window.__RE_TEMPO_TITLE_CRUMB__.text);
  await base(s, "", { active: "chat" });
  const seedOpen2 = await s.page.evaluate((k) => document.querySelector(k)?.getAttribute("aria-expanded"), row(`p:${PROJ_SEED}`));
  if (seedOpen2 === "false") { await kit.clickSel(s, row(`p:${PROJ_SEED}`)); await sleep(600); }
  // 04: narrow window, the middle segment becomes an ellipsis
  await kit.viewport(s, 760, 900);
  await sleep(1500);
  out.narrow = await s.page.evaluate((c) => document.querySelector(c)?.innerText.replace(/\s+/g, " "), crumb);
  const hdr = await kit.rectOf(s, crumb);
  if (hdr) await kit.shot(s, EV(M, "04-narrow-window-ellipsis.png"), { clip: { x: 0, y: 0, width: 760, height: 40 }, scale: 2 });
  await kit.viewport(s, 1440, 900);
  await sleep(1200);
  const files = [
    { file: "01-before.png", caption: "Before: the window title shows only the branch name, \"jdoe/mango\"." },
    { file: "02-after.png", caption: "After: the title is a breadcrumb, \"jdoe / seed-tracker / mango\"." },
    { file: "03-crumb-follows-branch.gif", caption: "Switching between two branches of the butia project updates the breadcrumb (owner from the git remote)." },
    { file: "03-crumb-follows-branch.mp4", caption: "Switching between two branches of the butia project updates the breadcrumb (owner from the git remote)." },
  ];
  if (hdr && /…/.test(out.narrow || "")) files.push({ file: "04-narrow-window-ellipsis.png", caption: "In a narrow window the segments are shortened with an ellipsis in the middle." });
  else if (fs.existsSync(path.join(kit.REPO, EV(M, "04-narrow-window-ellipsis.png")))) fs.unlinkSync(path.join(kit.REPO, EV(M, "04-narrow-window-ellipsis.png")));
  out.index = kit.writeIndex(M, {
    title: "Window title becomes owner / project / branch",
    summary: "The title in the middle of the top bar used to show only the branch name. Now it shows the full path: owner, project and branch. The owner comes from the git remote, or from the git user prefix of the branch when there is no remote. It updates when you switch workspace, and the branch icon, copy-on-click and +N counter stay as they were.",
    shortcut: null,
    login: true,
    files,
    notCaptured: null,
    simulatedData: null,
  });
  return out;
};

// ---------------------------------------------------------------- 24 rail-menu
SCENES["rail-menu"] = async (s) => {
  const M = "rail-menu";
  const out = { removed: removeOld(M) };
  const CLIP = { x: 0, y: 690, width: 330, height: 210 };
  const gear = '[data-testid="workspace-navbar"] button[aria-label="Settings"]';
  await base(s, "project-sidebar,rail-menu");
  out.beforeRail = await s.page.evaluate(() => [...document.querySelectorAll('[data-testid="workspace-navbar"] button')].filter((b) => b.offsetWidth).map((b) => b.getAttribute("aria-label")));
  await kit.shot(s, EV(M, "01-before.png"), { clip: CLIP, scale: 2 });
  await base(s, "project-sidebar");
  out.afterRail = await s.page.evaluate(() => [...document.querySelectorAll('[data-testid="workspace-navbar"] button')].filter((b) => b.offsetWidth).map((b) => b.getAttribute("aria-label")));
  await kit.clickSel(s, gear);
  await sleep(700);
  await kit.shot(s, EV(M, "02-after.png"), { clip: CLIP, scale: 2 });
  await s.page.keyboard.press("Escape");
  await sleep(500);
  await capTop(s, 700, 480, 420); // caption to the right of the menu, inside the crop
  out.r03 = await rec(s, M, "03-open-gear-menu", async () => {
    await kit.caption(s, "Rail footer: only the gear and the avatar");
    await kit.highlight(s, { x: 8, y: 818, width: 36, height: 72 });
    await sleep(1800);
    await kit.highlight(s, null);
    await kit.caption(s, "The gear opens a menu");
    await kit.clickSel(s, gear);
    await sleep(1300);
    await kit.caption(s, "Report a bug and Help now live here");
    await kit.hoverSel(s, ".rtrm-menu .rtrm-item:last-of-type");
    await sleep(1200);
    await kit.caption(s, "Help opens the original submenu");
    await kit.clickText(s, "Help", { selector: '.rtrm-menu [role="menuitem"]' });
    await sleep(1700);
    await s.page.keyboard.press("Escape");
    await sleep(500);
    await kit.caption(s, "Settings… keeps its ⌘, shortcut");
    await kit.clickSel(s, gear);
    await sleep(900);
    await kit.hoverSel(s, '.rtrm-menu [role="menuitem"]');
    await sleep(1200);
    await s.page.keyboard.press("Escape");
    await sleep(400);
    await kit.caption(s, null);
  }, { clip: { x: 0, y: 690, width: 720, height: 210 } });
  await capTop(s, 104);
  // 04: with project-sidebar on, the title bar gear opens the same menu
  await base(s, "");
  const tg = await s.page.evaluate(() => {
    const b = [...document.querySelectorAll('button[aria-label="Settings"]')].find((n) => n.offsetWidth && n.getBoundingClientRect().y < 40);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const files = [
    { file: "01-before.png", caption: "Before: the rail footer has bug report, help, settings and avatar buttons." },
    { file: "02-after.png", caption: "After: only the gear and the avatar; the gear opens a menu with Settings, Help and Report a bug." },
    { file: "03-open-gear-menu.gif", caption: "The gear opens the menu; Help opens the original help submenu." },
    { file: "03-open-gear-menu.mp4", caption: "The gear opens the menu; Help opens the original help submenu." },
  ];
  if (tg) {
    await kit.click(s, tg.x + tg.width / 2, tg.y + tg.height / 2);
    await sleep(700);
    out.titleBarMenu = await s.page.evaluate(() => !!document.querySelector(".rtrm-menu"));
    if (out.titleBarMenu) {
      await kit.shot(s, EV(M, "04-title-bar-gear-menu.png"), { clip: { x: 0, y: 0, width: 420, height: 220 }, scale: 2 });
      files.push({ file: "04-title-bar-gear-menu.png", caption: "With the project sidebar on, the title bar gear opens the same menu." });
    }
    await s.page.keyboard.press("Escape");
  }
  out.index = kit.writeIndex(M, {
    title: "Slimmer rail footer with a gear menu",
    summary: "The rail footer used to show bug report, help, settings and avatar buttons. Now it keeps only the gear and the avatar. Report a bug and Help moved into a menu that the gear opens, with the same shortcuts as before.",
    shortcut: "⌘, (Settings), ⌘⇧B (Report a bug), Shift-click the gear (Settings directly)",
    login: true,
    files,
    notCaptured: null,
    simulatedData: null,
  });
  return out;
};

// ---------------------------------------------------------------- 30 new-page
SCENES["new-page"] = async (s) => {
  const M = "new-page";
  const out = { removed: removeOld(M) };
  const card = (k) => `.rnp-card[data-rnp-kind="${k}"]`;
  const closeNew = () => s.page.evaluate(() => { for (const t of window.__RE_TEMPO_NEW_PAGE__.state().tabs) window.__RE_TEMPO_NEW_PAGE__.close(t.id); });
  await base(s, "new-page");
  await kit.clickSel(s, PLUS);
  await sleep(900);
  out.nativeMenu = await s.page.evaluate(() => [...document.querySelectorAll('[role="menu"]')].map((m) => m.innerText.replace(/\s+/g, " ").trim()));
  await kit.shot(s, EV(M, "01-before.png"));
  await s.page.keyboard.press("Escape");
  await sleep(400);
  await base(s, "");
  await kit.clickSel(s, PLUS);
  await sleep(2200);
  out.state = await s.page.evaluate(() => window.__RE_TEMPO_NEW_PAGE__.state());
  await kit.shot(s, EV(M, "02-after.png"));
  await closeNew();
  await sleep(600);
  out.r03 = await rec(s, M, "03-open-new-tab", async () => {
    await kit.caption(s, "The + in the tab bar opens a New tab");
    await kit.clickSel(s, PLUS);
    await sleep(1800);
    await kit.caption(s, "Seven animated launchers, one per + menu item");
    for (const k of ["chat", "canvas", "doc", "terminal", "browser", "open"]) {
      await kit.hoverSel(s, card(k), { ms: 380 });
      await sleep(850);
    }
    await kit.caption(s, null);
  });
  out.r04 = await rec(s, M, "04-filter-and-original-menu", async () => {
    await kit.caption(s, "Search filters the launchers");
    await kit.clickSel(s, ".rnp-search");
    await sleep(200);
    // simulated typing in the field (avoids letter shortcuts outside the input)
    for (const v of ["t", "te", "ter", "term"]) {
      await s.page.evaluate((v) => { const i = document.querySelector(".rnp-search"); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); }, v);
      await sleep(240);
    }
    await sleep(1400);
    await s.page.evaluate(() => { const i = document.querySelector(".rnp-search"); i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); });
    await sleep(700);
    await kit.caption(s, "Right-click the + for the original menu");
    const p = await kit.rectOf(s, PLUS);
    if (p) {
      await kit.moveTo(s, p.x + p.width / 2, p.y + p.height / 2);
      await kit.click(s, null, null, { button: "right" });
      await sleep(1700);
      out.contextMenu = await s.page.evaluate(() => [...document.querySelectorAll('[role="menu"]')].map((m) => m.innerText.replace(/\s+/g, " ").trim()));
      await s.page.keyboard.press("Escape");
      await sleep(500);
    }
    await kit.caption(s, "Closing the New tab goes back to where you were");
    const close = await s.page.evaluate(() => {
      const t = [...document.querySelectorAll('[role="tab"]')].find((n) => n.offsetWidth && /New/.test(n.innerText) && n.querySelector("button, [aria-label^='Close']"));
      const b = t && (t.querySelector("[data-rnp-close]") || t.querySelector("button") || t.querySelector("[aria-label^='Close']"));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (close) await kit.click(s, close.x, close.y);
    else await closeNew();
    await sleep(1200);
    await kit.caption(s, null);
  });
  await closeNew();
  out.index = kit.writeIndex(M, {
    title: "New tab with animated launchers",
    summary: "The + in the center tab bar (and in each pane-dock pane) used to open a dropdown menu. Now it opens a New tab with seven animated launchers: Chat, Canvas, Doc, Issue, Terminal, Browser and Open existing. Each one runs the same action as its menu item, the page has search and letter shortcuts, and the original menu is still there on right-click or by holding the +.",
    shortcut: "C, ⇧C, D, I, T, B, O (launchers); ⌘K or / (search); right-click or hold + (original menu)",
    login: true,
    files: [
      { file: "01-before.png", caption: "Before: the + opens the native dropdown menu (all mods except new-page; \"Shader on Canvas\" comes from another mod)." },
      { file: "02-after.png", caption: "After: the + opens a New tab with seven animated launchers." },
      { file: "03-open-new-tab.gif", caption: "Clicking + opens the New tab; each launcher card animates on hover." },
      { file: "03-open-new-tab.mp4", caption: "Clicking + opens the New tab; each launcher card animates on hover." },
      { file: "04-filter-and-original-menu.gif", caption: "Search filters the launchers, right-click on + shows the original menu, and closing the tab goes back." },
      { file: "04-filter-and-original-menu.mp4", caption: "Search filters the launchers, right-click on + shows the original menu, and closing the tab goes back." },
    ],
    notCaptured: null,
    simulatedData: null,
  });
  return out;
};

// ---------------------------------------------------------------- 23 tab-close
SCENES["tab-close"] = async (s) => {
  const M = "tab-close";
  const out = { removed: removeOld(M) };
  // Native Chats sidebar on both sides (project-sidebar off): project-sidebar only lists
  // open tabs, so the closed chat would disappear from it too. Local feature branch of
  // butia, empty draft chat + a local terminal in the bar.
  const BAR = { x: 331, y: 40, width: 760, height: 46 };
  const primary = `${CENTER} [role="tab"][data-testid="chat-tab"]`;
  const chatRow = `[data-testid="workspace-chat-${WS_BUTIA}-${CHAT_BUTIA}"]`;
  await butiaBase(s, "project-sidebar,tab-close", { terminal: true, active: "chat" });
  out.beforeButtons = await s.page.evaluate((sel) => document.querySelector(sel)?.querySelectorAll("button").length, primary);
  await kit.shot(s, EV(M, "01-before.png"), { clip: BAR, scale: 2 });
  await butiaBase(s, "project-sidebar", { terminal: true, active: "chat" });
  await scrollTo(s, chatRow);
  await kit.hoverSel(s, primary);
  await sleep(400);
  out.afterButtons = await s.page.evaluate((sel) => [...(document.querySelector(sel)?.querySelectorAll("button") || [])].map((b) => b.getAttribute("aria-label")), primary);
  await kit.shot(s, EV(M, "02-after.png"), { clip: BAR, scale: 2 });
  out.leak = await leak(s);
  await capTop(s, 104, 530);
  out.r03 = await rec(s, M, "03-close-primary-tab", async () => {
    await kit.caption(s, "The main chat tab now has a close button");
    await kit.hoverSel(s, primary);
    await sleep(500);
    await kit.highlight(s, `${primary} button[aria-label^="Close"]`);
    await sleep(1500);
    await kit.highlight(s, null);
    await kit.clickSel(s, `${primary} button[aria-label^="Close"]`);
    await sleep(900);
    await kit.caption(s, "Closing only hides the tab: the chat stays in the sidebar");
    await kit.highlight(s, chatRow);
    await sleep(2000);
    await kit.highlight(s, null);
    await kit.caption(s, "Click the chat and the tab comes back");
    await kit.clickSel(s, chatRow);
    await sleep(1800);
    await kit.caption(s, null);
  }, { clip: { x: 0, y: 0, width: 1060, height: 720 } });
  out.state = await s.page.evaluate(() => window.__RE_TEMPO_TAB_CLOSE__.state());
  out.tabsAfter = (await centerTabs(s)).map((t) => t.text);
  out.index = kit.writeIndex(M, {
    title: "Close button on the main chat tab",
    summary: "In the center tab bar, the first tab (the main chat) was the only one without a close button. Now every tab has one. Closing the main chat only hides its tab: the conversation is not deleted or archived, it stays in the sidebar, and clicking it brings the tab back.",
    shortcut: "Click × or middle-click the tab",
    login: true,
    files: [
      { file: "01-before.png", caption: "Before: the main chat tab has no close button (native Chats sidebar on both sides)." },
      { file: "02-after.png", caption: "After: the same tab with a close button." },
      { file: "03-close-primary-tab.gif", caption: "Closing the main chat tab hides it; clicking the chat in the sidebar brings it back." },
      { file: "03-close-primary-tab.mp4", caption: "Closing the main chat tab hides it; clicking the chat in the sidebar brings it back." },
    ],
    notCaptured: null,
    simulatedData: null,
  });
  return out;
};

// ---------------------------------------------------------------- 13 pane-dock
SCENES["pane-dock"] = async (s) => {
  const M = "pane-dock";
  const out = { removed: removeOld(M) };
  const CENTER_CLIP = { x: 264, y: 0, width: 1176, height: 900 }; // center only on both sides
  out.base0 = await base(s, "", { terminal: true, active: "canvas" }); // creates the local terminal with the mod
  await base(s, "pane-dock", { terminal: true, active: "canvas" });
  out.beforeTabs = (await centerTabs(s)).map((t) => t.text);
  await kit.shot(s, EV(M, "01-before.png"), { clip: CENTER_CLIP });
  await base(s, "", { terminal: true, active: "canvas" });
  const canvasTab = `${CENTER} [role="tab"][data-tab-id^="canvas-${CHAT_MAIN}"][data-tab-id$="/${CANVAS}"]`;
  const termTab = `${CENTER} [role="tab"][data-tab-id^="terminal-"]`;
  // 05: split preview while dragging (no drop)
  await dragTab(s, canvasTab, { x: 1330, y: 470 }, { drop: false, steps: 10, ms: 200 });
  await sleep(300);
  await kit.shot(s, EV(M, "05-split-preview.png"));
  await s.page.evaluate(() => { window.__qaDrag.end(0, 0); });
  await s.page.keyboard.press("Escape");
  await sleep(600);
  out.r03 = await rec(s, M, "03-drag-tab-split", async () => {
    await kit.caption(s, "Drag a tab to a pane edge to open a new pane");
    const t = (await centerTabs(s)).find((x) => x.id.startsWith(`canvas-${CHAT_MAIN}`) && x.id.endsWith(`/${CANVAS}`));
    await kit.moveTo(s, t.x + t.w / 2, t.y + t.h / 2, { ms: 500 });
    await sleep(300);
    out.d1 = await dragTab(s, canvasTab, { x: 1330, y: 470 }, { steps: 26, ms: 1100, hold: 900 });
    await sleep(1400);
    const right = (await panels(s))[0];
    await kit.caption(s, "Drop at the bottom of a pane for a nested split");
    const tt = (await centerTabs(s)).find((x) => x.id.startsWith("terminal-"));
    if (tt && right) {
      await kit.moveTo(s, tt.x + tt.w / 2, tt.y + tt.h / 2, { ms: 500 });
      await sleep(300);
      out.d2 = await dragTab(s, termTab, { x: right.rect.x + right.rect.width / 2, y: right.rect.y + right.rect.height * 0.9 }, { steps: 26, ms: 1100, hold: 900 });
      await sleep(1400);
    }
    await kit.caption(s, "Drag the divider to resize");
    const div = await s.page.evaluate(() => {
      const d = [...document.querySelectorAll(".rtd-divider")].filter((n) => n.offsetWidth || n.offsetHeight).map((n) => n.getBoundingClientRect()).sort((a, b) => b.height - a.height)[0];
      return d ? { x: d.x + d.width / 2, y: d.y + d.height / 2 } : null;
    });
    if (div) {
      await kit.moveTo(s, div.x, div.y + 120, { ms: 500 });
      await s.page.mouse.down();
      await kit.moveTo(s, div.x - 170, div.y + 120, { ms: 900 });
      await kit.moveTo(s, div.x - 110, div.y + 120, { ms: 400 });
      await s.page.mouse.up();
      await sleep(900);
    }
    await kit.caption(s, null);
  });
  out.panels = await panels(s);
  await kit.moveTo(s, 600, 880, { ms: 200 }); // move the mouse off the divider
  await sleep(600);
  await kit.shot(s, EV(M, "02-after.png"), { clip: CENTER_CLIP });
  // 04: ⌘Z / ⌘⇧Z on the layout. The chat composer takes focus when the chat remounts
  // (then the mod leaves ⌘Z to the text field, on purpose): before each key press focus
  // leaves the field (blur, no click: a click at the end of the bar lands on a tab's ×).
  const blur = () => s.page.evaluate(() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); });
  const hist = () => s.page.evaluate(() => { const d = window.__RE_TEMPO_PANE_DOCK__; return { panels: d.panels.length, ...(d.history || {}) }; });
  out.h0 = await hist();
  out.r04 = await rec(s, M, "04-undo-redo-layout", async () => {
    await kit.moveTo(s, 760, 300, { ms: 300 });
    await kit.caption(s, "⌘Z undoes layout changes, one step at a time");
    await sleep(900);
    for (let i = 0; i < 4 && (await hist()).panels > 0; i++) { await blur(); await kit.press(s, "Meta+Z"); await sleep(1500); }
    out.h1 = await hist();
    await kit.caption(s, "⌘⇧Z redoes them");
    await sleep(600);
    for (let i = 0; i < 4 && (await hist()).redo > 0; i++) { await blur(); await kit.press(s, "Meta+Shift+Z"); await sleep(1800); }
    await sleep(600);
    out.h2 = await hist();
    await kit.caption(s, null);
  });
  out.historyBefore = out.h0.panels;
  out.afterUndo = out.h1.panels;
  out.afterRedo = out.h2.panels;
  await s.page.evaluate(() => window.__RE_TEMPO_PANE_DOCK__.reset());
  await sleep(600);
  const files = [
    { file: "01-before.png", caption: "Before: the center shows one view at a time; chat, canvas and terminal are tabs (all mods except pane-dock, center only)." },
    { file: "02-after.png", caption: "After: chat on the left, canvas and terminal stacked on the right, each pane with its own tab bar." },
    { file: "03-drag-tab-split.gif", caption: "Dragging the canvas tab to the right edge, the terminal to the bottom of that pane, then resizing with the divider." },
    { file: "03-drag-tab-split.mp4", caption: "Dragging the canvas tab to the right edge, the terminal to the bottom of that pane, then resizing with the divider." },
  ];
  const undoOk = out.afterUndo === 0 && out.afterRedo === out.historyBefore && out.h1.redo >= 2;
  if (undoOk) {
    files.push({ file: "04-undo-redo-layout.gif", caption: "⌘Z undoes the two splits one step at a time; ⌘⇧Z redoes them." });
    files.push({ file: "04-undo-redo-layout.mp4", caption: "⌘Z undoes the two splits one step at a time; ⌘⇧Z redoes them." });
  } else {
    for (const f of ["04-undo-redo-layout.gif", "04-undo-redo-layout.mp4"]) { const p = path.join(kit.REPO, EV(M, f)); if (fs.existsSync(p)) fs.unlinkSync(p); }
  }
  files.push({ file: "05-split-preview.png", caption: "While dragging, the target half of the pane is outlined before you drop (\"New split\")." });
  out.undoOk = undoOk;
  out.index = kit.writeIndex(M, {
    title: "Free-form panes in the center",
    summary: "The center of the app can now be split into as many panes as you want, like a code editor. Drag a tab to the edge of a pane to open a new pane beside or below it, or drop it on another pane's tab bar to move it. Dividers can be dragged, each pane has its own tab bar and +, and ⌘Z undoes layout changes.",
    shortcut: "Drag a tab to a pane edge; ⌘Z / ⌘⇧Z (undo / redo layout)",
    login: true,
    files,
    notCaptured: null,
    simulatedData: null,
  });
  return out;
};

// ---------------------------------------------------------------- 17 sidebar-chats
SCENES["sidebar-chats"] = async (s) => {
  const M = "sidebar-chats";
  const out = { removed: removeOld(M) };
  const CLIP = { x: 0, y: 0, width: 1240, height: 800 }; // includes the new chat tab in the bar
  // the group's folded/unfolded state lives in the mod's localStorage: start unfolded
  await kit.setSkip(s, "project-sidebar");
  await s.page.evaluate(([k, gk]) => {
    try { localStorage.setItem(k, JSON.stringify(JSON.parse(localStorage.getItem(k) || "[]").filter((x) => x !== gk))); } catch (_) {}
  }, ["re-tempo:sidebar-chats:collapsed:v1", `${WS_BUTIA}\u0000${CHAT_BUTIA}`]);
  await kit.reload(s);
  await butiaBase(s, "project-sidebar", { active: "chat" });
  const parentRow = `[data-testid="workspace-chat-${WS_BUTIA}-${CHAT_BUTIA}"]`;
  out.leak0 = await leak(s);
  await scrollTo(s, parentRow);
  await sleep(500);
  const before = await s.page.evaluate(() => window.__qaWs()().centerTabs.map((t) => t.id));
  await capTop(s, 104, 620);
  out.r03 = await rec(s, M, "03-new-chat-nested", async () => {
    await kit.caption(s, "Open a new chat from the + (a draft, nothing is sent)");
    await kit.clickSel(s, PLUS);
    await sleep(1400);
    await kit.clickSel(s, '.rnp-card[data-rnp-kind="chat"]');
    await sleep(1500);
    await kit.caption(s, "It shows up in the sidebar, nested under its parent chat");
    await kit.highlight(s, "[data-rsc-child]");
    await sleep(2000);
    await kit.highlight(s, null);
    await kit.caption(s, "The arrow folds and unfolds the nested chats");
    const tog = "[data-rsc-handle] button.rsc-toggle";
    const expanded = () => s.page.evaluate((q) => document.querySelector(q)?.getAttribute("aria-expanded"), tog);
    if (await kit.rectOf(s, tog)) {
      await kit.clickSel(s, tog);          // fold
      await sleep(1200);
      out.folded = await expanded();
      await kit.clickSel(s, tog);          // unfold (rect re-read: the button changes width)
      await sleep(1200);
      out.unfolded = await expanded();
      if (out.unfolded !== "true") { await kit.clickSel(s, tog); await sleep(900); out.unfolded2 = await expanded(); }
    }
    await kit.caption(s, null);
  }, { clip: CLIP, gifWidth: 1100 });
  const created = await s.page.evaluate((b) => window.__qaWs()().centerTabs.filter((t) => !b.includes(t.id) && t.type === "chat").map((t) => ({ id: t.id, name: t.name, owner: t.ownerChatTabId })), before);
  out.created = created;
  if ((await s.page.evaluate(() => document.querySelector("[data-rsc-handle] button.rsc-toggle")?.getAttribute("aria-expanded"))) === "false") {
    await kit.clickSel(s, "[data-rsc-handle] button.rsc-toggle");
    await sleep(800);
  }
  out.r04 = await rec(s, M, "04-move-to-pane-badge", async () => {
    await kit.caption(s, "Moved to a pane, the row gets a badge for where it lives");
    const nt = created[0] && (await centerTabs(s)).find((x) => x.id === created[0].id);
    if (nt) {
      await kit.moveTo(s, nt.x + nt.w / 2, nt.y + nt.h / 2, { ms: 450 });
      out.d = await dragTab(s, `${CENTER} [role="tab"][data-tab-id="${nt.id}"]`, { x: 1330, y: 470 }, { steps: 22, ms: 900, hold: 700 });
      await sleep(1500);
      await kit.highlight(s, "[data-rsc-child]");
      await sleep(1800);
      await kit.highlight(s, null);
    }
    await kit.caption(s, "Click a row to jump straight to that chat");
    await kit.clickSel(s, parentRow);
    await sleep(900);
    await kit.clickSel(s, "[data-rsc-child]");
    await sleep(1300);
    await kit.caption(s, null);
  }, { clip: CLIP, gifWidth: 1100 });
  out.rows = await s.page.evaluate(() => window.__RE_TEMPO_SIDEBAR_CHATS__.state().rows);
  const cr = await kit.rectOf(s, "[data-rsc-child]");
  if (cr) await kit.shot(s, EV(M, "05-window-badge.png"), { clip: { x: 52, y: Math.max(40, cr.y - 96), width: 280, height: 150 }, scale: 2 });
  // no pane: 01/02 with the same layout
  await s.page.evaluate(() => window.__RE_TEMPO_PANE_DOCK__ && window.__RE_TEMPO_PANE_DOCK__.reset());
  await sleep(900);
  if (created[0]) { await s.page.evaluate((id) => window.__qaWs()().setActiveCenterTab(id), created[0].id); await sleep(800); }
  await scrollTo(s, parentRow);
  await sleep(500);
  await kit.shot(s, EV(M, "02-after.png"), { clip: CLIP });
  await butiaBase(s, "project-sidebar,sidebar-chats", { active: "chat" });
  out.leak01 = await leak(s);
  if (created[0]) { await s.page.evaluate((id) => window.__qaWs()().setActiveCenterTab(id), created[0].id); await sleep(800); }
  await scrollTo(s, parentRow);
  await sleep(500);
  await kit.shot(s, EV(M, "01-before.png"), { clip: CLIP });
  // cleanup: close the draft(s) created in this scene (empty, never sent)
  out.closed = await s.page.evaluate(async (ids) => {
    const st = () => window.__qaWs()();
    const done = [];
    for (const id of ids) {
      const t = st().centerTabs.find((x) => x.id === id);
      if (t && t.ownerChatTabId && !t.sessionId) { st().closeDiffTab(id); done.push(id); }
    }
    await new Promise((r) => setTimeout(r, 600));
    return done;
  }, created.map((c) => c.id));
  const files = [
    { file: "01-before.png", caption: "Before: the new chat is open in the tab bar but missing from the Chats sidebar." },
    { file: "02-after.png", caption: "After: the same chat nested under its parent chat, with workspace cards." },
    { file: "03-new-chat-nested.gif", caption: "A new chat opened from the + appears nested under its parent; the arrow folds and unfolds it." },
    { file: "03-new-chat-nested.mp4", caption: "A new chat opened from the + appears nested under its parent; the arrow folds and unfolds it." },
    { file: "04-move-to-pane-badge.gif", caption: "Moving the chat into a pane adds a \"window\" badge; clicking the row jumps to the chat." },
    { file: "04-move-to-pane-badge.mp4", caption: "Moving the chat into a pane adds a \"window\" badge; clicking the row jumps to the chat." },
  ];
  if (cr) files.push({ file: "05-window-badge.png", caption: "Close-up: the nested draft chat with its \"window\" badge." });
  out.index = kit.writeIndex(M, {
    title: "Every chat tab in the Chats sidebar",
    summary: "Chats opened from the + in the tab bar, in split view, in a window or pane, or in CLI mode used to show only in the tab bar. Now each one appears in the Chats sidebar, nested under the chat it came from. Rows show status, provider, a badge for where the chat lives (split, window, CLI) and the time.",
    shortcut: null,
    login: true,
    files,
    notCaptured: null,
    simulatedData: null,
  });
  return out;
};

export const ORDER = ["project-sidebar", "title-crumb", "rail-menu", "new-page", "tab-close", "pane-dock", "sidebar-chats"];

// ------------------------------------------------------------ CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const want = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const list = want.length ? want : ORDER;
  ensureCanvas();
  const s = await kit.open({ profile: PROFILE });
  const results = {};
  try {
    for (const m of list) {
      console.log(`== ${m}`);
      try { results[m] = await SCENES[m](s); } catch (e) { results[m] = { error: String((e && e.stack) || e) }; }
      console.log(JSON.stringify(results[m], null, 1));
    }
    console.log("cleanup", JSON.stringify(await cleanup(s).catch((e) => String(e))));
  } finally {
    await kit.close(s);
  }
}

export { ensureCanvas, base, inject, CAPTURED, leak as leakCheck };
