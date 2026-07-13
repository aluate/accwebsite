export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fgId: string; code: string }> }
) {
  const { fgId, code } = await params;
  const body = await req.json() as { edgeband_id?: string | null; where_used?: string | null; notes?: string | null };

  await sql`
    INSERT INTO finish_group_edgebands (id, finish_group_id, letter_code, edgeband_id, where_used, notes, sort_order)
    VALUES (
      ${uid()},
      ${fgId},
      ${code},
      ${body.edgeband_id ?? null},
      ${body.where_used ?? null},
      ${body.notes ?? null},
      (SELECT sort_order FROM catalog_edgeband_locations WHERE letter_code = ${code})
    )
    ON CONFLICT (finish_group_id, letter_code) DO UPDATE
    SET edgeband_id = EXCLUDED.edgeband_id,
        where_used  = EXCLUDED.where_used,
        notes       = EXCLUDED.notes
  `;

  return NextResponse.json({ ok: true });
}
