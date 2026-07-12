import { requireRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { notFound } from "next/navigation";
import { EstimateEditorClient } from "@/components/EstimateEditorClient";
import cabinetTypes from "@/data/catalogs/cabinet_types.json";
import cabinetFeatures from "@/data/catalogs/cabinet_features.json";

export default async function EstimateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("admin");
  const { id } = await params;

  const [estimateRows, roomRows, itemRows, settingsRows, jobsRows, fgRows] = await Promise.all([
    sql`
      SELECT e.*, j.client_name, j.site_address
      FROM estimates e
      LEFT JOIN jobs j ON j.id = e.job_id
      WHERE e.id = ${id}
    `,
    sql`SELECT * FROM estimate_rooms WHERE estimate_id = ${id} ORDER BY sort_order`,
    sql`
      SELECT eli.*
      FROM estimate_line_items eli
      JOIN estimate_rooms er ON er.id = eli.room_id
      WHERE er.estimate_id = ${id}
      ORDER BY eli.sort_order
    `,
    sql`SELECT * FROM estimate_settings WHERE id = 'singleton'`,
    sql`SELECT id, client_name, site_address, job_number FROM jobs ORDER BY seq DESC LIMIT 200`,
    sql`SELECT * FROM estimate_finish_groups WHERE estimate_id = ${id} ORDER BY sort_order`,
  ]);

  if (!estimateRows[0]) notFound();

  return (
    <EstimateEditorClient
      estimate={estimateRows[0] as unknown as Parameters<typeof EstimateEditorClient>[0]["estimate"]}
      rooms={roomRows as Parameters<typeof EstimateEditorClient>[0]["rooms"]}
      items={itemRows as Parameters<typeof EstimateEditorClient>[0]["items"]}
      settings={settingsRows[0] as unknown as Parameters<typeof EstimateEditorClient>[0]["settings"]}
      jobs={jobsRows as Parameters<typeof EstimateEditorClient>[0]["jobs"]}
      cabinetTypes={cabinetTypes as Parameters<typeof EstimateEditorClient>[0]["cabinetTypes"]}
      cabinetFeatures={cabinetFeatures as Parameters<typeof EstimateEditorClient>[0]["cabinetFeatures"]}
      initialFinishGroups={fgRows as Parameters<typeof EstimateEditorClient>[0]["initialFinishGroups"]}
    />
  );
}
