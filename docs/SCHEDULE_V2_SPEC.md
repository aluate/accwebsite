# Schedule V2 — Feature Spec

> Planned 2026-05-07. All decisions locked. Hand this to a build session with zero ambiguity.
> Point a future session at this file after deployment to resume build work.

---

## Overview

Nine features extending the existing `/schedule` wall TV calendar. The MVP shipped 2026-05-06 (spanning bars, on-deck column, crew filter, Add Event modal). This spec covers everything planned on top of it.

**Build order is at the bottom of this file. Follow it — PATCH/DELETE on `job_events` is a hard prerequisite for several features.**

---

## Feature 1: Working-Day Calculator

**File:** `lib/schedule-utils.ts` (shared utility, importable client and server)

Two exported functions:

```ts
calculateEndDate(startDate: string, durationDays: number): string
// Steps forward skipping Sat/Sun + holiday list. Returns YYYY-MM-DD.

calculateDuration(startDate: string, endDate: string): number
// Inverse — used to populate duration field when loading existing events.
```

**Holiday skip list:**
- New Year's Day (Jan 1)
- Memorial Day (last Monday in May)
- Independence Day (Jul 4)
- Labor Day (first Monday in September)
- Thanksgiving (fourth Thursday in November)
- Christmas Eve (Dec 24)
- Christmas Day (Dec 25)

**Observation rule:** If a fixed holiday falls on Saturday, observe Friday. If Sunday, observe Monday.

**Thanksgiving:** Thursday only — Friday is a normal working day.

**Storage:** Single constants file (e.g. `lib/schedule-holidays.ts`). Update list there — no logic changes needed. Future: Karl will supply handbook language to finalize the list.

**Timezone:** All dates stored as plain `YYYY-MM-DD` strings. Never datetimes. Server UTC clock never touches them. Display and calculation use `America/Los_Angeles` (handles PST/PDT transitions automatically).

**Visual labels:** The calendar cell for each holiday date shows a small label ("Christmas Eve") even when no events are scheduled. Advisory only — not a blocking event, not on the on-deck list.

---

## Feature 2: Duration Input on Event Forms

Replace the end-date-only field on `AddEventForm` and the phase intake form with a **dual-mode input**: enter an end date OR a duration in working days. Setting one auto-fills the other in real time using `calculateEndDate` / `calculateDuration`.

**Default durations by event type (pre-fill, editable):**

| Event Type | Default (days) |
|---|---|
| `install` | 3 |
| `service` | 1 |
| `punch` | 1 |
| `cab_delivery` | 1 |
| `top_delivery` | 1 |
| `final_walkthrough` | 1 |

Future: smart defaults derived from `actual_start`/`actual_end` deltas once 6–12 months of reconciled actuals accumulate.

---

## Feature 3: Phase Intake on Job-Detail Schedule Tab

**New tab on `/jobs/[id]`** — "Schedule" tab, sits alongside existing job detail tabs.

**Scope:** Install phases only. Other event types (deliveries, service, etc.) are added via the existing Add Event modal on the wall page.

### Form behavior

- Phase 1 row always present.
- "Add Phase" button appends Phase 2–5. Disabled at 5 rows (residential max).
- Each phase row contains:
  - **Label** — dropdown from `event_phase_labels` table + "Other" with optional free-text field (not required; flat text goes into `description`)
  - **Start date** — date picker
  - **Duration** — number input (working days) → auto-fills end date read-only beside it
  - **Blocked on** (Phase 2+ only) — free text, captures gap reason ("waiting on countertops," "customer sign-off pending")
- Blank/incomplete phase rows are silently skipped on save.
- On save: one `job_event` of type `install` per non-blank phase, auto-chained via `parent_event_id` (Phase 2's parent = Phase 1's id, etc.).
- Wall TV labels them "1 of N / 2 of N" via existing parent-chain walk.

### Existing phase management

The tab also lists existing `install` events for the job. Each row is editable (change label/start/duration) and deletable. Requires PATCH + DELETE endpoints — **hard prerequisite, ship first.**

### Phase labels — admin-editable

Stored in `event_phase_labels` table. Presented as a dropdown in the phase form.

**Seed list:** Ladder Bases, Casework, Pulls & Panels, Post Tops, Other

Admin UI: simple list manager (add label via text input + Enter, "×" to remove). Lives in the admin area. Labels evolve as patterns emerge from real use — "Other" with free text handles edge cases until a new label earns its place.

---

## Feature 4: Spanning Bar Calendar Renderer

Replaces the current "start-day card with → end indicator" with a true spanning bar.

### Bar anatomy

