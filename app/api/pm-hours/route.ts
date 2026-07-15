export const dynamic = "force-dynamic";

/**
 * GET  /api/pm-hours?week=YYYY-MM-DD
 *   Returns:
 *     - entries: existing pm_time_entries for that week + pm
 *     - touched_jobs: jobs the PM touched that week (from activity_log) with client_name
 *
 * PUT  /api/pm-hours
 *   Body: { week_start: "YYYY-MM-DD", entries: [{ job_id: string|null, hours: number, notes?: string }] }
 *   Upserts all entries for that pm + week.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const session = await requireBuilder();
  if (!["karl", "admin", "pm"].includes(session.role)) {
    return NextResponse.json({ error: "PM or admin required" }, { status: 403 });
  }

  const url = new URL(req.url);
  const weekParam = url.searchParams.get("week");
  const weekStart = weekParam ? mondayOf(weekParam) : mondayOf(new Date().toISOString().slice(0, 10));
  const weekEnd = new Date(weekStart + "T12:00:00Z");
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  const pmName = session.name ?? session.username ?? "pm";

  // Jobs this PM touched this week (from activity_log)
  const touched = await sql`
    SELECT DISTINCT al.job_id, j.client_name, j.site_address, j.job_number
    FROM activity_log al
    JOIN jobs j ON j.id = al.job_id
    WHERE al.actor = ${pmName}
      AND al.occurred_at >= ${weekStart}
      AND al.occurred_at <  ${weekEndStr}
      AND al.job_id IS NOT NULL
    ORDER BY j.client_name
  ` as Array<{ job_id: string; client_name: string; site_address: string; job_number: string | null }>;

  // Existing saved entries for this week + pm
  const entries = await sql`
    SELECT id, job_id, hours, notes
    FROM pm_time_entries
    WHERE week_start = ${weekStart}
      AND pm_name = ${pmName}
    ORDER BY updated_at ASC
  ` as Array<{ id: string; job_id: string | null; hours: number; notes: string | null }>;

  return NextResponse.json({ weekStart, pmName, touched, entries });
}

export async function PUT(req: NextRequest) {
  const session = await requireBuilder();
  if (!["karl", "admin", "pm"].includes(session.role)) {
    return NextResponse.json({ error: "PM or admin required" }, { status: 403 });
  }

  const pmName = session.name ?? session.username ?? "pm";
  const body = await req.json() as {
    week_start: string;
    entries: Array<{ job_id: string | null; hours: number; notes?: string }>;
  };

  const weekStart = mondayOf(body.week_start);
  const now = new Date().toISOString();

  for (const entry of body.entries) {
    const jobId = entry.job_id ?? null;
    // Upsert — unique on (week_start, pm_name, coalesce(job_id,''))
    const existing = await sql`
      SELECT id FROM pm_time_entries
      WHERE week_start = ${weekStart}
        AND pm_name = ${pmName}
        AND COALESCE(job_id, '') = ${jobId ?? ''}
    ` as Array<{ id: string }>;

    if (existing.length > 0) {
      await sql`
        UPDATE pm_time_entries SET
          hours = ${entry.hours},
          notes = ${entry.notes ?? null},
          updated_at = ${now}
        WHERE id = ${existing[0].id}
      `;
    } else {
      await sql`
        INSERT INTO pm_time_entries (id, week_start, pm_name, job_id, hours, notes, updated_at)
        VALUES (${uid()}, ${weekStart}, ${pmName}, ${jobId}, ${entry.hours}, ${entry.notes ?? null}, ${now})
      `;
    }
  }

  return NextResponse.json({ ok: true, weekStart });
}
