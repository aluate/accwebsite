/**
 * /api/punch-items/[itemId]
 *
 * PATCH  — update status or content.
 *          PM/admin: any status, any field.
 *          All others: can only mark open → done (with photos uploaded separately).
 * DELETE — PM/admin only.
 *
 * Statuses: open | scheduled | done | wont_fix
 */

import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getPunchActor } from "@/lib/punch-auth";
import { logActivity } from "@/lib/activity-log";

export const runtime = "nodejs";

const VALID_TYPES    = new Set(["S", "S+M", "HP", "TD"]);
const VALID_STATUSES = new Set(["open", "scheduled", "done", "wont_fix"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const guard = await guardApi(["admin", "pm", "installer"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const actor = await getPunchActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;

  const [item] = await sql<Array<{ id: string; job_id: string; status: string }>>`
    SELECT id, job_id, status FROM punch_list_items WHERE id = ${itemId}
  `;
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const body = await req.json() as {
    status?: string;
    item_description?: string;
    type_code?: string;
    general_location?: string;
  };

  const now = new Date().toISOString();

  if (!actor.canManage) {
    // Non-managers can only mark open → done
    if (body.status !== "done") {
      return NextResponse.json({ error: "You can only mark items as done" }, { status: 403 });
    }
    if (item.status !== "open" && item.status !== "scheduled") {
      return NextResponse.json({ error: "Item is not in an open/scheduled state" }, { status: 409 });
    }
    await sql`
      UPDATE punch_list_items
      SET status = 'done', completed_by = ${actor.name}, completed_at = ${now}
      WHERE id = ${itemId}
    `;
    logActivity({
      entityType: "punch", entityId: itemId, jobId: item.job_id,
      eventType: "status_change", fromState: item.status, toState: "done",
      actor: actor.name, actorRole: actor.role,
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  // PM / admin — full edit rights
  if (body.status && !VALID_STATUSES.has(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  if (body.status)           await sql`UPDATE punch_list_items SET status           = ${body.status}                       WHERE id = ${itemId}`;
  if (body.item_description) await sql`UPDATE punch_list_items SET item_description = ${body.item_description.trim()}      WHERE id = ${itemId}`;
  if (body.type_code && VALID_TYPES.has(body.type_code))
                             await sql`UPDATE punch_list_items SET type_code        = ${body.type_code}                    WHERE id = ${itemId}`;
  if ("general_location" in body)
                             await sql`UPDATE punch_list_items SET general_location = ${body.general_location?.trim() ?? null} WHERE id = ${itemId}`;

  if (body.status === "done" || body.status === "wont_fix") {
    await sql`UPDATE punch_list_items SET completed_by = ${actor.name}, completed_at = ${now} WHERE id = ${itemId}`;
  } else if (body.status === "open" || body.status === "scheduled") {
    await sql`UPDATE punch_list_items SET completed_by = null, completed_at = null WHERE id = ${itemId}`;
  }

  if (body.status && body.status !== item.status) {
    logActivity({
      entityType: "punch", entityId: itemId, jobId: item.job_id,
      eventType: "status_change", fromState: item.status, toState: body.status,
      actor: actor.name, actorRole: actor.role,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const guard = await guardApi(["admin", "pm", "installer"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const actor = await getPunchActor();
  if (!actor?.canManage) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId } = await params;
  await sql`DELETE FROM punch_list_items WHERE id = ${itemId}`;
  return NextResponse.json({ ok: true });
}
