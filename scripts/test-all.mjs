#!/usr/bin/env node
/**
 * test-all.mjs — run every test suite, report once.
 *
 *   npm test                     everything (needs DATABASE_URL for the db suites)
 *   npm run test:unit            only the suites that need no database
 *
 * Runs all of them even when one fails, because "3 of 7 suites failed and here is
 * which" is a useful sentence and "the first one failed" is not. Exits non-zero if
 * any suite failed, so it works as a gate.
 *
 * A db-backed suite with no DATABASE_URL is reported as SKIPPED, loudly, and does
 * NOT count as a pass. A green run that silently tested a third of the code is how
 * a suite stops being trusted.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/*
  `db: true` means the suite exits 1 immediately without DATABASE_URL. Only
  test-catalog-resolve is genuinely standalone — lib/catalog-resolve.ts imports
  nothing, which is why it was written that way.

  test-catalog-loader and test-job-patch-fields need one because the questions they
  ask are about a real schema: whether a db-backed catalog beats the JSON file, and
  whether every field a PATCH route accepts is an actual column. Both were briefly
  listed here as standalone, and the runner duly reported them FAILED with no
  database — which is the right failure, and the reason this list is worth getting
  right rather than guessing from the file name.
*/
const SUITES = [
  { file: "test-db-guard.mjs",         db: false, what: "the writing suites cannot reach production (pure)" },
  { file: "test-spec-save-completeness.mjs", db: false, what: "every save button saves the whole spec (pure)" },
  { file: "test-eng-warning.mjs",     db: false, what: "the ships-in-Nw warning gives one answer (pure)" },
  { file: "test-catalog-resolve.mjs",   db: false, what: "db-vs-file catalog resolution (pure)" },
  { file: "test-upload-paths.mjs",      db: false, what: "where an uploaded file may land (pure)" },
  { file: "test-trim-defaults.mjs",     db: false, what: "trim sizes, species, and what stays blank" },
  { file: "test-wo-hardware.mjs",       db: false, what: "one role, one answer on the work order (pure)" },
  { file: "test-paste-jobs.mjs",        db: false, what: "what a pasted spreadsheet turns into (pure)" },
  { file: "test-spec-approval.mjs",     db: false, what: "the DRAFT watermark answers to the real states (pure)" },
  { file: "test-slab-door.mjs",         db: false, what: "a melamine group ends up with a door style (pure)" },
  { file: "test-notification-routing.mjs", db: false, what: "who each automated email goes to (pure)" },
  { file: "test-file-store.mjs",        db: false, what: "the filesystem storage driver matches Supabase (pure)" },
  { file: "test-finish-color.mjs",      db: false, what: "a finish group has to say what colour it is (pure)" },
  { file: "test-spec-revision.mjs",     db: false, what: "after release, a change says who asked for it (pure)" },
  { file: "test-email-templates.mjs",  db: false, what: "every email template renders something readable (pure)" },
  { file: "test-job-label.mjs",        db: false, what: "a job is never called by its internal key (pure)" },
  { file: "test-invoices.mjs",         db: false, what: "invoices are raised by hand, never for $0 (pure)" },
  { file: "test-mail-override.mjs",    db: false, what: "the notification screen is what actually happens (pure)" },
  { file: "test-transition-emails.mjs",db: false, what: "the six lifecycle emails, which bypass the templates (pure)" },
  { file: "test-approval-in-person.mjs",db: false, what: "an in-person approval never looks like a signature (pure)" },
  { file: "test-migrate-prod.mjs",     db: false, what: "the migration runner can actually run (pure)" },
  { file: "test-email-brand.mjs",      db: false, what: "the emails look like ACC, not a default (pure)" },
  { file: "test-gate-client-emails.mjs",db: false, what: "the client gets the branded email, not the shop's (pure)" },
  { file: "test-punch.mjs",            db: false, what: "the punch loop can actually be closed (pure)" },
  { file: "test-permission-gates.mjs", db: false, what: "no gate 500s, lies, or locks the owner out (pure)" },
  { file: "test-permission-map.mjs",   db: false, what: "one capability map, nothing under /admin ungated (pure)" },
  /*
    Added 2026-09-19. These four were committed and in no runner table, so they
    had never run — not once, not on the day they were written. test-trim-propagate
    covers a route this session changed in 0063, and it could not have told us.

    A suite that is not in this table does not exist. If you write one, add it
    here in the same commit.
  */
  { file: "test-door-material.mjs",    db: false, what: "base door material is derived, and the gate accepts it (pure)" },
  { file: "test-trim-types.mjs",       db: false, what: "the trim vocabulary is one list with one spelling (pure)" },
  // Not in this list on purpose: test-role-matrix.mjs needs DATABASE_URL *and* a
  // deployed BASE_URL, and it signs in as every role against a live site. It is
  // the post-deploy check, not a unit suite. Run it with role-matrix.bat.
  { file: "test-catalog-loader.mjs",    db: true,  what: "the single catalog loader" },
  { file: "test-job-patch-fields.mjs",  db: true,  what: "every PATCH field is a real column" },
  { file: "test-engineering-autocheck.mjs", db: true, what: "which checklist items the app can prove" },
  { file: "test-notification-store.mjs", db: true,  what: "email settings survive the round trip" },
  { file: "test-checklist-store.mjs",   db: true,  what: "a ticked checklist box survives the round trip" },
  { file: "test-install-date.mjs",      db: true,  what: "one official install date per job" },
  { file: "test-release-gate.mjs",      db: true,  what: "the five fields engineering needs" },
  { file: "test-door-front-roles.mjs",  db: true,  what: "doors / drawer fronts / applied ends" },
  { file: "test-door-front-save.mjs",   db: true,  what: "callout rows persist without destroying" },
  { file: "test-pdf-documents.mjs",     db: true,  what: "what the documents say" },
  { file: "test-trim-save-sequence.mjs", db: true,  http: true, what: "trim survives the form's save sequence" },
  { file: "test-job-create-fields.mjs", db: true,  http: true, what: "the create form's fields all survive the save" },
  { file: "test-melamine-release.mjs",  db: true,  http: true, what: "a melamine spec can actually reach engineering" },
  { file: "test-acc-standards.mjs",     db: true,  what: "seeding scope — per-table vs per-role" },
  { file: "test-trim-propagate.mjs",    db: true,  what: "the trim propagate writes, against real Postgres" },
];

