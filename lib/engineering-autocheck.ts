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
import { getCatalogs } from "@/lib/catalogs";
import { canonicalTrimType } from "@/lib/trim-types";
import { isSlabOnlyFinishType } from "@/lib/slab-door";

/*
  WHAT MAY AUTO-CHECK, AND WHAT MAY NOT.

  An item auto-checks only when the data proves it. "Interior material
  specified" is provable — every finish group either has a carcass or it does
  not. "Appliance and sink specs reviewed and verified by PM" is not, and never
  will be: it is a person confirming they looked. Auto-checking a judgement item
  would turn the gate into a formality, which is the opposite of what it is for.

  Two of the rules here were reading columns nothing writes any more, so they
  could never come true:

    - the three pull items keyed off finish_groups.pull_id. Pulls have lived in
      finish_group_pulls (description / part_no / finish_color / qty) since the
      per-finish-group pull table was added; pull_id is a dead column with no UI
      behind it. So a spec with every pull filled in still showed three
      unchecked boxes, and the only way past them was to tick them by hand —
      which is exactly the "it thinks it's not done" the checklist is supposed
      to prevent.
    - aventos reads a hardware role nothing writes. Kept, because it costs
      nothing and starts working the day something writes that role, but it is
      effectively a manual item today and is described as one here rather than
      pretending otherwise.

  Pull SIZE is deliberately not auto-checked: finish_group_pulls has no size
  column, so there is nothing to prove it with. An item with no data behind it
  stays a person's job.
*/

type FGRow = {
  id: string;
  carcass_id: string | null;
  drawer_box_id: string | null;
  finish_type: string;
  color_id: string | null;
  edgeband_id: string | null;
  pull_id: string | null;
  sheen_id: string | null;
  grain_orientation: string | null;
  door_style_id: string | null;
};
type HWRow = { role: string };
type JobRow = { delivery_date: string | null; install_type: string | null };
type PullRow = { description: string | null; part_no: string | null; finish_color: string | null; qty: number | null };
type TrimRow = { trim_type: string | null; qty_lf: number | null };
type AccRow = { qty: number | null };

const filled = (v: string | null | undefined) => !!(v && String(v).trim());

