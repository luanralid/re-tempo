// qa/lib/windows.mjs — moves QA instance windows off the user's screen.
// -----------------------------------------------------------------------------
// Why not via CDP: this Electron does NOT implement Browser.getWindowForTarget /
// Browser.setWindowBounds ("wasn't found"). And window.moveTo is clamped by macOS
// (it does not leave the screen). What works: System Events (AppleScript) by the UNIX ID
// of the main process, minimizing (AXMinimized) or pushing it off-screen.
// Needs Accessibility permission for the controlling process (already
// granted in this environment); if missing, it is best-effort and the window stays visible
// (documented). ALWAYS targets a specific pid (the instance's main), never the
// app by name — so it does not touch windows of other instances or of the user.
import { execFile } from "node:child_process";

function osa(script, timeoutMs = 6000) {
  return new Promise((resolve) => {
    execFile("/usr/bin/osascript", ["-e", script], { timeout: timeoutMs, encoding: "utf8" }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: (stdout || "").trim(), err: err ? (stderr || err.message).trim() : null });
    });
  });
}

// Minimizes all windows of process `pid`. `mode:"offscreen"` pushes them
// off-screen instead of minimizing (no Dock icon, keeps compositing active).
export async function hidePidWindows(pid, { mode = "minimized" } = {}) {
  if (!Number.isInteger(pid)) return { pid, hidden: 0, error: "invalid pid" };
  const action =
    mode === "offscreen"
      ? `set position of w to {-32000, -32000}`
      : `set value of attribute "AXMinimized" of w to true`;
  const script =
    `tell application "System Events"\n` +
    `  try\n` +
    `    tell (first process whose unix id is ${pid})\n` +
    `      set c to 0\n` +
    `      repeat with w in windows\n` +
    `        try\n` +
    `          ${action}\n` +
    `          set c to c + 1\n` +
    `        end try\n` +
    `      end repeat\n` +
    `      return c\n` +
    `    end tell\n` +
    `  on error errMsg number errNum\n` +
    `    return "ERR " & errNum\n` +
    `  end try\n` +
    `end tell`;
  const r = await osa(script);
  if (!r.ok) return { pid, hidden: 0, error: r.err };
  if (r.out.startsWith("ERR")) return { pid, hidden: 0, error: r.out };
  return { pid, hidden: parseInt(r.out, 10) || 0, error: null };
}

// Hides the windows of several mains (an instance can have >1 main process during
// the relaunch window). Returns the total hidden and errors (without throwing).
export async function hideMains(mainPids, opts) {
  let hidden = 0;
  const errors = [];
  for (const pid of mainPids || []) {
    const r = await hidePidWindows(pid, opts);
    hidden += r.hidden;
    if (r.error) errors.push(`${pid}:${r.error}`);
  }
  return { hidden, errors: errors.length ? errors : null };
}
