# Roles, Routes & Partner Access — V1 Spec

> Planned 2026-05-07. Core tracks locked. Feature 4 (invite flow) locked. Feature 5 (Z drive import) is a stub — requires a separate spec session.
> Point a future session at this file to resume build work.

---

## Overview

Five tracks. Three are fully locked. One is locked but has a DAC-flagged gotcha. One is a stub pending a separate spec session.

1. **Partner role** — add a read-only `partner` role for ACC owners. Full visibility, no editing, no account management. Accounts created after role is wired.
2. **Account management UI** — upgrade `/admin/builders` into a proper user management page: all roles, full CRUD, invite status, rename away from "builders" label.
3. **Route suppression** — disable marketing pages and the homeowner/builder portal without deleting any code. Two new env flags join the existing `EXPRESS_ENABLED` pattern.
4. **Invite / onboarding flow** — admin sends invite link per user; user sets their own password; recovery tied to company email. Prerequisite for the company-wide launch email.
5. **Z drive import** *(stub — not yet locked)* — import existing jobs from the Z drive on advserver into the app DB. Requires a separate spec session once the Z drive folder structure and file formats are known.

**Tracks 1–4 are independent of each other.** Track 5 depends on understanding the Z drive data format before it can be designed.

---

## Feature 1: Partner Role

### What partners can do

Partners are ACC owners. They need to see everything running through the shop but have no day-to-day editing duties.

| Area | Partner access |
|---|---|
| `/jobs` — job list | ✓ Read |
| `/jobs/[id]` — job detail | ✓ Read (no Edit button, no Create Job) |
| `/jobs/[id]/[spec]` — spec form | ✓ Read (no Save, no lifecycle advance buttons) |
| `/schedule` — wall calendar | ✓ Read (no Add Event, no drag-to-reschedule) |
| Scope / pipeline dashboard | ✓ Read — when built (Phase MES-5: full pipeline view showing who is on what and what stage) |
| `/engineering/[specId]` | ✓ Read (no lifecycle controls) |
| `/admin/**` | ✗ No access — redirect to `/jobs` |
| `/admin/libraries` | ✗ No access |
| File uploads | ✗ No uploads |
| Lifecycle transitions | ✗ Blocked at API level |
| Account management | ✗ No access |

### Auth changes — `lib/auth.ts`

Add `"partner"` and `"installer"` to the `Role` type and `ROLES` constant:

```ts
export type Role = "admin" | "user" | "engineer" | "partner" | "installer";
export const ROLES: readonly Role[] = ["admin", "user", "engineer", "partner", "installer"] as const;
```

Both roles are added now so accounts can be created and invited before their full UI surfaces ship. `"installer"` gets a placeholder page (see Feature 6). `"partner"` gets read-only access as described in this feature.

No other auth logic changes. `requireBuilder()` and `requireRole()` already work generically — partners and installers pass `requireBuilder()` just fine and are blocked by any `requireRole("admin")` or `requireRole("engineer")` call.

### API-level enforcement

Every mutating endpoint (`POST`, `PATCH`, `DELETE`, `PUT`) that doesn't already call `requireRole("admin")` or `requireRole("engineer")` must add a partner-block check:

```ts
const session = await requireBuilder();
if (session.role === "partner") {
  return NextResponse.json({ error: "Read-only access" }, { status: 403 });
}
```

Affected endpoints (non-exhaustive — audit on build):
- `/api/jobs` POST (create job)
- `/api/jobs/[id]` PATCH (edit job metadata)
- `/api/jobs/[id]/files` POST (file upload)
- `/api/jobs/[id]/files/[fileId]` DELETE
- `/api/specs/[id]/save` POST
- `/api/specs/[id]/lifecycle` POST (lifecycle transition)
- `/api/schedule/events` POST / PATCH / DELETE
- `/api/schedule/events/[id]/ready` POST (ready-to-schedule)

### UI-level enforcement

Pass the session role into page components. Conditionally render action elements based on role. Use a shared helper:

```ts
// lib/permissions.ts
export function canEdit(role: Role): boolean {
  return role !== "partner";
}
```

