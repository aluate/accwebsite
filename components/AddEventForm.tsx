"use client";

import { useState } from "react";
import {
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  EVENT_STATUSES,
  type Crew,
  type EventType,
  type EventStatus,
  type JobEventWithJoins,
} from "@/lib/schedule-types";

type JobMini = { id: string; client_name: string; site_address: string };

export type AddEventFormProps = {
  crews: Crew[];
  jobs: JobMini[];
  onClose: () => void;
  onCreated: (event: JobEventWithJoins) => void;
  /** Optional preselected job (used when launched from a job detail page). */
  defaultJobId?: string;
};

const LABEL  = "block text-xs font-condensed uppercase tracking-widest text-white/50 mb-1.5";
const INPUT  = "w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] transition-colors";
const SELECT = INPUT;

/**
 * Modal form for creating a new schedule event. Kept simple to match the
 * "10-year-old can use it" Tahiti-Test bar:
 *  - All fields visible at once (no progressive disclosure)
 *  - Required fields marked with *
 *  - Date inputs default to today; date_end stays empty unless multi-day
 *  - On Deck = leave date_start blank
 *
 * After POST: surfaces conflict warnings (Crew X already booked) and the
 * auto-link parent if one was inferred. User can either accept and close,
 * or correct and re-submit.
 */
