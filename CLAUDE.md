@AGENTS.md

# ACC Website — Project Context

Advanced Custom Cabinets internal web app. Two distinct surfaces:
1. **Public marketing site** — `/`, `/about`, `/team`, `/tour`, `/projects/*`, `/contact`
2. **Internal ops system** — `/jobs/*`, `/express/*`, `/admin/*`

This file exists so Claude always has full project context. Read it before touching anything.

---

## CRITICAL GOTCHAS — READ BEFORE WRITING ANY CODE

### Branch / Deploy
- Production deploys from `main`. Never commit to `master` — it is deleted/archived.
- Always push to `main`. Vercel auto-deploys from `main` only.
- After pushing, wait for Vercel build to complete before testing. Dashboard is client-rendered — verify by git SHA in Vercel API or by checking the live site response.

### Middleware
- The Next.js 16 middleware file is `proxy.ts` — NOT `middleware.ts`.
- Having BOTH files in the repo at the same time is fatal. Never create `middleware.ts`.

### Database connections
- `prepare: false` is REQUIRED on all Postgres/Supabase connections. The pooler (PgBouncer, port 6543, transaction mode) rejects prepared statements. Removing this will break every query.
- Supabase pooler port is 6543 (transaction mode). Port 5432 is session mode — do not use it.
- Booleans crash integer columns. Always pass `1` or `0`, never `true` or `false`.

### Job ID formats
- Jobs have TWO identifiers: integer job number (e.g. `99999`, appears in URLs) and ACC string ID (e.g. `ACC-2026-0181`, used as FK in all child tables and most API routes).
- `residential_specs.job_id`, `files.job_id`, and most API routes expect the ACC string format. Passing the integer will silently fail FK constraints or return empty results.
- Always resolve params.id to the internal ACC ID early in any route handler. Pattern: query `SELECT id FROM jobs WHERE job_number = ${params.id} OR id = ${params.id}`.

### Server pages / Lambda
- Every server page that hits the DB must use the `withDbTimeout` pattern: `Promise.race([fn(), timeoutPromise])`. Missing this causes 504 Gateway Timeout on Lambda cold starts (which can take 10–30s).
- Use `next start` for demos. Never use Turbopack in production — it leaks memory.

### Email
- `GMAIL_USER = residentialacc2@gmail.com` — the letters in the middle are intentionally transposed. Do NOT "correct" the spelling. It is the actual Gmail address.

### Git / filesystem
- The repo lives on a CIFS network share (`C:\dev\repos\acc-website`). Git lock file warnings during `git add` are noise — verify success with `git status`, not by absence of warnings.
- Pre-existing TypeScript errors (TS2367 pattern) exist in unrelated files. Do not fix them unless explicitly asked. Do not let them block a commit — use `--skipLibCheck` if needed for type checks.
- If `git push` fails due to index corruption, clone fresh to `/tmp`, apply the changes, and push from the clone.
- Never run `npm run build` locally on the network share — it is unreliable. Push to main and let Vercel build.

### PDF generation
- `@react-pdf/renderer` is used in `lib/pdf-spec.tsx`. Node.js runtime only — no Edge runtime anywhere in this project.
- Spec PDF auto-saves to the "03 JOB SPECS" folder in file storage on generate.

### Schedule / ON DECK
- Schedule events with `start_date = NULL` appear in the ON DECK panel, not on the calendar.
- The Ready to Schedule button checks for the presence of schedule events (any), not just unscheduled ones. Do not reset button state based on whether events have dates.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2.4, App Router, TypeScript |
| Styling | Tailwind CSS v4 |
| Database | Supabase Postgres (pooler URL, `prepare: false` required) |
| Auth | Custom session tokens, bcryptjs, HTTP-only cookies |
| Email | Nodemailer → Gmail SMTP (port 465, SSL) |
| PDF | `@react-pdf/renderer` |
| Runtime | Node.js only — no Edge runtime anywhere |
| Hosting | Vercel (prod: `www.advancedcabinets.org`, preview: `accwebsite-cd58.vercel.app`) |

---

## How to Run

**For demos / normal use — production mode (no memory issues):**
```
# First time or after code changes:
npm run build
npx next start --port 3000

# Or just double-click:
launch.bat
```

**Do NOT use `next dev` for demos.** Turbopack crashes at ~4GB heap after extended use. Production build (`next start`) uses ~200MB and never crashes.

