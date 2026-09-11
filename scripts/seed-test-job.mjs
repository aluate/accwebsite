#!/usr/bin/env node
/**
 * seed-test-job.mjs — one complete job to test against.
 *
 * WHY. Testing anything past the intake screen needs a job that is actually
 * finished: a spec with a finish group whose base door has a style and a
 * derivable material, drawer box, slides and hinges (the five things
 * validateForRelease insists on), rooms hung off that group, accessories, and a
 * drawing in storage — because the release to engineering refuses to send
 * without an attachment. Building that by hand through the UI takes twenty
 * minutes and comes out slightly different every time, which is no basis for
 * "did this still work after the change?".
 *
 * So this writes one, the same way every time, and prints where to look.
 *
 *   node scripts/seed-test-job.mjs                  # create or refresh it
 *   node scripts/seed-test-job.mjs --job-number 90002
 *   node scripts/seed-test-job.mjs --drop           # remove it again
 *
 * Safety: it refuses to run against a host that is not local unless
 * SEED_ALLOW_REMOTE=1 is set. A seeded job in the production pipeline is
 * somebody's Monday morning confusion.
 */
import { sql, uid } from "../lib/db.ts";
import { fileStore } from "../lib/file-store.ts";
import { getCatalogs } from "../lib/catalogs.ts";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/* ───────────────────────────── guards ───────────────────────────── */

const url = process.env.DATABASE_URL ?? "";
const isLocal = /localhost|127\.0\.0\.1|::1/.test(url);
if (!isLocal && process.env.SEED_ALLOW_REMOTE !== "1") {
  console.error("\nDATABASE_URL does not look local, and SEED_ALLOW_REMOTE is not 1.");
  console.error("Refusing to put a test job in someone else's pipeline.\n");
  process.exit(1);
}

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const DROP = args.includes("--drop");
const JOB_NUMBER = String(arg("--job-number", "90001"));
const JOB_ID = `ACC-TEST-${JOB_NUMBER}`;
const BUILDER_ID = "BLD-TEST-0001";
const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const plusDays = (n) => iso(new Date(today.getTime() + n * 86400000));
const now = () => new Date().toISOString();

/* ───────────────────────────── drop ─────────────────────────────── */

if (DROP) {
  const [spec] = await sql`SELECT id FROM residential_specs WHERE job_id = ${JOB_ID}`;
  if (spec) {
    const fgs = await sql`SELECT id FROM finish_groups WHERE spec_id = ${spec.id}`;
    for (const fg of fgs) {
      await sql`DELETE FROM finish_group_door_fronts WHERE finish_group_id = ${fg.id}`;
      await sql`DELETE FROM finish_group_drawers    WHERE finish_group_id = ${fg.id}`;
      await sql`DELETE FROM finish_group_hardware   WHERE finish_group_id = ${fg.id}`;
      await sql`DELETE FROM finish_group_pulls      WHERE finish_group_id = ${fg.id}`;
    }
    const rooms = await sql`SELECT id FROM rooms WHERE spec_id = ${spec.id}`;
    for (const r of rooms) await sql`DELETE FROM room_accessories WHERE room_id = ${r.id}`;
    await sql`DELETE FROM rooms WHERE spec_id = ${spec.id}`;
    await sql`DELETE FROM finish_groups WHERE spec_id = ${spec.id}`;
    await sql`DELETE FROM residential_specs WHERE id = ${spec.id}`;
  }
  const files = await sql`SELECT storage_path FROM job_files WHERE job_id = ${JOB_ID}`;
  if (files.length) await fileStore().remove(files.map((f) => f.storage_path));
  await sql`DELETE FROM job_files WHERE job_id = ${JOB_ID}`;
  await sql`DELETE FROM jobs WHERE id = ${JOB_ID}`;
  console.log(`\nRemoved ${JOB_ID}.\n`);
  await sql.end();
  process.exit(0);
}

/* ──────────────────────────── builder ───────────────────────────── */

