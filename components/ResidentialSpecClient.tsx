"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type {
  PaintColor, StainColor, MelamineColor, DoorStyle, HardwarePull, RevaAccessory,
  CabinetFamily, CarcassMaterial, DrawerBox, Edgeband, Room as RoomCatalogEntry,
} from "@/lib/catalogs";
import { CabinetsDrawingsView } from "@/components/CabinetsDrawingsView";
import { LifecyclePanel } from "@/components/LifecyclePanel";
import { MaterialsSubsection, type FinishMaterial } from "@/components/MaterialsSubsection";

// Kept for backward compat with existing moldings data; tab removed from UI
type FinishMolding = {
  id: string; finish_group_id: string; material_id: string; custom_material?: string;
  profile_id: string; where_used_room_ids: string[]; lf_qty?: number;
  notes?: string; sort_order: number;
};


type CatalogData = {
  paintColors: PaintColor[]; stainColors: StainColor[]; melamineColors: MelamineColor[];
  doorStyles: DoorStyle[]; hardwarePulls: HardwarePull[]; revaAccessories: RevaAccessory[];
  cabinetFamilies: CabinetFamily[];
  carcassMaterials: CarcassMaterial[];
  drawerBoxes: DrawerBox[];
  applianceCatalog?: { type: string; manufacturer: string; model: string; cutout_w: number; cutout_h: number; cutout_d: number; notes: string }[];
  edgebands: Edgeband[];
  rooms: RoomCatalogEntry[];
  cabDoorEdges?: { id: string; name: string }[];
  cabDoorProfiles?: { id: string; name: string }[];
  cabDoorPanels?: { id: string; name: string }[];
  species?: { id: string; name: string; grades: string | string[] | null }[];
};

type FinishType = "paint" | "stain" | "melamine" | "plam" | "";

export type FinishGroup = {
  id: string; label: string; finish_type: FinishType;
  color_id: string; color_name: string; door_style_id: string;
  drawer_style_id: string;
  cabdoor_edge_id: string;
  cabdoor_profile_id: string;
  cabdoor_panel_id: string;
  pull_id: string; box_material: "melamine" | "plywood";
  carcass_id: string;
  drawer_box_id: string;
  rollout_box_id: string;
  edgeband_id: string;
  applied_panels: "slab" | "match_door";
  species: string;
  notes: string; sort_order: number;
};

export type CabinetItem = {
  id: string; family_code: string;
  width_in: number | null; height_in: number | null; depth_in: number | null;
  qty: number; hinge_side: string; rollout_trays_qty: number;
  trash_kit: string; applied_panels: boolean;
  special_instructions: string; sort_order: number;
};

export type RoomFinishLink = {
  finish_group_id: string;
  zone: string;
  sort_order: number;
};

export type PullRow = {
  id: string;
  description: string;
  part_no: string;
  finish_color: string;
  where_used: string;
  qty: number;
  sort_order: number;
};

export type TrimRow = {
  id: string;
  trim_type: string;
  size_desc: string;
  material: string;
  qty_lf: number;
  notes: string;
  sort_order: number;
};

export type ApplianceRow = {
  id: string;
  appliance_type: string;
  manufacturer: string;
  model_no: string;
  room_id: string;
  notes: string;
  cutout_w: string;
  cutout_h: string;
  cutout_d: string;
  sort_order: number;
};

export type SpecAccessoryItem = {
  id: string; type: string; part_number: string; description: string;
  qty: number; room: string; size: string; notes: string; sort_order: number;
};

export type SpecHardwareItem = {
  id: string; type: string; part_no: string;
  room: string; qty: number; notes: string; sort_order: number;
};

export type Room = {
  id: string; name: string;
  finish_group_id: string;
  finishes: RoomFinishLink[];
  notes: string; sort_order: number;
  flooring: string;
  ceiling_height: string;
  soffit: string;
  backsplash: string;
  accessories: { acc_id: string; qty: number; custom_note?: string; size?: string; handed?: string }[];
  cabinets: CabinetItem[];
  trim: TrimRow[];
};

type Props = {
  specId: string; jobId: string;
  initialFinishGroups: FinishGroup[];
  initialRooms: Room[];
  initialMaterials: FinishMaterial[];   // v2 spec-form expansion (2026-05-06)
  initialPulls: Record<string, PullRow[]>;     // finish_group_pulls keyed by fg id
  initialAppliances: ApplianceRow[];
  initialAccessories2?: SpecAccessoryItem[];
  initialHardware?: SpecHardwareItem[];
  catalogs: CatalogData;
  lastSaved: string;
};

const LABEL  = "block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5";
const INPUT  = "w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] transition-colors";
const SELECT = INPUT;

function uid() { return Math.random().toString(36).slice(2, 10); }

type Violation = { tag: string; field: string };

function validateForSave(groups: FinishGroup[], rooms: Room[]): Violation[] {
  const v: Violation[] = [];
  for (const g of groups) {
    const tag = g.label || "(unnamed finish)";
    if (!g.label?.trim())   v.push({ tag, field: "Group Label" });
    // 2026-05-06: legacy Color / Door Style / Hardware Pull requirements RELAXED.
    // These three legacy columns are deprecated. The v2 Schedules tab now carries
    // the canon data (stain/paint/glaze/topcoat/sheen on finish_groups; door style
    // on finish_group_door_fronts; pulls on finish_group_hardware). Forcing the
    // legacy fields blocked the v2-only workflow — PMs filled the form correctly
    // and got "Color is required" with no way to satisfy. The API validate()
    // function in app/api/specs/[id]/save/route.ts mirrors this same relaxation.
    // The $70k canary (carcass / drawer / edgeband) stays REQUIRED below.
    if (!g.carcass_id)      v.push({ tag, field: "Carcass Material" });
    if (!g.drawer_box_id)   v.push({ tag, field: "Drawer Box" });
    if ((g.finish_type === "paint" || g.finish_type === "stain") && !g.edgeband_id) {
      v.push({ tag, field: "Edgeband (paint/stain)" });
    }
  }
  for (const r of rooms) {
    const tag = `Room: ${r.name || "(unnamed)"}`;
    if (!r.name?.trim()) v.push({ tag, field: "Room Name" });
    const validFinishes = (r.finishes ?? []).filter((f) => f.finish_group_id);
    if (validFinishes.length === 0 && !r.finish_group_id) {
      v.push({ tag, field: "At least one finish must be assigned" });
    }
    for (const c of r.cabinets ?? []) {
      if (!c.family_code) v.push({ tag, field: `Cabinet family in ${tag}` });
    }
  }
  return v;
}

// ── ColorPicker ────────────────────────────────────────────────────────────
// For paint → live API type-ahead (/api/paint-colors) with brand filter tabs,
//   debounced input, swatch chips, selected-state chip + X to clear.
// For stain/melamine → catalog-backed filter + select (unchanged).
type CPEntry = { id: string; brand: string; code: string; name: string; hex?: string | null };

// ── PaintColorTypeAhead ──────────────────────────────────────────────────────
// Replaces the static select for paint finish groups.
// value is the color code (e.g. "SW 7757"), displayed as swatch + name + code chip.
type PaintApiResult = { brand: string; name: string; code: string; hex: string | null };

