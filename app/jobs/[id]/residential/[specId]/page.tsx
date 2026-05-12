export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { sql } from "@/lib/db";
import { catalogs } from "@/lib/catalogs";
import { ResidentialSpecClient } from "@/components/ResidentialSpecClient";

type SpecRow       = { id: string; job_id: string; name: string; status: string; updated_at: string };
type FGRow         = { id: string; label: string; finish_type: "paint"|"stain"|"melamine"; color_id: string; color_name: string; door_style_id: string; pull_id: string; box_material: "melamine"|"plywood"; carcass_id: string | null; drawer_box_id: string | null; edgeband_id: string | null; notes: string; sort_order: number };
type RoomRow       = { id: string; name: string; finish_group_id: string; notes: string; sort_order: number };
type RoomFinishRow = { id: string; room_id: string; finish_group_id: string; zone: string | null; sort_order: number };
type AccRow        = { id: string; room_id: string; acc_id: string; qty: number };
type CabinetRow    = { id: string; room_id: string; family_code: string; width_in: number|null; height_in: number|null; depth_in: number|null; qty: number; hinge_side: string|null; rollout_trays_qty: number; trash_kit: string; applied_panels: boolean; special_instructions: string|null; sort_order: number };
type MoldingRow    = { id: string; finish_group_id: string; molding_type: string; molding_profile_id: string | null; qty_lf: number | null; size_in: number | null; material_id: string | null; material_other: string | null; notes: string | null; sort_order: number };
type MoldingRoomRow = { molding_id: string; room_id: string };
type MaterialRow   = { id: string; finish_group_id: string; role: string; material_id: string | null; where_used: string | null; notes: string | null };

