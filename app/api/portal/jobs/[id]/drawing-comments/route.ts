export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requirePortalAccessToJob } from "@/lib/portal-auth";
import { sendEmail } from "@/lib/mailer";
import { portalCommentConfirmation } from "@/lib/email-templates";
import { jobLabelShort, labelFromRef } from "@/lib/job-label";

// GET ?file=... — list comments on a specific drawing file (latest only,
// per Karl's spec: only latest version visible to builder)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePortalAccessToJob(id);
  const file = req.nextUrl.searchParams.get("file");
  let rows;
  if (file) {
    rows = await sql`
      SELECT * FROM drawing_comments WHERE job_id = ${id} AND drawing_filename = ${file} ORDER BY submitted_at
    `;
  } else {
    rows = await sql`
      SELECT * FROM drawing_comments WHERE job_id = ${id} ORDER BY submitted_at
    `;
  }
  return NextResponse.json({ comments: rows });
}

// POST { drawing_filename, page_number?, cabinet_ref?, body }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requirePortalAccessToJob(id);
  const b = await req.json().catch(() => ({}));
  const fname = String(b.drawing_filename ?? "");
  const text = String(b.body ?? "").trim();
  if (!fname) return NextResponse.json({ error: "drawing_filename required" }, { status: 400 });
  if (text.length < 3) return NextResponse.json({ error: "Comment too short" }, { status: 400 });
  const cid = uid();
  await sql`
    INSERT INTO drawing_comments (id, job_id, drawing_filename, page_number, cabinet_ref, body, submitted_at, submitted_by, submitted_role, status)
    VALUES (${cid}, ${id}, ${fname}, ${b.page_number ?? null}, ${b.cabinet_ref ?? null}, ${text}, ${new Date().toISOString()}, ${user.username}, 'builder', 'open')
  `;

  // Confirmation email back to the builder (if they have an email on file).
  if (user.contact_email) {
    /*
      jobLabel used to be `id` — the raw URL parameter, in the SUBJECT LINE of
      a message to a builder. On a portal link carrying the internal key that
      reads "ACC-2026-0288 - we have your comment", which is the one string
      Karl has said twice must never be visible to anyone outside.
    */
    const [labelRow] = (await sql`
      SELECT job_number, client_name, site_address, builder_company, builder_name
      FROM jobs WHERE id = ${id} OR job_number = ${id} LIMIT 1
    `) as Array<Record<string, string | null>>;

    const t = portalCommentConfirmation({
      displayName: user.display_name,
      jobLabel: labelRow ? jobLabelShort(labelRow) : (labelFromRef(id) ?? "Your job"),
      commentBody: text,
      portalUrl: process.env.PORTAL_URL ?? "https://www.advancedcabinets.org",
    });
    void sendEmail({ to: user.contact_email, subject: t.subject, text: t.text, html: t.html, audience: "builder", event: "portal_comment_confirmation" });
  }

  return NextResponse.json({ ok: true, id: cid });
}
