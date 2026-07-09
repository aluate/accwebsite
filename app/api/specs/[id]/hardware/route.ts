export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";

type HardwarePayload = {
  type: string;
  part_no: string | null;
  room: string | null;
  qty: number;
  notes: string | null;
};

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS spec_hardware (
      id          TEXT PRIMARY KEY,
      spec_id     TEXT NOT NULL REFERENCES residential_specs(id) ON DELETE CASCADE,
      type        TEXT NOT NULL,
      part_no     TEXT,
      room        TEXT,
      qty         INTEGER NOT NULL DEFAULT 1,
      notes       TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 0
    )
  `.catch(() => {});
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: specId } = await params;
  const [spec] = await sql`SELECT id FROM residential_specs WHERE id = ${specId}`;
  if (!spec) return NextResponse.json({ error: "Spec not found" }, { status: 404 });
  await ensureTable();
  const rows = await sql`SELECT * FROM spec_hardware WHERE spec_id = ${specId} ORDER BY sort_order`;
  return NextResponse.json({ hardware: rows });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: specId } = await params;
  const [spec] = await sql`
    SELECT id, job_id FROM residential_specs WHERE id = ${specId}
  ` as Array<{ id: string; job_id: string }>;
  if (!spec) return NextResponse.json({ error: "Spec not found" }, { status: 404 });
  await ensureTable();

  const { hardware = [] } = await req.json() as { hardware: HardwarePayload[] };

  try {
    await sql.begin(async (tx) => {
      await tx`DELETE FROM spec_hardware WHERE spec_id = ${specId}`;
      for (let i = 0; i < hardware.length; i++) {
        const h = hardware[i];
        await tx`
          INSERT INTO spec_hardware (id, spec_id, type, part_no, room, qty, notes, sort_order)
          VALUES (${uid()}, ${specId}, ${h.type}, ${h.part_no ?? null}, ${h.room ?? null}, ${h.qty ?? 1}, ${h.notes ?? null}, ${i})
        `;
      }
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  await logActivity({
    entityType: "spec", entityId: specId, jobId: spec.job_id,
    eventType: "updated", actor: "pm", actorRole: "pm",
    payload: { section: "hardware", count: hardware.length },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
