export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [job] = await sql`SELECT * FROM jobs WHERE id = ${id} OR job_number = ${id}`;
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ job });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const allowed = [
    "job_number", "status", "job_type", "client_name", "client_email", "client_phone",
    "site_address", "city", "pm", "builder_name", "builder_email",
    "builder_phone", "builder_company", "delivery_date", "notes",
    "notes_install", "notes_finishing", "notes_shop", "notes_client",
    "mod_residential", "mod_commercial", "mod_trim", "mod_doors",
  ];

  const fields = Object.keys(body).filter((k) => allowed.includes(k));
  if (fields.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const MOD_FIELDS = new Set(["mod_residential", "mod_commercial", "mod_trim", "mod_doors"]);
  const updates: Record<string, unknown> = {};
  for (const f of fields) updates[f] = MOD_FIELDS.has(f) ? (body[f] ? 1 : 0) : body[f];

  // Resolve internal id (param may be job_number)
  const [row] = await sql`SELECT id, status FROM jobs WHERE id = ${id} OR job_number = ${id}` as Array<{ id: string; status: string }>;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const internalId = row.id;

  // Fetch current status before update (for activity log diff)
  let fromStatus: string | null = null;
  if ("status" in updates) {
    fromStatus = row.status ?? null;
  }

  await sql`UPDATE jobs SET ${sql(updates)} WHERE id = ${internalId}`;

  // Log status change or general update
  const actor = (body._actor as string | undefined) || "pm";
  const actorRole = (body._actorRole as string | undefined) || "pm";
  if ("status" in updates) {
    await logActivity({
      entityType: "job", entityId: internalId, jobId: internalId,
      eventType: "status_change",
      fromState: fromStatus, toState: updates.status as string,
      actor, actorRole,
    }).catch(() => {});
  } else {
    await logActivity({
      entityType: "job", entityId: internalId, jobId: internalId,
      eventType: "updated",
      actor, actorRole,
      payload: { fields },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
