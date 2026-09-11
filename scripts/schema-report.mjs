#!/usr/bin/env node
/**
 * schema-report.mjs — write down what a database actually contains.
 *
 * WHY. scripts/db-push.mjs is supposed to describe this app's schema, and it
 * does not: six tables the code reads have no CREATE TABLE in it, and one table
 * had two conflicting definitions. Four of those are repaired now by reading
 * the queries, but reading queries only tells you what the code WANTS. It
 * cannot tell you what production HAS — and that is the difference between
 * needing a CREATE TABLE and needing an ALTER.
 *
 * Getting that wrong is not harmless. `CREATE TABLE IF NOT EXISTS` is a no-op
 * against a table that already exists with different columns, so a guessed
 * definition would leave the app broken while the migration reports success —
 * exactly the failure this whole exercise just dug out.
 *
 * So: point this at a database and it writes schema-report.json and
 * schema-report.md beside itself. Read-only — it runs SELECTs against
 * information_schema and nothing else. No table contents are read, so the
 * report carries no customer data: table names, column names, types,
 * nullability, defaults, indexes and foreign keys.
 *
 *   node scripts/schema-report.mjs                 # asks which database
 *   node scripts/schema-report.mjs --url postgres://...
 *   node scripts/schema-report.mjs --out ./somewhere
 */
import { createInterface } from "readline/promises";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const outDir = resolve(opt("--out", "."));

let url = opt("--url", process.env.SCHEMA_REPORT_URL || "");
if (!url) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  url = (await rl.question("\nPaste the DATABASE_URL to inspect (read-only):\n> ")).trim();
  rl.close();
}
if (!/^postgres(ql)?:\/\//.test(url)) {
  console.error("That does not look like a postgres:// URL. Stopping.");
  process.exit(1);
}

const local = /localhost|127\.0\.0\.1|::1/.test(url);
let host = "(unparseable)";
try { const u = new URL(url); host = `${u.hostname}:${u.port || "5432"}${u.pathname}`; } catch { /* shown as-is */ }
console.log(`\nReading the schema of ${host} — SELECTs against information_schema only.\n`);

const sql = postgres(url, { ssl: local ? false : "require", max: 1, prepare: false });

try {
  const columns = await sql`
    SELECT table_name, column_name, data_type, is_nullable, column_default, ordinal_position
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `;
  const indexes = await sql`
    SELECT tablename AS table_name, indexname AS index_name, indexdef AS definition
    FROM pg_indexes WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `;
  const foreignKeys = await sql`
    SELECT tc.table_name, kcu.column_name,
           ccu.table_name AS references_table, ccu.column_name AS references_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
    ORDER BY tc.table_name, kcu.column_name
  `;
  const counts = await sql`
    SELECT relname AS table_name, n_live_tup AS approx_rows
    FROM pg_stat_user_tables WHERE schemaname = 'public'
    ORDER BY relname
  `;

  const byTable = {};
  for (const c of columns) {
    (byTable[c.table_name] ??= { columns: [], indexes: [], foreignKeys: [], approxRows: null });
    byTable[c.table_name].columns.push({
      name: c.column_name, type: c.data_type,
      nullable: c.is_nullable === "YES", default: c.column_default,
    });
  }
  for (const i of indexes) byTable[i.table_name]?.indexes.push({ name: i.index_name, definition: i.definition });
  for (const f of foreignKeys) byTable[f.table_name]?.foreignKeys.push(f);
  for (const c of counts) if (byTable[c.table_name]) byTable[c.table_name].approxRows = Number(c.approx_rows);

  const names = Object.keys(byTable).sort();
  const json = { host, when: new Date().toISOString(), tableCount: names.length, tables: byTable };
  writeFileSync(resolve(outDir, "schema-report.json"), JSON.stringify(json, null, 2), "utf8");

  const md = [`# Schema report`, "", `${host} · ${new Date().toISOString()} · ${names.length} tables`, "",
    "Read-only: column and index metadata, no table contents.", ""];
  for (const t of names) {
    const info = byTable[t];
    md.push(`## ${t}${info.approxRows != null ? `  (~${info.approxRows} rows)` : ""}`);
    md.push("");
    md.push("| column | type | null | default |");
    md.push("|---|---|---|---|");
    for (const c of info.columns) {
      md.push(`| ${c.name} | ${c.type} | ${c.nullable ? "yes" : "no"} | ${c.default ? `\`${String(c.default).slice(0, 60)}\`` : "—"} |`);
    }
    if (info.foreignKeys.length) {
      md.push("");
      md.push(info.foreignKeys.map((f) => `- \`${f.column_name}\` → \`${f.references_table}.${f.references_column}\``).join("\n"));
    }
    md.push("");
  }
  writeFileSync(resolve(outDir, "schema-report.md"), md.join("\n"), "utf8");

  console.log(`${names.length} tables.`);
  console.log(`Wrote schema-report.json and schema-report.md to ${outDir}\n`);
} catch (e) {
  console.error("Could not read the schema:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end().catch(() => {});
}
