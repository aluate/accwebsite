/**
 * scripts/db-push.mjs
 * Applies the full ACC website schema to Supabase Postgres.
 * Idempotent — uses CREATE TABLE IF NOT EXISTS throughout.
 * Run once after setting up Supabase:  node scripts/db-push.mjs
 */
import postgres from "postgres";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const sql = postgres(DATABASE_URL, { ssl: "require", max: 1 });

async function main() {
  console.log("Pushing schema to Supabase...");

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version     INTEGER PRIMARY KEY,
      applied_at  TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, seq INTEGER, created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'intake', job_type TEXT NOT NULL DEFAULT 'residential',
      client_name TEXT NOT NULL, client_email TEXT, client_phone TEXT,
      site_address TEXT NOT NULL, city TEXT, pm TEXT,
      builder_name TEXT, builder_email TEXT, builder_phone TEXT, builder_company TEXT,
      delivery_date TEXT, notes TEXT,
      mod_residential INTEGER NOT NULL DEFAULT 0, mod_commercial INTEGER NOT NULL DEFAULT 0,
      mod_trim INTEGER NOT NULL DEFAULT 0, mod_doors INTEGER NOT NULL DEFAULT 0,
      builder_id TEXT,
      notes_install TEXT, notes_finishing TEXT, notes_shop TEXT, notes_client TEXT,
      builder_portal_enabled INTEGER NOT NULL DEFAULT 0,
      target_delivery_weeks INTEGER NOT NULL DEFAULT 8,
      delivery_clock_started_at TEXT, estimated_delivery_at TEXT
    );

    CREATE TABLE IF NOT EXISTS seq (
      id INTEGER PRIMARY KEY DEFAULT 1, val INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO seq (id, val) VALUES (1, 0) ON CONFLICT DO NOTHING;

    CREATE TABLE IF NOT EXISTS residential_specs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'Spec', status TEXT NOT NULL DEFAULT 'draft',
      lifecycle_state TEXT NOT NULL DEFAULT 'DRAFT',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS finish_groups (
      id TEXT PRIMARY KEY,
      spec_id TEXT NOT NULL REFERENCES residential_specs(id) ON DELETE CASCADE,
      label TEXT NOT NULL, finish_type TEXT NOT NULL DEFAULT 'paint',
      color_id TEXT, color_name TEXT, door_style_id TEXT, pull_id TEXT,
      box_material TEXT NOT NULL DEFAULT 'melamine', notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      carcass_id TEXT, drawer_box_id TEXT, edgeband_id TEXT,
      stain_id TEXT, paint_id TEXT, glaze_id TEXT, topcoat_id TEXT, sheen_id TEXT
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      spec_id TEXT NOT NULL REFERENCES residential_specs(id) ON DELETE CASCADE,
      name TEXT NOT NULL, finish_group_id TEXT, notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS room_finishes (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      finish_group_id TEXT NOT NULL REFERENCES finish_groups(id) ON DELETE CASCADE,
      zone TEXT, sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS finish_moldings (
      id TEXT PRIMARY KEY,
      finish_group_id TEXT NOT NULL REFERENCES finish_groups(id) ON DELETE CASCADE,
      molding_type TEXT NOT NULL, molding_profile_id TEXT,
      qty_lf REAL, notes TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
      size_in REAL, material_id TEXT, material_other TEXT
    );

    CREATE TABLE IF NOT EXISTS finish_molding_rooms (
      molding_id TEXT NOT NULL REFERENCES finish_moldings(id) ON DELETE CASCADE,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      PRIMARY KEY (molding_id, room_id)
    );

    CREATE TABLE IF NOT EXISTS room_accessories (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      acc_id TEXT NOT NULL, qty INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS finish_group_materials (
      id TEXT PRIMARY KEY,
      finish_group_id TEXT NOT NULL REFERENCES finish_groups(id) ON DELETE CASCADE,
      role TEXT NOT NULL, material_id TEXT, where_used TEXT, notes TEXT,
      UNIQUE(finish_group_id, role)
    );

    CREATE TABLE IF NOT EXISTS finish_group_door_fronts (
      id TEXT PRIMARY KEY,
      finish_group_id TEXT NOT NULL REFERENCES finish_groups(id) ON DELETE CASCADE,
      role TEXT NOT NULL, slot_label TEXT, style_id TEXT, material_id TEXT,
      oe_id TEXT, ie_id TEXT, panel_id TEXT, grain TEXT, vendor TEXT, notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS finish_group_drawers (
      id TEXT PRIMARY KEY,
      finish_group_id TEXT NOT NULL REFERENCES finish_groups(id) ON DELETE CASCADE,
      role TEXT NOT NULL, slot_label TEXT, drawer_box_id TEXT, slides_id TEXT,
      notes TEXT, sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS finish_group_edgebands (
      id TEXT PRIMARY KEY,
      finish_group_id TEXT NOT NULL REFERENCES finish_groups(id) ON DELETE CASCADE,
      code TEXT NOT NULL, edgeband_id TEXT, where_used TEXT, notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(finish_group_id, code)
    );

    CREATE TABLE IF NOT EXISTS finish_group_hardware (
      id TEXT PRIMARY KEY,
      finish_group_id TEXT NOT NULL REFERENCES finish_groups(id) ON DELETE CASCADE,
      role TEXT NOT NULL, slot_label TEXT, hardware_id TEXT,
      qty INTEGER, location TEXT, vendor TEXT, notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS finish_group_countertops (
      id TEXT PRIMARY KEY,
      finish_group_id TEXT NOT NULL REFERENCES finish_groups(id) ON DELETE CASCADE,
      location TEXT, style_id TEXT, edge_id TEXT, splash_style TEXT,
      splash_edge_id TEXT, material_id TEXT, buildup_in REAL,
      core_substrate TEXT, brackets TEXT, notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cabinet_line_items (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      spec_id TEXT NOT NULL, family_code TEXT NOT NULL,
      width_in REAL, height_in REAL, depth_in REAL,
      qty INTEGER NOT NULL DEFAULT 1, hinge_side TEXT,
      rollout_trays_qty INTEGER NOT NULL DEFAULT 0,
      trash_kit TEXT NOT NULL DEFAULT 'None',
      applied_panels INTEGER NOT NULL DEFAULT 0,
      special_instructions TEXT, sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS builder_accounts (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, name TEXT NOT NULL,
      company TEXT, email TEXT, phone TEXT,
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user'
    );

    CREATE TABLE IF NOT EXISTS builder_sessions (
      token TEXT PRIMARY KEY,
      builder_id TEXT NOT NULL REFERENCES builder_accounts(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY, created_at TEXT NOT NULL, expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS door_specs (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'Door Spec', status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS door_line_items (
      id TEXT PRIMARY KEY, spec_id TEXT NOT NULL REFERENCES door_specs(id) ON DELETE CASCADE,
      door_type TEXT NOT NULL DEFAULT 'interior_prehung',
      size_nom TEXT NOT NULL DEFAULT '2/6x6/8',
      core TEXT NOT NULL DEFAULT 'hollow', species TEXT NOT NULL DEFAULT 'paint_grade',
      swing TEXT NOT NULL DEFAULT 'none', hardware TEXT NOT NULL DEFAULT 'none',
      bore INTEGER NOT NULL DEFAULT 1, hinge_prep INTEGER NOT NULL DEFAULT 1,
      qty INTEGER NOT NULL DEFAULT 1, unit_price REAL NOT NULL DEFAULT 0,
      price_override INTEGER NOT NULL DEFAULT 0, notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS spec_archives (
      id TEXT PRIMARY KEY, spec_id TEXT NOT NULL,
      snapshot TEXT NOT NULL, label TEXT, created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spec_lifecycle_transitions (
      id TEXT PRIMARY KEY,
      spec_id TEXT NOT NULL REFERENCES residential_specs(id) ON DELETE CASCADE,
      from_state TEXT NOT NULL, to_state TEXT NOT NULL,
      transitioned_at TEXT NOT NULL, transitioned_by TEXT NOT NULL,
      reason TEXT, notes TEXT
    );

    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY,
      spec_id TEXT NOT NULL REFERENCES residential_specs(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      docusign_envelope_id TEXT,
      quote_pdf_path TEXT, drawings_pdf_path TEXT,
      disclosure_pdf_path TEXT, combined_pdf_path TEXT,
      recipient_name TEXT, recipient_email TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT, viewed_at TEXT, signed_at TEXT,
      completed_at TEXT, voided_at TEXT,
      decline_reason TEXT, last_event_at TEXT, last_event_payload TEXT, created_by TEXT
    );

    CREATE TABLE IF NOT EXISTS webhook_errors (
      id TEXT PRIMARY KEY, source TEXT NOT NULL,
      event TEXT, payload TEXT, error TEXT NOT NULL, created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS builder_portal_accounts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, display_name TEXT NOT NULL,
      builder_company TEXT NOT NULL, contact_email TEXT,
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
      last_login_at TEXT, must_change_pw INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS builder_portal_sessions (
      token TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES builder_portal_accounts(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      last_seen_at TEXT, ip TEXT
    );

    CREATE TABLE IF NOT EXISTS builder_required_inputs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, label TEXT NOT NULL, description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      received_at TEXT, received_via TEXT, received_by TEXT, notes TEXT
    );

    CREATE TABLE IF NOT EXISTS builder_change_requests (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      spec_id TEXT, submitted_at TEXT NOT NULL, submitted_by TEXT NOT NULL,
      body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
      resolved_at TEXT, resolved_by TEXT, resolution_notes TEXT
    );

    CREATE TABLE IF NOT EXISTS drawing_comments (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      drawing_filename TEXT NOT NULL, page_number INTEGER, cabinet_ref TEXT,
      body TEXT NOT NULL, submitted_at TEXT NOT NULL, submitted_by TEXT NOT NULL,
      submitted_role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
      resolved_at TEXT, resolved_by TEXT, resolution_notes TEXT
    );

    CREATE TABLE IF NOT EXISTS crews (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
      contact_phone TEXT, contact_email TEXT,
      active INTEGER NOT NULL DEFAULT 1, notes TEXT,
      created_at TEXT NOT NULL, created_by TEXT
    );

    CREATE TABLE IF NOT EXISTS job_events (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL, description TEXT,
      date_start TEXT, date_end TEXT,
      crew_id TEXT REFERENCES crews(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      note TEXT, blocked_on TEXT,
      parent_event_id TEXT REFERENCES job_events(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, created_by TEXT,
      updated_at TEXT NOT NULL, updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS job_event_audit (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, job_id TEXT,
      action TEXT NOT NULL, before_json TEXT, after_json TEXT,
      changed_at TEXT NOT NULL, changed_by TEXT
    );

    CREATE TABLE IF NOT EXISTS schedule_weeks (
      id TEXT PRIMARY KEY,
      week_start_date TEXT NOT NULL UNIQUE,
      verified_at TEXT, verified_by TEXT, notes TEXT
    );

    -- Schedule V2 additions
    CREATE TABLE IF NOT EXISTS crew_pto (
      id         TEXT PRIMARY KEY,
      crew_id    TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
      date_start TEXT NOT NULL,
      date_end   TEXT NOT NULL,
      note       TEXT,
      created_by TEXT REFERENCES builder_accounts(id),
      created_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );

    CREATE TABLE IF NOT EXISTS event_phase_labels (
      id         SERIAL PRIMARY KEY,
      label      TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active     INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS schedule_change_requests (
      id           TEXT PRIMARY KEY,
      job_event_id TEXT NOT NULL REFERENCES job_events(id) ON DELETE CASCADE,
      requested_by TEXT NOT NULL REFERENCES builder_accounts(id),
      reason       TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending',
      reviewed_by  TEXT REFERENCES builder_accounts(id),
      reviewed_at  TEXT,
      created_at   TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
      job_id TEXT, event_type TEXT NOT NULL,
      from_state TEXT, to_state TEXT,
      actor TEXT NOT NULL, actor_role TEXT,
      payload TEXT, occurred_at TEXT NOT NULL
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_spec_lifecycle_transitions_spec ON spec_lifecycle_transitions(spec_id);
    CREATE INDEX IF NOT EXISTS idx_approval_requests_spec     ON approval_requests(spec_id);
    CREATE INDEX IF NOT EXISTS idx_approval_requests_envelope ON approval_requests(docusign_envelope_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_errors_created     ON webhook_errors(created_at);
    CREATE INDEX IF NOT EXISTS idx_portal_accounts_company    ON builder_portal_accounts(builder_company);
    CREATE INDEX IF NOT EXISTS idx_portal_sessions_account    ON builder_portal_sessions(account_id);
    CREATE INDEX IF NOT EXISTS idx_builder_required_inputs_job ON builder_required_inputs(job_id);
    CREATE INDEX IF NOT EXISTS idx_change_requests_job        ON builder_change_requests(job_id);
    CREATE INDEX IF NOT EXISTS idx_change_requests_status     ON builder_change_requests(status);
    CREATE INDEX IF NOT EXISTS idx_drawing_comments_job       ON drawing_comments(job_id);
    CREATE INDEX IF NOT EXISTS idx_crews_active               ON crews(active);
    CREATE INDEX IF NOT EXISTS idx_job_events_job             ON job_events(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_events_date_start      ON job_events(date_start);
    CREATE INDEX IF NOT EXISTS idx_job_events_crew            ON job_events(crew_id);
    CREATE INDEX IF NOT EXISTS idx_job_events_status          ON job_events(status);
    CREATE INDEX IF NOT EXISTS idx_crew_pto_crew              ON crew_pto(crew_id);
    CREATE INDEX IF NOT EXISTS idx_crew_pto_dates             ON crew_pto(date_start, date_end);
    CREATE INDEX IF NOT EXISTS idx_scr_event                  ON schedule_change_requests(job_event_id);
    CREATE INDEX IF NOT EXISTS idx_scr_status                 ON schedule_change_requests(status);
    CREATE INDEX IF NOT EXISTS idx_job_event_audit_event      ON job_event_audit(event_id);
    CREATE INDEX IF NOT EXISTS idx_job_event_audit_job        ON job_event_audit(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_event_audit_at         ON job_event_audit(changed_at);
    CREATE INDEX IF NOT EXISTS idx_schedule_weeks_start       ON schedule_weeks(week_start_date);
    CREATE INDEX IF NOT EXISTS idx_activity_log_entity        ON activity_log(entity_type, entity_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_activity_log_job           ON activity_log(job_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_activity_log_actor         ON activity_log(actor, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_activity_log_at            ON activity_log(occurred_at);

    CREATE TABLE IF NOT EXISTS job_files (
      id           TEXT PRIMARY KEY,
      job_id       TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      kind         TEXT NOT NULL,
      filename     TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      size         INTEGER NOT NULL DEFAULT 0,
      uploaded_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_job_files_job  ON job_files(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_files_kind ON job_files(job_id, kind);
  `);

  // ── Schedule V2 column additions (idempotent) ──────────────────────────────
  for (const stmt of [
    `ALTER TABLE job_events ADD COLUMN IF NOT EXISTS actual_start TEXT`,
    `ALTER TABLE job_events ADD COLUMN IF NOT EXISTS actual_end   TEXT`,
    `ALTER TABLE builder_accounts ADD COLUMN IF NOT EXISTS can_schedule INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE builder_accounts ADD COLUMN IF NOT EXISTS must_change_pw INTEGER NOT NULL DEFAULT 0`,
  ]) {
    try { await sql.unsafe(stmt); } catch (e) { /* already exists */ }
  }

  // ── Seed event_phase_labels (idempotent) ───────────────────────────────────
  const defaultLabels = [
    { label: "Ladder Bases",   sort_order: 1 },
    { label: "Casework",       sort_order: 2 },
    { label: "Pulls & Panels", sort_order: 3 },
    { label: "Post Tops",      sort_order: 4 },
    { label: "Other",          sort_order: 99 },
  ];
  for (const { label, sort_order } of defaultLabels) {
    await sql`
      INSERT INTO event_phase_labels (label, sort_order, active)
      VALUES (${label}, ${sort_order}, 1)
      ON CONFLICT (label) DO NOTHING
    `;
  }

  console.log("Schema push complete.");
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
