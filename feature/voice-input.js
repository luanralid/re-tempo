/*
 * RE-TEMPO · voice-input (real-time dictation in the composer)
 * ---------------------------------------------------------------------------
 * Microphone button in the composer toolbar, next to send/stop. Click: start
 * recording, and words show up in the editor WHILE you speak (volatile partial
 * results that get corrected and finalized). Click again: the utterance ends
 * and the final text stays in the editor at the cursor. It does NOT send.
 * Space tap (<250 ms) in the focused, empty composer: start; tap again: stop.
 *
 * Engine: macOS on-device speech (Speech.framework, SpeechAnalyzer +
 * SpeechTranscriber with volatile results, macOS 26+). Nothing leaves the
 * machine and no API key is needed.
 * - Web Speech API does not work: Electron fails with "network", and the
 *   on-device mode (SpeechRecognition.available/processLocally) CRASHES the
 *   renderer. Do not use it.
 * - Engines: Apple Speech (SpeechTranscriber, accurate, default) or Apple
 *   Dictation (DictationTranscriber: more frequent partials, but it did badly
 *   in pt-BR). No cloud, no key.
 * Flow:
 *   1) the renderer captures the mic (getUserMedia) and a 16 kHz AudioWorklet
 *      produces Int16 PCM in 100 ms chunks;
 *   2) a Swift CLI runs in the app's pty (terminalBridge) and reads the chunks
 *      from stdin ("A <base64>"; "E" ends the utterance). The CLI never opens
 *      the mic (no TCC prompt for the binary) and writes "RTV:{json}" to
 *      stdout: partials and the final text;
 *   3) live text is a ProseMirror widget decoration at the cursor (not part of
 *      the doc or the undo history); at the end it becomes real text in the
 *      same spot, with no jump.
 *   The CLI is compiled once (xcrun swiftc) from the source embedded below and
 *   cached at /tmp/re-tempo-voice/stt-<hash>. Requires Xcode or the Command
 *   Line Tools. Hovering the button starts the compile early.
 *
 * Settings: Settings > Dictation (new item in the "Personal" group of the
 * Settings nav; right-clicking the mic opens it). Engine (Apple Speech /
 * Apple Dictation), Language (PT-BR and EN-US on top, then the locales the
 * engine supports) and "Test microphone" (3 s). Stored in localStorage
 * "re-tempo:voice-lang" and "re-tempo:voice-engine"; with no choice,
 * navigator.language is used, and there is no auto-detection after a choice.
 * Language without a model: the CLI downloads it (AssetInventory) and shows
 * "Downloading language… N%". The mic tooltip shows the current language and
 * engine; Option-click on the mic toggles PT/EN.
 *
 * Dictation in any field: window.__RE_TEMPO_VOICE__.attach(el, opts) gives an
 * <input>, a <textarea> or a contenteditable element the same dictation and
 * returns a handle { start(), stop(), toggle(), cancel(), destroy(), state,
 * el, button } (state: "idle" | "recording" | "finishing" | "error").
 *   opts.button     true (default): the composer's mic button (same SVGs,
 *                   states and CSS); an HTMLElement: that element becomes the
 *                   toggle (it gets the state attributes, its content stays);
 *                   false: no button, drive it through the handle.
 *   opts.placement  "inside-end" (default: over the right end of the field,
 *                   which gets padding for it), "before" or "after" (a plain
 *                   sibling in the flow).
 *   opts.onPartial(text) / opts.onFinal(text): notifications; the text goes
 *                   into the field either way (onFinal only runs with text).
 *   opts.reducedMotion: words only fade in (no blur/rise).
 * In an <input>/<textarea> the live words are written INTO the value at the
 * caret (the field grows, wraps and scrolls natively; a React-controlled field
 * gets its onChange) and replaced in place on every partial. A mirror laid
 * exactly over the field draws the same text with the composer's animated
 * words (volatile = dimmed) while the field's own text is transparent; at the
 * end the mirror goes away and the final text stays at the cursor (one undo
 * step when the field has focus). A contenteditable gets the composer's word
 * widget at the caret (a TipTap/ProseMirror editor: the composer's own
 * widget). Enter (without Shift) in a field that is dictating ends the
 * dictation, waits for the final transcript (at most SEND_WAIT_MS; on timeout
 * the stable words plus the volatile ones that are real words are kept, a
 * lone provisional "." is dropped), writes it into the field and then SENDS
 * through the field's own Enter (a synthetic Enter keydown, so a comment
 * thread, the canvas composer or the agent reply send exactly as a typed Enter
 * would). Shift+Enter still breaks the line and Escape cancels the dictation
 * without sending (the live words come back out). Typing mid-dictation keeps what is typed and the next words
 * continue at the caret. One recorder at a time: starting in another field
 * (or in the composer) hands the current one off; it settles its last words
 * in the background, and the next transcriber only starts once that one has
 * exited (the new audio is queued meanwhile), so there is never more than one
 * CLI process.
 * autoAttach(selector, opts) watches the DOM and attaches to every field that
 * matches (a match that is not a field: the first field inside it). It never
 * touches the chat composer (whose dictation stays as described above) and
 * returns a function that undoes it. Attached by default: the agent panel's
 * "Reply to the agent…" (comment-bubbles) and the canvas comment threads'
 * "Reply to thread…" and new-thread composer.
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  // Dev reload (evaluating the file again): tear down the previous instance.
  if (window.__RE_TEMPO_VOICE__?.dispose) window.__RE_TEMPO_VOICE__.dispose();

  const LANG_KEY = "re-tempo:voice-lang";
  const ENGINE_KEY = "re-tempo:voice-engine";
  // On-device engines (no cloud, no key). speech = SpeechTranscriber, the default;
  // dictation = DictationTranscriber: more frequent partials, but it did badly in pt-BR.
  const ENGINES = [
    { id: "speech", name: "Apple Speech", short: "Apple Speech (accurate)", hint: "Apple Speech (SpeechTranscriber): partial results every ~1 s; good in pt-BR and en-US." },
    { id: "dictation", name: "Apple Dictation", short: "Apple Dictation (fast)", hint: "Apple Dictation (DictationTranscriber): partial results every ~0.3 s, but it made many mistakes in pt-BR during testing." },
  ];
  const WORK_DIR = "/tmp/re-tempo-voice";
  const MAX_REC_MS = 5 * 60 * 1000;
  const TEST_MS = 3000; // "Test microphone" in Settings
  const CHUNK = 1600; // 100 ms at 16 kHz
  const STAGGER_MS = 45; // gap between consecutive new words of the same batch
  const STAGGER_MAX_MS = 600; // a whole batch starts revealing within this window
  const WORD_IN_MS = 380; // word entrance; keep in sync with .rtv-a in voice-input.css
  const SEL_EDITOR = '[data-testid="chat-input-textarea"]';
  const SEL_ACTION =
    '[data-testid^="chat-input-send-button"], [data-testid="chat-input-stop-button"]';
  const SEL_ATTACH = '[data-testid="chat-input-attach-button"]';
  const SEL_EFFORT = '[data-testid="chat-input-effort-selector"]';
  // dictation in any field (attach / autoAttach)
  const SEL_FIELD =
    'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="url"], input[type="email"], input[type="tel"], [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
  const AUTO_SEL = [
    "[data-rtcb-reply]",
    "textarea.rtcb-ta",
    'textarea[placeholder^="Reply to the agent"]',
    '[data-testid="comment-thread-reply-input"]',
    '[data-testid="canvas-comment-composer-textarea"]',
  ].join(", ");
  const RESERVE = 28; // room kept at the end of a field for an "inside-end" mic
  const SEND_WAIT_MS = 600; // longest wait for the final transcript after Enter, before sending
  const HANDOFF_MS = 2500; // longest wait for a handed-off session to exit before the next transcriber starts

  // CLI source. String.raw keeps the Swift backslashes (\(x), \n).
  const SWIFT_SRC = String.raw`import Foundation
import Speech
import AVFoundation

// stt <lang> [engine]             dictation: stdin "A <base64 PCM Int16 16 kHz mono>\n" ... "E\n" (end)
// stt --locales [engine]          supported (s) and installed (i) languages
// stt --install <lang> [engine]   downloads the language assets
// engine: speech = SpeechTranscriber (accurate, default) | dictation = DictationTranscriber (fast)
// stdout: "RTV:{json}\n"  r=ready  p=partial(f=finalized, v=volatile)  d=final
//                        dl=downloading language (p=0..1)  ok=installed  l=list  e=error
@main struct RTVoiceSTT {
  static func emit(_ o: [String: Any]) {
    guard let d = try? JSONSerialization.data(withJSONObject: o) else { return }
    FileHandle.standardOutput.write("RTV:".data(using: .utf8)! + d + "\n".data(using: .utf8)!)
  }

  // Downloads the language assets (if missing), reporting progress.
  static func install(_ modules: [any SpeechModule]) async throws {
    guard let req = try await AssetInventory.assetInstallationRequest(supporting: modules) else { return }
    emit(["t": "dl", "p": 0.0])
    let tick = Task {
      while !Task.isCancelled {
        try? await Task.sleep(for: .milliseconds(500))
        emit(["t": "dl", "p": req.progress.fractionCompleted])
      }
    }
    defer { tick.cancel() }
    try await req.downloadAndInstall()
  }

  static func main() async {
    let args = CommandLine.arguments
    if args.count > 1 && args[1] == "--locales" {
      let dictation = args.count > 2 && args[2] == "dictation"
      let s = await (dictation ? DictationTranscriber.supportedLocales : SpeechTranscriber.supportedLocales).map { $0.identifier(.bcp47) }
      let i = await (dictation ? DictationTranscriber.installedLocales : SpeechTranscriber.installedLocales).map { $0.identifier(.bcp47) }
      emit(["t": "l", "s": s, "i": i])
      exit(0)
    }
    let installOnly = args.count > 2 && args[1] == "--install"
    let engine = args.count > (installOnly ? 3 : 2) ? args[installOnly ? 3 : 2] : "speech"
    // raw pty mode: no echo and no canonical-mode line length limit
    var t = termios()
    if tcgetattr(0, &t) == 0 { cfmakeraw(&t); tcsetattr(0, TCSANOW, &t) }
    let lang = installOnly ? args[2] : (args.count > 1 ? args[1] : "en-US")
    do {
      let module: any SpeechModule
      let locale: Locale
      let startResults: () -> Task<String, Error>
      if engine == "dictation" {
        var l = await DictationTranscriber.supportedLocale(equivalentTo: Locale(identifier: lang))
        if l == nil { l = await DictationTranscriber.supportedLocale(equivalentTo: Locale(identifier: "en-US")) }
        guard let l else { emit(["t": "e", "m": "unsupported language: \(lang)"]); exit(1) }
        let tr = DictationTranscriber(locale: l, contentHints: [], transcriptionOptions: [.punctuation],
                                      reportingOptions: [.volatileResults, .frequentFinalization], attributeOptions: [])
        (module, locale) = (tr, l)
        startResults = {
          Task { () throws -> String in
            var done = ""
            for try await r in tr.results {
              let s = String(r.text.characters)
              if r.isFinal { done += s }
              emit(["t": "p", "f": done, "v": r.isFinal ? "" : s])
            }
            return done
          }
        }
      } else {
        var l = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: lang))
        if l == nil { l = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: "en-US")) }
        guard let l else { emit(["t": "e", "m": "unsupported language: \(lang)"]); exit(1) }
        let tr = SpeechTranscriber(locale: l, preset: .progressiveTranscription)
        (module, locale) = (tr, l)
        startResults = {
          Task { () throws -> String in
            var done = ""
            for try await r in tr.results {
              let s = String(r.text.characters)
              if r.isFinal { done += s }
              emit(["t": "p", "f": done, "v": r.isFinal ? "" : s])
            }
            return done
          }
        }
      }
      try await install([module])
      if installOnly { emit(["t": "ok", "l": locale.identifier(.bcp47)]); exit(0) }
      let analyzer = SpeechAnalyzer(modules: [module])
      let src = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
      let dst = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [module]) ?? src
      let conv = dst == src ? nil : AVAudioConverter(from: src, to: dst)
      try await analyzer.prepareToAnalyze(in: dst)
      let (input, feed) = AsyncStream<AnalyzerInput>.makeStream()
      try await analyzer.start(inputSequence: input)

      let results = startResults()

      Thread.detachNewThread {
        while let line = readLine(strippingNewline: true) {
          if line.hasPrefix("E") { break }
          guard line.hasPrefix("A "), let data = Data(base64Encoded: String(line.dropFirst(2))) else { continue }
          let frames = AVAudioFrameCount(data.count / 2)
          guard frames > 0, let buf = AVAudioPCMBuffer(pcmFormat: src, frameCapacity: frames) else { continue }
          buf.frameLength = frames
          data.withUnsafeBytes { raw in
            buf.int16ChannelData![0].update(from: raw.bindMemory(to: Int16.self).baseAddress!, count: Int(frames))
          }
          guard let conv else { feed.yield(AnalyzerInput(buffer: buf)); continue }
          let cap = AVAudioFrameCount(Double(frames) * dst.sampleRate / src.sampleRate) + 32
          guard let o = AVAudioPCMBuffer(pcmFormat: dst, frameCapacity: cap) else { continue }
          var given = false
          var err: NSError?
          conv.convert(to: o, error: &err) { _, status in
            if given { status.pointee = .noDataNow; return nil }
            given = true
            status.pointee = .haveData
            return buf
          }
          if err == nil && o.frameLength > 0 { feed.yield(AnalyzerInput(buffer: o)) }
        }
        feed.finish()
      }
      emit(["t": "r", "l": locale.identifier(.bcp47)])

      try await analyzer.finalizeAndFinishThroughEndOfInput()
      let text = try await results.value
      emit(["t": "d", "f": text.trimmingCharacters(in: .whitespacesAndNewlines)])
      exit(0)
    } catch {
      emit(["t": "e", "m": "\(error)"])
      exit(1)
    }
  }
}
`;

  // Converts Float32 to Int16 PCM and posts 100 ms chunks; "flush" sends the rest.
  const WORKLET_SRC = `registerProcessor("rtv-pcm", class extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Int16Array(${CHUNK});
    this.n = 0;
    this.port.onmessage = () => { this.port.postMessage(this.buf.slice(0, this.n).buffer); this.n = 0; };
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === ${CHUNK}) { this.port.postMessage(this.buf.slice().buffer); this.n = 0; }
    }
    return true;
  }
});`;

  // FNV-1a 32-bit: a new source means a new cached binary.
  const HASH = (() => {
    let h = 0x811c9dc5;
    for (let i = 0; i < SWIFT_SRC.length; i++) {
      h ^= SWIFT_SRC.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  })();
  const BIN = `${WORK_DIR}/stt-${HASH}`;

  const MIC_SVG =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="9" y="2" width="6" height="12" rx="3"></rect><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="18" x2="12" y2="22"></line></svg>';
  const STOP_SVG =
    '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"></rect></svg>';
  const BUSY_SVG =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.22-8.56"></path></svg>';

  const engine = () => {
    try {
      const v = localStorage.getItem(ENGINE_KEY);
      return ENGINES.some((e) => e.id === v) ? v : "speech";
    } catch {
      return "speech";
    }
  };
  const lang = () => {
    try {
      return localStorage.getItem(LANG_KEY) || navigator.language || "en-US";
    } catch {
      return navigator.language || "en-US";
    }
  };
  const warn = (...a) => console.warn("[voice-input]", ...a);
  const words = (s) => s.split(/\s+/).filter(Boolean);

  // --- local process through the app's pty -----------------------------------
  // stdout lines go to onLine; onExit(code, output) at the end.
  function spawnPty(cmd, args, { onLine, onExit } = {}) {
    const tb = window.terminalBridge;
    if (!tb?.create) throw new Error("terminalBridge unavailable");
    const id = `re-tempo-voice-${crypto.randomUUID()}`;
    const dec = new TextDecoder();
    let buf = "";
    let tail = "";
    let closed = false;
    let offExit = null;
    const lines = () => {
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, "");
        buf = buf.slice(i + 1);
        onLine?.(line);
      }
    };
    const offData = tb.onData(id, (d) => {
      const s = typeof d === "string" ? d : dec.decode(d, { stream: true });
      try { tb.ack?.(id, d.byteLength ?? d.length); } catch {}
      tail = (tail + s).slice(-4000);
      buf += s;
      lines();
    });
    const close = () => {
      if (closed) return;
      closed = true;
      try { offData?.(); } catch {}
      try { offExit?.(); } catch {}
      Promise.resolve(tb.dispose?.(id)).catch(() => {});
    };
    // exit can arrive right after the last data: give it a moment before closing
    offExit = tb.onExit(id, (code) =>
      setTimeout(() => {
        if (buf) onLine?.(buf.replace(/\r$/, ""));
        buf = "";
        onExit?.(code, tail.replace(/\r/g, ""));
        close();
      }, 60)
    );
    Promise.resolve(tb.create({ id, shell: cmd, args, size: { cols: 500, rows: 50 } })).catch((e) => {
      onExit?.(-1, String(e?.message || e));
      close();
    });
    return { write: (s) => { if (!closed) tb.write(id, s); }, close };
  }

  function run(cmd, args, timeoutMs) {
    return new Promise((resolve, reject) => {
      let p = null;
      const timer = setTimeout(() => { p?.close(); reject(new Error("timed out")); }, timeoutMs);
      try {
        p = spawnPty(cmd, args, { onExit: (code, out) => { clearTimeout(timer); resolve({ code, out }); } });
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  let binReady = null;
  function ensureBinary() {
    if (!binReady) {
      binReady = (async () => {
        const fs = window.electronAPI?.fs;
        if (!fs?.writeFile) throw new Error("electronAPI.fs unavailable");
        const ex = await fs.exists(BIN);
        if (ex?.data === true) return BIN;
        const dir = `${WORK_DIR}/build-${HASH}`;
        const w = await fs.writeFile(`${dir}/stt.swift`, SWIFT_SRC);
        if (w && w.success === false) throw new Error(w.error || "failed to write the Swift source");
        const sh =
          `/usr/bin/xcrun swiftc -O -parse-as-library -module-cache-path '${dir}/mc' ` +
          `'${dir}/stt.swift' -o '${BIN}.tmp' && /bin/mv -f '${BIN}.tmp' '${BIN}'`;
        const r = await run("/bin/sh", ["-c", sh], 300000);
        if (r.code !== 0) {
          throw new Error(
            "could not compile the transcriber (requires Xcode or the Command Line Tools): " +
              r.out.trim().split("\n").slice(-3).join(" | ")
          );
        }
        return BIN;
      })().catch((e) => {
        binReady = null;
        throw e;
      });
    }
    return binReady;
  }

  let workletUrl = null;
  const b64 = (ab) => {
    const u = new Uint8Array(ab);
    let s = "";
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  };

  // --- ProseMirror classes -----------------------------------------------------
  // The bundle does not expose them. Plugin comes from any plugin in the state;
  // Decoration and DecorationSet come from a composer plugin that decorates a
  // HYPOTHETICAL state (state.apply without dispatch: the editor is untouched).
  let PM = null;
  function pmClasses(ed) {
    if (PM) return PM;
    const st = ed.state;
    const Plugin = st.plugins[0]?.constructor;
    const probes = [
      () => {
        const hb = st.schema.nodes.hardBreak;
        return hb && st.apply(st.tr.insertText("a").replaceSelectionWith(hb.create()).insertText("b"));
      },
      () => st.apply(st.tr.insertText("/")),
      () => st.apply(st.tr.insertText("@")),
      // the composer's "@" only matches after a space and its "/" only at the start
      // of a line: when the editor already holds text that ends at the cursor (a
      // second dictation, a typed draft), the two probes above find nothing
      () => st.apply(st.tr.insertText(" @")),
      () => {
        const tr = st.tr.split(st.selection.from);
        return st.apply(tr.insertText("/"));
      },
    ];
    for (const mk of probes) {
      let ns = null;
      try { ns = mk(); } catch {}
      for (const p of ns?.plugins || []) {
        if (!p.props.decorations) continue;
        try {
          const ds = p.props.decorations.call(p, ns);
          const d = ds?.find?.()[0];
          if (d && typeof d.constructor.widget === "function" && typeof ds.constructor.create === "function") {
            return (PM = { Plugin, Decoration: d.constructor, DecorationSet: ds.constructor });
          }
        } catch {}
      }
    }
    return null;
  }

  // --- live words ----------------------------------------------------------------
  // Each word: <span.rtv-w [data-vol]>␠<span.rtv-a>word</span></span>.
  // The inline wrapper holds the space (natural line wrapping) and the dimmed
  // look of volatile words; the inner inline-block span runs the blur-to-sharp
  // entrance. Only NEW words animate; correcting an existing word swaps its text.
  // The engine sends a partial about once a second, so a partial (or the final)
  // often brings several words at once: they still enter one by one, each
  // STAGGER_MS after the previous one (the whole batch within STAGGER_MAX_MS),
  // and a batch never starts before the previous one finished starting.
  // `o` = { el, items, sep, next }; each item keeps t0, its scheduled start.
  function renderWords(o, f, v) {
    const toks = [...words(f).map((t) => [t, false]), ...words(v).map((t) => [t, true])];
    const now = performance.now();
    const fresh = toks.length - o.items.length;
    const gap = fresh > 1 ? Math.min(STAGGER_MS, STAGGER_MAX_MS / (fresh - 1)) : 0;
    let at = Math.min(Math.max(now, o.next || 0), now + STAGGER_MAX_MS);
    toks.forEach(([text, vol], i) => {
      let it = o.items[i];
      if (!it) {
        const w = document.createElement("span");
        w.className = "rtv-w";
        const a = document.createElement("span");
        a.className = "rtv-a";
        a.style.setProperty("--rtv-d", `${(at - now).toFixed(1)}ms`);
        w.append(i > 0 ? " " : o.sep, a);
        o.el.append(w);
        it = o.items[i] = { w, a, text: null, t0: at };
        o.next = at + STAGGER_MS;
        at += gap;
      }
      if (it.text !== text) it.a.textContent = it.text = text;
      it.w.toggleAttribute("data-vol", vol);
    });
    for (const it of o.items.splice(toks.length)) it.w.remove();
  }

  // Re-inserting an element restarts its CSS animations. Right before the widget
  // goes (back) into an editor, words that already entered are marked done and
  // words still entering resume where they are (negative delay), so moving to
  // another editor of the pool never makes a word blink or enter twice.
  function resync(o) {
    const now = performance.now();
    for (const it of o.items) {
      if (it.a.hasAttribute("data-done")) continue;
      if (now >= it.t0 + WORD_IN_MS + 50) it.a.setAttribute("data-done", "");
      else it.a.style.setProperty("--rtv-d", `${(it.t0 - now).toFixed(1)}ms`);
    }
  }

  // Output of "Test microphone" in Settings: the same words, inside a box.
  class LiveBox {
    constructor(box) {
      this.el = box;
      this.items = [];
      this.sep = "";
      box.replaceChildren();
    }
    update(f, v) { renderWords(this, f, v); }
    async commit(text) { if (text) renderWords(this, text, ""); }
    destroy() {}
  }

  // --- upkeep of the live text ------------------------------------------------------
  // Live / FieldLive re-check their editor or field every 200 ms. With the tab
  // hidden that only goes on while a recording is in progress (a composer swap
  // mid-recording must still be followed); otherwise the interval stops and
  // comes back when the tab shows again.
  const ticks = new Set(); // { fn, run, id }
  const idleHidden = () => document.hidden && st.phase !== "recording";
  function tick(fn) {
    const t = { fn, id: 0 };
    t.run = () => {
      if (!idleHidden()) return fn();
      clearInterval(t.id);
      t.id = 0;
    };
    if (!idleHidden()) t.id = setInterval(t.run, 200);
    ticks.add(t);
    return t;
  }
  function untick(t) {
    if (!t) return;
    clearInterval(t.id);
    ticks.delete(t);
  }
  function onVisibility() {
    if (document.hidden) return;
    for (const t of ticks) {
      if (t.id) continue;
      t.id = setInterval(t.run, 200);
      t.fn();
    }
  }
  document.addEventListener("visibilitychange", onVisibility);

  // --- live text: widget at the cursor position ---------------------------------
  // Tempo's composer uses a POOL of TipTap editors: when the chat props change
  // (e.g. tasks running), it returns the editor to the pool (state reset or
  // editor destroyed) and mounts another one in the same place. So the widget
  // is not tied to one editor: on every partial (and every 200 ms) it checks
  // which editor the composer CURRENTLY has and moves there.
  class Live {
    // find (attached fields only): returns that field's current editor
    constructor(ed, root, find = null) {
      const { Plugin, Decoration, DecorationSet } = PM;
      this.ed = null;
      this.root = root;
      this.find = find;
      this.items = [];
      this.sep = "";
      this.pos = ed.state.selection.from;
      this.el = document.createElement("span");
      this.el.className = "rtv-live";
      this.el.contentEditable = "false";
      // once its entrance is done, a word does not animate again if the widget moves
      this.el.addEventListener("animationend", (e) => e.target.setAttribute("data-done", ""));
      const self = this;
      const clamp = (state, pos) => Math.max(0, Math.min(pos, state.doc.content.size));
      this.plugin = new Plugin({
        state: {
          init: (_, state) => (self.pos = clamp(state, self.pos)),
          apply: (tr, pos, _old, state) => (self.pos = clamp(state, tr.mapping.map(pos))),
        },
        props: {
          decorations(state) {
            // toDOM runs whenever ProseMirror (re)creates the widget, i.e. right before it is inserted
            const toDOM = () => (resync(self), self.el);
            const w = Decoration.widget(clamp(state, this.getState(state)), toDOM, { side: 1, key: "rtv-live", ignoreSelection: true });
            return DecorationSet.create(state.doc, [w]);
          },
        },
      });
      this.attach(ed);
      this.timer = tick(() => this.ensure());
    }

    // like TipTap's registerPlugin, without depending on its version
    attach(ed) {
      this.detach();
      this.ed = ed;
      const { state } = ed;
      const from = Math.max(0, Math.min(this.pos, state.doc.content.size));
      const before = state.doc.textBetween(Math.max(0, from - 1), from, "\n", " ");
      this.sep = before && !/\s/.test(before) ? " " : "";
      if (this.items[0]) this.items[0].w.firstChild.nodeValue = this.sep;
      ed.view.updateState(state.reconfigure({ plugins: [...state.plugins, this.plugin] }));
      this.root?.setAttribute("data-rtv-live", "");
    }

    detach() {
      const ed = this.ed;
      if (!ed || ed.isDestroyed || !ed.state.plugins.includes(this.plugin)) return;
      ed.view.updateState(ed.state.reconfigure({ plugins: ed.state.plugins.filter((p) => p !== this.plugin) }));
    }

    // Current editor of the composer where dictation started; if that container
    // left the screen, the visible composer that has the dictation button.
    ensure() {
      if (this.find) return this.follow();
      let root = this.root?.isConnected ? this.root : null;
      if (!root) {
        for (const el of document.querySelectorAll(SEL_EDITOR)) {
          const r = findRoot(el);
          if (el.offsetParent && r?.querySelector(".rtv-mic")) { root = r; break; }
        }
        if (!root) return;
        this.root = st.root = root;
        paintAll();
      }
      const ed = root.querySelector(SEL_EDITOR)?.editor;
      if (!ed || ed.isDestroyed) return;
      root.setAttribute("data-rtv-live", "");
      if (ed === this.ed && ed.state.plugins.includes(this.plugin)) return;
      // another editor (composer pool) or a state reconfigured without the plugin
      if (ed !== this.ed) this.pos = ed.state.selection.from;
      this.attach(ed);
    }

    // attached field: its own editor, wherever the app re-created it
    follow() {
      const ed = this.find();
      if (!ed || ed.isDestroyed) return;
      this.root?.setAttribute("data-rtv-live", "");
      if (ed === this.ed && ed.state.plugins.includes(this.plugin)) return;
      if (ed !== this.ed) this.pos = ed.state.selection.from;
      this.attach(ed);
    }

    update(f, v) {
      this.ensure();
      renderWords(this, f, v);
    }

    // The final text first goes through the same reveal (words it adds enter one
    // by one); once every entrance has finished, the widget is swapped for real
    // text in the same spot, in the same task (no intermediate frame).
    async commit(text) {
      if (text) this.update(text, "");
      const end = this.items.reduce((m, it) => Math.max(m, it.t0), 0) + WORD_IN_MS;
      const left = Math.max(0, end - performance.now());
      const anims = this.el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}));
      await Promise.race([
        Promise.all([...anims, new Promise((r) => setTimeout(r, left))]),
        new Promise((r) => setTimeout(r, left + 600)),
      ]);
      this.ensure();
      const ed = this.ed;
      const ok = ed && !ed.isDestroyed && ed.state.plugins.includes(this.plugin);
      const pos = ok ? this.plugin.getState(ed.state) : null;
      this.destroy();
      if (!text) return;
      const target = ok
        ? ed
        : this.find
          ? this.find()
          : (this.root?.isConnected ? this.root : document).querySelector(SEL_EDITOR)?.editor;
      if (!target) return;
      target.chain().focus().insertContentAt(pos ?? target.state.selection.from, { type: "text", text: this.sep + text }).run();
    }

    destroy() {
      untick(this.timer);
      this.root?.removeAttribute("data-rtv-live");
      this.detach();
    }
  }

  // --- live text in an attached field (attach / autoAttach) ---------------------
  // Resolves once every word entrance of `o` has finished (bounded), as in Live.commit.
  async function entrances(o) {
    const end = o.items.reduce((m, it) => Math.max(m, it.t0), 0) + WORD_IN_MS;
    const left = Math.max(0, end - performance.now());
    const anims = o.el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}));
    await Promise.race([
      Promise.all([...anims, new Promise((r) => setTimeout(r, left))]),
      new Promise((r) => setTimeout(r, left + 600)),
    ]);
  }

  // The first n words of a partial were already accepted as plain text (the
  // user typed mid-dictation, or the app changed the value): leave them out.
  function dropWords(f, v, n) {
    if (!n) return [f, v];
    const fw = words(f);
    if (n <= fw.length) return [fw.slice(n).join(" "), v];
    return ["", words(v).slice(n - fw.length).join(" ")];
  }

  // Value of an <input>/<textarea> through the prototype setter, so that a
  // React-controlled field sees the change in the input event that follows.
  function setValue(el, v) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
  }
  const fire = (el, inputType, data = null) =>
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType, data }));

  // computed colors: rgb() is opaque, rgba()/"/ a" carry the alpha
  const opaque = (c) => {
    if (!c || c === "transparent") return false;
    const m = c.match(/^rgba\(.*,\s*([\d.]+)\)$/) || c.match(/\/\s*([\d.]+)%?\s*\)$/);
    return !m || parseFloat(m[1]) > 0;
  };
  // aria-hidden layers that the field's own component draws under it (the canvas
  // comment composer: a mention-highlight copy of the text under a transparent textarea)
  const backdrops = (el) =>
    [...(el.parentElement?.children || [])].filter(
      (c) =>
        c !== el &&
        c.getAttribute("aria-hidden") === "true" &&
        !c.classList.contains("rtv-mirror") &&
        getComputedStyle(c).position === "absolute"
    );
  // the color the field's text is SEEN in (a transparent field: its backdrop's)
  function textColor(el) {
    const cs = getComputedStyle(el);
    const fill = cs.webkitTextFillColor;
    if (opaque(cs.color) && (!fill || opaque(fill))) return fill || cs.color;
    for (const b of backdrops(el)) {
      const c = getComputedStyle(b).color;
      if (opaque(c)) return c;
    }
    return getComputedStyle(el.parentElement || el).color;
  }

  // Puts an absolutely positioned sibling of `el` at el's border box + (dx, dy):
  // offsetLeft/Top first, then corrected by the measured difference (offsets are
  // rounded, and the containing block may not be el's offsetParent). Already in
  // place: no write at all (this runs on every DOM-change frame).
  function pin(node, el, dx, dy, w = null, ht = null) {
    const s = node.style;
    const r0 = el.getBoundingClientRect();
    const n0 = node.getBoundingClientRect();
    const near = (a, b) => Math.abs(a - b) < 0.01;
    if (
      (w == null || (near(n0.width, w) && near(n0.height, ht))) &&
      near(n0.left, r0.left + dx) &&
      near(n0.top, r0.top + dy)
    ) {
      return;
    }
    if (w != null) {
      s.width = `${w}px`;
      s.height = `${ht}px`;
    }
    let x = el.offsetLeft + dx;
    let y = el.offsetTop + dy;
    s.left = `${x}px`;
    s.top = `${y}px`;
    const r = el.getBoundingClientRect();
    const n = node.getBoundingClientRect();
    const ex = r.left + dx - n.left;
    const ey = r.top + dy - n.top;
    if (Math.abs(ex) > 0.01) s.left = `${(x += ex)}px`;
    if (Math.abs(ey) > 0.01) s.top = `${(y += ey)}px`;
  }

  // what decides where text wraps and how it looks, copied from the field to its mirror
  const MIRROR_PROPS = [
    "boxSizing", "direction", "textAlign", "textIndent", "textTransform", "tabSize",
    "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "fontVariant",
    "fontKerning", "fontFeatureSettings", "fontVariationSettings", "fontOpticalSizing",
    "letterSpacing", "wordSpacing", "lineHeight", "whiteSpace", "wordBreak", "overflowWrap", "hyphens",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "borderTopStyle", "borderRightStyle", "borderBottomStyle", "borderLeftStyle",
    "textRendering", "webkitFontSmoothing",
  ];
  const ZWSP = "​"; // keeps a trailing newline's empty line in the mirror, as in a textarea

  // <input>/<textarea>: the dictated words go INTO the value at the caret and
  // are replaced in place on every partial (seg = where they are). A mirror (a
  // sibling laid exactly over the field, with its box, font and wrapping) draws
  // the value with those words as composer-style spans; meanwhile the field's
  // own text, caret and placeholder are transparent and its backdrops hidden.
  class FieldLive {
    constructor(h, onLost) {
      const el = (this.field = h.el);
      this.onLost = onLost;
      this.w = { el: document.createElement("span"), items: [], sep: "", next: 0 };
      this.w.el.className = "rtv-live";
      this.w.el.addEventListener("animationend", (e) => e.target.setAttribute("data-done", ""));
      this.skip = 0; // words of this utterance already accepted as plain text
      this.seg = null; // { start, len, tail } of the dictated words inside the value (len counts the tail)
      this.last = null; // the value as we last left it
      this.lost = 0;
      this.color = textColor(el); // before the field turns transparent
      this.m = document.createElement("div");
      this.m.className = "rtv-mirror";
      this.m.setAttribute("aria-hidden", "true");
      if (h.opts.reducedMotion) this.m.classList.add("rtv-reduced");
      this.pre = document.createTextNode("");
      this.post = document.createTextNode(ZWSP);
      this.m.append(this.pre, this.w.el, this.post);
      this.hidden = backdrops(el);
      for (const b of this.hidden) b.setAttribute("data-rtv-hide", "");
      el.after(this.m);
      el.setAttribute("data-rtv-field-live", "");
      this.onScroll = () => {
        this.m.scrollTop = el.scrollTop;
        this.m.scrollLeft = el.scrollLeft;
      };
      // someone else's change (typing, the app): show it right away
      this.onInput = () => {
        if (this.writing) return;
        this.paint();
        this.sync();
      };
      // the user types mid-dictation: what is there stays, the next words go at the caret
      this.onBefore = () => {
        if (!this.writing) this.freeze();
      };
      el.addEventListener("scroll", this.onScroll);
      el.addEventListener("input", this.onInput);
      el.addEventListener("beforeinput", this.onBefore);
      this.anchor();
      this.timer = tick(() => this.sync());
      this.paint();
      this.sync();
    }

    // at the caret when the field has focus; otherwise appended at the end
    anchor() {
      const el = this.field;
      const v = el.value;
      let pos = v.length;
      if (document.activeElement === el) {
        try {
          pos = el.selectionStart ?? v.length;
        } catch {}
      }
      this.seg = { start: pos, len: 0, tail: 0 };
      const before = v.slice(Math.max(0, pos - 1), pos);
      this.w.sep = before && !/\s/.test(before) ? " " : "";
    }

    freeze() {
      this.skip += this.w.items.length;
      for (const it of this.w.items) it.w.remove();
      this.w.items = [];
      this.w.next = 0;
      this.seg = null;
      this.last = null;
    }

    update(f, v) {
      if (this.dead) return;
      const el = this.field;
      // the app changed the value under us (a reset, a send): keep it, continue at the caret
      if (this.last != null && el.value !== this.last) this.freeze();
      if (!this.seg) this.anchor();
      [f, v] = dropWords(f, v, this.skip);
      renderWords(this.w, f, v);
      const text = this.w.items.map((it) => it.text).join(" ");
      this.put(text ? this.w.sep + text : "");
      this.paint();
      this.sync();
    }

    // Replaces the dictated words inside the value (never submits: only an input
    // event). Dictating in front of a word adds a space so the two do not glue.
    put(text) {
      const el = this.field;
      const v = el.value;
      const { start, len } = this.seg;
      const rest = v.slice(start + len);
      const tail = text && rest && !/^\s/.test(rest) ? " " : "";
      const next = v.slice(0, start) + text + tail + rest;
      this.seg.len = text.length + tail.length;
      this.seg.tail = tail.length;
      if (next !== v) {
        this.writing = true;
        try {
          setValue(el, next);
          fire(el, "insertText", text);
        } finally {
          this.writing = false;
        }
      }
      this.last = el.value;
      if (document.activeElement === el) {
        try {
          el.setSelectionRange(start + text.length, start + text.length);
        } catch {}
      }
    }

    // mirror text = the value, with the dictated part drawn by the word spans
    paint() {
      const v = this.field.value;
      if (this.seg) {
        this.pre.nodeValue = v.slice(0, this.seg.start);
        this.post.nodeValue = v.slice(this.seg.start + this.seg.len - this.seg.tail) + ZWSP;
      } else {
        this.pre.nodeValue = v;
        this.post.nodeValue = ZWSP;
      }
    }

    // mirror box = field box (size, font, padding, scroll), every partial and every 200 ms
    sync() {
      if (this.dead) return;
      const el = this.field;
      const m = this.m;
      if (!el.isConnected) {
        if (++this.lost >= 3) this.onLost();
        return;
      }
      this.lost = 0;
      if (m.parentNode !== el.parentNode) el.after(m);
      const cs = getComputedStyle(el);
      for (const p of MIRROR_PROPS) m.style[p] = cs[p];
      m.style.color = this.color;
      const n = (p) => parseFloat(cs[p]) || 0;
      if (el instanceof HTMLInputElement) {
        // one line, centered in the content box like the input's own text
        m.style.whiteSpace = "pre";
        m.style.lineHeight = `${Math.max(0, el.clientHeight - n("paddingTop") - n("paddingBottom"))}px`;
      }
      // a vertical scrollbar narrows the text box
      const sb = el.offsetWidth - el.clientWidth - n("borderLeftWidth") - n("borderRightWidth");
      if (sb > 0) m.style.paddingRight = `${n("paddingRight") + sb}px`;
      const r = el.getBoundingClientRect();
      pin(m, el, 0, 0, r.width, r.height);
      m.scrollTop = el.scrollTop;
      m.scrollLeft = el.scrollLeft;
    }

    // The final text goes through the same reveal; then the mirror goes away in
    // the same task the text is settled (no intermediate frame). With the focus
    // in the field (or nowhere), the words are taken out quietly and typed back
    // with insertText: one native undo step for the utterance.
    async commit(text) {
      if (this.dead) return;
      if (!text) return this.destroy();
      this.update(text, "");
      await entrances(this.w);
      if (this.dead) return;
      const el = this.field;
      if (this.last != null && el.value !== this.last) this.freeze();
      const seg = this.seg;
      this.teardown();
      if (!seg?.len || !el.isConnected) return;
      const ae = document.activeElement;
      if (ae !== el && ae && ae !== document.body) return; // the focus moved on (a hand-off): leave it there
      if (el.disabled || el.readOnly) return;
      const v = el.value;
      const end = seg.start + seg.len;
      const ins = v.slice(seg.start, end);
      if (ae !== el) el.focus({ preventScroll: true });
      setValue(el, v.slice(0, seg.start) + v.slice(end));
      let ok = false;
      try {
        el.setSelectionRange(seg.start, seg.start);
        ok = document.execCommand("insertText", false, ins);
      } catch {}
      if (!ok) {
        setValue(el, v);
        fire(el, "insertText", ins);
      }
      try {
        el.setSelectionRange(end - seg.tail, end - seg.tail);
      } catch {}
    }

    teardown() {
      if (this.dead) return;
      this.dead = true;
      untick(this.timer);
      const el = this.field;
      el.removeEventListener("scroll", this.onScroll);
      el.removeEventListener("input", this.onInput);
      el.removeEventListener("beforeinput", this.onBefore);
      el.removeAttribute("data-rtv-field-live");
      for (const b of this.hidden) b.removeAttribute("data-rtv-hide");
      this.m.remove();
    }

    // cancel: the dictated words come back out of the field
    destroy() {
      if (this.dead) return;
      const el = this.field;
      const seg = this.seg;
      if (seg?.len && el.isConnected && el.value === this.last) {
        const v = el.value;
        this.writing = true;
        try {
          setValue(el, v.slice(0, seg.start) + v.slice(seg.start + seg.len));
          fire(el, "deleteContent");
        } finally {
          this.writing = false;
        }
        if (document.activeElement === el) {
          try {
            el.setSelectionRange(seg.start, seg.start);
          } catch {}
        }
      }
      this.teardown();
    }
  }

  // Plain contenteditable: the composer's word widget as a real (non-editable)
  // span at the caret; at the end it becomes text in the same spot.
  class EditableLive {
    constructor(h, onLost) {
      this.box = h.el;
      this.onLost = onLost;
      this.items = [];
      this.sep = "";
      this.next = 0;
      this.el = document.createElement("span");
      this.el.className = "rtv-live";
      this.el.contentEditable = "false";
      if (h.opts.reducedMotion) this.el.classList.add("rtv-reduced");
      this.el.addEventListener("animationend", (e) => e.target.setAttribute("data-done", ""));
      this.range = this.caret();
      this.box.setAttribute("data-rtv-edit-live", "");
    }

    // the caret when it is inside the field, else the end of the field
    caret() {
      const sel = getSelection();
      if (sel?.rangeCount) {
        const r = sel.getRangeAt(0).cloneRange();
        if (this.box.contains(r.startContainer)) {
          r.collapse(true);
          return r;
        }
      }
      const r = document.createRange();
      r.selectNodeContents(this.box);
      r.collapse(false);
      return r;
    }

    place() {
      const r = this.range && this.box.contains(this.range.startContainer) ? this.range : this.caret();
      this.range = null;
      const pre = document.createRange();
      pre.setStart(this.box, 0);
      pre.setEnd(r.startContainer, r.startOffset);
      const before = pre.toString().slice(-1);
      this.sep = before && !/\s/.test(before) ? " " : "";
      if (this.items[0]) this.items[0].w.firstChild.nodeValue = this.sep;
      resync(this);
      r.insertNode(this.el);
    }

    update(f, v) {
      if (this.dead) return;
      if (!this.el.isConnected) {
        if (!this.box.isConnected) return this.onLost();
        this.place(); // first words, or a re-render took the widget out
      }
      renderWords(this, f, v);
    }

    async commit(text) {
      if (this.dead) return;
      if (!text) return this.destroy();
      this.update(text, "");
      await entrances(this);
      if (this.dead) return;
      this.dead = true;
      const span = this.el;
      const box = this.box;
      box.removeAttribute("data-rtv-edit-live");
      if (!span.isConnected) return;
      const t = this.sep + text;
      const r = document.createRange();
      r.setStartBefore(span);
      r.collapse(true);
      const ae = document.activeElement;
      const own = !ae || ae === document.body || box.contains(ae);
      span.remove();
      if (own) {
        box.focus({ preventScroll: true });
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        let ok = false;
        try {
          ok = document.execCommand("insertText", false, t);
        } catch {}
        if (ok) return;
      }
      const node = document.createTextNode(t);
      r.insertNode(node);
      if (own) getSelection().setPosition(node, t.length);
      fire(box, "insertText", t);
    }

    destroy() {
      this.dead = true;
      this.el.remove();
      this.box.removeAttribute("data-rtv-edit-live");
    }
  }

  // live text for an attached field (null: a ProseMirror field without the
  // decoration classes; the final text is then inserted at the end)
  function makeLive(h, s) {
    const lost = () => cancel(s);
    if (h.kind === "text") return new FieldLive(h, lost);
    if (h.kind === "editable") return new EditableLive(h, lost);
    const ed = editorOf(h.el);
    if (!ed || !pmClasses(ed)) return null;
    const live = new Live(ed, h.el, () => editorOf(h.el));
    if (h.opts.reducedMotion) live.el.classList.add("rtv-reduced");
    return live;
  }

  function insertField(h, text) {
    const ed = h.kind === "pm" ? editorOf(h.el) : null;
    if (!ed || ed.isDestroyed) return;
    const pos = ed.state.selection.from;
    const before = ed.state.doc.textBetween(Math.max(0, pos - 1), pos, "\n", " ");
    const sep = before && !/\s/.test(before) ? " " : "";
    ed.chain().focus().insertContentAt(pos, { type: "text", text: sep + text }).run();
  }

  // --- session (one at a time) --------------------------------------------------
  // h = attached field of the foreground session; bg = handed-off sessions still
  // settling their last words (their transcriber exits before the next one starts)
  const st = { phase: "idle", root: null, h: null, err: "", errTimer: 0, sess: null, timeline: [], dl: null, bg: new Set() };

  function setPhase(phase, err = "") {
    st.phase = phase;
    st.err = err;
    clearTimeout(st.errTimer);
    if (phase === "error") {
      warn(err);
      st.errTimer = setTimeout(() => setPhase("idle"), 5000);
    }
    if (phase === "idle") st.root = st.h = null;
    paintAll();
  }

  // root = composer that receives the text; box = "Test microphone" output (3 s);
  // h = attached field (attach / autoAttach).
  async function start(root, box = null, h = null) {
    if (h && bgHas(h)) return; // this field is still settling its previous utterance
    const ed = box || h ? null : root?.querySelector(SEL_EDITOR)?.editor;
    const cur = st.sess;
    // one recorder at a time: a field taking over (or the composer taking over
    // from a field) hands the current session off to finish in the background
    if (cur && (h || cur.h) && cur.h !== h) {
      if (!box && !h && !ed) return;
      background(cur);
    } else if (st.phase !== "idle" && st.phase !== "error") return;
    if (!box && !h && !ed) return setPhase("error", "composer editor not found");
    const t0 = performance.now();
    const s = (st.sess = { t0, queue: [], ready: false, ended: false, last: "", final: null, err: "", log: [], box, h, root: box || h ? null : root });
    s.procDone = new Promise((r) => (s.procEnd = r));
    st.timeline = s.log;
    st.root = s.root;
    st.h = h;
    setPhase("recording");
    const bin = ensureBinary(); // start compiling/checking in parallel
    bin.catch(() => {});
    try {
      s.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      s.ac = new AudioContext({ sampleRate: 16000 });
      workletUrl ||= URL.createObjectURL(new Blob([WORKLET_SRC], { type: "text/javascript" }));
      await s.ac.audioWorklet.addModule(workletUrl);
      s.node = new AudioWorkletNode(s.ac, "rtv-pcm");
      s.node.port.onmessage = (e) => {
        if (!e.data.byteLength) return;
        const line = `A ${b64(e.data)}\n`;
        if (s.ready) s.proc.write(line);
        else s.queue.push(line);
      };
      s.ac.createMediaStreamSource(s.stream).connect(s.node);
    } catch (e) {
      s.audioStopped = false;
      await stopAudio(s);
      if (st.sess !== s) return drop(s); // handed off or cancelled meanwhile
      st.sess = null;
      return setPhase("error", `microphone unavailable: ${e.name || ""} ${e.message || e}`.trim());
    }
    // stopped, handed off or cancelled while the mic was opening: release it (nothing was captured)
    if (s.audioStopped) {
      s.audioStopped = false;
      await stopAudio(s);
      return st.sess === s ? finish(s) : drop(s);
    }
    if (box) s.live = new LiveBox(box);
    else if (h) {
      try {
        s.live = makeLive(h, s);
      } catch (e) {
        warn("live text", e);
      }
    } else if (pmClasses(ed)) s.live = new Live(ed, root);
    s.cap = setTimeout(() => (st.sess === s ? stop() : endSession(s)), box ? TEST_MS : MAX_REC_MS);
    try {
      const path = await bin;
      await drainBg(s);
      if (s.finished) return;
      s.proc = spawnPty(path, [lang(), engine()], {
        onLine: (l) => onLine(s, l),
        onExit: (code, out) => {
          if (!s.finished) {
            s.err ||= out.match(/RTV-ERR (.*)/)?.[1] || `transcriber exited with code ${code}`;
            finish(s);
          }
        },
      });
    } catch (e) {
      s.err = e.message || String(e);
      finish(s);
    }
  }

  // A session that ended before capturing anything (handed off or cancelled while the mic opened).
  function drop(s) {
    if (!s.finished) {
      s.finished = true;
      s.procEnd?.();
    }
    st.bg.delete(s);
    paintAll();
  }

  // Hand-off: the session leaves the foreground and finishes on its own (its
  // text still lands in its own target).
  function background(s) {
    if (st.sess === s) st.sess = null;
    st.bg.add(s);
    if (!s.finished) endSession(s);
  }

  // One transcriber at a time: the handed-off ones exit first (bounded; past
  // that they keep their last partial). The new session's audio is queued meanwhile.
  async function drainBg(s) {
    const others = [...st.bg].filter((x) => x !== s && !x.finished);
    if (!others.length) return;
    await Promise.race([Promise.all(others.map((x) => x.procDone)), new Promise((r) => setTimeout(r, HANDOFF_MS))]);
    for (const x of others) if (!x.finished) finish(x);
  }

  // Escape in a field (or handle.cancel / destroy): ends the session WITHOUT
  // text; live words already in the field come back out of it.
  function cancel(s) {
    if (!s || s.finished) return false;
    s.finished = true;
    s.cancelled = true;
    clearTimeout(s.cap);
    clearTimeout(s.finTimer);
    clearTimeout(s.sendTimer);
    stopAudio(s);
    s.proc?.close();
    s.procEnd?.();
    try {
      s.live?.destroy();
    } catch {}
    st.bg.delete(s);
    if (st.sess === s) {
      st.sess = null;
      setPhase("idle");
    } else paintAll();
    return true;
  }

  function onLine(s, line) {
    if (!line.startsWith("RTV:")) return;
    let m;
    try { m = JSON.parse(line.slice(4)); } catch { return; }
    if (m.t === "dl") {
      // the CLI is downloading the language model: show it on the button (audio stays queued)
      s.dl = m.p || 0;
      paintAll();
    } else if (m.t === "r") {
      if (s.dl != null) { s.dl = null; paintAll(); }
      s.ready = true;
      for (const l of s.queue) s.proc.write(l);
      s.queue = [];
      if (s.ended) endSpeech(s);
    } else if (m.t === "p" || m.t === "d") {
      const f = m.f || "";
      const v = m.t === "p" ? m.v || "" : "";
      s.last = [...words(f), ...words(v)].join(" ");
      s.lastF = f;
      s.lastV = v;
      s.log.push({ t: Math.round(performance.now() - s.t0), f, v, ...(m.t === "d" && { d: true }) });
      s.live?.update(f, v);
      if (m.t === "p" && s.h?.opts.onPartial) {
        try {
          s.h.opts.onPartial(s.last);
        } catch (e) {
          warn("onPartial", e);
        }
      }
      if (m.t === "d") {
        s.final = f;
        finish(s);
      }
    } else if (m.t === "e") {
      s.err = m.m || "transcriber error";
    }
  }

  async function stopAudio(s) {
    if (s.audioStopped) return;
    s.audioStopped = true;
    if (s.node) {
      // ask for the rest of the chunk before disconnecting
      const rest = new Promise((r) => { const h = s.node.port.onmessage; s.node.port.onmessage = (e) => { h(e); r(); }; });
      s.node.port.postMessage("flush");
      await Promise.race([rest, new Promise((r) => setTimeout(r, 150))]);
      s.node.disconnect();
    }
    s.stream?.getTracks().forEach((t) => t.stop());
    await s.ac?.close().catch(() => {});
  }

  async function stop() {
    const s = st.sess;
    if (!s || st.phase !== "recording") return;
    setPhase("finishing");
    await endSession(s);
  }

  // mic off, then "E" ends the utterance (once the transcriber is ready)
  async function endSession(s) {
    if (s.stopping) return;
    s.stopping = true;
    clearTimeout(s.cap);
    await stopAudio(s);
    s.ended = true;
    if (s.ready && !s.finished) endSpeech(s);
  }

  // "E" ends the utterance; if the final never arrives, keep the last partial.
  function endSpeech(s) {
    s.proc.write("E\n");
    s.finTimer = setTimeout(() => finish(s), 15000);
  }

  async function finish(s) {
    if (s.finished) return;
    s.finished = true;
    clearTimeout(s.finTimer);
    clearTimeout(s.sendTimer);
    clearTimeout(s.cap);
    await stopAudio(s);
    s.proc?.close();
    s.procEnd?.();
    let text = (s.final ?? s.last).trim();
    // Enter-to-send: a trailing provisional mark (" .") hangs on the last word
    if (s.sendOnEnd) text = text.replace(/\s+([.,;:!?\u2026]+)$/u, "$1");
    const root = st.sess === s ? st.root : s.root;
    try {
      if (s.live) await s.live.commit(text);
      else if (text && s.h) insertField(s.h, text);
      else if (text) await insertPlain(root, text);
    } catch (e) {
      s.err ||= e.message || String(e);
    }
    if (text && s.h?.opts.onFinal) {
      try {
        s.h.opts.onFinal(text);
      } catch (e) {
        warn("onFinal", e);
      }
    }
    st.bg.delete(s);
    // handed off: the foreground already belongs to another target
    if (st.sess !== s) {
      if (s.err) warn(s.err);
      return paintAll();
    }
    st.sess = null;
    if (!text && !s.sendOnEnd) setPhase("error", s.err || "nothing was recognized in the recording");
    else {
      if (s.err) warn(s.err);
      setPhase("idle");
    }
    if (s.sendOnEnd && !s.cancelled) sendField(s.h, s.sendMods);
  }

  // Enter during dictation: stop, give the transcriber SEND_WAIT_MS for the final
  // (then keep what was heard, minus a provisional mark that is not a word) and
  // let finish() send once the text is in the field.
  async function stopAndSend(s) {
    s.sendOnEnd = true;
    if (st.phase === "recording") await stop();
    if (s.finished) return;
    clearTimeout(s.sendTimer);
    s.sendTimer = setTimeout(() => {
      if (s.finished) return;
      if (s.final == null) {
        const real = (w) => /[\p{L}\p{N}]/u.test(w);
        s.final = [...words(s.lastF || ""), ...words(s.lastV || "").filter(real)].join(" ");
      }
      finish(s);
    }, SEND_WAIT_MS);
  }

  // the field's own Enter handler sends (React onKeyDown, ProseMirror keydown)
  async function sendField(h, mods) {
    await new Promise((r) => setTimeout(r, 40)); // the controlled field takes the final text first
    const el = h?.el;
    if (!el?.isConnected || !handles.has(h)) return;
    el.focus({ preventScroll: true });
    const init = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true, ...mods };
    const e = new KeyboardEvent("keydown", init);
    e.rtvSend = true;
    el.dispatchEvent(e);
  }

  // Without the ProseMirror classes there is no live text: the final text is
  // typed in at the cursor one word at a time, with the rhythm of the live words
  // (small insertions in a row; the editor history groups them into one undo).
  async function insertPlain(root, text) {
    const find = () => (root?.isConnected ? root : document).querySelector(SEL_EDITOR)?.editor;
    let ed = find();
    if (!ed) return;
    const toks = words(text);
    const gap = toks.length > 1 ? Math.min(STAGGER_MS, STAGGER_MAX_MS / (toks.length - 1)) : 0;
    let pos = ed.state.selection.from;
    const before = ed.state.doc.textBetween(Math.max(0, pos - 1), pos, "\n", " ");
    const sep = before && !/\s/.test(before) ? " " : "";
    for (let i = 0; i < toks.length; i++) {
      if (i) await new Promise((r) => setTimeout(r, gap));
      const cur = find();
      if (!cur || cur.isDestroyed) return;
      // the composer pool swapped the editor: keep typing at the new one's cursor
      if (cur !== ed) [ed, pos] = [cur, cur.state.selection.from];
      // JSON text node: a raw string would be parsed as HTML by TipTap
      const chunk = (i ? " " : sep) + toks[i];
      ed.chain().focus().insertContentAt(Math.min(pos, ed.state.doc.content.size - 1), { type: "text", text: chunk }).run();
      pos = ed.state.selection.from;
    }
  }

  // QA: plays a recorded session (the format of timeline(); entries with d are the
  // final) through the real path (live words, final, commit) without the mic or
  // the transcriber. Resolves once the text is in the editor. target: a composer
  // root (default: the first composer) or an attached field (element or handle).
  async function replay(events, target = findRoot(document.querySelector(SEL_EDITOR))) {
    const h = (target && (byEl.get(target) || byEl.get(target.el))) || null;
    const root = h ? null : target;
    const ed = h ? null : root?.querySelector(SEL_EDITOR)?.editor;
    if (!h && !ed) return false;
    if (h && bgHas(h)) return false;
    const cur = st.sess;
    if (cur && (h || cur.h) && cur.h !== h) background(cur);
    else if (st.phase !== "idle" && st.phase !== "error") return false;
    const t0 = performance.now();
    const proc = { write() {}, close() {} };
    const s = (st.sess = { t0, queue: [], ready: true, ended: false, last: "", final: null, err: "", log: [], audioStopped: true, proc, h, root });
    s.procDone = new Promise((r) => (s.procEnd = r));
    st.timeline = s.log;
    st.root = root;
    st.h = h;
    setPhase("recording");
    if (h) s.live = makeLive(h, s);
    else if (pmClasses(ed)) s.live = new Live(ed, root);
    for (const e of events) {
      const wait = t0 + (e.t || 0) - performance.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (s.finished) break;
      onLine(s, `RTV:${JSON.stringify(e.d ? { t: "d", f: e.f || "" } : { t: "p", f: e.f || "", v: e.v || "" })}`);
    }
    if (!s.finished) finish(s); // no final in the recording: keep the last partial
    while (st.sess === s) await new Promise((r) => setTimeout(r, 30));
    return true;
  }

  // --- language --------------------------------------------------------------
  // The list comes from the CLI itself (macOS supportedLocales/installedLocales).
  let langs = null; // { s: supported, i: installed } for the current engine
  let langsReq = null;
  function loadLangs() {
    langsReq ||= ensureBinary()
      .then(
        (bin) =>
          new Promise((resolve, reject) => {
            let got = null;
            const p = spawnPty(bin, ["--locales", engine()], {
              onLine: (l) => {
                if (l.startsWith("RTV:")) try { const m = JSON.parse(l.slice(4)); if (m.t === "l") got = m; } catch {}
              },
              onExit: () => {
                p?.done?.();
                got ? resolve(got) : reject(new Error("could not list the languages"));
              },
            });
            const timer = setTimeout(() => { p.close(); reject(new Error("timed out listing the languages")); }, 30000);
            p.done = () => clearTimeout(timer);
          })
      )
      .then((m) => {
        langs = { s: m.s || [], i: m.i || [] };
        renderMenu();
        return langs;
      })
      .catch((e) => {
        langsReq = null;
        throw e;
      });
    return langsReq;
  }

  const langName = (id) => {
    if (/^en-US$/i.test(id)) return "English (US)";
    try {
      return new Intl.DisplayNames(["en"], { type: "language", languageDisplay: "standard" }).of(id);
    } catch {
      return id;
    }
  };

  function setEngine(id) {
    try { localStorage.setItem(ENGINE_KEY, id); } catch {}
    // each engine has its own language list
    langs = null;
    langsReq = null;
    paintAll();
    if (panel) loadLangs().then(renderSettings, () => {});
  }

  function setLang(id) {
    try { localStorage.setItem(LANG_KEY, id); } catch {}
    paintAll();
    // chosen language has no model yet: download it now, with progress on the button
    if (langs && !langs.i.includes(id)) installLang(id);
  }

  function installLang(id) {
    if (st.dl) return;
    st.dl = { id, p: 0 };
    paintAll();
    const done = (err) => {
      st.dl = null;
      if (err) setPhase("error", `could not download ${langName(id)}: ${err}`);
      else paintAll();
    };
    ensureBinary().then((bin) => {
      let ok = false;
      spawnPty(bin, ["--install", id, engine()], {
        onLine: (l) => {
          if (!l.startsWith("RTV:")) return;
          let m;
          try { m = JSON.parse(l.slice(4)); } catch { return; }
          if (m.t === "dl") { st.dl = { id, p: m.p || 0 }; paintAll(); }
          else if (m.t === "ok") { ok = true; if (langs && !langs.i.includes(id)) langs.i.push(id); }
          else if (m.t === "e") done(m.m);
        },
        onExit: (code) => { if (st.dl) done(ok ? null : `code ${code}`); },
      });
    }, (e) => done(e.message || String(e)));
  }

  // --- language menu (same classes as the composer's "Effort" menu) ------------
  // Opened from the "Language" field in Settings > Dictation.
  const MENU_CLS =
    "z-50 min-w-[160px] rounded-lg border border-border-primary bg-surface-menu px-1.5 py-1.5 shadow-dropdown outline-none overflow-y-auto overflow-x-hidden [scrollbar-color:var(--icons-muted)_transparent] [scrollbar-width:thin] origin-[var(--transform-origin)] motion-safe:animate-[dropdown-popup-in_var(--duration-fast)_var(--easing-out)] rtv-menu";
  const TITLE_CLS = "px-2 py-1 [font-size:var(--text-label)] [line-height:var(--leading-label)] font-medium text-text-tertiary";
  const ITEM_CLS =
    "flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-2 [font-size:var(--text-body)] [line-height:var(--leading-body)] font-medium outline-none transition-colors data-[highlighted]:bg-surface-menu-hover data-[disabled]:pointer-events-none data-[disabled]:text-text-tertiary data-[disabled]:opacity-50 text-text-secondary [[data-theme=light]_&]:text-text-primary";
  const CHECK_SVG =
    '<svg class="text-text-tertiary" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  const DL_SVG =
    '<svg class="text-text-tertiary" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>';
  const CHEVRON_SVG =
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  const TOP_LANGS = ["pt-BR", "en-US"];

  let menu = null; // { el, anchor }
  function openMenu(anchor) {
    closeMenu();
    const el = document.createElement("div");
    el.className = MENU_CLS;
    el.setAttribute("role", "menu");
    el.setAttribute("aria-label", "Dictation language");
    el.tabIndex = -1;
    menu = { el, anchor };
    document.body.append(el);
    renderMenu();
    // below the trigger; above only if it does not fit
    const r = anchor.getBoundingClientRect();
    const up = r.top - 8;
    const down = innerHeight - r.bottom - 8;
    const below = down >= 260 || down >= up;
    Object.assign(el.style, {
      position: "fixed",
      left: `${Math.max(8, Math.min(r.left, innerWidth - 288))}px`,
      maxHeight: `${Math.min(below ? down : up, 420)}px`,
      width: "280px",
      [below ? "top" : "bottom"]: `${below ? r.bottom + 4 : innerHeight - r.top + 4}px`,
      "--transform-origin": below ? "top left" : "bottom left",
    });
    el.querySelector('[aria-checked="true"]')?.focus() || el.focus();
    el.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: "nearest" });
    setTimeout(() => {
      document.addEventListener("pointerdown", onOutside, true);
      document.addEventListener("keydown", onMenuKey, true);
    });
    loadLangs().catch((e) => warn(e.message || e));
  }

  function closeMenu() {
    if (!menu) return;
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("keydown", onMenuKey, true);
    menu.el.remove();
    menu = null;
  }
  const onOutside = (e) => { if (menu && !menu.el.contains(e.target) && !menu.anchor.contains(e.target)) closeMenu(); };
  function onMenuKey(e) {
    if (!menu) return;
    const items = [...menu.el.querySelectorAll('[role="menuitemradio"]')];
    const i = items.indexOf(document.activeElement);
    if (e.key === "Escape") { closeMenu(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
    else if ((e.key === "Enter" || e.key === " ") && i >= 0) items[i].click();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  // item highlight and click (the menu closes on selection, like the native ones)
  function hook(it, pick) {
    it.addEventListener("pointerenter", () => it.setAttribute("data-highlighted", ""));
    it.addEventListener("pointerleave", () => it.removeAttribute("data-highlighted"));
    it.addEventListener("focus", () => it.setAttribute("data-highlighted", ""));
    it.addEventListener("blur", () => it.removeAttribute("data-highlighted"));
    it.addEventListener("click", () => { closeMenu(); pick(); });
    return it;
  }

  function renderMenu() {
    if (!menu) return;
    const cur = lang();
    const all = langs?.s?.length ? langs.s : TOP_LANGS;
    const rest = all.filter((id) => !TOP_LANGS.includes(id)).sort((a, b) => langName(a).localeCompare(langName(b)));
    const item = (id) => {
      const it = document.createElement("div");
      it.className = ITEM_CLS;
      it.setAttribute("role", "menuitemradio");
      it.setAttribute("aria-checked", String(id.toLowerCase() === cur.toLowerCase()));
      it.tabIndex = -1;
      it.dataset.lang = id;
      const name = document.createElement("span");
      name.className = "flex-1";
      name.textContent = langName(id);
      it.append(name);
      if (st.dl?.id === id) it.insertAdjacentHTML("beforeend", `<span class="text-text-tertiary rtv-dl-pct">${Math.round(st.dl.p * 100)}%</span>`);
      else if (langs && !langs.i.includes(id)) {
        it.insertAdjacentHTML("beforeend", DL_SVG);
        it.title = "Downloads the language model when selected";
      }
      if (it.getAttribute("aria-checked") === "true") it.insertAdjacentHTML("beforeend", CHECK_SVG);
      return hook(it, () => setLang(id));
    };
    const focused = document.activeElement?.dataset?.lang;
    const title = document.createElement("div");
    title.className = TITLE_CLS;
    title.textContent = "Language";
    const sep = document.createElement("div");
    sep.className = "rtv-menu-sep border-t border-border-primary";
    const nodes = [title, ...TOP_LANGS.map(item), sep, ...rest.map(item)];
    if (!langs) {
      const wait = document.createElement("div");
      wait.className = ITEM_CLS;
      wait.setAttribute("data-disabled", "");
      wait.textContent = "Loading languages…";
      nodes.push(wait);
    }
    const scroll = menu.el.scrollTop;
    menu.el.replaceChildren(...nodes);
    menu.el.scrollTop = scroll;
    if (focused) menu.el.querySelector(`[data-lang="${focused}"]`)?.focus();
  }

  // --- Settings > Dictation ----------------------------------------------------
  // New item in the "Personal" group of the Settings nav, with the same classes
  // as the native ones. When active: hides the native content and shows ours in
  // the same place; any click on the native nav hands the screen back to React.
  const NAV_BTN_CLS =
    "flex w-full items-center rounded-[6px] px-2 py-1.5 text-left text-[13px] font-medium leading-4 text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-container-high)]";
  const NAV_ON_CLS = "bg-[var(--color-surface-container-high)]";
  const H2_CLS = "mb-6 text-[17px] font-medium text-[var(--color-text-primary)]";
  const CARD_CLS = "rounded-lg border border-[var(--color-border-secondary)] p-4";
  const CARD_TITLE_CLS = "text-sm font-medium text-[var(--color-text-primary)]";
  const CARD_DESC_CLS = "text-xs text-[var(--color-text-secondary)]";
  const SEG_CLS = "flex items-center gap-0.5 bg-surface h-9 p-1 rounded-md shrink-0";
  const SEG_BTN_CLS =
    "flex flex-1 items-center justify-center self-stretch whitespace-nowrap text-body font-medium leading-[calc(1_/_0.75)] transition-colors gap-2 rounded-md px-2.5";
  const SEG_ON_CLS = "bg-surface-container-high text-text-primary [[data-theme=light]_&]:bg-surface [[data-theme=light]_&]:shadow-sm";
  const SEG_OFF_CLS = "text-text-secondary hover:bg-surface-container-high";
  const FIELD_CLS =
    "inline-flex min-w-0 items-center justify-between gap-2 rounded-md border border-[var(--color-border-secondary)] bg-transparent px-2 py-1 text-sm text-[var(--color-text-primary)]";
  const BTN_CLS =
    "inline-flex cursor-pointer select-none items-center justify-center whitespace-nowrap ring-1 ring-inset text-[13px] font-medium outline-none transition-[colors,transform] duration-150 ease-out active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-focus/60 disabled:cursor-default disabled:pointer-events-none disabled:active:scale-100 ring-accent/40 bg-surface text-accent hover:bg-accent/10 h-7 gap-1 rounded-md px-2.5 disabled:bg-transparent disabled:ring-1 disabled:ring-border-secondary disabled:text-text-tertiary shrink-0";

  let settingsOn = false; // the Dictation section is open
  let panel = null; // { el, engine, lang, langNote, test, testOut, testNote }

  // Parts of the Settings screen (no testids: anchored on text, like the QA harness).
  function settingsParts() {
    const prefs = [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === "Preferences" && b.parentElement?.firstElementChild?.textContent.trim() === "Personal"
    );
    const sidebar = prefs?.closest(".w-60");
    const shell = sidebar?.parentElement;
    const scroller = shell && [...shell.children].find((c) => c !== sidebar);
    const pad = scroller?.firstElementChild;
    return pad ? { group: prefs.parentElement, sidebar, pad } : null;
  }

  function injectSettings() {
    const parts = settingsParts();
    if (!parts) {
      settingsOn = false;
      panel = null;
      return;
    }
    let nav = parts.group.querySelector(":scope > .rtv-nav-dictation");
    if (!nav) {
      nav = document.createElement("button");
      nav.type = "button";
      nav.className = `${NAV_BTN_CLS} rtv-nav-dictation`;
      nav.dataset.testid = "settings-nav-dictation";
      nav.innerHTML = '<span class="min-w-0 flex-1 truncate">Dictation</span>';
      nav.addEventListener("click", () => showSettings(true));
      parts.group.append(nav);
    }
    if (!parts.sidebar.rtvHooked) {
      parts.sidebar.rtvHooked = true;
      // click on a native item: hand the screen back to React
      parts.sidebar.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (settingsOn && b && !b.classList.contains("rtv-nav-dictation")) showSettings(false);
      }, true);
    }
    if (settingsOn) applySettings(parts);
  }

  function showSettings(on) {
    settingsOn = on;
    const parts = settingsParts();
    if (parts) applySettings(parts);
  }

  // Turns our section on/off over the native one (idempotent; runs on every mutation).
  function applySettings({ group, pad }) {
    const nav = group.querySelector(":scope > .rtv-nav-dictation");
    nav?.classList.toggle(NAV_ON_CLS, settingsOn);
    if (settingsOn) nav?.setAttribute("aria-current", "page");
    else nav?.removeAttribute("aria-current");
    // the active native item loses its highlight while our section is open
    for (const b of group.querySelectorAll(":scope > button:not(.rtv-nav-dictation)")) b.toggleAttribute("data-rtv-off", settingsOn);
    for (const c of pad.children) if (!c.classList.contains("rtv-settings")) c.toggleAttribute("data-rtv-hidden", settingsOn);
    if (!settingsOn) {
      pad.querySelector(":scope > .rtv-settings")?.remove();
      panel = null;
      return;
    }
    if (!panel || !panel.el.isConnected || panel.el.parentElement !== pad) {
      pad.querySelector(":scope > .rtv-settings")?.remove();
      panel = buildPanel();
      pad.append(panel.el);
      loadLangs().catch(() => {});
    }
    renderSettings();
  }

  function card(title, desc, control) {
    const c = document.createElement("div");
    c.className = CARD_CLS;
    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-4";
    const txt = document.createElement("div");
    txt.innerHTML = `<div class="${CARD_TITLE_CLS}"></div><div class="${CARD_DESC_CLS}"></div>`;
    txt.firstChild.textContent = title;
    txt.lastChild.textContent = desc;
    row.append(txt);
    if (control) row.append(control);
    c.append(row);
    return c;
  }

  function buildPanel() {
    const el = document.createElement("div");
    el.className = "rtv-settings";
    el.innerHTML = `<h2 class="${H2_CLS}">Dictation</h2><div class="max-w-[550px] space-y-4"></div>`;
    const body = el.lastChild;

    // Engine: segmented control like "Appearance"
    const seg = document.createElement("div");
    seg.className = SEG_CLS;
    seg.dataset.testid = "settings-dictation-engine";
    for (const e of ENGINES) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.value = e.id;
      b.textContent = e.short;
      b.title = e.hint;
      b.addEventListener("click", () => setEngine(e.id));
      seg.append(b);
    }
    const engineCard = card("Engine", "On-device. No cloud, no API key.", seg);
    const engineNote = document.createElement("div");
    engineNote.className = `${CARD_DESC_CLS} rtv-engine-note`;
    engineCard.append(engineNote);

    // Language: field that opens the list (PT-BR and EN-US on top)
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = `${FIELD_CLS} rtv-lang-field`;
    pick.dataset.testid = "settings-dictation-language";
    pick.addEventListener("click", (e) => {
      e.stopPropagation();
      menu?.anchor === pick ? closeMenu() : openMenu(pick);
    });
    const langCard = card("Language", "Dictation language. Defaults to the system language.", pick);
    const langNote = document.createElement("div");
    langNote.className = `${CARD_DESC_CLS} rtv-lang-note`;
    langCard.append(langNote);

    // Test microphone: 3 s with the selected engine and language
    const test = document.createElement("button");
    test.type = "button";
    test.className = BTN_CLS;
    test.dataset.testid = "settings-dictation-test";
    test.addEventListener("click", () => {
      if (st.phase === "idle" || st.phase === "error") start(null, testOut);
    });
    const testCard = card("Test microphone", "Records 3 s with the selected engine and language and shows the text.", test);
    const testOut = document.createElement("div");
    testOut.className = "rtv-test-out text-sm text-[var(--color-text-primary)]";
    const testNote = document.createElement("div");
    testNote.className = `${CARD_DESC_CLS} rtv-test-note`;
    testCard.append(testOut, testNote);

    body.append(engineCard, langCard, testCard);
    return { el, seg, engineNote, pick, langNote, test, testOut, testNote };
  }

  function renderSettings() {
    if (!panel?.el.isConnected) return;
    const eng = engine();
    for (const b of panel.seg.children) {
      const on = b.dataset.value === eng;
      b.className = `${SEG_BTN_CLS} ${on ? SEG_ON_CLS : SEG_OFF_CLS}`;
      b.setAttribute("aria-pressed", String(on));
    }
    panel.engineNote.textContent = ENGINES.find((e) => e.id === eng).hint;
    panel.engineNote.toggleAttribute("data-warn", eng === "dictation");
    const id = lang();
    const field = `<span class="truncate">${langName(id)}</span>${CHEVRON_SVG}`;
    if (panel.pick.innerHTML !== field) panel.pick.innerHTML = field;
    const dl = st.dl?.id === id ? st.dl : null;
    panel.langNote.textContent = dl
      ? `Downloading ${langName(id)}… ${Math.round(dl.p * 100)}%`
      : langs && !langs.i.includes(id) ? "Model not installed: it downloads on first use." : "";
    const testing = st.sess?.box === panel.testOut;
    panel.test.disabled = (st.phase === "recording" || st.phase === "finishing");
    panel.test.textContent = testing ? (st.phase === "recording" ? "Recording…" : "Transcribing…") : "Test";
    panel.testNote.textContent = st.phase === "error" && !st.sess ? st.err : "";
  }

  // Right-click on the mic: opens Settings on the Dictation section.
  function openSettings() {
    settingsOn = true;
    if (settingsParts()) return showSettings(true);
    document.querySelector('button[aria-label="Settings"]')?.click();
    // the screen mounts next; the observer applies it (settingsOn is already on)
  }

  // --- mic button ------------------------------------------------------------------
  const findRoot = (el) => el?.closest(`:has(${SEL_EDITOR})`) || null;

  function paint(btn) {
    // composer buttons: the session's composer (if React swapped the composer
    // container mid-session, the state applies to all); field buttons: their field.
    // A handed-off session still settling shows as "finishing" on its own button.
    const h = btn.rtvHandle;
    const mine = h ? st.h === h : !st.h && st.root && (!st.root.isConnected || st.root === findRoot(btn));
    const settling = !mine && [...st.bg].some((s) => (h ? s.h === h : !s.h && !s.box));
    const phase = mine ? st.phase : settling ? "finishing" : "idle";
    const dl = st.dl || (mine && st.sess?.dl != null ? { id: lang(), p: st.sess.dl } : null);
    const what = `${langName(lang())} · ${ENGINES.find((e) => e.id === engine()).name}`;
    const pct = dl ? `Downloading language… ${Math.round(dl.p * 100)}%` : "";
    // tooltip [title, caption] (same look as the composer tooltips)
    const tips = {
      idle: ["Dictation", pct || what],
      recording: ["Stop dictation", pct || (h ? `${what} · Esc cancels` : what)],
      finishing: ["Finishing transcription…", what],
      error: ["Dictation", st.err],
    };
    const [title, caption] = tips[phase];
    const label = `${title} · ${caption}`;
    if (btn.dataset.rtvState === phase && btn.getAttribute("aria-label") === label) return;
    btn.dataset.rtvState = phase;
    btn.toggleAttribute("data-rtv-dl", !!dl);
    btn.setAttribute("aria-pressed", phase === "recording" ? "true" : "false");
    if ("disabled" in btn) btn.disabled = phase === "finishing";
    btn.setAttribute("aria-label", label);
    btn.rtvTip = [title, caption];
    // a caller's own toggle (attach opts.button = element) keeps its content
    if (!h || h.own) btn.innerHTML = phase === "recording" ? STOP_SVG : phase === "finishing" ? BUSY_SVG : MIC_SVG;
    if (tip?.btn === btn) renderTip();
  }

  // --- mic tooltip (classes of the composer's native tooltip) -------------------
  let tip = null; // { btn, el, timer }
  function showTip(btn) {
    hideTip();
    tip = { btn, el: null, timer: setTimeout(renderTip, 450) };
  }
  function hideTip() {
    if (!tip) return;
    clearTimeout(tip.timer);
    tip.el?.remove();
    tip = null;
  }
  function renderTip() {
    if (!tip || !tip.btn.isConnected) return hideTip();
    const [title, caption] = tip.btn.rtvTip || ["Dictation", ""];
    if (!tip.el) {
      tip.el = document.createElement("div");
      tip.el.className = "group/tooltip rtv-tip";
      tip.el.dataset.side = "top";
      tip.el.innerHTML =
        '<div class="relative z-50 max-w-[240px] overflow-visible rounded-[6px] border border-border-secondary bg-surface-container-high text-text-primary shadow-[var(--shadow-popover)] p-2" style="border-width: var(--border-width-thin)">' +
        '<span class="flex min-w-0 flex-col gap-1"><span class="min-w-0 text-label leading-label text-text-primary"></span>' +
        '<span class="text-caption leading-caption text-text-tertiary"></span>' +
        '<span class="text-caption leading-caption text-text-tertiary">Right-click: Settings › Dictation</span></span>' +
        '<span aria-hidden="true" class="pointer-events-none absolute block size-2 rotate-45 border border-border-secondary bg-surface-container-high left-1/2 -translate-x-1/2" style="bottom: -4px; border-left-width: 0; border-top-width: 0"></span></div>';
      // fixed and sized to its content before measuring
      Object.assign(tip.el.style, { position: "fixed", zIndex: 9999, left: "0px", top: "0px", width: "max-content" });
      document.body.append(tip.el);
    }
    const spans = tip.el.querySelectorAll(".flex-col > span");
    spans[0].textContent = title;
    spans[1].textContent = caption;
    const r = tip.btn.getBoundingClientRect();
    const w = tip.el.offsetWidth;
    const h = tip.el.offsetHeight;
    Object.assign(tip.el.style, {
      left: `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8))}px`,
      top: `${r.top - h - 8}px`,
    });
  }

  function paintAll() {
    document.querySelectorAll("button.rtv-mic").forEach(paint);
    for (const h of handles) if (h.btn && !h.own) paint(h.btn);
    renderSettings();
    if (menu && st.dl) renderMenu();
  }

  function makeButton(row) {
    const btn = document.createElement("button");
    btn.type = "button";
    // inherits the classes of the composer's own "+" button (size, hover, focus)
    btn.className = `${row.querySelector(SEL_ATTACH)?.className || ""} rtv-mic`.trim();
    btn.dataset.testid = "chat-input-voice-button";
    btn.addEventListener("pointerenter", () => ensureBinary().catch(() => {}), { once: true });
    btn.addEventListener("pointerenter", () => showTip(btn));
    btn.addEventListener("pointerleave", hideTip);
    btn.addEventListener("pointerdown", hideTip);
    btn.addEventListener("mousedown", (e) => e.preventDefault()); // do not steal focus from the editor
    btn.addEventListener("contextmenu", (e) => { e.preventDefault(); openSettings(); });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Option-click (hidden shortcut): toggles PT/EN
      if (e.altKey && st.phase !== "recording" && st.phase !== "finishing") {
        setLang(/^pt/i.test(lang()) ? "en-US" : "pt-BR");
        return;
      }
      // while a field dictates, the composer's mic takes over (hand-off) instead of stopping it
      if (st.phase === "recording" && !st.h) stop();
      else if (st.phase === "idle" || st.phase === "error" || st.h) start(findRoot(btn));
    });
    paint(btn);
    return btn;
  }

  // --- Space tap shortcut -----------------------------------------------------------
  // A quick Space tap (down and up within TAP_MS, no repeat, no modifier, no other
  // key in between) in the focused composer does what clicking its mic does: with
  // the editor empty it starts dictation; while recording it stops it (no send).
  // An empty editor never needs a leading space, so Space is always swallowed there
  // (even when the press turns into a hold). While recording with text in the
  // editor, only an isolated press (no key in the previous ISOLATE_MS, i.e. not
  // typing) is held back; if it turns out not to be a tap (held, repeated, another
  // key, focus moved), the space is typed right then, before anything else.
  const TAP_MS = 250;
  const ISOLATE_MS = 500;
  const SEL_POPUP =
    '[role="menu"], [cmdk-list], [data-radix-popper-content-wrapper] [role="listbox"], [role="dialog"][aria-modal="true"]';
  let tap = null; // { t0, el, ed, root, empty, owed, broken }
  let lastKeyAt = -Infinity;

  // doc text only: the live dictation widget is a decoration, not doc content
  const docEmpty = (ed) => {
    const d = ed.state.doc;
    return d.textBetween(0, d.content.size, "\n", "￼") === "";
  };

  // The focused composer editor and its root, resolved like its mic button
  // (root = findRoot(mic)); null when focus is elsewhere or a menu/popup is open.
  function focusedComposer(e) {
    const el = document.activeElement?.closest?.(SEL_EDITOR);
    const ed = el?.editor;
    if (!ed || ed.isDestroyed || !ed.isEditable || !el.contains(e.target)) return null;
    if (menu || [...document.querySelectorAll(SEL_POPUP)].some((p) => !p.contains(el) && p.getClientRects().length)) return null;
    for (let a = el.parentElement; a; a = a.parentElement) {
      const mics = a.querySelectorAll("button.rtv-mic");
      if (!mics.length) continue;
      for (const btn of mics) {
        const root = findRoot(btn);
        if (root?.querySelector(SEL_EDITOR) === el) return { el, ed, root };
      }
      return null; // the nearest mic belongs to another composer
    }
    return null;
  }

  // types a held-back space the way the editor would (input rules first)
  function settle(t) {
    if (!t?.owed) return;
    t.owed = false;
    if (t.ed.isDestroyed) return;
    const v = t.ed.view;
    const { from, to } = v.state.selection;
    if (!v.someProp("handleTextInput", (f) => f(v, from, to, " "))) v.dispatch(v.state.tr.insertText(" ", from, to).scrollIntoView());
  }

  const swallow = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  function onSpaceDown(e) {
    const quiet = e.timeStamp - lastKeyAt;
    lastKeyAt = e.timeStamp;
    if (e.key !== " ") {
      // another key while Space is down: not a tap (a held-back space goes in first)
      if (tap) {
        tap.broken = true;
        settle(tap);
      }
      return;
    }
    if (e.isComposing || e.defaultPrevented) return;
    const mod = e.shiftKey || e.altKey || e.ctrlKey || e.metaKey;
    if (e.repeat) {
      // held: not a tap; repeats type normally, except into an empty editor
      if (tap) {
        tap.broken = true;
        settle(tap);
      }
      const c = !mod && focusedComposer(e);
      if (c && docEmpty(c.ed)) swallow(e);
      return;
    }
    settle(tap); // a press whose keyup never arrived
    tap = null;
    if (mod) return;
    const c = focusedComposer(e);
    if (!c) return;
    const empty = docEmpty(c.ed);
    // with text in the editor a tap can only stop a recording, and typing never does
    // (a field's recording is not the composer's: its mic or Escape ends it)
    if (!empty && (st.phase !== "recording" || st.h || quiet < ISOLATE_MS)) return;
    swallow(e);
    tap = { t0: e.timeStamp, ...c, empty, owed: !empty, broken: false };
  }

  function onSpaceUp(e) {
    if (e.key !== " " || !tap) return;
    const t = tap;
    tap = null;
    const quick = !t.broken && e.timeStamp - t.t0 <= TAP_MS && document.activeElement === t.el && !t.ed.isDestroyed;
    if (quick && st.phase === "recording" && !st.h) {
      t.owed = false; // the tap ends the recording: no space
      stop();
    } else if (quick && t.empty && (st.phase === "idle" || st.phase === "error" || st.h) && docEmpty(t.ed)) {
      start(t.root);
    }
    settle(t);
  }

  // the window lost focus mid-press: no tap, but a held-back space still goes in
  function onSpaceBlur() {
    settle(tap);
    tap = null;
  }

  document.addEventListener("keydown", onSpaceDown, true);
  document.addEventListener("keyup", onSpaceUp, true);
  window.addEventListener("blur", onSpaceBlur);

  // --- dictation in any field (attach / autoAttach) ------------------------------
  // h = { el, kind, opts, btn, own, place, pads, offs, ro, auto, api }
  // kind: "text" (<input>/<textarea>) | "editable" (contenteditable) | "pm" (TipTap)
  const handles = new Set();
  const byEl = new WeakMap(); // field -> h
  const autos = []; // { sel, opts, hs }
  const bgHas = (h) => [...st.bg].some((s) => s.h === h);
  const phaseOf = (h) => (st.h === h ? st.phase : bgHas(h) ? "finishing" : "idle");
  const editorOf = (el) =>
    el.editor || el.querySelector(".ProseMirror")?.editor || el.closest(".ProseMirror")?.editor || null;
  const isComposer = (el) => !!(el.closest(SEL_EDITOR) || el.querySelector(SEL_EDITOR));
  const fieldOf = (el) => (el.matches(SEL_FIELD) ? el : el.querySelector(SEL_FIELD));
  function kindOf(el) {
    if (el instanceof HTMLTextAreaElement) return "text";
    if (el instanceof HTMLInputElement) return /^(text|search|url|email|tel)$/.test(el.type) ? "text" : null;
    if (!el.isContentEditable && !/^(|true|plaintext-only)$/.test(el.getAttribute("contenteditable") ?? "-")) return null;
    return editorOf(el)?.view ? "pm" : "editable";
  }

  function toggleField(h) {
    const p = phaseOf(h);
    if (p === "recording") return stop();
    if (p !== "finishing") return start(null, null, h);
  }

  // same behaviour as the composer's mic (tooltip, Option-click, right-click → Settings)
  function wire(btn, h) {
    const on = (type, fn, o) => {
      btn.addEventListener(type, fn, o);
      h.offs.push(() => btn.removeEventListener(type, fn, o));
    };
    on("pointerenter", () => ensureBinary().catch(() => {}), { once: true });
    on("pointerenter", () => showTip(btn));
    on("pointerleave", hideTip);
    on("pointerdown", hideTip);
    on("mousedown", (e) => e.preventDefault()); // the focus (and caret) stay in the field
    on("contextmenu", (e) => {
      e.preventDefault();
      openSettings();
    });
    on("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const p = phaseOf(h);
      // Option-click (hidden shortcut): toggles PT/EN
      if (e.altKey && p !== "recording" && p !== "finishing") return setLang(/^pt/i.test(lang()) ? "en-US" : "pt-BR");
      toggleField(h);
    });
  }

  function attach(target, opts = {}) {
    const el = target instanceof Element ? fieldOf(target) : null;
    const kind = el && kindOf(el);
    if (!kind) throw new TypeError("voice-input attach: expected an <input>, a <textarea> or a contenteditable element");
    if (isComposer(el)) throw new Error("voice-input attach: the chat composer has its own dictation");
    const had = byEl.get(el);
    if (had) return had.api;
    const o = { button: true, placement: "inside-end", ...opts };
    const place = ["before", "after"].includes(o.placement) ? o.placement : "inside-end";
    const h = { el, kind, opts: o, btn: null, own: false, place, pads: [], offs: [], ro: null, auto: null };
    h.api = {
      el,
      get state() {
        return phaseOf(h);
      },
      get button() {
        return h.btn;
      },
      start: () => start(null, null, h),
      stop: () => (st.h === h && st.phase === "recording" ? stop() : Promise.resolve()),
      toggle: () => toggleField(h),
      cancel: () => (st.sess?.h === h ? cancel(st.sess) : false),
      destroy: () => detach(h),
    };
    if (o.button === true && el.parentElement) {
      const btn = (h.btn = document.createElement("button"));
      h.own = true;
      btn.type = "button";
      btn.className = "rtv-mic rtv-mic-field";
      btn.dataset.testid = "voice-field-button";
      btn.dataset.rtvPlace = place;
      if (place === "before") el.before(btn);
      else el.after(btn);
      if (place === "inside-end") {
        // the text stops short of the button (and so does a backdrop that mirrors it)
        for (const n of [el, ...backdrops(el)]) {
          h.pads.push([n, n.style.paddingRight]);
          n.style.paddingRight = `${(parseFloat(getComputedStyle(n).paddingRight) || 0) + RESERVE}px`;
        }
      }
    } else if (o.button instanceof HTMLElement) h.btn = o.button;
    handles.add(h);
    byEl.set(el, h);
    if (h.btn) {
      h.btn.rtvHandle = h;
      wire(h.btn, h);
      paint(h.btn);
    }
    if (h.own && typeof ResizeObserver === "function") {
      h.ro = new ResizeObserver(() => syncField(h));
      h.ro.observe(el);
    }
    syncField(h);
    return h.api;
  }

  function detach(h) {
    if (!handles.has(h)) return;
    for (const s of [st.sess, ...st.bg]) if (s?.h === h) cancel(s);
    if (st.h === h) setPhase("idle");
    handles.delete(h);
    byEl.delete(h.el);
    h.auto?.hs.delete(h);
    h.ro?.disconnect();
    for (const off of h.offs) off();
    for (const [n, v] of h.pads) n.style.paddingRight = v;
    if (tip?.btn === h.btn) hideTip();
    if (h.own) h.btn.remove();
    else if (h.btn) {
      delete h.btn.rtvHandle;
      h.btn.removeAttribute("data-rtv-state");
    }
  }

  // Shows/hides the mic with its field (disabled, read-only or not rendered:
  // hidden, unless it is recording) and keeps an "inside-end" mic over the
  // right end of the field, centered on the last line (an input: centered).
  function syncField(h) {
    const { el, btn } = h;
    if (!btn || !h.own) return;
    if (btn.parentNode !== el.parentNode && el.parentNode) {
      if (h.place === "before") el.before(btn);
      else el.after(btn);
    }
    const usable = el.isConnected && !el.disabled && !el.readOnly && el.getClientRects().length > 0;
    const hide = !usable && phaseOf(h) === "idle";
    if (btn.hidden !== hide) btn.hidden = hide;
    if (h.place !== "inside-end" || btn.hidden || !el.isConnected) return;
    const cs = getComputedStyle(el);
    const n = (p) => parseFloat(cs[p]) || 0;
    const H = el.offsetHeight;
    const lh = parseFloat(cs.lineHeight) || n("fontSize") * 1.2;
    const inner = H - n("paddingTop") - n("paddingBottom") - n("borderTopWidth") - n("borderBottomWidth");
    const mid = el instanceof HTMLInputElement ? H / 2 : H - n("borderBottomWidth") - n("paddingBottom") - Math.min(lh, inner) / 2;
    const bw = btn.offsetWidth || 24;
    const bh = btn.offsetHeight || 24;
    pin(btn, el, el.offsetWidth - n("borderRightWidth") - bw - 2, mid - bh / 2);
  }

  let fieldsQueued = false;
  function syncFieldsSoon() {
    if (fieldsQueued || !handles.size) return;
    fieldsQueued = true;
    requestAnimationFrame(() => {
      fieldsQueued = false;
      for (const h of handles) syncField(h);
    });
  }

  function autoAttach(selector, opts = {}) {
    document.querySelectorAll(selector); // an invalid selector throws here, not on every scan
    const a = { sel: selector, opts, hs: new Set() };
    autos.push(a);
    scanAuto();
    return () => {
      const i = autos.indexOf(a);
      if (i >= 0) autos.splice(i, 1);
      for (const h of [...a.hs]) detach(h);
    };
  }

  // (on every DOM change, batched per frame) attaches to new matches, lets go
  // of fields that left the page and re-places the mics
  function scanAuto() {
    for (const h of [...handles]) if (h.auto && !h.el.isConnected && phaseOf(h) === "idle" && st.h !== h) detach(h);
    for (const a of autos) {
      for (const m of document.querySelectorAll(a.sel)) {
        if (m.closest(".rtv-mirror, .rtv-settings")) continue;
        const el = fieldOf(m);
        if (!el || byEl.has(el) || isComposer(el) || !kindOf(el)) continue;
        try {
          attach(el, a.opts);
          const h = byEl.get(el);
          h.auto = a;
          a.hs.add(h);
        } catch (e) {
          warn("autoAttach", e);
        }
      }
    }
    for (const h of handles) syncField(h);
  }

  // While a field dictates: Escape cancels it (before the panel's own Escape
  // closes anything), and Enter in that field stops the dictation, waits for the
  // final words and sends (stopAndSend). Shift+Enter is left alone (a new line).
  // The composer keeps its own keys.
  function onFieldKey(e) {
    const s = st.sess;
    if (!s?.h || e.isComposing || e.rtvSend) return;
    if (e.key === "Escape") {
      if (menu || s.finished || e.defaultPrevented) return;
      swallow(e);
      cancel(s);
    } else if (e.key === "Enter" && !e.shiftKey && s.h.el.contains(e.target)) {
      swallow(e);
      if (s.cancelled) return;
      s.sendMods = { metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey }; // Cmd+Enter keeps its meaning
      // the dictation already ending (its last words being written in): it
      // sends once they are in, instead of the Enter being lost
      if (s.finished) s.sendOnEnd = true;
      else stopAndSend(s);
    }
  }
  window.addEventListener("keydown", onFieldKey, true);
  window.addEventListener("resize", syncFieldsSoon);
  document.addEventListener("scroll", syncFieldsSoon, true);

  // the agent panel's reply (comment-bubbles) and the canvas comment threads
  autoAttach(AUTO_SEL, { button: true, placement: "inside-end" });

  let scheduled = false;
  function inject() {
    scheduled = false;
    for (const action of document.querySelectorAll(SEL_ACTION)) {
      const row = action.closest(".justify-between") || action.parentElement;
      if (!row || !findRoot(row)) continue;
      const slot = [...row.children].find((c) => c.contains(action));
      const prev = slot?.previousElementSibling;
      if (prev?.classList.contains("rtv-mic")) continue;
      row.querySelectorAll(":scope > .rtv-voice, :scope > .rtv-mic").forEach((b) => b.remove());
      row.insertBefore(makeButton(row), slot);
    }
    injectSettings();
    scanAuto();
  }
  const schedule = () => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(inject);
    }
  };

  const obs = new MutationObserver(schedule);
  const boot = () => {
    obs.observe(document.body, { childList: true, subtree: true });
    inject();
  };
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot, { once: true });

  window.__RE_TEMPO_VOICE__ = {
    state: () => ({
      phase: st.phase,
      err: st.err,
      lang: lang(),
      engine: engine(),
      dl: st.dl,
      bin: BIN,
      target: st.h ? "field" : st.root ? "composer" : null,
      settling: st.bg.size,
    }),
    langs: () => loadLangs(),
    timeline: () => st.timeline.slice(),
    start: () => start(findRoot(document.querySelector(SEL_EDITOR))),
    stop,
    cancel: () => cancel(st.sess),
    replay,
    attach,
    autoAttach,
    fields: () => [...handles].map((h) => h.api),
    dispose() {
      obs.disconnect();
      document.removeEventListener("keydown", onSpaceDown, true);
      document.removeEventListener("keyup", onSpaceUp, true);
      window.removeEventListener("blur", onSpaceBlur);
      window.removeEventListener("keydown", onFieldKey, true);
      window.removeEventListener("resize", syncFieldsSoon);
      document.removeEventListener("scroll", syncFieldsSoon, true);
      document.removeEventListener("visibilitychange", onVisibility);
      tap = null;
      autos.length = 0;
      for (const h of [...handles]) detach(h);
      for (const s of [st.sess, ...st.bg]) {
        if (!s) continue;
        s.finished = true;
        clearTimeout(s.cap);
        clearTimeout(s.finTimer);
        stopAudio(s);
        s.proc?.close();
        s.live?.destroy();
      }
      closeMenu();
      hideTip();
      showSettings(false);
      for (const t of [...ticks]) untick(t);
      document.querySelectorAll(".rtv-voice, button.rtv-mic, .rtv-nav-dictation, .rtv-mirror").forEach((b) => b.remove());
    },
  };
})();
