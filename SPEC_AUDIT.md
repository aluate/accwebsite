# Spec Form Audit — Cross-Reference: Real Jobs vs. Catalogs vs. Form
*Generated 2026-05-09. Source: 10 text-extractable PDFs from EXAMPLE DRAWINGS/ + Artifex spec sheet + current catalog CSVs.*

---

## How to read this

Each finding has a severity:
- **CRITICAL** — blocks safe use on real jobs (form would produce wrong output or PM can't find the right option)
- **MEDIUM** — catalog gap that forces escape hatch use too often
- **LOW** — naming inconsistency or minor cleanup

---

## 1. Stain Catalog — ALL PLACEHOLDER — CRITICAL

Every stain entry in `colors_stain.csv` is a placeholder. These ACC stain names appear in real drawings:

| Stain Name | Jobs |
|---|---|
| **BELLINI** | Stancraft Smith Lake (2 finish groups), Vulpine/Matterhorn Parade |
| **GIMLET** | Bush Legacy Red Fir |
| **NATURAL** | Pritchette Residence (RC White Oak veneer with natural stain) |
| **CUSTOM DARK STAIN** | Stancraft Smith Lake (custom accent) |
| **Amaretto** | Bissell Residence (matches showroom display) |

BELLINI is the single most-used stain in the sample set and it can't be selected in the form. If a PM opens the spec today and tries to pick BELLINI, they get "ACC In-House Mix #1 (Karl to fill)."

**Fix needed from Karl:** Give me the full list of ACC in-house stain names. I'll populate the catalog. The ones I can confirm from drawings alone: BELLINI, GIMLET, Amaretto, Natural (on RC White Oak), Custom Dark. There are likely more.

---

## 2. AGT Brand — COMPLETELY MISSING — CRITICAL

AGT melamine is not in `colors_melamine.csv` at all. Two AGT products appear in recent jobs:

| AGT Code | AGT Name | Job |
|---|---|---|
| 3010 | Pearl Black | Pritchette Residence |
| 3002 | Dark Grey Matte Soft Touch | Kenny Debaene |

These are also paired with specific AGT edgebands (see §6). The whole brand needs to be added.

**Fix:** Karl provides the AGT line card or I can build from the drawing references + ask him to confirm.

---

## 3. Uniboard Brand — COMPLETELY MISSING — CRITICAL

Uniboard isn't in the catalog at all. One product confirmed in real jobs:

| Uniboard Code | Name | Job |
|---|---|---|
| K15 | Cannes Riviera Oak | Stancraft Smith Lake |

There are almost certainly more Uniboard products in use — K15 is one of their most common cabinet-grade melamine panels.

---

## 4. Tafisa Entries Are All Placeholder — CRITICAL

The catalog has Tafisa but all entries are placeholder with fake collection names ("Alto Series Placeholder," "Crystalite Series Placeholder," etc.). Real Tafisa products in use:

| Tafisa Code | Name | Job |
|---|---|---|
| L582 (K) | Fashionista | Kenny Debaene, Woolridge |
| L583 (K) | First Class | Atlas Plant 6549 |
| T581 | Sheer Beauty | Spivey Residence |
| T2013 | Summertime Blues | Spivey Residence |

L582 and T581 are in the catalog *by name* (MEL-TA-L582 doesn't exist — only placeholder collections do). Need to verify the actual IDs and replace placeholders with real records.

---

## 5. Door Style Catalog — ALL PLACEHOLDER — CRITICAL

Every entry in `door_styles.csv` has `placeholder: true`. The real door styles from drawings:

| Drawing Reference | What it means | In catalog? |
|---|---|---|
| CAB DOOR #116 | Specific Cab Door style number | NO — placeholder names are invented |
| CAB DOOR #116 STANDARD SHAKER | #116 = their shaker style | NO |
| SLAB / SLAB VENEER | Modern slab | DS-SLAB-VENEER exists (placeholder) |
| SLAB (MEL) | Melamine slab | DS-SLAB-MDF exists (placeholder) |
| SHAKER | Generic shaker | DS-CD-001 exists (placeholder) |
| ROUTED FRAME 2-1/4" | Slab routed to look like frame | NOT LISTED |
| Glass Insert (Seedy) | Seeded glass insert | DS-GLASS-SEEDED exists (placeholder) |

The whole door style library needs to be built from the actual Cab Door catalog. "#116" is a real Cab Door style number — we have a starting point. Every current entry is an invented name.

**The $70k risk here:** a PM picking "Shaker Classic" from the form dropdown might mean something completely different from "CAB DOOR #116 STANDARD SHAKER" in the drawing. These need to be the same thing with a 1:1 mapping.

---

## 6. Edgeband Catalog — SEVERELY UNDERPOPULATED — CRITICAL

The catalog has 9 entries (mostly placeholder). Real jobs use 20+ specific edgeband codes. Every single specific code from the drawings is missing:

| ESI Code | Description | Job |
|---|---|---|
| ESI 3103 | DULCE VITA | Stancraft (BELLINI finish) |
| ESI 8726TF | EBONY RECON | Stancraft (Custom Dark) |
| ESI 30421TF | FINISH OAK | Pritchette (White Oak) |
| ESI 8677 | FORMICA SCANDI RIFT OAK | Bush Legacy |
| ESI 2416KTF | BLACK RIFT | Vulpine (painted black) |
| ESI 30320YMTF | MILLENIUM OAK | Vulpine (BELLINI on PS White Oak) |
| ESI 8306TF | NATURAL TEAK | Bissell (Knotty Alder) |
| ESI 20229 | MIDNIGHT SUN | Bissell (Iron Ore painted island) |
| ESI ESI-4905 | MAPLE MELAMINE | Spivey, Bissell (standard interior) |
| AGT P723 | PEARL BLACK | Pritchette |
| AGT 3002 | DARK GREY SOFT TOUCH | Kenny |
| TAFISA L583 (K) | FIRST CLASS | Atlas Plant |
| TAFISA L582 (K) | FASHIONISTA | Kenny, Woolridge |
| UNIBOARD K15 | CANNES RIVIERA OAK | Stancraft |
| SW SW 0065 | VOGUE GREEN (paint to match) | Bissell Bar |

**Second problem — the edgeband structure itself is missing from the form.** Real drawings have a full EdgeBand Schedule with 7 letter-coded positions:

| Code | Where used |
|---|---|
| D | Applied End Panels / Door & Drawer Fronts |
| E | Cabinet Body Parts |
| I | Adjustable Shelves |
| V | Bottom of Upper, Finished End |
| U | Bottom of Upper, Unfinished End |
| B | Drawer Box Sides |
| C | Drawer Box Front and Backs |

The spec form currently captures one edgeband choice per finish group. It needs to capture all 7 positions, each with its own manufacturer/code/description. This is a structural gap, not just a missing catalog row.

---

## 7. Carcass Naming Mismatch — MEDIUM

The drawings uniformly say **"HARDROCK MAPLE MEL"** (melamine). The catalog says **"Hardrock Maple PB"** (particleboard). These are likely the same product (maple-species melamine-coated particleboard) but the name a PM reads in a drawing won't match the name in the dropdown.

Additionally, the Spivey job (the $70k incident job) uses **"Plywood Box"** for cab interior, not "HARDROCK MAPLE MEL." This appears to be a melamine-coated plywood variant — different product, different price point — and it is NOT in the catalog.

**Confirmed carcass options in use:**
- HARDROCK MAPLE MEL (standard interior — ~90% of jobs)
- Plywood Box / Maple Mel Ply (premium interior — Spivey, others)
- PF Maple Ply (cab exterior drawer box material, also used as interior upgrade)

The catalog names need to match what's on the drawings exactly. If the drawing says "HARDROCK MAPLE MEL" the dropdown option must say "Hardrock Maple Melamine" not "Hardrock Maple PB."

---

## 8. Blum 120 Hinge Missing — MEDIUM

The catalog has multiple Blum 110 variants. Multiple recent jobs (Spivey 2/23/26, Bissell 1/22/26) use **Blum 120 Soft Close**, which opens wider — important for corner cabinets and pantries.

It's not in the catalog at all. A PM specing a Spivey-type job today would have to use the "Other" escape hatch.

---

## 9. Key Paint Colors Missing — MEDIUM

SW Tricorn Black (SW 6258) and SW Iron Ore are two of the most common dark accent cabinet colors in current PNW residential work. Both appear in real jobs and neither is in `colors_paint.csv`.

| Missing Color | SW Code | Job |
|---|---|---|
| Tricorn Black | SW 6258 | Vulpine/Matterhorn Parade |
| Iron Ore | (verify code) | Bissell Residence island |
| Vogue Green | SW 0065 | Bissell Bar |
| Black Magic | SW 6991 | KRIS 10573 Friar |

The catalog has a "Full SW catalog ingest pending" placeholder but these four should be added immediately — they show up in current work.

---

## 10. Egger Catalog Exists but Not Integrated — MEDIUM

`egger_decor_map.xlsx` has 64 Egger decor codes with pricing tiers. The KRIS job (26078, dated 3/25/26 — an active job) uses **Egger U732 Dust Grey**. That code is in the decor map but NOT in `colors_melamine.csv`.

The egger_decor_map needs to be imported into the melamine catalog. All 64 entries.

---

## 11. 25026 (Atlas Cocollala) Is Image-Only PDF — LOW

`25026 - Atlas Stewart Cocollala 8-21-25.pdf` (88 pages) is a scanned image PDF — no extractable text. pdfplumber returns zero text and 6 images per page. This job's spec data can't be read programmatically without OCR.

This is worth knowing for two reasons: (1) can't audit it, and (2) some Z drive files are scans, so any future sync between the Z drive and the app needs to handle both text-layer and image-only PDFs.

---

## 12. KRIS Job (26078) Has No Standard Cover Sheet — LOW

The KRIS job drawings have no "RESIDENTIAL JOB NOTES" cover page. Job number is "PRLM" (preliminary) not a sequenced number. The first pages are just drawings with a small note: "WOOD TOP TO BE LM CAMPBELL WS2B10 BLACK ON KNOTTY ALDER / PAINT - SW BLACK MAGIC 6991." This appears to be a commercial or preliminary job that hasn't gone through the standard spec process yet. Can't audit for cover-sheet data.

---

## Summary Table

| Gap | Severity | Fix needed from Karl | Fix I can do |
|---|---|---|---|
| Stain catalog all placeholder — BELLINI, GIMLET, Amaretto missing | CRITICAL | Give me the stain list | Populate once provided |
| AGT brand missing | CRITICAL | Confirm AGT line in use | Add from drawing refs |
| Uniboard missing | CRITICAL | Confirm K15 and other Uniboard items | Add from drawing refs |
| Tafisa entries are placeholder, codes wrong | CRITICAL | Confirm real Tafisa code → name mapping | Fix catalog |
| Door styles all placeholder, Cab Door #116 unmapped | CRITICAL | Walk me through Cab Door catalog | Build real entries |
| Edgeband severely underpopulated | CRITICAL | Confirm ESI codes (I have them from drawings) | Add all 15+ entries |
| Edgeband form structure (7-position) vs 1-choice per group | CRITICAL | Approve the form change | Rebuild edgeband section |
| Carcass naming mismatch (PB vs MEL) | MEDIUM | Confirm "HARDROCK MAPLE MEL" = CAR-001 | Rename catalog entry |
| "Plywood Box" (Spivey cab interior) not in catalog | MEDIUM | Confirm it's maple mel ply | Add as CAR-005 |
| Blum 120 hinge missing | MEDIUM | Nothing | Add HH-BLU-005 |
| SW Tricorn Black, Iron Ore, Vogue Green, Black Magic missing | MEDIUM | Nothing | Add 4 paint entries |
| Egger catalog exists but not imported | MEDIUM | Nothing | Import 64 rows from egger_decor_map.xlsx |
| 25026 image-only PDF — can't audit | LOW | Nothing now | Note for later OCR |
| KRIS job no cover sheet | LOW | Nothing | Note for follow-up |

---

## What I can fix right now (zero input from Karl)

*All completed 2026-05-09:*

1. ✅ Add Blum 120 hinge to hardware_hinges.csv — **done** (HH-BLU-120)
2. ✅ Add SW Tricorn Black, Iron Ore, Vogue Green, Black Magic to colors_paint.csv — **done** (4 entries)
3. ✅ Import Egger decor map into colors_melamine.csv — **done** (69 rows imported)
4. ✅ Add 15 ESI/AGT/Tafisa/Uniboard edgeband codes to edgeband.csv — **done** (27 total entries)
5. ✅ Rename CAR-001 to "Hardrock Maple Melamine" to match drawing language — **done**
6. ✅ Remove 10 Tafisa placeholder rows from colors_melamine.csv — **done** (4 real entries remain)
7. ✅ DAC/Tahiti spec form hardening — **done** (commit 58af219):
   - Completeness badge (0–8 required fields, green/yellow/red) in save bar
   - Stain dropdown grays out on paint-type FG; Paint grays out on stain-type FG
   - Placeholder door styles filtered from dropdown (only DS-CD-116 shows until Karl provides more)
   - Inline edgeband code input replaces window.prompt()

## What needs Karl first

1. **Stain list** — ACC in-house stain names + any ML Campbell codes used. Minimum: confirm BELLINI, GIMLET, Amaretto as real names, and give me the full list.
2. **Cab Door catalog walk** — how does CAB DOOR #116 relate to the Cab Door order system? What style number maps to standard shaker, mitre, etc.?
3. **Uniboard and AGT full line confirmation** — confirm which other products from these brands are in regular use so I don't add dead stock.
4. **Plywood Box / Maple Mel Ply clarification** — is this the same as CAR-002 (Prefinished Plywood — Maple) or a different product?
5. **7-position edgeband form approval** — changing the form structure from 1 edgeband choice to 7 is a significant UI change. Need your go-ahead before rebuilding it.
