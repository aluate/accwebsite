import { notFound } from "next/navigation";
import Link from "next/link";
import { sql } from "@/lib/db";
import { catalogs } from "@/lib/catalogs";
import { DoorSpecClient } from "@/components/DoorSpecClient";

type SpecRow = {
  id: string; job_id: string; name: string; status: string;
  notes: string | null; updated_at: string;
};

type ItemRow = {
  id: string; door_type: string; size_nom: string; core: string;
  species: string; swing: string; hardware: string;
  bore: boolean; hinge_prep: boolean; qty: number;
  unit_price: number; price_override: boolean;
  notes: string | null; sort_order: number;
};

export default async function DoorSpecEditorPage({
  params,
}: {
  params: Promise<{ id: string; specId: string }>;
}) {
  const { id, specId } = await params;

  const [spec] = await sql`
    SELECT * FROM door_specs WHERE id = ${specId} AND job_id = ${id}
  ` as SpecRow[];
  if (!spec) notFound();

  const rows = await sql`
    SELECT * FROM door_line_items WHERE spec_id = ${specId} ORDER BY sort_order
  ` as ItemRow[];

  const initialItems = rows.map((r) => ({
    id:             r.id,
    door_type:      r.door_type,
    size_nom:       r.size_nom,
    core:           r.core as "hollow" | "solid",
    species:        r.species,
    swing:          r.swing as "left" | "right" | "none",
    hardware:       r.hardware as "none" | "passage" | "privacy" | "dummy",
    bore:           !!r.bore,
    hinge_prep:     !!r.hinge_prep,
    qty:            r.qty,
    unit_price:     r.unit_price,
    price_override: !!r.price_override,
    notes:          r.notes ?? "",
    sort_order:     r.sort_order,
  }));

  const catalog = catalogs.doorCatalog();

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <Link
        href={`/jobs/${id}/doors`}
        className="font-condensed uppercase tracking-widest text-xs text-white/30 hover:text-[#f08122] transition-colors mb-8 block"
      >
        ← All Door Specs
      </Link>
      <h1 className="font-heading text-3xl uppercase tracking-wide text-white">{spec.name}</h1>
      <p className="text-[#f08122] font-condensed uppercase tracking-widest text-sm mt-1 mb-10">
        {id}
      </p>

      <DoorSpecClient
        specId={specId}
        jobId={id}
        initialItems={initialItems}
        initialNotes={spec.notes ?? ""}
        catalog={catalog}
        lastSaved={spec.updated_at}
      />
    </section>
  );
}
