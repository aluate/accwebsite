"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { PipelineJob } from "@/app/jobs/page";
import type { BuilderSession } from "@/lib/auth";

const STATUS_COLOR: Record<string, string> = {
  intake:      "text-white/40 bg-white/10",
  bid:         "text-sky-300 bg-sky-900/30",
  design:      "text-sky-300 bg-sky-900/30",
  field_dims:  "text-sky-300 bg-sky-900/30",
  engineering: "text-blue-300 bg-blue-900/30",
  procurement: "text-blue-300 bg-blue-900/30",
  production:  "text-yellow-300 bg-yellow-900/30",
  delivery:    "text-amber-300 bg-amber-900/30",
  install:     "text-purple-300 bg-purple-900/30",
  punch:       "text-pink-300 bg-pink-900/30",
  complete:    "text-green-300 bg-green-900/30",
  on_hold:     "text-orange-300 bg-orange-900/30",
};

const STATUS_LABEL: Record<string, string> = {
  intake:      "Intake",
  bid:         "Bid",
  design:      "Design",
  field_dims:  "Field Dims",
  engineering: "Engineering",
  procurement: "Procurement",
  production:  "Production",
  delivery:    "Delivery",
  install:     "Install",
  punch:       "Punch",
  complete:    "Complete",
  on_hold:     "On Hold",
};

const PIPELINE_ORDER = [
  "punch", "install", "delivery", "production",
  "procurement", "engineering", "field_dims", "design", "bid", "intake",
  "on_hold",
];

const MODULE_LABELS: Record<string, string> = {
  mod_residential: "Resi",
  mod_commercial:  "Comm",
  mod_trim:        "Trim",
  mod_doors:       "Doors",
};

const STATUSES = [
  "intake", "bid", "design", "field_dims",
  "engineering", "procurement",
  "production", "delivery",
  "install", "punch", "complete", "on_hold",
];

type Job = Record<string, unknown>;
type SortKey = "newest" | "oldest" | "client_az" | "client_za" | "delivery_asc";

function distinctPMs(jobs: Job[]): string[] {
  const set = new Set<string>();
  for (const j of jobs) {
    const pm = j.pm as string | null;
    if (pm?.trim()) set.add(pm.trim());
  }
  return [...set].sort();
}

function distinctPMsPipeline(jobs: PipelineJob[]): string[] {
  const set = new Set<string>();
  for (const j of jobs) {
    if (j.pm?.trim()) set.add(j.pm.trim());
  }
  return [...set].sort();
}

// ── All Jobs tab ──────────────────────────────────────────────────────────────

