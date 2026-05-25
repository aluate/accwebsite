export const dynamic = "force-dynamic";

/**
 * POST /api/change-orders/[coId]/items  — add a line item
 *
 * Body: { item_type: "product"|"labor", description, quantity?, unit?, unit_price?, total }
 */
import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";

type Params = { params: Promise<{ coId: string }> };

async function recalcTotals(coId: string) {
  const items = await sql`
    SELECT item_type, total FROM change_order_items WHERE co_id = ${coId}
  ` as Array<{ item_type: string; total: number }>;

  const totalProducts = items
    .filter((i) => i.item_type === "product")
    .reduce((s, i) => s + (Number(i.total) || 0), 0);
  const totalLabor = items
    .filter((i) => i.item_type === "labor")
    .reduce((s, i) => s + (Number(i.total) || 0), 0);

  await sql`
    UPDATE change_orders SET
      total_products = ${totalProducts},
      total_labor    = ${totalLabor},
      total_amount   = ${totalProducts + totalLabor}
    WHERE id = ${coId}
  `;
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireBuilder();
  if (!["admin", "pm"].includes(session.role)) {
    return NextResponse.json({ error: "PM or admin required" }, { status: 403 });
  }

  const { coId } = await params;
  const [co] = await sql`SELECT id, status FROM change_orders WHERE id = ${coId}`;
  if (!co) return NextResponse.json({ error: "CO not found" }, { status: 404 });
  if (co.status === "signed" || co.status === "voided") {
    return NextResponse.json({ error: "Cannot edit a signed or voided CO" }, { status: 409 });
  }

  const body = await req.json() as {
    item_type: string;
    description: string;
    quantity?: number;
    unit?: string;
    unit_price?: number;
    total?: number;
  };

  if (!body.description?.trim()) {
    return NextResponse.json({ error: "description required" }, { status: 400 });
  }
  if (!["product", "labor"].includes(body.item_type)) {
    return NextResponse.json({ error: "item_type must be product or labor" }, { status: 400 });
  }

  const qty = body.quantity ?? null;
  const unitPrice = body.unit_price ?? null;
  const total = body.total ?? (qty !== null && unitPrice !== null ? qty * unitPrice : 0);

  const [{ max_order }] = await sql`
    SELECT COALESCE(MAX(sort_order), -1)::int AS max_order FROM change_order_items WHERE co_id = ${coId}
  ` as [{ max_order: number }];

  const itemId = uid();
  await sql`
    INSERT INTO change_order_items
      (id, co_id, item_type, description, quantity, unit, unit_price, total, sort_order)
    VALUES
      (${itemId}, ${coId}, ${body.item_type}, ${body.description.trim()},
       ${qty}, ${body.unit ?? null}, ${unitPrice}, ${total}, ${max_order + 1})
  `;

  await recalcTotals(coId);

  return NextResponse.json({ ok: true, id: itemId }, { status: 201 });
}
