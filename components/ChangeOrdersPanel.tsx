"use client";

/**
 * ChangeOrdersPanel — PM/Admin view of all COs on a job.
 *
 * - Create new CO (title + type)
 * - Add product / labor line items
 * - Send for client signature (copies URL)
 * - Void a CO
 * - Shows signed status with signer name + date
 */

import { useCallback, useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type COItem = {
  id: string;
  co_id: string;
  item_type: "product" | "labor";
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number;
  sort_order: number;
};

type CO = {
  id: string;
  co_number: number;
  title: string;
  description: string | null;
  co_type: string;
  status: "draft" | "sent" | "signed" | "voided";
  total_products: number;
  total_labor: number;
  total_amount: number;
  created_by: string | null;
  created_at: string;
  signed_at: string | null;
  signer_name: string | null;
  signoff_token: string | null;
  voided_at: string | null;
  voided_reason: string | null;
};

const CO_TYPE_LABELS: Record<string, string> = {
  client_add:      "Client addition",
  sub_replacement: "Sub replacement",
  other:           "Other",
};

const STATUS_COLOR: Record<string, string> = {
  draft:  "text-white/40 bg-white/10",
  sent:   "text-sky-300 bg-sky-900/30",
  signed: "text-green-300 bg-green-900/30",
  voided: "text-red-300/60 bg-red-900/20",
};

function fmt$(n: number) {
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// ── AddItemForm ───────────────────────────────────────────────────────────────

function AddItemForm({ coId, onAdded }: { coId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [itemType, setItemType] = useState<"product" | "labor">("product");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [total, setTotal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function calcTotal() {
    const q = parseFloat(quantity);
    const p = parseFloat(unitPrice);
    if (!isNaN(q) && !isNaN(p)) setTotal((q * p).toFixed(2));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!description.trim()) { setError("Description required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/change-orders/${coId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_type: itemType,
          description: description.trim(),
          quantity: quantity ? parseFloat(quantity) : null,
          unit: unit.trim() || null,
          unit_price: unitPrice ? parseFloat(unitPrice) : null,
          total: total ? parseFloat(total) : 0,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? "Failed to add item");
        return;
      }
      setDescription(""); setQuantity(""); setUnit(""); setUnitPrice(""); setTotal("");
      setOpen(false);
      onAdded();
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 border border-dashed border-white/10 rounded-lg py-2.5 text-white/25 hover:text-[#f08122] hover:border-[#f08122]/20 text-xs font-condensed uppercase tracking-wider transition-colors"
      >
        + Add Line Item
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#1a1a1a] border border-white/10 rounded-lg p-4 space-y-3">
      <p className="text-[10px] font-condensed uppercase tracking-widest text-[#f08122]/70">New Line Item</p>

      <div className="flex gap-2">
        {(["product", "labor"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setItemType(t)}
            className={`flex-1 py-1.5 rounded text-xs font-condensed uppercase tracking-wider transition-colors ${
              itemType === t ? "bg-[#f08122] text-black" : "bg-white/5 text-white/40 hover:bg-white/10"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={itemType === "product" ? "e.g. Upper cabinet — kitchen island" : "e.g. Install labor — island cabinets"}
        className="w-full bg-[#111] border border-white/10 rounded px-3 py-2 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#f08122]/50"
      />

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[9px] text-white/25 font-condensed uppercase tracking-wider block mb-1">Qty</label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => { setQuantity(e.target.value); }}
            onBlur={calcTotal}
            placeholder="1"
            className="w-full bg-[#111] border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/50"
          />
        </div>
        <div>
          <label className="text-[9px] text-white/25 font-condensed uppercase tracking-wider block mb-1">Unit</label>
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="ea / lf / hr"
            className="w-full bg-[#111] border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/50"
          />
        </div>
        <div>
          <label className="text-[9px] text-white/25 font-condensed uppercase tracking-wider block mb-1">Unit Price</label>
          <input
            type="number"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            onBlur={calcTotal}
            placeholder="0.00"
            className="w-full bg-[#111] border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/50"
          />
        </div>
      </div>

      <div>
        <label className="text-[9px] text-white/25 font-condensed uppercase tracking-wider block mb-1">Line Total ($)</label>
        <input
          type="number"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          placeholder="0.00"
          className="w-full bg-[#111] border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/50"
        />
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="flex-1 py-2 rounded bg-[#f08122] text-black text-xs font-condensed uppercase tracking-wider hover:bg-[#d4701e] disabled:opacity-40">
          {saving ? "Adding…" : "Add Item"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="px-4 py-2 rounded border border-white/10 text-white/40 text-xs hover:border-white/20">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── SendButton ────────────────────────────────────────────────────────────────

function SendButton({ coId, onSent }: { coId: string; onSent: () => void }) {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function handleSend() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/change-orders/${coId}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? "Failed"); return; }
      const body = await res.json();
      setUrl(body.url);
      onSent();
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }

  async function handleCopy() {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { const el = document.getElementById(`co-url-${coId}`) as HTMLInputElement; el?.select(); }
  }

  if (url) {
    return (
      <div className="mt-3 space-y-1.5">
        <p className="text-[10px] text-green-400 font-condensed uppercase tracking-wider">Signoff link ready</p>
        <div className="flex gap-2">
          <input id={`co-url-${coId}`} type="text" readOnly value={url} onFocus={(e) => e.target.select()}
            className="flex-1 bg-[#111] border border-white/10 rounded px-3 py-1.5 text-white/60 text-xs font-mono focus:outline-none" />
          <button onClick={handleCopy}
            className={`shrink-0 px-3 py-1.5 rounded text-xs font-condensed uppercase tracking-wider transition-colors ${copied ? "bg-green-700/50 text-green-300" : "bg-white/10 text-white/50 hover:bg-white/15"}`}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button onClick={handleSend} disabled={loading}
        className="px-4 py-2 rounded bg-sky-700/60 hover:bg-sky-600/70 text-sky-200 text-xs font-condensed uppercase tracking-wider transition-colors disabled:opacity-40">
        {loading ? "Generating…" : "Send for Signature"}
      </button>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}

// ── COCard ────────────────────────────────────────────────────────────────────

function COCard({
  co,
  items,
  canEdit,
  onRefresh,
}: {
  co: CO;
  items: COItem[];
  canEdit: boolean;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(co.status === "draft");
  const [voiding, setVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState("");

  const myItems = items.filter((i) => i.co_id === co.id);
  const productItems = myItems.filter((i) => i.item_type === "product");
  const laborItems   = myItems.filter((i) => i.item_type === "labor");

  async function handleDeleteItem(itemId: string) {
    await fetch(`/api/change-orders/${co.id}/items/${itemId}`, { method: "DELETE" });
    onRefresh();
  }

  async function handleVoid() {
    setVoidError("");
    const res = await fetch(`/api/change-orders/${co.id}/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: voidReason.trim() || undefined }),
    });
    if (!res.ok) { const b = await res.json().catch(() => ({})); setVoidError(b.error ?? "Failed"); return; }
    setVoiding(false);
    onRefresh();
  }

  const statusCls = STATUS_COLOR[co.status] ?? STATUS_COLOR.draft;
  const isEditable = canEdit && co.status === "draft";
  const isSent     = co.status === "sent";

  return (
    <div className={`rounded-xl border transition-colors ${co.status === "voided" ? "border-white/5 opacity-50" : "border-white/10 bg-white/3"}`}>
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <span className="font-condensed text-[#f08122] text-sm shrink-0">CO #{co.co_number}</span>
        <span className="flex-1 text-white text-sm font-medium truncate">{co.title}</span>
        <span className={`text-[10px] font-condensed uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${statusCls}`}>
          {co.status}
        </span>
        <span className="text-white font-condensed text-sm shrink-0">{fmt$(co.total_amount)}</span>
        <span className="text-white/20 text-xs shrink-0">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-3">

          {/* CO type + description */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-white/30 font-condensed uppercase tracking-wider">
              {CO_TYPE_LABELS[co.co_type] ?? co.co_type}
            </span>
            {co.created_by && (
              <span className="text-[10px] text-white/20 font-condensed">· drafted by {co.created_by}</span>
            )}
            {co.created_at && (
              <span className="text-[10px] text-white/20 font-condensed">· {fmtDate(co.created_at)}</span>
            )}
          </div>
          {co.description && (
            <p className="text-white/50 text-sm leading-snug">{co.description}</p>
          )}

          {/* Signed state */}
          {co.status === "signed" && co.signer_name && (
            <div className="bg-green-900/20 border border-green-700/30 rounded-lg px-3 py-2">
              <p className="text-green-400 text-xs font-condensed">
                ✓ Signed by {co.signer_name}
                {co.signed_at ? ` on ${fmtDate(co.signed_at)}` : ""}
              </p>
            </div>
          )}

          {/* Products section */}
          {(productItems.length > 0 || isEditable) && (
            <div>
              <p className="text-[10px] font-condensed uppercase tracking-widest text-white/30 mb-2">Products</p>
              {productItems.length === 0 && (
                <p className="text-white/20 text-xs italic mb-1">None added</p>
              )}
              <div className="space-y-1">
                {productItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm text-white/70">
                    <span className="flex-1 truncate">{item.description}</span>
                    {item.quantity !== null && item.unit && (
                      <span className="text-white/30 text-xs shrink-0">{item.quantity} {item.unit}</span>
                    )}
                    <span className="font-condensed shrink-0">{fmt$(item.total)}</span>
                    {isEditable && (
                      <button onClick={() => handleDeleteItem(item.id)}
                        className="text-white/15 hover:text-red-400 text-xs transition-colors shrink-0">✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Labor section */}
          {(laborItems.length > 0 || isEditable) && (
            <div>
              <p className="text-[10px] font-condensed uppercase tracking-widest text-white/30 mb-2">Labor</p>
              {laborItems.length === 0 && (
                <p className="text-white/20 text-xs italic mb-1">None added</p>
              )}
              <div className="space-y-1">
                {laborItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm text-white/70">
                    <span className="flex-1 truncate">{item.description}</span>
                    {item.quantity !== null && item.unit && (
                      <span className="text-white/30 text-xs shrink-0">{item.quantity} {item.unit}</span>
                    )}
                    <span className="font-condensed shrink-0">{fmt$(item.total)}</span>
                    {isEditable && (
                      <button onClick={() => handleDeleteItem(item.id)}
                        className="text-white/15 hover:text-red-400 text-xs transition-colors shrink-0">✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Totals */}
          {co.total_amount > 0 && (
            <div className="border-t border-white/10 pt-3 space-y-1">
              {co.total_products > 0 && (
                <div className="flex justify-between text-xs text-white/40 font-condensed">
                  <span>Products</span><span>{fmt$(co.total_products)}</span>
                </div>
              )}
              {co.total_labor > 0 && (
                <div className="flex justify-between text-xs text-white/40 font-condensed">
                  <span>Labor</span><span>{fmt$(co.total_labor)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-white font-condensed font-medium pt-1 border-t border-white/10">
                <span>Total</span><span>{fmt$(co.total_amount)}</span>
              </div>
            </div>
          )}

          {/* Add item form (draft only) */}
          {isEditable && <AddItemForm coId={co.id} onAdded={onRefresh} />}

          {/* Send for signature (draft only) */}
          {isEditable && co.status === "draft" && canEdit && (
            <SendButton coId={co.id} onSent={onRefresh} />
          )}

          {/* Resend link if sent but not yet signed */}
          {isSent && canEdit && (
            <SendButton coId={co.id} onSent={onRefresh} />
          )}

          {/* Void */}
          {canEdit && (co.status === "draft" || co.status === "sent") && (
            <div className="pt-2 border-t border-white/5">
              {!voiding ? (
                <button onClick={() => setVoiding(true)}
                  className="text-[10px] text-white/20 hover:text-red-400 font-condensed uppercase tracking-wider transition-colors">
                  Void CO
                </button>
              ) : (
                <div className="space-y-2">
                  <input type="text" value={voidReason} onChange={(e) => setVoidReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="w-full bg-[#111] border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none" />
                  {voidError && <p className="text-red-400 text-xs">{voidError}</p>}
                  <div className="flex gap-2">
                    <button onClick={handleVoid}
                      className="px-4 py-1.5 rounded bg-red-900/50 hover:bg-red-800/60 text-red-300 text-xs font-condensed uppercase tracking-wider">
                      Confirm Void
                    </button>
                    <button onClick={() => setVoiding(false)}
                      className="px-4 py-1.5 rounded border border-white/10 text-white/40 text-xs">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Voided note */}
          {co.status === "voided" && co.voided_at && (
            <p className="text-red-400/60 text-xs font-condensed">
              Voided {fmtDate(co.voided_at)}{co.voided_reason ? ` — ${co.voided_reason}` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── CreateCOForm ──────────────────────────────────────────────────────────────

function CreateCOForm({ jobId, onCreated }: { jobId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [coType, setCoType] = useState("client_add");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) { setError("Title required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/change-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), co_type: coType, description: description.trim() || undefined }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? "Failed"); return; }
      setTitle(""); setCoType("client_add"); setDescription("");
      setOpen(false);
      onCreated();
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 border border-dashed border-white/15 rounded-xl py-3 text-white/30 hover:text-[#f08122] hover:border-[#f08122]/30 text-sm font-condensed uppercase tracking-wider transition-colors">
        + New Change Order
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#1e1e1e] border border-white/10 rounded-xl p-4 space-y-3">
      <p className="text-[#f08122] font-condensed uppercase tracking-widest text-xs">New Change Order</p>

      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Kitchen island addition"
        className="w-full bg-[#111] border border-white/10 rounded px-3 py-2 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#f08122]/50" />

      <select value={coType} onChange={(e) => setCoType(e.target.value)}
        className="w-full bg-[#111] border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/50">
        <option value="client_add">Client addition</option>
        <option value="sub_replacement">Sub replacement</option>
        <option value="other">Other</option>
      </select>

      <textarea value={description} onChange={(e) => setDescription(e.target.value)}
        placeholder="Brief description (optional)"
        rows={2}
        className="w-full bg-[#111] border border-white/10 rounded px-3 py-2 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#f08122]/50 resize-none" />

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="flex-1 py-2 rounded-lg bg-[#f08122] text-black text-sm font-condensed uppercase tracking-wider hover:bg-[#d4701e] disabled:opacity-40">
          {saving ? "Creating…" : "Create CO"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="px-4 py-2 rounded-lg border border-white/10 text-white/40 text-sm hover:border-white/20">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── ChangeOrdersPanel ─────────────────────────────────────────────────────────

export function ChangeOrdersPanel({
  jobId,
  role,
}: {
  jobId: string;
  role: "admin" | "pm" | "engineer" | "shop" | "installer";
}) {
  const [cos, setCos] = useState<CO[]>([]);
  const [items, setItems] = useState<COItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canEdit = role === "admin" || role === "pm";

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/change-orders`, { cache: "no-store" });
      if (!res.ok) { setError("Failed to load change orders"); return; }
      const body = await res.json();
      setCos(body.cos ?? []);
      setItems(body.items ?? []);
    } catch { setError("Failed to load change orders"); }
    finally { setLoading(false); }
  }, [jobId]);

  useEffect(() => { refresh(); }, [refresh]);

  const activeCOs  = cos.filter((c) => c.status !== "voided");
  const voidedCOs  = cos.filter((c) => c.status === "voided");
  const totalSigned = activeCOs.filter((c) => c.status === "signed").reduce((s, c) => s + Number(c.total_amount), 0);

  if (loading) {
    return <div className="py-6 text-center text-white/20 text-sm font-condensed uppercase tracking-wider">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs">Change Orders</p>
        {activeCOs.length > 0 && (
          <div className="flex gap-3 text-xs text-white/30 font-condensed uppercase tracking-wider">
            <span>{activeCOs.length} active</span>
            {totalSigned > 0 && <><span>·</span><span>{fmt$(totalSigned)} signed</span></>}
          </div>
        )}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {canEdit && <CreateCOForm jobId={jobId} onCreated={refresh} />}

      {cos.length === 0 && (
        <div className="text-center py-6 text-white/15 text-sm">
          No change orders yet.{canEdit && " Create one above."}
        </div>
      )}

      {/* Active COs */}
      <div className="space-y-2">
        {activeCOs.map((co) => (
          <COCard key={co.id} co={co} items={items} canEdit={canEdit} onRefresh={refresh} />
        ))}
      </div>

      {/* Voided COs — collapsed */}
      {voidedCOs.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[10px] font-condensed uppercase tracking-[0.2em] text-white/20 hover:text-white/40 transition-colors list-none flex items-center gap-2">
            <span className="transition-transform inline-block">▶</span>
            {voidedCOs.length} voided
          </summary>
          <div className="mt-2 space-y-2">
            {voidedCOs.map((co) => (
              <COCard key={co.id} co={co} items={items} canEdit={false} onRefresh={refresh} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
