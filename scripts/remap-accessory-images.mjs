#!/usr/bin/env node
/**
 * remap-accessory-images.mjs — point each accessory at a photo that exists.
 *
 * Reports by default. Writes nothing unless you name a pairing.
 *
 * WHAT IS WRONG. accessories_catalog holds Karl's 25 accessories with the right ids,
 * names, categories, sizes and finishes. Every one of them has an image_url like
 * `/accessories/ACC-001.webp`, and NOT ONE of those files exists. What exists is 22
 * JPEGs under a completely different numbering:
 *
 *     in the database   ACC-001 … ACC-034   .webp
 *     on disk           ACC-101 … ACC-505   .jpg
 *
 * So every accessory image on the spec page is a broken link. Karl: "it looked like it
 * was using the old info, not the new stuff I built with certain sizes and images."
 * The data IS the new stuff. The pictures are what is missing.
 *
 * WHY THIS SCRIPT DOES NOT GUESS. There is no mapping to derive. 22 files against 25
 * rows, and the file numbering is five blocks (1xx…5xx) of 4, 5, 3, 5 and 5 while the
 * catalog has nine categories of 4, 4, 3, 5, 2, 2, 3, 1 and 1. No ordering of those
 * categories reproduces those blocks. Anything automatic here is a coin toss, and the
 * cost of losing it is a photograph of a trash pull-out beside a lazy susan on a
 * document a client signs.
 *
 * So it lists both sides and takes explicit pairs. Only a person who has seen the
 * photographs can do this, and it is 22 decisions once.
 *
 *   node scripts/remap-accessory-images.mjs
 *       report only — both lists, what matches, what is broken
 *
 *   node scripts/remap-accessory-images.mjs --set=ACC-001:ACC-101 --set=ACC-002:ACC-102
 *       ACC-001 uses ACC-101.jpg, ACC-002 uses ACC-102.jpg. Repeat as needed.
 *       Both ends are checked: the accessory must exist, and so must the file.
 *
 *   node scripts/remap-accessory-images.mjs --clear=ACC-017
 *       this one has no photograph — blank the image_url so the UI stops trying.
 *       An accessory with no picture is fine; a broken picture is not.
 *
 *   node scripts/remap-accessory-images.mjs --exact
 *       the one safe automatic case: where a file already matches the accessory's own
 *       id (ACC-034 -> ACC-034.jpg), fix just the extension. Reports and does nothing
 *       if no id matches, which is the situation today.
 */
