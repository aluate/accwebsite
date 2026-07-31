export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireBuilderApi } from "@/lib/auth";

export type TimelineJob = {
  id: string;
  job_number: string | null;
  client_name: string;
  site_address: string;
  city: string | null;
  delivery_date: string | null;
  install_start_date: string | null;
  install_hrs: number | null;
  status: string;
};

export type TimelineEvent = {
  id: string;
  job_id: string;
  job_number: string | null;
  client_name: string;
  event_type: string;
  date_start: string | null;
  date_end: string | null;
  note: string | null;
  status: string | null;
};

export type TimelineResponse = {
  jobs: TimelineJob[];
  events: TimelineEvent[];
  today: string;
};

export async function GET() {
  const builder = await requireBuilderApi();
  if (!builder) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);

  // Wide window: 6 months back to 18 months forward
  const wStart = new Date();
  wStart.setMonth(wStart.getMonth() - 6);
  const wEnd = new Date();
  wEnd.setMonth(wEnd.getMonth() + 18);
  const windowStartIso = wStart.toISOString().slice(0, 10);
  const windowEndIso   = wEnd.toISOString().slice(0, 10);

  // Active jobs that have at least one date to display
  const jobs = await sql<TimelineJob[]>`
    SELECT id, job_number, client_name, site_address, city,
           delivery_date, install_start_date, install_hrs, status
    FROM jobs
    WHERE status NOT IN ('complete', 'cancelled')
      AND (delivery_date IS NOT NULL OR install_start_date IS NOT NULL)
    ORDER BY COALESCE(install_start_date, delivery_date) ASC NULLS LAST
  `;

  // Confirmed schedule events in window
  const events = await sql<TimelineEvent[]>`
    SELECT je.id, je.job_id,
           j.job_number, j.client_name,
           je.event_type, je.date_start, je.date_end,
           je.note, je.status
    FROM job_events je
    JOIN jobs j ON j.id = je.job_id
    WHERE je.date_start IS NOT NULL
      AND je.date_start >= ${windowStartIso}
      AND je.date_start <= ${windowEndIso}
    ORDER BY je.date_start
  `;

  return NextResponse.json({ jobs, events, today } satisfies TimelineResponse);
}
