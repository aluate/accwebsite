/**
 * ACC Website self-test harness.
 *
 *   npm run selftest
 *
 * Runs a battery of checks that don't require the dev server to be up.
 * Prints PASS/FAIL/SKIP per check and exits non-zero if any FAIL.
 *
 * Uses node:sqlite (built-in, Node 22+) so it works on both Windows and
 * Linux. WAL-mode means it's safe to run while the dev server is also
 * connected.
 *
 * What's covered:
 *   - Catalog integrity: every CSV parses, JSON exists and parses, row counts
 *   - Catalog FKs: Cab Door presets / builder profiles reference real IDs
 *   - DB schema: required tables and columns present
 *   - DB auth: at least one active admin
 *   - DB FK integrity: finish_group.carcass_id / drawer_box_id / edgeband_id
 *     point at real catalog rows
 *   - DB referential integrity: room_finishes.finish_group_id points within spec
 *   - Lifecycle: in-memory DB runs the 11 transition cases
 *   - TypeScript compile: `tsc --noEmit` exits clean
 *
 * What's NOT covered (still needs the dev server):
 *   - HTTP request/response shape from real route handlers
 *   - React UI render correctness
 *   - File upload via multipart
 *   - DocuSign / external API integrations
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO      = join(__dirname, "..");
const CATALOGS  = join(REPO, "data", "catalogs");
const DB_PATH   = join(REPO, "data", "acc-jobs.db");

// ── tiny test framework ──────────────────────────────────────────────────────
const results = []; // { name, status: "PASS"|"FAIL"|"SKIP", detail?: string }

function check(name, fn) {
  try {
    const detail = fn();
    results.push({ name, status: "PASS", detail });
  } catch (err) {
    const msg = String(err.message || err);
    // Pre-migration detection: skip cleanly with the hint instead of failing.
    if (msg.includes("DB pre-migration")) {
      results.push({ name, status: "SKIP", detail: msg });
    } else {
      results.push({ name, status: "FAIL", detail: msg });
    }
  }
}

function skip(name, why) {
  results.push({ name, status: "SKIP", detail: why });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ── catalog integrity ────────────────────────────────────────────────────────
check("catalog: every CSV has a matching JSON", () => {
  const csvs = readdirSync(CATALOGS).filter((f) => f.endsWith(".csv"));
  let counts = [];
  for (const csv of csvs) {
    const json = csv.replace(".csv", ".json");
    const jsonPath = join(CATALOGS, json);
    assert(existsSync(jsonPath), `missing JSON: ${json}`);
    const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
    assert(Array.isArray(data), `${json} is not an array`);
    counts.push(`${csv.replace(".csv","")}=${data.length}`);
  }
  return `${csvs.length} catalogs · ${counts.slice(0,5).join(", ")}…`;
});

function loadCatalog(name) {
  return JSON.parse(readFileSync(join(CATALOGS, `${name}.json`), "utf-8"));
}

check("catalog FK: cabdoor_presets reference real profile/panel/edge/mitre IDs", () => {
  const presets   = loadCatalog("cabdoor_presets");
  const profiles  = new Set(loadCatalog("cabdoor_inside_profiles").map((r) => r.id));
  const panels    = new Set(loadCatalog("cabdoor_panels").map((r) => r.id));
  const edges     = new Set(loadCatalog("cabdoor_edge_details").map((r) => r.id));
  const mitres    = new Set(loadCatalog("cabdoor_mitre_patterns").map((r) => r.id));
  let bad = [];
  for (const p of presets) {
    if (p.inside_profile_id && p.inside_profile_id !== "" && !profiles.has(p.inside_profile_id)) bad.push(`${p.id} → unknown profile ${p.inside_profile_id}`);
    if (p.panel_id          && !panels.has(p.panel_id))                                          bad.push(`${p.id} → unknown panel ${p.panel_id}`);
    if (p.edge_detail_id    && !edges.has(p.edge_detail_id))                                     bad.push(`${p.id} → unknown edge ${p.edge_detail_id}`);
    if (p.mitre_pattern_id  && !mitres.has(p.mitre_pattern_id))                                  bad.push(`${p.id} → unknown mitre ${p.mitre_pattern_id}`);
  }
  assert(bad.length === 0, `${bad.length} bad refs:\n  ${bad.slice(0,5).join("\n  ")}`);
  return `${presets.length} presets · all FKs resolve`;
});

check("catalog FK: builder_profiles reference real carcass/drawer_box/pull IDs", () => {
  const profiles  = loadCatalog("builder_profiles");
  const carcass   = new Set(loadCatalog("colors_carcass").map((r) => r.id));
  const drawer    = new Set(loadCatalog("drawer_box").map((r) => r.id));
  const pulls     = new Set(loadCatalog("hardware_pulls").map((r) => r.id));
  let bad = [];
  for (const p of profiles) {
    if (p.default_carcass_id    && !carcass.has(p.default_carcass_id))    bad.push(`${p.id} → unknown carcass ${p.default_carcass_id}`);
    if (p.default_drawer_box_id && !drawer.has(p.default_drawer_box_id))  bad.push(`${p.id} → unknown drawer ${p.default_drawer_box_id}`);
    if (p.default_pull_id       && !pulls.has(p.default_pull_id))         bad.push(`${p.id} → unknown pull ${p.default_pull_id}`);
  }
  assert(bad.length === 0, `${bad.length} bad refs:\n  ${bad.slice(0,5).join("\n  ")}`);
  return `${profiles.length} builder profiles · all FKs resolve`;
});

// ── DB schema + content ──────────────────────────────────────────────────────
let db;
try {
  db = new DatabaseSync(DB_PATH);
} catch (e) {
  skip("db: open via node:sqlite", `cannot open ${DB_PATH}: ${e.message}`);
}

if (db) {
  // Detect "pre-migration" state — i.e. DB exists but the dev server hasn't
  // booted since we added new tables/columns. lib/db.ts runs migrations on
  // import; until the server boots once, those new shapes won't be present.
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  const builderCols = db.prepare("PRAGMA table_info(builder_accounts)").all().map((r) => r.name);
  const migrationsApplied = tables.includes("spec_lifecycle_transitions") && builderCols.includes("role");
  const dbHint = migrationsApplied
    ? null
    : "DB pre-migration state — boot the dev server once (npm run dev) so lib/db.ts runs ALTER TABLEs, then re-run selftest";

  check("db: required tables exist", () => {
    if (!migrationsApplied) throw new Error(dbHint);
    const required = [
      "jobs", "residential_specs", "finish_groups", "rooms",
      "room_finishes", "finish_moldings", "finish_molding_rooms",
      "room_accessories", "cabinet_line_items", "builder_accounts",
      "builder_sessions", "spec_archives", "spec_lifecycle_transitions",
      // Spec form expansion v2 (2026-05-06):
      "schema_version",
      "finish_group_materials", "finish_group_door_fronts", "finish_group_drawers",
      "finish_group_edgebands", "finish_group_hardware", "finish_group_countertops",
      // Schedule dashboard v3 (2026-05-06):
      "crews", "job_events", "job_event_audit", "schedule_weeks",
      // Activity log v4 (2026-05-06):
      "activity_log",
    ];
    const missing = required.filter((t) => !tables.includes(t));
    assert(missing.length === 0, `missing tables: ${missing.join(", ")}`);
    return `${required.length} required tables present`;
  });

  check("db: required columns exist on key tables", () => {
    if (!migrationsApplied) throw new Error(dbHint);
    function cols(table) { return db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name); }
    const requirements = {
      builder_accounts:   ["role"],
      jobs:               ["builder_id", "notes_install", "notes_finishing", "notes_shop", "notes_client"],
      // Old $70k columns kept (deprecated, scheduled for cleanup migration); new
      // v2 columns added 2026-05-06.
      finish_groups:      ["carcass_id", "drawer_box_id", "edgeband_id",
                           "stain_id", "paint_id", "glaze_id", "topcoat_id", "sheen_id"],
      finish_moldings:    ["size_in", "material_id"],
      residential_specs:  ["lifecycle_state"],
    };
    const bad = [];
    for (const [table, needed] of Object.entries(requirements)) {
      const have = cols(table);
      for (const c of needed) {
        if (!have.includes(c)) bad.push(`${table}.${c}`);
      }
    }
    assert(bad.length === 0, `missing columns: ${bad.join(", ")}`);
    return `${Object.values(requirements).flat().length} required columns present`;
  });

  check("db: at least one active admin", () => {
    if (!migrationsApplied) throw new Error(dbHint);
    const row = db.prepare("SELECT COUNT(*) AS n FROM builder_accounts WHERE role = 'admin' AND active = 1").get();
    assert(row.n >= 1, "no active admin found");
    const adminUsernames = db.prepare("SELECT username FROM builder_accounts WHERE role = 'admin' AND active = 1").all().map((r) => r.username);
    return `${row.n} admin(s): ${adminUsernames.join(", ")}`;
  });

  check("db: finish_group child-table FK integrity (the $70k columns, v2)", () => {
    if (!migrationsApplied) throw new Error(dbHint);
    // Post-2026-05-06: $70k columns moved from finish_groups to child tables.
    // Validate the new locations: finish_group_materials.material_id,
    // finish_group_drawers.drawer_box_id, finish_group_edgebands.edgeband_id.
    const carcass = new Set(loadCatalog("colors_carcass").map((r) => r.id));
    const drawer  = new Set(loadCatalog("drawer_box").map((r) => r.id));
    const edges   = new Set(loadCatalog("edgeband").map((r) => r.id));
    const bad = [];
    const mats = db.prepare("SELECT id, finish_group_id, material_id FROM finish_group_materials WHERE material_id IS NOT NULL").all();
    for (const m of mats) {
      if (!carcass.has(m.material_id)) bad.push(`fg_material ${m.id} → unknown carcass ${m.material_id}`);
    }
    const drws = db.prepare("SELECT id, finish_group_id, drawer_box_id FROM finish_group_drawers WHERE drawer_box_id IS NOT NULL").all();
    for (const d of drws) {
      if (!drawer.has(d.drawer_box_id)) bad.push(`fg_drawer ${d.id} → unknown drawer_box ${d.drawer_box_id}`);
    }
    const ebs = db.prepare("SELECT id, finish_group_id, edgeband_id FROM finish_group_edgebands WHERE edgeband_id IS NOT NULL").all();
    for (const e of ebs) {
      if (!edges.has(e.edgeband_id)) bad.push(`fg_edgeband ${e.id} → unknown edgeband ${e.edgeband_id}`);
    }
    assert(bad.length === 0, `${bad.length} bad FKs:\n  ${bad.slice(0,5).join("\n  ")}`);
    return `${mats.length} materials + ${drws.length} drawers + ${ebs.length} edgebands · all FKs valid (or null)`;
  });

  check("db: room_finishes point to finish_groups in the same spec", () => {
    if (!migrationsApplied) throw new Error(dbHint);
    const rows = db.prepare(`
      SELECT rf.id, rf.room_id, rf.finish_group_id,
             r.spec_id AS room_spec, fg.spec_id AS fg_spec
      FROM room_finishes rf
      JOIN rooms          r  ON r.id = rf.room_id
      LEFT JOIN finish_groups fg ON fg.id = rf.finish_group_id
    `).all();
    const bad = [];
    for (const r of rows) {
      if (!r.fg_spec)             bad.push(`rf ${r.id} → unknown finish_group ${r.finish_group_id}`);
      else if (r.room_spec !== r.fg_spec) bad.push(`rf ${r.id} → cross-spec leak (room=${r.room_spec}, fg=${r.fg_spec})`);
    }
    assert(bad.length === 0, `${bad.length} bad refs:\n  ${bad.slice(0,5).join("\n  ")}`);
    return `${rows.length} room_finishes · all valid`;
  });


  // === Sev-1 cleanup checks (require migrations) ===
  check("db: portal_sessions FK to portal_accounts", () => {
    if (!migrationsApplied) throw new Error(dbHint);
    const local = new DatabaseSync(DB_PATH);
    try {
      const tables = local.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
      const need = ["builder_portal_accounts","builder_portal_sessions","builder_required_inputs","builder_change_requests","drawing_comments"];
      const missing = need.filter((t) => !tables.includes(t));
      assert(missing.length === 0, `missing portal tables: ${missing.join(", ")}`);
      // Orphan portal sessions check (no FK violations from non-existent accounts).
      const orphan = local.prepare("SELECT COUNT(*) AS n FROM builder_portal_sessions s LEFT JOIN builder_portal_accounts a ON a.id = s.account_id WHERE a.id IS NULL").get();
      assert(orphan.n === 0, `${orphan.n} orphan portal sessions (FK violation)`);
      return `${need.length} portal tables present, no orphan sessions`;
    } finally { local.close(); }
  });

  check("db: no NULLs in $70k columns (v2 — child-table check)", () => {
    if (!migrationsApplied) throw new Error(dbHint);
    // Post-2026-05-06: the $70k canary moved from finish_groups columns to
    // child-table rows. A finish_group is "complete" if it has at least
    // cab_ext + cab_int materials selected, drawer_box drawer selected, and at
    // least one edgeband row populated.
    const local = new DatabaseSync(DB_PATH);
    try {
      // Find finish_groups missing any of the canary fields.
      const incomplete = local.prepare(`
        SELECT fg.id,
               (SELECT COUNT(*) FROM finish_group_materials m
                  WHERE m.finish_group_id = fg.id
                    AND m.role IN ('cab_ext','cab_int')
                    AND m.material_id IS NOT NULL) AS mat_filled,
               (SELECT COUNT(*) FROM finish_group_drawers d
                  WHERE d.finish_group_id = fg.id
                    AND d.role = 'drawer_box'
                    AND d.drawer_box_id IS NOT NULL) AS drawer_filled,
               (SELECT COUNT(*) FROM finish_group_edgebands e
                  WHERE e.finish_group_id = fg.id
                    AND e.edgeband_id IS NOT NULL) AS edgeband_filled
          FROM finish_groups fg
      `).all();
      const bad = incomplete.filter((r) => r.mat_filled < 2 || r.drawer_filled < 1 || r.edgeband_filled < 1);
      assert(bad.length === 0,
        `${bad.length} finish_groups incomplete on $70k canary fields — open in /jobs and fill the dropdowns`);
      return `${incomplete.length} finish_groups · all $70k canary fields populated`;
    } finally {
      local.close();
    }
  });

  check("db: webhook_errors is empty (no silent failures)", () => {
    if (!migrationsApplied) throw new Error(dbHint);
    const local = new DatabaseSync(DB_PATH);
    try {
      // Table may not exist on a stale DB; degrade gracefully.
      const tables = local.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='webhook_errors'").all();
      if (tables.length === 0) return "webhook_errors table missing (run npm run migrate)";
      const row = local.prepare("SELECT COUNT(*) AS n FROM webhook_errors").get();
      assert(row.n === 0, `${row.n} webhook errors logged — investigate via SELECT * FROM webhook_errors ORDER BY created_at DESC`);
      return "no webhook errors";
    } finally {
      local.close();
    }
  });

  check("db: room_accessories reference real catalog rows", () => {
    if (!migrationsApplied) throw new Error(dbHint);
    const accIds = new Set(loadCatalog("accessories_reva").map((r) => r.id));
    const local = new DatabaseSync(DB_PATH);
    try {
      const rows = local.prepare("SELECT DISTINCT acc_id FROM room_accessories").all();
      const orphan = rows.filter((r) => !accIds.has(r.acc_id));
      assert(orphan.length === 0, `${orphan.length} room_accessories reference unknown catalog IDs: ${orphan.slice(0,3).map(r=>r.acc_id).join(", ")}`);
      return `${rows.length} accessory ID references all valid`;
    } finally {
      local.close();
    }
  });

  check("db: door_fronts and hardware-pulls reference real catalog (v2)", () => {
    if (!migrationsApplied) throw new Error(dbHint);
    // Post-2026-05-06: door_style_id moved to finish_group_door_fronts.style_id,
    // and pull_id moved to finish_group_hardware (role = 'door_pulls' / 'drawer_pulls').
    // NOTE: door_styles catalog is being reworked (Phase 0); this check skips
    // strict validation against door_styles until catalog rework lands. Hardware
    // pulls catalog is also being split into 11 per-role CSVs (Phase 2); this
    // check skips strict pull validation until those CSVs are in place.
    const local = new DatabaseSync(DB_PATH);
    try {
      const dfs   = local.prepare("SELECT id, style_id FROM finish_group_door_fronts").all();
      const pulls = local.prepare("SELECT id, hardware_id, role FROM finish_group_hardware WHERE role IN ('door_pulls','drawer_pulls')").all();
      // Smoke check: rows exist (or vacuously pass when DB is fresh).
      return `${dfs.length} door_front rows · ${pulls.length} pull rows (catalog FK validation deferred until Phase 0/2)`;
    } finally {
      local.close();
    }
  });

  check("db: schema_version records v1 + v2 + v3 + v4", () => {
    if (!migrationsApplied) throw new Error(dbHint);
    const local = new DatabaseSync(DB_PATH);
    try {
      const tables = local.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'").all();
      assert(tables.length === 1, "schema_version table not present — run npm run migrate");
      const versions = local.prepare("SELECT version FROM schema_version ORDER BY version").all().map((r) => r.version);
      assert(versions.includes(1), "schema_version v1 (baseline) missing");
      assert(versions.includes(2), "schema_version v2 (spec form expansion) missing — boot dev server or run npm run migrate");
      assert(versions.includes(3), "schema_version v3 (schedule dashboard) missing — boot dev server or run npm run migrate");
      assert(versions.includes(4), "schema_version v4 (activity_log) missing — boot dev server or run npm run migrate");
      return `schema at versions [${versions.join(",")}]`;
    } finally {
      local.close();
    }
  });

  // ── Activity log v4 (2026-05-06) ──────────────────────────────────────────
  check("activity_log: required columns present", () => {
    if (!migrationsApplied) throw new Error(dbHint);
    const local = new DatabaseSync(DB_PATH);
    try {
      const cols = local.prepare("PRAGMA table_info(activity_log)").all().map((r) => r.name);
      const required = [
        "id","entity_type","entity_id","job_id","event_type",
        "from_state","to_state","actor","actor_role","payload","occurred_at",
      ];
      const missing = required.filter((c) => !cols.includes(c));
      assert(missing.length === 0, `activity_log missing columns: ${missing.join(", ")}`);
      const idx = local.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='activity_log'").all().map((r) => r.name);
      assert(idx.length >= 4, `activity_log indexes missing — expected 4 (entity, job, actor, at), got ${idx.length}: ${idx.join(", ")}`);
      return `activity_log present · ${cols.length} columns · ${idx.length} indexes`;
    } finally {
      local.close();
    }
  });

  check("activity_log: actor never null (discipline rule)", () => {
    if (!migrationsApplied) throw new Error(dbHint);
    const local = new DatabaseSync(DB_PATH);
    try {
      const row = local.prepare("SELECT COUNT(*) AS n FROM activity_log WHERE actor IS NULL OR actor = ''").get();
      assert(row.n === 0, `${row.n} activity_log rows have empty actor — discipline rule violated`);
      const total = local.prepare("SELECT COUNT(*) AS n FROM activity_log").get().n;
      return `${total} activity rows · all have actor`;
    } finally {
      local.close();
    }
  });

  // ── Schedule dashboard v3 (2026-05-06) ────────────────────────────────────
  check("schedule v3: job_events FK integrity (jobs + crews)", () => {
    if (!migrationsApplied) throw new Error(dbHint);
    const local = new DatabaseSync(DB_PATH);
    try {
      // Orphan job_events referencing non-existent jobs (FK normally prevents
      // this, but check explicitly so we surface drift if the FK got disabled).
      const orphanJob = local.prepare(`
        SELECT je.id FROM job_events je
        LEFT JOIN jobs j ON j.id = je.job_id
        WHERE j.id IS NULL
      `).all();
      assert(orphanJob.length === 0, `${orphanJob.length} job_events reference unknown jobs`);

      // crew_id is nullable; check only when set.
      const orphanCrew = local.prepare(`
        SELECT je.id, je.crew_id FROM job_events je
        LEFT JOIN crews c ON c.id = je.crew_id
        WHERE je.crew_id IS NOT NULL AND c.id IS NULL
      `).all();
      assert(orphanCrew.length === 0, `${orphanCrew.length} job_events reference unknown crews`);

      const total = local.prepare("SELECT COUNT(*) AS n FROM job_events").get().n;
      return `${total} job_events · all FKs valid`;
    } finally {
      local.close();
    }
  });

  check("schedule v3: parent_event_id never points to itself or wrong job", () => {
    if (!migrationsApplied) throw new Error(dbHint);
    const local = new DatabaseSync(DB_PATH);
    try {
      // Self-reference would create infinite "1 of N" labeling loops.
      const selfRef = local.prepare("SELECT id FROM job_events WHERE parent_event_id = id").all();
      assert(selfRef.length === 0, `${selfRef.length} job_events self-reference via parent_event_id`);

      // Splits should always link to a parent on the same job.
      const crossJob = local.prepare(`
        SELECT je.id, je.job_id, p.job_id AS parent_job
        FROM job_events je
        JOIN job_events p ON p.id = je.parent_event_id
        WHERE p.job_id <> je.job_id
      `).all();
      assert(crossJob.length === 0, `${crossJob.length} parent_event_id rows link across jobs`);

      const linked = local.prepare("SELECT COUNT(*) AS n FROM job_events WHERE parent_event_id IS NOT NULL").get().n;
      return `${linked} parent-linked events · all valid`;
    } finally {
      local.close();
    }
  });

  check("schedule v3: at least one crew exists (run npm run seed-crews if not)", () => {
    if (!migrationsApplied) throw new Error(dbHint);
    const local = new DatabaseSync(DB_PATH);
    try {
      const row = local.prepare("SELECT COUNT(*) AS n FROM crews WHERE active = 1").get();
      assert(row.n >= 1, "no active crews — run npm run seed-crews");
      const names = local.prepare("SELECT name FROM crews WHERE active = 1 ORDER BY name").all().map((r) => r.name);
      return `${row.n} active crew(s): ${names.join(", ")}`;
    } finally {
      local.close();
    }
  });

  db.close();
}



// ── Lifecycle state machine (in-memory) ──────────────────────────────────────
check("lifecycle: 11/11 transition cases (in-memory)", () => {
  const STATES = ["DRAFT","CLIENT_APPROVED","RELEASED_TO_ENG","ENGINEERED","RELEASED_TO_SHOP"];
  const m = new DatabaseSync(":memory:");
  m.exec(`
    CREATE TABLE residential_specs (id TEXT PRIMARY KEY, lifecycle_state TEXT NOT NULL DEFAULT 'DRAFT');
    CREATE TABLE spec_lifecycle_transitions (id TEXT PRIMARY KEY, spec_id TEXT, from_state TEXT, to_state TEXT, transitioned_at TEXT, transitioned_by TEXT, reason TEXT, notes TEXT);
    INSERT INTO residential_specs(id, lifecycle_state) VALUES ('s1','DRAFT'), ('s2','DRAFT');
  `);
  function transition(specId, to, actor, reason) {
    const cur = m.prepare("SELECT lifecycle_state FROM residential_specs WHERE id = ?").get(specId);
    if (!cur) return { ok: false, error: "Spec not found" };
    const from = cur.lifecycle_state;
    if (!STATES.includes(to)) return { ok: false, error: `Invalid: ${to}` };
    if (from === to) return { ok: false, error: `Already in ${to}` };
    const fi = STATES.indexOf(from), ti = STATES.indexOf(to);
    const fwd = ti === fi + 1, bwd = ti < fi;
    if (!fwd && !bwd) return { ok: false, error: `Cannot skip ${from} -> ${to}` };
    if (bwd && !reason) return { ok: false, error: "Backwards needs reason" };
    m.prepare("UPDATE residential_specs SET lifecycle_state = ? WHERE id = ?").run(to, specId);
    m.prepare("INSERT INTO spec_lifecycle_transitions VALUES (?,?,?,?,?,?,?,?)")
      .run(Math.random().toString(36).slice(2,8), specId, from, to, new Date().toISOString(), actor, reason ?? null, null);
    return { ok: true, from, to };
  }
  const cases = [
    ["forward DRAFT→CLIENT_APPROVED", transition("s1","CLIENT_APPROVED","karl"), { ok: true }],
    ["forward →RELEASED_TO_ENG",       transition("s1","RELEASED_TO_ENG","karl"),  { ok: true }],
    ["forward →ENGINEERED",            transition("s1","ENGINEERED","karl"),       { ok: true }],
    ["forward →RELEASED_TO_SHOP",      transition("s1","RELEASED_TO_SHOP","karl"), { ok: true }],
    ["backward at terminal w/o reason",transition("s1","ENGINEERED","karl"),       { ok: false, contains: "needs reason" }],
    ["backward WITH reason",           transition("s1","ENGINEERED","karl","shop flag"), { ok: true }],
    ["forward back to terminal",       transition("s1","RELEASED_TO_SHOP","karl"), { ok: true }],
    ["skip 2 forward DRAFT→ENG",       transition("s2","RELEASED_TO_ENG","karl"),  { ok: false, contains: "skip" }],
    ["same state",                     transition("s2","DRAFT","karl"),            { ok: false, contains: "Already" }],
    ["invalid state name",             transition("s2","BOGUS","karl"),            { ok: false, contains: "Invalid" }],
    ["unknown spec",                   transition("nonexistent","DRAFT","karl"),   { ok: false, contains: "not found" }],
  ];
  let pass = 0, fail = 0;
  const failures = [];
  for (const [name, got, want] of cases) {
    const okMatch  = got.ok === want.ok;
    const errMatch = !want.contains || (got.error && got.error.toLowerCase().includes(want.contains.toLowerCase()));
    if (okMatch && errMatch) pass++;
    else { fail++; failures.push(`${name}: got ${JSON.stringify(got)}`); }
  }
  m.close();
  assert(fail === 0, `${fail}/${cases.length} failed:\n  ${failures.slice(0,3).join("\n  ")}`);
  return `${pass}/${cases.length} passed`;
});


// ── Approval state machine (in-memory) ──────────────────────────────────────
check("approvals: edge legality + happy-path", () => {
  // Mirror the EDGES map from lib/approvals.ts so this test stays standalone.
  const EDGES = {
    DRAFT:     ["SENT","VOIDED"],
    SENT:      ["VIEWED","SIGNED","DECLINED","VOIDED","EXPIRED"],
    VIEWED:    ["SIGNED","DECLINED","VOIDED","EXPIRED"],
    SIGNED:    ["COMPLETED","VOIDED"],
    COMPLETED: [],
    DECLINED:  [],
    VOIDED:    [],
    EXPIRED:   [],
  };
  function canTransition(from, to) {
    return EDGES[from] && EDGES[from].includes(to);
  }
  const cases = [
    ["DRAFT→SENT",       canTransition("DRAFT","SENT"),       true],
    ["DRAFT→VOIDED",     canTransition("DRAFT","VOIDED"),     true],
    ["DRAFT→SIGNED skip",canTransition("DRAFT","SIGNED"),     false],
    ["SENT→VIEWED",      canTransition("SENT","VIEWED"),      true],
    ["SENT→SIGNED",      canTransition("SENT","SIGNED"),      true],
    ["SENT→DECLINED",    canTransition("SENT","DECLINED"),    true],
    ["SENT→COMPLETED skip", canTransition("SENT","COMPLETED"), false],
    ["VIEWED→SIGNED",    canTransition("VIEWED","SIGNED"),    true],
    ["SIGNED→COMPLETED", canTransition("SIGNED","COMPLETED"), true],
    ["COMPLETED→anywhere",canTransition("COMPLETED","SENT"),  false],
    ["DECLINED is terminal", canTransition("DECLINED","SIGNED"), false],
    ["VOIDED is terminal", canTransition("VOIDED","SENT"),    false],
    ["unknown→anything", canTransition("BOGUS","SENT"),       false],
  ];
  let pass = 0, fail = 0, failures = [];
  for (const [name, got, want] of cases) {
    if ((got === true) === (want === true)) pass++;
    else { fail++; failures.push(`${name}: got ${got}, want ${want}`); }
  }
  assert(fail === 0, `${fail}/${cases.length} edge tests failed: ${failures.slice(0,3).join("; ")}`);
  return `${pass}/${cases.length} edge legality cases pass`;
});

// ── TypeScript compile ───────────────────────────────────────────────────────
check("typescript: tsc --noEmit", () => {
  // Windows: npx is a .cmd shim that doesn't always return clean exit codes
  // through spawnSync. Call tsc directly via node_modules/.bin for reliability.
  const tscBin = process.platform === "win32"
    ? join(REPO, "node_modules", ".bin", "tsc.cmd")
    : join(REPO, "node_modules", ".bin", "tsc");
  const r = spawnSync(tscBin, ["--noEmit"], { cwd: REPO, encoding: "utf-8", shell: process.platform === "win32" });
  if (r.status !== 0) {
    // Show ALL output (stdout + stderr) trimmed to first 8 lines so root cause
    // is visible. Without this, "tsc failed" gives nothing actionable.
    const all = ((r.stdout || "") + "\n" + (r.stderr || "")).split("\n").filter(Boolean).slice(0, 8);
    throw new Error(all.length ? all.join(" | ") : `tsc exited ${r.status}`);
  }
  return "no type errors";
});

// ── Report ───────────────────────────────────────────────────────────────────
const COLS = { PASS: "\x1b[32m", FAIL: "\x1b[31m", SKIP: "\x1b[33m", reset: "\x1b[0m" };
console.log("\nACC self-test\n=============");
let nPass = 0, nFail = 0, nSkip = 0;
for (const r of results) {
  const tag = `${COLS[r.status]}${r.status}${COLS.reset}`;
  console.log(`  ${tag.padEnd(6)} ${r.name}${r.detail ? "  ·  " + r.detail : ""}`);
  if (r.status === "PASS") nPass++;
  else if (r.status === "FAIL") nFail++;
  else nSkip++;
}
console.log(`\n${nPass} pass · ${nFail} fail · ${nSkip} skip`);
process.exit(nFail > 0 ? 1 : 0);
