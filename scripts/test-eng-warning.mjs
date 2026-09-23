#!/usr/bin/env node
/**
 * test-eng-warning.mjs — the "ships in Nw — needs ENG" warning gives one answer.
 *
 * WHY THIS EXISTS.
 *
 * Karl, 2026-09-23, on the pipeline: "I changed the shipping date, but the
 * warning didn't update. I thought we had it set up so that if it's changed
 * here, it updates everywhere."
 *
 * The warning was written out twice, identically, in PipelineClient and
 * PmDashboardClient — and the two copies were handed different dates. The
 * pipeline passed anticipated_delivery (a computed alias that leads with
 * install_start_date), the dashboard passed delivery_date. On job Sleeth that
 * day — install start 2026-10-05, delivery 2026-10-28 — the pipeline said
 * "2w" and the dashboard said "5w" about the same job at the same moment, and
 * the date the PM had just typed was the one being ignored.
 *
 * Duplicated logic does not drift because someone edits one copy. It drifts
 * because the two copies get different inputs, which no amount of keeping the
 * bodies identical would have caught. So this file checks BOTH: that there is
 * one implementation, and that nothing feeds it a hand-picked field.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./strip-source.mjs";
import { engWarnWeeks, PRE_ENG_STATUSES, ENG_WARN_WEEKS } from "../lib/eng-warning.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => stripComments(readFileSync(join(ROOT, p), "utf8"));

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

/** A date N days from today, as yyyy-mm-dd, so these never go stale. */
function inDays(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

console.log("\n1. it counts down to the delivery date\n");
/*
  THE ROUNDING IS LOCKED IN AS FOUND, NOT AS I WOULD WRITE IT.

  Measured behaviour: 0 days -> 1w, 7 -> 2w, 12 -> 2w, 35 -> 6w, and anything
  already past -> 0w. Every figure sits one above the intuitive one, because the
  ceil compares today-at-local-midnight with the date at noon UTC, and an overdue
  job collapses to "0w" instead of reading as late.

  That is how both old copies behaved and it is what the numbers on Karl's screen
  mean today. He asked which DATE the warning counts to, and that is what changed.
  Re-rounding it would shift every warning on the board by a week in the same
  patch, which is not a change to make on the way past — it is flagged to him
  separately. These assertions pin the current arithmetic so that when it is
  changed, it is changed on purpose.
*/
check("12 days out reads 2w — the figure on Karl's screenshot",
      engWarnWeeks({ delivery_date: inDays(12), status: "design" }) === 2);
check("35 days out reads 6w",
      engWarnWeeks({ delivery_date: inDays(35), status: "design" }) === 6);
check("shipping today reads 1w (see the note above)",
      engWarnWeeks({ delivery_date: inDays(0), status: "design" }) === 1);
check("a week overdue still appears on the board",
      engWarnWeeks({ delivery_date: inDays(-7), status: "design" }) !== null,
      "whatever the number reads, a late job must not drop off the warning list");

console.log("\n2. THE SLEETH CASE — the two screens agree\n");
/*
  The exact shape of the bug: a job whose install start is sooner than its
  delivery date. Whatever a caller has to hand, the answer is the same, because
  the function takes the job and picks the field itself.
*/
const sleeth = { delivery_date: inDays(35), install_start_date: inDays(12), status: "design" };
check("the answer comes from delivery_date, not install_start_date",
      engWarnWeeks(sleeth) === 6,
      "2 would mean it is counting to the install start again — that was the bug");
check("an extra field on the job cannot change the answer",
      engWarnWeeks({ ...sleeth, anticipated_delivery: inDays(12) }) === 6,
      "anticipated_delivery is the alias that caused this; it must be inert here");

console.log("\n3. when there is nothing to warn about\n");
check("no delivery date, no warning", engWarnWeeks({ delivery_date: null, status: "design" }) === null);
check("past engineering, no warning", engWarnWeeks({ delivery_date: inDays(12), status: "production" }) === null);
check("further out than the window, no warning",
      engWarnWeeks({ delivery_date: inDays(7 * (ENG_WARN_WEEKS + 2)), status: "design" }) === null);
check("a job just inside the window still warns",
      engWarnWeeks({ delivery_date: inDays(7 * ENG_WARN_WEEKS - 1), status: "design" }) === ENG_WARN_WEEKS);
check("a null job is not a crash", engWarnWeeks(null) === null);
check("an unparseable date is not NaN weeks",
      engWarnWeeks({ delivery_date: "not-a-date", status: "design" }) === null);
check("every pre-engineering status is covered",
      ["intake", "bid", "design", "field_dims"].every((s) => PRE_ENG_STATUSES.has(s)));

console.log("\n4. one implementation, and nobody picks the field for it\n");
const pipeline = read("components/PipelineClient.tsx");
const dashboard = read("components/PmDashboardClient.tsx");

for (const [name, src] of [["PipelineClient", pipeline], ["PmDashboardClient", dashboard]]) {
  check(`${name} imports the shared function`, src.includes('from "@/lib/eng-warning"'));
  check(`${name} does not define its own`, !/function\s+engWarnWeeks\s*\(/.test(src),
        "two copies fed two different dates is the whole bug — identical bodies would not have saved it");
  check(`${name} passes the job, not a date it chose`,
        !/engWarnWeeks\([^)]*delivery_date/.test(src) && !/engWarnWeeks\([^)]*anticipated/.test(src),
        "a shared function a caller can feed any field to is only half a single source of truth");
}

/*
  Deliberately NOT asserted: that month grouping and the capacity rollups use
  delivery_date. They still use anticipated_delivery, which leads with install,
  because Karl was asked about the WARNING and answered about the warning. His
  2026-08-10 decision that the pipeline owns install still stands for those.
*/
check("month grouping is left on anticipated_delivery",
      /monthKey\(j\.anticipated_delivery/.test(pipeline),
      "if this ever fails, someone widened the 2026-09-23 decision past what was asked");

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
