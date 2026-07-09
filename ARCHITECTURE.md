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
- **Supabase Postgres** *(migrated from SQLite, 2026-05-06)* — hosted on
  Supabase free tier, accessed via PgBouncer pooler (port 6543, transaction
  mode). Connection requires `prepare: false` in the `postgres` npm package
  config — PgBouncer transaction mode cannot use prepared statements.
  Deployed on Vercel; `lib/db.ts` exports a tagged-template `sql` helper.
  ~~SQLite via better-sqlite3~~ is gone — all `migrate.mjs` and
  `better-sqlite3` references are dead code if they still exist.
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

Supabase Postgres. Schema is applied via the Supabase SQL Editor
(`CREATE TABLE IF NOT EXISTS …` statements run manually as needed).
`lib/db.ts` exports `sql` (a tagged-template helper from the `postgres` npm
package) and `uid()` (a `nanoid`-based ID generator). There is no local
migration runner — schema changes go straight to Supabase.

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

- **Supabase Postgres + Vercel instead of local SQLite + self-host** —
  migrated 2026-05-06. Trade: depends on Supabase free tier (10 connection
  limit on pooler; burst load can cause transient 503s). Backups via
  `npm run backup` are still important for `data/` (catalogs, uploads).
- **CSV catalogs instead of DB-backed** — 10-year-old-easy edit story. Trade:
  no FK enforcement at the catalog level; the libraries editor warns on
  delete instead. On Vercel the filesystem is read-only after deploy — edit
  CSVs locally and redeploy; the `/admin/libraries` PUT endpoint is
  disabled on Vercel.
- **NOT NULL not enforced at SQL level on $70k cols** — pragmatic call;
  adding NOT NULL to existing Postgres columns requires careful migration.
  We rely on server-side validation + selftest catalog checks instead.
- **Schema applied manually via Supabase SQL Editor** — no local migration
  runner. `lib/db.ts` is the authoritative schema reference; `migrate.mjs`
  is a stub that prints a deprecation notice.
- **Webhook handler returns 200 on transition errors** — we don't want
  retry storms hammering the endpoint. Failures persist to `webhook_errors`
  so they surface on investigation (selftest DB checks skip this on Supabase
  since `selftest.mjs` is SQLite-based and all DB checks SKIP when no local
  `acc-jobs.db` exists).
- **Excel render hard-blocks 3+ finish groups** — instead of silently under-
  filling. The Artifex template needs to be extended (or a different
  approach taken — e.g. a multi-page schedule layout) before we lift the
  block.
- **DocuSign archived in favour of in-house e-sig** — Phase 2.3 (2026-05-09)
  ships token URL → canvas signature → PM email. The DocuSign webhook route
  remains in the codebase but returns 503 unless `DOCUSIGN_INTEGRATION_KEY`
  is set. `lib/approvals.ts` and `lib/docusign.ts` are retained as scaffolding.

## Known limitations / future work

- **No CI** — selftest runs only when manually invoked. CI scaffolding is
  in `.github/workflows/selftest.yml` ready for when Karl pushes to GitHub.
- **selftest DB checks skip on Supabase** — `scripts/selftest.mjs` is
  SQLite-based and gracefully SKIPs all DB checks when no local `acc-jobs.db`
  exists. Catalog and TypeScript checks still run. Rewriting selftest for
  async Postgres is a future task.
- **No mobile intake rewrite** — basic responsive pass shipped, but the
  rooms/finishes tabs aren't accordion-style for iPhone-narrow viewports.
  Phase 7 in the road map.
- **No off-site backup** — `npm run backup` writes to `data/backups/` on
  local disk. A daily Wasabi/S3 sync is recommended.
- **Engineer role not fully populated** — schema + UI ready, but no engineer
  accounts seeded. Karl creates via `/admin/builders` once needed.
- **Combine PDF (spec + drawings merge) not wired** — `POST /api/specs/[id]/combine`
  returns 501 until Supabase Storage is set up for drawings. Spec-only PDF
  (`/generate`) works fine.

## When in doubt

- `npm run selftest` checks catalogs + TypeScript. DB checks SKIP on Vercel
  (no local SQLite). Green on catalog + tsc = system is structurally sound.
- `data/backups/{latest}.tar.gz` restores catalog and upload data.
