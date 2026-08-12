#!/usr/bin/env node
/**
 * test-trim-defaults.mjs — the rules that protect measured work.
 *
 * Trim carries the one number in a spec nobody can re-derive: linear feet. A size is
 * a standard someone will correct if it is wrong. LF is a measurement of a specific
 * room, and if it is ever defaulted, overwritten, or dropped, the mistake reaches a
 * cut list looking exactly like a real measurement.
 *
 * So most of what follows asserts what does NOT happen.
 *
 *   npx tsx scripts/test-trim-defaults.mjs
 */
import { deriveRoomTrim, retrimForFinishGroupSwap, defaultSizeFor, defaultMaterialFor } from "../lib/trim-defaults.ts";
import { defaultTrimSize, trimMaterialForFinishGroup, FG_TRIM_DEFAULT_TYPES, canonicalTrimType } from "../lib/trim-types.ts";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

// Catalog as shipped, including the placeholders that must NOT print as dimensions.
const MOLDINGS = [
  { id: "MTYPE-001", display_name: "Toe Skin",       typical_size: '3/4" x 4.5"' },
  { id: "MTYPE-004", display_name: "Filler",         typical_size: '2.5" x 2.5"' },
  { id: "MTYPE-005", display_name: "Light Rail",     typical_size: '3/4" x 2"' },
  { id: "MTYPE-007", display_name: "Crown Molding",  typical_size: "varies" },
  { id: "MTYPE-012", display_name: "Other (specify)",typical_size: "—" },
];

const MEL = { id: "fg-mel", finish_type: "melamine", species: null,  color_name: "MOAB RIFT" };
const STN = { id: "fg-stn", finish_type: "stain",    species: "White Oak - Rift", color_name: "Provincial" };

const defs = (fgId, types) => types.map((t, i) => ({
  finish_group_id: fgId, trim_type: t, species_material: null, size_desc: null, notes: null, sort_order: i,
}));
const MEL_DEFAULTS = defs("fg-mel", ["Filler", "Toe Skin", "Crown Molding", "Light Rail"]);
const STN_DEFAULTS = defs("fg-stn", ["Filler", "Toe Skin"]);

const row = (o) => ({
  id: o.id, room_id: "room-1", trim_type: o.trim_type, size_desc: o.size_desc ?? null,
  material: o.material ?? null, qty_lf: o.qty_lf ?? 0, notes: null,
  sort_order: o.sort_order ?? 0, source: o.source ?? "manual",
});

// ── 1. Karl's standing sizes come from the catalog ──────────────────────────
console.log("\n1. Sizes come from the catalog, placeholders do not");
check('Filler defaults to 2.5" x 2.5"',   defaultSizeFor("Filler", undefined, MOLDINGS) === '2.5" x 2.5"');
check('Toe Skin defaults to 3/4" x 4.5"', defaultSizeFor("Toe Skin", undefined, MOLDINGS) === '3/4" x 4.5"');
check('Light Rail defaults to 3/4" x 2"', defaultSizeFor("Light Rail", undefined, MOLDINGS) === '3/4" x 2"');
check('Crown stays blank — free entry',   defaultSizeFor("Crown Molding", undefined, MOLDINGS) === "");
check('"—" is a placeholder, not a size',  defaultSizeFor("Other (specify)", undefined, MOLDINGS) === "");
check("legacy name still resolves (Fillers -> Filler)",
  defaultSizeFor("Fillers", undefined, MOLDINGS) === '2.5" x 2.5"');
check("a finish-group size beats the catalog",
  defaultSizeFor("Filler", { size_desc: '3" x 3"' }, MOLDINGS) === '3" x 3"');

// ── 2. Material follows the finish group ────────────────────────────────────
console.log("\n2. Material follows the finish group");
check("melamine trim reads the melamine", defaultMaterialFor(undefined, MEL) === "MOAB RIFT");
check("stain trim reads the species",     defaultMaterialFor(undefined, STN) === "White Oak - Rift");
check("an explicit FG material wins",     defaultMaterialFor({ species_material: "MEL - 3" }, MEL) === "MEL - 3");

// ── 3. Populating a room that has no trim yet ───────────────────────────────
console.log("\n3. A room with no trim gets the group's defaults");
{
  const { added, updated } = deriveRoomTrim({ fg: MEL, fgDefaults: MEL_DEFAULTS, moldingTypes: MOLDINGS, existing: [] });
  check("one row per finish-group default", added.length === 4, `${added.length}`);
  check("every added row has LF of zero — never guessed", added.every((r) => r.qty_lf === 0));
  check("added rows are marked fg_default", added.every((r) => r.source === "fg_default"));
  check("sizes filled from the catalog", added.find((r) => r.trim_type === "Filler")?.size_desc === '2.5" x 2.5"');
  check("crown added with no size", added.find((r) => r.trim_type === "Crown Molding")?.size_desc === null);
  check("material derived for all", added.every((r) => r.material === "MOAB RIFT"));
  check("nothing to update on an empty room", updated.length === 0);
}

