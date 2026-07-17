"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────
type FinishGroup = {
  id: string;
  label: string | null;
  finish_type: string | null;
  species: string | null;
  box_count: number | null;
  wo_count: number | null;
};

type ConstraintJob = {
  id: string;
  job_number: string | null;
  client_name: string;
  site_address: string | null;
  city: string | null;
  pm: string | null;
  status: string;
  delivery_date: string | null;
  estimated_value: number | null;
  pm_complexity: number | null;
  finish_groups: FinishGroup[];
};

type Pm = { id: string; name: string };

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_ORDER = ["intake", "design", "engineering", "shop", "install", "complete"];
const STATUS_LABEL: Record<string, string> = {
  intake: "Intake", design: "Design", engineering: "Engineering",
  shop: "Shop", install: "Install", complete: "Complete", cancelled: "Cancelled",
};
const STATUS_COLOR: Record<string, string> = {
  intake:      "bg-white/10 text-white/50",
  design:      "bg-blue-500/20 text-blue-300",
  engineering: "bg-violet-500/20 text-violet-300",
  shop:        "bg-amber-500/20 text-amber-300",
  install:     "bg-orange-500/20 text-orange-300",
  complete:    "bg-green-500/20 text-green-300",
  cancelled:   "bg-red-500/20 text-red-300",
};
const COMPLEXITY_LABEL: Record<number, string> = { 0: "0 — Std", 1: "1 — Mod", 2: "2 — Complex" };
const FINISH_LABEL: Record<string, string> = {
  melamine: "MEL", stain: "STN", paint: "PAINT", thermofoil: "TF",
};

