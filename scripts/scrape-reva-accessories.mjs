#!/usr/bin/env node
/**
 * scrape-reva-accessories.mjs
 * Scrapes Rev-A-Shelf product pages for prices and images.
 * Updates data/catalogs/accessories_reva.csv with:
 *   - price_slp  (lowest list price across all variants)
 *   - price_date (today's date)
 *   - image_url  (path to locally-downloaded image, e.g. /accessories/ACC-001.webp)
 * Downloads images to public/accessories/{id}.jpg
 *
 * Requirements: Node 18+, internet access
 * Usage:
 *   npx playwright install chromium  # first time only
 *   node scripts/scrape-reva-accessories.mjs
 *
 * Add --dry-run to print what would change without writing files.
 * Add --ids=ACC-001,ACC-022 to target specific items only.
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CSV_PATH = path.join(ROOT, "data/catalogs/accessories_reva.csv");
const IMG_DIR = path.join(ROOT, "public/accessories");
const DRY_RUN = process.argv.includes("--dry-run");
const ID_FILTER = process.argv
  .find((a) => a.startsWith("--ids="))
  ?.replace("--ids=", "")
  .split(",")
  .map((s) => s.trim());

// ── CSV parse (no deps) ───────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => {
    const vals = splitCSVLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

function splitCSVLine(line) {
  const result = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === "," && !inQ) {
      result.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

function serializeCSV(rows, headers) {
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return (
    headers.join(",") +
    "\n" +
    rows.map((r) => headers.map((h) => escape(r[h])).join(",")).join("\n")
  );
}

// ── Series → URL slug ─────────────────────────────────────────────────────────
// Confirmed pattern: https://rev-a-shelf.com/{slug}-series
// e.g. series "4WCSC/D" → slug "4wcsc"
//      series "5PD-Series" → slug "5pd"
//      series "432-BF" → slug "432-bf"
function seriesToSlug(series) {
  if (!series || series === "—" || series === "-") return null;
  return series
    .toLowerCase()
    .replace(/\/[a-z]$/i, "")       // strip /D, /S, etc.
    .replace(/-?series$/i, "")      // strip trailing "-series" or "Series"
    .replace(/\/$/, "")             // trailing slash
    .trim();
}

function seriesURL(series) {
  const slug = seriesToSlug(series);
  if (!slug) return null;
  return `https://rev-a-shelf.com/${slug}-series`;
}

// ── Image download ────────────────────────────────────────────────────────────
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    proto.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(dest); });
      file.on("error", reject);
    }).on("error", reject);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

  const csvText = fs.readFileSync(CSV_PATH, "utf8");
  const headers = csvText.split(/\r?\n/)[0].split(",");
  const rows = parseCSV(csvText);
  const today = new Date().toISOString().slice(0, 10);

  // Filter to target IDs if specified
  const targets = ID_FILTER
    ? rows.filter((r) => ID_FILTER.includes(r.id))
    : rows.filter((r) => r.series && r.series !== "—" && r.series !== "-");

  // Group by series to avoid duplicate page loads
  const bySeries = new Map();
  for (const row of targets) {
    const slug = seriesToSlug(row.series);
    if (!slug) continue;
    if (!bySeries.has(slug)) bySeries.set(slug, []);
    bySeries.get(slug).push(row);
  }

  console.log(`Scraping ${bySeries.size} unique series for ${targets.length} items...`);
  if (DRY_RUN) console.log("DRY RUN — no files will be written.");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  const results = new Map(); // slug → { minPrice, imgUrl }

  for (const [slug, seriesRows] of bySeries) {
    const url = `https://rev-a-shelf.com/${slug}-series`;
    console.log(`\n[${slug}] → ${url}`);

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      // Wait for JS to inject structured data
      await page.waitForTimeout(3000);

      // Extract JSON-LD structured data
      const ldJson = await page.evaluate(() => {
        const scripts = Array.from(
          document.querySelectorAll('script[type="application/ld+json"]')
        );
        for (const s of scripts) {
          try {
            const d = JSON.parse(s.textContent);
            const arr = Array.isArray(d) ? d : [d];
            const pg = arr.find(
              (x) => x["@type"] === "ProductGroup" || x["@type"] === "Product"
            );
            if (pg) return pg;
          } catch {}
        }
        return null;
      });

      if (!ldJson) {
        console.warn(`  ⚠ No JSON-LD found — page may have redirected or 404'd`);
        continue;
      }

      // Collect all prices from variants
      const variants = ldJson.hasVariant ?? (ldJson["@type"] === "Product" ? [ldJson] : []);
      const prices = variants
        .flatMap((v) => (v.offers ? [v.offers].flat() : []))
        .map((o) => parseFloat(o.price))
        .filter((p) => !isNaN(p) && p > 0);

      const minPrice = prices.length ? Math.min(...prices) : null;
      console.log(
        `  Variants: ${variants.length}, prices: ${prices.length}, min: ${minPrice ?? "n/a"}`
      );

      // Get main product image from DOM (more reliable than JSON-LD image field)
      const imgSrc = await page.evaluate(() => {
        const img = document.querySelector(
          "img.product-image-photo, .product-image-wrapper img, .gallery-image"
        );
        return img ? img.src : null;
      });

      results.set(slug, { minPrice, imgSrc });
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
    }
  }

  await browser.close();

  // Apply results back to rows
  let changeCount = 0;
  for (const row of rows) {
    const slug = seriesToSlug(row.series);
    if (!slug) continue;
    const result = results.get(slug);
    if (!result) continue;

    const { minPrice, imgSrc } = result;
    const rowIds = bySeries.get(slug)?.map((r) => r.id) ?? [];
    if (!rowIds.includes(row.id)) continue;

    let changed = false;

    // Price — only update if we got one and current is empty
    if (minPrice && !row.price_slp) {
      console.log(`  ${row.id}: price ${minPrice}`);
      row.price_slp = String(minPrice);
      row.price_date = today;
      changed = true;
    } else if (minPrice && row.price_slp && parseFloat(row.price_slp) !== minPrice) {
      // Update if price changed
      console.log(
        `  ${row.id}: price ${row.price_slp} → ${minPrice}`
      );
      row.price_slp = String(minPrice);
      row.price_date = today;
      changed = true;
    }

    // Image — download if we have a src and local file doesn't already exist
    if (imgSrc) {
      const ext = imgSrc.match(/\.(jpe?g|webp|png)/i)?.[1] ?? "jpg";
      const localPath = `/accessories/${row.id}.${ext}`;
      const destPath = path.join(IMG_DIR, `${row.id}.${ext}`);

      if (!fs.existsSync(destPath)) {
        if (!DRY_RUN) {
          try {
            await downloadFile(imgSrc, destPath);
            console.log(`  ${row.id}: image → ${localPath}`);
          } catch (e) {
            console.warn(`  ${row.id}: image download failed: ${e.message}`);
          }
        } else {
          console.log(`  ${row.id}: would download image → ${localPath}`);
        }
        row.image_url = localPath;
        changed = true;
      } else if (!row.image_url) {
        row.image_url = localPath;
        changed = true;
      }
    }

    if (changed) changeCount++;
  }

  console.log(`\n${changeCount} rows updated.`);

  if (!DRY_RUN && changeCount > 0) {
    fs.writeFileSync(CSV_PATH, serializeCSV(rows, headers));
    console.log(`CSV written: ${CSV_PATH}`);
    console.log(`Next: run "node scripts/sync-catalogs.mjs" to regenerate JSON.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
