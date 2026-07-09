"use client";

import { useState, useEffect } from "react";

type Builder = {
  id: string; company: string; contact_name: string; phone: string;
  email: string; typical_pm: string; notes: string; active: number;
};

const EMPTY: Builder = { id: "", company: "", contact_name: "", phone: "", email: "", typical_pm: "", notes: "", active: 1 };
const INPUT = "w-full bg-[#1a1a1a] border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122]";

export default function BuilderCompaniesPage() {
  const [builders, setBuilders] = useState<Builder[]>([]);
  const [edited, setEdited] = useState<Record<string, Partial<Builder>>>({});
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState<Builder>({ ...EMPTY });
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function load() {
    const res = await fetch("/api/builders?q=");
    if (res.ok) setBuilders(await res.json());
  }

  useEffect(() => { load(); }, []);

  function patch(id: string, field: keyof Builder, val: string) {
    setEdited((prev) => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  }

  async function save(b: Builder) {
    setSaving(b.id); setErr("");
    const merged = { ...b, ...edited[b.id] };
    const res = await fetch("/api/builders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(merged),
    });
    if (!res.ok) setErr("Save failed");
    else { setEdited((p) => { const n = { ...p }; delete n[b.id]; return n; }); await load(); }
    setSaving(null);
  }

  async function saveNew() {
    if (!newRow.id || !newRow.company) { setErr("ID and Company are required"); return; }
    setSaving("new"); setErr("");
    const res = await fetch("/api/builders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRow),
    });
    if (!res.ok) setErr("Save failed");
    else { setAdding(false); setNewRow({ ...EMPTY }); await load(); }
    setSaving(null);
  }

  const cols: { key: keyof Builder; label: string; width: string }[] = [
    { key: "id",           label: "ID (slug)",  width: "w-28" },
    { key: "company",      label: "Company",    width: "w-36" },
    { key: "contact_name", label: "Contact",    width: "w-32" },
    { key: "phone",        label: "Phone",      width: "w-32" },
    { key: "email",        label: "Email",      width: "w-44" },
    { key: "typical_pm",  label: "Default PM", width: "w-28" },
    { key: "notes",        label: "Notes",      width: "flex-1" },
  ];

  return (
    <div className="min-h-screen bg-[#111] text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between gap-6">
        <div>
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs">Advanced Custom Cabinets</p>
          <p className="text-white font-condensed uppercase tracking-widest text-sm mt-0.5">Builder Companies</p>
        </div>
        <nav className="flex items-center gap-4">
          <a href="/admin/libraries" className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs transition-colors">Libraries</a>
          <a href="/admin/builders" className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs transition-colors">User Accounts</a>
          <a href="/jobs" className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs transition-colors">Jobs</a>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <p className="text-white/30 text-xs font-condensed uppercase tracking-widest">
            Auto-fills builder fields when creating jobs · also editable via data/builders.csv + npm run sync-builders
          </p>
          <button
            onClick={() => { setAdding(true); setErr(""); }}
            className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded transition-colors"
          >
            + Add Builder
          </button>
        </div>

        {err && <p className="text-red-400 text-xs font-condensed uppercase tracking-widest mb-4">{err}</p>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                {cols.map((c) => (
                  <th key={c.key} className={`${c.width} text-left py-2 px-2 text-white/30 font-condensed uppercase tracking-widest text-[10px]`}>
                    {c.label}
                  </th>
                ))}
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {adding && (
                <tr className="border-b border-[#f08122]/20 bg-[#f08122]/5">
                  {cols.map((c) => (
                    <td key={c.key} className="py-2 px-2">
                      <input className={INPUT} value={newRow[c.key] as string}
                        onChange={(e) => setNewRow((p) => ({ ...p, [c.key]: e.target.value }))}
                        placeholder={c.label} />
                    </td>
                  ))}
                  <td className="py-2 px-2">
                    <div className="flex gap-1">
                      <button onClick={saveNew} disabled={saving === "new"}
                        className="bg-[#f08122] hover:bg-[#d9711e] text-white text-xs font-condensed uppercase px-2 py-1 rounded disabled:opacity-50">
                        {saving === "new" ? "…" : "Save"}
                      </button>
                      <button onClick={() => { setAdding(false); setErr(""); }}
                        className="text-white/30 hover:text-white text-xs font-condensed uppercase px-2 py-1">
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {builders.map((b) => {
                const isDirty = !!edited[b.id] && Object.keys(edited[b.id]).length > 0;
                return (
                  <tr key={b.id} className={`border-b border-white/5 hover:bg-white/2 ${isDirty ? "bg-[#f08122]/5" : ""}`}>
                    {cols.map((c) => (
                      <td key={c.key} className="py-2 px-2">
                        {c.key === "id" ? (
                          <span className="text-white/40 font-condensed text-xs">{b.id}</span>
                        ) : (
                          <input className={INPUT}
                            value={edited[b.id]?.[c.key] as string ?? (b[c.key] as string) ?? ""}
                            onChange={(e) => patch(b.id, c.key, e.target.value)} />
                        )}
                      </td>
                    ))}
                    <td className="py-2 px-2">
                      {isDirty && (
                        <button onClick={() => save(b)} disabled={saving === b.id}
                          className="bg-[#f08122] hover:bg-[#d9711e] text-white text-xs font-condensed uppercase px-3 py-1 rounded disabled:opacity-50">
                          {saving === b.id ? "…" : "Save"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {builders.length === 0 && !adding && (
                <tr>
                  <td colSpan={cols.length + 1} className="py-8 text-center text-white/20 text-sm font-condensed uppercase tracking-widest">
                    No builders yet — add one above or run npm run sync-builders
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
