/**
 * Migration: Engineering Release tables
 *
 * Creates:
 *   engineering_release_checklists — per-job checklist state (JSONB)
 *   engineering_releases           — FIFO release log (who sent what, when)
 *
 * Run once:
 *   node scripts/migrate-engineering-release.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env manually (dotenv not always present in scripts context)
try {
  const envPath = resolve(__dirname, "../.env.local");
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env.local absent — rely on environment already set (e.g. CI)
}

const { default: postgres } = await import("postgres");

const sql = postgres(process.env.DATABASE_URL, {
  ssl: DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1") ? false : "require",
  prepare: false,
  max: 1,
});

console.log("Running engineering release migration...");

await sql`
  CREATE TABLE IF NOT EXISTS engineering_release_checklists (
    job_id     TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
    checklist  JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
console.log("  ✓ engineering_release_checklists");

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
console.log("  ✓ engineering_releases");

await sql`
  CREATE INDEX IF NOT EXISTS engineering_releases_job_id_idx
    ON engineering_releases (job_id, released_at DESC)
`;
console.log("  ✓ index on engineering_releases(job_id, released_at)");

await sql.end();
console.log("\nMigration complete.");
