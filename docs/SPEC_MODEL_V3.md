# Spec Model v3 — the shape

Design decision record. Karl's answers incorporated 2026-08-07. Not built yet.

Every schema claim here is checked against `acc-schema-2026-08-06_203230.sql`
(pg_dump of production) and row counts against `acc-dbstats-2026-08-06_203230.json`.
Never against `scripts/db-push.mjs` — that file has drifted badly.

---

## 0. Three findings that shrink this dramatically

**A. `finish_group_hardware` has ZERO rows. That single table is the blocker.**

The release gate needs five things per finish group. Row counts:

| Gate field | Table | Rows (12 finish groups exist) |
|---|---|---|
| base door style | `finish_group_door_fronts` | **10** |
| base door material | `finish_group_door_fronts` | **10** |
| drawer box | `finish_group_drawers` | **10** |
| drawer slides | `finish_group_drawers` | **10** |
| **hinges** | `finish_group_hardware` | **0** |

Door fronts and drawers are already populated for most FGs — so the Schedules data
path has been exercised. **Hinges are the universal blocker.** Auto-seeding hinges and
slides as ACC Standards likely unblocks nearly every existing spec on its own. That is
a very small change for the whole downstream workflow.

**B. Four tables for exactly this design already exist in production, all empty.**

`builder_palettes`, `builder_palette_finish_groups`, `builder_floor_plans`,
`builder_floor_plan_rooms` — schema present, zero rows, referenced by no code in the
repo. Someone already designed profiles-as-template-finish-groups and repeatable floor
plans. Because they're empty, they are **free to redesign or drop** with no migration.

**C. The appliance library exists and is empty, but 21 appliances have been typed in.**

`catalog_appliances` (`appliance_type, manufacturer, model_no, cutout_w/h/d, notes`) is
empty. `spec_appliances` has **21 rows** with matching columns. So Karl's auto-learn
idea is not new work — it's wiring, plus a one-time backfill of the library from those
21 rows.

Also: `builders` has **0 rows** while `catalog_builder_profiles` has **8**. The
"unified builders" migration never ran. `catalog_builder_profiles` is the live table.

---

## 1. The problem, stated once

A spec asks a human for ~500 values, in an order that doesn't match how the work
arrives, and refuses to remember anything until all of them are supplied. Hence 7
specs against 312 jobs.

Almost none of those are decisions. Slides are undermount soft-close. Hinges are 110°
soft-close. Carcass is whatever that builder always gets. The genuinely job-specific
set is small.

**Stop asking. Load what we know, mark it as loaded, make a human confirm it once.**
The spec becomes a review, not data entry.

---

## 2. Three layers of provenance

| Layer | Scope | Examples | Override |
|---|---|---|---|
| **ACC Standard** | every job, always | 110° soft-close hinges · undermount soft-close drawer slides · ball-bearing side-mount pullout slides | allowed, **requires a note** |
| **Template default** | per builder / per ACC tier / per floor plan | grain orientation, cab door style, carcass, drawer box, accessories, appliance package, room list | free |
| **Job-specific** | this spec only | paint colour, door style if unusual, counts | n/a |

The ACC Standard layer is the safety mechanism. It is not a suggestion — it is what we
build unless someone says otherwise, and saying otherwise leaves a written reason.

---

## 3. Templates are template SPECS, not template finish groups

Revised from the first draft. Karl's answers to #3 and #4 force it, and it's simpler.

Four things need seeding and they live at three different levels:

- finish groups → FG level
- rooms → spec level (this is what a floor plan is)
- appliances → spec level
- accessories → room level

A **template spec** covers all four in one mechanism.

```
residential_specs
  + is_template     boolean default false                <-- NEW
  + template_name   text                                 <-- NEW
  + template_scope  text  'acc_tier' | 'builder' | 'floor_plan'   <-- NEW

catalog_builder_profiles          (8 live rows — the real table)
  + template_spec_id  text -> residential_specs(id)      <-- NEW
```

A template is a normal spec flagged `is_template`, excluded from every job-facing
query. Applying it deep-copies FGs (with their door-front, drawer, hardware and
material rows), rooms, room accessories and appliances into the target spec.

**One mechanism now covers all four of Karl's cases:**

| What Karl wants | How it's expressed |
|---|---|
| ACC Economy / Standard / Premium | template spec, 0 rooms, `scope='acc_tier'` |
| Atlas Homes standard | template spec with Atlas's FGs + appliance package |
| Atlas Model 2400 floor plan | template spec **with rooms**, `scope='floor_plan'` |
| "New builder matches Atlas — start there" | apply Atlas's template |
| "Save this FG set as a new profile" | copy this spec → new template |

A template with no rooms is a pure profile. A template with rooms is a floor plan.
Same object, different completeness. Nothing to reconcile.