- **Color:** Crew color (existing stable palette by `crew.id` index). Fills the bar.
- **HOT treatment:** `service` and `punch` event types get a thick (~4–5px) solid orange/red left-border stripe overlaid on the crew-color bar. Readable from across the room. `final_walkthrough` is NOT hot.
- **Start cell:** Crew name + phase label (e.g. "Slavic — Casework")
- **Middle cells:** Solid bar, no text (or job number if space allows)
- **End cell:** Bar with a small terminal right-cap

### Row wrapping (multi-week events)

Events that span across a week row boundary:
- Truncate at the last cell of the row with a small right-arrow cap
- Resume at the first cell of the next row with a small left-arrow cap
- Same crew color, visually continuous

### Lane assignment — MUST be global

**Critical:** Lane assignment must be computed across the entire visible date range before rendering — NOT per row. Each event gets the lowest available lane not occupied by any overlapping event. Events hold their assigned lane consistently across every cell and every row they span. Per-row assignment produces visual collisions at row breaks.

### Overlapping events

Multiple events on the same day stack vertically in their lanes. Four overlapping installs = four color-coded bars stacked in the cell. Each is readable by crew color.

### Row height

Dynamic — rows grow to fit however many lanes are occupied. No hard max. Roughly 2 weeks visible without scrolling is acceptable for the wall TV. Scrolling is fine.

### Unassigned crew

`crew_id = NULL` events render with red fill + "Unassigned" label. DAC rule — never invisible.

---

## Feature 5: Calendar Navigation

### Desktop (month-picker + week scroll)

- Header shows month/year ("May 2026") with prev/next month arrows and a jump-to-date control.
- Grid renders all weeks touching the selected month (typically 4–6 rows).
- Vertical scroll through those rows.
- No ceiling on navigation — jump to any month, any year.
- **API query pattern:** fetch events where `date_start <= last_day_of_range AND (date_end >= first_day_of_range OR date_start >= first_day_of_range)`. Fetches events that OVERLAP the visible range, not just events that start in it. Critical for multi-week events and month-boundary display.

### Mobile (weekly view)

- Default view: one week, swipe left/right to navigate weeks.
- Two bottom tabs:
  - **Schedule** — the week grid
  - **On Deck** — scrollable card list of all on-deck events
- Read-only for all non-admin users on mobile.
- No side column — on-deck is tab-accessed only.

### TV mode

`/schedule?tv=1` (or dedicated `/schedule/wall`):
- Strips nav chrome
- Enlarges card text (readable from across the room)
- Hides PTO and admin tabs
- Idles to read-only after timeout (duration TBD, configurable)

---

## Feature 6: Schema Additions

### `job_events` — two new nullable columns

```sql
actual_start  DATE  NULL  -- set during weekly reconciliation
actual_end    DATE  NULL  -- set during weekly reconciliation
```

Enables future duration-intelligence parser: query delta between `date_start`/`date_end` (planned) and `actual_start`/`actual_end` (what happened).

### New table: `crew_pto`

```sql
CREATE TABLE crew_pto (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id      INTEGER NOT NULL REFERENCES crews(id),
  date_start   TEXT NOT NULL,  -- YYYY-MM-DD
  date_end     TEXT NOT NULL,  -- YYYY-MM-DD
  note         TEXT,
  created_by   INTEGER REFERENCES builder_accounts(id),
  created_at   TEXT DEFAULT (datetime('now'))
);
```

Applies to ALL crew kinds (inhouse + sub). No separate flow.

**Crew seed correction:** Arik and Andy are in-house. Slavic and Tanner are subs. The original seed had this backwards.

### New table: `event_phase_labels`

```sql
CREATE TABLE event_phase_labels (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  label      TEXT NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0,
  active     INTEGER DEFAULT 1  -- boolean as 0/1
);
-- Seed: Ladder Bases, Casework, Pulls & Panels, Post Tops, Other
```

### New table: `schedule_change_requests`

```sql
CREATE TABLE schedule_change_requests (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  job_event_id   INTEGER NOT NULL REFERENCES job_events(id),
  requested_by   INTEGER NOT NULL REFERENCES builder_accounts(id),
  reason         TEXT NOT NULL,
  status         TEXT DEFAULT 'pending',  -- 'pending' | 'approved' | 'denied'
  reviewed_by    INTEGER REFERENCES builder_accounts(id),
  reviewed_at    TEXT,
  created_at     TEXT DEFAULT (datetime('now'))
);
```

---

## Feature 7: PTO / Crew Unavailability

**Location:** Admin area (alongside PTO list, ready-to-schedule queue, pending removal requests — single admin tab).

**Applies to:** All crew kinds. Same table, same UI.

### Conflict detection integration

`getConflicts()` queries `crew_pto` in addition to `job_events`. Conflict message format: `"Slavic has unavailability May 14–16 within this event's range."` Same warn-but-allow pattern, same click-through acknowledgment.

**Day-of absence:** Not a real-time entry path. Handled retroactively at weekly reconciliation — actual dates on the event record capture what really happened.

