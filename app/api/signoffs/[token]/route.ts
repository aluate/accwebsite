export const dynamic = "force-dynamic";

/**
 * GET  /api/signoffs/[token]  — fetch signoff + job data (no auth, token IS the auth)
 * POST /api/signoffs/[token]  — submit signature
 *
 * POST body: { signer_name: string; signature_data: string }
 *   signature_data = base64 PNG data URL from canvas
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendEmail } from "@/lib/mailer";
import { logActivity } from "@/lib/activity-log";
import { createDraftInvoice, invoiceExists } from "@/lib/invoices";

type Params = { params: Promise<{ token: string }> };

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;

  const [signoff] = await sql`
    SELECT cs.*, j.client_name, j.site_address, j.city, j.pm
    FROM client_signoffs cs
    JOIN jobs j ON j.id = cs.job_id
    WHERE cs.token = ${token}
  `;

  if (!signoff) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Don't expose signature_data on GET (could be large)
  const { signature_data: _sig, ...safe } = signoff;
  return NextResponse.json(safe);
}

// ── POST ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const body = await req.json() as { signer_name: string; signature_data: string };
  const { signer_name, signature_data } = body;

  if (!signer_name?.trim()) return NextResponse.json({ error: "signer_name required" }, { status: 400 });
  if (!signature_data)        return NextResponse.json({ error: "signature_data required" }, { status: 400 });

  // Look up the token
  const [signoff] = await sql`
    SELECT cs.*, j.client_name, j.site_address, j.pm,
           co.id AS co_id, co.co_number, co.title AS co_title, co.total_amount AS co_amount
    FROM client_signoffs cs
    JOIN jobs j ON j.id = cs.job_id
    LEFT JOIN change_orders co ON co.id = cs.change_order_id
    WHERE cs.token = ${token}
  ` as Array<{
    id: string; job_id: string; status: string; token_expires_at: string;
    client_name: string; site_address: string; pm: string;
    change_order_id: string | null;
    co_id: string | null; co_number: number | null; co_title: string | null; co_amount: number | null;
  }>;

  if (!signoff) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (signoff.status === "signed") return NextResponse.json({ error: "Already signed" }, { status: 409 });
  if (new Date(signoff.token_expires_at) < new Date()) {
    return NextResponse.json({ error: "Link has expired" }, { status: 410 });
  }

  // Get signer IP from headers
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";

  const signedAt = new Date().toISOString();

  await sql`
    UPDATE client_signoffs SET
      status         = 'signed',
      signer_name    = ${signer_name.trim()},
      signature_data = ${signature_data},
      signed_at      = ${signedAt},
      signer_ip      = ${ip}
    WHERE token = ${token}
  `;

  // Activity log
  await logActivity({
    entityType: "job",
    entityId: signoff.job_id,
    jobId: signoff.job_id,
    eventType: "client_signed",
    actor: signer_name.trim(),
    actorRole: "client",
    payload: { signer_ip: ip, signed_at: signedAt },
  }).catch(() => {});

  // Notify PM
  const pmEmail = process.env.PM_EMAIL ?? "residential@advancedcabinets.net";
  await sendEmail({
    to: pmEmail,
    subject: `✅ Client signed — ${signoff.client_name} (${signoff.job_id ?? signoff.site_address})`,
    text: [
      `The client has signed the spec for this job.`,
      ``,
      `Job: ${s