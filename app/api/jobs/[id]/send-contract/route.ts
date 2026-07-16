export const dynamic = "force-dynamic";

/**
 * POST /api/jobs/[id]/send-contract
 *
 * Sends the contract packet to the client and creates a signoff token.
 * Auto-attaches the residential_disclosure from the template document library.
 * PM selects drawings and quote files from the job file store.
 *
 * Body: {
 *   to: string            — recipient email
 *   cc?: string
 *   note?: string
 *   include_estimate: boolean   — link to web estimate in email
 *   drawing_file_ids?: string[] — job_files.id for final drawings (01_plan / 05_drawings)
 *   quote_file_ids?: string[]   — job_files.id for quote PDFs (02_quote)
 *   expiry_days?: number        — signoff link expiry (default 30)
 * }
 *
 * Returns: { ok, token, signoffUrl, signoffId }
 */

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";
import { sendEmail } from "@/lib/mailer";
import { contractSent } from "@/lib/email-templates";
import { generateSignoffToken, signoffUrl } from "@/lib/signoff";
import { downloadTemplateDoc } from "@/lib/template-documents";
import { logActivity } from "@/lib/activity-log";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const BUCKET = "job-files";

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
    include_estimate?: boolean;
    drawing_file_ids?: string[];
    quote_file_ids?: string[];
    expiry_days?: number;
  };

  const toEmail = (body.to ?? "").trim();
  if (!toEmail) return NextResponse.json({ error: "Recipient email required" }, { status: 400 });

  // ── Collect attachments ───────────────────────────────────────────────────
  const attachments: Array<{ filename: string; content: Buffer }> = [];
  const attachedDocsMeta: Array<{ type: string; filename: string }> = [];

  // 1. Residential disclosure (from template library)
  const disclosure = await downloadTemplateDoc("residential_disclosure");
  if (disclosure) {
    attachments.push({ filename: disclosure.filename, content: disclosure.buffer });
    attachedDocsMeta.push({ type: "disclosure", filename: disclosure.filename });
  }

  // 2. Job files (drawings + quote PDFs)
  const allFileIds = [
    ...(body.drawing_file_ids ?? []),
    ...(body.quote_file_ids ?? []),
  ];
  if (allFileIds.length) {
    const supabase = supabaseAdmin();
    const files = await sql<Array<{ id: string; filename: string; storage_path: string; kind: string }>>`
      SELECT id, filename, storage_path, kind FROM job_files
      WHERE id = ANY(${allFileIds}::text[]) AND job_id = ${job.id}
    `.catch(() => []);

    for (const f of files) {
      const { data, error } = await supabase.storage.from(BUCKET).download(f.storage_path);
      if (error || !data) continue;
      attachments.push({ filename: f.filename, content: Buffer.from(await data.arrayBuffer()) });
      attachedDocsMeta.push({ type: f.kind, filename: f.filename });
    }
  }

  // ── Create signoff token ──────────────────────────────────────────────────
  const token = generateSignoffToken();
  const signoffId = uid();
  const expiryDays = body.expiry_days ?? 30;
  const expiresAt = new Date(Date.now() + expiryDays * 86400 * 1000).toISOString();
  const now = new Date().toISOString();
  const actor = session.name ?? "pm";

  const pmNote = body.note?.trim() || `Contract packet for ${job.client_name} — ${job.site_address}`;

  await sql`
    INSERT INTO client_signoffs
      (id, job_id, token, token_expires_at, status, pm_note,
       created_by, created_at, signoff_purpose, attached_docs_json)
    VALUES
      (${signoffId}, ${job.id}, ${token}, ${expiresAt}, 'pending',
       ${pmNote}, ${actor}, ${now}, 'contract',
       ${JSON.stringify(attachedDocsMeta)})
  `;

  const sUrl = signoffUrl(token);

  // ── Build and send email ───────────────────────────────────────────────────
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
    attachments: attachments.length ? attachments : undefined,
  });

  if (!result.ok) {
    // Clean up the signoff we just created
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
      attachments: attachedDocsMeta.map((d) => d.filename),
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, token, signoffUrl: sUrl, signoffId });
}
