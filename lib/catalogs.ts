import path from "path";
import fs from "fs";
import { sql } from "@/lib/db";
import {
  resolveCatalogRows,
  resolveCatalogObject,
  type CatalogSource,
} from "@/lib/catalog-resolve";

// Catalogs stored in DB (editable from admin). Falls back to JSON file if not in DB yet.
const DB_CATALOG_NAMES = new Set([
  "door_styles","colors_carcass","drawer_box","hardware_pulls","edgeband",
  "appliances","species","rooms","molding_types","molding_profiles","molding_materials",
  "door_materials","sheens","drawer_slides","glazes","topcoats",
  "countertop_styles","countertop_edges","countertop_materials",
  "hardware_hinges","hardware_drawer_slides","hardware_rollout_slides",
  "hardware_closet_rods","hardware_trash_pullouts","hardware_base_pullouts",
  "hardware_blind_corners","hardware_shelf_clips","hardware_door_pulls",
  "hardware_drawer_pulls","hardware_misc",
  // additional catalogs
  "acc_cabinet_catalog",
  "acc_catalog_carcass",
  "acc_catalog_doors",
  "acc_catalog_finishes",
  "acc_catalog_pulls",
  "accessories_reva",
  "builder_profiles",
  "cabdoor_edge_details",
  "cabdoor_inside_profiles",
  "cabdoor_mitre_patterns",
  "cabdoor_panels",
  "cabdoor_presets",
  "cabinet_features",
  "cabinet_labor",
  "cabinet_types",
  "cabinets_catalog",
  "colors_melamine",
  "colors_paint",
  "colors_stain",
  "construction_profiles",
  "doors_catalog",
  "express_colors",
  "paint_colors_bm",
  "paint_colors_sw",
]);

const DIR = path.join(process.cwd(), "data/catalogs");

function load<T>(name: string): T[] {
  const file = path.join(DIR, `${name}.json`);
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T[];
}

function loadObject<T>(name: string): T {
  const file = path.join(DIR, `${name}.json`);
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
}

// Helper: many catalog fields are auto-arrayed by sync-catalogs.mjs when a
// CSV cell contains semicolons, but stay as plain strings when there's only
// one value. Use this to normalize either form to a string[].
export function asArray(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(String);
  return String(v).split(";").map((s) => s.trim()).filter(Boolean);
}

// -- Existing libraries -------------------------------------------------------

export type PaintColor = {
  id: string;
  brand: "ML" | "BM" | "SW" | "Custom";
  collection: string | null;
  code: string | null;
  name: string;
  hex_approx: string | null;
  is_custom_match: boolean;
  placeholder: boolean;
  notes: string | null;
};

export type StainColor = {
  id: string;
  brand: "ML" | "ACC" | "Custom";
  code: string | null;
  name: string;
  is_in_house_mix: boolean;
  is_custom_match: boolean;
  notes: string | null;
  placeholder: boolean;
};

/**
 * Melamine / TFL colours.
 *
 * Replaced the 205-row hand-built catalog in 2026-08 with 366 real supplier colours,
 * each with photography. The old schema described a colour in words (supplier,
 * collection, line, an approximate hex); this one points at a picture of it, which
 * is what a client choosing a finish actually needs.
 *
 * No id survived the change — old ids looked like MEL-EG-F416, new ones like
 * MEL-EGG-045, and even Stevenswood moved from SW to SWD. Existing specs are
 * remapped by colour name; see scripts/migrate-melamine-ids.mjs. Documents were
 * never at risk because finish_groups.color_name is stored denormalised and the PDF
 * renders from it.
 */
export type MelamineColor = {
  id: string;
  /** AGT | Egger | Stevenswood | Tafisa | Tru North */
  brand: string;
  color_name: string;
  color_code: string | null;
  /** e.g. soft_touch, matte, gloss, woodgrain */
  finish_type: string | null;
  texture_code: string | null;
  /** Served path, e.g. /melamines/MEL-AGT-001.jpg — 400x400, derived from the original. */
  image_url: string | null;
  /** Where the photo came from. Kept for re-fetching, never displayed. */
  source_image_url: string | null;
  notes: string | null;
};

export type Species = {
  id: string; name: string; grades: string | string[] | null; hardness_janka: string | null;
  typical_use: string | null; notes: string | null;
};

export type DoorStyle = {
  id: string; name: string; profile: string; overlay: string | null;
  construction: string | null;
  compatible_finish: string | string[] | null;
  notes: string | null;
  placeholder: boolean;
};

