"use client";

import { useState, useEffect, useCallback } from "react";

type BugReport = {
  id: string;
  serial_no: number | null;
  user_name: string;
  user_role: string;
  page_url: string | null;
  what_trying: string;
  what_happened: string;
  severity: string;
  status: string;
  triage: string;
  direction: string | null;
  created_at: string;
};

const SEV_COLOR: Record<string, string> = {
  blocker: "text-red-400 bg-red-400/10 border-red-400/20",
  annoying: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  minor:    "text-green-400 bg-green-400/10 border-green-400/20",
};
const SEV_ICON: Record<string, string> = { blocker: "🚨", annoying: "⚠️", minor: "ℹ️" };

const TRIAGE_OPTIONS = [
  { value: "open",    label: "Open",    color: "text-white/40 bg-white/5 border-white/10" },
  { value: "fix",     label: "Fix",     color: "text-orange-300 bg-orange-400/10 border-orange-400/20" },
  { value: "skip",    label: "Skip",    color: "text-white/25 bg-white/5 border-white/10" },
  { value: "context", label: "Context", color: "text-blue-300 bg-blue-400/10 border-blue-400/20" },
];

function fmtSerial(n: number | null): string {
  if (n == null) return "—";
  return `BUG-${String(n).padStart(3, "0")}`;
}

