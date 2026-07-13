"use client";

import { useState, useEffect } from "react";

type Profile = {
  id: string;
  builder_name: string;
  builder_company: string | null;
  default_finish_type: "paint" | "stain" | "melamine";
  default_carcass_id: string | null;
  default_drawer_box_id: string | null;
  default_pull_id: string | null;
  default_paint_brand: string | null;
  notes: string | null;
  is_residential_default: boolean;
};

type Option = { id: string; name: string };

const INPUT = "w-full bg-[#1a1a1a] border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122]";
const SELECT = "w-full bg-[#1a1a1a] border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122]";

const CARCASS: Option[] = [
  { id: "CAR-001", name: "Maple Melamine" },
  { id: "CAR-002", name: "PF Maple Ply" },
  { id: "CAR-003", name: "PF Maple Ply — Mel/Ply" },
  { id: "CAR-004", name: "PF Birch Ply" },
  { id: "CAR-005", name: "White PB" },
];
const DRAWER: Option[] = [
  { id: "DBX-001", name: "Doweled PF Ply" },
  { id: "DBX-002", name: "Buy-out Dovetail" },
  { id: "DBX-099", name: "Other" },
];
const PULLS: Option[] = [
  { id: "PL-001", name: "Bar Pull 3in" },
  { id: "PL-002", name: "Bar Pull 5in" },
  { id: "PL-003", name: "Bar Pull 8in" },
  { id: "PL-004", name: "Bar Pull 12in" },
  { id: "PL-005", name: "Cup Pull 3in" },
  { id: "PL-006", name: "Cup Pull 3in Bin" },
  { id: "PL-007", name: "Round Knob 1.25in" },
  { id: "PL-008", name: "Square Knob 1.25in" },
  { id: "PL-099", name: "Other" },
];

const EMPTY: Omit<Profile, "id"> = {
  builder_name: "",
  builder_company: null,
  default_finish_type: "paint",
  default_carcass_id: "CAR-002",
  default_drawer_box_id: "DBX-002",
  default_pull_id: "PL-001",
  default_paint_brand: "SW",
  notes: null,
  is_residential_default: false,
};