// ── 4. Defaults fill blanks and do not overwrite ────────────────────────────
console.log("\n4. Defaults fill blanks; a typed value survives");
{
  const existing = [
    row({ id: "t1", trim_type: "Filler", size_desc: '6" x 6"', material: "Custom Oak", qty_lf: 42.5 }),
    row({ id: "t2", trim_type: "Toe Skin" }),
  ];
  const { added, updated } = deriveRoomTrim({ fg: MEL, fgDefaults: MEL_DEFAULTS, moldingTypes: MOLDINGS, existing });
  const t1 = updated.find((u) => u.id === "t1");
  const t2 = updated.find((u) => u.id === "t2");
  check("a typed size is not overwritten", t1?.size_desc === undefined, JSON.stringify(t1));
  check("a typed material is not overwritten", t1?.material === undefined);
  check("a blank row gets filled", t2?.size_desc === '3/4" x 4.5"' && t2?.material === "MOAB RIFT");
  check("missing types are added", added.length === 2, added.map((a) => a.trim_type).join(","));
  check("no update carries an LF field at all", updated.every((u) => !("qty_lf" in u)));
}

// ── 5. "Apply to all rooms" — the one case that may overwrite ───────────────
console.log("\n5. Apply-to-all overwrites size and material, never LF");
{
  const existing = [row({ id: "t1", trim_type: "Filler", size_desc: '6" x 6"', material: "Custom Oak", qty_lf: 42.5 })];
  const { updated } = deriveRoomTrim({ fg: MEL, fgDefaults: MEL_DEFAULTS, moldingTypes: MOLDINGS, existing, overwrite: true });
  const t1 = updated.find((u) => u.id === "t1");
  check("size is overwritten when asked", t1?.size_desc === '2.5" x 2.5"');
  check("material is overwritten when asked", t1?.material === "MOAB RIFT");
  check("LF is still never touched", !("qty_lf" in (t1 ?? {})));
}

// ── 6. The finish-group swap: Karl's kitchen, MEL-1 -> STN-1 ────────────────
console.log("\n6. Swapping a room from MEL-1 to STN-1");
{
  const existing = [
    row({ id: "t1", trim_type: "Filler",        size_desc: '2.5" x 2.5"', material: "MOAB RIFT", qty_lf: 168, source: "fg_default" }),
    row({ id: "t2", trim_type: "Toe Skin",      size_desc: '3/4" x 4.5"', material: "MOAB RIFT", qty_lf: 192, source: "fg_default" }),
    row({ id: "t3", trim_type: "Crown Molding", size_desc: 'MMW CR037',   material: "MOAB RIFT", qty_lf: 48,  source: "manual" }),
    row({ id: "t4", trim_type: "Light Rail",    size_desc: '3/4" x 2"',   material: "MOAB RIFT", qty_lf: 168, source: "fg_default" }),
  ];
  const res = retrimForFinishGroupSwap({ fg: STN, fgDefaults: STN_DEFAULTS, moldingTypes: MOLDINGS, existing });

  check("every row's material re-derives to the new finish",
    res.updated.length === 4 && res.updated.every((u) => u.material === "White Oak - Rift"),
    JSON.stringify(res.updated));
  check("no update touches LF", res.updated.every((u) => !("qty_lf" in u)));

  const t3 = res.updated.find((u) => u.id === "t3");
  check("a hand-added row keeps its typed size", t3?.size_desc === undefined, JSON.stringify(t3));

  check("types the new group does not default are kept, not deleted",
    res.updated.some((u) => u.id === "t3") && res.updated.some((u) => u.id === "t4"));
  check("defaulted rows the new group drops are reported for review",
    res.orphaned.length === 1 && res.orphaned[0].id === "t4",
    res.orphaned.map((o) => o.trim_type).join(","));
  check("a hand-added row is never reported as orphaned",
    !res.orphaned.some((o) => o.id === "t3"));
  check("nothing is added that the room already has", res.added.length === 0,
    res.added.map((a) => a.trim_type).join(","));
}

