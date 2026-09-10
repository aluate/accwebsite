/**
 * lib/spec-approval.ts — is this spec still a draft, for the purposes of a document?
 *
 * WHY THIS FILE EXISTS.
 *
 * Every page of every spec PDF asked the same question inline:
 *
 *     const isDraft = !data.lifecycle_state || data.lifecycle_state !== "APPROVED";
 *
 * "APPROVED" is not a lifecycle state. The five real ones are DRAFT,
 * CLIENT_APPROVED, RELEASED_TO_ENG, ENGINEERED and RELEASED_TO_SHOP
 * (lib/lifecycle.ts). So the comparison was false for every spec that has ever
 * existed, at every stage, and the red DRAFT watermark and the "DRAFT — PENDING
 * APPROVAL" banner printed on every document — including one released to the
 * shop floor and one a client had already signed.
 *
 * The question was asked in seven places with the string written out seven
 * times, which is how a wrong answer stays wrong: fixing one page would have
 * left the other six shouting DRAFT across the same packet. It is asked in one
 * place now, and scripts/test-spec-approval.mjs fails if these state names ever
 * stop matching lib/lifecycle.ts — a renamed state should break the build, not
 * quietly stamp DRAFT on the shop's paperwork for another few months.
 *
 * Pure on purpose: no database import, so a document renderer can ask this
 * without pulling a connection in behind it.
 */

/**
 * The states in which a spec has been approved by the client and is no longer a
 * draft. Everything from CLIENT_APPROVED onward — once the client has signed,
 * the document stops being provisional, and every later state is further along
 * still.
 */
export const APPROVED_LIFECYCLE_STATES = [
  "CLIENT_APPROVED",
  "RELEASED_TO_ENG",
  "ENGINEERED",
  "RELEASED_TO_SHOP",
] as const;

const APPROVED = new Set<string>(APPROVED_LIFECYCLE_STATES);

/** Has the client approved this spec? A missing state is treated as a draft. */
export function isSpecApproved(lifecycleState: string | null | undefined): boolean {
  return !!lifecycleState && APPROVED.has(lifecycleState);
}

/** Should this document carry the DRAFT watermark? */
export function isSpecDraft(lifecycleState: string | null | undefined): boolean {
  return !isSpecApproved(lifecycleState);
}
