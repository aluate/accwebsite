"use client";

import { useState, useEffect } from "react";
import type { Crew, JobEventWithJoins, EventPhaseLabel } from "@/lib/schedule-types";
import { EVENT_TYPE_LABELS } from "@/lib/schedule-types";
import { calculateEndDate, calculateDuration, DEFAULT_DURATION } from "@/lib/schedule-utils";

type Props = {
  jobId: string;
  isAdmin: boolean;
  installEvents: JobEventWithJoins[];
  crews: Crew[];
  phaseLabels: EventPhaseLabel[];
};

type PhaseRow = {
  key: string;
  label: string;
  customLabel: string;
  dateStart: string;
  duration: string;
  dateEnd: string;       // derived, read-only
  crewId: string;
  blockedOn: string;
};

const LABEL  = "block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1";
const INPUT  = "bg-[#1a1a1a] border border-white/15 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#f08122] transition-colors";
const SELECT = INPUT;

function makePhase(n: number): PhaseRow {
  const today = new Date().toISOString().slice(0, 10);
  return {
    key: `ph-${n}-${Math.random().toString(36).slice(2, 6)}`,
    label: "",
    customLabel: "",
    dateStart: today,
    duration: String(DEFAULT_DURATION["install"] ?? 3),
    dateEnd: calculateEndDate(today, DEFAULT_DURATION["install"] ?? 3),
    crewId: "",
    blockedOn: "",
  };
}