**For active development:**
```
npx next dev --port 3000
```
Turbopack is on by default in Next.js 16. If memory becomes an issue mid-session, rebuild and switch to `next start`.

---

## Environment Variables (`.env.local`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase pooler connection string (port 6543, `prepare: false` required) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL — used for file storage (job files) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — used for file storage admin ops |
| `SESSION_SECRET` | Signs builder session cookies (32+ chars) |
| `GMAIL_USER` | Gmail sender address: `residentialacc2@gmail.com` |
| `GMAIL_APP_PASSWORD` | 16-char Gmail app password (no spaces) |
| `PM_EMAIL` | Where job emails are sent: `residential@advancedcabinets.net` |
| `ADMIN_PASSWORD` | Password for `/admin` login: `acc-admin-2026` |
| `NEXT_PUBLIC_SITE_URL` | Base URL for signoff links (optional — defaults to `https://www.advancedcabinets.org`) |
| `PORTAL_URL` | Base URL in builder portal emails (optional — defaults to `https://www.advancedcabinets.org`) |

**Critical:** `GMAIL_USER` is `residentialacc2@gmail.com` — the letters in the middle are transposed from what you'd expect. Do not "correct" it.

---

## Route Map

```
/                          → Public homepage
/jobs                      → PM inbox (all jobs, no auth required)
/jobs/new                  → Create job manually
/jobs/[id]                 → Job detail
/jobs/[id]/edit            → Edit job metadata
/jobs/[id]/residential/    → Cabinet specs
/jobs/[id]/trim/           → Trim specs
/jobs/[id]/doors/          → Door specs

/express/login             → Builder login (username + password)
/express/new               → Express Wizard (5-step order form) — auth required
/express/orders            → Builder's own order history — auth required
/express/submitted         → Confirmation page after wizard submit

/admin/login               → Admin login (password only, no username)
/admin/builders            → Manage builder accounts — auth required
```

---

## Auth Architecture

### Builder Auth (`lib/auth.ts`)
- Cookie: `acc_builder_session` (30-day expiry)
- Table: `builder_sessions` (token → `builder_accounts.id`)
- `getBuilder()` — returns `BuilderSession | null` (use in server components / route handlers)
- `requireBuilder()` — redirects to `/express/login` if not authed
- Route protection: `proxy.ts` does a lightweight cookie-presence check; full DB validation happens in each page/handler

### Admin Auth (`lib/admin-auth.ts`)
- Cookie: `acc_admin_session` (7-day expiry)
- Table: `admin_sessions` (no user FK — single shared password from `ADMIN_PASSWORD` env var)
- `getAdmin()` → `boolean`
- `requireAdmin()` → redirects to `/admin/login` if not authed
- Route protection: `app/admin/(protected)/layout.tsx` calls `requireAdmin()` on every render

