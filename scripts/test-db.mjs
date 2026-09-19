/**
 * test-db.mjs — decide, once, which database a test suite is allowed to open.
 *
 * WHY THIS EXISTS.
 *
 * Karl, 2026-09-19, asked what was left to test. The answer was that thirteen of
 * the thirty-six wired suites had never run once, because they need a database —
 * and the reason nobody had simply given them one is that they WRITE.
 * test-door-front-save alone runs nineteen INSERT/UPDATE/DELETE statements.
 * Between them they create throwaway jobs, specs, finish groups, checklists and
 * notification settings.
 *
 * Until now, every one of them opened whatever was in DATABASE_URL and started
 * writing. And DATABASE_URL_DIRECT in .env.local is PRODUCTION. One person
 * exporting the wrong variable, one batch file with the wrong line, and the
 * suite that proves "a ticked checklist box survives the round trip" proves it
 * against real jobs.
 *
 * This has already happened twice in a milder form and both times it was luck
 * that limited it:
 *
 *   - 2026-09-18: the role matrix was pointed at the LOCAL dev database while
 *     claiming to test production. It would have reported a confident all-green
 *     about a site it never touched. Fixed in 0060 by making it prove the
 *     database and the site belong together.
 *   - 2026-09-18: a permission probe sent a deliberately-invalid POST to an
 *     invoice route, assuming it would 400. It returned 201 and created a real
 *     invoice on a real job, which then had to be voided.
 *
 * The lesson both times was the same: a test that can reach production data will
 * eventually reach it. So this refuses, rather than warns.
 *
 * WHAT IT ACCEPTS.
 *
 *   1. localhost / 127.0.0.1 — a scratch database on this machine. No ceremony.
 *   2. Anything else ONLY if ACC_TEST_DB names its database explicitly. A remote
 *      scratch database is then a deliberate act, typed out, not a leftover
 *      environment variable.
 *
 * And in both cases it refuses if the target IS production, checked properly —
 * see sameDatabase() for why string comparison is not enough.
 */
import { readFileSync } from "node:fs";

/* ─────────────────────────────────────────────────────────────────────────────
   Identifying a database.

   String comparison does not work here, because Supabase gives the SAME database
   two very different URLs:

     pooler  postgres://postgres.abcdefgh:pw@aws-0-us-west-1.pooler.supabase.com:6543/postgres
     direct  postgres://postgres:pw@db.abcdefgh.supabase.co:5432/postgres

   Different user, different host, different port, same data. A naive check would
   wave the pooler URL through while refusing the direct one, which is worse than
   no check at all — it would look like the guard was working.

   The project ref (abcdefgh above) is the thing that actually identifies the
   database. It appears in the username on the pooler and in the hostname on the
   direct connection.
   ─────────────────────────────────────────────────────────────────────────── */
