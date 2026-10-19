// Read-only exploration of Settings: dumps the text/structure of each section to scratch.
import fs from "node:fs";
import * as H from "./helpers.mjs";
const OUT = "/tmp/tempo-qa/scratch-t-settings";
export default { name: "30-settings/explore", tests: [{ name: "dump", async fn(ctx) {
  const { page, checker } = ctx; const d = {};
  await ctx.lib.ui.waitForReady(page);
  checker.ok(await H.openSettings(page), "opens");
  d.nav = await page.evaluate(() => document.querySelector("div.w-60")?.innerText);
  for (const s of ["Preferences", "Chat", "Billing", "Auth tokens", "Providers"]) {
    await H.gotoSection(page, s);
    d[s] = { text: await ctx.lib.ui.bodyText(page),
      controls: await page.evaluate(() => [...document.querySelectorAll("input,textarea,select,button,[role=switch],[role=radio],[role=tab]")].filter(e=>!e.closest("div.w-60")).map(e=>[e.tagName,e.getAttribute("role"),e.getAttribute("aria-label"),e.getAttribute("data-testid"),e.type,(e.innerText||"").trim().slice(0,30)].join("|"))) };
  }
  const orgBtns = await page.evaluate(() => [...document.querySelectorAll("div.w-60 button")].map(b=>b.innerText.trim().replace(/\n/g," / ")));
  d.navButtons = orgBtns;
  const org = orgBtns.find(t=>/Admin|Member/.test(t));
  if (org) { await page.locator("div.w-60 button", { hasText: org.split(" / ")[1] }).first().click(); await H.sleep(800);
    d.org = {}; 
    const tabs = await page.evaluate(() => [...document.querySelectorAll("[role=tab]")].map(t=>t.innerText.trim()));
    d.orgTabs = tabs;
    for (const t of [null, ...tabs]) { if (t) { await page.getByRole("tab", { name: t, exact: true }).first().click().catch(()=>{}); await H.sleep(600);} 
      d.org[t||"(initial)"] = { text: (await ctx.lib.ui.bodyText(page)).slice(0,2500), tids: await page.evaluate(()=>[...document.querySelectorAll("[data-testid]")].map(e=>e.dataset.testid)) }; }
  }
  d.projects = await page.evaluate(() => [...document.querySelectorAll('[data-section=projects] button')].map(b=>b.innerText.trim()));
  d.version = await page.evaluate(() => /0\.0\.\d+/.exec(document.body.innerText)?.[0] ?? null);
  fs.writeFileSync(`${OUT}/explore.json`, JSON.stringify(d, null, 1));
  await H.closeSettings(page);
}}]};
