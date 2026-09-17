export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/auth";
import { sendEmail } from "@/lib/mailer";
import { newLeadAlert } from "@/lib/email-templates";

export async function POST(req: NextRequest) {
  // Was requireAdmin() from the retired shared-password admin login: it could
  // never pass (nothing has minted that cookie since 2026-05), and it redirects
  // rather than returning JSON, which is the wrong shape for an API route
  // regardless. "Send a response to this lead" has been answering with a
  // redirect to a dead login page ever since.
  const guard = await guardApi(["admin"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

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
    const result = await sendEmail({ to, subject: alertSubject, text, html, audience: "residential", event: "lead_alert" });
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
    audience: "client", event: "lead_response",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, action: "send_response" });
}
