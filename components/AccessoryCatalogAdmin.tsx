"use client";

import { useState, useMemo } from "react";

export type CatalogItem = {
  id: string;
  name: string;
  brand: string;
  series: string;
  category: string;
  width_options_in: string;
  finish_options: string;
  hand: string;
  image_url: string;
  price_slp: string;
  price_date: string;
  notes: string;
  active: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  trash:          "Trash pullout",
  rollout:        "Rollout shelf",
  lazy_susan:     "Corner / lazy susan (base)",
  blind_corner:   "Blind corner optimizer (base)",
  lazy_susan_wall:"Corner lazy susan (wall)",
  door_storage:   "Door mount",
  drawer:         "Drawer organizer",
  pantry:         "Pantry",
  specialty:      "Specialty",
  other:          "Custom / other",
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

const L = "text-[10px] font-condensed uppercase tracking-widest text-white/30 block mb-0.5";

export function AccessoryCatalogAdmin({ initialItems }: { initialItems: CatalogItem[] }) {
  const [items, setItems] = useState<CatalogItem[]>(initialItems);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  async function toggle(id: string, newActive: boolean) {
    setSaving((s) => new Set(s).add(id));
    setErrors((e) => { const m = new Map(e); m.delete(id); return m; });
    try {
      const res = await fetch("/api/admin/accessories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active: newActive }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) => prev.map((item) => item.id === id ? { ...item, active: newActive } : item));
    } catch (e) {
      setErrors((prev) => new Map(prev).set(id, (e as Error).message));
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return items;
    return items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.series.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)
    );
  }, [items, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const item of filtered) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    }
    return map;
  }, [filtered]);

  const totalActive = items.filter((i) => i.active).length;

  return (
    <div>
      {/* Stats + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="flex gap-4">
          <div className="bg-[#1a1b1c] border border-white/10 rounded-lg px-4 py-2.5 text-center">
            <div className={L}>Active</div>
            <div className="text-2xl font-medium text-[#f08122]">{totalActive}</div>
          </div>
          <div className="bg-[#1a1b1c] border border-white/10 rounded-lg px-4 py-2.5 text-center">
            <div className={L}>Total</div>
            <div className="text-2xl font-medium text-white">{items.length}</div>
          </div>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, series, or category…"
          className="flex-1 bg-[#1a1b1c] border border-white/10 focus:border-[#f08122] rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none transition-colors"
        />
      </div>

      {/* Grouped sections */}
      <div className="space-y-8">
        {CATEGORY_ORDER.map((cat) => {
          const catItems = grouped.get(cat) ?? [];
          if (catItems.length === 0) return null;
          const activeCount = catItems.filter((i) => i.active).length;
          return (
            <section key={cat}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="font-condensed uppercase tracking-widest text-xs text-[#f08122]">
                  {CATEGORY_LABELS[cat] ?? cat}
                </h2>
                <span className="text-[10px] font-condensed text-white/30">
                  {activeCount} / {catItems.length} active
                </span>
              </div>
              <div className="space-y-1.5">
                {catItems.map((item) => {
                  const isSaving = saving.has(item.id);
                  const err = errors.get(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-4 bg-[#1a1b1c] border rounded-lg px-4 py-3 transition-colors ${
                        item.active ? "border-white/10" : "border-white/5 opacity-50"
                      }`}
                    >
                      {/* Toggle */}
                      <button
                        onClick={() => toggle(item.id, !item.active)}
                        disabled={isSaving}
                        title={item.active ? "Click to deactivate" : "Click to activate"}
                        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                          isSaving ? "opacity-50 cursor-wait" :
                          item.active ? "bg-[#f08122]" : "bg-white/10"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                            item.active ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm text-white font-medium">{item.name}</span>
                          <span className="text-[10px] font-mono text-white/30">{item.series}</span>
                          {item.notes?.includes("WARNING") && (
                            <span className="text-[10px] bg-amber-900/30 text-amber-400 border border-amber-700/40 rounded px-1.5 py-0.5">
                              SKU unverified
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-white/30 mt-0.5">
                          {item.width_options_in && item.width_options_in !== "—" && (
                            <span className="mr-3">Sizes: {item.width_options_in.replace(/;/g, " / ")}"</span>
                          )}
                          {item.hand && item.hand !== "" && (
                            <span className="mr-3 text-amber-400/70">Handed</span>
                          )}
                          {item.price_slp && (
                            <span className="mr-3">List ${item.price_slp}</span>
                          )}
                        </div>
                        {err && <div className="text-[10px] text-red-400 mt-0.5">Error: {err}</div>}
                      </div>

                      {/* ID chip */}
                      <span className="text-[10px] font-mono text-white/20 flex-shrink-0">{item.id}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-white/20 text-sm italic mt-8">No items match your search.</p>
      )}
    </div>
  );
}
