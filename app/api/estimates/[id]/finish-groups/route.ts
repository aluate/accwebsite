export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  const rows = await sql`SELECT * FROM estimate_finish_groups WHERE estimate_id = ${id} ORDER BY sort_order`;
  return NextResponse.json({ groups: rows });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  const body = await req.json();
  const fgId = uid();
  const now = new Date().toISOString();
  await sql`
    INSERT INTO estimate_finish_groups (id, estimate_id, name, sort_order, finish_catalog_id, door_catalog_id, pull_catalog_id, carcass_catalog_id, created_at)
    VALUES (${fgId}, ${id}, ${body.name ?? "Finish Group"}, ${body.sort_order ?? 0},
            ${body.finish_catalog_id ?? null}, ${body.door_catalog_id ?? null},
            ${body.pull_catalog_id ?? null}, ${body.carcass_catalog_id ?? "ACC-CARC-HARDROCK"}, ${now})
  `;
  const [fg] = await sql`SELECT * FROM estimate_finish_groups WHERE id = ${fgId}`;
  return NextResponse.json({ fg });
}
