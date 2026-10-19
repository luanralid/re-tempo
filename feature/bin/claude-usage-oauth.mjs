#!/usr/bin/env node
/*
 * RE-TEMPO · claude-usage-oauth — Claude plan usage including per-model limits
 * ---------------------------------------------------------------------------
 * Writes ~/.local/state/claude-usage/oauth-usage.json with Session (five_hour),
 * Weekly (seven_day) and the per-model weekly limits (model_scoped, e.g. Fable),
 * which the Claude Code statusline never receives.
 *
 * How: starts the user's INSTALLED `claude` (the one `command -v claude` finds in
 * the login shell) through the Agent SDK bundled with RE-TEMPO and only sends the
 * `get_usage` control request. No user message is ever sent, so there is no model
 * turn; the CLI fetches usage with its own login (this script never reads the
 * token). No settings (no hooks/plugins/statusline), no MCP, no session file.
 *
 * Usage: HOME=<your real home> node claude-usage-oauth.mjs
 *   CLAUDE_BIN=<path>            force the claude binary
 *   RE_TEMPO_AGENT_SDK=<sdk.mjs> force the Agent SDK
 *   RTU_DEBUG_FILE=<file>        pass --debug-file to the CLI (audit API requests)
 * Output: one "RTU:{json}" line on stdout (no token, no email) and the file.
 * ---------------------------------------------------------------------------
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HOME = process.env.HOME;
const STATE_DIR = path.join(HOME || "", ".local/state/claude-usage");
const OUT = path.join(STATE_DIR, "oauth-usage.json");
const LOCK = path.join(STATE_DIR, ".oauth-usage.lock");
const LOCK_STALE_MS = 2 * 60 * 1000;
const TIMEOUT_MS = 45 * 1000;
// The SDK of the app this script was copied into (install.sh: <app>/out/renderer/mod/bin),
// else ~/RE-TEMPO (mods symlinked from the repo resolve to the repo, not the app).
const SDK_IN_APP = "node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs";
const SDK_HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..", SDK_IN_APP);
const SDK =
  process.env.RE_TEMPO_AGENT_SDK ||
  (fs.existsSync(SDK_HERE) ? SDK_HERE : path.join(HOME || "", "RE-TEMPO/RE-TEMPO.app/Contents/Resources/app", SDK_IN_APP));

const started = Date.now();
const say = (o) => process.stdout.write(`RTU:${JSON.stringify({ ...o, ms: Date.now() - started })}\n`);

function fail(error, code = 1) {
  say({ ok: false, error });
  process.exit(code);
}

// The claude the user runs in a terminal: CLAUDE_BIN, else the inherited PATH (the
// mod starts this script from an interactive login shell), else the interactive
// login shell's `command -v claude` (~/.local/bin is set in .zshrc), else the
// native installer default ~/.local/bin/claude.
function claudeBin() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const isExec = (p) => {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return fs.statSync(p).isFile();
    } catch (_) {
      return false;
    }
  };
  for (const dir of (process.env.PATH || "").split(":")) {
    if (dir && isExec(path.join(dir, "claude"))) return path.join(dir, "claude");
  }
  try {
    const out = execFileSync("/bin/zsh", ["-ilc", "command -v claude"], {
      env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME, USER: process.env.USER || "", SHELL: "/bin/zsh", TERM: "dumb" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10000,
    });
    const hit = out.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("/") && isExec(l)).pop();
    if (hit) return hit;
  } catch (_) {
    /* fall through to the default location */
  }
  const fallback = path.join(HOME, ".local/bin/claude");
  return isExec(fallback) ? fallback : null;
}

function takeLock() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  try {
    fs.closeSync(fs.openSync(LOCK, "wx", 0o600));
    return true;
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    if (Date.now() - fs.statSync(LOCK).mtimeMs < LOCK_STALE_MS) return false;
    fs.rmSync(LOCK, { force: true });
    return takeLock();
  }
}

const iso = (v) => {
  if (v == null) return null;
  const ms = typeof v === "number" ? (v > 1e11 ? v : v * 1000) : Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};
