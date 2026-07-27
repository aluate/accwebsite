/**
 * migrate-catalogs-to-db.mjs
 * Creates the catalog_libraries table and loads spec-critical catalogs into it.
 * After this, you can edit these catalogs live from Admin → Libraries.
 *
 * Safe to run multiple times — uses ON CONFLICT DO UPDATE.
 *
 * Usage:  node scripts/migrate-catalogs-to-db.mjs
 */
import { sql } from "./_db.mjs";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOGS_DIR = join(__dirname, "../data/catalogs");

// These catalogs go to DB and become editable from the admin UI.
// Everything else stays file-based (paint colors, Cab Door files, cabinet catalog).
const DB_CATALOGS = [
  "door_styles",
  "colors_carcass",
  "drawer_box",
  "hardware_pulls",
  "edgeband",
  "appliances",
  "species",
  "rooms",
  "molding_types",
  "molding_profiles",
  "molding_materials",
  "door_materials",
  "sheens",
  "drawer_slides",
  "glazes",
  "topcoats",
  "countertop_styles",
  "countertop_edges",
  "countertop_materials",
  "hardware_hinges",
  "hardware_drawer_slides",
  "hardware_rollout_slides",
  "hardware_closet_rods",
  "hardware_trash_pullouts",
  "hardware_base_pullouts",
  "hardware_blind_corners",
  "hardware_shelf_clips",
  "hardware_door_pulls",
  "hardware_drawer_pulls",
  "hardware_misc",
];

console.log("Step 1: Creating catalog_libraries table...");
await sql.unsafe(`
  CREATE TABLE IF NOT EXISTS catalog_libraries (
    name       TEXT PRIMARY KEY,
    data       JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
console.log("  Done.");

console.log(`\nStep 2: Loading ${DB_CATALOGS.length} catalogs into DB...`);
let loaded = 0, skipped = 0;

for (const name of DB_CATALOGS) {
  const jsonPath = join(CATALOGS_DIR, `${name}.json`);
  let data;
  try {
    data = JSON.parse(readFileSync(jsonPath, "utf-8"));
  } catch {
    console.log(`  SKIP ${name} — no JSON file found`);
    skipped++;
    continue;
  }

  // Normalize: some catalogs are arrays, some are objects
  const rows = Array.isArray(data) ? data : Object.values(data);

  await sql`
    INSERT INTO catalog_libraries (name, data, updated_at)
    VALUES (${name}, ${JSON.stringify(rows)}::jsonb, NOW())
    ON CONFLICT (name) DO UPDATE SET
      data       = EXCLUDED.data,
      updated_at = NOW()
  `;
  console.log(`  ✓ ${name} — ${rows.length} rows`);
  loaded++;
}

console.log(`\nDone! ${loaded} catalogs loaded, ${skipped} skipped.`);
console.log("Go to Admin → Libraries to edit them live.");
await sql.end();
