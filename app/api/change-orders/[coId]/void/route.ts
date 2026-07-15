export const dynamic = "force-dynamic";

/**
 * POST /api/change-orders/[coId]/void
 *
 * Body: { reason?: string }
 * Voids a CO. Cannot void a signed CO.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

type Params = { params: Promise<{ coId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireBuilder();
  if (!["karl", "admin", "pm"].includes(session.role)) {
    return NextResponse.json({ error: "PM or admin required" }, { status: 403 });
  }

  const { coId } = await params;
  const [co] = await sql`SELECT id, job_id, co_number, status FROM change_orders WHERE id = ${coId}` as Array<{ id: string; job_id: string; co_number: number; status: string }>;
  if (!co) return NextResponse.json({ error: "CO not found" }, { status: 404 });
  if (co.status === "signed") return NextResponse.json({ error: "Cannot void a signed CO" }, { status: 409 });
  if (co.status === "voided") return NextResponse.json({ error: "Already voided" }, { status: 409 });

  const body = await req.json().catch(() => ({})) as { reason?: string };
  const now = new Date().toISOString();

  await sql`
    UPDATE change_orders SET
      status        = 'voided',
      voided_at     = ${now},
      voided_reason = ${body.reason ?? null}
    WHERE id = ${coId}
  `;

  // Also expire the signoff token if one exists
  await sql`
    UPDATE client_signoffs SET
      token_expires_at = ${now},
      status = 'voided'
    WHERE change_order_id = ${coId} AND status = 'pending'
  `;

  const actor = session.name ?? session.username ?? "pm";
  await logActivity({
    entityType: "job", entityId: co.job_id, jobId: co.job_id,
    eventType: "co_voided",
    actor,
    actorRole: "pm",
    payload: { co_id: coId, co_number: co.co_number, reason: body.reason },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
