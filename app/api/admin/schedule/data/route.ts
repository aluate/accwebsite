export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";

/** Run a query with a hard timeout; return fallback if it times out or errors. */
async function safe<T>(query: Promise<T>, fallback: T, ms = 7000): Promise<T> {
  try {
    return await Promise.race([
      query,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);
  } catch {
    return fallback;
  }
}

export async function GET() {
  const builder = await requireBuilder();
  if (builder.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const [crews, pto, changeRequests, onDeckJobs] = await Promise.all([
    safe(sql`SELECT * FROM crews ORDER BY active DESC, name`, []),
    safe(sql`
      SELECT p.*, c.name AS crew_name
      FROM crew_pto p JOIN crews c ON c.id = p.crew_id
      WHERE p.date_end >= CURRENT_DATE::text
      ORDER BY p.date_start
    `, []),
    safe(sql`
      SELECT scr.*, je.event_type, je.date_start, je.date_end,
             j.client_name AS job_client_name, j.id AS job_id,
             ba.name AS requester_name
      FROM schedule_change_requests scr
      JOIN job_events je ON je.id = scr.job_event_id
      JOIN jobs j ON j.id = je.job_id
      JOIN builder_accounts ba ON ba.id = scr.requested_by
      WHERE scr.status = 'pending'
      ORDER BY scr.created_at DESC
    `, []),
    safe(sql`
      SELECT je.job_id, j.client_name, j.site_address,
             COUNT(*)::int AS event_count,
             STRING_AGG(je.event_type, ', ' ORDER BY je.created_at) AS event_types,
             MAX(je.note) AS note,
             MAX(je.created_at) AS latest_at
      FROM job_events je
      JOIN jobs j ON j.id = je.job_id
      WHERE je.date_start IS NULL
      GROUP BY je.job_id, j.client_name, j.site_address
      ORDER BY latest_at DESC
    `, []),
  ]);

  return NextResponse.json({ crews, pto, changeRequests, onDeckJobs });
}
