#!/usr/bin/env node
/*
 * tools/live-reload.mjs — LIVE RELOAD watcher, ZERO dependencies.
 * ---------------------------------------------------------------------------
 * Uses only built-ins: node:fs, node:http, node:path, node:url and Node 24's
 * GLOBAL WebSocket (no chokidar, ws, puppeteer, etc.).
 *
 * What it does:
 *   - Watches feature/*.js and feature/*.css (the RE-TEMPO renderer loads
 *     those SAME files via the out/renderer/mod -> feature/ symlink).
 *   - On saving a .css: HOT-SWAP without reload; swaps the href of the feature's
 *     <link> (cache-bust ?live=<ts>) via CDP Runtime.evaluate. Page state
 *     (window.*, open panel) is preserved.
 *   - On saving a .js: Page.reload (ignoreCache) via CDP; reloads the window
 *     to re-run the module.
 *
 * How it talks to the app:
 *   - Discovers targets at http://127.0.0.1:9333/json (CDP target list).
 *   - Opens the devtools WebSocket of the page target(s) (file://...).
 *   - App closed / port down: clear message and keeps trying; each "save"
 *     rediscovers the targets, so it reconnects by itself when the app returns.
 *
 * Env config (optional): CDP_PORT (9333), CDP_HOST (127.0.0.1),
 *   FEATURE_DIR (../feature relative to this file).
 * ---------------------------------------------------------------------------
 */
import { watch, existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FEATURE_DIR = path.resolve(process.env.FEATURE_DIR || path.join(HERE, "..", "feature"));
const PORT = Number(process.env.CDP_PORT || 9333);
const HOST = process.env.CDP_HOST || "127.0.0.1";

const ts = () => new Date().toTimeString().slice(0, 8);
const log = (...a) => console.log(`[live ${ts()}]`, ...a);
const warn = (...a) => console.warn(`[live ${ts()}] ⚠`, ...a);

// --- JS evaluated in the renderer for the CSS HOT-SWAP (no reload) ------------
// Replaces the href of the feature's <link> tags with a cache-busted URL. That redoes the
// CSS fetch and reapplies the styles without recreating the page.
const HOTSWAP_SRC = `(() => {
  const sel = 'link[data-rar-css], link[rel="stylesheet"][href*="agent-runs-panel.css"], link[rel="stylesheet"][href*="/mod/"]';
  const links = Array.from(document.querySelectorAll(sel));
  const now = Date.now();
  const files = [];
  for (const l of links) {
    const base = (l.getAttribute('href') || l.href || '').split('?')[0];
    if (!base) continue;
    l.setAttribute('href', base + '?live=' + now);
    files.push(base.split('/').pop());
  }
  return JSON.stringify({ swapped: files.length, files });
})()`;

// --- HTTP: CDP target list --------------------------------------------
function httpGetJson(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: HOST, port: PORT, path: pathname, timeout: 3000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (d) => (body += d));
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error("invalid /json response: " + e.message)); }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout talking to port " + PORT)));
    req.on("error", reject);
  });
}

// Only real app pages (file://...), never devtools:// or about:blank.
async function listPageTargets() {
  const all = await httpGetJson("/json");
  return (Array.isArray(all) ? all : []).filter(
    (t) =>
      t && t.type === "page" &&
      typeof t.webSocketDebuggerUrl === "string" &&
      typeof t.url === "string" &&
      t.url.startsWith("file://") &&
      !t.url.startsWith("devtools://")
  );
}

// --- CDP: opens the WS, sends the commands, resolves by id, closes ------------
function cdp(wsUrl, commands) {
  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WebSocket(wsUrl); }
    catch (e) { return reject(e); }
    const results = new Array(commands.length);
    const idToIdx = new Map();
    let remaining = commands.length;
    let settled = false;
    const t = setTimeout(() => done(new Error("timeout CDP")), 8000);
    function done(err) {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      try { ws.close(); } catch {}
      err ? reject(err) : resolve(results);
    }
    ws.addEventListener("open", () => {
      if (commands.length === 0) return done();
      commands.forEach((c, i) => {
        const id = i + 1;
        idToIdx.set(id, i);
        ws.send(JSON.stringify({ id, method: c.method, params: c.params || {} }));
      });
    });
    ws.addEventListener("message", (ev) => {
      let msg;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (typeof msg.id === "number" && idToIdx.has(msg.id)) {
        results[idToIdx.get(msg.id)] = msg.error ? { error: msg.error } : (msg.result ?? {});
        if (--remaining === 0) done();
      }
    });
    ws.addEventListener("error", () => done(new Error("CDP WebSocket failure")));
    ws.addEventListener("close", () => done(new Error("CDP WebSocket closed before completing")));
  });
}

