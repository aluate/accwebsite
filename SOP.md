# ACC Website — System SOP

> **Audience:** Claude (primary reference), Karl (accuracy review), eventually developer/staff handoff.
> **Last updated:** 2026-07-18. Reflects production state post-session `2026-07-18-esig`.
> **How to use this doc:** Read the Status Legend, then jump to the section relevant to the task.
> Living document — update after every session that changes feature status.

---

## Status Legend

| Badge | Meaning |
|-------|---------|
| ✅ Live | Built, deployed, confirmed working in production |
| 🟡 Built/Unverified | Code exists and deploys, but end-to-end not recently confirmed |
| 🔶 Partial | Scaffolded or partially functional; gaps noted |
| ❌ Missing | Not built yet |
| 🔒 Gated | Built but deliberately held — flip when staff go-live signal received |
| 📋 [KARL] | Blocked on Karl's data input or manual action |

---

## 1. Platform & Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js 16 App Router + Turbopack | File-based routing; server components throughout |
| Database | Supabase Postgres | PgBouncer pooler port 6543, `prepare: false` required |
| Hosting | Vercel (two projects) | `accwebsite` = beta; `accwebsite-cd58` = prod at www.advancedcabinets.org |
| Auth | Cookie-based (`acc_builder_session`), bcrypt 12 rounds | 30-day TTL |
| Email | Gmail SMTP via `lib/mailer.ts` | `residentialacc2@gmail.com`; vars: `GMAIL_USER` + `GMAIL_APP_PASSWORD` |
| PDF | `@react-pdf/renderer` (spec) + `pdf-lib` (combine) | Spec PDF works; combine needs drawings to exist |
| Excel | `exceljs` | Opens `data/templates/spec-template.xlsx`, fills cells |
| Catalogs | CSV → JSON via `scripts/sync-catalogs.mjs` | Runs on prebuild; `data/catalogs/*.csv` is source of truth |
| Storage | Supabase Storage (job files) + Vercel read-only FS (catalogs) | Catalogs require redeploy to update on Vercel |

### Branch / Deploy Model

- **`main`** = production. Both Vercel projects watch `main`. Do not commit directly — use `/tmp/acc-repo` clone and push via GitHub token in `secrets.txt`.
- **`staging`** = AGENTS.md says this should exist, but in practice work has gone to `main` throughout. Resolve before staff go-live.
- **Schema changes**: `scripts/db-push.mjs` uses `CREATE TABLE IF NOT EXISTS` throughout. Runs as part of every Vercel deploy (`npm run db:push && npm run build`). Idempotent.
- **NTFS truncation bug** (CRITICAL, permanent constraint): Files written via Edit/Write tools directly to `C:\dev\repos\acc-website` are silently truncated. ALL file writes must go through bash at `/tmp/acc-repo`, then pushed via git. Never use the Edit or Write tool on the mounted NTFS repo.

---

## 2. Roles & Access

| Role | Auth surface | What they can do |
|------|-------------|-----------------|
| `admin` / `karl` | `/login` | Everything. Admin panel at `/admin`. |
| `pm` (user) | `/login` | Jobs, specs, schedule, punch, warranty, file uploads, send-bid/contract, invoices. Cannot access `/admin`. |
| `engineer` | `/login` | `/engineering/[specId]` lifecycle controls + file panel + checklist. Read-only on most job data. |
| `installer` | `/login` | `/installer` only. Sees only jobs assigned to their crew. Cannot access `/schedule` or `/jobs/[id]`. |
| `portal` | `/portal/login` | Builder/client portal. Separate auth (`portal_sessions`). See Section 8. |

### Account Bootstrap

- **Existing admin accounts**: `residential@advancedcabinets.net` and `joshl@advancedcabinets.net` (both role: admin, temp pw: `Acc2026!`).
- **Password rotation**: `node scripts/rotate-admin-pw.mjs "NewPassword"`.
- **Create new accounts**: Via `/admin/builders` (internal builder accounts page).
- **Engineer accounts**: Schema + UI ready; no accounts created yet. [KARL: create when engineers are ready to use the system]
- **Installer accounts**: Create via `/admin/builders`, set role = `installer`. Each installer sees events where their email is in `event_crew`.
- **PM accounts**: Create via `/admin/builders`, set role = `pm`.

---

## 3. Feature Status Map

### 3.1 Core Job Management

