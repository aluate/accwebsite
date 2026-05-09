import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import sql from "@/lib/db";

export const COOKIE_NAME = "acc_builder_session";
const SESSION_DAYS = 30;

export type Role = "admin" | "user" | "engineer" | "partner" | "installer";
export type BuilderSession = {
  id: string; username: string; name: string;
  company: string | null; email: string | null; role: Role;
};
export const ROLES: readonly Role[] = ["admin", "user", "engineer", "partner", "installer"] as const;

export function hashPassword(pw: string): Promise<string> { return bcrypt.hash(pw, 12); }
export function verifyPassword(pw: string, hash: string): Promise<boolean> { return bcrypt.compare(pw, hash); }

function makeToken(): string {
  const { randomBytes } = require("crypto") as typeof import("crypto");
  return randomBytes(16).toString("hex");
}

export async function createSession(builder_id: string): Promise<string> {
  const token = makeToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);
  await sql`INSERT INTO builder_sessions (token, builder_id, created_at, expires_at) VALUES (${token}, ${builder_id}, ${now.toISOString()}, ${expires.toISOString()})`;
  return token;
}

export async function getSessionFromToken(token: string): Promise<BuilderSession | null> {
  const now = new Date().toISOString();
  const rows = await sql<BuilderSession[]>`
    SELECT ba.id, ba.username, ba.name, ba.company, ba.email, ba.role
    FROM builder_sessions bs
    JOIN builder_accounts ba ON bs.builder_id = ba.id
    WHERE bs.token = ${token} AND bs.expires_at > ${now} AND ba.active = 1
  `;
  return rows[0] ?? null;
}

export async function deleteSession(token: string): Promise<void> {
  await sql`DELETE FROM builder_sessions WHERE token = ${token}`;
}

export async function getBuilder(): Promise<BuilderSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return getSessionFromToken(token);
}

export async function requireBuilder(): Promise<BuilderSession> {
  const builder = await getBuilder();
  if (!builder) redirect("/login");
  return builder;
}

export async function requireRole(role: Role | Role[]): Promise<BuilderSession> {
  const builder = await requireBuilder();
  const wanted = Array.isArray(role) ? role : [role];
  if (builder.role === "admin") return builder;
  if (!wanted.includes(builder.role)) redirect("/jobs");
  return builder;
}
