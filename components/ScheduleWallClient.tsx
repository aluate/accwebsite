"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Crew, CrewPto, JobEventWithJoins, EventType } from "@/lib/schedule-types";
import { EVENT_TYPE_LABELS, isoDateOffset, isoWeekStart } from "@/lib/schedule-types";
import { getHolidaysForYear, type Holiday } from "@/lib/schedule-holidays";
import { calculateDuration, calculateEndDate, addWorkingDays, HOT_EVENT_TYPES, DEFAULT_DURATION } from "@/lib/schedule-utils";
import { AddEventForm } from "@/components/AddEventForm";

type JobMini = {
  id: string;
  client_name: string;
  site_address: string;
  city: string | null;
  client_phone: string | null;
  client_email: string | null;
};

// ── Props — only auth/date context; data fetched client-side ─────────────────

export type ScheduleWallProps = {
  today: string;
  isAdmin?: boolean;
};

// Shape returned by GET /api/schedule/data
type ScheduleData = {
  today: string;
  crews: Crew[];
  forwardEvents: JobEventWithJoins[];
  onDeckEvents: JobEventWithJoins[];
  jobs: JobMini[];
  ptoRows: (CrewPto & { crew_name: string })[];
  windowStartIso: string;
  windowEndIso: string;
};

// ── Color palette ─────────────────────────────────────────────────────────────

const CREW_PALETTE = [
  { bg: "rgba(240,129,34,0.50)",  bar: "#f08122", text: "#f08122" }, // ACC orange
  { bg: "rgba(96,165,250,0.50)",  bar: "#60a5fa", text: "#93c5fd" }, // sky
  { bg: "rgba(167,139,250,0.50)", bar: "#a78bfa", text: "#c4b5fd" }, // violet
  { bg: "rgba(74,222,128,0.50)",  bar: "#4ade80", text: "#86efac" }, // green
  { bg: "rgba(251,113,133,0.50)", bar: "#fb7185", text: "#fda4af" }, // rose
  { bg: "rgba(250,204,21,0.50)",  bar: "#facc15", text: "#fde047" }, // amber
];
const UNASSIGNED_COLOR = { bg: "rgba(220,38,38,0.50)", bar: "#dc2626", text: "#fca5a5" };
const SUB_CREW_COLOR   = { bg: "rgba(192,132,252,0.50)", bar: "#c084fc", text: "#d8b4fe" }; // purple — sub installers
const HOT_STRIPE = "#f97316"; // thick left-border stripe for service/punch

// Event-type color palette (Karl to refine shades — mechanism in place)
const EVENT_TYPE_COLOR: Record<string, { bg: string; bar: string; text: string }> = {
  cab_delivery:      { bg: "rgba(96,165,250,0.50)",  bar: "#60a5fa", text: "#93c5fd" }, // blue — shipping
  top_delivery:      { bg: "rgba(34,211,238,0.50)",  bar: "#22d3ee", text: "#67e8f9" }, // cyan — tops
  install:           { bg: "rgba(249,115,22,0.50)",  bar: "#f97316", text: "#fb923c" }, // orange-red — install
  service:           { bg: "rgba(250,204,21,0.50)",  bar: "#facc15", text: "#fde047" }, // amber — service
  punch:             { bg: "rgba(251,113,133,0.50)", bar: "#fb7185", text: "#fda4af" }, // rose — punch
  final_walkthrough: { bg: "rgba(74,222,128,0.50)",  bar: "#4ade80", text: "#86efac" }, // green — final
  other:             { bg: "rgba(148,163,184,0.50)", bar: "#94a3b8", text: "#cbd5e1" }, // slate — other
};
function eventTypeColor(eventType: string) {
  return EVENT_TYPE_COLOR[eventType] ?? UNASSIGNED_COLOR;
}

function crewColor(crewId: string | null, crews: Crew[]) {
  if (!crewId) return UNASSIGNED_COLOR;
  const idx = crews.findIndex((c) => c.id === crewId);
  return idx === -1 ? UNASSIGNED_COLOR : CREW_PALETTE[idx % CREW_PALETTE.length];
}

const EVENT_TYPE_ICON: Record<EventType, string> = {
  cab_delivery:      "📦",
  top_delivery:      "🪨",
  install:           "🔨",
  service:           "🛠️",
  punch:             "✓",
  final_walkthrough: "🏁",
  other:             "•",
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "SCHED", cls: "bg-white/10 text-white/60" },
  confirmed: { label: "CONF",  cls: "bg-blue-500/20 text-blue-300" },
  complete:  { label: "DONE",  cls: "bg-green-500/20 text-green-300" },
  on_hold:   { label: "HOLD",  cls: "bg-yellow-500/20 text-yellow-300" },
};

// ── Month navigation helpers ──────────────────────────────────────────────────

function monthKey(iso: string) { return iso.slice(0, 7); } // "YYYY-MM"
function isoFirstOfMonth(ym: string) { return `${ym}-01`; }
function isoLastOfMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
function advanceMonth(ym: string, delta: number) {
  let [y, m] = ym.split("-").map(Number);
  m += delta;
  while (m > 12) { m -= 12; y++; }
  while (m < 1)  { m += 12; y--; }
  return `${y}-${String(m).padStart(2, "0")}`;
}
const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];

// ── Lane assignment (global, not per-row) ─────────────────────────────────────
/**
 * Assigns each event a lane index such that no two overlapping events share
 * a lane. "Overlapping" means their [date_start, date_end] ranges intersect.
 * Events are processed in date_start order so that earlier events get lower
 * lane numbers (visually stable from reload to reload).
 *
 * Returns a Map<event_id, lane_index>.
 */