| Feature | Status | Route | Notes |
|---------|--------|-------|-------|
| Job creation | ✅ Live | `/jobs/new` | `IntakeForm` component; links builder company (builders table) |
| Job list / hub | ✅ Live | `/jobs/[id]` | Central tab view: Overview, Files, Schedule, Punch, Warranty, Change Orders, Invoices |
| Job edit | ✅ Live | `/jobs/[id]/edit` | Edits job metadata |
| PM hours tracking | ✅ Live | `/jobs/pm-hours` | Time entries per PM per job; `/api/pm-hours` |
| Global search | ✅ Live | `/search` | 250ms debounce; searches jobs + specs simultaneously |
| Gate check-in | ✅ Live | `/api/jobs/[id]/gate-checkin` | `gate_checkins` table; records who entered gate + timestamp |

### 3.2 Residential Spec Form ($70k Fix)

| Feature | Status | Notes |
|---------|--------|-------|
| Finish groups (multi-FG) | ✅ Live | FG per spec; $70k columns (carcass/drawer/edgeband) forced non-null |
| Rooms + room-finish junction | ✅ Live | Multi-finish per room via `room_finishes` m2m |
| Accessory picker | ✅ Live | 3-step: Type → Size → Item dropdowns; per-room |
| Pulls | ✅ Live | Per-FG pull selection from catalog |
| Trim | ✅ Live | Per-room trim via `room_trim` table |
| Appliances | ✅ Live | Per-spec appliance notes via `spec_appliances` |
| Hardware | ✅ Live | Per-FG hardware via `spec_hardware` |
| Species | ✅ Live | Saved to `residential_specs.species` |
| Lifecycle state machine | ✅ Live | DRAFT → CLIENT_APPROVED → RELEASED_TO_ENG → ENGINEERED → RELEASED_TO_SHOP |
| Lifecycle UI (advance + re-spin) | ✅ Live | `LifecyclePanel` component; re-spin requires reason |
| PDF generation | ✅ Live | `/api/specs/[id]/generate`; C/F/H/A/M/N page sections |
| Excel generation | ✅ Live | `/api/specs/[id]/excel`; populates `data/templates/spec-template.xlsx` |
| Combine PDF (spec + drawings) | 🔶 Partial | `/api/specs/[id]/combine` exists; returns 501 if no drawings uploaded yet |
| Color swatch chips | ✅ Live | Hex swatches from `paint_colors` table; shown in FG cards + PDF |
| ESI edgeband auto-suggest | ✅ Live | Fires when color selected + match exists in `edgeband_matches` table |
| Stain color dropdown | 🔶 Partial | Free-text fallback; no stain catalog loaded yet. **[KARL: provide 10 ACC stain mixes]** |
| Spec listing page | 🟡 Built/Unverified | `/jobs/[id]/residential` — needs re-verification |
| React hydration warning | 🔶 Partial | Pre-existing #418 on spec page load — cosmetic only, no functional impact |
| E-sig / client signoff | ✅ Live | `/signoff/[token]` canvas sig; "Send for Signoff" on job page; `client_signoffs` table |

### 3.3 Schedule

| Feature | Status | Notes |
|---------|--------|-------|
| Calendar wall | ✅ Live | `/schedule` — week view with delivery/shop/install/milestone bars |
| Drag to reschedule | ✅ Live | `handleDrop()` in `ScheduleWallClient`; PATCH `/api/schedule/events/[id]` |
| Multi-crew assignment | ✅ Live | `event_crew` junction table; multi-select checkboxes; crew names on bars |
| Conflict detection | ✅ Live | ⚠ badge for double-booking + same-day delivery conflicts |
| Saturday drag confirmation | ✅ Live | Modal confirmation before placing event on Saturday |
| Admin schedule queue | ✅ Live | `/admin/schedule` — change requests, ready-to-schedule queue |
| PTO management | ✅ Live | `/api/schedule/pto` |
| Phase labels | ✅ Live | `/api/schedule/phase-labels` |
| Schedule verify | ✅ Live | `/schedule/verify` — last 12 Mondays; event count + Verify/Un-verify per week |
| Job schedule tab | ✅ Live | `/jobs/[id]/schedule` — `PhaseIntakeClient` for creating job events |
| Estimate → schedule bridge | ✅ Live | Estimate hours pre-fill install duration |

### 3.4 Installer Portal

| Feature | Status | Notes |
|---------|--------|-------|
| Installer dashboard | ✅ Live | `/installer` — filters to crew's assigned jobs only (by email) |
| Installer job detail | ✅ Live | `/installer/jobs/[id]` — Google Maps address, install drawings, punch list |
| Access block | ✅ Live | Installer role redirected from `/schedule` → `/installer`, from `/jobs/[id]` → `/installer/jobs/[id]` |
| Install drawings section | ✅ Live | Kind = `14_install_drawings` shown on installer detail |

### 3.5 Builder Portal (Client-Facing)

