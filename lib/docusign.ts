/**
 * DocuSign envelope builder + (eventually) sender.
 *
 * NOTE (Vercel migration): Local filesystem reads removed. Drawings come from
 * Supabase Storage via the job_files table. Disclosure PDF is stored as a
 * Supabase Storage object at "templates/residential-disclosure.pdf".
 */

import { sql } from "@/lib/db";
import { renderSpecPDF } from "@/lib/pdf-spec";
import { loadSpecPDFData, SpecDataError } from "@/lib/spec-data";
import { createClient } from "@supabase/supabase-js";

// Lazy-init: avoid module-level throw when env vars are missing at build time.
let _supabaseAdmin: ReturnType<typeof createClient> | null = null;
function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _supabaseAdmin;
}

const DISCLOSURE_STORAGE_PATH = "templates/residential-disclosure.pdf";
const STORAGE_BUCKET = "job-files";

function isResidentialJob(builder_company: string | null | undefined): boolean {
  return !builder_company || builder_company.trim() === "";
}

export type EnvelopeBuildResult = {
  buffer: Buffer;
  bytes: number;
  components: { spec: number; drawings: number; disclosure: number };
  drawing_filename: string | null;
  disclosure_attached: boolean;
};

export async function buildEnvelopePDF(specId: string): Promise<EnvelopeBuildResult> {
  const data = await loadSpecPDFData(specId);

  // 1. Spec PDF (fresh render).
  const specBuf = await renderSpecPDF(data);

  // 2. Drawings — most-recent drawing file from Supabase Storage.
  const [jobRow] = await sql`SELECT builder_company FROM jobs WHERE id = ${data.job_id}`;
  const job = jobRow as { builder_company: string | null } | undefined;

  const drawingRows = await sql`
    SELECT storage_path, filename FROM job_files
    WHERE job_id = ${data.job_id} AND kind = 'drawings'
    ORDER BY uploaded_at DESC LIMIT 1
  `;

  let drawingsBuf: Buffer | null = null;
  let drawingFile: string | null = null;

  if (drawingRows.length > 0) {
    const { storage_path, filename } = drawingRows[0] as { storage_path: string; filename: string };
    drawingFile = filename;
    const { data: fileData, error } = await getSupabaseAdmin().storage
      .from(STORAGE_BUCKET)
      .download(storage_path);
    if (!error && fileData) {
      drawingsBuf = Buffer.from(await fileData.arrayBuffer());
    }
  }

  if (!drawingsBuf) {
    throw new Error("No drawings PDF for this job. Upload kind=drawings on the job page first.");
  }

  // 3. Disclosure (residential customers only).
  const wantsDisclosure = isResidentialJob(job?.builder_company);
  let disclosureBuf: Buffer | null = null;
  if (wantsDisclosure) {
    const { data: discData, error: discError } = await getSupabaseAdmin().storage
      .from(STORAGE_BUCKET)
      .download(DISCLOSURE_STORAGE_PATH);
    if (!discError && discData) {
      disclosureBuf = Buffer.from(await discData.arrayBuffer());
    } else {
      console.warn(`[docusign] residential job but no disclosure at ${DISCLOSURE_STORAGE_PATH} — skipping.`);
    }
  }

  // 4. Merge via pdf-lib.
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();

  async function appendAll(srcBuffer: Buffer): Promise<number> {
    const src = await PDFDocument.load(srcBuffer);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
    return pages.length;
  }

  const specPages       = await appendAll(specBuf);
  const drawingsPages   = await appendAll(drawingsBuf);
  const disclosurePages = disclosureBuf ? await appendAll(disclosureBuf) : 0;

  const bytes = await out.save();
  return {
    buffer: Buffer.from(bytes),
    bytes: bytes.length,
    components: { spec: specPages, drawings: drawingsPages, disclosure: disclosurePages },
    drawing_filename: drawingFile,
    disclosure_attached: disclosurePages > 0,
  };
}

export type SendEnvelopeInput = {
  approvalRequestId: string;
  recipientName: string;
  recipientEmail: string;
  emailSubject?: string;
  emailMessage?: string;
};

export type SendEnvelopeResult =
  | { ok: true; envelopeId: string }
  | { ok: false; error: string; needsProvisioning?: boolean };

export async function sendEnvelope(_input: SendEnvelopeInput): Promise<SendEnvelopeResult> {
  if (!process.env.DOCUSIGN_INTEGRATION_KEY) {
    return {
      ok: false,
      error: "DocuSign not provisioned. Set DOCUSIGN_INTEGRATION_KEY etc. in .env.local — see app/api/docusign/webhook/route.ts header for the full list.",
      needsProvisioning: true,
    };
  }
  return {
    ok: false,
    error: "DocuSign env vars present but live integration not yet implemented.",
  };
}

export { SpecDataError };