Apply at the component level — not with CSS `display:none`, but by not rendering the element at all. Key callsites:

- Job detail page: hide "Edit" link, "Create Job" button, "Ready to Schedule" button
- Spec form toolbar: hide Save, Generate, lifecycle advance buttons
- Schedule page: hide Add Event button, disable drag handlers
- Engineering page: hide lifecycle controls

### DB migration

`builder_accounts.role` is currently a plain `TEXT` column with no SQL-level enum constraint — adding `"partner"` requires zero schema migration. The selftest's role-list check will need updating to include `"partner"`.

---

## Feature 2: Account Management UI

### Rename and scope

Rename the page display name and nav label from "Builders" to "User Accounts." The URL `/admin/builders` can stay (no broken bookmarks, no redirect plumbing) or move to `/admin/users` — decision at build time based on whether links exist elsewhere. Prefer `/admin/users` if the refactor is cheap.

### Current state

`/admin/builders` already supports:
- List all `builder_accounts` rows
- Create account (name, username, password, company)
- Reset password
- Last-admin protection on delete

### Gaps to fill

**1. Role selector on create and edit forms**

Both the create-new and edit-existing flows must expose a `role` dropdown. Options: `user` (PM), `engineer`, `partner`, `admin`. Default: `user`.

Label the dropdown "Role" — not "Type" or "Permission Level."

**2. Role badge on the list**

Each row in the account list shows a color-coded role badge alongside the name:

| Role | Badge color |
|---|---|
| admin | Red |
| user | Blue |
| engineer | Purple |
| partner | Green |

**3. Edit account (missing today)**

Currently there is no edit flow — only create + reset-password + delete. Add an "Edit" action that opens a modal (or inline form) allowing:
- Name
- Email
- Company
- Role (dropdown)

Username is not editable after creation (primary key for login — treat it as immutable).

**4. Deactivate vs. delete**

`builder_accounts` already has an `active` column. Prefer "Deactivate" over hard-delete for non-admin accounts (preserves audit history). "Delete" remains available for accounts that have never logged in (no sessions). UI: show "Deactivate" for active accounts with session history, "Delete" for never-logged-in accounts, "Reactivate" for inactive accounts.

**5. Last-admin protection**

Already coded. Confirm it covers the new edit flow (role downgrade from admin should trigger the same check as delete).

### API changes

- `GET /api/admin/builders` — already exists; ensure it returns `role` field (likely already does)
- `POST /api/admin/builders` — add `role` to accepted body; validate against `ROLES` constant
- `PATCH /api/admin/builders/[id]` — **new endpoint**: accepts `{ name, email, company, role }`, validates role, enforces last-admin check on role downgrade
- `DELETE /api/admin/builders/[id]` — already exists; extend to check `active` + session history before hard-delete vs. deactivate

**Session invalidation on deactivate:** When an account is deactivated (or hard-deleted), immediately kill all active sessions for that account:

```ts
db.prepare("DELETE FROM builder_sessions WHERE builder_id = ?").run(id);
```

Run this inside the same transaction as the `active = 0` update. Do not rely on session expiry — a deactivated user should lose access on the next request, not at cookie expiry (which could be 30 days out).

---

## Deployment Policy

**External surfaces are off by default and must stay that way until ACC signs off.**

The ACC partners have approved internal use only at this stage. `EXPRESS_ENABLED`, `PORTAL_ENABLED`, and the builder-role onboarding flow must remain disabled on the production domain (`www.advancedcabinets.org`) until the system has been validated internally by ACC staff. Do not enable any external-facing surface without explicit sign-off from Karl.

This constraint applies even if a feature is technically complete. "Done" means working internally, not visible externally.

Verification checklist before flipping any flag to `true` on production:
- [ ] Feature has run on at least one real ACC job (not seed data)
- [ ] Karl has reviewed the output and confirmed it's correct
- [ ] At least 2 admin accounts exist and are accessible
- [ ] Karl has explicitly approved the go-live for that surface

---

## Feature 3: Route Suppression

### Design principle

