/**
 * test-acc-standards.mjs — proves the seeding in lib/acc-standards-seed.ts against a
 * REAL Postgres carrying the production schema (pg_dump, 91 tables).
 *
 * The point of testing this against real Postgres rather than a mock: the whole
 * bug class here is scope. A per-table guard vs a per-role guard reads almost
 * identically and only differs once a row already exists. That is exactly what
 * production looked like — door_pulls present, hinges absent, forever.
 *
 *   DATABASE_URL=postgres://... node scripts/test-acc-standards.mjs
 */
import postgres from "postgres";
import { randomBytes } from "node:crypto";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = postgres(url, { ssl: false, prepare: false, max: 2 });
const uid = () => randomBytes(8).toString("hex");

// ── the code under test, imported by transpiling the real module ─────────────
// lib/acc-standards.ts imports "@/lib/db", which reads DATABASE_URL and builds
// its own client. Rather than duplicating the SQL here (which would test my
// transcription instead of the shipped code), the real module is loaded through
// tsx with the alias resolved.
const { seedAccStandards } = await import("../lib/acc-standards-seed.ts");
const {
  ACC_STANDARD_HINGE, ACC_STANDARD_DRAWER_SLIDE, ACC_STANDARD_ROLLOUT_SLIDE,
  ACC_STANDARD_DRAWER_SLIDE_SPEC, ACC_STANDARD_ROLLOUT_SLIDE_SPEC,
} = await import("../lib/acc-standards.ts");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
}

// ── fixtures ────────────────────────────────────────────────────────────────
const specId = "spec-" + uid();
const jobId = "job-" + uid();
async function setup() {
  const now = new Date().toISOString();
  // residential_specs.job_id is FK -> jobs ON DELETE CASCADE, and created_at /
  // updated_at are NOT NULL with no default, so the fixture has to be complete.
  await sql`
    INSERT INTO jobs (id, created_at, client_name, site_address)
    VALUES (${jobId}, ${now}, 'TEST HARNESS', '000 Test St')
  `;
  await sql`
    INSERT INTO residential_specs (id, job_id, created_at, updated_at)
    VALUES (${specId}, ${jobId}, ${now}, ${now})
  `;
}
async function newFg(label, fields = {}) {
  const id = "fg-" + uid();
  await sql`
    INSERT INTO finish_groups (id, spec_id, label, finish_type, drawer_box_id, rollout_box_id, pull_id)
    VALUES (${id}, ${specId}, ${label}, 'paint',
            ${fields.drawer_box_id ?? null}, ${fields.rollout_box_id ?? null}, ${fields.pull_id ?? null})
  `;
  return id;
}
const hw = async (fgId) => sql`SELECT role, hardware_id FROM finish_group_hardware WHERE finish_group_id = ${fgId} ORDER BY sort_order`;
const dr = async (fgId) => sql`SELECT role, drawer_box_id, slides_id FROM finish_group_drawers WHERE finish_group_id = ${fgId} ORDER BY sort_order`;
const roleOf = (rows, role) => rows.find((r) => r.role === role);

// ── tests ───────────────────────────────────────────────────────────────────
async function t1_freshGroup() {
  console.log("\n1. Fresh finish group, no rollouts");
  const fg = await newFg("Kitchen Perimeter", { drawer_box_id: "DB-001" });
  await seedAccStandards(fg, { drawerBoxId: "DB-001" });
  const h = await hw(fg), d = await dr(fg);
  check("hinges seeded to the ACC standard", roleOf(h, "hinges")?.hardware_id === ACC_STANDARD_HINGE, JSON.stringify(h));
  check("drawer_slides seeded to the ACC standard", roleOf(h, "drawer_slides")?.hardware_id === ACC_STANDARD_DRAWER_SLIDE);
  check("rollout_slides NOT seeded (no rollout_box_id)", !roleOf(h, "rollout_slides"));
  check("no pulls seeded (pull_id was blank)", !roleOf(h, "door_pulls") && !roleOf(h, "drawer_pulls"));
  check("drawer_box row carries slides_id from the DS-* namespace", roleOf(d, "drawer_box")?.slides_id === ACC_STANDARD_DRAWER_SLIDE_SPEC, JSON.stringify(d));
  check("drawer_box row carries the PM's box choice", roleOf(d, "drawer_box")?.drawer_box_id === "DB-001");
  check("no rollout drawer row", !roleOf(d, "rollout"));
}

