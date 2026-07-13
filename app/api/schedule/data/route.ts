export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql, withDbTimeout } from "@/lib/db";
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

  // Run in two batches to stay within the pool max (3 connections).
  // Batch 1: the two JOIN-heavy event queries + crews (3 at once).
  const [fwdEvents, deckEvents, crews] = await withDbTimeout(() =>
    Promise.all([
      forwardEvents({ todayIso: today, windowDaysBack: 30, windowDaysForward: 60 }),
      onDeckEvents(),
      listCrews({ activeOnly: true }),
    ]),
    12_000
  );

  // Batch 2: jobs + PTO (both simple).
  const [jobs, ptoRows] = await withDbTimeout(() =>
    Promise.all([
      sql<JobMini[]>`
        SELECT id, client_name, site_address, city, client_phone, client_email
        FROM jobs
        WHERE status <> 'complete'
           OR created_at > TO_CHAR(NOW() - INTERVAL '18 months', 'YYYY-MM-DD')
        ORDER BY created_at DESC
        LIMIT 300
      `,
      sql`
        SELECT p.*, c.name AS crew_name
        FROM crew_pto p JOIN crews c ON c.id = p.crew_id
        ORDER BY p.date_start
      `.catch(() => [] as PtoWithCrew[]),
    ]),
    12_000
  );

  return NextResponse.json({
    today,
    crews,
    forwardEvents: fwdEvents,
    onDeckEvents:  deckEvents,
    jobs,
    ptoRows: ptoRows as PtoWithCrew[],
    windowStartIso,
    windowEndIso,
  });
}
