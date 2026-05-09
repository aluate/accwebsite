"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReleaseToProductionButton({
  jobId,
  currentStatus,
}: {
  jobId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "open" | "submitting" | "done" | "error">("idle");
  const [note, setNote] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Already released — show static badge
  if (currentStatus === "production" || currentStatus === "complete") {
    return (
      <div className="inline-flex items-center gap-2 bg-yellow-900/30 border border-yellow-600/40 text-yellow-300 font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded">
        ✓ In Production
      </div>
    );
  }

  async function submit() {
    setState("submitting");
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "production",
          _actor: "pm",
          _actorRole: "pm",
          ...(note.trim() ? { release_note: note.trim() } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setErrorMsg(body.error ?? "Failed to release");
        setState("error");
        return;
      }
      setState("done");
      // Give the server a moment then refresh server-component data
      setTimeout(() => router.refresh(), 800);
    } catch (e) {
      setErrorMsg(String(e));
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="inline-flex items-center gap-2 bg-yellow-900/30 border border-yellow-600/40 text-yellow-300 font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded">
        ✓ In Production
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => state === "idle" && setState("open")}
        className="bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 hover:border-white/20 font-condensed uppercase tracking-widest text-sm py-2.5 px-5 rounded transition-colors"
      >
        Release to Production
      </button>

      {state === "open" && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setState("idle");
          }}
        >
          <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-6 w-full max-w-md">
            <h3 className="font-heading text-lg uppercase tracking-wide text-white mb-1">
              Release to Production
            </h3>
            <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mb-4">
              Marks this job as In Production
            </p>

            <div className="bg-yellow-900/20 border border-yellow-600/30 rounded p-3 mb-5">
              <p className="text-yellow-300/80 text-xs font-condensed leading-relaxed">
                ⚠ This marks the job as In Production. The spec will be locked
                for editing. Make sure all spec sections are complete and the
                client has approved before proceeding.
              </p>
            </div>

            <label className="block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5">
              Release note <span className="text-white/25 normal-case">(optional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder='e.g. "All specs confirmed, client signed off via email 5/9"'
              className="w-full bg-[#111] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] resize-none mb-4"
            />

            {state === "error" && (
              <p className="text-red-400 text-xs font-condensed mb-3">{errorMsg}</p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setState("idle")}
                className="text-white/40 hover:text-white text-xs font-condensed uppercase tracking-widest px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={state === "submitting"}
                className="bg-white/15 hover:bg-white/25 disabled:opacity-50 text-white font-condensed uppercase tracking-widest text-xs px-5 py-2 rounded transition-colors"
              >
                {state === "submitting" ? "Releasing…" : "Release"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
