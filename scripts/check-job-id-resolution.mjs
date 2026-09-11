#!/usr/bin/env node
/**
 * check-job-id-resolution.mjs — a job's two names must both find it.
 *
 * WHY THIS EXISTS.
 *
 * A job has an internal id (ACC-2026-0288) and a job number (90102). Every link
 * in the app is built from the number, and every child table is keyed on the
 * id. A handler that queries with the raw URL parameter therefore works when
 * someone types the internal id and fails silently for every real visit.
 *
 * It failed silently for months in the engineering checklist. Measured on one
 * job, at the same moment:
 *
 *     /api/jobs/90102/engineering-checklist          3 auto-check keys, 0 true
 *     /api/jobs/ACC-2026-0288/engineering-checklist  25 keys, 15 true
 *
 * and saving a ticked box under the number answered 500, because the row has a
 * foreign key to jobs(id). The PM saw an empty fifty-four item checklist that
 * would not save, on a job where fifteen items were already proven, and the
 * release refuses without a complete checklist. Nothing logged. Nothing looked
 * broken. It just could not be done.
 *
 * CLAUDE.md has told every contributor to resolve the parameter since April.
 * Instructions do not catch this; a test does.
 *
 * Run by `npm run selftest`. Exits non-zero when a handler under a [id] route
 * queries a job-keyed table with the raw parameter and never resolves it.
 */
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["app/api/jobs/[id]", "app/jobs/[id]", "app/api/admin/jobs/[id]", "app/installer/jobs/[id]"];
const repoRoot = process.cwd();

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(full);
  }
  return out;
}

/** The parameter name a handler destructured out of `params`. */
function paramNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/const\s*\{\s*id(?:\s*:\s*(\w+))?\s*[,}]/g)) names.add(m[1] || "id");
  for (const m of src.matchAll(/const\s*\{[^}]*\bid\s*:\s*(\w+)/g)) names.add(m[1]);
  return [...names];
}

const problems = [];

for (const root of ROOTS) {
  for (const file of walk(join(repoRoot, root))) {
    const src = readFileSync(file, "utf8");
    const rel = relative(repoRoot, file);
    const names = paramNames(src);
    if (!names.length) continue;

    // A file that resolves through the shared helper is fine by definition.
    const usesHelper = /resolveJobId\s*\(|loadJob\s*\(/.test(src);

    for (const name of names) {
      const v = `\\$\\{${name}\\}`;

      // Querying a child table by the raw parameter.
      const childKeyed = new RegExp(`job_id\\s*=\\s*${v}`, "g");
      // Querying jobs itself by the raw parameter, with no job_number branch on
      // the same statement.
      const jobsKeyed = new RegExp(`FROM\\s+jobs\\s+WHERE\\s+(?:\\w+\\.)?id\\s*=\\s*${v}(?![^\`]*job_number)`, "gi");
      // Writing a child row keyed on the raw parameter.
      const insertKeyed = new RegExp(`VALUES\\s*\\([^)]*${v}`, "g");

      const hits = [];
      if (!usesHelper && childKeyed.test(src)) hits.push(`job_id = \${${name}}`);
      if (!usesHelper && jobsKeyed.test(src)) hits.push(`FROM jobs WHERE id = \${${name}} with no job_number branch`);
      if (!usesHelper && /INSERT INTO (engineering_release_checklists|warranty_items|job_files|work_orders|invoices)/.test(src) && insertKeyed.test(src)) {
        hits.push(`INSERT keyed on \${${name}}`);
      }
      for (const h of hits) problems.push({ file: rel, detail: h });
    }
  }
}

const seen = new Set();
const unique = problems.filter((p) => {
  const k = p.file + "|" + p.detail;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

if (unique.length) {
  console.log(`\n  ${unique.length} handler(s) query a job by the raw URL parameter:\n`);
  for (const p of unique) console.log(`    ${p.file}\n      ${p.detail}`);
  console.log(`
  Every link in the app carries the job NUMBER; these tables are keyed on the
  internal id. Resolve it first:

      import { resolveJobId } from "@/lib/job-id";
      const { id: rawId } = await params;
      const id = await resolveJobId(rawId);
      if (!id) return NextResponse.json({ error: "Job not found" }, { status: 404 });
`);
  process.exit(1);
}

console.log("  job id resolution: every [id] handler resolves the parameter");
