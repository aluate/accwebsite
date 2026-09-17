import { requireRole } from "@/lib/auth";
import ConstraintsClient from "@/components/ConstraintsClient";

import { requireCap } from "@/lib/permissions";
export const dynamic = "force-dynamic";

export default async function ConstraintsPage() {
  await requireCap("catalog.edit");
  return <ConstraintsClient />;
}
