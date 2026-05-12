export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { sql } from "@/lib/db";
import { ResidentialSpecClient } from "@/components/ResidentialSpecClient";

export default async function SpecEditorPage({
  params,
}: {
  params: Promise<{ id: string; specId: string }>;
}) {
  const { id, specId } = await params;

  const [spec] = await sql`SELECT * FROM residential_specs WHERE id = ${specId} AND job_id = ${id}` as { id: string; job_id: string; name: string; status: string; updated_at: string }[];
  if (!spec) notFound();

  // Render ResidentialSpecClient with completely empty props (no catalog data, no rooms, no groups)
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <Link href={`/jobs/${id}/residential`} className="text-white/30 text-xs mb-8 block">
        ← All Specs
      </Link>
      <h1 className="text-white text-2xl">{spec.name} — empty props test</h1>
      <ResidentialSpecClient
        specId={specId}
        jobId={id}
        initialFinishGroups={[]}
        initialRooms={[]}
        initialMoldings={[]}
        initialMaterials={[]}
        catalogs={{
          paintColors: [],
          stainColors: [],
          melamineColors: [],
          doorStyles: [],
          hardwarePulls: [],
          revaAccessories: [],
          cabinetFamilies: [],
          carcassMaterials: [],
          drawerBoxes: [],
          edgebands: [],
          rooms: [],
          moldingTypes: [],
          moldingProfiles: [],
          moldingMaterials: [],
        }}
        lastSaved={spec.updated_at}
      />
    </section>
  );
}