| Feature | Status | Notes |
|---------|--------|-------|
| Portal login | ✅ Live | `/portal/login`; separate `portal_sessions` auth |
| Job list | ✅ Live | `/portal/jobs` — shows jobs linked to builder's portal account |
| Job detail | ✅ Live | `/portal/jobs/[id]` — files, status, required inputs |
| File downloads | ✅ Live | Builder can download files uploaded by PM |
| Change requests | ✅ Live | `/api/portal/jobs/[id]/change-request` |
| Drawing comments | ✅ Live | `/api/portal/jobs/[id]/drawing-comments` |
| Portal account admin | ✅ Live | `/admin/portal-accounts` — create/manage builder portal logins |
| Builder companies CRM | ✅ Live | `/admin/builder-companies`; `builders` table |

### 3.6 Punch List & Warranty

| Feature | Status | Notes |
|---------|--------|-------|
| Punch list on job | ✅ Live | `PunchListPanel` — add item, photo upload, mark done, grouped by room, PM/installer views |
| Global punch list | ✅ Live | `/punch` — all open punch items across jobs |
| Warranty panel on job | ✅ Live | `WarrantyPanel` — log warranty claims per job |
| Global warranty list | ✅ Live | `/warranty` — all open warranty items |

### 3.7 Estimating & Billing

| Feature | Status | Notes |
|---------|--------|-------|
| Estimate builder | ✅ Live | `/admin/estimating` list; `/admin/estimating/[id]` with rooms, FGs, line items |
| BOM view | 🟡 Built/Unverified | `/admin/estimating/[id]/bom` |
| Quote view | 🟡 Built/Unverified | `/admin/estimating/[id]/quote` |
| Estimate settings / profiles | ✅ Live | `/admin/estimating/settings` + `/settings/profiles` |
| Send bid | ✅ Live | `/api/jobs/[id]/send-bid` — email with optional estimate link + file attachments |
| Send contract | ✅ Live | `/api/jobs/[id]/send-contract` — email with contract PDF |
| Change orders | 🟡 Built/Unverified | `ChangeOrdersPanel` on `/jobs/[id]`; full API exists; void + send routes present |
| Invoices | 🟡 Built/Unverified | `InvoicePanel` on `/jobs/[id]`; create/edit/send/pay API; email on send |
| Billing admin page | 🔶 Partial | `/admin/billing` page exists; content needs verification |
| Install gate → crew email | ❌ Missing | Transition emails PM only; does not email assigned crew from `event_crew` |

### 3.8 Stage-Gate Transitions

| Feature | Status | Notes |
|---------|--------|-------|
| Status advance button | ✅ Live | `StatusAdvanceButton` — modal with doc upload gate + email preview + confirm |
| 6 transition gates | ✅ Live | `lib/transition-gates.ts`: bid→deposit, deposit→production, production→delivery, delivery→install, install→punch, punch→warranty |
| Email on advance | ✅ Live | Per-transition email templates in `lib/email-templates.ts` |
| WO filename-driven | ✅ Live | WOs are filename-driven (e.g. `WO46317.pdf`) |

### 3.9 Engineering

| Feature | Status | Notes |
|---------|--------|-------|
| Engineering view | ✅ Live | `/engineering/[specId]` — lifecycle controls + JobFilesPanel + checklist |
| Engineering checklist | ✅ Live | `/api/jobs/[id]/engineering-checklist` |
| Engineering release | ✅ Live | `/api/jobs/[id]/engineering-release` |
| Checklist auto-check | ✅ Live | `/api/jobs/[id]/checklist-autocheck` |
| Engineer accounts | ❌ Missing | Schema + UI ready; no accounts seeded. Create via `/admin/builders` when ready. |

### 3.10 Admin Tools

| Feature | Status | Route | Notes |
|---------|--------|-------|-------|
| Pipeline report | ✅ Live | `/admin/pipeline` | Active jobs, value/boxes/hours/PM (editable), capacity model |
| Constraints tool | ✅ Live | `/admin/constraints` | Spreadsheet view of active jobs: box counts, WOs, FG complexity. See Section 3.13. |
| Libraries editor | ✅ Live | `/admin/libraries` | All catalog CSVs editable in-browser; header-locked; auto re-syncs |
| Accessories catalog | ✅ Live | `/admin/accessories` | Per-item active/inactive toggle, grouped by category |
| Edgeband matches | ✅ Live | `/admin/edgeband-matches` | ESI part# library CRUD; no data populated yet |
| Builder profiles | ✅ Live | `/admin/builder-profiles` | Per-builder defaults (carcass/drawer/pull/accessories) |
| Builder accounts | ✅ Live | `/admin/builders` | Internal staff accounts + roles |
| Builder companies | ✅ Live | `/admin/builder-companies` | Contractor CRM |
| Portal accounts | ✅ Live | `/admin/portal-accounts` | |
| Floor plans | ✅ Live | `/admin/floor-plans` | CRUD + rooms |
| Leads intake | ✅ Live | `/admin/leads` | Contact form inquiries + response composer + email send |
| Document library | ✅ Live | `/admin/documents` | Template docs (warranty, disclosure, payment terms); API was broken 2026-07-18 (`requireAdmin` returns void — fixed by swapping to `getAdmin`) |
| Bug log | ✅ Live | `/admin/bugs` | Bug reports with status management |
| Color catalog / paint colors | ✅ Live | `/api/paint-colors` | `paint_colors` table; 2175 BM + 1526 SW colors with hex |
| Palettes | 🟡 Built/Unverified | `/admin/palettes` | Custom color palette management |
| Catalog review | 🟡 Built/Unverified | `/admin/catalog-review` | |
| Wipe jobs | ✅ Live | `/admin/wipe-jobs` | Dev/test utility; admin-only |
| Express (legacy bypass) | 🔒 Gated | `/express` | `EXPRESS_ENABLED=false` in env. Legacy CV express submit flow. |

