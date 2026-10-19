// qa/suites/80-cross-cutting/security.mjs — runtime security, observation ONLY.
// -----------------------------------------------------------------------------
// Nothing here calls a write IPC or sends a payload off the machine:
// - CSP read from the DOM + local probes (eval / inline script) that only touch window.
// - renderer globals and bridges (method count, without invoking any).
// - real webPreferences of ALL webContents via the main inspector (read).
// - privileged schemes from the helpers' argv.
// - local ports (bind) + CORS headers of the local servers (GET/OPTIONS
//   without parameters, on 127.0.0.1).
// - external links: with the shell.openExternal trap installed, opens loopback
//   URLs (http://127.0.0.1:9/...) — nothing leaves the machine.
import http from "node:http";
import { evalInMain, installOpenExternalTrap, readCaptured } from "../../lib/inspector.mjs";

export async function cspAndProbes(page) {
  return page.evaluate(() => {
    const metas = [...document.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]')].map((m) => m.content);
    const csp = metas.join(" ; ");
    const dirs = {};
    for (const part of csp.split(";")) {
      const t = part.trim().split(/\s+/);
      if (t[0]) dirs[t[0]] = t.slice(1);
    }
    let evalOk = false;
    try { evalOk = eval("1+1") === 2; } catch { evalOk = false; }
    let fnOk = false;
    try { fnOk = new Function("return 3")() === 3; } catch { fnOk = false; }
    window.__qaInline = 0;
    const s = document.createElement("script");
    s.textContent = "window.__qaInline = 1;";
    document.head.appendChild(s);
    s.remove();
    const inlineOk = window.__qaInline === 1;
    delete window.__qaInline;
    return {
      metaCount: metas.length, csp, directives: dirs,
      probes: { evalAllowed: evalOk, newFunctionAllowed: fnOk, inlineScriptAllowed: inlineOk },
      trustedTypes: !!(window.trustedTypes && window.trustedTypes.defaultPolicy),
      location: location.protocol + "//" + location.pathname.split("/").slice(-3).join("/"),
      crossOriginIsolated: window.crossOriginIsolated,
      isSecureContext: window.isSecureContext,
    };
  });
}

export async function rendererSurface(page) {
  return page.evaluate(() => {
    const leafCount = (o, depth = 0, seen = new Set()) => {
      if (!o || (typeof o !== "object" && typeof o !== "function") || depth > 4 || seen.has(o)) return 0;
      seen.add(o);
      let n = 0;
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (typeof v === "function") n++;
        else if (v && typeof v === "object") n += leafCount(v, depth + 1, seen);
      }
      return n;
    };
    const bridges = Object.keys(window).filter((k) => /Bridge$|^electronAPI$/.test(k)).sort();
    const counts = Object.fromEntries(bridges.map((b) => [b, leafCount(window[b])]));
    const testHooks = window.electronAPI ? Object.keys(window.electronAPI).filter((k) => /test|e2e|stub|forceShow/i.test(k)) : [];
    const globalsE2E = Object.keys(window).filter((k) => /^__TEMPO|^__tempo|E2E/i.test(k));
    return {
      typeofRequire: typeof window.require, typeofProcess: typeof window.process, typeofModule: typeof window.module,
      typeofBuffer: typeof window.Buffer, typeofGlobal: typeof window.global,
      electronAPI: typeof window.electronAPI,
      webviewTag: (() => { try { return document.createElement("webview").constructor.name; } catch { return "?"; } })(),
      bridges, bridgeCount: bridges.length, methodCounts: counts,
      totalMethods: Object.values(counts).reduce((s, x) => s + x, 0),
      testHooks, globalsE2E,
      // are the bridges frozen by contextBridge? (local write attempt, reverted)
      bridgeFrozen: (() => { try { const b = window.electronAPI; if (!b) return null; const k = "__qaProbe"; b[k] = 1; const w = b[k] === 1; try { delete b[k]; } catch {} return !w; } catch { return true; } })(),
    };
  });
}

