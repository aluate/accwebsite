export const dynamic = "force-dynamic";

/**
 * Schedule events: collection endpoints.
 *
 *   POST /api/schedule/events  — create new event
 *   GET  /api/schedule/events  — list (filtered)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBuilder } from "@/lib/auth";
import {
  createEvent,
  forwardEvents,
  onDeckEvents,
  findCrewConflicts,
  findDeliveryConflicts,
  isEventType,
  isEventStatus,
  type JobEventWithJoins,
  type EventType,
  type EventStatus,
} from "@/lib/schedule";

type CreatePayload = {
  job_id: string;
  event_type: string;
  description?: string | null;
  date_start?: string | null;
  date_end?:   string | null;
  crew_id?:    string | null;
  crew_ids?:   string[];
  status?:     string;
  note?:       string | null;
  blocked_on?: string | null;
  parent_event_id?: string | null;
  duration_days?: number | null;
};

export async function GET(req: NextRequest) {
  await requireBuilder();
  const { searchParams } = new URL(req.url);
  const lane = searchParams.get("lane");
  const eventTypeRaw = searchParams.get("event_type");
  const eventType = eventTypeRaw && isEventType(eventTypeRaw) ? eventTypeRaw : undefined;
  const crewId = searchParams.get("crew_id") ?? undefined;

  if (lane === "on_deck") {
    return NextResponse.json({ events: await onDeckEvents({ eventType }) });
  }
  return NextResponse.json({ events: await forwardEvents({ eventType, crewId }) });
}

export async function POST(req: NextRequest) {
  const builder = await requireBuilder();
  const body = (await req.json()) as CreatePayload;

  if (!body.job_id)     return NextResponse.json({ error: "job_id required" }, { status: 400 });
  if (!body.event_type) return NextResponse.json({ error: "event_type required" }, { status: 400 });
  if (!isEventType(body.event_type))
    return NextResponse.json({ error: `Invalid event_type: ${body.event_type}` }, { status: 400 });
  if (body.status && !isEventStatus(body.status))
    return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 });

  const result = await createEvent({
    job_id:          body.job_id,
    event_type:      body.event_type as EventType,
    description:     body.description ?? null,
    date_start:      body.date_start ?? null,
    date_end:        body.date_end ?? null,
    crew_id:         body.crew_id ?? null,
    crew_ids:        body.crew_ids,
    status:          (body.status as EventStatus | undefined) ?? "scheduled",
    note:            body.note ?? null,
    blocked_on:      body.blocked_on ?? null,
    parent_event_id: body.parent_event_id,
    duration_days:   typeof body.duration_days === "number" ? body.duration_days : null,
    actor:           builder.username,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  const ev = result.event;
  const conflictMap = new Map<string, JobEventWithJoins>();

  // Crew conflicts (warn-but-allow)
  if (ev.date_start && ev.crew_ids.length > 0) {
    const groups = await Promise.all(
      ev.crew_ids.map((cid) =>
        findCrewConflicts({ crewId: cid, dateStart: ev.date_start!, dateEnd: ev.date_end, excludeEventId: ev.id })
      )
    );
    for (const g of groups) for (const c of g) conflictMap.set(c.id, c);
  }

  // Delivery conflicts (same-day)
  if (ev.date_start && (ev.event_type === "cab_delivery" || ev.event_type === "top_delivery")) {
    const dc = await findDeliveryConflicts(ev.date_start, ev.id);
    for (const c of dc) conflictMap.set(c.id, c);
  }

  return NextResponse.json({
    ok: true,
    event: ev,
    auto_linked_parent: result.auto_linked_parent,
    conflicts: Array.from(conflictMap.values()),
  });
}
