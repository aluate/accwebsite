"use client";

import { useEffect, useState, useCallback } from "react";

// Lifecycle state machine UI for a residential spec.
//
// Reads from /api/specs/[id]/lifecycle on mount; renders:
//   1. A color-coded state badge (DRAFT yellow, CLIENT_APPROVED blue,
//      RELEASED_TO_ENG indigo, ENGINEERED purple, RELEASED_TO_SHOP green).
//   2. An "Advance" button next to the badge that forwards to the next state.
//      Confirmation modal collects optional notes.
//   3. A "Re-spin" button (only visible when not at DRAFT) that opens a modal
//      requiring a non-empty reason + a target state picker.
//   4. An audit timeline below showing prior transitions with actor + timestamp.
//
// All state changes go through POST /api/specs/[id]/lifecycle which goes
// through transitionLifecycle() in lib/lifecycle.ts (the unit-tested rules
// live there; we don't reimplement validation client-side beyond UX hints).

type Transition = {
  id: string;
  from_state: string;
  to_state: string;
  transitioned_at: string;
  transitioned_by: string;
  reason: string | null;
  notes: string | null;
};

type LifecycleData = {
  state: string;
  nextForward: string | null;
  transitions: Transition[];
};

const STATE_LABEL: Record<string, string> = {
  DRAFT:            "Draft",
  CLIENT_APPROVED:  "Client Approved",
  RELEASED_TO_ENG:  "Released to Engineering",
  ENGINEERED:       "Engineered",
  RELEASED_TO_SHOP: "Released to Shop",
};

const STATE_COLOR: Record<string, string> = {
  DRAFT:            "text-yellow-300/90 bg-yellow-900/30 border-yellow-700/40",
  CLIENT_APPROVED:  "text-blue-300/90   bg-blue-900/30   border-blue-700/40",
  RELEASED_TO_ENG:  "text-indigo-300/90 bg-indigo-900/30 border-indigo-700/40",
  ENGINEERED:       "text-purple-300/90 bg-purple-900/30 border-purple-700/40",
  RELEASED_TO_SHOP: "text-green-300/90  bg-green-900/30  border-green-700/40",
};

const ALL_STATES = ["DRAFT","CLIENT_APPROVED","RELEASED_TO_ENG","ENGINEERED","RELEASED_TO_SHOP"];

