"use client";

/**
 * GateCheckinButton
 *
 * Lets a PM record a stage gate check-in:
 *   - "Ready to proceed on schedule"
 *   - "Ready to proceed with modifications" + notes
 *
 * Shows the last check-in for the current stage (if any).
 * Placeholder for now — real gate conditions to be defined from field data.
 */

import { useState, useEffect, useCallback } from "react";

type Checkin = {
  id: string;
  stage: string;
  outcome: string;
  notes: string | null;
  created_by: string;
  created_at: string;
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function GateCheckinButton({ jobId, currentStage }: { jobId: string; currentStage: string }) {
  const [open, setOpen]         = useState(false);
  const [choice, setChoice]     = useState<"on_schedule" | "with_modifications" | null>(null);
  const [notes, setNotes]       = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState("");
  const [lastCheckin, setLastCheckin] = useState<Checkin | null>(null);
  const [loading, setLoading]   = useState(true);

  const loadLast = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/gate-checkin`);
      if (res.ok) {
        const data = await res.json();
        const forStage = (data.checkins as Checkin[]).find((c) => c.stage === currentStage);
        setLastCheckin(forStage ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [jobId, currentStage]);

  useEffect(() => { loadLast(); }, [loadLast]);

  async function submit() {
    if (!choice) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/jobs/${jobId}/gate-checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: choice, notes: notes || undefined }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) { setError(body.error ?? "Failed"); setSubmitting(false); return; }
      setOpen(false);
      setChoice(null);
      setNotes("");
      await loadLast();
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  }

  const outcomeLabel = (o: string) =>
    o === "on_schedule" ? "On Schedule" : "With Modifications";
  const outcomeColor = (o: string) =>
    o === "on_schedule"
      ? "text-green-400 bg-green-900/20 border-green-700/30"
      : "text-amber-400 bg-amber-900/20 border-amber-700/30";

  return (
    <>
      <div className="flex flex-col gap-1.5">
        {/* Last check-in badge */}
        {!loading && lastCheckin && (
          <div className={`inline-flex items-center gap-1.5 text-[10px] font-condensed uppercase tracking-widest px-2.5 py-1 rounded border ${outcomeColor(lastCheckin.outcome)}`}>
            <span>✓ Gate: {outcomeLabel(lastCheckin.outcome)}</span>
            <span className="opacity-50">· {fmtDate(lastCheckin.created_at)} · {lastCheckin.created_by}</span>
          </div>
        )}

        <button
          onClick={() => { setOpen(true); setChoice(null); setNotes(""); setError(""); }}
          className="bg-blue-900/20 hover:bg-blue-900/35 text-blue-300 border border-blue-700/30 font-condensed uppercase tracking-widest text-sm py-2.5 px-5 rounded transition-colors"
        >
          {lastCheckin ? "Update Gate Check-in" : "Gate Check-in"}
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !submitting) setOpen(false); }}
        >
          <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-6 w-full max-w-md">
            <h3 className="font-heading text-lg uppercase tracking-wide text-white mb-1">
              Gate Check-in
            </h3>
            <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mb-5">
              Stage: {currentStage.replace(/_/g, " ")}
            </p>

            {/* Choice buttons */}
            <div className="grid grid-cols-1 gap-2 mb-4">
              <button
                onClick={() => setChoice("on_schedule")}
                className={`w-full text-left px-4 py-3 rounded border transition-colors ${
                  choice === "on_schedule"
                    ? "bg-green-900/30 border-green-600/50 text-green-300"
                    : "bg-white/5 border-white/10 text-white/60 hover:border-white/25"
                }`}
              >
                <p className="font-condensed uppercase tracking-widest text-xs mb-0.5">
                  ✓ Ready to proceed on schedule
                </p>
                <p className="text-[10px] text-white/30">No issues — move forward as planned</p>
              </button>

              <button
                onClick={() => setChoice("with_modifications")}
                className={`w-full text-left px-4 py-3 rounded border transition-colors ${
                  choice === "with_modifications"
                    ? "bg-amber-900/30 border-amber-600/50 text-amber-300"
                    : "bg-white/5 border-white/10 text-white/60 hover:border-white/25"
                }`}
              >
                <p className="font-condensed uppercase tracking-widest text-xs mb-0.5">
                  ⚠ Ready to proceed with modifications
                </p>
                <p className="text-[10px] text-white/30">Document the modification in notes below</p>
              </button>
            </div>

            {/* Notes */}
            <label className="block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5">
              Notes
              {choice === "with_modifications"
                ? <span className="text-amber-400 ml-1">*</span>
                : <span className="text-white/25 normal-case ml-1">(optional)</span>}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={
                choice === "with_modifications"
                  ? "Describe the modification or deviation…"
                  : "Any notes for the record…"
              }
              className="w-full bg-[#111] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none mb-4"
            />

            {error && <p className="text-red-400 text-xs font-condensed mb-3">{error}</p>}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="text-white/40 hover:text-white text-xs font-condensed uppercase tracking-widest px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={
                  submitting ||
                  !choice ||
                  (choice === "with_modifications" && !notes.trim())
                }
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-condensed uppercase tracking-widest text-xs px-5 py-2 rounded transition-colors"
              >
                {submitting ? "Saving…" : "Record Check-in"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
