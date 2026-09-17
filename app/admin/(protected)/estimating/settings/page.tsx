import { requireRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { EstimateSettingsClient } from "@/components/EstimateSettingsClient";

import { requireCap } from "@/lib/permissions";
export default async function EstimateSettingsPage() {
  await requireCap("estimating.setup");

  const rows = await sql`SELECT * FROM estimate_settings WHERE id = 'singleton'`;
  const settings = rows[0] ?? null;

  return <EstimateSettingsClient settings={settings} />;
}
