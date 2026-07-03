# ACC Website — Progress Log

**This is the run memory and the audit trail.** Newest entry at top. Every working session adds an entry: what was built, what was tested (selftest + smoke), what was deferred, blockers, and exactly where to resume.

Read order for any agent: `AGENTS.md` (rules) → this file (where we are) → `ARCHITECTURE.md` (how the system is built, when you need detail).

Doc roles, so nothing drifts:
- **AGENTS.md** — the rules. Stable. Rarely changes.
- **PROGRESS_LOG.md** (this file) — the living run memory + the CURRENT LIST. Changes every session.
- **ARCHITECTURE.md** — how the system is built. Reference.
- **KARL_TODO.md** — the inputs queue: things only Karl can provide (stain mixes, builder defaults, color codes). Not agent work.
- **TODO.md** — historical/superseded by this log for the active list. Kept for context only.

---

## Session: 2026-07-03 — PDF 5-sheet rebuild (Karl + agent)

**Commit:** bb552f1

### What changed
- [x] **PDF: 5-sheet consolidated format** (`lib/pdf-spec.tsx`):
  - **Sheet 1 (F.1) — Finish Schedule**: Single page showing ALL finish groups in a matrix. Rows = Finish Type / Color / Glaze / Topcoat / Sheen / Species / Carcass Ext / Carcass Int / Drawer Box / Door Style / Edgebands / Pulls. Columns = one per FG. Replaces the per-FG-sheet loop.
  - **Sheet 2 (R.1) — Room Schedule**: Unchanged — 3-column list (ROOM | FINISH GROUP | NOTES).
  - **Sheet 3 (EB.1) — Edgeband Schedule**: New page. Consolidates edgebands from all FGs, deduped by letter ID. Shows: ID (large, orange) / Thick / Supplier / Description / Where Used / Finish Groups / Notes. Red warning header: "Letter IDs are machine positions — verify before ordering."
  - **Sheet 4 (T.1) — Trim & Moldings**: New page. Detail rows (Type | Room | Size | LF | Notes) + Totals by Type rollup below.
  - **Sheet 5 (AP.1) — Appliances**: Unchanged, now correctly in position 5.
  - Accessories (A.1) and Notes (N.1) follow when data is present.
  - `stageMap` updated: EB=EDGEBANDS, T=TRIM, AP=APPLIANCES.

### Also fixed
- Restored `components/ResidentialSpecClient.tsx` from git HEAD (was truncated at line 1895 mid-token; git HEAD = 1898 lines).

### Files changed
- `lib/pdf-spec.tsx` — 5-sheet rebuild (+204 lines)
- `components/ResidentialSpecClient.tsx` — restored from HEAD (no net change)

---

## Session: 2026-07-03 — PDF + form polish (agent)

**Selftest before:** 19 pass / 3 fail (pre-existing: $70k fields, paint_colors_bm.json missing, schedule TS types)
**Selftest after:** 19 pass / 3 fail (no regression)

### CURRENT LIST — all items completed [x]

