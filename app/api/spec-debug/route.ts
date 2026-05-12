export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import path from "path";
import fs from "fs";
import { catalogs } from "@/lib/catalogs";

export async function GET(req: NextRequest) {
  const specId = req.nextUrl.searchParams.get("specId") ?? "58aba5f33bc80461";
  const jobId  = req.nextUrl.searchParams.get("jobId")  ?? "ACC-2026-0179";
  const s: Record<string, unknown> = {};

  try {
    // Catalog test
    const dir = path.join(process.cwd(), "data/catalogs");
    s.cwd = process.cwd();
    s.catalogDirExists = fs.existsSync(dir);
    s.paintColorsCount = s.catalogDirExists ? catalogs.paintColors().length : 0;

    // q1: residential_specs
    const t0 = Date.now();
    const specs = await sql`SELECT id, job_id FROM residential_specs WHERE id = ${specId} AND job_id = ${jobId}`;
    s.q1_ms = Date.now() - t0;
    s.q1_rows = specs.length;
    if (!specs.length) {
      const alt = await sql`SELECT id, job_id FROM residential_specs WHERE id = ${specId}`;
      s.q1_actual_job_id = alt[0]?.job_id ?? null;
      return NextResponse.json({ ...s, error: "spec not found with that job_id" });
    }

    // q2: finish_groups
    const t2 = Date.now();
    const fgs = await sql`SELECT id FROM finish_groups WHERE spec_id = ${specId} ORDER BY sort_order` as { id: string }[];
    s.q2_ms = Date.now() - t2;
    s.q2_rows = fgs.length;
    const fgIds = fgs.map(f => f.id);

    // q3: rooms
    const t3 = Date.now();
    const rooms = await sql`SELECT id FROM rooms WHERE spec_id = ${specId} ORDER BY sort_order` as { id: string }[];
    s.q3_ms = Date.now() - t3;
    s.q3_rows = rooms.length;
    const roomIds = rooms.map(r => r.id);

    // q4: room_accessories (IN array)
    if (roomIds.length) {
      const t4 = Date.now();
      const acc = await sql`SELECT id FROM room_accessories WHERE room_id IN ${sql(roomIds)}`;
      s.q4_ms = Date.now() - t4;
      s.q4_rows = acc.length;
    } else { s.q4_skipped = true; }

    // q5: cabinet_line_items (IN array)
    if (roomIds.length) {
      const t5 = Date.now();
      const cab = await sql`SELECT id FROM cabinet_line_items WHERE room_id IN ${sql(roomIds)} ORDER BY sort_order`;
      s.q5_ms = Date.now() - t5;
      s.q5_rows = cab.length;
    } else { s.q5_skipped = true; }

    // q6: room_finishes (IN array)
    if (roomIds.length) {
      const t6 = Date.now();
      const rf = await sql`SELECT id FROM room_finishes WHERE room_id IN ${sql(roomIds)} ORDER BY room_id, sort_order`;
      s.q6_ms = Date.now() - t6;
      s.q6_rows = rf.length;
    } else { s.q6_skipped = true; }

    // q7: finish_moldings (IN array)
    if (fgIds.length) {
      const t7 = Date.now();
      const mol = await sql`SELECT id FROM finish_moldings WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, sort_order` as { id: string }[];
      s.q7_ms = Date.now() - t7;
      s.q7_rows = mol.length;
      const moldingIds = mol.map(m => m.id);

      // q8: finish_group_materials (IN array)
      const t8 = Date.now();
      const mat = await sql`SELECT id FROM finish_group_materials WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, role`;
      s.q8_ms = Date.now() - t8;
      s.q8_rows = mat.length;

      // q9: finish_molding_rooms (IN array)
      if (moldingIds.length) {
        const t9 = Date.now();
        const mr = await sql`SELECT molding_id FROM finish_molding_rooms WHERE molding_id IN ${sql(moldingIds)}`;
        s.q9_ms = Date.now() - t9;
        s.q9_rows = mr.length;
      } else { s.q9_skipped = true; }
    } else { s.q7_skipped = true; }

    // Catalog loading (all 14 the page uses)
    const tc = Date.now();
    const _ = {
      paintColors:      catalogs.paintColors().length,
      stainColors:      catalogs.stainColors().length,
      melamineColors:   catalogs.melamineColors().length,
      doorStyles:       catalogs.doorStyles().length,
      hardwarePulls:    catalogs.hardwarePulls().length,
      revaAccessories:  catalogs.revaAccessories().length,
      cabinetFamilies:  catalogs.cabinetFamilies().length,
      carcassMaterials: catalogs.carcassMaterials().length,
      drawerBoxes:      catalogs.drawerBoxes().length,
      edgebands:        catalogs.edgebands().length,
      rooms:            catalogs.rooms().length,
      moldingTypes:     catalogs.moldingTypes().length,
      moldingProfiles:  catalogs.moldingProfiles().length,
      moldingMaterials: catalogs.moldingMaterials().length,
    };
    s.catalogs_ms = Date.now() - tc;
    s.catalog_counts = _;

    s.ok = true;
  } catch (e) {
    s.error = (e as Error).message;
    s.stack = (e as Error).stack?.split("\n").slice(0, 5).join(" | ");
  }

  return NextResponse.json(s);
}
