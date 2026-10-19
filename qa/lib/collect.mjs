// qa/lib/collect.mjs — runtime signal collectors on a playwright Page.
// -----------------------------------------------------------------------------
// Console (errors/warnings), unhandled exceptions, network requests (domain
// + status), and performance/memory metrics. Does not record sensitive values:
// redacts any long token-like substring in console messages.
const TOKENISH = /[A-Za-z0-9_.\-]{24,}/g;
function redact(s) {
  return String(s == null ? "" : s).replace(TOKENISH, "<redacted>");
}

// Attaches collectors to a page. Returns an object with the buffers and a stop().
export function attachCollectors(page) {
  const consoleErrors = [];
  const consoleWarnings = [];
  const exceptions = [];
  const requests = []; // { domain, status, method, resourceType }

  const onConsole = (msg) => {
    const type = msg.type();
    if (type === "error") consoleErrors.push(redact(msg.text()));
    else if (type === "warning") consoleWarnings.push(redact(msg.text()));
  };
  const onPageError = (err) => exceptions.push(redact(err && (err.stack || err.message || err)));
  const onResponse = (resp) => {
    try {
      const u = new URL(resp.url());
      const req = resp.request();
      requests.push({
        domain: u.host || u.protocol,
        status: resp.status(),
        method: req.method(),
        resourceType: req.resourceType(),
      });
    } catch { /* urls data:/blob: etc. */ }
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  return {
    consoleErrors,
    consoleWarnings,
    exceptions,
    requests,
    // Summary of unique domains contacted (with status range).
    networkSummary() {
      const by = new Map();
      for (const r of requests) {
        const cur = by.get(r.domain) || { domain: r.domain, count: 0, statuses: new Set() };
        cur.count++;
        cur.statuses.add(r.status);
        by.set(r.domain, cur);
      }
      return [...by.values()]
        .map((x) => ({ domain: x.domain, count: x.count, statuses: [...x.statuses].sort() }))
        .sort((a, b) => b.count - a.count);
    },
    stop() {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      page.off("response", onResponse);
    },
  };
}

// Renderer performance metrics (navigation timing + JS memory, if available).
export async function perfMetrics(page) {
  try {
    return await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] || {};
      const mem = (performance.memory && {
        usedJSHeapMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
        totalJSHeapMB: Math.round(performance.memory.totalJSHeapSize / 1048576),
      }) || null;
      return {
        domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd || 0),
        loadEventMs: Math.round(nav.loadEventEnd || 0),
        resourceCount: performance.getEntriesByType("resource").length,
        memory: mem,
      };
    });
  } catch {
    return null;
  }
}
