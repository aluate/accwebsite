export const dynamic = "force-dynamic";

/**
 * POST   /api/admin/template-documents/[docType]  — upload a file to this slot
 * DELETE /api/admin/template-documents/[docType]  — clear the file from this slot
 * GET    /api/admin/template-documents/[docType]  — get signed download URL
 *
 * Body: multipart/form-data with field "file"
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const BUCKET = "job-files";
const ALLOWED_MIME = /^application\/(pdf|msword|vnd\.openxmlformats.*)|image\/(jpeg|png)$/i;

type Params = { params: Promise<{ docType: string }> };

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── GET — signed download URL ─────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const ok = await requireAdmin();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { docType } = await params;
  const [doc] = await sql`
    SELECT storage_path, filename FROM template_documents WHERE doc_type = ${docType}
  `;
  if (!doc?.storage_path) return NextResponse.json({ error: "No file uploaded" }, { status: 404 });

  const supabase = supabaseAdmin();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, 3600);
  return NextResponse.json({ url: data?.signedUrl ?? null, filename: doc.filename });
}

// ── POST — upload ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Params) {
  const ok = await requireAdmin();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { docType } = await params;

  const [slot] = await sql`SELECT id, storage_path FROM template_documents WHERE doc_type = ${docType}`;
  if (!slot) return NextResponse.json({ error: "Unknown doc type" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const mimeType = file.type || "application/pdf";
  if (!ALLOWED_MIME.test(mimeType)) {
    return NextResponse.json({ error: "Only PDF, Word, or image files allowed" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  // Delete old file if exists
  if (slot.storage_path) {
    await supabase.storage.from(BUCKET).remove([slot.storage_path]);
  }

  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 200);
  const path = `templates/${docType}/${Date.now()}-${safeName}`;

  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, Buffer.from(bytes), { contentType: mimeType, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const now = new Date().toISOString();
  await sql`
    UPDATE template_documents SET
      storage_path = ${path},
      filename     = ${file.name},
      file_size    = ${file.size},
      mime_type    = ${mimeType},
      uploaded_at  = ${now}
    WHERE doc_type = ${docType}
  `;

  return NextResponse.json({ ok: true, path, filename: file.name });
}

// ── DELETE — clear slot ───────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  const ok = await requireAdmin();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { docType } = await params;
  const [slot] = await sql`SELECT storage_path FROM template_documents WHERE doc_type = ${docType}`;
  if (!slot) return NextResponse.json({ error: "Unknown doc type" }, { status: 404 });

  if (slot.storage_path) {
    const supabase = supabaseAdmin();
    await supabase.storage.from(BUCKET).remove([slot.storage_path]);
  }

  await sql`
    UPDATE template_documents
    SET storage_path = NULL, filename = NULL, file_size = NULL, mime_type = NULL, uploaded_at = NULL
    WHERE doc_type = ${docType}
  `;

  return NextResponse.json({ ok: true });
}
