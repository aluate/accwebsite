export const dynamic = "force-dynamic";

/**
 * Accessories API — pulls + RevAShelf/hardware accessory items.
 *
 *   GET  /api/specs/{specId}/accessories  → { pulls: [...], accessories: [...] }
 *   POST /api/specs/{specId}/accessories  → wipe-and-reinsert both tables
 */
import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";

// ── Payload types ──────────────────────────────────────────────────────────
type PullPayload = {
  make: string | null;
  model: string | null;
  size: string | null;
  room: string | null;
  notes: string | null;
  qty: number;
};

type AccessoryPayload = {
  part_number: string | null;
  description: string | null;
  qty: number;
  handed: string;
  room: string | null;
  notes: string | null;
};

type PostBody = {
  pulls: PullPayload[];
  accessories: AccessoryPayload[];
};

// Ensure tables exist — idempotent, CREATE TABLE IF NOT EXISTS is safe on every call.
// This approach avoids a separate migration step; tables are created on first use.
async function ensureTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS spec_pulls (
      id TEXT PRIMARY KEY,
      spec_id TEXT NOT NULL REFERENCES residential_specs(id) ON DELETE CASCADE,
      make TEXT,
      model TEXT,
      size TEXT,
      room TEXT,
      notes TEXT,
      qty INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS spec_accessories (
      id TEXT PRIMARY KEY,
      spec_id TEXT NOT NULL REFERENCES residential_specs(id) ON DELETE CASCADE,
      part_number TEXT,
      description TEXT,
      qty INTEGER NOT NULL DEFAULT 1,
      handed TEXT NOT NULL DEFAULT 'N/A',
      room TEXT,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: specId } = await params;
  const [spec] = await sql`SELECT id FROM residential_specs WHERE id = ${specId}`;
  if (!spec) return NextResponse.json({ error: "Spec not found" }, { status: 404 });

  await ensureTables();

  const [pulls, accessories] = await Promise.all([
    sql`SELECT * FROM spec_pulls WHERE spec_id = ${specId} ORDER BY sort_order`,
    sql`SELECT * FROM spec_accessories WHERE spec_id = ${specId} ORDER BY sort_order`,
  ]);

  return NextResponse.json({ pulls, accessories });
}

// ── POST ───────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: specId } = await params;
  const [spec] = await sql`
    SELECT id, job_id FROM residential_specs WHERE id = ${specId}
  ` as Array<{ id: string; job_id: string }>;
  if (!spec) return NextResponse.json({ error: "Spec not found" }, { status: 404 });

  await ensureTables();

  const body = await req.json() as PostBody;
  const { pulls = [], accessories = [] } = body;

  try {
    await sql.begin(async (tx) => {
      // Wipe existing rows for this spec
      await tx`DELETE FROM spec_pulls WHERE spec_id = ${specId}`;
      await tx`DELETE FROM spec_accessories WHERE spec_id = ${specId}`;

      // Insert pulls
      for (let i = 0; i < pulls.length; i++) {
        const p = pulls[i];
        await tx`
          INSERT INTO spec_pulls (id, spec_id, make, model, size, room, notes, qty, sort_order)
          VALUES (
            ${uid()}, ${specId},
            ${p.make ?? null}, ${p.model ?? null}, ${p.size ?? null},
            ${p.room ?? null}, ${p.notes ?? null},
            ${p.qty ?? 1}, ${i}
          )
        `;
      }

      // Insert accessories
      for (let i = 0; i < accessories.length; i++) {
        const a = accessories[i];
        await tx`
          INSERT INTO spec_accessories (id, spec_id, part_number, description, qty, handed, room, notes, sort_order)
          VALUES (
            ${uid()}, ${specId},
            ${a.part_number ?? null}, ${a.description ?? null},
            ${a.qty ?? 1}, ${a.handed ?? "N/A"},
            ${a.room ?? null}, ${a.notes ?? null},
            ${i}
          )
        `;
      }
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  await logActivity({
    entityType: "spec", entityId: specId, jobId: spec.job_id,
    eventType: "updated", actor: "pm", actorRole: "pm",
    payload: { section: "accessories", pulls: pulls.length, accessories: accessories.length },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
