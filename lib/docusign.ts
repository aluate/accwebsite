/**
 * lib/docusign.ts
 *
 * Contract packet builder + (legacy) DocuSign sender.
 *
 * Primary export: buildContractPacket(jobId, specId)
 *   — Generates the combined unsigned PDF: spec + drawings + disclosure + warranty.
 *   — Used by the internal signing flow (/api/jobs/[id]/send-contract).
 *
 * Legacy: buildEnvelopePDF / sendEnvelope kept for DocuSign code paths.
 */

import { sql } from "@/lib/db";
import { renderClientSpecPDFBuffer } from "@/lib/pdf-spec";
import { loadSpecPDFData, SpecDataError } from "@/lib/spec-data";
import { downloadTemplateDoc } from "@/lib/template-documents";
import { createClient } from "@supabase/supabase-js";

// ── Supabase admin client ─────────────────────────────────────────────────
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

const STORAGE_BUCKET = "job-files";

// ── Contract packet builder ───────────────────────────────────────────────
export type ContractPacketResult = {
  buffer: Buffer;
  bytes: number;
  pageCount: number;
  components: {
    spec: number;
    drawings: number;
    disclosure: number;
    warranty: number;
  };
  drawing_filename: string | null;
  spec_filename: string | null;
};

/**
 * Build the combined unsigned contract PDF for a job:
 *   spec PDF (fresh render) + most-recent drawings + disclosure + warranty.
 *
 * Throws if drawings are missing (they are required for a complete contract).
 * Disclosure and warranty are best-effort — included if uploaded, skipped with a warning if not.
 */
export async function buildContractPacket(
  jobId: string,
  specId: string
): Promise<ContractPacketResult> {
  // 1. Spec PDF — fresh render.
  const specData = await loadSpecPDFData(specId);
  // Client document only. This envelope goes to the client for signature; the
  // work order sheets are shop paperwork and have no business in it.
  const specBuf = await renderClientSpecPDFBuffer(specData);

  // 2. Drawings — most-recent engineering drawing from job_files.
  const drawingRows = await sql`
    SELECT storage_path, filename FROM job_files
    WHERE job_id = ${jobId}
      AND kind IN ('drawings', '05_drawings', '16_eng_drawings')
    ORDER BY
      CASE kind WHEN '16_eng_drawings' THEN 0 WHEN '05_drawings' THEN 1 ELSE 2 END,
      uploaded_at DESC
    LIMIT 1
  `;

  let drawingsBuf: Buffer | null = null;
  let drawingFile: string | null = null;

  if (drawingRows.length > 0) {
    const row = drawingRows[0] as { storage_path: string; filename: string };
    drawingFile = row.filename;
    const { data, error } = await getSupabaseAdmin()
      .storage.from(STORAGE_BUCKET)
      .download(row.storage_path);
    if (!error && data) drawingsBuf = Buffer.from(await data.arrayBuffer());
  }

  if (!drawingsBuf) {
    throw new Error(
      "No drawings PDF found for this job. Upload a PDF with kind '05_drawings' or '16_eng_drawings' before sending the contract."
    );
  }

  // 3. Disclosure + Warranty from template library.
  const [disclosureDoc, warrantyDoc] = await Promise.all([
    downloadTemplateDoc("residential_disclosure"),
    downloadTemplateDoc("warranty"),
  ]);

  // 4. Merge via pdf-lib.
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();

  async function appendAll(srcBuffer: Buffer): Promise<number> {
    const src = await PDFDocument.load(srcBuffer);
    const indices = src.getPageIndices();
    const pages = await out.copyPages(src, indices);
    for (const p of pages) out.addPage(p);
    return pages.length;
  }

  const specPages       = await appendAll(specBuf);
  const drawingsPages   = await appendAll(drawingsBuf);
  const disclosurePages = disclosureDoc ? await appendAll(disclosureDoc.buffer) : 0;
  const warrantyPages   = warrantyDoc   ? await appendAll(warrantyDoc.buffer)   : 0;

  if (!disclosureDoc) console.warn("[buildContractPacket] disclosure not found — skipping.");
  if (!warrantyDoc)   console.warn("[buildContractPacket] warranty not found — skipping.");

  const bytes = await out.save();
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  return {
    buffer: Buffer.from(bytes),
    bytes: bytes.length,
    pageCount: specPages + drawingsPages + disclosurePages + warrantyPages,
    components: {
      spec: specPages,
      drawings: drawingsPages,
      disclosure: disclosurePages,
      warranty: warrantyPages,
    },
    drawing_filename: drawingFile,
    spec_filename: `spec-${ts}.pdf`,
  };
}

// ── Legacy: envelope PDF builder (used by /api/specs/[id]/contract) ───────
export type EnvelopeBuildResult = {
  buffer: Buffer;
  bytes: number;
  pageCount: number;
  components: { spec: number; drawings: number; disclosure: number };
  drawing_filename: string | null;
  disclosure_attached: boolean;
};

function isResidentialJob(builder_company: string | null | undefined): boolean {
  return !builder_company || builder_company.trim() === "";
}

