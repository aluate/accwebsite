#!/usr/bin/env node
/**
 * test-permission-gates.mjs — the five permission bugs that were not judgement
 * calls, just breakage.
 *
 * No database, no network, nothing sent.
 *
 * WHY. These came out of the role audit on 2026-09-16. None of them needed a
 * decision from Karl about who should be allowed to do what — each one was a
 * gate that did not do what the code around it plainly intended:
 *
 *   1. Two schedule routes compared an undefined variable and threw a 500 where
 *      they meant to return 403.
 *   2. Template Documents demanded a login cookie that nothing can mint.
 *   3. Leads send-response did the same, via a helper that redirects instead of
 *      returning JSON.
 *   4. The Advance button was shown to roles the API rejects.
 *   5. The PM nav linked to two pages a PM is redirected away from.
 *   6. ChangeOrdersPanel left "karl" out of canEdit, so the owner saw his own
 *      change orders read-only.
 *
 * Assertions run against comment-stripped source — see scripts/strip-source.mjs
 * for the several ways that has gone wrong when it was not.
 */
import { readFileSync } from "node:fs";
import { stripComments } from "./strip-source.mjs";

let pass = 0, fail = 0;
const check = (n, c, d = "") => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${d ? "  -> " + d : ""}`)); };
const strip = (rel) => stripComments(readFileSync(new URL(rel, import.meta.url), "utf8"));

console.log("\n1. the two schedule routes return 403, not a 500\n");
for (const [name, rel] of [
  ["admin-queue",     "../app/api/schedule/admin-queue/route.ts"],
  ["change-requests", "../app/api/schedule/change-requests/route.ts"],
]) {
  const src = strip(rel);
  check(`${name}: no bare \`role\` identifier left`,
        !/[^.\w]role\s*!==/.test(src),
        "`role` is not declared in these handlers — only `builder.role`. It threw a ReferenceError for exactly the callers meant to get a clean 403.");
  check(`${name}: still refuses non-admins`,
        /builder\.role !== "admin" && builder\.role !== "karl"/.test(src));
  check(`${name}: and says so with a 403`, /status: 403/.test(src));
}

console.log("\n2. nothing still depends on the retired admin-password cookie\n");
for (const [name, rel] of [
  ["template-documents",       "../app/api/admin/template-documents/route.ts"],
  ["template-documents/[type]","../app/api/admin/template-documents/[docType]/route.ts"],
  ["leads/send-response",      "../app/api/admin/leads/send-response/route.ts"],
]) {
  const src = strip(rel);
  check(`${name}: does not import lib/admin-auth`, !src.includes("admin-auth"),
        "app/admin/login/page.tsx redirects to /login unconditionally, so acc_admin_session can never be minted — every check against it 401s forever");
  check(`${name}: no getAdmin()/requireAdmin() call`,
        !/await\s+(getAdmin|requireAdmin)\s*\(/.test(src));
  check(`${name}: guarded by guardApi instead`, /guardApi\(\["admin"\]\)/.test(src));
  check(`${name}: and returns the guard's status`,
        /status: guard\.status/.test(src),
        "requireAdmin() redirected; an API route has to answer with JSON");
}

console.log("\n3. no button is offered to a role the API will reject\n");
const jobPage = strip("../app/jobs/[id]/page.tsx");
const ADVANCE = /\{\(\(session\.role === "admin" \|\| session\.role === "karl"\) \|\| session\.role === "pm"\) && \(\s*<StatusAdvanceButton/;
check("Advance button carries the same role check as the buttons beside it",
      ADVANCE.test(jobPage),
      "/api/jobs/[id]/advance is guardApi([\"admin\",\"pm\"]); the button was unconditional, so engineer and shop filled in the modal and got a 403");
check("it is still rendered for the roles that can use it",
      jobPage.includes("<StatusAdvanceButton"));

console.log("\n4. the PM nav only links where a PM can go\n");
const header = strip("../components/Header.tsx");
const pmNav = header.slice(header.indexOf("const PM_NAV"), header.indexOf("const INTERNAL_PREFIXES"));
check("no /admin/* link in PM_NAV", !/href:\s*"\/admin\//.test(pmNav),
      "app/admin/(protected)/layout.tsx is requireRole([\"admin\"]) — pm is redirected to /jobs before the page renders");
for (const href of ["/search", "/punch", "/warranty"]) {
  check(`still links ${href}`, pmNav.includes(`"${href}"`));
}
check("ADMIN_NAV is untouched and still has the admin pages",
      /const ADMIN_NAV[\s\S]*?"\/admin\/builders"/.test(header));

console.log("\n5. the owner is not locked out of his own change orders\n");
const co = strip("../components/ChangeOrdersPanel.tsx");
check("canEdit includes karl",
      /const canEdit = role === "karl" \|\| role === "admin" \|\| role === "pm";/.test(co),
      "the API accepts [\"karl\",\"admin\",\"pm\"]; the panel accepted two of the three, so Karl saw it read-only");
check("the role prop type admits karl", /role: "karl" \|/.test(co),
      "the job page passes session.role straight in — this was a real tsc error on main, not just a UI quirk");

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
