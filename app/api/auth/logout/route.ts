export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, deleteSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  // Always clear the cookie — DB delete is best-effort
  if (token) {
    try { await deleteSession(token); } catch { /* ignore */ }
  }
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.delete(COOKIE_NAME);
  return res;
}
