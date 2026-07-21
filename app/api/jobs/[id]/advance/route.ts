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
import { sql, uid } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { sendEmail } from "@/lib/mailer";
import { TRANSITION_GATES, STATUS_SEQUENCE, type JobMeta } from "@/lib/transition-gates";
import { buildEngineeringEmail } from "@/lib/engineering-email";
import { createDraftInvoice, invoiceExists } from "@/lib/invoices";

type JobRow = JobMeta & {
  status: string;
  install_type?: string | null;
  delivery_date?: string | null;
  bid_number?: string | null;
};

function resolveRecipient(key: string, job: JobRow): string | null {
  switch (key) {
    case "client":      return job.client_email ?? null;
    case "pm":          return process.env.PM_EMAIL ?? null;
    case "eng":         return process.env.ENG_EMAIL ?? process.env.PM_EMAIL ?? null;
    case "shop":        return process.env.SHOP_EMAIL ?? process.env.PM_EMAIL ?? null;
    case "residential": return process.env.RESIDENTIAL_EMAIL ?? process.env.PM_EMAIL ?? null;
    default:            return null;
  }
}

function parseWoNumber(filename: string): { woNumber: string; woType: "wo" | "co" } | null {
  const m = filename.match(/^(WO|CO)(\d+)\./i);
  if (!m) return null;
  return { woNumber: m[2], woType: m[1].toLowerCase() === "co" ? "co" : "wo" };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const [punchCheck] = await sql<Array<{ open_count: number }>>`
      SELECT COUNT(*) AS open_count FROM punch_list_items
      WHERE job_id = ${internalId} AND status = 'open'
    `;
    const openCount = Number(punchCheck?.open_count ?? 0);
    if (openCount > 0) {
      return NextResponse.json(
        { error: `Cannot mark complete — ${openCount} punch item${openCount !== 1 ? "s" : ""} still open.` },
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
    const toAddress = gate.recipients
      .map((k) => resolveRecipient(k, job))
      .filter(Boolean)
      .join(", ");

    const ccAddress = (gate.ccKeys ?? [])
      .map((k) => resolveRecipient(k, job))
      .filter(Boolean)
      .join(", ") || undefined;

    if (toAddress) {
      let emailOpts: Parameters<typeof sendEmail>[0];

      if (toStatus === "engineering") {
        const { subject, text, html, attachments } = await buildEngineeringEmail(job, internalId, note);
        emailOpts = { to: toAddress, cc: ccAddress, subject, text, html, attachments: attachments.length ? attachments : undefined };
      } else {
        const subject = gate.subject(job);
        const text    = gate.body(job, note);
        emailOpts = { to: toAddress, cc: ccAddress, subject, text };
      }

      const result = await sendEmail(emailOpts);

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

  // ── 8. Auto-create balance invoice draft on delivery ───────
  if (toStatus === "delivered") {
    const alreadyExists = await invoiceExists(internalId, "balance").catch(() => true);
    if (!alreadyExists) {
      const label = [job.client_name, job.site_address].filter(Boolean).join(" — ");
      await createDraftInvoice({
        jobId: internalId,
        jobLabel: label,
        invoiceType: "balance",
        createdBy: _actor,
      }).catch(() => {});
    }
  }

  return NextResponse.json({
    ok: true,
    fromStatus: job.status,
    toStatus,
    emailErrors: emailErrors.length ? emailErrors : undefined,
  });
}
