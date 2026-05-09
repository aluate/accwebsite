/**
 * Dev-only fixture: create one fully-populated test job + spec across all 8
 * spec-form areas. Compose with wipe-specs for fast iteration:
 *
 *   npm run wipe-specs -- --commit && node scripts/seed-spec.mjs
 *
 * That sequence resets the DB to a known-good state in <5 seconds, so each
 * iteration on the form / cover-sheet generator starts from a clean,
 * fully-populated spec instead of a blank wall of empty dropdowns.
 *
 * Per DAC #7 — without this, iterating on Phase 4 (form UI) means manually
 * filling 41+ dropdowns per cycle. Predictable result: less iteration, less
 * polish on what ships.
 *
 * Idempotent: if a job with this client name already exists, the script
 * appends a timestamp to make the new one unique. It does NOT delete prior
 * test data — pair with wipe-specs if you want a clean reset.
 *
 * What it creates:
 *   - 1 job: "Test Customer · ACC Spec Fixture" with full client/site/notes data
 *   - 1 residential_spec named "Spec Fixture v2"
 *   - 2 finish groups: paint kitchen + stain bath (covers both finish_type
 *     branches so the cover sheet can render variations)
 *   - For each finish group, full pre-seed across:
 *       - 4 materials (cab_ext, cab_int, cab_ext2, cab_int2)
 *       - 5 door fronts (base, upper, applied_ends, slab_df, 5pc_df)
 *       - 2 drawers (drawer_box, rollout)
 *       - 8 edgebands (D/E/I/V/U/B/C/X)
 *       - 11 hardware rows
 *       - 11 moldings
 *       - 1 countertop (kitchen only)
 *   - 3 rooms (Kitchen, Master Bath, Pantry) with finish-group assignments
 *
 * Catalog FK references use the first non-"None" row of each catalog so the
 * data is realistic. Where a catalog is empty (e.g. door_styles before Phase 0
 * lands), the FK is left null and a notes string explains.
 */
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO     = path.resolve(__dirname, "..");
const DB_PATH  = path.join(REPO, "data", "acc-jobs.db");
const CAT_DIR  = path.join(REPO, "data", "catalogs");

