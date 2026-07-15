export const dynamic = "force-dynamic";

/**
 * GET   /api/change-orders/[coId]  — fetch CO + items
 * PATCH /api/change-orders/[coId]  — update title / description / co_type
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";

type Params = { params: Promise<{ coId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await requireBuilder();
  const { coId } = await params;

  const [co] = await sql`
    SELECT co.*, cs.signer_name, cs.signed_at AS signoff_signed_at, cs.token AS signoff_token
    FROM change_orders co
    LEFT JOIN client_signoffs cs ON cs.id = co.signoff_id
    WHERE co.id = ${coId}
  `;
  if (!co) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const items = await sql`
    SELECT * FROM change_order_items WHERE co_id = ${coId} ORDER BY sort_order, id
  `;

  return NextResponse.json({ co, items });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireBuilder();
  if (!["karl", "admin", "pm"].includes(session.role)) {
    return NextResponse.json({ error: "PM or admin required" }, { status: 403 });
  }

  const { coId } = await params;
  const [co] = await sql`SELECT id, status FROM change_orders WHERE id = ${coId}`;
  if (!co) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (co.status === "signed" || co.status === "voided") {
    return NextResponse.json({ error: "Cannot edit a signed or voided CO" }, { status: 409 });
  }

  const body = await req.json() as { title?: string; description?: string; co_type?: string };

  if (body.title !== undefined) {
    const title = body.title.trim();
    if (!title) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    await sql`UPDATE change_orders SET title = ${title} WHERE id = ${coId}`;
  }
  if (body.description !== undefined) {
    await sql`UPDATE change_orders SET description = ${body.description ?? null} WHERE id = ${coId}`;
  }
  if (body.co_type !== undefined) {
    await sql`UPDATE change_orders SET co_type = ${body.co_type} WHERE id = ${coId}`;
  }

  return NextResponse.json({ ok: true });
}
