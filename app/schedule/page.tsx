export const dynamic = "force-dynamic";

import { requireBuilder } from "@/lib/auth";
import { sql } from "@/lib/db";
import { listCrews, forwardEvents, onDeckEvents, isoDateOffset } from "@/lib/schedule";
import type { CrewPto } from "@/lib/schedule-types";
import { ScheduleWallClient } from "@/components/ScheduleWallClient";

export default async function SchedulePage() {
  const session = await requireBuilder();
  const isAdmin = session.role === "admin";

  const today = new Date().toISOString().slice(0, 10);

  const [crews, fwdEvents, deckEvents, jobs] = await Promise.all([
    listCrews({ activeOnly: true }),
    forwardEvents({ todayIso: today, windowDaysBack: 30, windowDaysForward: 60 }),
    onDeckEvents(),
    sql`SELECT id, client_name, site_address, city, client_phone, client_email FROM jobs ORDER BY created_at DESC` as Promise<{ id: string; client_name: string; site_address: string; city: string | null; client_phone: string | null; client_email: string | null }[]>,
  ]);

  type PtoWithCrew = CrewPto & { crew_name: string };
  let ptoRows: PtoWithCrew[] = [];
  try {
    ptoRows = (await sql`
      SELECT p.*, c.name AS crew_name
      FROM crew_pto p JOIN crews c ON c.id = p.crew_id
      ORDER BY p.date_start
    `) as unknown as PtoWithCrew[];
  } catch { /* crew_pto may not exist on older deployments */ }

  const data = {
    today,
    crews,
    forwardEvents: fwdEvents,
    onDeckEvents:  deckEvents,
    jobs,
    ptoRows,
    isAdmin,
    windowStartIso: isoDateOffset(today, -30),
    windowEndIso:   isoDateOffset(today, 60),
  };

  return <ScheduleWallClient {...data} />;
}
