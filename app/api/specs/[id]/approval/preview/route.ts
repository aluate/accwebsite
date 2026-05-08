import { NextRequest, NextResponse } from "next/server";
import { requireBuilder } from "@/lib/auth";
import { buildEnvelopePDF, SpecDataError } from "@/lib/docusign";

export const runtime = 'nodejs';

// POST /api/specs/[id]/approval/preview
//
// Builds the envelope PDF (spec + drawings + disclosure if applicable) and
// returns it inline. Useful right now even without DocuSign provisioning:
// PM can generate the envelope, manually email or hand-deliver to client,
// and use the offline approval path until DocuSign is wired live.
//
// Returns the PDF bytes so the browser opens it inline.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireBuilder();
  const { id } = await params;
  try {
    const result = await buildEnvelopePDF(id);
    return new NextResponse(result.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="approval-envelope-${id}.pdf"`,
        "X-Envelope-Components": JSON.stringify(result.components),
        "X-Drawing-Used": result.drawing_filename || "(none)",
        "X-Disclosure-Attached": result.disclosure_attached ? "yes" : "no",
      },
    });
  } catch (e) {
    if (e instanceof SpecDataError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
