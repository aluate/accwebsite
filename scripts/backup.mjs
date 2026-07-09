/**
 * Daily backup helper.
 *
 *   npm run backup
 *
 * Zips data/ (DB + catalogs + uploaded job files) into
 * data/backups/{YYYY-MM-DD-HHmm}.zip and prunes anything older than 30 days.
 *
 * Designed to run on a schedule. To set up Windows Task Scheduler:
 *
 *   1. Open Task Scheduler (search in Start menu).
 *   2. Action -> Create Basic Task...
 *      Name: ACC Daily Backup
 *      Trigger: Daily at 2:00 AM
 *      Action: Start a program
 *        Program/script: C:\\Program Files\\nodejs\\node.exe
 *        Arguments:      C:\\dev\\repos\\acc-website\\scripts\\backup.mjs
 *        Start in:       C:\\dev\\repos\\acc-website
 *   3. Finish, then right-click the task -> Properties -> Run whether logged in or not.
 *
 * Verifies by listing data/backups/ — newest file should be today's date.
 *
 * Pure Node, no zip dependency: uses tar (cross-platform) + zlib gzip via
 * native streams to write a .tar.gz which Windows can open via 7-Zip / WinRAR
 * / "tar -xf" on Win11.
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import zlib from "zlib";
import { pipeline } from "stream/promises";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DATA = path.join(REPO, "data");
const OUT  = path.join(DATA, "backups");

if (!fs.existsSync(DATA)) {
  console.error(`[backup] no data dir at ${DATA}; nothing to back up.`);
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

// Build timestamp like 2026-05-04-2245
function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

const tag = ts();
const out = path.join(OUT, `acc-data-${tag}.tar.gz`);

// Use system tar (Windows 11 has it; Win10 may need installation). Excludes
// the backups dir itself to avoid recursion.
console.log(`[backup] writing ${out}...`);
const r = spawnSync("tar",
  ["-czf", out, "-C", REPO, "--exclude=data/backups", "data"],
  { stdio: "inherit" }
);
if (r.status !== 0) {
  console.error("[backup] tar failed.");
  process.exit(1);
}
const stat = fs.statSync(out);
console.log(`[backup] wrote ${(stat.size / 1024 / 1024).toFixed(1)} MB`);

// Prune anything older than 30 days.
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const cutoff = Date.now() - THIRTY_DAYS;
let pruned = 0;
for (const f of fs.readdirSync(OUT)) {
  if (!f.startsWith("acc-data-")) continue;
  const full = path.join(OUT, f);
  const s = fs.statSync(full);
  if (s.mtimeMs < cutoff) {
    fs.unlinkSync(full);
    pruned++;
  }
}
if (pruned > 0) console.log(`[backup] pruned ${pruned} backup(s) older than 30 days.`);
console.log("[backup] done.");
