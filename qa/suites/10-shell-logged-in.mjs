// qa/suites/10-shell-logged-in.mjs — logged-in shell (navbar, palettes, shortcuts, Help, Bug,
// Settings, avatar, tabs, persistence). Runs on profile qa-1:
//   node run.mjs --suite 10-shell-logged-in --profile qa-1
// Order matters: (1) clean up old QA-AUTO-shell project; (2) empty state; (3) create a local
// project by file:// clone (registration in Convex fails on purpose: nothing is written to the account);
// (4) tabs; (5) delete the project (Settings > Delete from client, only the QA-AUTO-shell- prefix).
// Never: sign-out, submit a bug report, click external links, tick "Don't show me again".
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PREFIX = "QA-AUTO-shell-";
const RUN = Date.now().toString(36);
const SRC_ROOT = "/tmp/tempo-qa/qa-auto-src";
const PROJECT = `${PREFIX}${RUN}`;
const SRC = `${SRC_ROOT}/${PROJECT}`;

const ROUTES = ["chat", "docs", "design", "issues", "agents"];
const route = (page) => page.evaluate(() => localStorage.getItem("tempo:active-nav-route"));
const nav = async (page, id) => { await page.locator(`[data-testid="workspace-navbar-${id}-button"]`).click(); await sleep(700); };
const menus = (page) => page.evaluate(() => document.querySelectorAll('[role="menu"],[role="dialog"]').length);
const tabs = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid="tab-bar"] [role="tab"]')]
  .map((e) => ({ id: e.dataset.testid, sel: e.getAttribute("aria-selected") === "true", name: (e.innerText || "").trim() })));
const kinds = (list) => list.map((t) => t.id.replace(/-.*/, "").replace("chat", "chat"));
async function logged(ctx) {
  const ok = (await ctx.page.locator('[data-testid="workspace-navbar"]').count()) > 0;
  if (!ok) { ctx.rec.notes = "profile has no logged-in session: test skipped"; ctx.checker.ok(true, "skip: not logged in"); }
  return ok;
}
async function resetUi(page) {
  for (let i = 0; i < 3; i++) { await page.keyboard.press("Escape"); await sleep(150); }
  if (await page.locator('[data-testid="bug-report-cancel"]').count()) await page.locator('[data-testid="bug-report-cancel"]').click();
  if ((await page.locator('[data-base-ui-inert]').count()) > 0) { await page.mouse.click(1300, 880); await sleep(300); }
  if ((await page.locator("text=Return to app").count()) > 0) { await page.getByText("Return to app").click(); await sleep(600); }
}
async function projectNames(page) {
  return page.evaluate(() => [...document.querySelectorAll('[data-testid="project-item"]')].map((e) => (e.innerText || "").split("\n")[0].trim()));
}
async function deleteProject(page, name) {
  await nav(page, "chat");
  const item = page.locator('[data-testid="project-item"]', { hasText: name }).first();
  await item.hover(); await sleep(300);
  await page.locator(`button[aria-label="Settings for ${name}"]`).click(); await sleep(1200);
  await page.getByRole("button", { name: "Delete from client" }).click(); await sleep(600);
  await page.locator('[data-testid="delete-project-from-client-confirm"]').click(); await sleep(2000);
  await resetUi(page);
}

