/**
 * scripts/seed-catalogs.mjs
 * Seeds catalog_* DB tables from the JSON files in data/catalogs/.
 * Idempotent: uses INSERT ... ON CONFLICT (id) DO UPDATE.
 * Run after db-push.mjs:  node scripts/seed-catalogs.mjs
 */
import postgres from "postgres";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const sql = postgres(DATABASE_URL, {
  ssl: DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1") ? false : "require",
  max: 1,
  prepare: false,
});

const DATA_DIR = resolve(__dirname, "../data/catalogs");

/** Load JSON file, stripping null bytes (workaround for NTFS-sourced files). */
function loadJson(filename) {
  const file = join(DATA_DIR, filename);
  if (!existsSync(file)) { console.warn(`  SKIP: ${filename} not found`); return []; }
  const raw = readFileSync(file);
  const clean = raw.toString("utf-8").replace(/\0/g, "").trim();
  return JSON.parse(clean);
}

/** Serialize a value for a TEXT DB column:
 *  - null/undefined → null
 *  - Array → semicolon-joined string (compatible with asArray() helper)
 *  - boolean → keep as boolean (postgres driver maps to int)
 *  - other → as-is
 */
function ser(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v.join(";");
  return v;
}

async function seedTable(tableName, rows, colNames) {
  if (!rows.length) { console.log(`  ${tableName}: 0 rows (empty file)`); return; }
  let count = 0;
  for (const row of rows) {
    const id = row.id;
    if (!id) { console.warn(`  ${tableName}: skipping row without id`); continue; }

    // Build SET clause for DO UPDATE
    const setCols = colNames.filter(c => c !== "id").map(c => `${c} = EXCLUDED.${c}`).join(", ");
    const colList = colNames.join(", ");
    const placeholders = colNames.map((_, i) => `$${i + 1}`).join(", ");
    const values = colNames.map(c => ser(row[c]));

    const query = `
      INSERT INTO ${tableName} (${colList})
      VALUES (${placeholders})
      ON CONFLICT (id) DO UPDATE SET ${setCols}
    `;
    await sql.unsafe(query, values);
    count++;
  }
  console.log(`  ${tableName}: ${count} rows upserted`);
}

async function main() {
  console.log("Seeding catalog tables...\n");

  // 1. catalog_paint_colors ← colors_paint.json
  await seedTable("catalog_paint_colors",
    loadJson("colors_paint.json"),
    ["id","brand","collection","code","name","hex_approx","is_custom_match","placeholder","notes"]
  );

  // 2. catalog_stain_colors ← colors_stain.json
  await seedTable("catalog_stain_colors",
    loadJson("colors_stain.json"),
    ["id","brand","code","name","is_in_house_mix","is_custom_match","notes","placeholder"]
  );

  // 3. catalog_melamine_colors ← colors_melamine.json
  await seedTable("catalog_melamine_colors",
    loadJson("colors_melamine.json"),
    ["id","supplier","collection","line","code","name","texture","woodgrain","price_tier","hex_approx","notes","placeholder"]
  );

  // 4. catalog_carcass_materials ← colors_carcass.json
  await seedTable("catalog_carcass_materials",
    loadJson("colors_carcass.json"),
    ["id","name","material_class","species","prefinish","supplier_code","notes","is_other"]
  );

  // 5. catalog_drawer_boxes ← drawer_box.json
  await seedTable("catalog_drawer_boxes",
    loadJson("drawer_box.json"),
    ["id","name","construction","species","prefinish","notes","is_other"]
  );

  // 6. catalog_edgebands ← edgeband.json
  await seedTable("catalog_edgebands",
    loadJson("edgeband.json"),
    ["id","product_name","supplier","type","color_match","compatible_finish_type","thickness_mm","width_in","notes","placeholder"]
  );

  // 7. catalog_species ← species.json
  await seedTable("catalog_species",
    loadJson("species.json"),
    ["id","name","grades","hardness_janka","typical_use","notes"]
  );

  // 8. catalog_accessories ← accessories_reva.json
  await seedTable("catalog_accessories",
    loadJson("accessories_reva.json"),
    ["id","name","brand","series","category","width_options_in","finish_options","notes"]
  );

  // 9. catalog_builder_profiles ← builder_profiles.json
  await seedTable("catalog_builder_profiles",
    loadJson("builder_profiles.json"),
    ["id","builder_name","builder_company","default_finish_type","default_carcass_id","default_drawer_box_id","default_pull_id","default_paint_brand","default_accessories","preferred_cabdoor_usage_groups","notes","is_residential_default"]
  );

  // 10. catalog_door_styles ← door_styles.json
  await seedTable("catalog_door_styles",
    loadJson("door_styles.json"),
    ["id","name","vendor","cabdoor_preset_id","construction","compatible_finish","placeholder","notes"]
  );

  // 11. catalog_pulls ← hardware_pulls.json
  await seedTable("catalog_pulls",
    loadJson("hardware_pulls.json"),
    ["id","name","brand","model","type","hole_spacing_in","length_in","finish_options","notes"]
  );

  // 12. catalog_appliances ← appliances.csv (no JSON exists — parse CSV)
  const apliancesFile = join(DATA_DIR, "appliances.csv");
  if (existsSync(apliancesFile)) {
    const lines = readFileSync(apliancesFile, "utf-8").replace(/\r\n/g, "\n").split("\n").filter(l => l.trim());
    if (lines.length > 1) {
      const headers = lines[0].split(",");
      const appRows = lines.slice(1).map((line, idx) => {
        const vals = line.split(",");
        const row = {};
        headers.forEach((h, i) => { row[h.trim()] = vals[i]?.trim() ?? null; });
        // Assign a stable ID if not present
        if (!row.id) row.id = `APL-${String(idx + 1).padStart(3, "0")}`;
        return row;
      });
      // CSV columns: type,manufacturer,model,cutout_w,cutout_h,cutout_d,notes
      // Map to DB columns
      const mapped = appRows.filter(r => r.type || r.appliance_type).map((r, idx) => ({
        id: r.id ?? `APL-${String(idx+1).padStart(3,"0")}`,
        appliance_type: r.type ?? r.appliance_type ?? "",
        manufacturer: r.manufacturer ?? null,
        model_no: r.model ?? r.model_no ?? null,
        cutout_w: r.cutout_w ?? null,
        cutout_h: r.cutout_h ?? null,
        cutout_d: r.cutout_d ?? null,
        notes: r.notes ?? null,
      }));
      await seedTable("catalog_appliances", mapped,
        ["id","appliance_type","manufacturer","model_no","cutout_w","cutout_h","cutout_d","notes"]
      );
    }
  } else {
    console.log("  catalog_appliances: appliances.csv not found, skipping");
  }

  console.log("\nSeed complete.");
  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
