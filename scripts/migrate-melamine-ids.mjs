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

/**
 * Explicit picks, for the cases the matcher refuses to guess:
 *
 *   --set=<finish_group_id>:<catalog_id>
 *
 * Repeatable. The catalog id is validated against the catalog, and the finish group
 * against the database, so a typo is a refusal rather than a wrong colour.
 */
const SETS = process.argv
  .filter((a) => a.startsWith("--set="))
  .map((a) => a.replace("--set=", "").trim())
  .map((pair) => {
    const i = pair.lastIndexOf(":");
    if (i < 1) { console.error(`--set expects <finish_group_id>:<catalog_id>, got "${pair}"`); process.exit(1); }
    return { fgId: pair.slice(0, i), catalogId: pair.slice(i + 1) };
  });
const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
const sql = postgres(url, { ssl: isLocal ? false : "require", max: 1, prepare: false });

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function main() {
  const catalogPath = resolve(TREE, "data/catalogs/colors_melamine.json");
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  console.log(`new catalog read from ${catalogPath}`);
  // One name can belong to several rows, so this is a list, not a winner.
  //
  // The comment that used to sit here said "first wins; ids are unique per colour".
  // That is false: 36 names in this catalog appear on more than one row, covering 102
  // of 366 rows. "Black" is on 13. "Winter Fun!" is on two — MEL-TAF-009 in HighGloss
  // and MEL-TAF-010 in Prelude, which are different panels at different prices.
  //
  // First-wins would have silently picked one. On this run it happens not to bite,
  // because the three names that matched are each unique — but that is luck, not
  // design, and the next spec that says "BLACK" would have been assigned one of
  // thirteen with nothing to indicate a choice had been made.
  const byName = new Map();
  for (const c of catalog) {
    const k = norm(c.color_name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(c);
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

  // Explicit picks first, so they win over anything the matcher would have said.
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const setFor = new Map();
  for (const { fgId, catalogId } of SETS) {
    const target = byId.get(catalogId);
    if (!target) {
      console.error(`--set: "${catalogId}" is not an id in this catalog. Nothing was written.`);
      process.exit(1);
    }
    const g = groups.find((x) => x.id === fgId);
    if (!g) {
      console.error(`--set: no melamine finish group with id "${fgId}". Nothing was written.`);
      console.error(`  ids in play: ${groups.map((x) => x.id).join(", ")}`);
      process.exit(1);
    }
    setFor.set(fgId, target);
  }

  const remap = [], already = [], unmatched = [], ambiguous = [], noName = [], chosen = [];
  for (const g of groups) {
    const pick = setFor.get(g.id);
    if (pick) { chosen.push({ g, to: pick }); continue; }
    if (g.color_id && validIds.has(g.color_id)) { already.push(g); continue; }
    if (!g.color_name || !norm(g.color_name)) { noName.push(g); continue; }
    const hits = byName.get(norm(g.color_name)) ?? [];
    if (hits.length === 1) remap.push({ g, to: hits[0] });
    else if (hits.length > 1) ambiguous.push({ g, candidates: hits });
    else unmatched.push(g);
  }

  if (chosen.length) {
    console.log(`  CHOSEN BY HAND (--set) — ${chosen.length}:\n`);
    for (const { g, to } of chosen) {
      const detail = [to.finish_type, to.color_code].filter(Boolean).join(" / ");
      console.log(`    ${String(g.client_name).slice(0,20).padEnd(22)} ${String(g.label).padEnd(8)} ${String(g.color_name).slice(0,26).padEnd(28)} -> ${to.id}  ${detail}`);
    }
    console.log();
  }

  if (already.length) console.log(`  ${already.length} already point at a valid new id — skipped.\n`);

  if (remap.length) {
    console.log(`  MATCHED BY NAME — ${remap.length} will be remapped:\n`);
    for (const { g, to } of remap) {
      console.log(`    ${String(g.client_name).slice(0,20).padEnd(22)} ${String(g.label).padEnd(8)} ${String(g.color_name).slice(0,26).padEnd(28)} ${String(g.color_id ?? "(null)").padEnd(16)} -> ${to.id}`);
    }
    console.log();
  }

  if (ambiguous.length) {
    console.log(`  AMBIGUOUS — ${ambiguous.length} name(s) match more than one catalog row. Not guessed:\n`);
    for (const { g, candidates } of ambiguous) {
      console.log(`    ${String(g.client_name).slice(0,20).padEnd(22)} ${String(g.label).padEnd(8)} ${g.color_name}`);
      console.log(`      finish group id: ${g.id}`);
      for (const c of candidates) {
        const detail = [c.finish_type, c.color_code].filter(Boolean).join(" / ");
        console.log(`        ${c.id.padEnd(14)} ${detail}`);
      }
    }
    console.log(`\n    Same name, different panel — finish and code are what separate them, and`);
    console.log(`    that is a material difference, not a cosmetic one. Pick one per job in the`);
    console.log(`    spec's melamine picker, or pass --set=<finish group id>:<catalog id> here.\n`);
  }

  if (unmatched.length) {
    console.log(`  NOT MATCHED — ${unmatched.length} left untouched, for Karl to map by hand:\n`);
    for (const g of unmatched) {
      console.log(`    ${String(g.client_name).slice(0,20).padEnd(22)} ${String(g.label).padEnd(8)} ${String(g.color_name).slice(0,30).padEnd(32)} (${g.color_id ?? "null"})`);
      console.log(`      finish group id: ${g.id}   --set=${g.id}:<catalog id>`);
    }
    console.log(`\n    These keep their stored colour name, so their documents still print correctly.`);
    console.log(`    They will show an empty picker until someone re-selects the colour.\n`);
  }

  if (noName.length) console.log(`  ${noName.length} group(s) have no colour name at all — nothing to match on.\n`);

  if (DRY) {
    const left = unmatched.length + ambiguous.length + noName.length;
    console.log(`Dry run. ${chosen.length + remap.length} would change (${chosen.length} by hand, ${remap.length} by name), ${left} left alone (${ambiguous.length} ambiguous, ${unmatched.length} unmatched, ${noName.length} with no name).`);
    return;
  }
  const toWrite = [...chosen, ...remap];
  if (toWrite.length === 0) { console.log("Nothing to apply."); return; }

  let n = 0;
  for (const { g, to } of toWrite) {
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
