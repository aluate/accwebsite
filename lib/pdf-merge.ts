import { PDFDocument } from "pdf-lib";
import fs from "fs";

/**
 * Merge a freshly-rendered spec PDF with the most-recent drawings PDF for
 * the job. Returns a Buffer containing the combined document.
 *
 * Spec pages come first (already numbered C/F/H/A/M/N), drawings pages
 * come second. We don't renumber drawings — they retain CV's original
 * page numbers (which is what shop techs already know).
 */
export async function mergePDFs(specBuffer: Buffer, drawingsBuffer: Buffer): Promise<Buffer> {
  const out = await PDFDocument.create();

  const spec = await PDFDocument.load(specBuffer);
  const specPages = await out.copyPages(spec, spec.getPageIndices());
  for (const p of specPages) out.addPage(p);

  const drawings = await PDFDocument.load(drawingsBuffer);
  const drawingPages = await out.copyPages(drawings, drawings.getPageIndices());
  for (const p of drawingPages) out.addPage(p);

  const bytes = await out.save();
  return Buffer.from(bytes);
}

/**
 * Convenience wrapper: read both PDFs from disk, merge, write to outputPath,
 * return the byte count written.
 */
export async function mergePDFsOnDisk(specPath: string, drawingsPath: string, outputPath: string): Promise<number> {
  const spec      = fs.readFileSync(specPath);
  const drawings  = fs.readFileSync(drawingsPath);
  const merged    = await mergePDFs(spec, drawings);
  fs.writeFileSync(outputPath, merged);
  return merged.length;
}
