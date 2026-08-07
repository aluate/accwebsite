/**
 * ACC shop standards — the hardware we use unless a client specifically asks for
 * something else.
 *
 * Why this file exists:
 *
 * Three of the five fields validateForRelease() (lib/lifecycle.ts) requires were
 * populated by exactly one code path: the Schedules tab. That tab is imported
 * nowhere, so `finish_group_hardware` had ZERO rows in production and no spec
 * could reach RELEASED_TO_ENG. The release gate was asking for information the
 * app never gave anyone a place to enter.
 *
 * Two of those three are not per-job decisions at all. Hinges and drawer slides
 * are shop standards — undermount soft-close on drawers, ball-bearing side-mount
 * on pullouts, 110-degree soft-close on doors. Asking a PM to pick them on every
 * finish group is data entry with one right answer, which is how fields end up
 * blank.
 *
 * So they get seeded. A seeded value is NOT a silent default: it is a stated one.
 * It appears on the Spec Details sheet the client signs, and changing it is a
 * deliberate override that should carry a note explaining why.
 *
 * Ids reference data/catalogs/hardware_hinges.csv, hardware_drawer_slides.csv and
 * hardware_rollout_slides.csv. If those ids change, this file must change with
 * them — nothing enforces the reference.
 */

// ── Two catalogs, two id namespaces. Do not mix them. ────────────────────────
//
// There are two parallel slide catalogs in data/catalogs, and which one applies
// depends on the COLUMN, not the concept:
//
//   finish_group_hardware.hardware_id  -> hardware_drawer_slides.csv  (HDS-*)
//                                         hardware_rollout_slides.csv (HRS-*)
//   finish_group_drawers.slides_id     -> drawer_slides.csv           (DS-*)
//
// Both the Schedules panel (components/SpecSchedulesPanel.tsx:603) and the work
// order PDF (lib/spec-data.ts:197) resolve slides_id against drawer_slides.csv.
// Put an HDS-* id in that column and the lookup misses, the code falls back to
// printing the raw id, and a shop-facing document says "HDS-BLU-001" where a
// slide name belongs. That happened — see the repair pass in seedDrawerRow.

/** finish_group_hardware, role='hinges' */
export const ACC_STANDARD_HINGE = "HH-BLU-110";
/** finish_group_hardware, role='drawer_slides' */
export const ACC_STANDARD_DRAWER_SLIDE = "HDS-BLU-001";
/** finish_group_hardware, role='rollout_slides' */
export const ACC_STANDARD_ROLLOUT_SLIDE = "HRS-KV-001";

// drawer_slides.csv had no length-agnostic entry and no side-mount ball-bearing
// entry at all — only per-length SKUs (563H3810B for 15in, 4570B for 18in,
// 5330B for 21in). A spec-level default has no business choosing a slide length;
// that follows cabinet depth and is the shop's call. So these two abstract
// entries were added to the catalog: they name WHAT the slide is and leave the
// SKU to be resolved downstream.

/** finish_group_drawers.slides_id, role='drawer_box' */
export const ACC_STANDARD_DRAWER_SLIDE_SPEC = "DS-ACC-STD";
/** finish_group_drawers.slides_id, role='rollout' */
export const ACC_STANDARD_ROLLOUT_SLIDE_SPEC = "DS-ACC-RO";

/**
 * Ids that were written into finish_group_drawers.slides_id by mistake and must
 * be corrected rather than preserved. Anything from the hardware namespace is
 * wrong in that column by definition, so the prefix test is the whole rule —
 * no list of specific bad ids to keep in sync.
 */
export function isWrongNamespaceSlideId(id: string | null): boolean {
  return !!id && (id.startsWith("HDS-") || id.startsWith("HRS-"));
}

export type AccHardwareStandard = {
  role: string;
  hardware_id: string;
  sort_order: number;
  /** Shown on the Spec Details sheet, so the client sees what they are getting. */
  label: string;
  /**
   * false = only seed when the finish group actually has this feature. Rollouts
   * are not on every job, and inventing a rollout line on a job with no rollouts
   * would put a phantom item on the work order.
   */
  always: boolean;
};

export const ACC_HARDWARE_STANDARDS: AccHardwareStandard[] = [
  {
    role: "hinges",
    hardware_id: ACC_STANDARD_HINGE,
    sort_order: 0,
    label: "Blum 110° CLIP top Blumotion, soft-close, full overlay",
    always: true,
  },
  {
    role: "drawer_slides",
    hardware_id: ACC_STANDARD_DRAWER_SLIDE,
    sort_order: 1,
    label: "Blum Tandem Plus Blumotion, undermount soft-close",
    always: true,
  },
  {
    role: "rollout_slides",
    hardware_id: ACC_STANDARD_ROLLOUT_SLIDE,
    sort_order: 2,
    label: "Knape & Vogt 3132 full-extension, side-mount ball-bearing",
    always: false,
  },
];

/**
 * Display labels for finish_group_hardware.role.
 *
 * Kept here rather than in components/SpecSchedulesPanel.tsx (where an identical
 * list already lived) so the Schedules form, the spec builder and the work order
 * PDF cannot drift apart on what to call a role. This module has no imports, so
 * server and client code can both read it.
 */
export const HARDWARE_ROLE_LABEL: Record<string, string> = {
  hinges:         "Hinges",
  drawer_slides:  "Drawer Slides",
  door_pulls:     "Door Pulls",
  drawer_pulls:   "Drawer Pulls",
  rollout_slides: "Rollout Slides",
  closet_rod:     "Closet Rod",
  trash_pullout:  "Trash Pullout",
  base_pullout:   "Base Pullout",
  blind_corner:   "Blind Corner",
  shelf_clips:    "Shelf Clips",
  misc:           "Misc.",
};
