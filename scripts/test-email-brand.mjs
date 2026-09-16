#!/usr/bin/env node
/**
 * test-email-brand.mjs — the emails look like ACC.
 *
 * No database, no network, nothing sent.
 *
 * WHY. Karl, reading all twenty rendered side by side: "The branding is claude
 * basic, not ACC colors and logo." The header was navy, the orange appeared
 * once in the entire file, and there was no logo in any template — a generic
 * blue email from a company whose sign and truck are grey and orange.
 *
 * The parts that are easy to undo by accident, and are therefore pinned here:
 * the navy not creeping back, the logo surviving with images blocked, and the
 * link colour staying readable. That last one is the subtle one — reaching for
 * the bright brand orange on white feels more on-brand and is close to
 * illegible at 13px.
 */
import { readFileSync } from "node:fs";
import * as T from "../lib/email-templates.ts";

let pass = 0, fail = 0;
const check = (n, c, d = "") => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${d ? "  -> " + d : ""}`)); };

const src = readFileSync(new URL("../lib/email-templates.ts", import.meta.url), "utf8");
// Assertions are about the CODE. The comments explain what was removed and
// naming it there is not the same as still using it — tripped over this three
// times in one session.
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const D = {
  jobId:"26401", clientName:"Kenny Debaene", clientFirstName:"Kenny", siteAddress:"5712 Davenport",
  city:"Coeur d'Alene", pm:"Karl Vaage", pmPhone:"208-772-2377", pmEmail:"karlv@advancedcabinets.net",
  yourName:"Karl Vaage", yourPhone:"208-772-2377", yourEmail:"karlv@advancedcabinets.net",
  builderCompany:"Atlas Builders", displayName:"Atlas Builders", username:"atlas",
  tempPassword:"TempPass123", portalUrl:"https://www.advancedcabinets.org/portal",
  signoffUrl:"https://www.advancedcabinets.org/signoff/abc", deliveryDate:"November 20, 2026",
  amount:"12,500.00", invoiceNumber:"1042", leadName:"Sam Prospect", leadEmail:"sam@example.com",
  clientEmail:"kenny@example.com", message:"Looking for a quote.", comment:"Move the pulls.",
  commentBody:"Move the pulls.", jobLabel:"#26401", changedBy:"Karl Vaage", eventType:"Install",
  lineItems:[{description:"Kitchen cabinets",amount:42500}],
};

const rendered = Object.entries(T)
  .filter(([, f]) => typeof f === "function")
  .map(([n, f]) => { try { return [n, f(D)]; } catch { return [n, null]; } })
  .filter(([, r]) => r && r.html);

/*
  This used to read `rendered.length === 14`, and adding the fifteenth template
  (punchList, 2026-09-16) turned the suite red for the crime of doing the thing
  the suite exists to encourage. A hardcoded count tests the calendar, not the
  code. What actually matters is that NO exported template fails to render —
  every one of them is asked, and any that throws or returns no html is named.
*/
const exported = Object.entries(T).filter(([, f]) => typeof f === "function");
const broken = exported.map(([n]) => n).filter((n) => !rendered.some(([r]) => r === n));
console.log(`\n${rendered.length} of ${exported.length} templates render HTML\n`);
check("every exported template renders", broken.length === 0, broken.join(", "));
check("and there is more than a handful of them", rendered.length >= 14,
      `${rendered.length} — a sudden drop means an export was lost`);

console.log("\nthe navy is gone\n");
check("no BRAND_NAVY constant", !/BRAND_NAVY/.test(code));
check("no #1e3a5f anywhere in the code", !/#1e3a5f/.test(code));
check("and none of it reaches the output", rendered.every(([, r]) => !/#1e3a5f/i.test(r.html)),
      (rendered.find(([, r]) => /#1e3a5f/i.test(r.html)) || [""])[0]);

console.log("\nACC's colours are in every single one\n");
for (const [name, r] of rendered) {
  check(`${name}: dark header and orange rule`,
        r.html.includes("#1a1a1a") && r.html.includes("#f08122"));
}

console.log("\nthe logo is there, and survives being blocked\n");
check("every template carries the logo", rendered.every(([, r]) => r.html.includes("/logo.png")));
check("it has real alt text, not empty", rendered.every(([, r]) => /alt="Advanced Custom Cabinets"/.test(r.html)),
      "a blocked image with no alt leaves a blank box where the brand should be");
check("the company name is live text, not only in the picture",
      rendered.every(([, r]) => r.html.includes(">Advanced Custom Cabinets</div>")));
check("the header colour is CSS, not part of the image",
      rendered.every(([, r]) => /background:#1a1a1a/.test(r.html)),
      "images off must still show a dark ACC header");
check("the logo url comes from the site constant", /LOGO_URL = `\$\{SITE_URL\}\/logo\.png`/.test(code));
check("width is capped so it cannot blow out a narrow client",
      rendered.every(([, r]) => /max-width:140px/.test(r.html)));

console.log("\nlinks stay readable\n");
check("inline links use the deepened orange, not the bright one",
      rendered.every(([, r]) => !/<a [^>]*color:#f08122/i.test(r.html)),
      "#f08122 on white is ~2.6:1 — it looks on-brand and cannot be read");
check("the deepened link colour is defined", /BRAND_LINK\s*=\s*"#b5590c"/.test(code));

console.log("\nthe call-to-action button reads\n");
{
  const withCta = rendered.filter(([, r]) => /background:#f08122;color:#1a1a1a/.test(r.html));
  check("at least one template has a CTA", withCta.length > 0);
  check("dark text on orange, never white", !rendered.some(([, r]) => /background:#f08122;color:#fff/i.test(r.html)),
        "white on that orange is about 2.6:1");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
