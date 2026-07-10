/**
 * Client-safe shared types, constants, and pure utilities for the schedule
 * dashboard. NO DB imports here — anything that touches the DB belongs
 * in lib/schedule.ts (server-only).
 */

export const EVENT_TYPES = [
  "cab_delivery",
  "top_delivery",
  "install",
  "service",
  "punch",
  "final_walkthrough",
  "other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  cab_delivery:      "Cab Delivery",
  top_delivery:      "Top Delivery",
  install:           "Install",
  service:           "Service",
  punch:             "Punch",
  final_walkthrough: "Final Walkthrough",
  other:             "Other / Custom",
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
  actual_start?: string | null;
  actual_end?:   string | null;
};

export type JobEventWithJoins = JobEvent & {
  crew_name: string | null;
  crew_kind: CrewKind | null;
  job_client_name: string | null;
  job_site_address: string | null;
  job_job_number: string | null;
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

export type CrewPto = {
  id: string;
  crew_id: string;
  date_start: string;
  date_end: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type EventPhaseLabel = {
  id: number;
  label: string;
  sort_order: number;
  active: number;
};

export type ScheduleChangeRequest = {
  id: string;
  job_event_id: string;
  requested_by: string;
  reason: string;
  status: "pending" | "approved" | "denied";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export function isoDateOffset(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isoWeekStart(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
