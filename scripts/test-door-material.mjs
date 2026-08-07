/**
 * test-door-material.mjs — base door material is derived, and the release gate
 * accepts the derived value.
 *
 * The bug this closes: validateForRelease() demanded
 * finish_group_door_fronts.material_id, a column written only by the Schedules tab
 * — which is imported nowhere. So the gate asked for information the app gave
 * nobody a place to enter, and every spec failed on "base door material" forever.
 *
 *   npx tsx scripts/test-door-material.mjs
 */
import { readFileSync } from "node:fs";

const { deriveDoorMaterial, resolveDoorMaterial, hasDoorMaterial, describeMissingDoorMaterial, finishTypesOf, speciesAllowedFor } =
  await import("../lib/door-material.ts");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
}
const fg = (finish_type, species = null, color_name = null) => ({ finish_type, species, color_name });

console.log("\n1. Door material follows the finish group");
check('paint  -> species', deriveDoorMaterial(fg("paint", "Paint Grade")) === "Paint Grade");
check('stain  -> species', deriveDoorMaterial(fg("stain", "White Oak - Rift & Quartered")) === "White Oak - Rift & Quartered");
check('melamine -> the melamine colour, NOT a species',
  deriveDoorMaterial(fg("melamine", "Maple (Hard)", "Valenti Walnut")) === "Valenti Walnut");
check('plam -> the laminate colour', deriveDoorMaterial(fg("plam", null, "Matte White")) === "Matte White");

console.log("\n2. It never guesses");
check("paint with no species yields nothing", deriveDoorMaterial(fg("paint", null)) === "");
check("melamine with no colour yields nothing", deriveDoorMaterial(fg("melamine", null, null)) === "");
check("no finish type and no species yields nothing", deriveDoorMaterial(fg(null)) === "");
check("whitespace-only species counts as absent", deriveDoorMaterial(fg("paint", "   ")) === "");

console.log("\n3. An explicit material_id still wins");
// door_materials is not deleted — there are real jobs where the door differs
// from the group species. It just stops being mandatory.
check("explicit name overrides the derived species",
  resolveDoorMaterial("MDF Primed", fg("paint", "Alder")) === "MDF Primed");
check("blank explicit falls through to derived",
  resolveDoorMaterial("", fg("paint", "Alder")) === "Alder");
check("null explicit falls through to derived",
  resolveDoorMaterial(null, fg("stain", "Cherry")) === "Cherry");

console.log("\n4. The release gate");
check("passes on an explicit material_id even with no species",
  hasDoorMaterial("DM-010", fg("paint", null)));
check("passes on a derived species with no material_id",
  hasDoorMaterial(null, fg("paint", "Paint Grade")));
check("passes on a melamine colour with no material_id",
  hasDoorMaterial(null, fg("melamine", null, "Valenti Walnut")));
check("STILL blocks when there is genuinely nothing",
  !hasDoorMaterial(null, fg("paint", null)));
check("blocks when finish type has not been chosen",
  !hasDoorMaterial(null, fg(null, null, null)));

console.log("\n5. The message names the fix, not the null column");
check("paint asks for a species", /species/i.test(describeMissingDoorMaterial(fg("paint"))));
check("melamine asks for a colour", /colour|color/i.test(describeMissingDoorMaterial(fg("melamine"))));
check("unset finish type asks for the finish type first",
  /finish type/i.test(describeMissingDoorMaterial(fg(null))));

console.log("\n6. The species catalog backs the paint/stain split");
const species = JSON.parse(readFileSync("data/catalogs/species.json", "utf8"));
const forType = (t) => species
  .filter((s) => finishTypesOf(s.finish_types).includes(t))
  .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99))
  .map((s) => s.name);
const paint = forType("paint"), stain = forType("stain");

check("every species declares its finish types",
  species.every((s) => finishTypesOf(s.finish_types).length > 0),
  species.filter((s) => finishTypesOf(s.finish_types).length === 0).map((s) => s.id).join(", "));
// sync-catalogs turns "paint;stain" into an array but leaves "paint" a string.
// Both shapes have to work or the dropdown loses half its options.
check("finishTypesOf handles the array shape", JSON.stringify(finishTypesOf(["paint","stain"])) === '["paint","stain"]');
check("finishTypesOf handles the string shape", JSON.stringify(finishTypesOf("paint")) === '["paint"]');
check("a row declaring nothing is offered everywhere, not nowhere",
  speciesAllowedFor(null, "paint") && speciesAllowedFor(null, "stain"));
check('"Paint Grade" is the first paint option', paint[0] === "Paint Grade", paint.join(" | "));
// Karl: "I think we do PAINT GRADE, RED OAK, WHITE OAK, RIFT WHITE OAK, and Other."
// Rift is a GRADE of White Oak, so it appears in the grade dropdown, not here.
for (const n of ["Paint Grade", "Red Oak", "White Oak", "Other"]) {
  check(`paint list offers "${n}"`, paint.includes(n), paint.join(" | "));
}
check("Rift & Quartered is a grade of White Oak, not its own species",
  String(species.find((s) => s.name === "White Oak")?.grades ?? "").includes("Rift"));
check('"Paint Grade" is NOT offered under stain', !stain.includes("Paint Grade"), stain.join(" | "));
check("stain offers the stain species", ["Cherry", "Walnut", "Hickory"].every((n) => stain.includes(n)), stain.join(" | "));
check("Poplar and MDF are paint-only", !stain.includes("Poplar") && !stain.includes("MDF"));
check("both lists have an Other escape hatch", paint.includes("Other") && stain.includes("Other"));

console.log("\n7. End to end: a paint spec with only a species now releases");
// Before this change these five had to be satisfied and material_id had no UI.
const gate = (baseDoor, drawer, hinge, group) => {
  const missing = [];
  if (!baseDoor.style_id) missing.push("style");
  if (!hasDoorMaterial(baseDoor.material_id, group)) missing.push("material");
  if (!drawer.drawer_box_id) missing.push("box");
  if (!drawer.slides_id) missing.push("slides");
  if (!hinge.hardware_id) missing.push("hinges");
  return missing;
};
const seeded = { drawer_box_id: "DBX-001", slides_id: "DS-ACC-STD" };
const hinge = { hardware_id: "HH-BLU-110" };
check("paint + species passes all five",
  gate({ style_id: "DS-CD-116", material_id: null }, seeded, hinge, fg("paint", "Paint Grade")).length === 0);
check("paint with NO species still blocks, and only on material",
  JSON.stringify(gate({ style_id: "DS-CD-116", material_id: null }, seeded, hinge, fg("paint", null))) === '["material"]');
check("melamine + colour passes all five",
  gate({ style_id: "DS-SLAB", material_id: null }, seeded, hinge, fg("melamine", null, "Valenti Walnut")).length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
