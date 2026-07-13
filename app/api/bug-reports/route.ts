import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getBuilder } from "@/lib/auth";
import { sendEmail } from "@/lib/mailer";

export const runtime = "nodejs";

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS bug_reports (
      id            TEXT        PRIMARY KEY,
      reporter      TEXT,
      role          TEXT,
      page_url      TEXT,
      what_trying   TEXT        NOT NULL,
      what_happened TEXT        NOT NULL,
      severity      TEXT        NOT NULL DEFAULT 'annoying',
      status        TEXT        NOT NULL DEFAULT 'open',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export async function POST(req: NextRequest) {
  await ensureTable();

  const session = await getBuilder().catch(() => null);
  const body = await req.json() as {
    page_url?: string;
    what_trying?: string;
    what_happened?: string;
    severity?: string;
  };

  const { page_url, what_trying, what_happened, severity } = body;
  if (!what_trying?.trim() || !what_happened?.trim()) {
    return NextResponse.json({ error: "Both fields are required" }, { status: 400 });
  }

  const validSeverity = ["blocker", "annoying", "minor"].includes(severity ?? "")
    ? severity!
    : "annoying";

  const id  = uid();
  const now = new Date().toISOString();
  const reporter = session?.name ?? "Unknown";
  const role     = session?.role ?? "unknown";

  await sql`
    INSERT INTO bug_reports (id, reporter, role, page_url, what_trying, what_happened, severity, status, created_at)
    VALUES (
      ${id},
      ${reporter},
      ${role},
      ${page_url ?? null},
      ${what_trying.trim()},
      ${what_happened.trim()},
      ${validSeverity},
      'open',
      ${now}
    )
  `;

  const sevIcon = validSeverity === "blocker" ? "🚨" : validSeverity === "annoying" ? "⚠️" : "ℹ️";
  const sevLabel = validSeverity.toUpperCase();

  try {
    await sendEmail({
      to: "karlv@advancedcabinets.net",
      subject: `${sevIcon} [${sevLabel}] Bug report from ${reporter} — ${page_url ?? "unknown page"}`,
      text: [
        `Reporter: ${reporter} (${role})`,
        `Page: ${page_url ?? "unknown"}`,
        `Severity: ${sevLabel}`,
        ``,
        `What they were trying to do:`,
        what_trying.trim(),
        ``,
        `What happened instead:`,
        what_happened.trim(),
        ``,
        `Submitted: ${new Date(now).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}`,
        ``,
        `View all open bugs: https://advancedcabinets.org/api/bug-reports (admin only)`,
      ].join("\n"),
    });
  } catch {
    // Don't fail the request if email fails — report is saved to DB
  }

  return NextResponse.json({ ok: true, id });
}

export async function GET(req: NextRequest) {
  const session = await getBuilder().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await ensureTable();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "open";

  const rows = await sql`
    SELECT * FROM bug_reports
    WHERE status = ${status}
    ORDER BY
      CASE severity WHEN 'blocker' THEN 1 WHEN 'annoying' THEN 2 ELSE 3 END,
      created_at ASC
  `;

  return NextResponse.json({ bugs: rows });
}

export async function PATCH(req: NextRequest) {
  const session = await getBuilder().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json() as { id: string; status: string };
  if (!body.id || !body.status) {
    return NextResponse.json({ error: "id and status required" }, { status: 400 });
  }

  await sql`UPDATE bug_reports SET status = ${body.status} WHERE id = ${body.id}`;
  return NextResponse.json({ ok: true });
}
