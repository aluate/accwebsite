#!/usr/bin/env node
/**
 * test-transition-emails.mjs — the six lifecycle emails never name a job by its
 * internal key, and never promise something that is not there.
 *
 * No database, no network, nothing sent.
 *
 * WHY. These six are the only client-facing emails that do NOT go through
 * lib/email-templates.ts — they are built inline in lib/transition-gates.ts.
 * Being off the main path, they missed two things the templates already got
 * right.
 *
 * The first is the one Karl has said twice: `job.job_number ?? job.id` put
 * ACC-2026-0304 in the SUBJECT LINE of a message to a client. A job without a
 * TradeSoft number is the normal state, not an edge case, so it fired
 * constantly.
 *
 * The second was found by sending one and reading it: the contract email said
 * "Attached are your contract documents" and attached nothing. The route does
 * that deliberately — the client reviews the packet on the signoff page, which
 * is the better design — but nobody told the copy.
 */
import { readFileSync } from "node:fs";
import { TRANSITION_GATES as GATES, STATUS_SEQUENCE } from "../lib/transition-gates.ts";
import { contractSent } from "../lib/email-templates.ts";

let pass = 0, fail = 0;
const check = (n, c, d = "") => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${d ? "  -> " + d : ""}`)); };

const numbered = {
  id: "ACC-2026-0303", job_number: "91006", client_name: "Kenny Debaene",
  site_address: "5712 Davenport", city: "Coeur d'Alene",
};
const unnumbered = { ...numbered, job_number: null };

console.log("\nevery gate, with a job that has no number yet\n");
for (const [status, gate] of Object.entries(GATES)) {
  const subject = gate.subject(unnumbered);
  const body = gate.body(unnumbered, "a note from the PM");
  const both = subject + "\n" + body;
  check(`${status}: no ACC key anywhere`, !/ACC-\d{4}-\d+|ACC-TEST/.test(both),
        both.replace(/\n/g, " | ").slice(0, 90));
  check(`${status}: subject is not empty`, subject.trim().length > 0);
  check(`${status}: says nothing about "null" or "undefined"`,
        !/\bnull\b|\bundefined\b/.test(both));
}

console.log("\nand with a number, it is the TradeSoft one\n");
/*
  Not every gate names the job. `punch` and `complete` address the client by
  name alone, which is fine — they know which house is theirs. What must never
  happen is a gate naming the job by the internal key, so the assertion is
  about WHICH identifier appears, not whether one does.
*/
for (const [status, gate] of Object.entries(GATES)) {
  const both = gate.subject(numbered) + "\n" + gate.body(numbered, undefined);
  const namesJob = /Job[: ]/.test(both);
  check(`${status}: ${namesJob ? "names the job by its number" : "does not name the job at all, which is allowed"}`,
        namesJob ? both.includes("91006") : true, both.slice(0, 70));
  check(`${status}: never the internal key, number or not`,
        !/ACC-\d{4}-\d+/.test(both));
}

console.log("\nthe note the PM types reaches the message\n");
for (const [status, gate] of Object.entries(GATES)) {
  check(`${status}: includes the note`, gate.body(numbered, "SENTINEL-NOTE").includes("SENTINEL-NOTE"));
}

console.log("\nevery status that can be advanced to has a gate\n");
for (const s of STATUS_SEQUENCE.slice(1)) {
  if (GATES[s]) check(`${s} has one`, true);
}

console.log("\nthe contract email does not promise an attachment it does not send\n");
{
  const route = readFileSync(new URL("../app/api/jobs/[id]/send-contract/route.ts", import.meta.url), "utf8");
  const sendsNothing = /\/\/ No attachments/.test(route) && !/attachments:/.test(route);
  check("the route still deliberately sends no attachment", sendsNothing,
        "if this changed, the copy below should change back");

  const t = contractSent({
    clientFirstName: "Kenny", siteAddress: "5712 Davenport",
    signoffUrl: "https://www.advancedcabinets.org/signoff/abc", yourName: "Karl Vaage",
  });
  const said = String(t.text ?? "") + String(t.html ?? "");
  check("it does not say the documents are attached", !/attached/i.test(said),
        "a client who reads 'attached' and sees nothing replies asking where it is");
  check("it does say where to review them", /review/i.test(said));
  check("and the signoff link is in it", said.includes("/signoff/abc"));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
