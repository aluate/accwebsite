#!/usr/bin/env node
/**
 * test-notification-store.mjs — the settings survive a round trip through the
 * database.
 *
 * Needs DATABASE_URL. No server.
 *
 * WHY THIS EXISTS AND NOT JUST THE PURE TEST.
 *
 * The pure tests proved the routing logic and all passed while the feature was
 * broken end to end: the writer stored the JSON with JSON.stringify plus a
 * ::jsonb cast, which makes a jsonb STRING rather than a jsonb object, and the
 * reader — checking typeof === "object" — read every saved route back as empty.
 * Save a route, nothing changes. Set the test addresses, everything still goes
 * to the fallback. Both halves looked right on their own.
 *
 * So this asserts the only thing that could have caught it: write it, read it
 * back, and see the same values.
 */
import postgres from "postgres";
import { requireTestDatabase, isLocal as isLocalDb } from "./test-db.mjs";
import {
  saveRouteOverride, loadRouteOverrides,
  saveTestMode, loadTestMode,
  resolveRecipients, resolveAddresses, effectiveRoute, applyTestRouting,
} from "../lib/notification-routing.ts";
import { EVENT_BY_KEY } from "../lib/notification-events.ts";

const url = requireTestDatabase("the notification settings suite");
const sql = postgres(url, { ssl: isLocalDb(url) ? false : "require", prepare: false, max: 2 });

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

const KEY = "advance.delivery";
let savedRoutes = null, savedMode = null;

try {
  savedMode = await loadTestMode(true);
  savedRoutes = (await loadRouteOverrides())[KEY] ?? null;

  console.log("\na saved route comes back the way it went in\n");
  await saveRouteOverride({
    event_key: KEY,
    to_roles: ["client"],
    to_fixed: ["someone@advancedcabinets.net"],
    cc_roles: ["pm", "karl"],
    cc_fixed: [],
    enabled: true,
  });
  const back = (await loadRouteOverrides())[KEY];
  check("the route is there at all", !!back);
  check("to roles survive", JSON.stringify(back?.to_roles) === JSON.stringify(["client"]),
    JSON.stringify(back?.to_roles));
  check("fixed addresses survive", back?.to_fixed?.[0] === "someone@advancedcabinets.net",
    JSON.stringify(back?.to_fixed));
  check("cc roles survive", JSON.stringify(back?.cc_roles) === JSON.stringify(["pm", "karl"]),
    JSON.stringify(back?.cc_roles));

  console.log("\nand the override actually changes who is emailed\n");
  const people = { client: "homeowner@example.com", pm: "pm@acc.test", karl: "karl@acc.test" };
  const r = await resolveRecipients(KEY, people);
  check("the fixed address is on the message", r.to.includes("someone@advancedcabinets.net"), r.to.join(", "));
  check("the client is still on it", r.to.includes("homeowner@example.com"));
  check("the cc roles resolved", r.cc.length === 2, r.cc.join(", "));

  console.log("\nturning it off stops it\n");
  await saveRouteOverride({ event_key: KEY, to_roles: ["client"], to_fixed: [], cc_roles: [], cc_fixed: [], enabled: false });
  const off = await resolveRecipients(KEY, people);
  check("an email switched off reports itself off", off.enabled === false);

  console.log("\ntest mode addresses survive too — this is the bug that shipped\n");
  await saveTestMode({
    active: true,
    addresses: { client: "pseudo-client@example.com", builder: "pseudo-builder@example.com" },
    fallback: "fallback@example.com",
  });
  const mode = await loadTestMode(true);
  check("test mode is on", mode.active === true);
  check("the client stand-in survived the round trip", mode.addresses.client === "pseudo-client@example.com",
    JSON.stringify(mode.addresses));
  check("the builder stand-in survived", mode.addresses.builder === "pseudo-builder@example.com");
  check("the fallback survived", mode.fallback === "fallback@example.com");

  const routed = applyTestRouting(mode, {
    to: ["homeowner@example.com", "builder@atlas.test"],
    cc: [],
    roleOf: (a) => (a.startsWith("homeowner") ? "client" : "builder"),
  });
  check("with the addresses loaded, the client and builder copies go to DIFFERENT inboxes",
    routed.to.includes("pseudo-client@example.com") && routed.to.includes("pseudo-builder@example.com"),
    routed.to.join(", "));
  check("...and neither real address survives",
    !routed.to.some((a) => a.includes("example.com") && (a.startsWith("homeowner") || a.startsWith("builder"))),
    routed.to.join(", "));
} catch (e) {
  fail++;
  console.log(`  FAIL threw -> ${e.message}`);
} finally {
  // put the settings back exactly as they were
  if (savedMode) await saveTestMode(savedMode).catch(() => {});
  if (savedRoutes) await saveRouteOverride(savedRoutes).catch(() => {});
  else await sql`DELETE FROM notification_routes WHERE event_key = ${KEY}`.catch(() => {});
  await sql.end({ timeout: 5 });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
