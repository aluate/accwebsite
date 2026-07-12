import path from "path";
import fs from "fs";
import { unstable_cache } from "next/cache";
import sql from "@/lib/db";

const DIR = path.join(process.cwd(), "data/catalogs");

function load<T>(name: string): T[] {
  const file = path.join(DIR, `${name}.json`);
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T[];
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

export type MelamineColor = {
  id: string;
  supplier: "Egger" | "Stevenswood" | "Tafisa" | "Custom";
  collection: string;
  line: string;
  code: string | null;
  name: string;
  texture: string | null;
  woodgrain: boolean;
  price_tier: string | null;
  hex_approx: string | null;
  notes: string | null;
  placeholder: boolean;
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
  // DB-backed extra fields
  vendor?: string | string[] | null;
  cabdoor_preset_id?: string | null;
};

export type HardwarePull = {
  id: string; name: string; brand: string; model: string; type: string;
  hole_spacing_in: string | null; length_in: string | null;
  finish_options: string | string[] | null;
  notes: string | null;
};

export type RevaAccessory = {
  id: string; name: string; brand: string; series: string; category: string;
  /** Numeric after sync-catalogs coercion. Single value -> number, list -> number[]. */
  width_options_in: number | number[] | null;
  finish_options: string | string[] | null;
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
  supplier_code?: string | null;
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
  manufacturer: string | null;
  sku: string | null;
  type: "melamine" | "pvc" | "abs" | "hardwood" | "custom";
  material_type: string | null;
  has_grain: boolean;
  color_match: string | null;
  // Mixed runtime: string when 1 value, string[] when multiple. Use asArray().
  compatible_finish_type: string | string[] | null;
  thickness_mm: string | null;
  thickness_in: string | null;
  width_in: string | null;
  notes: string | null;
  placeholder: boolean;
};

export type EdgebandLocation = {
  letter_code: string;
  description: string;
  sort_order: number;
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

// ── DB-backed async loaders (React cache — one hit per request) ───────────────
// Arrays are stored semicolon-joined in DB; asArray() normalizes them for callers.
// Boolean columns stored as INTEGER 0/1 in Postgres; coerce with !!.

const _paintColors = unstable_cache(async (): Promise<PaintColor[]> => {
  const rows = await sql`SELECT * FROM catalog_paint_colors ORDER BY brand, name`;
  return rows.map((r) => ({
    ...r,
    is_custom_match: !!r.is_custom_match,
    placeholder: !!r.placeholder,
  })) as PaintColor[];
}, ["cat-paint-colors"], { revalidate: 300 });

const _stainColors = unstable_cache(async (): Promise<StainColor[]> => {
  const rows = await sql`SELECT * FROM catalog_stain_colors ORDER BY brand, name`;
  return rows.map((r) => ({
    ...r,
    is_in_house_mix: !!r.is_in_house_mix,
    is_custom_match: !!r.is_custom_match,
    placeholder: !!r.placeholder,
  })) as StainColor[];
}, ["cat-stain-colors"], { revalidate: 300 });

const _melamineColors = unstable_cache(async (): Promise<MelamineColor[]> => {
  const rows = await sql`SELECT * FROM catalog_melamine_colors ORDER BY supplier, name`;
  return rows.map((r) => ({
    ...r,
    woodgrain: !!r.woodgrain,
    placeholder: !!r.placeholder,
  })) as MelamineColor[];
}, ["cat-melamine-colors"], { revalidate: 300 });

const _carcassMaterials = unstable_cache(async (): Promise<CarcassMaterial[]> => {
  const rows = await sql`SELECT * FROM catalog_carcass_materials ORDER BY name`;
  return rows.map((r) => ({ ...r, is_other: !!r.is_other })) as CarcassMaterial[];
}, ["cat-carcass-materials"], { revalidate: 300 });

const _drawerBoxes = unstable_cache(async (): Promise<DrawerBox[]> => {
  const rows = await sql`SELECT * FROM catalog_drawer_boxes ORDER BY name`;
  return rows.map((r) => ({ ...r, is_other: !!r.is_other })) as DrawerBox[];
}, ["cat-drawer-boxes"], { revalidate: 300 });

const _edgebands = unstable_cache(async (): Promise<Edgeband[]> => {
  const rows = await sql`SELECT * FROM catalog_edgebands ORDER BY supplier, product_name`;
  return rows.map((r) => ({
    ...r,
    placeholder: !!r.placeholder,
    has_grain: !!r.has_grain,
    manufacturer: r.manufacturer ?? null,
    sku: r.sku ?? null,
    material_type: r.material_type ?? null,
    thickness_in: r.thickness_in ?? null,
    // compatible_finish_type stored as semicolons — leave as-is; callers use asArray()
  })) as Edgeband[];
}, ["cat-edgebands"], { revalidate: 300 });

const _edgebandLocations = unstable_cache(async (): Promise<EdgebandLocation[]> => {
  const rows = await sql`SELECT * FROM catalog_edgeband_locations ORDER BY sort_order`;
  return rows as unknown as EdgebandLocation[];
}, ["cat-edgeband-locations"], { revalidate: 300 });

const _species = unstable_cache(async (): Promise<Species[]> => {
  const rows = await sql`SELECT * FROM catalog_species ORDER BY name`;
  return rows as unknown as Species[];
}, ["cat-species"], { revalidate: 300 });

const _revaAccessories = unstable_cache(async (): Promise<RevaAccessory[]> => {
  const rows = await sql`SELECT * FROM catalog_accessories ORDER BY category, name`;
  return rows as unknown as RevaAccessory[];
}, ["cat-reva-accessories"], { revalidate: 300 });

const _builderProfiles = unstable_cache(async (): Promise<BuilderProfile[]> => {
  const rows = await sql`SELECT * FROM catalog_builder_profiles ORDER BY builder_name`;
  return rows.map((r) => ({
    ...r,
    is_residential_default: !!r.is_residential_default,
  })) as BuilderProfile[];
}, ["cat-builder-profiles"], { revalidate: 300 });

const _doorStyles = unstable_cache(async (): Promise<DoorStyle[]> => {
  const rows = await sql`SELECT * FROM catalog_door_styles ORDER BY name`;
  return rows.map((r) => ({
    ...r,
    placeholder: !!r.placeholder,
    profile: (r as Record<string, unknown>).profile as string ?? "",
    overlay: null,
  })) as DoorStyle[];
}, ["cat-door-styles"], { revalidate: 300 });

const _hardwarePulls = unstable_cache(async (): Promise<HardwarePull[]> => {
  const rows = await sql`SELECT * FROM catalog_pulls ORDER BY name`;
  return rows as unknown as HardwarePull[];
}, ["cat-hardware-pulls"], { revalidate: 300 });

// -- Loader registry ----------------------------------------------------------

export const catalogs = {
  paintColors:    () => _paintColors(),
  stainColors:    () => _stainColors(),
  melamineColors: () => _melamineColors(),
  species:        () => _species(),
  doorStyles:     () => _doorStyles(),
  hardwarePulls:  () => _hardwarePulls(),
  revaAccessories:() => _revaAccessories(),

  carcassMaterials: () => _carcassMaterials(),
  drawerBoxes:      () => _drawerBoxes(),
  rooms:            () => load<Room>("rooms"),

  moldingTypes:    () => load<MoldingType>("molding_types"),
  moldingProfiles: () => load<MoldingProfile>("molding_profiles"),
  edgebands:       () => _edgebands(),
  edgebandLocations: () => _edgebandLocations(),
  builderProfiles: () => _builderProfiles(),

  cabDoorInsideProfiles: () => load<CabDoorInsideProfile>("cabdoor_inside_profiles"),
  cabDoorPanels:         () => load<CabDoorPanel>("cabdoor_panels"),
  cabDoorEdgeDetails:    () => load<CabDoorEdgeDetail>("cabdoor_edge_details"),
  cabDoorMitrePatterns:  () => load<CabDoorMitrePattern>("cabdoor_mitre_patterns"),
  cabDoorPresets:        () => load<CabDoorPreset>("cabdoor_presets"),

  // Spec form expansion v2 (2026-05-06).
  sheens:           () => load<Sheen>("sheens"),
  drawerSlides:     () => load<DrawerSlide>("drawer_slides"),
  glazes:           () => load<Glaze>("glazes"),
  topcoats:         () => load<Topcoat>("topcoats"),
  doorMaterials:    () => load<DoorMaterial>("door_materials"),
  moldingMaterials: () => load<MoldingMaterial>("molding_materials"),

  // Hardware split into 11 per-role CSVs per Karl's CSV-libraries-human-editable
  // preference. Form renders the right catalog based on the finish_group_hardware.role value.
  hardwareHinges:        () => load<HardwareRow>("hardware_hinges"),
  hardwareDrawerSlides:  () => load<HardwareRow>("hardware_drawer_slides"),
  hardwareRolloutSlides: () => load<HardwareRow>("hardware_rollout_slides"),
  hardwareClosetRods:    () => load<HardwareRow>("hardware_closet_rods"),
  hardwareTrashPullouts: () => load<HardwareRow>("hardware_trash_pullouts"),
  hardwareBasePullouts:  () => load<HardwareRow>("hardware_base_pullouts"),
  hardwareBlindCorners:  () => load<HardwareRow>("hardware_blind_corners"),
  hardwareShelfClips:    () => load<HardwareRow>("hardware_shelf_clips"),
  hardwareDoorPulls:     () => load<HardwareRow>("hardware_door_pulls"),
  hardwareDrawerPulls:   () => load<HardwareRow>("hardware_drawer_pulls"),
  hardwareMisc:          () => load<HardwareRow>("hardware_misc"),

  /**
   * Resolve a hardware row by role + id. Form/PDF code uses this to look up
   * the right catalog for any finish_group_hardware row.
   */
  hardwareByRole(role: string): HardwareRow[] {
    switch (role) {
      case "hinges":          return load<HardwareRow>("hardware_hinges");
      case "drawer_slides":   return load<HardwareRow>("hardware_drawer_slides");
      case "rollout_slides":  return load<HardwareRow>("hardware_rollout_slides");
      case "closet_rod":      return load<HardwareRow>("hardware_closet_rods");
      case "trash_pullout":   return load<HardwareRow>("hardware_trash_pullouts");
      case "base_pullout":    return load<HardwareRow>("hardware_base_pullouts");
      case "blind_corner":    return load<HardwareRow>("hardware_blind_corners");
      case "shelf_clips":     return load<HardwareRow>("hardware_shelf_clips");
      case "door_pulls":      return load<HardwareRow>("hardware_door_pulls");
      case "drawer_pulls":    return load<HardwareRow>("hardware_drawer_pulls");
      case "misc":            return load<HardwareRow>("hardware_misc");
      default: return [];
    }
  },

  countertopStyles:    () => load<CountertopStyle>("countertop_styles"),
  countertopEdges:     () => load<CountertopEdge>("countertop_edges"),
  countertopMaterials: () => load<CountertopMaterial>("countertop_materials"),

  doorCatalog: (): DoorCatalog => {
    const file = path.join(DIR, "doors_catalog.json");
    return JSON.parse(fs.readFileSync(file, "utf-8")) as DoorCatalog;
  },
  cabinetFamilies: (): CabinetFamily[] => {
    const file = path.join(DIR, "cabinets_catalog.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, Omit<CabinetFamily, "family_code">>;
    return Object.entries(raw).map(([family_code, data]) => ({ family_code, ...data }));
  },
};
