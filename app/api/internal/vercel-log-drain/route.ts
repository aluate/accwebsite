export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

/**
 * POST /api/internal/vercel-log-drain
 *
 * Vercel log drain receiver. Vercel POSTs newline-delimited JSON here for
 * every log event. We filter for runtime errors (level=error, status>=500),
 * deduplicate by error fingerprint within a 2-hour window, and auto-insert
 * into bug_reports so they show up in /admin/bugs without anyone filing a ticket.
 *
 * Setup:
 *   Vercel dashboard → Project → Settings → Log Drains → Add
 *   URL:    https://www.advancedcabinets.org/api/internal/vercel-log-drain
 *   Secret: value of VERCEL_LOG_DRAIN_SECRET env var
 *   Sources: Lambda, Edge
 *   Level:  Error
 *
 * Env vars required:
 *   VERCEL_LOG_DRAIN_SECRET   — set in Vercel env + match drain config
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac }                from "crypto";
import { sql }                       from "@/lib/db";

const DEDUP_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

interface VercelLogEntry {
  id?:         string;
  message?:    string;
  timestamp?:  number;
  source?:     string; // "lambda" | "edge" | "static" | "external"
  host?:       string;
  path?:       string;
  statusCode?: number;
  level?:      string; // "error" | "warning" | "info" | "debug"
  requestId?:  string;
  proxy?:      { path?: string; statusCode?: number };
}

function fingerprint(entry: VercelLogEntry): string {
  // Stable key: route + first 120 chars of message
  const route = entry.path ?? entry.proxy?.path ?? "unknown";
  const msg   = (entry.message ?? "").slice(0, 120);
  return createHmac("sha256", "acc-dedup")
    .update(`${route}||${msg}`)
    .digest("hex");
}

function severity(entry: VercelLogEntry): "blocker" | "annoying" | "minor" {
  const status = entry.statusCode ?? entry.proxy?.statusCode ?? 0;
  if (status >= 500) return "blocker";
  if (entry.level === "error") return "annoying";
  return "minor";
}

export async function POST(req: NextRequest) {
  // ── Verify Vercel HMAC signature ────────────────────────────────────────
  const secret = process.env.VERCEL_LOG_DRAIN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Drain not configured" }, { status: 500 });
  }

  const rawBody = await req.text();
  const sig     = req.headers.get("x-vercel-signature") ?? "";
  const expected = createHmac("sha1", secret).update(rawBody).digest("hex");

  if (sig !== expected) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── Parse NDJSON payload ─────────────────────────────────────────────────
  const entries: VercelLogEntry[] = rawBody
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try { return [JSON.parse(line) as VercelLogEntry]; }
      catch { return []; }
    });

  // Filter to errors only (level=error OR statusCode >= 500)
  const errors = entries.filter(
    (e) => e.level === "error" || (e.statusCode ?? 0) >= 500
  );

  if (!errors.length) return NextResponse.json({ ok: true, inserted: 0 });

  // ── Deduplicate + insert ─────────────────────────────────────────────────
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
  let inserted = 0;

  for (const entry of errors) {
    const fp   = fingerprint(entry);
    const route = entry.path ?? entry.proxy?.path ?? "unknown";
    const msg   = (entry.message ?? "(no message)").slice(0, 2000);
    const sev   = severity(entry);

    // Skip if same fingerprint seen in last 2 hours
    const [recent] = await sql<{ id: string }[]>`
      SELECT id FROM bug_reports
      WHERE dedup_hash = ${fp} AND created_at > ${cutoff}
      LIMIT 1
    `.catch(() => []);
    if (recent) continue;

    // Compute next serial_no
    const [{ max_serial }] = await sql<{ max_serial: number | null }[]>`
      SELECT MAX(serial_no) AS max_serial FROM bug_reports
    `.catch(() => [{ max_serial: null }]);
    const nextSerial = (max_serial ?? 0) + 1;

    await sql`
      INSERT INTO bug_reports
        (page_url, user_name, user_role, what_trying, what_happened,
         severity, status, triage, source, dedup_hash, serial_no)
      VALUES (
        ${route},
        'Vercel Runtime',
        'system',
        ${'Automatic — Vercel runtime log drain'},
        ${`[${sev.toUpperCase()}] ${msg}\n\nSource: ${entry.source ?? "lambda"} | Status: ${entry.statusCode ?? "n/a"} | ReqID: ${entry.requestId ?? "n/a"}`},
        ${sev},
        'open',
        'open',
        'auto',
        ${fp},
        ${nextSerial}
      )
    `.catch(() => {}); // swallow — don't crash the drain if a row exists

    inserted++;
  }

  return NextResponse.json({ ok: true, inserted });
}
