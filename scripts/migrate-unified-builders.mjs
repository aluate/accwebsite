/**
 * migrate-unified-builders.mjs
 *
 * Merges catalog_builder_profiles into builders so there is ONE builder
 * record with both contact info and spec defaults.
 *
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 *   node scripts/migrate-unified-builders.mjs
 */
import { sql } from "./_db.mjs";

console.log("Step 1: Adding spec default columns to builders table...");
await sql.unsafe(`
  ALTER TABLE builders
    ADD COLUMN IF NOT EXISTS default_finish_type       TEXT DEFAULT 'paint',
    ADD COLUMN IF NOT EXISTS default_carcass_id        TEXT,
    ADD COLUMN IF NOT EXISTS default_drawer_box_id     TEXT,
    ADD COLUMN IF NOT EXISTS default_pull_id           TEXT,
    ADD COLUMN IF NOT EXISTS default_paint_brand       TEXT,
    ADD COLUMN IF NOT EXISTS default_accessories       TEXT,
    ADD COLUMN IF NOT EXISTS preferred_cabdoor_usage_groups TEXT,
    ADD COLUMN IF NOT EXISTS is_residential_default    INTEGER DEFAULT 0
`);
console.log("  Done.");

console.log("Step 2: Adding builder_id column to jobs...");
await sql.unsafe(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS builder_id TEXT`);
console.log("  Done.");

console.log("Step 3: Migrating catalog_builder_profiles → builders...");
const profiles = await sql`
  SELECT id, builder_name, builder_company,
         default_finish_type, default_carcass_id, default_drawer_box_id,
         default_pull_id, default_paint_brand, default_accessories,
         preferred_cabdoor_usage_groups, notes, is_residential_default
  FROM catalog_builder_profiles
  ORDER BY is_residential_default DESC, builder_name
`;

for (const p of profiles) {
  const company = (p.builder_company ?? p.builder_name).trim();
  // Use existing BPROF- id pattern mapped to BILD- so we don't lose the link
  const slug = "BILD-" + company.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20);

  await sql`
    INSERT INTO builders (
      id, company, contact_name, notes, active,
      default_finish_type, default_carcass_id, default_drawer_box_id,
      default_pull_id, default_paint_brand, default_accessories,
      preferred_cabdoor_usage_groups, is_residential_default,
      created_at, updated_at
    ) VALUES (
      ${slug}, ${company}, ${p.builder_name?.trim() ?? ""},
      ${p.notes ?? ""}, 1,
      ${p.default_finish_type ?? "paint"},
      ${p.default_carcass_id ?? null},
      ${p.default_drawer_box_id ?? null},
      ${p.default_pull_id ?? null},
      ${p.default_paint_brand ?? null},
      ${p.default_accessories ?? null},
      ${p.preferred_cabdoor_usage_groups ?? null},
      ${p.is_residential_default ? 1 : 0},
      NOW()::text, NOW()::text
    )
    ON CONFLICT (id) DO UPDATE SET
      default_finish_type             = EXCLUDED.default_finish_type,
      default_carcass_id              = EXCLUDED.default_carcass_id,
      default_drawer_box_id           = EXCLUDED.default_drawer_box_id,
      default_pull_id                 = EXCLUDED.default_pull_id,
      default_paint_brand             = EXCLUDED.default_paint_brand,
      default_accessories             = EXCLUDED.default_accessories,
      preferred_cabdoor_usage_groups  = EXCLUDED.preferred_cabdoor_usage_groups,
      is_residential_default          = EXCLUDED.is_residential_default,
      updated_at                      = NOW()::text
  `;
  console.log(`  → ${slug}: ${company} (${p.default_finish_type})`);
}

console.log(`  Migrated ${profiles.length} profiles.`);
console.log("Done! catalog_builder_profiles is still intact as a backup.");
await sql.end();