**Consequence: drop the four empty tables.** `builder_palettes`,
`builder_palette_finish_groups`, `builder_floor_plans`, `builder_floor_plan_rooms` all
become redundant. They're also worse — `builder_palette_finish_groups` duplicates only
*some* finish-group columns (no grain orientation, no species, no edgeband, no
schedule rows), so every future FG field would need adding twice. Editing a template
spec uses the spec editor you already know.

Also note both use `builder_company` as a **text name**, not a foreign key — the same
string-matching fragility as portal tenancy. Another reason to drop them.

---

## 4. Abstract catalog items

The client signs off on **"ACC Standard Prefinished Plywood."** The shop builds from
**"Maple ¾ prefinished, vendor X, SKU Y."** Two different facts. Conflating them means
a market switch to birch would require re-speccing every open job.

```
catalog_species / catalog_drawer_boxes / catalog_carcass_materials / hardware catalogs
  + is_abstract   boolean default false                  <-- NEW
  + resolves_to   text (concrete id in the same catalog)  <-- NEW
```

- `ACC-STD-PREFIN-PLY` → resolves to `MAPLE-PREFIN-34`
- Market moves → change one pointer → every open job follows. No re-spec, no client
  re-approval, because the client agreed to the standard, not the species.
- If a client **specifically** asks for maple, the spec points at the concrete item and
  a later swap does not touch it. **Abstract items follow the market; concrete ones
  don't.** That asymmetry is the point.

**Karl's own PAINT GRADE example is exactly this.** Paint grade can be MDF, poplar,
maple or select alder depending on what's being bought. So `PAINT-GRADE` is an
abstract item resolving to whatever the current substrate is — and it's the canonical
case for the whole pattern.

Applies to: prefinished ply, drawer boxes, paint-grade substrate, and most hardware
(`ACC Standard 110° Soft-Close Hinge` → whatever brand we buy this quarter).

Printing rules:
- **Client-facing** docs print the abstract name only.
- **Shop / WO / purchasing** docs print `abstract → resolved`.

Phase 2: a `catalog_resolutions` history table so "what did ACC Standard Ply mean in
March" is answerable for warranty. Not needed for v1.

---

## 5. Door material is derived

Base door material is the species — or the melamine, when it's melamine. It stops
being an independent dropdown.

| Finish type | Door material |
|---|---|
| stain | the FG's **species** |
| melamine | the FG's **melamine colour** |
| **paint** | the FG's **species**, filtered to the paint list |

