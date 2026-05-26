# ACC Website — Changelog

Version format: `YY.MM.DD.XXX` — date of deploy + sequence if multiple deploys in one day.
Each entry: what changed and why it changed. Maintained by Claude in the deploy thread.

---

## 26.05.26.001 — 2026-05-26
**Commit:** `c7cec96`
**What:** Schedule page layout cleanup — updated job schedule page component.
**Why:** Polish pass on the schedule view.

---

## 26.05.25.001 — 2026-05-25
**Commits:** `e2fe5f6` → `8e00cd5` → `dfa925c` → `5b16205` → `9375652`
**What:** Infrastructure and core rebuild session.
- Auth refactor — unified session handling across admin and builder roles
- Jobs API consolidation
- Admin builders/libraries pages
- Core lib (db, catalogs, site helpers)
- JobsClient and QuickUploadDrawing components
- Installer, door, trim, and residential spec pages updated
- `next.config`, `db-push` script, Header component, DocuSign webhook handler, `.gitattributes`
- Types directory and admin `run-migration` endpoint added
- Migration scripts added

**Why:** Full codebase cleanup pass after Supabase/Vercel migration stabilized. Brought everything into alignment with the new stack.

---

## 26.05.25.002 — 2026-05-25
**Commits:** `58e99e0` → `ff3a3c4` → `c7bf5d1` → `5fc517c` → `ae6ad8d` → `b8887c1` → `80bd7f3`
**What:** Feature sprint — all major MES modules shipped.
- **Signoff** — client signature workflow (token URL → canvas signature → stored in `client_signoffs`)
- **Change orders** — `change_orders` + `change_order_items` tables, full CO flow
- **PM weekly hours** — `pm_time_entries` table, `/jobs/pm-hours` page, week nav, auto-pull from activity_log
- **Global search** — `/search` route across jobs/specs/PMs
- **Dashboard** — `/dashboard` summary view
- **Change password** — self-serve password change for admin/PM accounts
- **Punch list** — `punch_list_items` table, `/punch` route, photo upload support
- **Warranty** — `warranty_items` table, `/warranty` route
- **Engineering release workflow** — checklist, release panel, release API, email to shop
- **Stage-gate status advance** — status machine with doc upload gate + email on each transition
- **Gate check-in** — `gate_checkins` table, GateCheckinButton component, PM sign-off at each stage
- **Spec lifecycle v2** — `spec_lifecycle_transitions`, state machine for spec progression
- **Schedules panel** — job detail schedule view
- **PDF generation updates** — spec PDF and combined PDF improvements
- **Schedule v2** — crews API, data routes, wall calendar client, admin calendar client
- **Catalog data** — updated colors, hardware, door styles, accessories CSVs

**Why:** End-to-end MES feature set. Replaced TradeSoft for job tracking, PM workflow, and shop communication.

---

## 26.05.11.001 — 2026-05-11
**Commit:** `479c01a`
**What:** Stage-gate status transitions — doc upload gate + email notifications on each status change.
**Why:** Jobs needed a structured progression with documented handoffs between stages instead of freeform status edits.

---

## 26.05.09.001 — 2026-05-09
**Commits:** `43fd245` → `4eb1b8d`
**What:** Documentation — updated CLAUDE.md for Supabase/Vercel stack, Postgres gotchas, Claude agentic ops section. PM SOP corrections after browser testing.
**Why:** Captured the new stack decisions so future sessions don't repeat the migration debugging.

---

## 26.05.08.001 — 2026-05-08
**Commits:** `d4dd17f` → `b0929a1` → `97d32e3` → `f99f0fa` → `3a95698` → `e97847e` → `a1d1c19`
**What:** Vercel deploy debugging — first successful production deploy.
- `db.ts` — lazy-init postgres connection, callable proxy target for tagged-template literals
- `docusign.ts` — lazy-init Supabase client to prevent build-time throw
- `force-dynamic` added to all API routes and DB-fetching pages
- Boolean → integer coercion fixed in builders, portal-accounts, change-password routes
- Merge conflict resolution: kept `prepare:false`, dropped `spawnSync`, fixed comment style
- Surfaced login 500 error in response body for debugging

**Why:** `prepare:false` is required for PgBouncer transaction mode. Build-time DB initialization throws on Vercel because env vars aren't available at build. These were the two root causes of the initial deploy failures.

---

## 26.05.07.001 — 2026-05-07
**Commits:** `4e0b925` → `e8e1931` → `fccd349` → `5f67cc9` → `70b36f4`
**What:** Supabase Postgres migration + initial Vercel deployment attempt.
- Replaced SQLite/better-sqlite3 with Supabase Postgres via `postgres` npm package
- `lib/db.ts` — tagged-template `sql` helper, `uid()` via nanoid
- Vercel deployment configured, build errors resolved (null bytes, missing exports, truncated components, Turbopack issues)

**Why:** SQLite can't run on Vercel (read-only filesystem). Supabase free tier on Vercel was the chosen stack — hosted DB, no server to manage, Karl already has the account.

---

## 26.04.24.001 — 2026-04-24
**Commit:** `81a234f`
**What:** Initial commit from Create Next App.
**Why:** Project start. Next.js 16 App Router chosen — Karl runs it for other internal tools, file-based routing fits the admin/engineering/spec page structure.

---
