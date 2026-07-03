export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";

// POST /api/admin/wipe-jobs
// Requires admin role. Deletes all jobs (cascades to related tables).
export async function POST() {
  await requireRole("admin");

  // Count before delete so we can report back
  const [{ count }] = await sql<[{ count: number }]>`SELECT COUNT(*)::int AS count FROM jobs`;

  // DELETE cascades to child tables (residential_specs, gate_checkins,
  // pm_time_entries, activity_log rows referencing job_id, etc.)
  await sql`DELETE FROM jobs`;

  return NextResponse.json({ deleted: count });
}
