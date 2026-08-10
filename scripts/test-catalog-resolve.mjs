#!/usr/bin/env node
/**
 * test-catalog-resolve.mjs — one source of truth for a catalog.
 *
 * The bug this replaces: two loaders. /admin/libraries wrote catalog_libraries in
 * the database, the spec builder page read the database, and 39 synchronous
 * accessors read data/catalogs/*.json and never looked at the database at all. An
 * edgeband edit reached the picker and not the work order.
 *
 * Most of what follows asserts what does NOT happen — specifically that no shape
 * of bad database row can serve an empty catalog. A dropdown that comes up blank
 * does not look like a failure to the person filling in the spec; it looks like
 * an answer. "No edgebanding" is a sentence a work order can print.
 *
 *   npx tsx scripts/test-catalog-resolve.mjs
 */
import { resolveCatalogRows, resolveCatalogObject } from "../lib/catalog-resolve.ts";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

const FILE = [{ id: "EB-1", product_name: "Maple" }, { id: "EB-2", product_name: "Oak" }];
const DB   = [{ id: "EB-1", product_name: "Maple (edited)" }];
const file = () => FILE;

// A thunk that fails if called — proves the file is not read when the database wins.
let fileReads = 0;
const countingFile = () => { fileReads++; return FILE; };

console.log("\nrow catalogs — the database wins when it has something to say");

{
  const r = resolveCatalogRows("edgeband", DB, file);
  check("a non-empty db row is used", r.rows === DB && r.source === "db");
  check("no note when nothing is wrong", r.note === undefined);
}
{
  fileReads = 0;
  resolveCatalogRows("edgeband", DB, countingFile);
  check("the file is not read at all when the db row is good", fileReads === 0, `read ${fileReads}x`);
}
{
  const r = resolveCatalogRows("edgeband", undefined, file);
  check("no db row falls back to the file", r.rows === FILE && r.source === "file");
  check("a plain fallback is not flagged as a problem", r.note === undefined);
}
{
  const r = resolveCatalogRows("edgeband", null, file);
  check("a null db row falls back to the file", r.rows === FILE && r.source === "file");
}

console.log("\nan empty or malformed db row must never blank a catalog");

for (const [label, bad] of [
  ["an empty array",        []],
  ["an empty object",       {}],
  ["an object of rows",     { "0": { id: "EB-1" } }],
  ["a JSON string",         '[{"id":"EB-1"}]'],
  ["a number",              0],
  ["the number 1",          1],
  ["a boolean",             false],
]) {
  const r = resolveCatalogRows("edgeband", bad, file);
  check(`${label} falls back to the file`, r.rows === FILE && r.source === "file");
  check(`${label} says why in the note`, typeof r.note === "string" && r.note.includes("edgeband"),
        JSON.stringify(r.note));
}

{
  // The one case that is genuinely ambiguous, called out so the choice is on record:
  // a deliberate "delete every row" cannot be expressed through the database. It has
  // to be a deploy. The admin PUT refuses empty writes, so the two agree.
  const r = resolveCatalogRows("edgeband", [], file);
  check("an intentional empty catalog is refused, not honoured", r.rows.length === 2);
}

console.log("\nthe name appears in the note, so a log line identifies the catalog");
{
  const r = resolveCatalogRows("colors_melamine", [], file);
  check("note names colors_melamine", (r.note ?? "").includes("colors_melamine"), r.note);
}

console.log("\nobject catalogs — doors_catalog, cabinets_catalog, express_colors");

const FILE_OBJ = { door_types: [{ id: "d1" }], sizes: {}, core_adder: {} };
const DB_OBJ   = { door_types: [{ id: "d1" }, { id: "d2" }], sizes: {}, core_adder: {} };
const fileObj  = () => FILE_OBJ;

{
  const r = resolveCatalogObject("doors_catalog", DB_OBJ, fileObj);
  check("a non-empty db object is used", r.value === DB_OBJ && r.source === "db");
}
{
  const r = resolveCatalogObject("doors_catalog", undefined, fileObj);
  check("no db row falls back to the file", r.value === FILE_OBJ && r.source === "file");
  check("no note on a plain fallback", r.note === undefined);
}
for (const [label, bad] of [
  ["an array",        [{ id: "d1" }]],
  ["an empty array",  []],
  ["an empty object", {}],
  ["a string",        "{}"],
  ["a number",        7],
]) {
  const r = resolveCatalogObject("doors_catalog", bad, fileObj);
  check(`${label} cannot replace a price book`, r.value === FILE_OBJ && r.source === "file");
}
{
  // This is the specific accident worth naming: /admin/libraries edits row lists.
  // If it ever pointed at doors_catalog it would PUT an array, and an array here
  // would wipe every door price. The route rejects the name; this is the backstop.
  const r = resolveCatalogObject("doors_catalog", [], fileObj);
  check("an array written by the row-list admin UI is ignored", r.value === FILE_OBJ);
  check("and it is reported", typeof r.note === "string" && r.note.includes("doors_catalog"), r.note);
}

console.log("\nthe file thunk is called at most once per resolution");
{
  fileReads = 0;
  resolveCatalogRows("edgeband", [], countingFile);
  check("one file read on fallback", fileReads === 1, `read ${fileReads}x`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
