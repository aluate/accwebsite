export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireBuilder } from "@/lib/auth";
import { listCrews, createCrew, updateCrew } from "@/lib/schedule";

import { guardCap } from "@/lib/permissions";
// GET /api/schedule/crews — list all crews (active + inactive)
export async function GET() {
  await requireBuilder();
  const crews = await listCrews({ activeOnly: false });
  return NextResponse.json(crews);
}

// POST /api/schedule/crews — create crew
// body: { name, kind, contact_phone?, contact_email?, notes? }
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
  const session = guard.session;
  const { name, kind, contact_phone, contact_email, notes } = await req.json();
  const result = await createCrew({
    name, kind,
    contact_phone: contact_phone || null,
    contact_email: contact_email || null,
    notes: notes || null,
    actor: session.name ?? session.id,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.crew, { status: 201 });
}

// PATCH /api/schedule/crews — update crew
// body: { id, name?, kind?, contact_phone?, contact_email?, active?, notes? }
export async function PATCH(req: NextRequest) {
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
  const session = guard.session;
  const { id, ...patch } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const result = await updateCrew(id, patch, session.name ?? session.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.crew);
}
