"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";

const DB_CATALOGS = [
  "door_styles","colors_carcass","drawer_box","hardware_pulls","edgeband",
  "appliances","species","rooms","molding_types","molding_profiles","molding_materials",
  "door_materials","sheens","drawer_slides","glazes","topcoats",
  "countertop_styles","countertop_edges","countertop_materials",
  "hardware_hinges","hardware_drawer_slides","hardware_rollout_slides",
  "hardware_closet_rods","hardware_trash_pullouts","hardware_base_pullouts",
  "hardware_blind_corners","hardware_shelf_clips","hardware_door_pulls",
  "hardware_drawer_pulls","hardware_misc",
];

const LABEL = "block text-[10px] font-condensed uppercase tracking-widest text-white/40 mb-1";
const INPUT = "w-full bg-[#111] border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#f08122]";

function RowEditor({ row, onSave, onCancel }: {
  row: Record<string, unknown>;
  onSave: (r: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ ...row });
  const keys = Object.keys(row);
  function set(k: string, v: string) {
    setForm(prev => {
      // Preserve original type where possible
      const orig = row[k];
      if (typeof orig === "number") return { ...prev, [k]: v === "" ? null : Number(v) };
      if (typeof orig === "boolean") return { ...prev, [k]: v === "true" };
      if (orig === null && v === "") return { ...prev, [k]: null };
      return { ...prev, [k]: v };
    });
  }
  return (
    <div className="bg-[#111] border border-[#f08122]/30 rounded p-3 my-1">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {keys.map(k => (
          <div key={k}>
            <label className={LABEL}>{k}</label>
            {typeof row[k] === "boolean" ? (
              <select value={String(form[k])} onChange={e => set(k, e.target.value)} className={INPUT}>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <input value={form[k] == null ? "" : String(form[k])} onChange={e => set(k, e.target.value)} className={INPUT} />
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={() => onSave(form)} className="bg-[#f08122] text-white text-xs font-condensed uppercase tracking-widest px-3 py-1.5 rounded hover:bg-[#d9711e]">Save</button>
        <button onClick={onCancel} className="border border-white/15 text-white/40 text-xs font-condensed uppercase tracking-widest px-3 py-1.5 rounded hover:text-white">Cancel</button>
      </div>
    </div>
  );
}

function CatalogEditor({ name }: { name: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/admin/catalog-libraries/${name}`);
    if (r.ok) { const d = await r.json(); setRows(d.rows ?? []); }
    setLoading(false);
  }, [name]);

  useEffect(() => { load(); }, [load]);

  async function save(newRows: Record<string, unknown>[]) {
    setSaving(true);
    const r = await fetch(`/api/admin/catalog-libraries/${name}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: newRows }),
    });
    if (r.ok) { setFlash("Saved ✓"); setRows(newRows); setTimeout(() => setFlash(""), 2000); }
    else setFlash("⚠ Save failed");
    setSaving(false);
  }

  function newBlankRow(): Record<string, unknown> {
    if (rows.length === 0) return { id: "", name: "" };
    return Object.fromEntries(Object.keys(rows[0]).map(k => {
      const v = rows[0][k];
      return [k, typeof v === "boolean" ? false : typeof v === "number" ? 0 : ""];
    }));
  }

  if (loading) return <div className="text-white/30 text-xs py-4 pl-2">Loading…</div>;

  return (
    <div className="mt-2">
      {flash && <div className="text-xs text-[#f08122] mb-2">{flash}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 text-white/30 text-[9px] font-condensed uppercase tracking-widest">
              {rows[0] && Object.keys(rows[0]).map(k => (
                <th key={k} className="text-left px-2 py-1.5">{k}</th>
              ))}
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              editIdx === i ? (
                <tr key={i}><td colSpan={99}>
                  <RowEditor row={row} onCancel={() => setEditIdx(null)}
                    onSave={updated => {
                      const next = rows.map((r, j) => j === i ? updated : r);
                      save(next);
                      setEditIdx(null);
                    }} />
                </td></tr>
              ) : (
                <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] group">
                  {Object.values(row).map((v, j) => (
                    <td key={j} className="px-2 py-1.5 text-white/70 max-w-[160px] truncate">
                      {v == null ? <span className="text-white/20">—</span> : String(v)}
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                      <button onClick={() => setEditIdx(i)} className="text-white/40 hover:text-[#f08122] text-[9px] font-condensed uppercase tracking-widest">Edit</button>
                      <button onClick={() => { if (confirm("Delete this row?")) save(rows.filter((_, j) => j !== i)); }}
                        className="text-red-400/40 hover:text-red-400 text-[9px] font-condensed uppercase tracking-widest">Del</button>
                    </div>
                  </td>
                </tr>
              )
            ))}
            {adding && (
              <tr><td colSpan={99}>
                <RowEditor row={newBlankRow()} onCancel={() => setAdding(false)}
                  onSave={newRow => {
                    save([...rows, newRow]);
                    setAdding(false);
                  }} />
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 mt-2">
        <button onClick={() => { setAdding(true); setEditIdx(null); }}
          disabled={saving}
          className="text-[9px] font-condensed uppercase tracking-widest text-white/40 hover:text-[#f08122] border border-white/10 hover:border-[#f08122]/30 rounded px-2 py-1 transition-colors">
          + Add Row
        </button>
        {saving && <span className="text-white/30 text-[9px] self-center">Saving…</span>}
      </div>
    </div>
  );
}

export default function LibrariesPage() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="mb-8">
        <h1 className="font-heading text-3xl uppercase tracking-wide text-white">Libraries</h1>
        <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mt-1">
          Click a catalog to expand and edit rows. Changes save to DB instantly.
        </p>
      </div>

      <div className="space-y-1">
        {DB_CATALOGS.map(name => (
          <div key={name} className="border border-white/8 rounded-lg overflow-hidden">
            <button
              onClick={() => setOpen(open === name ? null : name)}
              className="w-full flex items-center justify-between px-4 py-3 bg-[#1a1b1c] hover:bg-[#1e1f20] transition-colors text-left"
            >
              <span className="font-condensed uppercase tracking-widest text-sm text-white">{name.replace(/_/g, " ")}</span>
              <span className="text-white/30 text-xs">{open === name ? "▲ Close" : "▼ Edit"}</span>
            </button>
            {open === name && (
              <div className="px-4 pb-4 bg-[#161718] border-t border-white/5">
                <CatalogEditor name={name} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 p-4 bg-white/[0.02] border border-white/8 rounded-lg text-xs text-white/30">
        <p className="font-condensed uppercase tracking-widest text-white/40 mb-1">First-time setup</p>
        <p>If a catalog shows 0 rows, run: <code className="text-white/50">node scripts/migrate-catalogs-to-db.mjs</code></p>
      </div>
    </section>
  );
}
