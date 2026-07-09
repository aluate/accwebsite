export const dynamic = "force-dynamic";

/**
 * POST /api/schedule/ready
 * PM flags a job as ready-to-schedule. Creates two On Deck job_events:
 *   1. cab_delivery  (date_start = NULL)
 *   2. install       (date_start = NULL)
 *
 * Body: { job_id: string; note?: string }
 *
 * Both events inherit the PM's note and appear in Karl's On Deck column.
 * Already-existing On Deck events of those types are NOT duplicated.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBuilder } from "@/lib/auth";
import { createEvent } from "@/lib/schedule";
import { sql, uid } from "@/lib/db";

export async function POST(req: NextRequest) {
  const builder = await requireBuilder();
  const { job_id, note } = (await req.json()) as { job_id?: string; note?: string };

  if (!job_id) return NextResponse.json({ ok: false, error: "job_id required" }, { status: 400 });

  // Verify job exists
  const jobs = await sql`SELECT id FROM jobs WHERE id = ${job_id}`;
  if (!jobs.length) return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });

  const created: string[] = [];

  for (const event_type of ["cab_delivery", "install"] as const) {
    // Don't duplicate if an On Deck event of this type already exists
    const existing = await sql`
      SELECT id FROM job_events
      WHERE job_id = ${job_id} AND event_type = ${event_type} AND date_start IS NULL
      LIMIT 1
    `;
    if (existing.length > 0) continue;

    const result = await createEvent({
      job_id,
      event_type,
      date_start: null,
      date_end:   null,
      note:       note || null,
      actor:      builder.username,
    });

    if (result.ok) created.push(event_type);
  }

  return NextResponse.json({ ok: true, created });
}
