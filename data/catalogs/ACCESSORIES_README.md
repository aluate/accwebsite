# Accessories Catalog — README

**File:** `accessories_reva.csv`
**Location:** `data/catalogs/`
**Last updated:** 2026-05-21

---

## What this is

This is ACC's standard accessory library — the products we actually spec and install. It is the source of truth for the accessory dropdown/selection UI in the spec form. Every row is something we have used, would use, or are evaluating.

This is **not** a vendor price list. It is a curated, human-maintained library of products that have passed Karl's gut check.

---

## CSV column reference

| Column | Description |
|---|---|
| `id` | Sequential ACC identifier (ACC-001, ACC-002…). Never reuse a retired ID. |
| `name` | Human-readable product name. What a PM or installer would call it. |
| `brand` | Manufacturer (e.g. Rev-A-Shelf, Hafele, Blum). |
| `series` | Manufacturer's series or model line. If a confirmed SKU is known, put it in `notes`. |
| `category` | Functional category — see category list below. |
| `width_options_in` | Semicolon-separated list of available widths in inches. |
| `finish_options` | Semicolon-separated list of available finishes/colors. |
| `hand` | Handedness, if applicable. Leave blank for non-handed items. Values: `L;R` (both available, must specify), `L` (left only), `R` (right only). This matters for blind corner lazy susans, some pull-outs, and anything that references cabinet hinge side. |
| `notes` | Anything a spec writer or installer needs to know. For confirmed SKUs, include the full part number here. Flag unverified series codes with WARNING. |

### Category values (current)
`rollout` · `trash` · `lazy_susan` · `door_storage` · `drawer` · `pantry` · `specialty` · `other`

Add new categories here when a new one is introduced.

### SKU verification status
Items in this library fall into three states:

- **SKU confirmed** — full part number in `notes`, pulled directly from catalog. ACC-022 through ACC-025 are confirmed.
- **Series only** — the series code is correct but no specific SKU has been locked. These can be specced by series but the PM needs to confirm the exact model at order time. ACC-001 through ACC-003, ACC-007 through ACC-011, ACC-013, ACC-014, ACC-016, ACC-017, ACC-019.
- **Unverified** — series code may be wrong or fabricated. Do not use until confirmed from catalog. ACC-012 (RCPO), ACC-015 (4FSDB), ACC-018 (BCFPO).

---

## Curation notes (history)

This section is the brain. Each entry explains *why* a product is in the library, *why* it replaced something else, or *why* it was rejected. A future agent or PM should be able to read this and understand what we've tried and what we've settled on.

### 2026-05-21 — Initial library seeded
- Base dataset: Rev-A-Shelf core line (ACC-001 through ACC-019)
- These represent the products ACC has been speccing most frequently
- ACC-020 is a catch-all "Other/Custom" row for edge cases
- Karl is now curating this list by reviewing actual vendor product pages and approving/rejecting items
- **Source of truth for additions:** Karl reviews the product page; if it's in, it goes in the CSV with a note here explaining the context

### 2026-05-21 — Trash pullout standard switched: 4WCTM → 4WCSC/D
**Decision:** ACC's standard double trash pullout is now the **Rev-A-Shelf 4WCSC/D Series** (Maple Bottom Mount, Blum Movento soft-close). The previous standard was the **4WCTM Series** (Maple Top Mount), which has been retired.

**Why:** ACC builds euro/frameless cabinets. The 4WCTM is a top mount — its slides attach to the face frame at the top. On frameless boxes there's nothing solid to anchor to, causing the unit to bind over time. The 4WCSC/D mounts to the cabinet floor and door instead, which is the correct attachment geometry for frameless construction. Price delta is ~$100/unit, which is obliterated by a single service call.

**New standard SKUs (double, bottom mount, Blum SC):**
| ACC ID | SKU | Cabinet | Description | SLP |
|---|---|---|---|---|
| ACC-022 | 4WCSC-1527DM-2 | 15" base | Double 27qt | $553.99 |
| ACC-023 | 4WCSC-1835DM-2 | 18" base | Double 35qt | $575.99 |
| ACC-024 | 4WCSC-2135DM-2 | 21" base | Double 35qt | $604.99 |

