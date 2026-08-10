/**
 * scripts/seed-catalog-libraries.mjs
 *
 * Loads data/catalogs/*.json into the catalog_libraries table, which is what the
 * app now reads for every catalog.
 *
 * WHY THIS EXISTS. Until now there were two loaders. The spec builder page read
 * the database; the 39 synchronous catalogs.X() accessors read the JSON files and
 * never looked at the database. So an admin edit to, say, edgebanding showed up in
 * the picker and not on the work order — the shop and the office looking at the
 * same job and seeing different materials. There is one loader now, and the
 * database is what it reads, with the file as the seed and the fallback.
 *
 * That only helps if the two agree to start with, which is what this does.
 *
 * SAFETY. Nothing is destructive:
 *   - by default only catalogs with NO database row are inserted
 *   - a catalog already in the database is left alone and reported as a difference
 *   - --force overwrites, and prints the row-count change for each one first
 *   - the JSON files are never written. Karl's rule stands: the CSVs and their
 *     generated JSON are the read-only source of truth.
 *
 * If a seeded catalog turns out wrong, DELETE the row (or use the admin UI's
 * revert) and the loader falls straight back to the file.
 *
 *   node scripts/seed-catalog-libraries.mjs --dry-run     # show the plan
 *   node scripts/seed-catalog-libraries.mjs               # insert what is missing
 *   node scripts/seed-catalog-libraries.mjs --force       # also overwrite existing
 *   node scripts/seed-catalog-libraries.mjs --only=edgeband,colors_melamine
 *   node scripts/seed-catalog-libraries.mjs --repair    # only fix double-encoded rows
 *   node scripts/seed-catalog-libraries.mjs --data-from=<dir>   # read catalogs from another checkout
 *
 * WHICH TREE THE DATA COMES FROM MATTERS. The database wins over the file once a
 * row exists, so seeding from a stale checkout does not just fail to help — it
 * overwrites what is deployed with something older, silently. This script refuses
 * to run from a tree that is behind origin/main. Use --data-from to point it at a
 * checkout of what is actually live.
 *
 * REPAIR. The admin save route used to write `${JSON.stringify(rows)}::jsonb`,
 * which postgres.js double-encodes: the stored jsonb is a *string* holding the
 * array, not the array. Any catalog saved from /admin/libraries before this was
 * fixed is in that state, and the old loader handed the string straight to
 * .find(). --repair (and a normal run) re-parses those rows in place. It is
 * lossless: the string is exactly the JSON that was saved.
 */
import postgres from "postgres";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import { resolveTree, assertTreeIsCurrent, ALLOW_STALE } from "./_tree.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Credentials always come from the tree this script lives in — that is where
// .env.local is. The catalog DATA may come from somewhere else; see --data-from.
config({ path: resolve(__dirname, "../.env.local") });

const DRY = process.argv.includes("--dry-run");

/**
 * Where to read data/catalogs and lib from. Defaults to this script's own repo.
 *
 * This flag exists because of a near miss. Karl's working tree sits permanently on
 * a feature branch and was months behind main: its colors_melamine.json held the
 * OLD 205-colour catalog while production had just deployed the new 366-colour one.
 * Seeding from that tree would have written 205 old rows into catalog_libraries —
 * and the database now WINS over the file, so production would have silently
 * reverted to a melamine catalog whose ids resolve to no photography at all, hours
 * after shipping the new one. Nothing would have errored.
 *
 * So: point this at a checkout of what is actually deployed.
 *
 *   git fetch origin main
 *   git worktree add %TEMP%\accseed origin/main --detach
 *   node scripts/seed-catalog-libraries.mjs --data-from=%TEMP%\accseed --dry-run
 *   git worktree remove %TEMP%\accseed
 */
const DATA_FROM = (process.argv.find((a) => a.startsWith("--data-from=")) ?? "")
  .replace("--data-from=", "")
  .trim();
