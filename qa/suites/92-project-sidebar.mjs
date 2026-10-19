// qa/suites/92-project-sidebar.mjs - the project-oriented sidebar (feature/project-sidebar.js):
// one tree Project > Branches (chats) + Canvases + Docs + Issues + Agents over the hidden rail.
// -----------------------------------------------------------------------------
// Run (needs a logged-in profile created by login.mjs):
//   cd qa && node run.mjs --suite 92-project-sidebar --profile qa-1
// Without a logged-in profile every test ends as SKIP ("skip: needs a logged-in profile").
// If index.html does not load the mod yet, the suite injects feature/project-sidebar.{css,js}
// into the QA instance only (never the user's window on CDP 9333).
//
// SCENARIO
//   1) layout, in each of the 5 routes: rail | sidebar | workspace with no overlap and nothing
//      cut at the right edge (the workspace panel group is pushed right and shrinks), rail footer
//      kept, the rail's 5 route buttons hidden while the mod is on (html.rtps-on, collapsed or
//      expanded; the user's call), no mod group on the rail while the sidebar is on screen (search
//      and "+" in the sidebar's top), native route sidebars hidden by default (chat/agents
//      left panel, docs-view-sidebar, issues-views-sidebar, canvas-sidebar); the tree lists the
//      store's projects, cards and chats;
//   2) navigation, each through the app's own actions (checked in the store and in the mod's
//      navLog): chat row -> selectWorkspaceChat; project row -> design home of that project
//      with the workspace and chat unchanged; first canvas -> onOpenCanvas/openDesignTab;
//      first doc / issue / agent row -> its route + the app's open callback; a secondary
//      chat (a sibling row, never nested) -> selectWorkspaceChat; finally the original chat
//      is selected again (no route shortcuts in the sidebar any more: the top is the search
//      and one "Add project" button);
//   3) only this sidebar exists (no switch, no other modes): the app's "Toggle left panel" button
//      collapses the sidebar (workspace takes the width back: nothing is left on the left, no rail
//      and no mod group, the workspace runs to the edge) and expands it again; ⌘⇧E focuses the
//      sidebar's search and changes nothing else (no flag, no classic layout, no switch);
//   4) the native split ("Open in split view"; only when the active chat already has a non-chat
//      tab: the app's moveActiveTabIntoSplit, no clone, left again at the end; else SKIP): each
//      side is its own pane in the tree (data-pane main:left / main:right, a side's rows
//      consecutive and linked, never linked across sides or into a dock pane, one visible row per
//      side), hovering a right-side row flashes that side only, and a click brings the tab forward
//      on its side through setPanelActiveTab with the split kept;
//   5) tab drop on a project's "+" (pane-dock's dropToNewWorkspace; SKIP without it): during a
//      tab drag every project "+" shows, over one it accepts the drop and opens a "New workspace"
//      pill (synthetic drag events on the sidebar only, never a drop); the dock's news
//      (rtd:workspace-created) about the current worktree gives its card the accent outline;
//   6) the tree's right-click menus (project, worktree) open with their items and close (nothing run);
//   7) the mod only ran read queries (queryLog) and nothing threw.
// Nothing is created in the account. Screenshots carry account data and stay in
// /tmp/tempo-qa/runs (0700).
// -----------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { getStore } from "./20-home/lib.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FEATURE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../feature");
const READ_QUERIES = [
  "docs:getDocsTree",
  "artifact_links:getLinksForDoc",
  "issues:getBoard",
  "issues:getIssues",
  "artifact_links:getBranchIssueLinksForOrg",
  "agents:listAgentsInOrg",
  "agents:listMyAgents",
  "sourceRepo:getProjectCanvases",
];

function softSkip(ctx, reason) {
  const { rec, checker } = ctx;
  console.log(`[92-project-sidebar] ${reason}`);
  rec.notes = reason;
  rec.skip = reason;
  checker.ok(true, reason);
  Object.defineProperty(rec, "status", { get: () => "skip", set: () => {}, enumerable: true, configurable: true });
}

async function waitFor(fn, ms = 10000, step = 200) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(step);
  }
}

const ev = (page, fn, arg) => page.evaluate(fn, arg);
const api = (page) => ev(page, () => window.__RE_TEMPO_PROJECT_SIDEBAR__.state());

