export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";

// -- Payload types

type FinishGroupPayload = {
  id: string;
  label: string;
  finish_type: "paint" | "stain" | "melamine";
  color_id: string;
  color_name: string;
  door_style_id: string;
  pull_id: string;
  box_material: string;
  carcass_id: string;
  drawer_box_id: string;
  edgeband_id: string;
  applied_panels: "slab" | "match_door" | null;
  species: string | null;
  grade: string | null;
  grain_orientation: string | null;
  rollout_box_id: string | null;
  notes: string;
  sort_order: number;
};

type AccessoryPayload = { acc_id: string; qty: number; custom_note?: string };

type CabinetPayload = {
  id: string;
  family_code: string;
  width_in: number | null;
  height_in: number | null;
  depth_in: number | null;
  qty: number;
  hinge_side: string;
  rollout_trays_qty: number;
  trash_kit: string;
  applied_panels: boolean;
  special_instructions: string;
  sort_order: number;
};

type RoomFinishLink = {
  finish_group_id: string;
  zone: string | null;
  sort_order: number;
};

type RoomPayload = {
  id: string;
  name: string;
  finish_group_id: string;
  finishes: RoomFinishLink[];
  notes: string;
  sort_order: number;
  accessories: AccessoryPayload[];
  cabinets: CabinetPayload[];
};

type MoldingPayload = {
  id: string;
  finish_group_id: string;
  molding_type: string;
  molding_profile_id: string | null;
  qty_lf: number | null;
  size_in: number | null;
  material_id: string | null;
  material_other: string | null;
  notes: string;
  where_used_room_ids: string[];
  sort_order: number;
};

type MaterialPayload = {
  id: string;
  finish_group_id: string;
  role: string;
  material_id: string;
  where_used: string;
  notes: string;
};

type SavePayload = {
  finish_groups: FinishGroupPayload[];
  rooms: RoomPayload[];
  moldings?: MoldingPayload[];
  materials?: MaterialPayload[];
};

// -- Validation

type Violation = { path: string; message: string };

function validate(payload: SavePayload): Violation[] {
  const v: Violation[] = [];
  const fgIds = new Set(payload.finish_groups.map((g) => g.id));
  const roomIds = new Set(payload.rooms.map((r) => r.id));

  for (const g of payload.finish_groups) {
    const tag = `finish_groups[${g.label || g.id}]`;
    if (!g.label?.trim())  v.push({ path: tag, message: "label is required" });
    if (!g.finish_type)    v.push({ path: tag, message: "finish_type is required" });
    if (!g.carcass_id)     v.push({ path: tag, message: "carcass material is required (the $70k field)" });
    if (!g.drawer_box_id)  v.push({ path: tag, message: "drawer box is required (the $70k field)" });
    if ((g.finish_type === "paint" || g.finish_type === "stain") && !g.edgeband_id) {
      v.push({ path: tag, message: "edgeband selection is required for paint/stain finishes" });
    }
  }

  for (const r of payload.rooms) {
    const tag = `rooms[${r.name || r.id}]`;
    if (!r.name?.trim()) v.push({ path: tag, message: "room name is required" });

    const hasMulti = (r.finishes ?? []).some((f) => f.finish_group_id);
    const hasLegacy = !!r.finish_group_id;
    if (!hasMulti && !hasLegacy) {
      v.push({ path: tag, message: "at least one finish must be assigned to this room" });
    }

    for (const f of r.finishes ?? []) {
      if (f.finish_group_id && !fgIds.has(f.finish_group_id)) {
        v.push({ path: tag, message: `finish reference ${f.finish_group_id} not found in finish_groups` });
      }
    }
    if (r.finish_group_id && !fgIds.has(r.finish_group_id)) {
      v.push({ path: tag, message: `legacy finish_group_id ${r.finish_group_id} not found in finish_groups` });
    }

    for (const c of r.cabinets ?? []) {
      if (!c.family_code) v.push({ path: `${tag}.cabinet`, message: "cabinet family is required for every cabinet line item" });
    }
  }

  for (const m of payload.moldings ?? []) {
    const tag = `moldings[${m.id}]`;
    if (!m.molding_type)    v.push({ path: tag, message: "molding_type is required" });
    if (!m.finish_group_id) v.push({ path: tag, message: "finish_group_id is required" });
    if (m.finish_group_id && !fgIds.has(m.finish_group_id))
      v.push({ path: tag, message: `finish_group_id ${m.finish_group_id} not in finish_groups` });
    for (const rid of m.where_used_room_ids ?? []) {
      if (!roomIds.has(rid)) v.push({ path: tag, message: `where_used room ${rid} not in rooms` });
    }
  }

  // cab_ext removed: carcass material dropdown is the cab_ext selection.
  const VALID_MATERIAL_ROLES = new Set(["cab_int", "cab_ext2", "cab_int2"]);
  for (const m of payload.materials ?? []) {
    const tag = `materials[${m.id || `${m.finish_group_id}/${m.role}`}]`;
    if (!m.finish_group_id) v.push({ path: tag, message: "finish_group_id is required" });
    if (m.finish_group_id && !fgIds.has(m.finish_group_id))
      v.push({ path: tag, message: `finish_group_id ${m.finish_group_id} not in finish_groups` });
    if (!m.role) v.push({ path: tag, message: "role is required" });
    if (m.role && !VALID_MATERIAL_ROLES.has(m.role))
      v.push({ path: tag, message: `role '${m.role}' not in {cab_int, cab_ext2, cab_int2}` });
  }

  return v;
}

