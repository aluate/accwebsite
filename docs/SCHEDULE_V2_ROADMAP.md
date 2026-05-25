# Schedule V2 — Roadmap to Spec

> Drafted 2026-05-16. Companion to `SCHEDULE_V2_SPEC.md`. Built off a disk audit, not memory.
> Phases are ordered by user-visible risk first, then by dependency depth.
> Each phase ends with a Devil's Advocate Check (run before building) and a Tahiti Test (run before merging).

---

## Status snapshot

What's already on disk and working:

- Working-day calculator (`lib/schedule-utils.ts`) + holiday list (`lib/schedule-holidays.ts`)
- Duration input on Add Event form
- Phase intake create flow (max-5, parent_event_id chain, blocked_on)
- Spanning bars with global lane assignment + HOT stripe + holiday cell labels + week-boundary right-cap
- Desktop month picker, mobile weekly view with swipe + dual tabs, TV mode `?tv=1` chrome strip
- All schema additions (`actual_start`, `actual_end`, `crew_pto`, `event_phase_labels`, `schedule_change_requests`, `can_schedule`)
- PTO admin UI (`AdminScheduleClient` PTO tab) + `/api/schedule/pto` CRUD
- Ready-to-schedule button + `/api/schedule/ready` (creates cab_delivery + install on-deck pair)
- Pull-from-schedule via `/api/schedule/change-requests` (approve → date_start = NULL)
- Admin queue tab + `/api/schedule/admin-queue` aggregator
- Drag-to-reschedule uses `calculateEndDate` / `calculateDuration`, not raw arithmetic

What's missing or partial:

1. PTO is invisible to conflict detection
2. No `/schedule/verify` page; `actual_start`/`actual_end` never written
3. Phase intake: existing rows can be deleted but not edited
4. No "Unassigned" red-fill for crew_id = NULL (DAC rule violation)
5. TV mode: chrome strips fine, but no enlarged typography and no idle-revert timeout
6. No admin nav badge for pending queue items
7. `can_schedule` flag exists in schema but no code reads it

---

## Phase A — Stop the silent PTO failure (HIGHEST IMPACT)

**Why first:** This is the schedule's `$70k failure mode` pattern — a crew is marked unavailable, but the schedule lets you book them straight through and gives no warning. The data is in the DB; the UI just doesn't ask the right question.

**Scope (all in `lib/schedule.ts`):**

1. Add `findPtoConflicts({ crewId, dateStart, dateEnd?, excludeEventId? })` — same shape as `findCrewConflicts`. Returns rows from `crew_pto` overlapping the window.
2. Extend the result type returned by `createEvent` / `updateEvent` to include `pto_conflicts: CrewPto[]` alongside the existing `conflicts`.
3. `findCrewConflicts` stays as-is (single responsibility); the API routes call both and merge.
4. Update `POST /api/schedule/events` and `PATCH /api/schedule/events/[id]` to surface both arrays. Conflict shape on the wire should distinguish `type: "booking" | "pto"`.
5. Update `AddEventForm` conflict UI to render PTO rows distinctly: `"Slavic has unavailability May 14–16 within this event's range."` (spec wording, line 235).
6. Same warn-but-allow pattern — never block the save.

**Files touched:** `lib/schedule.ts`, `app/api/schedule/events/route.ts`, `app/api/schedule/events/[id]/route.ts`, `components/AddEventForm.tsx`. ~150 lines of changes.

**Devil's Advocate Check:** Is "warn but allow" actually wanted for PTO, or do we want to soft-block (require explicit "yes, override the PTO" click)? Spec says warn-but-allow consistent with booking conflicts. Keep that — don't introduce a special PTO override path until real use says otherwise.

**Tahiti Test:** If Karl is gone for a week and an admin assigns a crew across someone's PTO, does the warning render clearly enough that the admin notices? Test by booking Slavic across a known PTO range and screenshotting the form.

---

## Phase B — Weekly Reconciliation (`/schedule/verify`)

**Why second:** The whole point of the schedule dashboard is to be a ground-truth reconciliation loop, not a planning toy. Without `actual_start` / `actual_end` capture, you can never accumulate the 6–12 months of deltas that unlock the duration-intelligence parser the spec hints at.

**Scope:**

1. `app/schedule/verify/page.tsx` — server-rendered list of last week's events. Query: events whose `date_start` falls within the prior calendar Mon–Fri.
2. `components/ScheduleVerifyClient.tsx` — single happy-path button ("All ran as scheduled — lock week") plus per-row editable `actual_start` / `actual_end` inputs.
3. `app/api/schedule/verify/route.ts` — `POST` accepts `{ week_start_date, overrides: { event_id, actual_start, actual_end }[] }`. Logic:
   - Insert/update `schedule_weeks` row with `verified_at` + `verified_by`.
   - For each event in the week: set `actual_start` and `actual_end` to override values where provided, else copy `date_start` and `date_end`.
   - Wrap in `sql.begin` transaction. Audit-log writes via existing `job_event_audit` table.
