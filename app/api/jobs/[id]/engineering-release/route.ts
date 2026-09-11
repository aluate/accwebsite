import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { getBuilder, guardApi } from "@/lib/auth";
import { sendEmail } from "@/lib/mailer";
import { isComplete } from "@/lib/engineering-release-checklist";
import { computeAutoChecked, mergeChecklist } from "@/lib/engineering-autocheck";
import { addWorkingDays } from "@/lib/schedule-utils";
import { storageClient } from "@/lib/file-store";
import { resolveRecipients, jobRoleAddresses } from "@/lib/notification-routing";
import { resolveJobId } from "@/lib/job-id";

export const runtime = "nodejs";

const BUCKET = "job-files";
/*
  These two addresses used to be the recipients, written here in the source, so
  changing who the engineering release reaches meant editing this file and
  deploying. They are the DEFAULT now, declared in lib/notification-events.ts
  under "engineering_release" and editable at /admin/notifications — the same
  people until someone says otherwise.
*/

function supabaseAdmin() {
  return storageClient();
}

// GET — return the most recent release for this job (or null)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(["admin", "pm", "engineer"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id: rawId } = await params;
  const id = await resolveJobId(rawId);
  if (!id) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const [row] = await sql<{
    id: string; released_at: string; released_by: string;
    notes: string | null; drawing_file_ids: string[]; email_to: string; email_cc: string | null;
  }[]>`
    SELECT id, released_at, released_by, notes, drawing_file_ids, email_to, email_cc
    FROM engineering_releases
    WHERE job_id = ${id}
    ORDER BY released_at DESC
    LIMIT 1
  `;

  return NextResponse.json({ release: row ?? null });
}

