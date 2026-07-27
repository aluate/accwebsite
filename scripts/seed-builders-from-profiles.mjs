/**
 * seed-builders-from-profiles.mjs
 * Seeds the `builders` contacts table from `catalog_builder_profiles`.
 * Safe to run multiple times — uses ON CONFLICT DO NOTHING.
 *
 * Usage (from acc-website folder):
 *   node scripts/seed-builders-from-profiles.mjs
 */
import { sql } from "./_db.mjs";

const profiles = await sql`
  SELECT builder_name, builder_company, notes
  FROM catalog_builder_profiles
  WHERE builder_company IS NOT NULL AND builder_company != ''
  ORDER BY is_residential_default DESC, builder_name
`;

console.log(`Found ${profiles.length} builder profiles`);

for (const p of profiles) {
  const company = (p.builder_company ?? p.builder_name).trim();
  const slug = "BILD-" + company.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20);

  await sql`
    INSERT INTO builders (id, company, contact_name, notes, active, created_at, updated_at)
    VALUES (
      ${slug},
      ${company},
      ${p.builder_name?.trim() ?? ""},
      ${p.notes ?? ""},
      1,
      NOW()::text,
      NOW()::text
    )
    ON CONFLICT (id) DO NOTHING
  `;
  console.log(`  → ${slug}: ${company}`);
}

console.log("Done.");
await sql.end();
