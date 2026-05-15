import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await requireRole(["admin", "pm"]);
  const { itemId } = await params;
  const body = await req.json() as { status?: string; resolution?: string; notes?: string; priority?: string };

  const now = new Date().toISOString();
  const isResolving = body.status === "resolved" || body.status === "closed";

  // Grab current status before update for the activity log
  const [before] = await sql<Array<{ status: string; job_id: string }>>`
    SELECT status, job_id FROM warranty_items WHERE id = ${itemId}
  `;

  const rows = await sql`
    UPDATE warranty_items SET
      status       = COALESCE(${body.status ?? null}, status),
      priority     = COALESCE(${body.priority ?? null}, priority),
      resolution   = COALESCE(${body.resolution ?? null}, resolution),
      notes        = COALESCE(${body.notes ?? null}, notes),
      resolved_at  = ${isResolving ? now : null},
      resolved_by  = ${isResolving ? (session.name ?? session.username) : null}
    WHERE id = ${itemId}
    RETURNING *
  `;
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Log status transitions
  if (before && body.status && body.status !== before.status) {
    logActivity({ entityType: "warranty", entityId: itemId, jobId: before.job_id,
      eventType: "status_change", fromState: before.status, toState: body.status,
      actor: session.name ?? session.username, actorRole: session.role }).catch(() => {});
  }

  return NextResponse.json(rows[0]);
}
