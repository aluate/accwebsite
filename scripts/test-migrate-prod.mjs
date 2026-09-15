#!/usr/bin/env node
/**
 * test-migrate-prod.mjs — the migration runner can actually run.
 *
 * No database, no network. It reads the script rather than executing it,
 * because executing it means touching production.
 *
 * WHY. Patch 0042 fixed a real bug — the migration was applying a months-old
 * schema script, because ship-all never updates this working tree — by cloning
 * main into TEMP and running that copy instead. Correct fix, and it made the
 * migration impossible to run at all:
 *
 *     Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'postgres'
 *     imported from C:\...\Temp\acc-migrate-main\scripts\db-push.mjs
 *
 * A shallow clone is source only. Node walks up from the importing file looking
 * for node_modules and finds none under TEMP. Every run since 0042 died on the
 * first import, and nobody noticed because migrations are rare — it surfaced
 * only when 0048 needed one.
 *
 * Two lessons are pinned here. Fetch the script from main AND give it the
 * dependencies it imports. And never let the confirmation prompt exit 0 when it
 * has not done the thing.
 */
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (n, c, d = "") => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${d ? "  -> " + d : ""}`)); };

const src = readFileSync(new URL("../scripts/migrate-prod.mjs", import.meta.url), "utf8");
/*
  Comment-free copy, for assertions about what the script DOES rather than what
  it says. The file explains at length why it does not use NODE_PATH, and a
  naive search for the word matches that explanation and fails the very check it
  is the reason for. Caught this exact way twice now.
*/
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const push = readFileSync(new URL("../scripts/db-push.mjs", import.meta.url), "utf8");

console.log("\nthe script it runs has what it imports\n");
check("db-push imports postgres, so the clone needs node_modules",
      /import postgres from "postgres"/.test(push),
      "if this import ever goes away, the linking below stops being necessary");
check("the runner links dependencies into the clone", /function linkDependencies/.test(src));
check("and calls it before choosing main's copy",
      src.indexOf("linkDependencies(workDir)") < src.indexOf('using scripts/db-push.mjs from main'));
check("it uses a junction, which needs no admin rights on Windows",
      /"junction"/.test(src));
check("it does not rely on NODE_PATH, which ESM ignores",
      !/NODE_PATH/.test(code),
      "NODE_PATH is honoured for require() and ignored for import — the trap here");
check("a failed link falls back instead of throwing",
      /falling back to the local one/.test(src) && /linkErr/.test(src));

console.log("\nstill runs main's schema, not this stale working tree\n");
check("it clones main", /clone[\s\S]{0,120}accwebsite\.git/.test(src));
check("shallow, so it stays quick", /"--depth", "1"/.test(src));
check("and throws the clone away afterwards", (src.match(/rmSync\(workDir/g) || []).length >= 2);

console.log("\nsaying no is not the same as succeeding\n");
check("the confirmation accepts any case",
      /yes\.toUpperCase\(\) !== "YES"/.test(src),
      'it rejected "yes" and printed a calm message that read like success');
check("declining exits non-zero",
      /Stopped\. Nothing was changed[\s\S]{0,120}process\.exit\(2\)/.test(src),
      "exit 0 tells anything downstream the migration ran");
check("and says what it wanted", /\(Type YES to run it\.\)/.test(src));

console.log("\nthe check afterwards is about what was actually added\n");
check("there is a maintained list", /const EXPECTED = \[/.test(src));
check("it includes the columns 0048 needs",
      ["approval_method", "in_person_at", "in_person_by"].every((c) => src.includes(`column: "${c}"`)));
check("it reads real columns from information_schema", /information_schema\.columns/.test(src));
check("a miss is reported as a miss", /DO NOT ship code that reads them/.test(src));
check("and exits non-zero", /process\.exit\(missing\.length === 0 \? 0 : 1\)/.test(src));
check("'safe to ship' is only said when nothing is missing",
      /missing\.length === 0[\s\S]{0,120}Safe to ship/.test(src),
      "it used to say that based on two unrelated tables");

console.log("\nthe database it touches is named out loud\n");
check("the host is printed before the prompt",
      src.indexOf("About to apply the schema to") < src.indexOf("Type YES to run it"));
check("DATABASE_URL_DIRECT is preferred over DATABASE_URL",
      /DATABASE_URL_DIRECT/.test(src) && !/process\.env\.DATABASE_URL\b(?!_)/.test(src.split("const EXPECTED")[0]));
check("no connection string is ever printed", !/console\.log\([^)]*\burl\b[^)]*\)/.test(src),
      "AGENTS.md section 8: never print connection strings");

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
