"use client";

import { useState, useMemo } from "react";
import catalogData from "@/data/catalogs/acc_cabinet_catalog.json";

type CatalogEntry = {
  sku_prefix: string;
  display_name: string;
  category: string;
  cabinet_type_code: string;
  min_width_in: number;
  max_width_in: number;
  width_increment_in: number;
  allowed_heights_in: number | number[];
  default_height_in: number;
  allowed_depths_in: number | number[];
  default_depth_in: number;
  adj_shelves_default: number;
  compatible_features: string[];
  fixed_unit_price: number;
  notes: string | null;
  active: boolean;
};

const CATALOG = (catalogData as unknown as CatalogEntry[]).filter((r) => r.active);

const CATS = ["BASE", "UPPER", "TALL", "PANEL", "FILLER", "SHELF", "ACCESSORY"] as const;
const CAT_LABEL: Record<string, string> = {
  BASE: "Base", UPPER: "Upper", TALL: "Tall",
  PANEL: "Panels", FILLER: "Fillers",
  SHELF: "Shelves", ACCESSORY: "Accessories",
};

function range(min: number, max: number, inc: number): number[] {
  const out: number[] = [];
  for (let v = min; v <= max + 0.001; v += inc) out.push(Math.round(v * 100) / 100);
  return out;
}

function toArr(v: number | number[]): number[] {
  return Array.isArray(v) ? v : [v];
}

export type CatalogSelection = {
  catalog_entry: CatalogEntry;
  width_in: number;
  height_in: number;
  depth_in: number;
  qty: number;
  adj_shelves: number;
  feature_codes: string[];
};

