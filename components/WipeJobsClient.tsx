"use client";

import { useState } from "react";

export function WipeJobsClient({ count }: { count: number }) {
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const confirmed = confirmText === "DELETE ALL JOBS";

  async function handleWipe(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmed) return;
    if (!window.confirm(`Final confirmation: permanently delete all ${count} jobs and all related data?`)) return;

    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/wipe-jobs", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, message: `Done. Deleted ${data.deleted ?? count} jobs and all related data.` });
        setConfirmText("");
      } else {
        setResult({ ok: false, message: data.error ?? "Wipe failed. Check server logs." });
      }
    } catch {
      setResult({ ok: false, message: "Network error. Wipe may not have completed." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-[#2d2d2d] border border-red-500/20 rounded-lg p-6 max-w-lg">
      <p className="text-white/60 text-sm mb-6 leading-relaxed">
        This will permanently delete all{" "}
        <span className="text-red-400 font-semibold">{count} jobs</span> and all related
        data (specs, gate check-ins, PM time entries, activity logs, file records, etc.).
        This action <span className="text-red-400 font-semibold">cannot be undone</span>.
      </p>

      <form onSubmit={handleWipe} className="space-y-4">
        <div>
          <label className="block text-white/50 font-condensed uppercase tracking-widest text-xs mb-2">
            Type <span className="text-red-400">DELETE ALL JOBS</span> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE ALL JOBS"
            autoComplete="off"
            className="w-full bg-[#1c1c1c] border border-white/15 rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-red-500/60"
          />
        </div>

        <button
          type="submit"
          disabled={!confirmed || loading}
          className="w-full bg-red-700 hover:bg-red-600 disabled:bg-red-900/40 disabled:text-white/30 text-white font-condensed uppercase tracking-widest text-sm py-3 px-6 rounded transition-colors"
        >
          {loading ? "Wiping..." : "WIPE ALL JOBS"}
        </button>
      </form>

      {result && (
        <div className={`mt-4 p-3 rounded text-sm font-condensed ${result.ok ? "bg-green-900/30 text-green-300 border border-green-700/30" : "bg-red-900/30 text-red-300 border border-red-700/30"}`}>
          {result.message}
        </div>
      )}
    </div>
  );
}
