export const dynamic = "force-dynamic";

/**
 * Single-event endpoints.
 *
 *   PATCH  /api/schedule/events/[id]  — partial update (drag-to-reschedule, edit modal)
 *   DELETE /api/schedule/events/[id]
 *
 * Wraps lib/schedule.updateEvent and deleteEvent. Both write to the audit
 * log automatically. PATCH returns conflicts[] for warn-but-allow when the
 * new shape collides with another crew booking.
 *
 * Common drag-to-reschedule payloads:
 *   PATCH /api/schedule/events/abc123 { date_start: "2026-05-12" }
 *   PATCH /api/schedule/events/abc123 { date_start: null }            // → on deck
 *   PATCH /api/schedule/events/abc123 { crew_id: "kxz123" }           // reassign
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBuilder } from "@/lib/auth";
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
  status?:     string;
  note?:       string | null;
  blocked_on?: string | null;
  parent_event_id?: string | null;
  sort_order?: number;
  duration_days?: number | null;
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const builder = await requireBuilder();
  const { id } = await params;
  const body = (await req.json()) as PatchPayload;

  // Validate enum-typed fields up front.
  if (body.event_type !== undefined && !isEventType(body.event_type)) {
    return NextResponse.json({ ok: false, error: `Invalid event_type: ${body.event_type}` }, { status: 400 });
  }
  if (body.status !== undefined && !isEventStatus(body.status)) {
    return NextResponse.json({ ok: false, error: `Invalid status: ${body.status}` }, { status: 400 });
  }

  // Build the patch — only include fields the client actually sent so we
  // don't overwrite untouched columns with undefined.
  const patch: UpdateEventPatch = {};
  if (body.event_type !== undefined)      patch.event_type      = body.event_type as EventType;
  if (body.description !== undefined)     patch.description     = body.description;
  if (body.date_start !== undefined)      patch.date_start      = body.date_start;
  if (body.date_end !== undefined)        patch.date_end        = body.date_end;
  if (body.crew_id !== undefined)         patch.crew_id         = body.crew_id;
  if (body.status !== undefined)          patch.status          = body.status as EventStatus;
  if (body.note !== undefined)            patch.note            = body.note;
  if (body.blocked_on !== undefined)      patch.blocked_on      = body.blocked_on;
  if (body.parent_event_id !== undefined) patch.parent_event_id = body.parent_event_id;
  if (body.sort_order !== undefined)      patch.sort_order      = body.sort_order;

  const result = await updateEvent(id, patch, builder.username);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    event: result.event,
    conflicts: result.conflicts ?? [],
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const builder = await requireBuilder();
  const { id } = await params;
  const result = await deleteEvent(id, builder.username);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
