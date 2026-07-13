export const dynamic = "force-dynamic";

import { requireBuilder } from "@/lib/auth";
import { BugLogClient } from "@/components/BugLogClient";

export default async function BugsPage() {
  const builder = await requireBuilder();
  if (builder.role !== "admin") {
    return <p className="p-8 text-white/50">Admin access required.</p>;
  }
  return <BugLogClient />;
}
