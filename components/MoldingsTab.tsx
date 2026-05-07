"use client";

import type { MoldingType, MoldingProfile, MoldingMaterial } from "@/lib/catalogs";

export type FinishMolding = {
  id: string;
  finish_group_id: string;
  molding_type: string;            // FK ref to molding_types.csv:type
  molding_profile_id: string;      // FK ref to molding_profiles.csv:id (optional, "")
  qty_lf: number | null;
  // 2026-05-06: surfaced on UI; written through to finish_moldings.{size_in,material_id,material_other}.
  size_in: number | null;
  material_id: string;             // FK to molding_materials.csv (e.g. MM-001); "MM-099" = Other
  material_other: string;          // free-entry escape: shown as text input when material_id == "MM-099"
  notes: string;
  where_used_room_ids: string[];   // multi-select against rooms in this spec
  sort_order: number;
};

export type MoldingsTabProps = {
  groups: { id: string; label: string }[];
  rooms:  { id: string; name: string }[];
  moldings: FinishMolding[];
  moldingTypes: MoldingType[];
  moldingProfiles: MoldingProfile[];
  moldingMaterials: MoldingMaterial[];   // 2026-05-06
  onAdd: (finish_group_id: string) => void;
  onUpdate: (id: string, patch: Partial<FinishMolding>) => void;
  onRemove: (id: string) => void;
};

// Sentinel ID in molding_materials.csv that means "type your own value below".
// Pattern intended for re-use anywhere catalogs are weak: the row's `_other`
// column gets the typed text, and PDF/Excel render falls back to it when this
// ID is selected. See lib/db.ts:finish_moldings.material_other for the column.
const MATERIAL_OTHER_SENTINEL = "MM-099";

const LABEL  = "block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5";
const INPUT  = "w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] transition-colors";
const SELECT = INPUT;

