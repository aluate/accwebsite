export const dynamic = "force-dynamic";

/**
 * Who gets each automated email, and the test mode that redirects all of it.
 *
 * GET  — every event with its effective recipients, plus the test-mode row.
 * PUT  — save one event's recipients, or the test-mode settings.
 *
 * Admin only. Changing who receives the engineering release, or pointing the
 * whole system at a set of test inboxes, should not require a deploy.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/auth";
import { NOTIFICATION_ROLES, type NotificationRole } from "@/lib/notification-events";
import {
  loadAllRoutes,
  loadTestMode,
  saveRouteOverride,
  saveTestMode,
  type RouteOverride,
} from "@/lib/notification-routing";

const asRoles = (v: unknown): NotificationRole[] =>
  Array.isArray(v) ? v.filter((r): r is NotificationRole => NOTIFICATION_ROLES.includes(r as NotificationRole)) : [];

/** Addresses, one per line or comma-separated, cleaned and de-duplicated. */
const asAddresses = (v: unknown): string[] => {
  const raw = Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(/[,\n]/) : [];
  const out: string[] = [];
  for (const item of raw) {
    const a = item.trim();
    if (!a) continue;
    if (!a.includes("@")) continue; // not an address; drop it rather than mail into the void
    if (!out.some((x) => x.toLowerCase() === a.toLowerCase())) out.push(a);
  }
  return out;
};

export async function GET() {
  const guard = await guardApi(["admin"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const [routes, testMode] = await Promise.all([loadAllRoutes(), loadTestMode(true)]);
  return NextResponse.json({ routes, testMode });
}

export async function PUT(req: NextRequest) {
  const guard = await guardApi(["admin"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await req.json();

  if (body?.testMode) {
    const addresses: Partial<Record<NotificationRole, string>> = {};
    for (const role of NOTIFICATION_ROLES) {
      const a = asAddresses(body.testMode.addresses?.[role])[0];
      if (a) addresses[role] = a;
    }
    const fallback = asAddresses(body.testMode.fallback)[0] ?? null;
    if (body.testMode.active && !fallback) {
      return NextResponse.json(
        { error: "Test mode needs a fallback address — it is where any email with no role mapping goes." },
        { status: 400 },
      );
    }
    await saveTestMode({ active: !!body.testMode.active, addresses, fallback });
    return NextResponse.json({ ok: true });
  }

  if (body?.route?.event_key) {
    const route: RouteOverride = {
      event_key: String(body.route.event_key),
      to_roles: asRoles(body.route.to_roles),
      to_fixed: asAddresses(body.route.to_fixed),
      cc_roles: asRoles(body.route.cc_roles),
      cc_fixed: asAddresses(body.route.cc_fixed),
      enabled: body.route.enabled !== false,
    };
    if (route.enabled && route.to_roles.length === 0 && route.to_fixed.length === 0) {
      return NextResponse.json(
        { error: "An enabled email needs at least one recipient. Turn it off instead if it should not send." },
        { status: 400 },
      );
    }
    await saveRouteOverride(route);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
}
