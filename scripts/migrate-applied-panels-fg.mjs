/**
 * scripts/migrate-applied-panels-fg.mjs
 * Adds applied_panels column to finish_groups table.
 * Idempotent — uses ADD COLUMN IF NOT EXISTS.
 * Run once:  node scripts/migrate-applied-panels-fg.mjs
 */
import postgres from "postgres";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const directUrl = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!directUrl) { console.error("DATABASE_URL not set"); process.exit(1); }

const sql = postgres(directUrl, { ssl: "require", max: 1, prepare: false });

async function main() {
  console.log("Applying finish_groups.applied_panels migration...\n");

  // Add applied_panels to finish_groups.
  // 'slab' is the default — panels are slab unless the PM specifies 'match_door'.
  await sql.unsafe(`
    ALTER TABLE finish_groups
    ADD COLUMN IF NOT EXISTS applied_panels TEXT NOT NULL DEFAULT 'slab'
  `);
  console.log("✓ finish_groups.applied_panels (TEXT DEFAULT 'slab')");

  await sql.end();
  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
