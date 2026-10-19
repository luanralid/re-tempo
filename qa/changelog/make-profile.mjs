#!/usr/bin/env node
// qa/changelog/make-profile.mjs — LOGGED-IN profile qa-N by COPY of the live instance
// -----------------------------------------------------------------------------
// Uso:  node qa/changelog/make-profile.mjs qa-2 [qa-3 ...]
//       node qa/changelog/make-profile.mjs --refresh-auth qa-2   (only renews .tempo-auth.json)
//
// For the visual changelog (docs/CHANGELOG-VISUAL.md). There is no logged-in profile in
// /tmp/tempo-qa/profiles and the user cannot approve a login, so the profile is a
// CLONE (APFS clonefile, `cp -cR`, never moves) of:
//   ~/RE-TEMPO/_data-isolated -> <profile>/data   (the .tempo-auth.json session lives here)
//   ~/RE-TEMPO/_home          -> <profile>/home
//   ~/Projects/seed-tracker, ~/Projects/butia -> <profile>/projects/*
// and the absolute workspace paths are rewritten to point at the copies. This way the
// QA instance never opens the real projects nor competes for the dev servers of the
// live window (pid 80727).
//
// Removed ONLY in the copies (named files, no glob): Singleton*, DevToolsActivePort,
// devserver-ownership.json, session-sentinel.json, .tempo-instance.lock, the copied
// keychain (the harness creates an isolated one with a known password) and the
// projects' dev server state (app-devserver.json, status.json, .canvas-host-requested.json,
// recent-exits.json), which point to pids of the live window.
//
// RULES: never sign out of these profiles (the Clerk session is the SAME as the live
// window's: signing out would log the user out). Profiles live in /tmp (0700). ALWAYS open via
// kit.open (qa/changelog/kit.mjs), which enables the account lock from the connection onward: the
// copied localStorage carries "running" canvas-comment-agent tasks that, without the
// lock, post a duplicate reply in the real thread on boot (happened on 2026-10-18).
// -----------------------------------------------------------------------------
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { RE_TEMPO_BASE } from "../lib/config.mjs";

const LIVE_DATA = path.join(RE_TEMPO_BASE, "_data-isolated");
const LIVE_HOME = path.join(RE_TEMPO_BASE, "_home");
// QA_PROJECTS="/path/a:/path/b" replaces the cloned projects (default ~/Projects/seed-tracker and butia).
const PROJECTS = process.env.QA_PROJECTS
  ? process.env.QA_PROJECTS.split(":").filter(Boolean)
  : ["seed-tracker", "butia"].map((p) => path.join(os.homedir(), "Projects", p));
const PROFILES = "/tmp/tempo-qa/profiles";

const IS_CLI = import.meta.url === `file://${process.argv[1]}`;
const args = IS_CLI ? process.argv.slice(2) : [];
const refreshOnly = args.includes("--refresh-auth");
const names = args.filter((a) => !a.startsWith("--"));
if (IS_CLI && !names.length) {
  console.error("usage: node make-profile.mjs [--refresh-auth] qa-N [qa-M ...]");
  process.exit(1);
}

const sh = (cmd, a) => execFileSync(cmd, a, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
const rmNamed = (p) => { try { fs.unlinkSync(p); return true; } catch { return false; } };

function profileDir(name) {
  const m = String(name).match(/^qa-(\d)$/);
  if (!m || +m[1] < 1 || +m[1] > 9) throw new Error(`invalid profile: ${name} (qa-1..qa-9)`);
  return path.join(PROFILES, name);
}

export function refreshAuth(name) {
  const dir = profileDir(name);
  const dst = path.join(dir, "data", ".tempo-auth.json");
  if (!fs.existsSync(path.dirname(dst))) throw new Error(`profile ${name} does not exist`);
  fs.copyFileSync(path.join(LIVE_DATA, ".tempo-auth.json"), dst);
  fs.chmodSync(dst, 0o600);
  return dst;
}

// Looks for files with EXACT names inside `root` (without following symlinks, skips node_modules).
function findNamed(root, wanted, out = [], depth = 0) {
  if (depth > 6) return out;
  let ents = [];
  try { ents = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(root, e.name);
    if (e.isDirectory() && !e.isSymbolicLink()) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      findNamed(p, wanted, out, depth + 1);
    } else if (wanted.has(e.name)) out.push(p);
  }
  return out;
}

