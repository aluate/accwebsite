/**
 * Trim takeoff calculation engine.
 * Ported from residential-repo systems/trim/trim_rules.py + trim_bf_calculator.py.
 *
 * Corrections vs. legacy:
 *  - Base deducts 2 lf per door opening (all types)
 *  - Crown and Shoe are distinct categories (not mapped to Header/Base)
 *  - Chair rail, stair nosing, wainscoting cap added as first-class categories
 */

export type TrimStyle  = "craftsman" | "craftsman_plus" | "mitered";
export type SpecLevel  = "economy" | "standard" | "premium";
type ThickCat          = "4/4" | "5/4" | "6/4" | "8/4";

type Dim    = { width: number; thickness: number };
type DimSet = Record<SpecLevel, Dim>;

// Profile dimensions (width × finished thickness in inches) by style → category → spec level
// From config/sample/trim_dimensions.csv + reasonable values for new categories
const DIMS: Record<TrimStyle, Record<string, DimSet>> = {
  craftsman: {
    base:            { economy: { width: 4.5,  thickness: 0.75 }, standard: { width: 5.25, thickness: 0.75 }, premium: { width: 5.5,  thickness: 0.75 } },
    casing:          { economy: { width: 3.5,  thickness: 0.5  }, standard: { width: 4,    thickness: 0.5  }, premium: { width: 4.5,  thickness: 0.5  } },
    headers:         { economy: { width: 4,    thickness: 0.75 }, standard: { width: 5,    thickness: 0.75 }, premium: { width: 5.5,  thickness: 0.75 } },
    sill:            { economy: { width: 5,    thickness: 0.75 }, standard: { width: 6,    thickness: 0.75 }, premium: { width: 6.5,  thickness: 0.75 } },
    apron:           { economy: { width: 4,    thickness: 0.5  }, standard: { width: 4.5,  thickness: 0.5  }, premium: { width: 5,    thickness: 0.5  } },
    int_jamb:        { economy: { width: 4,    thickness: 0.75 }, standard: { width: 4.5,  thickness: 0.75 }, premium: { width: 5,    thickness: 0.75 } },
    ext_jamb:        { economy: { width: 4,    thickness: 0.75 }, standard: { width: 4.5,  thickness: 0.75 }, premium: { width: 5,    thickness: 0.75 } },
    crown:           { economy: { width: 2.5,  thickness: 0.75 }, standard: { width: 3.5,  thickness: 0.75 }, premium: { width: 4.5,  thickness: 0.75 } },
    shoe:            { economy: { width: 1.5,  thickness: 0.5  }, standard: { width: 1.75, thickness: 0.5  }, premium: { width: 2,    thickness: 0.5  } },
    chair_rail:      { economy: { width: 2.5,  thickness: 0.75 }, standard: { width: 3,    thickness: 0.75 }, premium: { width: 3.5,  thickness: 0.75 } },
    stair_nosing:    { economy: { width: 3.5,  thickness: 1.0  }, standard: { width: 3.5,  thickness: 1.0  }, premium: { width: 3.5,  thickness: 1.0  } },
    wainscoting_cap: { economy: { width: 2.5,  thickness: 0.5  }, standard: { width: 3,    thickness: 0.5  }, premium: { width: 3.5,  thickness: 0.5  } },
  },
  craftsman_plus: {
    base:            { economy: { width: 5,    thickness: 0.75 }, standard: { width: 5.5,  thickness: 0.75 }, premium: { width: 6,    thickness: 0.75 } },
    casing:          { economy: { width: 4,    thickness: 0.5  }, standard: { width: 4.5,  thickness: 0.5  }, premium: { width: 5,    thickness: 0.5  } },
    headers:         { economy: { width: 5,    thickness: 0.75 }, standard: { width: 5.5,  thickness: 0.75 }, premium: { width: 6,    thickness: 0.75 } },
    sill:            { economy: { width: 6,    thickness: 0.75 }, standard: { width: 6.5,  thickness: 0.75 }, premium: { width: 7,    thickness: 0.75 } },
    apron:           { economy: { width: 4.5,  thickness: 0.5  }, standard: { width: 5,    thickness: 0.5  }, premium: { width: 5.5,  thickness: 0.5  } },
    int_jamb:        { economy: { width: 4.5,  thickness: 0.75 }, standard: { width: 5,    thickness: 0.75 }, premium: { width: 5.5,  thickness: 0.75 } },
    ext_jamb:        { economy: { width: 4.5,  thickness: 0.75 }, standard: { width: 5,    thickness: 0.75 }, premium: { width: 5.5,  thickness: 0.75 } },
    crown:           { economy: { width: 3,    thickness: 0.75 }, standard: { width: 4,    thickness: 0.75 }, premium: { width: 5,    thickness: 0.75 } },
    shoe:            { economy: { width: 1.5,  thickness: 0.5  }, standard: { width: 1.75, thickness: 0.5  }, premium: { width: 2,    thickness: 0.5  } },
    chair_rail:      { economy: { width: 3,    thickness: 0.75 }, standard: { width: 3.5,  thickness: 0.75 }, premium: { width: 4,    thickness: 0.75 } },
    stair_nosing:    { economy: { width: 3.5,  thickness: 1.0  }, standard: { width: 3.5,  thickness: 1.0  }, premium: { width: 4,    thickness: 1.0  } },
    wainscoting_cap: { economy: { width: 3,    thickness: 0.5  }, standard: { width: 3.5,  thickness: 0.5  }, premium: { width: 4,    thickness: 0.5  } },
  },
  mitered: {
    base:            { economy: { width: 4.5,  thickness: 0.75 }, standard: { width: 5,    thickness: 0.75 }, premium: { width: 5.5,  thickness: 0.75 } },
    casing:          { economy: { width: 3.5,  thickness: 0.5  }, standard: { width: 4,    thickness: 0.5  }, premium: { width: 4.5,  thickness: 0.5  } },
    headers:         { economy: { width: 4,    thickness: 0.75 }, standard: { width: 5,    thickness: 0.75 }, premium: { width: 5.5,  thickness: 0.75 } },
    sill:            { economy: { width: 5,    thickness: 0.75 }, standard: { width: 6,    thickness: 0.75 }, premium: { width: 6.5,  thickness: 0.75 } },
    apron:           { economy: { width: 4,    thickness: 0.5  }, standard: { width: 4.5,  thickness: 0.5  }, premium: { width: 5,    thickness: 0.5  } },
    int_jamb:        { economy: { width: 4,    thickness: 0.75 }, standard: { width: 4.5,  thickness: 0.75 }, premium: { width: 5,    thickness: 0.75 } },
    ext_jamb:        { economy: { width: 4,    thickness: 0.75 }, standard: { width: 4.5,  thickness: 0.75 }, premium: { width: 5,    thickness: 0.75 } },
    crown:           { economy: { width: 2.5,  thickness: 0.75 }, standard: { width: 3.5,  thickness: 0.75 }, premium: { width: 4.5,  thickness: 0.75 } },
    shoe:            { economy: { width: 1.5,  thickness: 0.5  }, standard: { width: 1.75, thickness: 0.5  }, premium: { width: 2,    thickness: 0.5  } },
    chair_rail:      { economy: { width: 2.5,  thickness: 0.75 }, standard: { width: 3,    thickness: 0.75 }, premium: { width: 3.5,  thickness: 0.75 } },
    stair_nosing:    { economy: { width: 3.5,  thickness: 1.0  }, standard: { width: 3.5,  thickness: 1.0  }, premium: { width: 3.5,  thickness: 1.0  } },
    wainscoting_cap: { economy: { width: 2.5,  thickness: 0.5  }, standard: { width: 3,    thickness: 0.5  }, premium: { width: 3.5,  thickness: 0.5  } },
  },
};

