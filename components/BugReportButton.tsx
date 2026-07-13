"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

const INTERNAL_PREFIXES = ["/jobs", "/schedule", "/admin", "/installer", "/engineer", "/pm-dashboard", "/punch", "/warranty", "/search", "/dashboard"];
const SEVERITY = ["blocker", "annoying", "minor"] as const;
type Severity = typeof SEVERITY[number];

const SEVERITY_LABEL: Record<Severity, string> = {
  blocker: "🔴 Blocker",
  annoying: "🟡 Annoying",
  minor:    "🟢 Minor",
};

export function BugReportButton({ userName, userRole }: { userName: string; userRole: string }) {
  const pathname = usePathname();
  const [open, setOpen]         = useState(false);
  const [whatTrying, setWhatTrying]   = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [severity, setSeverity] = useState<Severity>("annoying");
  const [state, setState]       = useState<"idle" | "submitting" | "done" | "error">("idle");

  const isInternal = INTERNAL_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  useEffect(() => {
    if (!open) {
      setWhatTrying("");
      setWhatHappened("");
      setSeverity("annoying");
      setState("idle");
    }
  }, [open]);

  if (!isInternal) return null;

  async function submit() {
    if (!whatTrying.trim() || !whatHappened.trim()) return;
    setState("submitting");
    try {
      const res = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_url: window.location.href,
          what_trying: whatTrying,
          what_happened: whatHappened,
          severity,
        }),
      });
      if (!res.ok) throw new Error();
      setState("done");
      setTimeout(() => setOpen(false), 1500);
    } catch {
      setState("error");
    }
  }

  const INPUT = "w-full bg-[#111] border border-white/15 rounded px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#f08122] transition-colors resize-none";
  const LABEL = "block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5";

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 bg-[#2a2a2a] hover:bg-[#333] border border-white/10 text-white/40 hover:text-white/70 text-xs font-condensed uppercase tracking-widest px-3 py-2 rounded-full shadow-lg transition-all"
        title="Report a bug"
      >
        Report a Bug
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative bg-[#2a2a2a] border border-white/10 rounded-lg shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-xl uppercase tracking-wide text-white">Report a Bug</h2>
              <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white transition-colors text-lg leading-none">✕</button>
            </div>

            {/* Auto-captured context */}
            <div className="bg-[#111] border border-white/10 rounded px-3 py-2 mb-5 space-y-0.5">
              <p className="text-[10px] font-condensed uppercase tracking-widest text-white/30">Auto-captured</p>
              <p className="text-xs text-white/50 truncate">{typeof window !== "undefined" ? window.location.pathname : ""}</p>
              <p className="text-xs text-white/40">{userName} · {userRole}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className={LABEL}>What were you trying to do? *</label>
                <textarea
                  rows={2}
                  value={whatTrying}
                  onChange={(e) => setWhatTrying(e.target.value)}
                  placeholder="e.g. Add a new crew member"
                  className={INPUT}
                />
              </div>
              <div>
                <label className={LABEL}>What happened instead? *</label>
                <textarea
                  rows={2}
                  value={whatHappened}
                  onChange={(e) => setWhatHappened(e.target.value)}
                  placeholder="e.g. Page went blank / got an error / nothing happened"
                  className={INPUT}
                />
              </div>
              <div>
                <label className={LABEL}>Severity</label>
                <div className="flex gap-2">
                  {SEVERITY.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSeverity(s)}
                      className={`flex-1 py-1.5 text-xs font-condensed uppercase tracking-wide rounded border transition-colors ${
                        severity === s
                          ? "border-[#f08122] text-[#f08122] bg-[#f08122]/10"
                          : "border-white/10 text-white/40 hover:border-white/20"
                      }`}
                    >
                      {SEVERITY_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              {state === "done" ? (
                <span className="text-green-400 text-sm font-condensed uppercase tracking-widest">Logged — thanks!</span>
              ) : state === "error" ? (
                <span className="text-red-400 text-sm font-condensed uppercase tracking-widest">Failed — try again</span>
              ) : (
                <button
                  onClick={submit}
                  disabled={!whatTrying.trim() || !whatHappened.trim() || state === "submitting"}
                  className="bg-[#f08122] hover:bg-[#d9711e] disabled:opacity-40 text-white font-condensed uppercase tracking-widest text-xs px-5 py-2.5 rounded transition-colors"
                >
                  {state === "submitting" ? "Logging…" : "Submit Report"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
