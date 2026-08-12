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
  { file: "test-catalog-resolve.mjs",   db: false, what: "db-vs-file catalog resolution (pure)" },
  { file: "test-upload-paths.mjs",      db: false, what: "where an uploaded file may land (pure)" },
  { file: "test-trim-defaults.mjs",     db: false, what: "trim sizes, species, and what stays blank" },
  { file: "test-catalog-loader.mjs",    db: true,  what: "the single catalog loader" },
  { file: "test-job-patch-fields.mjs",  db: true,  what: "every PATCH field is a real column" },
  { file: "test-install-date.mjs",      db: true,  what: "one official install date per job" },
  { file: "test-release-gate.mjs",      db: true,  what: "the five fields engineering needs" },
  { file: "test-door-front-roles.mjs",  db: true,  what: "doors / drawer fronts / applied ends" },
  { file: "test-door-front-save.mjs",   db: true,  what: "callout rows persist without destroying" },
  { file: "test-pdf-documents.mjs",     db: true,  what: "what the documents say" },
  { file: "test-trim-save-sequence.mjs", db: true,  http: true, what: "trim survives the form's save sequence" },
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
  console.log(`  Point it at a database:  DATABASE_URL=postgres://... npm test`);
  console.log(`  For the http suite also:  BASE_URL=http://127.0.0.1:3000 SESSION_TOKEN=<token>\n`);
}

process.exit(failed.length ? 1 : 0);
