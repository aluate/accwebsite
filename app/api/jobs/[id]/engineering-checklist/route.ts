import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getBuilder, guardApi } from "@/lib/auth";
import { computeAutoChecked } from "@/lib/engineering-autocheck";

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
  const { id } = await params;

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

  const { id } = await params;
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