export function AddEventForm({ crews, jobs, onClose, onCreated, defaultJobId }: AddEventFormProps) {
  const today = new Date().toISOString().slice(0, 10);

  const [jobId, setJobId]             = useState(defaultJobId ?? "");
  const [eventType, setEventType]     = useState<EventType>("install");
  const [description, setDescription] = useState("");
  const [dateStart, setDateStart]     = useState<string>(today);
  const [dateEnd, setDateEnd]         = useState<string>("");
  const [crewId, setCrewId]           = useState<string>("");
  const [status, setStatus]           = useState<EventStatus>("scheduled");
  const [blockedOn, setBlockedOn]     = useState("");
  const [note, setNote]               = useState("");
  const [onDeck, setOnDeck]           = useState(false);

  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg]       = useState("");
  const [conflicts, setConflicts]     = useState<JobEventWithJoins[]>([]);
  const [autoLinked, setAutoLinked]   = useState<string | undefined>();

  async function submit() {
    setErrorMsg("");
    setConflicts([]);
    setAutoLinked(undefined);

    if (!jobId)      { setErrorMsg("Pick a job."); return; }
    if (!eventType)  { setErrorMsg("Pick an event type."); return; }
    if (!onDeck && !dateStart) { setErrorMsg("Pick a start date, or check On Deck."); return; }
    if (dateStart && dateEnd && dateEnd < dateStart) {
      setErrorMsg("End date is before start date.");
      return;
    }

    setSubmitState("submitting");
    try {
      const res = await fetch("/api/schedule/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id:      jobId,
          event_type:  eventType,
          description: description || null,
          date_start:  onDeck ? null : dateStart,
          date_end:    onDeck ? null : (dateEnd || null),
          crew_id:     crewId || null,
          status,
          note:        note || null,
          blocked_on:  blockedOn || null,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setErrorMsg(body.error ?? `Save failed (${res.status})`);
        setSubmitState("error");
        return;
      }
      setConflicts(body.conflicts ?? []);
      setAutoLinked(body.auto_linked_parent);
      setSubmitState("ok");
      // If no warnings to acknowledge, close immediately. If there are
      // warnings, hold the modal open so the user can read them.
      if ((body.conflicts ?? []).length === 0) {
        onCreated(body.event);
        onClose();
      } else {
        // Caller can refetch on close.
        setTimeout(() => { /* held open intentionally */ }, 0);
      }
    } catch (e) {
      setErrorMsg(String((e as Error).message ?? e));
      setSubmitState("error");
    }
  }

  function acceptWithWarnings() {
    onCreated({} as JobEventWithJoins);   // signal a refetch; details come from server
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-heading text-xl uppercase tracking-wide text-white">Add Event</h2>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          {/* Job + Type row */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Job *</label>
              <select value={jobId} onChange={(e) => setJobId(e.target.value)} className={SELECT}>
                <option value="">— Select Job —</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.id} — {j.client_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Event Type *</label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value as EventType)}
                className={SELECT}
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={LABEL}>Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='e.g. "main install", "ladder bases", "pulls after tops", "CO #3 fronts"'
              className={INPUT}
            />
            <p className="text-white/20 text-[10px] mt-1 font-condensed uppercase tracking-widest">
              Free-text. Used to label split events on the wall.
            </p>
          </div>

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
                On Deck — not yet datable
              </span>
            </label>
            <p className="text-white/30 text-[10px] mt-1.5 font-condensed uppercase tracking-widest">
              Use for punch / CO / service work waiting on parts, customer sign-off, or tops template.
            </p>
            {onDeck && (
              <div className="mt-3">
                <label className={LABEL}>Blocked On</label>
                <input
                  value={blockedOn}
                  onChange={(e) => setBlockedOn(e.target.value)}
                  placeholder='e.g. "waiting on tops template", "parts on order"'
                  className={INPUT}
                />
              </div>
            )}
          </div>

          {/* Dates (hidden when on-deck) */}
          {!onDeck && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Start Date *</label>
                <input
                  type="date"
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                  className={INPUT}
                />
              </div>
              <div>
                <label className={LABEL}>End Date <span className="text-white/30">(optional, multi-day)</span></label>
                <input
                  type="date"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  className={INPUT}
                />
              </div>
            </div>
          )}

          {/* Crew + Status row */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Crew</label>
              <select value={crewId} onChange={(e) => setCrewId(e.target.value)} className={SELECT}>
                <option value="">— Unassigned —</option>
                {crews.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.kind})</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as EventStatus)}
                className={SELECT}
              >
                {EVENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className={LABEL}>Note</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
              className={INPUT}
            />
          </div>

          {/* Errors */}
          {errorMsg && (
            <div className="bg-red-900/30 border border-red-700/40 rounded p-3 text-red-300 text-xs font-condensed">
              {errorMsg}
            </div>
          )}

          {/* Conflicts (warn-but-allow) */}
          {conflicts.length > 0 && (
            <div className="bg-yellow-900/30 border border-yellow-700/40 rounded p-3">
              <p className="text-yellow-200 text-xs font-condensed uppercase tracking-widest mb-2">
                ⚠ {conflicts.length} crew conflict{conflicts.length > 1 ? "s" : ""} — saved anyway
              </p>
              <ul className="space-y-1 text-yellow-200/80 text-xs">
                {conflicts.map((c) => (
                  <li key={c.id}>
                    {c.crew_name} already on <strong>{c.job_client_name ?? c.job_id}</strong>
                    {" "}({c.description ?? c.event_type}) {c.date_start}{c.date_end ? `–${c.date_end}` : ""}
                  </li>
                ))}
              </ul>
              <button
                onClick={acceptWithWarnings}
                className="mt-3 bg-yellow-600 hover:bg-yellow-500 text-black font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded transition-colors"
              >
                OK, I see it — close
              </button>
            </div>
          )}
          {autoLinked && conflicts.length > 0 && (
            <p className="text-white/40 text-[10px] font-condensed uppercase tracking-widest">
              Auto-linked to existing {eventType} on this job (will display as part of the series).
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/5">
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white text-xs font-condensed uppercase tracking-widest px-4 py-2 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={submitState === "submitting"}
              className="bg-[#f08122] hover:bg-[#d9711e] disabled:opacity-50 text-white font-condensed uppercase tracking-widest text-xs px-6 py-2 rounded transition-colors"
            >
              {submitState === "submitting" ? "Saving…" : "Add Event"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
