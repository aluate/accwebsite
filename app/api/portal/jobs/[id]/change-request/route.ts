import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requirePortalAccessToJob } from "@/lib/portal-auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePortalAccessToJob(id);
  const rows = await sql`
    SELECT * FROM builder_change_requests WHERE job_id = ${id} ORDER BY submitted_at DESC
  `;
  return NextResponse.json({ requests: rows });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requirePortalAccessToJob(id);
  const body = await req.json().catch(() => ({}));
  const text = String(body.body ?? "").trim();
  if (text.length < 5) return NextResponse.json({ error: "Body too short" }, { status: 400 });
  const crId = uid();
  // Optional: promoted from a drawing comment. We capture the comment's
  // metadata into the CR body so context isn't lost, then mark the comment
  // resolved with status='promoted_to_cr'.
  let finalBody = text;
  if (body.source_comment_id) {
    const [c] = await sql<{ drawing_filename: string; page_number: number | null; cabinet_ref: string | null; body: string }[]>`
      SELECT drawing_filename, page_number, cabinet_ref, body
      FROM drawing_comments WHERE id = ${String(body.source_comment_id)} AND job_id = ${id}
    `;
    if (c) {
      const ref = [c.cabinet_ref ? `Cabinet ${c.cabinet_ref}` : "", c.page_number ? `page ${c.page_number}` : "", c.drawing_filename].filter(Boolean).join(" · ");
      finalBody = `${text}\n\n[Promoted from drawing comment — ${ref}]\nOriginal comment: "${c.body}"`;
      await sql`
        UPDATE drawing_comments
        SET status = 'promoted', resolved_at = ${new Date().toISOString()},
            resolved_by = ${user.username}, resolution_notes = ${`Promoted to change request ${crId}`}
        WHERE id = ${String(body.source_comment_id)}
      `;
    }
  }
  await sql`
    INSERT INTO builder_change_requests (id, job_id, spec_id, submitted_at, submitted_by, body, status)
    VALUES (${crId}, ${id}, ${body.spec_id ?? null}, ${new Date().toISOString()}, ${user.username}, ${finalBody}, 'open')
  `;
  return NextResponse.json({ ok: true, id: crId }, { status: 201 });
}