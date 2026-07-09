export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { archiveSpec, listArchivesForSpec } from "@/lib/archive";

// GET — list archives for a spec
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const archives = await listArchivesForSpec(id);
  return NextResponse.json({ archives });
}

// POST — create archive snapshot  { label? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { label } = await req.json().catch(() => ({ label: undefined }));
  const archivePath = await archiveSpec(id, label);
  return NextResponse.json({ ok: true, path: archivePath });
}