// AWI waste factors: waste % by rip size (inches) and nominal thickness category
const AWI_WASTE: Array<Record<string, number>> = [
  { rip: 1.5,  "4/4": 0.08, "5/4": 0.09, "6/4": 0.10, "8/4": 0.11 },
  { rip: 2.0,  "4/4": 0.09, "5/4": 0.10, "6/4": 0.11, "8/4": 0.12 },
  { rip: 2.5,  "4/4": 0.09, "5/4": 0.10, "6/4": 0.11, "8/4": 0.12 },
  { rip: 3.0,  "4/4": 0.10, "5/4": 0.11, "6/4": 0.12, "8/4": 0.13 },
  { rip: 3.5,  "4/4": 0.10, "5/4": 0.11, "6/4": 0.12, "8/4": 0.13 },
  { rip: 4.0,  "4/4": 0.10, "5/4": 0.11, "6/4": 0.12, "8/4": 0.13 },
  { rip: 4.5,  "4/4": 0.11, "5/4": 0.12, "6/4": 0.13, "8/4": 0.14 },
  { rip: 5.0,  "4/4": 0.11, "5/4": 0.12, "6/4": 0.13, "8/4": 0.14 },
  { rip: 5.5,  "4/4": 0.12, "5/4": 0.13, "6/4": 0.14, "8/4": 0.15 },
  { rip: 6.0,  "4/4": 0.12, "5/4": 0.13, "6/4": 0.14, "8/4": 0.15 },
  { rip: 6.5,  "4/4": 0.13, "5/4": 0.14, "6/4": 0.15, "8/4": 0.16 },
  { rip: 7.0,  "4/4": 0.13, "5/4": 0.14, "6/4": 0.15, "8/4": 0.16 },
];

const DOOR_H: Record<string, number> = { "6/8": 6.67, "7/0": 7.0, "8/0": 8.0 };

function nominalThick(fin: number): { nominal: number; cat: ThickCat } {
  if (fin <= 0.75) return { nominal: 1.0,  cat: "4/4" };
  if (fin <= 1.0)  return { nominal: 1.25, cat: "5/4" };
  if (fin <= 1.25) return { nominal: 1.5,  cat: "6/4" };
  return               { nominal: 2.0,  cat: "8/4" };
}

