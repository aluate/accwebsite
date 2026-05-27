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
 * withDbTimeout wraps the Promise.all so the page fails fast (< 10 s)
 * if PgBouncer's pool is exhausted, rather than hanging 300 s until
 * Vercel kills the Lambda. The error.tsx boundary catches the throw and
 * shows a "database busy — try again" message.
 */
export default async function SchedulePage() {
  const session = await requireBuilder();
  const isAdmin = session.role === "admin";

  const today = new Date().toISOString().slice(0, 10);

  const [crews, fwdEvents, deckEvents, jobs] = await withDbTimeout(
    Promise.all([
      listCrews({ activeOnly: true }),
      forwardEvents({
        todayIso: today,
        windowDaysBack: 30,
        windowDaysForward: 60,
      }),
      onDeckEvents(),
      sql`SELECT id, client_name, site_address FROM jobs ORDER BY created_at DESC` as Promise<{ id: string; client_name: string; site_address: string }[]>,
    ]),
  );

  const data = {
    today,
    crews,
    forwardEvents: fwdEvents,
    onDeckEvents:  deckEvents,
    jobs,
    isAdmin,
    windowStartIso: isoDateOffset(today, -30),
    windowEndIso:   isoDateOffset(today, +60),
  };

  return <ScheduleWallClient {...data} />;
}
