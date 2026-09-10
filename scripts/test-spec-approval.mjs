#!/usr/bin/env node
/**
 * test-spec-approval.mjs — the DRAFT watermark answers to the real states.
 *
 * No database, no network.
 *
 * WHY. Every page of every spec PDF asked whether lifecycle_state === "APPROVED".
 * There is no such state. The comparison was false for every spec that has ever
 * existed, so the red DRAFT watermark and the "DRAFT — PENDING APPROVAL" banner
 * printed on every document at every stage — on specs a client had signed and on
 * specs already released to the shop floor.
 *
 * The failure was not the logic, it was the string: nothing tied it to
 * lib/lifecycle.ts, so a state name that never existed sat there unchallenged.
 * These assertions tie the two together, so renaming a lifecycle state breaks
 * the build instead of quietly stamping DRAFT on the shop's paperwork again.
 */
import { LIFECYCLE_STATES } from "../lib/lifecycle.ts";
import { APPROVED_LIFECYCLE_STATES, isSpecApproved, isSpecDraft } from "../lib/spec-approval.ts";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

console.log("\nthe approved list names states that actually exist\n");
for (const s of APPROVED_LIFECYCLE_STATES) {
  check(`${s} is a real lifecycle state`, LIFECYCLE_STATES.includes(s),
    `lib/lifecycle.ts has ${LIFECYCLE_STATES.join(", ")}`);
}
check("DRAFT is not on the approved list", !APPROVED_LIFECYCLE_STATES.includes("DRAFT"));
check("every state after DRAFT counts as approved",
  LIFECYCLE_STATES.filter((s) => s !== "DRAFT").every((s) => isSpecApproved(s)),
  LIFECYCLE_STATES.filter((s) => s !== "DRAFT" && !isSpecApproved(s)).join(", ") || "");

console.log("\nwhat carries the watermark\n");
check("a draft is a draft", isSpecDraft("DRAFT"));
check("no state at all is a draft", isSpecDraft(null) && isSpecDraft(undefined) && isSpecDraft(""));
check("a client-approved spec is NOT a draft", !isSpecDraft("CLIENT_APPROVED"));
check("a spec released to engineering is NOT a draft", !isSpecDraft("RELEASED_TO_ENG"));
check("an engineered spec is NOT a draft", !isSpecDraft("ENGINEERED"));
check("a spec released to the shop is NOT a draft", !isSpecDraft("RELEASED_TO_SHOP"));

console.log("\nthe string that caused this\n");
check('"APPROVED" is not treated as approved — it was never a state',
  !isSpecApproved("APPROVED"));
check("an unknown state is a draft rather than silently approved",
  isSpecDraft("SOMETHING_ELSE"));

console.log("\nno page compares against a bare state string any more\n");
{
  const src = (await import("node:fs")).readFileSync(new URL("../lib/pdf-spec.tsx", import.meta.url), "utf8");
  check("pdf-spec.tsx asks the helper, not the string",
    !/lifecycle_state\s*[!=]==\s*"/.test(src));
  const uses = (src.match(/isSpecDraft\(|isSpecApproved\(/g) ?? []).length;
  check("every page that used to compare inline now calls it", uses >= 7, `${uses} call sites`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
