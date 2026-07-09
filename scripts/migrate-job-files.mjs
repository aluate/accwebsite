/**
 * scripts/migrate-job-files.mjs
 * One-time migration: creates job_files DB table + job-files Supabase Storage bucket.
 * Run once:  node scripts/migrate-job-files.mjs
 */
import postgres from "postgres";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }
if (!SUPABASE_URL) { console.error("NEXT_PUBLIC_SUPABASE_URL not set"); process.exit(1); }
if (!SERVICE_KEY)  { console.error("SUPABASE_SERVICE_ROLE_KEY not set"); process.exit(1); }

const sql = postgres(DATABASE_URL, { ssl: DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1") ? false : "require", max: 1, prepare: false });

async function main() {
  // ── 1. DB table ───────────────────────────────────────────────────────────
  console.log("Creating job_files table...");
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS job_files (
      id           TEXT PRIMARY KEY,
      job_id       TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      kind         TEXT NOT NULL,
      filename     TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      size         INTEGER NOT NULL DEFAULT 0,
      uploaded_at  TEXT NOT NULL
    )
  `);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_job_files_job  ON job_files(job_id)`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_job_files_kind ON job_files(job_id, kind)`);
  console.log("  ✓ job_files table ready");

  // ── 2. Supabase Storage bucket ────────────────────────────────────────────
  console.log("Creating job-files storage bucket...");
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: "job-files",
      name: "job-files",
      public: false,          // signed URLs only — never public
      file_size_limit: 52428800, // 50 MB per file
      allowed_mime_types: null,  // allow all
    }),
  });

  const body = await res.json();
  if (res.ok) {
    console.log("  ✓ bucket 'job-files' created");
  } else if (body?.error === "Bucket already exists") {
    console.log("  ✓ bucket 'job-files' already exists — skipped");
  } else {
    console.error("  ✗ bucket creation failed:", body);
    process.exit(1);
  }

  // ── 3. Storage RLS policy: service role has full access (default) ─────────
  // Supabase service_role key bypasses RLS by default — no extra policy needed.
  // Anon/authenticated users do NOT need access; uploads go server-side only.

  console.log("\nAll done. Photo uploads should now work.");
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
