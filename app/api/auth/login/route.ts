import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { verifyPassword, createSession, COOKIE_NAME } from "@/lib/auth";

type AccountRow = {
  id: string; username: string; name: string;
  password_hash: string; active: boolean; role: string;
};

// POST /api/auth/login  { username, password }
// Unified login for all internal users (admin + user). Replaces /api/express/login
// which is gated by EXPRESS_ENABLED.
export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  const [account] = await sql`
    SELECT id, username, name, password_hash, active, role
    FROM builder_accounts
    WHERE username = ${username}
  ` as AccountRow[];

  if (!account || !account.active) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const valid = await verifyPassword(password, account.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await createSession(account.id);

  const res = NextResponse.json({ ok: true, role: account.role });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
  return res;
}
