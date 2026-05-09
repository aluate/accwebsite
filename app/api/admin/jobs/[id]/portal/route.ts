import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import {
  seedDefaultRequiredInputs, listRequiredInputs, summarize,
  markInputReceived, markInputPending, waiveInput,
} from "@/lib/portal-required-inputs";
import { sendEmail } from "@/lib/mailer";

// Helper: find a portal account email for a given job (company-scoped).
async function getBuilderPortalEmail(jobId: string): Promise<{ email: string; display_name: string } | null> {
  const [row] = await sql<{ email: string; display_name: string }[]>`
    SELECT a.contact_email AS email, a.display_name
    FROM jobs j
    JOIN builder_portal_accounts a ON LOWER(TRIM(a.builder_company)) = LOWER(TRIM(j.builder_company))
    WHERE j.id = ${jobId} AND a.active = true AND a.contact_email IS NOT NULL
    LIMIT 1
  `;
  return row ?? null;
}

// GET — full portal state for a job (admin view)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  const [job] = await sql`
    SELECT id, builder_portal_enabled, target_delivery_weeks, delivery_clock_started_at, estimated_delivery_at
    FROM jobs WHERE id = ${id}
  `;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json({
    job,
    inputs: await listRequiredInputs(id),
    summary: await summarize(id),
    change_requests: await sql`SELECT * FROM builder_change_requests WHERE job_id = ${id} ORDER BY submitted_at DESC`,
    drawing_comments: await sql`SELECT * FROM drawing_comments WHERE job_id = ${id} ORDER BY submitted_at DESC`,
  });
}

// PATCH — toggle enabled, set target_delivery_weeks, mark/waive inputs, resolve CR/comments
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin");
  const { id } = await params;
  const b = await req.json();

  if (typeof b.builder_portal_enabled === "number") {
    await sql`UPDATE jobs SET builder_portal_enabled = ${b.builder_portal_enabled} WHERE id = ${id}`;
    if (b.builder_portal_enabled === 1) {
      await seedDefaultRequiredInputs(id); // idempotent
    }
  }

  if (typeof b.target_delivery_weeks === "number" && b.target_delivery_weeks > 0) {
    await sql`UPDATE jobs SET target_delivery_weeks = ${b.target_delivery_weeks} WHERE id = ${id}`;
  }

  if (b.mark_input_received) {
    await markInputReceived({
      id: String(b.mark_input_received),
      jobId: id,
      by: session.username,
      via: "admin_marked",
      notes: b.notes ?? undefined,
    });
    const acct = await getBuilderPortalEmail(id);
    if (acct) {
      const [inp] = await sql<{ label: string }[]>`
        SELECT label FROM builder_required_inputs WHERE id = ${String(b.mark_input_received)}
      `;
      const [job] = await sql<{ id: string; client_name: string }[]>`
        SELECT id, client_name FROM jobs WHERE id = ${id}
      `;
      const summary = await summarize(id);
      const outstandingSummary = summary.pending > 0
        ? `${summary.pending} item(s) still pending. ${summary.received + summary.waived} of ${summary.total} received.`
        : `All inputs received. Estimated delivery: ${summary.estimated_delivery_at ? new Date(summary.estimated_delivery_at).toLocaleDateString() : "calculating..."}`;
      void sendEmail({
        to: acct.email,
        subject: `${job.id} — ${job.client_name} — Input received: ${inp?.label ?? "(item)"}`,
        text:
          `Hi ${acct.display_name},\n\n` +
          `We've confirmed receipt of "${inp?.label ?? "(item)"}" for job ${job.id} (${job.client_name}).\n\n` +
          `${outstandingSummary}\n\n` +
          `View your portal: ${process.env.PORTAL_URL ?? "https://accspec.net"}\n`,
      });
    }
  }

  if (b.mark_input_pending) {
    await markInputPending(String(b.mark_input_pending), id);
  }

  if (b.waive_input) {
    await waiveInput(String(b.waive_input), id, session.username, b.notes ?? undefined);
  }

  if (b.add_input) {
    await sql`
      INSERT INTO builder_required_inputs (id, job_id, kind, label, description, sort_order, status)
      VALUES (
        ${uid()}, ${id},
        ${String(b.add_input.kind ?? "custom")},
        ${String(b.add_input.label)},
        ${b.add_input.description ?? null},
        ${b.add_input.sort_order ?? 99},
        'pending'
      )
    `;
  }

  if (b.resolve_cr) {
    await sql`
      UPDATE builder_change_requests
      SET status          = ${String(b.resolve_cr.status ?? "incorporated")},
          resolved_at     = ${new Date().toISOString()},
          resolved_by     = ${session.username},
          resolution_notes = ${b.resolve_cr.notes ?? null}
      WHERE id = ${String(b.resolve_cr.id)} AND job_id = ${id}
    `;
  }

  if (b.resolve_comment) {
    await sql`
      UPDATE drawing_comments
      SET status           = 'resolved',
          resolved_at      = ${new Date().toISOString()},
          resolved_by      = ${session.username},
          resolution_notes = ${b.resolve_comment.notes ?? null}
      WHERE id = ${String(b.resolve_comment.id)} AND job_id = ${id}
    `;
  }

  if (b.acc_comment_reply) {
    await sql`
      INSERT INTO drawing_comments
        (id, job_id, drawing_filename, page_number, cabinet_ref, body,
         submitted_at, submitted_by, submitted_role, status)
      VALUES (
        ${uid()}, ${id},
        ${String(b.acc_comment_reply.drawing_filename)},
        ${b.acc_comment_reply.page_number ?? null},
        ${b.acc_comment_reply.cabinet_ref ?? null},
        ${String(b.acc_comment_reply.body)},
        ${new Date().toISOString()}, ${session.username}, 'acc', 'open'
      )
    `;
    const acct = await getBuilderPortalEmail(id);
    if (acct) {
      const [job] = await sql<{ id: string; client_name: string }[]>`
        SELECT id, client_name FROM jobs WHERE id = ${id}
      `;
      const cabinetRef = b.acc_comment_reply.cabinet_ref
        ? `Cabinet ${b.acc_comment_reply.cabinet_ref}` : "";
      const pageRef = b.acc_comment_reply.page_number
        ? ` · Page ${b.acc_comment_reply.page_number}` : "";
      void sendEmail({
        to: acct.email,
        subject: `${job.id} — ${job.client_name} — Comment from ACC`,
        text:
          `Hi ${acct.display_name},\n\n` +
          `${session.username} added a comment on your job ${job.id} (${job.client_name})` +
          `${cabinetRef ? ` — ${cabinetRef}${pageRef}` : ""}:\n\n` +
          `"${String(b.acc_comment_reply.body)}"\n\n` +
          `View your portal: ${process.env.PORTAL_URL ?? "https://accspec.net"}\n`,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
