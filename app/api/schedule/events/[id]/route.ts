export const dynamic = "force-dynamic";

/**
 * Single-event endpoints.
 *
 *   PATCH  /api/schedule/events/[id]  — partial update
 *   DELETE /api/schedule/events/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBuilder } from "@/lib/auth";
import { installDatePromptFor } from "@/lib/install-date";
import { guardCap } from "@/lib/permissions";
import {
  updateEvent,
  deleteEvent,
  isEventType,
  isEventStatus,
  type UpdateEventPatch,
  type EventType,
  type EventStatus,
} from "@/lib/schedule";

type PatchPayload = {
  event_type?: string;
  description?: string | null;
  date_start?: string | null;
  date_end?:   string | null;
  crew_id?:    string | null;
  crew_ids?:   string[];
  status?:     string;
  note?:       string | null;
  blocked_on?: string | null;
  parent_event_id?: string | null;
  sort_order?: number;
  duration_days?: number | null;
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  /*
    Was requireBuilder() — signed in, and nothing else. The role matrix caught it
    on 2026-09-18: engineer, shop AND installer all created calendar events, none
    of whom hold schedule.edit. A 400 in that report meant the request got PAST
    the guard and only failed body validation.

    So anyone with a login could add, move or delete anything on the calendar.
    Nobody had, but this is the table the whole punch-to-installer flow is about
    to depend on.
  */
  const guard = await guardCap("schedule.edit");
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const builder = guard.session;
  const { id } = await params;
  const body = (await req.json()) as PatchPayload;

  if (body.event_type !== undefined && !isEventType(body.event_type)) {
    return NextResponse.json({ ok: false, error: `Invalid event_type: ${body.event_type}` }, { status: 400 });
  }
  if (body.status !== undefined && !isEventStatus(body.status)) {
    return NextResponse.json({ ok: false, error: `Invalid status: ${body.status}` }, { status: 400 });
  }

  const patch: UpdateEventPatch = {};
  if (body.event_type !== undefined)      patch.event_type      = body.event_type as EventType;
  if (body.description !== undefined)     patch.description     = body.description;
  if (body.date_start !== undefined)      patch.date_start      = body.date_start;
  if (body.date_end !== undefined)        patch.date_end        = body.date_end;
  if (body.crew_id !== undefined)         patch.crew_id         = body.crew_id;
  if (body.crew_ids !== undefined)        patch.crew_ids        = body.crew_ids;
  if (body.status !== undefined)          patch.status          = body.status as EventStatus;
  if (body.note !== undefined)            patch.note            = body.note;
  if (body.blocked_on !== undefined)      patch.blocked_on      = body.blocked_on;
  if (body.parent_event_id !== undefined) patch.parent_event_id = body.parent_event_id;
  if (body.sort_order !== undefined)      patch.sort_order      = body.sort_order;

  const result = await updateEvent(id, patch, builder.username);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  // Moving an install on the calendar does not change the official date — the pipeline
  // owns that. It offers to. Only when this is the event the board reads and the two
  // actually disagree, because a prompt that fires when nothing has diverged teaches
  // people to dismiss prompts unread.
  let install_date_prompt = null;
  if (body.date_start !== undefined || body.date_end !== undefined || body.event_type !== undefined) {
    try {
      install_date_prompt = await installDatePromptFor(id);
    } catch {
      install_date_prompt = null;   // never fail a saved move over the prompt
    }
  }

  return NextResponse.json({
    ok: true,
    event: result.event,
    conflicts: result.conflicts ?? [],
    ...(install_date_prompt ? { install_date_prompt } : {}),
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  /*
    Was requireBuilder() — signed in, and nothing else. The role matrix caught it
    on 2026-09-18: engineer, shop AND installer all created calendar events, none
    of whom hold schedule.edit. A 400 in that report meant the request got PAST
    the guard and only failed body validation.

    So anyone with a login could add, move or delete anything on the calendar.
    Nobody had, but this is the table the whole punch-to-installer flow is about
    to depend on.
  */
  const guard = await guardCap("schedule.edit");
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const builder = guard.session;
  const { id } = await params;
  const result = await deleteEvent(id, builder.username);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
