import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/mailer";

// POST /api/admin/email-karl
// Body: { subject: string; text: string; to?: string }
// Simple internal route so Claude can fire emails to Karl without needing
// a full email connector. No auth guard — internal use only, no sensitive data exposed.
export async function POST(req: Request) {
  try {
    const { subject, text, to } = await req.json();
    if (!subject || !text) {
      return NextResponse.json({ error: "subject and text required" }, { status: 400 });
    }
    const result = await sendEmail({
      to: to ?? "karlv@advancedcabinets.net",
      subject,
      text,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
