#!/usr/bin/env node
/**
 * test-door-front-roles.mjs — the door / drawer-front / applied-end rows say what
 * they are.
 *
 * Karl's ask (2026-08-10): "if I have multiple door types in the same finish I need
 * to be able to call them out. OR if I have my 12in drawers 5 piece and the 6in
 * drawers slab I need to be able to call it out. OR if the applied panels are slabs
 * EVERYWHERE BUT THE KITCHEN then I need to call out the shaker panel on the applied
 * ends."
 *
 * That needs repeatable rows AND a role vocabulary where the value written is the
 * value read. It was not:
 *
 *   applied_ends   written by the UI, compared by nothing
 *   applied_end    compared by lib/pdf-spec.tsx, written by nobody
 *   drawer_front   compared by lib/pdf-spec.tsx, written by nobody
 *   upper          written, compared by nothing
 *
 * The consequence is not a missing line, it is a WRONG one. The client spec picks
 * the drawer-front line as "the first door front that is not base and not
 * applied_end" — and since rows are stored as applied_ends, that exclusion never
 * fires, so an Applied Ends row is printed as the Drawer Front. On exactly Karl's
 * example — slab panels everywhere but a shaker panel on the kitchen applied ends —
 * the document the client signs states the wrong drawer front style.
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/test-door-front-roles.mjs
 */
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { pdfText, squash, assertDecodable } from "./_pdf-text.mjs";
import {
  DOOR_FRONT_ROLES,
  DOOR_FRONT_ROLE_LABEL,
  normalizeDoorFrontRole,
  isDoorFrontRole,
  ROLE_BASE,
  ROLE_UPPER,
  ROLE_DRAWER_FRONT,
  ROLE_APPLIED_END,
} from "../lib/door-front-roles.ts";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
const sql = postgres(url, { ssl: isLocal ? false : "require", max: 2, prepare: false });

const { loadSpecPDFData } = await import("../lib/spec-data.ts");
const { renderClientSpecPDFBuffer, renderWorkOrderPDFBuffer } = await import("../lib/pdf-spec.tsx");

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};

const uid = () => randomBytes(6).toString("hex");
const made = [];

const SHAKER = { id: "DS-CD-116",   name: "#116 Standard Shaker" };
const SLAB   = { id: "DS-SLAB-MDF", name: "Slab MDF" };
const RRP    = { id: "DS-CD-113",   name: "#113 Reverse Raised Panel" };

async function spec(rows) {
  const jobId = "dfr-job-" + uid(), specId = "dfr-spec-" + uid(), fgId = "dfr-fg-" + uid();
  made.push(jobId);
  const now = new Date().toISOString();
  // job_number carries a unique index, so each fixture needs its own.
  await sql`INSERT INTO jobs (id, created_at, client_name, site_address, job_number)
            VALUES (${jobId}, ${now}, 'Door Role Test', '1 Door St', ${"D" + uid().slice(0, 5)})`;
  await sql`INSERT INTO residential_specs (id, job_id, created_at, updated_at)
            VALUES (${specId}, ${jobId}, ${now}, ${now})`;
  await sql`INSERT INTO finish_groups (id, spec_id, label, finish_type, sort_order, species)
            VALUES (${fgId}, ${specId}, 'PNT-1', 'paint', 0, 'Poplar')`;
  for (const [i, r] of rows.entries()) {
    await sql`INSERT INTO finish_group_door_fronts (id, finish_group_id, role, slot_label, style_id, sort_order)
              VALUES (${"df-" + uid()}, ${fgId}, ${r.role}, ${r.slot ?? null}, ${r.style}, ${i})`;
  }
  return { specId, fgId };
}

const clientTxt = async (specId) => {
  const d = await loadSpecPDFData(specId);
  return { d, txt: squash(await pdfText(await renderClientSpecPDFBuffer(d))) };
};

