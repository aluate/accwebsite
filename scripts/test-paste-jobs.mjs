#!/usr/bin/env node
/**
 * test-paste-jobs.mjs — what a pasted spreadsheet turns into.
 *
 * No database, no network.
 *
 * WHY. A bulk import is the one place a silent failure multiplies: paste thirty
 * rows, glance at "30 jobs created", and never notice that eight delivery dates
 * were unreadable and got stored as nothing. So the rule the parser follows is
 * that an unreadable cell blocks its row and says why, and the tests below are
 * mostly about the cells that should NOT parse.
 *
 * The ambiguous-date case is the one worth reading: 3/11/2026 is deliberately
 * read as March 11 and never guessed at, and a date that does not exist
 * (2026-02-30) is rejected rather than rolled forward into March, which is what
 * `new Date()` would do on its own.
 */
import { parsePastedJobs, parseDate, parseNumber, parseInstallType, rowToJobBody, rowIsValid } from "../lib/paste-jobs.ts";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

console.log("\ndates\n");
check("ISO parses", parseDate("2026-11-03").value === "2026-11-03");
check("US slashes parse", parseDate("11/3/2026").value === "2026-11-03");
check("two-digit year parses", parseDate("11/3/26").value === "2026-11-03");
check("single digits pad", parseDate("2026-1-5").value === "2026-01-05");
check("blank is not an error", parseDate("").value === null && !parseDate("").error);
check("a word is an error, not a null date", !!parseDate("TBD").error, JSON.stringify(parseDate("TBD")));
check("a month that does not exist is an error", !!parseDate("13/1/2026").error);
check("Feb 30 is rejected rather than rolled into March",
  !!parseDate("2026-02-30").error, JSON.stringify(parseDate("2026-02-30")));
check("3/11 is read as March 11, never guessed", parseDate("3/11/2026").value === "2026-03-11");

console.log("\nnumbers\n");
check("plain number", parseNumber("65", "Boxes").value === 65);
check("money with $ and commas", parseNumber("$85,000", "Est Value").value === 85000);
check("decimal survives", parseNumber("12.5", "Shop Hrs").value === 12.5);
check("blank is not zero", parseNumber("", "Boxes").value === null && !parseNumber("", "Boxes").error);
check("a word is an error, not zero", !!parseNumber("n/a", "Boxes").error);
check("the error names the column", (parseNumber("n/a", "Boxes").error ?? "").includes("Boxes"));
check("negative is refused", !!parseNumber("-5", "Boxes").error);

console.log("\ninstall type\n");
check("ACC crew", parseInstallType("ACC").value === "acc");
check("sub", parseInstallType("Sub").value === "sub");
check("delivery only", parseInstallType("Delivery Only").value === "delivery_only");
check("blank is fine", parseInstallType("").value === null);
check("anything else is an error", !!parseInstallType("maybe").error);

console.log("\na pasted block with a header row\n");
{
  const text = [
    "Job #\tBuilder\tClient\tAddress\tCity\tDelivery\tInstall Start\tBoxes",
    "26401\tAtlas\tKenny Debaene\t5712 Davenport St\tHayden\t11/3/2026\t11/17/2026\t65",
    "26404\tBush Legacy\t\t111 Red Fir Rd\tRathdrum\t12/1/2026\t\t40",
  ].join("\n");
  const out = parsePastedJobs(text);
  check("the header row is recognised", out.headerDetected);
  check("two rows come back", out.rows.length === 2, String(out.rows.length));
  check("columns are mapped by name, not position", out.columns[0] === "job_number" && out.columns[7] === "box_count");
  check("both rows are valid", out.rows.every(rowIsValid), JSON.stringify(out.rows.map(r => r.errors)));
  check("a spec home with an address and no client is allowed", rowIsValid(out.rows[1]));
  const body = rowToJobBody(out.rows[0]);
  check("the body matches the Add Job shape", body.job_number === "26401" && body.builder_company === "Atlas"
    && body.delivery_date === "2026-11-03" && body.install_start_date === "2026-11-17" && body.box_count === 65,
    JSON.stringify(body));
  check("an unset number is left off the body entirely, not sent as 0",
    !("shop_hrs" in rowToJobBody(out.rows[1])));
}

console.log("\na pasted block with no header row\n");
{
  const text = "26410\tAtlas\tSmith\t100 Main\tCda\t\t\t\t\t\t\t";
  const out = parsePastedJobs(text);
  check("no header is detected", !out.headerDetected);
  check("the default column order is used", out.rows[0].cells.job_number?.value === "26410");
  check("the row is valid", rowIsValid(out.rows[0]), JSON.stringify(out.rows[0].errors));
}

console.log("\nthe rows that must be refused\n");
{
  const text = [
    "Job #\tBuilder\tClient\tAddress\tDelivery",
    "26401\tAtlas\tKenny\t5712 Davenport\tTBD",          // unreadable date
    "26402\tAtlas\t\t\t11/3/2026",                       // nothing to identify it
    "26401\tAtlas\tDouble\t9 Elm\t11/3/2026",            // duplicate inside the paste
    "26099\tAtlas\tAlready There\t1 Oak\t11/3/2026",     // duplicate of an existing job
  ].join("\n");
  const out = parsePastedJobs(text, { existingJobNumbers: ["26099"] });
  check("an unreadable date blocks its row", !rowIsValid(out.rows[0]));
  check("...and the date is not silently stored", out.rows[0].cells.delivery_date?.value === null);
  check("a row with no client and no address is blocked", !rowIsValid(out.rows[1]));
  check("a job number repeated inside the paste is blocked", !rowIsValid(out.rows[2]),
    JSON.stringify(out.rows[2].errors));
  check("...and the message points at the other line", (out.rows[2].errors.join(" ")).includes("line 2"));
  check("a job number that already exists is blocked", !rowIsValid(out.rows[3]));
  check("the valid rows in a mixed paste are still valid", out.rows.filter(rowIsValid).length === 0);
}

console.log("\ncomma-separated paste, and stray delimiters\n");
{
  const out = parsePastedJobs('Job #,Builder,Client\n26420,"Atlas, Inc.",Smith');
  check("quoted commas survive", out.rows[0].cells.builder_company?.value === "Atlas, Inc.",
    JSON.stringify(out.rows[0].cells.builder_company));
  const wide = parsePastedJobs("Job #\tBuilder\n26421\tAtlas\tstray\tmore");
  check("more columns than expected is flagged", !rowIsValid(wide.rows[0]), JSON.stringify(wide.rows[0].errors));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
