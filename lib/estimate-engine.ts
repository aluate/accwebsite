/**
 * lib/estimate-engine.ts
 * Pure cost calculation engine for the estimating module.
 * No DB calls -- takes structured data, returns cost breakdown.
 *
 * Phase 3: construction-profile-driven BOM + accurate per-part material costs.
 * Update construction_profiles.csv / catalog CSVs -> run sync-catalogs.mjs.
 */

// --- Catalog imports ---------------------------------------------------------

import cabinetTypes       from "@/data/catalogs/cabinet_types.json";
import cabinetFeatures    from "@/data/catalogs/cabinet_features.json";
import hingesCatalog      from "@/data/catalogs/hardware_hinges.json";
import slidesCatalog      from "@/data/catalogs/hardware_drawer_slides.json";
import clipsCatalog       from "@/data/catalogs/hardware_shelf_clips.json";
import pullsCatalog       from "@/data/catalogs/hardware_pulls.json";
import laborCatalog       from "@/data/catalogs/cabinet_labor.json";
import carcassCatalog     from "@/data/catalogs/colors_carcass.json";
import profilesCatalog    from "@/data/catalogs/construction_profiles.json";
import cabdoorPresets     from "@/data/catalogs/cabdoor_presets.json";
import cabdoorPrices     from "@/data/cabdoor_prices.json";

// --- Catalog row shapes -------------------------------------------------------

type HingeRow    = { id: string; unit_cost: number | null };
type SlideRow    = { id: string; unit_cost_15in: number | null; unit_cost_18in: number | null; unit_cost_21in: number | null };
type ClipRow     = { id: string; unit_cost: number | null };
type PullRow     = { id: string; unit_cost: number | null };
type LaborRow    = { operation_code: string; phase: string; scale_by: string; hrs_per_unit: string | number };
type CarcassRow  = { id: string; unit_cost_per_sheet: string | number | null; sqft_per_sheet: string | number | null };
type ProfileRow  = {
  profile_id: string; name: string; is_default: boolean | string;
  mat_thickness_in: number | string;
  back_thickness_in: number | string;
  back_mat_cost_per_sf: number | string;
  toekick_height_in: number | string;
  door_reveal_side_in: number | string;
  door_reveal_top_in: number | string;
  door_reveal_bottom_in: number | string;
  door_reveal_between_in: number | string;
  top_nailer_height_in: number | string;
};
type CabdoorPresetRow = { id: string; preset_name: string; price_per_sqft: number | string | null };

// --- Domain types (public) ---------------------------------------------------

export type CabinetType = {
  code: string; category: string; display_name: string; cv_name_pattern: string;
  door_count: number; drawer_count: number; adj_shelves: number; fixed_shelves: number;
  complexity: string; notes: string;
};

export type CabinetFeature = {
  code: string; name: string; applies_to: string;
  labor_impact: string; material_impact: string; description: string; notes: string;
};

export type EstimateLineItem = {
  id: string;
  item_type: string;            // 'cabinet' | 'custom' | 'trim' | 'accessory'
  cabinet_type_code: string | null;
  description: string | null;
  width_in: number | null;
  height_in: number | null;
  depth_in: number | null;
  adj_shelves: number;
  qty: number;
  feature_codes: string | null; // JSON array string
  end_panel: number;
  unit_qty: number | null;
  unit_label: string | null;
  manual_unit_cost: number | null;
};

export type EstimateRoom = {
  id: string; name: string; sort_order: number; items: EstimateLineItem[];
};

export type EstimateSettings = {
  pm_hrs_base: number; pm_hrs_per_fg: number;
  eng_hrs_base: number; eng_hrs_per_fg: number;
  purchasing_hrs_base: number;
  pm_rate: number; eng_rate: number;
  shop_rate: number; finish_rate: number; install_rate: number;
  fixed_overhead_pct: number; default_margin_pct: number;
};

export type HardwareCounts = {
  hinges: number; drawer_slides: number; pulls: number;
  shelf_pins: number; false_fronts: number;
};

/** Per-cabinet bill of materials (qty=1 basis, before applying item.qty). */
export type CabinetBOM = {
  carcass_sf: number;       // 3/4" body material (sides, bottom, shelves, nailer)
  back_sf: number;          // 1/2" back panel (separate material, lower cost)
  edgeband_lf: number;      // front-edge banding LF
  door_sf: number;          // door face SF for CabDoor buyout pricing
  drawer_front_sf: number;  // drawer front SF for CabDoor buyout pricing
};

export type LineItemCost = {
  item_id: string;
  hardware: HardwareCounts;
  depth_in: number;
  bom: CabinetBOM;          // bill of materials (per cabinet, before qty)
  estimated_material: number;
  estimated_shop_labor_hrs: number;
  estimated_finish_labor_hrs: number;
  estimated_install_labor_hrs: number;
  is_manual: boolean;
  manual_cost: number;
};