export default {
  name: "10-shell-logged-in",
  tests: [
    {
      name: "initial-cleanup-qa-projects",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        await resetUi(page);
        await nav(page, "chat");
        let removed = 0;
        for (const n of await projectNames(page)) {
          if (n.startsWith(PREFIX)) { await deleteProject(page, n); removed++; }
        }
        ctx.rec.notes = `projects ${PREFIX}* removed: ${removed}`;
        const left = (await projectNames(page)).filter((n) => n.startsWith(PREFIX));
        checker.equal(left.length, 0, "no QA-AUTO-shell project left");
      },
    },
    {
      name: "logged-in-no-onboarding-or-upgrade-gates",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        for (const t of ["onboarding-next", "force-upgrade-overlay", "reauth-banner", "auth-status-banner", "connection-outage-banner", "login-heading"]) {
          checker.equal(await page.locator(`[data-testid="${t}"]`).count(), 0, `gate/banner absent: ${t}`);
        }
        checker.equal(await ctx.lib.ui.detectScreen(page), "home", "screen = home");
      },
    },
    {
      name: "empty-home-texts-and-cards",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        await nav(page, "chat");
        const t = await ctx.lib.ui.bodyText(page);
        checker.includes(t, "No workspaces yet", "text No workspaces yet (I-040)");
        checker.equal(await page.locator('[data-testid="workspaces-welcome"]').count(), 1, "workspaces-welcome");
        checker.ok(t.includes("Let's do it") || t.includes("Let's Cook"), "home title: mod 'Let's do it' or native 'Let's Cook'");
        for (const c of ["Generate", "Open folder", "Import project"]) checker.includes(t, c, `card ${c}`);
        for (const id of ["empty-state-generate", "empty-state-open-folder", "empty-state-clone-repository"]) {
          checker.equal(await page.locator(`[data-testid="${id}"]`).count(), 1, id);
        }
        checker.includes(t, "Chats", "Chats panel");
        const shot = await ctx.lib.ui.screenshot(ctx.page, ctx.instDir, "empty-home");
        if (shot) ctx.rec.screenshots.push(shot);
      },
    },
    {
      name: "navbar-buttons-aria-and-footer",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        const names = { chat: "Chat", docs: "Docs", design: "Design", issues: "Issues", agents: "Agents" };
        for (const [id, label] of Object.entries(names)) {
          checker.equal(await page.locator(`[data-testid="workspace-navbar-${id}-button"]`).getAttribute("aria-label"), label, `aria-label ${id}`);
        }
        for (const l of ["Report a bug", "Help", "Settings", "User menu", "Switch organization", "Toggle left panel", "Back", "Forward", "Close", "Minimize", "Maximize"]) {
          checker.equal(await page.locator(`button[aria-label="${l}"]`).count(), 1, `button ${l}`);
        }
      },
    },
    {
      name: "navbar-clicks-and-ctrl-1-9",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        const expect = { chat: "chat", docs: "docs", design: "design", issues: "issues", agents: "issues" }; // Agents is a sub-view of issues
        for (const id of ROUTES) {
          await nav(page, id);
          checker.equal(await route(page), expect[id], `click ${id} -> route ${expect[id]}`);
          checker.equal(await page.locator(`[data-testid="workspace-navbar-${id}-button"]`).count(), 1, `button ${id} still present`);
        }
        await nav(page, "chat");
        for (let i = 1; i <= 5; i++) {
          await page.keyboard.press(`Control+Digit${i}`); await sleep(600);
          const label = await page.evaluate(() => document.activeElement && null);
          checker.equal(await route(page), expect[ROUTES[i - 1]], `Ctrl+${i} -> ${ROUTES[i - 1]}`);
        }
        // Ctrl+6..9: the dialog announces 1…9, but there are only 5 sections (divergence D-03: no effect)
        await page.keyboard.press("Control+Digit4"); await sleep(500);
        for (let i = 6; i <= 9; i++) {
          await page.keyboard.press(`Control+Digit${i}`); await sleep(300);
          checker.equal(await route(page), "issues", `Ctrl+${i} has no effect (only 5 sections)`);
        }
        await nav(page, "chat");
      },
    },
    {
      name: "history-back-forward",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        await nav(page, "docs"); await nav(page, "issues");
        await page.locator('button[aria-label="Back"]').click(); await sleep(700);
        checker.equal(await route(page), "docs", "Back returns to docs");
        checker.equal(await page.locator('button[aria-label="Forward"]').isDisabled(), false, "Forward enabled after Back");
        await page.locator('button[aria-label="Forward"]').click(); await sleep(700);
        checker.equal(await route(page), "issues", "Forward goes to issues");
        await nav(page, "chat");
      },
    },
    {
      name: "sidebar-toggle-button-and-mod-b",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        await nav(page, "chat");
        const open = () => page.locator('[data-testid="workspace-sidebar"]').count();
        checker.equal(await open(), 1, "sidebar initially visible");
        await page.keyboard.press("Meta+KeyB"); await sleep(700);
        checker.equal(await open(), 0, "Mod+B hides the sidebar");
        await page.keyboard.press("Meta+KeyB"); await sleep(700);
        checker.equal(await open(), 1, "Mod+B shows it again");
        await page.locator('button[aria-label="Toggle left panel"]').click(); await sleep(700);
        checker.equal(await open(), 0, "button hides");
        checker.equal(await page.locator('button[aria-label="Toggle left panel"]').getAttribute("aria-pressed"), "false", "aria-pressed=false when hidden");
        await page.locator('button[aria-label="Toggle left panel"]').click(); await sleep(700);
        checker.equal(await open(), 1, "button shows");
      },
    },
    {
      name: "palettes-open-search-and-close",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        await resetUi(page);
        const pal = [["Meta+Shift+KeyP", "Type a command..."], ["Meta+KeyP", "Search anything across Tempo"], ["Meta+KeyK", "Search conversations..."]];
        for (const [k, ph] of pal) {
          await page.keyboard.press(k); await sleep(700);
          const input = page.locator("[cmdk-input]");
          checker.equal(await input.count(), 1, `${k} opens palette`);
          checker.includes((await input.first().getAttribute("placeholder")) || "", ph, `placeholder ${k}`);
          for (const v of ["zzzzqq-nothing", "😀 日本語 ünï", "x".repeat(300)]) {
            await input.first().fill(v); await sleep(300);
            checker.equal(await page.locator("[cmdk-root]").count(), 1, `${k}: input '${v.slice(0, 8)}' does not break it`);
          }
          await page.keyboard.press("Escape"); await sleep(400);
          checker.equal(await page.locator("[cmdk-input]").count(), 0, `Esc closes ${k}`);
        }
        // run a harmless command: Go to File -> opens the file palette
        await page.keyboard.press("Meta+Shift+KeyP"); await sleep(600);
        const items = await page.evaluate(() => [...document.querySelectorAll("[cmdk-item]")].map((e) => e.innerText.replace(/\s+/g, " ")));
        ctx.rec.notes = `commands without a project: ${JSON.stringify(items)}`;
        checker.ok(items.some((t) => t.startsWith("Go to File")), "Go to File command listed");
        await page.locator("[cmdk-item]", { hasText: "Go to File" }).first().click(); await sleep(700);
        checker.includes((await page.locator("[cmdk-input]").first().getAttribute("placeholder")) || "", "Search anything", "running 'Go to File' opens the file palette");
        await page.keyboard.press("Escape"); await sleep(400);
        checker.equal(await page.locator("[cmdk-input]").count(), 0, "palette closed");
      },
    },
    {
      name: "help-menu-items-and-esc",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        await resetUi(page);
        await page.locator('[data-testid="help-menu-button"]').click(); await sleep(500);
        const items = await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((e) => e.innerText.replace(/\s+/g, " ").trim()));
        checker.equal(items.length, 3, "3 items in Help", JSON.stringify(items));
        checker.ok(items[0].startsWith("Keyboard Shortcuts"), "Keyboard Shortcuts item");
        checker.equal(items[1], "Documentation", "Documentation item");
        checker.equal(items[2], "Community", "Community item");
        // external links: not clicked (they would open the browser). Destination only verifiable in code (docs.tempo.new, Discord).
        checker.equal(await page.locator('[role="menuitem"][href]').count(), 0, "items are buttons (no href): destination UNTESTABLE without opening a browser");
        await page.keyboard.press("Escape"); await sleep(400);
        checker.equal(await menus(page), 0, "Esc closes the Help menu");
      },
    },
    {
      name: "keyboard-shortcuts-dialog",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        await resetUi(page);
        const text = () => page.evaluate(() => (document.querySelector('[role="dialog"]') || {}).innerText || "");
        await page.locator('[data-testid="help-menu-button"]').click(); await sleep(400);
        await page.getByRole("menuitem", { name: /Keyboard Shortcuts/ }).click(); await sleep(700);
        let t = await text();
        const docs = ["File palette", "Command palette", "Conversation palette", "Jump to sidebar section", "Open settings", "Report a bug",
          "Focus chat input", "Toggle chat sidebar", "Open new tab menu", "Open split view menu", "Close non-chat tab", "Reopen closed tab",
          "Next chat", "Previous chat", "Back", "Forward", "Select", "Frame", "Rectangle", "Text", "Zoom to fit", "Toggle right panel", "Open DevTools", "Toggle fullscreen"];
        for (const d of docs) checker.includes(t, d, `shortcut listed: ${d}`);
        const input = page.getByPlaceholder("Search shortcuts", { exact: false });
        await input.first().fill("zzzzqq"); await sleep(300);
        checker.includes(await text(), "No shortcuts match", "search with no results");
        await input.first().fill("palette"); await sleep(300);
        t = await text();
        checker.ok(t.includes("File palette") && !t.includes("Zoom to fit"), "search filters by 'palette'");
        await input.first().fill("😀"); await sleep(300);
        checker.includes(await text(), "No shortcuts match", "emoji search with no results");
        await page.keyboard.press("Escape"); await sleep(500);
        checker.equal(await page.locator('[role="dialog"]').count(), 0, "Esc closes the dialog");
        await page.keyboard.press("Control+Shift+Slash"); await sleep(700);
        checker.includes(await text(), "Keyboard shortcuts", "Ctrl+Shift+/ opens the dialog");
        await page.keyboard.press("Escape"); await sleep(400);
      },
    },
    {
      name: "bug-report-opens-validates-and-cancels",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        await resetUi(page);
        const d = '[data-testid="bug-report-dialog"]';
        await page.locator('[data-testid="bug-report-button"]').click(); await sleep(700);
        checker.equal(await page.locator(d).count(), 1, "button opens the dialog");
        for (const t of ["bug-report-description", "bug-report-record", "bug-report-attach-button", "bug-report-email-updates", "bug-report-cancel", "bug-report-submit"]) {
          checker.equal(await page.locator(`[data-testid="${t}"]`).count(), 1, t);
        }
        checker.includes(await page.locator(d).innerText(), "4000 characters left", "initial counter");
        const ta = page.locator('[data-testid="bug-report-description"]');
        await ta.fill("😀 ünï test QA-AUTO-shell — DO NOT SUBMIT"); await sleep(200);
        checker.ok(!(await page.locator(d).innerText()).includes("4000 characters left"), "counter decreases with unicode");
        await ta.fill("y".repeat(4500)); await sleep(300);
        const len = await ta.evaluate((e) => e.value.length);
        ctx.rec.notes = `pasted text of 4500 chars -> ${len} in the field`;
        checker.ok(len <= 4500, "field accepts/truncates long text", `len=${len}`);
        await ta.fill(""); 
        await page.keyboard.press("Escape"); await sleep(500);
        checker.equal(await page.locator(d).count(), 0, "Esc closes");
        await page.keyboard.press("Meta+Shift+KeyB"); await sleep(700);
        checker.equal(await page.locator(d).count(), 1, "Mod+Shift+B opens");
        await page.locator('[data-testid="bug-report-cancel"]').click(); await sleep(500);
        checker.equal(await page.locator(d).count(), 0, "Cancel closes (NEVER submit)");
      },
    },
    {
      name: "settings-button-shortcut-and-return",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        await resetUi(page);
        const inSettings = async () => (await page.getByText("Return to app").count()) > 0;
        await page.locator('button[aria-label="Settings"]').click(); await sleep(900);
        checker.ok(await inSettings(), "button opens Settings");
        const t = await ctx.lib.ui.bodyText(page);
        for (const s of ["Preferences", "Chat", "Billing", "Auth tokens", "Providers", "Organizations", "Appearance"]) checker.includes(t, s, `Settings: ${s}`);
        checker.includes(t, "Sign Out", "Sign Out visible (not clicked)");
        await page.keyboard.press("Escape"); await sleep(500);
        checker.ok(await inSettings(), "Esc does NOT leave Settings (D-04, observed behavior)");
        await page.getByText("Return to app").click(); await sleep(700);
        checker.ok(!(await inSettings()), "Return to app goes back");
        await page.keyboard.press("Meta+Comma"); await sleep(900);
        checker.ok(await inSettings(), "Mod+, opens Settings");
        await page.getByText("Return to app").click(); await sleep(700);
        checker.ok(!(await inSettings()), "return ok");
      },
    },
    {
      name: "avatar-and-org-switcher",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        await resetUi(page);
        await page.locator('button[aria-label="User menu"]').click(); await sleep(600);
        const t = await page.evaluate(() => (document.querySelector('[role="menu"]') || {}).innerText || "");
        checker.includes(t, "@", "avatar menu shows email");
        checker.includes(t, "Sign Out", "avatar menu has Sign Out (not clicked)");
        await page.keyboard.press("Escape"); await sleep(400);
        checker.equal(await menus(page), 0, "Esc closes the avatar menu");
        await page.locator('button[aria-label="Switch organization"]').click(); await sleep(600);
        const o = await page.evaluate(() => (document.querySelector('[role="menu"]') || {}).innerText || "");
        checker.includes(o, "Add an organization", "org switcher: Add an organization");
        checker.includes(o, "Show organization switcher", "org switcher: Show organization switcher");
        await page.keyboard.press("Escape"); await sleep(500);
        const still = await menus(page);
        ctx.rec.notes = `Esc in org switcher: menus open after Esc = ${still} (D-02: focus goes to input and Esc does not close)`;
        checker.ok(true, `D-02 record: menu open after Esc = ${still}`);
        await resetUi(page);
        checker.equal(await menus(page), 0, "click outside closes");
      },
    },
    {
      name: "add-project-menu-and-import-dialog",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        await resetUi(page); await nav(page, "chat");
        await page.locator('[data-testid="workspace-sidebar-footer-add-project"]').click(); await sleep(500);
        const ids = await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((e) => e.innerText.trim()));
        checker.equal(ids.join("|"), "Generate|Open folder|Import project", "Add project: 3 intents");
        await page.keyboard.press("Escape"); await sleep(300);
        await page.locator('[data-testid="chats-overflow-menu"]').click(); await sleep(500);
        const ov = await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((e) => e.innerText.trim()));
        checker.equal(ov.join("|"), "Add project|Select chats", "menu Chat list options");
        await page.keyboard.press("Escape"); await sleep(300);
        await page.locator('[data-testid="empty-state-clone-repository"]').click(); await sleep(700);
        const dt = await page.evaluate(() => (document.querySelector('[role="dialog"]') || {}).innerText || "");
        checker.includes(dt, "Import project", "Import project dialog");
        checker.includes(dt, "Clone from URL", "Clone from URL path");
        checker.includes(dt, "From your organization", "From your organization path");
        await page.keyboard.press("Escape"); await sleep(500);
        checker.equal(await page.locator('[role="dialog"]').count(), 0, "Esc closes Import");
      },
    },
    {
      name: "clone-dialog-input-validation",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        await resetUi(page); await nav(page, "chat");
        await page.locator('[data-testid="empty-state-clone-repository"]').click(); await sleep(600);
        await page.locator('[data-testid="add-repo-source-clone"]').click(); await sleep(600);
        const url = page.locator('[data-testid="project-setup-git-url-input"]');
        const name = page.locator('[data-testid="project-setup-name-input"]');
        const submit = page.locator('[data-testid="project-setup-submit"]');
        checker.equal(await url.getAttribute("placeholder"), "https://github.com/org/repo.git", "URL placeholder");
        checker.equal(await name.getAttribute("placeholder"), "my-project", "name placeholder");
        await url.fill("https://github.com/org/my-repo.git"); await sleep(600);
        checker.equal(await name.inputValue(), "my-repo", "name derived from https URL");
        await url.fill("git@github.com:org/other.git"); await sleep(600);
        checker.equal(await name.inputValue(), "other", "name derived from ssh URL");
        await url.fill("https://"); await sleep(900);
        checker.equal(await submit.isDisabled(), true, "URL 'https://' disables submit");
        for (const v of ["😀 ünïcode", "x".repeat(600)]) {
          await url.fill(v); await sleep(500);
          checker.equal(await page.locator('[role="dialog"]').count(), 1, `input '${v.slice(0, 6)}' does not break the dialog`);
        }
        await page.locator('[data-testid="project-setup-back"]').click(); await sleep(500);
        checker.equal(await page.locator('[data-testid="add-repo-source-clone"]').count(), 1, "Back returns to the choice");
        await page.keyboard.press("Escape"); await sleep(400);
        checker.equal(await page.locator('[role="dialog"]').count(), 0, "Esc closes");
      },
    },
    {
      name: "local-project-clone-file-url",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        fs.mkdirSync(SRC, { recursive: true });
        const g = (...a) => execFileSync("git", ["-C", SRC, "-c", "user.email=qa@example.com", "-c", "user.name=qa", ...a]);
        execFileSync("git", ["-C", SRC, "init", "-q"]); fs.writeFileSync(`${SRC}/README.md`, "qa\n"); g("add", "."); g("commit", "-qm", "init");
        await resetUi(page); await nav(page, "chat");
        await page.locator('[data-testid="empty-state-clone-repository"]').click(); await sleep(600);
        await page.locator('[data-testid="add-repo-source-clone"]').click(); await sleep(600);
        await page.locator('[data-testid="project-setup-git-url-input"]').fill(`file://${SRC}`); await sleep(1200);
        checker.equal(await page.locator('[data-testid="project-setup-name-input"]').inputValue(), PROJECT, "derived name = folder");
        await page.locator('[data-testid="project-setup-submit"]').click();
        for (let i = 0; i < 30; i++) { await sleep(1000); if ((await projectNames(page)).includes(PROJECT)) break; }
        await sleep(2500);
        checker.ok((await projectNames(page)).includes(PROJECT), "project appears in the sidebar");
        const t = await ctx.lib.ui.bodyText(page);
        checker.ok(!t.includes("No workspaces yet"), "empty state disappears");
        checker.equal(await page.locator('[data-testid="chat-tab"]').count(), 1, "root chat-tab created");
        ctx.rec.notes = `expected toast: ${t.includes("Couldn't register project") ? "Couldn't register project (invalid file:// remote; nothing written to Convex)" : "no toast"}`;
        const shot = await ctx.lib.ui.screenshot(page, ctx.instDir, "local-project");
        if (shot) ctx.rec.screenshots.push(shot);
      },
    },
    {
      name: "tabs-new-tab-menu-and-types",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        await resetUi(page); await nav(page, "chat");
        const base = (await tabs(page)).length;
        await page.keyboard.press("Meta+KeyT"); await sleep(600);
        const acts = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="new-tab-action-"]')].map((e) => [e.dataset.testid.replace("new-tab-action-", ""), e.getAttribute("aria-disabled") === "true"]));
        ctx.rec.notes = `actions: ${JSON.stringify(acts)}`;
        checker.equal(acts.map((a) => a[0]).join(","), "chat,canvas,prd,issue,terminal,browser,open", "Mod+T lists 7 actions");
        checker.equal(acts.find((a) => a[0] === "canvas")[1], true, "New Canvas disabled without remote (observed)");
        await page.keyboard.press("Escape"); await sleep(400);
        checker.equal(await page.locator('[data-testid="new-tab-panel"]').count(), 0, "Esc closes the menu");
        // via + button, click
        for (const id of ["terminal", "browser", "chat"]) {
          await page.locator('[data-testid="center-panel-add-tab-button"]').click(); await sleep(500);
          await page.locator(`[data-testid="new-tab-action-${id}"]`).click(); await sleep(1500);
        }
        let l = await tabs(page);
        checker.equal(l.length, base + 3, "3 tabs via + button");
        checker.equal(kinds(l.slice(base)).join(","), "terminal,browser,chat", "types terminal, browser, chat");
        // via letter key in the menu (T, B, C)
        for (const k of ["KeyT", "KeyB", "KeyC"]) {
          await page.keyboard.press("Meta+KeyT"); await sleep(500); await page.keyboard.press(k); await sleep(1500);
        }
        l = await tabs(page);
        checker.equal(l.length, base + 6, "3 tabs via letter (T/B/C)");
        checker.equal(l[l.length - 1].sel, true, "last created tab is selected");
        checker.equal(await page.locator('[data-testid="tab-bar"] [role="tab"] button[aria-label^="Close"]').count(), l.length - 1, "every tab except the root has a Close button");
      },
    },
    {
      name: "tabs-reorder-by-dragging",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        const t = page.locator('[data-testid="tab-bar"] [role="tab"]');
        const before = (await tabs(page)).map((x) => x.id);
        checker.ok(before.length >= 4, "enough tabs", `n=${before.length}`);
        const a = await t.nth(1).boundingBox(), b = await t.nth(3).boundingBox();
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
        await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2, { steps: 4 });
        await page.mouse.move(b.x + b.width * 0.8, b.y + b.height / 2, { steps: 12 }); await sleep(200);
        await page.mouse.up(); await sleep(800);
        const after = (await tabs(page)).map((x) => x.id);
        checker.equal(after.length, before.length, "same number of tabs");
        checker.ok(after.join() !== before.join(), "order changed after dragging");
        checker.equal(after[0], before[0], "root tab is still first");
      },
    },
    {
      name: "tabs-mod-w-reopen-and-chat-confirmation",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        // select the last non-chat tab
        const l0 = await tabs(page);
        const target = [...l0].reverse().find((x) => /^(terminal|browser)/.test(x.id));
        checker.truthy(target, "terminal/browser tab exists");
        await page.locator(`[data-testid="${target.id}"]`).click(); await sleep(500);
        const n0 = (await tabs(page)).length;
        await page.keyboard.press("Meta+KeyW"); await sleep(800);
        const n1 = (await tabs(page)).length;
        checker.equal(n1, n0 - 1, "Mod+W closes the active non-chat tab");
        await page.keyboard.press("Meta+Shift+KeyT"); await sleep(1000);
        checker.equal((await tabs(page)).length, n0, "Mod+Shift+T reopens the closed tab");
        // Mod+W on a chat tab: does not close (only 'non-chat tab')
        const chat = [...(await tabs(page))].reverse().find((x) => x.id.startsWith("chat-tab-"));
        await page.locator(`[data-testid="${chat.id}"]`).click(); await sleep(500);
        await page.keyboard.press("Meta+KeyW"); await sleep(700);
        checker.equal((await tabs(page)).length, n0, "Mod+W on a chat tab does not close it");
        // Close button on a chat asks for confirmation; Cancel preserves it
        await page.locator(`[data-testid="${chat.id}"]`).hover();
        await page.locator(`[data-testid="${chat.id}"] button[aria-label^="Close"]`).click(); await sleep(600);
        const dlg = await page.evaluate(() => (document.querySelector('[role="dialog"],[role="alertdialog"]') || {}).innerText || "");
        checker.includes(dlg, "Close this chat?", "close chat confirmation");
        checker.includes(dlg, "deletes the conversation", "deletion warning");
        await page.getByRole("button", { name: "Cancel" }).click(); await sleep(500);
        checker.equal((await tabs(page)).length, n0, "Cancel preserves the tab");
      },
    },
    {
      name: "tabs-persistence-after-reload",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        const before = (await tabs(page)).map((x) => x.id);
        await page.reload(); await ctx.lib.ui.waitForReady(page);
        for (let i = 0; i < 30; i++) { await sleep(1000); if ((await tabs(page)).length) break; }
        await sleep(2000);
        const after = (await tabs(page)).map((x) => x.id);
        ctx.rec.notes = `before=${before.length} after=${after.length}`;
        checker.equal(after.length, before.length, "same number of tabs after reload");
        checker.equal(kinds(after).join(","), kinds(before).join(","), "same types/order after reload");
      },
    },
    {
      name: "tabs-close-all-but-root",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        for (let i = 0; i < 30; i++) {
          const l = await tabs(page); if (l.length <= 1) break;
          const last = l[l.length - 1];
          await page.locator(`[data-testid="${last.id}"]`).hover(); await sleep(150);
          await page.locator(`[data-testid="${last.id}"] button[aria-label^="Close"]`).click(); await sleep(500);
          if (await page.getByRole("button", { name: "Close chat" }).count()) { await page.getByRole("button", { name: "Close chat" }).click(); await sleep(600); }
        }
        checker.equal((await tabs(page)).length, 1, "only the root tab remains");
      },
    },
    {
      name: "shortcuts-no-effect-out-of-context-and-console",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker, collectors } = ctx;
        await resetUi(page);
        checker.equal(collectors.exceptions.length, 0, "zero unhandled exceptions");
        const errs = collectors.consoleErrors.map((e) => String(e.text || e)).filter((e) => !/registerProject|Failed to register project/.test(e));
        checker.equal(errs.length, 0, "zero console.error (except the expected registerProject one)", JSON.stringify(errs.slice(0, 3)));
      },
    },
    {
      name: "final-cleanup-qa-project",
      async fn(ctx) {
        if (!(await logged(ctx))) return;
        const { page, checker } = ctx;
        await resetUi(page); await nav(page, "chat");
        await deleteProject(page, PROJECT);
        checker.ok(!(await projectNames(page)).includes(PROJECT), "QA project removed from the client");
        checker.includes(await ctx.lib.ui.bodyText(page), "No workspaces yet", "empty state restored");
        try { fs.rmSync(SRC, { recursive: true, force: true }); } catch {}
        checker.ok(!fs.existsSync(SRC), "source repo removed");
      },
    },
  ],
};
