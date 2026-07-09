"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { EngJob } from "@/app/engineer/page";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  intake:      "text-white/40 bg-white/10",
  bid:         "text-sky-300 bg-sky-900/30",
  design:      "text-sky-300 bg-sky-900/30",
  field_dims:  "text-sky-300 bg-sky-900/30",
  engineering: "text-indigo-300 bg-indigo-900/30",
  procurement: "text-yellow-300 bg-yellow-900/30",
  production:  "text-orange-300 bg-orange-900/30",
  delivery:    "text-green-300 bg-green-900/30",
  install:     "text-emerald-300 bg-emerald-900/30",
  punch:       "text-pink-300 bg-pink-900/30",
  complete:    "text-green-300 bg-green-900/30",
  on_hold:     "text-white/40 bg-white/10",
};

const STATUS_LABEL: Record<string, string> = {
  intake: "Intake", bid: "Bid", design: "Design", field_dims: "Field Dims",
  engineering: "Engineering", procurement: "Procurement", production: "Production",
  delivery: "Delivery", install: "Install", punch: "Punch",
  complete: "Complete", on_hold: "On Hold",
};

const ALL_STATUSES = [
  "intake", "bid", "design", "field_dims", "engineering", "procurement",
  "production", "delivery", "install", "punch", "complete", "on_hold",
];

const ACTIVE_STATUSES = [
  "production", "delivery", "install", "punch", "field_dims",
  "engineering", "procurement", "design", "bid",
];

type SortKey = "delivery_asc" | "delivery_desc" | "install_asc" | "install_desc" | "client_az" | "client_za";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function distinctValues(jobs: EngJob[], key: keyof EngJob): string[] {
  const set = new Set<string>();
  for (const j of jobs) {
    const v = j[key] as string | null;
    if (v?.trim()) set.add(v.trim());
  }
  return [...set].sort();
}

const installTypeLabel = (t: string | null) => {
  if (t === "acc") return "ACC";
  if (t === "sub") return "Sub";
  return "—";
};

// ── Main component ────────────────────────────────────────────────────────────