const unitOnly = process.argv.includes("--unit");
const hasDb = !!process.env.DATABASE_URL;
// An http suite drives the real endpoints and needs a running server.
const hasHttp = !!process.env.BASE_URL && !!process.env.SESSION_TOKEN;

const results = [];
for (const s of SUITES) {
  if ((s.db && (unitOnly || !hasDb)) || (s.http && (unitOnly || !hasHttp))) {
    results.push({ ...s, status: "skipped" });
    continue;
  }
  console.log(`\n${"─".repeat(70)}\n${s.file} — ${s.what}\n${"─".repeat(70)}`);
  const r = spawnSync("npx", ["tsx", resolve(__dirname, s.file)], {
    stdio: "inherit",
    env: process.env,
  });
  results.push({ ...s, status: r.status === 0 ? "pass" : "fail", code: r.status });
}

const failed  = results.filter((r) => r.status === "fail");
const skipped = results.filter((r) => r.status === "skipped");
const passed  = results.filter((r) => r.status === "pass");

console.log(`\n${"═".repeat(70)}`);
for (const r of results) {
  const mark = r.status === "pass" ? "ok     " : r.status === "fail" ? "FAILED " : "SKIPPED";
  console.log(`  ${mark}  ${r.file.padEnd(28)} ${r.what}`);
}
console.log(`${"═".repeat(70)}`);
console.log(`  ${passed.length} suite(s) passed, ${failed.length} failed, ${skipped.length} skipped\n`);

if (skipped.length) {
  console.log(`  ${skipped.length} suite(s) SKIPPED — ${unitOnly ? "--unit was passed" : "DATABASE_URL is not set"}.`);
  console.log(`  Skipped here means UNTESTED: the catalog loader, the install-date rule, the`);
  console.log(`  engineering release gate and every assertion about what the PDFs actually say.`);
  console.log(`  Only test-catalog-resolve runs without a database. Do not read this as a pass.\n`);
  console.log(`  Point it at a SCRATCH database — these suites write:`);
  console.log(`    DATABASE_URL=postgres://localhost:5432/acc_scratch npm test\n`);
  console.log(`  scripts/test-db.mjs refuses to run them against production, and knows`);
  console.log(`  the pooler and direct URLs are the same database, so you cannot get`);
  console.log(`  past it by swapping one for the other.`);
  console.log(`  For the http suite also:  BASE_URL=http://127.0.0.1:3000 SESSION_TOKEN=<token>\n`);
}

process.exit(failed.length ? 1 : 0);
