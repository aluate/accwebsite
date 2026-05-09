export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";
import { renderSpecPDF } from "@/lib/pdf-spec";
import { loadSpecPDFData, SpecDataError } from "@/lib/spec-data";

export const runtime = 'nodejs';

// POST /api/specs/[id]/combine
//
// Renders a fresh spec PDF, fetches the latest drawings PDF from Supabase
// Storage (bucket: job-files, path: {jobId}/drawings/), merges via pdf-lib,
// and returns the combined PDF inline.
//
// TODO: Previously read drawings from local disk
// (data/jobs/{jobId}/files/drawings/). Replace the Supabase Storage stub
// below with a real download once storage is wired.
//
// Requires pdf-lib (Karl ran `npm install pdf-lib` 2026-05). If somehow
// missing, returns 503 with an install hint.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireBuilder();
  const { id: specId } = await params;

  let data;
  try {
    data = await loadSpecPDFData(specId);
  } catch (e) {
    if (e instanceof SpecDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  // TODO: Fetch latest drawings PDF from Supabase Storage.
  // Example (once supabaseAdmin is wired):
  //   const { data: fileData, error } = await supabaseAdmin.storage
  //     .from("job-files")
  //     .download(`${data.job_id}/drawings/latest.pdf`);
  //   if (error || !fileData) return NextResponse.json({ error: "No drawings found" }, { status: 400 });
  //   const drawingBuffer = Buffer.from(await fileData.arrayBuffer());
  //
  // For now, return 501 until storage is wired.
  return NextResponse.json(
    { error: "Combine is not yet available in this deployment. Drawing storage (Supabase) must be wired first." },
    { status: 501 },
  );
}

// GET /api/specs/[id]/combine?file=...  — not supported in serverless (no disk).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireBuilder();
  const { id: specId } = await params;
  const [spec] = await sql<{ job_id: string }[]>`SELECT job_id FROM residential_specs WHERE id = ${specId}`;
  if (!spec) return NextResponse.json({ error: "Spec not found" }, { status: 404 });
  return NextResponse.json(
    { error: "Saved combined PDFs are not available in this deployment." },
    { status: 410 },
  );
}
