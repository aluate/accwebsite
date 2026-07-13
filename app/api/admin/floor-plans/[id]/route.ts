export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { uid } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  const [plan] = await sql`SELECT * FROM builder_floor_plans WHERE id = ${id}`;
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });
  const rooms = await sql`SELECT * FROM builder_floor_plan_rooms WHERE floor_plan_id = ${id} ORDER BY sort_order`;
  return NextResponse.json({ plan, rooms });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  const body = await req.json() as {
    builder_company?: string;
    plan_name?: string;
    description?: string | null;
    rooms?: Array<{ room_name: string; finish_group_name?: string; default_ceiling_height?: string; default_flooring?: string }>;
  };

  const [plan] = await sql`
    UPDATE builder_floor_plans
    SET builder_company = COALESCE(${body.builder_company ?? null}, builder_company),
        plan_name = COALESCE(${body.plan_name ?? null}, plan_name),
        description = COALESCE(${body.description ?? null}, description)
    WHERE id = ${id} RETURNING *
  `;
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Replace rooms if provided
  if (body.rooms !== undefined) {
    await sql`DELETE FROM builder_floor_plan_rooms WHERE floor_plan_id = ${id}`;
    for (let i = 0; i < body.rooms.length; i++) {
      const r = body.rooms[i];
      if (!r.room_name?.trim()) continue;
      await sql`
        INSERT INTO builder_floor_plan_rooms (id, floor_plan_id, room_name, finish_group_name, default_ceiling_height, default_flooring, sort_order)
        VALUES (${uid()}, ${id}, ${r.room_name.trim()}, ${r.finish_group_name?.trim() || null}, ${r.default_ceiling_height?.trim() || null}, ${r.default_flooring?.trim() || null}, ${i})
      `;
    }
  }

  const rooms = await sql`SELECT * FROM builder_floor_plan_rooms WHERE floor_plan_id = ${id} ORDER BY sort_order`;
  return NextResponse.json({ plan, rooms });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return PATCH(req, { params });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  await sql`DELETE FROM builder_floor_plans WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
