#!/usr/bin/env node
/**
 * test-job-label.mjs — a job is called the same thing everywhere, and never
 * called by its internal key.
 *
 * No database, no network.
 *
 * WHY. Nine places built their own version of this and disagree. Several fall
 * back to job.id when a field is missing, which puts ACC-2026-0181 in front of
 * a person — the one thing Karl has said twice it must never do. The portal
 * comment email put the raw URL parameter in the subject line of a message to
 * a builder.
 *
 * The rule, in his words: "(5 digit ACC JOB NUMBER) (BUILDER) (JOB NAME)",
 * where the name "needs to be the Client Name unless there is no name. Then it
 * needs to be the address. We have spec homes that ONLY get listed with the
 * address." And with no number yet: "builder, name, address".
 */
import { jobLabel, jobLabelShort, jobName, builderOf, isInternalId, labelFromRef } from "../lib/job-label.ts";

let pass = 0, fail = 0;
const check = (n, c, d = "") => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${d ? "  -> " + d : ""}`)); };

const full = {
  id: "ACC-2026-0181", job_number: "26401",
  client_name: "Kenny Debaene", site_address: "5712 Davenport",
  builder_company: "Atlas Builders",
};

console.log("\nthe normal case\n");
check("number, builder, name in that order",
      jobLabel(full) === "#26401 · Atlas Builders · Kenny Debaene", jobLabel(full));
check("short form is number and name", jobLabelShort(full) === "#26401 Kenny Debaene", jobLabelShort(full));

console.log("\na spec home: no client, known by its address\n");
{
  const spec = { ...full, client_name: "" };
  check("the address becomes the name", jobName(spec) === "5712 Davenport");
  check("and reads as a normal label", jobLabel(spec) === "#26401 · Atlas Builders · 5712 Davenport", jobLabel(spec));
}

console.log("\nno job number yet: builder, name, address\n");
{
  const pre = { ...full, job_number: null };
  check("all three", jobLabel(pre) === "Atlas Builders · Kenny Debaene · 5712 Davenport", jobLabel(pre));
  const preSpec = { ...full, job_number: null, client_name: "" };
  check("a spec home does not repeat its address twice",
        preSpec.site_address && jobLabel(preSpec) === "Atlas Builders · 5712 Davenport", jobLabel(preSpec));
}

console.log("\nthe internal key never appears\n");
{
  const cases = [
    ["everything missing but the id", { id: "ACC-2026-0181" }],
    ["id and a number", { id: "ACC-2026-0181", job_number: "26401" }],
    ["id and a client", { id: "ACC-2026-0181", client_name: "Kenny Debaene" }],
    ["id and a builder", { id: "ACC-2026-0181", builder_company: "Atlas" }],
    ["a test job id", { id: "ACC-TEST-90001", client_name: "Test Client" }],
  ];
  for (const [name, job] of cases) {
    const out = jobLabel(job) + "|" + jobLabelShort(job);
    check(`${name}: no ACC key in the label`, !/ACC-\d{4}-\d+|ACC-TEST/.test(out), out);
  }
  check("a completely empty job still says something", jobLabel({}) === "Untitled job", jobLabel({}));
  check("and the short form too", jobLabelShort({}) === "Untitled job");
}

console.log("\nbuilder comes from either field\n");
check("builder_company wins", builderOf({ builder_company: "Atlas", builder_name: "Pat" }) === "Atlas");
check("builder_name is the fallback", builderOf({ builder_name: "Pat" }) === "Pat");
check("neither is empty, not undefined", builderOf({}) === "");

console.log("\nmessy input\n");
check("whitespace is trimmed", jobLabel({ job_number: " 26401 ", client_name: "  Kenny  " }) === "#26401 · Kenny",
      jobLabel({ job_number: " 26401 ", client_name: "  Kenny  " }));
check("a numeric job number works", jobLabel({ job_number: 26401, client_name: "Kenny" }) === "#26401 · Kenny");
check("nulls do not become the string null", !/null|undefined/.test(jobLabel({ job_number: null, client_name: null, site_address: null })));
check("a custom separator is honoured",
      jobLabel(full, { separator: " - " }) === "#26401 - Atlas Builders - Kenny Debaene");

console.log("\nrecognising the internal key\n");
check("ACC-2026-0181 is one", isInternalId("ACC-2026-0181"));
check("lower case too", isInternalId("acc-2026-0181"));
check("a test id is one", isInternalId("ACC-TEST-90001"));
check("a job number is not", !isInternalId("26401"));
check("empty is not", !isInternalId(""));

console.log("\nwhen all you have is the URL parameter\n");
check("a number becomes #26401", labelFromRef("26401") === "#26401");
check("an internal key returns null, so nothing is printed", labelFromRef("ACC-2026-0181") === null);
check("empty returns null", labelFromRef("") === null);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
