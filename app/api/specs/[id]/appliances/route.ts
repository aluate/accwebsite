export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

type AppliancePayload = {
  id?: string;
  appliance_type: string;
  manufacturer: string | null;
  model_no: string | null;
  room_id: string | null;
  notes: string | null;
  cutout_w?: string | number | null;
  cutout_h?: string | number | null;
  cutout_d?: string | number | null;
  sort_order: number;
};

// GET: returns spec_appliances for this spec
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const rows = await sql`SELECT * FROM spec_appliances WHERE spec_id = ${id} ORDER BY sort_order`;
    return NextResponse.json({ appliances: rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST: body = { appliances: [...] } — full replace
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json() as { appliances: AppliancePayload[] };
  const { appliances } = body;

  try {
    await sql`DELETE FROM spec_appliances WHERE spec_id = ${id}`;

    for (let i = 0; i < (appliances ?? []).length; i++) {
      const a = appliances[i];
      const rowId = a.id || crypto.randomUUID();
      const cw = a.cutout_w ? parseFloat(String(a.cutout_w)) : null;
      const ch = a.cutout_h ? parseFloat(String(a.cutout_h)) : null;
      const cd = a.cutout_d ? parseFloat(String(a.cutout_d)) : null;
      await sql`
        INSERT INTO spec_appliances
          (id, spec_id, appliance_type, manufacturer, model_no, room_id, notes, cutout_w, cutout_h, cutout_d, sort_order)
        VALUES
          (${rowId}, ${id}, ${a.appliance_type || "Other"},
           ${a.manufacturer || null}, ${a.model_no || null},
           ${a.room_id || null}, ${a.notes || null},
           ${cw}, ${ch}, ${cd}, ${a.sort_order ?? i})
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
