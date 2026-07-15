export const dynamic = "force-dynamic";

/**
 * GET /api/schedule/admin-queue
 * Returns Karl's scheduling admin queue:
 *   - jobs with On Deck events awaiting scheduling
 *   - pending schedule change requests
 *   - upcoming crew PTO entries
 */
import { NextResponse } from "next/server";
import { requireBuilder } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  const builder = await requireBuilder();
  if (builder.role !== "admin" && builder.role !== "karl" && role !== "karl") {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  const [onDeckJobs, changeRequests, pto] = await Promise.all([
    // Jobs with On Deck events (date_start IS NULL), grouped by job
    sql`
      SELECT je.job_id, j.client_name, j.site_address,
             COUNT(*) AS event_count,
             STRING_AGG(je.event_type, ', ' ORDER BY je.created_at) AS event_types,
             MAX(je.created_at) AS latest_at
      FROM job_events je
      JOIN jobs j ON j.id = je.job_id
      WHERE je.date_start IS NULL
      GROUP BY je.job_id, j.client_name, j.site_address
      ORDER BY latest_at DESC
    `,
    // Pending removal requests
    sql`
      SELECT scr.*, je.event_type, je.date_start, je.date_end,
             j.client_name AS job_client_name, j.id AS job_id,
             ba.name AS requester_name
      FROM schedule_change_requests scr
      JOIN job_events je ON je.id = scr.job_event_id
      JOIN jobs j ON j.id = je.job_id
      JOIN builder_accounts ba ON ba.id = scr.requested_by
      WHERE scr.status = 'pending'
      ORDER BY scr.created_at DESC
    `,
    // Upcoming PTO (from today forward)
    sql`
      SELECT p.*, c.name AS crew_name
      FROM crew_pto p
      JOIN crews c ON c.id = p.crew_id
      WHERE p.date_end >= CURRENT_DATE::text
      ORDER BY p.date_start
    `,
  ]);

  return NextResponse.json({
    ok: true,
    onDeckJobs,
    changeRequests,
    pto,
    totalPending: (onDeckJobs as unknown[]).length + (changeRequests as unknown[]).length,
  });
}
