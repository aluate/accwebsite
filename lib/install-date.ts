/**
 * lib/install-date.ts — one official install date per job.
 *
 * THE RULE (Karl's, 2026-08-10): the pipeline board owns the install date.
 * `jobs.install_start_date` is official.
 *
 *   - Change it on the pipeline → the scheduled install event MOVES to match,
 *     automatically, keeping its length and its crew.
 *   - Change it on the calendar → the calendar wins for that event, and the user is
 *     ASKED whether to make the new date official. Nothing is written to the job
 *     until they say yes.
 *
 * Before this there were two install dates and nothing connecting them:
 * `jobs.install_start_date`, edited on the pipeline and the PM dashboard, and the
 * `job_events` row of type `install`, dragged around on the schedule wall. They could
 * disagree indefinitely with nothing anywhere saying so — the office reading one and
 * the crew turning up on the other.
 *
 * WHICH EVENT. A job can have several install events. "The" install is the earliest
 * one that has a date, which is exactly the row `/api/admin/pipeline` reads for its
 * board columns — so the sync and the board can never be looking at different events.
 *
 * WHAT THIS DOES NOT DO, deliberately:
 *
 *   - It never creates an install event. A job with none is not on the calendar yet,
 *     and that is the scheduler's decision, not a side effect of typing a date.
 *   - It never schedules an ON DECK event (one with no date_start). Giving it a date
 *     would place it on the wall, bypassing the scheduling flow.
 *   - It never clears an event. Blanking the official date does not cancel a booked
 *     crew day; that has to be done on the calendar, on purpose.
 *
 * Each of those returns a reason rather than doing nothing quietly, so the caller can
 * say what happened.
 */
import { sql } from "@/lib/db";
import { updateEvent, type JobEventWithJoins } from "@/lib/schedule";

/** The event the board reads: earliest dated install event for the job. */
export type InstallEventRow = {
  id: string;
  job_id: string;
  date_start: string | null;
  date_end: string | null;
  crew_id: string | null;
  status: string;
};

export type InstallSyncOutcome =
  | { moved: true; eventId: string; from: string | null; to: string; spanDays: number; conflicts: JobEventWithJoins[] }
  | { moved: false; reason: string; eventId?: string };

/** Whole days between two ISO dates. Negative spans are treated as same-day. */
function spanDays(start: string, end: string | null): number {
  if (!end) return 0;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** ISO date + n whole days, in UTC so no timezone can shift the day. */
function addDays(iso: string, n: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return iso;
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/** Same rule as /api/admin/pipeline: earliest install event that has a start date. */
export async function earliestDatedInstallEvent(jobId: string): Promise<InstallEventRow | null> {
  const [row] = await sql<InstallEventRow[]>`
    SELECT id, job_id, date_start, date_end, crew_id, status
    FROM job_events
    WHERE job_id = ${jobId} AND event_type = 'install' AND date_start IS NOT NULL
    ORDER BY date_start ASC
    LIMIT 1
  `;
  return row ?? null;
}

/** Every install event on the job, dated or not — for reporting, not for deciding. */
export async function allInstallEvents(jobId: string): Promise<InstallEventRow[]> {
  return await sql<InstallEventRow[]>`
    SELECT id, job_id, date_start, date_end, crew_id, status
    FROM job_events
    WHERE job_id = ${jobId} AND event_type = 'install'
    ORDER BY date_start ASC NULLS LAST, sort_order ASC
  `;
}

/**
 * Move the job's install event onto the official date. Called after a successful
 * write to jobs.install_start_date.
 *
 * Goes through updateEvent rather than a bare UPDATE so the change lands in
 * job_event_audit and crew conflicts come back — an automatic move that silently
 * double-books a crew would be worse than no sync at all.
 */
export async function syncInstallEventToOfficialDate(
  jobId: string,
  officialDate: string | null | undefined,
  actor: string,
): Promise<InstallSyncOutcome> {
  if (officialDate == null || String(officialDate).trim() === "") {
    return { moved: false, reason: "the official install date was cleared — the schedule was left alone, since blanking a field should not cancel a booked crew day" };
  }
  const official = String(officialDate).slice(0, 10);

  const events = await allInstallEvents(jobId);
  if (events.length === 0) {
    return { moved: false, reason: "this job has no install event on the schedule yet, so there was nothing to move" };
  }

  const target = events.find((e) => e.date_start != null) ?? null;
  if (!target) {
    return { moved: false, reason: "the install event is still ON DECK with no date — placing it on the wall is the scheduler's call, so it was left alone" };
  }
  if (target.date_start === official) {
    return { moved: false, reason: "the schedule already had this date", eventId: target.id };
  }

  const span = spanDays(target.date_start!, target.date_end);
  const patch = { date_start: official, date_end: target.date_end ? addDays(official, span) : null };

  const result = await updateEvent(target.id, patch, actor);
  if (!result.ok) {
    return { moved: false, reason: `the schedule refused the move: ${result.error}`, eventId: target.id };
  }

  return {
    moved: true,
    eventId: target.id,
    from: target.date_start,
    to: official,
    spanDays: span,
    conflicts: result.conflicts ?? [],
  };
}

export type InstallDatePrompt = {
  job_id: string;
  job_label: string;
  event_id: string;
  /** What the job currently calls official. Null when it has never been set. */
  official: string | null;
  /** Where the event now sits. */
  scheduled: string;
};

/**
 * After a calendar event's dates change, decide whether to ask about making the new
 * date official. Returns null when there is nothing worth asking.
 *
 * Only asks when the event is the one the board reads, and only when the two actually
 * disagree — a prompt that appears when nothing has diverged trains people to dismiss
 * prompts without reading them.
 */
export async function installDatePromptFor(eventId: string): Promise<InstallDatePrompt | null> {
  const [ev] = await sql<{ id: string; job_id: string; event_type: string; date_start: string | null }[]>`
    SELECT id, job_id, event_type, date_start FROM job_events WHERE id = ${eventId}
  `;
  if (!ev || ev.event_type !== "install" || !ev.date_start) return null;

  const earliest = await earliestDatedInstallEvent(ev.job_id);
  if (!earliest || earliest.id !== ev.id) return null;   // not the date the board reads

  const [job] = await sql<{ install_start_date: string | null; client_name: string; job_number: string | null }[]>`
    SELECT install_start_date, client_name, job_number FROM jobs WHERE id = ${ev.job_id}
  `;
  if (!job) return null;

  const official = job.install_start_date ? String(job.install_start_date).slice(0, 10) : null;
  const scheduled = String(ev.date_start).slice(0, 10);
  if (official === scheduled) return null;

  return {
    job_id: ev.job_id,
    job_label: job.job_number ? `${job.job_number} — ${job.client_name}` : job.client_name,
    event_id: ev.id,
    official,
    scheduled,
  };
}
