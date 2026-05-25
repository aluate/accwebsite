# Commit Plan — 2026-05-16

> Triage of 158 dirty files in `C:\dev\repos\acc-website`. Built from a disk audit on 2026-05-16.
> Goal: turn an undifferentiated wall of uncommitted work into 8 reviewable commits, then push.
>
> **Run from PowerShell or Git Bash in `C:\dev\repos\acc-website`.** Each block is one commit. Read the rationale, run the commands, then move on. Stop any time — nothing in this plan is irreversible until the final `git push`.

---

## Pre-flight checks (run first, no changes)

```sh
# Confirm you're on master with a clean .git/index.lock (no stale locks)
git status -s | wc -l                          # expect ~158
git log --oneline origin/master..HEAD          # 9 unpushed deploy-fix commits
ls .git/index.lock 2>$null                     # should print nothing — if it does, delete it

# If a lock file is present:
#   rm .git\index.lock
```

If `git status` hangs or errors with "Another git process seems to be running," close any other Claude / IDE sessions that have this repo open, then delete `.git\index.lock`.

---

## Commit 1 — Line-ending normalization

**Why:** 43 of the 112 modified files are pure CRLF/LF churn — no real content change. Without normalizing, every Windows edit re-creates this noise.

I've already written `.gitattributes` for you (LF for text, CRLF preserved for `*.bat` / `*.ps1` / `*.cmd`, binaries explicit). The `--renormalize` step rewrites all tracked text files to match.

```sh
git add .gitattributes
git add --renormalize .
git status -s | wc -l                          # should drop substantially (e.g. ~115)
git commit -m "chore: normalize line endings to LF via .gitattributes"
```

**Verify:** `git status -s` should now show only files with *real* changes (~69 modified + 46 untracked).

---

## Commit 2 — Delete .bak cruft

**Why:** Editor backups that should never have been added.

```sh
rm "app/jobs/[id]/residential/[specId]/page.tsx.bak"
rm "app/jobs/layout.tsx.bak"
git add -A app/jobs
git commit -m "chore: remove .bak editor backups"
```

---

## Commit 3 — Schedule V2 (feature + spec + roadmap)

**Why:** The audit on 2026-05-16 confirmed Schedule V2 (Features 1–9 from `SCHEDULE_V2_SPEC.md`) is built, working, and matches the spec — minus the gaps documented in `SCHEDULE_V2_ROADMAP.md`. Ship it as one feature commit.

**Files:**

```sh
git add components/AdminScheduleClient.tsx
git add components/ScheduleWallClient.tsx
git add components/AddEventForm.tsx
git add components/PhaseIntakeClient.tsx
git add components/ReadyToScheduleButton.tsx
git add "app/admin/(protected)/schedule/page.tsx"
git add app/schedule/page.tsx
git add app/api/schedule/data/route.ts
git add app/api/schedule/events/route.ts
git add "app/api/schedule/events/[id]/route.ts"
git add app/api/schedule/crews/
git add app/api/schedule/phase-labels/
git add app/api/schedule/pto/
git add app/api/schedule/admin-queue/
git add app/api/schedule/change-requests/
git add app/api/schedule/ready/
git add "app/jobs/[id]/schedule/"
git add lib/schedule.ts
git add lib/schedule-utils.ts
git add lib/schedule-holidays.ts
git add lib/schedule-types.ts
git add scripts/migrate-schedule-v2.mjs
git add scripts/seed-schedule.mjs
git add docs/SCHEDULE_V2_SPEC.md
git add docs/SCHEDULE_V2_ROADMAP.md

git commit -m "feat(schedule): Schedule V2 — phase intake, PTO, ready-to-schedule, spanning bars

- Phase intake on /jobs/[id]/schedule (max 5, parent_event_id chain, blocked_on)
- PTO admin tab + crew_pto table + /api/schedule/pto CRUD
- Ready-to-schedule button + /api/schedule/ready (cab_delivery + install on-deck pair)
- Pull-from-schedule via schedule_change_requests with approve/deny
- Admin queue tab aggregating on-deck jobs, change requests, PTO
- Spanning bars with global lane assignment, HOT stripe, holiday cell labels
- Mobile weekly view with swipe nav + dual Schedule/On-Deck tabs
- Desktop month picker + jump-to-date; TV mode chrome strip via ?tv=1
- Working-day calculator (lib/schedule-utils.ts) + 7 observed holidays
- Duration input on Add Event form (dual-mode start+duration+end)
- Schema: actual_start, actual_end, can_schedule, event_phase_labels,
  schedule_change_requests (see scripts/migrate-schedule-v2.mjs)

Spec: docs/SCHEDULE_V2_SPEC.md
Gaps and next steps: docs/SCHEDULE_V2_ROADMAP.md"
```

