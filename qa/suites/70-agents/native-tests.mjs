// qa/suites/70-agents/native-tests.mjs — Native Agents of Tempo 0.0.121 (I-140…I-148, F-120…F-133).
// Requires a LOGGED-IN profile (qa-7) with an open project (createAgent requires a project).
// Writes: only agents named QA-AUTO-agents-<runid>*; ids in the run ledger; cleanup by prefix.
// Real runs: global budget in /tmp/tempo-qa/scratch-t-agents/run-budget.json (max 5).
import fs from "node:fs";
import * as H from "./helpers.mjs";
import { expectedFromQueries } from "./mod-tests.mjs";
const { sleep, tid } = H;

export const TEMPLATES = [
  ["bug-fixer", "Bug Fixer", { effort: "xhigh", assignable: true }],
  ["feature-builder", "Feature Builder", { effort: "high", assignable: true }],
  ["feature-spec-writer", "Spec & Design", { effort: "xhigh", assignable: true }],
  ["feedback-triage", "Feedback Triage", { effort: "high", suggested: "slack" }],
  ["board-sync", "Board Sync on Merged PRs", { effort: "low", suggested: "github" }],
  ["pr-reviewer", "PR Reviewer", { effort: "high", assignable: true }],
  ["error-sweep", "Production Error Sweep", { effort: "high", cron: "0 9 * * 1-5" }],
  ["daily-bug-report", "Daily Bug Report", { effort: "medium", cron: "0 9 * * 1-5" }],
  ["build-in-public", "Build-in-Public Curator", { effort: "medium", cron: "0 9 * * *" }],
  ["prioritization", "Prioritization", { effort: "high", cron: "0 9-18 * * 1-5" }],
  ["brainstorming", "Brainstorming", { effort: "high", cron: "0 9 * * 1-5", advanced: true }],
  ["release-driver", "Daily Release Driver", { effort: "xhigh", cron: "0 9 * * 1-5", advanced: true }],
];
const CHEAP_PROMPT = "Reply only with the word OK. Do not use tools, do not read or edit files, do not run commands.";
const BUDGET = "/tmp/tempo-qa/scratch-t-agents/run-budget.json";
const budget = () => { try { return JSON.parse(fs.readFileSync(BUDGET, "utf8")); } catch { return { max: 5, runs: [] }; } };
const budgetAdd = (runId, agentId) => { const b = budget(); if (!b.runs.some((r) => r.runId === runId)) b.runs.push({ runId, agentId, at: new Date().toISOString() }); fs.writeFileSync(BUDGET, JSON.stringify(b, null, 2)); return b; };

