/**
 * One-shot bootstrap for the schedule wall view (/schedule).
 *
 *   GET /api/schedule/data
 *
 * Returns: { crews, forwardEvents, onDeckEvents, jobs }
 *
 * - crews: all active crews for filter chips + dropdowns
 * - forwardEvents: date_start IS NOT NULL events (calendar pane), with
 *   crew_name + job client_name pre-joined for direct rendering
 * - onDeckEvents: date_start IS NULL events (side column), same join shape
 * - jobs: minimal job list (id, client_name, site_address) so the
 *   "Add Event" form can dropdown without an extra round-trip
 *
 * Single fetch keeps wall-mount load fast and matches the /schedules-init
 * pattern used elsewhere in the app.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";
import { listCrews, forwardEvents, onDeckEvents } from "@/lib/schedule";

type JobMini = {
  id: string;
  client_name: string;
  site_address: string;
};

export async function GET(_req: NextRequest) {
  await requireBuilder();

  // Pull jobs (minimal shape) so the AddEvent form can dropdown them.
  // Show all jobs — even completed ones can have service callbacks.
  const jobs = await sql<JobMini[]>`
    SELECT id, client_name, site_address FROM jobs ORDER BY created_at DESC
  `;

  return NextResponse.json({
    crews:         await listCrews({ activeOnly: true }),
    forwardEvents: await forwardEvents(),     // default 7 days back, 90 days forward
    onDeckEvents:  await onDeckEvents(),
    jobs
  });
}