export function dbIdentity(urlString) {
  let u;
  try { u = new URL(urlString); } catch { return null; }

  const host = u.hostname.toLowerCase();
  const user = decodeURIComponent(u.username || "");
  const database = u.pathname.replace(/^\//, "").toLowerCase();

  // postgres.<ref> on the pooler, db.<ref>.supabase.co on the direct connection.
  let ref = null;
  const fromUser = user.match(/^postgres\.([a-z0-9]{16,})$/i);
  const fromHost = host.match(/^db\.([a-z0-9]{16,})\.supabase\./i);
  if (fromUser) ref = fromUser[1].toLowerCase();
  else if (fromHost) ref = fromHost[1].toLowerCase();

  return { host, port: u.port || "5432", user, database, ref };
}

export function sameDatabase(a, b) {
  const x = dbIdentity(a), y = dbIdentity(b);
  if (!x || !y) return false;
  // A Supabase project ref settles it outright, whichever URL shape either side used.
  if (x.ref && y.ref) return x.ref === y.ref;
  // Otherwise: same host and same database name, port ignored on purpose —
  // 6543 and 5432 on one host are two doors into one room.
  return x.host === y.host && x.database === y.database;
}

export function isLocal(urlString) {
  const id = dbIdentity(urlString);
  if (!id) return false;
  return id.host === "localhost" || id.host === "127.0.0.1" || id.host === "::1";
}

/* ─────────────────────────────────────────────────────────────────────────────
   Where production might be named. Same resolution order as
   scripts/migrate-prod.mjs and scripts/test-role-matrix.mjs, so there is one
   convention in this repo rather than three.
   ─────────────────────────────────────────────────────────────────────────── */
const PROD_KEYS = ["PROD_DATABASE_URL", "DATABASE_URL_DIRECT"];

function productionCandidates() {
  const out = [];
  for (const key of PROD_KEYS) {
    if (process.env[key]) out.push({ value: process.env[key], key, from: "environment" });
  }
  for (const file of [".env.local", "../.env.local"]) {
    let text;
    try { text = readFileSync(new URL(file, import.meta.url), "utf8"); } catch { continue; }
    for (const key of PROD_KEYS) {
      const m = text.match(new RegExp(`^${key}=(.*)$`, "m"));
      if (m) {
        const v = m[1].trim().replace(/^["']|["']$/g, "");
        if (v) out.push({ value: v, key, from: file });
      }
    }
  }
  return out;
}

/** Never printed with its password. */
function describe(urlString) {
  const id = dbIdentity(urlString);
  if (!id) return "(unparseable connection string)";
  return `${id.host}:${id.port}/${id.database}${id.ref ? ` (project ${id.ref})` : ""}`;
}

/**
 * The one call a suite makes. Returns a connection string that is safe to write
 * to, or exits 2 with an explanation. Never returns production.
 */
export function requireTestDatabase(suiteName = "this suite") {
  /*
    ONE VARIABLE, ON PURPOSE.

    The first version of this took TEST_DATABASE_URL in preference to
    DATABASE_URL, which felt tidier and was wrong. Six of the lib modules these
    suites exercise — catalogs, engineering-autocheck, notification-routing,
    install-date, lifecycle, acc-standards-seed — import lib/db, and lib/db
    reads process.env.DATABASE_URL itself. So a suite handed TEST_DATABASE_URL
    would have opened its own client on the scratch database while the code
    under test wrote to DATABASE_URL. The guard would have inspected one
    database and the writes would have landed in another, while printing
    reassurance.

    Two variables that can disagree is the bug, not the ergonomics. There is one
    variable. Set DATABASE_URL to a scratch database for the run.
  */
  const url = process.env.DATABASE_URL;

  if (!url) {
    console.error(
      `\n  ${suiteName} needs a database and none is set.\n\n` +
      `  These suites WRITE — throwaway jobs, specs, checklists. Point them at a\n` +
      `  scratch database, never at the one the live site uses:\n\n` +
      `    DATABASE_URL=postgres://localhost:5432/acc_scratch npm test\n`);
    process.exit(2);
  }

  for (const cand of productionCandidates()) {
    if (sameDatabase(url, cand.value)) {
      console.error(
        `\n  REFUSING TO RUN.\n\n` +
        `  ${suiteName} writes to the database it is given, and the one it was\n` +
        `  given is production:\n\n` +
        `      ${describe(url)}\n\n` +
        `  It matches ${cand.key} from ${cand.from}. These suites create jobs,\n` +
        `  specs, finish groups and checklists. Against production that is real\n` +
        `  data in the shop's hands.\n\n` +
        `  Point DATABASE_URL at a scratch database — a local Postgres loaded\n` +
        `  from a dump is the usual one, and restoring that dump is a drill worth\n` +
        `  doing anyway.\n`);
      process.exit(2);
    }
  }

  if (!isLocal(url)) {
    const named = (process.env.ACC_TEST_DB || "").trim().toLowerCase();
    const id = dbIdentity(url);
    if (!named || named !== id.database) {
      console.error(
        `\n  REFUSING TO RUN.\n\n` +
        `  ${describe(url)} is not on this machine, and it does not match\n` +
        `  production either — so it may well be the right scratch database. But a\n` +
        `  remote database that these suites are about to write to should be a\n` +
        `  deliberate act, not a leftover environment variable.\n\n` +
        `  If it is the one you mean, name it:\n\n` +
        `      ACC_TEST_DB=${id.database} DATABASE_URL=... npm test\n`);
      process.exit(2);
    }
  }

  return url;
}

/** For suites that import the app's own client instead of opening their own. */
export function assertTestDatabase(suiteName = "this suite") {
  requireTestDatabase(suiteName);
}
