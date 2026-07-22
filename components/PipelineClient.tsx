"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const STATUS_ORDER = ["intake","design","engineering","shop","install","complete"];
const STATUS_LABEL: Record<string,string> = {
  intake:"Intake", design:"Design", engineering:"Engineering",
  shop:"Shop", install:"Install", complete:"Complete", cancelled:"Cancelled",
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
  { value: "",               label: "— Not set" },
  { value: "acc",            label: "ACC Crew" },
  { value: "sub",            label: "Sub" },
  { value: "delivery_only",  label: "Delivery Only" },
];
function installTypeLabel(v: string | null) {
  return INSTALL_TYPE_OPTIONS.find(o => o.value === (v ?? ""))?.label ?? "—";
}
function fmt$(n: number) {
  return "$" + Math.round(n).toLocaleString();
}
function monthKey(dateStr: string | null): string {
  if (!dateStr) return "No date";
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return "No date";
  return d.toLocaleDateString("en-US", { month:"short", year:"numeric" });
}
function monthSort(key: string): number {
  if (key === "No date") return 9999;
  const d = new Date("1 " + key);
  return isNaN(d.getTime()) ? 9998 : d.getTime();
}

type FgBox = { label: string; boxes: number };
type PipelineJob = {
  id: string; client_name: string; site_address: string; city: string;
  status: string; job_number: string | null; pm: string | null;
  delivery_date: string | null; install_start_date: string | null;
  anticipated_delivery: string | null;
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

// ── Editable components ───────────────────────────────────────────────────────
function EditableNumber({ value, suffix, onSave }: {
  value: number | null; suffix?: string; onSave: (v: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const [saving, setSaving] = useState(false);
  async function commit() {
    setSaving(true);
    const n = draft.trim() === "" ? null : parseFloat(draft);
    await onSave(isNaN(n as number) ? null : n);
    setSaving(false); setEditing(false);
  }
  if (editing) return (
    <input autoFocus type="number" value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key==="Enter") commit(); if (e.key==="Escape") setEditing(false); }}
      disabled={saving}
      className="w-16 bg-white/10 border border-[#f08122]/60 rounded px-1 py-0.5 text-xs text-white text-right focus:outline-none" />
  );
  return (
    <button onClick={() => { setDraft(value != null ? String(value) : ""); setEditing(true); }}
      className="text-xs text-right w-full text-white/60 hover:text-white group tabular-nums">
      {value != null
        ? <>{Math.round(value * 10)/10}{suffix && <span className="text-white/30 text-[9px] ml-0.5">{suffix}</span>}</>
        : <span className="text-white/20 group-hover:text-white/40">—</span>}
      <span className="ml-0.5 opacity-0 group-hover:opacity-30 text-[8px]">✎</span>
    </button>
  );
}

