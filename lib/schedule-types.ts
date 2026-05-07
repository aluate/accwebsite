/**
 * Client-safe shared types, constants, and pure utilities for the schedule
 * dashboard. NO DB imports here — anything that touches the DB belongs
 * in lib/schedule.ts (server-only).
 *
 * Both server (lib/schedule.ts) and client (components/ScheduleWallClient,
 * AddEventForm, etc.) import from this file. lib/schedule.ts re-exports the
 * types and constants for back-compat with code that already imports from it.
 */

// ── Constants ───────────────────────────────────────────────────────────────

export const EVENT_TYPES = [
  "cab_delivery",
  "top_delivery",
  "install",
  "service",
  "punch",
  "final_walkthrough",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  cab_delivery:      "Cab Delivery",
  top_delivery:      "Top Delivery",
  install:           "Install",
  service:           "Service",
  punch:             "Punch",
  final_walkthrough: "Final Walkthrough",
};

export const EVENT_STATUSES = [
  "scheduled",
  "confirmed",
  "complete",
  "on_hold",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const CREW_KINDS = ["inhouse", "sub"] as const;
export type CrewKind = (typeof CREW_KINDS)[number];

export function isEventType(s: string): s is EventType {
  return (EVENT_TYPES as readonly string[]).includes(s);
}
export function isEventStatus(s: string): s is EventStatus {
  return (EVENT_STATUSES as readonly string[]).includes(s);
}
export function isCrewKind(s: string): s is CrewKind {
  return (CREW_KINDS as readonly string[]).includes(s);
}

// ── Row types (mirror table shape) ─────────────────────────────────────────

export type Crew = {
  id: string;
  name: string;
  kind: CrewKind;
  contact_phone: string | null;
  contact_email: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  created_by: string | null;
};

export type JobEvent = {
  id: string;
  job_id: string;
  event_type: EventType;
  description: string | null;
  date_start: string | null;
  date_end:   string | null;
  crew_id: string | null;
  status: EventStatus;
  note: string | null;
  blocked_on: string | null;
  parent_event_id: string | null;
  sort_order: number;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type JobEventWithJoins = JobEvent & {
  crew_name: string | null;
  crew_kind: CrewKind | null;
  job_client_name: string | null;
  job_site_address: string | null;
};

export type JobEventAuditRow = {
  id: string;
  event_id: string;
  job_id: string | null;
  action: "create" | "update" | "delete";
  before_json: string | null;
  after_json:  string | null;
  changed_at: string;
  changed_by: string | null;
};

// ── Pure date utilities (no DB) ────────────────────────────────────────────

/**
 * Add `days` to an ISO date string (YYYY-MM-DD) and return the new ISO date.
 * Stays in UTC to avoid DST drift on the wall TV which may run in a
 * different tz than the dev box.
 */
export function isoDateOffset(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Return the ISO Monday for the week containing the given date. Used by
 * the weekly verification flow + the wall calendar grid.
 */
export function isoWeekStart(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const day = d.getUTCDay();           // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
