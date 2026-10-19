// qa/suites/01-smoke-logged-in.mjs — boot smoke on a LOGGED-IN PROFILE (qa-N).
// -----------------------------------------------------------------------------
// Run with a persistent profile created by login.mjs:
//   node run.mjs --suite 01-smoke-logged-in --profiles qa-1,qa-2,qa-3
// Requires the 'home' screen (fails if it lands on auth: session expired -> redo the login),
// measures the LOGGED-IN boot (spawn -> home), checks the home actions, enumerates the
// sidebar, collects console/exceptions/network/perf and takes a screenshot. Read-only.
// Screenshot and report contain account data: they stay local in /tmp (0700).
import { maskEmail } from "../lib/session.mjs";

export default {
  name: "01-smoke-logged-in",
  tests: [
    {
      name: "boot-logged-in-home",
      async fn(ctx) {
        const { page, checker, instance, collectors, rec, lib, instDir } = ctx;
        const { ui, perfMetrics } = lib;

        // 1) Boot until the UI via CDP (launcher) and until the logged-in HOME (spawn -> home).
        rec.bootDevtoolsMs = instance.bootDevtoolsMs;
        rec.bootTargetMs = instance.bootTargetMs;
        // Stops at a stable 'home' OR 'auth' (4 s): logged out fails fast, without
        // waiting for the whole timeout.
        const seen = await ui.waitForScreen(page, ["home", "auth"], { timeoutMs: 120000, stableMs: 4000 });
        rec.screen = seen.screen;
        rec.bootHomeMs = seen.screen === "home" ? seen.firstSeenAt - instance.startedAtMs : null;
        rec.bootMs = rec.bootHomeMs ?? instance.bootMs; // in the report, "Boot" = spawn -> logged-in home
        checker.equal(seen.screen, "home", "profile boots LOGGED IN on home (not on the auth screen)");
        if (seen.screen === "auth") rec.notes = "logged-out profile (no login or expired/revoked session): run login.mjs --only " + instance.id;

        // 2) Home actions.
        const low = (await ui.bodyText(page)).toLowerCase();
        checker.ok(low.includes("generate"), "home exposes Generate");
        const anchors = ["open folder", "import project"].filter((a) => low.includes(a));
        checker.ok(anchors.length > 0, "home exposes project actions", `seen=${JSON.stringify(anchors)}`);

        // 3) Sidebar/nav and visible identity (email masked in the report).
        rec.sidebar = await ui.enumerateSidebar(page);
        checker.ok(rec.sidebar.length > 0, "sidebar/nav has items", `n=${rec.sidebar.length}`);
        const ident = await ui.readVisibleIdentity(page);
        rec.identity = { email: maskEmail(ident.emails[0]) || null, org: ident.orgs[0] || null, avatar: ident.avatars[0] || null };

        // 4) No unhandled exception; console/network/perf recorded.
        rec.consoleErrors = collectors.consoleErrors.length;
        rec.consoleWarnings = collectors.consoleWarnings.length;
        rec.exceptions = collectors.exceptions.length;
        checker.equal(rec.exceptions, 0, "no unhandled exception in the renderer");
        rec.perf = await perfMetrics(page);
        checker.truthy(rec.perf != null, "performance metrics collected");
        rec.network = collectors.networkSummary();

        // 5) Screenshot.
        const shot = await ui.screenshot(page, instDir, `smoke-logged-in-${instance.id}`);
        if (shot) rec.screenshots.push(shot);
        checker.truthy(shot, "screenshot saved");
      },
    },
  ],
};
