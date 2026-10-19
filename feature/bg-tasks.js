/*
 * RE-TEMPO · bg-tasks (user mod layer)
 * ---------------------------------------------------------------------------
 * Background tasks shown INSIDE the conversation, as agent output, instead of
 * only in the composer's "N Tasks Running" pill/popover (which stays as is).
 *
 * What it renders: one block at the end of the transcript (after the last
 * message, before the composer). It scrolls with the transcript; when the list
 * is scrolled to the bottom it stays in view, like a new message.
 *   - running task: spinner (the app's own SVGs + `animate-spin`), label, type
 *     chip (bash / agent / workflow / wakeup / cron), live elapsed (1 s tick);
 *   - finished task: final icon + duration for FINAL_MS (8 s), then it folds
 *     into the header line ("3 background tasks done · 1 failed");
 *   - the header line stays until the next user message; clicking it shows the
 *     folded rows again; no running/finished task: the block is removed.
 *
 * Data source (renderer bundle index-D2Ui1vc0.js, frozen copy):
 *   - The tasks live in a module-scope singleton (minified `BU`, class with
 *     states: Map<sessionKey, Map<taskId, task>>, getState(key), subscribe(key,
 *     cb), applyEvent, autoRemove 30 s, clearTerminal on send). Not on window.
 *     task = {id, type: local_bash|local_agent|remote_agent|local_workflow|
 *     scheduled_wakeup|scheduled_cron, status: running|completed|failed|stopped,
 *     description, command, prompt, workflowName, isAmbient, isHistorical,
 *     usage{durationMs}, startedAt, completedAt, wakeup, cron}. Updates are
 *     immutable (a new Map per change), as useSyncExternalStore requires.
 *   - Reached through React: the composer renders the memo component with
 *     displayName "BackgroundTaskPill" (prop sessionKey) inside `.chat-view`.
 *     Its useSyncExternalStore hook keeps `queue.getSnapshot` = () =>
 *     BU.getState(key). Calling it once with Map.prototype.get briefly wrapped
 *     (synchronous, restored in `finally`) captures BU.states, validated
 *     against the snapshot. From then on any chat is read by key, with no
 *     further fiber walks ("states-capture"). If that validation fails, the
 *     pill's getSnapshot is called directly per chat ("pill-snapshot").
 *     Read by polling every 250 ms (identity check of the Map: cheap).
 *   - Session key = `.chat-view[data-chat-session-id]` (= an.sessionId ?? h,
 *     the same key ChatView gives the pill); falls back to the pill's prop.
 *   - "Next user message": last role:"user" message id from
 *     window.__chatSessionStoreDebug.getMessages(key) (the app's own debug
 *     handle of the chat session store; side-effect free).
 *
 * Mount point: the transcript is a react-virtuoso list
 *   .chat-view [data-testid="virtuoso-scroller"].message-list
 *     > [data-viewport-type] > [data-testid="virtuoso-item-list"] + <footer>
 * whose Footer component renders <div class="max-w-[…] mx-auto px-4">
 * {footer}<div aria-hidden style="height:32px"></div></div>. The block is
 * inserted in that div, before the 32 px spacer, so Virtuoso measures it
 * (footerHeight) and scrolling stays consistent. React never owns the node; if
 * it rebuilds the footer, the next poll remounts the block. No footer (empty
 * transcript): end of the viewport.
 *
 * Fragility: displayName "BackgroundTaskPill", hook shape (queue.getSnapshot),
 * BU.getState doing `this.states.get(key)` first, the Virtuoso footer layout and
 * window.__chatSessionStoreDebug. Each one degrades to "nothing shown", never
 * to an error in the app. Introspection: window.__RE_TEMPO_BG_TASKS__.
 * Validated only against a fixture (fake store + fake fiber + Virtuoso-shaped
 * DOM), not in the logged-in app.
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  // Re-injection without a page reload: drop the previous instance first.
  if (window.__RE_TEMPO_BG_TASKS__?.dispose) window.__RE_TEMPO_BG_TASKS__.dispose();

  const CFG = window.__RE_TEMPO_BG_TASKS_CONFIG__ || {}; // test hook only
  const POLL_MS = CFG.pollMs || 250;
  const FINAL_MS = CFG.finalMs || 8000; // finished task keeps its own row
  const PILL_NAME = "BackgroundTaskPill";
  const FIBER_WALK_LIMIT = 40000;
  const TERMINAL = new Set(["completed", "failed", "stopped", "killed"]);

  // ------------------------------------------------------------- icons (app)
  // Same SVGs as the app's task popover rows (bundle: H8n, Y8n, J8n, X8n, Z8n,
  // W8n, U8n), so the inline block reads as the same feature.
  const SVG = (inner, cls = "") =>
    `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"${cls ? ` class="${cls}"` : ""}>${inner}</svg>`;
  const ICONS = {
    bash: SVG(
      '<path fill-rule="evenodd" clip-rule="evenodd" d="M4.70799 0.695742C4.8348 1.00189 4.68942 1.35287 4.38327 1.47968L3.97225 1.64993L3.60086 1.84327L3.24773 2.06823L2.91556 2.32312L2.60686 2.60598L2.324 2.91468L2.06911 3.24685L1.84414 3.59998L1.65081 3.97137L1.49058 4.35819L1.36468 4.75751L1.27406 5.16628L1.21941 5.58139L1.20114 5.99969L1.21941 6.41799L1.27406 6.83311L1.36468 7.24188L1.49058 7.64119L1.65081 8.02802L1.84414 8.39941L2.06911 8.75253L2.32399 9.0847L2.60686 9.3934L2.91556 9.67627L3.24773 9.93115L3.60086 10.1561L3.97224 10.3495L4.38327 10.5197C4.68942 10.6465 4.8348 10.9975 4.70799 11.3036C4.58118 11.6098 4.2302 11.7552 3.92405 11.6284L3.46462 11.4381L3.00029 11.1963L2.55879 10.9151L2.14348 10.5964L1.75753 10.2427L1.40387 9.85679L1.08519 9.44148L0.803924 8.99998L0.562207 8.53564L0.361879 8.05201L0.204464 7.55275L0.0911622 7.04168L0.0228338 6.52268L0 5.99969L0.0228338 5.47671L0.0911622 4.9577L0.204464 4.44663L0.361879 3.94738L0.562207 3.46374L0.803924 2.99941L1.08519 2.55791L1.40387 2.1426L1.75753 1.75665L2.14348 1.40299L2.55879 1.08431L3.00029 0.803045L3.46462 0.561328L3.92405 0.371025C4.2302 0.244214 4.58118 0.389595 4.70799 0.695742Z" fill="#67CFFD" fill-opacity="0.2"/>' +
        '<path fill-rule="evenodd" clip-rule="evenodd" d="M5.87629 0.54226C5.91955 0.213724 6.22094 -0.0175436 6.54948 0.025709L7.04251 0.090618L7.55358 0.20392L8.05284 0.361335L8.53647 0.561663L9.00081 0.80338L9.44231 1.08465L9.85761 1.40332L10.2436 1.75698L10.5972 2.14293L10.9159 2.55824L11.1972 2.99974L11.4389 3.46408L11.6392 3.94771L11.7966 4.44697L11.9099 4.95804L11.9783 5.47704L12.0011 6.00003L11.9783 6.52301L11.9099 7.04202L11.7966 7.55309L11.6392 8.05235L11.4389 8.53598L11.1972 9.00031L10.9159 9.44181L10.5972 9.85712L10.2436 10.2431L9.85761 10.5967L9.44231 10.9154L9.00081 11.1967L8.53647 11.4384L8.05284 11.6387L7.55358 11.7961L7.04251 11.9094L6.54948 11.9743C6.22094 12.0176 5.91955 11.7863 5.87629 11.4578C5.83304 11.1293 6.06431 10.8279 6.39285 10.7846L6.83394 10.7265L7.2427 10.6359L7.64201 10.51L8.02885 10.3498L8.40023 10.1565L8.75336 9.93149L9.08553 9.6766L9.39423 9.39374L9.6771 9.08504L9.93198 8.75287L10.1569 8.39974L10.3503 8.02835L10.5105 7.64153L10.6364 7.24221L10.727 6.83344L10.7817 6.41833L10.7999 6.00003L10.7817 5.58173L10.727 5.16661L10.6364 4.75784L10.5105 4.35853L10.3503 3.9717L10.1569 3.60031L9.93198 3.24719L9.6771 2.91501L9.39423 2.60632L9.08553 2.32345L8.75336 2.06857L8.40023 1.8436L8.02885 1.65027L7.64202 1.49004L7.2427 1.36414L6.83393 1.27351L6.39285 1.21544C6.06431 1.17219 5.83304 0.870796 5.87629 0.54226Z" fill="#67CFFD"/>',
      "animate-spin"
    ),
    agent: SVG(
      '<circle cx="6" cy="6" r="4.5" stroke="#67CFFD" stroke-width="1.2" stroke-dasharray="2 2"/>',
      "animate-spin"
    ),
    workflow: SVG(
      '<rect width="12" height="12" rx="3" fill="#67CFFD" fill-opacity=".2"/><circle cx="3.5" cy="6" r="1" fill="#67CFFD"/><circle cx="6" cy="6" r="1" fill="#67CFFD"/><circle cx="8.5" cy="6" r="1" fill="#67CFFD"/>'
    ),
    wakeup: SVG(
      '<circle cx="6" cy="6" r="4.5" stroke="#67CFFD" stroke-width="1.2" fill="#67CFFD" fill-opacity=".15"/><path d="M6 3.5V6" stroke="#67CFFD" stroke-width="1.2" stroke-linecap="round"/><path d="M6 6L7.8 6.9" stroke="#67CFFD" stroke-width="1.2" stroke-linecap="round"/>'
    ),
    cron: SVG(
      '<path d="M2.5 5.2A3.7 3.7 0 0 1 9.2 4" stroke="#67CFFD" stroke-width="1.2" stroke-linecap="round"/><path d="M9.6 2.2v2h-2" stroke="#67CFFD" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 6.8A3.7 3.7 0 0 1 2.8 8" stroke="#67CFFD" stroke-width="1.2" stroke-linecap="round"/><path d="M2.4 9.8v-2h2" stroke="#67CFFD" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    completed: SVG(
      '<rect width="12" height="12" rx="6" fill="#787878"/><path d="M3.5 6L5.5 8L8.5 4.5" stroke="#F5F5F5" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    failed: SVG(
      '<rect width="12" height="12" rx="6" fill="#D01010" fill-opacity=".2"/><path d="M4 4L8 8M8 4L4 8" stroke="#F99A9A" stroke-width="1.2" stroke-linecap="round"/>'
    ),
  };
  const CHEVRON =
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M4.5 3l3 3-3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // ------------------------------------------------------------- task helpers
  const kindOf = (type) => {
    switch (type) {
      case "local_bash":
        return "bash";
      case "local_agent":
      case "remote_agent":
        return "agent";
      case "local_workflow":
        return "workflow";
      case "scheduled_wakeup":
        return "wakeup";
      case "scheduled_cron":
        return "cron";
      default:
        return type ? String(type).replace(/^local_|^remote_/, "") : "";
    }
  };
  const isScheduled = (t) => t.type === "scheduled_wakeup" || t.type === "scheduled_cron";
  const statusOf = (t) => (t.status === "killed" ? "stopped" : t.status || "running");

  // Same label rule as the app's popover row; the description wins when the
  // command is what the chip would show (bash), so the row reads as prose.
  function labelOf(t) {
    if (t.workflowName) return t.workflowName;
    const raw = t.description || t.command || "Background task";
    return String(raw).replace(/^Background task:\s*/i, "").trim() || "Background task";
  }

  function fmtDur(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  }

  function fmtIn(ms) {
    const s = Math.ceil(Math.max(0, ms) / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  }

  // ------------------------------------------------------------- fiber access
  function fiberOf(el) {
    if (!el) return null;
    for (const k in el) if (k.startsWith("__reactFiber$")) return el[k];
    return null;
  }

  const isPill = (f) =>
    (f.elementType && f.elementType.displayName === PILL_NAME) || (f.type && f.type.displayName === PILL_NAME);

  // The fiber cached on the DOM node may be the stale alternate, so both
  // sides are walked; pills found on both sides are returned (current first).
  function findPills(rootEl) {
    const start = fiberOf(rootEl);
    const out = [];
    for (const root of start ? [start, start.alternate] : []) {
      if (!root) continue;
      const stack = [root.child];
      let n = 0;
      while (stack.length && n < FIBER_WALK_LIMIT) {
        const f = stack.pop();
        if (!f) continue;
        n++;
        if (isPill(f)) {
          if (!out.includes(f)) out.push(f);
          if (f.alternate && !out.includes(f.alternate)) out.push(f.alternate);
          break;
        }
        if (f.sibling) stack.push(f.sibling);
        if (f.child) stack.push(f.child);
      }
      if (out.length) break;
    }
    return out;
  }

  // useSyncExternalStore keeps {value, getSnapshot} in hook.queue. Memo of a
  // plain function = hooks on the fiber itself; otherwise on its child.
  function snapshotFns(pill) {
    const out = [];
    for (const f of [pill, pill.child]) {
      let h = f && (f === pill || typeof f.type === "function") ? f.memoizedState : null;
      let i = 0;
      while (h && typeof h === "object" && i++ < 200) {
        const q = h.queue;
        if (q && typeof q.getSnapshot === "function") out.push(q.getSnapshot);
        h = h.next;
      }
    }
    return out;
  }

  // Calls getSnapshot with Map.prototype.get wrapped, to learn which Map it
  // reads `key` from (BU.states). Synchronous; the original is always restored.
  function captureStates(getSnapshot, key) {
    const orig = Map.prototype.get;
    const calls = [];
    let snap;
    Map.prototype.get = function (k) {
      if (calls.length < 8) calls.push([this, k]);
      return orig.call(this, k);
    };
    try {
      snap = getSnapshot();
    } catch (_) {
      snap = undefined;
    } finally {
      Map.prototype.get = orig;
    }
    if (!(snap instanceof Map)) return null;
    for (const [m, k] of calls) {
      if (k !== key || !(m instanceof Map)) continue;
      const v = orig.call(m, k);
      if (!(v === snap || (v === undefined && snap.size === 0))) continue;
      for (const inner of m.values()) if (!(inner instanceof Map)) return null;
      return m;
    }
    return null;
  }

  const looksLikeTasks = (m) => {
    if (!(m instanceof Map)) return false;
    for (const t of m.values()) if (!t || typeof t !== "object" || !("status" in t) || !("id" in t)) return false;
    return true;
  };

  // ------------------------------------------------------------- data source
  const src = { how: "none", states: null, perView: new WeakMap(), error: null };

  function viewKey(view) {
    return view.getAttribute("data-chat-session-id") || src.perView.get(view)?.key || null;
  }

  // Map<taskId, task> for a .chat-view, or null when nothing can be read.
  function tasksFor(view) {
    let key = view.getAttribute("data-chat-session-id");
    if (src.states && key) {
      const m = src.states.get(key);
      return { key, tasks: m instanceof Map ? m : null };
    }
    let pv = src.perView.get(view);
    if (!pv || (key && pv.key !== key)) {
      pv = resolveFromPill(view);
      if (pv) src.perView.set(view, pv);
    }
    if (!pv) return { key, tasks: null };
    if (src.states) {
      const m = src.states.get(pv.key);
      return { key: pv.key, tasks: m instanceof Map ? m : null };
    }
    let m = null;
    try {
      m = pv.getSnapshot();
    } catch (_) {
      m = null;
    }
    return { key: pv.key, tasks: looksLikeTasks(m) ? m : null };
  }

  function resolveFromPill(view) {
    const want = view.getAttribute("data-chat-session-id");
    const pills = findPills(view)
      .map((f) => ({ f, key: f.memoizedProps?.sessionKey ?? f.pendingProps?.sessionKey }))
      .filter((p) => typeof p.key === "string" && p.key);
    if (!pills.length) return null;
    const { f: pill, key } = pills.find((p) => p.key === want) || pills[0];
    for (const fn of snapshotFns(pill)) {
      if (!src.states) {
        const states = captureStates(fn, key);
        if (states) {
          src.states = states;
          src.how = "states-capture";
          return { key, getSnapshot: fn };
        }
      }
      let m = null;
      try {
        m = fn();
      } catch (_) {}
      if (looksLikeTasks(m)) {
        if (!src.states) src.how = "pill-snapshot";
        return { key, getSnapshot: fn };
      }
    }
    return null;
  }

  function lastUserId(key) {
    try {
      const msgs = window.__chatSessionStoreDebug?.getMessages?.(key);
      if (Array.isArray(msgs)) {
        for (let i = msgs.length - 1; i >= 0; i--) {
          const m = msgs[i];
          if (m && m.role === "user" && !m.isCompactSummary) return m.id ?? `#${i}`;
        }
        return null;
      }
    } catch (_) {}
    return undefined; // unknown: the summary is never reset by turn
  }

  // ------------------------------------------------------------- per-session
  // recs: Map<taskId, {id, task, firstSeen, sawRunning, endAt, endStatus, gone}>
  const sessions = new Map();
  const getSession = (key) => {
    let s = sessions.get(key);
    if (!s) {
      s = { key, recs: new Map(), turn: undefined, lastTasks: null, expanded: false };
      sessions.set(key, s);
    }
    return s;
  };

  function reconcile(s, tasks, now) {
    const turn = lastUserId(s.key);
    if (turn !== undefined) {
      if (s.turn !== undefined && turn !== s.turn) {
        for (const [id, r] of s.recs) if (r.endAt) s.recs.delete(id); // new user message
        s.expanded = false;
      }
      s.turn = turn;
    }
    if (tasks !== s.lastTasks) {
      s.lastTasks = tasks;
      const live = new Set();
      if (tasks) {
        for (const t of tasks.values()) {
          if (!t || t.isAmbient || t.id == null) continue;
          live.add(t.id);
          let r = s.recs.get(t.id);
          const st = statusOf(t);
          if (!r) {
            // Already finished when first seen: an old transcript (historical)
            // is not news; a fresh one still gets its final row.
            if (TERMINAL.has(st) && t.isHistorical) continue;
            r = { id: t.id, firstSeen: now, sawRunning: false, endAt: 0, endStatus: null, gone: false };
            s.recs.set(t.id, r);
          }
          r.task = t;
          r.gone = false;
          if (st === "running") {
            r.sawRunning = true;
            r.endAt = 0;
            r.endStatus = null;
          } else if (!r.endAt) {
            const c = typeof t.completedAt === "number" && t.completedAt > 0 ? t.completedAt : now;
            r.endAt = Math.min(c, now);
            r.endStatus = st;
          } else r.endStatus = st;
        }
      }
      // Gone from the store: terminal ones were auto-removed (30 s) or cleared
      // on send, keep them; a running one that vanished is shown as ended.
      for (const r of s.recs.values()) {
        if (live.has(r.id)) continue;
        r.gone = true;
        if (!r.endAt) {
          r.endAt = now;
          r.endStatus = "completed";
        }
      }
    }
  }

  function model(s, now) {
    const running = [];
    const recent = [];
    const folded = [];
    const counts = { completed: 0, failed: 0, stopped: 0 };
    for (const r of s.recs.values()) {
      if (!r.endAt) {
        running.push(r);
        continue;
      }
      counts[r.endStatus === "failed" ? "failed" : r.endStatus === "stopped" ? "stopped" : "completed"]++;
      (now - r.endAt < FINAL_MS ? recent : folded).push(r);
    }
    const byStart = (a, b) => startOf(a) - startOf(b);
    running.sort(byStart);
    recent.sort((a, b) => a.endAt - b.endAt);
    folded.sort((a, b) => a.endAt - b.endAt);
    return { running, recent, folded, counts, done: counts.completed + counts.failed + counts.stopped };
  }

  const startOf = (r) => (r.task && r.task.startedAt > 0 ? r.task.startedAt : r.firstSeen);

  function timeText(r, now) {
    const t = r.task || {};
    if (!r.endAt) {
      if (t.type === "scheduled_wakeup" && t.wakeup?.scheduledFor) {
        const left = t.wakeup.scheduledFor - now;
        return left > 0 ? `wakes in ${fmtIn(left)}` : "firing…";
      }
      if (t.type === "scheduled_cron") return t.cron?.humanSchedule || "scheduled";
      return fmtDur(now - startOf(r));
    }
    if (t.startedAt > 0 && t.completedAt > 0) return fmtDur(t.completedAt - t.startedAt);
    if (t.usage?.durationMs) return fmtDur(t.usage.durationMs);
    if (r.sawRunning) return fmtDur(r.endAt - r.firstSeen);
    return "";
  }

  function iconFor(r) {
    if (r.endAt) return r.endStatus === "failed" || r.endStatus === "stopped" ? ICONS.failed : ICONS.completed;
    const k = kindOf(r.task?.type);
    return ICONS[k] || ICONS.bash;
  }

  function tooltip(r) {
    const t = r.task || {};
    const lines = [labelOf(t)];
    if (t.command && t.command !== lines[0]) lines.push(`$ ${t.command}`);
    if (t.prompt) lines.push(`Prompt: ${t.prompt.length > 200 ? t.prompt.slice(0, 197) + "..." : t.prompt}`);
    const st = r.endAt ? r.endStatus : "running";
    lines.push(`${kindOf(t.type) || "task"} · ${st}`);
    return lines.join("\n");
  }

  // ------------------------------------------------------------- rendering
  // One block per .chat-view: {el, head, label, meta, chev, list, rows: Map}
  const blocks = new Map();

  function el(tag, cls, attrs) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function createBlock(view) {
    const root = el("div", "rbt-block", { "data-rbt-root": "", "data-testid": "re-tempo-bg-tasks" });
    const head = el("button", "rbt-head", { type: "button", "aria-expanded": "false" });
    const hIco = el("span", "rbt-ico rbt-head-ico");
    const label = el("span", "rbt-head-label", { "aria-live": "polite" });
    const meta = el("span", "rbt-head-meta");
    const chev = el("span", "rbt-chev");
    chev.innerHTML = CHEVRON;
    head.append(hIco, label, meta, chev);
    const list = el("div", "rbt-list", { role: "list" });
    root.append(head, list);
    const b = { view, el: root, head, hIco, label, meta, chev, list, rows: new Map(), key: null, sig: "" };
    head.addEventListener("click", () => {
      const s = b.key && sessions.get(b.key);
      if (!s) return;
      s.expanded = !s.expanded;
      update(b, Date.now(), true);
    });
    return b;
  }

  function mountPoint(view) {
    const scroller =
      view.querySelector('[data-testid="virtuoso-scroller"].message-list') ||
      view.querySelector(".message-list[data-virtuoso-scroller]") ||
      view.querySelector(".message-list");
    if (!scroller) return null;
    const viewport = scroller.querySelector(":scope > [data-viewport-type]") || scroller;
    const list = viewport.querySelector(':scope > [data-testid="virtuoso-item-list"]');
    let footer = list ? list.nextElementSibling : null;
    while (footer && footer.classList.contains("rbt-block")) footer = footer.nextElementSibling;
    const inner = footer && footer.firstElementChild;
    if (inner && !inner.classList.contains("rbt-block")) {
      let spacer = null;
      for (const c of inner.children) if (c.getAttribute("aria-hidden") === "true" && !c.classList.contains("rbt-block")) spacer = c;
      return { scroller, parent: inner, before: spacer, where: "footer" };
    }
    return { scroller, parent: viewport, before: null, where: "viewport" };
  }

  const atBottom = (sc) => sc.scrollHeight - sc.scrollTop - sc.clientHeight <= 48;

  function place(b, mp) {
    const wantNext = mp.before || null;
    if (b.el.parentNode === mp.parent && b.el.nextSibling === wantNext) return false;
    mp.parent.insertBefore(b.el, wantNext);
    return true;
  }

  function rowFor(b, r) {
    let row = b.rows.get(r.id);
    if (!row) {
      const n = el("div", "rbt-row", { role: "listitem" });
      const ico = el("span", "rbt-ico");
      const label = el("span", "rbt-label");
      const chip = el("span", "rbt-chip");
      const time = el("span", "rbt-time");
      n.append(ico, label, chip, time);
      row = { n, ico, label, chip, time, icon: "", text: "", kind: "", tip: "", st: "" };
      b.rows.set(r.id, row);
    }
    return row;
  }

  function fillRow(row, r, now) {
    const st = r.endAt ? r.endStatus || "completed" : "running";
    if (row.st !== st) {
      row.st = st;
      row.n.setAttribute("data-status", st);
    }
    const icon = iconFor(r);
    if (row.icon !== icon) {
      row.icon = icon;
      row.ico.innerHTML = icon;
    }
    const text = labelOf(r.task || {});
    if (row.text !== text) row.label.textContent = row.text = text;
    const kind = kindOf(r.task?.type);
    if (row.kind !== kind) {
      row.kind = kind;
      row.chip.textContent = kind;
      row.chip.hidden = !kind;
    }
    const tip = tooltip(r);
    if (row.tip !== tip) row.n.title = row.tip = tip;
    const tt = timeText(r, now);
    if (row.time.textContent !== tt) row.time.textContent = tt;
  }

  // Header: "2 background tasks running · 1 done" / "3 background tasks done · 1 failed"
  function headText(m) {
    const n = m.running.length;
    const meta = [];
    let label;
    if (n > 0) {
      label = `${n} background ${n === 1 ? "task" : "tasks"} running`;
      if (m.counts.completed) meta.push(`${m.counts.completed} done`);
    } else {
      label = `${m.done} background ${m.done === 1 ? "task" : "tasks"} done`;
    }
    if (m.counts.failed) meta.push(`${m.counts.failed} failed`);
    if (m.counts.stopped) meta.push(`${m.counts.stopped} stopped`);
    return { label, meta: meta.join(" · ") };
  }

  function update(b, now, force) {
    const s = b.key && sessions.get(b.key);
    const m = s ? model(s, now) : null;
    const visible = !!m && (m.running.length || m.done);
    if (!visible) {
      if (b.el.isConnected) b.el.remove();
      b.sig = "";
      return;
    }
    const mp = mountPoint(b.view);
    if (!mp) {
      if (b.el.isConnected) b.el.remove();
      return;
    }
    const rows = [...m.running, ...m.recent, ...(s.expanded ? m.folded : [])];
    const sig = `${rows.map((r) => `${r.id}:${r.endAt ? r.endStatus : "r"}`).join(",")}|${m.done}|${m.folded.length}|${s.expanded}`;
    const structural = force || sig !== b.sig || !b.el.isConnected || b.el.parentNode !== mp.parent;
    const stick = structural && atBottom(mp.scroller);

    if (structural) {
      b.sig = sig;
      const ht = headText(m);
      b.label.textContent = ht.label;
      b.meta.textContent = ht.meta ? ` · ${ht.meta}` : "";
      b.meta.hidden = !ht.meta;
      const allDone = m.running.length === 0;
      b.el.setAttribute("data-state", allDone ? "done" : "running");
      b.hIco.innerHTML = allDone ? (m.counts.failed || m.counts.stopped ? ICONS.failed : ICONS.completed) : "";
      b.hIco.hidden = !allDone;
      const canFold = m.folded.length > 0;
      b.head.disabled = !canFold;
      b.head.setAttribute("aria-expanded", String(canFold && s.expanded));
      b.chev.hidden = !canFold;
      b.head.title = canFold ? (s.expanded ? "Hide finished tasks" : "Show finished tasks") : "";

      const keep = new Set(rows.map((r) => r.id));
      for (const [id, row] of b.rows) if (!keep.has(id)) (row.n.remove(), b.rows.delete(id));
      let prev = null;
      for (const r of rows) {
        const row = rowFor(b, r);
        fillRow(row, r, now);
        const want = prev ? prev.nextSibling : b.list.firstChild;
        if (want !== row.n) b.list.insertBefore(row.n, want);
        prev = row.n;
      }
      b.list.hidden = rows.length === 0;
    } else {
      for (const r of rows) {
        const row = b.rows.get(r.id);
        if (row) fillRow(row, r, now);
      }
    }

    const moved = place(b, mp);
    b.where = mp.where;
    if ((structural || moved) && stick) mp.scroller.scrollTop = mp.scroller.scrollHeight;
  }

  // ------------------------------------------------------------- loop
  let timer = 0;
  let disposed = false;

  function tick() {
    if (disposed) return;
    const now = Date.now();
    const views = document.querySelectorAll(".chat-view");
    const seen = new Set();
    for (const view of views) {
      seen.add(view);
      let r;
      try {
        r = tasksFor(view);
      } catch (e) {
        src.error = String(e && e.message ? e.message : e);
        r = { key: null, tasks: null };
      }
      let b = blocks.get(view);
      if (!r.key) {
        if (b) update(Object.assign(b, { key: null }), now);
        continue;
      }
      const s = getSession(r.key);
      reconcile(s, r.tasks, now);
      if (!b) {
        if (!s.recs.size) continue; // nothing to show, nothing to build
        b = createBlock(view);
        blocks.set(view, b);
      }
      if (b.key !== r.key) {
        b.key = r.key;
        b.sig = "";
      }
      update(b, now);
    }
    for (const [view, b] of blocks) {
      if (seen.has(view)) continue;
      b.el.remove();
      blocks.delete(view);
    }
    if (sessions.size > 8) {
      const live = new Set([...blocks.values()].map((b) => b.key));
      for (const [key, s] of sessions) if (!s.recs.size && !live.has(key)) sessions.delete(key);
    }
  }

  function loop() {
    if (disposed) return;
    try {
      if (document.visibilityState !== "hidden") tick();
    } catch (e) {
      src.error = String(e && e.message ? e.message : e);
    }
    timer = setTimeout(loop, POLL_MS);
  }

  const start = () => {
    if (!disposed && !timer) loop();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();

  // ------------------------------------------------------------- introspection
  window.__RE_TEMPO_BG_TASKS__ = {
    source: () => ({ how: src.how, hasStates: !!src.states, error: src.error }),
    state: () =>
      [...blocks.values()].map((b) => {
        const s = b.key && sessions.get(b.key);
        const m = s ? model(s, Date.now()) : null;
        return {
          key: b.key,
          mounted: b.el.isConnected,
          where: b.where || null,
          running: m ? m.running.map((r) => labelOf(r.task || {})) : [],
          recent: m ? m.recent.map((r) => `${labelOf(r.task || {})} (${r.endStatus})`) : [],
          folded: m ? m.folded.length : 0,
          header: b.label.textContent + (b.meta.hidden ? "" : ` ${b.meta.textContent}`),
        };
      }),
    refresh: () => tick(),
    dispose() {
      disposed = true;
      clearTimeout(timer);
      for (const b of blocks.values()) b.el.remove();
      blocks.clear();
      sessions.clear();
      if (window.__RE_TEMPO_BG_TASKS__ === this) delete window.__RE_TEMPO_BG_TASKS__;
    },
  };
})();
