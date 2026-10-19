// qa/suites/20-home/lib.mjs — helpers for the Home area (t-home).
// -----------------------------------------------------------------------------
// - getStore(): finds the workspaces Zustand store (`$` in the main module) through the
//   [[Scopes]] of a React function via CDP (window.electronAPI is frozen; the
//   store is only published on window in E2E mode). Stores it in window.__QA_WS_STORE__.
// - patchDialog(): replaces service.openFolderDialog PER INSTANCE (shadows the
//   prototype method) for Open folder / Change folder without the native dialog.
// - spy(): wraps service methods and records calls (name, ms, ok/error).
// - runId/manifest: everything that creates data gets the prefix QA-AUTO-home-<runid> and goes
//   into the manifest for the cleanup suite (removes ONLY what is in the manifest).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const PREFIX = "QA-AUTO-home";
export const SCRATCH = "/tmp/tempo-qa/scratch-t-home";
export const FIX_ROOT = "/tmp/tempo-qa/fixtures/t-home";
export const MANIFEST = path.join(SCRATCH, "manifest.json");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- run id -----
let _runId = null;
export function runId() {
  if (_runId) return _runId;
  if (process.env.QA_HOME_RUNID) return (_runId = process.env.QA_HOME_RUNID);
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  _runId = `${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${Math.random().toString(36).slice(2, 5)}`;
  return _runId;
}
export const qaName = (suffix) => `${PREFIX}-${runId()}${suffix ? "-" + suffix : ""}`;

// -------------------------------------------------------------- manifest -----
export function readManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST, "utf8")); } catch { return { entries: [] }; }
}
// entry: { kind: "local-path"|"project"|"org-project"|"doc", runId, ... }
export function addManifest(entry) {
  const m = readManifest();
  m.entries.push({ ...entry, runId: entry.runId || runId(), at: new Date().toISOString() });
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
}