function getWaste(widthIn: number, cat: ThickCat): number {
  const r = Math.round(widthIn * 2) / 2;
  let best = AWI_WASTE[AWI_WASTE.length - 1];
  let bestDiff = Infinity;
  for (const row of AWI_WASTE) {
    const d = Math.abs((row.rip as number) - r);
    if (d < bestDiff) { bestDiff = d; best = row; }
  }
  return (best[cat] as number) ?? 0.10;
}

export interface TrimInputs {
  door_height:       string;
  trim_style:        TrimStyle;
  spec_level:        SpecLevel;
  drywall_int_jambs: boolean;
  full_drywall_wrap: boolean;
  base_lf:           number;
  crown_lf:          number;
  shoe_lf:           number;
  chair_rail_lf:     number;
  stair_nosing_lf:   number;
  wainscoting_cap_lf:number;
  case_openings:     number;
  window_openings:   number;
  pocket_doors:      number;
  barn_or_wrapped:   number;
  sliders:           number;
}

export interface TrimRow {
  key:          string;
  label:        string;
  lf:           number;
  width_in:     number;
  thickness_in: number;
  bf_raw:       number;
  bf_ordered:   number;
  waste_pct:    number;
}

export interface TrimResult {
  rows:      TrimRow[];
  total_lf:  number;
  total_bf:  number;
}

const LABELS: Record<string, string> = {
  base:            "Base",
  shoe:            "Shoe",
  crown:           "Crown",
  chair_rail:      "Chair Rail",
  wainscoting_cap: "Wainscoting Cap",
  stair_nosing:    "Stair Nosing",
  casing:          "Casing — legs",
  headers:         "Header — top casing",
  sill:            "Window Sill",
  apron:           "Window Apron",
  int_jamb:        "Interior Jamb",
  ext_jamb:        "Window Jamb",
};

const CAT_ORDER = [
  "base", "shoe", "crown", "chair_rail", "wainscoting_cap", "stair_nosing",
  "casing", "headers", "sill", "apron", "int_jamb", "ext_jamb",
];

function r1(n: number) { return Math.round(n * 10) / 10; }

export function calculateTrim(inp: TrimInputs): TrimResult {
  const H = Math.ceil(DOOR_H[inp.door_height] ?? 7.0);

  // Split case_openings 70% interior / 30% exterior (Excel parity)
  const ext = Math.round(inp.case_openings * 0.3);
  const int_ = inp.case_openings - ext;

  const allDoors = inp.case_openings + inp.pocket_doors + inp.barn_or_wrapped + inp.sliders;

  const lfs: Record<string, number> = {
    // Running trim — user-entered LF (base deducts 2 lf per door opening)
    base:            Math.max(0, inp.base_lf - 2 * allDoors),
    shoe:            inp.shoe_lf,
    crown:           inp.crown_lf,
    chair_rail:      inp.chair_rail_lf,
    stair_nosing:    inp.stair_nosing_lf,
    wainscoting_cap: inp.wainscoting_cap_lf,

    // Opening-derived — calculated from counts
    casing: inp.full_drywall_wrap ? 0 :
      2*ext*H + 4*int_*H + 2*H*(inp.pocket_doors + inp.barn_or_wrapped + inp.window_openings),

    headers: (H/2)*(ext + 2*int_) +
      inp.sliders + inp.window_openings + 2*(inp.pocket_doors + inp.barn_or_wrapped),

    int_jamb: inp.drywall_int_jambs ? 0 : H*(inp.pocket_doors + inp.barn_or_wrapped),

    ext_jamb: inp.full_drywall_wrap ? 0 :
      2*H*inp.window_openings + 3*H*inp.sliders,
  };

  // Sill and apron = headers LF (Excel parity)
  lfs.sill  = lfs.headers;
  lfs.apron = lfs.headers;

  const styleDims = DIMS[inp.trim_style];
  const rows: TrimRow[] = [];

  for (const key of CAT_ORDER) {
    const lf = lfs[key] ?? 0;
    if (lf <= 0) continue;
    const d = styleDims[key]?.[inp.spec_level] ?? { width: 3.5, thickness: 0.75 };
    const { nominal, cat } = nominalThick(d.thickness);
    const bf_raw = (nominal * d.width * lf) / 12;
    const wf = getWaste(d.width, cat);
    rows.push({
      key,
      label:        LABELS[key] ?? key,
      lf:           r1(lf),
      width_in:     d.width,
      thickness_in: d.thickness,
      bf_raw:       r1(bf_raw),
      bf_ordered:   r1(bf_raw * (1 + wf)),
      waste_pct:    Math.round(wf * 100),
    });
  }

  return {
    rows,
    total_lf: r1(rows.reduce((n, r) => n + r.lf, 0)),
    total_bf: r1(rows.reduce((n, r) => n + r.bf_ordered, 0)),
  };
}
