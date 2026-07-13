"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Estimate = {
  id: string;
  title: string;
  status: string;
  scope: string;
  is_budget_estimate: number;
  target_margin_pct: number;
  created_at: string;
  updated_at: string;
  client_name: string | null;
  site_address: string | null;
};

type Job = {
  id: string;
  client_name: string;
  site_address: string | null;
  job_number: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  draft:    "text-yellow-300 bg-yellow-900/30 border-yellow-400/30",
  sent:     "text-blue-300 bg-blue-900/30 border-blue-400/30",
  accepted: "text-green-300 bg-green-900/30 border-green-400/30",
  archived: "text-white/30 bg-white/5 border-white/10",
};

function fmt(dt: string) {
  return new Date(dt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function EstimatingListClient({
  estimates: initial,
  jobs,
}: {
  estimates: Estimate[];
  jobs: Job[];
}) {
  const router = useRouter();
  const [estimates, setEstimates] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newJobId, setNewJobId] = useState("");
  const [newScope, setNewScope] = useState("supply_install");
  const [newBudget, setNewBudget] = useState(false);

  async function create() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          job_id: newJobId || null,
          scope: newScope,
          is_budget_estimate: newBudget,
        }),
      });
      const { id } = await res.json();
      router.push(`/admin/estimating/${id}`);
    } finally {
      setCreating(false);
    }
  }

  async function deleteEstimate(id: string) {
    if (!confirm("Delete this estimate? This cannot be undone.")) return;
    await fetch(`/api/estimates/${id}`, { method: "DELETE" });
    setEstimates((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className="min-h-screen bg-[#0d0e0f] text-white px-6 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-white/40 text-xs font-condensed uppercase tracking-widest mb-1">
            Admin · Estimating
          </div>
          <h1 className="text-2xl font-heading text-[#f08122]">Estimates</h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/admin/estimating/settings"
            className="border border-white/15 hover:border-white/30 text-white/50 hover:text-white text-sm px-3 py-2 rounded-lg transition-colors"
          >
            ⚙ Settings
          </a>
          <button
            onClick={() => setShowNew(true)}
            className="bg-[#f08122] hover:bg-[#e07010] text-black font-medium text-sm px-4 py-2 rounded-lg transition-colors"
          >
            + New estimate
          </button>
        </div>
      </div>

      {/* New estimate form */}
      {showNew && (
        <div className="mb-6 bg-[#1a1b1c] border border-white/10 rounded-xl p-5">
          <h2 className="text-sm font-medium text-white/80 mb-4">New estimate</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-white/40 text-xs font-condensed uppercase tracking-widest mb-1">
                Title *
              </label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Trupiano Residence"
                className="w-full bg-[#0d0e0f] border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#f08122]/60"
              />
            </div>
            <div>
              <label className="block text-white/40 text-xs font-condensed uppercase tracking-widest mb-1">
                Link to job (optional)
              </label>
              <select
                value={newJobId}
                onChange={(e) => setNewJobId(e.target.value)}
                className="w-full bg-[#0d0e0f] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122]/60"
              >
                <option value="">— No job linked —</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.client_name}{j.job_number ? ` · ${j.job_number}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-6 mb-4">
            <div className="flex gap-2">
              {["supply_install", "supply_only"].map((s) => (
                <button
                  key={s}
                  onClick={() => setNewScope(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    newScope === s
                      ? "bg-[#f08122] border-[#f08122] text-black font-medium"
                      : "border-white/15 text-white/50 hover:border-white/30"
                  }`}
                >
                  {s === "supply_install" ? "Supply + Install" : "Supply only"}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
              <input
                type="checkbox"
                checked={newBudget}
                onChange={(e) => setNewBudget(e.target.checked)}
                className="rounded"
              />
              Budget estimate (±15% disclaimer)
            </label>
          </div>
          <div className="flex gap-3">
            <button
              onClick={create}
              disabled={creating || !newTitle.trim()}
              className="bg-[#f08122] hover:bg-[#e07010] disabled:opacity-40 text-black font-medium text-sm px-4 py-2 rounded-lg transition-colors"
            >
              {creating ? "Creating…" : "Create estimate"}
            </button>
            <button
              onClick={() => setShowNew(false)}
              className="text-white/50 hover:text-white text-sm px-4 py-2 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Estimates table */}
      {estimates.length === 0 ? (
        <div className="text-center py-20 text-white/30">
          <div className="text-4xl mb-3">📋</div>
          <div className="text-sm">No estimates yet. Create one above.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {estimates.map((e) => (
            <div
              key={e.id}
              className="bg-[#1a1b1c] border border-white/10 hover:border-white/20 rounded-xl p-4 flex items-center justify-between group transition-colors cursor-pointer"
              onClick={() => router.push(`/admin/estimating/${e.id}`)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-medium text-white truncate">{e.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE[e.status] ?? STATUS_BADGE.draft}`}>
                    {e.status}
                  </span>
                  {e.is_budget_estimate ? (
                    <span className="text-xs px-2 py-0.5 rounded-full border text-purple-300 bg-purple-900/30 border-purple-400/30">
                      budget ±15%
                    </span>
                  ) : null}
                  {e.scope === "supply_only" ? (
                    <span className="text-xs text-white/40">supply only</span>
                  ) : null}
                </div>
                <div className="text-xs text-white/40">
                  {e.client_name ?? "No job linked"}{e.site_address ? ` · ${e.site_address}` : ""} · Updated {fmt(e.updated_at)}
                </div>
              </div>
              <div className="flex items-center gap-3 ml-4">
                <div className="text-right text-xs text-white/40">
                  {e.target_margin_pct}% margin target
                </div>
                <button
                  onClick={(ev) => { ev.stopPropagation(); deleteEstimate(e.id); }}
                  className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all text-sm px-2 py-1 rounded"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