- [x] **Item 1 — PDF: Room Schedule → 3-column list** (`lib/pdf-spec.tsx` `RoomMatrixPage`): Replaced the old matrix (columns = finish groups, rows = rooms, ✓ cells) with a flat 3-column list (ROOM | FINISH GROUP | NOTES). One row per room×FG assignment. Room name repeats if multiple FGs. Unassigned room → "—" in FG column. Header row uses DARK (#222) background, white text, all caps. Alternate row shading preserved. FG legend (label: type) kept above table. Column widths: ROOM flex 3.5, FG flex 2, NOTES flex 4.5.
- [x] **Item 2 — PDF: Remove CAB EXT 2 / CAB INT 2** (`lib/pdf-spec.tsx`): `MATERIAL_ROLES` array trimmed from 4 rows to 2 (Cabinet Exterior, Cabinet Interior only). Removed `cab_ext2` and `cab_int2` entries.
- [x] **Item 3 — PDF: Text wrapping + column widths** (`lib/pdf-spec.tsx`): Added `flexWrap: "wrap"` to `sRow`, `sRowAlt`, `kvRow`, `kvRowAlt`, `matrixRow`, `matrixRowAlt` styles. Door Schedule STYLE column flex widened 1.6 → 2.2 (Type narrowed 1.4 → 1.2 to compensate). No `numberOfLines` caps remained in data cells after Item 4b removal.
- [x] **Item 4 — PDF: Strip placeholder notes text** (`lib/pdf-spec.tsx`): Added `cleanNotes()` helper that returns `""` when value starts with "Auto-seeded from builder profile:". Applied to: `fg.notes` in `FinishHeaderStrip`, all four notes sections in `NotesPage`, `job_notes` in `RoomMatrixPage`, and `hasNotes` check in `renderSpecPDF`. Notes sections/boxes only render when `cleanNotes()` is non-empty.
- [x] **Item 5a — Form: Accessories header rename** (`components/ResidentialSpecClient.tsx`): "Rev-A-Shelf Accessories" label in Rooms tab → "Accessories".
- [x] **Item 5b — Form: Custom accessory notes field** (`components/ResidentialSpecClient.tsx`, `app/api/specs/[id]/save/route.ts`, `app/jobs/[id]/residential/[specId]/page.tsx`, `scripts/db-push.mjs`): When selected `acc_id` contains "custom" (case-insensitive), shows a free-text input below the row. Stored as `custom_note` on the accessory object. Saves to `room_accessories.notes` column (added `notes TEXT` column to db-push with `ADD COLUMN IF NOT EXISTS` guard). Round-trips on page load via AccRow type + page map update.
- [x] **Item 6 — Form: Trim callouts "Material" → "Notes"** (`components/ResidentialSpecClient.tsx`): Label renamed "Notes", placeholder updated to "Special conditions, stick counts, install notes...". DB field name (`material`) unchanged — no migration needed. Save payload key unchanged.

### Also fixed
- Stripped 135 null bytes from end of `components/ResidentialSpecClient.tsx` (pre-existing corruption from prior session that was causing `TS1127: Invalid character` errors). File now clean.

### Karl action required
- Run `node scripts/db-push.mjs` on staging to add `notes TEXT` column to `room_accessories` table (the `ADD COLUMN IF NOT EXISTS` guard makes it safe to re-run).

### Files changed
- `lib/pdf-spec.tsx` — Items 1, 2, 3, 4
- `components/ResidentialSpecClient.tsx` — Items 5a, 5b, 6 + null-byte cleanup
- `app/api/specs/[id]/save/route.ts` — Item 5b: AccessoryPayload type + INSERT with notes
- `app/jobs/[id]/residential/[specId]/page.tsx` — Item 5b: AccRow type + map includes custom_note
- `scripts/db-push.mjs` — Item 5b: room_accessories.notes column added

---

## Session: 2026-07-03 — Paint color catalog + type-ahead (agent)

**Selftest before:** 19 pass / 3 fail (pre-existing: $70k fields, .next/ TS types)
**Selftest after:** 19 pass / 3 fail (no regression)

### CURRENT LIST — all items completed [x]

- [x] **Item 1 — Rename "EXPRESS" → "SPEC" button** (`app/jobs/[id]/page.tsx`): Changed both Express badge spans (admin + non-admin sections) to "SPEC". Also restored truncated file from git HEAD (was 462 lines, git HEAD 467 lines).
- [x] **Item 2 — Import SW colors from Excel** (`scripts/import-sw-colors.mjs`): Reads `EXAMPLE DRAWINGS/Copy of SW-ColorSnap-...xlsx` via exceljs, writes `data/catalogs/paint_colors_sw.csv`. **Ran and confirmed: 1526 SW colors written.** Spot-check: SW0001=Mulberry Silk #94766c ✓
- [x] **Item 3 — Fetch BM colors from colornerd GitHub** (`scripts/import-bm-colors.mjs`): Script written and correct. **Could not run in sandbox (no internet access from Linux workspace — proxy blocks external URLs).** Karl must run `node scripts/import-bm-colors.mjs` locally to generate `data/catalogs/paint_colors_bm.csv`.
- [x] **Item 4 — paint_colors table in db-push.mjs**: Added `CREATE TABLE IF NOT EXISTS paint_colors` + 2 indexes (brand, GIN FTS on name+code) to `scripts/db-push.mjs`. Idempotent.
- [x] **Item 5 — sync-paint-colors.mjs**: Script reads both CSVs and upserts into `paint_colors` via ON CONFLICT (brand, code). Added `"sync-paint-colors"` to package.json scripts.
- [x] **Item 6 — Paint color search API** (`app/api/paint-colors/route.ts`): GET /api/paint-colors?q=&brand=. ILIKE search on name+code, up to 20 results, optional brand filter.
- [x] **Item 7 — Type-ahead in finish group color field** (`components/ResidentialSpecClient.tsx`): Added `PaintColorTypeAhead` component (live API fetch, 200ms debounce, min 2 chars, brand filter tabs ALL/BM/SW, swatch chips, selected chip + X to clear). `ColorPicker` now routes paint type to `PaintColorTypeAhead`, keeps stain/melamine as catalog-backed selects. Call site updated with `valueName` + `valueHex` props.

### Also fixed
- Restored `components/IntakeForm.tsx` and `components/JobFilesPanel.tsx` from git HEAD (were truncated at 366/199 lines; git HEAD has 371/205 lines).

### Blockers
**BLOCKER — BM colors CSV not generated**
- Question: No internet access in sandbox — `node scripts/import-bm-colors.mjs` couldn't reach github.com
- Interim assumption: Script is correct (colornerd JSON shape will be auto-detected from first object keys). Script logs field names found.
- Impact if wrong: BM CSV will be empty or wrongly mapped — check the logged "Using fields:" output when running
- **Karl action required:** Run `node scripts/import-bm-colors.mjs` locally before running sync-paint-colors

### Files changed
- `app/jobs/[id]/page.tsx` — "Express" → "SPEC" (x2), restored from git
- `components/IntakeForm.tsx` — restored from git (truncation fix)
- `components/JobFilesPanel.tsx` — restored from git (truncation fix)
- `scripts/import-sw-colors.mjs` — NEW
- `scripts/import-bm-colors.mjs` — NEW
- `data/catalogs/paint_colors_sw.csv` — NEW (1526 rows)
- `scripts/db-push.mjs` — paint_colors table + indexes added
- `scripts/sync-paint-colors.mjs` — NEW
- `package.json` — sync-paint-colors script added
- `app/api/paint-colors/route.ts` — NEW
- `components/ResidentialSpecClient.tsx` — PaintColorTypeAhead component, ColorPicker updated

### Run order for Karl
1. `node scripts/import-bm-colors.mjs` — generates BM CSV (needs internet)
2. `node scripts/db-push.mjs` — applies paint_colors schema
3. `node scripts/sync-paint-colors.mjs` — loads SW (1526) + BM colors into DB
4. `dev.bat` — start dev server and test the finish group color field type-ahead

---

## Session: 2026-07-02/03 — Overnight build run (agent)

**Selftest before:** 20 pass / 2 fail (same pre-existing failures)
**Selftest after:** 20 pass / 2 fail (no regression)

### Built

- [x] **Phase 1 — Schema additions** (`scripts/db-push.mjs`): `finish_groups.species` column, `finish_group_pulls` table, `room_trim` table, `spec_appliances` table. Karl must run `node scripts/db-push.mjs` to apply (sandbox had no Supabase network access)
- [x] **Phase 2a** — `MaterialsSubsection` removed from Finish Groups tab render. File kept, import kept, render removed
- [x] **Phase 2b** — PDF Builder field fixed: now shows `builder_company`, with `builder_name` as smaller Contact line
- [x] **Phase 2c** — Room matrix PDF cells fixed: now show zone/finish-notes text. "✓" if zone blank, blank if unassigned
- [x] **Phase 2d** — "Zone" renamed to "Finish Notes" in Rooms tab UI. DB column unchanged
- [x] **Phase 3a** — Species field on Finish Group card (visible for paint/stain only). Saved to `finish_groups.species`
- [x] **Phase 3c** — Pulls section in each Finish Group card. Multi-row. Save Pulls → `POST /api/specs/[id]/pulls`
- [x] **Phase 3d** — Trim callouts in each Room card. Type dropdown + Size + Material + LF. Save Trim → `POST /api/specs/[id]/trim`
- [x] **Phase 3e** — Appliances tab (new). Type/Mfr/Model/Room/Notes. Save → `POST /api/specs/[id]/appliances`. Also adds Appliances page to PDF when data present
- [x] **Phase 4 (PDF)** — Species in finish schedule, pulls section in right column, job notes box on Room Schedule page, appliances page added
- [x] **Fixed truncated files** — `package.json`, `db-push.mjs`, `builders/page.tsx`, `jobs/[id]/page.tsx`, `IntakeForm.tsx`, `JobFilesPanel.tsx` all restored from git HEAD (were cut off mid-line)

### Deferred / Needs Karl input

- **Phase 3b (Color Other dropdown)** — not built; existing PNT-CUSTOM/STN-CUSTOM path already handles this
- **PDF full reformat** (black header rows, ruling tables) — deferred; needs design session
- **Trim rollup in PDF** — data exists in spec-data; page position in PDF needs Karl's call
- **Save All integration for pulls/trim/appliances** — currently per-section save buttons; wire into saveAll if Karl wants one-click

### Files changed
- `scripts/db-push.mjs` — schema additions
- `package.json` — restored from git (was truncated)
- `lib/pdf-spec.tsx` — Builder fix, matrix cells, species, pulls section, appliances page, job notes box
- `lib/spec-data.ts` — fetches species, pulls, trim, appliances; returns in SpecPDFData
- `components/ResidentialSpecClient.tsx` — MaterialsSubsection removed, Species field, Pulls section, Trim section, Appliances tab, "Finish Notes" label
- `app/jobs/[id]/residential/[specId]/page.tsx` — loads and passes new props
- `app/api/specs/[id]/save/route.ts` — saves species
- `app/api/specs/[id]/pulls/route.ts` — NEW: GET+POST for finish_group_pulls
- `app/api/specs/[id]/trim/route.ts` — NEW: GET+POST for room_trim
- `app/api/specs/[id]/appliances/route.ts` — NEW: GET+POST for spec_appliances
- `app/admin/(protected)/builders/page.tsx` — restored from git (was truncated)
- `app/jobs/[id]/page.tsx` — restored from git (was truncated)
- `components/IntakeForm.tsx` — restored from git (was truncated)
- `components/JobFilesPanel.tsx` — restored from git (was truncated)

---

---

## FEATURE TRACK: Paint Color Catalog + Swatch + ESI Edgeband Matching

**Decision (2026-07-03):** Three linked features; build together as one track.

**Feature 1 — Complete color catalogs + type-ahead search:**
- Source full BM / SW / ML color lists with `name`, `code`, `hex_value` as CSVs
- Load into `paint_colors` table (brand, name, code, hex_value, active)
- UI: brand filter tabs → type name or code → dropdown narrows (ILIKE) → select → code auto-fills
- Replaces current partial catalog dropdowns

**Feature 2 — Color visual indicator (hex swatch chip):**
- Every color record stores `hex_value` (approximate — sourced from brand's published palette)
- Show 16×16px color chip next to color name in: dropdown, finish group card, spec PDF
- Solves "finishing dept doesn't know if Iron Ore is black or Lusty Dancer is pink" problem
- No extra data entry — comes from the catalog CSV

**Feature 3 — ESI edgeband matching library:**
- `edgeband_matches` table: `paint_brand, paint_code → esi_part_number, esi_description, notes`
- Admin page to manage matches (most colors won't have a match; build library over time)
- When finish group has a color selected and a match exists: show ESI part, offer to auto-fill edgeband field
- Eventually eliminates manual edgeband lookup

**Build order:**
1. Clarify brand names (BM confirmed; ML = ?; SW = Sherwin-Williams or not used?)
2. Source complete color CSVs with hex values for each brand
3. Schema: `paint_colors` table + `edgeband_matches` table
4. Type-ahead search UI + swatch chip
5. ESI match suggestion in edgeband field
6. Admin page for managing ESI matches

**Blockers:**
- Karl to confirm what "ML" brand is
- Need complete color CSVs (can source from brand websites or public datasets)

**Status:** Planned — not started. Do after current spec form bugs are fixed.

---

## FEATURE TRACK: Spec Templates / Builder Defaults

**Decision (2026-07-03):** Use a template library, not builder-level field defaults.

---

## CURRENT LIST — 2026-07-03

**Form fixes (from testing session):**
- [ ] Rename "EXPRE