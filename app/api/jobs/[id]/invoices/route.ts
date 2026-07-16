export const dynamic = "force-dynamic";

/**
 * GET  /api/jobs/[id]/invoices  — list invoices for a job (with line items)
 * POST /api/jobs/[id]/invoices  — create a manual draft invoice
 */

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await requireBuilder();
  const { id } = await params;

  const [job] = await sql`SELECT id FROM jobs WHERE id = ${id} OR job_number = ${id}`;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const jobId = job.id;

  const invoices = await sql`
    SELECT i.*,
           co.co_number, co.title AS co_title
    FROM invoices i
    LEFT JOIN change_orders co ON co.id = i.change_order_id
    WHERE i.job_id = ${jobId}
    ORDER BY i.created_at ASC
  `;

  const lineItems = invoices.length > 0
    ? await sql`
        SELECT * FROM invoice_line_items
        WHERE invoice_id = ANY(${invoices.map((inv: { id: string }) => inv.id)})
        ORDER BY sort_order, id
      `
    : [];

  // Group line items by invoice_id
  const linesByInvoice = new Map<string, typeof lineItems>();
  for (const li of lineItems) {
    if (!linesByInvoice.has(li.invoice_id)) linesByInvoice.set(li.invoice_id, []);
    linesByInvoice.get(li.invoice_id)!.push(li);
  }

  const enriched = invoices.map((inv: { id: string }) => ({
    ...inv,
    line_items: linesByInvoice.get(inv.id) ?? [],
  }));

  return NextResponse.json({ invoices: enriched });
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireBuilder();
  if (!["admin", "pm"].includes(session.role)) {
    return NextResponse.json({ error: "PM or admin required" }, { status: 403 });
  }

  const { id } = await params;
  const [job] = await sql`SELECT id FROM jobs WHERE id = ${id} OR job_number = ${id}`;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const jobId = job.id;

  const body = await req.json() as {
    invoice_type?: string;
    notes?: string;
    line_items?: Array<{ description: string; amount: number }>;
  };

  const invoiceType = body.invoice_type ?? "manual";
  const now = new Date().toISOString();
  const invoiceId = uid();

  await sql`
    INSERT INTO invoices
      (id, job_id, invoice_type, status, terms, notes, created_by, created_at)
    VALUES
      (${invoiceId}, ${jobId}, ${invoiceType}, 'draft', 'Due on receipt',
       ${body.notes ?? null}, ${session.name}, ${now})
  `;

  if (body.line_items?.length) {
    for (let i = 0; i < body.line_items.length; i++) {
      const li = body.line_items[i];
      await sql`
        INSERT INTO invoice_line_items (id, invoice_id, description, amount, sort_order)
        VALUES (${uid()}, ${invoiceId}, ${li.description}, ${li.amount}, ${i})
      `;
    }
  }

  return NextResponse.json({ ok: true, id: invoiceId }, { status: 201 });
}
