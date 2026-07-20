"use client";

import { useEffect, useState, useCallback } from "react";

const FINISH_COLOR: Record<string, string> = {
  melamine:   "text-sky-300  bg-sky-900/30  border-sky-700/30",
  paint:      "text-pink-300 bg-pink-900/30 border-pink-700/30",
  stain:      "text-amber-300 bg-amber-900/30 border-amber-700/30",
  thermofoil: "text-purple-300 bg-purple-900/30 border-purple-700/30",
};

function calcWO(boxes: number | null): number {
  if (!boxes || boxes <= 0) return 1;
  return Math.max(1, Math.ceil(boxes / 65));
}

function parseArith(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9+\-*/. ()]/g, "").trim();
  if (!cleaned) return null;
  try {
    if (!/^[0-9+\-*/. ()]+$/.test(cleaned)) return null;
    const result = Function(`"use strict"; return (${cleaned})`)();
    return typeof result === "number" && isFinite(result) ? Math.max(0, Math.round(result)) : null;
  } catch { return null; }
}

type FG = {
  id: string; label: string; finish_type: string;
  box_count: number | null; wo_count: number | null; fg_complexity: number | null;
};

type JobData = {
  id: string; estimated_value: number | null; pm_complexity: number | null;
  box_count: number | null; wo_count: number | null;
};

export function JobConstraintsPanel({ jobId, canEdit }: { jobId: string; canEdit: boolean }) {
  const [job, setJob] = useState<JobData | null>(null);
  const [fgs, setFgs] = useState<FG[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/jobs/${jobId}/constraints`);
      if (!r.ok) { setError("Could not load constraints"); return; }
      const d = await r.json();
      setJob(d.job);
      setFgs(d.finish_groups ?? []);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const saveJob = useCallback(async (patch: Partial<JobData>) => {
    await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setJob((prev) => prev ? { ...prev, ...patch } : prev);
  }, [jobId]);

  const saveFg = useCallback(async (fgId: string, patch: Partial<FG>) => {
    await fetch(`/api/finish-groups/${fgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        box_count: patch.box_count,
        pm_complexity: patch.fg_complexity,
      }),
    });
    setFgs((prev) => prev.map((f) => f.id === fgId ? { ...f, ...patch } : f));
  }, []);

  if (loading) return (
    <div className="bg-[#2d2d2d] rounded p-5">
      <p className="text-white/20 text-[10px] font-condensed uppercase tracking-widest animate-pulse">Loading constraints…</p>
    </div>
  );

  if (error) return null;
  if (!job) return null;

  const totalBoxes = fgs.length > 0
    ? fgs.reduce((s, f) => s + (f.box_count ?? 0), 0)
    : (job.box_count ?? 0);
  const totalWOs = fgs.length > 0
    ? fgs.reduce((s, f) => s + calcWO(f.box_count), 0)
    : calcWO(job.box_count);

  return (
    <div className="bg-[#2d2d2d] rounded p-5 space-y-4">
      <p className="text-white/30 font-condensed uppercase tracking-widest text-[10px]">Constraints</p>

      {/* Job-level: Est Value */}
      <EstValueField
        value={job.estimated_value}
        canEdit={canEdit}
        onSave={(v) => saveJob({ estimated_value: v })}
      />

      {/* Totals row */}
      {(totalBoxes > 0 || totalWOs > 0) && (
        <div className="flex gap-4 pt-1 border-t border-white/5">
          <div>
            <p className="text-white/25 text-[9px] font-condensed uppercase tracking-widest">Total Boxes</p>
            <p className="text-white/70 text-sm font-condensed tabular-nums">{totalBoxes || "—"}</p>
          </div>
          <div>
            <p className="text-white/25 text-[9px] font-condensed uppercase tracking-widest">Total WOs</p>
            <p className="text-white/70 text-sm font-condensed tabular-nums">{totalWOs || "—"}</p>
          </div>
          <div>
            <p className="text-white/25 text-[9px] font-condensed uppercase tracking-widest">FG Count</p>
            <p className="text-white/70 text-sm font-condensed tabular-nums">{fgs.length || "—"}</p>
          </div>
        </div>
      )}

      {/* Per-FG rows */}
      {fgs.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-white/5">
          <p className="text-white/20 text-[9px] font-condensed uppercase tracking-widest">Per Finish Group</p>
          {fgs.map((fg) => (
            <FGRow key={fg.id} fg={fg} canEdit={canEdit} onSave={(patch) => saveFg(fg.id, patch)} />
          ))}
        </div>
      )}

      {fgs.length === 0 && (
        <p className="text-white/20 text-xs font-condensed">No spec yet — FG data will appear after spec is built.</p>
      )}
    </div>
  );
}

