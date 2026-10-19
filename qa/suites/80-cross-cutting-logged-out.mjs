// qa/suites/80-cross-cutting-logged-out.mjs — cross-cutting properties WITHOUT login (t-cross-cutting).
// -----------------------------------------------------------------------------
// Run (dedicated slots 10..14, outside the qa-N profiles):
//   node suites/80-cross-cutting/driver.mjs --suite 80-cross-cutting-logged-out
// Env options: TX_BOOT_N (10), TX_MEM_MIN (3), TX_ROUNDS (3), TX_PAR (4 extras + the primary).
// The primary (slot 0 => index 10) is the ctx instance; tests that need
// extra instances use slots 1..4. Maximum of 5 simultaneous instances.
// Observation only: no write IPC, no payload leaving the machine.
import path from "node:path";
import * as C from "./80-cross-cutting/common.mjs";
import * as P from "./80-cross-cutting/perf.mjs";
import * as S from "./80-cross-cutting/security.mjs";
import * as M from "./80-cross-cutting/multi.mjs";
import { RECORDER_SRC, osIdsScript, readRecorder, startNetworkCapture } from "./80-cross-cutting/telemetry.mjs";

const env = (k, d) => (process.env[k] != null ? parseInt(process.env[k], 10) : d);
const EVID = (ctx, name) => path.join(ctx.instDir, `${name}.json`);

// Expected when logged out, per docs/dynamic-analysis.md §11.6.
const RENDERER_EXPECTED = ["fonts.googleapis.com", "fonts.gstatic.com", "rsms.me", "us-assets.i.posthog.com", "us.i.posthog.com"];
const NEVER_LOGGED_OUT = /convex\.(cloud|site)|relay\.tempo\.new/;