// -------------------------------------------------------------- fixtures -----
const GIT = ["-c", "user.name=QA-AUTO", "-c", "user.email=qa-auto@local", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main"];
function gitIn(cwd, ...args) { return execFileSync("git", [...GIT, ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
function mkRepo(dir, remote) {
  fs.mkdirSync(dir, { recursive: true });
  gitIn(dir, "init", "-q");
  fs.writeFileSync(path.join(dir, "README.md"), `# ${path.basename(dir)}\n\nQA-AUTO fixture (t-home).\n`);
  gitIn(dir, "add", "-A");
  gitIn(dir, "commit", "-q", "-m", "QA-AUTO fixture");
  if (remote) gitIn(dir, "remote", "add", "origin", remote);
}
// Creates a NEW set of folders for this run: <FIX_ROOT>/runs/<runid>/<QA-AUTO-...>.
// Every folder name carries the prefix => the project name (basename) carries the prefix.
export function runFixtures() {
  const base = path.join(FIX_ROOT, "runs", runId());
  const n = (s) => path.join(base, qaName(s));
  const f = {
    base,
    git: n("git"),
    plain: n("plain"),
    empty: n("empty"),
    remote: n("remote"),
    spaces: n("with space"),
    unicode: n("ünï-😀"),
    longName: n("l" + "o".repeat(150)),
    noPerm: n("noperm"),
    file: n("file.txt"),
    missing: n("nonexistent"),
    cloneParent: n("clone-parent"),
    bare: path.join(FIX_ROOT, "bare-origin.git"),
    helloPre: path.join(FIX_ROOT, "hello-world-pre"),
  };
  if (fs.existsSync(base)) return f;
  fs.mkdirSync(base, { recursive: true });
  mkRepo(f.git);
  fs.mkdirSync(f.plain); fs.writeFileSync(path.join(f.plain, "notes.txt"), "folder without git\n"); fs.writeFileSync(path.join(f.plain, ".env"), "QA_FAKE_SECRET=not-a-secret\n");
  fs.mkdirSync(f.empty);
  mkRepo(f.remote, "https://github.com/octocat/Hello-World.git");
  mkRepo(f.spaces);
  mkRepo(f.unicode);
  mkRepo(f.longName);
  fs.mkdirSync(f.noPerm); fs.chmodSync(f.noPerm, 0o000);
  fs.writeFileSync(f.file, "not a folder\n");
  fs.mkdirSync(f.cloneParent);
  addManifest({ kind: "local-path", path: base, note: "run fixtures" });
  return f;
}

// ----------------------------------------------------------- CDP / store -----
const _cdp = new WeakMap();
export async function cdpFor(page) {
  if (!_cdp.has(page)) _cdp.set(page, await page.context().newCDPSession(page));
  return _cdp.get(page);
}

// Finds the workspaces store and publishes it on window.__QA_WS_STORE__. Returns true/false.
export async function getStore(page) {
  const has = await page.evaluate(() => !!(window.__QA_WS_STORE__ && window.__QA_WS_STORE__.getState)).catch(() => false);
  if (has) return true;
  const cdp = await cdpFor(page);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { result } = await cdp.send("Runtime.evaluate", {
      expression: `(() => { const out = []; for (const el of document.querySelectorAll('*')) { const k = Object.keys(el).find(k => k.startsWith('__reactProps$')); if (!k) continue; for (const v of Object.values(el[k])) if (typeof v === 'function') { out.push(v); if (out.length >= 40) return out; } } return out; })()`,
    });
    if (result.objectId) {
      const arr = await cdp.send("Runtime.getProperties", { objectId: result.objectId, ownProperties: true });
      for (const item of arr.result.filter((r) => /^\d+$/.test(r.name))) {
        const props = await cdp.send("Runtime.getProperties", { objectId: item.value.objectId, ownProperties: false });
        const scopes = (props.internalProperties || []).find((p) => p.name === "[[Scopes]]");
        if (!scopes) continue;
        const sc = await cdp.send("Runtime.getProperties", { objectId: scopes.value.objectId, ownProperties: true });
        const mod = sc.result.find((s) => /^\d+$/.test(s.name) && /^Module/.test(s.value.description || ""));
        if (!mod) continue;
        const vars = await cdp.send("Runtime.getProperties", { objectId: mod.value.objectId, ownProperties: true });
        const dollar = vars.result.find((v) => v.name === "$");
        if (!dollar || !dollar.value || !dollar.value.objectId) continue;
        const r = await cdp.send("Runtime.callFunctionOn", {
          objectId: dollar.value.objectId,
          functionDeclaration: "function(){ try { const st = this.getState(); if (st && st.service && typeof st.openFolder === 'function') { window.__QA_WS_STORE__ = this; return true; } } catch (e) {} return false; }",
          returnByValue: true,
        });
        if (r.result.value === true) return true;
      }
    }
    await sleep(500);
  }
  return false;
}

// Lean store snapshot (no secrets).
export async function snapshot(page) {
  return page.evaluate(() => {
    const st = window.__QA_WS_STORE__.getState();
    return {
      projects: st.projects.map((p) => ({ id: p.id, name: p.name, repos: (p.repos || []).map((r) => ({ name: r.name, path: r.path, sourceUrl: r.sourceUrl || null })) })),
      workspaces: st.workspaces.map((w) => ({ id: w.id, name: w.name, projectId: w.projectId, path: w.path, mode: w.mode, status: w.status, isArchived: !!w.isArchived, organizationId: w.organizationId || null })),
      selectedWorkspaceId: st.selectedWorkspaceId || null,
      projectOrgIdMap: st.projectOrgIdMap ? [...st.projectOrgIdMap.entries()].map(([k, v]) => ({ projectId: k, ...v })) : [],
      mruViews: (st.mruViews || []).length,
      isCreatingProject: !!st.isCreatingProject,
    };
  });
}

// Replaces the service openFolderDialog per instance. value: path (string) or null (cancel).
export async function patchDialog(page, value) {
  return page.evaluate((value) => {
    const svc = window.__QA_WS_STORE__.getState().service;
    window.__QA_DIALOG_CALLS__ = window.__QA_DIALOG_CALLS__ || [];
    svc.openFolderDialog = async () => { window.__QA_DIALOG_CALLS__.push({ at: Date.now(), returned: value }); return value; };
    return true;
  }, value);
}
export async function unpatchDialog(page) {
  return page.evaluate(() => { const svc = window.__QA_WS_STORE__.getState().service; delete svc.openFolderDialog; return typeof svc.openFolderDialog === "function"; });
}
export async function dialogCalls(page) {
  return page.evaluate(() => (window.__QA_DIALOG_CALLS__ || []).length);
}

// Spies on service methods (records summarized args, ms and ok/error).
export async function spy(page, methods) {
  return page.evaluate((methods) => {
    const svc = window.__QA_WS_STORE__.getState().service;
    window.__QA_SPY__ = window.__QA_SPY__ || [];
    window.__QA_SPY_ORIG__ = window.__QA_SPY_ORIG__ || {};
    const brief = (a) => (typeof a === "string" ? a.slice(0, 200) : a && typeof a === "object" ? "[obj]" : a);
    for (const m of methods) {
      if (window.__QA_SPY_ORIG__[m] || typeof svc[m] !== "function") continue;
      const orig = svc[m];
      window.__QA_SPY_ORIG__[m] = orig;
      svc[m] = async function (...args) {
        const rec = { m, args: args.map(brief), t0: Date.now() };
        window.__QA_SPY__.push(rec);
        try { const r = await orig.apply(this, args); rec.ms = Date.now() - rec.t0; rec.ok = true; rec.ret = brief(typeof r === "object" && r ? JSON.stringify(r).slice(0, 300) : r); return r; }
        catch (e) { rec.ms = Date.now() - rec.t0; rec.ok = false; rec.err = String(e && e.message || e).slice(0, 300); throw e; }
      };
    }
    return Object.keys(window.__QA_SPY_ORIG__);
  }, methods);
}
export async function spyLog(page, { clear = false } = {}) {
  return page.evaluate((clear) => { const l = window.__QA_SPY__ || []; const out = l.map((r) => ({ ...r })); if (clear) l.length = 0; return out; }, clear);
}
export async function unspy(page) {
  return page.evaluate(() => {
    const svc = window.__QA_WS_STORE__.getState().service;
    for (const m of Object.keys(window.__QA_SPY_ORIG__ || {})) delete svc[m];
    window.__QA_SPY_ORIG__ = {};
    return true;
  });
}

// ---------------------------------------------------------------- UI ---------
export const tid = (id) => `[data-testid="${id}"]`;
export async function visible(page, sel, timeout = 0) {
  if (timeout) { try { await page.locator(sel).first().waitFor({ state: "visible", timeout }); return true; } catch { return false; } }
  return page.locator(sel).first().isVisible().catch(() => false);
}
export async function gone(page, sel, timeout = 5000) {
  try { await page.locator(sel).first().waitFor({ state: "hidden", timeout }); return true; } catch { return false; }
}
// Texts of the (sonner) toasts visible right now.
export async function toasts(page) {
  return page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.innerText.replace(/\s+/g, " ").trim()).filter(Boolean)).catch(() => []);
}
export async function dismissToasts(page) {
  await page.evaluate(() => { for (const b of document.querySelectorAll("[data-sonner-toast] [data-close-button], [data-sonner-toast] button[aria-label='Close toast']")) b.click(); }).catch(() => {});
}
export async function waitToast(page, re, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const ts = await toasts(page);
    const hit = ts.find((t) => re.test(t));
    if (hit) return hit;
    await sleep(200);
  }
  return null;
}
export async function waitFor(fn, timeout = 10000, step = 200) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { const v = await fn(); if (v) return v; } catch { /* try again */ }
    await sleep(step);
  }
  return null;
}
// Closes open dialogs/menus with Escape (up to n times).
export async function escapeAll(page, n = 3) {
  for (let i = 0; i < n; i++) {
    const open = await page.locator('[role="dialog"], [role="menu"]').count().catch(() => 0);
    if (!open) return;
    await page.keyboard.press("Escape");
    await sleep(250);
  }
}
// Goes back to home (no workspace selected): selects null in the store and shows home.
export async function goHome(page) {
  await escapeAll(page);
  await page.evaluate(() => { const st = window.__QA_WS_STORE__.getState(); if (typeof st.setSelectedWorkspaceId === "function") st.setSelectedWorkspaceId(null); else window.__QA_WS_STORE__.setState({ selectedWorkspaceId: null }); });
  await sleep(400);
  const back = page.locator(tid("empty-state-back"));
  if (await back.isVisible().catch(() => false)) { await back.click().catch(() => {}); await sleep(300); }
}
// Basic accessible name of visible buttons inside a selector.
export async function unnamedButtons(page, scopeSel) {
  return page.evaluate((scopeSel) => {
    const root = document.querySelector(scopeSel) || document.body;
    const out = [];
    for (const b of root.querySelectorAll("button, [role=button]")) {
      const r = b.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const name = (b.getAttribute("aria-label") || b.getAttribute("title") || b.innerText || "").trim();
      if (!name) out.push(b.getAttribute("data-testid") || b.outerHTML.slice(0, 80));
    }
    return out;
  }, scopeSel);
}
