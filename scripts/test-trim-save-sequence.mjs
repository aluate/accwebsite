#!/usr/bin/env node
/**
 * test-trim-save-sequence.mjs — trim survives the form's actual save sequence.
 *
 * WHY THIS EXISTS, AND WHY THE LAST TESTS MISSED THE BUG.
 *
 * scripts/test-trim-propagate.mjs proves propagateTrimDefaults() works. It does.
 * The bug was never in that function — it was in the ORDER the spec form calls
 * things, which no unit test touched:
 *
 *   saveAll() fired, inside ONE Promise.all:
 *     POST /api/specs/[id]/trim          per room, with this form's trim array
 *     POST /api/specs/[id]/trim-defaults per finish group, which PROPAGATES
 *
 *   /trim did `DELETE FROM room_trim WHERE room_id = ...` then re-inserted the
 *   payload. The form never refetches after a save, so its array stayed empty —
 *   it has no idea the server just propagated rows onto those rooms. So:
 *
 *     - the two requests raced, and trim appeared or vanished on network timing
 *     - and every later save posted an empty list and wiped the propagated rows
 *
 *   Karl: "THE TRIM STILL ISN'T PULLING WHEN I'VE ADDED IT TO THE FG AND NOW MOVE
 *   TO THE ROOM LIST." A function-level test cannot see any of that.
 *
 * So this test drives the REAL HTTP endpoints, in the real order, against a real
 * server — including the empty-list save that used to destroy everything.
 *
 *   DATABASE_URL=postgres://... BASE_URL=http://127.0.0.1:3130 \
 *     SESSION_TOKEN=<builder_sessions.token> npx tsx scripts/test-trim-save-sequence.mjs
 */
import postgres from "postgres";
import { randomBytes } from "node:crypto";

const url = process.env.DATABASE_URL;
const BASE = process.env.BASE_URL;
const TOKEN = process.env.SESSION_TOKEN;
if (!url || !BASE || !TOKEN) {
  console.error("need DATABASE_URL, BASE_URL and SESSION_TOKEN");
  process.exit(1);
}
const sql = postgres(url, { ssl: false, prepare: false, max: 2 });
const uid = () => randomBytes(6).toString("hex");

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