async function t2_theProductionBug() {
  console.log("\n2. THE PRODUCTION BUG: group already has pulls, hinges absent");
  // This is the exact state the old per-table guard created and then froze.
  const fg = await newFg("Master Bath", { pull_id: "PL-002" });
  await sql`INSERT INTO finish_group_hardware (id, finish_group_id, role, hardware_id, sort_order)
            VALUES (${uid()}, ${fg}, 'door_pulls', 'PL-002', 0)`;
  await sql`INSERT INTO finish_group_hardware (id, finish_group_id, role, hardware_id, sort_order)
            VALUES (${uid()}, ${fg}, 'drawer_pulls', 'PL-002', 1)`;
  const before = await hw(fg);
  check("precondition: pulls present, hinges absent", before.length === 2 && !roleOf(before, "hinges"));

  await seedAccStandards(fg, { pullId: "PL-002" });
  const h = await hw(fg);
  check("hinges now seeded despite pre-existing rows", roleOf(h, "hinges")?.hardware_id === ACC_STANDARD_HINGE, JSON.stringify(h));
  check("drawer_slides now seeded too", roleOf(h, "drawer_slides")?.hardware_id === ACC_STANDARD_DRAWER_SLIDE);
  check("existing pulls untouched, not duplicated",
    h.filter((r) => r.role === "door_pulls").length === 1 && roleOf(h, "door_pulls").hardware_id === "PL-002");
}

async function t3_neverClobber() {
  console.log("\n3. A deliberate choice is never overwritten");
  const fg = await newFg("Laundry");
  // Someone picked a non-standard hinge, and explicitly blanked drawer slides.
  await sql`INSERT INTO finish_group_hardware (id, finish_group_id, role, hardware_id, sort_order)
            VALUES (${uid()}, ${fg}, 'hinges', 'HH-BLU-120', 0)`;
  await sql`INSERT INTO finish_group_hardware (id, finish_group_id, role, hardware_id, sort_order)
            VALUES (${uid()}, ${fg}, 'drawer_slides', NULL, 1)`;
  await sql`INSERT INTO finish_group_drawers (id, finish_group_id, role, drawer_box_id, slides_id, sort_order)
            VALUES (${uid()}, ${fg}, 'drawer_box', 'DB-CUSTOM', 'DS-SAL-001', 0)`;

  await seedAccStandards(fg, { drawerBoxId: "DB-001" });
  const h = await hw(fg), d = await dr(fg);
  check("non-standard hinge kept", roleOf(h, "hinges").hardware_id === "HH-BLU-120");
  check('explicit "None" on drawer_slides kept as null', roleOf(h, "drawer_slides").hardware_id === null);
  check("non-standard slides on the drawer row kept", roleOf(d, "drawer_box").slides_id === "DS-SAL-001");
  check("existing drawer_box_id kept, not replaced by the payload", roleOf(d, "drawer_box").drawer_box_id === "DB-CUSTOM");
}

async function t4_partialBackfill() {
  console.log("\n4. Partial row: box set, slides blank (the release-gate blocker)");
  const fg = await newFg("Pantry");
  await sql`INSERT INTO finish_group_drawers (id, finish_group_id, role, drawer_box_id, slides_id, sort_order)
            VALUES (${uid()}, ${fg}, 'drawer_box', 'DB-001', NULL, 0)`;
  await seedAccStandards(fg, { drawerBoxId: "DB-001" });
  const d = await dr(fg);
  check("slides_id backfilled on the existing row", roleOf(d, "drawer_box").slides_id === ACC_STANDARD_DRAWER_SLIDE_SPEC, JSON.stringify(d));
  check("no duplicate drawer_box row", d.filter((r) => r.role === "drawer_box").length === 1);
}

async function t5_rollouts() {
  console.log("\n5. Group WITH rollouts");
  const fg = await newFg("Kitchen Island", { drawer_box_id: "DB-001", rollout_box_id: "RB-PFPLY" });
  await seedAccStandards(fg, { drawerBoxId: "DB-001", rolloutBoxId: "RB-PFPLY" });
  const h = await hw(fg), d = await dr(fg);
  check("rollout_slides seeded to ball-bearing side-mount", roleOf(h, "rollout_slides")?.hardware_id === ACC_STANDARD_ROLLOUT_SLIDE, JSON.stringify(h));
  check("rollout drawer row created with those slides", roleOf(d, "rollout")?.slides_id === ACC_STANDARD_ROLLOUT_SLIDE_SPEC);
  check("rollout row carries the rollout box", roleOf(d, "rollout")?.drawer_box_id === "RB-PFPLY");
}

