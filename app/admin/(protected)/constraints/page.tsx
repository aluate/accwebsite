import { requireRole } from "@/lib/auth";
import ConstraintsClient from "@/components/ConstraintsClient";

export const dynamic = "force-dynamic";

export default async function ConstraintsPage() {
  await requireRole("admin");
  return <ConstraintsClient />;
}
