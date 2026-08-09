/**
 * Trim defaults — deriving a room's trim rows from its finish group.
 *
 * The problem this solves:
 *
 * `finish_group_trim_defaults` existed and was edited on the Finishes tab, but
 * nothing ever copied a default onto a room. `fgTrimDefaults` appeared in exactly
 * three places in the spec builder — the state hook, the save payload, and its own
 * UI — and none of them wrote to `room_trim`. So a PM filled in "Filler, MEL-3,
 * 2.5x2.5" once per finish group and then typed it again in every room.
 *
 * Three rules, and they matter more than the code:
 *
 * 1. LF is never derived. Linear feet is a measurement of a specific room. A
 *    defaulted size is a starting point someone will correct; a defaulted LF is a
 *    number that looks measured and is not, and it flows into a cut list.
 *
 * 2. Defaults fill blanks. They do not overwrite. A PM who typed something meant it.
 *    The one exception is the explicit "apply to all rooms" action, where
 *    overwriting is the whole point of pressing the button.
 *
 * 3. Rows remember where they came from. `room_trim.source` records whether a row
 *    was defaulted from the finish group or added by hand, because those two have
 *    to behave differently when the room's finish group changes: a defaulted row
 *    follows the new group, a hand-added row stays and only re-derives its material.
 *    Without that column the two are indistinguishable and a finish swap either
 *    destroys deliberate work or leaves stale rows behind.
 */

import { canonicalTrimType } from "@/lib/trim-types";
import { deriveDoorMaterial, type DoorMaterialSource } from "@/lib/door-material";

/** How a room_trim row came to exist. */
export type TrimSource = "fg_default" | "manual";

export type MoldingTypeRow = {
  id: string;
  display_name: string;
  typical_size: string | null;
};

export type FgTrimDefault = {
  finish_group_id: string;
  trim_type: string;
  species_material: string | null;
  size_desc: string | null;
  notes: string | null;
  sort_order: number;
};

export type RoomTrimRow = {
  id: string;
  room_id: string;
  trim_type: string;
  size_desc: string | null;
  material: string | null;
  qty_lf: number;
  notes: string | null;
  sort_order: number;
  source?: TrimSource;
};

/**
 * The size to show for a trim type when nobody has typed one.
 *
 * Order: what the finish group says, then the catalog's typical size, then blank.
 * "varies" and an em dash are catalog placeholders meaning "no standard" — Crown is
 * deliberately one of those, per Karl — so they are treated as absent rather than
 * printed on a shop document as if they were a dimension.
 */
export function defaultSizeFor(
  trimType: string,
  fgDefault: FgTrimDefault | undefined,
  moldingTypes: MoldingTypeRow[],
): string {
  const fromFg = (fgDefault?.size_desc ?? "").trim();
  if (fromFg) return fromFg;

  const canon = canonicalTrimType(trimType);
  const row = moldingTypes.find((m) => canonicalTrimType(m.display_name) === canon);
  const typical = (row?.typical_size ?? "").trim();
  if (!typical || typical === "varies" || typical === "—") return "";
  return typical;
}

/**
 * The material to show for a trim row when nobody has typed one.
 *
 * Karl: "the species/material should be driven by the species/material we already
 * selected for the FG." So the finish group's own default wins if set, and otherwise
 * it is the same derivation the doors use — which means melamine trim reads the
 * melamine rather than a blank, for the same reason a melamine door does.
 */
export function defaultMaterialFor(
  fgDefault: FgTrimDefault | undefined,
  fg: DoorMaterialSource,
): string {
  const fromFg = (fgDefault?.species_material ?? "").trim();
  if (fromFg) return fromFg;
  return deriveDoorMaterial(fg);
}

export type DeriveInput = {
  /** The finish group this room is assigned to. */
  fg: DoorMaterialSource & { id: string };
  /** That finish group's trim defaults. */
  fgDefaults: FgTrimDefault[];
  /** The molding_types catalog. */
  moldingTypes: MoldingTypeRow[];
  /** The room's existing trim rows. */
  existing: RoomTrimRow[];
  /**
   * true = the explicit "apply to all rooms with this finish group" action, which
   * may overwrite species and size on rows that already have them. LF is still
   * never touched.
   */
  overwrite?: boolean;
};

