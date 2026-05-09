@AGENTS.md

# ACC Website — Project Context

Advanced Custom Cabinets internal web app. Two distinct surfaces:
1. **Public marketing site** — `/`, `/about`, `/team`, `/tour`, `/projects/*`, `/contact`
2. **Internal ops system** — `/jobs/*`, `/express/*`, `/admin/*`

This file exists so Claude always has full project context. Read it before touching anything.

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
| `SESSION_SECRET` | Signs builder session cookies (32+ chars) |
| `GMAIL_USER` | Gmail sender address: `residentialacc2@gmail.com` |
| `GMAIL_APP_PASSWORD` | 16-char Gmail app password (no spaces) |
| `PM_EMAIL` | Where orders are emailed: `residential@advancedcabinets.net` |
| `ORDERS_DIR` | Where PDFs are saved: `./data/orders` |
| `ADMIN_PASSWORD` | Password for `/admin` login: `acc-admin-2026` |

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
| Seed a builder | `npx tsx scripts/create-builder.ts` | Creates builder account interactively |
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
│   ├── create-builder.ts         ← seed builder