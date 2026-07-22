"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteJobButton({ jobId, jobName }: { jobId: string; jobName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function doDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        alert("Delete failed: " + (body.error ?? res.status));
        return;
      }
      router.push("/jobs");
    } finally {
      setDeleting(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 bg-red-950/40 border border-red-700/40 rounded px-3 py-1.5">
        <span className="text-red-400 text-xs font-condensed uppercase tracking-widest">
          Delete {jobName}?
        </span>
        <button
          onClick={doDelete}
          disabled={deleting}
          className="text-red-400 hover:text-red-300 text-xs font-condensed uppercase tracking-widest border border-red-700/60 rounded px-2 py-0.5 transition-colors disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Confirm"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-white/30 hover:text-white text-xs font-condensed uppercase tracking-widest px-2 py-0.5 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-white/20 hover:text-red-400 text-xs font-condensed uppercase tracking-widest transition-colors"
    >
      Delete Job
    </button>
  );
}
