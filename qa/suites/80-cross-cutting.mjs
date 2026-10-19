// qa/suites/80-cross-cutting.mjs — cross-cutting properties, LOGGED IN (t-cross-cutting).
// -----------------------------------------------------------------------------
// Run with the qa-8 profile as primary; the suite starts qa-9 (same account) for
// realtime sync between instances:
//   node run.mjs --suite 80-cross-cutting --profile qa-8
// Env: TX_NAV_N (50) navbar iterations, TX_SYNC_N (3) sync cycles, TX_PAR_LOGGED (3).
// Real data ONLY with the QA-AUTO-cross-cutting-<runid> prefix; cleanup at the end deletes ONLY
// the QA-AUTO-cross-cutting- prefix. No paying, inviting, publishing, OAuth, logout.
// Max simultaneous instances of t-cross-cutting: 5 (qa-8 + qa-9 + 3 ephemeral).
import path from "node:path";
import { sessionInfo } from "../lib/session.mjs";
import * as C from "./80-cross-cutting/common.mjs";
import * as P from "./80-cross-cutting/perf.mjs";
import * as S from "./80-cross-cutting/security.mjs";
import * as M from "./80-cross-cutting/multi.mjs";
import * as U from "./80-cross-cutting/ui-logged.mjs";
import * as A from "./80-cross-cutting/a11y.mjs";
import { RECORDER_SRC, osIdsScript, readRecorder, startNetworkCapture, wsState, closeAllWs } from "./80-cross-cutting/telemetry.mjs";

const env = (k, d) => (process.env[k] != null ? parseInt(process.env[k], 10) : d);
const RUNID = process.env.TX_RUNID || C.runId();
const T = (s) => `${U.PREFIX}${RUNID}-${s}`;
const SECTIONS = ["chat", "docs", "design", "issues", "agents"];

// State shared between the tests of this run.
const logged = (page) => page.locator('[data-testid="workspace-navbar"]').first().isVisible().catch(() => false);
const st = { qa9: null, created: { issues: new Set(), docs: new Set() }, recorderOn: false };

// Logged in = workspace navbar present. Takes the primary to Chat (home) if needed.
async function ensureHome(ctx) {
  const page = ctx.page;
  const nav = await page.locator('[data-testid="workspace-navbar"]').first().waitFor({ state: "visible", timeout: 60000 }).then(() => true, () => false);
  if (!nav) { ctx.rec.screen = await ctx.lib.ui.detectScreen(page); ctx.checker.ok(false, "primary logged in (navbar)", `screen=${ctx.rec.screen}`); return false; }
  await U.leaveSettings(page);
  if ((await ctx.lib.ui.detectScreen(page)) !== "home") await U.goto(page, "chat");
  ctx.rec.screen = await ctx.lib.ui.detectScreen(page);
  return true;
}

async function ensureQa9(ctx) {
  if (st.qa9) return st.qa9;
  try {
    st.qa9 = await C.startProfile("qa-9");
  } catch (e) {
    ctx.checker.ok(false, "qa-9 started logged in", e.message);
    return null;
  }
  const ok = st.qa9.screen === "home" || st.qa9.screen === "logged";
  ctx.checker.ok(ok, "qa-9 logged in", `screen=${st.qa9.screen}`);
  return ok ? st.qa9 : null;
}

async function stopQa9() {
  if (!st.qa9) return null;
  const r = await C.stopAll([st.qa9]);
  st.qa9 = null;
  return r[0];
}

async function withRecorder(page) {
  await page.addInitScript(osIdsScript());
  await page.addInitScript(RECORDER_SRC);
  await page.reload({ waitUntil: "domcontentloaded" });
  await C.ui.waitForReady(page);
  const ok = await page.locator('[data-testid="workspace-navbar"]').first().waitFor({ state: "visible", timeout: 90000 }).then(() => true, () => false);
  return { screen: ok ? "logged" : await C.ui.detectScreen(page) };
}

// Propagation latency: arm the watcher in B, perform the action in A, wait in B.
async function propagate(pageB, key, text, appear, actionInA, timeoutMs = 30000) {
  await U.armTextWatch(pageB, key, text, { appear });
  const a = await actionInA();
  const t0 = a.submitAt || a.commitAt || a.deleteAt || a.typedAt || null;
  if (!a.ok) return { ok: false, action: a };
  const seen = await U.waitTextWatch(pageB, key, timeoutMs);
  return { ok: seen != null, action: a, latencyMs: seen != null && t0 ? seen - t0 : null };
}

