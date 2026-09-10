# INPUT_FIELD_MAP.md — the law of inputs

Every input in the app: what you type, what it is called on each screen, which column it
really is, where it shows up next, and everywhere it can be changed.

Built by reading `main@6c7d463` on 2026-09-10 and running the app against a local
database. Verified with `npm run check-input-map`, which fails the build when a `jobs`
column or a `JOB_PATCH_FIELDS` entry has no row here. **Add the row before you write the
code.**

## The four rules this file exists to enforce

1. **One concept, one column, one label.** If two screens show the same thing they read
   the same column and use the same words.
2. **If a form collects it, the route saves it.** A field that is sent and dropped is a
   bug, not a quirk.
3. **If it can be seen, it can be changed** — from the job page at minimum.
4. **Nothing shows the internal ACC key.** `ACC-2026-0181` is a database key. The number
   people use is the 5-digit job number.

## The job label standard

Every screen, document, email subject and file name refers to a job as:

```
26401 · Atlas · Kenny Debaene
26404 · Bush Legacy · 5712 Davenport St     ← spec home, no client name
(no job #) · Atlas · Kenny Debaene          ← number not issued yet
```

Job # · Builder (company) · Job name, where **job name is the client name, and the site
address when there is no client name**. Never the ACC key, never a bare number on its own.

---

# 1. The flag index

This is the part to read first. Everything here is confirmed in code, not suspected.

## A. You type it and it disappears

| What you type | Where | What happens |
|---|---|---|
| **Install Start** | Pipeline → Add Job | Sent to the server, not in the INSERT column list, discarded. Returns "created" anyway. |
| **Install Type** | Pipeline → Add Job | Same. |
| **Boxes** | Pipeline → Add Job | Same. |
| **Duration (days)** on an install phase | Job → Install Phases & Schedule | The form never sends it, and the edit route drops it even if sent. Every phase stores 1 day. |
| Spec-level **Pulls** | (nothing sends them any more) | Every save and every Generate runs `DELETE FROM spec_pulls` and inserts nothing. Any legacy row is wiped. |

Shop Hrs and Install Hrs on the same Add Job form *do* save — only because the modal
quietly fires a second save just for those two. Nobody went back for the other three.

## B. No way to change it after it is set

- Forecast placeholder numbers: unit count and per-unit value / boxes / shop hrs /
  install hrs. Delete and rebuild the row is the only fix.
- `state` and `zip_code` — no field asks for them, and the create route drops them.
  Permanently blank on every job. Innergy is told "ID" for every job regardless.
- `install_duration_days` on the job — written once into a schedule event, never stored.
- `wo_count` on the job — nothing writes it, nothing reads it.
- Change order number, invoice number, ACC id, seq, created_at — correctly locked.

## C. Same label, different data

| Label | On this screen it means | On that screen it means |
|---|---|---|
| **Builder** | Pipeline: the company (`builder_company`) | PM dashboard filter: the contact person (`builder_name`) |
| **Job #** | everywhere: `job_number` | Job page header: `job_number` **or the ACC key** when blank |
| **WO #** | Spec PDF: `finish_groups.wo_number`, typed on the spec form | Coversheet + eng email: `work_orders.wo_number`, typed on the job page |
| **Notes** | job intake notes | also: punch, files, estimates, invoices, crews, PTO, change requests, and five spec tables |
| **Status** | the job's stage | also: work orders, punch items, invoices, change requests, drawing comments, and the spec's own lifecycle |
| **Complexity** | `jobs.pm_complexity` | `finish_groups.pm_complexity` silently wins per finish group |
| **Pipeline** | `/admin/pipeline` (admin only) | the Pipeline tab in `/jobs`, the widget on `/dashboard`, and `/pm-dashboard` |

## D. Same data, different labels

| Column | Called |
|---|---|
| `job_number` | "Job #", "Job#", "TradeSoft Job #", "JOB #" |
| `site_address` | "Site Address", "Address" |
| `builder_name` | "Contact Name", "Contact", "Builder Contact" |
| `bid_number` | "Bid #" in the app, "Quote #" in the client's email |
| `notes` | "Intake / Source Notes", "Intake Notes", "Notes" |
| `notes_install` | "Install Instructions" on the form, "Install Notes" on the PDF |
| `notes_finishing` | "Finishing Dept" / "Finishing Notes" |
| `notes_shop` | "Shop Build Notes" / "Shop Notes" |
| `notes_client` | "Client-Facing Notes" / "Client Notes" |

