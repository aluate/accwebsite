import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import sql from "@/lib/db";

export const ADMIN_COOKIE = "acc_admin_session";
const SESSION_DAYS = 7;

function makeToken(): string {
  const { randomBytes } = require("crypto") as typeof import("crypto");
  return randomBytes(16).toString("hex");
}

export async function createAdminSession(): Promise<string> {
  const token = makeToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);
  await sql`INSERT INTO admin_sessions (token, created_at, expires_at) VALUES (${token}, ${now.toISOString()}, ${expires.toISOString()})`;
  return token;
}

export async function validateAdminToken(token: string): Promise<boolean> {
  const now = new Date().toISOString();
  const rows = await sql`SELECT token FROM admin_sessions WHERE token = ${token} AND expires_at > ${now}`;
  return rows.length > 0;
}

export async function deleteAdminSession(token: string): Promise<void> {
  await sql`DELETE FROM admin_sessions WHERE token = ${token}`;
}

export async function getAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  return validateAdminToken(token);
}

export async function requireAdmin(): Promise<void> {
  const ok = await getAdmin();
  if (!ok) redirect("/admin/login");
}
