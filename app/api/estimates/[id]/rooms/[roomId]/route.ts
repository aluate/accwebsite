export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  await requireRole("admin");
  const { roomId } = await params;
  const body = await req.json();

  await sql`
    UPDATE estimate_rooms SET
      name = COALESCE(${body.name ?? null}, name),
      sort_order = COALESCE(${body.sort_order ?? null}, sort_order)
    WHERE id = ${roomId}
  `;

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> }
) {
  await requireRole("admin");
  const { roomId } = await params;
  await sql`DELETE FROM estimate_rooms WHERE id = ${roomId}`;
  return NextResponse.json({ ok: true });
}
