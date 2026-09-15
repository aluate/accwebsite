export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

/**
 * POST /api/jobs/[id]/send-contract
 *
 * Builds the contract packet automatically (no manual file selection):
 *   spec PDF (most recent for this job) + drawings (most recent) + disclosure + warranty
 *
 * Uploads the combined PDF to Supabase Storage and stores the path in
 * client_signoffs.combined_pdf_path so the signoff page can serve it inline.
 *
 * Body: {
 *   to: string           — recipient email
 *   cc?: string
 *   note?: string
 *   expiry_days?: number — signoff link expiry (default 30)
 * }
 *
 * Returns: { ok, token, signoffUrl, signoffId, components }
 */

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";
import { sendEmail } from "@/lib/mailer";
import { contractSent } from "@/lib/email-templates";
import { generateSignoffToken, signoffUrl } from "@/lib/signoff";
import { buildContractPacket } from "@/lib/docusign";
import { logActivity } from "@/lib/activity-log";
import { stampApprovalPage } from "@/lib/approval-page";
import { storageClient } from "@/lib/file-store";
const BUCKET = "job-files";

function supabaseAdmin() {
  return storageClient();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireBuilder();
  if (!["karl", "admin", "pm"].includes(session.role)) {
    return NextResponse.json({ error: "PM or admin required" }, { status: 403 });
  }

  const { id } = await params;

  // ── Load job ──────────────────────────────────────────────────────────────
  const [job] = await sql`
    SELECT id, job_number, status, client_name, client_email, site_address, city, pm
    FROM jobs WHERE id = ${id} OR job_number = ${id}
  ` as Array<{
    id: string; job_number: string | null; status: string;
    client_name: string; client_email: string | null;
    site_address: string; city: string | null; pm: string;
  }>;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const body = await req.json() as {
    to: string;
    cc?: string;
    note?: string;
    expiry_days?: number;
      /** Karl ticked "client approved in person" on the send form. */
    approved_in_person?: boolean;
};

  const toEmail = (body.to ?? "").trim();
  if (!toEmail) return NextResponse.json({ error: "Recipient email required" }, { status: 400 });

  // ── Find most-recent spec for this job ────────────────────────────────────
  const [specRow] = await sql`
    SELECT id FROM residential_specs
    WHERE job_id = ${job.id}
    ORDER BY created_at DESC
    LIMIT 1
  ` as Array<{ id: string }>;

  if (!specRow) {
    return NextResponse.json(
      { error: "No spec found for this job. Create a spec before sending the contract." },
      { status: 400 }
    );
  }

  // ── Build the contract packet ─────────────────────────────────────────────
  let packet;
  try {
    packet = await buildContractPacket(job.id, specRow.id);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }

  // ── Upload combined PDF to Supabase Storage ───────────────────────────────
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `contract-unsigned-${ts}.pdf`;
  const storagePath = `jobs/${job.id}/15_contract/${filename}`;

  const { error: uploadError } = await supabaseAdmin()
    .storage.from(BUCKET)
    .upload(storagePath, packet.buffer, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  // ── Create signoff token ──────────────────────────────────────────────────
  const token = generateSignoffToken();
  const signoffId = uid();
  const expiryDays = body.expiry_days ?? 30;
  const expiresAt = new Date(Date.now() + expiryDays * 86400 * 1000).toISOString();
  const now = new Date().toISOString();
  const actor = session.name ?? "pm";
  const pmNote = body.note?.trim() || `Contract for ${job.client_name} — ${job.site_address}`;

  /*
    APPROVED IN PERSON.

    Karl: "I need a check box to indicate client approved in person in lieu of a
    digital signature ... It will need to send all the same documents, but just
    won't force the drawn signature."

    Ticking it records the approval HERE, at send time, because the approval
    already happened — in a kitchen, over a handshake, when the deposit cheque
    changed hands. The system is recording a fact, not asking for one, so the
    job is unblocked the moment this send succeeds and nothing waits on the
    client.

    The client still gets the same documents and the same working link. If they
    do sign it afterwards, that is recorded too (see the signoff route) — the
    two facts live in separate columns precisely so neither overwrites the
    other.

    What is NOT done here: pretending the client signed. signature_data stays
    null, signer_name stays null, and the PDF says "approved in person, recorded
    by <who>". Karl's bar was "WHO clicked the box and WHEN", and that is
    exactly what is stored — no more, and it is not dressed up as more.
  */
  const inPerson = body.approved_in_person === true;

  await sql`
    INSERT INTO client_signoffs
      (id, job_id, token, token_expires_at, status, pm_note,
       created_by, created_at, signoff_purpose, combined_pdf_path,
       approval_method, in_person_at, in_person_by)
    VALUES
      (${signoffId}, ${job.id}, ${token}, ${expiresAt},
       ${inPerson ? "signed" : "pending"},
       ${pmNote}, ${actor}, ${now}, 'contract', ${storagePath},
       ${inPerson ? "in_person" : "signature"},
       ${inPerson ? now : null}, ${inPerson ? actor : null})
  `;

  /*
    The audit artifact. A signature approval produces a signed PDF when the
    client signs; an in-person approval has no such moment, so the paper is
    written here instead — the same packet with an approval page on the end
    saying ACC recorded it, who, and when.

    Failure to write it must not fail the send: the approval is already in the
    database, which is the record that matters, and a missing PDF is a thing to
    notice rather than a reason to lose the approval.
  */
  let inPersonPdfPath: string | null = null;
  if (inPerson) {
    try {
      const stamped = await stampApprovalPage(packet.buffer, {
        method: "in_person",
        siteAddress: job.site_address,
        clientName: job.client_name,
        recordedBy: actor,
        recordedAt: now,
      });
      const ts2 = now.replace(/[:.]/g, "-").slice(0, 19);
      inPersonPdfPath = `jobs/${job.id}/15_contract/contract-approved-in-person-${ts2}.pdf`;
      const { error: upErr } = await supabaseAdmin()
        .storage.from(BUCKET)
        .upload(inPersonPdfPath, stamped, { contentType: "application/pdf", upsert: false });
      if (upErr) {
        console.error("[send-contract] in-person approval PDF upload failed:", upErr.message);
        inPersonPdfPath = null;
      } else {
        await sql`
          UPDATE client_signoffs SET signed_contract_path = ${inPersonPdfPath}
          WHERE id = ${signoffId}
        `;
      }
    } catch (e) {
      console.error("[send-contract] in-person approval PDF failed:", e instanceof Error ? e.message : e);
      inPersonPdfPath = null;
    }

    await logActivity({
      entityType: "approval", entityId: signoffId, jobId: job.id,
      eventType: "approved_in_person",
      actor, actorRole: session.role,
      payload: {
        note: `Client approved in person. Recorded by ${actor}.`,
        signoff_id: signoffId,
      },
    }).catch(() => {});
  }

  const sUrl = signoffUrl(token);

  // ── Email client the signoff link ─────────────────────────────────────────
  const { subject, text, html } = contractSent({
    clientName: job.client_name,
    siteAddress: job.site_address,
    signoffUrl: sUrl,
    notes: body.note?.trim(),
    pm: job.pm,
  });

  const result = await sendEmail({
    to: toEmail,
    cc: body.cc || undefined,
    subject,
    text,
    html,
    // No attachments — client reviews inline on the signoff page,
    audience: "client", event: "contract_sent",
  });

  if (!result.ok) {
    // Clean up storage + signoff row
    await supabaseAdmin().storage.from(BUCKET).remove([storagePath]).catch(() => {});
    await sql`DELETE FROM client_signoffs WHERE id = ${signoffId}`;
    return NextResponse.json(
      { error: `Email failed: ${(result as { ok: false; error: string }).error}` },
      { status: 502 }
    );
  }

  // ── Log activity ──────────────────────────────────────────────────────────
  await logActivity({
    entityType: "job", entityId: job.id, jobId: job.id,
    eventType: "contract_sent",
    actor, actorRole: session.role,
    payload: {
      to: toEmail,
      signoff_id: signoffId,
      components: packet.components,
      drawing: packet.drawing_filename,
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    token,
    signoffUrl: sUrl,
    signoffId,
    components: packet.components,
  });
}