---

## Feature 8: Weekly Reconciliation UX

Accessible at `/schedule/verify`.

### Happy path (smooth weeks)

Single "All ran as scheduled — lock week" button. One click, week locked. This is the primary path — don't make a smooth week feel like paperwork.

### Per-event edit path

Each event row shows:
- Planned start / planned end (from `date_start` / `date_end`)
- Editable actual start / actual end fields (write to `actual_start` / `actual_end`)

Edit only the rows that differed. Leave the rest — clicking "lock week" treats unedited rows as planned = actual.

### Locking

Sets `verified_by` + `verified_at` on the `schedule_weeks` row for that week. All events in the week get `actual_start`/`actual_end` written (planned values where not overridden, entered values where they were).

---

## Feature 9: Ready-to-Schedule Workflow

### PM flags a job

"Ready to Schedule" button on job detail page. Manual trigger — no prerequisites enforced for now (gate later if needed).

**On flag, system auto-creates two On Deck `job_events`:**
1. `cab_delivery` — `date_start = NULL`, note = PM's note
2. `install` — `date_start = NULL`, note = PM's note

Both events appear in Karl's On Deck column immediately. Both are color-coded Normal (planned work — not Hot).

PM adds a note at flag time (optional but encouraged). Note surfaces in the `note` field on both On Deck events.

### Color coding

**In On Deck column:**
- Hot (event_type = `service` or `punch`) → orange/red card
- Normal (event_type = `install`, `cab_delivery`, `top_delivery`, `final_walkthrough`) → muted blue-gray card
- Once Karl assigns crew and drags to calendar → crew color takes over

**On calendar:**
- All events: crew color fills the bar
- Hot events additionally: thick orange/red left-border stripe (~4–5px)

### Event type classification

| Event Type | Hot? | Notes |
|---|---|---|
| `install` | No | Planned work |
| `cab_delivery` | No | Planned work |
| `top_delivery` | No | Planned work |
| `final_walkthrough` | No | Planned work |
| `service` | **Yes** | Reactive — callbacks, COs, COQ. Description carries specifics ("CO #3 fronts," "COQ — drawer boxes") |
| `punch` | **Yes** | Reactive |

Change orders and COQ collapse into `service` for now. Promote to own event types once patterns emerge in real use.

### PM un-flags / removes from On Deck

PM can remove their own On Deck events freely — nothing is scheduled yet, no approval needed.

### Pull-from-schedule approval

For events already on the calendar:
1. PM submits removal request via `schedule_change_requests` (reason required).
2. Karl sees pending requests in the admin queue tab.
3. Karl approves → event returns to On Deck (not deleted — stays on radar).
4. Karl denies → event stays scheduled.

### Karl's scheduling queue

Admin tab — simple list showing:
- Jobs with On Deck events awaiting scheduling
- Pending removal requests (with reason)
- PTO / unavailability entries

Badge count on admin nav when items are waiting.

---

## Auth / Permissions

**Current state:** Karl edits everything. All other logged-in users have read-only visibility.

- Wall calendar: Karl = full edit. Any authenticated user = read-only.
- On Deck: Karl = drag to calendar + edit. PMs = can add/remove their own On Deck events (from the "Ready to Schedule" flow). Others = read-only.
- TV mode: Admin-locked. Idle timeout reverts to read-only.

**Design for extensibility:** Implement scheduling edit rights as a capability flag per user (`can_schedule: boolean` on `builder_accounts`), not as a role rename. Granting scheduling access to specific users later is then a one-column update, not a schema redesign.

---

## Drag-to-Reschedule Interaction Note

The drag handler **must use `calculateEndDate` / `calculateDuration`**, not raw calendar day arithmetic. Moving a 5-working-day event 2 days forward = add 2 working days to both `date_start` and `date_end`. Raw `+ 2 days` silently lands on weekends or skips holidays.

---

## Build Order

Follow this order — items earlier in the list unblock items later.

1. **PATCH + DELETE on `job_events`** (Task #15 — unblocks phase intake tab and edit flow)
2. Schema additions (`actual_start`/`actual_end`, `crew_pto`, `event_phase_labels`, `schedule_change_requests`)
3. Working-day calculator utility (`lib/schedule-utils.ts`)
4. Duration input on `AddEventForm`
5. Spanning bar renderer + global lane assignment
6. Month-picker navigation + mobile weekly view + TV mode query param
7. Job-detail Schedule tab (phase intake — requires #1 and #3)
8. PTO admin UI + conflict detection integration
9. Ready-to-Schedule workflow (flag button + On Deck auto-create)
10. Pull-from-schedule approval flow
11. Weekly reconciliation UX at `/schedule/verify`
12. Admin queue tab (PTO + ready-to-schedule + pending requests)
