#!/usr/bin/env node
/**
 * test-gate-client-emails.mjs — the client gets the branded email, ACC gets the
 * internal one, and nobody is emailed about a date unless somebody asked.
 *
 * No database, no network, nothing sent.
 *
 * WHY. Four finished templates sat uncalled while the client received the
 * internal plain-text note at the moments they care about most. Karl, on adding
 * the two that told a client nothing at all: "I think those 2 are fine to add."
 * And on the fifth: "make sure there's like a box to check... notify PM for the
 * email to fire."
 *
 * The thing most likely to go wrong later is the split: a change that sends the
 * client message to everyone, or the internal one to the client. Both are
 * pinned here.
 */
import { readFileSync } from "node:fs";
import { TRANSITION_GATES } from "../lib/transition-gates.ts";
import { NOTIFICATION_EVENTS } from "../lib/notification-events.ts";

let pass = 0, fail = 0;
const check = (n, c, d = "") => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${d ? "  -> " + d : ""}`)); };

const job = {
  id: "ACC-2026-0181", job_number: "26401", client_name: "Kenny Debaene",
  client_email: "kenny@example.com", site_address: "5712 Davenport",
  city: "Coeur d'Alene", pm: "Karl Vaage", delivery_date: "2026-11-20",
};

const BRANDED = ["engineering", "production", "delivery", "complete", "punch"];

console.log("\nthe four moments a client now hears about properly\n");
for (const key of BRANDED) {
  const g = TRANSITION_GATES[key];
  check(`${key}: has a client template`, typeof g?.clientTemplate === "function");
  if (typeof g?.clientTemplate !== "function") continue;
  const t = g.clientTemplate(job, "a note from the PM");
  check(`${key}: renders html`, !!t.html && t.html.length > 300);
  check(`${key}: is ACC-branded`, t.html.includes("#1a1a1a") && t.html.includes("#f08122"));
  check(`${key}: carries the logo`, t.html.includes("/logo.png"));
  check(`${key}: no internal key`, !/ACC-\d{4}-\d+/.test(t.subject + t.html),
        "these go to a customer");
  check(`${key}: addresses the client by first name`, t.html.includes("Kenny"));
  check(`${key}: client is a recipient of the gate`, g.recipients.includes("client"),
        "a client template is pointless if the client never resolves as a recipient");
}

console.log("\nevery client-facing gate is now branded\n");
/*
  punch used to be listed here as the deliberate exception — "no branded version
  exists for it yet". One was written on 2026-09-16 (see test-punch.mjs), so the
  exception is gone and punch joins BRANDED above. Nothing client-facing is left
  sending the shop's plain-text note.
*/
for (const [key, g] of Object.entries(TRANSITION_GATES)) {
  if (!g.recipients.includes("client")) continue;
  check(`${key}: client-facing, so it must have a client template`,
        typeof g.clientTemplate === "function",
        "a gate that emails a client and has no branded template sends them the internal note");
}

console.log("\nthe internal note still exists for every gate\n");
for (const [key, g] of Object.entries(TRANSITION_GATES)) {
  check(`${key}: plain subject and body intact`,
        typeof g.subject === "function" && typeof g.body === "function" &&
        g.subject(job).length > 0 && g.body(job).length > 0);
}

console.log("\nthe advance route sends them to different people\n");
{
  const src = readFileSync(new URL("../app/api/jobs/[id]/advance/route.ts", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  check("the client's addresses are pulled out of the main send",
        /const primaryTo = gate\.clientTemplate[\s\S]{0,140}roleOf\(a\) !== "client"/.test(code));
  check("and collected for their own send", /roleOf\(a\) === "client"/.test(code));
  check("a gate without a client template sends to everyone, as before",
        /: resolved\.to;/.test(code));
  check("the client send is marked as the client audience", /audience: "client"/.test(code));
  check("an empty internal list does not throw", /primaryTo\.length\s*\n?\s*\? await sendEmail/.test(code),
        "production can resolve to client-only if the shop address is cleared");
  check("a failed client send is reported, not swallowed",
        /emailErrors\.push\(`\$\{clientTo\.join/.test(code));
}

