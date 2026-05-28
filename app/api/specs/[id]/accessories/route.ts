export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";

// ── Ensure tables exist (idempotent, runs on every request) ─────────────────

async function ensureTables() {
  await sql`CREATE TABLE IF NOT EXISTS spec_pulls (
    id          TEXT PRIMARY KEY,
    spec_id     TEXT NOT NULL REFERENCES residential_specs(id) ON DELETE CASCADE,
    make        TEXT,
    model       TEXT,
    size        TEXT,
    room        TEXT,
    notes       TEXT,
    qty         INTEGER NOT NULL DEFAULT 1,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS spec_accessories (
    id          TEXT PRIMARY KEY,
    spec_id     TEXT NOT NULL REFERENCES residential_specs(id) ON DELETE CASCADE,
    part_number TEXT,
    description TEXT,
    qty         INTEGER NOT NULL DEFAULT 1,
    handed      TEXT NOT NULL DEFAULT 'N/A',
    room        TEXT,
    notes       TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`;
}

// ── Types ───────────────────────────────────────────────────────────────────

type PullPayload = {
  id: string;
  make: string;
  model: string;
  size: string;
  room: string;
  notes: string;
  qty: number;
};

type AccessoryPayload = {
  id: string;
  part_number: string;
  description: string;
  qty: number;
  handed: "N/A" | "Left" | "Right";
  room: string;
  notes: string;
};

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: specId } = await params;
  await ensureTables();
  const pulls = await sql`SELECT * FROM spec_pulls WHERE spec_id = ${specId} ORDER BY sort_order`;
  const accessories = await sql`SELECT * FROM spec_accessories WHERE spec_id = ${specId} ORDER BY sort_order`;
  return NextResponse.json({ pulls, accessories });
}

// ── POST ────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: specId } = await params;
  await ensureTables();

  let body: { pulls: PullPayload[]; accessories: AccessoryPayload[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { pulls, accessories } = body;

  await sql.begin(async (tx) => {
    await tx`DELETE FROM spec_pulls WHERE spec_id = ${specId}`;
    await tx`DELETE FROM spec_accessories WHERE spec_id = ${specId}`;

    for (let i = 0; i < pulls.length; i++) {
      const p = pulls[i];
      await tx`INSERT INTO spec_pulls
        (id, spec_id, make, model, size, room, notes, qty, sort_order)
        VALUES (
          ${uid()}, ${specId},
          ${p.make || null}, ${p.model || null}, ${p.size || null},
          ${p.room || null}, ${p.notes || null},
          ${p.qty ?? 1}, ${i}
        )`;
    }

    for (let i = 0; i < accessories.length; i++) {
      const a = accessories[i];
      await tx`INSERT INTO spec_accessories
        (id, spec_id, part_number, description, qty, handed, room, notes, sort_order)
        VALUES (
          ${uid()}, ${specId},
          ${a.part_number || null}, ${a.description || null},
          ${a.qty ?? 1}, ${a.handed ?? "N/A"},
          ${a.room || null}, ${a.notes || null}, ${i}
        )`;
    }
  });

  // Log activity (best-effort — don't fail the save if this errors)
  try {
    const specRows = await sql`SELECT job_id FROM residential_specs WHERE id = ${specId} LIMIT 1`;
    const jobId = specRows[0]?.job_id ?? null;
    await logActivity({
      entityType: "spec", entityId: specId, jobId,
      eventType: "updated", actor: "pm", actorRole: "pm",
      payload: { pulls: pulls.length, accessories: accessories.length },
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true });
}
