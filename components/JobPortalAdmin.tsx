"use client";
import { useState, useCallback } from "react";

type Input = {
  id: string; kind: string; label: string; description: string | null;
  status: "pending" | "received" | "waived";
  received_at: string | null; received_via: string | null; received_by: string | null;
};
type Summary = {
  total: number; received: number; waived: number; pending: number;
  pct_complete: number;
  estimated_delivery_at: string | null;
  delivery_clock_started_at: string | null;
};
type CR = {
  id: string; submitted_at: string; submitted_by: string; body: string;
  status: string; resolved_at: string | null; resolution_notes: string | null;
};
type Comment = {
  id: string; drawing_filename: string; page_number: number | null;
  cabinet_ref: string | null; body: string;
  submitted_at: string; submitted_by: string; submitted_role: string;
  status: string;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export function JobPortalAdmin({
  jobId, initialJob, initialInputs, initialSummary, initialChangeRequests, initialComments,
}: {
  jobId: string;
  initialJob: { builder_portal_enabled: boolean; target_delivery_weeks: number; delivery_clock_started_at: string | null; estimated_delivery_at: string | null };
  initialInputs: Input[];
  initialSummary: Summary;
  initialChangeRequests: CR[];
  initialComments: Comment[];
}) {
  const [enabled, setEnabled] = useState(initialJob.builder_portal_enabled);
  const [weeks, setWeeks] = useState(initialJob.target_delivery_weeks);
  const [inputs, setInputs] = useState(initialInputs);
  const [summary, setSummary] = useState(initialSummary);
  const [crs, setCrs] = useState(initialChangeRequests);
  const [comments, setComments] = useState(initialComments);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/admin/jobs/${jobId}/portal`, { cache: "no-store" });
    if (res.ok) {
      const b = await res.json();
      setInputs(b.inputs); setSummary(b.summary); setCrs(b.change_requests); setComments(b.drawing_comments);
      setEnabled(b.job.builder_portal_enabled === 1);
      setWeeks(b.job.target_delivery_weeks);
    }
  }, [jobId]);

  async function patch(payload: Record<string, unknown>) {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/portal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setMsg(b.error ?? `Failed (${res.status})`);
        return false;
      }
      await refresh();
      return true;
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-8">

      {/* Master toggle + delivery weeks */}
      <section className="bg-[#2d2d2d] rounded p-5 space-y-4">
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs">Portal access</p>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox" checked={enabled}
            onChange={(e) => patch({ builder_portal_enabled: e.target.checked ? 1 : 0 })}
            disabled={busy}
            className="w-5 h-5 accent-[#f08122]"
          />
          <span className="text-white text-sm">Enable builder portal access for this job</span>
        </label>
        <div className="flex items-center gap-3">
          <label className="text-white/60 text-sm">Target delivery weeks:</label>
          <input
            type="number" min={1} value={weeks}
            onChange={(e) => setWeeks(parseInt(e.target.value) || 8)}
            onBlur={() => weeks !== initialJob.target_delivery_weeks && patch({ target_delivery_weeks: weeks })}
            className="w-20 bg-[#1a1a1a] border border-white/15 rounded px-2 py-1 text-white text-sm"
          />
          <span className="text-white/40 text-xs">After last input received: {fmtDate(summary.delivery_clock_started_at)}{summary.estimated_delivery_at && ` → est. delivery ${fmtDate(summary.estimated_delivery_at)}`}</span>
        </div>
        {msg && <p className="text-yellow-300/80 text-xs">{msg}</p>}
      </section>

      {/* Required inputs */}
      <section className="bg-[#2d2d2d] rounded p-5">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs">Required inputs ({summary.received + summary.waived}/{summary.total})</p>
          <button
            type="button" disabled={busy}
            onClick={() => {
              const label = prompt("New checklist item label?");
              if (!label) return;
              const desc = prompt("Description (optional)?") || "";
              patch({ add_input: { kind: "custom", label, description: desc, sort_order: 99 } });
            }}
            className="text-white/40 hover:text-[#f08122] text-[10px] font-condensed uppercase tracking-widest border border-white/15 rounded px-2 py-1"
          >
            + Add custom item
          </button>
        </div>
        <div className="space-y-2">
          {inputs.map((i) => (
            <div key={i.id} className="bg-[#1a1a1a] rounded p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm">{i.label}</p>
                  {i.description && <p className="text-white/40 text-xs mt-1">{i.description}</p>}
                  {i.received_at && (
                    <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mt-1">
                      {i.status} · {fmtDate(i.received_at)} via {i.received_via}{i.received_by ? ` (${i.received_by})` : ""}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {i.status === "pending" ? (
                    <>
                      <button onClick={() => patch({ mark_input_received: i.id })} disabled={busy} className="text-green-400 hover:text-green-300 border border-green-700/40 rounded px-2 py-0.5 text-[10px] font-condensed uppercase tracking-widest">Mark received</button>
                      <button onClick={() => patch({ waive_input: i.id })} disabled={busy} className="text-blue-400 hover:text-blue-300 border border-blue-700/40 rounded px-2 py-0.5 text-[10px] font-condensed uppercase tracking-widest">Waive</button>
                    </>
                  ) : (
                    <button onClick={() => patch({ mark_input_pending: i.id })} disabled={busy} className="text-white/40 hover:text-white border border-white/15 rounded px-2 py-0.5 text-[10px] font-condensed uppercase tracking-widest">Reset to pending</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Change requests */}
      <section className="bg-[#2d2d2d] rounded p-5">
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-3">Change requests ({crs.filter(c => c.status === "open").length} open)</p>
        {crs.length === 0 ? <p className="text-white/30 italic text-sm">None.</p> : (
          <div className="space-y-2">
            {crs.map((cr) => (
              <div key={cr.id} className="bg-[#1a1a1a] rounded p-3">
                <div className="flex items-baseline justify-between mb-1">
                  <p className="text-white/60 text-xs">
                    <span className="text-[#f08122]">{cr.submitted_by}</span>
                    <span className={`ml-2 text-[10px] font-condensed uppercase tracking-widest rounded px-1.5 py-0.5 ${
                      cr.status === "open" ? "bg-yellow-900/30 text-yellow-300" :
                      cr.status === "incorporated" ? "bg-green-900/30 text-green-300" :
                      "bg-red-900/30 text-red-300"
                    }`}>{cr.status}</span>
                  </p>
                  <span className="text-white/30 text-[10px] font-condensed uppercase tracking-widest">{fmtDate(cr.submitted_at)}</span>
                </div>
                <p className="text-white text-sm">{cr.body}</p>
                {cr.resolution_notes && <p className="text-white/50 text-xs mt-2 italic">Resolution: {cr.resolution_notes}</p>}
                {cr.status === "open" && (
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => {
                      const notes = prompt("Resolution notes? (will be visible to builder)");
                      if (notes !== null) patch({ resolve_cr: { id: cr.id, status: "incorporated", notes } });
                    }} disabled={busy} className="text-green-400 border border-green-700/40 rounded px-2 py-0.5 text-[10px] font-condensed uppercase tracking-widest">Mark incorporated</button>
                    <button onClick={() => {
                      const notes = prompt("Reason for rejection? (will be visible to builder)");
                      if (notes !== null) patch({ resolve_cr: { id: cr.id, status: "rejected", notes } });
                    }} disabled={busy} className="text-red-400 border border-red-700/40 rounded px-2 py-0.5 text-[10px] font-condensed uppercase tracking-widest">Reject</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Drawing comments */}
      <section className="bg-[#2d2d2d] rounded p-5">
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-3">Drawing comments ({comments.filter(c => c.status === "open").length} open)</p>
        {comments.length === 0 ? <p className="text-white/30 italic text-sm">None.</p> : (
          <div className="space-y-2">
            {comments.map((c) => (
              <div key={c.id} className="bg-[#1a1a1a] rounded p-3">
                <div className="flex items-baseline justify-between mb-1">
                  <p className="text-white/60 text-xs">
                    <span className={c.submitted_role === "builder" ? "text-[#f08122]" : "text-blue-300"}>
                      {c.submitted_role === "builder" ? c.submitted_by : `ACC ${c.submitted_by}`}
                    </span>
                    <span className="ml-2 text-white/40">on {c.drawing_filename}{c.page_number ? ` p.${c.page_number}` : ""}{c.cabinet_ref ? ` (${c.cabinet_ref})` : ""}</span>
                  </p>
                  <span className="text-white/30 text-[10px] font-condensed uppercase tracking-widest">{fmtDate(c.submitted_at)}</span>
                </div>
                <p className="text-white text-sm">{c.body}</p>
                {c.status === "open" && c.submitted_role === "builder" && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button onClick={() => {
                      const reply = prompt("Reply to builder comment:");
                      if (reply) patch({ acc_comment_reply: { drawing_filename: c.drawing_filename, page_number: c.page_number, cabinet_ref: c.cabinet_ref, body: reply } });
                    }} disabled={busy} className="text-blue-400 border border-blue-700/40 rounded px-2 py-0.5 text-[10px] font-condensed uppercase tracking-widest">Reply</button>
                    <button onClick={() => {
                      const notes = prompt("Resolution notes (optional):") || "";
                      patch({ resolve_comment: { id: c.id, notes } });
                    }} disabled={busy} className="text-green-400 border border-green-700/40 rounded px-2 py-0.5 text-[10px] font-condensed uppercase tracking-widest">Mark resolved</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
