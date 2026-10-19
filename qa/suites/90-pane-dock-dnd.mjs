// qa/suites/90-pane-dock-dnd.mjs - drag and drop of a tab into a tab bar that already has tabs
// (pane-dock mod, feature/pane-dock.js). Acceptance test for the insertion preview.
// -----------------------------------------------------------------------------
// Run (needs a logged-in profile created by login.mjs):
//   cd qa && node run.mjs --suite 90-pane-dock-dnd --profile qa-1
// Without a logged-in profile the suite ends clean: it prints
//   "skip: needs a logged-in profile"
// marks every test as SKIP in the report and the runner exits 0 (it only exits 1 on FAIL).
// Note: run.mjs has no native skip, so skip is done by pinning rec.status to "skip"
// (accessor property the runner's later assignment cannot overwrite).
//
// HOW THE DRAG IS SIMULATED (choice and reason)
//   Synthetic DragEvent + one shared DataTransfer, dispatched from page.evaluate:
//   dragstart on the tab inside the dock panel, dragenter/dragover on the element under
//   the target point, then drop / dragleave / Escape+dragend. The mod only listens to DOM
//   drag events (React root "dragstart", window capture dragover/dragenter/dragend/drop),
//   so synthetic events reach exactly the same handlers. The app's own dragstart handler
//   fills "application/x-tempo-view-tab"; "tempo-tab-id" is pre-set as the fallback the
//   mod also reads. CDP Input.dispatchDragEvent was not used: it needs a real OS-level
//   drag session (Input.setInterceptDrags) and adds flakiness without exercising other code.
//   Synthetic events are untrusted, which the mod does not check.
//
// SCENARIO (built by the suite)
//   One test per target bar size: 1, 2 and 3 tabs in the native center bar. Extra center
//   tabs are parked in a second dock panel, the dragged tab is moved to a first dock panel
//   with window.__RE_TEMPO_PANE_DOCK__.split(). For each insertion position (start, middle,
//   end) three drags run: dragleave out of the bar, Escape, and drop.
//   Limit: the suite creates missing center tabs through the UI (best effort: "new tab"
//   button or Cmd+T); if the app does not create them the test FAILS with a clear message.
//
// ASSERTIONS (during the drag, measured in CSS px)
//   exactly 1 visible insertion indicator; indicator inside the insertion gap (<= 2 px) and
//   next to the preview (<= 2 px); preview/tabs overlap area = 0; exactly 1 label with the
//   dragged title, inside the preview; icon and text without overlap; no duplicate of the
//   dragged tab in the target bar; close buttons per tab unchanged; indicated index = aimed.
// AFTER: tab lands at the indicated index (drop); 0 preview elements after drop, after
//   dragleave out of the bar and after Escape.
// -----------------------------------------------------------------------------

const TOL_PX = 2;
const TOL_AREA = 0.5; // px^2, sub-pixel noise
const SETTLE_MS = 450; // tab slide transition is 120 ms

