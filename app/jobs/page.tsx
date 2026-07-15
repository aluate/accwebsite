export const dynamic = "force-dynamic";

import Link from "next/link";
import { sql, withDbTimeout } from "@/lib/db";
import { getBuilder, type BuilderSession } from "@/lib/auth";
import { JobsClient } from "@/components/JobsClient";

type Job = Record<string, unknown>;

export type PipelineJob = {
  id: string;
  job_number: string | null;
  client_name: string;
  site_address: string;
  city: string | null;
  pm: string | null;
  status: string;
  open_punch_count: number;
  days_in_stage: number | null;
};

async function fetchPipelineJobs(): Promise<PipelineJob[]> {
  const rows = await withDbTimeout(() => sql<PipelineJob[]>`
    SELECT
      j.id,
      j.job_number,
      j.client_name,
      j.site_address,
      j.city,
      j.pm,
      j.status,
      COALESCE(p.open_count, 0)::int AS open_punch_count,
      DATE_PART('day', NOW() - al.occurred_at::timestamptz)::int AS days_in_stage
    FROM jobs j
    LEFT JOIN (
      SELECT job_id, COUNT(*) AS open_count
      FROM punch_list_items
      WHERE status = 'open'
      GROUP BY job_id
    ) p ON p.job_id = j.id
    LEFT JOIN LATERAL (
      SELECT occurred_at
      FROM activity_log
      WHERE job_id = j.id
        AND event_type = 'status_change'
      ORDER BY occurred_at DESC
      LIMIT 1
    ) al ON true
    WHERE j.status NOT IN ('complete')
    ORDER BY
      CASE j.status
        WHEN 'punch'       THEN 1
        WHEN 'install'     THEN 2
        WHEN 'delivery'    THEN 3
        WHEN 'production'  THEN 4
        WHEN 'procurement' THEN 5
        WHEN 'engineering' THEN 6
        WHEN 'field_dims'  THEN 7
        WHEN 'design'      THEN 8
        WHEN 'bid'         THEN 9
        WHEN 'intake'      THEN 10
        WHEN 'on_hold'     THEN 11
        ELSE 99
      END,
      j.client_name
  `);
  return rows;
}

export default async function JobsPage() {
  const [jobs, pipelineJobs, session] = await withDbTimeout(() => Promise.all([
    sql`SELECT * FROM jobs ORDER BY seq DESC` as Promise<Job[]>,
    fetchPipelineJobs(),
    getBuilder(),
  ]));

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-3xl uppercase tracking-wide text-white">Jobs</h1>
          <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mt-1">
            {jobs.length} total
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Link
            href="/search"
            className="text-white/40 font-condensed uppercase tracking-widest text-xs border border-white/15 rounded px-3 py-2 hover:border-white/30 transition-colors hidden sm:block"
          >
            Search
          </Link>
          {session && ["karl", "admin", "pm"].includes(session.role) && (
            <Link
              href="/punch"
              className="text-white/40 font-condensed uppercase tracking-widest text-xs border border-white/15 rounded px-3 py-2 hover:border-white/30 transition-colors hidden sm:block"
            >
              Punch
            </Link>
          )}
          {session && ["karl", "admin", "pm"].includes(session.role) && (
            <Link
              href="/warranty"
              className="text-white/40 font-condensed uppercase tracking-widest text-xs border border-white/15 rounded px-3 py-2 hover:border-white/30 transition-colors hidden sm:block"
            >
              Warranty
            </Link>
          )}
          {session && ["karl", "admin", "pm"].includes(session.role) && (
            <Link
              href="/dashboard"
              className="text-white/40 font-condensed uppercase tracking-widest text-xs border border-white/15 rounded px-3 py-2 hover:border-white/30 transition-colors hidden sm:block"
            >
              Dashboard
            </Link>
          )}
          {session && ["karl", "admin", "engineer"].includes(session.role) && (
            <Link
              href="/engineer"
              className="text-white/40 font-condensed uppercase tracking-widest text-xs border border-white/15 rounded px-3 py-2 hover:border-white/30 transition-colors hidden sm:block"
            >
              Engineering
            </Link>
          )}
          {session && ["karl", "admin", "installer"].includes(session.role) && (
            <Link
              href="/installer"
              className="text-white/40 font-condensed uppercase tracking-widest text-xs border border-white/15 rounded px-3 py-2 hover:border-white/30 transition-colors hidden sm:block"
            >
              Installer
            </Link>
          )}
          <Link
            href="/schedule"
            className="text-white/40 font-condensed uppercase tracking-widest text-xs border border-white/15 rounded px-3 py-2 hover:border-white/30 transition-colors hidden sm:block"
          >
            Schedule
          </Link>
          {session && ["karl", "admin", "pm"].includes(session.role) && (
            <Link
              href="/jobs/pm-hours"
              className="text-white/40 font-condensed uppercase tracking-widest text-xs border border-white/15 rounded px-3 py-2 hover:border-white/30 transition-colors hidden sm:block"
            >
              My Hours
            </Link>
          )}
          {session && ["karl", "admin", "pm"].includes(session.role) && (
            <Link
              href="/jobs/new"
              className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-sm py-2.5 px-5 rounded transition-colors"
            >
              + New Job
            </Link>
          )}
          {session && !["karl", "admin", "pm"].includes(session.role) && (
            <Link
              href="/jobs/new"
              className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-sm py-2.5 px-5 rounded transition-colors"
            >
              + New Job
            </Link>
          )}
        </div>
      </div>

      <JobsClient jobs={jobs} pipelineJobs={pipelineJobs} session={session} />
    </section>
  );
}