// The builder's name lives in `company` — there is no `name` column on this
// table, though `builder_name` on jobs and `name` elsewhere both read like one.
await sql`
  INSERT INTO builders (id, company, contact_name, email, phone, typical_pm, active, created_at, updated_at)
  VALUES (${BUILDER_ID}, ${"Test Builder Co"}, ${"Test Builder Contact"},
          ${"karlvaage208@gmail.com"}, ${"208-555-0177"}, ${"Karl V"}, ${1}, ${now()}, ${now()})
  ON CONFLICT (id) DO UPDATE SET company = EXCLUDED.company, active = 1, updated_at = EXCLUDED.updated_at
`;

/* ───────────────────────────── job ──────────────────────────────── */

await sql`DELETE FROM jobs WHERE id = ${JOB_ID}`;
await sql`
  INSERT INTO jobs (
    id, created_at, status, job_type, job_number,
    client_name, client_email, client_phone,
    site_address, city, state, zip_code, pm,
    builder_id, builder_name, builder_company, builder_email, builder_phone,
    delivery_date, install_start_date, install_type, install_duration_days,
    estimated_value, box_count, shop_hrs, install_hrs, engineer,
    mod_residential, mod_trim, mod_doors, mod_commercial,
    notes, notes_install, notes_finishing, notes_shop, notes_client
  ) VALUES (
    ${JOB_ID}, ${now()}, ${"intake"}, ${"residential"}, ${JOB_NUMBER},
    ${"Test Client"}, ${"karlvaage94@gmail.com"}, ${"208-555-0142"},
    ${"1425 Test Harbor Lane"}, ${"Coeur d'Alene"}, ${"ID"}, ${"83814"}, ${"Karl V"},
    ${BUILDER_ID}, ${"Test Builder Co"}, ${"Test Builder Co"}, ${"karlvaage208@gmail.com"}, ${"208-555-0177"},
    ${plusDays(45)}, ${plusDays(52)}, ${"full"}, ${3},
    ${85000}, ${42}, ${120}, ${38}, ${"Josh L"},
    ${1}, ${1}, ${0}, ${0},
    ${"Seeded by scripts/seed-test-job.mjs — safe to delete."},
    ${"Install note: stairs, no elevator."},
    ${"Finishing note: sheen confirmed with client."},
    ${"Shop note: watch grain match on the island."},
    ${"Client note: prefers morning calls."}
  )
`;

/* ───────────────────────────── spec ─────────────────────────────── */

const specId = uid();
await sql`
  INSERT INTO residential_specs (id, job_id, name, status, lifecycle_state, created_at, updated_at)
  VALUES (${specId}, ${JOB_ID}, ${"Residential Spec"}, ${"draft"}, ${"DRAFT"}, ${now()}, ${now()})
`;

const cat = await getCatalogs();
const pick = (rows, test, label) => {
  const hit = (rows ?? []).find(test);
  if (!hit) throw new Error(`No catalog row for ${label} — seed the catalogs first (scripts/seed-catalog-libraries.mjs).`);
  return hit;
};

// `placeholder` arrives as the string "False" rather than a boolean — the
// catalog rows come out of a spreadsheet, so test it as text.
const real = (row) => !(row.placeholder === true || String(row.placeholder).toLowerCase() === "true");
const doorStyle = pick(
  cat.doorStyles(),
  (d) => d.construction === "frame_and_panel" && real(d),
  "a frame-and-panel door style",
);
const species = (cat.species?.() ?? []).find((s) => /maple/i.test(s.name ?? s.id ?? "")) ?? (cat.species?.() ?? [])[0];
const paint = (cat.paintColors?.() ?? []).find(real) ?? (cat.paintColors?.() ?? [])[0];

const fgId = uid();
await sql`
  INSERT INTO finish_groups (
    id, spec_id, label, finish_type, species, color_name, color_id,
    door_style_id, box_material, sort_order, wo_number, box_count
  ) VALUES (
    ${fgId}, ${specId}, ${"Kitchen Perimeter"}, ${"paint"},
    ${species?.id ?? "maple"}, ${paint?.name ?? "Alabaster"}, ${paint?.id ?? null},
    ${doorStyle.id}, ${"prefinished_maple_ply"}, ${0}, ${`${JOB_NUMBER}-01`}, ${42}
  )
`;

