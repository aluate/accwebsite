/**
 * lib/approval-page.ts — the page that says a contract was approved.
 *
 * WHY THIS EXISTS.
 *
 * There are two ways a contract gets approved now, and they are not the same
 * thing:
 *
 *   SIGNATURE   the client opened the link and drew their name. The strongest
 *               record: their mark, their IP, their timestamp.
 *
 *   IN PERSON   an ACC person ticked a box because the approval already
 *               happened — in a kitchen, over a handshake, when the deposit
 *               changed hands. Karl: "Sometimes a handshake and money changing
 *               hands is enough. As long as we have WHO clicked the box and
 *               WHEN we can audit."
 *
 * The second is a weaker record than the first, and this file's whole job is to
 * make sure the paper says which one it is. An in-person approval page must
 * never be mistakable for a signed one: no signature line, no "Electronic
 * Signature" caption, no client name in the signer slot. It says ACC recorded
 * this, and who, and when — because that is all that actually happened.
 *
 * Getting that wrong is not a cosmetic bug. A document that implies a client
 * signed something they did not sign is worse than having no document.
 */

export type ApprovalDetails =
  | {
      method: "signature";
      siteAddress: string;
      clientName: string;
      /** The name the client typed. */
      signerName: string;
      signedAt: string;
      ip: string;
      /** data:image/png;base64,... */
      signatureData: string;
    }
  | {
      method: "in_person";
      siteAddress: string;
      clientName: string;
      /** The ACC person who ticked the box. */
      recordedBy: string;
      recordedAt: string;
    };

export const APPROVAL_HEADING: Record<ApprovalDetails["method"], string> = {
  signature: "APPROVED — CLIENT SIGNATURE",
  in_person: "APPROVED IN PERSON — RECORDED BY ACC",
};

export const APPROVAL_DISCLAIMER: Record<ApprovalDetails["method"], string> = {
  signature:
    "By signing below, the client confirms review and approval of the above specification.",
  in_person:
    "The client approved this specification in person. This page records that approval as " +
    "entered by Advanced Custom Cabinets. It is not a client signature.",
};

/** The metadata block, in the order it is printed. */
export function approvalLines(d: ApprovalDetails): string[] {
  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) + " PT";

  if (d.method === "in_person") {
    return [
      `Project:      ${d.siteAddress}`,
      `Client:       ${d.clientName}`,
      `Approved:     In person`,
      `Recorded by:  ${d.recordedBy}`,
      `Date:         ${when(d.recordedAt)}`,
    ];
  }
  return [
    `Project:   ${d.siteAddress}`,
    `Client:    ${d.clientName}`,
    `Signer:    ${d.signerName}`,
    `Date:      ${when(d.signedAt)}`,
    `IP:        ${d.ip}`,
  ];
}

/**
 * Append an approval page to a PDF and return the new bytes.
 *
 * Takes the packet as raw bytes rather than a path so it does not care where
 * the PDF came from or where it is going.
 */
export async function stampApprovalPage(
  pdfBytes: Buffer | Uint8Array | null,
  d: ApprovalDetails,
): Promise<Buffer> {
  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");

  const doc = pdfBytes ? await PDFDocument.load(pdfBytes) : await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const { width, height } = page.getSize();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const plain = await doc.embedFont(StandardFonts.Helvetica);

  page.drawRectangle({ x: 0, y: height - 60, width, height: 60, color: rgb(0.941, 0.506, 0.133) });
  page.drawText(APPROVAL_HEADING[d.method], {
    x: 36, y: height - 40, size: 16, font: bold, color: rgb(1, 1, 1),
  });

  let y = height - 100;
  for (const line of approvalLines(d)) {
    page.drawText(line, { x: 60, y, size: 11, font: plain, color: rgb(0.1, 0.1, 0.1) });
    y -= 20;
  }

  page.drawText(APPROVAL_DISCLAIMER[d.method], {
    x: 60, y: y - 10, size: 9, font: plain, color: rgb(0.4, 0.4, 0.4),
  });

  /*
    Only the signature path draws a signature and a line to sit it on. The
    in-person page deliberately ends at the disclaimer — an empty signature rule
    would read as a place somebody forgot to sign, which is the wrong story.
  */
  if (d.method === "signature" && d.signatureData.startsWith("data:image/png;base64,")) {
    /*
      The prefix check is not enough — a truncated or corrupt payload gets past
      it and then throws inside the PNG decoder. That used to take the whole
      approval document with it, which is the wrong trade: the approval is real
      and recorded either way, and a page without the drawn mark is far better
      than no page at all. So a bad image costs the picture, not the record, and
      says so on the page rather than leaving a blank space nobody can explain.
    */
    try {
      const png = await doc.embedPng(
        Buffer.from(d.signatureData.replace("data:image/png;base64,", ""), "base64"),
      );
      const dims = png.scale(0.5);
      const imgY = y - 40 - dims.height;
      page.drawImage(png, { x: 60, y: Math.max(imgY, 80), width: dims.width, height: dims.height });
      const lineY = Math.max(imgY - 10, 75);
      page.drawLine({ start: { x: 60, y: lineY }, end: { x: 360, y: lineY }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(`${d.signerName} — Electronic Signature`, {
        x: 60, y: lineY - 14, size: 8, font: plain, color: rgb(0.5, 0.5, 0.5),
      });
    } catch {
      page.drawText(
        `Signature recorded for ${d.signerName}, but the image could not be rendered.`,
        { x: 60, y: y - 40, size: 9, font: plain, color: rgb(0.4, 0.4, 0.4) },
      );
    }
  }

  page.drawText("Advanced Custom Cabinets · 250 W Anton Ave, Coeur d'Alene, ID 83815 · 208.772.2377", {
    x: 36, y: 30, size: 7.5, font: plain, color: rgb(0.6, 0.6, 0.6),
  });

  return Buffer.from(await doc.save());
}
