// qa/changelog/kit.mjs — capture kit for the visual changelog (PNG, GIF, MP4)
// -----------------------------------------------------------------------------
// Starts an isolated RE-TEMPO instance (lab app + cloned logged-in profile),
// drives it over CDP and records evidence WITHOUT touching the user's screen
// (no macOS screencapture; frames come from the renderer itself over CDP).
//
//   import * as kit from "./kit.mjs";
//   const s = await kit.open({ profile: "qa-2" });          // all mods (AFTER)
//   await kit.setSkip(s, "*");                              // original Tempo (BEFORE)
//   await kit.shot(s, "evidence/zoom/01-before.png");
//   await kit.setSkip(s, "");                               // mods back on
//   const r = await kit.record(s, "evidence/zoom/03-zoom-in", async () => {
//     await kit.caption(s, "⌘ + =  zooms in");   // text recorded into media: ENGLISH
//     await kit.moveTo(s, 700, 400); await kit.click(s, 700, 400);
//   });                                                     // -> .mp4 + .gif
//   kit.writeIndex("zoom", { title, summary, shortcut, files: [...], simulatedData: null }); // index.json
//   await kit.close(s);
//
// Fixed structure per mod (Figma board), ALL in English (names, captions, index.json):
// 01-before.png, 02-after.png, 03-<action>.gif + 03-<action>.mp4, 04-<description>.png|gif|mp4...,
// width 1200, GIF <= 8 MB, MP4 h264, index.json.
//
// Rules: qa-N profiles are CLONES of the live session (make-profile.mjs): NEVER sign out.
// Each agent uses ITS OWN profile (per-profile/slot lock from the harness). close() only
// tears down the instance opened here (harness teardown).
// -----------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { LAB_BIN, makeLabApp } from "./make-lab-app.mjs";
import { refreshAuth } from "./make-profile.mjs";

process.env.RE_TEMPO_BIN = process.env.RE_TEMPO_BIN || LAB_BIN; // before importing the harness
if (!process.env.QA_WINDOW_MODE) process.env.QA_WINDOW_MODE = "offscreen"; // window off-screen, compositor active

const FFMPEG = fs.existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const FFPROBE = fs.existsSync("/opt/homebrew/bin/ffprobe") ? "/opt/homebrew/bin/ffprobe" : "ffprobe";
export const REPO = path.resolve(import.meta.dirname, "..", "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };

const abs = (p) => (path.isAbsolute(p) ? p : path.join(REPO, p));

let harness = null;
async function H() {
  if (!harness) {
    const inst = await import("../instance.mjs");
    const cfg = await import("../lib/config.mjs");
    const cdp = await import("../lib/cdp.mjs");
    const ui = await import("../lib/ui.mjs");
    inst.installSignalCleanup();
    harness = { ...inst, ...cfg, ...cdp, ui };
  }
  return harness;
}

// ---------------------------------------------------------------- account guard
// The profile is a clone of the real session: mods that WRITE to the account or outside
// the clone are turned off from connection and on every reload. Lesson from 2026-10-18: a
// "running" task copied from canvas-comment-agent turned "done" on boot in 3 clones
// and each one posted a duplicate reply in the real thread.
const ACCOUNT_GUARD = () => {
  try {
    localStorage.setItem("rtd.commentAgent.reply", "off");        // no reply in a real thread
    localStorage.setItem("re-tempo:canvas-autosetup-send", "0");  // no automatic setup chat
    localStorage.setItem("rtd.appMap.export", "off");             // no export into the real HOME
    localStorage.setItem("rtd.uiDrive.file", "/tmp/tempo-qa/changelog-uidrive/ui-commands.jsonl"); // does not read the real ~/.tempo
  } catch (_) {}
};

// ---------------------------------------------------------------- instance
export async function open({ profile = "qa-1", skip = null, width = 1440, height = 900, dpr = 1 } = {}) {
  makeLabApp();
  const h = await H();
  refreshAuth(profile); // fresh token from the live window (same session)
  fs.mkdirSync("/tmp/tempo-qa/changelog-uidrive", { recursive: true });
  const paths = h.profilePaths(profile);
  const inst = await h.launch({ paths });
  const browser = await h.connect(inst.cdpPort);
  let page = null;
  for (let i = 0; i < 120 && !page; i++) { page = await h.pickMainPage(browser); if (!page) await sleep(250); }
  if (!page) throw new Error("main page not found");
  await page.evaluate(ACCOUNT_GUARD).catch(() => {});
  await page.addInitScript(ACCOUNT_GUARD).catch(() => {});
  const cdp = await page.context().newCDPSession(page);
  const s = { profile, inst, browser, page, cdp, width, height, dpr, overlay: false };
  await viewport(s, width, height, dpr);
  await h.ui.waitForReady(page);
  await waitApp(s);
  if (skip != null) await setSkip(s, skip);
  return s;
}

export async function viewport(s, width = s.width, height = s.height, dpr = s.dpr) {
  Object.assign(s, { width, height, dpr });
  await s.cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile: false });
  await sleep(250);
}

