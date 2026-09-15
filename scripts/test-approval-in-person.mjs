#!/usr/bin/env node
/**
 * test-approval-in-person.mjs — an in-person approval never looks like a
 * signature.
 *
 * No database, no network, nothing sent.
 *
 * WHY. Karl, 2026-09-15: "I need a check box to indicate client approved in
 * person in lieu of a digital signature ... It will need to send all the same
 * documents, but just won't force the drawn signature." And before that:
 * "Sometimes a handshake and money changing hands is enough. As long as we have
 * WHO clicked the box and WHEN we can audit."
 *
 * So the system now records two different kinds of approval, and one is weaker
 * evidence than the other. Everything here exists to stop the weaker one being
 * dressed up as the stronger one. A document implying a client signed something
 * they did not sign is worse than having no document at all — and it is exactly
 * the sort of thing that drifts once somebody edits the wording months from now
 * without knowing why it reads the way it does.
 */
import { readFileSync } from "node:fs";
import {
  APPROVAL_HEADING, APPROVAL_DISCLAIMER, approvalLines, stampApprovalPage,
} from "../lib/approval-page.ts";

let pass = 0, fail = 0;
const check = (n, c, d = "") => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${d ? "  -> " + d : ""}`)); };

const inPerson = {
  method: "in_person", siteAddress: "5712 Davenport", clientName: "Kenny Debaene",
  recordedBy: "Karl Vaage", recordedAt: "2026-09-15T18:42:00.000Z",
};
const signed = {
  method: "signature", siteAddress: "5712 Davenport", clientName: "Kenny Debaene",
  signerName: "Kenny Debaene", signedAt: "2026-09-15T18:42:00.000Z",
  ip: "24.116.0.1", signatureData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
};

console.log("\nthe page says which kind of approval it is\n");
check("in person says so in the heading", /IN PERSON/i.test(APPROVAL_HEADING.in_person), APPROVAL_HEADING.in_person);
check("and says ACC recorded it", /RECORDED BY ACC/i.test(APPROVAL_HEADING.in_person));
check("a signature says signature", /SIGNATURE/i.test(APPROVAL_HEADING.signature));
check("the two headings are not the same", APPROVAL_HEADING.in_person !== APPROVAL_HEADING.signature);

console.log("\nand never claims the client signed\n");
check("the in-person disclaimer says it is NOT a client signature",
      /not a client signature/i.test(APPROVAL_DISCLAIMER.in_person), APPROVAL_DISCLAIMER.in_person);
check("it does not use the word 'signing'", !/\bsigning\b/i.test(APPROVAL_DISCLAIMER.in_person));
check("the signature disclaimer still does", /signing/i.test(APPROVAL_DISCLAIMER.signature));

console.log("\nKarl's audit bar: WHO and WHEN\n");
{
  const lines = approvalLines(inPerson).join("\n");
  check("who recorded it", lines.includes("Karl Vaage"), lines);
  check("labelled as recorded, not signed", /Recorded by:/.test(lines) && !/Signer:/.test(lines));
  check("when", /Date:/.test(lines) && /2026/.test(lines));
  check("it says approved in person in the body too", /Approved:\s+In person/.test(lines));
  check("the client's name is present as the client", /Client:\s+Kenny Debaene/.test(lines));
  check("but never in a signer slot", !/Signer/.test(lines),
        "putting the client in a signer slot is the failure this whole file guards");
}

console.log("\na signature approval is unchanged\n");
{
  const lines = approvalLines(signed).join("\n");
  check("still records the signer", /Signer:\s+Kenny Debaene/.test(lines));
  check("still records the IP", lines.includes("24.116.0.1"));
  check("does not mention in-person", !/in person/i.test(lines));
}

console.log("\nthe PDF actually renders, both ways\n");
{
  const a = await stampApprovalPage(null, inPerson);
  check("in-person page is a PDF", Buffer.isBuffer(a) && a.subarray(0, 5).toString() === "%PDF-", a.subarray(0, 8).toString());
  const b = await stampApprovalPage(null, signed);
  check("signature page is a PDF", Buffer.isBuffer(b) && b.subarray(0, 5).toString() === "%PDF-");
  check("they are not byte-identical", Buffer.compare(a, b) !== 0);

  // A corrupt signature must cost the picture, not the whole document.
  const c = await stampApprovalPage(null, { ...signed, signatureData: "data:image/png;base64,SVRTQlJPS0VO" });
  check("a corrupt signature image still produces a document",
        Buffer.isBuffer(c) && c.subarray(0, 5).toString() === "%PDF-",
        "throwing here would lose an approval that really happened");
}

console.log("\nthe send route wires it up\n");
{
  const route = readFileSync(new URL("../app/api/jobs/[id]/send-contract/route.ts", import.meta.url), "utf8");
  check("it reads the checkbox", /body\.approved_in_person === true/.test(route));
  check("an in-person send is recorded as signed straight away", /inPerson \? "signed" : "pending"/.test(route));
  check("with the method stored", /inPerson \? "in_person" : "signature"/.test(route));
  check("and who + when", /in_person_at, in_person_by/.test(route) && /inPerson \? actor : null/.test(route));
  /*
    Strip comments first. The route TALKS about signature_data in a comment
    explaining why it never writes one, and a naive search matches that and
    reports a failure for the very thing it is checking is absent.
  */
  const routeCode = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  check("no SQL here ever writes signature_data", !/signature_data/.test(routeCode),
        "the client did not sign; nothing should suggest they did");
  check("nor signer_name", !/signer_name/.test(routeCode));
  check("it still emails the same documents", /contractSent\(/.test(route) && /sendEmail\(/.test(route));
  check("and logs it to the job timeline", /eventType: "approved_in_person"/.test(route));
}

console.log("\nthe client can still sign afterwards\n");
{
  const sig = readFileSync(new URL("../app/api/signoffs/[token]/route.ts", import.meta.url), "utf8");
  check("an in-person approval with no signature is not a closed door",
        /approvedInPersonAwaitingSignature/.test(sig));
  check("signing twice is still refused", /Already signed/.test(sig));
  check("the guard checks for an absent signature", /!signoff\.signature_data/.test(sig));

  const page = readFileSync(new URL("../app/signoff/[token]/page.tsx", import.meta.url), "utf8");
  check("the page tells them their approval is on file", /already on file/i.test(page));
  check("and that nothing further is needed", /Nothing further is needed/i.test(page));
  check("it does not show them the 'already signed' dead end", /alreadySigned = signoff\.status === "signed" && !approvedInPerson/.test(page));
}

console.log("\nthe column exists in the schema script\n");
{
  const db = readFileSync(new URL("../scripts/db-push.mjs", import.meta.url), "utf8");
  for (const col of ["approval_method", "in_person_at", "in_person_by"]) {
    check(`${col} is added`, new RegExp(`ADD COLUMN IF NOT EXISTS ${col}`).test(db));
  }
  check("approval_method defaults to 'signature' so old rows keep their meaning",
        /approval_method TEXT NOT NULL DEFAULT 'signature'/.test(db));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
