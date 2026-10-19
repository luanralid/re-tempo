// qa/suites/80-cross-cutting/a11y.mjs — automated accessibility module (read-only).
// axe-core (WCAG 2 A/AA + best-practice) + keyboard navigation + contrast.
// Does not type or press Enter/Space; only Tab, Shift+Tab and Escape.
import fs from "node:fs";

export const AXE_PATH = "/tmp/tempo-qa/scratch-t-cross-cutting/node_modules/axe-core/axe.min.js";
// User mod (not part of the product): excluded from the axe context.
export const EXCLUDED_SELECTORS = ["[data-rar-root]"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureAxe(page) {
  const has = await page.evaluate(() => typeof window.axe !== "undefined").catch(() => false);
  if (has) return true;
  await page.addScriptTag({ content: fs.readFileSync(AXE_PATH, "utf8") });
  return page.evaluate(() => typeof window.axe !== "undefined");
}

function runAxeRaw(page, { include, tags, onlyRules }) {
  return page.evaluate(async ({ include, tags, onlyRules, excluded }) => {
    const context = { exclude: excluded.map((s) => [s]) };
    if (include) context.include = Array.isArray(include) ? include.map((s) => [s]) : [[include]];
    const options = onlyRules ? { runOnly: { type: "rule", values: onlyRules } } : { runOnly: { type: "tag", values: tags } };
    options.resultTypes = ["violations", "incomplete"];
    const r = await window.axe.run(context, options);
    const slim = (list) => list.map((v) => ({
      id: v.id, impact: v.impact, help: v.help,
      nodes: v.nodes.length,
      sampleTargets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
      nodeData: v.nodes.slice(0, 10).map((n) => ({ target: n.target.join(" "), any: (n.any || []).map((c) => ({ id: c.id, data: c.data })) })),
    }));
    return { violations: slim(r.violations), incomplete: slim(r.incomplete), passes: r.passes.length };
  }, { include, tags, onlyRules, excluded: EXCLUDED_SELECTORS });
}

export async function runAxe(page, { include, tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } = {}) {
  const t0 = Date.now();
  await ensureAxe(page);
  const r = await runAxeRaw(page, { include, tags });
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  let totalNodes = 0;
  for (const v of r.violations) { if (counts[v.impact] != null) counts[v.impact]++; totalNodes += v.nodes; }
  return {
    ms: Date.now() - t0,
    excluded: EXCLUDED_SELECTORS,
    counts,
    totalViolations: r.violations.length,
    totalNodes,
    violations: r.violations.map(({ id, impact, help, nodes, sampleTargets }) => ({ id, impact, help, nodes, sampleTargets })),
    incomplete: r.incomplete.map(({ id, impact, help, nodes }) => ({ id, impact, help, nodes })),
    passes: r.passes,
  };
}

export async function contrastSummary(page) {
  await ensureAxe(page);
  const r = await runAxeRaw(page, { onlyRules: ["color-contrast"] });
  const v = r.violations.find((x) => x.id === "color-contrast");
  if (!v) return { failures: 0, samples: [] };
  const samples = v.nodeData.slice(0, 10).map((n) => {
    const d = (n.any.find((c) => c.id === "color-contrast") || {}).data || {};
    return { target: n.target, fg: d.fgColor, bg: d.bgColor, ratio: d.contrastRatio, expected: d.expectedContrastRatio };
  });
  return { failures: v.nodes, samples };
}

// Runs in the renderer: describes the focused element + visible focus indicator.
const DESCRIBE_FOCUS = () => {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return { body: true };
  window.__a11yIds = window.__a11yIds || new WeakMap();
  window.__a11yN = window.__a11yN || 0;
  if (!window.__a11yIds.has(el)) window.__a11yIds.set(el, ++window.__a11yN);
  const snap = () => {
    const s = getComputedStyle(el);
    return [s.outlineStyle === "none" ? "none" : `${s.outlineWidth} ${s.outlineColor} ${s.outlineOffset}`, s.boxShadow, s.borderColor, s.backgroundColor, s.color, s.textDecorationLine].join("|");
  };
  const outlineOn = (() => { const s = getComputedStyle(el); return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0; })();
  const withFocus = snap();
  el.blur();
  const without = snap();
  try { el.focus({ focusVisible: true }); } catch { el.focus(); }
  const focusVisible = withFocus !== without;
  const text = (el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.value || el.getAttribute("placeholder") || el.getAttribute("alt") || "").replace(/\s+/g, " ").trim();
  const labelledby = el.getAttribute("aria-labelledby");
  let name = text;
  if (!name && labelledby) name = labelledby.split(/\s+/).map((i) => (document.getElementById(i) || {}).innerText || "").join(" ").trim();
  if (!name && el.labels && el.labels.length) name = (el.labels[0].innerText || "").trim();
  if (!name) { const img = el.querySelector("img[alt],svg title"); if (img) name = (img.getAttribute("alt") || img.textContent || "").trim(); }
  return {
    id: window.__a11yIds.get(el),
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute("role") || null,
    name: name.slice(0, 40),
    focusVisible,
    outlineOnly: outlineOn,
    unlabeled: !name,
  };
};

export async function keyboardNav(page, { maxTabs = 80 } = {}) {
  const t0 = Date.now();
  await page.evaluate(() => { try { document.activeElement && document.activeElement.blur(); } catch {} window.scrollTo(0, 0); });
  const stops = [];
  let cycled = false, trappedAt = null, sameRun = 0, lastId = null, firstId = null;
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press("Tab");
    await sleep(30);
    const d = await page.evaluate(DESCRIBE_FOCUS).catch(() => ({ body: true }));
    if (d.body) { stops.push({ body: true }); lastId = null; sameRun = 0; if (stops.length > 1 && stops.filter((s) => s.body).length >= 2 && firstId != null) { cycled = true; break; } continue; }
    if (firstId == null) firstId = d.id;
    else if (d.id === firstId) { cycled = true; break; }
    if (d.id === lastId) { sameRun++; if (sameRun >= 2 && trappedAt == null) { trappedAt = i; stops.push(d); break; } } else sameRun = 0;
    lastId = d.id;
    stops.push(d);
  }
  const real = stops.filter((s) => !s.body);
  const unique = new Set(real.map((s) => s.id));
  const fv = real.filter((s) => s.focusVisible).length;
  // Shift+Tab: goes back to the one before the first/last stop.
  const back = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Shift+Tab");
    await sleep(30);
    const d = await page.evaluate(DESCRIBE_FOCUS).catch(() => ({ body: true }));
    back.push(d.body ? { body: true } : { tag: d.tag, name: d.name, id: d.id });
  }
  // Escape: closes modals, if any.
  const dlgSel = '[role="dialog"],[role="alertdialog"],dialog[open]';
  const dialogsBefore = await page.evaluate((s) => document.querySelectorAll(s).length, dlgSel).catch(() => 0);
  await page.keyboard.press("Escape");
  await sleep(300);
  const dialogsAfter = await page.evaluate((s) => document.querySelectorAll(s).length, dlgSel).catch(() => 0);
  await page.evaluate(() => { try { document.activeElement && document.activeElement.blur(); } catch {} }).catch(() => {});
  return {
    ms: Date.now() - t0,
    stops: real.length,
    uniqueStops: unique.size,
    focusVisibleRatio: real.length ? +(fv / real.length).toFixed(3) : null,
    unlabeled: real.filter((s) => s.unlabeled).length,
    cycled,
    trappedAt,
    shiftTab: back,
    escape: { dialogsBefore, dialogsAfter, closed: dialogsBefore > dialogsAfter },
    sample: real.slice(0, 15).map(({ tag, role, name, focusVisible, unlabeled }) => ({ tag, role, name, focusVisible, unlabeled })),
  };
}

