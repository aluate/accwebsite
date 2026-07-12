export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireRole("admin");
  const { id } = await params;

  const [estimateRows, roomRows, itemRows, settingsRows] = await Promise.all([
    sql`
      SELECT e.*, j.client_name, j.site_address, j.id AS linked_job_id
      FROM estimates e
      LEFT JOIN jobs j ON j.id = e.job_id
      WHERE e.id = ${id}
    `,
    sql`SELECT * FROM estimate_rooms WHERE estimate_id = ${id} ORDER BY sort_order`,
    sql`
      SELECT eli.*
      FROM estimate_line_items eli
      JOIN estimate_rooms er ON er.id = eli.room_id
      WHERE er.estimate_id = ${id}
      ORDER BY eli.sort_order
    `,
    sql`SELECT * FROM estimate_settings WHERE id = 'singleton'`,
  ]);

  if (!estimateRows[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    estimate: estimateRows[0],
    rooms: roomRows,
    items: itemRows,
    settings: settingsRows[0] ?? null,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireRole("admin");
  const { id } = await params;
  const body = await req.json();
  const now = new Date().toISOString();

  await sql`
    UPDATE estimates SET
      title               = COALESCE(${body.title ?? null}, title),
      job_id              = COALESCE(${body.job_id ?? null}, job_id),
      scope               = COALESCE(${body.scope ?? null}, scope),
      delivery_cost       = COALESCE(${body.delivery_cost ?? null}, delivery_cost),
      tax_amount          = COALESCE(${body.tax_amount ?? null}, tax_amount),
      is_budget_estimate  = COALESCE(${body.is_budget_estimate != null ? (body.is_budget_estimate ? 1 : 0) : null}, is_budget_estimate),
      target_margin_pct   = COALESCE(${body.target_margin_pct ?? null}, target_margin_pct),
      finish_group_count  = COALESCE(${body.finish_group_count ?? null}, finish_group_count),
      notes               = COALESCE(${body.notes ?? null}, notes),
      status              = COALESCE(${body.status ?? null}, status),
      profile_id          = COALESCE(${body.profile_id ?? null}, profile_id),
      updated_at          = ${now}
    WHERE id = ${id}
  `;

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireRole("admin");
  const { id } = await params;
  await sql`DELETE FROM estimates WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