export function LifecyclePanel({ specId }: { specId: string }) {
  const [data, setData] = useState<LifecycleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [showAdvance, setShowAdvance] = useState(false);
  const [advanceNotes, setAdvanceNotes] = useState("");

  const [showRespin, setShowRespin] = useState(false);
  const [respinTarget, setRespinTarget] = useState("DRAFT");
  const [respinReason, setRespinReason] = useState("");

  const [showHistory, setShowHistory] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/specs/${specId}/lifecycle`, { cache: "no-store" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setErr(b.error ?? `Load failed (${res.status})`);
        return;
      }
      const b = (await res.json()) as LifecycleData;
      setData(b);
      setErr("");
    } catch {
      setErr("Load failed");
    } finally {
      setLoading(false);
    }
  }, [specId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function transition(to: string, reason?: string, notes?: string) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/specs/${specId}/lifecycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, reason, notes }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setErr(b.error ?? `Transition failed (${res.status})`);
        return false;
      }
      await refresh();
      return true;
    } catch {
      setErr("Transition failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;
  if (!data)   return null;

  const cur = data.state;
  const next = data.nextForward;
  const badgeClass = STATE_COLOR[cur] ?? "text-white/60 bg-white/10 border-white/20";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className={`text-[11px] font-condensed uppercase tracking-widest border rounded px-2.5 py-1 ${badgeClass}`}
        title="Spec lifecycle state"
      >
        {STATE_LABEL[cur] ?? cur}
      </span>

      {next && (
        <button
          type="button"
          onClick={() => setShowAdvance(true)}
          disabled={busy}
          className="font-condensed uppercase tracking-widest text-[10px] text-white/50 hover:text-[#f08122] border border-white/15 hover:border-[#f08122] rounded px-2.5 py-1 transition-colors disabled:opacity-30"
          title={`Advance to ${STATE_LABEL[next] ?? next}`}
        >
          → {STATE_LABEL[next] ?? next}
        </button>
      )}

      {cur !== "DRAFT" && (
        <button
          type="button"
          onClick={() => setShowRespin(true)}
          disabled={busy}
          className="font-condensed uppercase tracking-widest text-[10px] text-white/30 hover:text-yellow-300/80 border border-white/10 hover:border-yellow-700/50 rounded px-2.5 py-1 transition-colors disabled:opacity-30"
          title="Move backwards (re-spin) — requires a reason"
        >
          Re-spin
        </button>
      )}

      <button
        type="button"
        onClick={() => setShowHistory((v) => !v)}
        className="font-condensed uppercase tracking-widest text-[10px] text-white/30 hover:text-white/60"
        title={`${data.transitions.length} transition${data.transitions.length === 1 ? "" : "s"} on record`}
      >
        History ({data.transitions.length})
      </button>

      {err && (
        <span className="text-red-400 text-[10px] font-condensed uppercase tracking-widest">{err}</span>
      )}

      {/* History panel */}
      {showHistory && (
        <div className="basis-full mt-2 bg-[#1a1a1a] border border-white/10 rounded p-3">
          {data.transitions.length === 0 ? (
            <p className="text-white/30 text-xs font-condensed uppercase tracking-widest italic">
              No transitions yet — spec is at its initial state.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.transitions.map((t) => (
                <li key={t.id} className="text-white/60 text-xs flex flex-wrap gap-x-3 gap-y-1">
                  <span className="text-white/30 shrink-0 font-condensed uppercase tracking-widest text-[10px]">
                    {new Date(t.transitioned_at).toLocaleString()}
                  </span>
                  <span className="text-white/40 font-condensed uppercase tracking-widest text-[10px]">
                    {t.transitioned_by}
                  </span>
                  <span>
                    <span className="text-white/40">{STATE_LABEL[t.from_state] ?? t.from_state}</span>
                    {" → "}
                    <span className="text-white/80">{STATE_LABEL[t.to_state] ?? t.to_state}</span>
                  </span>
                  {t.reason && <span className="text-yellow-400/70">reason: {t.reason}</span>}
                  {t.notes  && <span className="text-white/40">· {t.notes}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Advance modal */}
      {showAdvance && next && (
        <ModalShell title={`Advance to ${STATE_LABEL[next] ?? next}?`} onClose={() => setShowAdvance(false)}>
          <p className="text-white/60 text-sm mb-4">
            Move spec from <strong>{STATE_LABEL[cur]}</strong> to <strong>{STATE_LABEL[next] ?? next}</strong>?
            This is logged in the audit timeline.
          </p>
          <label className="block text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-1">Notes (optional)</label>
          <textarea
            value={advanceNotes}
            onChange={(e) => setAdvanceNotes(e.target.value)}
            rows={2}
            className="w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] mb-4"
            placeholder="e.g. Sent to client 5/4/26"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdvance(false)} className="text-white/40 hover:text-white font-condensed uppercase tracking-widest text-xs py-2 px-4">Cancel</button>
            <button
              disabled={busy}
              onClick={async () => {
                const ok = await transition(next, undefined, advanceNotes || undefined);
                if (ok) { setShowAdvance(false); setAdvanceNotes(""); }
              }}
              className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs py-2 px-4 rounded"
            >
              Advance
            </button>
          </div>
        </ModalShell>
      )}

      {/* Re-spin modal */}
      {showRespin && (
        <ModalShell title="Re-spin (move backwards)" onClose={() => setShowRespin(false)}>
          <p className="text-white/60 text-sm mb-4">
            Move spec backwards from <strong>{STATE_LABEL[cur]}</strong>. A reason is required and will appear in the audit timeline.
          </p>
          <label className="block text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-1">Target state</label>
          <select
            value={respinTarget}
            onChange={(e) => setRespinTarget(e.target.value)}
            className="w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] mb-3"
          >
            {ALL_STATES.filter((s) => ALL_STATES.indexOf(s) < ALL_STATES.indexOf(cur)).map((s) => (
              <option key={s} value={s}>{STATE_LABEL[s] ?? s}</option>
            ))}
          </select>
          <label className="block text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-1">Reason *</label>
          <textarea
            value={respinReason}
            onChange={(e) => setRespinReason(e.target.value)}
            rows={2}
            className="w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] mb-4"
            placeholder="e.g. Client requested change to door style"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowRespin(false)} className="text-white/40 hover:text-white font-condensed uppercase tracking-widest text-xs py-2 px-4">Cancel</button>
            <button
              disabled={busy || !respinReason.trim()}
              onClick={async () => {
                const ok = await transition(respinTarget, respinReason);
                if (ok) { setShowRespin(false); setRespinReason(""); setRespinTarget("DRAFT"); }
              }}
              className="bg-yellow-700 hover:bg-yellow-600 text-white font-condensed uppercase tracking-widest text-xs py-2 px-4 rounded disabled:opacity-30"
            >
              Re-spin
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#2d2d2d] border border-white/10 rounded p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}