export async function a11yForScreen(page, screenName) {
  const out = { screen: screenName };
  try { out.axe = await runAxe(page); } catch (e) { out.axeError = e.message; }
  try { out.contrast = await contrastSummary(page); } catch (e) { out.contrastError = e.message; }
  try { out.keyboard = await keyboardNav(page); } catch (e) { out.keyboardError = e.message; }
  return out;
}

const NAV = {
  chat: '[data-testid="workspace-navbar-chat-button"]',
  docs: '[data-testid="workspace-navbar-docs-button"]',
  design: '[data-testid="workspace-navbar-design-button"]',
  issues: '[data-testid="workspace-navbar-issues-button"]',
  agents: '[data-testid="workspace-navbar-agents-button"]',
};

async function click(page, sel, timeout = 4000) {
  try { await page.locator(sel).first().click({ timeout }); return true; } catch { return false; }
}

// Tolerant: returns a boolean. `home` = initial state (does not navigate; only confirms there is content).
export async function gotoScreen(page, name) {
  try {
    if (name === "home") return (await page.evaluate(() => (document.body.innerText || "").trim().length > 0));
    // if in Settings, leave before navigating to another screen
    if (name !== "settings") {
      const inSettings = await page.getByRole("button", { name: "Return to app" }).first().isVisible().catch(() => false);
      if (inSettings) { await page.getByRole("button", { name: "Return to app" }).first().click({ timeout: 3000 }).catch(() => {}); await sleep(500); }
    }
    if (name === "settings") return await click(page, 'button[aria-label="Settings"]');
    if (NAV[name]) return await click(page, NAV[name]);
    return false;
  } catch { return false; }
}

export async function leaveSettings(page) {
  try { await page.getByRole("button", { name: "Return to app" }).first().click({ timeout: 3000 }); await sleep(500); return true; } catch { return false; }
}
