export const dynamic = "force-dynamic";

/**
 * GET /api/paint-colors?q=iron+ore&brand=BM
 * Returns up to 20 matches ordered by relevance (code match first, then name).
 * q searches name ILIKE '%q%' OR code ILIKE '%q%'
 * brand filter is optional (BM | SW | etc.)
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

type PaintColorRow = {
  brand: string;
  name: string;
  code: string;
  hex: string | null;
};

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q     = (searchParams.get("q") ?? "").trim();
  const brand = (searchParams.get("brand") ?? "").trim().toUpperCase();

  if (!q || q.length < 2) {
    return NextResponse.json({ colors: [] });
  }

  try {
    let rows: PaintColorRow[];

    if (brand) {
      rows = await sql<PaintColorRow[]>`
        SELECT brand, name, code, hex
        FROM paint_colors
        WHERE active = true
          AND brand = ${brand}
          AND (name ILIKE ${"%" + q + "%"} OR code ILIKE ${"%" + q + "%"})
        ORDER BY
          CASE WHEN code ILIKE ${q + "%"} THEN 0 ELSE 1 END,
          CASE WHEN name ILIKE ${q + "%"} THEN 0 ELSE 1 END,
          name
        LIMIT 20
      `;
    } else {
      rows = await sql<PaintColorRow[]>`
        SELECT brand, name, code, hex
        FROM paint_colors
        WHERE active = true
          AND (name ILIKE ${"%" + q + "%"} OR code ILIKE ${"%" + q + "%"})
        ORDER BY
          CASE WHEN code ILIKE ${q + "%"} THEN 0 ELSE 1 END,
          CASE WHEN name ILIKE ${q + "%"} THEN 0 ELSE 1 END,
          name
        LIMIT 20
      `;
    }

    return NextResponse.json({ colors: rows });
  } catch (e) {
    console.error("[paint-colors] query error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
