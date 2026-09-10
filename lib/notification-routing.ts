/**
 * lib/notification-routing.ts — resolving who an email actually goes to, and
 * the test mode that puts all of it in one person's inbox.
 *
 * Two jobs, deliberately in one file because they are the same decision made
 * twice:
 *
 *   1. resolveRecipients() — turn an event key plus a job's people into real
 *      addresses, using the admin overrides when they exist and the defaults in
 *      lib/notification-events.ts when they do not.
 *
 *   2. applyTestRouting() — while testing, send everything to the tester
 *      instead, by role, so a run through the whole lifecycle lands as four
 *      readable inboxes rather than in a client's.
 *
 * WHY TEST MODE IS NOT JUST TEST_EMAIL_OVERRIDE.
 *
 * That env var exists and redirects every message to one address. Two problems:
 * one inbox cannot tell you whether the delivery notice went to the client or
 * the PM, which is the thing worth checking; and the Express order path does
 * not read it at all, so one send escapes. This routes per role, applies to
 * every send that goes through the mailer, and says on the message itself where
 * it would really have gone.
 *
 * THE FAILURE MODE THAT MATTERS.
 *
 * If the test-mode lookup throws, the safe answer depends on what we knew last.
 * Never having seen test mode on, we send normally — a database blip must not
 * block a real job's email. Having seen it on, we keep it on until we can read
 * otherwise, because the cost of guessing wrong in that direction is a real
 * client receiving a test message.
 */

import { sql } from "@/lib/db";
import {
  EVENT_BY_KEY,
  NOTIFICATION_EVENTS,
  type NotificationEvent,
  type NotificationRole,
} from "@/lib/notification-events";

export type RouteOverride = {
  event_key: string;
  to_roles: NotificationRole[];
  to_fixed: string[];
  cc_roles: NotificationRole[];
  cc_fixed: string[];
  enabled: boolean;
};

export type TestMode = {
  active: boolean;
  /** role -> the address that stands in for it while testing */
  addresses: Partial<Record<NotificationRole, string>>;
  fallback: string | null;
};

/** The addresses a specific job (or context) resolves its roles to. */
export type RoleAddresses = Partial<Record<NotificationRole, string | null | undefined>>;

/* ── pure helpers ─────────────────────────────────────────────────────────── */

