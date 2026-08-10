/**
 * scripts/migrate-room-trim-notes.mjs
 *
 * Sorts out room_trim rows written before `material` and `notes` were told apart.
 * Reports by default. Moves nothing unless you name what to move.
 *
 * WHAT HAPPENED. The Rooms tab had one input, labelled "Notes", with the placeholder
 * "Special conditions, stick counts, install notes..." — and it wrote to the
 * `material` column. `room_trim.notes` existed and was never used. So whatever a PM
 * typed into that box is stored as the material.
 *
 * WHY THIS IS NO LONGER A BULK MOVE. The first version of this script moved every
 * such value to `notes`, on the reasoning that "nobody typed a species into a field
 * captioned install notes on purpose". The production dry run falsified that
 * flatly. Of 28 rows:
 *
 *   12 x "USED AS CROWN/APPLIED TOP PANEL"   a note. Belongs in notes.
 *   15 x "Poplar - Paint Grade"              a MATERIAL. Belongs where it already is.
 *    1 x "KITCHEN"                           neither — a room name in a material field.
 *
 * People typed the material into the only free-text box the row had. Moving
 * "Poplar - Paint Grade" to `notes` would blank a correct material on 15 rows and
 * file real material information as a comment — and because finish-group trim
 * defaults fill an absent material, the next propagation would then quietly
 * substitute the finish group's species for what somebody actually specified.
 *
 * So the value decides, not the column, and only a person can read the value. This
 * groups the distinct values, shows what each one affects, and does nothing until
 * told. There are only ever a handful of distinct values, so this is a short read
 * rather than a chore.
 *
 *   node scripts/migrate-room-trim-notes.mjs
 *       report only — group the distinct values, write nothing
 *
 *   node scripts/migrate-room-trim-notes.mjs --move="USED AS CROWN/APPLIED TOP PANEL"
 *       this value is a note: copy it to notes and clear material, so finish-group
 *       defaults can fill the material correctly
 *
 *   node scripts/migrate-room-trim-notes.mjs --clear="KITCHEN"
 *       this value is neither: clear material and keep no note. Use for junk that
 *       would otherwise print on a work order as the trim material.
 *
 * Repeat either flag for several values. A value that matches no row is a refusal,
 * not a no-op, so a typo cannot look like success. Anything you do not name is left
 * exactly as it is — including every real material, which needs no migration at all.
 *
 * Never touches a row that already has a note, and never touches qty_lf.
 */
import postgres from "postgres";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const DRY = process.argv.includes("--dry-run");

const argValues = (flag) =>
  process.argv.filter((a) => a.startsWith(`${flag}=`)).map((a) => a.slice(flag.length + 1));
const MOVE  = argValues("--move");
const CLEAR = argValues("--clear");
const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
const sql = postgres(url, { ssl: isLocal ? false : "require", max: 1, prepare: false });

