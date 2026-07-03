# CV Reports Inventory — Trupiano Residence Job
## What Each Report Is and What It's Worth

---

### PSReport 1 — Cabinet List
**What it is:** Every cabinet in the job by room. ID, Qty, Name, W×H×D, L-R overlay, hinge type.
**Value:** PRIMARY TAXONOMY SOURCE. The naming convention (B-1Do1Dr1AS, DB-3Dr, SB-2Do, T-4AS1FS, W-2Do2As) encodes category + door count + drawer count + shelf count. Parseable directly.
**For estimating:** Import this → parse names → create estimate line items automatically.

---

### PSReport 2 — Cabinet List (continued)
Same report, more rooms (Living Room, Entry Bench, Pantry).
Additional types seen: B-2D-2AS, B-Open, W-1AS, T-4AS1FS, Base Filler No Toe, Base Filler, Upper Filler, Tall Filler, Wall Cleat Coat Hooks, 3/4 X 4 X 8 WALL PANEL, floating shelves.

---

### PSReport 3 — Board Stock Cut List
**What it is:** Every cut piece of board stock (nailer rip, toe kick, closet rod) with exact dimensions and which cabinet ID needs it.
**Value:** FORMULA DERIVATION TOOL. Collect this across multiple jobs of the same cabinet type at different widths — the relationship between cabinet width and material LF is recoverable.
**For estimating:** Medium-term — needs multiple jobs to be statistically useful.

---

### PSReport 4 — Material Summary
**What it is:** Total quantities for entire job by material category: banding (LF by type), board stock (BD FT), hardware (pieces), panel stock (sheets), closet rod (FT), fasteners, drawer slides (pairs by size).
**Value:** PRICE UPDATE TRIGGER. Every time a new job is drawn, import this → match to library → flag materials where your actual order price has drifted from the library cost. Needs an invoice price layer on top to close the loop.
**For estimating:** High — this is the "keep library current" mechanism.

---

### PSReport 5 — Drawer Check List
**What it is:** Per-drawer breakdown by cabinet — drawer box size, banding material/qty, drawer box bottom material/size, guide type (PRO600 21in, PRO100 14in).
**Value:** PROCUREMENT / DRAWER BOX ORDERING. Shows exactly what drawer boxes need to be cut and what slides they get.
**For estimating:** Lower — drawer count is captured at the type level; this is production detail.

---

### PSReport 6 — Molding Totals
**What it is:** Crown molding LF by room and profile, with ordering total (add waste → round up).
Structure: profile → material → lineal inches per room → ordering total in LF.
**Value:** MOLDING PROCUREMENT. Also useful as a cross-check for the spec form's molding selections.
**For estimating:** Medium — molding LF is a function of perimeter, not cabinet count. Needs room dimensions as input.

---

### PSReport 7 — Counter Top List
**What it is:** Countertop slab dimensions (W×D×T) by room.
**Value:** COUNTERTOP SUBCONTRACTOR INPUT. This is the order sheet for the stone/laminate fabricator.
**For estimating:** This is the bridge to the countertop estimating track. Each slab = SF × material cost. Direct value for multi-trade expansion.

---

### PSReport 8 — Door List
**What it is:** All doors grouped by door style and material. Per group: qty, W×H, type code, cabinet ID.
Type codes: P=pair, S=single, DF=drawer front, FF=false front, BE=blind end.
Door styles seen: #116 Shaker Inset Panel (Alder, Knotty Alder), #900 Slab/#916 5pc (Mel-1), #916 5pc Shaker Top Dwr, MEL .018 Banding.
**Value:** DOOR ORDERING + STYLE VERIFICATION. Cross-reference with spec form door style selection.
**For estimating:** High — door count × door cost (from library by style) is a direct material line item. Type codes tell us false fronts vs real doors.

---

### PSReport 9 — Drawer Cut List
**What it is:** Cut list for drawer box components (banding strips, drawer box bottoms) by material.
Materials: PF Maple .018×15/16 banding, Ply 3/4 PL-1/Antique White (box bottoms), White .018×15/16.
**Value:** SHOP PRODUCTION — which banding strips to cut for drawer boxes.
**For estimating:** Lower — production detail, not estimate input.

---

### PSReport 10 — Drawer/Rollout List
**What it is:** Every drawer box: type (5 DWR-UnderMt.Dovetail), W×H×D dimensions, cabinet ID. Also rollout section (0 rollouts on this job).
Total: 54 drawers, 0 rollouts.
**Value:** DRAWER COUNT VERIFICATION + BOX SHOP ORDER.
**For estimating:** The total drawer count is directly useful — 54 drawers × drawer box labor = significant line item.

