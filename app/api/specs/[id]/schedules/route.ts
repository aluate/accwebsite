/**
 * Schedules API for spec form expansion v2.
 *
 *   GET  /api/specs/{specId}/schedules  → returns all child-table rows for the spec
 *   POST /api/specs/{specId}/schedules  → upserts schedules for one or more finish groups
 */
import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { requireBuilder } from "@/lib/auth";

// ── Payload types ──────────────────────────────────────────────────────────
type FinishUpdate = {
  finish_group_id: string;
  stain_id:   string | null;
  paint_id:   string | null;
  glaze_id:   string | null;
  topcoat_id: string | null;
  sheen_id:   string | null;
  notes:      string | null;
};

type MaterialPayload = {
  finish_group_id: string;
  // cab_ext removed: carcass material IS the cab_ext; no separate row needed.
  role: "cab_int" | "cab_ext2" | "cab_int2";
  material_id: string | null;
  where_used:  string | null;
  notes:       string | null;
};

type DoorFrontPayload = {
  finish_group_id: string;
  role: string;
  slot_label: string | null;
  style_id: string | null;
  material_id: string | null;
  oe_id: string | null;
  ie_id: string | null;
  panel_id: string | null;
  grain: string | null;
  vendor: string | null;
  notes: string | null;
  sort_order: number;
};

type DrawerPayload = {
  finish_group_id: string;
  role: string;
  slot_label: string | null;
  drawer_box_id: string | null;
  slides_id: string | null;
  notes: string | null;
  sort_order: number;
};

type EdgebandPayload = {
  finish_group_id: string;
  letter_code: string;
  edgeband_id: string | null;
  notes: string | null;
  sort_order: number;
};

type HardwarePayload = {
  finish_group_id: string;
  role: string;
  slot_label: string | null;
  hardware_id: string | null;
  qty: number | null;
  location: string | null;
  vendor: string | null;
  notes: string | null;
  sort_order: number;
};

type CountertopPayload = {
  finish_group_id: string;
  location: string | null;
  style_id: string | null;
  edge_id: string | null;
  splash_style: string | null;
  splash_edge_id: string | null;
  material_id: string | null;
  buildup_in: number | null;
  core_substrate: string | null;
  brackets: string | null;
  notes: string | null;
  sort_order: number;
};

type MoldingExtraPayload = {
  id: string; size_in: number | null; material_id: string | null;
};

type SchedulesPayload = {
  finish_updates?: FinishUpdate[];
  materials?:     MaterialPayload[];
  door_fronts?:   DoorFrontPayload[];
  drawers?:       DrawerPayload[];
  edgebands?:     EdgebandPayload[];
  hardware?:      HardwarePayload[];
  countertops?:   CountertopPayload[];
  molding_extras?: MoldingExtraPayload[];
};

// ── GET handler ────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireBuilder();
  const { id: specId } = await params;
  const [spec] = await sql`SELECT id FROM residential_specs WHERE id = ${specId}`;
  if (!spec) return NextResponse.json({ error: "Spec not found" }, { status: 404 });

  const fgRows = await sql`SELECT id FROM finish_groups WHERE spec_id = ${specId}` as { id: string }[];
  const fgIds = fgRows.map((r) => r.id);

  if (fgIds.length === 0) {
    return NextResponse.json({
      finish_groups: [], materials: [], door_fronts: [], drawers: [],
      edgebands: [], hardware: [], countertops: [], moldings: [],
    });
  }

  const [finish_groups, materials, door_fronts, drawers, edgebands, hardware, countertops, moldings] =
    await Promise.all([
      sql`SELECT id, label, finish_type, notes, stain_id, paint_id, glaze_id, topcoat_id, sheen_id, sort_order
          FROM finish_groups WHERE id IN ${sql(fgIds)} ORDER BY sort_order`,
      sql`SELECT * FROM finish_group_materials   WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, role`,
      sql`SELECT * FROM finish_group_door_fronts WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, sort_order`,
      sql`SELECT * FROM finish_group_drawers     WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, sort_order`,
      sql`SELECT * FROM finish_group_edgebands   WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, sort_order`,
      sql`SELECT * FROM finish_group_hardware    WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, sort_order`,
      sql`SELECT * FROM finish_group_countertops WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, sort_order`,
      sql`SELECT * FROM finish_moldings          WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, sort_order`,
    ]);

  return NextResponse.json({
    finish_groups, materials, door_fronts, drawers, edgebands, hardware, countertops, moldings,
  });
}

