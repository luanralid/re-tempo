// qa/suites/30-settings/helpers.mjs — shared helpers for the Settings suite.
// Read-only/reversible: every write uses the prefix QA-AUTO-settings-<runid> and is restored.
export const RUNID = Date.now().toString(36);
export const PREFIX = `QA-AUTO-settings-${RUNID}`;
export const FAKE_KEY = "sk-ant-QA-AUTO-fake";

export const PERSONAL = ["Preferences", "Chat", "Billing", "Auth tokens", "Providers"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };

// Opens Settings (sidebar button; fallback Meta+,). Returns true if "Return to app" appeared.
export async function openSettings(page) {
  if (await isSettingsOpen(page)) return true;
  const btn = page.locator('button[aria-label="Settings"]').first();
  if (await btn.count()) await btn.click({ timeout: 5000 }).catch(() => {});
  else await page.keyboard.press("Meta+,");
  return waitSettings(page);
}
export async function isSettingsOpen(page) {
  return page.getByText("Return to app", { exact: true }).first().isVisible().catch(() => false);
}
export async function waitSettings(page, ms = 8000) {
  return page.getByText("Return to app", { exact: true }).first()
    .waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);
}
export async function closeSettings(page) {
  await page.getByText("Return to app", { exact: true }).first().click({ timeout: 3000 }).catch(() => {});
  await sleep(300);
}
// Selects a Settings navigation item by exact text (items have no testid).
export async function gotoSection(page, label) {
  const loc = page.locator("div.w-60").getByText(label, { exact: true }).first();
  if (!(await loc.count())) return false;
  await loc.click({ timeout: 4000 });
  await sleep(350);
  return true;
}
// Exact visible labels in the Settings side navigation.
export async function navLabels(page) {
  return page.evaluate(() => {
    const nav = document.querySelector("div.w-60");
    if (!nav) return [];
    return [...nav.querySelectorAll("button, span, p")]
      .filter((e) => e.tagName === "BUTTON" || e.children.length === 0)
      .map((e) => e.innerText.trim().replace(/\n+/g, " / "))
      .filter(Boolean);
  });
}
export const lsGet = (page, k) => page.evaluate((k) => localStorage.getItem(k), k);
export const lsSet = (page, k, v) =>
  page.evaluate(([k, v]) => (v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v)), [k, v]);
export const lsKeys = (page) => page.evaluate(() => Object.keys(localStorage));

// State of a switch (Radix: aria-checked / data-state) by testid.
export async function toggleState(page, testid) {
  const el = page.locator(`[data-testid="${testid}"]`).first();
  if (!(await el.count())) return null;
  return el.evaluate((n) => n.getAttribute("aria-checked") ?? n.getAttribute("data-state"));
}
