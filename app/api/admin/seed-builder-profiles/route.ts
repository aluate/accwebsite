export const dynamic = "force-dynamic";

/**
 * ONE-TIME seed endpoint — populates catalog_builder_profiles from the
 * bundled JSON file. Call once, then this route can be removed.
 * Admin-only (requires active session with admin role).
 */
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { sql } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";

export async function POST() {
  const session = await requireBuilder();
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const file = path.join(process.cwd(), "data", "catalogs", "builder_profiles.json");
  const profiles = JSON.parse(fs.readFileSync(file, "utf-8")) as Array<Record<string, unknown>>;

  let upserted = 0;
  for (const p of profiles) {
    const id                  = String(p.id ?? "");
    const builder_name        = String(p.builder_name ?? "");
    const builder_company     = p.builder_company ? String(p.builder_company) : null;
    const default_finish_type = String(p.default_finish_type ?? "paint");
    const default_carcass_id  = p.default_carcass_id  ? String(p.default_carcass_id)  : null;
    const default_drawer_box_id = p.default_drawer_box_id ? String(p.default_drawer_box_id) : null;
    const default_pull_id     = p.default_pull_id     ? String(p.default_pull_id)     : null;
    const default_paint_brand = p.default_paint_brand ? String(p.default_paint_brand) : null;
    const notes               = p.notes               ? String(p.notes)               : null;
    const is_residential_default = !!p.is_residential_default;

    await sql`
      INSERT INTO catalog_builder_profiles
        (id, builder_name, builder_company, default_finish_type,
         default_carcass_id, default_drawer_box_id, default_pull_id,
         default_paint_brand, notes, is_residential_default)
      VALUES (
        ${id}, ${builder_name}, ${builder_company}, ${default_finish_type},
        ${default_carcass_id}, ${default_drawer_box_id}, ${default_pull_id},
        ${default_paint_brand}, ${notes}, ${is_residential_default}
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
}
