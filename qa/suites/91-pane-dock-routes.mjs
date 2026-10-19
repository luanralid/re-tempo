// qa/suites/91-pane-dock-routes.mjs - canvas, doc and issue docked beside the chat (pane-dock mod,
// feature/pane-dock.js): the pane "+" menu, the app's Open picker, and the layout after a reload.
// -----------------------------------------------------------------------------
// Run (needs a logged-in profile created by login.mjs):
//   cd qa && node run.mjs --suite 91-pane-dock-routes --profile qa-1
// Without a logged-in profile every test ends as SKIP ("skip: needs a logged-in profile").
//
// SCENARIO
//   1) chat route with a workspace (the first existing one; QA_DOCK_FOLDER opens that folder
//      through the app's Open folder flow, without the native dialog, when there is none);
//   2) first pane: a terminal from the center "+" (local, no account data) split to the right;
//   3) the pane "+" (real mouse click): the menu has the center "+" items; "Open" shows the
//      app's picker; the first canvas/doc/issue row (any row as fallback) is picked and must
//      land in that pane, while the center keeps the chat;
//   4) that tab is split into its own pane right of the chat: chat | doc-or-canvas | terminal;
//   5) Page.reload: the same panes come back with the same tab types, the docked tab renders
//      content, and the center still shows the chat.
// Nothing is created in the account: Open only reads; New Doc/Issue/Canvas are not clicked.
// Screenshots carry account data and stay in /tmp/tempo-qa/runs (0700).
// -----------------------------------------------------------------------------
import { getStore, patchDialog, unpatchDialog } from "./20-home/lib.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DOCKABLE_KINDS = ["canvas", "prd", "issue"];

