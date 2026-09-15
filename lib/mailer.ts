/**
 * Email helper. Uses Nodemailer + Gmail SMTP (port 465, SSL).
 *
 * Required env vars (set in .env.local and Vercel dashboard):
 *   GMAIL_USER          — sender address: residentialacc2@gmail.com
 *   GMAIL_APP_PASSWORD  — 16-char Gmail app password (no spaces)
 *   PM_EMAIL            — where orders are emailed: residential@advancedcabinets.net
 *
 * Falls back to console preview when GMAIL_USER is not set (safe for local dev
 * without live credentials).
 */

import { loadTestMode, applyTestRouting } from "@/lib/notification-routing";
import type { NotificationRole } from "@/lib/notification-events";

export type SendResult =
  | {
      ok: true;
      messageId: string | null;
      previewMode?: boolean;
      /*
        WHY THESE ARE HERE.

        Karl, 2026-09-15: "I got no emails. Is the sender busted?"

        It was not. The probe authenticated and came back with a message id, so
        the credentials were fine — and that was the entire extent of what
        anyone could see, because the id was the only field kept off the send.
        A message id is generated locally. It says a message was composed, not
        that a server took it or that a mailbox exists.

        The three fields below are what nodemailer already knew and we threw
        away:

          accepted   addresses the SMTP server agreed to deliver to
          rejected   addresses it refused — a typo or a dead mailbox lands here,
                     and the send still reports ok as long as one was accepted
          response   the server's own last line, e.g. "250 2.0.0 OK ..."

        `to` is the address AFTER test-mode routing, which is the other half of
        the question: a message that went nowhere and a message that went
        somewhere other than where you were looking are indistinguishable
        without it.
      */
      to?: string[];
      accepted?: string[];
      rejected?: string[];
      response?: string;
    }
  | { ok: false; error: string };

function isPreviewMode(): boolean {
  return !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD;
}

async function transport() {
  const nodemailer = (await import("nodemailer")) as typeof import("nodemailer");
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // SSL
    auth: {
      user: process.env.GMAIL_USER!,
      pass: process.env.GMAIL_APP_PASSWORD!,
    },
  });
}

