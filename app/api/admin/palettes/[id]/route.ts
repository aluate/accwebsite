export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  const [palette] = await sql`SELECT * FROM builder_palettes WHERE id = ${id}`;
  if (!palette) return NextResponse.json({ error: "not found" }, { status: 404 });
  const fgs = await sql`SELECT * FROM builder_palette_finish_groups WHERE palette_id = ${id}`;
  return NextResponse.json({ palette, finish_groups: fgs });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  const body = await req.json() as { builder_company?: string; palette_name?: string; finish_type?: string; notes?: string };
  const [palette] = await sql`
    UPDATE builder_palettes
    SET builder_company = COALESCE(${body.builder_company ?? null}, builder_company),
        palette_name = COALESCE(${body.palette_name ?? null}, palette_name),
        finish_type = COALESCE(${body.finish_type ?? null}, finish_type),
        notes = COALESCE(${body.notes ?? null}, notes)
    WHERE id = ${id} RETURNING *
  `;
  if (!palette) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ palette });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  await sql`DELETE FROM builder_palettes WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
