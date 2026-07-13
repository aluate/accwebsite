"use client";

import { useState } from "react";
import catalogFinishes from "@/data/catalogs/acc_catalog_finishes.json";
import catalogDoors    from "@/data/catalogs/acc_catalog_doors.json";
import catalogPulls    from "@/data/catalogs/acc_catalog_pulls.json";
import catalogCarcass  from "@/data/catalogs/acc_catalog_carcass.json";

type FinishRow    = { catalog_id: string; display_name: string; finish_type: string; hex_preview?: string };
type DoorRow      = { catalog_id: string; display_name: string };
type PullRow      = { catalog_id: string; display_name: string; unit_cost: number };
type CarcassRow   = { catalog_id: string; display_name: string };

const FINISHES  = catalogFinishes  as FinishRow[];
const DOORS     = catalogDoors     as DoorRow[];
const PULLS     = catalogPulls     as PullRow[];
const CARCASSES = catalogCarcass   as CarcassRow[];

export type EstimateFG = {
  id: string;
  name: string;
  sort_order: number;
  finish_catalog_id: string | null;
  door_catalog_id: string | null;
  pull_catalog_id: string | null;
  carcass_catalog_id: string;
};

function Sel({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-[10px] text-white/30 uppercase tracking-widest mb-0.5 font-condensed">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#0d0e0f] border border-white/15 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122]/60"
      >
        {children}
      </select>
    </div>
  );
}

export function EstimateFinishGroupEditor({
  estimateId,
  groups,
  onChange,
}: {
  estimateId: string;
  groups: EstimateFG[];
  onChange: (groups: EstimateFG[]) => void;
}) {
  const [adding, setAdding] = useState(false);

  function uid() { return Math.random().toString(36).slice(2); }

  async function addGroup() {
    setAdding(true);
    const res = await fetch(`/api/estimates/${estimateId}/finish-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `FG ${groups.length + 1}` }),
    });
    const { fg } = await res.json();
    onChange([...groups, fg]);
    setAdding(false);
  }

  async function updateGroup(id: string, patch: Partial<EstimateFG>) {
    onChange(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    await fetch(`/api/estimates/${estimateId}/finish-groups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function deleteGroup(id: string) {
    if (!confirm("Remove this finish group?")) return;
    onChange(groups.filter((g) => g.id !== id));
    await fetch(`/api/estimates/${estimateId}/finish-groups/${id}`, { method: "DELETE" });
  }

  const mels    = FINISHES.filter((f) => f.finish_type === "MELAMINE");
  const stains  = FINISHES.filter((f) => f.finish_type === "STAIN");
  const paints  = FINISHES.filter((f) => f.finish_type === "PAINT");

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] text-white/30 uppercase tracking-widest font-condensed">Finish Groups</div>
        <button
          onClick={addGroup}
          disabled={adding}
          className="text-xs text-white/40 hover:text-[#f08122] transition-colors"
        >
          + Add FG
        </button>
      </div>

      {groups.length === 0 && (
        <div className="text-sm text-white/20 italic py-2">No finish groups yet — add one above.</div>
      )}

      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g.id} className="bg-[#1a1b1c] border border-white/10 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <input
                value={g.name}
                onChange={(e) => updateGroup(g.id, { name: e.target.value })}
                className="bg-transparent text-sm font-medium text-white border-0 outline-none flex-1 focus:text-[#f08122]"
                placeholder="FG name (e.g. Kitchen)"
              />
              <button
                onClick={() => deleteGroup(g.id)}
                className="text-white/20 hover:text-red-400 text-xs transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Sel label="Finish" value={g.finish_catalog_id ?? ""} onChange={(v) => updateGroup(g.id, { finish_catalog_id: v || null })}>
                <option value="">— Select —</option>
                <optgroup label="Melamine">
                  {mels.map((f) => <option key={f.catalog_id} value={f.catalog_id}>{f.display_name}</option>)}
                </optgroup>
                <optgroup label="Stain">
                  {stains.map((f) => <option key={f.catalog_id} value={f.catalog_id}>{f.display_name}</option>)}
                </optgroup>
                <optgroup label="Paint">
                  {paints.map((f) => <option key={f.catalog_id} value={f.catalog_id}>{f.display_name}</option>)}
                </optgroup>
              </Sel>
              <Sel label="Door" value={g.door_catalog_id ?? ""} onChange={(v) => updateGroup(g.id, { door_catalog_id: v || null })}>
                <option value="">— Select —</option>
                {DOORS.map((d) => <option key={d.catalog_id} value={d.catalog_id}>{d.display_name}</option>)}
              </Sel>
              <Sel label="Pull" value={g.pull_catalog_id ?? ""} onChange={(v) => updateGroup(g.id, { pull_catalog_id: v || null })}>
                <option value="">— Select —</option>
                {PULLS.map((p) => <option key={p.catalog_id} value={p.catalog_id}>{p.display_name}</option>)}
              </Sel>
              <Sel label="Carcass" value={g.carcass_catalog_id} onChange={(v) => updateGroup(g.id, { carcass_catalog_id: v })}>
                {CARCASSES.map((c) => <option key={c.catalog_id} value={c.catalog_id}>{c.display_name}</option>)}
              </Sel>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
