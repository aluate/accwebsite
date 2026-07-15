export const dynamic = "force-dynamic";

/**
 * POST /api/change-orders/[coId]/send
 *
 * Generates a client signoff token for a change order.
 * Updates CO status to 'sent'.
 * Returns { ok, token, url }
 */
import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";
import { generateSignoffToken, signoffUrl } from "@/lib/signoff";
import { logActivity } from "@/lib/activity-log";

type Params = { params: Promise<{ coId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireBuilder();
  if (!["karl", "admin", "pm"].includes(session.role)) {
    return NextResponse.json({ error: "PM or admin required" }, { status: 403 });
  }

  const { coId } = await params;
  const [co] = await sql`
    SELECT co.*, j.client_name, j.site_address
    FROM change_orders co
    JOIN jobs j ON j.id = co.job_id
    WHERE co.id = ${coId}
  ` as Array<{ id: string; job_id: string; co_number: number; title: string; status: string; total_amount: number; client_name: string; site_address: string }>;

  if (!co) return NextResponse.json({ error: "CO not found" }, { status: 404 });
  if (co.status === "voided") return NextResponse.json({ error: "CO is voided" }, { status: 409 });

  const body = await req.json().catch(() => ({})) as { expiry_days?: number };
  const expiryDays = body.expiry_days ?? 30;
  const expiresAt = new Date(Date.now() + expiryDays * 86400 * 1000).toISOString();

  const token = generateSignoffToken();
  const signoffId = uid();
  const now = new Date().toISOString();
  const actor = session.name ?? session.username ?? "pm";

  const pmNote = `Change Order #${co.co_number}: ${co.title} — $${Number(co.total_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  await sql`
    INSERT INTO client_signoffs
      (id, job_id, change_order_id, token, token_expires_at, status, pm_note, created_by, created_at)
    VALUES
      (${signoffId}, ${co.job_id}, ${coId}, ${token}, ${expiresAt}, 'pending', ${pmNote}, ${actor}, ${now})
  `;

  await sql`
    UPDATE change_orders SET
      status     = 'sent',
      signoff_id = ${signoffId}
    WHERE id = ${coId}
  `;

  await logActivity({
    entityType: "job", entityId: co.job_id, jobId: co.job_id,
    eventType: "co_sent",
    actor,
    actorRole: "pm",
    payload: { co_id: coId, co_number: co.co_number, signoff_id: signoffId },
  }).catch(() => {});

  const url = signoffUrl(token);
  return NextResponse.json({ ok: true, token, url });
}
