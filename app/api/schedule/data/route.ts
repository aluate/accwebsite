/**
 * One-shot bootstrap for the schedule wall view (/schedule).
 *
 *   GET /api/schedule/data
 *
 * Returns: { crews, forwardEvents, onDeckEvents, jobs, ptoRows,
 *            today, windowStartIso, windowEndIso }
 *
 * IMPORTANT: queries run SEQUENTIALLY (not Promise.all) to avoid concurrent
 * connection demand. With max:3 pool and 12s polling, parallel queries exhaust
 * PgBouncer's 25-connection pool (5 concurrent Lambdas × 3 conns = 15 taken).
 * Sequential execution needs only 1 connection at a time → pool never depleted.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireBuilderApi } from "@/lib/auth";
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
  const builder = await requireBuilderApi();
  if (!builder) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const windowStartIso = isoDateOffset(today, -30);
  const windowEndIso   = isoDateOffset(today, 60);

  // Run sequentially — one DB connection at a time.
  // This prevents pool exhaustion when multiple Lambda invocations overlap.
  const TIMEOUT_MS = 9000;
  const deadline = Date.now() + TIMEOUT_MS;

  function checkTime(step: string) {
    if (Date.now() > deadline) throw new Error(`schedule/data timeout at ${step}`);
  }

  try {
    const crews = await listCrews({ activeOnly: true });
    checkTime("listCrews");

    const fwdEvents = await forwardEvents({ todayIso: today, windowDaysBack: 30, windowDaysForward: 60 });
    checkTime("forwardEvents");

    const deckEvents = await onDeckEvents();
    checkTime("onDeckEvents");

    const jobs = await sql<JobMini[]>`
      SELECT id, client_name, site_address, city, client_phone, client_email
      FROM jobs
      WHERE status <> 'complete'
         OR created_at > TO_CHAR(NOW() - INTERVAL '18 months', 'YYYY-MM-DD')
      ORDER BY created_at DESC
      LIMIT 300
    `;
    checkTime("jobs");

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

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[schedule/data] FAILED: ${msg}`);
    return NextResponse.json({ error: "schedule data unavailable", detail: msg }, { status: 503 });
  }
}
