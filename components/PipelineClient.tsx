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

type PipelineJob = {
  id: string; client_name: string; site_address: string; city: string;
  status: string; job_number: string; pm: string | null;
  delivery_date: string | null; seq: number;
  estimate_id: string | null; estimate_title: string | null;
  scope: string | null; estimate_status: string | null;
  sell_price_snapshot: number | null;
  shop_labor_hrs_snapshot: number | null;
  install_labor_hrs_snapshot: number | null;
  estimate_updated_at: string | null;
  box_count: number | null;
};
type Capacity = { shop_capacity_hrs_per_week: number; install_capacity_hrs_per_week: number };

function fmt$(n: number | null) {
  if (n == null) return "—";
  return "$" + Math.round(n).toLocaleString();
}
function fmtHrs(n: number | null) {
  if (n == null || n === 0) return "—";
  return n.toFixed(1) + " hrs";
}

export default function PipelineClient() {
  const [jobs, setJobs]         = useState<PipelineJob[]>([]);
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
      setCapacity(d.capacity ?? { shop_capacity_hrs_per_week: 40, install_capacity_hrs_per_week: 32 });
      setCapDraft(d.capacity ?? { shop_capacity_hrs_per_week: 40, install_capacity_hrs_per_week: 32 });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  // Totals for visible jobs with snapshots
  const totalShop    = visible.reduce((s, j) => s + (j.shop_labor_hrs_snapshot ?? 0), 0);
  const totalInstall = visible.reduce((s, j) => s + (j.install_labor_hrs_snapshot ?? 0), 0);
  const totalValue   = visible.reduce((s, j) => s + (j.sell_price_snapshot ?? 0), 0);
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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-white/40 text-xs font-condensed uppercase tracking-widest mb-1">Admin</div>
          <h1 className="font-heading text-3xl uppercase tracking-wide text-[#f08122]">Pipeline</h1>
        </div>
        <Link href="/admin" className="text-white/40 hover:text-white text-sm transition-colors">← Admin</Link>
      </div>

      {/* Capacity + Totals cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-[#1a1b1c] border border-white/10 rounded-xl p-4">
          <div className="text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-1">Pipeline Value</div>
          <div className="text-2xl font-semibold tabular-nums">{fmt$(totalValue)}</div>
          <div className="text-white/30 text-xs mt-1">{visible.length} active jobs · {totalBoxes} boxes</div>
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

      {/* Status filter tabs */}
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
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Value</th>
                <th className="text-right px-4 py-3">Boxes</th>
                <th className="text-right px-4 py-3">Shop hrs</th>
                <th className="text-right px-4 py-3">Install hrs</th>
                <th className="text-left px-4 py-3">PM</th>
                <th className="text-left px-4 py-3">Target delivery</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((job) => {
                const hasSnapshot = job.sell_price_snapshot != null;
                return (
                  <tr key={job.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/jobs/${job.id}`} className="hover:text-[#f08122] transition-colors">
                        <div className="font-medium text-white">{job.client_name}</div>
                        <div className="text-white/40 text-xs">{job.job_number} · {[job.site_address, job.city].filter(Boolean).join(", ")}</div>
                        {job.estimate_id && (
                          <Link href={`/admin/estimating/${job.estimate_id}`} className="text-[10px] text-white/25 hover:text-[#f08122] transition-colors font-condensed">
                            {hasSnapshot ? "Est ↗" : "Est (no snapshot) ↗"}
                          </Link>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-condensed uppercase tracking-widest ${STATUS_COLOR[job.status] ?? "bg-white/10 text-white/40"}`}>
                        {STATUS_LABEL[job.status] ?? job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt$(job.sell_price_snapshot)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{job.box_count ? job.box_count : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtHrs(job.shop_labor_hrs_snapshot)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtHrs(job.install_labor_hrs_snapshot)}</td>
                    <td className="px-4 py-3 text-white/60 text-xs">{job.pm ?? "—"}</td>
                    <td className="px-4 py-3 text-white/60 text-xs">{job.delivery_date ?? "—"}</td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr><td colSpan={8} className="text-center text-white/20 py-12 text-sm">No active jobs</td></tr>
              )}
            </tbody>
            {visible.length > 0 && (
              <tfoot>
                <tr className="border-t border-white/10 text-white/50 text-xs font-condensed">
                  <td className="px-4 py-2" colSpan={2}>Totals ({visible.length} jobs)</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-white">{fmt$(totalValue)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totalBoxes}</td>
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
        Values update automatically when an estimate is open and recalculated. "—" means no estimate has been saved for this job yet.
      </p>
    </div>
  );
}
