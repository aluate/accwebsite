# Spec output templates

Two source files Karl confirmed on 2026-05-04:

| File | Source | Purpose |
|---|---|---|
| `spec-template.xlsx` | `EXAMPLE DRAWINGS/Artifex Spec Sheet.xlsx` | Excel spec sheet — Phase 2-Excel renders into a copy of this, preserving layout/formatting |
| `title-block-source.pdf` | `EXAMPLE DRAWINGS/Premier- Lot 4 25.12.5 REDLINES.pdf` | CV cover sheet — title block we want to match on every spec output |

## Excel template structure (Artifex Spec Sheet)

Two sheets, A4 landscape, 14 columns wide (A–N), ~34 rows tall.

**Page 1 — "Spec Sheet"**
- Header: PM (B1/D1), Engineer (B2/D2), JOB# (B3), NOTES (H1)
- MATERIAL SCHEDULE (A4): Cabinet Exterior, Cabinet Interior, Cab Exterior 2, Cab Interior 2 — each with Notes/location col
- DOOR SCHEDULE (A9–A15): Base/Upper Doors, Applied Ends, Slab DF, 5 PC DF — Style, Material, OE, IE, Stile Width, Rail Width, Vendor
- DRAWER SCHEDULE (A19–A22): Drawer Box, Rollout — Style, Material, Vendor, Notes
- EDGEBAND SCHEDULE 1+2 (A23–A30): Doors, DF, Cab Body, Adj Shelves, Drawer, Rollout — Part, Manufacturer, #, Thickness, Description

**Page 2 — "Spec Sheet Continued"**
- FINISH SCHEDULE 1+2: Stain, Paint, Glaze, Finish, Sheen
- HARDWARE SCHEDULE: Hinge, Drawer Guides, Rollout Guides, Pulls, Shelf Clips, Trash Pullout, Lazy Susan, Tray Dividers, Closet Rod, Closet Flange
- COUNTERTOPS: Location, Style, Splash, Material

**Maps cleanly onto our DB model:**
- Material/Door/Drawer schedules → finish_groups columns (carcass_id, drawer_box_id, door_style_id)
- Edgeband Schedule 1+2 → up to 2 finish groups' edgeband_id with where-used breakdown
- Finish Schedule 1+2 → up to 2 finish_groups' finish_type, color_id, sheen
- Hardware → finish_groups.pull_id + room_accessories
- Moldings → finish_moldings table with where-used rooms (already wired)

**Limitation:** template assumes ≤2 finish groups (MATERIAL SCHEDULE has 2 ext/int slots; FINISH SCHEDULE 1+2; EDGEBAND SCHEDULE 1+2). For specs with 3+ finishes, render needs to spill onto extra pages — TBD.

## Title block source (LOT 4 redlines)

CV-generated cover sheet. Top region of every page is the title block we want to match:

```
[ACC LOGO?]   COVER SHEET  [STAGE CODE: STN | MEL]   Premier - Lot 4
                                                     Job # ____
                                                     Project MGR ____
                                                     Engineer ____   WO # ____
                                                     Date 12/05/25
                                                     1 of 19         25243
              250 W Anton Ave. Coeur d' Alene  (208) 772-2377  Idaho 83815
              JOB # 25243 Premier - Lot 4              JOB NOTES
```

PDF is 1224 × 792 pt (US Letter landscape). Title block occupies roughly the top 100–120 pt strip.

**Two render paths to consider (Karl to pick):**

### Option A: Re-render in code (lib/pdf-spec.tsx)
Build the title block from @react-pdf/renderer primitives — Text, View, Image. Pros: editable in code, version-controlled, parametric. Cons: pixel match to CV requires careful font/spacing tuning.

### Option B: Overlay onto a saved blank
Manually strip the body content from one CV page (using Bluebeam or Adobe), save the result as `data/templates/title-block-blank.pdf`. At render time use `pdf-lib` to draw our content over a copy of the blank. Pros: pixel-perfect match without us re-creating CV's layout. Cons: any title-block tweak goes through manual PDF edit, not code.

**Recommendation: Option B for v1.** Faster to ship, no risk of font drift, easy to iterate. Migrate to Option A later if Karl wants programmatic title-block changes (e.g. per-builder branding).

To execute Option B, Karl needs to:
1. Open `Premier- Lot 4 25.12.5 REDLINES.pdf` in Bluebeam.
2. Use the Eraser/Whiteout tool to remove the body content (everything below the title block strip).
3. Save as `data/templates/title-block-blank.pdf`.
4. Tell me "blank saved" — I'll wire `pdf-lib` to overlay spec content onto this template at generate time.

Alternatively, if Karl wants Option A, just say "build it in code" and I'll do that directly.
