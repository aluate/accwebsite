/**
 * /api/jobs/[id]/punch-items
 *
 * GET  — list all punch items for a job, with room names and signed photo URLs
 * POST — create a new punch item
 *
 * Room options: all rooms from all residential specs for this job + GENERAL (room_id null).
 */

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { getBuilder } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const BUCKET = "job-files";

const VALID_TYPES = new Set(["S", "S+M", "HP", "TD"]);

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function signedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = supabaseAdmin();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getBuilder();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify job exists
  const [job] = await sql`SELECT id FROM jobs WHERE id = ${id} OR job_number = ${id}`;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const jobId = job.id;

  // Fetch items with room name
  const items = await sql<Array<{
    id: string; job_id: string; room_id: string | null;
    room_name: string | null; general_location: string | null;
    item_description: string; type_code: string; status: string;
    before_photo_path: string | null; after_photo_path: string | null;
    created_by: string; created_at: string;
    completed_by: string | null; completed_at: string | null;
    sort_order: number;
  }>>`
    SELECT
      p.id, p.job_id, p.room_id, r.name AS room_name, p.general_location,
      p.item_description, p.type_code, p.status,
      p.before_photo_path, p.after_photo_path,
      p.created_by, p.created_at, p.completed_by, p.completed_at, p.sort_order
    FROM punch_list_items p
    LEFT JOIN rooms r ON r.id = p.room_id
    WHERE p.job_id = ${jobId}
    ORDER BY
      CASE WHEN p.room_id IS NULL THEN 1 ELSE 0 END,
      r.sort_order NULLS LAST,
      r.name NULLS LAST,
      p.sort_order,
      p.created_at
  `;

  // Generate signed URLs for photos
  const enriched = await Promise.all(
    items.map(async (item) => ({
      ...item,
      before_photo_url: await signedUrl(item.before_photo_path),
      after_photo_url: await signedUrl(item.after_photo_path),
    }))
  );

  // Also return room list for the Add Item form
  const rooms = await sql<Array<{ id: string; name: string; sort_order: number }>>`
    SELECT DISTINCT ON (r.name) r.id, r.name, r.sort_order
    FROM rooms r
    JOIN residential_specs rs ON rs.id = r.spec_id
    WHERE rs.job_id = ${jobId}
    ORDER BY r.name, r.sort_order
  `;

  return NextResponse.json({ items: enriched, rooms });
}

// ── POST ───────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getBuilder();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Installers cannot create items
  if (session.role === "installer") {
    return NextResponse.json({ error: "Installers cannot create punch items" }, { status: 403 });
  }

  const { id } = await params;
  const [job] = await sql`SELECT id FROM jobs WHERE id = ${id} OR job_number = ${id}`;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const jobId = job.id;

  const body = await req.json() as {
    room_id?: string | null;
    general_location?: string;
    item_description: string;
    type_code: string;
  };

  const { room_id = null, general_location, item_description, type_code } = body;

  if (!item_description?.trim()) {
    return NextResponse.json({ error: "item_description is required" }, { status: 400 });
  }
  if (!VALID_TYPES.has(type_code)) {
    return NextResponse.json({ error: "type_code must be S, S+M, HP, or TD" }, { status: 400 });
  }
  // GENERAL items must have general_location; room items must have a valid room_id
  if (!room_id && !general_location?.trim()) {
    return NextResponse.json({ error: "general_location is required when room is GENERAL" }, { status: 400 });
  }

  // Verify room belongs to this job if provided
  if (room_id) {
    const [roomRow] = await sql`
      SELECT r.id FROM rooms r
      JOIN residential_specs rs ON rs.id = r.spec_id
      WHERE r.id = ${room_id} AND rs.job_id = ${jobId}
    `;
    if (!roomRow) return NextResponse.json({ error: "Room not found on this job" }, { status: 400 });
  }

  const itemId = uid();
  const now = new Date().toISOString();

  await sql`
    INSERT INTO punch_list_items
      (id, job_id, room_id, general_location, item_description, type_code, status, created_by, created_at)
    VALUES
      (${itemId}, ${jobId}, ${room_id}, ${general_location?.trim() ?? null},
       ${item_description.trim()}, ${type_code}, 'open', ${session.name}, ${now})
  `;

  logActivity({ entityType: "punch", entityId: itemId, jobId: jobId,
    eventType: "created", actor: session.name, actorRole: session.role,
    payload: { type_code, item_description: item_description.trim() } }).catch(() => {});

  return NextResponse.json({ ok: true, id: itemId }, { status: 201 });
}
