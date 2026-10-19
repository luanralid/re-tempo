/*
 * RE-TEMPO · Agent Runs panel
 * ---------------------------------------------------------------------------
 * Own self-contained module, injected into the RE-TEMPO renderer by ONE
 * <script> line in index.html (see feature/APPLY.md). Shows a floating panel
 * with the agent runs of the ALREADY LOGGED-IN account: total, breakdown by status,
 * average duration and summed cost. READ-ONLY: no mutation/write is called.
 *
 * How it talks to the backend (reuses the real session, no hardcoded token):
 *   1) Reuses the app's already-authenticated ConvexReactClient (found in the React tree),
 *      calling client.query(ref, args). It is the user's same logged-in WebSocket.
 *   2) Fallback: gets the session token via window.authBridge.getToken() and does
 *      POST {CONVEX_URL}/api/query (Convex's official HTTP query).
 * No token is stored, logged or sent outside the app's own backend.
 *
 * Queries read (all are read-only queries of Tempo's Convex):
 *   agentRuns:listMyActiveRuns            (the user's active runs)
 *   agentRuns:listMyRecentlyFailedRuns    (the user's recent failures)
 *   organizations:getUserOrganizations    (active org, to sweep the history)
 *   agents:listMyAgents                    (the user's agents in the org)
 *   agentRuns:listRunsForAgent             (per-agent history, for cost/duration)
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";
  if (window.__RE_TEMPO_AGENT_RUNS__?.dispose) window.__RE_TEMPO_AGENT_RUNS__.dispose();
  window.__RE_TEMPO_AGENT_RUNS__ = { dispose };
  function dispose() {
    window.removeEventListener("keydown", onKeydown);
    window.removeEventListener("DOMContentLoaded", mountLauncher);
    closePanel();
    document.querySelector("[data-rar-launcher]")?.remove();
    if (window.__RE_TEMPO_AGENT_RUNS__ && window.__RE_TEMPO_AGENT_RUNS__.dispose === dispose) window.__RE_TEMPO_AGENT_RUNS__ = null;
  }

  // Public endpoint of Tempo's Convex deployment (not a secret; it is just the URL).
  const CONVEX_URL = "https://greedy-jackal-526.convex.cloud";
  const Q = {
    myActive: "agentRuns:listMyActiveRuns",
    myFailed: "agentRuns:listMyRecentlyFailedRuns",
    orgs: "organizations:getUserOrganizations",
    agents: "agents:listMyAgents",
    runsForAgent: "agentRuns:listRunsForAgent",
  };
  const CONVEX_FN_NAME = Symbol.for("functionName"); // FunctionReference key

  // ---- load the sibling CSS (same folder as the script) -------------------------
  (function loadCss() {
    try {
      const self = document.currentScript && document.currentScript.src;
      const href = window.__RAR_CSS_URL__ ||
        (self ? self.replace(/\.js(\?.*)?$/, ".css") : null);
      if (href && !document.querySelector('link[data-rar-css]')) {
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = href;
        l.setAttribute("data-rar-css", "");
        document.head.appendChild(l);
      }
    } catch (_) { /* without CSS it still renders the structure */ }
  })();

  // ---- discovery of the logged-in ConvexReactClient in the React tree --------------
  let _client = null;
  function findConvexClient() {
    if (_client) return _client;
    const root = document.getElementById("root") || document.body;
    if (!root) return null;
    const key = Object.keys(root).find(
      (k) => k.startsWith("__reactContainer$") || k.startsWith("__reactFiber$")
    );
    let fiber = key ? root[key] : null;
    if (!fiber && root._reactRootContainer) {
      fiber = root._reactRootContainer._internalRoot &&
        root._reactRootContainer._internalRoot.current;
    }
    if (!fiber) return null;

    const looksLikeClient = (o) =>
      o && typeof o === "object" &&
      typeof o.query === "function" &&
      typeof o.watchQuery === "function";

    const seen = new Set();
    const stack = [fiber];
    const deadline = Date.now() + 1500; // time guard
    while (stack.length && Date.now() < deadline) {
      const f = stack.pop();
      if (!f || seen.has(f)) continue;
      seen.add(f);
      // props and state may carry the client (ConvexProvider client={...})
      for (const bag of [f.memoizedProps, f.memoizedState, f.stateNode]) {
        if (bag && typeof bag === "object") {
          if (looksLikeClient(bag)) { _client = bag; return _client; }
          for (const v of Object.values(bag)) {
            if (looksLikeClient(v)) { _client = v; return _client; }
          }
        }
      }
      // context values (ConvexProvider uses React context)
      let dep = f.dependencies && f.dependencies.firstContext;
      while (dep) {
        const v = dep.memoizedValue;
        if (looksLikeClient(v)) { _client = v; return _client; }
        if (v && typeof v === "object") {
          for (const inner of Object.values(v)) {
            if (looksLikeClient(inner)) { _client = inner; return _client; }
          }
        }
        dep = dep.next;
      }
      if (f.child) stack.push(f.child);
      if (f.sibling) stack.push(f.sibling);
    }
    return _client;
  }

  // ---- session token (HTTP fallback). Never persisted. ------------------
  let _token = null;
  async function getToken() {
    if (_token) return _token;
    const b = window.authBridge;
    if (b && typeof b.getToken === "function") {
      try {
        const t = await b.getToken();
        _token = typeof t === "string" ? t : (t && (t.token || t.value)) || null;
      } catch (_) { _token = null; }
    }
    return _token;
  }

  // ---- unified call: logged-in client -> otherwise HTTP+token -------------------
  async function callConvex(name, args) {
    const client = findConvexClient();
    if (client) {
      window.__RE_TEMPO_AGENT_RUNS_VIA__ = "live-convex-client";
      const ref = { [CONVEX_FN_NAME]: name };
      return await client.query(ref, args || {});
    }
    const token = await getToken();
    if (!token) {
      throw new Error("Logged-in session not found (no Convex client or token).");
    }
    window.__RE_TEMPO_AGENT_RUNS_VIA__ = "http+session-token";
    const res = await fetch(CONVEX_URL + "/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ path: name, args: args || {}, format: "json" }),
    });
    const data = await res.json();
    if (data && data.status === "success") return data.value;
    throw new Error((data && data.errorMessage) || ("Convex error in " + name));
  }

  // ---- normalization of run fields -------------------------------------
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
  function runDuration(r) {
    if (!r) return null;
    const d = num(r.durationMs);
    if (d != null) return d;
    const end = num(r.completedAt) ?? num(r.endedAt) ?? num(r.finishedAt);
    const start = num(r.startedAt);
    if (end != null && start != null && end >= start) return end - start;
    return null;
  }
  function runCost(r) {
    if (!r) return null;
    const direct = num(r.costUsd) ?? num(r.cost_usd) ?? num(r.cost) ?? num(r.usageCostUsd);
    if (direct != null) return direct;
    const cents = num(r.costCents) ?? num(r.costUsdCents);
    if (cents != null) return cents / 100;
    return null;
  }
  const dedupeById = (rows) => {
    const seen = new Map();
    for (const r of rows) {
      if (!r) continue;
      const id = r._id || r.id || JSON.stringify(r);
      if (!seen.has(id)) seen.set(id, r);
    }
    return [...seen.values()];
  };

  // ---- data collection (read-only) ----------------------------------------
  async function loadRuns() {
    const [active, failed] = await Promise.all([
      callConvex(Q.myActive, {}).catch(() => []),
      callConvex(Q.myFailed, {}).catch(() => []),
    ]);
    let agentsCount = 0;
    let history = [];
    try {
      const orgs = await callConvex(Q.orgs, {});
      const org = Array.isArray(orgs) && orgs[0];
      if (org && org._id) {
        const agents = (await callConvex(Q.agents, { organizationId: org._id })) || [];
        agentsCount = Array.isArray(agents) ? agents.length : 0;
        const lists = await Promise.all(
          (agents || [])
            .filter((a) => a && a._id)
            .map((a) =>
              callConvex(Q.runsForAgent, { agentId: a._id, limit: 25 }).catch(() => [])
            )
        );
        history = lists.flat().filter(Boolean);
      }
    } catch (_) { /* org/history are an optional complement */ }

    const all = dedupeById([
      ...(Array.isArray(active) ? active : []),
      ...(Array.isArray(failed) ? failed : []),
      ...history,
    ]);
    const byStatus = {};
    for (const r of all) {
      const s = (r && r.status) || "unknown";
      byStatus[s] = (byStatus[s] || 0) + 1;
    }
    const durations = all.map(runDuration).filter((n) => n != null);
    const costs = all.map(runCost).filter((n) => n != null);
    const activeCount = (Array.isArray(active) ? active.length : 0);
    return {
      total: all.length,
      byStatus,
      activeCount,
      avgDurationMs: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
      totalCost: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
      costSamples: costs.length,
      agentsCount,
    };
  }

  // ---- formatting ----------------------------------------------------------
  function fmtDuration(ms) {
    if (ms == null) return "—";
    if (ms < 1000) return Math.round(ms) + "ms";
    const s = ms / 1000;
    if (s < 60) return s.toFixed(1) + "s";
    const m = Math.floor(s / 60);
    const rs = Math.round(s % 60);
    if (m < 60) return m + "m" + (rs ? " " + rs + "s" : "");
    const h = Math.floor(m / 60);
    return h + "h " + (m % 60) + "m";
  }
  const fmtCost = (v) => (v == null ? "—" : "$" + (v < 1 ? v.toFixed(4) : v.toFixed(2)));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---- UI ------------------------------------------------------------------
  let overlay = null;
  function closePanel() {
    if (overlay) { overlay.remove(); overlay = null; }
  }
  function buildPanelShell() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.setAttribute("data-rar-root", "");
    overlay.innerHTML = `
      <div class="rar-backdrop" data-rar-close></div>
      <div class="rar-panel" role="dialog" aria-label="Agent Runs">
        <div class="rar-head">
          <span class="rar-title">Agent Runs</span>
          <span class="rar-badge">RE-TEMPO</span>
          <span class="rar-sub" data-rar-sub></span>
          <button class="rar-x" data-rar-close aria-label="Close">✕</button>
        </div>
        <div class="rar-body" data-rar-body></div>
        <div class="rar-foot">
          <span>Read-only · logged-in session data</span>
          <span style="margin-left:auto">Open/close <kbd>⌘</kbd><kbd>⇧</kbd><kbd>A</kbd></span>
        </div>
      </div>`;
    overlay.querySelectorAll("[data-rar-close]").forEach((el) =>
      el.addEventListener("click", closePanel)
    );
    document.body.appendChild(overlay);
    return overlay;
  }
  function openPanel() {
    if (overlay) return;
    buildPanelShell();
    renderLoading();
    refresh();
  }
  const body = () => overlay && overlay.querySelector("[data-rar-body]");
  const sub = () => overlay && overlay.querySelector("[data-rar-sub]");

  function renderLoading() {
    const b = body();
    if (!b) return;
    b.innerHTML =
      `<div class="rar-stats">${"<div class=\"rar-skel\"></div>".repeat(4)}</div>` +
      `<div class="rar-section-title">By status</div>` +
      `<div class="rar-skel" style="height:90px"></div>`;
  }

  function renderError(err) {
    const b = body();
    if (!b) return;
    b.innerHTML = `
      <div class="rar-err-box">
        <strong>Could not load the agent runs.</strong>
        <div style="margin-top:6px;color:var(--rar-text-dim);font-size:12px">${esc(err && err.message || err)}</div>
        <button class="rar-retry" data-rar-retry>Try again</button>
      </div>`;
    const btn = b.querySelector("[data-rar-retry]");
    if (btn) btn.addEventListener("click", () => { renderLoading(); refresh(); });
  }

  function renderData(d) {
    if (sub()) sub().textContent = d.agentsCount ? d.agentsCount + " agents" : "";
    const b = body();
    if (!b) return;
    if (d.total === 0) {
      b.innerHTML = `
        <div class="rar-note">
          <span class="rar-emoji">🗂️</span>
          <strong>No agent runs on this account yet</strong>
          <div>The session is logged in and responded, but there are no active or failed runs
          and no history.${d.agentsCount ? " You have " + d.agentsCount + " agent(s) configured." : ""}</div>
        </div>`;
      return;
    }
    const statuses = Object.entries(d.byStatus).sort((a, b2) => b2[1] - a[1]);
    const maxN = Math.max(...statuses.map(([, n]) => n), 1);
    const statusRows = statuses
      .map(([s, n]) => `
        <div class="rar-status-row">
          <span class="rar-chip" data-s="${esc(s)}"><i></i>${esc(s)}</span>
          <span class="rar-bar"><span style="width:${(n / maxN) * 100}%"></span></span>
          <span class="rar-n">${n}</span>
        </div>`)
      .join("");
    b.innerHTML = `
      <div class="rar-stats">
        <div class="rar-stat"><div class="rar-k">Total runs</div><div class="rar-v">${d.total}</div></div>
        <div class="rar-stat"><div class="rar-k">Active now</div><div class="rar-v">${d.activeCount}</div></div>
        <div class="rar-stat"><div class="rar-k">Average duration</div><div class="rar-v">${fmtDuration(d.avgDurationMs)}</div></div>
        <div class="rar-stat"><div class="rar-k">Total cost</div><div class="rar-v">${fmtCost(d.totalCost)}${d.totalCost != null ? ` <small>(${d.costSamples})</small>` : ""}</div></div>
      </div>
      <div class="rar-section-title">By status</div>
      ${statusRows}`;
  }

  async function refresh() {
    try {
      const d = await loadRuns();
      // Aggregate-only summary exposed for test automation (no personal data).
      window.__RE_TEMPO_AGENT_RUNS_LAST__ = d;
      renderData(d);
    } catch (err) {
      window.__RE_TEMPO_AGENT_RUNS_LAST__ = { error: String(err && err.message || err) };
      renderError(err);
    }
  }

  // ---- launcher + shortcut ---------------------------------------------------
  function mountLauncher() {
    if (document.querySelector("[data-rar-launcher]")) return;
    const btn = document.createElement("button");
    btn.setAttribute("data-rar-launcher", "");
    btn.innerHTML = `<span class="rar-dot"></span>Agent Runs`;
    btn.title = "Agent Runs (⌘⇧A)";
    btn.addEventListener("click", openPanel);
    document.body.appendChild(btn);
  }

  function onKeydown(e) {
    if (e.defaultPrevented) return;
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.code === "KeyA" || e.key.toLowerCase() === "a")) {
      e.preventDefault();
      overlay ? closePanel() : openPanel();
    }
    if (e.key === "Escape" && overlay) closePanel();
  }
  window.addEventListener("keydown", onKeydown);

  // exposes a minimal hook to open via console/automation (CDP test)
  window.__RE_TEMPO_AGENT_RUNS_OPEN__ = openPanel;
  window.__RE_TEMPO_AGENT_RUNS_CLOSE__ = closePanel;
  // DEMO helper: renders the populated layout from a synthetic summary,
  // without touching the backend. Only for a visual preview of the with-data state; it does NOT
  // reflect real account data.
  window.__RE_TEMPO_AGENT_RUNS_PREVIEW__ = (summary) => {
    buildPanelShell(); // no refresh() -> does not overwrite with real data
    renderData(summary || { total: 0, byStatus: {}, activeCount: 0, avgDurationMs: null, totalCost: null, costSamples: 0, agentsCount: 0 });
    if (sub()) sub().textContent = (summary && summary.agentsCount ? summary.agentsCount + " agents" : "") + " · preview";
  };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", mountLauncher);
  } else {
    mountLauncher();
  }
})();