export type RoomCost = {
  room_id: string; room_name: string;
  line_items: LineItemCost[];
  // Aggregate BOM for the room
  total_carcass_sf: number;
  total_back_sf: number;
  total_edgeband_lf: number;
  total_door_sf: number;
  total_drawer_front_sf: number;
  // Costs
  total_hardware_cost: number;
  total_material_cost: number;
  total_shop_labor_cost: number;
  total_finish_labor_cost: number;
  total_install_labor_cost: number;
  subtotal: number;
};

export type CostSummary = {
  rooms: RoomCost[];
  // Aggregate BOM across all rooms
  bom_carcass_sf: number;
  bom_back_sf: number;
  bom_edgeband_lf: number;
  bom_door_sf: number;
  bom_drawer_front_sf: number;
  // Direct costs
  total_material: number;
  total_hardware: number;
  total_shop_labor: number;
  total_finish_labor: number;
  total_install_labor: number;
  total_delivery: number;
  direct_cost_total: number;
  // People overhead
  pm_hours: number; eng_hours: number; purchasing_hours: number;
  people_overhead_cost: number;
  // Fixed overhead
  fixed_overhead_cost: number;
  // Total cost
  total_cost: number;
  // Pricing
  target_margin_pct: number;
  sell_price: number; tax_amount: number; sell_price_with_tax: number;
  // Flags
  has_manual_items: boolean; has_very_high_complexity: boolean;
};

// --- Cabinet type map --------------------------------------------------------

const TYPE_MAP = new Map<string, CabinetType>(
  (cabinetTypes as unknown as CabinetType[]).map((t) => [t.code, t])
);

export function getCabinetType(code: string): CabinetType | undefined { return TYPE_MAP.get(code); }
export function getAllCabinetTypes(): CabinetType[] { return cabinetTypes as unknown as CabinetType[]; }
export function getAllCabinetFeatures(): CabinetFeature[] { return cabinetFeatures as CabinetFeature[]; }

// --- Construction profile ----------------------------------------------------
// Physical constants that define HOW cabinets are built.
// Edit construction_profiles.csv -> re-sync to change.

export type ConstructionProfile = {
  profile_id: string;
  name: string;
  mat_thickness_in: number;        // carcass body (sides, bottom, shelves, nailer)
  back_thickness_in: number;       // back panel -- thinner material
  back_mat_cost_per_sf: number;    // $/SF for the back panel material
  toekick_height_in: number;       // base cabinet toekick height
  door_reveal_side_in: number;     // gap between door edge and case (each side)
  door_reveal_top_in: number;      // gap above door
  door_reveal_bottom_in: number;   // gap below door
  door_reveal_between_in: number;  // gap between paired doors
  top_nailer_height_in: number;    // height of top stretcher
};

function parseNum(v: string | number | null | undefined, fallback: number): number {
  if (v == null) return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? fallback : n;
}

const PROFILE_MAP = new Map<string, ConstructionProfile>(
  (profilesCatalog as ProfileRow[]).map((r) => [
    r.profile_id,
    {
      profile_id:             r.profile_id,
      name:                   r.name,
      mat_thickness_in:       parseNum(r.mat_thickness_in,       0.75),
      back_thickness_in:      parseNum(r.back_thickness_in,      0.50),
      back_mat_cost_per_sf:   parseNum(r.back_mat_cost_per_sf,   2.40),
      toekick_height_in:      parseNum(r.toekick_height_in,      4.00),
      door_reveal_side_in:    parseNum(r.door_reveal_side_in,    0.125),
      door_reveal_top_in:     parseNum(r.door_reveal_top_in,     0.125),
      door_reveal_bottom_in:  parseNum(r.door_reveal_bottom_in,  0.125),
      door_reveal_between_in: parseNum(r.door_reveal_between_in, 0.125),
      top_nailer_height_in:   parseNum(r.top_nailer_height_in,   3.50),
    }
  ])
);

const DEFAULT_PROFILE: ConstructionProfile =
  PROFILE_MAP.get("ACC_STD") ??
  (profilesCatalog as ProfileRow[]).find((r) => r.is_default === true || r.is_default === "true")
    ? Array.from(PROFILE_MAP.values()).find((p) => p.profile_id === "ACC_STD") ?? Array.from(PROFILE_MAP.values())[0]
    : {
        profile_id: "ACC_STD", name: "ACC Standard Frameless",
        mat_thickness_in: 0.75, back_thickness_in: 0.5, back_mat_cost_per_sf: 2.40,
        toekick_height_in: 4.0, door_reveal_side_in: 0.125, door_reveal_top_in: 0.125,
        door_reveal_bottom_in: 0.125, door_reveal_between_in: 0.125, top_nailer_height_in: 3.5,
      };

export function getConstructionProfile(id?: string | null): ConstructionProfile {
  if (id) return PROFILE_MAP.get(id) ?? DEFAULT_PROFILE;
  return DEFAULT_PROFILE;
}
export function getAllConstructionProfiles(): ConstructionProfile[] {
  return Array.from(PROFILE_MAP.values());
}

