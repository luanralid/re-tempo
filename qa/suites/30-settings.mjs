// qa/suites/30-settings.mjs — full Settings (I-160..I-188). Requires a LOGGED-IN profile:
//   node run.mjs --suite 30-settings --profile qa-3
// Rules: no checkout/upgrade/invite/real token/promo/OAuth/logout. Data only with the prefix
// QA-AUTO-settings-<runid>, always restored. BYOK key is always fake.
import * as H from "./30-settings/helpers.mjs";
const { openSettings, closeSettings, gotoSection, navLabels, lsGet, lsSet, toggleState, sleep } = H;

async function shot(ctx, name) {
  const f = await ctx.lib.ui.screenshot(ctx.page, ctx.instDir, `settings-${name}`);
  if (f) ctx.rec.screenshots.push(f);
}
async function needSettings(ctx) {
  const ok = await openSettings(ctx.page);
  ctx.checker.ok(ok, "Settings opens (Return to app visible)");
  return ok;
}

export default {
  name: "30-settings",
  tests: [
    {
      name: "open-settings-and-navigation",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        await ctx.lib.ui.waitForReady(page);
        rec.screen = await ctx.lib.ui.detectScreen(page);
        if (rec.screen !== "home") { checker.ok(false, "logged-in profile (home)", `screen=${rec.screen}`); return; }
        if (!(await needSettings(ctx))) return;
        const labels = await navLabels(page);
        rec.nav = labels;
        for (const l of ["Personal", "Organizations", "Add organization", "Sign Out", ...H.PERSONAL])
          checker.includes(labels, l, `nav contains "${l}"`);
        checker.ok(!labels.includes("Referrals"), "Referrals hidden (I-177)");
        await shot(ctx, "nav");
        // alternative path: Return to app, reopen via the Meta+, shortcut
        await closeSettings(page);
        checker.ok(!(await H.isSettingsOpen(page)), "Return to app closes Settings");
        await page.keyboard.press("Meta+,");
        checker.ok(await H.waitSettings(page), "Meta+, opens Settings (F-012)");
      },
    },
    {
      name: "preferences-toggles-restore",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        if (!(await needSettings(ctx)) || !(await gotoSection(page, "Preferences"))) return;
        const ids = [
          ["settings-chat-links-open-in-tempo-toggle", "tempo:chatLinksOpenInTempo"],
          ["settings-workspace-pr-links-open-in-tempo-toggle", "tempo:workspacePrLinksOpenInTempo"],
        ];
        for (const [id, key] of ids) {
          const el = page.locator(`[data-testid="${id}"]`).first();
          checker.ok(await el.count(), `${id} present`);
          if (!(await el.count())) continue;
          const before = await toggleState(page, id), lsBefore = await lsGet(page, key);
          await el.click(); await sleep(250);
          const after = await toggleState(page, id), lsAfter = await lsGet(page, key);
          checker.ok(before !== after, `${id} toggles`, `${before}->${after}`);
          rec.notes = (rec.notes || "") + ` ${key}:${lsBefore}->${lsAfter};`;
          await el.click(); await sleep(250);
          checker.equal(await toggleState(page, id), before, `${id} restored`);
        }
        // controls present (I-162 depends on the build; I-163/147 account: read-only)
        for (const id of ["settings-auto-upload-diagnostics-toggle", "settings-max-agent-concurrency"])
          rec.notes = (rec.notes || "") + ` ${id}:${(await page.locator(`[data-testid="${id}"]`).count()) ? "present" : "absent"};`;
        rec.processMemoryTracker = await page.locator('[data-testid="settings-process-memory-tracker-toggle"]').count();
        await shot(ctx, "preferences");
      },
    },
    {
      name: "theme-light-dark-persists",
      async fn(ctx) {
        const { page, checker } = ctx;
        const orig = await lsGet(page, "tempo-theme");
        const theme = () => page.evaluate(() => document.documentElement.getAttribute("data-theme"));
        try {
          if (!(await needSettings(ctx)) || !(await gotoSection(page, "Preferences"))) return;
          const origAttr = await theme();
          const target = origAttr === "light" ? "Dark" : "Light";
          const opt = page.getByRole("radio", { name: target }).or(page.getByRole("tab", { name: target })).or(page.getByRole("button", { name: target, exact: true })).first();
          if (!(await opt.count())) { checker.ok(false, `theme selector "${target}" found`); return; }
          await opt.click(); await sleep(400);
          checker.equal(await theme(), target === "Light" ? "light" : null, "data-theme reflected the choice");
          checker.equal(await lsGet(page, "tempo-theme"), target.toLowerCase(), "tempo-theme written to localStorage");
          await shot(ctx, `theme-${target.toLowerCase()}`);
        } finally {
          await lsSet(page, "tempo-theme", orig);
          const o = orig;
          await page.evaluate((o) => { if (o === "light") document.documentElement.setAttribute("data-theme", "light"); else document.documentElement.removeAttribute("data-theme"); }, o);
        }
      },
    },
    {
      name: "chat-defaults-and-system-prompt-read-only",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        if (!(await needSettings(ctx)) || !(await gotoSection(page, "Chat"))) return;
        checker.ok(await page.locator('[aria-label="New chat defaults"]').count(), "New chat defaults present (I-166)");
        const sp = page.locator('[data-testid="settings-user-system-prompt"]').first();
        checker.ok(await sp.count(), "system prompt present (I-167)");
        rec.systemPromptLen = (await sp.inputValue().catch(() => "")).length;
        // leave without saving: typing and going back without blur must not persist (account) — only observes, restores.
        await shot(ctx, "chat");
      },
    },
    {
      name: "providers-byok-fake-key",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        if (!(await needSettings(ctx)) || !(await gotoSection(page, "Providers"))) return;
        checker.ok(await page.locator('[data-testid="providers-tab"]').count(), "providers-tab present");
        const groups = await page.locator('[data-testid^="provider-group-"]').evaluateAll((n) => n.map((e) => e.dataset.testid));
        rec.providerGroups = groups;
        checker.ok(groups.length > 0, "provider groups listed", JSON.stringify(groups));
        const setBtn = page.locator('[data-testid^="model-set-key-"]').first();
        if (!(await setBtn.count())) { checker.ok(false, "there is a model with 'Set key' (no previous key)"); return; }
        const id = (await setBtn.getAttribute("data-testid")).replace("model-set-key-", "");
        await setBtn.click();
        const save = page.locator(`[data-testid="model-save-${id}"]`);
        checker.ok(await save.isDisabled(), "Save key disabled with an empty field");
        await page.locator(`[data-testid="model-key-input-${id}"]`).fill("   ");
        checker.ok(await save.isDisabled(), "Save key disabled with whitespace only");
        await page.locator(`[data-testid="model-key-input-${id}"]`).fill(H.FAKE_KEY);
        await page.keyboard.press("Escape"); // Esc/cancel must not save
        await page.getByRole("button", { name: "Cancel" }).first().click().catch(() => {});
        checker.equal(await page.locator(`[data-testid="model-remove-${id}"]`).count(), 0, "Cancel does not save the key");
        await page.locator(`[data-testid="model-set-key-${id}"]`).click();
        await page.locator(`[data-testid="model-key-input-${id}"]`).fill(H.FAKE_KEY);
        await save.click(); await sleep(800);
        const rm = page.locator(`[data-testid="model-remove-${id}"]`);
        try {
          checker.ok(await rm.count(), "key saved: 'Custom key' + Remove");
          const row = await page.locator(`[data-testid="model-row-${id}"]`).innerText().catch(() => "");
          checker.ok(row.includes("Custom key") && !row.includes(H.FAKE_KEY), "key masked in the row", row.replace(/\n/g, " | "));
          await shot(ctx, "byok-saved");
        } finally {
          if (await rm.count()) { await rm.click(); await sleep(600); }
        }
        checker.equal(await page.locator(`[data-testid="model-remove-${id}"]`).count(), 0, "key removed (restored)");
        rec.byokModel = id;
      },
    },
    {
      name: "billing-and-auth-tokens-read-only",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        if (!(await needSettings(ctx))) return;
        // Billing: text only; NEVER click Subscribe/Manage Plan/Redeem/top-up.
        if (await gotoSection(page, "Billing")) {
          const t = await ctx.lib.ui.bodyText(page);
          rec.billingText = t.slice(0, 1500);
          checker.ok(t.length > 0, "Billing renders");
          await shot(ctx, "billing");
        }
        if (await gotoSection(page, "Auth tokens")) {
          const t = await ctx.lib.ui.bodyText(page);
          checker.includes(t, "TEMPO_AUTH_TOKEN", "Auth tokens explains TEMPO_AUTH_TOKEN");
          await shot(ctx, "auth-tokens");
        }
      },
    },
    {
      name: "org-tabs-read-only",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        if (!(await needSettings(ctx))) return;
        const orgs = await page.evaluate(() => {
          const col = [...document.querySelectorAll("div")].find((d) => d.querySelector(":scope > span")?.textContent === "Organizations");
          return col ? [...col.querySelectorAll("button")].map((b) => b.innerText.trim()).filter(Boolean) : [];
        });
        rec.orgs = orgs;
        checker.ok(orgs.length > 0, "organizations listed", JSON.stringify(orgs));
        const first = orgs.find((o) => o !== "Add organization");
        if (!first) return;
        await gotoSection(page, first.split("\n")[0]);
        for (const id of ["org-name-input", "org-slug-input", "org-logo-input"])
          rec[id] = await page.locator(`[data-testid="${id}"]`).count();
        rec.orgTabs = await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].map((t) => t.innerText.trim()));
        await shot(ctx, "org");
      },
    },
    {
      name: "preferences-accessibility-theme-selector",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        if (!(await needSettings(ctx)) || !(await gotoSection(page, "Preferences"))) return;
        // Dark/Light are buttons with visible text (accessible name ok); does the switch accept Space?
        const sw = page.locator('[data-testid="settings-chat-links-open-in-tempo-toggle"]').first();
        const before = await toggleState(page, "settings-chat-links-open-in-tempo-toggle");
        await sw.focus(); await page.keyboard.press("Space"); await sleep(250);
        const after = await toggleState(page, "settings-chat-links-open-in-tempo-toggle");
        checker.ok(before !== after, "switch toggles via keyboard (Space)", `${before}->${after}`);
        if (before !== after) { await page.keyboard.press("Space"); await sleep(250); }
        checker.equal(await toggleState(page, "settings-chat-links-open-in-tempo-toggle"), before, "switch restored");
        const mc = page.locator('[data-testid="settings-max-agent-concurrency"]').first();
        rec.maxConcurrency = await mc.inputValue();
        checker.ok(await mc.getAttribute("min") === "1" && await mc.getAttribute("max") === "50", "concurrency has min=1 max=50 (read-only)");
      },
    },
    {
      name: "persistence-after-reload",
      async fn(ctx) {
        const { page, checker } = ctx;
        const id = "settings-workspace-pr-links-open-in-tempo-toggle";
        if (!(await needSettings(ctx)) || !(await gotoSection(page, "Preferences"))) return;
        const before = await toggleState(page, id);
        try {
          await page.locator(`[data-testid="${id}"]`).click(); await sleep(300);
          const flipped = await toggleState(page, id);
          await page.reload(); await ctx.lib.ui.waitForReady(page); await sleep(2500);
          await openSettings(page); await gotoSection(page, "Preferences");
          checker.equal(await toggleState(page, id), flipped, "toggle persists after reload");
        } finally {
          if ((await toggleState(page, id)) !== before) await page.locator(`[data-testid="${id}"]`).click().catch(() => {});
          await sleep(300);
        }
        checker.equal(await toggleState(page, id), before, "toggle restored to the original value");
      },
    },
    {
      name: "org-tabs-and-testids",
      async fn(ctx) {
        const { page, checker, rec } = ctx;
        if (!(await needSettings(ctx))) return;
        await page.locator("div.w-60 button", { hasText: "Admin" }).first().click(); await sleep(700);
        const want = { General: ["org-logo-input", "org-name-input", "org-slug-input"], Members: ["invite-members-button", "member-row"],
          Projects: ["add-project-to-org-button", "settings-project-row"], Stages: ["issues-stages-editor"],
          Integrations: ["linear-integration-card", "slack-integration-card", "linear-connect-button", "slack-connect-button"],
          Agents: ["settings-public-agents"], Admin: [] };
        for (const [tab, ids] of Object.entries(want)) {
          await page.getByRole("tab", { name: tab, exact: true }).first().click().catch(() => {}); await sleep(500);
          for (const t of ids) checker.ok(await page.locator(`[data-testid="${t}"]`).count(), `${tab}: ${t}`);
        }
        checker.ok(await page.getByText("Delete organization").count(), "Admin tab shows 'Delete organization' (NOT clicked)");
        checker.equal(await page.locator('[data-testid="pr-insights-chart"]').count(), 0, "Insights absent (flag org-pr-insights off)");
        // read-only: slug with prefix
        await page.getByRole("tab", { name: "General", exact: true }).first().click(); await sleep(400);
        rec.orgName = await page.locator('[data-testid="org-name-input"]').inputValue();
        checker.ok(rec.orgName.length > 0, "org name readable");
      },
    },
    {
      name: "byok-offline-and-esc",
      async fn(ctx) {
        const { page, checker } = ctx;
        if (!(await needSettings(ctx)) || !(await gotoSection(page, "Providers"))) return;
        const id = "haiku-4.5";
        const rm = page.locator(`[data-testid="model-remove-${id}"]`);
        try {
          await page.locator(`[data-testid="model-set-key-${id}"]`).click();
          await page.locator(`[data-testid="model-key-input-${id}"]`).fill(H.FAKE_KEY + "-offline-😀-ÿ");
          await page.context().setOffline(true);
          await page.locator(`[data-testid="model-save-${id}"]`).click(); await sleep(800);
          checker.ok(await rm.count(), "BYOK saves offline (local storage)");
        } finally {
          await page.context().setOffline(false);
          if (await rm.count()) { await rm.click(); await sleep(500); }
        }
        checker.equal(await rm.count(), 0, "offline key removed");
        // Esc inside the form: does it close the whole Settings?
        await page.locator(`[data-testid="model-set-key-${id}"]`).click();
        await page.keyboard.press("Escape"); await sleep(400);
        ctx.rec.notes = `Esc in the BYOK form: form ${await page.locator(`[data-testid="model-key-input-${id}"]`).count() ? "stays" : "closes"}; Settings ${(await H.isSettingsOpen(page)) ? "stays" : "closes"}`;
        if (await page.locator(`[data-testid="model-key-input-${id}"]`).count()) await page.getByRole("button", { name: "Cancel" }).first().click();
      },
    },
    {
      name: "keyboard-labels-and-console",
      async fn(ctx) {
        const { page, checker, collectors, rec } = ctx;
        if (!(await needSettings(ctx)) || !(await gotoSection(page, "Preferences"))) return;
        const unlabeled = await page.evaluate(() => {
          const root = document.querySelector("div.w-60")?.parentElement;
          return [...root.querySelectorAll("input:not([type=checkbox]), textarea, select, [role=switch], button")]
            .filter((e) => e.closest("[data-testid=issues-view], [data-testid=issues-sidebar]") == null)
            .filter((e) => !e.closest("div.w-60"))
            .filter((e) => !e.getAttribute("aria-label") && !e.getAttribute("aria-labelledby") && !(e.innerText || "").trim() && !e.id)
            .map((e) => e.getAttribute("data-testid") || e.tagName + ":" + e.type);
        });
        rec.unlabeled = unlabeled;
        checker.ok(unlabeled.length === 0, "Preferences controls have an accessible label", JSON.stringify(unlabeled));
        for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
        checker.ok(await page.evaluate(() => document.activeElement && document.activeElement !== document.body), "Tab moves focus to a control");
        checker.equal(collectors.exceptions.length, 0, "no unhandled exception");
        rec.consoleErrors = collectors.consoleErrors.slice(0, 10).map((e) => e.text ?? String(e));
      },
    },
  ],
};