export async function computeAutoChecked(jobId: string): Promise<Record<string, boolean>> {
  const auto: Record<string, boolean> = {};

  const specRows = await sql<{ id: string }[]>`
    SELECT id FROM residential_specs WHERE job_id = ${jobId} ORDER BY created_at ASC LIMIT 1
  `;
  const specId = specRows[0]?.id;

  const jobRows = await sql<JobRow[]>`SELECT delivery_date, install_type FROM jobs WHERE id = ${jobId}`;
  const job = jobRows[0];

  // Section 6 / 7: the two facts the job record already carries.
  auto.ship_date_known  = filled(job?.delivery_date);
  auto.ship_date_in_msg = filled(job?.delivery_date);
  auto.installer_stated = filled(job?.install_type);

  if (!specId) return auto;

  const [fgs, rooms, hwRows, pulls, trim, accs] = await Promise.all([
    sql<FGRow[]>`
      SELECT id, carcass_id, drawer_box_id, finish_type, color_id, edgeband_id, pull_id,
             sheen_id, grain_orientation, door_style_id
      FROM finish_groups WHERE spec_id = ${specId}
    `,
    sql<{ id: string }[]>`SELECT id FROM rooms WHERE spec_id = ${specId}`,
    sql<HWRow[]>`
      SELECT fh.role FROM finish_group_hardware fh
      JOIN finish_groups g ON g.id = fh.finish_group_id
      WHERE g.spec_id = ${specId} AND fh.hardware_id IS NOT NULL
    `,
    sql<PullRow[]>`
      SELECT p.description, p.part_no, p.finish_color, p.qty
      FROM finish_group_pulls p
      JOIN finish_groups g ON g.id = p.finish_group_id
      WHERE g.spec_id = ${specId}
    `,
    sql<TrimRow[]>`
      SELECT t.trim_type, t.qty_lf
      FROM room_trim t
      JOIN rooms r ON r.id = t.room_id
      WHERE r.spec_id = ${specId}
    `,
    sql<AccRow[]>`
      SELECT a.qty FROM room_accessories a
      JOIN rooms r ON r.id = a.room_id
      WHERE r.spec_id = ${specId}
    `,
  ]);

  auto.rooms_listed = rooms.length > 0;

  const allHaveCarcass = fgs.length > 0 && fgs.every((g) => !!g.carcass_id);
  auto.interior_material = allHaveCarcass;
  auto.exterior_material = allHaveCarcass;

  auto.drawer_style_material = fgs.length > 0 && fgs.every((g) => !!g.drawer_box_id);

  const paintStainFGs = fgs.filter((g) => g.finish_type === "paint" || g.finish_type === "stain");
  auto.stain_paint = paintStainFGs.length === 0 || paintStainFGs.every((g) => !!g.color_id);

  // "Finish specified" / "Sheen specified" — both live on the finish group.
  auto.finish_spec = fgs.length > 0 && fgs.every((g) => filled(g.finish_type));
  auto.sheen_spec  = fgs.length > 0 && fgs.every((g) => filled(g.sheen_id));

  const hasEdgebands = fgs.some((g) => !!g.edgeband_id);
  auto.interior_banding = hasEdgebands;
  auto.exterior_banding = hasEdgebands;
  auto.drawer_banding = fgs.length > 0 && fgs.every((g) => !!g.drawer_box_id);

  /*
    Pulls, from the table the form actually writes. pull_id is kept as an OR so
    a spec built before finish_group_pulls existed still counts.
  */
  const legacyPull = fgs.some((g) => !!g.pull_id);
  auto.pulls_brand  = legacyPull || pulls.some((p) => filled(p.description) || filled(p.part_no));
  auto.pulls_finish = legacyPull || pulls.some((p) => filled(p.finish_color));
  auto.pulls_qty    = pulls.some((p) => (p.qty ?? 0) > 0);
  // pulls_size: no column holds it. Left to the PM rather than faked.

  const roles = new Set(hwRows.map((h) => h.role));
  auto.hinges        = roles.has("hinges");
  auto.drawer_guides = roles.has("drawer_slides");
  auto.aventos       = roles.has("aventos"); // nothing writes this role yet — manual in practice

  /*
    Moldings. The section header is "with Linear Footage & Material
    Designation", so a row only counts once it carries footage. Absence proves
    nothing — a job with no crown is not a job with crown left unspecified — so
    these only ever tick themselves on, never off, and the PM confirms the rest.
  */
  const trimLf = (names: string[]) =>
    trim.some((t) => names.includes(canonicalTrimType(t.trim_type)) && (t.qty_lf ?? 0) > 0);
  auto.toe_skin   = trimLf(["Toe Skin"]);
  auto.fillers    = trimLf(["Filler"]);
  auto.light_rail = trimLf(["Light Rail"]);
  auto.crown      = trimLf(["Crown Molding", "Crown Nailer"]);

  // "Rev-a-Shelf items with spec number & quantity" — an accessory row is a
  // catalog id plus a quantity, which is precisely that.
  auto.rev_a_shelf = accs.some((a) => (a.qty ?? 0) > 0);

  /*
    "Slab — grain orientation noted". Only asked of groups whose door actually
    is a slab; a five-piece door has no grain direction to call out. Needs the
    door style catalog to know which is which, and a catalog failure must not
    take the whole checklist down with it.
  */
  try {
    const cat = await getCatalogs();
    const slabIds = new Set(
      (cat.doorStyles() as { id: string; construction?: string | null }[])
        .filter((d) => d.construction === "slab")
        .map((d) => d.id),
    );
    const slabGroups = fgs.filter(
      (g) => isSlabOnlyFinishType(g.finish_type) || (g.door_style_id && slabIds.has(g.door_style_id)),
    );
    auto.slab_grain = slabGroups.length > 0 && slabGroups.every((g) => filled(g.grain_orientation));
  } catch (e) {
    console.error("[autocheck] door style catalog unavailable:", e);
  }

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
