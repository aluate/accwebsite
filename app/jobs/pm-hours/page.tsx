"use client";

/**
 * /jobs/pm-hours
 *
 * Weekly PM hours summary.
 * Shows jobs the logged-in PM touched this week (from activity_log),
 * plus an "Other" bucket. PM enters hours per job and saves.
 */

import { useState, useEffect, useCallback } from "react";

type TouchedJob = {
  job_id: string;
  client_name: string;
  site_address: string;
  job_number: string | null;
};

type Entry = {
  id?: string;
  job_id: string | null;
  hours: number;
  notes?: string;
};

type HoursData = {
  weekStart: string;
  pmName: string;
  touched: TouchedJob[];
  entries: Entry[];
};

function mondayOf(offset = 0): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff + offset * 7);
  return d.toISOString().slice(0, 10);
}

function fmtWeek(iso: string) {
  const d = new Date(iso + "T12:00:00Z");
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (dt: Date) =>
    dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(d)} – ${fmt(end)}`;
}

export default function PMHoursPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = mondayOf(weekOffset);

  const [data, setData] = useState<HoursData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState<Record<string, string>>({}); // job_id|"other" → hours string
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/pm-hours?week=${weekStart}`);
      if (!res.ok) { setError("Failed to load"); setLoading(false); return; }
      const d: HoursData = await res.json();
      setData(d);

      // Pre-fill hours from saved entries
      const h: Record<string, string> = {};
      const n: Record<string, string> = {};
      for (const e of d.entries) {
        const key = e.job_id ?? "other";
        h[key] = String(e.hours || "");
        n[key] = e.notes ?? "";
      }
      setHours(h);
      setNotes(n);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!data) return;
    setSaving(true);
    setError("");

    const entries: Array<{ job_id: string | null; hours: number; notes?: string }> = [];

    // Job entries
    for (const j of data.touched) {
      const h = parseFloat(hours[j.job_id] || "0");
      if (h > 0 || notes[j.job_id]) {
        entries.push({ job_id: j.job_id, hours: h, notes: notes[j.job_id] || undefined });
      }
    }
    // Also include any saved entry for a job not in touched list (from prior week data)
    for (const e of data.entries) {
      if (e.job_id && !data.touched.find((t) => t.job_id === e.job_id)) {
        const h = parseFloat(hours[e.job_id] || "0");
        entries.push({ job_id: e.job_id, hours: h, notes: notes[e.job_id] || undefined });
      }
    }
    // Other bucket
    const otherH = parseFloat(hours["other"] || "0");
    entries.push({ job_id: null, hours: otherH, notes: notes["other"] || undefined });

    try {
      const res = await fetch("/api/pm-hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: weekStart, entries }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) { setError(body.error ?? "Save failed"); setSaving(false); return; }
      setSaved(true);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const totalHours = () => {
    let sum = 0;
    for (const v of Object.values(hours)) {
      const n = parseFloat(v || "0");
      if (!isNaN(n)) sum += n;
    }
    return sum;
  };

  // All rows = touched jobs + any saved entries for non-touched jobs
  const extraJobs: Array<{ job_id: string; label: string }> = data
    ? data.entries
        .filter((e) => e.job_id && !data.touched.find((t) => t.job_id === e.job_id))
        .map((e) => ({ job_id: e.job_id!, label: e.job_id! }))
    : [];

  return (
    <div className="min-h-screen bg-[#111] text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-heading text-2xl uppercase tracking-widest text-white">
              Weekly Hours
            </h1>
            {data && (
              <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mt-0.5">
                {data.pmName}
              </p>
            )}
          </div>
          <a href="/jobs" className="text-white/30 hover:text-white text-xs font-condensed uppercase tracking-widest transition-colors">
            ← Jobs
          </a>
        </div>

        {/* Week nav */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className="text-white/40 hover:text-white px-3 py-1 border border-white/10 hover:border-white/25 rounded text-sm transition-colors"
          >
            ‹ Prev
          </button>
          <div className="flex-1 text-center">
            <p className="text-white font-condensed uppercase tracking-widest text-sm">
              {fmtWeek(weekStart)}
            </p>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="text-white/30 hover:text-[#f08122] text-[10px] font-condensed uppercase tracking-widest transition-colors"
              >
                This week
              </button>
            )}
          </div>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            disabled={weekOffset >= 0}
            className="text-white/40 hover:text-white disabled:opacity-20 px-3 py-1 border border-white/10 hover:border-white/25 rounded text-sm transition-colors"
          >
            Next ›
          </button>
        </div>

        {loading && (
          <div className="text-white/30 text-sm font-condensed uppercase tracking-widest py-12 text-center">
            Loading…
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-700/30 text-red-400 text-sm px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {!loading && data && (
          <>
            <div className="bg-[#1a1a1a] border border-white/10 rounded-lg overflow-hidden mb-4">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_120px] gap-3 px-4 py-2 border-b border-white/5">
                <span className="text-white/30 text-[10px] font-condensed uppercase tracking-widest">Job</span>
                <span className="text-white/30 text-[10px] font-condensed uppercase tracking-widest text-right">Hours</span>
              </div>

              {/* Touched jobs */}
              {data.touched.length === 0 && extraJobs.length === 0 && (
                <div className="px-4 py-8 text-center text-white/25 text-sm font-condensed">
                  No jobs logged for this week yet.
                  <br />
                  <span className="text-[10px] text-white/15">Hours will appear here as you work jobs in the system.</span>
                </div>
              )}

              {data.touched.map((job) => (
                <div key={job.job_id} className="border-b border-white/5 last:border-0">
                  <div className="grid grid-cols-[1fr_120px] gap-3 px-4 py-3 items-center">
                    <div>
                      <p className="text-white text-sm font-medium">{job.client_name}</p>
                      <p className="text-white/30 text-[10px] font-condensed">
                        {job.job_number ?? job.job_id} · {job.site_address}
                      </p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={hours[job.job_id] ?? ""}
                      onChange={(e) => setHours((h) => ({ ...h, [job.job_id]: e.target.value }))}
                      placeholder="0"
                      className="bg-[#111] border border-white/15 rounded px-3 py-1.5 text-sm text-white text-right w-full focus:outline-none focus:border-[#f08122]"
                    />
                  </div>
                  {/* Optional notes row */}
                  <div className="px-4 pb-3">
                    <input
                      type="text"
                      value={notes[job.job_id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [job.job_id]: e.target.value }))}
                      placeholder="Notes (optional)"
                      className="bg-[#0d0d0d] border border-white/8 rounded px-3 py-1 text-xs text-white/50 placeholder:text-white/20 w-full focus:outline-none focus:border-white/20"
                    />
                  </div>
                </div>
              ))}

              {/* Extra saved-entry rows (jobs from prior saves not in touched) */}
              {extraJobs.map((j) => (
                <div key={j.job_id} className="border-b border-white/5 last:border-0">
                  <div className="grid grid-cols-[1fr_120px] gap-3 px-4 py-3 items-center">
                    <div>
                      <p className="text-white/50 text-sm">{j.job_id}</p>
                      <p className="text-white/20 text-[10px] font-condensed">Previously saved</p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={hours[j.job_id] ?? ""}
                      onChange={(e) => setHours((h) => ({ ...h, [j.job_id]: e.target.value }))}
                      placeholder="0"
                      className="bg-[#111] border border-white/15 rounded px-3 py-1.5 text-sm text-white text-right w-full focus:outline-none focus:border-[#f08122]"
                    />
                  </div>
                </div>
              ))}

              {/* Other bucket */}
              <div className="border-t border-white/10">
                <div className="grid grid-cols-[1fr_120px] gap-3 px-4 py-3 items-center">
                  <div>
                    <p className="text-white/60 text-sm">Other</p>
                    <p className="text-white/25 text-[10px] font-condensed">Admin, meetings, non-job time</p>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={hours["other"] ?? ""}
                    onChange={(e) => setHours((h) => ({ ...h, other: e.target.value }))}
                    placeholder="0"
                    className="bg-[#111] border border-white/15 rounded px-3 py-1.5 text-sm text-white text-right w-full focus:outline-none focus:border-[#f08122]"
                  />
                </div>
                <div className="px-4 pb-3">
                  <input
                    type="text"
                    value={notes["other"] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, other: e.target.value }))}
                    placeholder="Notes (optional)"
                    className="bg-[#0d0d0d] border border-white/8 rounded px-3 py-1 text-xs text-white/50 placeholder:text-white/20 w-full focus:outline-none focus:border-white/20"
                  />
                </div>
              </div>

              {/* Total row */}
              <div className="grid grid-cols-[1fr_120px] gap-3 px-4 py-3 bg-white/5 border-t border-white/10">
                <p className="text-white/60 font-condensed uppercase tracking-widest text-xs">Total</p>
                <p className="text-[#f08122] font-condensed text-sm text-right font-medium">
                  {totalHours().toFixed(2)}h
                </p>
              </div>
            </div>

            {/* Save bar */}
            <div className="flex items-center justify-between">
              {saved ? (
                <p className="text-green-400 text-xs font-condensed uppercase tracking-widest">✓ Saved</p>
              ) : (
                <p className="text-white/20 text-xs font-condensed">Unsaved changes</p>
              )}
              <button
                onClick={save}
                disabled={saving}
                className="bg-[#f08122] hover:bg-[#d9711e] disabled:opacity-40 text-white font-condensed uppercase tracking-widest text-xs px-6 py-2.5 rounded transition-colors"
              >
                {saving ? "Saving…" : "Save Hours"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