Same pattern as `EXPRESS_ENABLED`: env flag in `.env.local`, checked in `proxy.ts`, returns 404 when disabled. The route code stays untouched. Flipping the flag to `"true"` re-enables the surface with zero code changes.

Env flags default to `"false"` when absent — new deployments are opt-in, not opt-out.

### Flag 1: `MARKETING_ENABLED`

**Suppresses:** `/about`, `/team`, `/tour`, `/projects` (and `/projects/*`), `/contact`

**Does NOT suppress:** `/` (already redirects to `/jobs` in `app/page.tsx`)

**Rationale:** advancedcabinets.net already serves these pages. The live domain is `www.advancedcabinets.org` (Vercel). Marketing and ops are both served from this domain.

**proxy.ts addition:**

```ts
// Marketing pages feature flag.
// The public marketing site (advancedcabinets.net) already serves these routes.
// Suppressed on www.advancedcabinets.org — enable when marketing site is ready.
// Set MARKETING_ENABLED=true to re-enable.
const MARKETING_PATHS = ["/about", "/team", "/tour", "/projects", "/contact"];
if (MARKETING_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
  if (process.env.MARKETING_ENABLED !== "true") {
    return new NextResponse("Not Found", { status: 404 });
  }
}
```

**proxyConfig matcher update** — add the marketing paths:

```ts
export const proxyConfig = {
  matcher: [
    "/express/:path*",
    "/api/express/:path*",
    "/about/:path*", "/about",
    "/team/:path*",  "/team",
    "/tour/:path*",  "/tour",
    "/projects/:path*", "/projects",
    "/contact/:path*", "/contact",
    "/portal/:path*",
    "/api/portal/:path*",
  ],
};
```

### Flag 2: `PORTAL_ENABLED`

**Suppresses:** `/portal` (and `/portal/*`), `/api/portal` (and `/api/portal/*`)

**Rationale:** The homeowner/builder portal (`app/portal/`) is scaffolded but the partners are not ready to stand it up yet. Same 404 treatment as Express.

**proxy.ts addition:**

```ts
// Homeowner/builder portal feature flag.
// Not standing up until ACC is ready to onboard external users.
// Set PORTAL_ENABLED=true to re-enable.
if (pathname.startsWith("/portal") || pathname.startsWith("/api/portal")) {
  if (process.env.PORTAL_ENABLED !== "true") {
    return new NextResponse("Not Found", { status: 404 });
  }
}
```

### `.env.local` defaults

Add these lines to `.env.local` on the production server (and document in `VERCEL_ENV_VARS.txt`):

```
EXPRESS_ENABLED=false
MARKETING_ENABLED=false
PORTAL_ENABLED=false
```

### Nav link audit

After suppression, run a search for any rendered `<Link>` or `<a href>` pointing to the suppressed routes. Remove or conditionally hide those links so users never hit a 404 from internal navigation. Likely callsites:

- `app/layout.tsx` — top-level nav
- Any "back to site" links in admin or job views
- The public-facing homepage (`app/page.tsx` already redirects; verify no nav is rendered before the redirect fires)

---

## Schema Changes

None required for route suppression or the `partner` role addition (role column is plain TEXT).

One minor change needed for account management:

```sql
-- No new columns needed.
-- The PATCH /api/admin/builders/[id] endpoint is new but touches only existing columns.
-- Confirm active column exists (it does per ARCHITECTURE.md).
-- Selftest: add "partner" to the allowed-roles assertion.
```

Selftest update in `scripts/selftest.mjs` (or wherever the role assertion lives):

```ts
// Before:
const ALLOWED_ROLES = ["admin", "user", "engineer"];
// After:
const ALLOWED_ROLES = ["admin", "user", "engineer", "partner", "installer"];
```

---

## Feature 4: Invite / Onboarding Flow

This is the prerequisite for Karl sending a company-wide "set up your account" email. Without it, Karl has to manually set passwords and hand out credentials — not acceptable at scale.

### Design

**Username = company email address.** No separate username field. Login screen label changes from "Username" to "Email."

