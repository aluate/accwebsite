import sql, { uid } from "@/lib/db";
import { transitionLifecycle } from "@/lib/lifecycle";
import { logActivity } from "@/lib/activity-log";

export const APPROVAL_STATES = ["DRAFT","SENT","VIEWED","SIGNED","COMPLETED","DECLINED","VOIDED","EXPIRED"] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

const EDGES: Record<ApprovalState, ApprovalState[]> = {
  DRAFT:["SENT","VOIDED"], SENT:["VIEWED","SIGNED","DECLINED","VOIDED","EXPIRED"],
  VIEWED:["SIGNED","DECLINED","VOIDED","EXPIRED"], SIGNED:["COMPLETED","VOIDED"],
  COMPLETED:[], DECLINED:[], VOIDED:[], EXPIRED:[],
};

export function isApprovalState(s: string): s is ApprovalState {
  return (APPROVAL_STATES as readonly string[]).includes(s);
}
export function canTransition(from: string, to: string): boolean {
  if (!isApprovalState(from) || !isApprovalState(to)) return false;
  return EDGES[from].includes(to);
}

export type CreateInput = {
  specId: string; jobId: string; recipientName?: string; recipientEmail?: string;
  quotePdfPath?: string; drawingsPdfPath?: string; disclosurePdfPath?: string; createdBy: string;
};

export async function createApprovalRequest(input: CreateInput): Promise<string> {
  const id = uid(); const now = new Date().toISOString();
  await sql`INSERT INTO approval_requests (id, spec_id, job_id, status, quote_pdf_path, drawings_pdf_path, disclosure_pdf_path, recipient_name, recipient_email, created_at, created_by) VALUES (${id}, ${input.specId}, ${input.jobId}, 'DRAFT', ${input.quotePdfPath??null}, ${input.drawingsPdfPath??null}, ${input.disclosurePdfPath??null}, ${input.recipientName??null}, ${input.recipientEmail??null}, ${now}, ${input.createdBy})`;
  return id;
}

type ApprovalRow = { id: string; spec_id: string; status: string; docusign_envelope_id: string | null; combined_pdf_path: string | null };

export async function getApproval(id: string): Promise<ApprovalRow | null> {
  const rows = await sql<ApprovalRow[]>`SELECT id, spec_id, status, docusign_envelope_id, combined_pdf_path FROM approval_requests WHERE id = ${id}`;
  return rows[0] ?? null;
}

export async function listApprovalsForSpec(specId: string) {
  return await sql`SELECT * FROM approval_requests WHERE spec_id = ${specId} ORDER BY created_at DESC`;
}

export type TransitionResult = { ok: true; from: ApprovalState; to: ApprovalState } | { ok: false; error: string };

export async function transitionApproval(
  approvalId: string, to: ApprovalState,
  opts: { actor: string; docusignEnvelopeId?: string; declineReason?: string; eventPayload?: string; combinedPdfPath?: string },
): Promise<TransitionResult> {
  const rows = await sql`SELECT status, spec_id, job_id FROM approval_requests WHERE id = ${approvalId}`;
  const row = rows[0] as { status: string; spec_id: string; job_id: string } | undefined;
  if (!row) return { ok: false, error: "Approval not found" };
  const from = row.status;
  if (!isApprovalState(from)) return { ok: false, error: `Unknown current state: ${from}` };
  if (!canTransition(from, to)) return { ok: false, error: `Illegal ${from} → ${to}. Allowed: ${EDGES[from as ApprovalState].join(", ") || "(terminal)"}` };

  const now = new Date().toISOString();
  const stamps: Partial<Record<ApprovalState, string>> = { SENT:"sent_at", VIEWED:"viewed_at", SIGNED:"signed_at", COMPLETED:"completed_at", VOIDED:"voided_at" };
  const stampCol = stamps[to];

  // Build update using individual fields to avoid sql(obj) complexity
  await sql`UPDATE approval_requests SET
    status = ${to},
    last_event_at = ${now},
    docusign_envelope_id = COALESCE(${opts.docusignEnvelopeId ?? null}, docusign_envelope_id),
    last_event_payload   = COALESCE(${opts.eventPayload ?? null}, last_event_payload),
    combined_pdf_path    = COALESCE(${opts.combinedPdfPath ?? null}, combined_pdf_path),
    decline_reason       = COALESCE(${opts.declineReason ?? null}, decline_reason),
    sent_at      = CASE WHEN ${stampCol ?? ''} = 'sent_at'      THEN ${now} ELSE sent_at END,
    viewed_at    = CASE WHEN ${stampCol ?? ''} = 'viewed_at'    THEN ${now} ELSE viewed_at END,
    signed_at    = CASE WHEN ${stampCol ?? ''} = 'signed_at'    THEN ${now} ELSE signed_at END,
    completed_at = CASE WHEN ${stampCol ?? ''} = 'completed_at' THEN ${now} ELSE completed_at END,
    voided_at    = CASE WHEN ${stampCol ?? ''} = 'voided_at'    THEN ${now} ELSE voided_at END
    WHERE id = ${approvalId}`;

  await logActivity({ entityType:"approval", entityId:approvalId, jobId:row.job_id, eventType:"status_change", fromState:from, toState:to, actor:opts.actor }).catch(()=>{});

  if (to === "COMPLETED") {
    await transitionLifecycle({ specId: row.spec_id, to: "CLIENT_APPROVED", actor: opts.actor, reason: "DocuSign envelope completed" }).catch(()=>{});
  }

  return { ok: true, from: from as ApprovalState, to };
}
