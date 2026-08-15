#!/usr/bin/env node
/**
 * test-pdf-documents.mjs — prove the client document and the work orders are
 * actually separate, by rendering real PDFs and counting their pages.
 *
 * Why this matters more than it looks:
 *
 * buildContractPacket() in lib/docusign.ts sends the spec PDF to the client for
 * signature. Until this split, that PDF contained every work order sheet — so the
 * client was signing drawer-box construction, slide part numbers and shop notes.
 * Nobody noticed because the document rendered fine; it was correct-looking and
 * wrong.
 *
 * A diff cannot show that. Page counts can: if the client document ever grows by
 * one page per finish group again, this fails.
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/test-pdf-documents.mjs
 */
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = postgres(url, { ssl: false, prepare: false, max: 2 });
const uid = () => randomBytes(8).toString("hex");

const { loadSpecPDFData } = await import("../lib/spec-data.ts");
const {
  renderClientSpecPDFBuffer,
  renderWorkOrderPDFBuffer,
  renderAllWorkOrdersPDFBuffer,
  renderSpecPDFBuffer,
} = await import("../lib/pdf-spec.tsx");

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`); }
};
const pages = async (buf) => (await PDFDocument.load(buf)).getPageCount();

// ── fixture: one job, one spec, three finish groups, two rooms ──────────────
const jobId = "job-" + uid();
const specId = "spec-" + uid();
const FGS = ["MEL-1", "MEL-2", "STN-1"];
const fgIds = [];

async function setup() {
  const now = new Date().toISOString();
  await sql`INSERT INTO jobs (id, created_at, client_name, site_address, job_number)
            VALUES (${jobId}, ${now}, 'PDF Split Test', '000 Test St', NULL)`;
  await sql`INSERT INTO residential_specs (id, job_id, created_at, updated_at)
            VALUES (${specId}, ${jobId}, ${now}, ${now})`;
  for (let i = 0; i < FGS.length; i++) {
    const id = "fg-" + uid();
    fgIds.push(id);
    await sql`INSERT INTO finish_groups (id, spec_id, label, finish_type, sort_order, drawer_box_id, rollout_box_id)
              VALUES (${id}, ${specId}, ${FGS[i]}, ${i < 2 ? "melamine" : "stain"}, ${i}, 'DBX-001', 'DBX-001')`;
  }
  for (const [i, name] of ["KITCHEN", "MASTER BATH"].entries()) {
    const rid = "room-" + uid();
    await sql`INSERT INTO rooms (id, spec_id, name, sort_order) VALUES (${rid}, ${specId}, ${name}, ${i})`;
    await sql`INSERT INTO room_finishes (id, room_id, finish_group_id, sort_order)
              VALUES (${uid()}, ${rid}, ${fgIds[i]}, 0)`;
  }
}

try {
  await setup();
  const data = await loadSpecPDFData(specId);
  check(`fixture loaded with ${FGS.length} finish groups`, data.finish_groups.length === FGS.length,
        `got ${data.finish_groups.length}`);

  /*
    job_id vs job_internal_id. `job_id` is a DISPLAY string — job_number when the job
    has one — and the generate route used it for the job_files foreign key and the
    storage path. On any job with a Tradesoft number that wrote job_id=88888 and blew
    up on job_files_job_id_fkey, so the generated spec was never recorded and the file
    could not be found. The endpoint still returned 200.
  */
  check("job_internal_id is the real jobs.id", data.job_internal_id === jobId,
        `${data.job_internal_id} vs ${jobId}`);
  check("and job_id is free to be the display number", typeof data.job_id === "string");

  // THE regression, on a job that HAS a Tradesoft number — the only case that broke.
  // With job_number set, job_id becomes "88888" and using it as the foreign key threw
  // job_files_job_id_fkey: Key (job_id)=(88888) is not present in table "jobs".
  {
    const numberedJob = "job-num-" + uid();
    const numberedSpec = "spec-num-" + uid();
    const now2 = new Date().toISOString();
    await sql`INSERT INTO jobs (id, created_at, client_name, site_address, job_number)
              VALUES (${numberedJob}, ${now2}, 'Numbered Job', '1 St', '88888')`;
    await sql`INSERT INTO residential_specs (id, job_id, created_at, updated_at)
              VALUES (${numberedSpec}, ${numberedJob}, ${now2}, ${now2})`;
    const nd = await loadSpecPDFData(numberedSpec);
    check("with a Tradesoft number, job_id IS the display number", nd.job_id === "88888", nd.job_id);
    check("but job_internal_id is still the real key", nd.job_internal_id === numberedJob,
          `${nd.job_internal_id} — if this is "88888" the FK to jobs will fail and the generated spec is lost`);
    // Prove it: the value used for the FK must actually exist in jobs.
    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM jobs WHERE id = ${nd.job_internal_id}`;
    check("and it resolves to a real row in jobs", n === 1, `${n} row(s)`);
    const [{ n: bad }] = await sql`SELECT COUNT(*)::int AS n FROM jobs WHERE id = ${nd.job_id}`;
    check("while job_id does NOT — which is why the insert blew up", bad === 0, `${bad} row(s)`);
    await sql`DELETE FROM jobs WHERE id = ${numberedJob}`;
  }

  const clientBuf = await renderClientSpecPDFBuffer(data);
  const clientPages = await pages(clientBuf);

  const woBufs = [];
  for (const fg of data.finish_groups) woBufs.push(await renderWorkOrderPDFBuffer(data, fg));
  const woPageCounts = [];
  for (const b of woBufs) woPageCounts.push(await pages(b));

  const allWoPages = await pages(await renderAllWorkOrdersPDFBuffer(data));
  const combinedPages = await pages(await renderSpecPDFBuffer(data));

  console.log(`\n  client=${clientPages}p  wo=[${woPageCounts.join(",")}]  allWo=${allWoPages}p  combined=${combinedPages}p\n`);

  // THE regression this exists for: the client document must not grow with the
  // number of finish groups. If it does, work orders are back inside it.
  check("each work order is exactly one page", woPageCounts.every((n) => n === 1), woPageCounts.join(","));
  check("all-work-orders has one page per finish group", allWoPages === FGS.length, `${allWoPages} vs ${FGS.length}`);
  check("client document does NOT contain the work orders",
        clientPages === combinedPages - FGS.length,
        `client ${clientPages}, combined ${combinedPages}, fgs ${FGS.length}`);
  check("combined = client + every work order", combinedPages === clientPages + allWoPages,
        `${combinedPages} vs ${clientPages}+${allWoPages}`);

  // Sign-off moved off page one and onto the end. Page one is the finish schedule,
  // so a one-page client document would mean the sign-off page never rendered.
  check("client document has a sign-off page after the schedules", clientPages >= 2, `${clientPages}p`);

  // A work order must never carry the client's signature block: it is shop
  // paperwork, and a signature line on it invites someone to sign the wrong thing.
  check("a work order is not the client document", woPageCounts[0] !== clientPages || clientPages === 1);

  // ── the colour swatch reaches both documents ───────────────────────────────
  //
  // Asserted by counting embedded image objects in the PDF, not by file size. My
  // first version of this used size and set the threshold at 5KB on the assumption
  // that the ~16KB jpg would embed whole — it does not, @react-pdf re-encodes to the
  // rendered box, so the real growth was 3.3KB and a correct implementation failed
  // its own test. Counting /Subtype /Image asks the question directly: is there a
  // picture in this document, yes or no.
  console.log("\nthe colour swatch is embedded in both documents");
  {
    const cat = JSON.parse(readFileSync(resolve(__dirname, "../data/catalogs/colors_melamine.json"), "utf8"));
    const withImg = cat.find((c) => {
      if (!c.image_url) return false;
      return existsSync(resolve(__dirname, "..", "public", c.image_url.replace(/^\//, "")));
    });
    check("the catalog has a colour whose swatch file exists", !!withImg, "none found on disk");

    if (withImg) {
      // Same spec, once with a colour that has a photograph and once without.
      await sql`UPDATE finish_groups SET finish_type = 'melamine', color_id = ${withImg.id}, color_name = ${withImg.color_name} WHERE spec_id = ${specId}`;
      const withData = await loadSpecPDFData(specId);
      const withPath = withData.finish_groups[0]?.color_image ?? "";
      check("spec-data resolves an absolute swatch path", withPath.endsWith(".jpg") || withPath.endsWith(".png"), JSON.stringify(withPath));

      // The logo is one image object; each swatch is another. Count them.
      const imageCount = (buf) =>
        (Buffer.from(buf).toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length;

      const bigClient = await renderClientSpecPDFBuffer(withData);
      const bigWo     = await renderWorkOrderPDFBuffer(withData, withData.finish_groups[0]);

      // A colour id that is not in the catalog — the guard must leave color_image
      // empty rather than handing @react-pdf a path that does not exist.
      await sql`UPDATE finish_groups SET color_id = ${"MEL-DOES-NOT-EXIST"} WHERE spec_id = ${specId}`;
      const bareData = await loadSpecPDFData(specId);
      check("an unknown colour id yields no image rather than a bad path",
            (bareData.finish_groups[0]?.color_image ?? "") === "",
            JSON.stringify(bareData.finish_groups[0]?.color_image));

      const smallClient = await renderClientSpecPDFBuffer(bareData);
      const smallWo     = await renderWorkOrderPDFBuffer(bareData, bareData.finish_groups[0]);

      const cWith = imageCount(bigClient),   cWithout = imageCount(smallClient);
      const wWith = imageCount(bigWo),       wWithout = imageCount(smallWo);

      check("the client spec embeds more images with a swatch than without",
            cWith > cWithout, `${cWithout} -> ${cWith} image object(s)`);
      check("the work order embeds more images with a swatch than without",
            wWith > wWithout, `${wWithout} -> ${wWith} image object(s)`);
      check("both documents already carried the logo",
            cWithout >= 1 && wWithout >= 1,
            `client ${cWithout}, wo ${wWithout} — if this is 0 the logo is missing too`);
      check("the document without a swatch still renders", smallWo.length > 1000, `${smallWo.length} bytes`);
    }
  }

  // ── what the work order actually SAYS ──────────────────────────────────────
  //
  // Everything above this line is structural: page counts and a count of embedded
  // images. That is blind to the bug class that has cost the most here — the sheet
  // renders, it looks right, and it says the wrong thing. deriveWOEdgebands looked
  // up material role "cab_ext", a role removed from the vocabulary and never emitted
  // by spec-data, so `carcassName` was always "" and every work order printed
  // HARDROCK MAPLE for the interior edgeband no matter what the boxes were made of.
  // That is wrong on every plywood job, and the catalog itself records why it
  // matters: CAR-001's note says ambiguous "Plywood Box" language caused a $70k
  // error on the Spivey job.
  //
  // So these assertions read the words back off the page.
  console.log("\nthe work order says what it means");
  {
    const { pdfText, squash, assertDecodable } = await import("./_pdf-text.mjs");

    // One job, one finish group, driven by carcass_id. `spec-data` builds the
    // materials array from finish_groups.carcass_id resolved through the
    // colors_carcass catalog — there is no finish_group_materials row involved.
    const tJob = "job-" + uid(), tSpec = "spec-" + uid(), tFg = "fg-" + uid();
    const now = new Date().toISOString();
    try {
      await sql`INSERT INTO jobs (id, created_at, client_name, site_address, job_number)
                VALUES (${tJob}, ${now}, 'Carcass Text Test', '1 Text St', '26104')`;
      await sql`INSERT INTO residential_specs (id, job_id, created_at, updated_at)
                VALUES (${tSpec}, ${tJob}, ${now}, ${now})`;
      await sql`INSERT INTO finish_groups (id, spec_id, label, finish_type, sort_order, carcass_id)
                VALUES (${tFg}, ${tSpec}, 'MEL-1', 'melamine', 0, 'CAR-002')`;

      const sheet = async () => {
        const d = await loadSpecPDFData(tSpec);
        return squash(await pdfText(await renderWorkOrderPDFBuffer(d, d.finish_groups[0])));
      };

      let txt = await sheet();

      // If the renderer's glyph encoding ever changes, every assertion below would
      // pass vacuously against an empty string. Fail here instead.
      assertDecodable(txt, "WORK ORDER SPECS", "work order text");
      check("the sheet's words can be read back out of the PDF", txt.length > 100, `${txt.length} chars`);

      // Karl: a 5th box, first position, for the Tradesoft number.
      check("the meta bar carries all five labels",
            ["JOB #", "WO #", "PM", "ENGINEER", "DATE"].every((l) => txt.includes(l)),
            ["JOB #", "WO #", "PM", "ENGINEER", "DATE"].filter((l) => !txt.includes(l)).join(", ") || "?");
      check("the Tradesoft job number prints", txt.includes("26104"));

      // WO SPECS is a table now, with the two rows Karl asked for.
      check("WO SPECS has an Edgebanding column", txt.includes("EDGEBANDING"));
      check("WO SPECS names the interior and the exterior",
            txt.includes("INTERIOR") && txt.includes("EXTERIOR"));
      check("the touch-up kit row is gone", !txt.includes("TOUCHUP") && !txt.includes("TOUCH UP"));

      // THE regression. Plywood carcass -> PF MAPLE, and specifically NOT the
      // hardcoded value that used to print on every sheet.
      check("a plywood carcass prints its own material",
            txt.includes("PREFINISHED MAPLE PLYWOOD"), "carcass name missing from the sheet");
      check("a plywood carcass yields PF MAPLE edgebanding", txt.includes("PF MAPLE"));
      check("a plywood carcass does NOT print HARDROCK MAPLE", !txt.includes("HARDROCK MAPLE"),
            "this is the bug: the interior edgeband was hardcoded regardless of the carcass");

      // Particleboard still gets hardrock — the fix must not have inverted it.
      await sql`UPDATE finish_groups SET carcass_id = 'CAR-001' WHERE id = ${tFg}`;
      txt = await sheet();
      check("a particleboard carcass yields HARDROCK MAPLE edgebanding", txt.includes("HARDROCK MAPLE"));
      check("and does not claim PF MAPLE", !txt.includes("PF MAPLE"));

      // ── the summary and the table cannot disagree ────────────────────────────
      //
      // WO SPECS quotes the exterior edgeband, and the full edgeband table further
      // down the sheet lists it again. For a melamine group `ebRows` prefers rows a
      // PM edited by hand over the derived defaults. An earlier draft of the summary
      // called deriveWOEdgebands(fg) a second time, which would have printed the
      // default in the summary and the edit in the table — two different edgebands
      // on one sheet, and the shop believes whichever it read first.
      //
      // Store an edit under code D and require it to appear TWICE.
      const EB = JSON.parse(readFileSync(resolve(__dirname, "../data/catalogs/edgeband.json"), "utf8"));
      const picked = EB.find((e) => e.id === "EB-ESI-3103") ?? EB.find((e) => e.product_name && e.supplier);
      check("an edgeband to store the edit with", !!picked, "edgeband catalog empty");
      if (picked) {
        await sql`INSERT INTO finish_group_edgebands (id, finish_group_id, code, edgeband_id, where_used, sort_order)
                  VALUES (${"eb-" + uid()}, ${tFg}, 'D', ${picked.id}, NULL, 0)`;
        const edited = await loadSpecPDFData(tSpec);

        // THE BUG UNDERNEATH. spec-data overwrote the stored code with a synthetic
        // "EB1" for any row that named an edgeband product. The table is keyed
        // (finish_group_id, code) on the work-order letters, and pdf-spec matches on
        // those letters to prefer a stored row over a derived default — so rewriting
        // "D" to "EB1" meant the editable edgeband table wrote to the database and
        // nothing ever printed it. Every override a PM typed was silently discarded.
        const stored = edited.finish_groups[0].edgebands.find((e) => e.code === "D");
        check("a stored work-order letter code survives the view",
              !!stored,
              `codes present: ${edited.finish_groups[0].edgebands.map((e) => e.code).join(",") || "(none)"}` +
              ` — "EB1" here means the letter code was overwritten again`);
        check("the stored edgeband row reaches the view",
              (stored?.edgeband_name ?? "") === picked.product_name,
              `${JSON.stringify(stored?.edgeband_name)} vs ${JSON.stringify(picked.product_name)}`);

        txt = squash(await pdfText(await renderWorkOrderPDFBuffer(edited, edited.finish_groups[0])));
        check("a PM's chosen edgeband reaches the work order at all", txt.includes(squash(picked.product_name)),
              "the derived default printed over the top of the stored row");

        // A typed override beats the catalogue, per field. The sheet's summary prints
        // the description only, so thickness / manufacturer / part number are asserted
        // on the view — they are resolved on every render and, since the 8-row
        // edgeband schedule was removed from this sheet in 69f6ba3, printed nowhere.
        // Asserted anyway: they are what the schedule would need if it comes back, and
        // they are what proved the stored row is being read at all.
        const TYPED = "ZZ-99-ROLL";
        await sql`UPDATE finish_group_edgebands SET part_no = ${TYPED}, mfr = ${"BENCH SUPPLY"}, thick = ${"2.0"}
                  WHERE finish_group_id = ${tFg} AND code = 'D'`;
        const typed = await loadSpecPDFData(tSpec);
        const tRow = typed.finish_groups[0].edgebands.find((e) => e.code === "D");
        check("a typed part number reaches the view", (tRow?.part_no ?? "") === TYPED, JSON.stringify(tRow?.part_no));
        check("a typed manufacturer overrides the catalogue's supplier",
              (tRow?.supplier ?? "") === "BENCH SUPPLY", JSON.stringify(tRow?.supplier));
        check("a typed thickness overrides the catalogue's",
              (tRow?.thickness ?? "") === "2.0", JSON.stringify(tRow?.thickness));
        check("and the untouched description still comes from the catalogue",
              (tRow?.edgeband_name ?? "") === picked.product_name,
              "a per-row override would have blanked this");
        check("the sheet still renders with overrides applied",
              (await renderWorkOrderPDFBuffer(typed, typed.finish_groups[0])).length > 1000);
      }

      // ── one slide, one name ──────────────────────────────────────────────────
      //
      // The same slide is stored twice per finish group, in two columns resolved
      // against two different catalogs, and the work order printed both spellings in
      // two different blocks:
      //
      //   finish_group_hardware  role=drawer_slides  HDS-BLU-001
      //     -> "Blum Tandem Plus Blumotion"          (WORK ORDER HARDWARE)
      //   finish_group_drawers   role=drawer_box     DS-ACC-STD
      //     -> "ACC Standard Undermount Soft-Close"  (DRAWER & ROLLOUT SCHEDULE)
      //
      // Karl's rule: the hardware block reads what the schedule reads. Someone
      // comparing the two blocks must not have to wonder whether that is two names
      // for one slide or two different slides.
      // A hinge row goes in alongside, as the control: the rule must rewrite exactly
      // the two slide roles and leave every other role resolving as it always did.
      await sql`INSERT INTO finish_group_hardware (id, finish_group_id, role, hardware_id, sort_order)
                VALUES (${"hw-" + uid()}, ${tFg}, 'hinges',         'HH-BLU-110',  0),
                       (${"hw-" + uid()}, ${tFg}, 'drawer_slides',  'HDS-BLU-001', 1),
                       (${"hw-" + uid()}, ${tFg}, 'rollout_slides', 'HRS-KV-001',  2)`;
      await sql`INSERT INTO finish_group_drawers (id, finish_group_id, role, drawer_box_id, slides_id, sort_order)
                VALUES (${"dr-" + uid()}, ${tFg}, 'drawer_box', 'DBX-001', 'DS-ACC-STD', 0),
                       (${"dr-" + uid()}, ${tFg}, 'rollout',    'DBX-001', 'DS-ACC-RO',  1)`;

      const twoWay = await loadSpecPDFData(tSpec);
      const dualTxt = squash(await pdfText(await renderWorkOrderPDFBuffer(twoWay, twoWay.finish_groups[0])));

      check("the drawer slide is named from the schedule's record",
            dualTxt.includes("ACC STANDARD UNDERMOUNT SOFT-CLOSE"),
            "the hardware block is still resolving HDS-BLU-001 against its own catalog");
      check("the hardware block no longer prints a second name for that slide",
            !dualTxt.includes("BLUM TANDEM PLUS BLUMOTION"),
            "both spellings are on the sheet — this is the bug");
      check("the rollout slide is named from the schedule's record",
            dualTxt.includes("ACC STANDARD ROLLOUT SLIDE"),
            "rollout still resolving HRS-KV-001");
      check("and not from the hardware catalog", !dualTxt.includes("KNAPE"));

      // The hardware block must still LIST slides — Karl asked for them to agree,
      // not to disappear.
      check("the hardware block still lists both slide roles",
            dualTxt.includes("DRAWER SLIDES") && dualTxt.includes("ROLLOUT SLIDES"),
            "the rule renames a row, it does not remove one");

      // The control. The hinge resolves through hardwareByRole exactly as before, so
      // if its name went missing the mapping is rewriting more than the two slide
      // roles it is scoped to.
      check("a hinge row is untouched by the slide rule",
            dualTxt.includes("BLUM 110 CLIP TOP BLUMOTION SOFT CLOSE"),
            `hinge name absent — the mapping is not scoped to the slide roles. text: ${dualTxt.slice(0, 200)}`);

      // ── one role, one answer ────────────────────────────────────────────────
      //
      // Found live on ZZ TOP MEL-1 (2026-08-15): the WORK ORDER HARDWARE block listed
      // HINGES twice and DRAWER SLIDES twice, because finish_group_hardware and
      // spec_hardware were rendered back to back with nothing reconciling them. The
      // sheet named two different hinges and gave the shop no way to tell which one
      // to build.
      //
      // Karl's call: spec level wins. A role named at spec level suppresses the finish
      // group's row for that role. A role only one side names still prints.
      await sql`INSERT INTO spec_hardware (id, spec_id, type, part_no, sort_order)
                VALUES (${"sh-" + uid()}, ${tSpec}, 'HINGES',      'BLUM 170 DEGREE',      0),
                       (${"sh-" + uid()}, ${tSpec}, 'CLOSET RODS', 'GOLD RODS EVERYWHERE', 1)`;
      const dupe    = await loadSpecPDFData(tSpec);
      const dupeTxt = squash(await pdfText(await renderWorkOrderPDFBuffer(dupe, dupe.finish_groups[0])));

      check("a role named at spec level suppresses the finish group's row for it",
            !dupeTxt.includes("BLUM 110 CLIP TOP BLUMOTION SOFT CLOSE"),
            "both hinges are on the sheet — the shop cannot tell which to build");
      check("and the spec-level hinge is the one that prints",
            dupeTxt.includes("BLUM 170 DEGREE"));
      check("HINGES appears exactly once as a label",
            (dupeTxt.match(/HINGES/g) || []).length === 1,
            `HINGES x${(dupeTxt.match(/HINGES/g) || []).length}`);
      // Two controls: a spec-level role the finish group never names must still print,
      // and a finish group role spec level never names must still print.
      check("a spec-level-only role still prints",
            dupeTxt.includes("CLOSET RODS") && dupeTxt.includes("GOLD RODS EVERYWHERE"));
      check("a finish-group-only role is untouched by the override",
            dupeTxt.includes("ROLLOUT SLIDES") && dupeTxt.includes("ACC STANDARD ROLLOUT SLIDE"),
            "suppression is reaching past the roles spec level actually claimed");

      // A near miss must NOT suppress. Failing visibly beats failing silently.
      await sql`UPDATE spec_hardware SET type = 'Hinge' WHERE spec_id = ${tSpec} AND type = 'HINGES'`;
      const nearMiss = await loadSpecPDFData(tSpec);
      const nmTxt = squash(await pdfText(await renderWorkOrderPDFBuffer(nearMiss, nearMiss.finish_groups[0])));
      check("a role spelled differently does not silently drop the finish group's record",
            nmTxt.includes("BLUM 110 CLIP TOP BLUMOTION SOFT CLOSE"),
            "'Hinge' matched 'hinges' and swallowed the real record");

      await sql`DELETE FROM spec_hardware WHERE spec_id = ${tSpec}`;

      // If the schedule has no slide, the hardware name is better than a blank.
      await sql`UPDATE finish_group_drawers SET slides_id = NULL WHERE finish_group_id = ${tFg}`;
      const noSched = await loadSpecPDFData(tSpec);
      const fbTxt = squash(await pdfText(await renderWorkOrderPDFBuffer(noSched, noSched.finish_groups[0])));
      check("with no slide on the schedule it falls back rather than printing a blank",
            fbTxt.includes("BLUM TANDEM PLUS BLUMOTION"),
            "a gap where a slide belongs is worse than a differently-worded name");
    } finally {
      await sql`DELETE FROM jobs WHERE id = ${tJob}`.catch(() => {});
    }
  }

  // ── JOB # appears exactly once, and always in the same place ───────────────
  //
  // Karl: "JOB # should appear in one place, the same way every time."
  //
  // It headed the banner AND sat in the meta bar. Worse, the shape changed with the
  // data: with a Tradesoft number the banner read "JOB # 88888" and demoted the
  // project name to a subtitle; without one the project name was the title and the
  // number appeared only in the meta bar. Two layouts for one document.
  console.log("\nJOB # appears once, in the same place either way");
  {
    const { pdfText, squash, assertDecodable } = await import("./_pdf-text.mjs");
    const mkJob = async (number) => {
      const jid = "jn-job-" + uid(), sid = "jn-spec-" + uid();
      const n = new Date().toISOString();
      await sql`INSERT INTO jobs (id, created_at, client_name, site_address, job_number)
                VALUES (${jid}, ${n}, 'Numbering Test', '1 St', ${number})`;
      await sql`INSERT INTO residential_specs (id, job_id, created_at, updated_at)
                VALUES (${sid}, ${jid}, ${n}, ${n})`;
      await sql`INSERT INTO finish_groups (id, spec_id, label, finish_type, sort_order, carcass_id)
                VALUES (${"jn-fg-" + uid()}, ${sid}, 'MEL-1', 'melamine', 0, 'CAR-001')`;
      const d = await loadSpecPDFData(sid);
      const txt = squash(await pdfText(await renderWorkOrderPDFBuffer(d, d.finish_groups[0])));
      await sql`DELETE FROM jobs WHERE id = ${jid}`;
      return txt;
    };

    const withNum = await mkJob("77777");
    assertDecodable(withNum, "WORK ORDER SPECS", "work order text");
    const labelHits = withNum.split("JOB #").length - 1;
    check("the label JOB # appears exactly once", labelHits === 1, `${labelHits} time(s)`);
    /*
      The number itself appears twice, and that is correct: once in the meta bar as
      JOB #, and once in the page footer's document trace ("SPEC 77777 · MEL-1 · Work
      Order Spec"). The footer line is not a JOB # field — it is how you identify a
      loose sheet that has come off a stack — so it does not count as a second place
      for the same fact. What must not recur is the LABELLED field, asserted above.

      My first version of this demanded exactly one occurrence anywhere and failed on
      the footer, i.e. it failed correct code. Checked what the second hit actually was
      before touching anything.
    */
    const numHits = withNum.split("77777").length - 1;
    check("the number appears in the meta bar and the footer trace, and nowhere else",
          numHits === 2, `${numHits} time(s)`);
    check("the banner no longer repeats it as a heading",
          !withNum.includes("JOB # 77777NUMBERING") && !withNum.startsWith("JOB #"),
          withNum.slice(0, 120));
    check("it is the meta bar's copy that survived", withNum.includes("JOB #77777") || withNum.includes("JOB # 77777"),
          withNum.slice(0, 160));

    // Without a number the layout must be the SAME, not a different arrangement.
    const noNum = await mkJob(null);
    check("with no Tradesoft number the label is still there once",
          (noNum.split("JOB #").length - 1) === 1, `${noNum.split("JOB #").length - 1} time(s)`);
    check("and the internal ACC id is NOT printed as the job number",
          !/JOB #\s*ACC-/.test(noNum), noNum.slice(0, 160));
    check("the client name still heads the sheet either way",
          withNum.includes("NUMBERING TEST") && noNum.includes("NUMBERING TEST"));
  }

  // ── the generated file names ───────────────────────────────────────────────
  //
  // Karl, looking at the Files panel: "Right now they're just a string." The names
  // were `spec-client-2026-08-11T20-04-49.pdf` — you cannot tell whose job that is.
  // This transcribes the naming from app/api/specs/[id]/generate/route.ts.
  console.log("\nthe generated files are named so you can read the list");
  {
    const safeName = (t) => t.replace(/[^A-Za-z0-9 ._-]+/g, " ").replace(/\s+/g, " ").trim() || "untitled";
    const datePrefix = "26.08.11";
    let seq = 1;
    const mk = (builder, client, what) =>
      `${safeName(builder)} - ${safeName(client)} - ${safeName(what)} - ${datePrefix}.${String(seq++).padStart(2, "0")}.pdf`;

    const a = mk("Stancraft", "ZZ TOP", "CLIENT SPEC");
    const b = mk("Stancraft", "ZZ TOP", "MEL-1 WO SPEC");
    check("the client spec reads builder - client - what - serial",
          a === "Stancraft - ZZ TOP - CLIENT SPEC - 26.08.11.01.pdf", a);
    check("a work order names its finish group",
          b === "Stancraft - ZZ TOP - MEL-1 WO SPEC - 26.08.11.02.pdf", b);
    check("the serial increments within one run", a.includes(".01.") && b.includes(".02."));

    // The separator has to survive sanitising, or the name becomes one hyphen run.
    check("spaces around the separator survive", a.includes(" - "), a);
    // A builder with punctuation must not break the storage key or eat the separator.
    const messy = mk("O'Brien & Sons, LLC", "Smith / Jones #2", "CLIENT SPEC");
    check("punctuation is flattened, not dropped", !/[&/#,']/.test(messy), messy);
    check("and the shape still holds", messy.split(" - ").length === 4, messy);
    check("a missing builder does not produce a leading separator",
          !mk("", "ZZ TOP", "CLIENT SPEC").startsWith(" - "),
          mk("", "ZZ TOP", "CLIENT SPEC"));
  }

  // ── the split-brain assertion ──────────────────────────────────────────────
  // This is the test that would have caught the original bug. An admin edit to a
  // catalog used to reach the spec builder page and never the work order, because
  // the page read the database and the document read the JSON file. Write a
  // sentinel into catalog_libraries and require the work order's drawer box to
  // carry it. If the two loaders ever come apart again, this fails.
  //
  // It asserts on the object the renderer consumes rather than on the rendered
  // bytes, because @react-pdf writes text into Flate-compressed content streams.
  // The structural claims above are what cover the document itself.
  const SENTINEL = "SENTINEL DRAWER BOX " + uid().slice(0, 6);
  const [savedDrawerBox] = await sql`SELECT data FROM catalog_libraries WHERE name = 'drawer_box'`;
  try {
    await sql`
      INSERT INTO catalog_libraries (name, data, updated_at)
      VALUES ('drawer_box', ${sql.json([
        { id: "DBX-001", name: SENTINEL, construction: "other", species: null, prefinish: null, notes: null, is_other: false },
      ])}, NOW())
      ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `;
    const { invalidateCatalogCache } = await import("../lib/catalogs.ts");
    invalidateCatalogCache();

    const edited = await loadSpecPDFData(specId);
    const drawerRows = edited.finish_groups.flatMap((fg) => fg.drawers ?? []);
    check("a database catalog edit reaches the work order's drawer schedule",
          drawerRows.some((r) => r.drawer_box_name === SENTINEL),
          `drawer box names seen: ${[...new Set(drawerRows.map((r) => r.drawer_box_name))].join(" | ") || "(none)"}`);
  } finally {
    if (savedDrawerBox) {
      await sql`UPDATE catalog_libraries SET data = ${sql.json(savedDrawerBox.data)} WHERE name = 'drawer_box'`;
    } else {
      await sql`DELETE FROM catalog_libraries WHERE name = 'drawer_box'`;
    }
    const { invalidateCatalogCache } = await import("../lib/catalogs.ts");
    invalidateCatalogCache();
  }
} catch (e) {
  console.error("\nHARNESS ERROR:", e);
  fail++;
} finally {
  await sql`DELETE FROM jobs WHERE id = ${jobId}`.catch(() => {});
  await sql.end({ timeout: 5 });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
