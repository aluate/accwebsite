export const dynamic = "force-dynamic";

import { requireBuilder } from "@/lib/auth";
import { BugLogClient } from "@/components/BugLogClient";

import { requireCap } from "@/lib/permissions";
export default async function BugsPage() {
  await requireCap("bugs.view");
  const builder = await requireBuilder();
  if (builder.role !== "admin" && builder.role !== "karl") {
    return <p className="p-8 text-white/50">Admin access required.</p>;
  }
  return <BugLogClient />;
}
