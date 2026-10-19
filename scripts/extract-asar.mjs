#!/usr/bin/env node
/*
 * scripts/extract-asar.mjs — unpack an Electron app.asar into a folder. Zero dependencies.
 * ---------------------------------------------------------------------------
 * Usage: node scripts/extract-asar.mjs <app.asar> <dest-dir>
 *
 * Runs on plain Node or on Electron in Node mode (ELECTRON_RUN_AS_NODE=1).
 * Same result as `asar extract`, without npm or network. Packed files are
 * written from the archive; <app.asar>.unpacked (native binaries and CLIs,
 * ~1.5 GB in Tempo) is merged in with `ditto --clone` (APFS clonefile), so it
 * costs almost no disk. Node's copyFile does not clone on macOS, hence ditto.
 * Entries marked unpacked but absent from that folder are other platforms'
 * binaries pruned from the shipped app: counted as "missingUnpacked", skipped.
 * Entries that would land outside <dest-dir> are refused.
 * Prints one JSON summary line; exit 1 if any entry failed.
 * ---------------------------------------------------------------------------
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const [archive, dest] = process.argv.slice(2);
if (!archive || !dest) {
  console.error("usage: node extract-asar.mjs <app.asar> <dest-dir>");
  process.exit(2);
}

// Under Electron in Node mode (how install.sh runs this) fs reads *.asar as a folder;
// read the archive as the plain file it is.
process.noAsar = true;

const fd = fs.openSync(archive, "r");
function read(len, pos) {
  const b = Buffer.alloc(len);
  if (len && fs.readSync(fd, b, 0, len, pos) !== len) throw new Error(`truncated archive at ${pos}`);
  return b;
}

// Header = pickle(uint32 headerSize) + pickle(JSON string); file data starts at 8 + headerSize.
const headerSize = read(8, 0).readUInt32LE(4);
const headerBuf = read(headerSize, 8);
const header = JSON.parse(headerBuf.toString("utf8", 8, 8 + headerBuf.readUInt32LE(4)));
const dataStart = 8 + headerSize;

const root = path.resolve(dest);
const unpackedRoot = path.resolve(archive) + ".unpacked";
const n = { dirs: 0, files: 0, links: 0, unpacked: 0, missingUnpacked: 0, errors: 0 };
const errors = [];

function inside(rel) {
  const p = path.resolve(root, rel);
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error(`entry escapes ${root}: ${rel}`);
  return p;
}

function walk(dir, rel) {
  for (const [name, e] of Object.entries(dir.files || {})) {
    const r = rel ? `${rel}/${name}` : name;
    try {
      const out = inside(r);
      if (e.files) {
        fs.mkdirSync(out, { recursive: true });
        n.dirs++;
        walk(e, r);
      } else if (e.link) {
        // stored relative to the archive root; written relative to the link's folder
        const target = inside(e.link);
        fs.symlinkSync(path.relative(path.dirname(out), target), out);
        n.links++;
      } else if (e.unpacked) {
        if (fs.existsSync(path.join(unpackedRoot, r))) n.unpacked++; // cloned below
        else n.missingUnpacked++;
      } else {
        fs.writeFileSync(out, read(e.size, dataStart + Number(e.offset)));
        if (e.executable) fs.chmodSync(out, 0o755);
        n.files++;
      }
    } catch (err) {
      errors.push(`${r}: ${err.message}`);
    }
  }
}

fs.mkdirSync(root, { recursive: true });
walk(header, "");
fs.closeSync(fd);
// Merge .unpacked into dest as clones (falls back to a plain copy without --clone).
if (fs.existsSync(unpackedRoot)) {
  try {
    execFileSync("/usr/bin/ditto", ["--clone", unpackedRoot, root], { stdio: "pipe" });
  } catch {
    execFileSync("/usr/bin/ditto", [unpackedRoot, root], { stdio: "pipe" });
  }
}

n.errors = errors.length;
console.log(JSON.stringify(n));
if (errors.length) {
  console.error(errors.slice(0, 20).join("\n"));
  process.exit(1);
}