// ------------------------------------------------------------ page side helpers
// Installed once per page as window.__qaDnd. Everything here runs in the renderer.
function installPageHelpers() {
  const VIEW_TAB = "application/x-tempo-view-tab";
  const CENTER = '[data-testid="center-panel"]';
  const BAR_SEL = '[data-testid$="-tab-drop-zone"], [data-testid$="tab-bar"]';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (n) => {
    if (!n || !n.getBoundingClientRect) return false;
    const r = n.getBoundingClientRect();
    const cs = getComputedStyle(n);
    return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden" && parseFloat(cs.opacity) > 0;
  };
  const rectOf = (n) => {
    const r = n.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  };
  const dock = () => window.__RE_TEMPO_PANE_DOCK__;
  const centerTabs = () =>
    [...document.querySelectorAll(`${CENTER} [role="tab"][data-tab-id]`)].filter((t) => t.offsetWidth > 0);
  const barOf = (tab) => tab.closest(BAR_SEL);
  const mainBar = () => {
    const t = centerTabs()[0];
    return t ? barOf(t) : null;
  };
  const barTabs = (bar) => [...bar.querySelectorAll('[role="tab"]')].filter((t) => t.offsetWidth > 0);
  const closeCount = (tab) => tab.querySelectorAll('button, [role="button"], [aria-label*="lose" i]').length;
  const panelTab = (rawId) =>
    [...document.querySelectorAll('.rtd-panel [role="tab"][data-tab-id]')].find((t) =>
      t.getAttribute("data-tab-id").endsWith(":" + rawId),
    ) || null;
  const previewNodes = (includeCatchers) => {
    const sel = '.rtd-ghost, .rtd-insert, [class*="rtd-ghost"], [class*="rtd-insert"]';
    const nodes = new Set(document.querySelectorAll(sel));
    if (includeCatchers) document.querySelectorAll(".rtd-catcher").forEach((n) => nodes.add(n));
    const shifted = document.querySelectorAll("[data-rtd-shift], [data-rtd-shifting], [data-rtd-slot], [data-rtd-lift]").length;
    return { nodes: nodes.size, shifted, visible: [...nodes].filter(visible).length };
  };
  const fire = (target, type, x, y, extra = {}) => {
    const ev = new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: x,
      clientY: y,
      dataTransfer: window.__qaDt,
      ...extra,
    });
    target.dispatchEvent(ev);
    return ev;
  };
  const at = (x, y, fallback) => document.elementFromPoint(x, y) || fallback;

  window.__qaDnd = {
    ready: () => !!(dock() && dock().ready),
    // ---- scenario
    snapshot: () => ({
      center: centerTabs().map((t) => t.getAttribute("data-tab-id")),
      panels: dock() ? dock().panels.length : -1,
    }),
    reset: () => dock().reset(),
    split: (id, zone) => dock().split(id, zone, "main"),
    hasPanelTab: (id) => !!panelTab(id),
    // ---- drag
    start: async (srcId) => {
      const src = panelTab(srcId);
      if (!src) return { ok: false, reason: "source tab not found in a dock panel" };
      const dt = new DataTransfer();
      dt.setData("tempo-tab-id", src.getAttribute("data-tab-id"));
      window.__qaDt = dt;
      window.__qaSrc = src;
      const r = src.getBoundingClientRect();
      fire(src, "dragstart", r.left + r.width / 2, r.top + r.height / 2);
      await sleep(120); // the mod opens its catchers on a timeout 0
      return { ok: true, types: [...dt.types], title: src.textContent.trim() };
    },
    // Aim points computed from the untouched bar (before any slide).
    plan: (pos) => {
      const bar = mainBar();
      const tabs = barTabs(bar);
      const br = bar.getBoundingClientRect();
      const y = (tabs[0].getBoundingClientRect().top + tabs[0].getBoundingClientRect().bottom) / 2;
      const q = (i) => {
        const r = tabs[i].getBoundingClientRect();
        return r.left + r.width * 0.25;
      };
      const last = tabs[tabs.length - 1].getBoundingClientRect();
      const endX = Math.min(last.right + 10, br.right - 3);
      if (pos === "start") return { x: q(0), y, aimed: 0, endX, n: tabs.length };
      if (pos === "middle") return { x: q(1), y, aimed: 1, endX, n: tabs.length };
      return { x: endX, y, aimed: tabs.length, endX, n: tabs.length };
    },
    // Mouse-like path: enter at the far end of the bar first, then go to the target.
    over: async (p) => {
      const first = at(p.endX, p.y, document.body);
      fire(first, "dragenter", p.endX, p.y);
      fire(first, "dragover", p.endX, p.y);
      await sleep(80);
      const tgt = at(p.x, p.y, document.body);
      fire(tgt, "dragenter", p.x, p.y);
      fire(tgt, "dragover", p.x, p.y);
      await sleep(40);
      fire(tgt, "dragover", p.x + 1, p.y);
      await sleep(SETTLE_MS);
    },
    baseline: () => {
      const bar = mainBar();
      return barTabs(bar).map((t) => ({ id: t.getAttribute("data-tab-id"), closes: closeCount(t) }));
    },
    measure: (title, base, aimed) => {
      const bar = mainBar();
      const tabs = barTabs(bar);
      const br = bar.getBoundingClientRect();
      const out = { title };
      const indicators = [...new Set(document.querySelectorAll('.rtd-insert, .rtd-dnd [class*="insert"], [data-rtd-insert]'))].filter(visible);
      out.indicators = indicators.length;
      const ghosts = [...new Set(document.querySelectorAll('.rtd-ghost, [data-rtd-ghost]'))].filter(visible);
      out.ghosts = ghosts.length;
      const m = indicators[0] ? rectOf(indicators[0]) : null;
      const g = ghosts[0] ? rectOf(ghosts[0]) : null;
      // indicated index = tabs whose center is left of the indicator
      if (m) {
        const mx = (m.left + m.right) / 2;
        const rs = tabs.map((t) => t.getBoundingClientRect()).sort((a, b) => a.left - b.left);
        const idx = rs.filter((r) => (r.left + r.right) / 2 < mx).length;
        out.indicatedIndex = idx;
        const lo = idx > 0 ? rs[idx - 1].right : br.left;
        const hi = idx < rs.length ? rs[idx].left : br.right;
        out.gap = { lo, hi };
        out.gapDistance = Math.max(0, lo - m.left, m.right - hi);
        if (g) out.markerToPreview = Math.min(Math.abs(m.right - g.left), Math.abs(m.left - g.right), Math.abs(m.left - g.left));
        out.marker = m;
      }
      // preview x tabs overlap (area)
      let overlap = 0;
      if (g) {
        for (const t of tabs) {
          const r = t.getBoundingClientRect();
          const w = Math.min(g.right, r.right) - Math.max(g.left, r.left);
          const h = Math.min(g.bottom, r.bottom) - Math.max(g.top, r.top);
          if (w > 0 && h > 0) overlap += w * h;
        }
        out.ghost = g;
      }
      out.overlapArea = overlap;
      // labels: leaf elements with the dragged title that are not real tabs, inside the overlay
      const labels = [...document.querySelectorAll('.rtd-dnd *, [class*="rtd-ghost"] *')]
        .filter((n) => n.children.length === 0 && n.textContent.trim() === title && !n.closest('[role="tab"]') && visible(n));
      const ghostLabels = ghosts.length ? [...ghosts[0].querySelectorAll("*")].filter((n) => n.children.length === 0 && n.textContent.trim() === title && visible(n)) : [];
      out.labels = [...new Set([...labels, ...ghostLabels])].length;
      const lab = ghostLabels[0] || labels[0];
      out.labelInsidePreview = !!(g && lab && (() => {
        const r = lab.getBoundingClientRect();
        return r.left >= g.left - 1 && r.right <= g.right + 1 && r.top >= g.top - 1 && r.bottom <= g.bottom + 1;
      })());
      // icon x text. Real icon nodes first; the stylesheet icon is a ::before flex item.
      if (g && lab) {
        const range = document.createRange();
        range.selectNodeContents(lab);
        const tr = range.getBoundingClientRect();
        const gh = ghosts[0];
        const cs = getComputedStyle(gh);
        const padL = parseFloat(cs.paddingLeft) || 0;
        const before = getComputedStyle(gh, "::before");
        const hasPseudo = before.content && before.content !== "none" && before.content !== "normal";
        let iconRight = null;
        let iconLeft = null;
        if (hasPseudo) {
          const w = parseFloat(before.width) || 0;
          const abs = before.position === "absolute" || before.position === "fixed";
          iconLeft = g.left + (abs ? parseFloat(before.left) || 0 : padL);
          iconRight = iconLeft + w;
        }
        const real = [...gh.querySelectorAll("svg, img, i, [class*='icon']")].filter(visible).map(rectOf);
        let iconOverlap = 0;
        if (iconRight != null) iconOverlap += Math.max(0, iconRight - tr.left) > 0 && tr.width > 0 ? Math.max(0, Math.min(iconRight, tr.right) - Math.max(iconLeft, tr.left)) : 0;
        for (const r of real) iconOverlap += Math.max(0, Math.min(r.right, tr.right) - Math.max(r.left, tr.left));
        out.iconTextOverlap = iconOverlap;
        out.textBox = { left: tr.left, right: tr.right, width: tr.width };
        out.iconBox = iconRight != null ? { left: iconLeft, right: iconRight } : null;
      }
      // dragged tab must not be duplicated inside the target bar; close buttons unchanged
      const srcRaw = (window.__qaSrc && window.__qaSrc.getAttribute("data-tab-id")) || "";
      out.duplicatesInBar = tabs.filter((t) => srcRaw.endsWith(":" + t.getAttribute("data-tab-id")) || t.textContent.trim() === title).length;
      out.closeChanged = base
        .map((b) => {
          const t = tabs.find((x) => x.getAttribute("data-tab-id") === b.id);
          return t ? closeCount(t) - b.closes : 0;
        })
        .filter((d) => d !== 0).length;
      out.aimed = aimed;
      return out;
    },
    leaveOut: async (p) => {
      const bar = mainBar();
      const t = at(p.x, p.y, bar);
      fire(t, "dragleave", p.x, p.y, { relatedTarget: document.body });
      const panel = document.querySelector(".rtd-panel");
      let px = 8;
      let py = 8;
      if (panel) {
        const r = panel.getBoundingClientRect();
        px = r.left + r.width / 2;
        py = r.top + r.height * 0.7;
      }
      const out = at(px, py, document.body);
      fire(out, "dragenter", px, py);
      fire(out, "dragover", px, py);
      await sleep(SETTLE_MS / 2);
      return previewNodes(false);
    },
    escape: async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
      // The browser cancels a drag with Esc and fires dragend (dropEffect none).
      const src = window.__qaSrc && window.__qaSrc.isConnected ? window.__qaSrc : document.body;
      fire(src, "dragend", 0, 0);
      await sleep(SETTLE_MS / 2);
      return previewNodes(true);
    },
    end: async () => {
      const src = window.__qaSrc && window.__qaSrc.isConnected ? window.__qaSrc : document.body;
      fire(src, "dragend", 0, 0);
      await sleep(SETTLE_MS / 2);
      return previewNodes(true);
    },
    drop: async (p, srcId) => {
      const t = at(p.x, p.y, mainBar());
      fire(t, "drop", p.x, p.y);
      const src = window.__qaSrc && window.__qaSrc.isConnected ? window.__qaSrc : document.body;
      fire(src, "dragend", p.x, p.y);
      await sleep(SETTLE_MS + 250);
      const bar = mainBar();
      const ids = bar ? barTabs(bar).map((x) => x.getAttribute("data-tab-id")) : [];
      return { order: ids, index: ids.indexOf(srcId), previews: previewNodes(true) };
    },
    previews: () => previewNodes(true),
  };
  return true;
}

