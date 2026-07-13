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

const sql = postgres(DATABASE_URL, { ssl: DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1") ? false : "require", max: 1, prepare: false });

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
      stain_id TEXT, paint_id TEXT, glaze_id TEXT, topcoat_id TEXT, sheen_id TEXT,
      applied_panels TEXT NOT NULL DEFAULT 'slab'
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
      acc_id TEXT NOT NULL, qty INTEGER NOT NULL DEFAULT 1,
      notes TEXT
    );
    -- Add notes column if upgrading from schema without it
    ALTER TABLE room_accessories ADD COLUMN IF NOT EXISTS notes TEXT;

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

    CREATE TABLE IF NOT EXISTS warranty_items (
      id            TEXT PRIMARY KEY,
      job_id        TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      reported_at   TEXT NOT NULL,
      reported_by   TEXT NOT NULL,
      category      TEXT NOT NULL DEFAULT 'general',
      description   TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'open',
      priority      TEXT NOT NULL DEFAULT 'normal',
      resolved_at   TEXT,
      resolved_by   TEXT,
      resolution    TEXT,
      notes         TEXT
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
    CREATE INDEX IF NOT EXISTS idx_warranty_items_job         ON warranty_items(job_id);
    CREATE INDEX IF NOT EXISTS idx_warranty_items_status      ON warranty_items(status);

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

  // ── Job files uploaded_by column (idempotent) ─────────────────────────────
  for (const stmt of [
    `ALTER TABLE job_files ADD COLUMN IF NOT EXISTS uploaded_by TEXT`,
  ]) {
    try { await sql.unsafe(stmt); } catch (e) { /* already exists */ }
  }

  // ── Job number (TradeSoft) column addition (idempotent) ────────────────────
  for (const stmt of [
    `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_number TEXT`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_job_number ON jobs(job_number) WHERE job_number IS NOT NULL`,
  ]) {
    try { await sql.unsafe(stmt); } catch (e) { /* already exists */ }
  }

  // ── Work orders (idempotent) ───────────────────────────────────────────────
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS work_orders (
      id          TEXT PRIMARY KEY,
      job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      wo_number   TEXT NOT NULL,
      wo_type     TEXT NOT NULL DEFAULT 'wo',
      file_id     TEXT REFERENCES job_files(id) ON DELETE SET NULL,
      label       TEXT,
      created_at  TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_work_orders_job_wo
      ON work_orders(job_id, wo_number);
    CREATE INDEX IF NOT EXISTS idx_work_orders_job
      ON work_orders(job_id);
  `);

  // ── Punch list items (idempotent) ─────────────────────────────────────────
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS punch_list_items (
      id                 TEXT PRIMARY KEY,
      job_id             TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      room_id            TEXT REFERENCES rooms(id) ON DELETE SET NULL,
      general_location   TEXT,
      item_description   TEXT NOT NULL,
      type_code          TEXT NOT NULL DEFAULT 'S',
      status             TEXT NOT NULL DEFAULT 'open',
      before_photo_path  TEXT,
      after_photo_path   TEXT,
      created_by         TEXT NOT NULL DEFAULT 'pm',
      created_at         TEXT NOT NULL,
      completed_by       TEXT,
      completed_at       TEXT,
      sort_order         INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_punch_items_job    ON punch_list_items(job_id);
    CREATE INDEX IF NOT EXISTS idx_punch_items_room   ON punch_list_items(room_id);
    CREATE INDEX IF NOT EXISTS idx_punch_items_status ON punch_list_items(job_id, status);
  `);

  // ── Transition emails table (idempotent) ───────────────────────────────────
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS transition_emails (
      id            TEXT PRIMARY KEY,
      job_id        TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      to_status     TEXT NOT NULL,
      recipient     TEXT NOT NULL,
      subject       TEXT NOT NULL,
      sent_at       TEXT,
      error         TEXT,
      created_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transition_emails_job
      ON transition_emails(job_id);
  `);

  // ── client_signoffs ──────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS client_signoffs (
      id                TEXT PRIMARY KEY,
      job_id            TEXT NOT NULL REFERENCES jobs(id),
      token             TEXT NOT NULL UNIQUE,
      token_expires_at  TEXT NOT NULL,
      status            TEXT NOT NULL,
      pm_note           TEXT,
      created_by        TEXT,
      signer_name       TEXT,
      signature_data    TEXT,
      signed_at         TEXT,
      signer_ip         TEXT,
      created_at        TEXT NOT NULL
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_client_signoffs_job
      ON client_signoffs(job_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_client_signoffs_token
      ON client_signoffs(token)
  `;

  // ── change_orders ─────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS change_orders (
      id              TEXT PRIMARY KEY,
      job_id          TEXT NOT NULL REFERENCES jobs(id),
      co_number       INTEGER NOT NULL,
      title           TEXT NOT NULL,
      description     TEXT,
      co_type         TEXT NOT NULL DEFAULT 'client_add',
      status          TEXT NOT NULL DEFAULT 'draft',
      total_products  REAL NOT NULL DEFAULT 0,
      total_labor     REAL NOT NULL DEFAULT 0,
      total_amount    REAL NOT NULL DEFAULT 0,
      created_by      TEXT,
      created_at      TEXT NOT NULL,
      signed_at       TEXT,
      signoff_id      TEXT,
      voided_at       TEXT,
      voided_reason   TEXT
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_change_orders_job
      ON change_orders(job_id)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS change_order_items (
      id          TEXT PRIMARY KEY,
      co_id       TEXT NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
      item_type   TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity    REAL,
      unit        TEXT,
      unit_price  REAL,
      total       REAL NOT NULL DEFAULT 0,
      sort_order  INTEGER NOT NULL DEFAULT 0
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_co_items_co
      ON change_order_items(co_id)
  `;

  // ── Add change_order_id to client_signoffs if not present ────────────────────
  await sql`
    ALTER TABLE client_signoffs
      ADD COLUMN IF NOT EXISTS change_order_id TEXT
  `;



  // ── gate_checkins ────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS gate_checkins (
      id          TEXT PRIMARY KEY,
      job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      stage       TEXT NOT NULL,
      outcome     TEXT NOT NULL,
      notes       TEXT,
      created_by  TEXT NOT NULL,
      created_at  TEXT NOT NULL
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_gate_checkins_job
      ON gate_checkins(job_id, created_at)
  `;

  // ── engineering_release_checklists ───────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS engineering_release_checklists (
      job_id     TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      checklist  JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // ── engineering_releases (FIFO log) ──────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS engineering_releases (
      id               TEXT PRIMARY KEY,
      job_id           TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      released_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      released_by      TEXT NOT NULL DEFAULT 'PM',
      notes            TEXT,
      drawing_file_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      email_to         TEXT NOT NULL,
      email_cc         TEXT
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_engineering_releases_job
      ON engineering_releases(job_id, released_at DESC)
  `;

  // ── pm_time_entries ───────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS pm_time_entries (
      id          TEXT PRIMARY KEY,
      week_start  TEXT NOT NULL,
      pm_name     TEXT NOT NULL,
      job_id      TEXT,
      hours       REAL NOT NULL DEFAULT 0,
      notes       TEXT,
      updated_at  TEXT NOT NULL
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pm_time_entries_unique
      ON pm_time_entries(week_start, pm_name, COALESCE(job_id, ''))
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_pm_time_entries_week
      ON pm_time_entries(week_start, pm_name)
  `;

    // ── Seed event_phase_labels (idempotent) ─────────────────────────────────────────────
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


  // ── PM Dashboard install fields (idempotent) ─────────────────────────────────
  for (const stmt of [
    `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS install_type TEXT`,
    `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS install_start_date TEXT`,
  ]) {
    try { await sql.unsafe(stmt); } catch (e) { /* already exists */ }
  }

  // ── Phase 1 additions (2026-07-02) ───────────────────────────────────────────
  for (const stmt of [
    `ALTER TABLE finish_groups ADD COLUMN IF NOT EXISTS species TEXT`,
  ]) {
    try { await sql.unsafe(stmt); } catch (e) { /* already exists */ }
  }

  // ── Phase PDF-redesign additions (2026-07-08) ────────────────────────────────
  for (const stmt of [
    `ALTER TABLE finish_groups ADD COLUMN IF NOT EXISTS rollout_box_id TEXT`,
    `ALTER TABLE spec_accessories ADD COLUMN IF NOT EXISTS type TEXT`,
    `ALTER TABLE spec_accessories ADD COLUMN IF NOT EXISTS size TEXT`,
  ]) {
    try { await sql.unsafe(stmt); } catch (e) { /* already exists */ }
  }

  await sql`
    CREATE TABLE IF NOT EXISTS spec_hardware (
      id          TEXT PRIMARY KEY,
      spec_id     TEXT NOT NULL REFERENCES residential_specs(id) ON DELETE CASCADE,
      type        TEXT NOT NULL,
      part_no     TEXT,
      room        TEXT,
      qty         INTEGER NOT NULL DEFAULT 1,
      notes       TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 0
    )
  `.catch(() => {});
  await sql`
    CREATE INDEX IF NOT EXISTS idx_spec_hardware_spec ON spec_hardware(spec_id)
  `.catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS finish_group_pulls (
      id              TEXT PRIMARY KEY,
      finish_group_id TEXT NOT NULL REFERENCES finish_groups(id) ON DELETE CASCADE,
      description     TEXT NOT NULL,
      part_no         TEXT,
      finish_color    TEXT,
      where_used      TEXT,
      qty             INTEGER NOT NULL DEFAULT 0,
      sort_order      INTEGER NOT NULL DEFAULT 0
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_fg_pulls_fg ON finish_group_pulls(finish_group_id)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS room_trim (
      id          TEXT PRIMARY KEY,
      room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      trim_type   TEXT NOT NULL,
      size_desc   TEXT,
      material    TEXT,
      qty_lf      REAL NOT NULL DEFAULT 0,
      notes       TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 0
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_room_trim_room ON room_trim(room_id)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS spec_appliances (
      id              TEXT PRIMARY KEY,
      spec_id         TEXT NOT NULL REFERENCES residential_specs(id) ON DELETE CASCADE,
      appliance_type  TEXT NOT NULL,
      manufacturer    TEXT,
      model_no        TEXT,
      room_id         TEXT REFERENCES rooms(id) ON DELETE SET NULL,
      notes           TEXT,
      cutout_w        NUMERIC,
      cutout_h        NUMERIC,
      cutout_d        NUMERIC,
      sort_order      INTEGER NOT NULL DEFAULT 0
    )
  `;
  await sql`
      CREATE INDEX IF NOT EXISTS idx_spec_appliances_spec ON spec_appliances(spec_id)
  `;

  // Add cutout columns to spec_appliances if upgrading existing DB
  for (const col of ['cutout_w', 'cutout_h', 'cutout_d']) {
    await sql`ALTER TABLE spec_appliances ADD COLUMN IF NOT EXISTS ${sql(col)} NUMERIC`.catch(() => {});
  }

  await sql`
    CREATE TABLE IF NOT EXISTS paint_colors (
      id          SERIAL PRIMARY KEY,
      brand       TEXT NOT NULL,
      name        TEXT NOT NULL,
      code        TEXT NOT NULL,
      hex         TEXT,
      active      BOOLEAN NOT NULL DEFAULT true,
      UNIQUE(brand, code)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_paint_colors_brand ON paint_colors(brand)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_paint_colors_search ON paint_colors USING gin(to_tsvector('english', name || ' ' || code))
  `;

  // ── 2026-07-09 additions ─────────────────────────────────────────────────────
  // finish_groups: drawer_style, cabdoor custom options
  for (const stmt of [
    `ALTER TABLE finish_groups ADD COLUMN IF NOT EXISTS drawer_style_id TEXT`,
    `ALTER TABLE finish_groups ADD COLUMN IF NOT EXISTS cabdoor_edge_id TEXT`,
    `ALTER TABLE finish_groups ADD COLUMN IF NOT EXISTS cabdoor_profile_id TEXT`,
    `ALTER TABLE estimates ADD COLUMN IF NOT EXISTS profile_id TEXT`,
    `ALTER TABLE finish_groups ADD COLUMN IF NOT EXISTS cabdoor_panel_id TEXT`,
  ]) {
    try { await sql.unsafe(stmt); } catch (e) { /* already exists */ }
  }

  // rooms: flooring, ceiling_height, soffit, backsplash (Room C fields)
  for (const stmt of [
    `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS flooring TEXT`,
    `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ceiling_height TEXT`,
    `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS soffit TEXT`,
    `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS backsplash TEXT`,
  ]) {
    try { await sql.unsafe(stmt); } catch (e) { /* already exists */ }
  }

  // ── Estimating module (feature/estimating, 2026-07-12) ────────────────────
  for (const stmt of [
    // estimates
    `CREATE TABLE IF NOT EXISTS estimates (
      id                  TEXT PRIMARY KEY,
      job_id              TEXT REFERENCES jobs(id) ON DELETE SET NULL,
      title               TEXT NOT NULL DEFAULT 'New Estimate',
      status              TEXT NOT NULL DEFAULT 'draft',
      scope               TEXT NOT NULL DEFAULT 'supply_install',
      delivery_cost       NUMERIC NOT NULL DEFAULT 0,
      tax_amount          NUMERIC NOT NULL DEFAULT 0,
      is_budget_estimate  INTEGER NOT NULL DEFAULT 0,
      target_margin_pct   NUMERIC NOT NULL DEFAULT 48,
      finish_group_count  INTEGER NOT NULL DEFAULT 1,
      notes               TEXT,
      profile_id          TEXT,
      created_by          TEXT,
      created_at          TEXT NOT NULL,
      updated_at          TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_estimates_job ON estimates(job_id)`,
    // estimate_rooms
    `CREATE TABLE IF NOT EXISTS estimate_rooms (
      id           TEXT PRIMARY KEY,
      estimate_id  TEXT NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
      name         TEXT NOT NULL DEFAULT 'Room',
      sort_order   INTEGER NOT NULL DEFAULT 0,
      fg_id        TEXT,
      crown        INTEGER NOT NULL DEFAULT 0,
      toekick      INTEGER NOT NULL DEFAULT 0,
      light_valance INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_estimate_rooms_estimate ON estimate_rooms(estimate_id)`,
    // estimate_line_items
    `CREATE TABLE IF NOT EXISTS estimate_line_items (
      id                TEXT PRIMARY KEY,
      room_id           TEXT NOT NULL REFERENCES estimate_rooms(id) ON DELETE CASCADE,
      item_type         TEXT NOT NULL DEFAULT 'cabinet',
      cabinet_type_code TEXT,
      description       TEXT,
      width_in          NUMERIC,
      height_in         NUMERIC,
      depth_in          NUMERIC,
      adj_shelves       INTEGER NOT NULL DEFAULT 1,
      qty               INTEGER NOT NULL DEFAULT 1,
      feature_codes     TEXT,
      end_panel         INTEGER NOT NULL DEFAULT 0,
      unit_qty          NUMERIC,
      unit_label        TEXT,
      manual_unit_cost  NUMERIC,
      sort_order        INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_eli_room ON estimate_line_items(room_id)`,
    // estimate_settings singleton
    `CREATE TABLE IF NOT EXISTS estimate_settings (
      id                  TEXT PRIMARY KEY DEFAULT 'singleton',
      pm_hrs_base         NUMERIC NOT NULL DEFAULT 2,
      pm_hrs_per_fg       NUMERIC NOT NULL DEFAULT 1.5,
      eng_hrs_base        NUMERIC NOT NULL DEFAULT 1,
      eng_hrs_per_fg      NUMERIC NOT NULL DEFAULT 0.75,
      purchasing_hrs_base NUMERIC NOT NULL DEFAULT 2,
      pm_rate             NUMERIC NOT NULL DEFAULT 55,
      eng_rate            NUMERIC NOT NULL DEFAULT 55,
      shop_rate           NUMERIC NOT NULL DEFAULT 25,
      finish_rate         NUMERIC NOT NULL DEFAULT 25,
      install_rate        NUMERIC NOT NULL DEFAULT 45,
      fixed_overhead_pct  NUMERIC NOT NULL DEFAULT 16.5,
      default_margin_pct  NUMERIC NOT NULL DEFAULT 48,
      updated_at          TEXT NOT NULL DEFAULT '2026-01-01T00:00:00Z'
    )`,
    `INSERT INTO estimate_settings (id) VALUES ('singleton') ON CONFLICT DO NOTHING`,
    // estimate_finish_groups — catalog-restricted FG per estimate
    `CREATE TABLE IF NOT EXISTS estimate_finish_groups (
      id                  TEXT PRIMARY KEY,
      estimate_id         TEXT NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
      name                TEXT NOT NULL DEFAULT 'Finish Group',
      sort_order          INTEGER NOT NULL DEFAULT 0,
      finish_catalog_id   TEXT,
      door_catalog_id     TEXT,
      pull_catalog_id     TEXT,
      carcass_catalog_id  TEXT NOT NULL DEFAULT 'ACC-CARC-HARDROCK',
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_efg_estimate ON estimate_finish_groups(estimate_id)`,
    // rooms FK to finish group
    `ALTER TABLE estimate_rooms ADD COLUMN IF NOT EXISTS fg_id TEXT`,
    `ALTER TABLE estimate_rooms ADD COLUMN IF NOT EXISTS crown         INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE estimate_rooms ADD COLUMN IF NOT EXISTS toekick       INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE estimate_rooms ADD COLUMN IF NOT EXISTS light_valance INTEGER NOT NULL DEFAULT 0`,
  ]) {
    try { await sql.unsafe(stmt); } catch (e) { /* column/table already exists */ }
  }

  console.log("Schema push complete.");
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