// ─── Inline cell components ───────────────────────────────────────────────────
function EditableStatus({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  return (
    <select
      value={value}
      onChange={async e => { setSaving(true); await onSave(e.target.value); setSaving(false); }}
      disabled={saving}
      className={`text-[10px] font-condensed uppercase tracking-widest rounded-full px-2 py-0.5 border-0 focus:outline-none cursor-pointer ${STATUS_COLOR[value] ?? "bg-white/10 text-white/40"} ${saving ? "opacity-50" : ""}`}
      style={{ background: "transparent" }}
    >
      {STATUS_ORDER.map(s => (
        <option key={s} value={s} className="bg-[#2d2d2d] text-white normal-case">{STATUS_LABEL[s]}</option>
      ))}
    </select>
  );
}

function EditableComplexity({ value, onSave }: { value: number | null; onSave: (v: number) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const v = value ?? 1;
  return (
    <select
      value={v}
      onChange={async e => { setSaving(true); await onSave(Number(e.target.value)); setSaving(false); }}
      disabled={saving}
      className={`text-xs text-white bg-transparent hover:bg-white/5 rounded px-1 py-0.5 border border-transparent hover:border-white/20 focus:outline-none focus:border-[#f08122]/60 cursor-pointer transition-colors ${saving ? "opacity-50" : ""}`}
    >
      <option value={0} className="bg-[#2d2d2d] text-white">0 — Std</option>
      <option value={1} className="bg-[#2d2d2d] text-white">1 — Mod</option>
      <option value={2} className="bg-[#2d2d2d] text-white">2 — Complex</option>
    </select>
  );
}

function EditableSelect({ value, options, placeholder, onSave }: {
  value: string | null; options: Pm[]; placeholder?: string;
  onSave: (v: string | null) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <select
      value={value ?? ""}
      onChange={async e => { setSaving(true); await onSave(e.target.value || null); setSaving(false); }}
      disabled={saving}
      className={`text-xs text-white bg-transparent hover:bg-white/5 rounded px-1 py-0.5 border border-transparent hover:border-white/20 focus:outline-none focus:border-[#f08122]/60 cursor-pointer w-full transition-colors ${saving ? "opacity-50" : ""}`}
    >
      <option value="" className="bg-[#2d2d2d] text-white/40">{placeholder ?? "—"}</option>
      {options.map(o => (
        <option key={o.id} value={o.name} className="bg-[#2d2d2d] text-white">{o.name}</option>
      ))}
    </select>
  );
}

function EditableDate({ value, onSave }: { value: string | null; onSave: (v: string | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  async function commit(v: string) {
    setSaving(true);
    await onSave(v || null);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <input autoFocus type="date" value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={e => { if (e.key === "Enter") commit(draft); if (e.key === "Escape") setEditing(false); }}
        disabled={saving}
        className="bg-white/10 border border-[#f08122]/60 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
      />
    );
  }
  return (
    <button onClick={() => { setDraft(value ?? ""); setEditing(true); }}
      className="text-left text-xs text-white/60 hover:text-white group whitespace-nowrap">
      {value ?? <span className="text-white/20 group-hover:text-white/40">Set date</span>}
      <span className="ml-1 opacity-0 group-hover:opacity-40 text-[9px]">\u270e</span>
    </button>
  );
}

function EditableDollar({ value, onSave }: { value: number | null; onSave: (v: number | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const [saving, setSaving] = useState(false);

  async function commit() {
    setSaving(true);
    const raw = draft.replace(/[$,\s]/g, "");
    const n = raw === "" ? null : parseFloat(raw);
    await onSave(isNaN(n as number) ? null : n);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <input autoFocus type="number" step="1000" value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        disabled={saving}
        placeholder="e.g. 85000"
        className="w-24 bg-white/10 border border-[#f08122]/60 rounded px-1.5 py-0.5 text-xs text-white text-right focus:outline-none"
      />
    );
  }
  return (
    <button onClick={() => { setDraft(value != null ? String(value) : ""); setEditing(true); }}
      className="text-xs text-right text-white/60 hover:text-white group tabular-nums w-full">
      {value != null
        ? "$" + Math.round(value).toLocaleString()
        : <span className="text-white/20 group-hover:text-white/40">—</span>}
      <span className="ml-1 opacity-0 group-hover:opacity-40 text-[9px]">\u270e</span>
    </button>
  );
}

function EditableInt({ value, placeholder, onSave }: {
  value: number | null; placeholder?: string; onSave: (v: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const [saving, setSaving] = useState(false);

  async function commit() {
    setSaving(true);
    const n = draft.trim() === "" ? null : parseInt(draft, 10);
    await onSave(isNaN(n as number) ? null : n);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <input autoFocus type="number" min="0" step="1" value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        disabled={saving}
        className="w-16 bg-white/10 border border-[#f08122]/60 rounded px-1.5 py-0.5 text-xs text-white text-center focus:outline-none"
      />
    );
  }
  return (
    <button onClick={() => { setDraft(value != null ? String(value) : ""); setEditing(true); }}
      className="text-xs text-center text-white/60 hover:text-white group tabular-nums">
      {value != null ? value : <span className="text-white/20 group-hover:text-white/40">{placeholder ?? "—"}</span>}
      <span className="ml-1 opacity-0 group-hover:opacity-40 text-[9px]">\u270e</span>
    </button>
  );
}

// ─── FG sub-row ───────────────────────────────────────────────────────────────
function FgRow({ fg, onSaveFg }: {
  fg: FinishGroup;
  onSaveFg: (fgId: string, updates: Partial<FinishGroup>) => Promise<void>;
}) {
  const tag = fg.finish_type ? (FINISH_LABEL[fg.finish_type] ?? fg.finish_type.toUpperCase()) : "FG";
  const label = fg.label ?? tag;
  return (
    <tr className="bg-white/[0.015] border-b border-white/5">
      <td className="pl-10 pr-2 py-1.5 text-[10px] text-white/30 whitespace-nowrap" colSpan={1}>
        <span className="inline-block bg-white/5 rounded px-1.5 py-0.5 text-white/50">{label}</span>
      </td>
      <td className="px-2 py-1.5" />
      <td className="px-2 py-1.5" />
      <td className="px-2 py-1.5" />
      <td className="px-2 py-1.5" />
      <td className="px-2 py-1.5" />
      <td className="px-2 py-1.5 text-center">
        <EditableInt
          value={fg.box_count}
          placeholder="boxes"
          onSave={v => onSaveFg(fg.id, { box_count: v })}
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <EditableInt
          value={fg.wo_count}
          placeholder="WOs"
          onSave={v => onSaveFg(fg.id, { wo_count: v })}
        />
      </td>
    </tr>
  );
}

// ─── Job row ──────────────────────────────────────────────────────────────────
function JobRow({ job, pms, onSaveJob, onSaveFg }: {
  job: ConstraintJob;
  pms: Pm[];
  onSaveJob: (id: string, updates: Partial<ConstraintJob>) => Promise<void>;
  onSaveFg: (fgId: string, updates: Partial<FinishGroup>) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasFgs = job.finish_groups.length > 0;
  const totalBoxes = job.finish_groups.reduce((s, fg) => s + (fg.box_count ?? 0), 0);
  const totalWOs   = job.finish_groups.reduce((s, fg) => s + (fg.wo_count ?? 0), 0);

  return (
    <>
      <tr className="border-b border-white/5 hover:bg-white/[0.025] transition-colors group/row">
        {/* Job name */}
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            {hasFgs && (
              <button onClick={() => setExpanded(e => !e)}
                className="text-white/20 hover:text-white/60 transition-colors text-[10px] w-4 flex-shrink-0"
                title="Toggle finish groups">
                {expanded ? "▾" : "▸"}
              </button>
            )}
            {!hasFgs && <span className="w-4 flex-shrink-0" />}
            <div>
              <Link href={`/jobs/${job.id}`} className="text-sm font-medium text-white hover:text-[#f08122] transition-colors">
                {job.client_name}
              </Link>
              <div className="text-[10px] text-white/30">{job.job_number}{job.city ? ` · ${job.city}` : ""}</div>
            </div>
          </div>
        </td>

        {/* Status */}
        <td className="px-2 py-2.5">
          <EditableStatus value={job.status} onSave={v => onSaveJob(job.id, { status: v })} />
        </td>

        {/* Est. Value */}
        <td className="px-2 py-2.5 text-right">
          <EditableDollar value={job.estimated_value} onSave={v => onSaveJob(job.id, { estimated_value: v })} />
        </td>

        {/* Complexity */}
        <td className="px-2 py-2.5">
          <EditableComplexity value={job.pm_complexity} onSave={v => onSaveJob(job.id, { pm_complexity: v })} />
        </td>

        {/* PM */}
        <td className="px-2 py-2.5 min-w-[100px]">
          <EditableSelect value={job.pm} options={pms} placeholder="Assign PM"
            onSave={v => onSaveJob(job.id, { pm: v ?? null })} />
        </td>

        {/* Delivery */}
        <td className="px-2 py-2.5">
          <EditableDate value={job.delivery_date}
            onSave={v => onSaveJob(job.id, { delivery_date: v })} />
        </td>

        {/* Boxes (total) */}
        <td className="px-2 py-2.5 text-center tabular-nums text-xs">
          {hasFgs
            ? <button onClick={() => setExpanded(e => !e)}
                className="text-white/50 hover:text-white transition-colors">
                {totalBoxes > 0 ? totalBoxes : <span className="text-white/20">—</span>}
              </button>
            : <span className="text-white/20">—</span>
          }
        </td>

        {/* WOs (total) */}
        <td className="px-2 py-2.5 text-center tabular-nums text-xs">
          {hasFgs
            ? <button onClick={() => setExpanded(e => !e)}
                className="text-white/50 hover:text-white transition-colors">
                {totalWOs > 0 ? totalWOs : <span className="text-white/20">—</span>}
              </button>
            : <span className="text-white/20">—</span>
          }
        </td>
      </tr>

      {/* FG sub-rows */}
      {expanded && job.finish_groups.map(fg => (
        <FgRow key={fg.id} fg={fg} onSaveFg={onSaveFg} />
      ))}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ConstraintsClient() {
  const [jobs, setJobs] = useState<ConstraintJob[]>([]);
  const [pms, setPms]   = useState<Pm[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("active");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, pRes] = await Promise.all([
        fetch("/api/constraints"),
        fetch("/api/admin/pipeline"),
      ]);
      const cData = await cRes.json();
      const pData = await pRes.json();
      setJobs(cData.jobs ?? []);
      setPms(pData.pms ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Save job-level field
  async function onSaveJob(jobId: string, updates: Partial<ConstraintJob>) {
    await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...updates, _actor: "admin", _actorRole: "admin" }),
    });
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...updates } : j));
  }

  // Save FG-level field
  async function onSaveFg(fgId: string, updates: Partial<FinishGroup>) {
    await fetch(`/api/finish-groups/${fgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setJobs(prev => prev.map(j => ({
      ...j,
      finish_groups: j.finish_groups.map(fg => fg.id === fgId ? { ...fg, ...updates } : fg),
    })));
  }

  // Filter + search
  const ACTIVE = ["intake", "design", "engineering", "shop", "install"];
  const visible = jobs.filter(j => {
    if (filterStatus === "active" && !ACTIVE.includes(j.status)) return false;
    if (filterStatus !== "active" && filterStatus !== "all" && j.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        j.client_name.toLowerCase().includes(q) ||
        (j.job_number ?? "").toLowerCase().includes(q) ||
        (j.pm ?? "").toLowerCase().includes(q) ||
        (j.city ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Completeness stats
  const total = visible.length;
  const hasValue = visible.filter(j => j.estimated_value != null).length;
  const hasComplexity = visible.filter(j => j.pm_complexity != null).length;
  const hasPm = visible.filter(j => j.pm != null).length;
  const hasDelivery = visible.filter(j => j.delivery_date != null).length;

  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;

  const statusCounts = [...ACTIVE, "complete", "cancelled"].reduce<Record<string, number>>((acc, s) => {
    acc[s] = jobs.filter(j => j.status === s).length;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#0d0e0f] text-white px-4 py-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-white/40 text-xs font-condensed uppercase tracking-widest mb-1">Admin</div>
          <h1 className="font-heading text-3xl uppercase tracking-wide text-[#f08122]">Constraints Data</h1>
          <p className="text-white/30 text-xs mt-1">Inline-editable planning fields — feeds the shop constraints model</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load}
            className="text-white/40 hover:text-white text-xs font-condensed uppercase tracking-widest transition-colors">
            ↻ Refresh
          </button>
          <Link href="/admin" className="text-white/40 hover:text-white text-sm transition-colors">← Admin</Link>
        </div>
      </div>

      {/* Completeness bar */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Est. Value", n: hasValue },
          { label: "Complexity", n: hasComplexity },
          { label: "PM Assigned", n: hasPm },
          { label: "Delivery Date", n: hasDelivery },
        ].map(({ label, n }) => (
          <div key={label} className="bg-[#1a1b1c] border border-white/10 rounded-xl p-3">
            <div className="text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-1">{label}</div>
            <div className="text-lg font-semibold tabular-nums">{n}<span className="text-white/30 text-sm">/{total}</span></div>
            <div className="mt-1.5 h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct(n) === 100 ? "bg-green-400" : pct(n) > 60 ? "bg-[#f08122]" : "bg-red-400"}`}
                style={{ width: `${pct(n)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search jobs…"
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#f08122]/60 w-48"
        />
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Active", key: "active", count: jobs.filter(j => ACTIVE.includes(j.status)).length },
            { label: "All", key: "all", count: jobs.length },
            ...["intake","design","engineering","shop","install"].map(s => ({
              label: STATUS_LABEL[s], key: s, count: statusCounts[s] ?? 0,
            })),
          ].map(({ label, key, count }) => (
            <button key={key} onClick={() => setFilterStatus(key)}
              className={`px-3 py-1 rounded-full text-[10px] font-condensed uppercase tracking-widest transition-colors ${filterStatus === key ? "bg-[#f08122] text-white" : "bg-white/5 text-white/40 hover:text-white"}`}>
              {label} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center text-white/30 py-20 text-sm">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/40 text-[10px] font-condensed uppercase tracking-widest bg-[#111213]">
                <th className="text-left px-4 py-3">Job</th>
                <th className="text-left px-2 py-3">Status ✎</th>
                <th className="text-right px-2 py-3">Est. Value ✎</th>
                <th className="text-left px-2 py-3">Complexity ✎</th>
                <th className="text-left px-2 py-3">PM ✎</th>
                <th className="text-left px-2 py-3">Delivery ✎</th>
                <th className="text-center px-2 py-3">Boxes ✎</th>
                <th className="text-center px-2 py-3">WOs ✎</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(job => (
                <JobRow
                  key={job.id}
                  job={job}
                  pms={pms}
                  onSaveJob={onSaveJob}
                  onSaveFg={onSaveFg}
                />
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-white/20 py-12 text-sm">
                    {search ? "No jobs match your search" : "No active jobs"}
                  </td>
                </tr>
              )}
            </tbody>
            {visible.length > 0 && (
              <tfoot>
                <tr className="border-t border-white/10 text-white/40 text-xs font-condensed bg-[#111213]">
                  <td className="px-4 py-2" colSpan={2}>{visible.length} jobs</td>
                  <td className="px-2 py-2 text-right tabular-nums text-white/60">
                    {visible.filter(j => j.estimated_value).reduce((s, j) => s + (j.estimated_value ?? 0), 0) > 0
                      ? "$" + Math.round(visible.reduce((s, j) => s + (j.estimated_value ?? 0), 0)).toLocaleString()
                      : "—"}
                  </td>
                  <td colSpan={3} />
                  <td className="px-2 py-2 text-center tabular-nums text-white/60">
                    {visible.reduce((s, j) => s + j.finish_groups.reduce((ss, fg) => ss + (fg.box_count ?? 0), 0), 0) || "—"}
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums text-white/60">
                    {visible.reduce((s, j) => s + j.finish_groups.reduce((ss, fg) => ss + (fg.wo_count ?? 0), 0), 0) || "—"}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <p className="text-white/20 text-[10px] font-condensed mt-4">
        Click any ✎ cell to edit. Boxes/WOs live on finish groups — click ▸ to expand and edit per-FG.
        Changes save immediately. Refresh pulls latest from Supabase.
      </p>
    </div>
  );
}
