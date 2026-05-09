/**
 * Seed 60 schedule events (10 per type) for live testing of the wall view.
 *
 *   npm run seed-schedule
 *
 * Data shape:
 *   - 6 event types × 10 each = 60 events
 *   - All dates are Mon-Fri (no weekend field work — Karl 2026-05-06)
 *   - ~50 dated events spread across the 6-week visible window
 *   - ~10 on-deck events (date_start NULL) with blocked_on hints
 *   - Mix of crews: Slavic, Tanner, Other, plus some Unassigned (null)
 *   - Mix of statuses: mostly scheduled, some confirmed/on_hold/complete
 *   - Some events parent-linked to exercise "1 of N" labels on the wall
 *   - Multi-day installs (2-4 days), single-day everything else (mostly)
 *
 * Idempotent: every seeded event has created_by = 'seed-schedule.mjs', so
 * re-running deletes prior seeds without touching events Karl created
 * manually. Also clears the audit rows for those seeded event IDs.
 */
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO    = path.resolve(__dirname, "..");
const DB_PATH = path.join(REPO, "data", "acc-jobs.db");

if (!fs.existsSync(DB_PATH)) {
  console.error(`[seed-schedule] no DB at ${DB_PATH} — run npm run migrate first`);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Belt-and-suspenders.
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
for (const t of ["jobs", "crews", "job_events", "job_event_audit"]) {
  if (!tables.includes(t)) {
    console.error(`[seed-schedule] table missing: ${t} — run npm run migrate first`);
    process.exit(1);
  }
}

// Need crews to assign. If they're not seeded, fail loud.
const crewByName = Object.fromEntries(
  db.prepare("SELECT id, name FROM crews WHERE active = 1").all().map((r) => [r.name, r.id])
);
for (const n of ["Slavic", "Tanner", "Other"]) {
  if (!crewByName[n]) {
    console.error(`[seed-schedule] crew '${n}' not found — run npm run seed-crews first`);
    process.exit(1);
  }
}

// Need at least 1 job. Use whatever's in the DB up to 3.
const jobs = db.prepare("SELECT id FROM jobs ORDER BY created_at DESC LIMIT 3").all().map((r) => r.id);
if (jobs.length === 0) {
  console.error("[seed-schedule] no jobs in DB — create at least one job in /jobs first");
  process.exit(1);
}

const ACTOR = "seed-schedule.mjs";

// Idempotent wipe of prior seeds.
{
  const prior = db.prepare("SELECT id FROM job_events WHERE created_by = ?").all(ACTOR);
  if (prior.length > 0) {
    const ids = prior.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(`DELETE FROM job_event_audit WHERE event_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM job_events       WHERE id       IN (${placeholders})`).run(...ids);
    console.log(`[seed-schedule] cleared ${prior.length} prior seed events + their audit rows`);
  }
}

// ── Date helpers ───────────────────────────────────────────────────────────
function offsetDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function isWeekday(iso) {
  const d = new Date(iso + "T00:00:00Z").getUTCDay();
  return d >= 1 && d <= 5; // Mon=1..Fri=5
}
function nextWeekday(iso) {
  let cur = iso;
  while (!isWeekday(cur)) cur = offsetDays(cur, 1);
  return cur;
}

const today = new Date().toISOString().slice(0, 10);

// Generate the pool of weekday dates we can schedule on (today-7 ... today+28).
// Same window the wall view loads.
const dates = [];
for (let off = -7; off <= 28; off++) {
  const iso = offsetDays(today, off);
  if (isWeekday(iso)) dates.push(iso);
}
console.log(`[seed-schedule] ${dates.length} weekdays in window (today=${today})`);

// ── Generation ─────────────────────────────────────────────────────────────

// Tiny deterministic RNG so the seed is reproducible.
let rngSeed = 0xACC1ED;
function rnd() {
  rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0;
  return rngSeed / 0x100000000;
}
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function uid() {
  // Keep IDs short like the rest of the app
  let s = "";
  while (s.length < 8) s += rnd().toString(36).slice(2);
  return s.slice(0, 8);
}

const crewIds = [crewByName.Slavic, crewByName.Tanner, crewByName.Other];

// Status distribution: 60% scheduled, 15% confirmed, 15% complete, 10% on_hold
function pickStatus(isPast) {
  const r = rnd();
  if (isPast) return r < 0.7 ? "complete" : "scheduled";
  if (r < 0.6) return "scheduled";
  if (r < 0.75) return "confirmed";
  if (r < 0.85) return "on_hold";
  return "scheduled";
}

// Crew pick: 75% assigned, 25% unassigned (null) — exercises the loud-red
// treatment without flooding the wall with red.
function pickCrew() {
  return rnd() < 0.75 ? pick(crewIds) : null;
}

// Description templates per type.
const DESCS = {
  cab_delivery: [
    "Cab delivery", "Cab drop", "Cabs to site", "Box delivery", "Cab + filler delivery",
  ],
  top_delivery: [
    "Top delivery", "Quartz tops", "Stone tops drop", "Tops to site", "Buildup + tops",
  ],
  install: [
    "Main install", "Phase 1 install", "Pulls after tops", "Ladder bases early",
    "Punch + reinstall", "Crown + finish trim", "Island + perimeter",
  ],
  service: [
    "Drawer front swap", "Hinge adjustment", "Soft-close fix",
    "Touch-up paint", "Door realign", "Trim repair",
  ],
  punch: [
    "Punch list", "Final punch", "Walk + punch", "Customer punch list",
  ],
  final_walkthrough: [
    "Final walkthrough", "Owner sign-off walk", "Builder + owner walk",
  ],
};

const BLOCKED_ON = [
  "Waiting on tops template",
  "Customer sign-off pending",
  "Parts on order",
  "Ladder base back-order",
  "Awaiting paint match",
  "Builder hasn't released",
];

// Multi-day duration policy:
// - install: 60% chance 2-4 days, 40% single-day
// - cab_delivery / top_delivery: rare 2-day, mostly single
// - service / punch / final_walkthrough: always single-day
function pickDuration(eventType) {
  if (eventType === "install") {
    return rnd() < 0.6 ? Math.floor(rnd() * 3) + 2 : 1;   // 2-4 or 1
  }
  if (eventType === "cab_delivery" || eventType === "top_delivery") {
    return rnd() < 0.15 ? 2 : 1;
  }
  return 1;
}

// Walk forward N weekdays from a starting date.
function addWeekdays(iso, count) {
  let cur = iso;
  for (let i = 0; i < count - 1; i++) {
    cur = offsetDays(cur, 1);
    while (!isWeekday(cur)) cur = offsetDays(cur, 1);
  }
  return cur;
}

const eventTypes = [
  "cab_delivery",
  "top_delivery",
  "install",
  "service",
  "punch",
  "final_walkthrough",
];

const events = [];

for (const evtType of eventTypes) {
  for (let i = 0; i < 10; i++) {
    const isOnDeck = rnd() < (evtType === "service" || evtType === "punch" ? 0.3 : 0.1);
    const job_id = pick(jobs);
    const dur = pickDuration(evtType);
    const date_start = isOnDeck ? null : pick(dates);
    let date_end = null;
    if (date_start && dur > 1) {
      date_end = addWeekdays(date_start, dur);
    }
    const isPast = date_start && date_start < today;
    const crew_id = pickCrew();
    const status = isOnDeck ? "scheduled" : pickStatus(!!isPast);
    const description = pick(DESCS[evtType]);
    const blocked_on = isOnDeck ? pick(BLOCKED_ON) : null;
    const note = rnd() < 0.2 ? "[seed]" : null;

    events.push({
      id: uid(),
      job_id,
      event_type: evtType,
      description,
      date_start,
      date_end,
      crew_id,
      status,
      note,
      blocked_on,
      parent_event_id: null,   // set in parent-link pass below
    });
  }
}

// Parent-link pass: for installs on the same job, link the latest to the
// earliest (auto-link semantics from lib/schedule). Exercises "1 of N".
{
  const installsByJob = new Map();
  for (const e of events) {
    if (e.event_type !== "install" || !e.date_start) continue;
    if (!installsByJob.has(e.job_id)) installsByJob.set(e.job_id, []);
    installsByJob.get(e.job_id).push(e);
  }
  for (const [, list] of installsByJob) {
    if (list.length < 2) continue;
    list.sort((a, b) => (a.date_start ?? "").localeCompare(b.date_start ?? ""));
    // Make every later install link back to the earliest as parent.
    const root = list[0];
    for (let i = 1; i < list.length; i++) {
      list[i].parent_event_id = root.id;
    }
  }
}

// ── Insert (two-pass to avoid parent_event_id FK violations) ──────────────
// Pass 1: insert every event with parent_event_id = NULL.
// Pass 2: UPDATE the children to point at their now-existing parents.
// Generation order doesn't match date order, so single-pass inserts can hit
// SQLITE_CONSTRAINT_FOREIGNKEY when a child references a sibling that
// wasn't inserted yet.
const now = new Date().toISOString();
const insertEvent = db.prepare(`
  INSERT INTO job_events (
    id, job_id, event_type, description, date_start, date_end, crew_id,
    status, note, blocked_on, parent_event_id, sort_order,
    created_at, created_by, updated_at, updated_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?)
`);
const setParent = db.prepare(`UPDATE job_events SET parent_event_id = ? WHERE id = ?`);
const insertAudit = db.prepare(`
  INSERT INTO job_event_audit
    (id, event_id, job_id, action, before_json, after_json, changed_at, changed_by)
  VALUES (?, ?, ?, 'create', NULL, ?, ?, ?)
`);

const tx = db.transaction(() => {
  for (const e of events) {
    insertEvent.run(
      e.id, e.job_id, e.event_type, e.description, e.date_start, e.date_end,
      e.crew_id, e.status, e.note, e.blocked_on,
      now, ACTOR, now, ACTOR,
    );
    insertAudit.run(uid(), e.id, e.job_id, JSON.stringify(e), now, ACTOR);
  }
  for (const e of events) {
    if (e.parent_event_id) setParent.run(e.parent_event_id, e.id);
  }
});
tx();

// ── Summary ────────────────────────────────────────────────────────────────
const counts = {};
for (const e of events) counts[e.event_type] = (counts[e.event_type] ?? 0) + 1;
const onDeckCount = events.filter((e) => !e.date_start).length;
const linkedCount = events.filter((e) => e.parent_event_id).length;
const unassignedCount = events.filter((e) => !e.crew_id).length;

console.log(`[seed-schedule] inserted ${events.length} events`);
for (const t of eventTypes) console.log(`  ${t.padEnd(20)} ${counts[t] ?? 0}`);
console.log(`[seed-schedule] on-deck: ${onDeckCount} · parent-linked: ${linkedCount} · unassigned crew: ${unassignedCount}`);
console.log("[seed-schedule] re-run safe — every event has created_by='seed-schedule.mjs'");

db.close();
