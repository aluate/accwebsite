"use client";

import { useState, useEffect, useCallback } from "react";

type WarrantyItem = {
  id: string; job_id: string; reported_at: string; reported_by: string;
  category: string; description: string; status: string; priority: string;
  resolved_at: string | null; resolved_by: string | null; resolution: string | null; notes: string | null;
};

const CATEGORIES = ["general", "door", "drawer", "hardware", "finish", "measure", "install", "other"];
const PRIORITIES  = ["low", "normal", "high", "urgent"];

const STATUS_COLOR: Record<string, string> = {
  open:        "text-red-400 bg-red-900/30 border-red-700/40",
  in_progress: "text-amber-300 bg-amber-900/30 border-amber-700/40",
  resolved:    "text-green-400 bg-green-900/30 border-green-700/40",
  closed:      "text-white/30 bg-white/5 border-white/10",
};

const PRIORITY_COLOR: Record<string, string> = {
  low:    "text-white/30",
  normal: "text-white/50",
  high:   "text-amber-400",
  urgent: "text-red-400",
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function WarrantyPanel({ jobId }: { jobId: string }) {
  const [items, setItems] = useState<WarrantyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: "general", description: "", priority: "normal", notes: "" });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolveForm, setResolveForm] = useState<{ id: string; resolution: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/jobs/${jobId}/warranty`);
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/jobs/${jobId}/warranty`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ category: "general", description: "", priority: "normal", notes: "" });
      setShowForm(false);
      await load();
    }
    setSaving(false);
  }

  async function updateStatus(id: string, status: string, resolution?: string) {
    await fetch(`/api/warranty/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, resolution }),
    });
    await load();
    setResolveForm(null);
  }

  const open   = items.filter((i) => i.status === "open");
  const active = items.filter((i) => i.status === "in_progress");
  const done   = items.filter((i) => i.status === "resolved" || i.status === "closed");

  if (loading) return <div className="text-white/20 text-xs font-condensed uppercase tracking-widest py-4">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {open.length > 0 && (
            <span className="text-[10px] font-condensed uppercase tracking-wider text-red-400 bg-red-900/30 border border-red-700/40 rounded px-2 py-0.5">
              {open.length} open
            </span>
          )}
          {active.length > 0 && (
            <span className="text-[10px] font-condensed uppercase tracking-wider text-amber-300 bg-amber-900/30 border border-amber-700/40 rounded px-2 py-0.5">
              {active.length} in progress
            </span>
          )}
          {items.length === 0 && <span className="text-white/20 text-xs">No warranty items</span>}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs border border-white/10 hover:border-[#f08122]/40 rounded px-3 py-1 transition-colors"
        >
          {showForm ? "Cancel" : "+ Log Issue"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-[#222] border border-white/10 rounded-lg p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-condensed uppercase tracking-widest text-white/40 mb-1">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122] transition-colors">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-condensed uppercase tracking-widest text-white/40 mb-1">Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122] transition-colors">
                {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-condensed uppercase tracking-widest text-white/40 mb-1">Description *</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What's the issue? Be specific — drawer box broke, door finish bubbling, etc."
              rows={2}
              className="w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#f08122] transition-colors resize-none" />
          </div>
          <div>
            <label className="block text-[10px] font-condensed uppercase tracking-widest text-white/40 mb-1">Notes</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Room location, installer involved, photos uploaded, etc."
              className="w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-1.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#f08122] transition-colors" />
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={saving || !form.description.trim()}
              className="bg-[#f08122] hover:bg-[#d9711e] disabled:opacity-40 text-white font-condensed uppercase tracking-widest text-xs px-5 py-2 rounded transition-colors">
              {saving ? "Saving…" : "Log Issue"}
            </button>
          </div>
        </form>
      )}

      {[...open, ...active, ...done].map((item) => {
        const sc = STATUS_COLOR[item.status] ?? "text-white/40 bg-white/5 border-white/10";
        const pc = PRIORITY_COLOR[item.priority] ?? "text-white/40";
        const expanded = expandedId === item.id;
        return (
          <div key={item.id} className="bg-[#2d2d2d] rounded-lg overflow-hidden">
            <button onClick={() => setExpandedId(expanded ? null : item.id)}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[#353535] transition-colors text-left">
              <span className={"text-[10px] font-condensed uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 mt-0.5 " + sc}>
                {item.status.replace(/_/g, " ")}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-white/80 text-sm leading-snug">{item.description}</p>
                <p className="text-white/30 text-[10px] font-condensed mt-0.5">
                  {item.category} · {fmtDate(item.reported_at)} · {item.reported_by}
                  {item.priority !== "normal" && <span className={" · " + pc}>{item.priority}</span>}
                </p>
              </div>
              <span className="text-white/20 text-xs shrink-0">{expanded ? "▲" : "▼"}</span>
            </button>

            {expanded && (
              <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
                {item.notes && <p className="text-white/50 text-xs italic">{item.notes}</p>}
                {item.resolution && (
                  <div className="bg-green-900/20 border border-green-700/30 rounded p-2">
                    <p className="text-green-400/80 text-xs"><strong>Resolution:</strong> {item.resolution}</p>
                    {item.resolved_by && <p className="text-white/30 text-[10px] mt-0.5">{item.resolved_by} · {fmtDate(item.resolved_at!)}</p>}
                  </div>
                )}
                {item.status === "open" && (
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => updateStatus(item.id, "in_progress")}
                      className="text-[10px] font-condensed uppercase tracking-wider border border-amber-700/40 text-amber-300 hover:bg-amber-900/30 rounded px-3 py-1 transition-colors">
                      Mark In Progress
                    </button>
                    <button onClick={() => setResolveForm({ id: item.id, resolution: "" })}
                      className="text-[10px] font-condensed uppercase tracking-wider border border-green-700/40 text-green-400 hover:bg-green-900/30 rounded px-3 py-1 transition-colors">
                      Resolve
                    </button>
                  </div>
                )}
                {item.status === "in_progress" && (
                  <button onClick={() => setResolveForm({ id: item.id, resolution: "" })}
                    className="text-[10px] font-condensed uppercase tracking-wider border border-green-700/40 text-green-400 hover:bg-green-900/30 rounded px-3 py-1 transition-colors">
                    Mark Resolved
                  </button>
                )}
                {resolveForm?.id === item.id && (
                  <div className="space-y-2">
                    <textarea value={resolveForm.resolution}
                      onChange={(e) => setResolveForm({ ...resolveForm, resolution: e.target.value })}
                      placeholder="Describe how it was fixed (optional)…" rows={2}
                      className="w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#f08122] transition-colors resize-none" />
                    <div className="flex gap-2">
                      <button onClick={() => updateStatus(item.id, "resolved", resolveForm.resolution)}
                        className="text-[10px] font-condensed uppercase tracking-wider bg-green-700/40 hover:bg-green-700/60 text-green-300 rounded px-3 py-1 transition-colors">
                        Confirm Resolved
                      </button>
                      <button onClick={() => setResolveForm(null)}
                        className="text-[10px] font-condensed uppercase tracking-wider text-white/30 hover:text-white/60 transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