## E. Typed, and printed nowhere

- **Room Flooring, Ceiling Height, Soffit, Backsplash** — saved, reloaded, and referenced
  by no document and no other screen. Four fields per room, every job.
- **The edgeband schedule table** (thickness, manufacturer, part number, notes, for all 8
  codes). On paint and stain groups the work order ignores the stored rows entirely and
  re-derives them. On melamine only two description cells survive to print.
- **Finish group Notes** — prints on the client spec, never on the work order, even though
  the field invites shop instructions.
- **Box Count / WO Count** on a finish group — planning figures, on neither document.
- Dead columns nothing writes: `finish_groups.pull_id`, `finish_groups.box_material`.

## F. Your number, silently replaced by a computed one

| You type | It is replaced by | When |
|---|---|---|
| Job **Boxes** | the sum of the finish groups' box counts | as soon as the spec has any box count |
| Job **Value** | the estimate's sell price snapshot | as soon as an estimate exists — the cell locks |
| Job **Complexity** | the finish group's own complexity | per finish group, for engineering hours |
| Appliance cutout W/H/D | auto-filled from the model number | and left stale if you then change the model |

Note the Value case is display-only on the Pipeline: the engineering-hours page keeps
using the old typed number, so the two screens can disagree about what a job is worth.

## G. The same fact stored twice

| Fact | Copies | What syncs them |
|---|---|---|
| Install date | `jobs.install_start_date` and the calendar's install event | Editing the job moves the event. Moving the event only asks. The engineering release panel creates the event and never sets the job field. |
| Delivery date | `jobs.delivery_date`, the delivery event, the portal's estimated delivery | Nothing. |
| Which month a job is in | the row shows `delivery_date`; the buckets use install start → calendar → delivery | Nothing. |
| Slide name on the work order | the drawer schedule and the hardware block | The work order forces the schedule's name, because they were seen to disagree. |
| "Is the spec done?" | `residential_specs.status` (frozen at "draft" forever) and `lifecycle_state` (the real one) | Nothing — the badge can never turn green. |

## H. Outputs found broken while mapping this

1. **Every spec PDF prints the DRAFT watermark, at every stage.** The renderer compares
   the lifecycle state to `"APPROVED"`, which is not one of the five real states
   (`DRAFT`, `CLIENT_APPROVED`, `RELEASED_TO_ENG`, `ENGINEERED`, `RELEASED_TO_SHOP`).
   A released-to-shop spec still says "DRAFT — PENDING APPROVAL".
2. **Every auto-drafted deposit and balance invoice is $0.00.** The lookup selects
   `estimates.sell_price`; the column is `sell_price_snapshot`. The error is swallowed and
   the invoice is created with a zero line.
3. **"Include estimate" is always empty** on Send Bid and Send Contract — both fetch
   `/api/admin/estimating`, a route that does not exist.
4. **Removing a PTO / unavailability block does nothing.** The delete is sent as a query
   parameter and read from the body, so it always fails — and the row disappears from the
   screen anyway. It comes back on reload.
5. **Marking a schedule week verified fails**, and the verified ticks never show: the
   table column is `week_start_date` and the route reads `week_start`.
6. **Builder portal welcome and password-reset emails send an empty message** while the
   screen reports success — the temp password never reaches the builder.
7. **The Pipeline's status dropdown skips the gates.** Changing status there writes
   directly and does not run the document requirements or send the transition email that
   the same change makes from the job page.
8. **Re-picking a builder on the Pipeline leaves the old builder's email and phone** on
   the job — the picker writes company, contact and id, not the contact details.
9. **`work_orders` has two conflicting definitions** in `db-push` — one file-based, one
   category-based. Only whichever ran first exists. Needs a look at the live schema.

---

# 2. Register — job identity, people, location

`Changed at` lists every place a human can change the value. "Job page" means the inline
sidebar; "Edit form" means `/jobs/[id]/edit`.

