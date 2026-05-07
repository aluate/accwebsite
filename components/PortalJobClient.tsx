"use client";

import { useCallback, useEffect, useState } from "react";

type Input = {
  id: string; kind: string; label: string; description: string | null;
  status: "pending" | "received" | "waived";
  received_at: string | null; received_by: string | null; received_via: string | null;
};
type Summary = {
  total: number; received: number; waived: number; pending: number;
  pct_complete: number;
  estimated_delivery_at: string | null;
  delivery_clock_started_at: string | null;
};
type Drawing = { filename: string; size: number; uploaded_at: string };
type Comment = {
  id: string; drawing_filename: string; page_number: number | null;
  cabinet_ref: string | null; body: string;
  submitted_at: string; submitted_by: string; submitted_role: string;
  status: string;
};
type CR = {
  id: string; submitted_at: string; submitted_by: string; body: string;
  status: string; resolved_at: string | null; resolution_notes: string | null;
};
type Job = { status: string; delivery_clock_started_at: string | null; estimated_delivery_at: string | null };

const PROGRESS_STEPS = [
  { key: "intake",     label: "Inputs from you" },
  { key: "active",     label: "Spec in dev" },
  { key: "approval",   label: "Awaiting approval" },
  { key: "production", label: "In production" },
  { key: "complete",   label: "Delivered" },
];

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}
function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function PortalJobClient({
  jobId, initialInputs, initialSummary, initialJob, latestDrawing, initialComments, initialChangeRequests,
}: {
  jobId: string;
  initialInputs: Input[];
  initialSummary: Summary;
  initialJob: Job;
  latestDrawing: Drawing | null;
  initialComments: Comment[];
  initialChangeRequests: CR[];
}) {
  const [inputs, setInputs] = useState(initialInputs);
  const [summary, setSummary] = useState(initialSummary);
  const [job, setJob] = useState(initialJob);
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [crs, setCrs] = useState<CR[]>(initialChangeRequests);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const refreshSummary = useCallback(async () => {
    const res = await fetch(`/api/portal/jobs/${jobId}/required-inputs`, { cache: "no-store" });
    if (res.ok) {
      const b = await res.json();
      setInputs(b.inputs); setSummary(b.summary);
    }
  }, [jobId]);

  const refreshComments = useCallback(async () => {
    if (!latestDrawing) return;
    const res = await fetch(`/api/portal/jobs/${jobId}/drawing-comments?file=${encodeURIComponent(latestDrawing.filename)}`, { cache: "no-store" });
    if (res.ok) { const b = await res.json(); setComments(b.comments); }
  }, [jobId, latestDrawing]);

  const refreshCRs = useCallback(async () => {
    const res = await fetch(`/api/portal/jobs/${jobId}/change-request`, { cache: "no-store" });
    if (res.ok) { const b = await res.json(); setCrs(b.requests); }
  }, [jobId]);

  // Determine current progress step
  const currentStep = (() => {
    if (job.status === "complete") return 4;
    if (job.status === "production") return 3;
    if (summary.pending === 0) return 2; // inputs done -> in approval workflow
    return 0; // still gathering inputs
  })();

  async function selfAttest(inputId: string) {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/portal/jobs/${jobId}/required-inputs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputId }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? "Failed"); return; }
      await refreshSummary();
    } finally { setBusy(false); }
  }

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">

      {/* Progress bar */}
      <div className="bg-[#2d2d2d] rounded p-5">
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-4">Progress</p>
        <div className="flex items-center justify-between mb-3">
          {PROGRESS_STEPS.map((s, i) => (
            <div key={s.key} className="flex-1 text-center">
              <div className={`mx-auto w-3 h-3 rounded-full ${
                i < currentStep ? "bg-green-500" : i === currentStep ? "bg-[#f08122]" : "bg-white/15"
              }`} />
              <p className={`mt-2 text-[9px] font-condensed uppercase tracking-widest ${
                i <= currentStep ? "text-white/80" : "text-white/30"
              }`}>{s.label}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-white/5 mt-4 pt-4">
          {summary.pending > 0 ? (
            <p className="text-yellow-300/80 text-sm">
              <strong>{summary.pending} item{summary.pending === 1 ? "" : "s"} still needed from you.</strong>{" "}
              Delivery date will be set when all required inputs are received. Currently {summary.received + summary.waived} of {summary.total} received.
            </p>
          ) : summary.estimated_delivery_at ? (
            <p className="text-green-300/80 text-sm">
              All inputs received {fmtDate(summary.delivery_clock_started_at)}. <strong>Estimated delivery: {fmtDate(summary.estimated_delivery_at)}</strong>. Final scheduled date will be set when production locks the slot.
            </p>
          ) : (
            <p className="text-white/40 text-sm italic">Delivery date pending PM scheduling.</p>
          )}
        </div>
      </div>

      {/* Required inputs checklist */}
      <div className="bg-[#2d2d2d] rounded p-5">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs">What we need from you</p>
          <p className="text-white/30 text-xs font-condensed uppercase tracking-widest">{summary.received + summary.waived} of {summary.total}</p>
        </div>
        <div className="space-y-2">
          {inputs.length === 0 && (
            <p className="text-white/30 italic text-sm">No checklist items yet — your PM will configure these soon.</p>
          )}
          {inputs.map((inp) => (
            <div key={inp.id} className={`bg-[#1a1a1a] rounded p-3 ${inp.status !== "pending" ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 inline-block w-4 h-4 rounded shrink-0 ${
                  inp.status === "received" ? "bg-green-500" :
                  inp.status === "waived"   ? "bg-blue-500"  :
                  "border border-white/30 bg-transparent"
                }`}>
                  {inp.status === "received" && <span className="text-[10px] flex items-center justify-center text-white">✓</span>}
                  {inp.status === "waived" && <span className="text-[10px] flex items-center justify-center text-white">w</span>}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm">{inp.label}</p>
                  {inp.description && <p className="text-white/40 text-xs mt-1">{inp.description}</p>}
                  {inp.received_at && (
                    <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mt-1">
                      {inp.status === "waived" ? "Waived" : "Received"} {fmtDate(inp.received_at)}{inp.received_by ? ` by ${inp.received_by}` : ""}
                    </p>
                  )}
                </div>
                {inp.status === "pending" && (
                  <button
                    onClick={() => selfAttest(inp.id)}
                    disabled={busy}
                    className="text-[#f08122] hover:text-white border border-[#f08122]/40 hover:bg-[#f08122] font-condensed uppercase tracking-widest text-[10px] px-3 py-1.5 rounded shrink-0 disabled:opacity-50"
                  >
                    Mark sent
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {err && <p className="text-red-400 text-xs mt-3">{err}</p>}
      </div>

      {/* File upload */}
      <FileUploadBlock jobId={jobId} onUploaded={refreshSummary} />

      {/* Drawings + comments */}
      {latestDrawing ? (
        <DrawingsBlock
          jobId={jobId}
          drawing={latestDrawing}
          comments={comments}
          onCommented={refreshComments}
        />
      ) : (
        <div className="bg-[#2d2d2d] rounded p-5">
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-2">Drawings</p>
          <p className="text-white/40 text-sm italic">No drawings posted yet. We&apos;ll notify you when they&apos;re ready for review.</p>
        </div>
      )}

      {/* Change requests */}
      <ChangeRequestBlock jobId={jobId} requests={crs} onSubmitted={refreshCRs} />
    </section>
  );
}

function FileUploadBlock({ jobId, onUploaded }: { jobId: string; onUploaded: () => void }) {
  const [kind, setKind] = useState("plans");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("kind", kind);
      const res = await fetch(`/api/portal/jobs/${jobId}/files`, { method: "POST", body: fd });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(b.error ?? "Upload failed"); }
      else { setMsg(`Uploaded ${file.name}`); onUploaded(); }
    } finally { setBusy(false); e.target.value = ""; }
  }

  return (
    <div className="bg-[#2d2d2d] rounded p-5">
      <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-3">Upload</p>
      <p className="text-white/40 text-xs mb-3">Plans, appliance specs, or site photos. Drawings are managed by ACC.</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-1">Kind</label>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122]">
            <option value="plans">Architectural plans</option>
            <option value="appliances">Appliance specs</option>
            <option value="site">Site photos</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-1">File</label>
          <input
            type="file" onChange={upload} disabled={busy}
            accept={kind === "site" ? "image/*,video/*" : kind === "plans" ? ".pdf,image/*" : ".pdf,image/*"}
            className="block w-full text-xs text-white/70 file:bg-[#f08122] file:hover:bg-[#d9711e] file:text-white file:font-condensed file:uppercase file:tracking-widest file:text-xs file:py-1.5 file:px-3 file:rounded file:border-0"
          />
        </div>
        {kind === "site" && (
          <label className="block bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white text-center font-condensed uppercase tracking-widest text-xs py-1.5 px-3 rounded cursor-pointer">
            Take photo
            <input type="file" accept="image/*" capture="environment" onChange={upload} disabled={busy} className="hidden" />
          </label>
        )}
      </div>
      {busy && <p className="text-[#f08122] text-xs mt-2">Uploading...</p>}
      {msg && <p className="text-white/60 text-xs mt-2">{msg}</p>}
    </div>
  );
}

function DrawingsBlock({ jobId, drawing, comments, onCommented }: { jobId: string; drawing: Drawing; comments: Comment[]; onCommented: () => void }) {
  const [page, setPage] = useState<string>("");
  const [cabRef, setCabRef] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (body.trim().length < 3) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/jobs/${jobId}/drawing-comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drawing_filename: drawing.filename,
          page_number: page ? parseInt(page) || null : null,
          cabinet_ref: cabRef.trim() || null,
          body: body.trim(),
        }),
      });
      if (res.ok) { setBody(""); setCabRef(""); setPage(""); onCommented(); }
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-[#2d2d2d] rounded p-5">
      <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-3">Drawings</p>
      <a
        href={`/api/jobs/${jobId}/files?kind=drawings&file=${encodeURIComponent(drawing.filename)}`}
        target="_blank" rel="noreferrer"
        className="block bg-[#1a1a1a] hover:bg-[#252525] border border-[#f08122]/30 rounded p-3 mb-4 transition-colors"
      >
        <p className="text-white text-sm truncate">{drawing.filename}</p>
        <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mt-1">
          {fmtSize(drawing.size)} · {fmtDate(drawing.uploaded_at)} · click to open in new tab
        </p>
      </a>

      <p className="text-white/60 font-condensed uppercase tracking-widest text-xs mb-2">Comments on this drawing</p>
      <div className="space-y-2 mb-4 max-h-72 overflow-y-auto">
        {comments.length === 0 && <p className="text-white/30 italic text-xs">No comments yet.</p>}
        {comments.map((c) => (
          <div key={c.id} className="bg-[#1a1a1a] rounded p-3">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <p className="text-white/70 text-xs">
                <span className="text-[#f08122]">{c.submitted_role === "builder" ? c.submitted_by : "ACC " + c.submitted_by}</span>
                {c.cabinet_ref && <span className="ml-2 text-white/50">on {c.cabinet_ref}</span>}
                {c.page_number && <span className="ml-2 text-white/40">page {c.page_number}</span>}
              </p>
              <span className="text-white/30 text-[10px] font-condensed uppercase tracking-widest">{fmtDate(c.submitted_at)}</span>
            </div>
            <p className="text-white text-sm">{c.body}</p>
            {c.status === "resolved" && <p className="text-green-400/70 text-[10px] font-condensed uppercase tracking-widest mt-1">Resolved</p>}
            {c.status === "promoted" && <p className="text-blue-400/70 text-[10px] font-condensed uppercase tracking-widest mt-1">Promoted to change request</p>}
            {c.status === "open" && c.submitted_role === "builder" && (
              <button
                onClick={async () => {
                  const detail = prompt("Add detail for the formal change request (this becomes the CR body — the original comment is appended automatically):");
                  if (!detail || detail.trim().length < 5) return;
                  await fetch(`/api/portal/jobs/${jobId}/change-request`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ body: detail, source_comment_id: c.id }),
                  });
                  onCommented();
                }}
                className="mt-2 text-blue-400 hover:text-blue-300 border border-blue-700/40 hover:bg-blue-900/20 rounded px-2 py-0.5 text-[10px] font-condensed uppercase tracking-widest"
              >
                Promote to change request
              </button>
            )}
          </div>
        ))}
      </div>

      {/* New comment form */}
      <div className="border-t border-white/5 pt-3">
        <div className="flex gap-2 mb-2">
          <input
            value={cabRef} onChange={(e) => setCabRef(e.target.value)}
            placeholder="Cab # (e.g. B12)"
            className="w-32 bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122]"
          />
          <input
            value={page} onChange={(e) => setPage(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Page #"
            className="w-24 bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122]"
          />
        </div>
        <textarea
          value={body} onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Tip: reference cabinet numbers from the drawing — e.g. 'B12 should be 18in not 12in', 'Stove (range) needs to center on W36'"
          className="w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] mb-2"
        />
        <button
          onClick={submit} disabled={busy || body.trim().length < 3}
          className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs py-2 px-4 rounded disabled:opacity-30"
        >
          {busy ? "Posting..." : "Post comment"}
        </button>
      </div>
    </div>
  );
}

