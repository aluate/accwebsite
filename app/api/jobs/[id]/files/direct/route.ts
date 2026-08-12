export const dynamic = "force-dynamic";

/**
 * Direct-to-storage upload, in two steps, so a file never passes through a Vercel
 * function.
 *
 * WHY. POST /api/jobs/[id]/files takes the file as multipart form data, which means
 * the bytes travel in the request body to a serverless function. Vercel caps that body
 * at 4.5 MB and rejects anything larger AT THE EDGE — the function never runs, so
 * there is no log line, and the browser gets a bare 413. The UI turned that into
 * "Upload failed" with no reason.
 *
 * Measured against production on 2026-08-11: 4 MB uploaded fine, 4.6 MB returned
 * 413 FUNCTION_PAYLOAD_TOO_LARGE. Lisa's site photo was the first thing over the line —
 * her two files that morning were 761 KB and 3.18 MB and both went through. Phone
 * photos are routinely 4–12 MB, and 09_site_photos is a folder people are told to use,
 * so this was going to keep happening.
 *
 * THE FLOW:
 *
 *   POST   -> validate, then hand back a short-lived signed upload URL
 *   browser -> PUTs the bytes straight to Supabase Storage
 *   PUT    -> records the job_files row once the bytes are actually there
 *
 * The server still decides everything that matters: who may upload, which folder,
 * what the file may be called, and where it lands. The signed URL is scoped to that
 * one path and expires. The only thing that changed is that the bytes take a route
 * that has no 4.5 MB ceiling on it.
 *
 * The row is written in the second call rather than the first ON PURPOSE. Writing it
 * up front would leave a job_files row pointing at nothing whenever an upload was
 * abandoned or failed mid-transfer, and a file listing that lies is worse than one
 * that is late.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { getBuilder, guardApi } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { createClient } from "@supabase/supabase-js";
import { BUCKET, VALID_KINDS, safeFilename, storagePath } from "../shared";

export const runtime = "nodejs";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function resolveJobId(id: string): Promise<string | null> {
  const [row] = await sql`SELECT id FROM jobs WHERE id = ${id} OR job_number = ${id}` as Array<{ id: string }>;
  return row?.id ?? null;
}

/** Step 1 — POST { filename, kind } -> { signedUrl, path, filename } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(["admin", "pm", "engineer", "installer"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { id: rawId } = await params;
  const id = await resolveJobId(rawId);
  if (!id) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const body = await req.json().catch(() => null) as { filename?: string; kind?: string } | null;
  const kind = String(body?.kind ?? "");
  const rawName = String(body?.filename ?? "");

  if (!rawName)               return NextResponse.json({ error: "filename required" }, { status: 400 });
  if (!VALID_KINDS.has(kind)) return NextResponse.json({ error: `Invalid kind: ${kind}` }, { status: 400 });

  const filename = safeFilename(rawName);
  const path = storagePath(id, kind, filename);

  const { data, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[files/direct] createSignedUploadUrl failed:", error);
    return NextResponse.json({ error: `Could not start the upload: ${error?.message ?? "unknown"}` }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, path, filename });
}

/** Step 2 — PUT { path, filename, kind, size } -> records the row. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(["admin", "pm", "engineer", "installer"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const session = await getBuilder();
  const { id: rawId } = await params;
  const id = await resolveJobId(rawId);
  if (!id) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const body = await req.json().catch(() => null) as
    { path?: string; filename?: string; kind?: string; size?: number } | null;
  const path = String(body?.path ?? "");
  const kind = String(body?.kind ?? "");
  const filename = safeFilename(String(body?.filename ?? ""));
  const size = Number(body?.size ?? 0);

  if (!path)                  return NextResponse.json({ error: "path required" }, { status: 400 });
  if (!VALID_KINDS.has(kind)) return NextResponse.json({ error: `Invalid kind: ${kind}` }, { status: 400 });

  /*
    The client tells us where it uploaded, so check that the path is one we would have
    issued for THIS job and folder. Without this, a caller could record a row pointing
    at any object in the bucket — including another job's files — and the listing would
    happily hand it out through the signed-download endpoint.
  */
  const expectedPrefix = `jobs/${id}/${kind}/`;
  if (!path.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "path does not belong to this job and folder" }, { status: 400 });
  }

  /*
    And confirm the object is actually there. A row written for bytes that never
    arrived turns into a file that lists but cannot be opened, which is exactly the
    kind of thing that erodes trust in the whole Files panel.
  */
  const supabase = supabaseAdmin();
  const folder = path.slice(0, path.lastIndexOf("/"));
  const objectName = path.slice(path.lastIndexOf("/") + 1);
  const { data: listing, error: listErr } = await supabase.storage.from(BUCKET).list(folder, { search: objectName });
  if (listErr) {
    console.error("[files/direct] list failed:", listErr);
    return NextResponse.json({ error: `Could not confirm the upload: ${listErr.message}` }, { status: 500 });
  }
  const found = (listing ?? []).find((o) => o.name === objectName);
  if (!found) {
    return NextResponse.json({ error: "The upload did not complete — nothing was stored at that path." }, { status: 400 });
  }

  // Trust the stored object's size over anything the client claims.
  const storedSize = Number((found as { metadata?: { size?: number } }).metadata?.size ?? size ?? 0);

  const fileId = uid();
  const now = new Date().toISOString();
  const uploader = session?.name ?? session?.username ?? "unknown";
  await sql`
    INSERT INTO job_files (id, job_id, kind, filename, storage_path, size, uploaded_at, uploaded_by)
    VALUES (${fileId}, ${id}, ${kind}, ${filename}, ${path}, ${storedSize}, ${now}, ${uploader})
  `;

  logActivity({
    entityType: "media", entityId: fileId, jobId: id,
    eventType: "file_uploaded", actor: uploader,
    actorRole: session?.role ?? null,
    payload: { kind, filename, size: storedSize, direct: true },
  }).catch(() => {});

  return NextResponse.json({ ok: true, id: fileId, filename, kind, size: storedSize, uploaded_by: uploader }, { status: 201 });
}