/* ── Est Value field ─────────────────────────────────────────────────────── */
function EstValueField({
  value, canEdit, onSave,
}: { value: number | null; canEdit: boolean; onSave: (v: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");

  const commit = () => {
    const n = parseFloat(draft.replace(/[^0-9.]/g, ""));
    onSave(isNaN(n) ? null : n);
    setEditing(false);
  };

  return (
    <div>
      <p className="text-white/25 text-[9px] font-condensed uppercase tracking-widest mb-1">Est. Value</p>
      {editing ? (
        <input
          autoFocus
          className="w-full bg-[#1a1a1a] border border-[#f08122]/40 rounded px-2 py-1 text-white text-sm font-condensed focus:outline-none focus:border-[#f08122]"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          placeholder="e.g. 85000"
        />
      ) : (
        <button
          onClick={() => { if (canEdit) { setDraft(value != null ? String(value) : ""); setEditing(true); } }}
          className={"text-sm font-condensed " + (canEdit ? "hover:text-[#f08122] cursor-pointer" : "cursor-default")}
        >
          {value != null
            ? <span className="text-white">${Math.round(value).toLocaleString()}</span>
            : <span className="text-white/25">{canEdit ? "Add value…" : "—"}</span>}
        </button>
      )}
    </div>
  );
}

/* ── Per-FG row ──────────────────────────────────────────────────────────── */
function FGRow({
  fg, canEdit, onSave,
}: { fg: FG; canEdit: boolean; onSave: (patch: Partial<FG>) => void }) {
  const [boxDraft, setBoxDraft] = useState<string | null>(null);
  const woCalc = calcWO(fg.box_count);
  const badge = FINISH_COLOR[fg.finish_type] ?? "text-white/40 bg-white/5 border-white/10";

  const commitBoxes = () => {
    if (boxDraft === null) return;
    const n = parseArith(boxDraft);
    onSave({ box_count: n });
    setBoxDraft(null);
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      {/* Label + type badge */}
      <div className="w-14 shrink-0">
        <p className="text-[#f08122] font-condensed font-bold text-[10px] uppercase leading-none">{fg.label}</p>
        <span className={"text-[8px] font-condensed uppercase tracking-wider border rounded-sm px-1 " + badge}>
          {fg.finish_type}
        </span>
      </div>

      {/* Boxes */}
      <div className="flex-1">
        <p className="text-white/20 text-[8px] font-condensed uppercase tracking-widest leading-none mb-0.5">Boxes</p>
        {canEdit ? (
          <input
            type="text"
            inputMode="numeric"
            className="w-full bg-[#1a1a1a] border border-white/10 rounded px-1.5 py-0.5 text-white text-xs font-condensed focus:outline-none focus:border-[#f08122]/60 tabular-nums"
            value={boxDraft ?? (fg.box_count != null ? String(fg.box_count) : "")}
            placeholder="—"
            onChange={(e) => setBoxDraft(e.target.value)}
            onFocus={() => setBoxDraft(fg.box_count != null ? String(fg.box_count) : "")}
            onBlur={commitBoxes}
            onKeyDown={(e) => { if (e.key === "Enter") commitBoxes(); }}
          />
        ) : (
          <p className="text-white/60 tabular-nums">{fg.box_count ?? "—"}</p>
        )}
      </div>

      {/* WOs (derived) */}
      <div className="w-10 shrink-0 text-center">
        <p className="text-white/20 text-[8px] font-condensed uppercase tracking-widest leading-none mb-0.5">WOs</p>
        <p className="text-white/50 tabular-nums">{fg.box_count != null ? woCalc : "—"}</p>
      </div>

      {/* Complexity */}
      <div className="w-16 shrink-0">
        <p className="text-white/20 text-[8px] font-condensed uppercase tracking-widest leading-none mb-0.5">Complexity</p>
        {canEdit ? (
          <select
            className="w-full bg-[#1a1a1a] border border-white/10 rounded px-1 py-0.5 text-white text-[10px] font-condensed focus:outline-none focus:border-[#f08122]/60"
            value={fg.fg_complexity ?? 1}
            onChange={(e) => onSave({ fg_complexity: Number(e.target.value) })}
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => (
              <option key={v} value={v}>{v}×</option>
            ))}
          </select>
        ) : (
          <p className="text-white/50">{fg.fg_complexity ?? 1}×</p>
        )}
      </div>
    </div>
  );
}
