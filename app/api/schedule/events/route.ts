export const dynamic = "force-dynamic";

/**
 * Schedule events: collection endpoints.
 *
 *   POST /api/schedule/events  — create new event
 *   GET  /api/schedule/events  — list (filtered)
 *
 * Both wrap lib/schedule. POST returns conflicts[] for warn-but-allow so
 * the UI can surface "Crew X already booked" without blocking the save.
 * Date validation, role validation, FK checks, audit-log writes all live
 * in lib/schedule (single source of truth).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBuilder } from "@/lib/auth";
import {
  createEvent,
  forwardEvents,
  onDeckEvents,
  findCrewConflicts,
  isEventType,
  isEventStatus,
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
  status?:     string;
  note?:       string | null;
  blocked_on?: string | null;
  parent_event_id?: string | null;
};

export async function GET(req: NextRequest) {
  await requireBuilder();
  const { searchParams } = new URL(req.url);
  const lane = searchParams.get("lane");      // 'forward' | 'on_deck'
  const eventTypeRaw = searchParams.get("event_type");
  const eventType = eventTypeRaw && isEventType(eventTypeRaw) ? eventTypeRaw : undefined;
  const crewId = searchParams.get("crew_id") ?? undefined;

  if (lane === "on_deck") {
    return NextResponse.json({
      events: await onDeckEvents({ eventType }),
    });
  }
  return NextResponse.json({
    events: await forwardEvents({ eventType, crewId }),
  });
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
    status:          (body.status as EventStatus | undefined) ?? "scheduled",
    note:            body.note ?? null,
    blocked_on:      body.blocked_on ?? null,
    parent_event_id: body.parent_event_id,   // undefined = auto-link, null = explicit no-link
    actor:           builder.username,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  // Surface conflicts as warnings (not failures). UI displays them as
  // "Crew X already booked Job Y these days — continue?" before the user
  // commits the next move. Per Karl 2026-05-06: warn but allow.
  const conflicts =
    result.event.crew_id && result.event.date_start
      ? await findCrewConflicts({
          crewId:         result.event.crew_id,
          dateStart:      result.event.date_start,
          dateEnd:        result.event.date_end,
          excludeEventId: result.event.id,
        })
      : [];

  return NextResponse.json({
    ok: true,
    event: result.event,
    auto_linked_parent: result.auto_linked_parent,
  });
}
