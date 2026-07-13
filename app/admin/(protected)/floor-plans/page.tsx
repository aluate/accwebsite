"use client";

import { useState, useEffect, useCallback } from "react";

type FloorPlanRoom = {
  id?: string;
  room_name: string;
  finish_group_name: string;
  default_ceiling_height: string;
  default_flooring: string;
  sort_order?: number;
};

type FloorPlan = {
  id: string;
  builder_company: string;
  plan_name: string;
  description: string | null;
  created_at: string;
  rooms?: FloorPlanRoom[];
};

const LABEL = "block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5";
const INPUT = "w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] transition-colors";
const SELECT = INPUT;

function emptyRoom(): FloorPlanRoom {
  return { room_name: "", finish_group_name: "", default_ceiling_height: "", default_flooring: "" };
}

export default function FloorPlansPage() {
  const [plans, setPlans]   = useState<FloorPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<"list" | "add">("list");

  // Add form
  const [addCompany,     setAddCompany]     = useState("");
  const [addPlanName,    setAddPlanName]    = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [addRooms,       setAddRooms]       = useState<FloorPlanRoom[]>([emptyRoom()]);
  const [addSaving,      setAddSaving]      = useState(false);
  const [addErr,         setAddErr]         = useState("");

  // Edit state
  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [editDraft,     setEditDraft]     = useState<Partial<FloorPlan>>({});
  const [editRooms,     setEditRooms]     = useState<FloorPlanRoom[]>([]);
  const [editSaving,    setEditSaving]    = useState(false);
  const [editErr,       setEditErr]       = useState("");

  // Delete confirm
  const [deletingId,    setDeletingId]    = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/floor-plans");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json() as FloorPlan[];
      // Fetch rooms for each plan
      const withRooms = await Promise.all(
        data.map(async (p) => {
          const r = await fetch(`/api/admin/floor-plans/${p.id}`);
          if (!r.ok) return { ...p, rooms: [] };
          const j = await r.json();
          return { ...p, rooms: (j.rooms ?? []) as FloorPlanRoom[] };
        })
      );
      setPlans(withRooms);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  // ── Add plan ──────────────────────────────────────────────────────────────
  async function submitAdd() {
    if (!addCompany.trim() || !addPlanName.trim()) { setAddErr("Company and plan name are required."); return; }
    setAddErr(""); setAddSaving(true);
    try {
      const res = await fetch("/api/admin/floor-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          builder_company: addCompany.trim(),
          plan_name: addPlanName.trim(),
          description: addDescription.trim() || null,
          rooms: addRooms.filter((r) => r.room_name.trim()),
        }),
      });
      if (!res.ok) { const j = await res.json(); setAddErr(j.error ?? "Save failed."); setAddSaving(false); return; }
      setAddCompany(""); setAddPlanName(""); setAddDescription(""); setAddRooms([emptyRoom()]);
      setTab("list");
      await loadPlans();
    } catch (e) { setAddErr(String(e)); }
    setAddSaving(false);
  }

  // ── Edit plan ──────────────────────────────────────────────────────────────
  function startEdit(plan: FloorPlan) {
    setEditingId(plan.id);
    setEditDraft({ builder_company: plan.builder_company, plan_name: plan.plan_name, description: plan.description ?? "" });
    setEditRooms((plan.rooms ?? []).map((r) => ({ ...r })));
    setEditErr("");
  }

  function cancelEdit() { setEditingId(null); setEditDraft({}); setEditRooms([]); setEditErr(""); }

  async function saveEdit(planId: string) {
    if (!editDraft.builder_company?.trim() || !editDraft.plan_name?.trim()) { setEditErr("Company and plan name required."); return; }
    setEditSaving(true); setEditErr("");
    try {
      const res = await fetch(`/api/admin/floor-plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          builder_company: editDraft.builder_company?.trim(),
          plan_name: editDraft.plan_name?.trim(),
          description: editDraft.description?.trim() || null,
          rooms: editRooms.filter((r) => r.room_name.trim()),
        }),
      });
      if (!res.ok) { const j = await res.json(); setEditErr(j.error ?? "Save failed."); setEditSaving(false); return; }
      setEditingId(null); setEditDraft({}); setEditRooms([]);
      await loadPlans();
    } catch (e) { setEditErr(String(e)); }
    setEditSaving(false);
  }

  // ── Delete plan ────────────────────────────────────────────────────────────
  async function confirmDelete(planId: string) {
    if (deletingId !== planId) { setDeletingId(planId); return; }
    await fetch(`/api/admin/floor-plans/${planId}`, { method: "DELETE" });
    setDeletingId(null);
    await loadPlans();
  }

  // ── Room helpers ───────────────────────────────────────────────────────────
  function updateRoom(arr: FloorPlanRoom[], setArr: (r: FloorPlanRoom[]) => void, idx: number, field: keyof FloorPlanRoom, val: string) {
    setArr(arr.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  }
  function addRoom(arr: FloorPlanRoom[], setArr: (r: FloorPlanRoom[]) => void) {
    setArr([...arr, emptyRoom()]);
  }
  function removeRoom(arr: FloorPlanRoom[], setArr: (r: FloorPlanRoom[]) => void, idx: number) {
    setArr(arr.filter((_, i) => i !== idx));
  }

  function RoomRows({ rooms, setRooms }: { rooms: FloorPlanRoom[]; setRooms: (r: FloorPlanRoom[]) => void }) {
    return (
      <div className="space-y-2">
        {rooms.map((r, i) => (
          <div key={i} className="grid grid-cols-4 gap-2 items-end">
            <div>
              <label className={LABEL}>Room Name</label>
              <input value={r.room_name} onChange={(e) => updateRoom(rooms, setRooms, i, "room_name", e.target.value)} placeholder="e.g. Kitchen" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Finish Group</label>
              <input value={r.finish_group_name} onChange={(e) => updateRoom(rooms, setRooms, i, "finish_group_name", e.target.value)} placeholder="e.g. White Shaker" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Ceiling Height</label>
              <input value={r.default_ceiling_height} onChange={(e) => updateRoom(rooms, setRooms, i, "default_ceiling_height", e.target.value)} placeholder="e.g. 9ft" className={INPUT} />
            </div>
            <div className="flex gap-1">
              <div className="flex-1">
                <label className={LABEL}>Flooring</label>
                <input value={r.default_flooring} onChange={(e) => updateRoom(rooms, setRooms, i, "default_flooring", e.target.value)} placeholder="e.g. Hardwood" className={INPUT} />
              </div>
              <button onClick={() => removeRoom(rooms, setRooms, i)} className="text-red-400/60 hover:text-red-400 text-lg px-1 pb-1">×</button>
            </div>
          </div>
        ))}
        <button onClick={() => addRoom(rooms, setRooms)} className="text-[#f08122] text-xs font-condensed uppercase tracking-widest hover:text-white transition-colors">
          + Add Room
        </button>
      </div>
    );
  }

  return (
    <section className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-1">Admin</p>
          <h1 className="font-heading text-2xl uppercase tracking-wide text-white">Builder Floor Plans</h1>
        </div>
        <button
          onClick={() => setTab(tab === "add" ? "list" : "add")}
          className="font-condensed uppercase tracking-widest text-xs bg-[#f08122] hover:bg-[#d9711e] text-white px-4 py-2 rounded transition-colors"
        >
          {tab === "add" ? "← Back to List" : "+ New Floor Plan"}
        </button>
      </div>

      {/* Add Plan form */}
      {tab === "add" && (
        <div className="bg-[#2d2d2d] rounded-lg border border-white/10 p-6 mb-8 space-y-4">
          <h2 className="text-white font-condensed uppercase tracking-widest text-sm">New Floor Plan</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Builder Company *</label>
              <input value={addCompany} onChange={(e) => setAddCompany(e.target.value)} placeholder="e.g. Pulte Homes" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Plan Name *</label>
              <input value={addPlanName} onChange={(e) => setAddPlanName(e.target.value)} placeholder="e.g. Belmont 2100" className={INPUT} />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Description</label>
              <input value={addDescription} onChange={(e) => setAddDescription(e.target.value)} placeholder="Optional notes" className={INPUT} />
            </div>
          </div>
          <div>
            <label className={LABEL}>Rooms</label>
            <RoomRows rooms={addRooms} setRooms={setAddRooms} />
          </div>
          {addErr && <p className="text-red-400 text-xs font-condensed">{addErr}</p>}
          <button
            onClick={submitAdd}
            disabled={addSaving}
            className="bg-[#f08122] hover:bg-[#d9711e] disabled:opacity-50 text-white font-condensed uppercase tracking-widest text-xs px-5 py-2.5 rounded transition-colors"
          >
            {addSaving ? "Saving…" : "Create Floor Plan"}
          </button>
        </div>
      )}

      {/* List */}
      {tab === "list" && (
        loading ? (
          <div className="space-y-4">
            {[1,2,3].map((i) => <div key={i} className="h-24 bg-white/5 rounded animate-pulse" />)}
          </div>
        ) : plans.length === 0 ? (
          <div className="bg-[#2d2d2d] rounded p-8 text-center">
            <p className="text-white/40 text-sm font-condensed uppercase tracking-widest">No floor plans yet.</p>
            <button onClick={() => setTab("add")} className="mt-3 text-[#f08122] text-xs font-condensed uppercase tracking-widest hover:text-white transition-colors">
              Create the first one →
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {plans.map((plan) => {
              const isEditing = editingId === plan.id;
              return (
                <div key={plan.id} className="bg-[#2d2d2d] rounded border border-white/10 overflow-hidden">
                  {isEditing ? (
                    <div className="p-5 space-y-4">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <label className={LABEL}>Builder Company *</label>
                          <input
                            value={editDraft.builder_company ?? ""}
                            onChange={(e) => setEditDraft((d) => ({ ...d, builder_company: e.target.value }))}
                            className={INPUT}
                          />
                        </div>
                        <div>
                          <label className={LABEL}>Plan Name *</label>
                          <input
                            value={editDraft.plan_name ?? ""}
                            onChange={(e) => setEditDraft((d) => ({ ...d, plan_name: e.target.value }))}
                            className={INPUT}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={LABEL}>Description</label>
                          <input
                            value={editDraft.description ?? ""}
                            onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                            className={INPUT}
                          />
                        </div>
                      </div>
                      <div>
                        <label className={LABEL}>Rooms</label>
                        <RoomRows rooms={editRooms} setRooms={setEditRooms} />
                      </div>
                      {editErr && <p className="text-red-400 text-xs font-condensed">{editErr}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(plan.id)}
                          disabled={editSaving}
                          className="bg-[#f08122] hover:bg-[#d9711e] disabled:opacity-50 text-white font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded transition-colors"
                        >
                          {editSaving ? "Saving…" : "Save"}
                        </button>
                        <button onClick={cancelEdit} className="text-white/40 hover:text-white font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-[#f08122] font-condensed uppercase tracking-wider text-xs mb-0.5">{plan.builder_company}</p>
                          <p className="text-white font-condensed uppercase tracking-wider text-sm">{plan.plan_name}</p>
                          {plan.description && <p className="text-white/40 text-xs mt-0.5">{plan.description}</p>}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => startEdit(plan)}
                            className="text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-[10px] border border-white/10 hover:border-[#f08122]/40 px-2 py-1 rounded transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => confirmDelete(plan.id)}
                            className={`font-condensed uppercase tracking-widest text-[10px] border px-2 py-1 rounded transition-colors ${
                              deletingId === plan.id
                                ? "bg-red-700/30 border-red-700/50 text-red-300"
                                : "text-white/20 hover:text-red-400 border-white/10 hover:border-red-700/40"
                            }`}
                          >
                            {deletingId === plan.id ? "Confirm Delete" : "Delete"}
                          </button>
                          {deletingId === plan.id && (
                            <button onClick={() => setDeletingId(null)} className="text-white/30 hover:text-white font-condensed uppercase tracking-widest text-[10px] px-2 py-1 transition-colors">
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                      {(plan.rooms ?? []).length > 0 && (
                        <div className="border-t border-white/5 pt-3">
                          <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mb-2">
                            Rooms ({plan.rooms!.length})
                          </p>
                          <div className="grid sm:grid-cols-2 gap-2">
                            {plan.rooms!.map((r, i) => (
                              <div key={i} className="bg-[#1a1a1a] rounded px-3 py-2">
                                <p className="text-white text-xs font-condensed uppercase">{r.room_name}</p>
                                {r.finish_group_name && <p className="text-white/40 text-[11px]">FG: {r.finish_group_name}</p>}
                                {r.default_ceiling_height && <p className="text-white/30 text-[11px]">Ceiling: {r.default_ceiling_height}</p>}
                                {r.default_flooring && <p className="text-white/30 text-[11px]">Flooring: {r.default_flooring}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </section>
  );
}
