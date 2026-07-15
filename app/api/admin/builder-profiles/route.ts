export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";

export type DbBuilderProfile = {
  id: string;
  builder_name: string;
  builder_company: string | null;
  default_finish_type: "paint" | "stain" | "melamine";
  default_carcass_id: string | null;
  default_drawer_box_id: string | null;
  default_pull_id: string | null;
  default_paint_brand: string | null;
  notes: string | null;
  is_residential_default: boolean;
};

// GET /api/admin/builder-profiles
export async function GET() {
  const rows = await sql<DbBuilderProfile[]>`
    SELECT id, builder_name, builder_company, default_finish_type,
           default_carcass_id, default_drawer_box_id, default_pull_id,
           default_paint_brand, notes, is_residential_default
    FROM catalog_builder_profiles
    ORDER BY is_residential_default DESC, builder_name
  `;
  return NextResponse.json({ profiles: rows });
}

// POST /api/admin/builder-profiles — create
export async function POST(req: NextRequest) {
  const session = await requireBuilder();
  if (!["karl", "admin", "pm"].includes(session.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const { builder_name, builder_company, default_finish_type, default_carcass_id,
          default_drawer_box_id, default_pull_id, default_paint_brand,
          notes, is_residential_default } = body;

  if (!builder_name) return NextResponse.json({ error: "builder_name required" }, { status: 400 });

  const id = body.id || `BPROF-${builder_name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)}-${uid().slice(0,4).toUpperCase()}`;

  await sql`
    INSERT INTO catalog_builder_profiles
      (id, builder_name, builder_company, default_finish_type,
       default_carcass_id, default_drawer_box_id, default_pull_id,
       default_paint_brand, notes, is_residential_default)
    VALUES (
      ${id}, ${builder_name}, ${builder_company ?? null},
      ${default_finish_type ?? "paint"},
      ${default_carcass_id ?? null}, ${default_drawer_box_id ?? null},
      ${default_pull_id ?? null}, ${default_paint_brand ?? null},
      ${notes ?? null}, ${!!is_residential_default}
    )
  `;

  return NextResponse.json({ ok: true, id });
}

// PATCH /api/admin/builder-profiles — update by id in body
export async function PATCH(req: NextRequest) {
  const session = await requireBuilder();
  if (!["karl", "admin", "pm"].includes(session.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await sql`
    UPDATE catalog_builder_profiles SET
      builder_name          = ${fields.builder_name},
      builder_company       = ${fields.builder_company ?? null},
      default_finish_type   = ${fields.default_finish_type ?? "paint"},
      default_carcass_id    = ${fields.default_carcass_id ?? null},
      default_drawer_box_id = ${fields.default_drawer_box_id ?? null},
      default_pull_id       = ${fields.default_pull_id ?? null},
      default_paint_brand   = ${fields.default_paint_brand ?? null},
      notes                 = ${fields.notes ?? null},
      is_residential_default = ${!!fields.is_residential_default}
    WHERE id = ${id}
  `;

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/builder-profiles?id=...
export async function DELETE(req: NextRequest) {
  const session = await requireBuilder();
  if (!["karl", "admin", "pm"].includes(session.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await sql`DELETE FROM catalog_builder_profiles WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