// ------------------------------------------------------------ node side helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function softSkip(ctx, reason) {
  const { rec, checker } = ctx;
  console.log(`[90-pane-dock-dnd] ${reason}`);
  rec.notes = reason;
  rec.skip = reason;
  checker.ok(true, reason);
  // run.mjs assigns pass/fail after fn(); pin the status so the report shows SKIP.
  Object.defineProperty(rec, "status", { get: () => "skip", set: () => {}, enumerable: true, configurable: true });
}

async function ensureLoggedIn(ctx) {
  const { page, lib } = ctx;
  const seen = await lib.ui.waitForScreen(page, ["home", "auth"], { timeoutMs: 120000, stableMs: 4000 });
  return seen.screen === "home";
}

async function ensureCenterTabs(page, need) {
  const count = () => page.evaluate(() => window.__qaDnd.snapshot().center.length);
  for (let i = 0; i < 12 && (await count()) < need; i++) {
    const clicked = await page.evaluate(() => {
      const cands = [...document.querySelectorAll('[data-testid="center-panel"] button, [data-testid="center-panel"] [role="button"]')];
      const b = cands.find((n) => /new (chat|tab)|add tab|^\+$/i.test(`${n.getAttribute("aria-label") || ""} ${n.getAttribute("title") || ""} ${n.textContent || ""}`.trim()));
      if (b) { b.click(); return true; }
      return false;
    });
    if (!clicked) await page.keyboard.press("Meta+t");
    await sleep(900);
  }
  const n = await count();
  if (n < need) throw new Error(`could not create center tabs: have ${n}, need ${need} (create them by hand in the profile and rerun)`);
}

