export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireBuilder } from "@/lib/auth";
import { sql, uid } from "@/lib/db";
import type { EventPhaseLabel } from "@/lib/schedule-types";

import { guardCap } from "@/lib/permissions";
export async function GET() {
  await requireBuilder();
  const rows = await sql<EventPhaseLabel[]>`
    SELECT * FROM event_phase_labels WHERE active = 1 ORDER BY sort_order, label
  `;
  return NextResponse.json({ ok: true, labels: rows });
}

export async function POST(req: NextRequest) {
  /*
    Was requireBuilder() — signed in, and nothing else. The role matrix caught it
    on 2026-09-18: engineer, shop AND installer all created calendar events, none
    of whom hold schedule.edit. A 400 in that report meant the request got PAST
    the guard and only failed body validation.

    So anyone with a login could add, move or delete anything on the calendar.
    Nobody had, but this is the table the whole punch-to-installer flow is about
    to depend on.
  */
  const guard = await guardCap("schedule.admin");
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const builder = guard.session;
  /*
    A third and fourth copy of the undefined-`role` bug that 0056 fixed in
    /api/schedule/admin-queue and /api/schedule/change-requests: this line read
    `&& role !== "karl"`, and there is no `role` in scope. && short-circuits, so
    admins never evaluated it and it went unnoticed; everyone else got an
    unhandled ReferenceError where a clean 403 was intended.

    The hand-rolled check is gone entirely rather than repaired — guardCap above
    already answers the same question, from the capability map, and a route that
    asks twice is a route that can disagree with itself.
  */
  const { label, sort_order } = (await req.json()) as { label?: string; sort_order?: number };
  if (!label?.trim()) return NextResponse.json({ ok: false, error: "label required" }, { status: 400 });

  await sql`
    INSERT INTO event_phase_labels (label, sort_order)
    VALUES (${label.trim()}, ${sort_order ?? 99})
    ON CONFLICT (label) DO UPDATE SET active = 1, sort_order = EXCLUDED.sort_order
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  /*
    Was requireBuilder() — signed in, and nothing else. The role matrix caught it
    on 2026-09-18: engineer, shop AND installer all created calendar events, none
    of whom hold schedule.edit. A 400 in that report meant the request got PAST
    the guard and only failed body validation.

    So anyone with a login could add, move or delete anything on the calendar.
    Nobody had, but this is the table the whole punch-to-installer flow is about
    to depend on.
  */
  const guard = await guardCap("schedule.admin");
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const builder = guard.session;
  /*
    A third and fourth copy of the undefined-`role` bug that 0056 fixed in
    /api/schedule/admin-queue and /api/schedule/change-requests: this line read
    `&& role !== "karl"`, and there is no `role` in scope. && short-circuits, so
    admins never evaluated it and it went unnoticed; everyone else got an
    unhandled ReferenceError where a clean 403 was intended.

    The hand-rolled check is gone entirely rather than repaired — guardCap above
    already answers the same question, from the capability map, and a route that
    asks twice is a route that can disagree with itself.
  */
  const { id } = (await req.json()) as { id?: number };
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  await sql`UPDATE event_phase_labels SET active = 0 WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
