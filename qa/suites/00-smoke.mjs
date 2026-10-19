// qa/suites/00-smoke.mjs — RE-TEMPO boot smoke.
// -----------------------------------------------------------------------------
// Proves the instance starts, renders the UI and does not blow up the console. Since
// Phase A runs LOGGED OUT (empty profile), the screen may be home, auth or onboarding:
// the test DETECTS the screen and adapts the asserts, recording everything. Enumerates
// sidebar/nav items, collects console/exceptions/network, takes a screenshot and measures boot.
//
// Suite contract: default = { name, tests: [{ name, async fn(ctx) }] }.
// ctx = { instance, page, collectors, checker, runDir, instDir, lib, rec }.

export default {
  name: "00-smoke",
  tests: [
    {
      name: "boot-and-render",
      async fn(ctx) {
        const { page, checker, instance, collectors, rec, lib, instDir } = ctx;
        const { ui, perfMetrics } = lib;

        // 1) Boot happened (measured by the launcher). bootMs = spawn -> UI via CDP.
        checker.truthy(instance.bootMs > 0, "boot until UI reachable via CDP (>0ms)");
        rec.bootMs = instance.bootMs;
        rec.bootDevtoolsMs = instance.bootDevtoolsMs;
        rec.bootTargetMs = instance.bootTargetMs;

        // 2) The UI rendered some content.
        const text = await ui.bodyText(page);
        checker.ok(text.trim().length > 0, "renderer produced visible text", `len=${text.trim().length}`);

        // 3) Detect the screen (home / auth / onboarding / unknown).
        const screen = await ui.detectScreen(page);
        rec.screen = screen;
        checker.includes(["home", "auth", "onboarding", "unknown"], screen, "screen classified");

        // If it is the home, check the elements expected by the brief.
        if (screen === "home") {
          const low = text.toLowerCase();
          checker.ok(low.includes("let's do it") || low.includes("lets do it") || low.includes("generate"),
            "home exposes main action (Generate / Let's do it)");
          const anchors = ["open folder", "import project"].filter((a) => low.includes(a));
          checker.ok(anchors.length > 0, "home exposes project actions", `seen=${JSON.stringify(anchors)}`);
        } else {
          rec.notes = `logged-out instance rendered screen '${screen}' (expected in Phase A without login)`;
        }

        // 4) Enumerate sidebar/nav items and record them.
        const sidebar = await ui.enumerateSidebar(page);
        rec.sidebar = sidebar;
        checker.truthy(Array.isArray(sidebar), "sidebar/nav enumeration ran");

        // 5) Console/exceptions: no FATAL error (unhandled exceptions = 0).
        const errors = collectors.consoleErrors.length;
        const warnings = collectors.consoleWarnings.length;
        const exceptions = collectors.exceptions.length;
        rec.consoleErrors = errors;
        rec.consoleWarnings = warnings;
        rec.exceptions = exceptions;
        checker.equal(exceptions, 0, "no unhandled exception in the renderer");

        // 6) Renderer performance metrics.
        rec.perf = await perfMetrics(page);
        checker.truthy(rec.perf != null, "performance metrics collected");

        // 7) Network summary (contacted domains, read-only).
        rec.network = collectors.networkSummary();

        // 8) Screenshot of the main page.
        const shot = await ui.screenshot(page, instDir, `smoke-${instance.id}`);
        if (shot) rec.screenshots.push(shot);
        checker.truthy(shot, "screenshot saved");
      },
    },
  ],
};
