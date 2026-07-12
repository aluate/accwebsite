"use client";

import { useState, useEffect, useCallback } from "react";

const WO_CATEGORIES = [
  { code: 1,   label: "Casework" },
  { code: 99,  label: "Panel Layup" },
  { code: 100, label: "Engineering" },
  { code: 200, label: "Project Management" },
  { code: 300, label: "Buy Outs" },
  { code: 400, label: "Submittals" },
  { code: 500, label: "Delivery" },
  { code: 600, label: "Installation" },
  { code: 700, label: "Rework" },
  { code: 800, label: "Change Order" },
  { code: 900, label: "Punch List" },
] as const;

type CategoryCode = typeof WO_CATEGORIES[number]["code"];

const STATUS_OPTS = ["pending", "in_progress", "shipped", "complete"] as const;
type WOStatus = typeof STATUS_OPTS[number];

const STATUS_COLOR: Record<WOStatus, string> = {
  pending:     "text-white/40",
  in_progress: "text-yellow-400",
  shipped:     "text-blue-400",
  complete:    "text-green-400",
};

function uid() { return Math.random().toString(36).slice(2, 10); }

interface WorkOrder {
  id: string;
  wo_number: string;
  category_code: CategoryCode;
  description: string;
  finish_group_id: string;
  status: WOStatus;
  ship_date: string;
  target_finish: string;
  notes: string;
  sort_order: number;
}

interface FinishGroup { id: string; label: string; finish_type: string }

interface Props {
  jobId: string;
}

