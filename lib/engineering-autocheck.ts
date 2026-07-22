/**
 * lib/engineering-autocheck.ts
 *
 * Computes auto-checked checklist items from spec/job data.
 * Shared between:
 *   - app/api/jobs/[id]/engineering-checklist/route.ts  (GET — returns to client)
 *   - app/api/jobs/[id]/engineering-release/route.ts    (POST — merges before isComplete)
 *   - app/api/jobs/[id]/advance/route.ts               (POST toStatus=engineering)
 */

import { sql } from "@/lib/db";

type FGRow = {
  carcass_id: string | null;
  drawer_box_id: string | null;
  finish_type: string;
  color_id: string | null;
  edgeband_id: string | null;
  pull_id: string | null;
};
type HWRow = { role: string };
type JobRow = { delivery_date: string | null };

export async function computeAutoChecked(jobId: string): Promise<Record<string, boolean>> {
  const auto: Record<string, boolean> = {};

  const specRows = await sql<{ id: string }[]>`
    SELECT id FROM residential_specs WHERE job_id = ${jobId} ORDER BY created_at ASC LIMIT 1
  `;
  const specId = specRows[0]?.id;

  const jobRows = await sql<JobRow[]>`SELECT delivery_date FROM jobs WHERE id = ${jobId}`;
  const job = jobRows[0];
  auto.ship_date_known = !!(job?.delivery_date);

  if (!specId) return auto;

  const [fgs, rooms, hwRows] = await Promise.all([
    sql<FGRow[]>`
      SELECT carcass_id, drawer_box_id, finish_type, color_id, edgeband_id, pull_id
      FROM finish_groups WHERE spec_id = ${specId}
    `,
    sql<{ id: string }[]>`SELECT id FROM rooms WHERE spec_id = ${specId}`,
    sql<HWRow[]>`
      SELECT fh.role FROM finish_group_hardware fh
      JOIN finish_groups g ON g.id = fh.finish_group_id
      WHERE g.spec_id = ${specId} AND fh.hardware_id IS NOT NULL
    `,
  ]);

  auto.rooms_listed = rooms.length > 0;

  const allHaveCarcass = fgs.length > 0 && fgs.every((g) => !!g.carcass_id);
  auto.interior_material = allHaveCarcass;
  auto.exterior_material = allHaveCarcass;

  auto.drawer_style_material = fgs.length > 0 && fgs.every((g) => !!g.drawer_box_id);

  const paintStainFGs = fgs.filter((g) => g.finish_type === "paint" || g.finish_type === "stain");
  auto.stain_paint = paintStainFGs.length === 0 || paintStainFGs.every((g) => !!g.color_id);

  const hasEdgebands = fgs.some((g) => !!g.edgeband_id);
  auto.interior_banding = hasEdgebands;
  auto.exterior_banding = hasEdgebands;
  auto.drawer_banding = fgs.length > 0 && fgs.every((g) => !!g.drawer_box_id);

  const hasPulls = fgs.some((g) => !!g.pull_id);
  auto.pulls_brand  = hasPulls;
  auto.pulls_size   = hasPulls;
  auto.pulls_finish = hasPulls;

  const roles = new Set(hwRows.map((h) => h.role));
  auto.hinges        = roles.has("hinges");
  auto.drawer_guides = roles.has("drawer_slides");
  auto.aventos       = roles.has("aventos");

  return auto;
}

/**
 * Merges the stored manual checklist with auto-checked items.
 * Pass drawingsExist=true to also auto-satisfy drawings_attached.
 */
export function mergeChecklist(
  manual: Record<string, boolean>,
  auto: Record<string, boolean>,
  drawingsExist = false,
): Record<string, boolean> {
  const merged: Record<string, boolean> = { ...manual };
  for (const [k, v] of Object.entries(auto)) {
    if (v) merged[k] = true;
  }
  if (drawingsExist) merged["drawings_attached"] = true;
  return merged;
}