export default {
  name: "80-cross-cutting",
  tests: [
    {
      name: "network-and-telemetry-logged-in",
      async fn(ctx) {
        const { page, instance, checker, rec, instDir } = ctx;
        if (!(await ensureHome(ctx))) return;
        const s = await C.cdpSession(page);
        const cap = await startNetworkCapture(s);
        const t0 = Date.now();
        const sc = await withRecorder(page);
        st.recorderOn = true;
        rec.warmReloadToHomeMs = Date.now() - t0;
        await C.sleep(30000);
        const net = cap.summary();
        await cap.stop();
        const tel = await readRecorder(page);
        const tree = C.procTree(instance);
        const conns = await C.tcpConnections(tree.procs.map((p) => p.pid));
        const out = conns.filter((c) => c.state === "ESTABLISHED" && c.host !== "loopback");
        const tcp = {};
        for (const c of out) { const k = (tree.procs.find((p) => p.pid === c.pid) || {}).kind || "?"; (tcp[k] = tcp[k] || new Set()).add(`${c.host}:${c.port}`); }
        const r = { reloadToHomeMs: rec.warmReloadToHomeMs, screen: sc.screen, cdp: net, telemetry: tel, tcpOut: Object.fromEntries(Object.entries(tcp).map(([k, v]) => [k, [...v]])) };
        rec.evidence = C.writeJson(path.join(instDir, "network-logged-in.json"), r);
        rec.network = Object.entries(net.hosts).map(([domain, v]) => ({ domain, count: v.count, statuses: v.statuses }));
        const wsHosts = [...new Set([...(net.websockets || []).map((w) => w.host), ...((tel && tel.websockets) || []).map((w) => w.host)])];
        checker.ok(await logged(page), "logged-in reload restores the session", `${rec.warmReloadToHomeMs} ms (screen ${sc.screen})`);
        checker.ok(wsHosts.some((h) => /convex\.cloud/.test(h)), "Convex WebSocket open while logged in", JSON.stringify(wsHosts));
        checker.ok(Object.keys(net.hosts).some((h) => /posthog/.test(h)), "PostHog active while logged in", JSON.stringify(Object.keys(net.hosts)));
        if (tel) {
          const jwt = Object.entries(tel.hosts).filter(([h]) => /posthog|sentry/.test(h)).reduce((n, [, v]) => n + v.flags.jwt, 0);
          checker.equal(jwt, 0, "telemetry carries no JWT");
          rec.telemetry = { events: tel.eventNames, personSetKeys: tel.personSetKeys, emailFlag: Object.fromEntries(Object.entries(tel.hosts).map(([h, v]) => [h, v.flags.email])) };
        }
        rec.notes = `reload->home ${rec.warmReloadToHomeMs} ms; ws=${JSON.stringify(wsHosts)}; tcp=${JSON.stringify(r.tcpOut)}`;
        try { await s.detach(); } catch {}
      },
    },
    {
      name: "boot-logged-in",
      async fn(ctx) {
        const { checker, rec, instDir, instance } = ctx;
        const runs = [];
        for (let i = 0; i < 3; i++) {
          let h = null;
          const r = { i: i + 1 };
          try {
            h = await C.startProfile("qa-9");
            Object.assign(r, { devtoolsMs: h.instance.bootDevtoolsMs, targetMs: h.instance.bootTargetMs, toHomeMs: h.homeMs, screen: h.screen });
            await C.sleep(3000);
            const tree = C.procTree(h.instance);
            Object.assign(r, { procs: tree.procs.length, rssMB: tree.totalRssMB, session: (({ present, authFile }) => ({ present, authFile }))(sessionInfo(h.instance.paths)) });
          } catch (e) { r.error = String(e.message).slice(0, 160); }
          finally { if (h) { const td = await C.stopAll([h]); r.teardownMs = td[0].ms; } }
          runs.push(r);
        }
        const ok = runs.filter((r) => !r.error);
        rec.bootLogged = { toHomeMs: C.stats(ok.map((r) => r.toHomeMs)), rssMB: C.stats(ok.map((r) => r.rssMB)), procs: C.stats(ok.map((r) => r.procs)), qa8BootMs: instance.bootMs };
        rec.evidence = C.writeJson(path.join(instDir, "boot-logged-in.json"), { runs, summary: rec.bootLogged });
        checker.equal(ok.length, 3, "3/3 logged-in boots of qa-9");
        checker.ok(ok.every((r) => r.screen === "home" || r.screen === "logged"), "logged-in boot restores the session (navbar)", JSON.stringify(ok.map((r) => r.screen)));
        checker.atMost(rec.bootLogged.toHomeMs.p95 || 1e9, 30000, "p95 spawn->navbar (logged in) <= 30 s");
        rec.notes = `spawn->navbar p50=${rec.bootLogged.toHomeMs.p50} p95=${rec.bootLogged.toHomeMs.p95} ms; RSS p50=${rec.bootLogged.rssMB.p50} MB`;
      },
    },
    {
      name: "sync-issue-create-edit-delete",
      async fn(ctx) {
        const { page, checker, rec, instDir } = ctx;
        if (!(await ensureHome(ctx))) return;
        const b = await ensureQa9(ctx);
        if (!b) return;
        await U.goto(b.page, "issues");
        await U.setIssueSearch(b.page, `${U.PREFIX}${RUNID}`); // filtered board: the run's cards are always rendered
        const n = env("TX_SYNC_N", 3);
        const cycles = [];
        for (let i = 0; i < n; i++) {
          const t1 = T(`sync${i}`), t2 = T(`sync${i}-ed`);
          const c = { i };
          c.create = await propagate(b.page, `c${i}`, t1, true, async () => { const r = await U.createIssue(page, t1); if (r.ok) st.created.issues.add(t1); return r; });
          c.edit = await propagate(b.page, `e${i}`, t2, true, async () => { const r = await U.editIssueTitle(page, t1, t2); if (r.ok) { st.created.issues.delete(t1); st.created.issues.add(t2); } return r; });
          c.del = await propagate(b.page, `d${i}`, t2, false, async () => { const r = await U.deleteIssue(page, t2); if (r.ok) st.created.issues.delete(t2); return r; });
          cycles.push(c);
        }
        await U.setIssueSearch(b.page, "");
        rec.evidence = C.writeJson(path.join(instDir, "sync-issue.json"), cycles);
        const lat = (k) => C.stats(cycles.map((c) => c[k].latencyMs));
        rec.sync = { create: lat("create"), edit: lat("edit"), delete: lat("del") };
        checker.ok(cycles.every((c) => c.create.ok), "creation in qa-8 shows up in qa-9 without reloading", JSON.stringify(cycles.map((c) => c.create.action.step || c.create.latencyMs)));
        checker.ok(cycles.every((c) => c.edit.ok), "edit in qa-8 shows up in qa-9", JSON.stringify(cycles.map((c) => c.edit.action.step || c.edit.latencyMs)));
        checker.ok(cycles.every((c) => c.del.ok), "deletion in qa-8 disappears from qa-9", JSON.stringify(cycles.map((c) => c.del.action.step || c.del.latencyMs)));
        checker.atMost(rec.sync.create.p95 || 1e9, 5000, "p95 creation latency <= 5 s");
        rec.notes = `latency ms (p50/p95) create=${rec.sync.create.p50}/${rec.sync.create.p95} edit=${rec.sync.edit.p50}/${rec.sync.edit.p95} delete=${rec.sync.delete.p50}/${rec.sync.delete.p95}`;
      },
    },
    {
      name: "sync-concurrent-edit",
      async fn(ctx) {
        const { page, checker, rec, instDir } = ctx;
        if (!(await ensureHome(ctx))) return;
        const b = await ensureQa9(ctx);
        if (!b) return;
        const out = {};
        // 1) issue: different titles at the same time => LWW? do they converge?
        const base = T("conc");
        const cr = await U.createIssue(page, base);
        if (cr.ok) st.created.issues.add(base);
        await U.goto(b.page, "issues");
        await U.setIssueSearch(b.page, `${U.PREFIX}${RUNID}`);
        await U.armTextWatch(b.page, "conc-base", base, { appear: true });
        out.baseSeen = (await U.waitTextWatch(b.page, "conc-base", 20000)) != null;
        const tA = T("conc-A"), tB = T("conc-B");
        const [ea, eb] = await Promise.all([U.editIssueTitle(page, base, tA), U.editIssueTitle(b.page, base, tB)]);
        out.edits = { a: ea, b: eb };
        await C.sleep(5000);
        await U.goto(page, "issues"); await U.goto(b.page, "issues");
        await C.sleep(1500);
        const seenA = await U.listPrefixedIssues(page, T("conc"));
        const seenB = await U.listPrefixedIssues(b.page, T("conc"));
        out.issue = { qa8: seenA, qa9: seenB, converged: JSON.stringify(seenA.sort()) === JSON.stringify(seenB.sort()) };
        for (const t of [...seenA, ...seenB]) st.created.issues.add(t);
        st.created.issues.delete(base);
        // 2) doc: two snippets typed at the same time => merge (Yjs)?
        const docT = T("doc-conc");
        const cd = await U.createDoc(page, docT, "base line");
        if (cd.ok) st.created.docs.add(docT);
        await C.sleep(2500);
        const openedB = await U.openDoc(b.page, docT);
        const openedA = await U.openDoc(page, docT);
        out.doc = { created: cd, openedA, openedB };
        if (openedA && openedB) {
          await Promise.all([U.appendToDoc(page, "QA-snippet-A"), U.appendToDoc(b.page, "QA-snippet-B")]);
          await C.sleep(5000);
          const [a, bb] = [await U.docText(page), await U.docText(b.page)];
          out.doc.merge = { aHasA: a.includes("QA-snippet-A"), aHasB: a.includes("QA-snippet-B"), bHasA: bb.includes("QA-snippet-A"), bHasB: bb.includes("QA-snippet-B"), identical: a === bb };
        }
        rec.evidence = C.writeJson(path.join(instDir, "sync-concurrent.json"), out);
        rec.concurrent = { issue: out.issue, doc: out.doc.merge };
        checker.ok(out.baseSeen, "base issue propagated to qa-9");
        checker.ok(out.issue.converged && out.issue.qa8.length === 1, "concurrent titles converge to a single value (LWW)", JSON.stringify(out.issue));
        checker.ok(!!out.doc.merge, "doc open in both instances", JSON.stringify(out.doc));
        if (out.doc.merge) checker.ok(out.doc.merge.aHasA && out.doc.merge.aHasB && out.doc.merge.bHasA && out.doc.merge.bHasB, "concurrent doc edits merge (both snippets in both instances)", JSON.stringify(out.doc.merge));
      },
    },
    {
      name: "sync-offline-online",
      async fn(ctx) {
        const { page, checker, rec, instDir } = ctx;
        if (!(await ensureHome(ctx))) return;
        const b = await ensureQa9(ctx);
        if (!b) return;
        // recorder in qa-9 to control/observe the WebSockets
        await withRecorder(b.page);
        await U.goto(b.page, "issues");
        await U.setIssueSearch(b.page, `${U.PREFIX}${RUNID}`);
        const s = await C.cdpSession(b.page);
        const out = { wsBefore: await wsState(b.page) };
        await C.setNet(s, "offline");
        out.wsClosedByUs = await closeAllWs(b.page); // offline emulation does not drop an already-open WS
        await C.sleep(4000);
        out.banner = await b.page.locator('[data-testid="connection-outage-banner"]').count();
        out.wsOffline = await wsState(b.page);
        // (a) qa-8 creates while qa-9 is offline
        const tOn = T("off-remote");
        const cr = await U.createIssue(page, tOn);
        if (cr.ok) st.created.issues.add(tOn);
        await C.sleep(3000);
        out.seenWhileOffline = (await b.page.evaluate((t) => document.body.innerText.includes(t), tOn));
        // (b) qa-9 creates offline (local queue?)
        const tOff = T("off-local");
        out.offlineCreate = await U.createIssue(b.page, tOff);
        if (out.offlineCreate.ok) st.created.issues.add(tOff);
        await U.armTextWatch(b.page, "back", tOn, { appear: true });
        await U.goto(page, "issues");
        await U.setIssueSearch(page, `${U.PREFIX}${RUNID}`);
        await U.armTextWatch(page, "fromOff", tOff, { appear: true });
        const onAt = await b.page.evaluate(() => Date.now());
        await C.setNet(s, "online");
        const back = await U.waitTextWatch(b.page, "back", 60000);
        const fromOff = await U.waitTextWatch(page, "fromOff", 60000);
        out.recoverMs = back != null ? back - onAt : null;
        out.offlineWriteDeliveredMs = fromOff != null ? fromOff - onAt : null;
        await C.sleep(1500);
        out.bannerAfter = await b.page.locator('[data-testid="connection-outage-banner"]').count();
        out.wsAfter = await wsState(b.page);
        await U.setIssueSearch(b.page, ""); await U.setIssueSearch(page, "");
        try { await s.detach(); } catch {}
        rec.evidence = C.writeJson(path.join(instDir, "sync-offline.json"), out);
        rec.offline = { recoverMs: out.recoverMs, offlineWriteDeliveredMs: out.offlineWriteDeliveredMs, banner: out.banner };
        checker.ok(!out.seenWhileOffline, "offline qa-9 does not receive the remote creation");
        checker.ok(out.recoverMs != null, "when back online qa-9 receives what it missed", `${out.recoverMs} ms`);
        checker.ok(out.offlineWriteDeliveredMs != null, "write made offline in qa-9 reaches qa-8 after reconnecting", `${out.offlineWriteDeliveredMs} ms; create=${JSON.stringify(out.offlineCreate)}`);
        checker.ok(out.banner > 0, "connection-outage banner appears offline", `banner=${out.banner}`);
        checker.ok(out.wsAfter.some((w) => w.readyState === 1), "WebSocket reconnected", JSON.stringify(out.wsAfter));
      },
    },
    {
      name: "xss-user-content",
      async fn(ctx) {
        const { page, checker, rec, instDir, collectors } = ctx;
        if (!(await ensureHome(ctx))) return;
        const b = await ensureQa9(ctx);
        // Local-ONLY payloads: they change document.title / console.log. src=x resolves to a local file://.
        const payloads = [
          `<img src=x onerror="document.title='QA-XSS-img'">`,
          `<svg onload="console.log('QA-XSS-svg')"></svg>`,
          `<script>console.log('QA-XSS-script')</script>`,
          `[link](javascript:document.title='QA-XSS-md')`,
        ];
        const title = T("xss") + " " + payloads[0];
        const titles0 = { a: await page.title(), b: b ? await b.page.title() : null };
        const consoleMark = () => collectors.consoleErrors.concat(collectors.consoleWarnings).filter((m) => /QA-XSS/.test(m)).length;
        const logs = [];
        const onLog = (m) => { if (/QA-XSS/.test(m.text())) logs.push(m.text().slice(0, 60)); };
        page.on("console", onLog);
        if (b) b.page.on("console", onLog);
        const ci = await U.createIssue(page, title);
        if (ci.ok) st.created.issues.add(title);
        const docT = T("xss-doc");
        const cd = await U.createDoc(page, docT, payloads.join(" "));
        if (cd.ok) st.created.docs.add(docT);
        // paste HTML into the editor (tests the Tiptap sanitizer)
        const pasted = await page.evaluate((html) => {
          const ed = [...document.querySelectorAll('.ProseMirror[contenteditable="true"]')].find((e) => e.getBoundingClientRect().height > 0);
          if (!ed) return false;
          ed.focus();
          const dt = new DataTransfer();
          dt.setData("text/html", html);
          dt.setData("text/plain", "qa");
          ed.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
          return true;
        }, payloads.slice(0, 2).join(""));
        await C.sleep(3000);
        if (b) { await U.openIssue(b.page, T("xss")).catch(() => {}); await C.sleep(1500); await U.openDoc(b.page, docT).catch(() => {}); await C.sleep(2000); }
        await U.openIssue(page, T("xss")).catch(() => {});
        await C.sleep(1500);
        const domCheck = (p) => p.evaluate(() => ({
          title: document.title,
          onerrorAttrs: document.querySelectorAll("[onerror]").length,
          onloadAttrs: document.querySelectorAll("svg[onload],[onload]").length,
          jsLinks: [...document.querySelectorAll("a[href]")].filter((a) => /^javascript:/i.test(a.getAttribute("href"))).length,
          scripts: [...document.querySelectorAll("script")].filter((s) => /QA-XSS/.test(s.textContent)).length,
        }));
        const out = { created: { issue: ci, doc: cd, pasted }, qa8: await domCheck(page), qa9: b ? await domCheck(b.page) : null, titles0, logs, consoleMark: consoleMark() };
        page.off("console", onLog);
        if (b) b.page.off("console", onLog);
        rec.evidence = C.writeJson(path.join(instDir, "xss.json"), out);
        rec.xss = out;
        const exec = (d) => d && (/QA-XSS/.test(d.title) || d.onerrorAttrs || d.onloadAttrs || d.scripts);
        checker.ok(ci.ok || cd.ok, "malicious test content created (issue/doc)", JSON.stringify(out.created));
        checker.ok(!logs.length && !out.consoleMark, "no payload script executed (console)", JSON.stringify(logs));
        checker.ok(!exec(out.qa8), "qa-8: payload did not become active DOM nor change the title", JSON.stringify(out.qa8));
        if (b) checker.ok(!exec(out.qa9), "qa-9: payload did not become active DOM nor change the title", JSON.stringify(out.qa9));
        checker.equal(out.qa8.jsLinks, 0, "no javascript: link rendered");
      },
    },
    {
      name: "perf-navigation-50x",
      async fn(ctx) {
        const { page, checker, rec, instDir } = ctx;
        if (!(await ensureHome(ctx))) return;
        await stopQa9(); // free RAM/CPU for measuring
        const s = await C.cdpSession(page);
        await U.goto(page, "chat");
        await C.forceGC(s); await C.sleep(1000);
        const before = await C.rendererMetrics(s);
        const stopLT = await P.startLongTasks(page);
        const n = env("TX_NAV_N", 50);
        const times = Object.fromEntries(SECTIONS.map((x) => [x, []]));
        const fails = [];
        const mid = [];
        for (let i = 0; i < n; i++) {
          for (const sec of SECTIONS) {
            const g = await U.goto(page, sec, { timeout: 10000 });
            if (g.ok) times[sec].push(g.ms); else fails.push(`${i}:${sec}`);
          }
          if (i === Math.floor(n / 2)) mid.push(await C.rendererMetrics(s));
        }
        const lt = await stopLT();
        await U.goto(page, "chat");
        await C.forceGC(s); await C.sleep(1500);
        const after = await C.rendererMetrics(s);
        try { await s.detach(); } catch {}
        const nav = Object.fromEntries(Object.entries(times).map(([k, v]) => [k, C.stats(v)]));
        const r = { n, before, mid, after, nav, longTasks: lt, fails };
        rec.evidence = C.writeJson(path.join(instDir, "perf-navigation.json"), r);
        rec.navPerf = { heapDeltaMB: +(after.jsHeapUsedMB - before.jsHeapUsedMB).toFixed(1), nodesDelta: after.nodes - before.nodes, listenersDelta: after.listeners - before.listeners, longTasks: lt, nav };
        checker.atMost(fails.length, Math.ceil(n * SECTIONS.length * 0.02), "navigation ok in >= 98% of the switches", JSON.stringify(fails.slice(0, 10)));
        checker.atMost(rec.navPerf.heapDeltaMB, 40, "heap after GC grows <= 40 MB over 50 laps (leak)");
        checker.atMost(rec.navPerf.nodesDelta, Math.max(2000, before.nodes * 0.25), "DOM nodes do not accumulate (<= +25%)");
        checker.atMost(rec.navPerf.listenersDelta, Math.max(500, before.listeners * 0.25), "listeners do not accumulate (<= +25%)");
        rec.notes = `heap ${before.jsHeapUsedMB}->${after.jsHeapUsedMB} MB; nodes ${before.nodes}->${after.nodes}; listeners ${before.listeners}->${after.listeners}; long tasks ${lt.count} (max ${lt.maxMs} ms); nav p50 ${SECTIONS.map((x) => `${x}=${nav[x].p50}`).join(" ")}`;
      },
    },
    {
      name: "fps-list-scrolling",
      async fn(ctx) {
        const { page, checker, rec, instDir } = ctx;
        if (!(await ensureHome(ctx))) return;
        const out = {};
        for (const sec of [...SECTIONS, "settings"]) {
          const g = await U.goto(page, sec);
          await C.sleep(1200);
          out[sec] = g.ok ? await P.scrollFps(page, { ms: 2500 }) : { nav: false };
        }
        await U.goto(page, "chat");
        rec.evidence = C.writeJson(path.join(instDir, "fps.json"), out);
        rec.fps = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.scroller ? { fps: v.fps, p95FrameMs: v.p95FrameMs, jank: v.jank, scroller: v.scroller } : null]));
        const measured = Object.values(out).filter((v) => v.scroller);
        checker.ok(measured.length > 0, "some scrollable container measured", JSON.stringify(Object.keys(out).filter((k) => out[k].scroller)));
        checker.ok(measured.every((v) => v.fps >= 30), "FPS >= 30 while scrolling", JSON.stringify(rec.fps));
      },
    },
    {
      name: "resilience-slow-network-offline",
      async fn(ctx) {
        const { page, checker, rec, instDir } = ctx;
        if (!(await ensureHome(ctx))) return;
        const s = await C.cdpSession(page);
        const out = {};
        for (const preset of ["3g", "slow-3g"]) {
          await C.setNet(s, preset);
          const t = {};
          for (const sec of SECTIONS) t[sec] = await U.goto(page, sec, { timeout: 30000 });
          out[preset] = t;
        }
        await C.setNet(s, "offline");
        await closeAllWs(page);
        await C.sleep(5000);
        out.offline = { banner: await page.locator('[data-testid="connection-outage-banner"]').count(), nav: {} };
        for (const sec of SECTIONS) out.offline.nav[sec] = (await U.goto(page, sec, { timeout: 8000 })).ok;
        out.offline.exceptions = ctx.collectors.exceptions.length;
        const onAt = Date.now();
        await C.setNet(s, "online");
        let reconnectMs = null;
        for (let i = 0; i < 120; i++) {
          const ws = await wsState(page);
          const banner = await page.locator('[data-testid="connection-outage-banner"]').count();
          if (ws.some((w) => w.readyState === 1) && !banner) { reconnectMs = Date.now() - onAt; break; }
          await C.sleep(250);
        }
        out.reconnectMs = reconnectMs;
        out.screenAfter = (await logged(page)) ? "logged" : await C.ui.detectScreen(page);
        try { await s.detach(); } catch {}
        rec.evidence = C.writeJson(path.join(instDir, "network-resilience.json"), out);
        rec.resilience = { "3g": Object.fromEntries(SECTIONS.map((x) => [x, out["3g"][x].ms])), "slow-3g": Object.fromEntries(SECTIONS.map((x) => [x, out["slow-3g"][x].ms])), offline: out.offline, reconnectMs };
        checker.ok(SECTIONS.every((x) => out["3g"][x].ok), "navigation works on 3G");
        checker.ok(SECTIONS.every((x) => out["slow-3g"][x].ok), "navigation works on Slow 3G");
        checker.ok(Object.values(out.offline.nav).filter(Boolean).length >= 3, "UI navigable offline (cached data)", JSON.stringify(out.offline.nav));
        checker.ok(out.offline.banner > 0, "connection-outage banner offline", `banner=${out.offline.banner}`);
        checker.ok(reconnectMs != null && reconnectMs <= 30000, "reconnects within <= 30 s after coming back online", `${reconnectMs} ms`);
        checker.equal(out.screenAfter, "logged", "still logged in after the outage");
      },
    },
    {
      name: "a11y-logged-in-screens",
      async fn(ctx) {
        const { page, checker, rec, instDir } = ctx;
        if (!(await ensureHome(ctx))) return;
        const out = {};
        for (const sc of ["home", "chat", "docs", "design", "issues", "agents", "settings"]) {
          const nav = sc === "home" ? true : (await U.goto(page, sc)).ok;
          if (!nav) { out[sc] = { nav: false }; continue; }
          await C.sleep(1500);
          out[sc] = await A.a11yForScreen(page, sc);
          const shot = await ctx.lib.ui.screenshot(page, instDir, `a11y-${sc}`);
          if (shot) rec.screenshots.push(shot);
          if (sc === "settings") await U.leaveSettings(page);
        }
        await U.goto(page, "chat");
        rec.evidence = C.writeJson(path.join(instDir, "a11y-logged-in.json"), out);
        rec.a11y = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.axe ? { ...v.axe.counts, contrast: v.contrast && v.contrast.failures, tabStops: v.keyboard && v.keyboard.stops, focusVisible: v.keyboard && v.keyboard.focusVisibleRatio, trappedAt: v.keyboard && v.keyboard.trappedAt } : { nav: false }]));
        checker.ok(Object.values(out).every((v) => v.axe && !v.axeError), "axe ran on all screens", JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, !!v.axe]))));
        checker.ok(Object.values(out).every((v) => !v.keyboard || v.keyboard.trappedAt == null), "no keyboard focus trap");
        rec.notes = Object.entries(rec.a11y).map(([k, v]) => `${k}: c${v.critical}/s${v.serious}/m${v.moderate}/n${v.minor} contrast=${v.contrast} tab=${v.tabStops} focus=${v.focusVisible}`).join("; ");
      },
    },
    {
      name: "security-runtime-logged-in",
      async fn(ctx) {
        const { page, checker, rec, instDir } = ctx;
        if (!(await ensureHome(ctx))) return;
        const csp = await S.cspAndProbes(page);
        const surface = await S.rendererSurface(page);
        const tree = C.procTree(ctx.instance);
        const r = { csp: { directives: csp.directives, probes: csp.probes }, surface, renderers: tree.procs.filter((p) => p.kind === "renderer").map((p) => ({ pid: p.pid, sandboxed: p.sandboxed })), schemes: S.privilegedSchemes(tree.procs), session: (({ present, authFile }) => ({ present, authFile }))(sessionInfo(ctx.instance.paths)) };
        rec.evidence = C.writeJson(path.join(instDir, "security-logged-in.json"), r);
        checker.equal(surface.typeofRequire, "undefined", "nodeIntegration=false while logged in");
        checker.equal(surface.electronAPI, "object", "contextIsolation while logged in");
        checker.ok(surface.bridgeCount >= 17, "bridges while logged in (>= 17; canvas may add more)", `${surface.bridgeCount}: ${surface.bridges.join(",")}`);
        checker.ok(r.renderers.every((x) => x.sandboxed === false), "renderers without sandbox (documented)", JSON.stringify(r.renderers));
        checker.ok(r.session.present, "session file in the profile (plain text; finding §5.1)", JSON.stringify(r.session));
        rec.notes = `bridges=${surface.bridgeCount} methods=${surface.totalMethods} renderers=${r.renderers.length} session=${r.session.authFile}`;
      },
    },
    {
      name: "multi-instance-with-logged-in",
      async fn(ctx) {
        const { page, checker, rec, instDir } = ctx;
        if (!(await ensureHome(ctx))) return;
        await stopQa9();
        const extras = Math.min(3, env("TX_PAR_LOGGED", 3));
        const wsBefore = await wsState(page);
        const rounds = [];
        for (let k = 0; k < 2; k++) rounds.push(await M.parallelRound(Array.from({ length: extras }, (_, i) => i + 1), { watchPage: page, tag: "txpl" }));
        const wsAfter = await wsState(page);
        rec.evidence = C.writeJson(path.join(instDir, "multi-with-logged-in.json"), { rounds, wsBefore, wsAfter });
        checker.equal(rounds.reduce((s, r) => s + r.launched, 0), 2 * extras, `2x${extras} logged-out ephemerals with logged-in qa-8 open`);
        checker.ok(rounds.every((r) => !r.watchPingFails), "qa-8 responsive during the bursts");
        checker.ok(rounds.flatMap((r) => r.per).every((p) => p.screen === "auth"), "ephemerals do not inherit the qa-8 session (auth)");
        checker.ok(await logged(page), "qa-8 still logged in (navbar)");
        checker.ok(!wsAfter.length || wsAfter.some((w) => w.readyState === 1), "qa-8 WebSocket still open", JSON.stringify(wsAfter));
        rec.notes = `qa-8 ping p95 per round=${rounds.map((r) => r.watchPingMs.p95).join("/")} ms`;
      },
    },
    {
      name: "telemetry-privacy-logged-in",
      async fn(ctx) {
        const { page, checker, rec, instDir } = ctx;
        const tel = st.recorderOn ? await readRecorder(page) : null;
        rec.evidence = C.writeJson(path.join(instDir, "telemetry-final.json"), tel);
        if (!tel) { checker.ok(true, "n/a: recorder not installed"); return; }
        const th = Object.entries(tel.hosts).filter(([h]) => /posthog|sentry/.test(h));
        const qa = th.reduce((n, [, v]) => n + v.flags.qaContent, 0);
        const email = th.reduce((n, [, v]) => n + v.flags.email, 0);
        rec.telemetry = { events: tel.eventNames, propKeys: tel.propKeys.slice(0, 60), personSetKeys: tel.personSetKeys, personSetIdentity: tel.personSetIdentity, qaContentInTelemetry: qa, emailInTelemetry: email };
        checker.ok(Object.keys(tel.eventNames).length > 0, "telemetry events observed", JSON.stringify(tel.eventNames));
        checker.equal(qa, 0, "user titles/content (QA-AUTO) do not go to PostHog/Sentry");
        rec.notes = `events=${Object.keys(tel.eventNames).length}; bodies with e-mail=${email}; with QA-AUTO=${qa}`;
      },
    },
    {
      name: "kill-relaunch-logged-in",
      async fn(ctx) {
        const { checker, rec, instDir } = ctx;
        await stopQa9();
        const rounds = [];
        let h = await C.startProfile("qa-9");
        for (const mode of ["SIGKILL", "SIGKILL", "SIGTERM"]) {
          const tree = C.procTree(h.instance);
          try { h.collectors.stop(); } catch {}
          try { await h.browser.close(); } catch {}
          if (mode === "SIGKILL") {
            for (const p of tree.procs) { try { process.kill(p.pid, "SIGKILL"); } catch {} }
            const dl = Date.now() + 8000;
            while (Date.now() < dl && C.procTree(h.instance).procs.length) await C.sleep(150);
            try { const { teardown } = await import("../instance.mjs"); await teardown(h.instance, { graceMs: 500 }); } catch {}
          } else {
            await C.hardTeardown(h.instance);
          }
          const t0 = Date.now();
          let err = null;
          try { h = await C.startProfile("qa-9"); } catch (e) { err = e.message; h = null; }
          rounds.push({ mode, relaunchToHomeMs: h ? Date.now() - t0 : null, screen: h ? h.screen : null, error: err, session: h ? sessionInfo(h.instance.paths).present : null });
          if (!h) break;
        }
        if (h) await C.stopAll([h]);
        rec.evidence = C.writeJson(path.join(instDir, "kill-relaunch-logged-in.json"), rounds);
        rec.killRelaunchLogged = rounds;
        checker.equal(rounds.length, 3, "2 quick relaunches after SIGKILL + 1 after SIGTERM");
        checker.ok(rounds.every((r) => r.screen === "home" || r.screen === "logged"), "session recovered after kill (navbar, logged in)", JSON.stringify(rounds.map((r) => [r.mode, r.screen, r.error])));
        checker.ok(rounds.every((r) => r.session), "session file preserved");
      },
    },
    {
      name: "cleanup-prefix",
      async fn(ctx) {
        const { page, checker, rec, instDir } = ctx;
        if (!(await ensureHome(ctx))) return;
        const removed = { issues: [], docs: [], failed: [] };
        // everything with the t-cross-cutting prefix (any earlier runid included)
        for (let pass = 0; pass < 3; pass++) {
          const issues = await U.listPrefixedIssues(page);
          for (const t of issues) { const r = await U.deleteIssue(page, t); (r.ok ? removed.issues : removed.failed).push(t.slice(0, 60)); }
          const docs = await U.listPrefixedDocs(page);
          for (const t of docs) { const r = await U.deleteDoc(page, t); (r.ok ? removed.docs : removed.failed).push(t.slice(0, 60)); }
          if (!issues.length && !docs.length) break;
        }
        const leftI = await U.listPrefixedIssues(page);
        const leftD = await U.listPrefixedDocs(page);
        await stopQa9();
        rec.evidence = C.writeJson(path.join(instDir, "cleanup.json"), { removed, leftIssues: leftI, leftDocs: leftD, tracked: { issues: [...st.created.issues], docs: [...st.created.docs] } });
        checker.equal(leftI.length, 0, "no QA-AUTO-cross-cutting- issue left", JSON.stringify(leftI));
        checker.equal(leftD.length, 0, "no QA-AUTO-cross-cutting- doc left", JSON.stringify(leftD));
        rec.notes = `removed: ${removed.issues.length} issues, ${removed.docs.length} docs; failures=${removed.failed.length}`;
      },
    },
  ],
};
