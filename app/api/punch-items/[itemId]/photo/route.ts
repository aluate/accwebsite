/**
 * POST /api/punch-items/[itemId]/photo
 *
 * Uploads a before or after photo for a punch list item.
 * Stores to Supabase Storage under jobs/{jobId}/punch/{itemId}/{which}-{filename}.
 * Updates punch_list_items.before_photo_path or after_photo_path.
 * Returns: { ok, url } where url is a 1-hour signed URL for immediate display.
 *
 * Body: multipart/form-data
 *   file:  File (image)
 *   which: "before" | "after"
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getBuilder } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const BUCKET = "job-files";

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
  const session = await getBuilder();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;

  const [item] = await sql<Array<{ id: string; job_id: string; status: string }>>`
    SELECT id, job_id, status FROM punch_list_items WHERE id = ${itemId}
  `;
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const which = String(form.get("which") ?? "");

  if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  if (which !== "before" && which !== "after") {
    return NextResponse.json({ error: "which must be 'before' or 'after'" }, { status: 400 });
  }

  // Installers can only upload after photos
  if (session.role === "installer" && which === "before") {
    return NextResponse.json({ error: "Installers can only upload completion photos" }, { status: 403 });
  }

  const safeName = safeFilename(file.name);
  const path = `jobs/${item.job_id}/punch/${itemId}/${which}-${Date.now()}-${safeName}`;
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const supabase = supabaseAdmin();
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type || "image/jpeg", upsert: true });

  if (uploadError) {
    console.error("[punch/photo] Storage error:", uploadError);
    return NextResponse.json({ error: "Upload failed: " + uploadError.message }, { status: 500 });
  }

  // Update item record
  if (which === "before") {
    await sql`UPDATE punch_list_items SET before_photo_path = ${path} WHERE id = ${itemId}`;
  } else {
    await sql`UPDATE punch_list_items SET after_photo_path = ${path} WHERE id = ${itemId}`;
  }

  // Return 1-hour signed URL for immediate display
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return NextResponse.json({ ok: true, url: signed?.signedUrl ?? null });
}