export type HardwarePull = {
  id: string; name: string; brand: string; model: string; type: string;
  hole_spacing_in: string | null; length_in: string | null;
  finish_options: string | string[] | null;
  notes: string | null;
};

export type RevaAccessory = {
  id: string; name: string; brand: string; series: string; category: string;
  /** Semicolon-delimited size options from CSV (e.g. "12;15;18"). */
  width_options_in: string | null;
  finish_options: string | null;
  /** Semicolon-delimited if multiple hands (e.g. "L;R"), empty if not handed. */
  hand: string | null;
  image_url: string | null;
  price_slp: string | null;
  price_date: string | null;
  notes: string | null;
};

export type CabinetFamilyOptions = {
  supports_rollouts: boolean;
  max_rollouts: number;
  supports_trash_kit: boolean;
  supports_spice_pullout?: boolean;
  trash_config?: string[];
  supports_applied_panels?: boolean;
};

export type CabinetFamily = {
  family_code: string;
  display_name: string;
  category: "Base" | "Wall" | "Tall" | "Vanity" | "Accessory";
  default_height_in?: number;
  default_depth_in?: number;
  allowed_widths_in?: number[];
  allowed_heights_in?: number[];
  code_pattern: string;
  cv_assembly: string;
  cnc_program: string;
  requires_hinge_side: boolean;
  is_accessory?: boolean;
  unit?: string;
  size_mode?: string;
  options?: CabinetFamilyOptions;
};

export type DoorType = {
  id: string; label: string;
  has_swing: boolean; has_core: boolean; has_bore: boolean;
  has_hardware: boolean; has_hinge_prep: boolean;
};

export type DoorSizeEntry = { nom: string; base_price: number };

export type DoorCatalog = {
  door_types: DoorType[];
  sizes: Record<string, DoorSizeEntry[]>;
  core_adder: Record<string, number>;
  species_mult: Record<string, number>;
  hardware_adder: Record<string, number>;
};

// -- Phase 0 new libraries (2026-05) ------------------------------------------

export type CarcassMaterial = {
  id: string;
  name: string;
  material_class: "particleboard" | "plywood" | "other";
  species: string | null;
  prefinish: string | null;
  notes: string | null;
  is_other: boolean;
};

export type DrawerBox = {
  id: string;
  name: string;
  construction: "doweled_butt_joint" | "dovetail" | "other";
  species: string | null;
  prefinish: string | null;
  notes: string | null;
  is_other: boolean;
};

export type Room = {
  id: string;
  name: string;
  category: string;
  sort_order: string;
  notes: string | null;
};

export type MoldingType = {
  id: string;
  type: string;
  display_name: string;
  typical_size: string | null;
  inherits_room_finish: boolean;
  notes: string | null;
};

export type MoldingProfile = {
  id: string;
  name: string;
  vendor: string;
  compatible_types: string | string[] | null;
  notes: string | null;
  placeholder: boolean;
};

export type Edgeband = {
  id: string;
  product_name: string;
  supplier: string;
  type: "melamine" | "pvc" | "abs" | "hardwood" | "custom";
  color_match: string | null;
  // Mixed runtime: string when 1 value, string[] when multiple. Use asArray().
  compatible_finish_type: string | string[] | null;
  thickness_mm: string | null;
  width_in: string | null;
  notes: string | null;
  placeholder: boolean;
};

export type BuilderProfile = {
  id: string;
  builder_name: string;
  builder_company: string | null;
  default_finish_type: "paint" | "stain" | "melamine";
  default_carcass_id: string;
  default_drawer_box_id: string;
  default_pull_id: string;
  default_paint_brand: string | null;
  default_accessories: string | string[] | null;
  preferred_cabdoor_usage_groups: string | string[] | null;
  notes: string | null;
  is_residential_default: boolean;
};

export type CabDoorInsideProfile = {
  id: string;
  usage_group: string;
  category: string;
  arch_available: boolean;
  glaze_suitable: boolean;
  lite_compatibility: "standard" | "deluxe" | "standard+deluxe" | "none";
  /** Numeric after sync-catalogs coercion. */
  std_width_in: number;
  /** Numeric after sync-catalogs coercion. Single value -> number, list -> number[]. */
  upcharge_widths_in: number | number[] | null;
  min_panel_width_in: number | null;
  notes: string | null;
  placeholder: boolean;
};

export type CabDoorPanel = {
  id: string;
  usage_group: string;
  available_in_flat_back: boolean;
  category: string;
  notes: string | null;
  placeholder: boolean;
};

