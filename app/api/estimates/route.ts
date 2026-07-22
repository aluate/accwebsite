export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const jobIdFilter = searchParams.get("job_id");
  await requireRole("admin");
  const estimates = await sql`
    SELECT e.*, j.client_name, j.site_address
    FROM estimates e
    LEFT JOIN jobs j ON j.id = e.job_id
    ${jobIdFilter ? sql`WHERE e.job_id = ${jobIdFilter}` : sql``}
    ORDER BY e.created_at DESC
  `;
  return NextResponse.json({ estimates });
}

export async function POST(req: NextRequest) {
  const builder = await requireRole("admin");
  const body = await req.json();
  const now = new Date().toISOString();
  const id = uid();

  await sql`
    INSERT INTO estimates (
      id, job_id, title, status, scope,
      delivery_cost, tax_amount, is_budget_estimate,
      target_margin_pct, finish_group_count, notes,
      created_by, created_at, updated_at
    ) VALUES (
      ${id},
      ${body.job_id ?? null},
      ${body.title ?? "New Estimate"},
      'draft',
      ${body.scope ?? "supply_install"},
      ${body.delivery_cost ?? 0},
      ${body.tax_amount ?? 0},
      ${body.is_budget_estimate ? 1 : 0},
      ${body.target_margin_pct ?? 48},
      ${body.finish_group_count ?? 1},
      ${body.notes ?? null},
      ${builder.id},
      ${now}, ${now}
    )
  `;

  // If job_id is provided, pre-populate rooms from the job's spec rooms
  if (body.job_id) {
    const specRooms = await sql`
      SELECT DISTINCT r.name, r.sort_order
      FROM rooms r
      JOIN residential_specs s ON s.id = r.spec_id
      WHERE s.job_id = ${body.job_id}
      ORDER BY r.sort_order
    `;
    for (const room of specRooms) {
      await sql`
        INSERT INTO estimate_rooms (id, estimate_id, name, sort_order)
        VALUES (${uid()}, ${id}, ${room.name}, ${room.sort_order})
      `;
    }
  }

  return NextResponse.json({ id }, { status: 201 });
}
