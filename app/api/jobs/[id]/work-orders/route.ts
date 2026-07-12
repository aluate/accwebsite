export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { getBuilder } from "@/lib/auth";

// GET /api/jobs/[id]/work-orders
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getBuilder();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [job] = await sql`SELECT id FROM jobs WHERE id = ${id} OR job_number = ${id}`;
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await sql`
    CREATE TABLE IF NOT EXISTS work_orders (
      id            TEXT PRIMARY KEY,
      job_id        TEXT NOT NULL,
      wo_number     TEXT,
      category_code INTEGER NOT NULL DEFAULT 1,
      description   TEXT NOT NULL DEFAULT '',
      finish_group_id TEXT,
      status        TEXT NOT NULL DEFAULT 'pending',
      ship_date     DATE,
      target_finish DATE,
      notes         TEXT,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const rows = await sql`
    SELECT * FROM work_orders WHERE job_id = ${job.id}
    ORDER BY category_code, sort_order, created_at
  `;

  // Return finish groups so the client can populate cat-1 WO descriptions
  const fgRows = await sql`
    SELECT fg.id, fg.label, fg.finish_type
    FROM finish_groups fg
    JOIN residential_specs rs ON rs.id = fg.spec_id
    WHERE rs.job_id = ${job.id}
    ORDER BY rs.created_at DESC, fg.sort_order
  `.catch(() => []);

  return NextResponse.json({ work_orders: rows, finish_groups: fgRows });
}

// POST /api/jobs/[id]/work-orders  — upsert full list
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getBuilder();
  if (!session || !["admin", "pm"].includes(session.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const [job] = await sql`SELECT id FROM jobs WHERE id = ${id} OR job_number = ${id}`;
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  interface WOInput {
    id?: string; wo_number?: string; category_code: number;
    description: string; finish_group_id?: string; status?: string;
    ship_date?: string; target_finish?: string; notes?: string; sort_order?: number;
  }
  const { work_orders } = await req.json() as { work_orders: WOInput[] };

  const submittedIds = work_orders.filter(w => w.id).map(w => w.id!);
  if (submittedIds.length > 0) {
    await sql`DELETE FROM work_orders WHERE job_id = ${job.id} AND id != ALL(${sql(submittedIds)})`;
  } else {
    await sql`DELETE FROM work_orders WHERE job_id = ${job.id}`;
  }

  for (let i = 0; i < work_orders.length; i++) {
    const w = work_orders[i];
    const wId = w.id || uid();
    await sql`
      INSERT INTO work_orders (id, job_id, wo_number, category_code, description, finish_group_id, status, ship_date, target_finish, notes, sort_order)
      VALUES (
        ${wId}, ${job.id}, ${w.wo_number || null}, ${w.category_code},
        ${w.description}, ${w.finish_group_id || null}, ${w.status || 'pending'},
        ${w.ship_date || null}, ${w.target_finish || null}, ${w.notes || null},
        ${w.sort_order ?? i}
      )
      ON CONFLICT (id) DO UPDATE SET
        wo_number     = EXCLUDED.wo_number,
        category_code = EXCLUDED.category_code,
        description   = EXCLUDED.description,
        finish_group_id = EXCLUDED.finish_group_id,
        status        = EXCLUDED.status,
        ship_date     = EXCLUDED.ship_date,
        target_finish = EXCLUDED.target_finish,
        notes         = EXCLUDED.notes,
        sort_order    = EXCLUDED.sort_order
    `;
  }

  return NextResponse.json({ ok: true });
}
