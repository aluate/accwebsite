/**
 * ONE-TIME migration endpoint — DELETE THIS FILE after running.
 * - Seeds karlv test accounts (all roles, password = bcrypt("1234"))
 * - Creates engineering_release_checklists and engineering_releases tables.
 * Admin password required in body: { secret: "..." }
 */
import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { secret?: string };
  if (!process.env.ADMIN_PASSWORD || body.secret !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: string[] = [];

  // ── Seed karlv accounts (all roles, password = "1234") ───────────────────
  try {
    const hash = await bcrypt.hash("1234", 12);
    const now = new Date().toISOString();
    const accounts = [
      { username: "karlv",           role: "admin"     },
      { username: "karlv-pm",        role: "pm"        },
      { username: "karlv-engineer",  role: "engineer"  },
      { username: "karlv-shop",      role: "shop"      },
      { username: "karlv-installer", role: "installer" },
    ];
    for (const { username, role } of accounts) {
      const id = uid();
      await sql`
        INSERT INTO builder_accounts
          (id, username, password_hash, name, active, created_at, role, must_change_pw)
        VALUES
          (${id}, ${username}, ${hash}, 'Karl V', 1, ${now}, ${role}, 0)
        ON CONFLICT (username) DO UPDATE
          SET password_hash = EXCLUDED.password_hash,
              role          = EXCLUDED.role,
              must_change_pw = 0,
              active        = 1
      `;
      results.push(`✓ account: ${username} (${role})`);
    }
  } catch (e) {
    results.push("✗ karlv accounts: " + String(e));
  }

  // ── engineering_release_checklists ──