export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { sql } from "@/lib/db";
import { catalogs } from "@/lib/catalogs";
import { ResidentialSpecClient } from "@/components/ResidentialSpecClient";
import type { AccessoriesData } from "@/components/AccessoriesTab";

type SpecRow    = { id: string; job_id: string; name: string; status: string; updated_at: string };
type PullDbRow  = { id: string; make: string|null; model: string|null; size: string|null; room: string|null; notes: string|null; qty: number };
type AccDbRow   = { id: string; part_number: string|null; description: string|null; qty: number; handed: string; room: string|null; notes: string|null };

function buildAccessoriesData(pullsRaw: PullDbRow[], accsRaw: AccDbRow[]): AccessoriesData {
  return {
    pulls: pullsRaw.map((r) => ({
      id: r.id, make: r.make ?? "", model: r.model ?? "",
      size: r.size ?? "", room: r.room ?? "", notes: r.notes ?? "", qty: r.qty,
    })),
    accessories: accsRaw.map((r) => {
      const h = r.handed || "N/A";
      const handed = (h === "Left" || h === "Right") ? h : "N/A" as const;
      return {
        id: r.id, part_number: r.part_number ?? "",
        description: r.description ?? "", qty: r.qty, handed,
        room: r.room ?? "", notes: r.notes ?? "",
      };
    }),
  };
}
type FGRow      = {
  id: string; label: string; finish_type: "paint"|"stain"|"melamine";
  color_id: string; color_name: string;
  door_style_id: string; pull_id: string;
  box_material: "melamine"|"plywood";
  carcass_id: string | null; drawer_box_id: string | null; edgeband_id: string | null;
  applied_panels: "slab" | "match_door" | null;
  species: string | null;
  notes: string; sort_order: number;
};

type FGPullRow  = { id: string; finish_group_id: string; description: string; part_no: string | null; finish_color: string | null; where_used: string | null; qty: number; sort_order: number };
type RoomTrimRow = { id: string; room_id: string; trim_type: string; size_desc: string | null; material: string | null; qty_lf: number; notes: string | null; sort_order: number };
type SpecApplianceRow = { id: string; spec_id: string; appliance_type: string; manufacturer: string | null; model_no: string | null; room_id: string | null; notes: string | null; sort_order: number };
type RoomRow    = { id: string; name: string; finish_group_id: string; notes: string; sort_order: number };
type RoomFinishRow = { id: string; room_id: string; finish_group_id: string; zone: string | null; sort_order: number };
type AccRow     = { id: string; room_id: string; acc_id: string; qty: number; notes: string | null };
type CabinetRow = { id: string; room_id: string; family_code: string; width_in: number|null; height_in: number|null; depth_in: number|null; qty: number; hinge_side: string|null; rollout_trays_qty: number; trash_kit: string; applied_panels: boolean; special_instructions: string|null; sort_order: number };
type MoldingRow = { id: string; finish_group_id: string; molding_type: string; molding_profile_id: string | null; qty_lf: number | null; size_in: number | null; material_id: string | null; material_other: string | null; notes: string | null; sort_order: number };
type MoldingRoomRow = { molding_id: string; room_id: string };

// Spec form expansion v2 (2026-05-06): finish-group child tables. Loaded once
// per page render, grouped by finish_group_id, then handed to the client as
// per-finish state. Material is the first sub-section to land — others follow
// the same pattern (door fronts, drawers, edgebands, hardware, countertops).
type MaterialRow = { id: string; finish_group_id: string; role: string; material_id: string | null; where_used: string | null; notes: string | null };

