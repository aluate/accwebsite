export const dynamic = "force-dynamic";

/**
 * POST /api/jobs/[id]/advance
 *
 * Advances a job to the next status (or a specified target status).
 * Atomically:
 *   1. Validates the transition is legal
 *   2. Validates gate requirements (hard-gate: requires uploaded file)
 *   3. Updates job.status
 *   4. Parses WO filenames if woUpload gate (WO####.pdf, CO####.pdf)
 *   5. Fires notification emails to relevant parties
 *   6. Logs to activity_log
 *
 * Body: {
 *   toStatus:    string        — target status
 *   note?:       string        — optional PM note (included in emails)
 *   fileIds?:    string[]      — job_files.id array just uploaded in the gate modal
 *   _actor?:     string
 *   _actorRole?: string
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/auth";
import { sql, uid } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { sendEmail } from "@/lib/mailer";
import { TRANSITION_GATES, STATUS_SEQUENCE, type JobMeta } from "@/lib/transition-gates";
import { buildEngineeringEmail } from "@/lib/engineering-email";
import { AUTO_INVOICE_ENABLED, createDraftInvoice, invoiceExists } from "@/lib/invoices";
import { resolveRecipients, jobRoleAddresses } from "@/lib/notification-routing";

import { guardCap } from "@/lib/permissions";
type JobRow = JobMeta & {
  status: string;
  install_type?: string | null;
  delivery_date?: string | null;
  bid_number?: string | null;
};

/*
  Recipients come from the notification settings now, not from this file.

  This route used to map a gate's recipient keys onto env vars itself, which
  meant "who gets the delivery email" was a question you answered by reading
  code and changed by deploying. The gates still say WHICH email fires; who it
  reaches is one row in notification_routes, editable at /admin/notifications,
  with the same defaults this switch had.
*/

