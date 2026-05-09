export const dynamic = "force-dynamic";

/**
 * POST /api/signoffs/create
 *
 * Body: { job_id: string; pm_note?: string; expiry_days?: number }
 * Returns: { ok: true; token: string; url: string }
 *
 * Generates a signoff token for a job. The PM copies the URL and
 * shares it with the client. Requires builder auth.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";
import { generateSignoffToken, signoffUrl } from "@/lib/signoff";
import { logActivity } from "@/lib/activity-log";

export async function POST(req: NextRequest) {
  const session = await requireBuilder();
  const body = await req.json() as {
    job_id: string;
    pm_note?: string;
    expiry_days?: number;
  };

  const { job_id, pm_note, expiry_days = 30 } = body;
  if (!job_id) return NextResponse.json({ error: "job_id required" }, { status: 400 });

  // Verify the job exists
  const [job] = await sql`SELECT id, client_name, client_email FROM jobs WHERE id = ${job_id}`;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const token = generateSignoffToken();
  const id = uid();
  const expiresAt = new Date(Date.now() + expiry_days * 86400 * 1000).toISOString();

  await sql`
    INSERT INTO client_signoffs
      (id, job_id, token, token_expires_at, status, pm_note, created_by)
    VALUES
      (${id}, ${job_id}, ${token}, ${expiresAt}, 'pending', ${pm_note ?? null}, ${session.name ?? session.username ?? "pm"})
  `;

  await logActivity({
    entityType: "job",
    entityId: job_id,
    jobId: job_id,
    eventType: "signoff_created",
    actor: session.name ?? session.username ?? "pm",
    actorRole: "pm",
    payload: { token_id: id, expires_at: expiresAt },
  }).catch(() => {});

  const url = signoffUrl(token);
  return NextResponse.json({ ok: true, token, url });
}
