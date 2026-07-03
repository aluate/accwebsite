# ProjectPAK Assembly Analysis
## Cabinet: DB3D_3EQ — Drawer Stack, 3 Equal Drawers (Stained Finish)
### Dimensions: 32.25"W × 24"D × 36.5"H
### Total Unit Cost: $708.74 | Unit Price: $1,317.49

---

## What This Tells Us About the Estimating Model

### Labor Rates (Base / Burdened)
| Operation         | Base Rate | Burdened Rate | Multiplier |
|-------------------|-----------|---------------|------------|
| Shop Fabrication  | $25.00/HR | $92.40/HR     | 3.70×      |
| Installation      | $45.00/HR | $112.91/HR    | 2.51×      |
| Engineering/PM    | $55.00/HR | $147.79/HR    | 2.69×      |

> Labor times are stored in **fractional hours** (e.g., 0.0322 HR = 1.93 minutes on beam saw).
> Quantities are parametrically driven by W × D × H dimensions.

### Cost Types (Phases)
- **Fabrication** — shop floor production
- **Finishing** — paint/stain/topcoat
- **Installation** — on-site install labor
- **Engineering** — drawing/engineering time
- **Management** — PM time per cabinet
- **Delivery** — load/pack/unload truck

---

## Sub-Assembly Breakdown

### 1. Base Cab Material/Labor — $130.57 unit cost → $226.09 unit price
**Cabinet Parts (Materials)**
- BID_1B 3/4"×4×8 PS Alder A1 VC — $4.85/SF
- 3/4"×4×8 BIRCH PLYWOOD — $3.22/SF
- BID_1M 3/4"×4×8 Hard Rock Maple Melamine PB — $1.50/SF
- BID_1A Custom Stocked PVC Tape 3mm×15/16" — $0.332/LF
- BID_1A Wilsonart STD VG Finish 4×8 — $1.57/SF (exterior finish panels)
- BID_1F Wilsonart White Cabinet Liner — $0.65/SF (interior liner panels)

**Labor (minutes)**
- LABOR CNC ROUTER 1: 0.1062 HR
- LABOR EDGEBANDER 2: 0.0294 HR
- LABOR DRILL & DOWEL: 0.0250 HR
- LABOR BEAM SAW: 0.0227 HR
- LABOR ROUGH ASSEMBLY BASE & WALL: 0.1111 HR
- LABOR PANEL LAYUP: multiple entries (various panel dimensions)
- LABOR FINISH PREP: 0.3006 HR
- LABOR KITTING BASE WALL AND CARTS: 0.1000 HR

---

### 2. Rail Material/Labor — $6.33 → $12.79
- Materials: BIRCH PLYWOOD, finish panels, PVC tape
- Labor: CNC ROUTER 1, EDGEBANDER 2, DRILL & DOWEL, PANEL LAYUP, FINISH PREP

---

### 3. Base Toekick — $16.71 → $33.82
- Materials: BID_1I 3/4"×4×8 SHOP Plywd (multiple panels), BID_1C 1/4"×4×8 MDF, finish panels
- Labor: BEAM SAW, TOEKICKS, PANEL LAYUP (×4 entries), FINISH PREP

---

### 4. Face Frame Material/Labor RSL — ~$20.85 → $26.24
- Material: BID_1F 4/4 PS Maple (×3 entries, different dimensions: 2.25×32.5, 2.25×27.75, 2.25×28)
- Labor: RIP SAW, MOULDER, LABOR CUSTOM 2 (CASTORS & SILLS) @ $35/HR, FINISH PREP

---

### 5. Drawer Front - Dwr Bank — $73.33 → $131.57 × qty=3 = $394.70
**Materials**
- BID_1F Buyout Door & Drawer Front PG Maple Ra: $18.50/SF, qty 2.4262 SF
- WILSONART 38 and 60 FINISH VG 4×8: $1.37/SF
- WILSONART 3173 PEARL CABINET LINER 4×8: $0.646/SF
- BID_1A Custom Stocked PVC Tape: $0.332/LF

**Hardware**
- Allowance_0_Pull $20.00: $20.00 EA (pull allowance)
- BUMPERS CLEAR 7.9mm×2.2mm: $0.0387 × 2

**Labor (minutes)**
- LABOR PANEL LAYUP: 0.0122 HR
- LABOR BEAM SAW: 0.0076 HR
- LABOR EDGEBANDER 1
- LABOR BRIMA/EKO: 0.0121 HR
- LABOR FINAL ASMB 3 DR/DWR CABS (Metal DwrBox): 0.0333 HR
- LABOR FINAL ASMB 3 DR/DWR CABS: 0.2000 HR
- LABOR FINISH PREP: 0.0506 HR
- LABOR INSTALLATION - PULLS (InstLabor @ $45): 0.0400 HR

---

### 6. Drawer Box - Bank — $63.17 → $95.37 × qty=3 = $286.10
**Drawer Box Parts**
- BID_1T 1/2" Prefinished Maple Plywood: $2.85/SF (bottom, sides)
- BID_1T 3/4" Prefinished Maple Plywood: $3.25/SF (front/back)
- BID_1U 5/8" Prefinished Maple Edgebanding: $0.15/LF

