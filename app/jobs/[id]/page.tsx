export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { sql } from "@/lib/db";
import { JobFilesPanel } from "@/components/JobFilesPanel";
import { PunchListPanel } from "@/components/PunchListPanel";
import { InvoicePanel } from "@/components/InvoicePanel";
import { WarrantyPanel } from "@/components/WarrantyPanel";
import { JobActionButtons } from "@/components/JobActionButtons";
import { StatusAdvanceButton } from "@/components/StatusAdvanceButton";
import { SignoffButton } from "@/components/SignoffButton";
import { ChangeOrdersPanel } from "@/components/ChangeOrdersPanel";
import { GateCheckinButton } from "@/components/GateCheckinButton";
import { EngineeringReleasePanel } from "@/components/EngineeringReleasePanel";
import { ReadyToScheduleButton } from "@/components/ReadyToScheduleButton";
import { JobInlineEditClient } from "@/components/JobInlineEditClient";
import { requireBuilder } from "@/lib/auth";
import { listActivityForJob, type ActivityRow } from "@/lib/activity-log";

const STATUS_STEPS = [
  "intake", "bid", "design", "field_dims",
  "engineering", "procurement",
  "production", "delivery",
  "install", "punch", "complete",
];

// Responsible party labels shown on the detail page badge
const STATUS_OWNER: Record<string, string> = {
  intake:      "PM",
  bid:         "PM",
  design:      "PM",
  field_dims:  "PM",
  engineering: "ENG",
  procurement: "ENG",
  production:  "PROD",
  delivery:    "DEL",
  install:     "INST",
  punch:       "PM",
  complete:    "PM",
  on_hold:     "—",
};

const STATUS_COLOR: Record<string, string> = {
  intake:      "text-white/50 bg-white/10",
  bid:         "text-sky-300 bg-sky-900/40",
  design:      "text-sky-300 bg-sky-900/40",
  field_dims:  "text-sky-300 bg-sky-900/40",
  engineering: "text-blue-300 bg-blue-900/40",
  procurement: "text-blue-300 bg-blue-900/40",
  production:  "text-yellow-300 bg-yellow-900/40",
  delivery:    "text-amber-300 bg-amber-900/40",
  install:     "text-purple-300 bg-purple-900/40",
  punch:       "text-pink-300 bg-pink-900/40",
  complete:    "text-green-300 bg-green-900/40",
  on_hold:     "text-orange-300 bg-orange-900/40",
};

const MODULE_DEFS = [
  { key: "mod_residential" as const, label: "Residential Cabinets", href: "residential", desc: "Express wizard or PM-built order" },
  { key: "mod_commercial"  as const, label: "Commercial Cabinets",  href: "commercial",  desc: "CV report → auto-priced" },
  { key: "mod_trim"        as const, label: "Trim Supply",          href: "trim",        desc: "Crown, base, case — any millwork" },
  { key: "mod_doors"       as const, label: "Doors",                href: "doors",       desc: "Supplier estimate" },
];

type Job = {
  id: string; seq: number; created_at: string; status: string; job_type: string;
  job_number: string | null;
  client_name: string; client_email: string; client_phone: string;
  site_address: string; city: string;
  pm: string; builder_name: string; builder_email: string;
  builder_phone: string; builder_company: string;
  delivery_date: string; notes: string;
  mod_residential: boolean; mod_commercial: boolean; mod_trim: boolean; mod_doors: boolean;
};

