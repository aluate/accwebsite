#!/usr/bin/env node
/**
 * test-spec-revision.mjs — after release, a change says who asked for it.
 *
 * No database, no network.
 *
 * WHY. A released spec is not locked, because locking it would be wrong — a
 * client moves an island and we got a dimension wrong, and both happen. What
 * was missing is which of the two a given edit was, and the two have
 * completely different consequences: one is a billable change order needing
 * the client's sign-off, the other is an internal revision that engineering
 * and the shop still need to hear about.
 *
 * These assertions hold the shape of that question: it is asked only after
 * release, it cannot be answered with junk, and the refusal tells the caller
 * what to send instead of just saying no.
 */
import {
  requiresAttribution, validateRevision, isRevisionOrigin,
  ATTRIBUTED_STATES, ORIGIN_LABEL, ORIGIN_CONSEQUENCE,
} from "../lib/spec-revision.ts";
import { LIFECYCLE_STATES } from "../lib/lifecycle.ts";

let pass = 0, fail = 0;
const check = (n, c, d = "") => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${d ? "  -> " + d : ""}`)); };

console.log("\nwhen the question gets asked\n");
check("DRAFT does not ask", !requiresAttribution("DRAFT"));
check("CLIENT_APPROVED does not ask", !requiresAttribution("CLIENT_APPROVED"));
check("RELEASED_TO_ENG asks", requiresAttribution("RELEASED_TO_ENG"));
check("ENGINEERED asks", requiresAttribution("ENGINEERED"));
check("RELEASED_TO_SHOP asks", requiresAttribution("RELEASED_TO_SHOP"));
check("a missing state does not ask", !requiresAttribution(null) && !requiresAttribution(undefined));

console.log("\nthe state names are real ones\n");
for (const s of ATTRIBUTED_STATES) {
  check(`${s} is in lib/lifecycle.ts`, LIFECYCLE_STATES.includes(s),
        "a renamed state must break this test, not silently stop asking");
}

console.log("\nbefore release, anything passes and nothing is recorded\n");
{
  const r = validateRevision("DRAFT", undefined);
  check("no revision needed", r.ok === true && r.revision === null);
  const r2 = validateRevision("CLIENT_APPROVED", { origin: "nonsense" });
  check("and junk is simply ignored rather than rejected", r2.ok === true && r2.revision === null);
}

console.log("\nafter release, it has to be answered\n");
{
  check("missing entirely is refused", validateRevision("RELEASED_TO_ENG", undefined).ok === false);
  check("null is refused", validateRevision("RELEASED_TO_ENG", null).ok === false);
  check("an empty object is refused", validateRevision("RELEASED_TO_ENG", {}).ok === false);
  check("an unknown origin is refused", validateRevision("RELEASED_TO_ENG", { origin: "someone_else" }).ok === false);
  check("true is not an origin", validateRevision("RELEASED_TO_ENG", { origin: true }).ok === false);

  const refusal = validateRevision("RELEASED_TO_ENG", undefined);
  check("the refusal names both answers", /client/.test(refusal.error) && /acc/.test(refusal.error), refusal.error);
  check("and says what a client change does", /change order/i.test(refusal.error));
}

console.log("\nand both answers are accepted\n");
{
  const c = validateRevision("RELEASED_TO_ENG", { origin: "client" });
  check("client passes", c.ok === true && c.revision.origin === "client");
  check("with no note that is fine", c.ok === true && c.revision.note === null);

  const a = validateRevision("ENGINEERED", { origin: "acc", note: "  our dimension was wrong  " });
  check("acc passes", a.ok === true && a.revision.origin === "acc");
  check("the note is trimmed", a.ok === true && a.revision.note === "our dimension was wrong");

  const blank = validateRevision("RELEASED_TO_SHOP", { origin: "acc", note: "   " });
  check("a whitespace note becomes null rather than empty text", blank.ok === true && blank.revision.note === null);

  const long = validateRevision("RELEASED_TO_SHOP", { origin: "client", note: "x".repeat(5000) });
  check("a very long note is capped rather than refused", long.ok === true && long.revision.note.length === 2000);
}

console.log("\nboth answers explain themselves to the person\n");
check("client label", /client/i.test(ORIGIN_LABEL.client));
check("acc label", /acc/i.test(ORIGIN_LABEL.acc));
check("client consequence mentions billing", /billable/i.test(ORIGIN_CONSEQUENCE.client));
check("acc consequence says it is not billable", /not billable/i.test(ORIGIN_CONSEQUENCE.acc));
check("isRevisionOrigin is strict", isRevisionOrigin("client") && isRevisionOrigin("acc") && !isRevisionOrigin("CLIENT"));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
