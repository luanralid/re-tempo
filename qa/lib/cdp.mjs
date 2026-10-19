// qa/lib/cdp.mjs — CDP connection and selection of the app's main page.
// -----------------------------------------------------------------------------
// Uses playwright-core (chromium.connectOverCDP) against Electron's
// remote-debugging-port. Ignores webviews (embedded browser, canvas-interact, canvas-html,
// frame-pool) and devtools:// targets; keeps only the main window (index.html).
import http from "node:http";
import { chromium } from "playwright-core";

export function httpGetJson(host, port, pathname = "/json", timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host, port, path: pathname, timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (d) => (body += d));
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error("invalid JSON from " + pathname + ": " + e.message)); }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout on " + host + ":" + port)));
    req.on("error", reject);
  });
}

// Lists the app's real page targets (file://.../index.html), without devtools.
export async function listAppPageTargets(port, host = "127.0.0.1") {
  const all = await httpGetJson(host, port, "/json");
  return (Array.isArray(all) ? all : []).filter(
    (t) =>
      t && t.type === "page" &&
      typeof t.url === "string" &&
      t.url.startsWith("file://") &&
      /index\.html(\?|#|$)/.test(t.url) &&
      !t.url.startsWith("devtools://")
  );
}

// Connects via CDP. Returns the playwright Browser.
export async function connect(port, host = "127.0.0.1") {
  return chromium.connectOverCDP(`http://${host}:${port}`);
}

// Window hiding does NOT live here: this Electron does not implement the CDP
// Browser domain (Browser.getWindowForTarget/setWindowBounds "wasn't found") and
// window.moveTo is clamped by macOS. See qa/lib/windows.mjs (System Events by
// main pid).

// Picks the main page: the file://.../index.html one. Prefers the largest
// viewport (the app window, not a webview/popup). Ignores about:blank/devtools.
export async function pickMainPage(browser) {
  const pages = [];
  for (const ctx of browser.contexts()) for (const p of ctx.pages()) pages.push(p);
  const candidates = pages.filter((p) => {
    const u = p.url();
    return u.startsWith("file://") && /index\.html(\?|#|$)/.test(u);
  });
  if (candidates.length === 0) return null;
  // Tie-break by largest viewport area (main window > small webviews).
  let best = candidates[0];
  let bestArea = -1;
  for (const p of candidates) {
    let area = 0;
    try {
      area = await p.evaluate(() => window.innerWidth * window.innerHeight);
    } catch { /* page may be navigating */ }
    if (area > bestArea) { bestArea = area; best = p; }
  }
  return best;
}
