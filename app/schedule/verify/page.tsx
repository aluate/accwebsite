"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

export const dynamic = "force-dynamic";

type WeekRow = {
  week_start: string;
  event_count: number;
  verified: { verified_by: string; verified_at: string; notes: string | null } | null;
};

function fmt(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtEnd(iso: string) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + 6);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtVerifiedAt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ScheduleVerifyPage() {
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/schedule/weeks");
    const d = await r.json() as { weeks: WeekRow[] };
    setWeeks(d.weeks ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function verify(ws: string) {
    setBusy(ws);
    await fetch("/api/schedule/weeks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week_start: ws, notes: notes[ws] || undefined }),
    });
    setBusy(null);
    await load();
  }

  async function unverify(ws: string) {
    setBusy(ws);
    await fetch(`/api/schedule/weeks?week_start=${ws}`, { method: "DELETE" });
    setBusy(null);
    await load();
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-[#111] text-white px-4 py-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-heading uppercase tracking-wide text-white">Weekly Schedule Verify</h1>
          <p className="text-white/40 text-sm mt-1">Lock past weeks as historical truth. Verified weeks are the official record of what actually happened.</p>
        </div>
        <Link href="/schedule" className="text-white/30 text-xs font-condensed uppercase tracking-wider hover:text-white transition-colors mt-1">
          ← Calendar
        </Link>
      </div>

      {loading ? (
        <p className="text-white/30 text-sm">Loading…</p>
      ) : weeks.length === 0 ? (
        <p className="text-white/20 text-sm italic">No schedule data found.</p>
      ) : (
        <div className="space-y-3">
          {weeks.map((w) => {
            const isPast = w.week_start < today;
            const isCurrent = !isPast;
            const isVerified = !!w.verified;

            return (
              <div
                key={w.week_start}
                className={`border rounded-xl p-4 transition-colors ${
                  isVerified
                    ? "bg-green-900/20 border-green-700/40"
                    : isCurrent
                    ? "bg-[#f08122]/5 border-[#f08122]/20"
                    : "bg-white/5 border-white/10"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium text-sm">
                        {fmt(w.week_start)} – {fmtEnd(w.week_start)}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] font-condensed uppercase tracking-widest bg-[#f08122]/20 text-[#f08122] px-2 py-0.5 rounded">
                          Current week
                        </span>
                      )}
                      {isVerified && (
                        <span className="text-[10px] font-condensed uppercase tracking-widest bg-green-900/40 text-green-400 px-2 py-0.5 rounded">
                          ✓ Verified
                        </span>
                      )}
                    </div>
                    <p className="text-white/40 text-xs mt-1">
                      {w.event_count} event{w.event_count !== 1 ? "s" : ""} scheduled
                      {isVerified && w.verified && (
                        <> · Verified by {w.verified.verified_by} on {fmtVerifiedAt(w.verified.verified_at)}</>
                      )}
                      {isVerified && w.verified?.notes && (
                        <span className="block text-white/30 mt-0.5">Note: {w.verified.notes}</span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isPast && !isVerified && (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Optional note…"
                          value={notes[w.week_start] ?? ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [w.week_start]: e.target.value }))}
                          className="bg-[#1e1e1e] border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#f08122]/50 w-36"
                        />
                        <button
                          onClick={() => verify(w.week_start)}
                          disabled={busy === w.week_start}
                          className="bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-condensed uppercase tracking-wider px-3 py-1.5 rounded transition-colors"
                        >
                          {busy === w.week_start ? "…" : "Verify"}
                        </button>
                      </div>
                    )}
                    {isVerified && (
                      <button
                        onClick={() => unverify(w.week_start)}
                        disabled={busy === w.week_start}
                        className="text-red-400/50 hover:text-red-400 disabled:opacity-30 text-xs font-condensed uppercase tracking-wider transition-colors"
                      >
                        {busy === w.week_start ? "…" : "Un-verify"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-white/20 text-xs italic pt-2">
        Verify a week once you've confirmed the schedule matches what actually happened on the floor. Verified weeks are locked as the official historical record.
      </p>
    </div>
  );
}
