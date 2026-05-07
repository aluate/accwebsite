import { redirect } from "next/navigation";
import { requireBuilder } from "@/lib/auth";

// /express → redirect authenticated builders straight to the wizard
export default async function ExpressIndexPage() {
  await requireBuilder();
  redirect("/express/new");
}
