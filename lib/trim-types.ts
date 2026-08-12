/**
 * Trim type vocabulary — one list, one spelling.
 *
 * Why this file exists:
 *
 * There were three trim lists that did not agree.
 *
 *   1. FG Trim Defaults, hardcoded in ResidentialSpecClient:
 *        Fillers · Toekick · Crown · Light Valance
 *   2. Room trim dropdown, hardcoded 700 lines further down the same file:
 *        Crown Molding · Valance · Toekick · Light Rail · Scribe Molding ·
 *        Base Shoe · Crown Nailer · Filler · Other
 *   3. data/catalogs/molding_types.csv — richer than both, carries typical_size,
 *      has an "Other (specify)" escape hatch, and was used by NEITHER.
 *
 * That is not a cosmetic problem. Both the spec summary and the work order roll
 * trim up by `trim_type + size_desc` (ResidentialSpecClient, lib/pdf-spec.tsx).
 * A finish-group default called "Crown" and a room row called "Crown Molding"
 * are different keys, so they print as two line items with the linear footage
 * split between them. Nobody adds them back up.
 *
 * The catalog is now the single source, so the list is editable without a
 * deploy — which was the actual requirement.
 *
 * Karl's calls, 2026-08-07:
 *   - Toe Skin and Toe Kick collapse into one "Toekick". The catalog used to
 *     split the skin over the recess from a finished kick face; ACC treats them
 *     as one item, so the catalog now does too.
 *   - "Light Valance" and "Light Rail" are the same part. One entry, Light Rail.
 */

/**
 * Legacy spellings still sitting in finish_group_trim_defaults.trim_type and
 * room_trim.trim_type, mapped to the catalog's display_name.
 *
 * Applied on READ rather than by migrating the rows. Two reasons: a rename is
 * irreversible and these strings are on documents the shop has already built
 * from, and normalizing on read fixes the rollup immediately for every existing
 * spec instead of only the ones someone happens to re-save. Rows drift to the
 * canonical spelling naturally as they are edited.
 *
 * Keys are compared lowercased and whitespace-collapsed, so "TOEKICK",
 * "Toe kick" and "toe  kick" all land in the same place.
 */
const LEGACY_TRIM_NAMES: Record<string, string> = {
  // plural/singular and shortened forms
  "fillers":       "Filler",
  "crown":         "Crown Molding",
  "scribe molding": "Scribe",
  // Bare "Toekick" is the applied skin — that is what every existing row means,
  // and what the 4.5in on the work order refers to. "Toe Kick" written out is a
  // real, separate catalog entry now (the finished visible kick face) and keeps
  // its own name rather than being folded in.
  "toekick":       "Toe Skin",
  "toeskin":       "Toe Skin",
  "toe skin":      "Toe Skin",
  "toe kick":      "Toe Kick",
  // Karl: a light valance IS a light rail
  "light valance": "Light Rail",
  "valance":       "Light Rail",
  // the escape hatch has a longer name in the catalog
  "other":         "Other (specify)",
};

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Map any stored trim_type to the spelling the catalog uses.
 *
 * Anything unrecognized passes through untouched — a PM who typed a genuine
 * one-off ("Sink Apron Trim") keeps their words. This function never invents a
 * type, it only reconciles spellings we know are the same thing.
 */
export function canonicalTrimType(raw: string | null | undefined): string {
  if (!raw) return "";
  const key = normalizeKey(raw);
  return LEGACY_TRIM_NAMES[key] ?? raw.trim();
}

/** True when `raw` is a legacy spelling that canonicalTrimType() will rewrite. */
export function isLegacyTrimName(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const canon = canonicalTrimType(raw);
  return canon !== raw.trim();
}

/**
 * The four types every finish group carries a default row for. These are the
 * ones that appear on essentially every job, so they are always visible rather
 * than something a PM has to remember to add.
 *
 * Spelled to match molding_types.csv display_name — if these drift out of the
 * catalog the dropdown silently offers a duplicate, so they are asserted in
 * scripts/test-trim-types.mjs.
 */
export const FG_TRIM_DEFAULT_TYPES = [
  "Filler",
  "Toe Skin",
  "Crown Molding",
  "Light Rail",
] as const;

// ── Shop defaults for the finish-group trim grid ─────────────────────────────

/**
 * The sizes ACC uses unless a job says otherwise, keyed by canonical trim type.
 *
 * Karl: "the fillers, toekicks, and light valance should all have default sizes.
 * 2.5x2.5 for filler, .75x4.5 for toe kick, and .75x2 for valance. Crown varies too
 * much for us to have a default."
 *
 * Crown Molding is deliberately absent — an empty cell is an honest prompt, and a
 * wrong default on crown is worse than no default because it looks decided.
 */
export const FG_TRIM_DEFAULT_SIZES: Record<string, string> = {
  "Filler":     '2.5" × 2.5"',
  "Toe Skin":   '0.75" × 4.5"',
  "Light Rail": '0.75" × 2"',
};

/** The default size for a trim type, or "" when there is no sensible one. */
export function defaultTrimSize(trimType: string | null | undefined): string {
  return FG_TRIM_DEFAULT_SIZES[canonicalTrimType(trimType)] ?? "";
}

/**
 * What the trim is made of, derived from the finish group.
 *
 * Karl: "THE SPECIES/MATERIAL SHOULD AUTO POPULATE TO MATCH THE FG NAME. so on the
 * paint for this one the species/material should be paint grade PNT-1."
 *
 *   paint     -> "Paint Grade PNT-1"   the group label matters: two paint groups on
 *                                      one job are two different colours, and trim
 *                                      that says only "Paint Grade" cannot be sorted
 *                                      at the bench.
 *   stain     -> the species            "Alder". Trim is milled from the same stock.
 *   melamine  -> the colour             "H3790 Honey Carini Walnut".
 *
 * Returns "" when the group cannot answer yet, so the PM sees an empty box to fill
 * rather than a confident guess.
 */
export function trimMaterialForFinishGroup(fg: {
  finish_type?: string | null;
  label?: string | null;
  species?: string | null;
  color_name?: string | null;
}): string {
  const type = (fg.finish_type ?? "").toLowerCase();
  if (type === "paint")    return `Paint Grade${fg.label ? ` ${fg.label}` : ""}`;
  if (type === "stain")    return (fg.species ?? "").trim();
  if (type === "melamine") return (fg.color_name ?? "").trim();
  return "";
}
