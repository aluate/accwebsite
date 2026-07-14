import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  await requireBuilder();
  const { searchParams } = new URL(req.url);
  const brand = searchParams.get("brand") ?? "";
  const code  = searchParams.get("code")  ?? "";
  if (!code) return NextResponse.json({ match: null });
  const rows = await sql<{ esi_part: string; esi_desc: string | null; notes: string | null }[]>`
    SELECT esi_part, esi_desc, notes FROM edgeband_matches
    WHERE paint_code = ${code} AND (${brand} = '' OR paint_brand = ${brand})
    LIMIT 1
  `;
  return NextResponse.json({ match: rows[0] ?? null });
}
