/**
 * scripts/migrate-melamine-ids.mjs
 *
 * Remaps finish_groups.color_id from the old melamine catalog to the new one.
 *
 * The old catalog had 205 hand-built rows; the new one has 366 real supplier colours
 * with photography. No id survived: old ids read MEL-EG-F416, new ones MEL-EGG-045,
 * and even Stevenswood changed prefix from SW to SWD. Overlap is exactly zero.
 *
 * So every melamine finish group in the database currently points at an id that no
 * longer resolves.
 *
 * WHAT WAS NEVER AT RISK: finish_groups.color_name is stored denormalised, and both
 * PDFs render from it (lib/spec-data.ts reads g.color_name, not a catalog lookup).
 * No client document was ever going to print a wrong colour. What breaks without
 * this migration is the picker — an existing melamine spec opens with nothing
 * selected, and re-saving could blank the colour.
 *
 * HOW IT MATCHES: on colour name, normalised (lowercased, punctuation and spaces
 * removed). 103 of 176 distinct old names exist in the new catalog. Anything that
 * does not match is REPORTED AND LEFT ALONE — never guessed. A wrong melamine is a
 * remake, and a fuzzy match is exactly how you get one.
 *
 *   node scripts/migrate-melamine-ids.mjs --dry-run    # show the plan
 *   node scripts/migrate-melamine-ids.mjs
 *   node scripts/migrate-melamine-ids.mjs --data-from=<dir>   # read the catalog from another checkout
 *
 * The catalog MUST come from the checkout that is deployed — see the note below and
 * scripts/_tree.mjs. This refuses to run from a tree behind origin/main.
 */
import postgres from "postgres";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import { resolveTree, assertTreeIsCurrent } from "./_tree.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

/**
 * WHICH CHECKOUT THE "NEW" CATALOG COMES FROM IS THE WHOLE MIGRATION.
 *
 * Run from a tree that is behind main, this reads the OLD colors_melamine.json as its
 * definition of "new". Every existing spec still holds an old id, so every one is
 * classified "already points at a valid new id" and skipped, and the script reports a
 * clean no-op. You would conclude the migration was unnecessary and move on, leaving
 * every melamine spec pointing at ids the deployed catalog does not contain.
 *
 * A silent no-op that looks like success is worse than a crash. Hence the guard.
 */
const TREE = resolveTree(import.meta.url);
assertTreeIsCurrent(TREE, import.meta.url);

const DRY = process.argv.includes("--dry-run");
const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
const sql = postgres(url, { ssl: isLocal ? false : "require", max: 1, prepare: false });

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function main() {
  const catalogPath = resolve(TREE, "data/catalogs/colors_melamine.json");
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  console.log(`new catalog read from ${catalogPath}`);
  const byName = new Map();
  for (const c of catalog) {
    const k = norm(c.color_name);
    if (!byName.has(k)) byName.set(k, c);   // first wins; ids are unique per colour
  }
  const validIds = new Set(catalog.map((c) => c.id));
  console.log(`New catalog: ${catalog.length} colours, ${byName.size} distinct names.\n`);

  const groups = await sql`
    SELECT fg.id, fg.label, fg.color_id, fg.color_name, j.client_name
    FROM finish_groups fg
    JOIN residential_specs s ON s.id = fg.spec_id
    JOIN jobs j ON j.id = s.job_id
    WHERE fg.finish_type IN ('melamine', 'plam')
    ORDER BY j.client_name, fg.sort_order
  `;
  console.log(`${groups.length} melamine/plam finish group(s) in the database.\n`);
  if (groups.length === 0) { console.log("Nothing to do."); return; }

  const remap = [], already = [], unmatched = [], noName = [];
  for (const g of groups) {
    if (g.color_id && validIds.has(g.color_id)) { already.push(g); continue; }
    if (!g.color_name || !norm(g.color_name)) { noName.push(g); continue; }
    const hit = byName.get(norm(g.color_name));
    if (hit) remap.push({ g, to: hit });
    else unmatched.push(g);
  }

  if (already.length) console.log(`  ${already.length} already point at a valid new id — skipped.\n`);

  if (remap.length) {
    console.log(`  MATCHED BY NAME — ${remap.length} will be remapped:\n`);
    for (const { g, to } of remap) {
      console.log(`    ${String(g.client_name).slice(0,20).padEnd(22)} ${String(g.label).padEnd(8)} ${String(g.color_name).slice(0,26).padEnd(28)} ${String(g.color_id ?? "(null)").padEnd(16)} -> ${to.id}`);
    }
    console.log();
  }

  if (unmatched.length) {
    console.log(`  NOT MATCHED — ${unmatched.length} left untouched, for Karl to map by hand:\n`);
    for (const g of unmatched) {
      console.log(`    ${String(g.client_name).slice(0,20).padEnd(22)} ${String(g.label).padEnd(8)} ${String(g.color_name).slice(0,30).padEnd(32)} (${g.color_id ?? "null"})`);
    }
    console.log(`\n    These keep their stored colour name, so their documents still print correctly.`);
    console.log(`    They will show an empty picker until someone re-selects the colour.\n`);
  }

  if (noName.length) console.log(`  ${noName.length} group(s) have no colour name at all — nothing to match on.\n`);

  if (DRY) {
    console.log(`Dry run. ${remap.length} would change, ${unmatched.length} would be left alone.`);
    return;
  }
  if (remap.length === 0) { console.log("No automatic remaps to apply."); return; }

  let n = 0;
  for (const { g, to } of remap) {
    // color_name is rewritten to the catalog's spelling so the picker matches
    // exactly on the next open. The colour itself is unchanged.
    await sql`UPDATE finish_groups SET color_id = ${to.id}, color_name = ${to.color_name} WHERE id = ${g.id}`;
    n++;
  }

  const [check] = await sql`
    SELECT COUNT(*)::int AS n FROM finish_groups
    WHERE finish_type IN ('melamine','plam') AND color_id IS NOT NULL AND color_id NOT IN ${sql([...validIds])}
  `;
  console.log(`\n  remapped ${n} finish group(s)`);
  console.log(`  still pointing at an unknown id: ${check.n}${check.n ? " (the unmatched list above)" : ""}`);
  console.log("\nDone.");
}

main()
  .catch((e) => { console.error("\nMigration failed:", e.message ?? e); process.exit(1); })
  .finally(() => sql.end({ timeout: 5 }));
