export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET() {
  await requireRole("admin");

  const jobs = await sql`
      SELECT
        j.id, j.client_name, j.site_address, j.city, j.status,
        j.job_number, j.pm, j.delivery_date, j.created_at, j.seq,
        j.estimated_value,
        e.id           AS estimate_id,
        e.sell_price_snapshot,
        e.shop_labor_hrs_snapshot,
        e.install_labor_hrs_snapshot,
        -- Box count: prefer spec finish_groups sum, fall back to estimate line items
        COALESCE(
          (SELECT NULLIF(SUM(fg.box_count), 0)
           FROM finish_groups fg
           JOIN residential_specs rs ON rs.id = fg.spec_id
           WHERE rs.job_id = j.id),
          (SELECT COALESCE(SUM(eli.qty), 0)
           FROM estimate_line_items eli
           JOIN estimate_rooms er ON er.id = eli.room_id
           WHERE er.estimate_id = e.id
             AND eli.item_type = 'cabinet'
             AND eli.manual_unit_cost IS NULL)
        ) AS box_count,
        -- FG breakdown: label + box count per finish group
        (SELECT JSON_AGG(JSON_BUILD_OBJECT('label', fg.label, 'boxes', fg.box_count) ORDER BY fg.sort_order)
         FROM finish_groups fg
         JOIN residential_specs rs ON rs.id = fg.spec_id
         WHERE rs.job_id = j.id AND fg.box_count > 0
        ) AS fg_boxes,
        -- Anticipated delivery: prefer schedule install event start date, then jobs.delivery_date
        COALESCE(
          (SELECT je.date_start FROM job_events je
           WHERE je.job_id = j.id AND je.event_type = 'install' AND je.date_start IS NOT NULL
           ORDER BY je.date_start ASC LIMIT 1),
          j.delivery_date
        ) AS anticipated_delivery
      FROM jobs j
      LEFT JOIN LATERAL (
        SELECT * FROM estimates
        WHERE job_id = j.id
        ORDER BY updated_at DESC
        LIMIT 1
      ) e ON true
      WHERE j.status NOT IN ('complete', 'cancelled')
      ORDER BY j.seq DESC
    `;
  const settings = await sql`SELECT shop_capacity_hrs_per_week, install_capacity_hrs_per_week FROM estimate_settings WHERE id = 'singleton'`;
  const pms = await sql`SELECT id, name FROM builder_accounts WHERE role IN ('pm','admin','karl') AND active = 1 ORDER BY name`;

  return NextResponse.json({
    jobs,
    pms,
    capacity: settings[0] ?? { shop_capacity_hrs_per_week: 40, install_capacity_hrs_per_week: 32 },
  });
}

export async function PATCH(req: Request) {
  await requireRole("admin");
  const body = await req.json() as {
    shop_capacity_hrs_per_week?: number;
    install_capacity_hrs_per_week?: number;
  };
  const now = new Date().toISOString();
  await sql`
    UPDATE estimate_settings SET
      shop_capacity_hrs_per_week    = COALESCE(${body.shop_capacity_hrs_per_week ?? null}, shop_capacity_hrs_per_week),
      install_capacity_hrs_per_week = COALESCE(${body.install_capacity_hrs_per_week ?? null}, install_capacity_hrs_per_week),
      updated_at = ${now}
    WHERE id = 'singleton'
  `;
  return NextResponse.json({ ok: true });
}
