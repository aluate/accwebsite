export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";
import { buildEnvelopePDF, sendEnvelope, SpecDataError } from "@/lib/docusign";
import { transitionApproval } from "@/lib/approvals";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "job-files";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST /api/specs/[id]/contract
// Body: { includeDisclosure?: boolean }
// Called by the UI "Send Contract" button after the disclosure modal.
//
// Flow:
//   1. Load spec → job (pull client_name, client_email)
//   2. buildEnvelopePDF (spec + drawings + disclosure for residential)
//   3. Upload combined PDF to Supabase Storage as 15_contract
//   4. Create approval_requests row (DRAFT)
//   5. sendEnvelope via DocuSign
//   6. On success: transition DRAFT → SENT, return { ok, file_id, envelopeId }
//   7. On DocuSign error: return { ok: false, file_id, error, needsConsent? }
//      (PDF is still saved — PM can fall back to manual send)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireBuilder();
  const { id: specId } = await params;

  // 1. Load spec + job
  type SpecRow = { job_id: string };
  const [specRow] = await sql<SpecRow[]>`
    SELECT job_id FROM residential_specs WHERE id = ${specId}
  `;
  if (!specRow) return NextResponse.json({ error: "Spec not found" }, { status: 404 });

  type JobRow = { id: string; client_name: string; client_email: string | null; site_address: string };
  const [job] = await sql<JobRow[]>`
    SELECT id, client_name, client_email, site_address FROM jobs WHERE id = ${specRow.job_id}
  `;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (!job.client_email) {
    return NextResponse.json(
      { error: "No client email on file. Add one to the job before sending the contract." },
      { status: 400 }
    );
  }

  // 2. Build envelope PDF
  let env;
  try {
    env = await buildEnvelopePDF(specId);
  } catch (e) {
    if (e instanceof SpecDataError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  // 3. Upload combined PDF to Supabase Storage as 15_contract
  const filename = `contract-${specId}.pdf`;
  const storagePath = `jobs/${job.id}/15_contract/${Date.now()}-${filename}`;
  const { error: uploadError } = await supabaseAdmin().storage
    .from(BUCKET)
    .upload(storagePath, env.buffer, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  // Insert job_files row
  const fileId = uid();
  await sql`
    INSERT INTO job_files (id, job_id, kind, filename, storage_path, size, uploaded_at)
    VALUES (${fileId}, ${job.id}, '15_contract', ${filename}, ${storagePath}, ${env.bytes}, ${new Date().toISOString()})
  `;

  // 4. Create approval_requests row
  const approvalId = uid();
  await sql`
    INSERT INTO approval_requests (
      id, spec_id, job_id, status, recipient_name, recipient_email, created_at, created_by
    ) VALUES (
      ${approvalId}, ${specId}, ${job.id}, 'DRAFT',
      ${job.client_name}, ${job.client_email},
      ${new Date().toISOString()}, ${session.username ?? "system"}
    )
  `;

  // 5. Send via DocuSign
  const sendResult = await sendEnvelope({
    approvalRequestId: approvalId,
    recipientName: job.client_name,
    recipientEmail: job.client_email,
    pdfBuffer: env.buffer,
    pageCount: env.pageCount,
    emailSubject: `Cabinet Contract — ${job.site_address || job.id}`,
  });

  if (!sendResult.ok) {
    // PDF is saved — PM can still send manually. Return enough info to show useful UI.
    return NextResponse.json({
      ok: false,
      file_id: fileId,
      approvalRequestId: approvalId,
      error: sendResult.error,
      needsProvisioning: "needsProvisioning" in sendResult ? sendResult.needsProvisioning : false,
      needsConsent: "needsConsent" in sendResult ? sendResult.needsConsent : false,
      hint: "Contract PDF was saved to the job folder. Once DocuSign is configured, re-send from /admin/bugs or the spec page.",
    });
  }

  // 6. Transition DRAFT → SENT
  await transitionApproval(approvalId, "SENT", {
    actor: session.username ?? "system",
    docusignEnvelopeId: sendResult.envelopeId,
  });

  return NextResponse.json({
    ok: true,
    file_id: fileId,
    envelopeId: sendResult.envelopeId,
    components: env.components,
  });
}
