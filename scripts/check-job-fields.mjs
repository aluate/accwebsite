#!/usr/bin/env node
/**
 * check-job-fields.mjs — every field PATCH /api/jobs/[id] accepts is a real column.
 *
 * WHY. The route builds its update as `UPDATE jobs SET ${sql(updates)}`, so a name in
 * the allow-list that is not a column raises Postgres 42703 and the request 500s.
 * There is no partial success and no useful message — just a failed save.
 *
 * That shipped. "anticipated_delivery" sat in the allow-list and has never been a
 * column: it is a computed alias in /api/admin/pipeline that COALESCEs the first
 * scheduled install event with jobs.delivery_date. The pipeline board's delivery-date
 * cell wrote to it, so editing a delivery date there failed 100% of the time. The
 * board updates optimistically and then reloads, so the date appeared to take and
 * then reverted — which reads as "it isn't saving", and sends you looking at the
 * database rather than at a field name.
 *
 * An allow-list is a promise about the schema. Nothing was checking it.
 *
 * Runs with no database: the column list is parsed out of scripts/db-push.mjs, which
 * is the schema a fresh environment gets — so a column missing there is missing where
 * it matters even if someone added it to production by hand. With DATABASE_URL set it
 * additionally checks the live schema, and reports any column that exists in the
 * database but not in db-push.
 *
 *   node scripts/check-job-fields.mjs
 *   DATABASE_URL=postgres://... node scripts/check-job-fields.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(__dirname, rel), "utf8");

/** The names the route will accept, read from the route itself. */
function patchFields() {
  const src = read("../app/api/jobs/[id]/route.ts");
  const start = src.indexOf("export const JOB_PATCH_FIELDS");
  if (start === -1) {
    console.error("Could not find JOB_PATCH_FIELDS in app/api/jobs/[id]/route.ts.");
    console.error("If the allow-list was renamed or inlined, update this check — do not delete it.");
    process.exit(1);
  }
  const block = src.slice(start, src.indexOf("]", start));
  return [...new Set([...block.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]))];
}

/**
 * Columns on a table according to db-push. Handles both shapes it uses: the
 * CREATE TABLE body, and ALTER TABLE ... ADD COLUMN [IF NOT EXISTS].
 */
function columnsFromDbPush(table) {
  const src = read("../scripts/db-push.mjs");
  const cols = new Set();

  const create = src.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\s*\\)`));
  if (create) {
    for (const line of create[1].split("\n")) {
      const body = line.split("--")[0].trim();
      if (!body) continue;
      // Skip table-level constraints
      if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(body)) continue;
      // A line can declare several columns: "a TEXT, b INTEGER,"
      for (const part of body.split(",")) {
        const m = part.trim().match(/^([a-z_][a-z0-9_]*)\s+[A-Za-z]/);
        if (m) cols.add(m[1]);
      }
    }
  }

  const alter = new RegExp(`ALTER TABLE ${table}\\s+ADD COLUMN\\s+(?:IF NOT EXISTS\\s+)?([a-z_][a-z0-9_]*)`, "gi");
  for (const m of src.matchAll(alter)) cols.add(m[1]);

  return cols;
}

/**
 * The other route that builds an UPDATE from request keys the same way:
 * PATCH /api/finish-groups/[id]. Smaller and currently correct, but it has the
 * identical failure mode, so it is checked here rather than trusted.
 */
function finishGroupFields() {
  const src = read("../app/api/finish-groups/[id]/route.ts");
  const out = [];
  for (const name of ["allowedNumeric", "allowedText"]) {
    const start = src.indexOf(`const ${name} = [`);
    if (start === -1) continue;
    const block = src.slice(start, src.indexOf("]", start));
    out.push(...[...block.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));
  }
  return [...new Set(out)];
}

const fields = patchFields();
const declared = columnsFromDbPush("jobs");

console.log(`\nPATCH /api/jobs/[id] accepts ${fields.length} field(s). db-push declares ${declared.size} column(s) on jobs.\n`);

const phantom = fields.filter((f) => !declared.has(f));

if (phantom.length) {
  console.log(`  FAILED — ${phantom.length} accepted field(s) are not columns:\n`);
  for (const f of phantom) console.log(`    ${f}`);
  console.log(`\n  Each of these makes the whole PATCH 500 with Postgres 42703 whenever a`);
  console.log(`  client sends it. Either add the column in scripts/db-push.mjs, or remove the`);
  console.log(`  name from JOB_PATCH_FIELDS and point the UI at the column it really means.\n`);
}

// Live check, when a database is reachable. Useful in the other direction too: a
// column added by hand and never written into db-push is how a fresh environment
// ends up not matching production.
let liveProblem = false;
if (process.env.DATABASE_URL) {
  const { default: postgres } = await import("postgres");
  const url = process.env.DATABASE_URL;
  const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
  // This runs in prebuild, so it runs on Vercel, where DATABASE_URL is set. A build
  // must not be able to hang on a database that is slow or unreachable — the file
  // check above is the part that has to be reliable. Short timeouts, and any failure
  // downgrades to file-only rather than blocking the deploy.
  const sql = postgres(url, {
    ssl: isLocal ? false : "require",
    max: 1,
    prepare: false,
    connect_timeout: 5,
    idle_timeout: 5,
  });
  try {
    const rows = await Promise.race([
      sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'jobs'`,
      new Promise((_, rej) => setTimeout(() => rej(new Error("timed out after 10s")), 10_000)),
    ]);
    const live = new Set(rows.map((r) => r.column_name));
    const missingLive = fields.filter((f) => !live.has(f));
    if (missingLive.length) {
      liveProblem = true;
      console.log(`  FAILED — accepted but absent from the live schema: ${missingLive.join(", ")}\n`);
    }
    const undeclared = [...live].filter((c) => !declared.has(c)).sort();
    if (undeclared.length) {
      console.log(`  NOTE — ${undeclared.length} live column(s) are not in db-push:\n`);
      console.log(`    ${undeclared.join(", ")}\n`);
      console.log(`    Not a failure, but a fresh environment will not have them, which is how`);
      console.log(`    a test passes in production and fails locally on a missing column.\n`);
    }
    console.log(`  live schema: ${live.size} column(s) on jobs\n`);
  } catch (e) {
    console.log(`  ! could not read the live schema (${e.message}) — file check only\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Same check, second route.
const fgFields = finishGroupFields();
const fgDeclared = columnsFromDbPush("finish_groups");
const fgPhantom = fgFields.filter((f) => !fgDeclared.has(f));
if (fgFields.length === 0) {
  console.log("  ! could not read the allow-list in app/api/finish-groups/[id]/route.ts — check skipped\n");
} else if (fgPhantom.length) {
  console.log(`  FAILED — PATCH /api/finish-groups/[id] accepts ${fgPhantom.length} non-column field(s): ${fgPhantom.join(", ")}\n`);
} else {
  console.log(`  PATCH /api/finish-groups/[id]: ${fgFields.length} field(s), all columns\n`);
}

const ok = phantom.length === 0 && !liveProblem && fgPhantom.length === 0;
console.log(ok
  ? `PASS — every field PATCH accepts is a real column.\n`
  : `FAIL — the allow-list does not match the schema.\n`);
process.exit(ok ? 0 : 1);
