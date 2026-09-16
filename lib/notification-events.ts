/**
 * lib/notification-events.ts — every automated email, and who it goes to.
 *
 * WHY THIS FILE EXISTS.
 *
 * There was no single place that said who gets emailed when. Recipients were
 * decided in fifteen different files: some from an env var, some from a column
 * on the job, and six from an address typed into the source
 * (`joshl@advancedcabinets.net`, `residential@advancedcabinets.net`,
 * `karlv@advancedcabinets.net`). Changing who receives the engineering release
 * meant editing a route and deploying. Answering "who gets the delivery email?"
 * meant reading the code.
 *
 * So this is the registry: one row per email the system can send, naming the
 * trigger, the audience, and the default recipients as ROLES rather than
 * addresses. A role resolves against the job at send time — `client` is that
 * job's client, `builder` is that job's builder — and the admin screen can
 * override the roles and the fixed addresses per event without a deploy.
 *
 * Roles, not addresses, is the whole point. "The engineering release goes to
 * the engineer" survives Josh changing his email or a second engineer being
 * hired. "It goes to joshl@" does not.
 *
 * Pure data. No database, no imports — so the admin screen, the resolver and
 * the tests all read the same list.
 */

/** Who an address belongs to, rather than what the address is. */
export type NotificationRole =
  | "client"      // the homeowner on the job
  | "builder"     // the builder company's contact
  | "pm"          // the job's project manager
  | "engineer"    // engineering
  | "shop"        // the shop floor
  | "residential" // the residential department inbox
  | "karl"        // the owner
  | "sender";     // whoever pressed the button

export const NOTIFICATION_ROLES: NotificationRole[] = [
  "client", "builder", "pm", "engineer", "shop", "residential", "karl", "sender",
];

export const ROLE_LABEL: Record<NotificationRole, string> = {
  client: "Client (from the job)",
  builder: "Builder contact (from the job)",
  pm: "Project manager (from the job)",
  engineer: "Engineering",
  shop: "Shop",
  residential: "Residential department",
  karl: "Karl",
  sender: "Whoever pressed the button",
};

/*
  "both" exists because two transitions now send two different messages.

  Releasing to engineering tells engineering internally AND tells the client
  their design is final; releasing to production tells the shop AND tells the
  client their cabinets are being built. Filing either one under "internal"
  hides a customer-facing email on the settings screen, under a heading that
  says "these stay inside ACC" — which is exactly how somebody turns test mode
  off believing no client is on that route.
*/
export type NotificationAudience = "client" | "builder" | "internal" | "both";

export type NotificationEvent = {
  key: string;
  label: string;
  /** What the person did, in their words, not the route's. */
  trigger: string;
  audience: NotificationAudience;
  toRoles: NotificationRole[];
  /** Addresses currently written into the source, carried over as the default. */
  toFixed?: string[];
  ccRoles?: NotificationRole[];
  ccFixed?: string[];
  /** False when the code for it exists but nothing sends it today. */
  implemented: boolean;
  note?: string;
};

/**
 * Every automated email, in the order a job meets them.
 *
 * `toFixed` entries are the hardcoded addresses as they stand today — listed
 * here so the admin screen shows the truth on first load rather than an
 * aspiration, and so moving them into settings does not quietly change who is
 * emailed on the way past.
 */
