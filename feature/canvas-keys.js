/*
 * RE-TEMPO · canvas-keys (user MOD layer)
 * ---------------------------------------------------------------------------
 * Figma / Sketch style single-key shortcuts for the design canvas, ported
 * from pen.dev. Read against the RE-TEMPO build of 2026-10-14
 * (assets/index-D2Ui1vc0.js) on 2026-10-18: the app ALREADY implements most
 * of the map natively, so this mod only fills the gaps and never re-binds a
 * key the app owns (that would fire the action twice).
 *
 * Native in the app (not touched here; listed in the "?" sheet):
 *   V select, F frame (Div), R rectangle, T text, Shift+R/C/G row/column/grid,
 *   Esc deselect / exit tool, Cmd+D duplicate, arrows move the selected
 *   element or frame 1px and Shift+arrows 10px, Shift+1 zoom to fit,
 *   Shift+2 zoom to selection, Cmd+= / Cmd+- / Cmd+0 zoom (zoom.js shows the
 *   level toast; not touched).
 *
 * Added by this mod (each one triggers the app's own control, no store calls):
 *   C        Comment tool. Clicks the "Comment" button of the
 *            [role=toolbar][aria-label="Design tools"] bar (toggles, as the
 *            button does). Only exists when the app shows that button.
 *   Shift+0  Zoom to 100%. Opens the zoom menu (button "Zoom NN%") and clicks
 *            its "Zoom to 100%" item, the app's own action.
 *   ?        Shortcut sheet: a small card listing the canvas shortcuts
 *            (native + added). Esc, "?", a click outside or the close button
 *            dismiss it. "All app shortcuts" opens the app's full dialog
 *            (window event tempo:open-keyboard-shortcuts).
 *
 * Left out, because the app has no action for them (nothing to trigger):
 *   H        Hand tool: the toolbar has no Hand tool; the canvas pans with
 *            wheel / space-drag only.
 *   Cmd+G    Group: the app has no group / ungroup action.
 *
 * Guards: never fires with focus in an input, textarea, select, contenteditable,
 * Monaco / ProseMirror, the chat composer, a menu / listbox / dialog, while
 * composing (IME), on key repeat, with Cmd / Ctrl / Alt held (Shift only for
 * Shift+0 and "?"), or when the design toolbar is not visible (design route
 * with the canvas on screen only). Listener: window keydown, capture phase.
 * Flag off: localStorage "rtd.canvasKeys" = "off" (read on every key).
 * Introspection: window.__RE_TEMPO_CANVAS_KEYS__ (enabled, active, sheetOpen,
 * last, open(), close(), dispose()).
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (window.__RE_TEMPO_CANVAS_KEYS__?.dispose) window.__RE_TEMPO_CANVAS_KEYS__.dispose(); // double injection

  const FLAG = "rtd.canvasKeys";
  const TOOLBAR = '[role="toolbar"][aria-label="Design tools"]';
  const ZOOM_TRIGGER = 'button[aria-label^="Zoom "][aria-label$="%"]';
  const EDITABLE = [
    ".monaco-editor",
    ".ProseMirror",
    "input:not([type='button']):not([type='submit']):not([type='checkbox']):not([type='radio'])",
    "textarea",
    "select",
    "[contenteditable]:not([contenteditable='false'])",
    '[data-testid="chat-input-textarea"]',
    '[data-testid="comment-thread-reply-input"]',
  ].join(", ");
  const OVERLAY = '[role="menu"], [role="listbox"], [role="dialog"]:not([data-rtck-sheet])';
  const IS_MAC = /mac/i.test(navigator.platform || navigator.userAgent || "");
  const MOD = IS_MAC ? "⌘" : "Ctrl";
  const SHIFT = IS_MAC ? "⇧" : "Shift";

  const state = { last: null, sheet: null, disposed: false, zoomBusy: false };

  const enabled = () => {
    try {
      return localStorage.getItem(FLAG) !== "off";
    } catch (_) {
      return true;
    }
  };

  const visible = (n) => !!n && n.isConnected && n.getClientRects().length > 0 && n.getBoundingClientRect().width > 0;
  const toolbar = () => {
    for (const t of document.querySelectorAll(TOOLBAR)) if (visible(t)) return t;
    return null;
  };
  const inEditable = (n) => !!(n && typeof n.closest === "function" && n.closest(EDITABLE));
  const inOverlay = (n) => !!(n && typeof n.closest === "function" && n.closest(OVERLAY));

  // "ok" or the reason the key must be left alone.
  function gate(e) {
    if (!enabled()) return "flag-off";
    if (e.defaultPrevented) return "default-prevented";
    if (e.isComposing || e.repeat) return "composing-or-repeat";
    if (e.metaKey || e.ctrlKey || e.altKey) return "modifier";
    const t = e.target, a = document.activeElement;
    if (inEditable(t) || inEditable(a)) return "editable-focus";
    if (inOverlay(t) || inOverlay(a)) return "overlay-focus";
    if (!toolbar()) return "no-canvas";
    return "ok";
  }

  // ------------------------------------------------------------------ actions
  function commentTool() {
    const tb = toolbar();
    const b = tb && tb.querySelector('button[aria-label="Comment"]');
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }

  // Zoom to 100%: the item of the zoom menu (popover), clicked through its trigger.
  function zoom100() {
    if (state.zoomBusy) return false;
    const trigger = document.querySelector(ZOOM_TRIGGER);
    if (!visible(trigger)) return false;
    const find = () =>
      [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Zoom to 100%") && visible(b));
    if (find()) {
      find().click();
      return true;
    }
    state.zoomBusy = true;
    trigger.click();
    let tries = 0;
    const poll = () => {
      const item = find();
      if (item) {
        item.click();
        state.zoomBusy = false;
      } else if (++tries < 20 && !state.disposed) setTimeout(poll, 25);
      else state.zoomBusy = false;
    };
    setTimeout(poll, 0);
    return true;
  }

  // -------------------------------------------------------------------- sheet
  const GROUPS = [
    {
      title: "Tools",
      rows: [
        ["V", "Select"],
        ["F", "Frame"],
        ["R", "Rectangle"],
        ["T", "Text"],
        ["C", "Comment"],
        [`${SHIFT} R / C / G`, "Row / Column / Grid"],
      ],
    },
    {
      title: "Selection",
      rows: [
        ["Esc", "Deselect / exit tool"],
        [`${MOD} D`, "Duplicate"],
        ["← ↑ → ↓", "Move 1 px"],
        [`${SHIFT} ← ↑ → ↓`, "Move 10 px"],
      ],
    },
    {
      title: "View",
      rows: [
        [`${SHIFT} 1`, "Zoom to fit"],
        [`${SHIFT} 2`, "Zoom to selection"],
        [`${SHIFT} 0`, "Zoom to 100%"],
        [`${MOD} =  /  ${MOD} −`, "Zoom in / out"],
        ["?", "This sheet"],
      ],
    },
  ];

  const mk = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  function openSheet() {
    if (state.sheet) return true;
    const root = mk("div", "rtck-sheet");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Canvas shortcuts");
    root.setAttribute("data-rtck-sheet", "");
    const head = mk("div", "rtck-head");
    head.appendChild(mk("span", "rtck-title", "Canvas shortcuts"));
    const x = mk("button", "rtck-close", "×");
    x.type = "button";
    x.setAttribute("aria-label", "Close");
    x.addEventListener("click", closeSheet);
    head.appendChild(x);
    root.appendChild(head);
    for (const g of GROUPS) {
      const sec = mk("div", "rtck-group");
      sec.appendChild(mk("div", "rtck-gtitle", g.title));
      for (const [keys, label] of g.rows) {
        const row = mk("div", "rtck-row");
        row.appendChild(mk("span", "rtck-label", label));
        row.appendChild(mk("kbd", "rtck-keys", keys));
        sec.appendChild(row);
      }
      root.appendChild(sec);
    }
    const all = mk("button", "rtck-all", "All app shortcuts");
    all.type = "button";
    all.addEventListener("click", () => {
      closeSheet();
      window.dispatchEvent(new Event("tempo:open-keyboard-shortcuts"));
    });
    root.appendChild(all);
    document.body.appendChild(root);
    state.sheet = root;
    document.addEventListener("pointerdown", onOutside, true);
    return true;
  }
  function closeSheet() {
    if (!state.sheet) return false;
    state.sheet.remove();
    state.sheet = null;
    document.removeEventListener("pointerdown", onOutside, true);
    return true;
  }
  function onOutside(e) {
    if (state.sheet && !state.sheet.contains(e.target)) closeSheet();
  }

  // ----------------------------------------------------------------- listener
  function onKey(e) {
    if (state.disposed) return;
    // Esc closes the sheet first, whatever has focus (unless the flag is off).
    if (e.key === "Escape" && state.sheet && enabled()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeSheet();
      state.last = { key: "Escape", action: "sheet-close", t: Date.now() };
      return;
    }
    const g = gate(e);
    let action = null;
    if (g === "ok") {
      if (e.shiftKey && e.code === "Digit0") action = "zoom-100";
      else if (e.key === "?") action = state.sheet ? "sheet-close" : "sheet-open";
      else if (!e.shiftKey && (e.key === "c" || e.key === "C")) action = "comment";
    }
    if (!action) {
      state.last = { key: e.key, action: null, reason: g, t: Date.now() };
      return;
    }
    let done = false;
    if (action === "comment") done = commentTool();
    else if (action === "zoom-100") done = zoom100();
    else if (action === "sheet-open") done = openSheet();
    else if (action === "sheet-close") done = closeSheet();
    state.last = { key: e.key, action, done, t: Date.now() };
    if (done) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }
  window.addEventListener("keydown", onKey, true);

  window.__RE_TEMPO_CANVAS_KEYS__ = {
    get enabled() {
      return enabled();
    },
    get active() {
      return !!toolbar();
    },
    get sheetOpen() {
      return !!state.sheet;
    },
    get last() {
      return state.last;
    },
    open: openSheet,
    close: closeSheet,
    dispose() {
      state.disposed = true;
      closeSheet();
      window.removeEventListener("keydown", onKey, true);
      delete window.__RE_TEMPO_CANVAS_KEYS__;
    },
  };
})();
