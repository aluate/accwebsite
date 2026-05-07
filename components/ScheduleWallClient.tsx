"use client";

import { useMemo, useState } from "react";
import type {
  Crew,
  JobEventWithJoins,
  EventType,
} from "@/lib/schedule-types";
import { EVENT_TYPE_LABELS, isoDateOffset, isoWeekStart } from "@/lib/schedule-types";
import { AddEventForm } from "@/components/AddEventForm";

type JobMini = { id: string; client_name: string; site_address: string };

export type ScheduleWallProps = {
  today: string;                          // ISO date (server-rendered)
  crews: Crew[];
  forwardEvents: JobEventWithJoins[];
  onDeckEvents:  JobEventWithJoins[];
  jobs: JobMini[];
  windowStartIso: string;
  windowEndIso:   string;
};

// Crew color palette. Stable assignment by crew.id index in the active
// roster — same crew gets the same color across reloads as long as the
// roster ordering is stable. When Karl adds a sub, it gets the next slot.
const CREW_PALETTE = [
  { bg: "rgba(240,129,34,0.18)",  bar: "#f08122", text: "#f08122" }, // ACC orange
  { bg: "rgba(96,165,250,0.18)",  bar: "#60a5fa", text: "#93c5fd" }, // sky
  { bg: "rgba(167,139,250,0.18)", bar: "#a78bfa", text: "#c4b5fd" }, // violet
  { bg: "rgba(74,222,128,0.18)",  bar: "#4ade80", text: "#86efac" }, // green
  { bg: "rgba(251,113,133,0.18)", bar: "#fb7185", text: "#fda4af" }, // rose
  { bg: "rgba(250,204,21,0.18)",  bar: "#facc15", text: "#fde047" }, // amber
];
const UNASSIGNED_COLOR = { bg: "rgba(220,38,38,0.18)", bar: "#dc2626", text: "#fca5a5" };

function crewColor(crewId: string | null, crews: Crew[]) {
  if (!crewId) return UNASSIGNED_COLOR;
  const idx = crews.findIndex((c) => c.id === crewId);
  if (idx === -1) return UNASSIGNED_COLOR;
  return CREW_PALETTE[idx % CREW_PALETTE.length];
}

const EVENT_TYPE_ICON: Record<EventType, string> = {
  cab_delivery:      "📦",
  top_delivery:      "🪨",
  install:           "🔨",
  service:           "🛠️",
  punch:             "✓",
  final_walkthrough: "🏁",
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "SCHED",  cls: "bg-white/10 text-white/60" },
  confirmed: { label: "CONF",   cls: "bg-blue-500/20 text-blue-300" },
  complete:  { label: "DONE",   cls: "bg-green-500/20 text-green-300" },
  on_hold:   { label: "HOLD",   cls: "bg-yellow-500/20 text-yellow-300" },
};

// Weekday-aware date math used by drag-and-drop to preserve multi-day
// duration when dragging an install (etc.) to a new start day.
function isWeekdayIso(iso: string): boolean {
  const d = new Date(iso + "T00:00:00Z").getUTCDay();
  return d >= 1 && d <= 5;
}
function addWeekdaysIso(iso: string, weekdayCount: number): string {
  if (weekdayCount === 0) return iso;
  let cur = iso;
  let remaining = weekdayCount;
  while (remaining > 0) {
    cur = isoDateOffset(cur, 1);
    if (isWeekdayIso(cur)) remaining--;
  }
  return cur;
}
function countWeekdays(startIso: string, endIso: string): number {
  if (startIso > endIso) return 1;
  let cur = startIso;
  let n = 0;
  while (cur <= endIso) {
    if (isWeekdayIso(cur)) n++;
    cur = isoDateOffset(cur, 1);
  }
  return n;
}

