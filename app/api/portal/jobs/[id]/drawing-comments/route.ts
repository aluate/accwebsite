export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requirePortalAccessToJob } from "@/lib/portal-auth";
import { sendEmail } from "@/lib/mailer";

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
    void sendEmail({
      to: user.contact_email,
      template: "comment-confirmation",
      vars: {
        display_name: user.display_name,
        job_id: id,
        comment_body: text,
        portal_url: process.env.PORTAL_URL ?? "https://www.advancedcabinets.org",
      },
    });
  }

  return NextResponse.json({ ok: true, id: cid });
}
