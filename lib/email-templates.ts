/**
 * lib/email-templates.ts
 *
 * Centralized email template library.
 * Every function is a pure builder: data in → { subject, text, html } out.
 * No DB calls here — resolve all data before calling these.
 *
 * Recipient metadata is defined in NOTIFICATION_TRIGGERS at the bottom.
 * Use that map when building a notification-settings UI.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TemplateResult = { subject: string; text: string; html: string };

export type RecipientType =
  | "pm"
  | "residential"
  | "engineering"
  | "shop"
  | "finishing"
  | "installer"
  | "homeowner"
  | "builder"
  | "configurable_group";

export type NotificationTrigger = {
  id: string;
  label: string;
  description: string;
  defaultRecipients: RecipientType[];
  /** Whether this trigger already has a live implementation */
  status: "built" | "planned";
};

// ─────────────────────────────────────────────────────────────────────────────
// HTML layout helpers (ACC brand)
// ─────────────────────────────────────────────────────────────────────────────

const BRAND_NAVY  = "#1e3a5f";
const BRAND_ORANGE = "#f08122";

function h(s: string | null | undefined): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });
  } catch { return d; }
}

/** Wraps content in the standard ACC email chrome. */
function layout(opts: {
  heading: string;
  subheading?: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footer?: string;
}): string {
  const cta = opts.ctaLabel && opts.ctaUrl
    ? `<div style="margin-top:20px;padding-top:14px;border-top:1px solid #eee;">
        <a href="${h(opts.ctaUrl)}" style="background:${BRAND_NAVY};color:#fff;text-decoration:none;padding:9px 18px;border-radius:4px;font-size:13px;display:inline-block;">${h(opts.ctaLabel)} &rarr;</a>
       </div>`
    : "";

  const footer = opts.footer
    ? `<div style="margin-top:18px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#aaa;">${opts.footer}</div>`
    : `<div style="margin-top:18px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#aaa;">
        Advanced Custom Cabinets &mdash; <a href="https://www.advancedcabinets.org" style="color:#aaa;">advancedcabinets.org</a>
       </div>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;color:#222;max-width:640px;margin:0 auto;padding:16px;background:#fff;">
  <div style="background:${BRAND_NAVY};color:#fff;padding:16px 20px;border-radius:4px 4px 0 0;">
    <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;opacity:.6;">Advanced Custom Cabinets</div>
    <div style="font-size:20px;font-weight:700;margin-top:4px;">${h(opts.heading)}</div>
    ${opts.subheading ? `<div style="font-size:13px;opacity:.8;margin-top:3px;">${h(opts.subheading)}</div>` : ""}
  </div>
  <div style="border:1px solid #ddd;border-top:none;padding:20px;border-radius:0 0 4px 4px;">
    ${opts.body}
    ${cta}
    ${footer}
  </div>
</body></html>`;
}

/** Standard key-value info row used in most templates. */
function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:4px 14px 4px 0;color:#888;font-size:12px;white-space:nowrap;vertical-align:top;">${h(label)}</td>
    <td style="padding:4px 0;font-size:13px;vertical-align:top;">${value}</td>
  </tr>`;
}

function infoTable(rows: string[]): string {
  return `<table style="border-collapse:collapse;width:100%;margin-bottom:16px;">${rows.join("")}</table>`;
}

function para(text: string): string {
  return `<p style="font-size:13px;line-height:1.6;margin:0 0 12px;">${text}</p>`;
}

function highlight(text: string): string {
  return `<div style="background:#fff8f0;border-left:3px solid ${BRAND_ORANGE};padding:10px 14px;font-size:13px;margin:14px 0;">${text}</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTERNAL: Lead / client-facing templates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * lead_inquiry_response
 * Sent to a new lead who submitted via the website contact form.
 * Collects the info needed to create a job.
 */
