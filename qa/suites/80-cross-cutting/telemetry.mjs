// qa/suites/80-cross-cutting/telemetry.mjs — passive network/telemetry recorder in the renderer.
// -----------------------------------------------------------------------------
// Installs (before the document loads) PASSIVE wrappers on fetch, XHR.send,
// sendBeacon and WebSocket: they record host, path and — for PostHog/Sentry — ONLY the
// event names and the property key NAMES (never values). Gzip bodies
// are decompressed locally with DecompressionStream. Nothing is altered:
// the wrapper calls the original with the same arguments.
//
// It also flags, without storing the value, whether the body contains something that looks like an email,
// a JWT or the QA-AUTO marker (user content) — for the privacy report.
export const RECORDER_SRC = `(() => {
  if (window.__qaTx) return;
  const rec = (window.__qaTx = { reqs: [], events: [], ws: [], errors: 0 });
  const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i;
  const JWT = /eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\./;
  const QA = /QA-AUTO-/;
  const hostOf = (u) => { try { const x = new URL(String(u), location.href); return { host: x.host || x.protocol, path: x.pathname.slice(0, 60) }; } catch { return { host: "?", path: "" }; } };
  const isTelemetry = (h) => /posthog|sentry/i.test(h);
  async function toText(body) {
    try {
      if (body == null) return "";
      if (typeof body === "string") return body;
      let buf = null;
      if (body instanceof Blob) buf = new Uint8Array(await body.arrayBuffer());
      else if (body instanceof ArrayBuffer) buf = new Uint8Array(body);
      else if (ArrayBuffer.isView(body)) buf = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
      else if (body instanceof URLSearchParams) return body.toString();
      else if (body instanceof FormData) return "[formdata]";
      if (!buf) return String(body);
      if (buf[0] === 0x1f && buf[1] === 0x8b) {
        const ds = new DecompressionStream("gzip");
        const out = await new Response(new Blob([buf]).stream().pipeThrough(ds)).text();
        return out;
      }
      return new TextDecoder().decode(buf);
    } catch { rec.errors++; return ""; }
  }
  function keysOf(o) { return o && typeof o === "object" ? Object.keys(o).slice(0, 80) : []; }
  function digest(txt, h) {
    const flags = { email: EMAIL.test(txt), jwt: JWT.test(txt), qaContent: QA.test(txt), bytes: txt.length };
    if (!isTelemetry(h)) return { flags };
    let parsed = null;
    try { parsed = JSON.parse(txt); } catch {
      // posthog form-encoded: data=<base64 json>
      try { const m = txt.match(/(?:^|&)data=([^&]+)/); if (m) parsed = JSON.parse(atob(decodeURIComponent(m[1]))); } catch {}
      // sentry envelope: JSON lines
      if (!parsed && txt.includes("\\n")) {
        const lines = txt.split("\\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        if (lines.length) parsed = { __envelope: lines };
      }
    }
    const evs = [];
    const pushEv = (e) => {
      if (!e || typeof e !== "object") return;
      const set = e.$set || (e.properties && e.properties.$set) || {};
      // OS identity: booleans only (the value never leaves the page)
      const os = window.__qaOsIds || {};
      const osMatch = {};
      for (const [k, v] of Object.entries(set)) {
        if (typeof v !== "string") continue;
        if (os.u && v === os.u) osMatch[k] = "osUsername";
        else if (os.h && v === os.h) osMatch[k] = "osHostname";
        else if (EMAIL.test(v)) osMatch[k] = "email";
      }
      evs.push({ name: String(e.event || e.type || e.name || "?").slice(0, 60), propKeys: keysOf(e.properties).filter((k) => !k.startsWith("$")).slice(0, 40), sysKeys: keysOf(e.properties).filter((k) => k.startsWith("$")).length, setKeys: keysOf(set), osMatch });
    };
    if (parsed && parsed.__envelope) {
      for (const l of parsed.__envelope) if (l && (l.type || l.event_id || l.sid)) evs.push({ name: "sentry:" + (l.type || (l.sid ? "session" : "event")), propKeys: keysOf(l).slice(0, 20) });
    } else if (Array.isArray(parsed)) parsed.forEach(pushEv);
    else if (parsed && Array.isArray(parsed.batch)) parsed.batch.forEach(pushEv);
    else if (parsed && (parsed.event || parsed.token)) pushEv(parsed);
    else if (parsed) evs.push({ name: "(json:" + keysOf(parsed).slice(0, 6).join(",") + ")" });
    return { flags, evs };
  }
  function note(kind, url, method, body) {
    const { host, path } = hostOf(url);
    const r = { t: Math.round(performance.now()), kind, host, path, method: method || "GET" };
    rec.reqs.push(r);
    if (body != null) toText(body).then((txt) => {
      const d = digest(txt, host);
      r.flags = d.flags;
      if (d.evs) for (const e of d.evs) rec.events.push({ host, path, ...e });
    });
  }
  const of = window.fetch;
  window.fetch = function (input, init) {
    try { note("fetch", input && input.url ? input.url : input, (init && init.method) || (input && input.method), init && init.body); } catch {}
    return of.apply(this, arguments);
  };
  const oOpen = XMLHttpRequest.prototype.open, oSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__qa = { m, u }; return oOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) { try { if (this.__qa) note("xhr", this.__qa.u, this.__qa.m, b); } catch {} return oSend.apply(this, arguments); };
  if (navigator.sendBeacon) {
    const ob = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (u, d) { try { note("beacon", u, "POST", d); } catch {} return ob(u, d); };
  }
  const OWS = window.WebSocket;
  window.WebSocket = new Proxy(OWS, { construct(T, args) {
    const ws = Reflect.construct(T, args);
    try {
      const { host, path } = hostOf(args[0]);
      const w = { host, path, opened: performance.now(), framesOut: 0, framesIn: 0, bytesIn: 0, bytesOut: 0, closed: null, lastIn: null };
      rec.ws.push(w);
      (window.__qaTxWs = window.__qaTxWs || []).push(ws);
      const os = ws.send.bind(ws);
      ws.send = (d) => { w.framesOut++; w.bytesOut += (d && (d.length || d.byteLength || d.size)) || 0; return os(d); };
      ws.addEventListener("message", (e) => { w.framesIn++; w.lastIn = Date.now(); w.bytesIn += (e.data && (e.data.length || e.data.byteLength || e.data.size)) || 0; });
      ws.addEventListener("close", (e) => { w.closed = { code: e.code, t: performance.now() }; });
    } catch {}
    return ws;
  } });
})();`;

