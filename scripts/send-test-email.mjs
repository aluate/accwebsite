/**
 * SMTP smoke test.
 *
 *   npm run send-test-email recipient@example.com
 *
 * Confirms that SMTP_HOST + SMTP_USER + SMTP_PASS env vars are set and
 * accepting your credentials. If env isn't set, prints what the email
 * WOULD have looked like ("preview mode") so you can verify rendering
 * before wiring SMTP.
 */
import nodemailer from "nodemailer";

const to = process.argv[2];
if (!to) {
  console.error("Usage: npm run send-test-email <recipient-email>");
  process.exit(1);
}

if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
  console.log("SMTP env not configured. Preview mode:");
  console.log(`  Would send to: ${to}`);
  console.log(`  From: ${process.env.SMTP_FROM ?? "(unset)"}`);
  console.log(`  Subject: ACC test email (preview mode)`);
  console.log(`  Body: This is a test from npm run send-test-email. Configure SMTP_HOST/SMTP_USER/SMTP_PASS to actually send.`);
  process.exit(0);
}

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT ?? "587"),
  secure: process.env.SMTP_PORT === "465",
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

try {
  const info = await transport.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to,
    subject: "ACC test email",
    text: `If you got this, SMTP is wired correctly.\n\nFrom: ${process.env.SMTP_FROM ?? process.env.SMTP_USER}\nHost: ${process.env.SMTP_HOST}\n`,
  });
  console.log("Sent. messageId:", info.messageId);
} catch (e) {
  console.error("Send failed:", e instanceof Error ? e.message : e);
  process.exit(1);
}
