/**
 * One-shot bootstrap for the schedule wall view (/schedule).
 *
 *   GET /api/schedule/data
 *
 * Returns: { crews, forwardEvents, onDeckEvents, jobs, ptoRows,
 *            today, windowStartIso, windowEndIso }
 *
 * - crews: all active crews for filter chips + dropdowns
 * - forwardEvents: date_start IS NOT NULL events (calendar pane), with
 *   crew_name + job client_name pre-joined for direct rendering
 * - onDeckEvents: date_start IS NULL events (side column), same join shape
 * - jobs: minimal job list (id, client_name, site_address, city,
 *   client_phone, client_email) so the "Add Event" form + job detail
 *   modal can work without an extra round-trip
 * - ptoRows: crew PTO rows for the schedule window
 * - today / windowStartIso / windowEndIso: date context for the client
 *
 * Single fetch keeps wall-mount load fast.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";
import { listCrews, forwardEvents, onDeckEvents, isoDateOffset } from "@/lib/schedule";
import type { CrewPto } from "@/lib/schedule-types";

type JobMini = {
  id: string;
  client_name: string;
  site_address: string;
  city: string | null;
  client_phone: string | null;
  client_email: string | null;
};

type PtoWithCrew = CrewPto & { crew_name: string };

export async function GET() {
  await requireBuilder();

  const today = new Date().toISOString().slice(0, 10);
  const windowStartIso = isoDateOffset(today, -30);
  const windowEndIso   = isoDateOffset(today, 60);

  const [crews, fwdEvents, deckEvents, jobs] = await Promise.all([
    listCrews({ activeOnly: true }),
    forwardEvents({ todayIso: today, windowDaysBack: 30, windowDaysForward: 60 }),
    onDeckEvents(),
    sql<JobMini[]>`
      SELECT id, client_name, site_address, city, client_phone, client_email
      FROM jobs ORDER BY created_at DESC
    `,
  ]);

  let ptoRows: PtoWithCrew[] = [];
  try {
    ptoRows = (await sql`
      SELECT p.*, c.name AS crew_name
      FROM crew_pto p JOIN crews c ON c.id = p.crew_id
      ORDER BY p.date_start
    `) as unknown as PtoWithCrew[];
  } catch { /* crew_pto may not exist on older deployments */ }

  return NextResponse.json({
    today,
    crews,
    forwardEvents: fwdEvents,
    onDeckEvents:  deckEvents,
    jobs,
    ptoRows,
    windowStartIso,
    windowEndIso,
  });
}
