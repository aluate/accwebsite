import { notFound } from "next/navigation";
import Link from "next/link";
import { sql } from "@/lib/db";
import { TrimSpecClient } from "@/components/TrimSpecClient";

type SpecRow = {
  id: string; job_id: string; name: string; status: string; notes: string | null;
  updated_at: string;
  door_height: string; trim_style: string; spec_level: string;
  drywall_int_jambs: boolean; full_drywall_wrap: boolean;
  base_lf: number; crown_lf: number; shoe_lf: number;
  chair_rail_lf: number; stair_nosing_lf: number; wainscoting_cap_lf: number;
  case_openings: number; window_openings: number;
  pocket_doors: number; barn_or_wrapped: number; sliders: number;
  default_species: string;
  base_species: string | null; shoe_species: string | null; crown_species: string | null;
  casing_species: string | null; headers_species: string | null;
  sill_species: string | null; apron_species: string | null;
  int_jamb_species: string | null; ext_jamb_species: string | null;
  chair_rail_species: string | null; stair_nosing_species: string | null;
  wainscoting_cap_species: string | null;
};

export default async function TrimSpecEditorPage({
  params,
}: {
  params: Promise<{ id: string; specId: string }>;
}) {
  const { id, specId } = await params;

  const [spec] = await sql`
    SELECT * FROM trim_specs WHERE id = ${specId} AND job_id = ${id}
  ` as SpecRow[];
  if (!spec) notFound();

  const initial = {
    notes:                   spec.notes ?? "",
    door_height:             spec.door_height,
    trim_style:              spec.trim_style as "craftsman" | "craftsman_plus" | "mitered",
    spec_level:              spec.spec_level as "economy" | "standard" | "premium",
    drywall_int_jambs:       !!spec.drywall_int_jambs,
    full_drywall_wrap:       !!spec.full_drywall_wrap,
    base_lf:                 spec.base_lf,
    crown_lf:                spec.crown_lf,
    shoe_lf:                 spec.shoe_lf,
    chair_rail_lf:           spec.chair_rail_lf,
    stair_nosing_lf:         spec.stair_nosing_lf,
    wainscoting_cap_lf:      spec.wainscoting_cap_lf,
    case_openings:           spec.case_openings,
    window_openings:         spec.window_openings,
    pocket_doors:            spec.pocket_doors,
    barn_or_wrapped:         spec.barn_or_wrapped,
    sliders:                 spec.sliders,
    default_species:         spec.default_species,
    base_species:            spec.base_species,
    shoe_species:            spec.shoe_species,
    crown_species:           spec.crown_species,
    casing_species:          spec.casing_species,
    headers_species:         spec.headers_species,
    sill_species:            spec.sill_species,
    apron_species:           spec.apron_species,
    int_jamb_species:        spec.int_jamb_species,
    ext_jamb_species:        spec.ext_jamb_species,
    chair_rail_species:      spec.chair_rail_species,
    stair_nosing_species:    spec.stair_nosing_species,
    wainscoting_cap_species: spec.wainscoting_cap_species,
  };

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <Link
        href={`/jobs/${id}/trim`}
        className="font-condensed uppercase tracking-widest text-xs text-white/30 hover:text-[#f08122] transition-colors mb-8 block"
      >
        ← All Trim Specs
      </Link>
      <h1 className="font-heading text-3xl uppercase tracking-wide text-white">{spec.name}</h1>
      <p className="text-[#f08122] font-condensed uppercase tracking-widest text-sm mt-1 mb-10">
        {id}
      </p>

      <TrimSpecClient
        specId={specId}
        jobId={id}
        initial={initial}
        lastSaved={spec.updated_at}
      />
    </section>
  );
}
