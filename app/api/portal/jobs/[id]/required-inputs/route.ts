export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requirePortalAccessToJob } from "@/lib/portal-auth";
import { listRequiredInputs, markInputReceived, summarize } from "@/lib/portal-required-inputs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requirePortalAccessToJob(id);
  return NextResponse.json({
    inputs: await listRequiredInputs(id),
    summary: await summarize(id),
    actor: user.username,
  });
}

// POST { inputId, notes? } — builder marks an item as received (self-attest).
// PMs use a separate admin route to mark on builder's behalf.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requirePortalAccessToJob(id);
  const body = await req.json().catch(() => ({}));
  const inputId = String(body.inputId ?? "");
  const notes   = body.notes ? String(body.notes) : undefined;
  if (!inputId) return NextResponse.json({ error: "inputId required" }, { status: 400 });
  const ok = await markInputReceived({ id: inputId, jobId: id, by: user.username, via: "portal_self_attest", notes });
  if (!ok) return NextResponse.json({ error: "Already received or not found" }, { status: 400 });
  return NextResponse.json({ ok: true, summary: await summarize(id) });
}