export type CabDoorEdgeDetail = {
  id: string;
  name: string;
  /** "standard" | "finger_pull" | "raised_drawer_front" */
  category: string;
  /** Whether the edge accepts a Euro hinge prep. Some finger-pull edges do not. */
  hinge_compatible: boolean;
  /** Whether the edge can be combined with a mitre pattern. Raised DF edges cannot. */
  mitre_compatible: boolean;
  notes: string | null;
  placeholder: boolean;
};

export type CabDoorMitrePattern = {
  id: string;
  /** "3in" | "2.25in" | "2.5in" -- std width family */
  size: string;
  /** Pattern's traditional name (e.g. "Lexington", "Cherry Hill"). */
  name: string;
  /** "3in_mitre" | "2.25in_mitre" | "2.5in_mitre" | "custom_mitre" */
  category: string;
  /** Cab Door usage group (most mitres are A). */
  usage_group: string;
  notes: string | null;
  placeholder: boolean;
};

export type CabDoorPreset = {
  id: string;
  preset_name: string;
  /** Empty string when the preset is mitre-only (no inside profile). */
  inside_profile_id: string;
  panel_id: string;
  edge_detail_id: string | null;
  mitre_pattern_id: string | null;
  arch: boolean;
  glaze: boolean;
  /** "standard" | "deluxe" | "standard+deluxe" | "none" */
  lite: "standard" | "deluxe" | "standard+deluxe" | "none";
  notes: string | null;
  placeholder: boolean;
};

// -- Spec form expansion v2 (2026-05-06) catalogs -----------------------------

export type Sheen = {
  id: string; name: string; sort_order: string | number; notes: string | null;
};

export type DrawerSlide = {
  id: string; name: string; brand: string; model: string;
  mount: string | null; close: string | null;
  length_options_in: string | string[] | number | number[] | null;
  notes: string | null;
};

export type Glaze = {
  id: string; name: string; brand: string; color_family: string | null; notes: string | null;
};

export type Topcoat = {
  id: string; name: string; type: string; brand: string; notes: string | null;
};

export type DoorMaterial = {
  id: string; name: string; species: string | null; grade: string | null;
  grain_pattern: string | null; notes: string | null; placeholder: boolean;
};

export type MoldingMaterial = {
  id: string; name: string; species: string | null; grade: string | null; notes: string | null;
};

// 11 hardware role catalogs share a common shape on the schema side (id + name + brand + ...).
// The TS types differ slightly per role, so each gets its own loader. For form
// rendering, callers can treat them uniformly via the HardwareRow union.
export type HardwareRow = {
  id: string;
  name: string;
  brand?: string | null;
  notes: string | null;
  /** Free-form for role-specific extras (length, type, finish_options, etc.). */
  [k: string]: unknown;
};

export type CountertopStyle    = { id: string; name: string; description: string | null; notes: string | null };
export type CountertopEdge     = { id: string; name: string; description: string | null; notes: string | null };
export type CountertopMaterial = { id: string; name: string; category: string | null; brand_examples: string | string[] | null; notes: string | null };

export type ExpressColor = { id: string; name: string; hex?: string | null };
export type ExpressColorBook = {
  paint: ExpressColor[];
  stain: ExpressColor[];
  melamine: ExpressColor[];
};

// -- Resolution ---------------------------------------------------------------
//
// The rules live in lib/catalog-resolve.ts, which imports nothing so they can be
// tested without a database (scripts/test-catalog-resolve.mjs). Re-exported here
// because this is the module everything already imports.

export type { CatalogSource, CatalogResolution } from "@/lib/catalog-resolve";
export { resolveCatalogRows, resolveCatalogObject, keyFieldFor, CATALOG_KEY_FIELD } from "@/lib/catalog-resolve";

// -- Cache --------------------------------------------------------------------
//
// One query fetches every catalog the database holds (all of them together are
// under a megabyte as JSON), held for CACHE_TTL_MS per server instance. The
// accessors stay synchronous, which is what keeps this a 10-line change at the
// call sites instead of a rewrite of every .find() in the codebase.
//
// The cost of the cache is that an admin edit can take up to the TTL to appear
// on a server instance that did not serve the write. invalidateCatalogCache()
// clears the instance that did. For a colour-name lookup that is a fine trade;
// specs store the id and a denormalised name, so no document changes under
// anyone mid-render.
//
// This also removes a hot-loop file read. Every catalogs.X() call used to do a
// readFileSync plus a JSON.parse, and hardwareByRole() was called once per
// hardware row — a spec PDF re-parsed the same JSON dozens of times.

const CACHE_TTL_MS = 15_000;

let dbCache: { at: number; map: Map<string, unknown> } | null = null;
let warnedUnreadable = false;

