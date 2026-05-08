import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deletePortalSession, PORTAL_COOKIE } from "@/lib/portal-auth";

export async function POST(req: NextRequest) {
  const c = await cookies();
  const token = c.get(PORTAL_COOKIE)?.value;
  if (token) await deletePortalSession(token);

  // Use the request's host so this works on localhost, staging, and production.
  const origin = req.nextUrl.origin;
  const res = NextResponse.redirect(new URL("/portal/login", origin), { status: 303 });
  res.cookies.set(PORTAL_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
  return res;
}
