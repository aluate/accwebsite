/**
 * Excel render of a residential spec into the Artifex template.
 *
 * Cell map (per data/templates/README.md analysis):
 *
 *   Sheet 1 — "Spec Sheet"
 *     B1=PM label, D1=PM value, B2=Engineer label, D2=Engineer value
 *     B3=JOB# label, D3=JOB# value, H1=NOTES label, J1+=notes content
 *     A4=MATERIAL SCHEDULE label
 *     B5=Cabinet Exterior value, F5=ext loc/notes
 *     B6=Cabinet Interior value, F6=int loc/notes
 *     B7=Cab Exterior 2 value (FG2), F7=ext loc/notes
 *     B8=Cab Interior 2 value (FG2), F8=int loc/notes
 *     A9=DOOR SCHEDULE label
 *     B10..L10=column headers (Style, Material, OE, IE, Stile, Rail, Vendor)
 *     B11..L15=row data (Base/Upper/AppliedEnds/SlabDF/5pcDF — only relevant rows fill)
 *     A19=DRAWER SCHEDULE label
 *     B20..F20=headers (Style, Material, Vendor)
 *     B21..F22=rows (Drawer Box, Rollout)
 *     A23=EDGEBAND SCHEDULE 1 label, H23=EDGEBAND SCHEDULE 2 label
 *     A24..F30=ed1 rows; H24..M30=ed2 rows
 *
 *   Sheet 2 — "Spec Sheet Continued"
 *     A1=FINISH SCHEDULE 1 label, H1=FINISH SCHEDULE 2 label
 *     B2..G6=fg1 finish details (Stain/Paint/Glaze/Finish/Sheen rows)
 *     I2..N6=fg2 finish details
 *     A10=HARDWARE SCHEDULE label
 *     B11..G20=Hardware rows (Hinge, Drawer Guides, Pulls, etc.)
 *     A26=COUNTERTOPS section (left blank for now — separate quote)
 *
 * Where there are >2 finish groups, the third+ get an appended note in NOTES
 * area pointing to the spec PDF for full detail. Karl said the template needs
 * to "still be 10-year-old-easy" — we err on under-filling not over-filling.
 */

import type { SpecPDFData } from "@/lib/pdf-spec";

// 2026-05-06: SpecPDFData shape changed substantially with the spec form
// expansion v2 (cover sheet redesign). The Excel export was a stopgap built
// against the old flat shape (color_name / door_style_name / pull_name on the
// finish group itself) and needs a full rewrite against the new nested shape
// (.finish, .materials, .door_fronts, .drawers, .edgebands, .hardware,
// .countertops). Karl said the Excel export will need a fresh template drop
// anyway, so this stub returns a clean error while we wait.
//
// To rebuild: see git history pre-2026-05-06 for the cell-map approach, then
// re-target against the new SpecPDFData shape and Karl's new xlsx template
// (data/templates/spec-template.xlsx will need to match the RESIDENTIAL COVER
// SHEET layout).
export async function renderSpecXLSX(_data: SpecPDFData): Promise<Buffer> {
  throw new Error(
    "Excel export not yet rebuilt for spec form v2. The xlsx template + cell map " +
    "needs a fresh pass against the new RESIDENTIAL COVER SHEET layout. Use the " +
    "PDF generator (Generate Spec PDF) for now."
  );
}
