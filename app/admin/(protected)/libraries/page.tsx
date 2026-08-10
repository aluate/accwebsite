"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useMemo } from "react";

// Every catalog the loader reads, in the same order as lib/catalogs.ts.
const DB_CATALOGS = [
  "door_styles","colors_carcass","drawer_box","hardware_pulls","edgeband",
  "appliances","species","rooms","molding_types","molding_profiles","molding_materials",
  "door_materials","sheens","drawer_slides","glazes","topcoats",
  "countertop_styles","countertop_edges","countertop_materials",
  "hardware_hinges","hardware_drawer_slides","hardware_rollout_slides",
  "hardware_closet_rods","hardware_trash_pullouts","hardware_base_pullouts",
  "hardware_blind_corners","hardware_shelf_clips","hardware_door_pulls",
  "hardware_drawer_pulls","hardware_misc",
  // additional catalogs
  "acc_cabinet_catalog",
  "acc_catalog_carcass",
  "acc_catalog_doors",
  "acc_catalog_finishes",
  "acc_catalog_pulls",
  "accessories_reva",
  "builder_profiles",
  "cabdoor_edge_details",
  "cabdoor_inside_profiles",
  "cabdoor_mitre_patterns",
  "cabdoor_panels",
  "cabdoor_presets",
  "cabinet_features",
  "cabinet_labor",
  "cabinet_types",
  "cabinets_catalog",
  "colors_melamine",
  "colors_paint",
  "colors_stain",
  "construction_profiles",
  "doors_catalog",
  "express_colors",
  "paint_colors_bm",
  "paint_colors_sw",
];

const LABEL = "block text-[10px] font-condensed uppercase tracking-widest text-white/40 mb-1";
const INPUT = "w-full bg-[#111] border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#f08122]";
const BTN   = "text-[9px] font-condensed uppercase tracking-widest border rounded px-2 py-1 transition-colors";

/** How many rows to put in the DOM at once. paint_colors_sw has 1,526. */
const RENDER_CAP = 200;

