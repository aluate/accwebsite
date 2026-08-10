#!/usr/bin/env node
/**
 * test-install-date.mjs — one official install date per job.
 *
 * The rule: the pipeline owns `jobs.install_start_date`. Changing it drags the
 * scheduled install event with it, automatically. Changing the event on the calendar
 * only *offers* to make the new date official.
 *
 * Most of what follows asserts what does NOT happen. An automatic sync that is too
 * eager is worse than none: it can place an event the scheduler deliberately left
 * unplaced, cancel a booked crew day because someone blanked a field, or move an
 * event nobody was looking at. Each of those is a crew in the wrong place on the
 * wrong day, which costs more than a stale date on a board.
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/test-install-date.mjs
 */
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import {
  syncInstallEventToOfficialDate,
  installDatePromptFor,
  earliestDatedInstallEvent,
} from "../lib/install-date.ts";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
const sql = postgres(url, { ssl: isLocal ? false : "require", max: 2, prepare: false });

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

const uid = () => randomBytes(6).toString("hex");
const made = [];

async function job(installDate = null) {
  const id = "idt-job-" + uid();
  made.push(id);
  await sql`
    INSERT INTO jobs (id, created_at, client_name, site_address, job_number, install_start_date)
    VALUES (${id}, ${"2026-01-01T00:00:00Z"}, ${"Install Sync Test"}, ${"1 Test St"}, ${"T-" + uid().slice(0, 4)}, ${installDate})
  `;
  return id;
}

async function event(jobId, { type = "install", start = null, end = null, crew = null, sort = 0 } = {}) {
  const id = "idt-ev-" + uid();
  await sql`
    INSERT INTO job_events (id, job_id, event_type, date_start, date_end, crew_id, status, sort_order, created_at, updated_at)
    VALUES (${id}, ${jobId}, ${type}, ${start}, ${end}, ${crew}, ${"scheduled"}, ${sort}, ${"2026-01-01"}, ${"2026-01-01"})
  `;
  return id;
}

const evRow = async (id) => (await sql`SELECT date_start, date_end, crew_id FROM job_events WHERE id = ${id}`)[0];