export type DerivedTrim = {
  /** Rows to insert. */
  added: Omit<RoomTrimRow, "id">[];
  /** Rows to update, with only the fields that change. */
  updated: { id: string; size_desc?: string; material?: string }[];
};

/**
 * Work out what a room's trim should become, given its finish group.
 *
 * Returns a diff rather than applying it, so the caller decides whether this is a
 * save, a preview, or a dry run in a test — and so the rules above are testable
 * without a database.
 */
export function deriveRoomTrim(input: DeriveInput): DerivedTrim {
  const { fg, fgDefaults, moldingTypes, existing, overwrite = false } = input;

  const added: Omit<RoomTrimRow, "id">[] = [];
  const updated: { id: string; size_desc?: string; material?: string }[] = [];

  const byType = new Map<string, RoomTrimRow>();
  for (const r of existing) byType.set(canonicalTrimType(r.trim_type), r);

  let nextSort = existing.reduce((m, r) => Math.max(m, r.sort_order), -1) + 1;

  for (const def of [...fgDefaults].sort((a, b) => a.sort_order - b.sort_order)) {
    const canon = canonicalTrimType(def.trim_type);
    if (!canon) continue;

    const size = defaultSizeFor(canon, def, moldingTypes);
    const material = defaultMaterialFor(def, fg);
    const row = byType.get(canon);

    if (!row) {
      // A finish-group default the room does not have yet. LF stays 0 — the PM
      // measures it.
      added.push({
        room_id: "",
        trim_type: canon,
        size_desc: size || null,
        material: material || null,
        qty_lf: 0,
        notes: def.notes ?? null,
        sort_order: nextSort++,
        source: "fg_default",
      });
      continue;
    }

    // Row exists. Fill what is blank; overwrite only when explicitly asked.
    const patch: { id: string; size_desc?: string; material?: string } = { id: row.id };
    let changed = false;
    if (size && (overwrite || !(row.size_desc ?? "").trim())) { patch.size_desc = size; changed = true; }
    if (material && (overwrite || !(row.material ?? "").trim())) { patch.material = material; changed = true; }
    if (changed) updated.push(patch);
  }

  return { added, updated };
}

/**
 * Re-derive a room's trim after its finish group changes.
 *
 * Karl's case: the kitchen starts MEL-1, discussion moves it to STN-1. The room
 * moves to STN-1's work order and its trim has to follow, but the LF someone
 * measured is still correct — the room did not change size when the finish did.
 *
 * - rows defaulted from the old group: re-derive size and material from the new one
 * - rows added by hand: kept, with material re-derived (Karl's call) and size left
 *   alone, because a hand-typed size is a decision about that room
 * - LF: never touched, either way
 * - trim types the old group defaulted and the new one does not: kept and reported,
 *   never silently dropped. Deleting a line off a shop document because a finish
 *   changed is how a room ends up missing its crown.
 */
export function retrimForFinishGroupSwap(input: DeriveInput): DerivedTrim & { orphaned: RoomTrimRow[] } {
  const { fg, fgDefaults, moldingTypes, existing } = input;

  const newTypes = new Set(fgDefaults.map((d) => canonicalTrimType(d.trim_type)));
  const updated: { id: string; size_desc?: string; material?: string }[] = [];
  const orphaned: RoomTrimRow[] = [];

  for (const row of existing) {
    const canon = canonicalTrimType(row.trim_type);
    const def = fgDefaults.find((d) => canonicalTrimType(d.trim_type) === canon);
    const material = defaultMaterialFor(def, fg);

    if (!newTypes.has(canon)) {
      // Came from the old group's defaults, or was added by hand; either way the new
      // group has nothing to say about it. Keep it, re-derive the material so it
      // matches the room's new finish, and surface it for review.
      if (material) updated.push({ id: row.id, material });
      if (row.source === "fg_default") orphaned.push(row);
      continue;
    }

    const patch: { id: string; size_desc?: string; material?: string } = { id: row.id };
    if (material) patch.material = material;
    // A defaulted size follows the new group. A hand-typed one does not.
    if (row.source === "fg_default") {
      const size = defaultSizeFor(canon, def, moldingTypes);
      if (size) patch.size_desc = size;
    }
    updated.push(patch);
  }

  // Anything the new group defaults that the room does not have yet.
  const { added } = deriveRoomTrim(input);

  return { added, updated, orphaned };
}
