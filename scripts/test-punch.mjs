#!/usr/bin/env node
/**
 * test-punch.mjs — the punch loop can actually be closed.
 *
 * No database, no network, nothing sent.
 *
 * WHY. Karl: "i also want you to test teh punch systems and fix it. currently
 * it has several things that prevent it from working."
 *
 * Four things did, and every one of them was the client and the API disagreeing
 * about the shape of the same payload:
 *
 *   1. uploadPhoto() read `body.url`; the route returns `{ photos: [{ url }] }`.
 *      Always undefined, so handleComplete treated a perfectly good upload as a
 *      failure and returned BEFORE the PATCH. Nobody could close an item.
 *   2. The card rendered item.before_photo_url / item.after_photo_url. The API
 *      sends a `photos` array. No photo ever appeared.
 *   3. The upload sent form field "which"; the route reads "label".
 *   4. The status union was open|done. The API stores scheduled and wont_fix
 *      too, so items in those states matched no filter and vanished.
 *
 * A LESSON THIS FILE IS BUILT AROUND: four times in this codebase a source
 * assertion has passed by matching the COMMENT explaining the change rather
 * than the code making it. Everything below is checked against comment-stripped
 * source. Do not remove strip().
 */
import { readFileSync } from "node:fs";
import { TRANSITION_GATES } from "../lib/transition-gates.ts";
import { NOTIFICATION_EVENTS } from "../lib/notification-events.ts";

