// qa/lib/inspector.mjs — main-process inspector (ONLY for login's --dry-run).
// -----------------------------------------------------------------------------
// Connects to the main's Node inspector (--inspect=127.0.0.1:<9501+i>) of an
// isolated QA instance and installs a TRAP on shell.openExternal: the URL the
// app would open in the browser is captured and NOTHING is opened. Extra defense: `open <url>`
// via child_process becomes /usr/bin/true. Never used in normal runs; never on the
// user's window (9333) — only on QA slot ports.
import { httpGetJson } from "./cdp.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl(port, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const list = await httpGetJson("127.0.0.1", port, "/json/list");
      const t = (Array.isArray(list) ? list : []).find((x) => x.webSocketDebuggerUrl);
      if (t) return t.webSocketDebuggerUrl;
    } catch { /* inspector still starting */ }
    await sleep(250);
  }
  throw new Error(`main inspector did not respond on 127.0.0.1:${port}`);
}

// Evaluates an expression in the main. Returns the value (returnByValue).
export async function evalInMain(port, expression, { timeoutMs = 10000 } = {}) {
  const url = await wsUrl(port);
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const t = setTimeout(() => { try { ws.close(); } catch {} reject(new Error("inspector timeout")); }, timeoutMs);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression, includeCommandLineAPI: true, returnByValue: true, awaitPromise: true },
      }));
    });
    ws.addEventListener("message", (ev) => {
      let msg; try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg.id !== 1) return;
      clearTimeout(t);
      try { ws.close(); } catch {}
      if (msg.error) return reject(new Error(msg.error.message));
      const r = msg.result || {};
      if (r.exceptionDetails) return reject(new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || "exception in main"));
      resolve(r.result ? r.result.value : undefined);
    });
    ws.addEventListener("error", () => { clearTimeout(t); reject(new Error("inspector WebSocket failure")); });
  });
}

const TRAP_SRC = `(() => {
  const req = (typeof require === "function" && require) ||
    (process.mainModule && process.mainModule.require.bind(process.mainModule)) ||
    process.getBuiltinModule("node:module").createRequire(process.execPath);
  const electron = req("electron");
  const cap = (globalThis.__qaDryRun = globalThis.__qaDryRun || { urls: [], blocked: [] });
  const trap = function (url) { cap.urls.push(String(url)); return Promise.resolve(); };
  trap.__qaTrap = true;
  electron.shell.openExternal = trap;
  // Extra defense: "open <http-url>" via child_process becomes /usr/bin/true.
  const cp = process.getBuiltinModule("node:child_process");
  const opensUrl = (cmd, args) => /(^|\\/)open$/.test(String(cmd)) && (args || []).some((a) => /^https?:/i.test(String(a)));
  for (const fn of ["spawn", "execFile"]) {
    const orig = cp[fn];
    if (orig.__qaWrapped) continue;
    const w = function (cmd, args, ...rest) {
      if (opensUrl(cmd, Array.isArray(args) ? args : [])) { cap.blocked.push(fn); return orig.call(this, "/usr/bin/true", [], ...rest); }
      return orig.call(this, cmd, args, ...rest);
    };
    w.__qaWrapped = true; cp[fn] = w;
  }
  if (!cp.exec.__qaWrapped) {
    const origExec = cp.exec;
    const w = function (command, ...rest) {
      if (/(^|[\\s\\/])open\\s+["']?https?:/i.test(String(command))) { cap.blocked.push("exec"); return origExec.call(this, "/usr/bin/true", ...rest); }
      return origExec.call(this, command, ...rest);
    };
    w.__qaWrapped = true; cp.exec = w;
  }
  return { ok: electron.shell.openExternal === trap && electron.shell.openExternal.__qaTrap === true };
})()`;

// Installs the trap. Returns true ONLY if the swap was verified by reading it back.
export async function installOpenExternalTrap(port) {
  const r = await evalInMain(port, TRAP_SRC);
  return !!(r && r.ok);
}

// URLs the app TRIED to open (captured, not opened) + blocked `open` calls.
export async function readCaptured(port) {
  const r = await evalInMain(port, `JSON.stringify(globalThis.__qaDryRun || { urls: [], blocked: [] })`);
  try { return JSON.parse(r); } catch { return { urls: [], blocked: [] }; }
}
