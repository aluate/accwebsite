export const dynamic = "force-dynamic";

import { requireBuilder } from "@/lib/auth";
import { AdminScheduleClient } from "@/components/AdminScheduleClient";

export default async function AdminSchedulePage() {
  const builder = await requireBuilder();
  if (builder.role !== "admin" && builder.role !== "karl") {
    return <p className="p-8 text-white/50">Admin access required.</p>;
  }
  return <AdminScheduleClient />;
}
