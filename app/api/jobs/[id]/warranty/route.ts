import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin", "pm", "engineer", "installer"]);
  const { id } = await params;
  const items = await sql`
    SELECT * FROM warranty_items WHERE job_id = ${id} ORDER BY reported_at DESC
  `;
  return NextResponse.json(items);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(["admin", "pm"]);
  const { id: jobId } = await params;
  const body = await req.json() as { category?: string; description: string; priority?: string; notes?: string };

  if (!body.description?.trim()) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const item = await sql`
    INSERT INTO warranty_items (id, job_id, reported_at, reported_by, category, description, priority, notes)
    VALUES (${uid()}, ${jobId}, ${now}, ${session.name ?? session.username}, ${body.category ?? "general"}, ${body.description.trim()}, ${body.priority ?? "normal"}, ${body.notes ?? null})
    RETURNING *
  `;
  logActivity({ entityType: "warranty", entityId: item[0].id as string, jobId,
    eventType: "created", actor: session.name ?? session.username, actorRole: session.role,
    payload: { category: body.category ?? "general", priority: body.priority ?? "normal" } }).catch(() => {});

  return NextResponse.json(item[0], { status: 201 });
}