export function BugLogClient() {
  const [bugs, setBugs]           = useState<BugReport[]>([]);
  const [filter, setFilter]       = useState<"open" | "in_progress" | "deferred" | "fixed" | "all">("open");
  const [loading, setLoading]     = useState(true);
  const [triageState, setTriageState] = useState<Record<string, { triage: string; direction: string; dirty: boolean }>>({});
  const [saving, setSaving]       = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/bug-reports?status=all");
      const d = await r.json();
      const bugList: BugReport[] = d.bugs ?? [];
      setBugs(bugList);
      // Seed triage state
      const ts: typeof triageState = {};
      for (const b of bugList) {
        ts[b.id] = { triage: b.triage ?? "open", direction: b.direction ?? "", dirty: false };
      }
      setTriageState(ts);
    } catch { /* ignore */ }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function saveTriage(id: string) {
    const ts = triageState[id];
    if (!ts) return;
    setSaving((prev) => ({ ...prev, [id]: true }));
    const res = await fetch("/api/bug-reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, triage: ts.triage, direction: ts.direction }),
    });
    if (res.ok) {
      setBugs((prev) => prev.map((b) => b.id === id ? { ...b, triage: ts.triage, direction: ts.direction } : b));
      setTriageState((prev) => ({ ...prev, [id]: { ...ts, dirty: false } }));
    }
    setSaving((prev) => ({ ...prev, [id]: false }));
  }

  function updateLocalTriage(id: string, field: "triage" | "direction", value: string) {
    setTriageState((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { triage: "open", direction: "" }), [field]: value, dirty: true },
    }));
  }

  function downloadMd() {
    const open   = bugs.filter((b) => b.status === "open");
    const closed = bugs.filter((b) => b.status !== "open");
    const fixQueue = bugs.filter((b) => b.triage === "fix" && b.status !== "fixed");

    const lines: string[] = [
      "# ACC Bug Report — " + new Date().toLocaleDateString("en-US", { dateStyle: "long" }),
      "",
      `**Open: ${open.length}  |  Fix queue: ${fixQueue.length}  |  Closed: ${closed.length}  |  Total: ${bugs.length}**`,
      "",
    ];

    const renderSection = (list: BugReport[], title: string) => {
      if (!list.length) return;
      lines.push(`## ${title}`, "");
      for (const b of list) {
        const ts = new Date(b.created_at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
        lines.push(
          `### ${SEV_ICON[b.severity] ?? "•"} [${fmtSerial(b.serial_no)}] ${b.what_trying.slice(0, 60)}`,
          `- **Serial**: \`${fmtSerial(b.serial_no)}\``,
          `- **Reporter**: ${b.user_name} (${b.user_role})`,
          `- **Page**: ${b.page_url ?? "unknown"}`,
          `- **Filed**: ${ts}`,
          `- **Status**: ${b.status}  |  **Triage**: ${b.triage ?? "open"}`,
          b.direction ? `- **Direction**: ${b.direction}` : "",
          "",
          `**What they were trying to do:**`,
          b.what_trying,
          "",
          `**What happened instead:**`,
          b.what_happened,
          "",
          "---",
          "",
        ).filter(x => x !== undefined);
      }
    };

    if (fixQueue.length > 0) renderSection(fixQueue, "🔧 Fix Queue");
    renderSection(open.filter((b) => b.triage !== "fix"), "Open (not queued)");
    renderSection(closed, "Closed");

    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `acc-bugs-${new Date().toISOString().slice(0,10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const shown = filter === "all" ? bugs : bugs.filter((b) => b.status === filter);
  const counts = {
    open:        bugs.filter((b) => b.status === "open").length,
    in_progress: bugs.filter((b) => b.status === "in_progress").length,
    deferred:    bugs.filter((b) => b.status === "deferred").length,
    fixed:       bugs.filter((b) => b.status === "fixed").length,
    all:         bugs.length,
  };
  const fixCount = bugs.filter((b) => b.triage === "fix" && b.status !== "fixed").length;

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-3xl uppercase tracking-wide text-white">Bug Reports</h1>
          <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mt-1">
            {counts.open} open · <span className="text-orange-400">{fixCount} in fix queue</span>
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
        {(["open", "in_progress", "deferred", "fixed", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-xs font-condensed uppercase tracking-widest border-b-2 -mb-px transition-colors ${
              filter === f
                ? "border-[#f08122] text-[#f08122]"
                : "border-transparent text-white/30 hover:text-white/60"
            }`}
          >
            {{ open: "Open", in_progress: "In Progress", deferred: "Deferred", fixed: "Fixed", all: "All" }[f]}{" "}
            ({counts[f as keyof typeof counts]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => <div key={i} className="h-28 bg-white/5 rounded animate-pulse" />)}
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
            .map((b) => {
              const ts  = triageState[b.id] ?? { triage: b.triage ?? "open", direction: b.direction ?? "", dirty: false };
              const tri = TRIAGE_OPTIONS.find((t) => t.value === ts.triage) ?? TRIAGE_OPTIONS[0];
              return (
                <div key={b.id} className={`bg-[#1a1a1a] border rounded p-4 ${b.status !== "open" && b.status !== "in_progress" ? "opacity-60 border-white/5" : "border-white/10"}`}>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0 space-y-2">

                      {/* Header row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Serial chip */}
                        <span className="font-mono font-bold text-[11px] text-[#f08122] bg-[#f08122]/10 border border-[#f08122]/20 rounded px-2 py-0.5 tracking-wider">
                          {fmtSerial(b.serial_no)}
                        </span>
                        <span className={`text-[10px] font-condensed uppercase tracking-widest border rounded px-1.5 py-0.5 ${SEV_COLOR[b.severity] ?? "text-white/40 bg-white/5 border-white/10"}`}>
                          {SEV_ICON[b.severity]} {b.severity}
                        </span>
                        {/* Triage badge */}
                        <span className={`text-[10px] font-condensed uppercase tracking-widest border rounded px-1.5 py-0.5 ${tri.color}`}>
                          {tri.label}
                        </span>
                        <span className="text-white/30 text-xs font-condensed">{b.user_name} · {b.user_role}</span>
                        <span className="text-white/20 text-xs font-condensed">
                          {new Date(b.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          {" "}
                          {new Date(b.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>

                      {b.page_url && (
                        <p className="text-white/25 text-[10px] font-condensed truncate">{b.page_url}</p>
                      )}

                      {/* Bug body */}
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

                      {/* Triage controls */}
                      <div className="border-t border-white/5 pt-3 mt-3 space-y-2">
                        <p className="text-[10px] font-condensed uppercase tracking-widest text-white/25">Triage</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {TRIAGE_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => updateLocalTriage(b.id, "triage", opt.value)}
                              className={`text-[10px] font-condensed uppercase tracking-widest border rounded px-2.5 py-1 transition-colors ${
                                ts.triage === opt.value
                                  ? opt.color + " ring-1 ring-white/20"
                                  : "text-white/20 bg-white/3 border-white/8 hover:border-white/20 hover:text-white/40"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2 items-start">
                          <textarea
                            value={ts.direction}
                            onChange={(e) => updateLocalTriage(b.id, "direction", e.target.value)}
                            placeholder="Direction / context for this bug…"
                            rows={2}
                            className="flex-1 bg-[#2a2a2a] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white/80 placeholder-white/20 font-condensed resize-none focus:outline-none focus:border-[#f08122]/40"
                          />
                          {ts.dirty && (
                            <button
                              onClick={() => saveTriage(b.id)}
                              disabled={saving[b.id]}
                              className="bg-[#f08122] hover:bg-[#d9711e] disabled:opacity-50 text-white font-condensed uppercase tracking-widest text-[10px] px-3 py-1.5 rounded transition-colors whitespace-nowrap"
                            >
                              {saving[b.id] ? "Saving…" : "Save"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Status controls */}
                    <div className="flex flex-col gap-1 shrink-0">
                      {(b.status === "open" || b.status === "in_progress" || b.status === "deferred") ? (
                        <>
                          {b.status !== "in_progress" && (
                            <button onClick={() => updateStatus(b.id, "in_progress")}
                              className="bg-blue-700/20 hover:bg-blue-700/40 text-blue-300 font-condensed uppercase tracking-widest text-[10px] px-2.5 py-1.5 rounded transition-colors">
                              In Progress
                            </button>
                          )}
                          {b.status !== "deferred" && (
                            <button onClick={() => updateStatus(b.id, "deferred")}
                              className="bg-white/5 hover:bg-white/10 text-white/40 font-condensed uppercase tracking-widest text-[10px] px-2.5 py-1.5 rounded transition-colors">
                              Defer
                            </button>
                          )}
                          <button onClick={() => updateStatus(b.id, "fixed")}
                            className="bg-green-700/20 hover:bg-green-700/40 text-green-300 font-condensed uppercase tracking-widest text-[10px] px-2.5 py-1.5 rounded transition-colors">
                            ✓ Fixed
                          </button>
                        </>
                      ) : (
                        <div className="flex flex-col gap-1 items-end">
                          <span className={`text-xs font-condensed uppercase tracking-widest ${b.status === "fixed" ? "text-green-400" : "text-white/25"}`}>
                            {b.status === "fixed" ? "Fixed ✓" : b.status}
                          </span>
                          <button onClick={() => updateStatus(b.id, "open")}
                            className="text-white/20 hover:text-white/50 text-[10px] font-condensed uppercase tracking-widest transition-colors">
                            Reopen
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