type JobEvent = {
  id: string;
  event_type: string;
  date_start: string | null;
  date_end: string | null;
  note: string | null;
  crew_name: string | null;
  status: string;
};

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireBuilder();
  const isAdmin = session.role === "admin";
  const isInstaller = session.role === "installer";

  const [job] = await sql`SELECT * FROM jobs WHERE id = ${id} OR job_number = ${id}` as Job[];
  if (!job) notFound();
  const internalId = job.id; // always use internal PK for subsequent queries

  // ON DECK state: true if ANY schedule events exist for this job (scheduled or not)
  const [{ count: eventCount }] = await sql`
    SELECT COUNT(*) AS count FROM job_events WHERE job_id = ${internalId}
  ` as [{ count: string }];
  const hasScheduleEvents = Number(eventCount) > 0;

  // Activity feed — best-effort (may be empty on first use, catches if table not yet in DB)
  let activityLog: ActivityRow[] = [];
  try { activityLog = await listActivityForJob(internalId, 30); } catch {}

  // ── Installer view — stripped down to essentials ──────────────────────────
  if (isInstaller) {
    const today = new Date().toISOString().slice(0, 10);
    const events = await sql<JobEvent[]>`
      SELECT je.id, je.event_type, je.date_start, je.date_end, je.note, je.status,
             c.name AS crew_name
      FROM job_events je
      LEFT JOIN crews c ON c.id = je.crew_id
      WHERE je.job_id = ${internalId}
        AND je.event_type IN ('install','cab_delivery','top_delivery','punch','final_walkthrough','service')
        AND (je.date_end IS NULL OR je.date_end >= ${today})
      ORDER BY je.date_start NULLS LAST
    `;

    const mapsUrl = "https://maps.apple.com/?q=" + encodeURIComponent([job.site_address, job.city].filter(Boolean).join(", "));
    const gmapsUrl = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([job.site_address, job.city].filter(Boolean).join(", "));

    return (
      <div className="min-h-screen bg-[#111] text-white">
        {/* Compact header */}
        <div className="sticky top-0 z-10 bg-[#111]/95 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center gap-3">
          <Link href="/installer" className="text-white/40 hover:text-[#f08122] transition-colors text-sm">
            ← My Jobs
          </Link>
          <span className="text-white/15">|</span>
          <span className="text-[#f08122] font-condensed uppercase tracking-widest text-xs">Job #{job.job_number ?? job.id}</span>
        </div>

        <div className="px-4 py-5 max-w-lg mx-auto space-y-5">
          {/* Client + address */}
          <div>
            <h1 className="font-heading text-2xl uppercase tracking-wide text-white">{job.client_name}</h1>
            {(job.site_address || job.city) && (
              <div className="mt-2 flex gap-2">
                <a
                  href={mapsUrl}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white/80 hover:text-white hover:border-white/20 transition-colors"
                >
                  📍 {[job.site_address, job.city].filter(Boolean).join(", ")}
                  <span className="block text-[#f08122] text-[10px] font-condensed uppercase tracking-widest mt-1">Open in Maps →</span>
                </a>
                <a
                  href={gmapsUrl}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-3 text-white/40 hover:text-white hover:border-white/20 transition-colors text-xs font-condensed uppercase tracking-widest flex items-center"
                >
                  G
                </a>
              </div>
            )}
          </div>

          {/* Upcoming events */}
          {events.length > 0 && (
            <div>
              <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mb-2">Your Schedule</p>
              <div className="space-y-2">
                {events.map((ev) => {
                  const dateStr = ev.date_start
                    ? ev.date_end && ev.date_end !== ev.date_start
                      ? ev.date_start + " – " + ev.date_end
                      : ev.date_start
                    : "TBD";
                  const TYPE_LABELS: Record<string, string> = {
                    install: "Install", cab_delivery: "Cab Delivery",
                    top_delivery: "Top Delivery", punch: "Punch",
                    final_walkthrough: "Final Walkthrough", service: "Service",
                  };
                  return (
                    <div key={ev.id} className="bg-white/5 border border-white/10 rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[#f08122] text-[10px] font-condensed uppercase tracking-widest">
                          {TYPE_LABELS[ev.event_type] ?? ev.event_type}
                        </span>
                        <span className="text-white/30 text-[10px] font-condensed">{ev.status}</span>
                      </div>
                      <p className="text-white/70 text-sm">{dateStr}</p>
                      {ev.crew_name && <p className="text-white/40 text-xs mt-0.5">👷 {ev.crew_name}</p>}
                      {ev.note && (
                        <p className="mt-2 text-yellow-300/70 text-xs border-l-2 border-yellow-500/40 pl-2">{ev.note}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Punch list — all active items this installer can action */}
          <PunchListPanel jobId={internalId} role={session.role} />

          {/* Photo upload — site kind pre-selected */}
          <JobFilesPanel jobId={internalId} isAdmin={false} defaultKind="09_site_photos" />
        </div>
      </div>
    );
  }

  // ── PM / Admin / Engineer view ────────────────────────────────────────────
  const activeModules = MODULE_DEFS.filter((m) => job[m.key]);
  const inactiveModules = MODULE_DEFS.filter((m) => !job[m.key]);

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-6">

      <Link
        href="/jobs"
        className="font-condensed uppercase tracking-widest text-xs text-white/30 hover:text-[#f08122] transition-colors mb-6 block"
      >
        ← All Jobs
      </Link>

      {/* B.2 — Engineering in-app indicator */}
      {(job.status === "engineering" || job.status === "procurement") && (
        <div className="mb-6 flex items-center justify-between gap-4 bg-blue-900/20 border border-blue-700/30 rounded-lg px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-blue-400 text-xs font-condensed uppercase tracking-widest">
              {job.status === "engineering" ? "Waiting for Engineering" : "In Procurement"}
            </span>
            <span className="text-white/20 text-xs">·</span>
            <span className="text-white/40 text-xs">
              {job.status === "engineering"
                ? "Spec released — engineer queue has this job."
                : "WO placed — awaiting materials."}
            </span>
          </div>
          <Link
            href="/engineer"
            className="text-blue-400 hover:text-blue-300 text-xs font-condensed uppercase tracking-wider transition-colors shrink-0"
          >
            Engineering Queue →
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <p className="font-condensed text-[#f08122] uppercase tracking-widest text-sm mb-1">Job #{job.job_number ?? job.id}</p>
          <h1 className="font-heading text-3xl uppercase tracking-wide text-white">{job.client_name}</h1>
          <p className="text-white/50 text-sm mt-1">{job.site_address}{job.city ? ", " + job.city : ""}</p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            {job.builder_name && (
              <span className="text-xs font-condensed uppercase tracking-widest rounded px-3 py-1 text-[#f08122] bg-[#f08122]/15 border border-[#f08122]/20">
                SPEC
              </span>
            )}
            <span className={"text-xs font-condensed uppercase tracking-widest rounded px-3 py-1 " + (STATUS_COLOR[job.status] ?? STATUS_COLOR.intake)}>
              {job.status?.replace(/_/g, " ")}
              {STATUS_OWNER[job.status] && <span className="ml-1 opacity-60">· {STATUS_OWNER[job.status]}</span>}
            </span>
            <Link
              href={"/admin/jobs/" + id + "/portal"}
              className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs border border-white/15 hover:border-[#f08122] rounded px-3 py-1.5 transition-colors"
            >
              Portal
            </Link>
            <Link
              href={"/jobs/" + id + "/edit"}
              className="text-white/40 hover:text-white font-condensed uppercase tracking-widest text-xs border border-white/15 rounded px-3 py-1.5 transition-colors"
            >
              Edit
            </Link>
          </div>
        )}
        {!isAdmin && (
          <div className="flex items-center gap-2">
            {job.builder_name && (
              <span className="text-xs font-condensed uppercase tracking-widest rounded px-3 py-1 text-[#f08122] bg-[#f08122]/15 border border-[#f08122]/20">
                SPEC
              </span>
            )}
            <span className={"text-xs font-condensed uppercase tracking-widest rounded px-3 py-1 " + (STATUS_COLOR[job.status] ?? STATUS_COLOR.intake)}>
              {job.status?.replace(/_/g, " ")}
              {STATUS_OWNER[job.status] && <span className="ml-1 opacity-60">· {STATUS_OWNER[job.status]}</span>}
            </span>
            <Link
              href={"/jobs/" + id + "/edit"}
              className="text-white/40 hover:text-white font-condensed uppercase tracking-widest text-xs border border-white/15 rounded px-3 py-1.5 transition-colors"
            >
              Edit
            </Link>
          </div>
        )}
      </div>

      {/* Status pipeline */}
      <div className="flex mb-8 overflow-x-auto">
        {STATUS_STEPS.map((s, i) => {
          const isCurrent = job.status === s;
          const isPast = STATUS_STEPS.indexOf(job.status) > i;
          return (
            <div key={s} className={"flex-1 py-2 px-4 text-center text-[10px] font-condensed uppercase tracking-widest border-b-2 " + (
              isCurrent ? "border-[#f08122] text-[#f08122]" :
              isPast    ? "border-white/20 text-white/20" :
                          "border-white/10 text-white/15"
            )}>
              {s.replace(/_/g, " ")}
            </div>
          );
        })}
      </div>

      <div className="grid md:grid-cols-3 gap-8">

        <div className="md:col-span-1 space-y-6">
          <JobInlineEditClient
            jobId={internalId}
            initialValues={{
              client_name:    job.client_name,
              client_email:   job.client_email,
              client_phone:   job.client_phone,
              site_address:   job.site_address,
              city:           job.city,
              pm:             job.pm,
              job_number:     job.job_number,
              builder_name:   job.builder_name,
              builder_company: job.builder_company,
              builder_email:  job.builder_email,
              builder_phone:  job.builder_phone,
              delivery_date:  job.delivery_date,
              notes:          job.notes,
            }}
          />
        </div>

        <div className="md:col-span-2 space-y-4">
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs">Scope of Work</p>

          {activeModules.length > 0 && (
            <div className="space-y-2">
              {activeModules.map((m) => (
                <Link
                  key={m.key}
                  href={"/jobs/" + internalId + "/" + m.href}
                  className="flex items-center justify-between bg-[#2d2d2d] hover:bg-[#353535] rounded p-4 transition-colors group"
                >
                  <div>
                    <p className="text-white text-sm font-medium">{m.label}</p>
                    <p className="text-white/40 text-xs mt-0.5">{m.desc}</p>
                  </div>
                  <span className="text-white/20 group-hover:text-[#f08122] transition-colors text-lg">→</span>
                </Link>
              ))}
            </div>
          )}

          {inactiveModules.length > 0 && (
            <div className="space-y-2">
              <p className="text-white/20 font-condensed uppercase tracking-widest text-[10px] mt-4">Not in scope</p>
              {inactiveModules.map((m) => (
                <div key={m.key} className="flex items-center justify-between bg-[#252525] rounded p-4 opacity-40">
                  <p className="text-white/50 text-sm">{m.label}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-white/10 flex flex-wrap gap-3 items-start">
            <StatusAdvanceButton jobId={id} currentStatus={job.status} />
            {(session.role === "admin" || session.role === "pm") && (
              <SignoffButton jobId={internalId} />
            )}
            {(session.role === "admin" || session.role === "pm") && (
              <GateCheckinButton jobId={internalId} currentStage={job.status} />
            )}
            {(session.role === "admin" || session.role === "user") && (
              <ReadyToScheduleButton jobId={internalId} initialOnDeck={hasScheduleEvents} />
            )}
            <JobActionButtons
              jobId={internalId}
              jobStatus={job.status}
              clientEmail={job.client_email}
              canManage={session.role === "admin" || session.role === "pm"}
            />
          </div>

          <div className="mt-6 pt-4 border-t border-white/5">
            <Link
              href={"/jobs/" + id + "/schedule"}
              className="inline-flex items-center gap-2 text-xs font-condensed uppercase tracking-widest text-white/40 hover:text-[#f08122] border border-white/10 hover:border-[#f08122]/30 px-3 py-2 rounded transition-colors"
            >
              📅 Install Phases & Schedule
            </Link>
          </div>

          {(session.role === "admin" || session.role === "pm") && (
            <EngineeringReleasePanel jobId={internalId} />
          )}

          <div className="mt-6">
            <JobFilesPanel jobId={internalId} isAdmin={isAdmin} />
          </div>

          <div className="mt-6 pt-4 border-t border-white/5">
            <PunchListPanel jobId={internalId} role={session.role} />
          </div>

          {(session.role === "admin" || session.role === "pm") && (
            <div className="mt-6 pt-4 border-t border-white/5">
              <ChangeOrdersPanel jobId={internalId} role={session.role} />
            </div>
          )}

          {(session.role === "admin" || session.role === "pm") && (
            <div className="mt-6 pt-4 border-t border-white/5">
              <p className="text-[10px] font-condensed uppercase tracking-widest text-white/30 mb-3">Billing</p>
              <InvoicePanel jobId={internalId} canManage={true} />
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-white/5">
            <p className="text-[10px] font-condensed uppercase tracking-widest text-white/30 mb-3">Warranty / Callbacks</p>
            <WarrantyPanel jobId={internalId} />
          </div>

          {/* Activity Feed */}
          {activityLog.length > 0 && (
            <div className="mt-6 pt-4 border-t border-white/5">
              <p className="text-[10px] font-condensed uppercase tracking-widest text-white/30 mb-3">Activity</p>
              <div className="space-y-1">
                {activityLog.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-2 text-xs text-white/50 py-1">
                    <span className="shrink-0 w-32 text-white/25 tabular-nums" suppressHydrationWarning>
                      {new Date(ev.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}{" "}{new Date(ev.occurred_at).toISOString().slice(11, 16)}{" UTC"}
                    </span>
                    <span className="shrink-0 w-20 text-white/30">{ev.actor}</span>
                    <span className="flex-1">
                      {ev.event_type === "status_change" ? (
                        <><span className="text-white/60">{ev.entity_type}</span> {ev.from_state} → <span className="text-[#f08122]">{ev.to_state}</span></>
                      ) : ev.event_type === "created" ? (
                        <span className="text-green-400/70">created</span>
                      ) : ev.event_type === "updated" ? (
                        <><span className="text-white/60">{ev.entity_type}</span> updated</>
                      ) : (
                        <><span className="text-white/60">{ev.entity_type}</span> {ev.event_type}</>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </section>
  );
}

function DetailCard({ title, children }: { title: string; children