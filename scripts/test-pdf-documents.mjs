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
