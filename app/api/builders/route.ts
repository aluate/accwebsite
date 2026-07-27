import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/builders?q=premier
// Returns builders matching the search query (company or contact_name)
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const like = `%${q}%`;

  const rows = await sql`
    SELECT id, company, contact_name, phone, email, typical_pm, notes,
           default_finish_type, default_carcass_id, default_drawer_box_id,
           default_pull_id, default_paint_brand, default_accessories,
           preferred_cabdoor_usage_groups, is_residential_default
    FROM builders
    WHERE active = 1
      AND (company ILIKE ${like} OR contact_name ILIKE ${like})
    ORDER BY company
    LIMIT 50
  `;

  return NextResponse.json(rows);
}

// POST /api/builders — create or update a builder (admin only)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { id, company, contact_name, phone, email, typical_pm, notes, active,
          default_finish_type, default_carcass_id, default_drawer_box_id,
          default_pull_id, default_paint_brand, default_accessories,
          preferred_cabdoor_usage_groups, is_residential_default } = body;
  if (!id || !company) return NextResponse.json({ error: "id and company required" }, { status: 400 });

  await sql`
    INSERT INTO builders (
      id, company, contact_name, phone, email, typical_pm, notes, active,
      default_finish_type, default_carcass_id, default_drawer_box_id,
      default_pull_id, default_paint_brand, default_accessories,
      preferred_cabdoor_usage_groups, is_residential_default,
      created_at, updated_at
    )
    VALUES (
      ${id}, ${company}, ${contact_name ?? null}, ${phone ?? null}, ${email ?? null},
      ${typical_pm ?? null}, ${notes ?? null}, ${active ?? 1},
      ${default_finish_type ?? "paint"}, ${default_carcass_id ?? null},
      ${default_drawer_box_id ?? null}, ${default_pull_id ?? null},
      ${default_paint_brand ?? null}, ${default_accessories ?? null},
      ${preferred_cabdoor_usage_groups ?? null}, ${is_residential_default ? 1 : 0},
      NOW()::text, NOW()::text
    )
    ON CONFLICT (id) DO UPDATE SET
      company                        = EXCLUDED.company,
      contact_name                   = EXCLUDED.contact_name,
      phone                          = EXCLUDED.phone,
      email                          = EXCLUDED.email,
      typical_pm                     = EXCLUDED.typical_pm,
      notes                          = EXCLUDED.notes,
      active                         = EXCLUDED.active,
      default_finish_type            = EXCLUDED.default_finish_type,
      default_carcass_id             = EXCLUDED.default_carcass_id,
      default_drawer_box_id          = EXCLUDED.default_drawer_box_id,
      default_pull_id                = EXCLUDED.default_pull_id,
      default_paint_brand            = EXCLUDED.default_paint_brand,
      default_accessories            = EXCLUDED.default_accessories,
      preferred_cabdoor_usage_groups = EXCLUDED.preferred_cabdoor_usage_groups,
      is_residential_default         = EXCLUDED.is_residential_default,
      updated_at                     = NOW()::text
  `;

  return NextResponse.json({ ok: true });
}
