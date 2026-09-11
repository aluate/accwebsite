#!/usr/bin/env node
/**
 * make-test-fixtures.mjs — the files a test needs to upload.
 *
 * WHY. Half of what this app does only happens once a file exists: the release
 * to engineering refuses to send without a drawing attached, the contract packet
 * merges the newest drawing behind the spec, the client signoff shows the packet
 * page by page, punch items carry photos, and an accessory is meant to show a
 * picture of the thing the client is signing off on. A test that cannot upload
 * cannot reach any of it.
 *
 * These are generated rather than committed as binaries so they can be rebuilt
 * anywhere, and so a patch carries a script instead of a blob. They are
 * deliberately unmistakable: every page says ACC TEST DRAWING in large type, so
 * one of these can never be confused with a real plan set if it ends up attached
 * to something.
 *
 *   node scripts/make-test-fixtures.mjs [outputDir]
 *
 * Default output: test-fixtures/
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * sharp rasterises the photo. It arrives with Next rather than being declared
 * here, and its native binding is the first thing a pruned install loses, so a
 * missing one leaves the SVG on disk and says the one command that fixes it
 * instead of ending in a stack trace. The PDF, which matters more, needs
 * nothing but pdf-lib.
 */
let sharp = null;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  sharp = null;
}

const outDir = resolve(process.argv[2] || "test-fixtures");
mkdirSync(outDir, { recursive: true });

/* ───────────────────────── the drawing set ───────────────────────── */

const PAGES = [
  { code: "A1.0", title: "FLOOR PLAN — KITCHEN" },
  { code: "A2.0", title: "ELEVATIONS — PERIMETER" },
  { code: "A2.1", title: "ELEVATIONS — ISLAND" },
  { code: "A3.0", title: "SECTIONS & DETAILS" },
];

async function drawingSet() {
  const pdf = await PDFDocument.create();
  pdf.setTitle("ACC TEST DRAWING SET — not a real plan");
  pdf.setAuthor("ACC test fixtures");
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const plain = await pdf.embedFont(StandardFonts.Helvetica);

  const W = 1224, H = 792; // 17x11 at 72dpi — the size a plan set actually is
  const ink = rgb(0.1, 0.1, 0.12);
  const faint = rgb(0.75, 0.75, 0.78);

  PAGES.forEach((meta, i) => {
    const page = pdf.addPage([W, H]);

    // Border and title block, so it reads as a sheet at a glance.
    page.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, borderColor: ink, borderWidth: 1.5 });
    const tbX = W - 318, tbY = 30, tbW = 288, tbH = 132;
    page.drawRectangle({ x: tbX, y: tbY, width: tbW, height: tbH, borderColor: ink, borderWidth: 1 });
    page.drawText("ADVANCED CUSTOM CABINETS", { x: tbX + 12, y: tbY + tbH - 26, size: 12, font: bold, color: ink });
    page.drawText("TEST FIXTURE — NOT A REAL PLAN", { x: tbX + 12, y: tbY + tbH - 44, size: 8, font: plain, color: ink });
    page.drawText(meta.title, { x: tbX + 12, y: tbY + 46, size: 10, font: bold, color: ink });
    page.drawText(`SHEET ${meta.code}`, { x: tbX + 12, y: tbY + 28, size: 9, font: plain, color: ink });
    page.drawText(`${i + 1} of ${PAGES.length}`, { x: tbX + tbW - 60, y: tbY + 28, size: 9, font: plain, color: ink });

    // A grid, so the page is visibly a drawing rather than a blank sheet.
    for (let x = 60; x < W - 340; x += 48) {
      page.drawLine({ start: { x, y: 190 }, end: { x, y: H - 60 }, thickness: 0.4, color: faint });
    }
    for (let y = 190; y < H - 60; y += 48) {
      page.drawLine({ start: { x: 60, y }, end: { x: W - 340, y }, thickness: 0.4, color: faint });
    }

    // A run of boxes that reads as a cabinet elevation.
    let x = 84;
    for (const w of [110, 86, 86, 140, 96, 110, 130]) {
      page.drawRectangle({ x, y: 250, width: w, height: 180, borderColor: ink, borderWidth: 1.2 });
      page.drawLine({ start: { x: x + w / 2, y: 250 }, end: { x: x + w / 2, y: 430 }, thickness: 0.8, color: ink });
      x += w + 8;
      if (x > W - 400) break;
    }
    page.drawRectangle({ x: 84, y: 214, width: x - 92, height: 30, borderColor: ink, borderWidth: 1.2 });
    page.drawText("BASE RUN — 3/4 PREFINISHED MAPLE", { x: 88, y: 196, size: 8, font: plain, color: ink });

    // Unmistakable on any page, at any zoom.
    page.drawText("ACC TEST DRAWING", {
      x: 80, y: H - 120, size: 42, font: bold, color: rgb(0.82, 0.86, 0.92),
    });
    page.drawText(meta.title, { x: 84, y: H - 160, size: 16, font: bold, color: ink });
  });

  const bytes = await pdf.save();
  const file = join(outDir, "ACC-test-drawings.pdf");
  writeFileSync(file, bytes);
  return { file, pages: PAGES.length, bytes: bytes.length };
}

