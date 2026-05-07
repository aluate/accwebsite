/**
 * Seed crews table with Karl's initial roster.
 * Idempotent by NAME (case-insensitive).
 *
 *   npm run seed-crews
 */
import { sql } from "./_db.mjs";
import { randomBytes } from "node:crypto";

const CREWS = [
  { name: "Slavic", kind: "inhouse" },
  { name: "Tanner", kind: "inhouse" },
  { name: "Other",  kind: "inhouse" },
];

let inserted = 0;
for (const crew of CREWS) {
  const [existing] = await sql`SELECT id FROM crews WHERE LOWER(name) = LOWER(${crew.name})`;
  if (existing) {
    console.log(`  skip  ${crew.name} (already exists)`);
    continue;
  }
  const id = randomBytes(4).toString("hex");
  await sql`
    INSERT INTO crews (id, name, kind, active, created_at)
    VALUES (${id}, ${crew.name}, ${crew.kind}, true, ${new Date().toISOString()})
  `;
  console.log(`  added ${crew.name}`);
  inserted++;
}

console.log(`\nDone. ${inserted} crew(s) added.`);
await sql.end();
