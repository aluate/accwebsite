"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";

const STATUS_ORDER = ["intake","bid","design","field_dims","engineering","procurement","production","delivery","install","punch","complete","cancelled"];
const STATUS_LABEL: Record<string,string> = {
  intake:"Intake", bid:"Bid", design:"Design", field_dims:"Field Dims",
  engineering:"Engineering", procurement:"Procurement",
  production:"Production", delivery:"Delivery",
  install:"Install", punch:"Punch", complete:"Complete", cancelled:"Cancelled",
};
const STATUS_COLOR: Record<string,string> = {
  intake:      "bg-white/10 text-white/50",
  bid:         "bg-sky-500/20 text-sky-300",
  design:      "bg-blue-500/20 text-blue-300",
  field_dims:  "bg-cyan-500/20 text-cyan-300",
  engineering: "bg-violet-500/20 text-violet-300",
  procurement: "bg-purple-500/20 text-purple-300",
  production:  "bg-amber-500/20 text-amber-300",
  delivery:    "bg-yellow-500/20 text-yellow-300",
  install:     "bg-orange-500/20 text-orange-300",
  punch:       "bg-rose-500/20 text-rose-300",
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
const PRE_ENG = new Set(["intake","bid","design","field_dims"]);
function engWarnWeeks(deliveryDate: string | null, status: string): number | null {
  if (!deliveryDate || !PRE_ENG.has(status)) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const delivery = new Date(deliveryDate + "T12:00:00Z");
  const w = Math.ceil((delivery.getTime() - today.getTime()) / (7 * 86400000));
  return w <= 8 ? w : null;
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
  /** First scheduled install event, or null if the job is not on the calendar yet. Read-only. */
  scheduled_install_date?: string | null;
  anticipated_delivery: string | null;
  estimate_id: string | null;
  estimated_value: number | null;
  sell_price_snapshot: number | null;
  shop_hrs: number | null;
  install_hrs: number | null;
  install_type: string | null;
  box_count: number | null;
  fg_boxes: FgBox[] | null;
  builder_company: string | null;
  builder_name: string | null;
  builder_id: string | null;
  // Placeholder fields
  is_placeholder: boolean;
  placeholder_unit_count: number | null;
  placeholder_per_unit_value: number | null;
  placeholder_per_unit_boxes: number | null;
  placeholder_per_unit_shop_hrs: number | null;
  placeholder_per_unit_install_hrs: number | null;
  placeholder_id: string | null;
  placeholder_linked_count: number;
};
type Pm = { id: string; name: string };
type Builder = { id: string; company: string; contact_name: string; typical_pm: string | null };

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

function EditableCurrency({ value, onSave }: {
  value: number | null; onSave: (v: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(Math.round(value)) : "");
  const [saving, setSaving] = useState(false);
  async function commit() {
    setSaving(true);
    const raw = draft.replace(/[$,\s]/g, "");
    const n = raw === "" ? null : parseFloat(raw);
    await onSave(isNaN(n as number) ? null : n);
    setSaving(false); setEditing(false);
  }
  if (editing) return (
    <input autoFocus type="number" value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key==="Enter") commit(); if (e.key==="Escape") setEditing(false); }}
      disabled={saving}
      className="w-24 bg-white/10 border border-[#f08122]/60 rounded px-1 py-0.5 text-xs text-white text-right focus:outline-none" />
  );
  return (
    <button onClick={() => { setDraft(value != null ? String(Math.round(value)) : ""); setEditing(true); }}
      className="text-xs text-right w-full text-white/50 hover:text-white group tabular-nums">
      {value != null
        ? <>{fmt$(value)}<span className="text-white/25 text-[8px] ml-0.5">e</span></>
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


function EditableBuilder({ company, name, builderId, onSave }: {
  company: string | null; name: string | null; builderId: string | null;
  onSave: (id: string, company: string, contactName: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{id:string;company:string;contact_name:string;typical_pm:string|null}[]>([]);
  const [saving, setSaving] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>|null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) return;
    function handle(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setEditing(false); }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [editing]);

  function search(val: string) {
    setQ(val);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const res = await fetch(`/api/builders?q=${encodeURIComponent(val)}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    }, 200);
  }

  async function pick(b: {id:string;company:string;contact_name:string;typical_pm:string|null}) {
    setSaving(true);
    await onSave(b.id, b.company, b.contact_name ?? "");
    setSaving(false);
    setEditing(false);
    setQ("");
    setResults([]);
  }

  if (!editing) return (
    <button onClick={() => { setQ(company ?? ""); setEditing(true); }}
      className="text-left text-[10px] text-white/60 hover:text-white group w-full truncate max-w-[110px]">
      {company || <span className="text-white/20 group-hover:text-white/40">Set builder</span>}
      <span className="ml-0.5 opacity-0 group-hover:opacity-30 text-[8px]">✎</span>
    </button>
  );

  return (
    <div ref={ref} className="relative min-w-[120px]">
      <input autoFocus value={q} onChange={e => search(e.target.value)}
        disabled={saving}
        placeholder="Search builders…"
        className="bg-white/10 border border-[#f08122]/60 rounded px-1 py-0.5 text-[10px] text-white focus:outline-none w-full" />
      {results.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-0.5 bg-[#1e1f20] border border-white/15 rounded shadow-xl w-48 max-h-48 overflow-y-auto">
          {results.map(b => (
            <button key={b.company} onClick={() => pick(b)}
              className="w-full text-left px-2 py-1.5 text-[10px] text-white hover:bg-white/10 transition-colors">
              <div className="font-medium">{b.company}</div>
              {b.contact_name && <div className="text-white/40">{b.contact_name}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
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

// ── New Placeholder Modal ─────────────────────────────────────────────────────
function NewPlaceholderModal({ pms, onClose, onAdded }: { pms: Pm[]; onClose: () => void; onAdded: () => void }) {
  const blank = {
    builder_q: "", builder_id: "", builder_company: "",
    label: "", delivery_month: "",
    unit_count: "1", per_unit_value: "", per_unit_boxes: "",
    per_unit_shop_hrs: "", per_unit_install_hrs: "", pm: "",
  };
  const [form, setForm] = useState(blank);
  const [builderResults, setBuilderResults] = useState<Builder[]>([]);
  const [showBuilderDrop, setShowBuilderDrop] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout>|null>(null);
  const builderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) { if (builderRef.current && !builderRef.current.contains(e.target as Node)) setShowBuilderDrop(false); }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function set(k: string, v: string) { setForm(f => ({...f, [k]: v})); }

  function searchBuilder(val: string) {
    set("builder_q", val);
    set("builder_id", "");
    set("builder_company", "");
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      if (!val) { setBuilderResults([]); setShowBuilderDrop(false); return; }
      const res = await fetch(`/api/builders?q=${encodeURIComponent(val)}`);
      const data = await res.json();
      setBuilderResults(Array.isArray(data) ? data : []);
      setShowBuilderDrop(true);
    }, 200);
  }

  function pickBuilder(b: Builder) {
    setForm(f => ({...f, builder_q: b.company, builder_id: b.id, builder_company: b.company, pm: b.typical_pm ?? f.pm}));
    setBuilderResults([]);
    setShowBuilderDrop(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim()) { setError("Label is required"); return; }
    if (!form.unit_count || Number(form.unit_count) < 1) { setError("Unit count must be ≥ 1"); return; }
    setSaving(true); setError("");
    try {
      // delivery_month is stored as first of month
      const deliveryDate = form.delivery_month ? form.delivery_month + "-01" : null;
      const body = {
        client_name: form.label.trim(),
        site_address: "",
        city: "",
        pm: form.pm || null,
        status: "intake",
        is_placeholder: true,
        builder_id: form.builder_id || null,
        builder_company: form.builder_company || form.builder_q || null,
        placeholder_unit_count: Number(form.unit_count),
        placeholder_per_unit_value: form.per_unit_value ? Number(form.per_unit_value) : 0,
        placeholder_per_unit_boxes: form.per_unit_boxes ? Number(form.per_unit_boxes) : 0,
        placeholder_per_unit_shop_hrs: form.per_unit_shop_hrs ? Number(form.per_unit_shop_hrs) : 0,
        placeholder_per_unit_install_hrs: form.per_unit_install_hrs ? Number(form.per_unit_install_hrs) : 0,
        delivery_date: deliveryDate,
      };
      const r = await fetch("/api/jobs", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
      if (!r.ok) { const d = await r.json(); setError(d.error ?? "Save failed"); setSaving(false); return; }
      onAdded();
      onClose();
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  }

  const inp = "w-full bg-white/10 border border-white/15 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#f08122]/60 placeholder-white/20";
  const lbl = "block text-[9px] font-condensed uppercase tracking-widest text-white/40 mb-1";

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 pt-16 px-4" onClick={onClose}>
      <div className="bg-[#1a1b1c] border border-orange-500/30 rounded-2xl w-full max-w-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-heading text-xl uppercase tracking-wide text-orange-400">New Placeholder</h2>
            <p className="text-white/30 text-[10px] font-condensed mt-1">Forecast job — units × per-unit values = pipeline contribution</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white text-lg">✕</button>
        </div>
        <form onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div ref={builderRef} className="relative">
              <label className={lbl}>Builder</label>
              <input className={inp} placeholder="Search builders…" value={form.builder_q}
                onChange={e => searchBuilder(e.target.value)}
                onFocus={() => form.builder_q && builderResults.length > 0 && setShowBuilderDrop(true)} />
              {showBuilderDrop && builderResults.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-[#1e1f20] border border-white/15 rounded shadow-xl max-h-40 overflow-y-auto">
                  {builderResults.map(b => (
                    <button key={b.id} type="button" onClick={() => pickBuilder(b)}
                      className="w-full text-left px-2 py-1.5 text-[10px] text-white hover:bg-white/10">
                      {b.company}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className={lbl}>Label / Name *</label>
              <input className={inp} placeholder="Atlas – Riverstone" value={form.label} onChange={e=>set("label",e.target.value)} autoFocus />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className={lbl}>Delivery Month</label>
              <input type="month" className={inp} value={form.delivery_month} onChange={e=>set("delivery_month",e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Unit Count</label>
              <input type="number" min="1" className={inp} placeholder="12" value={form.unit_count} onChange={e=>set("unit_count",e.target.value)} />
            </div>
            <div>
              <label className={lbl}>PM</label>
              <select value={form.pm} onChange={e=>set("pm",e.target.value)} className={inp + " cursor-pointer"}>
                <option value="">— Assign</option>
                {pms.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <p className="text-[9px] font-condensed uppercase tracking-widest text-white/30 mb-2">Per-unit values (multiply by remaining units to get pipeline contribution)</p>
          <div className="grid grid-cols-4 gap-3 mb-5">
            <div>
              <label className={lbl}>Value $</label>
              <input type="number" className={inp} placeholder="85000" value={form.per_unit_value} onChange={e=>set("per_unit_value",e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Boxes</label>
              <input type="number" className={inp} placeholder="65" value={form.per_unit_boxes} onChange={e=>set("per_unit_boxes",e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Shop Hrs</label>
              <input type="number" className={inp} placeholder="320" value={form.per_unit_shop_hrs} onChange={e=>set("per_unit_shop_hrs",e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Install Hrs</label>
              <input type="number" className={inp} placeholder="80" value={form.per_unit_install_hrs} onChange={e=>set("per_unit_install_hrs",e.target.value)} />
            </div>
          </div>
          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-condensed uppercase tracking-widest rounded-lg px-4 py-2.5 transition-colors">
              {saving ? "Creating…" : "Create Placeholder"}
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

// ── Link Job Modal ────────────────────────────────────────────────────────────
function LinkJobModal({
  placeholder, allJobs, onLink, onClose
}: {
  placeholder: PipelineJob;
  allJobs: PipelineJob[];
  onLink: (jobId: string, placeholderId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);
  const remaining = (placeholder.placeholder_unit_count ?? 1) - (placeholder.placeholder_linked_count ?? 0);
  // Candidate jobs: same builder, not placeholder, no placeholder_id, not complete/cancelled
  const candidates = allJobs.filter(j =>
    !j.is_placeholder &&
    !j.placeholder_id &&
    j.builder_id === placeholder.builder_id &&
    j.status !== "complete" &&
    j.status !== "cancelled"
  );

  async function doLink() {
    if (!selectedId) return;
    setSaving(true);
    await onLink(selectedId, placeholder.id);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-[#1a1b1c] border border-orange-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-base uppercase tracking-wide text-orange-400">Link Job to Placeholder</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white">✕</button>
        </div>
        <p className="text-white/50 text-xs mb-4">
          Placeholder: <span className="text-orange-300">{placeholder.client_name}</span> — {remaining} of {placeholder.placeholder_unit_count} units remaining
        </p>
        {candidates.length === 0 ? (
          <p className="text-white/30 text-xs italic mb-4">No eligible jobs found for this builder. Jobs must have the same builder and no existing placeholder link.</p>
        ) : (
          <div className="mb-4">
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded px-2 py-2 text-xs text-white focus:outline-none focus:border-[#f08122]/60">
              <option value="">— Select a job —</option>
              {candidates.map(j => (
                <option key={j.id} value={j.id}>
                  {j.client_name}{j.job_number ? ` (#${j.job_number})` : ""} — {j.city ?? ""} · {STATUS_LABEL[j.status] ?? j.status}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={doLink} disabled={!selectedId || saving}
            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-condensed uppercase tracking-widest rounded px-4 py-2 transition-colors">
            {saving ? "Linking…" : "Link Job"}
          </button>
          <button onClick={onClose}
            className="px-4 py-2 border border-white/10 text-white/30 text-xs font-condensed uppercase tracking-widest rounded hover:text-white/50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Link to Placeholder (from regular job row) ────────────────────────────────
function LinkToPlaceholderDropdown({
  job, placeholders, onLink
}: {
  job: PipelineJob;
  placeholders: PipelineJob[];
  onLink: (jobId: string, phId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const opts = placeholders.filter(p =>
    p.is_placeholder &&
    p.builder_id === job.builder_id &&
    p.status !== "complete" &&
    p.status !== "cancelled"
  );
  if (opts.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="opacity-0 group-hover/row:opacity-60 hover:!opacity-100 text-orange-400 text-[9px] font-condensed uppercase tracking-widest transition-opacity ml-1"
        title="Link to placeholder">
        ⬡ Link
      </button>
      {open && (
        <div className="absolute z-50 top-full right-0 mt-0.5 bg-[#1e1f20] border border-orange-500/30 rounded shadow-xl w-56 py-1">
          <p className="text-[9px] font-condensed uppercase tracking-widest text-white/30 px-2 py-1">Link to placeholder</p>
          {opts.map(p => {
            const rem = (p.placeholder_unit_count ?? 1) - (p.placeholder_linked_count ?? 0);
            return (
              <button key={p.id} onClick={async () => { setSaving(true); await onLink(job.id, p.id); setSaving(false); setOpen(false); }}
                disabled={saving}
                className="w-full text-left px-2 py-1.5 text-[10px] text-white hover:bg-white/10 transition-colors">
                <span className="text-orange-300">{p.client_name}</span>
                <span className="text-white/40 ml-1">({rem} remaining)</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PipelineClient() {
  const [jobs, setJobs]       = useState<PipelineJob[]>([]);
  const [pms, setPms]         = useState<Pm[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showPlaceholderAdd, setShowPlaceholderAdd] = useState(false);
  const [linkModal, setLinkModal] = useState<PipelineJob | null>(null);

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
        placeholder_unit_count: j.placeholder_unit_count != null ? Number(j.placeholder_unit_count) : null,
        placeholder_per_unit_value: j.placeholder_per_unit_value != null ? Number(j.placeholder_per_unit_value) : null,
        placeholder_per_unit_boxes: j.placeholder_per_unit_boxes != null ? Number(j.placeholder_per_unit_boxes) : null,
        placeholder_per_unit_shop_hrs: j.placeholder_per_unit_shop_hrs != null ? Number(j.placeholder_per_unit_shop_hrs) : null,
        placeholder_per_unit_install_hrs: j.placeholder_per_unit_install_hrs != null ? Number(j.placeholder_per_unit_install_hrs) : null,
        placeholder_linked_count: j.placeholder_linked_count != null ? Number(j.placeholder_linked_count) : 0,
        is_placeholder: Boolean(j.is_placeholder),
      })));
      setPms(d.pms ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const [saveFlash, setSaveFlash] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc"|"desc">("asc");
  const [view, setView] = useState<"bubbles"|"table">("bubbles");
  const [shopCutoff, setShopCutoff]       = useState("production");
  const [installCutoff, setInstallCutoff] = useState("install");
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function patchJob(jobId: string, updates: Record<string, unknown>) {
    setJobs(prev => prev.map(j => j.id === jobId ? {...j, ...updates} : j));
    try {
      const r = await fetch(`/api/jobs/${jobId}`, {
        method:"PATCH", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({...updates, _actor:"admin", _actorRole:"admin"}),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setSaveFlash("⚠ Save failed: " + (err.error ?? r.status));
        load();
      } else {
        const body = await r.json().catch(() => ({} as Record<string, unknown>));
        // The board owns the install date and the calendar follows automatically, so
        // say what moved. An automatic change nobody is told about is indistinguishable
        // from a bug the first time someone notices the schedule shifted.
        const sync = body.install_sync as
          | { moved: true; from: string | null; to: string; conflicts?: unknown[] }
          | { moved: false; reason: string }
          | undefined;
        if (sync?.moved) {
          const n = sync.conflicts?.length ?? 0;
          setSaveFlash(
            n > 0
              ? `Saved ✓ — install event moved to ${sync.to}, but it now clashes with ${n} other booking${n === 1 ? "" : "s"}`
              : `Saved ✓ — install event moved ${sync.from ?? "?"} → ${sync.to}`,
          );
          load();
        } else if (sync && !sync.moved) {
          setSaveFlash(`Saved ✓ — ${sync.reason}`);
        } else {
          setSaveFlash("Saved ✓");
        }
        // If we just linked a job to a placeholder, reload to get updated counts
        if ("placeholder_id" in updates) load();
      }
    } catch {
      setSaveFlash("⚠ Network error — not saved");
      load();
    }
    if (flashTimer.current) clearTimeout(flashTimer.current);
    // A message about the calendar moving, or about a clash, needs longer than the
    // 2.5s a plain "Saved" gets.
    flashTimer.current = setTimeout(() => setSaveFlash(null), "install_start_date" in updates ? 9000 : 2500);
  }

  async function linkJobToPlaceholder(jobId: string, placeholderId: string) {
    await patchJob(jobId, { placeholder_id: placeholderId });
  }

  async function deleteJob(jobId: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const r = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
    if (r.ok) {
      setJobs(prev => prev.filter(j => j.id !== jobId));
      setSaveFlash("Deleted");
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setSaveFlash(null), 2500);
    } else {
      setSaveFlash("⚠ Delete failed");
    }
  }

  function toggleSort(col: string) {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  }

  const phaseIndex = (s: string) => STATUS_ORDER.indexOf(s);
  const countShop    = (j: PipelineJob) => phaseIndex(j.status) <= phaseIndex(shopCutoff);
  const countInstall = (j: PipelineJob) => phaseIndex(j.status) <= phaseIndex(installCutoff);

  // Helper: get effective value/boxes/hrs for a job (placeholder uses computed remaining)
  function effectiveValue(j: PipelineJob) {
    if (j.is_placeholder) {
      const rem = Math.max(0, (j.placeholder_unit_count ?? 1) - (j.placeholder_linked_count ?? 0));
      return (j.placeholder_per_unit_value ?? 0) * rem;
    }
    return j.sell_price_snapshot ?? j.estimated_value ?? 0;
  }
  function effectiveBoxes(j: PipelineJob) {
    if (j.is_placeholder) {
      const rem = Math.max(0, (j.placeholder_unit_count ?? 1) - (j.placeholder_linked_count ?? 0));
      return (j.placeholder_per_unit_boxes ?? 0) * rem;
    }
    return j.box_count ?? 0;
  }
  function effectiveShopHrs(j: PipelineJob) {
    if (j.is_placeholder) {
      const rem = Math.max(0, (j.placeholder_unit_count ?? 1) - (j.placeholder_linked_count ?? 0));
      return (j.placeholder_per_unit_shop_hrs ?? 0) * rem;
    }
    return j.shop_hrs ?? 0;
  }
  function effectiveInstallHrs(j: PipelineJob) {
    if (j.is_placeholder) {
      const rem = Math.max(0, (j.placeholder_unit_count ?? 1) - (j.placeholder_linked_count ?? 0));
      return (j.placeholder_per_unit_install_hrs ?? 0) * rem;
    }
    return j.install_hrs ?? 0;
  }

  type MonthBucket = { key: string; value: number; boxes: number; shopHrs: number; installHrs: number; count: number };
  const monthBuckets = (() => {
    const map = new Map<string, MonthBucket>();
    const bucketJobs = filterStatuses.length > 0 ? jobs.filter(j => filterStatuses.includes(j.status)) : jobs;
    for (const j of bucketJobs) {
      const key = monthKey(j.anticipated_delivery ?? j.delivery_date);
      const existing = map.get(key) ?? { key, value:0, boxes:0, shopHrs:0, installHrs:0, count:0 };
      existing.value    += effectiveValue(j);
      existing.boxes    += effectiveBoxes(j);
      existing.shopHrs  += countShop(j) ? effectiveShopHrs(j) : 0;
      existing.installHrs += countInstall(j) ? effectiveInstallHrs(j) : 0;
      existing.count    += 1;
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a,b) => monthSort(a.key) - monthSort(b.key));
  })();

  let visible = jobs;
  if (filterMonth !== "all") {
    visible = visible.filter(j => monthKey(j.anticipated_delivery ?? j.delivery_date) === filterMonth);
  }
  if (filterStatuses.length > 0) {
    visible = visible.filter(j => filterStatuses.includes(j.status));
    if (sortBy) {
      visible = [...visible].sort((a, b) => {
        let av = "", bv = "";
        if (sortBy === "builder") { av = a.builder_company ?? ""; bv = b.builder_company ?? ""; }
        else if (sortBy === "pm") { av = a.pm ?? ""; bv = b.pm ?? ""; }
        const cmp = av.localeCompare(bv);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
  }

  const totalValue   = visible.reduce((s,j) => s + effectiveValue(j), 0);
  const totalBoxes   = visible.reduce((s,j) => s + effectiveBoxes(j), 0);
  const totalShop    = visible.reduce((s,j) => s + (countShop(j) ? effectiveShopHrs(j) : 0), 0);
  const totalInstall = visible.reduce((s,j) => s + (countInstall(j) ? effectiveInstallHrs(j) : 0), 0);

  const engWarnJobs = jobs.filter(j => !j.is_placeholder && engWarnWeeks(j.anticipated_delivery ?? j.delivery_date, j.status) !== null);

  const statusCounts = STATUS_ORDER.reduce<Record<string,number>>((acc,s) => {
    const base = filterMonth !== "all" ? jobs.filter(j => monthKey(j.anticipated_delivery ?? j.delivery_date) === filterMonth) : jobs;
    acc[s] = base.filter(j => j.status === s).length; return acc;
  }, {});

  // All open placeholders (for "link to" dropdowns on regular job rows)
  const openPlaceholders = jobs.filter(j => j.is_placeholder && j.status !== "complete" && j.status !== "cancelled");

  function exportCSV() {
    const rows = [
      ["Job#","Client","City","Status","PM","Value $","Boxes","Shop Hrs","Install Type","Install Hrs","Delivery","Install Start","Placeholder"],
      ...visible.map(j => [
        j.job_number ?? "", j.client_name, j.city ?? "", j.status, j.pm ?? "",
        String(Math.round(effectiveValue(j))),
        String(Math.round(effectiveBoxes(j))),
        effectiveShopHrs(j) > 0 ? String(effectiveShopHrs(j)) : "",
        installTypeLabel(j.install_type),
        effectiveInstallHrs(j) > 0 ? String(effectiveInstallHrs(j)) : "",
        j.anticipated_delivery ?? j.delivery_date ?? "",
        j.install_start_date ?? "",
        j.is_placeholder ? "YES" : "",
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
      {showPlaceholderAdd && <NewPlaceholderModal pms={pms} onClose={() => setShowPlaceholderAdd(false)} onAdded={() => { load(); }} />}
      {linkModal && (
        <LinkJobModal
          placeholder={linkModal}
          allJobs={jobs}
          onLink={linkJobToPlaceholder}
          onClose={() => setLinkModal(null)}
        />
      )}

      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-white/40 text-xs font-condensed uppercase tracking-widest mb-1">Admin</div>
          <h1 className="font-heading text-3xl uppercase tracking-wide text-[#f08122]">Pipeline</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPlaceholderAdd(true)}
            className="bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-300 text-xs font-condensed uppercase tracking-widest rounded px-3 py-1.5 transition-colors">
            ⬡ Placeholder
          </button>
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

      {/* View toggle */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setView("bubbles")}
          className={`text-[10px] font-condensed uppercase tracking-widest px-3 py-1 rounded transition-colors ${view==="bubbles" ? "bg-white/10 text-white" : "text-white/30 hover:text-white/60"}`}>
          Bubbles
        </button>
        <button onClick={() => setView("table")}
          className={`text-[10px] font-condensed uppercase tracking-widest px-3 py-1 rounded transition-colors ${view==="table" ? "bg-white/10 text-white" : "text-white/30 hover:text-white/60"}`}>
          Summary table
        </button>
      </div>

      {/* Capacity cutoff controls */}
      <div className="flex items-center gap-4 mb-3 text-[10px] text-white/40 font-condensed">
        <span className="uppercase tracking-widest">Count hours through:</span>
        <label className="flex items-center gap-1.5">
          <span className="text-amber-400/70 uppercase tracking-widest">Shop</span>
          <select value={shopCutoff} onChange={e => setShopCutoff(e.target.value)}
            className="bg-white/5 border border-white/10 text-white/70 text-[10px] rounded px-2 py-0.5 cursor-pointer focus:outline-none focus:border-[#f08122]/40">
            {STATUS_ORDER.filter(s=>s!=="cancelled").map(s =>
              <option key={s} value={s} className="bg-[#1a1a1a]">{STATUS_LABEL[s]}</option>
            )}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-blue-400/70 uppercase tracking-widest">Install</span>
          <select value={installCutoff} onChange={e => setInstallCutoff(e.target.value)}
            className="bg-white/5 border border-white/10 text-white/70 text-[10px] rounded px-2 py-0.5 cursor-pointer focus:outline-none focus:border-[#f08122]/40">
            {STATUS_ORDER.filter(s=>s!=="cancelled").map(s =>
              <option key={s} value={s} className="bg-[#1a1a1a]">{STATUS_LABEL[s]}</option>
            )}
          </select>
        </label>
        <span className="text-white/20">· jobs past cutoff show hours in table but excluded from totals</span>
      </div>

      {/* ENG timing alert banner */}
      {engWarnJobs.length > 0 && (
        <div className="mb-3 px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-3">
          <span className="text-amber-400">⚠</span>
          <span className="text-amber-300 text-[10px] font-condensed uppercase tracking-widest">
            {engWarnJobs.length} job{engWarnJobs.length !== 1 ? "s" : ""} shipping within 8 weeks — not yet at Engineering
          </span>
          <span className="text-amber-400/50 text-[9px]">{engWarnJobs.map(j => j.client_name).join(" · ")}</span>
        </div>
      )}

      {/* Summary table view */}
      {view === "table" && (
        <div className="mb-4 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-white/40 font-condensed uppercase tracking-widest text-[9px] bg-white/[0.02]">
                <th className="px-4 py-2.5 text-left">Month</th>
                <th className="px-3 py-2.5 text-right">Jobs</th>
                <th className="px-3 py-2.5 text-right">Value</th>
                <th className="px-3 py-2.5 text-right">Boxes</th>
                <th className="px-3 py-2.5 text-right">Shop hrs</th>
                <th className="px-3 py-2.5 text-right">Install hrs</th>
              </tr>
            </thead>
            <tbody>
              {monthBuckets.map(b => (
                <tr key={b.key}
                  onClick={() => setFilterMonth(filterMonth === b.key ? "all" : b.key)}
                  className={`border-b border-white/5 cursor-pointer transition-colors hover:bg-white/[0.02] ${filterMonth===b.key ? "bg-[#f08122]/5" : ""}`}>
                  <td className={`px-4 py-2.5 font-medium ${filterMonth===b.key ? "text-[#f08122]" : "text-white"}`}>{b.key}</td>
                  <td className="px-3 py-2.5 text-right text-white/50 tabular-nums">{b.count}</td>
                  <td className="px-3 py-2.5 text-right text-white font-semibold tabular-nums">{fmt$(b.value)}</td>
                  <td className="px-3 py-2.5 text-right text-white/50 tabular-nums">{b.boxes || "—"}</td>
                  <td className="px-3 py-2.5 text-right text-white/50 tabular-nums">{b.shopHrs > 0 ? b.shopHrs.toFixed(0)+"h" : "—"}</td>
                  <td className="px-3 py-2.5 text-right text-white/50 tabular-nums">{b.installHrs > 0 ? b.installHrs.toFixed(0)+"h" : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/10 bg-white/[0.02] text-white/60 text-[10px] font-condensed">
                <td className="px-4 py-2 font-semibold text-white">Total</td>
                <td className="px-3 py-2 text-right">{jobs.length}</td>
                <td className="px-3 py-2 text-right text-white font-semibold tabular-nums">{fmt$(jobs.reduce((s,j)=>s+effectiveValue(j),0))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{jobs.reduce((s,j)=>s+effectiveBoxes(j),0)||"—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{jobs.reduce((s,j)=>s+effectiveShopHrs(j),0)>0 ? jobs.reduce((s,j)=>s+effectiveShopHrs(j),0).toFixed(0)+"h" : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{jobs.reduce((s,j)=>s+effectiveInstallHrs(j),0)>0 ? jobs.reduce((s,j)=>s+effectiveInstallHrs(j),0).toFixed(0)+"h" : "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Monthly summary strips */}
      {view === "bubbles" && <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setFilterMonth("all")}
          className={`rounded-xl px-4 py-3 text-left transition-all border ${filterMonth==="all" ? "border-[#f08122]/60 bg-[#f08122]/10" : "border-white/10 bg-[#1a1b1c] hover:border-white/25"}`}>
          <div className="text-[9px] font-condensed uppercase tracking-widest text-white/40 mb-1">All · {jobs.length} jobs</div>
          <div className="flex gap-4 text-xs tabular-nums">
            <span className="text-white font-semibold">{fmt$(jobs.reduce((s,j)=>s+effectiveValue(j),0))}</span>
            <span className="text-white/50">{jobs.reduce((s,j)=>s+effectiveBoxes(j),0)} <span className="text-white/25">box</span></span>
            <span className="text-amber-400/80">{jobs.reduce((s,j)=>s+effectiveShopHrs(j),0) > 0 ? jobs.reduce((s,j)=>s+effectiveShopHrs(j),0).toFixed(0)+"h shop" : <span className="text-white/20">no shop hrs</span>}</span>
          </div>
        </button>
        {monthBuckets.map(b => {
          const shopOver3k = b.shopHrs > 3000;
          const shopOver2100 = b.shopHrs > 2100;
          const shopOver1800 = b.shopHrs >= 1800;
          const shopCls = shopOver2100 ? "text-red-400" : shopOver1800 ? "text-amber-400" : "text-amber-400/70";
          const borderCls = filterMonth===b.key ? "border-[#f08122]/60 bg-[#f08122]/10"
            : shopOver2100 ? "border-red-500/40 bg-red-950/20 hover:border-red-500/60"
            : shopOver1800 ? "border-amber-500/40 bg-amber-950/20 hover:border-amber-500/60"
            : "border-white/10 bg-[#1a1b1c] hover:border-white/25";
          return (
            <button key={b.key} onClick={() => setFilterMonth(b.key === filterMonth ? "all" : b.key)}
              className={`rounded-xl px-4 py-3 text-left transition-all border ${borderCls}`}>
              <div className="text-[9px] font-condensed uppercase tracking-widest text-white/40 mb-1">{b.key} · {b.count}</div>
              <div className="flex gap-3 text-xs tabular-nums flex-wrap">
                <span className="text-white font-semibold">{fmt$(b.value)}</span>
                <span className="text-white/50">{b.boxes} <span className="text-white/25">box</span></span>
                {b.shopHrs > 0 && (
                  <span className={`${shopCls} ${shopOver3k ? "font-bold" : ""}`}>
                    {b.shopHrs.toFixed(0)}h shop
                    {shopOver3k && <span className="ml-1 text-[9px]">— verify w/ commercial</span>}
                  </span>
                )}
                {b.installHrs > 0 && <span className="text-blue-400/70">{b.installHrs.toFixed(0)}h inst</span>}
              </div>
            </button>
          );
        })}
      </div>}

      {/* Totals bar for filtered view */}
      {(filterMonth !== "all" || filterStatuses.length > 0) && (
        <div className="flex gap-6 mb-4 px-4 py-2 bg-white/[0.03] rounded-lg text-xs tabular-nums border border-white/5">
          <span className="text-white/40 font-condensed uppercase tracking-widest text-[9px] mr-2 self-center">Showing {visible.length} jobs</span>
          <span className="text-white font-semibold">{fmt$(totalValue)}</span>
          <span className="text-white/60">{totalBoxes} boxes</span>
          {totalShop > 0 && <span className="text-amber-400/80">{totalShop.toFixed(0)}h shop</span>}
          {totalInstall > 0 && <span className="text-blue-400/80">{totalInstall.toFixed(0)}h install</span>}
          <button onClick={() => { setFilterMonth("all"); setFilterStatuses([]); }}
            className="ml-auto text-white/30 hover:text-white text-[9px] font-condensed uppercase tracking-widest">Clear ✕</button>
        </div>
      )}

      {/* Status filter */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {["all",...STATUS_ORDER].map(s => {
          const isAll = s === "all";
          const active = isAll ? filterStatuses.length === 0 : filterStatuses.includes(s);
          const count = isAll
            ? (filterMonth !== "all" ? jobs.filter(j => monthKey(j.anticipated_delivery ?? j.delivery_date) === filterMonth) : jobs).length
            : statusCounts[s];
          return (
            <button key={s} onClick={() => {
              if (isAll) { setFilterStatuses([]); return; }
              setFilterStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
            }}
              className={`px-2.5 py-1 rounded-full text-[9px] font-condensed uppercase tracking-widest transition-colors ${active ? "bg-[#f08122] text-white" : "bg-white/5 text-white/40 hover:text-white"}`}>
              {isAll ? `All (${count})` : `${STATUS_LABEL[s]} (${count})`}
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
                <th className="text-left px-2 py-2.5 cursor-pointer select-none hover:text-white/70 transition-colors" onClick={() => toggleSort("builder")}>Builder {sortBy==="builder" ? (sortDir==="asc"?"↑":"↓") : <span className="opacity-20">↕</span>}</th>
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
              {visible.map(job => {
                const isPlh = job.is_placeholder;
                const remaining = isPlh ? Math.max(0, (job.placeholder_unit_count ?? 1) - (job.placeholder_linked_count ?? 0)) : null;
                const total = isPlh ? (job.placeholder_unit_count ?? 1) : null;
                const perUnitValue = job.placeholder_per_unit_value ?? 0;
                const perUnitBoxes = job.placeholder_per_unit_boxes ?? 0;
                const perUnitShop = job.placeholder_per_unit_shop_hrs ?? 0;
                const perUnitInstall = job.placeholder_per_unit_install_hrs ?? 0;

                return (
                  <tr key={job.id}
                    className={`border-b transition-colors group/row ${isPlh
                      ? "border-orange-500/20 bg-orange-950/10 hover:bg-orange-950/20"
                      : "border-white/5 hover:bg-white/[0.02]"
                    }`}
                    style={isPlh ? { borderLeft: "3px solid rgb(249 115 22 / 0.6)" } : {}}>
                    <td className="px-3 py-2.5">
                      {isPlh ? (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[8px] font-condensed uppercase tracking-widest bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">Placeholder</span>
                          </div>
                          <div className="font-medium text-orange-200 text-xs mt-0.5">{job.client_name}</div>
                          <div className="text-orange-400/60 text-[9px]">
                            {remaining} remaining / {total} total
                            {job.builder_company && <span className="ml-1 text-white/30">· {job.builder_company}</span>}
                          </div>
                        </div>
                      ) : (
                        <Link href={`/jobs/${job.id}`} className="hover:text-[#f08122] transition-colors">
                          <div className="font-medium text-white text-xs">{job.client_name}</div>
                          <div className="text-white/30 text-[9px]">{[job.job_number, job.city].filter(Boolean).join(" · ")}</div>
                          {job.placeholder_id && (
                            <div className="text-orange-400/50 text-[8px] mt-0.5">⬡ placeholder linked</div>
                          )}
                          {(() => { const w = engWarnWeeks(job.anticipated_delivery ?? job.delivery_date, job.status); return w !== null ? <div className="text-amber-400 text-[9px] mt-0.5">⚠ Ships in {w}w — needs ENG</div> : null; })()}
                        </Link>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <EditableStatus value={job.status} onSave={v => patchJob(job.id, {status:v})} />
                    </td>
                    <td className="px-2 py-2 min-w-[90px]">
                      <EditablePm value={job.pm} pms={pms} onSave={v => patchJob(job.id, {pm:v})} />
                    </td>
                    <td className="px-2 py-2 min-w-[110px]">
                      <EditableBuilder company={job.builder_company} name={job.builder_name} builderId={job.builder_id}
                        onSave={async (id, company, contactName) => {
                          await patchJob(job.id, {builder_id: id, builder_company: company, builder_name: contactName});
                        }} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isPlh ? (
                        <div className="text-xs tabular-nums text-orange-300/80 text-right">
                          <div>{fmt$(perUnitValue)} × {remaining}</div>
                          <div className="text-orange-400 font-semibold">{fmt$(perUnitValue * (remaining ?? 0))}</div>
                        </div>
                      ) : job.sell_price_snapshot != null ? (
                        <span className="text-white text-xs tabular-nums" title="Locked — set from constraints page">{fmt$(job.sell_price_snapshot)}<span className="text-white/25 text-[8px] ml-0.5">c</span></span>
                      ) : (
                        <EditableCurrency value={job.estimated_value} onSave={v => patchJob(job.id, {estimated_value:v})} />
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-xs">
                      {isPlh ? (
                        <span className="text-orange-300/70">{perUnitBoxes} × {remaining}</span>
                      ) : job.fg_boxes && job.fg_boxes.length > 0 ? (
                        <span className="text-white/60" title={job.fg_boxes.map(f=>`${f.label}: ${f.boxes}`).join("\n") + "\n(from spec — edit on constraints page)"}>{job.box_count}<span className="text-white/25 text-[8px] ml-0.5">c</span></span>
                      ) : (
                        <EditableNumber value={job.box_count} onSave={v => patchJob(job.id, {box_count:v})} />
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {isPlh ? (
                        <span className={`text-xs tabular-nums ${countShop(job) ? "text-orange-300/70" : "opacity-30 line-through text-white/40"}`}>
                          {perUnitShop > 0 ? `${perUnitShop}×${remaining}` : "—"}
                        </span>
                      ) : (
                        <span className={countShop(job) ? "" : "opacity-30 line-through"}>
                          <EditableNumber value={job.shop_hrs} suffix="h" onSave={v => patchJob(job.id, {shop_hrs:v})} />
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 min-w-[90px]">
                      {isPlh ? (
                        <span className="text-orange-400/40 text-[9px]">forecast</span>
                      ) : (
                        <EditableSelect value={job.install_type} options={INSTALL_TYPE_OPTIONS} onSave={v => patchJob(job.id, {install_type:v})} />
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {isPlh ? (
                        <span className={`text-xs tabular-nums ${countInstall(job) ? "text-orange-300/70" : "opacity-30 line-through text-white/40"}`}>
                          {perUnitInstall > 0 ? `${perUnitInstall}×${remaining}` : "—"}
                        </span>
                      ) : job.install_type === "delivery_only" ? (
                        <span className="text-white/20 text-[9px]">n/a</span>
                      ) : (
                        <span className={countInstall(job) ? "" : "opacity-30 line-through"}><EditableNumber value={job.install_hrs} suffix="h" onSave={v => patchJob(job.id, {install_hrs:v})} /></span>
                      )}
                    </td>
                    {/* Delivery. This cell used to display the schedule-derived
                        anticipated_delivery and write a field called
                        anticipated_delivery, which is not a column — so every edit
                        500'd, and the optimistic update made it look like it had
                        saved until the reload. An editable cell now shows exactly
                        the value it edits: jobs.delivery_date. When the calendar
                        disagrees, the calendar's date is shown under it, read-only,
                        because that is the one the shop is working to. */}
                    <td className="px-2 py-2 min-w-[90px]">
                      <EditableDate value={job.delivery_date} onSave={v => patchJob(job.id, {delivery_date:v})} />
                      {job.scheduled_install_date && job.scheduled_install_date !== job.delivery_date && (
                        <div className="text-amber-300/50 text-[8px] leading-tight"
                             title="From the install event on the schedule. Change it on the calendar, not here.">
                          sched {job.scheduled_install_date}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 min-w-[90px]">
                      {isPlh ? (
                        <span className="text-white/20 text-[9px]">—</span>
                      ) : (
                        <>
                          <EditableDate value={job.install_start_date} placeholder="Set start" onSave={v => patchJob(job.id, {install_start_date:v})} />
                          {job.scheduled_install_date && job.scheduled_install_date !== job.install_start_date && (
                            <div className="text-amber-300/50 text-[8px] leading-tight"
                                 title="The install event on the schedule starts on this date. Nothing syncs the two, so they can drift.">
                              sched {job.scheduled_install_date}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-1 py-2 w-10">
                      <div className="flex items-center gap-1">
                        {isPlh ? (
                          <button onClick={() => setLinkModal(job)}
                            className="opacity-0 group-hover/row:opacity-70 hover:!opacity-100 text-orange-400 text-[9px] font-condensed uppercase tracking-widest transition-opacity whitespace-nowrap"
                            title="Link a job to this placeholder">
                            Link →
                          </button>
                        ) : (
                          <>
                            {job.builder_id && !job.placeholder_id && (
                              <LinkToPlaceholderDropdown job={job} placeholders={openPlaceholders} onLink={linkJobToPlaceholder} />
                            )}
                            <button onClick={() => deleteJob(job.id, job.client_name)}
                              className="opacity-0 group-hover/row:opacity-40 hover:!opacity-100 text-red-400 text-[11px] transition-opacity"
                              title="Delete job">✕</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr><td colSpan={11} className="text-center text-white/20 py-10 text-sm">No jobs</td></tr>
              )}
            </tbody>
            {visible.length > 0 && (
              <tfoot>
                <tr className="border-t border-white/10 text-white/50 text-[10px] font-condensed bg-white/[0.01]">
                  <td className="px-3 py-2" colSpan={4}>Totals — {visible.length} jobs</td>
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
      <div className="flex items-center justify-between mt-3">
        <p className="text-white/15 text-[9px] font-condensed">
          Click any month card to filter · Click a cell to edit inline · ⬡ Placeholder rows use per-unit × remaining for pipeline totals
        </p>
        {saveFlash && (
          <span className={`text-[10px] font-condensed px-2 py-0.5 rounded transition-opacity ${saveFlash.startsWith("⚠") ? "text-red-400 bg-red-500/10" : "text-green-400 bg-green-500/10"}`}>
            {saveFlash}
          </span>
        )}
      </div>
    </div>
  );
}
