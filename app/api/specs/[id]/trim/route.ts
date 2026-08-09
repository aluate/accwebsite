export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/auth";
import { sql } from "@/lib/db";

type TrimPayload = {
  id?: string;
  trim_type: string;
  size_desc: string | null;
  material: string | null;
  qty_lf: number;
  notes: string | null;
  /**
   * 'fg_default' | 'manual'. Must survive this round trip: the route deletes and
   * re-inserts, so anything the payload omits reverts to the column default. Losing
   * it would silently mark every defaulted row as hand-typed, and the finish-group
   * swap would then leave stale trim behind on a room that changed finish.
   */
  source?: string | null;
  sort_order: number;
};

// GET: returns all room_trim for all rooms in this spec, keyed by room_id
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardApi(["admin", "pm"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await params;
  try {
    const rows = await sql<{ id: string; room_id: string; trim_type: string; size_desc: string | null; material: string | null; qty_lf: number; notes: string | null; sort_order: number; source: string }[]>`
      SELECT rt.*
      FROM room_trim rt
      JOIN rooms r ON r.id = rt.room_id
      WHERE r.spec_id = ${id}
      ORDER BY rt.room_id, rt.sort_order
    `;
    const keyed: Record<string, typeof rows> = {};
    for (const row of rows) {
      if (!keyed[row.room_id]) keyed[row.room_id] = [] as unknown as typeof rows;
      keyed[row.room_id].push(row);
    }
    return NextResponse.json({ trim: keyed });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST: body = { room_id, trim: [...] } — delete and re-insert for that room
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardApi(["admin", "pm"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await params;
  const body = await req.json() as { room_id: string; trim: TrimPayload[] };
  const { room_id, trim } = body;

  if (!room_id) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }

  try {
    // Verify the room belongs to this spec
    const room = await sql`SELECT id FROM rooms WHERE id = ${room_id} AND spec_id = ${id}`;
    if (!room.length) {
      return NextResponse.json({ error: "room not found on this spec" }, { status: 404 });
    }

    await sql`DELETE FROM room_trim WHERE room_id = ${room_id}`;

    for (let i = 0; i < (trim ?? []).length; i++) {
      const t = trim[i];
      const rowId = t.id || crypto.randomUUID();
      await sql`
        INSERT INTO room_trim
          (id, room_id, trim_type, size_desc, material, qty_lf, notes, sort_order, source)
        VALUES
          (${rowId}, ${room_id}, ${t.trim_type || "Other"},
           ${t.size_desc || null}, ${t.material || null},
           ${t.qty_lf ?? 0}, ${t.notes || null}, ${t.sort_order ?? i},
           ${t.source === "fg_default" ? "fg_default" : "manual"})
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
