export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql, uid } from "@/lib/db";

type AccountRow = {
  id: string; username: string; name: string;
  company: string | null; email: string | null; phone: string | null;
  active: boolean; created_at: string; role: string; must_change_pw: number;
};

// GET /api/admin/builders — list all accounts (incl. role)
export async function GET() {
  const rows = await sql<AccountRow[]>`
    SELECT id, username, name, company, email, phone, active, created_at, role, must_change_pw
    FROM builder_accounts ORDER BY created_at DESC
  `;
  return NextResponse.json(rows);
}

// POST /api/admin/builders — create account
//   body: { username, password, name, company?, email?, phone?, role? }
//   New accounts always get must_change_pw = 1 so users set their own password on first login.
export async function POST(req: NextRequest) {
  const { username, password, name, company, email, phone, role } = await req.json();

  if (!username?.trim() || !password || !name?.trim()) {
    return NextResponse.json({ error: "username, password, and name are required" }, { status: 400 });
  }

  const safeRole = role === "admin" ? "admin" : role === "engineer" ? "engineer" : "user";

  const [existing] = await sql`SELECT id FROM builder_accounts WHERE username = ${username.trim().toLowerCase()}`;
  if (existing) {
    return NextResponse.json({ error: "Username already taken" }, { status: 409 });
  }

  const hash = await bcrypt.hash(password, 12);
  const id = uid();
  const now = new Date().toISOString();

  await sql`
    INSERT INTO builder_accounts
      (id, username, password_hash, name, company, email, phone, active, created_at, role, must_change_pw)
    VALUES
      (${id}, ${username.trim().toLowerCase()}, ${hash}, ${name.trim()},
       ${company ?? null}, ${email ?? null}, ${phone ?? null}, 1, ${now}, ${safeRole}, 1)
  `;

  return NextResponse.json({ id, role: safeRole }, { status: 201 });
}

// PATCH /api/admin/builders — update account
//   body: { id, active?, password?, must_change_pw?, name?, company?, email?, phone?, role? }
//   Setting password also sets must_change_pw = 1 (Reset PW flow).
export async function PATCH(req: NextRequest) {
  const { id, active, password, must_change_pw, name, company, email, phone, role } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (typeof active === "number") {
    await sql`UPDATE builder_accounts SET active = ${active} WHERE id = ${id}`;
  }
  if (password) {
    const hash = await bcrypt.hash(password, 12);
    await sql`UPDATE builder_accounts SET password_hash = ${hash}, must_change_pw = 1 WHERE id = ${id}`;
  }
  if (typeof must_change_pw === "number") {
    await sql`UPDATE builder_accounts SET must_change_pw = ${must_change_pw} WHERE id = ${id}`;
  }
  if (role === "admin" || role === "user" || role === "engineer") {
    await sql`UPDATE builder_accounts SET role = ${role} WHERE id = ${id}`;
  }
  if (name !== undefined) {
    await sql`UPDATE builder_accounts SET name = ${name} WHERE id = ${id}`;
  }
  if (company !== undefined) {
    await sql`UPDATE builder_accounts SET company = ${company ?? null} WHERE id = ${id}`;
  }
  if (email !== undefined) {
    await sql`UPDATE builder_accounts SET email = ${email ?? null} WHERE id = ${id}`;
  }
  if (phone !== undefined) {
    await sql`UPDATE builder_accounts SET phone = ${phone ?? null} WHERE id = ${id}`;
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/builders?id=... — remove account
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await sql`DELETE FROM builder_accounts WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
