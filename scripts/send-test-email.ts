/**
 * One-shot test email — uses the same nodemailer config as the Express wizard.
 * Run: npx tsx scripts/send-test-email.ts
 */

import nodemailer from "nodemailer";
import * as dotenv from "dotenv";
import path from "path";

// Load .env.local manually (tsx doesn't auto-load it)
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const { GMAIL_USER, GMAIL_APP_PASSWORD, PM_EMAIL } = process.env;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !PM_EMAIL) {
  console.error("\n❌  Missing env vars. Make sure .env.local is set up correctly.\n");
  console.error("  GMAIL_USER:", GMAIL_USER ?? "MISSING");
  console.error("  GMAIL_APP_PASSWORD:", GMAIL_APP_PASSWORD ? "SET" : "MISSING");
  console.error("  PM_EMAIL:", PM_EMAIL ?? "MISSING");
  process.exit(1);
}

async function main() {
  console.log(`\nSending test email...`);
  console.log(`  From : ${GMAIL_USER}`);
  console.log(`  To   : ${PM_EMAIL}\n`);

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  try {
    await transporter.verify();
    console.log("✅  SMTP connection verified");
  } catch (err) {
    console.error("❌  SMTP connection failed:", (err as Error).message);
    process.exit(1);
  }

  const info = await transporter.sendMail({
    from: `"ACC Orders" <${GMAIL_USER}>`,
    to: PM_EMAIL,
    subject: "ACC Express — Test Email",
    html: `
      <div style="font-family:sans-serif;max-width:600px">
        <h2 style="color:#f08122">Test Email — ACC Express Order System</h2>
        <p>This is a test message confirming the Express order email pipeline is working correctly.</p>
        <table style="border-collapse:collapse;width:100%;margin-top:16px">
          <tr><td style="padding:6px 0;color:#888;width:140px">Sent from</td><td style="padding:6px 0">${GMAIL_USER}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Delivered to</td><td style="padding:6px 0">${PM_EMAIL}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Time</td><td style="padding:6px 0">${new Date().toLocaleString()}</td></tr>
        </table>
        <p style="margin-top:24px;color:#555">If you received this, the Express wizard email system is ready to go.</p>
        <p style="margin-top:32px;font-size:11px;color:#aaa">Automated message from the ACC internal system.</p>
      </div>
    `,
  });

  console.log(`✅  Email sent — Message ID: ${info.messageId}`);
  console.log(`\nCheck the inbox at ${PM_EMAIL} — should arrive within 30 seconds.\n`);
}

main().catch((err) => {
  console.error("❌  Unexpected error:", err);
  process.exit(1);
});
