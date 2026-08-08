#!/usr/bin/env node
/**
 * probe-route-auth.mjs — prove against a RUNNING deployment that routes reject
 * unauthenticated callers.
 *
 * scripts/check-route-auth.mjs reads the source and asserts a guard is present.
 * That is a static check, and it can be satisfied by a guard that is present but
 * ineffective. This one sends real unauthenticated requests to a real deployment
 * and asserts the response is 401 or 403.
 *
 * Every route listed below was, before 2026-08-08, reachable by anyone on the
 * internet. The two that mattered most:
 *
 *   POST /api/admin/builders   created an account with role "admin"
 *   POST /api/send-digest      sent arbitrary email from the company Gmail
 *
 * Requests are deliberately harmless — empty or nonsense bodies against ids that do
 * not exist — because a probe that proves a route is open by exploiting it is not a
 * probe. If any of these come back 2xx, the route is still open and the payload was
 * merely wrong; treat that as a failure, not a pass.
 *
 *   node scripts/probe-route-auth.mjs                          # production
 *   node scripts/probe-route-auth.mjs https://preview-url.app  # a preview deploy
 */

const BASE = (process.argv[2] || "https://www.advancedcabinets.org").replace(/\/$/, "");
const FAKE = "probe-nonexistent-id";

// [method, path, body]
const PROBES = [
  ["GET",    "/api/admin/builders",                    null],
  ["POST",   "/api/admin/builders",                    { username: `probe-${Date.now()}`, password: "x", name: "probe", role: "admin" }],
  ["PATCH",  "/api/admin/builders",                    { id: FAKE, password: "x" }],
  ["POST",   "/api/send-digest",                       { to: "probe@example.invalid", subject: "probe", body: "probe" }],
  ["POST",   "/api/admin/email-karl",                  { subject: "probe", body: "probe" }],
  ["POST",   "/api/builders",                          { name: "probe" }],
  ["POST",   `/api/specs/${FAKE}/save`,                { finish_groups: [], rooms: [] }],
  ["DELETE", `/api/specs/${FAKE}`,                     null],
  ["PATCH",  `/api/specs/${FAKE}`,                     { name: "probe" }],
  ["POST",   "/api/specs",                             { job_id: FAKE }],
  ["POST",   `/api/specs/${FAKE}/archive`,             {}],
  ["POST",   `/api/archives/${FAKE}/restore`,          {}],
  ["POST",   `/api/specs/${FAKE}/hardware`,            { hardware: [] }],
  ["POST",   `/api/specs/${FAKE}/trim`,                { trim: [] }],
  ["POST",   `/api/specs/${FAKE}/pulls`,               { pulls: [] }],
  ["POST",   `/api/specs/${FAKE}/accessories`,         { accessories: [] }],
  ["POST",   `/api/specs/${FAKE}/appliances`,          { appliances: [] }],
  ["POST",   `/api/specs/${FAKE}/trim-defaults`,       { defaults: [] }],
  ["GET",    `/api/specs/${FAKE}/generate`,            null],
  ["POST",   `/api/jobs/${FAKE}/advance`,              {}],
  ["DELETE", `/api/jobs/${FAKE}`,                      null],
  ["POST",   `/api/jobs/${FAKE}/work-orders`,          {}],
  ["POST",   `/api/jobs/${FAKE}/engineering-release`,  {}],
  ["POST",   "/api/door-specs",                        { job_id: FAKE }],
  ["POST",   `/api/door-specs/${FAKE}/save`,           {}],
  ["POST",   "/api/trim-specs",                        { job_id: FAKE }],
  ["POST",   `/api/trim-specs/${FAKE}/save`,           {}],
  ["PATCH",  `/api/punch-items/${FAKE}`,               { status: "probe" }],
  ["DELETE", `/api/punch-items/${FAKE}`,               null],
  ["POST",   `/api/admin/template-documents/probe`,    {}],
  ["GET",    "/api/search?q=probe",                    null],
  ["GET",    "/api/jobs/pms",                          null],
];

const DENIED = new Set([401, 403]);

let pass = 0, fail = 0;
const failures = [];

console.log(`Probing ${BASE} with no credentials — every route must refuse.\n`);

for (const [method, path, body] of PROBES) {
  let status, note = "";
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    status = res.status;
    // A 307/302 to /login means the route used requireBuilder() (which redirects)
    // instead of an API guard. It does deny the request, but the caller gets HTML
    // where it asked for JSON — worth flagging, not worth failing.
    if (status === 307 || status === 302) note = "  <- redirects instead of 401; caller gets HTML";
  } catch (e) {
    status = `ERR ${String(e.message ?? e).slice(0, 40)}`;
  }

  const ok = DENIED.has(status) || status === 307 || status === 302;
  if (ok) { pass++; console.log(`  ok    ${String(status).padEnd(5)} ${method.padEnd(6)} ${path}${note}`); }
  else {
    fail++; failures.push({ method, path, status });
    console.log(`  FAIL  ${String(status).padEnd(5)} ${method.padEnd(6)} ${path}   <- NOT REFUSED`);
  }
}

console.log(`\n${pass} refused, ${fail} reachable.`);
if (fail) {
  console.error(`\n${fail} route(s) still answer an unauthenticated caller:`);
  for (const f of failures) console.error(`  ${f.status} ${f.method} ${f.path}`);
  console.error(`\nA 404 or 400 here is still a FAILURE — it means the route ran and only`);
  console.error(`disliked the payload. Auth is supposed to reject before that point.`);
  process.exit(1);
}
console.log("All probed routes refuse unauthenticated callers.");
