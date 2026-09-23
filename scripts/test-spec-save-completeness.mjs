#!/usr/bin/env node
/**
 * test-spec-save-completeness.mjs — every button that says it saved the spec has
 * to have saved the parts of it that live outside the main payload.
 *
 * WHY THIS EXISTS.
 *
 * Karl, 2026-09-23, field-testing Jim's Cabin: "when I fill out the FG trim, it's
 * not pulling to the Room list like its supposed to."
 *
 * It was not a propagation bug. POST /api/specs/[id]/save carries exactly four
 * things — finish_groups, rooms, materials, door_fronts. Trim defaults, room
 * trim, pulls, appliances, hardware, accessories and edgeband overrides are each
 * their own endpoint, fired by saveAll() afterwards. Two buttons skipped them:
 *
 *   1. "Save All" branched when any required field was blank and called
 *      save(undefined, true) instead of saveAll(). A spec mid-build almost always
 *      has a blank required field, so for a PM actually building a job the
 *      button that says "Saved" saved four of eleven things.
 *   2. generateSpec() saved accessories, hardware, appliances, pulls and room
 *      trim before generating — and not trim defaults. So the work order printed
 *      without the trim that had just been typed in.
 *
 * Both failed silently. Nothing 400s, nothing turns red; the data is simply not
 * sent. That is why this is a test about WHICH ENDPOINTS GET CALLED rather than
 * about return values — there is no return value to check.
 *
 * Assertions run on comment-stripped source. That is not fussiness: an earlier
 * version of a sibling suite passed because its assertion matched the comment
 * describing the bug rather than the code fixing it, and this file quotes the old
 * broken handler verbatim in a comment.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./strip-source.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => stripComments(readFileSync(join(ROOT, p), "utf8"));

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

const src = read("components/ResidentialSpecClient.tsx");

/* The endpoints that carry the parts of a spec the main save payload does not. */
const SIDE_ENDPOINTS = [
  ["trim-defaults", "finish-group trim defaults — the one Karl lost"],
  ["trim",          "room trim"],
  ["pulls",         "pulls"],
  ["appliances",    "appliances"],
  ["hardware",      "spec hardware"],
  ["accessories",   "spec accessories"],
];

/** The body of a named useCallback, from its declaration to its dependency array. */
function callbackBody(name) {
  const start = src.indexOf(`const ${name} = useCallback(`);
  if (start === -1) return null;
  const end = src.indexOf("\n  }, [", start);
  return end === -1 ? null : src.slice(start, end);
}

console.log("\n1. Save All saves all of it, blank required fields or not\n");
/*
  The invariant is about the CALL, not about any particular spelling of the
  condition: whatever the button decides, it must end up in saveAll(), because
  saveAll() is the only function that posts the side endpoints.
*/
const onClick = (() => {
  const i = src.indexOf("saveAllState === \"saving\" ? \"Saving...\"");
  const region = src.slice(Math.max(0, i - 2500), i);
  const j = region.lastIndexOf("onClick={");
  return j === -1 ? "" : region.slice(j);
})();

check("the Save All button has an onClick", onClick.length > 0);
check("it calls saveAll()", /saveAll\(\)/.test(onClick),
      "saveAll is the only path that posts trim defaults, pulls, appliances, hardware and accessories");
