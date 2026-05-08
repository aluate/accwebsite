/**
 * lib/schedule-holidays.ts
 * ACC observed holiday list. Single source of truth — edit here only.
 * Imported by lib/schedule-utils.ts for working-day calculations and
 * by the calendar renderer for visual holiday labels in cells.
 *
 * All dates are in America/Los_Angeles time.
 * Fixed holidays use observation rules (Sat → Fri, Sun → Mon).
 * Thanksgiving: Thursday only (Friday is a normal workday).
 */

export type Holiday = {
  /** ISO date string the holiday is OBSERVED (after weekend adjustment). */
  date: string;
  /** Short label shown in the calendar cell. */
  label: string;
};

/**
 * Returns the observed holiday list for a given calendar year.
 * Called once per year by the calculator and renderer.
 */
export function getHolidaysForYear(year: number): Holiday[] {
  const holidays: Holiday[] = [];

  function observe(month: number, day: number, label: string): void {
    const d = new Date(Date.UTC(year, month - 1, day));
    const dow = d.getUTCDay(); // 0=Sun, 6=Sat
    if (dow === 6) d.setUTCDate(d.getUTCDate() - 1); // Sat → Fri
    if (dow === 0) d.setUTCDate(d.getUTCDate() + 1); // Sun → Mon
    holidays.push({ date: d.toISOString().slice(0, 10), label });
  }

  // ── Fixed holidays ───────────────────────────────────────────────────────
  observe(1,  1,  "New Year's Day");
  observe(7,  4,  "Independence Day");
  observe(12, 24, "Christmas Eve");
  observe(12, 25, "Christmas Day");

  // ── Floating holidays ────────────────────────────────────────────────────

  // Memorial Day — last Monday in May
  {
    const d = new Date(Date.UTC(year, 4, 31)); // May 31
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1);
    holidays.push({ date: d.toISOString().slice(0, 10), label: "Memorial Day" });
  }

  // Labor Day — first Monday in September
  {
    const d = new Date(Date.UTC(year, 8, 1)); // Sep 1
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
    holidays.push({ date: d.toISOString().slice(0, 10), label: "Labor Day" });
  }

  // Thanksgiving — fourth Thursday in November
  {
    const d = new Date(Date.UTC(year, 10, 1)); // Nov 1
    while (d.getUTCDay() !== 4) d.setUTCDate(d.getUTCDate() + 1); // first Thursday
    d.setUTCDate(d.getUTCDate() + 21); // + 3 weeks = fourth Thursday
    holidays.push({ date: d.toISOString().slice(0, 10), label: "Thanksgiving" });
  }

  return holidays;
}

/**
 * Returns a Set of ISO date strings that are holidays in the given year(s).
 * Pre-built for fast O(1) lookups inside the calculator hot path.
 */
export function buildHolidaySet(years: number[]): Set<string> {
  const s = new Set<string>();
  for (const y of years) {
    for (const h of getHolidaysForYear(y)) s.add(h.date);
  }
  return s;
}
