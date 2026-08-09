#!/usr/bin/env node
/**
 * test-trim-propagate.mjs — the SQL half, against a real Postgres.
 *
 * test-trim-defaults.mjs proves the rules as pure functions. This proves the writes:
 * that the UPDATE really does leave qty_lf alone, that the CHECK constraint on
 * `source` holds, and that running the same propagate twice does not duplicate rows.
 *
 * The single most important assertion in this file is that qty_lf survives. Every
 * other field here is a standard someone will correct if it is wrong. Linear feet is
 * measured, and a wrong LF looks exactly like a right one all the way to the saw.
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/test-trim-propagate.mjs
 */
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { deriveRoomTrim, retrimForFinishGroupSwap } from "../lib/trim-defaults.ts";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = postgres(url, { ssl: false, prepare: false, max: 2 });
const uid = () => randomBytes(8).toString("hex");

let pass = 0, fail = 0;
const check = (n, c, d = "") => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}${d ? "  -> " + d : ""}`); } };

const MOLDINGS = [
  { id: "MTYPE-001", display_name: "Toe Skin",      typical_size: '3/4" x 4.5"' },
  { id: "MTYPE-004", display_name: "Filler",        typical_size: '2.5" x 2.5"' },
  { id: "MTYPE-005", display_name: "Light Rail",    typical_size: '3/4" x 2"' },
  { id: "MTYPE-007", display_name: "Crown Molding", typical_size: "varies" },
];

const jobId = "job-" + uid(), specId = "spec-" + uid();
let melId, stnId, kitchenId, bathId;

async function setup() {
  const now = new Date().toISOString();
  await sql`INSERT INTO jobs (id, created_at, client_name, site_address) VALUES (${jobId}, ${now}, 'Trim Test', '0 Test')`;
  await sql`INSERT INTO residential_specs (id, job_id, created_at, updated_at) VALUES (${specId}, ${jobId}, ${now}, ${now})`;

  melId = "fg-" + uid(); stnId = "fg-" + uid();
  await sql`INSERT INTO finish_groups (id, spec_id, label, finish_type, color_name, sort_order)
            VALUES (${melId}, ${specId}, 'MEL-1', 'melamine', 'MOAB RIFT', 0)`;
  await sql`INSERT INTO finish_groups (id, spec_id, label, finish_type, species, sort_order)
            VALUES (${stnId}, ${specId}, 'STN-1', 'stain', 'White Oak - Rift', 1)`;

  for (const [i, t] of ["Filler", "Toe Skin", "Crown Molding", "Light Rail"].entries()) {
    await sql`INSERT INTO finish_group_trim_defaults (finish_group_id, trim_type, sort_order)
              VALUES (${melId}, ${t}, ${i})`;
  }
  for (const [i, t] of ["Filler", "Toe Skin"].entries()) {
    await sql`INSERT INTO finish_group_trim_defaults (finish_group_id, trim_type, sort_order)
              VALUES (${stnId}, ${t}, ${i})`;
  }

  kitchenId = "room-" + uid(); bathId = "room-" + uid();
  await sql`INSERT INTO rooms (id, spec_id, name, sort_order) VALUES (${kitchenId}, ${specId}, 'KITCHEN', 0)`;
  await sql`INSERT INTO rooms (id, spec_id, name, sort_order) VALUES (${bathId}, ${specId}, 'MASTER BATH', 1)`;
  for (const r of [kitchenId, bathId]) {
    await sql`INSERT INTO room_finishes (id, room_id, finish_group_id, sort_order) VALUES (${uid()}, ${r}, ${melId}, 0)`;
  }
}

/** Mirrors the route's write half so the SQL is what is under test. */
async function applyDerived(roomId, result) {
  for (const a of result.added) {
    await sql`INSERT INTO room_trim (id, room_id, trim_type, size_desc, material, qty_lf, notes, sort_order, source)
              VALUES (${uid()}, ${roomId}, ${a.trim_type}, ${a.size_desc}, ${a.material}, ${0}, ${a.notes}, ${a.sort_order}, ${"fg_default"})`;
  }
  for (const u of result.updated) {
    await sql`UPDATE room_trim
              SET size_desc = COALESCE(${u.size_desc ?? null}, size_desc),
                  material  = COALESCE(${u.material ?? null}, material)
              WHERE id = ${u.id}`;
  }
}

const trimOf = (roomId) => sql`SELECT id, trim_type, size_desc, material, qty_lf, source FROM room_trim WHERE room_id = ${roomId} ORDER BY sort_order`;
const fgDefsOf = (fgId) => sql`SELECT finish_group_id, trim_type, species_material, size_desc, notes, sort_order FROM finish_group_trim_defaults WHERE finish_group_id = ${fgId} ORDER BY sort_order`;
const fgOf = (fgId) => sql`SELECT id, finish_type, species, color_name FROM finish_groups WHERE id = ${fgId}`.then((r) => r[0]);

try {
  await setup();

  console.log("\n1. Propagating MEL-1 onto its rooms");
  for (const roomId of [kitchenId, bathId]) {
    const existing = await trimOf(roomId);
    await applyDerived(roomId, deriveRoomTrim({
      fg: await fgOf(melId), fgDefaults: await fgDefsOf(melId), moldingTypes: MOLDINGS, existing,
    }));
  }
  let k = await trimOf(kitchenId);
  check("kitchen received all four defaults", k.length === 4, `${k.length}`);
  check("sizes came from the catalog", k.find((r) => r.trim_type === "Filler")?.size_desc === '2.5" x 2.5"');
  check("material derived from the melamine", k.every((r) => r.material === "MOAB RIFT"));
  check("crown has no size — free entry", k.find((r) => r.trim_type === "Crown Molding")?.size_desc === null);
  check("every row landed with LF 0", k.every((r) => Number(r.qty_lf) === 0));
  check("rows are marked fg_default", k.every((r) => r.source === "fg_default"));

  console.log("\n2. PM measures, then propagate runs again");
  await sql`UPDATE room_trim SET qty_lf = 168 WHERE room_id = ${kitchenId} AND trim_type = 'Filler'`;
  await sql`UPDATE room_trim SET qty_lf = 192 WHERE room_id = ${kitchenId} AND trim_type = 'Toe Skin'`;
  await sql`UPDATE room_trim SET size_desc = 'MMW CR037', qty_lf = 48 WHERE room_id = ${kitchenId} AND trim_type = 'Crown Molding'`;

  const before = await trimOf(kitchenId);
  await applyDerived(kitchenId, deriveRoomTrim({
    fg: await fgOf(melId), fgDefaults: await fgDefsOf(melId), moldingTypes: MOLDINGS, existing: before,
  }));
  k = await trimOf(kitchenId);
  check("no duplicate rows on a second pass", k.length === 4, `${k.length}`);
  check("measured LF survived", Number(k.find((r) => r.trim_type === "Filler")?.qty_lf) === 168);
  check("the crown profile someone typed survived", k.find((r) => r.trim_type === "Crown Molding")?.size_desc === "MMW CR037");

  console.log("\n3. Kitchen swaps MEL-1 -> STN-1");
  await sql`UPDATE room_trim SET source = 'manual' WHERE room_id = ${kitchenId} AND trim_type = 'Crown Molding'`;
  await sql`DELETE FROM room_finishes WHERE room_id = ${kitchenId}`;
  await sql`INSERT INTO room_finishes (id, room_id, finish_group_id, sort_order) VALUES (${uid()}, ${kitchenId}, ${stnId}, 0)`;

  const swap = retrimForFinishGroupSwap({
    fg: await fgOf(stnId), fgDefaults: await fgDefsOf(stnId), moldingTypes: MOLDINGS,
    existing: await trimOf(kitchenId),
  });
  await applyDerived(kitchenId, swap);
  k = await trimOf(kitchenId);

  check("material re-derived to the stain species", k.every((r) => r.material === "White Oak - Rift"),
    JSON.stringify(k.map((r) => r.material)));
  check("LF survived the swap — 168 and 192 intact",
    Number(k.find((r) => r.trim_type === "Filler")?.qty_lf) === 168 &&
    Number(k.find((r) => r.trim_type === "Toe Skin")?.qty_lf) === 192);
  check("the hand-added crown kept its typed profile",
    k.find((r) => r.trim_type === "Crown Molding")?.size_desc === "MMW CR037");
  check("nothing was deleted by the swap", k.length === 4, `${k.length}`);
  check("light rail flagged for review — STN-1 does not default it",
    swap.orphaned.length === 1 && swap.orphaned[0].trim_type === "Light Rail",
    swap.orphaned.map((o) => o.trim_type).join(","));
  check("the bath, still on MEL-1, was untouched",
    (await trimOf(bathId)).every((r) => r.material === "MOAB RIFT"));

  console.log("\n4. The source column is constrained");
  let rejected = false;
  try {
    await sql`INSERT INTO room_trim (id, room_id, trim_type, qty_lf, source)
              VALUES (${uid()}, ${bathId}, 'Filler', 0, 'nonsense')`;
  } catch { rejected = true; }
  check("an invalid source is rejected by the CHECK constraint", rejected);
} catch (e) {
  console.error("\nHARNESS ERROR:", e);
  fail++;
} finally {
  await sql`DELETE FROM jobs WHERE id = ${jobId}`.catch(() => {});
  await sql.end({ timeout: 5 });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
