/**
 * scripts/migrate-room-trim-notes.mjs
 *
 * Moves room_trim.material -> room_trim.notes for rows written before the columns
 * were told apart.
 *
 * What happened: the Rooms tab had one input, labelled "Notes", with the placeholder
 * "Special conditions, stick counts, install notes..." — and it wrote to the
 * `material` column. `room_trim.notes` existed and was never used. So every value a
 * PM ever typed into that box is stored as the material. Production has a row whose
 * material reads "KITCHEN".
 *
 * It stayed invisible until finish-group trim defaults started filling `material`,
 * at which point a derived species would appear inside a box labelled Notes.
 *
 * The move is safe because the label was never anything else. Nobody typed a species
 * into a field captioned "install notes" on purpose, and nothing has ever written
 * `material` programmatically before this week.
 *
 * Conservative on both sides:
 *   - only rows where material IS NOT NULL and notes IS NULL are touched, so a real
 *     note already in `notes` is never overwritten
 *   - it PRINTS every row it is about to move, before moving it
 *   - --dry-run shows the plan and writes nothing
 *   - material is then cleared, so finish-group defaults can fill it correctly
 *
 * Run:  node scripts/migrate-room-trim-notes.mjs --dry-run
 *       node scripts/migrate-room-trim-notes.mjs
 */
import postgres from "postgres";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const DRY = process.argv.includes("--dry-run");
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

  console.log("  These values will move from material to notes:\n");
  for (const c of candidates) {
    console.log(`    ${String(c.client_name).slice(0, 22).padEnd(24)} ${String(c.room_name).slice(0, 16).padEnd(18)} ${String(c.trim_type).padEnd(16)} ${JSON.stringify(c.material)}`);
  }

  if (DRY) {
    console.log(`\n  Dry run — ${candidates.length} row(s) would move. Re-run without --dry-run to apply.`);
    return;
  }

  const ids = candidates.map((c) => c.id);
  const moved = await sql`
    UPDATE room_trim
    SET notes = material, material = NULL
    WHERE id IN ${sql(ids)}
    RETURNING id
  `;

  const [after] = await sql`SELECT COUNT(*)::int AS n FROM room_trim`;
  if (after.n !== total.n) {
    console.error(`\nFAIL: row count changed ${total.n} -> ${after.n}. This migration moves values between columns and must not add or remove rows.`);
    process.exit(1);
  }

  const [leftover] = await sql`
    SELECT COUNT(*)::int AS n FROM room_trim
    WHERE material IS NOT NULL AND btrim(material) <> '' AND (notes IS NULL OR btrim(notes) = '')
  `;

  console.log(`\n  moved ${moved.length} row(s)`);
  console.log(`  row count unchanged (${after.n})`);
  console.log(`  remaining material-with-no-note rows: ${leftover.n}`);
  console.log(`\n  material is now blank on those rows, so finish-group defaults will fill it.`);
  console.log("\nDone.");
}

main()
  .catch((e) => { console.error("\nMigration failed:", e.message ?? e); process.exit(1); })
  .finally(() => sql.end({ timeout: 5 }));
