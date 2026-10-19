/*
 * RE-TEMPO · effort-levels (user MOD layer)
 * ---------------------------------------------------------------------------
 * Adds "Extra High" (xhigh) to the composer's Effort menu for the Claude models
 * that the bundled CLI accepts at xhigh but that the Tempo bundle left out
 * (currently: Opus 5 1M and Opus 5).
 *
 * The bundle blocks xhigh in 3 places, all internal to the minified module:
 *   1) the menu list (a function with chained `model===...`) -> item injected into the DOM;
 *   2) the Set of xhigh-capable models used by tK(), which downgrades xhigh -> high when
 *      creating a chat from the defaults (e.g. Generate);
 *   3) the Set used on model switch, which downgrades xhigh -> high.
 * (2) and (3) are literal Sets created while the bundle evaluates. This script runs
 * BEFORE the bundle (classic script in <body>; the bundle is type=module and is only
 * evaluated ~40-100 ms after DOMContentLoaded), so it wraps Set.prototype.add until
 * both Sets show up: when a Set receives the marker "opus-4.7-1m" and does not yet
 * contain the XHIGH_MODELS, it gets those models too. The only other Set with the
 * marker (cost warnings) already contains them and stays unchanged. The native add
 * is then restored (zero cost after boot).
 *
 * The menu item calls the picker's own onEffortChange("xhigh") (read from the React
 * fiber), so the value goes to the same store and persists like the native options.
 * The button label is fixed in the DOM (the app falls back to "Medium" for ids
 * outside its own list).
 *
 * It also strips the " 1M" suffix (context window) from the model name in the
 * pickers; see section 3.
 *
 * Revert: remove the <script src="./mod/effort-levels.js"> tag from index.html.
 * Debug: window.__RE_TEMPO_EFFORT__.state()
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";
  if (window.__RE_TEMPO_EFFORT__?.dispose) window.__RE_TEMPO_EFFORT__.dispose();

  // Models (renderer ids) that get xhigh. CLI 2.1.280 only rejects xhigh for
  // opus 4.0-4.6, sonnet 4.0-4.6, haiku 4.5 and claude-3; everything else is accepted.
  const XHIGH_MODELS = ["opus-5-1m", "opus-5"];
  const MARKER = "opus-4.7-1m";
  const LABEL = "Extra High";
  const OPT = "chat-input-effort-option-";
  const TRIGGER = '[data-testid="chat-input-effort-selector"]';
  const CHECK_SVG =
    '<svg class="text-text-tertiary" width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';

  let patchTimer = 0, observer = null, interval = 0, rafId = 0, disposed = false;
  const state = { patchedSets: 0, setPatch: "inactive", injected: 0, picked: 0 };

  // --- 1) Bundle capability Sets ------------------------------------------------
  const nativeAdd = Set.prototype.add;
  const TARGET_SETS = 2; // tK() Set + model-switch Set
  function restoreAdd(why) {
    if (Set.prototype.add === addWithXhighModels) Set.prototype.add = nativeAdd;
    state.setPatch = why;
  }
  function addWithXhighModels(value) {
    if (value === MARKER) {
      let added = false;
      for (const m of XHIGH_MODELS) {
        if (!this.has(m)) {
          nativeAdd.call(this, m);
          added = true;
        }
      }
      if (added && ++state.patchedSets >= TARGET_SETS) {
        nativeAdd.call(this, value);
        restoreAdd("done");
        return this;
      }
    }
    return nativeAdd.call(this, value);
  }
  if (document.readyState === "loading") {
    Set.prototype.add = addWithXhighModels;
    state.setPatch = "active";
    // safety net: if the bundle changes and the Sets never show up, don't stay wrapped
    patchTimer = setTimeout(() => state.setPatch === "active" && restoreAdd("timeout"), 10000);
  } else {
    // loaded after the bundle: only the menu works; tK/model switch still downgrade
    state.setPatch = "skipped (bundle already evaluated)";
  }

  // --- 2) Menu and label --------------------------------------------------------
  // Composer effort picker props: { model: string, effort, onEffortChange, provider }
  function pickerProps(node) {
    const key = Object.keys(node).find((k) => k.startsWith("__reactFiber$"));
    for (let f = key && node[key], i = 0; f && i < 60; f = f.return, i++) {
      const p = f.memoizedProps;
      if (p && typeof p.onEffortChange === "function" && typeof p.model === "string" && "effort" in p) return p;
    }
    return null;
  }

  const supportsXhigh = (p) => !!p && (p.provider ?? "claude") === "claude" && XHIGH_MODELS.includes(p.model);

  function closeMenu(item) {
    const opts = { key: "Escape", code: "Escape", bubbles: true, cancelable: true };
    (item.closest('[role="menu"]') || document.activeElement || document.body).dispatchEvent(
      new KeyboardEvent("keydown", opts)
    );
  }

  function injectItem(maxItem) {
    const group = maxItem.parentElement;
    if (!group || group.querySelector(`[data-testid="${OPT}xhigh"]`)) return;
    const highItem = group.querySelector(`[data-testid="${OPT}high"]`);
    const p = pickerProps(maxItem);
    if (!highItem || !supportsXhigh(p)) return;

    const item = highItem.cloneNode(true);
    item.removeAttribute("id");
    item.removeAttribute("data-highlighted");
    item.setAttribute("tabindex", "-1");
    item.dataset.testid = `${OPT}xhigh`;
    item.dataset.reEffortMod = "";
    item.replaceChildren();
    const label = document.createElement("span");
    label.className = "flex-1";
    label.textContent = LABEL;
    item.append(label);
    if (p.effort === "xhigh") item.insertAdjacentHTML("beforeend", CHECK_SVG);

    item.addEventListener("mouseenter", () => {
      for (const el of group.querySelectorAll("[data-highlighted]")) el.removeAttribute("data-highlighted");
      item.setAttribute("data-highlighted", "");
    });
    item.addEventListener("mouseleave", () => item.removeAttribute("data-highlighted"));
    item.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const cur = pickerProps(maxItem) || p; // fresh picker props
      cur.onEffortChange("xhigh");
      state.picked++;
      closeMenu(item);
      schedule();
    });

    group.insertBefore(item, maxItem);
    state.injected++;
  }

  function syncTrigger(btn) {
    const span = btn.querySelector("span");
    if (!span) return;
    const p = pickerProps(btn);
    if (p && p.effort === "xhigh" && supportsXhigh(p)) {
      if (span.textContent !== LABEL) {
        btn.dataset.reEffortNative = span.textContent;
        span.textContent = LABEL;
      }
      if (btn.getAttribute("aria-label") !== `Effort: ${LABEL}`) btn.setAttribute("aria-label", `Effort: ${LABEL}`);
    } else if (btn.dataset.reEffortNative != null) {
      // React only rewrites the text when its own label changes; restore the native one
      const native = btn.dataset.reEffortNative;
      if (span.textContent === LABEL) span.textContent = native;
      if (btn.getAttribute("aria-label") === `Effort: ${LABEL}`) btn.setAttribute("aria-label", `Effort: ${native}`);
      delete btn.dataset.reEffortNative;
    }
  }

  // --- 3) Model name without " 1M" ----------------------------------------------
  // " 1M" is the context window, not part of the name. It is removed from the picker
  // button (composers, Agents editor and Settings). It is removed from the menu too,
  // except when the same group (provider) has the non-1M variant: then a subtle
  // "1M ctx" stays, so there are no two identical items. Only the rendered text
  // changes; the model id/value stays the same.
  const CTX_RE = /\s+1M$/;
  const MODEL_TRIGGERS =
    '[data-testid="chat-input-model-selector"], [data-testid="agent-prop-model"], #settings-default-chat-model';
  const MODEL_ITEMS =
    '[data-testid^="chat-input-model-option-"], [data-testid^="agent-model-option-"], [data-testid^="settings-default-chat-model-"]';

  // full name coming from the app (React rewrites the text when the model changes)
  const fullName = (span) => (span.dataset.reShown === span.textContent ? span.dataset.reFull : span.textContent);

  function renderName(span, full, withCtx) {
    const base = full.replace(CTX_RE, "");
    if (withCtx) {
      const ctx = document.createElement("span");
      ctx.className = "text-text-tertiary";
      ctx.style.cssText = "margin-left:6px;font-size:0.85em;font-weight:400";
      ctx.textContent = "1M ctx";
      span.replaceChildren(base, ctx);
    } else {
      span.textContent = base;
    }
    span.dataset.reFull = full;
    span.dataset.reShown = span.textContent;
  }

  function syncModelLabels() {
    for (const trig of document.querySelectorAll(MODEL_TRIGGERS)) {
      for (const span of trig.querySelectorAll("span")) {
        if (span.childElementCount) continue;
        const full = fullName(span);
        if (CTX_RE.test(full) && span.textContent !== full.replace(CTX_RE, "")) renderName(span, full, false);
      }
    }
    for (const item of document.querySelectorAll(MODEL_ITEMS)) {
      const span = item.querySelector(":scope > span.flex-1");
      if (!span) continue;
      const full = fullName(span);
      if (!CTX_RE.test(full)) continue;
      const base = full.replace(CTX_RE, "");
      const group = item.closest('[role="group"]') || item.parentElement;
      const hasPlain = [...group.querySelectorAll(MODEL_ITEMS)].some((o) => {
        const s = o !== item && o.querySelector(":scope > span.flex-1");
        return s && fullName(s) === base;
      });
      const shown = hasPlain ? `${base}1M ctx` : base;
      if (span.textContent !== shown) renderName(span, full, hasPlain);
    }
  }

  let scheduled = false;
  function sync() {
    scheduled = false;
    for (const max of document.querySelectorAll(`[data-testid="${OPT}max"]`)) injectItem(max);
    for (const btn of document.querySelectorAll(TRIGGER)) syncTrigger(btn);
    syncModelLabels();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    rafId = requestAnimationFrame(sync);
  }

  function start() {
    // characterData: React updates single-text <span> children via nodeValue
    if (disposed) return;
    observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    // effort can change without touching the DOM (e.g. xhigh -> medium keeps the text "Medium")
    interval = setInterval(schedule, 1000);
    schedule();
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });

  function dispose() {
    disposed = true;
    observer?.disconnect();
    clearInterval(interval);
    clearTimeout(patchTimer);
    cancelAnimationFrame(rafId);
    document.removeEventListener("DOMContentLoaded", start);
    if (Set.prototype.add === addWithXhighModels) Set.prototype.add = nativeAdd;
  }

  window.__RE_TEMPO_EFFORT__ = {
    models: XHIGH_MODELS,
    dispose,
    state: () => ({
      ...state,
      setAddNative: Set.prototype.add === nativeAdd,
      pickers: [...document.querySelectorAll(TRIGGER)].map((b) => {
        const p = pickerProps(b);
        return p && { model: p.model, provider: p.provider ?? "claude", effort: p.effort, label: b.textContent };
      }),
    }),
  };
})();
