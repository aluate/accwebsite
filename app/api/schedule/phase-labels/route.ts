export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireBuilder } from "@/lib/auth";
import { sql, uid } from "@/lib/db";
import type { EventPhaseLabel } from "@/lib/schedule-types";

export async function GET() {
  await requireBuilder();
  const rows = await sql<EventPhaseLabel[]>`
    SELECT * FROM event_phase_labels WHERE active = 1 ORDER BY sort_order, label
  `;
  return NextResponse.json({ ok: true, labels: rows });
}

export async function POST(req: NextRequest) {
  const builder = await requireBuilder();
  if (builder.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }
  const { label, sort_order } = (await req.json()) as { label?: string; sort_order?: number };
  if (!label?.trim()) return NextResponse.json({ ok: false, error: "label required" }, { status: 400 });

  await sql`
    INSERT INTO event_phase_labels (label, sort_order)
    VALUES (${label.trim()}, ${sort_order ?? 99})
    ON CONFLICT (label) DO UPDATE SET active = 1, sort_order = EXCLUDED.sort_order
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const builder = await requireBuilder();
  if (builder.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }
  const { id } = (await req.json()) as { id?: number };
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  await sql`UPDATE event_phase_labels SET active = 0 WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