async function main() {
  console.log(`room_trim: material -> notes${DRY ? "   (DRY RUN — nothing will be written)" : ""}\n`);

  const candidates = await sql`
    SELECT rt.id, rt.trim_type, rt.material, rt.qty_lf, r.name AS room_name, j.client_name
    FROM room_trim rt
    JOIN rooms r ON r.id = rt.room_id
    JOIN residential_specs s ON s.id = r.spec_id
    JOIN jobs j ON j.id = s.job_id
    WHERE rt.material IS NOT NULL
      AND btrim(rt.material) <> ''
      AND (rt.notes IS NULL OR btrim(rt.notes) = '')
    ORDER BY j.client_name, r.name, rt.sort_order
  `;

  const [total] = await sql`SELECT COUNT(*)::int AS n FROM room_trim`;
  console.log(`  ${total.n} room_trim rows total, ${candidates.length} carry a value in material with no note.\n`);

  if (candidates.length === 0) {
    console.log("  Nothing to move.");
    return;
  }

  // Group by the value, because the value is what decides. A material and a note
  // look identical to a column and completely different to a person.
  const groups = new Map();
  for (const c of candidates) {
    const key = String(c.material);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  const named = new Set([...MOVE, ...CLEAR]);
  const unknown = [...named].filter((v) => !groups.has(v));
  if (unknown.length) {
    console.error(`  No room_trim row has material exactly:`);
    for (const u of unknown) console.error(`    ${JSON.stringify(u)}`);
    console.error(`\n  Nothing was written. The values present are listed by a plain run.`);
    console.error(`  Match them exactly, quotes included — a near miss must not look like a success.`);
    process.exit(1);
  }
  const both = [...MOVE].filter((v) => CLEAR.includes(v));
  if (both.length) {
    console.error(`  ${JSON.stringify(both[0])} was given to both --move and --clear. Nothing was written.`);
    process.exit(1);
  }

  console.log(`  ${groups.size} distinct value(s) sitting in material with no note:\n`);
  for (const [value, rows] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const action = MOVE.includes(value) ? "-> notes" : CLEAR.includes(value) ? "-> cleared" : "left alone";
    console.log(`    ${String(rows.length).padStart(3)} x  ${JSON.stringify(value)}`);
    console.log(`         ${action}`);
    const where = new Map();
    for (const r of rows) {
      const k = `${r.client_name} — ${r.room_name}`;
      where.set(k, (where.get(k) ?? 0) + 1);
    }
    for (const [k, n] of [...where].slice(0, 6)) console.log(`         ${k}${n > 1 ? ` (${n} rows)` : ""}`);
    if (where.size > 6) console.log(`         …and ${where.size - 6} more room(s)`);
    console.log();
  }

  const moveRows  = MOVE.flatMap((v) => groups.get(v));
  const clearRows = CLEAR.flatMap((v) => groups.get(v));

  if (moveRows.length === 0 && clearRows.length === 0) {
    console.log(`  Nothing named, so nothing written.\n`);
    console.log(`  Read the values above and decide per value:`);
    console.log(`    a note      -> --move="the value"     (goes to notes, material cleared)`);
    console.log(`    a material  -> nothing to do           (it is already in the right column)`);
    console.log(`    neither     -> --clear="the value"     (material cleared, no note kept)\n`);
    return;
  }

  if (DRY) {
    console.log(`  Dry run — ${moveRows.length} row(s) would move to notes, ${clearRows.length} would be cleared.`);
    return;
  }

  if (moveRows.length) {
    await sql`UPDATE room_trim SET notes = material, material = NULL WHERE id IN ${sql(moveRows.map((r) => r.id))}`;
  }
  if (clearRows.length) {
    await sql`UPDATE room_trim SET material = NULL WHERE id IN ${sql(clearRows.map((r) => r.id))}`;
  }

  const [after] = await sql`SELECT COUNT(*)::int AS n FROM room_trim`;
  if (after.n !== total.n) {
    console.error(`\nFAIL: row count changed ${total.n} -> ${after.n}. This migration moves values between columns and must not add or remove rows.`);
    process.exit(1);
  }

  const [remaining] = await sql`
    SELECT COUNT(*)::int AS n FROM room_trim
    WHERE material IS NOT NULL AND btrim(material) <> '' AND (notes IS NULL OR btrim(notes) = '')
  `;

  console.log(`  moved ${moveRows.length} row(s) to notes`);
  console.log(`  cleared ${clearRows.length} row(s)`);
  console.log(`  row count unchanged (${after.n})`);
  console.log(`  still holding a material with no note: ${remaining.n} — untouched on purpose`);
  console.log(`\n  Where material was cleared, finish-group trim defaults will fill it on the next`);
  console.log(`  propagation. qty_lf was never named by any statement here.`);
  console.log("\nDone.");
}

main()
  .catch((e) => { console.error("\nMigration failed:", e.message ?? e); process.exit(1); })
  .finally(() => sql.end({ timeout: 5 }));