export function WorkOrdersPanel({ jobId }: Props) {
  const [wos, setWos] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState<Set<CategoryCode>>(new Set([1]));

  const [finishGroups, setFinishGroups] = useState<FinishGroup[]>([]);

  useEffect(() => {
    fetch(`/api/jobs/${jobId}/work-orders`)
      .then(r => r.json())
      .then(d => {
        setWos(d.work_orders ?? []);
        setFinishGroups(d.finish_groups ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [jobId]);

  function mark() { setDirty(true); }

  function updateWO(id: string, patch: Partial<WorkOrder>) {
    setWos(prev => prev.map(w => w.id === id ? { ...w, ...patch } : w));
    mark();
  }

  function addWO(code: CategoryCode) {
    // For cat 1, pre-fill description from first unrepresented finish group
    const usedFgIds = wos.filter(w => w.category_code === 1).map(w => w.finish_group_id);
    const nextFg = finishGroups.find(fg => !usedFgIds.includes(fg.id));
    const newWO: WorkOrder = {
      id: uid(),
      wo_number: "",
      category_code: code,
      description: code === 1 ? (nextFg?.label ?? "") : "",
      finish_group_id: code === 1 ? (nextFg?.id ?? "") : "",
      status: "pending",
      ship_date: "",
      target_finish: "",
      notes: "",
      sort_order: wos.filter(w => w.category_code === code).length,
    };
    setWos(prev => [...prev, newWO]);
    mark();
  }

  function removeWO(id: string) {
    setWos(prev => prev.filter(w => w.id !== id));
    mark();
  }

  const save = useCallback(async () => {
    setSaving(true);
    await fetch(`/api/jobs/${jobId}/work-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ work_orders: wos }),
    });
    setSaving(false);
    setDirty(false);
  }, [jobId, wos]);

  function toggleCategory(code: CategoryCode) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  if (loading) return (
    <div className="mt-6 pt-4 border-t border-white/5">
      <p className="text-[10px] font-condensed uppercase tracking-widest text-white/30">Work Orders</p>
      <p className="text-white/20 text-xs mt-2">Loading…</p>
    </div>
  );

  return (
    <div className="mt-6 pt-4 border-t border-white/5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-condensed uppercase tracking-widest text-white/30">Work Orders</p>
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="text-[10px] font-condensed uppercase tracking-widest bg-[#f08122] hover:bg-[#d9711e] text-white px-3 py-1 rounded transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save WOs"}
          </button>
        )}
      </div>

      <div className="space-y-1">
        {WO_CATEGORIES.map(cat => {
          const catWOs = wos.filter(w => w.category_code === cat.code);
          const isOpen = expanded.has(cat.code);

          return (
            <div key={cat.code} className="rounded overflow-hidden border border-white/5">
              {/* Category header */}
              <button
                onClick={() => toggleCategory(cat.code)}
                className="w-full flex items-center justify-between px-3 py-2 bg-[#2a2a2a] hover:bg-[#303030] transition-colors text-left"
              >
                <span className="font-condensed uppercase tracking-widest text-xs">
                  <span className="text-[#f08122]">{cat.code}</span>
                  <span className="text-white/50 ml-2">— {cat.label}</span>
                  {catWOs.length > 0 && (
                    <span className="ml-2 text-white/30 text-[10px]">
                      ({catWOs.filter(w => w.wo_number).length}/{catWOs.length} assigned)
                    </span>
                  )}
                </span>
                <span className="text-white/30 text-xs">{isOpen ? "▲" : "▼"}</span>
              </button>

              {isOpen && (
                <div className="bg-[#252525]">
                  {catWOs.length === 0 ? (
                    <p className="text-white/20 text-[10px] font-condensed px-3 py-2">No WOs — add one below</p>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {catWOs.map(w => (
                        <div key={w.id} className="px-3 py-2 grid grid-cols-12 gap-2 items-start text-xs">
                          {/* WO# */}
                          <div className="col-span-2">
                            <p className="text-white/30 text-[9px] font-condensed uppercase mb-0.5">WO #</p>
                            <input
                              value={w.wo_number}
                              onChange={e => updateWO(w.id, { wo_number: e.target.value })}
                              placeholder="46508"
                              className="w-full bg-[#1e1e1e] border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#f08122]"
                            />
                          </div>

                          {/* Description */}
                          <div className="col-span-3">
                            <p className="text-white/30 text-[9px] font-condensed uppercase mb-0.5">Description</p>
                            {cat.code === 1 ? (
                              <div className="space-y-1">
                                <select
                                  value={w.finish_group_id || "__other__"}
                                  onChange={e => {
                                    if (e.target.value === "__other__") {
                                      updateWO(w.id, { finish_group_id: "", description: w.description });
                                    } else {
                                      const fg = finishGroups.find(f => f.id === e.target.value);
                                      updateWO(w.id, { finish_group_id: e.target.value, description: fg?.label ?? "" });
                                    }
                                  }}
                                  className="w-full bg-[#1e1e1e] border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#f08122]"
                                >
                                  <option value="__other__">— Other / freeform —</option>
                                  {finishGroups.map(fg => (
                                    <option key={fg.id} value={fg.id}>{fg.label}</option>
                                  ))}
                                </select>
                                {/* Always show text input — lets PM customize FG label or enter freeform */}
                                <input
                                  value={w.description}
                                  onChange={e => updateWO(w.id, { description: e.target.value })}
                                  placeholder={w.finish_group_id ? "Description (auto-filled from FG)" : "Description"}
                                  className="w-full bg-[#1e1e1e] border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#f08122]"
                                />
                              </div>
                            ) : (
                              <input
                                value={w.description}
                                onChange={e => updateWO(w.id, { description: e.target.value })}
                                placeholder="Description"
                                className="w-full bg-[#1e1e1e] border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#f08122]"
                              />
                            )}
                          </div>

                          {/* Status */}
                          <div className="col-span-2">
                            <p className="text-white/30 text-[9px] font-condensed uppercase mb-0.5">Status</p>
                            <select
                              value={w.status}
                              onChange={e => updateWO(w.id, { status: e.target.value as WOStatus })}
                              className={`w-full bg-[#1e1e1e] border border-white/10 rounded px-2 py-1 text-xs focus:outline-none focus:border-[#f08122] ${STATUS_COLOR[w.status]}`}
                            >
                              {STATUS_OPTS.map(s => (
                                <option key={s} value={s}>{s.replace("_", " ")}</option>
                              ))}
                            </select>
                          </div>

                          {/* Ship date */}
                          <div className="col-span-2">
                            <p className="text-white/30 text-[9px] font-condensed uppercase mb-0.5">Ship Date</p>
                            <input
                              type="date"
                              value={w.ship_date}
                              onChange={e => updateWO(w.id, { ship_date: e.target.value })}
                              className="w-full bg-[#1e1e1e] border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#f08122]"
                            />
                          </div>

                          {/* Notes */}
                          <div className="col-span-2">
                            <p className="text-white/30 text-[9px] font-condensed uppercase mb-0.5">Notes</p>
                            <input
                              value={w.notes}
                              onChange={e => updateWO(w.id, { notes: e.target.value })}
                              placeholder="Notes"
                              className="w-full bg-[#1e1e1e] border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#f08122]"
                            />
                          </div>

                          {/* Remove */}
                          <div className="col-span-1 flex items-end justify-end pb-0.5">
                            <button
                              onClick={() => removeWO(w.id)}
                              className="text-white/20 hover:text-red-400 transition-colors text-sm px-1"
                              title="Remove"
                            >×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add WO button */}
                  <div className="px-3 py-2">
                    <button
                      onClick={() => addWO(cat.code)}
                      className="text-[10px] font-condensed uppercase tracking-widest text-white/30 hover:text-[#f08122] border border-dashed border-white/10 hover:border-[#f08122] rounded px-3 py-1 transition-colors"
                    >
                      + Add {cat.code === 1 ? "Casework" : cat.label} WO
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}