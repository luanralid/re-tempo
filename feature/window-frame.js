/*
 * RE-TEMPO · window-frame (user MOD layer)
 * ---------------------------------------------------------------------------
 * Closes the frame of the central panel along the bottom of the window.
 *
 * The frame is NATIVE: the PanelGroup #workspace-main carries
 *   rounded-tl-[var(--radius-xl)] border-t border-l border-border-secondary
 * so only the top-left corner is rounded and there is no bottom or right
 * stroke; the left border just runs down to the window edge. The group is
 * the parent of the left / center / right panels, so every route that uses
 * the center panel (chat, canvas, docs) is covered at once.
 *
 * This mod only adds CSS (window-frame.css), scoped under html.rtwf-on:
 *   - an inset (--rtwf-inset, 8px) at the right and bottom of the window,
 *     applied as padding on the group's parent so it composes with the
 *     margin-left / width that project-sidebar sets on the group;
 *   - the missing right and bottom borders (same 0.5px stroke);
 *   - rounded bottom corners (and top-right) at --radius-xl, concentric to
 *     the window corner (window radius ~= inset + --radius-xl).
 * project-sidebar squares the bottom-left corner with !important on a
 * :has() selector; the rules here use #workspace-main to out-rank it, and
 * the state with the sidebar collapsed (html.rtps-collapsed) stays square on
 * the left, as that mod defines it.
 *
 * Off switch: localStorage.setItem("rtd.windowFrame", "off") (read live).
 * Introspection: window.__RE_TEMPO_WINDOW_FRAME__ (enabled, dispose).
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";
  if (window.__RE_TEMPO_WINDOW_FRAME__?.dispose) window.__RE_TEMPO_WINDOW_FRAME__.dispose();

  const KEY = "rtd.windowFrame";
  const CLS = "rtwf-on";
  const isOn = () => {
    try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
  };
  const apply = () => document.documentElement.classList.toggle(CLS, isOn());
  const onStorage = (e) => { if (!e.key || e.key === KEY) apply(); };

  apply();
  window.addEventListener("storage", onStorage);
  // Same-window changes do not fire "storage"; re-check on focus.
  window.addEventListener("focus", apply);

  window.__RE_TEMPO_WINDOW_FRAME__ = {
    get enabled() { return document.documentElement.classList.contains(CLS); },
    dispose() {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", apply);
      document.documentElement.classList.remove(CLS);
      delete window.__RE_TEMPO_WINDOW_FRAME__;
    },
  };
})();