// Waits for the app to finish booting (auth restored, React mounted). Returns the detected screen.
export async function waitApp(s, { timeoutMs = 90000 } = {}) {
  const h = await H();
  const t0 = Date.now();
  let screen = "unknown";
  while (Date.now() - t0 < timeoutMs) {
    screen = await h.ui.detectScreen(s.page);
    const ok = await s.page.evaluate(() => {
      const r = document.querySelector("#root");
      return !!r && r.querySelectorAll("button").length > 5 && (document.body.innerText || "").length > 80;
    }).catch(() => false);
    if (ok && screen !== "auth") break;
    if (screen === "auth" && Date.now() - t0 > 25000) break;
    await sleep(500);
  }
  await sleep(1200);
  s.screen = screen;
  return screen;
}

// Mods to skip: "" = all on (AFTER), "*" = none (original Tempo, BEFORE), "a,b" = all except a,b.
export async function setSkip(s, skip) {
  const cur = await s.page.evaluate(() => (window.__RTQ_MODS__ ? window.__RTQ_MODS__.skip : null)).catch(() => null);
  if (cur === skip) return;
  await s.page.evaluate((v) => { sessionStorage.setItem("rtq.skip", v); localStorage.setItem("rtq.skip", v); }, skip);
  await reload(s);
}

export async function reload(s) {
  s.overlay = false;
  await s.page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await viewport(s);
  const h = await H();
  await h.ui.waitForReady(s.page);
  await waitApp(s);
}

export async function loadedMods(s) {
  return s.page.evaluate(() => (window.__RTQ_MODS__ ? window.__RTQ_MODS__.loaded : null));
}

export async function close(s) {
  const h = await H();
  try { await s.page.evaluate(() => { sessionStorage.removeItem("rtq.skip"); localStorage.removeItem("rtq.skip"); }); } catch {}
  try { await s.browser.close(); } catch {}
  await h.teardown(s.inst);
}

