"use client";

import { useState, useRef, useCallback } from "react";
import { calcDoorPrice } from "@/lib/door-calc";
import type { DoorCatalog, DoorType } from "@/lib/catalogs";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DoorItem = {
  id: string;
  door_type: string;
  size_nom: string;
  core: "hollow" | "solid";
  species: string;
  swing: "left" | "right" | "none";
  hardware: "none" | "passage" | "privacy" | "dummy";
  bore: boolean;
  hinge_prep: boolean;
  qty: number;
  unit_price: number;
  price_override: boolean;
  notes: string;
  sort_order: number;
};

type Props = {
  specId: string;
  jobId: string;
  initialItems: DoorItem[];
  initialNotes: string;
  catalog: DoorCatalog;
  lastSaved: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SPECIES_OPTIONS = [
  { value: "paint_grade",  label: "Paint Grade" },
  { value: "knotty_alder", label: "Knotty Alder" },
  { value: "clear_alder",  label: "Clear Alder" },
  { value: "knotty_pine",  label: "Knotty Pine" },
];

const CORE_OPTIONS = [
  { value: "hollow", label: "Hollow" },
  { value: "solid",  label: "Solid" },
];

const SWING_OPTIONS = [
  { value: "left",  label: "LH" },
  { value: "right", label: "RH" },
  { value: "none",  label: "—" },
];

const HARDWARE_OPTIONS = [
  { value: "none",    label: "None" },
  { value: "passage", label: "Passage" },
  { value: "privacy", label: "Privacy" },
  { value: "dummy",   label: "Dummy" },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function newItem(catalog: DoorCatalog, sort_order: number): DoorItem {
  const firstType = catalog.door_types[1]; // interior_prehung as default
  const firstSize = catalog.sizes[firstType.id]?.[2]?.nom ?? "2/6×6/8"; // 2/6×6/8
  const price = calcDoorPrice(catalog, firstType.id, firstSize, "hollow", "paint_grade", "none");
  return {
    id:             uid(),
    door_type:      firstType.id,
    size_nom:       firstSize,
    core:           "hollow",
    species:        "paint_grade",
    swing:          "none",
    hardware:       "none",
    bore:           true,
    hinge_prep:     true,
    qty:            1,
    unit_price:     price,
    price_override: false,
    notes:          "",
    sort_order,
  };
}

// ─── Row component ────────────────────────────────────────────────────────────

function DoorRow({
  item,
  catalog,
  onChange,
  onRemove,
}: {
  item: DoorItem;
  catalog: DoorCatalog;
  onChange: (updated: DoorItem) => void;
  onRemove: () => void;
}) {
  const typeInfo: DoorType | undefined = catalog.door_types.find((t) => t.id === item.door_type);
  const sizes = catalog.sizes[item.door_type] ?? [];

  function update(patch: Partial<DoorItem>) {
    const next = { ...item, ...patch };

    // Recalculate price unless user has overridden it
    const priceTriggers: (keyof DoorItem)[] = ["door_type", "size_nom", "core", "species", "hardware"];
    const priceChanged = priceTriggers.some((k) => k in patch);
    if (priceChanged && !next.price_override) {
      next.unit_price = calcDoorPrice(
        catalog, next.door_type, next.size_nom, next.core, next.species, next.hardware,
      );
    }

    onChange(next);
  }

  function handleTypeChange(newType: string) {
    const newSizes = catalog.sizes[newType] ?? [];
    const defaultSize = newSizes[0]?.nom ?? "";
    const newTypeInfo = catalog.door_types.find((t) => t.id === newType);
    const next: Partial<DoorItem> = {
      door_type: newType,
      size_nom: defaultSize,
      // Reset options that don't apply to this type
      swing:      newTypeInfo?.has_swing     ? item.swing     : "none",
      hardware:   newTypeInfo?.has_hardware  ? item.hardware  : "none",
      bore:       newTypeInfo?.has_bore      ? item.bore      : false,
      hinge_prep: newTypeInfo?.has_hinge_prep ? item.hinge_prep : false,
    };
    update(next);
  }

  const lineTotal = item.qty * item.unit_price;

  return (
    <tr className="border-b border-white/5 group">
      {/* Door type */}
      <td className="py-2 pr-2">
        <select
          value={item.door_type}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="w-full bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#f08122]/60"
        >
          {catalog.door_types.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </td>

      {/* Size */}
      <td className="py-2 pr-2">
        <select
          value={item.size_nom}
          onChange={(e) => update({ size_nom: e.target.value })}
          className="w-full bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#f08122]/60"
        >
          {sizes.map((s) => (
            <option key={s.nom} value={s.nom}>{s.nom}</option>
          ))}
        </select>
      </td>

      {/* Core */}
      <td className="py-2 pr-2">
        {typeInfo?.has_core ? (
          <select
            value={item.core}
            onChange={(e) => update({ core: e.target.value as DoorItem["core"] })}
            className="w-full bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#f08122]/60"
          >
            {CORE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <span className="text-white/20 text-xs px-2">—</span>
        )}
      </td>

      {/* Species */}
      <td className="py-2 pr-2">
        <select
          value={item.species}
          onChange={(e) => update({ species: e.target.value })}
          className="w-full bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#f08122]/60"
        >
          {SPECIES_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>

      {/* Swing */}
      <td className="py-2 pr-2">
        {typeInfo?.has_swing ? (
          <select
            value={item.swing}
            onChange={(e) => update({ swing: e.target.value as DoorItem["swing"] })}
            className="w-full bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#f08122]/60"
          >
            {SWING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <span className="text-white/20 text-xs px-2">—</span>
        )}
      </td>

      {/* Hardware */}
      <td className="py-2 pr-2">
        {typeInfo?.has_hardware ? (
          <select
            value={item.hardware}
            onChange={(e) => update({ hardware: e.target.value as DoorItem["hardware"] })}
            className="w-full bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#f08122]/60"
          >
            {HARDWARE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <span className="text-white/20 text-xs px-2">—</span>
        )}
      </td>

      {/* Bore + Hinge prep checkboxes */}
      <td className="py-2 pr-2">
        <div className="flex flex-col gap-1">
          {typeInfo?.has_bore && (
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={item.bore}
                onChange={(e) => update({ bore: e.target.checked })}
                className="accent-[#f08122] w-3 h-3"
              />
              <span className="text-white/50 text-[10px] font-condensed uppercase tracking-widest">Bore</span>
            </label>
          )}
          {typeInfo?.has_hinge_prep && (
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={item.hinge_prep}
                onChange={(e) => update({ hinge_prep: e.target.checked })}
                className="accent-[#f08122] w-3 h-3"
              />
              <span className="text-white/50 text-[10px] font-condensed uppercase tracking-widest">Hinge</span>
            </label>
          )}
        </div>
      </td>

      {/* Qty */}
      <td className="py-2 pr-2 w-16">
        <input
          type="number"
          min={1}
          value={item.qty}
          onChange={(e) => update({ qty: Math.max(1, parseInt(e.target.value) || 1) })}
          className="w-full bg-white/5 border border-white/15 rounded px-2 py-1.5 text-white text-xs text-center focus:outline-none focus:border-[#f08122]/60"
        />
      </td>

      {/* Unit price (editable — orange border when overridden) */}
      <td className="py-2 pr-2 w-24">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/30 text-xs">$</span>
          <input
            type="number"
            min={0}
            step={1}
            value={item.unit_price}
            onChange={(e) => {
              const v = parseFloat(e.target.value) || 0;
              update({ unit_price: v, price_override: true });
            }}
            className={`w-full bg-white/5 rounded pl-5 pr-2 py-1.5 text-white text-xs text-right focus:outline-none border ${
              item.price_override
                ? "border-[#f08122]/60"
                : "border-white/15 focus:border-[#f08122]/60"
            }`}
          />
        </div>
      </td>

      {/* Line total */}
      <td className="py-2 pr-2 text-right text-white tabular-nums text-sm w-24">
        ${lineTotal.toFixed(2)}
      </td>

      {/* Notes + remove */}
      <td className="py-2 pl-1">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={item.notes}
            onChange={(e) => update({ notes: e.target.value })}
            placeholder="Notes…"
            className="w-24 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white/60 text-xs focus:outline-none focus:border-[#f08122]/40"
          />
          <button
            onClick={onRemove}
            className="text-white/20 hover:text-red-400 transition-colors text-lg leading-none px-1"
            title="Remove"
          >
            ×
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DoorSpecClient({
  specId,
  initialItems,
  initialNotes,
  catalog,
  lastSaved,
}: Props) {
  const [items, setItems] = useState<DoorItem[]>(initialItems);
  const [notes, setNotes] = useState(initialNotes);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">(
    lastSaved ? "saved" : "unsaved",
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestItems = useRef(initialItems);
  const latestNotes = useRef(initialNotes);

  function scheduleAutosave() {
    setSaveStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(doSave, 1500);
  }

  function updateItems(next: DoorItem[]) {
    latestItems.current = next;
    setItems(next);
    scheduleAutosave();
  }

  function updateNotes(v: string) {
    latestNotes.current = v;
    setNotes(v);
    scheduleAutosave();
  }

  async function doSave() {
    setSaveStatus("saving");
    await fetch(`/api/door-specs/${specId}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: latestItems.current,
        notes: latestNotes.current,
      }),
    });
    setSaveStatus("saved");
  }

  const addItem = useCallback(() => {
    const next = [...latestItems.current, newItem(catalog, latestItems.current.length)];
    updateItems(next);
  }, [catalog]);

  function updateItem(index: number, updated: DoorItem) {
    const next = latestItems.current.map((it, i) => (i === index ? updated : it));
    updateItems(next);
  }

  function removeItem(index: number) {
    const next = latestItems.current
      .filter((_, i) => i !== index)
      .map((it, i) => ({ ...it, sort_order: i }));
    updateItems(next);
  }

  const grandTotal = items.reduce((sum, it) => sum + it.qty * it.unit_price, 0);
  const totalDoors = items.reduce((sum, it) => sum + it.qty, 0);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={addItem}
          className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs py-2 px-4 rounded transition-colors"
        >
          + Add Door
        </button>
        <span
          className={`font-condensed uppercase tracking-widest text-xs ${
            saveStatus === "saved"
              ? "text-white/25"
              : saveStatus === "saving"
                ? "text-[#f08122]/60"
                : "text-yellow-400/70"
          }`}
        >
          {saveStatus === "saved"
            ? `Saved ${lastSaved ? new Date(lastSaved).toLocaleTimeString() : ""}`
            : saveStatus === "saving"
              ? "Saving…"
              : "Unsaved"}
        </span>
      </div>

      {/* Line-items table */}
      {items.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded py-16 text-center">
          <p className="text-white/30 font-condensed uppercase tracking-widest text-sm">
            No doors yet — click + Add Door to start.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/30 font-condensed uppercase tracking-widest text-[10px] border-b border-white/10">
                <th className="text-left py-2 pr-2">Type</th>
                <th className="text-left py-2 pr-2">Size</th>
                <th className="text-left py-2 pr-2">Core</th>
                <th className="text-left py-2 pr-2">Species</th>
                <th className="text-left py-2 pr-2">Swing</th>
                <th className="text-left py-2 pr-2">Hardware</th>
                <th className="text-left py-2 pr-2">Prep</th>
                <th className="text-center py-2 pr-2">Qty</th>
                <th className="text-right py-2 pr-2">Unit $</th>
                <th className="text-right py-2 pr-2">Total</th>
                <th className="text-left py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <DoorRow
                  key={item.id}
                  item={item}
                  catalog={catalog}
                  onChange={(updated) => updateItem(i, updated)}
                  onRemove={() => removeItem(i)}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-white/20">
                <td colSpan={7} className="pt-4 pb-2 text-white/40 font-condensed uppercase tracking-widest text-xs">
                  {totalDoors} door{totalDoors !== 1 ? "s" : ""}
                </td>
                <td className="pt-4 pb-2 text-center text-white tabular-nums font-condensed">
                  {totalDoors}
                </td>
                <td className="pt-4 pb-2" />
                <td className="pt-4 pb-2 text-right text-[#f08122] font-bold tabular-nums">
                  ${grandTotal.toFixed(2)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Notes */}
      <div className="mt-8">
        <label className="block text-white/40 font-condensed uppercase tracking-widest text-xs mb-1">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => updateNotes(e.target.value)}
          rows={3}
          placeholder="Spec-level notes…"
          className="w-full bg-white/5 border border-white/15 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/60 resize-none"
        />
      </div>

      {/* Price override legend + manual save */}
      <div className="mt-6 flex items-center justify-between">
        <p className="text-white/25 text-xs font-condensed">
          <span className="inline-block w-2.5 h-2.5 rounded border border-[#f08122]/60 mr-1.5 align-middle" />
          Orange border = price manually overridden. Edit price to re-lock to catalog.
        </p>
        <button
          onClick={doSave}
          disabled={saveStatus === "saving"}
          className="bg-white/10 hover:bg-white/15 text-white font-condensed uppercase tracking-widest text-xs py-2.5 px-6 rounded transition-colors disabled:opacity-40"
        >
          {saveStatus === "saving" ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
