// qa/suites/80-cross-cutting/perf.mjs — cold boot, memory over time, long tasks, FPS.
import * as C from "./common.mjs";

// Cold boot N times in sequence in its own slot (new profile each time).
// Measures: spawn->DevTools, DevTools->target in /json, attach->UI ready, spawn->classified
// screen, renderer FCP/DCL, process count and total RSS 3 s after ready.
export async function coldBoots(slot, n, { tag = "txboot", wantScreen = null } = {}) {
  const runs = [];
  for (let i = 0; i < n; i++) {
    let h = null;
    const r = { i: i + 1 };
    try {
      h = await C.startEphemeral(slot, { tag });
      const t0 = h.instance.startedAtMs;
      r.devtoolsMs = h.instance.bootDevtoolsMs;
      r.targetMs = h.instance.bootTargetMs;
      r.readyMs = h.readyMs;
      const sc = await C.ui.waitForScreen(h.page, wantScreen || ["auth", "home", "onboarding"], { timeoutMs: 60000, stableMs: 300, pollMs: 100 });
      r.screen = sc.screen;
      r.totalToScreenMs = Date.now() - t0;
      const pt = await h.page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] || {};
        const fcp = performance.getEntriesByName("first-contentful-paint")[0];
        return { dcl: Math.round(nav.domContentLoadedEventEnd || 0), load: Math.round(nav.loadEventEnd || 0), fcp: fcp ? Math.round(fcp.startTime) : null, resources: performance.getEntriesByType("resource").length };
      });
      Object.assign(r, pt);
      await C.sleep(3000);
      const tree = C.procTree(h.instance);
      r.procs = tree.procs.length;
      r.rssMB = tree.totalRssMB;
      r.byKind = Object.fromEntries(tree.procs.map((p) => [p.kind + ":" + p.pid, p.rssMB]));
      r.exceptions = h.collectors.exceptions.length;
    } catch (e) {
      r.error = String(e.message || e).slice(0, 200);
    } finally {
      if (h) {
        const td = await C.stopAll([h]);
        r.teardownMs = td[0] && td[0].ms;
        r.leftovers = td[0] ? td[0].leftovers.length : 0;
        r.forcedMain = td[0] ? td[0].forcedMain.length : 0;
      }
    }
    runs.push(r);
  }
  const ok = runs.filter((r) => !r.error);
  return {
    runs,
    summary: {
      n, ok: ok.length,
      totalToScreenMs: C.stats(ok.map((r) => r.totalToScreenMs)),
      devtoolsMs: C.stats(ok.map((r) => r.devtoolsMs)),
      readyMs: C.stats(ok.map((r) => r.readyMs)),
      fcpMs: C.stats(ok.map((r) => r.fcp)),
      dclMs: C.stats(ok.map((r) => r.dcl)),
      rssMB: C.stats(ok.map((r) => r.rssMB)),
      procs: C.stats(ok.map((r) => r.procs)),
      teardownMs: C.stats(ok.map((r) => r.teardownMs)),
      screens: [...new Set(ok.map((r) => r.screen))],
    },
  };
}

// DOM signature to explain node jumps (no user content).
export async function domSignature(page) {
  return page.evaluate(() => {
    const ifr = [...document.querySelectorAll("iframe, webview")].map((f) => {
      const src = f.getAttribute("src") || (f.hasAttribute("srcdoc") ? "srcdoc" : "about:blank");
      try { const u = new URL(src, location.href); return `${f.tagName.toLowerCase()}:${u.protocol}//${u.host}${u.pathname.slice(0, 30)}`; } catch { return `${f.tagName.toLowerCase()}:${src.slice(0, 30)}`; }
    });
    const tids = {};
    for (const el of document.querySelectorAll("[data-testid]")) { const t = el.getAttribute("data-testid").replace(/[0-9a-f]{6,}/g, "<id>"); tids[t] = (tids[t] || 0) + 1; }
    const top = Object.entries(tids).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const rar = document.querySelector("[data-rar-root]");
    return {
      iframes: ifr, dialogs: document.querySelectorAll('[role="dialog"],[role="alertdialog"]').length,
      rarRootNodes: rar ? rar.querySelectorAll("*").length : 0,
      bodyChildren: [...document.body.children].map((c) => `${c.tagName.toLowerCase()}${c.id ? "#" + c.id : ""}:${c.querySelectorAll("*").length}`).slice(0, 10),
      topTestids: top,
    };
  }).catch(() => null);
}