export function EngineeringDashboardClient({ jobs }: { jobs: EngJob[] }) {
  const [pmFilter, setPmFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string[]>(["engineering"]);
  const [sortKey, setSortKey] = useState<SortKey>("delivery_asc");

  const pms = useMemo(() => distinctValues(jobs, "pm"), [jobs]);

  const filtered = useMemo(() => {
    let result = [...jobs];

    if (pmFilter !== "all") {
      result = result.filter((j) => j.pm?.trim() === pmFilter);
    }

    if (statusFilter.length > 0) {
      result = result.filter((j) => statusFilter.includes(j.status.toLowerCase()));
    }

    result.sort((a, b) => {
      const nullLast = (v: string | null) => v ?? "9999-99-99";
      if (sortKey === "delivery_asc")  return nullLast(a.delivery_date).localeCompare(nullLast(b.delivery_date));
      if (sortKey === "delivery_desc") return nullLast(b.delivery_date).localeCompare(nullLast(a.delivery_date));
      if (sortKey === "install_asc")   return nullLast(a.install_start_date).localeCompare(nullLast(b.install_start_date));
      if (sortKey === "install_desc")  return nullLast(b.install_start_date).localeCompare(nullLast(a.install_start_date));
      if (sortKey === "client_az")     return (a.client_name ?? "").localeCompare(b.client_name ?? "");
      if (sortKey === "client_za")     return (b.client_name ?? "").localeCompare(a.client_name ?? "");
      return 0;
    });

    return result;
  }, [jobs, pmFilter, statusFilter, sortKey]);

  function toggleStatus(s: string) {
    setStatusFilter((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  function sortHeader(label: string, ascKey: SortKey, descKey: SortKey) {
    const active = sortKey === ascKey || sortKey === descKey;
    return (
      <button
        onClick={() => setSortKey(sortKey === ascKey ? descKey : ascKey)}
        className={
          "flex items-center gap-1 font-condensed uppercase tracking-widest text-[10px] transition-colors " +
          (active ? "text-[#f08122]" : "text-white/40 hover:text-white/60")
        }
      >
        {label}
        <span className="text-[9px]">
          {sortKey === ascKey ? "▲" : sortKey === descKey ? "▼" : "⇅"}
        </span>
      </button>
    );
  }

  return (
    <>
      {/* ── Filter bar ── */}
      <div className="bg-[#2d2d2d] rounded-lg p-4 mb-6 flex flex-wrap gap-3 items-end">
        {/* PM */}
        <div>
          <label className="block text-white/40 font-condensed uppercase tracking-widest text-[10px] mb-1">PM</label>
          <select
            value={pmFilter}
            onChange={(e) => setPmFilter(e.target.value)}
            className="bg-[#1c1c1c] border border-white/15 rounded px-3 py-1.5 text-white text-sm font-condensed uppercase tracking-wide focus:outline-none focus:border-[#f08122]/60 cursor-pointer"
          >
            <option value="all">All PMs</option>
            {pms.map((pm) => (
              <option key={pm} value={pm}>{pm}</option>
            ))}
          </select>
        </div>

        {/* Status multi-select */}
        <div>
          <label className="block text-white/40 font-condensed uppercase tracking-widest text-[10px] mb-1">Status</label>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setStatusFilter(ACTIVE_STATUSES)}
              className="text-[10px] font-condensed uppercase tracking-wider px-2 py-0.5 rounded border border-white/15 text-white/30 hover:text-white/60 transition-colors"
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter([])}
              className="text-[10px] font-condensed uppercase tracking-wider px-2 py-0.5 rounded border border-white/15 text-white/30 hover:text-white/60 transition-colors"
            >
              All
            </button>
            {ALL_STATUSES.map((s) => {
              const active = statusFilter.includes(s);
              const cls = active
                ? (STATUS_COLOR[s] ?? "text-white/60 bg-white/15") + " border-transparent"
                : "text-white/30 bg-transparent border-white/15";
              return (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  className={"text-[10px] font-condensed uppercase tracking-wider px-2 py-0.5 rounded border transition-colors " + cls}
                >
                  {STATUS_LABEL[s] ?? s}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Results count ── */}
      <p className="text-white/30 text-xs font-condensed uppercase tracking-widest mb-3">
        {filtered.length} of {jobs.length} jobs
      </p>

      {/* ── Table ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-24 text-white/20 font-condensed uppercase tracking-widest text-sm">
          No jobs match your filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="pb-3 pr-4 font-condensed uppercase tracking-widest text-[10px] text-white/40 w-28">Job #</th>
                <th className="pb-3 pr-4 font-condensed uppercase tracking-widest text-[10px] text-white/40">
                  <button
                    onClick={() => setSortKey(sortKey === "client_az" ? "client_za" : "client_az")}
                    className={"flex items-center gap-1 font-condensed uppercase tracking-widest text-[10px] transition-colors " +
                      (sortKey === "client_az" || sortKey === "client_za" ? "text-[#f08122]" : "text-white/40 hover:text-white/60")}
                  >
                    Client / Job
                    <span className="text-[9px]">
                      {sortKey === "client_az" ? "▲" : sortKey === "client_za" ? "▼" : "⇅"}
                    </span>
                  </button>
                </th>
                <th className="pb-3 pr-4 font-condensed uppercase tracking-widest text-[10px] text-white/40 hidden md:table-cell">PM</th>
                <th className="pb-3 pr-4">
                  {sortHeader("Delivery", "delivery_asc", "delivery_desc")}
                </th>
                <th className="pb-3 pr-4 font-condensed uppercase tracking-widest text-[10px] text-white/40 hidden lg:table-cell">Install Type</th>
                <th className="pb-3 pr-4">
                  {sortHeader("Install Start", "install_asc", "install_desc")}
                </th>
                <th className="pb-3 font-condensed uppercase tracking-widest text-[10px] text-white/40">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((job) => {
                const statusKey = job.status.toLowerCase();
                const statusCls = STATUS_COLOR[statusKey] ?? "text-white/40 bg-white/10";
                const statusTxt = STATUS_LABEL[statusKey] ?? job.status.replace(/_/g, " ");

                return (
                  <tr
                    key={job.id}
                    className="border-b border-white/5 hover:bg-white/[0.03] transition-colors"
                  >
                    {/* Job # */}
                    <td className="py-3 pr-4">
                      <Link
                        href={`/jobs/${job.job_number ?? job.id}`}
                        className="text-[#f08122] font-condensed text-sm hover:underline"
                        prefetch={false}
                      >
                        {job.job_number ? `#${job.job_number}` : (
                          <span className="text-white/20 italic text-xs">no #</span>
                        )}
                      </Link>
                    </td>

                    {/* Client / address */}
                    <td className="py-3 pr-4">
                      <div>
                        <p className="text-white text-sm font-medium leading-tight">
                          {job.client_name}
                        </p>
                        <p className="text-white/40 text-xs truncate max-w-48">
                          {[job.site_address, job.city].filter(Boolean).join(", ")}
                        </p>
                      </div>
                    </td>

                    {/* PM */}
                    <td className="py-3 pr-4 hidden md:table-cell">
                      <span className="text-white/50 text-xs">{job.pm ?? "—"}</span>
                    </td>

                    {/* Delivery date (read-only) */}
                    <td className="py-3 pr-4">
                      <span className="text-white/70 text-xs">{fmtDate(job.delivery_date)}</span>
                    </td>

                    {/* Install type (read-only) */}
                    <td className="py-3 pr-4 hidden lg:table-cell">
                      <span className="text-white/50 text-xs font-condensed uppercase tracking-wide">
                        {installTypeLabel(job.install_type)}
                      </span>
                    </td>

                    {/* Install start date (read-only) */}
                    <td className="py-3 pr-4">
                      <span className="text-white/70 text-xs">{fmtDate(job.install_start_date)}</span>
                    </td>

                    {/* Status badge (read-only) */}
                    <td className="py-3">
                      <span className={"text-[10px] font-condensed uppercase tracking-widest rounded px-2 py-0.5 " + statusCls}>
                        {statusTxt}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