### 3.11 Client E-Signature (In-House)

All client approvals use the in-house canvas e-sig flow. No third-party signing service is used.

| Feature | Status | Notes |
|---------|--------|-------|
| Contract packet send | ✅ Live | `POST /api/jobs/[id]/send-contract` — auto-attaches `residential_disclosure` from template library + PM-selected drawing/quote file IDs; creates signoff token; sends email with all PDFs attached |
| Signoff link generation | ✅ Live | Same `send-contract` call generates a 30-day token stored in `client_signoffs.token` |
| Inline document review | ✅ Live | `/signoff/[token]` — client sees all attached docs (Preview iframe + Open in new tab) **before** the signature canvas; signed URLs resolved server-side (2-hour TTL) |
| Client signing page | ✅ Live | `/signoff/[token]` — name + canvas sig; IP + timestamp recorded |
| Signed record storage | ✅ Live | `client_signoffs` table; `attached_docs_json` stores `[{type, filename}]` for URL resolution |
| PM confirmation email | ✅ Live | Fires to `residential@advancedcabinets.net` on client submit |

**Note:** There is no separate `send-signoff` route. The only route that creates a signoff token is `send-contract`. Triggering this from the job page sends the full contract packet (disclosure + selected files) and creates the signoff link in one step.

### 3.12 Bug Reporting

| Feature | Status | Notes |
|---------|--------|-------|
| Floating bug widget | ✅ Live | Present on field pages; shows thank-you + auto-closes after submit |
| Bug log | ✅ Live | `/admin/bugs`; status: open/in-progress/deferred |
| Internal bug API | ✅ Live | `/api/internal/bug-reports` |

### 3.13 Constraints Tool

The constraints tool gives Karl and admins a spreadsheet-style view of all active jobs for production planning. It tracks box counts, WO counts, and complexity per finish group — the inputs that drive shop scheduling and Innergy.

| Feature | Status | Route | Notes |
|---------|--------|-------|-------|
| Active job spreadsheet | ✅ Live | `/admin/constraints` | All engineering/production/delivery/install/punch jobs in one view |
| Editable box count | ✅ Live | inline edit | Saves to `jobs.box_count`; source of truth for planning |
| Editable WO count | ✅ Live | inline edit | Saves to `jobs.wo_count` |
| Auto WO calculation | ✅ Live | client-side | Auto = FG count + ⌈(boxes − 65) / 65⌉ for boxes > 65; each FG = min 1 WO |
| FG-level box + complexity | ✅ Live | via `finish_groups` | Each FG row shows box count + complexity (1–3); complexity inherits from job default, overridable per FG |
| Install date + duration | ✅ Live | from `job_events` | Pulled from schedule |
| PM complexity field | ✅ Live | `jobs.pm_complexity` | Job-level default; FG can override |
| Status filter | ✅ Live | — | Only active statuses shown; complete/cancelled/on-hold excluded |

**WO logic:**
- Every finish group = at minimum 1 WO.
- For FGs with > 65 boxes: additional WOs at 1 per 65 boxes (rounded up).
- Total job WOs = sum across all FGs.

**Box counts for active engineering jobs:** Box counts come from Cabinet Vision WO assembly sheet PDFs after engineering releases. For jobs not yet released, counts must be entered manually via the constraints page or provided by the PM.

### 3.14 Innergy Integration

Innergy is the production management system that receives job data from the website at engineering release. This integration is the primary bridge between the spec/job system and the shop floor.

