export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { hashPassword } from "@/lib/portal-auth";
import { sendEmail } from "@/lib/mailer";

export async function GET() {
  await requireRole("admin");
  const rows = await sql`
    SELECT id, username, display_name, builder_company, contact_email, active, created_at, last_login_at, must_change_pw
    FROM builder_portal_accounts ORDER BY builder_company, username
  `;
  return NextResponse.json({ accounts: rows });
}

export async function POST(req: NextRequest) {
  await requireRole("admin");
  const b = await req.json();
  const username = String(b.username ?? "").trim().toLowerCase();
  const displayName = String(b.display_name ?? "").trim();
  const company = String(b.builder_company ?? "").trim();
  const email = b.contact_email ? String(b.contact_email).trim() : null;
  const password = String(b.password ?? "").trim();
  if (!username || !displayName || !company || password.length < 8) {
    return NextResponse.json({ error: "username, display_name, builder_company, and 8+ char password required" }, { status: 400 });
  }
  const [existing] = await sql`SELECT id FROM builder_portal_accounts WHERE username = ${username}`;
  if (existing) return NextResponse.json({ error: "Username taken" }, { status: 409 });
  const hash = await hashPassword(password);
  const id = uid();
  await sql`
    INSERT INTO builder_portal_accounts (id, username, password_hash, display_name, builder_company, contact_email, active, created_at, must_change_pw)
    VALUES (${id}, ${username}, ${hash}, ${displayName}, ${company}, ${email}, 1, ${new Date().toISOString()}, 1)
  `;

  // Welcome email with the temp password (preview-mode safe — falls back to console if SMTP not configured).
  if (email) {
    void sendEmail({
      to: email,
      template: "portal-welcome",
      vars: {
        display_name: displayName,
        builder_company: company,
        username,
        temp_password: password,
        portal_url: process.env.PORTAL_URL ?? "https://accspec.net",
        job_id: "(any)",
      },
    });
  }

  return NextResponse.json({ id, must_change_pw: true, emailed: !!email }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  await requireRole("admin");
  const b = await req.json();
  const id = String(b.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (typeof b.active === "number") {
    await sql`UPDATE builder_portal_accounts SET active = ${b.active} WHERE id = ${id}`;
  }
  if (b.password && String(b.password).length >= 8) {
    const hash = await hashPassword(String(b.password));
    await sql`UPDATE builder_portal_accounts SET password_hash = ${hash}, must_change_pw = 1 WHERE id = ${id}`;
    const [acct] = await sql<{ username: string; display_name: string; contact_email: string | null }[]>`
      SELECT username, display_name, contact_email FROM builder_portal_accounts WHERE id = ${id}
    `;
    if (acct?.contact_email) {
      void sendEmail({
        to: acct.contact_email,
        template: "portal-password-reset",
        vars: {
          display_name: acct.display_name,
          username: acct.username,
          temp_password: String(b.password),
          portal_url: process.env.PORTAL_URL ?? "https://accspec.net",
        },
      });
    }
  }
  if (b.display_name) {
    await sql`UPDATE builder_portal_accounts SET display_name = ${String(b.display_name)} WHERE id = ${id}`;
  }
  if (b.builder_company) {
    await sql`UPDATE builder_portal_accounts SET builder_company = ${String(b.builder_company)} WHERE id = ${id}`;
  }
  return NextResponse.json({ ok: true });
}
