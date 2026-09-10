#!/usr/bin/env node
/**
 * test-melamine-release.mjs — a melamine spec can actually reach engineering.
 *
 * WHY. Karl: "everything required is filled, but because of some defaults
 * (melamine has to be slab door, so it thinks no door style was selected) it
 * thinks it's not done. That's why I can't email it to release it to eng."
 *
 * Exactly that. The form filtered the door style list to slab for melamine and
 * cleared whatever was there, so door_style_id stayed empty; the save route
 * seeds the base door-front row only when door_style_id is set; and
 * validateForRelease() refuses the release when the base row has no style. A
 * complete-looking melamine spec could never be released, and nothing in the
 * message said the door style had been emptied on the PM's behalf.
 *
 * This drives the real save endpoint and the real lifecycle endpoint, because
 * the failure lived in the seam between them — the form's rule, the save
 * route's guard and the gate's requirement each looked correct alone.
 *
 *   DATABASE_URL=postgres://... BASE_URL=http://127.0.0.1:3010 \
 *     SESSION_TOKEN=<builder_sessions.token> node --import tsx scripts/test-melamine-release.mjs
 */
import postgres from "postgres";
import { randomBytes } from "node:crypto";

const url = process.env.DATABASE_URL, BASE = process.env.BASE_URL, TOKEN = process.env.SESSION_TOKEN;
if (!url || !BASE || !TOKEN) { console.error("need DATABASE_URL, BASE_URL and SESSION_TOKEN"); process.exit(1); }
const sql = postgres(url, { ssl: url.includes("127.0.0.1") || url.includes("localhost") ? false : "require", prepare: false, max: 2 });
const uid = () => randomBytes(6).toString("hex");

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};
const api = (path, method, body) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: `acc_builder_session=${TOKEN}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const jobId = "mel-job-" + uid();
let specId = null;

try {
  const now = new Date().toISOString();
  await sql`INSERT INTO jobs (id, created_at, client_name, site_address, job_number)
            VALUES (${jobId}, ${now}, 'Melamine Release Test', '1 Slab Way', ${"M" + uid().slice(0, 4)})`;

  const specRes = await api("/api/specs", "POST", { job_id: jobId, name: "Melamine spec" });
  check("spec created", specRes.ok, `${specRes.status}`);
  specId = (await specRes.json()).id;

  /*
    The payload a PM produces by choosing "Melamine / TFL" and never touching
    the door style — which, before this fix, is what the form left them with.
  */
  const fgId = "mel-fg-" + uid();
  const roomId = "mel-room-" + uid();
  const saveRes = await api(`/api/specs/${specId}/save`, "POST", {
    finish_groups: [{
      id: fgId, label: "MEL-1", finish_type: "melamine",
      color_id: "MEL-EGG-045", color_name: "Valenti Walnut",
      carcass_id: "CAR-001", drawer_box_id: "DBX-001",
      door_style_id: "",            // <- the empty field the form used to leave behind
      sort_order: 0,
    }],
    rooms: [{ id: roomId, name: "KITCHEN", finishes: [{ finish_group_id: fgId }], sort_order: 0 }],
  });
  check("the spec saves", saveRes.ok, `${saveRes.status} ${(await saveRes.clone().text()).slice(0, 200)}`);

  const doorRows = await sql`
    SELECT role, style_id FROM finish_group_door_fronts WHERE finish_group_id = ${fgId}
  `;
  const base = doorRows.find((r) => r.role === "base");
  check("a base door-front row exists after the save", !!base,
    "no base row means the release gate will refuse it for 'base door style'");
  check("and it carries the slab style, not an empty one", !!base?.style_id, JSON.stringify(base));
  check("the style it carries is a real slab", base?.style_id === "DS-SLAB-MDF", String(base?.style_id));

  // Now walk it to the gate. DRAFT -> CLIENT_APPROVED -> RELEASED_TO_ENG.
  const t1 = await api(`/api/specs/${specId}/lifecycle`, "POST", { to: "CLIENT_APPROVED" });
  check("client approval goes through", t1.ok, `${t1.status} ${(await t1.clone().text()).slice(0, 200)}`);

  const t2 = await api(`/api/specs/${specId}/lifecycle`, "POST", { to: "RELEASED_TO_ENG" });
  const t2body = await t2.clone().text();
  check("release to engineering is NOT refused for a missing base door style",
    !/base door style/i.test(t2body), t2body.slice(0, 240));

  /*
    The gate legitimately wants drawer slides and hinges too, and those are
    seeded from the ACC standards on save. If it refuses at all now, it should
    only be for something other than the door style — and on a spec this
    complete it should not refuse at all.
  */
  check("release to engineering is accepted", t2.ok, `${t2.status} ${t2body.slice(0, 240)}`);

  const [after] = await sql`SELECT lifecycle_state FROM residential_specs WHERE id = ${specId}`;
  check("the spec is now RELEASED_TO_ENG", after?.lifecycle_state === "RELEASED_TO_ENG", String(after?.lifecycle_state));

  /*
    The other direction, so this test can never pass for the wrong reason: take
    the base door row away and the gate must refuse, naming the door style.
    That refusal is exactly what a melamine spec used to hit every time, and it
    is what proves the assertions above are testing the thing they claim to.
  */
  {
    const specId2 = (await (await api("/api/specs", "POST", { job_id: jobId, name: "Control spec" })).json()).id;
    const fg2 = "mel-fg-" + uid(), room2 = "mel-room-" + uid();
    await api(`/api/specs/${specId2}/save`, "POST", {
      finish_groups: [{
        id: fg2, label: "MEL-2", finish_type: "melamine",
        color_id: "MEL-EGG-045", color_name: "Valenti Walnut",
        carcass_id: "CAR-001", drawer_box_id: "DBX-001", door_style_id: "", sort_order: 0,
      }],
      rooms: [{ id: room2, name: "BATH", finishes: [{ finish_group_id: fg2 }], sort_order: 0 }],
    });
    await sql`DELETE FROM finish_group_door_fronts WHERE finish_group_id = ${fg2}`;
    await api(`/api/specs/${specId2}/lifecycle`, "POST", { to: "CLIENT_APPROVED" });
    const refused = await api(`/api/specs/${specId2}/lifecycle`, "POST", { to: "RELEASED_TO_ENG" });
    const body = await refused.text();
    check("without a door-front row the gate DOES refuse", !refused.ok, `${refused.status}`);
    check("...and says door fronts, in terms of a screen that exists",
      /door front/i.test(body) && /finishes tab/i.test(body),
      `the message sent the PM to the Schedules tab, which is imported nowhere: ${body.slice(0, 200)}`);
  }
} catch (e) {
  fail++;
  console.log(`  FAIL threw -> ${e.message}`);
} finally {
  await sql`DELETE FROM jobs WHERE id = ${jobId}`.catch(() => {});
  await sql.end({ timeout: 5 });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