function PaintColorTypeAhead({
  value,         // the currently stored code string (e.g. "SW 7757")
  valueName,     // display name for the selected code (stored in color_name)
  valueHex,      // hex for selected swatch
  onChange,      // (code: string, label: string, hex: string|null) => void
}: {
  value: string;
  valueName: string;
  valueHex: string | null;
  onChange: (code: string, label: string, hex: string | null) => void;
}) {
  const [filterBrand, setFilterBrand] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PaintApiResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const brand = filterBrand === "ALL" ? "" : filterBrand;
        const url = `/api/paint-colors?q=${encodeURIComponent(query)}${brand ? `&brand=${brand}` : ""}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json() as { colors: PaintApiResult[] };
          setResults(data.colors ?? []);
          setOpen(true);
        }
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, filterBrand]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectColor(c: PaintApiResult) {
    const label = `${c.code} · ${c.name} — ${c.brand}`;
    onChange(c.code, label, c.hex);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function clearSelection() {
    onChange("", "", null);
  }

  const BRANDS = ["ALL", "BM", "SW"];

  // Selected state: show chip
  if (value && !query) {
    return (
      <div className="space-y-2">
        {/* Brand filter tabs */}
        <div className="flex gap-1 flex-wrap">
          {BRANDS.map((b) => (
            <button key={b} type="button" onClick={() => setFilterBrand(b)}
              className={`font-condensed uppercase tracking-widest text-[10px] px-2 py-0.5 rounded border transition-colors ${filterBrand === b ? "bg-[#f08122]/20 border-[#f08122]/50 text-[#f08122]" : "border-white/10 text-white/30 hover:text-white hover:border-white/30"}`}
            >{b}</button>
          ))}
        </div>
        {/* Selected chip */}
        <div className="flex items-center gap-2 bg-[#252525] border border-[#f08122]/30 rounded px-3 py-2">
          <span
            className="w-4 h-4 rounded shrink-0 border border-white/20"
            style={{ backgroundColor: valueHex || "#555" }}
          />
          <span className="text-white text-sm flex-1 min-w-0 truncate">
            <span className="text-white/50 font-mono text-xs mr-1">{value}</span>
            {valueName || value}
          </span>
          <button
            type="button"
            onClick={clearSelection}
            className="text-white/30 hover:text-white text-xs ml-1 shrink-0"
            aria-label="Clear color"
          >✕</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2" ref={containerRef}>
      {/* Brand filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {BRANDS.map((b) => (
          <button key={b} type="button" onClick={() => setFilterBrand(b)}
            className={`font-condensed uppercase tracking-widest text-[10px] px-2 py-0.5 rounded border transition-colors ${filterBrand === b ? "bg-[#f08122]/20 border-[#f08122]/50 text-[#f08122]" : "border-white/10 text-white/30 hover:text-white hover:border-white/30"}`}
          >{b}</button>
        ))}
      </div>
      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder="Type color name or code (min 2 chars)…"
          className="w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#f08122] transition-colors"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 text-xs">…</span>
        )}
        {/* Dropdown results */}
        {open && results.length > 0 && (
          <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-[#232323] border border-white/15 rounded shadow-xl max-h-56 overflow-y-auto">
            {results.map((c) => (
              <button
                key={`${c.brand}-${c.code}`}
                type="button"
                onMouseDown={() => selectColor(c)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#2d2d2d] text-left transition-colors"
              >
                <span
                  className="w-4 h-4 rounded shrink-0 border border-white/20"
                  style={{ backgroundColor: c.hex || "#555" }}
                />
                <span className="text-white/50 font-mono text-xs w-20 shrink-0 truncate">{c.code}</span>
                <span className="text-white text-sm flex-1 min-w-0 truncate">{c.name}</span>
                <span className="text-white/30 text-[10px] font-condensed uppercase shrink-0">{c.brand}</span>
              </button>
            ))}
          </div>
        )}
        {open && !loading && query.length >= 2 && results.length === 0 && (
          <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-[#232323] border border-white/15 rounded shadow-xl px-3 py-2 text-white/30 text-sm">
            No matches — try a different name or code
          </div>
        )}
      </div>
    </div>
  );
}

function ColorPicker({
  type, value, valueName, valueHex, catalogs, onChange,
}: {
  type: FinishType;
  value: string;
  valueName: string;
  valueHex: string | null;
  catalogs: Props["catalogs"];
  onChange: (id: string, label: string, hex?: string | null) => void;
}) {
  // Paint: use live API type-ahead
  if (type === "paint") {
    return (
      <PaintColorTypeAhead
        value={value}
        valueName={valueName}
        valueHex={valueHex}
        onChange={onChange}
      />
    );
  }

  // Stain / Melamine: catalog-backed (unchanged behavior)
  const [filterBrand, setFilterBrand] = useState("");
  const [search, setSearch] = useState("");

  const all: CPEntry[] = useMemo(() => {
    if (type === "stain") {
      return catalogs.stainColors
        .map((c) => ({ id: c.id, brand: c.brand, code: c.code && c.code !== "—" ? c.code : "", name: c.name }));
    }
    return catalogs.melamineColors
      .map((c) => ({ id: c.id, brand: c.supplier, code: c.code && c.code !== "—" ? c.code : "", name: c.name, hex: c.hex_approx }));
  }, [type, catalogs]);

  const brands = useMemo(() => [...new Set(all.map((c) => c.brand))].sort(), [all]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((c) => {
      if (filterBrand && c.brand !== filterBrand) return false;
      if (q) return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
      return true;
    });
  }, [all, filterBrand, search]);

  const selected = all.find((c) => c.id === value);
  const isCustom = value === "STN-CUSTOM" || value === "MEL-CUSTOM";

  function makeLabel(c: CPEntry) {
    return `${c.code ? c.code + " · " : ""}${c.name} — ${c.brand}`;
  }

  return (
    <div className="space-y-2">
      {/* Brand / supplier filter pills */}
      <div className="flex gap-1 flex-wrap">
        <button type="button" onClick={() => setFilterBrand("")}
          className={`font-condensed uppercase tracking-widest text-[10px] px-2 py-0.5 rounded border transition-colors ${filterBrand === "" ? "bg-[#f08122]/20 border-[#f08122]/50 text-[#f08122]" : "border-white/10 text-white/30 hover:text-white hover:border-white/30"}`}
        >All</button>
        {brands.map((b) => (
          <button key={b} type="button" onClick={() => setFilterBrand(filterBrand === b ? "" : b)}
            className={`font-condensed uppercase tracking-widest text-[10px] px-2 py-0.5 rounded border transition-colors ${filterBrand === b ? "bg-[#f08122]/20 border-[#f08122]/50 text-[#f08122]" : "border-white/10 text-white/30 hover:text-white hover:border-white/30"}`}
          >{b}</button>
        ))}
      </div>
      {/* Code search + dropdown */}
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Code # or name…"
          className="w-32 bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#f08122] transition-colors font-mono"
        />
        <select
          value={value}
          onChange={(e) => {
            const c = all.find((x) => x.id === e.target.value);
            onChange(e.target.value, c ? makeLabel(c) : "");
          }}
          className="flex-1 bg-[#1a1a1a] border border-white/15 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122] transition-colors min-w-0"
        >
          <option value="">-- Select Color --</option>
          {filtered.map((c) => (
            <option key={c.id} value={c.id}>{c.code ? `${c.code}  ` : ""}{c.name}</option>
          ))}
        </select>
        {selected?.hex && !isCustom && (
          <span className="w-6 h-6 rounded-full shrink-0 border border-white/20" style={{ background: selected.hex }} />
        )}
      </div>
      {/* Free-text for Custom Match */}
      {isCustom && (
        <input
          type="text"
          placeholder="Type brand + code + name  (e.g. SW 7757 High Reflective White)"
          onChange={(e) => onChange(value, e.target.value || "Other / Custom Match")}
          className="w-full bg-[#1a1a1a] border border-[#f08122]/40 rounded px-2 py-1.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#f08122] transition-colors"
        />
      )}
      {selected && !isCustom && (
        <p className="text-white/30 text-[11px] font-condensed">
          ✓ {selected.brand}  {selected.code}  ·  {selected.name}
        </p>
      )}
    </div>
  );
}


// ── Accessory picker row ──────────────────────────────────────────────────────
const ACC_CATEGORIES: { value: string; label: string }[] = [
  { value: "trash",          label: "Trash pullout" },
  { value: "rollout",        label: "Rollout shelf" },
  { value: "lazy_susan",     label: "Corner / lazy susan (base)" },
  { value: "blind_corner",   label: "Blind corner optimizer (base)" },
  { value: "lazy_susan_wall",label: "Corner lazy susan (wall)" },
  { value: "door_storage",   label: "Door mount" },
  { value: "drawer",         label: "Drawer organizer" },
  { value: "pantry",         label: "Pantry" },
  { value: "specialty",      label: "Specialty" },
  { value: "other",          label: "Custom / Other" },
];

const SEL = "bg-[#1a1a1a] border border-white/15 rounded px-2 py-2 text-sm text-white focus:outline-none focus:border-[#f08122]";

// Normalize width_options_in / hand fields — sync-catalogs.mjs converts
// semicolon-separated CSV cells to arrays, so these can be string | number | array | null.
function asArr(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return (v as unknown[]).map(String);
  return String(v).split(";").map((s) => s.trim()).filter(Boolean);
}

function AccessoryPickerRow({
  acc,
  revaAccessories,
  onUpdate,
  onRemove,
}: {
  acc: { acc_id: string; qty: number; custom_note?: string; size?: string; handed?: string };
  revaAccessories: RevaAccessory[];
  onUpdate: (patch: { acc_id?: string; qty?: number; custom_note?: string; size?: string; handed?: string }) => void;
  onRemove: () => void;
}) {
  const selectedItem = revaAccessories.find((x) => x.id === acc.acc_id);
  const derivedCat = selectedItem?.category ?? (acc.acc_id === "ACC-020" ? "other" : "");

  // Local state for the type picker (before item is selected)
  const [localCat, setLocalCat] = useState<string>(derivedCat);

  const effectiveCat = derivedCat || localCat;

  // Sizes available for this category
  const sizeOptions: string[] = effectiveCat && effectiveCat !== "other"
    ? [...new Set(
        revaAccessories
          .filter((a) => a.category === effectiveCat)
          .flatMap((a) => asArr(a.width_options_in))
      )].sort((a, b) => parseFloat(a) - parseFloat(b))
    : [];

  // Items for this category + size
  const currentSize = acc.size ?? "";
  const itemOptions = effectiveCat && effectiveCat !== "other"
    ? revaAccessories.filter((a) => {
        if (a.category !== effectiveCat) return false;
        if (!currentSize) return true;
        return asArr(a.width_options_in).includes(currentSize);
      })
    : [];

  const handOptions = asArr(selectedItem?.hand);
  const isCustom = effectiveCat === "other";
  const hasWarning = selectedItem?.notes?.includes("WARNING");

  function handleCatChange(cat: string) {
    setLocalCat(cat);
    if (cat === "other") {
      onUpdate({ acc_id: "ACC-020", size: "", handed: "N/A" });
    } else {
      onUpdate({ acc_id: "", size: "", handed: "N/A" });
    }
  }

  function handleSizeChange(size: string) {
    // If current item still valid for new size, keep it; otherwise clear
    const stillValid = selectedItem &&
      asArr(selectedItem.width_options_in).includes(size);
    onUpdate({ size, acc_id: stillValid ? acc.acc_id : "", handed: "N/A" });
  }

  function handleItemChange(id: string) {
    const item = revaAccessories.find((x) => x.id === id);
    const firstHand = asArr(item?.hand)[0] ?? "N/A";
    onUpdate({ acc_id: id, handed: firstHand || "N/A" });
  }

  return (
    <div className="space-y-1.5 bg-[#161616] rounded p-2 border border-white/5">
      {/* Row 1: type → size → item → qty → remove */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Type */}
        <select
          value={effectiveCat}
          onChange={(e) => handleCatChange(e.target.value)}
          className={SEL + " flex-1 min-w-[130px]"}
        >
          <option value="">— Type —</option>
          {ACC_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        {/* Size — only when category chosen and not custom */}
        {effectiveCat && !isCustom && sizeOptions.length > 0 && (
          <select
            value={currentSize}
            onChange={(e) => handleSizeChange(e.target.value)}
            className={SEL + " w-[80px]"}
          >
            <option value="">— Size —</option>
            {sizeOptions.map((s) => (
              <option key={s} value={s}>{s}&quot;</option>
            ))}
          </select>
        )}

        {/* Item — only when category chosen and not custom */}
        {effectiveCat && !isCustom && (
          <select
            value={acc.acc_id}
            onChange={(e) => handleItemChange(e.target.value)}
            className={SEL + " flex-[2] min-w-[160px]"}
          >
            <option value="">— Item —</option>
            {itemOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}

        {/* Handed — only when item requires it */}
        {handOptions.length > 0 && (
          <select
            value={acc.handed ?? ""}
            onChange={(e) => onUpdate({ handed: e.target.value })}
            className={SEL + " w-[70px]"}
          >
            <option value="">—</option>
            {handOptions.map((h) => (
              <option key={h} value={h}>{h === "L" ? "Left" : h === "R" ? "Right" : h}</option>
            ))}
          </select>
        )}

        {/* Qty */}
        <input
          type="number" min={1}
          value={acc.qty}
          onChange={(e) => onUpdate({ qty: parseInt(e.target.value) || 1 })}
          className="w-14 bg-[#1a1a1a] border border-white/15 rounded px-2 py-2 text-sm text-white text-center focus:outline-none focus:border-[#f08122]"
        />

        <button onClick={onRemove} className="text-white/20 hover:text-red-400 transition-colors px-1 text-sm">✕</button>
      </div>

      {/* Row 2: item info / warning badge */}
      {selectedItem && !isCustom && (
        <div className="flex items-center gap-2 px-1">
          {/* Image placeholder / actual image */}
          <div className="w-10 h-10 bg-[#222] rounded flex-shrink-0 overflow-hidden">
            <img
              src={selectedItem.image_url ?? ""}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/70 text-xs truncate">{selectedItem.brand} · Series {selectedItem.series}</p>
            {selectedItem.price_slp && (
              <p className="text-white/40 text-[10px]">SLP ${selectedItem.price_slp} ({selectedItem.price_date})</p>
            )}
          </div>
          {hasWarning && (
            <span className="text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded px-1.5 py-0.5 font-condensed uppercase tracking-wide flex-shrink-0">
              Verify SKU
            </span>
          )}
        </div>
      )}

      {/* Row 3: custom notes */}
      {(isCustom || acc.custom_note) && (
        <input
          type="text"
          value={acc.custom_note ?? ""}
          onChange={(e) => onUpdate({ custom_note: e.target.value })}
          placeholder={isCustom ? "Brand, model, description…" : "Notes (optional)"}
          className="w-full bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#f08122]"
        />
      )}
    </div>
  );
}

export function ResidentialSpecClient({ specId, jobId, initialFinishGroups, initialRooms, initialMaterials, initialPulls, initialAppliances, initialAccessories2, initialHardware, catalogs, lastSaved }: Props) {
  const [tab, setTab]       = useState<"finishes" | "rooms" | "specDetails" | "summary">("finishes");
  const [groups, setGroups] = useState<FinishGroup[]>(initialFinishGroups);
  const [rooms, setRooms]   = useState<Room[]>(initialRooms);
  const [moldings, setMoldings] = useState<FinishMolding[]>([]);
  const [materials, setMaterials] = useState<FinishMaterial[]>(initialMaterials);
  const [pulls, setPulls] = useState<Record<string, PullRow[]>>(initialPulls);
  const [appliances, setAppliances] = useState<ApplianceRow[]>(initialAppliances);
  const [specAccs, setSpecAccs] = useState<SpecAccessoryItem[]>(initialAccessories2 ?? []);
  const [specHW, setSpecHW] = useState<SpecHardwareItem[]>(initialHardware ?? []);
  const [dirty, setDirty]   = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState(lastSaved);
  const [showViolations, setShowViolations] = useState(false);
  const [genState, setGenState] = useState<"idle" | "generating" | "done" | "error">("idle");

  function markDirty() { setDirty(true); setSaveState("idle"); }

  // 2026-05-06 — "Save All" coordinator. The Schedules tab (SpecSchedulesPanel)
  // owns its own save state and POSTs to /api/specs/[id]/schedules. The legacy
  // save() above POSTs to /api/specs/[id]/save. Two endpoints, two state trees.
  // on mount; saveAll() then fires both with one click. Matches Karl's
  // "10-year-old can drive it" standard — one button, both writes.
  const [saveAllState, setSaveAllState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [bulkRoomText, setBulkRoomText] = useState("");
  const [showBulkRoom, setShowBulkRoom] = useState(false);

  // violations and save must be declared BEFORE saveAll (which lists save as a dep)
  // to avoid a TDZ crash on render.
  const violations = useMemo(() => validateForSave(groups, rooms), [groups, rooms]);

  const save = useCallback(async (archive?: string, force?: boolean): Promise<boolean> => {
    if (violations.length > 0) {
      setShowViolations(true);
      if (!force) return false;  // partial save: caller passes force=true
    }
    setSaveState("saving");
    try {
      const roomsForSave = rooms.map((r) => {
        const firstFinishId = (r.finishes ?? []).find((f) => f.finish_group_id)?.finish_group_id ?? r.finish_group_id ?? "";
        return { ...r, finish_group_id: firstFinishId };
      });
      const res = await fetch(`/api/specs/${specId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finish_groups: groups, rooms: roomsForSave, moldings, materials }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("Save failed:", body);
        setSaveState("error");
        return false;
      }
      if (archive !== undefined) {
        await fetch(`/api/specs/${specId}/archive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: archive }),
        });
      }
      setDirty(false);
      setSaveState("saved");
      setSavedAt(new Date().toISOString());
      return true;
    } catch {
      setSaveState("error");
      return false;
    }
  }, [specId, groups, rooms, moldings, materials, violations.length]);

  const saveAll = useCallback(async () => {
    setSaveAllState("saving");
    try {
      const hasViolations = violations.length > 0;
      const okLegacy = await save(undefined, hasViolations);
      if (!okLegacy && !hasViolations) {
        setSaveAllState("error");
        return;
      }
      // Also save appliances + hardware on Save All
      await Promise.all([
        fetch(`/api/specs/${specId}/appliances`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appliances }),
        }),
        fetch(`/api/specs/${specId}/hardware`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hardware: specHW }),
        }),
      ]);
      setSaveAllState("saved");
      setTimeout(() => setSaveAllState("idle"), 2000);
    } catch {
      setSaveAllState("error");
    }
  }, [save, specId, appliances, specHW, violations.length]);

  // Dual-UI sync (2026-05-06): the Schedules · v2 tab and the inline Materials
  // sub-section both write to finish_group_materials via different endpoints.
  // When the user leaves the Schedules tab (where SpecSchedulesPanel may have
  // saved fresh data via /api/specs/[id]/schedules), we refetch materials so
  // the inline state isn't stale — otherwise the next main "Save" would post
  // stale inline state and silently overwrite the Schedules-tab edits ($70k
  // pattern). Tracking previous tab via useRef avoids triggering on the
  // initial mount, and we only refetch when leaving 'schedules' specifically.

  const generateSpec = useCallback(async () => {
    if (violations.length > 0) { setShowViolations(true); }  // flag but don't block — DRAFT watermark will show
    if (dirty) {
      const ok = await save();
      if (!ok) return;
    }
    setGenState("generating");
    try {
      const res = await fetch(`/api/specs/${specId}/generate`, { method: "POST" });
      if (!res.ok) { setGenState("error"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setGenState("done");
      // File was saved to job folder — show link if file_id came back
      const savedId = res.headers.get("X-File-Id");
      if (savedId) setContractFileId("");  // don't clobber a contract link
    } catch {
      setGenState("error");
    }
  }, [specId, dirty, violations.length, save]);

  const [combineState, setCombineState] = useState<"idle"|"working"|"done"|"error">("idle");
  const [combineErr, setCombineErr] = useState<string>("");
  const [contractState, setContractState] = useState<"idle"|"working"|"done"|"error">("idle");
  const [contractFileId, setContractFileId] = useState<string>("");
  const [showDisclosureModal, setShowDisclosureModal] = useState(false);
  const generateCombined = useCallback(async () => {
    if (violations.length > 0) { setShowViolations(true); return; }
    if (dirty) {
      const ok = await save();
      if (!ok) return;
    }
    // DAC #3: confirm the exact drawing filename we're about to merge before
    // actually combining. Out-of-order uploads can shadow the right drawing;
    // this gives the PM a chance to abort if the wrong filename is showing.
    setCombineState("working");
    setCombineErr("");
    try {
      // Look up latest drawing filename via the files endpoint (job-scoped).
      const filesRes = await fetch(`/api/jobs/${jobId}/files`, { cache: "no-store" });
      let latestName: string | null = null;
      if (filesRes.ok) {
        const body = await filesRes.json();
        const drawings = body.files?.drawings ?? [];
        latestName = drawings[0]?.filename ?? null;
      }
      if (!latestName) {
        setCombineErr("No drawings uploaded yet — go to the job page and upload kind=drawings first.");
        setCombineState("error");
        return;
      }
      const ok = window.confirm(`Combining spec with drawing:\n  ${latestName}\n\nIf this is the wrong drawing, click Cancel and upload the correct one as kind=drawings on the job page first.`);
      if (!ok) {
        setCombineState("idle");
        return;
      }
      const res = await fetch(`/api/specs/${specId}/combine`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCombineErr(body.error ?? `Combine failed (${res.status})`);
        setCombineState("error");
        return;
      }
      setCombineState("done");
      if (body.url) window.open(body.url, "_blank");
    } catch {
      setCombineState("error");
      setCombineErr("Combine failed");
    }
  }, [specId, dirty, violations.length, save]);

  const [excelState, setExcelState] = useState<"idle"|"working"|"done"|"error">("idle");
  const [excelErr, setExcelErr]   = useState<string>("");
  const generateExcel = useCallback(async () => {
    if (violations.length > 0) { setShowViolations(true); return; }
    if (dirty) {
      const ok = await save();
      if (!ok) return;
    }
    setExcelState("working"); setExcelErr("");
    try {
      const res = await fetch(`/api/specs/${specId}/excel`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExcelErr(body.error ?? `Excel failed (${res.status})`);
        setExcelState("error");
        return;
      }
      setExcelState("done");
      if (body.url) window.open(body.url, "_blank");
    } catch {
      setExcelState("error"); setExcelErr("Excel failed");
    }
  }, [specId, dirty, violations.length, save]);

  // ── Finish Groups ─────────────────────────────────────────────────────────
  function addGroup() {
    const idx = groups.length + 1;
    setGroups([...groups, {
      id: uid(),
      label: "",
      finish_type: "",
      color_id: "", color_name: "",
      door_style_id: "", drawer_style_id: "",
      cabdoor_edge_id: "", cabdoor_profile_id: "", cabdoor_panel_id: "",
      pull_id: "",
      box_material: "melamine",
      carcass_id: "", drawer_box_id: "", edgeband_id: "",
      applied_panels: "slab",
      species: "",
      notes: "",
      sort_order: idx,
    }]);
    markDirty();
  }
  function updateGroup(id: string, patch: Partial<FinishGroup>) {
    setGroups(groups.map((g) => g.id === id ? { ...g, ...patch } : g));
    markDirty();
  }
  function removeGroup(id: string) {
    setGroups(groups.filter((g) => g.id !== id));
    setRooms(rooms.map((r) => ({
      ...r,
      finish_group_id: r.finish_group_id === id ? "" : r.finish_group_id,
      finishes: (r.finishes ?? []).filter((f) => f.finish_group_id !== id),
    })));
    setMoldings(moldings.filter((m) => m.finish_group_id !== id));
    setMaterials(materials.filter((m) => m.finish_group_id !== id));
    markDirty();
  }

  // Material sub-section (v2): upsert by (finish_group_id, role). The DB has
  // UNIQUE(finish_group_id, role), so each pair is at most one row. We keep
  // the same invariant in client state.
  function upsertMaterial(finish_group_id: string, role: FinishMaterial["role"], patch: Partial<FinishMaterial>) {
    setMaterials((prev) => {
      const idx = prev.findIndex((m) => m.finish_group_id === finish_group_id && m.role === role);
      if (idx === -1) {
        return [...prev, {
          id: uid(),
          finish_group_id,
          role,
          material_id: "",
          where_used: "",
          notes: "",
          ...patch,
        }];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
    markDirty();
  }


  // Called from disclosure modal with user's choice
  const buildContract = useCallback(async (includeDisclosure: boolean) => {
    setShowDisclosureModal(false);
    setContractState("working");
    setContractFileId("");
    try {
      const res = await fetch(`/api/specs/${specId}/contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeDisclosure }),
      });
      const body = await res.json();
      if (!res.ok) {
        setContractState("error");
        return;
      }
      setContractState("done");
      setContractFileId(body.file_id ?? "");
      if (body.download_url) window.open(body.download_url, "_blank");
    } catch {
      setContractState("error");
    }
  }, [specId]);

  const generateContract = useCallback(async () => {
    if (violations.length > 0) { setShowViolations(true); return; }
    if (dirty) {
      const ok = await save();
      if (!ok) return;
    }
    // Show disclosure modal before building
    setShowDisclosureModal(true);
  }, [specId, dirty, violations.length, save]);

  // ── Rooms ─────────────────────────────────────────────────────────────────
  function addBulkRooms() {
    const names = bulkRoomText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (names.length === 0) return;
    const startOrder = rooms.length;
    const newRooms: Room[] = names.map((name, i) => ({
      id: uid(), name,
      finish_group_id: "", finishes: [],
      notes: "", sort_order: startOrder + i + 1,
      flooring: "", ceiling_height: "", soffit: "", backsplash: "",
      accessories: [], cabinets: [], trim: [],
    }));
    setRooms([...rooms, ...newRooms]);
    setBulkRoomText("");
    setShowBulkRoom(false);
    markDirty();
  }

  function moveRoom(id: string, dir: -1 | 1) {
    const idx = rooms.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= rooms.length) return;
    const reordered = [...rooms];
    [reordered[idx], reordered[next]] = [reordered[next], reordered[idx]];
    setRooms(reordered.map((r, i) => ({ ...r, sort_order: i + 1 })));
    markDirty();
  }

  function addRoom() {
    setRooms([...rooms, {
      id: uid(), name: "",
      finish_group_id: "", finishes: [],
      notes: "", sort_order: rooms.length + 1,
      flooring: "", ceiling_height: "", soffit: "", backsplash: "",
      accessories: [], cabinets: [], trim: [],
    }]);
    markDirty();
  }
  function updateRoom(id: string, patch: Partial<Room>) {
    setRooms(rooms.map((r) => r.id === id ? { ...r, ...patch } : r));
    markDirty();
  }
  function removeRoom(id: string) {
    setRooms(rooms.filter((r) => r.id !== id));
    setMoldings(moldings.map((m) => ({ ...m, where_used_room_ids: m.where_used_room_ids.filter((x) => x !== id) })));
    markDirty();
  }
  function addRoomFinish(roomId: string) {
    setRooms(rooms.map((r) => r.id !== roomId ? r : {
      ...r,
      finishes: [...(r.finishes ?? []), { finish_group_id: "", zone: "", sort_order: r.finishes?.length ?? 0 }],
    }));
    markDirty();
  }
  function updateRoomFinish(roomId: string, idx: number, patch: Partial<RoomFinishLink>) {
    setRooms(rooms.map((r) => {
      if (r.id !== roomId) return r;
      const list = [...(r.finishes ?? [])];
      list[idx] = { ...list[idx], ...patch };
      return { ...r, finishes: list };
    }));
    markDirty();
  }
  function removeRoomFinish(roomId: string, idx: number) {
    setRooms(rooms.map((r) => r.id !== roomId ? r : {
      ...r, finishes: (r.finishes ?? []).filter((_, i) => i !== idx),
    }));
    markDirty();
  }

  // ── Accessories ───────────────────────────────────────────────────────────
  function addAccessory(roomId: string) {
    setRooms(rooms.map((r) => r.id !== roomId ? r : { ...r, accessories: [...r.accessories, { acc_id: "", qty: 1, size: "", handed: "N/A" }] }));
    markDirty();
  }
  function updateAccessory(roomId: string, idx: number, patch: { acc_id?: string; qty?: number; custom_note?: string; size?: string; handed?: string }) {
    setRooms(rooms.map((r) => {
      if (r.id !== roomId) return r;
      const acc = [...r.accessories]; acc[idx] = { ...acc[idx], ...patch };
      return { ...r, accessories: acc };
    }));
    markDirty();
  }
  function removeAccessory(roomId: string, idx: number) {
    setRooms(rooms.map((r) => r.id !== roomId ? r : { ...r, accessories: r.accessories.filter((_, i) => i !== idx) }));
    markDirty();
  }

  // ── Pulls per finish group ──────────────────────────────────────────────────
  function addPull(fgId: string) {
    setPulls((prev) => ({
      ...prev,
      [fgId]: [...(prev[fgId] ?? []), {
        id: uid(), description: "", part_no: "", finish_color: "",
        where_used: "", qty: 1, sort_order: (prev[fgId] ?? []).length,
      }],
    }));
    markDirty();
  }
  function updatePull(fgId: string, idx: number, patch: Partial<PullRow>) {
    setPulls((prev) => {
      const list = [...(prev[fgId] ?? [])];
      list[idx] = { ...list[idx], ...patch };
      return { ...prev, [fgId]: list };
    });
    markDirty();
  }
  function removePull(fgId: string, idx: number) {
    setPulls((prev) => ({ ...prev, [fgId]: (prev[fgId] ?? []).filter((_, i) => i !== idx) }));
    markDirty();
  }
  async function savePulls(fgId: string) {
    const rows = pulls[fgId] ?? [];
    await fetch(`/api/specs/${specId}/pulls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finish_group_id: fgId, pulls: rows }),
    });
  }

  // ── Trim per room ──────────────────────────────────────────────────────────
  function addTrim(roomId: string) {
    setRooms(rooms.map((r) => r.id !== roomId ? r : {
      ...r, trim: [...(r.trim ?? []), {
        id: uid(), trim_type: "Crown Molding", size_desc: "", material: "",
        qty_lf: 0, notes: "", sort_order: (r.trim ?? []).length,
      }],
    }));
    markDirty();
  }
  function updateTrim(roomId: string, idx: number, patch: Partial<TrimRow>) {
    setRooms(rooms.map((r) => {
      if (r.id !== roomId) return r;
      const list = [...(r.trim ?? [])]; list[idx] = { ...list[idx], ...patch };
      return { ...r, trim: list };
    }));
    markDirty();
  }
  function removeTrim(roomId: string, idx: number) {
    setRooms(rooms.map((r) => r.id !== roomId ? r : { ...r, trim: (r.trim ?? []).filter((_, i) => i !== idx) }));
    markDirty();
  }
  async function saveTrim(roomId: string, trim: TrimRow[]) {
    await fetch(`/api/specs/${specId}/trim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: roomId, trim }),
    });
  }

  // ── Appliances ────────────────────────────────────────────────────────────
  function addAppliance() {
    setAppliances([...appliances, {
      id: uid(), appliance_type: "", manufacturer: "", model_no: "",
      room_id: "", notes: "", cutout_w: "", cutout_h: "", cutout_d: "", sort_order: appliances.length,
    }]);
    markDirty();
  }
  function updateAppliance(idx: number, patch: Partial<ApplianceRow>) {
    const list = [...appliances]; list[idx] = { ...list[idx], ...patch };
    setAppliances(list); markDirty();
  }
  function removeAppliance(idx: number) {
    setAppliances(appliances.filter((_, i) => i !== idx)); markDirty();
  }
  async function saveAppliances() {
    await fetch(`/api/specs/${specId}/appliances`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appliances }),
    });
  }
  async function saveSpecAccs() {
    await fetch(`/api/specs/${specId}/accessories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pulls: [], accessories: specAccs }),
    });
  }
  async function saveSpecHW() {
    await fetch(`/api/specs/${specId}/hardware`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hardware: specHW }),
    });
  }
  function addSpecAcc() {
    setSpecAccs([...specAccs, { id: uid(), type: "", part_number: "", description: "", qty: 1, room: "", size: "", notes: "", sort_order: specAccs.length }]);
    markDirty();
  }
  function updateSpecAcc(idx: number, patch: Partial<SpecAccessoryItem>) {
    const list = [...specAccs]; list[idx] = { ...list[idx], ...patch };
    setSpecAccs(list); markDirty();
  }
  function removeSpecAcc(idx: number) { setSpecAccs(specAccs.filter((_, i) => i !== idx)); markDirty(); }
  function addSpecHW() {
    setSpecHW([...specHW, { id: uid(), type: "", part_no: "", room: "", qty: 1, notes: "", sort_order: specHW.length }]);
    markDirty();
  }
  function updateSpecHW(idx: number, patch: Partial<SpecHardwareItem>) {
    const list = [...specHW]; list[idx] = { ...list[idx], ...patch };
    setSpecHW(list); markDirty();
  }
  function removeSpecHW(idx: number) { setSpecHW(specHW.filter((_, i) => i !== idx)); markDirty(); }

  // ── Cabinets ──────────────────────────────────────────────────────────────
  function addCabinet(roomId: string) {
    setRooms(rooms.map((r) => r.id !== roomId ? r : {
      ...r,
      cabinets: [...r.cabinets, {
        id: uid(), family_code: "", width_in: null, height_in: null, depth_in: null,
        qty: 1, hinge_side: "", rollout_trays_qty: 0, trash_kit: "None",
        applied_panels: false, special_instructions: "", sort_order: r.cabinets.length,
      }],
    }));
    markDirty();
  }
  function updateCabinet(roomId: string, idx: number, patch: Partial<CabinetItem>) {
    setRooms(rooms.map((r) => {
      if (r.id !== roomId) return r;
      const cabs = [...r.cabinets]; cabs[idx] = { ...cabs[idx], ...patch };
      return { ...r, cabinets: cabs };
    }));
    markDirty();
  }
  function removeCabinet(roomId: string, idx: number) {
    setRooms(rooms.map((r) => r.id !== roomId ? r : { ...r, cabinets: r.cabinets.filter((_, i) => i !== idx) }));
    markDirty();
  }


  // ── Toolbar labels ────────────────────────────────────────────────────────
  const saveLabel =
    saveState === "saving" ? "Saving..." :
    saveState === "saved"  ? "Saved" :
    saveState === "error"  ? "Error - retry" : "Save";
  const genLabel =
    genState === "generating" ? "Generating..." :
    genState === "error"      ? "Error - retry" : "Generate Spec";
  const canSave = dirty && saveState !== "saving" && violations.length === 0;
  const canGen  = violations.length === 0 && genState !== "generating";
  const blockedReason = violations.length > 0
    ? `Blocked - fix these first:\n${violations.map((v) => `- ${v.tag}: ${v.field}`).join("\n")}`
    : "";

  return (
    <div>
      {/* ── Residential Disclosure Modal ──────────────────────────────────── */}
      {showDisclosureModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-6 w-full max-w-md space-y-5">
            <div>
              <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-1">
                Build Contract
              </p>
              <p className="text-white font-condensed uppercase tracking-widest text-sm">
                Include Residential Disclosure?
              </p>
            </div>
            <p className="text-white/50 text-xs leading-relaxed">
              The Residential Disclosure Agreement covers the right of rescission, Idaho contractor
              license disclosure, lien rights notice, payment terms, and warranty scope. It should
              be included for all direct residential clients.
            </p>
            <p className="text-white/30 text-[11px]">
              The disclosure PDF must be uploaded to Supabase Storage at{" "}
              <span className="font-mono text-white/50">templates/residential-disclosure.pdf</span>.
              If it hasn&apos;t been uploaded yet, the contract will be built without it.
            </p>
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => buildContract(true)}
                className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs px-5 py-2.5 rounded transition-colors"
              >
                Yes — Include Disclosure
              </button>
              <button
                onClick={() => buildContract(false)}
                className="bg-white/10 hover:bg-white/15 text-white font-condensed uppercase tracking-widest text-xs px-5 py-2.5 rounded transition-colors"
              >
                No — Skip
              </button>
              <button
                onClick={() => setShowDisclosureModal(false)}
                className="text-white/30 hover:text-white font-condensed uppercase tracking-widest text-xs px-4 py-2.5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <datalist id="room-name-suggestions">
        {catalogs.rooms.map((r) => <option key={r.id} value={r.name} />)}
      </datalist>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6 pb-4 border-b border-white/10">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <LifecyclePanel specId={specId} />
        <div className="text-white/25 text-xs font-condensed uppercase tracking-widest">
          {dirty ? "Unsaved changes" : `Saved ${new Date(savedAt).toLocaleString()}`}
        </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {violations.length > 0 && (
            <span
              className="text-[10px] font-condensed uppercase tracking-widest text-yellow-400/80 mr-2"
              title={blockedReason}
            >
              {violations.length} required field{violations.length === 1 ? "" : "s"} unfilled
            </span>
          )}
          <button
            onClick={() => {
              if (violations.length > 0) {
                // Partial save — show violations banner but save anyway as DRAFT
                setShowViolations(true);
                save(undefined, true);
              } else {
                saveAll();
              }
            }}
            disabled={saveAllState === "saving"}
            title={violations.length > 0 ? "Save as DRAFT — blank required fields will be flagged" : "Save spec + schedules in one click"}
            className={`font-condensed uppercase tracking-widest text-xs py-2 px-4 rounded transition-colors ${
              saveAllState === "saving"
                ? "bg-white/5 text-white/20 cursor-not-allowed"
                : violations.length > 0
                ? "bg-yellow-700/70 hover:bg-yellow-700 text-white"
                : "bg-[#f08122] hover:bg-[#d9711e] text-white"
            }`}
          >
            {saveAllState === "saving" ? "Saving..." :
             saveAllState === "saved"  ? "Saved ✓" :
             saveAllState === "error"  ? "Error — retry" :
             violations.length > 0   ? "Save as Draft" :
             "Save All"}
          </button>
          {/* Legacy "Save" — fires only the spec form, NOT the Schedules tab.
              Kept for the case where the user wants to save mid-edit without
              triggering a schedules POST. Save All above is the default. */}
          <button
            onClick={() => save()}
            disabled={!canSave}
            title={blockedReason || (dirty ? "Save spec only — does NOT save Schedules tab edits" : "Nothing to save")}
            className={`font-condensed uppercase tracking-widest text-xs py-2 px-3 rounded border transition-colors ${
              canSave
                ? "border-white/20 hover:border-white/40 text-white/60 hover:text-white"
                : "border-white/5 text-white/15 cursor-not-allowed"
            }`}
          >
            {saveLabel} (spec only)
          </button>
          <button
            onClick={() => {
              if (violations.length > 0) { setShowViolations(true); return; }
              const label = prompt("Archive label (e.g. 'Sent to DocuSign', 'Pre-revision backup'):");
              if (label !== null) save(label);
            }}
            disabled={violations.length > 0}
            className={`border border-white/15 ${violations.length > 0 ? "text-white/15 cursor-not-allowed" : "hover:border-white/40 text-white/40 hover:text-white"} font-condensed uppercase tracking-widest text-xs py-2 px-4 rounded transition-colors`}
          >
            Archive Snapshot
          </button>
          <button
            onClick={generateSpec}
            disabled={!canGen}
            title={canGen ? "Save and generate the spec PDF (opens inline in a new tab)" : blockedReason}
            className={`font-condensed uppercase tracking-widest text-xs py-2 px-4 rounded transition-colors ${
              canGen
                ? "bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white border border-[#f08122]"
                : "bg-white/5 text-white/20 cursor-not-allowed border border-transparent"
            }`}
          >
            {genLabel}
          </button>
          <button
            onClick={generateCombined}
            disabled={!canGen || combineState === "working"}
            title={canGen ? "Render spec + most-recent drawings into a single PDF" : blockedReason}
            className={`font-condensed uppercase tracking-widest text-xs py-2 px-4 rounded transition-colors ${
              canGen && combineState !== "working"
                ? "bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white border border-white/30"
                : "bg-white/5 text-white/20 cursor-not-allowed border border-transparent"
            }`}
          >
            {combineState === "working" ? "Combining..." : combineState === "error" ? "Combine - retry" : "Spec + Drawings"}
          </button>
          {combineErr && <span className="text-red-400 text-[10px] font-condensed uppercase tracking-widest" title={combineErr}>{combineErr.length > 40 ? combineErr.slice(0,40) + "..." : combineErr}</span>}
          <button
            onClick={generateContract}
            disabled={!canGen || contractState === "working"}
            title={canGen ? "Merge spec + drawings + quote into one PDF, save to job folder, and email to PM" : blockedReason}
            className={`font-condensed uppercase tracking-widest text-xs py-2 px-4 rounded transition-colors ${
              canGen && contractState !== "working"
                ? "bg-[#f08122] hover:bg-[#d9711e] text-white border border-[#f08122]"
                : "bg-white/5 text-white/20 cursor-not-allowed border border-transparent"
            }`}
          >
            {contractState === "working" ? "Building..." : contractState === "error" ? "Contract - retry" : contractState === "done" ? "✓ Contract Sent" : "Send Contract"}
          </button>
          {contractState === "done" && contractFileId && (
            <a
              href={`/api/jobs/${jobId}/files?file_id=${contractFileId}`}
              target="_blank"
              rel="noreferrer"
              className="text-green-400 text-[10px] font-condensed uppercase tracking-widest hover:text-green-300 transition-colors"
            >
              View in job folder →
            </a>
          )}
          <button
            onClick={generateExcel}
            disabled={!canGen || excelState === "working"}
            title={canGen ? "Render the Artifex spec template (.xlsx) and download" : blockedReason}
            className={`font-condensed uppercase tracking-widest text-xs py-2 px-4 rounded transition-colors ${
              canGen && excelState !== "working"
                ? "bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white border border-white/30"
                : "bg-white/5 text-white/20 cursor-not-allowed border border-transparent"
            }`}
          >
            {excelState === "working" ? "Excel..." : excelState === "error" ? "Excel - retry" : "Excel"}
          </button>
          {excelErr && <span className="text-red-400 text-[10px] font-condensed uppercase tracking-widest" title={excelErr}>{excelErr.length > 40 ? excelErr.slice(0,40) + "..." : excelErr}</span>}
        </div>
      </div>

      {showViolations && violations.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-700/30 rounded p-4 mb-6">
          <div className="flex items-start justify-between mb-2">
            <p className="text-yellow-300/80 text-xs font-condensed uppercase tracking-widest">
              Save blocked - required fields unfilled
            </p>
            <button onClick={() => setShowViolations(false)} className="text-yellow-300/40 hover:text-yellow-300 text-xs">x</button>
          </div>
          <ul className="space-y-1 text-yellow-100/80 text-xs">
            {violations.map((v, i) => (
              <li key={i}><span className="text-yellow-400/60">{v.tag}:</span> {v.field}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-8 overflow-x-auto whitespace-nowrap -mx-4 px-4 sm:mx-0 sm:px-0 sticky top-0 z-10 bg-[#1a1a1a]/95 backdrop-blur-sm">
        {(["finishes", "rooms", "specDetails", "summary"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`font-condensed uppercase tracking-widest text-xs py-3 px-3 sm:px-5 border-b-2 transition-colors ${
              tab === t ? "border-[#f08122] text-[#f08122]" : "border-transparent text-white/30 hover:text-white/60"
            }`}
          >
            {t === "finishes" ? `Finish Groups (${groups.length})`
              : t === "rooms" ? `Rooms (${rooms.length})`
              : t === "specDetails" ? `Spec Details (${appliances.length})`
              : "Summary"}
          </button>
        ))}
      </div>

      {/* FINISH GROUPS */}
      {tab === "finishes" && (
        <div className="space-y-6">
          <p className="text-white/30 text-xs font-condensed uppercase tracking-widest">
            Each group defines one finish + door + pull + carcass + drawer box. Every required dropdown must be picked before save.
          </p>
          {groups.map((g) => {
            const carcass = catalogs.carcassMaterials.find((c) => c.id === g.carcass_id);
            const drawerBox = catalogs.drawerBoxes.find((d) => d.id === g.drawer_box_id);
            const requiresEdgebandPick = g.finish_type === "paint" || g.finish_type === "stain";
            // Melamine edgeband auto-match: look up color name → edgeband.color_match
            const matchedEdgeband = g.finish_type === "melamine" && g.color_id
              ? (() => {
                  const mc = catalogs.melamineColors.find((c) => c.id === g.color_id);
                  return mc ? catalogs.edgebands.find((e) => e.color_match === mc.name && !e.placeholder) : undefined;
                })()
              : undefined;
            const edgebandOptions = catalogs.edgebands.filter((e) => {
              // sync-catalogs.mjs auto-arrays semicolon-separated values, so the
              // runtime is sometimes string and sometimes string[]. Handle both.
              const cft = e.compatible_finish_type;
              if (!cft || cft === "all") return true;
              const types = Array.isArray(cft) ? cft : String(cft).split(";");
              return types.includes(g.finish_type);
            });

            return (
              <div key={g.id} className="bg-[#2d2d2d] rounded p-4 sm:p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <span className="text-[#f08122] font-condensed uppercase tracking-widest text-sm">{g.label}</span>
                  <button onClick={() => removeGroup(g.id)} className="text-white/20 hover:text-red-400 text-xs font-condensed uppercase tracking-widest transition-colors">Remove</button>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className={LABEL}>Group Label *</label>
                    <input value={g.label} onChange={(e) => updateGroup(g.id, { label: e.target.value })} className={INPUT} />
                  </div>
                  <div>
                    <label className={LABEL}>Finish Type *</label>
                    <select
                      value={g.finish_type}
                      onChange={(e) => {
                        const newType = e.target.value as FinishType;
                        const typePrefix = newType === "paint" ? "PNT" : newType === "melamine" ? "MEL" : newType === "plam" ? "PLAM" : "STN";
                        const countOfType = groups.filter((x) => x.id !== g.id && x.finish_type === newType).length;
                        const autoLabel = newType ? `${typePrefix}-${countOfType + 1}` : "";
                        const patch: Partial<FinishGroup> = { finish_type: newType, label: autoLabel, color_id: "", color_name: "", edgeband_id: "" };
                        // When switching to melamine, check if current door style is a slab;
                        // if not, clear it so the user must re-pick from the restricted list.
                        if (newType === "melamine" && g.door_style_id) {
                          const currentDoor = catalogs.doorStyles.find((d) => d.id === g.door_style_id);
                          if (currentDoor && currentDoor.construction !== "slab") {
                            patch.door_style_id = "";
                          }
                        }
                        updateGroup(g.id, patch);
                      }}
                      className={SELECT}
                    >
                      <option value="">-- Select Type --</option>
                      <option value="paint">Paint</option>
                      <option value="stain">Stain</option>
                      <option value="melamine">Melamine / TFL</option>
                      <option value="plam">PLAM</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={LABEL}>Color *</label>
                    <ColorPicker
                      type={g.finish_type}
                      value={g.color_id}
                      valueName={g.color_name}
                      valueHex={null}
                      catalogs={catalogs}
                      onChange={(id, label) => {
                        const updates: Partial<FinishGroup> = { color_id: id, color_name: label };
                        // Auto-derive edgeband when a melamine color is picked
                        if (g.finish_type === "melamine" && id) {
                          const mc = catalogs.melamineColors.find((c) => c.id === id);
                          if (mc) {
                            const eb = catalogs.edgebands.find((e) => e.color_match === mc.name && !e.placeholder);
                            if (eb) updates.edgeband_id = eb.id;
                          }
                        }
                        updateGroup(g.id, updates);
                      }}
                    />
                  </div>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className={LABEL}>
                      Door Style{" "}
                      <span className="text-white/30 normal-case font-normal">(set detail in Schedules tab)</span>
                      {g.finish_type === "melamine" && (
                        <span className="ml-1 text-[#f08122]/70 normal-case font-normal text-[10px]">— slab only</span>
                      )}
                    </label>
                    <select
                      value={g.door_style_id ?? ""}
                      onChange={(e) => updateGroup(g.id, { door_style_id: e.target.value })}
                      className={SELECT}
                    >
                      <option value="">-- Select Door --</option>
                      {catalogs.doorStyles
                        .filter((d) => {
                          if (g.finish_type === "melamine") return d.construction === "slab";
                          return true;
                        })
                        .map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    {g.finish_type === "melamine" && !g.door_style_id && (
                      <p className="text-yellow-400/70 text-[10px] mt-1 font-condensed uppercase tracking-widest">
                        Door style reset — melamine finish uses slab doors only.
                      </p>
                    )}
                  </div>

                  {/* Cab Door Custom Options — shown only when DS-CD-CUSTOM is selected */}
                  {g.door_style_id === "DS-CD-CUSTOM" && (
                    <div className="sm:col-span-3 grid sm:grid-cols-3 gap-3 bg-[#1a1a1a] rounded p-3 border border-[#f08122]/20">
                      <p className="sm:col-span-3 text-[#f08122]/60 text-[10px] font-condensed uppercase tracking-widest">Cab Door Custom Options</p>
                      <div>
                        <label className={LABEL}>Edge Detail</label>
                        <select value={g.cabdoor_edge_id ?? ""} onChange={(e) => updateGroup(g.id, { cabdoor_edge_id: e.target.value })} className={SELECT}>
                          <option value="">-- Select Edge --</option>
                          {(catalogs.cabDoorEdges ?? []).map((e) => <option key={e.id} value={e.id}>{e.name || e.id}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={LABEL}>Inside Profile</label>
                        <select value={g.cabdoor_profile_id ?? ""} onChange={(e) => updateGroup(g.id, { cabdoor_profile_id: e.target.value })} className={SELECT}>
                          <option value="">-- Select Profile --</option>
                          {(catalogs.cabDoorProfiles ?? []).map((p) => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={LABEL}>Panel</label>
                        <select value={g.cabdoor_panel_id ?? ""} onChange={(e) => updateGroup(g.id, { cabdoor_panel_id: e.target.value })} className={SELECT}>
                          <option value="">-- Select Panel --</option>
                          {(catalogs.cabDoorPanels ?? []).map((p) => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className={LABEL}>Drawer Style <span className="text-white/30 normal-case font-normal">(if different from door)</span></label>
                    <select
                      value={g.drawer_style_id ?? ""}
                      onChange={(e) => updateGroup(g.id, { drawer_style_id: e.target.value })}
                      className={SELECT}
                    >
                      <option value="">Same as Door</option>
                      {catalogs.doorStyles.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Applied Panels</label>
                    <select
                      value={g.applied_panels ?? "slab"}
                      onChange={(e) => updateGroup(g.id, { applied_panels: e.target.value as "slab" | "match_door" })}
                      className={SELECT}
                    >
                      <option value="slab">Slab</option>
                      <option value="match_door">Match door style</option>
                    </select>
                  </div>
                  {(g.finish_type === "paint" || g.finish_type === "stain") && (
                    <div>
                      <label className={LABEL}>Species</label>
                      <select
                        value={(catalogs.species ?? []).find(s => g.species?.startsWith(s.name)) ? g.species.split(" - ")[0] : ""}
                        onChange={(e) => updateGroup(g.id, { species: e.target.value })}
                        className={SELECT}
                      >
                        <option value="">-- Select Species --</option>
                        {(catalogs.species ?? []).map((s) => (
                          <option key={s.id} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                      {(() => {
                        const spName = g.species?.split(" - ")[0] ?? "";
                        const sp = (catalogs.species ?? []).find((s) => s.name === spName);
                        const grades = sp?.grades
                          ? (Array.isArray(sp.grades) ? sp.grades : String(sp.grades).split(";").filter(Boolean))
                          : [];
                        if (!grades.length) return null;
                        const currentGrade = g.species?.includes(" - ") ? g.species.split(" - ").slice(1).join(" - ") : "";
                        return (
                          <select
                            className={`${SELECT} mt-1`}
                            value={currentGrade}
                            onChange={(e) => {
                              const base = g.species?.split(" - ")[0] ?? spName;
                              updateGroup(g.id, { species: e.target.value ? `${base} - ${e.target.value}` : base });
                            }}
                          >
                            <option value="">Grade (optional)</option>
                            {grades.map((gr) => <option key={gr} value={gr}>{gr}</option>)}
                          </select>
                        );
                      })()}
                    </div>
                  )}
                  <div>
                    <label className={LABEL}>Notes</label>
                    <input value={g.notes ?? ""} onChange={(e) => updateGroup(g.id, { notes: e.target.value })} placeholder="Sheen, custom mix, special instructions..." className={INPUT} />
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-4 pt-2 border-t border-white/5">
                  <div>
                    <label className={LABEL}>Carcass Material *</label>
                    <select value={g.carcass_id} onChange={(e) => updateGroup(g.id, { carcass_id: e.target.value })} className={SELECT}>
                      <option value="">-- Select Carcass --</option>
                      {catalogs.carcassMaterials.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    {carcass?.is_other && (
                      <p className="text-yellow-400/60 text-[10px] mt-1 font-condensed uppercase tracking-widest">Specify in Notes</p>
                    )}
                  </div>
                  <div>
                    <label className={LABEL}>Drawer Box *</label>
                    <select value={g.drawer_box_id} onChange={(e) => updateGroup(g.id, { drawer_box_id: e.target.value })} className={SELECT}>
                      <option value="">-- Select Drawer Box --</option>
                      {catalogs.drawerBoxes.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                    {drawerBox?.is_other && (
                      <p className="text-yellow-400/60 text-[10px] mt-1 font-condensed uppercase tracking-widest">Specify in Notes</p>
                    )}
                  </div>
                  <div>
                    <label className={LABEL}>Rollout Box</label>
                    <select value={g.rollout_box_id ?? ""} onChange={(e) => updateGroup(g.id, { rollout_box_id: e.target.value })} className={SELECT}>
                      <option value="">-- Same as Drawer Box --</option>
                      {catalogs.drawerBoxes.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Edgeband {requiresEdgebandPick ? "*" : ""}</label>
                    {g.finish_type === "melamine" ? (
                      // Melamine: edgeband IS the carcass material — no separate pick needed.
                      // Store no edgeband_id (null). Display a read-only callout.
                      <div className={INPUT + " text-white/50 text-xs italic"}>
                        Matches carcass material
                      </div>
                    ) : (
                      // Paint / Stain: PM must pick an edgeband from the filtered list.
                      <select value={g.edgeband_id} onChange={(e) => updateGroup(g.id, { edgeband_id: e.target.value })} className={SELECT}>
                        <option value="">-- Select Edgeband --</option>
                        <optgroup label="Common choices">
                          <option value="MATCH_PAINT_STAIN">Paint / Stain to Match</option>
                          <option value="PVC_SPECIFY">PVC (specify on Schedules tab)</option>
                          <option value="OTHER_EDGEBAND">Other / Non-standard (add note)</option>
                        </optgroup>
                        <optgroup label="Catalog">
                          {edgebandOptions.map((e) => (
                            <option key={e.id} value={e.id}>{e.product_name} - {e.supplier}</option>
                          ))}
                        </optgroup>
                      </select>
                    )}
                  </div>
                </div>

                {/* MaterialsSubsection removed 2026-07-02 — materials are fully
                    covered in the Schedules · v2 tab. Keep file, stop rendering. */}

                {/* Pulls section (Phase 3c) */}
                <div className="pt-3 border-t border-white/5">
                  <p className="text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-3">Pulls</p>
                  <div className="space-y-2">
                    {(pulls[g.id] ?? []).map((p, pi) => (
                      <div key={pi} className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-[#1a1a1a] rounded p-2">
                        <div className="sm:col-span-2">
                          <label className={LABEL}>Description</label>
                          <input value={p.description} onChange={(e) => updatePull(g.id, pi, { description: e.target.value })} placeholder="Description" className={INPUT} />
                        </div>
                        <div>
                          <label className={LABEL}>Part #</label>
                          <input value={p.part_no} onChange={(e) => updatePull(g.id, pi, { part_no: e.target.value })} placeholder="Part #" className={INPUT} />
                        </div>
                        <div>
                          <label className={LABEL}>Finish/Color</label>
                          <input value={p.finish_color} onChange={(e) => updatePull(g.id, pi, { finish_color: e.target.value })} placeholder="Finish" className={INPUT} />
                        </div>
                        <div>
                          <label className={LABEL}>Where Used</label>
                          <input value={p.where_used} onChange={(e) => updatePull(g.id, pi, { where_used: e.target.value })} placeholder="e.g. Base doors, Drawers" className={INPUT} />
                        </div>
                        <div>
                          <label className={LABEL}>Qty</label>
                          <div className="flex gap-1">
                            <input type="number" min={0} value={p.qty} onChange={(e) => updatePull(g.id, pi, { qty: parseInt(e.target.value) || 0 })} className={INPUT + " w-20"} />
                            <button onClick={() => removePull(g.id, pi)} className="text-white/20 hover:text-red-400 transition-colors px-2 shrink-0">×</button>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-3">
                      <button onClick={() => addPull(g.id)} className="text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-[10px] transition-colors">+ Add Pull Row</button>
                      {(pulls[g.id] ?? []).length > 0 && (
                        <button onClick={() => savePulls(g.id)} className="text-[#f08122]/60 hover:text-[#f08122] font-condensed uppercase tracking-widest text-[10px] transition-colors">Save Pulls</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <button onClick={addGroup} className="border border-dashed border-white/20 hover:border-[#f08122] text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs rounded py-3 px-6 transition-colors w-full">
            + Add Finish Group
          </button>
        </div>
      )}

      {/* ROOMS */}
      {tab === "rooms" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-white/30 text-xs font-condensed uppercase tracking-widest">
              Define rooms. Multiple finishes per room supported — add zone labels if split.
            </p>
            <button
              onClick={() => setShowBulkRoom(!showBulkRoom)}
              className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs border border-white/15 rounded px-3 py-1.5 transition-colors"
            >
              {showBulkRoom ? "Hide Bulk Entry" : "Bulk Add Rooms"}
            </button>
          </div>

          {showBulkRoom && (
            <div className="bg-[#2d2d2d] rounded p-4 space-y-3 border border-white/10">
              <p className="text-white/50 text-xs font-condensed uppercase tracking-widest">One room name per line</p>
              <textarea
                value={bulkRoomText}
                onChange={(e) => setBulkRoomText(e.target.value)}
                placeholder={"Kitchen\nMaster Bath\nLaundry\nMud Room"}
                rows={5}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded p-3 text-white text-sm font-mono focus:outline-none focus:border-[#f08122]/60 resize-y"
              />
              <div className="flex gap-2">
                <button
                  onClick={addBulkRooms}
                  className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded transition-colors"
                >
                  Add Rooms
                </button>
                <button
                  onClick={() => { setBulkRoomText(""); setShowBulkRoom(false); }}
                  className="text-white/30 hover:text-white/60 font-condensed uppercase tracking-widest text-xs px-4 py-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {groups.length === 0 && (
            <div className="bg-yellow-900/20 border border-yellow-700/30 rounded p-4 text-yellow-300/70 text-xs font-condensed uppercase tracking-widest">
              Define at least one finish group first.
            </div>
          )}

          {groups.length > 0 && rooms.length > 1 && (
            <div className="bg-[#2d2d2d] rounded p-3 border border-white/10 flex flex-wrap items-center gap-3">
              <span className="text-white/40 font-condensed uppercase tracking-widest text-xs">Whole-job single finish:</span>
              <select
                onChange={(e) => {
                  if (!e.target.value) return;
                  setRooms(rooms.map((r) => ({
                    ...r,
                    finish_group_id: e.target.value,
                    finishes: [{ finish_group_id: e.target.value, zone: "", sort_order: 0 }],
                  })));
                  markDirty();
                  e.target.value = "";
                }}
                defaultValue=""
                className="bg-[#1a1a1a] border border-white/10 rounded px-3 py-1.5 text-white text-xs font-condensed focus:outline-none focus:border-[#f08122]/60"
              >
                <option value="">Apply one FG to all rooms…</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}{g.finish_type ? ` · ${g.finish_type.toUpperCase()}` : ""}{g.species ? ` · ${g.species}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {rooms.map((room, roomIdx) => (
            <div key={room.id} className="bg-[#2d2d2d] rounded p-4 sm:p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-white/50 font-condensed uppercase tracking-widest text-xs">Room {roomIdx + 1}</span>
                  <button
                    onClick={() => moveRoom(room.id, -1)}
                    disabled={roomIdx === 0}
                    className="text-white/20 hover:text-white/60 disabled:opacity-20 text-xs px-1 transition-colors"
                    title="Move up"
                  >▲</button>
                  <button
                    onClick={() => moveRoom(room.id, 1)}
                    disabled={roomIdx === rooms.length - 1}
                    className="text-white/20 hover:text-white/60 disabled:opacity-20 text-xs px-1 transition-colors"
                    title="Move down"
                  >▼</button>
                </div>
                <button onClick={() => removeRoom(room.id)} className="text-white/20 hover:text-red-400 text-xs font-condensed uppercase tracking-widest transition-colors">Remove</button>
              </div>
              <div>
                <label className={LABEL}>Room Name *</label>
                <input
                  list="room-name-suggestions"
                  value={room.name}
                  onChange={(e) => updateRoom(room.id, { name: e.target.value })}
                  placeholder="Kitchen Perimeter, Master Bath Vanity, Kitchen Island..."
                  className={INPUT}
                />
                <p className="text-white/20 text-[10px] mt-1 font-condensed uppercase tracking-widest">
                  Type freely - suggestions appear as you go.
                </p>
              </div>

              <div className="pt-2 border-t border-white/5">
                <p className="text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-3">
                  Finishes assigned to this room *
                </p>
                <div className="space-y-2">
                  {(room.finishes ?? []).map((f, fi) => (
                    <div key={fi} className="flex flex-wrap sm:flex-nowrap gap-2 items-stretch sm:items-center bg-[#1a1a1a] rounded p-2">
                      <select
                        value={f.finish_group_id}
                        onChange={(e) => updateRoomFinish(room.id, fi, { finish_group_id: e.target.value })}
                        className={SELECT + " flex-1"}
                      >
                        <option value="">-- Select Finish Group --</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.label}{g.finish_type ? ` · ${g.finish_type.toUpperCase()}` : ""}{g.species ? ` · ${g.species}` : ""}{g.color_name ? ` · ${g.color_name.split(" - ")[0]}` : ""}
                          </option>
                        ))}
                      </select>
                      <input
                        value={f.zone}
                        onChange={(e) => updateRoomFinish(room.id, fi, { zone: e.target.value })}
                        placeholder="Finish Notes (e.g. Perimeter, Island, Tall Panels)"
                        className={INPUT + " w-full sm:w-72"}
                      />
                      <button onClick={() => removeRoomFinish(room.id, fi)} className="text-white/20 hover:text-red-400 transition-colors px-1 shrink-0">x</button>
                    </div>
                  ))}
                  <button
                    onClick={() => addRoomFinish(room.id)}
                    className="text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-[10px] transition-colors"
                  >
                    + Add Finish to Room
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-white/5">
                <p className="text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-3">Accessories</p>
                <div className="space-y-2">
                  {room.accessories.map((acc, ai) => (
                    <AccessoryPickerRow
                      key={ai}
                      acc={acc}
                      revaAccessories={catalogs.revaAccessories}
                      onUpdate={(patch) => updateAccessory(room.id, ai, patch)}
                      onRemove={() => removeAccessory(room.id, ai)}
                    />
                  ))}
                  <button onClick={() => addAccessory(room.id)} className="text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-[10px] transition-colors">
                    + Add Accessory
                  </button>
                </div>
              </div>

              {/* Trim section (Phase 3d) */}
              <div className="pt-2 border-t border-white/5">
                <p className="text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-3">Trim Callouts</p>
                <div className="space-y-2">
                  {(room.trim ?? []).map((tr, ti) => (
                    <div key={ti} className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#1a1a1a] rounded p-2">
                      <div>
                        <label className={LABEL}>Type</label>
                        <select value={tr.trim_type} onChange={(e) => updateTrim(room.id, ti, { trim_type: e.target.value })} className={SELECT}>
                          {["Crown Molding","Valance","Toekick","Light Rail","Scribe Molding","Base Shoe","Crown Nailer","Filler","Other"].map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={LABEL}>Size/Description</label>
                        <input value={tr.size_desc} onChange={(e) => updateTrim(room.id, ti, { size_desc: e.target.value })} placeholder='e.g. 4.5" crown' className={INPUT} />
                      </div>
                      <div>
                        <label className={LABEL}>Notes</label>
                        <input value={tr.material} onChange={(e) => updateTrim(room.id, ti, { material: e.target.value })} placeholder="Special conditions, stick counts, install notes..." className={INPUT} />
                      </div>
                      <div>
                        <label className={LABEL}>LF Qty</label>
                        <div className="flex gap-1">
                          <input type="number" min={0} step={0.5} value={tr.qty_lf} onChange={(e) => updateTrim(room.id, ti, { qty_lf: parseFloat(e.target.value) || 0 })} className={INPUT + " w-24"} />
                          <button onClick={() => removeTrim(room.id, ti)} className="text-white/20 hover:text-red-400 transition-colors px-2 shrink-0">×</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-3">
                    <button onClick={() => addTrim(room.id)} className="text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-[10px] transition-colors">+ Add Trim</button>
                    {(room.trim ?? []).length > 0 && (
                      <button onClick={() => saveTrim(room.id, room.trim ?? [])} className="text-[#f08122]/60 hover:text-[#f08122] font-condensed uppercase tracking-widest text-[10px] transition-colors">Save Trim</button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-4 gap-3">
                <div>
                  <label className={LABEL}>Flooring</label>
                  <input value={room.flooring ?? ""} onChange={(e) => updateRoom(room.id, { flooring: e.target.value })} placeholder="Tile, Hardwood, Carpet..." className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Ceiling Height</label>
                  <input value={room.ceiling_height ?? ""} onChange={(e) => updateRoom(room.id, { ceiling_height: e.target.value })} placeholder="9', 10', Vaulted..." className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Soffit</label>
                  <input value={room.soffit ?? ""} onChange={(e) => updateRoom(room.id, { soffit: e.target.value })} placeholder="12&quot;, 18&quot;, None..." className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Backsplash</label>
                  <input value={room.backsplash ?? ""} onChange={(e) => updateRoom(room.id, { backsplash: e.target.value })} placeholder="Tile, Stone, None..." className={INPUT} />
                </div>
              </div>
              <div>
                <label className={LABEL}>Room Notes</label>
                <input value={room.notes} onChange={(e) => updateRoom(room.id, { notes: e.target.value })} placeholder="Crown, light rail, special conditions..." className={INPUT} />
              </div>
            </div>
          ))}
          <button onClick={addRoom} className="border border-dashed border-white/20 hover:border-[#f08122] text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs rounded py-3 px-6 transition-colors w-full">
            + Add Room
          </button>
        </div>
      )}

      {/* CABINETS — removed from tabs (Karl 2026-07-09) */}
      {false && tab === "cabinets" && (
        <CabinetsDrawingsView
          jobId={jobId}
          legacyManualEntry={
            <div className="space-y-8">
              {rooms.length === 0 && (
                <div className="bg-yellow-900/20 border border-yellow-700/30 rounded p-4 text-yellow-300/70 text-xs font-condensed uppercase tracking-widest">
                  Define rooms first.
                </div>
              )}
              {rooms.map((room) => {
                const firstFinishId = (room.finishes ?? []).find((f) => f.finish_group_id)?.finish_group_id ?? room.finish_group_id;
                const fg = firstFinishId ? groups.find((g) => g.id === firstFinishId) : undefined;
                const totalPcs = room.cabinets.reduce((n, c) => n + c.qty, 0);
                return (
                  <div key={room.id} className="bg-[#2d2d2d] rounded p-4 sm:p-6">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <span className="text-white text-sm font-medium">{room.name || "Unnamed Room"}</span>
                        {fg && <span className="ml-3 text-white/30 text-xs font-condensed uppercase tracking-widest">{fg.label}</span>}
                        {(room.finishes ?? []).length > 1 && (
                          <span className="ml-3 text-[#f08122]/60 text-xs font-condensed uppercase tracking-widest">
                            +{(room.finishes ?? []).length - 1} more finish{(room.finishes ?? []).length - 1 === 1 ? "" : "es"}
                          </span>
                        )}
                      </div>
                      {totalPcs > 0 && (
                        <span className="text-white/20 text-xs font-condensed uppercase tracking-widest">{totalPcs} pcs</span>
                      )}
                    </div>
                    <div className="space-y-3">
                      {room.cabinets.map((cab, ci) => {
                        const fam = catalogs.cabinetFamilies.find((f) => f.family_code === cab.family_code);
                        return (
                          <CabinetRow
                            key={cab.id}
                            cab={cab}
                            fam={fam}
                            families={catalogs.cabinetFamilies}
                            onChange={(patch) => updateCabinet(room.id, ci, patch)}
                            onRemove={() => removeCabinet(room.id, ci)}
                          />
                        );
                      })}
                    </div>
                    <button
                      onClick={() => addCabinet(room.id)}
                      className="mt-4 border border-dashed border-white/20 hover:border-[#f08122] text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs rounded py-2 px-5 transition-colors w-full"
                    >
                      + Add Cabinet
                    </button>
                  </div>
                );
              })}
            </div>
          }
        />
      )}

      {/* SPEC DETAILS — appliances, accessories, hardware */}
      {tab === "specDetails" && (
        <div className="space-y-6">
          <p className="text-white/30 text-xs font-condensed uppercase tracking-widest">
            List all appliances and plumbing fixtures. Audience: engineer (rough-in reference) and client (change tracking).
          </p>
          <div className="space-y-2">
            {appliances.map((ap, ai) => (
              <div key={ai} className="bg-[#2d2d2d] rounded p-3 space-y-2">
                {/* Row 1: Type / Manufacturer / Model / Room / Notes + remove */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div>
                    <label className={LABEL}>Type</label>
                    {(() => {
                      const KNOWN_TYPES = ["Range","Hood","Dishwasher","Refrigerator","Microwave","Wine Fridge","Warming Drawer","Washer/Dryer","Ice Maker","Under-Mount Sink","Apron Sink","Plumbing Fixture","Sink","Faucet","Other"];
                      const selectVal = KNOWN_TYPES.includes(ap.appliance_type) ? ap.appliance_type : (ap.appliance_type ? "Other" : "");
                      const isOther = selectVal === "Other";
                      return (
                        <>
                          <select
                            value={selectVal}
                            onChange={(e) => updateAppliance(ai, { appliance_type: e.target.value })}
                            className={SELECT}
                          >
                            <option value="">-- Type --</option>
                            {KNOWN_TYPES.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                          {isOther && (
                            <input
                              value={KNOWN_TYPES.includes(ap.appliance_type) ? "" : ap.appliance_type}
                              onChange={(e) => updateAppliance(ai, { appliance_type: e.target.value || "Other" })}
                              placeholder="Describe…"
                              className={INPUT + " mt-1"}
                            />
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div>
                    <label className={LABEL}>Manufacturer</label>
                    <input value={ap.manufacturer} onChange={(e) => updateAppliance(ai, { manufacturer: e.target.value })} placeholder="Brand" className={INPUT} />
                  </div>
                  <div>
                    <label className={LABEL}>Model #</label>
                    <input
                      value={ap.model_no}
                      onChange={(e) => {
                        const val = e.target.value;
                        const match = catalogs.applianceCatalog?.find((r) => r.model.toLowerCase() === val.toLowerCase());
                        updateAppliance(ai, {
                          model_no: val,
                          ...(match ? { cutout_w: String(match.cutout_w), cutout_h: String(match.cutout_h), cutout_d: String(match.cutout_d) } : {}),
                        });
                      }}
                      placeholder="Model / Part #"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Room</label>
                    <select value={ap.room_id} onChange={(e) => updateAppliance(ai, { room_id: e.target.value })} className={SELECT}>
                      <option value="">-- Any Room --</option>
                      {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Notes</label>
                    <div className="flex gap-1">
                      <input value={ap.notes} onChange={(e) => updateAppliance(ai, { notes: e.target.value })} placeholder="Panel Ready, etc." className={INPUT} />
                      <button onClick={() => removeAppliance(ai)} className="text-white/20 hover:text-red-400 transition-colors px-2 shrink-0">×</button>
                    </div>
                  </div>
                </div>
                {/* Row 2: Cutout dims (W × H × D) */}
                <div className="flex items-end gap-2">
                  <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest self-center pr-1">Cutout</p>
                  {(["cutout_w","cutout_h","cutout_d"] as const).map((dim) => (
                    <div key={dim} className="w-20">
                      <label className={LABEL}>{dim === "cutout_w" ? "W″" : dim === "cutout_h" ? "H″" : "D″"}</label>
                      <input
                        type="number"
                        step="0.125"
                        value={ap[dim as keyof ApplianceRow] as string ?? ""}
                        onChange={(e) => updateAppliance(ai, { [dim]: e.target.value } as Partial<ApplianceRow>)}
                        placeholder="—"
                        className={INPUT}
                      />
                    </div>
                  ))}
                  <p className="text-white/20 text-[10px] self-end pb-2">inches — auto-fills if model # is in catalog</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={addAppliance} className="border border-dashed border-white/20 hover:border-[#f08122] text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs rounded py-3 px-6 transition-colors">
              + Add Appliance
            </button>
            {appliances.length > 0 && (
              <button onClick={saveAppliances} className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs py-3 px-6 rounded transition-colors">
                Save Appliances
              </button>
            )}
          </div>

          {/* ── Accessories ──────────────────────────────────────────────── */}
          <div className="pt-6 border-t border-white/10">
            <p className="text-white/30 text-xs font-condensed uppercase tracking-widest mb-3">Accessories</p>
            <div className="space-y-2">
              {specAccs.map((a, ai) => (
                <div key={ai} className="bg-[#2d2d2d] rounded p-3">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <div>
                      <label className={LABEL}>Type</label>
                      <input value={a.type} onChange={(e) => updateSpecAcc(ai, { type: e.target.value })} placeholder="Closet Rod, Lazy Susan…" className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>Part #</label>
                      <input value={a.part_number} onChange={(e) => updateSpecAcc(ai, { part_number: e.target.value })} placeholder="Part #" className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>Room</label>
                      <input value={a.room} onChange={(e) => updateSpecAcc(ai, { room: e.target.value })} placeholder="Kitchen, Master Bath…" className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>Size</label>
                      <input value={a.size} onChange={(e) => updateSpecAcc(ai, { size: e.target.value })} placeholder='48", 15"…' className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>Notes</label>
                      <div className="flex gap-1">
                        <input value={a.notes} onChange={(e) => updateSpecAcc(ai, { notes: e.target.value })} placeholder="Notes" className={INPUT} />
                        <button onClick={() => removeSpecAcc(ai)} className="text-white/20 hover:text-red-400 transition-colors px-2 shrink-0">×</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-2">
              <button onClick={addSpecAcc} className="border border-dashed border-white/20 hover:border-[#f08122] text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs rounded py-3 px-6 transition-colors">
                + Add Accessory
              </button>
              {specAccs.length > 0 && (
                <button onClick={saveSpecAccs} className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs py-3 px-6 rounded transition-colors">
                  Save Accessories
                </button>
              )}
            </div>
          </div>

          {/* ── Hardware ─────────────────────────────────────────────────── */}
          <div className="pt-6 border-t border-white/10">
            <p className="text-white/30 text-xs font-condensed uppercase tracking-widest mb-3">Hardware</p>
            <p className="text-white/20 text-[10px] font-condensed mb-3">Hinges, drawer guides, shelf clips, special callouts (heavy-duty glides, hinge restrictors, etc.)</p>
            <div className="space-y-2">
              {specHW.map((h, hi) => (
                <div key={hi} className="bg-[#2d2d2d] rounded p-3">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <div>
                      <label className={LABEL}>Type</label>
                      <input value={h.type} onChange={(e) => updateSpecHW(hi, { type: e.target.value })} placeholder="Hinges, Drawer Slides…" className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>Part #</label>
                      <input value={h.part_no} onChange={(e) => updateSpecHW(hi, { part_no: e.target.value })} placeholder="Part #" className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>Room</label>
                      <input value={h.room} onChange={(e) => updateSpecHW(hi, { room: e.target.value })} placeholder="All, Kitchen…" className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>Qty</label>
                      <input type="number" min={0} value={h.qty} onChange={(e) => updateSpecHW(hi, { qty: parseInt(e.target.value) || 1 })} className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>Notes</label>
                      <div className="flex gap-1">
                        <input value={h.notes} onChange={(e) => updateSpecHW(hi, { notes: e.target.value })} placeholder="Notes" className={INPUT} />
                        <button onClick={() => removeSpecHW(hi)} className="text-white/20 hover:text-red-400 transition-colors px-2 shrink-0">×</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-2 flex-wrap">
              {specHW.length === 0 && (
                <button
                  onClick={() => {
                    const defaults: SpecHardwareItem[] = [
                      { id: uid(), type: "Hinges", part_no: "", room: "All", qty: 1, notes: "", sort_order: 0 },
                      { id: uid(), type: "Drawer Slides", part_no: "", room: "All", qty: 1, notes: "", sort_order: 1 },
                      { id: uid(), type: "Shelf Clips", part_no: "", room: "All", qty: 1, notes: "", sort_order: 2 },
                      { id: uid(), type: "Soft-Close Buffers", part_no: "", room: "All", qty: 1, notes: "", sort_order: 3 },
                    ];
                    setSpecHW(defaults); markDirty();
                  }}
                  className="bg-white/5 hover:bg-white/10 border border-white/15 text-white/50 hover:text-white font-condensed uppercase tracking-widest text-xs rounded py-3 px-5 transition-colors"
                >
                  Preload Standard Hardware
                </button>
              )}
              <button onClick={addSpecHW} className="border border-dashed border-white/20 hover:border-[#f08122] text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs rounded py-3 px-6 transition-colors">
                + Add Hardware Row
              </button>
              {specHW.length > 0 && (
                <button onClick={saveSpecHW} className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs py-3 px-6 rounded transition-colors">
                  Save Hardware
                </button>
              )}
            </div>
          </div>

          {/* ── Edgeband Schedule (preview, per FG) ──────────────────────── */}
          <div className="pt-6 border-t border-white/10">
            <p className="text-white/30 text-xs font-condensed uppercase tracking-widest mb-1">Edgeband Schedule</p>
            <p className="text-white/20 text-[10px] font-condensed mb-4">
              Auto-derived from finish group selections. These rows print on the Work Order sheets (W.1, W.2…). Verify before generating the PDF.
            </p>
            {groups.map((g) => {
              const eb   = catalogs.edgebands.find((e) => e.id === g.edgeband_id);
              const carc = catalogs.carcassMaterials.find((c) => c.id === g.carcass_id);

              // Face edgeband rows: D, E, V
              let faceThick: string, faceMfr: string, facePart: string, faceDesc: string;
              if (g.finish_type === "paint") {
                faceThick = "3.0"; faceMfr = "Internal"; facePart = "STOCK"; faceDesc = "Paint to Match";
              } else if (g.finish_type === "stain") {
                faceThick = "3.0"; faceMfr = "Internal"; facePart = "STOCK"; faceDesc = "Stain to Match";
              } else {
                faceThick = eb?.thickness_mm || "1MM";
                faceMfr   = eb?.supplier     || "";
                faceDesc  = g.label.replace("-", " "); // "MEL-1" → "MEL 1"
                // Extract catalog part# from product name (e.g. "Uniboard K15 Cannes…" → "K15")
                const internals = ["Internal", "Stock"];
                facePart = eb && !internals.includes(eb.supplier)
                  ? (() => {
                      const stripped = eb.product_name.startsWith(eb.supplier)
                        ? eb.product_name.slice(eb.supplier.length).trim()
                        : eb.product_name;
                      return stripped.split(/\s+/)[0] || "";
                    })()
                  : "STOCK";
              }

              // Interior edgeband rows: I, U
              const carcName    = (carc?.name || "").toLowerCase();
              const interiorDesc = carcName.includes("plywood") || carcName.includes("birch")
                ? "PF MAPLE" : "HARDROCK MAPLE";

              const ebRows = [
                { code: "D", thick: faceThick, mfr: faceMfr, part: facePart, desc: faceDesc,     where: "Applied End Panels / Door & Drawer Fronts" },
                { code: "E", thick: faceThick, mfr: faceMfr, part: facePart, desc: faceDesc,     where: "Cabinet Body Parts"                        },
                { code: "I", thick: ".018",    mfr: "Stock",  part: "STOCK",  desc: interiorDesc, where: "Adjustable Shelves"                         },
                { code: "V", thick: faceThick, mfr: faceMfr, part: facePart, desc: faceDesc,     where: "Bottom of Upper F.E."                       },
                { code: "U", thick: ".018",    mfr: "Stock",  part: "STOCK",  desc: interiorDesc, where: "Bottom of Upper UN-F.E."                    },
                { code: "B", thick: ".018",    mfr: "Stock",  part: "STOCK",  desc: "PF MAPLE",   where: "Drawer Box Sides"                           },
                { code: "C", thick: ".018",    mfr: "Stock",  part: "STOCK",  desc: "PF MAPLE",   where: "Drawer Box Front and Backs"                 },
                { code: "X", thick: "",        mfr: "",       part: "",       desc: "",            where: "MISC"                                       },
              ];

              return (
                <div key={g.id} className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[#f08122] font-condensed font-bold text-xs uppercase tracking-widest">{g.label}</span>
                    {g.color_name && <span className="text-white/40 text-[10px] font-condensed">· {g.color_name}</span>}
                    <span className="text-white/20 text-[10px] font-condensed uppercase tracking-wider">({g.finish_type})</span>
                  </div>
                  <div className="overflow-x-auto rounded">
                    <table className="w-full text-[10px] font-condensed border-collapse">
                      <thead>
                        <tr className="bg-[#3d3d3d] text-white">
                          <th className="text-left px-2 py-1.5 font-bold uppercase tracking-wider text-[9px] w-7">ID</th>
                          <th className="text-left px-2 py-1.5 font-bold uppercase tracking-wider text-[9px] w-12">Thick.</th>
                          <th className="text-left px-2 py-1.5 font-bold uppercase tracking-wider text-[9px] w-24">Mfr.</th>
                          <th className="text-left px-2 py-1.5 font-bold uppercase tracking-wider text-[9px] w-14">#</th>
                          <th className="text-left px-2 py-1.5 font-bold uppercase tracking-wider text-[9px] w-32">Description</th>
                          <th className="text-left px-2 py-1.5 font-bold uppercase tracking-wider text-[9px]">Where Used</th>
                          <th className="text-left px-2 py-1.5 font-bold uppercase tracking-wider text-[9px] w-20">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ebRows.map((row, ri) => (
                          <tr key={row.code} className={ri % 2 === 0 ? "bg-[#2d2d2d]" : "bg-[#262626]"}>
                            <td className="px-2 py-1.5 font-bold text-[#f08122]">{row.code}</td>
                            <td className="px-2 py-1.5 text-white/50">{row.thick || "—"}</td>
                            <td className="px-2 py-1.5 text-white/60">{row.mfr || "—"}</td>
                            <td className="px-2 py-1.5 text-white/60">{row.part || "—"}</td>
                            <td className="px-2 py-1.5 font-bold text-white/80">{row.desc || <span className="text-white/20 italic font-normal">blank</span>}</td>
                            <td className="px-2 py-1.5 text-white/40">{row.where}</td>
                            <td className="px-2 py-1.5 text-white/20 italic">—</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUMMARY */}
      {tab === "summary" && (
        <div className="space-y-6">

          {/* ── Validation banner ─────────────────────────────────────── */}
          {(() => {
            const issues: string[] = [];
            if (groups.length === 0) issues.push("No finish groups defined");
            groups.forEach((g) => {
              if (!g.door_style_id) issues.push(`${g.label}: no door style selected`);
              if (!g.carcass_id) issues.push(`${g.label}: no carcass material selected`);
              if (!g.drawer_box_id) issues.push(`${g.label}: no drawer box selected`);
              if (!g.edgeband_id) issues.push(`${g.label}: no edgeband selected`);
            });
            rooms.forEach((r) => {
              const hasFinish = (r.finishes ?? []).some((f) => f.finish_group_id) || r.finish_group_id;
              if (!hasFinish) issues.push(`Room "${r.name || "Unnamed"}": no finish group assigned`);
            });
            if (issues.length === 0) return (
              <div className="flex items-center gap-2 text-green-400/80 text-xs font-condensed uppercase tracking-widest">
                <span>✓</span><span>All required fields complete — ready to generate</span>
              </div>
            );
            return (
              <div className="bg-yellow-400/10 border border-yellow-400/30 rounded p-4 space-y-1">
                <p className="text-yellow-400 text-xs font-condensed uppercase tracking-widest mb-2">⚠ {issues.length} issue{issues.length > 1 ? "s" : ""} to fix before generating</p>
                {issues.map((iss, i) => (
                  <p key={i} className="text-yellow-300/70 text-xs">· {iss}</p>
                ))}
              </div>
            );
          })()}

          {/* ── Finish Groups ─────────────────────────────────────────── */}
          <div>
            <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mb-3">Finish Groups</p>
            <div className="space-y-3">
              {groups.map((g) => {
                const door = catalogs.doorStyles.find((d) => d.id === g.door_style_id);
                const carc = catalogs.carcassMaterials.find((c) => c.id === g.carcass_id);
                const dbox = catalogs.drawerBoxes.find((d) => d.id === g.drawer_box_id);
                const EDGEBAND_SENTINEL_LABELS: Record<string,string> = {
                  MATCH_PAINT_STAIN: "Paint/Stain to Match",
                  PVC_SPECIFY: "PVC (see Schedules)",
                  OTHER_EDGEBAND: "Other",
                };
                const eb   = catalogs.edgebands.find((e) => e.id === g.edgeband_id);
                const ebLabel = eb?.product_name ?? EDGEBAND_SENTINEL_LABELS[g.edgeband_id] ?? g.edgeband_id;
                const fgPulls = pulls[g.id] ?? [];
                const doorFlag = !g.door_style_id || door?.name === "Other / Custom";
                return (
                  <div key={g.id} className="bg-[#2d2d2d] rounded p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-[#f08122] font-condensed uppercase tracking-widest text-xs">{g.label}</span>
                      <span className="text-white/40 text-xs">{g.finish_type}</span>
                      {doorFlag && <span className="text-yellow-400 text-[10px] font-condensed uppercase tracking-widest">⚠ door needs attention</span>}
                    </div>
                    <div className="grid sm:grid-cols-3 gap-x-6 gap-y-1 text-xs mb-3">
                      <SumRow label="Color"         value={g.color_name?.split(" — ")?.[0] || g.color_name} />
                      <SumRow label="Door Style"    value={door?.name} warn={doorFlag} />
                      <SumRow label="Applied Panels" value={g.applied_panels} />
                      <SumRow label="Species"       value={g.species} />
                      <SumRow label="Carcass"       value={carc?.name} />
                      <SumRow label="Drawer Box"    value={dbox?.name} />
                      <SumRow label="Edgeband"      value={eb?.product_name} />
                    </div>
                    {fgPulls.length > 0 && (
                      <div>
                        <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mb-1">Pulls</p>
                        <div className="space-y-0.5">
                          {fgPulls.map((p, pi) => (
                            <p key={pi} className="text-white/60 text-xs">
                              {p.description}{p.finish_color ? ` · ${p.finish_color}` : ""}{p.qty ? ` · qty ${p.qty}` : ""}{p.where_used ? ` · ${p.where_used}` : ""}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Rooms ─────────────────────────────────────────────────── */}
          <div>
            <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mb-3">Rooms</p>
            <div className="space-y-3">
              {rooms.map((room) => {
                const finishes = (room.finishes ?? []).filter((f) => f.finish_group_id);
                const links = finishes.length > 0
                  ? finishes
                  : (room.finish_group_id ? [{ finish_group_id: room.finish_group_id, zone: "", sort_order: 0 }] : []);
                const hasFinish = links.length > 0;
                return (
                  <div key={room.id} className={`bg-[#2d2d2d] rounded p-4 ${!hasFinish ? "border border-yellow-400/30" : ""}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <p className="text-white text-sm font-medium">{room.name || "Unnamed Room"}</p>
                      {!hasFinish && <span className="text-yellow-400 text-[10px] font-condensed uppercase tracking-widest">⚠ no finish assigned</span>}
                    </div>
                    {links.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {links.map((link, li) => {
                          const fg = groups.find((g) => g.id === link.finish_group_id);
                          return (
                            <span key={li} className="text-[#f08122]/80 text-xs font-condensed uppercase tracking-widest">
                              {link.zone ? `${link.zone} · ` : ""}{fg?.label ?? "?"}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {(room.accessories ?? []).filter((a) => a.acc_id).length > 0 && (
                      <div className="mb-1">
                        <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mb-0.5">Accessories</p>
                        {room.accessories.filter((a) => a.acc_id).map((a, ai) => {
                          const acc = catalogs.revaAccessories.find((x) => x.id === a.acc_id);
                          return <p key={ai} className="text-white/60 text-xs">{acc?.name ?? a.acc_id}{a.size ? ` · ${a.size}"` : ""}{a.handed && a.handed !== "N/A" ? ` · ${a.handed}` : ""} · qty {a.qty}</p>;
                        })}
                      </div>
                    )}
                    {(room.trim ?? []).length > 0 && (
                      <div>
                        <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mb-0.5">Trim</p>
                        {room.trim.map((t, ti) => (
                          <p key={ti} className="text-white/60 text-xs">{t.trim_type}{t.size_desc ? ` · ${t.size_desc}` : ""}{t.qty_lf ? ` · ${t.qty_lf} LF` : ""}</p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Appliances ────────────────────────────────────────────── */}
          {appliances.length > 0 && (
            <div>
              <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mb-3">Appliances</p>
              <div className="bg-[#2d2d2d] rounded p-4 space-y-1">
                {appliances.map((ap, ai) => {
                  const room = rooms.find((r) => r.id === ap.room_id);
                  const dims = [ap.cutout_w, ap.cutout_h, ap.cutout_d].filter(Boolean);
                  return (
                    <p key={ai} className="text-white/60 text-xs">
                      {ap.appliance_type}{ap.manufacturer ? ` · ${ap.manufacturer}` : ""}{ap.model_no ? ` · ${ap.model_no}` : ""}
                      {room ? ` · ${room.name}` : ""}
                      {dims.length === 3 ? ` · ${ap.cutout_w}W × ${ap.cutout_h}H × ${ap.cutout_d}D″` : ""}
                      {ap.notes ? ` · ${ap.notes}` : ""}
                    </p>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

const CAB_CATS = ["Base", "Wall", "Tall", "Vanity", "Accessory"] as const;

function CabinetRow({
  cab, fam, families, onChange, onRemove,
}: {
  cab: CabinetItem;
  fam: CabinetFamily | undefined;
  families: CabinetFamily[];
  onChange: (patch: Partial<CabinetItem>) => void;
  onRemove: () => void;
}) {
  const widthOpts   = fam?.allowed_widths_in ?? [];
  const heightOpts  = fam?.allowed_heights_in ?? [];
  const showHinge   = fam?.requires_hinge_side ?? false;
  const showRollout = (fam?.options?.supports_rollouts && (fam.options.max_rollouts ?? 0) > 0) ?? false;
  const maxRollouts = fam?.options?.max_rollouts ?? 0;
  const showTrash   = fam?.options?.supports_trash_kit ?? false;
  const trashConfig = fam?.options?.trash_config ?? ["None", "Single", "Double"];
  const showApplied = fam?.options?.supports_applied_panels ?? false;
  const hasOptions  = showHinge || showRollout || showTrash || showApplied;

  function pickFamily(code: string) {
    const f = families.find((x) => x.family_code === code);
    onChange({
      family_code: code,
      width_in:   f?.allowed_widths_in?.[0]  ?? null,
      height_in:  f?.allowed_heights_in?.[0] ?? null,
      depth_in:   f?.default_depth_in        ?? null,
      hinge_side: "", rollout_trays_qty: 0, trash_kit: "None", applied_panels: false,
    });
  }

  const LABEL  = "block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5";
  const INPUT  = "w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] transition-colors";
  const SELECT = INPUT;

  return (
    <div className="bg-[#1a1a1a] border border-white/8 rounded p-4 space-y-3">
      <div className="flex gap-3 items-start">
        <select value={cab.family_code} onChange={(e) => pickFamily(e.target.value)} className={SELECT + " flex-1"}>
          <option value="">-- Select Cabinet Family --</option>
          {CAB_CATS.map((cat) => {
            const fams = families.filter((f) => f.category === cat);
            if (!fams.length) return null;
            return (
              <optgroup key={cat} label={cat}>
                {fams.map((f) => <option key={f.family_code} value={f.family_code}>{f.display_name}</option>)}
              </optgroup>
            );
          })}
        </select>
        <button onClick={onRemove} className="text-white/20 hover:text-red-400 transition-colors px-1 mt-2.5 text-sm shrink-0">x</button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className={LABEL}>Width (in)</label>
          {widthOpts.length > 0
            ? <select value={cab.width_in ?? ""} onChange={(e) => onChange({ width_in: Number(e.target.value) })} className={SELECT}>
                <option value="">--</option>
                {widthOpts.map((w) => <option key={w} value={w}>{w}&quot;</option>)}
              </select>
            : <input type="number" value={cab.width_in ?? ""} onChange={(e) => onChange({ width_in: parseFloat(e.target.value) || null })} className={INPUT} placeholder="W" />
          }
        </div>
        <div>
          <label className={LABEL}>Height (in)</label>
          {heightOpts.length > 0
            ? <select value={cab.height_in ?? ""} onChange={(e) => onChange({ height_in: Number(e.target.value) })} className={SELECT}>
                <option value="">--</option>
                {heightOpts.map((h) => <option key={h} value={h}>{h}&quot;</option>)}
              </select>
            : <input type="number" value={cab.height_in ?? ""} onChange={(e) => onChange({ height_in: parseFloat(e.target.value) || null })} className={INPUT} placeholder="H" />
          }
        </div>
        <div>
          <label className={LABEL}>Depth (in)</label>
          <input type="number" value={cab.depth_in ?? ""} onChange={(e) => onChange({ depth_in: parseFloat(e.target.value) || null })}
            className={INPUT} placeholder={fam?.default_depth_in ? String(fam.default_depth_in) : "D"} />
        </div>
        <div>
          <label className={LABEL}>Qty</label>
          <input type="number" min={1} value={cab.qty} onChange={(e) => onChange({ qty: parseInt(e.target.value) || 1 })} className={INPUT} />
        </div>
      </div>

      {hasOptions && (
        <div className="flex flex-wrap gap-4 items-end pt-1">
          {showHinge && (
            <div>
              <label className={LABEL}>Hinge Side</label>
              <select value={cab.hinge_side} onChange={(e) => onChange({ hinge_side: e.target.value })} className={SELECT + " w-28"}>
                <option value="">--</option>
                <option value="L">Left</option>
                <option value="R">Right</option>
              </select>
            </div>
          )}
          {showRollout && (
            <div>
              <label className={LABEL}>Rollout Trays (max {maxRollouts})</label>
              <input type="number" min={0} max={maxRollouts} value={cab.rollout_trays_qty}
                onChange={(e) => onChange({ rollout_trays_qty: Math.min(parseInt(e.target.value) || 0, maxRollouts) })}
                className={INPUT + " w-20"} />
            </div>
          )}
          {showTrash && (
            <div>
              <label className={LABEL}>Trash Kit</label>
              <select value={cab.trash_kit} onChange={(e) => onChange({ trash_kit: e.target.value })} className={SELECT + " w-36"}>
                {trashConfig.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}
          {showApplied && (
            <label className="flex items-center gap-2 cursor-pointer mt-5">
              <input type="checkbox" checked={cab.applied_panels} onChange={(e) => onChange({ applied_panels: e.target.checked })}
                className="accent-[#f08122] w-4 h-4" />
              <span className="text-white/50 text-xs font-condensed uppercase tracking-widest">Applied Panels</span>
            </label>
          )}
        </div>
      )}

      <div>
        <label className={LABEL}>Special Instructions</label>
        <input value={cab.special_instructions} onChange={(e) => onChange({ special_instructions: e.target.value })}
          placeholder="Custom dims, modifications, island back..." className={INPUT} />
      </div>
    </div>
  );
}

function SumRow({ label, value, warn }: { label: string; value?: string | null; warn?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-white/30 font-condensed uppercase tracking-wider mr-2">{label}:</span>
      <span className={`${warn ? "text-yellow-400" : "text-white/70 capitalize"}`}>{value}</span>
    </div>
  );
}
