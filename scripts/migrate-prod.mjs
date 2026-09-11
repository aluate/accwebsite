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
import { readFileSync, existsSync, rmSync } from "node:fs";
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

const yes = (await rl.question("\nType YES to run it: ")).trim();
rl.close();
if (yes !== "YES") { console.log("Stopped. Nothing was changed."); process.exit(0); }

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

let scriptPath;
if (cloned === 0 && existsSync(join(workDir, "scripts", "db-push.mjs"))) {
  scriptPath = join(workDir, "scripts", "db-push.mjs");
  console.log("  using scripts/db-push.mjs from main");
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

console.log("\n--- verifying the two notification tables ---");
const sql = postgres(url, { ssl: local ? false : "require", max: 1, prepare: false });
try {
  const rows = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('notification_routes','notification_test_mode')
    ORDER BY table_name
  `;
  const found = rows.map((r) => r.table_name);
  for (const t of ["notification_routes", "notification_test_mode"]) {
    console.log(`  ${found.includes(t) ? "OK  " : "MISS"}  ${t}`);
  }
  if (found.includes("notification_test_mode")) {
    const [tm] = await sql`SELECT active, fallback_address FROM notification_test_mode WHERE id = 1`;
    console.log(`  test mode: ${tm ? (Number(tm.active) === 1 ? "ON" : "off") : "no row (unexpected)"}`);
  }
  const ok = found.length === 2;
  console.log(ok ? "\nDone. Safe to ship." : "\nOne or both tables are missing — do not turn on test mode yet.");
  await sql.end();
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error("Verification query failed:", e.message);
  await sql.end().catch(() => {});
  process.exit(1);
}