const MAIN_PREFS_SRC = `(() => {
  const req = (typeof require === "function" && require) ||
    (process.mainModule && process.mainModule.require.bind(process.mainModule)) ||
    process.getBuiltinModule("node:module").createRequire(process.execPath);
  const { app, webContents, BrowserWindow, protocol } = req("electron");
  const keys = ["sandbox","contextIsolation","nodeIntegration","nodeIntegrationInSubFrames","nodeIntegrationInWorker","webviewTag","webSecurity","allowRunningInsecureContent","experimentalFeatures","enableBlinkFeatures","disableBlinkFeatures","safeDialogs","navigateOnDragDrop","spellcheck","devTools","javascript","plugins","backgroundThrottling","offscreen"];
  const strip = (u) => { try { const x = new URL(u); return x.protocol === "file:" ? "file://.../" + x.pathname.split("/").slice(-2).join("/") : x.protocol + "//" + x.host + x.pathname.slice(0, 40); } catch { return String(u).slice(0, 40); } };
  const wcs = webContents.getAllWebContents().map((w) => {
    let p = {};
    try { p = w.getLastWebPreferences() || {}; } catch {}
    const prefs = {};
    for (const k of keys) if (k in p) prefs[k] = p[k];
    if (p.preload) prefs.preload = String(p.preload).split("/").pop();
    if (p.partition) prefs.partition = String(p.partition).replace(/[0-9a-f]{8,}/gi, "<id>");
    return { id: w.id, type: w.getType(), url: strip(w.getURL()), prefs, persistentSession: w.session.isPersistent() };
  });
  const schemes = ["tempo-screenshot","tempo-frame-codec","tempo-html-storyboard","sentry-ipc","tempo","file","app"].map((s) => [s, protocol.isProtocolHandled(s)]);
  return JSON.stringify({
    electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node,
    isPackaged: app.isPackaged, windows: BrowserWindow.getAllWindows().length,
    noSandboxSwitch: app.commandLine.hasSwitch("no-sandbox"),
    defaultApp: !!process.defaultApp, nodeEnv: process.env.NODE_ENV || null,
    webContents: wcs, protocolHandled: Object.fromEntries(schemes),
  });
})()`;

export async function mainWebPrefs(inspectPort) {
  const raw = await evalInMain(inspectPort, MAIN_PREFS_SRC, { timeoutMs: 15000 });
  return JSON.parse(raw);
}

export async function webContentsCount(inspectPort) {
  return evalInMain(inspectPort, `(() => { const r = (typeof require==="function"&&require)||process.getBuiltinModule("node:module").createRequire(process.execPath); const e = r("electron"); return JSON.stringify({ wc: e.webContents.getAllWebContents().map(w => ({ id: w.id, type: w.getType(), url: (()=>{ try { const u = new URL(w.getURL()); return u.protocol === "file:" ? "file" : u.protocol + "//" + u.host + u.pathname; } catch { return "?"; } })() })), windows: e.BrowserWindow.getAllWindows().length }); })()`).then(JSON.parse);
}

// Privileged schemes read from the helpers' argv (renderer/utility).
export function privilegedSchemes(procs) {
  const flags = ["standard-schemes", "secure-schemes", "bypasscsp-schemes", "cors-schemes", "fetch-schemes", "service-worker-schemes", "streaming-schemes", "code-cache-schemes"];
  const out = {};
  for (const p of procs) {
    for (const f of flags) {
      const m = p.cmd.match(new RegExp(`--${f}=([^\\s]+)`));
      if (m) {
        out[f] = out[f] || new Set();
        for (const s of m[1].split(",")) out[f].add(s);
      }
    }
  }
  const bySch = {};
  for (const [f, set] of Object.entries(out)) for (const s of set) (bySch[s] = bySch[s] || []).push(f.replace("-schemes", ""));
  return bySch;
}

// GET/OPTIONS without parameters on a LOCAL server: status + CORS headers.
export function localProbe(port, method = "GET", pathName = "/", headers = {}) {
  return new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port, path: pathName, method, headers, timeout: 3000 }, (res) => {
      res.resume();
      const h = res.headers;
      resolve({ status: res.statusCode, acao: h["access-control-allow-origin"] || null, acam: h["access-control-allow-methods"] || null, acah: h["access-control-allow-headers"] || null, contentType: h["content-type"] || null, server: h.server || null });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => resolve({ error: e.code || e.message }));
    req.end();
  });
}

