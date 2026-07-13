import { redirect } from "next/navigation";
import Link from "next/link";
import { getBuilder } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

type JobDetail = {
  id: string;
  job_number: string | null;
  client_name: string;
  site_address: string;
  city: string | null;
  status: string;
};

type InstallEvent = {
  id: string;
  event_type: string;
  description: string | null;
  date_start: string | null;
  date_end: string | null;
  status: string;
  note: string | null;
};

type StorageFile = {
  name: string;
  url: string;
};

const TYPE_LABELS: Record<string, string> = {
  cab_delivery: "Cab Delivery", top_delivery: "Top Delivery",
  install: "Install", punch: "Punch", final_walkthrough: "Final Walkthrough", service: "Service",
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

export default async function InstallerJobPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getBuilder();
  if (!session) redirect("/login");
  const { id: jobId } = await params;

  // Find the crew record linked to this user by email
  const crewRows = await sql<{ id: string }[]>`
    SELECT id FROM crews WHERE contact_email = ${session.email ?? ""} LIMIT 1
  `.catch(() => []);
  const crewId = crewRows[0]?.id ?? null;

  const [jobRows, eventsRaw] = await Promise.all([
    sql<JobDetail[]>`SELECT id, job_number, client_name, site_address, city, status FROM jobs WHERE id = ${jobId}`,
    sql<InstallEvent[]>`
      SELECT je.id, je.event_type, je.description, je.date_start, je.date_end, je.status, je.note
      FROM job_events je
      WHERE je.job_id = ${jobId}
        AND je.event_type IN ('install','cab_delivery','top_delivery','punch','final_walkthrough','service')
      ORDER BY
        CASE WHEN je.date_start IS NULL THEN 1 ELSE 0 END,
        je.date_start, je.event_type
    `,
  ]);

  const job = jobRows[0];
  if (!job) redirect("/installer");

  // Punch items
  const punchItems = await sql<{ id: string; description: string; status: string; resolved_at: string | null }[]>`
    SELECT id, description, status, resolved_at FROM punch_list_items
    WHERE job_id = ${jobId} ORDER BY status, created_at
  `.catch(() => []);

  const location = [job.site_address, job.city].filter(Boolean).join(", ");
  const openPunch = punchItems.filter((p) => p.status === "open");
  const resolvedPunch = punchItems.filter((p) => p.status !== "open");

  return (
    <div className="px-4 py-5 space-y-6">
      {/* Back */}
      <Link href="/installer" className="text-white/40 text-xs font-condensed uppercase tracking-wider hover:text-white transition-colors">
        ← My Jobs
      </Link>

      {/* Job header */}
      <div>
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.2em] text-xs mb-1">
          {job.job_number ? `#${job.job_number}` : job.id}
        </p>
        <h1 className="text-white text-2xl font-heading uppercase leading-tight">{job.client_name}</h1>
        {location && <p className="text-white/50 text-sm mt-1">{location}</p>}
        <span className="inline-block mt-2 text-[10px] font-condensed uppercase tracking-wider px-2 py-0.5 rounded bg-white/10 text-white/50">
          {job.status}
        </span>
      </div>

      {/* Events */}
      {eventsRaw.length > 0 && (
        <section>
          <h2 className="text-white/30 font-condensed uppercase tracking-[0.2em] text-xs mb-3">Schedule</h2>
          <div className="space-y-2">
            {eventsRaw.map((ev) => (
              <div
                key={ev.id}
                className="bg-white/5 border border-white/10 rounded-xl p-4"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-xs font-condensed uppercase tracking-wider bg-orange-900/30 text-[#f08122] px-2 py-0.5 rounded">
                    {TYPE_LABELS[ev.event_type] ?? ev.event_type}
                  </span>
                  <span className="text-xs text-white/40 font-condensed">{ev.status}</span>
                </div>
                <p className="text-white/80 text-sm">{formatDateRange(ev.date_start, ev.date_end)}</p>
                {ev.description && <p className="text-white/50 text-xs mt-1">{ev.description}</p>}
                {ev.note && (
                  <p className="mt-2 text-yellow-300/70 text-xs border-l-2 border-yellow-500/40 pl-2">{ev.note}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Punch items */}
      <section>
        <h2 className="text-white/30 font-condensed uppercase tracking-[0.2em] text-xs mb-3">
          Punch List {punchItems.length > 0 && `(${openPunch.length} open)`}
        </h2>
        {punchItems.length === 0 ? (
          <p className="text-white/20 text-sm italic">No punch items.</p>
        ) : (
          <div className="space-y-2">
            {openPunch.map((p) => (
              <div key={p.id} className="bg-red-900/20 border border-red-700/30 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <span className="text-red-400 text-xs font-condensed uppercase tracking-wider shrink-0 mt-0.5">Open</span>
                  <p className="text-white text-sm">{p.description}</p>
                </div>
              </div>
            ))}
            {resolvedPunch.map((p) => (
              <div key={p.id} className="bg-white/5 border border-white/5 rounded-xl p-3 opacity-50">
                <div className="flex items-start gap-2">
                  <span className="text-green-400 text-xs font-condensed uppercase tracking-wider shrink-0 mt-0.5">Done</span>
                  <p className="text-white/60 text-sm line-through">{p.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <div className="pt-4 border-t border-white/10">
        <Link
          href={`/jobs/${jobId}`}
          className="block text-center text-[#f08122] text-xs font-condensed uppercase tracking-wider py-2"
        >
          Full Job Detail →
        </Link>
      </div>
    </div>
  );
}
