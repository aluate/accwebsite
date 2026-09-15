/**
 * migrate-unified-builders.mjs
 * Creates the builders table (if needed) and migrates catalog_builder_profiles into it.
 * Safe to run multiple times.
 *
 * Usage:  node scripts/migrate-unified-builders.mjs
 */
import { sql } from "./_db.mjs";

console.log("Step 1: Creating builders table if it does not exist...");
await sql.unsafe(`
  CREATE TABLE IF NOT EXISTS builders (
    id                             TEXT PRIMARY KEY,
    company                        TEXT NOT NULL,
    contact_name                   TEXT,
    phone                          TEXT,
    email                          TEXT,
    typical_pm                     TEXT,
    notes                          TEXT,
    active                         INTEGER DEFAULT 1,
    default_finish_type            TEXT DEFAULT 'paint',
    default_carcass_id             TEXT,
    default_drawer_box_id          TEXT,
    default_pull_id                TEXT,
    default_paint_brand            TEXT,
    default_accessories            TEXT,
    preferred_cabdoor_usage_groups TEXT,
    is_residential_default         INTEGER DEFAULT 0,
    created_at                     TEXT,
    updated_at                     TEXT
  )
`);
const extraCols = [
  [`default_finish_type`,            `TEXT DEFAULT 'paint'`],
  [`default_carcass_id`,             `TEXT`],
  [`default_drawer_box_id`,          `TEXT`],
  [`default_pull_id`,                `TEXT`],
  [`default_paint_brand`,            `TEXT`],
  [`default_accessories`,            `TEXT`],
  [`preferred_cabdoor_usage_groups`, `TEXT`],
  [`is_residential_default`,         `INTEGER DEFAULT 0`],
];
for (const [col, def] of extraCols) {
  await sql.unsafe(`ALTER TABLE builders ADD COLUMN IF NOT EXISTS ${col} ${def}`);
}
console.log("  Done.");

console.log("Step 2: Adding builder_id column to jobs...");
await sql.unsafe(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS builder_id TEXT`);
console.log("  Done.");

/*
  STOP if the table already has rows.

  This script was safe exactly once: against an empty `builders` table. On
  2026-09-15 that table was seeded by hand with 13 curated rows, and running
  this over the top of them does real damage, because it mints its own ids as
  "BILD-" + slug.slice(0, 20) and three of those disagree with what is there:

      "Residential Customer"   -> BILD-RESIDENTIAL-CUSTOMER   a SECOND row also
                                                              claiming to be the
                                                              residential default
      "Atlas Builders"         -> BILD-ATLAS-BUILDERS         duplicate of BILD-ATLAS
      "CASCADE RIDGE BUILDERS" -> BILD-CASCADE-RIDGE-BUILDE   truncated mid-word,
                                                              duplicate row

  Duplicates in the builder picker, and two rows fighting over is_residential_default.
  On the ids that DO match it upserts, overwriting typical_pm and
  preferred_cabdoor_usage_groups with nulls and setting contact_name to a copy of
  the company name — which is not a contact, and is against the rule that a
  person field is a select populated from real people.

  So: refuse, say why, and let a human decide. Set FORCE=1 to override, which you
  should only do against a table you are willing to have rewritten.
*/
const [{ count: existingBuilders }] = await sql`SELECT COUNT(*)::int AS count FROM builders`;
if (existingBuilders > 0 && process.env.FORCE !== "1") {
  console.error(`
  REFUSING TO RUN. The builders table already has ${existingBuilders} row(s).

  This script generates its own ids and would create duplicate builders and a
  second row claiming is_residential_default. It would also blank typical_pm and
  the usage groups on rows whose ids happen to match.

  If you are adding one builder, use the Add Builder button on
  /admin/builder-companies instead.

  To run anyway (and accept the rewrite):  FORCE=1 node scripts/migrate-unified-builders.mjs
`);
  process.exit(1);
}

console.log("Step 3: Migrating catalog_builder_profiles → builders...");
const profiles = await sql`
  SELECT id, builder_name, builder_company,
         default_finish_type, default_carcass_id, default_drawer_box_id,
         default_pull_id, default_paint_brand, notes, is_residential_default
  FROM catalog_builder_profiles
  ORDER BY is_residential_default DESC, builder_name
`;

for (const p of profiles) {
  const company = (p.builder_company ?? p.builder_name ?? "").trim();
  if (!company) continue;
  const slug = "BILD-" + company.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20);

  await sql`
    INSERT INTO builders (
      id, company, contact_name, notes, active,
      default_finish_type, default_carcass_id, default_drawer_box_id,
      default_pull_id, default_paint_brand,
      is_residential_default, created_at, updated_at
    ) VALUES (
      ${slug}, ${company}, ${p.builder_name?.trim() ?? ""},
      ${p.notes ?? ""}, 1,
      ${p.default_finish_type ?? "paint"},
      ${p.default_carcass_id ?? null},
      ${p.default_drawer_box_id ?? null},
      ${p.default_pull_id ?? null},
      ${p.default_paint_brand ?? null},
      ${p.is_residential_default ? 1 : 0},
      NOW()::text, NOW()::text
    )
    ON CONFLICT (id) DO UPDATE SET
      default_finish_type   = EXCLUDED.default_finish_type,
      default_carcass_id    = EXCLUDED.default_carcass_id,
      default_drawer_box_id = EXCLUDED.default_drawer_box_id,
      default_pull_id       = EXCLUDED.default_pull_id,
      default_paint_brand   = EXCLUDED.default_paint_brand,
      is_residential_default = EXCLUDED.is_residential_default,
      updated_at            = NOW()::text
  `;
  console.log(`  -> ${slug}: ${company} (${p.default_finish_type ?? "paint"})`);
}

console.log(`  Migrated ${profiles.length} profiles.`);
console.log("\nAll done! Go to Admin -> Builder Companies to verify.");
await sql.end();