**Invite-initiated setup.** Admin never sets the user's password. The flow is:

1. Admin goes to `/admin/users`, clicks **"Invite User"**
2. Admin enters: email address + role. That's it.
3. System creates an account row with `active = 0`, `invite_token = <random hex>`, `invite_expires_at = now + 72h`.
4. System sends an email to the address: subject "You've been invited to ACC Workspace", body includes a single button linking to `/invite/[token]`.
5. User clicks link → `/invite/[token]` page:
   - Validates token is not expired and account is not yet active
   - Shows: "Welcome, set your password" form (password + confirm password)
   - On submit: hashes password, sets `active = 1`, clears token, creates session, redirects to `/jobs`
6. Account is now live.

**Token expiry:** 72 hours. After expiry the link shows "This invite has expired — ask your admin to resend."

**Resend invite:** Admin can click "Resend" on any account showing status `pending` or `expired`. Generates a fresh token, resets the expiry clock, sends a new email. Old token is invalidated immediately.

**Invite status on account list:**

| Status | Meaning |
|---|---|
| Active | Logged in at least once, account live |
| Pending | Invite sent, not yet accepted |
| Expired | Token past 72h, not accepted |
| Inactive | Deactivated by admin |

### Password recovery

"Forgot password" link on `/login` → user enters their email → system sends a reset link to that address (`/reset-password/[token]`, same 72h expiry pattern as invite). User sets new password, session created, redirected to `/jobs`.

Admin can also reset any user's password from `/admin/users` — generates a fresh invite-style link and emails it to the user. Admin never sees or sets the password directly.

### Email from-address

V1 uses existing Gmail SMTP (`residentialacc2@gmail.com`) — same transport confirmed working for order emails 2026-05-05. Acceptable workaround until Karl gains Outlook / Google Workspace access on `advancedcabinets.net`. No new env vars needed — reuses `GMAIL_USER` / `GMAIL_APP_PASSWORD`. Upgrade to a proper from-address is a post-launch polish item, tracked in `KARL_TODO.md`.

New env var:

```
APP_URL=https://www.advancedcabinets.org
```

Used to construct `/invite/[token]` and `/reset-password/[token]` links in outbound emails. Add to `.env.local` and to Vercel environment variables. No runtime default — omitting it won't throw, but invite emails will contain broken links.

### Email mutability — DAC flag

Username = email. If someone's email changes (name change, role change), their login email must be updatable. The account management PATCH endpoint (Feature 2) must include `email/username` as an editable field. When admin updates it, all existing sessions remain valid (sessions are keyed to `builder_accounts.id`, not email). The user just logs in with the new email next time.

### Page placement

`/invite/[token]` lives at `app/invite/[token]/page.tsx` — **outside** every auth layout. It must be reachable by unauthenticated users clicking an email link.

`proxy.ts` currently blocks unauthenticated requests to everything except `/express/login` and `/admin/login`. Add `/invite/:path*` and `/reset-password/:path*` to the allowlist:

```ts
// proxy.ts — add to the public-path allowlist
const PUBLIC_PATHS = ["/express/login", "/admin/login", "/login", "/invite", "/reset-password"];
if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
  return NextResponse.next();
}
```

Also add both paths to `proxyConfig.matcher` so the proxy runs on them at all (otherwise Next.js skips the proxy entirely and the allowlist check never fires).

The same placement rule applies to `/reset-password/[token]` — `app/reset-password/[token]/page.tsx`, same public allowlist entry.

### Schema additions

```sql
-- builder_accounts: add invite columns
-- (use safe migration pattern from ARCHITECTURE.md)
ALTER TABLE builder_accounts ADD COLUMN invite_token TEXT;
ALTER TABLE builder_accounts ADD COLUMN invite_expires_at TEXT;   -- ISO datetime

-- Rename / relabel: username column stays as-is internally;
-- UI and login form label it "Email" going forward.
-- No column rename needed — avoids a table rebuild.
```

