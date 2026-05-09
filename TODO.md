# ACC Website — Implementation TODO

Living document. Phases track the May 2026 road map. Each phase is broken
into discrete steps small enough to ship as a single change. Items marked
**[KARL]** are blocked on Karl's input — **knock these out first to unblock
the longest autonomous runs**.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · ~~strike~~ decided against.

---

## ★ Recent shipments (2026-05-04 PM session)

- Cab Door full ingest: 39 edge details, 17 mitre patterns, 15 starter presets
- Sync-catalogs parser: free-text guard + numeric coercion
- Job file DELETE (admin-only, path-traversal-guarded)
- Builder profile auto-populate on new spec creation
- Phase 5 lifecycle state machine schema + 11/11 unit-tested transitions
- Spec form mobile pass (toolbar / tabs / finish rows / accessories)
- Admin password rotation script (`scripts/rotate-admin-pw.mjs`)

## ★ Recent shipments — autonomous run 2 (2026-05-04 PM)

- **Phase 9 admin library editor**: /admin/libraries — every catalog CSV editable inline, header-locked, auto re-runs sync-catalogs after save. Filter/search per library. Download CSV button.
- **Phase 5 lifecycle UI**: state badge + advance button + re-spin (with required reason) + audit timeline. Mounted on spec form toolbar via <LifecyclePanel>.
- **Phase 3 spec+drawings combine**: /api/specs/[id]/combine merges fresh spec PDF with most-recent drawings PDF via pdf-lib. "Spec + Drawings" button in spec toolbar.
- **Phase 2 Excel render**: /api/specs/[id]/excel populates the Artifex template with spec data via exceljs. "Excel" button in spec toolbar. Cell map documented in data/templates/README.md.
- **Title block in code (Option A)**: lib/pdf-spec.tsx Header rewritten as a CV-style title block — ACC brand + page-code stage + project, Job#/PM/Builder/Date/page-of-pages, ACC address strip, JOB # / JOB NOTES banner. Repeats fixed at top of every page.
- **DocuSign approval flow**: schema + lib/approvals.ts state machine (DRAFT→SENT→VIEWED→SIGNED→COMPLETED + DECLINED/VOIDED/EXPIRED terminals), webhook stub at /api/docusign/webhook (503 until DOCUSIGN_INTEGRATION_KEY env set). Auto-advances spec lifecycle on COMPLETED.
- **Phase 6 engineering view**: 'engineer' role added (admin/user/engineer); /engineering/[specId] page with lifecycle controls + JobFilesPanel + checklist.
- **Mobile camera capture**: JobFilesPanel "Take photo" button when kind=site (uses native camera via accept=image/* capture=environment).
- **Self-test extended**: now 6 PASS + 5 SKIP (DB-pending) + approvals 13/13 + lifecycle 11/11.
- **package.json scripts**: `npm run selftest`, `npm run rotate-admin-pw "<password>"`.

## ★ Karl's answers (2026-05-04 PM)

- Excel template: `Artifex Spec Sheet.xlsx` (in EXAMPLE DRAWINGS) — title block needs ACC update; needs to stay 10-year-old-easy
- Title block: copy from `Premier- Lot 4 25.12.5 REDLINES.pdf` — open question: re-render from scratch or overlay onto a saved blank-with-title-block PDF
- Admin password: `Summer2026!`
- ML Campbell: option (a) — coating system, color from SW/BM books; ACC prefers ML Campbell colors when available
- Cabinet Vision integration: option (c) — link to drawings, no manual enumeration; defer dynamic CV reports
- Approval flow: DocuSign — combine most-recent quote + most-recent drawings + residential disclosure into one envelope, send to client

## ★ Karl's Inputs Queue (UNBLOCK BATCH)

If Karl knocks these out in order, several phases below open up at once.

1. ~~**[KARL]** Drop Excel template in `EXAMPLE DRAWINGS/`~~ ✓ DONE — Artifex Spec Sheet.xlsx (the old version is fine).
   *Unblocks: Phase 2-Excel, title block design, the "real output" deliverable.*
2. ~~**[KARL]** Share or describe the CV drawing title block~~ ✓ DONE — use LOT 4 PROJECT (Premier- Lot 4 25.12.5 REDLINES.pdf) (logo position, fields,
   fonts) so the spec output matches it visually.
   *Unblocks: title block alignment in PDF + Excel.*
3. **[KARL]** Provide the 10 ACC named in-house stain mixes (names + base colors).
   *Unblocks: real stain dropdown.*
4. ~~**[KARL]** Provide ML Campbell paint cards/swatches~~ ✓ ANSWERED (a) — ML is the coating system; color comes from SW/BM books. ACC prefers ML Campbell colors when available. (or confirm SW/BM cross-ref
   is enough; ML is just the coating system).
   *Unblocks: real paint dropdown.*
5. **[KARL]** Confirm Tafisa color list per line (Alto / Crystalite / Isola / etc.).
   Fan deck or rep PDF works.
   *Unblocks: real melamine dropdown for Tafisa.*
6. **[KARL]** Confirm builder defaults for Atlas, Bush Legacy, Premier, Stancraft,
   Cobalt, Bar 17, RSB (carcass / drawer box / pull / accessories most-typical).
   *Unblocks: builder-profile auto-populate on new spec.*
7. **[KARL]** Pick `accspec.net` purchase + run Cloudflare Tunnel install.
   *Unblocks: actual launch.*
8. ~~**[KARL]** Rotate bootstrap admin password~~ ✓ ANSWERED — `Summer2026!`. Run `node scripts/rotate-admin-pw.mjs "Summer2026!"`.
   *Unblocks: safe-to-launch state.*
9. ~~**[KARL]** Decide on Cabinet Vision integration~~ ✓ ANSWERED (c) — link to drawings PDF, no manual cabinet enumeration. Future: dynamic CV reports (flagged for later).: PM types cabinets manually
   forever, OR CV exports XML/CSV that we import?
   *Unblocks: cabinet line-item workflow (currently manual).*
10. ~~**[KARL]** Approval flow choice~~ ✓ ANSWERED — DocuSign envelope: combine most-recent quote + most-recent drawings + residential disclosure. Send to client for signature.: online (client clicks unique link) vs offline
    (PM emails PDF, marks approved manually)?
    *Unblocks: Phase 5 lifecycle gates.*

---

## ~~Pre-launch Checklist (accspec.net via Cloudflare Tunnel)~~ — SUPERSEDED

> **Archived 2026-05-09.** This checklist was for the original self-hosted plan (advserver + Cloudflare Tunnel + accspec.net). The deployment decision changed to Vercel + advancedcabinets.org (2026-05-06). The site has been live at `www.advancedcabinets.org` since 2026-05-08. This section is kept for historical reference only.

---

## Phase 0 — Foundation (DONE)

All checked off. See Decisions Log for context.

---

## Phase 1 — $70k spec form fix (DONE)

All checked off. The silent-default failure mode is dead.

---

## Phase 1B — Multi-finish, Moldings, Notes (DONE)

All checked off.

---

## Phase 1B+ — Auth + Role system (DONE)

All checked off.

---

## Phase 2 — Real output (PARTIAL)

### What's done

- [x] PDF generator with C/F/H/A/M/N page numbering
- [x] /api/specs/[id]/generate (POST renders, GET streams)
- [x] Generate Spec button (auto-saves first)

### Phase 2-Excel — replaces PDF as primary output

Steps:
1. ~~**[KARL]** Drop the old Excel template~~ ✓ DONE — `Artifex Spec Sheet.xlsx` is in EXAMPLE DRAWINGS
2. Move the template to `data/templates/spec-template.xlsx` (final home).
3. Analyze: identify static title-block cells, dynamic cells (per-finish, per-room),
   merged regions, conditional formatting.
4. Document the cell map in `data/templates/spec-template-cellmap.md` so the
   render code is auditable.
5. **[KARL]** Confirm any cells should remain Karl-editable post-generation (the
   "click to edit" flow needs to know which cells are derived vs. free).
6. `npm install exceljs` + restart server.
7. Add `lib/xlsx-spec.ts` — opens the template, fills cells from spec data, saves.
8. Add `/api/specs/[id]/excel` POST endpoint (mirrors generate endpoint shape).
9. Add `/api/specs/[id]/excel?file=...` GET to stream a saved xlsx.
10. Update spec UI: "Generate Spec" button now offers "Excel" option (or
    replaces PDF entirely — TBD with Karl).
11. Re-import path: PM edits Excel, drops back into the file upload area as
    kind="drawings" (or new kind "spec_edited"), import endpoint reads cells
    back into DB. **[KARL]** decide: import vs. one-shot snapshot.
12. Versioning: every export and every import = new row in `spec_archives`.

### Phase 2-Title-Block — alignment

1. ~~**[KARL]** Provide a CV drawing with title block~~ ✓ DONE — use Premier- Lot 4 25.12.5 REDLINES.pdf
2. Match the title block in `lib/pdf-spec.tsx` (logo placement, fields, fonts).
3. Apply same title block to the Excel template title row(s).
4. Make title block parameterized: job_id, client_name, site_address, pm,
   page_code (C.1, F.1, etc.), date, version.

---

## Phase 3a — Job-level file uploads (DONE)

### What's done

- [x] /api/jobs/[id]/files POST + GET
- [x] JobFilesPanel component on /jobs/[id]
- [x] Storage at data/jobs/{job_id}/files/{kind}/{ts}-{filename}
- [x] List grouped by kind (plans / appliances / site / drawings)

### Polish

- [x] DELETE endpoint (admin-only) — shipped 2026-05-04
- [ ] Image thumbnails for site photos (sharp library or browser-native preview).
- [ ] Mobile-friendly camera capture button (`<input type=file accept=image/*;capture=environment>`).
- [ ] File search / filter when one kind has many entries.
- [ ] Show uploader name (requires audit log; tied to Phase 4).

---

## Phase 3 — Spec + Drawings combine (NOT STARTED)

The "PDF saves to the server and combines with the most recent drawings" feature.

Steps:
1. `npm install pdf-lib` + restart.
2. Add `lib/pdf-merge.ts`:
   - `mergePDFs(specPath: string, drawingsPath: string, outputPath: string)` —
     uses pdf-lib `PDFDocument.create()` + `copyPages()`.
   - Apply page numbering at merge time so combined output reads C.1 → F.x →
     H.1 → A.1 → M.1 → N.1 → D.1 → D.2 …
3. Add /api/specs/[id]/combine endpoint:
   - Renders fresh spec PDF (or uses latest from data/jobs/.../specs/).
   - Finds latest `drawings` upload from data/jobs/.../files/drawings/.
   - Calls mergePDFs.
   - Saves to data/jobs/.../combined/{stage}-{ts}.pdf.
   - Returns downloadUrl.
4. Add "Generate Combined PDF" button in spec toolbar (next to Generate Spec).
   Disabled if no drawings uploaded.
5. Mark each combined PDF with stage: `pm_release` (default) or `engineered`
   (when WO# is set — Phase 6).
6. Test with real drawings — Karl uploads a CV PDF, clicks combine, verifies
   spec pages then drawing pages all in one document.

---

## Phase 4 — Supabase migration (NOT STARTED)

Karl is comfortable with this stack from prior sites. Trigger when scale
demands it (multiple PMs editing simultaneously, off-network access).

Steps:
1. **[KARL]** Create Supabase project, share URL + anon key.
2. `npm install @supabase/supabase-js @supabase/ssr` + restart.
3. Add `lib/supabase.ts` (server + client SSR helpers).
4. Migrate `builder_accounts` → Supabase `auth.users` + `user_metadata.role`.
5. Migrate `builder_sessions` → Supabase session cookie pattern.
6. Update /api/auth/login to call `supabase.auth.signInWithPassword`.
7. Update lib/auth.ts helpers to read Supabase session.
8. Migrate SQLite tables → Supabase Postgres:
   - jobs, residential_specs, finish_groups, rooms, room_finishes,
     finish_moldings, finish_molding_rooms, room_accessories,
     cabinet_line_items, door_specs, door_line_items, trim_specs,
     spec_archives.
   - Use Supabase migrations (`supabase db push`) so schema is version-controlled.
9. Move file storage: data/jobs/{id}/files/* → Cloudflare R2 bucket.
10. Update file upload/download endpoints to S3-style API (R2 is S3-compatible).
11. Add audit log table: `audit_log(user_id, action, target_id, before, after, at, ip)`.
12. Wire audit log into save endpoint, generate endpoint, file upload endpoint.
13. Add `/admin/audit` viewer (requires role=admin).
14. **[KARL]** Decide: deploy to Vercel or stay on advserver via tunnel?
    Vercel needs the file storage migration; advserver doesn't.
15. If Vercel: deploy, point accspec.net DNS at Vercel, test.
16. Sunset SQLite + local file storage.

---

## Phase 5 — Lifecycle & approval gates (NOT STARTED)

Steps:
1. Add `residential_specs.status` enum migration: DRAFT, CLIENT_APPROVED,
   RELEASED_TO_ENG, ENGINEERED, RELEASED_TO_SHOP.
2. Status state machine in `lib/spec-lifecycle.ts` — defines allowed transitions.
3. Add status badge + transition buttons on spec page.
4. Each transition writes to audit log and creates a versioned snapshot.
5. **[KARL]** Choose approval flow:
   - **Online**: Client gets unique link, hits /approve/[token], sees spec PDF,
     clicks Approve (captures name, IP, timestamp).
   - **Offline**: PM emails PDF, client signs/replies, PM clicks "Mark Approved"
     and uploads signed PDF as proof.
6. Build the chosen flow.
7. Lock spec edits when status >= RELEASED_TO_ENG (engineers can override per
   their role — tied to Phase 6).
8. PDF/Excel generation gated on status >= CLIENT_APPROVED (no rendering of
   "draft" specs to prevent shop confusion).

---

## Phase 6 — Engineering view (NOT STARTED)

Per Karl's Option B, engineers CAN edit the spec.

Steps:
1. **[KARL]** Create at least one user with role='engineer' (currently we have
   admin + user; need to add engineer as a third role, or use 'user' with
   permission to edit a RELEASED_TO_ENG spec).
2. Add `engineer` role to `builder_accounts.role` enum (or use 'user' role and
   gate by status). Recommend: add engineer role for clarity.
3. Update lib/auth.ts requireRole to accept 'engineer'.
4. Build /engineering/[specId] page: read-mostly view + drawing upload (engineered
   stage) + WO# field + send-back button.
5. "Send Back to PM" action: opens modal requiring reason text, transitions
   spec back to DRAFT, notifies PM (email + in-app).
6. "Mark Engineered" action: transitions to ENGINEERED, captures WO#,
   triggers combined PDF re-generation.
7. Add `release_grouping` field on spec ('by_color' | 'by_room' | 'custom').
   **[KARL]** confirm default — currently leaning 'by_color' but Karl wasn't sure.
8. Show diff badge per finish group when engineer edits something the PM
   originally set. ("Engineering edited 2026-05-05" tag.)

---

## Phase 7 — Mobile progressive intake (NOT STARTED)

Steps:
1. Audit current spec form responsiveness (only 4 instances of sm:/md:/lg: —
   not mobile-first).
2. Identify intake-shaped tabs (job info, rooms, finishes, notes) vs detail-shaped
   (line items, edgeband, accessory part numbers).
3. Add `<meta name="viewport">` if not already present.
4. Rewrite room form for phone width: stack fields, larger touch targets.
5. Rewrite finish-group form for phone width: collapse the 6 dropdowns into
   a step-by-step accordion or wizard.
6. Implement mobile site-photo capture: button uses `<input type=file
   accept="image/*" capture="environment">` to invoke phone camera directly.
7. Ensure file uploads work via cellular (no localhost dev quirks blocking).
8. Add "open on desktop" friendly message for line-item entry, edgeband review,
   accessory SKU lookup.

---

## Phase 8 — Excel ↔ DB two-way sync (PARTIALLY COVERED BY PHASE 2-EXCEL)

If Phase 2-Excel covers export only, Phase 8 adds the import/diff flow:

1. Re-import endpoint: parse uploaded xlsx via exceljs.
2. Diff against current DB state — per-cell.
3. UI: present diff in a side-by-side view.
4. PM picks winner per row (or "accept all from Excel" / "discard all").
5. Apply winner picks to DB.
6. Save creates a new version snapshot.
7. **[KARL]** Decide: which cells should be importable, which are derived
   (read-only on import — show warning if changed)?

---

## Phase 9 — Admin / library editor (NOT STARTED)

Steps:
1. Build /admin/libraries page: list of all CSV files in data/catalogs/.
2. Per-file: download, upload (replaces), inline edit (modal with table view).
3. Validation: parse uploaded CSV against expected schema; reject mismatch.
4. After save: trigger sync-catalogs.mjs so JSON regenerates.
5. Activity log per library edit.

---

## Phase 10 — Re-enable Express Wizard (FUTURE)

When ACC actually becomes a catalog shop. Out of current scope.

1. **[KARL]** Decide when to flip `EXPRESS_ENABLED=true`.
2. Pull builder_accounts into Supabase under role='builder'.
3. Reconnect Express to live spec model (currently SB36-style families are
   disconnected from new schema).
4. Re-enable navigation links to /express/login.

---

## Catalog data backlog

### Auto-ingested (DONE)

- [x] Cab Door inside profiles: 51 (P-1 through P-133)
- [x] Cab Door panels: 51 (Pnl-XX, categorized std_raised / applied_moulding / reverse_raised)

### Karl-provided (BLOCKED)

- [ ] **[KARL]** ML Campbell paint catalog (real codes, or confirm SW/BM cross-ref is enough).
- [ ] **[KARL]** ML Campbell stain catalog.
- [ ] **[KARL]** ACC's 10 named in-house stain mixes (names + base colors).
- [ ] **[KARL]** Tafisa color names per line (Alto, Crystalite, Isola, Karisma,
      Smoothwood, Urbania, Brava, Feria, Viva, Materia).
- [ ] **[KARL]** Egger 26+ full 12-decor list (have 4 verified).
- [ ] **[KARL]** Stevenswood full catalog beyond ~25 visible on landing.
- [ ] **[KARL]** Real builder defaults: Atlas / Bush Legacy / Premier / Stancraft /
      Cobalt / Bar 17 / RSB Customs.

### Auto-ingest pending

- [x] Cab Door edge details — 39 rows curated 2026-05-04 — same pypdf approach as
      profiles + panels.
- [x] Cab Door mitre patterns — 17 rows curated 2026-05-04
- [x] Cab Door named presets — 15 rows seeded 2026-05-04 (full showcase ingest pending)

---

## UX polish backlog

- [x] Spec form mobile pass — toolbar, tabs, finish/accessory rows shipped 2026-05-04
- [ ] Builder Account section header → "User Account" form section
      (already title-fixed, but section says "New Builder Account").
- [ ] "+ Add Finish" button on the Rooms tab is small — make it more prominent.
- [ ] Generate Spec output should auto-update if the spec hasn't been saved yet
      (currently auto-saves first, but no visual confirmation).
- [ ] Show "uploaded by [user]" on each job file (requires audit log; Phase 4).
- [ ] Spec PDF: add page footer with current version number / date stamp.

---

## Sync-catalogs parser improvements

- [x] Stop auto-arraying free-text fields — shipped 2026-05-04
      Whitelist which columns can be arrays (e.g., `*_options`, `_compat`).
- [x] Coerce numeric columns to numbers — shipped 2026-05-04
- [ ] Validate against expected column headers; warn on missing/extra columns.

---

## Known issues / gotchas

- **`Edit`/`Write` tools occasionally truncate files** when overwriting with
  shorter content. Workaround: bash heredocs for non-trivial changes.
- **`better-sqlite3` is Windows-built locally** — can't run from Linux sandbox
  or Vercel without swap to `libsql/turso`.
- **`window.open` popup-blocked** when Generate Spec fires from JS automation;
  real users are unaffected.
- **CSV parser auto-arrays semicolon values** — code must handle string OR array
  for fields that might contain either form.
- **Empty SQL `IN ()`** — every dynamic-IN query is gated on `.length` first.
- **`acc-jobs.db` is locked while dev server runs** — schema edits via direct
  node:sqlite from outside fail with disk I/O error. Fix: changes go through
  `lib/db.ts` migrations, run on next server boot.

---

## Decisions Log (append-only)

**2026-05-04** — Express Wizard goes behind feature flag, not deleted. ACC isn't
a catalog shop yet. Spec authoring is the primary intake path.

**2026-05-04** — Door styles come from Cab Door (mycabdoor.com). Catalog uses
usage-group matching (profile.usage_group must equal panel.usage_group).
Schema is profile + panel + edge + mitre + preset, not a flat list.

**2026-05-04** — Engineers can edit the spec (Option B). Audit log records who
changed what. Real-time edits enable "PM driving while engineer keeps work
moving."

**2026-05-04** — Carcass canon: Hardrock Maple PB, PF Plywood Maple, PF Plywood
Birch, White PB, Other. Drawer box: Doweled Butt-Joint PF Ply, Buy-out
Dovetail, Other. **No default — PM must pick.** This is the literal $70k fix.

**2026-05-04** — Rooms = free-form with autocomplete suggestions, not a forced
list. Multi-finish-aware names like "Kitchen Perimeter" / "Kitchen Island"
nudge PMs to think about zones.

**2026-05-04** — Moldings split into types (finite, on spec) vs profiles
(catalog, mostly TBD). Default behavior: molding inherits material from the
room's finish.

**2026-05-04** — Page numbering scheme: C / F / H / A / M / N / D.

**2026-05-04** — accspec.net via Cloudflare Tunnel from advserver is the launch
target (Option A). Future: Vercel + Supabase + R2 (Option C). Karl's done all
three of those before.

**2026-05-04** — Bootstrap admin = residential@advancedcabinets.net / 1234,
created automatically on first boot if no admin exists. Rotate before launch.

**2026-05-04** — Excel is the real output target. PDF was a stepping stone.
Once Karl's engineer hands over the formatted template, render via exceljs
matching the title block of CV drawings.

**2026-05-04** — Authentication is now role-based via builder_accounts.role
('admin' | 'user'). Legacy admin-password gate retired. Bootstrap admin
auto-seeds on first DB boot. Last-admin protection prevents demote/delete
of the only active admin.

**2026-05-04** — Cab Door inside profiles + panels auto-extracted from the
2024 Patterns Guide PDF via pypdf. 51 + 51 entries. Edge details, mitre
patterns, and named presets still placeholder.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      