console.log("\na date change only emails when asked\n");
{
  const src = readFileSync(new URL("../app/api/jobs/[id]/route.ts", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  check("it is opt-in", /if \(body\._notify_pm === true\)/.test(code),
        "dragging a card around the board must never email anyone");
  check("only when the date actually changed",
        /String\(updates\[f\] \?\? ""\) !== String\(row\[f\] \?\? ""\)/.test(code));
  check("covers install and delivery", /"install_start_date", "delivery_date"/.test(code));
  /*
    Against `code`, not `src`. The file's header comment quotes the UPDATE
    statement while explaining how the allow-list works, so searching the raw
    source finds that sentence instead of the statement and reports the order
    backwards. Fourth time an assertion in this project has matched a comment
    that exists to explain the very thing it was checking — if you are writing
    one of these, strip the comments first.
  */
  check("the old date is read before the update",
        code.indexOf("install_start_date, delivery_date") < code.indexOf("UPDATE jobs SET"),
        "after the UPDATE the value it moved from is gone");
  check("it cannot fail the save", /void sendEmail\(/.test(code) && /catch \{ \/\* a malformed date/.test(src));
  check("it goes to the pm role", /audience: "pm"/.test(code));

  const ui = readFileSync(new URL("../components/ScheduleWallClient.tsx", import.meta.url), "utf8");
  check("there is a checkbox", /id="notify-pm-on-official-date"/.test(ui));
  check("it is wired to the request", /_notify_pm: notifyPm/.test(ui));
  check("it sits on the make-it-official prompt, not on drag-to-move",
        ui.indexOf("notify-pm-on-official-date") > ui.indexOf("installPrompt.scheduled") - 4000);
}

console.log("\ndeleting a job clears what references it\n");
{
  const src = readFileSync(new URL("../app/api/jobs/[id]/route.ts", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  /*
    The first two versions of this hardcoded the list of tables that block a
    delete, and both were wrong — one named a table with no job_id at all and
    aborted the transaction, the other missed catalog_libraries. So the
    assertions are about asking the database, not about any particular list:
    a list that has to be right is a list that goes stale.
  */
  check("the blocking tables are discovered, not hardcoded",
        /FROM pg_constraint c/.test(code) && /confrelid = 'jobs'::regclass/.test(code),
        "a hand-maintained list of what references jobs goes stale");
  check("cascade and set-null are left alone", /confdeltype NOT IN \('c', 'n'\)/.test(code),
        "those look after themselves; deleting from them is wasted work");
  check("jobs.placeholder_id, which points at jobs itself, is excluded",
        /conrelid <> 'jobs'::regclass/.test(code));
  check("the discovered tables are deleted by name and column from the query",
        /DELETE FROM \$\{tx\(b\.table_name\)\} WHERE \$\{tx\(b\.column_name\)\}/.test(code));

  check("the two grandchildren are still handled", 
        /DELETE FROM invoice_line_items WHERE invoice_id IN/.test(code) &&
        /DELETE FROM change_order_items WHERE co_id IN/.test(code),
        "they hang off invoices and change_orders, so discovery cannot see them");
  check("grandchildren go before the discovery loop",
        code.indexOf("invoice_line_items") < code.indexOf("for (const b of blockers)"));
  check("the job itself goes last",
        code.lastIndexOf("DELETE FROM jobs WHERE id") > code.indexOf("for (const b of blockers)"));
  check("all of it in one transaction", /sql\.begin\(async \(tx\)/.test(code),
        "a half-deleted job leaves invoices pointing at nothing");
  check("a failure says what happened instead of a blank 500",
        /Could not delete this job/.test(code) && /status: 409/.test(code));
  check("and names the cause", /detail: msg/.test(code),
        "this message is what caught the wrong table name on the first live delete");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
