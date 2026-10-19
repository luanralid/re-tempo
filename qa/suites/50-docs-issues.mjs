// qa/suites/50-docs-issues.mjs — Issues / Kanban in Tempo 0.0.121 (F-110..F-118, I-120..I-130).
// -----------------------------------------------------------------------------
// Requires a LOGGED-IN profile (the board belongs to the org in Convex):
//   QA_RUNID=<id> node run.mjs --suite 50-docs-issues --profile qa-5
// Writes to the account: creates issues "QA-AUTO-docs-<runid>-<inst>[...]", 1 label "QA-AUTO-docs-label"
// (reused: there is no UI to delete a label), a comment and a link to a QA-AUTO doc. The last
// test deletes ONLY issues whose title starts with "QA-AUTO-docs-" (checks title and ID first).
// Never: assign an agent, send chat, Create workspaces, Copy ID (real clipboard), Save view,
// Cmd+S (saves the active view) or Cmd+L (attaches to chat).
// Known risk: user agents with issue.created/moved/labeled/commented triggers
// may fire on these actions. Run in a test org or with those agents turned off.
//
// Contrato: default = { name, tests:[{ name, async fn(ctx) }] }.
// ctx = { instance, page, collectors, checker, runDir, instDir, lib, rec }.
// Tolerant tests: a missing selector becomes a check with the finding + rec.notes, without throwing.
import * as L from "./50-docs/issues-lib.mjs";

const { tid, DETAIL, MODAL, sleep } = L;
const STATE = new Map(); // per instance (the runner runs instances in the same process)

function st(ctx) {
  const id = ctx.instance?.id || "x";
  if (!STATE.has(id)) STATE.set(id, { created: [] });
  const s = STATE.get(id);
  if (!s.title) {
    s.title = L.issueTitle(id, ctx.repeatIndex || 1);
    s.base = L.baseFor(id);
  }
  return s;
}
function note(ctx, msg) { ctx.rec.notes = ctx.rec.notes ? `${ctx.rec.notes} | ${msg}` : msg; }
function need(ctx, cond, label) {
  if (!cond) { ctx.checker.ok(false, `precondition: ${label}`); note(ctx, `skipped: ${label}`); }
  return !!cond;
}
async function shot(ctx, name) {
  const f = await ctx.lib.ui.screenshot(ctx.page, ctx.instDir, `issues-${name}`);
  if (f) ctx.rec.screenshots.push(f);
}
// Returns to a clean board (no detail/modal), in Board mode, with the given search.
// The 1st saved view is applied on its own and may bring List/Split: force Board (local state, never saved).
async function toBoard(ctx, search = "") {
  const { page } = ctx;
  await L.dismiss(page);
  if (await L.isVisible(page, MODAL)) await page.keyboard.press("Escape");
  await L.clearSelection(page);
  const r = await L.gotoIssues(page);
  if (!r.ok) return false;
  if (!(await L.count(page, tid("issues-board-scroll")))) {
    const vm = await L.setViewMode(page, "Board");
    if (!vm.ok) note(ctx, `could not force Board mode: ${vm.reason || "?"}`);
  }
  await L.setSearch(page, search);
  return true;
}
// Opens the detail of the run's main issue (via the window.__tempoIssues bridge or a card click).
async function needDetail(ctx) {
  const s = st(ctx);
  if (!need(ctx, s.humanId, "QA issue created (create-full-issue test)")) return false;
  await L.dismiss(ctx.page);
  const ok = await L.openDetail(ctx.page, s.humanId);
  ctx.checker.ok(ok, `detail of ${s.humanId} opens`);
  return ok;
}

const MD_LINES = (runid) => [
  "## QA Title ✅",
  "Paragraph with **bold** and accents caf\u00e9 na\u00efve r\u00e9sum\u00e9 日本語 🚀🎉",
  "- item one",
  "item two",
  "", // Enter on an empty item leaves the list
  "مرحبا بالعالم — שלום עולם (RTL)",
  `QA-MARK-${runid}`,
];
const LONG = (runid) => `${Array.from({ length: 60 }, (_, i) => `Long line ${i} of the QA text with unicode \u00e7 \u00fc 🧪.`).join(" ")} QA-LONG-${runid}-END`;

