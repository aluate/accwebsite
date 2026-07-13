export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET() {
  await requireRole("admin");
  const rows = await sql`SELECT * FROM estimate_settings WHERE id = 'singleton'`;
  return NextResponse.json({ settings: rows[0] ?? null });
}

export async function PUT(req: NextRequest) {
  await requireRole("admin");
  const body = await req.json();
  const now = new Date().toISOString();

  await sql`
    UPDATE estimate_settings SET
      pm_hrs_base         = COALESCE(${body.pm_hrs_base ?? null}, pm_hrs_base),
      pm_hrs_per_fg       = COALESCE(${body.pm_hrs_per_fg ?? null}, pm_hrs_per_fg),
      eng_hrs_base        = COALESCE(${body.eng_hrs_base ?? null}, eng_hrs_base),
      eng_hrs_per_fg      = COALESCE(${body.eng_hrs_per_fg ?? null}, eng_hrs_per_fg),
      purchasing_hrs_base = COALESCE(${body.purchasing_hrs_base ?? null}, purchasing_hrs_base),
      pm_rate             = COALESCE(${body.pm_rate ?? null}, pm_rate),
      eng_rate            = COALESCE(${body.eng_rate ?? null}, eng_rate),
      shop_rate           = COALESCE(${body.shop_rate ?? null}, shop_rate),
      finish_rate         = COALESCE(${body.finish_rate ?? null}, finish_rate),
      install_rate        = COALESCE(${body.install_rate ?? null}, install_rate),
      fixed_overhead_pct  = COALESCE(${body.fixed_overhead_pct ?? null}, fixed_overhead_pct),
      default_margin_pct  = COALESCE(${body.default_margin_pct ?? null}, default_margin_pct),
      updated_at          = ${now}
    WHERE id = 'singleton'
  `;

  return NextResponse.json({ ok: true });
}
