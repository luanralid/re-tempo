/*
 * RE-TEMPO · agent-follow (user MOD layer)
 * Figma-style follow for canvas comment agents. No app bundle modifications.
 * API: window.__RE_TEMPO_AGENT_FOLLOW__ = {follow(id), unfollow(), following(),
 * settings(), dispose()}. following() returns the task id, or null. settings()
 * exposes the active view path, lifecycle/animation counters and errors.
 * Entry points: rtcb:follow {detail:{id}}, Alt-click a task bubble, public API.
 * Flag: localStorage['rtd.agentFollow'] = 'off'. No timers/observers while idle.
 *
 * View writes, in priority order:
 * 1. The actual infinite-canvas imperative ref's getView()/setView(view), found
 *    in React ancestor refs/hooks (same discovery as canvas-snap). Confirmed
 *    in index-D2Ui1vc0.js: setView cancels wheel inertia, calls the native view
 *    setter, and notifies the app. Never mutate React state or fiber fields.
 * 2. CSS --canvas-view-x/y/zoom ONLY when the world transform itself consumes
 *    those variables. The native app's pin-only variables are not sufficient.
 * 3. Native wheel events on the canvas (pan and Ctrl-wheel zoom), read back on
 *    later ticks; this preserves native state when no writable ref is exposed.
 *    Native zoom uses exp(-deltaY * .012) for trackpad deltas below 15 px.
 *
 * Focus: agent-cursors.state().cursors[].world, else storyboard center, else
 * task.anchor. Fit the focused storyboard with a 10% margin on each side and
 * clamp 0.25..2. A 250 ms poll shares the elapsed clock, pause deadline, and
 * completion deadline. Store subscription and focused-storyboard observers
 * coalesce in a microtask. One rAF chain exists only during an actual tween.
 * Native input pauses for 4 seconds after the last interaction; a held pointer
 * cannot time out. Same-origin focused iframes also observe input and changes.
 * Reduced motion jumps directly. All active resources are removed on unfollow.
 */