export function PhaseIntakeClient({ jobId, isAdmin, installEvents: initialEvents, crews, phaseLabels }: Props) {
  const [events, setEvents] = useState<JobEventWithJoins[]>(initialEvents);
  const [phases, setPhases] = useState<PhaseRow[]>([makePhase(1)]);
  const [saving,  setSaving]  = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveErr, setSaveErr] = useState("");

  // ── Phase row helpers ──────────────────────────────────────────────────
  function updatePhase(key: string, patch: Partial<PhaseRow>) {
    setPhases((prev) => prev.map((p) => {
      if (p.key !== key) return p;
      const next = { ...p, ...patch };
      // Auto-recompute dateEnd when start or duration changes
      if (patch.dateStart !== undefined || patch.duration !== undefined) {
        const dur = parseInt(next.duration, 10) || 1;
        next.dateEnd = calculateEndDate(next.dateStart, dur);
      }
      // Auto-recompute duration when dateEnd changes directly
      if (patch.dateEnd !== undefined && next.dateStart) {
        next.duration = String(calculateDuration(next.dateStart, next.dateEnd));
      }
      return next;
    }));
  }

  function addPhase() {
    if (phases.length >= 5) return;
    setPhases((prev) => [...prev, makePhase(prev.length + 1)]);
  }

  function removePhase(key: string) {
    setPhases((prev) => prev.filter((p) => p.key !== key));
  }

  // ── Save ──────────────────────────────────────────────────────────────
  async function savePhases() {
    setSaving(true); setSaveMsg(""); setSaveErr("");
    const valid = phases.filter((p) => p.label && p.dateStart);
    if (!valid.length) { setSaveErr("No complete phases to save."); setSaving(false); return; }

    try {
      let prevEventId: string | null = null;
      const created: JobEventWithJoins[] = [];

      for (const ph of valid) {
        const description = ph.label === "Other" && ph.customLabel
          ? ph.customLabel
          : ph.label;
        const res = await fetch("/api/schedule/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            job_id:           jobId,
            event_type:       "install",
            description,
            date_start:       ph.dateStart,
            date_end:         ph.dateEnd || null,
            crew_id:          ph.crewId || null,
            blocked_on:       ph.blockedOn || null,
            parent_event_id:  prevEventId,
          }),
        });
        const body = await res.json();
        if (!res.ok || !body.ok) { setSaveErr(body.error ?? "Save failed"); setSaving(false); return; }
        prevEventId = body.event.id;
        created.push(body.event);
      }

      setEvents((prev) => [...prev, ...created]);
      setPhases([makePhase(1)]);
      setSaveMsg(`${created.length} phase${created.length > 1 ? "s" : ""} saved.`);
    } catch (e) {
      setSaveErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  // ── Delete existing event ─────────────────────────────────────────────
  async function deleteEvent(id: string) {
    const res = await fetch(`/api/schedule/events/${id}`, { method: "DELETE" });
    if (res.ok) setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className="space-y-8">

      {/* Existing install phases */}
      {events.length > 0 && (
        <div>
          <p className="text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-3">
            Existing Install Phases ({events.length})
          </p>
          <div className="space-y-2">
            {events.map((ev, i) => {
              const crew = crews.find((c) => c.id === ev.crew_id);
              return (
                <div key={ev.id} className="bg-[#1a1a1a] border border-white/10 rounded px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-condensed uppercase tracking-widest text-[#f08122]">
                      Phase {i + 1}{ev.description ? ` — ${ev.description}` : ""}
                    </p>
                    <p className="text-white/60 text-sm">
                      {ev.date_start ?? "On Deck"}
                      {ev.date_end && ev.date_end !== ev.date_start ? ` → ${ev.date_end}` : ""}
                      {" "}
                      {ev.date_start && ev.date_end && (
                        <span className="text-white/30 text-xs">
                          ({calculateDuration(ev.date_start, ev.date_end)} days)
                        </span>
                      )}
                    </p>
                    {crew && <p className="text-white/30 text-xs">{crew.name}</p>}
                    {ev.blocked_on && <p className="text-white/25 text-xs italic">⏸ {ev.blocked_on}</p>}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => deleteEvent(ev.id)}
                      className="text-white/20 hover:text-red-400 text-xs font-condensed uppercase tracking-widest transition-colors shrink-0"
                    >
                      Delete
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add phases form (admin only) */}
      {isAdmin && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-white/40 text-[10px] font-condensed uppercase tracking-widest">
              Add Install Phases
            </p>
            <button
              onClick={addPhase}
              disabled={phases.length >= 5}
              className="text-xs font-condensed uppercase tracking-widest text-[#f08122] disabled:text-white/20 disabled:cursor-not-allowed hover:text-[#d9711e] transition-colors"
            >
              + Add Phase {phases.length < 5 ? `(${5 - phases.length} left)` : "(max 5)"}
            </button>
          </div>

          <div className="space-y-3">
            {phases.map((ph, i) => (
              <div key={ph.key} className="bg-[#1a1a1a] border border-white/10 rounded p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-condensed uppercase tracking-widest text-white/40">
                    Phase {i + 1}
                  </span>
                  {i > 0 && (
                    <button
                      onClick={() => removePhase(ph.key)}
                      className="text-white/20 hover:text-red-400 text-xs font-condensed uppercase tracking-widest"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Label */}
                  <div className="sm:col-span-2 lg:col-span-1">
                    <label className={LABEL}>Label *</label>
                    <select
                      value={ph.label}
                      onChange={(e) => updatePhase(ph.key, { label: e.target.value, customLabel: "" })}
                      className={`${SELECT} w-full`}
                    >
                      <option value="">— Select —</option>
                      {phaseLabels.map((l) => (
                        <option key={l.id} value={l.label}>{l.label}</option>
                      ))}
                    </select>
                    {ph.label === "Other" && (
                      <input
                        value={ph.customLabel}
                        onChange={(e) => updatePhase(ph.key, { customLabel: e.target.value })}
                        placeholder="Describe…"
                        className={`${INPUT} w-full mt-1.5`}
                      />
                    )}
                  </div>

                  {/* Start date */}
                  <div>
                    <label className={LABEL}>Start *</label>
                    <input
                      type="date"
                      value={ph.dateStart}
                      onChange={(e) => updatePhase(ph.key, { dateStart: e.target.value })}
                      className={`${INPUT} w-full`}
                    />
                  </div>

                  {/* Duration */}
                  <div>
                    <label className={LABEL}>Duration (days)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={ph.duration}
                        onChange={(e) => updatePhase(ph.key, { duration: e.target.value })}
                        className={`${INPUT} w-16 text-center`}
                      />
                      <span className="text-white/25 text-xs">→ {ph.dateEnd}</span>
                    </div>
                  </div>

                  {/* Crew */}
                  <div>
                    <label className={LABEL}>Crew</label>
                    <select
                      value={ph.crewId}
                      onChange={(e) => updatePhase(ph.key, { crewId: e.target.value })}
                      className={`${SELECT} w-full`}
                    >
                      <option value="">— Unassigned —</option>
                      {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                {/* Blocked on (Phase 2+) */}
                {i > 0 && (
                  <div className="mt-3">
                    <label className={LABEL}>Blocked On <span className="text-white/25 normal-case">(gap reason)</span></label>
                    <input
                      value={ph.blockedOn}
                      onChange={(e) => updatePhase(ph.key, { blockedOn: e.target.value })}
                      placeholder='e.g. "waiting on countertops", "customer sign-off pending"'
                      className={`${INPUT} w-full`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {saveMsg && <p className="text-green-400 text-xs font-condensed mt-2">{saveMsg}</p>}
          {saveErr && <p className="text-red-400 text-xs font-condensed mt-2">{saveErr}</p>}

          <button
            onClick={savePhases}
            disabled={saving}
            className="mt-4 bg-[#f08122] hover:bg-[#d9711e] disabled:opacity-50 text-white font-condensed uppercase tracking-widest text-sm px-6 py-2.5 rounded transition-colors"
          >
            {saving ? "Saving…" : `Save ${phases.filter((p) => p.label && p.dateStart).length} Phase${phases.filter((p) => p.label && p.dateStart).length !== 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