// --- CabDoor pricing ---------------------------------------------------------

const CABDOOR_PRICE_MAP = new Map<string, number>(
  (cabdoorPresets as CabdoorPresetRow[]).map((r) => [
    r.id, parseNum(r.price_per_sqft, 0)
  ])
);

/** Returns $/SF for a CabDoor preset, or 0 if not yet priced. */
export function getCabdoorPricePerSqft(presetId?: string | null): number {
  if (!presetId) return 0;
  return CABDOOR_PRICE_MAP.get(presetId) ?? 0;
}

// Catalog door pricing: style 116/Alder for catalog track (Alder = Paint Grade = $12.93)
const _prices = cabdoorPrices as Record<string, Record<string, number>>;
export const CATALOG_DOOR_PRICE_PER_SF: number =
  _prices["116"]?.["Alder"] ?? _prices["113"]?.["Alder"] ?? 12.93;

/** Returns $/SF for a given CabDoor style + species, falling back to catalog default. */
export function getCabdoorPriceForSpecies(style: number | string, species: string): number {
  return (_prices[String(style)]?.[species]) ?? CATALOG_DOOR_PRICE_PER_SF;
}

// --- Catalog-driven hardware unit costs -------------------------------------

const DEFAULT_HINGE_COST: number = (() => {
  const row = (hingesCatalog as HingeRow[]).find(
    (r) => r.id !== "HH-000" && r.id !== "HH-099" && r.unit_cost && r.unit_cost > 0
  );
  return row?.unit_cost ?? 2.77;
})();

const SLIDE_ROW = (slidesCatalog as unknown as SlideRow[]).find(
  (r) => r.id !== "HDS-000" && r.id !== "HDS-099" && r.unit_cost_21in && r.unit_cost_21in > 0
);
const DEFAULT_SLIDE_COST_15 = SLIDE_ROW?.unit_cost_15in ?? 9.10;
const DEFAULT_SLIDE_COST_18 = SLIDE_ROW?.unit_cost_18in ?? 12.50;
const DEFAULT_SLIDE_COST_21 = SLIDE_ROW?.unit_cost_21in ?? 18.00;

const TANDEM_SLIDE_COST: number = (() => {
  const row = (slidesCatalog as unknown as SlideRow[]).find((r) => r.id === "HDS-BLU-TANDEM");
  return row?.unit_cost_21in ?? 45.00;
})();

function slideCostForDepth(depth_in: number): number {
  if (depth_in <= 12) return DEFAULT_SLIDE_COST_15;
  if (depth_in <= 18) return DEFAULT_SLIDE_COST_18;
  return DEFAULT_SLIDE_COST_21;
}

/** Use Tandem slides for wide drawers (>= 25" wide), standard slides for narrower. */
function slideCostForDims(width_in: number, depth_in: number): number {
  if (width_in >= 25) return TANDEM_SLIDE_COST;
  return slideCostForDepth(depth_in);
}

const DEFAULT_SHELF_PIN_COST: number = (() => {
  const row = (clipsCatalog as ClipRow[]).find(
    (r) => r.id !== "HSC-099" && r.unit_cost && r.unit_cost > 0
  );
  return row?.unit_cost ?? 0.35;
})();

const DEFAULT_PULL_COST: number = (() => {
  const row = (pullsCatalog as PullRow[]).find(
    (r) => r.id !== "PL-013" && r.id !== "PL-014" && r.unit_cost && r.unit_cost > 0
  );
  return row?.unit_cost ?? 10.00;
})();

const DEFAULT_CARCASS_COST_PER_SF: number = (() => {
  const row = (carcassCatalog as CarcassRow[]).find((r) => r.id === "CAR-002");
  if (row) {
    const c = parseNum(row.unit_cost_per_sheet, 103);
    const s = parseNum(row.sqft_per_sheet, 32);
    if (s > 0) return c / s;
  }
  return 3.22;
})();

const END_PANEL_COST_PER_SF = 6.50;

// --- Catalog-driven labor operation times ------------------------------------

type LaborOps = {
  fab_per_sqft: number; fab_per_lf_edge: number; fab_per_cab: number;
  fab_per_drawer: number; fab_per_door: number;
  fin_carcass_stain: number; fin_carcass_paint: number; fin_carcass_mel: number;
  fin_door_stain: number; fin_door_paint: number;
  inst_base: number; inst_upper: number; inst_tall: number;
  inst_toekick_per_lf: number; inst_per_pull: number;
};

