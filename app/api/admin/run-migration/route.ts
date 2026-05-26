/**
 * ONE-TIME migration endpoint — seeds karlv test accounts and creates engineering tables.
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

  // ── engineering_release_checklists ───────────────────────────────────────
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS engineering_release_checklists (
        job_id     TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
        checklist  JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    results.push("✓ engineering_release_checklists");
  } catch (e) {
    results.push("✗ engineering_release_checklists: " + String(e));
  }

  // ── engineering_releases ─────────────────────────────────────────────────
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS engineering_releases (
        id               TEXT PRIMARY KEY,
        job_id           TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        released_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        released_by      TEXT NOT NULL DEFAULT 'PM',
        notes            TEXT,
        drawing_file_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        email_to         TEXT NOT NULL,
        email_cc         TEXT
      )
    `;
    results.push("✓ engineering_releases");
  } catch (e) {
    results.push("✗ engineering_releases: " + String(e));
  }

  return NextResponse.json({ ok: true, results });
}
