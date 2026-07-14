/**
 * /installer — Mobile-first dashboard for installers.
 *
 * Two sections:
 *   1. Schedule events (TODAY / UPCOMING / RECENT) — install-type events from the calendar.
 *   2. Active Jobs board — ALL jobs in production/delivery/install/punch stage that
 *      are not yet complete. Installers frequently work jobs that aren't assigned to them.
 *
 * Tapping a card opens the job detail page (installer view) which includes
 * the punch list for that job.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getBuilder } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

type ActiveJob = {
  id: string;
  job_number: string | null;
  client_name: string;
  site_address: string;
  city: string | null;
  status: string;
  open_punch_count: number;
};

type InstallEvent = {
  id: string;
  job_id: string;
  event_type: string;
  description: string | null;
  date_start: string | null;
  date_end: string | null;
  status: string;
  note: string | null;
  crew_name: string | null;
  client_name: string;
  site_address: string;
  city: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  cab_delivery:      "Cab Delivery",
  top_delivery:      "Top Delivery",
  install:           "Install",
  punch:             "Punch",
  final_walkthrough: "Final Walkthrough",
  service:           "Service",
};

const TYPE_COLORS: Record<string, string> = {
  cab_delivery:      "bg-blue-900/60 text-blue-300",
  top_delivery:      "bg-indigo-900/60 text-indigo-300",
  install:           "bg-orange-900/60 text-[#f08122]",
  punch:             "bg-yellow-900/60 text-yellow-300",
  final_walkthrough: "bg-green-900/60 text-green-300",
  service:           "bg-purple-900/60 text-purple-300",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled:  "text-white/40",
  confirmed:  "text-green-400",
  on_hold:    "text-yellow-400",
  complete:   "text-white/25",
};

function formatDate(iso: string | null): string {
  if (!iso) return "TBD";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "TBD";
  if (!end || end === start) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchActiveJobs(crewId: string | null): Promise<ActiveJob[]> {
  if (crewId) {
    return sql<ActiveJob[]>`
      SELECT DISTINCT
        j.id, j.job_number, j.client_name, j.site_address, j.city, j.status,
        COALESCE(p.open_count, 0) AS open_punch_count
      FROM jobs j
      JOIN job_events je ON je.job_id = j.id
      JOIN event_crew ec ON ec.event_id = je.id AND ec.crew_member_id = ${crewId}
      LEFT JOIN (
        SELECT job_id, COUNT(*) AS open_count
        FROM punch_list_items
        WHERE status = 'open'
        GROUP BY job_id
      ) p ON p.job_id = j.id
      WHERE j.status NOT IN ('complete', 'cancelled', 'bid')
      ORDER BY j.client_name
    `;
  }
  return sql<ActiveJob[]>`
    SELECT
      j.id, j.job_number, j.client_name, j.site_address, j.city, j.status,
      COALESCE(p.open_count, 0) AS open_punch_count
    FROM jobs j
    LEFT JOIN (
      SELECT job_id, COUNT(*) AS open_count
      FROM punch_list_items
      WHERE status = 'open'
      GROUP BY job_id
    ) p ON p.job_id = j.id
    WHERE j.status IN ('production', 'delivery', 'install', 'punch')
    ORDER BY
      CASE j.status
        WHEN 'punch'      THEN 1
        WHEN 'install'    THEN 2
        WHEN 'delivery'   THEN 3
        WHEN 'production' THEN 4
      END,
      j.client_name
  `;
}

async function fetchEvents(crewId: string | null): Promise<InstallEvent[]> {
  const windowBack  = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const windowAhead = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  // If we have a crew ID, filter to assigned events only
  if (crewId) {
    return sql<InstallEvent[]>`
      SELECT
        je.id, je.job_id, je.event_type, je.description,
        je.date_start, je.date_end, je.status, je.note,
        c.name AS crew_name, j.client_name, j.site_address, j.city
      FROM job_events je
      JOIN event_crew ec ON ec.event_id = je.id AND ec.crew_member_id = ${crewId}
      JOIN jobs j ON j.id = je.job_id
      JOIN crews c ON c.id = ec.crew_member_id
      WHERE je.event_type IN ('install','cab_delivery','top_delivery','punch','final_walkthrough','service')
        AND (
          je.date_start IS NULL
          OR (
            COALESCE(je.date_end, je.date_start) >= ${windowBack}
            AND je.date_start <= ${windowAhead}
          )
        )
      ORDER BY
        CASE WHEN je.date_start IS NULL THEN 1 ELSE 0 END,
        je.date_start, je.event_type
    `;
  }
  // Fallback (admin): show all events
  const windowBack2  = windowBack;
  const windowAhead2 = windowAhead;
  return sql<InstallEvent[]>`
    SELECT
      je.id, je.job_id, je.event_type, je.description,
      je.date_start, je.date_end, je.status, je.note,
      c.name AS crew_name, j.client_name, j.site_address, j.city
    FROM job_events je
    JOIN jobs j ON j.id = je.job_id
    LEFT JOIN event_crew ec ON ec.event_id = je.id
    LEFT JOIN crews c ON c.id = ec.crew_member_id
    WHERE je.event_type IN ('install','cab_delivery','top_delivery','punch','final_walkthrough','service')
      AND (
        je.date_start IS NULL
        OR (
          COALESCE(je.date_end, je.date_start) >= ${windowBack2}
          AND je.date_start <= ${windowAhead2}
        )
      )
    ORDER BY
      CASE WHEN je.date_start IS NULL THEN 1 ELSE 0 END,
      je.date_start, je.event_type
  `;
}

function groupEvents(events: InstallEvent[], today: string) {
  const past: InstallEvent[]     = [];
  const todayEvts: InstallEvent[] = [];
  const upcoming: InstallEvent[] = [];
  const undated: InstallEvent[]  = [];

  for (const ev of events) {
    if (!ev.date_start) { undated.push(ev); continue; }
    const end = ev.date_end ?? ev.date_start;
    if (end < today)         { past.push(ev); }
    else if (ev.date_start <= today && end >= today) { todayEvts.push(ev); }
    else                     { upcoming.push(ev); }
  }

  return { past: past.slice(-5).reverse(), todayEvts, upcoming, undated };
}

function EventCard({ ev }: { ev: InstallEvent }) {
  const typeLabel  = TYPE_LABELS[ev.event_type]  ?? ev.event_type;
  const typeCls    = TYPE_COLORS[ev.event_type]  ?? "bg-white/10 text-white/60";
  const statusCls  = STATUS_COLORS[ev.status]    ?? "text-white/40";
  const location   = [ev.site_address, ev.city].filter(Boolean).join(", ");
  const mapsUrl    = location ? "https://maps.google.com/?q=" + encodeURIComponent(location) : null;

  return (
    <Link
      href={`/installer/jobs/${ev.job_id}`}
      className="block bg-white/5 border border-white/10 rounded-xl p-4 active:bg-white/10 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={`text-xs font-condensed uppercase tracking-wider px-2 py-0.5 rounded ${typeCls}`}>
          {typeLabel}
        </span>
        <span className={`text-xs font-condensed ${statusCls}`}>
          {ev.status}
        </span>
      </div>

      <p className="text-white font-medium text-base leading-tight">
        {ev.client_name}
      </p>
      {location && mapsUrl && (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-[#f08122] text-sm mt-0.5 underline underline-offset-2"
          onClick={(e) => e.stopPropagation()}
        >
          📍 {location}
        </a>
      )}
      {ev.description && (
        <p className="text-white/40 text-xs mt-1">{ev.description}</p>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span className="text-white/60 text-sm">
          {formatDateRange(ev.date_start, ev.date_end)}
        </span>
        {ev.crew_name && (
          <span className="text-white/30 text-xs font-condensed">
            {ev.crew_name}
          </span>
        )}
      </div>

      {ev.note && (
        <p className="mt-2 text-yellow-300/70 text-xs border-l-2 border-yellow-500/40 pl-2">
          {ev.note}
        </p>
      )}

      <p className="mt-3 text-[#f08122] text-xs font-condensed uppercase tracking-wider">
        View drawings →
      </p>
    </Link>
  );
}

function Section({ title, events }: { title: string; events: InstallEvent[] }) {
  if (events.length === 0) return null;
  return (
    <section>
      <h2 className="text-white/30 font-condensed uppercase tracking-[0.2em] text-xs mb-3 px-1">
        {title}
      </h2>
      <div className="space-y-3">
        {events.map((ev) => <EventCard key={ev.id} ev={ev} />)}
      </div>
    </section>
  );
}

const STATUS_STAGE: Record<string, string> = {
  production: "In Production",
  delivery:   "Out for Delivery",
  install:    "Install",
  punch:      "Punch",
};

const STAGE_COLORS: Record<string, string> = {
  production: "text-yellow-300 bg-yellow-900/30",
  delivery:   "text-amber-300 bg-amber-900/30",
  install:    "text-purple-300 bg-purple-900/30",
  punch:      "text-pink-300 bg-pink-900/30",
};

export default async function InstallerPage() {
  const session = await getBuilder();
  if (!session) redirect("/login");

  // Find this installer's crew record by email
  const crewRows = session.email
    ? await sql<{ id: string }[]>`SELECT id FROM crews WHERE contact_email = ${session.email} AND active = 1 LIMIT 1`.catch(() => [])
    : [];
  const crewId = crewRows[0]?.id ?? null;

  const [events, activeJobs] = await Promise.all([fetchEvents(crewId), fetchActiveJobs(crewId)]);
  const today  = todayIso();
  const { past, todayEvts, upcoming, undated } = groupEvents(events, today);

  return (
    <div className="min-h-screen bg-[#111] text-white">
      {/* Content */}
      <div className="px-4 py-5 space-y-7 max-w-lg mx-auto">
        {/* ── Active jobs board — all on-floor jobs ── */}
        {activeJobs.length > 0 && (
          <section>
            <h2 className="text-white/30 font-condensed uppercase tracking-[0.2em] text-xs mb-3 px-1">
              Active Jobs
            </h2>
            <div className="space-y-2">
              {activeJobs.map((job) => {
                const stageCls = STAGE_COLORS[job.status] ?? "text-white/40 bg-white/10";
                const stageLabel = STATUS_STAGE[job.status] ?? job.status;
                const location = [job.site_address, job.city].filter(Boolean).join(", ");
                return (
                  <Link
                    key={job.id}
                    href={`/installer/jobs/${job.id}`}
                    className="block bg-white/5 border border-white/10 rounded-xl p-4 active:bg-white/10 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className={`text-[10px] font-condensed uppercase tracking-wider px-2 py-0.5 rounded ${stageCls}`}>
                        {stageLabel}
                      </span>
                      {job.open_punch_count > 0 && (
                        <span className="text-[10px] font-condensed text-pink-400">
                          {job.open_punch_count} punch open
                        </span>
                      )}
                    </div>
                    <p className="text-white font-medium text-base leading-tight">{job.client_name}</p>
                    {location && (
                      <a
                        href={"https://maps.google.com/?q=" + encodeURIComponent(location)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-[#f08122] text-sm mt-0.5 underline underline-offset-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        📍 {location}
                      </a>
                    )}
                    {job.job_number && (
                      <p className="text-white/25 text-xs mt-1 font-condensed">#{job.job_number}</p>
                    )}
                    <p className="mt-2 text-[#f08122] text-xs font-condensed uppercase tracking-wider">
                      View drawings →
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Schedule events ── */}
        {events.length === 0 && activeJobs.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-white/20 font-condensed uppercase tracking-wider text-sm">
              No active jobs
            </p>
            <p className="text-white/10 text-xs mt-2">
              Check back when jobs are on the floor.
            </p>
          </div>
        ) : (
          <>
            <Section title="Today"    events={todayEvts} />
            <Section title="Upcoming" events={upcoming}  />
            <Section title="Not Yet Scheduled" events={undated} />
            <Section title="Recently Completed" events={past}  />
          </>
        )}


      </div>
    </div>
  );
}
