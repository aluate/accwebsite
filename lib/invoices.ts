/**
 * lib/invoices.ts
 *
 * Invoice creation helpers.
 * Called by:
 *   - signoff POST route  → 50% deposit when contract signed
 *   - signoff POST route  → 100% CO amount when CO signed
 *   - advance route       → 50% balance when job advances to "delivered"
 *
 * Invoice types:
 *   deposit       — 50% of contract value, triggered at contract signing
 *   balance       — remaining 50%, triggered at delivery
 *   change_order  — full CO amount, triggered when CO is signed
 *   manual        — PM-created ad hoc
 */

import { sql, uid } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type InvoiceType = "deposit" | "balance" | "change_order" | "manual";
export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

export type InvoiceLineItem = {
  id: string;
  invoice_id: string;
  description: string;
  amount: number;
  sort_order: number;
};

export type Invoice = {
  id: string;
  job_id: string;
  invoice_number: number | null;
  invoice_type: InvoiceType;
  change_order_id: string | null;
  status: InvoiceStatus;
  terms: string;
  notes: string | null;
  check_number: string | null;
  check_date: string | null;
  paid_at: string | null;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
  line_items?: InvoiceLineItem[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finds the most recent approved/sent estimate for a job and returns sell_price.
 * Falls back to 0 if no estimate is linked — PM can always edit before sending.
 */
async function fetchEstimateSellPrice(jobId: string): Promise<number> {
  const [row] = await sql<Array<{ sell_price: number | null }>>`
    SELECT sell_price
    FROM estimates
    WHERE job_id = ${jobId}
      AND sell_price IS NOT NULL
      AND sell_price > 0
    ORDER BY created_at DESC
    LIMIT 1
  `.catch(() => []);
  return Number(row?.sell_price ?? 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// createDraftInvoice
// ─────────────────────────────────────────────────────────────────────────────

type CreateDraftOpts = {
  jobId: string;
  jobLabel: string;   // "client_name — site_address" for line item description
  invoiceType: InvoiceType;
  createdBy?: string;
  /** Required for change_order type */
  changeOrderId?: string;
  /** Required for change_order type — CO total */
  changeOrderAmount?: number;
  /** CO number + title for description */
  changeOrderLabel?: string;
};

/**
 * Creates a draft invoice with pre-filled line items.
 * Does NOT send an email. PM reviews and sends manually.
 * Returns the new invoice id.
 */
export async function createDraftInvoice(opts: CreateDraftOpts): Promise<string> {
  const {
    jobId,
    jobLabel,
    invoiceType,
    createdBy = "system",
    changeOrderId,
    changeOrderAmount,
    changeOrderLabel,
  } = opts;

  const now = new Date().toISOString();
  const invoiceId = uid();

  await sql`
    INSERT INTO invoices
      (id, job_id, invoice_type, change_order_id, status, terms, created_by, created_at)
    VALUES
      (${invoiceId}, ${jobId}, ${invoiceType}, ${changeOrderId ?? null},
       'draft', 'Due on receipt', ${createdBy}, ${now})
  `;

  // Build line items
  if (invoiceType === "change_order") {
    const amount = Number(changeOrderAmount ?? 0);
    const desc = changeOrderLabel ?? "Change Order";
    await sql`
      INSERT INTO invoice_line_items (id, invoice_id, description, amount, sort_order)
      VALUES (${uid()}, ${invoiceId}, ${desc}, ${amount}, 0)
    `;
  } else {
    // Deposit or balance — 50% of estimate sell_price
    const sellPrice = await fetchEstimateSellPrice(jobId);
    const halfAmount = sellPrice > 0 ? Math.round(sellPrice * 0.5 * 100) / 100 : 0;

    const label = invoiceType === "deposit"
      ? `50% deposit — ${jobLabel}`
      : `50% balance — ${jobLabel}`;

    await sql`
      INSERT INTO invoice_line_items (id, invoice_id, description, amount, sort_order)
      VALUES (${uid()}, ${invoiceId}, ${label}, ${halfAmount}, 0)
    `;
  }

  return invoiceId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prevent duplicate draft invoices
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if a draft or sent invoice of this type already exists for the job.
 * Used to avoid creating duplicates when a signoff or advance is re-processed.
 */
export async function invoiceExists(
  jobId: string,
  invoiceType: InvoiceType,
  changeOrderId?: string
): Promise<boolean> {
  if (invoiceType === "change_order" && changeOrderId) {
    const [row] = await sql<Array<{ id: string }>>`
      SELECT id FROM invoices
      WHERE job_id = ${jobId}
        AND invoice_type = 'change_order'
        AND change_order_id = ${changeOrderId}
        AND status != 'void'
      LIMIT 1
    `.catch(() => []);
    return !!row;
  }

  const [row] = await sql<Array<{ id: string }>>`
    SELECT id FROM invoices
    WHERE job_id = ${jobId}
      AND invoice_type = ${invoiceType}
      AND status != 'void'
    LIMIT 1
  `.catch(() => []);
  return !!row;
}