const LABOR: LaborOps = (() => {
  const get = (code: string): number => {
    const row = (laborCatalog as LaborRow[]).find((r) => r.operation_code === code);
    return row ? parseNum(row.hrs_per_unit, 0) : 0;
  };
  return {
    fab_per_sqft:        get("LABOR_CNC") + get("LABOR_BEAM_SAW") + get("LABOR_PANEL_LAYUP"),
    fab_per_lf_edge:     get("LABOR_EDGEBANDER"),
    fab_per_cab:         get("LABOR_DRILL_DOWEL") + get("LABOR_ROUGH_ASSEMBLY") +
                         get("LABOR_KITTING") + get("LABOR_FINISH_PREP"),
    fab_per_drawer:      get("LABOR_DRAWER_BOX") + get("LABOR_DRAWER_SLIDES_INSTALL"),
    fab_per_door:        get("LABOR_DRAWER_FRONT"),
    fin_carcass_stain:   get("LABOR_FINISHING_STAIN"),
    fin_carcass_paint:   get("LABOR_FINISHING_PAINT"),
    fin_carcass_mel:     get("LABOR_FINISHING_MEL"),
    fin_door_stain:      get("LABOR_FINISHING_DOOR_STAIN"),
    fin_door_paint:      get("LABOR_FINISHING_DOOR_PAINT"),
    inst_base:           get("LABOR_INSTALL_BASE"),
    inst_upper:          get("LABOR_INSTALL_UPPER"),
    inst_tall:           get("LABOR_INSTALL_TALL"),
    inst_toekick_per_lf: get("LABOR_INSTALL_TOEKICK"),
    inst_per_pull:       get("LABOR_INSTALL_PULL"),
  };
})();

// --- Hardware hard counts ----------------------------------------------------

function hingesPerDoor(height_in: number): number {
  if (height_in <= 40) return 2;
  if (height_in <= 60) return 3;
  return 4;
}

export function calcHardwareCounts(
  type: CabinetType, qty: number, height_in: number,
  adj_shelves: number, feature_codes: string[]
): HardwareCounts {
  const h: HardwareCounts = { hinges: 0, drawer_slides: 0, pulls: 0, shelf_pins: 0, false_fronts: 0 };

  h.hinges = type.door_count * hingesPerDoor(height_in) * qty;
  h.drawer_slides = type.drawer_count * qty;

  const rollouts = feature_codes.filter((c) => c === "ROLLOUT_SHELF").length;
  h.drawer_slides += rollouts * qty;

  const false_fronts = feature_codes.filter((c) => c === "FALSE_FRONT").length;
  h.false_fronts = false_fronts * qty;
  h.pulls = Math.max(0, type.door_count + type.drawer_count - false_fronts) * qty;
  if (feature_codes.includes("PUSH_TO_OPEN")) h.pulls = 0;

  h.shelf_pins = adj_shelves * 4 * qty;
  return h;
}

export function calcHardwareCost(hw: HardwareCounts, feature_codes: string[], depth_in: number, width_in = 24): number {
  const pullAllowance = feature_codes.find((c) => c.startsWith("PULL_ALLOWANCE_"));
  const pullUnitCost  = pullAllowance
    ? parseNum(pullAllowance.replace("PULL_ALLOWANCE_", ""), DEFAULT_PULL_COST)
    : DEFAULT_PULL_COST;
  return (
    hw.hinges        * DEFAULT_HINGE_COST +
    hw.drawer_slides * slideCostForDims(width_in, depth_in) +
    hw.pulls         * pullUnitCost +
    hw.shelf_pins    * DEFAULT_SHELF_PIN_COST
  );
}

// --- BOM calculation ---------------------------------------------------------
// Computes per-cabinet bill of materials for qty=1.
// Call site multiplies by item.qty for totals.