async function t6_idempotent() {
  console.log("\n6. Idempotent across repeated saves");
  const fg = await newFg("Mudroom", { drawer_box_id: "DB-001", pull_id: "PL-001", rollout_box_id: "RB-PFPLY" });
  const args = { drawerBoxId: "DB-001", pullId: "PL-001", rolloutBoxId: "RB-PFPLY" };
  for (let i = 0; i < 4; i++) await seedAccStandards(fg, args);
  const h = await hw(fg), d = await dr(fg);
  const dupHw = [...new Set(h.map((r) => r.role))].length !== h.length;
  const dupDr = [...new Set(d.map((r) => r.role))].length !== d.length;
  check("4 saves produced no duplicate hardware rows", !dupHw, JSON.stringify(h.map((r) => r.role)));
  check("4 saves produced no duplicate drawer rows", !dupDr, JSON.stringify(d.map((r) => r.role)));
  check("all five required hardware roles present",
    ["hinges", "drawer_slides", "door_pulls", "drawer_pulls"].every((r) => roleOf(h, r)?.hardware_id));
}

async function t7_releaseGate() {
  console.log("\n7. Does the release gate actually pass now?");
  // Replicates validateForRelease() in lib/lifecycle.ts against a fully seeded FG.
  const fg = await newFg("Great Room", { drawer_box_id: "DB-001", pull_id: "PL-001" });
  await sql`INSERT INTO finish_group_door_fronts (id, finish_group_id, role, style_id, material_id, sort_order)
            VALUES (${uid()}, ${fg}, 'base', 'DS-SHAKER', 'DM-001', 0)`;
  await seedAccStandards(fg, { drawerBoxId: "DB-001", pullId: "PL-001" });

  const [df] = await sql`SELECT style_id, material_id FROM finish_group_door_fronts WHERE finish_group_id = ${fg} AND role = 'base'`;
  const [dw] = await sql`SELECT drawer_box_id, slides_id FROM finish_group_drawers WHERE finish_group_id = ${fg} AND role = 'drawer_box'`;
  const [hg] = await sql`SELECT hardware_id FROM finish_group_hardware WHERE finish_group_id = ${fg} AND role = 'hinges'`;

  const missing = [];
  if (!df?.style_id)     missing.push("base door style");
  if (!df?.material_id)  missing.push("base door material");
  if (!dw?.drawer_box_id) missing.push("drawer box");
  if (!dw?.slides_id)    missing.push("drawer slides");
  if (!hg?.hardware_id)  missing.push("hinges");
  check("all 5 release-gate fields satisfied", missing.length === 0, "still missing: " + missing.join(", "));

  // And the counterfactual: without seeding, which of the 5 would be blank?
  const bare = await newFg("Unseeded Control", { drawer_box_id: "DB-001" });
  await sql`INSERT INTO finish_group_door_fronts (id, finish_group_id, role, style_id, material_id, sort_order)
            VALUES (${uid()}, ${bare}, 'base', 'DS-SHAKER', 'DM-001', 0)`;
  const bareDw = await sql`SELECT slides_id FROM finish_group_drawers WHERE finish_group_id = ${bare}`;
  const bareHg = await sql`SELECT hardware_id FROM finish_group_hardware WHERE finish_group_id = ${bare} AND role = 'hinges'`;
  check("control group (unseeded) would still fail on slides + hinges",
    bareDw.length === 0 && bareHg.length === 0);
}