// Summarizes the recorder: hosts by kind, telemetry events (names), privacy flags.
export async function readRecorder(page) {
  const raw = await page.evaluate(() => {
    const r = window.__qaTx;
    return r ? JSON.parse(JSON.stringify(r)) : null;
  }).catch(() => null);
  if (!raw) return null;
  const hosts = {};
  for (const r of raw.reqs) {
    const k = r.host;
    hosts[k] = hosts[k] || { count: 0, kinds: new Set(), paths: new Set(), flags: { email: 0, jwt: 0, qaContent: 0 } };
    hosts[k].count++;
    hosts[k].kinds.add(r.kind);
    if (hosts[k].paths.size < 8) hosts[k].paths.add(r.path);
    if (r.flags) for (const f of ["email", "jwt", "qaContent"]) if (r.flags[f]) hosts[k].flags[f]++;
  }
  const eventNames = {};
  const propKeys = new Set();
  const setKeys = new Set();
  const identity = {};
  for (const e of raw.events) {
    for (const [k, v] of Object.entries(e.osMatch || {})) identity[k] = v;
    eventNames[e.name] = (eventNames[e.name] || 0) + 1;
    for (const k of e.propKeys || []) propKeys.add(k);
    for (const k of e.setKeys || []) setKeys.add(k);
  }
  return {
    hosts: Object.fromEntries(Object.entries(hosts).map(([h, v]) => [h, { count: v.count, kinds: [...v.kinds], paths: [...v.paths], flags: v.flags }])),
    eventNames,
    propKeys: [...propKeys].sort(),
    personSetKeys: [...setKeys].sort(),
    personSetIdentity: identity, // e.g.: { username: "osUsername", hostname: "osHostname" }
    websockets: raw.ws.map((w) => ({ host: w.host, path: w.path, framesIn: w.framesIn, framesOut: w.framesOut, bytesIn: w.bytesIn, bytesOut: w.bytesOut, closed: w.closed })),
    decodeErrors: raw.errors,
  };
}