// ── 7. Idempotency — a second pass changes nothing ──────────────────────────
console.log("\n7. Running twice changes nothing the second time");
{
  const first = deriveRoomTrim({ fg: MEL, fgDefaults: MEL_DEFAULTS, moldingTypes: MOLDINGS, existing: [] });
  const settled = first.added.map((r, i) => row({
    id: `n${i}`, trim_type: r.trim_type, size_desc: r.size_desc, material: r.material,
    qty_lf: 100, source: "fg_default",
  }));
  const second = deriveRoomTrim({ fg: MEL, fgDefaults: MEL_DEFAULTS, moldingTypes: MOLDINGS, existing: settled });
  check("no rows added on the second pass", second.added.length === 0);
  check("no rows updated on the second pass", second.updated.length === 0, JSON.stringify(second.updated));
  check("the LF entered between passes survives", settled.every((r) => r.qty_lf === 100));
}

// ── 8. What a NEW finish-group trim row arrives pre-filled with ─────────────
//
// Karl: "the fillers, toekicks, and light valance should all have default sizes.
// 2.5x2.5 for filler, .75x4.5 for toe kick, and .75x2 for valance. Crown varies too
// much for us to have a default." And: "THE SPECIES/MATERIAL SHOULD AUTO POPULATE TO
// MATCH THE FG NAME."
//
// Half of these guard the ABSENCE of a default. A number sitting in a size box reads
// as decided — nobody re-checks a filled field — and trim gets cut from it.
console.log("\n8. The sizes a new trim row starts with");
{
  check("filler is 2.5 x 2.5",   defaultTrimSize("Filler")     === '2.5" × 2.5"',  defaultTrimSize("Filler"));
  check("toe skin is .75 x 4.5", defaultTrimSize("Toe Skin")   === '0.75" × 4.5"', defaultTrimSize("Toe Skin"));
  check("light rail is .75 x 2", defaultTrimSize("Light Rail") === '0.75" × 2"',   defaultTrimSize("Light Rail"));

  check("crown molding has NO default", defaultTrimSize("Crown Molding") === "",
    `got ${JSON.stringify(defaultTrimSize("Crown Molding"))} — "crown varies too much for us to have a default"`);
  check("an unknown type has no default", defaultTrimSize("Scribe Molding") === "");
  check("blank and null do not throw", defaultTrimSize("") === "" && defaultTrimSize(null) === "");

  // The trim vocabulary has been renamed before. A legacy spelling must still find
  // its size rather than quietly falling back to an empty box.
  for (const legacy of ["toe skin", "TOE SKIN", " Toe Skin "]) {
    check(`"${legacy}" still resolves`, defaultTrimSize(legacy) === '0.75" × 4.5"',
      `canonical=${canonicalTrimType(legacy)}`);
  }
}

console.log("\n9. The species/material a new trim row starts with");
{
  check("paint names the group, not just the grade",
    trimMaterialForFinishGroup({ finish_type: "paint", label: "PNT-1" }) === "Paint Grade PNT-1",
    trimMaterialForFinishGroup({ finish_type: "paint", label: "PNT-1" }));
  check("a second paint group is distinguishable",
    trimMaterialForFinishGroup({ finish_type: "paint", label: "PNT-2" }) === "Paint Grade PNT-2",
    "two paint groups on one job are two different colours");
  check("stain uses the species",
    trimMaterialForFinishGroup({ finish_type: "stain", species: "Alder", label: "STN-1" }) === "Alder");
  check("melamine uses the colour",
    trimMaterialForFinishGroup({ finish_type: "melamine", color_name: "H3790 Honey Carini Walnut", label: "MEL-1" })
      === "H3790 Honey Carini Walnut");

  check("a stain group with no species yet stays blank",
    trimMaterialForFinishGroup({ finish_type: "stain", label: "STN-1" }) === "",
    "better an empty box than the label pretending to be a species");
  check("a melamine group with no colour yet stays blank",
    trimMaterialForFinishGroup({ finish_type: "melamine", label: "MEL-1" }) === "");
  check("no finish type at all stays blank", trimMaterialForFinishGroup({ label: "X" }) === "");
  check("an unrecognised finish type stays blank",
    trimMaterialForFinishGroup({ finish_type: "plam", label: "PL-1" }) === "");
  check("paint with no label still says Paint Grade",
    trimMaterialForFinishGroup({ finish_type: "paint" }) === "Paint Grade");

  check("all four grid types are canonical names",
    FG_TRIM_DEFAULT_TYPES.every((t) => canonicalTrimType(t) === t));
  check("three of the four come with a size",
    FG_TRIM_DEFAULT_TYPES.filter((t) => defaultTrimSize(t)).length === 3);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