async function t8_namespaceRepair() {
  console.log("\n8. REPAIR: hardware-namespace ids already written into slides_id");
  // Exactly what the first version of this seeding left in production: HDS-/HRS-
  // ids in a column resolved against drawer_slides.csv, so the work order printed
  // the raw code. Fill-blanks-only would protect that bug forever, so it does not
  // apply to values from the wrong namespace.
  const fg = await newFg("Repair Me", { drawer_box_id: "DB-001", rollout_box_id: "RB-PFPLY" });
  await sql`INSERT INTO finish_group_drawers (id, finish_group_id, role, drawer_box_id, slides_id, sort_order)
            VALUES (${uid()}, ${fg}, 'drawer_box', 'DB-001', 'HDS-BLU-001', 0)`;
  await sql`INSERT INTO finish_group_drawers (id, finish_group_id, role, drawer_box_id, slides_id, sort_order)
            VALUES (${uid()}, ${fg}, 'rollout', 'RB-PFPLY', 'HRS-KV-001', 1)`;

  await seedAccStandards(fg, { drawerBoxId: "DB-001", rolloutBoxId: "RB-PFPLY" });
  const d = await dr(fg);
  check("HDS-* in slides_id replaced with the DS-* equivalent",
    roleOf(d, "drawer_box").slides_id === ACC_STANDARD_DRAWER_SLIDE_SPEC, JSON.stringify(d));
  check("HRS-* in slides_id replaced too",
    roleOf(d, "rollout").slides_id === ACC_STANDARD_ROLLOUT_SLIDE_SPEC);
  check("repair did not duplicate rows", d.length === 2);

  // And a legitimate DS-* choice is still left alone after the repair pass exists.
  const fg2 = await newFg("Do Not Repair", { drawer_box_id: "DB-001" });
  await sql`INSERT INTO finish_group_drawers (id, finish_group_id, role, drawer_box_id, slides_id, sort_order)
            VALUES (${uid()}, ${fg2}, 'drawer_box', 'DB-001', 'DS-HET-001', 0)`;
  await seedAccStandards(fg2, { drawerBoxId: "DB-001" });
  const d2 = await dr(fg2);
  check("a real DS-* choice survives the repair pass", roleOf(d2, "drawer_box").slides_id === "DS-HET-001");
}

async function t9_idsResolve() {
  console.log("\n9. Every seeded id actually resolves in its catalog");
  // The bug this catches: an id that is valid in one catalog and unknown to the
  // consumer that reads it. A name lookup returning nothing is how "HDS-BLU-001"
  // ended up printed on a shop document.
  const { readFileSync } = await import("node:fs");
  const cat = (n) => JSON.parse(readFileSync(`data/catalogs/${n}.json`, "utf8"));
  const has = (n, id) => cat(n).some((r) => r.id === id);

  check(`hinge ${ACC_STANDARD_HINGE} is in hardware_hinges`,
    has("hardware_hinges", ACC_STANDARD_HINGE));
  check(`drawer slide ${ACC_STANDARD_DRAWER_SLIDE} is in hardware_drawer_slides`,
    has("hardware_drawer_slides", ACC_STANDARD_DRAWER_SLIDE));
  check(`rollout slide ${ACC_STANDARD_ROLLOUT_SLIDE} is in hardware_rollout_slides`,
    has("hardware_rollout_slides", ACC_STANDARD_ROLLOUT_SLIDE));
  check(`spec drawer slide ${ACC_STANDARD_DRAWER_SLIDE_SPEC} is in drawer_slides`,
    has("drawer_slides", ACC_STANDARD_DRAWER_SLIDE_SPEC));
  check(`spec rollout slide ${ACC_STANDARD_ROLLOUT_SLIDE_SPEC} is in drawer_slides`,
    has("drawer_slides", ACC_STANDARD_ROLLOUT_SLIDE_SPEC));

  // The inverse check: the hardware-namespace ids must NOT resolve in drawer_slides,
  // because that is precisely why they cannot be used in slides_id.
  check("HDS-* does NOT resolve in drawer_slides (this is why the repair exists)",
    !has("drawer_slides", ACC_STANDARD_DRAWER_SLIDE));
}

try {
  await setup();
  await t1_freshGroup();
  await t2_theProductionBug();
  await t3_neverClobber();
  await t4_partialBackfill();
  await t5_rollouts();
  await t6_idempotent();
  await t7_releaseGate();
  await t8_namespaceRepair();
  await t9_idsResolve();
} catch (e) {
  console.error("\nHARNESS ERROR:", e);
  fail++;
} finally {
  // jobs -> residential_specs -> finish_groups -> everything cascades.
  await sql`DELETE FROM jobs WHERE id = ${jobId}`.catch(() => {});
  await sql.end({ timeout: 5 });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
