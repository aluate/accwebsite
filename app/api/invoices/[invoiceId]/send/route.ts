export const dynamic = "force-dynamic";

/**
 * POST /api/invoices/[invoiceId]/send
 *
 * Assigns an invoice number, marks status = 'sent', emails the client.
 * PM must supply recipient email (client may be homeowner, builder, or both).
 *
 * Body: { to: string; cc?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";
import { sendEmail } from "@/lib/mailer";
import { invoiceSent } from "@/lib/email-templates";

type Params = { params: Promise<{ invoiceId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireBuilder();
  if (!["admin", "pm"].includes(session.role)) {
    return NextResponse.json({ error: "PM or admin required" }, { status: 403 });
  }

  const { invoiceId } = await params;

  // Load invoice + job
  const [invoice] = await sql`
    SELECT i.*, j.client_name, j.site_address, j.client_email
    FROM invoices i
    JOIN jobs j ON j.id = i.job_id
    WHERE i.id = ${invoiceId}
  ` as Array<{
    id: string; job_id: string; invoice_number: number | null;
    invoice_type: "deposit" | "balance" | "change_order" | "manual";
    status: string; terms: string; notes: string | null;
    client_name: string; site_address: string; client_email: string | null;
  }>;

  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (invoice.status === "void") {
    return NextResponse.json({ error: "Invoice is voided" }, { status: 409 });
  }
  if (invoice.status === "sent" || invoice.status === "paid") {
    return NextResponse.json({ error: "Invoice already sent" }, { status: 409 });
  }

  const lineItems = await sql<Array<{ description: string; amount: number }>>`
    SELECT description, amount FROM invoice_line_items
    WHERE invoice_id = ${invoiceId}
    ORDER BY sort_order, id
  `;

  if (lineItems.length === 0) {
    return NextResponse.json({ error: "Invoice has no line items" }, { status: 422 });
  }

  const body = await req.json() as { to?: string; cc?: string };
  const toEmail = (body.to ?? invoice.client_email ?? "").trim();
  if (!toEmail) {
    return NextResponse.json({ error: "Recipient email (to) is required" }, { status: 400 });
  }

  // Assign invoice number from sequence
  const now = new Date().toISOString();
  let invoiceNumber = invoice.invoice_number;
  if (!invoiceNumber) {
    const [seqRow] = await sql<Array<{ nextval: string }>>`
      SELECT nextval('invoice_number_seq') AS nextval
    `;
    invoiceNumber = Number(seqRow.nextval);
    await sql`
      UPDATE invoices SET invoice_number = ${invoiceNumber} WHERE id = ${invoiceId}
    `;
  }

  // Mark sent
  await sql`
    UPDATE invoices SET status = 'sent', sent_at = ${now} WHERE id = ${invoiceId}
  `;

  // Build and send email
  const { subject, text, html } = invoiceSent({
    clientName: invoice.client_name,
    siteAddress: invoice.site_address,
    invoiceNumber,
    invoiceType: invoice.invoice_type,
    lineItems: lineItems.map((li) => ({ description: li.description, amount: Number(li.amount) })),
    terms: invoice.terms,
    notes: invoice.notes,
  });

  const result = await sendEmail({
    to: toEmail,
    cc: body.cc,
    subject,
    text,
    html,
  });

  if (!result.ok) {
    // Roll back status if email fails so PM can retry
    await sql`UPDATE invoices SET status = 'draft', sent_at = null WHERE id = ${invoiceId}`;
    return NextResponse.json(
      { error: `Email failed: ${(result as { ok: false; error: string }).error}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, invoiceNumber });
}