---

### PSReport 11 — Roll Out Cut List
**What it is:** Rollout shelf cut list. Empty on this job (0 rollouts).
**Value:** When rollouts are present — same structure as drawer cut list. This is where rollout modifier costs would come from.
**For estimating:** Low on this job; important when rollouts are specified.

---

### PSReport 12 — Face Frame Cut List
**What it is:** All face frame solid wood members by material (3/4 Knotty Alder Solid, BD FT). Descriptions: Board, Post Side, F/L/R WT Edge, Right Stile. W×L per piece, cabinet ID.
**Value:** FACE FRAME MATERIAL QUANTITY. Total solid wood BD FT per job, broken down by member type.
**For estimating:** Medium — face frame BD FT scales with cabinet perimeter. Useful for formula derivation.

---

### PSReport 13 — Applied Door & Panelized End List
**What it is:** Applied doors and panelized end panels only (not the full door list). Door style, qty, W×H, type (BE=blind end), hinge, cabinet ID.
This job: 2 pieces of #116 Shaker Inset Panel (Buy Out Knotty Alder), 24.5"×30.5", type BE, no hinge — these are the fixed end panels on the B-1Do1Dr1AS cabinets (28, 33).
**Value:** PANELIZED END ORDER — tells the shop which ends get applied panels vs. left exposed.
**For estimating:** Low standalone; covered by panel category in taxonomy.

---

### PSReport 14 — Hinge Boring Locations
**What it is:** Per door/drawer front: cabinet ID, type (P/S), W×H, hinge centerline positions, mounting hole positions, reference (Bottom).
**Value:** SHOP PRODUCTION — CNC hinge boring program input.
**For estimating:** None — this is post-estimate shop data.

---

### PSReport 15 — Door Panel Cut List
**What it is:** Cut list for slab/flat panel doors by material (3/4 2s White Mel, MATERIAL NOT ASSIGNED). Qty, W×L, cabinet IDs.
This job: white mel door slabs for cabinets 84, 91, 95 (the melamine sections), unassigned flat panels for cabinets 81, 82 (the drawer front banks).
**Value:** SHOP PRODUCTION — panel saw program for slab doors.
**For estimating:** Low — door cost covered by Door List report at the style level.

---

## Summary: What to Actually Use

| Report | Primary Use | For Estimating |
|--------|-------------|----------------|
| Cabinet List (1,2) | Cabinet taxonomy + room layout | ⭐⭐⭐ Import → parse → estimate |
| Material Summary (4) | Library price calibration | ⭐⭐⭐ Price update trigger |
| Door List (8) | Door style + count verification | ⭐⭐⭐ Door cost line items |
| Drawer/Rollout List (10) | Drawer count | ⭐⭐ Drawer labor total |
| Board Stock Cut List (3) | Formula derivation (multi-job) | ⭐⭐ Long-term |
| Face Frame Cut List (12) | Solid wood quantity | ⭐⭐ Long-term |
| Molding Totals (6) | Molding procurement | ⭐⭐ If room dimensions known |
| Counter Top List (7) | Countertop subcontractor | ⭐⭐ For multi-trade expansion |
| Drawer Check List (5) | Drawer box procurement | ⭐ Production detail |
| Drawer Cut List (9) | Shop production | ⭐ Production detail |
| Applied Door & Panel (13) | End panel order | ⭐ Covered by taxonomy |
| Roll Out Cut List (11) | Shop production | ⭐ When rollouts present |
| Hinge Boring (14) | CNC program | — Estimating: none |
| Door Panel Cut List (15) | Panel saw program | — Estimating: none |

---

## What's Missing (Not in Any of These Reports)
- **No prices** — CV doesn't output cost. Prices come from ProjectPAK/library.
- **No labor** — assembly times live in ProjectPAK assembly module.
- **No finish quantities** — finishing material (stain, sealer, topcoat) quantities not reported here. Those came from the ProjectPAK assembly breakdown.

## The Auto Price Update Flow (When Built)
1. PM draws job in CV → runs standard report set
2. Imports Material Summary into system
3. System matches material names to library items (needs a mapping table)
4. When invoice arrives, PM enters actual cost paid
5. System flags where invoice cost ≠ library cost and prompts update
6. Library updates → all future estimates use new cost automatically
