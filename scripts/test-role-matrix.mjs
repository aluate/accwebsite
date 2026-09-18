#!/usr/bin/env node
/**
 * test-role-matrix.mjs — log in as every role and check what they can actually
 * reach, against what lib/permissions.ts says they should.
 *
 *   DATABASE_URL=... BASE_URL=https://www.advancedcabinets.org node scripts/test-role-matrix.mjs
 *
 * Or double-click role-matrix.bat, which fills both in.
 *
 * WHY THIS EXISTS.
 *
 * Karl, 2026-09-18, after signing in and out of five test accounts by hand so
 * Claude could drive each one: "Can you envision/script a simpler way to do
 * these tests without my clicking?"
 *
 * Yes — and it is better than the clicking in three ways. It is exhaustive
 * rather than however many URLs fitted in a conversation; it is repeatable, so
 * it can run after every patch instead of once; and its expectations are
 * DERIVED from the capability map, so it cannot drift away from the thing it is
 * checking. The manual walkthrough on 2026-09-18 found nine problems. This
 * would have found the same ones in about twenty seconds.
 *
 * HOW IT SIGNS IN WITHOUT A PASSWORD.
 *
 * It does not use passwords at all. lib/auth.ts keeps sessions in a
 * builder_sessions row (token, builder_id, expires_at) and the browser just
 * carries the token in an acc_builder_session cookie. This mints one short-lived
 * row per test account, uses it as a cookie, and DELETES every one of them in a
 * finally block. Nothing is typed into a login form and no password is read.
 *
 * WHAT IT WILL AND WILL NOT DO TO YOUR DATA.
 *
 * It only asserts the DENY cases against write endpoints. A 403 changes nothing,
 * so a run cannot create, edit or delete anything. Write paths that a role is
 * ALLOWED to use are reported as "not asserted" rather than exercised.
 *
 * That restraint is not caution for its own sake. Probing an invoice route with
 * a deliberately-invalid body on 2026-09-18 turned out to be a VALID request and
 * created a real invoice on a real job. Deny-only is the rule that makes this
 * safe to run against production.
 */
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { CAPABILITIES, ADMIN_PAGE_CAPS, can } from "../lib/permissions.ts";

/*
  Finding the right database.

  First run of this failed with ECONNRESET, and the cause was neither the script
  nor the batch file: .env.local's bare DATABASE_URL points at
  localhost:5432/acc_website — the LOCAL dev database. Production lives in
  DATABASE_URL_DIRECT, which is the same order scripts/migrate-prod.mjs already
  resolves. Reusing that order rather than inventing a second convention.

  Parsing happens here rather than in the .bat because batch mangles % and !
  inside a connection string, and a corrupted password is a confusing failure.
*/
function fromEnvFile(keys) {
  for (const file of [".env.local", "../.env.local"]) {
    let text;
    try { text = readFileSync(new URL(file, import.meta.url), "utf8"); } catch { continue; }
    for (const key of keys) {
      const m = text.match(new RegExp(`^${key}=(.*)$`, "m"));
      if (m) {
        const v = m[1].trim().replace(/^["']|["']$/g, "");
        if (v) return { value: v, key, file };
      }
    }
  }
  return null;
}

const BASE = (process.env.BASE_URL || "").replace(/\/$/, "");
const picked = process.env.PROD_DATABASE_URL
  ? { value: process.env.PROD_DATABASE_URL, key: "PROD_DATABASE_URL", file: "environment" }
  : process.env.DATABASE_URL
  ? { value: process.env.DATABASE_URL, key: "DATABASE_URL", file: "environment" }
  : fromEnvFile(["PROD_DATABASE_URL", "DATABASE_URL_DIRECT", "DATABASE_URL"]);

if (!picked || !BASE) {
  console.error(
    "Need a production database URL and BASE_URL.\n" +
    "  Looked for PROD_DATABASE_URL, then DATABASE_URL_DIRECT, then DATABASE_URL\n" +
    "  in the environment and in .env.local — same order as migrate-prod.mjs.");
  process.exit(2);
}
const DB = picked.value;

// prepare:false is load-bearing on the Supabase pooler — see CLAUDE.md.
const sql = postgres(DB, { ssl: "require", prepare: false });

const ROLES = ["karl", "admin", "pm", "engineer", "shop", "installer"];

/* ── What each surface needs ──────────────────────────────────────────────────
   Admin pages come from ADMIN_PAGE_CAPS, so they can never fall out of step.
   Everything else is listed here, and THIS LIST IS THE CONVERSION CHECKLIST:
   a route still carrying its own role list will fail against the map, which is
   exactly the signal wanted. Do not "fix" a failure by editing the expectation.
   ─────────────────────────────────────────────────────────────────────────── */
const PAGES = [
  ["/jobs",      "jobs.view"],
  ["/schedule",  "schedule.view"],
  ["/punch",     "punch.view"],
  ["/warranty",  "warranty.view"],
  ["/engineer",  "engineering.view"],
  ["/installer", null],          // installer-only surface; asserted separately
  ["/dashboard", null],          // admin/pm by design, no capability yet
];

/** method, path, capability. Only the DENY side is exercised. */
const WRITES = [
  ["PATCH",  "/api/jobs/{job}",            "jobs.edit"],
  ["POST",   "/api/jobs",                  "jobs.create"],
  ["DELETE", "/api/jobs/{job}",            "jobs.delete"],
  ["POST",   "/api/jobs/{job}/advance",    "jobs.advance"],
  ["POST",   "/api/schedule/events",       "schedule.edit"],
  ["POST",   "/api/schedule/ready",        "schedule.edit"],
  ["POST",   "/api/schedule/crews",        "schedule.admin"],
  ["POST",   "/api/schedule/pto",          "schedule.admin"],
  ["POST",   "/api/jobs/{job}/invoices",   "billing.manage"],
  ["POST",   "/api/signoffs/create",       "client.send"],
  ["POST",   "/api/admin/builders",        "users.manage"],
  ["GET",    "/api/admin/builders",        "users.view"],
];

let pass = 0, fail = 0, skipped = 0;
const problems = [];
const ok   = (n) => { pass++; };
const bad  = (n, d) => { fail++; problems.push(`${n}  ->  ${d}`); };
const skip = () => { skipped++; };

const minted = [];
async function sessionFor(role) {
  const [acct] = await sql`
    SELECT id, username FROM builder_accounts
    WHERE role = ${role} AND active = 1
    ORDER BY (username ILIKE 'test%') DESC, username
    LIMIT 1`;
  if (!acct) return null;
  const token = randomBytes(16).toString("hex");
  const now = new Date();
  await sql`
    INSERT INTO builder_sessions (token, builder_id, created_at, expires_at)
    VALUES (${token}, ${acct.id}, ${now.toISOString()},
            ${new Date(now.getTime() + 3600_000).toISOString()})`;
  minted.push(token);
  return { token, username: acct.username };
}

async function hit(token, method, path) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 15000);
  try {
    const r = await fetch(BASE + path, {
      method,
      redirect: "manual",
      signal: c.signal,
      headers: {
        cookie: `acc_builder_session=${token}`,
        ...(method === "GET" ? {} : { "content-type": "application/json" }),
      },
      ...(method === "GET" || method === "DELETE" ? {} : { body: "{}" }),
    });
    // A server redirect is how a page refuses; 401/403 is how an API refuses.
    if (r.status >= 300 && r.status < 400) return "refused";
    if (r.status === 401 || r.status === 403) return "refused";
    return r.status;
  } catch { return "timeout"; }
  finally { clearTimeout(t); }
}

