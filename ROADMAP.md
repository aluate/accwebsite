# ACC Website — Roadmap
*Last updated: 2026-05-14. Source of truth for "continue" sessions.*

---

## How to read this

**Me** = I build it autonomously, you review.
**Karl** = requires your input, data, or a decision before I can proceed.
**Together** = one working session where you feed me data or answer questions.

"Continue" = pick up at the top of the first incomplete phase.

---

## Shipped ✅

| Item | Notes |
|------|-------|
| Unified auth (`/login`) | Single login for all roles |
| Job lifecycle (11 stages) | intake → bid → design → field_dims → engineering → procurement → production → delivery → install → punch → complete |
| Stage-gate transitions | Doc upload + email fire per transition; WO filename auto-parse |
| Residential spec form | Finish groups, rooms, materials, accessories, moldings, schedules |
| Spec lifecycle | DRAFT → CLIENT_APPROVED → RELEASED_TO_ENG → ENGINEERED → RELEASED_TO_SHOP |
| In-house e-sig | Token URL → public signoff page → canvas signature → IP/timestamp stored |
| Schedule wall (TV view) | Week grid, crew filter, on-deck column, drag-edit write-back |
| Builder portal | Per-job external login, required inputs, change requests, drawing comments |
| Admin builders panel | Role management, builder accounts |
| Activity log | Universal write on every status change |
| Job files panel | Z-drive mirror (17 folders), Supabase Storage |
| Punch list | Per-job items from spec rooms + GENERAL escape, type codes (S/S+M/HP/TD), before/after photos, installer completes with photo, hard gate to Complete |
| Installer active jobs board | All jobs in production/delivery/install/punch visible to installer (no assignment filter) |
| Installer job view | Mobile-first: address → maps link, schedule events, punch list, photo upload |

---

## Next up — ordered by priority

---

### STEP 0 — Run schema push (Karl, 2 minutes)
**Do this before anything else.**
```
node scripts/db-push.mjs
```
Creates `punch_list_items` table in Supabase. The punch list UI is live but items can't be created until this runs.

---

### Phase A — PM Pipeline Home View
*The most painful daily gap. PMs have no single place to see what's happening across all jobs.*

**What it is:** Two-tab home replacing the current flat `/jobs` list.
- Tab 1: Calendar (delivery + install + on-deck) — reuses schedule data already in DB
- Tab 2: Pipeline — every active job, what stage it's in, who owns it, open punch item count, any gate blockers

**Why first:** Every PM interaction right now requires clicking into individual jobs. The pipeline view is the difference between managing by exception vs. managing by click.

| # | Task | Who |
|---|------|-----|
| A.1 | Add second tab to `/jobs` with pipeline card layout — job stage, PM name, open punch count, days in current stage | Me |
| A.2 | Add nav link from `/jobs` to `/schedule` and vice versa (currently unreachable from main inbox) | Me |
| A.3 | Add logged-in user indicator + logout button to page chrome (currently missing entirely) | Me |

**Karl's time:** Zero — review the result.

---

### Phase B — Engineer Queue
*Engineers have no view of what's waiting for them. Currently relies entirely on phone calls.*

**What it is:** `/engineer` page — all jobs in `engineering` or `procurement` status, with links to spec + drawings.

| # | Task | Who |
|---|------|-----|
| B.1 | `/engineer` page — list jobs in engineering/procurement, link to spec form + 05_drawings folder | Me |
| B.2 | Notify engineer on "Release to Engineering" transition (email already fires; add in-app indicator) | Me |
| B.3 | Engineer can upload completed drawings from their queue view | Me |

**Karl's time:** Zero — review. Decide if engineers need a separate login role or just use their existing account.

---

### Phase C — Spec Form Remaining Sub-Sections
*Still the #1 production safety gap. Form sub-sections for Door Front, Drawer, Edgeband, Hardware are partially scaffolded but not forced-dropdown.*

| # | Task | Who |
|---|------|-----|
| C.1 | Door Front sub-section — style, material, overlay, profile — all dropdowns, no defaults | Me |
| C.2 | Drawer sub-section — drawer box type, slide selection | Me |
| C.3 | Edgeband sub-section — auto-derive for melamines, manual match for paint/stain | Me |
| C.4 | Hardware sub-section — pulls, hinges, rollouts | Me |
| C.5 | DAC + Tahiti Test pass on completed form | Me |
| C.6 | Karl walks through one active job in the form | Karl |

**Karl's time:** One 30-min review against a real job.

---

### Phase D — Change Orders
*#1 MES priority. The other half of the $70k fix. Spec form means nothing if changes after approval are handled in text messages.*

