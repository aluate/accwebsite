"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import type { PmJob } from "@/app/pm-dashboard/page";

// ── Constants ─────────────────────────────────────────────────────────────────

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
type DatePreset = "2w" | "1m" | "3m" | "all";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function distinctValues(jobs: PmJob[], key: keyof PmJob): string[] {
  const set = new Set<string>();
  for (const j of jobs) {
    const v = j[key] as string | null;
    if (v?.trim()) set.add(v.trim());
  }
  return [...set].sort();
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function hasOverlap(
  startA: string | null,
  startB: string | null,
  windowDays = 3
): boolean {
  if (!startA || !startB) return false;
  const endA = addDays(startA, windowDays);
  const endB = addDays(startB, windowDays);
  return startA < endB && startB < endA;
}

// Returns map: job.id → conflicting job_number(s) or id(s)
function buildConflictMap(jobs: PmJob[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (let i = 0; i < jobs.length; i++) {
    for (let j = i + 1; j < jobs.length; j++) {
      const a = jobs[i];
      const b = jobs[j];
      if (!a.install_start_date || !b.install_start_date) continue;
      if (a.install_type !== b.install_type) continue;
      if (!a.install_type) continue; // both null
      if (!hasOverlap(a.install_start_date, b.install_start_date)) continue;
      const labelA = a.job_number ?? a.id;
      const labelB = b.job_number ?? b.id;
      if (!map.has(a.id)) map.set(a.id, []);
      if (!map.has(b.id)) map.set(b.id, []);
      map.get(a.id)!.push(labelB);
      map.get(b.id)!.push(labelA);
    }
  }
  return map;
}

function presetCutoff(preset: DatePreset): string | null {
  if (preset === "all") return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const days = preset === "2w" ? 14 : preset === "1m" ? 31 : 92;
  const cutoff = new Date(today.getTime() + days * 86400000);
  return cutoff.toISOString().slice(0, 10);
}

// ── Inline date editor ─────────────────────────────────────────────────────────

function InlineDateCell({
  jobId,
  field,
  value,
  onSaved,
}: {
  jobId: string;
  field: "delivery_date" | "install_start_date";
  value: string | null;
  onSaved: (jobId: string, field: string, newValue: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, string | null> = { [field]: draft || null };
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("save failed");
      onSaved(jobId, field, draft || null);
      setEditing(false);
    } catch {
      alert("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          className="bg-[#1c1c1c] border border-[#f08122]/60 rounded px-2 py-0.5 text-white text-xs focus:outline-none w-36"
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <button
          onClick={save}
          disabled={saving}
          className="text-[#f08122] hover:text-[#d9711e] text-xs font-condensed uppercase tracking-wide px-1 disabled:opacity-50"
        >
          {saving ? "…" : "Save"}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="text-white/30 hover:text-white/60 text-xs font-condensed uppercase tracking-wide px-1"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); setEditing(true); setDraft(value ?? ""); }}
      className="text-left text-white/70 hover:text-[#f08122] text-xs transition-colors group"
      title="Click to edit"
    >
      {value ? fmtDate(value) : (
        <span className="text-white/20 italic group-hover:text-[#f08122]/60">Set date</span>
      )}
    </button>
  );
}

// ── Install type select ────────────────────────────────────────────────────────

function InlineInstallTypeCell({
  jobId,
  value,
  onSaved,
}: {
  jobId: string;
  value: string | null;
  onSaved: (jobId: string, field: string, newValue: string | null) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function change(newVal: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ install_type: newVal || null }),
      });
      if (!res.ok) throw new Error("save failed");
      onSaved(jobId, "install_type", newVal || null);
    } catch {
      alert("Failed to save install type.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={value ?? ""}
      onChange={(e) => change(e.target.value)}
      disabled={saving}
      onClick={(e) => e.stopPropagation()}
      className="bg-[#1c1c1c] border border-white/15 rounded px-2 py-0.5 text-white text-xs font-condensed uppercase tracking-wide focus:outline-none focus:border-[#f08122]/60 cursor-pointer disabled:opacity-50"
    >
      <option value="">—</option>
      <option value="acc">ACC Crew</option>
      <option value="sub">Sub</option>
    </select>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type JobState = PmJob & { _conflicts?: string[] };

export function PmDashboardClient({
  jobs: initialJobs,
  currentPm,
}: {
  jobs: PmJob[];
  currentPm: string;
}) {
  // Local mutable job state (for inline edits)
  const [jobs, setJobs] = useState<JobState[]>(initialJobs);

  // Filters
  const [pmFilter, setPmFilter] = useState<string>(currentPm);
  const [statusFilter, setStatusFilter] = useState<string[]>(ACTIVE_STATUSES);
  const [datePreset, setDatePreset] = useState<DatePreset>("3m");
  const [installTypeFilter, setInstallTypeFilter] = useState<string>("all");
  const [builderFilter, setBuilderFilter] = useState<string>("all");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("delivery_asc");

  // Derived lists for dropdowns
  const pms = useMemo(() => distinctValues(jobs, "pm"), [jobs]);
  const builders = useMemo(() => distinctValues(jobs, "builder_name"), [jobs]);

  // Conflict map (all jobs, not just filtered)
  const conflictMap = useMemo(() => buildConflictMap(jobs), [jobs]);

  // Filtered + sorted jobs
  const filtered = useMemo(() => {
    let result = [...jobs];

    // PM filter
    if (pmFilter !== "all") {
      result = result.filter((j) => j.pm?.trim() === pmFilter);
    }

    // Status filter
    if (statusFilter.length > 0) {
      result = result.filter((j) => statusFilter.includes(j.status));
    }

    // Date preset (applies to delivery_date OR install_start_date)
    const cutoff = presetCutoff(datePreset);
    if (cutoff) {
      result = result.filter((j) => {
        const d = j.delivery_date ?? j.install_start_date;
        if (!d) return true; // always include jobs with no date
        return d <= cutoff;
      });
    }

    // Install type
    if (installTypeFilter !== "all") {
      if (installTypeFilter === "__none__") {
        result = result.filter((j) => !j.install_type);
      } else {
        result = result.filter((j) => j.install_type === installTypeFilter);
      }
    }

    // Builder
    if (builderFilter !== "all") {
      result = result.filter((j) => j.builder_name?.trim() === builderFilter);
    }

    // Sort
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
  }, [jobs, pmFilter, statusFilter, datePreset, installTypeFilter, builderFilter, sortKey]);

  // Inline save callback
  const handleSaved = useCallback((jobId: string, field: string, newValue: string | null) => {
    setJobs((prev) =>
      prev.map((j) => j.id === jobId ? { ...j, [field]: newValue } : j)
    );
  }, []);

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

  const installTypeLabel = (t: string | null) => {
    if (t === "acc") return "ACC";
    if (t === "sub") return "Sub";
    return null;
  };

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

        {/* Date preset */}
        <div>
          <label className="block text-white/40 font-condensed uppercase tracking-widest text-[10px] mb-1">Date Range</label>
          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as DatePreset)}
            className="bg-[#1c1c1c] border border-white/15 rounded px-3 py-1.5 text-white text-sm font-condensed uppercase tracking-wide focus:outline-none focus:border-[#f08122]/60 cursor-pointer"
          >
            <option value="2w">Next 2 Weeks</option>
            <option value="1m">Next Month</option>
            <option value="3m">Next 3 Months</option>
            <option value="all">All</option>
          </select>
        </div>

        {/* Install type */}
        <div>
          <label className="block text-white/40 font-condensed uppercase tracking-widest text-[10px] mb-1">Install Type</label>
          <select
            value={installTypeFilter}
            onChange={(e) => setInstallTypeFilter(e.target.value)}
            className="bg-[#1c1c1c] border border-white/15 rounded px-3 py-1.5 text-white text-sm font-condensed uppercase tracking-wide focus:outline-none focus:border-[#f08122]/60 cursor-pointer"
          >
            <option value="all">All</option>
            <option value="acc">ACC Crew</option>
            <option value="sub">Sub</option>
            <option value="__none__">Not Set</option>
          </select>
        </div>

        {/* Builder */}
        <div>
          <label className="block text-white/40 font-condensed uppercase tracking-widest text-[10px] mb-1">Builder</label>
          <select
            value={builderFilter}
            onChange={(e) => setBuilderFilter(e.target.value)}
            className="bg-[#1c1c1c] border border-white/15 rounded px-3 py-1.5 text-white text-sm font-condensed uppercase tracking-wide focus:outline-none focus:border-[#f08122]/60 cursor-pointer"
          >
            <option value="all">All Builders</option>
            {builders.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        {/* Status multi-select */}
        <div>
          <label className="block text-white/40 font-condensed uppercase tracking-widest text-[10px] mb-1">Status</label>
          <div className="flex flex-wrap gap-1">
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
                <th className="pb-3 pr-4 font-condensed uppercase tracking-widest text-[10px] text-white/40 hidden md:table-cell">Builder</th>
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
                const conflicts = conflictMap.get(job.id) ?? [];
                const hasConflict = conflicts.length > 0;
                const statusCls = STATUS_COLOR[job.status] ?? "text-white/40 bg-white/10";
                const statusTxt = STATUS_LABEL[job.status] ?? job.status.replace(/_/g, " ");
                const jobRef = job.job_number ?? job.id;

                return (
                  <tr
                    key={job.id}
                    className={
                      "border-b border-white/5 hover:bg-white/[0.03] transition-colors " +
                      (hasConflict ? "bg-red-950/20" : "")
                    }
                  >
                    {/* Job # */}
                    <td className="py-3 pr-4">
                      <Link
                        href={`/jobs/${jobRef}`}
                        className="text-[#f08122] font-condensed text-sm hover:underline"
                        prefetch={false}
                      >
                        {job.job_number ? `#${job.job_number}` : (
                          <span className="text-white/20 italic text-xs">no #</span>
                        )}
                      </Link>
                    </td>

                    {/* Client / Job name */}
                    <td className="py-3 pr-4">
                      <div>
                        <p className="text-white text-sm font-medium leading-tight">
                          {job.client_name}
                        </p>
                        <p className="text-white/40 text-xs truncate max-w-48">
                          {[job.site_address, job.city].filter(Boolean).join(", ")}
                        </p>
                        {hasConflict && (
                          <p className="text-red-400 text-[10px] font-condensed mt-0.5">
                            ⚠ Conflicts with {conflicts.map((c) => `#${c}`).join(", ")}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Builder */}
                    <td className="py-3 pr-4 hidden md:table-cell">
                      <span className="text-white/50 text-xs">
                        {job.builder_name ?? "—"}
                      </span>
                    </td>

                    {/* Delivery date (inline edit) */}
                    <td className="py-3 pr-4">
                      <InlineDateCell
                        jobId={job.id}
                        field="delivery_date"
                        value={job.delivery_date}
                        onSaved={handleSaved}
                      />
                    </td>

                    {/* Install type (inline select) */}
                    <td className="py-3 pr-4 hidden lg:table-cell">
                      <InlineInstallTypeCell
                        jobId={job.id}
                        value={job.install_type}
                        onSaved={handleSaved}
                      />
                    </td>

                    {/* Install start date (inline edit) */}
                    <td className="py-3 pr-4">
                      <InlineDateCell
                        jobId={job.id}
                        field="install_start_date"
                        value={job.install_start_date}
                        onSaved={handleSaved}
                      />
                    </td>

                    {/* Status */}
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
