// qa/suites/70-agents/mod-tests.mjs — tests for the "Agent Runs" mod (feature/agent-runs-panel.js).
// They run logged out (ephemeral instance) and logged in (profile qa-7). The mod is READ-ONLY; here
// too: queries only. Mod bugs become checks with the BUG-MOD-xx ID in the label.
import * as H from "./helpers.mjs";
const { sleep, tid } = H;

const RUN_FIELDS_DURATION = (r) => {
  const n = (v) => (typeof v === "number" && isFinite(v) ? v : null);
  if (n(r.durationMs) != null) return r.durationMs;
  const end = n(r.completedAt) ?? n(r.endedAt) ?? n(r.finishedAt);
  const st = n(r.startedAt);
  return end != null && st != null && end >= st ? end - st : null;
};

export const modTests = [
  {
    name: "mod-launcher-present",
    async fn(ctx) {
      const { page, checker, rec } = ctx;
      await ctx.lib.ui.waitForReady(page);
      rec.screen = await ctx.lib.ui.detectScreen(page);
      await page.locator("[data-rar-launcher]").first().waitFor({ state: "attached", timeout: 15000 }).catch(() => {});
      const b = await page.evaluate(() => {
        const l = document.querySelector("[data-rar-launcher]");
        const cs = l && getComputedStyle(l);
        const r = l && l.getBoundingClientRect();
        return {
          flag: !!window.__RE_TEMPO_AGENT_RUNS__, launchers: document.querySelectorAll("[data-rar-launcher]").length,
          text: l && l.innerText.trim(), title: l && l.title, pos: cs && cs.position, z: cs && +cs.zIndex,
          right: r && Math.round(innerWidth - r.right), bottom: r && Math.round(innerHeight - r.bottom),
          css: !!document.querySelector("link[data-rar-css]")?.sheet, type: l && l.type,
          hooks: ["__RE_TEMPO_AGENT_RUNS_OPEN__", "__RE_TEMPO_AGENT_RUNS_CLOSE__", "__RE_TEMPO_AGENT_RUNS_PREVIEW__"].every((k) => typeof window[k] === "function"),
        };
      });
      rec.launcher = b;
      checker.ok(b.flag, "mod loaded (__RE_TEMPO_AGENT_RUNS__)");
      checker.equal(b.launchers, 1, "exactly 1 launcher [data-rar-launcher]");
      checker.equal(b.text, "Agent Runs", "launcher text");
      checker.includes(b.title || "", "⌘⇧A", "title announces the ⌘⇧A shortcut");
      checker.ok(b.css, "mod CSS loaded (link[data-rar-css].sheet)");
      checker.ok(b.pos === "fixed" && b.right === 16 && b.bottom === 16, "launcher fixed in the bottom-right corner (16px)", JSON.stringify(b));
      checker.ok(b.hooks, "OPEN/CLOSE/PREVIEW automation hooks exposed");
      await H.shot(ctx, "mod-launcher");
    },
  },
  {
    name: "mod-opens-via-button-real-state",
    async fn(ctx) {
      const { page, checker, rec } = ctx;
      await H.modClose(page);
      const logged = await H.isLoggedIn(page);
      await page.click("[data-rar-launcher]", { timeout: 5000 });
      const early = await page.evaluate(() => ({
        roots: document.querySelectorAll("[data-rar-root]").length,
        skel: document.querySelectorAll("[data-rar-root] .rar-skel").length,
      }));
      checker.equal(early.roots, 1, "clicking the launcher opens 1 panel");
      checker.ok(early.skel > 0, "loading state (skeleton) appears immediately", `skel=${early.skel}`);
      const st = await H.modState(page, 25000);
      rec.modState = { kind: st.kind, ms: st.ms, via: st.via, sub: st.sub, vals: st.vals, statuses: st.statuses };
      checker.ok(st.kind !== "loading", "panel leaves loading within 25 s", `kind=${st.kind} ms=${st.ms}`);
      await H.shot(ctx, `mod-open-${logged ? "logged-in" : "logged-out"}`);
      if (!logged) {
        // README: "Empty state and error state (with retry) handled"; logged out there is no session.
        checker.ok(st.kind === "error", "BUG-MOD-01: without a session the panel should show ERROR (no session), not the empty state",
          `kind=${st.kind} via=${st.via} text="${st.text.replace(/\s+/g, " ").slice(0, 120)}"`);
        checker.ok(!/session is logged in/i.test(st.text), "BUG-MOD-01: do not claim 'The session is logged in' when it is not");
      } else {
        checker.ok(st.kind === "data" || st.kind === "empty", "logged in: data or empty state", `kind=${st.kind}`);
        checker.equal(st.via, "live-convex-client", "logged in: uses the session ConvexReactClient (not the HTTP fallback)");
      }
      await H.modClose(page);
    },
  },
  {
    name: "mod-shortcut-esc-backdrop-x",
    async fn(ctx) {
      const { page, checker, rec } = ctx;
      await H.modClose(page);
      await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
      const r = {};
      await page.keyboard.press("Meta+Shift+A"); await sleep(250); r.open1 = await H.modRoots(page);
      await page.keyboard.press("Meta+Shift+A"); await sleep(250); r.toggleClose = await H.modRoots(page);
      await page.keyboard.press("Meta+Shift+A"); await sleep(250);
      await page.keyboard.press("Escape"); await sleep(250); r.esc = await H.modRoots(page);
      await page.keyboard.press("Control+Shift+A"); await sleep(250); r.ctrl = await H.modRoots(page);
      await page.click("[data-rar-root] .rar-backdrop", { position: { x: 8, y: 8 } }).catch(() => {}); await sleep(250); r.backdrop = await H.modRoots(page);
      await H.modOpen(page); await sleep(200);
      await page.click("[data-rar-root] .rar-x").catch(() => {}); await sleep(250); r.x = await H.modRoots(page);
      // clicking INSIDE the panel does not close it
      await H.modOpen(page); await sleep(200);
      await page.click("[data-rar-root] .rar-title").catch(() => {}); await sleep(200); r.insideClick = await H.modRoots(page);
      await H.modClose(page);
      rec.shortcut = r;
      checker.equal(r.open1, 1, "⌘⇧A opens the panel");
      checker.equal(r.toggleClose, 0, "⌘⇧A again closes it (toggle)");
      checker.equal(r.esc, 0, "Esc closes");
      checker.equal(r.backdrop, 0, "clicking the backdrop closes");
      checker.equal(r.x, 0, "✕ button closes");
      checker.equal(r.insideClick, 1, "clicking inside the panel does not close it");
      H.note(ctx, `Ctrl+Shift+A also opens (opened=${r.ctrl}); on macOS this is a 2nd, unannounced shortcut`);
    },
  },
  {
    name: "mod-injected-failure-error-and-retry",
    async fn(ctx) {
      const { page, checker, rec } = ctx;
      await H.modClose(page);
      const logged = await H.isLoggedIn(page);
      // Injects failure only into the mod's 5 queries: fetch (HTTP fallback) and client.query (logged in).
      await H.installQuery(page);
      const injected = await page.evaluate(() => {
        const MOD = new Set(["agentRuns:listMyActiveRuns", "agentRuns:listMyRecentlyFailedRuns", "organizations:getUserOrganizations", "agents:listMyAgents", "agentRuns:listRunsForAgent"]);
        window.__qa70fail = true;
        if (!window.__qa70origFetch) {
          window.__qa70origFetch = window.fetch;
          window.fetch = function (u, o) {
            if (window.__qa70fail && String(u).includes("/api/query")) return Promise.reject(new TypeError("QA: injected failure"));
            return window.__qa70origFetch.apply(this, arguments);
          };
        }
        const c = window.__qa70client && window.__qa70client();
        if (c && !c.__qa70orig) {
          c.__qa70orig = c.query;
          c.query = function (ref, args) {
            const n = ref && ref[Symbol.for("functionName")];
            if (window.__qa70fail && MOD.has(n)) return Promise.reject(new Error("QA: injected failure in " + n));
            return c.__qa70orig.apply(this, arguments);
          };
        }
        return { client: !!c };
      });
      try {
        await H.modOpen(page);
        const st = await H.modState(page, 20000);
        rec.injected = { ...injected, kind: st.kind, retry: st.retry, text: st.text.slice(0, 160) };
        await H.shot(ctx, "mod-injected-failure");
        checker.ok(st.kind === "error", "BUG-MOD-02: with all queries failing the panel should show the ERROR state", `kind=${st.kind}`);
        checker.ok(st.retry, "BUG-MOD-02: 'Try again' button available after failure", `retry=${st.retry}`);
        // retry: turn the failure off and click (if the button exists); otherwise close/reopen.
        await page.evaluate(() => { window.__qa70fail = false; });
        if (st.retry) await page.click("[data-rar-retry]").catch(() => {});
        else { await H.modClose(page); await H.modOpen(page); }
        const st2 = await H.modState(page, 25000);
        rec.injected.afterRetry = st2.kind;
        checker.ok(st2.kind !== "loading" && st2.kind !== "error", "after restoring the network the panel recovers", `kind=${st2.kind}`);
        if (logged) checker.ok(st2.kind === "data" || st2.kind === "empty", "logged in: recovers with real data/empty");
      } finally {
        await page.evaluate(() => {
          window.__qa70fail = false;
          if (window.__qa70origFetch) { window.fetch = window.__qa70origFetch; delete window.__qa70origFetch; }
          const c = window.__qa70client && window.__qa70client();
          if (c && c.__qa70orig) { c.query = c.__qa70orig; delete c.__qa70orig; }
        }).catch(() => {});
        await H.modClose(page);
      }
    },
  },
  {
    name: "mod-offline-and-slow-via-cdp",
    async fn(ctx) {
      const { page, checker, rec } = ctx;
      await H.modClose(page);
      const r = {};
      try {
        await H.setNetwork(ctx, "offline");
        await H.modOpen(page);
        const off = await H.modState(page, 20000);
        r.offline = { kind: off.kind, ms: off.ms, retry: off.retry };
        await H.shot(ctx, "mod-offline");
        checker.ok(off.kind !== "loading", "BUG-MOD-03: offline the panel does not get stuck loading (timeout)", `kind=${off.kind} ms=${off.ms}`);
        checker.ok(off.kind === "error" && off.retry, "BUG-MOD-02: offline shows ERROR + retry (not 'empty')", `kind=${off.kind}`);
        await H.modClose(page);
        await H.setNetwork(ctx, "slow");
        await H.modOpen(page);
        await sleep(600);
        r.slowSkel = await page.evaluate(() => document.querySelectorAll("[data-rar-root] .rar-skel").length);
        await H.shot(ctx, "mod-slow-loading");
        const slow = await H.modState(page, 40000);
        r.slow = { kind: slow.kind, ms: slow.ms };
        checker.ok(r.slowSkel > 0, "slow network: skeleton visible while loading", `skel=${r.slowSkel}`);
        checker.ok(slow.kind !== "loading", "slow network (3 s RTT): finishes loading within 40 s", `kind=${slow.kind} ms=${slow.ms}`);
        await H.modClose(page);
      } finally {
        await H.setNetwork(ctx, "online").catch(() => {});
      }
      // race: closing mid-load does not leave an orphan panel
      await H.modOpen(page); await sleep(50); await H.modClose(page); await H.modOpen(page); await sleep(50); await H.modClose(page);
      await sleep(4000);
      r.orphanRoots = await H.modRoots(page);
      checker.equal(r.orphanRoots, 0, "closing mid-load does not leave an orphan panel");
      rec.network = r;
    },
  },
  {
    name: "mod-open-close-50x-no-leak",
    async fn(ctx) {
      const { page, checker, rec } = ctx;
      await H.modClose(page);
      let modReq = 0;
      const onReq = (r) => { const u = r.url(); if (u.includes("convex.cloud/api/query")) modReq++; };
      page.on("request", onReq);
      const wsBefore = await page.evaluate(() => performance.getEntriesByType("resource").length);
      const before = await H.domCounters(ctx);
      const times = [];
      let problems = 0;
      const kinds = {};
      const waitRoots = (n) => page.waitForFunction((n) => document.querySelectorAll("[data-rar-root]").length === n, n, { timeout: 2000 }).then(() => true, () => false);
      for (let i = 0; i < 50; i++) {
        const t = Date.now();
        await page.keyboard.press("Meta+Shift+A");
        const opened = await waitRoots(1);
        const st = opened ? await H.modState(page, 15000) : { kind: "not-opened" };
        times.push(Date.now() - t);
        kinds[st.kind] = (kinds[st.kind] || 0) + 1;
        if (!["data", "empty", "error"].includes(st.kind)) problems++;
        await page.keyboard.press("Escape");
        if (!(await waitRoots(0))) { kinds["esc-did-not-close"] = (kinds["esc-did-not-close"] || 0) + 1; await H.modClose(page); }
      }
      await sleep(2000);
      const after = await H.domCounters(ctx);
      page.off("request", onReq);
      const roots = await H.modRoots(page);
      const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
      rec.perf50 = { before, after, avgMs: avg, maxMs: Math.max(...times), httpQueries: modReq, problems, kinds, wsBefore };
      checker.equal(roots, 0, "after 50 cycles no [data-rar-root] is left");
      checker.equal(problems, 0, "all 50 cycles reached a final state", JSON.stringify(kinds));
      checker.atMost(after.nodes - before.nodes, 20, "DOM nodes do not grow (≤ 20)");
      checker.atMost(after.jsEventListeners - before.jsEventListeners, 5, "JS listeners do not grow (≤ 5)");
      checker.atMost(after.heapMB - before.heapMB, 5, "JS heap after GC grows ≤ 5 MB");
      checker.atMost(avg, 3000, "average open→final state→close cycle ≤ 3 s");
      H.note(ctx, `50 openings => ${modReq} HTTP fallback queries (no cache/debounce: each opening redoes 3 + N_agents queries)`);
    },
  },
  {
    name: "mod-formatting-synthetic-preview",
    async fn(ctx) {
      const { page, checker, rec } = ctx;
      await H.modClose(page);
      const pv = (s) => page.evaluate((s) => {
        window.__RE_TEMPO_AGENT_RUNS_PREVIEW__(s);
        const b = document.querySelector("[data-rar-root] [data-rar-body]");
        const r = {
          sub: document.querySelector("[data-rar-sub]")?.textContent,
          vals: [...b.querySelectorAll(".rar-v")].map((e) => e.innerText),
          overflow: [...b.querySelectorAll(".rar-v")].some((e) => e.scrollWidth > e.clientWidth + 1),
          imgs: b.querySelectorAll("img").length,
          barsLeft: [...b.querySelectorAll(".rar-bar")].map((e) => Math.round(e.getBoundingClientRect().left)),
        };
        window.__RE_TEMPO_AGENT_RUNS_CLOSE__();
        return r;
      }, s);
      const base = { total: 3, byStatus: { done: 2, error: 1 }, activeCount: 0, totalCost: null, costSamples: 0, agentsCount: 0 };
      const a = await pv({ ...base, avgDurationMs: 119600, agentsCount: 1 });
      const b = await pv({ ...base, avgDurationMs: 3599600 });
      const c = await pv({ ...base, avgDurationMs: 59960, totalCost: 0.00004, costSamples: 1 });
      const x = await pv({ total: 1234567890, byStatus: { '<img src=x onerror="window.__qa70xss=1">': 1, running: 99999, pending: 3 }, activeCount: 99999, avgDurationMs: 3 * 86400000, totalCost: 99999999.12, costSamples: 7, agentsCount: 12 });
      const xss = await page.evaluate(() => !!window.__qa70xss);
      rec.preview = { a, b, c, x };
      checker.ok(a.vals[2] !== "1m 60s", "BUG-MOD-04: 119.6 s must not become '1m 60s'", a.vals[2]);
      checker.ok(b.vals[2] !== "59m 60s", "BUG-MOD-04: 3599.6 s must not become '59m 60s'", b.vals[2]);
      checker.ok(c.vals[2] !== "60.0s", "BUG-MOD-04: 59.96 s shows '60.0s' instead of '1m'", c.vals[2]);
      checker.ok(!/^1 agents/.test(a.sub || ""), "BUG-MOD-05: singular '1 agent' (not '1 agents')", a.sub);
      checker.ok(!xss && x.imgs === 0, "status with HTML is escaped (no XSS)");
      checker.ok(!x.overflow, "large numbers do not overflow the card");
      checker.ok(new Set(x.barsLeft).size <= 1, "BUG-MOD-07: status bars aligned in the same column", JSON.stringify(x.barsLeft));
      H.note(ctx, `cost 0.00004 => ${c.vals[3]}; 3 days => ${x.vals[2]}`);
    },
  },
  {
    name: "mod-theme-dark-light-contrast",
    async fn(ctx) {
      const { page, checker, rec } = ctx;
      await H.modClose(page);
      const SEL = [".rar-title", ".rar-sub", ".rar-k", ".rar-v", ".rar-section-title", ".rar-chip", ".rar-n", ".rar-foot", ".rar-badge", "launcher"];
      const sample = { total: 5, byStatus: { done: 3, running: 1, error: 1 }, activeCount: 1, avgDurationMs: 42000, totalCost: 0.12, costSamples: 5, agentsCount: 3 };
      const origTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      const res = {};
      try {
        for (const theme of ["dark", "light"]) {
          await page.evaluate((t) => { if (t === "light") document.documentElement.setAttribute("data-theme", "light"); else document.documentElement.removeAttribute("data-theme"); }, theme);
          await page.evaluate((s) => window.__RE_TEMPO_AGENT_RUNS_PREVIEW__(s), sample);
          await sleep(250);
          res[theme] = await H.modContrast(page, SEL);
          res[theme].panelBg = await page.evaluate(() => getComputedStyle(document.querySelector("[data-rar-root] .rar-panel")).backgroundColor);
          await H.shot(ctx, `mod-theme-${theme}`);
          await H.modClose(page);
        }
      } finally {
        await page.evaluate((t) => { if (t) document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme"); }, origTheme);
      }
      rec.contrast = res;
      checker.ok(res.dark.panelBg !== res.light.panelBg, "panel follows the app theme (background changes light/dark)");
      for (const theme of ["dark", "light"]) {
        for (const s of [".rar-title", ".rar-k", ".rar-v", ".rar-foot", ".rar-chip"]) checker.ok(res[theme][s] >= 4.5, `${theme}: contrast ${s} ≥ 4.5`, String(res[theme][s]));
        checker.ok(res[theme][".rar-badge"] >= 3, `BUG-MOD-06: ${theme}: RE-TEMPO badge legible (≥ 3:1)`, String(res[theme][".rar-badge"]));
      }
      checker.ok(res.dark.launcher >= 4.5, "BUG-MOD-06: launcher white text on purple ≥ 4.5:1 (12 px)", String(res.dark.launcher));
    },
  },
  {
    name: "mod-accessibility-focus",
    async fn(ctx) {
      const { page, checker, rec } = ctx;
      await H.modClose(page);
      await page.focus("[data-rar-launcher]").catch(() => {});
      await page.keyboard.press("Enter"); // activates the launcher via keyboard
      await sleep(300);
      const opened = await H.modRoots(page);
      const ax = await page.evaluate(() => {
        const d = document.querySelector("[data-rar-root] [role=dialog]");
        const a = document.activeElement;
        return { role: d?.getAttribute("role"), label: d?.getAttribute("aria-label"), modal: d?.getAttribute("aria-modal"),
          focusInside: !!(a && a.closest("[data-rar-root]")), closeLabel: document.querySelector("[data-rar-root] .rar-x")?.getAttribute("aria-label"), lang: document.documentElement.lang };
      });
      const tabs = [];
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("Tab");
        tabs.push(await page.evaluate(() => !!document.activeElement?.closest("[data-rar-root]")));
      }
      await page.keyboard.press("Escape"); await sleep(250);
      const back = await page.evaluate(() => document.activeElement?.hasAttribute("data-rar-launcher") || false);
      rec.a11y = { opened, ...ax, tabsInside: tabs, focusBackToLauncher: back };
      checker.equal(opened, 1, "Enter on the focused launcher opens the panel (keyboard)");
      checker.equal(ax.role, "dialog", "role=dialog");
      checker.ok(!!ax.label, "dialog has aria-label");
      checker.ok(!!ax.closeLabel, "close button has aria-label");
      checker.equal(ax.modal, "true", "BUG-MOD-08: dialog with aria-modal=true");
      checker.ok(ax.focusInside, "BUG-MOD-08: focus moves into the panel on open");
      checker.ok(tabs.every(Boolean), "BUG-MOD-08: Tab stays trapped in the panel (focus trap)", JSON.stringify(tabs));
      H.note(ctx, `focus returns to the launcher on close=${back}; close label="${ax.closeLabel}" with html lang=${ax.lang}`);
    },
  },
  {
    name: "mod-native-ui-overlap",
    async fn(ctx) {
      const { page, checker, rec } = ctx;
      await H.modClose(page);
      const views = {};
      views.current = await H.underLauncher(page);
      if (await H.isLoggedIn(page)) {
        for (const v of ["agents", "issues", "docs", "design", "chat"]) {
          const btn = page.locator(tid(`workspace-navbar-${v}-button`)).first();
          if (!(await btn.count())) continue;
          await btn.click({ timeout: 4000 }).catch(() => {});
          await sleep(1200);
          views[v] = await H.underLauncher(page);
        }
        await H.shot(ctx, "mod-launcher-over-ui");
      }
      // panel z-index vs. native layers (Radix/sonner)
      const z = await page.evaluate(() => {
        const zs = [...document.querySelectorAll("body *")].map((e) => +getComputedStyle(e).zIndex).filter((n) => Number.isFinite(n));
        const toaster = document.querySelector("[data-sonner-toaster]");
        return { maxNative: Math.max(0, ...zs.filter((n) => n < 2147482999)), toaster: toaster ? { y: toaster.getAttribute("data-y-position"), x: toaster.getAttribute("data-x-position") } : null };
      });
      rec.overlap = { views, z };
      const covered = Object.entries(views).filter(([, v]) => v && v.interactive.length).map(([k, v]) => `${k}: ${v.interactive.join(", ")}`);
      checker.ok(covered.length === 0, "BUG-MOD-09: the fixed launcher does not cover interactive native controls", covered.join(" | ") || "none");
      checker.ok(z.maxNative < 2147482999, "native layers stay below the launcher/panel (z-index)", `maxNative=${z.maxNative}`);
    },
  },
  {
    name: "mod-reload-and-double-injection",
    async fn(ctx) {
      const { page, checker, rec } = ctx;
      await H.modClose(page);
      await page.reload({ waitUntil: "domcontentloaded" });
      await ctx.lib.ui.waitForReady(page);
      await page.locator("[data-rar-launcher]").first().waitFor({ state: "attached", timeout: 30000 }).catch(() => {});
      const r = await page.evaluate(() => ({ launchers: document.querySelectorAll("[data-rar-launcher]").length, roots: document.querySelectorAll("[data-rar-root]").length, links: document.querySelectorAll("link[data-rar-css]").length }));
      const dup = await page.evaluate(async () => {
        const src = document.querySelector('script[src*="agent-runs-panel.js"]')?.src;
        if (!src) return { src: false };
        const s = document.createElement("script"); s.src = src + "?qa70dup=1"; document.body.appendChild(s);
        await new Promise((res) => { s.onload = res; s.onerror = res; setTimeout(res, 4000); });
        return { src: true, launchers: document.querySelectorAll("[data-rar-launcher]").length, links: document.querySelectorAll("link[data-rar-css]").length };
      });
      rec.reload = { r, dup };
      checker.equal(r.launchers, 1, "after reload: 1 launcher");
      checker.equal(r.roots, 0, "after reload: panel closed (state does not persist, expected)");
      checker.equal(r.links, 1, "after reload: 1 CSS link");
      checker.equal(dup.launchers, 1, "double script injection does not duplicate the launcher (idempotent guard)");
      if (await H.isLoggedIn(page)) await H.waitLoggedIn(page, 60000);
    },
  },
  {
    name: "mod-numbers-match-queries",
    async fn(ctx) {
      const { page, checker, rec } = ctx;
      if (!(await H.isLoggedIn(page))) { H.skip(ctx, "needs a logged-in profile (qa-7)"); checker.ok(true, "SKIP: logged out"); return; }
      await H.modClose(page);
      const exp = await expectedFromQueries(page);
      rec.expected = exp.summary;
      await H.modOpen(page);
      const st = await H.modState(page, 30000);
      const last = st.last || {};
      rec.modLast = last;
      checker.ok(st.kind === "data" || st.kind === "empty", "panel loaded", st.kind);
      checker.equal(last.total, exp.summary.total, "total runs = dedupe(active + failed + history 25/agent)");
      checker.equal(last.activeCount, exp.summary.activeCount, "active now = listMyActiveRuns.length");
      checker.equal(JSON.stringify(sortObj(last.byStatus || {})), JSON.stringify(sortObj(exp.summary.byStatus)), "status breakdown matches");
      checker.equal(last.agentsCount, exp.summary.agentsCount, "agent count = agents:listMyAgents(orgs[0])");
      if (exp.summary.avgDurationMs != null) checker.ok(Math.abs((last.avgDurationMs ?? -1) - exp.summary.avgDurationMs) < 1, "average duration matches (finishedAt - startedAt)");
      checker.ok(last.totalCost == null, "summed cost = '—' (runs have no cost field in the data model)", String(last.totalCost));
      // mod limits: orgs[0] and 25 runs per agent
      checker.ok(exp.truncatedAgents.length === 0, "DIV-MOD-01: no agent with > 25 runs (otherwise the mod total is truncated)", JSON.stringify(exp.truncatedAgents));
      checker.ok(exp.orgCount <= 1, "DIV-MOD-02: only 1 org (the mod always reads orgs[0], not the active org)", `orgs=${exp.orgCount}`);
      // UI: visible numbers = summary
      const ui = Object.fromEntries(st.vals || []);
      if (st.kind === "data") {
        checker.equal(ui["Total runs"], String(last.total), "UI: displayed Total runs = summary");
        checker.equal(ui["Active now"], String(last.activeCount), "UI: displayed Active now = summary");
      }
      // comparison with the native UI (agent list)
      if (await H.gotoAgents(page)) {
        await sleep(1500);
        const nativeRows = await page.locator('[data-testid^="agent-list-row-"]').count();
        rec.nativeAgentRows = nativeRows;
        H.note(ctx, `native list shows ${nativeRows} agents (org scope) vs mod ${last.agentsCount} (mine in orgs[0])`);
      }
      await H.modClose(page);
      await H.shot(ctx, "mod-numbers");
    },
  },
];

function sortObj(o) { return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))); }

