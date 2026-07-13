export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; fgId: string }> }) {
  await requireRole("admin");
  const { fgId } = await params;
  const body = await req.json();
  await sql`
    UPDATE estimate_finish_groups SET
      name               = COALESCE(${body.name               ?? null}, name),
      finish_catalog_id  = COALESCE(${body.finish_catalog_id  ?? null}, finish_catalog_id),
      door_catalog_id    = COALESCE(${body.door_catalog_id    ?? null}, door_catalog_id),
      pull_catalog_id    = COALESCE(${body.pull_catalog_id    ?? null}, pull_catalog_id),
      carcass_catalog_id = COALESCE(${body.carcass_catalog_id ?? null}, carcass_catalog_id)
    WHERE id = ${fgId}
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; fgId: string }> }) {
  await requireRole("admin");
  const { fgId } = await params;
  await sql`DELETE FROM estimate_finish_groups WHERE id = ${fgId}`;
  return NextResponse.json({ ok: true });
}
