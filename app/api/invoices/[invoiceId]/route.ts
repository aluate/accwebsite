export const dynamic = "force-dynamic";

/**
 * PATCH  /api/invoices/[invoiceId]  — edit draft invoice (line items, notes, terms)
 * DELETE /api/invoices/[invoiceId]  — void invoice
 */

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";

type Params = { params: Promise<{ invoiceId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireBuilder();
  if (!["admin", "pm"].includes(session.role)) {
    return NextResponse.json({ error: "PM or admin required" }, { status: 403 });
  }

  const { invoiceId } = await params;
  const [invoice] = await sql`SELECT id, status FROM invoices WHERE id = ${invoiceId}`;
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (invoice.status === "void") {
    return NextResponse.json({ error: "Cannot edit a voided invoice" }, { status: 409 });
  }
  if (invoice.status === "paid") {
    return NextResponse.json({ error: "Cannot edit a paid invoice" }, { status: 409 });
  }

  const body = await req.json() as {
    notes?: string | null;
    terms?: string;
    line_items?: Array<{ id?: string; description: string; amount: number }>;
  };

  if (body.notes !== undefined) {
    await sql`UPDATE invoices SET notes = ${body.notes} WHERE id = ${invoiceId}`;
  }
  if (body.terms !== undefined && body.terms.trim()) {
    await sql`UPDATE invoices SET terms = ${body.terms.trim()} WHERE id = ${invoiceId}`;
  }

  // Replace line items if provided
  if (body.line_items !== undefined) {
    await sql`DELETE FROM invoice_line_items WHERE invoice_id = ${invoiceId}`;
    for (let i = 0; i < body.line_items.length; i++) {
      const li = body.line_items[i];
      await sql`
        INSERT INTO invoice_line_items (id, invoice_id, description, amount, sort_order)
        VALUES (${uid()}, ${invoiceId}, ${li.description.trim()}, ${Number(li.amount)}, ${i})
      `;
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requireBuilder();
  if (!["admin", "pm"].includes(session.role)) {
    return NextResponse.json({ error: "PM or admin required" }, { status: 403 });
  }

  const { invoiceId } = await params;
  const [invoice] = await sql`SELECT id, status FROM invoices WHERE id = ${invoiceId}`;
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (invoice.status === "paid") {
    return NextResponse.json({ error: "Cannot void a paid invoice" }, { status: 409 });
  }

  await sql`UPDATE invoices SET status = 'void' WHERE id = ${invoiceId}`;
  return NextResponse.json({ ok: true });
}