const TREE = resolveTree(import.meta.url);
const REPAIR_ONLY = process.argv.includes("--repair");
const FORCE = process.argv.includes("--force");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "")
  .replace("--only=", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
const sql = postgres(url, { ssl: isLocal ? false : "require", max: 1, prepare: false });

// Kept in step with DB_CATALOG_NAMES in lib/catalogs.ts. The check below fails
// loudly if the two drift, rather than silently seeding a subset.
const CATALOG_NAMES = [
  "acc_cabinet_catalog", "acc_catalog_carcass", "acc_catalog_doors",
  "acc_catalog_finishes", "acc_catalog_pulls", "accessories_reva", "appliances",
  "builder_profiles", "cabdoor_edge_details", "cabdoor_inside_profiles",
  "cabdoor_mitre_patterns", "cabdoor_panels", "cabdoor_presets",
  "cabinet_features", "cabinet_labor", "cabinet_types", "cabinets_catalog",
  "colors_carcass", "colors_melamine", "colors_paint", "colors_stain",
  "construction_profiles", "door_materials", "door_styles", "doors_catalog",
  "drawer_box", "drawer_slides", "edgeband", "express_colors", "glazes",
  "hardware_base_pullouts", "hardware_blind_corners", "hardware_closet_rods",
  "hardware_door_pulls", "hardware_drawer_pulls", "hardware_drawer_slides",
  "hardware_hinges", "hardware_misc", "hardware_pulls",
  "hardware_rollout_slides", "hardware_shelf_clips", "hardware_trash_pullouts",
  "molding_materials", "molding_profiles", "molding_types", "paint_colors_bm",
  "paint_colors_sw", "rooms", "sheens", "species", "topcoats",
  "countertop_edges", "countertop_materials", "countertop_styles",
];

/**
 * Catalogs that still appear in the loader's list but that nothing reads from
 * catalog_libraries, because a dedicated table took over. Seeding them would put
 * a row in the database that no code path looks at — which is how the confusion
 * started. See SUPERSEDED_CATALOGS in lib/catalogs.ts.
 */
const SUPERSEDED = {
  builder_profiles: "catalog_builder_profiles (edit at /admin/builder-profiles)",
  accessories_reva: "accessories_catalog (edit at /admin/accessories)",
};

/**
 * Catalogs whose identity column is not `id`. Kept in step with CATALOG_KEY_FIELD
 * in lib/catalog-resolve.ts; the drift check below fails if the two disagree.
 */
const KEY_FIELD = {
  acc_cabinet_catalog:   "sku_prefix",
  acc_catalog_carcass:   "catalog_id",
  acc_catalog_doors:     "catalog_id",
  acc_catalog_finishes:  "catalog_id",
  acc_catalog_pulls:     "catalog_id",
  cabinet_features:      "code",
  cabinet_labor:         "operation_code",
  cabinet_types:         "code",
  construction_profiles: "profile_id",
  paint_colors_sw:       "code",
  paint_colors_bm:       "name",
};
const keyFieldFor = (name) => KEY_FIELD[name] ?? "id";

/** Object-shaped catalogs. The loader will not accept an array for these. */
const OBJECT_CATALOGS = new Set(["doors_catalog", "cabinets_catalog", "express_colors"]);

// The drift checks compare this script's copy of the catalog list and identity
// columns against lib/. That only works when lib/ is the version this script
// shipped with — which is not the case if the script has been copied onto a
// working tree sitting on another branch. Missing files are a skipped check with
// a warning, not a crash, because the seeding itself does not depend on them.
function readIfPresent(rel) {
  const p = resolve(TREE, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

function assertNamesMatchLoader() {
  const src = readIfPresent("lib/catalogs.ts");
  if (!src) {
    console.warn("  ! lib/catalogs.ts not found — skipping the catalog-list drift check.\n");
    return;
  }
  const block = src.slice(src.indexOf("DB_CATALOG_NAMES"), src.indexOf("const DIR ="));
  const inLoader = new Set([...block.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));
  const missing = [...inLoader].filter((n) => !CATALOG_NAMES.includes(n));
  const extra = CATALOG_NAMES.filter((n) => !inLoader.has(n));
  if (missing.length || extra.length) {
    console.error("This script's catalog list has drifted from lib/catalogs.ts:");
    if (missing.length) console.error(`  in the loader but not here: ${missing.join(", ")}`);
    if (extra.length)   console.error(`  here but not in the loader: ${extra.join(", ")}`);
    console.error("\nUpdate CATALOG_NAMES above so the seeder cannot quietly skip a catalog.");
    process.exit(1);
  }

  // Same check for the identity columns. Getting these out of step would mean the
  // seeder validating a different field from the one the API validates.
  const resolveSrc = readIfPresent("lib/catalog-resolve.ts");
  if (!resolveSrc) {
    console.warn("  ! lib/catalog-resolve.ts not found — skipping the identity-column drift check.\n");
    return;
  }
  const mapBlock = resolveSrc.slice(
    resolveSrc.indexOf("export const CATALOG_KEY_FIELD"),
    resolveSrc.indexOf("export function keyFieldFor"),
  );
  const inResolve = Object.fromEntries(
    [...mapBlock.matchAll(/([a-z0-9_]+):\s*"([a-z0-9_]+)"/g)].map((m) => [m[1], m[2]]),
  );
  const keyDrift = [
    ...Object.keys(inResolve).filter((k) => inResolve[k] !== KEY_FIELD[k]),
    ...Object.keys(KEY_FIELD).filter((k) => !(k in inResolve)),
  ];
  if (keyDrift.length) {
    console.error(`Identity columns have drifted from lib/catalog-resolve.ts: ${[...new Set(keyDrift)].join(", ")}`);
    process.exit(1);
  }
}

function fileData(name) {
  const p = resolve(TREE, `data/catalogs/${name}.json`);
  if (!existsSync(p)) return { ok: false, reason: "no JSON file" };
  let parsed;
  try { parsed = JSON.parse(readFileSync(p, "utf8")); }
  catch (e) { return { ok: false, reason: `unparseable JSON (${e.message})` }; }

  const isObj = parsed != null && typeof parsed === "object" && !Array.isArray(parsed);
  if (OBJECT_CATALOGS.has(name)) {
    if (!isObj) return { ok: false, reason: "expected an object, file holds an array" };
    return { ok: true, data: parsed, count: Object.keys(parsed).length, shape: "object" };
  }
  if (!Array.isArray(parsed)) return { ok: false, reason: "expected an array, file holds an object" };
  if (parsed.length === 0) return { ok: false, reason: "file is an empty array — nothing to seed" };
  const key = keyFieldFor(name);
  const noId = parsed.filter((r) => r?.[key] == null || String(r[key]).trim() === "").length;
  if (noId) return { ok: false, reason: `${noId} row(s) have no ${key}` };
  const keys = parsed.map((r) => String(r[key]));
  const dupes = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
  if (dupes.length) {
    return { ok: false, reason: `duplicate ${key}: ${dupes.slice(0, 5).join(", ")}${dupes.length > 5 ? ` (+${dupes.length - 5})` : ""}` };
  }
  return { ok: true, data: parsed, count: parsed.length, shape: "array", key };
}

/**
 * Compare a database row with a file. Postgres jsonb does not preserve key order —
 * it stores keys sorted — so a plain JSON.stringify comparison reports every
 * round-tripped catalog as different from its own file. That would have told Karl
 * 49 catalogs had unsaved admin edits when none of them did.
 */
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v !== null && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

function dbCount(data, name) {
  if (data == null) return null;
  if (OBJECT_CATALOGS.has(name)) {
    return typeof data === "object" && !Array.isArray(data) ? Object.keys(data).length : -1;
  }
  return Array.isArray(data) ? data.length : -1;
}

async function main() {
  if (DATA_FROM) console.log(`\nreading catalogs from ${TREE}\n`);
  assertTreeIsCurrent(TREE, import.meta.url);
  if (ALLOW_STALE) console.warn("  ! the database will win over whatever is live.\n");
  assertNamesMatchLoader();

  const targets = ONLY.length ? ONLY : CATALOG_NAMES;
  const unknown = targets.filter((n) => !CATALOG_NAMES.includes(n));
  if (unknown.length) {
    console.error(`Not catalogs the loader reads: ${unknown.join(", ")}`);
    process.exit(1);
  }

  // Idempotent, and cheaper than telling someone to go run db-push first.
  await sql`
    CREATE TABLE IF NOT EXISTS catalog_libraries (
      name       TEXT PRIMARY KEY,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const existing = new Map();
  try {
    for (const r of await sql`SELECT name, data FROM catalog_libraries`) {
      existing.set(r.name, r.data);
    }
  } catch (e) {
    console.error(`Cannot read catalog_libraries: ${e.message}`);
    process.exit(1);
  }

  console.log(`${targets.length} catalog(s) to consider. ${existing.size} row(s) already in catalog_libraries.\n`);

  // Repair double-encoded rows before anything else looks at them, so a bad row is
  // not also reported as "differs from the file".
  const encoded = [];
  for (const [name, data] of existing) {
    if (typeof data !== "string") continue;
    let reparsed;
    try { reparsed = JSON.parse(data); } catch { encoded.push({ name, broken: true }); continue; }
    encoded.push({ name, reparsed, shape: Array.isArray(reparsed) ? `${reparsed.length} rows` : "object" });
  }
  if (encoded.length) {
    console.log(`  DOUBLE-ENCODED — ${encoded.length} row(s) hold a JSON string instead of JSON:\n`);
    for (const e of encoded) {
      console.log(`    ${e.name.padEnd(28)} ${e.broken ? "unparseable — left alone" : `-> ${e.shape}`}`);
    }
    console.log(`\n    Written by the old admin save route. The loader currently ignores these`);
    console.log(`    and serves the file, so nothing is printing wrong — but the edit they`);
    console.log(`    represent is not reaching anything either.\n`);
    if (!DRY) {
      let fixed = 0;
      for (const e of encoded) {
        if (e.broken) continue;
        await sql`UPDATE catalog_libraries SET data = ${sql.json(e.reparsed)}, updated_at = NOW() WHERE name = ${e.name}`;
        existing.set(e.name, e.reparsed);
        fixed++;
      }
      console.log(`    repaired ${fixed}\n`);
    }
  } else if (REPAIR_ONLY) {
    console.log("  No double-encoded rows.\n");
  }
  if (REPAIR_ONLY) {
    console.log(DRY ? "Dry run, --repair only. Nothing else considered." : "--repair only. Nothing else written.");
    return;
  }

  const toInsert = [], toOverwrite = [], keeping = [], skipped = [];

  for (const name of targets) {
    if (SUPERSEDED[name] && !ONLY.includes(name)) {
      skipped.push({ name, reason: `read from ${SUPERSEDED[name]}` });
      continue;
    }
    const f = fileData(name);
    if (!f.ok) { skipped.push({ name, reason: f.reason }); continue; }

    if (!existing.has(name)) { toInsert.push({ name, ...f }); continue; }

    const have = dbCount(existing.get(name), name);
    const same = canonical(existing.get(name)) === canonical(f.data);
    if (same) { keeping.push({ name, count: f.count, identical: true }); continue; }
    if (FORCE) toOverwrite.push({ name, ...f, was: have });
    else keeping.push({ name, count: f.count, was: have, identical: false });
  }

  if (toInsert.length) {
    console.log(`  INSERT — ${toInsert.length} catalog(s) have no database row yet:\n`);
    for (const t of toInsert) console.log(`    ${t.name.padEnd(28)} ${String(t.count).padStart(5)} ${t.shape === "object" ? "key(s)" : "row(s)"}`);
    console.log();
  }

  if (toOverwrite.length) {
    console.log(`  OVERWRITE (--force) — ${toOverwrite.length} catalog(s):\n`);
    for (const t of toOverwrite) console.log(`    ${t.name.padEnd(28)} ${String(t.was).padStart(5)} -> ${String(t.count).padStart(5)}`);
    console.log();
  }

  const differing = keeping.filter((k) => !k.identical);
  if (differing.length) {
    console.log(`  ALREADY IN THE DATABASE and different from the file — left alone:\n`);
    for (const k of differing) {
      console.log(`    ${k.name.padEnd(28)} db ${String(k.was).padStart(5)}   file ${String(k.count).padStart(5)}`);
    }
    console.log(`\n    These are the ones someone has edited through /admin/libraries. The`);
    console.log(`    database wins, which is correct — but the file is what deploys, so a`);
    console.log(`    difference here means the next fresh environment will not match this`);
    console.log(`    one. Export each from the admin page (Download CSV) and commit it, or`);
    console.log(`    re-run with --force to throw the edits away.\n`);
  }

  const identical = keeping.filter((k) => k.identical).length;
  if (identical) console.log(`  ${identical} catalog(s) already match the file exactly — nothing to do.\n`);

  if (skipped.length) {
    console.log(`  SKIPPED — ${skipped.length}:\n`);
    for (const s of skipped) console.log(`    ${s.name.padEnd(28)} ${s.reason}`);
    console.log();
  }

  const writes = [...toInsert, ...toOverwrite];
  if (DRY) {
    console.log(`Dry run. ${writes.length} catalog(s) would be written, ${differing.length} left alone.`);
    return;
  }
  if (writes.length === 0) { console.log("Nothing to write."); return; }

  let n = 0;
  for (const w of writes) {
    // sql.json(), not `${JSON.stringify(x)}::jsonb` — see the note in
    // app/api/admin/catalog-libraries/[name]/route.ts. The string form stores a
    // jsonb string rather than an array, and the read-back check below is what
    // caught it.
    await sql`
      INSERT INTO catalog_libraries (name, data, updated_at)
      VALUES (${w.name}, ${sql.json(w.data)}, NOW())
      ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `;
    n++;
  }

  // Read back rather than trusting the writes.
  const after = await sql`
    SELECT name, jsonb_typeof(data) AS kind,
           CASE WHEN jsonb_typeof(data) = 'array' THEN jsonb_array_length(data) ELSE NULL END AS rows
    FROM catalog_libraries WHERE name IN ${sql(writes.map((w) => w.name))}
  `;
  const bad = after.filter((r) => {
    const want = OBJECT_CATALOGS.has(r.name) ? "object" : "array";
    return r.kind !== want;
  });

  console.log(`\n  wrote ${n} catalog(s)`);
  console.log(`  verified ${after.length} row(s) back out of the database`);
  if (bad.length) {
    console.log(`  WRONG SHAPE: ${bad.map((b) => `${b.name} (${b.kind})`).join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(`  all shapes correct`);
  }
  console.log("\nDone. The app picks these up within 15 seconds (the loader's cache TTL).");
}

main()
  .catch((e) => { console.error("\nSeed failed:", e.message ?? e); process.exit(1); })
  .finally(() => sql.end({ timeout: 5 }));
