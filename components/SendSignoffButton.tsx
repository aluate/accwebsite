"use client";

import { useState } from "react";

export function SendSignoffButton({ jobId }: { jobId: string }) {
  const [state, setState] = useState<"idle" | "open" | "generating" | "ready" | "error">("idle");
  const [note, setNote]   = useState("");
  const [url, setUrl]     = useState("");
  const [copied, setCopied] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  async function generate() {
    setState("generating");
    try {
      const res = await fetch("/api/signoffs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, pm_note: note.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setErrMsg(body.error ?? "Failed to generate link");
        setState("error");
        return;
      }
      setUrl(body.url);
      setState("ready");
    } catch (e) {
      setErrMsg(String(e));
      setState("error");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the input text
    }
  }

  function reset() {
    setState("idle");
    setNote("");
    setUrl("");
    setCopied(false);
    setErrMsg("");
  }

  return (
    <>
      <button
        onClick={() => state === "idle" && setState("open")}
        className="bg-[#f08122]/15 hover:bg-[#f08122]/25 text-[#f08122] border border-[#f08122]/30 font-condensed uppercase tracking-widest text-sm py-2.5 px-5 rounded transition-colors"
      >
        Send for Signoff
      </button>

      {(state === "open" || state === "generating" || state === "ready" || state === "error") && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget && state !== "generating") reset(); }}
        >
          <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-6 w-full max-w-md">

            {/* Header */}
            <h3 className="font-heading text-lg uppercase tracking-wide text-white mb-1">
              Send for Client Approval
            </h3>
            <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mb-5">
              Generates a 30-day signature link to share with the client
            </p>

            {/* Note for client */}
            {(state === "open" || state === "error") && (
              <>
                <label className="block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5">
                  Note for client <span className="text-white/25 normal-case">(optional)</span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder='e.g. "Please review the attached spec sheet before signing"'
                  className="w-full bg-[#111] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] resize-none mb-4"
                />

                {state === "error" && (
                  <p className="text-red-400 text-xs font-condensed mb-3">{errMsg}</p>
                )}

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={reset}
                    className="text-white/40 hover:text-white text-xs font-condensed uppercase tracking-widest px-4 py-2"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={generate}
                    className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs px-5 py-2 rounded"
                  >
                    Generate Link
                  </button>
                </div>
              </>
            )}

            {/* Generating */}
            {state === "generating" && (
              <div className="flex items-center gap-3 py-4 text-white/50 text-sm">
                <span className="animate-pulse">⏳</span>
                <span>Generating signoff link…</span>
              </div>
            )}

            {/* Ready — show link */}
            {state === "ready" && (
              <>
                <div className="bg-green-900/20 border border-green-700/30 rounded p-3 mb-4">
                  <p className="text-green-400 text-xs font-condensed mb-1">✓ Link generated — expires in 30 days</p>
                </div>

                <label className="block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5">
                  Signoff URL — copy and send to client
                </label>
                <div className="flex gap-2 mb-4">
                  <input
                    readOnly
                    value={url}
                    className="flex-1 bg-[#111] border border-white/15 rounded px-3 py-2 text-xs text-white/70 font-mono select-all focus:outline-none"
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    onClick={copy}
                    className={`shrink-0 text-xs font-condensed uppercase tracking-widest px-3 py-2 rounded transition-colors ${
                      copied
                        ? "bg-green-900/40 text-green-400 border border-green-700/40"
                        : "bg-white/10 hover:bg-white/20 text-white border border-white/15"
                    }`}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>

                <p className="text-white/30 text-xs mb-5 leading-relaxed">
                  The client can open this link on any device, draw their signature,
                  and submit. You'll receive an email confirmation when they sign.
                </p>

                <div className="flex justify-end">
                  <button
                    onClick={reset}
                    className="text-white/40 hover:text-white text-xs font-condensed uppercase tracking-widest px-4 py-2"
                  >
                    Close
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </>
  );
}
