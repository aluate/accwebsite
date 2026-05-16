export const dynamic = "force-dynamic";

/**
 * POST /api/jobs/[id]/gate-checkin
 *
 * Body: { outcome: "on_schedule" | "with_modifications", notes?: string }
 *
 * Records a PM gate check-in for the current stage of a job.
 * GET returns the last 10 check-ins for the job.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await requireBuilder();
  const { id } = await params;

  const checkins = await sql`
    SELECT id, stage, outcome, notes, created_by, created_at
    FROM gate_checkins
    WHERE job_id = ${id}
    ORDER BY created_at DESC
    LIMIT 10
  `;

  return NextResponse.json({ checkins });
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireBuilder();
  if (!["admin", "pm"].includes(session.role)) {
    return NextResponse.json({ error: "PM or admin required" }, { status: 403 });
  }

  const { id } = await params;
  const [job] = await sql`SELECT id, status FROM jobs WHERE id = ${id}` as Array<{ id: string; status: string }>;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const body = await req.json() as { outcome?: string; notes?: string };
  const outcome = body.outcome;
  if (!outcome || !["on_schedule", "with_modifications"].includes(outcome)) {
    return NextResponse.json({ error: "outcome must be on_schedule or with_modifications" }, { status: 400 });
  }

  const checkinId = uid();
  const actor = session.name ?? session.username ?? "pm";
  const now = new Date().toISOString();

  await sql`
    INSERT INTO gate_checkins (id, job_id, stage, outcome, notes, created_by, created_at)
    VALUES (${checkinId}, ${id}, ${job.status}, ${outcome}, ${body.notes ?? null}, ${actor}, ${now})
  `;

  await logActivity({
    entityType: "job",
    entityId: id,
    jobId: id,
    eventType: "gate_checkin",
    actor,
    actorRole: "pm",
    payload: { stage: job.status, outcome, notes: body.notes },
  }).catch(() => {});

  return NextResponse.json({ ok: true, id: checkinId });
}
