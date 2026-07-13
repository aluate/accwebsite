export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { sql } from "@/lib/db";

export async function POST() {
  try {
    const file = path.join(process.cwd(), "data", "catalogs", "builder_profiles.json");
    const profiles = JSON.parse(fs.readFileSync(file, "utf-8")) as Array<Record<string, unknown>>;

    let upserted = 0;
    for (const p of profiles) {
      await sql`
        INSERT INTO catalog_builder_profiles
          (id, builder_name, builder_company, default_finish_type,
           default_carcass_id, default_drawer_box_id, default_pull_id,
           default_paint_brand, notes, is_residential_default)
        VALUES (
          ${String(p.id ?? "")},
          ${String(p.builder_name ?? "")},
          ${p.builder_company ? String(p.builder_company) : null},
          ${String(p.default_finish_type ?? "paint")},
          ${p.default_carcass_id  ? String(p.default_carcass_id)  : null},
          ${p.default_drawer_box_id ? String(p.default_drawer_box_id) : null},
          ${p.default_pull_id     ? String(p.default_pull_id)     : null},
          ${p.default_paint_brand ? String(p.default_paint_brand) : null},
          ${p.notes               ? String(p.notes)               : null},
          ${p.is_residential_default ? 1 : 0}
        )
        ON CONFLICT (id) DO UPDATE SET
          builder_name          = EXCLUDED.builder_name,
          builder_company       = EXCLUDED.builder_company,
          default_finish_type   = EXCLUDED.default_finish_type,
          default_carcass_id    = EXCLUDED.default_carcass_id,
          default_drawer_box_id = EXCLUDED.default_drawer_box_id,
          default_pull_id       = EXCLUDED.default_pull_id,
          default_paint_brand   = EXCLUDED.default_paint_brand,
          notes                 = EXCLUDED.notes,
          is_residential_default = EXCLUDED.is_residential_default
      `;
      upserted++;
    }
    return NextResponse.json({ ok: true, upserted });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
