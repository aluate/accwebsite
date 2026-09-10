/**
 * scripts/check-input-map.mjs
 *
 * INPUT_FIELD_MAP.md is the law of inputs. A map that drifts is worse than no map,
 * so this makes drift fail the build instead of going unnoticed.
 *
 * Fails when:
 *   - a `jobs` column exists in the schema and has no row in the map
 *   - a field is in JOB_PATCH_FIELDS and has no row in the map
 *   - the map names a `jobs` column that no longer exists in the schema
 *
 * Grouped rows are allowed: the map may cover several columns in one row
 * (e.g. the four `mod_*` flags). Declare those here, explicitly, so the coverage
 * is stated rather than guessed.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAP_PATH = join(REPO, "INPUT_FIELD_MAP.md");

/** Column -> the map row that covers it, when the row does not name it literally. */
const GROUPED = {
  mod_residential: "`mod_*` (4)",
  mod_commercial: "`mod_*` (4)",
  mod_trim: "`mod_*` (4)",
  mod_doors: "`mod_*` (4)",
  innergy_opportunity_id: "`innergy_*` (3)",
  innergy_bid_id: "`innergy_*` (3)",
  innergy_synced_at: "`innergy_*` (3)",
  placeholder_unit_count: "placeholder unit count + 4 per-unit numbers",
  placeholder_per_unit_value: "placeholder unit count + 4 per-unit numbers",
  placeholder_per_unit_boxes: "placeholder unit count + 4 per-unit numbers",
  placeholder_per_unit_shop_hrs: "placeholder unit count + 4 per-unit numbers",
  placeholder_per_unit_install_hrs: "placeholder unit count + 4 per-unit numbers",
  is_placeholder: "placeholder unit count + 4 per-unit numbers",
};

function jobsColumns() {
  const src = readFileSync(join(REPO, "scripts/db-push.mjs"), "utf8");
  const cols = new Set();
  const create = src.match(/CREATE TABLE IF NOT EXISTS jobs \(([\s\S]*?)\n {4}\);/);
  if (!create) throw new Error("could not find the jobs CREATE TABLE in db-push.mjs");
  for (const line of create[1].split("\n")) {
    for (const m of line.matchAll(
      /(?:^|,)\s*([a-z_]+)\s+(TEXT|INTEGER|BOOLEAN|NUMERIC|REAL|TIMESTAMPTZ|DATE|BIGINT)/g,
    )) cols.add(m[1]);
  }
  for (const m of src.matchAll(/ALTER TABLE jobs\s+ADD COLUMN(?: IF NOT EXISTS)?\s+([a-z_]+)/g)) {
    cols.add(m[1]);
  }
  return [...cols].sort();
}

function patchFields() {
  const src = readFileSync(join(REPO, "app/api/jobs/[id]/route.ts"), "utf8");
  const block = src.match(/JOB_PATCH_FIELDS[^=]*=\s*\[([\s\S]*?)\]/);
  if (!block) throw new Error("could not find JOB_PATCH_FIELDS");
  return [...block[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

const map = readFileSync(MAP_PATH, "utf8");
const covered = (col) =>
  new RegExp(`\`(?:jobs\\.)?${col}\``).test(map) || (GROUPED[col] && map.includes(GROUPED[col]));

const cols = jobsColumns();
const missing = cols.filter((c) => !covered(c));
const patchMissing = patchFields().filter((c) => !covered(c));

// The reverse check: a column the map names that the schema no longer has.
const named = new Set(
  [...map.matchAll(/`jobs\.([a-z_]+)`/g)].map((m) => m[1]),
);
const stale = [...named].filter((c) => !cols.includes(c));

let bad = false;
if (missing.length) {
  bad = true;
  console.error(`\nMISSING FROM INPUT_FIELD_MAP.md — ${missing.length} jobs column(s):\n`);
  for (const c of missing) console.error(`    ${c}`);
  console.error(`\n  Add a row for each in section 2, 3 or 4 before shipping the column.`);
}
if (patchMissing.length) {
  bad = true;
  console.error(`\nIN JOB_PATCH_FIELDS BUT NOT IN THE MAP — ${patchMissing.length}:\n`);
  for (const c of patchMissing) console.error(`    ${c}`);
}
if (stale.length) {
  bad = true;
  console.error(`\nTHE MAP NAMES COLUMNS THAT NO LONGER EXIST — ${stale.length}:\n`);
  for (const c of stale) console.error(`    ${c}`);
}

if (bad) {
  console.error("");
  process.exit(1);
}
console.log(`INPUT_FIELD_MAP.md covers all ${cols.length} jobs columns and every PATCH field.`);
