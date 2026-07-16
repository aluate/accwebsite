export const dynamic = "force-dynamic";

/**
 * /admin/billing — Past-due invoices and payment status report.
 *
 * Shows all sent (unpaid) invoices, sorted by age.
 * Admins can click through to the job to mark paid.
 */

import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { sql } from "@/lib/db";

type InvoiceRow = {
  id: string;
  invoice_number: number | null;
  invoice_type: string;
  status: string;
  sent_at: string | null;
  terms: string;
  job_id: string;
  job_number: string | null;
  client_name: string;
  site_address: string;
  total: number;
};

function fmt$(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function typeLabel(t: string) {
  return { deposit: "Deposit", balance: "Balance", change_order: "Change Order", manual: "Manual" }[t] ?? t;
}

function ageBadge(days: number) {
  if (days >= 30) return "bg-red-100 text-red-700";
  if (days >= 14) return "bg-orange-100 text-orange-700";
  return "bg-yellow-100 text-yellow-700";
}

export default async function BillingPage() {
  await requireRole("admin");

  // All sent (unpaid) invoices with job info and totals
  const sentInvoices = await sql<InvoiceRow[]>`
    SELECT
      i.id, i.invoice_number, i.invoice_type, i.status, i.sent_at, i.terms,
      j.id AS job_id, j.job_number, j.client_name, j.site_address,
      COALESCE(SUM(li.amount), 0) AS total
    FROM invoices i
    JOIN jobs j ON j.id = i.job_id
    LEFT JOIN invoice_line_items li ON li.invoice_id = i.id
    WHERE i.status = 'sent'
    GROUP BY i.id, j.id
    ORDER BY i.sent_at ASC NULLS LAST
  `;

  // Recent paid invoices (last 30 days)
  const paidInvoices = await sql<InvoiceRow[]>`
    SELECT
      i.id, i.invoice_number, i.invoice_type, i.status, i.sent_at, i.terms,
      j.id AS job_id, j.job_number, j.client_name, j.site_address,
      COALESCE(SUM(li.amount), 0) AS total
    FROM invoices i
    JOIN jobs j ON j.id = i.job_id
    LEFT JOIN invoice_line_items li ON li.invoice_id = i.id
    WHERE i.status = 'paid'
      AND i.paid_at >= (NOW() - INTERVAL '30 days')::text
    GROUP BY i.id, j.id
    ORDER BY i.paid_at DESC
  `;

  // Draft invoices (PM hasn't sent yet)
  const draftInvoices = await sql<InvoiceRow[]>`
    SELECT
      i.id, i.invoice_number, i.invoice_type, i.status, i.sent_at, i.terms,
      j.id AS job_id, j.job_number, j.client_name, j.site_address,
      COALESCE(SUM(li.amount), 0) AS total
    FROM invoices i
    JOIN jobs j ON j.id = i.job_id
    LEFT JOIN invoice_line_items li ON li.invoice_id = i.id
    WHERE i.status = 'draft'
    GROUP BY i.id, j.id
    ORDER BY i.created_at ASC
  `;

  const totalOutstanding = sentInvoices.reduce((s, inv) => s + Number(inv.total), 0);
  const totalPaidRecent  = paidInvoices.reduce((s, inv) => s + Number(inv.total), 0);

  return (
    <div className="min-h-screen bg-[#0d0e0f] text-white px-6 py-10 max-w-4xl mx-auto">
      <div className="text-white/40 text-xs font-condensed uppercase tracking-widest mb-2">Admin</div>
      <h1 className="font-heading text-3xl uppercase tracking-wide text-[#f08122] mb-2">Billing</h1>
      <p className="text-white/40 text-sm mb-8">Invoice status across all jobs</p>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-[#1a1b1c] border border-white/10 rounded-xl px-5 py-4">
          <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Outstanding</p>
          <p className="text-2xl font-bold text-red-400">{fmt$(totalOutstanding)}</p>
          <p className="text-xs text-white/30 mt-1">{sentInvoices.length} invoice{sentInvoices.length !== 1 ? "s" : ""} sent</p>
        </div>
        <div className="bg-[#1a1b1c] border border-white/10 rounded-xl px-5 py-4">
          <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Paid (30d)</p>
          <p className="text-2xl font-bold text-green-400">{fmt$(totalPaidRecent)}</p>
          <p className="text-xs text-white/30 mt-1">{paidInvoices.length} invoice{paidInvoices.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="bg-[#1a1b1c] border border-white/10 rounded-xl px-5 py-4">
          <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Drafts (unsent)</p>
          <p className="text-2xl font-bold text-yellow-400">{draftInvoices.length}</p>
          <p className="text-xs text-white/30 mt-1">
            {fmt$(draftInvoices.reduce((s, i) => s + Number(i.total), 0))} pending approval
          </p>
        </div>
      </div>

      {/* Outstanding / past-due */}
      <section className="mb-10">
        <h2 className="text-sm font-condensed uppercase tracking-widest text-white/50 mb-3">
          Outstanding — Awaiting Payment
        </h2>
        {sentInvoices.length === 0 ? (
          <p className="text-white/30 text-sm py-4">No outstanding invoices.</p>
        ) : (
          <div className="space-y-2">
            {sentInvoices.map((inv) => {
              const days = daysSince(inv.sent_at);
              return (
                <Link
                  key={inv.id}
                  href={`/jobs/${inv.job_number ?? inv.job_id}`}
                  className="flex items-center gap-4 bg-[#1a1b1c] border border-white/10 hover:border-[#f08122]/40 rounded-xl px-5 py-4 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-white group-hover:text-[#f08122] transition-colors">
                        {inv.client_name}
                      </span>
                      <span className="text-white/30 text-xs">·</span>
                      <span className="text-white/50 text-xs">
                        {typeLabel(inv.invoice_type)}
                        {inv.invoice_number ? ` #${inv.invoice_number}` : ""}
                      </span>
                    </div>
                    <p className="text-white/40 text-xs truncate">{inv.site_address}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-white">{fmt$(Number(inv.total))}</p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${ageBadge(days)}`}>
                      {days}d ago
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Draft invoices */}
      {draftInvoices.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm font-condensed uppercase tracking-widest text-white/50 mb-3">
            Drafts — Review &amp; Send
          </h2>
          <div className="space-y-2">
            {draftInvoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/jobs/${inv.job_number ?? inv.job_id}`}
                className="flex items-center gap-4 bg-[#1a1b1c] border border-yellow-900/40 hover:border-yellow-500/40 rounded-xl px-5 py-4 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-white group-hover:text-yellow-400 transition-colors">
                      {inv.client_name}
                    </span>
                    <span className="text-white/30 text-xs">·</span>
                    <span className="text-yellow-500/70 text-xs">
                      {typeLabel(inv.invoice_type)} draft
                    </span>
                  </div>
                  <p className="text-white/40 text-xs truncate">{inv.site_address}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-white/60">{fmt$(Number(inv.total))}</p>
                  <p className="text-yellow-500/70 text-xs mt-1">Needs review →</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent paid */}
      {paidInvoices.length > 0 && (
        <section>
          <h2 className="text-sm font-condensed uppercase tracking-widest text-white/50 mb-3">
            Paid — Last 30 Days
          </h2>
          <div className="space-y-2">
            {paidInvoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/jobs/${inv.job_number ?? inv.job_id}`}
                className="flex items-center gap-4 bg-[#1a1b1c] border border-white/5 hover:border-white/20 rounded-xl px-5 py-3 transition-colors group opacity-70 hover:opacity-100"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-white/70 group-hover:text-white transition-colors text-sm">
                      {inv.client_name}
                    </span>
                    <span className="text-white/20 text-xs">·</span>
                    <span className="text-white/30 text-xs">
                      {typeLabel(inv.invoice_type)}
                      {inv.invoice_number ? ` #${inv.invoice_number}` : ""}
                    </span>
                  </div>
                  <p className="text-white/30 text-xs truncate">{inv.site_address}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-medium text-green-400/80 text-sm">{fmt$(Number(inv.total))}</p>
                  <p className="text-white/20 text-xs mt-0.5">Paid ✓</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
