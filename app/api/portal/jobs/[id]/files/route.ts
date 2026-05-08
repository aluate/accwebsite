import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requirePortalAccessToJob } from "@/lib/portal-auth";
import { markInputReceived } from "@/lib/portal-required-inputs";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const BUCKET = "job-files";
// Builders can only upload these kinds — drawings are ACC-managed.
const PORTAL_VALID_KINDS = new Set(["plans", "appliances", "site"]);

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function safeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 200);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePortalAccessToJob(id);

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const kind = String(form.get("kind") ?? "");

  if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  if (!PORTAL_VALID_KINDS.has(kind)) {
    return NextResponse.json(
      { error: `Builders can only upload kinds: ${[...PORTAL_VALID_KINDS].join(", ")}` },
      { status: 400 }
    );
  }

  const safeName = safeFilename(file.name);
  const ts = Date.now();
  const storagePath = `jobs/${id}/${kind}/${ts}-${safeName}`;
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const supabase = supabaseAdmin();
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type || "application/octet-stream", upsert: false });

  if (uploadError) {
    console.error("[portal/files/upload] Storage error:", uploadError);
    return NextResponse.json({ error: "Upload failed: " + uploadError.message }, { status: 500 });
  }

  const fileId = uid();
  const now = new Date().toISOString();
  await sql`
    INSERT INTO job_files (id, job_id, kind, filename, storage_path, size, uploaded_at)
    VALUES (${fileId}, ${id}, ${kind}, ${safeName}, ${storagePath}, ${buffer.length}, ${now})
  `;

  // Auto-mark the matching required input as received (plans → plans, appliances → appliances).
  const kindToInputKind: Record<string, string> = {
    plans: "plans",
    appliances: "appliances",
  };
  if (kindToInputKind[kind]) {
    const [inp] = await sql<{ id: string }[]>`
      SELECT id FROM builder_required_inputs
      WHERE job_id = ${id} AND kind = ${kindToInputKind[kind]} AND status != 'received'
      LIMIT 1
    `;
    if (inp) {
      await markInputReceived({
        id: inp.id,
        jobId: id,
        by: session.username,
        via: "portal_upload",
      });
    }
  }

  return NextResponse.json({ ok: true, id: fileId, filename: safeName, kind, size: buffer.length }, { status: 201 });
}
