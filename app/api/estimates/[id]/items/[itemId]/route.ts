export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  await requireRole("admin");
  const { itemId } = await params;
  const body = await req.json();

  await sql`
    UPDATE estimate_line_items SET
      cabinet_type_code = COALESCE(${body.cabinet_type_code ?? null}, cabinet_type_code),
      description       = COALESCE(${body.description ?? null}, description),
      width_in          = COALESCE(${body.width_in ?? null}, width_in),
      height_in         = COALESCE(${body.height_in ?? null}, height_in),
      depth_in          = COALESCE(${body.depth_in ?? null}, depth_in),
      adj_shelves       = COALESCE(${body.adj_shelves ?? null}, adj_shelves),
      qty               = COALESCE(${body.qty ?? null}, qty),
      feature_codes     = COALESCE(${body.feature_codes ?? null}, feature_codes),
      end_panel         = COALESCE(${body.end_panel != null ? (body.end_panel ? 1 : 0) : null}, end_panel),
      unit_qty          = COALESCE(${body.unit_qty ?? null}, unit_qty),
      unit_label        = COALESCE(${body.unit_label ?? null}, unit_label),
      manual_unit_cost  = COALESCE(${body.manual_unit_cost ?? null}, manual_unit_cost),
      sort_order        = COALESCE(${body.sort_order ?? null}, sort_order)
    WHERE id = ${itemId}
  `;

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  await requireRole("admin");
  const { itemId } = await params;
  await sql`DELETE FROM estimate_line_items WHERE id = ${itemId}`;
  return NextResponse.json({ ok: true });
}
