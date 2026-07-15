/**
 * POST /api/punch-items/[itemId]/photo
 *
 * Uploads one or more photos/videos for a punch list item.
 * Writes to punch_item_photos table. Supports multiple files per request.
 *
 * Body: multipart/form-data
 *   file  : File | File[]  — image or video
 *   label : string (optional) — 'before' | 'after' | omit for general
 *
 * Storage path: jobs/{jobId}/punch/{itemId}/{timestamp}-{filename}
 * Returns: { ok, photos: [{ id, url }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { getPunchActor } from "@/lib/punch-auth";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const BUCKET = "job-files";
const ALLOWED_MIME = /^(image\/(jpeg|png|gif|webp|heic|heif)|video\/(mp4|quicktime|mov|avi|webm))$/i;

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function safeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 200);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const actor = await getPunchActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;

  const [item] = await sql<Array<{ id: string; job_id: string; status: string }>>`
    SELECT id, job_id, status FROM punch_list_items WHERE id = ${itemId}
  `;
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const form = await req.formData();
  const label = String(form.get("label") ?? "").trim() || null;

  // Collect all files — supports single "file" key or multiple "file" entries
  const files = form.getAll("file") as File[];
  if (files.length === 0) return NextResponse.json({ error: "No files provided" }, { status: 400 });

  const supabase = supabaseAdmin();
  const results: Array<{ id: string; url: string | null }> = [];

  // Find current max sort_order for this item
  const [maxRow] = await sql<Array<{ max_order: number | null }>>`
    SELECT MAX(sort_order) AS max_order FROM punch_item_photos WHERE punch_item_id = ${itemId}
  `;
  let sortOrder = (maxRow?.max_order ?? -1) + 1;

  for (const file of files) {
    const mimeType = file.type || "image/jpeg";
    if (!ALLOWED_MIME.test(mimeType)) {
      continue; // skip unsupported types silently
    }

    const mediaType = mimeType.startsWith("video/") ? "video" : "photo";
    const safeName = safeFilename(file.name);
    const path = `jobs/${item.job_id}/punch/${itemId}/${Date.now()}-${safeName}`;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mimeType, upsert: false });

    if (uploadError) {
      console.error("[punch/photo] Storage error:", uploadError.message);
      continue;
    }

    const photoId = uid();
    await sql`
      INSERT INTO punch_item_photos
        