---

## Commit 4 — Phase H foundation: schema + stage-gate core

**Why:** All of Phase H + L + M depends on the schema additions in `db-push.mjs` and `warranty-schema.sql`. Stage-gate transition logic (`lib/lifecycle.ts`, `lib/transition-gates.ts`, `lib/signoff.ts`) is the foundational layer. Commit them together so subsequent feature commits land on a working schema base.

```sh
git add scripts/db-push.mjs
git add scripts/warranty-schema.sql
git add lib/lifecycle.ts
git add lib/transition-gates.ts
git add lib/signoff.ts
git add components/StatusAdvanceButton.tsx
git add components/ReleaseToProductionButton.tsx
git add components/SignoffButton.tsx
git add components/SendSignoffButton.tsx
git add "app/api/jobs/[id]/advance/"
git add app/api/signoffs/
git add app/signoff/
git add app/engineer/
git add "app/engineering/[specId]/page.tsx"
git add app/api/specs/[id]/lifecycle/route.ts

git commit -m "feat(phase-h): stage-gate transitions + schema foundation

Adds the schema and core logic for Phase H operations:
- Schema (db-push.mjs): warranty_items, work_orders, punch_list_items,
  transition_emails, client_signoffs, change_orders, change_order_items
  (gate_checkins and pm_time_entries land in Phase L+M)
- lib/lifecycle.ts updated for atomic status advance + doc upload gate + email fire
- lib/transition-gates.ts: config-driven per-transition rules
- lib/signoff.ts: client signoff workflow
- /api/jobs/[id]/advance: status advance API
- /api/signoffs + /app/signoff + /app/engineer pages
- StatusAdvanceButton + ReleaseToProductionButton + SignoffButton components"
```

---

## Commit 5 — Phase H operations: punch + warranty + change-orders

**Why:** Three parallel operations panels hung off the job detail page.

```sh
git add app/punch/
git add app/api/punch-items/
git add "app/api/jobs/[id]/punch-items/"
git add components/PunchListPanel.tsx
git add app/warranty/
git add app/api/warranty/
git add "app/api/jobs/[id]/warranty/"
git add components/WarrantyPanel.tsx
git add app/api/change-orders/
git add "app/api/jobs/[id]/change-orders/"
git add components/ChangeOrdersPanel.tsx

git commit -m "feat(phase-h): punch, warranty, and change-orders panels

- /punch with PunchListPanel + punch_list_items CRUD
- /warranty with WarrantyPanel + warranty_items CRUD
- ChangeOrdersPanel on job detail page; change_orders + items APIs"
```

---

## Commit 6 — Phase H navigation: search + dashboard + unified login + jobs UI

**Why:** Surfaces the new features in nav, replaces five separate login routes with one unified login, and ships the new jobs UI.

