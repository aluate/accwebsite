export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { catalogs } from "@/lib/catalogs";

export default async function SpecEditorPage({
  params,
}: {
  params: Promise<{ id: string; specId: string }>;
}) {
  const { id, specId } = await params;

  const [spec] = await sql`SELECT * FROM residential_specs WHERE id = ${specId} AND job_id = ${id}`;
  if (!spec) notFound();

  const finish_groups = await sql`SELECT * FROM finish_groups WHERE spec_id = ${specId} ORDER BY sort_order`;
  const rooms = await sql`SELECT * FROM rooms WHERE spec_id = ${specId} ORDER BY sort_order`;

  // Load catalogs (same 14 as full page)
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

  // Minimal render to confirm data fetching & catalog loading work
  return (
    <div style={{ padding: 40, color: "white", background: "#1a1a1a", fontFamily: "monospace" }}>
      <h1>Spec page: MINIMAL TEST</h1>
      <p>specId: {specId}</p>
      <p>jobId: {id}</p>
      <p>spec.name: {String((spec as Record<string, unknown>).name ?? "")}</p>
      <p>finish_groups: {finish_groups.length}</p>
      <p>rooms: {rooms.length}</p>
      <p>paintColors: {catalogData.paintColors.length}</p>
      <p>cabinetFamilies: {catalogData.cabinetFamilies.length}</p>
      <p style={{ color: "#4ade80", fontWeight: "bold", marginTop: 20 }}>✓ ALL DATA LOADED OK</p>
    </div>
  );
}