export function leadInquiryResponse(data: {
  clientFirstName: string;
  yourName: string;
  yourPhone: string;
  yourEmail?: string;
}): TemplateResult {
  const subject = `Thanks for reaching out — Advanced Cabinets`;

  const text = [
    `Hi ${data.clientFirstName},`,
    ``,
    `Thanks for reaching out — we'd love to help with your project.`,
    ``,
    `To get a sense of what you're working with, could you send over a few quick details?`,
    ``,
    `1. Project address — where is the home or project located?`,
    `2. Scope — are you thinking cabinets only, or also trim, doors, or a combination?`,
    `3. Timeline — do you have a rough target date for delivery or installation?`,
    `4. Plans — if you have floor plans or drawings (even rough ones), please attach them. If not, no worries — we can work from photos and measurements.`,
    `5. Builder or contractor — are you working with a general contractor, or is this a direct project?`,
    ``,
    `Once we have that, we can set up a call or meeting to go through the details and discuss finishes, style, and scope.`,
    ``,
    `Looking forward to it,`,
    ``,
    `${data.yourName}`,
    `Advanced Cabinets`,
    `${data.yourPhone}`,
    data.yourEmail ?? "",
  ].join("\n");

  const html = layout({
    heading: "Thanks for reaching out.",
    body: [
      para(`Hi ${h(data.clientFirstName)},`),
      para(`Thanks for reaching out — we'd love to help with your project.`),
      para(`To get started, could you share a few details?`),
      `<ol style="font-size:13px;line-height:1.8;padding-left:18px;margin:0 0 16px;">
        <li><strong>Project address</strong> — where is the home or project located?</li>
        <li><strong>Scope</strong> — cabinets only, or also trim, doors, or a combination?</li>
        <li><strong>Timeline</strong> — rough target date for delivery or installation?</li>
        <li><strong>Plans</strong> — attach floor plans or drawings if you have them. Photos and measurements work too.</li>
        <li><strong>Builder or contractor</strong> — working with a GC, or is this a direct project?</li>
      </ol>`,
      para(`Once we have that, we can set up a call to go through the details and talk finishes, style, and scope.`),
      para(`Looking forward to it,`),
      `<p style="font-size:13px;margin:0;"><strong>${h(data.yourName)}</strong><br>
       Advanced Cabinets<br>
       <a href="tel:${h(data.yourPhone)}" style="color:${BRAND_NAVY};">${h(data.yourPhone)}</a>
       ${data.yourEmail ? `<br><a href="mailto:${h(data.yourEmail)}" style="color:${BRAND_NAVY};">${h(data.yourEmail)}</a>` : ""}
      </p>`,
    ].join(""),
  });

  return { subject, text, html };
}

/**
 * bid_sent
 * Sent to homeowner (and optionally builder) when a quote is ready.
 */
export function bidSent(data: {
  clientName: string;
  siteAddress: string;
  deliveryDate?: string;
  bidNumber?: string;
  note?: string;
  estimateUrl?: string;
  /** @deprecated use clientName */
  jobId?: string;
  /** @deprecated */
  clientFirstName?: string;
  /** @deprecated */
  pm?: string;
  pmPhone?: string;
  pmEmail?: string;
  quoteNotes?: string;
}): TemplateResult {
  const subject = `Your estimate is ready — Advanced Custom Cabinets`;
  const firstName = data.clientFirstName ?? data.clientName.split(" ")[0];
  const noteText = data.note ?? data.quoteNotes;

  const text = [
    `Hi ${firstName},`,
    ``,
    `Your estimate for ${data.siteAddress} is ready.`,
    data.estimateUrl ? `\nView your estimate online: ${data.estimateUrl}\n` : "",
    noteText ? `\nA note from your project manager:\n${noteText}\n` : "",
    `If you have any questions, reply to this email or call us any time.`,
    ``,
    `We look forward to working with you.`,
    ``,
    `Advanced Custom Cabinets`,
  ].join("\n");

  const html = layout({
    heading: "Your Estimate Is Ready",
    subheading: h(data.siteAddress),
    ctaLabel: data.estimateUrl ? "View Your Estimate →" : undefined,
    ctaUrl: data.estimateUrl,
    body: [
      para(`Hi ${h(firstName)},`),
      para(`Your estimate for <strong>${h(data.siteAddress)}</strong> is ready. Please review it at your convenience and let us know if you have any questions or would like to walk through it together.`),
      noteText ? highlight(h(noteText)) : "",
      infoTable([
        infoRow("Project", h(data.siteAddress)),
        data.deliveryDate ? infoRow("Target Delivery", fmtDate(data.deliveryDate)) : "",
        data.bidNumber ? infoRow("Quote #", h(data.bidNumber)) : "",
      ].filter(Boolean)),
      data.estimateUrl
        ? para(`<a href="${h(data.estimateUrl)}" style="color:${BRAND_NAVY};">Click here to view your estimate online</a> — or see the attached PDF if one is included.`)
        : para(`Please see the attached estimate document.`),
      para(`Reply to this email or call us any time — we're happy to walk through the numbers with you.`),
    ].join(""),
  });

  return { subject, text, html };
}

