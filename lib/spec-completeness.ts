import { sql } from "@/lib/db";

/**
 * Spec completeness — the $70k guard, enforced on the server.
 *
 * Why this file exists:
 *
 * The spec editor used to refuse to SAVE an incomplete spec (400 from
 * /api/specs/[id]/save). That made the tool unusable — a spec is incomplete for
 * most of its life, so PMs lost work on every navigate and stopped using it.
 *
 * The gate belongs at the point where an incomplete spec becomes DANGEROUS,
 * which is when a PDF goes to the shop with a blank carcass or drawer box. That
 * is the $70k failure: not a stale field, but a silent default reaching the floor.
 *
 * So: save freely, generate strictly. This check is the "strictly" half, and it
 * reads from the DATABASE rather than a client payload precisely so it cannot be
 * bypassed by a hand-rolled request. Before this existed the only PDF gate was
 * `canGen` in the browser (components/ResidentialSpecClient.tsx), which any
 * direct POST walked straight past.
 *
 * Keep this list in sync with validate() in app/api/specs/[id]/save/route.ts —
 * that function classifies these same fields as "warning" so a draft can save.
 */

export type SpecViolation = {
  scope: string;   // human label, e.g. 'Finish group "Kitchen Perimeter"'
  field: string;   // the missing thing
};

export function describeViolations(v: SpecViolation[]): string {
  return v.map((x) => `- ${x.scope}: ${x.field}`).join("\n");
}

type FgRow = {
  id: string;
  label: string | null;
  finish_type: string | null;
  carcass_id: string | null;
  drawer_box_id: string | null;
  edgeband_id: string | null;
};

type RoomRow = { id: string; name: string | null };

/**
 * Returns [] when the spec is complete enough to produce a shop-facing PDF.
 * Anything non-empty should block generation.
 */
export async function checkSpecCompleteness(specId: string): Promise<SpecViolation[]> {
  const v: SpecViolation[] = [];

  const groups = await sql<FgRow[]>`
    SELECT id, label, finish_type, carcass_id, drawer_box_id, edgeband_id
    FROM finish_groups
    WHERE spec_id = ${specId}
    ORDER BY sort_order, id
  `;

  if (groups.length === 0) {
    v.push({ scope: "Spec", field: "at least one finish group is required" });
  }

  for (const g of groups) {
    const scope = `Finish group "${g.label?.trim() || "(unnamed)"}"`;
    if (!g.label?.trim()) v.push({ scope, field: "group label" });
    if (!g.finish_type) v.push({ scope, field: "finish type" });
    // The two fields that caused the $70k job. Never generate without them.
    if (!g.carcass_id) v.push({ scope, field: "carcass material" });
    if (!g.drawer_box_id) v.push({ scope, field: "drawer box" });
    if ((g.finish_type === "paint" || g.finish_type === "stain") && !g.edgeband_id) {
      v.push({ scope, field: "edgeband (required for paint and stain)" });
    }
  }

  const rooms = await sql<RoomRow[]>`
    SELECT id, name FROM rooms WHERE spec_id = ${specId} ORDER BY sort_order, id
  `;

  if (rooms.length === 0) {
    v.push({ scope: "Spec", field: "at least one room is required" });
  }

  // A room with no finish assigned prints with no material -- same class of
  // failure as a blank carcass, so it blocks generation too.
  //
  // Two ways a room can carry a finish: the room_finishes join table (current,
  // supports several finishes per room) or the legacy rooms.finish_group_id
  // column. Count both. Written as a scalar subquery plus a CASE rather than a
  // GROUP BY over a LEFT JOIN -- the join version double-counts once a room has
  // more than one row in room_finishes, which is the normal case here.
  const assigned = await sql<{ room_id: string; n: number }[]>`
    SELECT r.id AS room_id,
           (
             SELECT COUNT(*) FROM room_finishes rf
             WHERE rf.room_id = r.id
               AND rf.finish_group_id IS NOT NULL
               AND rf.finish_group_id <> ''
           )
           + CASE
               WHEN r.finish_group_id IS NOT NULL AND r.finish_group_id <> '' THEN 1
               ELSE 0
             END AS n
    FROM rooms r
    WHERE r.spec_id = ${specId}
  `;
  const countByRoom = new Map(assigned.map((a) => [a.room_id, Number(a.n)]));

  for (const r of rooms) {
    const scope = `Room "${r.name?.trim() || "(unnamed)"}"`;
    if (!r.name?.trim()) v.push({ scope, field: "room name" });
    if ((countByRoom.get(r.id) ?? 0) === 0) {
      v.push({ scope, field: "at least one finish must be assigned" });
    }
  }

  return v;
}
