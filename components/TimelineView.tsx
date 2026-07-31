"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TimelineJob, TimelineEvent } from "@/app/api/schedule/timeline/route";

// ── Types ─────────────────────────────────────────────────────────────────────

type TimelineData = {
  jobs: TimelineJob[];
  events: TimelineEvent[];
  today: string;
};

/** A normalized displayable span with resolved start/end dates */
type Span = {
  id: string;
  label: string;        // "#12345 · Client"
  sublabel?: string;    // city or address
  type: "delivery" | "install_estimate" | "confirmed";
  event_type?: string;  // for confirmed events
  date_start: string;
  date_end: string;
  jobId: string;
  isEstimate: boolean;
  note?: string | null;
};

// ── Color helpers ─────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<string, { bg: string; bar: string; text: string }> = {
  cab_delivery:      { bg: "rgba(96,165,250,0.25)",  bar: "#60a5fa", text: "#93c5fd" },
  top_delivery:      { bg: "rgba(34,211,238,0.22)",  bar: "#22d3ee", text: "#67e8f9" },
  install:           { bg: "rgba(249,115,22,0.25)",  bar: "#f97316", text: "#fb923c" },
  service:           { bg: "rgba(250,204,21,0.22)",  bar: "#facc15", text: "#fde047" },
  punch:             { bg: "rgba(251,113,133,0.22)", bar: "#fb7185", text: "#fda4af" },
  final_walkthrough: { bg: "rgba(74,222,128,0.22)",  bar: "#4ade80", text: "#86efac" },
  other:             { bg: "rgba(148,163,184,0.18)", bar: "#94a3b8", text: "#cbd5e1" },
};

const ESTIMATE_INSTALL_COLOR = { bg: "rgba(249,115,22,0.12)", bar: "#f97316", text: "#fb923c" };
const ESTIMATE_DELIVERY_COLOR = { bg: "rgba(96,165,250,0.15)", bar: "#60a5fa", text: "#93c5fd" };

function spanColor(span: Span) {
  if (span.type === "install_estimate") return ESTIMATE_INSTALL_COLOR;
  if (span.type === "delivery")         return ESTIMATE_DELIVERY_COLOR;
  return EVENT_COLORS[span.event_type ?? "other"] ?? EVENT_COLORS.other;
}

// ── Date math ─────────────────────────────────────────────────────────────────

/** Monday of the week containing `isoDate` */
function weekMonday(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  const dow = d.getDay(); // 0=Sun
  const toMon = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + toMon);
  return d.toISOString().slice(0, 10);
}

/** Add `n` days to an ISO date string */
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Return [Mon, Tue, Wed, Thu, Fri, Sat] ISO dates for a week starting on `monIso` */
function weekDays(monIso: string): string[] {
  return Array.from({ length: 6 }, (_, i) => addDays(monIso, i));
}

/** Generate week-start (Monday) ISO dates, weeksBack before today's week, weeksForward after */
function generateWeeks(todayIso: string, weeksBack: number, weeksForward: number): string[] {
  const mon = weekMonday(todayIso);
  const weeks: string[] = [];
  for (let i = -weeksBack; i <= weeksForward; i++) {
    weeks.push(addDays(mon, i * 7));
  }
  return weeks;
}

