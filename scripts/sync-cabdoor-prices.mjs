#!/usr/bin/env node
/**
 * sync-cabdoor-prices.mjs
 * Scrapes all CabDoor door style pricing from mycabdoor.com and writes
 * data/cabdoor_prices.json. Run quarterly when prices change.
 *
 * Usage:
 *   1. Log into mycabdoor.com in Chrome
 *   2. Open DevTools → Application → Cookies → copy the PHPSESSID value
 *   3. Run: CABDOOR_SESSION=<your_session_id> node scripts/sync-cabdoor-prices.mjs
 */
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const SESSION = process.env.CABDOOR_SESSION;
if (!SESSION) {
  console.error("Error: set CABDOOR_SESSION=<your PHPSESSID cookie value>");
  process.exit(1);
}

const BASE = "https://mycabdoor.com/online_catalog/catalog_includes/pricing_pop.php";
const HEADERS = { Cookie: `PHPSESSID=${SESSION}`, "User-Agent": "Mozilla/5.0" };

async function fetchStyle(style) {
  const res = await fetch(`${BASE}?style=${style}`, { headers: HEADERS });
  if (!res.ok) return null;
  const html = await res.text();
  if (html.length < 2000) return null; // empty/invalid style

  const rows = {};
  const re = /<td>([^<]+)<\/td>\s*<td[^>]*><span class="text-muted"[^>]*>([\d.]+)<\/span>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const species = m[1].trim();
    const price = parseFloat(m[2]);
    if (species !== "Species" && price > 0) rows[species] = price;
  }
  return Object.keys(rows).length > 0 ? rows : null;
}

// Probe range to find valid style numbers
async function findValidStyles(min, max) {
  const valid = [];
  for (let i = min; i <= max; i++) {
    const res = await fetch(`${BASE}?style=${i}`, { headers: HEADERS });
    const html = await res.text();
    if (html.length > 2000) valid.push(i);
    if (i % 100 === 0) process.stdout.write(`  probed ${i}/${max}\r`);
  }
  return valid;
}

console.log("Probing style numbers 1–1000...");
const validStyles = await findValidStyles(1, 1000);
console.log(`Found ${validStyles.length} valid styles: ${validStyles.join(", ")}`);

const catalog = {};
for (const style of validStyles) {
  const data = await fetchStyle(style);
  if (data) {
    catalog[style] = data;
    console.log(`  Style ${style}: ${Object.keys(data).length} species`);
  }
}

const outPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/cabdoor_prices.json"
);
writeFileSync(outPath, JSON.stringify(catalog, null, 2));
console.log(`\nWrote ${Object.keys(catalog).length} styles to data/cabdoor_prices.json`);