/**
 * final_design_sent
 * Sent when the final design package (updated quote + design) is ready for review.
 */
export function finalDesignSent(data: {
  jobId: string;
  clientName: string;
  clientFirstName: string;
  siteAddress: string;
  pm: string;
  pmPhone?: string;
  pmEmail?: string;
  notes?: string;
}): TemplateResult {
  const subject = `Your final design is ready for review — Advanced Cabinets`;

  const text = [
    `Hi ${data.clientFirstName},`,
    ``,
    `Your final design package for ${data.siteAddress} is attached — including updated drawings and a revised quote.`,
    ``,
    data.notes ? `Notes from your PM:\n${data.notes}\n` : "",
    `Please review everything carefully. Once you're happy with the design, the next step is signing off so we can move forward to production.`,
    ``,
    `Questions? Reply here or reach out directly to ${data.pm}${data.pmPhone ? ` at ${data.pmPhone}` : ""}.`,
    ``,
    `Advanced Cabinets`,
  ].join("\n");

  const html = layout({
    heading: "Your Final Design Is Ready",
    subheading: data.siteAddress,
    body: [
      para(`Hi ${h(data.clientFirstName)},`),
      para(`Your final design package for <strong>${h(data.siteAddress)}</strong> is attached — including updated drawings and a revised quote.`),
      data.notes ? highlight(h(data.notes)) : "",
      para(`Please review everything carefully. Once you're happy with the design, the next step is signing off so we can move forward to production.`),
      infoTable([
        infoRow("Your PM", `${h(data.pm)}${data.pmPhone ? ` &middot; <a href="tel:${h(data.pmPhone)}" style="color:${BRAND_NAVY};">${h(data.pmPhone)}</a>` : ""}`),
        data.pmEmail ? infoRow("", `<a href="mailto:${h(data.pmEmail)}" style="color:${BRAND_NAVY};">${h(data.pmEmail)}</a>`) : "",
      ]),
      para(`Questions? Reply to this email or call us — we're happy to walk through it.`),
    ].join(""),
  });

  return { subject, text, html };
}

/**
 * contract_sent
 * Sent with the full contract packet: final drawings, quote, and residential disclosure.
 */
