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

type EngConfig = {
  break1: number; break2: number;
  rate1: number; rate2: number; rate3: number;
  mult0: number; mult1: number; mult2: number;
  fixedFloor: number;
};
const DEFAULT_ENG_CFG: EngConfig = {
  break1: 25000, break2: 45000,
  rate1: 0.001, rate2: 0.00025, rate3: 0.0001,
  mult0: 0.5, mult1: 1.0, mult2: 1.75,
  fixedFloor: 2,
};
function calcWOEng(baseValue: number, complexity: number | null, cfg: EngConfig): number {
  const c = complexity ?? 1;
  const mult = c === 0 ? cfg.mult0 : c === 2 ? cfg.mult2 : cfg.mult1;
  const adj = baseValue * mult;
  let h = 0;
  if (adj <= cfg.break1) h = adj * cfg.rate1;
  else if (adj <= cfg.break2) h = cfg.break1 * cfg.rate1 + (adj - cfg.break1) * cfg.rate2;
  else h = cfg.break1 * cfg.rate1 + (cfg.break2 - cfg.break1) * cfg.rate2 + (adj - cfg.break2) * cfg.rate3;
  return h + cfg.fixedFloor;
}
function fgEffWOs(fg: FgBox): number {
  if (fg.wos != null && fg.wos > 0) return fg.wos;
  if (!fg.boxes || fg.boxes <= 0) return 1;
  return Math.max(1, Math.ceil(fg.boxes / 65));
}
function calcEngHrs(job: PipelineJob, cfg: EngConfig): number | null {
  if (!job.estimated_value) return null;
  const fgs = job.fg_boxes;
  if (fgs && fgs.length > 0) {
    const totalWOs = fgs.reduce((s, fg) => s + fgEffWOs(fg), 0);
    if (totalWOs === 0) return null;
    const base = job.estimated_value / totalWOs;
    const total = fgs.reduce((sum, fg) => {
      const wos = fgEffWOs(fg);
      return sum + calcWOEng(base, fg.complexity ?? job.pm_complexity, cfg) * wos;
    }, 0);
    return Math.round(total * 10) / 10;
  } else {
    const boxes = job.job_box_count;
    const totalWOs = boxes ? Math.ceil(boxes / 65) : 1;
    const base = job.estimated_value / totalWOs;
    return Math.round(calcWOEng(base, job.pm_complexity, cfg) * totalWOs * 10) / 10;
  }
}

type FgBox = { label: string; boxes: number; wos?: number | null; complexity?: number | null };
type PipelineJob = {
  id: string; client_name: string; site_address: string; city: string;
  status: string; job_number: string; pm: string | null;
  delivery_date: string | null; anticipated_delivery: string | null; seq: number;
  estimate_id: string | null;
  estimated_value: number | null;
  sell_price_snapshot: number | null;
  shop_labor_hrs_snapshot: number | null;
  install_labor_hrs_snapshot: number | null;
  box_count: number | null;
  job_box_count: number | null;
  job_wo_count: number | null;
  pm_complexity: number | null;
  fg_boxes: FgBox[] | null;
};
type Pm = { id: string; name: string };
type Capacity = { shop_capacity_hrs_per_week: number; install_capacity_hrs_per_week: number };

function fmt$(n: number | null) {
  if (n == null) return "—";
  return "$" + Math.round(n).toLocaleString();
}
function fmtHrs(n: number | null) {
  if (n == null || n === 0) return "—";
  return n.toFixed(1) + " hrs";
}

// ── Inline editable cell ──────────────────────────────────────────────────────
function EditableText({ value, onSave, placeholder = "—" }: {
  value: string | null; onSave: (v: string) => Promise<void>; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  async function commit() {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        disabled={saving}
        className="w-full bg-white/10 border border-[#f08122]/60 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
      />
    );
  }
  return (
    <button onClick={() => { setDraft(value ?? ""); setEditing(true); }}
      className="text-left text-xs text-white/60 hover:text-white w-full group">
      {value || <span className="text-white/20 group-hover:text-white/40">{placeholder}</span>}
      <span className="ml-1 opacity-0 group-hover:opacity-40 text-[9px]">✎</span>
    </button>
  );
}

