export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { sendEmail } from "@/lib/mailer";
import { scheduleDateChanged } from "@/lib/email-templates";
import { syncJobToInnergy } from "@/lib/innergy-sync";
import { requireBuilderApi, guardApi } from "@/lib/auth";
import { syncInstallEventToOfficialDate } from "@/lib/install-date";

import { guardCap } from "@/lib/permissions";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.advancedcabinets.org";

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
  /*
    THE WIDEST HOLE IN THE APP UNTIL NOW.

    This was requireBuilderApi() — logged in, and nothing else. JOB_PATCH_FIELDS
    below includes status, pm, estimated_value, engineer, bid_number,
    delivery_date, install_start_date, the client's phone and email and every
    mod_* flag. Any account of any role could rewrite all of them, on any job.

    It was not theoretical: /jobs/[id]/edit has no gate either and
    JobInlineEditClient renders unconditionally, so the app actively OFFERED the
    editor to engineer, shop and installer accounts. Both sides are fixed in this
    patch — narrowing an API without removing the button that calls it just moves
    the failure from a silent write to a confusing 403.
  */
  const guard = await guardCap("jobs.edit");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const session = guard.session;
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
  /*
    The dates are read BEFORE the update because a "date moved" notification is
    worthless without the date it moved from, and after the UPDATE that value is
    gone. Everything else here already had what it needed; this row is the one
    thing that has to be captured first.
  */
  const [row] = await sql`
    SELECT id, status, job_number, client_name, site_address, city, pm,
           install_start_date, delivery_date
    FROM jobs WHERE id = ${id} OR job_number = ${id}
  ` as Array<{
    id: string; status: string; job_number: string | null; client_name: string;
    site_address: string | null; city: string | null; pm: string | null;
    install_start_date: string | null; delivery_date: string | null;
  }>;
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

  // The pipeline owns the install date, so a change here drags the scheduled install
  // event with it — automatically, keeping its length and crew. Karl's call: fewer
  // clicks beats a confirmation, because the alternative is a crew reading a date the
  // office has already changed.
  //
  // Reported rather than silent. The move can double-book a crew, and an automatic
  // change that hides a conflict is worse than no sync at all.
  /*
    TELL THE PM A DATE MOVED — BUT ONLY WHEN SOMEBODY ASKS.

    scheduleDateChanged has been finished and uncalled since the templates were
    written: an install or delivery date moved and nobody was emailed. Karl:
    "let's wire up that change, but make sure there's like a box to check...
    notify PM for the email to fire."

    The box matters more than the email. Dates move constantly while a schedule
    is being worked out — dragging a card, nudging a week, trying a shape. A
    message on every one of those teaches people to filter the sender, and then
    the one that mattered goes unread with the rest. So this fires only when the
    caller explicitly asks, which today is one checkbox on the "make it
    official" prompt: the moment the board and the pipeline are deliberately
    brought back into agreement.

    Drag-to-move does not set it. That is the point of it.
  */
  if (body._notify_pm === true) {
    const moved = (["install_start_date", "delivery_date"] as const).filter(
      (f) => f in updates && String(updates[f] ?? "") !== String(row[f] ?? ""),
    );
    for (const field of moved) {
      try {
        const t = scheduleDateChanged({
          jobId: String(row.job_number ?? ""),
          jobNumber: row.job_number ? String(row.job_number) : undefined,
          clientName: row.client_name ?? "",
          siteAddress: [row.site_address, row.city].filter(Boolean).join(", "),
          eventType: field === "install_start_date" ? "Install" : "Delivery",
          oldDate: row[field] ?? undefined,
          newDate: (updates[field] as string | null) ?? undefined,
          changedBy: actor,
          reason: typeof body._reason === "string" ? body._reason : undefined,
          jobUrl: `${SITE_URL}/jobs/${row.job_number ?? internalId}`,
        });
        /*
          Never allowed to fail the save. The date is already stored; losing the
          whole PATCH to an SMTP hiccup is a worse outcome than a missing
          notification. The recipient is resolved by role, so who "the PM" is
          stays configurable on /admin/notifications like everything else.
        */
        void sendEmail({
          to: [], subject: t.subject, text: t.text, html: t.html,
          audience: "pm", event: "schedule.date_changed",
        }).catch(() => {});
      } catch { /* a malformed date must not take the save with it */ }
    }
  }

  let install_sync: Awaited<ReturnType<typeof syncInstallEventToOfficialDate>> | undefined;
  if ("install_start_date" in updates) {
    try {
      install_sync = await syncInstallEventToOfficialDate(
        internalId,
        updates.install_start_date as string | null,
        actor,
      );
    } catch (e) {
      // The job itself saved. Say the schedule did not follow rather than failing the
      // whole request and making it look like the date did not save.
      install_sync = { moved: false, reason: `the schedule could not be updated: ${(e as Error)?.message ?? e}` };
    }
  }

  return NextResponse.json({ ok: true, ...(install_sync ? { install_sync } : {}) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // This read `await getBuilder()` with no import for getBuilder — a ReferenceError
  // at runtime, so the handler had never once succeeded and the admin Delete Job
  // button did nothing. Turbopack does not typecheck during build, so it shipped.
  const guard = await guardCap("jobs.delete");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await params;
  const [row] = await sql`SELECT id, client_name FROM jobs WHERE id = ${id} OR job_number = ${id}` as Array<{ id: string; client_name: string }>;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  /*
    DELETING A JOB THAT HAS ACTUALLY BEEN WORKED ON.

    `DELETE FROM jobs` alone worked on an empty job and threw a foreign-key
    error on any job that got anywhere — which is every job worth deleting. The
    button returned a 500 with an empty body, so it read as doing nothing.

    The first fix listed the blocking tables by hand, and I got that list wrong
    twice: once by reading the schema with a script that attributed a foreign
    key to the wrong CREATE TABLE, so it tried to delete from a table with no
    job_id at all and aborted the whole transaction, and once by missing
    catalog_libraries entirely. A hand-maintained list of what references a
    table is exactly the kind of thing that is right the day it is written and
    wrong a month later.

    So it asks the database instead. Postgres already knows which foreign keys
    point at jobs(id) and what each one does on delete — confdeltype 'c' is
    cascade and 'n' is set-null, both of which look after themselves; anything
    else blocks and has to be cleared first. A table added next year is handled
    without anybody remembering this function exists.

    The two grandchildren are still named explicitly: invoice_line_items and
    change_order_items hang off invoices and change_orders rather than off the
    job, so discovery does not see them, and their parents cannot be deleted
    while they are there.

    One transaction throughout — a half-deleted job leaves invoices pointing at
    a job that no longer exists, which is worse than not deleting.
  */
  try {
    const blockers = await sql<Array<{ table_name: string; column_name: string }>>`
      SELECT c.conrelid::regclass::text AS table_name,
             a.attname                  AS column_name
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE c.contype = 'f'
        AND c.confrelid = 'jobs'::regclass
        AND c.confdeltype NOT IN ('c', 'n')   -- cascade and set-null need no help
        AND c.conrelid <> 'jobs'::regclass    -- jobs.placeholder_id points at itself
    `;

    await sql.begin(async (tx) => {
      // Grandchildren first: these hang off invoices and change_orders, not off
      // the job, so the query above cannot see them.
      await tx`DELETE FROM invoice_line_items WHERE invoice_id IN (SELECT id FROM invoices WHERE job_id = ${row.id})`;
      await tx`DELETE FROM change_order_items WHERE co_id IN (SELECT id FROM change_orders WHERE job_id = ${row.id})`;

      for (const b of blockers) {
        await tx`DELETE FROM ${tx(b.table_name)} WHERE ${tx(b.column_name)} = ${row.id}`;
      }
      await tx`DELETE FROM jobs WHERE id = ${row.id}`;
    });
  } catch (e) {
    /*
      Name what happened. The original swallowed this into a blank 500 and the
      only way to find out what was holding the row was to read the schema —
      which is how the first version of this shipped with a wrong table name in
      it. This message is what caught that, on the first live delete.
    */
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[jobs/delete] failed:", msg);
    return NextResponse.json({
      error: "Could not delete this job — something still references it.",
      detail: msg,
    }, { status: 409 });
  }

  await logActivity({
    entityType: "job", entityId: row.id, jobId: null,
    eventType: "deleted",
    actor: "admin", actorRole: "admin",
    payload: { note: `Deleted job ${row.id}${row.client_name ? ` (${row.client_name})` : ""}.` },
  }).catch(() => {});

  return NextResponse.json({ ok: true, deleted: row.id });
}