const clean = (list: (string | null | undefined)[]): string[] => {
  const out: string[] = [];
  for (const raw of list) {
    const v = (raw ?? "").trim();
    if (!v) continue;
    if (!out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out;
};

/** The event's defaults, with any stored override applied on top. */
export function effectiveRoute(
  event: NotificationEvent,
  override: RouteOverride | undefined,
): { toRoles: NotificationRole[]; toFixed: string[]; ccRoles: NotificationRole[]; ccFixed: string[]; enabled: boolean } {
  if (!override) {
    return {
      toRoles: event.toRoles ?? [],
      toFixed: event.toFixed ?? [],
      ccRoles: event.ccRoles ?? [],
      ccFixed: event.ccFixed ?? [],
      enabled: true,
    };
  }
  return {
    toRoles: override.to_roles,
    toFixed: override.to_fixed,
    ccRoles: override.cc_roles,
    ccFixed: override.cc_fixed,
    enabled: override.enabled,
  };
}

export type ResolvedRecipients = {
  to: string[];
  cc: string[];
  enabled: boolean;
  /** Roles that had no address on this job — worth showing, never worth guessing. */
  unresolved: NotificationRole[];
  /**
   * Which role each address came from, lower-cased. One message can carry two
   * roles — the delivery notice goes to the client AND the PM — and test mode
   * has to split those into different inboxes to be worth anything.
   */
  roleByAddress: Record<string, NotificationRole>;
};

/** Roles + fixed addresses -> the actual list, with the misses reported. */
export function resolveAddresses(
  route: { toRoles: NotificationRole[]; toFixed: string[]; ccRoles: NotificationRole[]; ccFixed: string[]; enabled: boolean },
  people: RoleAddresses,
): ResolvedRecipients {
  const unresolved: NotificationRole[] = [];
  const roleByAddress: Record<string, NotificationRole> = {};
  const pick = (roles: NotificationRole[]) =>
    roles.map((r) => {
      const addr = (people[r] ?? "").toString().trim();
      if (!addr) { unresolved.push(r); return ""; }
      const key = addr.toLowerCase();
      if (!(key in roleByAddress)) roleByAddress[key] = r;
      return addr;
    });

  return {
    to: clean([...pick(route.toRoles), ...route.toFixed]),
    cc: clean([...pick(route.ccRoles), ...route.ccFixed]),
    enabled: route.enabled,
    unresolved: [...new Set(unresolved)],
    roleByAddress,
  };
}

export type TestRoutingResult = {
  to: string[];
  cc: string[];
  /** Prefix for the subject line, empty when test mode is off. */
  subjectPrefix: string;
  /** A line to append to the body so the real recipients are visible. */
  bodyNote: string;
  redirected: boolean;
};

/**
 * Put the message in the tester's hands instead of the real recipient's.
 *
 * Every address is mapped by the ROLE it came from, so the four inboxes stay
 * distinguishable: the client copy lands in the pseudo-client inbox, the
 * builder copy in the pseudo-builder one. An address whose role has no test
 * mapping goes to the fallback rather than out of the building.
 */
export function applyTestRouting(
  mode: TestMode,
  input: { to: string[]; cc: string[]; roleOf?: (address: string) => NotificationRole | undefined; audience?: NotificationRole },
): TestRoutingResult {
  if (!mode.active) {
    return { to: input.to, cc: input.cc, subjectPrefix: "", bodyNote: "", redirected: false };
  }

  const mapOne = (address: string): string => {
    const role = input.roleOf?.(address) ?? input.audience;
    const mapped = (role && mode.addresses[role]) || mode.fallback || "";
    return mapped || address;
  };

  const to = clean(input.to.map(mapOne));
  const cc: string[] = []; // cc is folded into to while testing — one inbox, no confusion
  const realTo = input.to.join(", ") || "(nobody)";
  const realCc = input.cc.length ? ` · cc ${input.cc.join(", ")}` : "";

  return {
    to: to.length ? to : clean([mode.fallback ?? ""]),
    cc,
    subjectPrefix: "[TEST] ",
    bodyNote:
      `\n\n— — —\nTEST MODE. In production this would have gone to: ${realTo}${realCc}.\n` +
      `Turn it off at /admin/notifications.`,
    redirected: true,
  };
}

/* ── database ─────────────────────────────────────────────────────────────── */

/*
  jsonb comes back as an object when it was written as one and as a STRING when
  it was written with JSON.stringify and cast — which is what the first version
  of the writer below did, so every stored route read back empty and every
  override silently did nothing. The writer is fixed; these stay tolerant so
  rows written by the broken version still work.
*/
const asJson = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return null; }
};
const asArray = (v: unknown): string[] => {
  const j = asJson(v);
  return Array.isArray(j) ? j.map(String) : [];
};
const asObject = (v: unknown): Record<string, string> => {
  const j = asJson(v);
  return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, string>) : {};
};

export async function loadRouteOverrides(): Promise<Record<string, RouteOverride>> {
  try {
    const rows = await sql<Array<{
      event_key: string; to_roles: unknown; to_fixed: unknown;
      cc_roles: unknown; cc_fixed: unknown; enabled: number;
    }>>`SELECT event_key, to_roles, to_fixed, cc_roles, cc_fixed, enabled FROM notification_routes`;
    const out: Record<string, RouteOverride> = {};
    for (const r of rows) {
      out[r.event_key] = {
        event_key: r.event_key,
        to_roles: asArray(r.to_roles) as NotificationRole[],
        to_fixed: asArray(r.to_fixed),
        cc_roles: asArray(r.cc_roles) as NotificationRole[],
        cc_fixed: asArray(r.cc_fixed),
        enabled: Number(r.enabled) === 1,
      };
    }
    return out;
  } catch (e) {
    console.error("[notifications] could not read routes, using defaults:", e);
    return {};
  }
}

export async function saveRouteOverride(route: RouteOverride): Promise<void> {
  await sql`
    INSERT INTO notification_routes (event_key, to_roles, to_fixed, cc_roles, cc_fixed, enabled, updated_at)
    VALUES (
      ${route.event_key},
      ${sql.json(route.to_roles)}, ${sql.json(route.to_fixed)},
      ${sql.json(route.cc_roles)}, ${sql.json(route.cc_fixed)},
      ${route.enabled ? 1 : 0}, ${new Date().toISOString()}
    )
    ON CONFLICT (event_key) DO UPDATE SET
      to_roles = EXCLUDED.to_roles, to_fixed = EXCLUDED.to_fixed,
      cc_roles = EXCLUDED.cc_roles, cc_fixed = EXCLUDED.cc_fixed,
      enabled  = EXCLUDED.enabled,  updated_at = EXCLUDED.updated_at
  `;
}

