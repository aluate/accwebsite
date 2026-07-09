/**
 * scripts/migrate-schedule-v2.mjs
 * Idempotent schema additions for Schedule V2.
 * Run once:  node scripts/migrate-schedule-v2.mjs
 */
import postgres from "postgres";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

// Use direct connection (not pooler) for DDL
const directUrl = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!directUrl) { console.error("DATABASE_URL not set"); process.exit(1); }

const sql = postgres(directUrl, { ssl: DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1") ? false : "require", max: 1, prepare: false });

async function main() {
  console.log("Applying Schedule V2 schema migrations...\n");

  // ── 1. actual_start / actual_end on job_events ──────────────────────────
  await sql.unsafe(`ALTER TABLE job_events ADD COLUMN IF NOT EXISTS actual_start TEXT`);
  await sql.unsafe(`ALTER TABLE job_events ADD COLUMN IF NOT EXISTS actual_end TEXT`);
  console.log("✓ job_events.actual_start / actual_end");

  // ── 2. can_schedule flag on builder_accounts ────────────────────────────
  await sql.unsafe(`ALTER TABLE builder_accounts ADD COLUMN IF NOT EXISTS can_schedule INTEGER NOT NULL DEFAULT 0`);
  console.log("✓ builder_accounts.can_schedule");

  // ── 3. crew_pto ──────────────────────────────────────────────────────────
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS crew_pto (
      id         TEXT PRIMARY KEY,
      crew_id    TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
      date_start TEXT NOT NULL,
      date_end   TEXT NOT NULL,
      note       TEXT,
      created_by TEXT REFERENCES builder_accounts(id),
      created_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  `);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_crew_pto_crew  ON crew_pto(crew_id)`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_crew_pto_dates ON crew_pto(date_start, date_end)`);
  console.log("✓ crew_pto");

  // ── 4. event_phase_labels ────────────────────────────────────────────────
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS event_phase_labels (
      id         SERIAL PRIMARY KEY,
      label      TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active     INTEGER NOT NULL DEFAULT 1
    )
  `);
  // Seed default labels (idempotent via ON CONFLICT DO NOTHING)
  await sql.unsafe(`
    INSERT INTO event_phase_labels (label, sort_order) VALUES
      ('Ladder Bases',   1),
      ('Casework',       2),
      ('Pulls & Panels', 3),
      ('Post Tops',      4),
      ('Other',          5)
    ON CONFLICT (label) DO NOTHING
  `);
  console.log("✓ event_phase_labels (seeded 5 labels)");

  // ── 5. schedule_change_requests ──────────────────────────────────────────
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS schedule_change_requests (
      id           TEXT PRIMARY KEY,
      job_event_id TEXT NOT NULL REFERENCES job_events(id) ON DELETE CASCADE,
      requested_by TEXT NOT NULL REFERENCES builder_accounts(id),
      reason       TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending',
      reviewed_by  TEXT REFERENCES builder_accounts(id),
      reviewed_at  TEXT,
      created_at   TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  `);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_scr_event  ON schedule_change_requests(job_event_id)`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_scr_status ON schedule_change_requests(status)`);
  console.log("✓ schedule_change_requests");

  console.log("\nAll Schedule V2 migrations applied ✓");
  await sql.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
