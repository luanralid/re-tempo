// qa/suites/80-cross-cutting/ui-logged.mjs — LOGGED-IN UI helpers used by t-cross-cutting.
// -----------------------------------------------------------------------------
// Selectors from the inventory (docs/qa/02 §3.2/3.5/3.7). Everything tolerant: returns
// booleans/structures. Data ALWAYS created with the QA-AUTO-cross-cutting- prefix.
import * as C from "./common.mjs";

export const PREFIX = "QA-AUTO-cross-cutting-";
const tid = (id) => `[data-testid="${id}"]`;

export const NAV = {
  chat: { btn: tid("workspace-navbar-chat-button"), ready: [tid("workspaces-welcome"), tid("new-chat-empty-state"), tid("chat-empty-state")] },
  docs: { btn: tid("workspace-navbar-docs-button"), ready: [tid("docs-view-sidebar"), tid("docs-view-tab-bar")] },
  design: { btn: tid("workspace-navbar-design-button"), ready: [tid("canvas-homepage"), tid("canvas-grid-empty"), tid("design-homepage-empty-workspace"), tid("design-homepage-no-canvas-config")] },
  issues: { btn: tid("workspace-navbar-issues-button"), ready: [tid("issues-board"), tid("issues-view")] },
  agents: { btn: tid("workspace-navbar-agents-button"), ready: [tid("agents-list-sidebar"), '[data-testid^="agents-landing"]', tid("agent-list-empty")] },
};

async function clickSel(page, sel, timeout = 5000) {
  try { await page.locator(sel).first().click({ timeout }); return true; } catch { return false; }
}

async function visibleAny(page, sels, timeout) {
  const sel = sels.join(", ");
  try { await page.locator(sel).first().waitFor({ state: "visible", timeout }); return true; } catch { return false; }
}

export async function inSettings(page) {
  return page.getByRole("button", { name: "Return to app" }).first().isVisible().catch(() => false);
}

export async function leaveSettings(page) {
  if (!(await inSettings(page))) return true;
  try { await page.getByRole("button", { name: "Return to app" }).first().click({ timeout: 3000 }); await C.sleep(300); return true; } catch { return false; }
}

// Navigates to a navbar section and measures click -> visible container.
export async function goto(page, name, { timeout = 15000 } = {}) {
  if (name === "settings") {
    const t0 = Date.now();
    const ok = await clickSel(page, 'button[aria-label="Settings"]');
    const ready = ok && (await page.getByRole("button", { name: "Return to app" }).first().waitFor({ state: "visible", timeout }).then(() => true).catch(() => false));
    return { ok: !!ready, ms: Date.now() - t0 };
  }
  await leaveSettings(page);
  const n = NAV[name];
  if (!n) return { ok: false, ms: 0 };
  const t0 = Date.now();
  const ok = await clickSel(page, n.btn);
  const ready = ok && (await visibleAny(page, n.ready, timeout));
  return { ok: !!ready, clicked: ok, ms: Date.now() - t0 };
}

export async function navPresent(page) {
  const out = {};
  for (const [k, v] of Object.entries(NAV)) out[k] = (await page.locator(v.btn).count()) > 0;
  return out;
}

// ---- text wait with a timestamp INSIDE the renderer -------------------------
// Installs a MutationObserver that records Date.now() when `text` appears (or disappears).
export async function armTextWatch(page, key, text, { appear = true } = {}) {
  await page.evaluate(([key, text, appear]) => {
    window.__qaWatch = window.__qaWatch || {};
    const has = () => (document.body.innerText || "").includes(text);
    const w = (window.__qaWatch[key] = { armedAt: Date.now(), at: null, appear });
    const check = () => { if (w.at == null && has() === appear) { w.at = Date.now(); obs.disconnect(); clearInterval(iv); } };
    const obs = new MutationObserver(check);
    obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    const iv = setInterval(check, 100); // innerText depends on layout; polling as reinforcement
    check();
  }, [key, text, appear]);
}