export default {
  name: "50-docs-issues",
  tests: [
    {
      name: "navigate-to-issues",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        const shell = await L.waitShell(page, 90000);
        rec.screen = await ctx.lib.ui.detectScreen(page);
        if (!need(ctx, shell, "app navbar visible (logged-in profile)")) return;
        const r = await L.gotoIssues(page);
        rec.navMs = r.ms;
        checker.ok(r.ok, "Issues button opens issues-view (I-120)", r.reason || `ms=${r.ms}`);
        if (!r.ok) return;
        const load = await L.waitBoardLoaded(page);
        rec.boardLoad = load;
        rec.initialMode = (await L.count(page, tid("issues-board-scroll"))) ? "board"
          : (await L.count(page, tid("issues-list-scroll"))) ? "list"
          : (await L.count(page, tid("issues-split-view"))) ? "split" : "other/timeline";
        checker.ok(load.state !== "timeout", "board loads (cards, empty or no-match)", JSON.stringify(load));
        const b = await L.bridge(page);
        rec.bridgeHasOrg = !!b?.organizationId;
        checker.ok(!!b?.organizationId, "window.__tempoIssues bridge exposes organizationId (Convex logged in)");
        const cache = await L.issuesCache(page);
        if (cache && b?.organizationId) rec.issueCountOrg = cache[b.organizationId];
        await shot(ctx, "board-initial");
      },
    },
    {
      name: "board-initial-state",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        if (!need(ctx, await toBoard(ctx), "Issues reachable")) return;
        const ids = ["issues-board", "issues-new-issue-button", "issues-search-input", "issues-filter-add-button", "issues-display-button"];
        for (const id of ids) checker.ok(await L.count(page, tid(id)), `${id} present`);
        const optional = {};
        for (const id of ["issues-view-tab-bar", "issues-sidebar", "issues-ai-chat-toggle-icon", "issues-board-scroll", "issues-list-scroll", "issues-split-view"])
          optional[id] = await L.count(page, tid(id));
        rec.optional = optional;
        const cols = await L.columnIds(page);
        rec.columns = cols;
        if (await L.openDisplay(page)) {
          rec.grouping = await L.selectText(page, "issues-grouping-select");
          rec.subgrouping = await L.selectText(page, "issues-subgrouping-select");
          rec.ordering = await L.selectText(page, "issues-order-field-trigger");
          await L.closeDisplay(page);
        } else note(ctx, "Display popover did not open");
        const txt = await page.locator(tid("issues-view")).innerText().catch(() => "");
        const empty = txt.includes("No issues yet");
        rec.emptyState = empty;
        if (empty) {
          checker.ok(txt.includes("Create your first issue"), "empty state with description (No issues yet)");
          checker.ok(await page.getByRole("button", { name: "Add issue", exact: true }).count(), 'empty state offers "Add issue"');
        } else checker.ok(cols.length > 0 || txt.includes("No issues match") || txt.includes("Nothing to triage"),
          "board with columns (or active view without results)", `columns=${cols.length}`);
        // Oracle F-110: docs say Backlog/In Progress/In Review/Done. In the bundle: status Triage/In Progress/
        // In Review/Done/Cancelled and columns grouped by STAGE by default (Backlog is a Triage stage).
        const labels = cols.map((c) => c.label);
        rec.f110 = { docs: ["Backlog", "In Progress", "In Review", "Done"], seen: labels };
        if (rec.grouping && rec.grouping !== "Stage") note(ctx, `current grouping "${rec.grouping}" (code default: Stage; the active view may change it)`);
        await shot(ctx, "board-state");
      },
    },
    {
      name: "create-modal-validation",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        const s = st(ctx);
        if (!need(ctx, await toBoard(ctx), "Issues reachable")) return;
        if (!need(ctx, await L.openCreateModal(page, "button"), "issues-create-modal opens via the Issue button")) return;
        const act = await L.activeTestId(page);
        checker.equal(act?.testid, "issues-create-title-input", "initial focus on the title (autoFocus)");
        checker.ok(await page.locator(tid("issues-create-submit")).isDisabled(), "Create disabled without a title");
        checker.ok(await page.locator(tid("issues-create-and-open")).isDisabled(), "Create & Open disabled without a title");
        const tmp = `${s.base}-tmp-do-not-create`;
        const title = page.locator(tid("issues-create-title-input")).first();
        await title.fill(tmp);
        await title.press("Enter"); // Plain Enter is blocked (only Cmd/Ctrl+Enter submits)
        await sleep(300);
        checker.ok(await L.isVisible(page, MODAL), "Enter in the title neither submits nor closes");
        checker.equal(await title.inputValue(), tmp, "Enter does not insert a line break");
        const exp = page.locator(`${MODAL} button[aria-label="Expand dialog"]`).first();
        if (await exp.count()) {
          await exp.click();
          checker.ok(await L.count(page, `${MODAL} button[aria-label="Collapse dialog"]`), "Expand switches to Collapse");
          await page.locator(`${MODAL} button[aria-label="Collapse dialog"]`).first().click().catch(() => {});
        } else note(ctx, "Expand dialog button missing");
        // X with pending edits -> "Discard your edits?" -> Keep editing preserves the text.
        const x = L.modalCloseButton(page);
        if (await x.count()) {
          await x.click();
          const conf = await L.waitVisible(page, tid("issues-create-discard-confirm"), 3000);
          checker.ok(conf, "closing with edits asks for confirmation (issues-create-discard-confirm)");
          if (conf) {
            await page.getByRole("button", { name: "Keep editing", exact: true }).first().click().catch(() => {});
            await sleep(300);
            checker.ok(await L.isVisible(page, MODAL), "Keep editing keeps the modal");
            checker.equal(await title.inputValue().catch(() => ""), tmp, "Keep editing preserves the title");
          }
        } else note(ctx, "modal X button not found (sibling of Expand dialog)");
        // Escape with pending edits: the Issues global handler closes the modal without checking for edits.
        await page.keyboard.press("Escape");
        await sleep(500);
        const modalAfterEsc = await L.isVisible(page, MODAL);
        const confAfterEsc = await L.isVisible(page, tid("issues-create-discard-confirm"));
        rec.escapeDirty = { modalVisible: modalAfterEsc, confirmationVisible: confAfterEsc };
        // Expected: modal stays mounted (edit recoverable) and the confirmation appears.
        checker.ok(modalAfterEsc, "Escape with pending edits keeps the modal (edit is not lost)", JSON.stringify(rec.escapeDirty));
        if (!modalAfterEsc && confAfterEsc) note(ctx, "finding: Escape closes the modal and opens 'Discard your edits?' over nothing; Keep editing does not recover the form");
        if (confAfterEsc) {
          await page.locator(tid("issues-create-discard-confirm-button")).first().click().catch(() => {});
          await sleep(300);
        } else if (modalAfterEsc && (await x.count())) {
          await x.click();
          if (await L.waitVisible(page, tid("issues-create-discard-confirm"), 2000))
            await page.locator(tid("issues-create-discard-confirm-button")).first().click().catch(() => {});
        }
        checker.ok(await L.waitHidden(page, MODAL, 3000), "Discard closes the modal");
        const left = (await L.findCard(page, tmp, { clearFilters: false })).card;
        checker.ok(!left, "nothing was created by the validation flow");
        await L.setSearch(page, "");
      },
    },
    {
      name: "create-full-issue",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        const s = st(ctx);
        if (!need(ctx, await toBoard(ctx), "Issues reachable")) return;
        if (!need(ctx, await L.openCreateModal(page, "button"), "issues-create-modal opens")) return;
        const title = page.locator(tid("issues-create-title-input")).first();
        // 1) "Create more" + Cmd+Enter: creates and keeps the modal open with a clean form.
        const more = page.locator(tid("issues-create-more-toggle")).first();
        const moreTitle = `${s.title}-more`;
        if (await more.count()) {
          await more.click();
          await title.fill(moreTitle);
          await title.press("Meta+Enter");
          const toast = await L.waitToast(page, /-\d+ created/);
          rec.createMoreToast = toast;
          checker.ok(!!toast, 'Create more: toast "<ID> created"', toast || "no toast");
          checker.ok(await L.isVisible(page, MODAL), "Create more keeps the modal open");
          checker.equal(await title.inputValue().catch(() => null), "", "Create more clears the title");
          const m = toast && toast.match(/([A-Z][A-Z0-9]*-\d+) created/);
          s.created.push({ id: m ? m[1] : null, title: moreTitle });
          await more.click(); // turn off
        } else { checker.ok(false, "issues-create-more-toggle present"); }
        // 2) Main issue with as many modal fields as possible.
        await title.fill(s.title);
        const wrote = await L.writeRich(page, `${MODAL} .issues-detail-editor`, { lines: MD_LINES(L.RUNID) });
        checker.ok(wrote, "markdown description typed into the modal editor");
        const chips = {
          type: await L.pickModalChip(page, "Feature", "Bug"),
          priority: await L.pickModalChip(page, "Priority", "High"),
          estimate: await L.pickModalChip(page, "Estimate", "3 pts"),
        };
        rec.modalChips = chips;
        for (const [k, v] of Object.entries(chips)) checker.ok(v.ok, `chip ${k} set in the modal`, v.reason || "");
        // Labels in the modal only list existing labels (creating a label happens in the detail / context menu).
        const lt = page.locator(tid("issues-create-labels-trigger")).first();
        if (await lt.count()) {
          await lt.click();
          const opt = page.getByRole("option", { name: L.LABEL_NAME, exact: true }).first();
          if (await opt.waitFor({ state: "visible", timeout: 1500 }).then(() => true, () => false)) { await opt.click(); s.labelAtCreate = true; }
          else note(ctx, `label ${L.LABEL_NAME} does not exist yet (will be created in the labels test)`);
          await L.dismiss(page);
        } else note(ctx, "issues-create-labels-trigger missing");
        note(ctx, "not filled in the modal: assignee/agent (firing risk), dates (date picker), Context (tested in link-qa-doc)");
        await page.locator(tid("issues-create-and-open")).first().click().catch(() => {});
        checker.ok(await L.waitHidden(page, MODAL, 6000), "Create & Open closes the modal");
        const opened = await L.waitVisible(page, DETAIL, 8000);
        checker.ok(opened, "Create & Open opens the detail (issues-detail-view)");
        let b = await L.waitSelected(page, s.title, 12000);
        if (!b) { // fallback: locate via the board
          await L.clearSelection(page);
          const f = await L.findCard(page, s.title);
          if (f.card) { s.humanId = f.card.id; await L.openDetail(page, s.humanId); b = await L.bridge(page); }
        }
        s.humanId = s.humanId || b?.selectedIssueId || null;
        s.convexId = b?.selectedIssueDocId || null;
        rec.humanId = s.humanId;
        checker.ok(!!s.humanId, "human issue ID obtained (<PREFIX>-<n>)", String(s.humanId));
        if (!s.humanId) return;
        s.created.push({ id: s.humanId, title: s.title });
        checker.equal(await L.detailTitle(page), s.title, "title saved");
        const typeChip = await L.detailChip(page, "Type"), prioChip = await L.detailChip(page, "Priority"), estChip = await L.detailChip(page, "Estimate");
        rec.chipsAfterCreate = await L.detailChips(page);
        if (chips.type.ok) checker.equal(typeChip, "Type: Bug", "Bug type persisted");
        if (chips.priority.ok) checker.equal(prioChip, "Priority: High", "High priority persisted");
        if (chips.estimate.ok) checker.ok(/3/.test(estChip || ""), "estimate 3 persisted", estChip);
        const ed = await L.editorInfo(page, `${DETAIL} .issues-detail-editor`);
        rec.descAfterCreate = ed && { len: ed.len, h2: ed.h2, li: ed.li, strong: ed.strong };
        checker.ok(ed && ed.text.includes(`QA-MARK-${L.RUNID}`), "modal description appears in the detail", ed ? `len=${ed.len}` : "editor missing");
        await shot(ctx, "created-detail");
      },
    },
    {
      name: "open-detail",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        const s = st(ctx);
        if (!need(ctx, s.humanId, "QA issue created")) return;
        if (!need(ctx, await toBoard(ctx), "Issues reachable")) return;
        const f = await L.findCard(page, s.title);
        if (f.clearedView) note(ctx, "the active view filtered the issue; local filters cleared (not saved)");
        checker.ok(!!f.card, "card appears on the board when searching by title", JSON.stringify(f.cards.slice(0, 3)));
        if (f.card) {
          checker.equal(f.card.testid, `issue-${s.humanId}`, "card testid = issue-<ID>");
          await page.locator(`[data-issue-id="${s.humanId}"]`).first().click();
        } else await L.selectIssue(page, s.humanId);
        checker.ok(await L.waitVisible(page, DETAIL, 8000), "clicking the card opens the detail");
        const b = await L.bridge(page);
        checker.equal(b?.selectedIssueId, s.humanId, "bridge points to the selected issue");
        const txt = await L.detailText(page);
        checker.ok(txt.includes(s.humanId), "detail shows the ID");
        checker.ok(await L.count(page, `${DETAIL} ${tid("issues-activity-feed")}`), "Activity section present");
        rec.chips = await L.detailChips(page);
        checker.ok(rec.chips.some((c) => c.startsWith("Status: ")) && rec.chips.some((c) => c.startsWith("Stage: ")), "Status and Stage chips in the detail", JSON.stringify(rec.chips));
        // Actions menu: inspect only (Copy ID would overwrite the clipboard; Delete is left for the cleanup).
        const actions = page.locator(tid("issues-detail-actions")).first();
        if (await actions.count()) {
          await actions.click();
          await sleep(300);
          rec.actions = {
            createWorkspace: await L.count(page, tid("issues-detail-create-workspace")),
            copyId: await L.count(page, tid("issues-detail-copy-id")),
            delete: await L.count(page, tid("issues-detail-delete")),
          };
          checker.ok(rec.actions.delete, "Delete action available in the detail");
          if (rec.actions.createWorkspace) {
            await page.locator(tid("issues-detail-create-workspace")).first().click();
            const dlg = await L.waitVisible(page, tid("create-workspaces-dialog"), 3000);
            checker.ok(dlg, "Create workspace opens create-workspaces-dialog (I-127)");
            if (dlg) { // never submits: create-workspaces-submit triggers worktree + AI
              await page.locator(tid("create-workspaces-dialog")).getByRole("button", { name: "Cancel", exact: true }).first().click().catch(() => {});
              checker.ok(await L.waitHidden(page, tid("create-workspaces-dialog"), 3000), "Cancel closes the dialog without creating");
            }
          } else { note(ctx, "Create workspace unavailable (no project?)"); await L.dismiss(page); }
        } else checker.ok(false, "issues-detail-actions present");
        // Assignment: only opens the popover and looks at the Agents tab (I-128). Never selects.
        const at = page.locator(`${DETAIL} ${tid("issue-assignee-trigger")}`).first();
        if (await at.count()) {
          await at.click();
          await sleep(400);
          rec.assignee = { members: await L.count(page, tid("assignee-tab-members")), agents: await L.count(page, tid("assignee-tab-agents")) };
          if (rec.assignee.agents) {
            await page.locator(tid("assignee-tab-agents")).first().click();
            await sleep(300);
            rec.assignee.agentOptions = await page.getByRole("option").count().catch(() => 0);
          }
          await L.dismiss(page);
          checker.ok(true, "assignee popover opened and closed without assigning");
        } else checker.ok(false, "issue-assignee-trigger present in the detail");
        await shot(ctx, "detail");
      },
    },
    {
      name: "edit-title-description",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        const s = st(ctx);
        if (!(await needDetail(ctx))) return;
        // Escape while editing the title: the textarea reverts, but the global handler closes the detail.
        const h1 = page.locator(`${DETAIL} h1`).first();
        await h1.click().catch(() => {});
        const ta = page.locator(`${DETAIL} textarea[placeholder="Untitled"]`).first();
        if (await ta.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false)) {
          await ta.fill(`${s.title} (discard)`);
          await page.keyboard.press("Escape");
          await sleep(500);
          const stillOpen = await L.isVisible(page, DETAIL);
          rec.escapeInTitle = { detailStaysOpen: stillOpen };
          if (!stillOpen) note(ctx, "finding: Escape while editing the title closes the detail (global handler ignores the editable field)");
          if (!stillOpen) await L.openDetail(page, s.humanId);
          checker.equal(await L.detailTitle(page), s.title, "Escape reverts the title");
        } else checker.ok(false, "title textarea (placeholder Untitled) appears when clicking the h1");
        const newTitle = `${s.title} ✏️ edited`;
        const et = await L.editTitle(page, newTitle);
        checker.ok(et.ok, "Enter saves the new title", et.reason || et.now);
        if (et.ok) { s.title = newTitle; s.created.push({ id: s.humanId, title: newTitle }); }
        // Description: replace with markdown + unicode/emoji/RTL + long text (~3.5k).
        const scope = `${DETAIL} .issues-detail-editor`;
        const ok = await L.writeRich(page, scope, { replace: true, lines: MD_LINES(L.RUNID), insert: LONG(L.RUNID) });
        checker.ok(ok, "collaborative description editor accepts edits");
        await sleep(2500); // sync Yjs -> Convex
        const info = await L.editorInfo(page, scope);
        rec.desc = info && { len: info.len, h2: info.h2, li: info.li, strong: info.strong, rtlDir: info.rtlDir };
        if (info) {
          checker.ok(info.h2 >= 1, "markdown '## ' becomes a heading");
          checker.ok(info.li >= 2, "markdown '- ' becomes a list");
          checker.ok(info.strong >= 1, "markdown **bold** becomes <strong>");
          checker.ok(info.text.includes("🚀") && info.text.includes("日本語"), "emoji and CJK preserved");
          checker.ok(info.text.includes("مرحبا") && info.text.includes("שלום"), "RTL text preserved");
          checker.ok(info.text.includes(`QA-LONG-${L.RUNID}-END`) && info.len >= 3000, "full long text", `len=${info.len}`);
          if (info.rtlDir !== "rtl") note(ctx, `RTL paragraph with direction "${info.rtlDir}" (no dir=auto)`);
        } else checker.ok(false, "description editor readable");
        await shot(ctx, "edited");
      },
    },
    {
      name: "change-status-via-menu",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        const s = st(ctx);
        if (!(await needDetail(ctx))) return;
        const stageBefore = await L.detailChip(page, "Stage");
        const r1 = await L.setDetailChip(page, "Status", "In Progress");
        rec.detailStatus = r1;
        checker.ok(r1.ok && r1.after === "Status: In Progress", "chip Status -> In Progress", JSON.stringify(r1));
        rec.stageAfterStatus = { before: stageBefore, after: await L.detailChip(page, "Stage") };
        checker.ok(rec.stageAfterStatus.after && rec.stageAfterStatus.after !== stageBefore, "stage follows the status change (1st stage of In Progress)", JSON.stringify(rec.stageAfterStatus));
        // Card context menu: Stage -> PR Review (testid issue-stage-menuitem-pr-review).
        await L.closeDetail(page);
        const f = await L.findCard(page, s.title);
        if (!need(ctx, f.card, "card visible on the board")) return;
        if (await L.openCardContextMenu(page, s.humanId)) {
          rec.contextMenu = await L.menuItems(page);
          s.contextItems = rec.contextMenu;
          await L.dismiss(page);
        }
        const r2 = await L.contextSetStage(page, s.humanId, "pr-review");
        checker.ok(r2.ok, "context menu: Stage > PR Review", r2.reason || "");
        if (r2.ok && (await L.openDetail(page, s.humanId))) {
          checker.equal(await L.detailChip(page, "Stage"), "Stage: PR Review", "PR Review stage applied");
          checker.equal(await L.detailChip(page, "Status"), "Status: In Review", "derived status In Review");
        }
        await shot(ctx, "status-menu");
      },
    },
    {
      name: "change-status-via-drag",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        const s = st(ctx);
        if (!need(ctx, s.humanId, "QA issue created")) return;
        if (!need(ctx, await toBoard(ctx), "Issues reachable")) return;
        const vm = await L.setViewMode(page, "Board");
        if (!vm.ok) note(ctx, `Board mode: ${vm.reason || "not confirmed"}`);
        const f = await L.findCard(page, s.title);
        if (!need(ctx, f.card?.column, "card in a kanban column")) return;
        const cols = await L.columnIds(page);
        const r = await L.dragCardToAdjacentColumn(page, s.humanId);
        rec.drag = r;
        checker.ok(r.ok, "dragging the card changes the column (dnd-kit)", JSON.stringify(r));
        if (r.ok && (await L.openDetail(page, s.humanId))) {
          const label = cols.find((c) => c.id === r.to)?.label || r.to;
          const chips = await L.detailChips(page);
          rec.chipsAfterDrag = chips;
          checker.ok(chips.some((c) => c.endsWith(`: ${label}`)), "detail reflects the destination column", `${label} in ${JSON.stringify(chips)}`);
        }
        await shot(ctx, "drag");
      },
    },
    {
      name: "labels",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        const s = st(ctx);
        if (!(await needDetail(ctx))) return;
        if ((await L.detailText(page)).includes(L.LABEL_NAME)) {
          note(ctx, `label ${L.LABEL_NAME} already applied at creation`);
          checker.ok(true, "QA label present on the issue");
        } else {
          const r = await L.addLabelInDetail(page, L.LABEL_NAME);
          rec.label = { name: L.LABEL_NAME, ...r };
          checker.ok(r.ok, `label ${L.LABEL_NAME} applied (created=${r.created})`, r.reason || "");
        }
        s.labelApplied = (await L.detailText(page)).includes(L.LABEL_NAME);
        await L.closeDetail(page);
        const f = await L.findCard(page, s.title);
        checker.ok(f.card && f.card.text.includes(L.LABEL_NAME), "board card shows the label", f.card?.text);
        // Labels submenu in the context menu (F-115).
        if (await L.openCardContextMenu(page, s.humanId)) {
          checker.ok(await L.count(page, tid("issue-labels-menuitem")), "Labels submenu in the context menu (issue-labels-menuitem)");
          await L.dismiss(page);
        }
        note(ctx, "no UI to delete a label in 0.0.121 (issues.deleteLabel has no consumer): the label stays in the org");
        await shot(ctx, "labels");
      },
    },
    {
      name: "comment",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        const s = st(ctx);
        if (!(await needDetail(ctx))) return;
        const text = `QA-AUTO-docs comment 💬 ${L.RUNID}`;
        const r = await L.addComment(page, text);
        rec.comment = r;
        checker.ok(r.ok, "comment appears in Activity", r.reason || "");
        checker.ok(r.cleared, "comment field clears after sending");
        s.comment = r.ok ? text : null;
        // Mention: "@" opens the suggestions popover (does not send).
        const inp = page.locator(`${DETAIL} ${tid("issue-comment-input")}`).first();
        if (await inp.count()) {
          await inp.fill("@");
          const pop = await L.waitVisible(page, tid("issue-comment-mention-popover"), 2000);
          rec.mentionPopover = pop;
          if (!pop) note(ctx, "mention popover did not open with '@' (org without members?)");
          await inp.fill("");
        }
        await shot(ctx, "comment");
      },
    },
    {
      name: "filters-search-grouping",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        const s = st(ctx);
        if (!need(ctx, s.humanId, "QA issue created")) return;
        if (!need(ctx, await toBoard(ctx), "Issues reachable")) return;
        // Search: matches title + ID + number (W_r), case-insensitive.
        const f = await L.findCard(page, s.title);
        checker.ok(!!f.card, "searching by title finds the card");
        const all = await L.readCards(page);
        const foreign = all.filter((c) => !c.title.toLowerCase().includes(s.title.toLowerCase()));
        checker.equal(foreign.length, 0, "search brings no foreign cards");
        await L.setSearch(page, s.humanId);
        checker.ok((await L.readCards(page)).some((c) => c.id === s.humanId), "searching by ID finds the card");
        await L.setSearch(page, `${s.base}-no-match-zz`);
        const noMatch = await page.getByText("No issues match your filters", { exact: true }).first().waitFor({ state: "visible", timeout: 4000 }).then(() => true, () => false);
        checker.ok(noMatch, 'search without results shows "No issues match your filters"');
        const clear = page.getByRole("button", { name: "Clear filters", exact: true }).first();
        if (await clear.count()) {
          await clear.click();
          await sleep(300);
          checker.equal(await L.getSearch(page), "", '"Clear filters" clears the search');
        } else note(ctx, '"Clear filters" button missing');
        // Priority = High filter (set at creation).
        await L.setSearch(page, s.title);
        const fb = page.locator(tid("issues-filter-add-button")).first();
        if (await fb.count()) {
          await fb.click();
          const dim = page.getByRole("option", { name: "Priority" }).first();
          if (await dim.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false)) {
            await dim.click();
            const hi = page.getByRole("option", { name: "High", exact: true }).first();
            if (await hi.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false)) {
              await hi.click();
              await sleep(500);
              await L.dismiss(page);
              checker.ok((await L.readCards(page)).some((c) => c.id === s.humanId), "Priority=High filter keeps the High issue");
              checker.ok(await L.filterBarClear(page), 'filter bar with "Clear" (without saving the view)');
            } else { checker.ok(false, '"High" option in the Priority filter'); await L.dismiss(page); }
          } else { checker.ok(false, '"Priority" dimension in the filter menu'); await L.dismiss(page); }
        } else checker.ok(false, "issues-filter-add-button present");
        // Grouping: Status and back to the original; ordering Title and back.
        await L.setSearch(page, s.title);
        if (await L.openDisplay(page)) {
          const orig = await L.selectText(page, "issues-grouping-select");
          const g = await L.chooseSelect(page, "issues-grouping-select", "status");
          checker.ok(g.ok && g.now === "Status", "group by Status", JSON.stringify(g));
          await L.closeDisplay(page);
          const cols = (await L.columnIds(page)).map((c) => c.id);
          rec.statusColumns = cols;
          checker.ok(cols.length > 0 && cols.every((c) => ["triage", "in-progress", "in-review", "done", "cancelled"].includes(c)), "columns become statuses", JSON.stringify(cols));
          await L.openDisplay(page);
          const back = await L.chooseSelect(page, "issues-grouping-select", L.GROUP_LABEL_TO_ID[orig] || "stage");
          checker.ok(back.ok, `grouping restored (${orig})`);
          const origOrd = await L.selectText(page, "issues-order-field-trigger");
          const o = await L.chooseOrder(page, "title");
          checker.ok(o.ok && o.now === "Title", "order by Title", JSON.stringify(o));
          if (!(await L.isVisible(page, tid("issues-grouping-select")))) await L.openDisplay(page);
          const o2 = await L.chooseOrder(page, L.ORDER_LABEL_TO_ID[origOrd] || "manual");
          rec.orderingRestored = { original: origOrd, restored: o2.now };
          checker.ok(o2.ok && o2.now === origOrd, `ordering restored (${origOrd})`);
          await L.closeDisplay(page);
        } else checker.ok(false, "Display popover opens");
        await L.setSearch(page, "");
        await shot(ctx, "filters");
      },
    },
    {
      name: "keyboard-shortcuts",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        const s = st(ctx);
        if (!need(ctx, await toBoard(ctx, s.title), "Issues reachable")) return;
        const res = {};
        // c -> opens the create modal (outside an editable field); Escape closes it (clean form).
        await L.blurActive(page);
        await page.keyboard.press("c");
        res.c = await L.waitVisible(page, MODAL, 3000);
        checker.ok(res.c, "key c opens issues-create-modal");
        if (res.c) {
          checker.equal(await page.locator(tid("issues-create-title-input")).inputValue().catch(() => null), "", "'c' does not leak into the title");
          await page.keyboard.press("Escape");
          res.escModal = await L.waitHidden(page, MODAL, 3000);
          checker.ok(res.escModal, "Escape closes the clean modal");
        }
        // / -> focuses the search (data-issues-search) without typing the slash.
        await L.blurActive(page);
        await page.keyboard.press("/");
        await sleep(200);
        const a = await L.activeTestId(page);
        res.slash = !!a?.issuesSearch;
        checker.ok(res.slash, "/ focuses issues-search-input");
        checker.equal(await L.getSearch(page), s.title, "/ does not change the search text");
        // Cmd+A -> selects all filtered issues (only those of the QA search) -> bulk bar; Escape clears.
        await L.blurActive(page);
        const visible = (await L.readCards(page)).filter((c) => c.title.startsWith(L.PREFIX));
        if ((await L.getSearch(page)) !== s.title) { // without an active QA search, Cmd+A would select the whole org
          checker.ok(false, "precondition: QA search active before Cmd+A");
          rec.shortcuts = res;
          return;
        }
        await page.keyboard.press("Meta+a");
        res.cmdA = await L.waitVisible(page, tid("issues-bulk-bar"), 2500);
        if (res.cmdA) {
          rec.bulkBar = (await page.locator(tid("issues-bulk-bar")).innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
          checker.ok(true, "Cmd+A shows issues-bulk-bar (I-126)");
          note(ctx, `QA cards visible=${visible.length}`);
          await page.keyboard.press("Escape");
          checker.ok(await L.waitHidden(page, tid("issues-bulk-bar"), 2500), "Escape clears the bulk selection");
        } else checker.ok(false, "Cmd+A shows issues-bulk-bar (the native menu may intercept Select All)");
        // Escape in the detail -> back to the board.
        if (s.humanId && (await L.openDetail(page, s.humanId))) {
          await L.blurActive(page);
          await page.keyboard.press("Escape");
          res.escDetail = await L.waitHidden(page, DETAIL, 3000);
          checker.ok(res.escDetail, "Escape closes the detail");
        }
        rec.shortcuts = res;
        note(ctx, "not exercised: Cmd+S (saves the active view), Cmd+L (attaches the selection to chat)");
        await L.setSearch(page, "");
      },
    },
    {
      name: "list-vs-board",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        const s = st(ctx);
        if (!need(ctx, s.humanId, "QA issue created")) return;
        if (!need(ctx, await toBoard(ctx, s.title), "Issues reachable")) return;
        const out = {};
        const modes = [
          ["List", async () => (await L.count(page, tid(`issue-list-row-${s.humanId}`))) > 0, "row issue-list-row-<ID>"],
          ["Split", async () => (await L.count(page, tid(`issue-split-row-${s.humanId}`))) > 0 || (await L.count(page, tid("issues-split-view"))) > 0, "issues-split-view"],
          ["Timeline", async () => (await page.getByText("No issues with dates set").count()) > 0 || !(await L.count(page, tid("issues-board-scroll"))), "timeline (no dates)"],
          ["Board", async () => (await L.count(page, tid(`issue-${s.humanId}`))) > 0, "card issue-<ID>"],
        ];
        for (const [label, check, what] of modes) {
          const r = await L.setViewMode(page, label);
          await sleep(600);
          const ok = r.ok && (await check());
          out[label] = ok;
          checker.ok(ok, `${label} mode: ${what}`, r.reason || "");
          await shot(ctx, `mode-${label.toLowerCase()}`);
        }
        rec.modes = out;
        await L.setSearch(page, "");
      },
    },
    {
      name: "duplicate",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        const s = st(ctx);
        if (!need(ctx, s.humanId, "QA issue created")) return;
        if (!need(ctx, await toBoard(ctx, s.title), "Issues reachable")) return;
        // In the bundle, issues.duplicateIssue is in the provider but no component calls it.
        if (!(await L.openCardContextMenu(page, s.humanId))) { checker.ok(false, "card context menu opens"); return; }
        const items = await L.menuItems(page);
        rec.contextMenu = items;
        const dup = items.find((t) => /^Duplicate/.test(t));
        if (!dup) {
          await L.dismiss(page);
          checker.ok(false, "finding: Duplicate action missing from the UI (duplicateIssue has no consumer in 0.0.121)", JSON.stringify(items));
          return;
        }
        await page.locator('[role="menu"]').getByRole("menuitem", { name: dup }).first().click();
        await sleep(1500);
        await L.setSearch(page, s.base);
        const copies = (await L.readCards(page)).filter((c) => c.title.startsWith(s.title) && c.id !== s.humanId);
        checker.ok(copies.length > 0, "Duplicate creates a copy with the same prefix", JSON.stringify(copies.slice(0, 3)));
        for (const c of copies) s.created.push({ id: c.id, title: c.title });
      },
    },
    {
      name: "link-qa-doc",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        const s = st(ctx);
        if (!(await needDetail(ctx))) return;
        const query = process.env.QA_DOC_TITLE || L.PREFIX; // doc created by the Docs suite
        const r = await L.linkDocInDetail(page, query);
        rec.link = r;
        if (!r.ok && /no doc/.test(r.reason || "")) {
          checker.ok(false, `precondition: existing doc "${query}*" (run the Docs suite first or set QA_DOC_TITLE)`);
          return;
        }
        checker.ok(r.ok, "linked QA doc appears in Artifacts (E2E-07)", r.reason || r.doc);
        if (r.ok) s.linkedDoc = r.doc;
        await L.closeDetail(page);
        const f = await L.findCard(page, s.title);
        rec.cardAfterLink = f.card?.text;
        await shot(ctx, "doc-link");
      },
    },
    {
      name: "persistence-after-reload",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        const s = st(ctx);
        if (!need(ctx, s.humanId, "QA issue created")) return;
        const t0 = Date.now();
        await page.reload({ waitUntil: "domcontentloaded" }).catch((e) => note(ctx, `reload: ${e.message}`));
        await ctx.lib.ui.waitForReady(page);
        const shell = await L.waitShell(page, 90000);
        rec.reloadMs = Date.now() - t0;
        if (!need(ctx, shell, "app comes back after reload")) return;
        const nav = await L.gotoIssues(page, 30000);
        if (!need(ctx, nav.ok, "Issues after reload")) return;
        await L.waitBoardLoaded(page);
        const f = await L.findCard(page, s.title);
        checker.ok(!!f.card, "issue persists after reload (search by the edited title)");
        if (!(await L.openDetail(page, s.humanId))) { checker.ok(false, "detail opens after reload"); return; }
        checker.equal(await L.detailTitle(page), s.title, "edited title persisted");
        let info = null;
        for (let i = 0; i < 20; i++) { // collaborative body loads asynchronously
          info = await L.editorInfo(page, `${DETAIL} .issues-detail-editor`);
          if (info?.text?.includes(`QA-LONG-${L.RUNID}-END`)) break;
          await sleep(500);
        }
        checker.ok(info?.text?.includes(`QA-MARK-${L.RUNID}`), "description persisted");
        checker.ok(info?.text?.includes(`QA-LONG-${L.RUNID}-END`), "long text persisted", info ? `len=${info.len}` : "");
        const txt = await L.detailText(page);
        if (s.labelApplied) checker.ok(txt.includes(L.LABEL_NAME), "label persisted");
        if (s.comment) checker.ok(txt.includes(s.comment), "comment persisted");
        if (s.linkedDoc) checker.ok(txt.includes(s.linkedDoc), "doc link persisted");
        rec.chipsAfterReload = await L.detailChips(page);
        await shot(ctx, "after-reload");
      },
    },
    {
      name: "basic-a11y",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        const s = st(ctx);
        if (!need(ctx, await toBoard(ctx, s.title || ""), "Issues reachable")) return;
        const board = await L.unnamedButtons(page, tid("issues-view"));
        rec.unnamedBoard = board;
        checker.ok(Array.isArray(board), "button scan on the board ran");
        if (board) checker.atMost(board.length, 0, "buttons without an accessible name on the board (list in rec.unnamedBoard)");
        if (s.humanId && (await L.openDetail(page, s.humanId))) {
          const det = await L.unnamedButtons(page, DETAIL);
          rec.unnamedDetail = det;
          if (det) checker.atMost(det.length, 0, "buttons without an accessible name in the detail");
          await L.closeDetail(page);
        }
        if (await L.openCreateModal(page, "button")) {
          const mod = await L.unnamedButtons(page, MODAL);
          rec.unnamedModal = mod;
          if (mod) checker.atMost(mod.length, 0, "buttons without an accessible name in the create modal");
          const x = L.modalCloseButton(page);
          if (await x.count()) await x.click(); else await page.keyboard.press("Escape");
          await L.waitHidden(page, MODAL, 3000);
        }
        await L.setSearch(page, "");
      },
    },
    {
      name: "console-errors",
      async fn(ctx) {
        const { checker, rec, collectors } = ctx;
        const errs = collectors.consoleErrors || [];
        const issuesErrs = errs.filter((e) => /\[Issues|IssuesProjection|Couldn't (create|load|link)|Failed to (update|delete|add|duplicate)/.test(e));
        rec.consoleErrors = errs.length;
        rec.consoleWarnings = (collectors.consoleWarnings || []).length;
        rec.issuesErrors = issuesErrs.slice(0, 10);
        rec.consoleErrorsSample = errs.slice(0, 10);
        checker.equal((collectors.exceptions || []).length, 0, "no unhandled exception in the renderer");
        checker.equal(issuesErrs.length, 0, "no console error from the Issues domain");
      },
    },
    {
      name: "cleanup",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        const s = st(ctx);
        if (!need(ctx, await toBoard(ctx), "Issues reachable")) return;
        if (s.linkedDoc && s.humanId && (await L.openDetail(page, s.humanId))) {
          const u = await L.unlinkInDetail(page, s.linkedDoc);
          rec.unlink = u;
          checker.ok(u.ok, "doc link removed before deleting the issue", u.reason || "");
          await L.closeDetail(page);
        }
        // Deletes QA-AUTO-docs-* of this instance + leftovers from previous runs; spares other instances of the current run.
        const skip = (c) => c.title.startsWith(`${L.RUN_PREFIX}-`) && !L.ownedBy(c.title, s.base);
        const r = await L.cleanupByPrefix(page, { prefix: L.PREFIX, skip });
        rec.cleanup = { deleted: r.deleted.map((d) => d.id), failed: r.failed, skipped: r.skipped, createdInRun: s.created };
        checker.equal(r.failed.length, 0, "no failure deleting QA issues", JSON.stringify(r.failed));
        await L.setSearch(page, s.base);
        await sleep(600);
        const left = (await L.readCards(page)).filter((c) => L.ownedBy(c.title, s.base));
        checker.equal(left.length, 0, `no ${s.base}* issue left`);
        if (s.humanId) checker.ok(!r.failed.some((f) => f.id === s.humanId), `main issue ${s.humanId} deleted`);
        await L.setSearch(page, "");
        note(ctx, `label "${L.LABEL_NAME}" remains in the org (no delete UI)`);
        await shot(ctx, "cleanup");
      },
    },
  ],
};
