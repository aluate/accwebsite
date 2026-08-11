#!/usr/bin/env node
/**
 * test-release-gate.mjs — the five things an engineer cannot work without.
 *
 * validateForRelease() blocks DRAFT -> ... -> RELEASED_TO_ENG until each finish
 * group has a base door style, a base door material, a drawer box, drawer slides
 * and hinges. It is the only thing standing between a half-filled spec and an
 * engineer being asked to build from it.
 *
 * WHY THIS EXISTS. The gate read the FIRST finish_group_drawers row for a group
 * with no role filter. A group can carry a `rollout` row as well as a `drawer_box`
 * one, and nothing orders them, so on a group whose rollout row came back first the
 * rollout's box and slides satisfied the "drawer box" and "drawer slides" checks —
 * and the actual drawers were never verified at all. A spec with no drawer box
 * specified sailed through the gate that exists to catch exactly that.
 *
 * That is not a hypothetical ordering: seedAccStandards writes drawer_box at
 * sort_order 0 and rollout at 1, but this query has no ORDER BY, so the order is
 * whatever Postgres returns — which changes with updates, vacuum and plan choice.
 *
 * Tests go through transitionLifecycle, the real entry point, rather than the
 * unexported validator, so they prove the transition is actually refused and the
 * spec's state is unchanged.
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/test-release-gate.mjs
 */
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { transitionLifecycle } from "../lib/lifecycle.ts";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
const sql = postgres(url, { ssl: isLocal ? false : "require", max: 2, prepare: false });

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

const uid = () => randomBytes(6).toString("hex");
const made = [];

/**
 * A spec that satisfies everything EXCEPT what the caller withholds.
 * `omit` names which of the five to leave blank; `drawerRoles` decides which
 * finish_group_drawers rows exist.
 */
async function spec({ omit = [], drawerRoles = ["drawer_box"] } = {}) {
  const jobId = "rgt-job-" + uid(), specId = "rgt-spec-" + uid(), fgId = "rgt-fg-" + uid();
  made.push(jobId);
  const now = new Date().toISOString();
  await sql`INSERT INTO jobs (id, created_at, client_name, site_address, job_number)
            VALUES (${jobId}, ${now}, 'Release Gate Test', '1 Gate St', ${"G-" + uid().slice(0, 4)})`;
  await sql`INSERT INTO residential_specs (id, job_id, created_at, updated_at, lifecycle_state)
            VALUES (${specId}, ${jobId}, ${now}, ${now}, 'CLIENT_APPROVED')`;
  // Melamine with a colour, so the base door material is DERIVED and needs no
  // material_id — see lib/door-material.ts.
  await sql`INSERT INTO finish_groups (id, spec_id, label, finish_type, sort_order, color_name, color_id)
            VALUES (${fgId}, ${specId}, 'MEL-1', 'melamine', 0, 'Moab Rift', 'MEL-TAF-010')`;

  if (!omit.includes("door")) {
    await sql`INSERT INTO finish_group_door_fronts (id, finish_group_id, role, style_id, sort_order)
              VALUES (${"df-" + uid()}, ${fgId}, 'base', 'DS-SLAB', 0)`;
  }
  if (!omit.includes("hinges")) {
    await sql`INSERT INTO finish_group_hardware (id, finish_group_id, role, hardware_id, sort_order)
              VALUES (${"hw-" + uid()}, ${fgId}, 'hinges', 'HH-BLU-110', 0)`;
  }
  // Rollout deliberately inserted FIRST, so an unfiltered `.find()` picks it up.
  for (const [i, role] of drawerRoles.entries()) {
    const box    = omit.includes(`${role}:box`)    ? null : "DBX-001";
    const slides = omit.includes(`${role}:slides`) ? null : (role === "rollout" ? "DS-ACC-RO" : "DS-ACC-STD");
    await sql`INSERT INTO finish_group_drawers (id, finish_group_id, role, drawer_box_id, slides_id, sort_order)
              VALUES (${"dr-" + uid()}, ${fgId}, ${role}, ${box}, ${slides}, ${i})`;
  }
  return { specId, fgId };
}

const release = (specId) => transitionLifecycle({ specId, to: "RELEASED_TO_ENG", actor: "release-gate-test" });
const stateOf = async (specId) =>
  (await sql`SELECT lifecycle_state FROM residential_specs WHERE id = ${specId}`)[0]?.lifecycle_state;