export default {
  name: "80-cross-cutting-logged-out",
  tests: [
    {
      name: "cold-boot-10x",
      async fn({ checker, rec, instDir }) {
        const n = env("TX_BOOT_N", 10);
        const r = await P.coldBoots(1, n, { tag: "txboot" });
        rec.boot = r.summary;
        rec.evidence = C.writeJson(path.join(instDir, "cold-boot.json"), r);
        checker.equal(r.summary.ok, n, `${n}/${n} cold boots ok`);
        checker.ok(r.summary.screens.length === 1 && r.summary.screens[0] === "auth", "all instances stop on the auth screen (logged out)", JSON.stringify(r.summary.screens));
        checker.atMost(r.summary.totalToScreenMs.p95 || 1e9, 8000, "p95 spawn->classified screen <= 8 s");
        checker.ok(r.runs.every((x) => !x.exceptions), "zero unhandled exceptions across all boots");
        checker.ok(r.runs.every((x) => !x.leftovers), "teardown with no leftover process");
        rec.notes = `spawn->screen p50=${r.summary.totalToScreenMs.p50} mean=${r.summary.totalToScreenMs.mean} p95=${r.summary.totalToScreenMs.p95} ms; RSS p50=${r.summary.rssMB.p50} MB; procs=${r.summary.procs.p50}; forcedMain=${r.runs.filter((x) => x.forcedMain).length}`;
      },
    },
    {
      name: "memory-over-time",
      async fn({ page, instance, checker, rec, instDir }) {
        const minutes = env("TX_MEM_MIN", 3);
        const r = await P.memoryOverTime(page, instance, { minutes, everyS: 10 });
        rec.memory = r.delta;
        rec.evidence = C.writeJson(path.join(instDir, "memory-logged-out.json"), r);
        checker.ok(r.samples.length >= 3, "samples collected", `n=${r.samples.length}`);
        checker.atMost(Math.abs(r.delta.heapMB), 15, "JS heap stable (|delta| <= 15 MB after GC)");
        checker.atMost(r.delta.nodesSteady, 200, "DOM nodes do not grow in steady state (<= +200 after the 1st sample)");
        checker.atMost(r.delta.rssMBperMin, 30, "tree RSS grows <= 30 MB/min while idle");
        rec.notes = `heap ${r.samples[0].jsHeapUsedMB}->${r.samples.at(-1).jsHeapUsedMB} MB; nodes ${r.samples[0].nodes}->${r.samples.at(-1).nodes}; RSS ${r.samples[0].rssMB}->${r.samples.at(-1).rssMB} MB in ${r.delta.minutes} min; DOM jumps: ${JSON.stringify(r.delta.jumps.slice(1).map((j) => ({ tS: j.tS, nodes: j.nodes, docs: j.documents, iframes: j.dom.iframes, rar: j.dom.rarRootNodes })))}`;
      },
    },
    {
      name: "network-logged-out",
      async fn({ page, instance, checker, rec, instDir }) {
        const s = await C.cdpSession(page);
        const cap = await startNetworkCapture(s);
        await page.addInitScript(osIdsScript());
        await page.addInitScript(RECORDER_SRC);
        await page.reload({ waitUntil: "domcontentloaded" });
        await C.ui.waitForReady(page);
        await C.sleep(15000);
        const net = cap.summary();
        await cap.stop();
        const telem = await readRecorder(page);
        const perfHosts = await page.evaluate(() => [...new Set(performance.getEntriesByType("resource").map((e) => { try { return new URL(e.name).host; } catch { return "?"; } }))]);
        const tree = C.procTree(instance);
        const conns = await C.tcpConnections(tree.procs.map((p) => p.pid));
        const out = conns.filter((c) => c.state === "ESTABLISHED" && c.host !== "loopback");
        const byProc = {};
        for (const c of out) {
          const kind = (tree.procs.find((p) => p.pid === c.pid) || {}).kind || "?";
          (byProc[kind] = byProc[kind] || new Set()).add(`${c.host}:${c.port}`);
        }
        const r = {
          cdp: net, telemetry: telem, perfHosts,
          tcpOut: Object.fromEntries(Object.entries(byProc).map(([k, v]) => [k, [...v]])),
          listen: conns.filter((c) => c.state === "LISTEN").map((c) => c.local),
        };
        rec.network = Object.entries(net.hosts).map(([domain, v]) => ({ domain, count: v.count, statuses: v.statuses }));
        rec.evidence = C.writeJson(path.join(instDir, "network-logged-out.json"), r);
        const rendererHosts = Object.keys(net.hosts).filter((h) => h && !/^file|^data|^blob|^tempo-/.test(h) && h !== "?");
        const allHosts = [...rendererHosts, ...perfHosts, ...out.map((c) => c.host)];
        checker.ok(!allHosts.some((h) => NEVER_LOGGED_OUT.test(h)), "logged out does not contact Convex or relay.tempo.new", JSON.stringify([...new Set(allHosts)]));
        const extra = rendererHosts.filter((h) => !RENDERER_EXPECTED.includes(h));
        checker.ok(extra.length === 0, "renderer domains within the expected set (dynamic-analysis §11.6)", `extras=${JSON.stringify(extra)}`);
        checker.ok(rendererHosts.some((h) => /posthog/.test(h)), "PostHog contacted while logged out (telemetry active without login)", JSON.stringify(rendererHosts));
        checker.ok(r.listen.every((l) => l.startsWith("127.0.0.1:") || l.startsWith("[::1]:")), "local servers on loopback only", JSON.stringify(r.listen));
        checker.ok(!net.websockets.length, "no WebSocket while logged out", JSON.stringify(net.websockets));
        if (telem) {
          const leaks = Object.values(telem.hosts).reduce((n, h) => n + h.flags.email + h.flags.jwt, 0);
          checker.equal(leaks, 0, "logged-out telemetry with no email/JWT in the body");
          rec.telemetry = { events: telem.eventNames, personSetKeys: telem.personSetKeys, personSetIdentity: telem.personSetIdentity };
          // privacy finding: OS identity sent without login (recorded, does not fail)
          rec.privacy = Object.keys(telem.personSetIdentity || {}).length ? `PostHog $set while logged out contains ${JSON.stringify(telem.personSetIdentity)}` : "no OS identity in $set";
          rec.notes = `events: ${JSON.stringify(telem.eventNames)}; TCP out: ${JSON.stringify(r.tcpOut)}`;
        }
        try { await s.detach(); } catch {}
      },
    },
    {
      name: "runtime-security",
      async fn({ checker, rec, instDir }) {
        const h = await C.startEphemeral(2, { tag: "txsec", inspect: true });
        try {
          const inspectPort = h.instance.paths.ports.inspect;
          const csp = await S.cspAndProbes(h.page);
          const surface = await S.rendererSurface(h.page);
          let main = null, mainErr = null;
          try { main = await S.mainWebPrefs(inspectPort); } catch (e) { mainErr = e.message; }
          const tree = C.procTree(h.instance);
          const schemes = S.privilegedSchemes(tree.procs);
          const listen = (await C.tcpConnections(tree.mainPids)).filter((c) => c.state === "LISTEN").map((c) => c.local);
          const p = h.instance.paths.ports;
          const local = {
            authGET: await S.localProbe(p.authCallback, "GET", "/"),
            authOPTIONS: await S.localProbe(p.authCallback, "OPTIONS", "/tempo/auth", { Origin: "https://qa-origin.invalid", "Access-Control-Request-Method": "POST" }),
            webcapGET: await S.localProbe(p.webCapture, "GET", "/"),
            webcapOPTIONS: await S.localProbe(p.webCapture, "OPTIONS", "/", { Origin: "https://qa-origin.invalid", "Access-Control-Request-Method": "POST" }),
          };
          const subframes = await S.subframeExposure(h.page);
          const links = await S.externalLinks(h.page, inspectPort); // last: may navigate the window
          const r = { csp, surface, main, mainErr, schemes, subframes, renderers: tree.procs.filter((x) => x.kind === "renderer").map((x) => ({ pid: x.pid, sandboxed: x.sandboxed })), listen, local, links };
          rec.security = { bridges: surface.bridgeCount, methods: surface.totalMethods, webContents: main && main.webContents.length };
          rec.evidence = C.writeJson(path.join(instDir, "runtime-security.json"), r);
          // CSP (dynamic-analysis §11.4)
          checker.equal(csp.metaCount, 1, "CSP via <meta> present");
          checker.ok((csp.directives["script-src"] || []).includes("'unsafe-eval'") && csp.probes.evalAllowed, "CSP allows unsafe-eval and eval runs (documented)");
          checker.ok((csp.directives["connect-src"] || []).includes("*"), "connect-src * (documented)");
          checker.ok(csp.probes.inlineScriptAllowed, "inline script runs (unsafe-inline, documented)");
          // Renderer
          checker.equal(surface.typeofRequire, "undefined", "nodeIntegration=false (require absent)");
          checker.equal(surface.typeofProcess, "undefined", "process absent in the renderer");
          checker.equal(surface.electronAPI, "object", "contextIsolation: electronAPI via contextBridge");
          checker.equal(surface.webviewTag, "WebViewElement", "webviewTag=true");
          checker.ok(surface.bridgeCount >= 15, "bridges exposed (17 in the doc)", `n=${surface.bridgeCount}: ${surface.bridges.join(",")}`);
          checker.ok(Math.abs(surface.totalMethods - 403) <= 20, "≈403 reachable IPC methods (doc)", `n=${surface.totalMethods}`);
          // Main
          checker.ok(!!main, "webPreferences read in main (inspector)", mainErr || "");
          if (main) {
            const withPrefs = main.webContents.filter((w) => Object.keys(w.prefs).length);
            checker.ok(withPrefs.every((w) => w.prefs.contextIsolation === true), "contextIsolation=true on all webContents", JSON.stringify(withPrefs.map((w) => [w.type, w.prefs.contextIsolation])));
            checker.ok(withPrefs.every((w) => w.prefs.nodeIntegration !== true), "nodeIntegration never true", JSON.stringify(withPrefs.map((w) => [w.type, w.prefs.nodeIntegration])));
            const win = withPrefs.find((w) => w.type === "window");
            checker.ok(win && win.prefs.sandbox === false, "main window sandbox=false (documented; risk)", JSON.stringify(win && win.prefs));
            checker.ok(withPrefs.every((w) => w.prefs.webSecurity !== false), "webSecurity never disabled", JSON.stringify(withPrefs.map((w) => [w.type, w.prefs.webSecurity])));
          }
          // nodeIntegrationInSubFrames=true: do the bridges reach iframes? (risk if so)
          rec.subframes = subframes;
          checker.ok(Object.values(subframes).every((x) => x.found), "local test iframes loaded", JSON.stringify(subframes));
          checker.ok(subframes.devserver && subframes.devserver.electronAPI === "undefined", "iframe http://127.0.0.1 (dev-server style) does NOT receive electronAPI", JSON.stringify(subframes.devserver));
          checker.ok(subframes.data && subframes.data.electronAPI === "undefined", "iframe data: does NOT receive electronAPI", JSON.stringify(subframes.data));
          checker.ok(r.renderers.length > 0 && r.renderers.every((x) => x.sandboxed === false), "renderers with --no-sandbox (documented)");
          checker.ok(schemes["tempo-screenshot"] && schemes["sentry-ipc"], "privileged schemes present", JSON.stringify(schemes));
          checker.ok(listen.every((l) => l.startsWith("127.0.0.1:")), "local ports on 127.0.0.1", JSON.stringify(listen));
          // External links
          const st = links.steps;
          checker.ok(links.trapInstalled, "openExternal trap installed");
          checker.ok(Object.values(st).every((x) => x.windowsDelta === 0), "no new BrowserWindow for external links", JSON.stringify(Object.fromEntries(Object.entries(st).map(([k, v]) => [k, v.windowsDelta]))));
          checker.ok(st["window.open"].openExternalCalls.length > 0, "external window.open goes to shell.openExternal", JSON.stringify(st["window.open"]));
          checker.ok(st["a[href] same frame"].mainUrl.startsWith("file"), "external navigation in the main frame is blocked", JSON.stringify(st["a[href] same frame"]));
          rec.notes = `CORS auth OPTIONS: ${JSON.stringify(local.authOPTIONS)}; webcap: ${JSON.stringify(local.webcapOPTIONS)}`;
        } finally {
          await C.stopAll([h]);
        }
      },
    },
    {
      name: "parallel-multi-instance",
      async fn({ page, checker, rec, instDir }) {
        const rounds = env("TX_ROUNDS", 3);
        const extras = Math.min(4, env("TX_PAR", 4));
        const slots = Array.from({ length: extras }, (_, i) => i + 1);
        const out = [];
        for (let k = 0; k < rounds; k++) out.push(await M.parallelRound(slots, { watchPage: page, tag: "txpar" }));
        rec.evidence = C.writeJson(path.join(instDir, "multi-instance.json"), out);
        const per = out.flatMap((o) => o.per);
        checker.equal(out.reduce((s, o) => s + o.launched, 0), rounds * extras, `${rounds}x${extras} instances came up in parallel (+1 primary = ${extras + 1} simultaneous)`);
        checker.ok(per.every((p) => p.screen === "auth"), "all rendered auth");
        checker.ok(per.every((p) => p.isolatedStorage), "localStorage isolated between instances");
        checker.ok(per.every((p) => p.ownUserData), "each one uses its own userData (log)");
        checker.ok(per.every((p) => p.expectedPorts.every((port) => p.listen.some((l) => l.endsWith(":" + port)))), "own ports (CDP/auth/web-capture) listening");
        checker.ok(per.every((p) => !p.exceptions), "zero unhandled exceptions");
        checker.ok(out.every((o) => !o.leftovers.length), "no leftover process after each round");
        checker.ok(out.every((o) => !o.watchPingFails), "primary responsive during the bursts");
        const boots = C.stats(per.map((p) => p.bootMs));
        rec.multi = { rounds, extras, bootMs: boots, watchPingMs: out.map((o) => o.watchPingMs), rssMB: C.stats(per.map((p) => p.rssMB)) };
        rec.notes = `parallel boot p50=${boots.p50} p95=${boots.p95} ms; primary ping p95 per round=${out.map((o) => o.watchPingMs.p95).join("/")} ms; wall=${out.map((o) => o.wallMs).join("/")} ms`;
      },
    },
    {
      name: "same-profile-two-instances",
      async fn({ checker, rec, instDir }) {
        const lock = await M.harnessLockProbe(1, 4);
        const app = await M.sameProfileTwice(1, 2);
        rec.evidence = C.writeJson(path.join(instDir, "same-profile.json"), { lock, app });
        checker.ok(/^REFUSED:[^:]+: inst-/.test(lock.sameDir), "harness refuses a 2nd launch on the SAME directory", lock.sameDir);
        checker.ok(/^REFUSED:[^:]+: slot-/.test(lock.sameSlot), "harness refuses a 2nd launch on the SAME port slot", lock.sameSlot);
        checker.ok(lock.firstAlive && !lock.leftovers.length, "lock-owning instance intact and shut down cleanly");
        checker.ok(app.firstAlive && app.firstScreen === "auth", "1st instance stays alive and on the same screen");
        checker.ok(app.firstTreeUnchanged, "1st instance process tree intact");
        checker.ok(app.secondInstance.exited || app.secondInstance.pageTargets === 0 || app.secondInstance.pageTargets == null, "2nd instance on the same userData does not open its own window", JSON.stringify(app.secondInstance));
        checker.ok(!app.leftovers.length, "no leftover process");
        rec.notes = `2nd: ${JSON.stringify(app.secondInstance)}; log B hints: ${JSON.stringify(app.secondLogHints)}; log A hints: ${JSON.stringify(app.firstLogHints)}; locks: ${JSON.stringify(app.lockFiles)}`;
      },
    },
    {
      name: "kill-9-and-fast-relaunch",
      async fn({ checker, rec, instDir }) {
        const r = await M.killRelaunch(3);
        rec.evidence = C.writeJson(path.join(instDir, "kill-relaunch.json"), r);
        const kills = r.rounds.filter((x) => x.mode === "SIGKILL");
        const term = r.rounds.find((x) => x.mode === "SIGTERM");
        checker.equal(r.rounds.length, 4, "3 fast relaunches after SIGKILL + 1 after SIGTERM");
        checker.ok(r.rounds.every((x) => !x.error && x.screen === "auth"), "app returns to the auth screen after each kill", JSON.stringify(r.rounds.map((x) => [x.screen, x.error])));
        checker.ok(r.rounds.every((x) => !x.exceptions && !x.crashHints.length), "no exception or sign of corruption after relaunch");
        checker.ok(term && term.localStorageKept, "graceful shutdown persists localStorage");
        checker.ok(kills.some((x) => x.localStorageKept), "some kill -9 preserves localStorage (after waiting)", JSON.stringify(kills.map((x) => [x.settleMs, x.localStorageKept])));
        checker.ok(!r.leftovers.length, "no leftover process");
        rec.killRelaunch = r.rounds.map((x) => ({ mode: x.mode, settleMs: x.settleMs, kept: x.localStorageKept, relaunchMs: x.relaunchMs }));
        rec.notes = `kill/settle->persisted: ${r.rounds.map((x) => `${x.mode}@${x.settleMs}ms=${x.localStorageKept}`).join(", ")}; relaunch ms: ${r.rounds.map((x) => x.relaunchMs).join("/")}`;
      },
    },
  ],
};
