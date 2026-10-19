/*
 * RE-TEMPO · hide-devserver-tab (user mod layer)
 * ---------------------------------------------------------------------------
 * Hides the app's "Canvas devserver" tab (the output-only terminal the app
 * opens for a canvas) from the center tab bar. The server keeps running: only
 * the tab is hidden, nothing is closed or killed, so the canvas still works.
 *
 * Detection (by tab type, not by label): the workspaces store (`centerTabs`)
 * holds the tab as { type: "terminal", ephemeral: true, title: "Canvas
 * devserver" }. The tab is matched by that record, then hidden through its
 * DOM id ([role="tab"][data-tab-id="<id>"] { display: none }), so the bar
 * leaves no gap. If the hidden tab is the active one, the previous visible
 * visible tab of the same bar is clicked, so no tab sits
 * in front of invisible content.
 * Without the store (not found yet) the DOM fallback matches tabs whose
 * data-testid is "terminal-tab-*" and whose label is the exact title.
 *
 * Revert: localStorage "rtd.hideDevserverTab" = "off" (applied within 1 s, no
 * reload); remove the key or set "on" to hide again. dispose() reverts too.
 * Hot injection: a <link>/<script> pair added to a live page works without
 * reload (the mod runs on load and finds the store itself).
 * Introspection: window.__RE_TEMPO_HIDE_DEVSERVER__ { state, dispose }.
 * Fragility: the store shape (centerTabs, activeCenterTabId,
 * setActiveCenterTab), the tab title and the terminal-tab testid.
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";
  if (window.__RE_TEMPO_HIDE_DEVSERVER__ && typeof window.__RE_TEMPO_HIDE_DEVSERVER__.dispose === "function") {
    try {
      window.__RE_TEMPO_HIDE_DEVSERVER__.dispose();
    } catch (_) {}
  }
  const LS_KEY = "rtd.hideDevserverTab";
  const TITLE = "Canvas devserver";
  const STYLE_ATTR = "data-rtd-hide-devserver";
  const TAB_SEL = '[role="tab"][data-tab-id]';

  let disposed = false;
  let store = null; // { getState, subscribe }
  let unsub = null;
  let styleEl = null;
  let lastCss = null;
  let raf = 0;
  let timer = 0;
  let scan = null;
  let hiddenIds = [];
  let lastAction = null;
  let lastClickAt = 0;

  const enabled = () => {
    try {
      return localStorage.getItem(LS_KEY) !== "off";
    } catch (_) {
      return true;
    }
  };
  const isDev = (t) => !!t && t.type === "terminal" && t.title === TITLE && t.ephemeral === true;

  // ---------------------------------------------------------------- store
  const isHook = (h) => !!h && typeof h === "object" && "memoizedState" in h && "queue" in h && "next" in h;
  const looksLikeWs = (s) =>
    !!s && typeof s === "object" && Array.isArray(s.centerTabs) && typeof s.setActiveCenterTab === "function";
  // zustand v4 hook: useMemo deps [getState, getServerState, selector, isEqual],
  // then useSyncExternalStore and its subscribe effect (deps [api.subscribe]).
  function probe(f) {
    let h = f && f.memoizedState;
    if (!isHook(h)) return null;
    for (let i = 0; h && i < 400; i++, h = h.next) {
      const ms = h.memoizedState;
      if (!Array.isArray(ms) || ms.length !== 2 || !Array.isArray(ms[0]) || typeof ms[0][0] !== "function") continue;
      if (!Array.isArray(ms[1]) || ms[1].length !== 4 || typeof ms[1][0] !== "function") continue;
      const sync = h.next;
      if (!sync || !sync.queue || sync.queue.getSnapshot !== ms[0][0]) continue;
      const eff = sync.next && sync.next.memoizedState;
      const subscribe = eff && Array.isArray(eff.deps) && eff.deps.length === 1 && typeof eff.deps[0] === "function" ? eff.deps[0] : null;
      try {
        if (looksLikeWs(ms[1][0]())) return { getState: ms[1][0], subscribe };
      } catch (_) {}
    }
    return null;
  }
  function discover() {
    if (store) return true;
    if (!scan) {
      const root = document.getElementById("root");
      let rf = null;
      if (root) for (const k in root) if (k.startsWith("__reactContainer$")) rf = root[k];
      if (!rf) return false;
      scan = { stack: [rf], seen: new WeakSet() };
    }
    const deadline = performance.now() + 8;
    while (scan.stack.length && performance.now() < deadline) {
      const f = scan.stack.pop();
      if (!f || scan.seen.has(f)) continue;
      scan.seen.add(f);
      const hk = probe(f);
      if (hk) {
        store = hk;
        scan = null;
        if (hk.subscribe) {
          try {
            unsub = hk.subscribe(schedule);
          } catch (_) {}
        }
        return true;
      }
      if (f.sibling) scan.stack.push(f.sibling);
      if (f.child) scan.stack.push(f.child);
    }
    if (!scan.stack.length) scan = null;
    return false;
  }

  // ----------------------------------------------------------------- sync
  function sync() {
    raf = 0;
    if (disposed) return;
    let ids = [];
    if (enabled()) {
      if (store) {
        let s = null;
        try {
          s = store.getState();
        } catch (_) {}
        if (s && Array.isArray(s.centerTabs)) {
          ids = s.centerTabs.filter(isDev).map((t) => t.id);
          if (ids.length) avoidActive(s, ids);
        }
      } else {
        discover();
      }
      // DOM fallback: the app's terminal tab with the exact title
      for (const el of document.querySelectorAll(TAB_SEL)) {
        const tid = el.getAttribute("data-testid") || "";
        if (tid.startsWith("terminal-tab") && (el.textContent || "").trim() === TITLE) ids.push(el.getAttribute("data-tab-id"));
      }
    }
    hiddenIds = [...new Set(ids)];
    const css = hiddenIds.map((id) => `${TAB_SEL.replace("[data-tab-id]", `[data-tab-id="${CSS.escape(id)}"]`)}{display:none!important}`).join("\n");
    if (css === lastCss && styleEl && styleEl.isConnected) return;
    lastCss = css;
    if (!styleEl || !styleEl.isConnected) {
      styleEl = document.createElement("style");
      styleEl.setAttribute(STYLE_ATTR, "");
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
  }

  // The hidden tab must not stay in front: click the previous visible tab of its
  // bar (or the first one), the same path as the user's click, so the app picks
  // the right activation for each tab kind (primary chat, canvas, ...).
  function avoidActive(s, ids) {
    const active = s.activeCenterTabId;
    if (!ids.includes(active) || Date.now() - lastClickAt < 600) return;
    const el = [...document.querySelectorAll(TAB_SEL)].find((t) => t.getAttribute("data-tab-id") === active);
    if (!el || !el.parentElement) return;
    const bar = [...el.parentElement.querySelectorAll(TAB_SEL)].filter((t) => !ids.includes(t.getAttribute("data-tab-id")) && t.offsetParent !== null);
    const before = bar.filter((t) => el.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_PRECEDING);
    const target = before[before.length - 1] || bar[0];
    if (!target) return;
    lastClickAt = Date.now();
    target.click();
    lastAction = { at: lastClickAt, from: active, to: target.getAttribute("data-tab-id") };
  }

  function schedule() {
    if (disposed || raf) return;
    raf = requestAnimationFrame(sync);
  }

  const onStorage = (e) => {
    if (!e || e.key === LS_KEY || e.key === null) schedule();
  };
  const mo = new MutationObserver(schedule);
  const start = () => {
    if (disposed) return;
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("storage", onStorage);
    timer = setInterval(schedule, 1000);
    schedule();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();

  window.__RE_TEMPO_HIDE_DEVSERVER__ = {
    state: () => ({ enabled: enabled(), hasStore: !!store, hidden: [...hiddenIds], lastAction }),
    dispose: () => {
      disposed = true;
      mo.disconnect();
      clearInterval(timer);
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("storage", onStorage);
      if (unsub) try { unsub(); } catch (_) {}
      if (styleEl) styleEl.remove();
      delete window.__RE_TEMPO_HIDE_DEVSERVER__;
    },
  };
})();
