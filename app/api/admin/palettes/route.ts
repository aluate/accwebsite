export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET() {
  await requireRole("admin");
  const palettes = await sql`SELECT * FROM builder_palettes ORDER BY builder_company, palette_name`;
  return NextResponse.json({ palettes });
}

export async function POST(req: NextRequest) {
  await requireRole("admin");
  const body = await req.json() as {
    builder_company: string; palette_name: string; finish_type?: string;
    default_carcass_id?: string; default_drawer_box_id?: string; default_pull_id?: string;
    notes?: string;
    finish_groups?: { fg_label: string; finish_type?: string; color_id?: string; carcass_id?: string; drawer_box_id?: string; door_style_id?: string; pull_id?: string }[];
  };
  if (!body.builder_company?.trim()) return NextResponse.json({ error: "builder_company required" }, { status: 400 });
  if (!body.palette_name?.trim()) return NextResponse.json({ error: "palette_name required" }, { status: 400 });

  const [palette] = await sql`
    INSERT INTO builder_palettes (builder_company, palette_name, finish_type, default_carcass_id, default_drawer_box_id, default_pull_id, notes)
    VALUES (${body.builder_company}, ${body.palette_name}, ${body.finish_type ?? null},
            ${body.default_carcass_id ?? null}, ${body.default_drawer_box_id ?? null},
            ${body.default_pull_id ?? null}, ${body.notes ?? null})
    RETURNING *
  `;

  const fgs = [];
  for (const fg of body.finish_groups ?? []) {
    const [row] = await sql`
      INSERT INTO builder_palette_finish_groups (palette_id, fg_label, finish_type, color_id, carcass_id, drawer_box_id, door_style_id, pull_id)
      VALUES (${palette.id}, ${fg.fg_label}, ${fg.finish_type ?? null}, ${fg.color_id ?? null},
              ${fg.carcass_id ?? null}, ${fg.drawer_box_id ?? null}, ${fg.door_style_id ?? null}, ${fg.pull_id ?? null})
      RETURNING *
    `;
    fgs.push(row);
  }

  return NextResponse.json({ palette, finish_groups: fgs }, { status: 201 });
}
