/**
 * Wipe residential specs (and all cascaded children).
 *
 *   npm run wipe-specs              # dry-run
 *   npm run wipe-specs -- --commit  # actually deletes
 */
import { sql } from "./_db.mjs";

const commit = process.argv.includes("--commit");

const [count] = await sql`SELECT COUNT(*) AS n FROM residential_specs`;
console.log(`Found ${count.n} residential_specs row(s).`);

if (!commit) {
  console.log("Dry-run only. Pass --commit to actually delete.");
  await sql.end();
  process.exit(0);
}

// Delete in safe order (or rely on ON DELETE CASCADE where defined)
await sql`DELETE FROM spec_lifecycle_transitions`;
await sql`DELETE FROM spec_archives`;
await sql`DELETE FROM approval_requests`;
await sql`DELETE FROM residential_specs`; // cascades to finish_groups, rooms, etc.

console.log("Wiped.");
await sql.end();
