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

export const ACC_STANDARD_HINGE = "HH-BLU-110";
export const ACC_STANDARD_DRAWER_SLIDE = "HDS-BLU-001";
export const ACC_STANDARD_ROLLOUT_SLIDE = "HRS-KV-001";

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