function assignLanes(events: JobEventWithJoins[]): Map<string, number> {
  const sorted = [...events]
    .filter((e) => e.date_start)
    .sort((a, b) => (a.date_start! < b.date_start! ? -1 : 1));

  const laneMap = new Map<string, number>();
  // For each lane, track the latest end_date occupied.
  const laneEnds: string[] = [];

  for (const ev of sorted) {
    const start = ev.date_start!;
    const end   = ev.date_end ?? ev.date_start!;
    // Find the lowest lane whose end < this event's start.
    let lane = laneEnds.findIndex((laneEnd) => laneEnd < start);
    if (lane === -1) lane = laneEnds.length; // need a new lane
    laneMap.set(ev.id, lane);
    laneEnds[lane] = end;
  }

  return laneMap;
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function ScheduleSkeleton() {
  return (
    <section className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="px-6 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="h-6 w-32 bg-white/10 rounded animate-pulse" />
        <div className="h-6 w-24 bg-white/10 rounded animate-pulse" />
      </header>
      <div className="hidden md:flex" style={{ minHeight: "calc(100vh - 64px)" }}>
        <div className="flex-1 p-3 space-y-2">
          {/* Day-of-week header */}
          <div className="grid grid-cols-5 gap-px mb-1">
            {["Mon","Tue","Wed","Thu","Fri"].map((d) => (
              <div key={d} className="h-5 bg-white/5 rounded animate-pulse" />
            ))}
          </div>
          {/* Week rows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid grid-cols-5 gap-px">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="h-20 bg-white/5 rounded animate-pulse" />
              ))}
            </div>
          ))}
        </div>
        <aside className="w-48 border-l border-white/5 p-3 bg-[#0d0d0d] space-y-2">
          <div className="h-4 w-24 bg-white/10 rounded animate-pulse" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 bg-white/5 rounded animate-pulse" />
          ))}
        </aside>
      </div>
    </section>
  );
}

// ── Error banner ──────────────────────────────────────────────────────────────

function ScheduleErrorBanner({ onRetry, loading }: { onRetry: () => void; loading: boolean }) {
  return (
    <section className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center gap-4">
      <p className="text-white/50 text-sm font-condensed">
        Couldn&apos;t load schedule data.
      </p>
      <button
        onClick={onRetry}
        disabled={loading}
        className="flex items-center gap-2 bg-[#f08122] hover:bg-[#d9711e] disabled:opacity-50 text-white font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded transition-colors"
      >
        {loading ? (
          <>
            <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Retrying…
          </>
        ) : (
          "Try Again"
        )}
      </button>
    </section>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function ScheduleWallClient({ today: initialToday, isAdmin = false }: ScheduleWallProps) {
  // ── Data-fetch state ──────────────────────────────────────────────────────
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [fetching, setFetching]   = useState(false);

  // TV mode: /schedule?tv=1 — read once on mount
  const [tvMode] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tv") === "1"
  );

  // View filter: "delivery" | "install" — cycles on TV every 60s
  const DELIVERY_TYPES = new Set(["cab_delivery", "top_delivery"]);
  const [calView, setCalView] = useState<"delivery" | "install">("delivery");
  useEffect(() => {
    if (!tvMode) return;
    const id = setInterval(() => setCalView((v) => v === "delivery" ? "install" : "delivery"), 60000);
    return () => clearInterval(id);
  }, [tvMode]);

  const fetchData = useCallback(async () => {
    setFetching(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/schedule/data");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as ScheduleData;
      setData(json);
      setForwardEvents(json.forwardEvents);
      setOnDeckEvents(json.onDeckEvents);
    } catch {
      setLoadError(true);
    } finally {
      setFetching(false);
    }
  }, []);

  // Initial fetch + 60-second poll for TV mode
  useEffect(() => {
    fetchData();
    if (tvMode) {
      const id = setInterval(fetchData, 60_000);
      return () => clearInterval(id);
    }
  }, [fetchData, tvMode]);

  // ── Local mutable event state (optimistic updates for drag/drop) ──────────
  const [forwardEvents, setForwardEvents] = useState<JobEventWithJoins[]>([]);
  const [onDeckEvents,  setOnDeckEvents]  = useState<JobEventWithJoins[]>([]);

  // Keep local state in sync whenever a fresh fetch lands
  // (handled inside fetchData above)

  const today   = data?.today ?? initialToday;
  const crews   = data?.crews ?? [];
  const jobs    = data?.jobs  ?? [];
  const ptoRows = data?.ptoRows ?? [];

  // ── Week-anchor navigation: always show 5 weeks starting from anchor Monday ─
  const [viewWeekStart, setViewWeekStart] = useState(() => isoWeekStart(initialToday));
  const [jumpValue, setJumpValue] = useState("");

  const [showAddForm, setShowAddForm]   = useState(false);
  const [filterCrewId, setFilterCrewId] = useState<string | null>(null);
  const [selectedEvent,  setSelectedEvent]  = useState<JobEventWithJoins | null>(null);
  const [editingEvent,   setEditingEvent]   = useState<JobEventWithJoins | null>(null);
  const [mobileWeekStart, setMobileWeekStart] = useState<string>(() => isoWeekStart(initialToday));

  const [draggingId,    setDraggingId]    = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

  const [conflictPrompt, setConflictPrompt] = useState<{
    eventId: string; conflicts: JobEventWithJoins[];
  } | null>(null);
  const [errorPrompt, setErrorPrompt] = useState<string | null>(null);

  // ── Week count: 3 on TV (no scroll), 8 on desktop (scrollable) ──────────
  const weekCount = tvMode ? 3 : 8;
  const weeks: string[][] = useMemo(() => {
    const out: string[][] = [];
    for (let w = 0; w < weekCount; w++) {
      const week: string[] = [];
      for (let d = 0; d < 5; d++) week.push(isoDateOffset(viewWeekStart, w * 7 + d));
      out.push(week);
    }
    return out;
  }, [viewWeekStart, weekCount]);

  const visibleStart = weeks[0][0];
  const visibleEnd   = weeks[weekCount - 1][4];

  // ── Holiday map for visible range ─────────────────────────────────────────
  const holidayMap = useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>();
    const y1 = parseInt(visibleStart.slice(0, 4), 10);
    const y2 = parseInt(visibleEnd.slice(0, 4), 10);
    for (let y = y1; y <= y2; y++) {
      for (const h of getHolidaysForYear(y)) m.set(h.date, h.label);
    }
    return m;
  }, [visibleStart, visibleEnd]);

  // ── PTO map: date → list of crew PTO entries covering that date ───────────
  const ptoMap = useMemo<Map<string, (CrewPto & { crew_name: string })[]>>(() => {
    const m = new Map<string, (CrewPto & { crew_name: string })[]>();
    for (const p of ptoRows) {
      let cur = p.date_start;
      while (cur <= p.date_end) {
        const list = m.get(cur) ?? [];
        list.push(p);
        m.set(cur, list);
        // advance one day
        const d = new Date(cur + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() + 1);
        cur = d.toISOString().slice(0, 10);
      }
    }
    return m;
  }, [ptoRows]);

  // ── Lane assignment (global, computed once per event list change) ─────────
  const filteredForward = useMemo(() =>
    filterCrewId ? forwardEvents.filter((e) => e.crew_id === filterCrewId) : forwardEvents,
    [forwardEvents, filterCrewId]
  );

  // Only include events that overlap the visible range
  const visibleEvents = useMemo(() =>
    filteredForward.filter((e) => {
      if (!e.date_start) return false;
      const end = e.date_end ?? e.date_start;
      return e.date_start <= visibleEnd && end >= visibleStart;
    }),
    [filteredForward, visibleStart, visibleEnd]
  );

  const DELIVERY_SET = new Set(["cab_delivery", "top_delivery"]);
  const viewEvents = useMemo(() =>
    visibleEvents.filter((e) =>
      calView === "delivery" ? DELIVERY_SET.has(e.event_type) : !DELIVERY_SET.has(e.event_type)
    ),
    [visibleEvents, calView]
  );
  const laneMap = useMemo(() => assignLanes(viewEvents), [viewEvents]);

  // Mobile agenda: week days Mon-Fri for the selected week
  const mobileWeekDays = useMemo(() => {
    const days: { day: string; events: typeof forwardEvents }[] = [];
    for (let i = 0; i < 5; i++) {
      const day = isoDateOffset(mobileWeekStart, i);
      const events = forwardEvents.filter((e) => {
        if (!e.date_start) return false;
        const end = e.date_end ?? e.date_start;
        return e.date_start <= day && end >= day;
      });
      days.push({ day, events });
    }
    return days;
  }, [forwardEvents, mobileWeekStart]);

  const mobileWeekEnd = isoDateOffset(mobileWeekStart, 4);
  const mobileWeekHasToday = today >= mobileWeekStart && today <= mobileWeekEnd;

  // ── "1 of N" split labels ─────────────────────────────────────────────────
  const splitLabels = useMemo(() => {
    const byId = new Map([...forwardEvents, ...onDeckEvents].map((e) => [e.id, e]));
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
    for (const e of [...forwardEvents, ...onDeckEvents]) {
      const r = rootOf(e.id);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r)!.push(e);
    }
    const labels = new Map<string, string>();
    for (const [, list] of groups) {
      if (list.length < 2) continue;
      list.sort((a, b) => (a.date_start ?? "9999").localeCompare(b.date_start ?? "9999"));
      list.forEach((e, i) => labels.set(e.id, `${i + 1}/${list.length}`));
    }
    return labels;
  }, [forwardEvents, onDeckEvents]);

  // ── Drag and drop ─────────────────────────────────────────────────────────
  async function handleDrop(eventId: string, targetIso: string | null) {
    setDraggingId(null);
    setDropTargetKey(null);

    const prevForward = forwardEvents;
    const prevOnDeck  = onDeckEvents;

    const all = [...forwardEvents, ...onDeckEvents];
    const event = all.find((e) => e.id === eventId);
    if (!event) return;
    if (targetIso && event.date_start === targetIso) return;
    if (!targetIso && !event.date_start) return;

    let newStart: string | null = targetIso;
    let newEnd:   string | null = null;

    if (targetIso && event.date_start && event.date_end) {
      // Preserve working-day duration via schedule-utils
      const dur = calculateDuration(event.date_start, event.date_end);
      newEnd = calculateEndDate(targetIso, dur);
    } else if (targetIso && event.date_start && !event.date_end) {
      newEnd = null; // single-day stays single-day
    } else if (targetIso && !event.date_start) {
      // On-deck → calendar: apply type default
      const dur = DEFAULT_DURATION[event.event_type] ?? 1;
      if (dur > 1) newEnd = calculateEndDate(targetIso, dur);
    }

    const updated: JobEventWithJoins = { ...event, date_start: newStart, date_end: newEnd };
    if (targetIso) {
      setForwardEvents([...forwardEvents.filter((e) => e.id !== eventId), updated]);
      setOnDeckEvents(onDeckEvents.filter((e) => e.id !== eventId));
    } else {
      setOnDeckEvents([updated, ...onDeckEvents.filter((e) => e.id !== eventId)]);
      setForwardEvents(forwardEvents.filter((e) => e.id !== eventId));
    }

    try {
      const res = await fetch(`/api/schedule/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date_start: newStart, date_end: newEnd }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setForwardEvents(prevForward);
        setOnDeckEvents(prevOnDeck);
        setErrorPrompt(body.error ?? `Save failed (${res.status})`);
        return;
      }
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

  // ── Render guards ─────────────────────────────────────────────────────────

  if (!data && fetching) return <ScheduleSkeleton />;
  if (!data && loadError) return <ScheduleErrorBanner onRetry={fetchData} loading={fetching} />;
  // Still loading on first mount and not yet errored — show skeleton
  if (!data) return <ScheduleSkeleton />;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <section className="min-h-screen bg-[#0a0a0a] text-white">

      {/* Header */}
      {!tvMode && (
        <header className="px-6 py-3 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="font-heading text-xl uppercase tracking-wide">Schedule</h1>
              <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest">
                Today: {today}
              </p>
            </div>

            {/* Week navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setViewWeekStart((w) => isoDateOffset(w, -7))}
                className="px-2 py-1 rounded text-white/50 hover:text-white hover:bg-white/5 text-sm transition-colors"
                title="Previous week"
              >
                ‹
              </button>
              <span className="font-condensed uppercase tracking-widest text-xs text-white/80 min-w-[11rem] text-center">
                {visibleStart.slice(5).replace("-", "/")} – {visibleEnd.slice(5).replace("-", "/")} {visibleEnd.slice(0, 4)}
              </span>
              <button
                onClick={() => setViewWeekStart((w) => isoDateOffset(w, 7))}
                className="px-2 py-1 rounded text-white/50 hover:text-white hover:bg-white/5 text-sm transition-colors"
                title="Next week"
              >
                ›
              </button>
              <button
                onClick={() => setViewWeekStart(isoWeekStart(today))}
                className="px-2 py-1 rounded text-[10px] font-condensed uppercase tracking-widest text-white/30 hover:text-white/70 transition-colors"
              >
                Today
              </button>
            </div>

            {/* View filter tabs */}
            <div className="flex gap-1">
              {(["delivery", "install"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setCalView(v)}
                  className={`px-3 py-1 rounded text-[10px] font-condensed uppercase tracking-widest transition-colors ${
                    calView === v ? "bg-[#f08122] text-white" : "bg-white/5 text-white/40 hover:text-white/70"
                  }`}
                >
                  {v === "delivery" ? "📦 Deliveries" : "🔨 Installs"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Crew filter */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilterCrewId(null)}
                className={`px-2 py-1 rounded text-[10px] font-condensed uppercase tracking-widest transition-colors ${
                  filterCrewId === null ? "bg-white/10 text-white" : "text-white/30 hover:text-white/60"
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
                    className="px-2 py-1 rounded text-[10px] font-condensed uppercase tracking-widest transition-colors"
                    style={{
                      background: active ? col.bg : "transparent",
                      color: active ? col.text : "rgba(255,255,255,0.3)",
                      border: `1px solid ${active ? col.bar : "transparent"}`,
                    }}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>

            {isAdmin && (
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs px-3 py-1.5 rounded transition-colors"
              >
                + Add Event
              </button>
            )}
          </div>
        </header>
      )}

      {/* TV view label — cycles every 60s */}
      {tvMode && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
          <div className="flex gap-2">
            <button
              onClick={() => setCalView("delivery")}
              className={`px-4 py-1.5 rounded font-condensed uppercase tracking-widest text-sm transition-colors ${calView === "delivery" ? "bg-blue-500/80 text-white" : "bg-white/10 text-white/50"}`}
            >
              📦 Deliveries
            </button>
            <button
              onClick={() => setCalView("install")}
              className={`px-4 py-1.5 rounded font-condensed uppercase tracking-widest text-sm transition-colors ${calView === "install" ? "bg-orange-500/80 text-white" : "bg-white/10 text-white/50"}`}
            >
              🔨 Installs &amp; Service
            </button>
          </div>
          <span className="text-white/30 text-[10px] font-condensed uppercase tracking-widest">
            auto-cycles every 60s
          </span>
        </div>
      )}

      {/* Body */}
      <div className={`hidden md:flex ${tvMode ? "min-h-screen" : ""}`} style={{ minHeight: tvMode ? undefined : "calc(100vh - 64px)" }}>

        {/* Calendar */}
        <div className="flex-1 p-3 overflow-auto">
          <SpanningCalendar
            weeks={weeks}
            today={today}
            visibleStart={visibleStart}
            visibleEnd={visibleEnd}
            events={viewEvents}
            laneMap={laneMap}
            tvMode={tvMode}
            crews={crews}
            splitLabels={splitLabels}
            holidayMap={holidayMap}
            ptoMap={ptoMap}
            draggingId={draggingId}
            dropTargetKey={dropTargetKey}
            isAdmin={isAdmin && !tvMode}
            onDragStart={setDraggingId}
            onDragEnd={() => { setDraggingId(null); setDropTargetKey(null); }}
            onDragOverCell={(iso) => setDropTargetKey(iso)}
            onDrop={(id, iso) => handleDrop(id, iso)}
            onEventClick={setSelectedEvent}
          />
        </div>

        {/* On Deck */}
        {!tvMode && (
          <aside
            className={`w-48 border-l p-3 bg-[#0d0d0d] overflow-auto transition-colors ${
              dropTargetKey === "ondeck"
                ? "border-[#f08122]/60 bg-[#1a1410]"
                : "border-white/5"
            }`}
            onDragOver={(e) => { if (!draggingId) return; e.preventDefault(); setDropTargetKey("ondeck"); }}
            onDragLeave={() => { if (dropTargetKey === "ondeck") setDropTargetKey(null); }}
            onDrop={(e) => { e.preventDefault(); if (draggingId) handleDrop(draggingId, null); }}
          >
            <p className="text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-2">
              On Deck — {onDeckEvents.length}
            </p>

            {onDeckEvents.length === 0 ? (
              <p className="text-white/15 text-xs italic">Nothing on deck.</p>
            ) : onDeckEvents.map((ev) => {
              const col = eventTypeColor(ev.event_type);
              const job = jobs.find((j) => j.id === ev.job_id);
              return (
                <div
                  key={ev.id}
                  draggable={isAdmin}
                  onDragStart={() => isAdmin && setDraggingId(ev.id)}
                  onDragEnd={() => { setDraggingId(null); setDropTargetKey(null); }}
                  className={`mb-1.5 rounded px-2 py-1.5 select-none ${isAdmin ? "cursor-grab" : "cursor-default"}`}
                  style={{
                    background: col.bg,
                    borderLeft: `3px solid ${col.bar}`,
                  }}
                >
                  <p className="text-[10px] font-condensed uppercase tracking-widest" style={{ color: col.text }}>
                    {EVENT_TYPE_ICON[ev.event_type]} {EVENT_TYPE_LABELS[ev.event_type]}

                  </p>
                  <p className="text-xs text-white/70 truncate">{job?.client_name ?? ev.job_id}</p>
                  {ev.blocked_on && (
                    <p className="text-[9px] text-white/30 truncate mt-0.5">⏸ {ev.blocked_on}</p>
                  )}
                </div>
              );
            })}
          </aside>
        )}
      </div>

      {/* ── Mobile agenda (phones only, hidden md+) — week view ─────────── */}
      <div className="md:hidden flex flex-col min-h-[calc(100vh-64px)]">

        {/* Week navigation header */}
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <button
            onClick={() => setMobileWeekStart((w) => isoDateOffset(w, -7))}
            className="w-10 h-10 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/5 text-xl transition-colors"
          >
            ‹
          </button>
          <div className="text-center">
            <p className="font-heading text-sm uppercase tracking-wide text-white">
              {(() => {
                const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                const [sy, sm, sd] = mobileWeekStart.split("-").map(Number);
                const [ey, em, ed] = mobileWeekEnd.split("-").map(Number);
                const start = `${MON[sm-1]} ${sd}`;
                const end   = sm === em ? `${ed}` : `${MON[em-1]} ${ed}`;
                return `${start} – ${end}`;
              })()}
            </p>
            {mobileWeekHasToday && (
              <p className="text-[#f08122] text-[10px] font-condensed uppercase tracking-widest">This Week</p>
            )}
          </div>
          <button
            onClick={() => setMobileWeekStart((w) => isoDateOffset(w, 7))}
            className="w-10 h-10 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/5 text-xl transition-colors"
          >
            ›
          </button>
        </div>

        {/* This Week shortcut + Add */}
        <div className="px-4 py-2 flex items-center justify-between border-b border-white/5">
          <button
            onClick={() => setMobileWeekStart(isoWeekStart(today))}
            className={`text-[10px] font-condensed uppercase tracking-widest px-2 py-1 rounded transition-colors ${
              mobileWeekHasToday ? "text-white/20" : "text-[#f08122] hover:bg-[#f08122]/10"
            }`}
          >
            ← This Week
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs px-3 py-1.5 rounded transition-colors"
            >
              + Add Event
            </button>
          )}
        </div>

        {/* Week days stacked */}
        <div className="flex-1 overflow-auto">
          {mobileWeekDays.map(({ day, events: dayEvents }) => {
            const [y, m, d] = day.split("-").map(Number);
            const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
            const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
            const dow = new Date(y, m - 1, d).getDay();
            const isToday = day === today;
            return (
              <div key={day} className={`border-b border-white/5 ${isToday ? "bg-white/[0.03]" : ""}`}>
                {/* Day header */}
                <div className={`px-4 py-2 flex items-center gap-2 ${isToday ? "border-l-2 border-[#f08122]" : "border-l-2 border-transparent"}`}>
                  <span className={`text-xs font-condensed uppercase tracking-widest ${isToday ? "text-[#f08122]" : "text-white/40"}`}>
                    {DOW[dow]}
                  </span>
                  <span className={`text-sm font-semibold ${isToday ? "text-white" : "text-white/50"}`}>
                    {MON[m - 1]} {d}
                  </span>
                  {isToday && (
                    <span className="ml-1 text-[9px] font-condensed uppercase tracking-widest text-[#f08122] bg-[#f08122]/10 px-1.5 py-0.5 rounded">Today</span>
                  )}
                  {dayEvents.length > 0 && (
                    <span className="ml-auto text-[10px] text-white/25 font-condensed">{dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}</span>
                  )}
                </div>
                {/* Events for this day */}
                {dayEvents.length === 0 ? (
                  <div className="px-4 pb-3">
                    <p className="text-white/15 text-[11px] font-condensed italic">No events</p>
                  </div>
                ) : (
                  <div className="px-3 pb-3 space-y-1.5">
                    {dayEvents.map((ev) => {
                      const col = eventTypeColor(ev.event_type);
                      const job = jobs.find((j) => j.id === ev.job_id);
                      const address = [job?.site_address, job?.city].filter(Boolean).join(", ");
                      return (
                        <button
                          key={ev.id}
                          onClick={() => setSelectedEvent(ev)}
                          className="w-full text-left rounded-lg overflow-hidden"
                          style={{ background: col.bg, borderLeft: `4px solid ${col.bar}` }}
                        >
                          <div className="px-3 py-2.5">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[10px] font-condensed uppercase tracking-widest" style={{ color: col.text }}>
                                {EVENT_TYPE_ICON[ev.event_type]} {EVENT_TYPE_LABELS[ev.event_type]}
                              </span>
                              <span className="text-[10px] text-white/30 font-condensed">{ev.job_id}</span>
                            </div>
                            <p className="text-white text-sm font-semibold leading-tight">{job?.client_name ?? ev.job_id}</p>
                            {ev.description && (
                              <p className="text-white/50 text-xs mt-0.5">{ev.description}</p>
                            )}
                            {address && (
                              <p className="text-white/40 text-xs mt-1 truncate">📍 {address}</p>
                            )}
                            {ev.crew_name && (
                              <p className="text-xs mt-0.5" style={{ color: col.text }}>👷 {ev.crew_name}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* On Deck section */}
          {onDeckEvents.length > 0 && (
            <div className="p-3">
              <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mb-2 px-1">
                On Deck — {onDeckEvents.length}
              </p>
              <div className="space-y-1.5">
                {onDeckEvents.map((ev) => {
                  const col = eventTypeColor(ev.event_type);
                  const job = jobs.find((j) => j.id === ev.job_id);
                  return (
                    <button
                      key={ev.id}
                      onClick={() => setSelectedEvent(ev)}
                      className="w-full text-left rounded-lg overflow-hidden opacity-60"
                      style={{ background: col.bg, borderLeft: `4px solid ${col.bar}` }}
                    >
                      <div className="px-3 py-2.5">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] font-condensed uppercase tracking-widest" style={{ color: col.text }}>
                            ⏸ {EVENT_TYPE_LABELS[ev.event_type]}
                          </span>
                          <span className="text-[10px] text-white/30 font-condensed">{ev.job_id}</span>
                        </div>
                        <p className="text-white text-sm leading-tight">{job?.client_name ?? ev.job_id}</p>
                        {ev.blocked_on && (
                          <p className="text-white/40 text-xs mt-0.5">{ev.blocked_on}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Conflict modal */}
      {conflictPrompt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] border border-white/10 rounded p-6 max-w-md w-full mx-4">
            <h3 className="text-white font-condensed uppercase tracking-widest mb-3">Scheduling Conflict</h3>
            <p className="text-white/60 text-sm mb-4">
              Event saved — conflicts with {conflictPrompt.conflicts.length} other event{conflictPrompt.conflicts.length === 1 ? "" : "s"}.
            </p>
            {conflictPrompt.conflicts.slice(0, 4).map((c) => (
              <p key={c.id} className="text-yellow-300/70 text-xs mb-1">
                {c.crew_name} on {c.job_client_name ?? c.job_id} ({c.date_start}{c.date_end ? `–${c.date_end}` : ""})
              </p>
            ))}
            <button onClick={() => setConflictPrompt(null)} className="mt-4 bg-[#f08122] text-white font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Error modal */}
      {errorPrompt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] border border-red-900/30 rounded p-6 max-w-md w-full mx-4">
            <h3 className="text-white font-condensed uppercase tracking-widest mb-3">Error</h3>
            <p className="text-red-400 text-sm mb-4">{errorPrompt}</p>
            <button
              onClick={() => setErrorPrompt(null)}
              className="bg-[#f08122] text-white font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Add event form */}
      {showAddForm && isAdmin && (
        <AddEventForm
          crews={crews}
          jobs={jobs}
          onClose={() => setShowAddForm(false)}
          onCreated={(ev) => {
            if (ev.date_start) {
              setForwardEvents((prev) => [...prev, ev]);
            } else {
              setOnDeckEvents((prev) => [...prev, ev]);
            }
          }}
        />
      )}

      {/* Edit event form */}
      {editingEvent && isAdmin && (
        <AddEventForm
          mode="edit"
          initialEvent={editingEvent}
          crews={crews}
          jobs={jobs}
          onClose={() => setEditingEvent(null)}
          onCreated={() => {}}
          onUpdated={(ev) => {
            const update = (prev: JobEventWithJoins[]) =>
              prev.map((e) => e.id === ev.id ? { ...e, ...ev } : e);
            setForwardEvents(update);
            setOnDeckEvents(update);
            setEditingEvent(null);
          }}
          onDeleted={(id) => {
            setForwardEvents((prev) => prev.filter((e) => e.id !== id));
            setOnDeckEvents((prev) => prev.filter((e) => e.id !== id));
            setEditingEvent(null);
          }}
        />
      )}
{/* ── Job detail modal ─────────────────────────────────────────────── */}
{selectedEvent && (() => {
  const ev  = selectedEvent;
  const job = jobs.find((j) => j.id === ev.job_id);
  const col = eventTypeColor(ev.event_type);
  const address = [job?.site_address, job?.city].filter(Boolean).join(", ");
  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      onClick={() => setSelectedEvent(null)}
    >
      <div
        className="bg-[#1a1a1a] border border-white/10 rounded-xl w-full max-w-sm shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1.5 w-full" style={{ background: col.bar }} />
        <div className="p-5 space-y-4">
          <div>
            <p className="text-[#f08122] text-xs font-condensed uppercase tracking-widest mb-0.5">{ev.job_id}</p>
            <p className="text-white text-xl font-heading uppercase tracking-wide leading-tight">
              {ev.job_client_name ?? ev.job_id}
            </p>
            {ev.description && (
              <p className="text-white/50 text-xs font-condensed mt-1 italic">{ev.description}</p>
            )}
          </div>
          <div className="bg-[#111] rounded-lg px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-white/40 text-xs font-condensed uppercase tracking-widest">Type</span>
              <span className="text-white text-xs font-condensed uppercase tracking-widest">
                {EVENT_TYPE_ICON[ev.event_type]} {EVENT_TYPE_LABELS[ev.event_type]}
              </span>
            </div>
            {ev.crew_name && (
              <div className="flex items-center justify-between">
                <span className="text-white/40 text-xs font-condensed uppercase tracking-widest">Crew</span>
                <span className="text-xs font-condensed" style={{ color: col.text }}>{ev.crew_name}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-white/40 text-xs font-condensed uppercase tracking-widest">Dates</span>
              <span className="text-white text-xs font-condensed">
                {ev.date_start}{ev.date_end && ev.date_end !== ev.date_start ? ` → ${ev.date_end}` : ""}
              </span>
            </div>
          </div>
          {address && (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 bg-[#111] rounded-lg px-4 py-3 hover:bg-white/5 transition-colors group"
            >
              <span className="text-white/30 text-base mt-0.5">📍</span>
              <div>
                <p className="text-white text-sm leading-snug group-hover:text-[#f08122] transition-colors">{address}</p>
                <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mt-0.5">Tap to open in Maps</p>
              </div>
            </a>
          )}
          {(job?.client_phone || job?.client_email) && (
            <div className="space-y-2">
              {job?.client_phone && (
                <a
                  href={`tel:${job.client_phone}`}
                  className="flex items-center gap-3 bg-[#111] rounded-lg px-4 py-3 hover:bg-white/5 transition-colors group"
                >
                  <span className="text-white/30 text-base">📞</span>
                  <div>
                    <p className="text-white text-sm group-hover:text-[#f08122] transition-colors">{job.client_phone}</p>
                    <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mt-0.5">Tap to call</p>
                  </div>
                </a>
              )}
              {job?.client_email && (
                <a
                  href={`mailto:${job.client_email}`}
                  className="flex items-center gap-3 bg-[#111] rounded-lg px-4 py-3 hover:bg-white/5 transition-colors group"
                >
                  <span className="text-white/30 text-base">✉️</span>
                  <div>
                    <p className="text-white text-sm group-hover:text-[#f08122] transition-colors">{job.client_email}</p>
                    <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mt-0.5">Tap to email</p>
                  </div>
                </a>
              )}
            </div>
          )}
          {isAdmin && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setEditingEvent(ev); setSelectedEvent(null); }}
                className="flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/20 text-white font-condensed uppercase tracking-widest text-xs py-2.5 rounded-lg transition-colors"
              >
                ✏ Edit
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Delete this event? This cannot be undone.`)) return;
                  const r = await fetch(`/api/schedule/events/${ev.id}`, { method: "DELETE" });
                  if (r.ok) {
                    setForwardEvents((prev) => prev.filter((e) => e.id !== ev.id));
                    setOnDeckEvents((prev) => prev.filter((e) => e.id !== ev.id));
                    setSelectedEvent(null);
                  } else {
                    alert("Delete failed — check console.");
                  }
                }}
                className="flex items-center justify-center gap-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 font-condensed uppercase tracking-widest text-xs py-2.5 rounded-lg transition-colors"
              >
                🗑 Delete
              </button>
            </div>
          )}
          <a
            href={`/jobs/${ev.job_id}`}
            className="flex items-center justify-center gap-2 w-full bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-sm py-3 rounded-lg transition-colors"
          >
            Open Job File →
          </a>
          <button
            onClick={() => setSelectedEvent(null)}
            className="w-full text-white/30 hover:text-white/60 font-condensed uppercase tracking-widest text-xs py-2 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
})()}
    </section>
  );
}

