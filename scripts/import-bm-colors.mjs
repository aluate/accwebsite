/**
 * scripts/import-bm-colors.mjs
 * Fetches BM colors from colornerd GitHub and writes data/catalogs/paint_colors_bm.csv
 * Uses Node built-in fetch (Node 18+).
 */
import { createWriteStream, mkdirSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_PATH = resolve(ROOT, "data/catalogs/paint_colors_bm.csv");

const URL = "https://raw.githubusercontent.com/jpederson/colornerd/master/colors/benjamin-moore.json";

function normalizeHex(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const clean = s.replace(/^#/, "").toLowerCase();
  return "#" + clean;
}

function esc(s) {
  const str = String(s ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function main() {
  mkdirSync(resolve(ROOT, "data/catalogs"), { recursive: true });

  console.log("Fetching BM colors from colornerd GitHub...");
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Expected JSON array");

  // Inspect shape of first object
  console.log(`\nTotal records: ${data.length}`);
  console.log("Shape of first object:", JSON.stringify(data[0], null, 2));

  // Detect field names from first record
  const first = data[0] ?? {};
  const keys = Object.keys(first);
  console.log("\nAll keys:", keys);

  // Common field name patterns from colornerd:
  //   name, number/code/id, hex/color
  const nameKey = keys.find((k) => k.toLowerCase().includes("name")) ?? "name";
  const codeKey =
    keys.find((k) => k.toLowerCase() === "number") ??
    keys.find((k) => k.toLowerCase() === "code") ??
    keys.find((k) => k.toLowerCase() === "id") ??
    keys.find((k) => k.toLowerCase().includes("num")) ??
    "number";
  const hexKey =
    keys.find((k) => k.toLowerCase() === "hex") ??
    keys.find((k) => k.toLowerCase().includes("hex")) ??
    keys.find((k) => k.toLowerCase().includes("color")) ??
    "hex";

  console.log(`\nUsing fields: name="${nameKey}", code="${codeKey}", hex="${hexKey}"`);

  const out = createWriteStream(OUT_PATH, "utf8");
  out.write("brand,name,code,hex\n");

  let count = 0;
  const seen = new Set();

  for (const item of data) {
    const name = String(item[nameKey] ?? "").trim();
    const code = String(item[codeKey] ?? "").trim();
    const hex  = normalizeHex(item[hexKey]);

    if (!name && !code) continue;

    const key = "BM|" + code + "|" + name;
    if (seen.has(key)) continue;
    seen.add(key);

    out.write(`BM,${esc(name)},${esc(code)},${esc(hex)}\n`);
    count++;
  }

  out.end();
  await new Promise((resolve, reject) => { out.on("finish", resolve); out.on("error", reject); });

  console.log(`\n✓ Wrote ${count} BM colors to ${OUT_PATH}`);

  // Spot-check first 5 rows
  const lines = readFileSync(OUT_PATH, "utf8").split("\n").slice(0, 6);
  console.log("\nFirst 5 rows (incl. header):");
  lines.forEach((l) => console.log(" ", l));
}

main().catch((e) => { console.error(e); process.exit(1); });
