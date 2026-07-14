/**
 * One-shot bootstrap for the schedule wall view (/schedule).
 *
 *   GET /api/schedule/data
 *
 * Returns: { crews, forwardEvents, onDeckEvents, jobs, ptoRows,
 *            today, windowStartIso, windowEndIso }
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
  const t0 = Date.now();
  console.log("[schedule/data] START");

  const builder = await requireBuilderApi();
  console.log(`[schedule/data] AUTH done ms=${Date.now()-t0} builder=${!!builder}`);
  if (!builder) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const windowStartIso = isoDateOffset(today, -30);
  const windowEndIso   = isoDateOffset(today, 60);

  console.log(`[schedule/data] Starting Promise.all ms=${Date.now()-t0}`);

  let crews: Awaited<ReturnType<typeof listCrews>>;
  let fwdEvents: Awaited<ReturnType<typeof forwardEvents>>;
  let deckEvents: Awaited<ReturnType<typeof onDeckEvents>>;
  let jobs: JobMini[];

  try {
    const results = await Promise.race([
      Promise.all([
        listCrews({ activeOnly: true }),
        forwardEvents({ todayIso: today, windowDaysBack: 30, windowDaysForward: 60 }),
        onDeckEvents(),
        sql<JobMini[]>`
          SELECT id, client_name, site_address, city, client_phone, client_email
          FROM jobs
          WHERE status <> 'complete'
             OR created_at > TO_CHAR(NOW() - INTERVAL '18 months', 'YYYY-MM-DD')
          ORDER BY created_at DESC
          LIMIT 300
        `,
      ]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("schedule/data Promise.all timed out after 8000ms")), 8000)
      ),
    ]);
    [crews, fwdEvents, deckEvents, jobs] = results;
    console.log(`[schedule/data] Promise.all done ms=${Date.now()-t0} crews=${crews.length} fwd=${fwdEvents.length} deck=${deckEvents.length} jobs=${jobs.length}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[schedule/data] Promise.all FAILED ms=${Date.now()-t0} err=${msg}`);
    return NextResponse.json({ error: "schedule data timeout", detail: msg }, { status: 503 });
  }

  let ptoRows: PtoWithCrew[] = [];
  try {
    const t1 = Date.now();
    ptoRows = (await sql`
      SELECT p.*, c.name AS crew_name
      FROM crew_pto p JOIN crews c ON c.id = p.crew_id
      ORDER BY p.date_start
    `) as unknown as PtoWithCrew[];
    console.log(`[schedule/data] PTO done ms=${Date.now()-t0} pto_ms=${Date.now()-t1} rows=${ptoRows.length}`);
  } catch (e) {
    console.warn(`[schedule/data] PTO query failed ms=${Date.now()-t0}`, e);
  }

  console.log(`[schedule/data] DONE ms=${Date.now()-t0}`);
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