function parseWoNumber(filename: string): { woNumber: string; woType: "wo" | "co" } | null {
  const m = filename.match(/^(WO|CO)(\d+)\./i);
  if (!m) return null;
  return { woNumber: m[2], woType: m[1].toLowerCase() === "co" ? "co" : "wo" };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardCap("jobs.advance");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await params;
  const body = await req.json();
  const { toStatus, note, fileIds = [], _actor = "pm", _actorRole = "pm" } = body as {
    toStatus: string;
    note?: string;
    fileIds?: string[];
    _actor?: string;
    _actorRole?: string;
  };

  if (!toStatus) {
    return NextResponse.json({ error: "toStatus is required" }, { status: 400 });
  }

  // ── 1. Load job ────────────────────────────────────────────────────────────
  const [job] = await sql<JobRow[]>`
    SELECT id, job_number, status, client_name, client_email,
           site_address, city, pm, install_type, delivery_date, bid_number
    FROM jobs
    WHERE id = ${id} OR job_number = ${id}
  `;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const internalId = job.id;

  // ── 2. Validate the transition ─────────────────────────────────────────────
  const fromIdx = STATUS_SEQUENCE.indexOf(job.status as typeof STATUS_SEQUENCE[number]);
  const toIdx   = STATUS_SEQUENCE.indexOf(toStatus as typeof STATUS_SEQUENCE[number]);

  const isOnHold = job.status === "on_hold";
  if (!isOnHold && (fromIdx === -1 || toIdx === -1 || toIdx <= fromIdx)) {
    return NextResponse.json(
      { error: `Cannot advance from "${job.status}" to "${toStatus}"` },
      { status: 422 }
    );
  }

  // ── 3. Gate checks ─────────────────────────────────────────────────────────
  const gate = TRANSITION_GATES[toStatus];
  if (gate?.docRequired && fileIds.length === 0) {
    return NextResponse.json(
      { error: `A document is required before advancing to "${toStatus}". Please upload ${gate.docLabel}.` },
      { status: 422 }
    );
  }

  if (toStatus === "engineering" && !job.job_number) {
    return NextResponse.json(
      { error: "A job number must be assigned before releasing to Engineering." },
      { status: 422 }
    );
  }

  // Engineering checklist is enforced by the Release to Engineering panel (EngineeringReleasePanel).
  // The advance button just moves the status — the panel handles checklist + email.

  if (toStatus === "production") {
    const openCOs = await sql<Array<{ id: string; co_number: number; title: string }>>`
      SELECT id, co_number, title FROM change_orders
      WHERE job_id = ${internalId}
        AND voided_at IS NULL
        AND signed_at IS NULL
    `;
    if (openCOs.length > 0) {
      const list = openCOs.map((c) => `CO-${c.co_number} "${c.title}"`).join(", ");
      return NextResponse.json(
        { error: `Cannot release to Production — ${openCOs.length} unsigned change order${openCOs.length !== 1 ? "s" : ""} must be signed first: ${list}.` },
        { status: 422 }
      );
    }
  }

    if (toStatus === "complete") {
    /*
      'scheduled' counts as outstanding.

      This asked for status = 'open' only. punch_list_items has four statuses,
      and 'scheduled' means we have agreed to go back and do the work — the one
      state where an item is most definitely not finished. A job with three
      scheduled punch items and nothing open sailed through this gate and was
      marked complete.

      'wont_fix' is genuinely closed and does not block.
    */
    const [punchCheck] = await sql<Array<{ open_count: number }>>`
      SELECT COUNT(*) AS open_count FROM punch_list_items
      WHERE job_id = ${internalId} AND status IN ('open', 'scheduled')
    `;
    const openCount = Number(punchCheck?.open_count ?? 0);
    if (openCount > 0) {
      return NextResponse.json(
        { error: `Cannot mark complete — ${openCount} punch item${openCount !== 1 ? "s" : ""} still outstanding.` },
        { status: 422 }
      );
    }
  }

  // ── 4. Update job status ───────────────────────────────────────────────────
  const now = new Date().toISOString();
  await sql`UPDATE jobs SET status = ${toStatus} WHERE id = ${internalId}`;

  // ── 5. Parse WO filenames if this is a woUpload gate ──────────────────────
  if (gate?.woUpload && fileIds.length > 0) {
    const files = await sql<Array<{ id: string; filename: string }>>`
      SELECT id, filename FROM job_files
      WHERE id = ANY(${fileIds}::text[]) AND job_id = ${internalId}
    `;
    for (const f of files) {
      const parsed = parseWoNumber(f.filename);
      if (!parsed) continue;
      const woId = uid();
      const desc = parsed.woType === "co" ? "Change Order" : "Work Order";
      await sql`
        INSERT INTO work_orders (id, job_id, wo_number, description, created_at)
        VALUES (${woId}, ${internalId}, ${parsed.woNumber}, ${desc}, ${now})
        ON CONFLICT (id) DO NOTHING
      `;
    }
  }

  // ── 6. Fire emails ─────────────────────────────────────────────────────────
  const emailErrors: string[] = [];
  if (gate) {
    const eventKey = `advance.${toStatus}`;
    const resolved = await resolveRecipients(eventKey, jobRoleAddresses(job));
    const toAddress = resolved.to.join(", ");
    const ccAddress = resolved.cc.length ? resolved.cc.join(", ") : undefined;

    if (toAddress && resolved.enabled) {
      let emailOpts: Parameters<typeof sendEmail>[0];
      // roleOf keeps the client copy and the PM copy distinguishable when test
      // mode splits them into separate inboxes.
      const roleOf = (address: string) => resolved.roleByAddress[address.toLowerCase()];

      /*
        THE CLIENT GETS A DIFFERENT MESSAGE FROM THE PEOPLE INSIDE ACC.

        Until now one message went to everyone on the list. Where a client was
        on it — delivery, punch, complete — they received the internal note,
        written for the shop, as plain text with no logo. Karl, reading all
        twenty side by side, on the branded templates that existed for exactly
        these moments and were never called: "I think those 2 are fine to add."

        So when a gate declares a clientTemplate, the client's addresses come
        out of the main send and get the branded version instead. Everyone else
        still gets the plain internal note, unchanged. A gate without one
        behaves exactly as before, which is why `punch` still sends one message
        to everybody.
      */
      const clientTo = gate.clientTemplate
        ? resolved.to.filter((a) => roleOf(a) === "client")
        : [];
      const primaryTo = gate.clientTemplate
        ? resolved.to.filter((a) => roleOf(a) !== "client")
        : resolved.to;

      if (toStatus === "engineering") {
        const { subject, text, html, attachments } = await buildEngineeringEmail(job, internalId, note);
        emailOpts = { to: primaryTo, cc: resolved.cc, subject, text, html, attachments: attachments.length ? attachments : undefined, roleOf, event: eventKey };
      } else {
        const subject = gate.subject(job);
        const text    = gate.body(job, note);
        emailOpts = { to: primaryTo, cc: resolved.cc, subject, text, roleOf, event: eventKey };
      }

      /*
        A gate can now resolve to client-only — production, for instance, if
        somebody clears the shop address. Sending with an empty To: throws, and
        the client's email below is the one that matters, so skip rather than
        fail the advance.
      */
      const result = primaryTo.length
        ? await sendEmail(emailOpts)
        : { ok: true as const, messageId: null };

      if (gate.clientTemplate && clientTo.length) {
        const t = gate.clientTemplate(job, note);
        const clientResult = await sendEmail({
          to: clientTo, subject: t.subject, text: t.text, html: t.html,
          audience: "client", event: `${eventKey}.client`,
        });
        if (!clientResult.ok) {
          emailErrors.push(`${clientTo.join(", ")}: ${(clientResult as { ok: false; error: string }).error}`);
        }
      }

      try {
        await sql`
          INSERT INTO transition_emails
            (id, job_id, to_status, recipient, subject, sent_at, error, created_at)
          VALUES (
            ${uid()}, ${internalId}, ${toStatus}, ${toAddress}, ${emailOpts.subject},
            ${result.ok ? now : null},
            ${result.ok ? null : (result as { ok: false; error: string }).error},
            ${now}
          )
        `;
      } catch { /* table may not exist yet */ }

      if (!result.ok) {
        emailErrors.push(`${toAddress}: ${(result as { ok: false; error: string }).error}`);
      }
    }
  }

  // ── 7. Activity log ─────────────────────────────────────────
  await logActivity({
    entityType: "job", entityId: internalId, jobId: internalId,
    eventType: "status_change",
    fromState: job.status, toState: toStatus,
    actor: _actor, actorRole: _actorRole,
    payload: note ? { note } : undefined,
  }).catch(() => {});

  // ── 8. Balance invoice on delivery ────────────────────────
  /*
    Off by design. See AUTO_INVOICE_ENABLED in lib/invoices.ts for why — the
    short version is that this priced itself from the estimator alone and wrote
    a $0 invoice for every job that never went through it.

    Skipping it silently would be worse than the $0 invoice, because nothing
    would tell anyone billing is due. So the timeline gets an entry instead, and
    the PM raises the invoice from the job page.
  */
  if (toStatus === "delivery") {
    const alreadyExists = await invoiceExists(internalId, "balance").catch(() => true);
    if (!alreadyExists) {
      const label = [job.client_name, job.site_address].filter(Boolean).join(" — ");
      if (AUTO_INVOICE_ENABLED) {
        await createDraftInvoice({
          jobId: internalId,
          jobLabel: label,
          invoiceType: "balance",
          createdBy: _actor,
        }).catch(() => {});
      } else {
        await logActivity({
          entityType: "job", entityId: internalId, jobId: internalId,
          eventType: "invoice_due",
          actor: _actor, actorRole: _actorRole,
          payload: {
            invoice_type: "balance",
            job: label,
            note: "Delivered — balance invoice is due. Raise it from the job page.",
          },
        }).catch(() => {});
      }
    }
  }

  return NextResponse.json({
    ok: true,
    fromStatus: job.status,
    toStatus,
    emailErrors: emailErrors.length ? emailErrors : undefined,
  });
}