// -- Save handler

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as SavePayload;
  const { finish_groups, rooms, moldings = [], materials = [] } = body;

  const violations = validate(body);
  if (violations.length > 0) {
    return NextResponse.json({ ok: false, error: "validation failed", violations }, { status: 400 });
  }

  const now = new Date().toISOString();

  // NOTE: We intentionally do NOT use sql.begin() here.
  // sql.begin() holds a single PgBouncer connection open for the entire
  // multi-statement sequence. On Vercel+Supabase, if the Lambda is killed
  // mid-transaction the connection is orphaned and blocks subsequent requests
  // for minutes. Using individual autocommit statements avoids that -- each
  // query gets and releases a connection immediately.
  //
  // Trade-off: not atomic. If the Lambda dies between DELETE and INSERT the
  // spec will be empty. The user can re-save from the UI -- acceptable.
  try {
    // Clear child tables in FK-safe order (each statement = its own mini-tx)
    await sql`
      DELETE FROM finish_molding_rooms
      WHERE molding_id IN (
        SELECT id FROM finish_moldings
        WHERE finish_group_id IN (
          SELECT id FROM finish_groups WHERE spec_id = ${id}
        )
      )
    `;
    await sql`
      DELETE FROM finish_moldings
      WHERE finish_group_id IN (
        SELECT id FROM finish_groups WHERE spec_id = ${id}
      )
    `;
    await sql`
      DELETE FROM finish_group_materials
      WHERE finish_group_id IN (
        SELECT id FROM finish_groups WHERE spec_id = ${id}
      )
    `;
    await sql`
      DELETE FROM room_finishes
      WHERE room_id IN (SELECT id FROM rooms WHERE spec_id = ${id})
    `;
    await sql`DELETE FROM cabinet_line_items WHERE spec_id = ${id}`;
    await sql`DELETE FROM room_accessories WHERE room_id IN (SELECT id FROM rooms WHERE spec_id = ${id})`;
    await sql`DELETE FROM rooms WHERE spec_id = ${id}`;
    await sql`DELETE FROM finish_groups WHERE spec_id = ${id}`;

    // Insert finish groups
    for (const g of finish_groups) {
      await sql`
        INSERT INTO finish_groups
          (id, spec_id, label, finish_type, color_id, color_name,
           door_style_id, drawer_style_id, pull_id, box_material, carcass_id, drawer_box_id, edgeband_id,
           applied_panels, species, grade, grain_orientation, rollout_box_id,
           cabdoor_edge_id, cabdoor_profile_id, cabdoor_panel_id,
           notes, sort_order)
        VALUES
          (${g.id}, ${id}, ${g.label}, ${g.finish_type || "paint"},
           ${g.color_id || null}, ${g.color_name || null},
           ${g.door_style_id || null},
           ${(g as Record<string, unknown>).drawer_style_id as string || null},
           ${g.pull_id || null},
           ${g.box_material || "melamine"},
           ${g.carcass_id || null}, ${g.drawer_box_id || null}, ${g.edgeband_id || null},
           ${g.applied_panels || "slab"}, ${g.species || null},
           ${g.grade || null}, ${g.grain_orientation || null},
           ${g.rollout_box_id || null},
           ${(g as Record<string, unknown>).cabdoor_edge_id as string || null},
           ${(g as Record<string, unknown>).cabdoor_profile_id as string || null},
           ${(g as Record<string, unknown>).cabdoor_panel_id as string || null},
           ${g.notes || null}, ${g.sort_order ?? 0})
      `;
    }

    // Insert rooms + accessories + cabinets
    for (const r of rooms) {
      await sql`
        INSERT INTO rooms (id, spec_id, name, finish_group_id, notes, sort_order,
                          flooring, ceiling_height, soffit, backsplash)
        VALUES (${r.id}, ${id}, ${r.name}, ${r.finish_group_id || null},
                ${r.notes || null}, ${r.sort_order ?? 0},
                ${(r as Record<string, unknown>).flooring as string || null},
                ${(r as Record<string, unknown>).ceiling_height as string || null},
                ${(r as Record<string, unknown>).soffit as string || null},
                ${(r as Record<string, unknown>).backsplash as string || null})
      `;

      // Multi-finish links
      for (let fi = 0; fi < (r.finishes ?? []).length; fi++) {
        const f = r.finishes[fi];
        await sql`
          INSERT INTO room_finishes (id, room_id, finish_group_id, zone, sort_order)
          VALUES (${uid()}, ${r.id}, ${f.finish_group_id}, ${f.zone ?? null}, ${f.sort_order ?? fi})
        `;
      }

      // Accessories
      for (const acc of r.accessories ?? []) {
        await sql`
          INSERT INTO room_accessories (id, room_id, acc_id, qty, notes)
          VALUES (${uid()}, ${r.id}, ${acc.acc_id}, ${acc.qty ?? 1}, ${acc.custom_note ?? null})
        `;
      }

      // Cabinets
      for (const cab of r.cabinets ?? []) {
        await sql`
          INSERT INTO cabinet_line_items
            (id, room_id, spec_id, family_code, width_in, height_in, depth_in, qty,
             hinge_side, rollout_trays_qty, trash_kit, applied_panels, special_instructions, sort_order)
          VALUES
            (${cab.id}, ${r.id}, ${id}, ${cab.family_code},
             ${cab.width_in ?? null}, ${cab.height_in ?? null}, ${cab.depth_in ?? null},
             ${cab.qty ?? 1}, ${cab.hinge_side || null},
             ${cab.rollout_trays_qty ?? 0}, ${cab.trash_kit || null},
             ${cab.applied_panels ?? false},
             ${cab.special_instructions || null}, ${cab.sort_order ?? 0})
        `;
      }
    }

    // Insert moldings + room links
    for (const m of moldings) {
      await sql`
        INSERT INTO finish_moldings
          (id, finish_group_id, molding_type, molding_profile_id, qty_lf,
           size_in, material_id, material_other, notes, sort_order)
        VALUES
          (${m.id}, ${m.finish_group_id}, ${m.molding_type},
           ${m.molding_profile_id ?? null}, ${m.qty_lf ?? null},
           ${m.size_in ?? null}, ${m.material_id ?? null},
           ${m.material_other ?? null}, ${m.notes || null}, ${m.sort_order ?? 0})
      `;
      for (const rid of m.where_used_room_ids ?? []) {
        await sql`
          INSERT INTO finish_molding_rooms (molding_id, room_id)
          VALUES (${m.id}, ${rid})
        `;
      }
    }

    // Insert materials
    for (const mat of materials) {
      await sql`
        INSERT INTO finish_group_materials
          (id, finish_group_id, role, material_id, where_used, notes)
        VALUES
          (${mat.id || uid()}, ${mat.finish_group_id}, ${mat.role},
           ${mat.material_id || null}, ${mat.where_used || null}, ${mat.notes || null})
      `;
    }

    // Auto-seed detail sub-tables from top-level FG fields.
    // Only seeds if the detail table has 0 rows for this finish_group_id.
    // Wrapped in individual try/catch so a seeding failure never breaks the save.
    for (const g of finish_groups) {
      const fgId = g.id;

      // door_fronts -- seed one "base" row from door_style_id
      if (g.door_style_id) {
        try {
          const cnt = await sql`SELECT COUNT(*) AS c FROM finish_group_door_fronts WHERE finish_group_id = ${fgId}`;
          if (Number((cnt[0] as { c: string | number }).c) === 0) {
            await sql`
              INSERT INTO finish_group_door_fronts (id, finish_group_id, role, style_id, sort_order)
              VALUES (${uid()}, ${fgId}, ${'base'}, ${g.door_style_id}, ${0})
            `;
          }
        } catch (_) { /* seeding failure -- skip */ }
      }

      // drawers -- seed one "drawer_box" row from drawer_box_id
      if (g.drawer_box_id) {
        try {
          const cnt = await sql`SELECT COUNT(*) AS c FROM finish_group_drawers WHERE finish_group_id = ${fgId}`;
          if (Number((cnt[0] as { c: string | number }).c) === 0) {
            await sql`
              INSERT INTO finish_group_drawers (id, finish_group_id, role, drawer_box_id, sort_order)
              VALUES (${uid()}, ${fgId}, ${'drawer_box'}, ${g.drawer_box_id}, ${0})
            `;
          }
        } catch (_) { /* seeding failure -- skip */ }
      }

      // edgebands -- seed one row from edgeband_id
      if (g.edgeband_id) {
        try {
          const cnt = await sql`SELECT COUNT(*) AS c FROM finish_group_edgebands WHERE finish_group_id = ${fgId}`;
          if (Number((cnt[0] as { c: string | number }).c) === 0) {
            await sql`
              INSERT INTO finish_group_edgebands (id, finish_group_id, code, edgeband_id, sort_order)
              VALUES (${uid()}, ${fgId}, ${'EB1'}, ${g.edgeband_id}, ${0})
            `;
          }
        } catch (_) { /* seeding failure -- skip */ }
      }

      // hardware -- seed door_pulls and drawer_pulls rows from pull_id
      if (g.pull_id) {
        try {
          const cnt = await sql`SELECT COUNT(*) AS c FROM finish_group_hardware WHERE finish_group_id = ${fgId}`;
          if (Number((cnt[0] as { c: string | number }).c) === 0) {
            await sql`
              INSERT INTO finish_group_hardware (id, finish_group_id, role, hardware_id, sort_order)
              VALUES (${uid()}, ${fgId}, ${'door_pulls'}, ${g.pull_id}, ${0})
            `;
            await sql`
              INSERT INTO finish_group_hardware (id, finish_group_id, role, hardware_id, sort_order)
              VALUES (${uid()}, ${fgId}, ${'drawer_pulls'}, ${g.pull_id}, ${1})
            `;
          }
        } catch (_) { /* seeding failure -- skip */ }
      }

      // finish fields -- seed paint_id or stain_id from color_id + finish_type
      if (g.color_id && g.finish_type) {
        try {
          // Re-read current finish_groups row to check paint_id / stain_id
          const fgRow = await sql`SELECT paint_id, stain_id FROM finish_groups WHERE id = ${fgId}`;
          const row = fgRow[0] as { paint_id: string | null; stain_id: string | null } | undefined;
          if (row && row.paint_id === null && row.stain_id === null) {
            if (g.finish_type === 'paint') {
              await sql`UPDATE finish_groups SET paint_id = ${g.color_id} WHERE id = ${fgId}`;
            } else if (g.finish_type === 'stain') {
              await sql`UPDATE finish_groups SET stain_id = ${g.color_id} WHERE id = ${fgId}`;
            }
          }
        } catch (_) { /* seeding failure -- skip */ }
      }
    }

    // Update spec updated_at
    await sql`UPDATE residential_specs SET updated_at = ${now} WHERE id = ${id}`;

  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
