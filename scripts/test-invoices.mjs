#!/usr/bin/env node
/**
 * test-invoices.mjs — invoices are raised by hand, and never for $0.
 *
 * No database, no network.
 *
 * WHY. The only automatic invoice that was wired priced itself from
 * `estimates.sell_price` and nothing else. A job that never went through the
 * estimator has no such row, so the invoice was written at zero and nobody was
 * told. Karl: "The auto invoices will need to be manual until further notice."
 *
 * Two things have to stay true, and they are easy to undo by accident:
 *   1. the automatic path stays off until somebody deliberately turns it on
 *   2. when it IS turned on, the amount falls back to the PM's own figure
 *      rather than writing zero
 */
import { readFileSync } from "node:fs";
import { AUTO_INVOICE_ENABLED } from "../lib/invoices.ts";

let pass = 0, fail = 0;
const check = (n, c, d = "") => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${d ? "  -> " + d : ""}`)); };

const src = readFileSync(new URL("../lib/invoices.ts", import.meta.url), "utf8");
const advance = readFileSync(new URL("../app/api/jobs/[id]/advance/route.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/InvoicePanel.tsx", import.meta.url), "utf8");

console.log("\nthe automatic path is off\n");
check("AUTO_INVOICE_ENABLED is false", AUTO_INVOICE_ENABLED === false,
      "if this is deliberate, say so to Karl first — it was turned off on 2026-09-15");
check("and it is a real boolean, not a truthy string", typeof AUTO_INVOICE_ENABLED === "boolean");

console.log("\nnothing creates an invoice without checking the flag\n");
{
  // Every createDraftInvoice call outside lib/invoices.ts must sit behind the flag.
  const calls = [...advance.matchAll(/createDraftInvoice\(/g)].length;
  check("advance still has the call, so re-enabling is one line", calls === 1, `${calls} calls`);
  check("it is guarded", /if \(AUTO_INVOICE_ENABLED\)/.test(advance));
  check("the flag is imported rather than redeclared", /import \{[^}]*AUTO_INVOICE_ENABLED/.test(advance));
}

console.log("\nskipping it is not silent\n");
check("the else branch writes to the activity log", /\} else \{[\s\S]{0,200}logActivity\(/.test(advance));
check("with an event type somebody can search for", /eventType: "invoice_due"/.test(advance));
check("and says what to do about it", /balance invoice is due/i.test(advance));

console.log("\nthe $0 cause is fixed behind the flag\n");
check("estimated_value is the fallback", /SELECT estimated_value FROM jobs/.test(src));
check("the estimate still wins when there is one", /if \(fromEstimate > 0\) return fromEstimate;/.test(src));
check("a change order still uses its own amount, not the job's value",
      /invoiceType === "change_order"/.test(src) &&
      /const amount = Number\(changeOrderAmount \?\? 0\);/.test(src));

console.log("\nthe screen no longer promises something that does not happen\n");
check("the old promise is gone", !/created automatically when the client signs/.test(panel));
check("and it says how invoices actually get made", /raised by hand/i.test(panel));

console.log("\na draft invoice has no number, and does not print one\n");
check("no unguarded 'Invoice #{invoice.invoice_number}' anywhere",
      !/Invoice #\{invoice\.invoice_number\}/.test(panel),
      "a draft has invoice_number null and would render 'Invoice #'");
check("the guarded form is used", (panel.match(/invoice\.invoice_number \?/g) || []).length >= 2);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
