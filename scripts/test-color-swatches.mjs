#!/usr/bin/env node
/**
 * test-color-swatches.mjs — a finish group's colour reaches the documents.
 *
 * WHY THIS EXISTS.
 *
 * Karl, 2026-09-24: "I noticed that my colors weren't printing for paint to my
 * spec sheets… I can see the image on the spec builder, it does not appear in
 * the header or other sections it's supposed to."
 *
 * lib/spec-data.ts built its swatch index from the melamine catalog alone, so
 * color_image was permanently "" for paint and stain. The comment in pdf-spec
 * even said so — "Empty for paint and stain, which have no photograph" — which
 * was true about photographs and wrong about colour: paint_colors_sw.json and
 * paint_colors_bm.json have carried a hex for every brand colour all along, and
 * nothing read them. They were listed in CATALOG_NAMES with no accessor.
 *
 * Stain genuinely has no image yet. It now has the column and the indexing, so
 * the day a photograph lands in public/ and a path lands in colors_stain.csv it
 * prints, with no code change. That is the part this file has to keep honest:
 * an architecture nobody can verify is a promise, not a feature.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./strip-source.mjs";
import { getCatalogs } from "../lib/catalogs.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => stripComments(readFileSync(join(ROOT, p), "utf8"));

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

const HEX = /^#[0-9a-f]{6}$/i;

async function main() {
  const catalogs = await getCatalogs();

  console.log("\n1. paint carries a hex, and it is reachable\n");
  const sw = catalogs.paintSwatchesSW();
  const bm = catalogs.paintSwatchesBM();
  const ml = catalogs.paintColors();
  check("the Sherwin deck is readable", sw.length > 1000, `got ${sw.length} rows`);
  check("the Benjamin Moore deck is readable", bm.length > 1000, `got ${bm.length} rows`);

  /* The same index lib/spec-data.ts builds, built the same way. */
  const idx = new Map();
  const add = (code, hex) => {
    if (!code || !hex) return;
    const h = String(hex).trim();
    if (!HEX.test(h)) return;
    if (!idx.has(code)) idx.set(code, h);
  };
  for (const c of sw) add(c.code, c.hex);
  for (const c of bm) add(c.code, c.hex);
  for (const c of ml) add(c.code, c.hex_approx);

  check("a useful number of paint codes resolve to a hex", idx.size > 1000, `${idx.size} codes`);
  console.log(`       (${idx.size} paint codes carry a printable hex from the committed decks)`);

  /*
    THE BENJAMIN MOORE HOLE, PINNED SO IT CANNOT BE FORGOTTEN.

    Every row in paint_colors_bm.json has code: null — 2,175 hexes, zero codes.
    A file-only index therefore covers Sherwin and silently misses BM, which is
    the same symptom as the bug being fixed, on half the paint jobs. That is why
    lib/spec-data.ts queries the paint_colors TABLE first and treats these decks
    as a fallback.

    If someone backfills codes into the BM deck, this assertion flips and should
    be deleted — the fallback would then cover BM offline too, which is what the
    desktop spec generator will need.
  */
  const bmWithCode = bm.filter((c) => c.code).length;
  check("the BM deck still has no codes — the table is doing that work",
        bmWithCode === 0,
        `${bmWithCode} BM rows now carry a code; if that is deliberate, this check has served its purpose`);
  check("the SW deck does carry codes", sw.filter((c) => c.code).length === sw.length);

  const specData0 = read("lib/spec-data.ts");
  check("paint hex is looked up in the same place the code came from",
        /FROM paint_colors WHERE code = ANY/.test(specData0),
        "the picker stores the table's codes, so the table is the only complete source");
  check("a failed swatch lookup cannot break the document",
        /FROM paint_colors WHERE code = ANY[\s\S]{0,120}catch\(\(\) => \[\]\)/.test(specData0),
        "a sheet without a swatch beats a sheet that will not render");

  /*
    Keyed by CODE on purpose: PaintColorTypeAhead stores c.code in color_id,
    while melamine and stain store a catalog row id. If the picker ever changes
    what it stores, this lookup silently returns nothing and the swatch quietly
    disappears again — so the key space is asserted, not assumed.
  */
  const picker = read("components/ResidentialSpecClient.tsx");
  check("the paint picker still stores the code in color_id",
        /onChange\(c\.code,/.test(picker),
        "if this stores an id instead, the hex index keyed by code stops matching");

  const sample = sw.find((c) => c.code && HEX.test(String(c.hex ?? "")));
  check("a real Sherwin code resolves", !!sample && idx.get(sample.code) === sample.hex.trim(),
        sample ? `${sample.code} -> ${idx.get(sample.code)}` : "no sample row found");

  console.log("\n2. a half-filled cell never prints a chip\n");
  check("an empty hex is skipped", (add("TEST-EMPTY", ""), !idx.has("TEST-EMPTY")));
  check("a non-hex string is skipped", (add("TEST-JUNK", "greenish"), !idx.has("TEST-JUNK")));
  check("a 3-digit shorthand is skipped", (add("TEST-SHORT", "#abc"), !idx.has("TEST-SHORT")),
        "@react-pdf would render it, but half the decks would disagree about what it means");
  check("a good hex is kept", (add("TEST-GOOD", "#1A2b3C"), idx.get("TEST-GOOD") === "#1A2b3C"));

  console.log("\n3. stain has the architecture, and no data yet\n");
  const stain = catalogs.stainColors();
  check("every stain row has the image_url column",
        stain.length > 0 && stain.every((s) => "image_url" in s),
        "the column is the whole point — without it there is nowhere to put a path");
  check("no stain image is populated yet",
        stain.every((s) => !s.image_url),
        "not a failure if this flips — it means photographs arrived, and they should now print");
  console.log(`       (${stain.length} stain rows, ${stain.filter((s) => s.image_url).length} with an image)`);

  console.log("\n4. the documents draw what they are given\n");
  const specData = read("lib/spec-data.ts");
  check("stain is indexed for images alongside melamine",
        /indexImages\(\s*catalogs\.stainColors\(\)\s*\)/.test(specData));
  check("melamine is still indexed",
        /indexImages\(\s*catalogs\.melamineColors\(\)\s*\)/.test(specData));
  check("the view carries a hex", /color_hex:\s*colorHex/.test(specData));
  check("an image beats a hex, never both",
        /!colorImage\s*&&\s*g\.color_id/.test(specData),
        "a melamine photograph must not be replaced by a colour chip");

  const pdf = read("lib/pdf-spec.tsx");
  const swatchSites = (pdf.match(/fg\.color_hex/g) ?? []).length;
  check("both swatch sites fall back to the hex", swatchSites >= 2,
        `found ${swatchSites} — the client sheet's cell and the work-order header`);
  check("the hex is drawn as a filled View, not an Image",
        /backgroundColor:\s*fg\.color_hex/.test(pdf),
        "@react-pdf's Image needs a file; a hex is a fill");

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