async function withTargets(action) {
  let targets;
  try {
    targets = await listPageTargets();
  } catch (e) {
    warn(`app unreachable on port ${PORT} (${e.message}). Start RE-TEMPO (tools/start-live.sh) and save again.`);
    return;
  }
  if (!targets.length) {
    warn(`no app page on port ${PORT} yet (app closed?). Save again once the window opens.`);
    return;
  }
  for (const target of targets) await action(target);
}

// --- Actions -----------------------------------------------------------------
async function hotSwapCss(filename) {
  await withTargets(async (target) => {
    try {
      const [ev] = await cdp(target.webSocketDebuggerUrl, [
        { method: "Runtime.evaluate", params: { expression: HOTSWAP_SRC, returnByValue: true } },
      ]);
      if (ev && ev.error) throw new Error(ev.error.message || "Runtime.evaluate error");
      const out = JSON.parse(ev.result.value);
      if (out.swapped > 0)
        log(`CSS hot-swap ✓ ${filename} → reapplied in [${out.files.join(", ")}] (no reload)`);
      else
        warn(`CSS ${filename} saved, but no feature <link> on the page (has the panel/launcher mounted yet?).`);
    } catch (e) {
      warn(`hot-swap failed for ${filename}: ${e.message}`);
    }
  });
}

async function reloadForJs(filename) {
  await withTargets(async (target) => {
    try {
      await cdp(target.webSocketDebuggerUrl, [
        { method: "Page.enable" },
        { method: "Page.reload", params: { ignoreCache: true } },
      ]);
      log(`JS reload ✓ ${filename} → Page.reload(ignoreCache) fired`);
    } catch (e) {
      warn(`reload failed for ${filename}: ${e.message}`);
    }
  });
}

// --- Watcher ---------------------------------------------------------------
const debounce = new Map();
function onFsEvent(_eventType, filename) {
  if (!filename) return;
  const name = String(filename);
  if (!/\.(js|css)$/i.test(name)) return; // ignores editor temp files
  clearTimeout(debounce.get(name));
  debounce.set(name, setTimeout(() => react(name), 120));
}

async function react(filename) {
  const full = path.join(FEATURE_DIR, filename);
  if (!existsSync(full)) return; // atomic save / file removed
  if (/\.css$/i.test(filename)) await hotSwapCss(filename);
  else await reloadForJs(filename);
}

// --- Wait for the app to come up ----------------------------------------------------
async function waitForApp() {
  let announced = false;
  for (;;) {
    try {
      const targets = await listPageTargets();
      if (targets.length) {
        log(`connected ✓ ${targets.length} app page(s) on port ${PORT}:`);
        for (const t of targets) log(`   • ${t.title || "(untitled)"} — ${t.url}`);
        return;
      }
      if (!announced) { log(`port ${PORT} answered, waiting for the app window to open...`); announced = true; }
    } catch {
      if (!announced) { log(`waiting for RE-TEMPO to open port ${PORT} (DevTools)...`); announced = true; }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function main() {
  console.log("────────────────────────────────────────────────────────────");
  console.log(" RE-TEMPO · live-reload (zero dependencies)");
  console.log(` watching:   ${FEATURE_DIR}/*.js  and  *.css`);
  console.log(` CDP:        http://${HOST}:${PORT}/json`);
  console.log(" rule:       .css = hot-swap (no reload) · .js = Page.reload");
  console.log("────────────────────────────────────────────────────────────");

  if (!existsSync(FEATURE_DIR)) {
    console.error(`ERROR: feature folder does not exist: ${FEATURE_DIR}`);
    process.exit(1);
  }

  await waitForApp();

  const watcher = watch(FEATURE_DIR, { persistent: true }, onFsEvent);
  log("watcher active. Edit feature/*.css|*.js and watch the window update. Ctrl+C to quit.");

  const bye = () => { try { watcher.close(); } catch {} process.exit(0); };
  process.on("SIGINT", bye);
  process.on("SIGTERM", bye);
}

main().catch((e) => {
  console.error("[live] fatal error:", e);
  process.exit(1);
});
