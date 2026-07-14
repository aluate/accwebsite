"use client";

import { useState, useEffect } from "react";
import {
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  EVENT_STATUSES,
  type Crew,
  type EventType,
  type EventStatus,
  type JobEventWithJoins,
} from "@/lib/schedule-types";
import { calculateEndDate, calculateDuration, DEFAULT_DURATION } from "@/lib/schedule-utils";

type JobMini = { id: string; client_name: string; site_address: string; install_labor_hrs_snapshot?: number | null };

export type AddEventFormProps = {
  crews: Crew[];
  jobs: JobMini[];
  onClose: () => void;
  onCreated: (event: JobEventWithJoins) => void;
  defaultJobId?: string;
  // Edit mode
  mode?: "add" | "edit";
  initialEvent?: JobEventWithJoins;
  onUpdated?: (event: JobEventWithJoins) => void;
  onDeleted?: (id: string) => void;
};

const LABEL  = "block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5";
const INPUT  = "w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] transition-colors";
const SELECT = INPUT;

export function AddEventForm({
  crews, jobs, onClose, onCreated,
  defaultJobId,
  mode = "add",
  initialEvent,
  onUpdated,
  onDeleted,
}: AddEventFormProps) {
  const today = new Date().toISOString().slice(0, 10);

  const initType = (initialEvent?.event_type && (EVENT_TYPES as readonly string[]).includes(initialEvent.event_type))
    ? initialEvent.event_type as EventType
    : initialEvent ? "other" as EventType : "install" as EventType;

  const [jobId,       setJobId]       = useState(initialEvent?.job_id ?? defaultJobId ?? "");
  const [eventType,   setEventType]   = useState<EventType>(initType);
  const [customLabel, setCustomLabel] = useState(
    mode === "edit" && initType === "other" ? (initialEvent?.description ?? "") : ""
  );
  const [description, setDescription] = useState(
    mode === "edit" && initType !== "other" ? (initialEvent?.description ?? "") : ""
  );
  const [dateStart,   setDateStart]   = useState<string>(initialEvent?.date_start ?? today);
  const [dateEnd,     setDateEnd]     = useState<string>(initialEvent?.date_end ?? "");
  const [duration,    setDuration]    = useState<string>(
    initialEvent?.date_start && initialEvent?.date_end
      ? String(calculateDuration(initialEvent.date_start, initialEvent.date_end))
      : String(DEFAULT_DURATION["install"] ?? 1)
  );
  // Multi-crew state
  const [crewIds,     setCrewIds]     = useState<string[]>(
    initialEvent?.crew_ids?.length ? initialEvent.crew_ids : (initialEvent?.crew_id ? [initialEvent.crew_id] : [])
  );
  const [status,      setStatus]      = useState<EventStatus>((initialEvent?.status ?? "scheduled") as EventStatus);
  const [blockedOn,   setBlockedOn]   = useState(initialEvent?.blocked_on ?? "");
  const [note,        setNote]        = useState(initialEvent?.note ?? "");
  const [onDeck,      setOnDeck]      = useState(!initialEvent?.date_start);

  const [submitState,  setSubmitState]  = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [deleteState,  setDeleteState]  = useState<"idle" | "confirm" | "deleting">("idle");
  const [errorMsg,     setErrorMsg]     = useState("");
  const [conflicts,    setConflicts]    = useState<JobEventWithJoins[]>([]);

  // When event type changes in add mode, suggest a duration.
  // For installs: if the selected job has an estimate snapshot, derive duration
  // from install_labor_hrs ÷ (crew count × 6.8 effective hrs/day).
  // 6.8 = 8 hrs × 0.85 efficiency (travel + setup buffer).
  useEffect(() => {
    if (mode !== "add") return;
    let dur = DEFAULT_DURATION[eventType] ?? 1;
    if (eventType === "install" && jobId) {
      const job = jobs.find(j => j.id === jobId);
      const installHrs = job?.install_labor_hrs_snapshot;
      if (installHrs && installHrs > 0) {
        const crewCount = Math.max(crewIds.length, 1);
        const suggested = Math.ceil(installHrs / (crewCount * 6.8));
        dur = Math.max(1, suggested);
      }
    }
    setDuration(String(dur));
    if (dateStart) {
      setDateEnd(dur > 1 ? calculateEndDate(dateStart, dur) : "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, jobId]);

  function handleStartChange(val: string) {
    setDateStart(val);
    if (val) {
      const dur = parseInt(duration, 10) || 1;
      setDateEnd(dur > 1 ? calculateEndDate(val, dur) : "");
    }
  }

  function handleEndChange(val: string) {
    setDateEnd(val);
    if (val && dateStart && val >= dateStart) {
      setDuration(String(calculateDuration(dateStart, val)));
    }
  }

  function handleDurationChange(val: string) {
    setDuration(val);
    const dur = parseInt(val, 10);
    if (!isNaN(dur) && dur >= 1 && dateStart) {
      setDateEnd(dur > 1 ? calculateEndDate(dateStart, dur) : "");
    }
  }

  function toggleCrew(id: string) {
    setCrewIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  async function submit() {
    setErrorMsg("");
    setConflicts([]);

    if (!jobId)     { setErrorMsg("Pick a job."); return; }
    if (!eventType) { setErrorMsg("Pick an event type."); return; }
    if (eventType === "other" && !customLabel.trim()) {
      setErrorMsg("Enter a custom label for this event.");
      return;
    }
    if (!onDeck && !dateStart) { setErrorMsg("Pick a start date, or check On Deck."); return; }
    if (dateStart && dateEnd && dateEnd < dateStart) {
      setErrorMsg("End date is before start date.");
      return;
    }

    setSubmitState("submitting");

    const payload = {
      job_id:        jobId,
      event_type:    eventType,
      description:   eventType === "other" ? customLabel.trim() : (description || null),
      date_start:    onDeck ? null : dateStart,
      date_end:      onDeck ? null : (dateEnd || null),
      crew_ids:      crewIds,
      status,
      note:          note || null,
      blocked_on:    blockedOn || null,
      duration_days: parseInt(duration, 10) || 1,
    };

    try {
      const url    = mode === "edit" ? `/api/schedule/events/${initialEvent!.id}` : "/api/schedule/events";
      const method = mode === "edit" ? "PATCH" : "POST";
      const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setErrorMsg(body.error ?? `Save failed (${res.status})`);
        setSubmitState("error");
        return;
      }
      setConflicts(body.conflicts ?? []);
      setSubmitState("ok");
      if ((body.conflicts ?? []).length === 0) {
        if (mode === "edit") {
          onUpdated?.(body.event);
        } else {
          onCreated(body.event);
        }
        onClose();
      }
    } catch (e) {
      setErrorMsg(String((e as Error).message ?? e));
      setSubmitState("error");
    }
  }

  async function handleDelete() {
    if (deleteState === "idle") { setDeleteState("confirm"); return; }
    if (deleteState !== "confirm") return;
    setDeleteState("deleting");
    try {
      const res = await fetch(`/api/schedule/events/${initialEvent!.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.error ?? `Delete failed (${res.status})`);
        setDeleteState("idle");
        return;
      }
      onDeleted?.(initialEvent!.id);
      onClose();
    } catch (e) {
      setErrorMsg(String((e as Error).message ?? e));
      setDeleteState("idle");
    }
  }

  function acceptWithWarnings() {
    onCreated({} as JobEventWithJoins);
    onClose();
  }

  const isEdit = mode === "edit";
  const activeCrews = crews.filter((c) => c.active);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-heading text-xl uppercase tracking-wide text-white">
            {isEdit ? "Edit Event" : "Add Event"}
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          {/* Job + Type */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Job *</label>
              {isEdit ? (
                <p className="px-3 py-2 text-sm text-white/70 bg-[#111] border border-white/10 rounded">
                  {initialEvent?.job_id} — {jobs.find(j => j.id === initialEvent?.job_id)?.client_name ?? initialEvent?.job_client_name ?? ""}
                </p>
              ) : (
                <select value={jobId} onChange={(e) => setJobId(e.target.value)} className={SELECT}>
                  <option value="">— Select Job —</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>{j.id} — {j.client_name}{j.site_address ? ` (${j.site_address})` : ""}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className={LABEL}>Event Type *</label>
              <select value={eventType} onChange={(e) => setEventType(e.target.value as EventType)} className={SELECT}>
                {EVENT_TYPES.map((t) => <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
          </div>

          {/* Custom label (Other type only) */}
          {eventType === "other" && (
            <div>
              <label className={LABEL}>Custom Label *</label>
              <input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder='e.g. "Measure", "Site visit", "Punch CO #3"'
                className={INPUT}
                autoFocus
              />
            </div>
          )}

          {/* Description (non-Other types) */}
          {eventType !== "other" && (
            <div>
              <label className={LABEL}>Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder='e.g. "ladder bases", "pulls after tops", "CO #3 fronts"'
                className={INPUT}
              />
            </div>
          )}

          {/* On Deck toggle */}
          <div className="bg-[#0a0a0a] border border-white/10 rounded p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={onDeck}
                onChange={(e) => setOnDeck(e.target.checked)}
                className="accent-[#f08122]"
              />
              <span className="text-white/80 text-xs font-condensed uppercase tracking-widest">
                On Deck — not yet scheduled
              </span>
            </label>
            <p className="text-white/25 text-[10px] mt-1 font-condensed uppercase tracking-widest">
              Use for work waiting on parts, sign-off, or tops template.
            </p>
            {onDeck && (
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-3 bg-[#111] border border-white/10 rounded px-3 py-2">
                  <label className="text-[#f08122]/80 text-[10px] font-condensed uppercase tracking-widest whitespace-nowrap">
                    Duration when scheduled (working days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={duration}
                    onChange={(e) => handleDurationChange(e.target.value)}
                    className="w-16 bg-[#1a1a1a] border border-[#f08122]/30 rounded px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-[#f08122]"
                  />
                  <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest">
                    Auto-applied when you drag to a date
                  </p>
                </div>
                <div>
                  <label className={LABEL}>Blocked On</label>
                  <input
                    value={blockedOn}
                    onChange={(e) => setBlockedOn(e.target.value)}
                    placeholder='e.g. "waiting on tops template", "parts on order"'
                    className={INPUT}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Dates + Duration (hidden when on-deck) */}
          {!onDeck && (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Start Date *</label>
                  <input
                    type="date"
                    value={dateStart}
                    onChange={(e) => handleStartChange(e.target.value)}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className={LABEL}>
                    End Date
                    <span className="text-white/25 ml-1 normal-case">(or set duration →)</span>
                  </label>
                  <input
                    type="date"
                    value={dateEnd}
                    onChange={(e) => handleEndChange(e.target.value)}
                    className={INPUT}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 bg-[#0a0a0a] border border-white/10 rounded px-3 py-2">
                <label className="text-white/40 text-[10px] font-condensed uppercase tracking-widest whitespace-nowrap">
                  Duration (working days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={duration}
                  onChange={(e) => handleDurationChange(e.target.value)}
                  className="w-16 bg-[#1a1a1a] border border-white/15 rounded px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-[#f08122]"
                />
                <p className="text-white/25 text-[10px] font-condensed uppercase tracking-widest">
                  Skips weekends &amp; holidays
                </p>
                {eventType === "install" && jobId && (() => {
                  const job = jobs.find(j => j.id === jobId);
                  const hrs = job?.install_labor_hrs_snapshot;
                  if (!hrs) return null;
                  const crewCount = Math.max(crewIds.length, 1);
                  return (
                    <p className="text-blue-300/60 text-[10px] font-condensed uppercase tracking-widest">
                      ≈ {hrs.toFixed(0)} est. install hrs ÷ {crewCount} crew
                    </p>
                  );
                })()}
                {dateEnd && (
                  <p className="text-[#f08122]/70 text-[10px] font-condensed uppercase tracking-widest ml-auto">
                    → ends {dateEnd}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Crew multi-select + Status */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>
                Crew
                {crewIds.length > 0 && (
                  <span className="ml-2 text-[#f08122] normal-case">{crewIds.length} selected</span>
                )}
              </label>
              {activeCrews.length === 0 ? (
                <p className="text-white/30 text-xs italic px-2 py-2">No active crews</p>
              ) : (
                <div className="bg-[#1a1a1a] border border-white/15 rounded max-h-36 overflow-y-auto divide-y divide-white/5">
                  {activeCrews.map((c) => {
                    const checked = crewIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors hover:bg-white/5 ${checked ? "bg-[#f08122]/10" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCrew(c.id)}
                          className="accent-[#f08122] shrink-0"
                        />
                        <span className="text-sm text-white flex-1 truncate">{c.name}</span>
                        <span className="text-[10px] font-condensed uppercase text-white/40 shrink-0">
                          {c.kind === "inhouse" ? "IH" : "Sub"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <label className={LABEL}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as EventStatus)} className={SELECT}>
                {EVENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className={LABEL}>Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className={INPUT} />
          </div>

          {/* Errors */}
          {errorMsg && (
            <div className="bg-red-900/30 border border-red-700/40 rounded p-3 text-red-300 text-xs font-condensed">
              {errorMsg}
            </div>
          )}

          {/* Conflicts */}
          {conflicts.length > 0 && (
            <div className="bg-yellow-900/30 border border-yellow-700/40 rounded p-3">
              <p className="text-yellow-200 text-xs font-condensed uppercase tracking-widest mb-2">
                ⚠ {conflicts.length} conflict{conflicts.length > 1 ? "s" : ""} — saved anyway
              </p>
              <ul className="space-y-1 text-yellow-200/80 text-xs">
                {conflicts.map((c) => (
                  <li key={c.id}>
                    {c.crew_names?.join(" + ") || c.crew_name || "Crew"} on <strong>{c.job_client_name ?? c.job_id}</strong>{" "}
                    ({c.description ?? c.event_type}) {c.date_start}{c.date_end ? `–${c.date_end}` : ""}
                  </li>
                ))}
              </ul>
              <button
                onClick={acceptWithWarnings}
                className="mt-3 bg-yellow-600 hover:bg-yellow-500 text-black font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded"
              >
                OK, I see it — close
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/5">
            {isEdit && (
              <button
                onClick={handleDelete}
                disabled={deleteState === "deleting"}
                className={`font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded transition-colors ${
                  deleteState === "confirm"
                    ? "bg-red-700 hover:bg-red-600 text-white"
                    : "text-red-400/70 hover:text-red-400 border border-red-900/40 hover:border-red-700"
                }`}
              >
                {deleteState === "deleting" ? "Deleting…" : deleteState === "confirm" ? "⚠ Confirm Delete" : "Delete Event"}
              </button>
            )}
            {!isEdit && <div />}
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="text-white/40 hover:text-white font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitState === "submitting"}
                className="bg-[#f08122] hover:bg-[#d9711e] disabled:opacity-50 text-white font-condensed uppercase tracking-widest text-sm px-6 py-2.5 rounded transition-colors"
              >
                {submitState === "submitting" ? "Saving…" : isEdit ? "Update Event" : "Save Event"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
