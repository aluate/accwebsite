export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { transitionApproval, type ApprovalState } from "@/lib/approvals";
import { sql, uid } from "@/lib/db";

async function logWebhookError(source: string, event: string | undefined, payload: unknown, error: string) {
  try {
    await sql`
      INSERT INTO webhook_errors (id, source, event, payload, error, created_at)
      VALUES (${uid()}, ${source}, ${event ?? null}, ${JSON.stringify(payload).slice(0, 4096)}, ${error}, ${new Date().toISOString()})
    `;
  } catch (e) {
    console.error(`[${source}] failed to persist webhook error: ${(e as Error).message}`);
  }
}

// DocuSign webhook receiver — scaffolded, not yet live.
//
// To activate, Karl must:
//   1. Provision DocuSign account + integration key (admin: integrator key,
//      RSA keypair, account ID).
//   2. Set in .env.local:
//        DOCUSIGN_INTEGRATION_KEY=...
//        DOCUSIGN_USER_ID=...
//        DOCUSIGN_ACCOUNT_ID=...
//        DOCUSIGN_PRIVATE_KEY_PATH=... (or DOCUSIGN_PRIVATE_KEY inline)
//        DOCUSIGN_BASE_PATH=https://demo.docusign.net/restapi  (use account-d for prod)
//        DOCUSIGN_HMAC_KEY=...  (optional, for webhook signature verification)
//   3. In DocuSign admin, point Connect (webhook) at:
//        https://www.advancedcabinets.org/api/docusign/webhook
//      Subscribe to envelope events: sent, delivered, completed, declined, voided.
//
// Without DOCUSIGN_INTEGRATION_KEY set, this endpoint returns 503. Once set,
// it becomes live and routes events into transitionApproval().

const DOCUSIGN_EVENT_TO_STATE: Record<string, ApprovalState> = {
  "envelope-sent":       "SENT",
  "envelope-delivered":  "VIEWED",
  "envelope-completed":  "COMPLETED",
  "envelope-declined":   "DECLINED",
  "envelope-voided":     "VOIDED",
  "recipient-completed": "SIGNED",
};

export async function POST(req: NextRequest) {
  if (!process.env.DOCUSIGN_INTEGRATION_KEY) {
    return NextResponse.json(
      { error: "DocuSign not provisioned. See route file comments for setup steps." },
      { status: 503 },
    );
  }

  // TODO: HMAC verification with DOCUSIGN_HMAC_KEY when keys land.

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  type ConnectPayload = { event?: string; data?: { envelopeId?: string; envelopeSummary?: { status?: string } } };
  const p = body as ConnectPayload;
  const event = p.event ?? "";
  const envelopeId = p.data?.envelopeId;
  if (!envelopeId) {
    return NextResponse.json({ error: "Missing envelopeId" }, { status: 400 });
  }
  const target = DOCUSIGN_EVENT_TO_STATE[event];
  if (!target) {
    // Unknown event types ack but no-op — DocuSign is chatty.
    return NextResponse.json({ ok: true, ignored: event });
  }

  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM approval_requests WHERE docusign_envelope_id = ${envelopeId}
  `;
  if (!row) return NextResponse.json({ error: "Unknown envelope" }, { status: 404 });

  const result = await transitionApproval(row.id, target, {
    actor: "docusign-webhook",
    docusignEnvelopeId: envelopeId,
    eventPayload: JSON.stringify(body).slice(0, 4096),
  });
  if (!result.ok) {
    // DAC #8: don't 5xx (DocuSign retries hammer the endpoint), but DO persist
    // so silent failures get noticed by selftest.
    console.warn(`[docusign] approval ${row.id} ${target} rejected: ${result.error}`);
    await logWebhookError("docusign", event, body, `approval ${row.id} ${target}: ${result.error}`);
    return NextResponse.json({ ok: true, ignored: result.error });
  }
  return NextResponse.json({ ok: true, transitioned: result });
}