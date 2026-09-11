/**
 * lib/job-label.ts — what a job is called, everywhere, in one place.
 *
 * WHY THIS FILE EXISTS.
 *
 * Karl, on the naming, twice:
 *
 *   "instead of refering to things as (5 digit ACC JOB NUMBER) (BUILDER)
 *    (JOB NAME) that make it hard to read/understand"
 *
 *   "I don't want ACC-2026-0181 anywhere. That's something that should never
 *    be visible, it's a back end piece only you and I know about. If no job
 *    number is assigned I would prefer to have the builder, name, address."
 *
 * And on what the name IS:
 *
 *   "the name needs to be the Client Name unless there is no name. Then it
 *    needs to be the address. We have spec homes that ONLY get listed with the
 *    address."
 *
 * Nine places built their own version of this. They disagree, and several of
 * them fall back to `job.id` when something is missing, which puts the
 * internal key on screen — the one thing it must never do. The portal comment
 * email went further and put the raw URL parameter in the SUBJECT LINE of a
 * message to a builder.
 *
 * So: one function. It never returns the internal id, and it never returns an
 * empty string.
 */

export type JobLike = {
  id?: string | null;
  job_number?: string | number | null;
  client_name?: string | null;
  site_address?: string | null;
  city?: string | null;
  builder_company?: string | null;
  builder_name?: string | null;
};

const clean = (v: unknown): string =>
  typeof v === "string" || typeof v === "number" ? String(v).trim() : "";

/** An ACC key looks like ACC-2026-0181. It is never shown to anyone. */
export function isInternalId(v: unknown): boolean {
  return /^ACC-\d{4}-\d+$/i.test(clean(v)) || /^ACC-TEST-/i.test(clean(v));
}

/** The builder, by whichever field carries it. */
export function builderOf(job: JobLike): string {
  return clean(job.builder_company) || clean(job.builder_name);
}

/**
 * The job's NAME: the client, or the address when there is no client.
 *
 * Spec homes have no client yet and are known by their address, so this is
 * not a fallback for missing data — it is the rule.
 */
export function jobName(job: JobLike): string {
  return clean(job.client_name) || clean(job.site_address);
}

/**
 * The full label: `#26401 · Atlas Builders · Kenny Debaene`.
 *
 * With no job number yet: `Atlas Builders · Kenny Debaene · 5712 Davenport`,
 * because until the number exists those three together are what identifies it.
 *
 * Empty parts are dropped rather than left as gaps, and if somehow nothing is
 * known the result says so in words — never the internal id.
 */
export function jobLabel(job: JobLike, opts?: { separator?: string }): string {
  const sep = opts?.separator ?? " · ";
  const number = clean(job.job_number);
  const builder = builderOf(job);
  const name = jobName(job);

  const parts = number
    ? [`#${number}`, builder, name]
    // No number: the address earns its own slot, since the name may already BE
    // the address on a spec home — in which case it is not repeated.
    : [builder, name, clean(job.site_address) === name ? "" : clean(job.site_address)];

  const label = parts.map(clean).filter(Boolean).join(sep);
  return label || "Untitled job";
}

/**
 * The short form for somewhere tight — a subject line, a schedule chip.
 * `#26401 Kenny Debaene`, or the name alone when there is no number.
 */
export function jobLabelShort(job: JobLike): string {
  const number = clean(job.job_number);
  const name = jobName(job);
  if (number && name) return `#${number} ${name}`;
  if (number) return `#${number}`;
  return name || builderOf(job) || "Untitled job";
}

/**
 * What to show when all you have is an identifier — a URL parameter, say.
 *
 * Returns the number as `#26401`, and for an internal ACC key returns null,
 * because there is nothing safe to show and the caller must load the job.
 * This exists so that "I only have the id" stops being a reason to print it.
 */
export function labelFromRef(ref: string | null | undefined): string | null {
  const r = clean(ref);
  if (!r) return null;
  if (isInternalId(r)) return null;
  return `#${r}`;
}
