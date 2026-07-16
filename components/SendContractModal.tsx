"use client";

/**
 * SendContractModal — modal for sending the contract packet to a client.
 *
 * Contract packet = 3 documents:
 *   1. Residential Disclosure (auto-attached from template library)
 *   2. Final Drawings (selected from job files: 01_plan or 05_drawings)
 *   3. Quote (web estimate link and/or 02_quote job files)
 *
 * On send: creates a signoff token, sends contractSent email,
 * client clicks the link to review and sign.
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

type DisclosureStatus = "loading" | "ready" | "missing";

function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const DRAWING_KINDS = ["01_plan", "05_drawings", "05a_redlines"];
const QUOTE_KINDS = ["02_quote"];

function StatusDot({ ok }: { ok: boolean | "loading" }) {
  if (ok === "loading") return <span className="w-2 h-2 rounded-full bg-white/20 inline-block" />;
  return ok
    ? <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
    : <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />;
}

export function SendContractModal({
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
  const [drawingFileIds, setDrawingFileIds] = useState<string[]>([]);
  const [quoteFileIds, setQuoteFileIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [sentUrl, setSentUrl] = useState<string | null>(null);

  const [disclosureStatus, setDisclosureStatus] = useState<DisclosureStatus>("loading");
  const [drawingFiles, setDrawingFiles] = useState<JobFile[]>([]);
  const [quoteFiles, setQuoteFiles] = useState<JobFile[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);

  const load = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const [filesRes, disclosureRes, estsRes] = await Promise.all([
        fetch(`/api/jobs/${jobId}/files`),
        fetch(`/api/admin/template-documents/residential_disclosure`),
        fetch(`/api/admin/estimating?job_id=${jobId}`).catch(() => null),
      ]);

      // Disclosure check
      if (disclosureRes.ok) {
        const data = await disclosureRes.json();
        setDisclosureStatus(data.url ? "ready" : "missing");
      } else {
        setDisclosureStatus("missing");
      }

      // Job files
      if (filesRes.ok) {
        const data = await filesRes.json();
        const drawings: JobFile[] = [];
        const quotes: JobFile[] = [];
        const filesByKind = data.files ?? {};
        for (const [kind, files] of Object.entries(filesByKind)) {
          for (const f of files as Array<{ id: string; filename: string; size: number }>) {
            const item = { id: f.id, filename: f.filename, kind, size: f.size };
            if (DRAWING_KINDS.includes(kind)) drawings.push(item);
            if (QUOTE_KINDS.includes(kind)) quotes.push(item);
          }
        }
        setDrawingFiles(drawings);
        setQuoteFiles(quotes);
      }

      // Estimates
      if (estsRes?.ok) {
        const data = await estsRes.json();
        const jobEsts = data.estimates ?? [];
        setEstimates(jobEsts);
        if (jobEsts.length > 0) setIncludeEstimate(true);
      }
    } finally {
      setLoadingFiles(false);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  function toggleFile(id: string, setter: React.Dispatch<React.SetStateAction<string[]>>) {
    setter((prev) => prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]);
  }

  async function send() {
    if (!to.trim()) { setErr("Recipient email is required"); return; }
    setSending(true);
    setErr("");
    try {
      const res = await fetch(`/api/jobs/${jobId}/send-contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim(),
          cc: cc.trim() || undefined,
          note: note.trim() || undefined,
          include_estimate: includeEstimate,
          drawing_file_ids: drawingFileIds,
          quote_file_ids: quoteFileIds,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErr(body.error ?? "Failed to send");
        return;
      }
      const data = await res.json();
      setSentUrl(data.signoffUrl ?? null);
      onSent();
    } finally {
      setSending(false);
    }
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (sentUrl) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
        <div className="bg-[#1a1b1c] border border-green-700/40 rounded-2xl w-full max-w-md shadow-2xl p-8 text-center space-y-4">
          <div className="text-4xl">✅</div>
          <h2 className="font-heading text-xl uppercase tracking-wide text-green-400">Contract Sent</h2>
          <p className="text-white/50 text-sm">The client will receive an email with their documents and a link to sign.</p>
          <div className="bg-[#111] border border-white/10 rounded-lg p-3 text-xs text-white/40 break-all">{sentUrl}</div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-sm underline">Close</button>
        </div>
      </div>
    );
  }

  const hasDrawings = drawingFileIds.length > 0;
  const canSend = to.trim() && !loadingFiles;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-[#1a1b1c] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="font-heading text-lg uppercase tracking-wide text-[#f08122]">Send Contract</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Recipients */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-white/40 uppercase tracking-wide">To</label>
              <input
                className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f08122]/50 focus:outline-none"
                value={to} onChange={(e) => setTo(e.target.value)}
                placeholder="client@email.com" type="email"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-white/40 uppercase tracking-wide">CC (optional)</label>
              <input
                className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f08122]/50 focus:outline-none"
                value={cc} onChange={(e) => setCc(e.target.value)}
                placeholder="builder@example.com" type="email"
              />
            </div>
          </div>

          {/* Document checklist */}
          <div className="border border-white/10 rounded-lg divide-y divide-white/5">
            {/* 1. Disclosure */}
            <div className="px-4 py-3 flex items-start gap-3">
              <StatusDot ok={disclosureStatus === "loading" ? "loading" : disclosureStatus === "ready"} />
              <div className="flex-1">
                <p className="text-sm text-white font-medium">Residential Disclosure</p>
                {disclosureStatus === "missing" && (
                  <p className="text-xs text-yellow-400 mt-0.5">
                    Not uploaded yet.{" "}
                    <a href="/admin/documents" target="_blank" className="underline hover:text-yellow-300">
                      Upload in Document Library →
                    </a>
                  </p>
                )}
                {disclosureStatus === "ready" && (
                  <p className="text-xs text-white/30 mt-0.5">Auto-attached from document library</p>
                )}
              </div>
            </div>

            {/* 2. Final Drawings */}
            <div className="px-4 py-3">
              <div className="flex items-start gap-3 mb-2">
                <StatusDot ok={hasDrawings} />
                <div>
                  <p className="text-sm text-white font-medium">Final Drawings</p>
                  <p className="text-xs text-white/30">From 01 Plan or 05 Drawings folders</p>
                </div>
              </div>
              {loadingFiles ? (
                <p className="text-xs text-white/30 ml-5">Loading…</p>
              ) : drawingFiles.length === 0 ? (
                <p className="text-xs text-yellow-400/70 ml-5">
                  No drawing files found. Upload to 01 Plan or 05 Drawings in the job files panel.
                </p>
              ) : (
                <div className="space-y-1.5 ml-5">
                  {drawingFiles.map((f) => (
                    <label key={f.id} className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={drawingFileIds.includes(f.id)}
                        onChange={() => toggleFile(f.id, setDrawingFileIds)}
                        className="accent-[#f08122]"
                      />
                      <span className="text-sm text-white/70 flex-1 truncate">{f.filename}</span>
                      <span className="text-xs text-white/25 shrink-0">{fmtSize(f.size)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Quote */}
            <div className="px-4 py-3">
              <div className="flex items-start gap-3 mb-2">
                <StatusDot ok={includeEstimate || quoteFileIds.length > 0} />
                <div>
                  <p className="text-sm text-white font-medium">Quote / Estimate</p>
                </div>
              </div>
              {loadingFiles ? (
                <p className="text-xs text-white/30 ml-5">Loading…</p>
              ) : (
                <div className="ml-5 space-y-2">
                  {estimates.length > 0 && (
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeEstimate}
                        onChange={(e) => setIncludeEstimate(e.target.checked)}
                        className="accent-[#f08122]"
                      />
                      <span className="text-sm text-white/70">Include web estimate link in email</span>
                    </label>
                  )}
                  {quoteFiles.map((f) => (
                    <label key={f.id} className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={quoteFileIds.includes(f.id)}
                        onChange={() => toggleFile(f.id, setQuoteFileIds)}
                        className="accent-[#f08122]"
                      />
                      <span className="text-sm text-white/70 flex-1 truncate">{f.filename}</span>
                      <span className="text-xs text-white/25 shrink-0">{fmtSize(f.size)}</span>
                    </label>
                  ))}
                  {estimates.length === 0 && quoteFiles.length === 0 && (
                    <p className="text-xs text-yellow-400/70">
                      No estimate or quote files found. Upload to 02 Quote or create an estimate first.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <label className="text-xs text-white/40 uppercase tracking-wide">Note for client (optional)</label>
            <textarea
              className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f08122]/50 focus:outline-none resize-none"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any notes to include — scope clarifications, timeline, what to review before signing…"
            />
          </div>

          <div className="bg-[#111] border border-white/5 rounded-lg px-4 py-3 text-xs text-white/30">
            The client will receive a link to review and sign electronically. A certificate of completion PDF is generated automatically after they sign.
          </div>

          {err && <p className="text-red-400 text-sm">{err}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
          <button onClick={onClose} className="text-white/40 hover:text-white text-sm">Cancel</button>
          <button
            onClick={send}
            disabled={sending || !canSend}
            className="bg-[#1e3a5f] hover:bg-[#17304f] text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50 transition-colors"
          >
            {sending ? "Sending…" : "Send Contract & Signature Request →"}
          </button>
        </div>
      </div>
    </div>
  );
}