| # | Task | Who |
|---|------|-----|
| D.1 | `change_orders` table — tied to signed spec version, line-item delta, price impact, status | Me |
| D.2 | CO creation — PM initiates from job detail, selects affected spec lines, enters delta + reason | Me |
| D.3 | CO signoff — reuses existing token-URL e-sig flow | Me |
| D.4 | CO PDF — original vs. changed lines, price impact summary | Me |
| D.5 | CO history view on job detail | Me |

**Karl's time:** Zero — design is decided. Review the result.

---

### Phase E — Global Search
*Currently: Windows file explorer. Target: Postgres FTS across everything.*

| # | Task | Who |
|---|------|-----|
| E.1 | FTS indexes on jobs, specs, rooms, files, notes, punch items | Me |
| E.2 | `/search` page — query bar, faceted filters (client, stage, dollar range, hardware, finish) | Me |

**Karl's time:** Zero.

---

### Phase F — Manager Dashboard
*You currently have no birds-eye view without clicking through individual jobs.*

| # | Task | Who |
|---|------|-----|
| F.1 | `/dashboard` — total active jobs by stage, open punch item count across all jobs, jobs overdue in current stage | Me |
| F.2 | Punch list aggregate — which jobs have open items > 2 weeks old | Me |

**Karl's time:** Zero.

---

### Phase G — Warranty / Callback Log
*Post-completion tracking. Currently nothing in the system.*

| # | Task | Who |
|---|------|-----|
| G.1 | `warranty_items` table — linked to job, parties involved (client, GC, designer, installer), click-through to original spec/drawings | Me |
| G.2 | Warranty view on job detail (appears after status = complete) | Me |
| G.3 | PM warranty queue — open items across all completed jobs | Me |

**Karl's time:** Zero.

---

## Parked (build when the above are stable)

- **Photo/video gallery with room + finish-group tags** — upgrade from flat file panel. I build it.
- **Gate-driven daily check-in screen** — manual tick boxes (doors received, floor released, crew assigned). I build it.
- **Punch list PDF export** — printable version of RC-60-01 format with completion photos. Karl confirmed static doc is fine for v1.
- **Field measure digital form** — standard template + photo upload. Currently photo-only, which is fine for now.
- **TradeSoft/QuickBooks API** — Phase 4+. Not yet.
- **DocuSign** — archived. In-house e-sig ships v1.

---

## Decisions locked — do not re-litigate

| Decision | What was decided |
|----------|-----------------|
| Punch list rooms | From spec rooms only (not generic template). GENERAL is the one free-text escape hatch. |
| Punch list type codes | S / S+M / HP / TD — required on every item |
| Punch list completion | Installer self-certifies with after-photo. PM can reopen. |
| Punch list visibility | Internal only for v1. |
| Punch list gate | All items must be Done before job advances to Complete. |
| Installer visibility | All jobs in production/delivery/install/punch — no assignment filter. |
| Close flow | App marks Complete; TradeSoft close is accounting's separate step. |
| Auth | Unified `/login` for all roles. No separate admin login. |
| E-sig | In-house (token URL + canvas). DocuSign feature-flagged off. |
| DB | Supabase Postgres + PgBouncer pooler. `prepare: false` is load-bearing. |
| Hosting | Vercel on `main`. Never push to `master`. |
| Z drive | Phase 1 = Supabase Storage mirrors Z tree. Phase 2 = real sync when security proven. |

---

## Karl's open input queue

| # | What I need | Unblocks |
|---|-------------|----------|
| K.1 | Run `node scripts/db-push.mjs` | Punch list goes live |
| K.2 | ACC's 10 named in-house stain mixes (photo of stain board) | Real stain dropdown in spec form |
| K.3 | Tafisa color list per line — phone photo of fan deck or rep PDF | Melamine dropdown completeness |
| K.4 | Real builder defaults per builder (Atlas, Bush Legacy, Premier, etc.) — carcass / drawer box / pull / accessories | Auto-fill on Express Wizard |
| K.5 | Confirm: G92 "Drift Loud" should be "Drift Wood"? + 529 "Takase Teak" correct? (TFL catalog) | Catalog accuracy |

---

## Sequence logic

**A → then anything.** The PM pipeline view is the daily driver that makes everything else visible. Do it first.

**C before D.** Spec form must be complete and production-safe before change orders matter — a CO references the locked spec. If the spec form is still missing sub-sections, CO deltas are incomplete.

**B, E, F, G are independent** — can be done in any order after A.

**"Continue" means:** Start at the top of the first incomplete phase. Ask if any decisions need updating. Then build.
