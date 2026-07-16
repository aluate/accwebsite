"use client";

/**
 * InvoicePanel — job detail panel for billing management.
 *
 * Shows all invoices for a job (draft, sent, paid, void).
 * Draft invoices: PM can edit line items, send, or void.
 * Sent invoices: PM can mark paid (enter check number/date).
 *
 * Styled to match the EstimateQuoteClient document look.
 */

import { useState, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type LineItem = {
  id: string;
  description: string;
  amount: number;
  sort_order: number;
};

type Invoice = {
  id: string;
  invoice_number: number | null;
  invoice_type: "deposit" | "balance" | "change_order" | "manual";
  status: "draft" | "sent" | "paid" | "void";
  terms: string;
  notes: string | null;
  check_number: string | null;
  check_date: string | null;
  paid_at: string | null;
  sent_at: string | null;
  created_at: string;
  change_order_id: string | null;
  co_number: number | null;
  co_title: string | null;
  line_items: LineItem[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmt$(n: number | string) {
  return Number(n).toLocaleString("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 0,
  });
}

function typeLabel(t: Invoice["invoice_type"]) {
  return { deposit: "Deposit", balance: "Balance", change_order: "Change Order", manual: "Manual" }[t] ?? t;
}

function statusBadge(status: Invoice["status"]) {
  const map: Record<string, string> = {
    draft: "bg-yellow-100 text-yellow-800",
    sent:  "bg-blue-100 text-blue-800",
    paid:  "bg-green-100 text-green-800",
    void:  "bg-gray-100 text-gray-500",
  };
  return `inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${map[status] ?? "bg-gray-100"}`;
}

function invoiceTotal(items: LineItem[]) {
  return items.reduce((s, li) => s + Number(li.amount), 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Line item editor row
// ─────────────────────────────────────────────────────────────────────────────

function LineRow({
  item, onChange, onRemove,
}: {
  item: { description: string; amount: string };
  onChange: (field: "description" | "amount", val: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex gap-2 items-center">
      <input
        className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm"
        value={item.description}
        onChange={(e) => onChange("description", e.target.value)}
        placeholder="Description"
      />
      <input
        className="w-28 border border-gray-200 rounded px-2 py-1 text-sm text-right"
        value={item.amount}
        onChange={(e) => onChange("amount", e.target.value)}
        placeholder="0.00"
        inputMode="decimal"
      />
      <button
        type="button"
        onClick={onRemove}
        className="text-gray-400 hover:text-red-500 text-lg leading-none"
        title="Remove"
      >×</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoice card — draft mode (editable)
// ─────────────────────────────────────────────────────────────────────────────

function DraftInvoiceCard({
  invoice, jobId, onRefresh,
}: { invoice: Invoice; jobId: string; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Array<{ description: string; amount: string }>>(
    invoice.line_items.map((li) => ({ description: li.description, amount: String(li.amount) }))
  );
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [terms, setTerms] = useState(invoice.terms);
  const [sendTo, setSendTo] = useState("");
  const [sendCc, setSendCc] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [showSendForm, setShowSendForm] = useState(false);

  const total = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notes || null,
          terms,
          line_items: rows.map((r, i) => ({
            description: r.description,
            amount: parseFloat(r.amount) || 0,
          })),
        }),
      });
      setEditing(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function send() {
    if (!sendTo.trim()) return;
    setSending(true);
    try {
      // Save edits first
      await fetch(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notes || null,
          terms,
          line_items: rows.map((r) => ({
            description: r.description,
            amount: parseFloat(r.amount) || 0,
          })),
        }),
      });
      const res = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: sendTo.trim(), cc: sendCc.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Failed to send invoice");
        return;
      }
      onRefresh();
    } finally {
      setSending(false);
    }
  }

  async function voidInvoice() {
    if (!confirm("Void this invoice? This cannot be undone.")) return;
    setVoiding(true);
    try {
      await fetch(`/api/invoices/${invoice.id}`, { method: "DELETE" });
      onRefresh();
    } finally {
      setVoiding(false);
    }
  }

  function updateRow(idx: number, field: "description" | "amount", val: string) {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  }

  function addRow() {
    setRows((prev) => [...prev, { description: "", amount: "" }]);
  }

  return (
    <div className="border border-yellow-200 rounded-lg bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-yellow-50 border-b border-yellow-100">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-gray-800 text-sm">
            {typeLabel(invoice.invoice_type)} Invoice
          </span>
          <span className={statusBadge(invoice.status)}>Draft</span>
        </div>
        <div className="flex gap-2 text-xs">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-blue-600 hover:underline"
            >Edit</button>
          )}
          <button
            onClick={voidInvoice}
            disabled={voiding}
            className="text-gray-400 hover:text-red-500"
          >{voiding ? "…" : "Void"}</button>
        </div>
      </div>

      {/* Line items */}
      <div className="p-4 space-y-2">
        {editing ? (
          <>
            <div className="space-y-2">
              {rows.map((row, i) => (
                <LineRow
                  key={i}
                  item={row}
                  onChange={(f, v) => updateRow(i, f, v)}
                  onRemove={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={addRow}
              className="text-xs text-blue-600 hover:underline mt-1"
            >+ Add line item</button>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Terms</label>
                <input
                  className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
                <input
                  className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <span className="text-sm font-semibold text-gray-700">Total: {fmt$(total)}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(false)}
                  className="text-xs text-gray-500 hover:underline"
                >Cancel</button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="bg-gray-800 text-white text-xs px-3 py-1.5 rounded hover:bg-gray-700"
                >{saving ? "Saving…" : "Save"}</button>
              </div>
            </div>
          </>
        ) : (
          <>
            <table className="w-full text-sm">
              <tbody>
                {invoice.line_items.map((li) => (
                  <tr key={li.id}>
                    <td className="py-1 text-gray-700">{li.description}</td>
                    <td className="py-1 text-right text-gray-800 whitespace-nowrap">{fmt$(li.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td className="pt-2 font-semibold text-gray-800">Total Due</td>
                  <td className="pt-2 text-right font-semibold text-gray-900">
                    {fmt$(invoiceTotal(invoice.line_items))}
                  </td>
                </tr>
              </tfoot>
            </table>
            {invoice.notes && (
              <p className="text-xs text-gray-500 mt-2 italic">{invoice.notes}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">Terms: {invoice.terms}</p>
          </>
        )}
      </div>

      {/* Send section */}
      {!editing && (
        <div className="px-4 pb-4">
          {showSendForm ? (
            <div className="border border-blue-100 rounded p-3 bg-blue-50 space-y-2">
              <p className="text-xs font-semibold text-blue-800">Send Invoice Email</p>
              <div className="flex gap-2">
                <input
                  className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm"
                  placeholder="To (client email)"
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                />
                <input
                  className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm"
                  placeholder="CC (optional)"
                  value={sendCc}
                  onChange={(e) => setSendCc(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowSendForm(false)}
                  className="text-xs text-gray-500 hover:underline"
                >Cancel</button>
                <button
                  onClick={send}
                  disabled={sending || !sendTo.trim()}
                  className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
                >{sending ? "Sending…" : "Send Invoice"}</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowSendForm(true)}
              className="w-full bg-[#1e3a5f] text-white text-sm py-2 rounded hover:bg-[#17304f] transition-colors"
            >Send Invoice →</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoice card — sent (mark paid)
// ─────────────────────────────────────────────────────────────────────────────

function SentInvoiceCard({
  invoice, onRefresh,
}: { invoice: Invoice; onRefresh: () => void }) {
  const [showPayForm, setShowPayForm] = useState(false);
  const [checkNumber, setCheckNumber] = useState("");
  const [checkDate, setCheckDate] = useState("");
  const [paying, setPaying] = useState(false);

  async function markPaid() {
    setPaying(true);
    try {
      await fetch(`/api/invoices/${invoice.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          check_number: checkNumber.trim() || undefined,
          check_date: checkDate || undefined,
        }),
      });
      onRefresh();
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="border border-blue-200 rounded-lg bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-gray-800 text-sm">
            Invoice #{invoice.invoice_number} — {typeLabel(invoice.invoice_type)}
          </span>
          <span className={statusBadge(invoice.status)}>Sent</span>
        </div>
        <span className="text-xs text-gray-400">
          {invoice.sent_at ? new Date(invoice.sent_at).toLocaleDateString() : ""}
        </span>
      </div>

      <div className="p-4">
        <table className="w-full text-sm">
          <tbody>
            {invoice.line_items.map((li) => (
              <tr key={li.id}>
                <td className="py-1 text-gray-700">{li.description}</td>
                <td className="py-1 text-right text-gray-800 whitespace-nowrap">{fmt$(li.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200">
              <td className="pt-2 font-semibold text-gray-800">Total Due</td>
              <td className="pt-2 text-right font-bold text-gray-900">
                {fmt$(invoiceTotal(invoice.line_items))}
              </td>
            </tr>
          </tfoot>
        </table>
        {invoice.notes && <p className="text-xs text-gray-500 mt-2 italic">{invoice.notes}</p>}
        <p className="text-xs text-gray-400 mt-1">Terms: {invoice.terms}</p>
      </div>

      <div className="px-4 pb-4">
        {showPayForm ? (
          <div className="border border-green-100 rounded p-3 bg-green-50 space-y-2">
            <p className="text-xs font-semibold text-green-800">Record Payment Received</p>
            <div className="flex gap-2">
              <input
                className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm"
                placeholder="Check # (optional)"
                value={checkNumber}
                onChange={(e) => setCheckNumber(e.target.value)}
              />
              <input
                type="date"
                className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm"
                value={checkDate}
                onChange={(e) => setCheckDate(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowPayForm(false)}
                className="text-xs text-gray-500 hover:underline"
              >Cancel</button>
              <button
                onClick={markPaid}
                disabled={paying}
                className="bg-green-600 text-white text-xs px-3 py-1.5 rounded hover:bg-green-700 disabled:opacity-50"
              >{paying ? "Saving…" : "Mark Paid"}</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowPayForm(true)}
            className="w-full border border-green-300 text-green-700 text-sm py-1.5 rounded hover:bg-green-50 transition-colors"
          >Mark as Paid</button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoice card — paid
// ─────────────────────────────────────────────────────────────────────────────

function PaidInvoiceCard({ invoice }: { invoice: Invoice }) {
  return (
    <div className="border border-green-200 rounded-lg bg-white shadow-sm overflow-hidden opacity-80">
      <div className="flex items-center justify-between px-4 py-3 bg-green-50 border-b border-green-100">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-gray-700 text-sm">
            Invoice #{invoice.invoice_number} — {typeLabel(invoice.invoice_type)}
          </span>
          <span className={statusBadge("paid")}>Paid</span>
        </div>
        <span className="text-xs text-gray-400">
          {invoice.paid_at ? new Date(invoice.paid_at).toLocaleDateString() : ""}
        </span>
      </div>
      <div className="p-4">
        <table className="w-full text-sm">
          <tbody>
            {invoice.line_items.map((li) => (
              <tr key={li.id}>
                <td className="py-0.5 text-gray-600">{li.description}</td>
                <td className="py-0.5 text-right text-gray-700">{fmt$(li.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200">
              <td className="pt-2 font-semibold text-gray-700">Total</td>
              <td className="pt-2 text-right font-semibold text-gray-800">
                {fmt$(invoiceTotal(invoice.line_items))}
              </td>
            </tr>
          </tfoot>
        </table>
        {invoice.check_number && (
          <p className="text-xs text-gray-500 mt-2">
            Check #{invoice.check_number}
            {invoice.check_date ? ` — ${new Date(invoice.check_date + "T00:00:00").toLocaleDateString()}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoice card — void
// ─────────────────────────────────────────────────────────────────────────────

function VoidInvoiceCard({ invoice }: { invoice: Invoice }) {
  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden opacity-50">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <span className="font-semibold text-gray-500 text-sm">
          {typeLabel(invoice.invoice_type)} Invoice
          {invoice.invoice_number ? ` #${invoice.invoice_number}` : ""}
        </span>
        <span className={statusBadge("void")}>Void</span>
      </div>
      <div className="p-4 text-xs text-gray-400">This invoice was voided.</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────

export function InvoicePanel({ jobId, canManage }: { jobId: string; canManage: boolean }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/invoices`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  async function createManual() {
    setCreating(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_type: "manual",
          line_items: [{ description: "Custom line item", amount: 0 }],
        }),
      });
      if (res.ok) {
        setShowNewForm(false);
        await load();
      }
    } finally {
      setCreating(false);
    }
  }

  const active = invoices.filter((i) => i.status !== "void");
  const voided = invoices.filter((i) => i.status === "void");
  const totalBilled = active.filter((i) => i.status === "sent" || i.status === "paid")
    .reduce((s, i) => s + invoiceTotal(i.line_items), 0);
  const totalPaid = active.filter((i) => i.status === "paid")
    .reduce((s, i) => s + invoiceTotal(i.line_items), 0);

  return (
    <section className="space-y-4">
      {/* Summary bar */}
      {active.length > 0 && (
        <div className="flex gap-6 text-sm bg-gray-50 rounded-lg px-4 py-3">
          <div>
            <span className="text-gray-500 text-xs block">Billed</span>
            <span className="font-semibold text-gray-800">{fmt$(totalBilled)}</span>
          </div>
          <div>
            <span className="text-gray-500 text-xs block">Received</span>
            <span className="font-semibold text-green-700">{fmt$(totalPaid)}</span>
          </div>
          <div>
            <span className="text-gray-500 text-xs block">Outstanding</span>
            <span className="font-semibold text-blue-700">{fmt$(totalBilled - totalPaid)}</span>
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>}

      {!loading && invoices.length === 0 && (
        <p className="text-sm text-gray-400 py-4 text-center">
          No invoices yet. Deposit invoice will be created automatically when the client signs.
        </p>
      )}

      {/* Active invoices */}
      {active.map((inv) => {
        if (inv.status === "draft" && canManage) {
          return <DraftInvoiceCard key={inv.id} invoice={inv} jobId={jobId} onRefresh={load} />;
        }
        if (inv.status === "sent" && canManage) {
          return <SentInvoiceCard key={inv.id} invoice={inv} onRefresh={load} />;
        }
        if (inv.status === "paid") {
          return <PaidInvoiceCard key={inv.id} invoice={inv} />;
        }
        // draft or sent, no canManage — read-only view
        return (
          <div key={inv.id} className="border border-gray-200 rounded-lg bg-white shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-semibold text-sm text-gray-800">
                {inv.invoice_number ? `Invoice #${inv.invoice_number} — ` : ""}{typeLabel(inv.invoice_type)}
              </span>
              <span className={statusBadge(inv.status)}>{inv.status}</span>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {inv.line_items.map((li) => (
                  <tr key={li.id}>
                    <td className="py-0.5 text-gray-700">{li.description}</td>
                    <td className="py-0.5 text-right">{fmt$(li.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-100">
                  <td className="pt-1 font-semibold">Total</td>
                  <td className="pt-1 text-right font-semibold">{fmt$(invoiceTotal(inv.line_items))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })}

      {/* Voided invoices (collapsed) */}
      {voided.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-400 hover:text-gray-600 select-none">
            {voided.length} voided invoice{voided.length !== 1 ? "s" : ""}
          </summary>
          <div className="mt-2 space-y-2">
            {voided.map((inv) => <VoidInvoiceCard key={inv.id} invoice={inv} />)}
          </div>
        </details>
      )}

      {/* Manual invoice button */}
      {canManage && (
        <button
          onClick={createManual}
          disabled={creating}
          className="text-xs text-gray-400 hover:text-gray-700 underline"
        >
          {creating ? "Creating…" : "+ Create manual invoice"}
        </button>
      )}
    </section>
  );
}
