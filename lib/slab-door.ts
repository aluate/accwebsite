/**
 * lib/slab-door.ts — the door style a melamine group must have.
 *
 * WHY THIS EXISTS.
 *
 * A melamine or PLAM front is a slab. The spec form knows it: the door style
 * dropdown filters to slab-only for those finish types and labels itself
 * "— slab only". And when a PM switched an existing group to melamine, the form
 * cleared the door style so they would re-pick from that restricted list.
 *
 * There is exactly one slab style in the catalog. So "re-pick from the
 * restricted list" is a list of one, and the clearing accomplished nothing
 * except leaving door_style_id empty — which the save route treats as "no door
 * style to seed", so no base door-front row is written, and
 * validateForRelease() then refuses the release with:
 *
 *     Cannot release to engineering — required fields missing:
 *     "MEL-1": base door style
 *
 * From the PM's side the spec is complete, the form shows melamine slab doors,
 * and engineering release is blocked by a field the form filled in for them and
 * then took away. Karl: everything required is filled, but it thinks it is not.
 *
 * So: when a finish type leaves exactly one legal door style, choose it. If the
 * catalog ever holds more than one slab style the ambiguity is real, and the old
 * behaviour is right — clear it and make the PM decide.
 */

/** Finish types whose fronts are slab by construction, not by choice. */
export const SLAB_ONLY_FINISH_TYPES = ["melamine", "plam"] as const;

export function isSlabOnlyFinishType(finishType: string | null | undefined): boolean {
  return !!finishType && (SLAB_ONLY_FINISH_TYPES as readonly string[]).includes(finishType);
}

export type DoorStyleLike = {
  id: string;
  construction?: string | null;
  /** Catalog rows flagged placeholder are not real choices. */
  placeholder?: boolean | string | null;
};

const isPlaceholder = (d: DoorStyleLike) =>
  d.placeholder === true || d.placeholder === "True" || d.placeholder === "true";

/**
 * The one slab door style, or null when the catalog offers none or several.
 * Null means "a person has to choose" — never guess between two real styles.
 */
export function soleSlabDoorStyleId(doorStyles: DoorStyleLike[]): string | null {
  const slabs = doorStyles.filter((d) => d.construction === "slab" && !isPlaceholder(d));
  return slabs.length === 1 ? slabs[0].id : null;
}

/**
 * What door_style_id should become when a group's finish type changes.
 *
 * Returns `undefined` when it should be left exactly as it is — the common case
 * of a paint or stain group, where every style is legal.
 */
export function doorStyleForFinishType(
  finishType: string | null | undefined,
  currentDoorStyleId: string | null | undefined,
  doorStyles: DoorStyleLike[],
): string | undefined {
  if (!isSlabOnlyFinishType(finishType)) return undefined;

  const current = doorStyles.find((d) => d.id === currentDoorStyleId);
  if (current && current.construction === "slab") return undefined; // already legal

  // Illegal or missing. One legal answer -> use it. More than one -> clear, and
  // the form's "slab only" dropdown makes the PM pick.
  return soleSlabDoorStyleId(doorStyles) ?? "";
}
