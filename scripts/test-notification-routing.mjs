#!/usr/bin/env node
/**
 * test-notification-routing.mjs — who an automated email goes to, and where it
 * goes instead while testing.
 *
 * No database, no network.
 *
 * WHY. Recipients used to be decided in fifteen files: some from an env var,
 * some from a column, six from an address typed into the source. "Who gets the
 * engineering release?" was answered by reading code and changed by deploying.
 *
 * Two properties matter enough to pin down here.
 *
 * A role that has no address on this job must be REPORTED, never guessed and
 * never quietly dropped — a delivery email that silently skips the client
 * because the job has no client_email is the failure this replaces.
 *
 * And test mode must split by role. One address for everything (what
 * TEST_EMAIL_OVERRIDE does) cannot tell you whether the delivery notice went
 * to the client or the PM, which is the whole thing you are checking when you
 * walk a job through its lifecycle.
 */
import {
  effectiveRoute,
  resolveAddresses,
  applyTestRouting,
} from "../lib/notification-routing.ts";
import { NOTIFICATION_EVENTS, EVENT_BY_KEY, NOTIFICATION_ROLES } from "../lib/notification-events.ts";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

const PEOPLE = {
  client: "homeowner@example.com",
  builder: "builder@atlas.example",
  pm: "residential@advancedcabinets.net",
  engineer: "joshl@advancedcabinets.net",
  shop: "shop@advancedcabinets.net",
  residential: "residential@advancedcabinets.net",
  karl: "karlv@advancedcabinets.net",
  sender: "pm@advancedcabinets.net",
};

console.log("\nthe registry itself\n");
{
  check("every event has somewhere to go",
    NOTIFICATION_EVENTS.every((e) => (e.toRoles?.length ?? 0) + (e.toFixed?.length ?? 0) > 0),
    NOTIFICATION_EVENTS.filter((e) => !(e.toRoles?.length || e.toFixed?.length)).map((e) => e.key).join(", "));
  check("every role named by an event is a real role",
    NOTIFICATION_EVENTS.every((e) => [...(e.toRoles ?? []), ...(e.ccRoles ?? [])].every((r) => NOTIFICATION_ROLES.includes(r))));
  check("event keys are unique", new Set(NOTIFICATION_EVENTS.map((e) => e.key)).size === NOTIFICATION_EVENTS.length);
  check("the three client-facing lifecycle emails are marked as reaching the customer",
    ["advance.delivery", "advance.punch", "advance.complete"].every((k) => EVENT_BY_KEY[k]?.audience === "client"));
  check("the engineering release still defaults to the address it was hardcoded to",
    (EVENT_BY_KEY["engineering_release"].toFixed ?? []).includes("joshl@advancedcabinets.net"));
}

console.log("\nresolving recipients\n");
{
  const ev = EVENT_BY_KEY["advance.delivery"];
  const r = resolveAddresses(effectiveRoute(ev, undefined), PEOPLE);
  check("the delivery notice goes to the client and the PM", r.to.length === 2 && r.to.includes(PEOPLE.client));
  check("each address remembers which role it came from",
    r.roleByAddress[PEOPLE.client.toLowerCase()] === "client");
  check("nothing is unresolved when the job has everyone", r.unresolved.length === 0);
}
{
  const ev = EVENT_BY_KEY["advance.delivery"];
  const r = resolveAddresses(effectiveRoute(ev, undefined), { ...PEOPLE, client: null });
  check("a job with no client email reports it rather than guessing",
    r.unresolved.includes("client"), JSON.stringify(r.unresolved));
  check("...and still sends to the PM rather than to nobody", r.to.length === 1);
}
{
  const ev = EVENT_BY_KEY["engineering_release"];
  const override = {
    event_key: "engineering_release",
    to_roles: ["engineer"], to_fixed: [],
    cc_roles: [], cc_fixed: ["someone-else@advancedcabinets.net"],
    enabled: true,
  };
  const r = resolveAddresses(effectiveRoute(ev, override), PEOPLE);
  check("an override replaces the defaults rather than adding to them",
    !r.to.some((a) => a === "joshl@advancedcabinets.net") || r.to.length === 1, r.to.join(", "));
  check("the override's cc is used", r.cc.includes("someone-else@advancedcabinets.net"));
  const off = resolveAddresses(effectiveRoute(ev, { ...override, enabled: false }), PEOPLE);
  check("an email turned off reports itself as off", off.enabled === false);
}
{
  const ev = EVENT_BY_KEY["advance.engineering"];
  const r = resolveAddresses(effectiveRoute(ev, undefined), { ...PEOPLE, residential: PEOPLE.pm });
  check("the same address in two roles appears once", new Set(r.cc.map((a) => a.toLowerCase())).size === r.cc.length);
}

console.log("\ntest mode\n");
const MODE = {
  active: true,
  addresses: {
    client: "karlvaage94@gmail.com",
    builder: "karlvaage208@gmail.com",
    pm: "residential@advancedcabinets.net",
    engineer: "karlv@advancedcabinets.net",
  },
  fallback: "karlv@advancedcabinets.net",
};
{
  const off = applyTestRouting({ ...MODE, active: false }, { to: [PEOPLE.client], cc: [] });
  check("off, the real recipient is untouched", off.to[0] === PEOPLE.client && !off.redirected);
  check("off, no subject prefix", off.subjectPrefix === "");
}
{
  const ev = EVENT_BY_KEY["advance.delivery"];
  const r = resolveAddresses(effectiveRoute(ev, undefined), PEOPLE);
  const t = applyTestRouting(MODE, { to: r.to, cc: r.cc, roleOf: (a) => r.roleByAddress[a.toLowerCase()] });
  check("the client copy lands in the pseudo-client inbox", t.to.includes("karlvaage94@gmail.com"));
  check("the PM copy lands in the PM inbox — the two are still distinguishable",
    t.to.includes("residential@advancedcabinets.net"), t.to.join(", "));
  check("no real customer address survives", !t.to.includes(PEOPLE.client));
  check("the subject is marked", t.subjectPrefix === "[TEST] ");
  check("the message says who it would really have gone to",
    t.bodyNote.includes(PEOPLE.client), t.bodyNote);
}
{
  const t = applyTestRouting(MODE, { to: ["someone@nowhere.example"], cc: [], audience: "shop" });
  check("a role with no test address falls back rather than going out",
    t.to.length === 1 && t.to[0] === MODE.fallback, t.to.join(", "));
}
{
  const t = applyTestRouting(MODE, { to: [], cc: [] });
  check("even with no recipients at all, test mode does not send to nobody",
    t.to.length === 1 && t.to[0] === MODE.fallback);
}
{
  const t = applyTestRouting(MODE, { to: [PEOPLE.client], cc: [PEOPLE.pm], roleOf: () => "client" });
  check("cc is folded away in test mode so one inbox is not confusing",
    t.cc.length === 0);
  check("...but the real cc is still named in the note", t.bodyNote.includes(PEOPLE.pm));
}
{
  const builderOnly = applyTestRouting(MODE, { to: ["contact@atlas.example"], cc: [], audience: "builder" });
  check("a builder email goes to the pseudo-builder inbox",
    builderOnly.to[0] === "karlvaage208@gmail.com");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