// Samples memory/DOM for `minutes` (every `everyS`), with forced GC at the start and the end.
export async function memoryOverTime(page, instance, { minutes = 3, everyS = 10, action = null } = {}) {
  const s = await C.cdpSession(page);
  await C.forceGC(s);
  const samples = [];
  const t0 = Date.now();
  const end = t0 + minutes * 60000;
  let k = 0;
  while (Date.now() < end) {
    if (action) { try { await action(k); } catch {} }
    const m = await C.rendererMetrics(s);
    const tree = C.procTree(instance);
    const byKind = {};
    for (const p of tree.procs) byKind[p.kind] = (byKind[p.kind] || 0) + p.rssMB;
    const prev = samples[samples.length - 1];
    const sig = !prev || Math.abs(m.nodes - prev.nodes) > 50 ? await domSignature(page) : undefined;
    samples.push({ tS: Math.round((Date.now() - t0) / 1000), ...m, rssMB: tree.totalRssMB, byKind, ...(sig ? { dom: sig } : {}) });
    k++;
    await C.sleep(everyS * 1000);
  }
  await C.forceGC(s);
  await C.sleep(1000);
  const last = await C.rendererMetrics(s);
  const tree = C.procTree(instance);
  samples.push({ tS: Math.round((Date.now() - t0) / 1000), ...last, rssMB: tree.totalRssMB, afterGC: true });
  try { await s.detach(); } catch {}
  const first = samples[0];
  const mins = (samples[samples.length - 1].tS - first.tS) / 60 || 1;
  // "steady-state" growth: from the 2nd sample onwards (ignores the 1st screen transition)
  const steady = samples.length > 2 ? samples[1] : first;
  return {
    samples,
    delta: {
      minutes: +mins.toFixed(2),
      heapMB: +(last.jsHeapUsedMB - first.jsHeapUsedMB).toFixed(1),
      heapMBperMin: +((last.jsHeapUsedMB - first.jsHeapUsedMB) / mins).toFixed(2),
      nodes: last.nodes - first.nodes,
      nodesSteady: last.nodes - steady.nodes,
      listeners: last.listeners - first.listeners,
      listenersSteady: last.listeners - steady.listeners,
      heapMBSteady: +(last.jsHeapUsedMB - steady.jsHeapUsedMB).toFixed(1),
      jumps: samples.filter((x) => x.dom).map((x) => ({ tS: x.tS, nodes: x.nodes, documents: x.documents, dom: x.dom })),
      rssMB: tree.totalRssMB - first.rssMB,
      rssMBperMin: +((tree.totalRssMB - first.rssMB) / mins).toFixed(1),
    },
  };
}

// Long-task observer (>50 ms) installed on the page; returns stop() with the summary.
export async function startLongTasks(page) {
  await page.evaluate(() => {
    window.__qaLT = [];
    try {
      const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__qaLT.push(Math.round(e.duration)); });
      po.observe({ type: "longtask", buffered: false });
      window.__qaLTpo = po;
    } catch { window.__qaLT = null; }
  });
  return async () => page.evaluate(() => {
    const a = window.__qaLT;
    try { window.__qaLTpo && window.__qaLTpo.disconnect(); } catch {}
    delete window.__qaLT; delete window.__qaLTpo;
    if (!a) return { supported: false };
    const s = [...a].sort((x, y) => x - y);
    return { supported: true, count: s.length, totalMs: s.reduce((p, x) => p + x, 0), maxMs: s[s.length - 1] || 0, p95Ms: s.length ? s[Math.ceil(0.95 * s.length) - 1] : 0, over200: s.filter((x) => x > 200).length };
  });
}

// FPS while scrolling the largest visible scrollable container (or the given selector), for `ms`.
export async function scrollFps(page, { selector = null, ms = 3000, step = 120 } = {}) {
  return page.evaluate(async ({ selector, ms, step }) => {
    const pickScroller = () => {
      if (selector) return document.querySelector(selector);
      let best = null, bestH = 0;
      for (const el of document.querySelectorAll("*")) {
        const cs = getComputedStyle(el);
        if (!/(auto|scroll)/.test(cs.overflowY)) continue;
        const extra = el.scrollHeight - el.clientHeight;
        const r = el.getBoundingClientRect();
        if (extra > 200 && r.height > 150 && r.width > 150 && extra > bestH) { best = el; bestH = extra; }
      }
      return best;
    };
    const el = pickScroller();
    if (!el) return { scroller: null };
    const desc = (el.getAttribute("data-testid") || el.getAttribute("aria-label") || el.className || el.tagName).toString().slice(0, 60);
    const frames = [];
    let last = performance.now();
    let running = true;
    const tick = (t) => { frames.push(t - last); last = t; if (running) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const start = performance.now();
    let dir = 1;
    while (performance.now() - start < ms) {
      el.scrollTop += dir * step;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) dir = -1;
      if (el.scrollTop <= 0) dir = 1;
      await new Promise((r) => setTimeout(r, 16));
    }
    running = false;
    el.scrollTop = 0;
    const f = frames.slice(2);
    const dur = f.reduce((s, x) => s + x, 0) || 1;
    const sorted = [...f].sort((a, b) => a - b);
    return {
      scroller: desc, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
      frames: f.length, fps: +(f.length / (dur / 1000)).toFixed(1),
      p95FrameMs: +(sorted[Math.ceil(0.95 * sorted.length) - 1] || 0).toFixed(1),
      jank: f.filter((x) => x > 50).length,
    };
  }, { selector, ms, step });
}
