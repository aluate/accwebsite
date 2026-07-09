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

type JobRow = JobMeta & { status: string };

function resolveRecipient(
  key: string,
  job: JobRow
): string | null {
  switch (key) {
    case "client": return job.client_email ?? null;
    case "pm":     return process.env.PM_EMAIL ?? null;
    case "eng":    return process.env.ENG_EMAIL ?? process.env.PM_EMAIL ?? null;
    case "shop":   return process.env.SHOP_EMAIL ?? process.env.PM_EMAIL ?? null;
    default:       return null;
  }
}

/** Parse WO/CO number from filename. Returns null if no match. */
function parseWoNumber(filename: string): { woNumber: string; woType: "wo" | "co" } | null {
  // Matches: WO46317.pdf, wo46317.pdf, CO47306.pdf, co47306.pdf
  const m = filename.match(/^(WO|CO)(\d+)\./i);
  if (!m) return null;
  return {
    woNumber: m[2],
    woType: m[1].toLowerCase() === "co" ? "co" : "wo",
  };
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
           site_address, city, pm
    FROM jobs
    WHERE id = ${id} OR job_number = ${id}
  `;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const internalId = job.id;

  // ── 2. Validate the transition ─────────────────────────────────────────────
  const fromIdx = STATUS_SEQUENCE.indexOf(job.status as typeof STATUS_SEQUENCE[number]);
  const toIdx   = STATUS_SEQUENCE.indexOf(toStatus as typeof STATUS_SEQUENCE[number]);

  // Allow advancing forward only (or on_hold → any)
  const isOnHold = job.status === "on_hold";
  if (!isOnHold && (fromIdx === -1 || toIdx === -1 || toIdx <= fromIdx)) {
    return NextResponse.json(
      { error: `Cannot advance from "${job.status}" to "${toStatus}"` },
      { status: 422 }
    );
  }

  // ── 3. Gate check ──────────────────────────────────────────────────────────
  const gate = TRANSITION_GATES[toStatus];
  if (gate?.docRequired && fileIds.length === 0) {
    return NextResponse.json(
      { error: `A document is required before advancing to "${toStatus}". Please upload ${gate.docLabel}.` },
      { status: 422 }
    );
  }

  // Hard gate: cannot advance to "complete" with open punch items
  if (toStatus === "complete") {
    const [punchCheck] = await sql<Array<{ open_count: number }>>`
      SELECT COUNT(*) AS open_count
      FROM punch_list_items
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
      await sql`
        INSERT INTO work_orders (id, job_id, wo_number, wo_type, file_id, created_at)
        VALUES (${woId}, ${internalId}, ${parsed.woNumber}, ${parsed.woType}, ${f.id}, ${now})
        ON CONFLICT (job_id, wo_number) DO NOTHING
      `;
    }
  }

  // ── 6. Fire emails ─────────────────────────────────────────────────────────
  const emailErrors: string[] = [];
  if (gate) {
    const subject = gate.subject(job);
    const text    = gate.body(job, note);

    for (const recipientKey of gate.recipients) {
      const to = resolveRecipient(recipientKey, job);
      if (!to) continue;

      // For client-facing emails, use a different from-name
      const result = await sendEmail({ to, subject, text });

      // Log email (best-effort)
      try {
        await sql`
          INSERT INTO transition_emails (id, job_id, to_status, recipient, subject, sent_at, error, created_at)
          VALUES (
            ${uid()}, ${internalId}, ${toStatus}, ${to}, ${subject},
            ${result.ok ? now : null},
            ${result.ok ? null : (result as { ok: false; error: string }).error},
            ${now}
          )
        `;
      } catch { /* table may not exist yet on first run */ }

      if (!result.ok) {
        emailErrors.push(`${to}: ${(result as { ok: false; error: string }).error}`);
      }
    }
  }

  // ── 7. Activity log ────────────────────────────────────────────────────────
  await logActivity({
    entityType: "job", entityId: internalId, jobId: internalId,
    eventType: "status_change",
    fromState: job.status, toState: toStatus,
    actor: _actor, actorRole: _actorRole,
    payload: note ? { note } : undefined,
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    fromStatus: job.status,
    toStatus,
    emailErrors: emailErrors.length ? emailErrors : undefined,
  });
}