| Feature | Status | Notes |
|---------|--------|-------|
| DOM harvest selectors confirmed | ✅ Documented | `div.t-action-link`, `span.text`, `.r-tree-view-filler .scroll-overlay` — used to harvest Innergy UUIDs |
| `readyTakeoff` timing | 🟡 Design locked | Fires at engineering release (RELEASED_TO_ENG), not before |
| Early push (pre-readyTakeoff) | 🟡 Design locked | ACC can win a job in Innergy before engineering releases; system should warn but allow |
| `innergy_product_id` per line item | ❌ Not built | Required field on every estimate line item for the push to work; UUID harvest script needed |
| Engineering release → Innergy push | ❌ Not built | On RELEASED_TO_ENG transition: call `readyTakeoff` + push line items |
| Innergy UUID harvest script | ❌ Not built | Script to scrape Innergy product UUIDs and populate `innergy_product_id` on line items |

**Push rules:**
- `readyTakeoff` = false on initial push (when ACC wins the job, before engineering).
- `readyTakeoff` = true only when engineering releases (RELEASED_TO_ENG lifecycle state).
- Every line item must have `innergy_product_id` set or the push will fail.

---

## 4. Catalog Status

| Catalog | Status | Notes |
|---------|--------|-------|
| Door styles (Cab Door) | ✅ Live | 39 edge details, 17 mitre patterns, 15 starter presets ingested |
| Carcass materials | ✅ Live | Hardrock Maple PB, PF Ply Maple, PF Ply Birch, etc. |
| Drawer boxes | ✅ Live | Doweled Butt-Joint, Buy-out Dovetail, etc. |
| Hardware / pulls | ✅ Live | Bar 3in, Cup, Edge, etc. |
| Paint — BM | ✅ Live | 2175 colors with `hex_value` in `paint_colors` table |
| Paint — SW | ✅ Live | 1526 colors with `hex_value` |
| Paint — ML Campbell | ✅ Live | Documented as coating system; BM/SW codes valid |
| TFL — Egger | ✅ Live | 69 decors ingested from Karl's `egger_decor_map.xlsx` |
| TFL — Stevenswood | ✅ Live | Full catalog from sample box photos |
| TFL — TruNorth | ✅ Live | Full catalog; a few codes to verify (G92, 529) |
| TFL — Tafisa | ❌ Missing | Per-line colors needed. **[KARL: fan deck photo or rep PDF]** |
| Stains | ❌ Missing | 10 ACC named in-house stain mixes needed. **[KARL: stain names + base colors]** |
| Accessories (Rev-A-Shelf) | ✅ Live | Full catalog loaded; active/inactive toggles in admin |
| Accessories — prices/images | 🔶 Partial | Scrape script exists (`scripts/scrape-reva-accessories.mjs`); not yet run |
| Edgeband matches (ESI) | 🔶 Partial | Table + admin page live; no data populated. Team to enter part #s per color. |

### Catalog Verification Items (Low Priority)

- **G92 "Drift Loud"** — likely "Drift Wood." Verify in person; update both Stevenswood + TruNorth rows.
- **529 "Takase Teak" (TruNorth)** — hard to read in photo. Confirm code.
- **ACC-032/033/034** (half-moon blind corner) — series codes unverified. Check rev-a-shelf.com before ordering.
- **ACC-015 (4FSDB)** — series code unverified.
- **Yellowstone Oak, Cascadia Rift (TruNorth)** — no codes; left out. Add if ACC-stocked.

---

## 5. Database Schema Summary

All tables live in Supabase Postgres. Schema applied via `scripts/db-push.mjs` (idempotent, runs on every deploy).

### Core Tables