function softSkip(ctx, reason) {
  const { rec, checker } = ctx;
  console.log(`[91-pane-dock-routes] ${reason}`);
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

const dock = (page, fn, arg) => page.evaluate(fn, arg);
const panels = (page) =>
  dock(page, () => (window.__RE_TEMPO_PANE_DOCK__ ? window.__RE_TEMPO_PANE_DOCK__.panels.map((p) => ({ id: p.id, types: p.types, tabs: p.tabs.length, active: p.active, w: Math.round(p.rect.width), h: Math.round(p.rect.height) })) : null));
const centerState = (page) =>
  dock(page, () => {
    const st = window.__QA_WS_STORE__.getState();
    const act = (st.centerTabs || []).find((t) => t.id === st.activeCenterTabId);
    return { route: st.activeNavRoute, ws: st.selectedWorkspaceId, active: st.activeCenterTabId, activeType: act ? act.type : null, ids: (st.centerTabs || []).map((t) => t.id) };
  });

let shared = null; // state carried between the tests of one run

async function setup(ctx) {
  const { page, lib, checker, rec } = ctx;
  const seen = await lib.ui.waitForScreen(page, ["home", "auth"], { timeoutMs: 120000, stableMs: 4000 });
  if (seen.screen !== "home") return false;
  checker.ok(await getStore(page), "workspace store found");
  // A workspace on the chat route.
  let ws = await dock(page, () => {
    const st = window.__QA_WS_STORE__.getState();
    const live = st.workspaces.filter((w) => !w.isArchived && w.agentId == null);
    return { selected: st.selectedWorkspaceId || null, ids: live.map((w) => w.id) };
  });
  if (!ws.ids.length && process.env.QA_DOCK_FOLDER) {
    await patchDialog(page, process.env.QA_DOCK_FOLDER);
    await dock(page, () => window.__QA_WS_STORE__.getState().openFolder());
    await unpatchDialog(page);
    await sleep(3000);
    ws = await dock(page, () => {
      const st = window.__QA_WS_STORE__.getState();
      return { selected: st.selectedWorkspaceId || null, ids: st.workspaces.filter((w) => !w.isArchived && w.agentId == null).map((w) => w.id) };
    });
  }
  if (!ws.ids.length) throw new Error("no workspace in the profile: open a project once, or set QA_DOCK_FOLDER=<fixture repo>");
  const wsId = ws.selected && ws.ids.includes(ws.selected) ? ws.selected : ws.ids[0];
  await dock(page, (id) => {
    const st = window.__QA_WS_STORE__.getState();
    if (st.selectedWorkspaceId !== id) (st.switchToWorkspace || st.selectWorkspace)(id);
    window.__QA_WS_STORE__.getState().setActiveNavRoute("chat");
  }, wsId);
  const ready = await waitFor(() => dock(page, () => !!(window.__RE_TEMPO_PANE_DOCK__ && window.__RE_TEMPO_PANE_DOCK__.ready)), 30000);
  checker.ok(ready, "pane-dock ready on the chat route");
  await dock(page, () => window.__RE_TEMPO_PANE_DOCK__.reset());
  await sleep(800);
  // The center must show a chat: activate the workspace's active chat.
  await dock(page, () => {
    const st = window.__QA_WS_STORE__.getState();
    const chat = (st.centerTabs || []).find((t) => t.id === st.activeChatTabId) || (st.centerTabs || []).find((t) => t.type === "chat" && !t.isArchived);
    if (chat) st.setActiveCenterTab(chat.id);
  });
  await sleep(500);
  const c = await centerState(page);
  checker.equal(c.activeType, "chat", "center shows a chat");
  rec.notes = `workspace=${wsId.slice(0, 8)}…`;
  shared = { wsId };
  return true;
}

// First pane: a terminal from the center "+" (no account data), split right of the chat.
async function firstPane(ctx) {
  const { page, checker } = ctx;
  const before = (await centerState(page)).ids;
  const opened = await dock(page, async () => {
    const b = document.querySelector('[data-testid="center-panel-add-tab-button"]');
    if (!b) return "no center + button";
    b.click();
    for (let i = 0; i < 20; i++) {
      const it = document.querySelector('[data-testid="new-tab-action-terminal"]');
      if (it) {
        it.click();
        return "ok";
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return "no New Terminal item";
  });
  checker.equal(opened, "ok", "center + > New Terminal");
  const term = await waitFor(async () => {
    const c = await centerState(page);
    return c.ids.find((id) => !before.includes(id)) || null;
  }, 8000);
  checker.ok(term, "terminal center tab created");
  if (!term) return null;
  await dock(page, (id) => window.__RE_TEMPO_PANE_DOCK__.split(id, "right"), term);
  const ps = await waitFor(async () => {
    const p = await panels(page);
    return p && p.length === 1 && p[0].types.includes("terminal") ? p : null;
  }, 8000);
  checker.ok(ps, "terminal docked in a pane");
  // Back to the chat in the center.
  await dock(page, () => {
    const st = window.__QA_WS_STORE__.getState();
    if (st.activeChatTabId) st.setActiveCenterTab(st.activeChatTabId);
  });
  await sleep(400);
  return ps ? { termId: term, paneId: ps[0].id } : null;
}

// Rows of the app's Open picker, with the section heading above each one.
async function pickerRows(page) {
  return page.evaluate(() => {
    const dlg = [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.getClientRects().length).pop();
    if (!dlg) return null;
    const skip = /open-modal-search|open-canvas-modal-(back|maximize)|close/i;
    const cands = [...dlg.querySelectorAll('[role="option"], [cmdk-item], [role="listbox"] [role="button"], [role="listbox"] button, li button, li[role="button"], button')]
      .filter((n) => n.getClientRects().length && n.textContent.trim() && !skip.test(n.getAttribute("data-testid") || "") && !skip.test(n.getAttribute("aria-label") || ""));
    const heads = [...dlg.querySelectorAll('h2, h3, h4, [role="heading"], [cmdk-group-heading], [class*="uppercase"]')];
    const sectionOf = (n) => {
      let best = "";
      for (const h of heads) if (h.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) best = h.textContent.trim();
      return best;
    };
    window.__qaRows = [...new Set(cands)];
    return window.__qaRows.map((n, i) => ({ i, text: n.textContent.trim().slice(0, 60), section: sectionOf(n).slice(0, 30), testid: n.getAttribute("data-testid") || "" }));
  });
}

async function plusOf(page, paneId) {
  return page.evaluate((pid) => {
    const b = document.querySelector(`[data-rtd-panel="${pid}"] .rtd-add`);
    if (!b || !b.getClientRects().length) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, paneId);
}

export default {
  name: "91-pane-dock-routes",
  tests: [
    {
      name: "pane-plus-open-picker",
      async fn(ctx) {
        const { page, checker, rec, lib, instDir } = ctx;
        if (!(await setup(ctx))) return softSkip(ctx, "skip: needs a logged-in profile");
        const fp = await firstPane(ctx);
        if (!fp) return;
        shared.paneId = fp.paneId;
        shared.termId = fp.termId;

        const acts = await dock(page, () => window.__RE_TEMPO_PANE_DOCK__.addActions);
        checker.equal(acts.length, 7, "pane + finds the 7 center + actions", JSON.stringify(acts));
        const plus = await plusOf(page, fp.paneId);
        checker.ok(plus, "pane + button visible");
        if (!plus) return;
        await page.mouse.click(plus.x, plus.y);
        await sleep(300);
        const items = await page.evaluate(() => [...document.querySelectorAll('.rtd-menu [role="menuitem"]')].map((b) => b.dataset.key + (b.hasAttribute("data-disabled") ? "(off)" : "")));
        rec.menu = items;
        checker.equal(items.map((s) => s.replace("(off)", "")).join(), "chat,canvas,prd,issue,terminal,browser,open", "pane menu mirrors the center +");
        const s1 = await lib.ui.screenshot(page, instDir, "91-pane-menu");
        if (s1) rec.screenshots.push(s1);

        // Open: the app's picker; pick the first canvas/doc/issue row.
        const before = (await panels(page)).find((p) => p.id === fp.paneId).types.length;
        await page.click('.rtd-menu [data-key="open"]');
        const rows = await waitFor(async () => {
          const r = await pickerRows(page);
          return r && r.length ? r : null;
        }, 15000, 400);
        rec.pickerRows = rows ? rows.slice(0, 15) : null;
        checker.ok(rows, "Open shows the app picker with rows");
        if (!rows) return;
        const s2 = await lib.ui.screenshot(page, instDir, "91-open-picker");
        if (s2) rec.screenshots.push(s2);
        const pref = rows.find((r) => /canvas|doc|issue/i.test(r.section)) || rows[0];
        rec.picked = pref;
        await page.evaluate((i) => window.__qaRows[i].click(), pref.i);
        const landed = await waitFor(async () => {
          const p = (await panels(page)).find((x) => x.id === fp.paneId);
          return p && p.types.length > before ? p : null;
        }, 15000);
        checker.ok(landed, "picked item lands in the pane", JSON.stringify(rec.picked));
        if (!landed) return;
        const type = landed.types[landed.types.length - 1];
        rec.landedType = type;
        checker.ok(DOCKABLE_KINDS.includes(type) || type === "file", `landed tab is a canvas/doc/issue (got ${type})`);
        const c = await centerState(page);
        checker.equal(c.activeType, "chat", "center keeps the chat");
        shared.docTab = landed.active ? landed.active.replace(/^center:[^:]+:/, "") : null;
        shared.docType = type;
        checker.equal(ctx.collectors.exceptions.length, 0, "no uncaught exception");
      },
    },
    {
      name: "doc-beside-chat-survives-reload",
      async fn(ctx) {
        const { page, checker, rec, lib, instDir } = ctx;
        if (!shared || !shared.docTab) return softSkip(ctx, "skip: previous test did not dock a tab");
        // chat | doc-or-canvas | terminal
        const ok = await dock(page, (id) => window.__RE_TEMPO_PANE_DOCK__.split(id, "right", "main"), shared.docTab);
        checker.ok(ok, `${shared.docType} split into its own pane right of the chat`);
        await sleep(2500); // content load (doc editor / canvas preview)
        const ps = await panels(page);
        const sig = (list) => list.map((p) => p.types.join("+")).sort().join(" | ");
        rec.before = { layout: await dock(page, () => window.__RE_TEMPO_PANE_DOCK__.layout), panels: ps };
        checker.equal(ps.length, 2, "two panes: the docked tab and the terminal");
        checker.ok(ps.some((p) => p.types.join() === shared.docType), `a pane holds only the ${shared.docType}`);
        const rendered = async () =>
          page.evaluate((type) => {
            const pane = [...document.querySelectorAll(".rtd-panel")].find((p) => p.style.display !== "none" && p.querySelector(`[role="tab"][data-rtd-type="${type}"][aria-selected="true"], [role="tab"][data-rtd-type="${type}"]`));
            if (!pane) return 0;
            const header = pane.querySelector("header");
            const top = header ? header.getBoundingClientRect().bottom : 0;
            // Biggest visible element below the header (editor, canvas preview, issue view).
            let best = 0;
            for (const n of pane.querySelectorAll("div, iframe, webview, [contenteditable]")) {
              const r = n.getBoundingClientRect();
              if (r.top >= top - 1 && r.width > 40 && r.height > 40 && (n.children.length || n.tagName !== "DIV")) best = Math.max(best, Math.round(r.height));
            }
            return best;
          }, shared.docType);
        const h1 = await rendered();
        rec.contentPxBefore = h1;
        checker.ok(h1 > 100, `${shared.docType} pane renders content (${h1}px tall)`);
        const c1 = await centerState(page);
        checker.equal(c1.activeType, "chat", "center shows the chat beside the docked tab");
        const s1 = await lib.ui.screenshot(page, instDir, "91-chat-and-doc-before-reload");
        if (s1) rec.screenshots.push(s1);

        await page.reload();
        await lib.ui.waitForScreen(page, ["home"], { timeoutMs: 120000, stableMs: 2000 });
        await getStore(page);
        const back = await waitFor(async () => {
          const p = await panels(page);
          return p && p.length === ps.length && sig(p) === sig(ps) ? p : null;
        }, 60000, 500);
        rec.after = { layout: await dock(page, () => window.__RE_TEMPO_PANE_DOCK__ && window.__RE_TEMPO_PANE_DOCK__.layout), panels: await panels(page) };
        checker.ok(back, "same panes and tab types after reload", `before=${sig(ps)} after=${sig((await panels(page)) || [])}`);
        await sleep(2500);
        const h2 = await rendered();
        rec.contentPxAfter = h2;
        checker.ok(h2 > 100, `${shared.docType} pane renders content after reload (${h2}px tall)`);
        const c2 = await centerState(page);
        checker.equal(c2.activeType, "chat", "center still shows the chat after reload");
        const s2 = await lib.ui.screenshot(page, instDir, "91-chat-and-doc-after-reload");
        if (s2) rec.screenshots.push(s2);
        checker.equal(ctx.collectors.exceptions.length, 0, "no uncaught exception");

        // Cleanup: tabs back to the center, the QA terminal closed when the store can.
        await dock(page, (term) => {
          window.__RE_TEMPO_PANE_DOCK__.reset();
          const st = window.__QA_WS_STORE__.getState();
          if (term && typeof st.closeTab === "function") st.closeTab(term);
        }, shared.termId).catch(() => {});
      },
    },
  ],
};
