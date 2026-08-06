export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

/**
 * GET  /api/signoffs/[token]  — fetch signoff + signed URL for the combined PDF
 * POST /api/signoffs/[token]  — submit signature
 *
 * POST body: { signer_name: string; signature_data: string }
 *   signature_data = base64 PNG data URL from canvas
 *
 * On POST success:
 *   1. Downloads combined_pdf_path from storage.
 *   2. Appends a signature page (signer name, date, IP, drawn signature image).
 *   3. Uploads signed PDF to jobs/{jobId}/15_contract/contract-signed-{ts}.pdf.
 *   4. Saves file ID + path to client_signoffs.signed_contract_path.
 *   5. Inserts a job_files row (kind: '15_contract').
 *   6. Emails PM with a link to the signed contract.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { sendEmail } from "@/lib/mailer";
import { logActivity } from "@/lib/activity-log";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "job-files";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type Params = { params: Promise<{ token: string }> };

// ── GET ─────────────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;

  const [signoff] = await sql`
    SELECT cs.id, cs.job_id, cs.status, cs.token_expires_at,
           cs.pm_note, cs.signer_name, cs.signed_at, cs.combined_pdf_path,
           cs.signed_contract_path,
           j.client_name, j.site_address, j.city
    FROM client_signoffs cs
    JOIN jobs j ON j.id = cs.job_id
    WHERE cs.token = ${token}
  `;

  if (!signoff) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Generate a short-lived signed URL for the combined PDF so the client can view it inline.
  let combined_pdf_url: string | null = null;
  if (signoff.combined_pdf_path) {
    const { data } = await supabaseAdmin()
      .storage.from(BUCKET)
      .createSignedUrl(signoff.combined_pdf_path as string, 7200);
    combined_pdf_url = data?.signedUrl ?? null;
  }

  const { signature_data: _sig, ...safe } = signoff as Record<string, unknown>;
  return NextResponse.json({ ...safe, combined_pdf_url });
}

// ── POST ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const body = await req.json() as { signer_name: string; signature_data: string };
  const { signer_name, signature_data } = body;

  if (!signer_name?.trim()) return NextResponse.json({ error: "signer_name required" }, { status: 400 });
  if (!signature_data)       return NextResponse.json({ error: "signature_data required" }, { status: 400 });

  // Look up the token
  const [signoff] = await sql`
    SELECT cs.id, cs.job_id, cs.status, cs.token_expires_at, cs.combined_pdf_path,
           j.client_name, j.site_address, j.pm
    FROM client_signoffs cs
    JOIN jobs j ON j.id = cs.job_id
    WHERE cs.token = ${token}
  ` as Array<{
    id: string; job_id: string; status: string; token_expires_at: string;
    combined_pdf_path: string | null;
    client_name: string; site_address: string; pm: string;
  }>;

  if (!signoff) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (signoff.status === "signed") return NextResponse.json({ error: "Already signed" }, { status: 409 });
  if (new Date(signoff.token_expires_at) < new Date()) {
    return NextResponse.json({ error: "Link has expired" }, { status: 410 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";

  const signedAt = new Date().toISOString();
  const name = signer_name.trim();

  // ── Build signed contract PDF ─────────────────────────────────────────────
  let signedContractPath: string | null = null;
  let signedFileId: string | null = null;

  try {
    const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");

    // 1. Load the combined unsigned PDF (if available).
    let combinedBytes: Buffer | null = null;
    if (signoff.combined_pdf_path) {
      const { data, error } = await supabaseAdmin()
        .storage.from(BUCKET)
        .download(signoff.combined_pdf_path);
      if (!error && data) combinedBytes = Buffer.from(await data.arrayBuffer());
    }

    const doc = combinedBytes
      ? await PDFDocument.load(combinedBytes)
      : await PDFDocument.create();

    // 2. Append a signature page.
    const sigPage = doc.addPage([612, 792]); // Letter portrait
    const { width, height } = sigPage.getSize();
    const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const helvetica     = await doc.embedFont(StandardFonts.Helvetica);

    // Orange header bar
    sigPage.drawRectangle({ x: 0, y: height - 60, width, height: 60, color: rgb(0.941, 0.506, 0.133) });
    sigPage.drawText("APPROVED — CLIENT SIGNATURE", {
      x: 36, y: height - 40, size: 16, font: helveticaBold, color: rgb(1, 1, 1),
    });

    // Metadata block
    const metaLines = [
      `Project:   ${signoff.site_address}`,
      `Client:    ${signoff.client_name}`,
      `Signer:    ${name}`,
      `Date:      ${new Date(signedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PT`,
      `IP:        ${ip}`,
    ];
    let y = height - 100;
    for (const line of metaLines) {
      sigPage.drawText(line, { x: 60, y, size: 11, font: helvetica, color: rgb(0.1, 0.1, 0.1) });
      y -= 20;
    }

    // Disclaimer text
    sigPage.drawText(
      "By signing below, the client confirms review and approval of the above specification.",
      { x: 60, y: y - 10, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) }
    );

    // Embedded signature image
    if (signature_data.startsWith("data:image/png;base64,")) {
      const pngData = Buffer.from(signature_data.replace("data:image/png;base64,", ""), "base64");
      const pngImage = await doc.embedPng(pngData);
      const imgDims = pngImage.scale(0.5);
      const imgY = y - 40 - imgDims.height;
      sigPage.drawImage(pngImage, { x: 60, y: Math.max(imgY, 80), width: imgDims.width, height: imgDims.height });

      // Signature line
      const lineY = Math.max(imgY - 10, 75);
      sigPage.drawLine({ start: { x: 60, y: lineY }, end: { x: 360, y: lineY }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
      sigPage.drawText(`${name} — Electronic Signature`, { x: 60, y: lineY - 14, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
    }

    // Footer
    sigPage.drawText("Advanced Custom Cabinets · 250 W Anton Ave, Coeur d'Alene, ID 83815 · 208.772.2377", {
      x: 36, y: 30, size: 7.5, font: helvetica, color: rgb(0.6, 0.6, 0.6),
    });

    const signedBytes = await doc.save();
    const signedBuf = Buffer.from(signedBytes);

    // 3. Upload signed PDF.
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const signedFilename = `contract-signed-${ts}.pdf`;
    signedContractPath = `jobs/${signoff.job_id}/15_contract/${signedFilename}`;

    const { error: upErr } = await supabaseAdmin()
      .storage.from(BUCKET)
      .upload(signedContractPath, signedBuf, { contentType: "application/pdf", upsert: false });

    if (!upErr) {
      // 4. Insert job_files row.
      signedFileId = uid();
      await sql`
        INSERT INTO job_files (id, job_id, kind, filename, storage_path, size, uploaded_at)
        VALUES (
          ${signedFileId}, ${signoff.job_id}, '15_contract',
          ${signedFilename}, ${signedContractPath},
          ${signedBuf.length}, ${signedAt}
        )
      `.catch(() => {});
    } else {
      console.error("[signoff] signed contract upload failed:", upErr.message);
      signedContractPath = null;
    }
  } catch (pdfErr) {
    console.error("[signoff] signature page generation failed:", pdfErr);
    // Don't block the signature — record it even if PDF assembly fails.
  }

  // ── Persist signature ─────────────────────────────────────────────────────
  await sql`
    UPDATE client_signoffs SET
      status               = 'signed',
      signer_name          = ${name},
      signature_data       = ${signature_data},
      signed_at            = ${signedAt},
      signer_ip            = ${ip},
      signed_contract_path = ${signedContractPath ?? null}
    WHERE token = ${token}
  `;

  // ── Activity log ──────────────────────────────────────────────────────────
  await logActivity({
    entityType: "job",
    entityId: signoff.job_id,
    jobId: signoff.job_id,
    eventType: "client_signed",
    actor: name,
    actorRole: "client",
    payload: { signer_ip: ip, signed_at: signedAt, signed_file_id: signedFileId },
  }).catch(() => {});

  // ── Notify PM ─────────────────────────────────────────────────────────────
  const pmEmail = process.env.PM_EMAIL ?? "residential@advancedcabinets.net";
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.advancedcabinets.org";

  // Generate a short-lived signed URL for the PM email if the signed contract was saved.
  let contractUrl: string | null = null;
  if (signedContractPath) {
    const { data } = await supabaseAdmin()
      .storage.from(BUCKET)
      .createSignedUrl(signedContractPath, 604800); // 7-day link
    contractUrl = data?.signedUrl ?? null;
  }

  await sendEmail({
    to: pmEmail,
    subject: `✅ Contract signed — ${signoff.client_name} (${signoff.site_address})`,
    text: [
      `${signoff.client_name} has signed the contract for this job.`,
      ``,
      `Job:    ${signoff.site_address}`,
      `Signer: ${name}`,
      `Date:   ${new Date(signedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PT`,
      `IP:     ${ip}`,
      ``,
      contractUrl ? `Signed contract: ${contractUrl}` : "",
      ``,
      `View job: ${appUrl}/jobs/${signoff.job_id}`,
    ].filter(Boolean).join("\n"),
  }).catch(() => {});

  return NextResponse.json({ ok: true, signed_file_id: signedFileId });
}