type Meta = {
  source: "db" | "file" | "none";
  updated_at: string | null;
  file_row_count: number | null;
  is_object_catalog: boolean;
  known_catalog: boolean;
  superseded_by: { table: string; editAt: string } | null;
};

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
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  // No setState before the first await: this effect runs on mount, and setting
  // state synchronously in an effect body cascades a render. `loading` starts
  // true, which is the only state this needs before the fetch resolves.
  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/catalog-libraries/${name}`);
    setError("");
    if (r.ok) {
      const d = await r.json();
      setRows(d.rows ?? []);
      setMeta({
        source: d.source ?? "none",
        updated_at: d.updated_at ?? null,
        file_row_count: d.file_row_count ?? null,
        is_object_catalog: !!d.is_object_catalog,
        known_catalog: d.known_catalog !== false,
        superseded_by: d.superseded_by ?? null,
      });
    } else {
      setError(`Could not load: ${r.status}`);
    }
    setLoading(false);
  }, [name]);

  // Fetching the catalog on mount is the external-system sync the rule's own docs
  // allow, and every setState in load() happens after the await rather than in the
  // effect body — but the rule cannot see through an async call, so it is silenced
  // here rather than left as a standing error nobody reads.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function save(newRows: Record<string, unknown>[]) {
    setSaving(true);
    setError("");
    const r = await fetch(`/api/admin/catalog-libraries/${name}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: newRows }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      setRows(newRows);
      setFlash(d.warning ? `Saved — ${d.warning}` : "Saved ✓");
      setMeta(m => (m ? { ...m, source: "db", updated_at: new Date().toISOString() } : m));
      setTimeout(() => setFlash(""), d.warning ? 12000 : 2000);
    } else {
      // The API's refusals are specific and worth reading — an empty save, a
      // duplicate id, a catalog that is edited somewhere else. "Save failed" told
      // you none of that.
      setError(d.error ?? `Save failed (${r.status})`);
    }
    setSaving(false);
  }

  async function revertToFile() {
    if (!confirm(`Discard the database copy of ${name} and go back to the version that ships with the deploy?`)) return;
    setSaving(true);
    setError("");
    setLoading(true);
    const r = await fetch(`/api/admin/catalog-libraries/${name}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { setFlash(`Reverted to file — ${d.row_count} rows`); await load(); }
    else setError(d.error ?? `Revert failed (${r.status})`);
    setSaving(false);
  }

  function newBlankRow(): Record<string, unknown> {
    if (rows.length === 0) return { id: "", name: "" };
    return Object.fromEntries(Object.keys(rows[0]).map(k => {
      const v = rows[0][k];
      return [k, typeof v === "boolean" ? false : typeof v === "number" ? 0 : ""];
    }));
  }

  // Filter on the raw row values. Indices into `rows` are kept so Edit and Del
  // still address the right row while a filter is applied.
  const visible = useMemo(() => {
    const idx = rows.map((r, i) => [r, i] as const);
    if (!q.trim()) return idx;
    const needle = q.trim().toLowerCase();
    return idx.filter(([r]) => Object.values(r).some(v => String(v ?? "").toLowerCase().includes(needle)));
  }, [rows, q]);

  const shown = visible.slice(0, RENDER_CAP);

  if (loading) return <div className="text-white/30 text-xs py-4 pl-2">Loading…</div>;

  if (meta?.superseded_by) {
    return (
      <div className="mt-3 text-xs">
        <p className="text-amber-300/80">This catalog is not read from here.</p>
        <p className="text-white/40 mt-1">
          The app reads <code className="text-white/60">{meta.superseded_by.table}</code>.
          Editing it on this page saved a row that nothing looked at.
        </p>
        <a href={meta.superseded_by.editAt}
           className="inline-block mt-3 text-[#f08122] hover:underline font-condensed uppercase tracking-widest text-[10px]">
          Edit it at {meta.superseded_by.editAt} →
        </a>
      </div>
    );
  }

  if (meta?.is_object_catalog) {
    return (
      <div className="mt-3 text-xs">
        <p className="text-white/50">
          Stored as a single structured document, not a list of rows — this one is a price
          book / lookup table, so there is no row grid to edit.
        </p>
        <p className="text-white/30 mt-1">
          Edit <code className="text-white/50">data/catalogs/{name}.json</code> and deploy.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-3 mb-2 text-[10px] font-condensed uppercase tracking-widest">
        {meta?.source === "db" ? (
          <span className="text-[#f08122]">Live from database</span>
        ) : meta?.source === "file" ? (
          <span className="text-white/40">
            Shipped with the deploy — no database copy yet
          </span>
        ) : (
          <span className="text-red-400/70">No source found</span>
        )}
        <span className="text-white/30">{rows.length} rows</span>
        {meta?.source === "db" && meta.file_row_count != null && meta.file_row_count !== rows.length && (
          <span className="text-amber-300/60">file has {meta.file_row_count}</span>
        )}
        <span className="flex-1" />
        <a href={`/api/admin/catalog-libraries/${name}?format=csv`}
           className={`${BTN} border-white/10 text-white/40 hover:text-[#f08122] hover:border-[#f08122]/30`}>
          Download CSV
        </a>
        {meta?.source === "db" && (
          <button onClick={revertToFile} disabled={saving}
            className={`${BTN} border-white/10 text-white/40 hover:text-amber-300 hover:border-amber-300/30`}>
            Revert to file
          </button>
        )}
      </div>

      {flash && <div className="text-xs text-[#f08122] mb-2">{flash}</div>}
      {error && (
        <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded px-3 py-2 mb-2">
          {error}
        </div>
      )}

      {rows.length > 25 && (
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter rows…"
          className={`${INPUT} mb-2 max-w-xs`} />
      )}

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
            {shown.map(([row, i]) => (
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
                  {Object.keys(rows[0] ?? row).map((k, j) => (
                    <td key={j} className="px-2 py-1.5 text-white/70 max-w-[160px] truncate">
                      {row[k] == null ? <span className="text-white/20">—</span> : String(row[k])}
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

      {visible.length > shown.length && (
        <p className="text-white/30 text-[10px] mt-2">
          Showing {shown.length} of {visible.length} matching rows. Filter to narrow it down —
          the rest are still there and are not affected by editing.
        </p>
      )}

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
          Click a catalog to expand and edit rows. Saves take effect everywhere within 15 seconds.
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

      <div className="mt-8 p-4 bg-white/[0.02] border border-white/8 rounded-lg text-xs text-white/30 space-y-2">
        <p className="font-condensed uppercase tracking-widest text-white/40">How this works</p>
        <p>
          A catalog reads from the database when a row exists for it, and from the copy
          that ships with the deploy otherwise. Both are shown above, so it is always
          clear which one a job is being built from.
        </p>
        <p>
          To load every catalog into the database so the two agree:
          <code className="text-white/50"> node scripts/seed-catalog-libraries.mjs --dry-run</code>,
          then again without the flag.
        </p>
        <p>
          <strong className="text-white/40">Edits here do not reach a fresh deploy.</strong> Download
          the CSV and commit it to <code className="text-white/50">data/catalogs/</code> when a change
          is meant to be permanent.
        </p>
      </div>
    </section>
  );
}