async function main() {
  console.log("\na complete spec is released\n");
  {
    const { specId } = await spec();
    const r = await release(specId);
    check("a group with everything filled in passes the gate", r.ok === true, r.ok ? "" : r.error);
    check("and the state actually moved", (await stateOf(specId)) === "RELEASED_TO_ENG");
  }

  console.log("\neach of the five blocks on its own\n");
  for (const [omit, expect] of [
    [["door"],              "base door style"],
    [["drawer_box:box"],    "drawer box"],
    [["drawer_box:slides"], "drawer slides"],
    [["hinges"],            "hinges"],
  ]) {
    const { specId } = await spec({ omit });
    const r = await release(specId);
    check(`missing ${expect} is refused`, r.ok === false, "the gate let it through");
    check(`  and the message names it`, !r.ok && r.error.includes(expect), !r.ok ? r.error : "");
    check(`  and the spec stayed put`, (await stateOf(specId)) === "CLIENT_APPROVED");
  }
  {
    // No drawer row at all is the same failure as a blank one.
    const { specId } = await spec({ drawerRoles: [] });
    const r = await release(specId);
    check("no drawer row at all is refused", r.ok === false && r.error.includes("drawer box"), !r.ok ? r.error : "");
  }

  console.log("\nTHE BUG: a rollout row must not stand in for the drawers\n");
  {
    // Rollout is complete; there is no drawer_box row. Before the role filter, the
    // unfiltered .find() picked the rollout, saw a box and slides on it, and passed.
    const { specId } = await spec({ drawerRoles: ["rollout"] });
    const r = await release(specId);
    check("a rollout row alone does NOT satisfy the drawer box check",
          r.ok === false && r.error.includes("drawer box"),
          r.ok ? "RELEASED with no drawer box specified" : r.error);
    check("nor the drawer slides check", !r.ok && r.error.includes("drawer slides"), !r.ok ? r.error : "");
    check("and the spec stayed put", (await stateOf(specId)) === "CLIENT_APPROVED");
  }
  {
    // Both rows present, rollout inserted first, and the drawer_box row is the
    // incomplete one. The rollout must not cover for it.
    const { specId } = await spec({ drawerRoles: ["rollout", "drawer_box"], omit: ["drawer_box:slides"] });
    const r = await release(specId);
    check("a complete rollout does not cover for a drawer row with no slides",
          r.ok === false && r.error.includes("drawer slides"),
          r.ok ? "RELEASED with no drawer slides" : r.error);
  }
  {
    // And the converse: a complete drawer_box row plus an EMPTY rollout row still
    // releases. Rollout completeness is not one of the five, and blocking on it
    // would stop every job that has no rollouts.
    const { specId } = await spec({ drawerRoles: ["rollout", "drawer_box"], omit: ["rollout:box", "rollout:slides"] });
    const r = await release(specId);
    check("an empty rollout row does not block a complete drawer row", r.ok === true, r.ok ? "" : r.error);
  }

  console.log("\nseveral finish groups\n");
  {
    const { specId, fgId } = await spec();
    const fg2 = "rgt-fg2-" + uid();
    await sql`INSERT INTO finish_groups (id, spec_id, label, finish_type, sort_order, color_name, color_id)
              VALUES (${fg2}, ${specId}, 'MEL-2', 'melamine', 1, 'Moab Rift', 'MEL-TAF-010')`;
    const r = await release(specId);
    check("one incomplete group blocks the whole spec", r.ok === false, "a second empty group was ignored");
    check("and the message names THAT group", !r.ok && r.error.includes("MEL-2"), !r.ok ? r.error : "");
    check("not the complete one", !r.ok && !r.error.includes("MEL-1"), !r.ok ? r.error : `fgId ${fgId}`);
  }
  {
    const { specId } = await spec();
    await sql`DELETE FROM finish_groups WHERE spec_id = ${specId}`;
    const r = await release(specId);
    check("a spec with no finish groups is refused", r.ok === false && /no finish groups/i.test(r.error),
          !r.ok ? r.error : "");
  }
}

main()
  .catch((e) => { console.error("\nHARNESS ERROR:", e.message ?? e, e.stack?.split("\n")[1] ?? ""); fail++; })
  .finally(async () => {
    for (const id of made) await sql`DELETE FROM jobs WHERE id = ${id}`.catch(() => {});
    await sql.end({ timeout: 5 });
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  });
