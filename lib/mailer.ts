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

export type SendResult =
  | { ok: true; messageId: string | null; previewMode?: boolean }
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
  const to = process.env.PM_EMAIL ?? process.env.GMAIL_USER ?? "residential@advancedcabinets.net";

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
    const subject = `${opts.jobId} — ${opts.clientName} — Express order received`;
    const body =
      `Express order received for ${opts.clientName} ` +
      `(${opts.builderCompany ?? opts.builderName}).\n\nJob ID: ${opts.jobId}\n`;

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
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Generic email sender ────────────────────────────────────────────────────
export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  cc?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
}): Promise<SendResult> {
  if (isPreviewMode()) {
    console.log("\n[mailer/preview] Would send email:");
    console.log(`  To: ${opts.to}`);
    if (opts.cc) console.log(`  Cc: ${opts.cc}`);
    console.log(`  Subject: ${opts.subject}`);
    console.log(`  ---\n${opts.text}\n  ---`);
    return { ok: true, messageId: null, previewMode: true };
  }

  try {
    const t = await transport();
    const info = await t.sendMail({
      from: `"ACC" <${process.env.GMAIL_USER}>`,
      to: opts.to,
      cc: opts.cc,
      replyTo: opts.replyTo,
      subject: opts.subject,
      text: opts.text,
      attachments: opts.attachments,
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
