export const dynamic = "force-dynamic";

/**
 * One-shot bootstrap for the SpecSchedulesPanel React component.
 *
 *   GET /api/specs/{specId}/schedules-init
 *
 * Returns: { finish_groups, schedules, catalogs }.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { catalogs } from "@/lib/catalogs";
import { requireBuilder } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireBuilder();
  const { id: specId } = await params;
  const [spec] = await sql`SELECT id FROM residential_specs WHERE id = ${specId}`;
  if (!spec) return NextResponse.json({ error: "Spec not found" }, { status: 404 });

  const finish_groups = await sql`
    SELECT id, label, finish_type, notes, stain_id, paint_id, glaze_id, topcoat_id, sheen_id, sort_order
    FROM finish_groups WHERE spec_id = ${specId} ORDER BY sort_order
  `;

  const fgIds = (finish_groups as { id: string }[]).map((r) => r.id);

  const noChildren = { materials: [], door_fronts: [], drawers: [], edgebands: [], hardware: [], countertops: [] };
  const schedules = fgIds.length === 0 ? noChildren : await (async () => {
    const [materials, door_fronts, drawers, edgebands, hardware, countertops] = await Promise.all([
      sql`SELECT * FROM finish_group_materials   WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, role`,
      sql`SELECT * FROM finish_group_door_fronts WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, sort_order`,
      sql`SELECT * FROM finish_group_drawers     WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, sort_order`,
      sql`
        SELECT fge.*, cel.description AS location_description
        FROM finish_group_edgebands fge
        JOIN catalog_edgeband_locations cel ON cel.letter_code = fge.letter_code
        WHERE fge.finish_group_id IN ${sql(fgIds)}
        ORDER BY fge.finish_group_id, fge.sort_order
      `,
      sql`SELECT * FROM finish_group_hardware    WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, sort_order`,
      sql`SELECT * FROM finish_group_countertops WHERE finish_group_id IN ${sql(fgIds)} ORDER BY finish_group_id, sort_order`,
    ]);
    return { materials, door_fronts, drawers, edgebands, hardware, countertops };
  })();

  // DB-backed catalogs fetched concurrently
  const [
    carcassMaterials, drawerBoxes, edgebands, doorStyles, paintColors, stainColors,
  ] = await Promise.all([
    catalogs.carcassMaterials(),
    catalogs.drawerBoxes(),
    catalogs.edgebands(),
    catalogs.doorStyles(),
    catalogs.paintColors(),
    catalogs.stainColors(),
  ]);

  const cats = {
    carcassMaterials,
    drawerBoxes,
    edgebands,
    doorStyles,
    cabDoorEdgeDetails:    catalogs.cabDoorEdgeDetails(),
    cabDoorInsideProfiles: catalogs.cabDoorInsideProfiles(),
    cabDoorPanels:         catalogs.cabDoorPanels(),
    paintColors,
    stainColors,
    sheens:                catalogs.sheens(),
    drawerSlides:          catalogs.drawerSlides(),
    glazes:                catalogs.glazes(),
    topcoats:              catalogs.topcoats(),
    doorMaterials:         catalogs.doorMaterials(),
    moldingMaterials:      catalogs.moldingMaterials(),
    countertopStyles:      catalogs.countertopStyles(),
    countertopEdges:       catalogs.countertopEdges(),
    countertopMaterials:   catalogs.countertopMaterials(),
    hardwareByRole: {
      hinges:         catalogs.hardwareHinges(),
      drawer_slides:  catalogs.hardwareDrawerSlides(),
      rollout_slides: catalogs.hardwareRolloutSlides(),
      closet_rod:     catalogs.hardwareClosetRods(),
      trash_pullout:  catalogs.hardwareTrashPullouts(),
      base_pullout:   catalogs.hardwareBasePullouts(),
      blind_corner:   catalogs.hardwareBlindCorners(),
      shelf_clips:    catalogs.hardwareShelfClips(),
      door_pulls:     catalogs.hardwareDoorPulls(),
      drawer_pulls:   catalogs.hardwareDrawerPulls(),
      misc:           catalogs.hardwareMisc(),
    },
  };

  return NextResponse.json({ finish_groups, schedules, catalogs: cats });
}
