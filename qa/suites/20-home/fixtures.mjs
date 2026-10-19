// qa/suites/20-home/fixtures.mjs — local fixtures for the Home area (t-home).
// -----------------------------------------------------------------------------
// Creates (idempotently) small folders and repos under /tmp/tempo-qa/fixtures/t-home/
// for Open folder / Import. Removal ONLY by exact path (no glob, no rm -rf).
//
// CLI:
//   node qa/suites/20-home/fixtures.mjs create [--clone]   # --clone downloads octocat/Hello-World
//   node qa/suites/20-home/fixtures.mjs clean               # removes only the listed paths
//   node qa/suites/20-home/fixtures.mjs list
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const FIX_ROOT = "/tmp/tempo-qa/fixtures/t-home";
export const PUBLIC_REPO_URL = "https://github.com/octocat/Hello-World";
// Repo that surely does not exist / is not accessible without login (private or 404).
export const PRIVATE_REPO_URL = "https://github.com/TempoLabsAI/tempo-monorepo";

const GIT = ["-c", "user.name=QA-AUTO", "-c", "user.email=qa-auto@local", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main"];

// Names relative to FIX_ROOT. This list is the ONLY source for clean().
export const F = {
  plain: "plain-folder",
  empty: "empty-folder",
  git: "git-repo",
  gitRemote: "git-remote",
  spaces: "folder with space",
  unicode: "ünïcødë-😀-proj",
  longName: "long-" + "x".repeat(200),
  noPerm: "no-perm",
  file: "file-not-folder.txt",
  bare: "bare-origin.git",
  cloneParent: "clone-parent",
  helloPre: "hello-world-pre",
  missing: "does-not-exist", // never created: nonexistent path
};

export const fx = (key) => path.join(FIX_ROOT, F[key]);

function assertUnder(p) {
  const abs = path.resolve(p);
  if (!abs.startsWith(FIX_ROOT + path.sep)) throw new Error(`refused: outside ${FIX_ROOT}: ${abs}`);
  return abs;
}

function git(cwd, ...args) {
  return execFileSync("git", [...GIT, ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function mkRepo(dir, { remote } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(path.join(dir, ".git"))) {
    git(dir, "init", "-q");
    fs.writeFileSync(path.join(dir, "README.md"), `# ${path.basename(dir)}\n\nQA-AUTO fixture (t-home).\n`);
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "QA-AUTO fixture");
  }
  if (remote) {
    try { git(dir, "remote", "remove", "origin"); } catch { /* no remote */ }
    git(dir, "remote", "add", "origin", remote);
  }
}

export function create({ clone = false } = {}) {
  fs.mkdirSync(FIX_ROOT, { recursive: true });
  const out = {};
  // folder without git
  fs.mkdirSync(fx("plain"), { recursive: true });
  fs.writeFileSync(path.join(fx("plain"), "notes.txt"), "folder without git (QA-AUTO)\n");
  // empty folder
  fs.mkdirSync(fx("empty"), { recursive: true });
  // local git repo
  mkRepo(fx("git"));
  // git repo with a public remote (no push: URL only)
  mkRepo(fx("gitRemote"), { remote: PUBLIC_REPO_URL + ".git" });
  // paths with a space, unicode/emoji and a long name
  mkRepo(fx("spaces"));
  mkRepo(fx("unicode"));
  mkRepo(fx("longName"));
  // no permission (chmod 000)
  fs.mkdirSync(fx("noPerm"), { recursive: true });
  fs.chmodSync(fx("noPerm"), 0o000);
  // file (not a folder)
  fs.writeFileSync(fx("file"), "not a folder\n");
  // local bare repo (clone via file:// without network)
  if (!fs.existsSync(fx("bare"))) {
    execFileSync("git", [...GIT, "clone", "-q", "--bare", fx("git"), fx("bare")], { stdio: "ignore" });
  }
  // parent for clone destinations
  fs.mkdirSync(fx("cloneParent"), { recursive: true });
  // pre-existing public clone ("use-existing" resolution)
  if (clone && !fs.existsSync(path.join(fx("helloPre"), ".git"))) {
    execFileSync("git", ["clone", "-q", "--depth", "1", PUBLIC_REPO_URL + ".git", fx("helloPre")], { stdio: "ignore", timeout: 120000 });
  }
  for (const k of Object.keys(F)) out[k] = { path: fx(k), exists: fs.existsSync(fx(k)) };
  return out;
}

// Removes ONLY exact paths (those in F + exact extras passed in). No glob.
export function clean(extra = []) {
  const removed = [];
  const targets = [...Object.keys(F).map(fx), ...extra.map((p) => path.resolve(p))];
  for (const t of targets) {
    const abs = assertUnder(t);
    if (!fs.existsSync(abs)) continue;
    if (abs === fx("noPerm")) { try { fs.chmodSync(abs, 0o755); } catch { /* already ok */ } }
    fs.rmSync(abs, { recursive: true, force: true });
    removed.push(abs);
  }
  return removed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] || "list";
  if (cmd === "create") console.log(JSON.stringify(create({ clone: process.argv.includes("--clone") }), null, 2));
  else if (cmd === "clean") console.log(JSON.stringify(clean(process.argv.slice(3)), null, 2));
  else console.log(JSON.stringify(Object.fromEntries(Object.keys(F).map((k) => [k, { path: fx(k), exists: fs.existsSync(fx(k)) }])), null, 2));
}
