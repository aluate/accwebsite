"use client";

import { useState, useEffect } from "react";

type Builder = {
  id: string;
  company: string;
  contact_name: string;
  phone: string;
  email: string;
  typical_pm: string;
  notes: string;
  active: number;
  // Spec defaults
  default_finish_type: string;
  default_carcass_id: string;
  default_drawer_box_id: string;
  default_pull_id: string;
  default_paint_brand: string;
  default_accessories: string;
  preferred_cabdoor_usage_groups: string;
  is_residential_default: number;
};

const EMPTY: Builder = {
  id: "", company: "", contact_name: "", phone: "", email: "",
  typical_pm: "", notes: "", active: 1,
  default_finish_type: "paint", default_carcass_id: "", default_drawer_box_id: "",
  default_pull_id: "", default_paint_brand: "", default_accessories: "",
  preferred_cabdoor_usage_groups: "", is_residential_default: 0,
};

const INPUT = "w-full bg-[#1a1a1a] border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122]";
const LABEL = "block text-[10px] font-condensed uppercase tracking-widest text-white/40 mb-1";
const SECTION_HEAD = "text-[10px] font-condensed uppercase tracking-widest text-[#f08122] mb-3 mt-5";

function Field({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className={INPUT} />
    </div>
  );
}

function BuilderForm({ b, onSave, onCancel, saving }: {
  b: Builder;
  onSave: (updated: Builder) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Builder>({ ...b });
  function set(k: keyof Builder, v: string | number) {
    setForm(prev => ({ ...prev, [k]: v }));
  }
  return (
    <div className="bg-[#111] border border-[#f08122]/30 rounded-lg p-5 mb-4">
      <div className="grid grid-cols-2 gap-3">
        <p className={SECTION_HEAD + " col-span-2"}>Company & Contact</p>
        <Field label="Company Name *" value={form.company} onChange={v => set("company", v)} />
        <Field label="ID (slug, e.g. BILD-PREMIER)" value={form.id} onChange={v => set("id", v)} />
        <Field label="Primary Contact Name" value={form.contact_name} onChange={v => set("contact_name", v)} />
        <Field label="Email" value={form.email} type="email" onChange={v => set("email", v)} />
        <Field label="Phone" value={form.phone} type="tel" onChange={v => set("phone", v)} />
        <Field label="Typical ACC PM" value={form.typical_pm} onChange={v => set("typical_pm", v)} />
        <div className="col-span-2">
          <Field label="Notes" value={form.notes} onChange={v => set("notes", v)} />
        </div>

        <p className={SECTION_HEAD + " col-span-2"}>Spec Defaults</p>
        <div>
          <label className={LABEL}>Default Finish Type</label>
          <select value={form.default_finish_type} onChange={e => set("default_finish_type", e.target.value)}
            className={INPUT}>
            <option value="paint">Paint</option>
            <option value="stain">Stain</option>
            <option value="melamine">Melamine</option>
          </select>
        </div>
        <Field label="Default Paint Brand (e.g. SW)" value={form.default_paint_brand} onChange={v => set("default_paint_brand", v)} />
        <Field label="Default Carcass ID (e.g. CAR-001)" value={form.default_carcass_id} onChange={v => set("default_carcass_id", v)} />
        <Field label="Default Drawer Box ID (e.g. DBX-001)" value={form.default_drawer_box_id} onChange={v => set("default_drawer_box_id", v)} />
        <Field label="Default Pull ID (e.g. PL-001)" value={form.default_pull_id} onChange={v => set("default_pull_id", v)} />
        <Field label="Default Accessories (e.g. ACC-001;ACC-004)" value={form.default_accessories} onChange={v => set("default_accessories", v)} />
        <Field label="Preferred Cab Door Groups (e.g. A;B)" value={form.preferred_cabdoor_usage_groups} onChange={v => set("preferred_cabdoor_usage_groups", v)} />
        <div className="flex items-center gap-2">
          <input type="checkbox" id="resDefault" checked={form.is_residential_default === 1}
            onChange={e => set("is_residential_default", e.target.checked ? 1 : 0)}
            className="accent-[#f08122]" />
          <label htmlFor="resDefault" className="text-sm text-white/60">Residential walk-in default</label>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="active" checked={form.active === 1}
            onChange={e => set("active", e.target.checked ? 1 : 0)}
            className="accent-[#f08122]" />
          <label htmlFor="active" className="text-sm text-white/60">Active</label>
        </div>
      </div>
      <div className="flex gap-3 mt-5">
        <button onClick={() => onSave(form)} disabled={saving || !form.company || !form.id}
          className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded transition-colors disabled:opacity-40">
          {saving ? "Saving…" : "Save Builder"}
        </button>
        <button onClick={onCancel}
          className="border border-white/15 text-white/50 hover:text-white font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function BuilderCompaniesPage() {
  const [builders, setBuilders] = useState<Builder[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    const res = await fetch("/api/builders?q=");
    if (res.ok) {
      const data = await res.json();
      setBuilders(Array.isArray(data) ? data : []);
    }
  }

  useEffect(() => { load(); }, []);

  async function saveBuilder(b: Builder) {
    if (!b.id || !b.company) { setErr("Company and ID are required"); return; }
    setSaving(true); setErr("");
    const res = await fetch("/api/builders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
    if (!res.ok) setErr("Save failed");
    else { setEditingId(null); setAdding(false); await load(); }
    setSaving(false);
  }

  const FINISH_LABEL: Record<string, string> = { paint: "Paint", stain: "Stain", melamine: "Melamine" };

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-2xl uppercase tracking-wide text-white">Builders</h1>
          <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mt-1">
            One record per builder — contact info + spec defaults
          </p>
        </div>
        <button onClick={() => { setAdding(true); setEditingId(null); setErr(""); }}
          className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-sm px-4 py-2 rounded transition-colors">
          + Add Builder
        </button>
      </div>

      {err && <p className="text-red-400 text-sm mb-4">{err}</p>}

      {adding && (
        <BuilderForm b={{ ...EMPTY }} onSave={saveBuilder} onCancel={() => setAdding(false)} saving={saving} />
      )}

      <div className="space-y-2">
        {builders.map(b => (
          <div key={b.id}>
            {editingId === b.id ? (
              <BuilderForm b={b} onSave={saveBuilder} onCancel={() => setEditingId(null)} saving={saving} />
            ) : (
              <div className="bg-[#1a1b1c] border border-white/8 rounded-lg px-5 py-4 flex items-start gap-4 hover:border-white/15 transition-colors group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-medium">{b.company}</span>
                    {b.is_residential_default === 1 && (
                      <span className="text-[9px] font-condensed uppercase tracking-widest text-[#f08122] border border-[#f08122]/30 rounded px-1.5 py-0.5">Default</span>
                    )}
                    {b.active === 0 && (
                      <span className="text-[9px] font-condensed uppercase tracking-widest text-white/30 border border-white/10 rounded px-1.5 py-0.5">Inactive</span>
                    )}
                  </div>
                  <div className="flex gap-4 text-xs text-white/40 flex-wrap">
                    {b.contact_name && <span>👤 {b.contact_name}</span>}
                    {b.email && <span>✉ {b.email}</span>}
                    {b.phone && <span>📞 {b.phone}</span>}
                    {b.typical_pm && <span>PM: {b.typical_pm}</span>}
                  </div>
                  <div className="flex gap-3 mt-1.5 text-[10px] text-white/30 flex-wrap">
                    {b.default_finish_type && <span>Finish: {FINISH_LABEL[b.default_finish_type] ?? b.default_finish_type}</span>}
                    {b.default_carcass_id && <span>Carcass: {b.default_carcass_id}</span>}
                    {b.default_drawer_box_id && <span>Drawer: {b.default_drawer_box_id}</span>}
                    {b.default_pull_id && <span>Pull: {b.default_pull_id}</span>}
                    {b.default_paint_brand && <span>Brand: {b.default_paint_brand}</span>}
                  </div>
                  {b.notes && <p className="text-[10px] text-white/25 mt-1 italic">{b.notes}</p>}
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[9px] text-white/25 font-mono self-center">{b.id}</span>
                  <button onClick={() => { setEditingId(b.id); setAdding(false); setErr(""); }}
                    className="text-xs text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest border border-white/10 hover:border-[#f08122]/30 rounded px-2 py-1 transition-colors">
                    Edit
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {builders.length === 0 && (
          <p className="text-white/20 text-sm text-center py-12">No builders yet. Add one above or run the migration script.</p>
        )}
      </div>

      <div className="mt-8 p-4 bg-white/[0.02] border border-white/8 rounded-lg text-xs text-white/30">
        <p className="font-condensed uppercase tracking-widest text-white/40 mb-1">Migration</p>
        <p>To import your existing builder profiles into this table, run:<br />
        <code className="text-white/50">node scripts/migrate-unified-builders.mjs</code></p>
      </div>
    </div>
  );
}
