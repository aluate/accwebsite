#!/usr/bin/env node
/**
 * test-wo-hardware.mjs — one role, one answer on the work order.
 *
 * THE BUG. Found live on ZZ TOP MEL-1 on 2026-08-15. The WORK ORDER HARDWARE block
 * rendered two lists back to back with nothing reconciling them:
 *
 *   finish_group_hardware   role=hinges         -> "Blum 110 CLIP top Blumotion Soft Close"
 *   spec_hardware           type='HINGES'       -> "Blum 170°"
 *
 * Both printed. Same for DRAWER SLIDES: "ACC Standard Undermount Soft-Close" AND
 * "Blum Tandem Plus Blumotion". A shop sheet naming two different hinges tells the
 * bench nothing about which one to hang, and the sheet looked perfectly normal —
 * which is why it survived a function-level test suite and a release gate.
 *
 * THE RULE. Karl: spec level wins. A role typed at spec level overrides the finish
 * group's record for that role. Roles only one side names are untouched.
 *
 * WHY THIS SUITE EXISTS SEPARATELY. The equivalent end-to-end checks live in
 * test-pdf-documents.mjs, but rendering a work order needs a fully seeded catalog:
 * a fresh database cannot currently be built from this repo at all, because nothing
 * here creates catalog_paint_colors and friends — db-push does not, and
 * seed-catalogs assumes they already exist. Until that is fixed the end-to-end
 * checks cannot run on a clean box, so the rule itself is guarded here with no
 * database at all.
 *
 *   node scripts/test-wo-hardware.mjs
 */
import { reconcileWOHardware, hardwareRoleKey } from "../lib/pdf-spec.tsx";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

const fg = (role, role_label) => ({ role, role_label });
const spec = (type) => ({ type });

// ── the shape that was actually on the sheet ────────────────────────────────
{
  const fgHw = [
    fg("hinges", "HINGES"),
    fg("drawer_slides", "DRAWER SLIDES"),
    fg("rollout_slides", "ROLLOUT SLIDES"),
    fg("shelf_clips", "SHELF CLIPS"),
  ];
  const specHw = [spec("HINGES"), spec("DRAWER SLIDES"), spec("CLOSET RODS")];
  const kept = reconcileWOHardware(fgHw, specHw).map((h) => h.role);

  check("the finish group's hinge is dropped when spec level names HINGES",
        !kept.includes("hinges"),
        `kept: ${kept.join(", ")}`);
  check("the finish group's drawer slide is dropped when spec level names DRAWER SLIDES",
        !kept.includes("drawer_slides"));
  check("a finish group role spec level never named survives",
        kept.includes("rollout_slides") && kept.includes("shelf_clips"),
        `kept: ${kept.join(", ")} — suppression is over-reaching`);
  check("exactly the two claimed roles were removed",
        kept.length === 2, `kept ${kept.length}, expected 2`);
}

// ── free text vs controlled vocabulary ──────────────────────────────────────
{
  check("underscored role and spaced free text collapse to the same key",
        hardwareRoleKey("drawer_slides") === hardwareRoleKey("DRAWER SLIDES"));
  check("case does not matter", hardwareRoleKey("Hinges") === hardwareRoleKey("HINGES"));
  check("punctuation and doubled spaces do not matter",
        hardwareRoleKey("  ROLLOUT   SLIDES ") === hardwareRoleKey("rollout_slides"));
  check("an empty role yields an empty key, not a match-everything key",
        hardwareRoleKey("") === "" && hardwareRoleKey(null) === "");
}

// An empty/blank spec type must never suppress anything: Set would otherwise hold ""
// and a finish group row with a blank role would vanish.
{
  const fgHw = [fg("", ""), fg("hinges", "HINGES")];
  const kept = reconcileWOHardware(fgHw, [spec(""), spec("   ")]);
  check("blank spec-level rows suppress nothing",
        kept.length === 2, `kept ${kept.length} of 2`);
}

// ── failing visibly beats failing silently ──────────────────────────────────
{
  const fgHw = [fg("hinges", "HINGES")];
  const kept = reconcileWOHardware(fgHw, [spec("Hinge")]);
  check("a near miss does NOT suppress — the sheet shows both and asks a question",
        kept.length === 1,
        "'Hinge' swallowed 'hinges'; the finish group's real record was dropped silently");
}

// ── degenerate inputs ───────────────────────────────────────────────────────
{
  check("no spec-level hardware keeps every finish group row",
        reconcileWOHardware([fg("hinges", "HINGES")], []).length === 1);
  check("no finish group hardware yields nothing rather than throwing",
        reconcileWOHardware([], [spec("HINGES")]).length === 0);
  check("a spec role matching nothing removes nothing",
        reconcileWOHardware([fg("hinges", "HINGES")], [spec("TOE KICK")]).length === 1);
}

// ── the label side of the pairing ───────────────────────────────────────────
// role and role_label are both checked, so a row whose controlled role drifts from
// its label is still matched on whichever side lines up.
{
  const kept = reconcileWOHardware([{ role: "hng", role_label: "HINGES" }], [spec("HINGES")]);
  check("matching on role_label works when the controlled role differs",
        kept.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
