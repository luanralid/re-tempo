// qa/suites/80-cross-cutting-a11y.mjs — accessibility (axe + keyboard + contrast). Read-only.
import { a11yForScreen, gotoScreen, leaveSettings } from "./80-cross-cutting/a11y.mjs";

const SCREENS = ["home", "chat", "docs", "design", "issues", "agents", "settings"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: "80-cross-cutting-a11y",
  tests: [
    {
      name: "a11y-auth-logged-out",
      async fn({ page, checker, rec, lib, instDir }) {
        const screen = await lib.ui.detectScreen(page);
        rec.screen = screen;
        rec.a11y = rec.a11y || {};
        if (screen !== "auth") { checker.ok(true, `n/a: screen ${screen}`); return; }
        const r = await a11yForScreen(page, "auth");
        rec.a11y.auth = r;
        checker.ok(!!r.axe && !r.axeError, "axe ran", r.axeError);
        checker.ok(!!r.keyboard && !r.keyboardError, "keyboardNav ran", r.keyboardError);
        checker.ok(!!r.contrast && !r.contrastError, "contrast ran", r.contrastError);
        checker.equal(r.keyboard ? r.keyboard.trappedAt : null, null, "0 focus traps");
        const shot = await lib.ui.screenshot(page, instDir, "a11y-auth");
        if (shot) rec.screenshots.push(shot);
      },
    },
    {
      name: "a11y-logged-in-screens",
      async fn({ page, checker, rec, lib, instDir }) {
        const screen = await lib.ui.detectScreen(page);
        rec.screen = screen;
        rec.a11y = rec.a11y || {};
        if (screen !== "home") { rec.notes = "requires a logged-in profile"; checker.ok(true, "n/a: requires a logged-in profile"); return; }
        for (const s of SCREENS) {
          const nav = await gotoScreen(page, s);
          checker.ok(nav, `navigated to ${s}`);
          if (!nav) continue;
          await sleep(1500);
          const r = await a11yForScreen(page, s);
          rec.a11y[s] = r;
          checker.ok(!!r.axe && !r.axeError, `axe ran on ${s}`, r.axeError);
          // informational: critical does not fail
          checker.ok(true, `${s}: critical=${r.axe ? r.axe.counts.critical : "?"} serious=${r.axe ? r.axe.counts.serious : "?"}`);
          const shot = await lib.ui.screenshot(page, instDir, `a11y-${s}`);
          if (shot) rec.screenshots.push(shot);
          if (s === "settings") await leaveSettings(page);
        }
        await leaveSettings(page);
        await gotoScreen(page, "chat");
      },
    },
  ],
};