function EditableDate({ value, placeholder="Set date", onSave }: {
  value: string | null; placeholder?: string; onSave: (v: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  async function commit(v: string) {
    setSaving(true); await onSave(v || null); setSaving(false); setEditing(false);
  }
  if (editing) return (
    <input autoFocus type="date" value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => commit(draft)}
      onKeyDown={e => { if (e.key==="Enter") commit(draft); if (e.key==="Escape") setEditing(false); }}
      disabled={saving}
      className="bg-white/10 border border-[#f08122]/60 rounded px-1 py-0.5 text-[10px] text-white focus:outline-none" />
  );
  return (
    <button onClick={() => { setDraft(value ?? ""); setEditing(true); }}
      className="text-left text-[10px] text-white/60 hover:text-white group w-full">
      {value || <span className="text-white/20 group-hover:text-white/40">{placeholder}</span>}
      <span className="ml-0.5 opacity-0 group-hover:opacity-30 text-[8px]">✎</span>
    </button>
  );
}

function EditableStatus({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  return (
    <select value={value} onChange={async e => { setSaving(true); await onSave(e.target.value); setSaving(false); }}
      disabled={saving}
      className={`text-[9px] font-condensed uppercase tracking-widest rounded-full px-2 py-0.5 border-0 focus:outline-none cursor-pointer ${STATUS_COLOR[value] ?? "bg-white/10 text-white/40"} ${saving?"opacity-50":""}`}
      style={{background:"transparent"}}>
      {STATUS_ORDER.map(s => <option key={s} value={s} className="bg-[#2d2d2d] text-white normal-case">{STATUS_LABEL[s]}</option>)}
    </select>
  );
}

function EditableSelect({ value, options, onSave }: {
  value: string | null; options: {value:string;label:string}[]; onSave: (v:string|null) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <select value={value ?? ""} onChange={async e => { setSaving(true); await onSave(e.target.value||null); setSaving(false); }}
      disabled={saving}
      className={`text-[10px] text-white bg-transparent hover:bg-white/5 rounded px-1 py-0.5 border border-transparent hover:border-white/20 focus:outline-none focus:border-[#f08122]/60 cursor-pointer w-full transition-colors ${saving?"opacity-50":""}`}>
      {options.map(o => <option key={o.value} value={o.value} className="bg-[#2d2d2d] text-white">{o.label}</option>)}
    </select>
  );
}

function EditablePm({ value, pms, onSave }: { value:string|null; pms:Pm[]; onSave:(v:string|null)=>Promise<void> }) {
  const [saving, setSaving] = useState(false);
  return (
    <select value={value ?? ""} onChange={async e => { setSaving(true); await onSave(e.target.value||null); setSaving(false); }}
      disabled={saving}
      className={`text-[10px] text-white bg-transparent hover:bg-white/5 rounded px-1 py-0.5 border border-transparent hover:border-white/20 focus:outline-none cursor-pointer w-full transition-colors ${saving?"opacity-50":""}`}>
      <option value="" className="bg-[#2d2d2d] text-white/40">— PM</option>
      {pms.map(p => <option key={p.id} value={p.name} className="bg-[#2d2d2d] text-white">{p.name}</option>)}
    </select>
  );
}

// ── Quick-add modal ───────────────────────────────────────────────────────────
function QuickAddModal({ pms, onClose, onAdded }: { pms: Pm[]; onClose: () => void; onAdded: () => void }) {
  const blank = { client_name:"", job_number:"", city:"", pm:"", status:"intake",
    estimated_value:"", box_count:"", shop_hrs:"", install_type:"", install_hrs:"",
    delivery_date:"", install_start_date:"" };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(k: string, v: string) { setForm(f => ({...f, [k]: v})); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client_name.trim()) { setError("Client name is required"); return; }
    setSaving(true); setError("");
    try {
      const body: Record<string, unknown> = {
        client_name: form.client_name.trim(),
        city: form.city.trim() || "",
        site_address: "",
        pm: form.pm || null,
        status: form.status || "intake",
        install_type: form.install_type || null,
        delivery_date: form.delivery_date || null,
        install_start_date: form.install_start_date || null,
      };
      if (form.job_number.trim()) body.job_number = form.job_number.trim();
      if (form.estimated_value) body.estimated_value = parseFloat(form.estimated_value);
      if (form.box_count) body.box_count = parseInt(form.box_count);
      if (form.shop_hrs) body.shop_hrs = parseFloat(form.shop_hrs);
      if (form.install_hrs) body.install_hrs = parseFloat(form.install_hrs);

      const r = await fetch("/api/jobs", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
      if (!r.ok) { const d = await r.json(); setError(d.error ?? "Save failed"); setSaving(false); return; }

      // If shop_hrs or install_hrs set, PATCH them in (not in POST body currently)
      if (form.shop_hrs || form.install_hrs) {
        const job = await r.json();
        const jobId = job.id;
        if (jobId) {
          const patch: Record<string, unknown> = {};
          if (form.shop_hrs) patch.shop_hrs = parseFloat(form.shop_hrs);
          if (form.install_hrs) patch.install_hrs = parseFloat(form.install_hrs);
          await fetch(`/api/jobs/${jobId}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify(patch) });
        }
      }

      onAdded();
      setForm(blank);
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  }

  const inp = "w-full bg-white/10 border border-white/15 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#f08122]/60 placeholder-white/20";
  const lbl = "block text-[9px] font-condensed uppercase tracking-widest text-white/40 mb-1";

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 pt-16 px-4" onClick={onClose}>
      <div className="bg-[#1a1b1c] border border-white/15 rounded-2xl w-full max-w-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-heading text-xl uppercase tracking-wide text-[#f08122]">Add Job</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white text-lg">✕</button>
        </div>
        <form onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2 md:col-span-1">
              <label className={lbl}>Client Name *</label>
              <input className={inp} placeholder="Smith" value={form.client_name} onChange={e=>set("client_name",e.target.value)} autoFocus />
            </div>
            <div>
              <label className={lbl}>Job #</label>
              <input className={inp} placeholder="26400" value={form.job_number} onChange={e=>set("job_number",e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className={lbl}>City</label>
              <input className={inp} placeholder="Spokane" value={form.city} onChange={e=>set("city",e.target.value)} />
            </div>
            <div>
              <label className={lbl}>PM</label>
              <select value={form.pm} onChange={e=>set("pm",e.target.value)} className={inp + " cursor-pointer"}>
                <option value="">— Assign</option>
                {pms.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Status</label>
              <select value={form.status} onChange={e=>set("status",e.target.value)} className={inp + " cursor-pointer"}>
                {STATUS_ORDER.slice(0,5).map(s=><option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3 mb-3">
            <div>
              <label className={lbl}>Est Value $</label>
              <input type="number" className={inp} placeholder="85000" value={form.estimated_value} onChange={e=>set("estimated_value",e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Boxes</label>
              <input type="number" className={inp} placeholder="65" value={form.box_count} onChange={e=>set("box_count",e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Shop Hrs</label>
              <input type="number" className={inp} placeholder="320" value={form.shop_hrs} onChange={e=>set("shop_hrs",e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Install Hrs</label>
              <input type="number" className={inp} placeholder="80" value={form.install_hrs} onChange={e=>set("install_hrs",e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div>
              <label className={lbl}>Install Type</label>
              <select value={form.install_type} onChange={e=>set("install_type",e.target.value)} className={inp + " cursor-pointer"}>
                {INSTALL_TYPE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Delivery Date</label>
              <input type="date" className={inp} value={form.delivery_date} onChange={e=>set("delivery_date",e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Install Start</label>
              <input type="date" className={inp} value={form.install_start_date} onChange={e=>set("install_start_date",e.target.value)} />
            </div>
          </div>
          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="flex-1 bg-[#f08122] hover:bg-[#d9711e] disabled:opacity-50 text-white text-xs font-condensed uppercase tracking-widest rounded-lg px-4 py-2.5 transition-colors">
              {saving ? "Saving…" : "Add Job"}
            </button>
            <button type="submit"
              className="px-4 py-2.5 border border-white/20 hover:border-white/40 text-white/60 text-xs font-condensed uppercase tracking-widest rounded-lg transition-colors"
              onClick={() => { /* stays on form after save */ }}>
              + Another
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 border border-white/10 text-white/30 text-xs font-condensed uppercase tracking-widest rounded-lg hover:text-white/50 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PipelineClient() {
  const [jobs, setJobs]       = useState<PipelineJob[]>([]);
  const [pms, setPms]         = useState<Pm[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/pipeline");
      const d = await r.json();
      setJobs((d.jobs ?? []).map((j: PipelineJob) => ({
        ...j,
        sell_price_snapshot: j.sell_price_snapshot != null ? Number(j.sell_price_snapshot) : null,
        estimated_value:     j.estimated_value     != null ? Number(j.estimated_value)     : null,
        shop_hrs:            j.shop_hrs            != null ? Number(j.shop_hrs)            : null,
        install_hrs:         j.install_hrs         != null ? Number(j.install_hrs)         : null,
        box_count:           j.box_count           != null ? Number(j.box_count)           : null,
      })));
      setPms(d.pms ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function patchJob(jobId: string, updates: Record<string, unknown>) {
    await fetch(`/api/jobs/${jobId}`, {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({...updates, _actor:"admin", _actorRole:"admin"}),
    });
    setJobs(prev => prev.map(j => j.id === jobId ? {...j, ...updates} : j));
  }

  // Month buckets based on anticipated delivery
  type MonthBucket = { key: string; value: number; boxes: number; shopHrs: number; installHrs: number; count: number };
  const monthBuckets = (() => {
    const map = new Map<string, MonthBucket>();
    for (const j of jobs) {
      const key = monthKey(j.anticipated_delivery ?? j.delivery_date);
      const existing = map.get(key) ?? { key, value:0, boxes:0, shopHrs:0, installHrs:0, count:0 };
      existing.value    += j.sell_price_snapshot ?? j.estimated_value ?? 0;
      existing.boxes    += j.box_count ?? 0;
      existing.shopHrs  += j.shop_hrs ?? 0;
      existing.installHrs += j.install_hrs ?? 0;
      existing.count    += 1;
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a,b) => monthSort(a.key) - monthSort(b.key));
  })();

  // Apply filters
  let visible = jobs;
  if (filterMonth !== "all") {
    visible = visible.filter(j => monthKey(j.anticipated_delivery ?? j.delivery_date) === filterMonth);
  }
  if (filterStatus !== "all") {
    visible = visible.filter(j => j.status === filterStatus);
  }

  const totalValue   = visible.reduce((s,j) => s + (j.sell_price_snapshot ?? j.estimated_value ?? 0), 0);
  const totalBoxes   = visible.reduce((s,j) => s + (j.box_count ?? 0), 0);
  const totalShop    = visible.reduce((s,j) => s + (j.shop_hrs ?? 0), 0);
  const totalInstall = visible.reduce((s,j) => s + (j.install_hrs ?? 0), 0);

  const statusCounts = STATUS_ORDER.reduce<Record<string,number>>((acc,s) => {
    acc[s] = visible.filter(j => j.status === s).length; return acc;
  }, {});

  function exportCSV() {
    const rows = [
      ["Job#","Client","City","Status","PM","Value $","Boxes","Shop Hrs","Install Type","Install Hrs","Delivery","Install Start"],
      ...visible.map(j => [
        j.job_number ?? "", j.client_name, j.city ?? "", j.status, j.pm ?? "",
        String(Math.round(j.sell_price_snapshot ?? j.estimated_value ?? 0)),
        j.box_count != null ? String(j.box_count) : "",
        j.shop_hrs != null ? String(j.shop_hrs) : "",
        installTypeLabel(j.install_type),
        j.install_hrs != null ? String(j.install_hrs) : "",
        j.anticipated_delivery ?? j.delivery_date ?? "",
        j.install_start_date ?? "",
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv"}));
    a.download = `pipeline-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  return (
    <div className="min-h-screen bg-[#0d0e0f] text-white px-4 py-8 max-w-7xl mx-auto">
      {showAdd && <QuickAddModal pms={pms} onClose={() => setShowAdd(false)} onAdded={() => { load(); }} />}

      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-white/40 text-xs font-condensed uppercase tracking-widest mb-1">Admin</div>
          <h1 className="font-heading text-3xl uppercase tracking-wide text-[#f08122]">Pipeline</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAdd(true)}
            className="bg-[#f08122] hover:bg-[#d9711e] text-white text-xs font-condensed uppercase tracking-widest rounded px-3 py-1.5 transition-colors">
            + Add Job
          </button>
          <button onClick={exportCSV}
            className="text-white/40 hover:text-[#f08122] text-xs font-condensed uppercase tracking-widest border border-white/15 hover:border-[#f08122]/40 rounded px-3 py-1.5 transition-colors">
            Export CSV
          </button>
          <Link href="/admin" className="text-white/40 hover:text-white text-sm transition-colors">← Admin</Link>
        </div>
      </div>

      {/* Monthly summary strips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* All total */}
        <button onClick={() => setFilterMonth("all")}
          className={`rounded-xl px-4 py-3 text-left transition-all border ${filterMonth==="all" ? "border-[#f08122]/60 bg-[#f08122]/10" : "border-white/10 bg-[#1a1b1c] hover:border-white/25"}`}>
          <div className="text-[9px] font-condensed uppercase tracking-widest text-white/40 mb-1">All · {jobs.length} jobs</div>
          <div className="flex gap-4 text-xs tabular-nums">
            <span className="text-white font-semibold">{fmt$(jobs.reduce((s,j)=>s+(j.sell_price_snapshot??j.estimated_value??0),0))}</span>
            <span className="text-white/50">{jobs.reduce((s,j)=>s+(j.box_count??0),0)} <span className="text-white/25">box</span></span>
            <span className="text-amber-400/80">{jobs.reduce((s,j)=>s+(j.shop_hrs??0),0) > 0 ? jobs.reduce((s,j)=>s+(j.shop_hrs??0),0).toFixed(0)+"h shop" : <span className="text-white/20">no shop hrs</span>}</span>
          </div>
        </button>
        {monthBuckets.map(b => (
          <button key={b.key} onClick={() => setFilterMonth(b.key === filterMonth ? "all" : b.key)}
            className={`rounded-xl px-4 py-3 text-left transition-all border ${filterMonth===b.key ? "border-[#f08122]/60 bg-[#f08122]/10" : "border-white/10 bg-[#1a1b1c] hover:border-white/25"}`}>
            <div className="text-[9px] font-condensed uppercase tracking-widest text-white/40 mb-1">{b.key} · {b.count}</div>
            <div className="flex gap-3 text-xs tabular-nums flex-wrap">
              <span className="text-white font-semibold">{fmt$(b.value)}</span>
              <span className="text-white/50">{b.boxes} <span className="text-white/25">box</span></span>
              {b.shopHrs > 0 && <span className="text-amber-400/70">{b.shopHrs.toFixed(0)}h shop</span>}
              {b.installHrs > 0 && <span className="text-blue-400/70">{b.installHrs.toFixed(0)}h inst</span>}
            </div>
          </button>
        ))}
      </div>

      {/* Totals bar for filtered view */}
      {(filterMonth !== "all" || filterStatus !== "all") && (
        <div className="flex gap-6 mb-4 px-4 py-2 bg-white/[0.03] rounded-lg text-xs tabular-nums border border-white/5">
          <span className="text-white/40 font-condensed uppercase tracking-widest text-[9px] mr-2 self-center">Showing {visible.length} jobs</span>
          <span className="text-white font-semibold">{fmt$(totalValue)}</span>
          <span className="text-white/60">{totalBoxes} boxes</span>
          {totalShop > 0 && <span className="text-amber-400/80">{totalShop.toFixed(0)}h shop</span>}
          {totalInstall > 0 && <span className="text-blue-400/80">{totalInstall.toFixed(0)}h install</span>}
          <button onClick={() => { setFilterMonth("all"); setFilterStatus("all"); }}
            className="ml-auto text-white/30 hover:text-white text-[9px] font-condensed uppercase tracking-widest">Clear ✕</button>
        </div>
      )}

      {/* Status filter */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {["all",...STATUS_ORDER.filter(s=>s!=="complete")].map(s => {
          const count = s === "all" ? visible.length : statusCounts[s];
          if (s !== "all" && count === 0) return null;
          return (
            <button key={s} onClick={() => setFilterStatus(s === filterStatus ? "all" : s)}
              className={`px-2.5 py-1 rounded-full text-[9px] font-condensed uppercase tracking-widest transition-colors ${filterStatus===s ? "bg-[#f08122] text-white" : "bg-white/5 text-white/40 hover:text-white"}`}>
              {s === "all" ? `All (${count})` : `${STATUS_LABEL[s]} (${count})`}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center text-white/30 py-20 text-sm">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/40 text-[9px] font-condensed uppercase tracking-widest bg-white/[0.02]">
                <th className="text-left px-3 py-2.5">Job</th>
                <th className="text-left px-2 py-2.5">Status</th>
                <th className="text-left px-2 py-2.5">PM</th>
                <th className="text-right px-3 py-2.5">Value</th>
                <th className="text-right px-2 py-2.5">Boxes</th>
                <th className="text-right px-2 py-2.5">Shop h</th>
                <th className="text-left px-2 py-2.5">Install</th>
                <th className="text-right px-2 py-2.5">Inst h</th>
                <th className="text-left px-2 py-2.5">Delivery</th>
                <th className="text-left px-2 py-2.5">Inst Start</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(job => (
                <tr key={job.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2.5">
                    <Link href={`/jobs/${job.id}`} className="hover:text-[#f08122] transition-colors">
                      <div className="font-medium text-white text-xs">{job.client_name}</div>
                      <div className="text-white/30 text-[9px]">{[job.job_number, job.city].filter(Boolean).join(" · ")}</div>
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <EditableStatus value={job.status} onSave={v => patchJob(job.id, {status:v})} />
                  </td>
                  <td className="px-2 py-2 min-w-[90px]">
                    <EditablePm value={job.pm} pms={pms} onSave={v => patchJob(job.id, {pm:v})} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {job.sell_price_snapshot != null
                      ? <span className="text-white text-xs tabular-nums">{fmt$(job.sell_price_snapshot)}</span>
                      : job.estimated_value != null
                      ? <span className="text-white/50 text-xs tabular-nums" title="PM estimate">{fmt$(job.estimated_value)}<span className="text-white/25 text-[8px] ml-0.5">e</span></span>
                      : <span className="text-white/20 text-xs">—</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-white/60">
                    {job.box_count
                      ? <span title={job.fg_boxes?.map(f=>`${f.label}: ${f.boxes}`).join("\n") ?? ""}>{job.box_count}</span>
                      : "—"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <EditableNumber value={job.shop_hrs} suffix="h" onSave={v => patchJob(job.id, {shop_hrs:v})} />
                  </td>
                  <td className="px-2 py-2 min-w-[90px]">
                    <EditableSelect value={job.install_type} options={INSTALL_TYPE_OPTIONS} onSave={v => patchJob(job.id, {install_type:v})} />
                  </td>
                  <td className="px-2 py-2 text-right">
                    {job.install_type === "delivery_only"
                      ? <span className="text-white/20 text-[9px]">n/a</span>
                      : <EditableNumber value={job.install_hrs} suffix="h" onSave={v => patchJob(job.id, {install_hrs:v})} />}
                  </td>
                  <td className="px-2 py-2 min-w-[90px]">
                    <EditableDate value={job.anticipated_delivery ?? job.delivery_date} onSave={v => patchJob(job.id, {delivery_date:v})} />
                    {job.anticipated_delivery && job.anticipated_delivery !== job.delivery_date &&
                      <div className="text-white/20 text-[8px]">sched</div>}
                  </td>
                  <td className="px-2 py-2 min-w-[90px]">
                    <EditableDate value={job.install_start_date} placeholder="Set start" onSave={v => patchJob(job.id, {install_start_date:v})} />
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={10} className="text-center text-white/20 py-10 text-sm">No jobs</td></tr>
              )}
            </tbody>
            {visible.length > 0 && (
              <tfoot>
                <tr className="border-t border-white/10 text-white/50 text-[10px] font-condensed bg-white/[0.01]">
                  <td className="px-3 py-2" colSpan={3}>Totals — {visible.length} jobs</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-white">{fmt$(totalValue)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{totalBoxes || "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{totalShop > 0 ? totalShop.toFixed(0)+"h" : "—"}</td>
                  <td />
                  <td className="px-2 py-2 text-right tabular-nums">{totalInstall > 0 ? totalInstall.toFixed(0)+"h" : "—"}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      <p className="text-white/15 text-[9px] font-condensed mt-3">
        Click any month card to filter. Click a cell to edit inline. Shop/install hrs feed the month totals.
      </p>
    </div>
  );
}
