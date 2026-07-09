export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

type PullPayload = {
  id?: string;
  description: string;
  part_no: string | null;
  finish_color: string | null;
  where_used: string | null;
  qty: number;
  sort_order: number;
};

// GET: returns all finish_group_pulls for all finish groups on this spec
// keyed by finish_group_id
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const rows = await sql<{ id: string; finish_group_id: string; description: string; part_no: string | null; finish_color: string | null; where_used: string | null; qty: number; sort_order: number }[]>`
      SELECT fgp.*
      FROM finish_group_pulls fgp
      JOIN finish_groups fg ON fg.id = fgp.finish_group_id
      WHERE fg.spec_id = ${id}
      ORDER BY fgp.finish_group_id, fgp.sort_order
    `;
    const keyed: Record<string, typeof rows> = {};
    for (const row of rows) {
      if (!keyed[row.finish_group_id]) keyed[row.finish_group_id] = [] as unknown as typeof rows;
      keyed[row.finish_group_id].push(row);
    }
    return NextResponse.json({ pulls: keyed });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST: body = { finish_group_id, pulls: [...] } — delete and re-insert
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json() as { finish_group_id: string; pulls: PullPayload[] };
  const { finish_group_id, pulls } = body;

  if (!finish_group_id) {
    return NextResponse.json({ error: "finish_group_id required" }, { status: 400 });
  }

  try {
    // Verify the finish group belongs to this spec
    const fg = await sql`SELECT id FROM finish_groups WHERE id = ${finish_group_id} AND spec_id = ${id}`;
    if (!fg.length) {
      return NextResponse.json({ error: "finish group not found on this spec" }, { status: 404 });
    }

    await sql`DELETE FROM finish_group_pulls WHERE finish_group_id = ${finish_group_id}`;

    for (let i = 0; i < (pulls ?? []).length; i++) {
      const p = pulls[i];
      const rowId = p.id || crypto.randomUUID();
      await sql`
        INSERT INTO finish_group_pulls
          (id, finish_group_id, description, part_no, finish_color, where_used, qty, sort_order)
        VALUES
          (${rowId}, ${finish_group_id}, ${p.description || ""},
           ${p.part_no || null}, ${p.finish_color || null},
           ${p.where_used || null}, ${p.qty ?? 0}, ${p.sort_order ?? i})
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