(() => {
  'use strict';
  const previous = window.__RE_TEMPO_AGENT_FOLLOW__;
  if (previous && typeof previous.dispose === 'function') previous.dispose();
  const ROOT = '[data-canvas-root]';
  const WORLD = '.tds-canvas-shimmer-origin';
  const ITEM = '[data-canvas-item-id]';
  const FLAG = 'rtd.agentFollow';
  const POLL_MS = 250, PAUSE_MS = 4000, DONE_MS = 3000, EASE_MS = 220;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finite = Number.isFinite;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const key = (s) => String(s || '').trim().replace(/\s*[⌄˅▾▼]\s*$/, '').replace(/\.canvas\.[jt]sx?$/, '').toLowerCase();
  const validView = (v) => v && [v.x, v.y, v.zoom].every(finite) && v.zoom > 0;
  const point = (v) => v && finite(v.x) && finite(v.y);
  const enabled = () => { try { return localStorage.getItem(FLAG) !== 'off'; } catch (_) { return true; } };
  let current = null, disposed = false, lastPath = null;
  const metrics = { frames: 0, viewWrites: 0, pollTicks: 0, sessions: 0, animationMs: 0 };
  const errors = [];
  function note(e) { errors.push(String(e && e.message || e)); if (errors.length > 8) errors.shift(); }
  function store() { return window.__RE_TEMPO_COMMENT_AGENT__; }
  function tasks() { try { const s = store(); return s && typeof s.tasks === 'function' ? s.tasks() : []; } catch (e) { note(e); return []; } }
  function task(id) { try { const s = store(); return s && typeof s.task === 'function' ? s.task(id) : tasks().find((t) => String(t.id) === id); } catch (e) { note(e); return null; } }
  function cursor(id) {
    try {
      const api = window.__RE_TEMPO_AGENT_CURSORS__;
      const state = api && typeof api.state === 'function' && api.state();
      return state && Array.isArray(state.cursors) && state.cursors.find((c) => String(c.id) === id && c.attached !== false) || null;
    } catch (e) { note(e); return null; }
  }
  function shown(el) { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden'; }
  function rootNames(root) {
    const names = [root.getAttribute('data-canvas-name')];
    const box = root.getBoundingClientRect();
    for (const el of document.querySelectorAll('[aria-label="Canvas page"], [data-rcq-switch]')) {
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.left >= box.left - 12 && r.left < box.left + box.width / 2 && r.top >= box.top - 12 && r.top <= box.top + 80) names.push((el.querySelector('span') || el).textContent);
    }
    for (const bar of document.querySelectorAll('[data-testid="design-view-tab-bar"]')) {
      if (!shown(bar)) continue;
      const r = bar.getBoundingClientRect();
      if (r.right <= box.left || r.left >= box.right || r.top > box.top + 60 || r.bottom < box.top - 90) continue;
      const active = bar.querySelector('[aria-selected="true"], [data-state="active"], [data-active="true"]');
      if (active) names.push((active.textContent || '').split('\n').map((v) => v.trim()).find(Boolean));
    }
    return names.map(key).filter(Boolean);
  }
  function pickRoot(t, c) {
    const roots = [...document.querySelectorAll(ROOT)].filter(shown);
    const id = c && c.itemId || t.anchor && t.anchor.nodeId;
    if (id) {
      const matches = roots.filter((r) => [...r.querySelectorAll(ITEM)].some((n) => n.getAttribute('data-canvas-item-id') === String(id)));
      if (matches.length === 1) {
        const names = rootNames(matches[0]);
        return !t.canvasName || !names.length || names.includes(key(t.canvasName)) ? matches[0] : null;
      }
      if (matches.length > 1) return matches.find((r) => rootNames(r).includes(key(t.canvasName))) || null;
    }
    const name = key(t.canvasName);
    if (name) {
      const matches = roots.filter((r) => rootNames(r).includes(name));
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) return null;
    }
    // An unnamed, unique canvas is safe; never jump to a conflicting named view.
    return roots.length === 1 && (!name || !rootNames(roots[0]).length || rootNames(roots[0]).includes(name)) ? roots[0] : null;
  }
  function handleOf(root) {
    const fiberKey = Object.keys(root).find((k) => k.startsWith('__reactFiber$'));
    let f = fiberKey && root[fiberKey];
    const read = (ref) => {
      const h = ref && typeof ref === 'object' && ref.current;
      return h && typeof h.getView === 'function' && typeof h.setView === 'function' ? ref : null;
    };
    for (let depth = 0; f && depth < 600; depth++, f = f.return) {
      for (const r of [f.ref, f.memoizedProps && f.memoizedProps.ref]) if (read(r)) return r;
      let hook = f.memoizedState;
      if (hook && typeof hook === 'object' && 'next' in hook) {
        for (let i = 0; hook && i < 1500; i++, hook = hook.next) if (read(hook.memoizedState)) return hook.memoizedState;
      }
    }
    return null;
  }
  function consumesViewVars(world) {
    if (!world) return false;
    if (/var\(\s*--canvas-view-/.test(world.style.transform)) return true;
    // Stylesheet-backed fixtures/custom canvases use the same rendering path.
    const scan = (rules) => {
      for (const rule of rules) {
        if (rule.selectorText && rule.style && /var\(\s*--canvas-view-/.test(rule.style.transform)) {
          try { if (world.matches(rule.selectorText)) return true; } catch (_) {}
        }
        if (rule.cssRules && scan(rule.cssRules)) return true;
      }
      return false;
    };
    for (const sheet of document.styleSheets) { try { if (scan(sheet.cssRules)) return true; } catch (_) {} }
    return false;
  }
  function wiring(root) {
    const world = root.querySelector(WORLD);
    const handleRef = handleOf(root);
    if (handleRef) return { root, world, handleRef, path: 'native-handle.setView' };
    if (consumesViewVars(world)) {
      let owner = world;
      for (let n = world; n; n = n.parentElement) {
        if (n.style.getPropertyValue('--canvas-view-x') || n.style.getPropertyValue('--canvas-view-zoom')) { owner = n; break; }
        if (n === root) break;
      }
      return { root, world, owner, path: 'css-view-variables' };
    }
    return { root, world, path: 'native-wheel' };
  }
  function readView(w) {
    const h = w.handleRef && w.handleRef.current;
    if (h) { try { const v = h.getView(); if (validView(v)) return { x: v.x, y: v.y, zoom: v.zoom }; } catch (e) { note(e); } }
    if (w.world) {
      try { const m = new DOMMatrixReadOnly(getComputedStyle(w.world).transform); const v = { x: m.m41, y: m.m42, zoom: m.a }; if (validView(v)) return v; } catch (_) {}
    }
    const css = getComputedStyle(w.owner || w.root);
    const v = { x: parseFloat(css.getPropertyValue('--canvas-view-x')), y: parseFloat(css.getPropertyValue('--canvas-view-y')), zoom: parseFloat(css.getPropertyValue('--canvas-view-zoom')) };
    return validView(v) ? v : null;
  }
  function writeView(s, v) {
    if (current !== s || s.pausedUntil > Date.now() || s.pointerHeld) return;
    const w = s.wiring;
    s.writing = true;
    try {
      const h = w.handleRef && w.handleRef.current;
      if (h && typeof h.setView === 'function') h.setView(v);
      else if (w.owner) {
        w.owner.style.setProperty('--canvas-view-x', `${v.x}px`);
        w.owner.style.setProperty('--canvas-view-y', `${v.y}px`);
        w.owner.style.setProperty('--canvas-view-zoom', String(v.zoom));
      } else {
        const from = readView(w);
        if (!from) return;
        const box = w.root.getBoundingClientRect();
        const cx = box.width / 2, cy = box.height / 2;
        // Match the native trackpad/mouse branches without zoom quantization.
        const logRatio = -Math.log(v.zoom / from.zoom);
        const dy = logRatio / (Math.abs(logRatio) < 0.18 ? 0.012 : 0.001);
        let zoomed = from;
        if (dy) {
          w.root.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: dy, clientX: box.left + cx, clientY: box.top + cy }));
          const scale = v.zoom / from.zoom;
          zoomed = { x: cx - (cx - from.x) * scale, y: cy - (cy - from.y) * scale, zoom: from.zoom * scale };
        }
        w.root.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: zoomed.x - v.x, deltaY: zoomed.y - v.y, clientX: box.left + cx, clientY: box.top + cy }));
      }
      metrics.viewWrites++;
    } catch (e) { note(e); }
    finally { s.writing = false; }
  }
  function itemBox(item, w) {
    if (!item) return null;
    const v = readView(w), rect = item.getBoundingClientRect(), root = w.root.getBoundingClientRect();
    if (!v || rect.width <= 0 || rect.height <= 0) return null;
    return { x: (rect.left - root.left - v.x) / v.zoom, y: (rect.top - root.top - v.y) / v.zoom, width: rect.width / v.zoom, height: rect.height / v.zoom };
  }
  function focus(s, t, c) {
    const id = c && c.itemId || t.anchor && t.anchor.nodeId;
    const items = [...s.root.querySelectorAll(ITEM)];
    const p = c && point(c.world) ? c.world : null;
    let item = id && items.find((n) => n.getAttribute('data-canvas-item-id') === String(id));
    if (!item && t.storyboardName) item = items.find((n) => key(n.querySelector('[data-storyboard-header]')?.textContent) === key(t.storyboardName));
    if (!item && (p || point(t.anchor))) {
      const a = p || t.anchor;
      item = items.find((n) => { const b = itemBox(n, s.wiring); return b && a.x >= b.x && a.y >= b.y && a.x <= b.x + b.width && a.y <= b.y + b.height; });
    }
    const box = itemBox(item, s.wiring) || (c && c.focus && c.focus.width > 0 && c.focus.height > 0 ? c.focus : null);
    const target = p || (box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : t.anchor);
    return { item: item || null, box, point: point(target) ? target : null };
  }
  function cancelAnimation(s) {
    if (s.raf) cancelAnimationFrame(s.raf);
    s.raf = 0;
    if (s.tween) metrics.animationMs += performance.now() - s.tween.start;
    s.tween = null;
  }
  function recenter(s, f) {
    if (!f.point || s.pausedUntil > Date.now() || s.pointerHeld || s.terminalAt) return;
    const from = readView(s.wiring), b = s.root.getBoundingClientRect();
    if (!from || !b.width || !b.height) return;
    const zoom = clamp(f.box ? Math.min(b.width / (f.box.width * 1.2), b.height / (f.box.height * 1.2)) : from.zoom, 0.25, 2);
    const to = { x: b.width / 2 - f.point.x * zoom, y: b.height / 2 - f.point.y * zoom, zoom };
    const last = s.tween ? s.tween.to : from;
    if (Math.abs(to.x - last.x) < 1 && Math.abs(to.y - last.y) < 1 && Math.abs(to.zoom - last.zoom) < 0.001) return;
    cancelAnimation(s);
    if (motion.matches) { writeView(s, to); return; }
    s.tween = { from, to, start: performance.now() };
    const frame = (now) => {
      s.raf = 0;
      if (current !== s || !s.tween) return;
      metrics.frames++;
      const p = clamp((now - s.tween.start) / EASE_MS, 0, 1), e = 1 - Math.pow(1 - p, 3);
      const { from: a, to: z } = s.tween;
      writeView(s, { x: a.x + (z.x - a.x) * e, y: a.y + (z.y - a.y) * e, zoom: a.zoom + (z.zoom - a.zoom) * e });
      if (p < 1) s.raf = requestAnimationFrame(frame);
      else { metrics.animationMs += now - s.tween.start; s.tween = null; }
    };
    s.raf = requestAnimationFrame(frame);
  }
  function node(tag, cls, text) { const el = document.createElement(tag); el.className = cls; if (text) el.textContent = text; return el; }
  function labelModel(t) {
    const v = String(t.model || t.modelId || 'Model unknown').replace(/^claude[-\s]+/i, '').replace(/-1m$/i, '').replace(/-(\d{8})$/, '').replace(/(\d)-(\d)/g, '$1.$2').replace(/-/g, ' ');
    return v.charAt(0).toUpperCase() + v.slice(1);
  }
  function labelEffort(t) { const v = String(t.effort || t.effortId || 'Effort unknown'); return ({ xhigh: 'Extra High' })[v] || v.charAt(0).toUpperCase() + v.slice(1); }
  function number(t, c) {
    if (c && c.n) return c.n;
    for (const el of document.querySelectorAll('.rtcb-bubble[data-n]')) if ([el.dataset.id, el.dataset.taskId, el.dataset.rtcbTask].includes(String(t.id))) return el.dataset.n;
    return Math.max(1, tasks().findIndex((x) => String(x.id) === String(t.id)) + 1);
  }
  function mount(s) {
    s.layer = node('div', 'rtaf-layer'); s.layer.dataset.rtafRoot = '';
    s.chip = node('div', 'rtaf-chip'); s.chip.setAttribute('role', 'group'); s.chip.setAttribute('aria-label', 'Agent follow controls');
    const avatar = node('span', 'rtaf-avatar'); avatar.setAttribute('aria-hidden', 'true');
    avatar.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2v20M2 12h20M5 5l14 14M5 19L19 5M3 8l18 8M8 3l8 18M3 16l18-8M8 21l8-18" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>';
    s.stateEl = node('span', 'rtaf-state'); s.stateEl.setAttribute('role', 'status'); s.stateEl.setAttribute('aria-live', 'polite');
    s.detailEl = node('span', 'rtaf-detail'); s.elapsedEl = node('span', 'rtaf-elapsed'); s.elapsedEl.setAttribute('aria-label', 'Elapsed time');
    const stop = node('button', 'rtaf-stop', 'Stop'); stop.type = 'button'; stop.setAttribute('aria-label', 'Stop following agent'); stop.addEventListener('click', unfollow);
    s.chip.append(avatar, s.stateEl, s.detailEl, s.elapsedEl, stop); s.layer.append(s.chip); document.body.append(s.layer);
  }
  function paint(s, t, c) {
    const paused = s.pointerHeld || s.pausedUntil > Date.now();
    const status = s.terminalAt ? (t.status === 'failed' ? 'failed' : 'done') : paused ? 'paused' : 'following';
    s.layer.dataset.state = status;
    const label = status === 'paused' ? 'Paused' : status === 'done' ? 'Done' : status === 'failed' ? 'Done · Failed' : 'Following Claude';
    if (s.stateEl.textContent !== label) s.stateEl.textContent = label;
    const detail = `${status === 'following' ? '' : 'Claude · '}#${number(t, c)} · ${labelModel(t)} · ${labelEffort(t)}`;
    if (s.detailEl.textContent !== detail) s.detailEl.textContent = detail;
    const started = typeof (t.startedAt || t.createdAt) === 'number' ? (t.startedAt || t.createdAt) : Date.parse(t.startedAt || t.createdAt);
    const finished = t.finishedAt ? (typeof t.finishedAt === 'number' ? t.finishedAt : Date.parse(t.finishedAt)) : Date.now();
    const seconds = Math.max(0, Math.floor(((finite(finished) ? finished : Date.now()) - (finite(started) ? started : s.startedAt)) / 1000));
    const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    if (s.elapsedEl.textContent !== elapsed) s.elapsedEl.textContent = elapsed;
    const b = s.root.getBoundingClientRect(), signature = [b.left, b.top, b.width, b.height].join(',');
    if (signature !== s.rectSignature) {
      s.rectSignature = signature;
      Object.assign(s.layer.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
    }
  }
  function listen(s, target, name, fn, options) { target.addEventListener(name, fn, options); s.cleanups.push(() => target.removeEventListener(name, fn, options)); }
  function pause(s) {
    if (current !== s || s.writing || s.terminalAt) return;
    s.pausedUntil = Date.now() + PAUSE_MS;
    cancelAnimation(s);
    paint(s, s.task, s.cursor);
  }
  function inputOn(s, target, cleanups) {
    const add = (event, fn, options = { capture: true, passive: true }) => {
      target.addEventListener(event, fn, options); cleanups.push(() => target.removeEventListener(event, fn, options));
    };
    add('wheel', () => pause(s));
    add('pointerdown', () => { if (!s.writing) s.pointerHeld = true; pause(s); });
    add('touchstart', () => pause(s));
    add('gesturestart', () => pause(s));
    add('gesturechange', () => pause(s));
    add('keydown', (e) => { if (e.key === 'Escape') unfollow(); else if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '+', '-', '='].includes(e.key)) pause(s); });
  }
  function clearFocusObservers(s) {
    for (const o of s.focusObservers) o.disconnect(); s.focusObservers = [];
    for (const clean of s.focusCleanups) clean(); s.focusCleanups = [];
    s.frameDocs.clear(); s.frames.clear();
  }
  function watchFrames(s) {
    if (!s.item) return;
    if ([...s.frames].some((frame) => !s.item.contains(frame))) {
      const item = s.item; s.item = null; observeFocus(s, item); return;
    }
    for (const frame of s.item.querySelectorAll('iframe')) {
      if (!s.frames.has(frame)) {
        const loaded = () => {
          // Navigation replaces the document; release detached iframe trees.
          const item = s.item; s.item = null; observeFocus(s, item); schedule(s);
        };
        frame.addEventListener('load', loaded); s.focusCleanups.push(() => frame.removeEventListener('load', loaded)); s.frames.add(frame);
      }
      try {
        const doc = frame.contentDocument;
        if (!doc || s.frameDocs.has(doc)) continue;
        s.frameDocs.add(doc); inputOn(s, doc, s.focusCleanups);
        const released = () => { if (s.pointerHeld) { s.pointerHeld = false; pause(s); } };
        doc.addEventListener('pointerup', released, true); doc.addEventListener('pointercancel', released, true);
        s.focusCleanups.push(() => { doc.removeEventListener('pointerup', released, true); doc.removeEventListener('pointercancel', released, true); });
        const observer = new MutationObserver(() => schedule(s)); observer.observe(doc, { childList: true, subtree: true, attributes: true, characterData: true }); s.focusObservers.push(observer);
      } catch (_) { /* Cross-origin frames remain covered by the host poll. */ }
    }
  }
  function observeFocus(s, item) {
    if (s.item === item) { watchFrames(s); return; }
    clearFocusObservers(s); s.frames.clear(); s.item = item;
    if (!item) return;
    const mo = new MutationObserver(() => schedule(s)); mo.observe(item, { subtree: true, childList: true, attributes: true, characterData: true }); s.focusObservers.push(mo);
    if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(() => schedule(s)); ro.observe(item); s.focusObservers.push(ro); }
    watchFrames(s);
  }
  function subscribe(s) {
    const api = store();
    if (s.store === api) return;
    if (s.unsubscribe) s.unsubscribe(); s.unsubscribe = null; s.store = api;
    if (api && typeof api.subscribe === 'function') { try { const u = api.subscribe(() => schedule(s)); if (typeof u === 'function') s.unsubscribe = u; } catch (e) { note(e); } }
  }
  function schedule(s) {
    if (current !== s || s.queued) return;
    s.queued = true;
    queueMicrotask(() => { s.queued = false; if (current === s) update(s); });
  }
  function update(s) {
    if (current !== s) return;
    if (!enabled() || !s.root.isConnected || !shown(s.root)) { unfollow(); return; }
    subscribe(s);
    const t = task(s.id);
    if (!t) { unfollow(); return; }
    const c = cursor(s.id);
    if (pickRoot(t, c) !== s.root) { unfollow(); return; }
    s.task = t; s.cursor = c;
    if (['done', 'failed', 'cancelled', 'dismissed'].includes(t.status)) {
      if (!s.terminalAt) { s.terminalAt = Date.now(); cancelAnimation(s); }
      if (Date.now() - s.terminalAt >= DONE_MS) { unfollow(); return; }
    } else s.terminalAt = 0;
    paint(s, t, c);
    const f = focus(s, t, c); observeFocus(s, f.item); recenter(s, f);
  }
  function follow(id) {
    if (disposed || !enabled() || id === undefined || id === null) return false;
    id = String(id);
    if (current && current.id === id) return true; // Bubbles dispatch an event AND call the API.
    const t = task(id); if (!t) return false;
    const c = cursor(id), root = pickRoot(t, c); if (!root) return false;
    const w = wiring(root); if (!readView(w)) return false;
    unfollow();
    const s = { id, root, wiring: w, task: t, cursor: c, startedAt: Date.now(), pausedUntil: 0, pointerHeld: false, terminalAt: 0, raf: 0, timer: 0, tween: null, queued: false, cleanups: [], focusCleanups: [], focusObservers: [], observers: [], frames: new Set(), frameDocs: new Set(), item: null, unsubscribe: null, store: null };
    current = s; metrics.sessions++; lastPath = w.path;
    mount(s); inputOn(s, root, s.cleanups);
    const release = () => { if (s.pointerHeld) { s.pointerHeld = false; pause(s); } };
    listen(s, window, 'pointerup', release, true); listen(s, window, 'pointercancel', release, true); listen(s, window, 'blur', release);
    listen(s, window, 'resize', () => schedule(s)); listen(s, window, 'scroll', () => schedule(s), { passive: true, capture: true });
    listen(s, window, 'rtcc:changed', () => schedule(s));
    if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(() => schedule(s)); ro.observe(root); s.observers.push(ro); }
    s.timer = setInterval(() => { metrics.pollTicks++; update(s); }, POLL_MS);
    update(s);
    return true;
  }
  function unfollow() {
    const s = current; if (!s) return;
    current = null; cancelAnimation(s); clearInterval(s.timer); s.timer = 0;
    if (s.unsubscribe) { try { s.unsubscribe(); } catch (e) { note(e); } }
    clearFocusObservers(s); for (const o of s.observers) o.disconnect(); for (const clean of s.cleanups) clean();
    s.layer.remove();
  }
  function onFollow(e) { if (e.detail && e.detail.id != null) follow(e.detail.id); }
  function onAltClick(e) {
    if (!e.altKey || !(e.target instanceof Element)) return;
    const el = e.target.closest('[data-rtcb-task], .rtcb-bubble[data-task-id], .rtcb-bubble[data-id]');
    if (!el) return;
    const id = el.getAttribute('data-rtcb-task') || el.dataset.taskId || el.dataset.id;
    if (follow(id)) { e.preventDefault(); e.stopPropagation(); }
  }
  function onKey(e) { if (e.key === 'Escape' && current) unfollow(); }
  function onFlag(e) { if (e.key === FLAG && !enabled()) unfollow(); }
  function onMotion() { const s = current; if (s) { cancelAnimation(s); schedule(s); } }
  const API = {
    follow, unfollow,
    following: () => current ? current.id : null,
    settings: () => ({ enabled: enabled(), following: current ? current.id : null, status: current ? current.layer.dataset.state : 'idle', pausedUntil: current ? current.pausedUntil : 0, pollMs: POLL_MS, pauseMs: PAUSE_MS, doneMs: DONE_MS, easingMs: EASE_MS, zoom: { min: 0.25, max: 2 }, margin: 0.1, reducedMotion: motion.matches, viewPath: current ? current.wiring.path : lastPath, metrics: { ...metrics, activeTimers: current ? 1 : 0, activeRafs: current && current.raf ? 1 : 0, observers: current ? current.observers.length + current.focusObservers.length : 0 }, errors: errors.slice() }),
    dispose() { unfollow(); disposed = true; window.removeEventListener('rtcb:follow', onFollow); window.removeEventListener('keydown', onKey, true); window.removeEventListener('storage', onFlag); document.removeEventListener('click', onAltClick, true); motion.removeEventListener('change', onMotion); if (window.__RE_TEMPO_AGENT_FOLLOW__ === API) delete window.__RE_TEMPO_AGENT_FOLLOW__; },
  };
  window.__RE_TEMPO_AGENT_FOLLOW__ = API;
  window.addEventListener('rtcb:follow', onFollow); window.addEventListener('keydown', onKey, true); window.addEventListener('storage', onFlag); document.addEventListener('click', onAltClick, true); motion.addEventListener('change', onMotion);
})();
