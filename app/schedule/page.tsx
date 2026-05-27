export const dynamic = "force-dynamic";

import { requireBuilder } from "@/lib/auth";
import { sql, withDbTimeout } from "@/lib/db";
import { listCrews, forwardEvents, onDeckEvents, isoDateOffset } from "@/lib/schedule";
import { ScheduleWallClient } from "@/components/ScheduleWallClient";

export default async function SchedulePage() {
  const session = await requireBuilder();
  const isAdmin = session.role === "admin";
  const today = new Date().toISOString().slice(0, 10);

  const [crews, fwdEvents, deckEvents, jobs] = await withDbTimeout((signal) =>
    Promise.all([
      listCrews({ activeOnly: true }),
      forwardEvents({ todayIso: today, windowDaysBack: 30, windowDaysForward: 60 }),
      onDeckEvents(),
      sql({ signal })`SELECT id, client_name, site_address FROM jobs ORDER BY created_at DESC` as Promise<{ id: string; client_name: string; site_address: string }[]>,
    ]),
  );

  return (
    <ScheduleWallClient
      today={today}
      crews={crews}
      forwardEvents={fwdEvents}
      onDeckEvents={deckEvents}
      jobs={jobs}
      isAdmin={isAdmin}
      windowStartIso={isoDateOffset(today, -30)}
      windowEndIso={isoDateOffset(today, +60)}
    />
  );
}