export async function buildEnvelopePDF(specId: string): Promise<EnvelopeBuildResult> {
  const data = await loadSpecPDFData(specId);
  // Client document only -- see the note in buildContractPacket.
  const specBuf = await renderClientSpecPDFBuffer(data);

  const [jobRow] = await sql`SELECT builder_company FROM jobs WHERE id = ${data.job_id}`;
  const job = jobRow as { builder_company: string | null } | undefined;

  const drawingRows = await sql`
    SELECT storage_path, filename FROM job_files
    WHERE job_id = ${data.job_id}
      AND kind IN ('drawings', '05_drawings', '16_eng_drawings')
    ORDER BY
      CASE kind WHEN '16_eng_drawings' THEN 0 WHEN '05_drawings' THEN 1 ELSE 2 END,
      uploaded_at DESC
    LIMIT 1
  `;

  let drawingsBuf: Buffer | null = null;
  let drawingFile: string | null = null;

  if (drawingRows.length > 0) {
    const { storage_path, filename } = drawingRows[0] as { storage_path: string; filename: string };
    drawingFile = filename;
    const { data: fileData, error } = await getSupabaseAdmin()
      .storage.from(STORAGE_BUCKET)
      .download(storage_path);
    if (!error && fileData) drawingsBuf = Buffer.from(await fileData.arrayBuffer());
  }

  if (!drawingsBuf) {
    throw new Error("No drawings PDF for this job. Upload a PDF with kind '05_drawings' or '16_eng_drawings' first.");
  }

  const wantsDisclosure = isResidentialJob(job?.builder_company);
  let disclosureBuf: Buffer | null = null;
  if (wantsDisclosure) {
    const disc = await downloadTemplateDoc("residential_disclosure");
    if (disc) disclosureBuf = disc.buffer;
  }

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
    pageCount: specPages + drawingsPages + disclosurePages,
    components: { spec: specPages, drawings: drawingsPages, disclosure: disclosurePages },
    drawing_filename: drawingFile,
    disclosure_attached: disclosurePages > 0,
  };
}

// ── DocuSign JWT Bearer auth ──────────────────────────────────────────────
async function getDocuSignToken(): Promise<string> {
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY!;
  const userId = process.env.DOCUSIGN_USER_ID!;
  const privateKey = (process.env.DOCUSIGN_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const basePath = process.env.DOCUSIGN_BASE_URL || "https://demo.docusign.net";
  const isProd = !basePath.includes("demo");
  const authHost = isProd ? "account.docusign.com" : "account-d.docusign.com";
  const now = Math.floor(Date.now() / 1000);

  const header  = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: integrationKey, sub: userId, aud: authHost,
    iat: now, exp: now + 3600, scope: "signature impersonation",
  })).toString("base64url");

  const { createSign } = await import("crypto");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const sig = signer.sign(privateKey, "base64url");
  const assertion = `${header}.${payload}.${sig}`;

  const res = await fetch(`https://${authHost}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    if (txt.includes("consent_required")) throw new Error("CONSENT_REQUIRED");
    throw new Error(`DocuSign token failed (${res.status}): ${txt}`);
  }

  const { access_token } = await res.json() as { access_token: string };
  return access_token;
}

export type SendEnvelopeInput = {
  approvalRequestId: string;
  recipientName: string;
  recipientEmail: string;
  pdfBuffer: Buffer;
  pageCount: number;
  emailSubject?: string;
  emailMessage?: string;
};

export type SendEnvelopeResult =
  | { ok: true; envelopeId: string }
  | { ok: false; error: string; needsProvisioning?: boolean; needsConsent?: boolean };

export async function sendEnvelope(input: SendEnvelopeInput): Promise<SendEnvelopeResult> {
  if (!process.env.DOCUSIGN_INTEGRATION_KEY) {
    return {
      ok: false,
      error: "DocuSign not configured.",
      needsProvisioning: true,
    };
  }

  const accountId = process.env.DOCUSIGN_ACCOUNT_ID!;
  const basePath  = process.env.DOCUSIGN_BASE_URL || "https://demo.docusign.net";
  const apiBase   = `${basePath}/restapi/v2.1/accounts/${accountId}`;

  let token: string;
  try {
    token = await getDocuSignToken();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "CONSENT_REQUIRED") {
      const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
      const isProd = !basePath.includes("demo");
      const authHost = isProd ? "account.docusign.com" : "account-d.docusign.com";
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://accwebsite-cd58.vercel.app";
      const consentUrl = `https://${authHost}/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=${integrationKey}&redirect_uri=${appUrl}`;
      return { ok: false, error: `DocuSign consent required. Grant URL: ${consentUrl}`, needsConsent: true };
    }
    return { ok: false, error: `DocuSign auth error: ${msg}` };
  }

  const lastPage = String(input.pageCount);
  const envelopeBody = {
    emailSubject: input.emailSubject ?? "Please sign your ACC Cabinet Contract",
    emailBlurb: input.emailMessage ?? "Advanced Custom Cabinets has prepared your contract for signature.",
    documents: [{
      documentBase64: input.pdfBuffer.toString("base64"),
      name: "ACC-Cabinet-Contract.pdf",
      fileExtension: "pdf",
      documentId: "1",
    }],
    recipients: {
      signers: [{
        email: input.recipientEmail,
        name: input.recipientName,
        recipientId: "1",
        routingOrder: "1",
        tabs: {
          signHereTabs: [{ documentId: "1", pageNumber: lastPage, xPosition: "72", yPosition: "650" }],
          dateSignedTabs: [{ documentId: "1", pageNumber: lastPage, xPosition: "300", yPosition: "650" }],
        },
      }],
    },
    status: "sent",
  };

  const envRes = await fetch(`${apiBase}/envelopes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(envelopeBody),
  });

  if (!envRes.ok) {
    const err = await envRes.text();
    return { ok: false, error: `DocuSign envelope creation failed (${envRes.status}): ${err}` };
  }

  const { envelopeId } = await envRes.json() as { envelopeId: string };
  return { ok: true, envelopeId };
}

export { SpecDataError };