// Tab drop on a project's "+" (in-page probes of the tab-drop-new-workspace test). Synthetic drag
// events with a real DataTransfer, on the sidebar only (outside the app's React root), and never a
// drop: nothing reaches the dock, nothing is created. The dock's canDropToNewWorkspace() answers
// for its own drag; with none going on it answers true for the probe only (put back by the end
// probe). The pill is left open for the screenshot.
const dropPillProbe = async () => {
  const dock = window.__RE_TEMPO_PANE_DOCK__;
  if (!dock || typeof dock.dropToNewWorkspace !== "function") return { skip: "pane-dock has no dropToNewWorkspace" };
  const btn = document.querySelector('.rtps-tree .rtps-project > [data-row-act="newWorktree"]');
  const spot = document.querySelector(".rtps-head");
  if (!btn || !spot) return { skip: "no project + on screen" };
  window.__QA_DROP_PROBE__ = { had: Object.prototype.hasOwnProperty.call(dock, "canDropToNewWorkspace"), orig: dock.canDropToNewWorkspace };
  try {
    dock.canDropToNewWorkspace = () => true;
  } catch (_) {}
  if (dock.canDropToNewWorkspace() !== true) return { skip: "canDropToNewWorkspace could not be answered for the probe" };
  const dt = new DataTransfer();
  dt.setData("application/x-tempo-view-tab", JSON.stringify({ id: "qa:probe", kind: "chat" }));
  const fire = (type, el) => {
    const r = el.getBoundingClientRect();
    const e = new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    el.dispatchEvent(e);
    return e.defaultPrevented;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  fire("dragenter", spot);
  fire("dragover", spot);
  await wait(200);
  const shown = { drag: document.querySelector(".rtps-tree").hasAttribute("data-tab-drag"), opacity: getComputedStyle(btn).opacity };
  fire("dragenter", btn);
  const accepted = fire("dragover", btn);
  await wait(260);
  const pc = getComputedStyle(btn, "::before");
  return { shown, hot: { accepted, drop: btn.getAttribute("data-drop"), content: pc.content, opacity: pc.opacity, outline: `${pc.borderTopWidth} ${pc.borderTopStyle}` } };
};
const dropEndProbe = () => {
  const dock = window.__RE_TEMPO_PANE_DOCK__;
  window.dispatchEvent(new DragEvent("dragend"));
  const saved = window.__QA_DROP_PROBE__;
  if (dock && saved) {
    try {
      if (saved.had) dock.canDropToNewWorkspace = saved.orig;
      else delete dock.canDropToNewWorkspace;
    } catch (_) {}
  }
  delete window.__QA_DROP_PROBE__;
  const tree = document.querySelector(".rtps-tree");
  return { drag: !!tree && tree.hasAttribute("data-tab-drag"), drops: document.querySelectorAll(".rtps-tree [data-drop]").length, state: window.__RE_TEMPO_PROJECT_SIDEBAR__.dropNew() };
};
// The tree's right-click menus (project, worktree), opened with a synthetic contextmenu on the rows
// and closed with Esc: their items are read, nothing is run (no action reaches the app).
const ctxMenuProbe = async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fire = (el) => {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + r.height / 2, button: 2 }));
  };
  const menu = () => document.querySelector(".rtps-ctx-menu:not([data-sub])");
  const read = () => {
    const m = menu();
    return m ? Array.from(m.children).map((c) => (c.classList.contains("rtps-ctx-sep") ? "—" : (c.querySelector(".rtps-ctx-label") || c).textContent + (c.getAttribute("aria-disabled") ? "[x]" : ""))) : null;
  };
  const esc = async () => {
    const m = menu();
    if (m) (m.querySelector(".rtps-ctx-item") || m).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await wait(80);
  };
  const proj = document.querySelector('.rtps-tree .rtps-row[data-kind="project"]');
  if (!proj) return { skip: "no project row" };
  fire(proj);
  await wait(150);
  const project = read();
  await esc();
  const heads = Array.from(document.querySelectorAll(".rtps-tree .rtps-card > .rtps-cardhead"));
  const st = window.__QA_WS_STORE__ && window.__QA_WS_STORE__.getState();
  const isLocal = (h) => { const id = h.closest(".rtps-card").dataset.pkey.replace(/^card:w:/, ""); const w = st && st.workspaces.find((x) => String(x.id) === id); return !!(w && w.mode === "local"); };
  const local = heads.find(isLocal);
  let primary = null;
  if (local) {
    fire(local);
    await wait(150);
    primary = read();
    await esc();
  }
  const other = heads.find((h) => !isLocal(h));
  let worktree = null;
  if (other) {
    fire(other);
    await wait(150);
    worktree = read();
    await esc();
  }
  return { project, primary, worktree, left: document.querySelectorAll(".rtps-ctx-menu").length };
};

// The dock's news about a worktree already on screen (the current one): its card gets the accent
// outline only (rtps-card-ring) for ~1.9 s, then it is the normal card again.
const dropRingProbe = async () => {
  const ws = String(window.__QA_WS_STORE__.getState().selectedWorkspaceId);
  const sel = `.rtps-card[data-pkey="card:w:${CSS.escape(ws)}"]`;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!document.querySelector(sel)) return { ws, skip: "the current worktree's card is not on screen" };
  window.dispatchEvent(new CustomEvent("rtd:workspace-created", { detail: { wsId: ws, name: "qa", tabId: "qa:probe", moved: true } }));
  await wait(120);
  const c = document.querySelector(sel);
  const during = c ? { cls: c.className, anims: c.getAnimations().map((a) => a.animationName || "waapi") } : null;
  await wait(2200);
  const a = document.querySelector(sel);
  return { ws, during, after: a ? a.className : null };
};
const rows = (page) => ev(page, () => window.__RE_TEMPO_PROJECT_SIDEBAR__.rows());
const lastNav = (page) => ev(page, () => window.__RE_TEMPO_PROJECT_SIDEBAR__.navLog.slice(-1)[0] || null);

async function clickKey(page, key) {
  const loc = page.locator(`.rtps-row[data-key="${key.replace(/"/g, '\\"')}"] .rtps-label`);
  if (!(await loc.count())) return false;
  await loc.first().click();
  await sleep(600);
  return true;
}

const sharedByPage = new WeakMap(); // state carried between the tests of one target
let shared = null;

async function setup(ctx) {
  const { page, lib, rec } = ctx;
  shared = sharedByPage.get(page) || null;
  if (shared) return shared.ok;
  shared = { ok: false };
  sharedByPage.set(page, shared);
  const seen = await lib.ui.waitForScreen(page, ["home", "auth"], { timeoutMs: 120000, stableMs: 4000 });
  const loaded = await ev(page, () => !!window.__RE_TEMPO_PROJECT_SIDEBAR__);
  if (!loaded) {
    await page.addStyleTag({ content: fs.readFileSync(path.join(FEATURE, "project-sidebar.css"), "utf8") });
    await page.addScriptTag({ content: fs.readFileSync(path.join(FEATURE, "project-sidebar.js"), "utf8") });
    shared.injected = true;
  }
  if (seen.screen !== "home") {
    // signed out: the mod must stay idle (no rail on screen, nothing hidden, no error)
    await sleep(1500);
    shared.idle = await ev(page, () => ({ root: !!document.querySelector(".rtps:not([hidden])"), hidden: document.querySelectorAll("[data-rtps-hidden],[data-rtps-rail]").length }));
    shared.idle.exceptions = ctx.collectors.exceptions.length;
    shared.idle.injectedBySuite = !!shared.injected;
    rec.signedOutIdle = shared.idle;
    return false;
  }
  await ev(page, () => window.__RE_TEMPO_PROJECT_SIDEBAR__.enabled || window.__RE_TEMPO_PROJECT_SIDEBAR__.setEnabled(true));
  const ready = await waitFor(() => ev(page, () => window.__RE_TEMPO_PROJECT_SIDEBAR__.ready), 20000, 300);
  if (!ready) return false;
  await waitFor(() => ev(page, () => window.__RE_TEMPO_PROJECT_SIDEBAR__.state().remote.status.docs !== "loading"), 15000, 500);
  shared.start = await api(page);
  shared.ok = true;
  return true;
}

