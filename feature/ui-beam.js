/*
 * RE-TEMPO · ui-beam (user MOD layer; vanilla JS / CSS / SVG)
 * ---------------------------------------------------------------------------
 * A visible agent handoff: message pulse -> rounded beam + Claude avatar ->
 * target frame. Load this script and the sibling ui-beam.css; the script also
 * loads that stylesheet when it has a src. No app bundle, routing or clicks.
 *
 * Reference choreography reproduced from the user's local projects:
 * ~/Projects/karumi/src/features/onboarding/JourneyTransition.jsx:
 *   staged source/flight, SVG dash reveal, getPointAtLength tip, soft glow;
 * ~/Projects/karumi/src/features/onboarding/journey-path.js:
 *   nearest-edge handoff and rounded travel around pane boundaries;
 * ~/Projects/karumi/src/features/onboarding/Spotlight.jsx and
 * ~/Projects/karumi/src/styles/onboarding.css: rounded halo/frame;
 * ~/Projects/portfolio/src/guide/GuidePointer.jsx and pointer.js:
 *   cubic-bezier(.4,0,.2,1) travel and arrival-gated action Promise. The current
 *   portfolio uses an ASCII leader; this reproduces its earlier Karumi-like
 *   motion, not that ASCII styling. portfolio/docs/guide.md documents the
 *   earlier Cato/backoffice handoff (460 ms source, 420 ms flight, 300 ms hold);
 *   its staged perimeter/flight rhythm is adapted, with no post-arrival hold.
 *   Karumi's longer intro is compressed to
 *   180 ms source + 900 ms flight = 1080 ms arrival; frame fades over 1500 ms.
 *   Claude's orange asterisk breathes without rotation; the beam uses app ink.
 *
 * API: window.__RE_TEMPO_UI_BEAM__ = { play(detail), cancel(), settings() }.
 * detail = { id, action, args, sourceRect, targetEl?, targetRect?, label? }.
 * Rects use viewport CSS pixels: DOMRect or {x,y,width,height} / edge fields.
 * play -> Promise<void> at avatar arrival (NOT after the frame's fade). FIFO
 * flights; their fading frames may coexist. The same id (or detail object)
 * shares one Promise, including event + direct API calls. Last 100 ids retained
 * until cancel(); callers must use unique action ids. No action is executed.
 * Window rtud:action calls play(event.detail); rtud:done accepts {id} or an id.
 * Done clears travel after arrival; it never skips a queued/unfinished flight.
 * After done, the frame rejoins the top layer above any dialog just opened.
 * A frame remains for its 1500 ms fade, then the entire overlay is removed.
 * cancel() removes all visuals and resolves active/queued Promises immediately.
 * Missing target: 320 ms searching pulse. Hidden document: resolves immediately.
 * Reduced motion: 180 ms pulse + frame,
 * no travel/path. localStorage['rtd.uiBeam'] === 'off': immediate resolution.
 * settings() -> { enabled, reducedMotion, durationMs, sourceMs, outlineMs,
 *   activeId, queueLength, overlayCount, lastArrival:{id,x,y,at}|null }.
 * Prefix: rtub-. Manual popover top layer when available; fixed fallback.
 * Every overlay is noninteractive and hidden from assistive technology.
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";
  if (window.__RE_TEMPO_UI_BEAM__) return;

  const SOURCE_MS = 180;
  const DURATION_MS = 1080;
  const OUTLINE_MS = 1500;
  const SEARCH_MS = 320;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const queue = [];
  const jobs = new Set();
  const byId = new Map();
  let byDetail = new WeakMap();
  let active = null;
  let sequence = 0;
  let lastArrival = null;

  const script = document.currentScript;
  if (script && script.src) {
    const href = new URL("ui-beam.css", script.src).href;
    if (!Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(link => link.href === href)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    }
  }

  function enabled() {
    try { return localStorage.getItem("rtd.uiBeam") !== "off"; }
    catch (_) { return true; }
  }

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  function rect(value) {
    if (!value) return null;
    const left = Number(value.left ?? value.x);
    const top = Number(value.top ?? value.y);
    const width = Number(value.width ?? (value.right - left));
    const height = Number(value.height ?? (value.bottom - top));
    if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    const x = clamp(left, 0, innerWidth);
    const y = clamp(top, 0, innerHeight);
    const right = clamp(left + width, 0, innerWidth);
    const bottom = clamp(top + height, 0, innerHeight);
    return right > x && bottom > y ? { left: x, top: y, right, bottom, width: right - x, height: bottom - y } : null;
  }

  function targetRect(job) {
    const el = job.detail.targetEl;
    if (el && typeof el.getBoundingClientRect === "function") {
      if (!el.isConnected) return job.arrived ? null : rect(job.detail.targetRect);
      return rect(el.getBoundingClientRect());
    }
    return rect(job.detail.targetRect);
  }

  function element(tag, className, parent, svg = false) {
    const node = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    node.setAttribute("class", className);
    if (parent) parent.appendChild(node);
    return node;
  }

  function position(node, x, y) {
    node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  function placeBox(node, box, pad = 0) {
    position(node, box.left - pad, box.top - pad);
    node.style.width = `${box.width + pad * 2}px`;
    node.style.height = `${box.height + pad * 2}px`;
  }

  // Invert the x curve, then evaluate y: matches the references' exact easing.
  function ease(progress) {
    let low = 0, high = 1, t = progress;
    for (let i = 0; i < 12; i++) {
      const x = 1.2 * (1 - t) * (1 - t) * t + 0.6 * (1 - t) * t * t + t * t * t;
      if (x < progress) low = t; else high = t;
      t = (low + high) / 2;
    }
    return 3 * (1 - t) * t * t + t * t * t;
  }

  function route(source, target) {
    const center = { x: source.left + source.width / 2, y: source.top + source.height / 2 };
    const inset = Math.min(12, target.width / 6, target.height / 6);
    const end = [
      { x: target.left, y: clamp(center.y, target.top + inset, target.bottom - inset), horizontal: true },
      { x: target.right, y: clamp(center.y, target.top + inset, target.bottom - inset), horizontal: true },
      { x: clamp(center.x, target.left + inset, target.right - inset), y: target.top, horizontal: false },
      { x: clamp(center.x, target.left + inset, target.right - inset), y: target.bottom, horizontal: false },
    ].sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y))[0];
    const horizontal = end.x < source.left || end.x > source.right ? true :
      end.y < source.top || end.y > source.bottom ? false : end.horizontal;
    const start = horizontal ? { x: end.x >= center.x ? source.right : source.left, y: center.y } :
      { x: center.x, y: end.y >= center.y ? source.bottom : source.top };
    const middle = horizontal ? (start.x + end.x) / 2 : (start.y + end.y) / 2;
    let points = horizontal ? [start, { x: middle, y: start.y }, { x: middle, y: end.y }, end] :
      [start, { x: start.x, y: middle }, { x: end.x, y: middle }, end];
    // Aligned panes still get a shallow rounded shoulder through their gutter,
    // rather than losing the handoff's characteristic flowing contour.
    if (horizontal && Math.abs(end.y - start.y) < 48 && Math.abs(end.x - start.x) > 90) {
      const shoulder = (end.x - start.x) * .22;
      const detour = Math.min(42, Math.abs(end.x - start.x) * .15) * (start.y > 80 ? -1 : 1);
      points = [start, { x: start.x + shoulder, y: start.y },
        { x: start.x + shoulder, y: start.y + detour },
        { x: end.x - shoulder, y: start.y + detour },
        { x: end.x - shoulder, y: end.y }, end];
    }
    let d = `M ${start.x} ${start.y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1], b = points[i], c = points[i + 1];
      const incoming = Math.hypot(b.x - a.x, b.y - a.y);
      const outgoing = Math.hypot(c.x - b.x, c.y - b.y);
      const radius = Math.min(28, incoming / 2, outgoing / 2);
      if (!radius) { d += ` L ${b.x} ${b.y}`; continue; }
      d += ` L ${b.x - (b.x - a.x) / incoming * radius} ${b.y - (b.y - a.y) / incoming * radius}`;
      d += ` Q ${b.x} ${b.y} ${b.x + (c.x - b.x) / outgoing * radius} ${b.y + (c.y - b.y) / outgoing * radius}`;
    }
    d += ` L ${end.x} ${end.y}`;
    // An overlapping source/target can share the same edge midpoint.
    if (Math.hypot(end.x - start.x, end.y - start.y) < 1) d = `M ${start.x} ${start.y} q 12 -16 0 0`;
    return { d, start, end };
  }

  function createVisuals(job, source, target) {
    const root = element("div", "rtub-root", document.body || document.documentElement);
    root.dataset.rtubRoot = "";
    root.dataset.actionId = job.id;
    root.setAttribute("aria-hidden", "true");
    root.setAttribute("popover", "manual");
    job.root = root;
    try { if (root.showPopover) root.showPopover(); } catch (_) { /* fixed overlay fallback */ }
    const travel = job.travel = element("div", "rtub-travel", root);
    const sourcePulse = element("div", "rtub-source", travel);
    placeBox(sourcePulse, source, 3);
    if (!job.reduced) {
      const perimeter = element("svg", "rtub-source-trace", sourcePulse, true);
      perimeter.setAttribute("viewBox", `0 0 ${source.width + 6} ${source.height + 6}`);
      const border = element("rect", "", perimeter, true);
      for (const [name, value] of Object.entries({ x: 1, y: 1, width: source.width + 4, height: source.height + 4, rx: 14, pathLength: 1 })) {
        border.setAttribute(name, value);
      }
    }
    if (job.reduced) root.classList.add("rtub-reduced");
    if (!target) root.classList.add("rtub-searching");

    const geometry = target ? route(source, target) : { start: { x: source.right - 18, y: source.top + source.height / 2 } };
    job.end = geometry.end || geometry.start;
    if (target && !job.reduced) {
      const svg = element("svg", "rtub-svg", travel, true);
      const halo = element("path", "rtub-path-glow", svg, true);
      const path = element("path", "rtub-path", svg, true);
      for (const node of [halo, path]) node.setAttribute("d", geometry.d);
      job.path = path;
      job.paths = [halo, path];
      job.length = path.getTotalLength();
      for (const node of job.paths) {
        node.style.strokeDasharray = `${job.length} ${job.length}`;
        node.style.strokeDashoffset = String(job.length);
      }
    }
    const avatar = job.avatar = element("div", "rtub-avatar", travel);
    const face = element("div", "rtub-avatar-face", avatar);
    const glyph = element("svg", "rtub-glyph", face, true);
    glyph.setAttribute("viewBox", "0 0 32 32");
    // Twelve uneven rays evoke Claude's asterisk; their orientation is fixed.
    const star = element("path", "", glyph, true);
    star.setAttribute("d", "M14.6 2.2h2.7l-.2 9.1 4.2-8 2.4 1.4-4.8 7.8 7.8-4.8 1.4 2.4-8.1 4.5 9.2-.3v2.8l-9.1-.2 8 4.2-1.4 2.4-7.8-4.8 4.8 7.8-2.4 1.4-4.4-8.1.3 9.2h-2.8l.2-9.1-4.2 8-2.4-1.4 4.8-7.8-7.8 4.8-1.4-2.4 8.1-4.4-9.2.3v-2.8l9.1.2-8-4.2 1.4-2.4 7.8 4.8-4.8-7.8 2.4-1.4 4.4 8.1z");
    position(avatar, geometry.start.x, geometry.start.y);
  }

  function labelFor(detail) {
    if (detail.label) return String(detail.label).slice(0, 120);
    const text = String(detail.action || "Using interface").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_.:-]+/g, " ").trim();
    const readable = text.replace(/^open\b/i, "Opening").replace(/^focus\b/i, "Focusing").replace(/^navigate\b/i, "Navigating");
    return readable.charAt(0).toUpperCase() + readable.slice(1, 120);
  }

  function settle(job) {
    if (job.settled) return;
    job.settled = true;
    job.resolve();
  }

  function remove(job) {
    cancelAnimationFrame(job.frame);
    clearTimeout(job.timeout);
    if (job.root) job.root.remove();
    jobs.delete(job);
  }

  function arrive(job) {
    if (active !== job) return;
    const box = targetRect(job);
    job.arrived = true;
    job.root.dataset.phase = "arrived";
    if (box) {
      const outline = job.outline = element("div", "rtub-outline", job.root);
      outline.dataset.targetId = job.detail.targetEl?.id || "";
      const label = element("div", "rtub-label", job.root);
      label.textContent = labelFor(job.detail);
      const started = performance.now();
      const follow = () => {
        const current = targetRect(job);
        if (!current || !enabled()) { remove(job); return; }
        placeBox(outline, current, 3);
        if (job.detail.targetEl) {
          const radius = parseFloat(getComputedStyle(job.detail.targetEl).borderTopLeftRadius) || 10;
          outline.style.borderRadius = `${radius + 3}px`;
        }
        const labelY = current.top >= 44 ? current.top - 38 : Math.min(innerHeight - 38, current.bottom + 10);
        position(label, clamp(current.left, 8, Math.max(8, innerWidth - label.offsetWidth - 8)), labelY);
        if (performance.now() - started < OUTLINE_MS) job.frame = requestAnimationFrame(follow);
      };
      follow();
      job.timeout = setTimeout(() => remove(job), OUTLINE_MS);
    } else {
      job.timeout = setTimeout(() => remove(job), 180);
    }
    lastArrival = { id: job.id, x: job.end.x, y: job.end.y, at: performance.now() };
    job.travel.classList.add("rtub-travel-leave");
    if (job.done) job.travel.remove();
    active = null;
    settle(job);
    // Let ui-drive's awaiting continuation execute before measuring the next job.
    queueMicrotask(drain);
  }

  function drain() {
    if (active || !queue.length) return;
    const job = active = queue.shift();
    if (!enabled()) { active = null; settle(job); remove(job); queueMicrotask(drain); return; }
    job.reduced = media.matches;
    const source = rect(job.detail.sourceRect) || rect({ x: 24, y: Math.max(24, innerHeight - 80), width: 48, height: 48 });
    const target = targetRect(job);
    try { createVisuals(job, source, target); }
    catch (_) { active = null; remove(job); settle(job); queueMicrotask(drain); return; }
    job.root.dataset.phase = target ? "source" : "searching";
    const duration = !target ? SEARCH_MS : job.reduced ? SOURCE_MS : DURATION_MS;
    const start = performance.now();
    const tick = now => {
      if (active !== job) return;
      if (!enabled()) { cancel(); return; }
      const elapsed = now - start;
      if (job.path) {
        const progress = ease(clamp((elapsed - SOURCE_MS) / (DURATION_MS - SOURCE_MS), 0, 1));
        const point = job.path.getPointAtLength(progress * job.length);
        position(job.avatar, point.x, point.y);
        for (const path of job.paths) path.style.strokeDashoffset = String(job.length * (1 - progress));
        job.root.dataset.phase = elapsed < SOURCE_MS ? "source" : "travel";
      }
      if (elapsed >= duration) {
        if (target && !job.reduced) position(job.avatar, job.end.x, job.end.y);
        arrive(job);
      } else job.frame = requestAnimationFrame(tick);
    };
    job.frame = requestAnimationFrame(tick);
  }

  function play(detail = {}) {
    if (!detail || typeof detail !== "object") detail = {};
    const explicitId = detail.id == null ? null : String(detail.id);
    const existing = explicitId !== null ? byId.get(explicitId) : byDetail.get(detail);
    if (existing) return existing.promise;
    if (!enabled() || document.hidden) return Promise.resolve();
    const job = { id: explicitId ?? `rtub-${++sequence}`, detail, settled: false, frame: 0 };
    job.promise = new Promise(resolve => { job.resolve = resolve; });
    if (explicitId !== null) {
      byId.set(explicitId, job);
      // Never evict an unfinished job; duplicate callers must share its Promise.
      if (byId.size > 100) for (const [id, saved] of byId) {
        if (saved.settled && !jobs.has(saved)) byId.delete(id);
        if (byId.size <= 100) break;
      }
    } else byDetail.set(detail, job);
    jobs.add(job);
    queue.push(job);
    drain();
    return job.promise;
  }

  function cancel() {
    active = null;
    queue.length = 0;
    for (const job of jobs) { remove(job); settle(job); }
    byId.clear();
    byDetail = new WeakMap();
  }

  window.addEventListener("rtud:action", event => { play(event.detail); });
  window.addEventListener("rtud:done", event => {
    const detail = event.detail;
    const id = detail && typeof detail === "object" ? detail.id : detail;
    const job = id == null ? active : byId.get(String(id));
    if (!job) return;
    job.done = true;
    if (job.arrived && job.travel) {
      job.travel.remove();
      // ui-drive may have opened a native dialog after our arrival Promise.
      // No focusable descendants or autofocus: reopening never takes focus.
      if (job.root?.isConnected && job.root.hidePopover && job.root.showPopover) {
        try { job.root.hidePopover(); job.root.showPopover(); } catch (_) { /* fixed fallback */ }
      }
    }
  });
  window.addEventListener("pagehide", cancel);
  window.addEventListener("storage", event => { if (event.key === "rtd.uiBeam" && !enabled()) cancel(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) cancel(); });
  window.__RE_TEMPO_UI_BEAM__ = {
    play,
    cancel,
    settings: () => ({ enabled: enabled(), reducedMotion: media.matches, durationMs: DURATION_MS,
      sourceMs: SOURCE_MS, outlineMs: OUTLINE_MS, activeId: active?.id ?? null,
      queueLength: queue.length, overlayCount: Array.from(jobs).filter(job => job.root?.isConnected).length,
      lastArrival: lastArrival ? { ...lastArrival } : null }),
  };
})();
