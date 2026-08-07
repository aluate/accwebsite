/**
 * test-trim-types.mjs — the trim vocabulary is one list with one spelling.
 *
 * The bug this guards against is quiet: both the spec summary and the work order
 * roll trim up by `trim_type + size_desc`. Two spellings of the same part are two
 * keys, so the linear footage silently splits across two line items and nobody
 * adds them back up. It looks like a typo and behaves like a math error.
 *
 *   npx tsx scripts/test-trim-types.mjs
 */
import { readFileSync } from "node:fs";

const { canonicalTrimType, isLegacyTrimName, FG_TRIM_DEFAULT_TYPES } =
  await import("../lib/trim-types.ts");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
}

const catalog = JSON.parse(readFileSync("data/catalogs/molding_types.json", "utf8"));
const names = catalog.map((m) => m.display_name);

console.log("\n1. The catalog is the single source");
check("catalog loaded", catalog.length > 0, `${catalog.length} rows`);
for (const t of FG_TRIM_DEFAULT_TYPES) {
  // If a default drifts out of the catalog the dropdown silently offers it twice.
  check(`default type "${t}" exists in the catalog`, names.includes(t), names.join(" | "));
}
check('catalog has an "Other" escape hatch', names.some((n) => /^other/i.test(n)));

console.log("\n2. Karl's calls, 2026-08-07");
check('Toe Skin and Toe Kick collapsed to a single entry',
  names.filter((n) => /toe/i.test(n)).length === 1, names.filter((n) => /toe/i.test(n)).join(" | "));
check('no separate "Valance" entry — a light valance IS a light rail',
  !names.some((n) => /^valance$/i.test(n)), names.filter((n) => /valance|rail/i.test(n)).join(" | "));

console.log("\n3. Legacy spellings normalize");
const cases = [
  // [stored value, expected canonical]
  ["Fillers",       "Filler"],
  ["Filler",        "Filler"],
  ["Crown",         "Crown Molding"],
  ["Crown Molding", "Crown Molding"],
  ["Light Valance", "Light Rail"],
  ["Valance",       "Light Rail"],
  ["Light Rail",    "Light Rail"],
  ["Toekick",       "Toe Skin"],
  ["Toe Kick",      "Toe Skin"],
  ["Toe Skin",      "Toe Skin"],
  ["Scribe Molding","Scribe"],
];
for (const [raw, want] of cases) {
  check(`"${raw}" -> "${want}"`, canonicalTrimType(raw) === want, `got "${canonicalTrimType(raw)}"`);
}

console.log("\n4. Normalization is case- and whitespace-insensitive");
for (const raw of ["TOEKICK", "toe kick", "  Toe  Kick  ", "tOeKiCk"]) {
  check(`"${raw}" -> "Toe Skin"`, canonicalTrimType(raw) === "Toe Skin", `got "${canonicalTrimType(raw)}"`);
}

console.log("\n5. It never invents or destroys a type");
check("a PM's one-off passes through untouched",
  canonicalTrimType("Sink Apron Trim") === "Sink Apron Trim");
check("surrounding whitespace is still trimmed",
  canonicalTrimType("  Sink Apron Trim  ") === "Sink Apron Trim");
check("null/undefined/empty yield an empty string",
  canonicalTrimType(null) === "" && canonicalTrimType(undefined) === "" && canonicalTrimType("") === "");

console.log("\n6. Every canonical name is itself stable (no double-mapping)");
for (const n of names) {
  check(`"${n}" is a fixed point`, canonicalTrimType(n) === n, `got "${canonicalTrimType(n)}"`);
}

console.log("\n7. isLegacyTrimName flags exactly the rows that will be rewritten");
check('"Crown" is flagged legacy', isLegacyTrimName("Crown"));
check('"Crown Molding" is not', !isLegacyTrimName("Crown Molding"));
check('a one-off is not flagged', !isLegacyTrimName("Sink Apron Trim"));

console.log("\n8. The rollup actually merges after normalization");
// The whole point: these three rows are one trim item across two spellings.
const rows = [
  { trim_type: "Crown",         size_desc: "MMW CR037", qty_lf: 48 },
  { trim_type: "Crown Molding", size_desc: "MMW CR037", qty_lf: 22 },
  { trim_type: "Light Valance", size_desc: "1.5in",     qty_lf: 10 },
];
const roll = new Map();
for (const r of rows) {
  const key = `${canonicalTrimType(r.trim_type)}::${r.size_desc}`;
  roll.set(key, (roll.get(key) ?? 0) + r.qty_lf);
}
check("two spellings of crown merged into one line", roll.size === 2, [...roll.keys()].join(" | "));
check("their footage summed to 70 LF, not split 48/22", roll.get("Crown Molding::MMW CR037") === 70);
check("light valance rolled up as Light Rail", roll.get("Light Rail::1.5in") === 10);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
