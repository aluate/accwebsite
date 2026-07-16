export const dynamic = "force-dynamic";

/**
 * POST /api/jobs/[id]/send-bid
 *
 * Sends a bid email to the client.
 *
 * Body: {
 *   to: string            — recipient email
 *   cc?: string           — optional CC
 *   note?: string         — optional PM note included in email
 *   include_estimate: boolean  — link to web estimate in email
 *   file_ids?: string[]   — job_files.id array to attach as PDFs
 * }
 *
 * On success: advances job to 'bid' status (if not already past it).
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";
import { sendEmail } from "@/lib/mailer";
import { bidSent } from "@/lib/email-templates";
import { logActivity } from "@/lib/activity-log";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const BUCKET = "job-files";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.advancedcabinets.org";

const BID_STATUSES = ["intake", "bid"];

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireBuilder();
  if (!["admin", "pm"].includes(session.role)) {
    return NextResponse.json({ error: "PM or admin required" }, { status: 403 });
  }

  const { id } = await params;
  const [job] = await sql`
    SELECT j.id, j.job_number, j.status, j.client_name, j.client_email,
           j.site_address, j.city, j.delivery_date, j.bid_number
    FROM jobs j
    WHERE j.id = ${id} OR j.job_number = ${id}
  ` as Array<{
    id: string; job_number: string | null; status: string;
    client_name: string; client_email: string | null;
    site_address: string; city: string | null; delivery_date: string | null;
    bid_number: string | null;
  }>;

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const body = await req.json() as {
    to: string;
    cc?: string;
    note?: string;
    include_estimate: boolean;
    file_ids?: string[];
  };

  const toEmail = (body.to ?? "").trim();
  if (!toEmail) return NextResponse.json({ error: "Recipient email required" }, { status: 400 });

  // ── Fetch web estimate if requested ───────────────────────────────────────
  let estimateUrl: string | undefined;
  let estimateId: string | undefined;
  if (body.include_estimate) {
    const [est] = await sql<Array<{ id: string; sell_price: number | null }>>`
      SELECT id, sell_price FROM estimates
      WHERE job_id = ${job.id}
      ORDER BY created_at DESC LIMIT 1
    `.catch(() => []);
    if (est) {
      estimateId = est.id;
      estimateUrl = `${SITE_URL}/admin/estimating/${est.id}/quote`;
    }
  }

  // ── Fetch file attachments ─────────────────────────────────────────────────
  const attachments: Array<{ filename: string; content: Buffer }> = [];
  if (body.file_ids?.length) {
    const supabase = supabaseAdmin();
    const files = await sql<Array<{ id: string; filename: string; storage_path: string }>>`
      SELECT id, filename, storage_path FROM job_files
      WHERE id = ANY(${body.file_ids}::text[]) AND job_id = ${job.id}
    `.catch(() => []);

    for (const f of files) {
      const { data, error } = await supabase.storage.from(BUCKET).download(f.storage_path);
      if (error || !data) continue;
      attachments.push({
        filename: f.filename,
        content: Buffer.from(await data.arrayBuffer()),
      });
    }
  }

  // ── Build email ────────────────────────────────────────────────────────────
  const { subject, text, html } = bidSent({
    clientName: job.client_name,
    siteAddress: job.site_address,
    deliveryDate: job.delivery_date ?? undefined,
    bidNumber: job.bid_number ?? undefined,
    note: body.note,
    estimateUrl,
  });

  const result = await sendEmail({
    to: toEmail,
    cc: body.cc || undefined,
    subject,
    text,
    html,
    attachments: attachments.length ? attachments : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: `Email failed: ${(result as { ok: false; error: string }).error}` },
      { status: 502 }
    );
  }

  // ── Advance to 'bid' if still in intake ───────────────────────────────────
  if (BID_STATUSES.includes(job.status) && job.status === "intake") {
    await sql`UPDATE jobs SET status = 'bid' WHERE id = ${job.id}`;
  }

  await logActivity({
    entityType: "job", entityId: job.id, jobId: job.id,
    eventType: "bid_sent",
    actor: session.name, actorRole: session.role,
    payload: { to: toEmail, estimate_id: estimateId, file_count: attachments.length },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