export function contractSent(data: {
  clientName: string;
  siteAddress: string;
  signoffUrl?: string;
  notes?: string;
  /** @deprecated */
  jobId?: string;
  clientFirstName?: string;
  pm?: string;
  pmPhone?: string;
  pmEmail?: string;
}): TemplateResult {
  // derive first name if not provided
  data = { ...data, clientFirstName: data.clientFirstName ?? data.clientName.split(" ")[0] };
  const subject = `Contract documents enclosed — Advanced Cabinets`;

  const text = [
    `Hi ${data.clientFirstName},`,
    ``,
    `Attached are your contract documents for ${data.siteAddress}:`,
    `  - Final drawings`,
    `  - Quote / scope of work`,
    `  - Residential disclosure`,
    ``,
    `Please review and sign at the link below to authorize production:`,
    data.signoffUrl ? `  ${data.signoffUrl}` : `  (your PM will send a signing link separately)`,
    ``,
    data.notes ? `Notes from your PM:\n${data.notes}\n` : "",
    `Questions? Reply here or reach out to ${data.pm}${data.pmPhone ? ` at ${data.pmPhone}` : ""}.`,
    ``,
    `Advanced Cabinets`,
  ].join("\n");

  const html = layout({
    heading: "Contract Documents Enclosed",
    subheading: data.siteAddress,
    body: [
      para(`Hi ${h(data.clientFirstName)},`),
      para(`Attached are your contract documents for <strong>${h(data.siteAddress)}</strong>:`),
      `<ul style="font-size:13px;line-height:1.8;padding-left:18px;margin:0 0 16px;">
        <li>Final drawings</li>
        <li>Quote / scope of work</li>
        <li>Residential disclosure</li>
      </ul>`,
      para(`Please review carefully. When you're ready to authorize production, use the button below to review and sign.`),
      data.notes ? highlight(h(data.notes)) : "",
      infoTable([
        infoRow("Project", data.siteAddress),
        infoRow("Your PM", `${h(data.pm)}${data.pmPhone ? ` &middot; <a href="tel:${h(data.pmPhone)}" style="color:${BRAND_NAVY};">${h(data.pmPhone)}</a>` : ""}`),
        data.pmEmail ? infoRow("", `<a href="mailto:${h(data.pmEmail)}" style="color:${BRAND_NAVY};">${h(data.pmEmail)}</a>`) : "",
      ]),
      para(`Questions or concerns? Reply to this email or call us before signing.`),
    ].join(""),
    ctaLabel: data.signoffUrl ? "Review & Sign" : undefined,
    ctaUrl:   data.signoffUrl,
  });

  return { subject, text, html };
}

/**
 * released_to_production
 * Client-facing notification that their job has entered the shop floor.
 */
export function releasedToProduction(data: {
  jobId: string;
  clientFirstName: string;
  siteAddress: string;
  estimatedDeliveryDate?: string;
  pm: string;
  pmPhone?: string;
}): TemplateResult {
  const subject = `Your cabinets are in production — Advanced Cabinets`;

  const text = [
    `Hi ${data.clientFirstName},`,
    ``,
    `Great news — your project for ${data.siteAddress} has been released to our production team and is now being built.`,
    ``,
    data.estimatedDeliveryDate
      ? `Estimated delivery: ${fmtDate(data.estimatedDeliveryDate)}\n`
      : "",
    `We'll be in touch as your delivery date approaches. If you have any questions in the meantime, reach out to ${data.pm}${data.pmPhone ? ` at ${data.pmPhone}` : ""}.`,
    ``,
    `Advanced Cabinets`,
  ].join("\n");

  const html = layout({
    heading: "Your Cabinets Are in Production",
    subheading: data.siteAddress,
    body: [
      para(`Hi ${h(data.clientFirstName)},`),
      para(`Great news — your project for <strong>${h(data.siteAddress)}</strong> has been released to our production team and is now being built.`),
      data.estimatedDeliveryDate
        ? infoTable([infoRow("Estimated delivery", `<strong>${fmtDate(data.estimatedDeliveryDate)}</strong>`)])
        : "",
      para(`We'll be in touch as your delivery date approaches. Questions in the meantime? Reply to this email or reach out to your PM.`),
      infoTable([
        infoRow("Your PM", `${h(data.pm)}${data.pmPhone ? ` &middot; <a href="tel:${h(data.pmPhone)}" style="color:${BRAND_NAVY};">${h(data.pmPhone)}</a>` : ""}`),
      ]),
    ].join(""),
  });

  return { subject, text, html };
}

/**
 * ready_for_delivery
 * Client-facing: order is built and ready to ship/deliver.
 */