| Table | Purpose |
|-------|---------|
| `jobs` | Customer/site/builder identity. Central record for all activity. Key fields: `box_count`, `wo_count`, `pm_complexity`, `estimated_value`. |
| `residential_specs` | One spec per (job × cabinet quote). Has `lifecycle_state`. |
| `finish_groups` | N per spec. Carcass/drawer/edgeband + door style + color + pulls. Key fields: `box_count`, `pm_complexity`. |
| `rooms` | N per spec. Free-form names with catalog autocomplete. |
| `room_finishes` | M2M between rooms and finish_groups (with zone free-text). |
| `finish_moldings` | N per finish_group. Type, profile, qty_lf, rooms. |
| `room_accessories` | N per room. References Rev-A-Shelf catalog IDs. |
| `spec_hardware` | Per-FG hardware selections. |
| `finish_group_pulls` | Per-FG pull selections. |
| `room_trim` | Per-room trim details. |
| `spec_appliances` | Per-spec appliance notes. |
| `builder_accounts` | Internal staff (PM/engineer/admin/installer). Auth table. |
| `builder_sessions` | Session tokens. |
| `builders` | Contractor company CRM (GCs, clients). |
| `portal_accounts` | Builder/client portal logins. |
| `portal_sessions` | Portal session tokens. |
| `spec_lifecycle_transitions` | Append-only audit of every lifecycle state move. |
| `client_signoffs` | Canvas signature records (in-house e-sig). |
| `approval_requests` | Scaffolded; not actively used. |
| `webhook_errors` | Persisted webhook failures. |
| `job_events` | Schedule events (delivery/shop/install/milestone). |
| `event_crew` | M2M: crew (builder_accounts) ↔ job_events. |
| `schedule_change_requests` | Change requests from portal/field. |
| `schedule_weeks` | Weekly verify records. |
| `gate_checkins` | Gate check-in log. |
| `pm_time_entries` | PM hours per job. |
| `punch_items` | Punch list items per job. |
| `warranty_items` | Warranty claims per job. |
| `change_orders` | Change orders per job. |
| `invoices` | Invoices per job. |
| `invoice_line_items` | Line items per invoice. |
| `template_documents` | Boilerplate doc slots (warranty/disclosure/payment-terms). |
| `estimates` | Quote builder estimates. |
| `estimate_rooms` | Rooms per estimate. |
| `estimate_line_items` | Line items per estimate. Has `innergy_product_id` column (unpopulated). |
| `estimate_settings` | Estimating cost settings. |
| `estimate_finish_groups` | FGs per estimate. |
| `catalog_builder_profiles` | Per-builder default selections for spec form. |
| `catalog_active_states` | Per-item active/inactive for accessories catalog. |
| `accessories_catalog` | Rev-A-Shelf items (supplementary; primary = CSV). |
| `paint_colors` | BM/SW/ML colors with hex values. |
| `edgeband_matches` | Paint color → ESI edgeband part# lookup. |
| `floor_plans` | Floor plan CRUD records. |
| `leads` | Contact form inquiries. |
| `portal_jobs` | Jobs linked to portal accounts. |
| `bug_reports` | Bug log entries. |

---

## 6. Karl's Open Input Queue (Blocking Items)

These items are blocking features or data quality. Nothing can substitute for Karl's input.

1. **ACC stain mixes** — 10 named in-house stains (name + base color). Unblocks real stain dropdown in spec form. Easy: photo of stain board.
2. **Tafisa color list** — per-line colors for Alto/Crystalite/Isola/Karisma/Smoothwood/Urbania/Brava/Feria/Viva/Materia. Fan deck photo or rep PDF.
3. **Builder defaults data entry** — Atlas, Bush Legacy, Premier, Stancraft, Cobalt, Bar 17, RSB Customs. Enter via `/admin/builder-profiles`. Per builder: carcass / drawer box / pull / typical accessories.
4. **ESI edgeband data entry** — `/admin/edgeband-matches` is live. Team to populate ESI part #s for colors used. Auto-suggest fires once data exists.
5. **Catalog verification items** — G92, 529, ACC-032/033/034, ACC-015 (see Section 4).
6. **Job data cleanup** — ~10 active jobs with zero box counts and ~4 with no estimated value. PM email sent 2026-07-18. Update constraints page once PMs reply.
7. **`innergy_product_id` population** — Every estimate line item needs an Innergy UUID before the push can work. Requires UUID harvest from Innergy UI.

---

## 7. Genuine Build Gaps (No Karl Blocker)

These are features with no blocking dependency — just not built yet. Prioritize by operational need.

| Gap | Priority | Notes |
|-----|----------|-------|
| Innergy UUID harvest script | High | Scrape Innergy product UUIDs via DOM selectors; populate `innergy_product_id` on line items |
| Innergy push on engineering release | High | On RELEASED_TO_ENG: call `readyTakeoff` + push all line items with `innergy_product_id` |
| Install gate → notify crew email | Medium | `install` transition emails PM only; should also email crew from `event_crew` for the job's install event |
| Change orders end-to-end verification | Medium | Routes exist; `ChangeOrdersPanel` on job page; send-CO email and void flow need live test |
| Invoice end-to-end verification | Medium | Routes exist; `InvoicePanel` built; test now |
| Billing admin page content | Low | `/admin/billing` exists; verify what's rendered vs. what's needed |
| Image thumbnails for site photos | Low | Site photos show as file links; `sharp` library or browser-native preview |
| Stain catalog (after Karl provides list) | High | Once Karl sends stain mixes, takes ~30 min to load and wire dropdown |
| Spec combine verification | Low | `/api/specs/[id]/combine` exists; test with real drawings upload |
| Combine PDF page numbering | Low | Combined output should read C.1 → F.x → H.1 → A.1 → M.1 → N.1 → D.1 → D.2 |
| FG-level box count sync | Low | Constraints page edits `jobs.box_count`; `finish_groups.box_count` must be entered per-FG for per-WO accuracy |

