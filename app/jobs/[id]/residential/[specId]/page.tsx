export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { sql } from "@/lib/db";
import { catalogs } from "@/lib/catalogs";
import { ResidentialSpecClient } from "@/components/ResidentialSpecClient";

export default async function SpecEditorPage({
  params,
}: {
  params: Promise<{ id: string; specId: string }>;
}) {
  const { id, specId } = await params;

  const [spec] = await sql`SELECT * FROM residential_specs WHERE id = ${specId} AND job_id = ${id}` as { id: string; job_id: string; name: string; status: string; updated_at: string }[];
  if (!spec) notFound();

  // Load ALL real catalog data, pass to ResidentialSpecClient — but NO finish groups / rooms
  const catalogData = {
    paintColors:      catalogs.paintColors(),
    stainColors:      catalogs.stainColors(),
    melamineColors:   catalogs.melamineColors(),
    doorStyles:       catalogs.doorStyles(),
    hardwarePulls:    catalogs.hardwarePulls(),
    revaAccessories:  catalogs.revaAccessories(),
    cabinetFamilies:  catalogs.cabinetFamilies(),
    carcassMaterials: catalogs.carcassMaterials(),
    drawerBoxes:      catalogs.drawerBoxes(),
    edgebands:        catalogs.edgebands(),
    rooms:            catalogs.rooms(),
    moldingTypes:     catalogs.moldingTypes(),
    moldingProfiles:  catalogs.moldingProfiles(),
    moldingMaterials: catalogs.moldingMaterials(),
  };

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <Link href={`/jobs/${id}/residential`} className="text-white/30 text-xs mb-8 block">
        ← All Specs
      </Link>
      <h1 className="text-white text-2xl">{spec.name} — real catalogs + empty groups test</h1>
      <ResidentialSpecClient
        specId={specId}
        jobId={id}
        initialFinishGroups={[]}
        initialRooms={[]}
        initialMoldings={[]}
        initialMaterials={[]}
        catalogs={catalogData}
        lastSaved={spec.updated_at}
      />
    </section>
  );
}
