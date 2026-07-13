"use client";

import { useState, useEffect } from "react";

type BugReport = {
  id: string;
  page_url: string;
  user_name: string;
  user_role: string;
  what_trying: string;
  what_happened: string;
  severity: string;
  status: string;
  created_at: string;
};

const SEV_COLOR: Record<string, string> = {
  blocker: "text-red-400 bg-red-400/10 border-red-400/20",
  annoying: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  minor:    "text-green-400 bg-green-400/10 border-green-400/20",
};

export function BugLogClient() {
  const [bugs, setBugs]       = useState<BugReport[]>([]);
  const [filter, setFilter]   = useState<"open" | "fixed" | "wont_fix" | "all">("open");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/bug-reports")
      .then((r) => r.json())
      .then((d) => { setBugs(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function updateStatus(id: string, status: string) {
    const res = await fetch("/api/bug-reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setBugs((prev) => prev.map((b) => b.id === id ? { ...b, status } : b));
    }
  }

  const shown = filter === "all" ? bugs : bugs.filter((b) => b.status === filter);
  const counts = {
    open:     bugs.filter((b) => b.status === "open").length,
    fixed:    bugs.filter((b) => b.status === "fixed").length,
    wont_fix: bugs.filter((b) => b.status === "wont_fix").length,
    all:      bugs.length,
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-3xl uppercase tracking-wide text-white">Bug Reports</h1>
        <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mt-1">
          Submitted by the team · {counts.open} open
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-white/10 mb-6 flex-wrap">
        {(["open", "fixed", "wont_fix", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-xs font-condensed uppercase tracking-widest border-b-2 -mb-px transition-colors ${
              filter === f
                ? "border-[#f08122] text-[#f08122]"
                : "border-transparent text-white/30 hover:text-white/60"
            }`}
          >
            {f === "wont_fix" ? "Won't Fix" : f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => (
            <div key={i} className="h-24 bg-white/5 rounded animate-pulse" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="text-white/30 text-sm italic">No {filter === "all" ? "" : filter} bug reports.</p>
      ) : (
        <div className="space-y-3">
          {shown.map((b) => (
            <div key={b.id} className="bg-[#1a1a1a] border border-white/10 rounded p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-condensed uppercase tracking-widest border rounded px-1.5 py-0.5 ${SEV_COLOR[b.severity] ?? "text-white/40 bg-white/5 border-white/10"}`}>
                      {b.severity}
                    </span>
                    <span className="text-white/30 text-xs font-condensed">{b.user_name} · {b.user_role}</span>
                    <span className="text-white/20 text-xs font-condensed">
                      {new Date(b.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-white/40 text-xs truncate font-condensed">{b.page_url}</p>
                  <div className="grid sm:grid-cols-2 gap-3 mt-2">
                    <div>
                      <p className="text-[10px] font-condensed uppercase tracking-widest text-white/30 mb-0.5">Trying to</p>
                      <p className="text-sm text-white">{b.what_trying}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-condensed uppercase tracking-widest text-white/30 mb-0.5">What happened</p>
                      <p className="text-sm text-white/70">{b.what_happened}</p>
                    </div>
                  </div>
                </div>
                {b.status === "open" && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => updateStatus(b.id, "fixed")}
                      className="bg-green-700/20 hover:bg-green-700/40 text-green-300 font-condensed uppercase tracking-widest text-xs px-3 py-1.5 rounded transition-colors"
                    >
                      Fixed
                    </button>
                    <button
                      onClick={() => updateStatus(b.id, "wont_fix")}
                      className="bg-white/5 hover:bg-white/10 text-white/40 font-condensed uppercase tracking-widest text-xs px-3 py-1.5 rounded transition-colors"
                    >
                      Won&apos;t Fix
                    </button>
                  </div>
                )}
                {b.status !== "open" && (
                  <span className={`text-xs font-condensed uppercase tracking-widest shrink-0 ${b.status === "fixed" ? "text-green-400" : "text-white/25"}`}>
                    {b.status === "wont_fix" ? "Won't Fix" : "Fixed"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
