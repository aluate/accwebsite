#!/usr/bin/env node
/**
 * test-mail-override.mjs — the settings screen is what actually happens.
 *
 * No database, no network, nothing sent.
 *
 * WHY. Karl configured client, builder, PM and engineer inboxes at
 * /admin/notifications, walked jobs through the whole lifecycle, and every
 * single message went to one address anyway — because TEST_EMAIL_OVERRIDE beat
 * the routing unconditionally and nothing said so. The only visible symptom was
 * a subject-line prefix, and you had to know which branch of lib/mailer.ts
 * produced it to read anything into that.
 *
 * Both are redirects away from real clients, so neither is safer than the
 * other. The rule now: test mode on -> the per-role routing the screen
 * describes. Test mode off -> the override, as the blunt safety net it was
 * written to be.
 */
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (n, c, d = "") => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${d ? "  -> " + d : ""}`)); };

const ORIGINAL = process.env.TEST_EMAIL_OVERRIDE;
const { envOverrideInForce } = await import("../lib/mailer.ts");

const withVar = (value, fn) => {
  if (value === undefined) delete process.env.TEST_EMAIL_OVERRIDE;
  else process.env.TEST_EMAIL_OVERRIDE = value;
  try { return fn(); }
  finally {
    if (ORIGINAL === undefined) delete process.env.TEST_EMAIL_OVERRIDE;
    else process.env.TEST_EMAIL_OVERRIDE = ORIGINAL;
  }
};

console.log("\nthe variable is not set at all\n");
withVar(undefined, () => {
  check("test mode on  -> no override", envOverrideInForce(true) === null);
  check("test mode off -> no override", envOverrideInForce(false) === null);
});

console.log("\nthe variable is set — this is the case that was wrong\n");
withVar("karlv@advancedcabinets.net", () => {
  check("test mode ON  -> the override stands down, per-role routing wins",
        envOverrideInForce(true) === null,
        "this is the bug: every email went to one address while the screen promised four");
  check("test mode OFF -> the override applies, as the safety net",
        envOverrideInForce(false) === "karlv@advancedcabinets.net");
});

console.log("\nmessy values\n");
withVar("   ", () => {
  check("whitespace is not an address", envOverrideInForce(false) === null,
        "an empty-but-present var must not silently swallow every email");
});
withVar("  karlv@advancedcabinets.net  ", () => {
  check("surrounding space is trimmed", envOverrideInForce(false) === "karlv@advancedcabinets.net");
});

console.log("\nboth send paths go through the one decision\n");
{
  const src = readFileSync(new URL("../lib/mailer.ts", import.meta.url), "utf8");
  const direct = [...src.matchAll(/process\.env\.TEST_EMAIL_OVERRIDE/g)].length;
  check("TEST_EMAIL_OVERRIDE is read in exactly one place", direct === 1, `${direct} reads`);
  check("that place is envOverrideInForce",
        /export function envOverrideInForce[\s\S]{0,260}process\.env\.TEST_EMAIL_OVERRIDE/.test(src));
  check("sendEmail asks it", /const envOverride = envOverrideInForce\(mode\.active\);/.test(src));
  check("sendOrderEmail asks it too, so the Express path cannot drift again",
        /const orderOverride = envOverrideInForce\(mode\.active\);/.test(src));
}

console.log("\nthe screen says when a variable is overriding it\n");
{
  const route = readFileSync(new URL("../app/api/admin/notifications/route.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../components/NotificationSettingsClient.tsx", import.meta.url), "utf8");
  check("the API reports that the variable exists", /overrideSet/.test(route));
  check("and whether it is currently winning", /overrideInForce: overrideSet && !testMode\.active/.test(route));
  check("but never the value itself", !/TEST_EMAIL_OVERRIDE(?!\?\.trim)/.test(route.replace(/\/\*[\s\S]*?\*\//g, "")),
        "the page needs to know the var is there, not what is in it");
  check("the page warns when it is in force", /overriding this screen/i.test(ui));
  check("and mentions it quietly when it is set but dormant", /is set on the server but is not/i.test(ui));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