// ── POST handler ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireBuilder();
  const { id: specId } = await params;
  const [spec] = await sql`SELECT id, job_id FROM residential_specs WHERE id = ${specId}` as Array<{id:string;job_id:string}>;
  if (!spec) return NextResponse.json({ error: "Spec not found" }, { status: 404 });

  const payload = await req.json() as SchedulesPayload;

  // Collect distinct finish_group_ids from the payload
  const touchedFgs = new Set<string>();
  for (const arr of [payload.materials, payload.door_fronts, payload.drawers,
                     payload.edgebands, payload.hardware, payload.countertops]) {
    for (const r of arr ?? []) touchedFgs.add(r.finish_group_id);
  }
  for (const u of payload.finish_updates ?? []) touchedFgs.add(u.finish_group_id);

  // Validate finish_group_id ownership
  if (touchedFgs.size > 0) {
    const ids = Array.from(touchedFgs);
    const owned = (await sql`
      SELECT id FROM finish_groups WHERE id IN ${sql(ids)} AND spec_id = ${specId}
    ` as { id: string }[]).map((r) => r.id);
    const stranger = ids.find((id) => !owned.includes(id));
    if (stranger) {
      return NextResponse.json(
        { error: `finish_group ${stranger} does not belong to spec ${specId}` },
        { status: 403 }
      );
    }
  }

  // ── Server-side: required hardware role validation ─────────────────────────
  // Belt-and-suspenders check that mirrors client-side validation.
  // The four required roles must have a non-null hardware_id — this is a hard
  // block (422), not a warning. Protects against API callers that bypass the UI.
  const REQUIRED_HW_ROLES = ["hinges", "drawer_slides", "door_pulls", "drawer_pulls"] as const;
  const hwByFg = new Map<string, HardwarePayload[]>();
  for (const h of payload.hardware ?? []) {
    const arr = hwByFg.get(h.finish_group_id) ?? [];
    arr.push(h);
    hwByFg.set(h.finish_group_id, arr);
  }
  // Collect all finish_group_ids that appear in ANY part of the payload
  const allFgIds = new Set<string>();
  for (const arr of [payload.materials, payload.door_fronts, payload.drawers,
                     payload.edgebands, payload.hardware, payload.countertops]) {
    for (const r of arr ?? []) allFgIds.add(r.finish_group_id);
  }
  for (const u of payload.finish_updates ?? []) allFgIds.add(u.finish_group_id);
  for (const fgId of allFgIds) {
    const hwRows = hwByFg.get(fgId) ?? [];
    for (const role of REQUIRED_HW_ROLES) {
      const row = hwRows.find((h) => h.role === role);
      if (!row?.hardware_id) {
        return NextResponse.json(
          { error: `finish_group ${fgId}: ${role} is required — select one before saving` },
          { status: 422 }
        );
      }
    }
  }

  const warnings: string[] = [];

  try {
    await sql.begin(async (tx) => {
      // 1. Finish-FK updates on finish_groups itself
      for (const u of payload.finish_updates ?? []) {
        const [fg] = await tx`
          SELECT finish_type, label FROM finish_groups WHERE id = ${u.finish_group_id}
        ` as Array<{ finish_type: string; label: string }>;
        if (fg) {
          if (fg.finish_type === "paint" && u.stain_id)
            warnings.push(`finish_group "${fg.label}": paint type but stain_id is set`);
          if (fg.finish_type === "stain" && u.paint_id)
            warnings.push(`finish_group "${fg.label}": stain type but paint_id is set`);
          // DAC-1: melamine groups should not have a paint or stain color set
          if (fg.finish_type === "melamine" && u.paint_id)
            warnings.push(`finish_group "${fg.label}": melamine type but paint_id is set — clear it`);
          if (fg.finish_type === "melamine" && u.stain_id)
            warnings.push(`finish_group "${fg.label}": melamine type but stain_id is set — clear it`);
        }
        await tx`
          UPDATE finish_groups
          SET stain_id   = ${u.stain_id},
              paint_id   = ${u.paint_id},
              glaze_id   = ${u.glaze_id},
              topcoat_id = ${u.topcoat_id},
              sheen_id   = ${u.sheen_id},
              notes      = ${u.notes}
          WHERE id = ${u.finish_group_id}
        `;
      }

      // 2. Child tables: delete-then-insert per touched finish_group

      // materials
      const matGroups = new Set((payload.materials ?? []).map((r) => r.finish_group_id));
      for (const fgId of matGroups) {
        await tx`DELETE FROM finish_group_materials WHERE finish_group_id = ${fgId}`;
      }
      for (const m of payload.materials ?? []) {
        await tx`
          INSERT INTO finish_group_materials (id, finish_group_id, role, material_id, where_used, notes)
          VALUES (${uid()}, ${m.finish_group_id}, ${m.role}, ${m.material_id}, ${m.where_used}, ${m.notes})
        `;
      }

      // door_fronts
      const dfGroups = new Set((payload.door_fronts ?? []).map((r) => r.finish_group_id));
      for (const fgId of dfGroups) {
        await tx`DELETE FROM finish_group_door_fronts WHERE finish_group_id = ${fgId}`;
      }
      for (const d of payload.door_fronts ?? []) {
        await tx`
          INSERT INTO finish_group_door_fronts
            (id, finish_group_id, role, slot_label, style_id, material_id,
             oe_id, ie_id, panel_id, grain, vendor, notes, sort_order)
          VALUES
            (${uid()}, ${d.finish_group_id}, ${d.role}, ${d.slot_label},
             ${d.style_id}, ${d.material_id}, ${d.oe_id}, ${d.ie_id},
             ${d.panel_id}, ${d.grain}, ${d.vendor}, ${d.notes}, ${d.sort_order})
        `;
      }

      // drawers
      const drGroups = new Set((payload.drawers ?? []).map((r) => r.finish_group_id));
      for (const fgId of drGroups) {
        await tx`DELETE FROM finish_group_drawers WHERE finish_group_id = ${fgId}`;
      }
      for (const d of payload.drawers ?? []) {
        await tx`
          INSERT INTO finish_group_drawers
            (id, finish_group_id, role, slot_label, drawer_box_id, slides_id, notes, sort_order)
          VALUES
            (${uid()}, ${d.finish_group_id}, ${d.role}, ${d.slot_label},
             ${d.drawer_box_id}, ${d.slides_id}, ${d.notes}, ${d.sort_order})
        `;
      }

      // edgebands
      const ebGroups = new Set((payload.edgebands ?? []).map((r) => r.finish_group_id));
      for (const fgId of ebGroups) {
        await tx`DELETE FROM finish_group_edgebands WHERE finish_group_id = ${fgId}`;
      }
      for (const e of payload.edgebands ?? []) {
        await tx`
          INSERT INTO finish_group_edgebands
            (id, finish_group_id, letter_code, edgeband_id, notes, sort_order)
          VALUES
            (${uid()}, ${e.finish_group_id}, ${e.letter_code}, ${e.edgeband_id},
             ${e.notes}, ${e.sort_order})
          ON CONFLICT (finish_group_id, letter_code) DO UPDATE
          SET edgeband_id = EXCLUDED.edgeband_id, notes = EXCLUDED.notes
        `;
      }

      // hardware
      const hwGroups = new Set((payload.hardware ?? []).map((r) => r.finish_group_id));
      for (const fgId of hwGroups) {
        await tx`DELETE FROM finish_group_hardware WHERE finish_group_id = ${fgId}`;
      }
      for (const h of payload.hardware ?? []) {
        await tx`
          INSERT INTO finish_group_hardware
            (id, finish_group_id, role, slot_label, hardware_id, qty,
             location, vendor, notes, sort_order)
          VALUES
            (${uid()}, ${h.finish_group_id}, ${h.role}, ${h.slot_label},
             ${h.hardware_id}, ${h.qty}, ${h.location}, ${h.vendor},
             ${h.notes}, ${h.sort_order})
        `;
      }

      // countertops
      const ctGroups = new Set((payload.countertops ?? []).map((r) => r.finish_group_id));
      for (const fgId of ctGroups) {
        await tx`DELETE FROM finish_group_countertops WHERE finish_group_id = ${fgId}`;
      }
      for (const c of payload.countertops ?? []) {
        await tx`
          INSERT INTO finish_group_countertops
            (id, finish_group_id, location, style_id, edge_id, splash_style,
             splash_edge_id, material_id, buildup_in, core_substrate, brackets,
             notes, sort_order)
          VALUES
            (${uid()}, ${c.finish_group_id}, ${c.location}, ${c.style_id},
             ${c.edge_id}, ${c.splash_style}, ${c.splash_edge_id}, ${c.material_id},
             ${c.buildup_in}, ${c.core_substrate}, ${c.brackets},
             ${c.notes}, ${c.sort_order})
        `;
      }

      // 3. Molding extras — UPDATE in place
      for (const m of payload.molding_extras ?? []) {
        await tx`
          UPDATE finish_moldings SET size_in = ${m.size_in}, material_id = ${m.material_id}
          WHERE id = ${m.id}
        `;
      }

      // 4. Soft-warn: cab_ext2/int2 without where_used (DAC #11)
      const ext2warns = await tx`
        SELECT fg.label, m.role
        FROM finish_group_materials m
        JOIN finish_groups fg ON fg.id = m.finish_group_id
        WHERE fg.spec_id = ${specId}
          AND m.role IN ('cab_ext2', 'cab_int2')
          AND m.material_id IS NOT NULL
          AND (m.where_used IS NULL OR m.where_used = '')
      ` as { label: string; role: string }[];
      for (const w of ext2warns) {
        warnings.push(`finish_group "${w.label}": ${w.role} has a material but no where_used note`);
      }
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  await logActivity({
    entityType: "spec", entityId: specId, jobId: (spec as {id:string;job_id:string}).job_id,
    eventType: "updated", actor: "pm", actorRole: "pm",
    payload: { sections: Object.keys(payload).filter(k => k !== "finish_updates") },
  }).catch(() => {});

  return NextResponse.json({ ok: true, warnings });
}
