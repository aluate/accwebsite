#!/usr/bin/env node
/**
 * test-engineering-autocheck.mjs — which checklist items the app can prove.
 *
 * Needs DATABASE_URL. No server.
 *
 * WHY. The engineering release checklist is 54 items and the gate wants every
 * one of them checked. The point of auto-checking is that a PM should not be
 * hand-ticking things the spec already says — and should be left to think about
 * the ones only a person can answer.
 *
 * Two of the rules were reading columns nothing writes any more, so they could
 * never come true. The three pull items keyed off finish_groups.pull_id, a dead
 * column, while every pull a PM enters goes into finish_group_pulls. So a spec
 * with pulls fully specified still showed three unchecked boxes and the only way
 * past them was to tick them by hand, which is exactly the "it thinks it isn't
 * done" this checklist is supposed to prevent.
 *
 * The other half of the rule matters just as much: an item with no data behind
 * it must NOT auto-check. Pull size has no column, so it stays a person's job,
 * and the assertions below hold that line.
 */
import postgres from "postgres";
import { requireTestDatabase, isLocal as isLocalDb } from "./test-db.mjs";
import { randomBytes } from "node:crypto";
import { computeAutoChecked } from "../lib/engineering-autocheck.ts";
import { allKeys } from "../lib/engineering-release-checklist.ts";

const url = requireTestDatabase("the engineering autocheck suite");
const sql = postgres(url, { ssl: isLocalDb(url) ? false : "require", prepare: false, max: 2 });
const uid = () => randomBytes(6).toString("hex");

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

const jobId = "ac-job-" + uid();
const specId = "ac-spec-" + uid();
const fgId = "ac-fg-" + uid();
const roomId = "ac-room-" + uid();

try {
  const now = new Date().toISOString();
  await sql`INSERT INTO jobs (id, created_at, client_name, site_address, delivery_date, install_type)
            VALUES (${jobId}, ${now}, 'Autocheck Test', '1 Test St', '2026-11-03', 'acc')`;
  await sql`INSERT INTO residential_specs (id, job_id, created_at, updated_at)
            VALUES (${specId}, ${jobId}, ${now}, ${now})`;
  await sql`INSERT INTO finish_groups
              (id, spec_id, label, finish_type, sort_order, carcass_id, drawer_box_id,
               color_id, edgeband_id, sheen_id, grain_orientation, door_style_id)
            VALUES (${fgId}, ${specId}, 'MEL-1', 'melamine', 0, 'CAR-001', 'DBX-001',
                    'MEL-EGG-045', 'EB-001', 'SHN-001', 'horizontal', 'DS-SLAB-MDF')`;
  await sql`INSERT INTO rooms (id, spec_id, name, sort_order) VALUES (${roomId}, ${specId}, 'KITCHEN', 0)`;

  console.log("\nbefore any pulls, trim or accessories are entered\n");
  {
    const a = await computeAutoChecked(jobId);
    check("pulls are not claimed as specified", !a.pulls_brand && !a.pulls_finish && !a.pulls_qty,
      JSON.stringify({ b: a.pulls_brand, f: a.pulls_finish, q: a.pulls_qty }));
    check("no molding footage means no molding items", !a.toe_skin && !a.crown && !a.fillers && !a.light_rail);
    check("no accessories means Rev-a-Shelf is unchecked", !a.rev_a_shelf);
    check("the ship date the job carries is already known", a.ship_date_known === true);
    check("...and counts for the release message item too", a.ship_date_in_msg === true);
    check("who is installing is known from the job", a.installer_stated === true);
    check("the finish and sheen on the group count", a.finish_spec === true && a.sheen_spec === true);
    check("a melamine group with grain noted satisfies the slab item", a.slab_grain === true);
  }

  console.log("\nwith the pulls a PM actually enters\n");
  await sql`INSERT INTO finish_group_pulls (id, finish_group_id, description, part_no, finish_color, qty, sort_order)
            VALUES (${uid()}, ${fgId}, 'Bar pull 3in', 'BP-3', 'Matte Black', 24, 0)`;
  {
    const a = await computeAutoChecked(jobId);
    check("brand / spec ticks itself", a.pulls_brand === true,
      "this is the one that could never come true — it read the dead pull_id column");
    check("finish ticks itself", a.pulls_finish === true);
    check("quantity ticks itself", a.pulls_qty === true);
    check("SIZE does not — there is no column to prove it", !a.pulls_size,
      "auto-checking an item with no data behind it is worse than leaving it to the PM");
  }

  console.log("\nmoldings only count once they carry footage\n");
  await sql`INSERT INTO room_trim (id, room_id, trim_type, size_desc, material, qty_lf, sort_order, source)
            VALUES (${uid()}, ${roomId}, 'Toe Skin', '3/4 x 4.5', 'Melamine', 42, 0, 'manual')`;
  await sql`INSERT INTO room_trim (id, room_id, trim_type, size_desc, material, qty_lf, sort_order, source)
            VALUES (${uid()}, ${roomId}, 'Crown Molding', '3in', 'Maple', 0, 1, 'manual')`;
  {
    const a = await computeAutoChecked(jobId);
    check("toe skin with 42 lf ticks", a.toe_skin === true);
    check("crown with no footage does NOT tick", !a.crown,
      "the section is titled 'with Linear Footage & Material Designation'");
    check("a type nobody entered stays unticked", !a.light_rail);
  }

  console.log("\naccessories\n");
  await sql`INSERT INTO room_accessories (id, room_id, acc_id, qty) VALUES (${uid()}, ${roomId}, 'ACC-001', 2)`;
  {
    const a = await computeAutoChecked(jobId);
    check("an accessory with a quantity ticks Rev-a-Shelf", a.rev_a_shelf === true);
  }

  console.log("\nthe grain rule only applies to slab doors\n");
  await sql`UPDATE finish_groups SET grain_orientation = NULL WHERE id = ${fgId}`;
  {
    const a = await computeAutoChecked(jobId);
    check("a slab group with no grain noted does NOT tick", !a.slab_grain);
  }
  await sql`UPDATE finish_groups SET finish_type = 'paint', door_style_id = 'DS-SHAKER-1' WHERE id = ${fgId}`;
  {
    const a = await computeAutoChecked(jobId);
    check("a five-piece group is not asked about grain at all", !a.slab_grain,
      "unchecked here is right — there is no slab to note grain for, so the PM confirms it");
  }

  console.log("\nevery key the rules produce is a real checklist item\n");
  {
    const a = await computeAutoChecked(jobId);
    const keys = new Set(allKeys());
    const strays = Object.keys(a).filter((k) => !keys.has(k));
    check("no rule sets a key the checklist does not have", strays.length === 0, strays.join(", "));
    const autoCount = Object.keys(a).length;
    check("the rules cover a meaningful share of the 54 items", autoCount >= 20, `${autoCount} keys`);
    console.log(`\n  ${autoCount} of ${keys.size} items can auto-check; ${keys.size - autoCount} are a person's job\n`);
  }
} catch (e) {
  fail++;
  console.log(`  FAIL threw -> ${e.message}`);
} finally {
  await sql`DELETE FROM jobs WHERE id = ${jobId}`.catch(() => {});
  await sql.end({ timeout: 5 });
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
