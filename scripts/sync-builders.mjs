/**
 * scripts/sync-builders.mjs
 * Pushes data/builders.csv to the `builders` table in Supabase.
 * Safe to run repeatedly — upserts on id.
 *
 *   npm run sync-builders
 *
 * CSV columns: id, company, contact_name, phone, email, typical_pm, notes
 *
 * Edit data/builders.csv in Excel, then run this script to push the changes.
 */
import postgres from "postgres";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const sql = postgres(DATABASE_URL, { ssl: DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1") ? false : "require", max: 1, prepare: false });

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return row;
  }).filter((r) => r.id && r.company);
}

async function main() {
  const csvPath = resolve(__dirname, "../data/builders.csv");
  const rows = parseCSV(readFileSync(csvPath, "utf8"));

  if (!rows.length) {
    console.log("No rows found in builders.csv — nothing to sync.");
    await sql.end();
    return;
  }

  console.log(`Syncing ${rows.length} builder(s)...`);

  for (const r of rows) {
    await sql`
      INSERT INTO builders (id, company, contact_name, phone, email, typical_pm, notes, active, created_at, updated_at)
      VALUES (
        ${r.id}, ${r.company}, ${r.contact_name || null}, ${r.phone || null},
        ${r.email || null}, ${r.typical_pm || null}, ${r.notes || null},
        1, NOW()::text, NOW()::text
      )
      ON CONFLICT (id) DO UPDATE SET
        company      = EXCLUDED.company,
        contact_name = EXCLUDED.contact_name,
        phone        = EXCLUDED.phone,
        email        = EXCLUDED.email,
        typical_pm   = EXCLUDED.typical_pm,
        notes        = EXCLUDED.notes,
        updated_at   = NOW()::text
    `;
    console.log(`  ✓ ${r.company} (${r.id})`);
  }

  console.log("Done.");
  await sql.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