export function calcCabinetBOM(
  type: CabinetType,
  w_in: number,
  h_in: number,
  d_in: number,
  adj_shelves: number,
  profile: ConstructionProfile
): CabinetBOM {
  const mat = profile.mat_thickness_in;   // 0.75"
  const inner_w = w_in - 2 * mat;        // interior width (side-to-side inside)

  // --- Carcass (3/4" body material) ---
  const sides_sf    = 2 * h_in * d_in / 144;
  const bottom_sf   = inner_w * d_in / 144;
  const shelves_sf  = adj_shelves * inner_w * d_in / 144;
  const nailer_sf   = w_in * profile.top_nailer_height_in / 144;
  const carcass_sf  = sides_sf + bottom_sf + shelves_sf + nailer_sf;

  // --- Back panel (1/2" material -- different cost) ---
  // Interior face: H x inner_w (back sits behind the sides)
  const back_sf = h_in * inner_w / 144;

  // --- Edgebanding (front-facing edges only, frameless euro) ---
  // Side front edges (x2) + bottom front + adj shelf fronts + nailer front
  const lf_edge = (2 * h_in + (adj_shelves + 2) * inner_w) / 12;

  // --- Door / drawer front SF (CabDoor buyout) ---
  // Case opening height:
  //   Base:  H - toekick (door covers from toekick top to case top - reveals)
  //   Upper: H - mat (top) - mat (bottom) = H - 2*mat
  //   Tall:  H - toekick (same as base for now -- full pantry door)
  const cat = type.category;
  const is_base_type  = cat === "BASE" || cat === "SINK_BASE" || cat === "APPLIANCE" || cat === "ISLAND";
  const is_upper_type = cat === "UPPER" || cat === "CORNER_UPPER";

  const case_opening_h = is_upper_type
    ? h_in - 2 * mat
    : h_in - profile.toekick_height_in;

  const door_h = Math.max(0,
    case_opening_h - profile.door_reveal_top_in - profile.door_reveal_bottom_in
  );

  // Door width: opening minus side reveals, split by door_count
  // Between-door gap only applies when door_count >= 2
  const side_reveals = 2 * profile.door_reveal_side_in;
  const between_reveals = type.door_count >= 2
    ? (type.door_count - 1) * profile.door_reveal_between_in
    : 0;
  const door_w_total = Math.max(0, w_in - side_reveals - between_reveals);
  const door_w_each  = type.door_count > 0 ? door_w_total / type.door_count : 0;

  const door_sf = type.door_count > 0
    ? door_h * door_w_each * type.door_count / 144
    : 0;

  // Drawer fronts: remaining opening height divided equally among drawer openings
  const total_openings  = type.door_count + type.drawer_count;
  const drawer_h_each   = total_openings > 0 ? case_opening_h / total_openings : 0;
  const drawer_w_each   = Math.max(0, w_in - side_reveals);
  const drawer_front_sf = type.drawer_count > 0
    ? drawer_h_each * drawer_w_each * type.drawer_count / 144
    : 0;

  return { carcass_sf, back_sf, edgeband_lf: lf_edge, door_sf, drawer_front_sf };
}

// --- Per-item cost calculation -----------------------------------------------

export function calcLineItemCost(
  item: EstimateLineItem,
  _settings: EstimateSettings,
  profile?: ConstructionProfile,
  door_price_per_sf?: number
): LineItemCost {
  const prof = profile ?? DEFAULT_PROFILE;
  const doorPrice = door_price_per_sf ?? 0;

  const emptyBOM: CabinetBOM = { carcass_sf: 0, back_sf: 0, edgeband_lf: 0, door_sf: 0, drawer_front_sf: 0 };

  const result: LineItemCost = {
    item_id: item.id,
    hardware: { hinges: 0, drawer_slides: 0, pulls: 0, shelf_pins: 0, false_fronts: 0 },
    depth_in: item.depth_in ?? 24,
    bom: emptyBOM,
    estimated_material: 0,
    estimated_shop_labor_hrs: 0,
    estimated_finish_labor_hrs: 0,
    estimated_install_labor_hrs: 0,
    is_manual: false,
    manual_cost: 0,
  };

  if (item.item_type === "custom" || item.manual_unit_cost != null) {
    result.is_manual   = true;
    result.manual_cost = (item.manual_unit_cost ?? 0) * (item.unit_qty ?? item.qty ?? 1);
    return result;
  }

  if (!item.cabinet_type_code || !item.width_in) return result;
  const type = TYPE_MAP.get(item.cabinet_type_code);
  if (!type) return result;

  const w_in = item.width_in;
  const h_in = item.height_in  ?? (type.category === "UPPER" ? 36 : 34.5);
  const d_in = item.depth_in   ?? (type.category === "UPPER" ? 12 : 24);
  const qty  = item.qty        ?? 1;
  const adj_shelves = item.adj_shelves ?? type.adj_shelves ?? 1;
  const feature_codes: string[] = item.feature_codes
    ? (JSON.parse(item.feature_codes) as string[])
    : [];

  result.depth_in = d_in;
  result.hardware = calcHardwareCounts(type, qty, h_in, adj_shelves, feature_codes);

  // BOM (per unit -- multiply by qty for totals)
  const bom_per_unit = calcCabinetBOM(type, w_in, h_in, d_in, adj_shelves, prof);
  result.bom = {
    carcass_sf:       bom_per_unit.carcass_sf * qty,
    back_sf:          bom_per_unit.back_sf * qty,
    edgeband_lf:      bom_per_unit.edgeband_lf * qty,
    door_sf:          bom_per_unit.door_sf * qty,
    drawer_front_sf:  bom_per_unit.drawer_front_sf * qty,
  };

  // Feature modifiers
  let materialMult = 1.0;
  let laborMult    = 1.0;
  if (feature_codes.includes("FINISHED_INTERIOR")) { materialMult += 0.12; laborMult += 0.20; }
  if (feature_codes.includes("GLASS_DOOR"))        { materialMult += 0.25; laborMult += 0.10; }
  if (feature_codes.includes("GLAZE"))             { materialMult += 0.08; laborMult += 0.30; }
  if (feature_codes.includes("DISTRESS"))          { laborMult    += 0.25; }
  if (feature_codes.includes("LAZY_SUSAN"))        { materialMult += 0.35; laborMult += 0.15; }
  if (feature_codes.includes("FURNITURE_TOE"))     { materialMult += 0.10; laborMult += 0.12; }
  if (feature_codes.includes("CROWN_MOLDING"))     { materialMult += 0.08; laborMult += 0.10; }
  const rollout_count = feature_codes.filter((c) => c === "ROLLOUT_SHELF").length;
  if (rollout_count > 0) { materialMult += rollout_count * 0.08; laborMult += rollout_count * 0.15; }

  // Material cost from BOM
  const carcass_cost     = result.bom.carcass_sf * DEFAULT_CARCASS_COST_PER_SF * materialMult;
  const back_cost        = result.bom.back_sf    * prof.back_mat_cost_per_sf;
  const door_buyout_cost = result.bom.door_sf    * doorPrice;
  const drawer_buyout_cost = result.bom.drawer_front_sf * doorPrice;
  result.estimated_material = carcass_cost + back_cost + door_buyout_cost + drawer_buyout_cost;

  // End panel
  if (item.end_panel) {
    const panel_sf = (h_in / 12) * 0.75;
    result.estimated_material      += END_PANEL_COST_PER_SF * panel_sf * qty;
    result.estimated_shop_labor_hrs += 0.25 * qty;
  }

  // Shop labor -- operation times from cabinet_labor.csv
  const shop_hrs_per_unit =
    LABOR.fab_per_sqft    * bom_per_unit.carcass_sf +
    LABOR.fab_per_lf_edge * bom_per_unit.edgeband_lf +
    LABOR.fab_per_cab +
    LABOR.fab_per_drawer  * type.drawer_count +
    LABOR.fab_per_door    * type.door_count;
  result.estimated_shop_labor_hrs += shop_hrs_per_unit * laborMult * qty;

  // Finish labor -- default: stain
  const fin_hrs_per_unit =
    LABOR.fin_carcass_stain +
    LABOR.fin_door_stain * (type.door_count + type.drawer_count);
  result.estimated_finish_labor_hrs = fin_hrs_per_unit * laborMult * qty;

  // Install labor -- by category
  const cat = type.category;
  let inst_hrs_per_unit =
    (cat === "UPPER" || cat === "CORNER_UPPER") ? LABOR.inst_upper :
    (cat === "TALL"  || cat === "PANTRY")       ? LABOR.inst_tall  :
    LABOR.inst_base;

  if (cat === "BASE" || cat === "SINK_BASE" || cat === "APPLIANCE") {
    inst_hrs_per_unit += LABOR.inst_toekick_per_lf * (w_in / 12);
  }
  inst_hrs_per_unit += LABOR.inst_per_pull * result.hardware.pulls / Math.max(qty, 1);
  result.estimated_install_labor_hrs = inst_hrs_per_unit * qty;

  return result;
}

