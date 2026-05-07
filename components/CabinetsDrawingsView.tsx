"use client";

import { useEffect, useState, useCallback } from "react";

// Per Karl's 2026-05 decision (CV integration option C): cabinets are NOT
// enumerated in the spec UI. The spec instead points to the most-recent
// drawings PDF uploaded to the job's Files panel. Cabinet Vision remains the
// source of truth for cabinet line items; future phase will pull dynamic
// reports from CV directly.
//
// This view renders the linked drawings + an unmistakable nudge to upload
// new ones if missing. The legacy manual-entry UI is hidden by default behind
// a "show legacy" toggle so we don't lose any data already entered on
// existing specs.

type DrawingFile = {
  filename: string;
  size: number;
  uploaded_at: string;
  url: string;
};

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function CabinetsDrawingsView({
  jobId,
  legacyManualEntry,
}: {
  jobId: string;
  /**
   * Optional: render the legacy per-room manual cabinet entry view inline
   * (only when the toggle is open). Pass through from ResidentialSpecClient.
   */
  legacyManualEntry?: React.ReactNode;
}) {
  const [drawings, setDrawings] = useState<DrawingFile[] | null>(null);
  const [loading, setLoading]   = useState(true);
  const [showLegacy, setShowLegacy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/files`, { cache: "no-store" });
      if (!res.ok) { setDrawings([]); return; }
      const body = await res.json();
      setDrawings(body.files?.drawings ?? []);
    } catch {
      setDrawings([]);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { refresh(); }, [refresh]);

  const latest = drawings && drawings.length > 0 ? drawings[0] : null;
  const older  = drawings && drawings.length > 1 ? drawings.slice(1) : [];

  return (
    <div className="space-y-6">
      <div className="bg-[#1a1a1a] border-l-2 border-[#f08122] rounded p-4">
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-2">
          Cabinets — linked from drawings
        </p>
        <p className="text-white/60 text-sm leading-relaxed">
          Cabinet line items are not enumerated on the spec sheet. The drawings
          PDF (Cabinet Vision export) is the source of truth — upload it as
          <span className="text-white/80 font-medium"> drawings</span> on the
          job's Files panel and it appears here automatically.
        </p>
        <p className="text-white/30 text-xs mt-2 font-condensed uppercase tracking-widest">
          Future: dynamic CV reports will populate cabinets directly from this view.
        </p>
      </div>

      {loading && (
        <p className="text-white/30 text-xs font-condensed uppercase tracking-widest">Loading drawings…</p>
      )}

      {!loading && !latest && (
        <div className="bg-yellow-900/20 border border-yellow-700/30 rounded p-5">
          <p className="text-yellow-300/80 font-condensed uppercase tracking-widest text-xs mb-2">
            No drawings uploaded yet
          </p>
          <p className="text-yellow-100/70 text-sm leading-relaxed">
            Go to <a href={`/jobs/${jobId}`} className="underline hover:text-yellow-200">the job page</a>,
            scroll to the Files panel, set kind to "Cabinet Drawings", and upload your CV-exported PDF.
            Reload this tab when done.
          </p>
        </div>
      )}

      {latest && (
        <div className="bg-[#2d2d2d] rounded p-5">
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-white/60 font-condensed uppercase tracking-widest text-xs">Latest drawings</p>
            <button
              type="button"
              onClick={refresh}
              className="text-white/30 hover:text-[#f08122] text-[10px] font-condensed uppercase tracking-widest"
            >
              Refresh
            </button>
          </div>
          <a
            href={latest.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between bg-[#1a1a1a] hover:bg-[#252525] border border-[#f08122]/30 rounded px-4 py-3 transition-colors group"
          >
            <span className="text-white text-sm truncate flex-1">{latest.filename}</span>
            <span className="text-white/30 text-[10px] font-condensed uppercase tracking-widest shrink-0 ml-3">
              {fmtSize(latest.size)} · {new Date(latest.uploaded_at).toLocaleDateString()}
            </span>
            <span className="text-white/20 group-hover:text-[#f08122] transition-colors text-lg ml-3">→</span>
          </a>

          {older.length > 0 && (
            <details className="mt-4">
              <summary className="text-white/30 hover:text-white/60 text-xs font-condensed uppercase tracking-widest cursor-pointer">
                {older.length} older version{older.length === 1 ? "" : "s"}
              </summary>
              <div className="space-y-1 mt-3">
                {older.map((f) => (
                  <a
                    key={f.filename}
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between bg-[#1a1a1a] hover:bg-[#252525] rounded px-3 py-2 transition-colors"
                  >
                    <span className="text-white/60 text-xs truncate flex-1">{f.filename}</span>
                    <span className="text-white/20 text-[10px] font-condensed uppercase tracking-widest shrink-0 ml-3">
                      {fmtSize(f.size)} · {new Date(f.uploaded_at).toLocaleDateString()}
                    </span>
                  </a>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {legacyManualEntry && (
        <div className="border-t border-white/5 pt-6">
          <button
            type="button"
            onClick={() => setShowLegacy((v) => !v)}
            className="text-white/30 hover:text-white/60 text-[10px] font-condensed uppercase tracking-widest"
          >
            {showLegacy ? "Hide" : "Show"} legacy manual cabinet entry
          </button>
          {showLegacy && (
            <div className="mt-4">
              <p className="text-white/30 text-xs font-condensed uppercase tracking-widest mb-3 italic">
                Legacy view — preserved so existing data isn't lost. Do not enter new cabinets here unless explicitly directed.
              </p>
              {legacyManualEntry}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
