/**
 * scripts/migrate-template-documents.mjs
 *
 * Creates the template_documents table and adds columns to client_signoffs.
 * Safe to re-run (idempotent).
 *
 * Usage:
 *   DATABASE_URL="postgres://..." node scripts/migrate-template-documents.mjs
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is required"); process.exit(1); }

const sql = postgres(url, { ssl: "require", prepare: false });

async function main() {
  console.log("Running template_documents migration...");

  // ── template_documents ────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS template_documents (
      id           TEXT PRIMARY KEY,
      doc_type     TEXT NOT NULL UNIQUE,
      label        TEXT NOT NULL,
      description  TEXT,
      storage_path TEXT,
      filename     TEXT,
      file_size    INTEGER,
      mime_type    TEXT,
      uploaded_by  TEXT,
      uploaded_at  TEXT,
      is_active    INTEGER NOT NULL DEFAULT 1
    )
  `;
  console.log("  ✓ template_documents table");

  // ── Pre-populate the standard slots ──────────────────────────────────────
  const slots = [
    {
      id: "tdoc-disclosure",
      doc_type: "residential_disclosure",
      label: "Residential Disclosure",
      description: "Attached to every contract packet sent to clients",
    },
    {
      id: "tdoc-warranty",
      doc_type: "warranty",
      label: "Warranty Document",
      description: "Attached to the install complete email",
    },
    {
      id: "tdoc-payment-terms",
      doc_type: "payment_terms",
      label: "Payment Terms",
      description: "Optionally attached to invoice emails",
    },
    {
      id: "tdoc-install-care",
      doc_type: "install_care",
      label: "Installation & Care Guide",
      description: "Included with install complete email alongside warranty",
    },
  ];

  for (const slot of slots) {
    await sql`
      INSERT INTO template_documents (id, doc_type, label, description, is_active)
      VALUES (${slot.id}, ${slot.doc_type}, ${slot.label}, ${slot.description}, 1)
      ON CONFLICT (doc_type) DO NOTHING
    `;
  }
  console.log("  ✓ default slots seeded");

  // ── Add columns to client_signoffs ────────────────────────────────────────
  // signoff_purpose: 'spec' | 'contract' | 'co'
  try {
    await sql`ALTER TABLE client_signoffs ADD COLUMN signoff_purpose TEXT DEFAULT 'spec'`;
    console.log("  ✓ client_signoffs.signoff_purpose");
  } catch { console.log("  · client_signoffs.signoff_purpose already exists"); }

  // certificate_path: Supabase storage path for the generated completion PDF
  try {
    await sql`ALTER TABLE client_signoffs ADD COLUMN certificate_path TEXT`;
    console.log("  ✓ client_signoffs.certificate_path");
  } catch { console.log("  · client_signoffs.certificate_path already exists"); }

  // attached_docs_json: JSON array describing what was sent with the contract
  try {
    await sql`ALTER TABLE client_signoffs ADD COLUMN attached_docs_json TEXT`;
    console.log("  ✓ client_signoffs.attached_docs_json");
  } catch { console.log("  · client_signoffs.attached_docs_json already exists"); }

  console.log("\nMigration complete.");
  await sql.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