```sh
git add app/search/
git add app/api/search/
git add app/dashboard/
git add app/change-password/
git add app/api/change-password/
git add app/login/page.tsx
git add app/api/login/route.ts
git add app/api/admin/login/route.ts
git add app/api/auth/login/route.ts
git add app/api/express/login/route.ts
git add app/api/portal/auth/login/route.ts
git add app/api/portal/auth/change-password/route.ts
git add components/Header.tsx
git add components/JobsClient.tsx
git add components/QuickUploadDrawing.tsx
git add app/api/spec-debug/
git add app/jobs/page.tsx
git add "app/jobs/[id]/page.tsx"

git commit -m "feat(phase-h): unified login, search, dashboard, jobs UI

- /search + /api/search global search
- /dashboard with at-a-glance operations widgets
- Unified /login replaces /admin/login, /express/login, /portal/auth/login
- /change-password flow
- Header.tsx adds nav for new routes
- JobsClient + QuickUploadDrawing surface stage-gate panels on job detail
- /api/spec-debug debug endpoint"
```

---

## Commit 7 — Phase L+M: gate check-in + PM weekly hours

**Why:** Depends on Phase H components (StatusAdvanceButton, transition-gates logic) and on the schema added in Commit 4. Schema additions (`gate_checkins`, `pm_time_entries`) already shipped in Commit 4's `db-push.mjs`.

```sh
git add "app/api/jobs/[id]/gate-checkin/"
git add app/api/jobs/pms/
git add app/api/pm-hours/
git add app/jobs/pm-hours/
git add components/GateCheckinButton.tsx

git commit -m "feat(phase-l-m): gate check-in + PM weekly hours

- Gate check-in flow with GateCheckinButton + gate_checkins table
- PM weekly hours at /jobs/pm-hours + /api/pm-hours + pm_time_entries table
- /api/jobs/pms PM roster endpoint"
```

---

## Commit 8 — Catalog refresh

**Why:** Independent of all the above; pure library data.

```sh
git add data/catalogs/
git commit -m "data(catalogs): refresh paint, stain, melamine, door styles, edgeband, hinges

+746/-179 across 14 .csv/.json catalog files. No code changes."
```

---

## Commit 9 — Docs and meta

**Why:** Everything else: planning docs, SOPs, type stubs, imports.

