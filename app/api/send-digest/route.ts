export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/mailer";

export async function POST(req: NextRequest) {
  try {
    const { to, subject, body } = await req.json();
    if (!to || !subject || !body) {
      return NextResponse.json({ error: "Missing to, subject, or body" }, { status: 400 });
    }

    const result = await sendEmail({ to, subject, text: body });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