check("it does NOT call the bare spec save instead",
      !/\bsave\(\s*undefined/.test(onClick),
      "this is the exact regression: save(undefined, true) sends four things and reports success");
check("it still surfaces the unfilled required fields",
      /setShowViolations\(\s*true\s*\)/.test(onClick),
      "dropping the branch must not drop the warning — a draft save should still say what is blank");

console.log("\n2. saveAll posts every section that is not in the main payload\n");
const saveAllBody = callbackBody("saveAll");
check("saveAll exists", !!saveAllBody);
for (const [ep, what] of SIDE_ENDPOINTS) {
  check(`saveAll posts ${ep} (${what})`,
        !!saveAllBody && saveAllBody.includes(`/api/specs/\${specId}/${ep}\``));
}
check("saveAll re-reads trim after propagation",
      !!saveAllBody && /fetch\(`\/api\/specs\/\$\{specId\}\/trim`\)/.test(saveAllBody),
      "defaults are propagated server-side, so without a refetch the Rooms tab shows nothing and the next save posts its empty list back");

console.log("\n3. generating a document saves the same things first\n");
const genBody = callbackBody("generateSpec");
check("generateSpec exists", !!genBody);
for (const [ep, what] of SIDE_ENDPOINTS) {
  check(`generateSpec posts ${ep} (${what})`,
        !!genBody && genBody.includes(`/api/specs/\${specId}/${ep}\``),
        ep === "trim-defaults"
          ? "this one was missing — Generate printed a work order without the trim just typed in"
          : "");
}

console.log("\n4. trim defaults go out AFTER room trim, never raced against it\n");
/*
  POST /trim replaces a room's rows from the form's state; POST /trim-defaults
  propagates defaults back onto those rooms. In one Promise.all the winner is
  whichever the network returns last, and trim appeared and vanished by timing.
*/
for (const [name, body] of [["saveAll", saveAllBody], ["generateSpec", genBody]]) {
  if (!body) continue;
  /*
    Located by the BODY each request sends, not by the path and not by the shape
    of the loop. Two earlier versions of this assertion were wrong: the first
    matched saveAll's GET /trim refetch, which legitimately comes last, and the
    second assumed both call sites used a for-of loop, when generateSpec spreads
    rooms.map(...) into a Promise.all. `room_id: r.id` and `finish_group_id: g.id`
    are what the two requests actually carry, in both call sites.
  */
  const iRoomTrim = body.indexOf("room_id: r.id");
  const iDefaults = body.indexOf("finish_group_id: g.id");
  check(`${name}: trim-defaults is sent after room trim`,
        iDefaults > -1 && iRoomTrim > -1 && iDefaults > iRoomTrim,
        "raced, the room's own edits and the propagated defaults overwrite each other by timing");
  check(`${name}: the trim-defaults loop is awaited, not fired into a Promise.all`,
        new RegExp("for \\(const g of groups\\)[\\s\\S]{0,120}await fetch").test(body));
}

console.log("\n5. a useCallback that closes over state declares it\n");
/* CLAUDE.md calls the stale-closure bug the canonical failure mode here. */
function deps(name) {
  const start = src.indexOf(`const ${name} = useCallback(`);
  if (start === -1) return "";
  const at = src.indexOf("\n  }, [", start);
  return at === -1 ? "" : src.slice(at, src.indexOf("]);", at));
}
for (const name of ["saveAll", "generateSpec"]) {
  const d = deps(name);
  check(`${name} declares groups`, /\bgroups\b/.test(d));
  check(`${name} declares fgTrimDefaults`, /\bfgTrimDefaults\b/.test(d),
        "it posts fgTrimDefaults; omitting it here sends the values as they were at page load");
}

console.log("\n6. a melamine colour can be typed, and two of them are never the same word\n");
/*
  Karl, same session: "When I am typing in a melamine I can't type it in. I have
  to find it in the list. That sucks. There's also a ton of duplicates."

  The catalog has no duplicates. It has 366 rows, 366 distinct ids, and no two
  rows alike on brand + code + finish + texture. What repeated was the OPTION
  TEXT, because the label was code + name and the distinguishing attribute is
  finish_type — L203 Black exists four times in Tafisa alone (Materia, Classic,
  InnoColor, KARISMA). Picking between them was a coin toss and the spec recorded
  whichever way it fell, which is a matte panel ordered as a gloss one.

  So the assertions are: the data really is clean, the collisions really do exist
  (otherwise finish would not be load-bearing and this test would be theatre),
  and the control shows finish and can be typed into.
*/
const melamine = JSON.parse(readFileSync(join(ROOT, "data/catalogs/colors_melamine.json"), "utf8"));
const sig = (c) => [c.brand, c.color_code, c.finish_type, c.texture_code].join("|");
const codeName = (c) => [c.color_code, c.color_name].join("|");

const sigs = new Set(melamine.map(sig));
check("no two melamine rows are the same product",
      sigs.size === melamine.length,
      `${melamine.length - sigs.size} row(s) identical on brand+code+finish+texture — those would be real duplicates`);

const codeNameCounts = melamine.reduce((m, c) => m.set(codeName(c), (m.get(codeName(c)) ?? 0) + 1), new Map());
const colliding = [...codeNameCounts.values()].filter((n) => n > 1).reduce((a, n) => a + n, 0);
check("code + name alone is NOT enough to tell them apart",
      colliding > 0,
      "if this ever passes with 0, finish is no longer load-bearing and the label rule below can be relaxed");
console.log(`       (${colliding} of ${melamine.length} rows share a code+name with another row)`);

const everyCollisionHasFinish = [...codeNameCounts.entries()]
  .filter(([, n]) => n > 1)
  .every(([key]) => {
    const group = melamine.filter((c) => codeName(c) === key);
    return new Set(group.map((c) => c.finish_type)).size === group.length;
  });
check("finish_type separates every one of those collisions",
      everyCollisionHasFinish,
      "if finish does not separate them, the label still cannot and something else is needed");

const picker = src.slice(src.indexOf("function ColorPicker("));
check("the melamine/stain control is a text input, not a bare select",
      /<input[\s\S]{0,400}onKeyDown=\{onKeyDown\}/.test(picker),
      "Karl's first complaint: you could not type a colour, only filter a list you then had to open");
check("typing matches against the finish too",
      /\$\{c\.code\}[\s\S]{0,80}prettyFinish/.test(picker),
      "\"black materia\" has to find one row");
check("the stored label carries the finish",
      /function makeLabel[\s\S]{0,300}finish/.test(picker),
      "the label is what gets written to the finish group and printed — code+name+brand was never enough to order from");
check("the dropdown shows the finish on each row",
      (picker.match(/prettyFinish/g) ?? []).length >= 3,
      "it is the attribute being chosen between, so it belongs in the row, not just the stored value");

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