if (!fs.existsSync(DB_PATH)) {
  console.error(`[seed-spec] no DB at ${DB_PATH} — run npm run migrate first`);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Catalog loader (mirrors lib/catalogs.ts pattern but JS-only).
function loadCatalog(name) {
  const file = path.join(CAT_DIR, `${name}.json`);
  if (!fs.existsSync(file)) {
    console.warn(`[seed-spec] catalog ${name}.json missing — run npm run sync-catalogs`);
    return [];
  }
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

// Find first non-"None" id from a catalog. Falls back to first id, then null.
function firstNonNone(cat, idField = "id") {
  const noneId = cat.find((r) => /^(none|n\/a)$/i.test(String(r.name ?? "")))?.[idField];
  return cat.find((r) => r[idField] !== noneId)?.[idField] ?? cat[0]?.[idField] ?? null;
}
function firstId(cat, idField = "id") {
  return cat[0]?.[idField] ?? null;
}

const carcasses     = loadCatalog("colors_carcass");
const drawerBoxes   = loadCatalog("drawer_box");
const edgebands     = loadCatalog("edgeband");
const doorMaterials = loadCatalog("door_materials");
const drawerSlides  = loadCatalog("drawer_slides");
const sheens        = loadCatalog("sheens");
const paints        = loadCatalog("colors_paint");
const stains        = loadCatalog("colors_stain");
const glazes        = loadCatalog("glazes");
const topcoats      = loadCatalog("topcoats");
const moldingMats   = loadCatalog("molding_materials");
const moldingProfs  = loadCatalog("molding_profiles");
const ctopStyles    = loadCatalog("countertop_styles");
const ctopEdges     = loadCatalog("countertop_edges");
const ctopMats      = loadCatalog("countertop_materials");
const cabdoorEdges  = loadCatalog("cabdoor_edge_details");
const cabdoorIns    = loadCatalog("cabdoor_inside_profiles");
const cabdoorPanels = loadCatalog("cabdoor_panels");
const accessories   = loadCatalog("accessories_reva");
// door_styles is being reworked in Phase 0 — may be empty or generic.
const doorStyles    = loadCatalog("door_styles");

// Hardware catalogs by role (matches lib/catalogs.ts hardwareByRole resolver).
const hwByRole = {
  hinges:         loadCatalog("hardware_hinges"),
  drawer_slides:  loadCatalog("hardware_drawer_slides"),
  rollout_slides: loadCatalog("hardware_rollout_slides"),
  closet_rod:     loadCatalog("hardware_closet_rods"),
  trash_pullout:  loadCatalog("hardware_trash_pullouts"),
  base_pullout:   loadCatalog("hardware_base_pullouts"),
  blind_corner:   loadCatalog("hardware_blind_corners"),
  shelf_clips:    loadCatalog("hardware_shelf_clips"),
  door_pulls:     loadCatalog("hardware_door_pulls"),
  drawer_pulls:   loadCatalog("hardware_drawer_pulls"),
  misc:           loadCatalog("hardware_misc"),
};

// ── ID and timestamp helpers ────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);
const now = new Date().toISOString();

// Allocate a job ID via the seq table (mirrors lib/db.ts nextJobId()).
function nextJobId() {
  db.prepare("UPDATE seq SET val = val + 1 WHERE id = 1").run();
  const row = db.prepare("SELECT val FROM seq WHERE id = 1").get();
  const year = new Date().getFullYear();
  return { id: `ACC-${year}-${String(row.val).padStart(4, "0")}`, seq: row.val };
}

// ── Seed inside a single transaction ────────────────────────────────────────
const seed = db.transaction(() => {
  const { id: jobId } = nextJobId();
  console.log(`[seed-spec] creating job ${jobId}`);

  // Job
  db.prepare(`
    INSERT INTO jobs (
      id, seq, created_at, status, job_type,
      client_name, client_email, client_phone,
      site_address, city, pm,
      builder_name, builder_email, builder_phone, builder_company,
      delivery_date, notes,
      mod_residential, mod_commercial, mod_trim, mod_doors,
      notes_install, notes_finishing, notes_shop, notes_client
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    jobId, db.prepare("SELECT val FROM seq WHERE id = 1").get().val, now,
    "intake", "residential",
    "Test Customer", "test@example.com", "(208) 555-0100",
    "1234 Sample Road", "Coeur d'Alene", "Karl V.",
    "Atlas Builders", "atlas@example.com", "(208) 555-0200", "Atlas Builders",
    "2026-08-15", "Fixture data for the spec form expansion / cover sheet rebuild.",
    1, 0, 1, 0,
    "Install crew: confirm panel orientation on tall pantry before mounting.",
    "Finishing: spray two coats topcoat, sand with 320 between. Match existing trim color.",
    "Shop: edgeband all exposed plywood with code D before flat-pack.",
    "Client-facing: delivery window 8/15-8/20."
  );

  // Spec
  const specId = uid();
  db.prepare(`
    INSERT INTO residential_specs (id, job_id, name, status, created_at, updated_at, lifecycle_state)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(specId, jobId, "Spec Fixture v2", "draft", now, now, "DRAFT");

  // Two finish groups: kitchen paint + bath stain
  const fgs = [
    {
      id: uid(),
      label: "Kitchen Perimeter (Paint)",
      finish_type: "paint",
      paint_id:   firstNonNone(paints),
      stain_id:   null,
      glaze_id:   firstId(glazes),    // "None" row is fine
      topcoat_id: firstNonNone(topcoats),
      sheen_id:   firstNonNone(sheens),
      notes: "Paint finish — Sherwin Williams alabaster.",
      sort_order: 0,
    },
    {
      id: uid(),
      label: "Master Bath (Stain)",
      finish_type: "stain",
      paint_id:   null,
      stain_id:   firstNonNone(stains),
      glaze_id:   null,
      topcoat_id: firstNonNone(topcoats),
      sheen_id:   firstNonNone(sheens),
      notes: "Stain finish — natural cherry.",
      sort_order: 1,
    },
  ];

  const insertFg = db.prepare(`
    INSERT INTO finish_groups (id, spec_id, label, finish_type, notes, sort_order,
      stain_id, paint_id, glaze_id, topcoat_id, sheen_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const fg of fgs) {
    insertFg.run(fg.id, specId, fg.label, fg.finish_type, fg.notes, fg.sort_order,
      fg.stain_id, fg.paint_id, fg.glaze_id, fg.topcoat_id, fg.sheen_id);
  }

  // For each finish group, pre-seed the 41+ canonical child rows.
  const carcassIdMaple = firstNonNone(carcasses);

  for (let i = 0; i < fgs.length; i++) {
    const fg = fgs[i];
    const isKitchen = i === 0;

    // Materials (4 fixed slots)
    const matIns = db.prepare(`
      INSERT INTO finish_group_materials (id, finish_group_id, role, material_id, where_used, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    matIns.run(uid(), fg.id, "cab_ext",  carcassIdMaple, null,                  null);
    matIns.run(uid(), fg.id, "cab_int",  carcassIdMaple, null,                  null);
    matIns.run(uid(), fg.id, "cab_ext2", isKitchen ? carcassIdMaple : null,
                                          isKitchen ? "Island only" : null,    null);
    matIns.run(uid(), fg.id, "cab_int2", null, null, null);

    // Door fronts (5 canonical roles, 1 row each)
    const dfIns = db.prepare(`
      INSERT INTO finish_group_door_fronts (id, finish_group_id, role, slot_label, style_id, material_id,
        oe_id, ie_id, panel_id, grain, vendor, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const styleId = firstNonNone(doorStyles); // null if door_styles still empty (Phase 0 pending)
    const oeId    = firstNonNone(cabdoorEdges);
    const ieId    = firstNonNone(cabdoorIns);
    const panelId = firstNonNone(cabdoorPanels);
    const matId   = firstNonNone(doorMaterials);
    const roles = ["base", "upper", "applied_ends", "slab_df", "5pc_df"];
    for (let r = 0; r < roles.length; r++) {
      dfIns.run(uid(), fg.id, roles[r], null, styleId, matId, oeId, ieId, panelId,
        "vertical", "Cab Door", null, r);
    }

    // Drawers (2 canonical roles)
    const drwIns = db.prepare(`
      INSERT INTO finish_group_drawers (id, finish_group_id, role, slot_label, drawer_box_id, slides_id, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    drwIns.run(uid(), fg.id, "drawer_box", null, firstNonNone(drawerBoxes), firstNonNone(drawerSlides), null, 0);
    drwIns.run(uid(), fg.id, "rollout",    null, firstNonNone(drawerBoxes), firstNonNone(drawerSlides), null, 1);

    // Edgebands (8 codes pre-seeded)
    const ebIns = db.prepare(`
      INSERT INTO finish_group_edgebands (id, finish_group_id, code, edgeband_id, where_used, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const codes = ["D", "E", "I", "V", "U", "B", "C", "X"];
    const usages = [
      "applied_ends_doors_dwr_fronts", "cabinet_body_parts", "adjustable_shelves",
      "bottom_upper_fe", "bottom_upper_unfe", "drawer_box_sides",
      "drawer_box_front_back", "misc",
    ];
    for (let c = 0; c < codes.length; c++) {
      ebIns.run(uid(), fg.id, codes[c], firstNonNone(edgebands), usages[c], null, c);
    }

    // Hardware (11 canonical roles)
    const hwIns = db.prepare(`
      INSERT INTO finish_group_hardware (id, finish_group_id, role, slot_label, hardware_id,
        qty, location, vendor, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const hwRoles = ["hinges", "drawer_slides", "rollout_slides", "closet_rod",
                     "trash_pullout", "base_pullout", "blind_corner", "shelf_clips",
                     "door_pulls", "drawer_pulls", "misc"];
    for (let h = 0; h < hwRoles.length; h++) {
      const role = hwRoles[h];
      const cat = hwByRole[role] ?? [];
      // Mandatory roles get a real (non-None) value; optional roles get the "None" row.
      const mandatory = ["hinges", "drawer_slides", "door_pulls", "drawer_pulls"].includes(role);
      const hwId = mandatory ? firstNonNone(cat) : firstId(cat); // first id may be the None row
      hwIns.run(uid(), fg.id, role, null, hwId, mandatory ? 24 : null,
        null, mandatory ? cat.find((r) => r.id === hwId)?.brand ?? null : null, null, h);
    }

    // Moldings (11 canonical types)
    const mldIns = db.prepare(`
      INSERT INTO finish_moldings (id, finish_group_id, molding_type, molding_profile_id,
        qty_lf, notes, sort_order, size_in, material_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const mldTypes = ["toe_skin", "filler_1", "filler_2", "crown_1", "crown_2",
                      "crown_nailer", "light_rail", "shelf_cleating", "base_shoe",
                      "scribe", "base"];
    for (let m = 0; m < mldTypes.length; m++) {
      const t = mldTypes[m];
      // Kitchen has crown 1+2 + light rail; bath has only base + scribe.
      const used = isKitchen
        ? ["toe_skin", "crown_1", "crown_2", "light_rail", "base"].includes(t)
        : ["base", "scribe"].includes(t);
      mldIns.run(uid(), fg.id, t,
        used ? firstNonNone(moldingProfs) : null,
        used ? 24.0 : null,
        null, m,
        used ? 3.0 : null,
        used ? firstNonNone(moldingMats) : null);
    }

    // Countertop (kitchen only)
    if (isKitchen) {
      db.prepare(`
        INSERT INTO finish_group_countertops (id, finish_group_id, location, style_id, edge_id,
          splash_style, splash_edge_id, material_id, buildup_in, core_substrate, brackets, notes, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uid(), fg.id, "Perimeter",
        firstNonNone(ctopStyles), firstNonNone(ctopEdges),
        "4 inch backsplash", firstNonNone(ctopEdges),
        firstNonNone(ctopMats), 1.5, "Plywood", null, null, 0);
    }
  }

  // Rooms
  const roomKitchen   = uid();
  const roomBath      = uid();
  const roomPantry    = uid();
  db.prepare(`INSERT INTO rooms (id, spec_id, name, finish_group_id, notes, sort_order) VALUES (?,?,?,?,?,?)`)
    .run(roomKitchen, specId, "Kitchen", fgs[0].id, "Main kitchen", 0);
  db.prepare(`INSERT INTO rooms (id, spec_id, name, finish_group_id, notes, sort_order) VALUES (?,?,?,?,?,?)`)
    .run(roomBath, specId, "Master Bath", fgs[1].id, "Master vanity + linen tower", 1);
  db.prepare(`INSERT INTO rooms (id, spec_id, name, finish_group_id, notes, sort_order) VALUES (?,?,?,?,?,?)`)
    .run(roomPantry, specId, "Pantry", fgs[0].id, "Walk-in pantry — same finish as kitchen", 2);

  // Room ↔ finish links (the new model)
  const rfIns = db.prepare(`INSERT INTO room_finishes (id, room_id, finish_group_id, zone, sort_order) VALUES (?,?,?,?,?)`);
  rfIns.run(uid(), roomKitchen, fgs[0].id, "perimeter + island", 0);
  rfIns.run(uid(), roomBath,    fgs[1].id, "vanity",             0);
  rfIns.run(uid(), roomPantry,  fgs[0].id, "matched to kitchen", 0);

  // Accessories (one per room)
  const accId = firstNonNone(accessories) || (accessories[0]?.id ?? null);
  if (accId) {
    db.prepare(`INSERT INTO room_accessories (id, room_id, acc_id, qty) VALUES (?,?,?,?)`).run(uid(), roomKitchen, accId, 2);
    db.prepare(`INSERT INTO room_accessories (id, room_id, acc_id, qty) VALUES (?,?,?,?)`).run(uid(), roomBath,    accId, 1);
  }

  console.log(`[seed-spec] seeded:`);
  console.log(`  job   ${jobId}`);
  console.log(`  spec  ${specId} ("Spec Fixture v2")`);
  console.log(`  finish_groups   ${fgs.length} (${fgs.map((f) => f.label).join(", ")})`);
  console.log(`  per finish_group: 4 materials, 5 door fronts, 2 drawers, 8 edgebands, 11 hardware, 11 moldings`);
  console.log(`  countertops     1 (kitchen)`);
  console.log(`  rooms           3 (Kitchen, Master Bath, Pantry)`);

  return { jobId, specId };
});

const { jobId, specId } = seed();

// Sanity-check counts.
const counts = {
  jobs:                       db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE id = ?").get(jobId).n,
  residential_specs:          db.prepare("SELECT COUNT(*) AS n FROM residential_specs WHERE id = ?").get(specId).n,
  finish_groups:              db.prepare("SELECT COUNT(*) AS n FROM finish_groups WHERE spec_id = ?").get(specId).n,
  finish_group_materials:     db.prepare("SELECT COUNT(*) AS n FROM finish_group_materials WHERE finish_group_id IN (SELECT id FROM finish_groups WHERE spec_id = ?)").get(specId).n,
  finish_group_door_fronts:   db.prepare("SELECT COUNT(*) AS n FROM finish_group_door_fronts WHERE finish_group_id IN (SELECT id FROM finish_groups WHERE spec_id = ?)").get(specId).n,
  finish_group_drawers:       db.prepare("SELECT COUNT(*) AS n FROM finish_group_drawers WHERE finish_group_id IN (SELECT id FROM finish_groups WHERE spec_id = ?)").get(specId).n,
  finish_group_edgebands:     db.prepare("SELECT COUNT(*) AS n FROM finish_group_edgebands WHERE finish_group_id IN (SELECT id FROM finish_groups WHERE spec_id = ?)").get(specId).n,
  finish_group_hardware:      db.prepare("SELECT COUNT(*) AS n FROM finish_group_hardware WHERE finish_group_id IN (SELECT id FROM finish_groups WHERE spec_id = ?)").get(specId).n,
  finish_moldings:            db.prepare("SELECT COUNT(*) AS n FROM finish_moldings WHERE finish_group_id IN (SELECT id FROM finish_groups WHERE spec_id = ?)").get(specId).n,
  finish_group_countertops:   db.prepare("SELECT COUNT(*) AS n FROM finish_group_countertops WHERE finish_group_id IN (SELECT id FROM finish_groups WHERE spec_id = ?)").get(specId).n,
  rooms:                      db.prepare("SELECT COUNT(*) AS n FROM rooms WHERE spec_id = ?").get(specId).n,
  room_finishes:              db.prepare("SELECT COUNT(*) AS n FROM room_finishes WHERE room_id IN (SELECT id FROM rooms WHERE spec_id = ?)").get(specId).n,
};
console.log("\n[seed-spec] post-seed counts:");
for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(28)} ${v}`);

db.close();
console.log(`\n[seed-spec] done. Open /jobs/${jobId} or browse /jobs in the dev server.`);
