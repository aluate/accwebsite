"use client";

/**
 * SignoffButton — PM/Admin action to generate a client signoff link.
 *
 * Calls POST /api/signoffs/create, then shows the URL with a copy button.
 * Only rendered for admin/pm roles (enforced by caller).
 */

import { useState } from "react";

export function SignoffButton({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [pmNote, setPmNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerate() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/signoffs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, pm_note: pmNote.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to generate link");
        return;
      }
      const body = await res.json();
      setUrl(body.url);
    } catch {
      setError("Network error — try again");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: select the input text
      const input = document.getElementById("signoff-url-input") as HTMLInputElement;
      input?.select();
    }
  }

  function handleReset() {
    setUrl(null);
    setPmNote("");
    setError("");
    setOpen(false);
  }

  // ── Collapsed state ────────────────────────────────────────────────────────
  if (!open && !url) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/15 text-white/40 hover:text-[#f08122] hover:border-[#f08122]/40 text-xs font-condensed uppercase tracking-wider transition-colors"
      >
        ✍️ Send for Signoff
      </button>
    );
  }

  // ── URL generated — show copy panel ───────────────────────────────────────
  if (url) {
    return (
      <div className="flex-1 bg-green-900/20 border border-green-700/30 rounded-xl px-4 py-3 space-y-2">
        <p className="text-green-400 text-[10px] font-condensed uppercase tracking-widest">
          ✓ Signoff link ready — share with client
        </p>
        <div className="flex items-center gap-2">
          <input
            id="signoff-url-input"
            type="text"
            readOnly
            value={url}
            className="flex-1 bg-[#111] border border-white/10 rounded px-3 py-1.5 text-white/70 text-xs font-mono focus:outline-none select-all"
            onFocus={(e) => e.target.select()}
          />
          <button
            onClick={handleCopy}
            className={`shrink-0 px-3 py-1.5 rounded text-xs font-condensed uppercase tracking-wider transition-colors ${
              copied
                ? "bg-green-700/60 text-green-200"
                : "bg-white/10 hover:bg-white/15 text-white/60"
            }`}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="text-white/20 text-[10px] font-condensed">
          Link expires in 30 days. Client does not need an account.
        </p>
        <button
          onClick={handleReset}
          className="text-[10px] text-white/20 hover:text-white/40 font-condensed uppercase tracking-wider transition-colors"
        >
          Generate another
        </button>
      </div>
    );
  }

  // ── Expanded form ──────────────────────────────────────────────────────────
  return (
    <div className="flex-1 bg-[#1e1e1e] border border-white/10 rounded-xl px-4 py-4 space-y-3">
      <p className="text-[#f08122] font-condensed uppercase tracking-widest text-xs">
        Client Signoff Link
      </p>

      <div>
        <label className="text-[10px] text-white/30 font-condensed uppercase tracking-wider block mb-1">
          Note to client (optional)
        </label>
        <textarea
          value={pmNote}
          onChange={(e) => setPmNote(e.target.value)}
          placeholder="e.g. Please review Section 3 — hardware selection changed from last call."
          rows={2}
          className="w-full bg-[#111] border border-white/10 rounded px-3 py-2 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#f08122]/50 resize-none"
        />
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="flex-1 py-2 rounded-lg bg-[#f08122] text-black text-sm font-condensed uppercase tracking-wider hover:bg-[#d4701e] transition-colors disabled:opacity-40"
        >
          {loading ? "Generating…" : "Generate Link"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-4 py-2 rounded-lg border border-white/10 text-white/40 text-sm hover:border-white/20 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
