import { requireRole } from "@/lib/auth";
import PipelineClient from "@/components/PipelineClient";

export default async function PipelinePage() {
  await requireRole("admin");
  return <PipelineClient />;
}