// External links with a trap: what the app does with window.open / target=_blank /
// main-frame navigation. URLs are loopback on a closed port (9).
export async function externalLinks(page, inspectPort) {
  const trapped = await installOpenExternalTrap(inspectPort);
  const before = await webContentsCount(inspectPort);
  const steps = {};
  const run = async (name, fn) => {
    const cap0 = (await readCaptured(inspectPort)).urls.length;
    let err = null;
    try { await fn(); } catch (e) { err = String(e && e.message || e).slice(0, 120); }
    await new Promise((r) => setTimeout(r, 1500));
    const cap = await readCaptured(inspectPort);
    const wc = await webContentsCount(inspectPort);
    let mainUrl = "?";
    try { mainUrl = page.url().startsWith("file:") ? "file (unchanged)" : page.url(); } catch {}
    steps[name] = {
      openExternalCalls: cap.urls.slice(cap0).map((u) => u.replace(/^(https?:\/\/[^/]+\/[^?#]{0,40}).*$/, "$1")),
      blockedOpen: cap.blocked.length,
      webContentsDelta: wc.wc.length - before.wc.length, windowsDelta: wc.windows - before.windows,
      newTargets: wc.wc.filter((w) => !before.wc.some((b) => b.id === w.id)).map((w) => w.type + ":" + w.url),
      mainUrl, error: err,
    };
  };
  await run("window.open", () => page.evaluate(() => { window.open("http://127.0.0.1:9/qa-ext-window-open", "_blank"); }));
  await run("a[target=_blank]", () => page.evaluate(() => {
    const a = document.createElement("a"); a.href = "http://127.0.0.1:9/qa-ext-anchor-blank"; a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  }));
  await run("a[href] same frame", () => page.evaluate(() => {
    const a = document.createElement("a"); a.href = "http://127.0.0.1:9/qa-ext-anchor-self";
    document.body.appendChild(a); a.click(); a.remove();
  }));
  return { trapInstalled: trapped, before: { webContents: before.wc.length, windows: before.windows }, steps };
}

// nodeIntegrationInSubFrames=true on the main window => do the preload (and the bridges)
// also run in iframes? Tests 3 kinds of 100% local iframe: srcdoc, data: and
// a "dev server" http://127.0.0.1:<ephemeral port> served by this process.
export async function subframeExposure(page) {
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!doctype html><title>qa-devserver</title><p>qa</p>");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  const kinds = {
    srcdoc: { attr: "srcdoc", value: "<p>qa-srcdoc</p>" },
    data: { attr: "src", value: "data:text/html,<p>qa-data</p>" },
    devserver: { attr: "src", value: `http://127.0.0.1:${port}/qa-frame` },
  };
  const out = {};
  try {
    for (const [k, v] of Object.entries(kinds)) {
      await page.evaluate(([id, attr, value]) => {
        const f = document.createElement("iframe");
        f.id = id; f.style.cssText = "position:fixed;left:-9999px;width:10px;height:10px";
        f.setAttribute(attr, value);
        document.body.appendChild(f);
      }, [`qa-sub-${k}`, v.attr, v.value]);
      await new Promise((r) => setTimeout(r, 1500));
      const frame = page.frames().find((f) => f !== page.mainFrame() && (k === "srcdoc" ? f.url() === "about:srcdoc" : f.url().startsWith(v.value.slice(0, 24))));
      if (!frame) { out[k] = { found: false }; continue; }
      out[k] = await frame.evaluate(() => ({
        found: true,
        origin: location.origin,
        electronAPI: typeof window.electronAPI,
        bridges: Object.keys(window).filter((x) => /Bridge$|^electronAPI$/.test(x)).length,
        terminal: typeof (window.terminalBridge && window.terminalBridge.create),
      })).catch((e) => ({ found: true, error: String(e.message).slice(0, 120) }));
    }
  } finally {
    await page.evaluate(() => document.querySelectorAll('iframe[id^="qa-sub-"]').forEach((f) => f.remove())).catch(() => {});
    srv.close();
  }
  return out;
}