```sh
git add ARCHITECTURE.md
git add CLAUDE.md
git add KARL_TODO.md
git add TODO.md
git add docs/ROLES_ROUTES_V1_SPEC.md
git add ROADMAP.md
git add SPEC_AUDIT.md
git add data/site.ts
git add next.config.ts
git add push-to-github.bat
git add types/
git add ACC_Admin_SOP.docx
git add ACC_PM_SOP.docx
git add ACC_Residential_Disclosure_DRAFT.docx
git add ACC_Jobs_Import.csv
git add ACC_Jobs_WithIDs_Import.csv

# Other intake/express touch-ups that don't fit elsewhere:
git add app/api/admin/logout/route.ts
git add app/api/auth/logout/route.ts
git add app/api/express/logout/route.ts
git add app/api/admin/builders/route.ts
git add app/api/admin/portal-accounts/route.ts
git add app/api/admin/libraries/[name]/route.ts
git add app/api/admin/jobs/[id]/portal/route.ts
git add "app/admin/(protected)/builders/page.tsx"
git add "app/admin/(protected)/jobs/[id]/portal/page.tsx"
git add app/api/contact/route.ts
git add app/api/docusign/webhook/route.ts
git add app/api/express/submit/route.ts
git add "app/api/jobs/[id]/files/route.ts"
git add "app/api/jobs/[id]/route.ts"
git add app/api/jobs/route.ts
git add "app/api/portal/jobs/[id]/change-request/route.ts"
git add "app/api/portal/jobs/[id]/drawing-comments/route.ts"
git add "app/api/portal/jobs/[id]/files/route.ts"
git add "app/api/portal/jobs/[id]/required-inputs/route.ts"
git add app/api/specs/[id]/approval/preview/route.ts
git add app/api/specs/[id]/approval/send/route.ts
git add app/api/specs/[id]/archive/route.ts
git add app/api/specs/[id]/combine/route.ts
git add app/api/specs/[id]/excel/route.ts
git add app/api/specs/[id]/generate/route.ts
git add app/api/specs/[id]/route.ts
git add app/api/specs/[id]/save/route.ts
git add app/api/specs/[id]/schedules-init/route.ts
git add app/api/specs/[id]/schedules/route.ts
git add app/api/specs/route.ts
git add app/api/trim-specs/[id]/save/route.ts
git add app/api/trim-specs/route.ts
git add "app/api/door-specs/[id]/save/route.ts"
git add app/api/door-specs/route.ts
git add app/api/archives/[id]/restore/route.ts
git add app/express/orders/page.tsx
git add app/installer/page.tsx
git add "app/jobs/[id]/doors/page.tsx"
git add "app/jobs/[id]/doors/[specId]/page.tsx"
git add "app/jobs/[id]/edit/page.tsx"
git add "app/jobs/[id]/residential/page.tsx"
git add "app/jobs/[id]/residential/[specId]/page.tsx"
git add "app/jobs/[id]/trim/page.tsx"
git add "app/jobs/[id]/trim/[specId]/page.tsx"
git add app/page.tsx
git add app/portal/jobs/[id]/page.tsx
git add components/IntakeForm.tsx
git add components/JobFilesPanel.tsx
git add components/ResidentialSpecClient.tsx
git add components/SpecSchedulesPanel.tsx
git add lib/auth.ts
git add lib/catalogs.ts
git add lib/db.ts
git add lib/docusign.ts
git add lib/pdf-spec.tsx
git add lib/spec-data.ts
git add scripts/create-builder.ts
git add scripts/seed-spec.mjs
git add scripts/migrate-job-files.mjs

git commit -m "docs + chore: update planning docs, SOPs, type stubs, and supporting touch-ups

- Updated ARCHITECTURE.md, CLAUDE.md, KARL_TODO.md, TODO.md, ROLES_ROUTES_V1_SPEC.md
- New ROADMAP.md, SPEC_AUDIT.md, docs/SCHEDULE_V2_ROADMAP.md
- types/google-maps.d.ts
- SOPs (Admin, PM, Residential Disclosure draft)
- Job import CSVs
- Logout / portal-accounts / specs polish; supporting lib/ updates"
```

---

## Pause for review

After the 9 commits land, **stop and inspect** before pushing:

```sh
git log --oneline origin/master..HEAD          # should show 9 new commits + your 9 unpushed deploy-fixes = 18 total
git status -s                                   # should be empty (or one or two intentional drafts)
git diff --stat origin/master                   # full picture of what's about to ship

# Optional sanity:
npm run build                                   # confirm the project still compiles
```

If any commit is wrong: `git reset --soft HEAD~1` un-commits the last one but keeps the changes staged for re-grouping.

---

## Push

Once you're happy:

```sh
git push origin master
```

Vercel will auto-deploy. Watch the build log on `accwebsite-cd58.vercel.app` (or wherever the current deploy points). The Schedule V2 build needs `scripts/migrate-schedule-v2.mjs` to have been run against Supabase — if you haven't run it yet, do so before opening `/schedule` in production:

```sh
node scripts/migrate-schedule-v2.mjs
```

(Idempotent; safe to re-run.)

---

## Rollback notes

- **Before push:** Any commit is reversible with `git reset --hard HEAD~1` (drops the commit and reverts files) or `git reset --soft HEAD~1` (drops the commit, keeps files staged).
- **After push:** `git revert <sha>` creates an anti-commit. Don't `git push --force` to undo something already pushed unless you've coordinated with anyone else who has the repo cloned.
- **`.gitattributes` rollback:** If line-ending normalization breaks anything weird (very unlikely), `git rm .gitattributes` + commit + push reverts the policy. Files won't re-flip line endings without another `--renormalize`.