| Column | Label(s) | Entered at | Changed at | Shows up in | Flags |
|---|---|---|---|---|---|
| `id` | none (raw text) | created by the app | never | edit page, **builder portal page and its URLs**, **portal emails**, spec PDF footer fallback, pipeline row links, conflict warnings, Innergy | must stop being visible |
| `seq` | none | created by the app | never | sort order; printed 5-padded as the "job id" on the Express order PDF | that PDF's number is not the job number |
| `job_number` | "Job #", "Job#", "TradeSoft Job #", "JOB #" | intake form, or Pipeline Add Job | Edit form only | every list, the spec + WO PDFs, email subjects, `/jobs/<number>` URLs, CSV | ALIAS ×4; changing it 404s the old URL |
| `bid_number` | "Bid #"; "Quote #" in the client email | PM dashboard cell — nowhere else | PM dashboard | the bid email | ALIAS; no field at intake |
| `job_type` | "Job Type" (residential/commercial) | intake | Edit form | nothing — only the Innergy name | never displayed after intake |
| `status` | "Status" (three separate label maps) | created as `intake` | job page Advance button (gated, emails), **Pipeline dropdown (ungated, silent)** | everywhere | see H7 |
| `client_name` | "Name", "Client / Job", "Job" | intake / Express | Job page, Edit form | everything, every PDF, every email | also holds a forecast row's label |
| `client_email` | "Email" | intake | Job page, Edit form | delivery / punch / complete emails, contract, invoice | shares its label with the builder's email |
| `client_phone` | "Phone" | intake | Job page, Edit form | nothing printed | |
| `site_address` | "Site Address", "Address" | intake (Google Places) | Job page, Edit form | PDFs, signoff page, Innergy | ALIAS; **the edit path has no map lookup — BUG-001** |
| `city` | "City" | intake (auto from Places) | Job page, Edit form | appended to the address everywhere | |
| `state` | none | nowhere | **nowhere** | Innergy, which substitutes "ID" | DEAD |
| `zip_code` | none | nowhere | **nowhere** | nothing | DEAD |
| `pm` | "Assigned PM", "PM" | intake (select) | Job page, PM dashboard, Pipeline | filters, eng email | correctly a select everywhere |
| `engineer` | "Engineer", "No Eng" | not at intake | Job page, `/jobs` Pipeline tab | engineer queue, spec PDF | |
| `builder_id` | none | builder picker at intake / Pipeline | those pickers only | joins | job page edits the text and not the id |
| `builder_company` | "Company", "Builder" | intake, Express | Job page, Edit form, Pipeline picker | PDFs, portal account matching **by text** | COLLISION with `builder_name`'s label |
| `builder_name` | "Contact Name", "Contact", "Builder Contact" | intake | Job page, Edit form, PM dashboard, Pipeline picker | order PDF | ALIAS ×3 |
| `builder_email` | "Email" | intake | Job page, Edit form | order PDF | **not updated when the Pipeline picker changes builder** |
| `builder_phone` | "Phone" | intake | Job page, Edit form | nothing | same staleness |
| `notes` | "Intake / Source Notes", "Intake Notes", "Notes" | intake | Job page, Edit form, PM dashboard | job page | ALIAS ×3, COLLISION |
| `notes_install` | "Install Instructions" / "Install Notes" | intake | **Edit form only** | work order PDF | not on the job page |
| `notes_finishing` | "Finishing Dept" / "Finishing Notes" | intake | **Edit form only** | work order PDF | |
| `notes_shop` | "Shop Build Notes" / "Shop Notes" | intake | **Edit form only** | work order PDF | |
| `notes_client` | "Client-Facing Notes" / "Client Notes" | intake | **Edit form only** | client spec PDF | |
| `mod_*` (4) | "Residential Cabinets", "Commercial Cabinets", "Trim Supply", "Doors" | intake checkboxes | Edit form; job page can only turn one **on** | scope tiles, list badges | no way to remove scope |
| `builder_portal_enabled` | "Enable builder portal access" | admin portal screen | admin portal screen | portal access | ROLE-LOCKED admin |
| `target_delivery_weeks` | "Target delivery weeks" | default 8 | admin portal screen | the builder's estimated delivery | ROLE-LOCKED admin |
| `innergy_*` (3) | none | automation | never | dedupe only | two of the three are never read |

# 3. Register — dates, schedule, crews

