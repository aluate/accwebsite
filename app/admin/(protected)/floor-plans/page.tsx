export const dynamic = "force-dynamic";

import { sql } from "@/lib/db";
import Link from "next/link";

type FloorPlan = {
  id: string; builder_company: string; plan_name: string;
  description: string | null; created_at: string;
};
type FloorPlanRoom = {
  id: string; floor_plan_id: string; room_name: string;
  finish_group_name: string | null; sort_order: number;
  default_ceiling_height: string | null; default_flooring: string | null;
};

export default async function FloorPlansPage() {
  let plans: FloorPlan[] = [];
  let rooms: FloorPlanRoom[] = [];

  try {
    plans = await sql`SELECT * FROM builder_floor_plans ORDER BY builder_company, plan_name` as FloorPlan[];
    const planIds = plans.map(p => p.id);
    rooms = planIds.length
      ? await sql`SELECT * FROM builder_floor_plan_rooms WHERE floor_plan_id IN ${sql(planIds)} ORDER BY floor_plan_id, sort_order` as FloorPlanRoom[]
      : [];
  } catch {
    // Tables not yet created — empty arrays
  }

  const byCompany = new Map<string, FloorPlan[]>();
  for (const p of plans) {
    const arr = byCompany.get(p.builder_company) ?? [];
    arr.push(p);
    byCompany.set(p.builder_company, arr);
  }

  return (
    <section className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-1">Admin</p>
          <h1 className="font-heading text-2xl uppercase tracking-wide text-white">Builder Floor Plans</h1>
        </div>
        <a
          href="/api/admin/floor-plans"
          className="font-condensed uppercase tracking-widest text-xs bg-[#f08122] hover:bg-[#d9711e] text-white px-4 py-2 rounded transition-colors"
        >
          + New Floor Plan (via API)
        </a>
      </div>

      {plans.length === 0 ? (
        <div className="bg-[#2d2d2d] rounded p-8 text-center">
          <p className="text-white/40 text-sm font-condensed uppercase tracking-widest">No floor plans yet.</p>
          <p className="text-white/25 text-xs mt-2">POST to /api/admin/floor-plans to create one.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(byCompany.entries()).map(([company, companyPlans]) => (
            <div key={company}>
              <p className="text-[#f08122] font-condensed uppercase tracking-widest text-xs mb-3">{company}</p>
              <div className="space-y-4">
                {companyPlans.map(plan => {
                  const planRooms = rooms.filter(r => r.floor_plan_id === plan.id);
                  return (
                    <div key={plan.id} className="bg-[#2d2d2d] rounded p-4 border border-white/10">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-white font-condensed uppercase tracking-wider text-sm">{plan.plan_name}</p>
                          {plan.description && <p className="text-white/40 text-xs mt-0.5">{plan.description}</p>}
                          <p className="text-white/20 text-[10px] font-mono mt-1">{plan.id}</p>
                        </div>
                        <div className="flex gap-2">
                          <Link
                            href={`/api/admin/floor-plans/${plan.id}`}
                            className="text-white/30 hover:text-white font-condensed uppercase tracking-widest text-[10px] border border-white/10 hover:border-white/30 px-2 py-1 rounded transition-colors"
                          >
                            View JSON
                          </Link>
                        </div>
                      </div>
                      {planRooms.length > 0 && (
                        <div className="border-t border-white/5 pt-3">
                          <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mb-2">Rooms ({planRooms.length})</p>
                          <div className="grid sm:grid-cols-2 gap-2">
                            {planRooms.map(r => (
                              <div key={r.id} className="bg-[#1a1a1a] rounded px-3 py-2">
                                <p className="text-white text-xs font-condensed uppercase">{r.room_name}</p>
                                {r.finish_group_name && <p className="text-white/40 text-[11px]">FG: {r.finish_group_name}</p>}
                                {r.default_ceiling_height && <p className="text-white/30 text-[11px]">Ceiling: {r.default_ceiling_height}</p>}
                                {r.default_flooring && <p className="text-white/30 text-[11px]">Flooring: {r.default_flooring}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
