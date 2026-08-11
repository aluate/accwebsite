#!/usr/bin/env node
/**
 * test-door-front-save.mjs — persisting callout rows must not destroy anything.
 *
 * The save route rebuilds most child tables wholesale, which is safe when the UI owns
 * every column. finish_group_door_fronts is not like that: it also carries
 * material_id, oe_id, ie_id, panel_id, grain, vendor and notes, and the builder UI
 * edits none of them. A wholesale rebuild would blank all seven on the first save —
 * silently, on rows a PM may have filled in from the old Schedules tab.
 *
 * So rows are upserted by id and removals are explicit. Most of what follows asserts
 * what is NOT lost and what CANNOT be reached:
 *
 *   - an untouched column survives an edit to a row's role or style
 *   - a row absent from the payload is NOT deleted (only an explicit id is)
 *   - a delete cannot escape this spec, even with a valid id from another one
 *   - the base row cannot be deleted, because the release gate needs it
 *   - an omitted `door_fronts` key leaves every existing row alone
 *
 * This exercises the route's logic against a real database rather than over HTTP, so
 * it needs no server and no session. The auth guard is covered by check-route-auth.
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/test-door-front-save.mjs
 */
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { ROLE_BASE, ROLE_DRAWER_FRONT, ROLE_APPLIED_END, isDoorFrontRole } from "../lib/door-front-roles.ts";

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

async function fixture() {
  const jobId = "dfs-job-" + uid(), specId = "dfs-spec-" + uid(), fgId = "dfs-fg-" + uid();
  made.push(jobId);
  const now = new Date().toISOString();
  await sql`INSERT INTO jobs (id, created_at, client_name, site_address, job_number)
            VALUES (${jobId}, ${now}, 'DF Save Test', '1 Save St', ${"S" + uid().slice(0, 5)})`;
  await sql`INSERT INTO residential_specs (id, job_id, created_at, updated_at)
            VALUES (${specId}, ${jobId}, ${now}, ${now})`;
  await sql`INSERT INTO finish_groups (id, spec_id, label, finish_type, sort_order, door_style_id)
            VALUES (${fgId}, ${specId}, 'PNT-1', 'paint', 0, 'DS-CD-116')`;
  return { jobId, specId, fgId };
}

/**
 * The route's door-front logic, transcribed. Kept deliberately close to
 * app/api/specs/[id]/save/route.ts so a divergence shows up as a test failure
 * rather than as a passing test of code nobody runs.
 */
async function save(specId, fgIds, body) {
  const clientSentDoorFronts = "door_fronts" in body;

  if (clientSentDoorFronts) {
    const toDelete = (body.door_fronts_deleted ?? []).filter((x) => typeof x === "string" && x);
    if (toDelete.length > 0) {
      await sql`
        DELETE FROM finish_group_door_fronts
        WHERE id IN ${sql(toDelete)}
          AND role <> ${ROLE_BASE}
          AND finish_group_id IN (SELECT id FROM finish_groups WHERE spec_id = ${specId})
      `;
    }
  }

  for (const fgId of fgIds) {
    const [g] = await sql`SELECT door_style_id FROM finish_groups WHERE id = ${fgId}`;
    if (g?.door_style_id) {
      const cnt = await sql`
        SELECT COUNT(*) AS c FROM finish_group_door_fronts
        WHERE finish_group_id = ${fgId} AND role = ${ROLE_BASE}
      `;
      if (Number(cnt[0].c) === 0) {
        await sql`
          INSERT INTO finish_group_door_fronts (id, finish_group_id, role, style_id, sort_order)
          VALUES (${"b-" + uid()}, ${fgId}, ${ROLE_BASE}, ${g.door_style_id}, 0)
        `;
      }
    }
    if (!clientSentDoorFronts) continue;
    const rows = (body.door_fronts ?? []).filter((r) => r.finish_group_id === fgId);
    for (const [i, r] of rows.entries()) {
      if (!isDoorFrontRole(r.role)) continue;
      const styleId = r.style_id?.trim() || null;
      const slot = r.slot_label?.trim() || null;
      const existing = await sql`
        SELECT id FROM finish_group_door_fronts WHERE id = ${r.id} AND finish_group_id = ${fgId}
      `;
      if (existing.length > 0) {
        await sql`
          UPDATE finish_group_door_fronts
          SET role = ${r.role}, slot_label = ${slot}, style_id = ${styleId}, sort_order = ${i + 1}
          WHERE id = ${r.id}
        `;
      } else {
        await sql`
          INSERT INTO finish_group_door_fronts (id, finish_group_id, role, slot_label, style_id, sort_order)
          VALUES (${r.id}, ${fgId}, ${r.role}, ${slot}, ${styleId}, ${i + 1})
        `;
      }
    }
  }
}

