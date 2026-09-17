#!/usr/bin/env node
/**
 * test-permission-map.mjs — the capability map is the only thing deciding access,
 * and nothing under /admin is left ungated.
 *
 * No database, no network.
 *
 * WHY. Karl, 2026-09-17: "the PM permissions were incomplete and I had to bump
 * everyone up to make it work." The cause was app/admin/(protected)/layout.tsx
 * being one requireRole(["admin"]) over twenty-two pages. Splitting that into
 * per-page capabilities fixes it and introduces a new way to get it wrong: a
 * page added later that forgets to declare one.
 *
 * The old blanket gate was at least safe by default. This suite is what replaces
 * that safety — it fails the build rather than leaving a page open.
 *
 * Assertions run on comment-stripped source. See scripts/strip-source.mjs for
 * the several ways that has gone wrong when they did not.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./strip-source.mjs";
import {
  CAPABILITIES, CAPABILITY_GRANTS, ADMIN_PAGE_CAPS, can, canEnterAdmin, rolesWith,
} from "../lib/permissions.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const check = (n, c, d = "") => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${d ? "  -> " + d : ""}`)); };
const read = (p) => stripComments(readFileSync(join(ROOT, p), "utf8"));

console.log("\n1. the map itself is complete and coherent\n");
const caps = Object.keys(CAPABILITIES);
check("every capability has a grant list", caps.every((c) => Array.isArray(CAPABILITY_GRANTS[c])),
      caps.filter((c) => !CAPABILITY_GRANTS[c]).join(", ") ||
      "a missing entry is a runtime crash in can(), not a type error — tsx strips types without checking");
check("no grant list names a role that does not exist",
      caps.every((c) => CAPABILITY_GRANTS[c].every((r) => ["admin","pm","engineer","shop","installer"].includes(r))));
check("karl is never listed — he holds everything by rule",
      caps.every((c) => !CAPABILITY_GRANTS[c].includes("karl")),
      "listing him invites a future capability that forgets to, and locks the owner out of his own app");
check("karl holds every capability", caps.every((c) => can("karl", c)));
check("admin is a real second owner", caps.every((c) => can("admin", c)),
      "an admin who cannot create a login is not a second pair of hands");
check("installer cannot enter /admin at all", !canEnterAdmin("installer"));
check("nobody but karl/admin can edit a catalog", rolesWith("catalog.edit").join() === "karl,admin");
check("billing is held back to the owner", !can("pm", "billing.view") && !can("pm", "billing.manage"),
      "Karl 2026-09-17: 'mine only. we can roll out billing after more testing'");
check("a PM can put work on the calendar", can("pm", "schedule.edit") && can("pm", "schedule.admin"),
      "this is the capability whose absence broke the punch-to-installer flow");
check("a PM can work a spec in engineering", can("pm", "engineering.edit"),
      "Karl 2026-09-17: 'they can do that too if needed'");

console.log("\n2. every admin page is gated, and by the capability the map says\n");
const ADMIN_ROOT = "app/admin/(protected)";
const segs = readdirSync(join(ROOT, ADMIN_ROOT))
  .filter((d) => statSync(join(ROOT, ADMIN_ROOT, d)).isDirectory());

for (const seg of segs.sort()) {
  const cap = ADMIN_PAGE_CAPS[seg];
  check(`${seg}: declared in ADMIN_PAGE_CAPS`, !!cap,
        "an admin page nobody assigned a capability to is an admin page with only the floor guarding it");
  if (!cap) continue;
  // The gate may live on the page (server component) or on a sibling layout
  // (client component — a client page cannot call a server gate itself).
  const pagePath   = `${ADMIN_ROOT}/${seg}/page.tsx`;
  const layoutPath = `${ADMIN_ROOT}/${seg}/layout.tsx`;
  const sources = [pagePath, layoutPath]
    .filter((p) => existsSync(join(ROOT, p)))
    .map(read);
  check(`${seg}: something calls requireCap`, sources.some((s) => s.includes("requireCap(")),
        `neither ${seg}/page.tsx nor ${seg}/layout.tsx gates this page`);
  check(`${seg}: gated with "${cap}"`, sources.some((s) => s.includes(`requireCap("${cap}")`)),
        "the gate and ADMIN_PAGE_CAPS disagree, which is exactly the drift this map exists to stop");
}

console.log("\n3. the layout is a floor, not the gate\n");
const layout = read(`${ADMIN_ROOT}/layout.tsx`);
check("no blanket requireRole left", !layout.includes("requireRole("),
      "one role check over twenty-two pages is what made the pm role unusable");
check("refuses anyone holding no admin capability", layout.includes("canEnterAdmin("));

console.log("\n4. the holes the audit found are closed\n");
const jobRoute = read("app/api/jobs/[id]/route.ts");
check("PATCH /api/jobs/[id] needs jobs.edit", jobRoute.includes('guardCap("jobs.edit")'),
      "was requireBuilderApi() — any role could rewrite status, pm, value, dates and client contact on any job");
check("DELETE /api/jobs/[id] needs jobs.delete", jobRoute.includes('guardCap("jobs.delete")'));
check("POST /api/jobs needs jobs.create", read("app/api/jobs/route.ts").includes('guardCap("jobs.create")'));
check("advance needs jobs.advance", read("app/api/jobs/[id]/advance/route.ts").includes('guardCap("jobs.advance")'));
check("creating a signoff needs client.send", read("app/api/signoffs/create/route.ts").includes('guardCap("client.send")'),
      "was requireBuilder() with no role check, while the button was karl/admin/pm only");
check("ready-to-schedule needs schedule.edit", read("app/api/schedule/ready/route.ts").includes('guardCap("schedule.edit")'));

console.log("\n5. nothing offers an editor the API will refuse\n");
const inline = read("components/JobInlineEditClient.tsx");
check("the inline editor takes a canEdit prop", /canEdit\?: boolean/.test(inline));
check("it defaults to read-only", /canEdit = false/.test(inline),
      "a call site that forgets should get a read-only panel, never a form that 403s");
check("it refuses to start an edit without it", /if \(!canEdit\) return;/.test(inline));
check("the job page passes the real answer",
      read("app/jobs/[id]/page.tsx").includes('canEdit={can(session.role, "jobs.edit")}'));
check("/jobs/[id]/edit is gated at all",
      read("app/jobs/[id]/edit/page.tsx").includes('requireCap("jobs.edit")'),
      "this page had no role check whatsoever — every internal role could open the full intake form and save it");

console.log("\n6. the matrix page is generated, not remembered\n");
const permPage = read(`${ADMIN_ROOT}/permissions/page.tsx`);
check("it renders from lib/permissions", permPage.includes('from "@/lib/permissions"'));
check("it has no hand-written role table left", !permPage.includes("const PAGES"),
      "600 hand-maintained rows, last correct 2026-07-16, wrong in six places by September");
check("it reads the same grants the gates read", permPage.includes("rolesWith(") && permPage.includes("can("));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
