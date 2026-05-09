import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

// POST /api/trim-specs/[id]/save
// Full replace of all scalar fields — single-row, no nested children.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const b = await req.json();
  const now = new Date().toISOString();

  await sql`
    UPDATE trim_specs SET
      door_height             = ${b.door_height},
      trim_style              = ${b.trim_style},
      spec_level              = ${b.spec_level},
      drywall_int_jambs       = ${b.drywall_int_jambs ?? false},
      full_drywall_wrap       = ${b.full_drywall_wrap ?? false},
      base_lf                 = ${b.base_lf ?? 0},
      crown_lf                = ${b.crown_lf ?? 0},
      shoe_lf                 = ${b.shoe_lf ?? 0},
      chair_rail_lf           = ${b.chair_rail_lf ?? 0},
      stair_nosing_lf         = ${b.stair_nosing_lf ?? 0},
      wainscoting_cap_lf      = ${b.wainscoting_cap_lf ?? 0},
      case_openings           = ${b.case_openings ?? 0},
      window_openings         = ${b.window_openings ?? 0},
      pocket_doors            = ${b.pocket_doors ?? 0},
      barn_or_wrapped         = ${b.barn_or_wrapped ?? 0},
      sliders                 = ${b.sliders ?? 0},
      default_species         = ${b.default_species ?? "Paint Grade"},
      base_species            = ${b.base_species ?? null},
      shoe_species            = ${b.shoe_species ?? null},
      crown_species           = ${b.crown_species ?? null},
      casing_species          = ${b.casing_species ?? null},
      headers_species         = ${b.headers_species ?? null},
      sill_species            = ${b.sill_species ?? null},
      apron_species           = ${b.apron_species ?? null},
      int_jamb_species        = ${b.int_jamb_species ?? null},
      ext_jamb_species        = ${b.ext_jamb_species ?? null},
      chair_rail_species      = ${b.chair_rail_species ?? null},
      stair_nosing_species    = ${b.stair_nosing_species ?? null},
      wainscoting_cap_species = ${b.wainscoting_cap_species ?? null},
      notes                   = ${b.notes ?? null},
      updated_at              = ${now}
    WHERE id = ${id}
  `;

  return NextResponse.json({ ok: true });
}