// CDP Network: request capture (host, type, method, status) — no bodies.
export async function startNetworkCapture(session) {
  const reqs = new Map();
  const ws = [];
  const onReq = (e) => {
    try {
      const u = new URL(e.request.url);
      reqs.set(e.requestId, { host: u.host || u.protocol, scheme: u.protocol.replace(":", ""), path: u.pathname.slice(0, 60), method: e.request.method, type: e.type || "?", status: null, fromCache: false });
    } catch { /* data:/blob: */ }
  };
  const onResp = (e) => { const r = reqs.get(e.requestId); if (r) { r.status = e.response.status; r.fromCache = !!e.response.fromDiskCache; r.protocol = e.response.protocol; } };
  const onFail = (e) => { const r = reqs.get(e.requestId); if (r) r.failed = e.errorText; };
  const onWs = (e) => { try { const u = new URL(e.url); ws.push({ host: u.host, path: u.pathname.slice(0, 60) }); } catch {} };
  session.on("Network.requestWillBeSent", onReq);
  session.on("Network.responseReceived", onResp);
  session.on("Network.loadingFailed", onFail);
  session.on("Network.webSocketCreated", onWs);
  await session.send("Network.enable");
  return {
    summary() {
      const by = {};
      for (const r of reqs.values()) {
        const k = r.host;
        by[k] = by[k] || { count: 0, types: new Set(), methods: new Set(), statuses: new Set(), schemes: new Set(), failed: 0 };
        by[k].count++; by[k].types.add(r.type); by[k].methods.add(r.method); by[k].schemes.add(r.scheme);
        if (r.status != null) by[k].statuses.add(r.status);
        if (r.failed) by[k].failed++;
      }
      return {
        total: reqs.size,
        hosts: Object.fromEntries(Object.entries(by).map(([h, v]) => [h, { count: v.count, types: [...v.types], methods: [...v.methods], statuses: [...v.statuses].sort(), schemes: [...v.schemes], failed: v.failed }])),
        websockets: ws,
      };
    },
    async stop() {
      session.off("Network.requestWillBeSent", onReq);
      session.off("Network.responseReceived", onResp);
      session.off("Network.loadingFailed", onFail);
      session.off("Network.webSocketCreated", onWs);
    },
  };
}

// State of the WebSockets seen by the recorder (readyState 0..3) and frames received.
export async function wsState(page) {
  return page.evaluate(() => {
    const objs = window.__qaTxWs || [];
    const meta = (window.__qaTx && window.__qaTx.ws) || [];
    return objs.map((w, i) => ({ host: (meta[i] || {}).host, readyState: w.readyState, framesIn: (meta[i] || {}).framesIn, lastIn: (meta[i] || {}).lastIn }));
  }).catch(() => []);
}

// Closes the open WebSockets (simulates a drop; the client decides whether to reconnect). Local.
export async function closeAllWs(page) {
  return page.evaluate(() => {
    let n = 0;
    for (const w of window.__qaTxWs || []) if (w.readyState === 1 || w.readyState === 0) { try { w.close(4000, "qa-simulated-drop"); n++; } catch {} }
    return n;
  }).catch(() => 0);
}

// Script that exposes the OS user/host to the recorder for boolean comparison.
export function osIdsScript() {
  const u = JSON.stringify(osUser()), h = JSON.stringify(osHost());
  return `window.__qaOsIds = { u: ${u}, h: ${h} };`;
}
import os from "node:os";
function osUser() { try { return os.userInfo().username; } catch { return ""; } }
function osHost() { try { return os.hostname(); } catch { return ""; } }