export default {
  name: "92-project-sidebar",
  tests: [
    {
      name: "layout-and-tree",
      async fn(ctx) {
        const { page, checker, rec, lib, instDir } = ctx;
        if (!(await setup(ctx))) return softSkip(ctx, `skip: needs a logged-in profile${shared && shared.idle ? ` (signed out, mod idle: ${JSON.stringify(shared.idle)})` : ""}`);
        const s = shared.start;
        rec.notes = `mod ${shared.injected ? "injected by the suite" : "loaded by index.html"}; org ${s.org ? "set" : "missing"}`;
        checker.ok(s.store, "workspaces store found");
        checker.ok(s.client, "logged-in Convex client found");
        // rail | sidebar | workspace in every route: no overlap, rail footer kept
        const layoutAt = () =>
          ev(page, () => {
            const r = (sel) => {
              const e = document.querySelector(sel);
              return e ? e.getBoundingClientRect().toJSON() : null;
            };
            const rail = document.querySelector('[data-testid="workspace-navbar"]');
            const shown = (e) => { const b = e.getBoundingClientRect(); return getComputedStyle(e).display !== "none" && b.width > 0 && b.height > 0 && !e.closest("[class*='content-visibility:hidden']"); };
            const native = ['[data-tempo-workspace-panel="left"]', '[data-testid="docs-view-sidebar"]', "#issues-views-sidebar", '[data-testid="issues-sidebar"]', '[data-testid="canvas-sidebar"]'];
            const group = document.querySelector("[data-rtps-push]");
            return {
              win: innerWidth,
              groupRight: group ? group.getBoundingClientRect().right : null,
              nativeShown: native.filter((sel) => Array.from(document.querySelectorAll(sel)).some(shown)),
              layout: window.__RE_TEMPO_PROJECT_SIDEBAR__.state().layout,
              side: r(".rtps:not([hidden])"),
              rail: r('[data-testid="workspace-navbar"]'),
              center: r('[data-tempo-workspace-panel="center"]'),
              railVis: rail ? getComputedStyle(rail).visibility : null,
              railHidden: document.documentElement.classList.contains("rtps-rail-hidden"),
              foot: (() => { const f = document.querySelector("#rtd-project-sidebar .rtps-foot"); return f ? { host: !!f.querySelector("[data-rtu-rings-host]"), row: !!f.querySelector(".rtps-foot-row"), btns: f.querySelectorAll("button").length } : null; })(),
              tools: (() => { const t = document.querySelectorAll(".rtps-titlebar-tools"); const x = t[0]; return { n: t.length, afterSwitch: !!x && !!x.previousElementSibling && (x.previousElementSibling.matches('button[aria-label="Forward"], button[aria-label="Toggle left panel"]') || !!x.previousElementSibling.querySelector('button[aria-label="Forward"], button[aria-label="Toggle left panel"]')), switches: document.querySelectorAll("button.rtps-switch").length, btns: x ? Array.from(x.children).map((b) => b.dataset.act) : [] }; })(),
              rtpsOn: document.documentElement.classList.contains("rtps-on"),
              routeBtns: ["chat", "docs", "design", "issues", "agents"].map((x) => {
                const b = document.querySelector(`[data-testid="workspace-navbar-${x}-button"]`);
                return b ? getComputedStyle(b).display : "absent";
              }),
              railButtonsLeft: rail ? Array.from(rail.querySelectorAll("button")).filter((b) => b.getBoundingClientRect().width > 0).length : 0,
            };
          });
        const perRoute = {};
        for (const route of ["chat", "docs", "design", "issues", "agents"]) {
          await ev(page, (r) => window.__RE_TEMPO_PROJECT_SIDEBAR__.open.route(r), route);
          await sleep(1200);
          const L = await layoutAt();
          perRoute[route] = L;
          const ok = L.layout === "pushed" && L.side && L.rail && L.center && L.side.left >= L.rail.right - 1 && L.center.left >= L.side.right - 1 && L.groupRight <= L.win + 1 && L.center.right <= L.win + 1;
          checker.ok(ok, `${route}: rail | sidebar | workspace, no overlap, nothing cut on the right`, JSON.stringify({ layout: L.layout, rail: L.rail && L.rail.right, side: L.side && [L.side.left, L.side.right], center: L.center && [L.center.left, L.center.right], win: L.win }));
          checker.ok(L.nativeShown.length === 0, `${route}: native route sidebar hidden (default)`, L.nativeShown.join(","));
        }
        rec.layout = perRoute;
        const lay = perRoute.chat;
        checker.ok(lay.railHidden, "expanded + mod on: html.rtps-rail-hidden (the native rail hides, the panel has its own footer)", lay.railHidden);
        checker.ok(lay.foot && lay.foot.host && !lay.foot.row && lay.foot.btns === 0, "footer: the usage rings host only (no Settings / account row)", JSON.stringify(lay.foot));
        checker.ok(lay.tools.n === 1 && lay.tools.afterSwitch && lay.tools.switches === 0 && lay.tools.btns.join() === "settings,account", "title bar: no sidebar switch; one .rtps-titlebar-tools right after the back / forward arrows, Settings + account", JSON.stringify(lay.tools));
        checker.ok(lay.rtpsOn && lay.routeBtns.every((d) => d === "none" || d === "absent"), "panel placed (html.rtps-placed): the rail's 5 route buttons are off screen (a failed push brings them back with the compact group)", lay.routeBtns.join(","));
        await ev(page, (a) => (a.ws && a.chat ? window.__RE_TEMPO_PROJECT_SIDEBAR__.open.chat(a.ws, a.chat) : window.__RE_TEMPO_PROJECT_SIDEBAR__.open.route("chat")), s);
        await sleep(600);
        const model = await ev(page, () => {
          const m = window.__RE_TEMPO_PROJECT_SIDEBAR__.model();
          return m && { projects: m.projects.map((p) => ({ id: p.id, branches: p.branches.length, chats: p.branches.reduce((n, b) => n + b.chats.length, 0), canvases: p.canvases.length, docs: p.docs.length, issues: p.issues.length, agents: p.agents.length, opid: !!p.orgProjectId })), org: { docs: m.org.docs.length, issues: m.org.issues.length, agents: m.org.agents.length } };
        });
        rec.model = model;
        checker.ok(model && model.projects.length > 0, "tree lists at least one project", model && model.projects.length);
        const R = await rows(page);
        checker.equal(R.filter((r) => r.kind === "project").length, model.projects.length, "one project row per project");
        checker.ok(await ev(page, () => !!document.getElementById("rtd-project-sidebar")), "root id rtd-project-sidebar (sidebar-chats contract)");
        // the sidebar (Orca layout): the search on top, then the "Projects" head with its actions
        // (bell when Agent Runs is loaded, Add project, New worktree), then the tree; no other button
        // outside the tree (an allow-list: nothing can come back unnoticed).
        const head = await ev(page, () => {
          const root = document.getElementById("rtd-project-sidebar");
          const h = root && root.querySelector(".rtps-head");
          return root && {
            head: !!h,
            label: h ? (h.querySelector(".rtps-head-label") || {}).textContent : null,
            actions: h ? Array.from(h.querySelectorAll(".rtps-head-actions > button.rtps-icon-btn")).map((b) => b.dataset.act) : [],
            foot: !!root.querySelector(".rtps-foot"),
            chrome: Array.from(root.querySelectorAll("button")).filter((b) => !b.closest(".rtps-tree, .rtps-menu")).map((b) => b.dataset.act || "?"),
            top: Array.from(root.querySelectorAll(".rtps-top > *")).map((e) => e.className),
            agentRuns: !!window.__RE_TEMPO_AGENT_RUNS__,
          };
        });
        rec.head = head;
        const wantActs = (head && head.agentRuns ? ["bell"] : []).concat(["add-project", "new-worktree"]).join();
        checker.ok(head && head.head && head.label === "Projects" && head.actions.join() === wantActs && head.chrome.join() === wantActs && head.foot && head.top.join() === "rtps-search", "sidebar: search, 'Projects' with bell / Add project / New worktree, the tree, the footer (rings host); nothing else", JSON.stringify(head));
        // the rail: no mod group while the sidebar is on screen (it is the sidebar's collapsed form)
        const railGroup = await ev(page, () => ({ groups: document.querySelectorAll("[data-rtps-rail-group]").length }));
        rec.railGroup = railGroup;
        checker.equal(railGroup.groups, 0, "expanded: no mod group on the rail (nothing duplicated)");
        // Orca structure: one card per branch of every expanded project, chats with a known status
        const orca = await ev(page, () => {
          const ps = window.__RE_TEMPO_PROJECT_SIDEBAR__;
          const m = ps.model();
          for (const p of m.projects) {
            ps.expand(`p:${p.id}`, true);
            for (const b of p.branches) ps.expand(`b:${b.id}`, true);
          }
          return new Promise((res) =>
            setTimeout(() => {
              const cards = Array.from(document.querySelectorAll(".rtps-card > .rtps-cardhead")).map((r) => r.dataset.key.slice(2));
              const chats = Array.from(document.querySelectorAll(".rtps-row.rtps-chat"));
              res({
                branches: m.projects.reduce((n, p) => n + p.branches.length, 0),
                cards: cards.length,
                primaries: m.projects.reduce((n, p) => n + p.branches.filter((b) => b.local).length, 0),
                badges: document.querySelectorAll(".rtps-card .rtps-badge").length,
                chatRows: chats.length,
                statuses: Array.from(new Set(Array.from(document.querySelectorAll('.rtps-row[data-kind="chat"] .rtps-status')).map((e) => e.dataset.state))),
                // secondary chats listed (sibling rows of their owner, never nested)
                subchats: m.projects.reduce((n, p) => n + p.branches.reduce((k, b) => k + b.chats.filter((c) => c.owner && document.querySelector(`.rtps-row[data-key="${CSS.escape(`c:${b.id}:${c.id}`)}"]`)).length, 0), 0),
                where: Array.from(new Set(Array.from(document.querySelectorAll(".rtps-where")).map((e) => e.textContent))),
                phaseStore: ps.state().phaseStore,
                popoutStore: ps.state().popoutStore,
              });
            }, 400)
          );
        });
        rec.orca = orca;
        checker.equal(orca.cards, orca.branches, "one card per open branch/worktree");
        // the current card mirrors the screen (panels in view, nothing else); "+" per project
        await ev(page, () => window.__RE_TEMPO_PROJECT_SIDEBAR__.open.route("chat"));
        await sleep(800);
        const screen = await ev(page, () => {
          const ps = window.__RE_TEMPO_PROJECT_SIDEBAR__;
          const st = ps.state();
          const card = document.querySelector(".rtps-card[data-current]");
          // the active deck holds what is on screen; an open deck that is not active lists its own rows
          const blk = card && (card.querySelector(".rtps-deckblock[data-active]") || card);
          const head = blk && blk.querySelector(".rtps-chats");
          return {
            viewLive: st.viewLive,
            view: st.view ? st.view.split(",").filter((x) => x.startsWith(st.ws + "|")).length : 0,
            // expanded: the rows; collapsed (deck row / pill): it summarizes the same panels
            listed: blk ? (blk.querySelector('.rtps-pillbox, .rtps-row[data-kind="pill"]') ? st.view.split(",").filter((x) => x.startsWith(st.ws + "|")).length : blk.querySelectorAll(".rtps-chat, .rtps-panel").length) : -1,
            header: head ? (head.querySelector(".rtps-deck-name") ? "deck" : head.querySelector(".rtps-label").textContent) : null,
            drafts: document.querySelectorAll(".rtps-drafts, .rtps-more").length,
            foldableSections: document.querySelectorAll(".rtps-card .rtps-section, .rtps-card .rtps-canvas, .rtps-card .rtps-doc, .rtps-card .rtps-issue").length, // the card is head + decks
            plus: document.querySelectorAll('.rtps-project [data-row-act="newWorktree"]').length,
            projects: ps.model().projects.length,
            current: document.querySelectorAll(".rtps-card[data-current]").length,
          };
        });
        rec.screen = screen;
        checker.ok(screen.viewLive && screen.listed === screen.view && screen.drafts === 0 && (screen.view === 0 || screen.header === "deck" || / on screen$/.test(screen.header || "") || screen.header === null), "current card lists exactly the panels on screen (no drafts row, no 'N more')", JSON.stringify(screen));
        checker.ok(screen.foldableSections === 0, "card = head + decks: no Canvases/Docs/Issues lists inside it");
        checker.ok(screen.plus === screen.projects && screen.current <= 1, "'+' (new worktree) on every project, one current card", JSON.stringify(screen));
        checker.equal(orca.badges, orca.primaries, "primary badge on each main checkout");
        checker.ok(orca.statuses.every((x) => ["done", "running", "unread"].includes(x)), "chat status (done / running / unread) from the phase store", orca.statuses.join(","));
        const st = await api(page);
        rec.remote = st.remote;
        checker.ok(st.remote.status.docs !== "error" && st.remote.status.issues !== "error" && st.remote.status.agents !== "error", "docs/issues/agents queries ok", JSON.stringify(st.remote.errors));
        const shot = await lib.ui.screenshot(page, instDir, "92-project-sidebar");
        if (shot) rec.screenshots.push(shot);
        checker.equal(ctx.collectors.exceptions.length, 0, "no uncaught exception");
      },
    },
    {
      name: "navigation",
      async fn(ctx) {
        const { page, checker, rec, lib, instDir } = ctx;
        if (!(await setup(ctx))) return softSkip(ctx, `skip: needs a logged-in profile${shared && shared.idle ? ` (signed out, mod idle: ${JSON.stringify(shared.idle)})` : ""}`);
        const start = shared.start;
        const m = await ev(page, () => window.__RE_TEMPO_PROJECT_SIDEBAR__.model());
        const p = m.projects.find((x) => x.branches.some((b) => b.chats.length)) || m.projects[0];
        const b = p.branches.find((x) => x.chats.length);
        const visited = [];

        // chat
        if (b) {
          await ev(page, (a) => { const s = window.__RE_TEMPO_PROJECT_SIDEBAR__; s.expand(`p:${a.p}`, true); s.expand(`b:${a.b}`, true); }, { p: p.id, b: b.id });
          await sleep(300);
          const c = b.chats[0];
          await clickKey(page, `c:${b.id}:${c.id}`);
          const s1 = await api(page);
          checker.ok(s1.route === "chat" && s1.ws === b.id && s1.chat === c.id, "chat row selects that workspace + chat", JSON.stringify(s1));
          visited.push("chat");
        }

        // project row (Orca): a click folds / unfolds it, no navigation
        const fold0 = await ev(page, (id) => !!document.querySelector(`.rtps-projkids[data-pkey="pk:p:${id}"]`), p.id);
        await clickKey(page, `p:${p.id}`);
        const fold1 = await ev(page, (id) => !!document.querySelector(`.rtps-projkids[data-pkey="pk:p:${id}"]`), p.id);
        await clickKey(page, `p:${p.id}`);
        const fold2 = await ev(page, (id) => !!document.querySelector(`.rtps-projkids[data-pkey="pk:p:${id}"]`), p.id);
        checker.ok(fold0 !== fold1 && fold2 === fold0, "project row click folds / unfolds the project", JSON.stringify({ fold0, fold1, fold2 }));
        // project -> design home of that project (the mod's open.project), chat kept
        const before = await api(page);
        await ev(page, (id) => window.__RE_TEMPO_PROJECT_SIDEBAR__.open.project(id), p.id);
        await sleep(800);
        const s2 = await api(page);
        const nav2 = await lastNav(page);
        checker.equal(s2.route, "design", "open.project opens the design route");
        checker.ok(nav2 && nav2.kind === "project" && nav2.via === "onSelectionChange", "design home filtered through the canvas sidebar's onSelectionChange", JSON.stringify(nav2));
        checker.ok(s2.ws === before.ws && s2.chat === before.chat, "workspace and chat unchanged after opening the project");
        const sel = await ev(page, () => window.__RE_TEMPO_PROJECT_SIDEBAR__.rows().find((r) => r.kind === "project" && r.selected));
        checker.ok(sel && sel.key === `p:${p.id}`, "project row marked active on its design home", JSON.stringify(sel));
        const s2shot = await lib.ui.screenshot(page, instDir, "92-project-design-home");
        if (s2shot) rec.screenshots.push(s2shot);
        visited.push("project");

        // canvas
        if (p.canvases.length) {
          const c = p.canvases[0];
          await clickKey(page, `v:${p.id}:${c.path}`);
          await sleep(800);
          const nav = await lastNav(page);
          checker.ok(nav && nav.kind === "canvas" && /onOpenCanvas|openDesignTab/.test(nav.via), "canvas row opens the canvas through the app", JSON.stringify(nav));
          visited.push("canvas");
        }

        // a secondary chat on screen, when the account has one: a sibling row (never nested in its owner)
        const subKey = await ev(page, () => {
          const m = window.__RE_TEMPO_PROJECT_SIDEBAR__.model();
          for (const p of m.projects)
            for (const b of p.branches)
              for (const c of b.chats) {
                if (!c.owner) continue;
                const key = `c:${b.id}:${c.id}`;
                const r = document.querySelector(`.rtps-row[data-view-id][data-key="${CSS.escape(key)}"]`);
                if (r && !r.parentElement.closest(".rtps-row")) return key;
              }
          return null;
        });
        if (subKey) {
          await clickKey(page, subKey);
          const nav = await lastNav(page);
          checker.ok(nav && nav.kind === "subchat" && /selectWorkspaceChat|setActiveCenterTab/.test(nav.via), "secondary chat focused through selectWorkspaceChat", JSON.stringify(nav));
          visited.push("subchat");
        }

        // first doc / issue / agent anywhere in the tree (projects first, then Organization)
        const R = await rows(page);
        const first = (kind) => R.find((r) => r.kind === kind);
        for (const [kind, route, re] of [
          ["doc", "docs", /openDocCallback|__tempoDocs/],
          ["issue", "issues", /openIssueCallback|__tempoIssues/],
          ["agent", "agents", /openAgent|row-click/],
        ]) {
          const r = first(kind);
          if (!r) {
            rec[`no_${kind}`] = true;
            continue;
          }
          await clickKey(page, r.key);
          await sleep(800);
          const s = await api(page);
          const nav = await lastNav(page);
          checker.ok(s.route === route && nav && nav.kind === kind && re.test(nav.via), `${kind} row opens it on the ${route} route`, JSON.stringify({ route: s.route, nav }));
          visited.push(kind);
        }

        // back to where the run started
        if (start.ws && start.chat) await ev(page, (a) => window.__RE_TEMPO_PROJECT_SIDEBAR__.open.chat(a.ws, a.chat), start);
        else await ev(page, () => window.__RE_TEMPO_PROJECT_SIDEBAR__.open.route("chat"));
        await sleep(500);
        rec.visited = visited;
        rec.navLog = await ev(page, () => window.__RE_TEMPO_PROJECT_SIDEBAR__.navLog.map((n) => `${n.kind}:${n.via}`));
        checker.equal(ctx.collectors.exceptions.length, 0, "no uncaught exception");
      },
    },
    {
      // The native split ("Open in split view"): each side is its own pane in the sidebar
      // (data-pane main:left / main:right; rows of a side consecutive and linked, the sides not
      // linked to each other or to a dock pane; one visible row per side), the hover flash covers
      // the hovered row's side only, and a click brings a tab forward on its side through the
      // app's setPanelActiveTab (the split stays). Only tabs already there: the active chat's own
      // non-chat tab is moved into the split with the app's moveActiveTabIntoSplit (no clone, no
      // new tab), and the split is left again at the end; without such a tab the test is a SKIP.
      name: "native-split-panes",
      async fn(ctx) {
        const { page, checker, rec, lib, instDir } = ctx;
        if (!(await setup(ctx))) return softSkip(ctx, `skip: needs a logged-in profile${shared && shared.idle ? ` (signed out, mod idle: ${JSON.stringify(shared.idle)})` : ""}`);
        if (!(await getStore(page))) return softSkip(ctx, "skip: workspace store not found");
        await ev(page, () => window.__RE_TEMPO_PROJECT_SIDEBAR__.open.route("chat"));
        await sleep(600);
        const orig = await ev(page, () => {
          const st = window.__QA_WS_STORE__.getState();
          const fam = (st.centerTabs || []).filter((t) => t && (t.id === st.activeChatTabId || t.ownerChatTabId === st.activeChatTabId));
          // a non-chat tab of the active chat that the center bar shows (not lent to a dock pane or a window)
          const shown = (id) => Array.from(document.querySelectorAll('[data-testid="center-panel"] [data-tab-id]')).some((e) => e.getAttribute("data-tab-id") === id && e.getClientRects().length > 0);
          const cand = fam.find((t) => t.type !== "chat" && shown(t.id));
          return { split: st.splitPanelMode === true, act: st.activeCenterTabId, left: st.leftPanelActiveTabId, right: st.rightPanelActiveTabId, cand: cand ? cand.id : null };
        });
        rec.splitStart = orig;
        let entered = false;
        if (!orig.split) {
          if (!orig.cand) return softSkip(ctx, "skip: the active chat has no non-chat tab to move into the split (nothing is created)");
          entered = await ev(page, (id) => {
            const st = window.__QA_WS_STORE__.getState();
            st.setActiveCenterTab(id);
            return window.__QA_WS_STORE__.getState().moveActiveTabIntoSplit() !== false && window.__QA_WS_STORE__.getState().splitPanelMode === true;
          }, orig.cand);
          if (!entered) return softSkip(ctx, "skip: the app did not open the split (moveActiveTabIntoSplit)");
        }
        try {
          const readRows = () =>
            ev(page, () =>
              Array.from(document.querySelectorAll(".rtps-row[data-view-id]")).map((r) => ({ key: r.dataset.key, id: r.dataset.viewId, pane: r.dataset.pane || "", pos: r.dataset.panePos || "", visible: r.dataset.visible })),
            );
          const got = await waitFor(async () => {
            const R = await readRows();
            return R.some((r) => r.pane === "main:left") && R.some((r) => r.pane === "main:right") ? R : null;
          }, 8000, 300);
          rec.splitRows = got;
          checker.ok(!!got, "split: rows of each side carry their own pane (main:left / main:right)", JSON.stringify(got || (await readRows())));
          if (!got) return;
          const idx = (p) => got.map((r, i) => (r.pane === p ? i : -1)).filter((i) => i >= 0);
          const L = idx("main:left");
          const Rt = idx("main:right");
          const contiguous = (a) => a.every((v, k) => k === 0 || v === a[k - 1] + 1);
          checker.ok(contiguous(L) && contiguous(Rt) && Math.max(...L) < Math.min(...Rt), "split: each side's rows consecutive, left side before right side", JSON.stringify({ L, R: Rt }));
          const badLink = got.filter((r, i) => (r.pos === "first" || r.pos === "middle") && (!got[i + 1] || got[i + 1].pane !== r.pane));
          checker.ok(badLink.length === 0, "split: a row linked downwards always links to a row of its own pane (no link across sides or into a dock pane)", JSON.stringify(badLink));
          const vis = (p) => got.filter((r) => r.pane === p && r.visible === "true").length;
          checker.ok(vis("main:left") === 1 && vis("main:right") === 1, "split: one visible row per side", JSON.stringify({ left: vis("main:left"), right: vis("main:right") }));
          // hover a right-side row: the flash covers the right side only
          const right = got[Rt[0]];
          await page.locator(`.rtps-row[data-key="${right.key.replace(/"/g, '\\"')}"] .rtps-label`).first().hover();
          await sleep(250);
          const fl = await ev(page, () => {
            const f = document.querySelector(".rtps-flash-soft");
            const side = document.querySelector('[data-testid="center-panel"] [data-center-panel-pane="right"]');
            const center = document.querySelector('[data-testid="center-panel"]');
            if (!f || !side) return { flash: !!f, side: !!side };
            const a = f.getBoundingClientRect();
            const b = side.getBoundingClientRect();
            return { d: [a.left - b.left, a.top - b.top, b.right - a.right, b.bottom - a.bottom].map((x) => Math.round(x)), w: Math.round(a.width), centerW: Math.round(center.getBoundingClientRect().width) };
          });
          rec.splitFlash = fl;
          checker.ok(fl && fl.d && fl.d.every((x) => x >= 0 && x <= 2) && fl.w < fl.centerW - 20, "split: hovering a right-side row flashes the right side only (its rect, 1px inside), not the whole center", JSON.stringify(fl));
          const shot = await lib.ui.screenshot(page, instDir, "92-native-split-hover");
          if (shot) rec.screenshots.push(shot);
          await page.mouse.move(2, 2);
          // a click on a side's row: that side's own select, the split stays
          const pick = got.find((r) => r.pane === "main:right" && r.visible !== "true") || got.find((r) => r.pane === "main:left" && r.visible !== "true") || right;
          const side = pick.pane === "main:left" ? "left" : "right";
          await clickKey(page, pick.key);
          const after = await ev(page, (s) => {
            const st = window.__QA_WS_STORE__.getState();
            return { split: st.splitPanelMode === true, active: st[`${s}PanelActiveTabId`], nav: window.__RE_TEMPO_PROJECT_SIDEBAR__.navLog.slice(-1)[0] || null };
          }, side);
          rec.splitClick = { pick, side, after };
          checker.ok(after.split && String(after.active) === String(pick.id) && after.nav && after.nav.kind === "split" && after.nav.via === `setPanelActiveTab:${side}`, `split: a click on a ${side}-side row brings it forward on that side (setPanelActiveTab), the split stays`, JSON.stringify(after));
        } finally {
          await ev(page, (o) => {
            const st = window.__QA_WS_STORE__.getState();
            if (o.entered) {
              if (st.splitPanelMode) st.toggleSplitPanelMode();
              const now = window.__QA_WS_STORE__.getState();
              if (o.act && (now.centerTabs || []).some((t) => t.id === o.act)) now.setActiveCenterTab(o.act);
            } else if (st.splitPanelMode) {
              if (o.left) st.setPanelActiveTab("left", o.left);
              if (o.right) window.__QA_WS_STORE__.getState().setPanelActiveTab("right", o.right);
            }
          }, { entered, act: orig.act, left: orig.left, right: orig.right });
          await sleep(400);
        }
        checker.equal(ctx.collectors.exceptions.length, 0, "no uncaught exception");
      },
    },
    {
      // Tab drop on a project's "+" -> new workspace (pane-dock's dropToNewWorkspace does the work
      // on the drop): during a tab drag every project "+" shows; over one it accepts the drop and
      // opens a "New workspace" pill. Synthetic events on the sidebar only, never a drop: nothing
      // is created. Then the dock's news about the current worktree outlines its card for ~1.9 s.
      // Without the dock's API the test is a SKIP.
      name: "tab-drop-new-workspace",
      async fn(ctx) {
        const { page, checker, rec, lib, instDir } = ctx;
        if (!(await setup(ctx))) return softSkip(ctx, `skip: needs a logged-in profile${shared && shared.idle ? ` (signed out, mod idle: ${JSON.stringify(shared.idle)})` : ""}`);
        if (!(await getStore(page))) return softSkip(ctx, "skip: workspace store not found");
        await ev(page, () => window.__RE_TEMPO_PROJECT_SIDEBAR__.open.route("chat"));
        await sleep(600);
        let pill = null;
        try {
          pill = await ev(page, dropPillProbe);
          rec.dropPill = pill;
          if (pill.skip) return softSkip(ctx, `skip: ${pill.skip}`);
          const shot = await lib.ui.screenshot(page, instDir, "92-drop-new-workspace-pill");
          if (shot) rec.screenshots.push(shot);
        } finally {
          rec.dropEnd = await ev(page, dropEndProbe);
        }
        checker.ok(pill.shown.drag && pill.shown.opacity === "1", "tab drag over the sidebar: every project + shows", JSON.stringify(pill.shown));
        checker.ok(pill.hot.accepted && pill.hot.drop === "hot" && pill.hot.content === '"New workspace"' && pill.hot.opacity === "1" && pill.hot.outline === "1px solid", "dragover on a project +: drop accepted, 'New workspace' pill with a 1px accent outline (no drop: nothing created)", JSON.stringify(pill.hot));
        const end = rec.dropEnd;
        checker.ok(!end.drag && end.drops === 0 && end.state.busy === null && end.state.pending === null, "dragend without a drop: the + back to hover-only, the dock never called", JSON.stringify(end));
        const ring = await ev(page, dropRingProbe);
        rec.dropRing = ring;
        if (ring.skip) console.log(`[92-project-sidebar] ${ring.skip}: entrance outline not checked`);
        else checker.ok(ring.during && /\brtps-card-ring\b/.test(ring.during.cls) && ring.during.anims.includes("rtps-card-ring") && ring.after === "rtps-card", "rtd:workspace-created for a card on screen: accent outline (~1.9 s), then the normal card", JSON.stringify(ring));
        checker.equal(ctx.collectors.exceptions.length, 0, "no uncaught exception");
      },
    },
    {
      // The tree's right-click menus: the project's (new workspace, Open in, rename, settings, remove from
      // Tempo) and the worktree's (new chat / canvas / doc / issue / terminal / browser, Open in, copy branch,
      // rename, pin, archive, delete), with the primary checkout's rename / archive / delete disabled. Opened
      // and closed only: nothing is run.
      name: "context-menus",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        if (!(await setup(ctx))) return softSkip(ctx, `skip: needs a logged-in profile${shared && shared.idle ? ` (signed out, mod idle: ${JSON.stringify(shared.idle)})` : ""}`);
        if (!(await getStore(page))) return softSkip(ctx, "skip: workspace store not found");
        await ev(page, () => window.__RE_TEMPO_PROJECT_SIDEBAR__.open.route("chat"));
        await sleep(600);
        const m = await ev(page, ctxMenuProbe);
        rec.contextMenus = m;
        if (m.skip) return softSkip(ctx, `skip: ${m.skip}`);
        const has = (list, ...labels) => !!list && labels.every((l) => list.some((x) => x.startsWith(l)));
        checker.ok(has(m.project, "New workspace", "New worktree from a branch", "Open in", "Rename", "Project settings", "Remove from Tempo"), "project right-click: New workspace, New worktree from a branch, Open in, Rename, Project settings, Remove from Tempo", JSON.stringify(m.project));
        checker.ok(has(m.primary, "New chat", "New terminal", "Open in", "Copy branch") && m.primary.includes("Delete workspace…[x]") && m.primary.includes("Archive workspace[x]"), "primary checkout right-click: the new-tab items and Open in; Archive / Delete disabled", JSON.stringify(m.primary));
        if (m.worktree) checker.ok(has(m.worktree, "New chat", "Open in", "Rename", "Archive workspace", "Delete workspace"), "another worktree's right-click: rename / archive / delete offered", JSON.stringify(m.worktree));
        else console.log("[92-project-sidebar] only the primary checkout: worktree menu checked on it");
        checker.ok(m.left === 0, "Esc closes every menu (nothing run)", String(m.left));
        checker.equal(ctx.collectors.exceptions.length, 0, "no uncaught exception");
      },
    },
    {
      name: "toggle-and-read-only",
      async fn(ctx) {
        const { page, checker, rec, lib, instDir } = ctx;
        if (!(await setup(ctx))) return softSkip(ctx, `skip: needs a logged-in profile${shared && shared.idle ? ` (signed out, mod idle: ${JSON.stringify(shared.idle)})` : ""}`);
        // collapse through the app's own left panel toggle (aria-pressed is the source of truth)
        await ev(page, () => window.__RE_TEMPO_PROJECT_SIDEBAR__.open.route("chat"));
        await sleep(600);
        const colState = () =>
          ev(page, () => {
            const b = document.querySelector('button[aria-label="Toggle left panel"]');
            const g = document.getElementById("workspace-main").getBoundingClientRect();
            const rail = document.querySelector('[data-testid="workspace-navbar"]').getBoundingClientRect();
            const btn = document.querySelector('[data-testid="workspace-navbar-chat-button"]');
            return { pressed: b && b.getAttribute("aria-pressed"), shown: !!document.querySelector(".rtps:not([hidden])"), groupLeft: g.left, groupRight: g.right, railRight: rail.right, win: innerWidth, routeBtn: btn ? getComputedStyle(btn).display : "absent", railGroup: document.querySelectorAll("[data-rtps-rail-group]").length, railHidden: document.documentElement.classList.contains("rtps-rail-hidden") || document.documentElement.classList.contains("rtps-rail-hidden-soft"), ringsHost: !!document.querySelector("[data-rtu-rings-host]"), collapsed: window.__RE_TEMPO_PROJECT_SIDEBAR__.state().collapsed };
          });
        await page.locator('button[aria-label="Toggle left panel"]').click();
        await sleep(300);
        const col = await colState();
        rec.collapsed = col;
        checker.ok(col.pressed === "false" && col.collapsed && !col.shown && col.groupLeft <= Math.max(1, col.railRight + 1) && col.groupRight <= col.win + 1 && col.railGroup === 0 && col.railHidden && !col.ringsHost, "native toggle collapses the sidebar: nothing left (no rail, no mod group, no rings host), the workspace to the left edge", JSON.stringify(col));
        // collapsed with the mod on: nothing left (no mod group, the rail hidden): the workspace runs to the edge
        const collapsedRail = await ev(page, () => {
          const rail = document.querySelector('[data-testid="workspace-navbar"]');
          return { groups: document.querySelectorAll("[data-rtps-rail-group]").length, railHidden: document.documentElement.classList.contains("rtps-rail-hidden") || document.documentElement.classList.contains("rtps-rail-hidden-soft"), railShown: !!rail && rail.getBoundingClientRect().width > 0 };
        });
        rec.collapsedRail = collapsedRail;
        checker.ok(collapsedRail.groups === 0 && collapsedRail.railHidden && !collapsedRail.railShown, "collapsed: no mod group, the rail hidden (nothing left on the left)", JSON.stringify(collapsedRail));
        const cshot = await lib.ui.screenshot(page, instDir, "92-collapsed");
        if (cshot) rec.screenshots.push(cshot);
        await page.locator('button[aria-label="Toggle left panel"]').click();
        await sleep(300);
        const exp = await colState();
        checker.ok(exp.pressed === "true" && !exp.collapsed && exp.shown && exp.groupLeft >= exp.railRight + 263, "native toggle again: sidebar back", JSON.stringify(exp));
        // ⌘⇧E: only this sidebar exists, so it focuses the sidebar's search and changes nothing else
        await ev(page, () => document.activeElement && document.activeElement.blur());
        await page.keyboard.press("Meta+Shift+KeyE");
        await sleep(500);
        const ke = await ev(page, () => ({
          search: document.activeElement === document.querySelector("#rtd-project-sidebar .rtps-search input"),
          ready: window.__RE_TEMPO_PROJECT_SIDEBAR__.ready,
          flags: [localStorage.getItem("rtd.projectSidebar"), localStorage.getItem("rtd.sidebarChats"), localStorage.getItem("rtd.projectSidebar.skin")],
          skin: document.documentElement.classList.contains("rtps-skin-prev"),
          switches: document.querySelectorAll("button.rtps-switch").length,
          api: ["toggle", "mode", "setMode", "cycle"].filter((k) => k in window.__RE_TEMPO_PROJECT_SIDEBAR__),
        }));
        rec.cmdShiftE = ke;
        checker.ok(ke.search && ke.ready && ke.flags.every((f) => f === null) && !ke.skin && ke.switches === 0 && ke.api.length === 0, "⌘⇧E: the sidebar's search gets the focus; the sidebar stays, no flag, no skin class, no switch, no mode API", JSON.stringify(ke));
        await ev(page, () => document.activeElement && document.activeElement.blur());
        const q = await ev(page, () => Array.from(new Set(window.__RE_TEMPO_PROJECT_SIDEBAR__.queryLog)));
        rec.queries = q;
        checker.ok(q.every((n) => READ_QUERIES.includes(n)), "mod only ran read queries", q.join(","));
        checker.equal(ctx.collectors.exceptions.length, 0, "no uncaught exception");
      },
    },
  ],
};
