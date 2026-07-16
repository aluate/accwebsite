export const dynamic = "force-dynamic";

/**
 * POST /api/invoices/[invoiceId]/pay
 *
 * Marks an invoice as paid. Records check number and date.
 *
 * Body: { check_number?: string; check_date?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";

type Params = { params: Promise<{ invoiceId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireBuilder();
  if (!["admin", "pm"].includes(session.role)) {
    return NextResponse.json({ error: "PM or admin required" }, { status: 403 });
  }

  const { invoiceId } = await params;
  const [invoice] = await sql`SELECT id, status FROM invoices WHERE id = ${invoiceId}`;
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (invoice.status === "void") {
    return NextResponse.json({ error: "Invoice is voided" }, { status: 409 });
  }
  if (invoice.status === "paid") {
    return NextResponse.json({ error: "Already paid" }, { status: 409 });
  }

  const body = await req.json() as { check_number?: string; check_date?: string };
  const now = new Date().toISOString();

  await sql`
    UPDATE invoices SET
      status       = 'paid',
      paid_at      = ${now},
      check_number = ${body.check_number ?? null},
      check_date   = ${body.check_date ?? null}
    WHERE id = ${invoiceId}
  `;

  return NextResponse.json({ ok: true });
}