export default async function SpecEditorPage({
  params,
}: {
  params: Promise<{ id: string; specId: string }>;
}) {
  const { id, specId } = await params;

  const [spec] = await sql`SELECT * FROM residential_specs WHERE id = ${specId} AND job_id = ${id}` as SpecRow[];
  if (!spec) notFound();

  const finish_groups = await sql`
    SELECT * FROM finish_groups WHERE spec_id = ${specId} ORDER BY sort_order
  ` as FGRow[];

  const rooms = await sql`
    SELECT * FROM rooms WHERE spec_id = ${specId} ORDER BY sort_order
  ` as RoomRow[];

  const roomIds = rooms.map((r) => r.id);

  const accessories: AccRow[] = roomIds.length
    ? await sql`SELECT * FROM room_accessories WHERE room_id IN ${sql(roomIds)}` as AccRow[]
    : [];

  const cabinets: CabinetRow[] = roomIds.length
    ? await sql`SELECT * FROM cabinet_line_items WHERE room_id IN ${sql(roomIds)} ORDER BY sort_order` as CabinetRow[]
    : [];

  const roomFinishes: RoomFinishRow[] = roomIds.length
    ? await sql`SELECT * FROM room_finishes WHERE room_id IN ${sql(roomIds)} ORDER BY room_id, sort_order` as RoomFinishRow[]
    : [];

  // Phase 1B (2026-05): per-finish moldings with where-used rooms.
  const fgIds = finish_groups.map((g) => g.id);

  const moldingRows: MoldingRow[] = fgIds.length
    ? await sql`SELECT * FROM finish_moldings WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, sort_order` as MoldingRow[]
    : [];

  // Spec form v2 child tables (2026-05-06). Material first; others next.
  const materialRows: MaterialRow[] = fgIds.length
    ? await sql`SELECT * FROM finish_group_materials WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, role` as MaterialRow[]
    : [];

  const moldingIds = moldingRows.map((m) => m.id);

  // Accessories (pulls + RevAShelf items) — spec-level, not room-level.
  // Tables are created on first API call if they don't exist yet.
  let accessoriesData: AccessoriesData = { pulls: [], accessories: [] };
  try {
    const pullsRaw = (await sql`SELECT * FROM spec_pulls WHERE spec_id = ${specId} ORDER BY sort_order`) as unknown as PullDbRow[];
    const accsRaw  = (await sql`SELECT * FROM spec_accessories WHERE spec_id = ${specId} ORDER BY sort_order`) as unknown as AccDbRow[];
    accessoriesData = buildAccessoriesData(pullsRaw, accsRaw);
  } catch (e) {
    void e; // Tables not yet created — return empty; will be created on first save
    accessoriesData = { pulls: [], accessories: [] };
  }

  const moldingRoomRows: MoldingRoomRow[] = moldingIds.length
    ? await sql`SELECT * FROM finish_molding_rooms WHERE molding_id IN ${sql(moldingIds)}` as MoldingRoomRow[]
    : [];

  // Phase 1 additions: pulls, trim, appliances (2026-07-02)
  let fgPullRows: FGPullRow[] = [];
  let roomTrimRows: RoomTrimRow[] = [];
  let specApplianceRows: SpecApplianceRow[] = [];
  try {
    fgPullRows = fgIds.length
      ? await sql`SELECT * FROM finish_group_pulls WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, sort_order` as FGPullRow[]
      : [];
    roomTrimRows = roomIds.length
      ? await sql`SELECT * FROM room_trim WHERE room_id IN ${sql(roomIds)} ORDER BY room_id, sort_order` as RoomTrimRow[]
      : [];
    specApplianceRows = await sql`SELECT * FROM spec_appliances WHERE spec_id = ${specId} ORDER BY sort_order` as SpecApplianceRow[];
  } catch {
    // Tables not yet created — will be created on first db-push
  }

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
      .map((f) => ({
        finish_group_id: f.finish_group_id,
        zone: f.zone ?? "",
        sort_order: f.sort_order,
      }));

    const seededFinishes = finishes.length === 0 && r.finish_group_id
      ? [{ finish_group_id: r.finish_group_id, zone: "", sort_order: 0 }]
      : finishes;

    return {
      ...r,
      finishes: seededFinishes,
      accessories: accessories
        .filter((a) => a.room_id === r.id)
        .map((a) => ({ acc_id: a.acc_id, qty: a.qty, custom_note: a.notes ?? undefined })),
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
      trim: roomTrimRows
        .filter((t) => t.room_id === r.id)
        .map((t) => ({
          id: t.id,
          trim_type: t.trim_type,
          size_desc: t.size_desc ?? "",
          material: t.material ?? "",
          qty_lf: t.qty_lf,
          notes: t.notes ?? "",
          sort_order: t.sort_order,
        })),
    };
  });

  const finishGroupsHydrated = finish_groups.map((g) => ({
    ...g,
    carcass_id:    g.carcass_id    ?? "",
    drawer_box_id: g.drawer_box_id ?? "",
    edgeband_id:   g.edgeband_id   ?? "",
    applied_panels: (g.applied_panels ?? "slab") as "slab" | "match_door",
    species:        g.species        ?? "",
  }));

  // Build pulls keyed by finish_group_id
  const initialPulls: Record<string, { id: string; description: string; part_no: string; finish_color: string; where_used: string; qty: number; sort_order: number }[]> = {};
  for (const p of fgPullRows) {
    if (!initialPulls[p.finish_group_id]) initialPulls[p.finish_group_id] = [];
    initialPulls[p.finish_group_id].push({
      id: p.id, description: p.description, part_no: p.part_no ?? "",
      finish_color: p.finish_color ?? "", where_used: p.where_used ?? "",
      qty: p.qty, sort_order: p.sort_order,
    });
  }

  const initialAppliances = specApplianceRows.map((a) => ({
    id: a.id, appliance_type: a.appliance_type,
    manufacturer: a.manufacturer ?? "", model_no: a.model_no ?? "",
    room_id: a.room_id ?? "", notes: a.notes ?? "", sort_order: a.sort_order,
  }));

  // Materials hydrated as {finish_group_id, role, material_id, where_used, notes}.
  // Empty arrays for groups that have no rows yet — the client renders blank
  // dropdowns so Karl can fill them in (forced-dropdown discipline).
  // Filter to the 3 valid roles + cast role to the strict union type the
  // client component expects. Defensive against catalog drift.
  // cab_ext removed: carcass material IS the cab_ext; no separate row needed.
  const VALID_MATERIAL_ROLES = ["cab_int", "cab_ext2", "cab_int2"] as const;
  type MaterialRole = (typeof VALID_MATERIAL_ROLES)[number];
  const materialsHydrated = materialRows
    .filter((m): m is MaterialRow & { role: MaterialRole } =>
      (VALID_MATERIAL_ROLES as readonly string[]).includes(m.role)
    )
    .map((m) => ({
      id:              m.id,
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
        initialAccessories={accessoriesData}
        initialPulls={initialPulls}
        initialAppliances={initialAppliances}
        catalogs={catalogData}
        lastSaved={spec.updated_at}
      />
    </section>
  );
}