const rowsOf = (fgId) =>
  sql`SELECT * FROM finish_group_door_fronts WHERE finish_group_id = ${fgId} ORDER BY sort_order`;

async function main() {
  console.log("\nthe base row is seeded once, per role\n");
  {
    const { specId, fgId } = await fixture();
    await save(specId, [fgId], {});
    let rows = await rowsOf(fgId);
    check("a base row is seeded from the Door Style dropdown",
          rows.length === 1 && rows[0].role === ROLE_BASE && rows[0].style_id === "DS-CD-116",
          JSON.stringify(rows.map((r) => [r.role, r.style_id])));

    await save(specId, [fgId], {});
    rows = await rowsOf(fgId);
    check("saving twice does not seed a second base row", rows.length === 1, `${rows.length} row(s)`);

    /*
      THE GUARD BUG. The count was over the whole finish group, so any other row made
      it non-zero and the base row could never be seeded — and validateForRelease()
      requires a base door style, so the spec could never reach engineering. Add a
      callout FIRST, on a group with no base row, and the base must still appear.
    */
    const { specId: s2, fgId: f2 } = await fixture();
    await sql`INSERT INTO finish_group_door_fronts (id, finish_group_id, role, slot_label, style_id, sort_order)
              VALUES (${"ae-" + uid()}, ${f2}, ${ROLE_APPLIED_END}, 'KITCHEN', 'DS-SLAB-MDF', 1)`;
    await save(s2, [f2], {});
    const r2 = await rowsOf(f2);
    check("a callout row does not stop the base row being seeded",
          r2.some((r) => r.role === ROLE_BASE),
          `roles: ${r2.map((r) => r.role).join(",")} — this is the per-role guard`);
  }

  console.log("\nupsert: an edit must not blank a column the UI does not own\n");
  {
    const { specId, fgId } = await fixture();
    await save(specId, [fgId], {});

    // A callout row carrying values only the old Schedules tab could set.
    const rowId = "df-" + uid();
    await sql`
      INSERT INTO finish_group_door_fronts
        (id, finish_group_id, role, slot_label, style_id, material_id, oe_id, ie_id, panel_id, grain, vendor, notes, sort_order)
      VALUES (${rowId}, ${fgId}, ${ROLE_DRAWER_FRONT}, '12" DRAWERS', 'DS-CD-116',
              'MAT-X', 'OE-X', 'IE-X', 'PNL-X', 'vertical', 'Acme Doors', 'do not substitute', 1)
    `;

    // The UI edits the style and the slot label only.
    await save(specId, [fgId], {
      door_fronts: [
        { id: rowId, finish_group_id: fgId, role: ROLE_DRAWER_FRONT, slot_label: '6" DRAWERS', style_id: "DS-SLAB-MDF" },
      ],
    });
    const [row] = await sql`SELECT * FROM finish_group_door_fronts WHERE id = ${rowId}`;
    check("the edited fields are written",
          row.slot_label === '6" DRAWERS' && row.style_id === "DS-SLAB-MDF",
          JSON.stringify([row.slot_label, row.style_id]));
    for (const [col, want] of [["material_id","MAT-X"],["oe_id","OE-X"],["ie_id","IE-X"],
                               ["panel_id","PNL-X"],["grain","vertical"],["vendor","Acme Doors"],
                               ["notes","do not substitute"]]) {
      check(`  ${col} survives the edit`, row[col] === want, `${row[col]} (wanted ${want})`);
    }
  }

  console.log("\nnothing is deleted unless it is named\n");
  {
    const { specId, fgId } = await fixture();
    await save(specId, [fgId], {});
    const keep = "keep-" + uid(), drop = "drop-" + uid();
    for (const [rid, slot] of [[keep, "KITCHEN"], [drop, "PANTRY"]]) {
      await sql`INSERT INTO finish_group_door_fronts (id, finish_group_id, role, slot_label, style_id, sort_order)
                VALUES (${rid}, ${fgId}, ${ROLE_APPLIED_END}, ${slot}, 'DS-SLAB-MDF', 1)`;
    }

    // A payload listing only one row must NOT delete the other.
    await save(specId, [fgId], {
      door_fronts: [{ id: keep, finish_group_id: fgId, role: ROLE_APPLIED_END, slot_label: "KITCHEN", style_id: "DS-SLAB-MDF" }],
    });
    let ids = (await rowsOf(fgId)).map((r) => r.id);
    check("a row absent from the payload is NOT deleted", ids.includes(drop),
          "absent-means-delete would wipe rows on any short payload");

    // Named explicitly, it goes.
    await save(specId, [fgId], { door_fronts: [], door_fronts_deleted: [drop] });
    ids = (await rowsOf(fgId)).map((r) => r.id);
    check("a row named in door_fronts_deleted is removed", !ids.includes(drop));
    check("and the one that was not named survives", ids.includes(keep));
  }

  console.log("\na delete cannot reach past this spec\n");
  {
    const a = await fixture();
    const b = await fixture();
    await save(a.specId, [a.fgId], {});
    await save(b.specId, [b.fgId], {});
    const victim = "victim-" + uid();
    await sql`INSERT INTO finish_group_door_fronts (id, finish_group_id, role, slot_label, style_id, sort_order)
              VALUES (${victim}, ${b.fgId}, ${ROLE_APPLIED_END}, 'OTHER SPEC', 'DS-SLAB-MDF', 1)`;

    // Spec A asks to delete a row that belongs to spec B, with a perfectly valid id.
    await save(a.specId, [a.fgId], { door_fronts: [], door_fronts_deleted: [victim] });
    const still = await sql`SELECT id FROM finish_group_door_fronts WHERE id = ${victim}`;
    check("a valid id from another spec is not deleted", still.length === 1,
          "the delete escaped its spec — any PM could remove any row by guessing an id");

    // And the base row is protected even within the right spec.
    const [base] = await sql`SELECT id FROM finish_group_door_fronts WHERE finish_group_id = ${a.fgId} AND role = ${ROLE_BASE}`;
    await save(a.specId, [a.fgId], { door_fronts: [], door_fronts_deleted: [base.id] });
    const baseStill = await sql`SELECT id FROM finish_group_door_fronts WHERE id = ${base.id}`;
    check("the base row cannot be deleted", baseStill.length === 1,
          "removing it blocks the release gate for a reason nobody can see");
  }

  console.log("\nan omitted key changes nothing\n");
  {
    const { specId, fgId } = await fixture();
    await save(specId, [fgId], {});
    const rid = "untouched-" + uid();
    await sql`INSERT INTO finish_group_door_fronts (id, finish_group_id, role, slot_label, style_id, sort_order)
              VALUES (${rid}, ${fgId}, ${ROLE_DRAWER_FRONT}, 'LEAVE ME', 'DS-CD-113', 1)`;

    // A save with no door_fronts key at all — e.g. an older client.
    await save(specId, [fgId], { door_fronts_deleted: [rid] });
    const [row] = await sql`SELECT * FROM finish_group_door_fronts WHERE id = ${rid}`;
    check("with no door_fronts key the rows are left alone",
          !!row && row.slot_label === "LEAVE ME",
          "an omitted key must mean 'this client has no UI for these', per the moldings precedent");
    check("and a delete list without the key is ignored too", !!row);
  }

  console.log("\na bad role is refused, not stored\n");
  {
    const { specId, fgId } = await fixture();
    await save(specId, [fgId], {});
    const bad = "bad-" + uid();
    await save(specId, [fgId], {
      door_fronts: [{ id: bad, finish_group_id: fgId, role: "applied_endz", slot_label: "TYPO", style_id: "DS-SLAB-MDF" }],
    });
    const rows = await sql`SELECT id FROM finish_group_door_fronts WHERE id = ${bad}`;
    check("a role outside the canonical list is not written", rows.length === 0,
          "no enum and no UNIQUE on this table, so a typo would render as a raw identifier on a client sheet");
  }

  /*
    A transcription that has drifted from the route is worse than no test: it goes on
    passing while proving something about code nobody runs. So assert that the route
    still contains the statements this file models. Coarse on purpose — it checks the
    load-bearing clauses, not formatting.
  */
  console.log("\nthe transcription above still matches the route\n");
  {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../app/api/specs/[id]/save/route.ts", import.meta.url), "utf8");
    const must = [
      ["the door_fronts key is checked with `in`",     /'door_fronts'\s+in\s+body/],
      ["the base seed guard filters on role",          /finish_group_door_fronts\s*\n?\s*WHERE finish_group_id = \$\{fgId\} AND role = \$\{ROLE_BASE\}/],
      ["rows are matched by id before writing",        /SELECT id FROM finish_group_door_fronts WHERE id = \$\{r\.id\} AND finish_group_id = \$\{fgId\}/],
      ["an existing row is UPDATEd, not replaced",     /UPDATE finish_group_door_fronts\s*\n\s*SET role =/],
      ["deletes are scoped to this spec by subquery",  /DELETE FROM finish_group_door_fronts[\s\S]{0,240}finish_group_id IN \(SELECT id FROM finish_groups WHERE spec_id = \$\{id\}\)/],
      ["deletes exclude the base row",                /DELETE FROM finish_group_door_fronts[\s\S]{0,200}role <> \$\{ROLE_BASE\}/],
      ["the role is validated before writing",        /isDoorFrontRole\(r\.role\)/],
      ["only the three UI-owned columns are written",  /SET role = \$\{r\.role\}, slot_label = \$\{slot\}, style_id = \$\{styleId\}, sort_order/],
    ];
    for (const [what, re] of must) {
      check(what, re.test(src), "the route no longer does this — update the transcription in this file");
    }
    // And the inverse: the route must NOT rebuild this table wholesale.
    check("the route does not delete every row for a finish group",
          !/DELETE FROM finish_group_door_fronts\s+WHERE finish_group_id = \$\{fgId\}/.test(src),
          "a wholesale rebuild would blank material_id, oe_id, ie_id, panel_id, grain, vendor and notes");
  }

  console.log("\nsort order follows the order the user arranged them in\n");
  {
    const { specId, fgId } = await fixture();
    await save(specId, [fgId], {});
    const one = "s1-" + uid(), two = "s2-" + uid();
    await save(specId, [fgId], {
      door_fronts: [
        { id: two, finish_group_id: fgId, role: ROLE_DRAWER_FRONT, slot_label: 'FIRST',  style_id: "DS-CD-116" },
        { id: one, finish_group_id: fgId, role: ROLE_DRAWER_FRONT, slot_label: 'SECOND', style_id: "DS-SLAB-MDF" },
      ],
    });
    const rows = (await rowsOf(fgId)).filter((r) => r.role === ROLE_DRAWER_FRONT);
    check("payload order becomes sort order",
          rows[0].slot_label === "FIRST" && rows[1].slot_label === "SECOND",
          rows.map((r) => `${r.sort_order}:${r.slot_label}`).join(" "));
    check("and the base row stays first overall",
          (await rowsOf(fgId))[0].role === ROLE_BASE,
          "the base door belongs at the top of the sheet");
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