// --- Room cost roll-up -------------------------------------------------------

export function calcRoomCost(
  room: EstimateRoom,
  settings: EstimateSettings,
  includeInstall: boolean,
  profile?: ConstructionProfile,
  door_price_per_sf?: number
): RoomCost {
  const lineItems = room.items.map((item) =>
    calcLineItemCost(item, settings, profile, door_price_per_sf)
  );

  let totalHardware = 0, totalMaterial = 0, totalShopLabor = 0;
  let totalFinishLabor = 0, totalInstall = 0, totalManual = 0;
  let bomCarcass = 0, bomBack = 0, bomEdge = 0, bomDoor = 0, bomDrawerFront = 0;

  for (let i = 0; i < lineItems.length; i++) {
    const li = lineItems[i];
    const item = room.items[i];
    const fc: string[] = item.feature_codes ? JSON.parse(item.feature_codes) : [];

    if (li.is_manual) {
      totalManual += li.manual_cost;
    } else {
      totalHardware    += calcHardwareCost(li.hardware, fc, li.depth_in, item.width_in ?? 24);
      totalMaterial    += li.estimated_material;
      totalShopLabor   += li.estimated_shop_labor_hrs   * settings.shop_rate;
      totalFinishLabor += li.estimated_finish_labor_hrs * settings.finish_rate;
      if (includeInstall) totalInstall += li.estimated_install_labor_hrs * settings.install_rate;
      bomCarcass     += li.bom.carcass_sf;
      bomBack        += li.bom.back_sf;
      bomEdge        += li.bom.edgeband_lf;
      bomDoor        += li.bom.door_sf;
      bomDrawerFront += li.bom.drawer_front_sf;
    }
  }

  const subtotal = totalHardware + totalMaterial + totalShopLabor +
    totalFinishLabor + totalInstall + totalManual;

  return {
    room_id: room.id, room_name: room.name, line_items: lineItems,
    total_carcass_sf:      bomCarcass,
    total_back_sf:         bomBack,
    total_edgeband_lf:     bomEdge,
    total_door_sf:         bomDoor,
    total_drawer_front_sf: bomDrawerFront,
    total_hardware_cost:      totalHardware,
    total_material_cost:      totalMaterial,
    total_shop_labor_cost:    totalShopLabor,
    total_finish_labor_cost:  totalFinishLabor,
    total_install_labor_cost: totalInstall,
    subtotal,
  };
}

