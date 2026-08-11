/**
 * lib/door-front-roles.ts — the one list of finish_group_door_fronts.role values.
 *
 * WHY THIS FILE EXISTS. The vocabulary was written in one place and read in another,
 * and the two never agreed:
 *
 *   applied_ends    written by the UI, compared by nothing
 *   applied_end     compared by lib/pdf-spec.tsx, written by nobody
 *   drawer_front    compared by lib/pdf-spec.tsx, written by nobody
 *   upper           written, compared by nothing — so it had no label on any sheet
 *
 * Two phantoms and three orphans, in a table with no UNIQUE constraint and no
 * enum to catch it. Nothing failed; the sheets just quietly said the wrong thing.
 *
 * The expensive one was not a missing line. The client spec picks its drawer-front
 * line as "the first row that is not `base` and not `applied_end`" — and because
 * rows are stored as `applied_ends`, that exclusion never fired. An Applied Ends row
 * was printed as the Drawer Front. On Karl's own example — slab panels everywhere
 * with a shaker panel on the kitchen applied ends — the document the CLIENT SIGNS
 * stated the wrong drawer front style.
 *
 * So: one list, imported by both sides. A role that is not here is not a role.
 *
 * NO UNIQUE(finish_group_id, role) EXISTS, AND MUST NOT. Karl needs several rows per
 * role: "if I have my 12in drawers 5 piece and the 6in drawers slab I need to be able
 * to call it out". Rows are distinguished by `slot_label`, which is free text on
 * purpose — the shop's vocabulary for where a door goes is not something to enumerate.
 */

export const ROLE_BASE         = "base";
export const ROLE_UPPER        = "upper";
export const ROLE_DRAWER_FRONT = "drawer_front";
export const ROLE_APPLIED_END  = "applied_end";

/**
 * Canonical roles, in the order they belong on a sheet: base doors, upper doors,
 * drawer fronts, applied ends. Sort order on the row still wins within a role.
 */
export const DOOR_FRONT_ROLES = [
  ROLE_BASE,
  ROLE_UPPER,
  ROLE_DRAWER_FRONT,
  ROLE_APPLIED_END,
] as const;

export type DoorFrontRole = (typeof DOOR_FRONT_ROLES)[number];

export const DOOR_FRONT_ROLE_LABEL: Record<string, string> = {
  [ROLE_BASE]:         "Base Doors",
  [ROLE_UPPER]:        "Upper Doors",
  [ROLE_DRAWER_FRONT]: "Drawer Fronts",
  [ROLE_APPLIED_END]:  "Applied Ends",
};

/**
 * What each row is for, shown beside the "add another" control so a PM does not
 * have to guess which row to put a callout on.
 */
export const DOOR_FRONT_ROLE_HINT: Record<string, string> = {
  [ROLE_BASE]:         "Base cabinet doors. Add a row per style if they differ by room.",
  [ROLE_UPPER]:        "Upper cabinet doors, when they are not the same as the base doors.",
  [ROLE_DRAWER_FRONT]: "Drawer fronts. Add a row per size or style — e.g. 12\" five-piece, 6\" slab.",
  [ROLE_APPLIED_END]:  "Applied end panels. Add a row per callout — e.g. shaker in the kitchen, slab elsewhere.",
};

/**
 * Roles written before this list existed, mapped to the canonical value.
 *
 * Read-side only. Nothing writes these any more, but rows carrying them are already
 * in the database — written by components/SpecSchedulesPanel.tsx before it became
 * unreachable — and a spec saved then still has to render correctly today. Handled
 * in code rather than by a data migration because a rename that only matters on read
 * does not justify rewriting rows, and because a migration would silently miss any
 * row created between writing it and running it.
 */
const LEGACY_ROLE_ALIAS: Record<string, DoorFrontRole> = {
  applied_ends: ROLE_APPLIED_END,
  applied_panel: ROLE_APPLIED_END,
  applied_panels: ROLE_APPLIED_END,
  drawer_fronts: ROLE_DRAWER_FRONT,
  df: ROLE_DRAWER_FRONT,
  uppers: ROLE_UPPER,
};

export function isDoorFrontRole(role: string): role is DoorFrontRole {
  return (DOOR_FRONT_ROLES as readonly string[]).includes(role);
}

/**
 * The stored value → the canonical one.
 *
 * An unrecognised role is returned UNCHANGED, deliberately. `slab_df` and `5pc_df`
 * exist on rows out there and mean something to whoever typed them; mapping them to
 * a guess would move a callout onto the wrong line, which is the whole failure this
 * file exists to stop. Unknown roles still render — spec-data falls back to the raw
 * value as the label — they just get no special treatment.
 */
export function normalizeDoorFrontRole(role: string | null | undefined): string {
  if (!role) return "";
  const trimmed = String(role).trim();
  if (!trimmed) return "";
  if (isDoorFrontRole(trimmed)) return trimmed;
  return LEGACY_ROLE_ALIAS[trimmed.toLowerCase()] ?? trimmed;
}

/** Label for any role, canonical or not. Never blank, so no sheet prints an empty cell. */
export function doorFrontRoleLabel(role: string | null | undefined): string {
  const r = normalizeDoorFrontRole(role);
  if (!r) return "";
  return DOOR_FRONT_ROLE_LABEL[r] ?? r;
}