/* ─────────────────────── the accessory photo ─────────────────────── */

/**
 * A plausible product photo: a pull-out base organizer, shot on a light
 * background. Drawn as SVG and rasterised, so it is a real JPEG with real
 * dimensions rather than a coloured square, and still obviously a fixture.
 */
async function accessoryPhoto() {
  const w = 1200, h = 900;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f4f2ee"/><stop offset="100%" stop-color="#ddd8d0"/>
    </linearGradient>
    <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#c8a271"/><stop offset="55%" stop-color="#b08a5c"/>
      <stop offset="100%" stop-color="#9a744a"/>
    </linearGradient>
    <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e9ecef"/><stop offset="100%" stop-color="#a9b0b8"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <ellipse cx="600" cy="800" rx="380" ry="46" fill="#000" opacity="0.10"/>

  <!-- cabinet box, opened -->
  <path d="M210 250 L820 250 L880 300 L880 760 L270 760 L210 700 Z" fill="#efe9e0" stroke="#8d8276" stroke-width="4"/>
  <path d="M210 250 L270 300 L270 760 L210 700 Z" fill="#e2dad0" stroke="#8d8276" stroke-width="4"/>
  <path d="M270 300 L880 300" stroke="#8d8276" stroke-width="4" fill="none"/>

  <!-- pull-out tray on slides -->
  <rect x="330" y="430" width="470" height="230" rx="10" fill="url(#wood)" stroke="#7d5f3c" stroke-width="5"/>
  <rect x="360" y="460" width="180" height="170" rx="6" fill="#a87f52" stroke="#7d5f3c" stroke-width="4"/>
  <rect x="560" y="460" width="210" height="170" rx="6" fill="#a87f52" stroke="#7d5f3c" stroke-width="4"/>
  <rect x="320" y="655" width="490" height="22" rx="8" fill="url(#steel)" stroke="#7e868f" stroke-width="3"/>
  <rect x="320" y="412" width="490" height="20" rx="8" fill="url(#steel)" stroke="#7e868f" stroke-width="3"/>

  <!-- chrome handle -->
  <rect x="520" y="386" width="120" height="16" rx="8" fill="url(#steel)" stroke="#6f767d" stroke-width="3"/>

  <text x="60" y="96" font-family="Helvetica,Arial,sans-serif" font-size="46" font-weight="bold" fill="#2b2b2f">
    ACC TEST ACCESSORY
  </text>
  <text x="60" y="142" font-family="Helvetica,Arial,sans-serif" font-size="26" fill="#55555c">
    Base pull-out organizer — fixture image, not a catalog photo
  </text>
</svg>`;

  if (!sharp) {
    const svgFile = join(outDir, "accessory-pullout.svg");
    writeFileSync(svgFile, svg, "utf8");
    return { file: svgFile, bytes: Buffer.byteLength(svg), width: w, height: h, degraded: true };
  }

  const file = join(outDir, "accessory-pullout.jpg");
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 86 }).toBuffer();
  writeFileSync(file, buf);
  const meta = await sharp(buf).metadata();
  return { file, bytes: buf.length, width: meta.width, height: meta.height };
}

/* ──────────────────────────── run ────────────────────────────────── */

const pdf = await drawingSet();
const img = await accessoryPhoto();

console.log(`\nfixtures written to ${outDir}\n`);
console.log(`  ${pdf.file}`);
console.log(`     ${pdf.pages} pages, ${(pdf.bytes / 1024).toFixed(0)} KB`);
console.log(`  ${img.file}`);
console.log(`     ${img.width}x${img.height}, ${(img.bytes / 1024).toFixed(0)} KB`);
if (img.degraded) {
  console.log("     (SVG, not a photo — sharp could not load.");
  console.log("      For a real JPEG: npm install --include=optional sharp)");
}
console.log("");
