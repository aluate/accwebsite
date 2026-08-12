/**
 * Shared between the multipart upload route and the direct-to-storage one.
 *
 * These were about to be duplicated. The folder whitelist in particular is a security
 * boundary — it decides where a caller may write inside the bucket — and a second copy
 * of a security boundary drifts from the first the moment someone adds a folder to
 * only one of them.
 */

export const BUCKET = "job-files";

/** Z drive mirror — the only folders a file may be written into. */
export const VALID_KINDS = new Set([
  "00_field_dims",
  "01_plan",
  "02_quote",
  "03_job_specs",
  "04_appliances",
  "05_drawings",
  "05a_redlines",
  "06_as_builts",
  "07_correspondence",
  "08_project_mgmt",
  "09_site_photos",
  "10_billing",
  "11_punch_list",
  "12_cost_quality",
  "13_installation",
  "14_prod_docs",
  "14_wo_pdfs",
  "14_ship_ticket",
  "14_install_drawings",
  "15_contract",
  "16_eng_drawings", // approved drawings for engineering release
]);

/**
 * Strip anything that is not plainly safe in an object key.
 *
 * This is also what stops `../` traversal reaching the storage path — the separator
 * itself is removed, not escaped.
 */
export function safeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 200);
}

/** Where a file for this job and folder is allowed to live. */
export function storagePath(jobId: string, kind: string, filename: string): string {
  const ts = Date.now();
  return `jobs/${jobId}/${kind}/${ts}-${filename}`;
}

/**
 * Vercel rejects a serverless request body over this at the edge, before the function
 * runs — no log line, just a bare 413. Anything at or above it must take the direct
 * path instead. Kept a little under the real 4.5 MB so multipart overhead cannot push
 * a file that looked fine over the line.
 */
export const MULTIPART_LIMIT_BYTES = 4 * 1024 * 1024;