export function CatalogPickerModal({
  onAdd,
  onClose,
}: {
  onAdd: (sel: CatalogSelection) => void;
  onClose: () => void;
}) {
  const [cat, setCat] = useState<string>("BASE");
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [depth, setDepth] = useState(0);
  const [qty, setQty] = useState(1);
  const [adjShelves, setAdjShelves] = useState(1);
  const [features, setFeatures] = useState<string[]>([]);

  function select(entry: CatalogEntry) {
    setSelected(entry);
    const widths = range(entry.min_width_in, entry.max_width_in, entry.width_increment_in);
    setWidth(widths[0] ?? entry.min_width_in);
    setHeight(entry.default_height_in);
    setDepth(entry.default_depth_in);
    setQty(1);
    setAdjShelves(Number(entry.adj_shelves_default) || 0);
    setFeatures([]);
  }

  function toggleFeature(code: string) {
    setFeatures((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  const catEntries = CATALOG.filter((e) => e.category === cat);
  const widthOptions = selected
    ? range(selected.min_width_in, selected.max_width_in, selected.width_increment_in)
    : [];
  const heightOptions = selected ? toArr(selected.allowed_heights_in) : [];
  const depthOptions  = selected ? toArr(selected.allowed_depths_in)  : [];

  // Prominent panel/filler features always shown first
  const PANEL_FEATURES = ["END_PANEL_L", "END_PANEL_R", "FILLER_L", "FILLER_R"];
  const compatFeatures = selected?.compatible_features ?? [];
  const panelFeats  = compatFeatures.filter((f) => PANEL_FEATURES.includes(f));
  const otherFeats  = compatFeatures.filter((f) => !PANEL_FEATURES.includes(f));

  const PANEL_LABEL: Record<string, string> = {
    END_PANEL_L: "Panel L", END_PANEL_R: "Panel R",
    FILLER_L:    "Filler L", FILLER_R:    "Filler R",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-[#0d0e0f] border border-white/15 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-base font-semibold text-white">Add from catalog</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-lg">✕</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left — category + type list */}
          <div className="w-56 border-r border-white/10 flex flex-col overflow-y-auto">
            {/* Category tabs */}
            <div className="flex flex-wrap gap-1 p-3 border-b border-white/10">
              {CATS.map((c) => (
                <button
                  key={c}
                  onClick={() => { setCat(c); setSelected(null); }}
                  className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                    cat === c
                      ? "bg-[#f08122] text-black font-medium"
                      : "text-white/40 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {CAT_LABEL[c]}
                </button>
              ))}
            </div>
            {/* Type list */}
            <div className="flex-1 overflow-y-auto py-1">
              {catEntries.map((e) => (
                <button
                  key={e.sku_prefix}
                  onClick={() => select(e)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    selected?.sku_prefix === e.sku_prefix
                      ? "bg-[#f08122]/15 text-[#f08122]"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {e.display_name}
                </button>
              ))}
            </div>
          </div>

          {/* Right — configuration */}
          <div className="flex-1 overflow-y-auto p-5">
            {!selected ? (
              <div className="text-sm text-white/30 italic pt-8 text-center">
                Select a cabinet type from the list
              </div>
            ) : (
              <div className="space-y-4">
                {/* Dimensions */}
                <div className="grid grid-cols-3 gap-3">
                  {/* Width */}
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1 font-condensed">Width</div>
                    <select
                      value={width}
                      onChange={(e) => setWidth(parseFloat(e.target.value))}
                      className="w-full bg-[#1a1b1c] border border-white/15 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122]/60"
                    >
                      {widthOptions.map((w) => (
                        <option key={w} value={w}>{w}"</option>
                      ))}
                    </select>
                  </div>
                  {/* Height */}
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1 font-condensed">Height</div>
                    {heightOptions.length > 1 ? (
                      <select
                        value={height}
                        onChange={(e) => setHeight(parseFloat(e.target.value))}
                        className="w-full bg-[#1a1b1c] border border-white/15 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122]/60"
                      >
                        {heightOptions.map((h) => (
                          <option key={h} value={h}>{h}"</option>
                        ))}
                      </select>
                    ) : (
                      <div className="bg-[#1a1b1c] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white/40">
                        {height}"
                      </div>
                    )}
                  </div>
                  {/* Depth */}
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1 font-condensed">Depth</div>
                    {depthOptions.length > 1 ? (
                      <select
                        value={depth}
                        onChange={(e) => setDepth(parseFloat(e.target.value))}
                        className="w-full bg-[#1a1b1c] border border-white/15 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122]/60"
                      >
                        {depthOptions.map((d) => (
                          <option key={d} value={d}>{d}"</option>
                        ))}
                      </select>
                    ) : (
                      <div className="bg-[#1a1b1c] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white/40">
                        {depth}"
                      </div>
                    )}
                  </div>
                </div>

                {/* Qty + adj shelves */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1 font-condensed">Qty</div>
                    <input
                      type="number" min={1} max={99} value={qty}
                      onChange={(e) => setQty(parseInt(e.target.value) || 1)}
                      className="w-full bg-[#1a1b1c] border border-white/15 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122]/60"
                    />
                  </div>
                  {Number(selected.adj_shelves_default) > 0 && (
                    <div>
                      <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1 font-condensed">Adj Shelves</div>
                      <input
                        type="number" min={0} max={10} value={adjShelves}
                        onChange={(e) => setAdjShelves(parseInt(e.target.value) || 0)}
                        className="w-full bg-[#1a1b1c] border border-white/15 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122]/60"
                      />
                    </div>
                  )}
                </div>

                {/* Panel/filler toggles — prominent */}
                {panelFeats.length > 0 && (
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-widest mb-2 font-condensed">Panels & Fillers</div>
                    <div className="flex gap-2 flex-wrap">
                      {panelFeats.map((code) => (
                        <button
                          key={code}
                          onClick={() => toggleFeature(code)}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${
                            features.includes(code)
                              ? "bg-[#f08122] border-[#f08122] text-black"
                              : "border-white/20 text-white/50 hover:border-white/40 hover:text-white"
                          }`}
                        >
                          {PANEL_LABEL[code]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Other compatible features */}
                {otherFeats.length > 0 && (
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-widest mb-2 font-condensed">Options</div>
                    <div className="flex gap-2 flex-wrap">
                      {otherFeats.map((code) => (
                        <button
                          key={code}
                          onClick={() => toggleFeature(code)}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                            features.includes(code)
                              ? "bg-[#f08122]/20 border-[#f08122]/60 text-[#f08122]"
                              : "border-white/15 text-white/40 hover:border-white/30 hover:text-white/70"
                          }`}
                        >
                          {code.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selected.notes && (
                  <div className="text-xs text-white/30 italic">{selected.notes}</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-5 py-3 flex items-center justify-between">
          <div className="text-xs text-white/30">
            {selected ? `${selected.display_name} — ${width}" × ${height}" × ${depth}"` : ""}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="text-white/50 hover:text-white text-sm px-3 py-1.5 rounded-lg border border-white/10 transition-colors">
              Cancel
            </button>
            <button
              disabled={!selected}
              onClick={() => {
                if (!selected) return;
                onAdd({ catalog_entry: selected, width_in: width, height_in: height, depth_in: depth, qty, adj_shelves: adjShelves, feature_codes: features });
                onClose();
              }}
              className="bg-[#f08122] hover:bg-[#e07010] disabled:opacity-40 text-black font-medium text-sm px-4 py-1.5 rounded-lg transition-colors"
            >
              Add to estimate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
