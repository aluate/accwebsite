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

const BRANDED = ["engineering", "production", "delivery", "complete"];

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

console.log("\npunch is deliberately unchanged\n");
check("no client template", !TRANSITION_GATES.punch?.clientTemplate,
      "no branded version exists for it yet — it must keep working as it did");
check("and it still emails the client", TRANSITION_GATES.punch?.recipients.includes("client"));

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
  for (const t of ["invoices", "change_orders", "client_signoffs", "estimates", "builder_floor_plan_rooms"]) {
    check(`${t} is cleared first`, new RegExp(`DELETE FROM ${t} WHERE job_id`).test(code));
  }
  check("line items go before their invoice", code.indexOf("invoice_line_items") < code.indexOf("DELETE FROM invoices WHERE"));
  check("co items go before their change order", code.indexOf("change_order_items") < code.indexOf("DELETE FROM change_orders WHERE"));
  check("all of it in one transaction", /sql\.begin\(async \(tx\)/.test(code),
        "a half-deleted job leaves invoices pointing at nothing");
  check("the job goes last", code.lastIndexOf("DELETE FROM jobs WHERE id") > code.indexOf("DELETE FROM invoices WHERE"));
  check("a failure says what happened instead of a blank 500",
        /Could not delete this job/.test(code) && /status: 409/.test(code));
  check("and names the table in the detail", /detail: msg/.test(code));
}


/*
  THE TWO LISTS HAVE TO AGREE.

  This section exists because they did not, and a live run is what found it.

  A gate declares `recipients` and the notification registry declares
  `toRoles`, and it is the REGISTRY that resolveRecipients actually reads. Both
  client templates were wired, both looked right in the code, and neither email
  was sent: the registry still had advance.engineering as engineer-only and
  advance.production as shop-only, so no client address ever resolved and the
  branded email had nobody to go to. It failed completely silently — the
  transition returned 200 and the internal note went out as normal.

  Two places holding the same fact is the thing the project's own hygiene rules
  warn about. Until there is one, this keeps them honest.
*/
console.log("\nthe gate and the notification registry agree on who gets it\n");
{
  const byKey = Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e.key, e]));
  for (const [status, gate] of Object.entries(TRANSITION_GATES)) {
    const ev = byKey[`advance.${status}`];
    check(`advance.${status}: the registry knows about it`, !!ev);
    if (!ev) continue;

    // The registry calls it "engineer"; the gate calls it "eng".
    const norm = (r) => (r === "eng" ? "engineer" : r);
    const gateRoles = new Set(gate.recipients.map(norm));
    const regRoles  = new Set((ev.toRoles ?? []).map(norm));
    const missing = [...gateRoles].filter((r) => !regRoles.has(r));
    check(`advance.${status}: every gate recipient is in the registry`, missing.length === 0,
          `registry is missing ${missing.join(", ")} — those people are never emailed`);

    if (gate.clientTemplate) {
      check(`advance.${status}: the registry routes to the client`, regRoles.has("client"),
            "a client template with no client on the route sends nothing, silently");
      check(`advance.${status}: it is not filed as internal-only`, ev.audience !== "internal",
            "a customer email hidden under 'these stay inside ACC' is how test mode gets switched off by mistake");
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
