# ACC Website — Architecture Notes

This document captures the *why* behind the system, so anyone (a new
developer, future-Karl, future-Claude) can pick up the codebase without the
chat history that produced it.

## Purpose

The website replaces a Cabinet Vision (CV) Express-quote workflow that caused
a $70k mistake when silent default values flowed through a spec form
unchallenged. The replacement enforces *explicit pick* on every load-bearing
field and produces a spec PDF + drawings PDF combined output that the shop
treats as authoritative.

## Stack and platform decisions

- **Next.js 16 App Router + Turbopack** — chosen because Karl already runs it
  for other internal tools, and it gives us file-based routing for the
  admin/engineering/spec pages without a separate API server.
- **SQLite via better-sqlite3 with WAL mode** — chosen for zero-ops, file-
  based persistence on Karl's Windows host. WAL mode lets the dev server +
  CLI scripts (migrate, backup, rotate-pw, selftest) coexist without lock
  contention. Hard ceiling around 5-10 concurrent writers; revisit when ACC
  has more than 3 PMs editing simultaneously (Phase 4 Postgres migration).
- **CSV→JSON catalog pipeline** — `data/catalogs/*.csv` is the source of
  truth, `scripts/sync-catalogs.mjs` regenerates JSON used at runtime. CSV
  was chosen over a "real" database for catalogs because Karl can edit them
  in Excel (10-year-old-easy was a stated requirement) and they don't change
  often. The `/admin/libraries` page brings that UX to the browser without
  removing the CSV-on-disk option.
