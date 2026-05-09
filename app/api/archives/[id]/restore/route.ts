export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { restoreArchive } from "@/lib/archive";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await restoreArchive(id);
  return NextResponse.json({ ok: true });
}