// --- Full estimate cost summary ----------------------------------------------

export function calcEstimateCost(params: {
  rooms: EstimateRoom[];
  settings: EstimateSettings;
  scope: string;
  finish_group_count: number;
  delivery_cost: number;
  tax_amount: number;
  target_margin_pct: number;
  profile_id?: string | null;
  door_preset_id?: string | null;
}): CostSummary {
  const { rooms, settings, scope, finish_group_count, delivery_cost,
          tax_amount, target_margin_pct, profile_id, door_preset_id } = params;

  const profile        = getConstructionProfile(profile_id);
  const door_price_sf  = door_preset_id ? getCabdoorPricePerSqft(door_preset_id) : CATALOG_DOOR_PRICE_PER_SF;
  const includeInstall = scope === "supply_install";

  const roomCosts = rooms.map((r) =>
    calcRoomCost(r, settings, includeInstall, profile, door_price_sf)
  );

  let totalMaterial = 0, totalHardware = 0, totalShopLabor = 0;
  let totalFinishLabor = 0, totalInstall = 0;
  let hasManual = false, hasVeryHigh = false;
  let bomCarcass = 0, bomBack = 0, bomEdge = 0, bomDoor = 0, bomDrawerFront = 0;

  for (const rc of roomCosts) {
    totalMaterial    += rc.total_material_cost;
    totalHardware    += rc.total_hardware_cost;
    totalShopLabor   += rc.total_shop_labor_cost;
    totalFinishLabor += rc.total_finish_labor_cost;
    totalInstall     += rc.total_install_labor_cost;
    bomCarcass     += rc.total_carcass_sf;
    bomBack        += rc.total_back_sf;
    bomEdge        += rc.total_edgeband_lf;
    bomDoor        += rc.total_door_sf;
    bomDrawerFront += rc.total_drawer_front_sf;
    if (rc.line_items.some((li) => li.is_manual)) hasManual = true;
  }

  for (const room of rooms) {
    for (const item of room.items) {
      if (item.cabinet_type_code) {
        const t = TYPE_MAP.get(item.cabinet_type_code);
        if (t?.complexity === "very_high" || t?.complexity === "manual") hasVeryHigh = true;
      }
    }
  }

  const directCostTotal = totalMaterial + totalHardware + totalShopLabor +
    totalFinishLabor + totalInstall + delivery_cost;

  const pmHours         = settings.pm_hrs_base + settings.pm_hrs_per_fg * finish_group_count;
  const engHours        = settings.eng_hrs_base + settings.eng_hrs_per_fg * finish_group_count;
  const purchasingHours = settings.purchasing_hrs_base;
  const peopleOverheadCost =
    pmHours * settings.pm_rate + engHours * settings.eng_rate +
    purchasingHours * settings.pm_rate;

  const fixedOverheadCost = directCostTotal * (settings.fixed_overhead_pct / 100);
  const totalCost = directCostTotal + peopleOverheadCost + fixedOverheadCost;

  const marginDecimal = Math.min(Math.max(target_margin_pct, 0), 99) / 100;
  const sellPrice = marginDecimal < 1 ? totalCost / (1 - marginDecimal) : totalCost * 2;

  return {
    rooms: roomCosts,
    bom_carcass_sf:       bomCarcass,
    bom_back_sf:          bomBack,
    bom_edgeband_lf:      bomEdge,
    bom_door_sf:          bomDoor,
    bom_drawer_front_sf:  bomDrawerFront,
    total_material:       totalMaterial,
    total_hardware:       totalHardware,
    total_shop_labor:     totalShopLabor,
    total_finish_labor:   totalFinishLabor,
    total_install_labor:  totalInstall,
    total_delivery:       delivery_cost,
    direct_cost_total:    directCostTotal,
    pm_hours: pmHours, eng_hours: engHours, purchasing_hours: purchasingHours,
    people_overhead_cost: peopleOverheadCost,
    fixed_overhead_cost:  fixedOverheadCost,
    total_cost:           totalCost,
    target_margin_pct,
    sell_price:           sellPrice,
    tax_amount,
    sell_price_with_tax:  sellPrice + tax_amount,
    has_manual_items:     hasManual,
    has_very_high_complexity: hasVeryHigh,
  };
}

// =============================================================================
// BOM REPORT — sheet counts, hardware hard counts, door cut list
// =============================================================================

/** A single door or drawer-front cut for a CabDoor order */
export type DoorCut = {
  label: string;       // e.g. "Kitchen - Base 2-Door 36W"
  door_count: number;  // number of doors in this cut (1 or 2)
  w_in: number;        // door width (each door)
  h_in: number;        // door height
};

