import { requireRole } from "@/lib/auth";
import Link from "next/link";
import { getAllConstructionProfiles } from "@/lib/estimate-engine";

export default async function ConstructionProfilesPage() {
  await requireRole("admin");
  const profiles = getAllConstructionProfiles();

  const badge = (txt: string, color: string) => ({ txt, color });
  const frameColor: Record<string, string> = {
    frameless: "bg-blue-900/30 text-blue-300 border-blue-400/30",
    face_frame: "bg-amber-900/30 text-amber-300 border-amber-400/30",
  };
  const backColor: Record<string, string> = {
    dado: "bg-purple-900/30 text-purple-300 border-purple-400/30",
    plant_on: "bg-green-900/30 text-green-300 border-green-400/30",
  };
  const overlayColor: Record<string, string> = {
    full: "bg-gray-800 text-gray-300 border-white/10",
    half: "bg-gray-800 text-gray-300 border-white/10",
    inset: "bg-red-900/30 text-red-300 border-red-400/30",
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/admin/estimating/settings" className="text-sm text-white/40 hover:text-white/70">
            ← Estimating settings
          </Link>
          <h1 className="text-xl font-bold text-white mt-1">Construction Profiles</h1>
          <p className="text-sm text-white/40 mt-0.5">
            Each estimate picks a profile that drives BOM math, material costs, and labor.
            Edit <code className="text-[#f08122]">data/catalogs/construction_profiles.csv</code> to add or change profiles.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {profiles.map((p) => (
          <div
            key={p.profile_id}
            className="bg-[#1a1b1c] border border-white/10 rounded-xl p-5"
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{p.name}</span>
                  <code className="text-xs text-white/40 font-mono">{p.profile_id}</code>
                  {p.profile_id === "ACC_STD" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#f08122]/40 text-[#f08122]">Default</span>
                  )}
                </div>
                <p className="text-xs text-white/40 mt-0.5 max-w-xl">{p.notes ?? ""}</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
                {[
                  [p.frame_type, frameColor[p.frame_type] ?? "bg-gray-800 text-gray-300 border-white/10"],
                  [p.back_method === "plant_on" ? "plant-on back" : "dado back", backColor[p.back_method] ?? "bg-gray-800 text-gray-300 border-white/10"],
                  [p.overlay_type + " overlay", overlayColor[p.overlay_type] ?? "bg-gray-800 text-gray-300 border-white/10"],
                  [p.joinery_method.replace("_", " "), "bg-gray-800 text-gray-300 border-white/10"],
                ].map(([label, cls]) => (
                  <span key={label} className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${cls}`}>
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <Stat label="Body mat $/SF" value={`$${p.body_mat_cost_per_sf.toFixed(2)}`} />
              <Stat label="Back mat $/SF" value={`$${p.back_mat_cost_per_sf.toFixed(2)}`} />
              <Stat label="Mat thickness" value={`${p.mat_thickness_in}"`} />
              <Stat label="Back thickness" value={`${p.back_thickness_in}"`} />
              <Stat label="Toekick" value={`${p.toekick_height_in}"`} />
              <Stat label="Reveal side/top/btm" value={`${p.door_reveal_side_in}" / ${p.door_reveal_top_in}" / ${p.door_reveal_bottom_in}"`} />
              <Stat label="Reveal between" value={`${p.door_reveal_between_in}"`} />
              <Stat label="Top nailer" value={`${p.top_nailer_height_in}"`} />
              <Stat label="Labor mult" value={`${p.labor_assembly_mult.toFixed(2)}×`} highlight={p.labor_assembly_mult !== 1.0} />
              {p.face_frame_width_in > 0 && (
                <Stat label="Face frame width" value={`${p.face_frame_width_in}"`} highlight />
              )}
              {p.face_frame_cost_per_lf > 0 && (
                <Stat label="Face frame $/LF" value={`$${p.face_frame_cost_per_lf.toFixed(2)}`} highlight />
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-white/25 mt-6">
        Face-frame door dimension calculation is Phase 2 — profiles are stored and selectable now; the engine will branch on frame_type in a future update.
      </p>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-[#0d0e0f] rounded-lg p-2.5">
      <div className="text-[10px] text-white/30 uppercase tracking-wide mb-0.5">{label}</div>
      <div className={`text-sm font-mono ${highlight ? "text-[#f08122]" : "text-white"}`}>{value}</div>
    </div>
  );
}