export default async function SpecEditorPage({
  params,
}: {
  params: Promise<{ id: string; specId: string }>;
}) {
  const { id, specId } = await params;

  // Round 1: verify spec exists (must be serial — drives notFound())
  const [spec] = await sql`SELECT * FROM residential_specs WHERE id = ${specId} AND job_id = ${id}` as SpecRow[];
  if (!spec) notFound();

  // Round 2: all child data in parallel using subqueries — no serial dependency chain.
  // Queries that previously needed roomIds/fgIds now use correlated subqueries so
  // they can all fire at once. Total: 2 DB round-trips regardless of data volume.
  const [
    finish_groups,
    rooms,
    accessories,
    cabinets,
    roomFinishes,
    moldingRows,
    materialRows,
    moldingRoomRows,
  ] = await Promise.all([
    sql`SELECT * FROM finish_groups WHERE spec_id = ${specId} ORDER BY sort_order` as Promise<FGRow[]>,
    sql`SELECT * FROM rooms WHERE spec_id = ${specId} ORDER BY sort_order` as Promise<RoomRow[]>,
    sql`SELECT * FROM room_accessories WHERE room_id IN (SELECT id FROM rooms WHERE spec_id = ${specId})` as Promise<AccRow[]>,
    sql`SELECT * FROM cabinet_line_items WHERE spec_id = ${specId} ORDER BY sort_order` as Promise<CabinetRow[]>,
    sql`SELECT * FROM room_finishes WHERE room_id IN (SELECT id FROM rooms WHERE spec_id = ${specId}) ORDER BY room_id, sort_order` as Promise<RoomFinishRow[]>,
    sql`SELECT * FROM finish_moldings WHERE finish_group_id IN (SELECT id FROM finish_groups WHERE spec_id = ${specId}) ORDER BY finish_group_id, sort_order` as Promise<MoldingRow[]>,
    sql`SELECT * FROM finish_group_materials WHERE finish_group_id IN (SELECT id FROM finish_groups WHERE spec_id = ${specId}) ORDER BY finish_group_id, role` as Promise<MaterialRow[]>,
    sql`SELECT fmr.molding_id, fmr.room_id FROM finish_molding_rooms fmr JOIN finish_moldings fm ON fm.id = fmr.molding_id JOIN finish_groups fg ON fg.id = fm.finish_group_id WHERE fg.spec_id = ${specId}` as Promise<MoldingRoomRow[]>,
  ]);

  // ── Shape data for client component ──────────────────────────────────────────

  const moldings = moldingRows.map((m) => ({
    id: m.id,
    finish_group_id: m.finish_group_id,
    molding_type: m.molding_type,
    molding_profile_id: m.molding_profile_id ?? "",
    qty_lf: m.qty_lf,
    size_in: m.size_in,
    material_id: m.material_id ?? "",
    material_other: m.material_other ?? "",
    notes: m.notes ?? "",
    where_used_room_ids: moldingRoomRows.filter((mr) => mr.molding_id === m.id).map((mr) => mr.room_id),
    sort_order: m.sort_order,
  }));

  const roomsWithAcc = rooms.map((r) => {
    const finishes = roomFinishes
      .filter((f) => f.room_id === r.id)
      .map((f) => ({ finish_group_id: f.finish_group_id, zone: f.zone ?? "", sort_order: f.sort_order }));

    const seededFinishes = finishes.length === 0 && r.finish_group_id
      ? [{ finish_group_id: r.finish_group_id, zone: "", sort_order: 0 }]
      : finishes;

    return {
      ...r,
      finishes: seededFinishes,
      accessories: accessories
        .filter((a) => a.room_id === r.id)
        .map((a) => ({ acc_id: a.acc_id, qty: a.qty })),
      cabinets: cabinets
        .filter((c) => c.room_id === r.id)
        .map((c) => ({
          id: c.id,
          family_code: c.family_code,
          width_in: c.width_in,
          height_in: c.height_in,
          depth_in: c.depth_in,
          qty: c.qty,
          hinge_side: c.hinge_side ?? "",
          rollout_trays_qty: c.rollout_trays_qty,
          trash_kit: c.trash_kit,
          applied_panels: !!c.applied_panels,
          special_instructions: c.special_instructions ?? "",
          sort_order: c.sort_order,
        })),
    };
  });

  const finishGroupsHydrated = finish_groups.map((g) => ({
    ...g,
    carcass_id:    g.carcass_id    ?? "",
    drawer_box_id: g.drawer_box_id ?? "",
    edgeband_id:   g.edgeband_id   ?? "",
  }));

  const VALID_MATERIAL_ROLES = ["cab_ext", "cab_int", "cab_ext2", "cab_int2"] as const;
  type MaterialRole = (typeof VALID_MATERIAL_ROLES)[number];
  const materialsHydrated = materialRows
    .filter((m): m is MaterialRow & { role: MaterialRole } =>
      (VALID_MATERIAL_ROLES as readonly string[]).includes(m.role)
    )
    .map((m) => ({
      finish_group_id: m.finish_group_id,
      role:            m.role as MaterialRole,
      material_id:     m.material_id ?? "",
      where_used:      m.where_used ?? "",
      notes:           m.notes ?? "",
    }));

  const catalogData = {
    paintColors:      catalogs.paintColors(),
    stainColors:      catalogs.stainColors(),
    melamineColors:   catalogs.melamineColors(),
    doorStyles:       catalogs.doorStyles(),
    hardwarePulls:    catalogs.hardwarePulls(),
    revaAccessories:  catalogs.revaAccessories(),
    cabinetFamilies:  catalogs.cabinetFamilies(),
    carcassMaterials: catalogs.carcassMaterials(),
    drawerBoxes:      catalogs.drawerBoxes(),
    edgebands:        catalogs.edgebands(),
    rooms:            catalogs.rooms(),
    moldingTypes:     catalogs.moldingTypes(),
    moldingProfiles:  catalogs.moldingProfiles(),
    moldingMaterials: catalogs.moldingMaterials(),
  };

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <Link
        href={`/jobs/${id}/residential`}
        className="font-condensed uppercase tracking-widest text-xs text-white/30 hover:text-[#f08122] transition-colors mb-8 block"
      >
        ← All Specs
      </Link>
      <h1 className="font-heading text-3xl uppercase tracking-wide text-white">{spec.name}</h1>
      <p className="text-[#f08122] font-condensed uppercase tracking-widest text-sm mt-1 mb-10">
        {id}
      </p>

      <ResidentialSpecClient
        specId={specId}
        jobId={id}
        initialFinishGroups={finishGroupsHydrated}
        initialRooms={roomsWithAcc}
        initialMoldings={moldings}
        initialMaterials={materialsHydrated}
        catalogs={catalogData}
        lastSaved={spec.updated_at}
      />
    </section>
  );
}
