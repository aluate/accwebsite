import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [spec] = await sql`SELECT * FROM residential_specs WHERE id = ${id}`;
  if (!spec) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const finish_groups = await sql`
    SELECT * FROM finish_groups WHERE spec_id = ${id} ORDER BY sort_order
  `;

  const rooms = await sql`
    SELECT * FROM rooms WHERE spec_id = ${id} ORDER BY sort_order
  `;

  const roomIds = (rooms as { id: string }[]).map((r) => r.id);
  const accessories = roomIds.length
    ? await sql`SELECT * FROM room_accessories WHERE room_id IN ${sql(roomIds)}`
    : [];

  return NextResponse.json({ spec, finish_groups, rooms, accessories });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name, status } = await req.json();
  const now = new Date().toISOString();
  await sql`
    UPDATE residential_specs
    SET
      name = COALESCE(${name ?? null}, name),
      status = COALESCE(${status ?? null}, status),
      updated_at = ${now}
    WHERE id = ${id}
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await sql`DELETE FROM residential_specs WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
