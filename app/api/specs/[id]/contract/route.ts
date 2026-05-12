export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { renderSpecPDF } from "@/lib/pdf-spec";
import { loadSpecPDFData, SpecDataError } from "@/lib/spec-data";
import { sendEmail } from "@/lib/mailer";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "job-files";
const DISCLOSURE_PATH = "templates/residential-disclosure.pdf";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function downloadFile(storagePath: string): Promise<Buffer | null> {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).download(storagePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

async function downloadTemplate(storagePath: string): Promise<Buffer | null> {
  // Templates live in the root of the job-files bucket, not under jobs/
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).download(storagePath);
  if (error || !data) {
    console.warn(`[contract] Template not found at ${storagePath}: ${error?.message}`);
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}

// POST /api/specs/[id]/contract
//
// Body: { includeDisclosure?: boolean }
//
// Merges: spec PDF → quote (02_quote, if uploaded) → drawings (05_drawings, if uploaded)
//         → disclosure (templates/residential-disclosure.pdf, if includeDisclosure=true)
//
// Saves to 15_contract, emails PM with attachment, returns { file_id, download_url }.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: specId } = await params;
  const body = await req.json().catch(() => ({}));
  const includeDisclosure: boolean = body.includeDisclosure === true;

  let data;
  try {
    data = await loadSpecPDFData(specId);
  } catch (e) {
    if (e instanceof SpecDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const jobId = data.job_id;

  // 1. Fresh spec render
  const specBuf = await renderSpecPDF(data);

  // 2. Latest quote — optional
  const [quoteRow] = await sql<{ storage_path: string; filename: string }[]>`
    SELECT storage_path, filename FROM job_files
    WHERE job_id = ${jobId} AND kind = '02_quote'
    ORDER BY uploaded_at DESC LIMIT 1
  `;
  const quoteBuf = quoteRow ? await downloadFile(quoteRow.storage_path) : null;

  // 3. Latest drawings — optional
  const [drawingRow] = await sql<{ storage_path: string; filename: string }[]>`
    SELECT storage_path, filename FROM job_files
    WHERE job_id = ${jobId} AND kind = '05_drawings'
    ORDER BY uploaded_at DESC LIMIT 1
  `;
  const drawingsBuf = drawingRow ? await downloadFile(drawingRow.storage_path) : null;

  // 4. Residential disclosure — only if requested
  const disclosureBuf = includeDisclosure ? await downloadTemplate(DISCLOSURE_PATH) : null;
  const disclosureAttached = disclosureBuf !== null;

  if (includeDisclosure && !disclosureBuf) {
    console.warn("[contract] Disclosure requested but not found at templates/residential-disclosure.pdf — continuing without it.");
  }

  // 5. Merge: spec → quote → drawings → disclosure
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();

  async function appendBuf(buf: Buffer) {
    const src = await PDFDocument.load(buf);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  }

  await appendBuf(specBuf);
  if (quoteBuf)      await appendBuf(quoteBuf);
  if (drawingsBuf)   await appendBuf(drawingsBuf);
  if (disclosureBuf) await appendBuf(disclosureBuf);

  const merged = Buffer.from(await out.save());

  // 6. Save to 15_contract
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `contract-${ts}.pdf`;
  const storagePath = `jobs/${jobId}/15_contract/${filename}`;

  const { error: upErr } = await supabaseAdmin().storage
    .from(BUCKET)
    .upload(storagePath, merged, { contentType: "application/pdf", upsert: false });

  if (upErr) {
    return NextResponse.json({ error: "Failed to save contract: " + upErr.message }, { status: 500 });
  }

  const fileId = uid();
  await sql`
    INSERT INTO job_files (id, job_id, kind, filename, storage_path, size, uploaded_at)
    VALUES (${fileId}, ${jobId}, '15_contract', ${filename}, ${storagePath}, ${merged.length}, ${new Date().toISOString()})
  `;

  // 7. Email PM
  const [job] = await sql<{ client_name: string; pm: string | null }[]>`
    SELECT client_name, pm FROM jobs WHERE id = ${jobId}
  `;
  const pmEmail = process.env.PM_EMAIL ?? "residential@advancedcabinets.net";

  const components = [
    "Spec",
    quoteRow        ? "Quote"       : null,
    drawingRow      ? "Drawings"    : null,
    disclosureAttached ? "Disclosure" : null,
  ].filter(Boolean).join(" + ");

  const disclosureNote = includeDisclosure && !disclosureAttached
    ? "\n\nNote: Disclosure was requested but the PDF was not found at templates/residential-disclosure.pdf in Supabase Storage. Upload it there to include it automatically."
    : "";

  await sendEmail({
    to: pmEmail,
    subject: `${jobId} — ${job?.client_name ?? "Unknown"} — Contract Ready`,
    text: [
      `Contract PDF ready for ${job?.client_name ?? jobId}.`,
      `Included: ${components}`,
      ``,
      `Job ID: ${jobId}`,
      ``,
      `Print for wet signature, or send via Adobe Sign / DocuSign.`,
    ].join("\n") + disclosureNote,
    attachments: [{ filename, content: merged }],
  });

  return NextResponse.json({
    ok: true,
    file_id: fileId,
    download_url: `/api/jobs/${jobId}/files?file_id=${fileId}`,
    components,
    pages: out.getPageCount(),
    disclosure_attached: disclosureAttached,
    disclosure_warning: includeDisclosure && !disclosureAttached
      ? "Disclosure PDF not found at templates/residential-disclosure.pdf — not included."
      : null,
  });
}
