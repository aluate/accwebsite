export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { syncJobToInnergy } from "@/lib/innergy-sync";
import { requireBuilderApi, guardApi } from "@/lib/auth";

/**
 * Columns a PATCH may write. Every name here must be a real column on `jobs`:
 * the update is built as `UPDATE jobs SET ${sql(updates)}`, so a name that is not
 * a column raises Postgres 42703 and the whole request 500s.
 *
 * That is not theoretical. "anticipated_delivery" sat in this list and has never
 * been a column — it is a computed alias in /api/admin/pipeline, COALESCEing the
 * first scheduled install event with jobs.delivery_date. The pipeline board's
 * delivery-date cell wrote to it, so editing a delivery date there failed every
 * single time. The board updates optimistically and then reloads, so the date
 * appeared to take and then snapped back: "it isn't saving".
 *
 * scripts/check-job-fields.mjs now asserts every name below exists in the schema,
 * and runs in prebuild. Add a column before you add it here.
 */
export const JOB_PATCH_FIELDS = [
  "job_number", "status", "job_type", "client_name", "client_email", "client_phone",
  "site_address", "city", "pm", "builder_name", "builder_email",
  "builder_phone", "builder_company", "delivery_date", "notes",
  "notes_install", "notes_finishing", "notes_shop", "notes_client",
  "mod_residential", "mod_commercial", "mod_trim", "mod_doors",
  "install_type", "install_start_date", "install_duration_days",
  "bid_number", "estimated_value", "pm_complexity", "box_count", "wo_count",
  "shop_hrs", "install_hrs", "builder_id",
  "placeholder_id", "engineer",
] as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireBuilderApi();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const [job] = await sql`SELECT * FROM jobs WHERE id = ${id} OR job_number = ${id}`;
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ job });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireBuilderApi();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const fields = Object.keys(body).filter((k) => (JOB_PATCH_FIELDS as readonly string[]).includes(k));
  if (fields.length === 0) {
    // Name what was rejected. "Nothing to update" on its own sent whoever was
    // debugging this looking at the database instead of at the field name.
    const offered = Object.keys(body).filter((k) => !k.startsWith("_"));
    return NextResponse.json({
      error: offered.length
        ? `No writable field in the request. Not accepted: ${offered.join(", ")}.`
        : "Nothing to update",
      writable_fields: JOB_PATCH_FIELDS,
    }, { status: 400 });
  }

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

  // Auto-complete placeholder when all units are consumed
  if ("placeholder_id" in updates && updates.placeholder_id) {
    const phId = updates.placeholder_id as string;
    const [ph] = await sql`SELECT placeholder_unit_count FROM jobs WHERE id = ${phId}` as Array<{ placeholder_unit_count: number }>;
    if (ph) {
      const [{ linked_count }] = await sql`SELECT COUNT(*) AS linked_count FROM jobs WHERE placeholder_id = ${phId}` as Array<{ linked_count: string }>;
      if (Number(linked_count) >= ph.placeholder_unit_count) {
        await sql`UPDATE jobs SET status = 'complete' WHERE id = ${phId}`;
      }
    }
  }

  // On status change, re-sync win-probability to Innergy (fire-and-forget)
  if ("status" in updates) {
    const [fullJob] = await sql`SELECT * FROM jobs WHERE id = ${internalId}` as Array<Record<string, unknown>>;
    if (fullJob) {
      syncJobToInnergy({
        id: fullJob.id as string,
        job_number: fullJob.job_number as string | null,
        client_name: fullJob.client_name as string,
        site_address: fullJob.site_address as string | null,
        city: fullJob.city as string | null,
        state: fullJob.state as string | null,
        zip_code: fullJob.zip_code as string | null,
        job_type: fullJob.job_type as string | null,
        pm: fullJob.pm as string | null,
        builder_name: fullJob.builder_name as string | null,
        builder_company: fullJob.builder_company as string | null,
        delivery_date: fullJob.delivery_date as string | null,
        estimated_value: fullJob.estimated_value ? Number(fullJob.estimated_value) : null,
        status: updates.status as string,
        innergy_opportunity_id: fullJob.innergy_opportunity_id as string | null,
      }).then((result) => {
        if (result?.created) {
          sql`UPDATE jobs SET
            innergy_opportunity_id = ${result.opportunityId},
            innergy_bid_id = ${result.bidId},
            innergy_synced_at = NOW()
          WHERE id = ${internalId}`.catch(() => {});
        } else if (result && !result.created) {
          sql`UPDATE jobs SET innergy_synced_at = NOW() WHERE id = ${internalId}`.catch(() => {});
        }
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // This read `await getBuilder()` with no import for getBuilder — a ReferenceError
  // at runtime, so the handler had never once succeeded and the admin Delete Job
  // button did nothing. Turbopack does not typecheck during build, so it shipped.
  const guard = await guardApi(["admin"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await params;
  const [row] = await sql`SELECT id, client_name FROM jobs WHERE id = ${id} OR job_number = ${id}` as Array<{ id: string; client_name: string }>;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await sql`DELETE FROM jobs WHERE id = ${row.id}`;
  return NextResponse.json({ ok: true, deleted: row.id });
}