### Route Group Pattern
`app/admin/(protected)/` — the route group excludes `/admin/login` from the auth layout. **Do not move `login/` inside the route group** or you get an infinite redirect loop. URL remains `/admin/builders` (route groups don't affect URLs).

### Proxy / Middleware
`proxy.ts` is the Next.js 16 equivalent of `middleware.ts`. **Never create `middleware.ts`** — both files cannot coexist; Next.js 16 throws a fatal error. `proxy.ts` protects `/express/**` except `/express/login`. It does cookie-presence only (no DB lookup) for performance.

---

## Database (`lib/db.ts`)

Supabase Postgres. Connection via `postgres` (the `postgres` npm package) using the **pooler URL** (port 6543, PgBouncer transaction mode).

```typescript
// lib/db.ts — critical config
postgres(url, {
  ssl: "require",
  prepare: false,   // REQUIRED — PgBouncer transaction mode can't use prepared statements
})
```

**`prepare: false` must never be removed.** Without it every query throws on the pooler.

### Key Tables

| Table | Purpose |
|---|---|
| `jobs` | Master job record |
| `builder_accounts` | Staff/builder logins (role: admin/user/engineer/partner/installer) |
| `builder_sessions` | Active session tokens |
| `admin_sessions` | Admin-only sessions |
| `schedule_events` | Install calendar events |
| `schedule_phases` | Phase intake per job |
| `schedule_pto` | PTO / holiday blocks |
| `builder_portal_accounts` | External builder portal logins |
| `builder_required_inputs` | Portal checklist items per job |
| `builder_change_requests` | Portal change request submissions |
| `drawing_comments` | Portal drawing annotation thread |

### Job ID Format
`ACC-{YEAR}-{SEQ:04d}` — e.g. `ACC-2026-0001`. Generated by `nextJobId()` in `lib/db.ts`.

### Postgres Integer Columns
**Postgres INTEGER columns reject JS booleans — always pass `1`/`0`, never `true`/`false`.**
This applies to: `active`, `must_change_pw`, `builder_portal_enabled`, `mod_residential`, `mod_commercial`, `mod_trim`, `mod_doors`. Booleans cause a silent 500 or a Postgres type error at runtime.

---

## Express Wizard Flow

1. Builder logs in at `/express/login` → session cookie set
2. `/express/new` — 5-step wizard (client component)
   - Step 1: Project info (client name, address, delivery date)
   - Step 2: What's included (cabinets / trim / doors toggles)
   - Step 3: Cabinet selections (finish groups + rooms + line items)
   - Step 4: Trim selections
   - Step 5: Door selections + review
3. Submit POSTs to `/api/express/submit`
4. Submit route:
   - Inserts `jobs` row with `builder_id`, `builder_name`, `builder_company`
   - Inserts `residential_specs` + `finish_groups` + `rooms` + `cabinet_line_items`
   - Inserts `trim_specs`
   - Inserts `door_specs` + `door_line_items`
   - Generates PDF via `renderOrderPDF()` → saves to `{ORDERS_DIR}/{job_id}/order.pdf`
   - Sends email via `sendOrderEmail()` with PDF attached
   - Returns `{ job_id }`
5. Browser redirects to `/express/submitted?id={job_id}`

### Cabinet Display Names
The submit route enriches `family_code` → `display_name` using the catalog:
```typescript
const familyMap = Object.fromEntries(
  catalogs.cabinetFamilies().map((f) => [f.family_code, f.display_name])
);
```

---

## Email Pipeline (`lib/mailer.ts`)

- Transport: Gmail SMTP, host `smtp.gmail.com`, port **465**, `secure: true` (SSL)
- Port 587/STARTTLS was tried and works but SSL on 465 is more reliable
- From: `"ACC Orders" <residentialacc2@gmail.com>`
- To: `PM_EMAIL` env var (currently `residential@advancedcabinets.net`)
- Attachment: PDF from `{ORDERS_DIR}/{job_id}/order.pdf` (skipped if file missing)
- Test script: `npx tsx scripts/send-test-email.ts`

---

## PDF Generation (`lib/pdf-order.ts`)

Uses `@react-pdf/renderer`. Called from the submit route after all DB writes succeed. Output path: `{ORDERS_DIR}/{job_id}/order.pdf`. `ORDERS_DIR` defaults to `./data/orders`.

---

## Scripts

| Script | Command | Purpose |
|---|---|---|
| Seed a builder | `/admin/builders` in the app | Creates builder account via Supabase (admin login required) |
| Test email | `npx tsx scripts/send-test-email.ts` | Sends test email using `.env.local` creds |
| Sync catalogs | `npm run sync-catalogs` | Pulls cabinet catalog data (runs automatically on `npm run build`) |

**tsx scripts must use `async function main()` wrapper** — top-level await fails with CJS output. Both scripts follow this pattern.

---

## Demo Credentials

| Role | URL | Login |
|---|---|---|
| Builder | `/express/login` | `demo` / `demo1234` |
| PM | `/jobs` | no login |
| Admin | `/admin` | password: `acc-admin-2026` |

Printable SOP: `public/sop-express.html` (open in browser, Ctrl+P → Letter/Portrait)

---

## Known Quirks & Gotchas

- **`middleware.ts` must not exist.** Next.js 16 uses `proxy.ts`. If both files exist the dev server won't start.
- **`export const runtime` not allowed in `proxy.ts`.** Proxy always runs Node.js; the declaration causes a fatal error.
- **No `export const runtime` needed anywhere** for Node.js (the default). Only needed if explicitly using Edge.
- **Booleans crash Postgres INTEGER columns.** Always use `1`/`0`, never `true`/`false` in SQL. Affects: `active`, `must_change_pw`, `builder_portal_enabled`, all `mod_*` columns.
- **`prepare: false` is load-bearing.** Supabase uses PgBouncer in transaction mode. Removing this line breaks every query on the live site.
- **`$PSScriptRoot` is empty in some PowerShell contexts.** `launch.ps1` uses a fallback: `Split-Path $MyInvocation.MyCommand.Path`.
- **Turbopack (`next dev`) leaks memory** and crashes after extended use. Use `next start` for demos.
- **`.env.local` is gitignored.** Never commit it. The file lives only on dev machines.
- **`data/` is gitignored** (`orders/`). PDFs are local only. DB is Supabase, not local.
- **Lockfile warning on startup** (`multiple lockfiles detected`) — harmless. Caused by a `package-lock.json` one directory up at `C:\dev\repos\`. Ignore it.
- **503s on live site are transient.** Supabase free-tier connection pool (~10 connections) exhausts under burst load. Normal usage is fine; running bulk seed scripts against the live API can trigger it temporarily.

---

## File Layout (key files only)

```
acc-website/
├── app/
│   ├── admin/
│   │   ├── (protected)/          ← route group: auth layout applied here
│   │   │   ├── layout.tsx        ← calls requireAdmin() on every render
│   │   │   └── builders/page.tsx ← manage builder accounts
│   │   └── login/page.tsx        ← outside route group — no auth guard
│   ├── api/
│   │   ├── admin/{login,logout,builders}/route.ts
│   │   ├── express/{login,logout,submit}/route.ts
│   │   └── {jobs,specs,trim-specs,door-specs}/...
│   ├── express/
│   │   ├── login/page.tsx
│   │   ├── new/page.tsx          ← 5-step wizard (client component)
│   │   ├── orders/page.tsx       ← builder order history
│   │   └── submitted/page.tsx
│   └── jobs/...                  ← PM-facing job management
├── lib/
│   ├── db.ts                     ← SQLite init, schema, migrations, helpers
│   ├── auth.ts                   ← builder session management
│   ├── admin-auth.ts             ← admin session management
│   ├── mailer.ts                 ← nodemailer / Gmail
│   ├── pdf-order.ts              ← @react-pdf/renderer order PDF
│   └── catalogs.ts               ← cabinet family catalog
├── scripts/
│   ├── create-builder.ts         ← DEPRECATED (use /admin/builders UI)
│   └── send-test-email.ts        ← test email pipeline
├── public/
│   └── sop-express.html          ← printable demo SOP
├── proxy.ts                      ← Next.js 16 middleware (NOT middleware.ts)
├── launch.bat                    ← double-click launcher (calls launch.ps1)
├── launch.ps1                    ← launcher logic: find Node, build, start
├── ACC_PM_SOP.docx               ← PM role SOP (browser-tested, kept up to date)
├── ACC_Admin_SOP.docx            ← Admin role SOP
└── .env.local                    ← secrets (gitignored, never commit)
```

---

## Claude Agentic Operations

This section documents how Claude operates on this repo autonomously — no PowerShell needed from Karl.

### Git Push Workflow

The repo is mounted at `C:\dev\repos\acc-website` (NTFS). The Linux sandbox cannot modify `.git/` on that mount (permissions error), so Claude maintains a separate clean clone for all git operations.

**Branch:** Vercel deploys from `main`. The `master` branch is a stale preview branch — never push there.

---
⚠️ **CRITICAL — READ BEFORE ANY GIT OPERATION:**

The NTFS repo (`C:\dev\repos\acc-website`) is **always** on branch `feature/estimating` and will always show staged/modified files. This is **normal and expected** — it is a known artifact of how the NTFS mount persists across sessions.

**NEVER:**
- Run `git add`, `git commit`, `git push`, or `git pull` from the NTFS repo
- Create a fresh clone with a different name (e.g. `/tmp/acc-repo-push`, `/tmp/my-clone`) — always use `/tmp/acc-repo`
- Copy only the last file you edited — always audit ALL files changed this session and push them together
- Deviate from the push.sh workflow below — ad-hoc manual git commands in /tmp have caused regressions

**ALWAYS:**
- Use `/tmp/acc-repo` as the clone path (consistent across sessions)
- Use `push.sh` which does `git reset --hard origin/main` before copying — this prevents stale-state pushes
- Before committing, diff ALL modified NTFS files against the clone to catch anything missed
---

**Setup at the start of any session that needs to push** (re-run every new conversation — `/tmp/` is wiped between sessions):
```bash
TOKEN=$(grep -o 'ghp_[A-Za-z0-9]*' /sessions/*/mnt/repos/acc-website/.git/config 2>/dev/null | head -1)
# (token is stored in .git/config on the NTFS mount; never hardcode it here)
rm -rf /tmp/acc-repo
git clone "https://${TOKEN}@github.com/aluate/accwebsite.git" /tmp/acc-repo
cd /tmp/acc-repo
git config user.email "karlv@advancedcabinets.net"
git config user.name "Karl V"
```

**Push script — create once per session, then use for every commit:**
```bash
cat > /tmp/push.sh << 'SCRIPT'
#!/bin/bash
# Usage: bash /tmp/push.sh "commit message" path/to/file1 path/to/file2 ...
# ALWAYS list every file changed this session, not just the last one.
MSG="$1"; shift
MOUNT=$(ls -d /sessions/*/mnt/repos/acc-website 2>/dev/null | head -1)
REPO="/tmp/acc-repo"
cd "$REPO"
git fetch origin -q
git reset --hard origin/main -q   # ← ensures we're on latest main before copying
for f in "$@"; do
  mkdir -p "$(dirname "$REPO/$f")"
  cp "$MOUNT/$f" "$REPO/$f"
  git add "$f"
done
git diff --cached --quiet && echo "Nothing to commit." && exit 0
git commit -m "$MSG" -q && git push origin main 2>&1 | tail -3
SCRIPT
chmod +x /tmp/push.sh
```

**Audit + push — do this once at the end of each work block:**
```bash
# 1. Find all files modified on NTFS vs current main:
MOUNT=$(ls -d /sessions/*/mnt/repos/acc-website 2>/dev/null | head -1)
cd /tmp/acc-repo && git fetch -q && git reset --hard origin/main -q
git diff --name-only HEAD -- $(git ls-files) | head -30   # files that differ

# 2. Diff specific files to confirm what changed:
diff "$MOUNT/lib/pdf-spec.tsx" /tmp/acc-repo/lib/pdf-spec.tsx

# 3. Push ALL changed files in one commit (don't split into multiple pushes unless logical):
bash /tmp/push.sh "fix: description of all changes" \
  lib/pdf-spec.tsx \
  components/SomeOtherFile.tsx
```

**Verify deploy:**
```
vercel.com/aluates-projects/accwebsite-cd58/deployments
```
Both commit SHA and status "Ready" must appear before testing on the live site.

### Running Scripts Against the Live Database

Scripts that need `DATABASE_URL` (e.g. `seed-jobs.ts`) require the env var to be set. The sandbox does not have `.env.local`. Options:
- POST data directly to the live API endpoints via `fetch()` in a browser console (works without env vars)
- Pass `DATABASE_URL` inline: `DATABASE_URL="postgres://..." npx tsx scripts/foo.ts`

### Browser Automation — React Controlled Inputs

The browser tools' `type` action does not trigger React's synthetic `onChange`. To set a value that React will recognise:
```javascript
const nativeSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value'
).set;
nativeSetter.call(inputElement, 'new value');
inputElement.dispatchEvent(new Event('input', { bubbles: true }));
inputElement.dispatchEvent(new Event('change', { bubbles: true }));
```
For `<select>` elements use `HTMLSelectElement.prototype.value` instead.

### Vercel Deploy Check

After a push, confirm deployment at:
`https://vercel.com/aluates-projects/accwebsite-cd58/deployments`

Builds take ~35–40 seconds. Current production commit is always marked "Current" in green.

---

## Spec Form Design Principles

### Rooms = Finish Group Applications (NOT physical rooms)
On the residential spec, a "room" is a finish application location, not a physical room.
- Kitchen with 3 finishes → 3 finish groups: "Kitchen Perimeter", "Kitchen Uppers", "Kitchen Island"
- The finish group label IS the location label
- The room matrix maps finish groups to locations
- Never group multiple finish types under one room entry
This has been a recurring source of confusion — treat this as a hard rule.

---

## Project Hygiene — Rules That Keep This Codebase Clean

These rules exist because subtle inconsistencies (duplicate fields, silent saves, stale closures) have already caused real production failures. Follow them without exception.

---

### INPUT_FIELD_MAP.md — The Law of Inputs

**Before adding or changing any input field, read `INPUT_FIELD_MAP.md` first.**

- Every user-visible input in the app is documented there: page, field label, component, DB column, and API route.
- If you add a new field: add a row to the map BEFORE writing the code.
- If you rename a field, relabel a column, or repurpose an existing value: update the map in the same commit.
- If a field exists in two places under different names, they are the SAME field until proven otherwise. Verify before creating a second DB column.
- No silent aliases. If two labels genuinely refer to different concepts, they must be explicitly documented as distinct in the map with a "WHY DISTINCT" note.

**The map is the source of truth. The code is not the source of truth until the map agrees.**

---

### No Duplicate Fields

- A concept gets one DB column. One label. One API field name.
- Before adding a column, grep the schema for synonyms: value, amount, price, cost, total, estimate, quote.
- If the same data appears in two places in the UI (e.g., pipeline and job sidebar), they must read/write the SAME column.
- Exceptions: `estimated_value` (PM rough guess) vs `sell_price_snapshot` (estimate engine output) are intentionally distinct — see INPUT_FIELD_MAP.md for the formal distinction.

---

### PATCH/POST Routes — Explicit Allow Lists Only

- Every PATCH and POST route that writes to `jobs` or any other shared table MUST have an explicit `allowed` array.
- No wildcard spreads from `req.body` into SQL. Each field must be opted in.
- When adding a new writable field, add it to the `allowed` array in the same commit. A field that isn't in `allowed` silently does nothing — this is how `bid_number` failed for months.

---

### PM/User Fields — Always a SELECT, Never Free Text

- Any field that represents a user (PM, builder contact, assigned user) must be a `<select>` populated from `builder_accounts`.
- Free-text user fields create orphaned values that can never be queried or filtered reliably.
- If `builder_accounts` doesn't have the right scope, add a row — don't add a text input.

---

### React useCallback — Full Dependency Arrays

- Every `useCallback` that closes over state MUST include all referenced state variables in its dependency array.
- The stale closure bug (generate spec using page-load value of `specAccs`) is the canonical failure mode. It takes 10 minutes to write and days to debug.
- Rule of thumb: if you reference a state variable inside `useCallback`, it goes in the array. No exceptions for "it probably won't change."

---

### Save Routes — Opt-In for Destructive Operations

- Any save route that does DELETE + INSERT (full replace) must check whether the client explicitly sent that key.
- Pattern: `const clientSentFoo = 'foo' in body` — skip the DELETE/INSERT when false.
- A save from one tab must not silently wipe data entered from another tab or another field group.
- Applied to: `finish_moldings`, `spec_accessories`, `spec_hardware`, `appliances`. Apply to any new replace-pattern route.

---

### DB Column Names Must Match UI Labels

- If the UI shows "Quoted $" but the column is `estimated_value`, that mapping must be documented in INPUT_FIELD_MAP.md.
- If a column is renamed or a UI label changes, update both the schema (migration) and the map in the same PR.
- `pm_complexity` exists on both `jobs` and `finish_groups` — this is a known ambiguity. Do not add new columns with names that collide across tables.

---

### No Silent Failures

- Every API route must return a meaningful HTTP status code and a JSON error body on failure.
- `{ error: "..." }` with a 400/500 is the minimum. Never swallow exceptions and return 200.
- Client-side: if a save fails, the user must see it. No "it felt like it saved" — fire a toast or set an error state.

---

### File Writes on NTFS Mount — Python/Bash Only

- The Edit tool silently truncates files on the `C:\dev\repos\acc-website` NTFS mount.
- **All file writes must use `python` or `bash cat`** — never the Edit tool on NTFS-mounted paths.
- Use the Edit tool only for files in `/tmp/` or other non-NTFS paths.

---

### Git — Always via /tmp/acc-repo

- Never push directly from the NTFS mount. Git lock files become NTFS ghosts and corrupt the index.
- Clone pattern: `git clone "https://${TOKEN}@github.com/aluate/accwebsite.git" /tmp/acc-repo`
- Token lives in `.git/config` on the NTFS mount — never hardcode it in any committed file.
- Push script: `/tmp/push.sh` (see Git Operations section above). Always use it.

---

### What to Check Before Claiming a Feature is Built

1. Confirm the DB column exists and is in the PATCH `allowed` array.
2. Confirm the UI input saves on both blur/submit AND on "generate" (generateSpec must trigger save-all).
3. Confirm the value appears correctly in the PDF/output if it's a spec field.
4. Confirm INPUT_FIELD_MAP.md has been updated.
5. Push to main, wait for Vercel deploy, verify on the live site — not in local dev.