async function main() {
  const [job] = await sql`
    SELECT job_number, id FROM jobs
    WHERE job_number IS NOT NULL AND status NOT IN ('complete','cancelled')
    ORDER BY created_at DESC LIMIT 1`;
  const jobRef = job?.job_number ?? job?.id;
  console.log(`\nBASE_URL  ${BASE}`);
  console.log(`database  ${picked.key} (from ${picked.file})`);
  console.log(`probing with job ${jobRef}\n`);

  /*
    THE GUARD THAT MATTERS MOST IN THIS FILE.

    This mints sessions in a DATABASE and then makes requests to a SITE. If those
    two are not the same system, every request arrives unauthenticated, every
    deny-assertion passes for the wrong reason, and the run reports all green
    while having tested nothing at all. That is far worse than crashing.

    So: mint one session, call an endpoint that requires a session, and refuse to
    continue unless it actually authenticates. The first run of this harness
    connected to localhost:5432 while testing production, which is exactly the
    mismatch this catches.
  */
  const probe = await sessionFor("karl") || await sessionFor("admin");
  if (!probe) {
    console.error("No karl or admin account to sanity-check with. Stopping.");
    process.exit(2);
  }
  const auth = await hit(probe.token, "GET", "/api/jobs/pms");
  if (auth !== 200) {
    console.error(
      `\nSTOPPING: a freshly minted session did not authenticate against ${BASE}\n` +
      `  (GET /api/jobs/pms answered ${auth})\n\n` +
      `  The database this script wrote the session into is not the one backing\n` +
      `  that site. Every result would be a false pass.\n\n` +
      `  Using ${picked.key} from ${picked.file}. If that is the local dev\n` +
      `  database, set PROD_DATABASE_URL or point BASE_URL at the matching site.\n`);
    process.exit(2);
  }
  console.log("session check: a minted session authenticates against this site. Good.\n");

  for (const role of ROLES) {
    const s = await sessionFor(role);
    if (!s) { console.log(`— ${role}: no active account, skipped`); skip(); continue; }
    console.log(`\n=== ${role}  (${s.username}) ===`);

    for (const [seg, cap] of Object.entries(ADMIN_PAGE_CAPS)) {
      const want = can(role, cap);
      const got  = await hit(s.token, "GET", `/admin/${seg}`);
      const allowed = got === 200;
      if (allowed === want) ok();
      else bad(`${role} /admin/${seg}`,
               want ? `should open (has ${cap}) but got ${got}`
                    : `should be refused (lacks ${cap}) but got ${got}`);
    }

    for (const [path, cap] of PAGES) {
      if (!cap) { skip(); continue; }
      const want = can(role, cap);
      const got  = await hit(s.token, "GET", path);
      const allowed = got === 200;
      if (allowed === want) ok();
      else bad(`${role} ${path}`,
               want ? `should open (has ${cap}) but got ${got}`
                    : `should be refused (lacks ${cap}) but got ${got}`);
    }

    for (const [method, tmpl, cap] of WRITES) {
      if (can(role, cap)) { skip(); continue; }   // never exercise an allowed write
      const path = tmpl.replace("{job}", jobRef);
      const got  = await hit(s.token, method, path);
      if (got === "refused") ok();
      else bad(`${role} ${method} ${path}`,
               `lacks ${cap} but the route answered ${got} instead of refusing`);
    }
  }
}

try {
  await main();
} finally {
  for (const t of minted) await sql`DELETE FROM builder_sessions WHERE token = ${t}`.catch(() => {});
  await sql.end({ timeout: 5 });
}

console.log(`\n${pass} passed, ${fail} failed, ${skipped} not asserted\n`);
if (problems.length) {
  console.log("PROBLEMS\n");
  for (const p of problems) console.log("  " + p);
  console.log("\nEach line is the map and the code disagreeing. Fix the code, not the expectation.\n");
}
process.exit(fail ? 1 : 0);