**The species catalog is not cut. It is filtered by finish type.** (Karl,
2026-08-07, correcting an earlier misreading of this doc: *"IF paint is selected
those are the species options. IF stain is selected we need the other options."*)

One `species` field, one catalog, two views of it:

| Finish type | Species options |
|---|---|
| paint | **PAINT GRADE** (default) · RED OAK · WHITE OAK · RIFT WHITE OAK · Other |
| stain | the stain-grade species — Alder, Maple, Cherry, Walnut, Hickory, Ash, the oaks… |
| melamine / plam | n/a — the melamine colour *is* the material |

Red oak under paint is a real request (grain shows through on purpose), so it has to
appear on the paint list even though it is a stain species.

`data/catalogs/species.csv` already carries the `grades` column that drives this —
`Poplar → Paint Grade`, `MDF → Paint Grade`, `Maple (Hard) → Select;Paint Grade`. The
filter reads that column rather than hard-coding two lists, so the dropdown follows
the library instead of the code.

Karl on the stain side: *"the stain options really aren't exhaustive, but if I can
freely update the libraries it's not a big deal."* So this is not a one-time list
decision — it is a requirement that species be editable without a deploy. Until the
catalogs move into the database that means editing the CSV and pushing, which is the
argument for the catalog tables in step 5.

**`grade` folds into `species`.** `data/catalogs/species.json` already nests grades
under species (`Alder` → Select / Rustic / Knotty), the UI already derives the grade
dropdown from the chosen species, and `express/submit` already writes `"paint_grade"`
as a *species* value. Nobody says "species Maple, grade Paint." Combined entries, one
field, drop `finish_groups.grade`. 12 rows to migrate.

Leave `DoorMaterial` and `MoldingMaterial` alone — their species/grade pair is the
door-material catalog, a different axis.

---

## 6. Pullouts — default to the safe failure

Both drawer rows always exist on every FG: `role='drawer'` and `role='pullout'` in
`finish_group_drawers` (the table already has `role` and `slot_label`).

Pullout box options: **PF PLY** (default) · dovetail buyout · none

Karl's reasoning, which is the right way round: defaulting to PF PLY when the job has
no pullouts is harmless. Defaulting to `none` when the job *does* have pullouts is a
problem on the floor. **So the default fails safe.** The PM confirms rather than
supplies.

---

## 7. Appliances — a library that learns

`catalog_appliances` already exists with the right columns and zero rows;
`spec_appliances` has 21 rows.

1. **Backfill** the library from those 21 rows, deduped on
   `(appliance_type, manufacturer, model_no)`.
2. **Typeahead** on the spec builder: type "microwave" or a part number, filter the
   library, click to fill manufacturer, model and all three cutout dimensions.
3. **Auto-learn**: saving an appliance not in the library adds it. The library grows
   from real use instead of needing to be built up front.
4. **Packages**: a named set, e.g. *Atlas Production Home Standard*. Expressed as
   appliances on a **template spec** (§3) — no new table.

So putting the builder on a job loads their FG defaults *and* drops their standard
appliances onto Spec Details. Changeable, but nothing has to be typed.

**One caution:** cutout dimensions are `text` in `catalog_appliances` and `numeric` in
`spec_appliances`. Normalise on backfill or the copy will fail on entries like `30"`.

---

## 8. Provenance

```
finish_groups
  + seeded_from_template_id  text                        <-- NEW
  + seeded_at                timestamptz                 <-- NEW
  + confirmed_by             text                        <-- NEW
  + confirmed_at             timestamptz                 <-- NEW

finish_group_door_fronts / _drawers / _hardware / _materials
  + source         text  'acc_standard' | 'template' | 'manual'   <-- NEW
  + override_note  text                                           <-- NEW
```

1. **Overriding an ACC Standard requires a note.** `source='manual'` and the value
   differs from the ACC Standard for that role → `override_note` must be non-empty.
   Enforced server-side.
2. **A finish group is unconfirmed until a human saves it.** Seeding sets `seeded_at`;
   a human save sets `confirmed_by` / `confirmed_at`. **One confirm per FG** (Karl's
   answer to #5) — matching "each FG runs the shop as its own job."
3. Documents show it: *"Seeded from Atlas Homes — confirmed by Karl 8/7/26"*, or in
   red, *"NOT CONFIRMED."*
4. The query that prevents the next $70k becomes possible: **which released specs
   contain a finish group nobody confirmed?**

Same shape as the estimate-vs-actual comparison already in the pipeline.

---

## 9. The release gate

Replaces `validateForRelease()` (`lib/lifecycle.ts:35-86`) and shrinks the 54-item /
44-manual-checkbox engineering checklist.

**Per finish group:**
1. finish type, carcass, drawer box, door style, grain orientation set
2. a resolvable door material (§5)
3. hardware rows present for hinges and slides — auto-seeded, so free
4. every ACC Standard override carries a note
5. **confirmed by a human**

**Per spec:** every room has at least one finish group assigned.

Enforced per FG, no partial release.

Item 5 does the real work. Forty-four checkboxes someone ticks knowing several are
false teaches everyone to distrust the gate. One deliberate confirmation per finish
group, against values already filled in, is a review a person can perform honestly.

---

## 10. Build order

| # | Step | Why here |
|---|---|---|
| 1 | Mount the Schedules tab — add `"schedules"` to the tab union (`ResidentialSpecClient.tsx:716`) and the tab bar (`:1565`) | Nothing downstream is testable until those tables are reachable. Three lines. |
| 2 | `acc_standards` table + seed hinges / drawer slides / pullout slides; auto-seed rows on FG create; backfill the 12 existing FGs | **`finish_group_hardware` is empty — this alone likely unblocks every existing spec.** |
| 3 | Provenance columns, confirmed/unconfirmed, note-required-on-override | **Must land before defaults flow**, or we've rebuilt the $70k bug with better branding |
| 4 | Rewrite the release gate per §9 | Unblocks engineering, work orders, shop release |
| 5 | Abstract catalog items + seed `PAINT-GRADE`, `ACC-STD-PREFIN-PLY`, hardware standards | Defaults become spec-level instead of SKU-level |
| 6 | `is_template` on residential_specs + `template_spec_id` on profiles + apply / save-as-template; drop the 4 empty palette tables | Profiles, tiers and floor plans all become real at once |
| 7 | Appliance library: backfill 21, typeahead, auto-learn | Independent of everything above |
| 8 | Species/grade merge; pullout row default | Cleanup, anytime |
| 9 | Cut the 44-checkbox list down to genuinely per-job items | Only safe once §9 is trusted |

**Step 3 before step 5 is the one ordering that is not negotiable.**

Steps 1 and 2 together are small and probably unblock the existing 7 specs. Worth
shipping alone and watching before anything else.

---

## 11. Still open

- **Floor plan room mapping is real work**, not code: figuring out which Atlas model
  has which rooms. The system can hold it as soon as §3 lands; someone has to enter it
  once per plan.
- `catalog_carcass_materials` was not inspected for abstract-item suitability.
- Whether `finish_group_materials` (0 rows) is still wanted, or is superseded by the
  flat carcass/edgeband columns on `finish_groups`.
