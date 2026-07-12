"use client";

import { useMemo } from "react";
import {
  calcEstimateCost,
  type EstimateRoom,
  type EstimateSettings,
  type CostSummary,
} from "@/lib/estimate-engine";
import cabinetTypes from "@/data/catalogs/cabinet_types.json";

// ── Types ─────────────────────────────────────────────────────────────────────

type Estimate = {
  id: string;
  title: string;
  status: string;
  scope: string;
  is_budget_estimate: number;
  target_margin_pct: number;
  delivery_cost: number;
  tax_amount: number;
  finish_group_count: number;
  client_name: string | null;
  site_address: string | null;
  job_number: string | null;
};

type DbRoom = { id: string; name: string; sort_order: number };

type DbItem = {
  id: string;
  room_id: string;
  item_type: string;
  cabinet_type_code: string | null;
  description: string | null;
  width_in: number | null;
  height_in: number | null;
  depth_in: number | null;
  adj_shelves: number;
  qty: number;
  feature_codes: string | null;
  end_panel: number;
  unit_qty: number | null;
  unit_label: string | null;
  manual_unit_cost: number | null;
  sort_order: number;
};

type CabinetTypeEntry = { code: string; display_name: string; category: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_MAP = new Map<string, CabinetTypeEntry>(
  (cabinetTypes as CabinetTypeEntry[]).map((t) => [t.code, t])
);

function fmt$(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function today() {
  return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function itemLabel(item: DbItem): string {
  if (item.item_type === "custom") {
    return item.description ?? "Custom item";
  }
  const type = item.cabinet_type_code ? TYPE_MAP.get(item.cabinet_type_code) : null;
  const name  = type?.display_name ?? item.cabinet_type_code ?? "Cabinet";
  const dims  = item.width_in ? ` — ${item.width_in}"W` + (item.height_in ? ` x ${item.height_in}"H` : "") : "";
  return `${name}${dims}`;
}

// ── Default settings fallback ─────────────────────────────────────────────────

const DEFAULT_SETTINGS: EstimateSettings = {
  pm_hrs_base: 2, pm_hrs_per_fg: 1.5, eng_hrs_base: 1, eng_hrs_per_fg: 0.75,
  purchasing_hrs_base: 2, pm_rate: 55, eng_rate: 55, shop_rate: 25,
  finish_rate: 25, install_rate: 45, fixed_overhead_pct: 16.5, default_margin_pct: 48,
};

// ── Component ─────────────────────────────────────────────────────────────────

export function EstimateQuoteClient({
  estimate,
  rooms,
  items,
  settings: rawSettings,
}: {
  estimate: Estimate;
  rooms: DbRoom[];
  items: DbItem[];
  settings: EstimateSettings | null;
}) {
  const settings = rawSettings ?? DEFAULT_SETTINGS;

  // Build engine room structure
  const engineRooms: EstimateRoom[] = useMemo(
    () =>
      rooms.map((r) => ({
        id: r.id,
        name: r.name,
        sort_order: r.sort_order,
        items: items.filter((i) => i.room_id === r.id),
      })),
    [rooms, items]
  );

  // Full cost summary
  const cost: CostSummary = useMemo(
    () =>
      calcEstimateCost({
        rooms: engineRooms,
        settings,
        scope: estimate.scope,
        finish_group_count: estimate.finish_group_count,
        delivery_cost: estimate.delivery_cost ?? 0,
        tax_amount: estimate.tax_amount ?? 0,
        target_margin_pct: estimate.target_margin_pct,
      }),
    [engineRooms, settings, estimate]
  );

  // Per-room sell price: proportional allocation from sell_price
  // Each room gets: (room_subtotal / direct_cost_total) * sell_price
  const roomPrices = useMemo(() => {
    const total = cost.direct_cost_total;
    return cost.rooms.map((rc) => {
      const share = total > 0 ? rc.subtotal / total : 1 / cost.rooms.length;
      return Math.round(share * cost.sell_price);
    });
  }, [cost]);

  // Sum of room prices (may differ from sell_price by $1-2 due to rounding)
  const roomPriceTotal = roomPrices.reduce((a, b) => a + b, 0);

  const deliveryCost = estimate.delivery_cost ?? 0;
  const taxAmount    = estimate.tax_amount ?? 0;
  const grandTotal   = roomPriceTotal + deliveryCost + taxAmount;

  const scopeLabel = estimate.scope === "supply_install"
    ? "Supply and installation of cabinetry as specified below"
    : "Supply of cabinetry as specified below (installation by others)";

  const quoteNumber = `Q-${estimate.id.slice(-6).toUpperCase()}`;

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-page { box-shadow: none !important; }
        }
        @page { margin: 0.75in; size: letter; }
      `}</style>

      {/* Admin toolbar */}
      <div className="no-print bg-[#0d0e0f] border-b border-white/10 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a
            href={`/admin/estimating/${estimate.id}`}
            className="text-white/50 hover:text-white text-sm transition-colors"
          >
            &larr; Back to estimate
          </a>
          <span className="text-white/20">|</span>
          <span className="text-white/40 text-sm">{estimate.title} &mdash; Quote preview</span>
        </div>
        <button
          onClick={() => window.print()}
          className="bg-[#f08122] hover:bg-[#e07010] text-black font-medium text-sm px-4 py-2 rounded-lg transition-colors"
        >
          Print / Save PDF
        </button>
      </div>

      {/* Quote document */}
      <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:p-0">
        <div className="print-page max-w-3xl mx-auto bg-white shadow-lg rounded-lg overflow-hidden print:shadow-none print:rounded-none">

          {/* Header */}
          <div className="bg-[#1a1a1a] px-8 py-6 flex items-start justify-between">
            <div>
              <div className="text-[#f08122] text-xl font-bold tracking-tight">ADVANCED CUSTOM CABINETS</div>
              <div className="text-white/50 text-xs mt-1">advancedcabinets.net</div>
            </div>
            <div className="text-right">
              <div className="text-white text-lg font-semibold">PROPOSAL</div>
              <div className="text-white/50 text-xs mt-1">{quoteNumber}</div>
              <div className="text-white/50 text-xs">{today()}</div>
            </div>
          </div>

          {/* Client + project info */}
          <div className="px-8 py-5 border-b border-gray-200 grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Prepared for</div>
              <div className="text-gray-900 font-semibold text-sm">
                {estimate.client_name ?? estimate.title}
              </div>
              {estimate.site_address && (
                <div className="text-gray-500 text-sm mt-0.5">{estimate.site_address}</div>
              )}
              {estimate.job_number && (
                <div className="text-gray-400 text-xs mt-1">Job #{estimate.job_number}</div>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Scope</div>
              <div className="text-gray-700 text-sm leading-snug">{scopeLabel}</div>
              {estimate.is_budget_estimate ? (
                <div className="mt-2 inline-block text-xs bg-purple-100 text-purple-700 rounded px-2 py-0.5 font-medium">
                  Budget estimate &mdash; figures are &plusmn;15%
                </div>
              ) : null}
            </div>
          </div>

          {/* Room table */}
          <div className="px-8 pt-6 pb-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left pb-2 text-xs font-semibold text-gray-400 uppercase tracking-widest w-1/3">
                    Room / Area
                  </th>
                  <th className="text-left pb-2 text-xs font-semibold text-gray-400 uppercase tracking-widest">
                    Included
                  </th>
                  <th className="text-right pb-2 text-xs font-semibold text-gray-400 uppercase tracking-widest w-28">
                    Price
                  </th>
                </tr>
              </thead>
              <tbody>
                {cost.rooms.map((rc, i) => {
                  const roomItems = items.filter((it) => it.room_id === rc.room_id);
                  const price = roomPrices[i];
                  return (
                    <tr key={rc.room_id} className="border-b border-gray-100 align-top">
                      <td className="py-3 pr-4">
                        <div className="font-semibold text-gray-800">{rc.room_name}</div>
                        {estimate.scope === "supply_install" && (
                          <div className="text-xs text-gray-400 mt-0.5">Incl. installation</div>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <ul className="space-y-0.5">
                          {roomItems.map((it) => (
                            <li key={it.id} className="text-gray-600 text-sm leading-snug">
                              {it.qty > 1 && (
                                <span className="font-medium text-gray-800">{it.qty}&times; </span>
                              )}
                              {itemLabel(it)}
                            </li>
                          ))}
                          {roomItems.length === 0 && (
                            <li className="text-gray-400 italic">No items</li>
                          )}
                        </ul>
                      </td>
                      <td className="py-3 text-right">
                        <span className="font-semibold text-gray-900">{fmt$(price)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="px-8 pb-6 pt-2">
            <div className="ml-auto w-64">
              {deliveryCost > 0 && (
                <div className="flex justify-between text-sm text-gray-600 py-1 border-b border-gray-100">
                  <span>Delivery</span>
                  <span className="tabular-nums">{fmt$(deliveryCost)}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between text-sm text-gray-600 py-1 border-b border-gray-100">
                  <span>Tax</span>
                  <span className="tabular-nums">{fmt$(taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-gray-900 py-2 border-t-2 border-gray-300 mt-1">
                <span>Total</span>
                <span className="tabular-nums">{fmt$(grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="px-8 pb-8">
            <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-500 leading-relaxed space-y-1">
              {estimate.scope === "supply_install" && (
                <p>Installation is included in the room pricing above. All pricing covers cabinetry and hardware as specified.</p>
              )}
              {estimate.is_budget_estimate ? (
                <p><strong>Budget estimate:</strong> Actual costs may vary &plusmn;15% pending final engineering and material selection.</p>
              ) : (
                <p>This proposal is valid for 30 days from the date above. Final pricing subject to change if specifications are modified.</p>
              )}
              <p>Questions? Contact us at <span className="text-[#f08122]">advancedcabinets.net</span></p>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
