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

import { guardCap } from "@/lib/permissions";
type Params = { params: Promise<{ invoiceId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireBuilder();
  /*
    Karl, 2026-09-17: "mine only. we can roll out billing after more testing."
    The map held billing.* to the owner from that day; this route kept its own
    ["karl","admin","pm"] list, so it did not. The role matrix caught it on
    2026-09-18 — a PM POSTed here and got a 201 with a real invoice.

    When billing does roll out, the change is one line in lib/permissions.ts.
  */
  const bGuard = await guardCap("billing.manage");
  if (!bGuard.ok) return NextResponse.json({ error: bGuard.error }, { status: bGuard.status });
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