4. Week-picker: default to the most recent un-locked week. Prev/next nav for late-verifying older weeks.
5. Locked weeks display read-only with a "Week locked" badge.

**Files touched:** 3 new files (~250 lines), plus `app/admin/(protected)/schedule/page.tsx` to wire a "Verify last week" link in the admin tab nav.

**Devil's Advocate Check:** Does locking a week need to be reversible? If an entry is wrong post-lock, what's the recourse? Spec is silent. **Default decision:** admin can unlock (clear `verified_at` / `verified_by`) via the same page; log the unlock to `job_event_audit`. Push back if you'd rather have it permanent.

**Tahiti Test:** If a green PM (not Karl) reconciles a week, can they do it without asking? The happy-path button must be obvious enough that "all ran as scheduled" doesn't require explanation.

---

## Phase C — Phase intake edit on existing rows

**Why third:** Small but DAC-relevant. Right now, if Karl writes a phase with the wrong label or start date, he has to delete + recreate, which breaks the parent_event_id chain. Edit-in-place is the spec.

**Scope:**

1. `PhaseIntakeClient.tsx` lines 132–173 — replace the read-only existing-phase rows with editable rows. Each row: label dropdown, start date, duration, crew, blocked_on, plus Save and Delete.
2. New "Edit" mode per row (don't make all rows editable at once — that's a churn risk).
3. Saves use `PATCH /api/schedule/events/[id]` (already built).
4. Validation: editing a phase mid-chain should NOT auto-update parent_event_id (that's a manual reorder operation, out of scope here).

**Files touched:** Just `components/PhaseIntakeClient.tsx`. ~100 lines added.

**Devil's Advocate Check:** Should Phase 1 be editable if Phases 2–5 chain off it? Editing Phase 1's label doesn't change its id, so the chain stays intact. Start/end dates also don't break the chain since chaining is by id, not date. Safe.

**Tahiti Test:** Can a PM fix a typo without help? If they have to call Karl to fix a label, the feature failed.

---

## Phase D — Unassigned-crew red fill (DAC rule)

**Why fourth:** Small, single-component, but the spec is explicit: "DAC rule — never invisible." Right now `crew_id = NULL` events render with whatever fallback color the lane logic picks. That's the silent-default pattern the spec was written against.

**Scope:**

1. `ScheduleWallClient.tsx` — in the `SpanningCalendar` event-render block (line ~942), check `ev.crew_id`. If null, override `bg` to red (`rgba(239, 68, 68, 0.35)` or similar) and override the start-cell label to `"Unassigned"`.
2. Same treatment in the on-deck column rendering (~line 446) and mobile day-cards (~line 565) and side column (~line 613).
3. Add a small "Unassigned" pill style constant alongside `HOT_STRIPE`.

**Files touched:** Just `components/ScheduleWallClient.tsx`. ~40 lines.

**Devil's Advocate Check:** Will red-on-red collide with HOT events? Yes — service/punch get an orange/red stripe; an unassigned service event would be red bar + red-orange stripe. Decision: HOT stripe wins (it's the more-critical signal); for unassigned + hot, the bar stays red but the stripe is the existing HOT orange.

**Tahiti Test:** Walk past the wall TV. Can you spot the unassigned event in under a second? If not, the color isn't loud enough.

---

## Phase E — TV mode polish (enlarged text + idle timeout)

**Why fifth:** Pure UX; doesn't block any data correctness.

**Scope:**

1. `ScheduleWallClient.tsx` — gate typography on `tvMode`:
   - Event labels in calendar cells: `text-sm` → `text-base` (or `text-lg` if testing on the wall warrants).
   - Day-of-week / day-of-month headers: bump one tier.
   - Crew filter / month picker (already hidden in TV mode — N/A).
2. Idle timeout: `useEffect` with a 5-minute inactivity timer (any mousemove/keydown resets it). On fire, set a local `tvLockedReadOnly` flag that disables drag handlers and the Add Event button. Config var: `TV_IDLE_TIMEOUT_MS = 5 * 60 * 1000`.
3. Touch is mostly N/A — this is a wall TV — but make sure `tvMode && tvLockedReadOnly` short-circuits both the drag and click handlers.

**Files touched:** Just `components/ScheduleWallClient.tsx`. ~60 lines.

