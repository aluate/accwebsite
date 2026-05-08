export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requirePortalUser, hashPassword, verifyPassword } from "@/lib/portal-auth";

export async function POST(req: NextRequest) {
  const user = await requirePortalUser();
  const { current, next } = await req.json().catch(() => ({}));
  if (!next || String(next).length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }
  const [row] = await sql<{ password_hash: string }[]>`
    SELECT password_hash FROM builder_portal_accounts WHERE id = ${user.id}
  `;
  if (!row) return NextResponse.json({ error: "Account missing" }, { status: 404 });
  // If the account is in must_change_pw state we still verify current to keep the path uniform.
  const ok = await verifyPassword(String(current ?? ""), row.password_hash);
  if (!ok) return NextResponse.json({ error: "Current password incorrect" }, { status: 401 });

  const hash = await hashPassword(String(next));
  await sql`UPDATE builder_portal_accounts SET password_hash = ${hash}, must_change_pw = false WHERE id = ${user.id}`;
  return NextResponse.json({ ok: true });
}
