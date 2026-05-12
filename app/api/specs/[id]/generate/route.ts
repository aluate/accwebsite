export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { renderSpecPDF } from "@/lib/pdf-spec";
import { loadSpecPDFData, SpecDataError } from "@/lib/spec-data";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST /api/specs/[id]/generate
//
// 1. Renders the spec PDF.
// 2. Uploads it to Supabase Storage under jobs/{job_id}/03_job_specs/.
// 3. Inserts a job_files row so it appears in the job file panel.
// 4. Streams the PDF back inline — browser opens it in a new tab.
//    X-File-Id header carries the saved file ID for the client to link.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: specId } = await params;

  let data;
  try {
    data = await loadSpecPDFData(specId);
  } catch (e) {
    if (e instanceof SpecDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const buffer = await renderSpecPDF(data);
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `spec-${ts}.pdf`;
  const storagePath = `jobs/${data.job_id}/03_job_specs/${filename}`;

  // Save to Supabase Storage + job_files table (best-effort — don't block PDF stream on failure)
  let savedFileId: string | null = null;
  try {
    const supabase = supabaseAdmin();
    const { error: upErr } = await supabase.storage
      .from("job-files")
      .upload(storagePath, buffer, { contentType: "application/pdf", upsert: false });

    if (!upErr) {
      savedFileId = uid();
      await sql`
        INSERT INTO job_files (id, job_id, kind, filename, storage_path, size, uploaded_at)
        VALUES (${savedFileId}, ${data.job_id}, '03_job_specs', ${filename}, ${storagePath}, ${buffer.length}, ${new Date().toISOString()})
      `;
    } else {
      console.error("[spec/generate] Storage upload error:", upErr.message);
    }
  } catch (saveErr) {
    console.error("[spec/generate] Failed to save to job folder:", saveErr);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${filename}"`,
    "X-Generated-At": data.generated_at,
  };
  if (savedFileId) headers["X-File-Id"] = savedFileId;

  return new NextResponse(buffer as unknown as BodyInit, { status: 200, headers });
}

// GET — not supported (no persistent disk in serverless).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: specId } = await params;
  const [spec] = await sql<{ id: string }[]>`SELECT id FROM residential_specs WHERE id = ${specId}`;
  if (!spec) return NextResponse.json({ error: "Spec not found" }, { status: 404 });
  return NextResponse.json(
    { error: "Saved PDF files are not available in this deployment. Use POST to generate a fresh PDF inline." },
    { status: 410 }
  );
}
