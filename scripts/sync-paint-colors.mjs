/**
 * scripts/sync-paint-colors.mjs
 * Reads paint_colors_sw.csv and paint_colors_bm.csv and upserts into paint_colors table.
 * Run after: node scripts/db-push.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

config({ path: resolve(ROOT, ".env.local") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const sql = postgres(DATABASE_URL, { ssl: "require", max: 1, prepare: false });

/**
 * Parse a simple CSV with quoted-field support.
 * Returns array of objects keyed by header row.
 */
function parseCSV(text) {
  const lines = text.split("\n");
  if (lines.length < 2) return [];

  function splitLine(line) {
    const fields = [];
    let field = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') { inQuote = false; }
        else { field += ch; }
      } else {
        if (ch === '"') { inQuote = true; }
        else if (ch === ',') { fields.push(field); field = ""; }
        else { field += ch; }
      }
    }
    fields.push(field);
    return fields;
  }

  const headers = splitLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = splitLine(line);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = vals[idx] ?? ""; });
    rows.push(obj);
  }
  return rows;
}

async function upsertBrand(brandRows, brand) {
  if (brandRows.length === 0) {
    console.log(`  No rows for ${brand} — skipping`);
    return 0;
  }

  let upserted = 0;
  // Batch in chunks of 200 to avoid parameter limits
  const CHUNK = 200;
  for (let i = 0; i < brandRows.length; i += CHUNK) {
    const chunk = brandRows.slice(i, i + CHUNK);
    for (const row of chunk) {
      const { name, code, hex } = row;
      if (!code && !name) continue;
      await sql`
        INSERT INTO paint_colors (brand, name, code, hex)
        VALUES (${brand}, ${name}, ${code}, ${hex || null})
        ON CONFLICT (brand, code) DO UPDATE
          SET name = EXCLUDED.name,
              hex  = EXCLUDED.hex
      `;
      upserted++;
    }
  }
  return upserted;
}

async function main() {
  const files = [
    { path: resolve(ROOT, "data/catalogs/paint_colors_sw.csv"), brand: "SW" },
    { path: resolve(ROOT, "data/catalogs/paint_colors_bm.csv"), brand: "BM" },
  ];

  for (const { path, brand } of files) {
    let text;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      console.warn(`  WARN: ${path} not found — skipping ${brand}. Run import-${brand.toLowerCase()}-colors.mjs first.`);
      continue;
    }

    const rows = parseCSV(text);
    console.log(`Upserting ${rows.length} ${brand} rows...`);
    const count = await upsertBrand(rows, brand);
    console.log(`  ✓ ${brand}: ${count} rows upserted`);
  }

  console.log("sync-paint-colors complete.");
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
