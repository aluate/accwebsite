/**
 * DocuSign envelope builder + sender.
 *
 * Auth: JWT Bearer (server-to-server). No user interaction after first consent grant.
 * Docs: https://developers.docusign.com/platform/auth/jwt-get-token/
 *
 * Required env vars:
 *   DOCUSIGN_INTEGRATION_KEY  — app/integration key (UUID)
 *   DOCUSIGN_USER_ID          — impersonation user ID (UUID)
 *   DOCUSIGN_ACCOUNT_ID       — eSign account ID (UUID)
 *   DOCUSIGN_PRIVATE_KEY      — RSA private key (PEM, newlines as \n or literal)
 *   DOCUSIGN_BASE_PATH        — https://demo.docusign.net  (dev) or https://na3.docusign.net (prod)
 *
 * First-time setup: Karl must grant consent once per integration key:
 *   Dev:  https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id={INTEGRATION_KEY}&redirect_uri=https://accwebsite-cd58.vercel.app
 *   Prod: https://account.docusign.com/oauth/auth?...
 */

import { sql } from "@/lib/db";
import { renderSpecPDF } from "@/lib/pdf-spec";
import { loadSpecPDFData, SpecDataError } from "@/lib/spec-data";
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

const DISCLOSURE_STORAGE_PATH = "templates/residential-disclosure.pdf";
const STORAGE_BUCKET = "job-files";

function isResidentialJob(builder_company: string | null | undefined): boolean {
  return !builder_company || builder_company.trim() === "";
}

// ── Envelope PDF builder ──────────────────────────────────────────────────
export type EnvelopeBuildResult = {
  buffer: Buffer;
  bytes: number;
  pageCount: number;
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

  // Accept both legacy 'drawings' kind and current '05_drawings' / '16_eng_drawings'
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
    const { data: fileData, error } = await getSupabaseAdmin().storage
      .from(STORAGE_BUCKET)
      .download(storage_path);
    if (!error && fileData) {
      drawingsBuf = Buffer.from(await fileData.arrayBuffer());
    }
  }

  if (!drawingsBuf) {
    throw new Error("No drawings PDF for this job. Upload a PDF with kind '05_drawings' or '16_eng_drawings' on the job page first.");
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
  // Support both literal \n (env var escaping) and real newlines
  const privateKey = (process.env.DOCUSIGN_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const basePath = process.env.DOCUSIGN_BASE_URL || "https://demo.docusign.net";
  const isProd = !basePath.includes("demo");
  const authHost = isProd ? "account.docusign.com" : "account-d.docusign.com";

  const now = Math.floor(Date.now() / 1000);

  // Build JWT header + payload
  const header  = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: integrationKey,
    sub: userId,
    aud: authHost,
    iat: now,
    exp: now + 3600,
    scope: "signature impersonation",
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
    // consent_required means Karl needs to click the one-time grant URL
    if (txt.includes("consent_required")) {
      throw new Error("CONSENT_REQUIRED");
    }
    throw new Error(`DocuSign token failed (${res.status}): ${txt}`);
  }

  const { access_token } = await res.json() as { access_token: string };
  return access_token;
}

// ── Envelope sender ───────────────────────────────────────────────────────
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
      error: "DocuSign not configured. Set DOCUSIGN_INTEGRATION_KEY and related env vars in Vercel.",
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
      const consentUrl = `https://${authHost}/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=${integrationKey}&redirect_uri=${basePath}`;
      return {
        ok: false,
        error: `DocuSign consent not yet granted. Open this URL in a browser and click Allow: ${consentUrl}`,
        needsConsent: true,
      };
    }
    return { ok: false, error: `DocuSign auth error: ${msg}` };
  }

  // Sign here tab on the last page, near the bottom
  const lastPage = String(input.pageCount);
  const envelopeBody = {
    emailSubject: input.emailSubject ?? "Please sign your ACC Cabinet Contract",
    emailBlurb: input.emailMessage ?? "Advanced Custom Cabinets has prepared your contract for signature. Please review and sign at your earliest convenience.",
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
          signHereTabs: [{
            documentId: "1",
            pageNumber: lastPage,
            xPosition: "72",
            yPosition: "650",
          }],
          dateSignedTabs: [{
            documentId: "1",
            pageNumber: lastPage,
            xPosition: "300",
            yPosition: "650",
          }],
        },
      }],
    },
    status: "sent",
  };

  const envRes = await fetch(`${apiBase}/envelopes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
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