// ── SpanningCalendar ──────────────────────────────────────────────────────────

type BarSegment = {
  eventId: string;
  colStart: number;
  colEnd: number;
  isContinuation: boolean;
  continuesNext: boolean;
};

type SpanningCalendarProps = {
  weeks: string[][];
  today: string;
  visibleStart: string;
  visibleEnd: string;
  events: JobEventWithJoins[];
  laneMap: Map<string, number>;
  tvMode: boolean;
  crews: Crew[];
  splitLabels: Map<string, string>;
  holidayMap: Map<string, string>;
  ptoMap: Map<string, (CrewPto & { crew_name: string })[]>;
  draggingId: string | null;
  dropTargetKey: string | null;
  isAdmin: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOverCell: (iso: string) => void;
  onDrop: (id: string, iso: string) => void;
  onEventClick: (ev: JobEventWithJoins) => void;
};

function SpanningCalendar({
  weeks, today, events, laneMap, crews, splitLabels, holidayMap, ptoMap,
  draggingId, dropTargetKey, isAdmin, tvMode,
  onDragStart, onDragEnd, onDragOverCell, onDrop, onEventClick,
}: SpanningCalendarProps) {

  const maxLanes = useMemo(() => {
    let max = 0;
    for (const [, lane] of laneMap) if (lane > max) max = lane;
    // TV: cap at 2 so 3 big weeks fit; desktop: cap at 4 with scroll
    return tvMode ? Math.min(max + 1, 2) : Math.min(max + 1, 4);
  }, [laneMap, tvMode]);

  const ROW_HEADER_H = tvMode ? 28 : 22;
  const LANE_H       = tvMode ? 32 : 22;
  const CELL_MIN_H   = ROW_HEADER_H + maxLanes * LANE_H + 8;

  // Compute bar segments per week row
  const segmentsByWeek = useMemo<BarSegment[][]>(() =>
    weeks.map((week) => {
      const weekStart = week[0];
      const weekEnd   = week[week.length - 1];
      const segs: BarSegment[] = [];
      for (const ev of events) {
        if (!ev.date_start) continue;
        const evEnd = ev.date_end ?? ev.date_start;
        if (ev.date_start > weekEnd || evEnd < weekStart) continue;
        // Map which weekday columns this event covers
        const covered = week.map((d) => d >= ev.date_start! && d <= evEnd);
        if (!covered.some(Boolean)) continue;
        segs.push({
          eventId: ev.id,
          colStart: covered.indexOf(true),
          colEnd:   covered.lastIndexOf(true),
          isContinuation: ev.date_start < weekStart,
          continuesNext:  evEnd > weekEnd,
        });
      }
      return segs;
    }),
    [weeks, events]
  );

  return (
    <div className="select-none">

      {/* Day-of-week header */}
      <div className="grid grid-cols-5 gap-px mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-condensed uppercase tracking-widest text-white/20 py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Week rows */}
      {weeks.map((week, wi) => {
        const segments = segmentsByWeek[wi] ?? [];
        return (
          <div
            key={week[0]}
            className="relative grid grid-cols-5 gap-px mb-px"
            style={{ minHeight: CELL_MIN_H }}
          >
            {/* ── Day cells ── */}
            {week.map((iso) => {
              const isToday     = iso === today;
              const holiday     = holidayMap.get(iso);
              const ptoDayList  = ptoMap.get(iso) ?? [];
              const isDropTarget = dropTargetKey === iso;
              return (
                <div
                  key={iso}
                  className={`relative border transition-colors ${
                    isToday
                      ? "bg-green-500/10 border-2 border-green-500"
                      : isDropTarget
                      ? "bg-white/5 border-white/25"
                      : "border-white/5"
                  }`}
                  style={{ minHeight: CELL_MIN_H }}
                  onDragOver={(e) => { if (draggingId) { e.preventDefault(); onDragOverCell(iso); } }}
                      onDrop={(e) => { e.preventDefault(); if (draggingId) onDrop(draggingId, iso); }}
                >
                  <div className="flex items-center gap-1.5 px-1.5 pt-1" style={{ height: ROW_HEADER_H }}>
                    <span className={`text-sm font-bold px-1.5 py-0.5 rounded leading-none ${isToday ? "bg-green-500 text-white" : "bg-white/20 text-white/90"}`}>
                      {iso.slice(8)}
                    </span>
                    {holiday && (
                      <span
                        className="text-[9px] font-condensed bg-yellow-400/15 text-yellow-300/80 rounded px-1 truncate max-w-[90px]"
                        title={holiday}
                      >
                        {holiday}
                      </span>
                    )}
                  {ptoDayList.map((p) => {
                    const crewIdx = crews.findIndex((c) => c.id === p.crew_id);
                    const crewCol = crewIdx === -1 ? UNASSIGNED_COLOR : CREW_PALETTE[crewIdx % CREW_PALETTE.length];
                    return (
                      <div
                        key={p.id}
                        className="mx-1 mb-0.5 rounded px-1.5 py-0.5 text-[8px] font-condensed uppercase tracking-widest truncate"
                        style={{ background: crewCol.bg, color: crewCol.text, borderLeft: `2px solid ${crewCol.bar}` }}
                        title={`PTO: ${p.crew_name}${p.note ? ` - ${p.note}` : ""}`}
                      >
                        {p.crew_name}
                      </div>
                    );
                  })}
                  </div>
                </div>
              );
            })}

            {/* Event bars (absolute positioned over the grid cells) */}
            {segments.map((seg) => {
              const ev = events.find((e) => e.id === seg.eventId);
              if (!ev) return null;
              const lane        = laneMap.get(ev.id) ?? 0;
              // Sub-contractor installs get purple; everything else uses event-type color
              const isDelivery  = ev.event_type === "cab_delivery" || ev.event_type === "top_delivery";
              const col         = (!isDelivery && ev.crew_kind === "sub")
                ? SUB_CREW_COLOR
                : eventTypeColor(ev.event_type);
              const colSpan     = seg.colEnd - seg.colStart + 1;
              const split       = splitLabels.get(ev.id);
              const jobNum     = ev.job_job_number ? `#${ev.job_job_number}` : null;
              const clientLabel = ev.job_client_name ?? ev.job_id;
              // For delivery bars: prepend job number; for install bars: name only
              const barLabel    = (isDelivery && jobNum)
                ? `${jobNum} · ${clientLabel}`
                : clientLabel;

              return (
                <div
                  key={`${seg.eventId}-${wi}`}
                  draggable={isAdmin}
                  onDragStart={(e) => { e.stopPropagation(); if (isAdmin) onDragStart(ev.id); }}
                  onDragEnd={onDragEnd}
                  onClick={(e) => { e.stopPropagation(); if (!draggingId) onEventClick(ev); }}
                  className={`absolute flex items-center overflow-hidden text-[9px] font-condensed ${
                    isAdmin ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                  }`}
                  style={{
                    top:        ROW_HEADER_H + lane * LANE_H + 1,
                    left:       `calc(${seg.colStart} / 5 * 100% + 1px)`,
                    width:      `calc(${colSpan} / 5 * 100% - 3px)`,
                    height:     LANE_H - 3,
                    background: col.bg,
                    borderLeft: `3px solid ${col.bar}`,
                    borderRadius: seg.isContinuation
                      ? "0 3px 3px 0"
                      : seg.continuesNext
                      ? "3px 0 0 3px"
                      : "3px",
                    color:       col.text,
                    paddingLeft:  5,
                    paddingRight: seg.continuesNext ? 2 : 4,
                    fontSize:     tvMode ? 18 : 13,
                    zIndex:       10 + lane,
                  }}
                  title={`${barLabel}: ${EVENT_TYPE_LABELS[ev.event_type]}${ev.description ? ` - ${ev.description}` : ""}${split ? ` [${split}]` : ""}`}
                >
                  {seg.isContinuation && (
                    <span className="mr-0.5 opacity-40 text-[8px]">&#8249;</span>
                  )}
                  <span className="truncate">
                    {EVENT_TYPE_ICON[ev.event_type]}{" "}
                    {/* Always show name — on continuations too so you can read it at the week boundary */}
                    {barLabel}
                    {/* Crew only on install-type events (not delivery) */}
                    {ev.crew_name && ev.event_type !== "cab_delivery" && ev.event_type !== "top_delivery" && (
                      <span className="opacity-70"> · {ev.crew_name}</span>
                    )}
                    {split && (
                      <span className="opacity-45"> [{split}]</span>
                    )}
                  </span>
                  {seg.continuesNext && (
                    <span className="ml-auto shrink-0 opacity-40 text-[8px] pl-0.5">&#8250;</span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
