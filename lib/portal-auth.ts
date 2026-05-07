import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import sql from "@/lib/db";

export const PORTAL_COOKIE = "acc_portal_session";
const SESSION_DAYS = 30;

export type PortalSession = {
  id: string; username: string; display_name: string;
  builder_company: string; contact_email: string | null; must_change_pw: boolean;
};

function makeToken(): string {
  const { randomBytes } = require("crypto") as typeof import("crypto");
  return randomBytes(16).toString("hex");
}

export async function hashPassword(pw: string): Promise<string> { return bcrypt.hash(pw, 12); }
export async function verifyPassword(pw: string, hash: string): Promise<boolean> { return bcrypt.compare(pw, hash); }

export async function createPortalSession(account_id: string, ip?: string): Promise<string> {
  const token = makeToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);
  await sql`INSERT INTO builder_portal_sessions (token, account_id, created_at, expires_at, last_seen_at, ip) VALUES (${token}, ${account_id}, ${now.toISOString()}, ${expires.toISOString()}, ${now.toISOString()}, ${ip ?? null})`;
  await sql`UPDATE builder_portal_accounts SET last_login_at = ${now.toISOString()} WHERE id = ${account_id}`;
  return token;
}

export async function getPortalSessionFromToken(token: string): Promise<PortalSession | null> {
  const now = new Date().toISOString();
  const rows = await sql<(Omit<PortalSession, "must_change_pw"> & { must_change_pw: number })[]>`
    SELECT a.id, a.username, a.display_name, a.builder_company, a.contact_email, a.must_change_pw
    FROM builder_portal_sessions s
    JOIN builder_portal_accounts a ON a.id = s.account_id
    WHERE s.token = ${token} AND s.expires_at > ${now} AND a.active = 1
  `;
  if (!rows[0]) return null;
  try { await sql`UPDATE builder_portal_sessions SET last_seen_at = ${now} WHERE token = ${token}`; } catch {}
  return { ...rows[0], must_change_pw: rows[0].must_change_pw === 1 };
}

export async function deletePortalSession(token: string): Promise<void> {
  await sql`DELETE FROM builder_portal_sessions WHERE token = ${token}`;
}

export async function getPortalUser(): Promise<PortalSession | null> {
  const c = await cookies();
  const t = c.get(PORTAL_COOKIE)?.value;
  if (!t) return null;
  return getPortalSessionFromToken(t);
}

export async function requirePortalUser(): Promise<PortalSession> {
  const u = await getPortalUser();
  if (!u) redirect("/portal/login");
  return u;
}

export async function requirePortalAccessToJob(jobId: string): Promise<{ user: PortalSession; job: { id: string; builder_company: string | null; client_name: string } }> {
  const user = await requirePortalUser();
  const rows = await sql`SELECT id, builder_company, client_name, builder_portal_enabled FROM jobs WHERE id = ${jobId}`;
  const job = rows[0] as { id: string; builder_company: string | null; client_name: string; builder_portal_enabled: number } | undefined;
  if (!job) redirect("/portal/jobs");
  if (!job.builder_portal_enabled) redirect("/portal/jobs");
  const accCo = (user.builder_company ?? "").trim().toLowerCase();
  const jobCo = (job.builder_company ?? "").trim().toLowerCase();
  if (!accCo || accCo !== jobCo) redirect("/portal/jobs");
  return { user, job: { id: job.id, builder_company: job.builder_company, client_name: job.client_name } };
}

export async function listJobsForPortalUser(user: PortalSession) {
  const co = user.builder_company.trim();
  return await sql`
    SELECT id, client_name, site_address, city, status, delivery_date,
           builder_portal_enabled, target_delivery_weeks,
           delivery_clock_started_at, estimated_delivery_at, created_at
    FROM jobs
    WHERE LOWER(TRIM(builder_company)) = LOWER(TRIM(${co}))
      AND builder_portal_enabled = 1
    ORDER BY CASE status WHEN 'complete' THEN 1 ELSE 0 END ASC, created_at DESC
  `;
}
