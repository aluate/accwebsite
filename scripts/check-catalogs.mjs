#!/usr/bin/env node
/**
 * check-catalogs.mjs — every catalog file is well formed and every row is reachable.
 *
 * No database, no network. Runs in a second, so it belongs in the build.
 *
 * WHY. Catalog rows are resolved by a single key, and every lookup in the app is a
 * first-match `.find()`. A duplicate key therefore does not error — it silently
 * elects one row and orphans the other. The orphaned row still appears in the
 * dropdown, so someone picks it, the spec stores the shared key, and the document
 * prints the *other* colour. Nothing anywhere reports a problem.
 *
 * That is not hypothetical. It is live right now in colors_paint: SW 7666
 * "Intellectual Tan" carries PNT-SW-6119, which belongs to SW 6119 "Antique
 * White". Picking the tan prints the white. See KNOWN below.
 *
 * Checks, per catalog in lib/catalogs.ts:
 *   1. the JSON file exists and parses
 *   2. row-list catalogs hold an array, object catalogs hold an object
 *   3. every row has a non-empty value in its identity column
 *   4. those values are unique
 *   5. no catalog is an empty array (nothing to pick from is a bug, not a state)
 *
 * KNOWN holds defects that are accepted for now. Each needs a written reason, and
 * an entry that no longer reproduces is itself a failure — so a fix cannot leave
 * a stale exemption behind.
 *
 *   node scripts/check-catalogs.mjs
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAT = (n) => resolve(__dirname, `../data/catalogs/${n}.json`);

/** Defects accepted for now. Key: `catalog:code`. Value: why, and who decides. */
const KNOWN = {
  "colors_paint:duplicate-key": {
    detail: "PNT-SW-6119 is on two rows",
    reason:
      "Live data bug, not a code bug: colors_paint.csv line 76 gives SW 7666 " +
      "'Intellectual Tan' the id PNT-SW-6119, which belongs to SW 6119 'Antique " +
      "White' on line 46. Selecting the tan stores the white's id, so the spec " +
      "sheet prints Antique White. Line 79 already works around a collision with " +
      "a 'B' suffix (PNT-SW-6119B), so this has been hit before. The fix is one " +
      "value — PNT-SW-7666 — but the CSVs are Karl's read-only source of truth, " +
      "and any spec already storing PNT-SW-6119 has to be checked first, because " +
      "it is currently ambiguous which colour was meant. Karl's call.",
  },
  "appliances:empty": {
    detail: "appliances.json is an empty array",
    reason:
      "There is no appliance catalog yet. The spec form's applianceCatalog prop is " +
      "optional and nothing passes it, so today this is dormant rather than broken. " +
      "Needs Karl's appliance list before it can be anything else.",
  },
};

// Names come from the loader, so a catalog added there cannot skip this check.
function catalogNames() {
  const src = readFileSync(resolve(__dirname, "../lib/catalogs.ts"), "utf8");
  const block = src.slice(src.indexOf("DB_CATALOG_NAMES"), src.indexOf("const DIR ="));
  return [...new Set([...block.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]))];
}

function keyFieldMap() {
  const src = readFileSync(resolve(__dirname, "../lib/catalog-resolve.ts"), "utf8");
  const block = src.slice(
    src.indexOf("export const CATALOG_KEY_FIELD"),
    src.indexOf("export function keyFieldFor"),
  );
  return Object.fromEntries(
    [...block.matchAll(/([a-z0-9_]+):\s*"([a-z0-9_]+)"/g)].map((m) => [m[1], m[2]]),
  );
}

function objectCatalogs() {
  const src = readFileSync(resolve(__dirname, "../lib/catalogs.ts"), "utf8");
  const line = src.slice(src.indexOf("export const OBJECT_CATALOGS"));
  return new Set([...line.slice(0, line.indexOf(";")).matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));
}

const names = catalogNames();
const KEY = keyFieldMap();
const OBJECTS = objectCatalogs();

const findings = [];      // real problems
const excused = [];       // matched a KNOWN entry
const seenKnown = new Set();

function report(catalog, code, detail) {
  const k = `${catalog}:${code}`;
  if (KNOWN[k]) { seenKnown.add(k); excused.push({ k, detail, ...KNOWN[k] }); return; }
  findings.push({ catalog, code, detail });
}

for (const name of names) {
  const p = CAT(name);
  if (!existsSync(p)) { report(name, "missing", "no JSON file — run npm run sync-catalogs"); continue; }

  let parsed;
  try { parsed = JSON.parse(readFileSync(p, "utf8")); }
  catch (e) { report(name, "unparseable", e.message); continue; }

  if (OBJECTS.has(name)) {
    const ok = parsed != null && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length > 0;
    if (!ok) report(name, "bad-object", "expected a non-empty object");
    continue;
  }

  if (!Array.isArray(parsed)) { report(name, "bad-array", "expected an array, found an object"); continue; }
  if (parsed.length === 0) { report(name, "empty", "empty array — nothing to select"); continue; }

  const key = KEY[name] ?? "id";
  const blank = [];
  const values = [];
  parsed.forEach((r, i) => {
    const v = r?.[key];
    if (v == null || String(v).trim() === "") blank.push(i + 1);
    else values.push(String(v));
  });
  if (blank.length) {
    report(name, "missing-key", `${blank.length} row(s) have no ${key} (rows ${blank.slice(0, 5).join(", ")}${blank.length > 5 ? "…" : ""})`);
  }
  const dupes = [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];
  if (dupes.length) {
    report(name, "duplicate-key", `${dupes.slice(0, 5).join(", ")}${dupes.length > 5 ? ` (+${dupes.length - 5})` : ""} on more than one row`);
  }
}

const stale = Object.keys(KNOWN).filter((k) => !seenKnown.has(k));

console.log(`\n${names.length} catalogs checked.\n`);

if (excused.length) {
  console.log(`  ACCEPTED — ${excused.length} known defect(s):\n`);
  for (const e of excused) {
    console.log(`    ${e.k}`);
    console.log(`      found: ${e.detail}`);
    console.log(`      why:   ${e.reason.replace(/\s+/g, " ").slice(0, 300)}\n`);
  }
}

if (findings.length) {
  console.log(`  FAILED — ${findings.length} problem(s):\n`);
  for (const f of findings) console.log(`    ${f.catalog.padEnd(26)} ${f.code.padEnd(14)} ${f.detail}`);
  console.log(`\n  A duplicate key does not throw. It elects one row, orphans the other, and`);
  console.log(`  the orphan still shows in the dropdown — so a document prints the wrong`);
  console.log(`  value with nothing to indicate it. Fix the data, or add it to KNOWN with a`);
  console.log(`  reason if it has to wait.\n`);
}

if (stale.length) {
  console.log(`  STALE EXEMPTIONS — ${stale.length}:\n`);
  for (const k of stale) console.log(`    ${k}  no longer reproduces — delete it from KNOWN`);
  console.log(`\n  An exemption that has been fixed must not stay behind, or the next real`);
  console.log(`  instance of it passes silently.\n`);
}

const ok = findings.length === 0 && stale.length === 0;
console.log(ok
  ? `PASS — ${names.length} catalogs, ${excused.length} accepted defect(s), 0 new.\n`
  : `FAIL — ${findings.length} problem(s), ${stale.length} stale exemption(s).\n`);
process.exit(ok ? 0 : 1);
