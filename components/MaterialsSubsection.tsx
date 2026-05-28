"use client";

import type { CarcassMaterial } from "@/lib/catalogs";

/**
 * Material sub-section for a single finish group.
 *
 * The cover-sheet vocabulary has 3 material slots per finish:
 *   - cab_int   (cabinet interior — boxes, shelves) — required
 *   - cab_ext2  (optional 2nd exterior — e.g. a different finish on the island)
 *   - cab_int2  (optional 2nd interior — rare but real)
 *
 * NOTE: cab_ext was removed. The carcass material dropdown at the top of the
 * finish group IS the cab ext selection — the cabinet exterior material never
 * differs from the carcass. The redundant Materials row only created confusion.
 *
 * cab_int is the canary $70k column: a silent default here is what produced
 * the original incident. UI is forced-dropdown with no pre-fills. Empty
 * material_id is allowed *during edit* (so the user can partially fill the
 * form), but the lifecycle gate to RELEASED_TO_SHOP will require cab_int to
 * be set before drawings ship.
 *
 * The 2nd-tier slots (cab_ext2 / cab_int2) are always optional. They
 * only get persisted if the user picks something.
 */
export type FinishMaterial = {
  id: string;                 // local + DB row id
  finish_group_id: string;
  // cab_ext removed: carcass material IS the cab_ext. See comment above.
  role: "cab_int" | "cab_ext2" | "cab_int2";
  material_id: string;        // FK to colors_carcass.csv (empty = unset)
  where_used: string;         // optional clarifier — "uppers only", "island", etc.
  notes: string;
};

// cab_ext intentionally removed: the carcass material dropdown at the top
// of the finish group IS the cab ext selection. A separate Cab Ext row here is
// redundant — the cabinet exterior material never differs from the carcass.
// Keep: cab_int (required), cab_ext2 (optional), cab_int2 (optional).
export const MATERIAL_ROLES: { role: FinishMaterial["role"]; label: string; required: boolean; tier2: boolean }[] = [
  { role: "cab_int",  label: "Cab Int",   required: true,  tier2: false },
  { role: "cab_ext2", label: "Cab Ext 2", required: false, tier2: true  },
  { role: "cab_int2", label: "Cab Int 2", required: false, tier2: true  },
];

export type MaterialsSubsectionProps = {
  finishGroupId: string;
  finishGroupLabel: string;
  materials: FinishMaterial[];                  // all materials across all groups; we filter
  carcassMaterials: CarcassMaterial[];
  onUpsert: (finish_group_id: string, role: FinishMaterial["role"], patch: Partial<FinishMaterial>) => void;
};

const LABEL  = "block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5";
const INPUT  = "w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] transition-colors";
const SELECT = INPUT;

export function MaterialsSubsection({
  finishGroupId,
  finishGroupLabel,
  materials,
  carcassMaterials,
  onUpsert,
}: MaterialsSubsectionProps) {
  // Index materials by role for fast lookup. UI always shows all 3 role slots
  // even if the underlying state has fewer rows — empty slots prompt the user
  // to pick something rather than silently disappearing.
  const byRole = new Map<string, FinishMaterial>();
  for (const m of materials) {
    if (m.finish_group_id === finishGroupId) byRole.set(m.role, m);
  }

  return (
    <div className="pt-2 border-t border-white/5">
      <p className="text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-3">
        Materials — {finishGroupLabel}
      </p>
      <div className="space-y-3">
        {MATERIAL_ROLES.map((spec) => {
          const m = byRole.get(spec.role);
          const materialId = m?.material_id ?? "";
          const whereUsed  = m?.where_used  ?? "";
          const notes      = m?.notes       ?? "";
          const picked = carcassMaterials.find((c) => c.id === materialId);

          return (
            <div key={spec.role} className={`bg-[#1a1a1a] border ${spec.tier2 ? "border-white/5" : "border-white/8"} rounded p-3`}>
              <div className="grid sm:grid-cols-12 gap-3 items-start">
                <div className="sm:col-span-2 flex items-center gap-2">
                  <span className={`text-xs font-condensed uppercase tracking-widest ${spec.required ? "text-[#f08122]" : "text-white/40"}`}>
                    {spec.label}{spec.required ? " *" : ""}
                  </span>
                  {spec.tier2 && (
                    <span className="text-[9px] text-white/20 font-condensed uppercase tracking-wider">optional</span>
                  )}
                </div>
                <div className="sm:col-span-4">
                  <label className={LABEL}>Material</label>
                  <select
                    value={materialId}
                    onChange={(e) => onUpsert(finishGroupId, spec.role, { material_id: e.target.value })}
                    className={SELECT}
                  >
                    <option value="">— Select Material —</option>
                    {carcassMaterials.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {picked?.is_other && (
                    <p className="text-yellow-400/60 text-[10px] mt-1 font-condensed uppercase tracking-widest">
                      Specify in Notes
                    </p>
                  )}
                </div>
                <div className="sm:col-span-3">
                  <label className={LABEL}>Where Used</label>
                  <input
                    value={whereUsed}
                    onChange={(e) => onUpsert(finishGroupId, spec.role, { where_used: e.target.value })}
                    placeholder="Uppers only, Island, etc."
                    className={INPUT}
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className={LABEL}>Notes</label>
                  <input
                    value={notes}
                    onChange={(e) => onUpsert(finishGroupId, spec.role, { notes: e.target.value })}
                    placeholder="Optional"
                    className={INPUT}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