const pct = (w) => {
  const v = w && (w.utilization ?? w.used_percentage ?? w.percent);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};
const win = (w) => (w ? { used_percentage: pct(w), resets_at: iso(w.resets_at) } : null);

function writeAtomic(data) {
  const tmp = `${OUT}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, OUT);
}

async function main() {
  if (!HOME || !path.isAbsolute(HOME)) fail("HOME missing");
  if (!takeLock()) return say({ ok: false, skipped: "locked" });
  const watchdog = setTimeout(() => {
    fs.rmSync(LOCK, { force: true });
    fail("timed out", 2);
  }, TIMEOUT_MS);
  try {
    const bin = claudeBin();
    if (!bin || !fs.existsSync(bin)) throw new Error(`claude not found (${bin || "empty"})`);
    const { query } = await import(pathToFileURL(SDK).href);

    // Input that never yields a message: the CLI only answers control requests.
    let release;
    const closed = new Promise((r) => (release = r));
    async function* noInput() {
      await closed;
    }
    const ac = new AbortController();
    const env = {
      HOME,
      PATH: process.env.PATH || "/usr/bin:/bin",
      USER: process.env.USER,
      LOGNAME: process.env.LOGNAME || process.env.USER,
      SHELL: process.env.SHELL || "/bin/zsh",
      TMPDIR: process.env.TMPDIR,
      LANG: process.env.LANG || "en_US.UTF-8",
      // only the usage GET: no claude.ai connector listing, no telemetry/updater
      ENABLE_CLAUDEAI_MCP_SERVERS: "false",
      DISABLE_TELEMETRY: "1",
      DISABLE_ERROR_REPORTING: "1",
      DISABLE_AUTOUPDATER: "1",
    };
    const q = query({
      prompt: noInput(),
      options: {
        pathToClaudeCodeExecutable: bin,
        cwd: STATE_DIR,
        env,
        settingSources: [],
        mcpServers: {},
        strictMcpConfig: true,
        persistSession: false,
        abortController: ac,
        extraArgs: process.env.RTU_DEBUG_FILE ? { "debug-file": process.env.RTU_DEBUG_FILE } : {},
        stderr: () => {},
      },
    });
    // Everything the CLI emits; a model turn would show up as assistant/result.
    const seen = {};
    const drain = (async () => {
      try {
        for await (const m of q) {
          const k = m.type + (m.subtype ? `:${m.subtype}` : "");
          seen[k] = (seen[k] || 0) + 1;
        }
      } catch (_) {
        /* ended by abort */
      }
    })();

    const account = await q.accountInfo().catch(() => null);
    const usage = await q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true });
    release();
    await Promise.race([drain, new Promise((r) => setTimeout(r, 3000))]);
    ac.abort();

    const rl = usage && usage.rate_limits;
    if (!rl)
      throw new Error(
        usage && usage.rate_limits_available === false ? "rate limits unavailable (no subscription login)" : "get_usage returned no rate_limits"
      );
    const data = {
      updated_at: new Date().toISOString(),
      source: "get_usage",
      cli: fs.realpathSync(bin),
      account: account
        ? { email: account.email || null, organization: account.organization || null, subscription_type: account.subscriptionType || usage.subscription_type || null }
        : { subscription_type: usage.subscription_type || null },
      five_hour: win(rl.five_hour),
      seven_day: win(rl.seven_day),
      ...(rl.seven_day_opus ? { seven_day_opus: win(rl.seven_day_opus) } : {}),
      ...(rl.seven_day_sonnet ? { seven_day_sonnet: win(rl.seven_day_sonnet) } : {}),
      model_scoped: (rl.model_scoped || []).map((m) => ({ model: m.display_name, percent: pct(m), resets_at: iso(m.resets_at) })),
    };
    writeAtomic(data);
    say({
      ok: true,
      file: OUT,
      five_hour: data.five_hour,
      seven_day: data.seven_day,
      model_scoped: data.model_scoped,
      messages: seen,
    });
  } finally {
    clearTimeout(watchdog);
    fs.rmSync(LOCK, { force: true });
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => fail(String((e && e.message) || e).slice(0, 300)));
