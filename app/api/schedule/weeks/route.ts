import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

function uid() { return Math.random().toString(36).slice(2,10) + Date.now().toString(36); }

function mondayOf(d: Date): string {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  return mon.toISOString().slice(0, 10);
}

// GET /api/schedule/weeks — last 12 Mondays with event counts + verify status
export async function GET() {
  await requireRole(["admin", "pm"]);
  const today = new Date();
  const weeks: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i * 7);
    weeks.push(mondayOf(d));
  }
  // Unique, sorted desc
  const uniq = [...new Set(weeks)].sort((a, b) => b.localeCompare(a));

  // Event counts per week
  const counts = await sql<{ week_start: string; event_count: number }[]>`
    SELECT
      date_trunc(\'week\', date_start::date)::date::text AS week_start,
      COUNT(*) AS event_count
    FROM job_events
    WHERE date_start IS NOT NULL
      AND date_start >= ${uniq[uniq.length - 1]}
      AND date_start < ${uniq[0]}::date + interval \'7 days\'
    GROUP BY 1
  `.catch(() => [] as { week_start: string; event_count: number }[]);
  const countMap = new Map(counts.map((c) => [c.week_start, Number(c.event_count)]));

  // Verified weeks
  const verified = await sql<{ week_start: string; verified_by: string; verified_at: string; notes: string | null }[]>`
    SELECT week_start::text, verified_by, verified_at, notes
    FROM schedule_weeks
    WHERE week_start >= ${uniq[uniq.length - 1]}
  `.catch(() => []);
  const verifiedMap = new Map(verified.map((v) => [v.week_start, v]));

  const result = uniq.map((ws) => ({
    week_start: ws,
    event_count: countMap.get(ws) ?? 0,
    verified: verifiedMap.has(ws) ? verifiedMap.get(ws) : null,
  }));

  return NextResponse.json({ weeks: result });
}

// POST /api/schedule/weeks  { week_start: "YYYY-MM-DD", notes?: string }
export async function POST(req: NextRequest) {
  const session = await requireRole(["admin", "pm"]);
  const body = await req.json() as { week_start: string; notes?: string };
  const { week_start, notes } = body;
  if (!week_start) return NextResponse.json({ error: "week_start required" }, { status: 400 });
  const id = uid();
  await sql`
    INSERT INTO schedule_weeks (id, week_start, verified_by, verified_at, notes)
    VALUES (${id}, ${week_start}::date, ${session.name}, NOW(), ${notes || null})
    ON CONFLICT (week_start) DO UPDATE
      SET verified_by = EXCLUDED.verified_by, verified_at = EXCLUDED.verified_at, notes = EXCLUDED.notes
  `;
  return NextResponse.json({ ok: true });
}

// DELETE /api/schedule/weeks?week_start=YYYY-MM-DD  — un-verify
export async function DELETE(req: NextRequest) {
  await requireRole(["admin"]);
  const ws = new URL(req.url).searchParams.get("week_start");
  if (!ws) return NextResponse.json({ error: "week_start required" }, { status: 400 });
  await sql`DELETE FROM schedule_weeks WHERE week_start = ${ws}::date`;
  return NextResponse.json({ ok: true });
}
