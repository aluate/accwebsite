export const dynamic = "force-dynamic";

/**
 * GET /api/constraints
 *
 * Read-only endpoint for the shop constraints model.
 * Returns all active jobs with the data needed to compute:
 *   - PM load units (estimated_value → S/M/L tier, status → phase weight)
 *   - ENG hours (estimated_value × pm_complexity formula)
 *   - CNC/Finishing loads (per finish group: finish_type, species, door_style, box_count, wo_count)
 *
 * Auth: admin/karl only.
 */

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireBuilderApi } from "@/lib/auth";

export async function GET() {
  const session = await requireBuilderApi();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "karl" && session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Jobs (non-complete, non-cancelled)
  const jobs = await sql`
    SELECT
      j.id, j.job_number, j.client_name, j.site_address, j.city,
      j.pm, j.status, j.job_type, j.delivery_date, j.created_at,
      j.estimated_value, j.pm_complexity,
      j.mod_residential, j.mod_commercial, j.mod_trim, j.mod_doors,
      j.innergy_opportunity_id,
      j.box_count AS job_box_count, j.wo_count AS job_wo_count
    FROM jobs j
    WHERE j.status NOT IN ('complete', 'cancelled')
    ORDER BY j.seq DESC
  `;

  // Finish groups for all active jobs (pre-release planning data)
  const jobIds = jobs.map((j: Record<string, unknown>) => j.id as string);

  const finishGroups = jobIds.length > 0
    ? await sql`
        SELECT
          fg.id, fg.spec_id, fg.label, fg.finish_type,
          fg.species, fg.door_style_id, fg.box_material,
          fg.glaze_id, fg.stain_id, fg.paint_id,
          fg.box_count, fg.wo_count, fg.pm_complexity AS fg_complexity,
          rs.job_id
        FROM finish_groups fg
        JOIN residential_specs rs ON rs.id = fg.spec_id
        WHERE rs.job_id IN ${sql(jobIds)}
        ORDER BY rs.job_id, fg.sort_order
      `
    : [];

  // Group finish groups by job_id
  const fgByJob: Record<string, unknown[]> = {};
  for (const fg of finishGroups) {
    const jid = (fg as Record<string, unknown>).job_id as string;
    if (!fgByJob[jid]) fgByJob[jid] = [];
    fgByJob[jid].push(fg);
  }

  const payload = jobs.map((j: Record<string, unknown>) => ({
    ...j,
    finish_groups: fgByJob[j.id as string] ?? [],
  }));

  return NextResponse.json({ jobs: payload, generated_at: new Date().toISOString() });
}
