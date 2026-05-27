export const dynamic = "force-dynamic";

import { requireBuilder } from "@/lib/auth";
import { sql, withDbTimeout } from "@/lib/db";
import { listCrews, forwardEvents, onDeckEvents, isoDateOffset } from "@/lib/schedule";
import { ScheduleWallClient } from "@/components/ScheduleWallClient";

/**
 * Wall calendar page — the office TV display.
 *
 *   /schedule
 *
 * Server-rendered initial state for fast wall-mount load. Data fetched
 * directly via lib/schedule (no API round-trip). The client component
 * handles layout + future drag/drop interactions.
 *
 * Default window: today minus 30 days through today plus 60 days.
 *
 * Auth and all data queries are wrapped in a single withDbTimeout so that
 * PgBouncer pool exhaustion fails fast (~8 s) and shows the error boundary
 * instead of hanging for 300 s (Vercel Lambda timeout).
 */
export default async function SchedulePage() {
  const today = new Date().toISOString().slice(0, 10);

  // Single 8-second window covers auth + all data.
  // requireBuilder() has no AbortSignal support internally, but Promise.race
  // inside withDbTimeout ensures we always respond within the deadline.
  const [session, crews, fwdEvents, deckEvents, jobs] = await withDbTimeout(
    (signal) =>
      Promise.all([
        requireBuilder(),
        listCrews({ activeOnly: true }),
        forwardEvents({
          todayIso: today,
          windowDaysBack: 30,
          windowDaysForward: 60,
        }),
        onDeckEvents(),
        sql({ signal })`SELECT id, client_name, site_address FROM jobs ORDER BY created_at DESC` as Promise<
          { id: string; client_name: string; site_address: string }[]
        >,
      ]),
  );

  const isAdmin = session.role === "admin";

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