export async function waitTextWatch(page, key, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const at = await page.evaluate((k) => (window.__qaWatch && window.__qaWatch[k] ? window.__qaWatch[k].at : null), key).catch(() => null);
    if (at != null) return at;
    await C.sleep(100);
  }
  return null;
}

// ---- Issues ----------------------------------------------------------------
// Flows aligned with what t-docs validated in qa/suites/50-docs/issues-lib.mjs
// (copied, not imported): Escape inside Issues closes the modal/detail via the
// global handler, so we NEVER use Escape here; cards = [data-issue-id];
// detail title = h1 -> textarea[placeholder="Untitled"]; delete via
// issues-detail-actions -> issues-detail-delete -> confirm (the dialog quotes the ID).
const MODAL = tid("issues-create-modal");
const DETAIL = tid("issues-detail-view");

export async function setIssueSearch(page, text) {
  const inp = page.locator(tid("issues-search-input")).first();
  if (!(await inp.count())) return false;
  await inp.fill(text).catch(() => {});
  await C.sleep(400);
  return true;
}

export async function readCards(page) {
  return page.evaluate(() => {
    const out = new Map();
    for (const el of document.querySelectorAll("[data-issue-id]")) {
      const id = el.getAttribute("data-issue-id");
      if (out.has(id)) continue;
      let title = (el.querySelector("p.line-clamp-2") || el.querySelector("p"))?.textContent?.trim() || "";
      if (!title) title = [...el.querySelectorAll("span.truncate")].map((x) => x.textContent.trim()).sort((p, q) => q.length - p.length)[0] || "";
      out.set(id, { id, title });
    }
    return [...out.values()];
  }).catch(() => []);
}

async function closeModalIfOpen(page) {
  if (!(await page.locator(MODAL).first().isVisible().catch(() => false))) return;
  const x = page.locator(`${MODAL} button[aria-label="Expand dialog"] + button, ${MODAL} button[aria-label="Collapse dialog"] + button`).first();
  await x.click({ timeout: 2000 }).catch(() => {});
  const conf = page.locator(tid("issues-create-discard-confirm-button")).first();
  if (await conf.isVisible().catch(() => false)) await conf.click().catch(() => {});
  await C.sleep(300);
}

async function clearIssueSelection(page) {
  await page.evaluate(() => window.__tempoIssues?.clearSelection?.()).catch(() => {});
  await C.sleep(250);
}

export async function createIssue(page, title) {
  const g = await goto(page, "issues");
  if (!g.ok) return { ok: false, step: "goto-issues" };
  await clearIssueSelection(page);
  if (!(await clickSel(page, tid("issues-new-issue-button")))) return { ok: false, step: "new-issue-button" };
  const input = page.locator(tid("issues-create-title-input")).first();
  try { await input.waitFor({ state: "visible", timeout: 8000 }); } catch { return { ok: false, step: "create-modal" }; }
  await input.fill(title);
  const submit = page.locator(tid("issues-create-submit")).first();
  for (let i = 0; i < 20 && (await submit.isDisabled().catch(() => true)); i++) await C.sleep(100);
  // timestamp in the renderer at the instant of the submit click
  const submitAt = await page.evaluate((sel) => { const b = document.querySelector(sel); if (!b || b.disabled) return null; const t = Date.now(); b.click(); return t; }, tid("issues-create-submit"));
  if (submitAt == null) { await closeModalIfOpen(page); return { ok: false, step: "submit" }; }
  await page.locator(MODAL).first().waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  await closeModalIfOpen(page); // "create more" on leaves the modal open
  return { ok: true, submitAt };
}

export async function findIssue(page, title, { search = true } = {}) {
  await goto(page, "issues");
  if (search) await setIssueSearch(page, title);
  for (let i = 0; i < 20; i++) {
    const c = (await readCards(page)).find((x) => x.title === title);
    if (c) return c;
    await C.sleep(250);
  }
  return null;
}

export async function openIssue(page, title) {
  const card = await findIssue(page, title);
  if (!card) return null;
  const ok = await page.evaluate((id) => (window.__tempoIssues?.selectIssue ? window.__tempoIssues.selectIssue(id) : false), card.id).catch(() => false);
  if (!ok) await page.locator(`[data-issue-id="${card.id}"]`).first().click({ timeout: 4000 }).catch(() => {});
  const vis = await page.locator(DETAIL).first().waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false);
  return vis ? card : null;
}