/** Full BOM ready for purchasing — sheet counts, hardware, edgebanding, doors */
export type BOMReport = {
  // ── Sheet goods ──────────────────────────────────────────────────────────
  carcass_sf: number;
  carcass_sheets: number;      // ceil with waste
  back_sf: number;
  back_sheets: number;         // ceil with waste
  // ── Edgebanding ──────────────────────────────────────────────────────────
  edgeband_lf: number;
  // ── Hardware counts ───────────────────────────────────────────────────────
  hinges: number;
  slides_15in: number;         // drawer slides per depth tier
  slides_18in: number;
  slides_21in: number;
  pulls: number;
  shelf_pins: number;
  // ── Doors for CabDoor ────────────────────────────────────────────────────
  door_cuts: DoorCut[];        // one entry per unique line item
  door_sf_total: number;
  drawer_front_sf: number;
};

// Sheet goods constants — update via construction_profiles.csv in future
const SHEET_SF       = 32;    // 4x8 sheet nominal SF
const CARCASS_WASTE  = 0.12;  // 12% waste factor for carcass (mel or ply)
const BACK_WASTE     = 0.10;  // 10% waste for back panel

/**
 * Build a full purchasing BOM from a completed CostSummary + the original
 * line items (needed to recover per-item depth and door dimensions).
 *
 * Call AFTER calcEstimateCost() — pass cost.rooms and the raw item list.
 */
export function calcBOMReport(
  cost: CostSummary,
  allItems: EstimateLineItem[],
  profile?: ConstructionProfile
): BOMReport {
  const prof = profile ?? DEFAULT_PROFILE;

  // Build a map from item id -> LineItemCost for quick lookup
  const lcMap = new Map<string, LineItemCost>();
  for (const rc of cost.rooms) {
    for (const lc of rc.line_items) lcMap.set(lc.item_id, lc);
  }

  let hinges = 0, pulls = 0, shelfPins = 0;
  let slides15 = 0, slides18 = 0, slides21 = 0;
  const doorCuts: DoorCut[] = [];

  for (const rc of cost.rooms) {
    for (const lc of rc.line_items) {
      if (lc.is_manual) continue;

      // Hardware
      hinges    += lc.hardware.hinges;
      pulls     += lc.hardware.pulls;
      shelfPins += lc.hardware.shelf_pins;

      // Slides split by depth
      const depth = lc.depth_in;
      const slides = lc.hardware.drawer_slides;
      if (depth <= 12)      slides15 += slides;
      else if (depth <= 18) slides18 += slides;
      else                  slides21 += slides;

      // Door cuts — recover per-door dims
      const item = allItems.find((i) => i.id === lc.item_id);
      const type = item?.cabinet_type_code ? TYPE_MAP.get(item.cabinet_type_code) : null;
      if (item && type && type.door_count > 0) {
        const w_in  = item.width_in  ?? 24;
        const h_in  = item.height_in ?? (type.category === "UPPER" ? 36 : 34.5);
        const qty   = item.qty ?? 1;

        const is_upper = type.category === "UPPER" || type.category === "CORNER_UPPER";
        const mat = prof.mat_thickness_in;
        const case_opening_h = is_upper
          ? h_in - 2 * mat
          : h_in - prof.toekick_height_in;
        const door_h = Math.max(0,
          case_opening_h - prof.door_reveal_top_in - prof.door_reveal_bottom_in
        );
        const side_rev    = 2 * prof.door_reveal_side_in;
        const between_rev = type.door_count >= 2
          ? (type.door_count - 1) * prof.door_reveal_between_in : 0;
        const door_w = Math.max(0,
          (w_in - side_rev - between_rev) / type.door_count
        );

        const roomName = cost.rooms.find((r) =>
          r.line_items.includes(lc)
        )?.room_name ?? "";
        const label = `${roomName} — ${type.display_name} ${w_in}"W`;

        // Each qty is a separate cut entry (same dims, easier for CabDoor list)
        for (let q = 0; q < qty; q++) {
          doorCuts.push({
            label,
            door_count: type.door_count,
            w_in: Math.round(door_w * 100) / 100,
            h_in: Math.round(door_h * 100) / 100,
          });
        }
      }
    }
  }

  // Sheet counts — ceiling after waste
  const carcass_sf = cost.bom_carcass_sf;
  const back_sf    = cost.bom_back_sf;
  const carcass_sheets = Math.ceil(carcass_sf * (1 + CARCASS_WASTE) / SHEET_SF);
  const back_sheets    = Math.ceil(back_sf    * (1 + BACK_WASTE)    / SHEET_SF);

  return {
    carcass_sf, carcass_sheets,
    back_sf, back_sheets,
    edgeband_lf:  cost.bom_edgeband_lf,
    hinges, pulls, shelf_pins: shelfPins,
    slides_15in: slides15, slides_18in: slides18, slides_21in: slides21,
    door_cuts: doorCuts,
    door_sf_total: cost.bom_door_sf,
    drawer_front_sf: cost.bom_drawer_front_sf,
  };
}
