export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/mailer";
import { newLeadAlert } from "@/lib/email-templates";

export async function POST(req: NextRequest) {
  await requireAdmin();

  const body = await req.json() as {
    // Lead info
    clientName: string;
    clientEmail: string;
    clientPhone?: string;
    projectType?: string;
    message?: string;
    source?: string;
    // Email to send
    subject: string;
    emailBody: string; // plain text, sent as-is
    // Options
    action: "send_response" | "log_only" | "alert_pm";
  };

  const { clientName, clientEmail, subject, emailBody, action } = body;

  if (!clientName || !clientEmail) {
    return NextResponse.json({ error: "clientName and clientEmail are required" }, { status: 400 });
  }

  if (action === "log_only") {
    console.log("[leads] Logged lead (no email sent):", body);
    return NextResponse.json({ ok: true, action: "log_only" });
  }

  if (action === "alert_pm") {
    const { subject: alertSubject, text, html } = newLeadAlert({
      clientName,
      clientEmail,
      clientPhone: body.clientPhone,
      projectType: body.projectType,
      message: body.message,
      source: body.source,
    });
    const to = process.env.PM_EMAIL ?? "residential@advancedcabinets.net";
    const result = await sendEmail({ to, subject: alertSubject, text, html });
    return NextResponse.json({ ok: result.ok, action: "alert_pm" });
  }

  // Default: send_response — email the lead
  if (!subject || !emailBody) {
    return NextResponse.json({ error: "subject and emailBody are required for send_response" }, { status: 400 });
  }

  const result = await sendEmail({
    to: clientEmail,
    subject,
    text: emailBody,
    replyTo: process.env.PM_EMAIL,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, action: "send_response" });
}
