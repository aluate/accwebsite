export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireRole("admin");
  const { id: estimate_id } = await params;
  const body = await req.json();

  const roomId = uid();
  const maxSort = await sql`
    SELECT COALESCE(MAX(sort_order), -1) AS max_sort
    FROM estimate_rooms WHERE estimate_id = ${estimate_id}
  `;

  await sql`
    INSERT INTO estimate_rooms (id, estimate_id, name, sort_order)
    VALUES (
      ${roomId}, ${estimate_id},
      ${body.name ?? "New Room"},
      ${(maxSort[0].max_sort as number) + 1}
    )
  `;

  return NextResponse.json({ id: roomId }, { status: 201 });
}