export function readyForDelivery(data: {
  clientFirstName: string;
  siteAddress: string;
  deliveryDate?: string;
  pm: string;
  pmPhone?: string;
  deliveryNotes?: string;
}): TemplateResult {
  const subject = `Your order is ready for delivery — Advanced Cabinets`;

  const text = [
    `Hi ${data.clientFirstName},`,
    ``,
    `Your cabinets for ${data.siteAddress} are complete and ready for delivery.`,
    ``,
    data.deliveryDate ? `Scheduled delivery: ${fmtDate(data.deliveryDate)}\n` : "",
    data.deliveryNotes ? `Delivery notes:\n${data.deliveryNotes}\n` : "",
    `Your PM will coordinate the specifics. Feel free to reach out with any questions.`,
    ``,
    `${data.pm}${data.pmPhone ? ` · ${data.pmPhone}` : ""}`,
    `Advanced Cabinets`,
  ].join("\n");

  const html = layout({
    heading: "Your Order Is Ready for Delivery",
    subheading: data.siteAddress,
    body: [
      para(`Hi ${h(data.clientFirstName)},`),
      para(`Your cabinets for <strong>${h(data.siteAddress)}</strong> are complete and ready for delivery.`),
      infoTable([
        data.deliveryDate ? infoRow("Scheduled delivery", `<strong>${fmtDate(data.deliveryDate)}</strong>`) : "",
        infoRow("Your PM", `${h(data.pm)}${data.pmPhone ? ` &middot; <a href="tel:${h(data.pmPhone)}" style="color:${BRAND_NAVY};">${h(data.pmPhone)}</a>` : ""}`),
      ]),
      data.deliveryNotes ? highlight(h(data.deliveryNotes)) : "",
      para(`Your PM will coordinate the delivery details. Reply to this email or call us with any questions.`),
    ].join(""),
  });

  return { subject, text, html };
}

/**
 * delivered
 * Confirms delivery has occurred.
 */
export function delivered(data: {
  clientFirstName: string;
  siteAddress: string;
  installDate?: string;
  pm: string;
  pmPhone?: string;
  notes?: string;
}): TemplateResult {
  const subject = `Delivery confirmed — Advanced Cabinets`;

  const text = [
    `Hi ${data.clientFirstName},`,
    ``,
    `Your cabinets have been delivered to ${data.siteAddress}.`,
    ``,
    data.installDate ? `Scheduled installation: ${fmtDate(data.installDate)}\n` : "",
    data.notes ? `${data.notes}\n` : "",
    `Please inspect everything when you have a chance and let us know if anything needs attention.`,
    ``,
    `${data.pm}${data.pmPhone ? ` · ${data.pmPhone}` : ""}`,
    `Advanced Cabinets`,
  ].join("\n");

  const html = layout({
    heading: "Delivery Confirmed",
    subheading: data.siteAddress,
    body: [
      para(`Hi ${h(data.clientFirstName)},`),
      para(`Your cabinets have been delivered to <strong>${h(data.siteAddress)}</strong>.`),
      infoTable([
        data.installDate ? infoRow("Scheduled install", `<strong>${fmtDate(data.installDate)}</strong>`) : "",
        infoRow("Your PM", `${h(data.pm)}${data.pmPhone ? ` &middot; <a href="tel:${h(data.pmPhone)}" style="color:${BRAND_NAVY};">${h(data.pmPhone)}</a>` : ""}`),
      ]),
      data.notes ? highlight(h(data.notes)) : "",
      para(`Please inspect everything when you have a chance. If anything needs attention, don't hesitate to reach out.`),
    ].join(""),
  });

  return { subject, text, html };
}

/**
 * install_complete
 * Final client notification. Includes warranty info.
 */
