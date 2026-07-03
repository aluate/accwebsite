"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  calcEstimateCost,
  type EstimateRoom,
  type EstimateLineItem,
  type EstimateSettings,
  type CabinetType,
  type CabinetFeature,
} from "@/lib/estimate-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

type Estimate = {
  id: string;
  title: string;
  status: string;
  scope: string;
  delivery_cost: number;
  tax_amount: number;
  is_budget_estimate: number;
  target_margin_pct: number;
  finish_group_count: number;
  notes: string | null;
  client_name: string | null;
};

type DbRoom = { id: string; estimate_id: string; name: string; sort_order: number };
type DbItem = EstimateLineItem & { room_id: string };

type Job = { id: string; client_name: string; site_address: string | null; job_number: string | null };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return "$" + Math.round(n).toLocaleString();
}

function pct(n: number) {
  return n.toFixed(1) + "%";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-0.5">
      {children}
    </label>
  );
}

function Inp({
  value, onChange, type = "text", placeholder, className = "", title,
}: {
  value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string; className?: string; title?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      title={title}
      className={`bg-[#0d0e0f] border border-white/15 rounded-lg px-2 py-1.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#f08122]/60 w-full ${className}`}
    />
  );
}

// ─── Feature chips for a single line item ────────────────────────────────────

