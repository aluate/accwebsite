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
import { guardApi } from "@/lib/auth";
import { sql, uid } from "@/lib/db";
import { getPunchActor } from "@/lib/punch-auth";
import { storageClient } from "@/lib/file-store";
export const runtime = "nodejs";

const BUCKET = "job-files";
const ALLOWED_MIME = /^(image\/(jpeg|png|gif|webp|heic|heif)|video\/(mp4|quicktime|mov|avi|webm))$/i;

// Matches the other two punch routes. guardApi bypasses for karl/admin.
const PUNCH_ROLES = ["admin", "pm", "installer", "engineer", "shop"] as const;

function supabaseAdmin() {
  return storageClient();
}

function safeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 200);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const guard = await guardApi([...PUNCH_ROLES]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
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
  // Every skipped file used to `continue` silently, so a phone handing us a
  // HEIC the regex missed, or a storage error, returned 200 { photos: [] } —
  // indistinguishable from success. The caller then marked an item done with
  // no evidence attached, or (before the client fix) showed "upload failed" on
  // an upload that worked. Collect the reasons and say them out loud.
  const rejected: string[] = [];

  // Find current max sort_order for this item
  const [maxRow] = await sql<Array<{ max_order: number | null }>>`
    SELECT MAX(sort_order) AS max_order FROM punch_item_photos WHERE punch_item_id = ${itemId}
  `;
  let sortOrder = (maxRow?.max_order ?? -1) + 1;

  for (const file of files) {
    const mimeType = file.type || "image/jpeg";
    if (!ALLOWED_MIME.test(mimeType)) {
      rejected.push(`${file.name || "file"} (${mimeType} not supported)`);
      continue;
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
      rejected.push(`${file.name || "file"} (storage: ${uploadError.message})`);
      continue;
    }

    const photoId = uid();
    // media_type is "photo" or "video" everywhere else that writes this table
    // (see app/api/jobs/[id]/punch-items/route.ts); it used to be handed the
    // raw MIME type here, so these rows did not match the ones beside them.
    // sort_order was handed `idx`, which is not declared in this scope — every
    // upload threw before it reached the insert.
    await sql`
      INSERT INTO punch_item_photos
        (id, punch_item_id, storage_path, media_type, label, sort_order, uploaded_at)
      VALUES
        (${photoId}, ${itemId}, ${path}, ${mediaType}, ${label ?? null}, ${sortOrder++}, ${new Date().toISOString()})
    `;
    // A signed URL, not a public one: the bucket is private, and with the
    // filesystem driver there is no Supabase host to build a URL against.
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    results.push({ id: photoId, url: signed?.signedUrl ?? null });
  }

  if (results.length === 0) {
    return NextResponse.json(
      { error: rejected.length ? `Nothing uploaded — ${rejected.join("; ")}` : "Nothing uploaded" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, photos: results, rejected });
}