function build(name) {
  const dir = profileDir(name);
  if (fs.existsSync(dir)) throw new Error(`${dir} already exists (use --refresh-auth, or run clean.mjs --profile ${name} first)`);
  fs.mkdirSync(PROFILES, { recursive: true, mode: 0o700 });
  fs.mkdirSync(dir, { mode: 0o700 });
  const data = path.join(dir, "data");
  const home = path.join(dir, "home");
  const proj = path.join(dir, "projects");
  const t0 = Date.now();
  sh("/bin/cp", ["-cR", LIVE_DATA, data]);
  sh("/bin/cp", ["-cR", LIVE_HOME, home]);
  fs.mkdirSync(proj, { mode: 0o700 });
  for (const p of PROJECTS) sh("/bin/cp", ["-cR", p, path.join(proj, path.basename(p))]);

  const removed = [];
  for (const f of ["SingletonLock", "SingletonCookie", "SingletonSocket", "DevToolsActivePort", "devserver-ownership.json", "session-sentinel.json"])
    if (rmNamed(path.join(data, f))) removed.push(`data/${f}`);
  for (const f of [".tempo-instance.lock", "Library/Keychains/login.keychain-db", "Library/Keychains/.fl34AC2A0A"])
    if (rmNamed(path.join(home, f))) removed.push(`home/${f}`);
  // backups of the copied keychain (login.keychain-db.bak-<date>-<note>) go too
  const kcDir = path.join(home, "Library", "Keychains");
  for (const f of fs.existsSync(kcDir) ? fs.readdirSync(kcDir) : [])
    if (f.startsWith("login.keychain-db.bak-") && rmNamed(path.join(kcDir, f))) removed.push(`home/Library/Keychains/${f}`);

  // Workspaces: rewrites paths to point at the copies.
  const wsFile = path.join(data, "persist", ".tempo-workspaces.json");
  let ws = fs.readFileSync(wsFile, "utf8");
  ws = ws.split(LIVE_HOME + "/").join(home + "/");
  for (const p of PROJECTS) ws = ws.split(p).join(path.join(proj, path.basename(p)));
  fs.writeFileSync(wsFile, ws);

  // Worktree "mango": .git (worktree) <-> .git/worktrees/mango/gitdir (repo) in the copies.
  const mango = path.join(home, "tempo", "workspaces", "seed-tracker", "mango");
  const repoGit = path.join(proj, "seed-tracker", ".git");
  if (fs.existsSync(path.join(mango, ".git")) && fs.existsSync(path.join(repoGit, "worktrees", "mango"))) {
    fs.writeFileSync(path.join(mango, ".git"), `gitdir: ${path.join(repoGit, "worktrees", "mango")}\n`);
    fs.writeFileSync(path.join(repoGit, "worktrees", "mango", "gitdir"), `${path.join(mango, ".git")}\n`);
  }

  // Dev server state of the copied projects (points to pids of the live window).
  const devState = new Set(["app-devserver.json", "status.json", ".canvas-host-requested.json", "recent-exits.json"]);
  const roots = [...PROJECTS.map((p) => path.join(proj, path.basename(p))), path.join(home, "tempo")];
  for (const r of roots) {
    for (const f of findNamed(r, devState)) {
      if (!f.includes(`${path.sep}.tempo${path.sep}`)) continue; // only inside .tempo/
      if (rmNamed(f)) removed.push(path.relative(dir, f));
    }
  }

  // Harness marker (no token): sessionFp = sha256(sessionId) truncated.
  const auth = JSON.parse(fs.readFileSync(path.join(data, ".tempo-auth.json"), "utf8"));
  const sessionFp = crypto.createHash("sha256").update(String(auth.sessionId || "")).digest("hex").slice(0, 12);
  const marker = {
    profile: name,
    loggedInAt: new Date().toISOString(),
    verifiedAt: null,
    email: null, org: null, avatar: null,
    authFile: "data",
    sessionFp,
    source: "clone of the live instance (visual changelog) — SAME session: never sign out",
  };
  fs.writeFileSync(path.join(dir, ".logged-in"), JSON.stringify(marker, null, 2), { mode: 0o600 });
  return { dir, ms: Date.now() - t0, removed, sessionFp };
}

for (const n of names) {
  try {
    if (refreshOnly) console.log(`[make-profile] ${n}: auth refreshed -> ${refreshAuth(n)}`);
    else {
      const r = build(n);
      console.log(`[make-profile] ${n}: ${r.dir} (${r.ms} ms) sessionFp=${r.sessionFp}`);
      console.log(`  removed in the copies: ${r.removed.join(", ")}`);
    }
  } catch (e) {
    console.error(`[make-profile] ${n}: ERROR ${e.message}`);
    process.exitCode = 1;
  }
}
