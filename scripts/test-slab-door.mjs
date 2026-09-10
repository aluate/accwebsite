#!/usr/bin/env node
/**
 * test-slab-door.mjs — a melamine group ends up with a door style.
 *
 * No database, no network.
 *
 * WHY. Switching a finish group to melamine cleared its door style, "so the PM
 * re-picks from the restricted list". The restricted list has one entry. So the
 * clearing left door_style_id empty, no base door-front row was seeded, and the
 * release to engineering was refused for "base door style" on a spec the form
 * had filled in itself and then emptied.
 *
 * The rule these assertions hold: one legal answer is chosen, two legal answers
 * are never guessed between.
 */
import {
  soleSlabDoorStyleId,
  doorStyleForFinishType,
  isSlabOnlyFinishType,
} from "../lib/slab-door.ts";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

const SLAB = { id: "DS-SLAB-MDF", construction: "slab", placeholder: false };
const SHAKER = { id: "DS-SHAKER", construction: "five_piece", placeholder: false };
const SLAB2 = { id: "DS-SLAB-2", construction: "slab", placeholder: false };
const SLAB_PLACEHOLDER = { id: "DS-SLAB-X", construction: "slab", placeholder: "True" };

console.log("\nwhich finish types are slab by construction\n");
check("melamine is", isSlabOnlyFinishType("melamine"));
check("plam is", isSlabOnlyFinishType("plam"));
check("paint is not", !isSlabOnlyFinishType("paint"));
check("stain is not", !isSlabOnlyFinishType("stain"));
check("nothing chosen yet is not", !isSlabOnlyFinishType("") && !isSlabOnlyFinishType(null));

console.log("\nfinding the one slab style\n");
check("one slab style is found", soleSlabDoorStyleId([SLAB, SHAKER]) === "DS-SLAB-MDF");
check("two slab styles is not a choice this code makes", soleSlabDoorStyleId([SLAB, SLAB2]) === null);
check("no slab style at all returns nothing", soleSlabDoorStyleId([SHAKER]) === null);
check("a placeholder row is not a real style", soleSlabDoorStyleId([SLAB, SLAB_PLACEHOLDER]) === "DS-SLAB-MDF");

console.log("\nwhat happens when the finish type changes\n");
check("melamine with a five-piece door gets the slab style",
  doorStyleForFinishType("melamine", "DS-SHAKER", [SLAB, SHAKER]) === "DS-SLAB-MDF");
check("melamine with NO door style gets the slab style — the case that blocked release",
  doorStyleForFinishType("melamine", "", [SLAB, SHAKER]) === "DS-SLAB-MDF");
check("melamine that already has the slab style is left alone",
  doorStyleForFinishType("melamine", "DS-SLAB-MDF", [SLAB, SHAKER]) === undefined);
check("paint is never touched",
  doorStyleForFinishType("paint", "DS-SHAKER", [SLAB, SHAKER]) === undefined);
check("stain is never touched, even with no door style",
  doorStyleForFinishType("stain", "", [SLAB, SHAKER]) === undefined);
check("with two slab styles it clears and lets the PM choose",
  doorStyleForFinishType("melamine", "DS-SHAKER", [SLAB, SLAB2]) === "");
check("plam behaves like melamine",
  doorStyleForFinishType("plam", "", [SLAB, SHAKER]) === "DS-SLAB-MDF");

console.log("\nagainst the real catalog\n");
{
  const csv = readFileSync(new URL("../data/catalogs/door_styles.csv", import.meta.url), "utf8");
  const [head, ...lines] = csv.trim().split("\n");
  const cols = head.split(",");
  // The vendor column holds a quoted JSON list with commas in it, so the split
  // has to respect quotes — a naive one silently shifts every later column and
  // the test then "proves" the catalog has no slab style.
  const splitCsv = (line) => {
    const out = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const rows = lines.map((l) => {
    const parts = splitCsv(l);
    const o = {};
    cols.forEach((c, i) => (o[c] = parts[i]));
    return { id: o.id, construction: o.construction, placeholder: o.placeholder };
  });
  const sole = soleSlabDoorStyleId(rows);
  check("the shipped catalog has exactly one real slab style", sole !== null, `got ${sole}`);
  check("and a melamine group resolves to it rather than to nothing",
    doorStyleForFinishType("melamine", "", rows) === sole, `${doorStyleForFinishType("melamine", "", rows)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