async function buildScenario(page, barSize) {
  await page.evaluate(() => window.__qaDnd.reset());
  await sleep(500);
  await ensureCenterTabs(page, barSize + 1);
  const snap = await page.evaluate(() => window.__qaDnd.snapshot());
  const ids = snap.center;
  const srcId = ids[ids.length - 1];
  const extras = ids.slice(barSize, ids.length - 1);
  for (const id of extras) {
    await page.evaluate((i) => window.__qaDnd.split(i, "left"), id);
    await sleep(500);
  }
  await resplit(page, srcId);
  return { srcId, parked: extras.length };
}

async function resplit(page, srcId) {
  await page.evaluate((i) => window.__qaDnd.split(i, "right"), srcId);
  for (let i = 0; i < 30; i++) {
    if (await page.evaluate((id) => window.__qaDnd.hasPanelTab(id), srcId)) break;
    await sleep(200);
  }
  await sleep(400);
}

function checkDuring(checker, tag, m, aimed) {
  checker.equal(m.indicators, 1, `${tag}: exactly 1 insertion indicator`);
  checker.ok(m.gapDistance != null && m.gapDistance <= TOL_PX, `${tag}: indicator within the insertion gap (<= ${TOL_PX}px)`, `distance=${m.gapDistance}`);
  checker.ok(m.markerToPreview != null && m.markerToPreview <= TOL_PX, `${tag}: indicator aligned with the preview (<= ${TOL_PX}px)`, `distance=${m.markerToPreview}`);
  checker.ok(m.overlapArea <= TOL_AREA, `${tag}: preview does not overlap tabs (area 0)`, `area=${m.overlapArea}`);
  checker.equal(m.labels, 1, `${tag}: exactly 1 label with the dragged title, none loose or duplicated`);
  checker.ok(m.labelInsidePreview, `${tag}: label sits inside the preview`);
  checker.ok(m.iconTextOverlap != null && m.iconTextOverlap <= 0.5, `${tag}: icon and text do not overlap`, `overlap=${m.iconTextOverlap}px`);
  checker.equal(m.duplicatesInBar, 0, `${tag}: dragged tab is not duplicated in the target bar`);
  checker.equal(m.closeChanged, 0, `${tag}: no extra close buttons on existing tabs`);
  checker.equal(m.indicatedIndex, aimed, `${tag}: indicator shows the aimed index`);
}

