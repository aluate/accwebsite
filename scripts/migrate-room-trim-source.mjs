/**
 * scripts/migrate-room-trim-source.mjs
 *
 * Adds room_trim.source — where a trim row came from.
 *
 * Why a column and not an inference:
 *
 * When a room's finish group changes (kitchen MEL-1 -> STN-1), rows that were
 * defaulted from the old group must follow the new one, while rows a PM typed by
 * hand must be left alone apart from re-deriving their material. Without recording
 * which is which, the two are indistinguishable, and every finish swap has to pick
 * one of two bad behaviours: rewrite everything and destroy deliberate work, or
 * rewrite nothing and leave a room carrying the wrong finish's trim.
 *
 * Guessing from the trim type does not work either — a PM can hand-add Filler to one
 * room even though Filler is also a finish-group default.
 *
 * Existing rows become 'manual'. Every row in the table today was typed by a person,
 * because nothing has ever defaulted one — so 'manual' is not a safe default, it is
 * the accurate one. It also means this migration cannot cause an existing row to be
 * rewritten by the first finish-group swap after deploy.
 *
 * Idempotent. Run once:  node scripts/migrate-room-trim-source.mjs
 */
import postgres from "postgres";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
const sql = postgres(url, { ssl: isLocal ? false : "require", max: 1, prepare: false });

async function main() {
  console.log("Applying room_trim.source migration...\n");

  const [before] = await sql`SELECT COUNT(*)::int AS n FROM room_trim`;
  console.log(`  room_trim rows before: ${before.n}`);

  await sql.unsafe(`
    ALTER TABLE room_trim
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
  `);
  console.log("  ok  room_trim.source (TEXT NOT NULL DEFAULT 'manual')");

  // Only two values are meaningful. A constraint here is cheap and stops a typo in
  // application code from creating a third that silently behaves like 'manual'.
  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'room_trim_source_check'
      ) THEN
        ALTER TABLE room_trim
          ADD CONSTRAINT room_trim_source_check
          CHECK (source IN ('fg_default', 'manual'));
      END IF;
    END $$;
  `);
  console.log("  ok  CHECK (source IN ('fg_default','manual'))");

  const rows = await sql`SELECT source, COUNT(*)::int AS n FROM room_trim GROUP BY source ORDER BY source`;
  console.log("\n  by source:");
  for (const r of rows) console.log(`    ${r.source.padEnd(12)} ${r.n}`);

  const [after] = await sql`SELECT COUNT(*)::int AS n FROM room_trim`;
  if (after.n !== before.n) {
    console.error(`\nFAIL: row count changed ${before.n} -> ${after.n}. A migration that adds a column must not.`);
    process.exit(1);
  }
  console.log(`\n  row count unchanged (${after.n}) — nothing was rewritten.`);
  console.log("\nDone.");
}

main()
  .catch((e) => { console.error("\nMigration failed:", e.message ?? e); process.exit(1); })
  .finally(() => sql.end({ timeout: 5 }));
