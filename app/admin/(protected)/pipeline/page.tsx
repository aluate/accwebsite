import { requireRole } from "@/lib/auth";
import PipelineClient from "@/components/PipelineClient";

import { requireCap } from "@/lib/permissions";
export default async function PipelinePage() {
  await requireCap("jobs.edit");
  return <PipelineClient />;
}
