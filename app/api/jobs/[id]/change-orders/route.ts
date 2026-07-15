export const dynamic = "force-dynamic";

/**
 * GET  /api/jobs/[id]/change-orders  — list all COs for a job
 * POST /api/jobs/[id]/change-orders  — create a new CO (PM draft)
 */
import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await requireBuilder();
  const { id } = await params;

  const [job] = await sql`SELECT id FROM jobs WHERE id = ${id} OR job_number = ${id}`;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const jobId = job.id as string;

  const cos = await sql`
    SELECT
      co.id, co.co_number, co.title, co.description, co.co_type,
      co.status, co.total_products, co.total_labor, co.total_amount,
      co.created_by, co.created_at, co.signed_at, co.signoff_id,
      co.voided_at, co.voided_reason,
      cs.signer_name, cs.signed_at AS signoff_signed_at,
      cs.token AS signoff_token
    FROM change_orders co
    LEFT JOIN client_signoffs cs ON cs.id = co.signoff_id
    WHERE co.job_id = ${jobId}
    ORDER BY co.co_number
  `;

  const items = await sql`
    SELECT id, co_id, item_type, description, quantity, unit, unit_price, total, sort_order
    FROM change_order_items
    WHERE co_id = ANY(${cos.map((c: { id: string }) => c.id)})
    ORDER BY co_id, sort_order, id
  `;

  return NextResponse.json({ cos, items });
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireBuilder();
  if (!["karl", "admin", "pm"].includes(session.role)) {
    return NextResponse.json({ error: "PM or admin required" }, { status: 403 });
  }

  const { id } = await params;
  const [job] = await sql`SELECT id FROM jobs WHERE id = ${id} OR job_number = ${id}`;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const jobId = job.id as string;

  const body = await req.json() as { title?: string; description?: string; co_type?: string };
  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  // Auto-number: count existing COs for this job
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM change_orders WHERE job_id = ${jobId}` as [{ count: number }];
  const coNumber = count + 1;

  const coId = uid();
  const now = new Date().toISOString();
  const coType = body.co_type ?? "client_add";

  await sql`
    INSERT INTO change_orders
      (id, job_id, co_number, title, description, co_type, status, created_by, created_at)
    VALUES
      (${coId}, ${jobId}, ${coNumber}, ${title}, ${body.description ?? null}, ${coType}, 'draft', ${session.name ?? session.username ?? "pm"}, ${now})
  `;

  await logActivity({
    entityType: "job", entityId: jobId, jobId,
    eventType: "co_created",
    actor: session.name ?? session.username ?? "pm",
    actorRole: "pm",
    payload: { co_id: coId, co_number: coNumber, title },
  }).catch(() => {});

  return NextResponse.json({ ok: true, id: coId, co_number: coNumber }, { status: 201 });
}
