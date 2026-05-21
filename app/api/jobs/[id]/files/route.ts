import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { getBuilder, requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const BUCKET = "job-files";

// Z drive mirror — 17 folders in sort order
const VALID_KINDS = new Set([
  "00_field_dims",
  "01_plan",
  "02_quote",
  "03_job_specs",
  "04_appliances",
  "05_drawings",
  "05a_redlines",
  "06_as_builts",
  "07_correspondence",
  "08_project_mgmt",
  "09_site_photos",
  "10_billing",
  "11_punch_list",
  "12_cost_quality",
  "13_installation",
  "14_prod_docs",
  "14_wo_pdfs",
  "14_ship_ticket",
  "14_install_drawings",
  "15_contract",
  "16_eng_drawings", // approved drawings for engineering release
]);

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function storagePath(jobId: string, kind: string, filename: string): string {
  const ts = Date.now();
  return `jobs/${jobId}/${kind}/${ts}-${filename}`;
}

function safeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 200);
}

async function jobExists(id: string): Promise<boolean> {
  const [row] = await sql`SELECT id FROM jobs WHERE id = ${id}`;
  return !!row;
}

// POST /api/jobs/[id]/files  multipart/form-data
//   file: File
//   kind: one of the 17 Z-drive folder keys
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getBuilder();
  const { id } = await params;
  if (!(await jobExists(id))) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const kind = String(form.get("kind") ?? "");

  if (!file)                   return NextResponse.json({ error: "Missing file" }, { status: 400 });
  if (!VALID_KINDS.has(kind))  return NextResponse.json({ error: `Invalid kind. Must be one of: ${[...VALID_KINDS].join(", ")}` }, { status: 400 });

  const safeName = safeFilename(file.name);
  const path = storagePath(id, kind, safeName);
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const supabase = supabaseAdmin();
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false });

  if (uploadError) {
    console.error("[files/upload] Storage error:", uploadError);
    return NextResponse.json({ error: "Upload failed: " + uploadError.message }, { status: 500 });
  }

  const fileId = uid();
  const now = new Date().toISOString();
  const uploader = session?.name ?? session?.username ?? "unknown";
  await sql`
    INSERT INTO job_files (id, job_id, kind, filename, storage_path, size, uploaded_at, uploaded_by)
    VALUES (${fileId}, ${id}, ${kind}, ${safeName}, ${path}, ${buffer.length}, ${now}, ${uploader})
  `;

  // Log the upload to the activity feed
  logActivity({
    entityType: "media", entityId: fileId, jobId: id,
    eventType: "file_uploaded", actor: uploader,
    actorRole: session?.role ?? null,
    payload: { kind, filename: safeName, size: buffer.length },
  }).catch(() => {});

  return NextResponse.json({ ok: true, id: fileId, filename: safeName, kind, size: buffer.length, uploaded_by: uploader }, { status: 201 });
}

// GET /api/jobs/[id]/files
//   List mode: { files: { [kind]: FileEntry[] } }  — all 17 folders always present
//   Stream mode (?file_id=Y): returns signed download URL redirect
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await jobExists(id))) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const url = req.nextUrl;
  const fileId = url.searchParams.get("file_id");

  // Single-file signed URL
  if (fileId) {
    const [row] = await sql<{ storage_path: string; filename: string }[]>`
      SELECT storage_path, filename FROM job_files WHERE id = ${fileId} AND job_id = ${id}
    `;
    if (!row) return NextResponse.json({ error: "File not found" }, { status: 404 });

    const supabase = supabaseAdmin();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.storage_path, 300);

    if (error || !data) return NextResponse.json({ error: "Could not generate download URL" }, { status: 500 });
    return NextResponse.redirect(data.signedUrl);
  }

  // List all files grouped by kind — initialise all 17 folders empty
  const out: Record<string, Array<{ id: string; filename: string; size: number; uploaded_at: string; uploaded_by: string | null; url: string }>> = {};
  for (const k of VALID_KINDS) out[k] = [];

  const rows = await sql`
    SELECT id, kind, filename, size, uploaded_at, uploaded_by
    FROM job_files
    WHERE job_id = ${id}
    ORDER BY kind, uploaded_at DESC
  ` as Array<{ id: string; kind: string; filename: string; size: number; uploaded_at: string; uploaded_by: string | null }>;

  for (const row of rows) {
    if (!VALID_KINDS.has(row.kind)) continue;
    out[row.kind].push({
      id: row.id,
      filename: row.filename,
      size: row.size,
      uploaded_at: row.uploaded_at,
      uploaded_by: row.uploaded_by ?? null,
      url: `/api/jobs/${id}/files?file_id=${encodeURIComponent(row.id)}`,
    });
  }

  return NextResponse.json({ files: out });
}

// DELETE /api/jobs/[id]/files?file_id=X  (admin only)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  if (!(await jobExists(id))) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const fileId = req.nextUrl.searchParams.get("file_id");
  if (!fileId) return NextResponse.json({ error: "file_id required" }, { status: 400 });

  const [row] = await sql<{ storage_path: string }[]>`
    SELECT storage_path FROM job_files WHERE id = ${fileId} AND job_id = ${id}
  `;
  if (!row) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const supabase = supabaseAdmin();
  const { error: deleteError } = await supabase.storage.from(BUCKET).remove([row.storage_path]);
  if (deleteError) {
    console.error("[files/delete] Storage error:", deleteError);
  }

  await sql`DELETE FROM job_files WHERE id = ${fileId} AND job_id = ${id}`;
  return NextResponse.json({ ok: true });
}