export function MoldingsTab({ groups, rooms, moldings, moldingTypes, moldingProfiles, moldingMaterials, onAdd, onUpdate, onRemove }: MoldingsTabProps) {
  if (groups.length === 0) {
    return (
      <div className="bg-yellow-900/20 border border-yellow-700/30 rounded p-4 text-yellow-300/70 text-xs font-condensed uppercase tracking-widest">
        Define at least one finish group first — moldings inherit material from the finish.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-white/30 text-xs font-condensed uppercase tracking-widest">
        Per-finish moldings. Each row is one molding type ordered for that finish — qty in linear feet, optional profile, and which rooms it&apos;s installed in. Empty = molding not used.
      </p>

      {groups.map((group) => {
        const fgMoldings = moldings
          .filter((m) => m.finish_group_id === group.id)
          .sort((a, b) => a.sort_order - b.sort_order);
        return (
          <div key={group.id} className="bg-[#2d2d2d] rounded p-6">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[#f08122] font-condensed uppercase tracking-widest text-sm">{group.label}</span>
              <button
                onClick={() => onAdd(group.id)}
                className="text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs transition-colors"
              >
                + Add Molding
              </button>
            </div>

            {fgMoldings.length === 0 ? (
              <p className="text-white/20 text-xs font-condensed uppercase tracking-widest italic">No moldings yet for this finish.</p>
            ) : (
              <div className="space-y-3">
                {fgMoldings.map((m) => {
                  const compatibleProfiles = moldingProfiles.filter((p) => {
                    if (!p.compatible_types) return true;
                    const arr = Array.isArray(p.compatible_types) ? p.compatible_types : String(p.compatible_types).split(";");
                    return arr.includes(m.molding_type);
                  });
                  const isOtherMaterial = m.material_id === MATERIAL_OTHER_SENTINEL;
                  return (
                    <div key={m.id} className="bg-[#1a1a1a] border border-white/8 rounded p-4 space-y-3">
                      <div className="grid sm:grid-cols-4 gap-3">
                        <div>
                          <label className={LABEL}>Type *</label>
                          <select
                            value={m.molding_type}
                            onChange={(e) => onUpdate(m.id, { molding_type: e.target.value, molding_profile_id: "" })}
                            className={SELECT}
                          >
                            <option value="">— Select —</option>
                            {moldingTypes.map((t) => (
                              <option key={t.id} value={t.type}>{t.display_name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={LABEL}>Profile</label>
                          <select
                            value={m.molding_profile_id}
                            onChange={(e) => onUpdate(m.id, { molding_profile_id: e.target.value })}
                            className={SELECT}
                            disabled={!m.molding_type}
                          >
                            <option value="">— Default / TBD —</option>
                            {compatibleProfiles.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={LABEL}>Qty (LF)</label>
                          <input
                            type="number"
                            min={0}
                            step="0.25"
                            value={m.qty_lf ?? ""}
                            onChange={(e) => onUpdate(m.id, { qty_lf: e.target.value === "" ? null : parseFloat(e.target.value) })}
                            className={INPUT}
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className={LABEL}>Size (in)</label>
                          <input
                            type="number"
                            min={0}
                            step="0.125"
                            value={m.size_in ?? ""}
                            onChange={(e) => onUpdate(m.id, { size_in: e.target.value === "" ? null : parseFloat(e.target.value) })}
                            className={INPUT}
                            placeholder="0"
                          />
                        </div>
                      </div>

                      {/* Material — dropdown with free-entry escape (Other → text). The
                          escape pattern documented in MATERIAL_OTHER_SENTINEL above is
                          the canonical "no strong default" handling: it pulls through to
                          PDF / Excel render. Apply same pattern to other weak-catalog
                          fields (stain, paint, glaze, custom hardware) in subsequent
                          passes — see project_phasing_plan.md "free-entry escape". */}
                      <div className="grid sm:grid-cols-4 gap-3 items-end">
                        <div className={isOtherMaterial ? "sm:col-span-1" : "sm:col-span-3"}>
                          <label className={LABEL}>Material</label>
                          <select
                            value={m.material_id}
                            onChange={(e) => onUpdate(m.id, {
                              material_id: e.target.value,
                              // clear the free-text when leaving Other so the
                              // PDF/Excel render doesn't fall back to a stale value
                              material_other: e.target.value === MATERIAL_OTHER_SENTINEL ? m.material_other : "",
                            })}
                            className={SELECT}
                          >
                            <option value="">— Default / TBD —</option>
                            {moldingMaterials.map((mat) => (
                              <option key={mat.id} value={mat.id}>{mat.name}</option>
                            ))}
                          </select>
                        </div>
                        {isOtherMaterial && (
                          <div className="sm:col-span-2">
                            <label className={LABEL}>Material — type custom</label>
                            <input
                              value={m.material_other}
                              onChange={(e) => onUpdate(m.id, { material_other: e.target.value })}
                              placeholder="e.g. Sapele primed, Walnut S2S, paint-grade pine #2…"
                              className={INPUT}
                              autoFocus
                            />
                          </div>
                        )}
                        <div className="flex items-end">
                          <button
                            onClick={() => onRemove(m.id)}
                            className="w-full border border-white/10 hover:border-red-400 text-white/30 hover:text-red-400 font-condensed uppercase tracking-widest text-xs py-2 px-3 rounded transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className={LABEL}>Where Used (rooms)</label>
                        <div className="flex flex-wrap gap-2">
                          {rooms.length === 0 && (
                            <span className="text-white/20 text-xs italic">Add rooms first</span>
                          )}
                          {rooms.map((r) => {
                            const checked = m.where_used_room_ids.includes(r.id);
                            return (
                              <label
                                key={r.id}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded border cursor-pointer transition-colors ${
                                  checked
                                    ? "border-[#f08122] bg-[#f08122]/10 text-[#f08122]"
                                    : "border-white/10 text-white/40 hover:border-white/30"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                      ? [...m.where_used_room_ids, r.id]
                                      : m.where_used_room_ids.filter((x) => x !== r.id);
                                    onUpdate(m.id, { where_used_room_ids: next });
                                  }}
                                  className="accent-[#f08122] w-3 h-3"
                                />
                                <span className="text-[10px] font-condensed uppercase tracking-widest">{r.name || "(unnamed)"}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <label className={LABEL}>Notes</label>
                        <input
                          value={m.notes}
                          onChange={(e) => onUpdate(m.id, { notes: e.target.value })}
                          placeholder="Special length, profile customization, install caveats…"
                          className={INPUT}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
