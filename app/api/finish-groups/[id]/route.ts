export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireBuilderApi } from "@/lib/auth";

/**
 * PATCH /api/finish-groups/[id]
 * Updates planning-only fields (box_count, wo_count) on a finish group.
 * Auth: admin/karl only (these are internal planning fields, not visible on specs).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireBuilderApi();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // PM role: verify they own the parent job
  const isPrivileged = session.role === "karl" || session.role === "admin";
  if (!isPrivileged) {
    if (session.role !== "pm") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const [ownership] = await sql`
      SELECT 1 FROM finish_groups fg
      JOIN residential_specs rs ON rs.id = fg.spec_id
      JOIN jobs j ON j.id = rs.job_id
      WHERE fg.id = ${id} AND j.pm = ${session.email}
    `;
    if (!ownership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json() as { box_count?: number | null; wo_count?: number | null; pm_complexity?: number | null };

  const allowed = ["box_count", "wo_count", "pm_complexity"];
  const updates: Record<string, number | null> = {};
  for (const k of allowed) {
    if (k in body) updates[k] = (body as Record<string, number | null>)[k] ?? null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const [row] = await sql`SELECT id FROM finish_groups WHERE id = ${id}`;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await sql`UPDATE finish_groups SET ${sql(updates)} WHERE id = ${id}`;

  return NextResponse.json({ ok: true });
}
