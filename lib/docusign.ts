/**
 * DocuSign envelope builder + sender.
 *
 * Uses JWT User Token grant (RS256) — no OAuth redirect required.
 * Drawings come from Supabase Storage via the job_files table.
 * Disclosure PDF is stored at "templates/residential-disclosure.pdf".
 *
 * Required env vars:
 *   DOCUSIGN_INTEGRATION_KEY  – app integration key (UUID)
 *   DOCUSIGN_USER_ID          – impersonated user ID (UUID)
 *   DOCUSIGN_ACCOUNT_ID       – eSign account ID (UUID)
 *   DOCUSIGN_BASE_URL         – https://demo.docusign.net (sandbox) or https://na3.docusign.net (prod)
 *   DOCUSIGN_PRIVATE_KEY      – RSA private key (PEM), newlines as \n or literal
 */

import crypto from "crypto";
import { sql } from "@/lib/db";
import { renderSpecPDF } from "@/lib/pdf-spec";
import { loadSpecPDFData, SpecDataError } from "@/lib/spec-data";
import { createClient } from "@supabase/supabase-js";

// ── Supabase ──────────────────────────────────────────────────────────────────
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

// ── Envelope PDF builder ──────────────────────────────────────────────────────
export type EnvelopeBuildResult = {
  buffer: Buffer;
  bytes: number;
  components: { spec: number; drawings: number; disclosure: number };
  drawing_filename: string | null;
  disclosure_attached: boolean;
};

export async function buildEnvelopePDF(specId: string): Promise<EnvelopeBuildResult> {
  const data = await loadSpecPDFData(specId);

  const specBuf = await renderSpecPDF(data);

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

// ── JWT helpers ───────────────────────────────────────────────────────────────
function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function makeJWT(integrationKey: string, userId: string, audience: string, privateKeyPem: string): string {
  const header  = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now     = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({
    iss: integrationKey,
    sub: userId,
    aud: audience,
    iat: now,
    exp: now + 3600,
    scope: "signature impersonation",
  }));
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const sig = b64url(sign.sign(privateKeyPem));
  return `${header}.${payload}.${sig}`;
}

async function getAccessToken(
  integrationKey: string,
  userId: string,
  privateKeyPem: string,
  oauthHost: string
): Promise<string> {
  const jwt = makeJWT(integrationKey, userId, oauthHost, privateKeyPem);
  const res = await fetch(`https://${oauthHost}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    // consent_required means the user hasn't granted access yet
    if (text.includes("consent_required") || text.includes("consent required")) {
      throw new ConsentRequiredError(integrationKey, oauthHost);
    }
    throw new Error(`DocuSign token error ${res.status}: ${text}`);
  }
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

class ConsentRequiredError extends Error {
  consentUrl: string;
  constructor(integrationKey: string, oauthHost: string) {
    const url = `https://${oauthHost}/oauth/auth?response_type=code&scope=signature+impersonation&client_id=${integrationKey}&redirect_uri=https://www.advancedcabinets.org`;
    super(`DocuSign consent required. Visit: ${url}`);
    this.consentUrl = url;
  }
}

// ── Envelope sender ───────────────────────────────────────────────────────────
export type SendEnvelopeInput = {
  approvalRequestId: string;
  recipientName: string;
  recipientEmail: string;
  emailSubject?: string;
  emailMessage?: string;
};

export type SendEnvelopeResult =
  | { ok: true; envelopeId: string }
  | { ok: false; error: string; needsProvisioning?: boolean; consentUrl?: string };

export async function sendEnvelope(input: SendEnvelopeInput): Promise<SendEnvelopeResult> {
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
  const userId         = process.env.DOCUSIGN_USER_ID;
  const accountId      = process.env.DOCUSIGN_ACCOUNT_ID;
  const rawKey         = process.env.DOCUSIGN_PRIVATE_KEY;
  const baseUrl        = (process.env.DOCUSIGN_BASE_URL ?? "https://demo.docusign.net").replace(/\/$/, "");

  if (!integrationKey || !userId || !accountId || !rawKey) {
    return {
      ok: false,
      error: "DocuSign not configured. Set DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_ACCOUNT_ID, DOCUSIGN_PRIVATE_KEY in Vercel env vars.",
      needsProvisioning: true,
    };
  }

  // Handle \n literal escaping (Vercel env vars can't store real newlines in some UIs)
  const privateKeyPem = rawKey.replace(/\\n/g, "\n");

  const isSandbox  = baseUrl.includes("demo.docusign");
  const oauthHost  = isSandbox ? "account-d.docusign.com" : "account.docusign.com";
  const restApiUrl = `${baseUrl}/restapi/v2.1`;

  // Get access token
  let accessToken: string;
  try {
    accessToken = await getAccessToken(integrationKey, userId, privateKeyPem, oauthHost);
  } catch (err) {
    if (err instanceof ConsentRequiredError) {
      return { ok: false, error: err.message, needsProvisioning: true, consentUrl: err.consentUrl };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DocuSign auth failed: ${msg}` };
  }

  // Build envelope PDF
  let envelopePdf: EnvelopeBuildResult;
  try {
    const [approval] = await sql<{ spec_id: string }[]>`
      SELECT spec_id FROM approval_requests WHERE id = ${input.approvalRequestId}
    `;
    if (!approval) return { ok: false, error: "Approval request not found" };
    envelopePdf = await buildEnvelopePDF(approval.spec_id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to build envelope PDF: ${msg}` };
  }

  const docBase64 = envelopePdf.buffer.toString("base64");

  // Build and send envelope via REST API
  const envelope = {
    emailSubject: input.emailSubject ?? "Advanced Custom Cabinets — Please Review & Sign",
    emailBlurb:   input.emailMessage ?? "Please review and sign the attached cabinet specification and contract.",
    documents: [{
      documentBase64: docBase64,
      name: "ACC Cabinet Contract",
      fileExtension: "pdf",
      documentId: "1",
    }],
    recipients: {
      signers: [{
        email:       input.recipientEmail,
        name:        input.recipientName,
        recipientId: "1",
        routingOrder: "1",
        tabs: {
          signHereTabs: [{
            documentId:  "1",
            pageNumber:  "1",
            xPosition:   "72",
            yPosition:   "650",
            tabLabel:    "ClientSignature",
          }],
          dateSignedTabs: [{
            documentId: "1",
            pageNumber:  "1",
            xPosition:   "340",
            yPosition:   "650",
            tabLabel:    "ClientDate",
          }],
        },
      }],
    },
    status: "sent",
  };

  const envelopeRes = await fetch(`${restApiUrl}/accounts/${accountId}/envelopes`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(envelope),
  });

  if (!envelopeRes.ok) {
    const text = await envelopeRes.text();
    return { ok: false, error: `DocuSign envelope creation failed ${envelopeRes.status}: ${text}` };
  }

  const result = await envelopeRes.json() as { envelopeId: string };
  return { ok: true, envelopeId: result.envelopeId };
}

export { SpecDataError };