function ChangeRequestBlock({ jobId, requests, onSubmitted }: { jobId: string; requests: CR[]; onSubmitted: () => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (body.trim().length < 5) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/jobs/${jobId}/change-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      if (res.ok) { setBody(""); onSubmitted(); }
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-[#2d2d2d] rounded p-5">
      <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-3">Change requests</p>
      <p className="text-white/40 text-xs mb-3">For larger changes — different cabinet styles, room layout shifts, accessory swaps. Drawing-specific notes go in the comments section above.</p>

      <div className="space-y-2 mb-4 max-h-72 overflow-y-auto">
        {requests.length === 0 && <p className="text-white/30 italic text-xs">None yet.</p>}
        {requests.map((cr) => (
          <div key={cr.id} className="bg-[#1a1a1a] rounded p-3">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <p className="text-white/70 text-xs">
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
            {cr.resolution_notes && (
              <p className="text-white/50 text-xs mt-2 italic">ACC: {cr.resolution_notes}</p>
            )}
          </div>
        ))}
      </div>

      <textarea
        value={body} onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Describe the change. The more specific the better — cabinet numbers, room, dimensions."
        className="w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] mb-2"
      />
      <button
        onClick={submit} disabled={busy || body.trim().length < 5}
        className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs py-2 px-4 rounded disabled:opacity-30"
      >
        {busy ? "Submitting..." : "Submit change request"}
      </button>
    </div>
  );
}