let pass = 0, fail = 0;
const check = (n, c, d = "") => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${d ? "  -> " + d : ""}`)); };

/**
 * Source with every comment removed, so an assertion can only match real code.
 *
 * This started life as two .replace() calls and was wrong within the hour:
 * PunchListPanel.tsx contains accept="image/*", and a regex looking for the
 * next *\/ happily ate from inside that string all the way to the end of the
 * next real comment — taking a hundred lines of live code with it, so three
 * true assertions reported FAIL. A scanner that knows what a string is costs
 * twenty lines and cannot make that mistake.
 */
function strip(path) {
  const src = readFileSync(new URL(path, import.meta.url), "utf8");
  let out = "", i = 0, quote = null;
  while (i < src.length) {
    const c = src[i], next = src[i + 1];
    if (quote) {
      if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; i++; continue; }
    if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (c === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      i = end === -1 ? src.length : end;
      continue;
    }
    out += c; i++;
  }
  return out;
}

const panel   = strip("../components/PunchListPanel.tsx");
const itemApi = strip("../app/api/punch-items/[itemId]/route.ts");
const jobApi  = strip("../app/api/jobs/[id]/punch-items/route.ts");
const photoApi= strip("../app/api/punch-items/[itemId]/photo/route.ts");
const page    = strip("../app/punch/page.tsx");

console.log("\n1. the photo upload and the route agree on the payload\n");
check("uploadPhoto sends the field the route reads",
      panel.includes('form.append("label"') && !panel.includes('form.append("which"'),
      "the route does form.get('label'); every stored photo has label null because this said 'which'");
check("photo route still reads that field", photoApi.includes('form.get("label")'));
check("uploadPhoto reads photos[0].url, not body.url",
      panel.includes("body.photos?.[0]?.url") && !/body\.url/.test(panel),
      "body.url is undefined on a successful upload — this is what blocked every close");
check("a failed upload is distinguishable from a URL-less success",
      panel.includes("type UploadResult") && panel.includes("{ ok: true; url: string | null }"),
      "string|null cannot tell 'uploaded, no URL' from 'upload failed'");

console.log("\n2. an item can be closed\n");
check("handleComplete PATCHes after the upload", panel.includes('setStatus("done")'));
check("handleComplete no longer returns on a missing URL",
      !/const url = await uploadPhoto/.test(panel),
      "the old code did `if (!url) { setError('Photo upload failed'); return; }`");
check("a photo is only demanded of field roles",
      panel.includes("photoRequired && !afterFile"),
      "PM/admin close items at a desk with no camera in hand");
check("field roles are still required to leave one",
      panel.includes("const photoRequired = !canManage;"));
check("the server's own error text reaches the screen",
      panel.includes("body.error ??"),
      "'Could not mark item done' hides a 403 and a 409 behind the same words");

console.log("\n3. photos render\n");
check("the card reads the photos array", panel.includes("item.photos.map("));
check("the dead field names are gone",
      !panel.includes("before_photo_url") && !panel.includes("after_photo_url"),
      "these were never on the payload");
check("a photo whose signed URL failed says so", panel.includes("photo unavailable"),
      "src={null} is a broken-image icon with no explanation");
check("video is not rendered as an <img>", panel.includes('photo.media_type === "video"'));

console.log("\n4. no status makes an item disappear\n");
check("the panel knows all four statuses",
      panel.includes('"open" | "scheduled" | "done" | "wont_fix"'));
check("the panel splits on closed, not on done",
      panel.includes("items.filter((i) => !isClosed(i.status))") &&
      !panel.includes('i.status === "done")'),
      "scheduled and wont_fix matched neither filter and vanished");
check("the API accepts exactly those four",
      itemApi.includes('new Set(["open", "scheduled", "done", "wont_fix"])'));
check("the punch page open tab includes scheduled",
      page.includes("p.status IN ('open', 'scheduled')"));
check("the punch page closed tab includes wont_fix",
      page.includes("p.status IN ('done', 'wont_fix')"));
check("the tab counts come from a count, not from the rows on screen",
      page.includes("fetchCounts()"),
      "'Closed (0)' showed on the Open tab with fifty closed items behind it");
check("won't fix is reachable from the UI",
      panel.includes('setStatus("wont_fix")'),
      "a status the API stores but no button can set is a status that only appears by accident");

console.log("\n4b. nothing else in the app still counts only 'open'\n");
/*
  The panel and /punch were not the only places that assumed two statuses. Five
  more counted status = 'open', and one of them was the gate on marking a job
  complete — so a job with three SCHEDULED punch items and nothing open sailed
  through it. The badges were merely wrong; that one closed jobs with work
  outstanding.
*/
const OPEN_COUNTERS = [
  ["complete gate",     "../app/api/jobs/[id]/advance/route.ts"],
  ["jobs list badge",   "../app/jobs/page.tsx"],
  ["dashboard tile",    "../app/dashboard/page.tsx"],
  ["installer list",    "../app/installer/page.tsx"],
];
for (const [name, path] of OPEN_COUNTERS) {
  const src = strip(path);
  check(`${name}: counts scheduled as outstanding`,
        src.includes("status IN ('open', 'scheduled')"));
  // Scoped to punch_list_items on purpose: app/dashboard/page.tsx also counts
  // warranty_items by status = 'open', which is a different table with its own
  // statuses and must not be dragged into this.
  check(`${name}: no punch query left on bare status = 'open'`,
        !/punch_list_items[\s\S]{0,200}?status\s*=\s*'open'/.test(src),
        "scheduled work is still work");
}
check("the installer job page no longer queries columns that do not exist",
      !/SELECT id, description, status, resolved_at FROM punch_list_items/
        .test(strip("../app/installer/jobs/[id]/page.tsx")),
      "punch_list_items has item_description and completed_at; that query threw on every page load and .catch(() => []) hid it");

console.log("\n5. the three punch routes agree on who may use them\n");
const roles = /const PUNCH_ROLES = \[([^\]]+)\]/;
const lists = [["item", itemApi], ["job", jobApi], ["photo", photoApi]].map(([n, src]) => {
  const m = src.match(roles);
  check(`${n} route declares a role list`, !!m);
  return m?.[1].replace(/\s/g, "");
});
check("all three lists are identical", lists[0] && lists.every((l) => l === lists[0]),
      `got ${JSON.stringify(lists)}`);
check("engineer and shop are on it",
      (lists[0] ?? "").includes("engineer") && (lists[0] ?? "").includes("shop"),
      "the panel offers every internal role an Add button; the guard 403'd two of them");
check("no route is left on the old three-role list",
      ![itemApi, jobApi, photoApi].some((s) => s.includes('guardApi(["admin", "pm", "installer"])')));
check("delete is still manager-only", itemApi.includes("actor?.canManage"));
check("the panel's canManage matches lib/punch-auth.ts",
      panel.includes('role === "admin" || role === "karl" || role === "pm"') &&
      strip("../lib/punch-auth.ts").includes('["admin", "karl", "pm"].includes(builder.role)'),
      "when these drift the UI offers a button the server refuses");

console.log("\n6. the photo route does not report success on nothing\n");
check("an empty result is a 400, not a 200", photoApi.includes("results.length === 0"));
check("and it says which file and why", photoApi.includes("rejected.join"));
check("a skipped file is recorded", photoApi.includes("rejected.push("));

console.log("\n7. the client's punch email is ACC's, not the shop's note\n");
const job = {
  id: "ACC-2026-0181", job_number: "26401", client_name: "Kenny Debaene",
  site_address: "5712 Davenport", city: "Coeur d'Alene", pm: "Karl Vaage",
};
const g = TRANSITION_GATES.punch;
check("punch has a client template", typeof g?.clientTemplate === "function",
      "it was the last client-facing gate still sending plain text");
if (typeof g?.clientTemplate === "function") {
  const t = g.clientTemplate(job, "We will call Thursday to set a time.");
  check("renders html", !!t.html && t.html.length > 300);
  check("is ACC-branded", t.html.includes("#1a1a1a") && t.html.includes("#f08122"));
  check("carries the logo", t.html.includes("/logo.png"));
  check("addresses the client by first name", t.html.includes("Kenny"));
  check("explains what a punch list is", /punch phase/i.test(t.text),
        "to a homeowner 'punch' sounds like something went wrong");
  check("answers 'when will it be finished'", /two weeks/i.test(t.text));
  check("carries the PM's note through", t.html.includes("Thursday"));
  check("never shows the internal key", !/ACC-\d{4}-\d+/.test(t.subject + t.text + t.html));
  check("the plain-text body still has paragraph breaks", t.text.includes("\n\n"),
        "filtering the line array on \"\" instead of null collapses every blank line");
  const noNote = g.clientTemplate(job);
  check("reads correctly with no PM note at all", noNote.text.includes("\n\n") &&
        !/undefined|null/.test(noNote.text) && !/\n\n\n/.test(noNote.text));
}
check("the client is a recipient of the gate", g?.recipients.includes("client"));
const ev = NOTIFICATION_EVENTS.find((e) => e.key === "advance.punch");
check("and a recipient in the registry that actually resolves them",
      ev?.toRoles.includes("client"),
      "the gate and lib/notification-events.ts are two separate lists — 0051 shipped broken on exactly this");

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
