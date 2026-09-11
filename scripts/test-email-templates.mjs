#!/usr/bin/env node
/**
 * test-email-templates.mjs — every template renders something a person can read.
 *
 * No database, no network, nothing sent. Renders all fourteen templates with
 * realistic data and inspects what comes out.
 *
 * WHY. Fourteen templates exist. Five of them are called from nowhere, so
 * nobody has ever seen their output — and the three portal ones were being
 * called with arguments they do not take, which sent blank messages and
 * reported success. A template nobody renders is a template nobody knows is
 * broken.
 *
 * What this asserts is deliberately about the OUTPUT, not the call:
 *
 *   - a subject exists and is not the string "undefined"
 *   - the body is not empty and carries no "undefined", "null", "[object
 *     Object]" or unreplaced ${...}
 *   - anything claiming to be HTML has a closing tag and balanced <a> tags
 *   - the data that was passed in actually appears in the result, because a
 *     template that ignores its arguments renders fine and says nothing
 */
import * as T from "../lib/email-templates.ts";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

/** Plausible data for every field any template asks for. */
const D = {
  jobId: "26401", jobNumber: "26401",
  clientName: "Kenny Debaene", clientFirstName: "Kenny",
  siteAddress: "5712 Davenport", city: "Coeur d'Alene",
  builderName: "Atlas Builders", builderCompany: "Atlas Builders",
  yourName: "Karl Vaage", yourPhone: "208-772-2377", yourEmail: "karlv@advancedcabinets.net",
  deliveryDate: "November 20, 2026", installDate: "November 27, 2026",
  shipDate: "November 18, 2026", scheduledDate: "November 27, 2026",
  oldDate: "November 20, 2026", newDate: "November 27, 2026",
  signoffUrl: "https://www.advancedcabinets.org/signoff/abc123",
  portalUrl: "https://www.advancedcabinets.org/portal",
  resetUrl: "https://www.advancedcabinets.org/portal/reset/xyz",
  username: "atlas", password: "TempPass123", tempPassword: "TempPass123",
  displayName: "Atlas Builders", contactName: "Pat Builder",
  amount: "12,500.00", invoiceNumber: "1042", dueDate: "December 1, 2026",
  comment: "Can we move the island pulls to the other side?",
  message: "Looking for a quote on a kitchen remodel.",
  note: "Delivery will arrive between 8 and 10am.",
  reason: "Client requested a later date.",
  leadName: "Sam Prospect", leadEmail: "sam@example.com", leadPhone: "208-555-0100",
  estimateUrl: "https://www.advancedcabinets.org/estimate/1",
  changeReason: "Client asked for a taller island.",
  jobLabel: "#26401 - Atlas Builders - Kenny Debaene",
  invoiceType: "deposit",
  terms: "Net 30",
  notes: "Deposit due before we release to engineering.",
  jobUrl: "https://www.advancedcabinets.org/jobs/26401",
  commentBody: "Can we move the island pulls to the other side?",
  lineItems: [
    { description: "Kitchen cabinets - deposit (50%)", amount: 42500 },
    { description: "Island", amount: 8600 },
  ],
};

const NAMES = Object.keys(T).filter((k) => typeof T[k] === "function");
console.log(`\n${NAMES.length} exported template function(s)\n`);

const rendered = [];
for (const name of NAMES) {
  let out;
  try {
    out = T[name](D);
  } catch (e) {
    check(`${name} renders`, false, e.message.slice(0, 90));
    continue;
  }
  if (!out || typeof out !== "object") {
    check(`${name} returns a { subject, ... } object`, false, String(out).slice(0, 60));
    continue;
  }
  rendered.push([name, out]);
  check(`${name} renders`, true);
}

console.log("\nsubjects\n");
for (const [name, out] of rendered) {
  const s = String(out.subject ?? "");
  check(`${name}: has a subject`, s.trim().length > 0);
  check(`${name}: subject is not broken`, !/undefined|null|\[object|\$\{/.test(s), s.slice(0, 70));
}

console.log("\nbodies\n");
for (const [name, out] of rendered) {
  const body = String(out.html ?? out.text ?? out.body ?? "");
  check(`${name}: body is not empty`, body.trim().length > 20, `${body.length} chars`);

  const broken = ["undefined", "null", "[object Object]", "${"].filter((m) => body.includes(m));
  check(`${name}: no unreplaced placeholders`, broken.length === 0, broken.join(", "));

  if (out.html) {
    check(`${name}: html looks closed`, /<\/(html|body|table|div|p)>/i.test(out.html));
    const open = (out.html.match(/<a\b/gi) || []).length;
    const close = (out.html.match(/<\/a>/gi) || []).length;
    check(`${name}: anchor tags balanced`, open === close, `${open} open / ${close} close`);
  }
}

console.log("\nthe data actually reaches the message\n");
for (const [name, out] of rendered) {
  const body = String(out.html ?? out.text ?? out.body ?? "") + String(out.subject ?? "");
  // At least one distinctive value we passed in should appear. A template that
  // ignores its arguments renders perfectly and communicates nothing.
  const marks = ["Kenny", "Debaene", "5712 Davenport", "26401", "Atlas", "Karl Vaage",
                 "November", "12,500.00", "1042", "atlas", "Sam Prospect",
                 "advancedcabinets.org", "island"];
  check(`${name}: says something specific to this job`, marks.some((m) => body.includes(m)),
        body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
