// qa/suites/50-docs/issues-lib.mjs — helpers for the 50-docs-issues suite (Issues / Kanban, Tempo 0.0.121).
// -----------------------------------------------------------------------------
// Selectors come from the renderer bundle (index-D2Ui1vc0.js, static study in
// /tmp/tempo-qa/scratch-t-docs/issues/notes.md). Everything is tolerant: returns
// boolean/object { ok, reason } and never throws on a missing selector.
//
// Safety rules encoded here:
// - Only creates/edits/deletes issues whose title starts with PREFIX ("QA-AUTO-docs-").
// - Before deleting, checks the title in the detail AND the ID quoted in the dialog.
// - Never clicks Copy ID (would overwrite the real clipboard), Save view,
//   agent assignment, chat send or "Create workspaces".
// - Escape is dangerous inside Issues: the global handler (window keydown) closes
//   the create modal and the detail even with focus on an editable field. So
//   menus are closed with a neutral click (dismiss) whenever possible.

export const RUNID = process.env.QA_RUNID || Date.now().toString(36); // once per process
export const PREFIX = "QA-AUTO-docs-";
export const RUN_PREFIX = `${PREFIX}${RUNID}`;
// Label: there is no UI to delete a label in 0.0.121 (issues.deleteLabel has no consumer).
// By default reuses a fixed name to leave at most 1 leftover in the org.
export const LABEL_NAME = process.env.QA_ISSUES_LABEL_PER_RUN === "1" ? `${PREFIX}label-${RUNID}` : `${PREFIX}label`;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const tid = (id) => `[data-testid="${id}"]`;
export const DETAIL = tid("issues-detail-view");
export const MODAL = tid("issues-create-modal");

// Title unique per instance and repetition (always starts with QA-AUTO-docs-<runid>).
export function baseFor(instId) { return `${RUN_PREFIX}-${instId}`; }
export function issueTitle(instId, k = 1) { return `${baseFor(instId)}${k > 1 ? `-r${k}` : ""}`; }

// ---------- primitives ----------
export async function waitVisible(page, sel, ms = 8000) {
  return page.locator(sel).first().waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);
}
export async function waitHidden(page, sel, ms = 8000) {
  return page.locator(sel).first().waitFor({ state: "hidden", timeout: ms }).then(() => true, () => false);
}
export async function isVisible(page, sel) { return page.locator(sel).first().isVisible().catch(() => false); }
export async function count(page, sel) { return page.locator(sel).count().catch(() => 0); }
export async function blurActive(page) { await page.evaluate(() => document.activeElement?.blur?.()).catch(() => {}); }
export async function activeTestId(page) {
  return page.evaluate(() => {
    const a = document.activeElement;
    return a ? { testid: a.getAttribute("data-testid"), issuesSearch: a.hasAttribute("data-issues-search"), tag: a.tagName } : null;
  }).catch(() => null);
}
const anyMenuOpen = (page) => page.evaluate(() => [...document.querySelectorAll('[role="menu"],[role="listbox"],[cmdk-list]')]
  .some((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })).catch(() => false);

// Closes popovers/menus without Escape when there is a detail/modal (Escape would close the whole screen).
export async function dismiss(page) {
  for (let i = 0; i < 3; i++) {
    if (!(await anyMenuOpen(page))) return;
    if (await isVisible(page, MODAL)) {
      await page.locator(MODAL).getByText("New issue", { exact: true }).first().click({ timeout: 1500 }).catch(() => {});
    } else if (await isVisible(page, DETAIL)) {
      await page.locator(DETAIL).first().click({ position: { x: 8, y: 90 }, timeout: 1500 }).catch(() => {});
    } else {
      await page.keyboard.press("Escape"); // board without detail: Escape only closes the menu / clears the selection
    }
    await sleep(250);
  }
}

// ---------- navigation ----------
export async function waitShell(page, ms = 90000) { return waitVisible(page, tid("workspace-navbar"), ms); }

