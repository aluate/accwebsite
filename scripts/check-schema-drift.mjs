#!/usr/bin/env node
/**
 * check-schema-drift.mjs — does the live database match scripts/db-push.mjs?
 *
 * Read-only. Runs no DDL, writes nothing.
 *
 * WHY. db-push is supposed to be the schema. Three times now it has not been:
 *
 *   room_trim.source        applied by hand, never written into db-push
 *   jobs.bid_number         same — a fresh environment could not load the PM dashboard
 *   job_events.duration_days   lib/schedule.ts writes it on every event create and
 *                              update, and a full db-push run does not create it
 *
 * The last one is why this exists. If that column is missing in production, then
 * every calendar event create and every drag on the schedule wall raises Postgres
 * 42703 and fails — the same failure mode as the pipeline's delivery date, in a
 * different place. If it is present, db-push is just out of date. Those two
 * conclusions call for very different work, and guessing between them from a
 * sandbox is not good enough.
 *
 * Reports two directions:
 *
 *   MISSING FROM THE DATABASE — db-push declares it, live does not have it. This is
 *     the dangerous direction: code written against the declared schema will fail.
 *   NOT DECLARED IN db-push — live has it, db-push does not. Not an outage, but a
 *     fresh environment will not match, which is how a test passes in production and
 *     fails locally.
 *
 * Also checks a short list of columns that application code writes unconditionally,
 * because a missing one there is a live outage rather than an inconvenience.
 *
 *   node scripts/check-schema-drift.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
const sql = postgres(url, { ssl: isLocal ? false : "require", max: 1, prepare: false, connect_timeout: 10 });

const src = readFileSync(resolve(__dirname, "../scripts/db-push.mjs"), "utf8");

/**
 * Columns db-push declares for a table: the CREATE TABLE body plus every
 * ALTER TABLE ... ADD COLUMN, in either the tagged-template or string-array form.
 */
function declaredColumns(table) {
  const cols = new Set();
  const create = src.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(([\\s\\S]*?)\\n\\s*\\)`));
  // A dynamic column name (`${sql(col)}`) has nothing to record — skip, do not guess.
  if (create) {
    for (const line of create[1].split("\n")) {
      const body = line.split("--")[0].trim();
      if (!body) continue;
      if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(body)) continue;
      for (const part of body.split(",")) {
        const m = part.trim().match(/^([a-z_][a-z0-9_]*)\s+[A-Za-z]/);
        if (m) cols.add(m[1]);
      }
    }
  }
  // Case-sensitive on the column capture. With the `i` flag, [a-z_] happily matched
  // the "IF" of "ADD COLUMN IF NOT EXISTS ${sql(col)}" — a dynamic column name with
  // no literal to read — and invented a column called IF.
  const alter = new RegExp(`ALTER\\s+TABLE\\s+${table}\\s+ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?([a-z_][a-z0-9_]*)`, "g");
  for (const m of src.matchAll(alter)) cols.add(m[1]);
  return cols;
}

/**
 * Columns that application code writes unconditionally. A missing one here is not
 * drift — it is a statement that fails every time it runs. Keep this short and
 * specific; each entry names the code that writes it.
 */
const WRITTEN_BY_CODE = [
  { table: "job_events", column: "duration_days", by: "lib/schedule.ts createEvent + updateEvent — every calendar event create and every drag" },
  { table: "job_events", column: "date_start",    by: "lib/schedule.ts updateEvent — moving an event" },
  { table: "job_events", column: "date_end",      by: "lib/schedule.ts updateEvent — moving an event" },
  { table: "room_trim",  column: "source",        by: "lib/trim-propagate.ts — trim defaults" },
  { table: "jobs",       column: "bid_number",    by: "app/pm-dashboard/page.tsx SELECT — the page will not render without it" },
  { table: "jobs",       column: "install_start_date", by: "the pipeline board's Inst Start cell" },
  { table: "jobs",       column: "delivery_date", by: "the pipeline board's Delivery cell" },
  { table: "catalog_libraries", column: "data",   by: "lib/catalogs.ts getCatalogs — every catalog read" },
];

async function main() {
  const rows = await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `;
  const live = new Map();
  for (const r of rows) {
    if (!live.has(r.table_name)) live.set(r.table_name, new Set());
    live.get(r.table_name).add(r.column_name);
  }

  // The trailing `\\s*\\(` matters: without it the comment "uses CREATE TABLE IF NOT
  // EXISTS throughout" at the top of db-push parses as a table named `throughout`.
  const tables = [...new Set(
    [...src.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_][a-z0-9_]*)\s*\(/g)].map((m) => m[1]),
  )].sort();

  console.log(`\n${tables.length} table(s) declared in db-push, ${live.size} present in the database.\n`);

  // ── the direction that breaks things ────────────────────────────────────────
  const missing = [];
  for (const t of tables) {
    if (!live.has(t)) { missing.push({ table: t, column: "(whole table)" }); continue; }
    for (const c of declaredColumns(t)) {
      if (!live.get(t).has(c)) missing.push({ table: t, column: c });
    }
  }

  if (missing.length) {
    console.log(`  MISSING FROM THE DATABASE — ${missing.length}:\n`);
    for (const m of missing) console.log(`    ${m.table}.${m.column}`);
    console.log(`\n    db-push declares these and the database does not have them. Run`);
    console.log(`    \`node scripts/db-push.mjs\` — it is additive and idempotent.\n`);
  } else {
    console.log(`  nothing db-push declares is missing from the database\n`);
  }

  // ── the direction that surprises you later ──────────────────────────────────
  const undeclared = [];
  for (const [t, cols] of live) {
    const d = declaredColumns(t);
    if (d.size === 0) continue;            // table db-push does not describe at all
    for (const c of cols) if (!d.has(c)) undeclared.push(`${t}.${c}`);
  }
  if (undeclared.length) {
    console.log(`  NOT DECLARED IN db-push — ${undeclared.length}:\n`);
    for (const u of undeclared.sort()) console.log(`    ${u}`);
    console.log(`\n    The database has these; db-push does not create them. Not an outage, but a`);
    console.log(`    fresh environment will not match this one — which is how a test passes in`);
    console.log(`    production and fails locally on a missing column. Add them to db-push.\n`);
  }

  // ── the ones that are an outage, not an inconvenience ───────────────────────
  console.log(`  COLUMNS APPLICATION CODE WRITES UNCONDITIONALLY:\n`);
  let outage = 0;
  for (const w of WRITTEN_BY_CODE) {
    const present = live.get(w.table)?.has(w.column) ?? false;
    console.log(`    ${present ? "ok     " : "MISSING"}  ${`${w.table}.${w.column}`.padEnd(34)} ${present ? "" : w.by}`);
    if (!present) outage++;
  }
  console.log();
  if (outage) {
    console.log(`  ${outage} of these is missing. Every statement that writes it fails with`);
    console.log(`  Postgres 42703 — the whole request, not just that field. Whatever the`);
    console.log(`  listed code does has not been working.\n`);
  }

  const ok = missing.length === 0 && outage === 0;
  console.log(ok ? `PASS — the live schema matches what the code needs.\n`
                 : `FAIL — see above.\n`);
  process.exitCode = ok ? 0 : 1;
}

main()
  .catch((e) => { console.error("\nCheck failed:", e.message ?? e); process.exitCode = 1; })
  .finally(() => sql.end({ timeout: 5 }));
