/**
 * scripts/migrate-invoices.mjs
 *
 * Creates the invoices and invoice_line_items tables.
 * Safe to re-run (CREATE TABLE IF NOT EXISTS).
 *
 * Usage:
 *   DATABASE_URL="postgres://..." node scripts/migrate-invoices.mjs
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", prepare: false });

async function main() {
  console.log("Running invoices migration...");

  // ── invoices ──────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS invoices (
      id                TEXT        PRIMARY KEY,
      job_id            TEXT        NOT NULL REFERENCES jobs(id),
      invoice_number    INTEGER,                        -- assigned when sent
      invoice_type      TEXT        NOT NULL DEFAULT 'deposit',
        -- 'deposit' | 'balance' | 'change_order' | 'manual'
      change_order_id   TEXT        REFERENCES change_orders(id),
      status            TEXT        NOT NULL DEFAULT 'draft',
        -- 'draft' | 'sent' | 'paid' | 'void'
      terms             TEXT        NOT NULL DEFAULT 'Due on receipt',
      notes             TEXT,
      check_number      TEXT,
      check_date        TEXT,
      paid_at           TEXT,
      sent_at           TEXT,
      created_by        TEXT,
      created_at        TEXT        NOT NULL
    )
  `;
  console.log("  ✓ invoices table");

  // ── invoice_line_items ────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS invoice_line_items (
      id            TEXT          PRIMARY KEY,
      invoice_id    TEXT          NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description   TEXT          NOT NULL,
      amount        NUMERIC(10,2) NOT NULL,
      sort_order    INTEGER       NOT NULL DEFAULT 0
    )
  `;
  console.log("  ✓ invoice_line_items table");

  // ── invoice number sequence ───────────────────────────────────────────────
  await sql`
    CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1001 INCREMENT 1
  `;
  console.log("  ✓ invoice_number_seq sequence");

  // ── indexes ───────────────────────────────────────────────────────────────
  await sql`
    CREATE INDEX IF NOT EXISTS idx_invoices_job_id ON invoices(job_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id
      ON invoice_line_items(invoice_id)
  `;
  console.log("  ✓ indexes");

  console.log("\nMigration complete.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
