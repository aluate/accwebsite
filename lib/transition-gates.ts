/**
 * lib/transition-gates.ts
 *
 * Defines the gate config for each status transition:
 *   - what document (if any) the PM should upload before advancing
 *   - whether the doc is required (hard gate) or optional (soft gate)
 *   - what emails fire and to whom
 *   - whether WO filenames should be auto-parsed (WO*.pdf, CO*.pdf)
 *
 * Recipient keys:
 *   "client"      — job.client_email
 *   "pm"          — process.env.PM_EMAIL
 *   "eng"         — process.env.ENG_EMAIL       (falls back to PM_EMAIL)
 *   "shop"        — process.env.SHOP_EMAIL      (falls back to PM_EMAIL)
 *   "residential" — process.env.RESIDENTIAL_EMAIL (falls back to PM_EMAIL)
 */

export type JobMeta = {
  id: string;
  job_number?: string | null;
  client_name: string;
  client_email?: string | null;
  site_address?: string | null;
  city?: string | null;
  pm?: string | null;
};

export type RecipientKey = "client" | "pm" | "eng" | "shop" | "residential";

export type GateConfig = {
  /** Button label shown on the job detail page */
  buttonLabel: string;
  /** Heading inside the modal */
  modalHeading: string;
  /** Short description shown in the modal */
  modalDesc: string;
  /** job_files.kind for the doc uploaded at this gate (undefined = no doc gate) */
  docKind?: string;
  /** Human label for the doc in the upload UI */
  docLabel?: string;
  /** Hard gate: can't advance without at least one file. Default false (soft). */
  docRequired?: boolean;
  /** Parse WO/CO numbers from uploaded filenames (WO46317.pdf, CO47306.pdf) */
  woUpload?: boolean;
  /** Primary To: recipients on this transition */
  recipients: RecipientKey[];
  /** CC: recipients (combined into one email with the primary recipients) */
  ccKeys?: RecipientKey[];
  /** Email subject line */
  subject: (job: JobMeta) => string;
  /** Email body text (plain-text fallback) */
  body: (job: JobMeta, note?: string) => string;
};

/** Status progression order (excludes on_hold) */
export const STATUS_SEQUENCE = [
  "intake", "bid", "design", "field_dims",
  "engineering", "procurement",
  "production", "delivery",
  "install", "punch", "complete",
] as const;

export type JobStatus = typeof STATUS_SEQUENCE[number] | "on_hold";

/** Returns the next status in the sequence, or null if already at the end */
export function nextStatus(current: string): string | null {
  const idx = STATUS_SEQUENCE.indexOf(current as typeof STATUS_SEQUENCE[number]);
  if (idx === -1 || idx === STATUS_SEQUENCE.length - 1) return null;
  return STATUS_SEQUENCE[idx + 1];
}

function jobRef(job: JobMeta) {
  return `Job ${job.job_number ?? job.id} — ${job.client_name}`;
}
function jobAddress(job: JobMeta) {
  return [job.site_address, job.city].filter(Boolean).join(", ") || "—";
}

