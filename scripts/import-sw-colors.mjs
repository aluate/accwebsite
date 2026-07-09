/**
 * scripts/import-sw-colors.mjs
 * Reads SW ColorSnap XLSX and writes data/catalogs/paint_colors_sw.csv
 * Uses exceljs (already in package.json).
 *
 * XLSX layout (from file header rows):
 *   Row 1: blank
 *   Row 2: headers — COLOR #, COLOR NAME, LOCATOR #, RED, GREEN, BLUE, HEX, COLOR
 *   Row 3+: data
 */
import ExcelJS from "exceljs";
import { createWriteStream } from "fs";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const XLSX_PATH = resolve(ROOT, "EXAMPLE DRAWINGS/Copy of SW-ColorSnap-Color-Swatches-for-SW-Site-locator-031319.xlsx");
const OUT_PATH  = resolve(ROOT, "data/catalogs/paint_colors_sw.csv");

// Normalize hex: ensure lowercase with # prefix
function normalizeHex(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const clean = s.replace(/^#/, "").toLowerCase();
  return "#" + clean;
}

async function main() {
  mkdirSync(resolve(ROOT, "data/catalogs"), { recursive: true });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);

  const ws = wb.worksheets[0];
  if (!ws) throw new Error("No worksheet found in workbook");

  // Find header row (row with "COLOR #" in column A or scan first 5 rows)
  let headerRow = null;
  let headerRowNum = 0;
  ws.eachRow((row, rowNum) => {
    if (headerRow) return;
    const a = String(row.getCell(1).value ?? "").trim();
    if (a.toUpperCase() === "COLOR #" || a.toUpperCase() === "COLOR#") {
      headerRow = row;
      headerRowNum = rowNum;
    }
  });

  if (!headerRow) {
    // Fall back: row 2 is headers per spec
    headerRow = ws.getRow(2);
    headerRowNum = 2;
  }

  // Map header names to column indices
  const colMap = {};
  headerRow.eachCell((cell, colNum) => {
    const name = String(cell.value ?? "").trim().toUpperCase();
    colMap[name] = colNum;
  });

  console.log("Header columns found:", colMap);

  const colorNumCol = colMap["COLOR #"] ?? colMap["COLOR#"] ?? colMap["COLOR"];
  const nameCol     = colMap["COLOR NAME"] ?? colMap["NAME"];
  const hexCol      = colMap["HEX"];

  if (!colorNumCol || !nameCol || !hexCol) {
    throw new Error(`Could not find required columns. Found: ${JSON.stringify(colMap)}`);
  }

  const out = createWriteStream(OUT_PATH, "utf8");
  out.write("brand,name,code,hex\n");

  let count = 0;
  const seen = new Set();

  ws.eachRow((row, rowNum) => {
    if (rowNum <= headerRowNum) return; // skip header and above

    const code = String(row.getCell(colorNumCol).value ?? "").trim();
    const name = String(row.getCell(nameCol).value ?? "").trim();
    const hexRaw = String(row.getCell(hexCol).value ?? "").trim();

    if (!code || !name) return; // skip blank rows

    const hex = normalizeHex(hexRaw);
    const key = code + "|" + name;
    if (seen.has(key)) return;
    seen.add(key);

    // CSV-escape: wrap fields containing commas/quotes in double quotes
    function esc(s) {
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }

    out.write(`SW,${esc(name)},${esc(code)},${esc(hex)}\n`);
    count++;
  });

  out.end();
  await new Promise((resolve, reject) => { out.on("finish", resolve); out.on("error", reject); });

  console.log(`✓ Wrote ${count} SW colors to ${OUT_PATH}`);

  // Spot-check first 5 rows
  const { readFileSync } = await import("fs");
  const lines = readFileSync(OUT_PATH, "utf8").split("\n").slice(0, 6);
  console.log("\nFirst 5 rows (incl. header):");
  lines.forEach((l) => console.log(" ", l));
}

main().catch((e) => { console.error(e); process.exit(1); });
