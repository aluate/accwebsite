export const dynamic = "force-dynamic";

/**
 * PATCH  /api/change-orders/[coId]/items/[itemId]  — update a line item
 * DELETE /api/change-orders/[coId]/items/[itemId]  — remove a line item
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";

type Params = { params: Promise<{ coId: string; itemId: string }> };

async function recalcTotals(coId: string) {
  const items = await sql`
    SELECT item_type, total FROM change_order_items WHERE co_id = ${coId}
  ` as Array<{ item_type: string; total: number }>;
  const totalProducts = items.filter((i) => i.item_type === "product").reduce((s, i) => s + (Number(i.total) || 0), 0);
  const totalLabor    = items.filter((i) => i.item_type === "labor").reduce((s, i) => s + (Number(i.total) || 0), 0);
  await sql`UPDATE change_orders SET total_products=${totalProducts}, total_labor=${totalLabor}, total_amount=${totalProducts+totalLabor} WHERE id=${coId}`;
}

async function guardEditableCO(coId: string) {
  const [co] = await sql`SELECT id, status FROM change_orders WHERE id = ${coId}`;
  if (!co) return "not_found";
  if (co.status === "signed" || co.status === "voided") return "locked";
  return null;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireBuilder();
  if (!["admin", "pm"].includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { coId, itemId } = await params;
  const guard = await guardEditableCO(coId);
  if (guard === "not_found") return NextResponse.json({ error: "CO not found" }, { status: 404 });
  if (guard === "locked")    return NextResponse.json({ error: "CO is locked" }, { status: 409 });

  const body = await req.json() as { description?: string; quantity?: number | null; unit?: string | null; unit_price?: number | null; total?: number };

  if (body.description !== undefined) {
    if (!body.description.trim()) return NextResponse.json({ error: "description required" }, { status: 400 });
    await sql`UPDATE change_order_items SET description = ${body.description.trim()} WHERE id = ${itemId} AND co_id = ${coId}`;
  }
  if (body.quantity !== undefined) {
    await sql`UPDATE change_order_items SET quantity = ${body.quantity} WHERE id = ${itemId} AND co_id = ${coId}`;
  }
  if (body.unit !== undefined) {
    await sql`UPDATE change_order_items SET unit = ${body.unit} WHERE id = ${itemId} AND co_id = ${coId}`;
  }
  if (body.unit_price !== undefined) {
    await sql`UPDATE change_order_items SET unit_price = ${body.unit_price} WHERE id = ${itemId} AND co_id = ${coId}`;
  }
  if (body.total !== undefined) {
    await sql`UPDATE change_order_items SET total = ${body.total} WHERE id = ${itemId} AND co_id = ${coId}`;
  }

  await recalcTotals(coId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requireBuilder();
  if (!["admin", "pm"].includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { coId, itemId } = await params;
  const guard = await guardEditableCO(coId);
  if (guard === "not_found") return NextResponse.json({ error: "CO not found" }, { status: 404 });
  if (guard === "locked")    return NextResponse.json({ error: "CO is locked" }, { status: 409 });

  await sql`DELETE FROM change_order_items WHERE id = ${itemId} AND co_id = ${coId}`;
  await recalcTotals(coId);
  return NextResponse.json({ ok: true });
}