- **@react-pdf/renderer for spec PDFs** — programmatic, parametric, version-
  controlled. The CV-style title block is rebuilt from primitives in
  `lib/pdf-spec.tsx` (Karl's "Option A").
- **pdf-lib for combine** — merges spec PDF + most-recent drawings PDF into
  one stack. Loaded via dynamic import so the route degrades gracefully if
  the dep is missing.
- **exceljs for Artifex template render** — opens `data/templates/spec-
  template.xlsx`, fills cells per the documented map. Same dynamic-import
  graceful degradation. Hard-blocks at 3+ finish groups (Artifex template
  only has 2 schedule slots; under-fill would be a $70k repeat).

## Data model

Single SQLite file at `data/acc-jobs.db`. Schema lives in TWO places that
must stay in sync:

1. `lib/db.ts` — runs on first import (i.e. first request to the dev server).
2. `scripts/migrate.mjs` — runs via `npm run migrate` for CLI/deploy paths.

The selftest's "required tables/columns" check fails loudly if drift occurs.

### Core tables

- `jobs` — the customer/site/builder identity. One job, many spec types
  (residential / commercial / trim / doors).
- `residential_specs` — one spec per (job × cabinet quote). Has
  `lifecycle_state` for the state machine.
- `finish_groups` — N per spec. Each is a "Painted/Stained/Melamine A" set
  of decisions: door style, color, pull, **carcass material**, **drawer
  box**, **edgeband**, moldings. The bolded three are the $70k columns —
  must be non-NULL, validated server-side and surfaced in selftest.
- `rooms` — N per spec. Free-form names (kitchen, master bath) with
  catalog-suggested autocomplete.
- `room_finishes` — many-to-many between rooms and finish_groups, with a
  free-text `zone` column ("Perimeter", "Island", "Tall panels"). Multi-
  finish-per-room is the most-common case, so this junction is mandatory
  for new specs. Legacy `rooms.finish_group_id` is a back-compat shim.
- `finish_moldings` — N per finish_group. Each has a
  type (`toe_skin`, `base_shoe`, etc. — finite list in catalog), profile
  (catalog ref or free text), qty_lf, where-used rooms (m2m via
  `finish_molding_rooms`).
- `room_accessories` — N per room. References `accessories_reva.csv` IDs.
- `cabinet_line_items` — kept in schema but UI-disabled (Karl chose CV
  drawings as the source of truth, not manual cabinet entry).
- `builder_accounts` + `builder_sessions` — auth. `role` ∈
  {admin, user, engineer}. Bootstrap admin
  (`residential@advancedcabinets.net`) seeds on first migrate.
- `spec_lifecycle_transitions` — append-only audit of every state move.
- `approval_requests` — DocuSign envelope tracking (scaffolded; live when
  DOCUSIGN_INTEGRATION_KEY env is set).
- `webhook_errors` — persisted webhook failures so silent failures get
  surfaced by selftest.

## Spec lifecycle state machine

```
DRAFT → CLIENT_APPROVED → RELEASED_TO_ENG → ENGINEERED → RELEASED_TO_SHOP
```

Implemented in `lib/lifecycle.ts`. Forward edges only; backwards is allowed
but requires a non-empty `reason` (re-spin). Every transition appends to
`spec_lifecycle_transitions` for audit.

**Role gates** (in `app/api/specs/[id]/lifecycle/route.ts`):
- `user` (PM): DRAFT → CLIENT_APPROVED only.
- `engineer`: any forward edge, plus any backwards re-spin.
- `admin`: anything.

**Why backward-with-reason instead of disabled-backward?** Real life
demands re-spins — client changes mind, engineering catches PM error,
shop flags issue pre-cut. Forcing those through the system as DELETE+CREATE
loses the audit trail. With reason-required, we keep the trail and the
reason becomes part of the org learning loop.

**Why auto-advance on DocuSign COMPLETED?** Karl's chosen approval
workflow ships the combined PDF to the client via DocuSign envelope; when
the client signs, that's the affirmative we needed to advance to
CLIENT_APPROVED. We gate the auto-advance on `approval_requests.sent_at`
being set — i.e., we only advance if the PM actually sent the envelope
(not just drafted it).

## Authentication and authorization

- Cookie-based session (`acc_builder_session`), 30-day TTL.
- bcrypt password hashing (12 rounds).
- `requireBuilder()` / `requireRole()` are server-side helpers. Role-gated
  pages: `/admin/**` (admin), `/engineering/**` (engineer | admin).
- The bootstrap admin is created on first migrate. Karl rotates with
  `npm run rotate-admin-pw "<password>"`.

## Catalog freshness

CSV is the source of truth. `data/catalogs/*.csv` → `*.json` on every save
via `sync-catalogs.mjs`. The parser:
- Treats free-text columns (notes, description, comment) literally — `;` is
  punctuation, not a list separator.
- Coerces numeric columns (suffix `_in`, `_lf`, `_qty`, etc.) to JS numbers.
- Splits semicolons into arrays for non-free-text columns.

`/admin/libraries` lets the admin edit any CSV in the browser. Header row is
locked to prevent schema drift via UI. Row delete consults a reverse-FK map
(`REVERSE_FK_BY_LIBRARY` in the route handler) and warns when downstream
references exist.

## File storage

- Job-level files: `data/jobs/{job_id}/files/{kind}/{ts}-{filename}`.
  Kinds: `plans`, `appliances`, `site`, `drawings`. Plans stay forever;
  drawings rotate as engineering iterates.
- Generated PDFs/Excels: `data/jobs/{job_id}/specs/{spec_id}/`.
- Catalog snapshots: `data/archives/`.
- Backups: `data/backups/` — written by `npm run backup`, pruned at 30 days.

## Operational scripts

- `npm run dev` — Next dev server on :3000. Applies migrations as side-effect.
- `npm run migrate` — apply schema migrations standalone (no server).
- `npm run selftest` — full regression check (catalog FK, DB shape, role
  state machine, approval state machine, tsc compile).
- `npm run rotate-admin-pw "<pw>"` — rotates the bootstrap admin password.
- `npm run backup` — tar.gz of `data/`, written to `data/backups/`.
- `npm run cleanup-orphan-fgs` — list-or-delete orphan finish_groups.
- `npm run sync-catalogs` — CSV → JSON regeneration (also runs on prebuild).
- `npm run health` — one-stop ops diagnostic (planned).

## Tradeoffs we explicitly accepted

- **SQLite + filesystem instead of Postgres + S3** — fewer moving parts on
  Karl's host. Trade: no off-site replication; backups are critical.
- **CSV catalogs instead of DB-backed** — 10-year-old-easy edit story. Trade:
  no FK enforcement at the catalog level; the libraries editor warns on
  delete instead.
- **NOT NULL not enforced at SQL level on $70k cols** — SQLite can't ALTER
  to add NOT NULL on existing columns without a table rebuild. We rely on
  server-side validation + selftest. Real fix is Postgres migration.
- **Schema mirrored in lib/db.ts and migrate.mjs** — single source of truth
  would be cleaner. Pragmatic choice: schemas are short, drift is caught by
  selftest. Refactor candidate: extract to a `.sql` file both files load.
- **Webhook handler returns 200 on transition errors** — we don't want
  DocuSign's retry storm hammering us, but we DO need to know when it
  fails. We persist to `webhook_errors` and selftest fails when non-empty.
- **Excel render hard-blocks 3+ finish groups** — instead of silently under-
  filling. The Artifex template needs to be extended (or a different
  approach taken — e.g. a multi-page schedule layout) before we lift the
  block.

## Known limitations / future work

- **No CI** — selftest runs only when manually invoked. CI scaffolding is
  in `.github/workflows/selftest.yml` ready for when Karl pushes to GitHub.
- **No mobile intake rewrite** — basic responsive pass shipped, but the
  rooms/finishes tabs aren't accordion-style for iPhone-narrow viewports.
  Phase 7 in the road map.
- **No off-site backup** — `npm run backup` writes to `data/backups/` on the
  same disk. A daily Wasabi/S3 sync is recommended.
- **Engineer role not fully populated** — schema + UI ready, but no engineer
  accounts seeded. Karl creates via `/admin/builders` once needed.
- **DocuSign live integration** — webhook handler is wired; envelope-create
  call is not. Pending Karl provisioning DocuSign account + integration key.

## When in doubt

- `npm run selftest` is the canary. Green = system is internally consistent.
- `data/backups/{latest}.tar.gz` restores everything.
- Karl's `KARL_TODO.md` is the ledger of "things only Karl can do."
- The `EOD_*.md` files at the repo root are end-of-day status snapshots.