---

## 8. Staff Go-Live Checklist

This is the gate before turning the system over to staff. Work top-to-bottom.

### Pre-Flip (Do Before Any Staff Touches It)

- [ ] **Resolve branch model** — AGENTS.md says `staging → master`; practice has been direct-to-`main`. Decide: adopt staging branch properly, or update AGENTS.md to reflect reality.
- [ ] **Rotate admin passwords** — `node scripts/rotate-admin-pw.mjs "NewPassword"` for both admin accounts.
- [ ] **Verify invoices end-to-end** — create invoice on a test job, send it, confirm email arrives.
- [ ] **Verify change orders end-to-end** — create CO, add items, send, void.
- [ ] **Populate builder profiles** — `/admin/builder-profiles` for all GCs Karl works with regularly.
- [ ] **Enter ESI edgeband part #s** — `/admin/edgeband-matches`; auto-suggest is live but empty.

### Account Creation (Flip Day)

- [ ] Create PM accounts via `/admin/builders` (role: `pm`) for each PM.
- [ ] Create engineer account(s) via `/admin/builders` (role: `engineer`).
- [ ] Create installer accounts via `/admin/builders` (role: `installer`) — one per crew lead.
- [ ] Create builder portal accounts via `/admin/portal-accounts` for each GC who needs portal access.
- [ ] Brief each role on their login URL and what they can see.

### Post-Flip Monitoring (First 2 Weeks)

- [ ] Watch Vercel runtime logs for new 500s — `www.advancedcabinets.org` → Runtime Logs in Vercel.
- [ ] Check `/admin/bugs` daily for field-submitted bug reports.
- [ ] Verify punch list photo uploads work from phone (requires Supabase Storage write permissions on `punch-photos` bucket).
- [ ] Run `node scripts/selftest.mjs` after any schema change.

---

## 9. Architecture Decisions (Rationale Preserved)

Brief notes on the non-obvious calls. Full rationale in `ARCHITECTURE.md`.

- **CSV catalogs, not DB-backed** — 10-year-old-easy edit story. On Vercel, CSV edits require redeploy (filesystem read-only post-deploy). `/admin/libraries` handles it.
- **`NOT NULL` not enforced at SQL level for $70k cols** — adding NOT NULL to existing Postgres cols requires a careful migration. Enforced via server-side validation + form UI instead.
- **`prepare: false` in DB config** — PgBouncer transaction mode cannot use prepared statements. Required for Supabase pooler.
- **In-house e-sig only** — `/signoff/[token]` canvas signature is the sole client approval path. No third-party signing service is used.
- **Combine PDF returns 501 if no drawings** — intentional graceful degradation, not a bug.
- **`EXPRESS_ENABLED=false`** — legacy CV express submit bypass is disabled. Routes remain for if/when re-enabled.
- **Two Vercel projects** — `accwebsite` (beta/preview) and `accwebsite-cd58` (production). Both watch `main` branch. Beta can be used as staging until a proper `staging` branch is adopted.
- **Innergy push at engineering release** — `readyTakeoff=false` on win (job created in Innergy); `readyTakeoff=true` fires only when spec reaches RELEASED_TO_ENG. Prevents Innergy from starting production before engineering is complete.

---

## 10. Known Issues / Technical Debt

| Issue | Severity | Status |
|-------|----------|--------|
| React hydration warning #418 on spec page | Low | Pre-existing; cosmetic only |
| ARCHITECTURE.md partially stale | Low | Still references SQLite, accspec.net, Cloudflare Tunnel — all superseded |
| TODO.md stale | Low | Historical only; `PROGRESS_LOG.md` is the live backlog |
| AGENTS.md branch model (`staging`) not followed | Medium | Practice has been direct-to-`main`; resolve before staff go-live |
| `selftest.mjs` skips DB checks on Supabase | Low | Only runs catalog + tsc. Full DB selftest would require Supabase-aware rewrite |
| No off-site backups | Medium | `npm run backup` writes to `data/backups/` locally. Wasabi/S3 sync recommended |
| No CI | Low | `.github/workflows/selftest.yml` scaffolded; not running |
| Scrape script for accessory prices/images not run | Low | `scripts/scrape-reva-accessories.mjs` ready |
| `field_dims` used as job status | Low | Non-standard status value found in DB (job 26170 Pacula). Valid statuses: intake, design, engineering, procurement, production, delivery, install, punch, complete, on_hold, cancelled. |
| `innergy_product_id` unpopulated | High | `estimate_line_items.innergy_product_id` exists but is null on all rows — Innergy push will fail until populated |
| ~10 active jobs with zero box counts | Medium | Engineering-stage jobs; PMs notified 2026-07-18. Enter via `/admin/constraints` when data arrives. |

