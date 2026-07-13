"use client";

import { useState, useEffect, useCallback } from "react";

type BugReport = {
  id: string;
  reporter: string;
  role: string;
  page_url: string | null;
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

const SEV_ICON: Record<string, string> = {
  blocker: "🚨", annoying: "⚠️", minor: "ℹ️",
};

export function BugLogClient() {
  const [bugs, setBugs]       = useState<BugReport[]>([]);
  const [filter, setFilter]   = useState<"open" | "fixed" | "wont_fix" | "all">("open");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/bug-reports?status=all");
      const d = await r.json();
      setBugs(d.bugs ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

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

  function downloadMd() {
    const open   = bugs.filter((b) => b.status === "open");
    const closed = bugs.filter((b) => b.status !== "open");

    const lines: string[] = [
      "# ACC Bug Report — " + new Date().toLocaleDateString("en-US", { dateStyle: "long" }),
      "",
      `**Open: ${open.length}  |  Closed: ${closed.length}  |  Total: ${bugs.length}**`,
      "",
    ];

    const renderSection = (list: BugReport[], title: string) => {
      if (!list.length) return;
      lines.push(`## ${title}`, "");
      for (const b of list) {
        const ts = new Date(b.created_at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
        lines.push(
          `### ${SEV_ICON[b.severity] ?? "•"} [${b.severity.toUpperCase()}] ${b.what_trying.slice(0, 60)}`,
          `- **ID**: \`${b.id}\``,
          `- **Reporter**: ${b.reporter} (${b.role})`,
          `- **Page**: ${b.page_url ?? "unknown"}`,
          `- **Filed**: ${ts}`,
          `- **Status**: ${b.status}`,
          "",
          `**What they were trying to do:**`,
          b.what_trying,
          "",
          `**What happened instead:**`,
          b.what_happened,
          "",
          "---",
          "",
        );
      }
    };

    renderSection(open, "Open");
    renderSection(closed, "Closed");

    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `acc-bugs-${new Date().toISOString().slice(0,10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const shown = filter === "all" ? bugs : bugs.filter((b) => b.status === (filter === "wont_fix" ? "wont_fix" : filter));
  const counts = {
    open:     bugs.filter((b) => b.status === "open").length,
    fixed:    bugs.filter((b) => b.status === "fixed").length,
    wont_fix: bugs.filter((b) => b.status === "wont_fix").length,
    all:      bugs.length,
  };

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-3xl uppercase tracking-wide text-white">Bug Reports</h1>
          <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mt-1">
            Submitted by the team · {counts.open} open
          </p>
        </div>
        <button
          onClick={downloadMd}
          disabled={bugs.length === 0}
          className="bg-white/5 hover:bg-white/10 disabled:opacity-30 border border-white/10 text-white/60 hover:text-white font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded transition-colors"
        >
          ↓ Download .md
        </button>
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
            {f === "wont_fix" ? "Won&apos;t Fix" : f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
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
        <p className="text-white/30 text-sm italic">No {filter === "all" ? "" : filter.replace("_"," ")} bug reports.</p>
      ) : (
        <div className="space-y-3">
          {shown
            .sort((a, b) => {
              const sp: Record<string, number> = { blocker: 0, annoying: 1, minor: 2 };
              const pa = sp[a.severity] ?? 3, pb = sp[b.severity] ?? 3;
              return pa !== pb ? pa - pb : a.created_at.localeCompare(b.created_at);
            })
            .map((b) => (
            <div key={b.id} className={`bg-[#1a1a1a] border rounded p-4 ${b.status !== "open" ? "opacity-60 border-white/5" : "border-white/10"}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-condensed uppercase tracking-widest border rounded px-1.5 py-0.5 ${SEV_COLOR[b.severity] ?? "text-white/40 bg-white/5 border-white/10"}`}>
                      {SEV_ICON[b.severity]} {b.severity}
                    </span>
                    <span className="text-white/30 text-xs font-condensed">{b.reporter} · {b.role}</span>
                    <span className="text-white/20 text-xs font-condensed">
                      {new Date(b.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      {" "}
                      {new Date(b.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {b.page_url && (
                    <p className="text-white/25 text-[10px] font-condensed truncate">{b.page_url}</p>
                  )}
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
                {b.status === "open" ? (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => updateStatus(b.id, "fixed")}
                      className="bg-green-700/20 hover:bg-green-700/40 text-green-300 font-condensed uppercase tracking-widest text-xs px-3 py-1.5 rounded transition-colors"
                    >
                      ✓ Fixed
                    </button>
                    <button
                      onClick={() => updateStatus(b.id, "wont_fix")}
                      className="bg-white/5 hover:bg-white/10 text-white/40 font-condensed uppercase tracking-widest text-xs px-3 py-1.5 rounded transition-colors"
                    >
                      Skip
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 items-end shrink-0">
                    <span className={`text-xs font-condensed uppercase tracking-widest ${b.status === "fixed" ? "text-green-400" : "text-white/25"}`}>
                      {b.status === "wont_fix" ? "Skipped" : "Fixed ✓"}
                    </span>
                    <button
                      onClick={() => updateStatus(b.id, "open")}
                      className="text-white/20 hover:text-white/50 text-[10px] font-condensed uppercase tracking-widest transition-colors"
                    >
                      Reopen
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
