"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const STATUS_ORDER = ["intake","design","engineering","shop","install","complete"];
const STATUS_LABEL: Record<string,string> = {
  intake: "Intake", design: "Design", engineering: "Engineering",
  shop: "Shop", install: "Install", complete: "Complete", cancelled: "Cancelled",
};
const STATUS_COLOR: Record<string,string> = {
  intake:      "bg-white/10 text-white/50",
  design:      "bg-blue-500/20 text-blue-300",
  engineering: "bg-violet-500/20 text-violet-300",
  shop:        "bg-amber-500/20 text-amber-300",
  install:     "bg-orange-500/20 text-orange-300",
  complete:    "bg-green-500/20 text-green-300",
  cancelled:   "bg-red-500/20 text-red-300",
};

const INSTALL_TYPE_OPTIONS = [
  { value: "",              label: "— Not set" },
  { value: "acc",          label: "ACC Crew" },
  { value: "sub",          label: "Sub" },
  { value: "delivery_only", label: "Delivery Only" },
];
function installTypeLabel(v: string | null) {
  if (!v) return "—";
  return INSTALL_TYPE_OPTIONS.find(o => o.value === v)?.label ?? v;
}

type FgBox = { label: string; boxes: number };
type PipelineJob = {
  id: string; client_name: string; site_address: string; city: string;
  status: string; job_number: string; pm: string | null;
  delivery_date: string | null; install_start_date: string | null;
  anticipated_delivery: string | null; seq: number;
  estimate_id: string | null;
  estimated_value: number | null;
  sell_price_snapshot: number | null;
  shop_hrs: number | null;
  install_hrs: number | null;
  install_type: string | null;
  box_count: number | null;
  fg_boxes: FgBox[] | null;
};
type Pm = { id: string; name: string };
type Capacity = { shop_capacity_hrs_per_week: number; install_capacity_hrs_per_week: number };

function fmt$(n: number | null) {
  if (n == null) return "—";
  return "$" + Math.round(n).toLocaleString();
}

// ── Editable components ───────────────────────────────────────────────────────
function EditableNumber({ value, suffix, onSave, align = "right" }: {
  value: number | null; suffix?: string; onSave: (v: number | null) => Promise<void>; align?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const [saving, setSaving] = useState(false);

  async function commit() {
    setSaving(true);
    const n = draft.trim() === "" ? null : parseFloat(draft);
    await onSave(isNaN(n as number) ? null : n);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <input autoFocus type="number" value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        disabled={saving}
        className="w-20 bg-white/10 border border-[#f08122]/60 rounded px-1.5 py-0.5 text-xs text-white text-right focus:outline-none"
      />
    );
  }
  return (
    <button onClick={() => { setDraft(value != null ? String(value) : ""); setEditing(true); }}
      className={`text-xs text-white/60 hover:text-white group tabular-nums text-${align}`}>
      {value != null
        ? <>{Math.round(value * 10) / 10}{suffix && <span className="text-white/30 ml-0.5">{suffix}</span>}</>
        : <span className="text-white/20 group-hover:text-white/40">—</span>}
      <span className="ml-1 opacity-0 group-hover:opacity-40 text-[9px]">✎</span>
    </button>
  );
}

function EditableDate({ value, onSave, placeholder = "Set date" }: {
  value: string | null; onSave: (v: string | null) => Promise<void>; placeholder?: string;
}) {
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
      className="text-left text-xs text-white/60 hover:text-white group">
      {value || <span className="text-white/20 group-hover:text-white/40">{placeholder}</span>}
      <span className="ml-1 opacity-0 group-hover:opacity-40 text-[9px]">✎</span>
    </button>
  );
}

