export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireRole("admin");
  const { id: estimate_id } = await params;
  const body = await req.json();

  const itemId = uid();
  const maxSort = await sql`
    SELECT COALESCE(MAX(eli.sort_order), -1) AS max_sort
    FROM estimate_line_items eli
    JOIN estimate_rooms er ON er.id = eli.room_id
    WHERE er.estimate_id = ${estimate_id} AND eli.room_id = ${body.room_id}
  `;
  const sort_order = (maxSort[0]?.max_sort ?? -1) + 1;
  const now = new Date().toISOString();

  await sql`
    INSERT INTO estimate_line_items (
      id, room_id, item_type, cabinet_type_code, description,
      width_in, height_in, depth_in, adj_shelves, qty,
      feature_codes, end_panel, unit_qty, unit_label, manual_unit_cost,
      sort_order, created_at
    ) VALUES (
      ${itemId}, ${body.room_id}, ${body.item_type ?? "cabinet"},
      ${body.cabinet_type_code ?? null}, ${body.description ?? null},
      ${body.width_in ?? null}, ${body.height_in ?? null}, ${body.depth_in ?? null},
      ${body.adj_shelves ?? 1}, ${body.qty ?? 1},
      ${body.feature_codes ?? null}, ${body.end_panel ?? 0},
      ${body.unit_qty ?? null}, ${body.unit_label ?? null}, ${body.manual_unit_cost ?? null},
      ${sort_order}, ${now}
    )
  `;

  return NextResponse.json({ id: itemId });
}
