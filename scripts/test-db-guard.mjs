/**
 * test-db-guard.mjs — the guard that stops a writing test suite reaching
 * production is itself worth testing.
 *
 * A guard nobody has exercised is a guard you are trusting, not one you have.
 * The specific way this one could fail silently is the reason it exists: if
 * sameDatabase() did a string comparison, the Supabase POOLER url and the DIRECT
 * url for one project would look like two different databases, the guard would
 * wave one of them through, and the run would look protected while writing to
 * real jobs. That is worse than no guard, because it is reassuring.
 *
 * So the first assertion below is the one that matters most.
 */
import { sameDatabase, dbIdentity, isLocal } from "./test-db.mjs";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

/* Shapes only — no real project ref, no real password, nothing that identifies
   the live database. These are the URL FORMS Supabase hands out. */
const REF     = "abcdefghijklmnop";
const pooler  = `postgres://postgres.${REF}:pw@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;
const direct  = `postgres://postgres:pw@db.${REF}.supabase.co:5432/postgres`;
const another = `postgres://postgres.qrstuvwxyz123456:pw@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;
const local   = "postgres://postgres@localhost:5432/acc_scratch";
const localAlt= "postgres://postgres@localhost:6543/acc_scratch";

console.log("\n1. one database, two URL shapes\n");
check("the pooler and the direct URL are recognised as ONE database",
      sameDatabase(pooler, direct),
      "this is the whole point — a string comparison would say they differ and let production through");
check("the comparison works in both directions", sameDatabase(direct, pooler));
check("the project ref comes off the pooler username", dbIdentity(pooler).ref === REF);
check("the project ref comes off the direct hostname", dbIdentity(direct).ref === REF);

console.log("\n2. different databases stay different\n");
check("a different project is not the same database", !sameDatabase(pooler, another));
check("a local database is not production", !sameDatabase(local, pooler));
check("a local database is not production (direct shape either)", !sameDatabase(local, direct));

console.log("\n3. the pooler/direct port split does not fool it locally either\n");
check("same host and database on two ports is one database", sameDatabase(local, localAlt),
      "6543 and 5432 on one host are two doors into one room");

console.log("\n4. it fails closed, not open\n");
check("an unparseable string has no identity", dbIdentity("not a url") === null);
check("an unparseable string never matches anything", !sameDatabase("not a url", pooler),
      "returning true here would refuse every run; returning false is correct, and the ACC_TEST_DB rule still applies");
check("an empty string never matches", !sameDatabase("", pooler));

console.log("\n5. what counts as this machine\n");
check("localhost is local", isLocal(local));
check("127.0.0.1 is local", isLocal("postgres://postgres@127.0.0.1:5432/acc_scratch"));
check("a pooler host is not local", !isLocal(pooler));
check("a hostname merely CONTAINING localhost is not local",
      !isLocal("postgres://postgres@localhost.evil.example.com:5432/acc_scratch"),
      "the old suites tested this with url.includes('localhost'), which this hostname passes");

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
