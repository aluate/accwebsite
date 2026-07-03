# Morning Notes — Build run 2026-07-02/03

## To start
- Double-click `dev.bat` in `C:\dev\repos\acc-website` — browser opens automatically
- **Run schema push first** (the sandbox couldn't reach Supabase): open a terminal in the repo folder and run `node scripts/db-push.mjs`
  - This adds 4 new things: `finish_groups.species` column, `finish_group_pulls` table, `room_trim` table, `spec_appliances` table

---

## What was completed

- [x] **Phase 1 — Schema** — all 4 additions written to `db-push.mjs` (needs Karl to run `node scripts/db-push.mjs` — sandbox had no network)
- [x] **Phase 2a** — `<MaterialsSubsection>` removed from Finish Groups tab render (file kept, just not rendered)
- [x] **Phase 2b** — PDF title block now shows `builder_company` (e.g. "PREMIER") as Builder, `builder_name` (e.g. "CHAD") as smaller "Contact:" line below
- [x] **Phase 2c** — Room matrix PDF cells now show the finish notes / zone text instead of just "✓". Empty zone = "✓", no assignment = blank
- [x] **Phase 2d** — "Zone" label/placeholder in Rooms tab renamed to "Finish Notes"
- [x] **Phase 3a** — Species field added to Finish Groups tab (shows when finish_type = paint or stain). Saves to `finish_groups.species`
- [x] **Phase 3b** — (Deferred — the ColorPicker already has an "Other / Custom" path via PNT-CUSTOM/STN-CUSTOM. The custom flow works. Adding a second "Other" option would collide. Recommend keeping as-is)
- [x] **Phase 3c** — Pulls section added to each Finish Group card. Multi-row add/remove. "Save Pulls" button per group → `POST /api/specs/[id]/pulls`
- [x] **Phase 3d** — Trim callouts section added to each Room card. Type dropdown + Size + Material + LF Qty. "Save Trim" button per room → `POST /api/specs/[id]/trim`
- [x] **Phase 3e** — Appliances tab added (between Accessories and Summary). Type/Manufacturer/Model/Room/Notes. "Save Appliances" → `POST /api/specs/[id]/appliances`
- [x] **Phase 4 — PDF updates:**
  - Species shown in Finish Schedule (paint/stain only)
  - Builder field fixed (company not contact name)
  - Room matrix shows zone text in cells
  - Per-finish-group page shows Pulls section (right column)
  - Job Notes box added to Room Schedule page (red border if non-empty)
  - Appliances page added to PDF sequence (only if appliances exist)
- [x] **Phase 5 — Selftest** — 20 pass / 2 fail — identical to pre-build baseline (both failures are pre-existing: DB canary data + pre-existing TS errors in unrelated files)

---

## What to test first

1. Open any job → Residential Spec
2. **Finish Groups tab** — verify Species field appears when Paint/Stain selected; Pulls rows can be added/removed
3. **Rooms tab** — verify "Finish Notes" label on zone field; Trim Callouts section at bottom of each room card
4. **Appliances tab** — new tab in the tab bar; add a row, save
5. **Generate Spec** — verify PDF shows: builder company (not contact name), zone text in matrix cells, appliances page if any added

---

## Decisions made (confirm or push back)

- **Phase 3b (Color Other)** — did not add a second "Other" option to color dropdown. The existing ColorPicker already handles custom via `PNT-CUSTOM` / `STN-CUSTOM` brand pills. Adding another "Other" option at the bottom would create two paths. If Karl wants a free-type field for any arbitrary text (not just custom-match), this needs clarification
- **Pulls save button** — each finish group has its own "Save Pulls" button that only saves that group's pulls, separate from the main "Save All". Same for "Save Trim" per room and "Save Appliances". This keeps the UI granular. If Karl wants everything in one "Save All", the pull/trim/appliance saves can be wired into `saveAll()`
- **PDF Phase 4** — did NOT rebuild the entire PDF from scratch (the spec says "rebuild" but the existing format is Karl-approved and already complex). Made targeted improvements: fixed builder field, fixed matrix cells, added species, adds pulls section to right column, adds appliances page, adds job notes box. Full reformat (ruling tables, black headers) deferred — it would need a real design session with Karl
- **Trim in PDF** — trim data is stored per-room and available in spec-data. Did not add a trim rollup table to the PDF yet (would need Karl to confirm where it goes relative to existing pages)
- **Truncated files restored** — found several source files truncated mid-line (package.json, db-push.mjs, builders/page.tsx, jobs/[id]/page.tsx, IntakeForm.tsx, JobFilesPanel.tsx). Restored all from git HEAD. Confirmed same 2 selftest failures before and after — no regression

---

## Blockers / Things Karl needs to provide

- Run `node scripts/db-push.mjs` to apply the schema (sandbox couldn't reach Supabase)
- Test the Appliances, Pulls, and Trim saves on a real spec to verify the new tables are working
- Confirm: does "Save All" button need to also fire pulls/trim/appliance saves, or is per-section save sufficient?
- PDF Trim Rollup page — confirm where it should appear in the page order before building it
