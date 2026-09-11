/**
 * lib/spec-revision.ts — after release, whose change is this?
 *
 * WHY THIS EXISTS.
 *
 * Karl: "I think we need to make sure that CLIENT driven changes after release
 * are different than ACC driven changes after lock. Those things happen from
 * time to time and come down to relationship management."
 *
 * That is the whole design, and it is better than the one it replaced. The
 * question was originally framed as whether a released spec should be locked.
 * It should not. Changes after release are normal — a client moves an island,
 * or we find a dimension we got wrong. What matters is not preventing the
 * edit; it is knowing who caused it, because the two have completely different
 * consequences:
 *
 *   CLIENT  the client asked for it. It is a change order: billable, needs
 *           their sign-off, moves the schedule, and the record is what backs
 *           up that conversation later.
 *
 *   ACC     we got something wrong or need to adjust. Not billable, no client
 *           sign-off, but engineering and the shop still need to know the spec
 *           moved and what moved.
 *
 * Mechanically the same edit. Completely different paper trail. So nobody is
 * locked out: the app asks one question and does the right thing afterwards.
 *
 * Before release there is nothing to attribute — the spec is still being
 * written — so this only applies from RELEASED_TO_ENG onward.
 */

/** Who caused a change to a released spec. */
export type RevisionOrigin = "client" | "acc";

export const REVISION_ORIGINS: RevisionOrigin[] = ["client", "acc"];

export const ORIGIN_LABEL: Record<RevisionOrigin, string> = {
  client: "Client asked for this",
  acc: "ACC change",
};

export const ORIGIN_CONSEQUENCE: Record<RevisionOrigin, string> = {
  client: "Raises a change order — billable, needs their sign-off, may move the schedule.",
  acc: "Logged for engineering and the shop. Not billable, no client sign-off.",
};

/**
 * States in which an edit has to say who caused it.
 *
 * RELEASED_TO_ENG onward: once engineering has it, a change costs somebody
 * something. DRAFT and CLIENT_APPROVED are still the spec being agreed.
 */
export const ATTRIBUTED_STATES = ["RELEASED_TO_ENG", "ENGINEERED", "RELEASED_TO_SHOP"] as const;

export function requiresAttribution(lifecycleState: string | null | undefined): boolean {
  return !!lifecycleState && (ATTRIBUTED_STATES as readonly string[]).includes(lifecycleState);
}

export function isRevisionOrigin(v: unknown): v is RevisionOrigin {
  return v === "client" || v === "acc";
}

export type RevisionInput = { origin: RevisionOrigin; note?: string | null };

/**
 * Validate what the client sent with a save on a released spec.
 *
 * Returns an error string the API can hand straight back. The message says
 * what to send, because a 409 that does not is just a wall.
 */
export function validateRevision(
  lifecycleState: string | null | undefined,
  revision: unknown,
): { ok: true; revision: RevisionInput | null } | { ok: false; error: string } {
  if (!requiresAttribution(lifecycleState)) return { ok: true, revision: null };

  const r = revision as { origin?: unknown; note?: unknown } | undefined | null;
  if (!r || !isRevisionOrigin(r.origin)) {
    return {
      ok: false,
      error:
        "This spec has been released to engineering, so a change has to say who asked for it. " +
        'Send revision: { origin: "client" } for a client change (which raises a change order) ' +
        'or revision: { origin: "acc" } for one of ours.',
    };
  }

  const note = typeof r.note === "string" && r.note.trim() ? r.note.trim().slice(0, 2000) : null;
  return { ok: true, revision: { origin: r.origin, note } };
}
