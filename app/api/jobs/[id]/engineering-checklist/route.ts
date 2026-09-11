import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getBuilder, guardApi } from "@/lib/auth";
import { computeAutoChecked } from "@/lib/engineering-autocheck";
import { resolveJobId } from "@/lib/job-id";

export const runtime = "nodejs";

/*
  The auto-check rules live in lib/engineering-autocheck.ts. A copy of them sat
  here too, marked "kept for reference only — remove after confirming import
  works", and drifted: it still keyed the pull items off the dead
  finish_groups.pull_id column after the shared one was fixed. Two copies of a
  rule is one copy of the rule and one lie about it, so the copy is gone.
*/

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(["admin", "pm", "engineer"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id: rawId } = await params;

  /*
    Resolve first. Every link into this route carries the five-digit job
    number, and engineering_release_checklists.job_id holds the internal id, so
    reading with the raw parameter found nothing and computeAutoChecked() gave
    up after three job-level keys.

    Measured on one job, same moment: by number, 3 auto-check keys and none
    true; by internal id, 25 keys and 15 true. The PM saw an untouched
    fifty-four item checklist on a job where fifteen items were already proven,
    and the release refuses without a complete checklist. This one line is why
    releasing to engineering could not be done.
  */
  const id = await resolveJobId(rawId);
  if (!id) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const [[row], autoChecked] = await Promise.all([
    sql<{ checklist: Record<string, boolean> }[]>`
      SELECT checklist FROM engineering_release_checklists WHERE job_id = ${id}
    `,
    computeAutoChecked(id),
  ]);

  return NextResponse.json({
    checklist:   row?.checklist ?? {},
    autoChecked,
  });
}

// POST — save (upsert) checklist state
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getBuilder();
  if (!session || !["karl", "admin", "pm", "engineer"].includes(session.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Same resolution on the way in: job_id has a foreign key to jobs(id), so
  // an insert keyed on the job number failed the constraint and answered 500.
  // Ticking a box by hand did not save either.
  const { id: rawId } = await params;
  const id = await resolveJobId(rawId);
  if (!id) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const body = await req.json() as { checklist: Record<string, boolean> };
  if (!body?.checklist || typeof body.checklist !== "object") {
    return NextResponse.json({ error: "Missing checklist" }, { status: 400 });
  }

  const now = new Date().toISOString();
  await sql`
    INSERT INTO engineering_release_checklists (job_id, checklist, updated_at)
    VALUES (${id}, ${JSON.stringify(body.checklist)}::jsonb, ${now})
    ON CONFLICT (job_id) DO UPDATE
      SET checklist  = EXCLUDED.checklist,
          updated_at = EXCLUDED.updated_at
  `;

  return NextResponse.json({ ok: true });
}