// ── Express order email ─────────────────────────────────────────────────────
export async function sendOrderEmail(opts: {
  jobId: string;
  builderName: string;
  builderCompany: string | null;
  clientName: string;
  /** PDF as a Buffer — attached directly, no local filesystem needed (Vercel-safe). */
  pdfBuffer?: Buffer;
}): Promise<SendResult> {
  const realTo = process.env.PM_EMAIL ?? process.env.GMAIL_USER ?? "residential@advancedcabinets.net";

  /*
    This path used to ignore TEST_EMAIL_OVERRIDE entirely — the one send that
    could still reach a real inbox with everything else redirected. It goes
    through the same test routing as the rest now.
  */
  const mode = await loadTestMode();
  const routed = applyTestRouting(mode, { to: [realTo], cc: [], audience: "residential" });
  const to = (process.env.TEST_EMAIL_OVERRIDE ? [process.env.TEST_EMAIL_OVERRIDE] : routed.to).join(", ");

  if (isPreviewMode()) {
    console.log(
      `[mailer/preview] Express order email — job ${opts.jobId}, ` +
        `${opts.builderName} (${opts.builderCompany ?? "no company"}), ` +
        `client ${opts.clientName}, pdf=${opts.pdfBuffer ? `buffer(${opts.pdfBuffer.length}b)` : "none"}`
    );
    return { ok: true, messageId: null, previewMode: true };
  }

  try {
    const t = await transport();
    const subject = (routed.subjectPrefix ?? "") + `${opts.jobId} — ${opts.clientName} — Express order received`;
    const body =
      `Express order received for ${opts.clientName} ` +
      `(${opts.builderCompany ?? opts.builderName}).\n\nJob ID: ${opts.jobId}\n` +
      (routed.redirected ? routed.bodyNote : "");

    const attachments: Array<{ filename: string; content: Buffer }> = [];
    if (opts.pdfBuffer) {
      attachments.push({ filename: `${opts.jobId}-order.pdf`, content: opts.pdfBuffer });
    }

    const info = await t.sendMail({
      from: `"ACC Orders" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      text: body,
      attachments: attachments.length ? attachments : undefined,
    });
    return {
      ok: true,
      messageId: info.messageId,
      to: to.split(", ").filter(Boolean),
      accepted: (info.accepted ?? []).map(String),
      rejected: (info.rejected ?? []).map(String),
      response: info.response,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Generic email sender ────────────────────────────────────────────────────
export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  cc?: string | string[];
  replyTo?: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
  /**
   * Whose email this is, so test mode can redirect it to the right stand-in
   * inbox. Omit it and test mode still catches the send — it just goes to the
   * fallback address rather than the pseudo-client or pseudo-builder one.
   */
  audience?: NotificationRole;
  /** Per-address roles, when one message goes to people in different roles. */
  roleOf?: (address: string) => NotificationRole | undefined;
  /** For the log line, so a redirected message says which email it was. */
  event?: string;
}): Promise<SendResult> {
  const toList = (Array.isArray(opts.to) ? opts.to : [opts.to]).filter(Boolean);
  const ccList = (Array.isArray(opts.cc) ? opts.cc : opts.cc ? [opts.cc] : []).filter(Boolean);

  /*
    THE CHOKE POINT.

    Test mode is applied here rather than at each call site on purpose: this is
    the one function every email goes through, so nothing escapes because a
    route was not updated. Redirection is by role, so a lifecycle walk lands as
    four distinguishable inboxes instead of one pile — and the message says, in
    its own body, who it would really have gone to.
  */
  const mode = await loadTestMode();
  const routed = applyTestRouting(mode, { to: toList, cc: ccList, audience: opts.audience, roleOf: opts.roleOf });

  // The old env-var override still works and still wins — one address, no
  // roles, for when someone wants everything in one place without touching
  // the settings screen.
  const envOverride = process.env.TEST_EMAIL_OVERRIDE;
  const finalTo = envOverride ? [envOverride] : routed.to;
  const finalCc = envOverride ? [] : routed.cc;
  const prefix = envOverride ? `[TEST → ${toList.join(", ")}] ` : routed.subjectPrefix;
  const text = opts.text + (routed.redirected ? routed.bodyNote : "");

  if (isPreviewMode()) {
    console.log("\n[mailer/preview] Would send email:");
    console.log(`  Event: ${opts.event ?? "(unnamed)"}`);
    console.log(`  To: ${finalTo.join(", ")}${routed.redirected ? `  (test mode; really ${toList.join(", ")})` : ""}`);
    if (finalCc.length) console.log(`  Cc: ${finalCc.join(", ")}`);
    console.log(`  Subject: ${prefix}${opts.subject}`);
    console.log(`  ---\n${text}\n  ---`);
    return { ok: true, messageId: null, previewMode: true };
  }

  if (finalTo.length === 0) {
    return { ok: false, error: "no recipient — nobody is configured for this email" };
  }

  try {
    const t = await transport();
    const info = await t.sendMail({
      from: `"ACC" <${process.env.GMAIL_USER}>`,
      to: finalTo.join(", "),
      cc: finalCc.length ? finalCc.join(", ") : undefined,
      replyTo: opts.replyTo,
      subject: prefix + opts.subject,
      text,
      html: routed.redirected && opts.html
        ? opts.html + `<hr><p style="font:12px sans-serif;color:#666">${routed.bodyNote.replace(/\n/g, "<br>")}</p>`
        : opts.html,
      attachments: opts.attachments,
    });
    return {
      ok: true,
      messageId: info.messageId,
      to: finalTo,
      accepted: (info.accepted ?? []).map(String),
      rejected: (info.rejected ?? []).map(String),
      response: info.response,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