export default function BuilderProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [edited, setEdited]     = useState<Record<string, Partial<Profile>>>({});
  const [adding, setAdding]     = useState(false);
  const [newRow, setNewRow]     = useState<Omit<Profile, "id">>({ ...EMPTY });
  const [saving, setSaving]     = useState<string | null>(null);
  const [err, setErr]           = useState("");

  async function load() {
    const res = await fetch("/api/admin/builder-profiles");
    if (res.ok) {
      const d = await res.json() as { profiles: Profile[] };
      setProfiles(d.profiles);
    }
  }

  useEffect(() => { void load(); }, []);

  function patch(id: string, field: keyof Profile, val: unknown) {
    setEdited((prev) => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  }

  function getValue<K extends keyof Profile>(p: Profile, field: K): Profile[K] {
    return (edited[p.id]?.[field] !== undefined ? edited[p.id][field] : p[field]) as Profile[K];
  }

  async function save(p: Profile) {
    setSaving(p.id); setErr("");
    const merged = { ...p, ...edited[p.id] };
    const res = await fetch("/api/admin/builder-profiles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(merged),
    });
    if (!res.ok) { setErr("Save failed"); setSaving(null); return; }
    setEdited((prev) => { const n = { ...prev }; delete n[p.id]; return n; });
    await load();
    setSaving(null);
  }

  async function saveNew() {
    if (!newRow.builder_name) { setErr("Builder name required"); return; }
    setSaving("new"); setErr("");
    const res = await fetch("/api/admin/builder-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRow),
    });
    if (!res.ok) { setErr("Save failed"); setSaving(null); return; }
    setAdding(false);
    setNewRow({ ...EMPTY });
    await load();
    setSaving(null);
  }

  async function del(id: string) {
    if (!confirm("Delete this profile?")) return;
    await fetch(`/api/admin/builder-profiles?id=${id}`, { method: "DELETE" });
    await load();
  }

  function SelOpts({ opts, value, onChange }: { opts: Option[]; value: string | null; onChange: (v: string) => void }) {
    return (
      <select className={SELECT} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    );
  }

  const isDirty = (id: string) => !!edited[id] && Object.keys(edited[id]).length > 0;

  return (
    <div className="min-h-screen bg-[#111] text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between gap-6">
        <div>
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs">Advanced Custom Cabinets</p>
          <p className="text-white font-condensed uppercase tracking-widest text-sm mt-0.5">Builder Defaults</p>
        </div>
        <nav className="flex items-center gap-4">
          <a href="/admin/builder-companies" className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs transition-colors">Builder Companies</a>
          <a href="/admin/libraries" className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs transition-colors">Libraries</a>
          <a href="/jobs" className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs transition-colors">Jobs</a>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <p className="text-white/30 text-xs font-condensed uppercase tracking-widest">
              Defaults auto-populate finish groups when a new spec is created for a matching builder company.
            </p>
            <p className="text-white/20 text-xs font-condensed mt-1">
              Builder Company must match exactly what&apos;s entered on the job (case-insensitive).
            </p>
          </div>
          <button
            onClick={() => { setAdding(true); setErr(""); }}
            className="shrink-0 bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded transition-colors"
          >
            + Add Profile
          </button>
        </div>

        {err && <p className="text-red-400 text-xs font-condensed uppercase tracking-widest mb-4">{err}</p>}

        <div className="space-y-2">
          {/* Add row */}
          {adding && (
            <div className="bg-[#f08122]/5 border border-[#f08122]/30 rounded p-4 space-y-3">
              <p className="text-[#f08122] text-[10px] font-condensed uppercase tracking-widest">New Profile</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-white/40 font-condensed uppercase tracking-widest mb-1">Profile Name *</label>
                  <input className={INPUT} placeholder="e.g. Premier Homes" value={newRow.builder_name}
                    onChange={(e) => setNewRow((p) => ({ ...p, builder_name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-[10px] text-white/40 font-condensed uppercase tracking-widest mb-1">Builder Company (must match job field)</label>
                  <input className={INPUT} placeholder="e.g. Premier" value={newRow.builder_company ?? ""}
                    onChange={(e) => setNewRow((p) => ({ ...p, builder_company: e.target.value || null }))} />
                </div>
                <div>
                  <label className="block text-[10px] text-white/40 font-condensed uppercase tracking-widest mb-1">Default Finish Type</label>
                  <select className={SELECT} value={newRow.default_finish_type}
                    onChange={(e) => setNewRow((p) => ({ ...p, default_finish_type: e.target.value as Profile["default_finish_type"] }))}>
                    <option value="paint">Paint</option>
                    <option value="stain">Stain</option>
                    <option value="melamine">Melamine</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-white/40 font-condensed uppercase tracking-widest mb-1">Carcass</label>
                  <SelOpts opts={CARCASS} value={newRow.default_carcass_id} onChange={(v) => setNewRow((p) => ({ ...p, default_carcass_id: v || null }))} />
                </div>
                <div>
                  <label className="block text-[10px] text-white/40 font-condensed uppercase tracking-widest mb-1">Drawer Box</label>
                  <SelOpts opts={DRAWER} value={newRow.default_drawer_box_id} onChange={(v) => setNewRow((p) => ({ ...p, default_drawer_box_id: v || null }))} />
                </div>
                <div>
                  <label className="block text-[10px] text-white/40 font-condensed uppercase tracking-widest mb-1">Pull</label>
                  <SelOpts opts={PULLS} value={newRow.default_pull_id} onChange={(v) => setNewRow((p) => ({ ...p, default_pull_id: v || null }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] text-white/40 font-condensed uppercase tracking-widest mb-1">Notes</label>
                  <input className={INPUT} value={newRow.notes ?? ""} onChange={(e) => setNewRow((p) => ({ ...p, notes: e.target.value || null }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={newRow.is_residential_default}
                      onChange={(e) => setNewRow((p) => ({ ...p, is_residential_default: e.target.checked }))}
                      className="accent-[#f08122]" />
                    <span className="text-sm text-white/70">Walk-in residential default (used when job has no builder company)</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={saveNew} disabled={saving === "new"}
                  className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded transition-colors disabled:opacity-50">
                  {saving === "new" ? "Saving…" : "Save Profile"}
                </button>
                <button onClick={() => { setAdding(false); setErr(""); }}
                  className="text-white/40 hover:text-white font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Existing profiles */}
          {profiles.map((p) => {
            const dirty = isDirty(p.id);
            return (
              <div key={p.id} className={`border rounded p-4 ${dirty ? "border-[#f08122]/40 bg-[#f08122]/5" : "border-white/10 bg-[#1a1a1a]"}`}>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-white/25 font-condensed uppercase tracking-widest shrink-0">{p.id}</span>
                    {p.is_residential_default && (
                      <span className="text-[9px] font-condensed uppercase tracking-widest bg-[#f08122]/20 text-[#f08122] px-1.5 py-0.5 rounded">Walk-in Default</span>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {dirty && (
                      <button onClick={() => save(p)} disabled={saving === p.id}
                        className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs px-3 py-1 rounded transition-colors disabled:opacity-50">
                        {saving === p.id ? "…" : "Save"}
                      </button>
                    )}
                    <button onClick={() => del(p.id)}
                      className="text-white/20 hover:text-red-400 font-condensed uppercase tracking-widest text-xs px-2 py-1 transition-colors">
                      ✕
                    </button>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] text-white/40 font-condensed uppercase tracking-widest mb-1">Profile Name</label>
                    <input className={INPUT} value={getValue(p, "builder_name")}
                      onChange={(e) => patch(p.id, "builder_name", e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/40 font-condensed uppercase tracking-widest mb-1">Builder Company (matches job)</label>
                    <input className={INPUT} value={getValue(p, "builder_company") ?? ""}
                      onChange={(e) => patch(p.id, "builder_company", e.target.value || null)} />
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/40 font-condensed uppercase tracking-widest mb-1">Default Finish</label>
                    <select className={SELECT} value={getValue(p, "default_finish_type")}
                      onChange={(e) => patch(p.id, "default_finish_type", e.target.value as Profile["default_finish_type"])}>
                      <option value="paint">Paint</option>
                      <option value="stain">Stain</option>
                      <option value="melamine">Melamine</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/40 font-condensed uppercase tracking-widest mb-1">Carcass</label>
                    <SelOpts opts={CARCASS} value={getValue(p, "default_carcass_id")}
                      onChange={(v) => patch(p.id, "default_carcass_id", v || null)} />
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/40 font-condensed uppercase tracking-widest mb-1">Drawer Box</label>
                    <SelOpts opts={DRAWER} value={getValue(p, "default_drawer_box_id")}
                      onChange={(v) => patch(p.id, "default_drawer_box_id", v || null)} />
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/40 font-condensed uppercase tracking-widest mb-1">Pull</label>
                    <SelOpts opts={PULLS} value={getValue(p, "default_pull_id")}
                      onChange={(v) => patch(p.id, "default_pull_id", v || null)} />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-2">
                    <label className="block text-[10px] text-white/40 font-condensed uppercase tracking-widest mb-1">Notes</label>
                    <input className={INPUT} value={getValue(p, "notes") ?? ""}
                      onChange={(e) => patch(p.id, "notes", e.target.value || null)} />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={!!getValue(p, "is_residential_default")}
                        onChange={(e) => patch(p.id, "is_residential_default", e.target.checked)}
                        className="accent-[#f08122]" />
                      <span className="text-xs text-white/50">Walk-in default</span>
                    </label>
                  </div>
                </div>
              </div>
            );
          })}

          {profiles.length === 0 && !adding && (
            <p className="text-center py-12 text-white/20 font-condensed uppercase tracking-widest text-sm">
              No profiles yet.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