/** Gate config keyed by the STATUS the job is advancing TO */
export const TRANSITION_GATES: Partial<Record<string, GateConfig>> = {

  engineering: {
    buttonLabel: "Release to Engineering",
    modalHeading: "Release to Engineering",
    modalDesc: "Upload the finalized design drawings, then notify the engineering team.",
    docKind: "05_drawings",
    docLabel: "Finalized Design Drawings",
    docRequired: false,
    recipients: ["eng"],
    ccKeys: ["residential", "pm"],
    subject: (j) => `${jobRef(j)} — Released to Engineering`,
    body: (j, note) =>
      `${jobRef(j)} has been released to Engineering.\n\n` +
      `Address: ${jobAddress(j)}\n` +
      `PM: ${j.pm ?? "—"}\n` +
      (note ? `\nNote: ${note}\n` : "") +
      `\nPlease check the job portal for drawings and the spec summary below.\n`,
  },

  production: {
    buttonLabel: "Release to Production",
    modalHeading: "Release to Production",
    modalDesc: "Upload ShopPAK Work Order PDFs (WO####.pdf, CO####.pdf). WO numbers are auto-detected from filenames.",
    docKind: "14_wo_pdfs",
    docLabel: "ShopPAK Work Order PDFs",
    docRequired: false,
    woUpload: true,
    recipients: ["shop"],
    subject: (j) => `${jobRef(j)} — Released to Production`,
    body: (j, note) =>
      `${jobRef(j)} has been released to Production.\n\n` +
      `Address: ${jobAddress(j)}\n` +
      `PM: ${j.pm ?? "—"}\n` +
      (note ? `\nNote: ${note}\n` : "") +
      `\nWork orders are attached. Please review and schedule accordingly.\n`,
  },

  delivery: {
    buttonLabel: "Mark as Out for Delivery",
    modalHeading: "Mark as Out for Delivery",
    modalDesc: "Upload the ship ticket or bill of lading. The client will be notified that their order is on its way.",
    docKind: "14_ship_ticket",
    docLabel: "Ship Ticket / Bill of Lading",
    docRequired: false,
    recipients: ["client", "pm"],
    subject: (j) => `${j.client_name} — Your cabinets are on their way`,
    body: (j, note) =>
      `Hi ${j.client_name},\n\n` +
      `Your cabinet order is being delivered.\n\n` +
      `Job: ${j.job_number ?? j.id}\n` +
      `Site: ${jobAddress(j)}\n` +
      (note ? `\n${note}\n` : "") +
      `\nIf you have any questions, please contact your project manager.\n\n` +
      `Advanced Custom Cabinets\n`,
  },

  install: {
    buttonLabel: "Release to Install",
    modalHeading: "Release to Install",
    modalDesc: "Upload install drawings. The install crew and PM will be notified.",
    docKind: "14_install_drawings",
    docLabel: "Install Drawings",
    docRequired: false,
    recipients: ["pm"],
    subject: (j) => `${jobRef(j)} — Ready for Install`,
    body: (j, note) =>
      `${jobRef(j)} is ready for install.\n\n` +
      `Address: ${jobAddress(j)}\n` +
      (note ? `\nNote: ${note}\n` : "") +
      `\nInstall drawings are attached.\n`,
  },

  punch: {
    buttonLabel: "Begin Punch",
    modalHeading: "Begin Punch",
    modalDesc: "Upload the punch list. The client and PM will be notified.",
    docKind: "11_punch_list",
    docLabel: "Punch List",
    docRequired: false,
    recipients: ["client", "pm"],
    subject: (j) => `${j.client_name} — Punch list follow-up`,
    body: (j, note) =>
      `Hi ${j.client_name},\n\n` +
      `We are completing the final punch list for your project.\n\n` +
      `Site: ${jobAddress(j)}\n` +
      (note ? `\n${note}\n` : "") +
      `\nWe will be in touch to coordinate timing.\n\n` +
      `Advanced Custom Cabinets\n`,
  },

  complete: {
    buttonLabel: "Mark Complete",
    modalHeading: "Mark Complete",
    modalDesc: "Upload any closeout or signoff documents. The client will receive a completion notice.",
    docKind: "15_contract",
    docLabel: "Signoff / Closeout Document",
    docRequired: false,
    recipients: ["client", "pm"],
    subject: (j) => `${j.client_name} — Project complete`,
    body: (j, note) =>
      `Hi ${j.client_name},\n\n` +
      `Your project at ${jobAddress(j)} is now complete.\n\n` +
      `Job: ${j.job_number ?? j.id}\n` +
      (note ? `\n${note}\n` : "") +
      `\nThank you for choosing Advanced Custom Cabinets.\n`,
  },
};