// ---------------------------------------------------------------- overlay (cursor + caption)
// The real cursor does not show up in CDP captures; we draw a fake one (pointer-events:none).
const OVERLAY_JS = () => {
  if (window.__rtq) return;
  const st = document.createElement("style");
  st.id = "rtq-style";
  st.textContent = `
  #rtq-cursor{position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;
    transform:translate(-100px,-100px);transition:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))}
  #rtq-cursor.rtq-hide{display:none}
  .rtq-ripple{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;z-index:2147483646;
    pointer-events:none;border:2px solid #f5a623;background:rgba(245,166,35,.18);animation:rtqr .5s ease-out forwards}
  @keyframes rtqr{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}
  #rtq-caption{position:fixed;left:50%;top:var(--rtq-cap-top,58px);transform:translateX(-50%);z-index:2147483647;pointer-events:none;
    font:600 15px/1.3 -apple-system,system-ui,sans-serif;color:#fff;background:rgba(20,20,24,.88);
    border:1px solid rgba(255,255,255,.18);padding:9px 16px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.35);
    max-width:80vw;text-align:center;opacity:0;transition:opacity .18s}
  #rtq-caption.rtq-on{opacity:1}
  .rtq-hl{position:fixed;z-index:2147483645;pointer-events:none;border:2px solid #f5a623;border-radius:8px;
    box-shadow:0 0 0 4px rgba(245,166,35,.25)}`;
  document.documentElement.appendChild(st);
  const c = document.createElement("div");
  c.id = "rtq-cursor";
  c.innerHTML = `<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 14 L10.5 20.5 L13 19.4 L10.1 13 L16 13 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  document.documentElement.appendChild(c);
  const cap = document.createElement("div");
  cap.id = "rtq-caption";
  document.documentElement.appendChild(cap);
  window.__rtq = {
    at(x, y) { c.style.transform = `translate(${x - 3}px,${y - 2}px)`; },
    ripple(x, y) { const r = document.createElement("div"); r.className = "rtq-ripple"; r.style.left = x + "px"; r.style.top = y + "px"; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 600); },
    caption(t) { if (t) { cap.textContent = t; cap.classList.add("rtq-on"); } else cap.classList.remove("rtq-on"); },
    cursor(on) { c.classList.toggle("rtq-hide", !on); },
    highlight(rect) {
      document.querySelectorAll(".rtq-hl").forEach((n) => n.remove());
      if (!rect) return;
      const d = document.createElement("div"); d.className = "rtq-hl";
      Object.assign(d.style, { left: rect.x - 4 + "px", top: rect.y - 4 + "px", width: rect.width + 8 + "px", height: rect.height + 8 + "px" });
      document.documentElement.appendChild(d);
    },
  };
};

export async function overlay(s) {
  if (s.overlay) {
    const ok = await s.page.evaluate(() => !!window.__rtq && !!document.getElementById("rtq-cursor")).catch(() => false);
    if (ok) return;
  }
  await s.page.evaluate(OVERLAY_JS);
  s.overlay = true;
  if (s.mouse) await s.page.evaluate(([x, y]) => window.__rtq.at(x, y), [s.mouse.x, s.mouse.y]);
}

export async function caption(s, text) { await overlay(s); await s.page.evaluate((t) => window.__rtq.caption(t), text || ""); }
export async function cursor(s, on) { await overlay(s); await s.page.evaluate((v) => window.__rtq.cursor(v), !!on); }
export async function highlight(s, rectOrSelector) {
  await overlay(s);
  let rect = rectOrSelector;
  if (typeof rectOrSelector === "string") rect = await rectOf(s, rectOrSelector);
  await s.page.evaluate((r) => window.__rtq.highlight(r), rect || null);
}
// Hides cursor/caption/highlight (for clean PNGs).
export async function clean(s) {
  if (!s.overlay) return;
  await s.page.evaluate(() => { if (window.__rtq) { window.__rtq.caption(""); window.__rtq.cursor(false); window.__rtq.highlight(null); } }).catch(() => {});
}

// ---------------------------------------------------------------- mouse/keyboard (with fake cursor)
export async function moveTo(s, x, y, { ms = 450, steps } = {}) {
  await overlay(s);
  await cursor(s, true);
  const from = s.mouse || { x: s.width / 2, y: s.height / 2 };
  const n = steps || Math.max(2, Math.round(ms / 16));
  for (let i = 1; i <= n; i++) {
    const t = i / n, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
    const px = from.x + (x - from.x) * e, py = from.y + (y - from.y) * e;
    await s.page.mouse.move(px, py);
    await s.page.evaluate(([a, b]) => window.__rtq && window.__rtq.at(a, b), [px, py]);
    await sleep(ms / n);
  }
  s.mouse = { x, y };
}

export async function click(s, x, y, opts = {}) {
  if (x != null) await moveTo(s, x, y, opts);
  const p = s.mouse;
  await s.page.evaluate(([a, b]) => window.__rtq && window.__rtq.ripple(a, b), [p.x, p.y]);
  await s.page.mouse.down({ button: opts.button || "left" });
  await sleep(60);
  await s.page.mouse.up({ button: opts.button || "left" });
}

export async function rectOf(s, selector) {
  return s.page.evaluate((sel) => {
    const n = document.querySelector(sel);
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, selector);
}

export async function clickSel(s, selector, opts = {}) {
  const r = await rectOf(s, selector);
  if (!r) throw new Error(`selector not found: ${selector}`);
  await click(s, r.x + r.width / 2, r.y + r.height / 2, opts);
  return r;
}

export async function hoverSel(s, selector, opts = {}) {
  const r = await rectOf(s, selector);
  if (!r) throw new Error(`selector not found: ${selector}`);
  await moveTo(s, r.x + r.width / 2, r.y + r.height / 2, opts);
  return r;
}

export async function press(s, combo, { label } = {}) {
  if (label) await caption(s, label);
  await s.page.keyboard.press(combo);
}

// ---------------------------------------------------------------- PNG
// clip: {x,y,width,height} in CSS px, or selector (with pad). scale 2 = retina sharpness.
// Whole window without an explicit scale: output is OUT_WIDTH px wide (board standard).
export const OUT_WIDTH = 1200;
export async function shot(s, out, { clip, selector, pad = 12, scale, keepOverlay = false } = {}) {
  const file = abs(out);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!keepOverlay) await clean(s);
  if (selector) {
    const r = await rectOf(s, selector);
    if (!r) throw new Error(`selector not found: ${selector}`);
    clip = { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.width + 2 * pad, height: r.height + 2 * pad };
  }
  const params = { format: "png", captureBeyondViewport: false };
  if (clip) {
    const x = Math.max(0, clip.x), y = Math.max(0, clip.y);
    params.clip = { x, y, width: Math.min(clip.width, s.width - x), height: Math.min(clip.height, s.height - y), scale: scale == null ? 1 : scale };
  } else {
    const sc = scale == null ? Math.min(1, OUT_WIDTH / s.width) : scale;
    if (sc !== 1) params.clip = { x: 0, y: 0, width: s.width, height: s.height, scale: sc };
  }
  const { data } = await s.cdp.send("Page.captureScreenshot", params);
  fs.writeFileSync(file, Buffer.from(data, "base64"));
  return { file, bytes: fs.statSync(file).size };
}

// ---------------------------------------------------------------- video (CDP screencast -> MP4 + GIF)
// record(s, "evidence/x/03-open-menu", async () => {...}, { clip, gifWidth, fps })
// Produces <base>.mp4 (h264) and <base>.gif (palette, <= maxGifMB). JPEG frames from the renderer.
export async function record(s, base, fn, { clip = null, gifWidth = 1200, gifFps = 12, maxGifMB = 8, tailMs = 600, leadMs = 400, mp4 = true, gif = true } = {}) {
  const outBase = abs(base);
  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  const tmp = fs.mkdtempSync(path.join("/tmp/tempo-qa", "rec-"));
  const frames = [];
  let n = 0;
  const onFrame = async (ev) => {
    const f = path.join(tmp, `f${String(++n).padStart(5, "0")}.jpg`);
    fs.writeFileSync(f, Buffer.from(ev.data, "base64"));
    frames.push({ f, t: Date.now() });
    try { await s.cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }); } catch {}
  };
  s.cdp.on("Page.screencastFrame", onFrame);
  await overlay(s);
  await s.cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: s.width * s.dpr, maxHeight: s.height * s.dpr, everyNthFrame: 1 });
  // Fallback poll: if the compositor emits no frames (idle window), capture via screenshot.
  let polling = true;
  const poller = (async () => {
    while (polling) {
      const last = frames.length ? frames[frames.length - 1].t : 0;
      if (Date.now() - last > 120) {
        try {
          const { data } = await s.cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 88 });
          const f = path.join(tmp, `f${String(++n).padStart(5, "0")}.jpg`);
          fs.writeFileSync(f, Buffer.from(data, "base64"));
          frames.push({ f, t: Date.now() });
        } catch {}
      }
      await sleep(80);
    }
  })();
  const t0 = Date.now();
  await sleep(leadMs);
  let err = null;
  try { await fn(); } catch (e) { err = e; }
  await sleep(tailMs);
  polling = false;
  await poller;
  await s.cdp.send("Page.stopScreencast").catch(() => {});
  s.cdp.off("Page.screencastFrame", onFrame);
  const tEnd = Date.now();
  if (err) throw err;
  frames.sort((a, b) => a.t - b.t);
  if (frames.length < 2) throw new Error(`too few frames (${frames.length})`);

  // concat with real durations
  const list = path.join(tmp, "list.txt");
  let txt = "";
  for (let i = 0; i < frames.length; i++) {
    const next = i + 1 < frames.length ? frames[i + 1].t : tEnd;
    txt += `file '${frames[i].f}'\nduration ${Math.max(0.001, (next - frames[i].t) / 1000).toFixed(3)}\n`;
  }
  txt += `file '${frames[frames.length - 1].f}'\n`;
  fs.writeFileSync(list, txt);

  const crop = clip ? `crop=${Math.round(clip.width * s.dpr)}:${Math.round(clip.height * s.dpr)}:${Math.round(clip.x * s.dpr)}:${Math.round(clip.y * s.dpr)},` : "";
  const res = { frames: frames.length, seconds: +((tEnd - t0) / 1000).toFixed(2) };
  const mp4File = outBase + ".mp4";
  // MP4 is always produced (GIF source); removed afterwards if mp4:false.
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
    "-vf", `${crop}fps=30,scale='min(${OUT_WIDTH},iw)':-2:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-movflags", "+faststart", mp4File]);
  res.mp4 = mp4File;
  res.mp4Bytes = fs.statSync(mp4File).size;
  if (gif) {
    const gifFile = outBase + ".gif";
    const tries = [[gifWidth, gifFps, 160], [Math.min(gifWidth, 1000), 10, 128], [860, 10, 96], [720, 8, 64]];
    for (const [w, fps, colors] of tries) {
      execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", mp4File, "-vf",
        `fps=${fps},scale='min(${w},iw)':-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
        gifFile]);
      res.gifBytes = fs.statSync(gifFile).size;
      res.gifWidth = w; res.gifFps = fps;
      if (res.gifBytes <= maxGifMB * 1024 * 1024) break;
    }
    res.gif = gifFile;
  }
  if (!mp4) { fs.unlinkSync(mp4File); delete res.mp4; delete res.mp4Bytes; }
  // clean up frames (named files, no glob)
  for (const fr of frames) { try { fs.unlinkSync(fr.f); } catch {} }
  try { fs.unlinkSync(list); fs.rmdirSync(tmp); } catch {}
  return res;
}

// Duration of a media file (s), via ffprobe.
export function probe(file) {
  try {
    const out = execFileSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration:stream=width,height", "-of", "json", abs(file)], { encoding: "utf8" });
    const j = JSON.parse(out);
    const st = (j.streams || [])[0] || {};
    return { seconds: +(+j.format.duration).toFixed(2), width: st.width, height: st.height, bytes: fs.statSync(abs(file)).size };
  } catch (e) { return { error: e.message }; }
}

// ---------------------------------------------------------------- page utilities
export async function evaluate(s, fn, arg) { return s.page.evaluate(fn, arg); }
export async function text(s) { return s.page.evaluate(() => document.body.innerText || ""); }
export async function waitFor(s, fn, { timeoutMs = 15000, arg } = {}) {
  return s.page.waitForFunction(fn, arg, { timeout: timeoutMs, polling: 200 });
}
// Clicks the first visible element whose text (or aria-label) matches.
export async function clickText(s, txt, { selector = "button, [role=button], [role=menuitem], [role=tab], a, [role=option]", exact = false, ...opts } = {}) {
  const r = await s.page.evaluate(([t, sel, ex]) => {
    const norm = (v) => (v || "").replace(/\s+/g, " ").trim();
    for (const n of document.querySelectorAll(sel)) {
      const lab = norm(n.innerText) || norm(n.getAttribute("aria-label"));
      if (!(ex ? lab === t : lab.includes(t))) continue;
      const b = n.getBoundingClientRect();
      if (b.width > 0 && b.height > 0) return { x: b.x, y: b.y, width: b.width, height: b.height };
    }
    return null;
  }, [txt, selector, exact]);
  if (!r) throw new Error(`text not found: ${txt}`);
  await click(s, r.x + r.width / 2, r.y + r.height / 2, opts);
  return r;
}

// ---------------------------------------------------------------- index.json (board schema)
// writeIndex("zoom", { title, summary, shortcut, login, files: [{ file: "01-before.png", caption }],
//                      notCaptured: null, simulatedData: null })
// Everything in ENGLISH (keys and text); docs/changes/build.mjs (another session) reads this format.
// type comes from the extension; every listed file must exist. Warns about files in the directory
// that are not listed and about the fixed structure (01-before.png, 02-after.png, pair 03-<action>.gif + .mp4).
export function writeIndex(mod, o = {}) {
  const title = o.title;
  const summary = o.summary;
  const shortcut = o.shortcut ?? null;
  const notCaptured = o.notCaptured ?? null;
  const simulatedData = o.simulatedData ?? null;
  const login = o.login ?? true;
  const input = o.files ?? [];
  if (!title || !summary) throw new Error(`index.json for ${mod}: title/summary are required`);
  const dir = abs(`evidence/${mod}`);
  fs.mkdirSync(dir, { recursive: true });
  const files = input.map((a) => {
    const file = a.file;
    const caption = a.caption;
    const f = path.join(dir, file);
    if (!fs.existsSync(f)) throw new Error(`index.json for ${mod}: missing file ${file}`);
    const type = file.split(".").pop().toLowerCase();
    if (!["png", "gif", "mp4"].includes(type)) throw new Error(`invalid type: ${file}`);
    if (!caption) throw new Error(`empty caption: ${file}`);
    return { file, type, caption };
  });
  const names = new Set(files.map((a) => a.file));
  const unlisted = fs.readdirSync(dir).filter((n) => n !== "index.json" && !names.has(n));
  const warnings = [];
  if (!notCaptured) {
    if (!names.has("01-before.png")) warnings.push("missing 01-before.png");
    if (!names.has("02-after.png")) warnings.push("missing 02-after.png");
    const g = [...names].filter((n) => /^03-.+\.gif$/.test(n)).map((n) => n.slice(0, -4));
    if (!g.some((b) => names.has(b + ".mp4"))) warnings.push("missing pair 03-<action>.gif + .mp4");
    for (const a of files) if (a.type === "gif" && fs.statSync(path.join(dir, a.file)).size > 8 * 1024 * 1024) warnings.push(`GIF > 8 MB: ${a.file}`);
  }
  const json = { mod, title, summary, shortcut, capturedAt: o.capturedAt ?? new Date().toISOString(), login, files, notCaptured, simulatedData };
  fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify(json, null, 2) + "\n");
  return { file: path.join(dir, "index.json"), unlisted, warnings };
}