export function installComplete(data: {
  clientFirstName: string;
  clientName: string;
  siteAddress: string;
  pm: string;
  pmPhone?: string;
  pmEmail?: string;
  warrantyNotes?: string;
  warrantyYears?: number;
}): TemplateResult {
  const warrantyYears = data.warrantyYears ?? 1;
  const subject = `Installation complete — Advanced Cabinets`;

  const text = [
    `Hi ${data.clientFirstName},`,
    ``,
    `Installation is complete at ${data.siteAddress}. We hope you love the finished product.`,
    ``,
    `WARRANTY`,
    `Your cabinetry is covered by a ${warrantyYears}-year warranty on workmanship and materials.`,
    data.warrantyNotes ? `${data.warrantyNotes}` : "",
    `To make a warranty claim, contact your PM directly.`,
    ``,
    `It's been a pleasure working with you. We'd love to work together again.`,
    ``,
    `${data.pm}${data.pmPhone ? ` · ${data.pmPhone}` : ""}`,
    data.pmEmail ?? "",
    `Advanced Cabinets`,
  ].join("\n");

  const html = layout({
    heading: "Installation Complete",
    subheading: data.siteAddress,
    body: [
      para(`Hi ${h(data.clientFirstName)},`),
      para(`Installation is complete at <strong>${h(data.siteAddress)}</strong>. We hope you love the finished product.`),
      `<div style="background:#f0f7ff;border:1px solid #c7ddf7;border-radius:4px;padding:14px 16px;margin:16px 0;">
        <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#1e3a5f;font-weight:700;margin-bottom:8px;">Warranty</div>
        <p style="font-size:13px;line-height:1.6;margin:0 0 6px;">Your cabinetry is covered by a <strong>${warrantyYears}-year warranty</strong> on workmanship and materials.</p>
        ${data.warrantyNotes ? `<p style="font-size:12px;color:#555;margin:0;">${h(data.warrantyNotes)}</p>` : ""}
        <p style="font-size:12px;color:#555;margin:6px 0 0;">To make a warranty claim, contact your PM at the info below.</p>
       </div>`,
      infoTable([
        infoRow("Your PM", `${h(data.pm)}${data.pmPhone ? ` &middot; <a href="tel:${h(data.pmPhone)}" style="color:${BRAND_NAVY};">${h(data.pmPhone)}</a>` : ""}`),
        data.pmEmail ? infoRow("", `<a href="mailto:${h(data.pmEmail)}" style="color:${BRAND_NAVY};">${h(data.pmEmail)}</a>`) : "",
      ]),
      para(`It's been a pleasure working with you. We'd love to work together again.`),
    ].join(""),
  });

  return { subject, text, html };
}

// ─────────────────────────────────────────────────────────────────────────────
// BILLING templates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * invoice_sent
 * Emailed to the client (homeowner and/or builder) when PM sends an invoice.
 */
