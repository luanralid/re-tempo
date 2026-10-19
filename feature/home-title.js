/*
 * RE-TEMPO · home-title (user MOD layer)
 * ---------------------------------------------------------------------------
 * Replaces the logged-out HOME heading "Let's Cook." with other text.
 * This is its OWN file, loaded via the out/renderer/mod -> feature/ symlink.
 * It does NOT touch Tempo's minified bundle; it only rewrites the text in the DOM at runtime.
 *
 * Resilient to React re-renders and navigation: a MutationObserver reapplies the
 * swap synchronously (before paint) whenever the original node ("Let's Cook.") reappears.
 *
 * To edit LIVE: change the TARGET constant below and save; the watcher
 * (tools/live-reload.mjs) reloads the window and the new text shows up.
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  // Source text (normalized) and target text. Edit TARGET live.
  const SOURCE_NORM = "let's cook";
  const TARGET = "Let's do it";

  // normalize: curly apostrophe -> straight, trim spaces and one trailing period, lowercase
  const norm = (s) =>
    s.replace(/[‘’ʼ]/g, "'").trim().replace(/\.$/, "").toLowerCase();

  function swap(n) {
    const v = n.nodeValue;
    if (!v || !v.trim() || norm(v) !== SOURCE_NORM) return 0;
    const lead = (v.match(/^\s*/) || [""])[0];
    const tail = (v.match(/\s*$/) || [""])[0];
    n.nodeValue = lead + TARGET + tail;
    return 1;
  }

  function walk(root) {
    if (!root) return 0;
    if (root.nodeType === Node.TEXT_NODE) return swap(root);
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return 0;
    let changed = 0;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) changed += swap(n);
    return changed;
  }

  function mark(changed) {
    if (changed) {
      window.__RE_TEMPO_HOME_TITLE__ = { target: TARGET, changed, at: Date.now() };
    }
    return changed;
  }

  function apply() {
    if (!document.body) return 0;
    return mark(walk(document.body));
  }

  // MutationObserver callbacks run as a microtask, before the next paint, so
  // swapping only the added/changed text right here means "Let's Cook." is
  // never painted (the old deferred full re-scan let it flash for a frame on
  // the chat empty state) and no full-document walk runs per mutation.
  function onMutations(records) {
    let changed = 0;
    for (const r of records) {
      if (r.type === "characterData") changed += swap(r.target);
      else for (const n of r.addedNodes) changed += walk(n);
    }
    mark(changed);
  }

  function boot() {
    window.__RE_TEMPO_HOME_TITLE_TARGET__ = TARGET; // introspection for tests/automation
    apply();
    try {
      const obs = new MutationObserver(onMutations);
      obs.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      window.__RE_TEMPO_HOME_TITLE_OBS__ = true;
    } catch (_) {
      /* without an observer it still swaps what already exists */
    }
  }

  // Observe right away (the script runs at the end of <body>, before the app's
  // module bundle renders), so even the very first render is swapped pre-paint.
  boot();
})();
