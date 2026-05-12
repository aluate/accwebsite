export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";
import { buildEnvelopePDF, sendEnvelope, SpecDataError } from "@/lib/docusign";
import { transitionApproval } from "@/lib/approvals";

export const runtime = 'nodejs';

// POST /api/specs/[id]/approval/send
//   { recipientName, recipientEmail, emailSubject?, emailMessage? }
//
// 1. Builds the envelope PDF (spec + drawings + disclosure).
// 2. Creates an approval_requests row (status DRAFT).
// 3. Calls sendEnvelope() — currently 503 unless DocuSign env vars are set.
// 4. On success, transitions DRAFT → SENT and stores docusign_envelope_id.
//
// Until DocuSign is provisioned, step 3 returns "needsProvisioning: true"
// and we keep the approval_requests row at DRAFT so Karl can complete the
// flow manually for now.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireBuilder();
  const { id: specId } = await params;
  const body = await req.json().catch(() => ({}));
  const recipientName  = String(body.recipientName  ?? "").trim();
  const recipientEmail = String(body.recipientEmail ?? "").trim();
  const emailSubject   = body.emailSubject ? String(body.emailSubject) : undefined;
  const emailMessage   = body.emailMessage ? String(body.emailMessage) : undefined;

  if (!recipientName || !recipientEmail) {
    return NextResponse.json({ error: "recipientName and recipientEmail are required" }, { status: 400 });
  }

  // 1. Build envelope (also confirms drawings exist + disclosure logic runs).
  let env;
  try {
    env = await buildEnvelopePDF(specId);
  } catch (e) {
    if (e instanceof SpecDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  // 2. Persist a DRAFT approval_requests row.
  const [job] = await sql<{ id: string }[]>`
    SELECT id FROM jobs WHERE id = (SELECT job_id FROM residential_specs WHERE id = ${specId})
  `;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const approvalId = uid();
  await sql`
    INSERT INTO approval_requests (
      id, spec_id, job_id, status, recipient_name, recipient_email, created_at, created_by
    ) VALUES (${approvalId}, ${specId}, ${job.id}, 'DRAFT', ${recipientName}, ${recipientEmail}, ${new Date().toISOString()}, ${session.username})
  `;

  // 3. Try to send.
  const sendResult = await sendEnvelope({
    approvalRequestId: approvalId,
    recipientName, recipientEmail, emailSubject, emailMessage,
  });

  if (!sendResult.ok) {
    // Don't 5xx — return useful info so the UI can show "envelope built but not sent".
    return NextResponse.json({
      ok: false,
      approvalRequestId: approvalId,
      envelope: {
        components: env.components,
        bytes: env.bytes,
        drawing_used: env.drawing_filename,
        disclosure_attached: env.disclosure_attached,
      },
      error: sendResult.error,
      needsProvisioning: "needsProvisioning" in sendResult ? sendResult.needsProvisioning : false,
      hint: "DocuSign not yet configured. Use POST /api/specs/{id}/approval/preview to download the envelope PDF and email it manually.",
    }, { status: 200 });
  }

  // 4. Transition DRAFT → SENT.
  const t = await transitionApproval(approvalId, "SENT", {
    actor: session.username,
    docusignEnvelopeId: sendResult.envelopeId,
  });
  if (!t.ok) {
    console.warn(`[approval/send] envelope sent but transition failed: ${t.error}`);
  }

  return NextResponse.json({
    ok: true,
    approvalRequestId: approvalId,
    envelopeId: sendResult.envelopeId,
    components: env.components,
  });
}
