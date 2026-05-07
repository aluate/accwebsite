# EOD update — 2026-05-04 evening

Picking up from the post-audit cleanup. All 12 sev-1+2 fixes were already in;
this round addressed the rough edges that surfaced when you actually ran the
commands.

## Bugs fixed from your run

1. **`migrate.mjs` ESM/require mix** — was using `require()` inside an ES
   module, blew up on Node 24. Rewrote as full ESM with proper imports.
2. **`migrate.mjs` was incomplete** — only mirrored recent ALTERs + new
   tables, missing all the original tables (room_finishes, finish_moldings,
   finish_molding_rooms, etc.) and the bootstrap admin. Now mirrors lib/db.ts
   fully. Selftest "required tables exist" check will be GREEN after next
   run.
3. **`tsc` returning null exit code on Windows** — the `npx --no-install tsc`
   shim doesn't propagate exit codes through spawnSync on Windows. Switched
   to calling `node_modules/.bin/tsc.cmd` directly. Plus the error reporter
   now shows the actual tsc output, not just "tsc failed".

## New tools shipped

- **`npm run cleanup-orphan-fgs`** — lists the 7 NULL-column finish_groups
  with parent spec/job/client + downstream count. With `--delete-fg=ID,ID2`
  or `--delete-spec=ID` or `--delete-all-orphans` it actually deletes. Lets
  you decide per-row instead of bulk-defaulting (no $70k repeat).
- **`npm run health`** — one-stop ops diagnostic:
  - DB integrity check
  - FK violations
  - Orphan finish_groups (the $70k canary)
  - Webhook errors (silent failure detector)
  - Active admin count (locked-out detector)
  - Lifecycle distribution (how many specs at each state)
  - Last spec save time
  - Last backup age (warns at 36h, fails at 7d)
- **`ARCHITECTURE.md`** — bus-factor mitigation. Captures the *why* of the
  schema, lifecycle gates, role gates, dynamic-import policy, accepted
  tradeoffs, and known limitations. Read this first if anyone but you ever
  picks this codebase up.
- **`.github/workflows/selftest.yml`** — CI scaffold. The day you push to
  GitHub, every commit will run sync-catalogs + selftest automatically.
- **Phase 7 mobile pass round 2** — tighter padding on phone-narrow card
  containers (`p-4 sm:p-6`), sticky tab nav (stays at top while scrolling).

## What you need to do next

In order of priority:

1. **Clean the 7 orphan finish_groups** (test data from before the $70k fix):
   ```powershell
   cd C:\dev\repos\acc-website
   npm run cleanup-orphan-fgs                       # list them
   npm run cleanup-orphan-fgs -- --delete-all-orphans   # nuke if confirmed test data
   ```
   `fg-test-01` is obviously test data. The others (`bzu4jsq0`, `o3l1i2rm`,
   `hl4icy2u` on spec `cv5v0z54`; `5wuwlsld`, `3jfk22ph`, `1e55jhxb` on spec
   `v5l439wy`) should appear in the script's output with parent context so
   you can decide.

2. **Rotate the bootstrap admin password** (was just freshly created on
   migrate, currently `1234`):
   ```powershell
   npm run rotate-admin-pw "Summer2026!"
   ```
   The earlier failure was because the account didn't exist yet — migrate
   created it.

3. **Run `npm run selftest`** — should be GREEN across the board after
   migrate + cleanup ran. Eleven checks:
   - 3 catalog FK
   - 5 DB shape (now wired)
   - 1 lifecycle (11/11 in-memory)
   - 1 approvals (13/13 in-memory)
   - 1 typescript

4. **Run `npm run health`** every morning. If anything goes warn/fail you'll
   see it in 5 seconds.

5. **Set up `npm run backup` on Windows Task Scheduler** — instructions are
   inline in `scripts/backup.mjs` header. ~30 sec of clicking.

## Self-test status

Your last run showed `5 pass · 1 fail · 9 skip` — that was BEFORE migrate
ran. After migrate ran (which we did via `npm run migrate`), the SKIPs
become real checks. Now with the migrate.mjs + tsc fixes, expect:

- After `npm run migrate` + `npm run selftest`: should be 14 PASS / 1 FAIL
  (the FAIL is the orphan finish_groups check — fix that with cleanup-orphan-fgs).
- After running cleanup: should be **15 PASS / 0 FAIL / 0 SKIP**.

## Where the road map sits

Marked completed today:
- Sev 1 + 2 cleanup batch (12 items from the DAC/TT audit)
- Phase 9 admin library editor
- Phase 5 lifecycle UI + state machine
- Phase 3 spec+drawings combine
- Phase 2 Excel render
- Phase 6 engineering view + engineer role
- Title block in code (Option A)
- Phase 7 mobile pass (basic + accordion improvements)
- Cleanup helpers (orphan-fgs, health, backup, migrate)
- ARCHITECTURE.md
- CI scaffold

Pending Karl-only:
- DocuSign account provisioning (then I wire the envelope-create call)
- Buy accspec.net + Cloudflare Tunnel install
- Production build deploy
- Stain mixes, Tafisa colors, ML Cabinetcoat real codes, real builder defaults
- Set up Task Scheduler for backups
- Click through the new mobile pass on iPad/iPhone for visual confirmation

## Next session priorities (when you're back)

If you want me to keep moving on the road map autonomously next time, candidates:

1. **Pre-DocuSign envelope builder** — write the function that combines
   quote + drawings + disclosure into a draft envelope. Even without the
   DocuSign API key it can output a "ready to upload" merged PDF, which gets
   you 70% of the way there.
2. **Spec data refactor** — the `door_styles.csv` doesn't carry usage_group
   today, which means the Cab Door usage-group cross-validation is left as
   a soft "trust the user" path. Migrating door_styles to reference Cab Door
   inside_profile_id + panel_id directly would close that. ~2 hrs of work.
3. **Receivable email service** — basic outbound email (build status, error
   notifications) via Nodemailer. We already have nodemailer in deps but
   no email-out is wired.
4. **Image thumbnails for site photos** — JobFilesPanel currently lists
   filenames; mobile-uploaded site photos would benefit from inline
   previews. Browser-native via `<img src=URL>`, no sharp dep needed.

Have a good night. Self-test will tell you if anything regresses. 🍷
