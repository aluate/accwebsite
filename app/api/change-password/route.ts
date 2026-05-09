import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getBuilder, verifyPassword, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/change-password  { currentPassword, newPassword }
// Requires active session. Verifies current password, sets new hash, clears must_change_pw.
export async function POST(req: NextRequest) {
  const session = await getBuilder();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { currentPassword, newPassword } = await req.json();

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Both current and new password are required" }, { status: 400 });
  }

  if (String(newPassword).length < 6) {
    return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
  }

  // Fetch current hash
  const [account] = await sql<{ password_hash: string }[]>`
    SELECT password_hash FROM builder_accounts WHERE id = ${session.id}
  `;
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const valid = await verifyPassword(String(currentPassword), account.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const newHash = await hashPassword(String(newPassword));
  await sql`
    UPDATE builder_accounts
    SET password_hash = ${newHash}, must_change_pw = 0
    WHERE id = ${session.id}
  `;

  return NextResponse.json({ ok: true });
}