| Column | Label(s) | Entered at | Changed at | Shows up in | Flags |
|---|---|---|---|---|---|
| `jobs.delivery_date` | "Delivery", "Rough Delivery Date" | intake; Pipeline Add Job | Pipeline, PM dashboard, job page, Edit form | Pipeline cell, PM dashboard, `/jobs` list, eng email, order PDF | DRIFT vs the delivery event |
| `jobs.install_start_date` | "Install Start", "Inst Start" | **dropped by Pipeline Add Job**; otherwise set by editing | Pipeline, PM dashboard, job page | month buckets, "ships in N weeks", the calendar (it moves the event) | SILENT-DROP on create; PM dashboard moves the crew's event with no message |
| `jobs.install_type` | "Install Type", "Install", "Installer:" | **dropped by Pipeline Add Job** | Pipeline, job page | capacity math, eng email, conflict detection | SILENT-DROP on create |
| `jobs.install_duration_days` | none | never | never | nothing | DEAD — the live one is on the event |
| `jobs.delivery_clock_started_at`, `estimated_delivery_at` | "Estimated delivery" | automation | never (correct) | builder portal only | a fourth ship date PMs never see |
| `jobs.created_at` | none | automation | never | unlabeled fallback date in the `/jobs` list | shown in a different timezone than the delivery date in the same cell |
| `job_events.date_start` / `date_end` | "Start *", "On Deck", drag position | per-job phase form; Ready to Schedule; engineering release | drag on the wall; the phase form | the wall, installer portal, month buckets, the "make it official" prompt | approving a removal request clears dates with no audit row |
| `job_events.duration_days` | "Duration (days)" | phase form | **nowhere** | on-deck card ("⏱ 3d install") | SILENT-DROP both ways — always 1 |
| `job_events.crew_id` | crew select | phase form, wall event form | wall event form | the wall, installer portal | an event with no crew is invisible to installers |
| `crew_pto.date_start` / `date_end` | "Start Date *", "End Date *" | admin schedule → add unavailability | **add only — remove is broken** | PTO bands on the wall | see H4 |
| `event_phase_labels` | phase label select | seeded in the database | no admin screen | the phase form's options | no edit path |
| `schedule_weeks.week_start_date` | "✓ Verify" | verify page | broken | nothing | see H5 |

**Which date each screen actually shows**

| Screen | Shows |
|---|---|
| Pipeline "Delivery" cell | `jobs.delivery_date` |
| Pipeline month buckets and "ships in N weeks" | install start → calendar install → delivery |
| PM dashboard "Delivery" / "Install Start" | `jobs.delivery_date` / `jobs.install_start_date` |
| PM dashboard "ships in N weeks" | `jobs.delivery_date` only — so it can disagree with the Pipeline's identical warning |
| Schedule wall + installer portal | the calendar event, window today−30 to today+60, fetched once |
| Builder portal | the portal's own estimated delivery |

# 4. Register — numbers, money, capacity

| Column | Label(s) | Entered at | Changed at | Shows up in | Flags |
|---|---|---|---|---|---|
| `estimated_value` | "Est Value $", "Value", "Est. Value" | intake, Pipeline Add Job | Pipeline (unless locked), constraints page, job panel, Edit form | Pipeline value + rollups, engineering hours, Innergy | OVERRIDDEN on the Pipeline by the estimate; the hours page keeps using the old number |
| `pm_complexity` | "Complexity" | intake (default 1) — Pipeline-created jobs default 0 | constraints page | engineering hours | OVERRIDDEN per finish group; 0 is not a real tier |
| `box_count` | "Boxes" | **dropped by Pipeline Add Job** | Pipeline (only while the spec has none), constraints page | Pipeline, engineering hours | SILENT-DROP + OVERRIDDEN |
| `wo_count` (job) | none | nowhere | nowhere | nothing | DEAD |
| `shop_hrs`, `install_hrs` | "Shop Hrs"/"Shop h", "Install Hrs"/"Inst h" | Pipeline Add Job (via a second save) | Pipeline | capacity rollups, timeline bar length | the only Add Job numbers that survive |
| placeholder unit count + 4 per-unit numbers | "Est. unit count", "Per-unit value $", "Boxes / unit", "Shop hrs / unit", "Install hrs / unit" | Add Placeholder modal | **never** | forecast rows, link dropdown | NO EDIT PATH |
| `placeholder_id` | "Link →" | linking a real job | the same control | placeholder progress, auto-complete | |
| `estimates.sell_price_snapshot` | "Value" (locked) | never typed | estimate editor (auto, debounced) | locks the Pipeline value cell | the lock tooltip names the wrong page |
| `estimate_line_items.manual_unit_cost` | per-line cost override | estimate editor | estimate editor | wins over the catalog price | the one place the human's number wins |
| `estimate_settings` rates and base hours | 12 labelled fields | admin estimating settings | same | hours + margin math | |
| `estimate_settings` shop/install capacity per week | none | **no UI at all** | the API accepts it, nothing calls it | fetched and never rendered | DEAD front to back |
| `change_orders.co_number` | "CO #n" | auto, count+1 per job | never | CO panel, emails, the production gate | count+1 is not a sequence |
| CO totals | "Products", "Labor", "Total" | derived from line items | via line items | CO panel, CO PDF | clean |
| `invoices.invoice_number` | "Invoice #n" | assigned from a sequence on Send | never | invoice, email subject | correct by design |
| invoice total | "Total Due" | derived from line items | via line items | invoice, email | never stored, never stale |