async function main() {
  console.log("\nthe vocabulary is one list, shared\n");
  {
    check("every canonical role has a label",
          DOOR_FRONT_ROLES.every((r) => !!DOOR_FRONT_ROLE_LABEL[r]),
          DOOR_FRONT_ROLES.filter((r) => !DOOR_FRONT_ROLE_LABEL[r]).join(","));
    check("the four roles Karl named are all in the list",
          [ROLE_BASE, ROLE_UPPER, ROLE_DRAWER_FRONT, ROLE_APPLIED_END].every((r) => DOOR_FRONT_ROLES.includes(r)));
    check("isDoorFrontRole accepts a canonical role", isDoorFrontRole(ROLE_APPLIED_END));
    check("and rejects a typo", !isDoorFrontRole("applied_endz"));

    // The legacy plural is what production rows carry. It must normalize, not be
    // rejected — a spec saved before this list existed still has to render.
    check("the legacy plural normalizes to the canonical role",
          normalizeDoorFrontRole("applied_ends") === ROLE_APPLIED_END,
          normalizeDoorFrontRole("applied_ends"));
    check("a canonical role normalizes to itself",
          normalizeDoorFrontRole(ROLE_APPLIED_END) === ROLE_APPLIED_END);
    check("an unknown role is passed through, not silently remapped",
          normalizeDoorFrontRole("slab_df") === "slab_df",
          "guessing at an unknown role is how a row ends up on the wrong line");
    check("null and empty are handled", normalizeDoorFrontRole(null) === "" && normalizeDoorFrontRole("") === "");
  }

  console.log("\nTHE BUG: an applied end must not print as the drawer front\n");
  {
    // Karl's exact case: slab everywhere, shaker on the applied ends.
    const { specId } = await spec([
      { role: "base",          style: SLAB.id },
      { role: "applied_ends",  style: SHAKER.id, slot: "KITCHEN" },   // legacy plural
    ]);
    const { txt } = await clientTxt(specId);
    assertDecodable(txt, "SLAB", "client spec text");

    /*
      Asserted on LABEL+VALUE together, not on either alone.

      Two earlier versions of these checks passed against the broken code for the
      wrong reasons. "APPLIED ENDS" appears in the schedule's own column header
      ("DOORS DF APPLIED ENDS") and again in an edgeband where-used label, so merely
      finding that string proves nothing. And counting the shaker name found one hit
      either way: correct code prints it on the applied-end line, broken code printed
      it on the DF line and then dropped the applied-end line entirely, because the
      un-normalized role matched neither branch.

      The renderer emits label then value, so "DF MATCH DOORS" and
      "APPL. ENDS #116 STANDARD SHAKER" are each a single unambiguous claim about
      which line carries which style.
    */
    check("the applied end's style is on the APPLIED ENDS line",
          txt.includes(`APPL. ENDS ${squash(SHAKER.name)}`),
          "no applied-end line carrying the shaker panel");
    check("the drawer front line says it matches the doors",
          txt.includes("DF MATCH DOORS"),
          "the DF line named a style — it borrowed the applied end's");
    check("the base doors keep their own style",
          txt.includes(`DOORS ${squash(SLAB.name)}`));

    // Asserted on the view rather than on glyph order, which is not layout.
    const d = await loadSpecPDFData(specId);
    const roles = d.finish_groups[0].door_fronts.map((r) => r.role);
    check("the view normalizes the stored plural",
          roles.includes(ROLE_APPLIED_END) && !roles.includes("applied_ends"),
          `roles seen: ${roles.join(",")}`);
    check("the applied end keeps its slot label",
          d.finish_groups[0].door_fronts.find((r) => r.role === ROLE_APPLIED_END)?.slot_label === "KITCHEN");
  }
  {
    // With no drawer-front row, DF should say "Match Doors" — not borrow a style
    // from whatever other row happens to be first.
    const { specId } = await spec([
      { role: "base",         style: SLAB.id },
      { role: "applied_ends", style: SHAKER.id },
    ]);
    const { txt } = await clientTxt(specId);
    check("with no drawer-front row the DF line reads Match Doors",
          txt.includes("MATCH DOORS"),
          "it borrowed a style from another role instead");
  }

  console.log("\nrepeatable rows: Karl can call them out however he wants\n");
  {
    // "12in drawers 5 piece and the 6in drawers slab"
    const { specId } = await spec([
      { role: "base",          style: SHAKER.id },
      { role: "drawer_front",  style: SHAKER.id, slot: '12" DRAWERS' },
      { role: "drawer_front",  style: SLAB.id,   slot: '6" DRAWERS' },
    ]);
    const d = await loadSpecPDFData(specId);
    const dfs = d.finish_groups[0].door_fronts.filter((r) => r.role === ROLE_DRAWER_FRONT);
    check("two drawer-front rows both survive", dfs.length === 2, `${dfs.length} row(s)`);
    check("each keeps its own slot label",
          dfs.some((r) => r.slot_label === '12" DRAWERS') && dfs.some((r) => r.slot_label === '6" DRAWERS'),
          dfs.map((r) => r.slot_label).join(" | "));
    check("each keeps its own style",
          dfs.some((r) => r.style_name === SHAKER.name) && dfs.some((r) => r.style_name === SLAB.name),
          dfs.map((r) => r.style_name).join(" | "));

    // The work order's DOOR & DRAWER FRONT SCHEDULE prints every row with its slot,
    // so the shop sees both callouts rather than one summary line.
    const woTxt = squash(await pdfText(await renderWorkOrderPDFBuffer(d, d.finish_groups[0])));
    check("the work order schedule prints both drawer-front callouts",
          woTxt.includes('12" DRAWERS'.replace(/"/g, '"')) || woTxt.includes("12 DRAWERS"),
          "only one drawer-front row reached the sheet");
    check("and names both styles", woTxt.includes(squash(SLAB.name)) && woTxt.includes(squash(SHAKER.name)),
          "the second row's style is missing");
  }
  {
    // "multiple door types in the same finish"
    const { specId } = await spec([
      { role: "base",  style: SHAKER.id, slot: "KITCHEN" },
      { role: "base",  style: RRP.id,    slot: "MASTER BATH" },
      { role: "upper", style: SLAB.id },
    ]);
    const d = await loadSpecPDFData(specId);
    const bases = d.finish_groups[0].door_fronts.filter((r) => r.role === ROLE_BASE);
    check("two base-door rows both survive", bases.length === 2, `${bases.length} row(s)`);
    const woTxt = squash(await pdfText(await renderWorkOrderPDFBuffer(d, d.finish_groups[0])));
    check("the work order names every door style on the group",
          [SHAKER, RRP, SLAB].every((s) => woTxt.includes(squash(s.name))),
          [SHAKER, RRP, SLAB].filter((s) => !woTxt.includes(squash(s.name))).map((s) => s.name).join(", ") + " missing");
    check("an upper-door row is labelled Upper Doors", woTxt.includes("UPPER DOORS"),
          "`upper` was written but compared by nothing, so it had no label on the sheet");
  }
  {
    // A group with only a base row must still render exactly as before — the whole
    // point is that repeatable rows are additive, not a rewrite.
    const { specId } = await spec([{ role: "base", style: SHAKER.id }]);
    const { txt } = await clientTxt(specId);
    check("a single-row group still names its door", txt.includes(squash(SHAKER.name)));
    check("and still says the drawer fronts match", txt.includes("MATCH DOORS"));
  }
}

main()
  .catch((e) => { console.error("\nHARNESS ERROR:", e.message ?? e, e.stack?.split("\n").slice(1, 3).join("\n") ?? ""); fail++; })
  .finally(async () => {
    for (const id of made) await sql`DELETE FROM jobs WHERE id = ${id}`.catch(() => {});
    await sql.end({ timeout: 5 });
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  });
