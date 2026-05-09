/**
 * lib/signoff.ts — Client signoff helpers.
 *
 * Generates secure tokens for the homegrown e-sig flow.
 * Token URL pattern: /signoff/[token]
 */
import { randomBytes } from "crypto";

/** 48-character URL-safe hex token */
export function generateSignoffToken(): string {
  return randomBytes(24).toString("hex");
}

/** Base URL for signoff links — uses NEXT_PUBLIC_SITE_URL if set, otherwise advancedcabinets.org */
export function signoffUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://www.advancedcabinets.org";
  return `${base}/signoff/${token}`;
}