// POST — validate checklist, fetch drawings, send email, log release
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getBuilder();
  if (!session || !["karl", "admin", "pm", "engineer"].includes(session.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id: rawId } = await params;

  /*
    ── 1. Load job ───────────────────────────────────────────────────────────

    Everything below keys off job.id, not the URL parameter. The job lookup
    accepted either name, but the checklist and the attachment query underneath
    used the raw parameter — so reached by job number, which is every link in
    the app, this route read an empty checklist and found no drawings, and
    refused the release for both reasons at once.
  */
  const [job] = await sql<{
    id: string; job_number: string | null; client_name: string;
    site_address: string; city: string; pm: string; delivery_date: string | null;
  }[]>`SELECT id, job_number, client_name, site_address, city, pm, delivery_date
        FROM jobs WHERE id = ${rawId} OR job_number = ${rawId}`;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // ── 2. Validate checklist (merge manual + auto-checked + drawings gate) ──
  const [clRow, autoChecked] = await Promise.all([
    sql<{ checklist: Record<string, boolean> }[]>`
      SELECT checklist FROM engineering_release_checklists WHERE job_id = ${job.id}
    `.then((r) => r[0]),
    computeAutoChecked(job.id),
  ]);
  const manualChecklist = clRow?.checklist ?? {};

  // ── 3. Load files from 05_drawings and 03_job_specs — newest per base filename ───
  const allFileRows = await sql<{
    id: string; filename: string; storage_path: string; uploaded_at: string; kind: string;
  }[]>`
    SELECT id, filename, storage_path, uploaded_at, kind
    FROM job_files
    WHERE job_id = ${job.id} AND kind IN ('05_drawings', '03_job_specs')
    ORDER BY uploaded_at DESC
  `;
  const drawingsExist = allFileRows.length > 0;
  const merged = mergeChecklist(manualChecklist, autoChecked, drawingsExist);
  if (!isComplete(merged)) {
    return NextResponse.json({ error: "Checklist not complete — all items must be checked before releasing." }, { status: 422 });
  }
  if (!drawingsExist) {
    return NextResponse.json({ error: "No drawings or specs uploaded. Upload files to the Drawings (05) or Job Specs (03) folders before releasing." }, { status: 422 });
  }

  // Canon set: newest per base filename from 05_drawings + single newest from 03_job_specs
  const seen = new Set<string>();
  const canonDrawings = allFileRows.filter((r) => {
    if (r.kind === "03_job_specs") return false; // handled below
    const base = r.filename.replace(/^\d+-/, "");
    if (seen.has(base)) return false;
    seen.add(base);
    return true;
  });
  const latestSpec = allFileRows.find((r) => r.kind === "03_job_specs");
  if (latestSpec) canonDrawings.push(latestSpec);

  // ── 4. Fetch drawing bytes from Supabase storage ─────────────────────────
  const supabase = supabaseAdmin();
  const attachments: Array<{ filename: string; content: Buffer }> = [];

  for (const drawing of canonDrawings) {
    const { data, error } = await supabase.storage.from(BUCKET).download(drawing.storage_path);
    if (error || !data) {
      console.error("[eng-release] Could not fetch drawing:", drawing.storage_path, error);
      continue;
    }
    const arrayBuf = await data.arrayBuffer();
    attachments.push({ filename: drawing.filename.replace(/^\d+-/, ""), content: Buffer.from(arrayBuf) });
  }

  if (attachments.length === 0) {
    return NextResponse.json({ error: "Could not fetch files from storage. Check that drawings and specs are uploaded." }, { status: 500 });
  }

  // ── 5. Parse request body ────────────────────────────────────────────────
  const body = await req.json() as {
    notes?: string;
    install_start_date?: string | null;
    install_duration_days?: number | null;
  };
  const notes = (body.notes ?? "").trim();
  const installStartDate  = body.install_start_date  ?? null;
  const installDurationDays = Math.max(1, body.install_duration_days ?? 1);

  // ── 6. Compose email ─────────────────────────────────────────────────────
  const jobRef  = job.job_number ? `JOB#${job.job_number}` : `JOB ${job.id}`;
  const subject = `${jobRef} RELEASED FOR ENGINEERING`;

  const lines: string[] = [
    `${jobRef} IS RELEASED FOR ENGINEERING. DRAWINGS ATTACHED.`,
    "",
  ];
  if (notes) {
    lines.push(notes, "");
  }
  lines.push(
    "──────────────────────────────",
    `Job:      ${jobRef} — ${job.client_name}`,
    `Address:  ${[job.site_address, job.city].filter(Boolean).join(", ")}`,
    `PM:       ${job.pm || "—"}`,
    ...(job.delivery_date ? [`Delivery: ${job.delivery_date}`] : []),
    `Released: ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PT`,
    `By:       ${session.name ?? session.username ?? "PM"}`,
    "──────────────────────────────",
  );
  const emailText = lines.join("\n");

  // ── 7. Send email ────────────────────────────────────────────────────────
  // Who this reaches is configuration, not code. `sender` is the releasing PM,
  // cc'd by default so the reply chain includes them.
  const resolved = await resolveRecipients(
    "engineering_release",
    jobRoleAddresses(job, { sender: session.email ?? null }),
  );

  if (!resolved.enabled || resolved.to.length === 0) {
    return NextResponse.json(
      { error: "Nobody is set to receive the engineering release. Set a recipient in Admin → Automated Emails." },
      { status: 400 },
    );
  }

  const result = await sendEmail({
    to:          resolved.to,
    cc:          resolved.cc,
    subject,
    text:        emailText,
    attachments,
    roleOf:      (a) => resolved.roleByAddress[a.toLowerCase()],
    event:       "engineering_release",
  });

  if (!result.ok) {
    console.error("[eng-release] Email send failed:", result.error);
    return NextResponse.json({ error: "Email failed: " + result.error }, { status: 500 });
  }

  // ── 8. Log the release ───────────────────────────────────────────────────
  const releaseId = uid();
  const now       = new Date().toISOString();
  const actor     = session.name ?? session.username ?? "PM";

  await sql`
    INSERT INTO engineering_releases
      (id, job_id, released_at, released_by, notes, drawing_file_ids, email_to, email_cc)
    VALUES (
      ${releaseId}, ${job.id}, ${now}, ${actor},
      ${notes || null},
      ${JSON.stringify(canonDrawings.map((d) => d.id))}::jsonb,
      ${resolved.to.join(", ")}, ${resolved.cc.join(", ") || null}
    )
  `;

  // ── 9. Create install event on schedule ────────────────────────────────
  try {
    const eventId = uid();
    const endDate = installStartDate && installDurationDays > 1
      ? addWorkingDays(installStartDate, installDurationDays - 1)
      : null;
    await sql`
      INSERT INTO job_events
        (id, job_id, event_type, date_start, date_end, duration_days,
         status, created_at, created_by, updated_at, updated_by, sort_order)
      VALUES (
        ${eventId}, ${job.id}, 'install',
        ${installStartDate}, ${endDate}, ${installDurationDays},
        'scheduled', ${now}, ${actor}, ${now}, ${actor}, 0
      )
    `;
  } catch (err) {
    console.error("[eng-release] Could not create install event:", err);
    // Non-fatal — release already logged
  }

  return NextResponse.json({
    ok:         true,
    releaseId,
    releasedAt: now,
    previewMode: (result as { previewMode?: boolean }).previewMode ?? false,
    drawingsSent: attachments.length,
  });
}
