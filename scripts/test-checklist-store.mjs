#!/usr/bin/env node
/**
 * test-checklist-store.mjs — a ticked box survives being written down.
 *
 * Needs DATABASE_URL. Creates a throwaway job, writes a checklist through the
 * same statement the route uses, reads it back, and removes both.
 *
 * WHY. The engineering checklist had two bugs stacked on each other, and
 * fixing the first revealed the second while making it look fixed.
 *
 *   1. The route never resolved the job number to the internal id, so reads
 *      found nothing and writes failed a foreign key with a 500.
 *   2. With that fixed, the write answered 200 — and stored garbage.
 *      `${JSON.stringify(x)}::jsonb` stores a jsonb STRING rather than an
 *      object, so {"zz_probe":true} went in as a seventeen-character scalar
 *      and came back out as an object keyed "0" through "16".
 *
 * A 200 that stores nonsense is worse than a 500. This asserts the shape that
 * comes back, not the status code that went in.
 */
import { sql, uid } from "../lib/db.ts";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set — this suite needs a database.");
  process.exit(1);
}

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

const jobId = `ACC-CLTEST-${Date.now().toString().slice(-6)}`;
const now = new Date().toISOString();

try {
  await sql`
    INSERT INTO jobs (id, created_at, status, job_type, client_name, site_address, job_number)
    VALUES (${jobId}, ${now}, 'intake', 'residential', 'Checklist store test', '1 Test', NULL)
  `;

  const checklist = {
    pulls_size: true,
    appliances_confirmed: false,
    "odd key with spaces": true,
    nested_is_not_expected: true,
  };

  // Exactly what the route does.
  await sql`
    INSERT INTO engineering_release_checklists (job_id, checklist, updated_at)
    VALUES (${jobId}, ${sql.json(checklist)}, ${now})
    ON CONFLICT (job_id) DO UPDATE
      SET checklist = EXCLUDED.checklist, updated_at = EXCLUDED.updated_at
  `;

  const [row] = await sql`SELECT checklist FROM engineering_release_checklists WHERE job_id = ${jobId}`;
  const back = row?.checklist;

  console.log("\nwhat comes back out\n");
  check("it is an object", back !== null && typeof back === "object" && !Array.isArray(back),
        `${typeof back}: ${JSON.stringify(back).slice(0, 60)}`);
  check("not a string spread into character keys", !("0" in (back ?? {})),
        JSON.stringify(Object.keys(back ?? {}).slice(0, 6)));
  check("the keys are the keys that went in",
        JSON.stringify(Object.keys(back ?? {}).sort()) === JSON.stringify(Object.keys(checklist).sort()),
        JSON.stringify(Object.keys(back ?? {})));
  check("a true stayed true", back?.pulls_size === true);
  check("a false stayed false", back?.appliances_confirmed === false);
  check("a key with spaces survived", back?.["odd key with spaces"] === true);

  console.log("\nand a second save replaces rather than merges\n");
  await sql`
    INSERT INTO engineering_release_checklists (job_id, checklist, updated_at)
    VALUES (${jobId}, ${sql.json({ only_this: true })}, ${now})
    ON CONFLICT (job_id) DO UPDATE
      SET checklist = EXCLUDED.checklist, updated_at = EXCLUDED.updated_at
  `;
  const [row2] = await sql`SELECT checklist FROM engineering_release_checklists WHERE job_id = ${jobId}`;
  check("the row now holds only the newer checklist",
        JSON.stringify(Object.keys(row2?.checklist ?? {})) === JSON.stringify(["only_this"]),
        JSON.stringify(row2?.checklist));
} finally {
  await sql`DELETE FROM engineering_release_checklists WHERE job_id = ${jobId}`.catch(() => {});
  await sql`DELETE FROM jobs WHERE id = ${jobId}`.catch(() => {});
  await sql.end();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