export function invoiceSent(data: {
  clientName: string;
  siteAddress: string;
  invoiceNumber: number | string;
  invoiceType: "deposit" | "balance" | "change_order" | "manual";
  lineItems: Array<{ description: string; amount: number }>;
  terms: string;
  notes?: string | null;
  jobUrl?: string;
}): TemplateResult {
  const { clientName, siteAddress, invoiceNumber, invoiceType, lineItems, terms, notes, jobUrl } = data;

  const typeLabel: Record<string, string> = {
    deposit:      "Deposit Invoice",
    balance:      "Balance Invoice",
    change_order: "Change Order Invoice",
    manual:       "Invoice",
  };
  const label = typeLabel[invoiceType] ?? "Invoice";

  const total = lineItems.reduce((sum, li) => sum + Number(li.amount), 0);

  const subject = `Invoice #${invoiceNumber} — Advanced Custom Cabinets — ${clientName}`;

  const text = [
    `${label} — Advanced Custom Cabinets`,
    ``,
    `Client: ${clientName}`,
    `Project: ${siteAddress}`,
    `Invoice #: ${invoiceNumber}`,
    `Terms: ${terms}`,
    ``,
    `Line Items:`,
    ...lineItems.map((li) => `  ${li.description}: $${Number(li.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`),
    ``,
    `Total Due: $${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
    ``,
    ...(notes ? [`Notes: ${notes}`, ``] : []),
    `Payment Instructions:`,
    `  Please remit payment by check payable to:`,
    `  Advanced Custom Cabinets`,
    `  PO Box TBD`,
    `  Please include your invoice number on the memo line.`,
    ``,
    `Questions? Contact your project manager.`,
  ].join("\n");

  // Build line items table rows
  const itemRows = lineItems.map((li) =>
    `<tr>
      <td style="padding:8px 14px 8px 0;font-size:13px;color:#333;">${h(li.description)}</td>
      <td style="padding:8px 0;font-size:13px;color:#333;text-align:right;white-space:nowrap;">$${Number(li.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
    </tr>`
  ).join("\n");

  const html = layout({
    heading: `${label} — Advanced Custom Cabinets`,
    subheading: h(clientName),
    ctaLabel: jobUrl ? "View Project Portal" : undefined,
    ctaUrl: jobUrl,
    body: `
      ${infoTable([
        infoRow("Invoice #", String(invoiceNumber)),
        infoRow("Project", h(siteAddress)),
        infoRow("Terms", h(terms)),
      ])}

      <table style="border-collapse:collapse;width:100%;margin-bottom:16px;">
        <thead>
          <tr style="border-bottom:2px solid #1e3a5f;">
            <th style="text-align:left;padding:6px 14px 6px 0;font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Description</th>
            <th style="text-align:right;padding:6px 0;font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
          <tr style="border-top:2px solid #1e3a5f;">
            <td style="padding:10px 14px 10px 0;font-size:14px;font-weight:700;color:#1e3a5f;">Total Due</td>
            <td style="padding:10px 0;font-size:14px;font-weight:700;color:#1e3a5f;text-align:right;">$${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
          </tr>
        </tbody>
      </table>

      ${notes ? highlight(h(notes)) : ""}

      ${para(`<strong>Payment Instructions:</strong><br>
        Please remit payment by check payable to:<br>
        <strong>Advanced Custom Cabinets</strong><br>
        PO Box TBD<br>
        Please include invoice number <strong>#${invoiceNumber}</strong> on the memo line.`)}

      ${para("Questions? Contact your project manager.")}
    `,
  });

  return { subject, text, html };
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL templates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * new_lead_alert
 * Internal notification when a new lead comes in via the contact form.
 */
export function newLeadAlert(data: {
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  projectType?: string;
  message?: string;
  source?: string;
}): TemplateResult {
  const subject = `New lead: ${data.clientName}`;

  const text = [
    `New inquiry received.`,
    ``,
    `Name:    ${data.clientName}`,
    `Email:   ${data.clientEmail}`,
    data.clientPhone ? `Phone:   ${data.clientPhone}` : "",
    data.projectType ? `Type:    ${data.projectType}` : "",
    data.source ? `Source:  ${data.source}` : "",
    ``,
    data.message ? `Message:\n${data.message}` : "",
  ].filter(Boolean).join("\n");

  const html = layout({
    heading: "New Lead",
    subheading: data.clientName,
    body: [
      infoTable([
        infoRow("Name", `<strong>${h(data.clientName)}</strong>`),
        infoRow("Email", `<a href="mailto:${h(data.clientEmail)}" style="color:${BRAND_NAVY};">${h(data.clientEmail)}</a>`),
        data.clientPhone ? infoRow("Phone", `<a href="tel:${h(data.clientPhone)}" style="color:${BRAND_NAVY};">${h(data.clientPhone)}</a>`) : "",
        data.projectType ? infoRow("Type", h(data.projectType)) : "",
        data.source ? infoRow("Source", h(data.source)) : "",
      ]),
      data.message ? `<div style="background:#f9f9f9;border:1px solid #eee;border-radius:4px;padding:12px 14px;font-size:13px;line-height:1.6;margin-top:4px;"><strong>Message:</strong><br>${h(data.message)}</div>` : "",
    ].join(""),
    ctaLabel: "Open Admin",
    ctaUrl: "https://www.advancedcabinets.org/admin/leads",
  });

  return { subject, text, html };
}

/**
 * schedule_date_changed
 * Internal alert when an install or delivery date shifts.
 * Goes to a configurable group.
 */
export function scheduleDateChanged(data: {
  jobId: string;
  jobNumber?: string;
  clientName: string;
  siteAddress: string;
  eventType: string;
  oldDate?: string;
  newDate?: string;
  changedBy: string;
  reason?: string;
  jobUrl?: string;
}): TemplateResult {
  const jobRef = `Job ${data.jobNumber ?? data.jobId} — ${data.clientName}`;
  const subject = `Schedule change: ${jobRef}`;

  const text = [
    `Schedule change — ${jobRef}`,
    ``,
    `Event:    ${data.eventType}`,
    data.oldDate ? `Was:      ${fmtDate(data.oldDate)}` : "",
    data.newDate ? `Now:      ${fmtDate(data.newDate)}` : "",
    ``,
    `Changed by: ${data.changedBy}`,
    data.reason ? `Reason:   ${data.reason}` : "",
  ].filter(Boolean).join("\n");

  const html = layout({
    heading: `Schedule Change`,
    subheading: jobRef,
    body: `
      <p><strong>Event:</strong> ${h(data.eventType)}</p>
      ${data.oldDate ? `<p><strong>Was:</strong> ${h(fmtDate(data.oldDate))}</p>` : ""}
      ${data.newDate ? `<p><strong>Now:</strong> ${h(fmtDate(data.newDate))}</p>` : ""}
      <p><strong>Changed by:</strong> ${h(data.changedBy)}</p>
      ${data.reason ? `<p><strong>Reason:</strong> ${h(data.reason)}</p>` : ""}
    `,
    ctaLabel: data.jobUrl ? "View Job" : undefined,
    ctaUrl: data.jobUrl,
  });

  return { subject, text, html };
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION_TRIGGERS — registry of all trigger types for settings UI
// ─────────────────────────────────────────────────────────────────────────────

export const NOTIFICATION_TRIGGERS: NotificationTrigger[] = [
  {
    id: "bid_sent",
    label: "Bid Sent",
    description: "When a bid email is sent to a client",
    defaultRecipients: ["pm", "residential"],
    status: "built",
  },
  {
    id: "contract_sent",
    label: "Contract Sent",
    description: "When a contract packet is emailed to a client for signature",
    defaultRecipients: ["pm", "residential"],
    status: "built",
  },
  {
    id: "released_to_production",
    label: "Released to Production",
    description: "When a job advances to the shop production queue",
    defaultRecipients: ["engineering", "shop"],
    status: "built",
  },
  {
    id: "ready_for_delivery",
    label: "Ready for Delivery",
    description: "When a job is marked ready for customer delivery",
    defaultRecipients: ["pm", "installer"],
    status: "built",
  },
  {
    id: "delivered",
    label: "Delivered",
    description: "When a job is marked as delivered to the customer",
    defaultRecipients: ["pm"],
    status: "built",
  },
  {
    id: "install_complete",
    label: "Install Complete",
    description: "When the installation is marked complete",
    defaultRecipients: ["pm", "homeowner"],
    status: "built",
  },
  {
    id: "invoice_sent",
    label: "Invoice Sent",
    description: "When an invoice is emailed to a client",
    defaultRecipients: ["pm"],
    status: "built",
  },
  {
    id: "schedule_date_changed",
    label: "Schedule Date Changed",
    description: "When a scheduled install date is moved",
    defaultRecipients: ["pm", "installer"],
    status: "built",
  },
  {
    id: "lead_inquiry_response",
    label: "Lead Inquiry Response",
    description: "Response email to a new inquiry",
    defaultRecipients: ["residential"],
    status: "built",
  },
  {
    id: "new_lead_alert",
    label: "New Lead Alert",
    description: "Internal alert when a new lead is logged",
    defaultRecipients: ["pm", "residential"],
    status: "built",
  },
];
