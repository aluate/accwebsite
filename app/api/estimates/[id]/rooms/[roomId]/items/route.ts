export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  await requireRole("admin");
  const { roomId } = await params;
  const body = await req.json();

  const itemId = uid();
  const maxSort = await sql`
    SELECT COALESCE(MAX(sort_order), -1) AS max_sort
    FROM estimate_line_items WHERE room_id = ${roomId}
  `;

  await sql`
    INSERT INTO estimate_line_items (
      id, room_id, item_type, cabinet_type_code, description,
      width_in, height_in, depth_in, adj_shelves, qty,
      feature_codes, end_panel, unit_qty, unit_label,
      manual_unit_cost, sort_order
    ) VALUES (
      ${itemId}, ${roomId},
      ${body.item_type ?? "cabinet"},
      ${body.cabinet_type_code ?? null},
      ${body.description ?? null},
      ${body.width_in ?? null},
      ${body.height_in ?? null},
      ${body.depth_in ?? null},
      ${body.adj_shelves ?? 1},
      ${body.qty ?? 1},
      ${body.feature_codes ?? null},
      ${body.end_panel ? 1 : 0},
      ${body.unit_qty ?? null},
      ${body.unit_label ?? null},
      ${body.manual_unit_cost ?? null},
      ${(maxSort[0].max_sort as number) + 1}
    )
  `;

  return NextResponse.json({ id: itemId }, { status: 201 });
}