function AllJobsTab({ jobs }: { jobs: Job[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pmFilter, setPmFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const pms = useMemo(() => distinctPMs(jobs), [jobs]);

  const filtered = useMemo(() => {
    let result = [...jobs];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((job) =>
        (job.job_number as string)?.toLowerCase().includes(q) ||
        (job.id as string)?.toLowerCase().includes(q) ||
        (job.client_name as string)?.toLowerCase().includes(q) ||
        (job.site_address as string)?.toLowerCase().includes(q) ||
        (job.city as string)?.toLowerCase().includes(q) ||
        (job.pm as string)?.toLowerCase().includes(q) ||
        (job.builder_name as string)?.toLowerCase().includes(q) ||
        (job.builder_company as string)?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") {
      result = result.filter((job) => job.status === statusFilter);
    }
    if (pmFilter === "__none__") {
      result = result.filter((job) => !(job.pm as string)?.trim());
    } else if (pmFilter !== "all") {
      result = result.filter((job) => (job.pm as string)?.trim() === pmFilter);
    }
    result.sort((a, b) => {
      if (sort === "newest")       return (b.seq as number) - (a.seq as number);
      if (sort === "oldest")       return (a.seq as number) - (b.seq as number);
      if (sort === "client_az")    return ((a.client_name as string) || "").localeCompare((b.client_name as string) || "");
      if (sort === "client_za")    return ((b.client_name as string) || "").localeCompare((a.client_name as string) || "");
      if (sort === "delivery_asc") {
        const da = (a.delivery_date as string) || "9999";
        const db = (b.delivery_date as string) || "9999";
        return da.localeCompare(db);
      }
      return 0;
    });
    return result;
  }, [jobs, search, statusFilter, pmFilter, sort]);

  const isFiltered = search || statusFilter !== "all" || pmFilter !== "all";

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search job #, client, address, builder, PM..."
          className="flex-1 bg-white/5 border border-white/15 rounded px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#f08122]/60"
        />
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-[#1c1c1c] border border-white/15 rounded px-3 py-2 text-white text-sm font-condensed uppercase tracking-wide focus:outline-none focus:border-[#f08122]/60 cursor-pointer"
        >
          <option value="all">All Phases</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s] ?? s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <select
          value={pmFilter}
          onChange={(e) => setPmFilter(e.target.value)}
          className="bg-[#1c1c1c] border border-white/15 rounded px-3 py-2 text-white text-sm font-condensed uppercase tracking-wide focus:outline-none focus:border-[#f08122]/60 cursor-pointer"
        >
          <option value="all">All PMs</option>
          {pms.map((pm) => (
            <option key={pm} value={pm}>{pm}</option>
          ))}
          <option value="__none__">No PM assigned</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="bg-[#1c1c1c] border border-white/15 rounded px-3 py-2 text-white text-sm font-condensed uppercase tracking-wide focus:outline-none focus:border-[#f08122]/60 cursor-pointer"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="client_az">Client A to Z</option>
          <option value="client_za">Client Z to A</option>
          <option value="delivery_asc">Delivery Date</option>
        </select>
        {isFiltered && (
          <button
            onClick={() => { setSearch(""); setStatusFilter("all"); setPmFilter("all"); }}
            className="text-white/30 hover:text-[#f08122] text-xs font-condensed uppercase tracking-wider transition-colors px-2"
          >
            Clear
          </button>
        )}
      </div>
      {isFiltered && (
        <p className="text-white/30 text-xs font-condensed uppercase tracking-widest mb-4">
          {filtered.length} of {jobs.length} jobs
        </p>
      )}
      {filtered.length === 0 ? (
        <div className="text-center py-24 text-white/20 font-condensed uppercase tracking-widest text-sm">
          {jobs.length === 0 ? "No jobs yet." : "No jobs match your filters."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((job) => {
            const statusCls = STATUS_COLOR[job.status as string] ?? "text-white/40 bg-white/10";
            const statusTxt = STATUS_LABEL[job.status as string] ?? (job.status as string)?.replace(/_/g, " ");
            const location = [job.site_address, job.city].filter(Boolean).join(", ");
            return (
              <Link
                key={job.id as string}
                href={"/jobs/" + ((job.job_number as string) || (job.id as string))}
                prefetch={false}
                className="flex items-center gap-4 bg-[#2d2d2d] hover:bg-[#353535] rounded px-5 py-4 transition-colors group"
              >
                <span className="font-condensed text-[#f08122] text-sm w-24 shrink-0">
                  {(job.job_number as string) || <span className="text-white/20 italic">no #</span>}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{location}</p>
                  <p className="text-white/40 text-xs truncate">{job.client_name as string}</p>
                </div>
                <span className="text-white/50 text-xs hidden md:block w-32 shrink-0 truncate">
                  {(job.pm as string) || "—"}
                </span>
                <div className="hidden sm:flex gap-1 shrink-0 items-center">
                  {job.builder_name ? (
                    <span className="text-[10px] font-condensed uppercase tracking-wider text-[#f08122] bg-[#f08122]/15 border border-[#f08122]/20 rounded px-1.5 py-0.5">
                      Express
                    </span>
                  ) : null}
                  {Object.entries(MODULE_LABELS).map(([key, label]) =>
                    job[key] ? (
                      <span key={key} className="text-[10px] font-condensed uppercase tracking-wider text-white/50 bg-white/10 rounded px-1.5 py-0.5">
                        {label}
                      </span>
                    ) : null
                  )}
                </div>
                <span className={"text-[10px] font-condensed uppercase tracking-widest rounded px-2 py-0.5 shrink-0 " + statusCls}>
                  {statusTxt}
                </span>
                <span className="text-white/30 text-xs hidden lg:block w-28 shrink-0 text-right">
                  {job.delivery_date
                    ? new Date(job.delivery_date as string).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
                    : new Date(job.created_at as string).toLocaleDateString()}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Pipeline tab ──────────────────────────────────────────────────────────────

function daysLabel(days: number | null): string {
  if (days === null) return "";
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  return days + "d";
}

function daysBadgeColor(days: number | null, status: string): string {
  if (days === null) return "text-white/20";
  const isFloor = ["production", "delivery", "install", "punch"].includes(status);
  if (isFloor && days > 14) return "text-red-400";
  if (isFloor && days > 7)  return "text-amber-400";
  const isPM = ["bid", "design", "field_dims"].includes(status);
  if (isPM && days > 10) return "text-amber-400";
  return "text-white/30";
}

function PipelineCard({ job }: { job: PipelineJob }) {
  const stageCls   = STATUS_COLOR[job.status] ?? "text-white/40 bg-white/10";
  const stageLabel = STATUS_LABEL[job.status] ?? job.status;
  const location   = [job.site_address, job.city].filter(Boolean).join(", ");
  const daysCls    = daysBadgeColor(job.days_in_stage, job.status);

  return (
    <Link
      href={"/jobs/" + (job.job_number ?? job.id)}
      prefetch={false}
      className="flex items-center gap-3 bg-white/5 hover:bg-white/[0.08] border border-white/10 rounded-lg px-4 py-3 transition-colors"
    >
      <span className={"text-[10px] font-condensed uppercase tracking-wider px-2 py-0.5 rounded shrink-0 " + stageCls}>
        {stageLabel}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate leading-tight">{location}</p>
        {location && <p className="text-white/40 text-xs truncate">{job.client_name}</p>}
      </div>
      <span className="text-white/40 text-xs hidden md:block shrink-0 w-28 truncate text-right">
        {job.pm ?? "—"}
      </span>
      {job.open_punch_count > 0 && (
        <span className="text-[10px] font-condensed text-pink-400 bg-pink-900/30 border border-pink-700/30 rounded px-1.5 py-0.5 shrink-0">
          {job.open_punch_count} punch
        </span>
      )}
      {job.days_in_stage !== null && (
        <span className={"text-xs font-condensed shrink-0 w-12 text-right " + daysCls}>
          {daysLabel(job.days_in_stage)}
        </span>
      )}
    </Link>
  );
}

function PipelineTab({ jobs }: { jobs: PipelineJob[] }) {
  const [pmFilter, setPmFilter] = useState("all");

  const pms = useMemo(() => distinctPMsPipeline(jobs), [jobs]);

  const filtered = useMemo(() => {
    if (pmFilter === "all") return jobs;
    if (pmFilter === "__none__") return jobs.filter((j) => !j.pm?.trim());
    return jobs.filter((j) => j.pm?.trim() === pmFilter);
  }, [jobs, pmFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, PipelineJob[]>();
    for (const s of PIPELINE_ORDER) map.set(s, []);
    for (const job of filtered) {
      const bucket = map.get(job.status);
      if (bucket) bucket.push(job);
    }
    return map;
  }, [filtered]);

  const activeStages = PIPELINE_ORDER.filter((s) => (grouped.get(s)?.length ?? 0) > 0);

  if (jobs.length === 0) {
    return (
      <div className="text-center py-24 text-white/20 font-condensed uppercase tracking-widest text-sm">
        No active jobs.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {pms.length > 1 && (
          <select
            value={pmFilter}
            onChange={(e) => setPmFilter(e.target.value)}
            className="bg-white/5 border border-white/15 rounded px-3 py-1.5 text-white text-sm font-condensed uppercase tracking-wide focus:outline-none focus:border-[#f08122]/60 cursor-pointer"
          >
            <option value="all">All PMs</option>
            {pms.map((pm) => (
              <option key={pm} value={pm}>{pm}</option>
            ))}
            <option value="__none__">No PM assigned</option>
          </select>
        )}
        <div className="flex flex-wrap gap-2">
          {activeStages.map((s) => {
            const count = grouped.get(s)?.length ?? 0;
            const cls   = STATUS_COLOR[s] ?? "text-white/40 bg-white/10";
            return (
              <span key={s} className={"text-[10px] font-condensed uppercase tracking-wider px-2 py-1 rounded " + cls}>
                {STATUS_LABEL[s] ?? s} · {count}
              </span>
            );
          })}
        </div>
      </div>
      {activeStages.length === 0 && (
        <div className="text-center py-12 text-white/20 font-condensed uppercase tracking-widest text-sm">
          No jobs match this filter.
        </div>
      )}
      {activeStages.map((stage) => {
        const stageJobs = grouped.get(stage) ?? [];
        const headerCls = STATUS_COLOR[stage] ?? "text-white/40 bg-white/10";
        return (
          <section key={stage}>
            <div className="flex items-center gap-3 mb-2">
              <h3 className={"text-xs font-condensed uppercase tracking-[0.15em] px-2 py-0.5 rounded " + headerCls}>
                {STATUS_LABEL[stage] ?? stage}
              </h3>
              <span className="text-white/20 text-xs font-condensed">{stageJobs.length}</span>
              <div className="flex-1 h-px bg-white/[0.08]" />
            </div>
            <div className="space-y-1.5">
              {stageJobs.map((job) => <PipelineCard key={job.id} job={job} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

type Tab = "all" | "pipeline";

export function JobsClient({
  jobs,
  pipelineJobs,
  session,
}: {
  jobs: Job[];
  pipelineJobs: PipelineJob[];
  session: BuilderSession | null;
}) {
  const [tab, setTab] = useState<Tab>("all");

  const activeCount = pipelineJobs.filter(
    (j) => !["intake", "bid", "on_hold"].includes(j.status)
  ).length;

  return (
    <>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          <button
            onClick={() => setTab("all")}
            className={"font-condensed uppercase tracking-widest text-xs px-4 py-1.5 rounded transition-colors " +
              (tab === "all" ? "bg-[#f08122] text-white" : "text-white/40 hover:text-white/70")}
          >
            All Jobs
          </button>
          <button
            onClick={() => setTab("pipeline")}
            className={"font-condensed uppercase tracking-widest text-xs px-4 py-1.5 rounded transition-colors flex items-center gap-2 " +
              (tab === "pipeline" ? "bg-[#f08122] text-white" : "text-white/40 hover:text-white/70")}
          >
            Pipeline
            {activeCount > 0 && (
              <span className={"text-[10px] rounded-full px-1.5 py-0.5 font-condensed " +
                (tab === "pipeline" ? "bg-white/20 text-white" : "bg-white/10 text-white/50")}>
                {activeCount}
              </span>
            )}
          </button>
        </div>
        {session && (
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-white/40 text-xs font-condensed hidden sm:block">
              {session.name}
            </span>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="text-white/25 hover:text-white/50 text-xs font-condensed uppercase tracking-wider transition-colors"
              >
                Sign Out
              </button>
            </form>
          </div>
        )}
      </div>
      {tab === "all"
        ? <AllJobsTab jobs={jobs} />
        : <PipelineTab jobs={pipelineJobs} />
      }
    </>
   );
}
