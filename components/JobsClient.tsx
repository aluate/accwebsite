"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

const STATUS_COLOR: Record<string, string> = {
  intake:     "text-white/40 bg-white/10",
  active:     "text-blue-300 bg-blue-900/30",
  production: "text-yellow-300 bg-yellow-900/30",
  complete:   "text-green-300 bg-green-900/30",
  on_hold:    "text-orange-300 bg-orange-900/30",
};

const MODULE_LABELS: Record<string, string> = {
  mod_residential: "Resi",
  mod_commercial:  "Comm",
  mod_trim:        "Trim",
  mod_doors:       "Doors",
};

const STATUSES = ["intake", "active", "production", "complete", "on_hold"];

type Job = Record<string, unknown>;

type SortKey = "newest" | "oldest" | "client_az" | "client_za";

export function JobsClient({ jobs }: { jobs: Job[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const filtered = useMemo(() => {
    let result = [...jobs];

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((job) =>
        (job.id as string)?.toLowerCase().includes(q) ||
        (job.client_name as string)?.toLowerCase().includes(q) ||
        (job.site_address as string)?.toLowerCase().includes(q) ||
        (job.city as string)?.toLowerCase().includes(q) ||
        (job.pm as string)?.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((job) => job.status === statusFilter);
    }

    // Sort
    result.sort((a, b) => {
      if (sort === "newest") return (b.seq as number) - (a.seq as number);
      if (sort === "oldest") return (a.seq as number) - (b.seq as number);
      if (sort === "client_az") return ((a.client_name as string) || "").localeCompare((b.client_name as string) || "");
      if (sort === "client_za") return ((b.client_name as string) || "").localeCompare((a.client_name as string) || "");
      return 0;
    });

    return result;
  }, [jobs, search, statusFilter, sort]);

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search jobs, clients, addresses…"
          className="flex-1 bg-white/5 border border-white/15 rounded px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#f08122]/60"
        />

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-white/5 border border-white/15 rounded px-3 py-2 text-white text-sm font-condensed uppercase tracking-wide focus:outline-none focus:border-[#f08122]/60 cursor-pointer"
        >
          <option value="all">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace("_", " ")}</option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="bg-white/5 border border-white/15 rounded px-3 py-2 text-white text-sm font-condensed uppercase tracking-wide focus:outline-none focus:border-[#f08122]/60 cursor-pointer"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="client_az">Client A→Z</option>
          <option value="client_za">Client Z→A</option>
        </select>
      </div>

      {/* Results count */}
      {(search || statusFilter !== "all") && (
        <p className="text-white/30 text-xs font-condensed uppercase tracking-widest mb-4">
          {filtered.length} of {jobs.length} jobs
        </p>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-24 text-white/20 font-condensed uppercase tracking-widest text-sm">
          {jobs.length === 0 ? "No jobs yet — create one to get started." : "No jobs match your filters."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((job) => (
            <Link
              key={job.id as string}
              href={`/jobs/${job.id}`}
              className="flex items-center gap-4 bg-[#2d2d2d] hover:bg-[#353535] rounded px-5 py-4 transition-colors group"
            >
              {/* ID */}
              <span className="font-condensed text-[#f08122] text-sm w-36 shrink-0">
                {job.id as string}
              </span>

              {/* Client + Address */}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{job.client_name as string}</p>
                <p className="text-white/40 text-xs truncate">
                  {job.site_address as string}{job.city ? `, ${job.city}` : ""}
                </p>
              </div>

              {/* PM */}
              <span className="text-white/50 text-xs hidden md:block w-32 shrink-0 truncate">
                {(job.pm as string) || "—"}
              </span>

              {/* Modules + Express badge */}
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

              {/* Status */}
              <span className={`text-[10px] font-condensed uppercase tracking-widest rounded px-2 py-0.5 shrink-0 ${STATUS_COLOR[job.status as string] ?? "text-white/40 bg-white/10"}`}>
                {(job.status as string)?.replace("_", " ")}
              </span>

              {/* Date */}
              <span className="text-white/30 text-xs hidden lg:block w-24 shrink-0 text-right">
                {new Date(job.created_at as string).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
