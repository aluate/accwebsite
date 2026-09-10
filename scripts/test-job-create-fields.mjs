#!/usr/bin/env node
/**
 * test-job-create-fields.mjs — everything the create form collects is still there
 * after the save.
 *
 * WHY THIS EXISTS.
 *
 * The Pipeline's Add Job form sent install_start_date, install_type, box_count,
 * shop_hrs and install_hrs. POST /api/jobs listed none of them in its INSERT, so
 * it wrote the job, returned 201, and dropped all five. The form had a workaround
 * for two of them — a second PATCH fired right after the create — which is why
 * shop and install hours appeared to work and the other three did not. A PM typed
 * an install date into a form, got a job back, and the date was gone.
 *
 * Nothing caught it because every existing test asks whether a function returns
 * the right value. This one asks the only question that mattered: post what the
 * form actually posts, then read the row back and see if it is all there.
 *
 * It drives the real endpoint rather than calling the route handler, because the
 * bug lived in the gap between what the client sends and what the server stores —
 * which is exactly the gap a unit test cannot see.
 *
 *   DATABASE_URL=postgres://... BASE_URL=http://127.0.0.1:3010 \
 *     SESSION_TOKEN=<builder_sessions.token> node scripts/test-job-create-fields.mjs
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
const BASE = process.env.BASE_URL;
const TOKEN = process.env.SESSION_TOKEN;
if (!url || !BASE || !TOKEN) {
  console.error("need DATABASE_URL, BASE_URL and SESSION_TOKEN");
  process.exit(1);
}
const sql = postgres(url, {
  ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require",
  prepare: false,
  max: 2,
});

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

/*
  The payload below is the Add Job form's body, field for field. If the form
  grows a field, add it here — a field the form sends and this test does not
  assert is a field that can go missing again without anyone noticing.
*/
const jobNumber = "T" + String(Date.now()).slice(-5);
const payload = {
  client_name: "Create Field Test",
  site_address: "5712 Davenport St",
  city: "Hayden",
  pm: null,
  status: "intake",
  builder_id: null,
  builder_company: "Bush Legacy",
  builder_name: "Dave B",
  install_type: "acc",
  delivery_date: "2026-11-03",
  install_start_date: "2026-11-17",
  job_number: jobNumber,
  estimated_value: 85000,
  box_count: 65,
  shop_hrs: 320,
  install_hrs: 80,
};

/** What the column should hold, given what was posted. */
const EXPECTED = {
  client_name: (p) => p.client_name,
  site_address: (p) => p.site_address,
  city: (p) => p.city,
  builder_company: (p) => p.builder_company,
  builder_name: (p) => p.builder_name,
  job_number: (p) => p.job_number,
  status: (p) => p.status,
  install_type: (p) => p.install_type,
  delivery_date: (p) => p.delivery_date,
  install_start_date: (p) => p.install_start_date,
  estimated_value: (p) => p.estimated_value,
  box_count: (p) => p.box_count,
  shop_hrs: (p) => p.shop_hrs,
  install_hrs: (p) => p.install_hrs,
};

let createdId = null;

async function main() {
  const res = await fetch(`${BASE}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `acc_builder_session=${TOKEN}` },
    body: JSON.stringify(payload),
  });
  check("POST /api/jobs returns 201", res.status === 201, `got ${res.status}`);
  if (!res.ok) return;

  const body = await res.json();
  createdId = body.id;
  check("the response carries the new job id", !!createdId);
  if (!createdId) return;

  const [row] = await sql`SELECT * FROM jobs WHERE id = ${createdId}`;
  check("the job row exists", !!row);
  if (!row) return;

  /*
    One assertion per field, named after the field, so a failure says which
    value was lost rather than "the job did not match".
  */
  for (const [col, expected] of Object.entries(EXPECTED)) {
    const want = expected(payload);
    const got = row[col];
    // NUMERIC comes back from Postgres as a string with its scale ("85000.00"),
    // so a number is compared as a number. Everything else compares as text.
    const same = want === null || want === undefined
      ? got === null || got === undefined || got === ""
      : typeof want === "number"
        ? Number(got) === want
        : String(got) === String(want);
    check(`${col} survives the save`, same, `sent ${JSON.stringify(want)}, stored ${JSON.stringify(got)}`);
  }

  // A job with no client name is a spec home, listed by its address. The create
  // route must accept that rather than storing an empty row.
  const specHomeNumber = "S" + String(Date.now()).slice(-5);
  const res2 = await fetch(`${BASE}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `acc_builder_session=${TOKEN}` },
    body: JSON.stringify({ ...payload, client_name: "", job_number: specHomeNumber }),
  });
  const body2 = res2.ok ? await res2.json() : null;
  check("a spec home with no client name still saves its address", !!body2?.id);
  if (body2?.id) {
    const [row2] = await sql`SELECT site_address FROM jobs WHERE id = ${body2.id}`;
    check("the spec home's address is stored", row2?.site_address === payload.site_address,
      `stored ${JSON.stringify(row2?.site_address)}`);
    await sql`DELETE FROM jobs WHERE id = ${body2.id}`;
  }
}

main()
  .catch((e) => { fail++; console.log(`  FAIL threw -> ${e.message}`); })
  .finally(async () => {
    if (createdId) await sql`DELETE FROM jobs WHERE id = ${createdId}`.catch(() => {});
    await sql.end();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  });