// Returns the renderer's Date.now() timestamp at the instant of Enter (commit).
export async function editIssueTitle(page, oldTitle, newTitle) {
  const card = await openIssue(page, oldTitle);
  if (!card) return { ok: false, step: "open" };
  const h1 = page.locator(`${DETAIL} h1`).first();
  if (!(await h1.count())) return { ok: false, step: "h1" };
  await h1.click().catch(() => {});
  const ta = page.locator(`${DETAIL} textarea[placeholder="Untitled"]`).first();
  if (!(await ta.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false))) return { ok: false, step: "textarea" };
  await ta.fill(newTitle);
  const commitAt = await page.evaluate(() => Date.now());
  await ta.press("Enter");
  await C.sleep(600);
  const now = (await h1.innerText().catch(() => "")).trim();
  await clearIssueSelection(page);
  return { ok: now === newTitle, commitAt, id: card.id, now: now.slice(0, 80) };
}

export async function deleteIssue(page, title, { mustStartWith = PREFIX } = {}) {
  if (!title.startsWith(mustStartWith)) return { ok: false, step: "outside-prefix" };
  const card = await openIssue(page, title);
  if (!card) return { ok: false, step: "open" };
  const h = (await page.locator(`${DETAIL} h1`).first().innerText().catch(() => "")).trim();
  if (!h.startsWith(mustStartWith)) { await clearIssueSelection(page); return { ok: false, step: "detail-title-outside-prefix" }; }
  if (!(await clickSel(page, tid("issues-detail-actions"), 3000))) return { ok: false, step: "detail-actions" };
  if (!(await clickSel(page, tid("issues-detail-delete"), 3000))) return { ok: false, step: "delete-item" };
  const confirm = page.locator(tid("issues-detail-delete-confirm")).first();
  if (!(await confirm.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false))) return { ok: false, step: "confirm" };
  const dlgText = await page.locator('[role="dialog"],[role="alertdialog"]').filter({ has: confirm }).first().innerText().catch(() => "");
  if (!dlgText.includes(card.id)) {
    await page.getByRole("button", { name: "Cancel", exact: true }).first().click().catch(() => {});
    return { ok: false, step: "dialog-without-id" };
  }
  const deleteAt = await page.evaluate((sel) => { const t = Date.now(); document.querySelector(sel)?.click(); return t; }, tid("issues-detail-delete-confirm"));
  const gone = await page.waitForFunction((id) => !document.querySelector(`[data-issue-id="${CSS.escape(id)}"]`), card.id, { timeout: 8000 }).then(() => true, () => false);
  return { ok: gone, deleteAt, id: card.id };
}

// Titles with the prefix (board search). Clears the search at the end.
export async function listPrefixedIssues(page, prefix = PREFIX) {
  await goto(page, "issues");
  await clearIssueSelection(page);
  await setIssueSearch(page, prefix);
  await C.sleep(800);
  const t = (await readCards(page)).filter((c) => c.title.startsWith(prefix)).map((c) => c.title);
  await setIssueSearch(page, "");
  return [...new Set(t)];
}

// ---- Docs ------------------------------------------------------------------
// Mapped on qa-8 (2026-10-16): "New doc" creates a doc "Untitled"; the title is a
// <textarea> ALREADY FILLED with "Untitled" (value, not placeholder) — hence
// we use fill(). Enter in the title moves focus to the body (Tiptap .ProseMirror).
// Delete: right-click on the sidebar item -> docs-sidebar-context-menu-delete
// -> "Delete doc" dialog -> "Delete" button.
const PM = '.ProseMirror[contenteditable="true"]:visible';

