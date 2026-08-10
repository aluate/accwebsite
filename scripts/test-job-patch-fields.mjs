#!/usr/bin/env node
/**
 * test-job-patch-fields.mjs — every field PATCH /api/jobs/[id] accepts can actually
 * be written.
 *
 * `scripts/check-job-fields.mjs` compares names against the schema and is cheap
 * enough for the build. This one does the write. It builds the same statement the
 * route builds — `UPDATE jobs SET ${sql(updates)}` — once per accepted field, against
 * a real database, and requires it to succeed and to be readable back.
 *
 * The bug it exists for: "anticipated_delivery" was in the allow-list and has never
 * been a column, so the pipeline board's delivery-date cell 500'd on every edit. The
 * board updated optimistically and then reloaded, so the date appeared to save and
 * then snapped back. Nothing failed loudly. Nothing was checking.
 *
 * A name check alone would not have caught the type half of this — a field whose
 * column exists but rejects the shape the UI sends fails exactly the same way from
 * the user's chair. So this sends a plausible value per column type and does the
 * round trip.
 *
 * Writes only to one throwaway job, and deletes it.
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/test-job-patch-fields.mjs
 */
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
const sql = postgres(url, { ssl: isLocal ? false : "require", max: 1, prepare: false });

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

/** Read the allow-list from the route, so the test cannot drift from it. */
function patchFields() {
  const src = readFileSync(resolve(__dirname, "../app/api/jobs/[id]/route.ts"), "utf8");
  const start = src.indexOf("export const JOB_PATCH_FIELDS");
  if (start === -1) throw new Error("JOB_PATCH_FIELDS not found in the route");
  const block = src.slice(start, src.indexOf("]", start));
  return [...new Set([...block.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]))];
}

/** A value the column will accept, chosen from its declared type. */
function sampleFor(type, name) {
  if (/int|numeric|double|real/.test(type)) return 1;
  if (/bool/.test(type)) return true;
  if (/date|timestamp/.test(type)) return "2026-01-15";
  // The date columns on this table are TEXT, so match what the UI sends.
  if (/date$/.test(name)) return "2026-01-15";
  return "patch-field-test";
}

const jobId = "jobtest-" + randomBytes(6).toString("hex");

async function main() {
  const fields = patchFields();
  const types = new Map(
    (await sql`
      SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'jobs'
    `).map((r) => [r.column_name, r.data_type]),
  );

  await sql`
    INSERT INTO jobs (id, created_at, client_name, site_address)
    VALUES (${jobId}, ${new Date("2026-01-01").toISOString()}, 'PATCH field test', '000 Test St')
  `;

  console.log(`\n${fields.length} accepted field(s), written one at a time the way the route writes them\n`);

  // Columns with a foreign key need a value that resolves. jobs.placeholder_id
  // points back at jobs, so the test row can reference itself.
  const fkTargets = new Map(
    (await sql`
      SELECT kcu.column_name, ccu.table_name AS target
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'jobs' AND tc.constraint_type = 'FOREIGN KEY'
    `).map((r) => [r.column_name, r.target]),
  );

  const MOD_FIELDS = new Set(["mod_residential", "mod_commercial", "mod_trim", "mod_doors"]);
  const broken = [];
  const fkSkipped = [];

  for (const f of fields) {
    const type = types.get(f);
    if (!type) { broken.push(`${f}: not a column`); continue; }
    // The route coerces the mod_ flags to 0/1 before writing; mirror that.
    const value = MOD_FIELDS.has(f)
      ? 1
      : fkTargets.get(f) === "jobs"
        ? jobId
        : sampleFor(type, f);
    const updates = { [f]: value };
    try {
      await sql`UPDATE jobs SET ${sql(updates)} WHERE id = ${jobId}`;
      const [row] = await sql`SELECT ${sql(f)} FROM jobs WHERE id = ${jobId}`;
      if (row?.[f] == null) broken.push(`${f}: wrote ${JSON.stringify(value)}, read back null`);
    } catch (e) {
      // A foreign-key violation means the column exists and took the type — the
      // constraint rejected a made-up id, which is the constraint working. That is
      // not the failure this test is looking for.
      if (e.code === "23503") { fkSkipped.push(`${f} -> ${fkTargets.get(f) ?? "?"}`); continue; }
      broken.push(`${f}: ${e.code ?? ""} ${(e.message ?? "").slice(0, 70)}`);
    }
  }

  check("every accepted field writes and reads back", broken.length === 0, broken.join(" | "));
  if (fkSkipped.length) {
    console.log(`       (${fkSkipped.length} field(s) checked for existence only, a foreign key rejected the sample value: ${fkSkipped.join(", ")})`);
  }

  // The specific regression, named, so a failure here says what it is rather than
  // just "one of 36 fields broke".
  console.log("\nthe pipeline board's two date cells, end to end");
  for (const f of ["delivery_date", "install_start_date"]) {
    try {
      await sql`UPDATE jobs SET ${sql({ [f]: "2026-07-04" })} WHERE id = ${jobId}`;
      const [row] = await sql`SELECT ${sql(f)} FROM jobs WHERE id = ${jobId}`;
      check(`${f} saves`, String(row?.[f] ?? "").startsWith("2026-07-04"), JSON.stringify(row?.[f]));
    } catch (e) {
      check(`${f} saves`, false, e.message);
    }
  }

  // And the thing that broke: a name the route accepts but the table does not have.
  console.log("\nno accepted field is a computed alias");
  const aliases = ["anticipated_delivery", "scheduled_install_date", "placeholder_linked_count", "box_count_derived"];
  const leaked = aliases.filter((a) => fields.includes(a) && !types.has(a));
  check("no derived pipeline alias is in the allow-list", leaked.length === 0, leaked.join(", "));
}

main()
  .catch((e) => { console.error("\nHARNESS ERROR:", e.message ?? e); fail++; })
  .finally(async () => {
    await sql`DELETE FROM jobs WHERE id = ${jobId}`.catch(() => {});
    await sql.end({ timeout: 5 });
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  });