function checkClean(checker, tag, p, { allowCatchers = false } = {}) {
  checker.equal(p.nodes, 0, `${tag}: 0 preview elements left`);
  checker.equal(p.shifted, 0, `${tag}: 0 shifted tabs left`);
  void allowCatchers;
}

async function runBarSize(ctx, barSize) {
  const { page, checker, rec, lib, instDir } = ctx;
  if (!(await ensureLoggedIn(ctx))) return softSkip(ctx, "skip: needs a logged-in profile");
  await page.evaluate(installPageHelpers);
  const ready = await page.evaluate(() => window.__qaDnd.ready());
  if (!ready) {
    for (let i = 0; i < 20 && !(await page.evaluate(() => window.__qaDnd.ready())); i++) await sleep(500);
  }
  checker.ok(await page.evaluate(() => window.__qaDnd.ready()), "pane-dock mod is ready (window.__RE_TEMPO_PANE_DOCK__.ready)");

  const { srcId, parked } = await buildScenario(page, barSize);
  const base = await page.evaluate(() => window.__qaDnd.baseline());
  checker.equal(base.length, barSize, `scenario: target bar has ${barSize} tab(s)`);
  rec.scenario = { barSize, srcId, parkedInSecondPanel: parked, panels: (await page.evaluate(() => window.__qaDnd.snapshot())).panels };
  rec.dnd = [];

  const positions = barSize === 1 ? ["start", "end"] : ["start", "middle", "end"];
  for (const pos of positions) {
    const tag = `bar${barSize}/${pos}`;
    const plan = await page.evaluate((p) => window.__qaDnd.plan(p), pos);

    // 1) drag, measure, screenshot, then dragleave out of the bar
    let s = await page.evaluate((id) => window.__qaDnd.start(id), srcId);
    checker.ok(s.ok, `${tag}: dragstart reached the mod`, s.reason || `types=${JSON.stringify(s.types)}`);
    if (!s.ok) continue;
    await page.evaluate((p) => window.__qaDnd.over(p), plan);
    const m = await page.evaluate((a) => window.__qaDnd.measure(a.title, a.base, a.aimed), { title: s.title, base, aimed: plan.aimed });
    rec.dnd.push({ tag, ...m });
    checkDuring(checker, tag, m, plan.aimed);
    const mid = await lib.ui.screenshot(page, instDir, `dnd-bar${barSize}-${pos}-mid`);
    if (mid) rec.screenshots.push(mid);
    const afterLeave = await page.evaluate((p) => window.__qaDnd.leaveOut(p), plan);
    checkClean(checker, `${tag} after dragleave out of the bar`, afterLeave);
    const ended = await page.evaluate(() => window.__qaDnd.end());
    checkClean(checker, `${tag} after the drag ended (dragleave case)`, ended);

    // 2) drag again, Escape
    s = await page.evaluate((id) => window.__qaDnd.start(id), srcId);
    if (s.ok) {
      await page.evaluate((p) => window.__qaDnd.over(p), plan);
      const during = await page.evaluate(() => window.__qaDnd.previews());
      checker.ok(during.visible > 0, `${tag}: preview is visible before Escape`, `visible=${during.visible}`);
      const afterEsc = await page.evaluate(() => window.__qaDnd.escape());
      checkClean(checker, `${tag} after Escape`, afterEsc);
    } else checker.ok(false, `${tag}: second dragstart reached the mod`, s.reason);

    // 3) drag again, drop; tab must land at the indicated index
    s = await page.evaluate((id) => window.__qaDnd.start(id), srcId);
    if (s.ok) {
      await page.evaluate((p) => window.__qaDnd.over(p), plan);
      const r = await page.evaluate((a) => window.__qaDnd.drop(a.plan, a.srcId), { plan, srcId });
      rec.dnd.push({ tag: `${tag}/drop`, order: r.order, index: r.index });
      checker.equal(r.index, plan.aimed, `${tag}: tab landed at the indicated index`);
      checkClean(checker, `${tag} after drop`, r.previews);
      const shot = await lib.ui.screenshot(page, instDir, `dnd-bar${barSize}-${pos}-drop`);
      if (shot) rec.screenshots.push(shot);
      await resplit(page, srcId); // back to a dock panel for the next position
    } else checker.ok(false, `${tag}: third dragstart reached the mod`, s.reason);
  }

  await page.evaluate(() => window.__qaDnd.reset());
  rec.notes = `bar=${barSize} tab(s); measurements in rec.dnd`;
}

export default {
  name: "90-pane-dock-dnd",
  tests: [1, 2, 3].map((n) => ({
    name: `dnd-into-bar-with-${n}-tab${n > 1 ? "s" : ""}`,
    async fn(ctx) {
      await runBarSize(ctx, n);
    },
  })),
};
