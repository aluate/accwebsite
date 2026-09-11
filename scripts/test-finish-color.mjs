#!/usr/bin/env node
/**
 * test-finish-color.mjs — a finish group has to say what colour it is.
 *
 * No database, no network.
 *
 * WHY. The colour requirement was removed in May 2026 because the v2 Schedules
 * tab was going to carry it. That tab never shipped, so the requirement landed
 * nowhere and no part of the system asked for a colour again. Verified on
 * production: a painted spec with color_id NULL saved clean, reported zero
 * unfilled fields, and reached RELEASED_TO_ENG.
 *
 * These assertions hold both halves of the rule at once: a group that names its
 * colour in EITHER vocabulary passes (so the original complaint cannot return),
 * and a group that names it in neither does not.
 */
import { hasFinishColour, needsColour, colourFieldLabel, FINISH_TYPES_NEEDING_COLOUR } from "../lib/finish-color.ts";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

console.log("\nwhich finish types have to name a colour\n");
for (const t of ["paint", "stain", "melamine", "plam"]) {
  check(`${t} does`, needsColour(t));
}
check("an unset finish type does not (it is caught as its own violation)", !needsColour(""));
check("null does not", !needsColour(null));
check("the list has not quietly shrunk", FINISH_TYPES_NEEDING_COLOUR.length === 4);

console.log("\nthe legacy vocabulary satisfies it\n");
check("paint with a catalog colour id", hasFinishColour({ finish_type: "paint", color_id: "PC-1234" }));
check("paint with only a typed colour name", hasFinishColour({ finish_type: "paint", color_name: "SW 7008 Alabaster" }));
check("stain with a catalog colour id", hasFinishColour({ finish_type: "stain", color_id: "ST-9" }));
check("melamine with a catalog colour id", hasFinishColour({ finish_type: "melamine", color_id: "MEL-3" }));

console.log("\nthe v2 vocabulary satisfies it too\n");
check("paint via paint_id", hasFinishColour({ finish_type: "paint", paint_id: "P-1" }));
check("stain via stain_id", hasFinishColour({ finish_type: "stain", stain_id: "S-1" }));
check("a stain_id does NOT satisfy a paint group", !hasFinishColour({ finish_type: "paint", stain_id: "S-1" }));
check("a paint_id does NOT satisfy a stain group", !hasFinishColour({ finish_type: "stain", paint_id: "P-1" }));

console.log("\nand nothing does not\n");
check("paint with no colour anywhere fails", !hasFinishColour({ finish_type: "paint" }));
check("stain with no colour anywhere fails", !hasFinishColour({ finish_type: "stain", color_id: null, color_name: null }));
check("melamine with no colour fails", !hasFinishColour({ finish_type: "melamine" }));
check("plam with no colour fails", !hasFinishColour({ finish_type: "plam" }));
check("whitespace is not a colour", !hasFinishColour({ finish_type: "paint", color_name: "   " }));
check("an empty string is not a colour", !hasFinishColour({ finish_type: "paint", color_id: "" }));

console.log("\nthe exact production case\n");
// The group that reached RELEASED_TO_ENG on 2026-09-11.
const theOne = {
  finish_type: "paint", color_id: null, color_name: null,
  door_style_id: "DS-CD-116", species: "Maple (Hard)", edgeband_id: "MATCH_PAINT_STAIN",
};
check("it would now be refused", !hasFinishColour(theOne));
check("and it is named as a paint colour", colourFieldLabel(theOne.finish_type) === "Paint colour");

console.log("\nlabels match the finish type\n");
check("stain", colourFieldLabel("stain") === "Stain colour");
check("melamine", colourFieldLabel("melamine") === "Melamine colour");
check("plam", colourFieldLabel("plam") === "Laminate colour");
check("anything else falls back", colourFieldLabel("mystery") === "Colour");

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