# 5. Work order numbers — there are three

| # | Where it lives | Who sets it | What it feeds |
|---|---|---|---|
| 1 | `work_orders.wo_number`, category rows | typed on the **job page** work-orders panel ("WO #", e.g. 46508) | the STN coversheet PDF and the engineering release email |
| 2 | `finish_groups.wo_number` | typed on the **spec form** ("WO # (from shop — fill after eng. release)") | the "WO #" box on the spec PDF, next to JOB # |
| 3 | `work_orders.wo_number`, parsed rows | **not typed here at all** — read from the filename of an uploaded `WO####.pdf` at Release to Production | the same table as #1, with no dedupe |

Nothing checks any of the three against the others. Two documents can print different
"WO #" values for the same finish group. Upload is not required to advance, so a job can
reach production with no work-order rows at all.

# 6. Register — the spec sheet, and which document each field reaches

Only four tabs are live: **Finishes, Rooms, Spec Details, Summary**. The Cabinets tab is
disabled in code, the Moldings editor was removed (old molding data still prints and can
no longer be edited), and the whole Schedules v2 panel is built but connected to nothing.

| Section | Field | Client spec | Work order |
|---|---|---|---|
| Finish group | Label, finish type, color | ✔ | ✔ |
| | Species | ✔ | via derived door material |
| | Carcass, drawer box, rollout box | ✔ | ✔ |
| | Edgeband (the single picker) | ✔ | ✔ |
| | Door style, drawer front, applied panels, callouts | ✔ | ✔ |
| | Cab-door edge / inside / panel | — | ✔ |
| | Grain orientation | ✔ | ✔ |
| | Countertop material / style / edge | ✔ | ✔ |
| | Countertop **splash** | **—** | ✔ |
| | Pulls (the table) | ✔ | ✔ |
| | **Notes** | ✔ | **—** |
| | **WO #** | — | ✔ |
| | **Box count, WO count** | **—** | **—** |
| | **Edgeband schedule table** | **—** | mostly **—** |
| Rooms | Name, finish assignment, notes | ✔ | ✔ |
| | Accessories | ✔ | ✔ |
| | Trim callouts | **—** | ✔ |
| | **Flooring, ceiling height, soffit, backsplash** | **—** | **—** |
| Spec details | Spec-level hardware | ✔ (unreconciled) | ✔ (reconciled) |
| | Spec-level accessories | ✔ | ✔ on every sheet |
| | Appliances | ✔ | **—** |
| | Spec-level pulls | deleted on save | deleted on save |
| Moldings (legacy) | all | ✔ | ✔ |

**Derived, not typed** — these print without anyone entering them, which is why they go
wrong quietly: the base door material (from finish type + species + colour), the ACC
standard hinges and slides (hard-coded and auto-seeded), the work order's interior
edgeband description (from whether the carcass name contains "plywood"/"birch"), and the
slide name, which the work order forces to the schedule's value because the two sources
had disagreed.

**Client and work order disagree by construction** on hardware: the work order drops a
finish group's row when a spec-level row claims the same role; the client document prints
both. A hinge override shows once on the shop's copy and twice on the client's.

**Three different completeness gates**

| Gate | Requires |
|---|---|
| Save | label, finish type, carcass, drawer box, edgeband (paint/stain); room name + one finish; cabinet family code |
| Generate a PDF | the same list, always enforced |
| Release to engineering | base door style, base door **material**, drawer box, drawer **slides**, **hinges** |

Door style, slides and hinges are in the third list and neither of the first two. That is
why a spec can save clean, produce a client PDF, and then refuse to release.

**No lifecycle gate protects spec data.** Nothing in any spec save route checks the
lifecycle state — every field stays editable after the client has approved and after the
release to engineering.

---

# 7. Keeping this file true

`scripts/check-input-map.mjs` walks the `jobs` schema and the PATCH allow-list and fails
if a column has no row in section 2–4, and fails if this file names a column that no
longer exists. It runs in `npm run selftest`.

When you add or rename an input: add the row here first, then write the code. When you
retire one, delete the row in the same commit.