**Reset token storage:** The forgot-password flow reuses `invite_token` and `invite_expires_at`. No additional columns needed. Rationale: only one pending token per account makes sense — if a reset is in flight and a new invite is issued (or vice versa), the new token simply overwrites the old one, which is the correct behavior. A separate column would allow two simultaneous valid tokens, which is a security footgun.

The token-type distinction (invite vs. reset) is irrelevant at the DB level — both are "click this link to set your password." The page at the other end of the link handles the UX copy.

### Installer role placeholder

When a user with `role = "installer"` (future role, not yet built) logs in, show a holding page: "Your tools are coming soon." Prevents blank-screen confusion when installers get the launch email before their punch loop is built. This is a one-component stub, not a full feature.

Installers are included in the initial company invite wave — the calendar view alone is useful to them immediately, and the placeholder bridges the gap until the punch loop ships. The punch loop spec is separate and is tied to the residential intake sheet workflow (room naming, finish group naming, SOP). See punch loop spec session for that work.

---

## Feature 5: Z Drive Import *(Stub — not yet specced)*

**Status:** Open questions unresolved. Do not build until this section is completed.

### What we know

- Existing ACC jobs live in a folder structure on `advserver` (the Z drive), managed today via TradeSoft + manual file organization.
- The app needs those jobs. Eventually both systems need to stay in sync.
- The app will live on Vercel (cloud). The Z drive is a local network share. There is **no direct connection** between them — a bridge is required.

### Open questions — answer these before speccing

1. **What is the Z drive folder structure?** One folder per job? Named how? What's inside each folder (CV files, TradeSoft exports, PDFs, Excel sheets, photos)?
2. **What is the canonical job identifier on the Z drive?** Is there a job number that maps to `ACC-{YEAR}-{SEQ}`? Or do we have to generate a mapping?
3. **What data lives in TradeSoft vs. in flat files?** Job metadata (client name, address, dates) — is that in TradeSoft, or in file/folder names?
4. **How often does the Z drive get new jobs?** Daily? Per order?
5. **Does anything write back to the Z drive from the app?** Spec PDFs? Generated drawings? Or is the Z drive purely a source for reading existing jobs?

### Chosen architecture: Option A — Sync agent on advserver

**Decided 2026-05-07.** This is the right long-term path. The sync agent runs on advserver on a schedule (Windows Task Scheduler), reads the Z drive, diffs against Supabase via a secured REST endpoint, and pushes new/changed records. The app never needs a direct connection to the Z drive.

**Bootstrap path (one-time):** Before the agent is built, Karl exports a job list from TradeSoft as CSV and uploads it via `/admin/import`. This gets existing jobs into the system fast without waiting for the full agent. Option B is the bootstrap, Option A is the ongoing engine.

**Full agent spec:** `scripts/zdrive-sync.mjs` on advserver. Scheduled via Windows Task Scheduler. Pushes to `/api/admin/import/zdrive` (admin API token required, never a cookie). Files stay on the Z drive; the agent pushes metadata only. Supabase Storage receives generated outputs (spec PDFs, Excel) that write back to the Z drive from the app side.

Full agent design lives in the Z Drive Import spec session — this stub is resolved there.

### Source of truth split (must be defined before building)

| Data type | Source of truth |
|---|---|
| Job metadata (client, address, status) | App DB |
| Spec / lifecycle / schedule | App DB |
| CV drawings (original) | Z drive |
| Generated spec PDFs | App (Supabase Storage) |
| TradeSoft order data | TradeSoft (not synced) |

---

## Feature 6: Installer Role & Photo Uploads

### What installers can do

