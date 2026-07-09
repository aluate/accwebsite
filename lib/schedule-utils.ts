/**
 * lib/schedule-utils.ts
 * Working-day date arithmetic for the ACC schedule system.
 * Safe to import in both server components and client components —
 * no DB imports, no Node-only APIs.
 *
 * All dates are plain YYYY-MM-DD strings. No timezone conversion happens
 * here — dates are treated as calendar-day labels, consistent with how
 * they are stored in the DB and displayed on the wall TV.
 */

import { buildHolidaySet } from "@/lib/schedule-holidays";

// Default duration (working days) per event type.
export const DEFAULT_DURATION: Record<string, number> = {
  install:           3,
  service:           1,
  punch:             1,
  cab_delivery:      1,
  top_delivery:      1,
  final_walkthrough: 1,
};

// Hot event types — get orange/red stripe on calendar bar.
export const HOT_EVENT_TYPES = new Set(["service", "punch"]);

// ── Internal helpers ─────────────────────────────────────────────────────────

function addCalDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isWeekend(iso: string): boolean {
  const dow = new Date(iso + "T00:00:00Z").getUTCDay();
  return dow === 0 || dow === 6;
}

/** Get holiday set covering the year(s) spanned by a date range. */
function holidaySetFor(startIso: string, endIso: string): Set<string> {
  const y1 = parseInt(startIso.slice(0, 4), 10);
  const y2 = parseInt(endIso.slice(0, 4), 10);
  const years: number[] = [];
  for (let y = y1; y <= y2; y++) years.push(y);
  return buildHolidaySet(years);
}

function isNonWorkingDay(iso: string, holidays: Set<string>): boolean {
  return isWeekend(iso) || holidays.has(iso);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Given a start date, step forward by `durationDays` working days
 * (skipping weekends and observed holidays) and return the end date.
 *
 * durationDays = 1 → start === end (single-day event)
 * durationDays = 3 → Mon start → Wed end (Mon, Tue, Wed = 3 days)
 */
export function calculateEndDate(startIso: string, durationDays: number): string {
  if (durationDays <= 1) return startIso;

  // Build holiday set covering a generous window (start + 180 days)
  const windowEnd = addCalDays(startIso, 180);
  const holidays = holidaySetFor(startIso, windowEnd);

  let cur = startIso;
  let remaining = durationDays - 1; // start day counts as day 1
  let safety = 500;

  while (remaining > 0 && safety-- > 0) {
    cur = addCalDays(cur, 1);
    if (!isNonWorkingDay(cur, holidays)) remaining--;
  }

  return cur;
}

/**
 * Count the number of working days between startIso and endIso (inclusive).
 * Used to populate the duration field when loading an existing event.
 *
 * calculateDuration("2026-05-11", "2026-05-13") → 3 (Mon/Tue/Wed)
 */
export function calculateDuration(startIso: string, endIso: string): number {
  if (endIso < startIso) return 1;
  if (endIso === startIso) return 1;

  const holidays = holidaySetFor(startIso, endIso);
  let cur = startIso;
  let n = 0;

  while (cur <= endIso) {
    if (!isNonWorkingDay(cur, holidays)) n++;
    cur = addCalDays(cur, 1);
  }

  return Math.max(1, n);
}

/**
 * Advance a start date by `workingDays` working days (for drag-to-reschedule).
 * Unlike calculateEndDate, this counts the new start as day 0 and moves
 * forward by exactly `workingDays` working days, landing on a working day.
 *
 * addWorkingDays("2026-05-11", 2) → "2026-05-13" (Mon → Wed, skipping nothing)
 * addWorkingDays("2026-05-14", 3) → "2026-05-19" (Thu → Tue, skips Fri if holiday, Sat, Sun)
 */
export function addWorkingDays(startIso: string, workingDays: number): string {
  if (workingDays === 0) return startIso;
  const windowEnd = addCalDays(startIso, Math.abs(workingDays) * 3 + 30);
  const holidays = holidaySetFor(startIso, windowEnd);

  let cur = startIso;
  let remaining = Math.abs(workingDays);
  const step = workingDays > 0 ? 1 : -1;
  let safety = 500;

  while (remaining > 0 && safety-- > 0) {
    cur = addCalDays(cur, step);
    if (!isNonWorkingDay(cur, holidays)) remaining--;
  }

  return cur;
}