**Hardware**
- BID_1S Drawer Slide Undermount Soft Close PROS: multiple tiers ($9.10–$18.00 EA)
- Grass Elite Standard Locking Device: $0.35 EA (flagged "DO NOT USE")

**Labor (minutes)**
- LABOR BEAM SAW: 0.0322 HR
- LABOR BRIMA/EKO: 0.0288 HR
- LABOR EDGEBANDER 1: 0.0157 HR
- LABOR DRAWERS: 0.2000 HR + 0.0500 HR
- LABOR FINAL ASMB 3 DR/DWR CABS: 0.0667 HR
- LABOR FINAL ASMB 3 DR/DWR CABS (UNDERMTS): 0.0833 HR

---

### 7. Finish Cabinet — $18.14 → $42.63
**Finishing Materials**
- BID_1V Stain Base 5gal Dye Stain: $32.00/unit, qty 0.0506 (carcass exterior)
- BID_1V Woodsong II 10% Stain Base 1gal Wiping S: $48.00
- BID_1V Krystal Sealer 5gal (CV Sealer): $55.00
- BID_1V Klearvar Dull 5gal (CV Topcoat): $54.00
- BID_1V Care Catalyst: $57.00
- BID_1V Klearvar Post Cat Satin Sheen: $43.00

**Labor**
- LABOR FINISHING: 0.4835 HR (carcass)
- LABOR FINISHING (Specialty): 0.2417 HR

---

### 8. Finish Base Door/Dwr Frt — $33.26 → $78.17
- Same finishing materials as above, applied to 3 drawer fronts
- LABOR FINISHING: 0.4835 HR + 0.2636 HR
- LABOR FINISHING (Specialty): 0.1318 HR

---

### 9. Engineering/PM Labor - Cabinet — $27.49 → $73.88
- LABOR ENGINEERING (EngPMLa): $55/HR, 0.2500 HR → $36.95
- LABOR PROJECT MANAGEMENT (EngPMLa): $55/HR, 0.2499 HR → $36.93

---

### 10. Delivery/Install Labor - Base — $60.42 → $156.53
- LABOR LOAD/PACK TRUCK (Delivery @ $25/HR): 0.1667 HR → $15.40
- LABOR UNLOAD TRUCK (InstLabor @ $45/HR): 0.2500 HR → $28.23
- LABOR INSTALLATION - BASES (InstLabor @ $45/HR): 0.8333 HR → $94.08
- LABOR INSTALLATION - TOEKICKS (InstLabor @ $45/HR): 0.1667 HR → $18.82

---

## Key Insights for Estimating Engine Design

### 1. The formula is W × D × H → quantity of each material
Quantities like "15.1357 SF of birch plywood" are computed by CV from cabinet dimensions.
Our Phase 1 (parametric) system needs to replicate these formulas per cabinet type.

### 2. Assembly codes drive variants
`UNDERMTS` = undermount slides variant, `Metal DwrBox` = metal drawer box.
These are conditional branches in the assembly recipe.

### 3. Finish type completely changes material set
Stained finish uses: dye stain + wiping stain + sealer + topcoat + catalyst.
Painted finish would use a different BID_1V material set.
This is a critical branch point in the estimating engine — finish type selection
(already in our spec form) must route to different finishing sub-assemblies.

### 4. The pull is an allowance, not a specific item
`Allowance_0_Pull $20.00` — CV uses a placeholder. Our system already has the
actual pull SKU from the spec form. This is better — we can use real prices.

### 5. Labor is already broken down by machine/phase
This maps directly to capacity planning — we know exactly how many CNC minutes,
edgebander minutes, etc. per cabinet type. This feeds the schedule dashboard.

### 6. Finishing labor is significant
For a stained cabinet: ~0.73 HR finishing labor just for the carcass + 0.73 HR for fronts.
On a 30-cabinet kitchen that's ~44 hours of finishing labor. Easy to under-bid.

---

## Schema for Estimating Engine (Proposed)

```
assembly_types
  id, code (DB3D_3EQ), name, category (base/wall/tall/specialty)
  width_default, depth_default, height_default

assembly_sub_components  
  id, assembly_type_id, sub_name, sequence
  cost_type (fabrication/finishing/installation/engineering/delivery)
  qty_multiplier (driven by W/D/H formula or fixed)

component_materials
  id, sub_component_id, library_item_id, qty_formula (e.g., "W*H/144")
  is_conditional, condition_key (e.g., finish_type=stain)

component_labor
  id, sub_component_id, labor_operation_id, hours_formula
  is_conditional, condition_key

labor_operations
  id, code (LABOR_CNC_ROUTER_1), name, base_rate, overhead_multiplier
  department (shop/install/engineering/delivery)
```

---

## Phase 1 Shortcut (Without Full Formula Engine)

Before building the full parametric engine, we can bootstrap by:
1. Using the PPAK export total cost per sub-assembly as a starting point
2. Scaling by linear feet (cost per LF of base cabinet run)
3. Adding finish type as a cost multiplier (stain vs. paint vs. melamine)
4. Manual override line items for custom pieces

This gives a ~85% accurate estimate in minutes, which is the goal for Phase 1.
The full formula engine is Phase 2 (after CV export integration).
