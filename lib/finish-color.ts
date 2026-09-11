/**
 * lib/finish-color.ts — does this finish group say what colour it is?
 *
 * WHY THIS EXISTS.
 *
 * On 2026-05-06 the colour requirement was deliberately relaxed, with a comment
 * saying so: the legacy Color column was deprecated, and the v2 Schedules tab
 * "now carries the canon data (stain/paint/glaze/topcoat/sheen)". Forcing the
 * legacy field was blocking PMs who had filled the v2 form correctly, so the
 * check came out of both the client and the API.
 *
 * The Schedules tab never shipped. It is 1,103 lines and imported nowhere. So
 * the requirement was moved to a screen that does not exist, and what remained
 * was no colour requirement at all — anywhere. A painted spec with colour_id
 * NULL saved cleanly, reported zero unfilled fields, and walked all the way to
 * RELEASED_TO_ENG. Verified on production: a job reached engineering with no
 * paint colour on it.
 *
 * Karl: "We can't build cabinets with no color. It HAS to have a selection or
 * it has to be listed as draft and as a result doesn't get the permission to
 * advance."
 *
 * So the requirement is back, and it accepts BOTH vocabularies — the legacy
 * colour columns and the v2 per-finish-type ones. Whichever screen the PM used,
 * a group that names its colour passes; a group that names it nowhere does not.
 * If the Schedules tab is ever mounted, this keeps working unchanged.
 */

/** The colour-bearing fields, across both the legacy and v2 shapes. */
export type ColourableGroup = {
  finish_type?: string | null;
  /** Legacy, and what the live form writes today. */
  color_id?: string | null;
  color_name?: string | null;
  /** v2, per finish type — written by the Schedules tab and seeded on save. */
  paint_id?: string | null;
  stain_id?: string | null;
};

/**
 * Finish types that must name a colour. Every one of them, today — the list is
 * explicit so that adding a finish type is a decision about this rule rather
 * than an accidental exemption from it.
 */
export const FINISH_TYPES_NEEDING_COLOUR = ["paint", "stain", "melamine", "plam"] as const;

export function needsColour(finishType: string | null | undefined): boolean {
  return !!finishType && (FINISH_TYPES_NEEDING_COLOUR as readonly string[]).includes(finishType);
}

const filled = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;

/**
 * True when the group names its colour somewhere.
 *
 * A free-typed `color_name` with no catalog id counts: a custom match the
 * client picked from a fan deck is a real answer, and refusing it would push
 * PMs back to leaving the field empty.
 */
export function hasFinishColour(g: ColourableGroup): boolean {
  if (!needsColour(g.finish_type)) return true;
  if (filled(g.color_id) || filled(g.color_name)) return true;
  if (g.finish_type === "paint" && filled(g.paint_id)) return true;
  if (g.finish_type === "stain" && filled(g.stain_id)) return true;
  return false;
}

/** What to call the missing thing, in the words the form uses for that type. */
export function colourFieldLabel(finishType: string | null | undefined): string {
  switch (finishType) {
    case "paint":    return "Paint colour";
    case "stain":    return "Stain colour";
    case "melamine": return "Melamine colour";
    case "plam":     return "Laminate colour";
    default:         return "Colour";
  }
}