---

## 11. Operational Runbook

### Deploy

All deploys happen automatically on push to `main`. Monitor at `vercel.com/aluates-projects/accwebsite-cd58/deployments`.

### Schema Change

1. Add `CREATE TABLE IF NOT EXISTS` or `ALTER TABLE` (try/catch) to `scripts/db-push.mjs`.
2. Push to `main` — `db:push` runs as part of the Vercel build.
3. Verify table exists in Supabase dashboard or via a test request.

### Catalog Update

1. Edit `data/catalogs/*.csv` locally (header row is locked — do not change column names).
2. Run `npm run sync-catalogs` locally to verify JSON regenerates cleanly.
3. Push to `main` — sync-catalogs runs on prebuild automatically.

### Add New Admin User

```
POST /api/admin/builders  { email, password, name, role }
```
Or via `/admin/builders` UI.

### Rotate Admin Password

```bash
node scripts/rotate-admin-pw.mjs "NewPassword"
```

### Send an Email to Karl (from Claude)

```
POST /api/admin/email-karl  { subject: string, text: string, to?: string }
```
Fires from `residentialacc2@gmail.com` to `karlv@advancedcabinets.net` (default). Used by Claude to send drafts, data summaries, or PM emails without needing an external connector.

### Investigate a Runtime Error

1. Open Vercel → accwebsite-cd58 → Runtime Logs.
2. Filter by `level:error`.
3. Note the timestamp and route. Look for relation-not-found (missing table) or type errors.
4. If schema: add to `db-push.mjs` and redeploy.

### Backup

```bash
npm run backup
```
Creates `data/backups/{timestamp}.tar.gz`. Catalog and upload data only — DB is in Supabase.

### Count boxes from a CV WO PDF

```python
import subprocess, re
BOX_TYPE = re.compile(r'^(\*CUST\*\s*)?(B-|W-|SB-|DB-|T-)', re.I)
def count_boxes(path):
    result = subprocess.run(['pdftotext', path, '-'], capture_output=True, text=True)
    assemblies = re.findall(r'Assembly #(\d+) - (.+?) - QTY\.=\((\d+)\)', result.stdout)
    seen, total = set(), 0
    for num, typ, qty in assemblies:
        if (num, typ.strip()) not in seen:
            seen.add((num, typ.strip()))
            if BOX_TYPE.match(typ.strip()): total += int(qty)
    return total
```

---

## 12. DAC / Tahiti Test Findings (2026-07-18 Audit)

### Devil's Advocate — What Could Go Wrong

1. **`innergy_product_id` is the Innergy integration's single point of failure** — Every line item needs this UUID or the push silently fails. No harvest script exists yet. Build the UUID scraper before attempting any live Innergy push.

2. **NTFS truncation still a live risk** — Any session that uses Edit/Write tools directly to `C:\dev\repos\acc-website` will silently corrupt files. This has happened 4+ times. Every session must start with the `/tmp/acc-repo` clone pattern.

3. **Stale branch model** — AGENTS.md mandates `staging → master` promotion model that is not being followed. If a bad commit goes to `main`, it goes straight to production with no staging buffer.

4. **No staging DB** — All deploys go to the production Supabase. A schema migration that breaks something goes live immediately. The `CREATE TABLE IF NOT EXISTS` pattern mitigates this but doesn't eliminate risk.

5. **ESI edgeband data is empty** — The auto-suggest feature exists but provides no value until someone populates the match table.

6. **Box counts are manually maintained** — The constraints page is the only place to enter/update box counts for engineering-stage jobs. No automatic sync from CV exists. If counts aren't entered, WO calculations and Innergy pushes will be wrong.

### Tahiti Test — What Breaks Without Karl

1. **Stain dropdown is free-text** — Until Karl provides the 10 stain mix names, PMs entering specs will type whatever they want. Spec data quality degrades silently.

2. **Builder defaults not populated** — Auto-populate on new spec creation fires from `catalog_builder_profiles`. If those profiles are empty (they are), every spec starts from scratch for every builder.

3. **No engineer accounts** — The engineering review step in the lifecycle (`RELEASED_TO_ENG → ENGINEERED`) cannot be performed by anyone except Karl. If Karl is unavailable, specs cannot advance past that gate.

4. **ESI edgeband data empty** — Shop will continue looking up edgebands manually.

5. **Innergy push not built** — Even when the harvest script exists, the push requires Karl to validate product IDs. If Karl is unavailable, no jobs can be pushed to Innergy.

6. **Constraints data entry** — Box counts for engineering-stage jobs must be entered manually. If the PM doesn't know the count and Karl is unavailable, the constraints page will show zeros, making production planning unreliable.