export async function gotoIssues(page, ms = 20000) {
  const t0 = Date.now();
  const ret = page.getByText("Return to app", { exact: true }).first(); // Settings covers the navbar
  if (await ret.isVisible().catch(() => false)) { await ret.click().catch(() => {}); await sleep(300); }
  const nav = page.locator(tid("workspace-navbar-issues-button")).first();
  if (!(await nav.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false)))
    return { ok: false, reason: "workspace-navbar-issues-button missing", ms: Date.now() - t0 };
  if (!(await isVisible(page, tid("issues-view")))) await nav.click().catch(() => {});
  const ok = await waitVisible(page, tid("issues-view"), ms);
  return { ok, ms: Date.now() - t0 };
}

// Board state: cards | empty | no-match | split-empty | timeline-empty | loaded | timeout.
export async function waitBoardLoaded(page, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await page.evaluate(() => {
      const v = document.querySelector('[data-testid="issues-view"]');
      if (!v) return null;
      const txt = v.innerText || "";
      if (document.querySelector("[data-issue-id]")) return "cards";
      if (txt.includes("No issues yet")) return "empty";
      if (txt.includes("No issues match")) return "no-match";
      if (txt.includes("Nothing to triage")) return "split-empty";
      if (txt.includes("No issues with dates set")) return "timeline-empty";
      const org = window.__tempoIssues?.organizationId;
      const c = typeof window.__tempoIssuesCache === "function" ? window.__tempoIssuesCache() : null;
      if (org && c && c[org] >= 0 && document.querySelector('[data-testid="issues-column-header"]')) return "loaded";
      return null;
    }).catch(() => null);
    if (s) return { state: s, ms: Date.now() - t0 };
    await sleep(300);
  }
  return { state: "timeout", ms };
}

// Production bridge exposed by the IssuesProvider (no test mode): window.__tempoIssues.
export const bridge = (page) => page.evaluate(() => {
  const b = window.__tempoIssues;
  return b ? { organizationId: b.organizationId ?? null, selectedIssueId: b.selectedIssueId ?? null,
    selectedIssueDocId: b.selectedIssueDocId ?? null, selectedIssueTitle: b.selectedIssueTitle ?? null } : null;
}).catch(() => null);
export const issuesCache = (page) => page.evaluate(() => (typeof window.__tempoIssuesCache === "function" ? window.__tempoIssuesCache() : null)).catch(() => null);
export async function selectIssue(page, humanId) {
  return page.evaluate((id) => (window.__tempoIssues?.selectIssue ? window.__tempoIssues.selectIssue(id) : false), humanId).catch(() => false);
}
export async function clearSelection(page) {
  await page.evaluate(() => window.__tempoIssues?.clearSelection?.()).catch(() => {});
  await sleep(250);
}

// ---------- search and board reading (DOM) ----------
export async function setSearch(page, text) {
  const inp = page.locator(tid("issues-search-input")).first();
  if (!(await inp.count())) return false;
  await inp.fill(text).catch(() => {});
  await sleep(400);
  return true;
}
export async function getSearch(page) { return page.locator(tid("issues-search-input")).first().inputValue().catch(() => null); }

