/*
 * RE-TEMPO · profile-page (user mod layer)
 * ---------------------------------------------------------------------------
 * Two things live here:
 *   1. window.__RE_TEMPO_SETTINGS__: a small API that lets any mod add its own
 *      section to the app's Settings screen, in a "RE-TEMPO" group of the nav.
 *   2. Settings › Profile, built on that API: the user's photo and a
 *      read-only, gamified view of their own work. A level ring, stat tiles, an
 *      activity heatmap, work by type, milestones and "Your month". No streaks,
 *      no points, no ranking: every number is a count of real work, explained
 *      in a tooltip, and progress only goes up.
 *
 * Settings API (stays on even with the Profile flag off)
 *   window.__RE_TEMPO_SETTINGS__ = {
 *     registerSection({ id, label, icon?, order?, render(container) }) → true
 *     unregisterSection(id) → boolean
 *     sections() → [{ id, label, order, group, active }]
 *   }
 *   Registered sections go to a "RE-TEMPO" group right below "Personal".
 *   Profile uses the same machinery but sits in "Personal", as its first item.
 *   - window event "rtsettings:ready" fires as soon as the API exists (at
 *     script load, before Settings ever opens). Register any time: sections
 *     registered before the Settings screen mounts show up when it mounts.
 *   - id: required, unique; registering the same id again replaces it.
 *     label: nav text. order: number, default 100, sorts the RE-TEMPO group
 *     (ties keep registration order). icon: optional SVG markup string or
 *     Element, 14 px, before the label (native items have none).
 *   - render(container) runs on EVERY open, with a fresh empty <div> inside a
 *     div.p-8 host (the native sections' padding). It may return a cleanup
 *     function (or a promise of one), called when the section closes: another
 *     nav item, "Return to app", Settings unmounting, unregister, re-register
 *     or dispose. If render throws, the container shows the error.
 *   - Native look: h2 "mb-6 text-[17px] font-medium
 *     text-[var(--color-text-primary)]"; body "max-w-[550px] space-y-4"; card
 *     "rounded-lg border border-[var(--color-border-secondary)] p-4"; card
 *     title "text-sm font-medium text-[var(--color-text-primary)]"; card text
 *     "text-xs text-[var(--color-text-secondary)]" (voice-input.js uses them).
 *   How it sits in the app (bundle index-D2Ui1vc0.js, read 2026-10-18): the
 *   Settings screen is div.flex.h-full > [div.w-60 (nav) | div.flex-1
 *   .overflow-y-auto (content, one div.p-8 per section)]. The nav groups are
 *   span "Personal" + _I buttons, then "Organizations". Profile goes right
 *   after the "Personal" header; the "RE-TEMPO" group is inserted right after
 *   the Personal group, with the same header and item classes.
 *   While a section is open the native content is hidden (data-rtset-hidden)
 *   and the native selection loses its highlight (data-rtset-off); a click on
 *   any native nav button hands the screen back to React, as voice-input.js
 *   does for Dictation. Reloading this script carries registered sections
 *   over to the new copy.
 *
 * Profile: entry points
 *   - Settings › RE-TEMPO › Profile.
 *   - User menu (the native avatar menu, from the rail or from the project
 *     sidebar footer): a "Profile" item above "Sign Out", with the classes of
 *     "Sign Out". Mouse only (Base UI's keyboard list is fixed).
 *   - Clicking the avatar on the page opens the photo editor.
 *   - window.__RE_TEMPO_PROFILE__.open(). Opening Settings from outside goes
 *     through rail-menu's run("settings") when present, else a shift-click on
 *     the rail gear (rail-menu lets it through), else Cmd+,.
 *
 * Profile photo: LOCAL TO THIS MACHINE
 *   Tempo has no user avatar API. The bundle's user functions are
 *   users:getUser, storeUser({}) (synced from the auth identity, no image
 *   field), setUserSystemPrompt, setMaxAgentConcurrency,
 *   setAutoUploadDiagnosticsEnabled and completeOnboarding; the upload URLs
 *   are for org logos, canvas previews, share images and comment attachments.
 *   The renderer has no Clerk SDK (authBridge: getUserInfo, onAuthCallback,
 *   onSignedOut) and the avatar component (__) only renders initials on
 *   LG(userId). So the photo goes to IndexedDB "rtd-profile-page" ›
 *   "avatars", key "email:<email>" (else "id:<userId>"), value { dataUrl
 *   (256 px, used by the UI), dataUrl512 (512 px export), updatedAt }, WebP
 *   (PNG fallback). Nobody else sees it, other machines neither. Windows of
 *   this app share it (same origin; a BroadcastChannel tells them to reload).
 *   - Editor (<dialog>): drag & drop, click to choose, or paste; PNG, JPEG or
 *     WebP up to 5 MB and at least 64 px a side. Circular crop with pan
 *     (drag, arrow keys) and zoom (wheel or pinch at the pointer, slider, +/-),
 *     double-click resets, live previews at 64/32/24 px. Canvas 2D, no library.
 *   - The app's initials avatars of the user get the photo on top: an <img>
 *     is appended (React's initials span stays underneath), so removing the
 *     photo gives the app's avatar back untouched. Targets: the avatar inside
 *     [aria-label="User menu"] in the rail (project-sidebar.js mirrors its
 *     <img> into its footer); the app's avatar component
 *     (div[aria-label=initials] > span.block.leading-none) when the initials
 *     AND the color match the user's (LG(userId)) AND React rendered it for
 *     the user: the comment popover's rows and the comments list (author
 *     props { authorName, authorAgent }: a human with the user's first name);
 *     the popover's reply field ("Reply to thread…", under the popover body
 *     { thread, resolveAuthor }: always the signed-in user); canvas comment
 *     pins and their hover preview: each avatar of the pin's participant
 *     stack is checked against the participant React rendered it for (nBe
 *     users[i] = { id, initials, color, name, agent }): a human with the
 *     user's first name (or id). Elsewhere, the user's first name in the
 *     surrounding text. The pin's shape, ring, status color and size stay
 *     the app's; other people's avatars are left alone; comment-bubbles'
 *     .rtcb-av with the user's initials and color. A new or re-rendered
 *     avatar gets the photo in the MutationObserver's microtask, before it
 *     is painted (no flash of initials when comment-bubbles rebuilds its
 *     panel or a reply arrives in the popover). The photo fails to load:
 *     every avatar goes back to the initials (still underneath).
 *   - No photo: the app's initials on the app's own color (palette Ner, hash
 *     jer: LG(id) = Ner[jer(id) % 10]); without the app's color, the same hash
 *     of the user id, else of the name, else of the email.
 *
 * Canvas comment pins: Claude's replies (same flag)
 *   canvas-comment-agent.js posts Claude's reply from the user's account and
 *   ends it with "· task <id> · <model> · <effort>", so the app draws it as
 *   the user's. A pin whose thread Claude took part in gets a Claude avatar
 *   (the mark in a dark circle) after the user's in its participant stack,
 *   at the app's size, ring and step; the hover preview becomes a card with the
 *   thread's last messages (author: You / Claude + model / the participant,
 *   time, text), the agent's status (Working / Needs you / Done / Failed)
 *   and "N replies". Details in "canvas comment pins: Claude" below.
 *
 * Identity (read-only): the rail's props through the React fiber of
 * [aria-label="User menu"] (eEe: userName, userEmail, userInitials, userColor;
 * LDa: userId), else the Settings nav footer (name + email), else
 * authBridge.getUserInfo(). users:getUser gives "Member since" (_creationTime).
 *
 * Data (read-only, Convex queries only, no mutation)
 *   - Agent runs: the queries of agent-runs-panel.js through the logged-in
 *     ConvexReactClient: agentRuns:listMyActiveRuns, listMyRecentlyFailedRuns,
 *     organizations:getUserOrganizations, agents:listMyAgents and
 *     agentRuns:listRunsForAgent (limit 100 per agent, 25 like the app if the
 *     server refuses 100). HTTP fallback with authBridge.getToken() like that
 *     mod. Status: done / running / queued / cancelled / failed / other.
 *   - Comment tasks: window.__RE_TEMPO_COMMENT_AGENT__.tasks() (+ subscribe
 *     while the page is open), else localStorage "rtd.commentAgent.tasks".
 *   - Chats: electronAPI.persist "tempo-workspaces" › workspaces[].centerTabs
 *     with type "chat" (createdAt), deduped by id.
 *   - Canvases: canvas tabs of every workspace plus
 *     window.__RE_TEMPO_CANVAS_QUICK__.load() (the selected workspace's
 *     project), deduped by path; time = edited, else opened, else created.
 *   - Plan usage: window.__RE_TEMPO_USAGE__.state.accounts and its headline().
 *   - Pin hover card: comments:getThread { threadId } (one thread, on hover).
 *   Level: completed work = agent runs done + comment tasks done + canvases.
 *   Bands: 0 Newcomer, 5 Explorer, 15 Builder, 40 Maker, 100 Architect,
 *   250 Virtuoso, 500 Luminary. The highest count seen is kept per account
 *   (localStorage "rtd.profilePage.best"), so capped lists or a failed source
 *   never lower the level; earned milestones are kept the same way
 *   ("rtd.profilePage.milestones"). A milestone earned since the last visit
 *   gets one quiet highlight, once. Heatmap: one cell per day, Sunday-first
 *   columns, as many weeks as fit (12 to 26), one hue in 5 steps; a day
 *   without work is neutral. Each source fails on its own: a tile says
 *   "Couldn't load" with Retry; the page shows the error state only when every
 *   source failed, and the empty state when every source answered with
 *   nothing. "Your month" is built only when asked and never leaves the page.
 *
 * Cost: no observer on the whole document (see "boot" below): body direct
 * children (menu portals), the Settings screen while mounted, the rail
 * avatar, the canvas comment pin layers, the comment popover and
 * comment-bubbles' hub and panels, plus a pass in the frame after a click,
 * short bursts after clicks/shortcuts and a pass every 2 s. All
 * of it pauses while the window is hidden; dispose() releases every handle.
 * Motion: the ring draws, bars grow and sections fade in; all of it is off
 * under prefers-reduced-motion (CSS).
 * Flag: localStorage "rtd.profilePage" = "off" turns Profile off (no section,
 * no menu item, no photo); the Settings API stays. Read at load.
 * Introspection: window.__RE_TEMPO_PROFILE__ { state() (state().pins: pins,
 * pins with Claude, open previews, cached threads), open(), close(),
 * refresh(), data(), identity(), avatar: { get(size?), set(dataUrl), clear(),
 * edit(file?) }, dispose() }. Loading the script twice disposes the first copy.
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  const FLAG_KEY = "rtd.profilePage";
  const previousSettings = window.__RE_TEMPO_SETTINGS__;
  let carried = [];
  try {
    if (previousSettings && typeof previousSettings._defs === "function") carried = previousSettings._defs() || [];
  } catch (_) {
    carried = [];
  }
  const previous = window.__RE_TEMPO_PROFILE__;
  if (previous && typeof previous.dispose === "function") {
    try {
      previous.dispose();
    } catch (_) {
      /* the old copy is already gone */
    }
  }
  let flagOff = false;
  try {
    flagOff = localStorage.getItem(FLAG_KEY) === "off";
  } catch (_) {
    /* storage blocked: stays on */
  }
  const PROFILE_ON = !flagOff;
  const SELF_SRC = (document.currentScript && document.currentScript.src) || "";

  // ------------------------------------------------------------- constants
  const CONVEX_URL = "https://greedy-jackal-526.convex.cloud"; // public deployment URL (agent-runs-panel.js)
  const CONVEX_FN = Symbol.for("functionName");
  const Q = {
    myActive: "agentRuns:listMyActiveRuns",
    myFailed: "agentRuns:listMyRecentlyFailedRuns",
    orgs: "organizations:getUserOrganizations",
    agents: "agents:listMyAgents",
    runsForAgent: "agentRuns:listRunsForAgent",
    me: "users:getUser",
  };
  const RUNS_PER_AGENT = 100;
  const RUNS_PER_AGENT_APP = 25; // what the app itself asks for, if 100 is refused
  const MAX_ORGS = 5;
  const SOURCE_TIMEOUT_MS = 10000;
  const RUNS_TIMEOUT_MS = 20000;
  const CACHE_MS = 60 * 1000;
  const TICK_MS = 100;
  // The app's avatar palette (bundle Ner) and hash (jer).
  const PALETTE = ["#9B3BF6", "#34BFFD", "#33CD88", "#FF898C", "#FFD55F", "#f97316", "#6366f1", "#ec4899", "#06b6d4", "#8b5cf6"];
  const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
  const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
  const PHOTO_MIN_PX = 64;
  const PHOTO_UI = 256;
  const PHOTO_EXPORT = 512;
  const DB_NAME = "rtd-profile-page";
  const DB_STORE = "avatars";
  const CHANNEL = "rtd-profile-page";
  const LS_BEST = "rtd.profilePage.best";
  const LS_SEEN = "rtd.profilePage.milestones";
  const WEEKS_MIN = 12;
  const WEEKS_MAX = 26;
  const CELL = 16;
  const CELL_GAP = 4;
  const STAGE = 320; // crop stage, CSS px
  const CIRCLE = 272; // crop circle diameter, CSS px
  const ZOOM_MAX = 5;
  const RING_R = 62;
  const RING_C = 2 * Math.PI * RING_R;
  const LEVELS = [
    { n: 1, name: "Newcomer", min: 0 },
    { n: 2, name: "Explorer", min: 5 },
    { n: 3, name: "Builder", min: 15 },
    { n: 4, name: "Maker", min: 40 },
    { n: 5, name: "Architect", min: 100 },
    { n: 6, name: "Virtuoso", min: 250 },
    { n: 7, name: "Luminary", min: 500 },
  ];
  // Status order keeps green and red apart (deutan); every swatch has a label.
  const RUN_STATUS = [
    { id: "done", label: "Done" },
    { id: "running", label: "Running" },
    { id: "queued", label: "Queued" },
    { id: "cancelled", label: "Cancelled" },
    { id: "failed", label: "Failed" },
    { id: "other", label: "Other" },
  ];
  // Work types in a fixed order; colors validated for CVD in both themes (CSS).
  const KINDS = [
    { id: "chat", label: "Chats", one: "chat", many: "chats", src: "Chat tabs in your workspaces" },
    { id: "run", label: "Agent runs", one: "agent run", many: "agent runs", src: "Your agent runs in Tempo (any status)" },
    { id: "task", label: "Comment tasks", one: "comment task", many: "comment tasks", src: "Canvas comments handed to an agent" },
    { id: "canvas", label: "Canvases", one: "canvas", many: "canvases", src: "Canvases you opened or edited" },
  ];
  const BADGES = [
    { id: "first-chat", icon: "chat", title: "First conversation", desc: "Start a chat", target: 1, from: (t) => t.chat, src: "Counts chat tabs in your workspaces." },
    { id: "first-run", icon: "bot", title: "First agent run", desc: "Run an agent", target: 1, from: (t) => t.run, src: "Counts your agent runs, any status." },
    { id: "runs-10", icon: "layers", title: "Ten runs", desc: "Run agents 10 times", target: 10, from: (t) => t.run, src: "Counts your agent runs, any status." },
    { id: "runs-50", icon: "flag", title: "Fifty finished", desc: "Finish 50 agent runs", target: 50, from: (t) => t.runDone, src: "Counts agent runs with status done." },
    { id: "agents-3", icon: "network", title: "Ensemble", desc: "Run 3 different agents", target: 3, from: (t) => t.agentFirst, src: "Counts distinct agents you ran." },
    { id: "first-task", icon: "pin", title: "First comment task", desc: "Hand a canvas comment to an agent", target: 1, from: (t) => t.task, src: "Counts canvas comments handed to an agent." },
    { id: "tasks-10", icon: "check", title: "Closer", desc: "Finish 10 comment tasks", target: 10, from: (t) => t.taskDone, src: "Counts comment tasks with status done." },
    { id: "canvases-5", icon: "canvas", title: "Five canvases", desc: "Work on 5 canvases", target: 5, from: (t) => t.canvas, src: "Counts distinct canvases you opened or edited." },
  ];
  const NAV_CLS =
    "flex w-full items-center rounded-[6px] px-2 py-1.5 text-left text-[13px] font-medium leading-4 text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-container-high)]";
  const NAV_ON_CLS = "bg-[var(--color-surface-container-high)]";
  const NAV_HEAD_CLS = "flex h-6 items-center px-2 text-[12px] font-medium text-[var(--color-text-tertiary)]";

  // --------------------------------------------------------------- helpers
  const now = () => Date.now();
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const errText = (e) => String((e && e.message) || e || "Unknown error");
  const NF = new Intl.NumberFormat("en-US");
  const NFC = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
  const fmtInt = (n) => (n >= 10000 ? NFC.format(n) : NF.format(n));
  const plural = (n, one, many) => `${fmtInt(n)} ${n === 1 ? one : many || one + "s"}`;
  const pct = (n) => `${Math.round(n)}%`;
  const DF_DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
  const DF_SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const DF_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  const DF_MONTH = new Intl.DateTimeFormat("en-US", { month: "short" });
  const DF_MONTH_YEAR = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const fmtDay = (t) => DF_DAY.format(new Date(t));
  const fmtDate = (t) => (new Date(t).getFullYear() === new Date().getFullYear() ? DF_SHORT : DF_DATE).format(new Date(t));

  function toMs(v) {
    if (v == null || v === "") return 0;
    if (v instanceof Date) return v.getTime() || 0;
    const n = typeof v === "number" ? v : /^\s*\d+(\.\d+)?\s*$/.test(String(v)) ? Number(v) : NaN;
    if (isFinite(n)) return n > 0 ? (n < 1e11 ? n * 1000 : n) : 0; // seconds or ms
    const p = Date.parse(v);
    return isFinite(p) ? p : 0;
  }
  function ago(t) {
    const d = now() - t;
    if (d < 45e3) return "just now";
    const m = Math.round(d / 6e4);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  }
  function fmtLeft(ms) {
    if (!(ms > 0)) return "";
    const m = Math.round(ms / 6e4);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m`;
    return `${Math.floor(h / 24)}d ${h % 24}h`;
  }
  function startOfDay(t) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  function addDays(t, n) {
    const d = new Date(t);
    d.setDate(d.getDate() + n);
    return d.getTime();
  }
  function dayKey(t) {
    const d = new Date(t);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  const appColor = (id) => PALETTE[hashStr(String(id)) % PALETTE.length];
  function rgbOf(c) {
    if (!c) return null;
    const s = String(c).trim();
    let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
    if (m) {
      let h = m[1];
      if (h.length === 3) h = h.replace(/./g, (x) => x + x);
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    }
    m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(s);
    return m ? [+m[1], +m[2], +m[3]] : null;
  }
  function sameColor(a, b) {
    const x = rgbOf(a);
    const y = rgbOf(b);
    return !!(x && y && x[0] === y[0] && x[1] === y[1] && x[2] === y[2]);
  }
  // Ink on an avatar color: the app's rule (cbe, luminance > .179 → dark ink).
  function inkOn(hex) {
    const c = rgbOf(hex);
    if (!c) return "#fff";
    const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]) > 0.179 ? "rgba(0,0,0,0.75)" : "#fff";
  }
  function initialsOf(name, email) {
    const w = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (w.length >= 2) return (w[0][0] + w[w.length - 1][0]).toUpperCase();
    if (w.length === 1) return w[0][0].toUpperCase();
    if (email) return String(email)[0].toUpperCase();
    return "?";
  }
  function withTimeout(p, ms, what) {
    let timer = 0;
    return Promise.race([
      Promise.resolve(p).finally(() => clearTimeout(timer)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} took too long`)), ms);
      }),
    ]);
  }
  const listOf = (v) => (Array.isArray(v) ? v : v && Array.isArray(v.page) ? v.page : v && Array.isArray(v.items) ? v.items : []);
  function lsRead(key) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "null");
      return v && typeof v === "object" ? v : {};
    } catch (_) {
      return {};
    }
  }
  function lsWrite(key, v) {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch (_) {
      /* storage full or blocked: the next visit recomputes */
    }
  }

  // ----------------------------------------------------------------- icons
  const ICONS = {
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.25"/>',
    refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M20.5 3.5V8H16"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4-4a2 2 0 0 0-2.8 0L5 20"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    chat: '<path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4.5"/><circle cx="12" cy="3.5" r="1"/><path d="M9 13.5v1M15 13.5v1"/>',
    layers: '<path d="m12 3 9 4.5-9 4.5-9-4.5z"/><path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    network: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.5 8.2 10.7 15.8M16.5 8.2l-3.2 7.6M8.5 6h7"/>',
    pin: '<path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.25"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.2 2.4 2.4 4.6-5.1"/>',
    canvas: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
    gauge: '<path d="M4.2 18.5a9 9 0 1 1 15.6 0"/><path d="m12 13.5 4-4.5"/><circle cx="12" cy="13.5" r="1.25"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>',
    spark: '<path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 10.9 10.1 9z"/>',
  };
  const icon = (k, size = 16) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[k] || ""}</svg>`;

  // ------------------------------------------------------------------- css
  let cssLink = null;
  (function loadCss() {
    try {
      const have = [...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => /profile-page\.css(\?|$)/.test(l.href || ""));
      const href = window.__RTPP_CSS_URL__ || (SELF_SRC ? SELF_SRC.replace(/\.js(\?.*)?$/, ".css") : null);
      if (have || !href) return;
      cssLink = document.createElement("link");
      cssLink.rel = "stylesheet";
      cssLink.href = href;
      cssLink.setAttribute("data-rtpp-css", "");
      document.head.appendChild(cssLink);
    } catch (_) {
      /* without CSS the structure still renders */
    }
  })();

  // ====================================================== Settings sections
  const registry = new Map(); // id → { id, label, icon, order, render, group, seq, def }
  let regSeq = 0;
  let activeId = null; // the open RE-TEMPO section, null = native content
  let openUntil = 0; // keeps activeId while Settings is being opened
  let mounted = null; // { id, host, container, cleanup }
  const sortedSections = () => [...registry.values()].sort((a, b) => a.order - b.order || a.seq - b.seq);

  // group "personal" is only for this mod's Profile; every registered section goes to "rtempo"
  function registerSection(def) {
    return addSection(def, "rtempo");
  }
  function addSection(def, group) {
    if (!def || typeof def !== "object") throw new TypeError("registerSection: pass { id, label, render(container) }");
    const id = typeof def.id === "string" ? def.id.trim() : "";
    if (!id) throw new TypeError("registerSection: id must be a non-empty string");
    if (typeof def.render !== "function") throw new TypeError("registerSection: render(container) must be a function");
    const prev = registry.get(id);
    registry.set(id, {
      id,
      label: typeof def.label === "string" && def.label.trim() ? def.label.trim() : id,
      icon: def.icon == null ? null : def.icon,
      order: typeof def.order === "number" && isFinite(def.order) ? def.order : 100,
      render: def.render,
      group,
      seq: prev ? prev.seq : ++regSeq,
      def,
    });
    if (mounted && mounted.id === id) unmountSection(); // remounts with the new render on the next sync
    schedule();
    return true;
  }
  function unregisterSection(id) {
    const had = registry.delete(id);
    if (activeId === id) activeId = null;
    if (mounted && mounted.id === id) unmountSection();
    schedule();
    return had;
  }
  function sections() {
    return sortedSections().map((s) => ({ id: s.id, label: s.label, order: s.order, group: s.group === "personal" ? "Personal" : "RE-TEMPO", active: activeId === s.id }));
  }
  const settingsApi = { registerSection, unregisterSection, sections };
  Object.defineProperty(settingsApi, "_defs", { value: () => sortedSections().filter((s) => s.group === "rtempo").map((s) => s.def), enumerable: false });
  window.__RE_TEMPO_SETTINGS__ = settingsApi;

  function settingsParts() {
    for (const side of document.querySelectorAll("div.w-60")) {
      const head = [...side.querySelectorAll("span")].find((s) => !s.children.length && s.textContent.trim() === "Personal");
      if (!head) continue;
      const shell = side.parentElement;
      if (!shell) continue;
      const others = [...shell.children].filter((c) => c !== side);
      const scroller = others.find((c) => c.classList.contains("overflow-y-auto")) || others[0];
      if (!scroller) continue;
      return { side, group: head.parentElement, head, scroller };
    }
    return null;
  }
  function navButton(s) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `${NAV_CLS} rtset-nav`;
    b.dataset.rtsetId = s.id;
    b.dataset.testid = `settings-nav-${s.id}`;
    if (typeof s.icon === "string" && s.icon.trim()) {
      const i = document.createElement("span");
      i.className = "rtset-nav-icon";
      i.innerHTML = s.icon;
      b.append(i);
    } else if (s.icon instanceof Element) {
      const i = document.createElement("span");
      i.className = "rtset-nav-icon";
      i.append(s.icon.cloneNode(true));
      b.append(i);
    }
    const l = document.createElement("span");
    l.className = "min-w-0 flex-1 truncate";
    l.textContent = s.label;
    b.append(l);
    return b;
  }
  const navSig = (list) => list.map((s) => `${s.id}\u0000${s.label}\u0000${typeof s.icon === "string" ? s.icon : s.icon ? "el" : ""}`).join("\u0001");
  // Returns every nav button of ours, in both groups.
  function syncNav(p) {
    const all = sortedSections();
    // Personal: our items right after the group header, before the native ones
    const personal = all.filter((s) => s.group === "personal");
    const mine = [...p.group.querySelectorAll(":scope > .rtset-nav")];
    const placed = mine.length === personal.length && mine.every((b, i) => b.dataset.rtsetSig === navSig([personal[i]]) && (i ? mine[i - 1] : p.head) === b.previousElementSibling);
    if (!placed) {
      mine.forEach((b) => b.remove());
      let at = p.head;
      for (const s of personal) {
        const b = navButton(s);
        b.dataset.rtsetSig = navSig([s]);
        at.after(b);
        at = b;
      }
    }
    // RE-TEMPO: a group of its own right after Personal
    const rt = all.filter((s) => s.group === "rtempo");
    let group = p.side.querySelector("[data-rtset-group]");
    if (!rt.length) {
      if (group) group.remove();
    } else {
      if (!group || group.previousElementSibling !== p.group) {
        if (group) group.remove();
        group = document.createElement("div");
        group.className = "flex flex-col";
        group.setAttribute("data-rtset-group", "");
        group.innerHTML = `<span class="${NAV_HEAD_CLS}">RE-TEMPO</span>`;
        p.group.after(group);
      }
      const sig = navSig(rt);
      if (group.dataset.sig !== sig) {
        group.querySelectorAll(":scope > button").forEach((b) => b.remove());
        for (const s of rt) group.append(navButton(s));
        group.dataset.sig = sig;
      }
    }
    return [...p.side.querySelectorAll("button.rtset-nav")];
  }
  function onSideClick(e) {
    if (disposed) return;
    const b = e.target.closest("button");
    if (!b) return;
    const id = b.classList.contains("rtset-nav") ? b.dataset.rtsetId : null;
    if (id) {
      activeId = id;
      syncSettings();
    } else if (activeId) {
      activeId = null;
      syncSettings();
    }
  }
  function renderError(container, label, e) {
    container.innerHTML = `<h2 class="mb-6 text-[17px] font-medium text-[var(--color-text-primary)]"></h2><div class="rounded-lg border border-[var(--color-border-secondary)] p-4 text-xs text-[var(--color-text-secondary)]"></div>`;
    container.firstChild.textContent = label;
    container.lastChild.textContent = `This section failed to open: ${errText(e)}`;
    console.warn("[RE-TEMPO settings] render failed:", label, e);
  }
  function mountSection(scroller, s) {
    let host = scroller.querySelector(":scope > [data-rtset-host]");
    if (!host) {
      host = document.createElement("div");
      host.className = "p-8";
      host.setAttribute("data-rtset-host", "");
      scroller.appendChild(host);
    }
    host.replaceChildren();
    const container = document.createElement("div");
    container.setAttribute("data-rtset-section", s.id);
    container.dataset.testid = `settings-section-${s.id}`;
    host.appendChild(container);
    const m = { id: s.id, host, container, cleanup: null };
    mounted = m;
    try {
      const r = s.render(container);
      if (typeof r === "function") m.cleanup = r;
      else if (r && typeof r.then === "function") {
        r.then(
          (fn) => {
            if (typeof fn !== "function") return;
            if (mounted === m) m.cleanup = fn;
            else
              try {
                fn();
              } catch (_) {
                /* closed already */
              }
          },
          (e) => {
            if (mounted === m) renderError(container, s.label, e);
          }
        );
      }
    } catch (e) {
      renderError(container, s.label, e);
    }
    scroller.scrollTop = 0;
  }
  function unmountSection() {
    if (!mounted) return;
    const m = mounted;
    mounted = null;
    try {
      if (typeof m.cleanup === "function") m.cleanup();
    } catch (e) {
      console.warn("[RE-TEMPO settings] cleanup failed:", m.id, e);
    }
    m.host.remove();
  }
  function syncSettings() {
    const p = settingsParts();
    if (!p) {
      if (activeId && now() > openUntil) activeId = null;
      unmountSection();
      return;
    }
    const navs = syncNav(p);
    if (!p.side.__rtsetHooked) {
      p.side.__rtsetHooked = true;
      p.side.addEventListener("click", onSideClick, true);
    }
    const s = activeId ? registry.get(activeId) : null;
    if (activeId && !s) activeId = null;
    for (const b of navs) {
      const on = b.dataset.rtsetId === activeId;
      b.classList.toggle(NAV_ON_CLS, on);
      if (on) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    }
    for (const b of p.side.querySelectorAll("button.rounded-\\[6px\\]:not(.rtset-nav)")) b.toggleAttribute("data-rtset-off", !!activeId);
    for (const c of p.scroller.children) if (!c.hasAttribute("data-rtset-host")) c.toggleAttribute("data-rtset-hidden", !!activeId);
    if (!activeId) {
      unmountSection();
      return;
    }
    if (!mounted || mounted.id !== activeId || !mounted.host.isConnected || mounted.host.parentElement !== p.scroller) {
      unmountSection();
      mountSection(p.scroller, s);
    }
  }
  function openSection(id) {
    if (!registry.has(id)) return false;
    activeId = id;
    openUntil = now() + 4000;
    if (settingsParts()) {
      syncSettings();
      return true;
    }
    const rm = window.__RE_TEMPO_RAIL_MENU__;
    let asked = false;
    if (rm && typeof rm.run === "function") {
      try {
        rm.run("settings");
        asked = true;
      } catch (_) {
        asked = false;
      }
    }
    if (!asked) {
      const gear = [...document.querySelectorAll('button[aria-label="Settings"]')].find((b) => !b.closest("[data-rtset-host]"));
      if (gear) gear.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true }));
      else {
        const mac = /Mac/i.test(navigator.platform || "");
        document.dispatchEvent(new KeyboardEvent("keydown", { key: ",", code: "Comma", metaKey: mac, ctrlKey: !mac, bubbles: true }));
      }
    }
    burst(); // the Settings screen mounts a few frames later
    return true;
  }
  function closeSection() {
    activeId = null;
    openUntil = 0;
    syncSettings();
  }

  // ================================================================ Profile
  // ---------------------------------------------------------------- convex
  // The logged-in ConvexReactClient from the React tree (agent-runs-panel.js).
  let convexClient = null;
  function findConvexClient() {
    if (convexClient) return convexClient;
    const root = document.getElementById("root") || document.body;
    if (!root) return null;
    const key = Object.keys(root).find((k) => k.startsWith("__reactContainer$") || k.startsWith("__reactFiber$"));
    let fiber = key ? root[key] : null;
    if (!fiber && root._reactRootContainer) fiber = root._reactRootContainer._internalRoot && root._reactRootContainer._internalRoot.current;
    if (!fiber) return null;
    const isClient = (o) => o && typeof o === "object" && typeof o.query === "function" && typeof o.watchQuery === "function";
    const seen = new Set();
    const stack = [fiber];
    const deadline = now() + 1500;
    while (stack.length && now() < deadline) {
      const f = stack.pop();
      if (!f || seen.has(f)) continue;
      seen.add(f);
      for (const bag of [f.memoizedProps, f.memoizedState, f.stateNode]) {
        if (!bag || typeof bag !== "object") continue;
        if (isClient(bag)) return (convexClient = bag);
        for (const v of Object.values(bag)) if (isClient(v)) return (convexClient = v);
      }
      let dep = f.dependencies && f.dependencies.firstContext;
      while (dep) {
        const v = dep.memoizedValue;
        if (isClient(v)) return (convexClient = v);
        if (v && typeof v === "object") for (const inner of Object.values(v)) if (isClient(inner)) return (convexClient = inner);
        dep = dep.next;
      }
      if (f.child) stack.push(f.child);
      if (f.sibling) stack.push(f.sibling);
    }
    return null;
  }
  let convexVia = null;
  async function query(name, args) {
    const client = findConvexClient();
    if (client) {
      convexVia = "live-convex-client";
      return client.query({ [CONVEX_FN]: name }, args || {});
    }
    const b = window.authBridge;
    let token = null;
    if (b && typeof b.getToken === "function") {
      try {
        const t = await b.getToken();
        token = typeof t === "string" ? t : (t && (t.token || t.value)) || null;
      } catch (_) {
        token = null;
      }
    }
    if (!token) throw new Error("No signed-in session found.");
    convexVia = "http+session-token";
    const res = await fetch(CONVEX_URL + "/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ path: name, args: args || {}, format: "json" }),
    });
    const data = await res.json();
    if (data && data.status === "success") return data.value;
    throw new Error((data && data.errorMessage) || `Convex error in ${name}`);
  }

  // -------------------------------------------------------------- identity
  const ident = { name: null, email: null, initials: "?", color: PALETTE[0], userId: null, memberSince: null };
  let bridgeInfo = null;
  let bridgeAsked = false;
  let convexUser = null;
  function fiberOf(node) {
    if (!node) return null;
    const k = Object.keys(node).find((x) => x.startsWith("__reactFiber$"));
    return k ? node[k] : null;
  }
  function railButton() {
    return (
      document.querySelector('[data-testid="workspace-navbar"] [aria-label="User menu"]') ||
      [...document.querySelectorAll('[aria-label="User menu"]')].find((b) => !b.closest("[data-rtps-root], .rtps-titlebar-tools, [data-rtset-host]")) ||
      null
    );
  }
  function fromRail() {
    let f = fiberOf(railButton());
    let out = null;
    for (let i = 0; f && i < 80; i++, f = f.return) {
      const p = f.memoizedProps;
      if (!p || typeof p !== "object") continue;
      if (!out && "userInitials" in p && ("userName" in p || "userEmail" in p || "userColor" in p)) {
        out = { name: p.userName, email: p.userEmail, initials: p.userInitials, color: p.userColor };
      }
      if (out && typeof p.userId === "string" && p.userId) {
        out.userId = p.userId;
        break;
      }
    }
    return out;
  }
  function fromSettingsFooter() {
    const p = settingsParts();
    if (!p) return null;
    const foot = [...p.side.children].find((c) => c.classList.contains("border-t"));
    const box = foot && foot.querySelector(".mb-3");
    if (!box) return null;
    const name = box.children[0] ? box.children[0].textContent.trim() : "";
    const email = box.children[1] ? box.children[1].textContent.trim() : "";
    return { name: name && name !== "User" ? name : null, email: email || null };
  }
  function askBridge() {
    if (bridgeAsked) return;
    bridgeAsked = true;
    const b = window.authBridge;
    if (!b || typeof b.getUserInfo !== "function") return;
    Promise.resolve()
      .then(() => b.getUserInfo())
      .then((u) => {
        if (!u || typeof u !== "object") return;
        bridgeInfo = { name: [u.firstName, u.lastName].filter(Boolean).join(" ") || null, email: u.email || null, userId: u.userId || null };
        syncIdentity();
      })
      .catch(() => {});
  }
  function syncIdentity() {
    const parts = [fromRail(), fromSettingsFooter(), bridgeInfo, convexUser].filter(Boolean);
    const pick = (k) => {
      for (const p of parts) {
        const v = p[k];
        if (typeof v === "string" && v.trim()) return v.trim();
      }
      return null;
    };
    const next = { name: pick("name"), email: pick("email"), initials: pick("initials"), color: pick("color"), userId: pick("userId") };
    next.initials = next.initials || initialsOf(next.name, next.email);
    next.color = next.color || appColor(next.userId || next.name || next.email || "?");
    next.memberSince = (convexUser && convexUser.memberSince) || null;
    const changed = Object.keys(next).some((k) => ident[k] !== next[k]);
    if (!changed) return false;
    const oldKey = photoKey();
    Object.assign(ident, next);
    if (photoKey() !== oldKey) loadPhoto();
    if (page) renderHead();
    return true;
  }
  const userKey = () => (ident.email ? `email:${ident.email.toLowerCase()}` : ident.userId ? `id:${ident.userId}` : "local");

  // ----------------------------------------------------------- photo store
  let dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      let req;
      try {
        req = indexedDB.open(DB_NAME, 1);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
      };
      req.onsuccess = () => {
        const d = req.result;
        d.onversionchange = () => d.close();
        resolve(d);
      };
      req.onerror = () => reject(req.error || new Error("IndexedDB is unavailable."));
      req.onblocked = () => reject(new Error("IndexedDB is blocked."));
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
    return dbPromise;
  }
  async function idb(mode, fn) {
    const d = await openDb();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(DB_STORE, mode);
      const req = fn(tx.objectStore(DB_STORE));
      let out;
      if (req) req.onsuccess = () => (out = req.result);
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted."));
    });
  }
  const idbGet = (k) => idb("readonly", (s) => s.get(k));
  const idbPut = (k, v) => idb("readwrite", (s) => s.put(v, k));
  const idbDel = (k) => idb("readwrite", (s) => s.delete(k));

  let photo = null; // { key, dataUrl, dataUrl512, updatedAt }
  let photoSeq = 0;
  let photoError = null;
  const photoKey = userKey;
  const isImageUrl = (u) => typeof u === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(u);
  async function loadPhoto() {
    if (!PROFILE_ON) return;
    const key = photoKey();
    const seq = ++photoSeq;
    let rec = null;
    try {
      rec = await idbGet(key);
      photoError = null;
    } catch (e) {
      photoError = errText(e);
    }
    if (seq !== photoSeq || disposed) return;
    photo = rec && isImageUrl(rec.dataUrl) ? { key, dataUrl: rec.dataUrl, dataUrl512: isImageUrl(rec.dataUrl512) ? rec.dataUrl512 : null, updatedAt: rec.updatedAt || 0 } : null;
    photoChanged();
  }
  async function savePhoto(dataUrl, dataUrl512) {
    if (!isImageUrl(dataUrl)) throw new Error("Not an image data URL.");
    const key = photoKey();
    const rec = { dataUrl, dataUrl512: isImageUrl(dataUrl512) ? dataUrl512 : null, updatedAt: now() };
    await idbPut(key, rec);
    photoSeq++;
    photo = { key, ...rec };
    broadcast();
    photoChanged();
    return true;
  }
  async function clearPhoto() {
    const prev = photo;
    await idbDel(photoKey());
    photoSeq++;
    photo = null;
    broadcast();
    photoChanged();
    return prev;
  }
  let channel = null;
  if (PROFILE_ON) {
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (e) => {
        if (e.data && e.data.type === "photo" && e.data.key === photoKey()) loadPhoto();
      };
    } catch (_) {
      channel = null;
    }
  }
  function broadcast() {
    try {
      if (channel) channel.postMessage({ type: "photo", key: photoKey() });
    } catch (_) {
      /* other windows reload it on their next start */
    }
  }
  function photoChanged() {
    brokenSrc = null; // a new photo (or none) gets a fresh chance
    applyPhotos();
    if (page) renderHead();
  }

  // ------------------------------------------- the photo on the app's avatars
  const DECOR = "data-rtpp-photo";
  const SKIP = "[data-rtset-host], [data-rtpp-dialog]";
  const AV_SEL = "div[aria-label] > span.block.leading-none"; // the app's avatar component (__)
  const RTCB_SEL = ".rtcb-av"; // comment-bubbles' avatars
  // Roots whose subtree is watched so an avatar React or comment-bubbles (re)creates
  // gets the photo in the same microtask, before it is painted with the initials:
  // the comment popover (a portal on <body>), comment-bubbles' hub, panels and
  // popovers (their body is rebuilt on every task update).
  const UI_SCOPE = '[data-testid="canvas-comment-popover"], [data-testid="rcc-agent-hub"], [data-rtcb-root], .rtcb-pop, .rtcb-panel';
  let brokenSrc = null; // the photo failed to load: initials everywhere until it changes
  function nameNearby(el, first) {
    let n = el.parentElement;
    for (let i = 0; n && i < 5; i++, n = n.parentElement) {
      const t = n.textContent || "";
      if (t.length > 600) break;
      if (t.toLowerCase().includes(first)) return true;
    }
    return false;
  }
  // Canvas comment pins (bundle: pin layer → div[data-testid="canvas-comment-pin-<id>"] → nBe({ users })
  // → one keyed <div key={i}> per participant → nS → __). No name sits next to these
  // avatars, so the participant itself is read from React: human (no agent), same first
  // name (or id) as the signed-in user, on top of the initials + color match.
  const PIN_SCOPE = '[data-testid="canvas-comment-pin-layer"], [data-testid^="canvas-comment-pin-preview-"]';
  const firstWord = (v) => String(v || "").trim().split(/\s+/)[0].toLowerCase();
  function participantOf(av) {
    let f = fiberOf(av);
    let idx = -1;
    for (let i = 0; f && i < 16; i++, f = f.return) {
      const p = f.memoizedProps;
      if (p && Array.isArray(p.users)) {
        const u = p.users[idx < 0 ? 0 : idx];
        return u && typeof u === "object" ? u : null;
      }
      if (idx < 0 && f.key != null && typeof f.type === "string") {
        const n = Number(f.key);
        if (Number.isInteger(n) && n >= 0) idx = n;
      }
    }
    return null;
  }
  function isSelfParticipant(av) {
    const u = participantOf(av);
    if (!u || u.agent) return false;
    if (ident.userId && u.id === ident.userId) return true;
    const me = firstWord(ident.name);
    return !!me && firstWord(u.name) === me;
  }
  // The comment popover and the comments activity list, read from React like the pins
  // (bundle, 2026-10-19): a comment row's avatar sits under Yze / the activity row rBe
  // ({ authorName, authorInitials, authorColor, authorAgent }); the reply field's avatar
  // ("Reply to thread…") sits under the popover body S0i ({ thread, resolveAuthor,
  // onReply, … }) with no comment in between: it is always the signed-in user. The old
  // "first name within 600 characters" test missed that avatar in long threads.
  function commentRoleOf(av) {
    let f = fiberOf(av);
    for (let i = 0; f && i < 14; i++, f = f.return) {
      const p = f.memoizedProps;
      if (!p || typeof p !== "object") continue;
      if (typeof p.authorName === "string") {
        return { kind: "author", name: p.authorName, id: typeof p.authorId === "string" ? p.authorId : null, agent: !!p.authorAgent };
      }
      if (typeof p.resolveAuthor === "function" && "thread" in p) return { kind: "composer" };
    }
    return null;
  }
  const identReady = () => !!(ident.initials && ident.initials !== "?" && ident.color);
  // An app avatar (div[aria-label] around span.block.leading-none) that stands for the
  // signed-in user: initials AND color match, then who React rendered it for.
  function isSelfAppAvatar(d) {
    if (!d || d.closest(SKIP)) return false;
    if (d.getAttribute("aria-label") !== ident.initials) return false;
    if (!sameColor(d.style.backgroundColor, ident.color)) return false;
    if (d.closest(PIN_SCOPE)) return isSelfParticipant(d);
    const role = commentRoleOf(d);
    // the reply field's own avatar: the row that holds the composer (not a mention list)
    if (role && role.kind === "composer") return !!(d.parentElement && d.parentElement.querySelector('[data-testid="canvas-comment-composer"]'));
    const me = firstWord(ident.name);
    if (role) {
      if (role.agent) return false;
      if (role.id && ident.userId) return role.id === ident.userId;
      return !!me && firstWord(role.name) === me;
    }
    return !!me && nameNearby(d, me);
  }
  // comment-bubbles' .rtcb-av: its requests are this window's user's own comments.
  function isSelfRtcbAvatar(a) {
    if (a.textContent.trim() !== ident.initials) return false;
    return sameColor(a.style.getPropertyValue("--rtcb-av").trim(), ident.color);
  }
  const photoUsable = () => !!(PROFILE_ON && !disposed && photo && photo.dataUrl && photo.dataUrl !== brokenSrc);
  // Fast path, run in the mutation observers' callback: the user's avatars inside
  // freshly inserted nodes get the photo before the next paint (no flash of initials).
  function decorateWithin(node) {
    pinsWithin(node);
    if (!photoUsable() || !identReady() || !node.isConnected) return;
    const visit = (el) => {
      if (el.matches(AV_SEL)) {
        if (isSelfAppAvatar(el.parentElement)) decorate(el.parentElement, photo.dataUrl);
      } else if (el.matches(RTCB_SEL) && isSelfRtcbAvatar(el)) decorate(el, photo.dataUrl);
    };
    visit(node);
    if (node.firstElementChild) for (const el of node.querySelectorAll(`${AV_SEL}, ${RTCB_SEL}`)) visit(el);
  }
  function photoTargets() {
    const out = new Set();
    for (const b of document.querySelectorAll('[aria-label="User menu"]')) {
      if (b.closest(SKIP)) continue;
      if (b.classList.contains("rtps-foot-avatar")) {
        // project-sidebar mirrors the rail's <img>; only cover its initials
        if (!b.querySelector("img:not(.rtpp-photo)")) out.add(b);
        continue;
      }
      const av = b.querySelector("div[aria-label] > span.block.leading-none");
      out.add(av ? av.parentElement : b);
    }
    if (!identReady()) return out;
    for (const s of document.querySelectorAll(AV_SEL)) {
      const d = s.parentElement;
      if (!out.has(d) && isSelfAppAvatar(d)) out.add(d);
    }
    for (const a of document.querySelectorAll(RTCB_SEL)) if (isSelfRtcbAvatar(a)) out.add(a);
    return out;
  }
  // The photo failed to load (or decode): every avatar goes back to the app's
  // initials, which stay underneath, until the photo changes.
  function onPhotoError(e) {
    const src = e.currentTarget.getAttribute("src");
    if (!photo || src !== photo.dataUrl) return; // an old src being replaced
    brokenSrc = src;
    photoError = "The photo could not be shown; your initials are used instead.";
    applyPhotos();
  }
  function decorate(el, src) {
    let img = el.querySelector(":scope > img.rtpp-photo");
    if (!img) {
      img = document.createElement("img");
      img.className = "rtpp-photo";
      img.alt = "";
      img.draggable = false;
      img.decoding = "sync"; // same cached image every time: no blank frame on re-render
      img.addEventListener("error", onPhotoError);
      el.appendChild(img);
    }
    if (img.getAttribute("src") !== src) img.setAttribute("src", src);
    if (!el.hasAttribute(DECOR)) {
      // keep a positioned element where it is; only static ones become relative
      let pos = "static";
      try {
        pos = getComputedStyle(el).position;
      } catch (_) {
        /* detached */
      }
      el.setAttribute(DECOR, pos === "static" ? "rel" : "");
    }
  }
  function undecorate(el) {
    el.querySelectorAll(":scope > img.rtpp-photo").forEach((i) => i.remove());
    el.removeAttribute(DECOR);
  }
  let decorated = 0;
  function applyPhotos() {
    const want = photoUsable() ? photoTargets() : new Set();
    for (const el of document.querySelectorAll(`[${DECOR}]`)) if (!want.has(el)) undecorate(el);
    for (const el of want) decorate(el, photo.dataUrl);
    decorated = want.size;
  }

  // --------------------------------------------- canvas comment pins: Claude
  // The pipeline (canvas-comment-agent.js) posts Claude's reply with the app's
  // addComment, so the app draws it as the signed-in user's: the pin's
  // participants (bundle k0i: thread creator + latest author, deduped by id)
  // show only the user, and its hover preview says the user's name over a
  // body that ends with the marker line
  // "· task <id> · <model> · <effort>" (comment-bubbles.js AG_MARK). Here:
  //   - Pin stack: when Claude took part (the latest body has the marker, a
  //     comment-agent task has this thread id, or a fetched comment has the
  //     marker), a Claude avatar (the mark in a dark circle, the app's 26 px
  //     size and 2 px ring on --avatar-ring) is appended to the participant
  //     stack. The pin grows by the app's own step (nBe: width 34 + 20 per
  //     extra avatar, text inset 48 + 20 per extra avatar) through CSS
  //     variables on the pin's root, so shape, ring, status color and height
  //     stay the app's.
  //     The pin in the layer never shows text (the layer passes nBe only
  //     { users, status, selected }); if it ever expands, the width rule lets
  //     go (:has the expanded content) and its text inset moves past Claude.
  //   - Hover preview (portal [data-testid="canvas-comment-pin-preview-<id>"]):
  //     the app's card is hidden and .rtpp-pv takes its place, anchored the
  //     same way: the thread's last messages (all of them up to three, else
  //     the first one, "N more replies" and the last two), each with its
  //     author (You / Claude + model / the participant), time and text; the
  //     agent's status (Working / Needs you / Done / Failed / Stopped, from
  //     window.__RE_TEMPO_COMMENT_AGENT__.tasks() by thread id or marker id; a
  //     marker without a task = Done) and "N replies". It shows and hides with
  //     the app's own preview state (its expanded content's aria-hidden).
  //     Messages: the read-only query comments:getThread, prefetched on
  //     pointerover of the pin and cached by reply count + latest body; until
  //     it answers, the latest message from the pin's own data.
  // CSS: profile-page.css, "Canvas comment pins: Claude".
  const PIN_LAYER = '[data-testid="canvas-comment-pin-layer"]';
  const PIN_SEL = `${PIN_LAYER} > [data-thread-id]`;
  const PV_PREFIX = "canvas-comment-pin-preview-";
  const PV_SEL = `[data-testid^="${PV_PREFIX}"]`;
  const AG_MARK = /(?:^|\s)·\s*task\s+([tch]:[\w:.-]+)(?:\s*·\s*([^·\n]+?))?(?:\s*·\s*([^·\n]+?))?\s*$/;
  const CLAUDE_PATH = "M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z";
  const claudeSvg = (size) =>
    `<svg class="rtpp-claude" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false"><path fill="#D97757" d="${CLAUDE_PATH}"/></svg>`;
  const PIN_W = 34; // nBe: collapsed width for one avatar
  const PIN_STEP = 20; // nBe: each further avatar (26 px, -6 px overlap)
  const PIN_INSET = 48; // nBe: expanded text inset for one avatar (22 + 26)
  const THREAD_TTL_MS = 60 * 1000;
  const THREAD_RETRY_MS = 10 * 1000;
  const THREAD_CACHE_MAX = 60;
  const AGENT_LABEL = { working: "Working", needs: "Needs you", done: "Done", failed: "Failed", stopped: "Stopped" };

  function parseMark(body) {
    const text = String(body || "");
    const m = AG_MARK.exec(text);
    if (!m) return null;
    const clean = (v) => String(v || "").trim() || null;
    return { taskId: m[1], model: clean(m[2]), effort: clean(m[3]), text: text.slice(0, m.index).trim() };
  }
  const plainBody = (s) => String(s || "").replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1").trim();
  // The app's time label (bundle G1i), so the card reads like its own preview.
  function appAgo(t) {
    if (!(t > 0)) return "";
    const d = now() - t;
    const m = Math.floor(d / 6e4);
    if (d < 0 || m < 1) return "just now";
    if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
    const dd = Math.floor(h / 24);
    if (dd < 7) return `${dd} day${dd === 1 ? "" : "s"} ago`;
    const date = new Date(t);
    return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }) });
  }
  // The pin layer's props (jhi { threads }: the app's pin rows) and, on the way
  // up from a preview, the preview's own props (xhi { status }).
  function pinCtx(el, id) {
    let f = fiberOf(el);
    let status = null;
    for (let i = 0; f && i < 14; i++, f = f.return) {
      const p = f.memoizedProps;
      if (!p || typeof p !== "object") continue;
      if (!status && (p.status === "read" || p.status === "unread")) status = p.status;
      if (Array.isArray(p.threads)) {
        const th = p.threads.find((t) => t && t._id === id) || null;
        return th ? { th, status: status || (th.unread ? "unread" : "read") } : null;
      }
    }
    return null;
  }

  // comment-agent's tasks, refreshed on its "rtcc:changed" event (else every second).
  let agentList = null;
  let agentAt = 0;
  function agentTasks() {
    if (agentList && now() - agentAt < 1000) return agentList;
    let list = [];
    try {
      const a = window.__RE_TEMPO_COMMENT_AGENT__;
      if (a && typeof a.tasks === "function") list = a.tasks() || [];
    } catch (_) {
      list = [];
    }
    agentList = Array.isArray(list) ? list : [];
    agentAt = now();
    return agentList;
  }
  function onAgentChanged(e) {
    const list = e && e.detail && e.detail.tasks;
    agentList = Array.isArray(list) ? list : null;
    agentAt = agentList ? now() : 0;
    schedule();
  }
  function taskFor(id, marks) {
    let best = null;
    for (const t of agentTasks()) {
      if (!t || (t.threadId !== id && !marks.has(t.id))) continue;
      if (!best || (Number(t.createdAt) || 0) > (Number(best.createdAt) || 0)) best = t;
    }
    return best;
  }
  function agentOf(task, lastMark) {
    if (task) {
      const s = String(task.status || "");
      const key = s === "queued" || s === "running" ? "working" : s === "needs-input" ? "needs" : s === "done" ? "done" : s === "failed" ? (task.stoppedAt ? "stopped" : "failed") : null;
      if (key) return { key, label: AGENT_LABEL[key] };
    }
    return lastMark ? { key: "done", label: AGENT_LABEL.done } : null;
  }

  // Thread messages: comments:getThread (read-only), one request per thread at a time.
  const threadCache = new Map(); // threadId → { sig, at, busy, comments, error }
  let threadQueries = 0;
  const threadSig = (th) => `${th.replyCount || 0}\u0000${th.body || ""}`;
  function fetchThread(id, sig) {
    let c = threadCache.get(id);
    if (c && (c.busy || (c.sig === sig && now() - c.at < (c.comments ? THREAD_TTL_MS : THREAD_RETRY_MS)))) return c;
    if (!c) {
      if (threadCache.size >= THREAD_CACHE_MAX) threadCache.delete(threadCache.keys().next().value);
      c = { sig: null, at: 0, busy: false, comments: null, error: null };
      threadCache.set(id, c);
    }
    c.busy = true;
    threadQueries++;
    Promise.resolve()
      .then(() => query("comments:getThread", { threadId: id }))
      .then((r) => {
        const list = r && Array.isArray(r.comments) ? r.comments : null;
        c.comments = list
          ? list
              .filter((x) => x && typeof x === "object")
              .map((x) => ({ authorId: x.authorId || null, agent: x.authorAgent || null, body: x.body, at: toMs(x.createdAt) || toMs(x._creationTime), deleted: !!x.deleted }))
              .sort((a, b) => a.at - b.at)
          : c.comments;
        c.error = list ? null : "No thread";
      })
      .catch((e) => {
        c.error = errText(e);
      })
      .finally(() => {
        c.sig = sig;
        c.busy = false;
        c.at = now();
        if (!disposed) refreshThread(id);
      });
    return c;
  }
  function claudeIn(id, th) {
    const latest = parseMark(th.body);
    const marks = new Set();
    let last = latest;
    if (latest) marks.add(latest.taskId);
    const c = threadCache.get(id);
    if (c && c.comments) {
      for (const m of c.comments) {
        const k = parseMark(m.body);
        if (!k) continue;
        marks.add(k.taskId);
        last = last || k;
      }
    }
    const task = taskFor(id, marks);
    return { latest, last, task, any: marks.size > 0 || !!task };
  }

  // ---- the pin in the layer
  const childWith = (el, cls) => (el ? [...el.children].find((c) => c.classList.contains(cls)) || null : null);
  function pinStack(root, on) {
    const stack = childWith(root, "z-20");
    let mine = stack ? stack.querySelector(":scope > .rtpp-pin-cl") : null;
    if (!on || !stack) {
      if (mine) mine.remove();
      if (root.hasAttribute("data-rtpp-pinx")) {
        root.removeAttribute("data-rtpp-pinx");
        root.style.removeProperty("--rtpp-pin-w");
        root.style.removeProperty("--rtpp-pin-pl");
      }
      return;
    }
    const n = stack.children.length - (mine ? 1 : 0); // the app's avatars
    if (!mine) {
      mine = document.createElement("div");
      mine.className = "rtpp-pin-cl";
      mine.innerHTML = `<span class="rtpp-cl-av" role="img" aria-label="Claude">${claudeSvg(15)}</span>`; // constant markup
    }
    if (stack.lastElementChild !== mine) stack.appendChild(mine);
    const w = `${PIN_W + n * PIN_STEP}px`;
    const pl = `${PIN_INSET + n * PIN_STEP}px`;
    if (!root.hasAttribute("data-rtpp-pinx")) root.setAttribute("data-rtpp-pinx", "");
    if (root.style.getPropertyValue("--rtpp-pin-w") !== w) root.style.setProperty("--rtpp-pin-w", w);
    if (root.style.getPropertyValue("--rtpp-pin-pl") !== pl) root.style.setProperty("--rtpp-pin-pl", pl);
  }
  function decoratePin(pin) {
    const id = pin.getAttribute("data-thread-id");
    const root = pin.firstElementChild;
    if (!id || !root) return false;
    const ctx = pinCtx(pin, id);
    const info = ctx ? claudeIn(id, ctx.th) : null;
    pinStack(root, !!(info && info.any));
    return !!(info && info.any);
  }

  // ---- the hover preview
  function rowOf(c, th) {
    const mark = parseMark(c.body);
    const time = appAgo(c.at);
    if (mark) return { who: "claude", name: "Claude", sub: mark.model, title: [mark.model, mark.effort].filter(Boolean).join(" · "), time, text: mark.text || "Done." };
    const text = c.deleted ? "[deleted]" : plainBody(c.body);
    if (c.agent) {
      const n = String(c.agent.name || c.agent.aiClient || "Agent");
      return { who: "other", name: n, initials: initialsOf(n), color: c.agent.color || appColor(c.agent.agentId || n), time, text, deleted: c.deleted };
    }
    if (c.authorId && ident.userId && c.authorId === ident.userId) return { who: "self", name: "You", time, text, deleted: c.deleted };
    const p = (th.participants || []).find((x) => x && !x.agent && x.id === c.authorId) || null;
    return { who: "other", name: (p && p.name) || "Someone", initials: (p && p.initials) || "?", color: (p && p.color) || appColor(c.authorId || "?"), time, text, deleted: c.deleted };
  }
  // Before comments:getThread answers: the latest message, from the pin's own row.
  function latestRow(th) {
    const mark = parseMark(th.body);
    if (mark) return { who: "claude", name: "Claude", sub: mark.model, title: [mark.model, mark.effort].filter(Boolean).join(" · "), time: th.timeAgo || "", text: mark.text || "Done." };
    const me = firstWord(ident.name);
    const p = (th.participants || []).find((x) => x && !x.agent && x.name === th.authorName) || null;
    const self = (p && ident.userId && p.id === ident.userId) || (!!me && firstWord(th.authorName) === me);
    if (self) return { who: "self", name: "You", time: th.timeAgo || "", text: plainBody(th.body) };
    return { who: "other", name: th.authorName || "Someone", initials: (p && p.initials) || "?", color: (p && p.color) || PALETTE[0], time: th.timeAgo || "", text: plainBody(th.body) };
  }
  function previewModel(id, th, cache) {
    const all = cache && cache.comments && cache.comments.length ? cache.comments : null;
    let rows;
    let more = 0;
    if (all) {
      const pick = all.length <= 3 ? all : [all[0], ...all.slice(-2)];
      more = all.length - pick.length;
      rows = pick.map((c) => rowOf(c, th));
    } else rows = [latestRow(th)];
    const info = claudeIn(id, th);
    const replies = Number.isFinite(th.replyCount) ? th.replyCount : all ? all.length - 1 : 0;
    return { rows, more, replies, agent: info.any ? agentOf(info.task, info.last) : null, loading: !all && !!(cache && cache.busy) };
  }
  function avHtml(r) {
    if (r.who === "claude") return `<span class="rtpp-pv-av" data-who="claude" aria-hidden="true">${claudeSvg(12)}</span>`;
    if (r.who === "self" && photoUsable()) return `<span class="rtpp-pv-av" data-who="self" aria-hidden="true"><img src="${esc(photo.dataUrl)}" alt="" draggable="false"></span>`;
    const color = r.who === "self" ? ident.color : r.color;
    const initials = r.who === "self" ? ident.initials : r.initials;
    return `<span class="rtpp-pv-av" data-who="${r.who}" aria-hidden="true" style="background:${esc(color)};color:${esc(inkOn(color))}">${esc(initials)}</span>`;
  }
  function previewHtml(m) {
    const rows = m.rows.map((r, i) => {
      const row =
        `<li class="rtpp-pv-row" data-who="${r.who}"${r.deleted ? " data-deleted" : ""}>${avHtml(r)}<div class="rtpp-pv-main">` +
        `<div class="rtpp-pv-meta"><span class="rtpp-pv-name">${esc(r.name)}</span>` +
        (r.sub ? `<span class="rtpp-pv-sub"${r.title ? ` title="${esc(r.title)}"` : ""}>${esc(r.sub)}</span>` : "") +
        (r.time ? `<span class="rtpp-pv-time">${esc(r.time)}</span>` : "") +
        `</div><p class="rtpp-pv-text">${esc(r.text)}</p></div></li>`;
      return i === 0 && m.more ? `${row}<li class="rtpp-pv-more">${esc(plural(m.more, "more reply", "more replies"))}</li>` : row;
    });
    const foot =
      m.agent || m.replies > 0
        ? `<div class="rtpp-pv-foot">` +
          (m.agent ? `<span class="rtpp-pv-st" data-st="${m.agent.key}"><i aria-hidden="true"></i>${esc(m.agent.label)}</span>` : "") +
          (m.replies > 0 ? `<span class="rtpp-pv-n">${esc(plural(m.replies, "reply", "replies"))}</span>` : "") +
          `</div>`
        : "";
    return `<ol class="rtpp-pv-list">${rows.join("")}</ol>${foot}`;
  }
  // Kept inside the window: shifted left (not animated) when it would cross the right edge.
  function fitPreview(pv, card) {
    const left = pv.getBoundingClientRect().left;
    const vw = document.documentElement.clientWidth || innerWidth;
    const over = left + card.offsetWidth - (vw - 8);
    const dx = over > 0 ? -Math.min(over, Math.max(0, left - 8)) : 0;
    const v = dx ? `${Math.round(dx)}px` : "";
    if (card.style.left !== v) card.style.left = v;
    if (card.hasAttribute("data-shift") !== !!dx) card.toggleAttribute("data-shift", !!dx);
  }
  function decoratePreview(pv) {
    const id = (pv.getAttribute("data-testid") || "").slice(PV_PREFIX.length);
    const ctx = id ? pinCtx(pv, id) : null;
    let card = pv.querySelector(":scope > .rtpp-pv");
    if (!ctx) {
      if (card) card.remove();
      pv.removeAttribute("data-rtpp-pv");
      return false;
    }
    const html = previewHtml(previewModel(id, ctx.th, fetchThread(id, threadSig(ctx.th))));
    if (!card) {
      card = document.createElement("div");
      card.className = "rtpp-pv";
      pv.appendChild(card);
    }
    if (card.dataset.status !== ctx.status) card.dataset.status = ctx.status;
    if (card.__rtppHtml !== html) {
      card.innerHTML = html; // every value escaped (esc), the rest constant
      card.__rtppHtml = html;
    }
    if (!pv.hasAttribute("data-rtpp-pv")) pv.setAttribute("data-rtpp-pv", "");
    fitPreview(pv, card);
    return true;
  }

  let pinStats = { pins: 0, claude: 0, previews: 0 };
  function applyPins() {
    if (!PROFILE_ON || disposed) return;
    let pins = 0;
    let claude = 0;
    let previews = 0;
    for (const pin of document.querySelectorAll(PIN_SEL)) {
      pins++;
      if (decoratePin(pin)) claude++;
    }
    for (const pv of document.querySelectorAll(PV_SEL)) if (decoratePreview(pv)) previews++;
    pinStats = { pins, claude, previews };
  }
  function refreshThread(id) {
    for (const pin of document.querySelectorAll(PIN_SEL)) if (pin.getAttribute("data-thread-id") === id) decoratePin(pin);
    for (const pv of document.querySelectorAll(PV_SEL)) if (pv.getAttribute("data-testid") === PV_PREFIX + id) decoratePreview(pv);
  }
  // Fast path (mutation observers' microtask): a pin or a preview React just
  // inserted is decorated before it is painted.
  function pinsWithin(node) {
    if (!PROFILE_ON || disposed || node.nodeType !== 1 || !node.isConnected) return;
    if (node.matches(PV_SEL)) {
      decoratePreview(node);
      return;
    }
    const pin = node.closest(PIN_SEL);
    if (pin) {
      decoratePin(pin);
      return;
    }
    if (node.firstElementChild) for (const p of node.querySelectorAll(PIN_SEL)) decoratePin(p);
  }
  // Hovering a pin fetches its messages before the preview opens.
  function onPinOver(e) {
    if (!PROFILE_ON || paused || disposed) return;
    const pin = e.target && e.target.closest ? e.target.closest(PIN_SEL) : null;
    if (!pin) return;
    const id = pin.getAttribute("data-thread-id");
    const ctx = id ? pinCtx(pin, id) : null;
    if (ctx) fetchThread(id, threadSig(ctx.th));
  }

  // ------------------------------------------------------------ data sources
  function runStatus(s) {
    const v = String(s || "").toLowerCase();
    if (/^(done|complete|completed|succeeded|success|finished)$/.test(v)) return "done";
    if (/^(running|in_progress|in-progress|active|started|working|executing|starting)$/.test(v)) return "running";
    if (/^(queued|pending|scheduled|waiting|created|provisioning)$/.test(v)) return "queued";
    if (/^(failed|failure|error|errored|timed_out|timeout|crashed)$/.test(v)) return "failed";
    if (/^(cancelled|canceled|aborted|stopped|killed)$/.test(v)) return "cancelled";
    return "other";
  }
  async function loadRuns() {
    const [active, failed] = await Promise.all([query(Q.myActive, {}).catch(() => null), query(Q.myFailed, {}).catch(() => null)]);
    const agents = [];
    let history = [];
    let historyError = null;
    try {
      const orgs = listOf(await query(Q.orgs, {})).filter((o) => o && o._id).slice(0, MAX_ORGS);
      const seen = new Set();
      for (const org of orgs) {
        const list = listOf(await query(Q.agents, { organizationId: org._id }).catch(() => []));
        for (const a of list) {
          if (!a || !a._id || seen.has(a._id)) continue;
          seen.add(a._id);
          agents.push(a);
        }
      }
      const lists = await Promise.all(
        agents.map((a) =>
          query(Q.runsForAgent, { agentId: a._id, limit: RUNS_PER_AGENT })
            .catch(() => query(Q.runsForAgent, { agentId: a._id, limit: RUNS_PER_AGENT_APP }))
            .then((rs) => listOf(rs).map((r) => (r && !r.agentId ? { ...r, agentId: a._id } : r)))
            .catch(() => [])
        )
      );
      history = lists.flat();
    } catch (e) {
      historyError = e;
    }
    if (active == null && failed == null && historyError) throw historyError;
    const byId = new Map();
    for (const r of [...listOf(active), ...listOf(failed), ...history]) {
      if (!r) continue;
      const id = r._id || r.id || JSON.stringify(r);
      if (!byId.has(id)) byId.set(id, r);
    }
    const items = [...byId.values()].map((r) => {
      const t = toMs(r.startedAt) || toMs(r._creationTime) || toMs(r.createdAt);
      const end = toMs(r.completedAt) || toMs(r.endedAt) || toMs(r.finishedAt);
      return { t, end: end || t, status: runStatus(r.status), agentId: r.agentId || null };
    });
    return { available: true, items, agents: agents.length, partial: !!historyError };
  }
  async function readWorkspaces() {
    const api = window.electronAPI && window.electronAPI.persist;
    if (!api || typeof api.getItem !== "function") return null;
    const rawState = await api.getItem("tempo-workspaces");
    if (!rawState) return null;
    const j = typeof rawState === "string" ? JSON.parse(rawState) : rawState;
    return (j && (j.state || j)) || null;
  }
  function tabsOf(state) {
    const out = [];
    const seen = new Set();
    const add = (tab, ws) => {
      if (!tab || typeof tab !== "object") return;
      const id = tab.id || `${ws || ""}:${out.length}`;
      if (seen.has(id)) return;
      seen.add(id);
      out.push({ tab, ws });
    };
    const wss = state && Array.isArray(state.workspaces) ? state.workspaces : [];
    for (const ws of wss) for (const tab of (ws && ws.centerTabs) || []) add(tab, ws && ws.id);
    if (state && Array.isArray(state.centerTabs)) for (const tab of state.centerTabs) add(tab, state.selectedWorkspaceId || null);
    return { tabs: out, workspaces: wss.length };
  }
  function chatsFrom(ws) {
    if (!ws.ok) return { available: false, error: ws.error, items: [], workspaces: 0 };
    if (!ws.state) return { available: false, error: null, items: [], workspaces: 0 };
    const { tabs, workspaces } = tabsOf(ws.state);
    const items = tabs.filter((x) => x.tab.type === "chat" && !x.tab.isArchived && !x.tab.archived).map((x) => ({ t: toMs(x.tab.createdAt), ws: x.ws }));
    return { available: true, items, workspaces };
  }
  async function loadCanvases(state) {
    const byKey = new Map();
    const put = (key, t) => {
      if (!key) return;
      const k = String(key);
      byKey.set(k, Math.max(byKey.get(k) || 0, t || 0));
    };
    let available = false;
    if (state) {
      available = true;
      for (const { tab } of tabsOf(state).tabs) {
        if (tab.type !== "canvas") continue;
        put(tab.canvasPath || tab.path || tab.filePath || tab.canvasName || tab.title || tab.id, toMs(tab.lastOpenedAt) || toMs(tab.createdAt));
      }
    }
    const cq = window.__RE_TEMPO_CANVAS_QUICK__;
    let error = null;
    if (cq && typeof cq.load === "function") {
      available = true;
      try {
        const d = await withTimeout(cq.load(), SOURCE_TIMEOUT_MS, "Canvases");
        for (const c of (d && d.items) || []) put(c.canvasPath || c.canvasName, toMs(c.editedAt) || toMs(c.openedAt) || toMs(c.lastModifiedAt));
      } catch (e) {
        error = errText(e);
      }
    }
    return { available, error: available ? null : error, items: [...byKey].map(([key, t]) => ({ key, t })) };
  }
  function loadTasks() {
    const api = window.__RE_TEMPO_COMMENT_AGENT__;
    let list = null;
    if (api && typeof api.tasks === "function") {
      try {
        list = api.tasks();
      } catch (_) {
        list = null;
      }
    }
    if (!Array.isArray(list)) {
      try {
        const s = JSON.parse(localStorage.getItem("rtd.commentAgent.tasks") || "null");
        list = Array.isArray(s) ? s : s && Array.isArray(s.tasks) ? s.tasks : null;
      } catch (_) {
        list = null;
      }
    }
    if (!Array.isArray(list)) return { available: false, items: [] };
    return {
      available: true,
      items: list.filter(Boolean).map((t) => ({ t: toMs(t.createdAt), end: toMs(t.finishedAt) || toMs(t.createdAt), status: String(t.status || "") })),
    };
  }
  function loadUsage() {
    const U = window.__RE_TEMPO_USAGE__;
    const accs = U && U.state && U.state.accounts;
    if (!Array.isArray(accs)) return { available: false, rows: [] };
    const rows = accs.map((a) => {
      let w = null;
      try {
        w = typeof U.headline === "function" ? U.headline(a) : null;
      } catch (_) {
        w = null;
      }
      return { title: a.title || a.provider || "Plan", plan: a.plan || null, pct: w && typeof w.pct === "number" ? w.pct : null, label: (w && w.label) || null, resetAt: (w && w.resetAt) || null };
    });
    return { available: true, rows };
  }
  async function collect() {
    const ws = await withTimeout(readWorkspaces(), SOURCE_TIMEOUT_MS, "Workspaces").then(
      (state) => ({ ok: true, state }),
      (e) => ({ ok: false, error: errText(e) })
    );
    const [runs, canvases, me] = await Promise.all([
      withTimeout(loadRuns(), RUNS_TIMEOUT_MS, "Agent runs").catch((e) => ({ available: false, error: errText(e), items: [], agents: 0 })),
      loadCanvases(ws.ok ? ws.state : null).catch((e) => ({ available: false, error: errText(e), items: [] })),
      withTimeout(query(Q.me, {}), SOURCE_TIMEOUT_MS, "Account").catch(() => null),
    ]);
    if (me && typeof me === "object") {
      convexUser = {
        name: me.name || [me.firstName, me.lastName].filter(Boolean).join(" ") || null,
        email: me.email || null,
        memberSince: toMs(me._creationTime) || toMs(me.createdAt) || null,
      };
      syncIdentity();
    }
    return { chats: chatsFrom(ws), runs, tasks: loadTasks(), canvases, usage: loadUsage() };
  }

  // ------------------------------------------------------------------ model
  function levelFor(done) {
    let i = 0;
    while (i + 1 < LEVELS.length && done >= LEVELS[i + 1].min) i++;
    const cur = LEVELS[i];
    const next = LEVELS[i + 1] || null;
    return { ...cur, next, done, progress: next ? (done - cur.min) / (next.min - cur.min) : 1, left: next ? next.min - done : 0 };
  }
  function buildHeat(events, weeks) {
    const today = startOfDay(now());
    const start = addDays(today, -new Date(today).getDay() - (weeks - 1) * 7);
    const byDay = new Map();
    for (const e of events) {
      if (!(e.t >= start) || e.t > now()) continue;
      const k = dayKey(e.t);
      const c = byDay.get(k) || { total: 0, run: 0, chat: 0, task: 0, canvas: 0 };
      c.total++;
      c[e.kind]++;
      byDay.set(k, c);
    }
    const cells = [];
    const weekday = [0, 0, 0, 0, 0, 0, 0];
    let max = 0;
    let total = 0;
    let best = null;
    for (let i = 0; i < weeks * 7; i++) {
      const t = addDays(start, i);
      const future = t > today;
      const c = byDay.get(dayKey(t)) || null;
      const n = c ? c.total : 0;
      cells.push({ t, future, n, c });
      if (future) continue;
      weekday[new Date(t).getDay()] += n;
      total += n;
      if (n > max) max = n;
      if (n && (!best || n > best.n)) best = { t, n };
    }
    for (const cell of cells) {
      cell.l = cell.future ? -1 : !cell.n ? 0 : max <= 4 ? cell.n : Math.min(4, Math.max(1, Math.ceil((cell.n / max) * 4)));
    }
    const wmax = Math.max(...weekday);
    return {
      weeks,
      start,
      cells,
      max,
      total,
      activeDays: cells.filter((c) => !c.future && c.n > 0).length,
      days: cells.filter((c) => !c.future).length,
      best,
      busiestWeekday: wmax > 0 ? WEEKDAYS[weekday.indexOf(wmax)] : null,
    };
  }
  function buildModel(r) {
    const key = userKey();
    const runs = r.runs.items || [];
    const chats = r.chats.items || [];
    const tasks = r.tasks.items || [];
    const canvases = r.canvases.items || [];
    const byStatus = Object.fromEntries(RUN_STATUS.map((s) => [s.id, 0]));
    for (const x of runs) byStatus[x.status] = (byStatus[x.status] || 0) + 1;
    const runsDone = runs.filter((x) => x.status === "done");
    const tasksDone = tasks.filter((x) => x.status === "done");
    const tasksActive = tasks.filter((x) => x.status === "running" || x.status === "queued").length;
    // progress only goes up: the highest count seen for this account is kept
    const computed = runsDone.length + tasksDone.length + canvases.length;
    const bestAll = lsRead(LS_BEST);
    const best = Math.max(0, Number(bestAll[key]) || 0);
    if (computed > best) {
      bestAll[key] = computed;
      lsWrite(LS_BEST, bestAll);
    }
    const level = { ...levelFor(Math.max(computed, best)), computed, kept: best > computed };
    const events = [
      ...chats.map((x) => ({ t: x.t, kind: "chat" })),
      ...runs.map((x) => ({ t: x.t, kind: "run" })),
      ...tasks.map((x) => ({ t: x.t, kind: "task" })),
      ...canvases.map((x) => ({ t: x.t, kind: "canvas" })),
    ].filter((e) => e.t > 0);
    const counts = { chat: chats.length, run: runs.length, task: tasks.length, canvas: canvases.length };
    const mixTotal = counts.run + counts.chat + counts.task + counts.canvas;
    const sortT = (a) => a.slice().sort((x, y) => x - y);
    const agentFirst = new Map();
    for (const x of runs) if (x.agentId) agentFirst.set(x.agentId, Math.min(agentFirst.get(x.agentId) || Infinity, x.t || Infinity));
    const times = {
      chat: sortT(chats.map((x) => x.t)),
      run: sortT(runs.map((x) => x.t)),
      runDone: sortT(runsDone.map((x) => x.end)),
      agentFirst: sortT([...agentFirst.values()].map((t) => (isFinite(t) ? t : 0))),
      task: sortT(tasks.map((x) => x.t)),
      taskDone: sortT(tasksDone.map((x) => x.end)),
      canvas: sortT(canvases.map((x) => x.t)),
    };
    // milestones stay earned; one quiet highlight for those earned since the last visit
    const seenAll = lsRead(LS_SEEN);
    const seen = seenAll[key] && typeof seenAll[key] === "object" ? seenAll[key] : null;
    const badges = BADGES.map((b) => {
      const list = b.from(times) || [];
      const value = list.length;
      const now_ = value >= b.target;
      const prior = seen && b.id in seen ? seen[b.id] : undefined;
      const earned = now_ || prior !== undefined;
      const at = now_ ? list[b.target - 1] || prior || 0 : prior || 0;
      return { ...b, value: Math.min(value, b.target), earned, at, fresh: !!(earned && seen && prior === undefined) };
    });
    const sources = [r.runs, r.chats, r.tasks, r.canvases];
    const allFailed = sources.every((s) => !s.available);
    return {
      at: now(),
      key,
      counts,
      byStatus,
      runs: { total: runs.length, done: runsDone.length, active: byStatus.running + byStatus.queued, agents: r.runs.agents || 0, available: !!r.runs.available, error: r.runs.error || null, partial: !!r.runs.partial },
      chats: { total: chats.length, workspaces: r.chats.workspaces || 0, available: !!r.chats.available, error: r.chats.error || null },
      tasks: { total: tasks.length, done: tasksDone.length, active: tasksActive, available: !!r.tasks.available },
      canvases: { total: canvases.length, last: canvases.reduce((m, x) => Math.max(m, x.t || 0), 0), available: !!r.canvases.available, error: r.canvases.error || null },
      usage: r.usage,
      level,
      events,
      mix: KINDS.map((k) => ({ ...k, count: counts[k.id], share: mixTotal ? counts[k.id] / mixTotal : 0 })),
      mixTotal,
      badges,
      earned: badges.filter((b) => b.earned).length,
      empty: !allFailed && mixTotal === 0,
      allFailed,
      error: allFailed ? r.runs.error || r.chats.error || "No data source answered." : null,
    };
  }
  function markMilestonesSeen(m) {
    const all = lsRead(LS_SEEN);
    const cur = all[m.key] && typeof all[m.key] === "object" ? all[m.key] : {};
    let changed = !all[m.key];
    for (const b of m.badges) {
      if (b.earned && !(b.id in cur)) {
        cur[b.id] = b.at || now();
        changed = true;
      }
    }
    if (!changed) return;
    all[m.key] = cur;
    lsWrite(LS_SEEN, all);
  }
  function buildMonth(m) {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const ev = m.events.filter((e) => e.t >= start && e.t <= now());
    const byKind = Object.fromEntries(KINDS.map((k) => [k.id, 0]));
    const byDay = new Map();
    for (const e of ev) {
      byKind[e.kind]++;
      const k = dayKey(e.t);
      byDay.set(k, (byDay.get(k) || { t: startOfDay(e.t), n: 0 }));
      byDay.get(k).n++;
    }
    const top = KINDS.map((k) => ({ ...k, n: byKind[k.id] })).sort((a, b) => b.n - a.n)[0];
    const busiest = [...byDay.values()].sort((a, b) => b.n - a.n)[0] || null;
    const days = Math.floor((startOfDay(now()) - start) / 864e5) + 1;
    const badges = m.badges.filter((b) => b.earned && b.at >= start);
    return { label: DF_MONTH_YEAR.format(d), total: ev.length, top: top && top.n ? top : null, busiest, activeDays: byDay.size, days, badges };
  }

  // ------------------------------------------------------------------- page
  let page = null; // { root, head, body, heatSlot, updated, tip, ringDrawn, unsub, ro, weeks, heat, month, undo }
  let model = null;
  let raw = null;
  let loading = null;
  let lastLoadAt = 0;
  let loadError = null;
  let statusTimer = 0;

  function avatarHtml(size) {
    const inner = photo
      ? `<img class="rtpp-av-img" src="${esc(photo.dataUrl)}" alt="" draggable="false">`
      : `<span class="rtpp-av-ini" style="background:${esc(ident.color)};color:${inkOn(ident.color)}">${esc(ident.initials)}</span>`;
    return `<span class="rtpp-av" style="--s:${size}px">${inner}</span>`;
  }
  function headHtml() {
    const name = ident.name || (ident.email ? ident.email.split("@")[0] : "You");
    return `
      <section class="rtpp-head" style="--rtpp-user:${esc(ident.color)}" data-testid="profile-hero">
        <div class="rtpp-head-wash" aria-hidden="true"></div>
        <button type="button" class="rtpp-av-btn" data-act="photo" aria-label="${photo ? "Change profile photo" : "Add a profile photo"}" data-tip="${photo ? "Change photo: click, or drop an image here" : "Add a photo: click, or drop an image here"}" data-testid="profile-avatar">
          ${avatarHtml(72)}
          <span class="rtpp-av-edit" aria-hidden="true">${icon("camera", 16)}</span>
        </button>
        <div class="rtpp-head-main">
          <div class="rtpp-name" data-testid="profile-name">${esc(name)}</div>
          ${ident.email ? `<div class="rtpp-email" data-testid="profile-email">${esc(ident.email)}</div>` : ""}
          ${ident.memberSince ? `<div class="rtpp-meta" data-tip="When your Tempo account was created (users:getUser)">Member since ${esc(DF_MONTH_YEAR.format(new Date(ident.memberSince)))}</div>` : ""}
        </div>
        <div class="rtpp-head-actions">
          <button type="button" class="rtpp-btn" data-act="photo" data-testid="profile-change-photo">${icon("camera", 14)}<span>${photo ? "Change photo" : "Add photo"}</span></button>
          ${photo ? `<button type="button" class="rtpp-btn rtpp-btn--ghost" data-act="remove-photo" data-testid="profile-remove-photo">Remove</button>` : ""}
        </div>
        <p class="rtpp-status" aria-live="polite"></p>
      </section>`;
  }
  function levelHtml(m) {
    const lv = m.level;
    const how = `Level = agent runs done + comment tasks done + canvases.\nYou have ${fmtInt(lv.computed)} now${lv.kept ? `; the level keeps your best count (${fmtInt(lv.done)}), since older items drop off capped lists` : ""}.\nBands: ${LEVELS.map((l) => `${l.min} ${l.name}`).join(" · ")}.`;
    const trio = [
      { n: m.runs.done, label: "agent runs done", tip: "Agent runs with status done (active runs, recent failures and up to 100 recent runs per agent)." },
      { n: m.tasks.done, label: "comment tasks done", tip: "Canvas comments an agent finished (comment agent's task list)." },
      { n: m.canvases.total, label: "canvases", tip: "Distinct canvases you opened or edited (workspace tabs and the project's canvas list)." },
    ];
    return `
      <section class="rtpp-card rtpp-level-card" data-testid="profile-level-card">
        <div class="rtpp-ringwrap" tabindex="0" data-tip="${esc(how)}" aria-label="Level ${lv.n}, ${esc(lv.name)}. ${fmtInt(lv.done)} completed.">
          <svg class="rtpp-ring" viewBox="0 0 140 140" aria-hidden="true">
            <defs><linearGradient id="rtpp-ring-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--rtpp-accent)"/><stop offset="1" stop-color="var(--rtpp-accent-2)"/></linearGradient></defs>
            <circle class="rtpp-ring-track" cx="70" cy="70" r="${RING_R}"/>
            <circle class="rtpp-ring-fg" cx="70" cy="70" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${(page && page.ringDrawn ? RING_C * (1 - lv.progress) : RING_C).toFixed(2)}" data-p="${lv.progress.toFixed(4)}" transform="rotate(-90 70 70)"/>
          </svg>
          <div class="rtpp-ring-center"><span>Level</span><strong>${lv.n}</strong><span>${esc(lv.name)}</span></div>
        </div>
        <div class="rtpp-level-side">
          <div class="rtpp-level-top">
            <span class="rtpp-chip" data-testid="profile-level">${icon("spark", 12)}Level ${lv.n} · ${esc(lv.name)}</span>
            <span class="rtpp-level-next">${lv.next ? `<strong>${fmtInt(lv.left)}</strong> more completed to ${esc(lv.next.name)}` : "Top level reached"}</span>
          </div>
          <div class="rtpp-trio">
            ${trio.map((x) => `<div class="rtpp-trio-item" tabindex="0" data-tip="${esc(x.tip)}"><strong>${fmtInt(x.n)}</strong><span>${esc(x.label)}</span></div>`).join("")}
          </div>
          <div class="rtpp-level-how">${icon("info", 12)}Counts only finished work, and only goes up.</div>
        </div>
      </section>`;
  }
  function tileHtml(o) {
    return `
      <div class="rtpp-tile" tabindex="0" data-tip="${esc(o.tip)}" data-testid="profile-tile-${o.id}" ${o.error ? 'data-error=""' : ""}>
        <div class="rtpp-tile-head"><span class="rtpp-tile-icon">${icon(o.icon, 14)}</span><span>${esc(o.label)}</span></div>
        <div class="rtpp-tile-value">${o.value}</div>
        ${o.viz || ""}
        <div class="rtpp-tile-sub">${o.sub || ""}</div>
      </div>`;
  }
  const errSub = () => `<span class="rtpp-tile-err">${icon("alert", 12)}Couldn't load</span> <button type="button" class="rtpp-link" data-act="retry">Retry</button>`;
  function statusBar(byStatus, total) {
    if (!total) return `<div class="rtpp-sbar" aria-hidden="true"><span class="rtpp-sbar-empty"></span></div>`;
    const segs = RUN_STATUS.filter((s) => byStatus[s.id] > 0)
      .map((s) => `<span class="rtpp-seg" data-st="${s.id}" style="flex-grow:${byStatus[s.id]}"></span>`)
      .join("");
    return `<div class="rtpp-sbar" aria-hidden="true">${segs}</div>`;
  }
  function tilesHtml(m) {
    const t = [];
    t.push(
      tileHtml({
        id: "chats",
        icon: "chat",
        label: "Chats",
        tip: "Chat tabs in your workspaces, drafts included (the app's saved workspace list on this Mac).",
        value: m.chats.available ? fmtInt(m.chats.total) : "—",
        error: !!m.chats.error,
        sub: m.chats.error ? errSub() : m.chats.available ? (m.chats.workspaces ? `in ${plural(m.chats.workspaces, "workspace")}` : "No workspaces yet") : "Workspaces unavailable",
      })
    );
    const statusTip = RUN_STATUS.filter((s) => s.id !== "other" || m.byStatus.other)
      .map((s) => `${s.label}: ${fmtInt(m.byStatus[s.id] || 0)}`)
      .join(" · ");
    t.push(
      tileHtml({
        id: "runs",
        icon: "bot",
        label: "Agent runs",
        tip: `Your agent runs in Tempo, by status. ${statusTip}.\nFrom active runs, recent failures and up to 100 recent runs per agent${m.runs.agents ? ` (${plural(m.runs.agents, "agent")})` : ""}.`,
        value: m.runs.available ? fmtInt(m.runs.total) : "—",
        error: !!m.runs.error,
        viz: m.runs.available ? statusBar(m.byStatus, m.runs.total) : "",
        sub: m.runs.error
          ? errSub()
          : `${fmtInt(m.runs.done)} done${m.runs.active ? ` · ${fmtInt(m.runs.active)} active` : ""}${m.byStatus.failed ? ` · ${fmtInt(m.byStatus.failed)} failed` : ""}`,
      })
    );
    t.push(
      tileHtml({
        id: "tasks",
        icon: "pin",
        label: "Comment tasks",
        tip: "Canvas comments you handed to an agent (the comment agent keeps the last 50 on this Mac).",
        value: m.tasks.available ? fmtInt(m.tasks.total) : "—",
        sub: m.tasks.available ? `${fmtInt(m.tasks.done)} done${m.tasks.active ? ` · ${fmtInt(m.tasks.active)} in progress` : ""}` : "Comment agent is off",
      })
    );
    const u = m.usage;
    const top = u.available ? u.rows.find((x) => x.pct != null) || u.rows[0] : null;
    const rest = u.available ? u.rows.filter((x) => x !== top && x.pct != null) : [];
    t.push(
      tileHtml({
        id: "usage",
        icon: "gauge",
        label: "Plan usage",
        tip: "The current usage window of your plan, as Claude Code and Codex last reported it (usage bar mod). Shown as-is.",
        value: top && top.pct != null ? pct(top.pct) : "—",
        viz: top && top.pct != null ? `<div class="rtpp-meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(top.pct)}" aria-label="Plan usage"><span style="width:${Math.max(0, Math.min(100, top.pct))}%"></span></div>` : "",
        sub: !u.available
          ? "Usage mod is off"
          : !top
            ? "No usage data yet"
            : [
                `${esc(top.title)}${top.label ? ` · ${esc(top.label)}` : ""}`,
                top.resetAt && top.resetAt > now() ? `Resets in ${fmtLeft(top.resetAt - now())}` : "",
                ...rest.map((x) => `${esc(x.title)} ${pct(x.pct)}`),
              ]
                .filter(Boolean)
                .join("<br>"),
      })
    );
    return `<section class="rtpp-tiles" aria-label="Stats">${t.join("")}</section>`;
  }
  function heatWeeks() {
    const el = page && page.root.querySelector(".rtpp-page");
    const w = el ? el.clientWidth : 0;
    if (!w) return WEEKS_MIN;
    const avail = w - 2 * 18 - 2 - 32; // card padding, border, day labels
    return Math.max(WEEKS_MIN, Math.min(WEEKS_MAX, Math.floor((avail + CELL_GAP) / (CELL + CELL_GAP))));
  }
  function heatHtml(h) {
    // a label where a month starts; the partial first month gives way to the next one
    const starts = [];
    for (let w = 0; w < h.weeks; w++) {
      const d = new Date(h.cells[w * 7].t);
      const prev = w ? new Date(h.cells[(w - 1) * 7].t) : null;
      if (!prev || prev.getMonth() !== d.getMonth()) starts.push({ w, d });
    }
    if (starts.length > 1 && starts[1].w - starts[0].w < 3) starts.shift();
    const months = [];
    let lastLabelCol = -9;
    for (const { w, d } of starts) {
      if (w - lastLabelCol < 3) continue;
      months.push(`<span style="grid-column:${w + 1}">${DF_MONTH.format(d)}</span>`);
      lastLabelCol = w;
    }
    const cells = h.cells.map((c, i) => `<span class="rtpp-cell" data-l="${c.l < 0 ? "x" : c.l}" data-i="${i}"></span>`).join("");
    const label = `Activity in the last ${h.weeks} weeks: ${plural(h.total, "activity", "activities")} on ${plural(h.activeDays, "day")}.`;
    const rows = h.cells
      .filter((c) => c.n > 0)
      .map((c) => `<tr><td>${esc(fmtDay(c.t))}</td><td>${c.n}</td></tr>`)
      .join("");
    return `
      <section class="rtpp-card rtpp-heat-card" data-testid="profile-heatmap" style="--weeks:${h.weeks}">
        <header class="rtpp-card-head"><h3>Activity</h3><span class="rtpp-card-sub">Last ${h.weeks} weeks</span></header>
        <div class="rtpp-heat">
          <div class="rtpp-heat-months" aria-hidden="true">${months.join("")}</div>
          <div class="rtpp-heat-body">
            <div class="rtpp-heat-days" aria-hidden="true"><span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span></div>
            <div class="rtpp-heat-grid" role="img" aria-label="${esc(label)}">${cells}</div>
          </div>
          <div class="rtpp-heat-legend" aria-hidden="true">Less<span class="rtpp-cell" data-l="0"></span><span class="rtpp-cell" data-l="1"></span><span class="rtpp-cell" data-l="2"></span><span class="rtpp-cell" data-l="3"></span><span class="rtpp-cell" data-l="4"></span>More</div>
        </div>
        <dl class="rtpp-facts">
          <div tabindex="0" data-tip="Agent runs started, chats created, comment tasks and canvas edits in these ${h.weeks} weeks."><dt>Activities</dt><dd>${fmtInt(h.total)}</dd></div>
          <div tabindex="0" data-tip="Days with at least one activity. A day without work is just a day."><dt>Active days</dt><dd>${fmtInt(h.activeDays)}<small> of ${h.days}</small></dd></div>
          <div tabindex="0" data-tip="The weekday with the most activities in these weeks."><dt>Busiest weekday</dt><dd>${h.busiestWeekday ? esc(h.busiestWeekday) : "—"}</dd></div>
          <div tabindex="0" data-tip="The single day with the most activities."><dt>Busiest day</dt><dd>${h.best ? `${esc(fmtDate(h.best.t))}<small> · ${h.best.n}</small>` : "—"}</dd></div>
        </dl>
        <table class="rtpp-sr"><caption>Activity by day, last ${h.weeks} weeks</caption><thead><tr><th>Day</th><th>Activities</th></tr></thead><tbody>${rows}</tbody></table>
      </section>`;
  }
  function mixHtml(m) {
    const aria = m.mix.map((x) => `${x.label} ${x.count} (${pct(x.share * 100)})`).join(", ");
    const segs = m.mix
      .filter((x) => x.count > 0)
      .map((x) => `<span class="rtpp-stack-seg" data-k="${x.id}" style="flex-grow:${x.count}" data-tip="${esc(`${x.label}: ${fmtInt(x.count)} · ${pct(x.share * 100)}\n${x.src}.`)}"></span>`)
      .join("");
    const legend = m.mix
      .map(
        (x) => `
        <li class="rtpp-mix-row" tabindex="0" data-tip="${esc(x.src)}."><span class="rtpp-dot" data-k="${x.id}"></span><span class="rtpp-legend-label">${esc(x.label)}</span>
        <span class="rtpp-legend-val">${fmtInt(x.count)}<small>${m.mixTotal ? pct(x.share * 100) : ""}</small></span></li>`
      )
      .join("");
    return `
      <section class="rtpp-card" data-testid="profile-mix">
        <header class="rtpp-card-head"><h3>Work by type</h3><span class="rtpp-card-sub">${plural(m.mixTotal, "item")}</span></header>
        <div class="rtpp-stack" role="img" aria-label="${esc(aria)}">${segs || '<span class="rtpp-sbar-empty"></span>'}</div>
        <ul class="rtpp-legend">${legend}</ul>
      </section>`;
  }
  function sealHtml(b) {
    const r = 29;
    const c = 2 * Math.PI * r;
    const prog = b.earned ? "" : `<svg class="rtpp-seal-arc" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - b.value / b.target)).toFixed(2)}" transform="rotate(-90 32 32)"/></svg>`;
    const meta = b.earned ? (b.at ? `Earned ${esc(fmtDate(b.at))}` : "Earned") : `${fmtInt(b.value)} of ${fmtInt(b.target)}`;
    const tip = `${b.title}: ${b.desc}.\n${b.src}${b.earned ? "" : ` ${fmtInt(b.value)} of ${fmtInt(b.target)} so far.`}`;
    return `
      <li class="rtpp-seal" data-earned="${b.earned}" ${b.fresh ? "data-fresh" : ""} data-badge="${b.id}" tabindex="0" data-tip="${esc(tip)}" aria-label="${esc(`${b.title}. ${b.desc}. ${b.earned ? "Earned" : `Locked, ${b.value} of ${b.target}`}.`)}">
        <span class="rtpp-seal-badge">${prog}${icon(b.icon, 22)}</span>
        <span class="rtpp-seal-title">${esc(b.title)}</span>
        <span class="rtpp-seal-meta">${meta}</span>
        ${b.fresh ? '<span class="rtpp-seal-new">New</span>' : ""}
      </li>`;
  }
  function badgesHtml(m) {
    return `
      <section class="rtpp-card" data-testid="profile-badges">
        <header class="rtpp-card-head"><h3>Milestones</h3><span class="rtpp-card-sub">${m.earned} of ${m.badges.length} earned</span></header>
        <ul class="rtpp-seals" role="list">${m.badges.map(sealHtml).join("")}</ul>
      </section>`;
  }
  function monthHtml(m) {
    const head = `<header class="rtpp-card-head"><h3>Your month</h3><span class="rtpp-card-sub">Made on request · stays on this screen</span></header>`;
    if (!page || !page.month) {
      return `
        <section class="rtpp-card rtpp-month" data-testid="profile-month">
          ${head}
          <div class="rtpp-month-ask"><p>A short recap of this month's work. Nothing is shared or saved.</p>
          <button type="button" class="rtpp-btn" data-act="month" data-testid="profile-month-show">${icon("spark", 14)}<span>Show my month</span></button></div>
        </section>`;
    }
    const x = buildMonth(m);
    const cards = [
      { k: "Mostly", v: x.top ? x.top.label : "—", s: x.top ? `${fmtInt(x.top.n)} · ${pct((x.top.n / x.total) * 100)}` : "Nothing yet", tip: "The work type with the most activities this month." },
      { k: "Busiest day", v: x.busiest ? fmtDate(x.busiest.t) : "—", s: x.busiest ? plural(x.busiest.n, "activity", "activities") : "", tip: "The day with the most activities this month." },
      { k: "Active days", v: fmtInt(x.activeDays), s: `of ${x.days} so far`, tip: "Days this month with at least one activity." },
      { k: "Milestones", v: fmtInt(x.badges.length), s: x.badges.length ? x.badges.map((b) => b.title).join(", ") : "None this month", tip: "Milestones earned this month." },
    ];
    return `
      <section class="rtpp-card rtpp-month" data-testid="profile-month">
        ${head}
        <div class="rtpp-wrap" data-testid="profile-month-card">
          <div class="rtpp-wrap-kicker">${esc(x.label)}</div>
          <div class="rtpp-wrap-hero" tabindex="0" data-tip="Agent runs started, chats created, comment tasks and canvas edits this month."><strong>${fmtInt(x.total)}</strong><span>${x.total === 1 ? "thing" : "things"} done this month</span></div>
          <div class="rtpp-wrap-grid">
            ${cards.map((c) => `<div tabindex="0" data-tip="${esc(c.tip)}"><span>${esc(c.k)}</span><strong>${esc(c.v)}</strong><small>${esc(c.s)}</small></div>`).join("")}
          </div>
          <button type="button" class="rtpp-btn rtpp-btn--ghost rtpp-wrap-hide" data-act="month-hide">Hide</button>
        </div>
      </section>`;
  }
  function emptyHtml() {
    const ghost = Array.from({ length: WEEKS_MIN * 7 }, (_, i) => `<span class="rtpp-cell" data-l="${[17, 30, 46, 47, 61, 75].includes(i) ? (i % 3) + 1 : 0}"></span>`).join("");
    return `
      <section class="rtpp-card rtpp-empty" data-testid="profile-empty">
        <div class="rtpp-empty-art" aria-hidden="true"><div class="rtpp-heat-grid">${ghost}</div></div>
        <div class="rtpp-empty-text">
          <h3>Your profile fills in as you work</h3>
          <p>Stats, activity and milestones come from your chats, agent runs, comment tasks and canvases. Nothing has landed here yet.</p>
          <ul class="rtpp-empty-hints">
            <li>${icon("chat", 14)}Start a chat in any workspace</li>
            <li>${icon("bot", 14)}Run an agent from Agents</li>
            <li>${icon("pin", 14)}Comment on a canvas to hand the change to an agent</li>
          </ul>
        </div>
      </section>`;
  }
  function errorHtml(text) {
    return `
      <section class="rtpp-card rtpp-error" role="alert" data-testid="profile-error">
        <span class="rtpp-error-icon">${icon("alert", 20)}</span>
        <div><h3>Couldn't load your activity</h3><p>${esc(text)}</p></div>
        <button type="button" class="rtpp-btn" data-act="retry">${icon("refresh", 14)}<span>Try again</span></button>
      </section>`;
  }
  function skeletonHtml() {
    const tile = `<div class="rtpp-tile"><span class="rtpp-skel rtpp-skel--line" style="width:60%"></span><span class="rtpp-skel rtpp-skel--num"></span><span class="rtpp-skel rtpp-skel--line" style="width:80%"></span></div>`;
    return `<section class="rtpp-card rtpp-level-card" aria-hidden="true"><span class="rtpp-skel rtpp-skel--ring"></span><div class="rtpp-level-side"><span class="rtpp-skel rtpp-skel--line" style="width:40%"></span><span class="rtpp-skel rtpp-skel--line" style="width:70%"></span></div></section><section class="rtpp-tiles" aria-hidden="true">${tile.repeat(4)}</section><section class="rtpp-card" aria-hidden="true"><span class="rtpp-skel rtpp-skel--block"></span></section><span class="rtpp-sr" role="status">Loading your profile…</span>`;
  }
  function renderHead() {
    if (!page) return;
    const statusEl = page.head.querySelector(".rtpp-status");
    const keep = statusEl ? statusEl.innerHTML : "";
    page.head.innerHTML = headHtml();
    const st = page.head.querySelector(".rtpp-status");
    if (st && keep) st.innerHTML = keep;
  }
  function renderHeat() {
    if (!page || !model) return;
    const slot = page.body.querySelector(".rtpp-heat-slot");
    if (!slot) return;
    const weeks = heatWeeks();
    page.weeks = weeks;
    page.heat = buildHeat(model.events, weeks);
    slot.innerHTML = heatHtml(page.heat);
  }
  function renderBody() {
    if (!page) return;
    const b = page.body;
    hideTip();
    b.setAttribute("aria-busy", loading && !model ? "true" : "false");
    let html;
    if (!model) html = loading || !loadError ? skeletonHtml() : errorHtml(loadError);
    else if (model.allFailed) html = errorHtml(model.error);
    else if (model.empty) html = levelHtml(model) + emptyHtml() + badgesHtml(model);
    else html = levelHtml(model) + tilesHtml(model) + '<div class="rtpp-heat-slot"></div>' + mixHtml(model) + badgesHtml(model) + monthHtml(model);
    b.innerHTML = html;
    b.querySelectorAll(":scope > *").forEach((el, i) => el.style.setProperty("--i", String(i)));
    renderHeat();
    const fg = b.querySelector(".rtpp-ring-fg");
    if (fg && !page.ringDrawn) {
      page.ringDrawn = true;
      const p = +fg.dataset.p || 0;
      requestAnimationFrame(() => requestAnimationFrame(() => fg.setAttribute("stroke-dashoffset", (RING_C * (1 - p)).toFixed(2))));
    }
    if (model && !model.allFailed) {
      const fresh = model.badges.filter((x) => x.fresh);
      if (fresh.length) flash(`New milestone: ${fresh.map((x) => esc(x.title)).join(", ")}.`, 6000);
      markMilestonesSeen(model);
      model.badges.forEach((x) => (x.fresh = false)); // the highlight plays once
    }
    page.root.querySelector('[data-act="refresh"]').toggleAttribute("data-busy", !!loading);
    page.updated.textContent = lastLoadAt ? `Updated ${ago(lastLoadAt)}` : "";
  }
  function renderAll() {
    renderHead();
    renderBody();
  }
  function flash(html, ms = 5000) {
    const st = page && page.head.querySelector(".rtpp-status");
    if (!st) return;
    st.innerHTML = html;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      const s = page && page.head.querySelector(".rtpp-status");
      if (s) s.innerHTML = "";
    }, ms);
  }
  function refreshData(force) {
    if (!force && model && now() - lastLoadAt < CACHE_MS) {
      renderAll();
      return Promise.resolve(model);
    }
    if (!loading) {
      loadError = null;
      loading = collect()
        .then((r) => {
          raw = r;
          lastLoadAt = now();
          model = buildModel(r);
        })
        .catch((e) => {
          loadError = errText(e);
        })
        .finally(() => {
          loading = null;
          renderAll();
        });
      if (page) renderBody();
    }
    return loading.then(() => model);
  }
  function subscribeTasks() {
    const api = window.__RE_TEMPO_COMMENT_AGENT__;
    if (!api || typeof api.subscribe !== "function") return null;
    try {
      return api.subscribe(() => {
        if (!raw || !page) return;
        raw.tasks = loadTasks();
        model = buildModel(raw);
        renderBody();
      });
    } catch (_) {
      return null;
    }
  }
  function mountPage(container) {
    container.classList.add("rtpp-root");
    container.setAttribute("data-rtpp-root", "");
    container.setAttribute("data-testid", "profile-page");
    container.innerHTML = `
      <div class="rtpp-page">
        <div class="rtpp-top">
          <h2 class="text-[17px] font-medium text-[var(--color-text-primary)]">Profile</h2>
          <span class="rtpp-updated"></span>
          <button type="button" class="rtpp-icon-btn" data-act="refresh" aria-label="Refresh" data-tip="Read your data again">${icon("refresh", 15)}</button>
        </div>
        <div class="rtpp-head-slot"></div>
        <div class="rtpp-body"></div>
        <p class="rtpp-foot">Private and read-only: built from this account's chats, agent runs, comment tasks and canvases, and shown only to you. Your photo is stored on this Mac only.</p>
      </div>
      <div class="rtpp-tip" role="tooltip" hidden></div>`;
    page = {
      root: container,
      head: container.querySelector(".rtpp-head-slot"),
      body: container.querySelector(".rtpp-body"),
      updated: container.querySelector(".rtpp-updated"),
      tip: container.querySelector(".rtpp-tip"),
      ringDrawn: false,
      unsub: null,
      ro: null,
      weeks: 0,
      heat: null,
      month: false,
      undo: null,
    };
    container.addEventListener("click", onPageClick);
    container.addEventListener("pointerover", onTipOver);
    container.addEventListener("pointerout", onTipOut);
    container.addEventListener("focusin", onTipOver);
    container.addEventListener("focusout", onTipOut);
    container.addEventListener("dragover", onPageDragOver);
    container.addEventListener("dragleave", onPageDragLeave);
    container.addEventListener("drop", onPageDrop);
    if (typeof ResizeObserver === "function") {
      page.ro = new ResizeObserver(() => {
        if (page && model && heatWeeks() !== page.weeks) renderHeat();
      });
      page.ro.observe(container);
    }
    page.unsub = subscribeTasks();
    renderAll();
    refreshData(false);
    return unmountPage;
  }
  function unmountPage() {
    if (!page) return;
    try {
      if (typeof page.unsub === "function") page.unsub();
    } catch (_) {
      /* the comment agent went away */
    }
    if (page.ro) page.ro.disconnect();
    page = null;
  }
  async function onPageClick(e) {
    const b = e.target.closest("[data-act]");
    if (!b || !page || !page.root.contains(b)) return;
    const act = b.dataset.act;
    if (act === "photo") openEditor(null, b);
    else if (act === "refresh" || act === "retry") refreshData(true);
    else if (act === "month" || act === "month-hide") {
      page.month = act === "month";
      const sec = page.body.querySelector('[data-testid="profile-month"]');
      if (sec && model) {
        sec.outerHTML = monthHtml(model);
        const btn = page.body.querySelector(act === "month" ? '[data-act="month-hide"]' : '[data-act="month"]');
        if (btn) btn.focus({ preventScroll: true });
      }
    } else if (act === "remove-photo") {
      try {
        const prev = await clearPhoto();
        if (page) page.undo = prev;
        flash(`Photo removed. <button type="button" class="rtpp-link" data-act="undo-photo">Undo</button>`, 8000);
      } catch (err) {
        flash(`Couldn't remove the photo: ${esc(errText(err))}`);
      }
    } else if (act === "undo-photo") {
      const prev = page && page.undo;
      if (prev && prev.dataUrl) {
        try {
          await savePhoto(prev.dataUrl, prev.dataUrl512);
          flash("Photo restored.");
        } catch (err) {
          flash(`Couldn't restore the photo: ${esc(errText(err))}`);
        }
      }
    }
  }
  // One tooltip for every number: data-tip text, or a heatmap day.
  function tipTarget(el) {
    return el && el.closest ? el.closest("[data-tip], .rtpp-heat-grid .rtpp-cell[data-i]") : null;
  }
  function hideTip() {
    if (page) page.tip.hidden = true;
  }
  function onTipOver(e) {
    if (!page) return;
    const t = tipTarget(e.target);
    if (!t || !page.root.contains(t)) return;
    if (e.type === "focusin" && !t.matches(":focus-visible")) return; // keyboard focus only, not focus restored after a click
    let html;
    if (t.matches(".rtpp-cell[data-i]")) {
      const c = page.heat && page.heat.cells[+t.dataset.i];
      if (!c || c.future) return hideTip();
      const lines = c.c ? KINDS.filter((k) => c.c[k.id]).map((k) => `<li><span class="rtpp-dot" data-k="${k.id}"></span><span class="rtpp-tip-k">${esc(k.label)}</span><span>${c.c[k.id]}</span></li>`) : [];
      html = `<strong>${c.n ? plural(c.n, "activity", "activities") : "No activity"}</strong><span class="rtpp-tip-d">${esc(fmtDay(c.t))}</span>${lines.length ? `<ul>${lines.join("")}</ul>` : ""}`;
    } else {
      html = esc(t.dataset.tip).replace(/\n/g, "<br>");
    }
    page.tip.innerHTML = html;
    page.tip.hidden = false;
    const r = t.getBoundingClientRect();
    const tr = page.tip.getBoundingClientRect();
    const x = Math.max(8, Math.min(window.innerWidth - tr.width - 8, r.left + r.width / 2 - tr.width / 2));
    const y = r.top - tr.height - 8 < 8 ? r.bottom + 8 : r.top - tr.height - 8;
    page.tip.style.left = `${x}px`;
    page.tip.style.top = `${y}px`;
  }
  function onTipOut(e) {
    const t = tipTarget(e.target);
    if (t && !(e.relatedTarget && t.contains(e.relatedTarget))) hideTip();
  }
  const hasFiles = (e) => !!(e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files"));
  function onPageDragOver(e) {
    if (!hasFiles(e) || !e.target.closest(".rtpp-head")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    page.root.querySelector(".rtpp-head").setAttribute("data-over", "");
  }
  function onPageDragLeave(e) {
    const head = page && page.root.querySelector(".rtpp-head");
    if (head && !(e.relatedTarget && head.contains(e.relatedTarget))) head.removeAttribute("data-over");
  }
  function onPageDrop(e) {
    const head = page && page.root.querySelector(".rtpp-head");
    if (!head || !hasFiles(e) || !e.target.closest(".rtpp-head")) return;
    e.preventDefault();
    head.removeAttribute("data-over");
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) openEditor(f, head.querySelector(".rtpp-av-btn"));
  }

  // ------------------------------------------------------------- the editor
  let editor = null;
  async function decodeImage(file) {
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch (_) {
        /* try the <img> path */
      }
    }
    const url = URL.createObjectURL(file);
    try {
      const im = new Image();
      im.src = url;
      await im.decode();
      return im;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  function openEditor(file, opener) {
    if (!PROFILE_ON) return null;
    if (editor) {
      if (file) editor.load(file);
      return editor;
    }
    const returnTo = opener || document.activeElement;
    const dlg = document.createElement("dialog");
    dlg.className = "rtpp-dialog";
    dlg.setAttribute("data-rtpp-dialog", "");
    dlg.setAttribute("aria-labelledby", "rtpp-dlg-title");
    dlg.setAttribute("data-testid", "profile-photo-dialog");
    dlg.dataset.state = "empty";
    const current = photo
      ? `<img src="${esc(photo.dataUrl)}" alt="" draggable="false">`
      : `<span class="rtpp-av-ini" style="background:${esc(ident.color)};color:${inkOn(ident.color)}">${esc(ident.initials)}</span>`;
    dlg.innerHTML = `
      <div class="rtpp-dlg">
        <header class="rtpp-dlg-head">
          <h3 id="rtpp-dlg-title">Profile photo</h3>
          <button type="button" class="rtpp-icon-btn" data-dlg="cancel" aria-label="Close">${icon("x", 16)}</button>
        </header>
        <div class="rtpp-dlg-body">
          <div class="rtpp-stage">
            <canvas class="rtpp-crop" tabindex="0" role="img" aria-label="Crop area. Drag or use the arrow keys to move the photo, plus and minus to zoom, 0 to reset." data-testid="profile-crop"></canvas>
            <div class="rtpp-drop">
              <span class="rtpp-drop-current">${current}</span>
              <strong>Drag a photo here</strong>
              <span class="rtpp-drop-or">or paste one, or</span>
              <button type="button" class="rtpp-btn rtpp-btn--primary" data-dlg="choose" data-testid="profile-choose">Choose a file…</button>
              <small>PNG, JPEG or WebP · up to 5 MB</small>
            </div>
            <div class="rtpp-drop-over" aria-hidden="true"><span>${icon("image", 22)}Drop to use this photo</span></div>
          </div>
          <div class="rtpp-zoom">
            <button type="button" class="rtpp-icon-btn" data-dlg="zoom-out" aria-label="Zoom out" disabled>${icon("minus", 14)}</button>
            <input type="range" min="1" max="${ZOOM_MAX}" step="0.01" value="1" aria-label="Zoom" disabled data-testid="profile-zoom">
            <button type="button" class="rtpp-icon-btn" data-dlg="zoom-in" aria-label="Zoom in" disabled>${icon("plus", 14)}</button>
          </div>
          <div class="rtpp-prevs" aria-hidden="true">
            <figure><canvas data-size="64"></canvas><figcaption>Profile</figcaption></figure>
            <figure><canvas data-size="32"></canvas><figcaption>Comments</figcaption></figure>
            <figure><canvas data-size="24"></canvas><figcaption>Rail</figcaption></figure>
          </div>
          <p class="rtpp-dlg-err" role="alert" data-testid="profile-photo-error"></p>
          <p class="rtpp-dlg-note">${icon("lock", 12)}Saved on this Mac only. Tempo has no shared profile photos yet, so your team still sees your initials.</p>
        </div>
        <footer class="rtpp-dlg-foot">
          ${photo ? `<button type="button" class="rtpp-btn rtpp-btn--ghost rtpp-btn--danger" data-dlg="remove">Remove photo</button>` : ""}
          <span class="rtpp-grow"></span>
          <button type="button" class="rtpp-btn" data-dlg="choose" data-when="crop">Choose another…</button>
          <button type="button" class="rtpp-btn rtpp-btn--ghost" data-dlg="cancel">Cancel</button>
          <button type="button" class="rtpp-btn rtpp-btn--primary" data-dlg="save" disabled data-testid="profile-save">Save</button>
        </footer>
        <input type="file" accept="${PHOTO_TYPES.join(",")}" hidden data-testid="profile-file">
      </div>`;
    document.body.appendChild(dlg);
    const $ = (s) => dlg.querySelector(s);
    const cv = $(".rtpp-crop");
    const ctx = cv.getContext("2d");
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    cv.width = cv.height = Math.round(STAGE * dpr);
    const previews = [...dlg.querySelectorAll(".rtpp-prevs canvas")].map((c) => {
      const s = +c.dataset.size;
      c.width = c.height = Math.round(s * dpr);
      c.style.width = c.style.height = `${s}px`;
      return { c, px: Math.round(s * dpr), ctx: c.getContext("2d") };
    });
    const zoom = $(".rtpp-zoom input");
    const zoomBtns = dlg.querySelectorAll('[data-dlg="zoom-in"], [data-dlg="zoom-out"]');
    const saveBtn = $('[data-dlg="save"]');
    const errEl = $(".rtpp-dlg-err");
    const input = $('input[type="file"]');
    const st = { img: null, w: 0, h: 0, zoom: 1, ox: 0, oy: 0, drag: null, busy: false, closed: false };

    const base = () => Math.max(CIRCLE / st.w, CIRCLE / st.h);
    const scale = () => base() * st.zoom;
    const setErr = (t) => (errEl.textContent = t || "");
    function clamp() {
      const s = scale();
      const mx = Math.max(0, (st.w * s - CIRCLE) / 2);
      const my = Math.max(0, (st.h * s - CIRCLE) / 2);
      st.ox = Math.min(mx, Math.max(-mx, st.ox));
      st.oy = Math.min(my, Math.max(-my, st.oy));
    }
    function srcRect() {
      const s = scale();
      return { sx: st.w / 2 - (CIRCLE / 2 + st.ox) / s, sy: st.h / 2 - (CIRCLE / 2 + st.oy) / s, size: CIRCLE / s };
    }
    function drawCrop(c, px, round) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, px, px);
      if (!st.img) return;
      c.save();
      if (round) {
        c.beginPath();
        c.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2);
        c.clip();
      }
      const r = srcRect();
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "high";
      c.drawImage(st.img, r.sx, r.sy, r.size, r.size, 0, 0, px, px);
      c.restore();
    }
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, STAGE, STAGE);
      if (st.img) {
        const s = scale();
        const dw = st.w * s;
        const dh = st.h * s;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(st.img, STAGE / 2 + st.ox - dw / 2, STAGE / 2 + st.oy - dh / 2, dw, dh);
        ctx.beginPath();
        ctx.rect(0, 0, STAGE, STAGE);
        ctx.moveTo(STAGE / 2 + CIRCLE / 2, STAGE / 2);
        ctx.arc(STAGE / 2, STAGE / 2, CIRCLE / 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
        ctx.fill("evenodd");
        ctx.beginPath();
        ctx.arc(STAGE / 2, STAGE / 2, CIRCLE / 2 - 0.75, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      for (const p of previews) drawCrop(p.ctx, p.px, true);
      zoom.value = String(st.zoom);
      zoom.setAttribute("aria-valuetext", `${Math.round(st.zoom * 100)}%`);
    }
    function zoomTo(z, ax = STAGE / 2, ay = STAGE / 2) {
      if (!st.img) return;
      const s0 = scale();
      st.zoom = Math.min(ZOOM_MAX, Math.max(1, z));
      const s1 = scale();
      const px = ax - STAGE / 2;
      const py = ay - STAGE / 2;
      st.ox = px - ((px - st.ox) * s1) / s0;
      st.oy = py - ((py - st.oy) * s1) / s0;
      clamp();
      draw();
    }
    const toStage = (e) => {
      const r = cv.getBoundingClientRect();
      return [((e.clientX - r.left) * STAGE) / r.width, ((e.clientY - r.top) * STAGE) / r.height];
    };
    async function load(f) {
      setErr("");
      if (!f) return;
      if (!PHOTO_TYPES.includes(f.type)) return setErr("Use a PNG, JPEG or WebP image.");
      if (f.size > PHOTO_MAX_BYTES) return setErr(`This image is ${(f.size / 1048576).toFixed(1)} MB. The limit is 5 MB.`);
      let img;
      try {
        img = await decodeImage(f);
      } catch (_) {
        return setErr("Couldn't read this image. Try another PNG, JPEG or WebP file.");
      }
      if (st.closed) return img.close && img.close();
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h || Math.min(w, h) < PHOTO_MIN_PX) {
        if (img.close) img.close();
        return setErr(`This image is ${w} × ${h} px. Use one at least ${PHOTO_MIN_PX} px on each side.`);
      }
      if (st.img && st.img.close) st.img.close();
      Object.assign(st, { img, w, h, zoom: 1, ox: 0, oy: 0 });
      dlg.dataset.state = "crop";
      saveBtn.disabled = false;
      zoom.disabled = false;
      zoomBtns.forEach((b) => (b.disabled = false));
      draw();
      cv.focus({ preventScroll: true });
    }
    const encode = (c) => {
      const url = c.toDataURL("image/webp", 0.9);
      return url.startsWith("data:image/webp") ? url : c.toDataURL("image/png");
    };
    async function save() {
      if (!st.img || st.busy) return;
      st.busy = true;
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";
      try {
        // 512 px export from the source, then 256 px for the UI from the 512 one
        const big = document.createElement("canvas");
        big.width = big.height = PHOTO_EXPORT;
        drawCrop(big.getContext("2d"), PHOTO_EXPORT, false);
        const small = document.createElement("canvas");
        small.width = small.height = PHOTO_UI;
        const sc = small.getContext("2d");
        sc.imageSmoothingEnabled = true;
        sc.imageSmoothingQuality = "high";
        sc.drawImage(big, 0, 0, PHOTO_UI, PHOTO_UI);
        await savePhoto(encode(small), encode(big));
        close();
        flash("Profile photo updated.");
      } catch (e) {
        setErr(`Couldn't save the photo: ${errText(e)}`);
        st.busy = false;
        saveBtn.disabled = false;
        saveBtn.textContent = "Save";
      }
    }
    function close() {
      if (st.closed) return;
      st.closed = true;
      if (st.img && st.img.close) st.img.close();
      try {
        if (dlg.open) dlg.close();
      } catch (_) {
        /* already closed */
      }
      dlg.remove();
      editor = null;
      if (returnTo && returnTo.isConnected && typeof returnTo.focus === "function") returnTo.focus({ preventScroll: true });
      else if (page) {
        const b = page.root.querySelector(".rtpp-av-btn");
        if (b) b.focus({ preventScroll: true });
      }
    }

    dlg.addEventListener("click", async (e) => {
      if (e.target === dlg) return close(); // the backdrop
      const b = e.target.closest("[data-dlg]");
      if (!b || b.disabled) return;
      const a = b.dataset.dlg;
      if (a === "cancel") close();
      else if (a === "choose") input.click();
      else if (a === "save") save();
      else if (a === "zoom-in") zoomTo(st.zoom * 1.15);
      else if (a === "zoom-out") zoomTo(st.zoom / 1.15);
      else if (a === "remove") {
        try {
          const prev = await clearPhoto();
          close();
          if (page) page.undo = prev;
          flash(`Photo removed. <button type="button" class="rtpp-link" data-act="undo-photo">Undo</button>`, 8000);
        } catch (err) {
          setErr(`Couldn't remove the photo: ${errText(err)}`);
        }
      }
    });
    dlg.addEventListener("cancel", (e) => {
      e.preventDefault();
      close();
    });
    input.addEventListener("change", () => {
      const f = input.files && input.files[0];
      input.value = "";
      if (f) load(f);
    });
    zoom.addEventListener("input", () => zoomTo(+zoom.value));
    cv.addEventListener("pointerdown", (e) => {
      if (!st.img || e.button !== 0) return;
      cv.setPointerCapture(e.pointerId);
      const [x, y] = toStage(e);
      st.drag = { x, y, ox: st.ox, oy: st.oy };
      cv.setAttribute("data-dragging", "");
    });
    cv.addEventListener("pointermove", (e) => {
      if (!st.drag) return;
      const [x, y] = toStage(e);
      st.ox = st.drag.ox + (x - st.drag.x);
      st.oy = st.drag.oy + (y - st.drag.y);
      clamp();
      draw();
    });
    const endDrag = () => {
      st.drag = null;
      cv.removeAttribute("data-dragging");
    };
    cv.addEventListener("pointerup", endDrag);
    cv.addEventListener("pointercancel", endDrag);
    cv.addEventListener(
      "wheel",
      (e) => {
        if (!st.img) return;
        e.preventDefault();
        const [x, y] = toStage(e);
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        zoomTo(st.zoom * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)), x, y);
      },
      { passive: false }
    );
    cv.addEventListener("dblclick", () => {
      if (!st.img) return;
      Object.assign(st, { zoom: 1, ox: 0, oy: 0 });
      draw();
    });
    cv.addEventListener("keydown", (e) => {
      if (!st.img) return;
      const step = e.shiftKey ? 32 : 8;
      const k = e.key;
      if (k === "ArrowLeft") st.ox -= step;
      else if (k === "ArrowRight") st.ox += step;
      else if (k === "ArrowUp") st.oy -= step;
      else if (k === "ArrowDown") st.oy += step;
      else if (k === "+" || k === "=") return e.preventDefault(), zoomTo(st.zoom * 1.1);
      else if (k === "-" || k === "_") return e.preventDefault(), zoomTo(st.zoom / 1.1);
      else if (k === "0") Object.assign(st, { zoom: 1, ox: 0, oy: 0 });
      else if (k === "Enter") return e.preventDefault(), save();
      else return;
      e.preventDefault();
      clamp();
      draw();
    });
    dlg.addEventListener("dragover", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      dlg.setAttribute("data-over", "");
    });
    dlg.addEventListener("dragleave", (e) => {
      if (!(e.relatedTarget && dlg.contains(e.relatedTarget))) dlg.removeAttribute("data-over");
    });
    dlg.addEventListener("drop", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dlg.removeAttribute("data-over");
      load(e.dataTransfer.files[0]);
    });
    dlg.addEventListener("paste", (e) => {
      const f = e.clipboardData && [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
      if (!f) return;
      e.preventDefault();
      load(f);
    });

    dlg.showModal();
    draw();
    const first = $('[data-dlg="choose"]');
    if (first && !file) first.focus({ preventScroll: true });
    editor = { dlg, load, close, save, zoomTo, state: () => ({ ...st, img: !!st.img }) };
    if (file) load(file);
    return editor;
  }

  // -------------------------------------------------------------- user menu
  function syncUserMenu() {
    if (!PROFILE_ON) return;
    for (const menu of document.querySelectorAll('[role="menu"]')) {
      if (menu.id === "rtrm-menu" || menu.querySelector(".rtpp-menu-item")) continue;
      const signOut = [...menu.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent.trim() === "Sign Out");
      if (!signOut) continue;
      const it = document.createElement("div");
      it.className = `${signOut.className} rtpp-menu-item`;
      it.setAttribute("role", "menuitem");
      it.tabIndex = -1;
      it.dataset.testid = "user-menu-profile";
      it.textContent = "Profile";
      it.addEventListener("pointerenter", () => {
        menu.querySelectorAll("[data-highlighted]").forEach((x) => x !== it && x.removeAttribute("data-highlighted"));
        it.setAttribute("data-highlighted", "");
      });
      it.addEventListener("pointerleave", () => it.removeAttribute("data-highlighted"));
      it.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
        setTimeout(() => openSection("profile"), 0);
      });
      signOut.before(it);
    }
  }

  // ------------------------------------------------------------------- boot
  // No observer on the whole document. What is watched, and why:
  //   - document.body, direct children only: the portals the user menu opens in;
  //   - the Settings screen (subtree), only while it is mounted: React swapping
  //     the native section or the nav while one of ours is open;
  //   - the rail's [aria-label="User menu"] (subtree): React re-rendering the
  //     avatar that carries the photo;
  //   - every canvas comment pin layer (subtree): pins of new threads and
  //     participants joining a thread;
  //   - the comment popover, comment-bubbles' hub, panels and popovers (UI_SCOPE,
  //     subtree, top-most only): rows and avatars they (re)create.
  // Every observer runs the fast path first (decorateWithin on the added nodes,
  // in the observer's microtask, so a new avatar is never painted with the
  // initials), then schedules the full pass. Screens mounting elsewhere
  // (Settings opening, a panel opening) are picked up by a pass in the next
  // animation frame after a click, a short burst of passes after a click or a
  // shortcut, plus a pass every PERIOD_MS. Everything stops while the window is
  // hidden (document.hidden) and resumes, with one pass, when it shows again.
  const PERIOD_MS = 2000;
  const BURST_MS = [60, 250, 700];
  let disposed = false;
  let paused = true;
  let timer = 0;
  let lastTick = 0;
  let interval = 0;
  let frame = 0;
  const bursts = new Set();
  const watched = { shell: null, rail: null, pins: [], ui: [] };
  const listeners = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    listeners.push([target, type, fn, opts]);
  };
  function tick() {
    timer = 0;
    if (disposed || paused) return;
    lastTick = now();
    if (PROFILE_ON) syncIdentity();
    syncSettings();
    syncUserMenu();
    if (PROFILE_ON) applyPhotos();
    if (PROFILE_ON) applyPins();
    if (page && lastLoadAt) page.updated.textContent = `Updated ${ago(lastLoadAt)}`;
    watchTargets();
  }
  function schedule() {
    if (timer || disposed || paused) return;
    timer = setTimeout(tick, Math.max(0, TICK_MS - (now() - lastTick)));
  }
  const OWN_CLS = ["rtpp-photo", "rtpp-pin-cl", "rtpp-pv"];
  const ownNode = (n) => n.nodeType === 1 && n.classList && (OWN_CLS.some((c) => n.classList.contains(c)) || n.hasAttribute("data-rtset-host"));
  function onMutations(list) {
    let dirty = false;
    for (const r of list) {
      if (r.target.closest && r.target.closest(`${SKIP}, .rtpp-pv, .rtpp-pin-cl`)) continue; // our sections, the editor, our pin parts
      for (const n of r.addedNodes) {
        if (ownNode(n)) continue;
        dirty = true;
        if (PROFILE_ON && n.nodeType === 1) decorateWithin(n);
      }
      if (!dirty && [...r.removedNodes].some((n) => !ownNode(n))) dirty = true;
    }
    if (dirty) schedule();
  }
  const bodyMo = new MutationObserver(onMutations);
  const shellMo = new MutationObserver(onMutations);
  const railMo = new MutationObserver(onMutations);
  const pinMo = new MutationObserver(onMutations); // canvas comment pin layers
  const uiMo = new MutationObserver(onMutations); // comment popover, comment-bubbles
  const sameList = (a, b) => a.length === b.length && a.every((n, i) => n === b[i]);
  function watchTargets() {
    if (paused || disposed) return;
    const p = settingsParts();
    const shell = p ? p.side.parentElement : null;
    if (shell !== watched.shell) {
      shellMo.disconnect();
      watched.shell = shell;
      if (shell) shellMo.observe(shell, { childList: true, subtree: true });
    }
    const rail = PROFILE_ON ? railButton() : null;
    if (rail !== watched.rail) {
      railMo.disconnect();
      watched.rail = rail;
      if (rail) railMo.observe(rail, { childList: true, subtree: true });
    }
    const layers = PROFILE_ON ? [...document.querySelectorAll('[data-testid="canvas-comment-pin-layer"]')] : [];
    if (!sameList(layers, watched.pins)) {
      pinMo.disconnect();
      watched.pins = layers;
      for (const l of layers) pinMo.observe(l, { childList: true, subtree: true });
    }
    const ui = PROFILE_ON ? [...document.querySelectorAll(UI_SCOPE)].filter((n) => !(n.parentElement && n.parentElement.closest(UI_SCOPE))) : [];
    if (!sameList(ui, watched.ui)) {
      uiMo.disconnect();
      watched.ui = ui;
      for (const n of ui) uiMo.observe(n, { childList: true, subtree: true });
    }
  }
  // One pass in the next animation frame: what a click or a shortcut just opened
  // (a panel, the comment popover) has the photo before it is first painted.
  function nextFrame() {
    if (frame || paused || disposed) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (paused || disposed) return;
      if (PROFILE_ON) applyPhotos();
      if (PROFILE_ON) applyPins();
      watchTargets();
    });
  }
  function burst(e) {
    if (paused || disposed) return;
    if (e && e.type === "keydown" && !(e.metaKey || e.ctrlKey || e.key === "Escape" || e.key === "Enter")) return;
    if (e && e.type !== "pointerdown") nextFrame(); // click / shortcut: the UI it opens renders now
    if (e && e.type === "click") return; // its pointerdown started the burst
    for (const ms of BURST_MS) {
      const id = setTimeout(() => {
        bursts.delete(id);
        schedule();
      }, ms);
      bursts.add(id);
    }
  }
  function pause() {
    if (paused) return;
    paused = true;
    clearInterval(interval);
    interval = 0;
    clearTimeout(timer);
    timer = 0;
    bursts.forEach(clearTimeout);
    bursts.clear();
    cancelAnimationFrame(frame);
    frame = 0;
    bodyMo.disconnect();
    shellMo.disconnect();
    railMo.disconnect();
    pinMo.disconnect();
    uiMo.disconnect();
    watched.shell = watched.rail = null;
    watched.pins = [];
    watched.ui = [];
  }
  function resume() {
    if (!paused || disposed || document.hidden) return;
    paused = false;
    bodyMo.observe(document.body, { childList: true });
    interval = setInterval(schedule, PERIOD_MS);
    tick();
  }
  const onVisibility = () => (document.hidden ? pause() : resume());
  function boot() {
    if (disposed) return;
    on(document, "visibilitychange", onVisibility);
    on(window, "pointerdown", burst, true);
    on(window, "click", burst, true);
    on(window, "keydown", burst, true);
    if (PROFILE_ON) {
      on(document, "pointerover", onPinOver, true);
      on(window, "rtcc:changed", onAgentChanged);
      askBridge();
      loadPhoto();
    }
    resume();
  }
  if (PROFILE_ON) {
    addSection({ id: "profile", label: "Profile", order: -1000, render: mountPage }, "personal");
  }
  // sections registered with the previous copy of this script (live reload)
  for (const d of carried) {
    try {
      registerSection(d);
    } catch (_) {
      /* a carried section that no longer validates */
    }
  }
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot, { once: true });

  function dispose() {
    if (disposed) return;
    pause();
    disposed = true;
    for (const [target, type, fn, opts] of listeners) target.removeEventListener(type, fn, opts);
    listeners.length = 0;
    clearTimeout(statusTimer);
    document.removeEventListener("DOMContentLoaded", boot);
    if (editor) editor.close();
    activeId = null;
    unmountSection();
    document.querySelectorAll("[data-rtset-hidden]").forEach((el) => el.removeAttribute("data-rtset-hidden"));
    document.querySelectorAll("[data-rtset-off]").forEach((el) => el.removeAttribute("data-rtset-off"));
    document.querySelectorAll("[data-rtset-group], .rtset-nav, .rtpp-menu-item").forEach((el) => el.remove());
    document.querySelectorAll(`[${DECOR}]`).forEach(undecorate);
    document.querySelectorAll(".rtpp-pin-cl, .rtpp-pv").forEach((n) => n.remove());
    document.querySelectorAll("[data-rtpp-pv]").forEach((n) => n.removeAttribute("data-rtpp-pv"));
    for (const n of document.querySelectorAll("[data-rtpp-pinx]")) {
      n.removeAttribute("data-rtpp-pinx");
      n.style.removeProperty("--rtpp-pin-w");
      n.style.removeProperty("--rtpp-pin-pl");
    }
    threadCache.clear();
    for (const side of document.querySelectorAll("div.w-60")) {
      if (side.__rtsetHooked) {
        side.removeEventListener("click", onSideClick, true);
        delete side.__rtsetHooked;
      }
    }
    try {
      if (channel) channel.close();
    } catch (_) {
      /* closed */
    }
    if (cssLink) cssLink.remove();
    if (window.__RE_TEMPO_PROFILE__ === api) delete window.__RE_TEMPO_PROFILE__;
    if (window.__RE_TEMPO_SETTINGS__ === settingsApi) delete window.__RE_TEMPO_SETTINGS__;
  }

  const api = PROFILE_ON
    ? {
        enabled: true,
        flag: FLAG_KEY,
        state: () => ({
          enabled: true,
          open: activeId === "profile",
          section: activeId,
          mounted: !!(page && page.root.isConnected),
          settings: !!settingsParts(),
          loading: !!loading,
          lastLoadAt,
          loadError,
          convexVia,
          identity: { ...ident },
          photo: photo ? { key: photo.key, bytes: photo.dataUrl.length, bytes512: photo.dataUrl512 ? photo.dataUrl512.length : 0, updatedAt: photo.updatedAt } : null,
          photoKey: photoKey(),
          photoError,
          decorated,
          weeks: page ? page.weeks : 0,
          paused,
          watching: { shell: !!watched.shell, rail: !!watched.rail, pins: watched.pins.length, ui: watched.ui.length, interval: !!interval },
          photoBroken: !!brokenSrc,
          pins: { ...pinStats, threadsCached: threadCache.size, threadQueries },
          editor: editor ? editor.state() : null,
        }),
        open: () => openSection("profile"),
        close: closeSection,
        refresh: () => refreshData(true),
        data: () => model,
        identity: () => ({ ...ident }),
        avatar: {
          get: (size) => (photo ? (size === 512 && photo.dataUrl512) || photo.dataUrl : null),
          set: (dataUrl, dataUrl512) => savePhoto(dataUrl, dataUrl512),
          clear: () => clearPhoto(),
          edit: (file) => !!openEditor(file || null),
        },
        dispose,
      }
    : { enabled: false, flag: FLAG_KEY, state: () => ({ enabled: false, flag: FLAG_KEY, section: activeId, paused, watching: { shell: !!watched.shell, rail: !!watched.rail, interval: !!interval } }), dispose };
  window.__RE_TEMPO_PROFILE__ = api;
  try {
    window.dispatchEvent(new CustomEvent("rtsettings:ready", { detail: { api: settingsApi } }));
  } catch (_) {
    /* no listeners */
  }
})();
