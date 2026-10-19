// qa/suites/70-agents/helpers.mjs — helpers for the Agents / Agent Runs area / "Agent Runs" mod.
// Account writes only with the QA-AUTO-agents-<runid> prefix; ledger of ids created per run.
import fs from "node:fs";
import path from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const PREFIX_BASE = "QA-AUTO-agents-";
export const runIdOf = (ctx) => path.basename(ctx.runDir).replace(/[^0-9a-z-]/gi, "");
export const prefixOf = (ctx) => `${PREFIX_BASE}${runIdOf(ctx)}`;

// Marks the test as SKIP (the runner honors rec.skip when there is no failed check).
export function skip(ctx, reason) {
  ctx.rec.skip = reason;
  ctx.rec.status = "skip";
  ctx.rec.notes = `${ctx.rec.notes ? ctx.rec.notes + " | " : ""}SKIP: ${reason}`;
}
export function note(ctx, s) {
  ctx.rec.notes = `${ctx.rec.notes ? ctx.rec.notes + " | " : ""}${s}`;
}
export async function shot(ctx, name) {
  const f = await ctx.lib.ui.screenshot(ctx.page, ctx.instDir, `agents-${name}`);
  if (f) ctx.rec.screenshots.push(f);
  return f;
}

// -------------------------------------------------------------- session ---
// Logged in = workspace navbar present (the app home) or "home" screen.
export async function isLoggedIn(page) {
  const nav = await page.locator('[data-testid="workspace-navbar"]').count().catch(() => 0);
  if (nav) return true;
  return page.evaluate(() => !!document.querySelector('[data-testid^="workspace-navbar"]')).catch(() => false);
}
export async function waitLoggedIn(page, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await isLoggedIn(page)) return true;
    await sleep(500);
  }
  return false;
}

// ------------------------------------------------------- Convex (read) ---
// Installs window.__qa70q(name,args,timeout): finds the logged-in ConvexReactClient in the
// React tree (same path as the mod) and calls client.query. Read-only.
export async function installQuery(page) {
  return page.evaluate(() => {
    if (window.__qa70q) return true;
    const find = () => {
      const root = document.getElementById("root");
      if (!root) return null;
      const key = Object.keys(root).find((k) => k.startsWith("__reactContainer$"));
      const seen = new Set(); const st = [root[key]];
      const ok = (o) => o && typeof o === "object" && typeof o.query === "function" && typeof o.watchQuery === "function";
      while (st.length) {
        const f = st.pop(); if (!f || seen.has(f)) continue; seen.add(f);
        const p = f.memoizedProps;
        if (p && ok(p.client)) return p.client;
        if (p && ok(p.value)) return p.value;
        if (f.child) st.push(f.child); if (f.sibling) st.push(f.sibling);
      }
      return null;
    };
    window.__qa70client = () => (window.__qa70c ||= find());
    window.__qa70q = async (name, args, timeout = 15000) => {
      const c = window.__qa70client();
      if (!c) throw new Error("no ConvexReactClient");
      const ref = { [Symbol.for("functionName")]: name };
      return Promise.race([c.query(ref, args || {}), new Promise((_, j) => setTimeout(() => j(new Error("timeout " + name)), timeout))]);
    };
    return !!window.__qa70client();
  }).catch(() => false);
}
export async function q(page, name, args = {}, timeout = 15000) {
  await installQuery(page);
  return page.evaluate(async ([n, a, t]) => {
    try { return { ok: true, v: await window.__qa70q(n, a, t) }; }
    catch (e) { return { ok: false, err: String(e && e.message || e).slice(0, 300) }; }
  }, [name, args, timeout]);
}
// Current org (the first item, same as the mod) and list of orgs.
export async function orgs(page) {
  const r = await q(page, "organizations:getUserOrganizations");
  return r.ok && Array.isArray(r.v) ? r.v : [];
}

// ---------------------------------------------------------- Agent Runs mod ---
export async function modOpen(page) { await page.evaluate(() => window.__RE_TEMPO_AGENT_RUNS_OPEN__ && window.__RE_TEMPO_AGENT_RUNS_OPEN__()); }
export async function modClose(page) { await page.evaluate(() => window.__RE_TEMPO_AGENT_RUNS_CLOSE__ && window.__RE_TEMPO_AGENT_RUNS_CLOSE__()); }
export async function modRoots(page) { return page.evaluate(() => document.querySelectorAll("[data-rar-root]").length); }
// Waits for the panel to leave the skeleton. kind: closed|loading|error|empty|data.
export async function modState(page, timeout = 20000) {
  return page.evaluate(async (timeout) => {
    const t0 = Date.now();
    const kind = () => {
      const b = document.querySelector("[data-rar-root] [data-rar-body]");
      if (!b) return "closed";
      if (b.querySelector(".rar-err-box")) return "error";
      if (b.querySelector(".rar-note")) return "empty";
      if (b.querySelector(".rar-stat")) return "data";
      return "loading";
    };
    let k = kind();
    while (k === "loading" && Date.now() - t0 < timeout) { await new Promise((r) => setTimeout(r, 100)); k = kind(); }
    const body = document.querySelector("[data-rar-root] [data-rar-body]");
    const vals = body ? [...body.querySelectorAll(".rar-stat")].map((s) => [s.querySelector(".rar-k")?.innerText, s.querySelector(".rar-v")?.innerText]) : [];
    const statuses = body ? Object.fromEntries([...body.querySelectorAll(".rar-status-row")].map((r) => [r.querySelector(".rar-chip")?.getAttribute("data-s"), +r.querySelector(".rar-n")?.innerText])) : {};
    return {
      kind: k, ms: Date.now() - t0,
      text: (body?.innerText || "").slice(0, 400),
      retry: !!document.querySelector("[data-rar-retry]"),
      sub: document.querySelector("[data-rar-sub]")?.textContent || "",
      vals, statuses,
      last: window.__RE_TEMPO_AGENT_RUNS_LAST__ || null,
      via: window.__RE_TEMPO_AGENT_RUNS_VIA__ || null,
    };
  }, timeout);
}

