export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function POST() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS event_crew (
        id             TEXT PRIMARY KEY,
        event_id       TEXT NOT NULL REFERENCES job_events(id) ON DELETE CASCADE,
        crew_member_id TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
        UNIQUE (event_id, crew_member_id)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_event_crew_event  ON event_crew(event_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_event_crew_member ON event_crew(crew_member_id)`;
    // Backfill: migrate existing crew_id assignments into event_crew
    const migrated = await sql`
      INSERT INTO event_crew (id, event_id, crew_member_id)
      SELECT gen_random_uuid()::text, je.id, je.crew_id
      FROM job_events je
      WHERE je.crew_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM event_crew ec WHERE ec.event_id = je.id AND ec.crew_member_id = je.crew_id
        )
      RETURNING id
    `;
    return NextResponse.json({ ok: true, table_created: true, backfilled: migrated.length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
