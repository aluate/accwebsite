export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { renderClientSpecPDFBuffer, renderWorkOrderPDFBuffer } from "@/lib/pdf-spec";
import { loadSpecPDFData, SpecDataError } from "@/lib/spec-data";
import { requireBuilderApi, guardApi } from "@/lib/auth";
import { checkSpecCompleteness, describeViolations } from "@/lib/spec-completeness";
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
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: specId } = await params;

  // This route had no auth at all, while holding SUPABASE_SERVICE_ROLE_KEY and a
  // 60s maxDuration -- the most expensive endpoint in the app, open to anyone.
  const session = await requireBuilderApi();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // THE $70k GUARD. Previously the only thing standing between an incomplete spec
  // and a PDF on the shop floor was `canGen` in the browser, which a direct POST
  // ignored entirely. Now the database is the source of truth for completeness.
  const violations = await checkSpecCompleteness(specId);
  if (violations.length > 0) {
    return NextResponse.json(
      {
        error: "Spec is incomplete - cannot generate a shop PDF.",
        detail: describeViolations(violations),
        violations,
      },
      { status: 422 }
    );
  }

  let data;
  try {
    data = await loadSpecPDFData(specId);
  } catch (e) {
    if (e instanceof SpecDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  // One client document, and one work order per finish group.
  //
  // This used to render a single PDF containing both, which is how the client ended
  // up signing shop paperwork. Generating the whole set here means the job folder
  // always holds a matched set from the same moment -- a client copy and the shop
  // sheets that agree with it, rather than a client copy from Tuesday and a work
  // order regenerated on Thursday.
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safe = (t: string) => t.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "fg";

  const docs: { key: string; fgId: string | null; filename: string; buffer: Buffer }[] = [];
  docs.push({
    key: "client",
    fgId: null,
    filename: `spec-client-${ts}.pdf`,
    buffer: await renderClientSpecPDFBuffer(data),
  });
  for (const fg of data.finish_groups) {
    docs.push({
      key: "wo",
      fgId: fg.id,
      filename: `wo-${safe(fg.label)}-${ts}.pdf`,
      buffer: await renderWorkOrderPDFBuffer(data, fg),
    });
  }

  // Store everything. Best-effort per file: a storage failure on one work order must
  // not cost the caller the document they asked for.
  const saved: Record<string, string> = {};
  try {
    const supabase = supabaseAdmin();
    for (const doc of docs) {
      const storagePath = `jobs/${data.job_id}/03_job_specs/${doc.filename}`;
      const { error: upErr } = await supabase.storage
        .from("job-files")
        .upload(storagePath, doc.buffer, { contentType: "application/pdf", upsert: false });
      if (upErr) { console.error("[spec/generate] upload failed:", doc.filename, upErr.message); continue; }

      const fileId = uid();
      await sql`
        INSERT INTO job_files (id, job_id, kind, filename, storage_path, size, uploaded_at)
        VALUES (${fileId}, ${data.job_id}, '03_job_specs', ${doc.filename}, ${storagePath},
                ${doc.buffer.length}, ${new Date().toISOString()})
      `;
      saved[doc.fgId ?? "client"] = fileId;
    }
  } catch (saveErr) {
    console.error("[spec/generate] Failed to save to job folder:", saveErr);
  }

  // Which one to hand back. Defaults to the client document, which is what the
  // Generate button has always shown.
  const want  = req.nextUrl.searchParams.get("doc") ?? "client";
  const wantFg = req.nextUrl.searchParams.get("fg");
  const chosen =
    want === "wo"
      ? (docs.find(dd => dd.fgId === wantFg) ?? docs.find(dd => dd.key === "wo"))
      : docs[0];

  if (!chosen) {
    return NextResponse.json({ error: "No work order to return -- the spec has no finish groups." }, { status: 400 });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${chosen.filename}"`,
    "X-Generated-At": data.generated_at,
    // So the caller can link every file this run produced, not just the one shown.
    "X-Documents": JSON.stringify(docs.map(dd => ({
      key: dd.key, fg_id: dd.fgId, filename: dd.filename, file_id: saved[dd.fgId ?? "client"] ?? null,
    }))),
  };
  const chosenId = saved[chosen.fgId ?? "client"];
  if (chosenId) headers["X-File-Id"] = chosenId;

  return new NextResponse(chosen.buffer as unknown as BodyInit, { status: 200, headers });
}

// GET — not supported (no persistent disk in serverless).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(["admin", "pm"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id: specId } = await params;
  const [spec] = await sql<{ id: string }[]>`SELECT id FROM residential_specs WHERE id = ${specId}`;
  if (!spec) return NextResponse.json({ error: "Spec not found" }, { status: 404 });
  return NextResponse.json(
    { error: "Saved PDF files are not available in this deployment. Use POST to generate a fresh PDF inline." },
    { status: 410 }
  );
}
