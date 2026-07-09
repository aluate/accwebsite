export const dynamic = "force-dynamic";

/**
 * POST /api/schedule/change-requests        — PM submits removal request
 * PATCH /api/schedule/change-requests       — Karl approves or denies (body: { id, action: "approve"|"deny" })
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBuilder } from "@/lib/auth";
import { sql, uid } from "@/lib/db";

export async function POST(req: NextRequest) {
  const builder = await requireBuilder();
  const { job_event_id, reason } = (await req.json()) as {
    job_event_id?: string; reason?: string;
  };
  if (!job_event_id) return NextResponse.json({ ok: false, error: "job_event_id required" }, { status: 400 });
  if (!reason?.trim()) return NextResponse.json({ ok: false, error: "reason required" }, { status: 400 });

  const id  = uid();
  const now = new Date().toISOString();
  await sql`
    INSERT INTO schedule_change_requests (id, job_event_id, requested_by, reason, status, created_at)
    VALUES (${id}, ${job_event_id}, ${builder.id}, ${reason.trim()}, 'pending', ${now})
  `;
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(req: NextRequest) {
  const builder = await requireBuilder();
  if (builder.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  const { id, action } = (await req.json()) as { id?: string; action?: "approve" | "deny" };
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  if (!action || !["approve", "deny"].includes(action)) {
    return NextResponse.json({ ok: false, error: "action must be approve or deny" }, { status: 400 });
  }

  const now    = new Date().toISOString();
  const status = action === "approve" ? "approved" : "denied";

  await sql`
    UPDATE schedule_change_requests
    SET status = ${status}, reviewed_by = ${builder.id}, reviewed_at = ${now}
    WHERE id = ${id}
  `;

  // On approval: move the event back to On Deck (set date_start = NULL)
  if (action === "approve") {
    const [req_row] = await sql`SELECT job_event_id FROM schedule_change_requests WHERE id = ${id}`;
    if (req_row) {
      const updatedAt = new Date().toISOString();
      await sql`
        UPDATE job_events SET date_start = NULL, date_end = NULL, updated_at = ${updatedAt}, updated_by = ${builder.username}
        WHERE id = ${req_row.job_event_id}
      `;
    }
  }

  return NextResponse.json({ ok: true });
}