// ------------------------------------------------------------------ utilities ---
async function needLogged(ctx) {
  if (await H.isLoggedIn(ctx.page)) return true;
  H.skip(ctx, "needs a logged-in profile (qa-7)");
  ctx.checker.ok(true, "SKIP: logged out");
  return false;
}
async function getAgent(page, agentId) {
  const r = await H.q(page, "agents:getAgent", { agentId });
  return r.ok ? r.v : null;
}
async function myAgents(page) {
  const os = await H.orgs(page);
  const out = [];
  for (const o of os) {
    const r = await H.q(page, "agents:listMyAgents", { organizationId: o._id });
    if (r.ok && Array.isArray(r.v)) out.push(...r.v.map((a) => ({ ...a, __org: o._id })));
  }
  return out;
}
async function openPicker(page) {
  if (await H.visible(page, tid("agents-landing-browse-templates"))) await page.click(tid("agents-landing-browse-templates"));
  else if (await H.visible(page, tid("agents-empty-browse"))) await page.click(tid("agents-empty-browse"));
  else {
    await page.click(tid("agent-list-create")).catch(() => {});
    if (await H.visible(page, tid("agent-list-browse-templates"), 2000)) await page.click(tid("agent-list-browse-templates"));
  }
  return H.visible(page, '[data-testid^="agent-template-card-"]', 6000);
}
async function closeAny(page) { await page.keyboard.press("Escape").catch(() => {}); await sleep(300); }
// Waits for the settings screen of the newly created agent and returns the selected id.
async function waitNewAgent(page, beforeId) {
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    const st = await H.routeState(page);
    if (st && st.selectedAgentId && st.selectedAgentId !== beforeId && (await H.visible(page, tid("agent-settings-view")))) return st.selectedAgentId;
    const toast = await page.getByText("Open a project first", { exact: false }).first().isVisible().catch(() => false);
    if (toast) return { blocked: "Open a project first" };
    await sleep(300);
  }
  return null;
}
async function setTitle(page, text, { commit = "Enter" } = {}) {
  const el = page.locator(tid("agent-settings-title")).first();
  await el.click({ timeout: 4000 });
  await page.keyboard.press("Meta+A");
  if (text === "") await page.keyboard.press("Backspace"); else await page.keyboard.insertText(text);
  if (commit) await page.keyboard.press(commit);
  await sleep(700);
}
async function titleText(page) {
  return page.locator(tid("agent-settings-title")).first().evaluate((e) => (e.value ?? e.innerText ?? "").trim()).catch(() => null);
}
async function deleteViaUi(page) {
  const kebab = page.locator(`${tid("agent-settings-view")} button[aria-label="Agent actions"]`).first();
  if (!(await kebab.count())) return false;
  await kebab.click({ timeout: 4000 });
  if (!(await H.visible(page, tid("agent-settings-delete"), 3000))) return false;
  await page.click(tid("agent-settings-delete"));
  await sleep(1200);
  return true;
}
async function openSettingsOf(page, agentId) {
  await H.gotoAgents(page);
  await page.evaluate((id) => { const s = window.__AGENTS_ROUTE_STORE__; s && s.getState().openAgentSettings(id); }, agentId);
  return H.visible(page, tid("agent-settings-view"), 8000);
}
async function createScratch(ctx, label) {
  const { page } = ctx;
  await H.gotoAgents(page);
  const before = (await H.routeState(page))?.selectedAgentId || null;
  if (!(await openPicker(page))) return { err: "gallery did not open" };
  await page.click(tid("agent-template-from-scratch"));
  const id = await waitNewAgent(page, before);
  if (!id || id.blocked) return { err: id ? id.blocked : "agent did not open" };
  const name = `${H.prefixOf(ctx)}-${label}`;
  H.ledgerAdd(ctx, { agentId: id, kind: "scratch", name });
  await setTitle(page, name);
  return { id, name };
}
async function removeAllTriggers(page, agentId) {
  // via UI: agent-trigger-remove-* buttons; verifies against the backend
  await openSettingsOf(page, agentId);
  for (let i = 0; i < 8; i++) {
    const b = page.locator('[data-testid^="agent-trigger-remove-"]').first();
    if (!(await b.count())) break;
    await b.click().catch(() => {}); await sleep(600);
  }
  const a = await getAgent(page, agentId);
  return a ? { triggers: (a.triggers || []).length, assignable: !!a.assignable } : null;
}
async function setEnabled(page, agentId, want) {
  await openSettingsOf(page, agentId);
  const a = await getAgent(page, agentId);
  if (!!a?.enabled === want) return true;
  if (want && (await H.visible(page, tid("agent-settings-enable")))) await page.click(tid("agent-settings-enable"));
  else await page.click(tid("agent-settings-enabled-cta")).catch(() => {});
  for (let i = 0; i < 20; i++) { await sleep(300); if (!!(await getAgent(page, agentId))?.enabled === want) return true; }
  return false;
}
async function addScheduleTrigger(page, cron) {
  await page.click(tid("agent-add-trigger"));
  await page.click(tid("agent-add-trigger-option-schedule"), { timeout: 4000 });
  if (!(await H.visible(page, tid("agent-trigger-config-modal"), 5000))) return false;
  const inp = page.locator(tid("agent-trigger-cron")).first();
  await inp.click(); await page.keyboard.press("Meta+A"); await page.keyboard.insertText(cron); await sleep(400);
  await page.click(tid("agent-trigger-config-add")).catch(() => {});
  await sleep(800);
  return true;
}

