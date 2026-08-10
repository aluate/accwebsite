/**
 * lib/trim-propagate.ts — the database half of trim defaults. Server only.
 *
 * lib/trim-defaults.ts decides WHAT should change and returns a diff. This applies
 * it. Split that way so the rules are testable without a database, and so the two
 * callers — saving a finish group's defaults, and the explicit "apply to all rooms"
 * action — cannot drift apart in how they write.
 *
 * The one rule that matters most, restated because it is the one that costs money if
 * it breaks: qty_lf is never written here. Not on insert (new rows land at 0), not on
 * update (the UPDATE names only size_desc and material). Linear feet is measured per
 * room; a defaulted one is indistinguishable from a real one by the time it reaches
 * a cut list.
 */

import { sql, uid } from "@/lib/db";
import { getCatalogs } from "@/lib/catalogs";
import {
  deriveRoomTrim,
  retrimForFinishGroupSwap,
  type FgTrimDefault,
  type RoomTrimRow,
  type MoldingTypeRow,
  type DerivedTrim,
} from "@/lib/trim-defaults";

export type PropagateResult = {
  rooms: number;
  added: number;
  updated: number;
  /** Defaulted rows the new finish group has no opinion about. Kept, never deleted. */
  orphaned: { room: string; trim_type: string }[];
};

type FgRow = {
  id: string; finish_type: string | null; species: string | null; color_name: string | null;
};

async function moldingTypeRows(): Promise<MoldingTypeRow[]> {
  const catalogs = await getCatalogs();
  return catalogs.moldingTypes().map((m) => ({
    id: String((m as { id: unknown }).id),
    display_name: String((m as { display_name?: unknown }).display_name ?? ""),
    typical_size: (m as { typical_size?: unknown }).typical_size == null
      ? null
      : String((m as { typical_size?: unknown }).typical_size),
  }));
}

async function loadFg(specId: string, fgId: string): Promise<FgRow | null> {
  const rows = await sql<FgRow[]>`
    SELECT id, finish_type, species, color_name
    FROM finish_groups WHERE id = ${fgId} AND spec_id = ${specId}
  `;
  return rows[0] ?? null;
}

async function loadDefaults(fgId: string): Promise<FgTrimDefault[]> {
  return sql<FgTrimDefault[]>`
    SELECT finish_group_id, trim_type, species_material, size_desc, notes, sort_order
    FROM finish_group_trim_defaults WHERE finish_group_id = ${fgId} ORDER BY sort_order
  `;
}

async function loadRoomTrim(roomId: string): Promise<RoomTrimRow[]> {
  return sql<RoomTrimRow[]>`
    SELECT id, room_id, trim_type, size_desc, material, qty_lf, notes, sort_order, source
    FROM room_trim WHERE room_id = ${roomId} ORDER BY sort_order
  `;
}

/** Writes a diff. New rows land at qty_lf 0; updates touch two columns and no others. */
async function applyDiff(roomId: string, diff: DerivedTrim): Promise<{ added: number; updated: number }> {
  for (const a of diff.added) {
    await sql`
      INSERT INTO room_trim
        (id, room_id, trim_type, size_desc, material, qty_lf, notes, sort_order, source)
      VALUES
        (${uid()}, ${roomId}, ${a.trim_type}, ${a.size_desc}, ${a.material},
         ${0}, ${a.notes}, ${a.sort_order}, ${"fg_default"})
    `;
  }
  for (const u of diff.updated) {
    // COALESCE against the PARAMETER, so a field absent from the patch keeps its
    // current value. Writing the whole row here is exactly how qty_lf would be lost.
    await sql`
      UPDATE room_trim
      SET size_desc = COALESCE(${u.size_desc ?? null}, size_desc),
          material  = COALESCE(${u.material ?? null}, material)
      WHERE id = ${u.id}
    `;
  }
  return { added: diff.added.length, updated: diff.updated.length };
}

/**
 * Push a finish group's trim defaults onto every room using it.
 *
 * overwrite=false (the automatic case, on save): fills blanks only.
 * overwrite=true  ("apply to all rooms"): replaces size and material, still not LF.
 */
export async function propagateTrimDefaults(
  specId: string,
  finishGroupId: string,
  overwrite = false,
): Promise<PropagateResult> {
  const fg = await loadFg(specId, finishGroupId);
  if (!fg) return { rooms: 0, added: 0, updated: 0, orphaned: [] };

  const fgDefaults = await loadDefaults(finishGroupId);
  const moldingTypes = await moldingTypeRows();

  // Rooms linked through room_finishes, or through the legacy flat column.
  const rooms = await sql<{ id: string; name: string }[]>`
    SELECT DISTINCT r.id, r.name
    FROM rooms r
    LEFT JOIN room_finishes rf ON rf.room_id = r.id
    WHERE r.spec_id = ${specId}
      AND (rf.finish_group_id = ${finishGroupId} OR r.finish_group_id = ${finishGroupId})
    ORDER BY r.name
  `;

  let added = 0, updated = 0;
  for (const room of rooms) {
    const diff = deriveRoomTrim({
      fg, fgDefaults, moldingTypes, existing: await loadRoomTrim(room.id), overwrite,
    });
    const n = await applyDiff(room.id, diff);
    added += n.added; updated += n.updated;
  }

  return { rooms: rooms.length, added, updated, orphaned: [] };
}

/**
 * Re-derive one room's trim after it moved to a different finish group.
 *
 * Karl's case: the kitchen starts MEL-1 and discussion moves it to STN-1. The room
 * follows the new group onto its work order, and the trim has to follow — but the LF
 * someone measured is still right, because the room did not change size when the
 * finish did.
 */
export async function retrimRoomForFinishGroup(
  specId: string,
  roomId: string,
  finishGroupId: string,
): Promise<PropagateResult> {
  const fg = await loadFg(specId, finishGroupId);
  if (!fg) return { rooms: 0, added: 0, updated: 0, orphaned: [] };

  const [room] = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM rooms WHERE id = ${roomId} AND spec_id = ${specId}
  `;
  if (!room) return { rooms: 0, added: 0, updated: 0, orphaned: [] };

  const result = retrimForFinishGroupSwap({
    fg,
    fgDefaults: await loadDefaults(finishGroupId),
    moldingTypes: await moldingTypeRows(),
    existing: await loadRoomTrim(roomId),
  });

  const n = await applyDiff(roomId, result);
  return {
    rooms: 1,
    added: n.added,
    updated: n.updated,
    orphaned: result.orphaned.map((o) => ({ room: room.name, trim_type: o.trim_type })),
  };
}
