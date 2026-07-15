import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { getBuilder } from "@/lib/auth";
import { sendEmail } from "@/lib/mailer";
import { isComplete } from "@/lib/engineering-release-checklist";
import { addWorkingDays } from "@/lib/schedule-utils";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const BUCKET = "job-files";
const ENG_EMAIL  = "joshl@advancedcabinets.net";
const DEPT_EMAIL = "residential@advancedcabinets.net";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET — return the most recent release for this job (or null)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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

  const { id } = await params;

  // ── 1. Load job ─────────────────────────────────────────────────────────
  const [job] = await sql<{
    id: string; job_number: string | null; client_name: string;
    site_address: string; city: string; pm: string; delivery_date: string | null;
  }[]>`SELECT id, job_number, client_name, site_address, city, pm, delivery_date
        FROM jobs WHERE id = ${id}`;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // ── 2. Validate checklist ────────────────────────────────────────────────
  const [clRow] = await sql<{ checklist: Record<string, boolean> }[]>`
    SELECT checklist FROM engineering_release_checklists WHERE job_id = ${id}
  `;
  const checklist = clRow?.checklist ?? {};
  if (!isComplete(checklist)) {
    return NextResponse.json({ error: "Checklist not complete — all items must be checked before releasing." }, { status: 422 });
  }

  // ── 3. Load eng_drawings files (newest upload per filename, then all) ───
  const drawingRows = await sql<{
    id: string; filename: string; storage_path: string; uploaded_at: string;
  }[]>`
    SELECT id, filename, storage_path, uploaded_at
    FROM job_files
    WHERE job_id = ${id} AND kind = '16_eng_drawings'
    ORDER BY uploaded_at DESC
  `;
  if (drawingRows.length === 0) {
    return NextResponse.json({ error: "No approved drawings uploaded. Upload drawings before releasing." }, { status: 422 });
  }

  // "Newest version is canon" — deduplicate by base filename (strip leading timestamp)
  const seen = new Set<string>();
  const canonDrawings = drawingRows.filter((r) => {
    const base = r.filename.replace(/^\d+-/, ""); // strip ts prefix added by storagePath()
    if (seen.has(base)) return false;
    seen.add(base);
    return true;
  });

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
    return NextResponse.json({ error: "Could not fetch drawing files from storage." }, { status: 500 });
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
  // CC: department inbox + the releasing PM's own email (makes reply chains easy)
  const ccAddresses = [DEPT_EMAIL];
  if (session.email && session.email !== DEPT_EMAIL) ccAddresses.push(session.email);
  const ccString = ccAddresses.join(", ");

  const result = await sendEmail({
    to:          ENG_EMAIL,
    cc:          ccString,
    subject,
    text:        emailText,
    attachments,
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
      ${releaseId}, ${id}, ${now}, ${actor},
      ${notes || null},
      ${JSON.stringify(canonDrawings.map((d) => d.id))}::jsonb,
      ${ENG_EMAIL}, ${ccString}
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
        ${eventId}, ${id}, 'install',
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
