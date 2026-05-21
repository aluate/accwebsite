/**
 * ONE-TIME migration endpoint — DELETE THIS FILE after running.
 * Creates engineering_release_checklists and engineering_releases tables.
 * Admin session required.
 */
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST() {
  const ok = await getAdmin();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const results: string[] = [];

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS engineering_release_checklists (
        job_id     TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
        checklist  JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    results.push("✓ engineering_release_checklists");
  } catch (e) {
    results.push("✗ engineering_release_checklists: " + String(e));
  }

  try {
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
    results.push("✓ engineering_releases");
  } catch (e) {
    results.push("✗ engineering_releases: " + String(e));
  }

  try {
    await sql`
      CREATE INDEX IF NOT EXISTS engineering_releases_job_id_idx
        ON engineering_releases (job_id, released_at DESC)
    `;
    results.push("✓ index on engineering_releases");
  } catch (e) {
    results.push("✗ index: " + String(e));
  }

  return NextResponse.json({ ok: true, results });
}
