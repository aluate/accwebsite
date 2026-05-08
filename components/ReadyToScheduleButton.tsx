"use client";

import { useState } from "react";

export function ReadyToScheduleButton({ jobId }: { jobId: string }) {
  const [state, setState]   = useState<"idle" | "open" | "submitting" | "done" | "error">("idle");
  const [note, setNote]     = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  async function submit() {
    setState("submitting");
    try {
      const res = await fetch("/api/schedule/ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, note: note || undefined }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setErrorMsg(body.error ?? "Failed");
        setState("error");
        return;
      }
      setState("done");
    } catch (e) {
      setErrorMsg(String(e));
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="inline-flex items-center gap-2 bg-green-900/30 border border-green-700/40 text-green-300 font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded">
        ✓ On Deck — in Karl's queue
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => state === "idle" && setState("open")}
        className="bg-[#f08122]/15 hover:bg-[#f08122]/25 text-[#f08122] border border-[#f08122]/30 font-condensed uppercase tracking-widest text-sm py-2.5 px-5 rounded transition-colors"
      >
        Ready to Schedule
      </button>

      {state === "open" && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setState("idle"); }}
        >
          <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-6 w-full max-w-md">
            <h3 className="font-heading text-lg uppercase tracking-wide text-white mb-1">
              Flag as Ready to Schedule
            </h3>
            <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mb-5">
              Creates a Cab Delivery + Install in Karl's On Deck queue
            </p>

            <label className="block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5">
              Note for Karl <span className="text-white/25 normal-case">(optional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder='e.g. "tops template done", "waiting on island countertop — rest ready"'
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
                className="bg-[#f08122] hover:bg-[#d9711e] disabled:opacity-50 text-white font-condensed uppercase tracking-widest text-xs px-5 py-2 rounded"
              >
                {state === "submitting" ? "Sending…" : "Flag It"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
