import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

type Match = {
  id: string;
  paint_brand: string;
  paint_code: string;
  esi_part: string;
  esi_desc: string | null;
  notes: string | null;
  created_at: string;
};

export async function GET(_req: NextRequest) {
  await requireRole(["admin", "pm"]);
  const rows = await sql<Match[]>`
    SELECT id, paint_brand, paint_code, esi_part, esi_desc, notes, created_at
    FROM edgeband_matches ORDER BY paint_brand, paint_code
  `;
  return NextResponse.json({ matches: rows });
}

export async function POST(req: NextRequest) {
  await requireRole(["admin", "pm"]);
  const body = await req.json() as { paint_brand: string; paint_code: string; esi_part: string; esi_desc?: string; notes?: string };
  const { paint_brand, paint_code, esi_part, esi_desc, notes } = body;
  if (!paint_brand || !paint_code || !esi_part)
    return NextResponse.json({ error: "paint_brand, paint_code, esi_part required" }, { status: 400 });
  const id = uid();
  await sql`
    INSERT INTO edgeband_matches (id, paint_brand, paint_code, esi_part, esi_desc, notes)
    VALUES (${id}, ${paint_brand}, ${paint_code}, ${esi_part}, ${esi_desc || null}, ${notes || null})
    ON CONFLICT (paint_brand, paint_code) DO UPDATE
      SET esi_part = EXCLUDED.esi_part, esi_desc = EXCLUDED.esi_desc, notes = EXCLUDED.notes
  `;
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest) {
  await requireRole(["admin"]);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await sql`DELETE FROM edgeband_matches WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
