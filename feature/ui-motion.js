/*
 * RE-TEMPO · ui-motion (user MOD layer)
 * ---------------------------------------------------------------------------
 * The transition layer of the whole app: one motion language from the moment
 * the window opens to the canvas.
 *
 *   1) App open (once per load). When the shell first renders (before its
 *      first paint), html[data-rtm-boot] plays the reveal: the header drops in,
 *      the sidebar slides 16px from the left with a fade, the main view comes
 *      out of scale .985 with a fade, and its content
 *      staggers in (40ms). Nothing is ever pointer-events: none: every control
 *      is hit-testable from the shell's first frame. While project-sidebar
 *      mounts, the app's own rail is kept out of the reveal (no flash). The
 *      app's first render is followed by long tasks; an animation started
 *      then would stand still and jump ahead, so the reveal is held paused on
 *      its first frame (html[data-rtm-boot-hold]) until two frames come on
 *      time (360ms at most), then plays from 0, all pieces together.
 *   2) Route / section changes (home, project, chat, canvas, settings,
 *      profile and back). The app keeps its views mounted and hides them by
 *      class (hidden, [content-visibility:hidden]) or inline visibility, and
 *      its router keeps no URL or history: the change is read from the DOM
 *      (a MutationObserver, so before the new state's first paint). The view
 *      that leaves is held visible for its exit (absolute, not hit, on top,
 *      fading) and the one that enters plays its entrance, with a direction:
 *      deeper (home -> chat -> canvas, into settings) enters from the right
 *      and zooms in; back (the opposite, the header's Back button, Cmd+[ or
 *      the mouse back button) enters from the left and zooms out; same depth
 *      (another tab, another project) slides by tab order; another settings
 *      section rises in place. A view that the app replaces (unmounted), that
 *      changed just before it left (settings drops Profile as it closes; the
 *      app re-renders a chat's view in the task that opens its canvas), or
 *      that holds a chat canvas-chrome is drawing in a canvas card gets no
 *      exit (it would show something that was not on screen); a view that
 *      changes during its exit ends it at once.
 *      Another chat or project in the same chat view: the app keeps one chat
 *      tab panel and chat view node per side and only swaps the chat (the
 *      view's data-testid "chat-view-<id>"), so no view comes or goes; the
 *      chat view plays the side entrance ("swap"). A chat that came in before
 *      it was drawn (first load: the loading placeholder, or virtuoso's item
 *      list still visibility: hidden) is watched, and its body (message list
 *      or empty state) plays the entrance once drawn ("late"), so messages
 *      never pop in at full opacity after the entrance.
 *      Not the View Transitions API (Chromium has it): a view transition
 *      snapshots the old state at the next frame, but the app's click handler
 *      commits the new state in the same task, so the "old" snapshot would be
 *      the new one; it also freezes rendering while it runs and would not
 *      carry the webviews.
 *   3) Canvas opening. The canvas view's root ([data-rcc-shell], or the
 *      native view root without canvas-chrome) gets [data-rtm-canvas]: the
 *      canvas surface comes out of zoom .97 with a fade, then the
 *      chrome staggers in: tool rail, file pill, top pills, selection pill,
 *      left card, zoom (narrow: the top bar's pills). The canvas tab's lighter
 *      ground rises out of the center's dark one (an opacity-only overlay,
 *      ::after of the view root, under the chrome). A canvas seen before in
 *      this load (a tab switch) only fades in, 140ms: no scale, which would move its view. Never animated: the composer (.rcc-composer-wrap), the
 *      comment-bubbles avatars, the agent-cursors cursors.
 *   4) Resizing contract (for every mod): while the window is resized, a
 *      split is dragged or the sidebar is toggled / resized, <html> carries
 *      data-rtm-resizing ("window" | "split" | "layout"), removed 180ms after
 *      the last change. Pause transitions with
 *        html[data-rtm-resizing] .your-thing { transition: none; }
 *      Intros are time based and keep running through a resize. They never
 *      restart: if canvas-chrome rebuilds a chrome piece meanwhile (it does
 *      at its 460px threshold), the chrome part ends at once instead of
 *      replaying on the new node; the surface finishes in place. Minimize, a
 *      hidden window or a background tab end every running animation at once,
 *      so a restore shows the final state and nothing replays; nothing plays
 *      while the document is hidden.
 *
 * Safety rules (other mods measure and position their nodes):
 *   - Only opacity, transform (the translate / scale properties, which
 *     compose with a node's own transform) and filter (no blur) are
 *     animated, with backwards fill: after the animation nothing lingers (no
 *     containing block, no layer).
 *   - transform / filter make a node the containing block of its fixed
 *     descendants and change getBoundingClientRect. A view that holds a
 *     visible fixed node or a canvas shell (canvas-chrome's Share and hosted
 *     chat are position: fixed, and it reads rects) only fades. The canvas
 *     chrome pieces canvas-chrome measures (left card, selection pill, top
 *     pill + Share, zoom, rail) fade in place; only the file pill
 *     and canvas-quick's toggle move (6px).
 *   - Other mods' nodes are styled only by ui-motion.css, from an attribute on
 *     <html> or on the canvas view's root: no inline style, no attribute on
 *     their nodes. Attributes go on app (React) nodes only.
 *   - Reduced motion: opacity only, 120ms at most, no exits, no stagger.
 *
 * Minimum window: the app's BrowserWindow is 800px wide at least; narrower
 * layouts (760, 390) only exist as an emulated viewport. Everything here is
 * size independent.
 *
 * Off switch: localStorage.setItem("rtd.uiMotion", "off") (read at load and
 * on focus). API: window.__RE_TEMPO_UI_MOTION__ = { state(), enable(),
 * disable({ persist }), dispose(), replayBoot(), replayCanvas() }.
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";
  const NS = "__RE_TEMPO_UI_MOTION__";
  if (window[NS] && typeof window[NS].dispose === "function") {
    try {
      window[NS].dispose();
    } catch (_) {}
  }

  const FLAG = "rtd.uiMotion";
  const html = document.documentElement;
  const flagOff = () => {
    try {
      return localStorage.getItem(FLAG) === "off";
    } catch (_) {
      return false;
    }
  };

  // Durations (ms), the longest delay + duration of each phase in
  // ui-motion.css; the attributes are removed once the phase is over.
  const T = {
    boot: 900, // shell reveal + content stagger
    bootWindow: 1400, // views that mount this long after the shell still get the boot entrance
    enter: 600, // route entrance (40ms delay + 520ms; content stagger up to ~600ms)
    leave: 260, // route exit
    intro: 800, // canvas intro (surface 680ms, chrome until 760ms)
    reintro: 480,
    bootHold: 360, // the longest the reveal waits for two on-time frames
    swapWatch: 1200, // a chat that came in before it was drawn: how long it may take
    swapLate: 140, // drawn later than this: its body plays the entrance once drawn
    quiet: 180, // resize debounce
    canvasWait: 900, // how long an entering view may take to mount its canvas
  };

  const A = {
    on: "data-rtm",
    boot: "data-rtm-boot",
    bootRail: "data-rtm-boot-rail", // project-sidebar will hide the app's rail: keep it out of the reveal
    bootHold: "data-rtm-boot-hold", // the reveal waits, paused on its first frame, for the main thread
    resizing: "data-rtm-resizing",
    cvGlobal: "data-rtm-cv", // on <html> while a canvas intro runs (nodes outside the view's root)
    in: "data-rtm-in",
    out: "data-rtm-out",
    flat: "data-rtm-flat",
    canvas: "data-rtm-canvas",
    surface: "data-rtm-surface",
    panel: "data-rtm-panel",
  };

  // A view holding one of these (visible) only fades: transform / filter
  // would re-anchor its position: fixed descendants, or change the rects
  // canvas-chrome reads (and its 460px eligibility).
  const UNSAFE_IN_VIEW =
    '[data-rcc-shell],[data-rcc-share],[data-rcc-chat-hosted],[data-canvas-root],.fixed,[style*="position: fixed"],[style*="position:fixed"]';
  const UNSAFE_IN_SURFACE = '[data-rcc-share],[data-rcc-chat-hosted],.fixed,[style*="position: fixed"],[style*="position:fixed"]';
  const CANVAS_MARK = '[data-canvas-shell],[data-rcc-shell],[data-testid="canvas-design-sidebar"],[data-testid="interact-webview-layer"],[data-testid="canvas-comment-pin-layer"]';
  const SURFACE_MARK = '[data-testid="interact-webview-layer"],[data-testid="canvas-comment-pin-layer"]';

  const DEPTH = { home: 1, "design-home": 1, "chat-home": 1, issues: 1, agents: 1, docs: 1, route: 1, chat: 2, tab: 2, terminal: 2, doc: 2, settings: 2, "settings-section": 2, canvas: 3 };

  let enabled = false;
  let disposed = false;
  let rootEl = null; // #root
  let center = null; // #workspace-center
  let mainEl = null; // #workspace-main
  let boot = "pending"; // pending | play | done | skipped
  let bootAt = 0;
  let prevViews = null; // Map<Element, view>
  let navHint = null;
  let navHintAt = 0;
  let resizing = null;
  let dragging = false;
  let resizeTimer = 0;
  let scanQueued = false;
  let mo = null;
  let attrMo = null;
  let ro = null;
  let roPrimed = false;
  let mql = null;
  const timers = new Set();
  const live = new Map(); // element -> { attrs: [names], timer }
  const seenCanvas = new WeakSet();
  const innerChangedAt = new WeakMap(); // container -> when its inner view last changed
  const contentSwapAt = new WeakMap(); // chat tab panel -> when the app replaced its chat view's content
  const chatIds = new WeakMap(); // chat tab panel -> the chat it showed at the last scan
  let swapWatch = null; // { el, at, mo, timer }: a chat that came in before it was drawn
  const counts = { scans: 0, scanMs: 0, scanMsMax: 0, boot: 0, enter: 0, leave: 0, exitCut: 0, noExitSwapped: 0, swap: 0, swapLate: 0, canvasIntro: 0, canvasReintro: 0, panel: 0, finishedEarly: 0, resizes: 0 };
  let last = null;

  const now = () => performance.now();
  const reduced = () => !!(mql && mql.matches);
  const hiddenDoc = () => document.visibilityState === "hidden";
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!disposed) fn();
    }, ms);
    timers.add(id);
    return id;
  };
  const cancel = (id) => {
    if (!id) return;
    clearTimeout(id);
    timers.delete(id);
  };

  // ------------------------------------------------------------ visibility
  // Read from attributes only: a style recalc here (checkVisibility,
  // getComputedStyle) would drop the layout of a view the app just hid, and
  // the exit would pay for a full relayout.
  function hiddenByAttr(el) {
    if (!el || el.nodeType !== 1) return true;
    if (el.hidden) return true;
    const c = el.classList;
    if (c.contains("hidden") || c.contains("invisible") || c.contains("[content-visibility:hidden]")) return true;
    const s = el.style;
    if (s && (s.display === "none" || s.visibility === "hidden" || s.contentVisibility === "hidden")) return true;
    return false;
  }
  function shownWithin(el, stop) {
    for (let n = el; n && n !== stop; n = n.parentElement) if (hiddenByAttr(n)) return false;
    return true;
  }
  // Visible unsafe descendants (a hidden canvas tab's shell does not count).
  function motionSafe(el, sel) {
    if (el.matches(sel)) return false;
    for (const n of el.querySelectorAll(sel)) if (shownWithin(n, el)) return false;
    return true;
  }

  // The first canvas node drawn inside `scope` (a hidden keepalive canvas tab
  // inside an entering chat route does not count).
  function visibleCanvasIn(scope) {
    if (scope.matches(CANVAS_MARK)) return scope;
    for (const n of scope.querySelectorAll(CANVAS_MARK)) if (shownWithin(n, scope)) return n;
    return null;
  }

  // ------------------------------------------------------------ attributes
  function setLive(el, attrs, ms) {
    const rec = live.get(el);
    if (rec) {
      cancel(rec.timer);
      for (const a of rec.attrs) if (!(a in attrs)) el.removeAttribute(a);
    }
    for (const a in attrs) el.setAttribute(a, attrs[a]);
    const r = { attrs: Object.keys(attrs), timer: 0, cleanup: rec && rec.cleanup };
    r.timer = later(() => finishLive(el), ms);
    live.set(el, r);
    return r;
  }
  // Removes an element's attributes once its rtm- animations are over (a node
  // mounted late inside it may still be running: wait for it once, 700ms at
  // most, rather than cut it).
  function finishLive(el, force) {
    const rec = live.get(el);
    if (!rec) return;
    if (!force && !rec.extended && el.isConnected && typeof el.getAnimations === "function") {
      let rest = 0;
      try {
        for (const an of el.getAnimations({ subtree: true })) {
          if (!an.animationName || an.animationName.indexOf("rtm-") !== 0 || an.playState !== "running") continue;
          const t = an.effect && an.effect.getComputedTiming ? an.effect.getComputedTiming() : null;
          if (t && t.endTime != null && t.localTime != null) rest = Math.max(rest, t.endTime - t.localTime);
        }
      } catch (_) {}
      if (rest > 16) {
        rec.extended = true;
        rec.timer = later(() => finishLive(el), Math.min(700, rest + 20));
        return;
      }
    }
    cancel(rec.timer);
    live.delete(el);
    if (rec.cleanup) rec.cleanup();
    for (const a of rec.attrs) el.removeAttribute(a);
    if (el === html) html.removeAttribute(A.cvGlobal);
  }
  function finishAll(reason) {
    let n = 0;
    for (const el of Array.from(live.keys())) {
      finishLive(el, true);
      n++;
    }
    if (boot === "play") endBoot(true);
    html.removeAttribute(A.cvGlobal);
    if (n) counts.finishedEarly += n;
    if (n && reason) last = { ...(last || {}), finished: reason, at: Math.round(now()) };
  }

  // ------------------------------------------------------------ views
  function kindOfRoute(c) {
    if (c.querySelector(":scope > .flex > .w-60")) return "settings";
    if (c.querySelector('[data-testid="center-panel"]')) return "chat";
    if (c.querySelector('[data-testid="canvas-homepage"],[data-testid="design-view-tab-bar"]')) return "design";
    if (c.querySelector("#issues-content")) return "issues";
    return "route";
  }
  function kindOfPanel(p) {
    if (p.getAttribute("data-testid") === "chat-tab-panel") return p.querySelector('[data-testid="chat-empty-state"]') ? "chat-home" : "chat";
    if (/^canvas-/.test(p.getAttribute("data-tab-id") || "") || p.querySelector(CANVAS_MARK)) return "canvas";
    if (p.querySelector(".xterm,[data-testid*=terminal]")) return "terminal";
    return "tab";
  }
  // Every tab panel of the center panel's split hosts (hidden ones too: they
  // are observed for the style / class change that shows them).
  function tabPanels(c) {
    const out = [];
    for (const host of c.querySelectorAll('[data-testid$="-content"][data-testid^="split-panel-"]')) {
      for (const inner of host.children) {
        for (const k of inner.children) {
          if (k.classList.contains("contents")) {
            for (const p of k.children) out.push(p);
          } else if (k.getAttribute("data-testid") === "center-tab-keepalive-panel" || k.getAttribute("data-testid") === "chat-tab-panel") out.push(k);
        }
      }
    }
    return out;
  }
  function designSlotChild(c) {
    const home = c.querySelector('[data-testid="canvas-homepage"]');
    if (home) return { el: home, kind: "design-home" };
    const shell = c.querySelector("[data-canvas-shell],[data-rcc-shell]");
    if (shell) return { el: shell, kind: "canvas" };
    const side = c.querySelector('[data-testid="canvas-design-sidebar"]');
    if (side && side.parentElement) return { el: side.parentElement, kind: "canvas" };
    return null;
  }
  // the section on screen: the pane's last child (profile-page appends its
  // own section next to the native one, a native switch replaces it)
  function settingsPane(c) {
    const pane = c.querySelector(":scope > .flex > .flex-1");
    return pane && pane.lastElementChild ? pane.lastElementChild : null;
  }

  function collect() {
    const views = [];
    const watch = [];
    const ids = [];
    if (!center || !center.isConnected) center = document.getElementById("workspace-center");
    if (!center) return { views, watch, ids };
    let order = 0;
    for (const c of center.children) {
      if (c.matches('[data-testid="browser-tab-host"],[class*="rtd-"],[data-rtm-own]')) continue;
      watch.push(c);
      if (hiddenByAttr(c)) continue;
      const kind = kindOfRoute(c);
      views.push({ el: c, level: 1, kind, order: order++ });
      if (kind === "chat") {
        let i = 0;
        for (const p of tabPanels(c)) {
          watch.push(p);
          const cv = chatViewOf(p);
          if (cv) ids.push(cv);
          i++;
          if (!shownWithin(p, c)) continue;
          views.push({ el: p, level: 2, kind: kindOfPanel(p), order: i, host: c });
        }
      } else if (kind === "design") {
        const s = designSlotChild(c);
        if (s) views.push({ el: s.el, level: 2, kind: s.kind, order: 0, host: c });
      } else if (kind === "settings") {
        const p = settingsPane(c);
        if (p) views.push({ el: p, level: 2, kind: "settings-section", order: 0, host: c });
      }
    }
    return { views, watch, ids };
  }
  // The app keeps one chat tab panel and one chat view node per split side and
  // swaps what they show: another chat (or project) changes the view's
  // data-testid ("chat-view-<chatId>") and replaces its children.
  function chatViewOf(p) {
    const c = p.firstElementChild;
    if (c && (c.getAttribute("data-testid") || "").indexOf("chat-view-") === 0) return c;
    for (const k of p.children) if ((k.getAttribute("data-testid") || "").indexOf("chat-view-") === 0) return k;
    return null;
  }

  function viewDepth(list) {
    let d = 0;
    let kind = null;
    for (const v of list) {
      const k = v.kind === "settings" || v.kind === "settings-section" ? "settings" : v.kind;
      const dd = DEPTH[k] || 1;
      if (dd >= d) {
        d = dd;
        kind = k;
      }
    }
    return { d, kind };
  }

  function direction(entering, leaving, prevList, nextList) {
    if (navHint && now() - navHintAt < 700) return navHint;
    const a = viewDepth(prevList);
    const b = viewDepth(nextList);
    if (b.kind === "settings" && a.kind !== "settings") return "fwd";
    if (a.kind === "settings" && b.kind !== "settings") return "back";
    if (b.d > a.d) return "fwd";
    if (b.d < a.d) return "back";
    // same depth: by tab order when one tab replaced another in the same host
    const e = entering.find((v) => v.level === 2);
    const l = leaving.find((v) => v.level === 2 && v.host === (e && e.host));
    if (e && l && e.el.isConnected && l.el.isConnected) {
      return l.el.compareDocumentPosition(e.el) & Node.DOCUMENT_POSITION_FOLLOWING ? "right" : "left";
    }
    return "side";
  }

  // ------------------------------------------------------------ animations
  function enterView(v, dir, variant, covered) {
    const el = v.el;
    if (v.kind === "canvas" || visibleCanvasIn(el)) {
      // the canvas intro carries this view: the view itself does not move; it
      // only becomes a stacking context while an exit covers it
      if (covered && el !== canvasRootOf(el)) setLive(el, { [A.in]: "hold" }, T.leave);
      canvasIntro(el, variant === "boot");
      return;
    }
    const flat = !motionSafe(el, UNSAFE_IN_VIEW);
    const attrs = { [A.in]: variant === "boot" ? "boot" : dir };
    if (flat) attrs[A.flat] = "";
    setLive(el, attrs, variant === "boot" ? T.boot : T.enter);
    counts.enter++;
    if (variant !== "boot" && (v.kind === "chat" || v.kind === "chat-home")) {
      const cv = chatViewOf(el);
      if (cv) watchChatLoad(cv);
    }
    // the canvas may mount a little after its view (keepalive tab, design home -> canvas)
    if (v.kind === "tab" || v.kind === "route" || v.kind === "design") watchForCanvas(el, variant === "boot");
  }
  function leaveView(v, dir) {
    const el = v.el;
    if (!el.isConnected || reduced()) return;
    // it may hold a node drawn for a canvas outside it (canvas-chrome hosts a
    // chat tab's view in the canvas card): fading it would fade that node
    // too, then pop it back. With its canvas inside, the whole thing leaves.
    if (el.querySelector("[data-rcc-chat-hosted]") && !visibleCanvasIn(el)) return;
    const flat = !motionSafe(el, UNSAFE_IN_VIEW);
    const attrs = { [A.out]: dir };
    if (flat) attrs[A.flat] = "";
    const rec = setLive(el, attrs, T.leave);
    counts.leave++;
    // A view that changes while it leaves (a mod takes its own nodes out of a
    // view that is no longer on screen, the app resets it) would show that
    // change during the exit: the exit ends at once, before that frame.
    const guard = new MutationObserver((records) => {
      for (const m of records) {
        let d = 0;
        for (let n = m.target; n && n !== el && d < 9; n = n.parentElement) d++;
        if (d < 9) {
          counts.exitCut++;
          finishLive(el, true);
          return;
        }
      }
    });
    guard.observe(el, { childList: true, subtree: true });
    rec.cleanup = () => guard.disconnect();
    // canvas-chrome may host this view's chat in the new canvas' card right
    // after the switch: the exit must not fade it, end the exit then
    const t0 = now();
    const step = () => {
      if (disposed || !live.has(el) || !el.hasAttribute(A.out)) return;
      if (el.querySelector("[data-rcc-chat-hosted]") && !visibleCanvasIn(el)) {
        finishLive(el, true);
        return;
      }
      if (now() - t0 < T.leave) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function watchForCanvas(scope, full) {
    const t0 = now();
    const step = () => {
      if (disposed || !enabled || !scope.isConnected || hiddenDoc()) return;
      if (visibleCanvasIn(scope)) {
        // the view's own entrance was a plain one: end it, the intro takes over
        if (live.has(scope) && scope.getAttribute(A.in) !== "hold") finishLive(scope, true);
        canvasIntro(scope, full);
        return;
      }
      if (now() - t0 < T.canvasWait) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function canvasRootOf(scope) {
    if (scope.matches("[data-canvas-shell],[data-rcc-shell]")) return scope;
    for (const sh of scope.querySelectorAll("[data-canvas-shell],[data-rcc-shell]")) if (shownWithin(sh, scope)) return sh;
    return scope;
  }
  function surfaceOf(croot) {
    for (const mark of croot.querySelectorAll(SURFACE_MARK)) if (shownWithin(mark, croot)) return mark.parentElement;
    return null;
  }
  function canvasIntro(scope, boot) {
    if (!enabled || hiddenDoc()) return;
    const croot = canvasRootOf(scope);
    if (live.has(croot) && croot.getAttribute(A.canvas)) return;
    const full = boot || !seenCanvas.has(croot);
    seenCanvas.add(croot);
    const mode = full ? "intro" : "reintro";
    const ms = full ? T.intro : T.reintro;
    setLive(croot, { [A.canvas]: mode }, ms);
    introRoots.add(croot);
    setLive(html, { [A.cvGlobal]: mode }, ms);
    full ? counts.canvasIntro++ : counts.canvasReintro++;
    last = { ...(last || {}), canvas: mode, at: Math.round(now()) };
    // the surface: now, or as soon as the app mounts it
    const t0 = now();
    const step = () => {
      if (disposed || !enabled || !croot.isConnected || hiddenDoc()) return;
      const s = surfaceOf(croot);
      if (s) {
        const attrs = { [A.surface]: mode };
        if (!motionSafe(s, UNSAFE_IN_SURFACE)) attrs[A.flat] = "";
        // what is left of the intro window: a late surface does not outlive it by much
        setLive(s, attrs, ms);
        return;
      }
      if (now() - t0 < T.canvasWait) requestAnimationFrame(step);
    };
    step();
  }

  // A canvas intro must not restart: canvas-chrome rebuilds its pieces when
  // the view crosses its width threshold (a resize, the sidebar), and a new
  // node under [data-rtm-canvas] would play its entrance from the start. A
  // chrome piece removed while the intro runs ends the chrome part at once
  // (the surface, an app node, finishes in place).
  const CHROME = ".rcc-file,.rcc-top,.rcc-sel,.rcc-zoom,.rcq-ltog,[data-rcc-railwrap],[data-rcc-card],[data-rcc-share],[data-testid=design-view-tab-bar]";
  const introRoots = new Set();
  function checkRebuild(m) {
    for (const croot of introRoots) {
      if (!croot.isConnected || !live.has(croot)) {
        introRoots.delete(croot);
        continue;
      }
      if (!croot.contains(m.target) && m.target !== croot) continue;
      for (const n of m.removedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches(CHROME) || n.querySelector(CHROME)) {
          introRoots.delete(croot);
          finishLive(croot, true);
          if (live.has(html) && !introRoots.size) finishLive(html, true);
          counts.finishedEarly++;
          last = { ...(last || {}), finished: "chrome-rebuilt", at: Math.round(now()) };
          return;
        }
      }
    }
  }

  function panelEnter(el) {
    if (!enabled || hiddenDoc() || reduced() || boot === "play") return;
    if (!mainEl || !mainEl.contains(el)) return;
    const side = el.id === "workspace-left" ? "left" : "right";
    const attrs = { [A.panel]: side };
    if (!motionSafe(el, UNSAFE_IN_VIEW)) attrs[A.flat] = "";
    setLive(el, attrs, T.enter);
    counts.panel++;
  }

  // ------------------------------------------------------------ scan
  function scan() {
    scanQueued = false;
    if (disposed) return;
    counts.scans++;
    const t0 = now();
    try {
      scanInner();
    } finally {
      const ms = now() - t0;
      counts.scanMs = Math.round((counts.scanMs + ms) * 100) / 100;
      if (ms > counts.scanMsMax) counts.scanMsMax = Math.round(ms * 100) / 100;
    }
  }
  function scanInner() {
    const { views, watch, ids } = collect();
    if (attrMo) {
      for (const w of watch) attrMo.observe(w, { attributes: true, attributeFilter: ["class", "style", "hidden"] });
      for (const cv of ids) attrMo.observe(cv, { attributes: true, attributeFilter: ["data-testid"] });
    }
    const next = new Map(views.map((v) => [v.el, v]));
    const prev = prevViews;
    prevViews = next;
    const switched = chatSwitches(views);
    if (!enabled || !views.length) return;
    const inBoot = boot === "play" || (bootAt && now() - bootAt < T.bootWindow);
    if (!prev) {
      // first sight of the views: the boot entrance (if this load plays one)
      if (inBoot && !hiddenDoc()) for (const v of topmost(views)) enterView(v, "fwd", "boot");
      return;
    }
    const entering = views.filter((v) => !prev.has(v.el));
    const leaving = Array.from(prev.values()).filter((v) => !next.has(v.el));
    // another chat or project in the same chat view (no view comes or goes)
    if (!inBoot && !hiddenDoc()) for (const sw of switched) if (!entering.some((e) => e.el === sw.v.el || e.el.contains(sw.v.el))) chatSwapIn(sw.cv, sw.v.el);
    if (!entering.length && !leaving.length) return;
    // A view whose inner view was swapped just before it closed (profile-page
    // takes its section out of settings a moment before the app hides it, so
    // Preferences shows) no longer holds what was on screen: no exit for it.
    // Same for a chat tab panel whose chat view the app re-rendered in the
    // task that hid it (opening the chat's canvas turns its empty state into
    // the message list layout: the exit would show a chat that never was).
    const t = now();
    const swapped = new Set(
      leaving
        .filter((v) => (v.level === 1 && t - (innerChangedAt.get(v.el) || -1e9) < 250) || (v.level === 2 && t - (contentSwapAt.get(v.el) || -1e9) < 80))
        .map((v) => v.el)
    );
    counts.noExitSwapped += leaving.filter((v) => v.level === 2 && swapped.has(v.el)).length;
    for (const v of entering) if (v.host) innerChangedAt.set(v.host, t);
    for (const v of leaving) if (v.host) innerChangedAt.set(v.host, t);
    if (hiddenDoc()) return;
    // a view leaving and coming back while its exit runs: drop the exit
    for (const v of entering) if (live.has(v.el) && v.el.hasAttribute(A.out)) finishLive(v.el, true);
    if (inBoot && !leaving.length) {
      for (const v of topmost(entering)) enterView(v, "fwd", "boot");
      return;
    }
    const dir = direction(entering, leaving, Array.from(prev.values()), views);
    navHint = null;
    // another section of the same settings view: a short rise, no exit
    if (entering.length === 1 && entering[0].kind === "settings-section" && prev.has(entering[0].host)) {
      const el = entering[0].el;
      if (!el.matches('[data-testid="profile-page"]') && !el.querySelector('[data-testid="profile-page"]')) {
        setLive(el, { [A.in]: "sub" }, T.enter);
        counts.enter++;
      }
      last = { from: "settings-section", to: "settings-section", dir: "sub", at: Math.round(now()) };
      return;
    }
    for (const v of topmost(leaving)) if (!swapped.has(v.el)) leaveView(v, dir === "right" ? "left" : dir === "left" ? "right" : dir);
    const covered = leaving.some((v) => v.el.hasAttribute(A.out));
    for (const v of topmost(entering)) enterView(v, dir, null, covered);
    last = {
      from: viewDepth(Array.from(prev.values())).kind,
      to: viewDepth(views).kind,
      dir,
      entering: entering.length,
      leaving: leaving.length,
      at: Math.round(now()),
    };
  }
  // Chat tab panels whose chat changed since the last scan (the panel and its
  // chat view are the same nodes, only the chat id in the view's testid moves).
  function chatSwitches(views) {
    const out = [];
    for (const v of views) {
      if (v.level !== 2 || (v.kind !== "chat" && v.kind !== "chat-home")) continue;
      const cv = chatViewOf(v.el);
      const id = cv ? cv.getAttribute("data-testid") : null;
      const was = chatIds.get(v.el);
      chatIds.set(v.el, id);
      if (id && was && id !== was) out.push({ v, cv });
    }
    return out;
  }
  // A chat that is not drawn yet: the app's loading placeholder, or the
  // message list still hidden (virtuoso keeps its item list visibility:
  // hidden until it has measured and scrolled it, ~150-300ms on a first load).
  function chatPending(cv) {
    const body = cv.querySelector(':scope > [data-testid="chat-empty-state"], :scope > [data-testid="virtuoso-scroller"]');
    if (!body || cv.querySelector('[class*="tds-loader"]')) return true;
    if (body.getAttribute("data-testid") !== "virtuoso-scroller") return false;
    const il = body.querySelector('[data-testid="virtuoso-item-list"]');
    return !il || !il.children.length || il.style.visibility === "hidden";
  }
  // Watches a chat that came in (switched in place or entering) while it was
  // pending: once drawn, if that took longer than swapLate, its body (the
  // message list or the empty state, not the composer, which already came in)
  // plays the side entrance. One watch at a time, swapWatch ms at most.
  function watchChatLoad(cv) {
    stopChatWatch();
    if (!chatPending(cv)) return;
    const w = { el: cv, at: now(), mo: null, timer: 0 };
    swapWatch = w;
    try {
      w.mo = new MutationObserver(() => chatDrawn(w));
      w.mo.observe(cv, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    } catch (_) {}
    w.timer = later(stopChatWatch, T.swapWatch);
  }
  function stopChatWatch() {
    const w = swapWatch;
    if (!w) return;
    swapWatch = null;
    if (w.mo) w.mo.disconnect();
    cancel(w.timer);
  }
  function chatDrawn(w) {
    if (swapWatch !== w || disposed) return;
    if (!w.el.isConnected) return stopChatWatch();
    if (chatPending(w.el)) return;
    const late = now() - w.at >= T.swapLate;
    stopChatWatch();
    if (!late || !enabled || hiddenDoc()) return;
    const body = w.el.querySelector(':scope > [data-testid="chat-empty-state"], :scope > [data-testid="virtuoso-scroller"]');
    if (!body) return;
    const attrs = { [A.in]: "late" };
    if (!motionSafe(body, UNSAFE_IN_VIEW) || w.el.closest("[data-rcc-chat-hosted]")) attrs[A.flat] = "";
    setLive(body, attrs, T.enter);
    counts.swapLate++;
  }
  // The new chat rises in (the side entrance, 440ms); a chat drawn in a
  // canvas card (fixed host) only fades.
  function chatSwapIn(cv, panel) {
    if (live.has(cv)) finishLive(cv, true);
    const attrs = { [A.in]: "swap" };
    if (!motionSafe(cv, UNSAFE_IN_VIEW) || panel.closest("[data-rcc-chat-hosted]")) attrs[A.flat] = "";
    setLive(cv, attrs, T.enter);
    counts.swap++;
    watchChatLoad(cv);
    last = { from: "chat", to: "chat", dir: "swap", at: Math.round(now()) };
  }

  // the outermost views of a list (a route container that enters brings its
  // tab panel: only the container animates)
  function topmost(list) {
    return list.filter((v) => !list.some((o) => o !== v && o.el.contains(v.el)));
  }
  function queueScan() {
    if (scanQueued || disposed) return;
    scanQueued = true;
    queueMicrotask(scan);
  }

  // Relevant structure changes: the shell itself, #workspace-main's panels
  // and the first 12 levels under #workspace-center (route containers, tab
  // panels, the design slot, the settings pane). Deeper ones (chat messages,
  // canvas internals) are ignored at once.
  function relevant(t) {
    if (!t || t.nodeType !== 1) return false;
    if (t === rootEl || t === mainEl) return true;
    let n = t;
    for (let i = 0; i < 13 && n; i++, n = n.parentElement) if (n === center) return true;
    return false;
  }
  function onMutations(records) {
    if (disposed) return;
    let hit = false;
    for (const m of records) {
      if (m.type !== "childList") continue;
      const tg = m.target;
      if (tg.nodeType === 1 && tg.parentElement && (tg.getAttribute("data-testid") || "").indexOf("chat-view-") === 0) contentSwapAt.set(tg.parentElement, now());
      if (introRoots.size && m.removedNodes.length) checkRebuild(m);
      if (boot === "pending") bootCheck();
      if (!center || !center.isConnected) center = document.getElementById("workspace-center");
      if (!mainEl || !mainEl.isConnected) attachMain();
      if (m.target === mainEl) {
        for (const a of m.addedNodes) if (a.nodeType === 1 && /^workspace-(left|right)$/.test(a.id || "")) panelEnter(a);
      }
      if (!hit && relevant(m.target)) hit = true;
    }
    if (hit) queueScan();
  }
  function onAttrMutations() {
    if (!disposed) queueScan();
  }

  // ------------------------------------------------------------ boot
  function bootCheck() {
    if (boot !== "pending" || !rootEl) return;
    const first = rootEl.firstElementChild;
    if (!first) return;
    // only a real first paint: the shell's header / main, or any screen
    if (!first.childElementCount) return;
    if (!enabled || hiddenDoc()) {
      boot = "skipped";
      return;
    }
    boot = "play";
    bootAt = now();
    counts.boot++;
    const red = reduced();
    html.setAttribute(A.boot, red ? "reduced" : "play");
    if (projectSidebarComing()) html.setAttribute(A.bootRail, "");
    if (red) {
      later(() => endBoot(false), T.boot);
      return;
    }
    // The app's first render is followed by long tasks (its views mounting,
    // the canvas' first layout): an animation started in that frame is not on
    // the compositor yet, so it stands still on its first frame for the whole
    // task and then jumps ahead (the header used to pop in at ~60%). The
    // reveal is held paused on its first frame (ui-motion.css) until two
    // frames in a row come on time (or bootHold ms), then plays from 0.
    html.setAttribute(A.bootHold, "");
    const t0 = now();
    let lastT = 0;
    let onTime = 0;
    let released = false;
    const release = (why) => {
      if (released || disposed) return;
      released = true;
      bootHeldMs = Math.round(now() - t0);
      bootHeldBy = why;
      html.removeAttribute(A.bootHold);
      later(() => endBoot(false), T.boot);
    };
    const step = (t) => {
      if (released || boot !== "play") return;
      onTime = lastT && t - lastT < 34 ? onTime + 1 : 0;
      lastT = t;
      if (onTime >= 2) release("frames");
      else if (now() - t0 >= T.bootHold) release("cap");
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    later(() => release("timer"), T.bootHold + 40); // no frames (hidden): never stuck
  }
  let bootHeldMs = null;
  let bootHeldBy = null;
  // project-sidebar loads (its script is in the page and its flag is on): it
  // hides the app's rail a few frames after the shell appears
  function projectSidebarComing() {
    if (window.__RE_TEMPO_PROJECT_SIDEBAR__) return true;
    let off = false;
    try {
      off = localStorage.getItem("rtd.projectSidebar") === "off";
    } catch (_) {}
    return !off && !!document.querySelector('script[src*="project-sidebar"]');
  }
  function endBoot(force) {
    if (boot !== "play") return;
    if (!force && typeof document.getAnimations === "function") {
      // a node mounted late (the sidebar, the chat) may still be running: let it end
      let rest = 0;
      try {
        for (const an of document.getAnimations()) {
          if (!an.animationName || an.animationName.indexOf("rtm-boot") !== 0 || an.playState !== "running") continue;
          const t = an.effect.getComputedTiming();
          rest = Math.max(rest, t.endTime - t.localTime);
        }
      } catch (_) {}
      if (rest > 16 && now() - bootAt < T.boot + 800) {
        later(() => endBoot(false), Math.min(700, rest + 20));
        return;
      }
    }
    boot = "done";
    html.removeAttribute(A.boot);
    html.removeAttribute(A.bootRail);
    html.removeAttribute(A.bootHold);
  }

  // ------------------------------------------------------------ resizing
  function markResizing(src) {
    if (disposed) return;
    if (!resizing) {
      resizing = src;
      counts.resizes++;
      html.setAttribute(A.resizing, src);
    }
    cancel(resizeTimer);
    resizeTimer = later(endResizing, T.quiet);
  }
  function endResizing() {
    resizeTimer = 0;
    if (dragging) {
      resizeTimer = later(endResizing, T.quiet);
      return;
    }
    resizing = null;
    html.removeAttribute(A.resizing);
  }
  const onWindowResize = () => markResizing("window");
  const SPLIT = '[role="separator"],[data-panel-resize-handle-id],[data-resize-handle],[data-separator],.cursor-col-resize,.cursor-row-resize,[class*="cursor-col-resize"],[class*="cursor-row-resize"]';
  function onPointerDown(e) {
    if (e.button !== 0) {
      if (e.button === 3) hint("back");
      if (e.button === 4) hint("fwd");
      return;
    }
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest(SPLIT)) {
      dragging = true;
      markResizing("split");
      return;
    }
    const nav = t.closest('[aria-label="Back"],[aria-label="Forward"]');
    if (nav) hint(nav.getAttribute("aria-label") === "Back" ? "back" : "fwd");
  }
  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    markResizing("split");
  }
  function onKeyDown(e) {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key === "[") hint("back");
    else if (e.key === "]") hint("fwd");
  }
  function hint(d) {
    navHint = d;
    navHintAt = now();
  }
  function attachMain() {
    const m = document.getElementById("workspace-main");
    if (m === mainEl) return;
    mainEl = m;
    if (!ro || !mainEl) return;
    ro.disconnect();
    roPrimed = false;
    ro.observe(mainEl);
  }
  function onResizeObserved() {
    // the first callback is the initial size, not a change; while the app
    // opens, the layout settles (the sidebar mounts): not a resize either
    if (!roPrimed || boot === "play") {
      roPrimed = true;
      return;
    }
    markResizing("layout");
  }

  // ------------------------------------------------------------ lifecycle
  function onVisibility() {
    if (hiddenDoc()) finishAll("hidden");
  }
  function onFocus() {
    if (flagOff() && enabled) disable();
  }
  function onMotionPref() {
    if (reduced()) finishAll("reduced-motion");
  }

  function start() {
    if (disposed) return;
    rootEl = document.getElementById("root");
    if (!rootEl) {
      // loaded before the body (a test harness): wait for #root
      const w = new MutationObserver(() => {
        if (document.getElementById("root")) {
          w.disconnect();
          start();
        }
      });
      w.observe(document, { childList: true, subtree: true });
      stopWaiting = () => w.disconnect();
      return;
    }
    // loaded after the first render (a re-run in a live page): no boot reveal
    if (rootEl.firstElementChild && rootEl.firstElementChild.childElementCount) boot = "skipped";
    center = document.getElementById("workspace-center");
    mo = new MutationObserver(onMutations);
    mo.observe(rootEl, { childList: true, subtree: true });
    attrMo = new MutationObserver(onAttrMutations);
    if (typeof ResizeObserver === "function") ro = new ResizeObserver(onResizeObserved);
    attachMain();
    if (boot === "pending") bootCheck();
    // the views on screen now are the baseline (no entrance for them)
    scan();
  }
  let stopWaiting = null;

  function enable() {
    if (disposed || enabled) return;
    enabled = true;
    html.setAttribute(A.on, "");
  }
  function disable(opts) {
    if (opts && opts.persist) {
      try {
        localStorage.setItem(FLAG, "off");
      } catch (_) {}
    }
    finishAll("disabled");
    enabled = false;
    html.removeAttribute(A.on);
  }
  function dispose() {
    if (disposed) return;
    finishAll("disposed");
    disposed = true;
    enabled = false;
    if (stopWaiting) stopWaiting();
    if (mo) mo.disconnect();
    if (attrMo) attrMo.disconnect();
    if (ro) ro.disconnect();
    stopChatWatch();
    for (const id of timers) clearTimeout(id);
    timers.clear();
    window.removeEventListener("resize", onWindowResize);
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("pointercancel", onPointerUp, true);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
    if (mql && mql.removeEventListener) mql.removeEventListener("change", onMotionPref);
    for (const a of [A.on, A.boot, A.bootRail, A.bootHold, A.resizing, A.cvGlobal]) html.removeAttribute(a);
    if (window[NS] === api) delete window[NS];
  }

  function state() {
    return {
      enabled,
      reducedMotion: reduced(),
      boot,
      bootAt: bootAt ? Math.round(bootAt) : null,
      bootHeld: bootHeldMs == null ? null : { ms: bootHeldMs, by: bootHeldBy },
      resizing,
      running: Array.from(live.keys()).map((el) => ({
        node: el === html ? "html" : el.id ? "#" + el.id : el.getAttribute("data-testid") || el.tagName.toLowerCase(),
        attrs: live.get(el).attrs,
      })),
      views: prevViews ? Array.from(prevViews.values()).map((v) => ({ kind: v.kind, level: v.level })) : [],
      last,
      counts: { ...counts },
    };
  }

  // Test hooks: replay the boot reveal / the canvas intro on what is on screen.
  function replayBoot() {
    if (!enabled) return false;
    finishAll(null);
    boot = "pending";
    bootCheck();
    if (prevViews) for (const v of topmost(Array.from(prevViews.values()))) enterView(v, "fwd", "boot");
    return boot === "play";
  }
  function replayCanvas(full = true) {
    if (!enabled) return false;
    let croot = null;
    for (const sh of document.querySelectorAll("[data-canvas-shell],[data-rcc-shell]")) if (sh.getClientRects().length) croot = croot || sh;
    if (!croot) return false;
    if (live.has(croot)) finishLive(croot, true);
    if (full) seenCanvas.delete(croot);
    canvasIntro(croot, false);
    return true;
  }

  const api = { state, enable, disable, dispose, replayBoot, replayCanvas, version: 1 };
  window[NS] = api;

  try {
    mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mql.addEventListener) mql.addEventListener("change", onMotionPref);
  } catch (_) {
    mql = null;
  }
  window.addEventListener("resize", onWindowResize);
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerUp, true);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
  if (!flagOff()) enable();
  start();
})();
