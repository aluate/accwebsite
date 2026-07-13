import { requireRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { EstimateSettingsClient } from "@/components/EstimateSettingsClient";

export default async function EstimateSettingsPage() {
  await requireRole("admin");

  const rows = await sql`SELECT * FROM estimate_settings WHERE id = 'singleton'`;
  const settings = rows[0] ?? null;

  return <EstimateSettingsClient settings={settings} />;
}