export async function createDoc(page, title, body = "") {
  if (!title.startsWith(PREFIX)) return { ok: false, step: "outside-prefix" };
  await goto(page, "docs");
  const btn = page.getByRole("button", { name: "New doc", exact: true }).first();
  if (!(await btn.isVisible().catch(() => false))) {
    if (!(await page.getByRole("button", { name: "Create PRD", exact: true }).first().click({ timeout: 4000 }).then(() => true, () => false))) return { ok: false, step: "new-doc" };
  } else await btn.click().catch(() => {});
  const marked = await (async () => {
    for (let i = 0; i < 30; i++) {
      const ok = await page.evaluate(() => {
        const v = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const t = [...document.querySelectorAll("textarea")].filter(v).find((e) => e.value === "Untitled");
        if (!t) return false;
        document.querySelectorAll("[data-qa-doc-title]").forEach((x) => x.removeAttribute("data-qa-doc-title"));
        t.setAttribute("data-qa-doc-title", "1");
        return true;
      }).catch(() => false);
      if (ok) return true;
      await C.sleep(200);
    }
    return false;
  })();
  if (!marked) return { ok: false, step: "title" };
  const ta = page.locator('[data-qa-doc-title="1"]').first();
  const typedAt = await page.evaluate(() => Date.now());
  await ta.fill(title);
  await ta.press("Enter");
  if (body) { await C.sleep(300); await page.keyboard.type(body, { delay: 2 }); }
  await C.sleep(1200);
  const inSidebar = await page.locator(tid("docs-view-sidebar")).getByText(title, { exact: true }).count();
  return { ok: inSidebar > 0, typedAt };
}

export async function openDoc(page, title) {
  await goto(page, "docs");
  try {
    await page.locator(tid("docs-view-sidebar")).getByText(title, { exact: true }).first().click({ timeout: 10000 });
    await page.locator(PM).first().waitFor({ state: "visible", timeout: 10000 });
    return true;
  } catch { return false; }
}

export async function docText(page) {
  return page.locator(PM).first().innerText().catch(() => "");
}

export async function appendToDoc(page, text) {
  const ed = page.locator(PM).first();
  try { await ed.click({ timeout: 5000 }); } catch { return { ok: false }; }
  await page.keyboard.press("Meta+ArrowDown").catch(() => {});
  await page.keyboard.press("Enter");
  const typedAt = await page.evaluate(() => Date.now());
  await page.keyboard.type(text, { delay: 3 });
  return { ok: true, typedAt };
}

export async function deleteDoc(page, title) {
  if (!title.startsWith(PREFIX)) return { ok: false, step: "outside-prefix" };
  await goto(page, "docs");
  try {
    const item = page.locator(tid("docs-view-sidebar")).getByText(title, { exact: true }).first();
    await item.click({ button: "right", timeout: 8000 });
    await page.locator(tid("docs-sidebar-context-menu-delete")).first().click({ timeout: 5000 });
    const dlg = page.locator('[role="dialog"]').filter({ hasText: "Delete doc" }).first();
    await dlg.waitFor({ state: "visible", timeout: 5000 });
    if (!(await dlg.innerText()).includes(title)) { await dlg.getByRole("button", { name: "Cancel", exact: true }).click().catch(() => {}); return { ok: false, step: "dialog-without-title" }; }
    const deleteAt = await page.evaluate(() => Date.now());
    await dlg.getByRole("button", { name: "Delete", exact: true }).click({ timeout: 3000 });
    const gone = await page.locator(tid("docs-view-sidebar")).getByText(title, { exact: true }).first().waitFor({ state: "detached", timeout: 8000 }).then(() => true, () => false);
    return { ok: gone, deleteAt };
  } catch (e) { return { ok: false, step: String(e.message).slice(0, 80) }; }
}

export async function listPrefixedDocs(page, prefix = PREFIX) {
  await goto(page, "docs");
  await C.sleep(1200);
  return page.evaluate((prefix) => {
    const sb = document.querySelector('[data-testid="docs-view-sidebar"]');
    if (!sb) return [];
    return [...new Set([...sb.querySelectorAll("*")].filter((e) => e.childElementCount === 0).map((e) => e.textContent.trim()).filter((t) => t.startsWith(prefix)))].slice(0, 50);
  }, prefix);
}