async function main() {
  console.log("\npipeline -> calendar: the event follows, automatically\n");

  {
    const j = await job("2026-02-09");
    const e = await event(j, { start: "2026-02-09", end: "2026-02-11" });
    const r = await syncInstallEventToOfficialDate(j, "2026-02-12", "test");
    const row = await evRow(e);
    check("the event moves to the official date", r.moved && row.date_start === "2026-02-12", JSON.stringify(row));
    check("a 2-day span stays 2 days", row.date_end === "2026-02-14", `${row.date_start}..${row.date_end}`);
    check("the move is reported, not silent", r.moved === true && r.from === "2026-02-09" && r.to === "2026-02-12");
  }
  {
    const j = await job("2026-03-02");
    const e = await event(j, { start: "2026-03-02", end: null });
    await syncInstallEventToOfficialDate(j, "2026-03-09", "test");
    const row = await evRow(e);
    check("an event with no end date stays open-ended", row.date_start === "2026-03-09" && row.date_end === null, JSON.stringify(row));
  }
  {
    const j = await job("2026-04-06");
    const e = await event(j, { start: "2026-04-06", end: "2026-04-06" });
    await syncInstallEventToOfficialDate(j, "2026-04-20", "test");
    const row = await evRow(e);
    check("a single-day install stays a single day", row.date_start === "2026-04-20" && row.date_end === "2026-04-20", JSON.stringify(row));
  }
  {
    // Moving backwards across a month boundary — the arithmetic is UTC, so no
    // timezone can shift the day by one.
    const j = await job("2026-03-02");
    const e = await event(j, { start: "2026-03-02", end: "2026-03-04" });
    await syncInstallEventToOfficialDate(j, "2026-02-26", "test");
    const row = await evRow(e);
    check("moving back across a month keeps the span", row.date_start === "2026-02-26" && row.date_end === "2026-02-28", JSON.stringify(row));
  }

  console.log("\nwhat the sync must refuse to do\n");

  {
    const j = await job("2026-05-04");
    const r = await syncInstallEventToOfficialDate(j, "2026-05-11", "test");
    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM job_events WHERE job_id = ${j}`;
    check("no install event: nothing is created", r.moved === false && n === 0, `${n} event(s), ${r.reason ?? ""}`);
    check("and it says why", typeof r.reason === "string" && r.reason.includes("nothing to move"), r.reason);
  }
  {
    const j = await job("2026-05-04");
    const e = await event(j, { start: null, end: null });
    const r = await syncInstallEventToOfficialDate(j, "2026-05-11", "test");
    const row = await evRow(e);
    check("an ON DECK event is not scheduled by a date edit", r.moved === false && row.date_start === null, JSON.stringify(row));
    check("and it says whose call that is", (r.reason ?? "").includes("scheduler"), r.reason);
  }
  {
    const j = await job("2026-06-01");
    const e = await event(j, { start: "2026-06-01", end: "2026-06-03" });
    const r = await syncInstallEventToOfficialDate(j, null, "test");
    const row = await evRow(e);
    check("clearing the official date does NOT cancel the booked days",
          r.moved === false && row.date_start === "2026-06-01" && row.date_end === "2026-06-03", JSON.stringify(row));
  }
  {
    const j = await job("2026-06-01");
    await event(j, { start: "2026-06-01" });
    const r = await syncInstallEventToOfficialDate(j, "2026-06-01", "test");
    check("no write when the schedule already agrees", r.moved === false && (r.reason ?? "").includes("already"), r.reason);
  }
  {
    const j = await job("2026-07-06");
    const early = await event(j, { type: "delivery", start: "2026-07-01" });
    const inst  = await event(j, { start: "2026-07-06", end: "2026-07-08" });
    await syncInstallEventToOfficialDate(j, "2026-07-13", "test");
    check("a delivery event is not treated as the install", (await evRow(early)).date_start === "2026-07-01");
    check("the install event is the one that moves", (await evRow(inst)).date_start === "2026-07-13");
  }
  {
    // Multi-phase install: only the date the board reads moves. Touching the later
    // phases would silently rewrite a sequence somebody built on purpose.
    const j = await job("2026-08-03");
    const first  = await event(j, { start: "2026-08-03", end: "2026-08-04", sort: 0 });
    const second = await event(j, { start: "2026-08-17", end: "2026-08-18", sort: 1 });
    const r = await syncInstallEventToOfficialDate(j, "2026-08-10", "test");
    check("the earliest install event moves", r.moved && (await evRow(first)).date_start === "2026-08-10");
    check("a later install phase is left alone", (await evRow(second)).date_start === "2026-08-17");
    check("the one that moved is the one the board reads",
          (await earliestDatedInstallEvent(j))?.id === first);
  }

  console.log("\ncalendar -> pipeline: it offers, it does not decide\n");

  {
    const j = await job("2026-09-07");
    const e = await event(j, { start: "2026-09-14" });     // calendar already moved
    const p = await installDatePromptFor(e);
    check("a disagreement produces a prompt", p !== null);
    check("the prompt carries both dates", p?.official === "2026-09-07" && p?.scheduled === "2026-09-14",
          JSON.stringify(p));
    const [row] = await sql`SELECT install_start_date FROM jobs WHERE id = ${j}`;
    check("and the job is NOT changed by asking", row.install_start_date === "2026-09-07", String(row.install_start_date));
  }
  {
    const j = await job("2026-09-07");
    const e = await event(j, { start: "2026-09-07" });
    check("no prompt when the two already agree", (await installDatePromptFor(e)) === null);
  }
  {
    const j = await job(null);
    const e = await event(j, { start: "2026-09-07" });
    const p = await installDatePromptFor(e);
    check("a job with no official date still gets asked", p !== null && p.official === null, JSON.stringify(p));
  }
  {
    const j = await job("2026-10-05");
    const e = await event(j, { type: "delivery", start: "2026-10-12" });
    check("moving a delivery event asks nothing", (await installDatePromptFor(e)) === null);
  }
  {
    // Dragging a later install phase must not offer to redefine the official date —
    // it is not the date the board reads.
    const j = await job("2026-11-02");
    await event(j, { start: "2026-11-02", sort: 0 });
    const later = await event(j, { start: "2026-11-30", sort: 1 });
    check("moving a later install phase asks nothing", (await installDatePromptFor(later)) === null);
  }
  {
    const j = await job("2026-11-02");
    const onDeck = await event(j, { start: null });
    check("an undated event asks nothing", (await installDatePromptFor(onDeck)) === null);
  }

  console.log("\nthe board's derived delivery follows the official date\n");
  {
    const j = await job("2026-12-07");
    await event(j, { start: "2026-12-21" });
    await sql`UPDATE jobs SET delivery_date = ${"2026-12-01"} WHERE id = ${j}`;
    const [row] = await sql`
      SELECT COALESCE(
               j.install_start_date,
               (SELECT je.date_start FROM job_events je
                WHERE je.job_id = j.id AND je.event_type = 'install' AND je.date_start IS NOT NULL
                ORDER BY je.date_start ASC LIMIT 1),
               j.delivery_date
             ) AS anticipated_delivery
      FROM jobs j WHERE j.id = ${j}
    `;
    check("the official install date wins over the calendar and delivery_date",
          row.anticipated_delivery === "2026-12-07", String(row.anticipated_delivery));
  }
  {
    const j = await job(null);
    await event(j, { start: "2026-12-21" });
    await sql`UPDATE jobs SET delivery_date = ${"2026-12-01"} WHERE id = ${j}`;
    const [row] = await sql`
      SELECT COALESCE(
               j.install_start_date,
               (SELECT je.date_start FROM job_events je
                WHERE je.job_id = j.id AND je.event_type = 'install' AND je.date_start IS NOT NULL
                ORDER BY je.date_start ASC LIMIT 1),
               j.delivery_date
             ) AS anticipated_delivery
      FROM jobs j WHERE j.id = ${j}
    `;
    check("with no official date it falls back to the calendar",
          row.anticipated_delivery === "2026-12-21", String(row.anticipated_delivery));
  }
  {
    const j = await job(null);
    await sql`UPDATE jobs SET delivery_date = ${"2026-12-01"} WHERE id = ${j}`;
    const [row] = await sql`
      SELECT COALESCE(
               j.install_start_date,
               (SELECT je.date_start FROM job_events je
                WHERE je.job_id = j.id AND je.event_type = 'install' AND je.date_start IS NOT NULL
                ORDER BY je.date_start ASC LIMIT 1),
               j.delivery_date
             ) AS anticipated_delivery
      FROM jobs j WHERE j.id = ${j}
    `;
    check("and with neither, to delivery_date", row.anticipated_delivery === "2026-12-01", String(row.anticipated_delivery));
  }

  console.log("\nthe move is auditable\n");
  {
    const j = await job("2027-01-04");
    const e = await event(j, { start: "2027-01-04", end: "2027-01-05" });
    await syncInstallEventToOfficialDate(j, "2027-01-11", "pipeline-test");
    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM job_event_audit WHERE event_id = ${e} AND changed_by = ${"pipeline-test"}`;
    check("an automatic move writes an audit row naming who did it", n >= 1, `${n} audit row(s)`);
  }
}

main()
  .catch((e) => { console.error("\nHARNESS ERROR:", e.message ?? e, e.stack?.split("\n")[1] ?? ""); fail++; })
  .finally(async () => {
    for (const id of made) await sql`DELETE FROM jobs WHERE id = ${id}`.catch(() => {});
    await sql.end({ timeout: 5 });
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  });