function EditableStatus({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  async function onChange(v: string) { setSaving(true); await onSave(v); setSaving(false); }
  return (
    <select value={value} onChange={e => onChange(e.target.value)} disabled={saving}
      className={`text-[10px] font-condensed uppercase tracking-widest rounded-full px-2 py-0.5 border-0 focus:outline-none cursor-pointer ${STATUS_COLOR[value] ?? "bg-white/10 text-white/40"} ${saving ? "opacity-50" : ""}`}
      style={{ background: "transparent" }}>
      {STATUS_ORDER.map(s => (
        <option key={s} value={s} className="bg-[#2d2d2d] text-white normal-case">{STATUS_LABEL[s]}</option>
      ))}
    </select>
  );
}

function EditableSelect({ value, options, placeholder, onSave }: {
  value: string | null; options: { value: string; label: string }[];
  placeholder?: string; onSave: (v: string | null) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  async function onChange(v: string) { setSaving(true); await onSave(v || null); setSaving(false); }
  return (
    <select value={value ?? ""} onChange={e => onChange(e.target.value)} disabled={saving}
      className={`text-xs text-white bg-transparent hover:bg-white/5 rounded px-1 py-0.5 border border-transparent hover:border-white/20 focus:outline-none focus:border-[#f08122]/60 cursor-pointer w-full transition-colors ${saving ? "opacity-50" : ""}`}>
      {options.map(o => (
        <option key={o.value} value={o.value} className="bg-[#2d2d2d] text-white">{o.label || placeholder}</option>
      ))}
    </select>
  );
}

function EditablePmSelect({ value, pms, onSave }: {
  value: string | null; pms: Pm[]; onSave: (v: string | null) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  async function onChange(v: string) { setSaving(true); await onSave(v || null); setSaving(false); }
  return (
    <select value={value ?? ""} onChange={e => onChange(e.target.value)} disabled={saving}
      className={`text-xs text-white bg-transparent hover:bg-white/5 rounded px-1 py-0.5 border border-transparent hover:border-white/20 focus:outline-none focus:border-[#f08122]/60 cursor-pointer w-full transition-colors ${saving ? "opacity-50" : ""}`}>
      <option value="" className="bg-[#2d2d2d] text-white/40">— Assign PM</option>
      {pms.map(p => (
        <option key={p.id} value={p.name} className="bg-[#2d2d2d] text-white">{p.name}</option>
      ))}
    </select>
  );
}

export default function PipelineClient() {
  const [jobs, setJobs]         = useState<PipelineJob[]>([]);
  const [pms, setPms]           = useState<Pm[]>([]);
  const [capacity, setCapacity] = useState<Capacity>({ shop_capacity_hrs_per_week: 40, install_capacity_hrs_per_week: 32 });
  const [loading, setLoading]   = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editingCapacity, setEditingCapacity] = useState(false);
  const [capDraft, setCapDraft] = useState<Capacity>({ shop_capacity_hrs_per_week: 40, install_capacity_hrs_per_week: 32 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/pipeline");
      const d = await r.json();
      setJobs(d.jobs ?? []);
      setPms(d.pms ?? []);
      setCapacity(d.capacity ?? { shop_capacity_hrs_per_week: 40, install_capacity_hrs_per_week: 32 });
      setCapDraft(d.capacity ?? { shop_capacity_hrs_per_week: 40, install_capacity_hrs_per_week: 32 });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function patchJob(jobId: string, updates: Record<string, unknown>) {
    await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...updates, _actor: "admin", _actorRole: "admin" }),
    });
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...updates } : j));
  }

  const saveCapacity = async () => {
    await fetch("/api/admin/pipeline", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(capDraft),
    });
    setCapacity(capDraft);
    setEditingCapacity(false);
  };

  const visible = filterStatus === "all" ? jobs : jobs.filter(j => j.status === filterStatus);

  function exportCSV() {
    const rows = [
      ["Job#", "Client", "Address", "Status", "PM", "Value $", "Boxes", "Shop Hrs", "Install Type", "Install Hrs", "Delivery", "Install Start"],
      ...visible.map(j => [
        j.job_number ?? "",
        j.client_name,
        [j.site_address, j.city].filter(Boolean).join(", "),
        j.status,
        j.pm ?? "",
        j.sell_price_snapshot != null ? String(Math.round(j.sell_price_snapshot))
          : j.estimated_value != null ? String(Math.round(j.estimated_value)) : "",
        j.box_count != null ? String(j.box_count) : "",
        j.shop_hrs != null ? String(j.shop_hrs) : "",
        installTypeLabel(j.install_type),
        j.install_hrs != null ? String(j.install_hrs) : "",
        j.anticipated_delivery ?? j.delivery_date ?? "",
        j.install_start_date ?? "",
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `pipeline-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  const totalValue   = visible.reduce((s, j) => s + (j.sell_price_snapshot ?? j.estimated_value ?? 0), 0);
  const totalBoxes   = visible.reduce((s, j) => s + (j.box_count ?? 0), 0);
  const totalShop    = visible.reduce((s, j) => s + (j.shop_hrs ?? 0), 0);
  const totalInstall = visible.reduce((s, j) => s + (j.install_hrs ?? 0), 0);

  const shopWeeks    = capacity.shop_capacity_hrs_per_week > 0 ? totalShop / capacity.shop_capacity_hrs_per_week : 0;
  const installWeeks = capacity.install_capacity_hrs_per_week > 0 ? totalInstall / capacity.install_capacity_hrs_per_week : 0;
  const shopPct      = capacity.shop_capacity_hrs_per_week > 0
    ? Math.min((totalShop / (capacity.shop_capacity_hrs_per_week * 8)) * 100, 200) : 0;
  const installPct   = capacity.install_capacity_hrs_per_week > 0
    ? Math.min((totalInstall / (capacity.install_capacity_hrs_per_week * 8)) * 100, 200) : 0;

  const statusCounts = STATUS_ORDER.reduce<Record<string,number>>((acc, s) => {
    acc[s] = jobs.filter(j => j.status === s).length;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#0d0e0f] text-white px-4 py-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-white/40 text-xs font-condensed uppercase tracking-widest mb-1">Admin</div>
          <h1 className="font-heading text-3xl uppercase tracking-wide text-[#f08122]">Pipeline</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={exportCSV} className="text-white/40 hover:text-[#f08122] text-xs font-condensed uppercase tracking-widest border border-white/15 hover:border-[#f08122]/40 rounded px-3 py-1.5 transition-colors">Export CSV</button>
          <Link href="/admin" className="text-white/40 hover:text-white text-sm transition-colors">← Admin</Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-[#1a1b1c] border border-white/10 rounded-xl p-4">
          <div className="text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-1">Pipeline Value</div>
          <div className="text-2xl font-semibold tabular-nums">{fmt$(totalValue)}</div>
          <div className="text-white/30 text-xs mt-1">{visible.length} active jobs · {totalBoxes} boxes</div>
          <div className="text-white/20 text-[10px] mt-0.5">quoted price or PM est</div>
        </div>
        <div className="bg-[#1a1b1c] border border-white/10 rounded-xl p-4">
          <div className="text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-1">Shop Hours</div>
          <div className="text-2xl font-semibold tabular-nums">{totalShop > 0 ? totalShop.toFixed(0) : "—"}</div>
          {totalShop > 0
            ? <div className="text-white/30 text-xs mt-1">{shopWeeks.toFixed(1)} wks at {capacity.shop_capacity_hrs_per_week} hrs/wk</div>
            : <div className="text-white/20 text-xs mt-1">Enter shop hrs per job ↓</div>}
          {totalShop > 0 && (
            <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${shopPct > 100 ? "bg-red-500" : shopPct > 75 ? "bg-amber-400" : "bg-[#f08122]"}`}
                style={{ width: `${Math.min(shopPct, 100)}%` }} />
            </div>
          )}
        </div>
        <div className="bg-[#1a1b1c] border border-white/10 rounded-xl p-4">
          <div className="text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-1">Install Hours</div>
          <div className="text-2xl font-semibold tabular-nums">{totalInstall > 0 ? totalInstall.toFixed(0) : "—"}</div>
          {totalInstall > 0
            ? <div className="text-white/30 text-xs mt-1">{installWeeks.toFixed(1)} wks at {capacity.install_capacity_hrs_per_week} hrs/wk</div>
            : <div className="text-white/20 text-xs mt-1">Enter install hrs per job ↓</div>}
          {totalInstall > 0 && (
            <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${installPct > 100 ? "bg-red-500" : installPct > 75 ? "bg-amber-400" : "bg-blue-400"}`}
                style={{ width: `${Math.min(installPct, 100)}%` }} />
            </div>
          )}
        </div>
        <div className="bg-[#1a1b1c] border border-white/10 rounded-xl p-4">
          <div className="text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-2">Capacity / Week</div>
          {editingCapacity ? (
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-white/40 font-condensed uppercase tracking-widest">Shop hrs/wk</label>
                <input type="number" value={capDraft.shop_capacity_hrs_per_week}
                  onChange={e => setCapDraft(d => ({ ...d, shop_capacity_hrs_per_week: +e.target.value }))}
                  className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-sm text-white mt-0.5" />
              </div>
              <div>
                <label className="text-[10px] text-white/40 font-condensed uppercase tracking-widest">Install hrs/wk</label>
                <input type="number" value={capDraft.install_capacity_hrs_per_week}
                  onChange={e => setCapDraft(d => ({ ...d, install_capacity_hrs_per_week: +e.target.value }))}
                  className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-sm text-white mt-0.5" />
              </div>
              <div className="flex gap-2">
                <button onClick={saveCapacity} className="flex-1 bg-[#f08122] hover:bg-[#d9711e] text-white text-xs font-condensed uppercase tracking-widest rounded px-2 py-1.5 transition-colors">Save</button>
                <button onClick={() => { setEditingCapacity(false); setCapDraft(capacity); }} className="flex-1 border border-white/20 hover:border-white/40 text-white/60 text-xs font-condensed uppercase tracking-widest rounded px-2 py-1.5 transition-colors">Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-sm text-white/70">Shop: <span className="text-white font-semibold">{capacity.shop_capacity_hrs_per_week} hrs</span></div>
              <div className="text-sm text-white/70 mt-0.5">Install: <span className="text-white font-semibold">{capacity.install_capacity_hrs_per_week} hrs</span></div>
              <button onClick={() => setEditingCapacity(true)} className="mt-2 text-[10px] font-condensed uppercase tracking-widest text-white/30 hover:text-[#f08122] transition-colors">Edit ↗</button>
            </div>
          )}
        </div>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setFilterStatus("all")}
          className={`px-3 py-1 rounded-full text-[10px] font-condensed uppercase tracking-widest transition-colors ${filterStatus === "all" ? "bg-[#f08122] text-white" : "bg-white/5 text-white/40 hover:text-white"}`}>
          All ({jobs.length})
        </button>
        {STATUS_ORDER.filter(s => s !== "complete").map(s => (
          statusCounts[s] > 0 && (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1 rounded-full text-[10px] font-condensed uppercase tracking-widest transition-colors ${filterStatus === s ? "bg-[#f08122] text-white" : "bg-white/5 text-white/40 hover:text-white"}`}>
              {STATUS_LABEL[s]} ({statusCounts[s]})
            </button>
          )
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center text-white/30 py-20 text-sm">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/40 text-[10px] font-condensed uppercase tracking-widest">
                <th className="text-left px-4 py-3">Job</th>
                <th className="text-left px-4 py-3">Status <span className="text-white/20 normal-case font-normal">✎</span></th>
                <th className="text-left px-4 py-3">PM <span className="text-white/20 normal-case font-normal">✎</span></th>
                <th className="text-right px-4 py-3" title="Quoted price (estimate) or PM's estimated value">Value</th>
                <th className="text-right px-4 py-3">Boxes</th>
                <th className="text-right px-4 py-3" title="Estimated shop production hours — enter manually">Shop hrs <span className="text-white/20 normal-case font-normal">✎</span></th>
                <th className="text-left px-3 py-3" title="Install method">Install <span className="text-white/20 normal-case font-normal">✎</span></th>
                <th className="text-right px-4 py-3" title="Estimated install hours — enter manually">Install hrs <span className="text-white/20 normal-case font-normal">✎</span></th>
                <th className="text-left px-4 py-3">Delivery <span className="text-white/20 normal-case font-normal">✎</span></th>
                <th className="text-left px-4 py-3">Install start <span className="text-white/20 normal-case font-normal">✎</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((job) => (
                <tr key={job.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/jobs/${job.id}`} className="hover:text-[#f08122] transition-colors">
                      <div className="font-medium text-white">{job.client_name}</div>
                      <div className="text-white/40 text-xs">{job.job_number} · {[job.site_address, job.city].filter(Boolean).join(", ")}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <EditableStatus value={job.status} onSave={v => patchJob(job.id, { status: v })} />
                  </td>
                  <td className="px-4 py-2 min-w-[100px]">
                    <EditablePmSelect value={job.pm} pms={pms} onSave={v => patchJob(job.id, { pm: v })} />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-xs">
                    {job.sell_price_snapshot != null ? (
                      <span className="text-white">{fmt$(job.sell_price_snapshot)}</span>
                    ) : job.estimated_value != null ? (
                      <span className="text-white/50" title="PM estimate — no quoted price yet">{fmt$(job.estimated_value)}<span className="text-white/25 text-[9px] ml-1">est</span></span>
                    ) : <span className="text-white/20">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs text-white/60">
                    {job.box_count ? (
                      <span title={job.fg_boxes ? job.fg_boxes.map(fg => `${fg.label}: ${fg.boxes}`).join("\n") : ""}>
                        {job.box_count}
                        {job.fg_boxes && job.fg_boxes.length > 1 && <span className="text-white/25 ml-1 text-[9px]">({job.fg_boxes.length}FG)</span>}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <EditableNumber value={job.shop_hrs} suffix="h"
                      onSave={v => patchJob(job.id, { shop_hrs: v })} />
                  </td>
                  <td className="px-3 py-2 min-w-[110px]">
                    <EditableSelect
                      value={job.install_type}
                      options={INSTALL_TYPE_OPTIONS}
                      onSave={v => patchJob(job.id, { install_type: v })}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    {job.install_type === "delivery_only"
                      ? <span className="text-white/20 text-xs">n/a</span>
                      : <EditableNumber value={job.install_hrs} suffix="h"
                          onSave={v => patchJob(job.id, { install_hrs: v })} />}
                  </td>
                  <td className="px-4 py-2 min-w-[110px]">
                    <EditableDate
                      value={job.anticipated_delivery ?? job.delivery_date}
                      onSave={v => patchJob(job.id, { delivery_date: v })}
                    />
                    {job.anticipated_delivery && job.anticipated_delivery !== job.delivery_date &&
                      <div className="text-white/20 text-[9px] px-0.5">from schedule</div>}
                  </td>
                  <td className="px-4 py-2 min-w-[110px]">
                    <EditableDate
                      value={job.install_start_date}
                      placeholder="Set start"
                      onSave={v => patchJob(job.id, { install_start_date: v })}
                    />
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={10} className="text-center text-white/20 py-12 text-sm">No active jobs</td></tr>
              )}
            </tbody>
            {visible.length > 0 && (
              <tfoot>
                <tr className="border-t border-white/10 text-white/50 text-xs font-condensed">
                  <td className="px-4 py-2" colSpan={3}>Totals ({visible.length} jobs)</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-white">{fmt$(totalValue)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totalBoxes || "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totalShop > 0 ? totalShop.toFixed(0) + "h" : "—"}</td>
                  <td />
                  <td className="px-4 py-2 text-right tabular-nums">{totalInstall > 0 ? totalInstall.toFixed(0) + "h" : "—"}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <p className="text-white/20 text-[10px] font-condensed mt-4">
        Shop hrs and Install hrs are entered directly on this page and feed the capacity summary above. Delivery and Install Start dates are editable — click any cell.
      </p>
    </div>
  );
}