export const NOTIFICATION_EVENTS: NotificationEvent[] = [
  {
    key: "express_order",
    label: "Express order received",
    trigger: "A builder submits an order through the Express wizard",
    audience: "internal",
    toRoles: ["residential"],
    implemented: true,
    note: "The only send that ignores TEST_EMAIL_OVERRIDE today.",
  },
  {
    key: "lead_alert",
    label: "New lead",
    trigger: "A lead is captured on the admin leads page",
    audience: "internal",
    toRoles: ["residential"],
    implemented: true,
  },
  {
    key: "lead_response",
    label: "Lead response",
    trigger: "An admin sends the reply to a lead enquiry",
    audience: "client",
    toRoles: ["client"],
    implemented: true,
    note: "The address is typed by the admin, not read from a job.",
  },
  {
    key: "bid_sent",
    label: "Bid / estimate sent",
    trigger: "Send Bid on the job page",
    audience: "client",
    toRoles: ["client"],
    implemented: true,
  },
  {
    key: "contract_sent",
    label: "Contract sent for signature",
    trigger: "Send Contract on the job page",
    audience: "client",
    toRoles: ["client"],
    implemented: true,
  },
  {
    key: "signoff_signed",
    label: "Client signed the contract",
    trigger: "The client submits their signature on the signoff page",
    audience: "internal",
    toRoles: ["pm", "residential"],
    implemented: true,
  },
  {
    key: "advance.engineering",
    label: "Released to engineering, and the client hears the design is final",
    trigger: "Advance → Engineering on the job page",
    audience: "both",
    toRoles: ["engineer", "client"],
    ccRoles: ["residential", "pm"],
    implemented: true,
    note: "Engineering gets the internal note; the client gets the branded \"your final design is ready\" email. Two different messages from one transition.",
  },
  {
    key: "engineering_release",
    label: "Engineering release packet",
    trigger: "Release on the Engineering Release panel — the checklist one",
    audience: "internal",
    toRoles: ["engineer"],
    toFixed: ["joshl@advancedcabinets.net"],
    ccRoles: ["residential", "sender"],
    ccFixed: ["residential@advancedcabinets.net"],
    implemented: true,
    note: "Both addresses are written into the route today.",
  },
  {
    key: "advance.production",
    label: "Released to production, and the client hears their cabinets are being built",
    trigger: "Advance → Production on the job page",
    audience: "both",
    toRoles: ["shop", "client"],
    implemented: true,
    note: "The shop gets the internal note; the client gets the branded \"your cabinets are in production\" email. Until 2026-09-16 the client was told nothing at this point.",
  },
  {
    key: "advance.delivery",
    label: "Out for delivery",
    trigger: "Advance → Delivery on the job page",
    audience: "client",
    toRoles: ["client", "pm"],
    implemented: true,
  },
  {
    key: "advance.install",
    label: "Ready for install",
    trigger: "Advance → Install on the job page",
    audience: "internal",
    toRoles: ["pm"],
    implemented: true,
    note: "The dialog says the install crew is notified. There is no crew address to send to yet.",
  },
  {
    key: "advance.punch",
    label: "Punch list follow-up",
    trigger: "Advance → Punch on the job page",
    audience: "client",
    toRoles: ["client", "pm"],
    implemented: true,
  },
  {
    key: "advance.complete",
    label: "Project complete",
    trigger: "Advance → Complete on the job page",
    audience: "client",
    toRoles: ["client", "pm"],
    implemented: true,
  },
  {
    key: "invoice_sent",
    label: "Invoice sent",
    trigger: "Send on an invoice",
    audience: "client",
    toRoles: ["client"],
    implemented: true,
  },
  {
    key: "portal_welcome",
    label: "Builder portal — welcome",
    trigger: "An admin creates a builder portal account",
    audience: "builder",
    toRoles: ["builder"],
    implemented: false,
    note: "Sends an empty message today — the mailer is called with arguments it does not have.",
  },
  {
    key: "portal_password_reset",
    label: "Builder portal — password reset",
    trigger: "An admin resets a builder portal password",
    audience: "builder",
    toRoles: ["builder"],
    implemented: false,
    note: "Same empty-message bug as the welcome email.",
  },
  {
    key: "portal_input_received",
    label: "Builder portal — input received",
    trigger: "An admin marks a required input received",
    audience: "builder",
    toRoles: ["builder"],
    implemented: true,
  },
  {
    key: "portal_comment",
    label: "Builder portal — comment from ACC",
    trigger: "An admin replies on a drawing comment",
    audience: "builder",
    toRoles: ["builder"],
    implemented: true,
  },
  {
    key: "bug_report",
    label: "Bug report",
    trigger: "Someone submits the in-app bug form",
    audience: "internal",
    toRoles: ["karl"],
    toFixed: ["karlv@advancedcabinets.net"],
    implemented: true,
  },
  {
    key: "bug_digest",
    label: "Open bugs digest",
    trigger: "Weekday mornings, 7am",
    audience: "internal",
    toRoles: ["karl"],
    toFixed: ["karlv@advancedcabinets.net"],
    implemented: true,
  },
  {
    key: "schedule_changed",
    label: "Schedule date changed",
    trigger: "An install or delivery date moves, and the notify box is ticked",
    audience: "internal",
    toRoles: ["pm"],
    implemented: true,
    note: "Fires only when \"Email the PM that the date moved\" is ticked on the make-it-official prompt. Dragging a card around the board never emails anyone.",
  },
  {
    key: "change_request",
    label: "Builder change request",
    trigger: "A builder submits a change request through the portal",
    audience: "internal",
    toRoles: ["pm"],
    implemented: false,
    note: "Nothing is sent — the PM only finds out by opening the job.",
  },
];

export const EVENT_BY_KEY: Record<string, NotificationEvent> =
  Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e.key, e]));

export function isNotificationEvent(key: string): boolean {
  return key in EVENT_BY_KEY;
}