// --------------------------------------------------------------- CDP util ---
export async function cdpOf(ctx) {
  if (!ctx.__cdp) ctx.__cdp = await ctx.page.context().newCDPSession(ctx.page);
  return ctx.__cdp;
}
export async function setNetwork(ctx, mode) {
  const cdp = await cdpOf(ctx);
  await cdp.send("Network.enable");
  const cond = mode === "offline" ? { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }
    : mode === "slow" ? { offline: false, latency: 3000, downloadThroughput: 50000, uploadThroughput: 50000 }
    : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
  await cdp.send("Network.emulateNetworkConditions", cond);
}
export async function domCounters(ctx) {
  const cdp = await cdpOf(ctx);
  await cdp.send("HeapProfiler.enable").catch(() => {});
  await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
  await sleep(300);
  await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
  const d = await cdp.send("Memory.getDOMCounters");
  const h = await cdp.send("Runtime.getHeapUsage");
  return { ...d, heapMB: +(h.usedSize / 1048576).toFixed(2) };
}

// WCAG contrast (text vs effective background) of selectors inside [data-rar-root].
export async function modContrast(page, selectors) {
  return page.evaluate((selectors) => {
    const parse = (c) => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(",").map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
    const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return c; } return { r: 0, g: 0, b: 0, a: 1 }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return +((x + 0.05) / (y + 0.05)).toFixed(2); };
    const res = {};
    for (const sel of selectors) {
      const el = sel === "launcher" ? document.querySelector("[data-rar-launcher]") : document.querySelector("[data-rar-root] " + sel);
      if (!el) { res[sel] = null; continue; }
      // launcher: gradient (background-image) => uses the light gradient color (#8b5cf6) as the background.
      res[sel] = cr(parse(getComputedStyle(el).color), sel === "launcher" ? { r: 139, g: 92, b: 246 } : bgOf(el));
    }
    return res;
  }, selectors);
}

// Native elements under the launcher rectangle (excludes the launcher/panel itself).
export async function underLauncher(page) {
  return page.evaluate(() => {
    const l = document.querySelector("[data-rar-launcher]"); if (!l) return null;
    const r = l.getBoundingClientRect();
    const pts = [[r.left + 2, r.top + 2], [r.right - 2, r.top + 2], [r.left + 2, r.bottom - 2], [r.right - 2, r.bottom - 2], [r.left + r.width / 2, r.top + r.height / 2]];
    const all = new Map();
    for (const [x, y] of pts) for (const e of document.elementsFromPoint(x, y)) {
      if (e === l || l.contains(e) || e.closest("[data-rar-root]") || e === document.documentElement || e === document.body) continue;
      const interactive = e.matches('button, a[href], input, textarea, select, [role="button"], [role="link"], [role="tab"], [contenteditable="true"]');
      const id = e.tagName + (e.getAttribute("data-testid") ? "[" + e.getAttribute("data-testid") + "]" : "") + (e.getAttribute("aria-label") ? "{" + e.getAttribute("aria-label") + "}" : "");
      all.set(id, interactive || all.get(id) || false);
    }
    return {
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      interactive: [...all].filter(([, i]) => i).map(([k]) => k),
      all: [...all.keys()].slice(0, 15),
    };
  });
}

// ------------------------------------------------------------ Agents (UI) ---
export const tid = (id) => `[data-testid="${id}"]`;
export async function visible(page, sel, ms = 0) {
  if (ms) return page.locator(sel).first().waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);
  return page.locator(sel).first().isVisible().catch(() => false);
}
export async function gotoAgents(page) {
  const btn = page.locator(tid("workspace-navbar-agents-button")).first();
  if (!(await btn.count())) return false;
  await btn.click({ timeout: 5000 }).catch(() => {});
  return visible(page, `${tid("agents-list-sidebar")}, ${tid("agents-landing-empty")}, ${tid("agents-empty-create")}`, 10000);
}
export async function routeState(page) {
  return page.evaluate(() => {
    const s = window.__AGENTS_ROUTE_STORE__;
    const st = s && (s.getState ? s.getState() : null);
    return st ? { selectedAgentId: st.selectedAgentId ?? null, mode: st.mode ?? null, picker: st.templatePickerSurface ?? null } : null;
  }).catch(() => null);
}

// Ledger: ids created by the run (for cleanup even if the test breaks midway).
export function ledgerPath(ctx) { return path.join(ctx.runDir, "agents-ledger.json"); }
export function ledgerAdd(ctx, entry) {
  const p = ledgerPath(ctx);
  let arr = [];
  try { arr = JSON.parse(fs.readFileSync(p, "utf8")); } catch { /* new */ }
  arr.push({ ...entry, at: new Date().toISOString() });
  fs.writeFileSync(p, JSON.stringify(arr, null, 2));
}
export function ledgerRead(ctx) {
  try { return JSON.parse(fs.readFileSync(ledgerPath(ctx), "utf8")); } catch { return []; }
}
export async function bodyTextSafe(page) {
  try { return await page.evaluate(() => document.body.innerText || ""); } catch { return ""; }
}
