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
import { spawn } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rl = createInterface({ input: process.stdin, output: process.stdout });

function hostOf(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(unparseable — check the string)";
  }
}

const url = (await rl.question("\nPaste the production DATABASE_URL (from Vercel):\n> ")).trim();
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
  console.log("  NOTE: port 5432 is session mode. Production uses the pooler on 6543.");
}

const yes = (await rl.question("\nType YES to run it: ")).trim();
rl.close();
if (yes !== "YES") { console.log("Stopped. Nothing was changed."); process.exit(0); }

console.log("\n--- db-push ---");
const code = await new Promise((res) => {
  const child = spawn(process.execPath, [resolve(__dirname, "db-push.mjs")], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
  child.on("close", res);
});
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
