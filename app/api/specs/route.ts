export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { catalogs } from "@/lib/catalogs";
import { asArray } from "@/lib/catalogs";

// GET /api/specs?job_id=ACC-2026-0001
export async function GET(req: NextRequest) {
  const job_id = req.nextUrl.searchParams.get("job_id");
  if (!job_id) return NextResponse.json({ error: "job_id required" }, { status: 400 });
  const specs = await sql`SELECT * FROM residential_specs WHERE job_id = ${job_id} ORDER BY created_at`;
  return NextResponse.json({ specs });
}

// POST /api/specs  { job_id, name?, builder_profile_id? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.job_id) return NextResponse.json({ error: "job_id required" }, { status: 400 });

  const now = new Date().toISOString();
  const id = uid();

  await sql`
    INSERT INTO residential_specs (id, job_id, name, status, created_at, updated_at)
    VALUES (${id}, ${body.job_id}, ${body.name ?? "New Spec"}, 'draft', ${now}, ${now})
  `;

  const profileId: string | undefined = body.builder_profile_id;
  if (profileId) {
    const profiles = catalogs.builderProfiles();
    const profile = profiles.find((p) => p.id === profileId);
    if (profile) {
      const fgId = uid();
      const finishType = profile.default_finish_type ?? "paint";
      const label =
        finishType === "paint"    ? "Painted"  :
        finishType === "stain"    ? "Stained"  :
        finishType === "melamine" ? "Melamine" :
        "Default";

      await sql`
        INSERT INTO finish_groups (
          id, spec_id, label, finish_type,
          color_id, color_name, door_style_id, pull_id,
          box_material, notes, sort_order,
          carcass_id, drawer_box_id, edgeband_id
        ) VALUES (
          ${fgId}, ${id}, ${label}, ${finishType},
          NULL, NULL, NULL, ${profile.default_pull_id ?? null},
          'melamine',
          ${`Auto-seeded from builder profile: ${profile.builder_name}. Confirm dropdowns before saving.`},
          0,
          ${profile.default_carcass_id ?? null},
          ${profile.default_drawer_box_id ?? null},
          NULL
        )
      `;

      void asArray;
    }
  }

  return NextResponse.json({ id }, { status: 201 });
}
