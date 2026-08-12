/**
 * lib/upload-job-file.ts — upload one file to a job, from the browser.
 *
 * Small files go the old way (one multipart POST). Anything that would hit Vercel's
 * 4.5 MB request-body ceiling goes straight to Supabase Storage through a signed URL
 * and never touches a serverless function.
 *
 * WHY A HELPER RATHER THAN FIXING THE ONE PANEL. Six components upload job files —
 * JobFilesPanel, QuickUploadDrawing, CabinetsDrawingsView, EngineeringReleasePanel,
 * SendBidModal, PortalJobClient. Fixing the size ceiling in one of them leaves the
 * same 413 waiting in the other five, and the next person to hit it gets the same
 * "Upload failed" with no reason.
 *
 * The threshold is deliberately below the real limit: multipart framing adds a few
 * hundred bytes on top of the file, so a file measured at exactly 4.5 MB would still
 * be rejected. Anything at or over 4 MB takes the direct path.
 */

export type UploadResult =
  | { ok: true; id: string; filename: string; size: number; via: "multipart" | "direct" }
  | { ok: false; error: string };

/** Mirrors MULTIPART_LIMIT_BYTES in app/api/jobs/[id]/files/shared.ts. */
const DIRECT_ABOVE_BYTES = 4 * 1024 * 1024;

export async function uploadJobFile(jobId: string, file: File, kind: string): Promise<UploadResult> {
  return file.size >= DIRECT_ABOVE_BYTES
    ? uploadDirect(jobId, file, kind)
    : uploadMultipart(jobId, file, kind);
}

async function uploadMultipart(jobId: string, file: File, kind: string): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);
  try {
    const res = await fetch(`/api/jobs/${jobId}/files`, { method: "POST", body: fd });
    if (res.status === 413) {
      // Belt and braces: if the ceiling ever moves, or a file slips past the size
      // check, fall through to the path that has no ceiling rather than failing.
      return uploadDirect(jobId, file, kind);
    }
    if (!res.ok) return { ok: false, error: await errorFrom(res) };
    const body = await res.json();
    return { ok: true, id: body.id, filename: body.filename, size: body.size, via: "multipart" };
  } catch (e) {
    return { ok: false, error: `The upload did not complete: ${(e as Error)?.message ?? e}` };
  }
}

async function uploadDirect(jobId: string, file: File, kind: string): Promise<UploadResult> {
  try {
    // 1. Ask the server where this file may go. It decides the path and the name.
    const startRes = await fetch(`/api/jobs/${jobId}/files/direct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, kind }),
    });
    if (!startRes.ok) return { ok: false, error: await errorFrom(startRes) };
    const { signedUrl, path, filename } = await startRes.json() as
      { signedUrl: string; path: string; filename: string };

    // 2. The bytes go straight to storage. No Vercel function in the middle, so no
    //    4.5 MB ceiling and nothing buffering the whole file in a Lambda.
    const putRes = await fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!putRes.ok) {
      const detail = await putRes.text().catch(() => "");
      return {
        ok: false,
        error: putRes.status === 413
          // Supabase buckets carry their own per-file limit, set in the dashboard.
          // Say so, because it is a different knob from the Vercel one and needs a
          // different person to change it.
          ? `Storage rejected this file as too large. The job-files bucket has a per-file size limit that needs raising in Supabase.`
          : `Storage rejected the upload (HTTP ${putRes.status}). ${detail.slice(0, 200)}`,
      };
    }

    // 3. Only now record it, so a listed file is always a file that exists.
    const recRes = await fetch(`/api/jobs/${jobId}/files/direct`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, filename, kind, size: file.size }),
    });
    if (!recRes.ok) return { ok: false, error: await errorFrom(recRes) };
    const body = await recRes.json();
    return { ok: true, id: body.id, filename: body.filename, size: body.size, via: "direct" };
  } catch (e) {
    return { ok: false, error: `The upload did not complete: ${(e as Error)?.message ?? e}` };
  }
}

/** The server's own words where there are any — never a bare "Upload failed". */
async function errorFrom(res: Response): Promise<string> {
  const body = await res.json().catch(() => null) as { error?: string } | null;
  if (body?.error) return body.error;
  if (res.status === 413) return "That file is too large to upload this way.";
  if (res.status === 401 || res.status === 403) return "You are not signed in, or not allowed to upload to this job.";
  return `Upload failed (HTTP ${res.status}).`;
}
