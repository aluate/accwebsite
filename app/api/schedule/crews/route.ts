export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireBuilder } from "@/lib/auth";
import { listCrews, createCrew, updateCrew } from "@/lib/schedule";

// GET /api/schedule/crews — list all crews (active + inactive)
export async function GET() {
  await requireBuilder();
  const crews = await listCrews({ activeOnly: false });
  return NextResponse.json(crews);
}

// POST /api/schedule/crews — create crew
// body: { name, kind, contact_phone?, contact_email?, notes? }
export async function POST(req: NextRequest) {
  const session = await requireBuilder();
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
  const session = await requireBuilder();
  const { id, ...patch } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const result = await updateCrew(id, patch, session.name ?? session.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.crew);
}
