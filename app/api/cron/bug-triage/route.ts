export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

/**
 * GET /api/cron/bug-triage
 *
 * Vercel cron job — runs weekdays at 7am PT (14:00 UTC, Mon-Fri).
 * Queries open bug reports directly from the DB, ranks by severity,
 * and emails Karl a triage summary.
 *
 * Protected by CRON_SECRET env var (set in Vercel; Vercel sends it as
 * Authorization: Bearer <secret> on every cron invocation).
 */

import { NextRequest, NextResponse } from "next/server";
import { sql }                       from "@/lib/db";
import { sendEmail }                 from "@/lib/mailer";

const KARL_EMAIL = "karlv@advancedcabinets.net";

type Bug = {
  id:           string;
  serial_no:    number | null;
  page_url:     string;
  user_name:    string;
  user_role:    string;
  what_trying:  string;
  what_happened: string;
  severity:     string;
  source:       string;
  created_at:   string;
};

const SEV_ORDER: Record<string, number> = { blocker: 0, annoying: 1, minor: 2 };

function fmtSerial(n: number | null) {
  return n != null ? `BUG-${String(n).padStart(3, "0")}` : "BUG-???";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function truncate(s: string, n = 140) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function buildSection(bugs: Bug[], label: string): string {
  if (!bugs.length) return "";
  const lines = [`── ${label} ${"─".repeat(Math.max(0, 50 - label.length - 4))}`];
  for (const b of bugs) {
    const autoTag = b.source === "auto" ? " (auto)" : "";
    lines.push(`[${fmtSerial(b.serial_no)}] ${b.page_url}${autoTag}`);
    if (b.source !== "auto") {
      lines.push(`  Trying: ${truncate(b.what_trying, 80)}`);
    }
    lines.push(`  Error:  ${truncate(b.what_happened, 140)}`);
    lines.push(`  Filed:  ${fmtDate(b.created_at)} by ${b.user_name} (${b.user_role})`);
    lines.push("");
  }
  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  // Verify Vercel cron secret
  const secret = process.env.CRON_SECRET;
  const auth   = req.headers.get("authorization") ?? "";
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Query open bugs
  const bugs = await sql<Bug[]>`
    SELECT id, serial_no, page_url, user_name, user_role,
           what_trying, what_happened, severity,
           COALESCE(source, 'manual') AS source, created_at
    FROM bug_reports
    WHERE status = 'open'
    ORDER BY
      CASE severity WHEN 'blocker' THEN 0 WHEN 'annoying' THEN 1 ELSE 2 END,
      CASE COALESCE(source,'manual') WHEN 'auto' THEN 0 ELSE 1 END,
      created_at ASC
  `;

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  if (!bugs.length) {
    await sendEmail({
      to: KARL_EMAIL,
      subject: `ACC Bugs — All clear · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      text: `ACC BUG TRIAGE — ${today}\n\nAll clear — no open bugs. ✓\n\nView log: https://www.advancedcabinets.org/admin/bugs`,
      html: `<p><strong>ACC Bug Triage — ${today}</strong></p><p>All clear — no open bugs. ✓</p><p><a href="https://www.advancedcabinets.org/admin/bugs">View bug log →</a></p>`,
    });
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const blockers = bugs.filter((b) => b.severity === "blocker");
  const annoying = bugs.filter((b) => b.severity === "annoying");
  const minor    = bugs.filter((b) => b.severity === "minor");

  const header = [
    `ACC BUG TRIAGE — ${today}`,
    `${bugs.length} open  |  ${blockers.length} blockers  |  ${annoying.length} annoying  |  ${minor.length} minor`,
    "",
  ].join("\n");

  const body = [
    header,
    buildSection(blockers, "BLOCKERS"),
    buildSection(annoying, "ANNOYING"),
    buildSection(minor,    "MINOR"),
    "─".repeat(54),
    "View + triage: https://www.advancedcabinets.org/admin/bugs",
  ].filter(Boolean).join("\n");

  // HTML version with color-coded severity
  const htmlRows = bugs.map((b) => {
    const color = b.severity === "blocker" ? "#ef4444" : b.severity === "annoying" ? "#f59e0b" : "#6b7280";
    const autoTag = b.source === "auto" ? ' <span style="font-size:11px;color:#38bdf8">⚡ auto</span>' : "";
    return `<tr>
      <td style="padding:6px 8px;font-family:monospace;font-size:12px;white-space:nowrap">${fmtSerial(b.serial_no)}</td>
      <td style="padding:6px 8px"><span style="color:${color};font-weight:600;font-size:12px;text-transform:uppercase">${b.severity}</span>${autoTag}</td>
      <td style="padding:6px 8px;font-size:13px;color:#374151">${b.page_url}</td>
      <td style="padding:6px 8px;font-size:12px;color:#6b7280;max-width:320px">${truncate(b.what_happened, 100)}</td>
      <td style="padding:6px 8px;font-size:12px;color:#9ca3af;white-space:nowrap">${fmtDate(b.created_at)}</td>
    </tr>`;
  }).join("\n");

  const html = `
<div style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 4px;color:#111">ACC Bug Triage</h2>
  <p style="margin:0 0 20px;color:#6b7280;font-size:14px">${today} · ${bugs.length} open · ${blockers.length} blockers</p>
  <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;overflow:hidden">
    <thead>
      <tr style="background:#f3f4f6">
        <th style="padding:8px;text-align:left;font-size:12px;color:#6b7280">Serial</th>
        <th style="padding:8px;text-align:left;font-size:12px;color:#6b7280">Severity</th>
        <th style="padding:8px;text-align:left;font-size:12px;color:#6b7280">Route</th>
        <th style="padding:8px;text-align:left;font-size:12px;color:#6b7280">Error</th>
        <th style="padding:8px;text-align:left;font-size:12px;color:#6b7280">Filed</th>
      </tr>
    </thead>
    <tbody>${htmlRows}</tbody>
  </table>
  <p style="margin:20px 0 0"><a href="https://www.advancedcabinets.org/admin/bugs" style="color:#f08121;font-weight:600">Open bug log →</a></p>
</div>`;

  const subjectDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  await sendEmail({
    to: KARL_EMAIL,
    subject: `ACC Bugs — ${bugs.length} open (${blockers.length} blockers) · ${subjectDate}`,
    text: body,
    html,
  });

  return NextResponse.json({ ok: true, sent: bugs.length });
}
