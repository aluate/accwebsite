/**
 * /api/punch-items/[itemId]
 *
 * PATCH — update an item (mark complete with photo, or edit description/type).
 *         Installers can only mark complete. PM/admin can edit anything.
 * DELETE — admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getBuilder } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

export const runtime = "nodejs";

const VALID_TYPES = new Set(["S", "S+M", "HP", "TD"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getBuilder();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;

  const [item] = await sql<Array<{ id: string; job_id: string; status: string }>>`
    SELECT id, job_id, status FROM punch_list_items WHERE id = ${itemId}
  `;
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const body = await req.json() as {
    status?: "open" | "done";
    item_description?: string;
    type_code?: string;
    general_location?: string;
  };

  const now = new Date().toISOString();

  if (session.role === "installer") {
    // Installers can only mark open → done (photo upload handled separately)
    if (body.status !== "done") {
      return NextResponse.json({ error: "Installers can only mark items as done" }, { status: 403 });
    }
    await sql`
      UPDATE punch_list_items
      SET status = 'done', completed_by = ${session.name}, completed_at = ${now}
      WHERE id = ${itemId} AND status = 'open'
    `;
    logActivity({ entityType: "punch", entityId: itemId, jobId: item.job_id,
      eventType: "status_change", fromState: "open", toState: "done",
      actor: session.name, actorRole: session.role }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  // PM / admin can edit freely
  const updates: Record<string, unknown> = {};
  if (body.status)            updates.status = body.status;
  if (body.item_description)  updates.item_description = body.item_description.trim();
  if (body.type_code && VALID_TYPES.has(body.type_code)) updates.type_code = body.type_code;
  if ("general_location" in body) updates.general_location = body.general_location?.trim() ?? null;

  if (body.status === "done") {
    updates.completed_by = session.name;
    updates.completed_at = now;
  } else if (body.status === "open") {
    updates.completed_by = null;
    updates.completed_at = null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, message: "No changes" });
  }

  // Build SET clause dynamically
  if ("status" in updates)             await sql`UPDATE punch_list_items SET status            = ${updates.status as string}            WHERE id = ${itemId}`;
  if ("item_description" in updates)   await sql`UPDATE punch_list_items SET item_description  = ${updates.item_description as string}  WHERE id = ${itemId}`;
  if ("type_code" in updates)          await sql`UPDATE punch_list_items SET type_code         = ${updates.type_code as string}         WHERE id = ${itemId}`;
  if ("general_location" in updates)   await sql`UPDATE punch_list_items SET general_location  = ${updates.general_location as string | null}  WHERE id = ${itemId}`;
  if ("completed_by" in updates)       await sql`UPDATE punch_list_items SET completed_by      = ${updates.completed_by as string | null}      WHERE id = ${itemId}`;
  if ("completed_at" in updates)       await sql`UPDATE punch_list_items SET completed_at      = ${updates.completed_at as string | null}      WHERE id = ${itemId}`;

  // Log status changes
  if (body.status && body.status !== item.status) {
    logActivity({ entityType: "punch", entityId: itemId, jobId: item.job_id,
      eventType: "status_change", fromState: item.status, toState: body.status,
      actor: session.name, actorRole: session.role }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getBuilder();
  if (!session || !["karl", "admin", "pm"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId } = await params;
  await sql`DELETE FROM punch_list_items WHERE id = ${itemId}`;
  return NextResponse.json({ ok: true });
}
