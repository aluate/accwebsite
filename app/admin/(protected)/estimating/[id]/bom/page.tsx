export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  calcEstimateCost,
  calcBOMReport,
  type EstimateLineItem,
  type EstimateRoom,
  type EstimateSettings,
} from "@/lib/estimate-engine";

export default async function BOMReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("admin");
  const { id } = await params;

  const [estimateRows, roomRows, itemRows, settingsRows] = await Promise.all([
    sql`
      SELECT e.*, j.client_name, j.site_address, j.job_number
      FROM estimates e
      LEFT JOIN jobs j ON j.id = e.job_id
      WHERE e.id = ${id}
    `,
    sql`SELECT * FROM estimate_rooms WHERE estimate_id = ${id} ORDER BY sort_order`,
    sql`
      SELECT eli.*
      FROM estimate_line_items eli
      JOIN estimate_rooms er ON er.id = eli.room_id
      WHERE er.estimate_id = ${id}
      ORDER BY eli.sort_order
    `,
    sql`SELECT * FROM estimate_settings WHERE id = 'singleton'`,
  ]);

  if (!estimateRows[0]) notFound();

  const estimate = estimateRows[0] as Record<string, unknown>;
  if (!settingsRows[0]) notFound();
  const settings = settingsRows[0] as unknown as EstimateSettings;
  const rawRooms = roomRows as Array<Record<string, unknown>>;
  const rawItems = itemRows as Array<Record<string, unknown>>;

  // Build EstimateRoom[] with items nested
  const allItems = rawItems as unknown as EstimateLineItem[];
  const rooms: EstimateRoom[] = rawRooms.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    sort_order: r.sort_order as number,
    items: allItems.filter((item) => (item as unknown as Record<string, unknown>).room_id === r.id),
  }));

  const cost = calcEstimateCost({
    rooms,
    settings,
    scope: (estimate.scope as string) ?? "supply_only",
    finish_group_count: 1,
    delivery_cost: Number(estimate.delivery_cost ?? 0),
    tax_amount: Number(estimate.tax_amount ?? 0),
    target_margin_pct: Number(estimate.target_margin_pct ?? settings.default_margin_pct),
    profile_id: estimate.profile_id as string | null,
    door_preset_id: estimate.door_preset_id as string | null,
  });

  const bom = calcBOMReport(cost, allItems);

  const jobLabel = estimate.job_number
    ? `${estimate.job_number} — ${estimate.client_name ?? ""}`
    : (estimate.client_name as string) ?? "Untitled";

  const totalSlides = bom.slides_15in + bom.slides_18in + bom.slides_21in;
  const edgebandRolls = Math.ceil(bom.edgeband_lf / 500); // 500 LF / roll typical

  return (
    <div className="max-w-4xl mx-auto p-6 print:p-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link
          href={`/admin/estimating/${id}`}
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          ← Back to estimate
        </Link>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-gray-800 text-white text-sm rounded hover:bg-gray-700"
        >
          Print / Save PDF
        </button>
      </div>

      <h1 className="text-xl font-bold mb-1">Bill of Materials</h1>
      <p className="text-sm text-gray-500 mb-6">{jobLabel}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Sheet Goods */}
        <Section title="Sheet Goods">
          <Row label="Carcass material" value={`${bom.carcass_sf.toFixed(1)} SF`} sub={`${bom.carcass_sheets} sheets (4×8, +12% waste)`} />
          <Row label="Back panels" value={`${bom.back_sf.toFixed(1)} SF`} sub={`${bom.back_sheets} sheets (4×8, +10% waste)`} />
        </Section>

        {/* Edgebanding */}
        <Section title="Edgebanding">
          <Row label="Total linear feet" value={`${bom.edgeband_lf.toFixed(1)} LF`} sub={`≈ ${edgebandRolls} roll${edgebandRolls !== 1 ? "s" : ""} @ 500 LF`} />
        </Section>

        {/* Hardware */}
        <Section title="Hardware">
          <Row label="Hinges" value={bom.hinges} />
          <Row label="Pulls / knobs" value={bom.pulls} />
          <Row label="Shelf pins" value={bom.shelf_pins} />
          {totalSlides > 0 && (
            <>
              <div className="border-t pt-2 mt-1">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Drawer slides</span>
              </div>
              {bom.slides_15in > 0 && <Row label="15″ (upper / small)" value={`${bom.slides_15in} pairs`} />}
              {bom.slides_18in > 0 && <Row label="18″ (standard)" value={`${bom.slides_18in} pairs`} />}
              {bom.slides_21in > 0 && <Row label="21″+ (base / deep)" value={`${bom.slides_21in} pairs`} />}
              <Row label="Total pairs" value={totalSlides} bold />
            </>
          )}
        </Section>

        {/* Door summary */}
        <Section title="Doors / Drawer Fronts">
          <Row label="Door face SF" value={`${bom.door_sf_total.toFixed(2)} SF`} />
          <Row label="Drawer front SF" value={`${bom.drawer_front_sf.toFixed(2)} SF`} />
          <Row label="Total buyout SF" value={`${(bom.door_sf_total + bom.drawer_front_sf).toFixed(2)} SF`} bold />
        </Section>
      </div>

      {/* Door cut list */}
      {bom.door_cuts.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600 mb-3">
            Door Cut List ({bom.door_cuts.length} units)
          </h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="border border-gray-200 px-3 py-2 font-medium">Cabinet</th>
                <th className="border border-gray-200 px-3 py-2 font-medium text-center">Doors</th>
                <th className="border border-gray-200 px-3 py-2 font-medium text-right">Width (in)</th>
                <th className="border border-gray-200 px-3 py-2 font-medium text-right">Height (in)</th>
              </tr>
            </thead>
            <tbody>
              {bom.door_cuts.map((cut, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="border border-gray-200 px-3 py-1.5">{cut.label}</td>
                  <td className="border border-gray-200 px-3 py-1.5 text-center">{cut.door_count}</td>
                  <td className="border border-gray-200 px-3 py-1.5 text-right font-mono">{cut.w_in.toFixed(2)}</td>
                  <td className="border border-gray-200 px-3 py-1.5 text-right font-mono">{cut.h_in.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bom.door_cuts.length === 0 && (
        <p className="mt-8 text-sm text-gray-400 italic">No door-bearing cabinets in this estimate.</p>
      )}
    </div>
  );
}

// ─── small helpers ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  bold,
}: {
  label: string;
  value: string | number;
  sub?: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={`text-sm text-gray-700 ${bold ? "font-semibold" : ""}`}>{label}</span>
      <span className={`text-sm text-right ${bold ? "font-bold" : "font-mono"}`}>
        {value}
        {sub && <span className="ml-1.5 text-xs text-gray-400 font-normal">{sub}</span>}
      </span>
    </div>
  );
}