Installers are field crew. They need two things from the app: see the schedule (so they know what's coming) and upload site photos after install (so the PM has a record without chasing them down).

| Area | Installer access |
|---|---|
| `/installer` — landing/placeholder | ✓ Own page (not `/jobs`) |
| `/schedule` — wall calendar | ✓ Read-only (same as partner — no drag, no Add Event) |
| `/jobs/[id]` — job detail | ✓ Read (no Edit, no lifecycle controls) |
| Photo upload on a job | ✓ Upload only — their own uploads, tagged to job/room/finish-group |
| Spec form | ✗ No access — redirect to `/installer` |
| `/admin/**` | ✗ No access |
| File delete | ✗ Cannot delete any file (own or others') |
| Lifecycle transitions | ✗ Blocked at API level |

### Placeholder page

`app/installer/page.tsx` — shown immediately after login and whenever an installer hits a route they can't use.

V1 content: job name + scheduled install date for any jobs currently in the `installing` stage (pulled from `schedule_events`). No editing. A "Photos" button per job opens the upload panel.

This gives installers immediate value (they can see what they're working on today) without building a full punch loop.

### Photo uploads — design

Reuses the existing `media` table (or Supabase Storage equivalent — whichever is live). Installer uploads are tagged identically to PM uploads:

| Field | Value |
|---|---|
| `job_id` | required |
| `room_id` | optional (installer picks from room list for the job) |
| `finish_group_id` | optional (installer picks from finish group list) |
| `uploaded_by` | `builder_accounts.id` of the installer |
| `upload_type` | `"site_photo"` (new type constant — distinguishes from PM uploads which are `"drawing"`, `"spec"`, etc.) |
| `visible_to_partner` | `true` by default — partners can see site photos |

**Upload surface:** A simple drag-or-tap upload panel, accessible from:
1. The installer placeholder page (per-job Photos button)
2. `/jobs/[id]` job detail page (existing file panel — installers see an "Add Photos" button, PMs see full file management)

**File size limit:** Same as existing uploads (cap defined in the existing route handler).

**No delete:** Installers cannot delete files. If a wrong photo is uploaded, PM handles removal via the standard file management UI.

### API-level enforcement

Installer uploads go through the existing `/api/jobs/[id]/files` POST endpoint. Add a check:

```ts
// Installers can POST but only with upload_type = "site_photo"
if (session.role === "installer" && body.upload_type !== "site_photo") {
  return NextResponse.json({ error: "Installers may only upload site photos" }, { status: 403 });
}
// Installers cannot DELETE
if (session.role === "installer" && request.method === "DELETE") {
  return NextResponse.json({ error: "Read-only access" }, { status: 403 });
}
```

### `canEdit()` update

```ts
// lib/permissions.ts
export function canEdit(role: Role): boolean {
  return role !== "partner" && role !== "installer";
}

export function canUploadSitePhotos(role: Role): boolean {
  return role === "installer" || role === "user" || role === "admin";
}
```

### Schema addition

```sql
-- No new table needed — reuses existing media/files table.
-- Add upload_type column if not already present:
ALTER TABLE job_files ADD COLUMN upload_type TEXT DEFAULT 'file';
-- Values: 'file' (generic), 'drawing', 'spec', 'site_photo'
-- Use safe migration pattern from ARCHITECTURE.md.
```

### Build note

The installer placeholder page and photo upload surface are independent of the punch loop spec. The punch loop (room sign-off, issue flagging, warranty trigger) is a separate feature tracked under Phase 3. This feature delivers the calendar view + site photos; the punch loop delivers the workflow.

---

## Login Consolidation

**Decision:** Everyone logs in at a single `/login` page. Role determines what they see after login, not which login page they use.

### New `/login` page

`app/login/page.tsx` — replaces `/express/login` as the single entry point for all `builder_accounts` (PM, engineer, partner, installer, admin-role users).

- Label: "Email" (not "Username") — aligns with Feature 4's username-as-email change.
- On success: redirect to `/jobs` by default, or to `?next=` param if present.
- On failure: same "Invalid credentials" message for all roles (no role enumeration).

### Old login routes

- `/express/login` → 301 redirect to `/login` (keep the route in place to avoid broken bookmarks; remove redirect after 3 months post-launch)
- `/admin/login` → **stays as-is**. This is the break-glass admin backdoor using `ADMIN_PASSWORD` (env var, not a `builder_accounts` row). It is intentionally separate. Admins with `role = "admin"` in `builder_accounts` log in at `/login` like everyone else; `/admin/login` is only for the shared emergency password.

### Post-login redirect by role

| Role | Default redirect after login |
|---|---|
| `admin` | `/jobs` |
| `user` (PM) | `/jobs` |
| `engineer` | `/jobs` |
| `partner` | `/jobs` |
| `installer` | `/installer` (placeholder page) |

Installers land on the placeholder rather than `/jobs` to avoid confusion — `/jobs` has edit controls they can't use and no context for what they're meant to do.

### `requireBuilder()` redirect target

Update the redirect in `lib/auth.ts` from `/express/login` to `/login` so all auth bounces go to the right place.

### `proxy.ts` matcher update

Add `/login` to the public allowlist and the matcher. Remove any special-casing of `/express/login` (it stays as a redirect, not a real page).

---

## Build Order (updated)

Tracks 1–4 are independent. Suggested sequence based on blast radius and launch dependencies:

1. **Route suppression** (Feature 3) — proxy.ts + env flags only. No DB changes. Lowest risk, immediate value.
2. **Login consolidation** — new `/login` page, redirect `/express/login`, update `requireBuilder()` target. Prerequisite for all role-based login to work.
3. **Partner + installer roles** (Feature 1 + 6 partial) — auth type + `ROLES` constant, `canEdit()` + `canUploadSitePhotos()`, API blocks, UI rendering changes, selftest update. Installer placeholder page.
4. **Account management UI** (Feature 2) — role dropdown, role badges, PATCH endpoint, deactivate + session kill, invite status column.
5. **Invite / onboarding flow** (Feature 4) — schema additions, invite email, `/invite/[token]` page, forgot-password flow. **Prerequisite for launch email.**
6. **Installer photo uploads** (Feature 6) — upload panel on job detail + installer placeholder, `upload_type` schema addition, API enforcement.
7. **Z drive import** (Feature 5) — do not start until open questions above are answered. One-time CSV import (Option B) can ship independently of the ongoing sync agent (Option A).

---

## DAC / TT Findings (2026-05-07)

Recorded here so a build session inherits the reasoning.

**Devil's Advocate findings:**
- Email-as-username requires username to be mutable — PATCH endpoint must include it (designed in).
- `residentialacc2@gmail.com` as the invite sender carries some spam-filter risk. **Karl has accepted this risk for V1** — IT access to a proper Outlook/Google Workspace address is blocked and not worth waiting on. Post-launch polish item.
- 72h invite expiry + no resend = support burden. Resend designed in.
- Installers will get the launch email before their UI exists. Placeholder page designed in.
- Last-admin safety: need ≥ 2 admin accounts live before the launch email. `npm run rotate-admin-pw` is the emergency fallback — document it in `KARL_TODO.md`.

**Tahiti Test findings (light — nothing built yet):**
- Password reset only works if domain is live and email is sending. Admin reset is the human fallback — requires a second admin to be available when Karl is unreachable.
- Z drive sync agent is non-critical path by design — app functions without it, just doesn't pull new file data.
- Invite resend must be usable by any admin, not just Karl.

---

## Unauthenticated Landing Behavior

Currently `app/page.tsx` redirects `/` → `/jobs`, which then hits an auth check and bounces the user somewhere undefined. With the unified `/login` page (Feature 2 / login consolidation), the correct behavior is:

- Unauthenticated user hits any protected route → redirect to `/login?next=<original-path>`
- After successful login, redirect to `next` param if present, otherwise to `/jobs`
- `app/page.tsx` should redirect to `/login` (not `/jobs`) for unauthenticated visitors, or let `requireBuilder()` handle the bounce

This is a small change to `app/page.tsx` and the `requireBuilder()` redirect target — both currently point to `/express/login`.

---

## What This Does NOT Change

- Express Wizard suppression — already handled by `EXPRESS_ENABLED`. No changes needed.
- The `/admin/jobs/[id]/portal` config page — internal admin UI, NOT suppressed by `PORTAL_ENABLED`. Stays accessible to admins.
- Any existing role gates — `requireRole("admin")` and `requireRole("engineer")` calls are unchanged. `partner` simply cannot reach those routes.
- Login flow — `/login` is always reachable. All roles log in the same way.
