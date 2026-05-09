import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { verifyPassword, createPortalSession, PORTAL_COOKIE } from "@/lib/portal-auth";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json().catch(() => ({}));
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password required" }, { status: 400 });
  }
  const [account] = await sql<{ id: string; username: string; password_hash: string; active: boolean; must_change_pw: boolean }[]>`
    SELECT id, username, password_hash, active, must_change_pw
    FROM builder_portal_accounts WHERE username = ${String(username).trim().toLowerCase()}
  `;
  if (!account || !account.active) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  const ok = await verifyPassword(String(password), account.password_hash);
  if (!ok) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

  const token = await createPortalSession(account.id, req.headers.get("x-forwarded-for") || undefined);
  const res = NextResponse.json({
    ok: true,
    must_change_pw: account.must_change_pw,
    redirect: account.must_change_pw ? "/portal/change-password" : "/portal/jobs",
  });
  res.cookies.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 3600,
    path: "/",
  });
  return res;
}