function FeatureChips({
  codes,
  features,
  cabinetTypeCode,
  onChange,
}: {
  codes: string[];
  features: CabinetFeature[];
  cabinetTypeCode: string | null;
  onChange: (codes: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const applicable = features.filter((f) => {
    if (!cabinetTypeCode || !f.applies_to) return true;
    // applies_to is semicolon-delimited category list
    const cats = (f.applies_to as unknown as string).split(";");
    return cats.length === 0 || cats.includes("") || true; // show all for now
  });

  function toggle(code: string) {
    if (codes.includes(code)) {
      onChange(codes.filter((c) => c !== code));
    } else {
      onChange([...codes, code]);
    }
  }

  return (
    <div className="relative flex flex-wrap gap-1 items-center">
      {codes.map((code) => {
        const f = features.find((x) => x.code === code);
        return (
          <span
            key={code}
            onClick={() => toggle(code)}
            className="text-[10px] px-2 py-0.5 rounded-full bg-[#f08122]/20 border border-[#f08122]/40 text-[#f08122] cursor-pointer hover:bg-[#f08122]/30"
          >
            {f?.name ?? code} ✕
          </span>
        );
      })}
      <button
        onClick={() => setOpen((p) => !p)}
        className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-white/20 text-white/40 hover:border-white/40 hover:text-white/60"
      >
        + feature
      </button>
      {open && (
        <div className="absolute top-6 left-0 z-50 bg-[#1a1b1c] border border-white/20 rounded-xl shadow-xl w-64 max-h-64 overflow-y-auto p-2">
          {applicable.map((f) => (
            <button
              key={f.code}
              onClick={() => { toggle(f.code); setOpen(false); }}
              className={`w-full text-left text-xs px-3 py-2 rounded-lg mb-0.5 transition-colors ${
                codes.includes(f.code)
                  ? "bg-[#f08122]/20 text-[#f08122]"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <div className="font-medium">{f.name}</div>
              <div className="text-[10px] text-white/30 mt-0.5">{f.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Single cabinet row ───────────────────────────────────────────────────────

function CabinetRow({
  item,
  cabinetTypes,
  cabinetFeatures,
  onUpdate,
  onDelete,
}: {
  item: DbItem;
  cabinetTypes: CabinetType[];
  cabinetFeatures: CabinetFeature[];
  onUpdate: (id: string, patch: Partial<DbItem>) => void;
  onDelete: (id: string) => void;
}) {
  const type = cabinetTypes.find((t) => t.code === item.cabinet_type_code);
  const featureCodes: string[] = item.feature_codes ? JSON.parse(item.feature_codes) : [];

  function update(patch: Partial<DbItem>) {
    onUpdate(item.id, patch);
  }

  const defaultHeight =
    type?.category === "UPPER" ? 36
    : type?.category === "TALL" ? 84
    : 34.5;

  const defaultDepth =
    type?.category === "UPPER" || type?.category === "CORNER_UPPER" ? 12 : 24;

  const isCustom = item.item_type === "custom";

  return (
    <div className="border-b border-white/5 last:border-0">
      {/* Main row */}
      <div className="grid items-center gap-2 px-4 py-2.5"
        style={{ gridTemplateColumns: "2fr 62px 62px 54px 44px 44px 1fr 72px 28px" }}
      >
        {/* Type */}
        {isCustom ? (
          <Inp
            value={item.description ?? ""}
            onChange={(v) => update({ description: v })}
            placeholder="Custom item description"
          />
        ) : (
          <select
            value={item.cabinet_type_code ?? ""}
            onChange={(e) => {
              const ct = cabinetTypes.find((t) => t.code === e.target.value);
              update({
                cabinet_type_code: e.target.value || null,
                adj_shelves: ct?.adj_shelves ?? 1,
              });
            }}
            className="bg-[#0d0e0f] border border-white/15 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122]/60 w-full"
          >
            <option value="">— Select type —</option>
            {["BASE", "UPPER", "TALL", "PANEL", "FILLER", "SHELF", "ACCESSORY"].map((cat) => (
              <optgroup key={cat} label={cat}>
                {cabinetTypes
                  .filter((t) => t.category === cat)
                  .map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.display_name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        )}

        {/* Width */}
        <Inp
          type="number"
          value={item.width_in ?? ""}
          onChange={(v) => update({ width_in: parseFloat(v) || null })}
          placeholder="W"
          className="text-center"
        />

        {/* Height */}
        <Inp
          type="number"
          value={item.height_in ?? defaultHeight}
          onChange={(v) => update({ height_in: parseFloat(v) || null })}
          placeholder="H"
          className="text-center"
        />

        {/* Depth -- drives slide size (<=12"=15" slide, <=18"=18" slide, >18"=21" slide) */}
        <Inp
          type="number"
          value={item.depth_in ?? defaultDepth}
          onChange={(v) => update({ depth_in: parseFloat(v) || null })}
          placeholder={String(defaultDepth)}
          className={`text-center ${!item.depth_in ? "opacity-40" : ""}`}
          title={`Cabinet depth (default ${defaultDepth}"). Drives drawer slide size selection.`}
        />

        {/* Shelves */}
        <Inp
          type="number"
          value={item.adj_shelves ?? 1}
          onChange={(v) => update({ adj_shelves: parseInt(v) || 0 })}
          placeholder="Sh"
          className="text-center"
        />

        {/* Qty */}
        <Inp
          type="number"
          value={item.qty ?? 1}
          onChange={(v) => update({ qty: parseInt(v) || 1 })}
          placeholder="Qty"
          className="text-center"
        />

        {/* Features + end panel */}
        <div className="flex flex-col gap-1">
          <FeatureChips
            codes={featureCodes}
            features={cabinetFeatures}
            cabinetTypeCode={item.cabinet_type_code}
            onChange={(codes) => update({ feature_codes: JSON.stringify(codes) })}
          />
          {!isCustom && (
            <button
              onClick={() => update({ end_panel: item.end_panel ? 0 : 1 })}
              className={`self-start text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                item.end_panel
                  ? "bg-[#f08122]/20 border-[#f08122]/40 text-[#f08122]"
                  : "border-dashed border-white/15 text-white/30 hover:border-white/30"
              }`}
            >
              {item.end_panel ? "✓ End panel" : "+ End panel"}
            </button>
          )}
        </div>

        {/* Row total placeholder — computed in summary */}
        <div className="text-right text-xs text-white/30 tabular-nums">—</div>

        {/* Delete */}
        <button
          onClick={() => onDelete(item.id)}
          className="text-white/20 hover:text-red-400 text-center transition-colors text-sm"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ─── Room card ────────────────────────────────────────────────────────────────

function RoomCard({
  room,
  items,
  cabinetTypes,
  cabinetFeatures,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  onRenameRoom,
  onDeleteRoom,
}: {
  room: DbRoom;
  items: DbItem[];
  cabinetTypes: CabinetType[];
  cabinetFeatures: CabinetFeature[];
  onUpdateItem: (id: string, patch: Partial<DbItem>) => void;
  onDeleteItem: (id: string) => void;
  onAddItem: (roomId: string, type: string) => void;
  onRenameRoom: (id: string, name: string) => void;
  onDeleteRoom: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(room.name);

  return (
    <div className="bg-[#1a1b1c] border border-white/10 rounded-xl mb-3 overflow-hidden">
      {/* Room header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#141516] border-b border-white/8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCollapsed((p) => !p)}
            className="text-white/40 text-xs hover:text-white/70"
          >
            {collapsed ? "▸" : "▾"}
          </button>
          {editingName ? (
            <input
              autoFocus
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              onBlur={() => { setEditingName(false); onRenameRoom(room.id, nameVal); }}
              onKeyDown={(e) => { if (e.key === "Enter") { setEditingName(false); onRenameRoom(room.id, nameVal); } }}
              className="bg-transparent border-b border-[#f08122]/60 text-white text-sm font-medium outline-none px-0"
            />
          ) : (
            <span
              className="text-sm font-medium text-white cursor-text hover:text-[#f08122] transition-colors"
              onDoubleClick={() => setEditingName(true)}
            >
              {room.name}
            </span>
          )}
          <span className="text-xs text-white/30">{items.length} item{items.length !== 1 ? "s" : ""}</span>
        </div>
        <button
          onClick={() => onDeleteRoom(room.id)}
          className="text-white/20 hover:text-red-400 text-xs transition-colors"
        >
          Remove room
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Column headers */}
          <div
            className="grid text-[10px] text-white/30 uppercase tracking-widest font-condensed px-4 py-1.5 border-b border-white/5"
            style={{ gridTemplateColumns: "2fr 62px 62px 54px 44px 44px 1fr 72px 28px" }}
          >
            <div>Type</div>
            <div className="text-center">Width (in)</div>
            <div className="text-center">Height (in)</div>
            <div className="text-center">Depth (in)</div>
            <div className="text-center">Shlvs</div>
            <div className="text-center">Qty</div>
            <div>Features</div>
            <div className="text-right">Cost</div>
            <div />
          </div>

          {/* Cabinet rows */}
          {items.map((item) => (
            <CabinetRow
              key={item.id}
              item={item}
              cabinetTypes={cabinetTypes}
              cabinetFeatures={cabinetFeatures}
              onUpdate={onUpdateItem}
              onDelete={onDeleteItem}
            />
          ))}

          {/* Add row */}
          <div className="flex gap-2 px-4 py-2.5 border-t border-white/5">
            <button
              onClick={() => onAddItem(room.id, "cabinet")}
              className="text-xs text-[#f08122]/80 hover:text-[#f08122] transition-colors"
            >
              + Add cabinet row
            </button>
            <span className="text-white/15">·</span>
            <button
              onClick={() => onAddItem(room.id, "custom")}
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              + Custom line item
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Cost summary panel ───────────────────────────────────────────────────────

function CostSummaryPanel({
  rooms,
  settings,
  scope,
  finishGroupCount,
  deliveryCost,
  taxAmount,
  marginPct,
  isBudget,
  onMarginChange,
}: {
  rooms: EstimateRoom[];
  settings: EstimateSettings;
  scope: string;
  finishGroupCount: number;
  deliveryCost: number;
  taxAmount: number;
  marginPct: number;
  isBudget: boolean;
  onMarginChange: (v: number) => void;
}) {
  const cost = useMemo(
    () =>
      calcEstimateCost({
        rooms,
        settings,
        scope,
        finish_group_count: finishGroupCount,
        delivery_cost: deliveryCost,
        tax_amount: taxAmount,
        target_margin_pct: marginPct,
      }),
    [rooms, settings, scope, finishGroupCount, deliveryCost, taxAmount, marginPct]
  );

  const Row = ({ label, val, muted = false, bold = false }: { label: string; val: string; muted?: boolean; bold?: boolean }) => (
    <div className={`flex justify-between py-1 text-sm ${bold ? "font-semibold text-white border-t border-white/10 mt-1 pt-2" : muted ? "text-white/40" : "text-white/70"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{val}</span>
    </div>
  );

  return (
    <div className="bg-[#1a1b1c] border border-white/10 rounded-xl p-5 sticky top-4">
      <h3 className="text-sm font-medium text-white/60 mb-4 uppercase tracking-widest font-condensed">Cost Summary</h3>

      {isBudget && (
        <div className="mb-3 text-xs text-purple-300 bg-purple-900/20 border border-purple-400/20 rounded-lg px-3 py-2">
          Budget estimate — figures are ±15%
        </div>
      )}

      <div className="mb-4">
        <div className="text-[10px] text-white/30 uppercase tracking-widest font-condensed mb-2">Direct costs</div>
        <Row label="Materials" val={fmt$(cost.total_material)} />
        <Row label="Hardware" val={fmt$(cost.total_hardware)} />
        <Row label="Shop labor" val={fmt$(cost.total_shop_labor)} />
        <Row label="Finish labor" val={fmt$(cost.total_finish_labor)} />
        {scope === "supply_install" && (
          <Row label="Install labor" val={fmt$(cost.total_install_labor)} />
        )}
        <Row label="Delivery" val={fmt$(cost.total_delivery)} muted={cost.total_delivery === 0} />
      </div>

      <div className="mb-4">
        <div className="text-[10px] text-white/30 uppercase tracking-widest font-condensed mb-2">Overhead</div>
        <Row label={`PM (${cost.pm_hours.toFixed(1)} hrs)`} val={fmt$(cost.pm_hours * settings.pm_rate)} muted />
        <Row label={`Eng (${cost.eng_hours.toFixed(1)} hrs)`} val={fmt$(cost.eng_hours * settings.eng_rate)} muted />
        <Row label="Fixed overhead" val={fmt$(cost.fixed_overhead_cost)} muted />
      </div>

      <Row label="Total cost to us" val={fmt$(cost.total_cost)} bold />

      <div className="mt-4 mb-3">
        <div className="text-[10px] text-white/30 uppercase tracking-widest font-condensed mb-2">Target margin</div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={20}
            max={70}
            value={marginPct}
            onChange={(e) => onMarginChange(parseFloat(e.target.value))}
            className="flex-1 accent-[#f08122]"
          />
          <span className="text-sm font-medium text-[#f08122] w-10 text-right tabular-nums">
            {pct(marginPct)}
          </span>
        </div>
        <div className="text-xs text-white/30 mt-1">
          = {pct((marginPct / (100 - marginPct)) * 100)} markup
        </div>
      </div>

      <div className="border-t border-white/10 pt-3 mt-3">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-sm text-white/60">Sell price</span>
          <span className="text-xl font-semibold text-white tabular-nums">{fmt$(cost.sell_price)}</span>
        </div>
        {taxAmount > 0 && (
          <>
            <div className="flex justify-between text-xs text-white/40 mb-1">
              <span>+ Tax</span><span className="tabular-nums">{fmt$(taxAmount)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold text-[#f08122]">
              <span>Total with tax</span>
              <span className="tabular-nums">{fmt$(cost.sell_price_with_tax)}</span>
            </div>
          </>
        )}
      </div>

      {(cost.has_manual_items || cost.has_very_high_complexity) && (
        <div className="mt-3 text-xs text-yellow-300 bg-yellow-900/20 border border-yellow-400/20 rounded-lg px-3 py-2">
          {cost.has_very_high_complexity && <div>⚠ Complex items need manual review</div>}
          {cost.has_manual_items && <div>⚠ Custom items use entered costs only</div>}
        </div>
      )}
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export function EstimateEditorClient({
  estimate: initialEstimate,
  rooms: initialRooms,
  items: initialItems,
  settings: initialSettings,
  jobs,
  cabinetTypes,
  cabinetFeatures,
}: {
  estimate: Estimate;
  rooms: DbRoom[];
  items: DbItem[];
  settings: EstimateSettings | null;
  jobs: Job[];
  cabinetTypes: CabinetType[];
  cabinetFeatures: CabinetFeature[];
}) {
  const router = useRouter();

  // Local state — all edits are local until saved
  const [estimate, setEstimate] = useState(initialEstimate);
  const [rooms, setRooms] = useState(initialRooms);
  const [items, setItems] = useState(initialItems);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const settings: EstimateSettings = initialSettings ?? {
    pm_hrs_base: 2, pm_hrs_per_fg: 1.5, eng_hrs_base: 1, eng_hrs_per_fg: 0.75,
    purchasing_hrs_base: 2, pm_rate: 55, eng_rate: 55, shop_rate: 25,
    finish_rate: 25, install_rate: 45, fixed_overhead_pct: 16.5, default_margin_pct: 48,
  };

  // Build EstimateRoom array for cost engine
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

  // ── Mutations ──────────────────────────────────────────────────────────────

  function updateEstimate(patch: Partial<Estimate>) {
    setEstimate((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }

  function updateItem(id: string, patch: Partial<DbItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    setDirty(true);
  }

  async function deleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setDirty(true);
    await fetch(`/api/estimates/${estimate.id}/items/${id}`, { method: "DELETE" });
  }

  async function addItem(roomId: string, type: string) {
    const res = await fetch(`/api/estimates/${estimate.id}/rooms/${roomId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_type: type, qty: 1, adj_shelves: 1 }),
    });
    const { id } = await res.json();
    const newItem: DbItem = {
      id, room_id: roomId, item_type: type,
      cabinet_type_code: null, description: null,
      width_in: null, height_in: null, depth_in: null,
      adj_shelves: 1, qty: 1, feature_codes: null,
      end_panel: 0, unit_qty: null, unit_label: null, manual_unit_cost: null,
      sort_order: items.filter((i) => i.room_id === roomId).length,
    };
    setItems((prev) => [...prev, newItem]);
    setDirty(true);
  }

  async function addRoom() {
    const name = prompt("Room name:");
    if (!name?.trim()) return;
    const res = await fetch(`/api/estimates/${estimate.id}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const { id } = await res.json();
    setRooms((prev) => [...prev, { id, estimate_id: estimate.id, name: name.trim(), sort_order: prev.length }]);
  }

  async function renameRoom(id: string, name: string) {
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
    await fetch(`/api/estimates/${estimate.id}/rooms/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  async function deleteRoom(id: string) {
    if (!confirm("Remove this room and all its items?")) return;
    setRooms((prev) => prev.filter((r) => r.id !== id));
    setItems((prev) => prev.filter((i) => i.room_id !== id));
    await fetch(`/api/estimates/${estimate.id}/rooms/${id}`, { method: "DELETE" });
    setDirty(true);
  }

  // ── Save all ───────────────────────────────────────────────────────────────

  const save = useCallback(async () => {
    setSaving(true);
    try {
      // Save estimate header
      await fetch(`/api/estimates/${estimate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(estimate),
      });

      // Save all dirty items
      await Promise.all(
        items.map((item) =>
          fetch(`/api/estimates/${estimate.id}/items/${item.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item),
          })
        )
      );

      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [estimate, items]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0d0e0f] text-white">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-[#0d0e0f]/95 backdrop-blur border-b border-white/8 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/admin/estimating")}
            className="text-white/40 hover:text-white text-sm transition-colors"
          >
            ← Estimates
          </button>
          <input
            value={estimate.title}
            onChange={(e) => updateEstimate({ title: e.target.value })}
            className="text-lg font-medium bg-transparent border-0 outline-none text-white placeholder-white/30 focus:text-[#f08122]"
            placeholder="Estimate title"
          />
          {estimate.is_budget_estimate ? (
            <span className="text-xs px-2 py-0.5 rounded-full border text-purple-300 bg-purple-900/30 border-purple-400/30">
              Budget ±15%
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs text-yellow-400/70">Unsaved changes</span>}
          <button
            onClick={save}
            disabled={saving}
            className="bg-[#f08122] hover:bg-[#e07010] disabled:opacity-40 text-black font-medium text-sm px-4 py-1.5 rounded-lg transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="px-6 py-6 max-w-7xl mx-auto">
        {/* Scope / delivery / tax bar */}
        <div className="flex flex-wrap items-center gap-4 mb-5 p-4 bg-[#1a1b1c] border border-white/10 rounded-xl">
          {/* Scope toggle */}
          <div className="flex items-center gap-2">
            <Label>Scope</Label>
            <div className="flex rounded-lg overflow-hidden border border-white/15 ml-2">
              {["supply_install", "supply_only"].map((s) => (
                <button
                  key={s}
                  onClick={() => updateEstimate({ scope: s })}
                  className={`text-xs px-3 py-1.5 transition-colors ${
                    estimate.scope === s
                      ? "bg-[#f08122] text-black font-medium"
                      : "text-white/50 hover:text-white"
                  }`}
                >
                  {s === "supply_install" ? "Supply + Install" : "Supply only"}
                </button>
              ))}
            </div>
          </div>

          {/* Finish groups */}
          <div>
            <Label>Finish groups</Label>
            <input
              type="number"
              min={1}
              max={6}
              value={estimate.finish_group_count}
              onChange={(e) => updateEstimate({ finish_group_count: parseInt(e.target.value) || 1 })}
              className="w-14 bg-[#0d0e0f] border border-white/15 rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-[#f08122]/60"
            />
          </div>

          {/* Delivery */}
          <div>
            <Label>Delivery ($)</Label>
            <input
              type="number"
              value={estimate.delivery_cost}
              onChange={(e) => updateEstimate({ delivery_cost: parseFloat(e.target.value) || 0 })}
              className="w-24 bg-[#0d0e0f] border border-white/15 rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-[#f08122]/60"
            />
          </div>

          {/* Tax */}
          <div>
            <Label>Tax ($)</Label>
            <input
              type="number"
              value={estimate.tax_amount}
              onChange={(e) => updateEstimate({ tax_amount: parseFloat(e.target.value) || 0 })}
              className="w-24 bg-[#0d0e0f] border border-white/15 rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-[#f08122]/60"
            />
          </div>

          {/* Budget toggle */}
          <label className="flex items-center gap-2 text-sm text-white/50 cursor-pointer ml-auto">
            <input
              type="checkbox"
              checked={!!estimate.is_budget_estimate}
              onChange={(e) => updateEstimate({ is_budget_estimate: e.target.checked ? 1 : 0 })}
              className="rounded accent-[#f08122]"
            />
            Budget estimate (±15%)
          </label>
        </div>

        <div className="grid grid-cols-[1fr_280px] gap-5">
          {/* Left: rooms */}
          <div>
            {rooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                items={items.filter((i) => i.room_id === room.id)}
                cabinetTypes={cabinetTypes}
                cabinetFeatures={cabinetFeatures}
                onUpdateItem={updateItem}
                onDeleteItem={deleteItem}
                onAddItem={addItem}
                onRenameRoom={renameRoom}
                onDeleteRoom={deleteRoom}
              />
            ))}

            <button
              onClick={addRoom}
              className="w-full mt-1 border border-dashed border-white/15 hover:border-[#f08122]/40 text-white/40 hover:text-[#f08122]/80 rounded-xl py-3 text-sm transition-colors"
            >
              + Add room
            </button>
          </div>

          {/* Right: cost summary */}
          <CostSummaryPanel
            rooms={engineRooms}
            settings={settings}
            scope={estimate.scope}
            finishGroupCount={estimate.finish_group_count}
            deliveryCost={estimate.delivery_cost}
            taxAmount={estimate.tax_amount}
            marginPct={estimate.target_margin_pct}
            isBudget={!!estimate.is_budget_estimate}
            onMarginChange={(v) => updateEstimate({ target_margin_pct: v })}
          />
        </div>
      </div>
    </div>
  );
}