function EditableDate({ value, onSave }: { value: string | null; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  async function commit(v: string) {
    setSaving(true);
    await onSave(v);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus type="date" value={draft}
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
      {value || <span className="text-white/20 group-hover:text-white/40">Set date</span>}
      <span className="ml-1 opacity-0 group-hover:opacity-40 text-[9px]">✎</span>
    </button>
  );
}

function EditableStatus({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  async function onChange(v: string) {
    setSaving(true);
    await onSave(v);
    setSaving(false);
  }
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
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

function EditableSelect({ value, options, placeholder, onSave }: {
  value: string | null; options: { id: string; name: string }[];
  placeholder?: string; onSave: (v: string | null) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  async function onChange(v: string) {
    setSaving(true);
    await onSave(v || null);
    setSaving(false);
  }
  return (
    <select
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
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

function EditableNumber({ value, prefix, suffix, onSave }: {
  value: number | null; prefix?: string; suffix?: string;
  onSave: (v: number | null) => Promise<void>;
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
      className="text-xs text-white/60 hover:text-white group tabular-nums">
      {value != null ? `${prefix ?? ""}${Math.round(value).toLocaleString()}${suffix ?? ""}` : <span className="text-white/20 group-hover:text-white/40">—</span>}
      <span className="ml-1 opacity-0 group-hover:opacity-40 text-[9px]">✎</span>
    </button>
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
  const [engCfg, setEngCfg] = useState<EngConfig>(DEFAULT_ENG_CFG);

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
  useEffect(() => {
    try {
      const s = localStorage.getItem("acc_eng_config");
      if (s) setEngCfg(cfg => ({ ...cfg, ...JSON.parse(s) }));
    } catch {}
  }, []);

  async function patchJob(jobId: string, updates: Record<string, string | null>) {
    await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...updates, _actor: "admin", _actorRole: "admin" }),
    });
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...updates } : j));
  }

  async function patchSnapshot(estimateId: string, updates: Record<string, number | null>) {
    await fetch(`/api/estimates/${estimateId}/snapshot`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setJobs(prev => prev.map(j => j.estimate_id === estimateId ? { ...j, ...updates } : j));
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
      ["Job#", "Client", "Address", "Status", "PM", "Quoted $", "Est Value $", "Boxes", "FG Breakdown", "ENG Hrs", "Shop Hrs", "Install Hrs", "Delivery"],
      ...visible.map(j => [
        j.job_number ?? "",
        j.client_name,
        [j.site_address, j.city].filter(Boolean).join(", "),
        j.status,
        j.pm ?? "",
        j.sell_price_snapshot != null ? String(Math.round(j.sell_price_snapshot)) : "",
        j.estimated_value != null ? String(Math.round(j.estimated_value)) : "",
        j.box_count != null ? String(j.box_count) : "",
        j.fg_boxes ? j.fg_boxes.map(fg => `${fg.label}: ${fg.boxes}`).join(" | ") : "",
        (() => { const h = calcEngHrs(j, engCfg); return h != null ? String(h) : ""; })(),
        j.shop_labor_hrs_snapshot != null ? String(j.shop_labor_hrs_snapshot) : "",
        j.install_labor_hrs_snapshot != null ? String(j.install_labor_hrs_snapshot) : "",
        j.anticipated_delivery ?? j.delivery_date ?? "",
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `pipeline-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  const totalShop    = visible.reduce((s, j) => s + (j.shop_labor_hrs_snapshot ?? 0), 0);
  const totalInstall = visible.reduce((s, j) => s + (j.install_labor_hrs_snapshot ?? 0), 0);
  const totalEng     = visible.reduce((s, j) => s + (calcEngHrs(j, engCfg) ?? 0), 0);
  const totalValue   = visible.reduce((s, j) => s + (j.sell_price_snapshot ?? j.estimated_value ?? 0), 0);
  const totalBoxes   = visible.reduce((s, j) => s + (j.box_count ?? 0), 0);

  const shopWeeks    = capacity.shop_capacity_hrs_per_week > 0 ? totalShop / capacity.shop_capacity_hrs_per_week : 0;
  const installWeeks = capacity.install_capacity_hrs_per_week > 0 ? totalInstall / capacity.install_capacity_hrs_per_week : 0;
  const shopPct      = capacity.shop_capacity_hrs_per_week > 0 ? Math.min((totalShop / (capacity.shop_capacity_hrs_per_week * 8)) * 100, 200) : 0;
  const installPct   = capacity.install_capacity_hrs_per_week > 0 ? Math.min((totalInstall / (capacity.install_capacity_hrs_per_week * 8)) * 100, 200) : 0;

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
          <div className="text-white/20 text-[10px] mt-0.5">quoted + PM est</div>
        </div>
        <div className="bg-[#1a1b1c] border border-white/10 rounded-xl p-4">
          <div className="text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-1">Shop Hours</div>
          <div className="text-2xl font-semibold tabular-nums">{totalShop.toFixed(0)} hrs</div>
          <div className="text-white/30 text-xs mt-1">{shopWeeks.toFixed(1)} wks at {capacity.shop_capacity_hrs_per_week} hrs/wk cap</div>
          <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${shopPct > 100 ? "bg-red-500" : shopPct > 75 ? "bg-amber-400" : "bg-[#f08122]"}`} style={{ width: `${Math.min(shopPct, 100)}%` }} />
          </div>
        </div>
        <div className="bg-[#1a1b1c] border border-white/10 rounded-xl p-4">
          <div className="text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-1">Install Hours</div>
          <div className="text-2xl font-semibold tabular-nums">{totalInstall.toFixed(0)} hrs</div>
          <div className="text-white/30 text-xs mt-1">{installWeeks.toFixed(1)} wks at {capacity.install_capacity_hrs_per_week} hrs/wk cap</div>
          <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${installPct > 100 ? "bg-red-500" : installPct > 75 ? "bg-amber-400" : "bg-blue-400"}`} style={{ width: `${Math.min(installPct, 100)}%` }} />
          </div>
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
                <th className="text-right px-4 py-3" title="Quoted price from estimate engine — see Constraints for PM's estimated value">Quoted $</th>
                <th className="text-right px-4 py-3">Boxes</th>
                <th className="text-right px-4 py-3" title="ENG hours — same formula as Constraints page (est value × complexity through bracket table). Uses your saved config from Constraints.">ENG hrs</th>
                <th className="text-right px-4 py-3">Shop hrs</th>
                <th className="text-right px-4 py-3">Install hrs</th>
                <th className="text-left px-4 py-3">PM <span className="text-white/20 normal-case font-normal">✎</span></th>
                <th className="text-left px-4 py-3">Target delivery <span className="text-white/20 normal-case font-normal">✎</span></th>
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
                    {job.estimate_id && (
                      <Link href={`/admin/estimating/${job.estimate_id}`}
                        className="text-[10px] text-white/25 hover:text-[#f08122] transition-colors font-condensed">
                        {job.sell_price_snapshot ? "Est ↗" : "Est (no snapshot yet) ↗"}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <EditableStatus
                      value={job.status}
                      onSave={v => patchJob(job.id, { status: v })}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    {job.estimate_id ? (
                      <div>
                        <EditableNumber value={job.sell_price_snapshot} prefix="$"
                          onSave={v => patchSnapshot(job.estimate_id!, { sell_price_snapshot: v })} />
                        {!job.sell_price_snapshot && job.estimated_value &&
                          <div className="text-white/30 text-[10px]">est: {fmt$(job.estimated_value)}</div>}
                      </div>
                    ) : job.estimated_value ? (
                      <div className="text-right">
                        <span className="text-white/50 tabular-nums text-xs">{fmt$(job.estimated_value)}</span>
                        <div className="text-white/20 text-[10px]">PM est</div>
                      </div>
                    ) : <span className="text-white/20 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs text-white/60">
                    {job.box_count ? (
                      <span title={job.fg_boxes ? job.fg_boxes.map(fg => `${fg.label}: ${fg.boxes}`).join("\n") : ""}>
                        {job.box_count}
                        {job.fg_boxes && job.fg_boxes.length > 1 && <span className="text-white/30 ml-1">({job.fg_boxes.length} FGs)</span>}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs text-white/60">
                    {(() => { const h = calcEngHrs(job, engCfg); return h != null ? <span>{h.toFixed(1)} <span className="text-white/25">hrs</span></span> : <span className="text-white/20">—</span>; })()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {job.estimate_id ? (
                      <EditableNumber value={job.shop_labor_hrs_snapshot} suffix=" hrs"
                        onSave={v => patchSnapshot(job.estimate_id!, { shop_labor_hrs_snapshot: v })} />
                    ) : <span className="text-white/20 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {job.estimate_id ? (
                      <EditableNumber value={job.install_labor_hrs_snapshot} suffix=" hrs"
                        onSave={v => patchSnapshot(job.estimate_id!, { install_labor_hrs_snapshot: v })} />
                    ) : <span className="text-white/20 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2 min-w-[100px]">
                    <EditableSelect
                      value={job.pm}
                      options={pms}
                      placeholder="Assign PM"
                      onSave={v => patchJob(job.id, { pm: v })}
                    />
                  </td>
                  <td className="px-4 py-2 min-w-[110px]">
                    <EditableDate
                      value={job.anticipated_delivery ?? job.delivery_date}
                      onSave={v => patchJob(job.id, { delivery_date: v || null })}
                    />
                    {job.anticipated_delivery && job.anticipated_delivery !== job.delivery_date &&
                      <div className="text-white/20 text-[10px] px-1">from schedule</div>}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={9} className="text-center text-white/20 py-12 text-sm">No active jobs</td></tr>
              )}
            </tbody>
            {visible.length > 0 && (
              <tfoot>
                <tr className="border-t border-white/10 text-white/50 text-xs font-condensed">
                  <td className="px-4 py-2" colSpan={2}>Totals ({visible.length} jobs)</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-white">{fmt$(totalValue)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totalBoxes}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totalEng > 0 ? totalEng.toFixed(1) : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totalShop.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totalInstall.toFixed(1)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <p className="text-white/20 text-[10px] font-condensed mt-4">
        Value / hours / boxes update when an estimate is open. Status, PM, and delivery date are editable — click any cell to change it.
      </p>
    </div>
  );
}