**Note on 15" cabinet:** The largest double that fits a 15" base in this series is 27qt per bin. If a larger single bin is needed in 15", use 4WCSC-1535DM-1 (Single 35qt, $528.99).

**SERVO-DRIVE (electric-assist) upgrades also available** via 4WCSD series — same cabinet sizes, ~$1,300 range. Not in standard spec but available on request.

**Catalog source:** 2026_SpecGuide_full.pdf, pages 86–87 (4WCSC/D Series). Retired 4WCTM documented on pages 90–92.

---

---

## 2026 Spec Guide page index
Source file: `residential-repo/2026_SpecGuide_full.pdf` (314 MB — too large to read directly; use qpdf to extract sections)

| Catalog pages | Section / Series | Notes |
|---|---|---|
| 51–63 | Tresco Lighting (24V Easy Cabinet Lighting Kits, OptiPockit puck lights, FREEDiM dimmers, PowerSync supplies) | Under-cabinet lighting |
| 64–65 | Waste Solutions intro (unnumbered) | Section divider pages |
| 66 | 4WCWM — Maple Bottom Mount Waste Mgmt Center | 24" base only; Blum Movento; green lid combo |
| 67 | 4WCOX — Wood Bottom Mount Waste Center w/ OXO storage | 24" base only |
| 68–69 | Replacement Containers + Bulk Pack (4TMBIN, RV-series bins) | Bin color/size reference |
| 70 | RV Series — Replacement Lids (bi-directional, 27/32/35/50qt) | Lid color options |
| 71 | TOKIT Series — Tip-On Kits (for 4WCSC + 5LB LEGRABOX) | Optional touch-open upgrade |
| 72–73 | 5LB Series — LEGRABOX Bottom Mount | Frameless 12/15/18/24"; orion gray or stainless frame |
| 74–75 | 5149 Series — Aluminum Rev-A-Motion® Bottom Mount | 15/18/21"; soft-open/soft-close; aluminum frame |
| 76–77 | 5349 Series — Aluminum Bottom Mount | 15/18"; aluminum frame; soft-close |
| 78–79 | 53WC Series — Steel Bottom Mount | 15/18"; powder-coat wire; soft-close |
| 80 | 53TM Series — Steel Top Mount | 18/24" frameless only — **do not use on euro builds** |
| 81 | 5BBSC Series — Recycle Center | 24" base; canvas liner; chrome frame |
| 82 | 4WC Series — Maple Bottom Mount (ball-bearing + one SC option) | 15/18/24"; limited SC availability |
| 83 | 4WC-WN Series — Walnut Bottom Mount | 15/18/21"; walnut dovetail; Blum Movento |
| 84–85 | 4WCBM Series — Maple Bottom Mount w/ Rev-A-Motion® | 15/18/21/24"; soft-open/soft-close piston |
| **86–87** | **4WCSC/D Series — Maple Bottom Mount, Blum Movento SC** | **ACC STANDARD — 15/18/21/24"; see curation notes** |
| 88–89 | 4VLWCSC Series — Value Line Waste Container | 15/18/21/24"; plywood box; white bins; budget option |
| 90–92 | 4WCTM Series — Maple Top Mount | **RETIRED for ACC** — binds on euro/frameless; see curation note |
| 93 | 5SBWC Series — Wire Undersink Pullout | 24"+ sink base; 8L + 15L bins |
| 94 | 4SOWC Series — Maple Door-Mount Vanity Waste | 30" vanity base; single 8L |
| 95+ | Blind Corner Solutions | New section |

---

## Rules

1. **Karl approves every row.** Don't add products because they look good on paper.
2. **Notes column is mandatory for any non-obvious item.** If you're adding something weird, explain it.
3. **Keep the CSV and this README in sync.** When you add a product, add a curation note here.
4. **Don't delete rows — retire them.** If a product is discontinued or dropped, add `[RETIRED]` to the name and note why.
5. **IDs are permanent.** ACC-007 is always that lazy susan. Don't renumber.