/** Drop the cached database snapshot on this instance. Called after an admin write. */
export function invalidateCatalogCache(): void {
  dbCache = null;
}

async function fetchDbCatalogs(): Promise<Map<string, unknown>> {
  const now = Date.now();
  if (dbCache && now - dbCache.at < CACHE_TTL_MS) return dbCache.map;

  const map = new Map<string, unknown>();
  try {
    const rows = await sql<{ name: string; data: unknown }[]>`
      SELECT name, data FROM catalog_libraries
    `;
    for (const r of rows) {
      if (r?.name != null) map.set(r.name, r.data);
    }
  } catch (e) {
    // Table missing, or the database is down. Every catalog falls back to its
    // file, so the app still works — but say so once, because silently serving
    // stale files is exactly the failure this module exists to prevent.
    if (!warnedUnreadable) {
      warnedUnreadable = true;
      console.warn(
        "[catalogs] catalog_libraries unreadable — serving all catalogs from data/catalogs/*.json.",
        (e as Error)?.message ?? e,
      );
    }
  }
  dbCache = { at: now, map };
  return map;
}

export type Catalogs = ReturnType<typeof makeSnapshot>;

function makeSnapshot(db: Map<string, unknown>) {
  const memoRows = new Map<string, unknown[]>();
  const memoObj = new Map<string, unknown>();
  const sources = new Map<string, CatalogSource>();

  function rows<T>(name: string): T[] {
    const hit = memoRows.get(name);
    if (hit) return hit as T[];
    const r = resolveCatalogRows<T>(name, db.get(name), () => load<T>(name));
    if (r.note) console.warn(`[catalogs] ${r.note}`);
    memoRows.set(name, r.rows as unknown[]);
    sources.set(name, r.source);
    return r.rows;
  }

  function obj<T>(name: string): T {
    if (memoObj.has(name)) return memoObj.get(name) as T;
    const r = resolveCatalogObject<T>(name, db.get(name), () => loadObject<T>(name));
    if (r.note) console.warn(`[catalogs] ${r.note}`);
    memoObj.set(name, r.value);
    sources.set(name, r.source);
    return r.value;
  }

  return {
    paintColors:    () => rows<PaintColor>("colors_paint"),
    stainColors:    () => rows<StainColor>("colors_stain"),
    melamineColors: () => rows<MelamineColor>("colors_melamine"),
    species:        () => rows<Species>("species"),
    doorStyles:     () => rows<DoorStyle>("door_styles"),
    hardwarePulls:  () => rows<HardwarePull>("hardware_pulls"),

    carcassMaterials: () => rows<CarcassMaterial>("colors_carcass"),
    drawerBoxes:      () => rows<DrawerBox>("drawer_box"),
    rooms:            () => rows<Room>("rooms"),

    moldingTypes:    () => rows<MoldingType>("molding_types"),
    moldingProfiles: () => rows<MoldingProfile>("molding_profiles"),
    edgebands:       () => rows<Edgeband>("edgeband"),

    cabDoorInsideProfiles: () => rows<CabDoorInsideProfile>("cabdoor_inside_profiles"),
    cabDoorPanels:         () => rows<CabDoorPanel>("cabdoor_panels"),
    cabDoorEdgeDetails:    () => rows<CabDoorEdgeDetail>("cabdoor_edge_details"),
    // No caller yet — the mitre/preset picker is not built. Kept because the
    // data is real and the UI is planned, unlike the two below.
    cabDoorMitrePatterns:  () => rows<CabDoorMitrePattern>("cabdoor_mitre_patterns"),
    cabDoorPresets:        () => rows<CabDoorPreset>("cabdoor_presets"),

    // Spec form expansion v2 (2026-05-06).
    sheens:           () => rows<Sheen>("sheens"),
    drawerSlides:     () => rows<DrawerSlide>("drawer_slides"),
    glazes:           () => rows<Glaze>("glazes"),
    topcoats:         () => rows<Topcoat>("topcoats"),
    doorMaterials:    () => rows<DoorMaterial>("door_materials"),
    moldingMaterials: () => rows<MoldingMaterial>("molding_materials"),

    // Hardware split into 11 per-role CSVs per Karl's CSV-libraries-human-editable
    // preference. Form renders the right catalog based on the finish_group_hardware.role value.
    hardwareHinges:        () => rows<HardwareRow>("hardware_hinges"),
    hardwareDrawerSlides:  () => rows<HardwareRow>("hardware_drawer_slides"),
    hardwareRolloutSlides: () => rows<HardwareRow>("hardware_rollout_slides"),
    hardwareClosetRods:    () => rows<HardwareRow>("hardware_closet_rods"),
    hardwareTrashPullouts: () => rows<HardwareRow>("hardware_trash_pullouts"),
    hardwareBasePullouts:  () => rows<HardwareRow>("hardware_base_pullouts"),
    hardwareBlindCorners:  () => rows<HardwareRow>("hardware_blind_corners"),
    hardwareShelfClips:    () => rows<HardwareRow>("hardware_shelf_clips"),
    hardwareDoorPulls:     () => rows<HardwareRow>("hardware_door_pulls"),
    hardwareDrawerPulls:   () => rows<HardwareRow>("hardware_drawer_pulls"),
    hardwareMisc:          () => rows<HardwareRow>("hardware_misc"),

    /**
     * Resolve a hardware row by role + id. Form/PDF code uses this to look up
     * the right catalog for any finish_group_hardware row.
     */
    hardwareByRole(role: string): HardwareRow[] {
      switch (role) {
        case "hinges":          return rows<HardwareRow>("hardware_hinges");
        case "drawer_slides":   return rows<HardwareRow>("hardware_drawer_slides");
        case "rollout_slides":  return rows<HardwareRow>("hardware_rollout_slides");
        case "closet_rod":      return rows<HardwareRow>("hardware_closet_rods");
        case "trash_pullout":   return rows<HardwareRow>("hardware_trash_pullouts");
        case "base_pullout":    return rows<HardwareRow>("hardware_base_pullouts");
        case "blind_corner":    return rows<HardwareRow>("hardware_blind_corners");
        case "shelf_clips":     return rows<HardwareRow>("hardware_shelf_clips");
        case "door_pulls":      return rows<HardwareRow>("hardware_door_pulls");
        case "drawer_pulls":    return rows<HardwareRow>("hardware_drawer_pulls");
        case "misc":            return rows<HardwareRow>("hardware_misc");
        default: return [];
      }
    },

    countertopStyles:    () => rows<CountertopStyle>("countertop_styles"),
    countertopEdges:     () => rows<CountertopEdge>("countertop_edges"),
    countertopMaterials: () => rows<CountertopMaterial>("countertop_materials"),

    // Three catalogs are objects rather than row arrays, so they resolve
    // through obj() and cannot be replaced by an array written by mistake.
    doorCatalog: (): DoorCatalog => obj<DoorCatalog>("doors_catalog"),

    cabinetFamilies: (): CabinetFamily[] => {
      const raw = obj<Record<string, Omit<CabinetFamily, "family_code">>>("cabinets_catalog");
      return Object.entries(raw).map(([family_code, data]) => ({ family_code, ...data }));
    },

    /** Express wizard colour book — previously read with its own inline readFileSync. */
    expressColors: (): ExpressColorBook => obj<ExpressColorBook>("express_colors"),

    /** Which catalogs this snapshot is serving from the database. Diagnostics only. */
    dbBackedNames: (): string[] => [...db.keys()].sort(),

    /** Where a catalog came from, once something has asked for it. */
    sourceOf: (name: string): CatalogSource | null => sources.get(name) ?? null,
  };
}