**Devil's Advocate Check:** Is the idle timeout actually needed if the TV is mounted behind reception, not customer-facing? Probably not — but spec asked for it. **Decision:** ship it but make the timeout configurable via `?tv=1&idle=600` so Karl can disable it (`idle=0`) if he wants always-edit.

**Tahiti Test:** From across the shop floor (≈20 ft), can you read who's installing what tomorrow? If text isn't legible at 20 ft, bump again.

---

## Phase F — Admin nav badge

**Why sixth:** Minor UX polish. The data is already there.

**Scope:**

1. `components/Header.tsx` — fetch `/api/schedule/admin-queue` (cheap; already returns `totalPending`) when the logged-in user is admin. Show a small orange dot or count badge on the "Schedule" or "Admin" nav link.
2. Use React Server Component fetch or a small client-side polling hook (every 60s); whichever is consistent with the rest of the header.

**Files touched:** `components/Header.tsx` (+ possibly a small new client component for the badge).

**Devil's Advocate Check:** Is a badge enough, or does Karl need a notification when a PM submits a removal request? Defer notifications — start with the badge and see whether Karl checks it on his own cadence.

**Tahiti Test:** If a PM submits a removal request and Karl is in the office, does Karl see it within an hour? Manual smoke test.

---

## Phase G — Wire `can_schedule` capability

**Why last:** Forward-looking; nothing breaks today. Worth doing while the rest is fresh so future-Karl doesn't have to re-learn the schedule layer to grant a single user edit rights.

**Scope:**

1. `lib/auth.ts` — add `canSchedule(builder): boolean` returning `builder.role === "admin" || builder.can_schedule === 1`.
2. Replace `builder.role !== "admin"` checks in schedule-edit routes with `canSchedule(builder)`. Hits:
   - `app/api/schedule/pto/route.ts` (POST + DELETE)
   - `app/api/schedule/change-requests/route.ts` (PATCH — review)
   - `app/api/schedule/phase-labels/route.ts` (POST + DELETE)
   - `app/admin/(protected)/schedule/page.tsx` (the in-page admin guard)
   - `app/api/schedule/events/[id]/route.ts` and `route.ts` (the create/edit endpoints currently require any logged-in builder; tighten if needed)
3. Add an admin tool to flip the bit on individual users. Out of scope for now — a `UPDATE builder_accounts SET can_schedule = 1 WHERE username = 'x'` is fine for the first ~5 grants.

**Files touched:** `lib/auth.ts` + 4–5 route files. ~40 lines.

**Devil's Advocate Check:** Should `can_schedule` also gate the wall-page edit affordances (drag, Add Event button)? Yes — `ScheduleWallClient.tsx` already passes `isAdmin` down; pass `canSchedule` instead.

**Tahiti Test:** Grant `can_schedule = 1` to one non-admin builder. Confirm they can edit the schedule but not crews, jobs, or the libraries.

---

## Sequencing notes

Phases A–C are independent and can ship in any order. Phase D is independent. Phase E and F are independent. Phase G should ship last because it touches every other route file — doing it after the others are stable avoids merge churn.

**Recommended order (1 sprint each, where a sprint = ~half a day of focused work):**

1. **Sprint 1:** Phase A (PTO conflict) + Phase D (Unassigned red) — both small, both DAC-critical, both ship together as "the silent-defaults sweep."
2. **Sprint 2:** Phase B (Weekly reconciliation) — biggest scope, but isolated. Single PR.
3. **Sprint 3:** Phase C (Phase intake edit) + Phase F (Admin badge) — small polish pair.
4. **Sprint 4:** Phase E (TV polish) + Phase G (can_schedule wire-up) — polish + extensibility, last because nothing depends on them.

Each sprint ends with a commit to `master` (per project pattern — no feature branches today). Per-sprint smoke test: open `/schedule` and `/schedule/verify` and `/admin/schedule` on the live deploy; confirm no console errors and at least one feature in the sprint works end-to-end.

---

## What this roadmap does NOT cover

- **The 150 uncommitted files in the repo.** Roadmap above assumes a clean baseline. Before starting Phase A, decide whether to commit, stash, or discard the existing dirty state. That's a separate conversation.
- **Duration-intelligence parser** — spec hints at it as a future feature once 6–12 months of `actual_*` data accumulates. Out of scope until the data exists.
- **Per-event editable rows on the wall calendar.** Today you drag to move dates and click to open an edit modal (via `/api/schedule/events/[id]` PATCH). If inline editing turns out to be needed, that's a v3 conversation.
- **Schedule-wide bulk operations** (e.g., "shift this crew's whole next week back by 2 days"). Out of scope.
