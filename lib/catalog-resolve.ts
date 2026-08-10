/**
 * lib/catalog-resolve.ts — where a catalog's rows come from.
 *
 * Pure, and imports nothing, so the rules can be tested without a database or a
 * filesystem. lib/catalogs.ts owns the caching and the accessors; this file owns
 * the one decision that used to be made two different ways in two places.
 *
 * The history matters for reading the rules below. There were two loaders: the
 * spec builder page read catalog_libraries in the database, and 39 synchronous
 * catalogs.X() accessors read data/catalogs/*.json and never looked at the
 * database at all. An admin edit therefore appeared in the picker and not on the
 * work order. Same job, same field, two answers, and nothing on either document
 * to say which one you were holding.
 */

/**
 * The column that identifies a row, per catalog. Most use `id`; these do not,
 * and assuming `id` everywhere would have declared 12 real catalogs invalid —
 * including the 1,526-row Sherwin-Williams list, whose key is the colour code.
 *
 * Verified against the shipped JSON: every field named here is present on every
 * row and unique across the file. `paint_colors_bm` is keyed on `name` rather
 * than `code` because its codes are NOT unique (2,175 rows, duplicate codes) —
 * ACC is SW-only going forward, so this exists to stop the file being treated as
 * malformed, not to encourage its use.
 */
export const CATALOG_KEY_FIELD: Record<string, string> = {
  acc_cabinet_catalog:   "sku_prefix",
  acc_catalog_carcass:   "catalog_id",
  acc_catalog_doors:     "catalog_id",
  acc_catalog_finishes:  "catalog_id",
  acc_catalog_pulls:     "catalog_id",
  cabinet_features:      "code",
  cabinet_labor:         "operation_code",
  cabinet_types:         "code",
  construction_profiles: "profile_id",
  paint_colors_sw:       "code",
  paint_colors_bm:       "name",
};

/** Which field identifies a row in this catalog. Defaults to `id`. */
export function keyFieldFor(name: string): string {
  return CATALOG_KEY_FIELD[name] ?? "id";
}

export type CatalogSource = "db" | "file";

export type CatalogResolution<T> = {
  rows: T[];
  source: CatalogSource;
  /** Set when a database row existed but was not usable. Worth logging. */
  note?: string;
};

/**
 * Resolve a row-list catalog. The file read is a thunk, so a catalog nobody
 * asked for is never parsed and the rules stay testable.
 *
 * An empty database row falls back to the file rather than serving an empty
 * catalog. That is deliberate. A blank edgeband dropdown reads as "this job has
 * no edgebanding" rather than "the catalog failed to load", and those two
 * mistakes do not cost the same — one is a question, the other is a remake. The
 * admin PUT refuses to write an empty catalog for the same reason, so the two
 * halves agree and this branch stays a safety net rather than a workflow.
 */
export function resolveCatalogRows<T>(
  name: string,
  dbData: unknown,
  loadFile: () => T[],
): CatalogResolution<T> {
  if (Array.isArray(dbData)) {
    if (dbData.length > 0) return { rows: dbData as T[], source: "db" };
    return {
      rows: loadFile(),
      source: "file",
      note: `catalog_libraries."${name}" is an empty array — serving the file instead`,
    };
  }
  if (dbData != null) {
    return {
      rows: loadFile(),
      source: "file",
      note: `catalog_libraries."${name}" is not an array — serving the file instead`,
    };
  }
  return { rows: loadFile(), source: "file" };
}

/**
 * Resolve one of the three catalogs stored as an object rather than a row array
 * (doors_catalog, cabinets_catalog, express_colors). A database row only wins if
 * it is a non-empty plain object, so an array written by mistake cannot replace
 * a door price book with nothing.
 */
export function resolveCatalogObject<T>(
  name: string,
  dbData: unknown,
  loadFile: () => T,
): { value: T; source: CatalogSource; note?: string } {
  const usable =
    dbData != null &&
    typeof dbData === "object" &&
    !Array.isArray(dbData) &&
    Object.keys(dbData as object).length > 0;
  if (usable) return { value: dbData as T, source: "db" };
  if (dbData == null) return { value: loadFile(), source: "file" };
  return {
    value: loadFile(),
    source: "file",
    note: `catalog_libraries."${name}" is not a usable object — serving the file instead`,
  };
}
