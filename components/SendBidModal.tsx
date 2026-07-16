"use client";

/**
 * SendBidModal — modal for sending the bid email to a client.
 *
 * Shown on the job detail page for PM/admin when the job is in intake or bid status.
 *
 * Features:
 * - Checkbox to include web estimate link (if estimate exists for this job)
 * - File picker from the job's 02_quote folder for attaching PDFs (Innergy, ppak, etc.)
 * - Note field pre-populated from PM
 * - Sends via /api/jobs/[id]/send-bid
 */

import { useState, useEffect, useCallback } from "react";

type JobFile = {
  id: string;
  filename: string;
  kind: string;
  size: number;
};

type Estimate = {
  id: string;
  title: string;
  sell_price: number | null;
  status: string;
};

function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmt$(n: number | null) {
  if (!n) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });
}

export function SendBidModal({
  jobId,
  clientEmail,
  onClose,
  onSent,
}: {
  jobId: string;
  clientEmail: string | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState(clientEmail ?? "");
  const [cc, setCc] = useState("");
  const [note, setNote] = useState("");
  const [includeEstimate, setIncludeEstimate] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [quoteFiles, setQuoteFiles] = useState<JobFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);

  const load = useCallback(async () => {
    setLoadingFiles(true);
    try {
      // Load job files (02_quote folder) and estimates in parallel
      const [filesRes, estsRes] = await Promise.all([
        fetch(`/api/jobs/${jobId}/files`),
        fetch(`/api/admin/estimating?job_id=${jobId}`).catch(() => null),
      ]);

      if (filesRes.ok) {
        const data = await filesRes.json();
        const allFiles: JobFile[] = [];
        const filesByKind = data.files ?? {};
        for (const [kind, files] of Object.entries(filesByKind)) {
          if (kind === "02_quote") {
            for (const f of files as Array<{ id: string; filename: string; size: number }>) {
              allFiles.push({ id: f.id, filename: f.filename, kind, size: f.size });
            }
          }
        }
        setQuoteFiles(allFiles);
      }

      if (estsRes?.ok) {
        const data = await estsRes.json();
        const jobEsts = (data.estimates ?? []).filter((e: Estimate) => true);
        setEstimates(jobEsts);
        if (jobEsts.length > 0) setIncludeEstimate(true);
      }
    } finally {
      setLoadingFiles(false);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  function toggleFile(id: string) {
    setSelectedFileIds((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  }

  async function send() {
    if (!to.trim()) { setErr("Recipient email is required"); return; }
    setSending(true);
    setErr("");
    try {
      const res = await fetch(`/api/jobs/${jobId}/send-bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim(),
          cc: cc.trim() || undefined,
          note: note.trim() || undefined,
          include_estimate: includeEstimate,
          file_ids: selectedFileIds,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErr(body.error ?? "Failed to send");
        return;
      }
      onSent();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-[#1a1b1c] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="font-heading text-lg uppercase tracking-wide text-[#f08122]">Send Bid</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Recipients */}
          <div className="space-y-2">
            <label className="text-xs text-white/40 uppercase tracking-wide">To</label>
            <input
              className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f08122]/50 focus:outline-none"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="client@email.com"
              type="email"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-white/40 uppercase tracking-wide">CC (optional)</label>
            <input
              className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f08122]/50 focus:outline-none"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="builder@example.com"
              type="email"
            />
          </div>

          {/* Web estimate */}
          <div className="border border-white/10 rounded-lg p-4 space-y-3">
            <p className="text-xs text-white/50 uppercase tracking-wide font-semibold">Estimate</p>
            {loadingFiles ? (
              <p className="text-white/30 text-xs">Loading…</p>
            ) : estimates.length > 0 ? (
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeEstimate}
                  onChange={(e) => setIncludeEstimate(e.target.checked)}
                  className="mt-0.5 accent-[#f08122]"
                />
                <div>
                  <p className="text-sm text-white">Include web estimate link</p>
                  {estimates.map((e) => (
                    <p key={e.id} className="text-xs text-white/40 mt-0.5">
                      {e.title} · {fmt$(e.sell_price)} · {e.status}
                    </p>
                  ))}
                </div>
              </label>
            ) : (
              <p className="text-white/30 text-xs">
                No web estimate found for this job.{" "}
                <a href="/admin/estimating" className="text-[#f08122]/70 hover:text-[#f08122] underline">
                  Create one →
                </a>
              </p>
            )}
          </div>

          {/* File attachments */}
          <div className="border border-white/10 rounded-lg p-4 space-y-3">
            <p className="text-xs text-white/50 uppercase tracking-wide font-semibold">
              Attach from 02 Quote folder
            </p>
            {loadingFiles ? (
              <p className="text-white/30 text-xs">Loading files…</p>
            ) : quoteFiles.length === 0 ? (
              <p className="text-white/30 text-xs">
                No files in the 02 Quote folder. Upload a PDF there to attach it here.
              </p>
            ) : (
              <div className="space-y-2">
                {quoteFiles.map((f) => (
                  <label key={f.id} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedFileIds.includes(f.id)}
                      onChange={() => toggleFile(f.id)}
                      className="accent-[#f08122]"
                    />
                    <span className="text-sm text-white/80 flex-1 truncate">{f.filename}</span>
                    <span className="text-xs text-white/30 shrink-0">{fmtSize(f.size)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Note */}
          <div className="space-y-2">
            <label className="text-xs text-white/40 uppercase tracking-wide">Note for client (optional)</label>
            <textarea
              className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f08122]/50 focus:outline-none resize-none"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any context for the client — scope notes, what to look for, next steps…"
            />
          </div>

          {err && <p className="text-red-400 text-sm">{err}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
          <button onClick={onClose} className="text-white/40 hover:text-white text-sm">
            Cancel
          </button>
          <button
            onClick={send}
            disabled={sending || !to.trim()}
            className="bg-[#f08122] hover:bg-[#e07012] text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50 transition-colors"
          >
            {sending ? "Sending…" : "Send Bid Email"}
          </button>
        </div>
      </div>
    </div>
  );
}
