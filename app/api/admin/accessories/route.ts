export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";

// GET /api/admin/accessories — all catalog items from DB
export async function GET(_req: NextRequest) {
  await requireRole("admin");
  const rows = await sql`SELECT * FROM accessories_catalog ORDER BY category, name`;
  return NextResponse.json({ items: rows });
}

// PATCH /api/admin/accessories — toggle active
// Body: { id: string, active: boolean }
export async function PATCH(req: NextRequest) {
  await requireRole("admin");
  const { id, active } = (await req.json()) as { id: string; active: boolean };
  if (!id || typeof active !== "boolean") {
    return NextResponse.json({ error: "id and active required" }, { status: 400 });
  }
  await sql`
    UPDATE accessories_catalog
    SET active = ${active}, updated_at = NOW()
    WHERE id = ${id}
  `;
  return NextResponse.json({ ok: true, id, active });
}

// PUT /api/admin/accessories — edit catalog fields (series, price, notes, name)
// Body: { id, name, series, price_slp, notes }
export async function PUT(req: NextRequest) {
  await requireRole("admin");
  const body = (await req.json()) as {
    id: string;
    name: string;
    series: string;
    price_slp: string;
    notes: string;
  };
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const price =
    body.price_slp != null && body.price_slp.trim() !== ""
      ? parseFloat(body.price_slp)
      : null;
  const priceDate =
    price != null ? new Date().toISOString().slice(0, 10) : null;

  await sql`
    UPDATE accessories_catalog SET
      name       = ${body.name},
      series     = ${body.series || null},
      price_slp  = ${price},
      price_date = ${priceDate},
      notes      = ${body.notes || null},
      updated_at = NOW()
    WHERE id = ${id}
  `;
  return NextResponse.json({ ok: true });
}