/**
 * The catalogs, as of this request. One database round trip (cached), then
 * every accessor is synchronous — so existing `.find()` / `.map()` code needs
 * no change beyond the one `await` that produces the snapshot.
 *
 *   const catalogs = await getCatalogs();
 *   const eb = catalogs.edgebands().find((e) => e.id === id);
 */
export async function getCatalogs(): Promise<Catalogs> {
  return makeSnapshot(await fetchDbCatalogs());
}

/** Every catalog name the loader knows about, for the seeder and the admin UI. */
export const CATALOG_NAMES: readonly string[] = [...DB_CATALOG_NAMES].sort();

/**
 * Catalogs that appear in /admin/libraries but that nothing reads from there,
 * because a dedicated table and a dedicated admin page took over. Editing them
 * on the Libraries page did nothing at all — the row saved, and the app carried
 * on reading somewhere else. The accessors are gone and the API refuses the
 * write, so the decoy is closed rather than merely documented.
 */
export const SUPERSEDED_CATALOGS: Record<string, { table: string; editAt: string }> = {
  builder_profiles: { table: "catalog_builder_profiles", editAt: "/admin/builder-profiles" },
  accessories_reva: { table: "accessories_catalog",      editAt: "/admin/accessories" },
};

/** The three catalogs stored as an object rather than a row array. */
export const OBJECT_CATALOGS: readonly string[] = ["doors_catalog", "cabinets_catalog", "express_colors"];
