/**
 * eng-warning.ts — "⚠ Ships in Nw — needs ENG", in one place.
 *
 * WHY THIS FILE EXISTS.
 *
 * Karl, 2026-09-23, on the pipeline: "I changed the shipping date, but the
 * warning didn't update. I thought we had it set up so that if it's changed
 * here, it updates everywhere."
 *
 * It was worse than a stale warning. This function was written out twice —
 * identically — once in PipelineClient and once in PmDashboardClient, and the
 * two copies were handed DIFFERENT dates:
 *
 *     PipelineClient     engWarnWeeks(job.anticipated_delivery ?? job.delivery_date, …)
 *     PmDashboardClient  engWarnWeeks(job.delivery_date, …)
 *
 * anticipated_delivery is not a column. It is COALESCE(install_start_date,
 * the first install event on the calendar, delivery_date), computed in
 * /api/admin/pipeline. So on any job with an install start set — which is most
 * real jobs — delivery_date was never reached, and editing the Delivery cell
 * changed the warning not at all.
 *
 * On job "Sleeth" that day: install start 2026-10-05, delivery 2026-10-28.
 * The pipeline said "Ships in 2w". The PM dashboard said 5w. Same job, same
 * moment, two screens, two answers, and the number the PM had just typed was
 * the one being ignored.
 *
 * WHAT IT COUNTS DOWN TO, AND WHY.
 *
 * jobs.delivery_date. Karl's call, 2026-09-23, asked directly.
 *
 * The reasoning is that engineering release gates production, and production
 * has to finish before the cabinets leave the shop — so the ship date is the
 * deadline the warning is about, which is also what it has always been named
 * after. install_start_date is when a crew begins, which is a different fact
 * about a different day.
 *
 * DELIBERATELY UNCHANGED: month grouping and the capacity rollups on the
 * pipeline still use anticipated_delivery. Those are about install and shop
 * load, where Karl's 2026-08-10 decision that the pipeline owns install still
 * applies. He was asked about the warning and answered about the warning; the
 * rest was not his to have decided by implication.
 *
 * Both screens now import this. A shared function that two callers can feed
 * different arguments is only half a single source of truth, so callers take a
 * job and the field choice lives here.
 */

/** Statuses that mean the job has not reached engineering yet. */
export const PRE_ENG_STATUSES = new Set(["intake", "bid", "design", "field_dims"]);

/** How far out the warning starts caring. */
export const ENG_WARN_WEEKS = 8;

/** The shape both screens already have. Anything with these two fields will do. */
export type EngWarnJob = {
  delivery_date: string | null;
  status: string;
};

/**
 * Weeks until this job ships, or null when there is nothing to warn about —
 * no date, already past engineering, or further out than ENG_WARN_WEEKS.
 *
 * Takes the JOB, not a date. The old signature took a date, which is exactly how
 * two call sites came to pass two different ones.
 */
export function engWarnWeeks(job: EngWarnJob | null | undefined): number | null {
  if (!job || !job.delivery_date || !PRE_ENG_STATUSES.has(job.status)) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  /*
    Noon UTC, not midnight: a bare yyyy-mm-dd parses as UTC midnight, which is
    the previous day in Pacific and would report a week short for half the year.
    Both copies already did this; it is kept, not re-derived.
  */
  const delivery = new Date(job.delivery_date + "T12:00:00Z");
  if (isNaN(delivery.getTime())) return null;

  const weeksOut = Math.ceil((delivery.getTime() - today.getTime()) / (7 * 86400000));
  return weeksOut <= ENG_WARN_WEEKS ? weeksOut : null;
}
