/*
 * RE-TEMPO · canvas-autosetup (user MOD layer)
 * ---------------------------------------------------------------------------
 * Starts canvas setup by itself, once per workspace: when the Design home
 * shows the "Set up canvases" empty state, when the user picks the disabled
 * "New canvas" (click, Enter or ⇧C), and when a new project/workspace that is
 * not set up for canvases is opened.
 *
 * Why "New canvas" is disabled (bundle index-D2Ui1vc0.js, read 2026-10-19):
 *   - The center tab bar computes, for the selected workspace y,
 *       St = uVi(y)   // readiness, polled every 1 s while "missing"/"empty-workspace"
 *       Et = St === "missing" && y ? ZBi(U3(y, hasProjectCanvases)) : void 0
 *     and passes newTabActions.newCanvasDisabledReason = Et. With a reason the
 *     "+" menu renders the canvas item as Gma (aria-disabled, onClick only
 *     preventDefault, the reason in a tooltip: "This workspace needs canvas
 *     setup before you can create a canvas. Set up canvases from the Design
 *     tab."), and the menu's ⇧C shortcut is swallowed without an action.
 *   - Readiness (store checkWorkspaceCanvasReadiness): no path or a missing
 *     folder -> "empty-workspace"; an empty folder -> "missing"; otherwise
 *     "present" only when tempo/tempo.config.json exists, else "missing".
 *     A new repo (empty, or an app without tempo/) is therefore "missing".
 *   - uVi polls every 1 s while "missing", so once setup writes
 *     tempo/tempo.config.json the item turns on by itself, without a reload.
 *
 * What the app's button does (bundle index-D2Ui1vc0.js, read 2026-10-17):
 *   - t_a({hasProjectCanvases, branch, baseBranch, onBrowseCanvases, onSetup})
 *     renders [data-testid="design-homepage-no-canvas-config"] with the
 *     [data-testid="start-canvas-setup-button"] button. The Design home (D_a)
 *     shows it when the selected sidebar workspace has canvas readiness
 *     "missing" and no canvases of its own, and passes
 *       onSetup = useCallback(() => { ne && rVi({ workspaceId: ne.id,
 *         onNavigateToChat, hasProjectCanvases }) })
 *     where ne is the workspace of the page's selection state
 *     {kind: "workspace", projectId, workspaceId}.
 *   - rVi() selects that workspace, creates a new chat tab in it, puts a
 *     setup prompt in the composer as a DRAFT (setChatInputDraft), navigates
 *     to the chat and focuses the composer. The prompt is
 *       "Please set up this workspace for Tempo canvases. Inspect the project
 *        first and preserve its existing app and framework."
 *     plus "Current branch: <b>." / "This workspace was created from <base>."
 *   - It does NOT send the message, so the click consumes no AI agent run.
 *     The user lands on a new chat tab with that prompt ready; the agent only
 *     runs (and edits the workspace) after Send.
 *
 * What this mod does:
 *   - When the state is on screen (not inert, not hidden) and has stayed there
 *     for ~800 ms with the window visible and focused, it clicks the app's own
 *     button, so the app runs its own onSetup. No bundle calls of its own.
 *   - Guard: localStorage "re-tempo:canvas-autosetup:<workspaceId>" = timestamp,
 *     written BEFORE the click. It never loops and never fires again for that
 *     workspace, even if the setup fails or is cancelled. Workspace id: the
 *     Design page's selection state read from the React fiber (the same id the
 *     app's onSetup uses); fallbacks are the #/workspaces/<id> hash, then the
 *     selected workspace in electronAPI.persist "tempo-workspaces". No id, no
 *     click.
 *   - Only the primary variant ("Set up canvases": the project has no canvases
 *     anywhere). The secondary "Set up this workspace" variant (the project
 *     already has canvases on another branch or workspace) is left alone: there
 *     the app's primary action is "Browse existing canvases", and its prompt
 *     only asks the agent to look for the existing setup elsewhere.
 *   - A short toast in the app's Sonner look (bottom-right, close button,
 *     auto-hides in 6 s, pauses on hover) says why a chat just opened.
 *   - Auto-send, ON by default: once the setup draft is in the composer of the
 *     chat tab the click just created, the mod presses Send. That starts ONE AI
 *     agent run per workspace (it edits the workspace and uses plan usage). The
 *     workspace guard is already written at that point. Send is pressed only
 *     when all of these hold, otherwise nothing is sent and the toast says so:
 *       - the composer sits in a .chat-view[data-testid="chat-view-<tabId>"]
 *         whose tab id existed nowhere before the click: not on the page and
 *         not in any workspace's centerTabs in "tempo-workspaces" (the new tab);
 *       - that chat has no messages (data-source-message-count="0");
 *       - the composer text is exactly the app's setup prompt for this
 *         workspace (prompt + "Current branch: …" from the state's props);
 *       - it happens within 8 s of the click (one send loop at a time);
       - the workspace id came from the Design page's selection (fiber). With
         a fallback id (hash or persist) the guard may name another workspace
         than the one the app sets up, so the draft is left for the user.
 *     Turn it off with localStorage "re-tempo:canvas-autosetup-send" = "0"
 *     (setAutoSend(false)); then the user presses Send.
 *   - Kill switch: localStorage "re-tempo:canvas-autosetup-off" = "1"
 *     (or setEnabled(false)).
 *
 * Other triggers, all ending in the same app button (no setup flow of its own):
 *   - The disabled "New canvas" of the app's "+" menu (and the pane "+" of
 *     pane-dock, read from its markup): a click, Enter on it, or ⇧C while the
 *     menu is open. Caught in the capture phase on window, so the app's no-op
 *     never runs; the menu gets an Escape.
 *   - Opening or creating a project/workspace: when the selected workspace's
 *     readiness (the app's own check) is "missing", it is not guarded yet, the
 *     window is focused and the route is the workspace view or Design.
 *     Scope: only workspaces created at most 24 h before this mod first ran
 *     (localStorage "re-tempo:canvas-autosetup-since"), so the old workspaces
 *     of a project never start an agent run just by being opened; those still
 *     get setup from "New canvas" or the Design home. "re-tempo:canvas-
 *     autosetup-open" = "all" covers every workspace, "0" turns this off.
 *   Each trigger checks the workspace guard first, and also skips a workspace
 *   that already has a (non-archived) setup chat tab, such as "Canvas Setup"
 *   or "Setup Tempo Canvases" (the Design home auto-click skips it too); from
 *   the menu either case shows a toast with "Set up again", records an intent { workspaceId, source } and opens
 *   the Design route; the Design page selects the selected workspace and shows
 *   the empty state, and the engine clicks its button at once (no debounce)
 *   when the state's workspace is the intent's. No state within 6 s: a toast
 *   says to press "Set up canvases" in Design.
 *   - Empty repository (the app's checkWorkspaceFolderState says "empty": only
 *     .git): the app's prompt says to preserve the existing app, and its
 *     canvas_project_init needs a framework it cannot detect there. For that
 *     case only, the draft gets one more paragraph (EMPTY_REPO_NOTE: scaffold
 *     a minimal Vite + React + TypeScript app first). It is added by wrapping
 *     the draft store's setChatInputDraft for the length of the click, so the
 *     app's rVi writes it; the wrapper is removed right after.
 *
 * After the click (2026-10-19, project "test": fired 0.8 s after the project
 * was created, the new chat never got a chat view, Send timed out, nothing ran):
 *   - The open trigger waits until the workspace is 4 s old and has stayed
 *     selected for 2 s.
 *   - The tab rVi made is read from its setChatInputDraft call; when its chat
 *     view is not on screen 1.2 s later, the mod selects it again
 *     (selectWorkspaceChat) on the chat route.
 *   - Send not pressed in 12 s: a toast says so, with "Try again" (clears the
 *     guard of that workspace and starts again, even with that chat there).
 *   - After Send, a watch every 2 s (up to 45 min): readiness "present" ->
 *     the canvas the setup made (tempo/<paths.canvases>/canvases/<name>,
 *     "home" first) opens with the app's openDesignTab; the chat no longer
 *     awaiting a response while still "missing" -> a toast with "Try again".
 *
 * "New canvas" while "missing" (the user, 2026-10-19: "it has to be clickable;
 * no setup -> set it up; set up -> open; and go on until there is a canvas"):
 *   - It reads as an ordinary item (data-rcas-setup + the .css); the app's
 *     "... from the Design tab." tooltip is hidden, pane-dock's title dropped.
 *     With "present" the app's own item is back and nothing is touched.
 *   - Picking it: a setup chat already there (made by this page, holding the
 *     setup prompt as a draft, or named as a setup) comes to the front and an
 *     unsent draft is sent (auto-send on); none -> setup starts as above.
 *   - Either way a readiness watch runs to the end: "present" opens the canvas
 *     the setup made, or the app's New canvas when it made none.
 *
 * Introspection: window.__RE_TEMPO_CANVAS_AUTOSETUP__ =
 *   { state, reset(id?), guards(), setAutoSend(bool), setEnabled(bool),
 *     setOpenMode("new" | "all" | "off"), retry(id), openCanvas(id) }.
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (window.__RE_TEMPO_CANVAS_AUTOSETUP__) return; // double injection

  const STATE_SEL = '[data-testid="design-homepage-no-canvas-config"]';
  const BTN_SEL = '[data-testid="start-canvas-setup-button"]';
  const INPUT_SEL = "[data-chat-input]";
  const SEND_SEL = '[data-testid="chat-input-send-button"]';
  const KEY_PREFIX = "re-tempo:canvas-autosetup:"; // + workspace id
  const SEND_KEY = "re-tempo:canvas-autosetup-send";
  const OFF_KEY = "re-tempo:canvas-autosetup-off";
  const PRIMARY_LABEL = "Set up canvases";
  // The app's own setup prompt (bundle QBi), used by rVi for the primary variant.
  const SETUP_PROMPT =
    "Please set up this workspace for Tempo canvases. Inspect the project first and preserve its existing app and framework.";
  const CHAT_VIEW_SEL = '[data-testid^="chat-view-"]';
  const DEBOUNCE_MS = 800;
  const TOAST_MS = 6000;
  const SEND_WAIT_MS = 12000;
  const OPEN_SETTLE_MS = 4000; // a just-created workspace: let the app finish creating it first
  const SHOW_CHAT_MS = 1200; // the setup chat not on screen by then: select it again
  const WATCH_MS = 2000; // run watch tick
  const WATCH_MAX_MS = 45 * 60 * 1000;
  // "+" menus: the app's (Gma keeps the test id) and pane-dock's pane "+".
  const APP_MENU_SEL = '[data-testid="new-tab-panel"]';
  const APP_CANVAS_ITEM = '[data-testid="new-tab-action-canvas"]';
  const DOCK_MENU_SEL = ".rtd-menu";
  const DOCK_CANVAS_ITEM = '.rtd-menu [role="menuitem"][data-key="canvas"]';
  const OPEN_KEY = "re-tempo:canvas-autosetup-open"; // "0" | "all" | default: new workspaces
  const SINCE_KEY = "re-tempo:canvas-autosetup-since";
  const OPEN_ROUTES = new Set(["chat", "design"]);
  const NEW_WS_MS = 24 * 60 * 60 * 1000;
  const OPEN_TICK_MS = 1000;
  const OPEN_RETRY_MS = 60000; // readiness still unknown after this: give up for that workspace
  const INTENT_MS = 6000;
  const EMPTY_REPO_NOTE =
    "This repository is empty (no app yet), so there is nothing to preserve: scaffold a minimal Vite + React + TypeScript app at the repository root first, then set it up for Tempo canvases.";

  const state = {
    status: "idle", // idle | waiting | waiting-focus | fired | skipped
    reason: null, // why the last decision was a skip
    pending: null, // { since } while the debounce runs
    last: null, // { workspaceId, idSource, at, autoSend, sent, tabId, source, emptyRepo, note }
    fired: [], // clicks made by this page load
    intent: null, // { workspaceId, source, at } while a trigger waits for the Design home
    triggers: [], // { workspaceId, source, at, outcome } from the menu, ⇧C and open
    open: {}, // workspace id -> what the open check decided
    watch: {}, // workspace id -> readiness watch: watching | present | no-config | timeout
  };

  // ------------------------------------------------------------------ storage
  const store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch (_) {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
        return localStorage.getItem(k) === v;
      } catch (_) {
        return false;
      }
    },
    del(k) {
      try {
        localStorage.removeItem(k);
      } catch (_) {}
    },
    keys() {
      try {
        return Object.keys(localStorage);
      } catch (_) {
        return [];
      }
    },
  };
  const isOff = () => store.get(OFF_KEY) === "1";
  const autoSendOn = () => store.get(SEND_KEY) !== "0"; // default: send
  const openMode = () => {
    const v = store.get(OPEN_KEY);
    return v === "0" ? "off" : v === "all" ? "all" : "new";
  };
  function sinceMs() {
    let v = Number(store.get(SINCE_KEY));
    if (!v) {
      v = Date.now();
      store.set(SINCE_KEY, String(v));
    }
    return v;
  }

  // ------------------------------------------------------------------ helpers
  const fiberOf = (node) => {
    if (!node) return null;
    const k = Object.keys(node).find((x) => x.startsWith("__reactFiber$"));
    return k ? node[k] : null;
  };

  const isShown = (n) => {
    if (!n || !n.isConnected || n.closest("[inert]")) return false;
    if (!n.getClientRects().length) return false;
    return getComputedStyle(n).visibility !== "hidden";
  };

  const windowActive = () => document.visibilityState === "visible" && document.hasFocus();

  function visibleRoot() {
    for (const n of document.querySelectorAll(STATE_SEL)) if (isShown(n)) return n;
    return null;
  }

  // t_a's props: { hasProjectCanvases, branch, baseBranch, onSetup, ... }
  function setupProps(root) {
    let f = fiberOf(root);
    for (let d = 0; f && d < 6; d++, f = f.return) {
      const p = f.memoizedProps;
      if (p && typeof p === "object" && typeof p.onSetup === "function") return p;
    }
    return null;
  }

  // The Design page's selection useState: { kind: "workspace", projectId, workspaceId }.
  function selectionFromFiber(root) {
    let f = fiberOf(root);
    for (let d = 0; f && d < 80; d++, f = f.return) {
      let h = f.memoizedState;
      if (!h || typeof h !== "object" || !("next" in h)) continue;
      for (let i = 0; h && i < 600; i++, h = h.next) {
        const s = h.memoizedState;
        if (
          s &&
          typeof s === "object" &&
          s.kind === "workspace" &&
          typeof s.workspaceId === "string" &&
          s.workspaceId &&
          typeof s.projectId === "string"
        ) {
          return s;
        }
      }
    }
    return null;
  }

  function hashWorkspaceId() {
    const m = (location.hash || "").match(/^#\/workspaces\/([^/?#]+)/);
    if (!m) return null;
    try {
      return decodeURIComponent(m[1]);
    } catch (_) {
      return m[1];
    }
  }

  // Synchronous id (fiber, then hash); null when only persist can tell.
  function syncWorkspace(root) {
    const s = selectionFromFiber(root);
    if (s) return { id: s.workspaceId, source: "fiber" };
    const h = hashWorkspaceId();
    return h ? { id: h, source: "hash" } : null;
  }

  async function persistedState() {
    try {
      const api = window.electronAPI && window.electronAPI.persist;
      if (!api || typeof api.getItem !== "function") return null;
      const raw = await api.getItem("tempo-workspaces");
      return (raw && JSON.parse(raw).state) || null;
    } catch (_) {
      return null;
    }
  }

  async function persistedWorkspace() {
    const st = await persistedState();
    return st && st.selectedWorkspaceId ? { id: String(st.selectedWorkspaceId), source: "persist" } : null;
  }

  // ------------------------------------------------------------------- stores
  // zustand v4 leaves getState in the deps [getState, getServerState, selector,
  // isEqual] of useSyncExternalStoreWithSelector's memo; only pure `()=>x`
  // getters are called (same technique as canvas-comment-agent / pane-dock).
  // ws: the workspaces store ($ in the bundle); draft: the chat input draft
  // store (QG, whose setChatInputDraft rVi calls).
  const GETTER_RE = /^\(\)=>[A-Za-z$_][\w$]*$/;
  const S = { ws: null, draft: null, tried: new WeakSet() };

  function scanStores() {
    const root = document.getElementById("root");
    const key = root && Object.keys(root).find((k) => k.startsWith("__reactContainer$"));
    if (!key) return;
    const stack = [root[key]];
    for (let n = 0; stack.length && n < 80000 && !(S.ws && S.draft); n++) {
      const f = stack.pop();
      if (f.sibling) stack.push(f.sibling);
      if (f.child) stack.push(f.child);
      let h = f.memoizedState;
      if (!h || typeof h !== "object" || !("next" in h)) continue;
      for (let i = 0; h && i < 400; i++, h = h.next) {
        const m = h.memoizedState;
        const d = Array.isArray(m) && m.length === 2 ? m[1] : null;
        if (!Array.isArray(d) || d.length !== 4 || typeof d[0] !== "function" || typeof d[2] !== "function") continue;
        const gs = d[0];
        if (S.tried.has(gs)) continue;
        S.tried.add(gs);
        if (!GETTER_RE.test(Function.prototype.toString.call(gs))) continue;
        let st;
        try {
          st = gs();
        } catch (_) {
          continue;
        }
        if (!st || typeof st !== "object") continue;
        if (
          !S.ws &&
          Array.isArray(st.workspaces) &&
          typeof st.setActiveNavRoute === "function" &&
          typeof st.checkWorkspaceCanvasReadiness === "function"
        )
          S.ws = gs;
        else if (!S.draft && typeof st.setChatInputDraft === "function" && st.chatInputDrafts && typeof st.chatInputDrafts === "object")
          S.draft = gs;
      }
    }
  }

  function wsStore() {
    if (!S.ws) scanStores();
    try {
      return S.ws ? S.ws() : null;
    } catch (_) {
      return null;
    }
  }

  // A chat tab of this workspace that already is a canvas setup (the app names
  // it from the prompt: "Canvas Setup", "Setup Tempo Canvases", ...), archived
  // ones aside: setup started there, by hand or by an earlier version.
  const SETUP_DRAFT_RE = /set up this workspace for Tempo canvases|help me use canvases in this workspace/i;
  const SETUP_CHAT_RE = /\b(canvas(es)?\s+set\s*-?up|set\s*-?up\b.*\bcanvas(es)?)\b/i;
  function setupChatOf(ws) {
    const tabs = (ws && Array.isArray(ws.centerTabs) && ws.centerTabs) || [];
    return tabs.find((t) => t && t.type === "chat" && !t.isArchived && SETUP_CHAT_RE.test(String(t.name || t.title || ""))) || null;
  }

  const workspaceById = (st, id) =>
    (st && id && Array.isArray(st.workspaces) ? st.workspaces.find((w) => w && w.id === id) : null) || null;

  // The app's own readiness check: "missing" | "present" | "empty-workspace".
  async function readinessOf(id) {
    const st = wsStore();
    try {
      return st ? await st.checkWorkspaceCanvasReadiness(id) : "unknown";
    } catch (_) {
      return "unknown";
    }
  }

  // The app's folder check: "empty" when the folder holds nothing but .git.
  async function folderStateOf(path) {
    try {
      const api = window.electronAPI && window.electronAPI.workspaces;
      if (!path || !api || typeof api.checkWorkspaceFolderState !== "function") return null;
      const r = await api.checkWorkspaceFolderState(path);
      return r && r.success ? r.data || null : null;
    } catch (_) {
      return null;
    }
  }

  // For the length of one click: rVi's setChatInputDraft(workspaceId, tab,
  // <the app's prompt>) gets `note` as one more paragraph. Returns the undo
  // (which says whether the note went in), or null when the store is not there.
  function wrapDraft(workspaceId, base, note) {
    if (!S.draft) scanStores();
    const gs = S.draft;
    let st0 = null;
    try {
      st0 = gs ? gs() : null;
    } catch (_) {}
    const orig = st0 && st0.setChatInputDraft;
    if (typeof orig !== "function") return null;
    let applied = false;
    const wrapped = function (w, tab, text, ...rest) {
      if (!applied && w === workspaceId && text === base) {
        applied = true;
        wrapDraft.tabId = tab;
        if (note) text = `${base}\n\n${note}`;
      }
      return orig.call(this, w, tab, text, ...rest);
    };
    try {
      st0.setChatInputDraft = wrapped;
    } catch (_) {
      return null;
    }
    if (st0.setChatInputDraft !== wrapped) return null;
    return () => {
      let cur = null;
      try {
        cur = gs();
      } catch (_) {}
      for (const s of [st0, cur])
        if (s && s.setChatInputDraft === wrapped)
          try {
            s.setChatInputDraft = orig;
          } catch (_) {}
      return applied && !!note;
    };
  }

  // "primary" only when the project has no canvases anywhere.
  function variantOf(root, btn) {
    const p = setupProps(root);
    if (p && typeof p.hasProjectCanvases === "boolean") return p.hasProjectCanvases ? "secondary" : "primary";
    const label = (btn.textContent || "").trim();
    const single = root.querySelectorAll("button").length === 1;
    return label === PRIMARY_LABEL && single ? "primary" : "secondary";
  }

  // -------------------------------------------------------------------- toast
  let toastEl = null;
  let toastTimer = 0;

  function hideToast() {
    clearTimeout(toastTimer);
    const t = toastEl;
    if (!t) return;
    toastEl = null;
    t.removeAttribute("data-show");
    setTimeout(() => t.remove(), 220);
  }

  // action: { label, onClick } shows one button under the text (Sonner's action).
  function showToast(title, description, action) {
    if (toastEl) toastEl.remove();
    clearTimeout(toastTimer);
    const t = document.createElement("div");
    t.className = "rcas-toast";
    t.setAttribute("role", "status");
    t.setAttribute("aria-live", "polite");
    const content = document.createElement("div");
    content.className = "rcas-toast-content";
    const ti = document.createElement("div");
    ti.className = "rcas-toast-title";
    ti.textContent = title;
    content.appendChild(ti);
    if (description) {
      const de = document.createElement("div");
      de.className = "rcas-toast-desc";
      de.textContent = description;
      content.appendChild(de);
    }
    if (action) {
      const ab = document.createElement("button");
      ab.type = "button";
      ab.className = "rcas-toast-action";
      ab.textContent = action.label;
      ab.addEventListener("click", () => {
        hideToast();
        action.onClick();
      });
      content.appendChild(ab);
    }
    const close = document.createElement("button");
    close.type = "button";
    close.className = "rcas-toast-close";
    close.setAttribute("aria-label", "Dismiss");
    close.innerHTML =
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
    close.addEventListener("click", hideToast);
    t.append(content, close);
    t.addEventListener("mouseenter", () => clearTimeout(toastTimer));
    t.addEventListener("mouseleave", () => {
      clearTimeout(toastTimer);
      toastTimer = setTimeout(hideToast, 2000);
    });
    document.body.appendChild(t);
    toastEl = t;
    requestAnimationFrame(() => requestAnimationFrame(() => t.setAttribute("data-show", "")));
    toastTimer = setTimeout(hideToast, TOAST_MS);
  }

  // --------------------------------------------------------------- auto-send
  const squash = (t) => (t || "").replace(/\s+/g, ""); // ProseMirror drops the \n\n between paragraphs

  // The exact draft rVi writes: prompt + branch lines from the same workspace.
  function expectedDraft(props) {
    if (!props) return null;
    const branch = typeof props.branch === "string" && props.branch ? props.branch : null;
    const base = typeof props.baseBranch === "string" && props.baseBranch ? props.baseBranch : null;
    return (
      SETUP_PROMPT +
      (branch ? `\n\nCurrent branch: ${branch}.` : "") +
      (base ? ` This workspace was created from ${base}.` : "")
    );
  }

  const chatTabId = (cv) => {
    const m = /^chat-view-(.+)$/.exec((cv && cv.getAttribute("data-testid")) || "");
    return m ? m[1] : null;
  };

  // Every chat tab id that exists before the click: mounted chat views plus
  // the persisted centerTabs of all workspaces (old tabs not mounted yet).
  async function chatTabIdsBefore() {
    const ids = new Set();
    for (const cv of document.querySelectorAll(CHAT_VIEW_SEL)) {
      const id = chatTabId(cv);
      if (id) ids.add(id);
    }
    const st = await persistedState();
    for (const w of (st && st.workspaces) || []) {
      for (const t of (w && w.centerTabs) || []) if (t && t.id != null) ids.add(String(t.id));
    }
    return ids;
  }

  let sendLoop = 0;
  let sendRecord = null;

  function stopSendLoop(outcome) {
    clearInterval(sendLoop);
    sendLoop = 0;
    if (sendRecord && sendRecord.sent === "pending") sendRecord.sent = outcome;
    sendRecord = null;
  }

  // Presses Send in the chat tab the click just created, and nowhere else.
  function sendDraftWhenReady(record, tabsBefore, expected) {
    stopSendLoop("superseded");
    sendRecord = record;
    const want = squash(expected || SETUP_PROMPT);
    const t0 = Date.now();
    sendLoop = setInterval(() => {
      if (sendRecord !== record) return;
      if (Date.now() - t0 > SEND_WAIT_MS) {
        stopSendLoop("timeout");
        showToast("Canvas setup didn't start", "The setup prompt wasn't sent. Try again, or press Send in the setup chat.", {
          label: "Try again",
          onClick: () => retry(record.workspaceId),
        });
        return;
      }
      for (const input of document.querySelectorAll(INPUT_SEL)) {
        if (!isShown(input)) continue;
        const cv = input.closest(CHAT_VIEW_SEL);
        const tabId = chatTabId(cv);
        if (!tabId || tabsBefore.has(tabId)) continue; // only the new tab
        const count = cv.getAttribute("data-source-message-count");
        if (count != null && count !== "0") continue;
        const text = squash(input.textContent);
        if (expected ? text !== want : !text.startsWith(want)) continue;
        const b = cv.querySelector(SEND_SEL);
        if (!b || b.disabled || !isShown(b)) continue;
        record.tabId = tabId;
        stopSendLoop(true);
        record.sent = true;
        b.click();
        watchReady(record.workspaceId, tabId);
        return;
      }
    }, 150);
  }

  // ------------------------------------------------------------------ engine
  let timer = 0;
  let firing = false;
  let handled = new WeakMap(); // state root -> workspace tag already decided

  function cancelPending() {
    clearTimeout(timer);
    timer = 0;
    state.pending = null;
  }

  function skip(root, tag, reason) {
    if (root) handled.set(root, tag);
    state.status = "skipped";
    state.reason = reason;
  }

  // A trigger (menu, ⇧C, open) waiting for the Design home of its workspace.
  let intent = null; // { workspaceId, source, at }
  let intentTimer = 0;
  const liveIntent = () => (intent && Date.now() - intent.at <= INTENT_MS ? intent : null);

  function clearIntent() {
    clearTimeout(intentTimer);
    intentTimer = 0;
    intent = null;
    state.intent = null;
  }

  function noteTrigger(rec, outcome) {
    rec.outcome = outcome;
    state.triggers.push(rec);
    if (state.triggers.length > 20) state.triggers.shift();
  }

  function evaluate() {
    scheduled = false;
    const root = isOff() ? null : visibleRoot();
    if (!root) {
      if (timer) cancelPending();
      if (state.status === "waiting" || state.status === "waiting-focus") state.status = "idle";
      return;
    }
    const sync = syncWorkspace(root);
    const tag = sync ? sync.id : "?";
    const it = liveIntent();
    // A trigger for this very workspace: no debounce, fire() decides.
    if (it && sync && sync.id === it.workspaceId) {
      if (!firing) {
        cancelPending();
        state.status = "waiting";
        timer = setTimeout(fire, 0);
      }
      return;
    }
    if (handled.get(root) === tag) return;
    if (sync && store.get(KEY_PREFIX + sync.id)) {
      skip(root, tag, "already-started");
      return;
    }
    if (!windowActive()) {
      cancelPending();
      state.status = "waiting-focus";
      return;
    }
    if (timer) return;
    state.status = "waiting";
    state.pending = { since: Date.now() };
    timer = setTimeout(fire, DEBOUNCE_MS);
  }

  function startedToast(source, autoSend, emptyRepo) {
    const what = source === "open" ? "This new project isn't set up for canvases yet. " : source === "design" ? "" : "This workspace isn't set up for canvases yet. ";
    const empty = emptyRepo ? " The repo is empty, so it scaffolds a Vite + React app first." : "";
    showToast(
      "Setting up canvases…",
      what +
        (autoSend
          ? "Sending the canvas setup prompt in a new chat. This starts an agent run; New canvas turns on when it's done."
          : "Opened a new chat with the canvas setup prompt. Press Send to start it.") +
        empty
    );
  }

  async function fire() {
    timer = 0;
    state.pending = null;
    if (firing) return;
    firing = true;
    try {
      const root = isOff() ? null : visibleRoot();
      if (!root) {
        state.status = "idle";
        return;
      }
      if (!windowActive()) {
        state.status = "waiting-focus";
        return;
      }
      const sync = syncWorkspace(root);
      const tag = sync ? sync.id : "?";
      const it = liveIntent();
      const via = it && sync && sync.id === it.workspaceId ? it : null;
      if (via) clearIntent();
      const btn = root.querySelector(BTN_SEL);
      if (!btn || btn.disabled || !isShown(btn)) return skip(root, tag, "no-button");
      if (variantOf(root, btn) !== "primary") {
        if (via)
          showToast(
            "This project already has canvases",
            "This branch isn't set up for them yet. Browse the existing canvases, or press Set up this workspace."
          );
        return skip(root, tag, "secondary-variant");
      }
      const ws = sync || (await persistedWorkspace());
      if (!ws) return skip(root, tag, "no-workspace-id");
      if (!via && setupChatOf(workspaceById(wsStore(), ws.id))) return skip(root, tag, "setup-chat-exists");
      // A fallback id may not be the workspace the app sets up: no auto-send then.
      const autoSend = autoSendOn() && ws.source === "fiber";
      const tabsBefore = autoSend ? await chatTabIdsBefore() : null;
      const base = expectedDraft(setupProps(root));
      // Empty repo (only .git): the app's prompt alone has no app to set up.
      const wsObj = ws.source === "fiber" ? workspaceById(wsStore(), ws.id) : null;
      const emptyRepo = !!(wsObj && base) && (await folderStateOf(wsObj.path)) === "empty";
      // the await may have let the page move on
      if (visibleRoot() !== root || !root.contains(btn) || !windowActive()) {
        state.status = "idle";
        schedule();
        return;
      }
      const key = KEY_PREFIX + ws.id;
      if (store.get(key)) return skip(root, tag, "already-started");
      const at = Date.now();
      if (!store.set(key, String(at))) return skip(root, tag, "storage-unavailable");
      handled.set(root, tag);
      const source = via ? via.source : "design";
      const record = { workspaceId: ws.id, idSource: ws.source, at, autoSend, sent: autoSend ? "pending" : false, source, emptyRepo, note: false };
      state.last = record;
      state.fired.push(record);
      state.status = "fired";
      state.reason = null;
      wrapDraft.tabId = null;
      const undo = base ? wrapDraft(ws.id, base, emptyRepo ? EMPTY_REPO_NOTE : null) : null;
      try {
        btn.click(); // the app's onSetup -> rVi (sync: the draft is written before click() returns)
      } finally {
        if (undo) record.note = undo();
        record.tabId = wrapDraft.tabId || null;
      }
      if (record.tabId) setTimeout(() => showSetupChat(record), SHOW_CHAT_MS);
      watchReady(ws.id, record.tabId);
      startedToast(source, autoSend, record.note);
      const expected = record.note ? `${base}\n\n${EMPTY_REPO_NOTE}` : base;
      if (autoSend) sendDraftWhenReady(record, tabsBefore, expected);
    } finally {
      firing = false;
    }
  }

  // Starts setup through the app's own Design home button: the intent is noted,
  // the Design route opens (its page selects the selected workspace) and the
  // engine above clicks "Set up canvases" as soon as it shows for that workspace.
  // The setup chat is the visible, active tab: when its chat view is not on
  // screen shortly after rVi made it, select it again (the app's own action).
  function showSetupChat(record) {
    const sel = `[data-testid="chat-view-${record.tabId}"]`;
    const cv = document.querySelector(sel);
    record.chatShown = !!(cv && isShown(cv));
    if (record.chatShown) return;
    const st = wsStore();
    if (!st || st.selectedWorkspaceId !== record.workspaceId) return;
    try {
      if (typeof st.selectWorkspaceChat === "function") st.selectWorkspaceChat(record.workspaceId, record.tabId);
      if (st.activeNavRoute !== "chat") st.setActiveNavRoute("chat");
      record.chatReselected = true;
    } catch (_) {}
  }

  // Clears the guard of one workspace and starts its setup again.
  function retry(workspaceId) {
    store.del(KEY_PREFIX + workspaceId);
    handled = new WeakMap();
    openDone.delete(workspaceId);
    const st = wsStore();
    const ws = workspaceById(st, workspaceId);
    if (!st || !ws) return showToast("Couldn't start canvas setup", "Open Design and press Set up canvases.");
    if (st.selectedWorkspaceId !== workspaceId && typeof st.selectWorkspace === "function") st.selectWorkspace(workspaceId);
    forceNext = workspaceId; // its failed setup chat does not block the retry
    startSetup(ws, "retry");
  }

  // Until the workspace is "present" (up to 45 min, every 2 s), then the user
  // lands on a canvas: the one the setup made, else a real New canvas. With
  // the setup chat known: once it has run (awaiting, then not) and readiness
  // is still "missing", a toast says so with "Try again".
  const watches = new Map(); // workspace id -> { tabId, t0, busySeen }
  function watchReady(workspaceId, tabId) {
    const had = watches.get(workspaceId);
    if (had) {
      if (tabId) had.tabId = tabId;
      return;
    }
    const w = { tabId: tabId || null, t0: Date.now(), busySeen: false, busy: false };
    const stop = (result) => {
      clearInterval(w.iv);
      watches.delete(workspaceId);
      state.watch[workspaceId] = result;
    };
    w.iv = setInterval(async () => {
      if (w.busy) return;
      w.busy = true;
      try {
        const r = await readinessOf(workspaceId);
        if (r === "present") {
          stop("present");
          openSetupCanvas({ workspaceId });
          return;
        }
        if (Date.now() - w.t0 > WATCH_MAX_MS) return stop("timeout");
        const ws = workspaceById(wsStore(), workspaceId);
        const tab = w.tabId && ws ? (ws.centerTabs || []).find((t) => t && t.id === w.tabId) : null;
        if (!tab) return;
        if (tab.isAwaitingResponse) w.busySeen = true;
        else if (w.busySeen) {
          stop("no-config");
          showToast("Canvas setup didn't finish", "The setup chat ended without tempo/tempo.config.json, so canvases are still off here.", {
            label: "Try again",
            onClick: () => retry(workspaceId),
          });
        }
      } finally {
        w.busy = false;
      }
    }, WATCH_MS);
    watches.set(workspaceId, w);
    state.watch[workspaceId] = "watching";
  }

  // The app's own New canvas (through canvas-quick when it is loaded), for
  // the selected workspace only.
  async function newCanvasNow(workspaceId) {
    const st = wsStore();
    if (!st || st.selectedWorkspaceId !== workspaceId) return false;
    try {
      const q = window.__RE_TEMPO_CANVAS_QUICK__;
      if (q && typeof q.newCanvas === "function") {
        await q.newCanvas();
        return true;
      }
      const btn = document.querySelector('[data-testid="center-panel-add-tab-button"]');
      for (let f = fiberOf(btn), i = 0; f && i < 60; f = f.return, i++) {
        const a = f.memoizedProps && f.memoizedProps.newTabActions;
        if (a && typeof a.onNewCanvas === "function" && !a.newCanvasDisabledReason) {
          a.onNewCanvas();
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  // Opens the canvas the setup made (tempo/<canvases>/canvases/<name>, "home"
  // first) in a design tab, with the app's own openDesignTab.
  async function openSetupCanvas(record) {
    const st = wsStore();
    const ws = workspaceById(st, record.workspaceId);
    if (!st || !ws || !ws.path) return;
    let dir = "designs";
    try {
      const c = await window.electronAPI.workspace.readTempoConfig(ws.path);
      const cfg = c && (c.data || c.config || c);
      const p = cfg && cfg.paths && cfg.paths.canvases;
      if (typeof p === "string" && p.trim()) dir = p.trim().replace(/^\.\//, "").replace(/\/+$/, "");
    } catch (_) {}
    const rel = `tempo/${dir}/canvases`;
    let names = [];
    try {
      const r = await window.electronAPI.fs.readDir(`${ws.path}/${rel}`);
      const list = Array.isArray(r) ? r : (r && (r.data || r.entries)) || [];
      names = list.map((e) => (typeof e === "string" ? e : e && (e.isDirectory === false ? null : e.name))).filter(Boolean);
    } catch (_) {}
    names.sort((a, b) => (a === "home" ? -1 : b === "home" ? 1 : a.localeCompare(b)));
    record.canvas = names[0] ? `${rel}/${names[0]}` : null;
    if (!names[0]) {
      const made = await newCanvasNow(record.workspaceId);
      record.newCanvas = made;
      showToast("Canvases are set up", made ? "Opened a new canvas." : "New canvas works now in this workspace.");
      return;
    }
    const still = wsStore();
    if (!still || still.selectedWorkspaceId !== record.workspaceId || typeof still.openDesignTab !== "function") {
      showToast("Canvases are set up", `Open ${names[0]} from Design.`);
      return;
    }
    try {
      still.openDesignTab(names[0], record.canvas);
      still.setActiveNavRoute("design");
      record.canvasOpened = true;
      showToast("Canvases are set up", `Opened the ${names[0]} canvas.`);
    } catch (_) {
      showToast("Canvases are set up", `Open ${names[0]} from Design.`);
    }
  }

  // The chat input draft of one tab (the draft store keeps "<ws>-<tab>").
  function draftOf(workspaceId, tabId) {
    if (!S.draft) scanStores();
    try {
      const d = S.draft && S.draft().chatInputDrafts;
      const v = d && d[`${workspaceId}-${tabId}`];
      return typeof v === "string" ? v : v && typeof v.text === "string" ? v.text : null;
    } catch (_) {
      return null;
    }
  }

  // This workspace's setup chat: the one this page made, one holding the
  // setup prompt as a draft (made, never sent), or one named as a setup.
  function findSetupChat(ws) {
    const tabs = ((ws && ws.centerTabs) || []).filter((t) => t && t.type === "chat" && !t.isArchived);
    for (let i = state.fired.length - 1; i >= 0; i--) {
      const r = state.fired[i];
      const t = r.workspaceId === ws.id && r.tabId ? tabs.find((x) => x.id === r.tabId) : null;
      if (t) return { tab: t, draft: draftOf(ws.id, t.id) };
    }
    for (const t of tabs) {
      const d = draftOf(ws.id, t.id);
      if (d && SETUP_DRAFT_RE.test(d)) return { tab: t, draft: d };
    }
    const named = setupChatOf(ws);
    return named ? { tab: named, draft: draftOf(ws.id, named.id) } : null;
  }

  function focusChat(workspaceId, tabId) {
    const st = wsStore();
    if (!st) return false;
    try {
      if (st.selectedWorkspaceId !== workspaceId) st.selectWorkspace(workspaceId);
      if (typeof st.selectWorkspaceChat === "function") st.selectWorkspaceChat(workspaceId, tabId);
      if (st.activeNavRoute !== "chat") st.setActiveNavRoute("chat");
      return true;
    } catch (_) {
      return false;
    }
  }

  // Setup already started here: its chat comes to the front, a draft that was
  // never sent is sent (auto-send on), and the readiness watch takes it to the canvas.
  function resumeSetup(ws, found, source) {
    const unsent = !!found.draft && SETUP_DRAFT_RE.test(found.draft) && !found.tab.sessionId;
    focusChat(ws.id, found.tab.id);
    const rec = { workspaceId: ws.id, at: Date.now(), source, resumed: true, tabId: found.tab.id, unsent, autoSend: unsent && autoSendOn(), sent: false };
    noteTrigger({ workspaceId: ws.id, source, at: rec.at }, unsent ? "resume-unsent" : "resume-running");
    state.last = rec;
    state.fired.push(rec);
    if (rec.autoSend) {
      rec.sent = "pending";
      sendDraftWhenReady(rec, new Set(), found.draft);
    }
    watchReady(ws.id, found.tab.id);
    showToast(
      "Setting up canvases…",
      unsent
        ? rec.autoSend
          ? "Sending the setup prompt in its chat. The canvas opens when it's done."
          : "The setup prompt is in its chat: press Send. The canvas opens when it's done."
        : "Canvas setup is running in its chat. The canvas opens when it's done."
    );
  }

  let forceNext = null; // "Set up again" on a workspace that has a setup chat
  function startSetup(ws, source) {
    const rec = { workspaceId: ws.id, source, at: Date.now() };
    if (isOff()) return noteTrigger(rec, "off");
    if (store.get(KEY_PREFIX + ws.id)) {
      noteTrigger(rec, "already-started");
      if (source !== "open")
        showToast("Canvas setup already started here", "It runs in the chat it opened; New canvas turns on by itself when it's done.", {
          label: "Set up again",
          onClick: () => {
            store.del(KEY_PREFIX + ws.id);
            handled = new WeakMap();
            startSetup(ws, source);
          },
        });
      return;
    }
    const st = wsStore();
    const chat = setupChatOf(workspaceById(st, ws.id) || ws);
    if (chat) {
      noteTrigger(rec, "setup-chat-exists");
      if (source !== "open")
        showToast("Canvas setup already started here", `See the "${chat.name || "setup"}" chat; New canvas turns on by itself when it's done.`, {
          label: "Set up again",
          onClick: () => {
            store.del(KEY_PREFIX + ws.id);
            handled = new WeakMap();
            forceNext = ws.id;
            startSetup(ws, source);
          },
        });
      if (forceNext !== ws.id) return;
    }
    forceNext = null;
    if (!st || st.selectedWorkspaceId !== ws.id || typeof st.setActiveNavRoute !== "function") {
      noteTrigger(rec, "no-store");
      showToast("Couldn't start canvas setup", "Open Design and press Set up canvases.");
      return;
    }
    clearIntent();
    intent = { workspaceId: ws.id, source, at: rec.at };
    state.intent = intent;
    intentTimer = setTimeout(() => {
      if (intent !== state.intent || !intent) return;
      clearIntent();
      state.status = "skipped";
      state.reason = "no-setup-state";
      showToast("Canvas setup didn't start", "Open Design and press Set up canvases.");
    }, INTENT_MS + 50);
    noteTrigger(rec, "design");
    if (st.activeNavRoute !== "design") st.setActiveNavRoute("design");
    schedule();
  }

  // ------------------------------------------------------- "+" New canvas
  // The disabled item (Gma: aria-disabled, its onClick only preventDefault) and
  // pane-dock's disabled pane item (data-disabled + aria-disabled, the app's
  // reason as title). Caught on window in the capture phase, before React's
  // root listener and pane-dock's own handler.
  function disabledCanvasItem(t) {
    const el = t instanceof Element ? t.closest(`${APP_CANVAS_ITEM}, ${DOCK_CANVAS_ITEM}`) : null;
    if (!el || el.getAttribute("aria-disabled") !== "true") return null;
    // a pane item without the app's reason: not readiness
    return el.matches(DOCK_CANVAS_ITEM) && !el.title && !el.hasAttribute("data-rcas-reason") ? null : el;
  }

  // "New canvas" while readiness is "missing": shown as an ordinary item
  // (data-rcas-setup, see the .css), since picking it sets canvases up. The
  // app's tooltip (ZBi: "... from the Design tab.") is hidden, and pane-dock's
  // title moves to data-rcas-reason. Once "present" the app renders its own
  // enabled item, which is left alone.
  const DESIGN_TAB_TIP_RE = /canvas setup.*from the Design tab\.\s*$/s;
  function decorateMenus(records) {
    if (isOff()) return;
    for (const it of document.querySelectorAll(`${APP_CANVAS_ITEM}[aria-disabled="true"], ${DOCK_CANVAS_ITEM}[aria-disabled="true"]`)) {
      if (!disabledCanvasItem(it)) continue;
      if (!it.hasAttribute("data-rcas-setup")) it.setAttribute("data-rcas-setup", "");
      if (it.title) {
        it.setAttribute("data-rcas-reason", it.title);
        it.removeAttribute("title");
      }
    }
    const appRoot = document.getElementById("root");
    for (const r of records || [])
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1 || (appRoot && appRoot.contains(n)) || n.hasAttribute("data-rcas-hide")) continue;
        if (n.closest && n.closest(".rcas-toast")) continue;
        if (DESIGN_TAB_TIP_RE.test(n.textContent || "") && (n.textContent || "").length < 400) n.setAttribute("data-rcas-hide", "");
      }
  }

  function openDisabledCanvasItem(highlightedOnly) {
    for (const m of document.querySelectorAll(`${APP_MENU_SEL}, ${DOCK_MENU_SEL}`)) {
      if (!isShown(m)) continue;
      for (const it of m.querySelectorAll(`${APP_CANVAS_ITEM}, [role="menuitem"][data-key="canvas"]`)) {
        if (!disabledCanvasItem(it)) continue;
        if (!highlightedOnly || it.hasAttribute("data-highlighted") || it === document.activeElement) return it;
      }
    }
    return null;
  }

  let lastMenuAt = 0;
  function onMenuTrigger(item, source) {
    const now = Date.now();
    if (now - lastMenuAt < 400) return; // one gesture, one trigger (Enter may also click)
    lastMenuAt = now;
    const menu = item.closest(`${APP_MENU_SEL}, ${DOCK_MENU_SEL}`);
    if (menu) menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
    const st = wsStore();
    const ws = workspaceById(st, st && st.selectedWorkspaceId);
    if (!ws) {
      noteTrigger({ workspaceId: null, source, at: now }, "no-workspace");
      showToast("Couldn't start canvas setup", "Open Design and press Set up canvases.");
      return;
    }
    if (isOff()) {
      noteTrigger({ workspaceId: ws.id, source, at: now }, "off");
      showToast("Set up canvases from the Design tab", "Automatic canvas setup is turned off.");
      return;
    }
    const found = findSetupChat(ws);
    if (found) return resumeSetup(ws, found, source);
    if (store.get(KEY_PREFIX + ws.id)) return retry(ws.id); // guarded, but its chat is gone
    startSetup(ws, source);
  }

  function onMenuClick(e) {
    const it = disabledCanvasItem(e.target);
    if (!it) return;
    e.preventDefault();
    e.stopPropagation();
    onMenuTrigger(it, "menu");
  }

  function onMenuKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const k = (e.key || "").toLowerCase();
    let it = null;
    if (k === "c" && e.shiftKey) it = openDisabledCanvasItem(false);
    else if (k === "enter" || k === " ") it = openDisabledCanvasItem(true);
    if (!it) return;
    e.preventDefault();
    e.stopPropagation();
    onMenuTrigger(it, k === "c" ? "shortcut" : "menu");
  }

  // ---------------------------------------------------------- open / create
  const openDone = new Set(); // workspace ids decided by the open check
  const openSel = { id: null, since: 0 }; // the selection must hold for a moment
  const openFirst = new Map(); // workspace id -> first check (for the retry window)
  let openBusy = false;

  function isNewWorkspace(ws) {
    const t = Date.parse(ws.createdAt || "");
    return Number.isFinite(t) && t >= sinceMs() - NEW_WS_MS;
  }

  async function checkOpen() {
    // Keep looking for the stores until both are known: the draft store's hook
    // is only mounted with a chat on screen, and fire() runs on the Design page.
    if (!S.ws || !S.draft) scanStores();
    if (openBusy || firing || isOff() || openMode() === "off" || liveIntent()) return;
    const st = wsStore();
    const id = st && st.selectedWorkspaceId;
    if (!id || openDone.has(id)) return;
    const done = (why) => {
      openDone.add(id);
      state.open[id] = why;
    };
    if (store.get(KEY_PREFIX + id)) return done("already-started");
    const ws = workspaceById(st, id);
    if (!ws || ws.isArchived) return done("no-workspace");
    if (openMode() !== "all" && !isNewWorkspace(ws)) return done("not-new");
    // Just created: the app is still setting the workspace up (its first chat,
    // its route); firing then left the setup chat off screen (2026-10-19).
    const born = Date.parse(ws.createdAt || "");
    if (Number.isFinite(born) && Date.now() - born < OPEN_SETTLE_MS) return;
    if (openSel.id !== id) {
      openSel.id = id;
      openSel.since = Date.now();
    }
    if (Date.now() - openSel.since < OPEN_SETTLE_MS / 2) return;
    if (setupChatOf(ws)) return done("setup-chat-exists");
    if (!windowActive() || !OPEN_ROUTES.has(st.activeNavRoute)) return; // later
    if (!openFirst.has(id)) openFirst.set(id, Date.now());
    openBusy = true;
    let r;
    try {
      r = await readinessOf(id);
    } finally {
      openBusy = false;
    }
    if (r === "present") return done("present");
    if (r !== "missing") {
      if (Date.now() - openFirst.get(id) > OPEN_RETRY_MS) done(`readiness-${r}`);
      return;
    }
    const st2 = wsStore();
    if (!st2 || st2.selectedWorkspaceId !== id || !windowActive() || !OPEN_ROUTES.has(st2.activeNavRoute) || liveIntent()) return;
    if (store.get(KEY_PREFIX + id)) return done("already-started");
    done("started");
    startSetup(ws, "open");
  }

  // -------------------------------------------------------------------- mount
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(evaluate);
  }
  const mo = new MutationObserver((records) => {
    decorateMenus(records);
    schedule();
  });

  function onActivity() {
    if (!windowActive()) {
      if (timer) {
        cancelPending();
        state.status = "waiting-focus";
      }
      return;
    }
    evaluate(); // rAF does not run while hidden, so evaluate directly
    checkOpen();
  }

  function init() {
    sinceMs(); // the open scope starts from the first run
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("focus", onActivity);
    window.addEventListener("blur", onActivity);
    document.addEventListener("visibilitychange", onActivity);
    window.addEventListener("hashchange", schedule);
    window.addEventListener("click", onMenuClick, true);
    window.addEventListener("keydown", onMenuKey, true);
    setInterval(checkOpen, OPEN_TICK_MS);
    schedule();
  }

  window.__RE_TEMPO_CANVAS_AUTOSETUP__ = {
    state,
    // Clears the guard of one workspace, or of all of them with no argument.
    reset(id) {
      const keys = id != null ? [KEY_PREFIX + id] : store.keys().filter((k) => k.startsWith(KEY_PREFIX));
      const removed = keys.filter((k) => store.get(k) != null);
      keys.forEach((k) => store.del(k));
      handled = new WeakMap();
      if (id != null) openDone.delete(id);
      else openDone.clear();
      state.status = "idle";
      state.reason = null;
      schedule();
      return removed.map((k) => k.slice(KEY_PREFIX.length));
    },
    guards() {
      const out = {};
      for (const k of store.keys()) if (k.startsWith(KEY_PREFIX)) out[k.slice(KEY_PREFIX.length)] = Number(store.get(k));
      return out;
    },
    setAutoSend(on) {
      if (on) store.del(SEND_KEY);
      else store.set(SEND_KEY, "0");
      return autoSendOn();
    },
    setEnabled(on) {
      if (on) store.del(OFF_KEY);
      else store.set(OFF_KEY, "1");
      if (!on) {
        cancelPending();
        clearIntent();
      }
      schedule();
      return !isOff();
    },
    // Clears a workspace's guard and starts its setup again (the toasts' "Try again").
    retry(id) {
      retry(id);
      return state.intent;
    },
    // Opens the canvas a finished setup made (what the run watch does on "present").
    openCanvas(id) {
      const rec = { workspaceId: id };
      return openSetupCanvas(rec).then(() => rec);
    },
    // "new" (default): new workspaces only; "all": any workspace; "off".
    setOpenMode(mode) {
      if (mode === "all") store.set(OPEN_KEY, "all");
      else if (mode === "off") store.set(OPEN_KEY, "0");
      else store.del(OPEN_KEY);
      return openMode();
    },
  };

  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init, { once: true });
})();
