/**
 * scripts/migrate-prod.mjs — apply the schema to a database you name out loud.
 *
 * WHY THIS EXISTS.
 *
 * `node scripts/db-push.mjs` reads DATABASE_URL out of .env.local, and .env.local
 * currently points at the LOCAL Postgres. Running it bare migrates the laptop and
 * reports success, which looks exactly like migrating production.
 *
 * So this asks for the connection string, shows you the host it is about to touch,
 * waits for a yes, runs the push with that URL in the environment (dotenv does not
 * override a variable that is already set), and then reads the two new tables back
 * to prove they are there.
 *
 * Nothing in db-push.mjs drops, deletes or truncates: it is CREATE TABLE IF NOT
 * EXISTS and ADD COLUMN IF NOT EXISTS throughout, plus one guarded column-type fix
 * that only fires if the type is already wrong.
 */
import { createInterface } from "readline/promises";
import { readFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The production connection string, without anyone having to paste it.
 *
 * .env.local already holds it: DATABASE_URL_DIRECT is the direct (port 5432)
 * production connection the backups use. The bare DATABASE_URL is deliberately
 * NOT consulted — on this machine it points at the local Postgres, and acting
 * on the wrong database while reporting success is the failure this work exists
 * to stop.
 */
function urlFromEnvFile() {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../.env.local");
  let text = "";
  try { text = readFileSync(envPath, "utf8"); } catch { return null; }
  for (const key of ["PROD_DATABASE_URL", "DATABASE_URL_DIRECT"]) {
    const m = text.match(new RegExp("^" + key + "=(.+)$", "m"));
    if (m) return { url: m[1].trim().replace(/^["']|["']$/g, ""), key };
  }
  return null;
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

function hostOf(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(unparseable — check the string)";
  }
}

const fromFile = urlFromEnvFile();
let url;
if (fromFile) {
  url = fromFile.url;
  console.log(`\nUsing ${fromFile.key} from .env.local.`);
} else {
  url = (await rl.question("\nPaste the production DATABASE_URL (from Vercel):\n> ")).trim();
}
if (!url) { console.error("Nothing pasted. Stopping."); rl.close(); process.exit(1); }
if (!/^postgres(ql)?:\/\//.test(url)) {
  console.error("That does not look like a postgres:// URL. Stopping.");
  rl.close(); process.exit(1);
}

const host = hostOf(url);
const local = /localhost|127\.0\.0\.1/.test(url);
console.log(`\n  About to apply the schema to:  ${host}`);
if (local) console.log("  NOTE: that is a LOCAL database, not production.");
if (/:5432\//.test(url) && /supabase/.test(url)) {
  // Session mode is the RIGHT choice here, even though the app itself must use
  // the 6543 pooler. Schema changes over a transaction-mode pooler are the kind
  // of thing that half-applies; a direct connection does not have that problem.
  console.log("  Direct connection (port 5432) - the right one for schema changes.");
}
console.log("  Additive only: CREATE TABLE IF NOT EXISTS and ADD COLUMN IF NOT EXISTS.");
console.log("  Nothing in it drops, deletes or truncates anything.");

/*
  Case-insensitive on purpose. This asked for "YES" and rejected "yes" without
  saying why — it just printed "Stopped. Nothing was changed." and exited 0, and
  0 reads as success to anything downstream. Someone typed yes, saw a calm
  message, shipped the code that needed the migration, and only luck decided
  whether that mattered. The confirmation is there to make you read the host
  name above it, not to test your shift key.
*/
const yes = (await rl.question("\nType YES to run it: ")).trim();
rl.close();
if (yes.toUpperCase() !== "YES") {
  console.log("Stopped. Nothing was changed. (Type YES to run it.)");
  process.exit(2);
}

/*
  Run the schema script from MAIN, not the copy sitting in this folder.

  Patches are applied by ship-all.bat inside a fresh clone and pushed; this
  working tree is never updated by any of it — ship-all says so itself: "your
  local repo was not touched and is now behind main." The db-push.mjs here is
  from 2026-08-12 and knows nothing about the tables the deployed code expects.
  Running it applies August's schema to today's app, quietly, and reports
  success.

  So: shallow-clone main into TEMP, run that db-push, throw the clone away. The
  migration then always matches the code that is actually deployed. Same
  pattern ship-all.bat already uses, and it needs no token — git on this
  machine has the credentials.
*/
const workDir = join(tmpdir(), "acc-migrate-main");
rmSync(workDir, { recursive: true, force: true });

console.log("\n--- fetching the current schema script from main ---");
const cloned = await new Promise((res) => {
  const c = spawn("git",
    ["clone", "--quiet", "--branch", "main", "--depth", "1",
     "https://github.com/aluate/accwebsite.git", workDir],
    { stdio: "inherit" });
  c.on("close", res);
});

/*
  THE CLONE HAS NO node_modules, AND db-push IMPORTS `postgres`.

  That is the bug this comment exists to stop coming back. Cloning main into
  TEMP fixed one problem — the migration no longer applies a stale schema — and
  created another one nobody saw until somebody actually needed a migration:

      Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'postgres' imported from
      C:\...\Temp\acc-migrate-main\scripts\db-push.mjs

  A shallow clone is source only. Node resolves ESM imports by walking up from
  the importing file looking for node_modules, and under TEMP there is none to
  find, so every run since died on the first import. It never applied anything
  and it never could.

  The fix is a junction from the clone to the dependencies already installed in
  this repo. Junctions need no administrator rights on Windows, cost nothing,
  and vanish with the clone. NODE_PATH would not work here — it is honoured for
  CommonJS require and ignored for ESM import, which is what db-push uses.

  If the link cannot be made, say so and fall back rather than dying on a stack
  trace: an out-of-date schema you were warned about beats no migration at all.
*/
function linkDependencies(cloneDir) {
  const localModules = resolve(__dirname, "..", "node_modules");
  if (!existsSync(localModules)) {
    return "this repo has no node_modules — run npm install here first";
  }
  const target = join(cloneDir, "node_modules");
  if (existsSync(target)) return null;
  for (const type of ["junction", "dir"]) {
    try {
      symlinkSync(localModules, target, type);
      return null;
    } catch { /* try the next kind */ }
  }
  return "could not link node_modules into the clone";
}

let scriptPath;
if (cloned === 0 && existsSync(join(workDir, "scripts", "db-push.mjs"))) {
  const linkErr = linkDependencies(workDir);
  if (linkErr) {
    console.log(`  ${linkErr}`);
    console.log("  COULD NOT prepare main's copy - falling back to the local one, which may be out of date.");
    scriptPath = resolve(__dirname, "db-push.mjs");
  } else {
    scriptPath = join(workDir, "scripts", "db-push.mjs");
    console.log("  using scripts/db-push.mjs from main");
  }
} else {
  scriptPath = resolve(__dirname, "db-push.mjs");
  console.log("  COULD NOT reach main - falling back to the local copy, which may be out of date.");
  console.log(`  local copy: ${scriptPath}`);
}

console.log("\n--- db-push ---");
const code = await new Promise((res) => {
  const child = spawn(process.execPath, [scriptPath], {
    stdio: "inherit",
    // cwd matters: db-push reads data/catalogs/*.json relative to its own
    // location, so it runs from wherever the script actually lives.
    cwd: scriptPath.startsWith(workDir) ? workDir : resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: url },
  });
  child.on("close", res);
});
rmSync(workDir, { recursive: true, force: true });
if (code !== 0) { console.error(`\ndb-push exited ${code}. Nothing further checked.`); process.exit(code ?? 1); }

/*
  WHAT GETS CHECKED AFTERWARDS.

  This used to read back two tables from the notification work and then print
  "Done. Safe to ship." — a verdict about the whole schema based on two objects
  that had nothing to do with whatever was just pushed. It would have said "safe
  to ship" on a run that added nothing at all.

  So it is a list now, and the rule is simple: when you add a column or a table
  that the deployed code will read, add it here in the same change. Then this
  step actually answers the question it appears to answer.
*/
const EXPECTED = [
  { table: "notification_routes" },
  { table: "notification_test_mode" },
  { table: "client_signoffs", column: "approval_method", since: "0048 — approved in person" },
  { table: "client_signoffs", column: "in_person_at",    since: "0048 — approved in person" },
  { table: "client_signoffs", column: "in_person_by",    since: "0048 — approved in person" },
  { table: "builders",        column: "typical_pm",      since: "the builder table seed" },
];

console.log("\n--- verifying what the deployed code expects ---");
const sql = postgres(url, { ssl: local ? false : "require", max: 1, prepare: false });
try {
  const tables = new Set(
    (await sql`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `).map((r) => r.table_name),
  );
  const columns = new Set(
    (await sql`
      SELECT table_name || '.' || column_name AS ref
      FROM information_schema.columns WHERE table_schema = 'public'
    `).map((r) => r.ref),
  );

  const missing = [];
  for (const e of EXPECTED) {
    const ref = e.column ? `${e.table}.${e.column}` : e.table;
    const present = e.column ? columns.has(ref) : tables.has(e.table);
    if (!present) missing.push({ ...e, ref });
    console.log(`  ${present ? "OK  " : "MISS"}  ${ref}${e.since && !present ? `   (${e.since})` : ""}`);
  }

  if (tables.has("notification_test_mode")) {
    const [tm] = await sql`SELECT active FROM notification_test_mode WHERE id = 1`;
    console.log(`  test mode: ${tm ? (Number(tm.active) === 1 ? "ON" : "off") : "no row (unexpected)"}`);
  }

  if (missing.length === 0) {
    console.log("\nEverything on the list is present. Safe to ship.");
  } else {
    console.log(`\n${missing.length} missing. DO NOT ship code that reads them:`);
    for (const m of missing) console.log(`  - ${m.ref}${m.since ? `   ${m.since}` : ""}`);
  }
  await sql.end();
  process.exit(missing.length === 0 ? 0 : 1);
} catch (e) {
  console.error("Verification query failed:", e.message);
  await sql.end().catch(() => {});
  process.exit(1);
}