/*
  Test mode is read on nearly every send, so it is cached briefly. The cache is
  short because someone switching it off expects the next email to behave, and
  `lastKnownActive` is what makes a failed read fail safe rather than fail open.
*/
let cache: { at: number; mode: TestMode } | null = null;
let lastKnownActive = false;
const CACHE_MS = 15_000;

export async function loadTestMode(force = false): Promise<TestMode> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.mode;
  try {
    const [row] = await sql<Array<{ active: number; role_addresses: unknown; fallback_address: string | null }>>`
      SELECT active, role_addresses, fallback_address FROM notification_test_mode WHERE id = 1
    `;
    const mode: TestMode = {
      active: Number(row?.active ?? 0) === 1,
      addresses: asObject(row?.role_addresses) as Partial<Record<NotificationRole, string>>,
      fallback: row?.fallback_address ?? null,
    };
    lastKnownActive = mode.active;
    cache = { at: Date.now(), mode };
    return mode;
  } catch (e) {
    console.error("[notifications] could not read test mode:", e);
    if (lastKnownActive) {
      // It was on the last time we could see. Keep redirecting rather than
      // letting a database blip put a test message in a client's inbox.
      return { active: true, addresses: cache?.mode.addresses ?? {}, fallback: cache?.mode.fallback ?? null };
    }
    return { active: false, addresses: {}, fallback: null };
  }
}

export async function saveTestMode(mode: TestMode): Promise<void> {
  await sql`
    INSERT INTO notification_test_mode (id, active, role_addresses, fallback_address, updated_at)
    VALUES (1, ${mode.active ? 1 : 0}, ${sql.json(mode.addresses)}, ${mode.fallback}, ${new Date().toISOString()})
    ON CONFLICT (id) DO UPDATE SET
      active = EXCLUDED.active, role_addresses = EXCLUDED.role_addresses,
      fallback_address = EXCLUDED.fallback_address, updated_at = EXCLUDED.updated_at
  `;
  cache = null;
  lastKnownActive = mode.active;
}

/**
 * The whole decision for one send: who gets it, given the job's people.
 *
 * Test-mode redirection is NOT applied here — it happens in the mailer, so it
 * also covers the call sites that have not been moved onto this resolver yet.
 * Nothing escapes because someone forgot.
 */
export async function resolveRecipients(
  eventKey: string,
  people: RoleAddresses,
): Promise<ResolvedRecipients> {
  const event = EVENT_BY_KEY[eventKey];
  if (!event) {
    console.error(`[notifications] unknown event "${eventKey}" — falling back to the residential inbox`);
    return { to: clean([people.residential]), cc: [], enabled: true, unresolved: [], roleByAddress: {} };
  }
  const overrides = await loadRouteOverrides();
  return resolveAddresses(effectiveRoute(event, overrides[eventKey]), people);
}

/**
 * The addresses a job's roles resolve to.
 *
 * The department inboxes come from environment variables, as they always have;
 * the client and builder come off the job. Kept in one place so every send
 * agrees about who "the shop" is, instead of each route reading its own env var
 * with its own fallback.
 */
export function jobRoleAddresses(
  job: {
    client_email?: string | null;
    builder_email?: string | null;
    // Routes select different columns; an index signature lets any job row in
    // without each one having to widen its own query first.
    [key: string]: unknown;
  },
  extra?: { sender?: string | null },
): RoleAddresses {
  const pm = process.env.PM_EMAIL ?? null;
  return {
    client: (job.client_email as string | null | undefined) ?? null,
    builder: (job.builder_email as string | null | undefined) ?? null,
    pm,
    engineer: process.env.ENG_EMAIL ?? pm,
    shop: process.env.SHOP_EMAIL ?? pm,
    residential: process.env.RESIDENTIAL_EMAIL ?? pm,
    karl: process.env.KARL_EMAIL ?? "karlv@advancedcabinets.net",
    sender: extra?.sender ?? null,
  };
}

/** Everything the admin screen needs, defaults and overrides in one shape. */
export async function loadAllRoutes() {
  const overrides = await loadRouteOverrides();
  return NOTIFICATION_EVENTS.map((event) => ({
    event,
    route: effectiveRoute(event, overrides[event.key]),
    overridden: !!overrides[event.key],
  }));
}
