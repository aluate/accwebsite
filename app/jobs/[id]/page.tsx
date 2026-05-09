export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { sql } from "@/lib/db";
import { JobFilesPanel } from "@/components/JobFilesPanel";
import { ReadyToScheduleButton } from "@/components/ReadyToScheduleButton";
import { requireBuilder } from "@/lib/auth";

const STATUS_STEPS = ["intake", "active", "production", "complete"];

const STATUS_COLOR: Record<string, string> = {
  intake:     "text-white/50 bg-white/10",
  active:     "text-blue-300 bg-blue-900/40",
  production: "text-yellow-300 bg-yellow-900/40",
  complete:   "text-green-300 bg-green-900/40",
  on_hold:    "text-orange-300 bg-orange-900/40",
};

const MODULE_DEFS = [
  { key: "mod_residential" as const, label: "Residential Cabinets", href: "residential", desc: "Express wizard or PM-built order" },
  { key: "mod_commercial"  as const, label: "Commercial Cabinets",  href: "commercial",  desc: "CV report → auto-priced" },
  { key: "mod_trim"        as const, label: "Trim Supply",          href: "trim",        desc: "Crown, base, case — any millwork" },
  { key: "mod_doors"       as const, label: "Doors",                href: "doors",       desc: "Supplier estimate" },
];

type Job = {
  id: string; seq: number; created_at: string; status: string; job_type: string;
  client_name: string; client_email: string; client_phone: string;
  site_address: string; city: string;
  pm: string; builder_name: string; builder_email: string;
  builder_phone: string; builder_company: string;
  delivery_date: string; notes: string;
  mod_residential: boolean; mod_commercial: boolean; mod_trim: boolean; mod_doors: boolean;
};

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireBuilder();
  const isAdmin = session.role === "admin";
  const [job] = await sql`SELECT * FROM jobs WHERE id = ${id}` as Job[];
  if (!job) notFound();

  const activeModules = MODULE_DEFS.filter((m) => job[m.key]);
  const inactiveModules = MODULE_DEFS.filter((m) => !job[m.key]);

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">

      <Link
        href="/jobs"
        className="font-condensed uppercase tracking-widest text-xs text-white/30 hover:text-[#f08122] transition-colors mb-8 block"
      >
        ← All Jobs
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-10">
        <div>
          <p className="font-condensed text-[#f08122] uppercase tracking-widest text-sm mb-1">{job.id}</p>
          <h1 className="font-heading text-3xl uppercase tracking-wide text-white">{job.client_name}</h1>
          <p className="text-white/50 text-sm mt-1">{job.site_address}{job.city ? `, ${job.city}` : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          {job.builder_name && (
            <span className="text-xs font-condensed uppercase tracking-widest rounded px-3 py-1 text-[#f08122] bg-[#f08122]/15 border border-[#f08122]/20">
              Express
            </span>
          )}
          <span className={`text-xs font-condensed uppercase tracking-widest rounded px-3 py-1 ${STATUS_COLOR[job.status] ?? STATUS_COLOR.intake}`}>
            {job.status}
          </span>
          <Link
            href={`/admin/jobs/${id}/portal`}
            className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs border border-white/15 hover:border-[#f08122] rounded px-3 py-1 transition-colors"
            title="Builder portal config"
          >
            Portal
          </Link>
          <Link
            href={`/jobs/${id}/edit`}
            className="text-white/40 hover:text-white font-condensed uppercase tracking-widest text-xs border border-white/15 rounded px-3 py-1 transition-colors"
          >
            Edit
          </Link>
        </div>
      </div>

      {/* Status pipeline */}
      <div className="flex mb-10 overflow-x-auto">
        {STATUS_STEPS.map((s, i) => {
          const isCurrent = job.status === s;
          const isPast = STATUS_STEPS.indexOf(job.status) > i;
          return (
            <div key={s} className={`flex-1 py-2 px-4 text-center text-[10px] font-condensed uppercase tracking-widest border-b-2 ${
              isCurrent ? "border-[#f08122] text-[#f08122]" :
              isPast    ? "border-white/20 text-white/20" :
                          "border-white/10 text-white/15"
            }`}>
              {s}
            </div>
          );
        })}
      </div>

      <div className="grid md:grid-cols-3 gap-8">

        <div className="md:col-span-1 space-y-6">
          <DetailCard title="Client">
            <Row label="Email"   value={job.client_email} href={`mailto:${job.client_email}`} />
            <Row label="Phone"   value={job.client_phone} href={`tel:${job.client_phone}`} />
            <Row label="Address" value={job.site_address} />
          </DetailCard>

          <DetailCard title="Project Manager">
            <Row label="PM" value={job.pm || "—"} />
          </DetailCard>

          <DetailCard title="Builder">
            <Row label="Name"    value={job.builder_name} />
            <Row label="Company" value={job.builder_company} />
            <Row label="Email"   value={job.builder_email} href={`mailto:${job.builder_email}`} />
            <Row label="Phone"   value={job.builder_phone} href={`tel:${job.builder_phone}`} />
          </DetailCard>

          {(job.delivery_date || job.notes) && (
            <DetailCard title="Notes">
              <Row label="Delivery" value={job.delivery_date} />
              {job.notes && <p className="text-white/60 text-sm leading-relaxed mt-2">{job.notes}</p>}
            </DetailCard>
          )}
        </div>

        <div className="md:col-span-2 space-y-4">
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs">Scope of Work</p>

          {activeModules.length > 0 && (
            <div className="space-y-2">
              {activeModules.map((m) => (
                <Link
                  key={m.key}
                  href={`/jobs/${id}/${m.href}`}
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

          <div className="mt-8 pt-6 border-t border-white/10 flex flex-wrap gap-3">
            <ReadyToScheduleButton jobId={id} />
            <button
              disabled
              className="bg-[#f08122]/20 text-[#f08122]/50 font-condensed uppercase tracking-widest text-sm py-2.5 px-5 rounded cursor-not-allowed"
            >
              Send DocuSign
            </button>
            <button
              disabled
              className="bg-white/5 text-white/20 font-condensed uppercase tracking-widest text-sm py-2.5 px-5 rounded cursor-not-allowed"
            >
              Release to Production
            </button>
          </div>

          {/* Schedule tab link */}
          <div className="mt-6 pt-4 border-t border-white/5">
            <Link
              href={`/jobs/${id}/schedule`}
              className="inline-flex items-center gap-2 text-xs font-condensed uppercase tracking-widest text-white/40 hover:text-[#f08122] border border-white/10 hover:border-[#f08122]/30 px-3 py-2 rounded transition-colors"
            >
              📅 Install Phases &amp; Schedule
            </Link>
          </div>

          {/* Phase 3a (2026-05): job-level file uploads */}
          <div className="mt-6">
            <JobFilesPanel jobId={id} isAdmin={isAdmin} />
          </div>
        </div>

      </div>
    </section>
  );
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#2d2d2d] rounded p-5">
      <p className="text-white/30 font-condensed uppercase tracking-widest text-[10px] mb-3">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value, href }: { label: string; value?: string; href?: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-white/30 text-[10px] font-condensed uppercase tracking-wider">{label}</p>
      {href ? (
        <a href={href} className="text-white text-sm hover:text-[#f08122] transition-colors">{value}</a>
      ) : (
        <p className="text-white text-sm">{value}</p>
      )}
    </div>
  );
}
