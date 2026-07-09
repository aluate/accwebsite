import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getBuilder } from "@/lib/auth";

export const runtime = "nodejs";

// GET — load saved checklist state for this job
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [row] = await sql<{ checklist: Record<string, boolean> }[]>`
    SELECT checklist FROM engineering_release_checklists WHERE job_id = ${id}
  `;

  return NextResponse.json({ checklist: row?.checklist ?? {} });
}

// POST — save (upsert) checklist state
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getBuilder();
  if (!session || !["admin", "pm", "engineer"].includes(session.role ?? "")) {
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