/** Format "Jul 28 – Aug 2" */
function formatWeekRange(monIso: string): string {
  const days = weekDays(monIso);
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(days[0])} – ${fmt(days[5])}`;
}

function formatMonthYear(monIso: string): string {
  return new Date(monIso + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// ── Span building ─────────────────────────────────────────────────────────────

const CREW_DAYS = 2;
const HRS_PER_DAY = 8;
const INSTALL_CREW_CAPACITY = CREW_DAYS * HRS_PER_DAY; // 16 hrs/day

function buildSpans(data: TimelineData): Span[] {
  const spans: Span[] = [];

  // From pipeline jobs: delivery marker + install estimate
  for (const job of data.jobs) {
    const label = [job.job_number ? `#${job.job_number}` : null, job.client_name]
      .filter(Boolean).join(" · ");
    const sublabel = job.city || job.site_address;

    if (job.delivery_date) {
      spans.push({
        id: `del-${job.id}`,
        label,
        sublabel,
        type: "delivery",
        date_start: job.delivery_date,
        date_end: job.delivery_date,
        jobId: job.id,
        isEstimate: true,
      });
    }

    if (job.install_start_date && job.install_hrs && job.install_hrs > 0) {
      const days = Math.max(1, Math.ceil(job.install_hrs / INSTALL_CREW_CAPACITY));
      const dateEnd = addDays(job.install_start_date, days - 1);
      spans.push({
        id: `est-${job.id}`,
        label,
        sublabel,
        type: "install_estimate",
        date_start: job.install_start_date,
        date_end: dateEnd,
        jobId: job.id,
        isEstimate: true,
      });
    }
  }

  // Confirmed schedule events
  for (const ev of data.events) {
    if (!ev.date_start) continue;
    const label = [ev.job_number ? `#${ev.job_number}` : null, ev.client_name]
      .filter(Boolean).join(" · ");
    spans.push({
      id: `ev-${ev.id}`,
      label,
      type: "confirmed",
      event_type: ev.event_type,
      date_start: ev.date_start,
      date_end: ev.date_end ?? ev.date_start,
      jobId: ev.job_id,
      isEstimate: false,
      note: ev.note,
    });
  }

  return spans;
}

// ── Conflict detection ────────────────────────────────────────────────────────

type ConflictMap = Map<string, { deliveries: number; installs: number }>;

function buildConflictMap(spans: Span[], weekRange: { start: string; end: string }): ConflictMap {
  const map: ConflictMap = new Map();

  function inc(date: string, key: "deliveries" | "installs") {
    if (date < weekRange.start || date > weekRange.end) return;
    const cur = map.get(date) ?? { deliveries: 0, installs: 0 };
    cur[key]++;
    map.set(date, cur);
  }

  for (const span of spans) {
    const isDelivery = span.type === "delivery" ||
      span.event_type === "cab_delivery" || span.event_type === "top_delivery";
    const isInstall = span.type === "install_estimate" ||
      span.event_type === "install" || span.event_type === "service" || span.event_type === "punch";

    if (!isDelivery && !isInstall) continue;

    let d = span.date_start;
    while (d <= span.date_end) {
      if (isDelivery) inc(d, "deliveries");
      if (isInstall)  inc(d, "installs");
      d = addDays(d, 1);
    }
  }

  return map;
}

// ── Lane assignment per week ──────────────────────────────────────────────────

function assignWeekLanes(
  clipped: Array<{ id: string; colStart: number; colEnd: number }>
): Map<string, number> {
  const laneMap = new Map<string, number>();
  const laneEnds: number[] = [];

  for (const item of clipped.sort((a, b) => a.colStart - b.colStart)) {
    let lane = laneEnds.findIndex((end) => end < item.colStart);
    if (lane === -1) lane = laneEnds.length;
    laneMap.set(item.id, lane);
    laneEnds[lane] = item.colEnd;
  }

  return laneMap;
}

// ── WeekRow ───────────────────────────────────────────────────────────────────

type WeekRowProps = {
  monIso: string;
  todayIso: string;
  spans: Span[];
  conflictMap: ConflictMap;
  isFirstOfMonth: boolean;
  todayRef: React.RefObject<HTMLDivElement | null>;
  onSpanClick: (span: Span) => void;
};

