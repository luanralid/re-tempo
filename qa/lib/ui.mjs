// qa/lib/ui.mjs — UI interaction and wait helpers (playwright Page).
// -----------------------------------------------------------------------------
// Click by role/text, wait for the UI to be ready, enumerate sidebar items,
// detect which screen rendered. Everything is lenient (does not throw by default): returns
// booleans/structures for the test to decide and the report to record.
import fs from "node:fs";
import path from "node:path";

// Waits for the UI to be "ready": #root/#app with content, or known text.
export async function waitForReady(page, { timeoutMs = 90000 } = {}) {
  const start = Date.now();
  await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => {});
  // Waits for some rendered content in the React container.
  await page
    .waitForFunction(
      () => {
        const root = document.querySelector("#root, #app, [data-reactroot], body > div");
        return !!root && root.innerText && root.innerText.trim().length > 0;
      },
      { timeout: timeoutMs, polling: 250 }
    )
    .catch(() => {});
  return Date.now() - start;
}

// Visible body text (for screen detection and content asserts).
export async function bodyText(page) {
  try { return await page.evaluate(() => document.body.innerText || ""); }
  catch { return ""; }
}

// Detects the current screen (logged-in home, auth/login, onboarding, or unknown).
// The home heading is "Let's Cook." in the app and the feature/home-title.js mod swaps it
// for live-editable text (window.__RE_TEMPO_HOME_TITLE_TARGET__); that is why
// the home is recognized by its ACTIONS (Generate + Open folder/Import project) or by
// any of the headings.
export async function detectScreen(page) {
  const t = (await bodyText(page)).toLowerCase().replace(/[‘’ʼ]/g, "'");
  const has = (s) => t.includes(s.toLowerCase());
  let modTitle = null;
  try { modTitle = await page.evaluate(() => window.__RE_TEMPO_HOME_TITLE_TARGET__ || null); } catch {}
  const headings = ["let's cook", "let's do it", modTitle].filter(Boolean);
  const actions = has("Generate") && (has("Open folder") || has("Import project"));
  if (actions || (headings.some(has) && (has("Generate") || has("Open folder") || has("Import project"))))
    return "home";
  if (has("Sign in") || has("Log in") || has("Continue with") || has("auth-handoff"))
    return "auth";
  if (has("Welcome to Tempo") || has("Get started") || has("onboarding"))
    return "onboarding";
  return "unknown";
}

// Waits for the screen to become one of `wanted` (e.g. ["home"]) and stay stable for
// `stableMs`. Returns { screen, ms, firstSeenAt, timedOut }: firstSeenAt is the
// epoch-ms at which the final screen appeared (without the stability window).
export async function waitForScreen(page, wanted, { timeoutMs = 90000, stableMs = 1500, pollMs = 500 } = {}) {
  const start = Date.now();
  let last = null;
  let since = 0;
  while (Date.now() - start < timeoutMs) {
    const s = await detectScreen(page);
    if (s !== last) { last = s; since = Date.now(); }
    if (wanted.includes(s) && Date.now() - since >= stableMs) return { screen: s, ms: Date.now() - start, firstSeenAt: since, timedOut: false };
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return { screen: last, ms: Date.now() - start, firstSeenAt: since, timedOut: true };
}

// Identity VISIBLE in the UI (e-mail/org/avatar) — never a token. Passive scan
// of the DOM (text + aria-label/title/alt). Best-effort: if the UI only shows the e-mail
// inside a menu, it returns null and the caller records that.
export async function readVisibleIdentity(page) {
  try {
    return await page.evaluate(() => {
      const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
      const emails = new Set();
      const scan = (s) => { if (s) for (const m of String(s).matchAll(emailRe)) emails.add(m[0]); };
      scan(document.body && document.body.innerText);
      const attrs = document.querySelectorAll("[aria-label],[title],[alt]");
      for (const el of attrs) {
        scan(el.getAttribute("aria-label")); scan(el.getAttribute("title")); scan(el.getAttribute("alt"));
      }
      const pick = (sel) => [...document.querySelectorAll(sel)]
        .map((e) => (e.getAttribute("aria-label") || e.getAttribute("title") || e.innerText || "").replace(/\s+/g, " ").trim())
        .filter((s) => s && s.length <= 60);
      const orgs = pick('[aria-label*="organization" i],[title*="organization" i],[aria-label*="workspace" i],[data-testid*="org" i]').slice(0, 3);
      const avatars = pick('[aria-label*="account" i],[aria-label*="profile" i],[aria-label*="avatar" i],[data-testid*="avatar" i]').slice(0, 3);
      return { emails: [...emails].slice(0, 3), orgs, avatars };
    });
  } catch {
    return { emails: [], orgs: [], avatars: [] };
  }
}

// Enumerates navigation/sidebar items: nav/aside and elements with a button/link role
// that have aria-label/title/text. Returns unique labels (up to `limit`).
export async function enumerateSidebar(page, limit = 60) {
  try {
    return await page.evaluate((limit) => {
      const out = [];
      const seen = new Set();
      const scopes = Array.from(
        document.querySelectorAll('nav, aside, [role="navigation"], [data-sidebar], [class*="sidebar" i]')
      );
      const roots = scopes.length ? scopes : [document.body];
      for (const root of roots) {
        const els = root.querySelectorAll(
          'button, a, [role="button"], [role="tab"], [role="menuitem"], [role="link"]'
        );
        for (const el of els) {
          const label =
            (el.getAttribute("aria-label") ||
              el.getAttribute("title") ||
              (el.innerText || "").trim() ||
              "").replace(/\s+/g, " ").trim();
          if (!label || label.length > 60) continue;
          if (seen.has(label)) continue;
          seen.add(label);
          out.push({ label, role: el.getAttribute("role") || el.tagName.toLowerCase() });
          if (out.length >= limit) return out;
        }
      }
      return out;
    }, limit);
  } catch {
    return [];
  }
}

// Clicks by accessible text (optional role). Returns true if it clicked.
export async function clickByText(page, text, { role, timeoutMs = 5000 } = {}) {
  try {
    const loc = role
      ? page.getByRole(role, { name: text, exact: false })
      : page.getByText(text, { exact: false });
    await loc.first().click({ timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

// Screenshot of the whole page into the run directory. Returns the path.
export async function screenshot(page, dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name.endsWith(".png") ? name : `${name}.png`);
  try { await page.screenshot({ path: file, fullPage: false }); return file; }
  catch { return null; }
}

// Accessibility snapshot (AX tree). Can be large; the test decides how to use it.
export async function a11ySnapshot(page) {
  try { return await page.accessibility.snapshot({ interestingOnly: true }); }
  catch { return null; }
}
