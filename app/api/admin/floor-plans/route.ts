export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET() {
  await requireRole("admin");
  const plans = await sql`SELECT * FROM builder_floor_plans ORDER BY builder_company, plan_name`;
  return NextResponse.json({ plans });
}

export async function POST(req: NextRequest) {
  await requireRole("admin");
  const body = await req.json() as {
    builder_company: string; plan_name: string; description?: string;
    rooms?: { room_name: string; finish_group_name?: string; sort_order?: number; default_ceiling_height?: string; default_flooring?: string }[];
  };
  if (!body.builder_company?.trim()) return NextResponse.json({ error: "builder_company required" }, { status: 400 });
  if (!body.plan_name?.trim()) return NextResponse.json({ error: "plan_name required" }, { status: 400 });

  const [plan] = await sql`
    INSERT INTO builder_floor_plans (builder_company, plan_name, description)
    VALUES (${body.builder_company}, ${body.plan_name}, ${body.description ?? null})
    RETURNING *
  `;

  const rooms = [];
  for (let i = 0; i < (body.rooms ?? []).length; i++) {
    const r = body.rooms![i];
    const [room] = await sql`
      INSERT INTO builder_floor_plan_rooms (floor_plan_id, room_name, finish_group_name, sort_order, default_ceiling_height, default_flooring)
      VALUES (${plan.id}, ${r.room_name}, ${r.finish_group_name ?? null}, ${r.sort_order ?? i}, ${r.default_ceiling_height ?? null}, ${r.default_flooring ?? null})
      RETURNING *
    `;
    rooms.push(room);
  }

  return NextResponse.json({ plan, rooms }, { status: 201 });
}
