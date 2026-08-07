/**
 * Base door material — derived, not entered.
 *
 * Why this file exists:
 *
 * validateForRelease() (lib/lifecycle.ts) required
 * finish_group_door_fronts.material_id on the base door row. That column resolves
 * against data/catalogs/door_materials.csv — DM-001 "Paint-Grade Poplar", DM-008
 * "Red Oak", and so on — while finish_groups.species holds a display string like
 * "Maple (Hard) - Select". Two catalogs describing the same fact, and only one of
 * them had a field anyone actually filled in.
 *
 * The result: every spec failed the release gate on "base door material", forever,
 * because the only UI that wrote material_id was the Schedules tab, which is
 * imported nowhere.
 *
 * Karl's framing settles it: "BASE DOOR MATERIAL SHOULD BE SPECIES, RIGHT? AND IF
 * IT'S MELAMINE THEN IT SHOULD BE THAT MELAMINE." So the door material is not an
 * independent choice at all — it follows from what the finish group already says.
 * It stops being a field to fill in and becomes a fact to read off.
 *
 * door_materials is NOT deleted. An explicit material_id still wins, because there
 * are real jobs where the door material differs from the group species. It just
 * stops being mandatory for the common case where it does not.
 */

/** The subset of a finish group this derivation needs. */
export type DoorMaterialSource = {
  finish_type: string | null;
  /** Display string, e.g. "Maple (Hard) - Select" or "Paint Grade". */
  species: string | null;
  /** Melamine / laminate colour name, e.g. "Valenti Walnut". */
  color_name: string | null;
};

/**
 * What the base door is made of, as it should read on a shop document.
 * Returns "" when the finish group has not said enough to know yet.
 */
export function deriveDoorMaterial(fg: DoorMaterialSource): string {
  const species = (fg.species ?? "").trim();
  const color = (fg.color_name ?? "").trim();

  switch (fg.finish_type) {
    // A melamine or laminate door IS the sheet it is cut from. There is no
    // separate substrate to name, and naming one would invite a second answer.
    case "melamine":
    case "plam":
      return color;
    case "paint":
    case "stain":
      return species;
    default:
      // finish_type not chosen yet. Prefer species if somehow present, else
      // nothing — guessing here would put a material on a door nobody specified.
      return species || "";
  }
}

/**
 * Resolve the material to print, preferring an explicit override.
 *
 * `explicitName` is the resolved name of finish_group_door_fronts.material_id
 * (already looked up in door_materials), NOT the raw id — passing an id here
 * would print a SKU where a material name belongs.
 */
export function resolveDoorMaterial(
  explicitName: string | null | undefined,
  fg: DoorMaterialSource,
): string {
  const explicit = (explicitName ?? "").trim();
  return explicit || deriveDoorMaterial(fg);
}

/**
 * Does this finish group have a base door material at all?
 *
 * This is the release-gate question. It accepts a derived material, which is the
 * entire point — otherwise the gate keeps demanding a field that duplicates one
 * already filled in three inches up the same form.
 */
export function hasDoorMaterial(
  explicitMaterialId: string | null | undefined,
  fg: DoorMaterialSource,
): boolean {
  if ((explicitMaterialId ?? "").trim()) return true;
  return deriveDoorMaterial(fg).length > 0;
}

/**
 * What to tell a PM when it is missing, phrased as the thing they should go fix
 * rather than the column that is null.
 */
export function describeMissingDoorMaterial(fg: DoorMaterialSource): string {
  switch (fg.finish_type) {
    case "melamine":
    case "plam":
      return "base door material — pick the melamine/laminate colour";
    case "paint":
    case "stain":
      return "base door material — pick a species";
    default:
      return "base door material — pick a finish type first, then a species or colour";
  }
}

/**
 * Which finish types a species is offered under.
 *
 * scripts/sync-catalogs.mjs turns any semicolon-separated CSV cell into a JSON
 * array, so `finish_types` arrives as ["paint","stain"] for multi-value rows and
 * as the plain string "paint" for single-value ones. Splitting on ";" works for
 * one shape and silently matches nothing for the other — which shows up as a
 * dropdown that is mysteriously missing half its options.
 */
export function finishTypesOf(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  return String(raw).split(";").map((x) => x.trim()).filter(Boolean);
}

/** True when a species row should appear for the given finish type. */
export function speciesAllowedFor(raw: unknown, finishType: string | null): boolean {
  const types = finishTypesOf(raw);
  // A row that declares nothing is offered everywhere rather than nowhere —
  // a catalog edit that forgets the column should not empty the dropdown.
  if (types.length === 0) return true;
  return !!finishType && types.includes(finishType);
}
