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
  trash:           "Trash pullout",
  rollout:         "Rollout shelf",
  lazy_susan:      "Corner / lazy susan (base)",
  blind_corner:    "Blind corner optimizer (base)",
  lazy_susan_wall: "Corner lazy susan (wall)",
  door_storage:    "Door mount",
  drawer:          "Drawer organizer",
  pantry:          "Pantry",
  specialty:       "Specialty",
  other:           "Custom / other",
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);
const L = "text-[10px] font-condensed uppercase tracking-widest text-white/30 block mb-0.5";
const INP =
  "bg-[#111] border border-white/15 focus:border-[#f08122] rounded px-2 py-1.5 text-sm text-white placeholder-white/20 outline-none transition-colors w-full";

type Draft = { name: string; series: string; price_slp: string; notes: string };

export function AccessoryCatalogAdmin({ initialItems }: { initialItems: CatalogItem[] }) {
  const [items, setItems] = useState<CatalogItem[]>(initialItems);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", series: "", price_slp: "", notes: "" });

  // ── Toggle active ──────────────────────────────────────────────────────────
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
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, active: newActive } : item))
      );
    } catch (e) {
      setErrors((prev) => new Map(prev).set(id, (e as Error).message));
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  // ── Open edit ─────────────────────────────────────────────────────────────
  function startEdit(item: CatalogItem) {
    setEditingId(item.id);
    setDraft({ name: item.name, series: item.series, price_slp: item.price_slp, notes: item.notes });
    setErrors((e) => { const m = new Map(e); m.delete(item.id); return m; });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  // ── Save edit ─────────────────────────────────────────────────────────────
  async function saveEdit(id: string) {
    setSaving((s) => new Set(s).add(id + "_edit"));
    setErrors((e) => { const m = new Map(e); m.delete(id); return m; });
    try {
      const res = await fetch("/api/admin/accessories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...draft }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                name: draft.name,
                series: draft.series,
                price_slp: draft.price_slp,
                notes: draft.notes,
                price_date: draft.price_slp ? new Date().toISOString().slice(0, 10) : item.price_date,
              }
            : item
        )
      );
      setEditingId(null);
    } catch (e) {
      setErrors((prev) => new Map(prev).set(id, (e as Error).message));
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete(id + "_edit"); return n; });
    }
  }

  // ── Filter + group ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.series.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q)
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
                  const isEditSaving = saving.has(item.id + "_edit");
                  const isEditing = editingId === item.id;
                  const err = errors.get(item.id);

                  return (
                    <div
                      key={item.id}
                      className={`bg-[#1a1b1c] border rounded-lg transition-colors ${
                        item.active ? "border-white/10" : "border-white/5 opacity-50"
                      } ${isEditing ? "border-[#f08122]/40" : ""}`}
                    >
                      {/* Main row */}
                      <div className="flex items-center gap-4 px-4 py-3">
                        {/* Toggle */}
                        <button
                          onClick={() => toggle(item.id, !item.active)}
                          disabled={isSaving || isEditing}
                          title={item.active ? "Click to deactivate" : "Click to activate"}
                          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                            isSaving
                              ? "opacity-50 cursor-wait"
                              : item.active
                              ? "bg-[#f08122]"
                              : "bg-white/10"
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
                              <span className="mr-3">
                                Sizes: {item.width_options_in.replace(/;/g, " / ")}&quot;
                              </span>
                            )}
                            {item.hand && item.hand !== "" && (
                              <span className="mr-3 text-amber-400/70">Handed</span>
                            )}
                            {item.price_slp && (
                              <span className="mr-3 text-green-400/70">
                                ${item.price_slp}
                                {item.price_date && (
                                  <span className="text-white/20 ml-1">{item.price_date}</span>
                                )}
                              </span>
                            )}
                          </div>
                          {err && (
                            <div className="text-[10px] text-red-400 mt-0.5">Error: {err}</div>
                          )}
                        </div>

                        {/* ID + edit button */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-[10px] font-mono text-white/20">{item.id}</span>
                          <button
                            onClick={() => (isEditing ? cancelEdit() : startEdit(item))}
                            title={isEditing ? "Cancel edit" : "Edit item"}
                            className={`text-white/20 hover:text-[#f08122] transition-colors text-xs px-1 ${
                              isEditing ? "text-[#f08122]" : ""
                            }`}
                          >
                            {isEditing ? "✕" : "✎"}
                          </button>
                        </div>
                      </div>

                      {/* Inline edit form */}
                      {isEditing && (
                        <div className="border-t border-white/10 px-4 pb-4 pt-3 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className={L}>Name</label>
                              <input
                                className={INP}
                                value={draft.name}
                                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                              />
                            </div>
                            <div>
                              <label className={L}>Series code</label>
                              <input
                                className={INP}
                                value={draft.series}
                                placeholder="e.g. 5WB1"
                                onChange={(e) => setDraft((d) => ({ ...d, series: e.target.value }))}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className={L}>List price ($)</label>
                              <input
                                className={INP}
                                type="number"
                                step="0.01"
                                min="0"
                                value={draft.price_slp}
                                placeholder="e.g. 229.99"
                                onChange={(e) =>
                                  setDraft((d) => ({ ...d, price_slp: e.target.value }))
                                }
                              />
                            </div>
                            <div>
                              <label className={L}>Notes</label>
                              <input
                                className={INP}
                                value={draft.notes}
                                placeholder="e.g. WARNING — series unverified"
                                onChange={(e) =>
                                  setDraft((d) => ({ ...d, notes: e.target.value }))
                                }
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEdit(item.id)}
                              disabled={isEditSaving}
                              className="bg-[#f08122] hover:bg-[#d06010] disabled:opacity-50 text-white font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded transition-colors"
                            >
                              {isEditSaving ? "Saving…" : "Save"}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="text-white/30 hover:text-white font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
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