import postgres from "postgres";
import { readdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const IMG_DIR = resolve(__dirname, "../public/accessories");
const DRY = process.argv.includes("--dry-run");
const EXACT = process.argv.includes("--exact");
const argValues = (flag) =>
  process.argv.filter((a) => a.startsWith(`${flag}=`)).map((a) => a.slice(flag.length + 1));
const SETS = argValues("--set");
const CLEARS = argValues("--clear");

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
const sql = postgres(url, { ssl: isLocal ? false : "require", max: 1, prepare: false });

/** Files actually present, by bare name (no extension). */
function filesOnDisk() {
  if (!existsSync(IMG_DIR)) return new Map();
  const m = new Map();
  for (const f of readdirSync(IMG_DIR)) {
    if (!/\.(jpg|jpeg|png|webp)$/i.test(f)) continue;
    m.set(f.replace(/\.[^.]+$/, ""), f);
  }
  return m;
}

async function main() {
  const files = filesOnDisk();
  const rows = await sql`
    SELECT id, name, category, image_url FROM accessories_catalog ORDER BY category, id
  `;

  console.log(`\n${rows.length} accessories in the catalog, ${files.size} image file(s) in public/accessories.\n`);

  const broken = rows.filter((r) => {
    if (!r.image_url) return false;
    const bare = String(r.image_url).replace(/^.*\//, "").replace(/\.[^.]+$/, "");
    return !files.has(bare);
  });
  const ok = rows.filter((r) => {
    if (!r.image_url) return false;
    const bare = String(r.image_url).replace(/^.*\//, "").replace(/\.[^.]+$/, "");
    return files.has(bare);
  });
  const none = rows.filter((r) => !r.image_url);

  console.log(`  ${ok.length} point at a file that exists`);
  console.log(`  ${broken.length} point at a file that does NOT exist  <- every one is a broken image`);
  console.log(`  ${none.length} have no image at all\n`);

  if (broken.length) {
    console.log(`  BROKEN:\n`);
    for (const r of broken) {
      console.log(`    ${r.id.padEnd(9)} ${String(r.category).padEnd(17)} ${r.image_url}`);
      console.log(`    ${" ".repeat(9)} ${r.name}`);
    }
    console.log();
  }

  const used = new Set(rows.map((r) => String(r.image_url ?? "").replace(/^.*\//, "")).filter(Boolean));
  const unused = [...files.values()].filter((f) => !used.has(f));
  if (unused.length) {
    console.log(`  ${unused.length} FILE(S) NO ACCESSORY USES:\n`);
    for (const f of unused) console.log(`    ${f}`);
    console.log();
  }

  // ── validate what was asked for, before writing anything ──────────────────
  const byId = new Map(rows.map((r) => [r.id, r]));
  const pairs = [];
  for (const s of SETS) {
    const [accId, fileBase] = s.split(":");
    if (!accId || !fileBase) {
      console.error(`  --set needs ACC-ID:FILEBASE, got ${JSON.stringify(s)}`); process.exit(1);
    }
    if (!byId.has(accId)) {
      console.error(`  No accessory with id ${accId}. Ids are listed above.`); process.exit(1);
    }
    const file = files.get(fileBase.replace(/\.[^.]+$/, ""));
    if (!file) {
      console.error(`  No image file named ${fileBase} in public/accessories.`); process.exit(1);
    }
    pairs.push({ id: accId, file });
  }
  for (const c of CLEARS) {
    if (!byId.has(c)) { console.error(`  No accessory with id ${c}.`); process.exit(1); }
  }
  const both = SETS.map((s) => s.split(":")[0]).filter((id) => CLEARS.includes(id));
  if (both.length) {
    console.error(`  ${both[0]} was given to both --set and --clear. Nothing was written.`); process.exit(1);
  }

  // The one safe automatic case: a file whose bare name IS the accessory's id.
  if (EXACT) {
    for (const r of rows) {
      const f = files.get(r.id);
      if (!f) continue;
      const want = `/accessories/${f}`;
      if (r.image_url === want) continue;
      if (pairs.some((p) => p.id === r.id)) continue;
      pairs.push({ id: r.id, file: f });
    }
    if (pairs.length === 0) {
      console.log(`  --exact: no file is named after the accessory it belongs to, so there is\n` +
                  `  nothing safe to do automatically. The numbering on disk (ACC-1xx…ACC-5xx)\n` +
                  `  and the ids in the catalog (ACC-001…ACC-034) are different schemes.\n`);
    }
  }

  if (pairs.length === 0 && CLEARS.length === 0) {
    console.log(`  Nothing named, so nothing written.\n`);
    console.log(`  Pair them up by eye — you are the only one who can:`);
    console.log(`    --set=ACC-001:ACC-101      this accessory uses this photo`);
    console.log(`    --clear=ACC-017            this one has no photo; stop trying to show one\n`);
    return;
  }

  if (DRY) {
    for (const p of pairs)  console.log(`  would set   ${p.id} -> /accessories/${p.file}`);
    for (const c of CLEARS) console.log(`  would clear ${c}`);
    console.log(`\n  Dry run — nothing written.\n`);
    return;
  }

  for (const p of pairs) {
    await sql`UPDATE accessories_catalog SET image_url = ${`/accessories/${p.file}`}, updated_at = NOW() WHERE id = ${p.id}`;
    console.log(`  set   ${p.id} -> /accessories/${p.file}`);
  }
  for (const c of CLEARS) {
    await sql`UPDATE accessories_catalog SET image_url = NULL, updated_at = NOW() WHERE id = ${c}`;
    console.log(`  clear ${c}`);
  }

  const after = await sql`SELECT COUNT(*)::int AS n FROM accessories_catalog`;
  console.log(`\n  ${after[0].n} accessories still in the catalog (unchanged count).`);
  console.log(`  Re-run with no flags to see what is still broken.\n`);
}

main()
  .catch((e) => { console.error("\nFailed:", e.message ?? e); process.exit(1); })
  .finally(() => sql.end({ timeout: 5 }));
