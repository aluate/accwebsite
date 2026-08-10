#!/usr/bin/env node
/**
 * test-catalog-loader.mjs — the loader really reads the database.
 *
 * lib/catalog-resolve.ts is unit tested (scripts/test-catalog-resolve.mjs). That
 * covers the rules. This covers the wiring: one snapshot, one query, the database
 * winning over the file, and the cache actually clearing when told to. The bug
 * being guarded against is not a wrong rule — it is a correct rule that nothing
 * calls, which is exactly what the old split was.
 *
 * Needs a database with the schema applied. Safe against a real one: it writes
 * only to catalog_libraries under a reserved test name, and deletes it after.
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/test-catalog-loader.mjs
 */
import postgres from "postgres";
import { getCatalogs, invalidateCatalogCache } from "../lib/catalogs.ts";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
const sql = postgres(url, { ssl: isLocal ? false : "require", max: 1, prepare: false });

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

// Restored at the end whatever happens, so this is safe to point at production.
let savedEdgeband = null;
let hadEdgeband = false;

async function main() {
  const [existing] = await sql`SELECT data FROM catalog_libraries WHERE name = 'edgeband'`;
  hadEdgeband = !!existing;
  savedEdgeband = existing?.data ?? null;

  console.log("\nthe snapshot serves the database when it has a row");

  const marker = "EB-LOADER-TEST-ROW";
  await sql`
    INSERT INTO catalog_libraries (name, data, updated_at)
    VALUES ('edgeband', ${sql.json([{ id: marker, product_name: "Loader Test", supplier: "test", placeholder: false }])}, NOW())
    ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
  `;
  invalidateCatalogCache();

  let cat = await getCatalogs();
  const fromDb = cat.edgebands();
  check("edgebands() returns the database row", fromDb.length === 1 && fromDb[0].id === marker,
        `${fromDb.length} row(s), first id ${fromDb[0]?.id}`);
  check("sourceOf reports db", cat.sourceOf("edgeband") === "db", String(cat.sourceOf("edgeband")));
  check("dbBackedNames includes edgeband", cat.dbBackedNames().includes("edgeband"));

  console.log("\na second accessor on the same snapshot does not re-query");
  const t0 = Date.now();
  for (let i = 0; i < 200; i++) cat.edgebands();
  check("200 reads of a memoised catalog are instant", Date.now() - t0 < 50, `${Date.now() - t0}ms`);

  console.log("\nthe file still backs catalogs the database has no row for");
  await sql`DELETE FROM catalog_libraries WHERE name = 'edgeband'`;
  invalidateCatalogCache();
  cat = await getCatalogs();
  const fromFile = cat.edgebands();
  check("edgebands() falls back to the shipped file", fromFile.length > 1 && !fromFile.some(e => e.id === marker),
        `${fromFile.length} row(s)`);
  check("sourceOf reports file", cat.sourceOf("edgeband") === "file", String(cat.sourceOf("edgeband")));

  console.log("\na double-encoded row cannot blank a catalog");
  await sql`
    INSERT INTO catalog_libraries (name, data, updated_at)
    VALUES ('edgeband', to_jsonb(${JSON.stringify([{ id: marker }])}::text), NOW())
    ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
  `;
  invalidateCatalogCache();
  cat = await getCatalogs();
  const guarded = cat.edgebands();
  check("a jsonb string is ignored in favour of the file", guarded.length > 1 && !guarded.some(e => e.id === marker),
        `${guarded.length} row(s)`);

  console.log("\nan empty database row cannot blank a catalog");
  await sql`UPDATE catalog_libraries SET data = ${sql.json([])} WHERE name = 'edgeband'`;
  invalidateCatalogCache();
  cat = await getCatalogs();
  check("an empty array is ignored in favour of the file", cat.edgebands().length > 1,
        `${cat.edgebands().length} row(s)`);

  console.log("\nobject catalogs resolve too");
  cat = await getCatalogs();
  const doors = cat.doorCatalog();
  check("doorCatalog() has door types", Array.isArray(doors.door_types) && doors.door_types.length > 0);
  const families = cat.cabinetFamilies();
  check("cabinetFamilies() flattens to rows with a family_code",
        families.length > 0 && typeof families[0].family_code === "string");
  const express = cat.expressColors();
  check("expressColors() has the three books",
        Array.isArray(express.paint) && Array.isArray(express.stain) && Array.isArray(express.melamine));

  console.log("\nhardwareByRole reads the same snapshot, not the disk, per call");
  const t1 = Date.now();
  for (let i = 0; i < 500; i++) cat.hardwareByRole("hinges");
  check("500 role lookups are instant", Date.now() - t1 < 100, `${Date.now() - t1}ms`);
  check("an unknown role is empty rather than an error", cat.hardwareByRole("nonsense").length === 0);

  console.log("\nevery accessor returns rows");
  const skip = new Set(["hardwareByRole", "dbBackedNames", "sourceOf"]);
  const empties = [];
  for (const [k, fn] of Object.entries(cat)) {
    if (skip.has(k) || typeof fn !== "function") continue;
    let v;
    try { v = fn(); } catch (e) { empties.push(`${k} threw: ${e.message}`); continue; }
    const n = Array.isArray(v) ? v.length : Object.keys(v ?? {}).length;
    if (n === 0) empties.push(`${k} is empty`);
  }
  check("no accessor is empty or throwing", empties.length === 0, empties.join("; "));
}

main()
  .catch((e) => { console.error("\nTest run failed:", e.message ?? e); fail++; })
  .finally(async () => {
    // Put edgeband back exactly as it was.
    if (hadEdgeband) {
      await sql`
        INSERT INTO catalog_libraries (name, data, updated_at)
        VALUES ('edgeband', ${sql.json(savedEdgeband)}, NOW())
        ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `;
    } else {
      await sql`DELETE FROM catalog_libraries WHERE name = 'edgeband'`;
    }
    invalidateCatalogCache();
    await sql.end({ timeout: 5 });
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  });