const made = [];
const api = (path, body) =>
  fetch(`${BASE}/api/specs/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Cookie: `acc_builder_session=${TOKEN}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function fixture() {
  const jobId = "tss-job-" + uid(), specId = "tss-spec-" + uid();
  const fgId = "tss-fg-" + uid(), roomId = "tss-room-" + uid();
  made.push(jobId);
  const now = new Date().toISOString();
  await sql`INSERT INTO jobs (id, created_at, client_name, site_address, job_number)
            VALUES (${jobId}, ${now}, 'Trim Sequence Test', '1 Trim St', ${"T" + uid().slice(0, 5)})`;
  await sql`INSERT INTO residential_specs (id, job_id, created_at, updated_at)
            VALUES (${specId}, ${jobId}, ${now}, ${now})`;
  await sql`INSERT INTO finish_groups (id, spec_id, label, finish_type, sort_order, species, door_style_id, carcass_id, drawer_box_id)
            VALUES (${fgId}, ${specId}, 'PNT-1', 'paint', 0, 'Poplar', 'DS-CD-116', 'CAR-002', 'DBX-001')`;
  await sql`INSERT INTO rooms (id, spec_id, name, finish_group_id, sort_order)
            VALUES (${roomId}, ${specId}, 'KITCHEN', ${fgId}, 0)`;
  await sql`INSERT INTO room_finishes (id, room_id, finish_group_id, sort_order)
            VALUES (${uid()}, ${roomId}, ${fgId}, 0)`;
  return { jobId, specId, fgId, roomId };
}

const trimOf = (roomId) =>
  sql`SELECT id, trim_type, size_desc, material, source FROM room_trim WHERE room_id = ${roomId} ORDER BY sort_order`;

/** The form's save sequence, in the order components/ResidentialSpecClient.tsx runs it. */
async function saveAll(specId, rooms, groups, trimDefaults) {
  for (const r of rooms) {
    await api(`${specId}/trim`, {
      room_id: r.id,
      trim: r.trim ?? [],
      known_ids: (r.trim ?? []).map((t) => t.id).filter(Boolean),
    });
  }
  for (const g of groups) {
    await api(`${specId}/trim-defaults`, {
      finish_group_id: g.id,
      trim_defaults: trimDefaults.filter((d) => d.finish_group_id === g.id),
    });
  }
  const res = await api(`${specId}/trim`);
  const { trim } = await res.json();
  return trim ?? {};
}

async function main() {
  console.log("\nKarl's exact flow: add trim to the finish group, then look at the rooms\n");
  {
    const { specId, fgId, roomId } = await fixture();

    // A PM fills in trim defaults on the finish group. The room has no trim yet.
    const defaults = [
      { id: "td-" + uid(), finish_group_id: fgId, trim_type: "Filler",        species_material: "Paint Grade PNT-1", size_desc: '2.5" × 2.5"', notes: null, sort_order: 0 },
      { id: "td-" + uid(), finish_group_id: fgId, trim_type: "Toe Skin",      species_material: "Paint Grade PNT-1", size_desc: '.75" × 4.5"', notes: null, sort_order: 1 },
    ];
    const byRoom = await saveAll(specId, [{ id: roomId, trim: [] }], [{ id: fgId }], defaults);

    const rows = await trimOf(roomId);
    check("finish-group trim reaches the room on the FIRST save", rows.length === 2,
          `${rows.length} row(s): ${rows.map((r) => r.trim_type).join(",") || "(none)"}`);
    check("the sizes come with it",
          rows.some((r) => r.size_desc === '2.5" × 2.5"') && rows.some((r) => r.size_desc === '.75" × 4.5"'),
          rows.map((r) => `${r.trim_type}=${r.size_desc}`).join(" | "));
    check("and the species", rows.every((r) => r.material === "Paint Grade PNT-1"),
          rows.map((r) => r.material).join(" | "));
    check("they are marked as defaults, not hand-typed",
          rows.every((r) => r.source === "fg_default"), rows.map((r) => r.source).join(","));

    // THE REGRESSION. The refetch is what the form now does; without it the form's
    // trim array stays empty and the next save wipes everything.
    check("the refetch hands the rows back to the form",
          (byRoom[roomId] ?? []).length === 2, `${(byRoom[roomId] ?? []).length} row(s) returned`);

    // Save again with what the refetch gave us. Nothing should be lost.
    const informed = byRoom[roomId] ?? [];
    await saveAll(specId, [{ id: roomId, trim: informed }], [{ id: fgId }], defaults);
    const after = await trimOf(roomId);
    check("saving again does not lose them", after.length === 2, `${after.length} row(s)`);
  }

  console.log("\nthe destructive case: a form that never saw the propagated rows\n");
  {
    const { specId, fgId, roomId } = await fixture();
    const defaults = [
      { id: "td-" + uid(), finish_group_id: fgId, trim_type: "Light Rail", species_material: "Paint Grade PNT-1", size_desc: '.75" × 2"', notes: null, sort_order: 0 },
    ];
    await saveAll(specId, [{ id: roomId, trim: [] }], [{ id: fgId }], defaults);
    check("the row is there to begin with", (await trimOf(roomId)).length === 1);

    /*
      Now a save from a STALE form: empty trim, and — crucially — empty known_ids,
      because it never loaded the propagated row. This is the exact request that used
      to wipe it. It must not.
    */
    await api(`${specId}/trim`, { room_id: roomId, trim: [], known_ids: [] });
    const survived = await trimOf(roomId);
    check("a stale save does NOT wipe the propagated row", survived.length === 1,
          `${survived.length} row(s) — this is the bug that made trim never stick`);

    // A legacy caller that sends no known_ids at all gets the same protection.
    await api(`${specId}/trim`, { room_id: roomId, trim: [] });
    check("a caller with no known_ids at all also cannot wipe it",
          (await trimOf(roomId)).length === 1);
  }

  console.log("\nwhat must still work: the PM is in charge of their own rows\n");
  {
    const { specId, fgId, roomId } = await fixture();
    const defaults = [
      { id: "td-" + uid(), finish_group_id: fgId, trim_type: "Filler", species_material: "Paint Grade PNT-1", size_desc: '2.5" × 2.5"', notes: null, sort_order: 0 },
    ];
    let byRoom = await saveAll(specId, [{ id: roomId, trim: [] }], [{ id: fgId }], defaults);
    const rows = byRoom[roomId] ?? [];
    check("one propagated row to work with", rows.length === 1);

    // The PM types a length onto it. An informed save must persist the edit.
    const edited = rows.map((r) => ({ ...r, qty_lf: 24 }));
    await api(`${specId}/trim`, { room_id: roomId, trim: edited, known_ids: rows.map((r) => r.id) });
    const [afterEdit] = await sql`SELECT qty_lf FROM room_trim WHERE room_id = ${roomId}`;
    check("an edit to a propagated row sticks", Number(afterEdit?.qty_lf) === 24, String(afterEdit?.qty_lf));

    // And an informed DELETE must work: listed in known_ids, absent from trim.
    await api(`${specId}/trim`, { room_id: roomId, trim: [], known_ids: rows.map((r) => r.id) });
    check("an informed delete removes it", (await trimOf(roomId)).length === 0,
          "the PM must be able to delete a row they can see");

    // A hand-added manual row survives a later propagation and is not duplicated.
    const manualId = "man-" + uid();
    await api(`${specId}/trim`, {
      room_id: roomId,
      trim: [{ id: manualId, trim_type: "Scribe Molding", size_desc: '1"', material: "Poplar", qty_lf: 10, notes: null, source: "manual", sort_order: 0 }],
      known_ids: [],
    });
    byRoom = await saveAll(specId, [{ id: roomId, trim: [] }], [{ id: fgId }], defaults);
    const mixed = await trimOf(roomId);
    check("a hand-typed row survives propagation", mixed.some((r) => r.id === manualId), mixed.map((r) => r.trim_type).join(","));
    check("and the default comes back alongside it", mixed.some((r) => r.source === "fg_default"), mixed.map((r) => `${r.trim_type}:${r.source}`).join(" | "));
    check("nothing is duplicated", mixed.length === 2, `${mixed.length} row(s): ${mixed.map((r) => r.trim_type).join(",")}`);
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