// Recomputes the mod summary externally, with the same queries (and a larger limit to detect truncation).
export async function expectedFromQueries(page) {
  const active = await H.q(page, "agentRuns:listMyActiveRuns");
  const failed = await H.q(page, "agentRuns:listMyRecentlyFailedRuns");
  const os = await H.orgs(page);
  let agents = [];
  if (os[0]) { const a = await H.q(page, "agents:listMyAgents", { organizationId: os[0]._id }); agents = a.ok && Array.isArray(a.v) ? a.v : []; }
  const hist = [], truncated = [];
  for (const a of agents) {
    const r = await H.q(page, "agentRuns:listRunsForAgent", { agentId: a._id, limit: 25 });
    const rows = r.ok && Array.isArray(r.v) ? r.v : [];
    hist.push(...rows);
    if (rows.length >= 25) {
      const big = await H.q(page, "agentRuns:listRunsForAgent", { agentId: a._id, limit: 200 });
      if (big.ok && Array.isArray(big.v) && big.v.length > 25) truncated.push({ agent: a._id, n: big.v.length });
    }
  }
  const all = new Map();
  for (const r of [...(active.v || []), ...(failed.v || []), ...hist]) if (r && !all.has(r._id)) all.set(r._id, r);
  const rows = [...all.values()];
  const byStatus = {};
  for (const r of rows) byStatus[r.status || "unknown"] = (byStatus[r.status || "unknown"] || 0) + 1;
  const durs = rows.map(RUN_FIELDS_DURATION).filter((n) => n != null);
  return {
    rows,
    orgCount: os.length,
    truncatedAgents: truncated,
    agents,
    summary: {
      total: rows.length,
      activeCount: Array.isArray(active.v) ? active.v.length : 0,
      byStatus,
      agentsCount: agents.length,
      avgDurationMs: durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null,
    },
  };
}