// The base door front. Its material is derived from finish type + species +
// colour (lib/door-material.ts), which is why those three are set above.
await sql`
  INSERT INTO finish_group_door_fronts (id, finish_group_id, role, slot_label, style_id, sort_order)
  VALUES (${uid()}, ${fgId}, ${"base_door"}, ${"Base doors"}, ${doorStyle.id}, ${0})
`;

// Hinges, drawer box and slides: the ACC standards, which the app seeds itself
// when a group is created through the form.
const { ACC_STANDARD_HINGE, ACC_STANDARD_DRAWER_SLIDE } = await import("../lib/acc-standards.ts");
await sql`
  INSERT INTO finish_group_hardware (id, finish_group_id, role, slot_label, hardware_id, sort_order)
  VALUES (${uid()}, ${fgId}, ${"hinges"}, ${"Hinges"}, ${ACC_STANDARD_HINGE}, ${0})
`;
await sql`
  INSERT INTO finish_group_drawers (id, finish_group_id, role, slot_label, drawer_box_id, slides_id, sort_order)
  VALUES (${uid()}, ${fgId}, ${"drawer_box"}, ${"Drawer boxes"}, ${"DB-ACC-STD"}, ${ACC_STANDARD_DRAWER_SLIDE}, ${0})
`;

/* ───────────────────────── rooms + accessories ──────────────────── */

const roomId = uid();
await sql`
  INSERT INTO rooms (id, spec_id, name, finish_group_id, sort_order, flooring, ceiling_height, soffit, backsplash)
  VALUES (${roomId}, ${specId}, ${"Kitchen"}, ${fgId}, ${0}, ${"LVP"}, ${"9'-0\""}, ${"none"}, ${"tile to uppers"})
`;

// accessories_catalog.active is a real BOOLEAN, unlike the INTEGER flags
// elsewhere in this schema — `active = 1` is a type error here, and it used
// to be swallowed by a catch that made the catalog look empty.
const accessories = await sql`SELECT id FROM accessories_catalog WHERE active ORDER BY id LIMIT 3`;
for (const [i, acc] of accessories.entries()) {
  await sql`
    INSERT INTO room_accessories (id, room_id, acc_id, qty, notes)
    VALUES (${uid()}, ${roomId}, ${acc.id}, ${i + 1}, ${"seeded"})
  `;
}

/* ─────────────────────────── the drawing ────────────────────────── */

const fixture = resolve(process.env.TEST_FIXTURE_PDF || "test-fixtures/ACC-test-drawings.pdf");
let drawingNote = "no drawing (fixture missing — run scripts/make-test-fixtures.mjs)";
if (existsSync(fixture)) {
  const bytes = readFileSync(fixture);
  const path = `${JOB_ID}/02 DRAWINGS/ACC-test-drawings.pdf`;
  const up = await fileStore().upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (up.error) {
    drawingNote = `drawing upload failed: ${up.error.message}`;
  } else {
    await sql`DELETE FROM job_files WHERE job_id = ${JOB_ID} AND storage_path = ${path}`;
    await sql`
      INSERT INTO job_files (id, job_id, kind, filename, storage_path, size, uploaded_at, uploaded_by)
      VALUES (${uid()}, ${JOB_ID}, ${"drawings"}, ${"ACC-test-drawings.pdf"}, ${path}, ${bytes.length}, ${now()}, ${"seed script"})
    `;
    drawingNote = `${(bytes.length / 1024).toFixed(0)} KB at ${path}`;
  }
}

/* ──────────────────────────── report ────────────────────────────── */

const base = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
console.log(`
Seeded a complete job.

  internal id    ${JOB_ID}
  job number     ${JOB_NUMBER}
  client         Test Client, 1425 Test Harbor Lane, Coeur d'Alene ID
  builder        Test Builder Co
  spec           ${specId}  (DRAFT)
  finish group   Kitchen Perimeter — paint, ${doorStyle.name ?? doorStyle.id}
  rooms          Kitchen, ${accessories.length} accessor${accessories.length === 1 ? "y" : "ies"}
  drawing        ${drawingNote}

  job page       ${base}/jobs/${JOB_NUMBER}
  spec form      ${base}/jobs/${JOB_NUMBER}/residential
  pipeline       ${base}/pipeline

  remove it      node scripts/seed-test-job.mjs --job-number ${JOB_NUMBER} --drop
`);

await sql.end();