function WeekRow({ monIso, todayIso, spans, conflictMap, isFirstOfMonth, todayRef, onSpanClick }: WeekRowProps) {
  const days = weekDays(monIso);
  const weekEnd = days[5];
  const isCurrentWeek = monIso <= todayIso && todayIso <= weekEnd;

  // Filter spans overlapping this week
  const weekSpans = spans.filter(
    (s) => s.date_start <= weekEnd && s.date_end >= monIso
  );

  // Clip each span to week boundaries and compute grid columns (1-6)
  const clipped = weekSpans
    .map((s) => {
      const clippedStart = s.date_start < monIso ? monIso : s.date_start;
      const clippedEnd   = s.date_end   > weekEnd ? weekEnd : s.date_end;
      const colStart = days.indexOf(clippedStart) + 1;
      const colEnd   = days.indexOf(clippedEnd)   + 1;
      if (colStart < 1 || colEnd < 1) return null;
      return { id: s.id, colStart, colEnd, span: s };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Separate deliveries (row 0) from bars (lanes 1+)
  const deliveryItems = clipped.filter(
    (c) => c.span.type === "delivery" ||
      c.span.event_type === "cab_delivery" || c.span.event_type === "top_delivery"
  );
  const barItems = clipped.filter((c) => !deliveryItems.includes(c));

  const laneMap = assignWeekLanes(barItems.map((c) => ({
    id: c.id, colStart: c.colStart, colEnd: c.colEnd
  })));
  const maxLane = barItems.length === 0 ? -1 : Math.max(...barItems.map((c) => laneMap.get(c.id) ?? 0));
  const barZoneHeight = (maxLane + 1) * 28 + 4; // 28px per lane

  return (
    <div ref={isCurrentWeek ? todayRef : undefined}>
      {isFirstOfMonth && (
        <div className="px-3 py-1 bg-white/5 border-b border-white/10">
          <span className="font-condensed uppercase tracking-widest text-[10px] text-white/40">
            {formatMonthYear(monIso)}
          </span>
        </div>
      )}
      <div
        className={`border-b border-white/5 ${isCurrentWeek ? "bg-[#f08122]/5 border-l-2 border-l-[#f08122]/60" : ""}`}
      >
        {/* Week label row */}
        <div className="grid pl-[80px]" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
          {/* Week label overlaid on left */}
          <div className="col-span-6 relative h-0">
            <span
              className="absolute left-[-80px] top-1 font-condensed text-[10px] text-white/30 uppercase tracking-wider w-[76px] text-right pr-2"
              style={{ lineHeight: "1.2" }}
            >
              {formatWeekRange(monIso)}
            </span>
          </div>

          {/* Day cells — delivery row */}
          {days.map((day) => {
            const conflicts = conflictMap.get(day);
            const deliveriesHere = deliveryItems.filter((c) => {
              const clippedStart = c.span.date_start < monIso ? monIso : c.span.date_start;
              return clippedStart === day;
            });
            const isToday = day === todayIso;
            const isSat   = new Date(day + "T00:00:00").getDay() === 6;
            const hasDeliveryConflict = (conflicts?.deliveries ?? 0) >= 2;
            const hasInstallConflict  = (conflicts?.installs  ?? 0) >= 2;

            return (
              <div
                key={day}
                className={`relative min-h-[32px] border-r border-white/5 px-1 pt-1 ${
                  isSat ? "bg-white/[0.02]" : ""
                } ${isToday ? "bg-[#f08122]/8" : ""}`}
              >
                {/* Day number */}
                <span className={`text-[10px] font-condensed tabular-nums ${
                  isToday ? "text-[#f08122] font-bold" : "text-white/20"
                }`}>
                  {new Date(day + "T00:00:00").getDate()}
                </span>

                {/* Conflict badge */}
                {(hasDeliveryConflict || hasInstallConflict) && (
                  <span
                    className="absolute top-0.5 right-0.5 text-[8px] font-bold px-0.5 rounded"
                    style={{
                      background: hasInstallConflict ? "rgba(239,68,68,0.3)" : "rgba(251,146,60,0.3)",
                      color: hasInstallConflict ? "#fca5a5" : "#fdba74",
                    }}
                    title={
                      hasInstallConflict
                        ? `${conflicts?.installs} overlapping installs`
                        : `${conflicts?.deliveries} deliveries this day`
                    }
                  >
                    ⚠
                  </span>
                )}

                {/* Delivery pills (stacked vertically in the cell) */}
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {deliveriesHere.map(({ span }) => {
                    const col = spanColor(span);
                    return (
                      <button
                        key={span.id}
                        onClick={() => onSpanClick(span)}
                        className="w-full text-left rounded px-1 truncate"
                        style={{
                          background: col.bg,
                          borderLeft: `2px solid ${col.bar}`,
                          color: col.text,
                          fontSize: "9px",
                          lineHeight: "16px",
                        }}
                        title={span.label}
                      >
                        📦 {span.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bar zone: install estimates + confirmed events */}
        {barItems.length > 0 && (
          <div
            className="relative pl-[80px]"
            style={{ height: barZoneHeight }}
          >
            <div
              className="grid h-full"
              style={{ gridTemplateColumns: "repeat(6, 1fr)" }}
            >
              {/* Invisible grid cells for sizing */}
              {days.map((d) => <div key={d} />)}
            </div>

            {/* Bars positioned absolutely */}
            {barItems.map(({ id, colStart, colEnd, span }) => {
              const lane = laneMap.get(id) ?? 0;
              const col  = spanColor(span);
              const isEstimate = span.isEstimate;
              const continuesBefore = span.date_start < monIso;
              const continuesAfter  = span.date_end   > weekEnd;

              return (
                <button
                  key={id}
                  onClick={() => onSpanClick(span)}
                  title={[span.label, span.sublabel, span.note].filter(Boolean).join(" · ")}
                  className="absolute transition-opacity hover:opacity-80 active:opacity-60"
                  style={{
                    top: lane * 28 + 2,
                    height: 24,
                    left: `calc(${(colStart - 1) / 6 * 100}%)`,
                    width: `calc(${(colEnd - colStart + 1) / 6 * 100}%)`,
                    paddingLeft: continuesBefore ? 0 : 4,
                    paddingRight: continuesAfter ? 0 : 4,
                  }}
                >
                  <div
                    className="h-full w-full flex items-center px-1.5 overflow-hidden"
                    style={{
                      background: col.bg,
                      border: isEstimate
                        ? `1px dashed ${col.bar}55`
                        : `1px solid ${col.bar}44`,
                      borderLeft: continuesBefore ? "none" : `3px solid ${col.bar}`,
                      borderRight: continuesAfter ? "none" : undefined,
                      borderRadius: continuesBefore
                        ? (continuesAfter ? "0" : "0 3px 3px 0")
                        : (continuesAfter ? "3px 0 0 3px" : "3px"),
                    }}
                  >
                    <span
                      className="truncate font-condensed"
                      style={{ color: col.text, fontSize: "10px" }}
                    >
                      {isEstimate ? "~" : ""}{span.label}
                      {span.sublabel ? ` · ${span.sublabel}` : ""}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Detail popup ──────────────────────────────────────────────────────────────

function SpanDetail({ span, onClose }: { span: Span; onClose: () => void }) {
  const col = spanColor(span);
  const label = span.type === "install_estimate"
    ? "Install Estimate"
    : span.type === "delivery"
    ? "Delivery"
    : span.event_type ?? "Event";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#1a1a1a] border border-white/10 rounded-lg p-5 w-80 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <span
              className="text-[10px] font-condensed uppercase tracking-widest px-2 py-0.5 rounded"
              style={{ background: col.bg, color: col.text }}
            >
              {label}{span.isEstimate ? " (estimate)" : ""}
            </span>
            <p className="text-white font-condensed text-base mt-2">{span.label}</p>
            {span.sublabel && (
              <p className="text-white/40 text-xs mt-0.5">{span.sublabel}</p>
            )}
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white ml-2 text-lg leading-none">×</button>
        </div>

        <div className="text-white/50 text-xs space-y-1">
          <div>Start: <span className="text-white/80">{span.date_start}</span></div>
          {span.date_end !== span.date_start && (
            <div>End: <span className="text-white/80">{span.date_end}</span></div>
          )}
          {span.note && (
            <div className="mt-2 p-2 bg-[#f08122]/10 rounded border border-[#f08122]/20 text-[#fb923c]">
              {span.note}
            </div>
          )}
        </div>

        <a
          href={`/jobs/${span.jobId}`}
          className="mt-4 flex items-center justify-center gap-2 w-full bg-white/5 hover:bg-white/10 text-white/70 font-condensed uppercase tracking-widest text-xs px-3 py-2 rounded transition-colors"
        >
          Open Job →
        </a>
      </div>
    </div>
  );
}

// ── Main TimelineView ─────────────────────────────────────────────────────────

export function TimelineView({ today }: { today: string }) {
  const [data, setData]       = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [detail, setDetail]   = useState<Span | null>(null);
  const todayRef = useRef<HTMLDivElement | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/schedule/timeline")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Scroll today into view after first data load
  useEffect(() => {
    if (data && todayRef.current) {
      setTimeout(() => {
        todayRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [data]);

  // 26 weeks back, 65 forward (91 weeks total ≈ 21 months)
  const weeks = useMemo(() => generateWeeks(today, 26, 65), [today]);

  const spans = useMemo(() => (data ? buildSpans(data) : []), [data]);

  const conflictMap = useMemo(() => {
    if (!weeks.length) return new Map<string, { deliveries: number; installs: number }>();
    const start = weeks[0];
    const end   = addDays(weeks[weeks.length - 1], 6);
    return buildConflictMap(spans, { start, end });
  }, [spans, weeks]);

  // Track which week starts each month (for month dividers)
  const firstOfMonthWeeks = useMemo(() => {
    const seen = new Set<string>();
    return new Set(
      weeks.filter((mon) => {
        const ym = mon.slice(0, 7);
        if (seen.has(ym)) return false;
        seen.add(ym);
        return true;
      })
    );
  }, [weeks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-white/30 font-condensed uppercase tracking-widest text-xs animate-pulse">
          Loading timeline…
        </span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-white/30 text-sm font-condensed">Couldn&apos;t load timeline data.</p>
        <button
          onClick={fetchData}
          className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded"
        >
          Retry
        </button>
      </div>
    );
  }

  // Conflict summary for legend
  const totalDeliveryConflicts = Array.from(conflictMap.values()).filter((v) => v.deliveries >= 2).length;
  const totalInstallConflicts  = Array.from(conflictMap.values()).filter((v) => v.installs  >= 2).length;

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 64px)" }}>
      {/* Sub-header: legend + conflict summary */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-[#0d0d0d] flex-shrink-0">
        <div className="flex items-center gap-4 text-[10px] font-condensed text-white/40">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-8 h-3 rounded" style={{ background: "rgba(96,165,250,0.25)", border: "1px dashed #60a5fa" }} />
            Delivery
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-8 h-3 rounded" style={{ background: "rgba(249,115,22,0.12)", border: "1px dashed #f97316" }} />
            Install (est.)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-8 h-3 rounded" style={{ background: "rgba(249,115,22,0.25)", border: "1px solid #f97316" }} />
            Confirmed
          </span>
        </div>

        <div className="flex items-center gap-3 text-[10px] font-condensed">
          {totalDeliveryConflicts > 0 && (
            <span className="px-2 py-0.5 rounded" style={{ background: "rgba(251,146,60,0.2)", color: "#fdba74" }}>
              ⚠ {totalDeliveryConflicts} delivery conflict{totalDeliveryConflicts !== 1 ? "s" : ""}
            </span>
          )}
          {totalInstallConflicts > 0 && (
            <span className="px-2 py-0.5 rounded" style={{ background: "rgba(239,68,68,0.2)", color: "#fca5a5" }}>
              ⚠ {totalInstallConflicts} install conflict{totalInstallConflicts !== 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={() => todayRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
            className="px-2 py-0.5 rounded border border-white/15 text-white/40 hover:text-white/80 hover:border-white/30 transition-colors"
          >
            Today
          </button>
        </div>
      </div>

      {/* Sticky day-of-week header */}
      <div className="flex-shrink-0 border-b border-white/10 bg-[#111] sticky top-0 z-10">
        <div className="grid pl-[80px]" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center py-1.5 text-[10px] font-condensed uppercase tracking-widest text-white/30 border-r border-white/5">
              {d}
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable week rows */}
      <div className="flex-1 overflow-y-auto">
        {weeks.map((mon) => (
          <WeekRow
            key={mon}
            monIso={mon}
            todayIso={today}
            spans={spans}
            conflictMap={conflictMap}
            isFirstOfMonth={firstOfMonthWeeks.has(mon)}
            todayRef={todayRef}
            onSpanClick={setDetail}
          />
        ))}
      </div>

      {/* Detail popup */}
      {detail && <SpanDetail span={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