export function ScheduleWallClient(props: ScheduleWallProps) {
  const { today, crews, jobs, windowStartIso, windowEndIso } = props;

  // Events live in state so drag-and-drop can do optimistic updates without
  // a full page reload between every move. The server is still source of
  // truth — we reconcile via the response from PATCH /api/schedule/events/[id].
  const [forwardEvents, setForwardEvents] = useState<JobEventWithJoins[]>(props.forwardEvents);
  const [onDeckEvents,  setOnDeckEvents]  = useState<JobEventWithJoins[]>(props.onDeckEvents);

  const [showAddForm, setShowAddForm] = useState(false);
  const [filterCrewId, setFilterCrewId] = useState<string | null>(null);

  // Drag state for visual feedback. dropTargetKey = "iso" or "ondeck".
  const [draggingId, setDraggingId]     = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

  // Conflict prompt: shown when PATCH returns conflicts[]. UI is "saved
  // anyway" warn-but-allow per Karl 2026-05-06 — the server has already
  // committed. The prompt is informational, not a confirm-to-save.
  const [conflictPrompt, setConflictPrompt] = useState<{
    eventId: string;
    conflicts: JobEventWithJoins[];
  } | null>(null);

  const [errorPrompt, setErrorPrompt] = useState<string | null>(null);

  // Build the visible week range as Mon-Fri ranks (Karl 2026-05-06: no
  // weekend field work on the schedule). Weekend events that exist in the
  // DB are still loaded for crew-conflict math, but they don't render.
  // The window is rounded out to whole weeks so we never have a half-empty
  // top row.
  const weeks = useMemo(() => {
    const startMonday = isoWeekStart(windowStartIso);
    const endMonday   = isoWeekStart(windowEndIso);
    const out: string[][] = [];
    let cur = startMonday;
    let safety = 12; // 12 weeks max to avoid runaway loops
    while (cur <= endMonday && safety-- > 0) {
      const week: string[] = [];
      for (let i = 0; i < 5; i++) week.push(isoDateOffset(cur, i));   // Mon..Fri only
      out.push(week);
      cur = isoDateOffset(cur, 7);
    }
    return out;
  }, [windowStartIso, windowEndIso]);

  // Index events by date_start for fast lookup. Multi-day events show on
  // their start day with a "→ {n}d" indicator; full bar-spanning is a
  // future enhancement.
  const eventsByDate = useMemo(() => {
    const m = new Map<string, JobEventWithJoins[]>();
    for (const e of forwardEvents) {
      if (!e.date_start) continue;
      if (filterCrewId && e.crew_id !== filterCrewId) continue;
      const k = e.date_start;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return m;
  }, [forwardEvents, filterCrewId]);

  // ── Drag-and-drop handler ────────────────────────────────────────────────
  // Optimistically moves the event in local state, then PATCHes the server.
  // On error we roll back to the prior state. On conflicts we surface the
  // warn-but-allow modal — the server has already saved, but the UI shows
  // "Crew X already booked" so Karl can immediately undo or re-route.
  async function handleDrop(eventId: string, targetIso: string | null) {
    setDraggingId(null);
    setDropTargetKey(null);

    // Snapshot for rollback.
    const prevForward = forwardEvents;
    const prevOnDeck  = onDeckEvents;

    // Find event regardless of which lane it's in.
    const all = [...forwardEvents, ...onDeckEvents];
    const event = all.find((e) => e.id === eventId);
    if (!event) return;

    // No-op: dropped on its own start date.
    if (targetIso && event.date_start === targetIso) return;
    if (!targetIso && !event.date_start) return;

    // Compute the new (date_start, date_end). Preserve duration in
    // weekday-units when moving multi-day events. New date_end is null
    // if dropping into on-deck.
    let newStart: string | null = targetIso;
    let newEnd:   string | null = null;
    if (targetIso && event.date_start && event.date_end) {
      // Existing scheduled event: preserve its weekday-duration exactly.
      const wkdaysBetween = countWeekdays(event.date_start, event.date_end);
      newEnd = addWeekdaysIso(targetIso, wkdaysBetween - 1);
    } else if (targetIso && !event.date_start) {
      // B2 fix: on-deck → calendar drop. Event has no prior dates so we
      // can't infer duration. Default by event_type rather than landing as
      // a single day regardless of type. Install = 3 weekdays; service /
      // punch / walkthrough / delivery = 1 day (newEnd stays null).
      const defaultWkdays: Partial<Record<EventType, number>> = {
        install: 3,
      };
      const extra = (defaultWkdays[event.event_type] ?? 1) - 1;
      if (extra > 0) newEnd = addWeekdaysIso(targetIso, extra);
    }

    // Optimistic update.
    const updated: JobEventWithJoins = { ...event, date_start: newStart, date_end: newEnd };
    if (targetIso) {
      // Goes to forward lane.
      setForwardEvents([...forwardEvents.filter((e) => e.id !== eventId), updated]);
      setOnDeckEvents(onDeckEvents.filter((e) => e.id !== eventId));
    } else {
      // Goes to on-deck lane.
      setOnDeckEvents([updated, ...onDeckEvents.filter((e) => e.id !== eventId)]);
      setForwardEvents(forwardEvents.filter((e) => e.id !== eventId));
    }

    // Server PATCH.
    try {
      const res = await fetch(`/api/schedule/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date_start: newStart, date_end: newEnd }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        // Roll back.
        setForwardEvents(prevForward);
        setOnDeckEvents(prevOnDeck);
        setErrorPrompt(body.error ?? `Save failed (${res.status})`);
        return;
      }
      // Reconcile with server response (may differ from optimistic shape).
      const serverEvent = body.event as JobEventWithJoins;
      if (serverEvent.date_start) {
        setForwardEvents((prev) => prev.map((e) => (e.id === eventId ? serverEvent : e)));
      } else {
        setOnDeckEvents((prev) => prev.map((e) => (e.id === eventId ? serverEvent : e)));
      }
      if (Array.isArray(body.conflicts) && body.conflicts.length > 0) {
        setConflictPrompt({ eventId, conflicts: body.conflicts });
      }
    } catch (e) {
      setForwardEvents(prevForward);
      setOnDeckEvents(prevOnDeck);
      setErrorPrompt(String((e as Error).message ?? e));
    }
  }

  // Compute "1 of N" labels per parent_event_id chain. Walks each event's
  // parent chain to the root, then groups all descendants of that root.
  const splitLabels = useMemo(() => {
    // group events by their "root" id (top of the parent chain)
    const byId = new Map(forwardEvents.concat(onDeckEvents).map((e) => [e.id, e]));
    function rootOf(eId: string): string {
      let cur = eId;
      const seen = new Set<string>();
      while (true) {
        const e = byId.get(cur);
        if (!e || !e.parent_event_id || seen.has(cur)) return cur;
        seen.add(cur);
        cur = e.parent_event_id;
      }
    }
    const groups = new Map<string, JobEventWithJoins[]>();
    for (const e of forwardEvents.concat(onDeckEvents)) {
      const r = rootOf(e.id);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r)!.push(e);
    }
    const labels = new Map<string, string>();
    for (const [, list] of groups) {
      if (list.length < 2) continue;
      list.sort((a, b) => (a.date_start ?? "9999").localeCompare(b.date_start ?? "9999"));
      list.forEach((e, i) => labels.set(e.id, `${i + 1} of ${list.length}`));
    }
    return labels;
  }, [forwardEvents, onDeckEvents]);

  return (
    <section className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header bar */}
      <header className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl uppercase tracking-wide">Schedule</h1>
          <p className="text-white/40 text-xs font-condensed uppercase tracking-widest">
            Today: {today} · {forwardEvents.length} events · {onDeckEvents.length} on deck
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Crew filter chips */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFilterCrewId(null)}
              className={`px-3 py-1 rounded text-xs font-condensed uppercase tracking-widest transition-colors ${
                filterCrewId === null
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              All
            </button>
            {crews.map((c) => {
              const col = crewColor(c.id, crews);
              const active = filterCrewId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setFilterCrewId(active ? null : c.id)}
                  className="px-3 py-1 rounded text-xs font-condensed uppercase tracking-widest transition-colors"
                  style={{
                    background: active ? col.bg : "transparent",
                    color: active ? col.text : "rgba(255,255,255,0.4)",
                    border: `1px solid ${active ? col.bar : "transparent"}`,
                  }}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded transition-colors"
          >
            + Add Event
          </button>
        </div>
      </header>

      {/* Body — calendar + on-deck */}
      <div className="flex" style={{ minHeight: "calc(100vh - 72px)" }}>
        {/* Calendar grid: ~75% */}
        <div className="flex-1 p-4 overflow-auto">
          <CalendarGrid
            weeks={weeks}
            today={today}
            eventsByDate={eventsByDate}
            crews={crews}
            splitLabels={splitLabels}
            draggingId={draggingId}
            dropTargetKey={dropTargetKey}
            onDragStart={setDraggingId}
            onDragEnd={() => { setDraggingId(null); setDropTargetKey(null); }}
            onDragOverCell={(iso) => setDropTargetKey(iso)}
            onDrop={(eventId, iso) => handleDrop(eventId, iso)}
          />
        </div>

        {/* On Deck side column: ~25% — also a dropzone (drop here = on-deck) */}
        <aside
          className={`w-80 border-l p-4 bg-[#0d0d0d] overflow-auto transition-colors ${
            dropTargetKey === "ondeck"
              ? "border-[#f08122]/60 bg-[#1a1410]"
              : "border-white/5"
          }`}
          onDragOver={(e) => {
            if (!draggingId) return;
            e.preventDefault();
            setDropTargetKey("ondeck");
          }}
          onDragLeave={() => {
            if (dropTargetKey === "ondeck") setDropTargetKey(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (!draggingId) return;
            handleDrop(draggingId, null);
          }}
        >
          <div className="mb-3">
            <h2 className="font-heading text-sm uppercase tracking-wide text-white/80">On Deck</h2>
            <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest">
              {onDeckEvents.length} pending · datable when ready
            </p>
          </div>
          <div className="space-y-2">
            {onDeckEvents.length === 0 ? (
              <p className="text-white/20 text-xs italic">Nothing on deck.</p>
            ) : (
              onDeckEvents.map((e) => (
                <OnDeckCard
                  key={e.id}
                  event={e}
                  crews={crews}
                  splitLabels={splitLabels}
                  isDragging={draggingId === e.id}
                  onDragStart={() => setDraggingId(e.id)}
                  onDragEnd={() => { setDraggingId(null); setDropTargetKey(null); }}
                />
              ))
            )}
          </div>
        </aside>
      </div>

      {/* Conflict prompt — informational; the move already saved */}
      {conflictPrompt && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setConflictPrompt(null); }}
        >
          <div className="bg-[#1a1a1a] border border-yellow-700/40 rounded-lg p-6 w-full max-w-xl">
            <h2 className="font-heading text-lg uppercase tracking-wide text-yellow-300 mb-3">
              ⚠ {conflictPrompt.conflicts.length} crew conflict{conflictPrompt.conflicts.length > 1 ? "s" : ""} — saved anyway
            </h2>
            <p className="text-white/60 text-xs mb-3">
              The move has been saved to the database. If this isn&apos;t what you wanted, drag the event back or choose a different crew.
            </p>
            <ul className="space-y-2 text-yellow-200/80 text-xs">
              {conflictPrompt.conflicts.map((c) => (
                <li key={c.id}>
                  <strong>{c.crew_name ?? "Unassigned"}</strong> already on{" "}
                  <strong>{c.job_client_name ?? c.job_id}</strong> ({c.description ?? c.event_type}){" "}
                  {c.date_start}{c.date_end ? `–${c.date_end}` : ""}
                </li>
              ))}
            </ul>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setConflictPrompt(null)}
                className="bg-yellow-600 hover:bg-yellow-500 text-black font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded transition-colors"
              >
                OK, got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error toast */}
      {errorPrompt && (
        <div className="fixed bottom-6 right-6 z-50 bg-red-900/80 border border-red-700/40 text-red-100 rounded p-3 max-w-md text-xs">
          <div className="flex items-start gap-2">
            <span>{errorPrompt}</span>
            <button onClick={() => setErrorPrompt(null)} className="text-red-300 hover:text-white">×</button>
          </div>
        </div>
      )}

      {showAddForm && (
        <AddEventForm
          crews={crews}
          jobs={jobs}
          onClose={() => setShowAddForm(false)}
          onCreated={() => {
            // Server data is stale after a write — easiest reliable refresh
            // is a full reload until we wire SWR/router.refresh integration.
            window.location.reload();
          }}
        />
      )}
    </section>
  );
}

// ── Calendar grid ──────────────────────────────────────────────────────────

function CalendarGrid({
  weeks, today, eventsByDate, crews, splitLabels,
  draggingId, dropTargetKey, onDragStart, onDragEnd, onDragOverCell, onDrop,
}: {
  weeks: string[][];
  today: string;
  eventsByDate: Map<string, JobEventWithJoins[]>;
  crews: Crew[];
  splitLabels: Map<string, string>;
  draggingId: string | null;
  dropTargetKey: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOverCell: (iso: string) => void;
  onDrop: (eventId: string, iso: string) => void;
}) {
  const dayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  return (
    <div className="space-y-2">
      {/* Day-name header row — weekday only */}
      <div className="grid grid-cols-5 gap-2">
        {dayHeaders.map((d) => (
          <div key={d} className="text-white/30 text-[10px] font-condensed uppercase tracking-widest text-center">
            {d}
          </div>
        ))}
      </div>

      {/* Week rows */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-5 gap-2">
          {week.map((iso) => {
            const events = eventsByDate.get(iso) ?? [];
            const isToday    = iso === today;
            const isPast     = iso < today;
            const isDropTarget = draggingId !== null && dropTargetKey === iso;
            return (
              <div
                key={iso}
                onDragOver={(e) => {
                  if (!draggingId) return;
                  e.preventDefault();
                  onDragOverCell(iso);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!draggingId) return;
                  onDrop(draggingId, iso);
                }}
                className={`bg-[#1a1a1a] rounded p-2 min-h-[120px] transition-colors ${
                  isPast ? "opacity-60" : ""
                } ${
                  isToday ? "ring-1 ring-[#f08122]/60" : ""
                } ${
                  isDropTarget ? "ring-2 ring-[#f08122] bg-[#1f1611]" : ""
                }`}
              >
                <div className={`text-[10px] font-condensed uppercase tracking-widest mb-2 ${
                  isToday ? "text-[#f08122]" : "text-white/30"
                }`}>
                  {iso.slice(5)}{isToday ? " · TODAY" : ""}
                </div>
                <div className="space-y-1">
                  {/* S1 fix: cap visible events at 4 to prevent cell overflow;
                      show "+N more" badge for the rest. */}
                  {events.slice(0, 4).map((e) => (
                    <EventCard
                      key={e.id}
                      event={e}
                      crews={crews}
                      splitLabel={splitLabels.get(e.id)}
                      isDragging={draggingId === e.id}
                      onDragStart={() => onDragStart(e.id)}
                      onDragEnd={onDragEnd}
                    />
                  ))}
                  {events.length > 4 && (
                    <div className="text-white/30 text-[9px] font-condensed uppercase tracking-wider pl-1 pt-0.5">
                      +{events.length - 4} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Event cards ────────────────────────────────────────────────────────────

function EventCard({
  event, crews, splitLabel, isDragging, onDragStart, onDragEnd,
}: {
  event: JobEventWithJoins;
  crews: Crew[];
  splitLabel?: string;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const col = crewColor(event.crew_id, crews);
  const status = STATUS_BADGE[event.status] ?? STATUS_BADGE.scheduled;
  const isMultiDay = event.date_end && event.date_start && event.date_end !== event.date_start;
  // B1 fix: use weekday count (not calendar days) so a Mon–Wed install shows "3d" not "3d".
  // Previously used calendar-day arithmetic which overcounted across weekends.
  const dur = isMultiDay ? countWeekdays(event.date_start!, event.date_end!) : 1;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", event.id);   // for browsers that need it
        onDragStart?.();
      }}
      onDragEnd={() => onDragEnd?.()}
      className={`rounded p-1.5 text-[10px] leading-tight cursor-grab active:cursor-grabbing transition-opacity ${
        isDragging ? "opacity-40" : ""
      }`}
      style={{
        background: col.bg,
        borderLeft: `3px solid ${col.bar}`,
      }}
    >
      <div className="flex items-center justify-between gap-1 mb-0.5">
        <span className="text-white/90 font-condensed uppercase tracking-wider truncate">
          {EVENT_TYPE_ICON[event.event_type]} {EVENT_TYPE_LABELS[event.event_type]}
          {splitLabel && <span className="text-white/40 ml-1">{splitLabel}</span>}
        </span>
        <span className={`px-1 rounded text-[8px] font-bold tracking-wider ${status.cls}`}>
          {status.label}
        </span>
      </div>
      {event.description && (
        <div className="text-white/70 truncate" title={event.description}>{event.description}</div>
      )}
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-white/50 truncate" title={event.job_client_name ?? ""}>
          {event.job_client_name ?? event.job_id}
        </span>
        <span style={{ color: col.text }} className="font-condensed uppercase tracking-wider">
          {event.crew_name ?? "Unassigned"}
        </span>
      </div>
      {isMultiDay && (
        <div className="text-white/30 text-[9px] mt-0.5 font-condensed uppercase tracking-wider">
          {dur}d → {event.date_end}
        </div>
      )}
    </div>
  );
}

// ── On Deck cards ──────────────────────────────────────────────────────────

function OnDeckCard({
  event, crews, splitLabels, isDragging, onDragStart, onDragEnd,
}: {
  event: JobEventWithJoins;
  crews: Crew[];
  splitLabels: Map<string, string>;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const col = crewColor(event.crew_id, crews);
  const splitLabel = splitLabels.get(event.id);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", event.id);
        onDragStart?.();
      }}
      onDragEnd={() => onDragEnd?.()}
      className={`rounded p-2 text-xs cursor-grab active:cursor-grabbing transition-opacity ${
        isDragging ? "opacity-40" : ""
      }`}
      style={{
        background: col.bg,
        borderLeft: `3px solid ${col.bar}`,
      }}
    >
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="text-white/90 font-condensed uppercase tracking-widest text-[10px]">
          {EVENT_TYPE_ICON[event.event_type]} {EVENT_TYPE_LABELS[event.event_type]}
          {splitLabel && <span className="text-white/40 ml-1">{splitLabel}</span>}
        </span>
        <span className="text-white/30 text-[9px] font-condensed uppercase tracking-wider">
          {event.crew_name ?? "—"}
        </span>
      </div>
      {event.description && (
        <div className="text-white/80 mb-1">{event.description}</div>
      )}
      <div className="text-white/40 text-[10px] truncate" title={event.job_client_name ?? ""}>
        {event.job_client_name ?? event.job_id}
      </div>
      {event.blocked_on && (
        <div className="mt-1.5 text-yellow-300/80 text-[10px] font-condensed uppercase tracking-wider">
          ⏸ {event.blocked_on}
        </div>
      )}
    </div>
  );
}
