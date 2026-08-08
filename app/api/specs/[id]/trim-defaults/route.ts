export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/auth";
import { sql } from "@/lib/db";

type TrimDefaultPayload = {
  id?: string;
  finish_group_id: string;
  trim_type: string;
  species_material: string | null;
  size_desc: string | null;
  notes: string | null;
  sort_order: number;
};

// GET: all trim defaults for all FGs in this spec
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardApi(["admin", "pm"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await params;
  try {
    const rows = await sql<TrimDefaultPayload[]>`
      SELECT td.*
      FROM finish_group_trim_defaults td
      JOIN finish_groups fg ON fg.id = td.finish_group_id
      WHERE fg.spec_id = ${id}
      ORDER BY td.finish_group_id, td.sort_order
    `;
    return NextResponse.json({ trim_defaults: rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST: body = { finish_group_id, trim_defaults: [...] } — delete + re-insert for that FG
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardApi(["admin", "pm"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await params;
  const body = await req.json() as { finish_group_id: string; trim_defaults: TrimDefaultPayload[] };
  const { finish_group_id, trim_defaults } = body;

  if (!finish_group_id) {
    return NextResponse.json({ error: "finish_group_id required" }, { status: 400 });
  }

  try {
    // Verify FG belongs to this spec
    const fg = await sql`SELECT id FROM finish_groups WHERE id = ${finish_group_id} AND spec_id = ${id}`;
    if (!fg.length) {
      return NextResponse.json({ error: "finish_group not found on this spec" }, { status: 404 });
    }

    await sql`DELETE FROM finish_group_trim_defaults WHERE finish_group_id = ${finish_group_id}`;

    for (let i = 0; i < (trim_defaults ?? []).length; i++) {
      const t = trim_defaults[i];
      const rowId = t.id || crypto.randomUUID();
      await sql`
        INSERT INTO finish_group_trim_defaults
          (id, finish_group_id, trim_type, species_material, size_desc, notes, sort_order)
        VALUES
          (${rowId}, ${finish_group_id}, ${t.trim_type || "Custom"},
           ${t.species_material || null}, ${t.size_desc || null},
           ${t.notes || null}, ${t.sort_order ?? i})
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
