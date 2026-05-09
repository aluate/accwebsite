/**
 * Converts all CSVs in data/catalogs/ to matching JSON files.
 * Run via: npm run sync-catalogs (also runs automatically as prebuild)
 *
 * CSV rules:
 *  - First row = headers
 *  - "true"/"false" strings become booleans
 *  - Empty cells (or em-dash) become null
 *  - Semicolon-delimited cells become arrays — UNLESS the column is a
 *    free-text field (notes, description, comment) where ";" is normal
 *    punctuation. See FREE_TEXT_COLUMN_PATTERNS below.
 *  - Cells in numeric-looking columns (suffix _in, _ft, _lf, _qty, _count,
 *    _price, _cost, _pct, _w, _h, _d, prefix min_/max_/qty_/price_) coerce
 *    to JS numbers when the value is purely numeric. Applied per-element
 *    after array splitting, so "2.5;3" -> [2.5, 3].
 *
 * History:
 *  - Original parser auto-arrayed any cell containing ";" which corrupted
 *    free-text notes fields. The free-text guard fixes that.
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CATALOGS_DIR = join(__dirname, "../data/catalogs");

// Free-text columns: ";" is punctuation, never a list separator.
const FREE_TEXT_COLUMN_PATTERNS = [
  /^notes?$/i,
  /^description$/i,
  /^comment(s)?$/i,
  /_notes?$/i,
  /_description$/i,
  /_comment(s)?$/i,
];

// Numeric columns: cells that parse cleanly as numbers should be JS numbers.
const NUMERIC_COLUMN_PATTERNS = [
  /_in$/i,
  /_ft$/i,
  /_lf$/i,
  /_qty$/i,
  /_count$/i,
  /_price$/i,
  /_cost$/i,
  /_pct$/i,
  /_(w|h|d)$/i,
  /^min_/i,
  /^max_/i,
  /^qty_/i,
  /^price_/i,
];

function isFreeText(columnName) {
  return FREE_TEXT_COLUMN_PATTERNS.some((re) => re.test(columnName));
}
function isNumericCol(columnName) {
  return NUMERIC_COLUMN_PATTERNS.some((re) => re.test(columnName));
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const headers = splitCSVRow(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const values = splitCSVRow(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = coerce(values[idx] ?? "", h);
    });
    rows.push(row);
  }
  return rows;
}

function splitCSVRow(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

function maybeNumber(s) {
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

function coerce(val, columnName) {
  if (val === "" || val === "—") return null;
  if (val === "true") return true;
  if (val === "false") return false;

  if (isFreeText(columnName)) return val;

  if (val.includes(";")) {
    const parts = val.split(";").map((v) => v.trim()).filter(Boolean);
    if (isNumericCol(columnName)) return parts.map(maybeNumber);
    return parts;
  }

  if (isNumericCol(columnName)) return maybeNumber(val);
  return val;
}

const csvFiles = readdirSync(CATALOGS_DIR).filter((f) => f.endsWith(".csv"));

for (const file of csvFiles) {
  const csvPath = join(CATALOGS_DIR, file);
  const jsonPath = join(CATALOGS_DIR, file.replace(".csv", ".json"));
  const text = readFileSync(csvPath, "utf-8");
  const data = parseCSV(text);
  writeFileSync(jsonPath, JSON.stringify(data, null, 2));
  console.log(`  ok ${file} -> ${basename(jsonPath)} (${data.length} rows)`);
}

console.log(`\nSynced ${csvFiles.length} catalog(s).`);