// ------------------------------------------------------------------- tests ---
export const nativeTests = [
  {
    name: "agents-nav-flag-landing",
    async fn(ctx) {
      const { page, checker, rec, collectors } = ctx;
      if (!(await needLogged(ctx))) return;
      const exc0 = collectors.exceptions.length;
      const flag = await page.evaluate(() => (window.__tempoGetFeatureFlag ? window.__tempoGetFeatureFlag("custom-agents") : "no-helper"));
      rec.flag = flag;
      checker.equal(flag, true, "custom-agents flag on (I-024)");
      checker.ok(await H.visible(page, tid("workspace-navbar-agents-button")), "Agents button in the navbar (F-001)");
      // path 1: click
      checker.ok(await H.gotoAgents(page), "clicking Agents opens the surface (list/landing)");
      const els = {};
      for (const id of ["agents-list-sidebar", "agent-list-header", "agent-list-search", "agent-list-create", "agents-landing-empty", "agents-landing-create", "agents-landing-browse-templates", "agents-empty-create"]) els[id] = await H.visible(page, tid(id));
      rec.elements = els;
      checker.ok(els["agents-list-sidebar"] || els["agents-empty-create"], "list in the sidebar or empty state (F-120, I-140/141)");
      checker.ok(els["agents-landing-create"] || els["agents-empty-create"], "'New agent' CTA visible");
      checker.ok(els["agents-landing-browse-templates"] || (await H.visible(page, tid("agents-empty-browse"))), "'Browse templates' CTA visible");
      checker.ok(!!(await H.routeState(page)), "route store __AGENTS_ROUTE_STORE__ exposed");
      await H.shot(ctx, "landing");
      // path 2: Ctrl+5 (Ctrl+1…9 'Jump to sidebar section')
      await page.locator(tid("workspace-navbar-chat-button")).first().click().catch(() => {});
      await sleep(800);
      await page.keyboard.press("Control+5");
      const viaKey = await H.visible(page, `${tid("agents-list-sidebar")}, ${tid("agents-landing-empty")}, ${tid("agents-empty-create")}`, 5000);
      checker.ok(viaKey, "Ctrl+5 goes to the Agents tab (5th section)");
      // count vs backend
      const os = await H.orgs(page);
      const inOrg = os[0] ? await H.q(page, "agents:listAgentsInOrg", { organizationId: os[0]._id }) : { ok: false };
      const rows = await page.locator('[data-testid^="agent-list-row-"]').count();
      rec.counts = { rows, listAgentsInOrg: inOrg.ok && Array.isArray(inOrg.v) ? inOrg.v.length : inOrg.err, orgs: os.length };
      H.note(ctx, `rows=${rows} listAgentsInOrg=${rec.counts.listAgentsInOrg}`);
      checker.equal(collectors.exceptions.length - exc0, 0, "no unhandled exception while navigating");
    },
  },
  {
    name: "agents-search-filters-sorting",
    async fn(ctx) {
      const { page, checker, rec } = ctx;
      if (!(await needLogged(ctx))) return;
      await H.gotoAgents(page);
      const search = page.locator(tid("agent-list-search")).first();
      if (!(await search.count())) { checker.ok(false, "search field present"); return; }
      const rows0 = await page.locator('[data-testid^="agent-list-row-"]').count();
      await search.click(); await page.keyboard.insertText("zzz-qa-no-result-🙂-漢字"); await sleep(600);
      const rowsNone = await page.locator('[data-testid^="agent-list-row-"]').count();
      const empty = await H.visible(page, tid("agent-list-empty"));
      checker.equal(rowsNone, 0, "search with no match (unicode/emoji) empties the list");
      checker.ok(empty, "'agent-list-empty' state appears");
      await H.shot(ctx, "search-empty");
      if (await H.visible(page, tid("agent-list-clear-filters"))) await page.click(tid("agent-list-clear-filters"));
      else if (await H.visible(page, tid("agent-list-search-clear"))) await page.click(tid("agent-list-search-clear"));
      await sleep(500);
      const rowsBack = await page.locator('[data-testid^="agent-list-row-"]').count();
      checker.equal(rowsBack, rows0, "clearing filters restores the list");
      // partial case-insensitive search by the name of the 1st row
      const first = rows0 ? await page.locator('[data-testid^="agent-list-row-"]').first().innerText().catch(() => "") : "";
      const frag = first.split("\n")[0].trim().slice(0, 4);
      if (frag) {
        await search.click(); await page.keyboard.press("Meta+A"); await page.keyboard.insertText(frag.toUpperCase()); await sleep(600);
        const n = await page.locator('[data-testid^="agent-list-row-"]').count();
        checker.ok(n >= 1, "partial UPPERCASE search finds the agent (case-insensitive)", `frag=${frag.toUpperCase()} n=${n}`);
        await page.keyboard.press("Meta+A"); await page.keyboard.press("Backspace"); await sleep(400);
      }
      // sort/scope popover opens and closes with Esc, without saving a default
      if (await H.visible(page, tid("agents-list-settings-button"))) {
        await page.click(tid("agents-list-settings-button"));
        const open = await H.visible(page, tid("agents-settings-scope"), 3000);
        checker.ok(open, "sort/scope popover opens");
        await closeAny(page);
        checker.ok(!(await H.visible(page, tid("agents-settings-scope"))), "Esc closes the popover");
      }
      rec.search = { rows0, rowsNone, rowsBack };
    },
  },
  {
    name: "agents-template-gallery",
    async fn(ctx) {
      const { page, checker, rec } = ctx;
      if (!(await needLogged(ctx))) return;
      await H.gotoAgents(page);
      checker.ok(await openPicker(page), "template gallery opens");
      const cards = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="agent-template-card-"]')].map((e) => ({ id: e.getAttribute("data-testid").replace("agent-template-card-", ""), text: e.innerText.replace(/\s+/g, " ").trim().slice(0, 200) })));
      rec.cards = cards;
      checker.equal(cards.length, 12, "12 templates (I-142)");
      for (const [id, name] of TEMPLATES) {
        const c = cards.find((x) => x.id === id);
        checker.ok(c && c.text.includes(name), `template ${id} = "${name}"`, c ? c.text.slice(0, 80) : "missing");
      }
      const adv = cards.filter((c) => /advanced/i.test(c.text)).map((c) => c.id);
      checker.ok(adv.includes("brainstorming") && adv.includes("release-driver"), "Advanced badge on Brainstorming and Daily Release Driver", adv.join(","));
      checker.ok(await H.visible(page, tid("agent-template-from-scratch")), "'Start from scratch' option");
      const txt = await H.bodyTextSafe(page);
      checker.ok(/nothing runs until you review and enable it/i.test(txt), "'nothing runs until you review and enable it' notice (F-129, F-121)");
      await H.shot(ctx, "gallery");
      await closeAny(page);
      checker.ok(!(await H.visible(page, '[data-testid^="agent-template-card-"]')), "Esc closes the gallery without creating anything");
    },
  },
  {
    name: "agents-templates-instantiate-12",
    async fn(ctx) {
      const { page, checker, rec } = ctx;
      if (!(await needLogged(ctx))) return;
      const results = [];
      for (const [id, name, exp] of TEMPLATES) {
        await H.gotoAgents(page);
        const before = (await H.routeState(page))?.selectedAgentId || null;
        if (!(await openPicker(page))) { checker.ok(false, `gallery opens for ${id}`); continue; }
        await page.click(tid(`agent-template-card-${id}`));
        const agentId = await waitNewAgent(page, before);
        if (!agentId || agentId.blocked) { checker.ok(false, `template ${id} creates an agent`, agentId?.blocked || "timeout"); if (agentId?.blocked) break; continue; }
        H.ledgerAdd(ctx, { agentId, kind: "template", templateId: id, name });
        const qaName = `${H.prefixOf(ctx)}-tpl-${id}`;
        await setTitle(page, qaName);
        const a = await getAgent(page, agentId);
        const sugg = exp.suggested ? await H.visible(page, tid(`agent-trigger-suggested-${exp.suggested}`)) : null;
        const banner = await H.visible(page, tid("agent-settings-disabled-banner"));
        const sched = (a?.triggers || []).find((t) => t.kind === "schedule" || t.type === "schedule");
        const r = { id, agentId, name: a?.name, templateId: a?.templateId, enabled: a?.enabled, effort: a?.effort, assignable: a?.assignable, cron: sched?.cron || sched?.config?.cron || null, tz: sched?.tz || sched?.timezone || null, sugg, banner, prompt: (a?.prompt || "").length };
        results.push(r);
        checker.equal(a?.name, qaName, `${id}: renamed with QA prefix`);
        checker.equal(a?.templateId, id, `${id}: templateId saved`);
        checker.ok(a?.enabled !== true, `${id}: starts DISABLED (F-121)`, String(a?.enabled));
        checker.ok(banner, `${id}: disabled banner visible`);
        checker.ok(r.prompt > 200, `${id}: template prompt filled in`, `${r.prompt} chars`);
        if (exp.effort) checker.ok(!a?.effort || a.effort === exp.effort, `${id}: effort ${exp.effort} (if valid for the model)`, String(a?.effort));
        if (exp.assignable) checker.equal(!!a?.assignable, true, `${id}: Assigned trigger (assignable)`);
        if (exp.cron) checker.equal(r.cron, exp.cron, `${id}: schedule ${exp.cron}`);
        if (exp.suggested) checker.ok(sugg, `${id}: ${exp.suggested} trigger only SUGGESTED (not created)`);
        // delete right away
        const del = await deleteViaUi(page);
        const after = await getAgent(page, agentId);
        checker.ok(del && (!after || after.deletedAt || after.isDeleted), `${id}: deleted (no confirmation)`, JSON.stringify({ del, after: after ? Object.keys(after).slice(0, 5) : null }));
      }
      rec.templates = results;
    },
  },
  {
    name: "agents-create-from-scratch-fields-inputs",
    async fn(ctx) {
      const { page, checker, rec } = ctx;
      if (!(await needLogged(ctx))) return;
      const c = await createScratch(ctx, "main");
      if (c.err) { checker.ok(false, "create agent from scratch", c.err); return; }
      ctx.suite.__mainAgent = c.id;
      const r = { id: c.id };
      let a = await getAgent(page, c.id);
      checker.equal(a?.name, c.name, "title with prefix saved");
      checker.ok(a?.enabled !== true, "starts disabled");
      // empty: does not save (commitOnEmpty=false)
      await setTitle(page, ""); a = await getAgent(page, c.id);
      checker.equal(a?.name, c.name, "empty title is not saved (keeps the previous one)");
      // long
      const long = `${c.name}-` + "L".repeat(300);
      await setTitle(page, long); a = await getAgent(page, c.id);
      r.longLen = (a?.name || "").length;
      checker.ok(a?.name?.startsWith(c.name), "long title (300+) accepted or truncated with prefix", `len=${r.longLen}`);
      // unicode/emoji
      const uni = `${c.name} ✅ ßΩж 漢字 🚀`;
      await setTitle(page, uni); a = await getAgent(page, c.id);
      checker.equal(a?.name, uni, "unicode/emoji title preserved");
      // Esc during editing
      const el = page.locator(tid("agent-settings-title")).first();
      await el.click(); await page.keyboard.press("Meta+A"); await page.keyboard.insertText(`${c.name}-esc`); await page.keyboard.press("Escape"); await sleep(700);
      a = await getAgent(page, c.id);
      r.afterEsc = a?.name;
      H.note(ctx, `Esc during editing => name="${a?.name}"`);
      // pasted (clipboard)
      const pasted = `${c.name}-pasted`;
      const clipOk = await page.evaluate(async (t) => { try { await navigator.clipboard.writeText(t); return true; } catch (e) { return String(e.message); } }, pasted);
      if (clipOk === true) { await el.click(); await page.keyboard.press("Meta+A"); await page.keyboard.press("Meta+V"); await page.keyboard.press("Enter"); await sleep(700); a = await getAgent(page, c.id); checker.equal(a?.name, pasted, "pasted title (⌘V) saved"); }
      else H.note(ctx, `clipboard unavailable: ${clipOk}`);
      await setTitle(page, c.name);
      // description
      const d = page.locator(tid("agent-settings-description")).first();
      if (await d.count()) {
        await d.click(); await page.keyboard.press("Meta+A"); await page.keyboard.insertText("Automatic QA agent — line 1"); await page.keyboard.press("Tab"); await sleep(800);
        a = await getAgent(page, c.id);
        checker.ok((a?.description || "").includes("line 1"), "description saved on blur", a?.description);
      }
      // instructions (TipTap, 500 ms debounce)
      const ed = page.locator(".agent-instructions-editor [contenteditable=true], .agent-instructions-editor").first();
      if (await ed.count()) {
        await ed.click(); await page.keyboard.press("Meta+A"); await page.keyboard.insertText(CHEAP_PROMPT); await sleep(1500);
        a = await getAgent(page, c.id);
        checker.ok((a?.prompt || "").includes("Reply only with the word OK"), "instructions (prompt) saved by autosave (~500 ms)");
      } else checker.ok(false, "instructions editor present");
      // effort and auto-archive
      if (await H.visible(page, tid("agent-prop-effort"))) {
        await page.click(tid("agent-prop-effort"));
        const opts = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="agent-effort-option-"]')].map((e) => e.getAttribute("data-testid").replace("agent-effort-option-", "")));
        r.effortOptions = opts;
        if (opts.includes("low")) { await page.click(tid("agent-effort-option-low")); await sleep(700); a = await getAgent(page, c.id); checker.equal(a?.effort, "low", "effort=low saved"); }
        else await closeAny(page);
      }
      if (await H.visible(page, tid("agent-prop-model"))) {
        await page.click(tid("agent-prop-model"));
        r.modelOptions = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="agent-model-option-"]')].map((e) => e.getAttribute("data-testid").replace("agent-model-option-", "")));
        await closeAny(page);
        checker.ok(r.modelOptions.length > 0, "model dropdown lists options", r.modelOptions.join(","));
      }
      const aa = page.locator(tid("agent-prop-auto-archive")).first();
      if (await aa.count()) {
        const b0 = !!(await getAgent(page, c.id))?.autoArchiveOnComplete;
        await aa.click(); await sleep(700);
        const b1 = !!(await getAgent(page, c.id))?.autoArchiveOnComplete;
        checker.ok(b0 !== b1, "auto-archive toggle saves", `${b0}->${b1}`);
        await aa.click(); await sleep(700);
      }
      r.visibility = (await getAgent(page, c.id))?.visibility;
      r.machineId = !!(await getAgent(page, c.id))?.machineId;
      checker.ok(r.machineId, "agent pinned to a machine ('Runs on') on creation");
      await H.shot(ctx, "agent-settings");
      // persistence: reload
      await page.reload({ waitUntil: "domcontentloaded" });
      await H.waitLoggedIn(page, 90000); await sleep(2000);
      checker.ok(await openSettingsOf(page, c.id), "after reload the agent reopens");
      a = await getAgent(page, c.id);
      checker.equal(await titleText(page), c.name, "after reload the title persists in the UI");
      checker.ok((a?.prompt || "").includes("OK"), "after reload the instructions persist");
      rec.fields = r;
    },
  },
  {
    name: "agents-triggers",
    async fn(ctx) {
      const { page, checker, rec } = ctx;
      if (!(await needLogged(ctx))) return;
      const id = ctx.suite.__mainAgent;
      if (!id) { checker.ok(false, "main agent created in the previous test"); return; }
      await openSettingsOf(page, id);
      const r = {};
      // options
      await page.click(tid("agent-add-trigger"));
      await sleep(400);
      r.options = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="agent-add-trigger-option-"]')].map((e) => e.getAttribute("data-testid").replace("agent-add-trigger-option-", "")));
      checker.ok(r.options.includes("schedule") && r.options.includes("slack") && r.options.includes("github"), "trigger options include schedule/slack/github (F-124…F-127)", r.options.join(","));
      // search in the popover
      const s = page.locator(tid("agent-add-trigger-search")).first();
      if (await s.count()) { await s.click(); await page.keyboard.insertText("sched"); await sleep(300); r.filtered = await page.locator('[data-testid^="agent-add-trigger-option-"]').count(); checker.ok(r.filtered >= 1 && r.filtered < r.options.length, "search filters trigger options", String(r.filtered)); }
      await closeAny(page);
      // assigned_to_me
      if (r.options.includes("assigned_to_me")) {
        await page.click(tid("agent-add-trigger")); await page.click(tid("agent-add-trigger-option-assigned_to_me")); await sleep(800);
        checker.equal(!!(await getAgent(page, id))?.assignable, true, "Assigned to agent turns assignable on (F-123)");
        await page.click(tid("agent-trigger-remove-assigned_to_me")).catch(() => {}); await sleep(800);
        checker.equal(!!(await getAgent(page, id))?.assignable, false, "removing Assigned turns assignable off");
      }
      // schedule: invalid, cancel, NL (AI), valid, remove
      await page.click(tid("agent-add-trigger")); await page.click(tid("agent-add-trigger-option-schedule"));
      checker.ok(await H.visible(page, tid("agent-trigger-config-modal"), 5000), "schedule configuration modal opens");
      const cron = page.locator(tid("agent-trigger-cron")).first();
      await cron.click(); await page.keyboard.press("Meta+A"); await page.keyboard.insertText("abc"); await sleep(500);
      r.invalidMsg = /valid 5-field cron/i.test(await H.bodyTextSafe(page));
      checker.ok(r.invalidMsg, "invalid cron shows a validation error");
      await cron.click(); await page.keyboard.press("Meta+A"); await page.keyboard.insertText("0 9 * * 1"); await sleep(500);
      r.desc = await page.locator(tid("agent-trigger-cron-description")).first().innerText().catch(() => null);
      checker.ok(!!r.desc, "human-readable cron description appears", r.desc);
      await H.shot(ctx, "trigger-schedule-modal");
      await page.click(tid("agent-trigger-config-cancel")).catch(() => closeAny(page)); await sleep(600);
      checker.equal(((await getAgent(page, id))?.triggers || []).length, 0, "Cancel does not create a trigger");
      // Esc
      await page.click(tid("agent-add-trigger")); await page.click(tid("agent-add-trigger-option-schedule")); await sleep(500);
      await closeAny(page);
      checker.ok(!(await H.visible(page, tid("agent-trigger-config-modal"))), "Esc closes the trigger modal");
      checker.equal(((await getAgent(page, id))?.triggers || []).length, 0, "Esc does not create a trigger");
      // NL -> cron (AI)
      await page.click(tid("agent-add-trigger")); await page.click(tid("agent-add-trigger-option-schedule")); await sleep(500);
      const nl = page.locator(tid("agent-trigger-cron-nl")).first();
      if (await nl.count()) {
        await nl.click(); await page.keyboard.insertText("every Tuesday and Thursday at 6pm"); await page.click(tid("agent-trigger-cron-generate")).catch(() => {});
        await sleep(9000);
        r.nlCron = await cron.inputValue().catch(() => null);
        r.nlMsg = (await H.bodyTextSafe(page)).match(/(AI schedule generation is unavailable here\.|Couldn't turn that into a schedule\.[^\n]*)/)?.[0] || null;
        H.note(ctx, `NL "every Tuesday and Thursday at 6pm" => cron=${r.nlCron} msg=${r.nlMsg}`);
        checker.ok(r.nlCron === "0 18 * * 2,4" || !!r.nlMsg, "generating cron from text returns a cron or a clear message", `${r.nlCron} | ${r.nlMsg}`);
      }
      await cron.click(); await page.keyboard.press("Meta+A"); await page.keyboard.insertText("0 9 * * 1"); await sleep(300);
      await page.click(tid("agent-trigger-config-add")); await sleep(1000);
      let a = await getAgent(page, id);
      r.triggers = a?.triggers;
      checker.ok((a?.triggers || []).some((t) => JSON.stringify(t).includes("0 9 * * 1")), "schedule '0 9 * * 1' saved in triggers[] (F-125)");
      checker.ok(await H.visible(page, tid("agent-trigger-card-schedule")), "schedule trigger card visible");
      const ss = await H.q(page, "agentSchedules:getAgentScheduleStatus", { agentId: id });
      r.scheduleStatus = ss.ok ? ss.v : ss.err;
      H.note(ctx, `scheduleStatus(disabled)=${JSON.stringify(r.scheduleStatus)}`);
      await page.click(tid("agent-trigger-remove-schedule")).catch(() => {}); await sleep(900);
      checker.equal(((await getAgent(page, id))?.triggers || []).length, 0, "removing schedule clears triggers[]");
      // github: shows webhook URL/secret; cancel
      await page.click(tid("agent-add-trigger")); await page.click(tid("agent-add-trigger-option-github")); await sleep(1500);
      const gtxt = await page.locator(tid("agent-trigger-config-modal")).first().innerText().catch(() => "");
      r.githubHasUrl = /\/agents\/webhook\//.test(gtxt) || (await page.locator(`${tid("agent-trigger-config-modal")} input`).evaluateAll((els) => els.some((e) => /\/agents\/webhook\//.test(e.value)))).valueOf();
      checker.ok(r.githubHasUrl, "GitHub trigger shows payload URL (F-127)");
      await H.shot(ctx, "trigger-github-modal");
      await page.click(tid("agent-trigger-config-cancel")).catch(() => closeAny(page)); await sleep(600);
      // slack: asks for workspace connection (does not click: OAuth)
      await page.click(tid("agent-add-trigger")); await page.click(tid("agent-add-trigger-option-slack")); await sleep(1200);
      r.slackConnect = await H.visible(page, tid("agent-trigger-slack-connect"));
      r.slackText = (await page.locator(tid("agent-trigger-config-modal")).first().innerText().catch(() => "")).slice(0, 200);
      checker.ok(r.slackConnect || /connect/i.test(r.slackText), "Slack trigger requires connecting the workspace (F-126) — not clicked (OAuth)");
      await H.shot(ctx, "trigger-slack-modal");
      await page.click(tid("agent-trigger-config-cancel")).catch(() => closeAny(page)); await sleep(600);
      a = await getAgent(page, id);
      checker.equal((a?.triggers || []).length, 0, "no trigger left on the agent");
      rec.triggers = r;
    },
  },
  {
    name: "agents-enable-disable",
    async fn(ctx) {
      const { page, checker } = ctx;
      if (!(await needLogged(ctx))) return;
      const id = ctx.suite.__mainAgent;
      if (!id) { checker.ok(false, "main agent exists"); return; }
      checker.ok(await setEnabled(page, id, true), "Enable turns the agent on (updateAgent enabled=true)");
      const st = await page.locator(tid(`agent-list-status-${id}`)).first().getAttribute("data-enabled").catch(() => null);
      checker.equal(st, "true", "list indicator: data-enabled=true");
      await H.shot(ctx, "agent-enabled");
      checker.ok(await setEnabled(page, id, false), "Disable turns the agent off");
    },
  },
  {
    name: "agents-real-run-and-panel",
    async fn(ctx) {
      const { page, checker, rec } = ctx;
      if (!(await needLogged(ctx))) return;
      const id = ctx.suite.__mainAgent;
      if (!id) { checker.ok(false, "main agent exists"); return; }
      const b = budget();
      if (b.runs.length >= (b.max || 5)) { H.skip(ctx, `run budget exhausted (${b.runs.length}/${b.max})`); checker.ok(true, "SKIP budget"); return; }
      const before = await expectedFromQueries(page);
      const known = new Set(((await H.q(page, "agentRuns:listRunsForAgent", { agentId: id, limit: 50 })).v || []).map((r) => r._id));
      // trigger: schedule every minute + enable; turn off as soon as the 1st run exists
      await openSettingsOf(page, id);
      checker.ok(await addScheduleTrigger(page, "* * * * *"), "schedule '* * * * *' added");
      checker.ok(await setEnabled(page, id, true), "agent enabled to fire");
      const t0 = Date.now();
      let run = null;
      const timeline = [];
      let disarmed = false;
      while (Date.now() - t0 < 300000) {
        const rr = await H.q(page, "agentRuns:listRunsForAgent", { agentId: id, limit: 10 });
        const fresh = (rr.v || []).filter((r) => !known.has(r._id));
        if (fresh.length && !disarmed) {
          disarmed = true;
          budgetAdd(fresh[0]._id, id);
          await setEnabled(page, id, false);
          await removeAllTriggers(page, id);
          timeline.push({ t: Date.now() - t0, ev: "disarmed" });
        }
        if (fresh.length) {
          run = fresh[fresh.length - 1];
          const last = timeline.filter((x) => x.status).slice(-1)[0];
          if (!last || last.status !== run.status) timeline.push({ t: Date.now() - t0, status: run.status, error: run.error ? String(run.error).slice(0, 160) : undefined });
          if (["done", "error", "cancelled", "canceled"].includes(run.status)) break;
          // panel during the active run
          if (["pending", "claimed", "running"].includes(run.status) && !rec.modDuring) {
            await H.modOpen(page); const st = await H.modState(page, 20000); await H.modClose(page);
            rec.modDuring = { status: run.status, active: st.last?.activeCount, byStatus: st.last?.byStatus };
            await H.shot(ctx, "mod-during-run");
          }
        }
        await sleep(1500);
      }
      if (!disarmed) { await setEnabled(page, id, false); await removeAllTriggers(page, id); }
      rec.timeline = timeline;
      rec.run = run && { _id: run._id, status: run.status, trigger: run.trigger, createdAt: run.createdAt, claimedAt: run.claimedAt, startedAt: run.startedAt, finishedAt: run.finishedAt, attemptCount: run.attemptCount, error: run.error, workspaceId: !!run.workspaceId, keys: Object.keys(run) };
      checker.ok(!!run, "schedule created a real run within ≤ 5 min (F-125)");
      if (!run) return;
      checker.equal(run.trigger, "schedule", "run.trigger = schedule");
      checker.ok(["done", "error"].includes(run.status), "run reached a terminal state (done/error)", run.status);
      checker.ok(!("costUsd" in run) && !("cost" in run), "run has no cost field (document it)", Object.keys(run).join(","));
      if (rec.modDuring) checker.ok((rec.modDuring.active || 0) >= 1, "mod: 'Active now' ≥ 1 during the run", JSON.stringify(rec.modDuring));
      const after = await expectedFromQueries(page);
      await H.modOpen(page); const st = await H.modState(page, 25000); await H.modClose(page);
      rec.modAfter = st.last;
      checker.equal(st.last?.total, after.summary.total, "mod: total after the run = queries");
      checker.ok(after.summary.total >= before.summary.total + 1, "total runs increased by ≥ 1", `${before.summary.total} -> ${after.summary.total}`);
      checker.equal(JSON.stringify(st.last?.byStatus), JSON.stringify(Object.fromEntries(Object.entries(after.summary.byStatus))), "mod: status breakdown after the run = queries");
      // Native UI: the run's workspace in the agent sidebar
      await H.gotoAgents(page);
      await page.evaluate((aid) => window.__AGENTS_ROUTE_STORE__?.getState().openAgent(aid), id);
      await sleep(1500);
      const rows = await page.locator(`${tid("agents-chat-sidebar")} [data-testid="workspace-row"]`).count();
      rec.runWorkspaces = rows;
      checker.ok(rows >= 1 || !run.workspaceId, "run appears as chat/workspace inside the agent (F-130)", `rows=${rows}`);
      await H.shot(ctx, "agent-runs");
    },
  },
  {
    name: "agents-delete-and-prefix-cleanup",
    async fn(ctx) {
      const { page, checker, rec } = ctx;
      if (!(await needLogged(ctx))) return;
      const id = ctx.suite.__mainAgent;
      if (id) {
        await setEnabled(page, id, false);
        await openSettingsOf(page, id);
        checker.ok(await deleteViaUi(page), "Delete agent via the actions menu (no confirmation dialog)");
        await sleep(800);
        const a = await getAgent(page, id);
        checker.ok(!a || a.deletedAt || a.isDeleted, "agent deleted in the backend");
        checker.ok(!(await H.visible(page, tid(`agent-list-row-${id}`))), "row disappears from the list");
      }
      // cleanup: all my agents with the prefix (any runid) + ledger
      const mine = await myAgents(page);
      const ledgerIds = new Set(H.ledgerRead(ctx).map((e) => e.agentId));
      const targets = mine.filter((a) => (a.name || "").startsWith(H.PREFIX_BASE) || ledgerIds.has(a._id));
      const cleaned = [];
      for (const a of targets) {
        if (!(a.name || "").startsWith(H.PREFIX_BASE) && !ledgerIds.has(a._id)) continue; // never the user's own agents
        await setEnabled(page, a._id, false);
        await openSettingsOf(page, a._id);
        await deleteViaUi(page);
        cleaned.push(a._id);
      }
      const left = (await myAgents(page)).filter((a) => (a.name || "").startsWith(H.PREFIX_BASE) || ledgerIds.has(a._id));
      rec.cleanup = { cleaned: cleaned.length, left: left.map((a) => a.name) };
      checker.equal(left.length, 0, "no QA-AUTO-agents-* agent left over");
    },
  },
  {
    name: "software-factory-entry",
    async fn(ctx) {
      const { page, checker, rec } = ctx;
      if (!(await needLogged(ctx))) return;
      await page.locator(tid("workspace-navbar-chat-button")).first().click().catch(() => {});
      await sleep(1000);
      const w = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="getting-started-widget"]');
        return el ? { text: el.innerText.replace(/\s+/g, " ").slice(0, 400) } : null;
      });
      rec.widget = w;
      const hidden = await page.evaluate(() => localStorage.getItem("tempo:gettingStartedWidgetHidden"));
      checker.ok(!!w || hidden === "true", "Getting started widget present (or hidden by the user)", JSON.stringify({ w: !!w, hidden }));
      if (w) checker.ok(/Launch Your Software Factory/i.test(w.text), "'Launch Your Software Factory' item (I-148)", w.text.slice(0, 160));
      await H.shot(ctx, "getting-started");
      H.note(ctx, "Deliberately not started: the skill creates 3 issues and ENABLES/assigns the user's own agents (forbidden in scope).");
    },
  },
];
