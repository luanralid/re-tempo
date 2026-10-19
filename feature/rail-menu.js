/*
 * RE-TEMPO · rail-menu (user mod layer)
 * ---------------------------------------------------------------------------
 * One account menu. The Settings gear leaves the UI (title bar and rail) and
 * its entries move into the avatar's menu: a click on the avatar opens the
 * app's own User menu (name, email, Profile, Sign Out) with "Settings…"
 * (Cmd+,), "Help ›" and "Report a bug" (Cmd+Shift+B) added to it, like the
 * account menu of a native app (mods cannot reach Electron's menu).
 *
 * Rail footer (renderer bundle index-D2Ui1vc0.js, frozen copy):
 *   - The navbar (LDa, displayName "Navbar") renders the shared rail eEe with
 *     testId "workspace-navbar", showHelp:false, showSettings:true,
 *     onSettings: () => onRouteChange("settings") and an `aboveSettings`
 *     column <div class="flex flex-col items-center gap-4"> holding:
 *       - the process memory tracker (only with the debug flag),
 *       - button[data-testid="bug-report-button"][aria-label="Report a bug"]
 *         (onClick: onBugReportClick, the same handler as Cmd+Shift+B),
 *       - aDa: a Base UI Menu whose trigger is
 *         [data-testid="help-menu-button"][aria-label="Help"] (items: Keyboard
 *         Shortcuts, Documentation, Community; side right, align end).
 *   - Then the settings column: button[aria-label="Settings"] (no testid,
 *     onClick: onSettings). Cmd+, opens the same route (F3("preferences")),
 *     and the app's shortcut table lists "Open settings Cmd+," and
 *     "Report a bug Cmd+Shift+B".
 *   - Then the avatar: [aria-label="User menu"], a Base UI Menu trigger. Its
 *     popup (Jv: side right, align end, sideOffset 8, portalled to <body>) is
 *     [role="menu"][aria-labelledby=<trigger id>] holding a header div (name +
 *     email) and one item, "Sign Out" (Yv; class from Gv, highlighted with
 *     data-highlighted). profile-page.js adds "Profile" before "Sign Out".
 *   - usage-bar.js mounts its rings + separator inside the aboveSettings
 *     column, right before the bug button; they stay where they are.
 *   - project-sidebar.js mirrors the gear and the avatar in the title bar
 *     (.rtps-titlebar-tools [data-act="settings"|"account"]); its avatar calls
 *     openUserMenu(itself), its gear open(itself).
 *
 * What this mod does:
 *   - CSS (rail-menu.css, gated by html.rtrm-on) hides the rail's bug, help
 *     and Settings buttons and the title bar gear with display:none. The nodes
 *     stay in the DOM: .click() on them still works and other mods use it
 *     (profile-page, app-map, voice-input). The gear is no longer intercepted:
 *     a programmatic click on it opens Settings.
 *   - Injection: a MutationObserver on <body> (direct children: the portals)
 *     finds the User menu popup as it mounts, before it is painted, and adds
 *     our items before the first native item: "Settings…" (shortcut chips),
 *     "Help" (chevron), separator, "Report a bug" (chips), separator. Items
 *     copy the class of the native item, so type, padding, radius, colors
 *     and theme are the app's; the separator mirrors the app's (Qv: my-1
 *     -mx-1.5 h-px bg-menu-divider). Whoever opened the menu (rail avatar,
 *     title bar avatar, open()/openUserMenu()), the popup is the same one.
 *   - Our items are not in Base UI's item list (its keyboard list is fixed),
 *     so while the popup carries them this mod drives the highlight and the
 *     keys for the whole list:
 *       - highlight: popup[data-rtrm-hl] + item[data-rtrm-current]; the CSS
 *         paints only the current item (the native data-highlighted, which
 *         Base UI leaves on its last active item, is muted). Pointer over an
 *         item makes it current and focuses it, leaving the items clears it.
 *       - ArrowDown/ArrowUp (looping), Home/End, first letter: move over all
 *         items (ours, the native ones, Profile) and focus the target, which
 *         syncs Base UI's own active item when it is native.
 *       - Enter/Space: ours run their action; any other item (the native
 *         ones, Profile) gets a .click(), so the highlighted item is the one
 *         that runs whatever Base UI thinks is active. With nothing
 *         highlighted Enter/Space do nothing, so a stray Enter never hits
 *         "Sign Out".
 *       - ArrowRight on "Help" opens it. Esc, Tab and ArrowLeft stay native:
 *         Esc closes and Base UI hands focus back to the trigger; when the
 *         focused item was one of ours (it leaves with the popup, focus
 *         falls on <body>), focus goes back to the avatar the menu came from.
 *       - Cmd/Ctrl/Alt shortcuts (Cmd+, / Cmd+Shift+B ...) close the menu and
 *         go through to the app.
 *     Opening: a keyboard open (Enter/Space/ArrowDown on the avatar, or the
 *     title bar avatar activated from the keyboard) highlights the first item
 *     ("Settings…"); a pointer open highlights nothing (Base UI would leave
 *     "Sign Out" highlighted after a programmatic open).
 *   - Picking an item closes the popup (a click on its trigger, else a
 *     synthetic Escape) and then acts, deferred so the native menus and
 *     dialogs do not see the current event as an outside press:
 *       - settings: .click() on the rail gear (native Settings),
 *       - bug: .click() on the rail bug button (the Cmd+Shift+B handler),
 *       - help: once the popup is gone, the native Help menu opens anchored
 *         to the avatar the menu came from (submenu-like).
 *
 * Anchoring native popups (title bar avatar, Help):
 *   With the sidebar expanded (and, with project-sidebar, collapsed too) the
 *   whole rail is display:none (html.rtps-on.rtps-rail-hidden). A Base UI
 *   trigger with no box would open its popup at 0,0, so while a native popup
 *   opened by this mod is up, its trigger is laid out as an invisible fixed
 *   box (opacity 0, no pointer events, still focusable) over the anchor
 *   (html.rtrm-user-anchor / rtrm-help-anchor) and html.rtrm-anchoring lays a
 *   display:none rail out as a 0x0 fixed, hidden, untransformed box (no
 *   effect on the page layout). Ancestors with a transform (the rail keeps
 *   navbar-rail-settle, fill "both") become the containing block of fixed
 *   children: the box position is measured and corrected. With the rail
 *   visible, the avatar's slot is kept by a ::after of the same size so the
 *   footer does not reflow. When the popup closes (polled, plus a grace
 *   period for the exit animation), focus goes back to the anchor when it
 *   would otherwise be lost (Esc returns it to the title bar avatar), and the
 *   trigger is hidden again. A press on the external anchor while its menu is
 *   up closes it, and the open call that the same click makes is swallowed,
 *   so the anchor toggles like a native menu trigger.
 *
 * Introspection: window.__RE_TEMPO_RAIL_MENU__ with
 *   - openUserMenu(anchorEl): the account menu, laid over anchorEl (an element
 *     outside the rail) or, without one, at the rail avatar;
 *   - open([anchorEl]): the same menu (kept for callers of the old gear
 *     menu); without anchorEl it opens at the rail avatar when the rail is
 *     visible, else at the first visible avatar outside it;
 *   - close(), toggle([anchorEl]), run("settings" | "help" | "bug") (acts
 *     like picking that item; closes the menu first if it is open),
 *     refresh(), dispose() and the `state` getter.
 *   open()/openUserMenu() return true when handled, false when the native
 *   avatar is missing; a second call while open is a no-op. Loading the
 *   script twice disposes the first copy (one set of listeners).
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  const previous = window.__RE_TEMPO_RAIL_MENU__;
  if (previous && typeof previous.dispose === "function") {
    try {
      previous.dispose();
    } catch (_) {}
  }

  const RAIL = '[data-testid="workspace-navbar"]';
  const GEAR = `${RAIL} button[aria-label="Settings"]`;
  const HELP = `${RAIL} [data-testid="help-menu-button"]`;
  const BUG = `${RAIL} [data-testid="bug-report-button"]`;
  const AVATAR = `${RAIL} [aria-label="User menu"]`;
  const ANY_AVATAR = '[aria-label="User menu"]';

  const ON_CLASS = "rtrm-on";
  const HELP_ANCHOR_CLASS = "rtrm-help-anchor";
  const USER_ANCHOR_CLASS = "rtrm-user-anchor";
  const RAIL_ANCHOR_CLASS = "rtrm-anchoring";
  const ITEM_ATTR = "data-rtrm-item"; // our injected nodes (items and separators)
  const POPUP_ATTR = "data-rtrm-hl"; // a User menu popup driven by this mod
  const CURRENT_ATTR = "data-rtrm-current";
  const TICK_MS = 1000;
  const NATIVE_POLL_MS = 100;
  const NATIVE_OPEN_WAIT_MS = 1000;
  const NATIVE_CLOSE_GRACE_MS = 200; // lets the native exit animation finish before un-anchoring
  const PRESS_GUARD_MS = 800; // window for the click that follows a press on an external anchor
  const OPEN_SETTLE_MS = 250; // Base UI moves the initial focus within this window
  const PENDING_OPEN_MS = 1000;
  const PORTAL_WATCH_MS = 1500;
  const GONE_WAIT_MS = 400;
  const ESC_FOCUS_WAIT_MS = 800; // the popup's exit animation, with margin
  const ANCHOR_VARS = ["left", "top", "width", "height", "slot-width", "slot-height"];

  const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  const IS_MAC = /Mac/i.test(platform);
  const MOD = IS_MAC ? "Meta" : "Control";

  const ITEMS = {
    settings: {
      label: "Settings…",
      keys: IS_MAC ? ["⌘", ","] : ["Ctrl", ","],
      aria: `${MOD}+,`,
    },
    help: { label: "Help", submenu: true },
    bug: {
      label: "Report a bug",
      keys: IS_MAC ? ["⌘", "⇧", "B"] : ["Ctrl", "Shift", "B"],
      aria: `${MOD}+Shift+B`,
    },
  };

  const CHEVRON =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m9 18 6-6-6-6"/></svg>';

  const html = document.documentElement;
  const SELF_SRC = (document.currentScript && document.currentScript.src) || "";

  let disposed = false;
  let native = null; // anchored native popup: { kind: "help" | "user", anchor, external, forced, placed, seenOpen }
  let nativeTimer = 0;
  let pressGuard = null; // { el, at }: a press on an external anchor closed its menu
  let pendingOpen = null; // { focus: "first" | "menu", at }: set by openUserMenu() for the popup about to mount
  let live = null; // the injected popup: { popup, at, mode, touched, timers }
  let raf = 0;
  let timer = 0;
  let cssLink = null;
  let syncs = 0;
  let opens = 0;
  let injections = 0;
  let lastAction = null;
  const listeners = [];
  const portalWatches = new Set();

  const record = (action, extra) => {
    lastAction = { action, at: Date.now(), ...(extra || {}) };
    return lastAction;
  };

  const findGear = () => document.querySelector(GEAR);
  const findHelp = () => document.querySelector(HELP);
  const findBug = () => document.querySelector(BUG);
  const findAvatar = () => document.querySelector(AVATAR);
  const nativeBtn = (kind) => (kind === "help" ? findHelp() : findAvatar());
  const inRail = (el) => !!(el && el.closest(RAIL));
  const rendered = (el) => !!(el && el.isConnected && el.getClientRects().length);
  const isReactNode = (el) => Object.keys(el).some((k) => k.startsWith("__reactProps$") || k.startsWith("__reactFiber$"));

  // The first visible avatar: the rail's, else one outside it (project-sidebar's title bar copy).
  function defaultAnchor() {
    const a = findAvatar();
    if (rendered(a)) return a;
    return [...document.querySelectorAll(ANY_AVATAR)].find((el) => !inRail(el) && !el.closest('[role="menu"]') && rendered(el)) || null;
  }

  function focusEl(el) {
    if (!el || !el.isConnected) return;
    try {
      el.focus({ preventScroll: true });
    } catch (_) {
      el.focus();
    }
  }

  // index.html normally links rail-menu.css (data-rar-css, hot-swapped by the
  // live reload). Without that link, load it next to this script.
  function ensureCss() {
    if (document.querySelector('link[rel="stylesheet"][href*="rail-menu.css"]')) return;
    if (!SELF_SRC || !/\.js(\?|#|$)/.test(SELF_SRC)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = SELF_SRC.replace(/\.js(?=\?|#|$)/, ".css");
    link.setAttribute("data-rar-css", "");
    link.setAttribute("data-rtrm-css", "");
    (document.head || html).appendChild(link);
    cssLink = link;
  }

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    listeners.push([target, type, fn, opts]);
  }

  // ------------------------------------------------------- the User menu popup
  const nativeIsOpen = (btn) =>
    !!btn && (btn.getAttribute("aria-expanded") === "true" || btn.hasAttribute("data-popup-open"));

  const triggerOf = (popup) => {
    const id = popup && popup.getAttribute("aria-labelledby");
    return id ? document.getElementById(id) : null;
  };

  function isUserPopup(el) {
    if (!el || el.getAttribute("role") !== "menu") return false;
    const t = triggerOf(el);
    return !!t && t.matches(AVATAR);
  }

  const popupOpen = (popup) => !!popup && popup.isConnected && popup.hasAttribute("data-open") && !popup.hasAttribute("data-ending-style");

  function findUserPopup(root) {
    const scope = root || document;
    if (scope instanceof Element && isUserPopup(scope)) return scope;
    for (const m of scope.querySelectorAll('[role="menu"][aria-labelledby]')) if (isUserPopup(m)) return m;
    return null;
  }

  function livePopup() {
    return live && popupOpen(live.popup) && live.popup.querySelector(`[${ITEM_ATTR}]`) ? live.popup : null;
  }

  // ------------------------------------------------------------------ items
  function shortcut(keys) {
    const wrap = document.createElement("span");
    wrap.className = "rtrm-shortcut";
    wrap.setAttribute("aria-hidden", "true");
    keys.forEach((k, i) => {
      if (i > 0 && !IS_MAC) {
        const plus = document.createElement("span");
        plus.className = "rtrm-plus";
        plus.textContent = "+";
        wrap.append(plus);
      }
      const kbd = document.createElement("kbd");
      kbd.className = "rtrm-kbd";
      kbd.textContent = k;
      wrap.append(kbd);
    });
    return wrap;
  }

  // The native item's class (Gv), without what other mods add to their copies.
  function nativeItemClass(popup) {
    const it = [...popup.querySelectorAll('[role="menuitem"]')].find((el) => isReactNode(el));
    if (!it) return "";
    return [...it.classList].filter((c) => !/^rt[a-z]*-/.test(c)).join(" ");
  }

  function buildItem(id, cls) {
    const def = ITEMS[id];
    const it = document.createElement("div");
    it.className = cls ? `${cls} rtrm-inj` : "rtrm-item";
    it.id = `rtrm-item-${id}`;
    it.setAttribute("role", "menuitem");
    it.setAttribute(ITEM_ATTR, id);
    it.tabIndex = -1;
    const label = document.createElement("span");
    label.className = "rtrm-label";
    label.textContent = def.label;
    it.append(label);
    if (def.keys) {
      it.append(shortcut(def.keys));
      it.setAttribute("aria-keyshortcuts", def.aria);
    }
    if (def.submenu) {
      it.setAttribute("aria-haspopup", "menu");
      const chev = document.createElement("span");
      chev.className = "rtrm-chevron";
      chev.innerHTML = CHEVRON;
      it.append(chev);
    }
    return it;
  }

  function buildSep() {
    const sep = document.createElement("div");
    sep.className = "rtrm-sep";
    sep.setAttribute("role", "separator");
    sep.setAttribute(ITEM_ATTR, "sep");
    return sep;
  }

  const menuItems = (popup) =>
    [...popup.querySelectorAll('[role="menuitem"]')].filter(
      (el) => el.closest('[role="menu"]') === popup && !el.hasAttribute("data-disabled") && el.getAttribute("aria-disabled") !== "true"
    );

  const currentItem = (popup) => popup.querySelector(`[${CURRENT_ATTR}]`);
  const itemId = (el) => (el ? el.getAttribute(ITEM_ATTR) || (el.textContent || "").trim() : null);

  // The only highlight painted while the popup is ours (see rail-menu.css).
  function setCurrent(popup, it, focus) {
    for (const el of popup.querySelectorAll(`[${CURRENT_ATTR}]`)) {
      if (el === it) continue;
      el.removeAttribute(CURRENT_ATTR);
      if (el.hasAttribute(ITEM_ATTR)) el.removeAttribute("data-highlighted");
    }
    if (it) {
      it.setAttribute(CURRENT_ATTR, "");
      if (it.hasAttribute(ITEM_ATTR)) it.setAttribute("data-highlighted", "");
      if (focus !== false && document.activeElement !== it) focusEl(it);
    } else if (focus !== false && popup.contains(document.activeElement) && document.activeElement !== popup) {
      focusEl(popup);
    }
  }

  function moveBy(popup, delta, absolute) {
    const items = menuItems(popup);
    if (!items.length) return;
    const n = items.length;
    let i;
    if (absolute != null) i = absolute < 0 ? n - 1 : absolute;
    else {
      const cur = items.indexOf(currentItem(popup) || document.activeElement);
      i = cur < 0 ? (delta > 0 ? 0 : n - 1) : (((cur + delta) % n) + n) % n;
    }
    setCurrent(popup, items[i], true);
  }

  function inject(popup) {
    if (disposed || !popup || popup.querySelector(`[${ITEM_ATTR}]`)) return false;
    const cls = nativeItemClass(popup);
    const block = [buildItem("settings", cls)];
    if (findHelp()) block.push(buildItem("help", cls));
    if (findBug()) block.push(buildSep(), buildItem("bug", cls));
    const first = menuItems(popup)[0] || null;
    if (first) block.push(buildSep()); // our group, then the account items
    const parent = first ? first.parentElement : popup;
    for (const el of block) parent.insertBefore(el, first);
    popup.setAttribute(POPUP_ATTR, "");
    popup.addEventListener("pointermove", onPopupPointerMove);
    popup.addEventListener("pointerleave", onPopupPointerLeave);
    popup.addEventListener("click", onPopupClick);
    popup.addEventListener("focusin", onPopupFocusIn);
    const pend = pendingOpen && Date.now() - pendingOpen.at < PENDING_OPEN_MS ? pendingOpen : null;
    pendingOpen = null;
    if (live && live.popup !== popup) forgetLive();
    live = { popup, at: Date.now(), mode: pend ? pend.focus : null, touched: false, timers: [] };
    injections++;
    applyOpenFocus();
    // Base UI moves its initial focus a little later: apply the policy again until the user acts.
    live.timers.push(requestAnimationFrame(() => applyOpenFocus()));
    for (const ms of [60, 160]) live.timers.push(setTimeout(applyOpenFocus, ms));
    record("inject", { mode: live.mode, items: menuItems(popup).map(itemId) });
    return true;
  }

  function forgetLive() {
    if (!live) return;
    for (const t of live.timers) {
      clearTimeout(t);
      cancelAnimationFrame(t);
    }
    live = null;
  }

  // Keyboard open -> first item; pointer open -> nothing highlighted.
  function applyOpenFocus() {
    if (!live || live.touched || !popupOpen(live.popup)) return;
    const popup = live.popup;
    if (live.mode == null) {
      const ae = document.activeElement;
      // Base UI focuses its first item only after a keyboard open
      if (ae && ae !== popup && popup.contains(ae) && ae.getAttribute("role") === "menuitem" && !ae.hasAttribute(ITEM_ATTR)) live.mode = "first";
      else return;
    }
    if (live.mode === "first") {
      const first = menuItems(popup)[0];
      if (first && currentItem(popup) !== first) setCurrent(popup, first, true);
      else if (first && document.activeElement !== first) focusEl(first);
    } else {
      if (currentItem(popup)) setCurrent(popup, null, false);
      if (popup.contains(document.activeElement) && document.activeElement !== popup) focusEl(popup);
    }
  }

  function removeInjected(popup) {
    if (!popup) return;
    for (const el of popup.querySelectorAll(`[${ITEM_ATTR}]`)) el.remove();
    for (const el of popup.querySelectorAll(`[${CURRENT_ATTR}]`)) el.removeAttribute(CURRENT_ATTR);
    popup.removeAttribute(POPUP_ATTR);
    popup.removeEventListener("pointermove", onPopupPointerMove);
    popup.removeEventListener("pointerleave", onPopupPointerLeave);
    popup.removeEventListener("click", onPopupClick);
    popup.removeEventListener("focusin", onPopupFocusIn);
  }

  function scan(root) {
    if (disposed) return null;
    const popup = findUserPopup(root);
    if (popup && popupOpen(popup)) inject(popup);
    return popup;
  }

  // ------------------------------------------------------------ popup events
  const touch = () => {
    if (live) live.touched = true;
  };

  function onPopupPointerMove(e) {
    const popup = e.currentTarget;
    if (e.pointerType === "touch") return;
    touch();
    const it = e.target instanceof Element ? e.target.closest('[role="menuitem"]') : null;
    const target = it && popup.contains(it) && menuItems(popup).includes(it) ? it : null;
    if (target !== currentItem(popup)) setCurrent(popup, target, true);
  }

  function onPopupPointerLeave(e) {
    const popup = e.currentTarget;
    if (currentItem(popup)) setCurrent(popup, null, true);
  }

  function onPopupFocusIn(e) {
    const popup = e.currentTarget;
    const t = e.target;
    if (!(t instanceof Element) || t.getAttribute("role") !== "menuitem" || t.closest('[role="menu"]') !== popup) return;
    if (live && live.popup === popup && !live.touched && Date.now() - live.at < OPEN_SETTLE_MS) {
      applyOpenFocus(); // the initial focus Base UI moves in after a keyboard open
      if (live.mode != null) return;
    }
    if (currentItem(popup) !== t && menuItems(popup).includes(t)) setCurrent(popup, t, false);
  }

  function onPopupClick(e) {
    const it = e.target instanceof Element ? e.target.closest(`[role="menuitem"][${ITEM_ATTR}]`) : null;
    if (!it) return;
    e.preventDefault();
    e.stopPropagation();
    activate(it.getAttribute(ITEM_ATTR), e.detail === 0 ? "keyboard" : "pointer", e.currentTarget);
  }

  // ------------------------------------------------------------- actions
  function clickNative(el) {
    if (!el) return false;
    el.click();
    return true;
  }

  // Closes the User menu: a click on its trigger (Base UI toggles it), else Escape.
  function closeUserPopup(popup) {
    if (!popupOpen(popup)) return false;
    const t = triggerOf(popup);
    if (t && nativeIsOpen(t)) clickNative(t);
    if (popupOpen(popup) && t && nativeIsOpen(t)) {
      popup.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
    }
    return true;
  }

  function anchorFor(popup) {
    if (native && native.kind === "user" && native.anchor && native.anchor.isConnected) return native.anchor;
    const t = popup && triggerOf(popup);
    return rendered(t) ? t : defaultAnchor();
  }

  function whenGone(popup, fn, maxMs) {
    const t0 = Date.now();
    const step = () => {
      if (disposed) return;
      if (!popup || !popup.isConnected || Date.now() - t0 > (maxMs || GONE_WAIT_MS)) fn();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function activate(id, via, popup) {
    if (!ITEMS[id]) return false;
    const p = popup && popup.isConnected ? popup : livePopup() || findUserPopup();
    const anchor = anchorFor(p);
    const wasOpen = p ? closeUserPopup(p) : false;
    record(`activate:${id}`, { via });
    // Deferred: the current click/keydown finishes first, so the native
    // menus/dialogs do not see it as an outside press. Help waits for the
    // account menu to leave (its anchor box is reused).
    const go = () => run(id, via, anchor);
    if (id === "help" && wasOpen) whenGone(p, go);
    else setTimeout(go, 0);
    return true;
  }

  function run(id, via, anchor) {
    if (disposed) return;
    if (id === "settings") {
      if (clickNative(findGear())) record("settings", { via });
      else {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: ",", code: "Comma", metaKey: IS_MAC, ctrlKey: !IS_MAC, bubbles: true, cancelable: true }));
        record("settings-shortcut", { via });
      }
    } else if (id === "bug") {
      record(clickNative(findBug()) ? "bug" : "bug-missing", { via });
    } else if (id === "help") {
      openNative("help", anchor && rendered(anchor) ? anchor : defaultAnchor(), via);
    }
  }

  // ------------------------------------------------- native popup anchoring
  function setAnchorVars(left, top, width, height) {
    html.style.setProperty("--rtrm-anchor-left", `${left}px`);
    html.style.setProperty("--rtrm-anchor-top", `${top}px`);
    html.style.setProperty("--rtrm-anchor-width", `${width}px`);
    html.style.setProperty("--rtrm-anchor-height", `${height}px`);
  }

  // Lays the native trigger over native.anchor (fixed box, transform-corrected).
  function placeNative() {
    if (!native) return false;
    const btn = nativeBtn(native.kind);
    const anchor = native.anchor;
    if (!btn || !anchor || !anchor.isConnected) return false;
    const a = anchor.getBoundingClientRect();
    setAnchorVars(a.left, a.top, a.width, a.height);
    // a transformed ancestor turns `fixed` into "relative to it": correct by the measured offset
    let h = btn.getBoundingClientRect();
    const dx = a.left - h.left;
    const dy = a.top - h.top;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      setAnchorVars(a.left + dx, a.top + dy, a.width, a.height);
      h = btn.getBoundingClientRect();
    }
    native.placed = h.width > 0 && Math.abs(h.left - a.left) <= 1 && Math.abs(h.top - a.top) <= 1;
    return native.placed;
  }

  function applyAnchorClasses() {
    if (!native) return;
    const cls = native.kind === "help" ? HELP_ANCHOR_CLASS : USER_ANCHOR_CLASS;
    if (!html.classList.contains(cls)) html.classList.add(cls);
    if (native.forced && !html.classList.contains(RAIL_ANCHOR_CLASS)) html.classList.add(RAIL_ANCHOR_CLASS);
  }

  function anchorNative(kind, btn, anchorEl) {
    if (native) unanchorNative(`${native.kind}-replaced`);
    const rail = document.querySelector(RAIL);
    // a display:none rail renders no descendants: lay it out (hidden, 0x0) while anchored
    const forced = !!rail && !rendered(rail);
    if (kind === "user" && !forced) {
      // the avatar leaves the rail's flow while it is a fixed box: keep its slot
      const r = btn.getBoundingClientRect();
      html.style.setProperty("--rtrm-anchor-slot-width", `${r.width}px`);
      html.style.setProperty("--rtrm-anchor-slot-height", `${r.height}px`);
    }
    native = { kind, anchor: anchorEl, external: !inRail(anchorEl), forced, placed: false, seenOpen: false };
    if (native.external) {
      anchorEl.setAttribute("aria-haspopup", "menu");
      anchorEl.setAttribute("aria-expanded", "true");
    }
    applyAnchorClasses();
    placeNative();
  }

  function unanchorNative(reason) {
    clearInterval(nativeTimer);
    nativeTimer = 0;
    if (!native) return;
    const n = native;
    const btn = nativeBtn(n.kind);
    const ae = document.activeElement;
    if (!ae || ae === document.body || (btn && btn.contains(ae))) {
      focusEl(rendered(n.anchor) ? n.anchor : defaultAnchor());
    }
    if (n.external && n.anchor) n.anchor.setAttribute("aria-expanded", "false");
    native = null;
    html.classList.remove(HELP_ANCHOR_CLASS, USER_ANCHOR_CLASS, RAIL_ANCHOR_CLASS);
    for (const k of ANCHOR_VARS) html.style.removeProperty(`--rtrm-anchor-${k}`);
    record(reason);
  }

  // Polls the anchored popup; native.seenOpen is also set right after the
  // click and by a press that finds it open, so a popup closed before the
  // first tick is still treated as closed (not as "never opened").
  function watchNative(kind) {
    const started = Date.now();
    let closedAt = 0;
    clearInterval(nativeTimer);
    nativeTimer = setInterval(() => {
      if (disposed || !native) return;
      if (nativeIsOpen(nativeBtn(kind))) {
        native.seenOpen = true;
        closedAt = 0;
        return;
      }
      if (!native.seenOpen) {
        if (Date.now() - started > NATIVE_OPEN_WAIT_MS) unanchorNative(`${kind}-not-opened`);
        return;
      }
      if (!closedAt) closedAt = Date.now();
      else if (Date.now() - closedAt >= NATIVE_CLOSE_GRACE_MS) unanchorNative(`${kind}-closed`);
    }, NATIVE_POLL_MS);
  }

  // Opens a native rail popup ("help" | "user"); with anchorEl, laid over it.
  function openNative(kind, anchorEl, via) {
    const btn = nativeBtn(kind);
    if (!btn) {
      record(`${kind}-missing`, { via });
      return false;
    }
    if (anchorEl) anchorNative(kind, btn, anchorEl);
    else if (native) unanchorNative(`${native.kind}-replaced`);
    clickNative(btn);
    if (native && nativeIsOpen(btn)) native.seenOpen = true;
    record(kind, {
      via,
      anchor: !native ? "native" : native.external ? "external" : "rail",
      placed: native ? native.placed : null,
      railForced: native ? native.forced : false,
    });
    if (native) watchNative(kind);
    if (kind === "user") {
      opens++;
      scan(); // the popup mounts synchronously in most cases: inject before paint
    }
    return true;
  }

  // Called from a click handler: a pointer click leaves the highlight off,
  // a keyboard click (detail 0) or a plain call highlights the first item.
  function focusForCaller() {
    const ev = window.event;
    if (!ev || !ev.type) return "first";
    if (ev.type === "click") return ev.detail > 0 ? "menu" : "first";
    return /^(pointer|mouse)/.test(ev.type) ? "menu" : "first";
  }

  function consumePressGuard(el) {
    const g = pressGuard;
    pressGuard = null;
    return !!g && g.el === el && Date.now() - g.at < PRESS_GUARD_MS;
  }

  function openUserMenu(anchorEl, via, focus) {
    if (disposed) return false;
    const btn = findAvatar();
    if (!btn) {
      record("user-missing", { via });
      return false;
    }
    let target = anchorEl instanceof Element && anchorEl.isConnected && !inRail(anchorEl) ? anchorEl : null;
    if (target && consumePressGuard(target)) {
      record("user-toggle-closed", { via }); // the press on the anchor already closed it
      return true;
    }
    if (nativeIsOpen(btn)) {
      record("user-noop", { via });
      return true;
    }
    if (!target && !rendered(btn)) {
      const d = defaultAnchor();
      if (d && d !== btn) target = d; // rail hidden: open at the visible avatar, not at 0,0
    }
    pendingOpen = { focus: focus || focusForCaller(), at: Date.now() };
    return openNative("user", target, via);
  }

  // ------------------------------------------------------------- listeners
  // The external anchor whose native popup is up.
  function externalAnchorInUse() {
    if (native && native.external && native.anchor && nativeIsOpen(nativeBtn(native.kind))) return native.anchor;
    return null;
  }

  function onPointerDownCapture(e) {
    const t = e.target;
    if (native && !native.seenOpen && nativeIsOpen(nativeBtn(native.kind))) native.seenOpen = true;
    const ext = externalAnchorInUse();
    pressGuard = ext && e.button === 0 && t instanceof Node && ext.contains(t) ? { el: ext, at: Date.now() } : null;
  }

  function onKeyDownCapture(e) {
    if (disposed || e.isComposing) return;
    const popup = livePopup();
    if (!popup) return;
    const ae = document.activeElement;
    if (!ae || (ae !== popup && !popup.contains(ae))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) {
      // app shortcuts (Cmd+, / Cmd+Shift+B ...) keep working and close the menu
      if (!["Meta", "Control", "Alt", "Shift"].includes(e.key)) {
        closeUserPopup(popup);
        record("close", { reason: "shortcut" });
      }
      return;
    }
    touch();
    const cur = currentItem(popup);
    switch (e.key) {
      case "ArrowDown":
        moveBy(popup, 1);
        break;
      case "ArrowUp":
        moveBy(popup, -1);
        break;
      case "Home":
        moveBy(popup, 0, 0);
        break;
      case "End":
        moveBy(popup, 0, -1);
        break;
      case "Enter":
      case " ":
        if (!cur) break; // nothing highlighted: never falls through to "Sign Out"
        if (cur.hasAttribute(ITEM_ATTR)) activate(cur.getAttribute(ITEM_ATTR), "keyboard", popup);
        else cur.click(); // native or other mods' items: the item Base UI may not know is highlighted
        break;
      case "ArrowRight":
        if (cur && cur.getAttribute(ITEM_ATTR) === "help") {
          activate("help", "keyboard", popup);
          break;
        }
        return;
      case "Escape": {
        // Base UI closes it; when focus sat on one of our items it leaves with
        // the popup and lands on <body>: hand it back to the avatar instead.
        const anchor = anchorFor(popup);
        whenGone(popup, () => {
          const now = document.activeElement;
          if ((!now || now === document.body) && rendered(anchor)) focusEl(anchor);
        }, ESC_FOCUS_WAIT_MS);
        return;
      }
      default: {
        if (e.key.length !== 1 || !/\S/.test(e.key)) return; // Esc, Tab, ArrowLeft ... stay native
        const items = menuItems(popup);
        const n = items.length;
        const idx = items.indexOf(cur);
        const ch = e.key.toLowerCase();
        for (let k = 1; k <= n; k++) {
          const it = items[(Math.max(idx, -1) + k + n) % n];
          if ((it.textContent || "").trim().toLowerCase().startsWith(ch)) {
            setCurrent(popup, it, true);
            break;
          }
        }
      }
    }
    e.preventDefault();
    e.stopPropagation();
  }

  function onResize() {
    if (native) placeNative();
  }

  // Portals mount as direct children of <body>; Base UI may fill one a moment
  // after appending it, so a new child is watched briefly until a menu shows.
  function watchPortal(node) {
    if (portalWatches.size > 8) return;
    const mo = new MutationObserver(() => {
      if (scan(node)) stop();
    });
    const stop = () => {
      mo.disconnect();
      clearTimeout(t);
      portalWatches.delete(stop);
    };
    const t = setTimeout(stop, PORTAL_WATCH_MS);
    portalWatches.add(stop);
    mo.observe(node, { childList: true, subtree: true });
  }

  const bodyMo = new MutationObserver((records) => {
    if (disposed) return;
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (!(n instanceof Element) || n.id === "rtd-project-sidebar") continue;
        if (!scan(n)) watchPortal(n);
      }
    }
    if (live && !live.popup.isConnected) forgetLive();
  });

  // ------------------------------------------------------------------ sync
  function schedule() {
    if (disposed || raf) return;
    raf = requestAnimationFrame(sync);
  }

  // the app may rewrite <html class>; the gate and anchoring classes must survive it
  const htmlMo = new MutationObserver(() => {
    if (disposed) return;
    if (!html.classList.contains(ON_CLASS)) html.classList.add(ON_CLASS);
    applyAnchorClasses();
  });

  function sync() {
    raf = 0;
    if (disposed) return;
    syncs++;
    if (!html.classList.contains(ON_CLASS)) html.classList.add(ON_CLASS);
    if (live && !live.popup.isConnected) forgetLive();
    scan(); // fallback: a popup the observers missed
  }

  function loop() {
    if (disposed) return;
    if (document.visibilityState !== "hidden") schedule();
    timer = setTimeout(loop, TICK_MS);
  }

  const start = () => {
    if (disposed) return;
    ensureCss();
    html.classList.add(ON_CLASS);
    htmlMo.observe(html, { attributes: true, attributeFilter: ["class"] });
    if (document.body) bodyMo.observe(document.body, { childList: true });
    sync();
    loop();
  };

  on(window, "pointerdown", onPointerDownCapture, true);
  on(window, "keydown", onKeyDownCapture, true);
  on(window, "resize", onResize);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();

  // ------------------------------------------------------------- introspection
  function apiOpen(a) {
    return openUserMenu(a instanceof Element ? a : null, "api", a instanceof Element ? focusForCaller() : "first");
  }

  function apiClose() {
    const popup = livePopup() || findUserPopup();
    if (!popupOpen(popup)) return false;
    closeUserPopup(popup);
    record("close", { reason: "api" });
    return true;
  }

  const api = {
    selectors: { rail: RAIL, gear: GEAR, help: HELP, bug: BUG, avatar: AVATAR },
    get state() {
      const popup = findUserPopup();
      const open = popupOpen(popup);
      const cur = open ? currentItem(popup) : null;
      return {
        open,
        injected: open && !!popup.querySelector(`[${ITEM_ATTR}]`),
        anchor: open ? (native && native.kind === "user" ? (native.external ? "external" : "rail") : "native") : null,
        items: open ? menuItems(popup).map(itemId) : [],
        highlighted: itemId(cur),
        focusMode: live ? live.mode : null,
        gear: !!findGear(),
        help: !!findHelp(),
        bug: !!findBug(),
        avatar: !!findAvatar(),
        native: native ? native.kind : null,
        nativeExternal: native ? native.external : false,
        nativePlaced: native ? native.placed : null,
        helpAnchored: !!native && native.kind === "help",
        anchoring: html.classList.contains(RAIL_ANCHOR_CLASS),
        listeners: listeners.length,
        syncs,
        opens,
        injections,
        lastAction,
      };
    },
    // the account menu, laid over anchorEl (an element outside the rail)
    openUserMenu: (anchorEl) => apiOpen(anchorEl),
    // kept for callers of the old gear menu: the same account menu
    open: (anchorEl) => apiOpen(anchorEl),
    close: apiClose,
    toggle: (a) => (popupOpen(findUserPopup()) ? apiClose() : apiOpen(a)),
    // run("settings" | "help" | "bug") acts like picking that item
    run: (id) => activate(id, "api"),
    refresh: () => sync(),
    dispose() {
      if (disposed) return;
      unanchorNative("dispose");
      for (const m of document.querySelectorAll(`[${POPUP_ATTR}]`)) removeInjected(m);
      forgetLive();
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(timer);
      clearInterval(nativeTimer);
      htmlMo.disconnect();
      bodyMo.disconnect();
      for (const stop of [...portalWatches]) stop();
      for (const [target, type, fn, opts] of listeners) target.removeEventListener(type, fn, opts);
      listeners.length = 0;
      document.removeEventListener("DOMContentLoaded", start);
      html.classList.remove(ON_CLASS, HELP_ANCHOR_CLASS, USER_ANCHOR_CLASS, RAIL_ANCHOR_CLASS);
      if (cssLink) cssLink.remove();
      cssLink = null;
      if (window.__RE_TEMPO_RAIL_MENU__ === api) delete window.__RE_TEMPO_RAIL_MENU__;
    },
  };
  window.__RE_TEMPO_RAIL_MENU__ = api;
})();
