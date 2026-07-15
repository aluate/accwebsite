export const dynamic = "force-dynamic";

/**
 * CRUD for crew PTO / unavailability entries.
 * GET    /api/schedule/pto          — list all (admin) or active window (others)
 * POST   /api/schedule/pto          — create
 * DELETE /api/schedule/pto          — delete (body: { id })
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBuilder } from "@/lib/auth";
import { sql, uid } from "@/lib/db";
import type { CrewPto } from "@/lib/schedule-types";

export async function GET() {
  await requireBuilder();
  const rows = await sql<CrewPto[]>`
    SELECT p.*, c.name AS crew_name
    FROM crew_pto p
    JOIN crews c ON c.id = p.crew_id
    ORDER BY p.date_start DESC
  `;
  return NextResponse.json({ ok: true, pto: rows });
}

export async function POST(req: NextRequest) {
  const builder = await requireBuilder();
  if (builder.role !== "admin" && builder.role !== "karl") {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  const { crew_id, date_start, date_end, note } = (await req.json()) as {
    crew_id?: string; date_start?: string; date_end?: string; note?: string;
  };
  if (!crew_id)    return NextResponse.json({ ok: false, error: "crew_id required" }, { status: 400 });
  if (!date_start) return NextResponse.json({ ok: false, error: "date_start required" }, { status: 400 });
  if (!date_end)   return NextResponse.json({ ok: false, error: "date_end required" }, { status: 400 });
  if (date_end < date_start) return NextResponse.json({ ok: false, error: "date_end before date_start" }, { status: 400 });

  const id  = uid();
  const now = new Date().toISOString();
  await sql`
    INSERT INTO crew_pto (id, crew_id, date_start, date_end, note, created_by, created_at)
    VALUES (${id}, ${crew_id}, ${date_start}, ${date_end}, ${note ?? null}, ${builder.username}, ${now})
  `;
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest) {
  const builder = await requireBuilder();
  if (builder.role !== "admin" && builder.role !== "karl") {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }
  const { id } = (await req.json()) as { id?: string };
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  await sql`DELETE FROM crew_pto WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