// Cards: [data-issue-id] (board: testid issue-<ID>; list: issue-list-row-<ID>; split: issue-split-row-<ID>).
// Kanban cell: [data-cell-id][data-column-id][data-row-id]. Title: p.line-clamp-2 (card) or span.truncate (row).
export async function readCards(page) {
  return page.evaluate(() => {
    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll("[data-issue-id]")) {
      const id = el.getAttribute("data-issue-id");
      const testid = el.getAttribute("data-testid") || "";
      const key = `${id}|${testid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let title = (el.querySelector("p.line-clamp-2") || el.querySelector("p"))?.textContent?.trim() || "";
      if (!title) {
        const spans = [...el.querySelectorAll("span.truncate")].map((s) => s.textContent.trim());
        title = spans.sort((a, b) => b.length - a.length)[0] || "";
      }
      const cell = el.closest("[data-cell-id]");
      out.push({ id, testid, title, column: cell?.getAttribute("data-column-id") ?? null, row: cell?.getAttribute("data-row-id") ?? null,
        text: (el.innerText || "").replace(/\s+/g, " ").slice(0, 200) });
    }
    return out;
  }).catch(() => []);
}
export async function columnIds(page) {
  return page.locator(tid("issues-column-header")).evaluateAll((n) => n.map((e) => ({
    id: e.getAttribute("data-column-id"), label: (e.innerText || "").split("\n")[0].trim() }))).catch(() => []);
}
export async function filterBarClear(page) {
  // Filter bar (appears with active dimensions): "Clear" button next to Reset/Save. Never click Save.
  const btn = page.locator(tid("issues-view")).getByRole("button", { name: "Clear", exact: true }).first();
  if (!(await btn.count())) return false;
  await btn.click().catch(() => {});
  await sleep(300);
  return true;
}

// Ensures the issue card shows up: search by title; if a saved view filters it out, clears the local filters.
export async function findCard(page, title, { clearFilters = true } = {}) {
  const match = async () => {
    const all = (await readCards(page)).filter((c) => c.title.startsWith(title));
    return all.filter((c) => c.title === title).concat(all.filter((c) => c.title !== title)); // exact first
  };
  await setSearch(page, title);
  let cards = await match();
  let clearedView = false;
  if (!cards.length && clearFilters && (await filterBarClear(page))) {
    clearedView = true;
    await setSearch(page, title);
    cards = await match();
  }
  return { card: cards.find((c) => c.title === title) || null, cards, clearedView };
}
// Does the title belong to the instance base? (base, base-r2, base-more, "base ✏️ edited"...)
export function ownedBy(title, base) { return title === base || title.startsWith(`${base}-`) || title.startsWith(`${base} `); }

// ---------- create modal ----------
export async function openCreateModal(page, via = "button") {
  if (via === "key") { await blurActive(page); await page.keyboard.press("c"); }
  else await page.locator(tid("issues-new-issue-button")).first().click({ timeout: 5000 }).catch(() => {});
  return waitVisible(page, MODAL, 5000);
}
// The X button in the modal header has no aria-label: it is the next sibling of "Expand dialog"/"Collapse dialog".
export function modalCloseButton(page) {
  return page.locator(`${MODAL} button[aria-label="Expand dialog"] + button, ${MODAL} button[aria-label="Collapse dialog"] + button`).first();
}
// Modal property chip (no testid; the visible text is the current value: Feature, Priority, Estimate...).
export async function pickModalChip(page, currentText, optionText) {
  const btn = page.locator(MODAL).getByRole("button", { name: currentText, exact: true }).first();
  if (!(await btn.count())) return { ok: false, reason: `chip "${currentText}" missing` };
  await btn.click().catch(() => {});
  const opt = page.getByRole("option", { name: optionText, exact: true }).first();
  if (!(await opt.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false))) {
    await dismiss(page);
    return { ok: false, reason: `option "${optionText}" missing` };
  }
  await opt.click().catch(() => {});
  await sleep(250);
  return { ok: true };
}

// TipTap editor (contenteditable) within a scope (.issues-detail-editor in the modal and in the detail).
export async function writeRich(page, scopeSel, { replace = false, lines = [], insert = "" } = {}) {
  const ed = page.locator(`${scopeSel} [contenteditable="true"]`).first();
  if (!(await ed.waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false))) return false;
  await ed.click().catch(() => {});
  if (replace) { await page.keyboard.press("Meta+a"); await page.keyboard.press("Backspace"); }
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) await page.keyboard.type(lines[i], { delay: 8 });
    if (i < lines.length - 1) await page.keyboard.press("Enter");
  }
  if (insert) { await page.keyboard.press("Enter"); await page.keyboard.insertText(insert); }
  return true;
}
export async function editorInfo(page, scopeSel) {
  return page.evaluate((sel) => {
    const ed = document.querySelector(`${sel} [contenteditable="true"]`) || document.querySelector(`${sel} .ProseMirror`);
    if (!ed) return null;
    const rtl = [...ed.querySelectorAll("p,li,h1,h2,h3")].find((n) => /[֐-ۿ]/.test(n.textContent));
    return { text: ed.innerText, len: (ed.innerText || "").length, h2: ed.querySelectorAll("h2").length,
      li: ed.querySelectorAll("li").length, strong: ed.querySelectorAll("strong").length,
      rtlDir: rtl ? (rtl.getAttribute("dir") || getComputedStyle(rtl).direction) : null };
  }, scopeSel).catch(() => null);
}

export async function waitToast(page, re, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const txts = await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
    const hit = txts.find((t) => re.test(t));
    if (hit) return hit.replace(/\s+/g, " ").trim();
    await sleep(200);
  }
  return null;
}

// Waits for the bridge to point to a selected issue whose title matches (after Create & Open / click).
export async function waitSelected(page, title, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const b = await bridge(page);
    if (b?.selectedIssueId && (!title || (b.selectedIssueTitle || "").startsWith(title))) return b;
    await sleep(300);
  }
  return null;
}

// ---------- detail ----------
export async function openDetail(page, humanId) {
  const b = await bridge(page);
  if (b?.selectedIssueId === humanId && (await isVisible(page, DETAIL))) return true;
  let ok = await selectIssue(page, humanId);
  if (!ok) {
    const card = page.locator(`[data-issue-id="${humanId}"]`).first();
    if (await card.count()) { await card.click().catch(() => {}); ok = true; }
  }
  return ok && (await waitVisible(page, DETAIL, 8000));
}
export async function closeDetail(page) { await clearSelection(page); return waitHidden(page, DETAIL, 4000); }
export async function detailTitle(page) { return (await page.locator(`${DETAIL} h1`).first().innerText().catch(() => "")).trim(); }
export async function detailText(page) { return page.locator(DETAIL).first().innerText().catch(() => ""); }
// Detail chips have aria-label "<Name>: <value>" (Status, Stage, Priority, Type, Estimate).
export async function detailChips(page) {
  return page.locator(`${DETAIL} button[aria-label*=": "]`).evaluateAll((n) => n.map((e) => e.getAttribute("aria-label"))).catch(() => []);
}
export async function detailChip(page, name) {
  return page.locator(`${DETAIL} button[aria-label^="${name}: "]`).first().getAttribute("aria-label").catch(() => null);
}
export async function setDetailChip(page, name, option) {
  const chip = page.locator(`${DETAIL} button[aria-label^="${name}: "]`).first();
  if (!(await chip.count())) return { ok: false, reason: `chip ${name} missing` };
  const before = await chip.getAttribute("aria-label").catch(() => null);
  await chip.click().catch(() => {});
  const it = page.getByRole("menuitemradio", { name: option, exact: true }).first();
  if (!(await it.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false))) {
    await dismiss(page);
    return { ok: false, reason: `option "${option}" missing`, before };
  }
  await it.click().catch(() => {});
  await sleep(700);
  return { ok: true, before, after: await detailChip(page, name) };
}

// Editable title: h1 becomes a textarea (placeholder "Untitled"); Enter saves, Escape reverts.
export async function editTitle(page, newTitle) {
  const h1 = page.locator(`${DETAIL} h1`).first();
  if (!(await h1.count())) return { ok: false, reason: "detail h1 missing" };
  await h1.click().catch(() => {});
  const ta = page.locator(`${DETAIL} textarea[placeholder="Untitled"]`).first();
  if (!(await ta.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false))) return { ok: false, reason: "title textarea did not appear" };
  await ta.fill(newTitle);
  await ta.press("Enter");
  await sleep(800);
  return { ok: (await detailTitle(page)) === newTitle, now: await detailTitle(page) };
}

// ---------- card context menu ----------
export async function openCardContextMenu(page, humanId) {
  const card = page.locator(`[data-issue-id="${humanId}"]`).first();
  if (!(await card.count())) return false;
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await card.click({ button: "right" }).catch(() => {});
  return page.getByRole("menu").first().waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false);
}
export async function menuItems(page) {
  return page.locator('[role="menu"] [role="menuitem"]').allInnerTexts().then((a) => a.map((s) => s.trim()).filter(Boolean)).catch(() => []);
}
export async function contextSetStage(page, humanId, stageId) {
  if (!(await openCardContextMenu(page, humanId))) return { ok: false, reason: "context menu did not open" };
  const trig = page.locator('[role="menu"]').getByRole("menuitem", { name: "Stage", exact: true }).first();
  if (!(await trig.count())) { await dismiss(page); return { ok: false, reason: '"Stage" submenu missing' }; }
  await trig.hover().catch(() => {});
  await sleep(350);
  const item = page.locator(tid(`issue-stage-menuitem-${stageId}`)).first();
  if (!(await item.isVisible().catch(() => false))) { await trig.click().catch(() => {}); await sleep(300); }
  if (!(await item.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false))) {
    await dismiss(page);
    return { ok: false, reason: `issue-stage-menuitem-${stageId} missing` };
  }
  await item.click().catch(() => {});
  await sleep(900);
  return { ok: true };
}

// ---------- drag-and-drop (dnd-kit, PointerSensor distance 8) ----------
export async function dragCardToAdjacentColumn(page, humanId) {
  const c = (await readCards(page)).find((x) => x.id === humanId && x.column);
  if (!c) return { ok: false, reason: "card not found in a board cell" };
  const cols = (await columnIds(page)).map((x) => x.id);
  const i = cols.indexOf(c.column);
  const target = cols[i + 1] ?? cols[i - 1];
  if (!target) return { ok: false, reason: "no neighboring column", from: c.column };
  const card = page.locator(`[data-issue-id="${humanId}"]`).first();
  let dest = page.locator(`[data-cell-id][data-column-id="${target}"][data-row-id="${c.row}"]`).first();
  if (!(await dest.count())) dest = page.locator(`[data-cell-id][data-column-id="${target}"]`).first();
  if (!(await dest.count())) return { ok: false, reason: "destination cell missing", from: c.column, to: target };
  await dest.scrollIntoViewIfNeeded().catch(() => {});
  await card.scrollIntoViewIfNeeded().catch(() => {});
  const a = await card.boundingBox(), b = await dest.boundingBox();
  if (!a || !b) return { ok: false, reason: "null boundingBox", from: c.column, to: target };
  const sx = a.x + a.width / 2, sy = a.y + Math.min(20, a.height / 2);
  const tx = b.x + b.width / 2, ty = b.y + Math.min(40, Math.max(10, b.height / 2));
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 12, sy + 12, { steps: 4 }); // > 8 px activates the sensor
  await page.mouse.move(tx, ty, { steps: 25 });
  await sleep(350);
  await page.mouse.move(tx, ty + 4, { steps: 3 });
  await sleep(250);
  await page.mouse.up();
  await sleep(1500);
  const after = (await readCards(page)).find((x) => x.id === humanId && x.column);
  return { ok: after?.column === target, from: c.column, to: target, now: after?.column ?? null };
}

// ---------- labels / comments ----------
export async function addLabelInDetail(page, name) {
  const trig = page.locator(`${DETAIL} [aria-label="Add label"]`).first();
  if (!(await trig.count())) return { ok: false, reason: '"Add label" missing in the detail' };
  await trig.click().catch(() => {});
  const inp = page.getByPlaceholder("Change or add labels...").first();
  if (!(await inp.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false))) return { ok: false, reason: "label search missing" };
  await inp.fill(name);
  await sleep(400);
  let created = false;
  const existing = page.getByRole("option", { name, exact: true }).first();
  if (await existing.count()) await existing.click().catch(() => {});
  else {
    const create = page.locator(tid("issues-label-create-option")).first(); // 'Add "<name>" label'
    if (!(await create.count())) { await dismiss(page); return { ok: false, reason: "issues-label-create-option missing" }; }
    await create.click().catch(() => {});
    const color = page.locator(tid("issues-label-color-option")).first(); // 'Pick a color for "<name>"'
    if (!(await color.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false))) { await dismiss(page); return { ok: false, reason: "issues-label-color-option missing" }; }
    await color.click().catch(() => {});
    created = true;
  }
  await sleep(900);
  await dismiss(page);
  return { ok: (await detailText(page)).includes(name), created };
}

export async function addComment(page, text) {
  const inp = page.locator(`${DETAIL} ${tid("issue-comment-input")}`).first();
  if (!(await inp.count())) return { ok: false, reason: "issue-comment-input missing" };
  await inp.scrollIntoViewIfNeeded().catch(() => {});
  await inp.fill(text);
  const btn = page.locator(`${DETAIL} ${tid("issues-activity-feed")}`).getByRole("button", { name: "Comment", exact: true }).first();
  if (await btn.count()) await btn.click().catch(() => {});
  else await inp.press("Meta+Enter").catch(() => {});
  const ok = await page.waitForFunction((t) => (document.querySelector('[data-testid="issues-activity-feed"]')?.innerText || "").includes(t),
    text, { timeout: 8000 }).then(() => true, () => false);
  return { ok, cleared: (await inp.inputValue().catch(() => "x")) === "" };
}

// ---------- display (view mode, grouping, ordering) ----------
async function displayPopup(page) {
  const sel = page.locator(tid("issues-grouping-select")).first();
  const pop = sel.locator('xpath=ancestor::*[@role="dialog"][1]');
  return (await pop.count()) ? pop : page.locator("body");
}
export async function openDisplay(page) {
  if (await isVisible(page, tid("issues-grouping-select"))) return true;
  const b = page.locator(tid("issues-display-button")).first();
  if (!(await b.count())) return false;
  await b.click().catch(() => {});
  return waitVisible(page, tid("issues-grouping-select"), 3000);
}
export async function closeDisplay(page) {
  if (await isVisible(page, tid("issues-grouping-select"))) {
    await page.locator(tid("issues-display-button")).first().click().catch(() => {});
    await sleep(250);
    if (await isVisible(page, tid("issues-grouping-select"))) { await page.keyboard.press("Escape"); await sleep(200); }
  }
}
// Segmented List / Board / Split / Timeline (buttons with aria-pressed).
export async function setViewMode(page, label) {
  if (!(await openDisplay(page))) return { ok: false, reason: "Display popover did not open" };
  const pop = await displayPopup(page);
  const btn = pop.locator("button[aria-pressed]", { hasText: label }).first();
  if (!(await btn.count())) { await closeDisplay(page); return { ok: false, reason: `mode "${label}" missing` }; }
  await btn.click().catch(() => {});
  await sleep(500);
  const pressed = await btn.getAttribute("aria-pressed").catch(() => null);
  await closeDisplay(page);
  return { ok: pressed === "true" };
}
export async function selectText(page, testid) { return (await page.locator(tid(testid)).first().innerText().catch(() => "")).trim(); }
export async function chooseSelect(page, testid, optionId) {
  const trig = page.locator(tid(testid)).first();
  if (!(await trig.count())) return { ok: false, reason: `${testid} missing` };
  await trig.click().catch(() => {});
  const opt = page.locator(tid(`${testid}-option-${optionId}`)).first();
  if (!(await opt.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false))) {
    await page.keyboard.press("Escape");
    return { ok: false, reason: `${testid}-option-${optionId} missing` };
  }
  await opt.click().catch(() => {});
  await sleep(500);
  return { ok: true, now: await selectText(page, testid) };
}
// Ordering: trigger issues-order-field-trigger, options issues-order-field-option-<id> (different prefixes).
export async function chooseOrder(page, id) {
  const trig = page.locator(tid("issues-order-field-trigger")).first();
  if (!(await trig.count())) return { ok: false, reason: "issues-order-field-trigger missing" };
  await trig.click().catch(() => {});
  const opt = page.locator(tid(`issues-order-field-option-${id}`)).first();
  if (!(await opt.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false))) {
    await page.keyboard.press("Escape");
    return { ok: false, reason: `issues-order-field-option-${id} missing` };
  }
  await opt.click().catch(() => {});
  await sleep(400);
  return { ok: true, now: await selectText(page, "issues-order-field-trigger") };
}
export const GROUP_LABEL_TO_ID = { Stage: "stage", Status: "status", Assignee: "assignee", Priority: "priority", Type: "type",
  Label: "label", Estimate: "estimate", Agent: "agent", None: "none" };
export const ORDER_LABEL_TO_ID = { Manual: "manual", Priority: "priority", Created: "created", Updated: "updated", Title: "title",
  Type: "type", Stage: "stage", Status: "status", Assignee: "assignee", Estimate: "estimate" };

// ---------- a11y ----------
export async function unnamedButtons(page, scopeSel, limit = 40) {
  return page.evaluate(({ sel, limit }) => {
    const root = document.querySelector(sel);
    if (!root) return null;
    const out = [];
    for (const el of root.querySelectorAll('button, [role="button"]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const name = (el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || "").trim();
      if (name || el.getAttribute("aria-labelledby")) continue;
      if (el.querySelector("svg title, img[alt]:not([alt=''])")) continue;
      out.push({ testid: el.getAttribute("data-testid"), html: el.outerHTML.replace(/\s+/g, " ").slice(0, 160) });
      if (out.length >= limit) break;
    }
    return out;
  }, { sel: scopeSel, limit }).catch(() => null);
}

// ---------- issue ↔ doc link ----------
// "Add artifact" (issues-context-add) opens the context picker (cmdk, groups Docs/Issues/Canvases/Workspaces).
export async function linkDocInDetail(page, query) {
  const add = page.locator(`${DETAIL} ${tid("issues-context-add")}`).first();
  if (!(await add.count())) return { ok: false, reason: "issues-context-add missing" };
  await add.scrollIntoViewIfNeeded().catch(() => {});
  await add.click().catch(() => {});
  const inp = page.getByPlaceholder("Search projects, canvases, workspaces, docs...").first();
  if (!(await inp.waitFor({ state: "visible", timeout: 4000 }).then(() => true, () => false))) return { ok: false, reason: "context picker search missing" };
  await inp.fill(query);
  let picked = null;
  for (let i = 0; i < 25 && !picked; i++) {
    picked = await page.evaluate((q) => {
      document.querySelectorAll("[data-qa-pick]").forEach((e) => e.removeAttribute("data-qa-pick"));
      for (const h of document.querySelectorAll("[cmdk-group-heading]")) {
        if (h.textContent.trim() !== "Docs") continue;
        for (const it of h.closest("[cmdk-group]")?.querySelectorAll("[cmdk-item]") || []) {
          const t = (it.innerText || "").trim();
          if (t.includes(q)) { it.setAttribute("data-qa-pick", "1"); return t.split("\n")[0].trim(); }
        }
      }
      return null;
    }, query).catch(() => null);
    if (!picked) await sleep(400);
  }
  if (!picked) { await dismiss(page); return { ok: false, reason: `no doc with "${query}" in the picker's Docs group` }; }
  await page.locator('[data-qa-pick="1"]').first().click().catch(() => {});
  await sleep(1500);
  await dismiss(page);
  return { ok: (await detailText(page)).includes(picked), doc: picked };
}
// Removes the link via the artifact card context menu ("Remove link").
export async function unlinkInDetail(page, title) {
  const marked = await page.evaluate((t) => {
    document.querySelectorAll("[data-qa-pick]").forEach((e) => e.removeAttribute("data-qa-pick"));
    const sec = document.querySelector('[data-testid="issues-detail-view"] button[aria-label$=" Artifacts"]')?.parentElement;
    if (!sec) return false;
    const hit = [...sec.querySelectorAll("*")].reverse().find((e) => e.children.length === 0 && (e.textContent || "").includes(t));
    if (!hit) return false;
    hit.setAttribute("data-qa-pick", "1");
    return true;
  }, title).catch(() => false);
  if (!marked) return { ok: false, reason: "artifact not found in the Artifacts section" };
  await page.locator('[data-qa-pick="1"]').first().click({ button: "right" }).catch(() => {});
  const rm = page.locator(tid("context-menu-remove-link")).first();
  if (!(await rm.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false))) { await dismiss(page); return { ok: false, reason: "context-menu-remove-link missing" }; }
  await rm.click().catch(() => {});
  await sleep(1000);
  const sec = await page.evaluate(() => document.querySelector('[data-testid="issues-detail-view"] button[aria-label$=" Artifacts"]')?.parentElement?.innerText || "").catch(() => "");
  return { ok: !sec.includes(title) };
}

// ---------- safe deletion ----------
export async function deleteIssueSafe(page, humanId, mustStartWith = PREFIX) {
  if (!(await openDetail(page, humanId))) return { ok: false, reason: "detail did not open" };
  const title = await detailTitle(page);
  if (!title.startsWith(mustStartWith)) { await clearSelection(page); return { ok: false, reason: `title outside the prefix: "${title.slice(0, 60)}"` }; }
  const actions = page.locator(tid("issues-detail-actions")).first();
  if (!(await actions.count())) return { ok: false, reason: "issues-detail-actions missing" };
  await actions.click().catch(() => {});
  const del = page.locator(tid("issues-detail-delete")).first();
  if (!(await del.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false))) { await dismiss(page); return { ok: false, reason: "issues-detail-delete missing" }; }
  await del.click().catch(() => {});
  const confirm = page.locator(tid("issues-detail-delete-confirm")).first();
  if (!(await confirm.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false))) return { ok: false, reason: "issues-detail-delete-confirm missing" };
  // The dialog quotes the ID in <strong>: check before confirming.
  const dlg = page.locator('[role="dialog"],[role="alertdialog"]').filter({ has: confirm }).first();
  const dlgText = await dlg.innerText().catch(() => "");
  if (!dlgText.includes(humanId)) {
    await dlg.getByRole("button", { name: "Cancel", exact: true }).first().click().catch(() => {});
    return { ok: false, reason: "delete dialog does not quote the expected ID" };
  }
  await confirm.click().catch(() => {});
  const gone = await page.waitForFunction((id) => !document.querySelector(`[data-issue-id="${CSS.escape(id)}"]`) && !document.querySelector('[data-testid="issues-detail-view"]'),
    humanId, { timeout: 8000 }).then(() => true, () => false);
  return { ok: gone, title };
}

// Deletes ONLY issues whose title starts with `prefix`; `skip(card)` protects issues of other instances in the same run.
export async function cleanupByPrefix(page, { prefix = PREFIX, skip = () => false, rounds = 3 } = {}) {
  const deleted = [], failed = [], skipped = [];
  const tried = new Set();
  for (let r = 0; r < rounds; r++) {
    await clearSelection(page);
    await setSearch(page, prefix);
    await sleep(700);
    const cards = (await readCards(page)).filter((c) => c.title.startsWith(prefix) && !tried.has(c.id));
    const todo = [];
    for (const c of cards) { if (skip(c)) { skipped.push(c.id); tried.add(c.id); } else todo.push(c); }
    if (!todo.length) break;
    for (const c of todo) {
      tried.add(c.id);
      const res = await deleteIssueSafe(page, c.id, prefix);
      (res.ok ? deleted : failed).push({ id: c.id, title: c.title, reason: res.reason });
    }
  }
  await setSearch(page, "");
  return { deleted, failed, skipped };
}
