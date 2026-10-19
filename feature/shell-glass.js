/*
 * RE-TEMPO · shell-glass (user MOD layer)
 * ---------------------------------------------------------------------------
 * Gives the canvas HUD's surfaces the portfolio header's glass. The work is
 * CSS (shell-glass.css), scoped under html.rtsg-on; this file only owns the
 * switch. Native vibrancy is out of reach (the preload exposes no setVibrancy
 * or transparent-window call and the main process is bytecode), so the glass is
 * drawn in the page: the header's fill and blur over the canvas behind each
 * surface.
 *
 * Off switch: localStorage.setItem("rtd.shellGlass", "off") (read live).
 * The shell's own black as glass is opt-in: localStorage["rtd.shellGlass.bg"] = "on".
 * Introspection: window.__RE_TEMPO_SHELL_GLASS__ (enabled, dispose).
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";
  if (window.__RE_TEMPO_SHELL_GLASS__?.dispose) window.__RE_TEMPO_SHELL_GLASS__.dispose();

  const KEY = "rtd.shellGlass";
  const CLS = "rtsg-on";
  const isOn = () => {
    try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
  };
  const BG_KEY = "rtd.shellGlass.bg";
  const BG_CLS = "rtsg-bg";
  const bgOn = () => {
    try { return localStorage.getItem(BG_KEY) === "on"; } catch { return false; }
  };
  const apply = () => {
    document.documentElement.classList.toggle(CLS, isOn());
    document.documentElement.classList.toggle(BG_CLS, bgOn());
  };
  const onStorage = (e) => { if (!e.key || e.key === KEY || e.key === BG_KEY) apply(); };

  apply();
  window.addEventListener("storage", onStorage);
  // Same-window changes do not fire "storage"; re-check on focus.
  window.addEventListener("focus", apply);

  window.__RE_TEMPO_SHELL_GLASS__ = {
    get enabled() { return document.documentElement.classList.contains(CLS); },
    dispose() {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", apply);
      document.documentElement.classList.remove(CLS, BG_CLS);
      delete window.__RE_TEMPO_SHELL_GLASS__;
    },
  };
})();
