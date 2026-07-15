/**
 * lib/punch-auth.ts
 *
 * Universal auth helper for punch list routes.
 * Returns a normalized actor for any valid session type:
 *   - Internal builder account (PM, admin, engineer, shop, installer)
 *   - Builder portal account
 *
 * Returns null if no valid session found.
 */

import { getBuilder } from "@/lib/auth";
import { getPortalUser } from "@/lib/portal-auth";

export type PunchActor = {
  name: string;
  role: string;       // internal role or "portal"
  isInternal: boolean; // true = builder_accounts, false = portal
  canManage: boolean;  // can edit status, delete, reopen
};

export async function getPunchActor(): Promise<PunchActor | null> {
  // Try internal session first
  const builder = await getBuilder();
  if (builder) {
    return {
      name: builder.name,
      role: builder.role,
      isInternal: true,
      canManage: ["admin", "pm"].includes(builder.role),
    };
  }

  // Try portal session
  const portal = await getPortalUser();
  if (portal) {
    return {
      name: portal.display_name ?? portal.contact_email ?? "Builder",
      role: "portal",
      isInternal: false,
      canManage: false,
    };
  }

  return null;
}
